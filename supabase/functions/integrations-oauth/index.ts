// supabase/functions/integrations-oauth/index.ts
// Handles OAuth authorization + callback for all 5 integration providers.
// verify_jwt is OFF in config.toml because the /callback route is hit by
// external providers — JWT verification happens INSIDE the function for the
// /authorize, /disconnect, and /status routes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://app.pmroadmapper.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  jira: {
    authUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: "read:jira-work write:jira-work read:jira-user offline_access",
    clientIdEnv: "JIRA_CLIENT_ID",
    clientSecretEnv: "JIRA_CLIENT_SECRET",
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: "repo read:user",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  slack: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: "channels:read,chat:write,incoming-webhook",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  asana: {
    authUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    scopes: "default",
    clientIdEnv: "ASANA_CLIENT_ID",
    clientSecretEnv: "ASANA_CLIENT_SECRET",
  },
  linear: {
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: "read,write",
    clientIdEnv: "LINEAR_CLIENT_ID",
    clientSecretEnv: "LINEAR_CLIENT_SECRET",
  },
  teams: {
    // Multi-tenant Microsoft Graph OAuth — /common lets users from any
    // Azure AD tenant authorize.
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: "User.Read offline_access Channel.ReadBasic.All ChannelMessage.Send Group.Read.All Tasks.ReadWrite Team.ReadBasic.All",
    clientIdEnv: "TEAMS_CLIENT_ID",
    clientSecretEnv: "TEAMS_CLIENT_SECRET",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Both the success and error callbacks redirect to a STATIC page hosted on the
// web app domain. We cannot serve HTML directly from Supabase edge functions
// because the gateway rewrites Content-Type to text/plain. The static page is
// a tiny HTML file at /oauth-callback.html that doesn't load the SPA, doesn't
// auto-sign-in, and just shows a "close this tab" confirmation — so users who
// started from the desktop app aren't yanked into the web app silently.
function callbackUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${APP_URL}/oauth-callback.html${qs ? "?" + qs : ""}`;
}

function redirectWithError(error: string, provider = ""): Response {
  const url = callbackUrl({ error, ...(provider ? { provider } : {}) });
  return new Response(null, { status: 302, headers: { Location: url } });
}

async function getUserFromAuth(req: Request, supabase: SupabaseClient) {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/integrations-oauth", "");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authorizeMatch = path.match(/^\/authorize\/(\w+)\/?$/);
    if (authorizeMatch) return await handleAuthorize(req, authorizeMatch[1], supabase);

    const callbackMatch = path.match(/^\/callback\/(\w+)\/?$/);
    if (callbackMatch) return await handleCallback(url, callbackMatch[1], supabase);

    const disconnectMatch = path.match(/^\/disconnect\/(\w+)\/?$/);
    if (disconnectMatch) return await handleDisconnect(req, disconnectMatch[1], supabase);

    if (path === "/status" || path === "/status/") {
      return await handleStatus(req, supabase);
    }

    return jsonResponse({ error: "Not found", path }, 404);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("[integrations-oauth] unhandled:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});

async function handleAuthorize(req: Request, provider: string, supabase: SupabaseClient): Promise<Response> {
  const config = PROVIDERS[provider];
  if (!config) return jsonResponse({ error: `Unknown provider: ${provider}` }, 400);

  const user = await getUserFromAuth(req, supabase);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const clientId = Deno.env.get(config.clientIdEnv);
  if (!clientId) {
    return jsonResponse({
      error: `${provider} not configured. Set ${config.clientIdEnv} in Supabase secrets.`,
    }, 500);
  }

  const state = btoa(JSON.stringify({ userId: user.id, provider, ts: Date.now() }));
  const redirectUri = `${SUPABASE_URL}/functions/v1/integrations-oauth/callback/${provider}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes,
    state: state,
  });

  // Provider-specific tweaks
  if (provider === "jira") {
    params.set("audience", "api.atlassian.com");
    params.set("prompt", "consent");
  }
  if (provider === "slack") {
    // Slack uses user_scope for user-level scopes; bot scopes go in `scope`
    params.set("user_scope", "channels:read");
  }

  const authorizationUrl = `${config.authUrl}?${params.toString()}`;
  return jsonResponse({ url: authorizationUrl });
}

