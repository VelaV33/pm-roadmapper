# Roadmap OS — Autonomous Fix Queue v10: Integrations

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V10.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/` (Deno runtime)
- Supabase project: `nigusoyssktoebzscbwe` (eu-west-1)
- Data stored as one JSONB blob per user in `roadmap_data` table
- Auth: Supabase Auth + Google OAuth
- Shared auth utility: `supabase/functions/_shared/auth.ts`
- Dark mode: CSS variables. ZERO emoji — SVG icons only.
- Existing patterns: edge functions verify JWT at gateway + application level, CORS handled in `_shared/auth.ts`

**What we're building:**
Five two-way integrations for Roadmap OS:
1. **Jira** (Cloud) — sync Jira issues ↔ Roadmap OS initiatives/tasks
2. **GitHub** — sync GitHub issues ↔ Roadmap OS initiatives/tasks
3. **Slack** — push feedback/messages into Roadmap OS feedback inbox; send notifications to Slack channels
4. **Asana** — sync Asana tasks ↔ Roadmap OS initiatives/tasks
5. **Linear** — sync Linear issues ↔ Roadmap OS initiatives/tasks

**Architecture overview:**
```
┌─────────────────────────────────────────────────────────────┐
│                    renderer/index.html                       │
│                                                             │
│  Integrations Page                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ ┌──────┐│
│  │  Jira    │ │  GitHub  │ │  Slack   │ │Asana │ │Linear││
│  │ Connect  │ │ Connect  │ │ Connect  │ │Connect│ │Connect││
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──┬───┘ └──┬───┘│
└───────┼─────────────┼───────────┼───────────┼────────┼─────┘
        │             │           │           │        │
        ▼             ▼           ▼           ▼        ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions                        │
│                                                             │
│  integrations-oauth/     ← OAuth callback handler           │
│  integrations-api/       ← CRUD: configure, sync, status    │
│  integrations-webhook/   ← Incoming webhooks from tools      │
│  integrations-sync/      ← Outbound sync (push changes)      │
│                                                             │
│  Database tables:                                           │
│  integration_connections  ← OAuth tokens, config per user    │
│  integration_sync_log     ← Sync history, conflict log       │
│  integration_mappings     ← Entity ID mappings (jira↔ros)    │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────────────┐
         │             │                     │
    ┌────▼────┐  ┌─────▼─────┐  ┌───────────▼──────────┐
    │ Jira    │  │ GitHub    │  │ Slack / Asana / Linear│
    │ Cloud   │  │ API       │  │ APIs                  │
    │ API     │  │           │  │                       │
    └─────────┘  └───────────┘  └──────────────────────┘
```

**Before starting:**
1. `ls supabase/functions/` — list existing edge functions
2. `cat supabase/functions/_shared/auth.ts` — understand the shared auth pattern
3. `cat supabase/config.toml | head -40` — understand function config
4. `grep -n "integration\|Integration\|connect.*api\|oauth\|webhook" renderer/index.html | head -20`
5. `grep -rn "integration" supabase/ | head -20`
6. Log all findings in `FIX_LOG_V10.md`

---

## Fix 1: Database Schema — Integration Tables

**Problem:** We need database tables to store OAuth tokens, integration configurations, entity mappings, and sync logs.

**Approach:**
Create a new Supabase migration file: `supabase/migrations/YYYYMMDD000000_integrations.sql`

Use the current date for the timestamp prefix (format: `20260425000000`).

```sql
-- ============================================
-- Integration tables for Roadmap OS
-- ============================================

-- 1. Integration connections — one row per user per integration
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('jira', 'github', 'slack', 'asana', 'linear')),
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'syncing')),

  -- OAuth tokens (encrypted at rest by Supabase)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Provider-specific config
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Jira: { cloudId, siteUrl, projectKey, projectId }
  -- GitHub: { owner, repo, installationId }
  -- Slack: { teamId, teamName, channelId, channelName, botToken }
  -- Asana: { workspaceGid, projectGid, projectName }
  -- Linear: { teamId, teamName }

  -- Sync settings
  sync_direction TEXT NOT NULL DEFAULT 'bidirectional' CHECK (sync_direction IN ('import', 'export', 'bidirectional')),
  sync_frequency TEXT NOT NULL DEFAULT 'realtime' CHECK (sync_frequency IN ('realtime', 'hourly', 'daily', 'manual')),
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,

  -- Mapping config: which Roadmap OS entity type to sync with
  -- 'initiatives' = roadmap rows, 'tasks' = plan tasks, 'feedback' = feedback items
  target_entity TEXT NOT NULL DEFAULT 'initiatives' CHECK (target_entity IN ('initiatives', 'tasks', 'feedback')),
  target_section_id TEXT, -- which roadmap section to import into (for initiatives)
  target_plan_id TEXT,    -- which plan to import into (for tasks)

  -- Webhook
  webhook_secret TEXT,
  webhook_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, provider)
);

