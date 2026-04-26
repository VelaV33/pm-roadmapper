# Roadmap OS — Autonomous Fix Queue v2

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test (grep for regressions, verify logic, check dark mode) → log in `FIX_LOG_V2.md` → move to the next fix. Do NOT ask questions. Make your best judgment and document decisions. If something is ambiguous, choose the approach most consistent with the existing codebase.

**Codebase context:**
- Main renderer: `renderer/index.html` (23,445-line single-file SPA — all UI, logic, styles in one file)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/`
- The app uses `window.electronAPI.*` for platform ops
- Dark mode uses CSS variables and a `.dark-mode` class (or similar — confirm by grepping)
- Navigation is sidebar-driven with `showPage(pageName)` or similar routing function
- Data stored as one JSONB blob per user in `roadmap_data` table
- All new elements MUST support dark mode

**Before starting:**
1. `grep -n "dark-mode\|darkMode\|dark_mode\|prefers-color-scheme" renderer/index.html | head -40` — understand the dark mode mechanism
2. `grep -n "\.emoji\|emoji\|📊\|📋\|📝\|🎯\|🔥\|💡\|⚡\|🚀\|✅\|❌\|📈\|🏷\|📌\|🔔\|👤\|📁" renderer/index.html | head -60` — find all emoji usage
3. `grep -n "function showPage\|function show(" renderer/index.html | head -20` — understand routing
4. `grep -cn "<select\|<option\|dropdown\|Dropdown" renderer/index.html` — count dropdowns to scope the audit
5. Log all findings in `FIX_LOG_V2.md`

---

## Fix 1: App-Wide Dark Mode Audit — White Background + Light Text Problem

**Problem:** Throughout the entire application, when in dark mode, many elements retain white backgrounds with grey or white text, making content unreadable. This is the single most reported issue and appears on: To-Do page, edit row popup, Capacity IQ header, Plans/Gantt page, G2M insights header, Artefacts page header, and many other places.

**This is a GLOBAL fix — not page-by-page patching.**

**Approach:**
1. First, understand the dark mode system:
   ```bash
   grep -n "dark-mode\|\.dark\b" renderer/index.html | head -50
   ```
   Identify: Is it a class toggle (`.dark-mode`)? CSS variables? `prefers-color-scheme` media query? A combination?

2. Find ALL hardcoded white/light backgrounds that override dark mode:
   ```bash
   grep -n "background.*#fff\|background.*white\|background.*#ffffff\|background.*#fafafa\|background.*#f5f5f5\|background.*#f0f0f0\|background.*#e0e0e0\|background-color.*white\|bg-white" renderer/index.html | wc -l
   ```
   And all hardcoded light text colors:
   ```bash
   grep -n "color.*#ccc\|color.*#ddd\|color.*#999\|color.*#aaa\|color.*#bbb\|color.*lightgr\|color.*#e0e0e0" renderer/index.html | wc -l
   ```

3. **The fix strategy:** Rather than patching individual elements, create/enhance a comprehensive dark mode override block at the end of the `<style>` section:
   ```css
   /* === DARK MODE GLOBAL OVERRIDES === */
   .dark-mode {
     /* Page backgrounds */
     --page-bg: #1a1a2e;
     --card-bg: #16213e;
     --surface-bg: #1e2a3a;
     --input-bg: #1e2a3a;
     --modal-bg: #1a1a2e;

     /* Text */
     --text-primary: #e8e8e8;
     --text-secondary: #b0b0c0;
     --text-muted: #8888a0;

     /* Borders */
     --border-color: #2a3a5a;
   }
   ```
   Then apply these variables to ALL page containers, cards, modals, headers, inputs, and text elements.

4. Specifically target these reported problem areas (but do the global fix first):
   - **Edit row popup**: Find the modal/overlay and ensure its background uses `var(--modal-bg)` in dark mode
   - **Capacity IQ header**: The "Capacity Dashboard" title bar — fix background and text color
   - **Plans/Gantt chart**: Task rows alternating white/dark — make ALL rows use dark backgrounds with light text
   - **Plans page title**: "Go-To-Market" and "Link Roadmap now" title area — fix white background
   - **G2M insights header**: "Insights" section at top — fix white background + grey text
   - **Artefacts page header**: "Product Artefacts and Collateral" — fix white background + grey text
   - **To-Do page**: All card backgrounds, Kanban board columns

5. After implementing, do a verification pass:
   ```bash
   grep -n "background.*#fff\|background.*white\|background-color: white" renderer/index.html
   ```
   Every remaining `white` or `#fff` background MUST have a corresponding `.dark-mode` override.

