-- Fix shared_roadmaps RLS: use auth.jwt() instead of querying auth.users
DROP POLICY IF EXISTS "Recipients read shares" ON shared_roadmaps;
CREATE POLICY "Recipients read shares" ON shared_roadmaps FOR SELECT USING (
  lower(recipient_email) = lower(auth.jwt() ->> 'email')
);