-- 2. Entity mappings — links Roadmap OS entity IDs to external tool IDs
CREATE TABLE IF NOT EXISTS public.integration_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Roadmap OS side
  ros_entity_type TEXT NOT NULL CHECK (ros_entity_type IN ('row', 'task', 'feedback', 'section')),
  ros_entity_id TEXT NOT NULL,

  -- External tool side
  external_id TEXT NOT NULL,
  external_key TEXT,        -- e.g., Jira issue key "PROJ-123", GitHub issue #42
  external_url TEXT,        -- direct link to the item in the external tool

  -- Sync state
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  sync_hash TEXT,           -- hash of the data at last sync (for conflict detection)
  sync_direction TEXT,      -- 'imported' or 'exported' — which direction created this mapping

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(connection_id, ros_entity_id),
  UNIQUE(connection_id, external_id)
);

-- 3. Sync log — audit trail of all sync operations
CREATE TABLE IF NOT EXISTS public.integration_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  action TEXT NOT NULL CHECK (action IN ('import', 'export', 'update_import', 'update_export', 'delete', 'conflict', 'error')),
  entity_type TEXT NOT NULL,
  ros_entity_id TEXT,
  external_id TEXT,
  external_key TEXT,

  details JSONB DEFAULT '{}'::jsonb,  -- what changed, field diffs, error messages
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'conflict', 'skipped')),

  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_connections FORCE ROW LEVEL SECURITY;

ALTER TABLE public.integration_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_mappings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.integration_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_log FORCE ROW LEVEL SECURITY;

-- Owner-only access
CREATE POLICY "Users can manage own connections" ON public.integration_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own mappings" ON public.integration_mappings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own sync logs" ON public.integration_sync_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_connections_user ON public.integration_connections(user_id);
CREATE INDEX idx_connections_provider ON public.integration_connections(provider);
CREATE INDEX idx_mappings_connection ON public.integration_mappings(connection_id);
CREATE INDEX idx_mappings_ros_entity ON public.integration_mappings(ros_entity_id);
CREATE INDEX idx_mappings_external ON public.integration_mappings(external_id);
CREATE INDEX idx_sync_log_connection ON public.integration_sync_log(connection_id);

-- Triggers
CREATE OR REPLACE FUNCTION update_integration_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER integration_connections_updated
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION update_integration_timestamp();

CREATE TRIGGER integration_mappings_updated
  BEFORE UPDATE ON public.integration_mappings
  FOR EACH ROW EXECUTE FUNCTION update_integration_timestamp();
```

**Write this migration file** to `supabase/migrations/20260425000000_integrations.sql`.

**Also update `supabase/config.toml`** to add the new edge function configs (will be created in subsequent fixes).

---

## Fix 2: Integration OAuth Edge Function

**Problem:** Need a Supabase Edge Function that handles OAuth flows for all 5 providers. Each provider has a different OAuth dance but they share common patterns.

**Create:** `supabase/functions/integrations-oauth/index.ts`

```typescript
// supabase/functions/integrations-oauth/index.ts
// Handles OAuth authorization + callback for all integration providers

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = 'https://app.pmroadmapper.com';

// Provider OAuth configurations
// These use environment variables that must be set in Supabase dashboard
const PROVIDERS: Record<string, {
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}> = {
  jira: {
    authUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes: 'read:jira-work write:jira-work read:jira-user offline_access',
    clientIdEnv: 'JIRA_CLIENT_ID',
    clientSecretEnv: 'JIRA_CLIENT_SECRET',
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: 'repo read:user',
    clientIdEnv: 'GITHUB_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CLIENT_SECRET',
  },
  slack: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: 'channels:read,chat:write,incoming-webhook',
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
  },
  asana: {
    authUrl: 'https://app.asana.com/-/oauth_authorize',
    tokenUrl: 'https://app.asana.com/-/oauth_token',
    scopes: 'default',
    clientIdEnv: 'ASANA_CLIENT_ID',
    clientSecretEnv: 'ASANA_CLIENT_SECRET',
  },
  linear: {
    authUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    scopes: 'read,write',
    clientIdEnv: 'LINEAR_CLIENT_ID',
    clientSecretEnv: 'LINEAR_CLIENT_SECRET',
  },
};

serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace('/integrations-oauth', '');
  const corsHeaders = {
    'Access-Control-Allow-Origin': APP_URL,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Route: /authorize/:provider — initiate OAuth flow
    const authorizeMatch = path.match(/^\/authorize\/(\w+)$/);
    if (authorizeMatch) {
      const provider = authorizeMatch[1];
      return handleAuthorize(req, provider, url, corsHeaders);
    }

    // Route: /callback/:provider — OAuth callback
    const callbackMatch = path.match(/^\/callback\/(\w+)$/);
    if (callbackMatch) {
      const provider = callbackMatch[1];
      return handleCallback(req, provider, url, corsHeaders);
    }

    // Route: /disconnect/:provider — remove connection
    const disconnectMatch = path.match(/^\/disconnect\/(\w+)$/);
    if (disconnectMatch) {
      const provider = disconnectMatch[1];
      return handleDisconnect(req, provider, corsHeaders);
    }

    // Route: /status — get all connection statuses for current user
    if (path === '/status' || path === '/status/') {
      return handleStatus(req, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Integration OAuth error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleAuthorize(req: Request, provider: string, url: URL, corsHeaders: Record<string, string>) {
  const config = PROVIDERS[provider];
  if (!config) {
    return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify user is authenticated
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clientId = Deno.env.get(config.clientIdEnv);
  if (!clientId) {
    return new Response(JSON.stringify({ error: `${provider} not configured. Set ${config.clientIdEnv} in Supabase secrets.` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Generate state parameter (includes user ID for callback verification)
  const state = btoa(JSON.stringify({ userId: user.id, provider, ts: Date.now() }));

  const redirectUri = `${SUPABASE_URL}/functions/v1/integrations-oauth/callback/${provider}`;

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes,
    state: state,
  });

  // Provider-specific params
  if (provider === 'jira') {
    params.set('audience', 'api.atlassian.com');
    params.set('prompt', 'consent');
  }
  if (provider === 'slack') {
    // Slack uses user_scope for user tokens
    params.delete('scope');
    params.set('user_scope', config.scopes);
  }

  const authorizationUrl = `${config.authUrl}?${params.toString()}`;

  return new Response(JSON.stringify({ url: authorizationUrl }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleCallback(req: Request, provider: string, url: URL, corsHeaders: Record<string, string>) {
  const config = PROVIDERS[provider];
  if (!config) {
    return redirectWithError('Unknown provider');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return redirectWithError(`OAuth error: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError('Missing code or state');
  }

  // Decode state
  let stateData: { userId: string; provider: string };
  try {
    stateData = JSON.parse(atob(state));
  } catch {
    return redirectWithError('Invalid state parameter');
  }

  const clientId = Deno.env.get(config.clientIdEnv)!;
  const clientSecret = Deno.env.get(config.clientSecretEnv)!;
  const redirectUri = `${SUPABASE_URL}/functions/v1/integrations-oauth/callback/${provider}`;

  // Exchange code for tokens
  const tokenBody: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
  };

  const tokenHeaders: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // GitHub needs Accept header for JSON response
  if (provider === 'github') {
    tokenHeaders['Accept'] = 'application/json';
  }

  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: tokenHeaders,
    body: new URLSearchParams(tokenBody).toString(),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error || (!tokenData.access_token && !tokenData.authed_user)) {
    console.error('Token exchange failed:', tokenData);
    return redirectWithError(`Token exchange failed: ${tokenData.error || 'Unknown error'}`);
  }

  // Extract tokens (varies by provider)
  let accessToken: string;
  let refreshToken: string | null = null;
  let expiresAt: string | null = null;
  let providerConfig: Record<string, any> = {};

  if (provider === 'slack') {
    // Slack returns tokens differently
    accessToken = tokenData.authed_user?.access_token || tokenData.access_token;
    providerConfig = {
      teamId: tokenData.team?.id,
      teamName: tokenData.team?.name,
      botToken: tokenData.access_token,
    };
  } else {
    accessToken = tokenData.access_token;
    refreshToken = tokenData.refresh_token || null;
    if (tokenData.expires_in) {
      expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    }
  }

  // Fetch provider-specific config (e.g., Jira cloud ID, GitHub user info)
  if (provider === 'jira') {
    // Get accessible Jira sites
    const sitesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    });
    const sites = await sitesRes.json();
    if (sites.length > 0) {
      providerConfig = { cloudId: sites[0].id, siteUrl: sites[0].url, siteName: sites[0].name };
    }
  }

  if (provider === 'github') {
    const userRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    });
    const ghUser = await userRes.json();
    providerConfig = { username: ghUser.login, avatarUrl: ghUser.avatar_url };
  }

  if (provider === 'asana') {
    const meRes = await fetch('https://app.asana.com/api/1.0/users/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const meData = await meRes.json();
    providerConfig = {
      userId: meData.data?.gid,
      userName: meData.data?.name,
      workspaces: meData.data?.workspaces?.map((w: any) => ({ gid: w.gid, name: w.name })),
    };
  }

  if (provider === 'linear') {
    // Linear uses GraphQL
    const meRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Authorization': accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ viewer { id name email } teams { nodes { id name } } }' }),
    });
    const meData = await meRes.json();
    providerConfig = {
      userId: meData.data?.viewer?.id,
      userName: meData.data?.viewer?.name,
      teams: meData.data?.teams?.nodes,
    };
  }

  // Save connection to database
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error: upsertError } = await supabase
    .from('integration_connections')
    .upsert({
      user_id: stateData.userId,
      provider: provider,
      status: 'connected',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      config: providerConfig,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });

  if (upsertError) {
    console.error('Failed to save connection:', upsertError);
    return redirectWithError('Failed to save connection');
  }

  // Redirect back to the app
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${APP_URL}/#integrations?connected=${provider}`,
    },
  });
}

async function handleDisconnect(req: Request, provider: string, corsHeaders: Record<string, string>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Delete connection and all related mappings
  await supabase.from('integration_mappings')
    .delete()
    .eq('user_id', user.id)
    .eq('connection_id', (
      await supabase.from('integration_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', provider)
        .single()
    ).data?.id);

  await supabase.from('integration_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider);

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleStatus(req: Request, corsHeaders: Record<string, string>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: connections } = await supabase
    .from('integration_connections')
    .select('provider, status, config, last_synced_at, sync_direction, target_entity, sync_error')
    .eq('user_id', user.id);

  return new Response(JSON.stringify({ connections: connections || [] }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function redirectWithError(error: string) {
  return new Response(null, {
    status: 302,
    headers: { 'Location': `${APP_URL}/#integrations?error=${encodeURIComponent(error)}` },
  });
}
```

**Also update `supabase/config.toml`** to add:
```toml
[functions.integrations-oauth]
verify_jwt = false  # OAuth callbacks come from external providers, not our frontend
```

---

## Fix 3: Integration Sync Edge Function

**Problem:** Need an edge function that handles importing data FROM external tools and pushing changes TO external tools.

**Create:** `supabase/functions/integrations-sync/index.ts`

This function handles:
- `POST /import/:provider` — fetch data from external tool and create/update Roadmap OS entities
- `POST /export/:provider` — push Roadmap OS changes to external tool
- `POST /sync/:provider` — bidirectional sync (import + export)

**Implementation approach:**
1. For each provider, implement a `fetchExternalItems(connection)` function that calls their API and returns normalized items
2. For each provider, implement a `pushItem(connection, item)` function that creates/updates items in their API
3. A mapping layer converts between provider-specific formats and Roadmap OS format
4. Conflict resolution: use `sync_hash` (MD5 of key fields) to detect changes on both sides. If both changed → mark as conflict in sync log, keep the most recent, log both versions.

**Normalized item format (internal):**
```typescript
interface SyncItem {
  externalId: string;
  externalKey?: string;    // PROJ-123, #42, etc.
  externalUrl?: string;
  title: string;
  description?: string;
  status: string;          // normalized to: 'todo', 'in_progress', 'done', 'blocked'
  priority?: string;       // normalized to: 'high', 'medium', 'low'
  assignee?: string;       // email or name
  dueDate?: string;        // ISO date
  labels?: string[];
  estimatedHours?: number;
  updatedAt: string;       // ISO timestamp from external tool
}
```

**Provider-specific API calls:**

For **Jira**: `GET /rest/api/3/search?jql=project=${projectKey}` → map Jira issue to SyncItem
For **GitHub**: `GET /repos/${owner}/${repo}/issues?state=all` → map GitHub issue to SyncItem
For **Asana**: `GET /api/1.0/projects/${projectGid}/tasks` → map Asana task to SyncItem
For **Linear**: GraphQL query `{ issues(filter: { team: { id: { eq: "${teamId}" } } }) { nodes { ... } } }` → map Linear issue to SyncItem
For **Slack**: Inbound messages are handled by webhooks (Fix 4), not polling

**Status mapping per provider:**
```typescript
const STATUS_MAP: Record<string, Record<string, string>> = {
  jira: { 'To Do': 'todo', 'In Progress': 'in_progress', 'Done': 'done', 'Blocked': 'blocked' },
  github: { 'open': 'todo', 'closed': 'done' },
  asana: { 'incomplete': 'todo', 'complete': 'done' },
  linear: { 'Todo': 'todo', 'In Progress': 'in_progress', 'Done': 'done', 'Canceled': 'done' },
};
```

**Write the full edge function implementation.** Include:
- Token refresh logic (for providers with expiring tokens — Jira, Asana)
- Pagination handling (Jira, GitHub, and Asana paginate results)
- Error handling with retry for rate limits (429)
- Sync log entries for every item synced

---

## Fix 4: Integration Webhook Edge Function

**Problem:** Need an edge function to receive incoming webhooks from external tools when data changes on their side.

**Create:** `supabase/functions/integrations-webhook/index.ts`

This function handles:
- `POST /webhook/jira` — Jira sends webhooks when issues change
- `POST /webhook/github` — GitHub sends webhooks for issue events
- `POST /webhook/slack` — Slack sends message events
- `POST /webhook/asana` — Asana sends webhooks for task changes
- `POST /webhook/linear` — Linear sends webhooks for issue changes

**Implementation:**
1. Verify webhook signatures (each provider has its own signature mechanism):
   - Jira: shared secret in webhook config
   - GitHub: HMAC-SHA256 with `X-Hub-Signature-256` header
   - Slack: signing secret with `X-Slack-Signature` header
   - Asana: HMAC-SHA256 with `X-Hook-Signature` header
   - Linear: HMAC-SHA256 with signing secret

2. Parse the event payload and determine what changed
3. Find the corresponding Roadmap OS entity via `integration_mappings`
4. Update the Roadmap OS entity in the user's JSONB blob
5. Log the sync event

**Important:** Webhooks must be idempotent — receiving the same webhook twice should not create duplicate data.

**Config in `supabase/config.toml`:**
```toml
[functions.integrations-webhook]
verify_jwt = false  # Webhooks come from external services, not authenticated users
```

---

## Fix 5: Integration API Edge Function

**Problem:** Need an edge function for the frontend to manage integrations: list projects/repos/channels after OAuth, configure sync settings, trigger manual sync, view sync history.

**Create:** `supabase/functions/integrations-api/index.ts`

Routes:
- `GET /projects/:provider` — list available projects/repos/channels to sync with
- `PUT /configure/:provider` — save sync configuration (target section, sync direction, etc.)
- `POST /sync/:provider` — trigger manual sync
- `GET /history/:provider` — get sync log for a provider
- `GET /mappings/:provider` — list entity mappings

**For each provider, implement project/repo listing:**
- **Jira:** `GET /rest/api/3/project` → list Jira projects
- **GitHub:** `GET /user/repos?sort=updated` → list GitHub repos
- **Slack:** `GET /api/conversations.list` → list Slack channels
- **Asana:** `GET /api/1.0/workspaces/${gid}/projects` → list Asana projects
- **Linear:** GraphQL `{ teams { nodes { id name projects { nodes { id name } } } } }` → list Linear teams/projects

**Config:**
```toml
[functions.integrations-api]
verify_jwt = true
```

---

## Fix 6: Integrations Page — Frontend UI

**Problem:** Need a new "Integrations" page in the app where users can connect, configure, and manage their integrations.

**Approach:**

### Step 1: Create the Page
Add to `renderer/index.html`:
```html
<div id="integrations-page" class="page" style="display:none;">
  <div class="page-toolbar">
    <h2 class="toolbar-title">Integrations</h2>
    <p class="toolbar-subtitle">Connect your tools to sync data with Roadmap OS</p>
  </div>

  <div class="integrations-grid" id="integrations-grid">
    <!-- Populated dynamically -->
  </div>

  <!-- Configuration modal (shown when configuring a connected integration) -->
  <div id="integration-config-modal" class="modal" style="display:none;">
    <!-- Populated dynamically -->
  </div>
</div>
```

### Step 2: Integration Card Grid
```javascript
const INTEGRATION_DEFS = [
  {
    id: 'jira',
    name: 'Jira',
    description: 'Sync Jira Cloud issues with your roadmap initiatives and plan tasks.',
    icon: '<svg viewBox="0 0 24 24" width="32" height="32" fill="none"><path d="M12.005 2C6.486 2 2 6.487 2 12.005c0 5.517 4.486 10.005 10.005 10.005 5.518 0 10.005-4.488 10.005-10.005C22.01 6.487 17.523 2 12.005 2zm4.444 7.66l-4.444 8.887-4.444-8.887h2.668l1.776 3.556 1.776-3.556h2.668z" fill="#2684FF"/></svg>',
    color: '#2684FF',
    category: 'project',
    features: ['Import issues', 'Push status updates', 'Two-way sync', 'Webhook support'],
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Sync GitHub issues and PRs with your roadmap initiatives and plan tasks.',
    icon: '<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/></svg>',
    color: '#24292f',
    category: 'project',
    features: ['Import issues', 'Sync PR status', 'Two-way sync', 'Webhook support'],
    docsUrl: 'https://docs.github.com/en/rest',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Push feedback and notifications to Slack channels. Capture ideas from Slack messages.',
    icon: '<svg viewBox="0 0 24 24" width="32" height="32" fill="none"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z" fill="#E01E5A"/></svg>',
    color: '#4A154B',
    category: 'feedback',
    features: ['Send notifications', 'Capture feedback', 'Channel integration'],
    docsUrl: 'https://api.slack.com/',
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Sync Asana tasks with your roadmap initiatives and plan tasks.',
    icon: '<svg viewBox="0 0 24 24" width="32" height="32" fill="none"><path d="M18.21 10.105c-2.412 0-4.368 1.956-4.368 4.368s1.956 4.369 4.368 4.369 4.369-1.957 4.369-4.369-1.957-4.368-4.369-4.368zm-12.42 0c-2.412 0-4.369 1.956-4.369 4.368s1.957 4.369 4.369 4.369 4.368-1.957 4.368-4.369-1.956-4.368-4.368-4.368zM12 1.158c-2.412 0-4.368 1.956-4.368 4.368S9.588 9.895 12 9.895s4.368-1.957 4.368-4.369S14.412 1.158 12 1.158z" fill="#F06A6A"/></svg>',
    color: '#F06A6A',
    category: 'project',
    features: ['Import tasks', 'Push updates', 'Two-way sync', 'Project selection'],
    docsUrl: 'https://developers.asana.com/',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Sync Linear issues with your roadmap initiatives and plan tasks.',
    icon: '<svg viewBox="0 0 24 24" width="32" height="32" fill="none"><path d="M2.768 14.592l6.64 6.64c-.478.084-.968.128-1.468.128C4.295 21.36 1.2 18.265 1.2 14.62c0-.5.044-.99.128-1.468l1.44 1.44zm.64-2.56l8.56 8.56c3.168-.92 5.6-3.64 6.12-6.96L9.528 5.072c-3.32.52-6.04 2.952-6.96 6.12l.84.84zm8.24-8.24l8.56 8.56c.084-.478.128-.968.128-1.468 0-3.645-3.095-6.74-6.74-6.74-.5 0-.99.044-1.468.128l-.48.48v-.96z" fill="#5E6AD2"/></svg>',
    color: '#5E6AD2',
    category: 'project',
    features: ['Import issues', 'Push updates', 'Two-way sync', 'Team selection'],
    docsUrl: 'https://developers.linear.app/',
  },
];

function renderIntegrationsPage() {
  const grid = document.getElementById('integrations-grid');
  if (!grid) return;

  // Fetch connection statuses
  fetchIntegrationStatuses().then(statuses => {
    grid.innerHTML = INTEGRATION_DEFS.map(intg => {
      const connection = statuses.find(s => s.provider === intg.id);
      const isConnected = connection?.status === 'connected';
      const lastSynced = connection?.last_synced_at
        ? formatTimeAgo(connection.last_synced_at)
        : null;

      return `
        <div class="integration-card ${isConnected ? 'connected' : ''}" data-provider="${intg.id}">
          <div class="integration-card-header">
            <div class="integration-icon">${intg.icon}</div>
            <div class="integration-info">
              <h3>${intg.name}</h3>
              <p>${intg.description}</p>
            </div>
          </div>

          <div class="integration-features">
            ${intg.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
          </div>

          ${isConnected ? `
            <div class="integration-status">
              <span class="status-dot connected"></span>
              <span>Connected</span>
              ${lastSynced ? `<span class="last-sync">Last synced ${lastSynced}</span>` : ''}
            </div>
            <div class="integration-actions">
              <button onclick="configureIntegration('${intg.id}')" class="btn-sm btn-primary">Configure</button>
              <button onclick="triggerSync('${intg.id}')" class="btn-sm btn-outline">Sync Now</button>
              <button onclick="disconnectIntegration('${intg.id}')" class="btn-sm btn-danger-subtle">Disconnect</button>
            </div>
          ` : `
            <div class="integration-status">
              <span class="status-dot disconnected"></span>
              <span>Not connected</span>
            </div>
            <div class="integration-actions">
              <button onclick="connectIntegration('${intg.id}')" class="btn-primary">Connect</button>
              <a href="${intg.docsUrl}" target="_blank" rel="noopener" class="btn-sm btn-outline">Learn more</a>
            </div>
          `}

          ${connection?.sync_error ? `
            <div class="integration-error">
              <span class="error-icon">
                <svg viewBox="0 0 16 16" width="14" height="14" stroke="#ef4444" stroke-width="1.5" fill="none">
                  <circle cx="8" cy="8" r="7"/><line x1="8" y1="5" x2="8" y2="8.5"/><line x1="8" y1="11" x2="8.01" y2="11"/>
                </svg>
              </span>
              ${escapeHtml(connection.sync_error)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  });
}
```

### Step 3: Connect Flow
```javascript
async function connectIntegration(provider) {
  showLoadingOverlay(`Connecting to ${provider}...`);

  try {
    const token = getAccessToken(); // however the Supabase JWT is accessed
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/integrations-oauth/authorize/${provider}`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    if (!data.url) throw new Error('No authorization URL returned');

    hideLoadingOverlay();

    // Open OAuth flow in a new window/tab
    window.open(data.url, '_blank', 'width=600,height=700');

    // Poll for connection status
    showToast(`Complete the ${provider} authorization in the popup window`, 'info');
    pollForConnection(provider);

  } catch (err) {
    hideLoadingOverlay();
    showToast(`Failed to connect ${provider}: ${err.message}`, 'error');
  }
}

function pollForConnection(provider) {
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes at 5-second intervals

  const interval = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(interval);
      return;
    }

    const statuses = await fetchIntegrationStatuses();
    const connection = statuses.find(s => s.provider === provider);
    if (connection?.status === 'connected') {
      clearInterval(interval);
      renderIntegrationsPage();
      showToast(`${provider} connected successfully!`, 'success');
    }
  }, 5000);
}
```

### Step 4: Configure Integration Modal
```javascript
async function configureIntegration(provider) {
  const statuses = await fetchIntegrationStatuses();
  const connection = statuses.find(s => s.provider === provider);
  if (!connection) return;

  // Fetch available projects/repos/channels
  const projects = await fetchProviderProjects(provider);

  const modal = createModal(`Configure ${provider}`);
  modal.innerHTML = `
    <div class="integration-config-form" style="max-width:500px; margin:0 auto;">
      <h3>${INTEGRATION_DEFS.find(i => i.id === provider)?.name} Configuration</h3>

      <div class="form-group">
        <label>${getProjectLabel(provider)}</label>
        <select id="intg-project-select">
          <option value="">Select...</option>
          ${projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Sync Direction</label>
        <select id="intg-sync-direction">
          <option value="bidirectional" ${connection.sync_direction === 'bidirectional' ? 'selected' : ''}>Two-way sync</option>
          <option value="import" ${connection.sync_direction === 'import' ? 'selected' : ''}>Import only</option>
          <option value="export" ${connection.sync_direction === 'export' ? 'selected' : ''}>Export only</option>
        </select>
      </div>

      <div class="form-group">
        <label>Import Into</label>
        <select id="intg-target-entity">
          <option value="initiatives">Roadmap Initiatives (rows)</option>
          <option value="tasks">Plan Tasks</option>
          <option value="feedback">Feedback Items</option>
        </select>
      </div>

      <div id="intg-section-select-group" class="form-group">
        <label>Target Roadmap Section</label>
        <select id="intg-target-section">
          <option value="">Auto-create section</option>
          ${(currentData.sections || []).map(s =>
            `<option value="${s.id}">${escapeHtml(s.name)}</option>`
          ).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Sync Frequency</label>
        <select id="intg-sync-frequency">
          <option value="realtime">Real-time (webhooks)</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="manual">Manual only</option>
        </select>
      </div>

      <div class="form-actions">
        <button onclick="saveIntegrationConfig('${provider}')" class="btn-primary">Save & Sync</button>
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
      </div>
    </div>
  `;
  showModal(modal);
}

function getProjectLabel(provider) {
  switch (provider) {
    case 'jira': return 'Jira Project';
    case 'github': return 'GitHub Repository';
    case 'slack': return 'Slack Channel';
    case 'asana': return 'Asana Project';
    case 'linear': return 'Linear Team';
    default: return 'Project';
  }
}
```

### Step 5: Navigation
1. Add "Integrations" to the sidebar/top nav:
   ```html
   <button class="nav-item" data-page="integrations" onclick="showPage('integrations')">
     <svg viewBox="0 0 20 20" width="18" height="18" stroke="currentColor" stroke-width="1.5" fill="none">
       <circle cx="6" cy="6" r="3"/><circle cx="14" cy="14" r="3"/>
       <line x1="8.5" y1="8.5" x2="11.5" y2="11.5"/>
     </svg>
     Integrations
   </button>
   ```

2. In `showPage()`, add the case for `'integrations'`:
   ```javascript
   case 'integrations':
     renderIntegrationsPage();
     break;
   ```

3. Handle the OAuth callback hash (`#integrations?connected=github`):
   ```javascript
   function handleIntegrationCallback() {
     const hash = window.location.hash;
     if (hash.includes('connected=')) {
       const provider = new URLSearchParams(hash.split('?')[1]).get('connected');
       if (provider) {
         showPage('integrations');
         showToast(`${provider} connected successfully!`, 'success');
         // Clean the hash
         history.replaceState(null, '', '#integrations');
       }
     }
     if (hash.includes('error=')) {
       const error = decodeURIComponent(new URLSearchParams(hash.split('?')[1]).get('error') || '');
       showToast(`Integration error: ${error}`, 'error');
       history.replaceState(null, '', '#integrations');
     }
   }
   ```

### Step 6: CSS
```css
.integrations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
  padding: 20px;
}
.integration-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  padding: 20px;
  transition: box-shadow 0.2s;
}
.integration-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}
.integration-card.connected {
  border-color: #22c55e;
  border-width: 2px;
}
.integration-card-header {
  display: flex; gap: 16px; align-items: flex-start;
  margin-bottom: 12px;
}
.integration-icon {
  flex-shrink: 0;
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-secondary);
  border-radius: 10px;
  padding: 8px;
}
.integration-info h3 {
  margin: 0 0 4px; font-size: 16px; font-weight: 600;
  color: var(--text-primary);
}
.integration-info p {
  margin: 0; font-size: 13px; color: var(--text-secondary);
  line-height: 1.4;
}
.integration-features {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: 16px;
}
.feature-tag {
  font-size: 11px; padding: 3px 8px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  color: var(--text-secondary);
}
.integration-status {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px; font-size: 13px;
}
.status-dot {
  width: 8px; height: 8px; border-radius: 50%;
}
.status-dot.connected { background: #22c55e; }
.status-dot.disconnected { background: var(--text-muted); }
.last-sync { color: var(--text-muted); font-size: 12px; margin-left: auto; }
.integration-actions {
  display: flex; gap: 8px; flex-wrap: wrap;
}
.integration-error {
  display: flex; align-items: center; gap: 6px;
  margin-top: 12px; padding: 8px 12px;
  background: rgba(239,68,68,0.08);
  border-radius: 8px;
  font-size: 12px; color: #ef4444;
}
```

---

## Fix 7: Sync Engine — Frontend Sync Trigger + Status Display

**Problem:** Need frontend functions to trigger syncs, display sync progress, and show sync history.

**Approach:**
```javascript
async function triggerSync(provider) {
  showLoadingOverlay(`Syncing with ${provider}...`);

  try {
    const token = getAccessToken();
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/integrations-api/sync/${provider}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const result = await response.json();
    if (result.error) throw new Error(result.error);

    hideLoadingOverlay();

    // Show sync results
    const imported = result.imported || 0;
    const exported = result.exported || 0;
    const conflicts = result.conflicts || 0;
    const errors = result.errors || 0;

    let message = `Sync complete: ${imported} imported, ${exported} exported`;
    if (conflicts > 0) message += `, ${conflicts} conflicts`;
    if (errors > 0) message += `, ${errors} errors`;

    showToast(message, errors > 0 ? 'warning' : 'success');
    renderIntegrationsPage(); // refresh statuses

  } catch (err) {
    hideLoadingOverlay();
    showToast(`Sync failed: ${err.message}`, 'error');
  }
}

async function disconnectIntegration(provider) {
  if (!confirm(`Disconnect ${provider}? This will stop syncing and remove the connection.`)) return;

  try {
    const token = getAccessToken();
    await fetch(
      `${SUPABASE_URL}/functions/v1/integrations-oauth/disconnect/${provider}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );

    renderIntegrationsPage();
    showToast(`${provider} disconnected`, 'info');
  } catch (err) {
    showToast(`Failed to disconnect: ${err.message}`, 'error');
  }
}

async function fetchIntegrationStatuses() {
  try {
    const token = getAccessToken();
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/integrations-oauth/status`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await response.json();
    return data.connections || [];
  } catch {
    return [];
  }
}

async function fetchProviderProjects(provider) {
  try {
    const token = getAccessToken();
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/integrations-api/projects/${provider}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await response.json();
    return data.projects || [];
  } catch {
    return [];
  }
}
```

---

## Fix 8: Setup Guide — What You Need to Do Manually

**Problem:** Claude Code can build all the code, but OAuth apps must be registered manually in each provider's developer console. Create a setup guide documenting every step.

**Create file:** `INTEGRATION_SETUP_GUIDE.md` in the repo root.

Contents:
```markdown
# Roadmap OS — Integration Setup Guide

After Claude Code builds the integration framework, you need to register OAuth apps with each provider.
Set the resulting Client ID and Client Secret as Supabase secrets.

## Callback URL (same for all providers)
`https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/{provider}`

Replace `{provider}` with: `jira`, `github`, `slack`, `asana`, `linear`

---

## 1. Jira (Atlassian)
1. Go to https://developer.atlassian.com/console/myapps/
2. Create new app → "OAuth 2.0 (3LO)"
3. Add scopes: `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`
4. Set callback URL: `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/jira`
5. Copy Client ID and Client Secret
6. Set in Supabase:
   ```bash
   supabase secrets set JIRA_CLIENT_ID=your_client_id
   supabase secrets set JIRA_CLIENT_SECRET=your_client_secret
   ```

## 2. GitHub
1. Go to https://github.com/settings/developers → "OAuth Apps" → "New OAuth App"
2. App name: "Roadmap OS"
3. Homepage URL: `https://pmroadmapper.com`
4. Callback URL: `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/github`
5. Copy Client ID and generate Client Secret
6. Set in Supabase:
   ```bash
   supabase secrets set GITHUB_CLIENT_ID=your_client_id
   supabase secrets set GITHUB_CLIENT_SECRET=your_client_secret
   ```

## 3. Slack
1. Go to https://api.slack.com/apps → "Create New App" → "From scratch"
2. App name: "Roadmap OS", select workspace
3. OAuth & Permissions → Add redirect URL: `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/slack`
4. Bot Token Scopes: `channels:read`, `chat:write`, `incoming-webhook`
5. User Token Scopes: `channels:read`
6. Install to workspace, then go to "Basic Information" for Client ID and Secret
7. Set in Supabase:
   ```bash
   supabase secrets set SLACK_CLIENT_ID=your_client_id
   supabase secrets set SLACK_CLIENT_SECRET=your_client_secret
   ```

## 4. Asana
1. Go to https://app.asana.com/0/developer-console → "Create new app"
2. App name: "Roadmap OS"
3. Redirect URL: `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/asana`
4. Copy Client ID and Client Secret
5. Set in Supabase:
   ```bash
   supabase secrets set ASANA_CLIENT_ID=your_client_id
   supabase secrets set ASANA_CLIENT_SECRET=your_client_secret
   ```

## 5. Linear
1. Go to https://linear.app/settings/api → "OAuth Applications" → "New application"
2. App name: "Roadmap OS"
3. Redirect URL: `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/linear`
4. Copy Client ID and Client Secret
5. Set in Supabase:
   ```bash
   supabase secrets set LINEAR_CLIENT_ID=your_client_id
   supabase secrets set LINEAR_CLIENT_SECRET=your_client_secret
   ```

---

## Deploying Edge Functions
After setting secrets, deploy the new functions:
```bash
supabase functions deploy integrations-oauth --no-verify-jwt
supabase functions deploy integrations-webhook --no-verify-jwt
supabase functions deploy integrations-api
supabase functions deploy integrations-sync
```

## Applying the Migration
```bash
supabase db push
```
```

---

## Post-Fix Checklist

1. **Migration file** exists at `supabase/migrations/20260425000000_integrations.sql` with all 3 tables + RLS.
2. **Edge functions** created: `integrations-oauth`, `integrations-sync`, `integrations-webhook`, `integrations-api`.
3. **Config.toml** updated with new function entries.
4. **Integrations page** in renderer: shows 5 integration cards with Connect/Configure/Sync/Disconnect.
5. **OAuth flow** works: Connect → popup → authorize → callback → saves tokens → shows connected.
6. **Configure modal** lets users pick project/repo/channel, sync direction, target entity, frequency.
7. **Sync trigger** calls the sync function and shows results.
8. **Setup guide** created with step-by-step instructions for each provider.
9. **Dark mode** on the Integrations page fully supported.
10. **No emoji** on the Integrations page — provider icons are SVGs.
11. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
12. **Bump version** in `package.json`
13. **Rebuild web:** `cd web && npm run build`
14. **Commit:** `git add -A && git commit -m "vX.Y.Z: v10 — integration framework (Jira, GitHub, Slack, Asana, Linear)"`
15. **Update FIX_LOG_V10.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V10.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix.** Re-read changes, verify edge function syntax (Deno), check SQL.
4. **Edge functions use Deno** — NOT Node.js. Imports use `https://deno.land/` and `https://esm.sh/` URLs. No `require()`.
5. **Follow the existing edge function pattern.** Read `supabase/functions/_shared/auth.ts` and mirror its CORS handling, error format, and auth verification.
6. **SQL migrations must be idempotent.** Use `CREATE TABLE IF NOT EXISTS`. Use `CREATE POLICY ... ON ... FOR ... USING ...` pattern from existing migrations.
7. **OAuth tokens are sensitive.** They're stored in the database (encrypted at rest by Supabase). Never log them. Never return them to the frontend.
8. **Webhook endpoints must verify signatures** before processing. Unverified webhooks are rejected.
9. **The sync engine must be idempotent.** Running the same sync twice produces the same result. Use entity mappings to prevent duplicates.
10. **Dark mode, zero emoji, CSS variables** — same rules as always for any UI added.
11. **The setup guide (Fix 8) is critical documentation.** Without it, the integrations won't work because OAuth apps need manual registration.
