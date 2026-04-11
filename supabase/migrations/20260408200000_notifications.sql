-- ═══════════════════════════════════════════════════════════════════════════
-- Notifications table (v1.15.0 — Notifications Phase 1)
--
-- In-app notifications. When something changes that affects a user (a Plan
-- task is assigned to them, a G2M item is assigned to them, etc.), a row is
-- written here. The recipient sees it in their notifications inbox the next
-- time they open the app or poll the table.
--
-- Phase 2 will add email delivery on top of this.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_user_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  type            text        NOT NULL,
    -- 'plan_task_assigned' | 'g2m_assigned' | 'comment' | 'share_received' | 'mention' | ...
  title           text        NOT NULL,
  body            text,
  link            text,
    -- Optional deep link string (e.g. 'plan:abc123', 'g2m:product-name', 'row:r_xyz')
  read            boolean     NOT NULL DEFAULT false,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON public.notifications (recipient_user_id, read, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE  ROW LEVEL SECURITY;
-- Only the recipient can read / update / delete their own notifications.
-- Inserts happen via the service-role edge function.
DROP POLICY IF EXISTS "Recipients read own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Recipients update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Recipients delete own notifications" ON public.notifications;
CREATE POLICY "Recipients read own notifications"   ON public.notifications FOR SELECT USING (auth.uid() = recipient_user_id);
CREATE POLICY "Recipients update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = recipient_user_id);
CREATE POLICY "Recipients delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = recipient_user_id);
