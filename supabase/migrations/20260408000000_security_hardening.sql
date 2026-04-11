-- ═══════════════════════════════════════════════════════════════════════════
-- Security hardening migration
--
-- Goals:
--   1. Force RLS enabled on every user-data table (defence-in-depth — even
--      if a future code change forgets to use the service role correctly,
--      RLS still protects user data).
--   2. Move super_admin role from user_metadata (user-writable) to
--      app_metadata (server-only writable).
--   3. Add a missing DELETE policy on roadmap_data so users can wipe their
--      own data without going through service-role code paths.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Force RLS on. ALTER ... FORCE ROW LEVEL SECURITY also applies RLS
--    to the table owner, so even a misconfigured connection cannot bypass.
ALTER TABLE IF EXISTS public.roadmap_data       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.roadmap_data       FORCE  ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shared_roadmaps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shared_roadmaps    FORCE  ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='competitive_analyses') THEN
    EXECUTE 'ALTER TABLE public.competitive_analyses ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.competitive_analyses FORCE  ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles') THEN
    EXECUTE 'ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.user_profiles FORCE  ROW LEVEL SECURITY';
  END IF;
END $$;
-- 2. Add DELETE policy on roadmap_data (was missing).
DROP POLICY IF EXISTS "Users delete own data" ON public.roadmap_data;
CREATE POLICY "Users delete own data" ON public.roadmap_data
  FOR DELETE USING (auth.uid() = user_id);
-- 3. Migrate roles from user_metadata (user-writable) to app_metadata
--    (server-only writable). After this runs, the only valid source of
--    truth for roles is app_metadata.
UPDATE auth.users
   SET raw_app_meta_data =
         COALESCE(raw_app_meta_data, '{}'::jsonb)
         || jsonb_build_object('role', raw_user_meta_data->>'role')
 WHERE raw_user_meta_data ? 'role'
   AND raw_user_meta_data->>'role' IS NOT NULL
   AND raw_user_meta_data->>'role' <> '';
-- Optional: scrub the role from user_metadata so the client can't see it
-- and assume it's authoritative. Commented out by default — uncomment after
-- you've confirmed the migration above worked as expected.
-- UPDATE auth.users
--    SET raw_user_meta_data = raw_user_meta_data - 'role'
--  WHERE raw_user_meta_data ? 'role';;
