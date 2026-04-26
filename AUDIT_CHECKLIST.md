# Roadmap OS — Fix Verification Checklist (v1–v12)
# Each item has: fix ID, description, static check (grep), E2E check (browser), visual check (screenshot)

## ===========================================
## V1 FIXES (16 fixes)
## ===========================================

### V1-F1: Initiative Click-to-Edit
- STATIC: grep for onclick/addEventListener on roadmap rows that opens edit modal
- E2E: Click a roadmap row → edit modal opens with data pre-populated
- VISUAL: Edit modal renders correctly in both modes

### V1-F2: Checklist Tab Full Display
- STATIC: grep for checklist rendering loop — no slice/limit truncating results
- E2E: Navigate to Checklist → all items visible, no cut-off
- VISUAL: All checklist items visible without scrolling issues

### V1-F3: Roadmap Data Sync (velasabelo account)
- STATIC: grep for sync-roadmap calls on login, RLS policy on roadmap_data
- E2E: Login → roadmap data loads → verify sections exist
- VISUAL: N/A

### V1-F4: To-Do List in Top Nav
- STATIC: grep for todo nav item in top navigation HTML
- E2E: Click To-Do in top nav → To-Do page renders
- VISUAL: To-Do button visible in top nav bar

### V1-F5: Plans in Top Nav
- STATIC: grep for plans nav item in top navigation HTML
- E2E: Click Plans in top nav → Plans page renders
- VISUAL: Plans button visible in top nav bar

### V1-F6: Edit Row Popup Size
- STATIC: grep for max-width/width on edit row popup CSS
- E2E: Click three-dot menu on a row → popup is compact (not full-screen)
- VISUAL: Popup is appropriately sized

### V1-F7: Edit Timeline Button
- STATIC: grep for editTimeline function and its onclick binding
- E2E: Click Edit Timeline → timeline edit interface opens
- VISUAL: N/A

### V1-F8: Dark Mode Prioritisation Buttons
- STATIC: grep for dark-mode overrides on prioritisation page buttons
- E2E: Toggle dark mode → navigate to Prioritisation → buttons visible and readable
- VISUAL: Buttons have sufficient contrast in dark mode

### V1-F9: Top 10 Priorities Page (later merged into Prioritisation)
- STATIC: grep for priority ranking/aggregation in prioritisation page
- E2E: Navigate to Prioritisation → top priorities section visible
- VISUAL: Priority cards render with correct badges

### V1-F10: Plans Template Default Fix
- STATIC: grep for "globalisation" or "globalization" — should NOT be default
- E2E: Add a template in Plans → should be generic, not "Globalisation"
- VISUAL: N/A

### V1-F11: CapacityIQ Button
- STATIC: grep for capacityiq in showPage cases
- E2E: Click Capacity IQ → page renders (not empty/broken)
- VISUAL: Page renders with content

### V1-F12: Change Request Button
- STATIC: grep for changeRequest page or route
- E2E: Navigate to Change Request → page renders
- VISUAL: N/A

### V1-F13: Artefacts Button Routes Correctly
- STATIC: grep for artefacts in showPage — should NOT route to roadmap
- E2E: Click Artefacts → Artefacts page renders (not Roadmap)
- VISUAL: Correct page displayed

### V1-F14: Dark Mode Competitive Analysis Text
- STATIC: grep for dark-mode CSS on competitive analysis research area text
- E2E: Dark mode → Competitive Analysis → text readable
- VISUAL: All text visible against dark background

### V1-F15: Super Admin → User Management + Platform Admin
- STATIC: grep for "User Management" label, platform_admin role, admin role
- E2E: Navigate to User Management → page renders with role management
- VISUAL: N/A

### V1-F16: Save Backup Full Data
- STATIC: grep for backup export function — verify it includes all data keys
- E2E: Click Save Backup → JSON file downloads → verify it contains sections, todos, plans, etc.
- VISUAL: N/A

## ===========================================
## V2 FIXES (16 fixes)
## ===========================================

### V2-F1: Dark Mode Global Audit
- STATIC: count hardcoded #fff/white backgrounds without dark-mode override
- E2E: Toggle dark mode → navigate ALL pages → no white backgrounds
- VISUAL: Screenshot every page in dark mode — no white panels

### V2-F2: Dropdown Visibility Dark Mode
- STATIC: grep for dark-mode select/option CSS overrides
- E2E: Dark mode → open dropdowns on To-Do, Edit Row → text visible
- VISUAL: Dropdown text readable in dark mode

