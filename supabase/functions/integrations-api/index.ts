// supabase/functions/integrations-api/index.ts
// Frontend-facing CRUD: list provider projects, save sync config, view
// history, fetch entity mappings. JWT-required (verify_jwt = true).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Connection {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  config: Record<string, unknown>;
}

async function listJiraProjects(conn: Connection) {
  const cfg = conn.config as { cloudId?: string };
  if (!cfg.cloudId) return [];
  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${cfg.cloudId}/rest/api/3/project/search`,
    { headers: { Authorization: `Bearer ${conn.access_token}`, Accept: "application/json" } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.values || []).map((p: { id: string; key: string; name: string }) => ({
    id: p.key,
    name: p.name,
    extra: { id: p.id },
  }));
}

async function listGitHubRepos(conn: Connection) {
  const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
    headers: { Authorization: `Bearer ${conn.access_token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return [];
  const repos = await res.json();
  return (Array.isArray(repos) ? repos : []).map((r: { id: number; full_name: string; owner: { login: string }; name: string }) => ({
    id: r.full_name,
    name: r.full_name,
    extra: { owner: r.owner.login, repo: r.name, repoId: r.id },
  }));
}

async function listSlackChannels(conn: Connection) {
  const cfg = conn.config as { botToken?: string };
  const token = cfg.botToken || conn.access_token;
  const res = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.channels || []).map((c: { id: string; name: string }) => ({
    id: c.id,
    name: "#" + c.name,
    extra: {},
  }));
}

