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

## Fix 4 + 5: Add To-Do and Plans to Top Navigation
**Status:** Fixed (batched — both were the same edit)
**Decision:** Both features already existed as full overlays accessible from the sidebar. `openTodo()` at line 11203 and `openPlans()` at line 13788 were fully implemented. The top nav at `<nav class="toolbar-nav">` only had Dashboard, Roadmap, Checklist, Strategy, Insights. Added Plans and To-Do links between Checklist and Strategy. Both use the existing `closeAllOverlays() + open*() + updateNavActive()` pattern already used by the other nav items. `updateNavActive()` uses text matching so no registry changes needed.
**Changes:** Two new `<a>` elements added to the top nav bar.
**Files:** renderer/index.html (toolbar-nav section)

## Fix 6: Edit Row Popup Too Large
**Status:** Fixed
**Root cause:** The `.row-kebab-menu` CSS class set `position:absolute; right:0;`. The JS that creates the menu overrides to `position:fixed; left:leftPx;`. But it did NOT override `right`. With BOTH `left` AND `right:0` applied, the browser stretches the element from leftPx to the viewport's right edge — making it span the full screen width.
**Fix:** Added `menu.style.right = 'auto';` and `menu.style.width = menuW + 'px';` in the JS `openRowKebab()` function. The menu is now a fixed 180px width, right-aligned to the kebab button, clamped to the viewport.
**Files:** renderer/index.html (openRowKebab function)

## Fix 7: Edit Timeline Button Non-Responsive
**Status:** Fixed
**Root cause:** The "Edit Timeline" button (sidebar line 1472) calls `openEditQuarters()` which DOES work — it opens the `#quartersModal` (z-index 6000). But the sidebar (z-index 4500) stays open after the click because the onclick didn't auto-collapse it. The modal opens underneath the sidebar overlay, and the user thinks nothing happened.
**Fix:** Added sidebar auto-collapse to the onclick: `var sb=document.getElementById('appSidebar');if(sb)sb.classList.add('collapsed');` before `openEditQuarters()`. Now the sidebar slides away as the modal opens, making the result visible immediately.
**Not a function bug:** `openEditQuarters()` and the modal HTML/CSS are correct. The issue was purely UX — the modal was hidden by the sidebar.
**Files:** renderer/index.html (sidebar Edit Timeline button onclick)

## Fix 8: Dark Mode — Prioritisation/CapacityIQ/Plans Sidebar Buttons Too Light
**Status:** Fixed
**Root cause:** `--navy` is used as both a TEXT color (headings, labels) and a BACKGROUND color (sidebar panels). Dark mode inverts `--navy` from `#0f1b3d` to `#e2e8f0` — correct for text (dark→light) but wrong for backgrounds (dark→light makes sidebar nearly white). Sidebar items use `rgba(255,255,255,.6)` text — invisible on a light background.
**Fix:** Added dark mode overrides for `.prio-sidebar`, `.cap-sidebar`, and `.plans-sidebar` to use `#0f172a` (dark navy) background with `#334155` border. Also overrode their item text colors, hover states, and active states to use explicit light values instead of relying on the inverted `--navy` variable.
**Scope:** Prio sidebar, Cap sidebar, Plans sidebar — all three had the same issue.
**Files:** renderer/index.html (dark mode CSS section, after line 63)

## Fix 9: Top 10 Priorities Overview Page
**Status:** Fixed
**Decision:** Created a new overlay page that derives the top 10 ranked initiatives from the existing `rows` array using a scoring formula: priority weight (P1=30, P2=20, P3=10) + status urgency (At Risk=15, Delayed=10, In Progress=5, Not Started=3, Complete=1). No new data stored — purely derived from existing `rows`.
**Changes:**
1. Added `#top10Overlay` CSS with dark mode support
2. Added overlay HTML with header and body container
3. Added sidebar button (after Prioritization)
4. Added `top10Overlay` to `closeAllOverlays()` list
5. Added `openTop10()`, `closeTop10()`, `_top10Score()`, and `renderTop10()` functions
6. Cards show: rank number, name, subtitle, priority badge, status badge, section, owner, date range
**Files:** renderer/index.html (CSS, HTML overlay, sidebar nav, JS functions)

## Fix 10: Plans Template Defaults to "Globalisation Initiative"
**Status:** Fixed
**Decision:** Found two occurrences of "Globalization" in default section names: `{id:"s4",name:"Globalization · Malaysia"}` and `{id:"s5",name:"Globalization · Australia"}` — both in the initial `sections` array AND in the `onResetData` handler. These are Netstar-specific names that shouldn't ship as defaults.
**Changes:** Replaced both with generic names: "Expansion · Phase 1" and "Expansion · Phase 2". All 4 occurrences updated (2 in initial data, 2 in reset handler).
**Files:** renderer/index.html (sections array, onResetData handler)

