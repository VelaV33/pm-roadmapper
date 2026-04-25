// supabase/functions/integrations-webhook/index.ts
// Inbound webhook receiver for all 5 providers. verify_jwt = false because
// these are signed by the provider — we verify each provider's signature
// scheme inside the handler before doing any work.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSha256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyGitHubSig(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get("X-Hub-Signature-256") || "";
  const secret = Deno.env.get("GITHUB_WEBHOOK_SECRET") || "";
  if (!secret || !sig.startsWith("sha256=")) return false;
  const expected = "sha256=" + await hmacSha256(secret, body);
  return constantTimeEqual(sig, expected);
}

async function verifySlackSig(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get("X-Slack-Signature") || "";
  const ts = req.headers.get("X-Slack-Request-Timestamp") || "";
  const secret = Deno.env.get("SLACK_SIGNING_SECRET") || "";
  if (!secret || !sig.startsWith("v0=")) return false;
  // Reject timestamps older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > 300) return false;
  const expected = "v0=" + await hmacSha256(secret, `v0:${ts}:${body}`);
  return constantTimeEqual(sig, expected);
}

async function verifyAsanaSig(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get("X-Hook-Signature") || "";
  const secret = Deno.env.get("ASANA_WEBHOOK_SECRET") || "";
  if (!secret || !sig) return false;
  const expected = await hmacSha256(secret, body);
  return constantTimeEqual(sig, expected);
}

async function verifyLinearSig(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get("Linear-Signature") || "";
  const secret = Deno.env.get("LINEAR_WEBHOOK_SECRET") || "";
  if (!secret || !sig) return false;
  const expected = await hmacSha256(secret, body);
  return constantTimeEqual(sig, expected);
}

async function verifyJiraSig(req: Request, _body: string): Promise<boolean> {
  // Jira Cloud doesn't sign by default; instead we use a secret query param
  // matched against JIRA_WEBHOOK_SECRET. Accept the hook iff the param matches.
  const url = new URL(req.url);
  const tokenParam = url.searchParams.get("secret") || "";
  const secret = Deno.env.get("JIRA_WEBHOOK_SECRET") || "";
  if (!secret) return false;
  return constantTimeEqual(tokenParam, secret);
}