---

## Fix 2: App-Wide Dropdown Visibility in Dark Mode

**Problem:** Dropdowns throughout the app (To-Do initiative selector, KPI attribute selectors, and others) have text that's invisible or hard to read in dark mode.

**Approach:**
1. Find all `<select>` elements and custom dropdowns:
   ```bash
   grep -n "<select\|dropdown\|drop-down\|select-menu\|custom-select" renderer/index.html | head -40
   ```

2. The core issue: `<select>` and `<option>` elements don't inherit dark mode styles well in most browsers. Fix with:
   ```css
   .dark-mode select,
   .dark-mode select option {
     background-color: var(--input-bg, #1e2a3a);
     color: var(--text-primary, #e8e8e8);
     border-color: var(--border-color, #2a3a5a);
   }
   .dark-mode select option:hover,
   .dark-mode select option:checked {
     background-color: var(--accent-color, #3a5a8a);
   }
   ```

3. For custom dropdown components (div-based), ensure:
   - Dropdown container: dark background
   - Dropdown items: dark background + light text
   - Hover state: slightly lighter dark background
   - Selected state: accent color background

4. Test on these specific dropdowns:
   - To-Do page: "All Initiatives" dropdown
   - To-Do page: KPI attribute selectors
   - Edit row: any status/priority/owner dropdowns
   - Plans: task assignment dropdowns
   - Any filter/sort dropdowns in table headers

---

## Fix 3: App-Wide Emoji Replacement — AI Emojis → Clean SVG Icons

**Problem:** The app uses Unicode/AI emojis (📊📋🎯🚀✅ etc.) in multiple places. These must ALL be replaced with clean, minimal SVG icons consistent with the left navigation pane's icon style.

**Approach:**
1. Catalogue ALL emoji usage:
   ```bash
   grep -Pn '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE00}-\x{FE0F}\x{200D}\x{20E3}\x{E0020}-\x{E007F}]' renderer/index.html > /tmp/emoji_locations.txt
   cat /tmp/emoji_locations.txt | wc -l
   ```
   Also try:
   ```bash
   grep -n '📊\|📋\|📝\|🎯\|🔥\|💡\|⚡\|🚀\|✅\|❌\|📈\|🏷\|📌\|🔔\|👤\|📁\|🗂\|📎\|🔗\|⭐\|💎\|🏆\|📅\|🔍\|⚙\|🛡\|🔒\|💬\|📣\|🎨\|🧩\|📦\|🔄\|➕\|➖\|▶\|◀\|⏱\|🕐\|❗\|⚠\|✨\|🎉\|👋\|🤖\|💪\|🧠\|📱\|💻\|🌐\|🌍' renderer/index.html | wc -l
   ```

2. Study the sidebar nav icons to understand the existing SVG style:
   ```bash
   grep -A5 "nav.*svg\|sidebar.*svg\|<svg.*nav\|menu.*icon" renderer/index.html | head -60
   ```

3. Create a reusable SVG icon set as inline functions or a lookup object. Match the sidebar style:
   - Stroke-based (not filled), likely 1.5px-2px stroke width
   - Monochrome, using `currentColor` so they inherit text color
   - 16×16 or 20×20 viewBox
   - Clean, minimal line art (similar to Lucide/Feather icon style)

