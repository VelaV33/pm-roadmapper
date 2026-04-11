-- ═══════════════════════════════════════════════════════════════════════════
-- Teams (v1.24.0)
--
-- Org-wide teams: a super admin can create teams and assign registered users
-- as members. Distinct from the per-user CapacityIQ "teams" stored in
-- roadmap_data.data.capData (which are local to each user). These teams are
-- shared and used for ownership / filtering across the platform.
--
-- Service-role edge function (admin-api) writes to these tables. Regular
-- users have read access (so they can browse the team directory) but cannot
-- create / edit / delete teams.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.teams (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  description     text,
  color           text        NOT NULL DEFAULT '#0ea5e9',
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_name_unique UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS teams_name_idx ON public.teams (lower(name));
CREATE TABLE IF NOT EXISTS public.team_members (
  team_id         uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_in_team    text        NOT NULL DEFAULT 'member',
    -- 'member' | 'lead'
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS team_members_user_idx ON public.team_members (user_id);
-- RLS: everyone signed in can read; only service-role (admin-api) writes.
ALTER TABLE public.teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams         FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.team_members  FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read teams"        ON public.teams;
DROP POLICY IF EXISTS "Authenticated read team_members" ON public.team_members;
CREATE POLICY "Authenticated read teams"        ON public.teams        FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read team_members" ON public.team_members FOR SELECT USING (auth.role() = 'authenticated');
-- updated_at trigger
CREATE OR REPLACE FUNCTION public.teams_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS teams_updated_at_trigger ON public.teams;
CREATE TRIGGER teams_updated_at_trigger
BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.teams_touch_updated_at();
