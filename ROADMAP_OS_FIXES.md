# Roadmap OS — Autonomous Fix Queue

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: implement → self-review → test (open the file, grep for regressions, verify logic) → commit with a descriptive message → move to the next fix. Do NOT ask questions. If something is ambiguous, make the best judgment call based on the codebase patterns and move on. Log your decisions in `FIX_LOG.md` as you go. If a fix requires changes across multiple files, batch them into one commit per fix.

**Codebase context:**
- Main renderer: `renderer/index.html` (23,445-line single-file SPA — all UI, logic, styles in one file)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/`
- The renderer uses `window.electronAPI.*` for platform ops
- Dark mode uses CSS variables
- Navigation is sidebar-driven with `showPage(pageName)` or similar routing function
- Rows/initiatives are inside roadmap sections, rendered dynamically
- All data is stored as one JSONB blob per user in `roadmap_data` table

**Before starting:** Run `wc -l renderer/index.html` and `grep -n "function show" renderer/index.html | head -30` to understand the routing pattern. Then `grep -n "function openEdit\|function editRow\|editInitiative\|rowClick\|onclick.*edit" renderer/index.html | head -30` to find edit-related functions. Log findings in `FIX_LOG.md`.

---

## Fix 1: Initiative Click-to-Edit Not Working

**Problem:** Clicking on individual initiatives/rows in the roadmap does not open an edit view.

**Approach:**
1. Search `renderer/index.html` for all click handlers on roadmap rows: `grep -n "onclick\|addEventListener.*click" renderer/index.html | grep -i "row\|init\|item"`.
2. Find the edit modal/overlay function (likely `openEditRow`, `editRow`, `showEditModal`, or similar).
3. Check if the click handler is correctly wired to the row elements. Common issues: event delegation not set up, click target CSS `pointer-events: none`, or the handler references a non-existent function.
4. Verify the edit modal actually renders with the correct data pre-populated.
5. Fix and test by searching for the modal's HTML to confirm it exists and is styled properly.

---

## Fix 2: Checklist Tab Not Showing Full Checklist

**Problem:** The G2M / Checklist tab doesn't display all checklist items.

**Approach:**
1. Search for the checklist rendering function: `grep -n "checklist\|g2m\|goToMarket\|renderChecklist" renderer/index.html`.
2. Check if the data source is being fully iterated (look for `.forEach`, `.map`, or `for` loops that render checklist items).
3. Common issues: a filter/slice truncating results, a container with `overflow: hidden` and fixed height cutting off items, or categories not being expanded by default.
4. Ensure all categories render and all items within each category are visible.
5. Check for any pagination or "show more" logic that might be hiding items.

---

## Fix 3: Roadmap Data Missing for velasabelo.com Account

**Problem:** When logging in with the velasabelo.com Gmail account, the roadmap was not present.

**Approach:**
1. This is likely a data sync issue. Check `sync-roadmap` edge function and the client-side load logic.
2. Search for the roadmap load flow: `grep -n "loadRoadmap\|fetchRoadmap\|getRoadmap\|sync-roadmap" renderer/index.html`.
3. Verify the RLS policy on `roadmap_data` — the `user_id` must match `auth.uid()`. If the user signed up with a different method (email vs Google OAuth), they might have two separate `auth.users` entries.
4. Check if there's a data migration path or if the account simply has no data yet.
5. For the template import fix: search for `import.*template\|importExcel\|importXls\|handleImport` and check the column mapping logic. Ensure the Excel parser (`xlsx` library or `SheetJS`) is correctly loaded in the web shim.
6. Test the import flow by tracing the function from the UI button to the data write.

---

## Fix 4: Add To-Do List to Top Navigation

**Problem:** To-Do list is missing from the top navigation.

**Approach:**
1. Find the top navigation bar HTML: `grep -n "top-nav\|topNav\|nav-bar\|toolbar\|header-nav" renderer/index.html | head -20`.
2. Check if a To-Do page/section already exists in the codebase: `grep -n "todo\|to-do\|task-list\|todoList" renderer/index.html`.
3. If a To-Do page exists, add a nav button that calls `showPage('todo')` or the equivalent routing function.
4. If no To-Do page exists, create one:
   - Add a nav button in the top navigation bar with an appropriate icon (checkbox/list icon)
   - Create a `<div id="todo-page" class="page">` section
   - Implement a basic task list: add task input, task list with checkboxes, mark complete, delete
   - Store to-do data in the user's roadmap JSONB blob under a `todos` key
   - Ensure dark mode CSS variables apply
   - Match the existing UI patterns (fonts, spacing, button styles, card styles)

---

## Fix 5: Add Plans to Top Navigation

**Problem:** Plans section is missing from the top navigation.

**Approach:**
1. Plans (WBS project planner) already exists as a feature. Search: `grep -n "plans\|plan-page\|showPlans\|planPage" renderer/index.html | head -20`.
2. Find the top navigation and add a "Plans" button that routes to the existing Plans page.
3. If Plans is only accessible via sidebar, duplicate the nav trigger in the top bar.
4. Ensure the button is styled consistently with other top nav items.

---

## Fix 6: Edit Row Popup Too Large

**Problem:** The three-dot menu / edit row popup expands across the entire screen.

**Approach:**
1. Find the popup/context menu: `grep -n "context-menu\|popup-menu\|three-dot\|more-options\|editMenu\|rowMenu\|dropdown-menu" renderer/index.html`.
2. The issue is CSS: the popup likely has `width: 100%` or no `max-width` constraint.
3. Fix by setting:
   - `max-width: 280px` (or appropriate size for the menu content)
   - `width: auto` or `width: fit-content`
   - `white-space: nowrap` on menu items if they're wrapping unnecessarily
   - Ensure `position: absolute` or `fixed` with proper `top`/`left` positioning relative to the trigger button
4. Test in both light and dark modes.

---

## Fix 7: Edit Timeline Button Non-Responsive

**Problem:** The Edit Timeline button doesn't respond to clicks.

**Approach:**
1. Search: `grep -n "editTimeline\|edit-timeline\|timelineEdit\|Edit Timeline" renderer/index.html`.
2. Check if the button has an `onclick` handler or event listener.
3. Common issues: handler references a function that doesn't exist, button is overlapped by another element (`z-index` issue), button is disabled, or `pointer-events: none` in CSS.
4. Fix the binding and ensure the timeline edit modal/interface opens correctly.

---

## Fix 8: Dark Mode — Prioritisation Page Buttons Too Light

**Problem:** In dark mode, buttons on the Prioritisation page and the left navigation pane are too light / hard to see.

**Approach:**
1. Find the prioritisation page styles: `grep -n "prioriti\|scoring\|framework" renderer/index.html | grep -i "style\|css\|class"`.
2. Identify button styles that don't use CSS variables for dark mode, or use hardcoded light colors.
3. Fix by ensuring all buttons use the dark mode CSS variable scheme. For example:
   - Button background: use `var(--btn-bg)` or add a dark mode override
   - Button text: ensure sufficient contrast (WCAG AA minimum)
   - Left nav pane: check sidebar button/link colors in dark mode
4. Add/update CSS rules inside the `@media (prefers-color-scheme: dark)` block or the `.dark-mode` class scope (whichever pattern the codebase uses — check first).
5. Target contrast ratio of at least 4.5:1 for text on buttons.

---

## Fix 9: Top 10 Priorities Overview Page

**Problem:** Need a new page showing the top 10 priorities across all initiatives.

**Approach:**
1. Create a new page section: `<div id="priorities-overview-page" class="page">`
2. Add a nav button for it (in sidebar and/or top nav as appropriate).
3. Data aggregation logic:
   - Pull all initiatives from `roadmap_data` JSONB blob
   - Pull task data from Plans section
   - Pull readiness data from G2M Checklist
   - Score/rank by: priority field (High > Med > Low), status (At Risk > Delayed > In Progress > Strategy), and any existing scoring data from the Prioritization module
   - Display the top 10 as cards or a ranked table
4. Each card should show:
   - Initiative name
   - Priority level (badge)
   - Current status (color-coded)
   - Owner
   - Progress % (derived from linked plan tasks if available)
   - G2M readiness score (% of checklist items complete for linked initiative)
   - Section/category it belongs to
   - Date range
5. Style with the existing card/dashboard patterns. Support dark mode.
6. Add a refresh button and "last updated" timestamp.

---

## Fix 10: Plans Template Defaults to "Globalisation Initiative"

**Problem:** Adding a plan template always pre-fills with "Globalisation initiative" data instead of being generic.

**Approach:**
1. Search: `grep -n "globalisation\|globalization\|template.*plan\|planTemplate\|defaultPlan" renderer/index.html`.
2. Find where the template data is defined. It's likely hardcoded with specific initiative names.
3. Fix by:
   - Making the template generic (phase names like "Phase 1: Planning", "Phase 2: Development", etc.)
   - Removing any hardcoded initiative association
   - Adding a "Link to Initiative" dropdown that lets users optionally associate the plan with a roadmap initiative AFTER creation
   - Keeping all 132 template fields but with generic placeholder content
4. Ensure the template is reusable across any initiative.

---

## Fix 11: CapacityIQ Button Non-Responsive

**Problem:** The CapacityIQ page/button doesn't navigate anywhere.

**Approach:**
1. Search: `grep -n "capacityiq\|capacity-iq\|CapacityIQ\|capacity_iq" renderer/index.html`.
2. Check if the page exists and if the nav button's click handler is wired up.
3. Fix the routing: ensure the button calls `showPage('capacityiq')` (or whatever the page ID is).
4. If the page section exists but is hidden, check for `display: none` issues or incorrect page ID references.

---

## Fix 12: Change Request Button Non-Responsive

**Problem:** The Change Request button doesn't work.

**Approach:**
1. Search: `grep -n "changeRequest\|change-request\|ChangeRequest\|change_request" renderer/index.html`.
2. Same diagnosis as Fix 11 — check if the page exists, check the click handler, fix the routing.
3. If the page doesn't exist yet, create a basic Change Request form:
   - Title, description, requester, priority, impact assessment, linked initiative
   - Status workflow: Submitted → Under Review → Approved → Rejected → Implemented
   - List view of all change requests with filtering
   - Store in the JSONB blob under a `changeRequests` key
   - Support dark mode

---

## Fix 13: Artefacts Button Routes to Roadmap Instead

**Problem:** Clicking Artefacts navigates to the Roadmap page, not the Artefacts page.

**Approach:**
1. Search: `grep -n "artefact\|artifact\|Artefact\|Artifact" renderer/index.html`.
2. Find the nav button and check its `onclick`/`showPage` call — it's probably pointing to `'roadmap'` instead of `'artefacts'`.
3. Fix the routing target.
4. If the Artefacts page doesn't have content, ensure it at least shows a functional page (list of AI-generated artefacts, brand guides, reports, etc. from the AI features).

---

## Fix 14: Dark Mode — Competitive Analysis Text Invisible

**Problem:** On the Competitive Analysis page in dark mode, research area text is white on a light background (unreadable).

**Approach:**
1. Search: `grep -n "competitive.*analysis\|research-area\|competitiveAnalysis" renderer/index.html | grep -i "style\|class\|css"`.
2. Find the research area text elements and their CSS.
3. The text is likely using a hardcoded `color: white` or inheriting a dark mode text color while the container background remains light.
4. Fix by ensuring the text color has proper contrast in dark mode:
   - If the container has a light background in dark mode: set text to `#1a1a1a` or `var(--text-dark)`
   - If the container should have a dark background: fix the container background
