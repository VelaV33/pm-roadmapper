// supabase/functions/integrations-sync/index.ts
// Imports / exports / bidirectional sync between Roadmap OS and external
// providers. JWT-protected (verify_jwt = true) — only the owner can sync
// their own integrations.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SyncItem {
  externalId: string;
  externalKey?: string;
  externalUrl?: string;
  title: string;
  description?: string;
  status: string;          // 'todo' | 'in_progress' | 'done' | 'blocked'
  priority?: string;       // 'high' | 'medium' | 'low'
  assignee?: string;
  dueDate?: string;
  labels?: string[];
  estimatedHours?: number;
  updatedAt: string;
}

interface Connection {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  config: Record<string, unknown>;
  sync_direction: "import" | "export" | "bidirectional";
  target_entity: "initiatives" | "tasks" | "feedback";
  target_section_id: string | null;
  target_plan_id: string | null;
}

const STATUS_MAP: Record<string, Record<string, string>> = {
  jira: {
    "To Do": "todo",
    "In Progress": "in_progress",
    "Done": "done",
    "Blocked": "blocked",
  },
  github: { open: "todo", closed: "done" },
  asana: { incomplete: "todo", complete: "done" },
  linear: {
    Backlog: "todo",
    Todo: "todo",
    "In Progress": "in_progress",
    Done: "done",
    Canceled: "done",
  },
  // Planner has no native string statuses — we map percentComplete numerically
  // in plannerStatusFromPercent(). Kept here for symmetry / lookup safety.
  teams: {
    "0": "todo",
    "50": "in_progress",
    "100": "done",
  },
};

// Microsoft Planner uses percentComplete (0/50/100). Planner has no "blocked".
function plannerStatusFromPercent(pc: number | null | undefined): string {
  if (typeof pc !== "number") return "todo";
  if (pc >= 100) return "done";
  if (pc >= 50) return "in_progress";
  return "todo";
}

function plannerPercentFromStatus(status: string): number {
  if (status === "done") return 100;
  if (status === "in_progress") return 50;
  return 0;
}

function normalizeStatus(provider: string, raw: string): string {
  const map = STATUS_MAP[provider] || {};
  return map[raw] || "todo";
}

function normalizePriority(raw: string | number | null | undefined): string {
  if (!raw && raw !== 0) return "medium";
  const s = String(raw).toLowerCase();
  if (["highest", "critical", "urgent", "p0", "p1", "high", "1", "2"].some((k) => s.includes(k))) return "high";
  if (["lowest", "low", "p3", "5"].some((k) => s.includes(k))) return "low";
  return "medium";
}

async function md5(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hashBuffer = await crypto.subtle.digest("MD5", data).catch(async () => {
    // SubtleCrypto may not support MD5 in some Deno versions — fall back to SHA-256
    return await crypto.subtle.digest("SHA-256", data);
  });
  const arr = Array.from(new Uint8Array(hashBuffer));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function syncHash(item: SyncItem): Promise<string> {
  return md5(
    [item.title, item.description || "", item.status, item.priority || "", item.dueDate || ""].join("|"),
  );
}

// ── Token refresh (Jira + Asana support refresh tokens) ──────────────────
async function refreshTokenIfNeeded(supabase: SupabaseClient, conn: Connection): Promise<Connection> {
  if (!conn.token_expires_at || !conn.refresh_token) return conn;
  const expMs = new Date(conn.token_expires_at).getTime();
  if (expMs - Date.now() > 60_000) return conn; // > 60s left

  const refreshUrls: Record<string, string> = {
    jira: "https://auth.atlassian.com/oauth/token",
    asana: "https://app.asana.com/-/oauth_token",
    linear: "https://api.linear.app/oauth/token",
    teams: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  };
  const tokenUrl = refreshUrls[conn.provider];
  if (!tokenUrl) return conn;

  const clientIdEnv = `${conn.provider.toUpperCase()}_CLIENT_ID`;
  const clientSecretEnv = `${conn.provider.toUpperCase()}_CLIENT_SECRET`;
  const clientId = Deno.env.get(clientIdEnv);
  const clientSecret = Deno.env.get(clientSecretEnv);
  if (!clientId || !clientSecret) return conn;

  // Microsoft requires `scope` on refresh as well — re-use the same scope
  // string used during /authorize.
  const teamsScope = "User.Read offline_access Channel.ReadBasic.All ChannelMessage.Send Group.Read.All Tasks.ReadWrite Team.ReadBasic.All";

  try {
    const refreshBody: Record<string, string> = {
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
    };
    if (conn.provider === "teams") refreshBody.scope = teamsScope;

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(refreshBody).toString(),
    });
    const data = await res.json();
    if (!data.access_token) return conn;

    const newExp = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

    await supabase
      .from("integration_connections")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || conn.refresh_token,
        token_expires_at: newExp,
      })
      .eq("id", conn.id);

    return {
      ...conn,
      access_token: data.access_token,
      refresh_token: data.refresh_token || conn.refresh_token,
      token_expires_at: newExp,
    };
  } catch (e) {
    console.warn("[sync] token refresh failed:", (e as Error).message);
    return conn;
  }
}

