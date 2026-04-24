# Roadmap OS Fix Log v8 — 2026-04-24

v1.37.1 → **v1.38.0**. Same pattern as v6/v7: adapt the spec to the
actual codebase (skipping fictional names like `saveData`, `generateId`,
`getAllPlans`, `calculateMemberAllocatedHours`).

## Fixes landed

### Fix 1 — Task library now syncs from every template
- New `syncTemplateTasksToLibrary()` in `renderer/index.html`.
- Iterates `getAllTemplates()` (which already flattens CapacityIQ
  templates + `_tplCache` + bundled platforms) and calls the existing
  `upsertTaskInLibrary` on each task — idempotent via normalised-name
  + category dedupe.
- Called from `openPlans()` alongside the existing
  `seedTaskLibraryFromCapacity` / `seedDefaultTaskLibrary`. Runs on
  every Plans open, not just once per user, so templates added
  server-side surface without re-seeding.

### Fix 2 — Today-line positioning
- Rewrote `drawTodayLine()` to use `getMonthLabel(mi)` as the source of
  truth for the month→calendar-year mapping instead of duplicating the
  year-walk. Previously the walk disagreed with `getMonthLabel` on
  custom FY-start edge cases (v1.36.0) and drifted to column 0.
- Now: scan MONTHS indices for a label matching "MMM YYYY" of today. If
  outside the visible range, hide the line. Position uses the actual
  `<th>` DOM rect + scroll offset + day-of-month fraction.

### Fix 3 — Burger auto-closes on any page click
- Existing code auto-closed when a sidebar-item was clicked, but not
  when the user clicked a **top-nav** link while the sidebar was open
  (because the outside-click listener was only attached via
  `toggleSidebar` when opening via the burger — a sidebar opened from
  the saved `pmr_sidebar_collapsed` preference never got the listener).
- Added an always-on capture-phase `mousedown` listener at
  `DOMContentLoaded` that closes the sidebar on any outside click,
  except for the burger button itself. Works on both web and desktop.

### Fix 4 — Surgical UI removals
- Timesheet **Export Word** button removed from the KPI Scorecard header.
- Sidebar: **Change Requests (UCR)**, **ToDo List**, **CapacityIQ**
  removed. Data in `ucrAllData` / `capData` / etc preserved in the
  JSONB blob.
- CapacityIQ side panel: **Initiatives**, **Sprints**, **Task
  Reference** removed. `capNav('initiatives'|'sprints'|'tasktypes')`
  switch cases kept but unreachable — no dead-reference errors.
- **Insights** was never in the sidebar (top-nav only) — nothing to remove.

### Fix 5 — CapacityIQ in top nav
- Added `<a onclick="openCapacity()">CapacityIQ</a>` between To-Do and
  Strategy in the top nav. Removed from sidebar as part of Fix 4.

### Fix 6 — CapacityIQ dashboard overhaul
- Rewrote `renderCapDashboard` completely.
- Old: Team × Sprint heatmap with dummy data.
- New: four summary stat cards (total capacity, allocated, available,
  utilisation %), a Team Member Capacity table (capacity / allocated /
  util % / SVG-dot health), and an Initiative Capacity table (hours
  total / % complete / hours remaining / estimated delivery / health).
- Data is real: member allocation sums `projectPlans[].tasks[]` by
  owner-name match × hoursPerDay for tasks not yet done. Initiative
  hours aggregate plans linked via `linkedRowIds` back to roadmap rows.
  Delivery date extracted from roadmap bars via `fracToMonthDay` +
  `getMonthLabel`.
- Period switch pills (daily / weekly / monthly / quarterly / yearly)
  above the dashboard with a new `_capSetDashPeriod` helper —
  multiplies member weekly capacity by 0.2 / 1 / 4 / 12 / 48.
- Health indicators are inline SVG circles (`<circle fill="…"/>`), no
  emoji, matching the zero-emoji policy.
- Dark-mode inherits from existing `.cap-card` / `.cap-stat` /
  `.cap-heatmap` rules.

### Fix 7 — Monthly capacity report
- Already largely satisfied. `renderCapacityMonthly(body, weekStart)`
  exists in the KPI Capacity page (v1.33.0), and the new CapacityIQ
  dashboard (Fix 6) also has a Monthly period pill. No separate
  "Reports monthly view" added — would have been duplicative.

### Fix 8 — Help & support FAB
- New floating action button in the bottom-right (`#helpFab` before
  `</body>`). Click opens a panel with four actions: Report a Bug,
  Request a Feature, Get Help, Log a Ticket. Each opens an inline form
  (subject / description / priority), and Submit opens a mailto to
  `support@pmroadmapper.com` (using `electronAPI.openExternal` on the
  desktop, direct `window.location.href` on web).
- Dark-mode CSS included. Pure SVG icons, no emoji.

### Fix 9 — Feedback page branding + attachments + trial CTA
- `web/static/feedback.html` updated:
  - Title → "Submit Feedback — Roadmap OS"
  - Inline-SVG favicon (blue rounded square with "R")
  - Brand row at top: logo tile + "Roadmap OS" wordmark
  - `prefers-color-scheme: dark` media query so the page adapts to the
    user's OS theme (the existing page was light-only)
  - Attachments field: multi-file picker + chip list + per-file remove.
    Files are surfaced in the feedback description as a filename list
    — server-side upload support isn't wired into the existing
    `feedback-submit` edge function, so this is a client-side
    acknowledgement with a hint in the submission for the team to
    request files separately.
  - "Powered by Roadmap OS" line preserved; new "Start your 30-day
    free trial →" gradient CTA below it.

## Tests on ship

- `npm run test:parse` — 0 failures
- Zero-emoji policy held (health indicators are SVG `<circle>` elements)
- Light + dark mode verified via CSS variables; feedback page uses
  `prefers-color-scheme`

## Not done / deferred

- A proper burndown chart over multiple sprints (carried over from v7
  notes — still blocked on missing Sprint entity).
- Binary upload of feedback attachments to Supabase storage from the
  public feedback page — blocked on the edge function not having a
  file-upload endpoint. Implemented the UX; server-side is a separate
  task.
