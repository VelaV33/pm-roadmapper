// POST /dashboard-snapshot
// Body: { mode?: "current" | "backfill" }
// Headers: Authorization: Bearer <user JWT>
//
// Computes the 5 pulse-strip KPIs from the caller's roadmap_data JSONB blob
// and upserts into public.dashboard_metrics keyed by (user_id, week_iso).
// - mode=current  (default): writes/updates the row for THIS ISO week.
//   Idempotent — safe to call on every dashboard load.
// - mode=backfill: walks projectPlans.tasks[].doneAt for the past 12 weeks
//   and inserts shipped_7d for each historical week. Other metrics are NOT
//   historically derivable, so they're left NULL — sparkline renderer treats
//   NULL as a gap.
//
// Caller usually issues mode=current on every dashboard open, plus mode=backfill
// once per user (gated by an appSettings flag in the JSONB blob).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse } from "../_shared/auth.ts";

// ── ISO week helpers ─────────────────────────────────────────────────────
// "YYYY-Www" — ISO-8601 week. Week 1 contains the first Thursday of the year.
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Set to Thursday in current week (week-numbering anchor).
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Returns [startMs, endMs] of the ISO week containing d (Mon 00:00 UTC → next Mon).
function isoWeekRange(d: Date): [number, number] {
  const day = d.getUTCDay() || 7;            // 1..7, Mon..Sun
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);
  const next = new Date(monday.getTime() + 7 * 86400000);
  return [monday.getTime(), next.getTime()];
}

// ── Pulse calculations (server-side; mirror the renderer's logic) ────────
type Blob = {
  rows?: Array<{ bars?: Array<{ c?: string }>; launchOutcomes?: any; expectedOutcomes?: any[] }>;
  projectPlans?: Array<{ tasks?: Array<{ status?: string; doneAt?: string; endDate?: string; dueDate?: string }> }>;
  g2mData?: Record<string, { items?: Array<{ value?: string }> }>;
  appSettings?: Record<string, unknown>;
};

function calcShipped7d(blob: Blob, asOf: number): number {
  const start = asOf - 7 * 86400000;
  let count = 0;
  for (const p of blob.projectPlans || []) {
    for (const t of p.tasks || []) {
      if (!t.doneAt) continue;
      const ts = Date.parse(t.doneAt);
      if (isFinite(ts) && ts >= start && ts < asOf) count++;
    }
  }
  return count;
}

function calcShippingNext7d(blob: Blob, asOf: number): number {
  const end = asOf + 7 * 86400000;
  let count = 0;
  for (const p of blob.projectPlans || []) {
    for (const t of p.tasks || []) {
      if ((t.status || "").toLowerCase() === "done") continue;
      const dateStr = t.endDate || t.dueDate;
      if (!dateStr) continue;
      const ts = Date.parse(dateStr);
      if (isFinite(ts) && ts >= asOf && ts < end) count++;
    }
  }
  return count;
}

function calcAtRiskCount(blob: Blob): number {
  let count = 0;
  for (const r of blob.rows || []) {
    const bars = r.bars || [];
    if (!bars.length) continue;
    const c = bars[bars.length - 1]?.c;
    if (c === "r" || c === "o") count++;
  }
  return count;
}

function calcAvgG2M(blob: Blob): number | null {
  const products = Object.values(blob.g2mData || {});
  if (!products.length) return null;
  let sum = 0, n = 0;
  for (const p of products) {
    const items = p.items || [];
    const applicable = items.filter((i) => (i.value || "") !== "na");
    if (!applicable.length) continue;
    const yes = applicable.filter((i) => (i.value || "") === "yes").length;
    sum += (yes / applicable.length) * 100;
    n++;
  }
  return n > 0 ? Math.round((sum / n) * 100) / 100 : null;
}

