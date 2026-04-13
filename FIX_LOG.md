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