4. Build a mapping object:
   ```javascript
   const SVG_ICONS = {
     chart: '<svg viewBox="0 0 20 20" ...>...</svg>',
     clipboard: '<svg viewBox="0 0 20 20" ...>...</svg>',
     target: '<svg viewBox="0 0 20 20" ...>...</svg>',
     rocket: '<svg viewBox="0 0 20 20" ...>...</svg>',
     check: '<svg viewBox="0 0 20 20" ...>...</svg>',
     // ... etc for every emoji found
   };
   ```

5. Replace EVERY emoji occurrence with the corresponding SVG wrapped in a `<span class="icon">`. Pages to specifically check:
   - To-Do page (Kanban board cards, column headers)
   - G2M page (category icons, status icons)
   - Artefacts page (templates section)
   - Dashboard (greeting, cards)
   - Sidebar navigation (verify these are already SVG — if so, use them as the reference)
   - Any headers, buttons, or labels that use emoji

6. After replacement, verify zero emoji remain:
   ```bash
   grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html
   ```
   This count should be 0.

---

## Fix 4: To-Do Page — Task Reuse from Existing Tasks

**Problem:** When adding a task on the To-Do page, there's no way to select from previously created tasks. Users want a searchable dropdown that shows all tasks across the app (To-Do, Plans, G2M) so they can reuse them.

**Approach:**
1. Find the To-Do task creation form:
   ```bash
   grep -n "addTodo\|addTask\|newTask\|createTask\|todo.*input\|task.*input" renderer/index.html | head -20
   ```

2. Implement a searchable task dropdown (autocomplete):
   - When the user focuses on the task description input, show a dropdown
   - The dropdown searches across ALL tasks in:
     - To-Do items (current list)
     - Plans tasks (WBS tasks from all plans)
     - G2M checklist items
     - Task Library (if it exists)
   - Aggregate these into a unified task list stored in the JSONB blob under a `taskLibrary` key
   - Show results filtered by the typed text (case-insensitive substring match)
   - Clicking a result populates the task description field
   - User can still type a custom task (the dropdown is optional, not forced)

3. UI for the searchable dropdown:
   ```html
   <div class="task-search-wrapper" style="position:relative;">
     <input type="text" id="todo-task-input" placeholder="Search or type a task..."
            oninput="filterTaskSuggestions(this.value)"
            onfocus="showTaskSuggestions()">
     <div id="task-suggestions" class="suggestions-dropdown" style="display:none;">
       <!-- Dynamically populated -->
     </div>
   </div>
   ```

4. CSS for the dropdown — MUST support dark mode:
   ```css
   .suggestions-dropdown {
     position: absolute; top: 100%; left: 0; right: 0;
     max-height: 200px; overflow-y: auto;
     border: 1px solid var(--border-color);
     border-radius: 8px;
     background: var(--card-bg);
     z-index: 1000;
     box-shadow: 0 4px 12px rgba(0,0,0,0.15);
   }
   .suggestions-dropdown .suggestion-item {
     padding: 8px 12px;
     cursor: pointer;
     color: var(--text-primary);
     font-size: 13px;
     border-bottom: 1px solid var(--border-color);
   }
   .suggestions-dropdown .suggestion-item:hover {
     background: var(--accent-color-light, rgba(59,130,246,0.1));
   }
   .suggestion-item .source-badge {
     font-size: 10px; opacity: 0.6; margin-left: 8px;
   }
   ```

5. Each suggestion should show: task name + source badge (e.g., "Plans", "G2M", "To-Do").

---

## Fix 5: To-Do Page — Full UI Overhaul

**Problem:** The To-Do page uses an outdated UI with AI emojis, non-rounded elements, and doesn't match the clean, polished look of the main roadmap page.

**Approach:**
1. Study the roadmap page's UI patterns:
   ```bash
   grep -n "roadmap-page\|roadmap-container" renderer/index.html | head -10
   ```
   Note: card styles, border-radius values, shadows, spacing, color usage, typography.

