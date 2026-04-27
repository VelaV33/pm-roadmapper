-- ============================================
-- Microsoft Teams + Planner integration (v1.46.0)
-- Adds 'teams' as the sixth integration provider, joining Jira, GitHub,
-- Slack, Asana and Linear. Teams combines two sub-features:
--   1. Channel notifications  (Slack-equivalent — post status updates)
--   2. Microsoft Planner sync (Jira-equivalent — bidirectional task sync)
-- The connection's `config` JSONB carries both:
--   { planId, planName, groupId,
--     notificationTeamId, notificationChannelId,
--     notificationTeamName, notificationChannelName,
--     userId, displayName, email }
-- ============================================

ALTER TABLE public.integration_connections
  DROP CONSTRAINT IF EXISTS integration_connections_provider_check;

ALTER TABLE public.integration_connections
  ADD CONSTRAINT integration_connections_provider_check
  CHECK (provider IN ('jira', 'github', 'slack', 'asana', 'linear', 'teams'));
