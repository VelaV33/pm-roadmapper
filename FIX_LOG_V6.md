# Roadmap OS Fix Log v6 — 2026-04-21

v1.35.2 → **v1.36.0**. Executed the v6 fix queue in a pragmatic order that
deviated from the spec where the spec would have broken the app. Every
deviation is documented below.

## Spec vs reality

The spec was written against fictional function names that don't exist in
this codebase. Mapping used throughout the fixes:

| Spec name            | Real name                                |
|----------------------|------------------------------------------|
| `saveData()`         | `persistData()`                          |
| `getCurrentPlan()`   | `getActivePlan()`                        |
| `renderTimeline()`   | `renderTableHeader()` / `render()`       |
| `renderPlan()`       | `renderPlanMain()`                       |
| `currentData.todos`  | `todoAllData` (keyed by initiative name) |
| `showPage()`         | per-feature open fns                     |

The spec also prescribed a **parallel** CSS variable system (`--bg-primary`,
`--text-primary`, etc.) on top of the existing one (`--navy`, `--white`,
`--text`). Adding a second system would have layered conflicting variables
on every element. **Decision: kept the existing system and closed real
contrast gaps surgically.** This matches CLAUDE.md's documented design.

The "NUCLEAR OPTION" wildcard CSS (`.dark-mode [class*="container"]`,
`[class*="wrapper"]`, etc.) would have blanket-overridden intentional
designs across the 23k-line renderer. **Skipped.**

---

## Fix 2 — Template Import Selected (fixed)

**File:** `renderer/index.html`, `_tbImportToPlans` (~line 29150)