2. Find the To-Do page:
   ```bash
   grep -n "todo-page\|todo-container\|kanban" renderer/index.html | head -20
   ```

3. Overhaul the To-Do page to match the roadmap's design language:
   - **Cards:** `border-radius: 12px`, subtle shadow (`box-shadow: 0 1px 3px rgba(0,0,0,0.08)`), clean borders
   - **Kanban columns:** Rounded headers, consistent padding (16-20px), no harsh borders
   - **Typography:** Match the roadmap's font sizes, weights, and line heights
   - **Spacing:** Consistent gap between cards (12px), column padding (16px)
   - **Colors:** Use the same CSS variables as the roadmap page
   - **Buttons:** Rounded (`border-radius: 8px`), proper padding, consistent hover states
   - **Status badges:** Rounded pills, muted colors, proper dark mode support
   - **Remove ALL emoji** (handled globally in Fix 3, but verify here)
   - **Icons:** Use the same SVG icon style as the sidebar

4. Ensure the Kanban board columns have equal width and proper responsive behavior.
5. Dark mode must be flawless — no white backgrounds, all text readable.

---

## Fix 6: Initiative Linking (Within Roadmap + Cross-User)

**Problem:** Users need to link initiatives to other initiatives — both within their own roadmap and to initiatives on shared roadmaps from team members. Links can be dependencies or regular references.

**Approach:**
1. Find the initiative/row data structure:
   ```bash
   grep -n "row\.\|initiative\.\|addRow\|createRow" renderer/index.html | grep -i "data\|object\|struct" | head -20
   ```

2. Extend the row data model to include a `links` array:
   ```javascript
   row.links = [
     {
       type: 'dependency',    // or 'reference'
       targetRowId: 'abc123',
       targetOwnerId: null,   // null = same roadmap, user_id = shared roadmap
       targetOwnerEmail: null, // for display
       targetRowName: '',     // cached name for display
       createdAt: new Date().toISOString()
     }
   ];
   ```

3. **UI — Link picker in the edit row modal:**
   - Add a "Linked Initiatives" section in the edit row popup/modal
   - Show existing links as pills/tags with remove buttons
   - "Add Link" button opens a picker:
     - Tab 1: "My Initiatives" — searchable list of all rows in the current roadmap
     - Tab 2: "Shared Roadmaps" — dropdown to select a shared roadmap, then searchable list of its rows
   - Link type selector: "Dependency" or "Reference"
   - Display linked initiatives with:
     - Initiative name
     - Source (own roadmap or "From: user@email.com")
     - Link type badge (Dependency / Reference)
     - Status of the linked initiative (color-coded)

4. **Loading shared roadmap data for linking:**
   - Use the existing `get-shared-roadmap` edge function to fetch shared roadmap rows
   - Cache shared roadmap data in memory while the link picker is open
   - Only roadmaps that have been shared WITH the current user appear as options

5. **Visual indicator on the roadmap:**
   - Show a small link icon (🔗 → SVG) on rows that have links
   - Tooltip on hover showing linked initiative names
   - In timeline view, optionally draw a dashed connector line between linked initiatives (if on the same roadmap)

6. **Dependency logic:**
   - Dependencies are informational at this stage (no blocking/scheduling enforcement)
   - Show a warning badge if a dependency's status is "Delayed" or "At Risk"

7. Store links in the JSONB blob as part of each row's data.

---

## Fix 7: Add Ability to Edit Sections

**Problem:** Sections currently only support add row, change color, and delete. Users need to edit the section name and other properties.

**Approach:**
1. Find section rendering:
   ```bash
   grep -n "section.*header\|sectionName\|section-title\|editSection\|renameSection" renderer/index.html | head -20
   ```

2. Find the existing section context menu (the one with "Add Row", "Change Color", "Delete"):
   ```bash
   grep -n "Add Row\|Change Color\|Delete.*Section\|section.*menu\|section.*option" renderer/index.html | head -20
   ```