async function listAsanaProjects(conn: Connection) {
  const cfg = conn.config as { workspaces?: Array<{ gid: string; name: string }> };
  const ws = cfg.workspaces?.[0];
  if (!ws) return [];
  const res = await fetch(`https://app.asana.com/api/1.0/workspaces/${ws.gid}/projects?limit=100`, {
    headers: { Authorization: `Bearer ${conn.access_token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map((p: { gid: string; name: string }) => ({
    id: p.gid,
    name: p.name,
    extra: { workspaceGid: ws.gid },
  }));
}

async function listLinearTeams(conn: Connection) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: conn.access_token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ teams { nodes { id name key } } }" }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data?.teams?.nodes || []).map((t: { id: string; name: string; key: string }) => ({
    id: t.id,
    name: `${t.name} (${t.key})`,
    extra: {},
  }));
}

// ── Microsoft Graph helpers ─────────────────────────────────────────────
// Honour 429 throttling (Retry-After), follow @odata.nextLink up to 20 pages.
async function graphFetch(url: string, token: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 429 && attempt < 3) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
    await new Promise((r) => setTimeout(r, Math.max(1, retryAfter) * 1000));
    return graphFetch(url, token, attempt + 1);
  }
  return res;
}

async function graphCollect<T>(
  startUrl: string,
  token: string,
  mapItem: (raw: Record<string, unknown>) => T,
): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = startUrl;
  let pages = 0;
  while (url && pages < 20) {
    const res = await graphFetch(url, token);
    if (!res.ok) break;
    const data = await res.json() as { value?: Array<Record<string, unknown>>; "@odata.nextLink"?: string };
    for (const v of (data.value || [])) out.push(mapItem(v));
    url = data["@odata.nextLink"] || null;
    pages++;
  }
  return out;
}

async function listTeamsPlannerPlans(conn: Connection) {
  // GET /me/planner/plans returns Planner plans across all groups the user
  // belongs to. Each plan's `owner` field is the group (team) ID it lives in.
  return graphCollect<{ id: string; name: string; extra: Record<string, unknown> }>(
    "https://graph.microsoft.com/v1.0/me/planner/plans",
    conn.access_token,
    (plan) => ({
      id: plan.id as string,
      name: (plan.title as string) || "(untitled plan)",
      extra: { groupId: plan.owner as string | undefined },
    }),
  );
}

async function listTeamsJoinedTeams(conn: Connection) {
  // GET /me/joinedTeams returns groups the user is a member of (each is a "team").
  return graphCollect<{ id: string; name: string }>(
    "https://graph.microsoft.com/v1.0/me/joinedTeams",
    conn.access_token,
    (t) => ({
      id: t.id as string,
      name: (t.displayName as string) || "(untitled team)",
    }),
  );
}

async function listTeamsChannels(conn: Connection, teamId: string) {
  return graphCollect<{ id: string; name: string }>(
    `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels`,
    conn.access_token,
    (c) => ({
      id: c.id as string,
      name: (c.displayName as string) || "(untitled channel)",
    }),
  );
}

async function listProviderProjects(conn: Connection) {
  switch (conn.provider) {
    case "jira": return listJiraProjects(conn);
    case "github": return listGitHubRepos(conn);
    case "slack": return listSlackChannels(conn);
    case "asana": return listAsanaProjects(conn);
    case "linear": return listLinearTeams(conn);
    case "teams": return listTeamsPlannerPlans(conn);
    default: return [];
  }
}

async function getUser(req: Request, supabase: SupabaseClient) {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace("/integrations-api", "");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const user = await getUser(req, supabase);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    // GET /projects/:provider
    let m = path.match(/^\/projects\/(\w+)\/?$/);
    if (m && req.method === "GET") {
      const provider = m[1];
      const { data: conn } = await supabase
        .from("integration_connections")
        .select("id, user_id, provider, access_token, config")
        .eq("user_id", user.id).eq("provider", provider).maybeSingle();
      if (!conn) return jsonResponse({ projects: [] });
      const projects = await listProviderProjects(conn as Connection);
      return jsonResponse({ projects });
    }

    // GET /teams-list/teams — list the user's joined Microsoft Teams (groups).
    // Used by the Configure modal to populate the notification team selector.
    if (path.match(/^\/teams-list\/teams\/?$/) && req.method === "GET") {
      const { data: conn } = await supabase
        .from("integration_connections")
        .select("id, user_id, provider, access_token, config")
        .eq("user_id", user.id).eq("provider", "teams").maybeSingle();
      if (!conn) return jsonResponse({ teams: [] });
      const teams = await listTeamsJoinedTeams(conn as Connection);
      return jsonResponse({ teams });
    }

    // GET /teams-channels/:teamId/teams — list channels of a Microsoft Team.
    m = path.match(/^\/teams-channels\/([^/]+)\/teams\/?$/);
    if (m && req.method === "GET") {
      const teamId = decodeURIComponent(m[1]);
      const { data: conn } = await supabase
        .from("integration_connections")
        .select("id, user_id, provider, access_token, config")
        .eq("user_id", user.id).eq("provider", "teams").maybeSingle();
      if (!conn) return jsonResponse({ channels: [] });
      const channels = await listTeamsChannels(conn as Connection, teamId);
      return jsonResponse({ channels });
    }

    // PUT /configure/:provider
    m = path.match(/^\/configure\/(\w+)\/?$/);
    if (m && req.method === "PUT") {
      const provider = m[1];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.sync_direction) updates.sync_direction = body.sync_direction;
      if (body.sync_frequency) updates.sync_frequency = body.sync_frequency;
      if (body.target_entity) updates.target_entity = body.target_entity;
      if (body.target_section_id !== undefined) updates.target_section_id = body.target_section_id;
      if (body.target_plan_id !== undefined) updates.target_plan_id = body.target_plan_id;
      if (body.config) {
        // merge into existing config
        const { data: existing } = await supabase
          .from("integration_connections")
          .select("config")
          .eq("user_id", user.id).eq("provider", provider).maybeSingle();
        const merged = { ...(existing?.config || {}), ...body.config };
        updates.config = merged;
      }
      const { error } = await supabase
        .from("integration_connections")
        .update(updates)
        .eq("user_id", user.id)
        .eq("provider", provider);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    // POST /sync/:provider — proxy to integrations-sync
    m = path.match(/^\/sync\/(\w+)\/?$/);
    if (m && req.method === "POST") {
      const provider = m[1];
      const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
      const r = await fetch(`${SUPABASE_URL}/functions/v1/integrations-sync/sync/${provider}`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
      });
      const data = await r.json();
      return jsonResponse(data, r.status);
    }

    // GET /history/:provider
    m = path.match(/^\/history\/(\w+)\/?$/);
    if (m && req.method === "GET") {
      const provider = m[1];
      const { data: conn } = await supabase
        .from("integration_connections")
        .select("id")
        .eq("user_id", user.id).eq("provider", provider).maybeSingle();
      if (!conn) return jsonResponse({ history: [] });
      const { data: history } = await supabase
        .from("integration_sync_log")
        .select("action, entity_type, ros_entity_id, external_id, external_key, status, details, created_at")
        .eq("connection_id", conn.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return jsonResponse({ history: history || [] });
    }

    // GET /mappings/:provider
    m = path.match(/^\/mappings\/(\w+)\/?$/);
    if (m && req.method === "GET") {
      const provider = m[1];
      const { data: conn } = await supabase
        .from("integration_connections")
        .select("id")
        .eq("user_id", user.id).eq("provider", provider).maybeSingle();
      if (!conn) return jsonResponse({ mappings: [] });
      const { data: mappings } = await supabase
        .from("integration_mappings")
        .select("ros_entity_type, ros_entity_id, external_id, external_key, external_url, last_synced_at")
        .eq("connection_id", conn.id)
        .order("last_synced_at", { ascending: false })
        .limit(500);
      return jsonResponse({ mappings: mappings || [] });
    }

    return jsonResponse({ error: "Not found", path }, 404);
  } catch (e) {
    console.error("[integrations-api] unhandled:", (e as Error).message);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
