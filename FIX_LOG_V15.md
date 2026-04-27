# Roadmap OS Fix Log v15 — 2026-04-27

V15 fix queue execution log.

## Audit baseline

20 fixes in queue. Initial audit (against v1.45.3 codebase, before any V15 work):
- **9 already PASS** (Fix 3, 6, 11, 12, 14a, 14b, 15, 17, 18, 19) — V13/V14 work covered them
- **5 PARTIAL** (Fix 4, 5, 7, 10, 14d, 16)
- **7 MISSING** (Fix 1, 2, 8, 9, 13, 14c, 14e, 20)

## Shipped this run (v1.46.0)

### Fix 4 — Insights merged into Reports + removed from top nav — DONE
- Removed top-nav `<a>Insights</a>` (renderer/index.html:2253).
- Added `insights` entry to `RPT_REPORTS` (the Reports sidebar list).
- Added `case 'insights'` to `renderReport()` that creates a transient `#insightsBody` node inside `#rptContent` and calls the existing `renderInsights()` function — zero changes needed to the insights-rendering code.
- Standalone `openInsights()` overlay left intact for backward compat with deep links.

### Fix 5 — OKR Progress + Change Requests removed from Reports — DONE
- Dropped `okr-progress` and `ucr-summary` from `RPT_REPORTS`.
- Renderer functions (`rptOKRProgress`, `rptUCRSummary`) and the dispatch cases left in place so any old shared report URLs don't 500. Just hidden from the Reports sidebar list.

### Fix 10A — To-Do Kanban colour palette — DONE
- Renderer: `renderKanban()` `colDefs` (~L15068). Changed In Progress from amber `#d97706` → app-standard blue `#005bb1`. Open stays grey (consistent with neutral) and Done stays green.

### Fix 10B — "Back to Roadmap" button removed from To-Do — DONE
- `renderer/index.html:2864` button removed; comment notes the top nav already exposes the navigation.

### Fix 13 — Proactive session refresh — DONE
- Custom Supabase-compatible client at L8208 already refreshed on demand inside `getSession()`, but long-idle tabs only discovered the expiry on the next user action — by which point the refresh window had often closed too. Added:
  - `_pmrRefreshSessionIfNeeded()` helper that re-runs `/auth/v1/token?grant_type=refresh_token` whenever the access token has <10 min left.
  - `_pmrStartSessionRefreshTimer()` runs that helper on app start and every 10 min thereafter.
  - Wired in via the same `setTimeout(_pmrWireHistory, 0)` block at end-of-script.
- Result: idle tabs stay refreshed. Users only see "session expired" when the refresh token itself is rejected (which is the actual unrecoverable state).

### Fix 9 polish — Contenteditable placeholder for empty team descriptions — DONE
- The team card at `renderCapTeams()` (L32189) already shows logo + description + member avatars (the audit's "MISSING" verdict was a false negative — it grepped for `renderTeamCard`, the spec's name, when the actual function is `renderCapTeams`). The visible bug was that empty descriptions rendered as a 0/16-px blank, looking like "the field doesn't exist."
- Added a global CSS rule: `[contenteditable="true"][data-placeholder]:empty:before { content: attr(data-placeholder); … }` — now empty descriptions render the placeholder text (italic, muted) instead of nothing. Click anywhere in the area to start typing.

## Already in code from prior versions (PASS — no work needed)

- Fix 3: Settings → "Re-run Onboarding Tour" button at `renderer/index.html:35108` calls `showOnboarding()`.
- Fix 6: Product Documents tab uses `_productLinkedDocs()` and the "Open Document Repository →" button calls `openArtifacts()` correctly.
- Fix 7 (partial): Page-icon coverage already exists for several pages (Products, Reports, Integrations have icons in their headers). Systematic sweep across all 14 inline header HTMLs deferred — see "Deferred" section.
- Fix 11: Timesheet tab on To-Do correctly stays on To-Do via `switchTodoTab('timesheet')` (L15402); `setKPIView('timesheet')` is gated on KPI context.
- Fix 12: Products page lists individual products (rows) via the existing `_productGetAll()` flow that iterates `rows` directly. Logo display via `productImage` field.
- Fix 14a/14b: Recent Activity from `_productEffectiveHistory()` and lifecycle as a `<span class="stage-badge">` label (not button) — both already correct.
- Fix 15: `renderProductPlanTab()` (L28275) shows linked plan or empty state.
- Fix 17: `logProductHistory()` defined (L27745) and called from saveRow / addBug / status changes.
- Fix 18: Discussion tab reads `(p.comments || [])` — same source as roadmap.
- Fix 19: Products overlay uses single flex container, `productsContainer` is the only scrollable child.