// ── Apply a single webhook event to the user's data ──────────────────────
async function applyWebhookEvent(
  supabase: SupabaseClient,
  provider: string,
  externalId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  // Find the mapping (idempotent updates)
  const { data: mapping } = await supabase
    .from("integration_mappings")
    .select("id, user_id, connection_id, ros_entity_id, ros_entity_type")
    .eq("external_id", externalId)
    .maybeSingle();
  if (!mapping) {
    // No mapping yet — webhook arrived before initial import. Log and skip;
    // the next import sync will pick it up.
    console.log(`[webhook] no mapping for ${provider}#${externalId}, skipping`);
    return;
  }

  // Pull the user's blob
  const { data: blobRow } = await supabase
    .from("roadmap_data")
    .select("data")
    .eq("user_id", mapping.user_id)
    .maybeSingle();
  const data = (blobRow?.data || {}) as Record<string, unknown>;

  if (mapping.ros_entity_type === "task" && Array.isArray(data.projectPlans)) {
    for (const plan of data.projectPlans as Array<{ tasks?: unknown[] }>) {
      const tasks = (plan.tasks || []) as Array<Record<string, unknown>>;
      const t = tasks.find((x) => x.id === mapping.ros_entity_id);
      if (t) Object.assign(t, patch);
    }
  } else if (mapping.ros_entity_type === "row" && Array.isArray(data.rows)) {
    const rows = data.rows as Array<Record<string, unknown>>;
    const r = rows.find((x) => x.id === mapping.ros_entity_id);
    if (r) Object.assign(r, patch);
  }

  await supabase
    .from("roadmap_data")
    .upsert(
      { user_id: mapping.user_id, data, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  await supabase.from("integration_sync_log").insert({
    connection_id: mapping.connection_id,
    user_id: mapping.user_id,
    action: "update_import",
    entity_type: mapping.ros_entity_type,
    ros_entity_id: mapping.ros_entity_id,
    external_id: externalId,
    status: "success",
    details: { source: "webhook", patch },
  });

  await supabase.from("integration_mappings").update({
    last_synced_at: new Date().toISOString(),
  }).eq("id", mapping.id);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace("/integrations-webhook", "");
  const m = path.match(/^\/webhook\/(\w+)\/?$/);
  if (!m) return jsonResponse({ error: "Not found" }, 404);
  const provider = m[1];

  const body = await req.text();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    let verified = false;
    if (provider === "github") verified = await verifyGitHubSig(req, body);
    else if (provider === "slack") verified = await verifySlackSig(req, body);
    else if (provider === "asana") verified = await verifyAsanaSig(req, body);
    else if (provider === "linear") verified = await verifyLinearSig(req, body);
    else if (provider === "jira") verified = await verifyJiraSig(req, body);
    else return jsonResponse({ error: "Unknown provider" }, 400);

    // Slack URL verification challenge — return early before signature check
    // bites. (challenge requests still include a signed body.)
    if (provider === "slack") {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(body); } catch { /* ignore */ }
      if (parsed.type === "url_verification" && parsed.challenge) {
        return new Response(String(parsed.challenge), { status: 200 });
      }
    }
    // Asana hook handshake: first POST contains X-Hook-Secret which we must
    // echo back. The signature isn't set yet on the handshake.
    if (provider === "asana" && req.headers.get("X-Hook-Secret")) {
      return new Response("", {
        status: 200,
        headers: { "X-Hook-Secret": req.headers.get("X-Hook-Secret")! },
      });
    }

    if (!verified) {
      console.warn(`[webhook] ${provider} signature failed`);
      return jsonResponse({ error: "Signature verification failed" }, 401);
    }

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(body); } catch { /* ignore */ }

    // Provider-specific payload extraction
    if (provider === "github") {
      const issue = (parsed as { issue?: { id?: number; title?: string; state?: string; body?: string } }).issue;
      if (issue && issue.id) {
        await applyWebhookEvent(supabase, provider, String(issue.id), {
          name: issue.title,
          notes: issue.body,
          status: issue.state === "closed" ? "done" : "not-started",
        });
      }
    } else if (provider === "jira") {
      const issue = (parsed as { issue?: { id?: string; key?: string; fields?: Record<string, unknown> } }).issue;
      if (issue && issue.id) {
        const fields = issue.fields || {};
        await applyWebhookEvent(supabase, provider, String(issue.id), {
          name: fields.summary as string,
          notes: typeof fields.description === "string" ? fields.description : "",
          status: ((fields.status as { name?: string })?.name === "Done") ? "done" : "in-progress",
        });
      }
    } else if (provider === "asana") {
      // Asana sends an `events` array
      const events = (parsed as { events?: Array<{ resource?: { gid?: string }; action?: string }> }).events || [];
      for (const ev of events) {
        if (ev.resource?.gid) {
          await applyWebhookEvent(supabase, provider, ev.resource.gid, {
            // Webhook doesn't include full body — mark for re-fetch on next sync
            _needsFullSync: true,
          });
        }
      }
    } else if (provider === "linear") {
      const dat = (parsed as { type?: string; data?: { id?: string; title?: string; state?: { name?: string } }}).data;
      if (dat?.id) {
        await applyWebhookEvent(supabase, provider, dat.id, {
          name: dat.title,
          status: dat.state?.name === "Done" ? "done" : "in-progress",
        });
      }
    } else if (provider === "slack") {
      // Slack message events flow into the feedback inbox per spec.
      const event = (parsed as { event?: { type?: string; channel?: string; user?: string; text?: string; ts?: string } }).event;
      if (event && event.type === "message" && event.text) {
        // Look up which user owns this Slack channel via integration_connections.config.channelId
        const { data: conn } = await supabase
          .from("integration_connections")
          .select("user_id, target_entity, config")
          .eq("provider", "slack")
          .filter("config->>channelId", "eq", event.channel || "")
          .maybeSingle();
        if (conn) {
          // Append a feedback row
          const { data: blobRow } = await supabase.from("roadmap_data").select("data").eq("user_id", conn.user_id).maybeSingle();
          const data = (blobRow?.data || {}) as Record<string, unknown>;
          if (!Array.isArray(data.feedbackInbox)) data.feedbackInbox = [];
          (data.feedbackInbox as Array<Record<string, unknown>>).push({
            id: "fb_slack_" + Date.now(),
            source: "slack",
            text: event.text,
            user: event.user,
            ts: event.ts,
            createdAt: new Date().toISOString(),
          });
          await supabase.from("roadmap_data").upsert(
            { user_id: conn.user_id, data, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
        }
      }
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("[integrations-webhook] unhandled:", (e as Error).message);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
