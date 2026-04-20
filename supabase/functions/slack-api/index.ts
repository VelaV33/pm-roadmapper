import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse, rateLimit } from "../_shared/auth.ts";

// Slack integration — single multi-action edge function.
//
// Actions (all require a verified JWT):
//   status            — { connected, workspaces[] } for the calling user.
//                       Returns only safe fields (team name, bot user id,
//                       connected_at). Tokens never leave the server.
//
//   oauth_exchange    — { code, redirect_uri }
//                       Exchanges the OAuth 2.0 code for a bot token via
//                       https://slack.com/api/oauth.v2.access, then upserts
//                       into user_integrations keyed on (user, 'slack', team_id).
//
//   disconnect        — { external_account_id }
//                       Deletes the stored token for that Slack workspace.
//                       Does NOT call Slack's auth.revoke — Slack admins can
//                       do that from their own side if they want a hard break.
//
//   post              — { external_account_id, channel, text, blocks? }
//                       Posts a message to a channel using the stored bot
//                       token. Rate-limited per user to stop runaway loops.
//
// Env vars (set in Supabase project secrets — Pass 2 by Velas):
//   SLACK_CLIENT_ID      — from api.slack.com app "Basic Information"
//   SLACK_CLIENT_SECRET  — same page, server-only
//
// If the env vars are missing, oauth_exchange returns a clear error so the
// UI can tell the user "the app isn't configured yet" instead of a 500.

const SLACK_CLIENT_ID     = Deno.env.get("SLACK_CLIENT_ID");
const SLACK_CLIENT_SECRET = Deno.env.get("SLACK_CLIENT_SECRET");

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: { id: string; name: string };
  authed_user?: { id: string };
  enterprise?: { id: string; name: string } | null;
  incoming_webhook?: { channel: string; channel_id: string; url: string };
}

