-- Replace tier constraint with the new standard/pro vocabulary
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_tier_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_tier_check
  CHECK (tier IN ('basic','standard','pro','premium'));

-- Paystack identifiers + subscription status
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS paystack_customer_code      text,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code  text,
  ADD COLUMN IF NOT EXISTS paystack_email_token        text,
  ADD COLUMN IF NOT EXISTS subscription_status         text NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('none','active','past_due','cancelled')),
  ADD COLUMN IF NOT EXISTS updated_at                  timestamptz NOT NULL DEFAULT now();

-- Audit log: every Paystack event we receive, raw payload + outcome
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

CREATE INDEX IF NOT EXISTS subscription_events_email_idx ON public.subscription_events (email);
CREATE INDEX IF NOT EXISTS subscription_events_user_id_idx ON public.subscription_events (user_id);
CREATE INDEX IF NOT EXISTS subscription_events_created_at_idx ON public.subscription_events (created_at desc);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically; no public policies needed.;
