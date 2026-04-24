# Roadmap OS Fix Log v9 — 2026-04-24

v1.39.1 → **v1.40.0** (target). Same adapt-to-codebase approach as v6–v8.

## Scope honesty upfront

- **Fix 6 (My Capacity → CapacityIQ)** — partially shipped in v1.38.0
  (the CapacityIQ dashboard I rewrote already has a member-capacity
  table that serves "my capacity" when the user's the only member).
  The KPI Scorecard still has the My Capacity tab though. v9 finishes
  the job by removing it from KPI Scorecard.
- **Fix 11 (CIQ cleanup)** — already shipped in v1.38.0. Initiatives,
  Sprints, Task Reference tabs all gone. v9 is a verification pass.
- **Fix 7 (today line)** — flagged 3 times. v1.38.0 rewrote it to use
  `getMonthLabel` lookup, but the user reports it's still broken on
  desktop. I'll read the CURRENT code, understand the real failure
  mode, and fix root-cause this time instead of rewriting blind.
- **Spec function names are fictional** again: `saveData`,
  `generateId`, `currentData.templateLibrary`, `getCurrentUserId`,
  `closeAllModals`, etc. Adapting to real names: `persistData`,
  `_newId('prefix_')`, `_tplCache` / `customTemplates`,
  `_currentUser.id`, ad-hoc modal overlays.

## Phase tracking

- [ ] Fix 7 — today line (investigate why v1.38 fix didn't hold, fix)
- [ ] Fix 11 — verify CIQ cleanup
- [ ] Fix 6 — remove My Capacity tab from KPI Scorecard
- [ ] Fix 2 — show individual user in Capacity Dashboard when no teams
- [ ] Fix 5A — rename Strategy → Reports Dashboard
- [ ] Fix 10 — Dashboard: swap Shared-with-me card for Plans Overview
- [ ] Fix 8 — date range filter on roadmap
- [ ] Fix 1 — CapacityIQ templates UX (icons, focused view, save, search)
- [ ] Fix 3 — Edit Team overhaul
- [ ] Fix 4 — Add Team popup
- [ ] Fix 5B — roadmap change log
- [ ] Fix 5C — multi-period capacity on reports
- [ ] Fix 9 — notifications + alerts system