### V2-F3: Emoji → SVG Replacement
- STATIC: grep -Pc for Unicode emoji range — MUST be 0
- E2E: Navigate all pages → no emoji visible (only SVG icons)
- VISUAL: No emoji on any page

### V2-F4: To-Do Task Reuse from Library
- STATIC: grep for task library search/autocomplete on To-Do add task
- E2E: Add Task on To-Do → type text → suggestions appear from task library
- VISUAL: Suggestion dropdown renders

### V2-F5: To-Do UI Overhaul
- STATIC: grep for rounded border-radius on todo cards/kanban
- E2E: Navigate to To-Do → cards are rounded, clean, match roadmap style
- VISUAL: UI matches roadmap page design language

### V2-F6: Initiative Linking
- STATIC: grep for row.links array, link picker modal
- E2E: Edit an initiative → "Linked Initiatives" section visible → can add links
- VISUAL: Link pills/tags render on initiatives

### V2-F7: Edit Sections
- STATIC: grep for editSection function, section editor modal
- E2E: Right-click/menu on section → "Edit Section" option → can rename
- VISUAL: N/A

### V2-F8: CapacityIQ Dashboard Loading
- STATIC: grep for capacity dashboard render call in showPage
- E2E: Navigate to Capacity IQ → Dashboard tab → content renders (not empty)
- VISUAL: Dashboard has data/cards

### V2-F9: Task Library Bulk Upload + Cross-Module Population
- STATIC: grep for addToTaskLibrary calls in todo, plans, g2m creation functions
- E2E: Create a task in Plans → check Task Library → task appears there
- VISUAL: N/A

### V2-F10: G2M Hours Input Size
- STATIC: grep for hours input CSS on G2M page — buttons should be small (24-28px)
- E2E: G2M page → hours input → number visible, +/- buttons appropriately sized
- VISUAL: Input is usable

### V2-F11: Plans/Gantt Dark Mode
- STATIC: grep for dark-mode overrides on gantt/plan rows
- E2E: Dark mode → Plans → Gantt view → all rows readable, no white backgrounds
- VISUAL: All rows have dark backgrounds with light text

### V2-F12: User Avatar Circle
- STATIC: grep for user-avatar-circle, border-radius: 50%
- E2E: Check top-right → circular avatar with initials or photo
- VISUAL: Avatar is circular

### V2-F13: Help Button Moved to Profile
- STATIC: grep for help button NOT in top-right header area
- E2E: Top-right header → no standalone help button. Profile menu → Help option exists
- VISUAL: Clean top-right area

### V2-F14: Artefacts Colors + Document Repository
- STATIC: grep for document repository data model, upload function
- E2E: Artefacts page → "New Artefact" button uses theme colors → Document Repository section exists
- VISUAL: Buttons match theme, document list renders

### V2-F15: G2M Emoji Removal + Insights Dark Mode
- STATIC: covered by V2-F3 emoji sweep + V2-F1 dark mode
- E2E: G2M page → no emoji, Insights header readable in dark mode
- VISUAL: No emoji on G2M

### V2-F16: Artefacts Templates Emoji Removal
- STATIC: covered by V2-F3
- E2E: Artefacts → Templates → no emoji
- VISUAL: SVG icons only

## ===========================================
## V3 FIXES (20 fixes)
## ===========================================

### V3-F1: JSON Upload + Loading Animation
- STATIC: grep for showLoadingOverlay, loading-overlay element, importJSON function
- E2E: Click Import → select JSON → loading spinner shows → data loads
- VISUAL: Loading spinner with Roadmap OS branding

### V3-F2: Profile Photo Top Right
- STATIC: grep for loadUserAvatar, profile picture URL check
- E2E: Upload profile pic → top-right avatar shows the photo
- VISUAL: Photo visible in avatar circle

### V3-F3: Task Library 500+ Tasks
- STATIC: grep for syncTemplateTasksToLibrary, getDefaultTaskLibrary
- E2E: Navigate to Task Library → count > 173 tasks
- VISUAL: Task list is populated

### V3-F4: Task Library Edit/Delete Layout
- STATIC: grep for task-actions flex layout (side by side, not stacked)
- E2E: Task Library → Edit and Delete buttons are horizontal
- VISUAL: Buttons side by side

### V3-F5: Edit Membership Fix (no stacking)
- STATIC: grep for closeAllModals before openEditMembership
- E2E: Click Edit Membership multiple times → only ONE modal open
- VISUAL: Single modal, no stacking

