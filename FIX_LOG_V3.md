# Roadmap OS Fix Log v3 -- v1.32.0 (2026-04-09)

20 fixes applied sequentially. Version bumped from 1.31.0 to 1.32.0.

---

## PHASE 1: Critical user-facing bugs

### Fix 1: JSON Roadmap Upload + Loading Animation
- **Files:** `renderer/index.html` (CSS lines ~1495-1510, HTML line ~1499, JS lines ~10312-10320, ~25302-25345)
- **Changes:**
  - Added reusable `.loading-overlay` CSS with `@keyframes loadSpin` spinner animation (no emoji)
  - Added `<div id="loadingOverlay">` element to `<body>`
  - Created `showLoading(msg)` and `hideLoading()` global functions
  - Refactored `restoreJsonBackup()` to extract `_applyJsonBackupData(d)` for reuse
  - Added loading overlay to `importFromExcel()` -- shows during parse, hides on success/error
  - Added loading overlay to JSON backup restore flow
  - Works on both Electron and web (electronAPI.importBackup exists on web via shim)

### Fix 2: Profile Photo Not Showing
- **Files:** `renderer/index.html` (lines ~6315, ~6832-6862, ~7031)
- **Changes:**
  - Created `loadUserAvatar()` function that checks: (1) Google OAuth `avatar_url`/`picture` from `_currentUser.user_metadata`, (2) custom upload `userProfile.avatarUrl`, (3) fallback to initials
  - Updated `applyProfileToUI()` to show avatar image when URL exists, with `onerror` fallback to initials
  - Updated Settings modal avatar display to use `loadUserAvatar()`
  - Fixed login flow: OAuth avatar is now always synced from `user_metadata` regardless of cached name

### Fix 16: Burger Menu Open by Default
- **Files:** `renderer/index.html` (line ~1729, lines ~19154-19210)
- **Changes:**
  - Removed `collapsed` class from `#appSidebar` default HTML -- sidebar now open by default
  - `toggleSidebar()` now saves preference to `localStorage` key `pmr_sidebar_collapsed`
  - `DOMContentLoaded` listener restores preference from localStorage
  - Preference persists across sessions

---

## PHASE 2: Task Library + Templates

### Fix 3: Task Library -- Seed 200+ Tasks
- **Files:** `renderer/index.html` (after line ~13025)
- **Changes:**
  - Created `seedDefaultTaskLibrary()` with 200 realistic tasks across 10 categories:
    - Engineering (25), Product (20), Design (20), QA (20), Marketing (20), Sales (20), Legal (15), Infrastructure (20), Support (20), Operations (20)
  - Each task has: name, category, hours, priority
  - Wired to run on Plans open and Task Library view render
  - Idempotent: skips if library already has 20+ entries

### Fix 4: Task Library UI -- Inline Editing + Button Layout
- **Files:** `renderer/index.html` (lines ~22147-22165, ~22189)
- **Changes:**
  - Task name and hours are now `contenteditable` -- click to edit, auto-save on blur
  - Added `_inlineLibSave(el)` function that updates taskLibrary entries and persists
  - Edit/Delete buttons now use `display:inline-block;vertical-align:middle;white-space:nowrap` for side-by-side layout
  - Enter key triggers blur to save

### Fix 11: Template Library Quality
- **Files:** `data/platform-templates.json`
- **Changes:**
  - Expanded New Market Expansion template from 13 to 24 tasks (added local support, supply chain, payment, cultural adaptation, competitor deep-dive, performance dashboard, etc.)
  - Added 5 new generic templates:
    1. **Product Analytics Setup** (15 tasks) -- instrumentation, dashboards, experimentation, governance
    2. **Customer Onboarding Program** (15 tasks) -- journey mapping, content, build, launch, optimize
    3. **DevOps Maturity Improvement** (15 tasks) -- CI/CD, observability, incident management, developer experience
    4. **Data Platform Build** (15 tasks) -- architecture, ingestion, transformation, visualization, governance
    5. **Team Scaling and Hiring** (15 tasks) -- workforce planning, process design, sourcing, onboarding
  - All templates now have 10-24 tasks with proper phases, hours, dependencies, and roles