5. Check ALL text elements on this page for similar contrast issues.

---

## Fix 15: Super Admin → User Management + Platform Admin

**Problem:** Rename "Super Admin" to "User Management". Create a new "Platform Admin" role and page.

**Approach:**

### Part A: Rename Super Admin tab
1. Search and replace the UI label: "Super Admin" → "User Management" in nav items, page titles, breadcrumbs.
2. Keep the underlying `super_admin` role in `app_metadata` unchanged for backward compatibility.

### Part B: Create Admin role
1. Add a new role: `admin` (between `user` and `super_admin` in the hierarchy).
2. Admins can manage users within their own organisation only.
3. Update the user management page to:
   - Show only users in the same organisation
   - Allow role changes (user ↔ admin) but NOT super_admin or platform_admin
   - Allow inviting/removing users within the org

### Part C: Create Platform Admin page
1. New page: `<div id="platform-admin-page" class="page">`
2. Only accessible by users with a `platform_admin` flag in `app_metadata` (server-only writable — cannot be self-granted).
3. Features:
   - **Organisation Management:** List all organisations, view members, edit org details
   - **User Directory:** Search/filter all users across all orgs. View profile, tier, subscription status, last active
   - **Impersonation:** "View as" button that loads a user's roadmap data in read-only mode (audit-logged)
   - **Role Management:** Assign/revoke any role (user, admin, super_admin, platform_admin)
   - **Subscription Management:** View/override tier assignments
   - **Audit Log:** Log of all platform admin actions (impersonations, role changes, overrides)
   - **System Health:** Active user count, signup trends, storage usage
   - **Announcement System:** Broadcast a message to all users (shown as a notification)
