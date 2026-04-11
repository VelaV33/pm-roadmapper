-- ═══════════════════════════════════════════════════════════════════════════
-- Baseline migration: tables originally created via Supabase Studio
--
-- HISTORICAL CONTEXT: Three tables (`roadmap_data`, `shared_roadmaps`,
-- `roadmap_comments`) were originally created interactively in the Supabase
-- Studio UI rather than through migration files. Later migrations
-- (20260403000000_fix_rls_policies.sql, 20260403000002_add_unique_constraint.sql,
-- 20260408000000_security_hardening.sql, etc.) modify these tables, but the
-- original CREATE TABLE statements were never committed to the repo. As a
-- result, a fresh `supabase db push` against a new project would fail —
-- the later migrations reference tables that don't exist yet.
--
-- This file fixes that gap. Every statement uses IF NOT EXISTS so it's
-- safe to apply against the production database (which already has these
-- tables) AND against a fresh database (which doesn't). The contents were
-- recovered from production via pg_catalog inspection on 2026-04-10.
--
-- IMPORTANT: This file is timestamped earlier than every other migration
-- (2026-01-01) so it runs FIRST in chronological ordering. The remote
-- production database has been told via `supabase migration repair --status
-- applied 20260101000000` that this migration is already applied, so it
-- won't be re-run there. Fresh databases will run it normally.
--
-- RLS policies for these tables are NOT in this file — they live in the
-- existing migrations (20260403000000, 20260403000001, 20260408000000) and
-- run after this baseline. This file just creates the table shells.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── roadmap_data ─────────────────────────────────────────────────────────
-- One JSONB blob per user containing their entire roadmap state. The unique
-- constraint on user_id is enforced separately in
-- 20260403000002_add_unique_constraint.sql; we keep that history intact
-- rather than duplicating it here.
CREATE TABLE IF NOT EXISTS public.roadmap_data (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        jsonb       NOT NULL,
  updated_at  timestamptz DEFAULT now()
);
-- ─── shared_roadmaps ──────────────────────────────────────────────────────
-- "User A shares their roadmap with email B". Recipient may or may not be a
-- registered user yet. Lookup by recipient_email at sign-in time so the
-- shared roadmap appears as a tab.
CREATE TABLE IF NOT EXISTS public.shared_roadmaps (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_name      text        NOT NULL,
  owner_email     text        NOT NULL,
  recipient_email text        NOT NULL,
  roadmap_name    text        NOT NULL,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT shared_roadmaps_owner_id_recipient_email_key UNIQUE (owner_id, recipient_email)
);
-- ─── roadmap_comments ─────────────────────────────────────────────────────
-- Threaded comments on a specific row inside a user's roadmap. Visible to
-- the roadmap owner, the comment author, and anyone the roadmap is shared
-- with via shared_roadmaps. RLS policy lives in the original create
-- statement that was applied via Studio (the policy uses an EXISTS subquery
-- against shared_roadmaps and is left in place).
CREATE TABLE IF NOT EXISTS public.roadmap_comments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_owner_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  row_id            text        NOT NULL,
  parent_id         uuid        REFERENCES public.roadmap_comments(id) ON DELETE CASCADE,
  author_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name       text        NOT NULL,
  author_email      text        NOT NULL,
  content           text        NOT NULL,
  resolved          boolean     DEFAULT false,
  created_at        timestamptz DEFAULT now()
);
-- ─── Enable RLS on the baseline tables ────────────────────────────────────
-- Each of these is later FORCE'd in 20260408000000_security_hardening.sql
-- and 20260409100000_web_launch_isolation_and_storage.sql. We just turn it
-- on here so the later migrations have something to FORCE.
ALTER TABLE public.roadmap_data     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_roadmaps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_comments ENABLE ROW LEVEL SECURITY;
