-- ═══════════════════════════════════════════════════════════════════════════
-- Fix user_profiles RLS (web-version preparation)
--
-- The original migration (20260323100000_competitive_analysis.sql) created:
--
--   CREATE POLICY "Service role full access" ON user_profiles
--     FOR ALL USING (true);
--
-- This is a critical bug. RLS policies are OR'd, so `USING (true)` on
-- `FOR ALL` lets every authenticated user SELECT/INSERT/UPDATE/DELETE every
-- other user's profile row — including setting their own `tier` to 'premium'.
-- Service role already bypasses RLS without needing a policy at all, so this
-- policy isn't necessary; it just opens the door.
--
-- This migration:
--   1. Adds an on_auth_user_created trigger that creates a 'basic' profile
--      row automatically. SECURITY DEFINER, owned by postgres (which has
--      BYPASSRLS in Supabase) — bypasses FORCE RLS without weakening it.
--      This is the canonical Supabase pattern for handle_new_user triggers.
--   2. Backfills profile rows for any existing auth.users without one, so
--      dropping the open policy below cannot strand anyone.
--   3. Adds a tightly-scoped self-INSERT fallback policy (tier forced to
--      'basic') so the renderer's defensive INSERT path at index.html:7895
--      keeps working if the trigger ever fails. Users still cannot
--      self-grant premium.
--   4. Drops the dangerous "Service role full access" policy LAST, after
--      everything above is in place — no window where signup is broken.
--
-- Deliberately NOT added: UPDATE / DELETE policies for users. Tier upgrades
-- stay service-role only. Account deletion cascades from auth.users.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Trigger function: auto-create basic profile on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, tier)
  VALUES (NEW.id, 'basic')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_user_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_user_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- 2. Backfill existing users. Idempotent.
INSERT INTO public.user_profiles (user_id, tier)
SELECT u.id, 'basic'
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.user_id = u.id
 WHERE p.id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- 3. Self-INSERT fallback. Tier is forced to 'basic' so a malicious client
--    cannot self-grant premium. Tier upgrades remain service-role only.
DROP POLICY IF EXISTS "Users create own basic profile" ON public.user_profiles;
CREATE POLICY "Users create own basic profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND tier = 'basic');

-- 4. Drop the dangerous open policy. Service role bypasses RLS without it.
DROP POLICY IF EXISTS "Service role full access" ON public.user_profiles;
