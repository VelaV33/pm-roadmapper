-- Paystack subscriptions wiring (mirrors what was applied via the marketing site).
-- Adds 'standard' and 'pro' to the tier vocabulary, stores Paystack identifiers
-- on user_profiles, and creates an audit table for every webhook event.
--
-- The matching webhook handler lives at:
--   pm-roadmapper-site/app/api/paystack/webhook/route.ts
--
-- 'premium' is intentionally kept in the constraint as a legacy value so any
-- existing rows from the pre-Paystack schema do not break.

-- 1. Replace the tier check constraint
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_tier_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_tier_check
  CHECK (tier IN ('basic','standard','pro','premium'));

-- 2. Paystack identifiers + subscription status
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS paystack_customer_code      text,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code  text,
  ADD COLUMN IF NOT EXISTS paystack_email_token        text,
  ADD COLUMN IF NOT EXISTS subscription_status         text NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('none','active','past_due','cancelled')),
  ADD COLUMN IF NOT EXISTS updated_at                  timestamptz NOT NULL DEFAULT now();

-- 3. Audit log: every Paystack event we receive, raw payload + outcome
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text not null,
  event_type  text not null,
  raw_payload jsonb not null,
  processed   boolean not null default false,
  error       text,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS subscription_events_email_idx      ON public.subscription_events (email);
CREATE INDEX IF NOT EXISTS subscription_events_user_id_idx    ON public.subscription_events (user_id);
CREATE INDEX IF NOT EXISTS subscription_events_created_at_idx ON public.subscription_events (created_at desc);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS automatically; no public policies needed.

-- 4. Helper used by the marketing site webhook to find a user by email
-- without paginating through auth.users via the admin API.
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role;
