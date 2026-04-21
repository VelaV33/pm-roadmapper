-- ═══════════════════════════════════════════════════════════════════════════
-- Leads table (v1.35.2)
--
-- Captures Contact Us form submissions from the public website. Each row is
-- a potential lead — name, surname, company, email and the free-form message
-- they sent, plus IP + user-agent for spam triage and a source label so we
-- can tell a submission from the login screen apart from one from the legal
-- pages or a future landing page.
--
-- Security: RLS is on with NO policies. Anonymous users cannot insert through
-- the REST API. All writes go through the `contact-submit` edge function,
-- which uses the service role key (bypasses RLS) and rate-limits per IP.
-- All reads go through `admin-api list-leads`, gated to platform admins.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.leads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  surname      text        NOT NULL,
  company      text,
  email        text        NOT NULL,
  message      text        NOT NULL,
  source       text        NOT NULL DEFAULT 'contact_form',
    -- 'contact_form' | 'login' | 'legal' | <future source>
  ip           text,
  user_agent   text,
  status       text        NOT NULL DEFAULT 'new',
    -- 'new' | 'contacted' | 'qualified' | 'converted' | 'archived'
  admin_notes  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_created_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx  ON public.leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_email_idx   ON public.leads (lower(email));

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE  ROW LEVEL SECURITY;
-- No policies: direct REST access is denied. Edge functions use service role.