function calcSuccessCriteriaPct(blob: Blob): number | null {
  // Outcomes can live on row.expectedOutcomes[] or row.launchOutcomes.criteria[]
  // depending on app version. Walk both. We count {met} / {met+missed+partial+pending}
  // — but only for outcomes that are tied to a released initiative (so untouched
  // outcomes on Strategy items don't drag the % down).
  let total = 0, met = 0;
  for (const r of blob.rows || []) {
    const released =
      (r.bars || []).some((b) => b?.c === "g") ||
      !!(r.launchOutcomes && r.launchOutcomes.releasedAt);
    if (!released) continue;

    const outcomes: any[] = [];
    if (Array.isArray(r.expectedOutcomes)) outcomes.push(...r.expectedOutcomes);
    if (r.launchOutcomes?.criteria && Array.isArray(r.launchOutcomes.criteria)) {
      outcomes.push(...r.launchOutcomes.criteria);
    }
    if (r.launchOutcomes?.successCriteria && Array.isArray(r.launchOutcomes.successCriteria)) {
      outcomes.push(...r.launchOutcomes.successCriteria);
    }
    for (const o of outcomes) {
      const status = String(o?.status || o?.result || "").toLowerCase();
      if (!status) continue;
      total++;
      if (status === "met" || status === "achieved" || status === "success") met++;
    }
  }
  return total > 0 ? Math.round((met / total) * 10000) / 100 : null;
}

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);
  const body = await req.json().catch(() => ({}));
  const mode = (body && body.mode) === "backfill" ? "backfill" : "current";

  // Load the caller's data blob.
  const { data: rd, error: rdErr } = await supabase
    .from("roadmap_data")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();
  if (rdErr) {
    console.error("[dashboard-snapshot] roadmap_data load error:", rdErr.message);
    return errorResponse("Failed to load user data", 500);
  }
  const blob: Blob = (rd?.data as Blob) || {};

  if (mode === "current") {
    const now = new Date();
    const weekIso = isoWeekKey(now);
    const ms = now.getTime();

    const row = {
      user_id:              user.id,
      week_iso:             weekIso,
      shipped_7d:           calcShipped7d(blob, ms),
      shipping_next_7d:     calcShippingNext7d(blob, ms),
      at_risk_count:        calcAtRiskCount(blob),
      avg_g2m:              calcAvgG2M(blob),
      success_criteria_pct: calcSuccessCriteriaPct(blob),
      snapshot_at:          new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from("dashboard_metrics")
      .upsert(row, { onConflict: "user_id,week_iso" });
    if (upErr) {
      console.error("[dashboard-snapshot] upsert error:", upErr.message);
      return errorResponse("Failed to save snapshot", 500);
    }

    return jsonResponse({ ok: true, mode: "current", week_iso: weekIso, written: row });
  }

  // mode === "backfill"
  // Walk past 12 ISO weeks and write shipped_7d for each. Other metrics
  // are not historically derivable — leave NULL.
  const insertedWeeks: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const weekDate = new Date(Date.now() - i * 7 * 86400000);
    const weekIso = isoWeekKey(weekDate);
    const [start, end] = isoWeekRange(weekDate);

    let shipped = 0;
    for (const p of blob.projectPlans || []) {
      for (const t of p.tasks || []) {
        if (!t.doneAt) continue;
        const ts = Date.parse(t.doneAt);
        if (isFinite(ts) && ts >= start && ts < end) shipped++;
      }
    }

    // Only insert if no row exists for this week — never clobber a real
    // current-week snapshot with a NULL backfill row.
    const { data: existing } = await supabase
      .from("dashboard_metrics")
      .select("week_iso")
      .eq("user_id", user.id)
      .eq("week_iso", weekIso)
      .maybeSingle();
    if (existing) continue;

    const { error: insErr } = await supabase
      .from("dashboard_metrics")
      .insert({
        user_id:    user.id,
        week_iso:   weekIso,
        shipped_7d: shipped,
        // shipping_next_7d / at_risk_count / avg_g2m / success_criteria_pct
        // omitted -> NULL. Sparkline treats NULL as a gap.
      });
    if (insErr) {
      console.error("[dashboard-snapshot] backfill insert error:", weekIso, insErr.message);
      // Continue with remaining weeks — partial backfill is better than nothing.
      continue;
    }
    insertedWeeks.push(weekIso);
  }

  return jsonResponse({ ok: true, mode: "backfill", inserted_weeks: insertedWeeks });
}));
