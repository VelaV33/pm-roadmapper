-- billing_requests: queue of customer-initiated billing actions that the
-- ops team / a future automation processes against Paystack out-of-band.
-- Examples: cancel subscription, accept retention discount, switch to yearly,
-- add seats, contact sales, update payment method.
--
-- We intentionally do NOT call Paystack from the client. Every action lands
-- here as a row; status moves pending → processed once the team applies it.
-- This keeps secret keys server-side and gives an audit trail.

CREATE TABLE IF NOT EXISTS public.billing_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL,
  request_type text NOT NULL CHECK (request_type IN (
    'cancel',
    'retention_discount',
    'add_seats',
    'switch_plan',
    'contact_sales',
    'update_payment'
  )),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','dismissed')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS billing_requests_user_idx     ON public.billing_requests (user_id);
CREATE INDEX IF NOT EXISTS billing_requests_status_idx   ON public.billing_requests (status);
CREATE INDEX IF NOT EXISTS billing_requests_created_idx  ON public.billing_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS billing_requests_type_idx     ON public.billing_requests (request_type);

ALTER TABLE public.billing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_requests FORCE ROW LEVEL SECURITY;

-- Users can read their own requests (so the page can show "we're processing
-- your cancel request") and create new ones. They can NOT update or delete —
-- that's the ops team's job via service role.
DROP POLICY IF EXISTS billing_requests_own_select ON public.billing_requests;
CREATE POLICY billing_requests_own_select ON public.billing_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS billing_requests_own_insert ON public.billing_requests;
CREATE POLICY billing_requests_own_insert ON public.billing_requests
  FOR INSERT WITH CHECK (user_id = auth.uid() AND email = auth.email());

GRANT SELECT, INSERT ON public.billing_requests TO authenticated;