4. Add a nav item that only renders when `app_metadata.platform_admin === true`.
5. All platform admin actions should be server-validated via edge functions (never trust the client).
6. Store the platform_admin flag and audit log in dedicated tables (or extend existing ones).

### Role hierarchy (top to bottom):
- `platform_admin` — god mode, manages entire application
- `super_admin` — manages their own organisation fully
- `admin` — manages users within their org
- `user` — standard user

---

## Fix 16: Save Backup — Full Data Export

**Problem:** The backup feature must export EVERY piece of user data so they can restore fully.

**Approach:**
1. Search: `grep -n "backup\|export.*data\|saveBackup\|downloadBackup" renderer/index.html`.
2. Ensure the backup includes ALL of the following:
   - `roadmap_data` JSONB blob (sections, rows, initiatives, bars, metadata)
   - Plans data (all WBS tasks, phases, subtasks, dependencies)
   - CapacityIQ data (teams, allocations, sprints)
   - G2M Checklist data (all categories, items, statuses)
   - Prioritisation scores and framework selections
   - Feedback items and their statuses
   - Contacts list
   - Comments (all threads)
   - Change requests (if implemented in Fix 12)
   - To-do items (if implemented in Fix 4)
   - Notification preferences
   - AI artifacts (competitive analyses, brand guides, DDS, UCR results)
   - Settings (theme preference, company logo base64, AI provider config — but NOT API keys for security)
   - Attachments: list of attachment metadata (filename, path, upload date). Note: actual files in Supabase Storage may need a separate download mechanism
