-- Extend leads with structured profiling fields captured by the new
-- /contact form on pmroadmapper.com. All five dropdowns are stored as
-- plain text (not enums) so the marketing site can iterate copy / add
-- options without a schema migration each time. Existing rows get NULLs.
--
-- Also tracks email_sent_at so we can tell which leads we've already
-- notified hello@pmroadmapper.com about (idempotent retries).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS primary_interest text,
  ADD COLUMN IF NOT EXISTS team_size        text,
  ADD COLUMN IF NOT EXISTS current_tool     text,
  ADD COLUMN IF NOT EXISTS intent           text,
  ADD COLUMN IF NOT EXISTS timeline         text,
  ADD COLUMN IF NOT EXISTS email_sent_at    timestamptz;

-- Helpful for the admin lead-list filters.
CREATE INDEX IF NOT EXISTS leads_primary_interest_idx ON public.leads (primary_interest);
CREATE INDEX IF NOT EXISTS leads_intent_idx           ON public.leads (intent);