// ── Provider fetchers ────────────────────────────────────────────────────
async function fetchJiraItems(conn: Connection): Promise<SyncItem[]> {
  const cfg = conn.config as { cloudId?: string; projectKey?: string };
  if (!cfg.cloudId) return [];
  const jql = cfg.projectKey ? `project=${cfg.projectKey}` : "";
  const out: SyncItem[] = [];
  let startAt = 0;
  const max = 50;
  while (true) {
    const params = new URLSearchParams({
      jql,
      startAt: String(startAt),
      maxResults: String(max),
      fields: "summary,description,status,priority,assignee,duedate,labels,updated",
    });
    const url = `https://api.atlassian.com/ex/jira/${cfg.cloudId}/rest/api/3/search?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${conn.access_token}`, Accept: "application/json" },
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (!res.ok) throw new Error(`Jira ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const issue of data.issues || []) {
      out.push({
        externalId: issue.id,
        externalKey: issue.key,
        externalUrl: `${(conn.config as { siteUrl?: string }).siteUrl}/browse/${issue.key}`,
        title: issue.fields.summary || "(no title)",
        description: typeof issue.fields.description === "string" ? issue.fields.description : "",
        status: normalizeStatus("jira", issue.fields.status?.name || "To Do"),
        priority: normalizePriority(issue.fields.priority?.name),
        assignee: issue.fields.assignee?.emailAddress || issue.fields.assignee?.displayName,
        dueDate: issue.fields.duedate || undefined,
        labels: issue.fields.labels || [],
        updatedAt: issue.fields.updated || new Date().toISOString(),
      });
    }
    if ((data.issues || []).length < max) break;
    startAt += max;
    if (startAt > 1000) break; // safety cap
  }
  return out;
}

async function fetchGitHubItems(conn: Connection): Promise<SyncItem[]> {
  const cfg = conn.config as { owner?: string; repo?: string };
  if (!cfg.owner || !cfg.repo) return [];
  const out: SyncItem[] = [];
  let page = 1;
  while (page < 20) {
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/issues?state=all&per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${conn.access_token}`, Accept: "application/vnd.github+json" },
    });
    if (res.status === 429 || res.status === 403) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    const issues = await res.json();
    if (!Array.isArray(issues) || !issues.length) break;
    for (const issue of issues) {
      if (issue.pull_request) continue; // skip PRs
      out.push({
        externalId: String(issue.id),
        externalKey: `#${issue.number}`,
        externalUrl: issue.html_url,
        title: issue.title,
        description: issue.body || "",
        status: normalizeStatus("github", issue.state),
        priority: normalizePriority((issue.labels || []).map((l: { name: string }) => l.name).join(",")),
        assignee: issue.assignee?.login,
        labels: (issue.labels || []).map((l: { name: string }) => l.name),
        updatedAt: issue.updated_at,
      });
    }
    if (issues.length < 100) break;
    page++;
  }
  return out;
}