### V3-F6: CapacityIQ Templates Light Mode
- STATIC: grep for dark-mode AND light-mode text color on CIQ templates
- E2E: Light mode → CIQ templates → text readable
- VISUAL: Template text visible in light mode

### V3-F7: CIQ Initiatives Auto-Pull
- STATIC: grep for loadCapacityInitiatives pulling from currentData.sections
- E2E: CIQ → Initiatives → shows roadmap initiatives (not empty)
- VISUAL: Initiatives listed

### V3-F8: Team Management Overhaul
- STATIC: grep for team description field, member dropdown, associated initiatives
- E2E: Edit team → description field exists, member add works
- VISUAL: Team card shows description

### V3-F9: Stacked Roadmaps — Remove/Add/Merge
- STATIC: grep for unstackRoadmap, mergeRoadmaps functions
- E2E: Stack a roadmap → unstack button exists → Add Row still works
- VISUAL: N/A

### V3-F10: Roadmap Owner + Collaborators
- STATIC: grep for roadmap owner auto-population, collaborators field
- E2E: Roadmap header shows owner name
- VISUAL: Owner name visible

### V3-F11: Template Quality Overhaul (10+ templates)
- STATIC: count templates in getDefaultTemplates — should be 10+
- E2E: Templates page → at least 10 platform templates listed
- VISUAL: Template cards rendered

### V3-F12: Top Nav Button Centering
- STATIC: grep for .page-toolbar with align-items: center
- E2E: Plans page → buttons vertically centered in toolbar
- VISUAL: Buttons not cut off at top

### V3-F13: Template Upload Excel + Link to Plans
- STATIC: grep for template upload Excel handler, importTemplateIntoPlan
- E2E: Plans → Templates → Import → tasks appear in plan
- VISUAL: N/A

### V3-F14: To-Do Task Library + Text Visibility
- STATIC: grep for task library search on todo add task, text color not #ccc
- E2E: To-Do → Add Task → search works, task text readable in light mode
- VISUAL: Task text visible

### V3-F15: Onboarding Flow
- STATIC: grep for onboarding-step elements (6 steps), showOnboarding function
- E2E: New user → onboarding overlay appears → can progress through steps
- VISUAL: Onboarding screens render properly

### V3-F16: Sidebar Open by Default
- STATIC: grep for sidebar default open logic on login
- E2E: Login → sidebar is open
- VISUAL: Sidebar visible on first load

### V3-F17: Top 10 Merged into Prioritisation + Comments
- STATIC: grep for priority ranking section inside prioritisation page, comment system
- E2E: Prioritisation → top priorities visible → can add comments
- VISUAL: Priority cards with comment section

### V3-F18: G2M → Checklist Rename
- STATIC: grep for "Checklist" label in top nav (not "G2M" or "GTM")
- E2E: Top nav shows "Checklist" → clicking it opens the checklist page
- VISUAL: Nav label says "Checklist"

### V3-F19: Light/Dark Mode Final Audit
- STATIC: count hardcoded colors without CSS variable overrides
- E2E: Toggle both modes on every page
- VISUAL: Full screenshot comparison

### V3-F20: G2M Hours Input
- STATIC: same as V2-F10
- E2E: same as V2-F10
- VISUAL: same as V2-F10

## ===========================================
## V4 FIXES (8 fixes)
## ===========================================

### V4-F1: JSON Import on Web
- STATIC: grep for web shim file open implementation, pickFileContent function
- E2E: Web app → Import JSON → file loads → roadmap renders
- VISUAL: Loading overlay during import

### V4-F2: Templates Unified (Templates page = CIQ templates)
- STATIC: grep for getAllTemplates being called by BOTH pages
- E2E: Count templates on main page vs CIQ page → same count
- VISUAL: N/A

### V4-F3: Template Builder
- STATIC: grep for openTemplateBuilder, templateBuilderState, cross-template selection
- E2E: Open template builder → browse templates → check tasks → save/import
- VISUAL: Builder UI renders

### V4-F4: Document Upload (Artefacts)
- STATIC: grep for file-upload-zone, drag-drop handler, Supabase Storage upload
- E2E: Artefacts → Add Document → drag file → saves → appears in list
- VISUAL: Upload zone renders, file preview shows

### V4-F5: Signup Invite Teammates
- STATIC: grep for onboarding invite step, Google contacts stub
- E2E: Onboarding → invite step shows → can enter emails
- VISUAL: Invite step renders

### V4-F6: Plans Toolbar Centering
- STATIC: same as V3-F12
- E2E: Plans page → buttons centered
- VISUAL: same as V3-F12

