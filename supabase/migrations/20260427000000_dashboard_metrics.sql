-- v1.47.0: Per-user weekly dashboard KPI snapshots for the redesigned
-- Dashboard sparklines. Snapshotted every dashboard load by the
-- dashboard-snapshot edge function. Capped to current ISO week per user via PK;
-- backfill writes one row per past week (up to 12) where derivable.
CREATE TABLE IF NOT EXISTS public.dashboard_metrics (
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_iso             text NOT NULL,                        -- e.g. "2026-W17"
  shipped_7d           int,                                  -- nullable: backfill rows may not have all metrics
  shipping_next_7d     int,
  at_risk_count        int,
  avg_g2m              numeric(5,2),                         -- 0-100
  success_criteria_pct numeric(5,2),                         -- 0-100
  snapshot_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_iso)
);

ALTER TABLE public.dashboard_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_metrics FORCE ROW LEVEL SECURITY;

-- Users can only read/write their own snapshots. Service-role inside the
-- edge function bypasses RLS for the upsert; these policies cover any
-- direct PostgREST access from the client.
DROP POLICY IF EXISTS dm_select_own ON public.dashboard_metrics;
CREATE POLICY dm_select_own ON public.dashboard_metrics
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS dm_insert_own ON public.dashboard_metrics;
CREATE POLICY dm_insert_own ON public.dashboard_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS dm_update_own ON public.dashboard_metrics;
CREATE POLICY dm_update_own ON public.dashboard_metrics
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS dm_user_week_idx
  ON public.dashboard_metrics (user_id, week_iso DESC);