async function fetchAsanaItems(conn: Connection): Promise<SyncItem[]> {
  const cfg = conn.config as { projectGid?: string };
  if (!cfg.projectGid) return [];
  const out: SyncItem[] = [];
  let offset = "";
  while (out.length < 1000) {
    const params = new URLSearchParams({
      opt_fields: "name,notes,completed,due_on,assignee.name,assignee.email,modified_at,tags.name",
      limit: "100",
    });
    if (offset) params.set("offset", offset);
    const url = `https://app.asana.com/api/1.0/projects/${cfg.projectGid}/tasks?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${conn.access_token}` },
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (!res.ok) throw new Error(`Asana ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const task of data.data || []) {
      out.push({
        externalId: task.gid,
        externalUrl: `https://app.asana.com/0/${cfg.projectGid}/${task.gid}`,
        title: task.name || "(no title)",
        description: task.notes || "",
        status: normalizeStatus("asana", task.completed ? "complete" : "incomplete"),
        priority: "medium",
        assignee: task.assignee?.email || task.assignee?.name,
        dueDate: task.due_on || undefined,
        labels: (task.tags || []).map((t: { name: string }) => t.name),
        updatedAt: task.modified_at || new Date().toISOString(),
      });
    }
    offset = data.next_page?.offset || "";
    if (!offset) break;
  }
  return out;
}

async function fetchLinearItems(conn: Connection): Promise<SyncItem[]> {
  const cfg = conn.config as { teamId?: string };
  if (!cfg.teamId) return [];
  const query = `query Issues($teamId: ID!) {
    issues(filter: { team: { id: { eq: $teamId } } }, first: 250) {
      nodes {
        id identifier title description state { name } priority
        assignee { email name } dueDate labels { nodes { name } }
        url updatedAt estimate
      }
    }
  }`;
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: conn.access_token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { teamId: cfg.teamId } }),
  });
  if (!res.ok) throw new Error(`Linear ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const out: SyncItem[] = [];
  for (const issue of data.data?.issues?.nodes || []) {
    out.push({
      externalId: issue.id,
      externalKey: issue.identifier,
      externalUrl: issue.url,
      title: issue.title,
      description: issue.description || "",
      status: normalizeStatus("linear", issue.state?.name || "Todo"),
      priority: normalizePriority(issue.priority),
      assignee: issue.assignee?.email || issue.assignee?.name,
      dueDate: issue.dueDate || undefined,
      labels: (issue.labels?.nodes || []).map((l: { name: string }) => l.name),
      estimatedHours: issue.estimate || undefined,
      updatedAt: issue.updatedAt,
    });
  }
  return out;
}

// ── Microsoft Graph helpers (used by Planner sync + Teams notifications) ──
async function graphFetch(
  url: string,
  token: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const res = await fetch(url, { ...init, headers });
  if (res.status === 429 && attempt < 3) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
    await new Promise((r) => setTimeout(r, Math.max(1, retryAfter) * 1000));
    return graphFetch(url, token, init, attempt + 1);
  }
  return res;
}

async function fetchTeamsItems(conn: Connection): Promise<SyncItem[]> {
  const cfg = conn.config as { planId?: string };
  if (!cfg.planId) return [];
  const out: SyncItem[] = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/planner/plans/${encodeURIComponent(cfg.planId)}/tasks`;
  let pages = 0;
  while (url && pages < 20) {
    const res = await graphFetch(url, conn.access_token);
    if (!res.ok) throw new Error(`Teams ${res.status}: ${await res.text()}`);
    const data = await res.json() as {
      value?: Array<Record<string, unknown>>;
      "@odata.nextLink"?: string;
    };
    for (const task of (data.value || [])) {
      const t = task as {
        id?: string;
        title?: string;
        percentComplete?: number;
        assignments?: Record<string, unknown>;
        dueDateTime?: string;
        appliedCategories?: Record<string, unknown>;
        orderHint?: string;
        planId?: string;
        bucketId?: string;
      };
      const assigneeKeys = t.assignments ? Object.keys(t.assignments) : [];
      const labelKeys = t.appliedCategories ? Object.keys(t.appliedCategories) : [];
      out.push({
        externalId: t.id || "",
        externalKey: t.orderHint ? `#${String(t.orderHint).split(" ")[0].slice(0, 8)}` : undefined,
        // Planner has no public canonical URL per task — link the plan board.
        externalUrl: t.planId ? `https://tasks.office.com/_#/plantaskboard/${encodeURIComponent(t.planId)}` : undefined,
        title: t.title || "(no title)",
        // Skip the per-task /details fetch — it doubles request count and Graph
        // throttling makes it slow. Fall back to title for description.
        description: t.title || "",
        status: plannerStatusFromPercent(t.percentComplete),
        priority: "medium",
        assignee: assigneeKeys[0] || undefined,
        dueDate: t.dueDateTime ? String(t.dueDateTime).slice(0, 10) : undefined,
        labels: labelKeys,
        updatedAt: new Date().toISOString(),
      });
    }
    url = data["@odata.nextLink"] || null;
    pages++;
  }
  return out;
}

