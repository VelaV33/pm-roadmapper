-- Trial subscription state + team invite flow.
--
-- Context: the existing Paystack migration (20260410212624) set up
-- `subscription_status` ∈ {'none','active','past_due','cancelled'} on
-- `user_profiles`, plus `tier_expires_at` (reused as trial expiry). This
-- migration:
--   1. Adds 'trialing' as a valid subscription_status.
--   2. Adds audit columns: trial_started_at, invited_by_user_id,
--      last_trial_reminder_sent_at.
--   3. Creates `team_invites` for outbound email invites with a redeemable
--      token; each redemption starts a 30-day trial on the invitee's account.
--   4. Exposes `my_subscription_state()` so the client can fetch its own
--      trial/subscription snapshot in one round-trip without selecting the
--      full profile row.

-- 1. Widen the subscription_status check to include 'trialing'.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_subscription_status_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_subscription_status_check
  CHECK (subscription_status IN ('none','trialing','active','past_due','cancelled'));

-- 2. Audit columns. tier_expires_at already exists and is the trial-end field.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS trial_started_at            timestamptz,
  ADD COLUMN IF NOT EXISTS invited_by_user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_trial_reminder_sent_at timestamptz;

-- 3. team_invites. Token is opaque (random base64url); inviter_user_id comes
-- from the verified JWT, never from the body.
CREATE TABLE IF NOT EXISTS public.team_invites (
  id                 uuid primary key default gen_random_uuid(),
  inviter_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email      text NOT NULL,
  invite_token       text NOT NULL UNIQUE,
  team_id            text,
  team_name          text,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','expired','revoked')),
  trial_granted_days integer NOT NULL DEFAULT 30,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at        timestamptz,
  accepted_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS team_invites_email_idx   ON public.team_invites (lower(invited_email));
CREATE INDEX IF NOT EXISTS team_invites_token_idx   ON public.team_invites (invite_token);
CREATE INDEX IF NOT EXISTS team_invites_inviter_idx ON public.team_invites (inviter_user_id);
CREATE INDEX IF NOT EXISTS team_invites_status_idx  ON public.team_invites (status);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites FORCE ROW LEVEL SECURITY;

-- Inviters see + manage their own rows. Service role bypasses RLS, so the
-- redeem flow (edge function with service_role key) can still read by token.
DROP POLICY IF EXISTS team_invites_own_select ON public.team_invites;
CREATE POLICY team_invites_own_select ON public.team_invites
  FOR SELECT USING (inviter_user_id = auth.uid());

DROP POLICY IF EXISTS team_invites_own_insert ON public.team_invites;
CREATE POLICY team_invites_own_insert ON public.team_invites
  FOR INSERT WITH CHECK (inviter_user_id = auth.uid());

DROP POLICY IF EXISTS team_invites_own_update ON public.team_invites;
CREATE POLICY team_invites_own_update ON public.team_invites
  FOR UPDATE USING (inviter_user_id = auth.uid()) WITH CHECK (inviter_user_id = auth.uid());

DROP POLICY IF EXISTS team_invites_own_delete ON public.team_invites;
CREATE POLICY team_invites_own_delete ON public.team_invites
  FOR DELETE USING (inviter_user_id = auth.uid());

-- 4. Snapshot the authed user's subscription + trial state. Computed server-
-- side so the client doesn't need to reason about tier_expires_at vs now().
CREATE OR REPLACE FUNCTION public.my_subscription_state()
RETURNS TABLE(
  user_id             uuid,
  tier                text,
  subscription_status text,
  trial_started_at    timestamptz,
  tier_expires_at     timestamptz,
  seconds_until_expiry double precision,
  is_lapsed           boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.tier,
    p.subscription_status,
    p.trial_started_at,
    p.tier_expires_at,
    EXTRACT(EPOCH FROM (p.tier_expires_at - now())),
    -- "Lapsed" = either trial or paid sub has run out and the user isn't in an
    -- active state. Clients use this for the soft-block banner + popup.
    CASE
      WHEN p.subscription_status = 'active' THEN false
      WHEN p.tier_expires_at IS NOT NULL AND p.tier_expires_at < now() THEN true
      WHEN p.subscription_status IN ('past_due','cancelled') THEN true
      ELSE false
    END
  FROM public.user_profiles p
  WHERE p.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_subscription_state() TO authenticated;

-- 5. grant basic selects to authenticated role so rollups of invites work in
-- the client without widening RLS policies further.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invites TO authenticated;