async function handleCallback(url: URL, provider: string, supabase: SupabaseClient): Promise<Response> {
  const config = PROVIDERS[provider];
  if (!config) return redirectWithError("Unknown provider");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return redirectWithError(`OAuth error: ${oauthError}`);
  if (!code || !state) return redirectWithError("Missing code or state");

  let stateData: { userId: string; provider: string };
  try {
    stateData = JSON.parse(atob(state));
  } catch {
    return redirectWithError("Invalid state parameter");
  }
  if (stateData.provider !== provider) {
    return redirectWithError("State/provider mismatch");
  }

  const clientId = Deno.env.get(config.clientIdEnv);
  const clientSecret = Deno.env.get(config.clientSecretEnv);
  if (!clientId || !clientSecret) return redirectWithError(`${provider} not configured`);

  const redirectUri = `${SUPABASE_URL}/functions/v1/integrations-oauth/callback/${provider}`;

  // Token exchange
  const tokenBody: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
  };

  // Microsoft requires the same `scope` value in the token exchange request
  // that was used in /authorize. Other providers don't require it but accept it.
  if (provider === "teams") {
    tokenBody.scope = config.scopes;
  }

  const tokenHeaders: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  let tokenData: Record<string, unknown>;
  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: tokenHeaders,
      body: new URLSearchParams(tokenBody).toString(),
    });
    tokenData = await tokenResponse.json();
  } catch (e) {
    console.error("[integrations-oauth] token exchange threw:", (e as Error).message);
    return redirectWithError(`Token exchange failed: ${(e as Error).message}`);
  }

  const td = tokenData as {
    error?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    authed_user?: { access_token?: string };
    team?: { id?: string; name?: string };
    bot_user_id?: string;
  };

  if (td.error || (!td.access_token && !td.authed_user)) {
    console.error("[integrations-oauth] token exchange failed:", JSON.stringify(td));
    return redirectWithError(`Token exchange failed: ${td.error || "Unknown error"}`);
  }

  let accessToken: string;
  let refreshToken: string | null = null;
  let expiresAt: string | null = null;
  let providerConfig: Record<string, unknown> = {};

  if (provider === "slack") {
    accessToken = td.authed_user?.access_token || td.access_token || "";
    providerConfig = {
      teamId: td.team?.id,
      teamName: td.team?.name,
      botToken: td.access_token, // bot token for posting
      botUserId: td.bot_user_id,
    };
  } else {
    accessToken = td.access_token!;
    refreshToken = td.refresh_token || null;
    if (typeof td.expires_in === "number") {
      expiresAt = new Date(Date.now() + td.expires_in * 1000).toISOString();
    }
  }

  // Provider-specific config enrichment
  try {
    if (provider === "jira") {
      const sitesRes = await fetch(
        "https://api.atlassian.com/oauth/token/accessible-resources",
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
      );
      const sites = await sitesRes.json();
      if (Array.isArray(sites) && sites.length > 0) {
        providerConfig = { cloudId: sites[0].id, siteUrl: sites[0].url, siteName: sites[0].name };
      }
    } else if (provider === "github") {
      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const ghUser = await userRes.json();
      providerConfig = { username: ghUser.login, avatarUrl: ghUser.avatar_url, userId: ghUser.id };
    } else if (provider === "asana") {
      const meRes = await fetch("https://app.asana.com/api/1.0/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meData = await meRes.json();
      providerConfig = {
        userId: meData.data?.gid,
        userName: meData.data?.name,
        workspaces: meData.data?.workspaces?.map((w: { gid: string; name: string }) => ({
          gid: w.gid,
          name: w.name,
        })),
      };
    } else if (provider === "linear") {
      const meRes = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { Authorization: accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "{ viewer { id name email } teams { nodes { id name } } }",
        }),
      });
      const meData = await meRes.json();
      providerConfig = {
        userId: meData.data?.viewer?.id,
        userName: meData.data?.viewer?.name,
        teams: meData.data?.teams?.nodes,
      };
    } else if (provider === "teams") {
      // Seed Teams config with Microsoft Graph user profile.
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const meData = await meRes.json();
      providerConfig = {
        userId: meData.id,
        displayName: meData.displayName,
        email: meData.mail || meData.userPrincipalName,
      };
    }
  } catch (e) {
    console.warn("[integrations-oauth] config enrichment failed:", (e as Error).message);
    // Don't block connection on enrichment failure
  }

  const { error: upsertError } = await supabase
    .from("integration_connections")
    .upsert(
      {
        user_id: stateData.userId,
        provider: provider,
        status: "connected",
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        config: providerConfig,
        sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );

  if (upsertError) {
    console.error("[integrations-oauth] failed to save connection:", upsertError.message);
    return redirectWithError("Failed to save connection");
  }

  return new Response(null, {
    status: 302,
    headers: { Location: callbackUrl({ connected: provider }) },
  });
}

async function handleDisconnect(req: Request, provider: string, supabase: SupabaseClient): Promise<Response> {
  const user = await getUserFromAuth(req, supabase);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  // Find the connection first so we can clean up mappings
  const { data: conn } = await supabase
    .from("integration_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle();

  if (conn?.id) {
    await supabase
      .from("integration_mappings")
      .delete()
      .eq("connection_id", conn.id);
  }

  await supabase
    .from("integration_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", provider);

  return jsonResponse({ success: true });
}

async function handleStatus(req: Request, supabase: SupabaseClient): Promise<Response> {
  const user = await getUserFromAuth(req, supabase);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  // Select only safe columns — never return access_token/refresh_token to the client
  const { data: connections, error } = await supabase
    .from("integration_connections")
    .select(
      "provider, status, config, last_synced_at, sync_direction, sync_frequency, target_entity, target_section_id, target_plan_id, sync_error, created_at, updated_at",
    )
    .eq("user_id", user.id);

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ connections: connections || [] });
}