### V4-F7: Plans Template Import
- STATIC: grep for importTemplateIntoPlan function being called from Plans Templates button
- E2E: Plans → Templates → select → Import → tasks appear in plan
- VISUAL: N/A

### V4-F8: Browser Back Navigation
- STATIC: grep for history.pushState in showPage, popstate listener
- E2E: Navigate 3+ pages → back → goes to previous page (NOT login)
- VISUAL: N/A

## ===========================================
## V5 FIXES (10 fixes)
## ===========================================

### V5-F1: Template Categorization (Platform vs Organisation)
- STATIC: grep for type: 'platform', type: 'organisation', filter tabs
- E2E: Templates page → filter tabs exist (All/Platform/Organisation)
- VISUAL: Type badges on template cards

### V5-F2: Global Toolbar Centering
- STATIC: grep for .page-toolbar class applied to ALL page headers
- E2E: Check 5+ pages → all toolbars centered
- VISUAL: No cut-off buttons on any page

### V5-F3: Template Editor (customise + task library + save)
- STATIC: grep for openTemplateEditor, editorWorkingTasks, saveEditorAsTemplate
- E2E: Click platform template → can check/uncheck tasks → add from library → save as org template
- VISUAL: Editor UI renders

### V5-F4: Create Template Enhanced
- STATIC: grep for task library picker in create template form
- E2E: Create Template → can pull from task library → can import from existing template
- VISUAL: N/A

### V5-F5: Browse Templates on Checklist
- STATIC: grep for browseChecklistTemplates function bound to button
- E2E: Checklist → Browse Templates button → works → can import
- VISUAL: N/A

### V5-F6: Competitive Analysis — Emoji + Per-User Research Areas
- STATIC: grep for emoji near "despatch" — should be gone. grep for researchAreas in user data
- E2E: Competitive Analysis → no emoji → new user sees empty research areas
- VISUAL: No emoji on page

### V5-F7: Nav Highlight + Browser Back
- STATIC: grep for updateNavHighlight in showPage
- E2E: Switch pages → correct tab highlighted each time. Back button works.
- VISUAL: Correct tab active

### V5-F8: Remove Top 10 Priorities Tab
- STATIC: grep for "Top 10 Priorities" nav item — should NOT exist
- E2E: No "Top 10 Priorities" in sidebar or top nav
- VISUAL: N/A

### V5-F9: Feedback System
- STATIC: grep for feedback submission form, feedback inbox, vote system
- E2E: Feedback page → can submit → inbox shows items
- VISUAL: Feedback page renders

### V5-F10: CIQ Templates Visibility + Picker Fix
- STATIC: grep for checked text dark-mode styles, getAllTemplates in CIQ create
- E2E: CIQ → checked tasks readable in light mode → create template shows all sources
- VISUAL: Checked text visible

## ===========================================
## V6 FIXES (9 fixes) — Abbreviated
## ===========================================
### V6-F1: Quarter/FY Management → STATIC: grep for addQuarter, configureFYStart
### V6-F2: Template Import to Plans → E2E: Import works (tasks appear)
### V6-F3: Template Builder Select All → STATIC: grep for toggleSelectAll, category select
### V6-F4: Add Task Tab Cleanup → STATIC: "From Excel" tab removed, "From Task Library" exists
### V6-F5: Colours Button Removed → STATIC: no Colours button on Plans
### V6-F6: To-Do Enhancements → E2E: Add task matches Plans, edit works, auto-pull from Plans
### V6-F7: Dark Mode Definitive → STATIC: CSS variable system exists with full :root + .dark-mode
### V6-F8: Sidebar Reorg → STATIC: Roadmap/Data dropdowns in legend, removed from sidebar
### V6-F9: To-Do Tabs (Timesheet, My Capacity) → E2E: Three tabs on To-Do page

## ===========================================
## V7 FIXES (6 fixes)
## ===========================================
### V7-F1: Date Picker Current Context → E2E: Add Product → date defaults to current quarter
### V7-F2: Edit Row Nav Links → E2E: Click link in edit modal → can navigate back
### V7-F3: Add Initiative Shortcut → E2E: Three-dot menu → "Add Initiative" option exists
### V7-F4: Add Row → Add Product → STATIC: grep for "Add Product" (not "Add Row")
### V7-F5: Settings Reorg → E2E: Settings in profile menu, not sidebar. Style/Brand in Artefacts.
### V7-F6: Desktop↔Web Data Sync → E2E: Change on web → visible on desktop (manual check)

