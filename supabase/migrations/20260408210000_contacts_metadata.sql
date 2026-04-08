-- ═══════════════════════════════════════════════════════════════════════════
-- Contacts metadata column (v1.20.0)
--
-- Adds an open jsonb column so we can attach extra contact fields (team, job
-- title, phone, company, anything else) without a schema migration each time.
-- The contacts-api edge function reads/writes this column and the renderer
-- displays known keys in the contact card.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
