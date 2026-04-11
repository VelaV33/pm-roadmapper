-- ═══════════════════════════════════════════════════════════════════════════
-- Feedback Portal schema (v1.10.0)
--
-- Goals:
--   • Stakeholders can submit feedback to a PM via a public form, no login.
--   • The PM (the owner) sees those submissions in their app inbox.
--   • Stakeholders can vote on feedback items (1 per email per item).
--   • Each item can be linked to a roadmap row so the PM can close the loop.
--
-- Security:
--   • RLS on. Anonymous users can INSERT (rate-limited in the edge function),
--     but cannot SELECT/UPDATE/DELETE. The owner reads via service-role
--     edge function, never directly.
--   • Vote uniqueness enforced at the DB level — UNIQUE(feedback_item_id, voter_email).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feedback_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  description     text,
  submitter_email text,
  submitter_name  text,
  status          text        NOT NULL DEFAULT 'new',
    -- 'new' | 'reviewing' | 'planned' | 'in_progress' | 'shipped' | 'declined'
  linked_row_id   text,        -- references a row in the owner's roadmap_data JSON
  vote_count      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_items_owner_idx ON public.feedback_items (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_items_status_idx ON public.feedback_items (owner_user_id, status);
CREATE TABLE IF NOT EXISTS public.feedback_votes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_item_id  uuid        NOT NULL REFERENCES public.feedback_items(id) ON DELETE CASCADE,
  voter_email       text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_votes_unique_per_email UNIQUE (feedback_item_id, voter_email)
);
CREATE INDEX IF NOT EXISTS feedback_votes_item_idx ON public.feedback_votes (feedback_item_id);
-- RLS on, deny by default (edge functions use service role)
ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_items FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_votes FORCE  ROW LEVEL SECURITY;
-- Owner can read & update their own feedback items via JWT-authenticated client.
DROP POLICY IF EXISTS "Owners read own feedback"   ON public.feedback_items;
DROP POLICY IF EXISTS "Owners update own feedback" ON public.feedback_items;
DROP POLICY IF EXISTS "Owners delete own feedback" ON public.feedback_items;
CREATE POLICY "Owners read own feedback"   ON public.feedback_items FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Owners update own feedback" ON public.feedback_items FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Owners delete own feedback" ON public.feedback_items FOR DELETE USING (auth.uid() = owner_user_id);
-- No SELECT policy on feedback_votes for the public — they're aggregated into vote_count.

-- Trigger to keep vote_count in sync
CREATE OR REPLACE FUNCTION public.fb_recompute_vote_count() RETURNS trigger AS $$
BEGIN
  UPDATE public.feedback_items
     SET vote_count = (SELECT COUNT(*) FROM public.feedback_votes WHERE feedback_item_id = NEW.feedback_item_id),
         updated_at = now()
   WHERE id = NEW.feedback_item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS feedback_votes_count_trigger ON public.feedback_votes;
CREATE TRIGGER feedback_votes_count_trigger
AFTER INSERT OR DELETE ON public.feedback_votes
FOR EACH ROW EXECUTE FUNCTION public.fb_recompute_vote_count();