## Fix 11: CapacityIQ Button Non-Responsive
**Status:** Fixed
**Root cause:** Same as Fix 7 (Edit Timeline). The CapacityIQ sidebar button calls `openCapacity()` which correctly opens `#capOverlay`, but the sidebar (z-index 4500) stays open on top. The overlay opens underneath, user sees the sidebar and thinks the button didn't work.
**Fix:** Added sidebar auto-collapse to the onclick: `var sb=document.getElementById('appSidebar');if(sb)sb.classList.add('collapsed');` before `closeAllOverlays();openCapacity()`.
**Files:** renderer/index.html (CapacityIQ sidebar button onclick)

## Fix 12: Change Request Button Non-Responsive
**Status:** Fixed
**Root cause:** Same sidebar-overlay z-index issue as Fixes 7/11. The Change Requests page already exists as `openUCR()` with full overlay, form fields, status workflow, and Word export. The sidebar button correctly calls `openUCR()` but the sidebar stays on top.
**Fix:** Added sidebar auto-collapse to the onclick, same pattern as Fix 11.
**Note:** The UCR page is already feature-complete with: title, description, requester, priority, status workflow (Draft/Submitted/Approved/Rejected/Implemented), systems impact checklist, approval workflow, and Word export.
**Files:** renderer/index.html (Change Requests sidebar button onclick)

## Fix 13: Artefacts Button Routes to Roadmap Instead
**Status:** Fixed
**Root cause:** Same sidebar-overlay z-index issue. The Artifacts sidebar button calls `closeAllOverlays();openArtifacts()` which is correct — `closeAllOverlays()` shows the roadmap page by default, then `openArtifacts()` opens the art overlay on top. But because the sidebar stays open and covers the overlay, the user only sees the roadmap underneath and thinks "it routes to Roadmap."
**Fix:** Added sidebar auto-collapse to the onclick.
**Files:** renderer/index.html (Artifacts sidebar button onclick)

## Fix 14: Dark Mode — Competitive Analysis Text Invisible
**Status:** Fixed
**Root cause:** The Competitive Analysis modal uses many hardcoded light-mode colors: `.comp-chip` (background:#e8f4fd), `.comp-tab` (background:#fff), `.comp-history-item` (background:#fff), `.comp-rec` (background:#f8faff), `.comp-checkbox-grid label` hover/checked states, and `.comp-swot-cell` quadrants (hardcoded pastel backgrounds with dark text). In dark mode these backgrounds stay light while text inherits light colors, making text invisible.
**Fix:** Added 24 dark mode CSS overrides for all competitive analysis classes: chips, tabs, history items, recommendation cards, checkbox grid, SWOT cells (using dark-appropriate background/text pairs), section borders, add buttons, and premium gate.
**Files:** renderer/index.html (dark mode CSS section)

## Fix 15: Super Admin -> User Management + Platform Admin
**Status:** Partially fixed (Part A — UI label rename)
**Decision:** Renamed all user-facing "Super Admin" labels to "User Management" while keeping the underlying `super_admin` role value unchanged in code. This is a pure UI rename — no backend changes.
**Changes:**
1. Sidebar button text: "Super Admin" -> "User Management"
2. Admin overlay header: "Super Admin" -> "User Management"
3. Role labels object: `super_admin:'Super Admin'` -> `super_admin:'User Management'`
4. Role picker dropdown: label changed to "User Management"
5. Access denied toast updated
6. Added TODO comment for Parts B+C (new platform_admin role + Platform Admin page) which require backend edge function changes
**Deferred:** Parts B (new admin role in auth) and C (Platform Admin page for system-wide settings) require backend changes to the admin-api edge function.
**Files:** renderer/index.html (sidebar, admin overlay header, role labels, role picker, access denied message)

## Fix 16: Save Backup — Full Data Export
**Status:** Fixed
**Root cause:** The old `exportBackup()` delegated entirely to `window.electronAPI.exportBackup()` which only included sections, rows, and quarters. All other data (G2M, ToDo, KPI, UCR, CapacityIQ, Artifacts, Brand Guide, Plans, OKRs, Prioritization, Task Library, Timesheets) was lost on backup.
**Changes:**
1. Replaced `exportBackup()` with a comprehensive version that builds a full data blob containing ALL 20+ data keys (matching the cloud push payload)
2. Added `_backupVersion: 2`, `_exportedAt` timestamp, and `_appVersion` metadata
3. Uses `electronAPI.saveFile()` for Electron, with fallback to `electronAPI.exportBackup()` (legacy) and web Blob download
4. Updated `restoreJsonBackup()` to restore ALL data keys from v2 backups while maintaining backwards compatibility with v1 backups (sections+rows only)
5. Restore now calls `renderTabs()` and `renderStackedTabs()` in addition to existing render calls
6. Shows backup version in success toast
**Files:** renderer/index.html (exportBackup, restoreJsonBackup functions)