3. Add an "Edit Section" option to the section context menu that opens a small modal or inline editor:
   - **Section Name:** editable text field (pre-populated with current name)
   - **Section Description:** optional textarea for a brief description
   - **Section Color:** color picker (reuse existing "Change Color" logic, but inline in the edit form)
   - **Section Owner:** dropdown to assign a team member
   - **Collapse/Expand default:** toggle for whether section starts collapsed
   - Save and Cancel buttons

4. Alternatively, make the section name directly editable on double-click (inline editing), similar to how cells work in spreadsheets. This is faster for simple renames.

5. Ensure the edit is saved to the JSONB blob and synced.

---

## Fix 8: Capacity IQ — Dashboard Loading Fix + Dark Mode Header

**Problem:** The Capacity IQ dashboard section is empty when opened. Also, the "Capacity Dashboard" header has a white background in dark mode, making the title unreadable.

**Approach:**
1. Find CapacityIQ dashboard rendering:
   ```bash
   grep -n "capacityiq\|capacity-iq\|CapacityIQ\|capacityDashboard\|renderCapacity" renderer/index.html | head -30
   ```

2. **Dashboard empty issue:**
   - Check if the dashboard requires data to be pre-loaded from the JSONB blob
   - Check if there's an initialization function that needs to run when the page is shown
   - The `showPage` function may not be calling the render function for CapacityIQ
   - Fix by ensuring the CapacityIQ page's render/init function is called when the page becomes visible
   - If the dashboard relies on data from other modules (teams, initiatives, sprints), ensure that data is being read correctly

3. **Dark mode header fix:**
   - Find the header element: `grep -n "Capacity Dashboard\|Capacity IQ" renderer/index.html`
   - Remove/override any hardcoded `background: white` or `background: #fff`
   - Apply: `background: var(--surface-bg); color: var(--text-primary);`
   - This should also be caught by the global Fix 1, but explicitly verify

---

## Fix 9: Capacity IQ Task Library — Bulk Upload Template + Cross-Module Population

**Problem:** The "Bulk Upload Excel" button only opens a file picker. It should: (1) offer a downloadable template first, (2) decode uploaded files pulling task name + hours. Additionally, tasks created in To-Do, G2M, and Plans should auto-populate the Task Library.

**Approach:**

### Part A: Excel Template Download
1. Find the bulk upload button:
   ```bash
   grep -n "bulk.*upload\|Bulk Upload\|uploadExcel.*task\|taskLibrary.*import" renderer/index.html | head -15
   ```

2. When "Bulk Upload Excel" is clicked, show a small modal:
   - "Download Template" button — generates and downloads an Excel template with columns:
     - Task Name (required)
     - Estimated Hours (required)
     - Category (optional)
     - Priority (optional: High/Medium/Low)
     - Description (optional)
     - Skills Required (optional)
   - "Upload Completed File" button — opens the file picker
   - Brief instructions text

3. For the template download, generate a simple `.csv` or use the existing Excel export pattern:
   ```javascript
   function downloadTaskTemplate() {
     const headers = ['Task Name', 'Estimated Hours', 'Category', 'Priority', 'Description', 'Skills Required'];
     const sampleRow = ['Example: API Design Review', '4', 'Engineering', 'High', 'Review API specifications', 'Backend Development'];
     // Generate CSV or XLS and trigger download
   }
   ```

4. For the upload parser:
   - Read the uploaded file using the existing Excel parsing library (SheetJS/xlsx)
   - Extract Task Name and Hours at minimum
   - Map other columns if present
   - Show a preview table before committing
   - Merge into the Task Library (avoid duplicates by task name match)