## ===========================================
## V8 FIXES (9 fixes)
## ===========================================
### V8-F1: Task Library Sync from Templates → STATIC: grep for syncTemplateTasksToLibrary
### V8-F2: Today Line Position → E2E: Roadmap → today line on current date (not far left)
### V8-F3: Burger Menu Auto-Close → E2E: Open sidebar → click page → sidebar closes
### V8-F4: Page Removals (UCR, Task Ref, Sprints, etc.) → STATIC: pages removed from nav
### V8-F5: CIQ in Top Nav → E2E: Capacity IQ button in top nav, not sidebar
### V8-F6: CIQ Dashboard Overhaul → E2E: Real capacity data, period switching
### V8-F7: Reports Monthly Capacity → E2E: Monthly tab on Reports Dashboard
### V8-F8: Help Widget → E2E: Floating button bottom-right → click → options panel
### V8-F9: Feedback Page Branding → E2E: Feedback page has logo, favicon, attachment upload, trial CTA

## ===========================================
## V9 FIXES (11 fixes)
## ===========================================
### V9-F1: CIQ Template Icons + Focused View + Save + Search
### V9-F2: Capacity Dashboard Individual Users
### V9-F3: Edit Team Overhaul
### V9-F4: Add Team Popup
### V9-F5: Strategy → Reports Dashboard + Change Log + Multi-Period
### V9-F6: My Capacity → CIQ
### V9-F7: Today Line (3rd fix)
### V9-F8: Roadmap Date Range Filter
### V9-F9: Notifications + Alerts System
### V9-F10: Dashboard Plans Card (replace Shared with Me)
### V9-F11: CIQ Removals Verified

## ===========================================
## V10 FIXES (8 fixes — Integrations)
## ===========================================
### V10-F1: Integration DB Tables → STATIC: migration file exists
### V10-F2: OAuth Edge Function → STATIC: integrations-oauth function exists
### V10-F3: Sync Edge Function → STATIC: integrations-sync function exists
### V10-F4: Webhook Edge Function → STATIC: integrations-webhook function exists
### V10-F5: Integration API → STATIC: integrations-api function exists
### V10-F6: Integrations Page UI → E2E: Navigate to Integrations → 5 cards render
### V10-F7: Sync Trigger Frontend → STATIC: triggerSync, connectIntegration functions exist
### V10-F8: Setup Guide → STATIC: INTEGRATION_SETUP_GUIDE.md exists

## ===========================================
## V11 FIXES (9 fixes)
## ===========================================
### V11-F1: Onboarding Team Step → E2E: Onboarding includes team setup step
### V11-F2: Loading Spinner Branded → E2E: Heavy page load → spinner with logo
### V11-F3: Remove Free Trial Text → STATIC: grep for "free trial" — minimal results
### V11-F4: Sample Data for New Users → STATIC: getSampleData function with sections/todos/kpis
### V11-F5: Initiative Fields (Revenue, Labels, Owner, Dates) → E2E: Edit initiative → fields exist
### V11-F6: Comments on Initiatives → E2E: Edit initiative → comments section → can post
### V11-F7: Duplicate/Archive/Watch → E2E: Three-dot menu has all three options
### V11-F8: Browser Back (4th fix — NavManager) → E2E: Navigate 3 pages → back works correctly
### V11-F9: Plan Sharing + Follow → E2E: Share button on Plans → modal opens. Eye button toggles.

## ===========================================
## V12 FIXES (9 fixes)
## ===========================================
### V12-F1: Select All (G2M, Task Library, Planning) → E2E: Select All checkboxes work
### V12-F2: Hours Tooltip → STATIC: no inline "8 hours" text, tooltip-trigger exists
### V12-F3: Timeline Pill Sync + Filters + Scroller → E2E: Edit date → pill updates. Filters work. Scroller visible.
### V12-F4: Edit Team Add Members Dropdown → E2E: Edit team → member dropdown exists
### V12-F5: Email Invite Resend Fix → E2E: Send invite → email received (or specific error shown)
### V12-F6: Team Logo + Card Display + Bottom Rounding → E2E: Team card shows description + avatars. Modal rounded.
### V12-F7: CIQ Templates Count → E2E: CIQ templates > 2 (should be 10+)
### V12-F8: CIQ Dashboard Team Capacity → E2E: Dashboard shows team-level capacity cards
### V12-F9: Portfolio Overview Removed → STATIC: "Portfolio Overview" not in Reports Dashboard
