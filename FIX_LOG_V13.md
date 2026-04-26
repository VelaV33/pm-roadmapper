# Roadmap OS Fix Log v13: Products Page — 2026-04-26

V13 fix queue execution log. Building the Products page across phases.

## Architectural decisions (Phase 1)

- **Spec said `showPage('products')` + `data-page` attribute.** This codebase actually uses `open*()` overlays + `_PMR_OVERLAY_MAP`. Products is wired the same way (`openProducts()` / `closeProducts()`, `<div id="productsOverlay">`, registered in both `closeAllOverlays()` and `_PMR_OVERLAY_MAP`).
- **Spec said top-nav slot "between Roadmap and Plans".** In the actual top nav those two aren't adjacent (Dashboard | Roadmap | Checklist | Plans | …). Placed Products as `Dashboard | Roadmap | Products | Checklist | Plans | …` — closest to the spec's intent.
- **Products = `rows[]`.** Per the spec's "Products ARE rows" rule. New fields hang off the same row objects via `ensureProductFields(row)` on first read; existing data is never overwritten (only `undefined` keys get defaults).
- **Status & stage are derived, not stored.** Existing rows don't carry an explicit `status` string — they carry coloured `bars[]` (`g`=released, `b`=in progress, `o`=delayed, `r`=at risk, `s`=strategy, `y`=planned). `_productInferStatus(row)` maps the last bar's colour. `_productInferLifecycle(row)` then maps status → `lifecycleStage` for products that haven't manually set one. Manual override wins.
- **`logProductHistory` shipped early.** Helper exists in v1.44.0 so Phase 3's auto-log hooks have something to call.

## Phase 1: data model + nav + list shell — COMPLETE (v1.44.0)

| Spec fix | Status | Notes |
|---|---|---|
| Fix 1 — Data model extension | DONE | `PRODUCT_FIELD_DEFAULTS`, `PRODUCT_HARDWARE_DEFAULTS`, `PRODUCT_DIGITAL_DEFAULTS`, `PRODUCT_QUALITY_DEFAULTS`, `ensureProductFields(row)`, `logProductHistory(rowId, entry)`. Migrates legacy `row.revenue` → `revenueProjected`. |
| Fix 7 — CSS (list view subset) | DONE | Overlay shell, header, toolbar, filters, view toggle, summary bar, products table (sortable headers, hover, monospace cells, badges), card grid (responsive auto-fill, hover lift, label pills, stat columns). Full dark-mode coverage. Detail-page CSS deferred to Phase 2. |
| Fix 2 — Products list page | DONE | `openProducts/closeProducts`, `renderProductsPage`, `renderProductsTable` (11 sortable cols), `renderProductsCards` (responsive grid), `renderProductsSummary` (6 stats). `setProductsView('table'\|'cards')`, `filterProducts()`, `sortProducts(key)`. Search across name/code/family/owner/tagline. |

**Verification (Phase 1):**

- `node tests/capacity.test.js` — 22 passed, 0 failed
- `node tests/renderer.parse.test.js` — 0 failures, 1821.8 KB JS parsed
- `cd web && npm run build` — clean, 2088.9 KB (up from 2056.1 KB; ~33 KB of new code)
- `APP_VERSION` and `package.json` bumped to **v1.44.0**

## Phase 2: detail page + 8 tabs — COMPLETE (v1.44.0)

| Spec fix | Status | Notes |
|---|---|---|
| Fix 3 — Detail page + tab system | DONE | `openProductDetail/closeProductDetail/renderProductDetail`, hero header, 8 tabs in `productDetailTabs`. `switchProductTab(name)` dispatches via `_renderProductTab(p,name)` switch. |
| Fix 3 Tab 1 — Overview | DONE | Visual lifecycle bar (7 stages, past/active/future colours), 8-stat snapshot grid, 10-field profile, recent-activity list (last 5 history entries). |
| Fix 3 Tab 2 — Commercial | DONE | Revenue/cost/margin stat cards, pricing model + sales channel fields, price-points table. |
| Fix 3 Tab 3 — Releases & Bugs | DONE | Release-note cards with version-tag badge, 5 change groups (features/fixes/improvements/breaking/known issues), bug-tracker rows with severity dots and status select. |
| Fix 3 Tab 4 — Plan & Tasks | DONE | Auto-resolves linked plan via `_productLinkedPlan(rowId)` (uses existing `plan.linkedRowIds[]`). Progress bar, status-grouped breakdown, top-12 task table. |
| Fix 3 Tab 5 — Specs | DONE | Conditional Hardware fields for hardware/firmware/hybrid; Digital fields for digital/hybrid; Quality & Support always shown. |
| Fix 3 Tab 6 — History | DONE | Vertical timeline with 9 type-specific marker icons (lifecycle/release/bug/pricing/team/compliance/incident/milestone/custom), filter chips, auto-seeds a "Product created" entry from `row.createdAt`. |
| Fix 3 Tab 7 — Documents | DONE | Filters `documentRepository[]` where `initiativeId === row.id`. CTA back to Artifacts → Document Repository when empty. |
| Fix 3 Tab 8 — Discussion | DONE | Read-only `row.comments[]` view; CTA opens the existing edit modal for posting. |
| Fix 7 — Detail-page CSS | DONE | Hero header, tab nav, stat grids, lifecycle bar, release cards, bug rows, history timeline (vertical line + markers), docs list, pricing table. Full dark-mode coverage. |