### Part B: Cross-Module Task Population
1. Find where tasks are created in:
   - To-Do: `grep -n "addTodo\|saveTodo\|createTodo" renderer/index.html | head -10`
   - G2M: `grep -n "addChecklist\|addG2M\|saveG2M\|createG2MItem" renderer/index.html | head -10`
   - Plans: `grep -n "addTask\|addPlanTask\|savePlanTask" renderer/index.html | head -10`

2. In each task creation function, add a call to `addToTaskLibrary(taskData)`:
   ```javascript
   function addToTaskLibrary(task) {
     if (!currentData.taskLibrary) currentData.taskLibrary = [];
     // Check for duplicates by name
     const exists = currentData.taskLibrary.find(t =>
       t.name.toLowerCase() === task.name.toLowerCase()
     );
     if (!exists) {
       currentData.taskLibrary.push({
         id: generateId(),
         name: task.name,
         hours: task.hours || null,
         category: task.category || task.source,
         source: task.source, // 'todo', 'g2m', 'plans'
         createdAt: new Date().toISOString()
       });
       saveData(); // trigger sync
     }
   }
   ```

3. Ensure the Task Library page reads from `currentData.taskLibrary` and displays all tasks with source badges.

---

## Fix 10: G2M Page — Hours Input Fix

**Problem:** The increment/decrement buttons on the hours field are so large they obscure the actual number. Users also want free-text input for hours.

**Approach:**
1. Find the hours input:
   ```bash
   grep -n "hours.*input\|input.*hours\|increment.*hour\|decrement.*hour" renderer/index.html | head -15
   ```

2. Fix the input:
   - Make it a standard `<input type="number">` or `<input type="text" inputmode="numeric">` with small, appropriately-sized +/- buttons
   - The +/- buttons should be 24×24px max, positioned neatly beside the input
   - The number should be clearly visible with enough padding
   - Allow free text entry (users can type "4.5", "8", etc.)
   - Validate on blur: must be a positive number, max reasonable value (e.g., 999)

3. CSS fix:
   ```css
   .hours-input-wrapper {
     display: flex; align-items: center; gap: 4px;
   }
   .hours-input-wrapper input {
     width: 60px; text-align: center;
     padding: 6px 8px; border-radius: 6px;
     border: 1px solid var(--border-color);
     background: var(--input-bg);
     color: var(--text-primary);
     font-size: 14px;
   }
   .hours-input-wrapper button {
     width: 28px; height: 28px;
     border-radius: 6px; border: 1px solid var(--border-color);
     background: var(--surface-bg);
     color: var(--text-primary);
     cursor: pointer; font-size: 14px;
     display: flex; align-items: center; justify-content: center;
   }
   ```

---

## Fix 11: Plans/Gantt — Dark Mode Comprehensive Fix

**Problem:** On the Gantt chart view, task rows alternate between white and dark backgrounds. Dark text on dark background is unreadable. The page title "Go-To-Market" has a white background. The area above "Link Roadmap now" is white.

**Approach:**
1. Find Plans/Gantt page styling:
   ```bash
   grep -n "gantt\|plan-page\|plans-page\|task-row\|plan-row" renderer/index.html | grep -i "style\|class\|css" | head -20
   ```

2. Fix alternating row colors in dark mode:
   ```css
   .dark-mode .task-row:nth-child(odd) {
     background: var(--surface-bg);
   }
   .dark-mode .task-row:nth-child(even) {
     background: var(--card-bg);
   }
   .dark-mode .task-row,
   .dark-mode .task-row * {
     color: var(--text-primary);
   }
   ```

3. Fix ALL headers/title bars on this page to use dark backgrounds in dark mode.

4. After fixing, visually scan all elements on the Plans page for any remaining contrast issues.

---

## Fix 12: User Profile Avatar Circle (Top Right)

**Problem:** The username display in the top right should be a circle avatar. If the user has a profile picture, show it there.

**Approach:**
1. Find the top-right user area:
   ```bash
   grep -n "user-profile\|user-name\|username.*top\|header.*user\|avatar\|profile-pic" renderer/index.html | head -20
   ```

