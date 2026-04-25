-- ============================================
-- Integration tables for Roadmap OS (v1.41.0)
-- Two-way sync framework for Jira, GitHub, Slack, Asana, Linear.
-- These tables are separate from the older `user_integrations`
-- (v1.28.0 Slack-only scaffold) to avoid disturbing existing flows.
-- ============================================

-- 1. Integration connections — one row per user per provider
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
  -- Jira: { cloudId, siteUrl, projectKey, projectId, projectName }
  -- GitHub: { owner, repo, repoId, username }
  -- Slack: { teamId, teamName, channelId, channelName, botToken }
  -- Asana: { workspaceGid, projectGid, projectName, userId, userName }
  -- Linear: { teamId, teamName, userId, userName }

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

-- Owner-only access. Service role bypasses RLS for edge-function writes.
DROP POLICY IF EXISTS "Users can manage own connections" ON public.integration_connections;
CREATE POLICY "Users can manage own connections" ON public.integration_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own mappings" ON public.integration_mappings;
CREATE POLICY "Users can manage own mappings" ON public.integration_mappings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own sync logs" ON public.integration_sync_log;
CREATE POLICY "Users can view own sync logs" ON public.integration_sync_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connections_user ON public.integration_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_provider ON public.integration_connections(provider);
CREATE INDEX IF NOT EXISTS idx_mappings_connection ON public.integration_mappings(connection_id);
CREATE INDEX IF NOT EXISTS idx_mappings_ros_entity ON public.integration_mappings(ros_entity_id);
CREATE INDEX IF NOT EXISTS idx_mappings_external ON public.integration_mappings(external_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_connection ON public.integration_sync_log(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON public.integration_sync_log(created_at DESC);

-- Triggers — keep updated_at fresh on every UPDATE
CREATE OR REPLACE FUNCTION update_integration_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS integration_connections_updated ON public.integration_connections;
CREATE TRIGGER integration_connections_updated
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION update_integration_timestamp();

DROP TRIGGER IF EXISTS integration_mappings_updated ON public.integration_mappings;
CREATE TRIGGER integration_mappings_updated
  BEFORE UPDATE ON public.integration_mappings
  FOR EACH ROW EXECUTE FUNCTION update_integration_timestamp();
