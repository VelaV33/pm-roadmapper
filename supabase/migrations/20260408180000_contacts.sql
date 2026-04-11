-- ═══════════════════════════════════════════════════════════════════════════
-- Contacts table (v1.14.0)
--
-- Holds "people" records that can be assigned as task owners but who aren't
-- (yet) registered users of the app. The PM types in someone's name + email,
-- they get added to the contacts table as 'inactive', and an admin can later
-- send them an invite link that converts them to an active registered user.
--
-- Eventually this is the table that will sit alongside auth.users in the
-- multi-tenant org architecture (v1.15.0+). For now it's owner-scoped: each
-- user sees their own contacts. The org refactor will replace owner_user_id
-- with org_id.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contacts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text        NOT NULL,
  name            text,
  status          text        NOT NULL DEFAULT 'inactive',
    -- 'active'    = the email matches a registered auth.users row
    -- 'inactive'  = no registered account yet
    -- 'invited'   = invite link has been sent but not yet accepted
  invite_sent_at  timestamptz,
  invite_token    text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_unique_per_owner UNIQUE (owner_user_id, email)
);
CREATE INDEX IF NOT EXISTS contacts_owner_idx  ON public.contacts (owner_user_id, status);
CREATE INDEX IF NOT EXISTS contacts_email_idx  ON public.contacts (lower(email));
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts FORCE  ROW LEVEL SECURITY;
-- Owner-only RLS: each user sees / writes their own contacts. Service-role
-- edge functions bypass RLS for cross-user lookups (e.g. matching contacts
-- against auth.users to compute the active/inactive split).
DROP POLICY IF EXISTS "Owners read own contacts"   ON public.contacts;
DROP POLICY IF EXISTS "Owners write own contacts"  ON public.contacts;
DROP POLICY IF EXISTS "Owners update own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Owners delete own contacts" ON public.contacts;
CREATE POLICY "Owners read own contacts"   ON public.contacts FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Owners write own contacts"  ON public.contacts FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Owners update own contacts" ON public.contacts FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Owners delete own contacts" ON public.contacts FOR DELETE USING (auth.uid() = owner_user_id);
-- updated_at trigger
CREATE OR REPLACE FUNCTION public.contacts_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS contacts_updated_at_trigger ON public.contacts;
CREATE TRIGGER contacts_updated_at_trigger
BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.contacts_touch_updated_at();
