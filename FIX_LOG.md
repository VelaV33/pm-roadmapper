# Fix Log — v1.28.0 Autonomous Fix Queue

## Pre-flight findings

- **renderer/index.html**: 23,445 lines
- **Routing pattern**: No centralized `showPage()` router. Each feature has its own open/close function (e.g. `openPlans()`, `openG2M()`, `showDashboard()`, `openCapacity()`). Navigation is via the toolbar nav bar at line ~1368 and various sidebar/overlay toggles.
- **Edit row function**: `openEditModal(rowId)` at line 3167 — this is the primary edit handler for roadmap rows/initiatives. Called via `onclick="openEditModal('...')"` on row name divs and kanban cards.
- **Main nav**: Toolbar nav at line ~1368 has: Dashboard, Roadmap, Checklist, Strategy, Insights
- **Top toolbar**: `<nav class="toolbar-nav">` with `<a onclick="...">` items
- **Dark mode**: Uses `.dark-mode` class on `<body>` with CSS variable overrides

---

## Fix 1: Initiative Click-to-Edit
**Status:** Fixed
**Decision:** The onclick wiring was correct (3 call sites: row name div, kanban card, kebab menu). Two defensive issues found:
1. `openEditModal()` had no null check — if the row was deleted between render and click, it would crash silently (no error shown, no modal, user thinks "clicking doesn't work")
2. The timeline-view row name div used `row.id` without `escHtml()` escaping (unlike the kanban card which correctly uses `escHtml(row.id)`). Could break the onclick if ID contained special chars.
**Changes:** Added null checks with user-facing toast messages + console.warn. Added escHtml() on the timeline row name onclick.
**Files:** renderer/index.html (openEditModal function + row render)

## Fix 2: Checklist Tab Not Showing Full Checklist
**Status:** Fixed
**Decision:** `renderG2M()` skipped categories where `catItems.length===0` (line 10238: `if(catItems.length===0) return;`). If a user deleted all items in a category, or if a custom template had sparse coverage, entire categories disappeared — making it look like items were missing. The rendering loop, category data, and CSS scrolling were all correct. The filter was the root cause.
**Changes:** Removed the `return` guard on empty categories. Added an empty-state row with "No items in this category. + Add item" prompt so users always see all 14 G2M categories regardless of item count. Preserved the existing add-item flow via `addG2MRow()`.
**Files:** renderer/index.html (renderG2M function)

## Fix 3: Roadmap Data Missing for velasabelo.com Account
**Status:** Fixed (frontend robustness)
**Decision:** Cannot query production DB from here, so focused on the data-load logic in the renderer. Found two issues:
1. The cloud data acceptance check at line 5629 was `if((cd.rows && cd.rows.length > 0) || (cd.sections && cd.sections.length > 2))` — this rejected data from users with the default 2 sections and 0 rows. Changed to accept ANY data that has a `sections` array. Loading default-state data is a no-op, but rejecting real customized data is data loss.
2. Non-200 responses from the cloud load (404 for new users, 500 for server errors) were silently caught. Added per-status console logging and a user-facing toast for genuine failures (not 404, which is expected for new accounts).
**Root cause (likely):** The user signed in via Google OAuth, which may have created a new auth.users entry or the account simply had no roadmap_data row yet. The aggressive empty-check then rejected the default-state data that DID come back from the cloud.
**Files:** renderer/index.html (onAuthSuccess function, cloud load logic)