3. Export format: JSON file named `RoadmapOS_Backup_{username}_{YYYY-MM-DD}.json`
4. Include a `version` field and `exported_at` timestamp in the backup for compatibility checking on restore.
5. Ensure the restore/import function:
   - Validates the backup JSON structure before applying
   - Shows a confirmation dialog: "This will replace all your current data. Continue?"
   - Writes the data back to all relevant stores
   - Handles version mismatches gracefully (e.g., newer backup format on older app version)

---

## Post-Fix Checklist (run after all fixes)

1. `grep -rn "TODO\|FIXME\|HACK\|XXX" renderer/index.html | head -20` — flag any leftover markers
2. Verify dark mode on EVERY new/modified page
3. Verify all new nav buttons route correctly
4. Check that no existing functionality is broken by searching for common patterns that might have been affected
5. Update `FIX_LOG.md` with a summary of all changes
6. Bump version to `1.28.0` in `package.json`
7. Rebuild web: `cd web && npm run build`
8. Commit all changes: `git add -A && git commit -m "v1.28.0: 16 fixes — edit flow, dark mode, nav, platform admin, backup, priorities overview"`

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG.md`.
2. **Never stop between fixes.** Complete one, commit, move to the next.
3. **Self-review after each fix:** Re-read your changes, check for typos, ensure no syntax errors, verify the logic.
4. **Test after each fix:** Use `grep`, `node -c` (for JS syntax), and visual inspection of the HTML structure.
5. **If a fix is blocked** (e.g., depends on backend changes you can't make), implement the frontend portion, add a `// TODO: requires backend migration` comment, log it in `FIX_LOG.md`, and move on.
6. **Preserve existing patterns.** Match the codebase's style: variable naming, indentation, CSS patterns, function structures.
7. **Dark mode everything.** Every new element must support the existing dark mode mechanism.
8. **Keep the single-file SPA pattern.** Do NOT extract to separate files. All changes go into `renderer/index.html` unless they're edge functions or config.