- Was calling `getCurrentPlan()` (doesn't exist) and `renderPlansView()`
  (doesn't exist). Both calls silently no-op'd, so after clicking "Import
  Selected" the tasks were pushed to `plan.tasks` but the UI never
  refreshed — *appearing* broken.
- Now: uses `_tbState.activePlanId` (captured when builder was opened),
  then `getActivePlan()`, then `projectPlans[0]` as progressive fallbacks.
  Renders via `renderPlanMain()` + `renderPlansList()`.

## Fix 5A — Colours button (removed)

**File:** `renderer/index.html` line ~2615

- Removed the `planColorsToggleBtn` from the Plans toolbar per spec. The
  dead state-sync code at line ~15785 now no-op's when the button element
  is missing (`getElementById` returns null → early-exit `if(colorBtn){}`).

## Fix 5B — Category field on plan task rows (removed)

**File:** `renderer/index.html` line ~16005

- Removed the `.plan-source-icon` span ("template" / "capacity" / "custom")
  from the WBS name cell in plan task rows. The `t.source` field is still
  stored on the data — just not displayed. Predecessor picker (line ~16474)
  kept as-is; it's a distinct context where source info aids selection.

## Fix 4 — Add Task tabs cleanup

**File:** `renderer/index.html` line ~16530

- Removed `From Excel`, `Import Template`, `From CapacityIQ` tabs.
- Kept: `Custom`, `From Task Library` (renamed from "From Library"), `From To-Do`, `From G2M`.
- The render handlers for removed tabs are orphaned but harmless — skipped
  deletion to minimise blast radius.

## Fix 3 — Template Builder Select All

**File:** `renderer/index.html` `_tbRenderLeft` (library branch, ~line 28982)

- Per-template Select All / Clear was already wired (`tbSelectAllT` /
  `tbDeselectAllT`), plus the footer "N selected" counter, plus accumulated
  state across templates (`_tbState.selectedTasks` is global). That part of
  the spec was already satisfied.
- **Added for this fix:** Task Library tab now groups tasks by category,
  each category has its own "Select category" button, plus global
  "Select All" / "Clear" buttons in the right-panel header. No more
  one-by-one clicking through 173+ tasks.

## Fix 6B — Edit To-Do task (added)

**File:** `renderer/index.html` — new `openEditTodoModal` + `_saveEditTodo`

- Added a unified edit modal accessed via a new pencil button on each
  to-do row. Edits: text, status, due date, estimate, actual hours,
  initiative (reparents between `todoAllData` keys), linked KPI, notes.
- Existing per-field editors (`editTodoText`, `editTodoComment`,
  `editTodoDue`) kept for power users.

## Fix 6C — Auto-pull assigned plan tasks into To-Do

**File:** `renderer/index.html` — `onTaskFieldChange` + new `_syncPlanOwnerToTodo`

- When a plan task's owner changes AND the new owner matches the current
  logged-in user (email, display_name, or full_name), the task is cloned
  into their to-do under `todoAllData[<plan name>]`. Idempotent via
  `sourcePlanTaskId` field.
- Reassigning to someone else removes the previous owner's auto-pulled
  todo row (local-session only — other users sync via their own sessions).
- Bidirectional: `setTodoStatus` and `_saveEditTodo` now push status
  changes back to the source plan task via `_syncTodoStatusToPlan`.

## Fix 6A — To-Do Add Task parity (partial)

**File:** `renderer/index.html` line ~2345

- Added `From Library` button that launches the Template Builder in
  `todo` context with the currently-filtered initiative pre-selected. Gets
  multi-select + Select All behaviour for free via the builder.
- Kept existing `Templates` button (opens `openTemplateLibrary('todo')`)
  renamed icon to distinguish from the new one.
- Inline add form already supported library autocomplete; left as-is.

## Fix 1 — Quarter / Financial Year management

**File:** `renderer/index.html`

- New: `_fyStartMonth` global + `_rebuildQMonthMap()`. Default is March (the
  historical hard-code). Persisted to `localStorage.pmr_fy_start_month`.
- New: `configureFYStart()` + `_saveFYStart()` — dropdown modal with all
  12 months. Saving rebuilds `Q_MONTH_MAP` so future Add Quarter / Add FY
  clicks produce the new layout.
- Existing `addQuarter()` / `addFinancialYear()` / `removeLastQuarter()`
  were present but not wired to any UI — now exposed via the new legend
  Roadmap dropdown (see Fix 8).
- **Caveat:** changing the FY start does NOT retroactively re-layout
  existing quarters (existing bars are anchored to MONTHS indices —
  retroactive reshuffling would reorder data). Only future quarter adds
  use the new layout. User warning shown in the success toast.

## Fix 9 — Timesheet + My Capacity tabs on To-Do

**File:** `renderer/index.html`

- Added a pill-tab strip to the To-Do toolbar: `To-Do` / `Timesheet` /
  `My Capacity`. Tabs 2 and 3 launch the KPI Scorecard overlay in the
  corresponding sub-view (`setKPIView('timesheet'/'capacity')`) — reuses
  existing renderers rather than duplicating them into the to-do page.
- KPI Scorecard tab relabelled: "Capacity" → "My Capacity".
- Dark-mode styling on the pill strip added.

## Fix 8 — Sidebar reorganization

**File:** `renderer/index.html` line ~1915 + legend block at ~2081

- Removed from sidebar: Add Row, Add Section, Paste from Spreadsheet,
  Edit Timeline, Export Excel, Export PDF, Save Backup, Import Data.
- Added to the Roadmap legend area: two dropdowns — **Roadmap ▾** (row /
  section / paste / quarter / FY controls) and **Data ▾** (timeline /
  exports / backup / import).
- Dropdown close-on-outside-click handled via a delegated document
  listener. Dark-mode styling included.
- Sidebar now cleanly holds: navigation items + Settings + User
  Management + Platform Admin.

## Fix 7 — Dark mode audit (targeted, not nuclear)

**File:** `renderer/index.html` dark-mode CSS block

- Most of this work already landed in the previous session
  (`var(--navy)` background catch-all, `.add-sec-form`, `.modal-todo-outstanding`,
  `.ts-bar`, `.share-chip`, comment modal, `.comp-card-hdr`, etc.).
- This fix added the remaining clear contrast gaps:
  `.prio-btn.danger` (+ hover), `.plan-status-pill.not-started` /
  `.in-progress` / `.done` / `.blocked`, `.kanban-col-count` duplicate rule
  at line 1237, `#todoCrossTabs`.
- Skipped the spec's parallel variable system. Skipped the "NUCLEAR"
  `[class*="container"]` wildcards. Documented rationale at the top of
  this log.

---

## Test results

- `npm test` — 22 passed, 0 failed
- `npm run test:parse` — 0 parse errors
- Zero-emoji policy: 0 high-range codepoints in `renderer/index.html`

## Not done / known limitations

- `removeLastQuarter` still uses browser `confirm()` prompt (no custom
  modal). Spec didn't require that change.
- Auto-pull (Fix 6C) only fires when the current user owns the task. Cross-user
  auto-creation would require server-side event propagation (different session
  writes to someone else's JSONB blob), which is out of scope for a
  renderer-only change.
- Timesheet / My Capacity tabs (Fix 9) currently *launch* the KPI overlay
  rather than embedding those views inline in the To-Do page. Full
  in-page embedding would require refactoring `renderTimesheet` /
  `renderCapacityView` to accept a target container — larger than this
  fix queue should absorb in one pass.
- Build-web (`cd web && node scripts/build.js`) not re-run from this
  session; run manually before the next web deploy.