2. Replace the text-only username with a circular avatar:
   ```html
   <div class="user-avatar-circle" onclick="toggleProfileMenu()">
     <img id="user-avatar-img" src="" alt="" style="display:none;">
     <span id="user-avatar-initials">VS</span>
   </div>
   ```

3. CSS:
   ```css
   .user-avatar-circle {
     width: 36px; height: 36px;
     border-radius: 50%;
     background: var(--accent-color, #3b82f6);
     display: flex; align-items: center; justify-content: center;
     cursor: pointer; overflow: hidden;
     color: white; font-size: 14px; font-weight: 600;
   }
   .user-avatar-circle img {
     width: 100%; height: 100%; object-fit: cover;
   }
   ```

4. Logic:
   - On load, check if the user has a `profilePicture` in their data
   - If yes: show the `<img>`, hide initials
   - If no: generate initials from the user's name/email, show them
   - Add a "Change Profile Picture" option in the profile/settings page that uploads to Supabase Storage (or stores a base64 thumbnail)

5. Move the dropdown menu (if any) to trigger from the avatar circle click.

---

## Fix 13: Move Help Button into User Profile Page

**Problem:** There's a help button next to the user profile in the top right. Move it inside the user profile page instead.

**Approach:**
1. Find the help button:
   ```bash
   grep -n "help.*button\|help-btn\|helpButton\|Help\b" renderer/index.html | grep -i "header\|top\|nav" | head -10
   ```

2. Remove it from the top-right header area.

3. Add a "Help & Support" section inside the user profile/settings page:
   - Link to documentation/user guide
   - Link to feedback/support email
   - App version number
   - Keyboard shortcuts reference (if any)

4. Ensure the top-right area is cleaner after removal — only the avatar circle and maybe a notification bell.

---

## Fix 14: Artefacts Page — Fix Theme Colors + Add Document Repository

**Problem:** The "New Artefact" and "Brand Guide" buttons use green and pink, which don't match the app theme. Also need a full document repository feature.

### Part A: Fix Button Colors
1. Find the artefact page buttons:
   ```bash
   grep -n "New Artefact\|Brand Guide\|artefact.*btn\|artifact.*btn" renderer/index.html | head -10
   ```

2. Replace the green/pink colors with the app's theme colors:
   - Primary action (New Artefact): use the app's primary accent color (likely a blue or the main brand color)
   - Secondary action (Brand Guide): use the secondary/muted variant
   - Check the sidebar nav for color references to stay consistent

### Part B: Document Repository
1. Add a new section on the Artefacts page: "Document Repository"

2. **Data model** — add to JSONB blob:
   ```javascript
   currentData.documentRepository = {
     folders: [
       { id: 'f1', name: 'Product Specs', color: '#3b82f6', createdAt: '...' }
     ],
     documents: [
       {
         id: 'd1',
         name: 'PRD - Feature X',
         folderId: 'f1',          // null = unfiled
         tags: ['prd', 'phase-2'],
         linkedInitiatives: ['row-id-1', 'row-id-2'],  // links to roadmap rows
         linkedPlans: ['plan-id-1'],                    // links to plans
         fileType: 'pdf',         // detected from upload
         fileSize: 245000,        // bytes
         storagePath: '{uid}/docs/timestamp_filename.pdf',
         uploadedAt: '...',
         updatedAt: '...',
         description: 'Optional description'
       }
     ]
   };
   ```

3. **UI — Document Repository:**
   - **Folder sidebar**: List of folders with create/rename/delete. "All Documents" view at top. Folder colors (small dot).
   - **Document grid/list view**: Toggle between grid (cards with file type icon, name, tags) and list (table with columns).
   - **Upload**: Drag-and-drop zone + "Upload Document" button. Files stored in Supabase Storage under `{user_id}/docs/`.
   - **Tags**: Tag input with autocomplete. Click a tag to filter.
   - **Link to Initiative**: Dropdown to select one or more roadmap initiatives. Shows initiative name + status badge.
   - **Link to Plan**: Dropdown to select a plan.
   - **Search**: Full-text search across document names, tags, descriptions.
   - **Download**: Download button on each document.
   - **Preview**: For PDFs and images, show a preview modal (use existing PDF/image handling).
   - **Bulk actions**: Select multiple → move to folder, add tags, delete.