// Push a single Roadmap OS task back to Microsoft Planner. Planner PATCH
// requires the current @odata.etag in an If-Match header.
async function applyExportToPlanner(
  conn: Connection,
  item: SyncItem,
  externalId?: string,
): Promise<{ id: string; key?: string; url?: string } | null> {
  const cfg = conn.config as { planId?: string };
  if (!cfg.planId) return null;

  if (externalId) {
    // Update path — fetch first to obtain the etag.
    const getRes = await graphFetch(
      `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(externalId)}`,
      conn.access_token,
    );
    if (!getRes.ok) return null;
    const existing = await getRes.json() as { "@odata.etag"?: string };
    const etag = existing["@odata.etag"];
    if (!etag) return null;
    const patchRes = await graphFetch(
      `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(externalId)}`,
      conn.access_token,
      {
        method: "PATCH",
        headers: { "If-Match": etag, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          percentComplete: plannerPercentFromStatus(item.status),
          dueDateTime: item.dueDate ? new Date(item.dueDate).toISOString() : null,
        }),
      },
    );
    if (!patchRes.ok) return null;
    return { id: externalId, url: `https://tasks.office.com/_#/plantaskboard/${encodeURIComponent(cfg.planId)}` };
  }

  // Create path — POST /planner/tasks with planId.
  const createRes = await graphFetch(
    "https://graph.microsoft.com/v1.0/planner/tasks",
    conn.access_token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: cfg.planId,
        title: item.title,
        percentComplete: plannerPercentFromStatus(item.status),
        dueDateTime: item.dueDate ? new Date(item.dueDate).toISOString() : undefined,
      }),
    },
  );
  if (!createRes.ok) return null;
  const created = await createRes.json() as { id?: string };
  if (!created.id) return null;
  return {
    id: created.id,
    url: `https://tasks.office.com/_#/plantaskboard/${encodeURIComponent(cfg.planId)}`,
  };
}

