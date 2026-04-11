-- ═══════════════════════════════════════════════════════════════════════════
-- Web launch hardening: per-user isolation + attachments storage bucket
--
-- Goal: meet the launch requirement that "one user cannot see another user's
-- data; one company cannot see another company's data". Three changes:
--
--   1. teams + team_members — currently let every authenticated user SELECT
--      every row (intended for single-tenant use). Make them strictly
--      per-creator. A user can manage their own teams; members can see the
--      teams they belong to. Cross-tenant visibility is eliminated.
--
--      Trade-off: until the planned org refactor lands, two coworkers from
--      the same real-world company will each have their own private team
--      list. Existing single-tenant deployment is unaffected (verified: 0
--      teams + 0 members in production).
--
--   2. roadmap_comments — RLS is enabled but not FORCED, inconsistent with
--      every other public table. The policy itself is correct (owner /
--      author / shared-recipient scoping). Add FORCE for defence-in-depth.
--
--   3. attachments storage bucket — needed by the web shim's pickAttachments
--      / openAttachment methods. Path-scoped RLS: each user can only read /
--      write objects under their own `{auth.uid()}/` prefix.
--
-- Service-role edge functions are unaffected by any of this — they bypass
-- RLS regardless.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Teams: per-creator isolation ──────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated read teams" ON public.teams;
CREATE POLICY "Owners and members read teams"
  ON public.teams
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Owners insert teams"
  ON public.teams
  FOR INSERT
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owners update teams"
  ON public.teams
  FOR UPDATE
  USING (created_by = auth.uid());
CREATE POLICY "Owners delete teams"
  ON public.teams
  FOR DELETE
  USING (created_by = auth.uid());
-- ─── 2. team_members: strict per-team-creator scoping ─────────────────────

DROP POLICY IF EXISTS "Authenticated read team_members" ON public.team_members;
-- A user can always see their own membership rows (so they know which teams
-- they belong to), and the team creator can see every member of their teams.
CREATE POLICY "Members see own membership rows"
  ON public.team_members
  FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Team creators see all members of their teams"
  ON public.team_members
  FOR SELECT
  USING (team_id IN (SELECT id FROM public.teams WHERE created_by = auth.uid()));
CREATE POLICY "Team creators insert members"
  ON public.team_members
  FOR INSERT
  WITH CHECK (team_id IN (SELECT id FROM public.teams WHERE created_by = auth.uid()));
CREATE POLICY "Team creators update members"
  ON public.team_members
  FOR UPDATE
  USING (team_id IN (SELECT id FROM public.teams WHERE created_by = auth.uid()));
CREATE POLICY "Team creators delete members"
  ON public.team_members
  FOR DELETE
  USING (team_id IN (SELECT id FROM public.teams WHERE created_by = auth.uid()));
-- ─── 3. roadmap_comments: defence-in-depth FORCE RLS ──────────────────────

ALTER TABLE public.roadmap_comments FORCE ROW LEVEL SECURITY;
-- ─── 4. Attachments storage bucket + per-user path RLS ────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', false, 52428800)  -- 50 MiB
ON CONFLICT (id) DO NOTHING;
-- Path convention: every object key starts with `{auth.uid()}/...`. The
-- shim enforces this on uploads, but RLS is the source of truth. We use
-- storage.foldername(name)[1] to extract the first path segment and
-- compare it to the caller's auth.uid().
DROP POLICY IF EXISTS "Users read own attachments"   ON storage.objects;
DROP POLICY IF EXISTS "Users upload own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users update own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own attachments" ON storage.objects;
CREATE POLICY "Users read own attachments"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users upload own attachments"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users update own attachments"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users delete own attachments"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