### Fix 13: Template Upload via Excel + Link to Plans
- **Files:** `renderer/index.html` (HTML line ~2517, JS end of file)
- **Changes:**
  - Added "Upload Template" button to Template Library toolbar with SVG upload icon
  - `uploadTemplateFromExcel()` -- file picker for .xlsx/.xls/.csv, parses with XLSX library, prompts for name/category, creates template in `_tplCache`
  - `openImportFromTemplateModal(target)` -- picker modal showing all cached templates for quick import into Plans or ToDo
  - `importTemplateTasks(templateId, target)` -- imports template tasks into task library with loading overlay

---

## PHASE 3: Team + CapacityIQ fixes

### Fix 5: Edit Membership -- Fix Stacking Modals
- **Files:** `renderer/index.html` (line ~22883)
- **Changes:**
  - Added check for existing `#capEditMemberForm` before creating new one
  - Second click now toggles (removes) the form instead of stacking
  - Pattern: `if(existing){existing.remove();return;}`

### Fix 6: CapacityIQ Templates -- Light Mode Text
- **Files:** `renderer/index.html` (CSS lines ~1175-1176, JS line ~23299)
- **Changes:**
  - Changed `.cap-template-card .name` from hardcoded `color:#e2e8f0` to `color:var(--text)`
  - Changed `.cap-template-card .desc` from `color:#64748b` to `color:var(--muted)`
  - Changed initiative task count text from `color:#94a3b8` to `color:var(--muted)`

### Fix 7: CapacityIQ Initiatives -- Auto-Pull from Roadmap
- **Files:** `renderer/index.html` (lines ~22724-22770)
- **Changes:**
  - Added "Pull from Roadmap" button to initiatives toolbar with `white-space:nowrap` to prevent cut-off
  - Created `autoPopulateInitiativesFromRoadmap()` -- iterates `rows`, creates initiatives for each roadmap row not already tracked
  - Fixed initiative card text from hardcoded `color:#e2e8f0` to `color:var(--text)` and `color:#64748b` to `color:var(--muted)`
  - Empty state text updated to mention both buttons

### Fix 8: Team Management Overhaul
- **Files:** `renderer/index.html` (lines ~22608-22630)
- **Changes:**
  - Team name is now `contenteditable` -- inline editing with auto-save on blur
  - Added team description (contenteditable, placeholder "Add team description...")
  - Added member avatar circles (first 5 members shown as colored initials, "+N more" for overflow)
  - Added associated roadmap initiatives display (shows up to 3 as chips, "+N more" for overflow)
  - Fixed hardcoded "No members yet" text color to `var(--muted)`

---

## PHASE 4: Roadmap + Navigation

### Fix 9: Stacked Roadmaps -- Remove + Merge
- **Files:** `renderer/index.html` (lines ~5310-5545)
- **Changes:**
  - "Remove from Stack" button already existed -- verified working
  - Added "Merge into Main" button per stacked tab (green-tinted styling)
  - Created `mergeStackedTab(tabId)` -- merges sections (deduped by name) and rows (new IDs) from stacked tab into active roadmap, removes the stacked tab, re-renders

### Fix 10: Roadmap Owner + Collaborators
- **Files:** `renderer/index.html` (HTML line ~1708, JS lines ~6862-6878)
- **Changes:**
  - Added `<span id="roadmapOwnerBadge">` to main toolbar, before Share button
  - Created `updateRoadmapOwnerBadge()` -- shows owner first name + collaborator count from `_sharedWith`
  - Called after login/profile load

### Fix 12: Top Nav Button Alignment
- **Files:** `renderer/index.html` (CSS)
- **Changes:**
  - `.plans-topbar`: changed `align-items:flex-start` to `align-items:center`, added `min-height:52px`
  - `.prio-topbar`: added `min-height:52px`
  - `.cap-topbar`: added `min-height:52px`