interface SlackPostResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);
  const body = await req.json().catch(() => ({}));
  const { action } = body || {};

  // ── STATUS ─────────────────────────────────────────────────────────────
  if (action === "status" || !action) {
    const { data, error } = await supabase
      .from("user_integrations")
      .select("id, external_account_id, display_name, bot_user_id, scope, created_at")
      .eq("owner_user_id", user.id)
      .eq("provider", "slack")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[slack-api status] error:", error.message);
      return errorResponse("Failed to read integration status", 500);
    }
    const workspaces = (data || []).map((r) => ({
      id: r.id,
      team_id: r.external_account_id,
      name: r.display_name,
      bot_user_id: r.bot_user_id,
      scope: r.scope,
      connected_at: r.created_at,
    }));
    return jsonResponse({
      ok: true,
      connected: workspaces.length > 0,
      workspaces,
      configured: !!(SLACK_CLIENT_ID && SLACK_CLIENT_SECRET),
      // client_id is public by design — safe to send to the browser so the
      // renderer can build the OAuth authorize URL without a second round trip.
      client_id: SLACK_CLIENT_ID || null,
    });
  }

  // ── OAUTH EXCHANGE ─────────────────────────────────────────────────────
  if (action === "oauth_exchange") {
    if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
      return errorResponse(
        "Slack integration is not configured on this server. Ask the admin to set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.",
        503,
      );
    }
    const { code, redirect_uri } = body;
    if (!code || typeof code !== "string") return errorResponse("Missing code", 400);
    if (!redirect_uri || typeof redirect_uri !== "string") return errorResponse("Missing redirect_uri", 400);

    // Rate-limit to stop accidental loops if the callback page ever refires.
    await rateLimit("slack_oauth_exchange", user.id, 10, 3600);

    // Exchange code for tokens. Slack wants this as form-urlencoded POST.
    const form = new URLSearchParams();
    form.set("client_id", SLACK_CLIENT_ID);
    form.set("client_secret", SLACK_CLIENT_SECRET);
    form.set("code", code);
    form.set("redirect_uri", redirect_uri);

    let slackRes: SlackOAuthResponse;
    try {
      const res = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      slackRes = await res.json() as SlackOAuthResponse;
    } catch (e) {
      console.error("[slack-api oauth_exchange] network error:", (e as Error).message);
      return errorResponse("Could not reach Slack", 502);
    }

    if (!slackRes.ok || !slackRes.access_token || !slackRes.team?.id) {
      // Do NOT echo the raw Slack error into a user-visible message — some
      // errors leak client-id fragments. Log it, return a generic message.
      console.error("[slack-api oauth_exchange] slack error:", slackRes.error || "unknown");
      return errorResponse("Slack rejected the authorization. Please try again.", 400);
    }

    // Upsert keyed on (owner, provider, team_id). Re-connecting the same
    // workspace just refreshes the token.
    const upsertPayload = {
      owner_user_id:       user.id,
      provider:            "slack",
      external_account_id: slackRes.team.id,
      display_name:        slackRes.team.name || null,
      access_token:        slackRes.access_token,
      token_type:          slackRes.token_type || null,
      scope:               slackRes.scope || null,
      external_user_id:    slackRes.authed_user?.id || null,
      bot_user_id:         slackRes.bot_user_id || null,
      metadata: {
        app_id:           slackRes.app_id || null,
        enterprise:       slackRes.enterprise || null,
        incoming_webhook: slackRes.incoming_webhook || null,
      },
    };

    const { error: upsertErr } = await supabase
      .from("user_integrations")
      .upsert(upsertPayload, { onConflict: "owner_user_id,provider,external_account_id" });
    if (upsertErr) {
      console.error("[slack-api oauth_exchange] upsert error:", upsertErr.message);
      return errorResponse("Failed to save Slack connection", 500);
    }

    return jsonResponse({
      ok: true,
      team: { id: slackRes.team.id, name: slackRes.team.name },
      bot_user_id: slackRes.bot_user_id,
    });
  }

  // ── DISCONNECT ─────────────────────────────────────────────────────────
  if (action === "disconnect") {
    const { external_account_id } = body;
    if (!external_account_id) return errorResponse("Missing external_account_id", 400);
    const { error } = await supabase
      .from("user_integrations")
      .delete()
      .eq("owner_user_id", user.id)
      .eq("provider", "slack")
      .eq("external_account_id", external_account_id);
    if (error) {
      console.error("[slack-api disconnect] error:", error.message);
      return errorResponse("Failed to disconnect", 500);
    }
    return jsonResponse({ ok: true });
  }

  // ── POST MESSAGE ───────────────────────────────────────────────────────
  if (action === "post") {
    const { external_account_id, channel, text, blocks } = body;
    if (!channel || typeof channel !== "string") return errorResponse("Missing channel", 400);
    if (!text || typeof text !== "string") return errorResponse("Missing text", 400);
    if (text.length > 4000) return errorResponse("Message too long (max 4000 chars)", 400);

    await rateLimit("slack_post", user.id, 60, 3600);

    // Pick the workspace: explicit external_account_id wins, otherwise the
    // most recently connected workspace for this user.
    const query = supabase
      .from("user_integrations")
      .select("access_token, external_account_id, display_name")
      .eq("owner_user_id", user.id)
      .eq("provider", "slack");
    if (external_account_id) query.eq("external_account_id", external_account_id);
    const { data: rows, error: selErr } = await query
      .order("created_at", { ascending: false })
      .limit(1);
    if (selErr) {
      console.error("[slack-api post] select error:", selErr.message);
      return errorResponse("Failed to load Slack connection", 500);
    }
    if (!rows || rows.length === 0) {
      return errorResponse("Slack is not connected. Connect it in Settings first.", 404);
    }
    const row = rows[0];

    let slackRes: SlackPostResponse;
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${row.access_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ channel, text, blocks }),
      });
      slackRes = await res.json() as SlackPostResponse;
    } catch (e) {
      console.error("[slack-api post] network error:", (e as Error).message);
      return errorResponse("Could not reach Slack", 502);
    }

    if (!slackRes.ok) {
      // Common errors: channel_not_found, not_in_channel, invalid_auth,
      // token_revoked. We pass a friendly subset through.
      const err = slackRes.error || "unknown";
      console.error("[slack-api post] slack error:", err);
      if (err === "not_in_channel") {
        return errorResponse("The Roadmap OS bot isn't in that channel. Invite it with /invite @Roadmap OS.", 400);
      }
      if (err === "channel_not_found") {
        return errorResponse("That Slack channel doesn't exist or the bot can't see it.", 404);
      }
      if (err === "invalid_auth" || err === "token_revoked" || err === "account_inactive") {
        return errorResponse("Slack connection is no longer valid. Reconnect in Settings.", 401);
      }
      return errorResponse("Slack rejected the message.", 400);
    }

    return jsonResponse({ ok: true, ts: slackRes.ts, channel: slackRes.channel });
  }

  return errorResponse("Unknown action", 400);
}));