4. **Bidirectional linking to Initiatives:**
   - When viewing an initiative (edit row modal), add a "Documents" tab/section that lists all documents linked to that initiative
   - Add an "Attach Document" button that opens the document repository picker
   - When a document is linked/unlinked from the initiative side, update `documentRepository.documents[x].linkedInitiatives`
   - When a document is linked/unlinked from the document side, it should also reflect in the initiative view

5. **File type icons**: SVG icons for common types (PDF, DOCX, XLSX, PPTX, PNG, JPG, generic). Use clean line-art style matching the rest of the app.

6. **Dark mode**: All document repository UI must fully support dark mode from the start.

---

## Fix 15: G2M Page — AI Emoji Removal + Insights Header Dark Mode

**Problem:** G2M page uses AI emojis. The "Insights" section has a white background with light grey text in dark mode.

**Approach:**
1. This is partially covered by Fix 3 (global emoji replacement) and Fix 1 (global dark mode), but explicitly verify:
   ```bash
   grep -n "insights\|Insights" renderer/index.html | head -10
   ```
2. Replace all G2M emojis with SVG icons.
3. Fix the Insights header: dark background + light text in dark mode.
4. Verify every element on the G2M page has proper dark mode support.

---

## Fix 16: Artefacts Templates — AI Emoji Removal

**Problem:** The templates section on the Artefacts page uses AI emojis.

**Approach:**
1. Covered by Fix 3 (global emoji replacement), but explicitly verify:
   ```bash
   grep -n "template.*artefact\|artefact.*template\|artifact.*template" renderer/index.html | head -10
   ```
2. Ensure all template icons use clean SVG icons.
3. Verify dark mode support on the templates section.

---

## Post-Fix Checklist (run after all fixes)

1. **Dark mode full sweep:**
   ```bash
   # Count remaining hardcoded whites that lack dark mode overrides
   grep -c "background.*white\|background.*#fff\|background.*#ffffff" renderer/index.html
   ```
   Manually verify each remaining instance has a `.dark-mode` override.

2. **Emoji full sweep:**
   ```bash
   grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html
   ```
   Must be 0.

3. **Verify all new pages/features support dark mode** — toggle dark mode on/off and check every new element.

4. **Verify all dropdowns** — open each dropdown in dark mode and confirm text is readable.

5. **Verify all navigation** — click every nav button and confirm it routes correctly.

6. **Syntax check:**
   ```bash
   node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"
   ```

7. **Update FIX_LOG_V2.md** with a summary of all changes.

8. **Bump version** to next appropriate version in `package.json`.

9. **Rebuild web:** `cd web && npm run build`

10. **Commit:** `git add -A && git commit -m "vX.Y.Z: 16 fixes — dark mode overhaul, emoji→SVG, task library, document repo, initiative linking, UI alignment"`

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V2.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix:** Re-read your changes, check for syntax errors, verify logic.
4. **Test after each fix:** Use `grep`, `node -c`, and structural verification.
5. **If a fix is blocked** (e.g., needs Supabase Storage setup), implement the frontend, add a `// TODO: requires backend` comment, log it, move on.
6. **Preserve existing patterns.** Match the codebase's style exactly.
7. **Dark mode EVERYTHING.** No exceptions. Every new element gets dark mode support.
8. **Keep the single-file SPA pattern.** All UI changes go into `renderer/index.html`.
9. **SVG icons only.** Zero emoji in any new code. Replace any emoji you encounter while working.
10. **When in doubt about UI styling, reference the main roadmap page** — that's the gold standard for what the app should look like.