**Phase 2 verification:** 22/22 capacity tests, 0 parse failures (1884.8 KB JS), web build 2166.3 KB (+77 KB).

**Mid-substitution gotcha**: the editor/linter watching `renderer/index.html` was touching the file between Read and Edit, breaking the Edit-tool unique-string match. Switched to atomic Node-based substitution (`.tmp_phase2.js` + `.tmp_apply_phase2.js`). First attempt over-escaped `\'` → `\\'`, broke parse; one-shot `node .tmp_unescape.js` in-place fix repaired it. CRLF vs LF mismatch in temp scripts is the root cause — Windows line endings need explicit normalization.

## Phase 3: edit forms + auto-log hooks — COMPLETE (v1.44.0)

| Spec fix | Status | Notes |
|---|---|---|
| Fix 5 (a) — `addProductRelease` / `editProductRelease` | DONE | Single modal serves both. 11 fields. Version is required. Multi-line textareas convert to arrays via `_productLinesToArr`. Edit modal also exposes Delete. Saves auto-log a "Release vX.Y.Z created/updated/deleted" history entry. |
| Fix 5 (b) — `addProductBug` | DONE | 7-field modal (title, description, severity, status, affected version, reporter, repro steps). Auto-logs "Bug reported" to history. |
| Fix 6 — `addProductHistoryEntry` | DONE | 4-field modal (type, date, title, description). 9 type options. Persists with current user as `actor`, `autoGenerated:false`. Capped at 200 entries per product. |
| Fix 8 (partial) — auto-log hook on bug status change | DONE | `updateProductBugStatus()` (Phase 2) already logs to history when status flips. Phase 3 wires `pushCloudData()` and inline tab re-render via shared `_productPersistAndRefresh()`. |
| Fix 8 (deferred) — auto-log on row.bars status changes / row edits | DEFERRED | The roadmap-row save path doesn't have a clean single hook (status is derived from `bars[].c`, not stored). Adding hooks here means modifying multiple existing save paths (`saveBars`, `addInitiativeToRow`, etc.) which carries regression risk. `logProductHistory()` is exported as a public API — manual / future hooks can call it. |
| Fix 4 — Comprehensive multi-section product edit modal | DEFERRED | The existing `openEditModal()` is wired from the detail page header's Edit button; it covers identity / commercial / lifecycle / hardware / digital / quality fields when accessed via the row form. A Products-specific edit form would duplicate ~600 lines of UI for marginal gain over the existing modal. Re-evaluate if user feedback says the existing modal is missing fields. |

**Phase 3 verification:** 22/22 capacity tests, 0 parse failures (1900 KB JS), web build 2183.1 KB (+17 KB).

## Final state — v1.44.0

- Renderer: 2.18 MB on disk (was 2.04 MB before V13). +143 KB / +1255 lines for the entire Products surface.
- All 8 tabs render real data on day one. Forms write back to `rows[]` and trigger `pushCloudData()`.
- Open issues vs spec:
  - Fix 4 (dedicated edit modal) — deferred, see above
  - Fix 8 row-edit auto-log hooks — deferred, see above
  - Spec called for "between Roadmap and Plans" placement; nav has `Dashboard | Roadmap | **Products** | Checklist | Plans | …` since those slots aren't adjacent in the actual nav.
  - Spec used `showPage('products')`/`data-page` patterns; this codebase uses `open*()` overlays, so wired through `_PMR_OVERLAY_MAP`.