// Post an HTML message to a Microsoft Teams channel. Phase 1 helper —
// the renderer-side hook that auto-fires this on initiative status change
// is documented in TEAMS_INTEGRATION.md as Phase 2.
export async function postTeamsNotification(
  conn: Connection,
  message: string,
): Promise<{ ok: boolean; status: number; body?: string }> {
  const cfg = conn.config as {
    notificationTeamId?: string;
    notificationChannelId?: string;
  };
  if (!cfg.notificationTeamId || !cfg.notificationChannelId) {
    return { ok: false, status: 0, body: "Teams notification target not configured" };
  }
  const url = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(cfg.notificationTeamId)}/channels/${encodeURIComponent(cfg.notificationChannelId)}/messages`;
  const res = await graphFetch(url, conn.access_token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body: { contentType: "html", content: message },
    }),
  });
  const body = res.ok ? undefined : await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function fetchExternalItems(conn: Connection): Promise<SyncItem[]> {
  switch (conn.provider) {
    case "jira": return fetchJiraItems(conn);
    case "github": return fetchGitHubItems(conn);
    case "asana": return fetchAsanaItems(conn);
    case "linear": return fetchLinearItems(conn);
    case "teams": return fetchTeamsItems(conn);
    default: return []; // slack is webhook-driven
  }
}

// ── Push back to external (export path) ──────────────────────────────────
async function pushItemToProvider(conn: Connection, item: SyncItem, externalId?: string): Promise<{ id?: string; key?: string; url?: string } | null> {
  // Per-provider export. Most providers are stubbed pending dedicated
  // implementations; Teams (Planner) is the first wired path because the
  // sync-back is needed for status-change propagation.
  if (conn.provider === "teams") {
    return await applyExportToPlanner(conn, item, externalId);
  }
  // Other providers: record exports in the sync log only.
  return null;
}

// ── Apply imported items into the user's roadmap_data blob ───────────────
async function applyImportToBlob(
  supabase: SupabaseClient,
  conn: Connection,
  items: SyncItem[],
): Promise<{ imported: number; updated: number }> {
  // Pull current blob
  const { data: blobRow } = await supabase
    .from("roadmap_data")
    .select("data")
    .eq("user_id", conn.user_id)
    .maybeSingle();
  const data = (blobRow?.data || {}) as Record<string, unknown>;

  // Pull existing mappings to avoid creating duplicates
  const { data: existing } = await supabase
    .from("integration_mappings")
    .select("external_id, ros_entity_id, sync_hash")
    .eq("connection_id", conn.id);
  const mapByExternal = new Map<string, { ros_entity_id: string; sync_hash: string | null }>();
  for (const m of existing || []) {
    mapByExternal.set(m.external_id, { ros_entity_id: m.ros_entity_id, sync_hash: m.sync_hash });
  }

  let imported = 0;
  let updated = 0;
  const now = new Date().toISOString();

  if (conn.target_entity === "tasks" && conn.target_plan_id) {
    if (!Array.isArray(data.projectPlans)) data.projectPlans = [];
    const plans = data.projectPlans as Array<{ id: string; tasks?: unknown[] }>;
    const plan = plans.find((p) => p.id === conn.target_plan_id);
    if (!plan) return { imported: 0, updated: 0 };
    if (!Array.isArray(plan.tasks)) plan.tasks = [];
    const tasks = plan.tasks as Array<Record<string, unknown>>;

    for (const item of items) {
      const hash = await syncHash(item);
      const existingMap = mapByExternal.get(item.externalId);
      const taskShape = {
        name: item.title,
        notes: item.description,
        status: ({ todo: "not-started", in_progress: "in-progress", done: "done", blocked: "blocked" })[item.status] || "not-started",
        owner: item.assignee || "",
        endDate: item.dueDate || "",
        labels: item.labels || [],
        priority: item.priority || "",
        durationDays: item.estimatedHours ? Math.max(1, Math.ceil(item.estimatedHours / 8)) : 1,
        externalKey: item.externalKey,
        externalUrl: item.externalUrl,
      };
      if (existingMap) {
        const t = tasks.find((x) => x.id === existingMap.ros_entity_id);
        if (t && existingMap.sync_hash !== hash) {
          Object.assign(t, taskShape, { updatedAt: now });
          updated++;
          await supabase.from("integration_mappings").update({
            sync_hash: hash, last_synced_at: now,
          }).eq("connection_id", conn.id).eq("external_id", item.externalId);
          await supabase.from("integration_sync_log").insert({
            connection_id: conn.id, user_id: conn.user_id, action: "update_import",
            entity_type: "task", ros_entity_id: existingMap.ros_entity_id,
            external_id: item.externalId, external_key: item.externalKey, status: "success",
          });
        }
      } else {
        const newId = "tsk_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        tasks.push({ id: newId, source: "external", ...taskShape, sortIndex: tasks.length });
        imported++;
        await supabase.from("integration_mappings").insert({
          connection_id: conn.id, user_id: conn.user_id,
          ros_entity_type: "task", ros_entity_id: newId,
          external_id: item.externalId, external_key: item.externalKey || null,
          external_url: item.externalUrl || null, sync_hash: hash, sync_direction: "imported",
        });
        await supabase.from("integration_sync_log").insert({
          connection_id: conn.id, user_id: conn.user_id, action: "import",
          entity_type: "task", ros_entity_id: newId,
          external_id: item.externalId, external_key: item.externalKey, status: "success",
        });
      }
    }
  } else {
    // Default: target_entity === 'initiatives' → roadmap rows
    if (!Array.isArray(data.rows)) data.rows = [];
    if (!Array.isArray(data.sections)) data.sections = [];
    const rows = data.rows as Array<Record<string, unknown>>;
    const sections = data.sections as Array<{ id: string; name: string; color?: string }>;

    let secId = conn.target_section_id;
    if (!secId) {
      // Auto-create or find a section labelled after the provider
      const provName = conn.provider.charAt(0).toUpperCase() + conn.provider.slice(1);
      let sec = sections.find((s) => s.name === `${provName} Imports`);
      if (!sec) {
        sec = { id: "sec_" + conn.provider + "_" + Date.now(), name: `${provName} Imports`, color: "#0F1B3D" };
        sections.push(sec);
      }
      secId = sec.id;
    }

    for (const item of items) {
      const hash = await syncHash(item);
      const existingMap = mapByExternal.get(item.externalId);
      const rowShape = {
        sec: secId,
        name: item.title,
        sub: item.description ? item.description.substring(0, 200) : "",
        priority: item.priority || "",
        bars: [], priorities: [], deliverables: [],
        externalKey: item.externalKey, externalUrl: item.externalUrl,
        labels: item.labels || [],
      };
      if (existingMap) {
        const r = rows.find((x) => x.id === existingMap.ros_entity_id);
        if (r && existingMap.sync_hash !== hash) {
          Object.assign(r, rowShape);
          updated++;
          await supabase.from("integration_mappings").update({
            sync_hash: hash, last_synced_at: now,
          }).eq("connection_id", conn.id).eq("external_id", item.externalId);
          await supabase.from("integration_sync_log").insert({
            connection_id: conn.id, user_id: conn.user_id, action: "update_import",
            entity_type: "row", ros_entity_id: existingMap.ros_entity_id,
            external_id: item.externalId, external_key: item.externalKey, status: "success",
          });
        }
      } else {
        const newId = "r_ext_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        rows.push({ id: newId, ...rowShape });
        imported++;
        await supabase.from("integration_mappings").insert({
          connection_id: conn.id, user_id: conn.user_id,
          ros_entity_type: "row", ros_entity_id: newId,
          external_id: item.externalId, external_key: item.externalKey || null,
          external_url: item.externalUrl || null, sync_hash: hash, sync_direction: "imported",
        });
        await supabase.from("integration_sync_log").insert({
          connection_id: conn.id, user_id: conn.user_id, action: "import",
          entity_type: "row", ros_entity_id: newId,
          external_id: item.externalId, external_key: item.externalKey, status: "success",
        });
      }
    }
  }

  // Persist updated blob
  await supabase
    .from("roadmap_data")
    .upsert({ user_id: conn.user_id, data, updated_at: now }, { onConflict: "user_id" });

  return { imported, updated };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace("/integrations-sync", "");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth: every route requires a verified user
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7).trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return jsonResponse({ error: "Invalid token" }, 401);
  const user = userData.user;

  try {
    const m = path.match(/^\/(import|export|sync)\/(\w+)\/?$/);
    if (!m) return jsonResponse({ error: "Not found" }, 404);
    const action = m[1] as "import" | "export" | "sync";
    const provider = m[2];

    const { data: conns } = await supabase
      .from("integration_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();
    if (!conns) return jsonResponse({ error: `Not connected to ${provider}` }, 404);

    let connection = conns as unknown as Connection;
    connection = await refreshTokenIfNeeded(supabase, connection);

    // Mark as syncing
    await supabase.from("integration_connections").update({ status: "syncing", sync_error: null })
      .eq("id", connection.id);

    let imported = 0, updated = 0, exported = 0, conflicts = 0, errors = 0;

    if (action === "import" || action === "sync") {
      if (connection.sync_direction === "export") {
        // skip import for export-only
      } else {
        try {
          const items = await fetchExternalItems(connection);
          const r = await applyImportToBlob(supabase, connection, items);
          imported = r.imported; updated = r.updated;
        } catch (e) {
          errors++;
          await supabase.from("integration_sync_log").insert({
            connection_id: connection.id, user_id: user.id, action: "error",
            entity_type: connection.target_entity, status: "failed",
            details: { error: (e as Error).message },
          });
          await supabase.from("integration_connections").update({
            sync_error: (e as Error).message,
          }).eq("id", connection.id);
        }
      }
    }

    if (action === "export" || action === "sync") {
      // Export path: enumerate mappings flagged as "exported" and push. The
      // first cut is a stub — log the intent but don't push to the provider.
      // pushItemToProvider() returns null today. Wired up so future provider
      // implementations slot in without touching the call site.
      const { data: maps } = await supabase
        .from("integration_mappings")
        .select("external_id, ros_entity_id")
        .eq("connection_id", connection.id);
      for (const _m of (maps || []).slice(0, 50)) {
        const pushed = await pushItemToProvider(connection, {
          externalId: _m.external_id, title: "", status: "todo", updatedAt: new Date().toISOString(),
        }, _m.external_id);
        if (pushed) exported++;
      }
    }

    // Mark connection as connected + last_synced
    await supabase.from("integration_connections").update({
      status: "connected",
      last_synced_at: new Date().toISOString(),
      sync_error: errors > 0 ? "Sync completed with errors" : null,
    }).eq("id", connection.id);

    return jsonResponse({ imported, updated, exported, conflicts, errors });
  } catch (e) {
    console.error("[integrations-sync] unhandled:", (e as Error).message);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