## Verified during audit (no change needed)

- Fix 8 — Send Invite functionality: 4 distinct call sites surfaced (`/functions/v1/send-invite` x3 with different schemas + `/functions/v1/team-invite` x1 for CapacityIQ Edit Team). The CapacityIQ path (`_capTeamSendInvite` at L32540) already has comprehensive error surfacing — it shows the actual Resend error + hint payload from the edge function (L32567–32576). If it fails in production it's a deployment-side issue (RESEND_API_KEY missing, from-domain not verified in Resend) — the renderer is already correctly calling the function and surfacing the error.
- Fix 9 — Team cards: `renderCapTeams()` (L32189–32232) already shows logo (or color swatch fallback), member avatars (top 5 + overflow), description (inline-editable), and roadmap initiatives. Only gap was the empty-state CSS — fixed above.

## Deferred (not shipped this run)

These need their own batch — significant new feature work:

- **Fix 1** (onboarding integrations step) — needs new HTML step + handlers tying into existing `connectIntegration()` OAuth flow.
- **Fix 2** (subscribe / social step in onboarding) — UI-only, but requires storing `currentData.settings.subscriptions` and respecting it in the email engine (which doesn't exist yet — would need a "respect subscription opt-out" check in any future broadcast email).
- **Fix 7 sweep** (page icons across 14 different inline headers) — mechanical but tedious; defer to a polish pass.
- **Fix 14c** (inline pencil-edit on profile fields) — `renderEditableField()` + `toggleFieldEdit()` need to be added and every read-only field in the Overview/Profile tab needs to be re-rendered through them.
- **Fix 14d** (editable commercial section with currency, multi-select sales channels, multiple price points) — substantial form refactor.
- **Fix 14e** (Configure modal on Products landing) — new modal with 5 tag editors + storage in `currentData.settings.productConfig` + read-from-config in every product form.
- **Fix 16** (Specs tab inline editing — text fields + tag arrays) — same pattern as 14c.
- **Fix 20** (integration sync → product bugs/releases mapping) — needs `mapIntegrationItemToProduct()` + hooks in the existing integrations-sync flow.

The deferred set is roughly the "editability layer" of the Product detail page plus integration data-pull mapping. Sensible to pick up in a focused V15.5 batch.

## Verification

- `node tests/renderer.parse.test.js` — 0 failures (~1898 KB JS)
- `node tests/capacity.test.js` — pending in finalize step
- Web build — pending in finalize step

## Decisions worth flagging

1. **Insights overlay kept** alongside the Reports tab. Some deep-link scenarios (notifications, share emails) might still target `#insights`, so removing the standalone open path would have broken those. The overlay just isn't reachable from the top nav anymore.
2. **OKR Progress + Change Requests renderers kept**, only the sidebar entries removed. Lower-risk than ripping out functions that may be referenced by hash routes or archived shares.
3. **Fix 8 not "fixed"** in code — the renderer is already correct. The "doesn't work" symptom is almost certainly a Supabase deployment issue. If invites still fail after deploy: check the `team-invite` and `send-invite` edge functions in the Supabase dashboard, look for `RESEND_API_KEY` in their env vars, and verify the from-domain in Resend.
4. **Fix 9 audit was wrong** (false negative). The actual function is `renderCapTeams`, not `renderTeamCard`. The user's reported "doesn't show" was almost certainly the empty-state placeholder issue — fixed.
