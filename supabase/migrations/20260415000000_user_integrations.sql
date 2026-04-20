-- ═══════════════════════════════════════════════════════════════════════════
-- User integrations (v1.28.0) — third-party OAuth connections
--
-- Stores per-user OAuth tokens for external services (Slack first; Jira /
-- Linear / GitHub to follow). A single user may connect multiple accounts
-- from the same provider (e.g. two Slack workspaces), so the natural key is
-- (owner_user_id, provider, external_account_id).
--
-- Security model:
--   - Tokens never leave the server. The client cannot SELECT this table at
--     all — no read policy is declared for authenticated users. Status /
--     workspace-name lookups go through an edge function that returns only
--     safe fields.
--   - All writes happen through service-role edge functions after the caller
--     has been JWT-verified. This avoids a class of bugs where a stray client
--     query could expose a bot token.
--   - FORCE RLS so even the table owner is subject to the (empty) policy set.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider              text        NOT NULL,
    -- 'slack' | 'jira' | 'linear' | 'github' | ...
  external_account_id   text        NOT NULL,
    -- Slack: team_id. Jira: cloudId. Linear: workspaceId. GitHub: installationId.
  display_name          text,
    -- Human-readable workspace / org name for the UI ("Acme Workspace")
  access_token          text        NOT NULL,
  refresh_token         text,
    -- Slack bot tokens don't expire; Jira's do (1hr). Nullable for providers
    -- that use long-lived tokens.
  token_type            text,
  scope                 text,
  expires_at            timestamptz,
  external_user_id      text,
    -- Provider-side user id — Slack: authed_user.id, Jira: accountId, etc.
    -- Useful for posting "on behalf of" messages.
  bot_user_id           text,
    -- Slack-specific: the bot user id returned by oauth.v2.access. Needed for
    -- @mentioning the bot in messages.
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- Provider-specific extras that don't deserve their own column
    -- (Slack: incoming_webhook{}, Jira: available sites[], etc.)
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_integrations_unique UNIQUE (owner_user_id, provider, external_account_id)
);
CREATE INDEX IF NOT EXISTS user_integrations_owner_idx    ON public.user_integrations (owner_user_id, provider);
CREATE INDEX IF NOT EXISTS user_integrations_provider_idx ON public.user_integrations (provider);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations FORCE  ROW LEVEL SECURITY;

-- NO policies are declared for authenticated users.
-- This means:
--   - supabase-js clients cannot SELECT, INSERT, UPDATE, or DELETE rows
--   - only service-role edge functions (which bypass RLS) can touch this table
--   - status lookups go through an edge function that returns only safe fields
-- Defense-in-depth: even if a future migration accidentally adds a permissive
-- policy, tokens should be treated as secret and never echoed to the client.

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.user_integrations_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS user_integrations_updated_at_trigger ON public.user_integrations;
CREATE TRIGGER user_integrations_updated_at_trigger
BEFORE UPDATE ON public.user_integrations
FOR EACH ROW EXECUTE FUNCTION public.user_integrations_touch_updated_at();