### Fix 14: To-Do Task Library Search + Text Visibility
- **Files:** `renderer/index.html` (HTML line ~2239, JS lines ~12335-12370)
- **Changes:**
  - Wrapped ToDo add-task input in a relative container with autocomplete suggestions dropdown
  - Created `_todoLibAutocomplete(inp)` -- searches `taskLibrary` by name, shows up to 8 matches
  - Click on suggestion fills task name and estimated hours
  - Click-outside closes suggestions
  - Fixed `option` background from `#fff` to `var(--white)` across all 4 instances

### Fix 17: Merge Top 10 into Prioritisation
- **Files:** `renderer/index.html` (HTML lines ~2548-2563, JS lines ~17589-17596, ~23594-23640)
- **Changes:**
  - Added "Top 10" as first sidebar item in Prioritisation overlay
  - Updated `prioNav()` to handle `'top10'` page
  - Created `renderPrioTop10Tab()` -- renders top 10 priorities inside Prioritisation content area
  - Changed default tab from 'score' to 'top10'
  - Redirected `openTop10()` to open Prioritisation with top10 tab
  - Top 10 Overlay still exists for backward compat but now redirects

### Fix 18: Rename G2M to "Checklist" in Nav
- **Files:** `renderer/index.html`
- **Changes:**
  - Changed sidebar label from "G2M Checklist" to "Checklist"
  - Changed all remaining "G2M Checklist" text references to "Checklist" (sidebar, dashboard button, onboarding tips, template options)
  - Changed G2M overlay header from "GO-TO-MARKET" to "Checklist -- Business Readiness"
  - Internal function names (openG2M, g2mOverlay, etc.) kept for backward compatibility

---

## PHASE 5: Onboarding + Global polish

### Fix 15: New User Onboarding Flow
- **Files:** `renderer/index.html` (CSS, JS)
- **Changes:**
  - Added `.onboard-overlay`, `.onboard-card`, `.onboard-body`, `.onboard-dots`, `.onboard-actions` CSS with dark mode support
  - Created 6-step onboarding flow: Welcome, Create Roadmap, Set Up Team, Import Tasks, Explore Features, Done
  - Each step has SVG icon (stroke-based, no emoji), title, description, progress dots, Skip/Next buttons
  - `showOnboarding()` creates overlay, `_nextOnboardStep()` advances, `_completeOnboarding()` saves flag
  - `checkOnboarding()` triggers on login when `rows` is empty and flag not set
  - Added "Re-run Onboarding Tour" button to Settings modal
  - Clean design, dark mode compatible, zero emoji

### Fix 19: Global Light/Dark Mode Contrast Audit
- **Files:** `renderer/index.html` (CSS dark mode section)
- **Changes:**
  - Added dark mode overrides for hardcoded colors: `#64748b`, `#475569`, `#cbd5e1`, `#334155`, `#1e293b` all map to `var(--muted)` or `var(--text)`
  - Added dark mode background overrides for `#f8f9fb`, `#f4f7fc`, `#e8edf7`, `white`
  - Light mode: `#94a3b8` text forced to `#64748b` for minimum contrast
  - Fixed Settings modal background from `#fff` to `var(--white)`
  - Changed all `font-size:9px;color:#64748b` labels to use `var(--muted)` (replace_all)
  - Added `.onboard-card` dark mode background

### Fix 20: G2M Hours Input Size
- **Files:** `renderer/index.html` (CSS line ~543)
- **Changes:**
  - Input: `width:60px`, `max-height:24px`, `padding:3px 4px`, `text-align:center`, border and border-radius
  - Stepper buttons: `height:14px`, `width:10px`, reduced opacity
  - Allows free text numeric entry via `-moz-appearance:textfield`

---

## Version
- **package.json:** 1.31.0 -> 1.32.0
- **No commit created** (per instructions)
