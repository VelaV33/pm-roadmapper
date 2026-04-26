# Roadmap OS — Autonomous Fix Queue v5

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V5.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/`
- Data stored as one JSONB blob per user in `roadmap_data` table
- Navigation: `showPage('pageId')` pattern — should push `history.pushState` for browser back support (may have been added in v4)
- Dark mode: CSS variables + class toggle
- ZERO emoji policy — SVG icons only (stroke-based, `currentColor`, matching sidebar style)
- All new elements MUST support both light and dark mode with proper contrast
- Template data lives in `currentData.templateLibrary` — shared source for ALL modules
- Task Library lives in `currentData.taskLibrary` — central task registry

**Before starting:**
1. `grep -n "templateLibrary\|template-library\|templateType\|templateCategory\|generic\|organisational\|organization\|platform.*template\|custom.*template" renderer/index.html | head -30`
2. `grep -n "toolbar\|page-header\|plan-toolbar\|plan.*header\|divider.*title\|header-bar" renderer/index.html | head -30`
3. `grep -n "browseTemplate\|Browse Template\|browse-template\|g2m.*template\|checklist.*template" renderer/index.html | head -20`
4. `grep -n "competitive.*analysis\|research.*area\|researchArea" renderer/index.html | head -20`
5. `grep -n "showPage\|activeTab\|active.*tab\|nav.*active\|current.*page\|highlightNav\|setActiveNav" renderer/index.html | head -30`
6. `grep -n "feedback.*page\|feedback.*inbox\|feedbackLink\|share.*feedback\|feedback.*submit" renderer/index.html | head -20`
7. `grep -n "top.10.*prior\|top10\|topPriorities\|top-priorities" renderer/index.html | head -15`
8. Log all findings in `FIX_LOG_V5.md`

---

## Fix 1: Template Categorization — Generic vs Organisational

**Problem:** There's no distinction between pre-loaded platform templates and user/organisation-customised templates. Need a clear split so users know which are built-in and which are custom.

**Approach:**
1. Find the template data model:
   ```bash
   grep -n "templateLibrary\|getDefaultTemplates\|platformTemplate\|builtInTemplate" renderer/index.html | head -20
   ```

2. **Extend the template data model with a `type` field:**
   ```javascript
   template = {
     id: 'template-id',
     name: 'GoToMarket Product Launch',
     type: 'platform',        // 'platform' = built-in, 'organisation' = user-created/customised
     description: '...',
     category: 'Product Launch',
     tasks: [...],
     createdBy: null,          // null for platform, user_id for organisation
     createdAt: '...',
     taskCount: 42,
     isCustomised: false,      // true if user modified a platform template
     sourceTemplateId: null,   // if customised from a platform template, stores original ID
   };
   ```

3. **Ensure all existing default/built-in templates have `type: 'platform'`:**
   ```javascript
   function getDefaultTemplates() {
     return [
       { id: 'tmpl-gtm', name: 'GoToMarket Product Launch', type: 'platform', ... },
       { id: 'tmpl-agile', name: 'Agile Sprint Cycle', type: 'platform', ... },
       // ... all built-in templates
     ].map(t => ({ ...t, type: 'platform' })); // enforce type
   }
   ```

4. **When users create or customise a template, set `type: 'organisation'`:**
   ```javascript
   function saveCustomTemplate(templateData) {
     const template = {
       ...templateData,
       id: generateId(),
       type: 'organisation',
       createdBy: getCurrentUserId(),
       createdAt: new Date().toISOString(),
     };
     if (!currentData.templateLibrary) currentData.templateLibrary = [];
     currentData.templateLibrary.push(template);
     saveData();
   }
   ```

5. **Update the Templates page UI to show the distinction:**
   ```html
   <!-- Tab bar or section headers -->
   <div class="template-tabs">
     <button class="template-tab active" onclick="filterTemplates('all')">
       All Templates
     </button>
     <button class="template-tab" onclick="filterTemplates('platform')">
       Platform Templates
     </button>
     <button class="template-tab" onclick="filterTemplates('organisation')">
       My Organisation
     </button>
   </div>
   ```

6. **Visual distinction on template cards:**
   - Platform templates: subtle badge or label saying "Platform" with a muted icon
   - Organisation templates: badge saying "Custom" or "My Organisation" with a different accent color
   - If a template was customised from a platform template, show "Customised from: [original name]"

7. **Apply this categorization EVERYWHERE templates are shown:**
   - Main Templates page (left nav)
   - Capacity IQ templates
   - Plans template picker
   - To-Do template picker
   - Checklist/G2M template picker
   - Template Builder modal

8. **Filtering logic:**
   ```javascript
   function filterTemplates(type) {
     const allTemplates = getAllTemplates();
     if (type === 'all') return allTemplates;
     return allTemplates.filter(t => t.type === type);
   }
   ```

---

## Fix 2: Global Toolbar/Header Button Centering — Definitive Fix

**Problem:** Across multiple pages (Plans, Templates, and others), the buttons in the page header toolbar (Add Task, Save Template, Upload Excel, Colours, Create Template, Upload Template, etc.) are sitting too high. They appear slightly cut off at the top. This has been reported multiple times — it needs a PERMANENT global fix.

**Approach:**
1. Find ALL toolbar/header bars across all pages:
   ```bash
   grep -n "toolbar\|page-header\|header-bar\|header-row\|title-bar\|action-bar\|plan-toolbar\|page-title.*button\|divider.*button" renderer/index.html | head -50
   ```

2. **Identify the root cause.** Common issues:
   - No `align-items: center` on the flex container
   - Hardcoded `margin-top` or `padding-top` pushing buttons up
   - The container has insufficient `min-height` or `padding`
   - The title text and buttons are in different flex containers with different alignment
   - `overflow: hidden` on the container clipping the top of buttons

3. **Apply a GLOBAL fix.** Create a reusable CSS class that every page toolbar uses:
   ```css
   /* ============================================
      GLOBAL TOOLBAR/HEADER BAR — DEFINITIVE FIX
      Apply .page-toolbar to every page's header bar.
      ============================================ */
   .page-toolbar {
     display: flex;
     align-items: center;          /* VERTICAL CENTER — the key fix */
     justify-content: space-between;
     min-height: 56px;             /* enough room for buttons */
     padding: 8px 20px;            /* breathing room top and bottom */
     gap: 10px;
     flex-wrap: wrap;              /* handles overflow on narrow screens */
     box-sizing: border-box;
   }

   .page-toolbar .toolbar-title {
     font-size: 16px;
     font-weight: 600;
     color: var(--text-primary);
     white-space: nowrap;
     margin: 0;
     padding: 0;
     line-height: 1;              /* prevent line-height from adding top space */
   }

   .page-toolbar .toolbar-actions {
     display: flex;
     align-items: center;
     gap: 8px;
     flex-wrap: wrap;
   }

   .page-toolbar button,
   .page-toolbar input,
   .page-toolbar select {
     margin: 0;                   /* kill any rogue margins */
     vertical-align: middle;
     padding: 8px 14px;           /* consistent button padding */
     border-radius: 8px;
     font-size: 13px;
     line-height: 1;
     box-sizing: border-box;
   }
   ```

4. **Search and replace:** Find every page header that has this issue and apply the `.page-toolbar` class:
   ```bash
   grep -n "class=.*toolbar\|class=.*header-bar\|class=.*title-bar\|class=.*action-bar" renderer/index.html | head -30
   ```
   If pages use different class names, either rename them to `.page-toolbar` or add `.page-toolbar` as an additional class.

5. **Remove any inline styles** that conflict:
   ```bash
   grep -n "style=.*margin-top.*toolbar\|style=.*padding-top.*toolbar\|style=.*margin-top.*header" renderer/index.html | head -10
   ```

6. **Verify on EVERY page that has a toolbar:**
   - Plans page ✓
   - Templates page ✓
   - Capacity IQ ✓
   - Roadmap page ✓
   - Checklist/G2M ✓
   - Artefacts ✓
   - Prioritisation ✓
   - To-Do ✓
   - Feedback ✓
   - User Management ✓
   - Any other page with a header bar ✓

7. **After applying, manually verify** that buttons are perfectly centered and not cut off at the top on ANY page.

---

## Fix 3: Platform Template Navigation — Customise, Pull Tasks, Save as Template

**Problem:** On the templates page within the planning module, clicking a platform template shows its tasks but you can't:
- Add your own custom tasks to it
- Pull tasks from the task library into it
- Save it as a custom template with a new name
- Then import that into a project plan

**Approach:**
1. Find the template detail/preview view:
   ```bash
   grep -n "templateDetail\|template-detail\|templatePreview\|viewTemplate\|openTemplate\|showTemplate" renderer/index.html | head -20
   ```

2. **Redesign the template detail view as an interactive editor:**

   When a user clicks on a platform template, show an **editable view**, not just a read-only list:

   ```
   ┌──────────────────────────────────────────────────────────┐
   │  GoToMarket Product Launch         [Platform Template]   │
   │  ─────────────────────────────────────────────────────   │
   │                                                          │
   │  Tasks (42)                    [+ Add Custom Task]       │
   │                                [+ Pull from Task Library]│
   │  ┌────────────────────────────────────────────────────┐  │
   │  │ ☑ Define target market segments        4h   High  │  │
   │  │ ☑ Conduct competitive analysis         8h   High  │  │
   │  │ ☑ Create positioning document          6h   Med   │  │
   │  │ ☐ Set pricing strategy                 4h   Med   │  │
   │  │ ☑ Draft press release                  3h   Low   │  │
   │  │   ↕ (drag to reorder)                             │  │
   │  │ ──────────────── Custom Tasks ──────────────────   │  │
   │  │ ☑ My custom task from task library     2h   High  │  │
   │  │ ☑ Another custom task I typed in       1h   Med   │  │
   │  └────────────────────────────────────────────────────┘  │
   │                                                          │
   │  ┌─────────────────────────────────────────────────────┐ │
   │  │ Save as Organisation Template                       │ │
   │  │ Template Name: [My Custom Launch Plan         ]     │ │
   │  │                                                     │ │
   │  │ [Save Template]   [Import into Current Plan]        │ │
   │  └─────────────────────────────────────────────────────┘ │
   └──────────────────────────────────────────────────────────┘
   ```

3. **Functionality:**

   **a) Checkbox selection:** Every task has a checkbox. Checked = included, unchecked = excluded. Default: all checked for platform templates.

   **b) "+ Add Custom Task" button:**
   - Opens an inline form at the bottom of the task list
   - Fields: Task Name, Hours, Priority (dropdown)
   - Adds the task to the current template view
   - These custom tasks are marked with a visual indicator ("Custom" badge)

   **c) "+ Pull from Task Library" button:**
   - Opens a searchable dropdown/modal showing all tasks from `currentData.taskLibrary`
   - User can search by name, filter by category
   - Checking a task adds it to the current template view
   - Multiple selection supported

   **d) "Save as Organisation Template" section:**
   - Template name input (required)
   - "Save Template" button:
     - Creates a new template in `currentData.templateLibrary` with `type: 'organisation'`
     - Only includes checked tasks (plus any custom tasks added)
     - Sets `sourceTemplateId` to the platform template's ID
     - Shows success toast

   **e) "Import into Current Plan" button:**
   - Takes all checked tasks and imports them into the active plan
   - Each task gets a new ID
   - Closes the template view and shows the plan with imported tasks

4. **Implementation:**
   ```javascript
   function openTemplateEditor(templateId) {
     const templates = getAllTemplates();
     const template = templates.find(t => t.id === templateId);
     if (!template) return;

     // Create a working copy of the template tasks
     const workingTasks = template.tasks.map(t => ({
       ...t,
       checked: true,       // default all checked
       isCustom: false,
     }));

     // Render the editor
     renderTemplateEditor(template, workingTasks);
   }

   function addCustomTaskToEditor() {
     const name = document.getElementById('custom-task-name').value.trim();
     const hours = parseFloat(document.getElementById('custom-task-hours').value) || 0;
     const priority = document.getElementById('custom-task-priority').value || 'Medium';

     if (!name) {
       showToast('Enter a task name', 'warning');
       return;
     }

     editorWorkingTasks.push({
       id: generateId(),
       name: name,
       hours: hours,
       priority: priority,
       checked: true,
       isCustom: true,
       source: 'custom',
     });

     renderEditorTaskList();
     // Clear the input
     document.getElementById('custom-task-name').value = '';
     document.getElementById('custom-task-hours').value = '';
   }

   function pullFromTaskLibrary() {
     // Open task library picker modal
     const tasks = currentData.taskLibrary || [];
     showTaskLibraryPicker(tasks, (selectedTasks) => {
       selectedTasks.forEach(task => {
         editorWorkingTasks.push({
           ...task,
           id: generateId(),
           checked: true,
           isCustom: true,
           source: 'task-library',
         });
       });
       renderEditorTaskList();
     });
   }

   function saveEditorAsTemplate() {
     const name = document.getElementById('editor-template-name').value.trim();
     if (!name) {
       showToast('Enter a template name', 'warning');
       return;
     }

     const checkedTasks = editorWorkingTasks.filter(t => t.checked);
     if (checkedTasks.length === 0) {
       showToast('Select at least one task', 'warning');
       return;
     }

     const newTemplate = {
       id: generateId(),
       name: name,
       type: 'organisation',
       tasks: checkedTasks.map(t => ({
         id: generateId(),
         name: t.name,
         hours: t.hours,
         priority: t.priority,
         description: t.description || '',
         phase: t.phase || '',
       })),
       taskCount: checkedTasks.length,
       sourceTemplateId: currentEditorTemplateId,
       createdBy: getCurrentUserId(),
       createdAt: new Date().toISOString(),
     };

     if (!currentData.templateLibrary) currentData.templateLibrary = [];
     currentData.templateLibrary.push(newTemplate);
     saveData();

     showToast(`Template "${name}" saved with ${checkedTasks.length} tasks`, 'success');
   }

   function importEditorIntoPlan() {
     const checkedTasks = editorWorkingTasks.filter(t => t.checked);
     if (checkedTasks.length === 0) {
       showToast('Select at least one task', 'warning');
       return;
     }

     // Import into the current active plan
     const plan = getCurrentPlan();
     checkedTasks.forEach(task => {
       plan.tasks.push({
         id: generateId(),
         name: task.name,
         hours: task.hours,
         priority: task.priority,
         description: task.description || '',
         status: 'Not Started',
         importedFrom: currentEditorTemplateName,
         addedAt: new Date().toISOString(),
       });
     });

     saveData();
     closeTemplateEditor();
     renderPlan();
     showToast(`${checkedTasks.length} tasks imported into plan`, 'success');
   }
   ```

---

## Fix 4: Create Template — Enhanced with Task Library Integration

**Problem:** The "Create Template" form on the template library only lets you manually add tasks one by one. No ability to select from the task library or pull from existing templates.

**Approach:**
1. Find the create template form:
   ```bash
   grep -n "createTemplate\|create-template\|newTemplate\|Create Template" renderer/index.html | head -20
   ```

2. **Enhance the create template flow:**

   The form should have:
   ```
   ┌────────────────────────────────────────────────────────┐
   │  Create Template                                       │
   │  ──────────────────────────────────────────────────    │
   │                                                        │
   │  Template Name:  [_________________________________]   │
   │  Description:    [_________________________________]   │
   │  Category:       [Product Launch         ▼]            │
   │                                                        │
   │  ── Add Tasks ─────────────────────────────────────    │
   │                                                        │
   │  [+ Add Task Manually]                                 │
   │  [+ Pull from Task Library]                            │
   │  [+ Import from Existing Template]                     │
   │                                                        │
   │  ── Tasks (5) ─────────────────────────────────────    │
   │  │ API Design Review              4h   Engineering │   │
   │  │ Frontend Component Build       8h   Engineering │   │
   │  │ QA Test Plan                   3h   QA          │   │
   │  │ Security Review                4h   Security    │   │
   │  │ Launch Checklist               2h   Product     │   │
   │  │                                                 │   │
   │  │         (drag to reorder, click to edit)        │   │
   │                                                        │
   │  [Cancel]                          [Save Template]     │
   └────────────────────────────────────────────────────────┘
   ```

3. **Three ways to add tasks:**

   **a) "+ Add Task Manually":** Inline form — task name, hours, priority. Same as before but within the flow.

   **b) "+ Pull from Task Library":**
   - Opens a searchable task library picker
   - Shows all tasks from `currentData.taskLibrary` with search + category filter
   - Multi-select with checkboxes
   - "Add Selected" button pulls them into the template task list

   **c) "+ Import from Existing Template":**
   - Opens a template picker showing all templates (platform + organisation)
   - When a template is selected, shows its tasks with checkboxes
   - User checks the ones they want → "Add Selected" pulls them in
   - This is effectively using an existing template as a starting point

4. **The task list in the form should be interactive:**
   - Click a task to edit it inline (name, hours, priority)
   - Drag to reorder (or up/down buttons if drag is complex)
   - Delete button per task
   - Task count shown in the header

5. **Remove the "Icon" field** from the create template form — user asked to remove icon selection functionality.

6. **Save logic:**
   ```javascript
   function saveNewTemplate() {
     const name = document.getElementById('new-tmpl-name').value.trim();
     if (!name) { showToast('Enter a template name', 'warning'); return; }
     if (createTemplateTasks.length === 0) { showToast('Add at least one task', 'warning'); return; }

     const template = {
       id: generateId(),
       name: name,
       type: 'organisation',
       description: document.getElementById('new-tmpl-description').value.trim(),
       category: document.getElementById('new-tmpl-category').value,
       tasks: createTemplateTasks.map(t => ({
         id: generateId(),
         name: t.name,
         hours: t.hours || 0,
         priority: t.priority || 'Medium',
         description: t.description || '',
       })),
       taskCount: createTemplateTasks.length,
       createdBy: getCurrentUserId(),
       createdAt: new Date().toISOString(),
     };

     if (!currentData.templateLibrary) currentData.templateLibrary = [];
     currentData.templateLibrary.push(template);
     saveData();

     closeCreateTemplate();
     renderTemplates();
     showToast(`Template "${name}" created with ${template.taskCount} tasks`, 'success');
   }
   ```

---

## Fix 5: Browse Templates on Checklist/G2M — Non-Responsive Button

**Problem:** The "Browse Templates" button on the Go-to-Market/Checklist page does nothing when clicked. It should open the template library and let users pull templates into their checklist.

**Approach:**
1. Find the button:
   ```bash
   grep -n "browseTemplate\|Browse Template\|browse-template\|g2m.*browse\|checklist.*browse" renderer/index.html | head -15
   ```

2. **Wire up the button** to open the template library picker:
   ```javascript
   function browseChecklistTemplates() {
     const templates = getAllTemplates();

     // Open a template picker modal
     openTemplatePickerModal(templates, 'checklist', (selectedTemplate) => {
       // Import the template's tasks into the checklist
       importTemplateIntoChecklist(selectedTemplate);
     });
   }
   ```

3. **Template picker modal** (reuse the Template Builder pattern from v4 if available, or create a simpler version):
   - List all templates (platform + organisation) with their task counts
   - Click a template to see its tasks with checkboxes
   - "Import Selected" pulls checked tasks into the checklist
   - "Import All" imports all tasks from the template

4. **Import into checklist logic:**
   ```javascript
   function importTemplateIntoChecklist(template) {
     if (!template.tasks || template.tasks.length === 0) return;

     const checklist = getCurrentChecklist(); // however the G2M data is accessed

     template.tasks.forEach(task => {
       checklist.push({
         id: generateId(),
         title: task.name,
         status: 'Not Started',
         owner: '',
         hours: task.hours || 0,
         category: task.phase || task.category || 'Imported',
         importedFrom: template.name,
         addedAt: new Date().toISOString(),
       });
     });

     saveData();
     renderChecklist();
     showToast(`${template.tasks.length} tasks imported from "${template.name}"`, 'success');
   }
   ```

5. **Key principle:** The template library is CENTRAL. Anywhere the user sees "Templates" or "Browse Templates," it MUST pull from the same `getAllTemplates()` source — platform templates + organisation templates + task library integration.

---

## Fix 6: Competitive Analysis — Remove Last Emoji + Per-User Research Areas

**Problem:** One emoji remains on the competitive analysis page ("job scheduling and despatch"). Also, the pre-configured research areas are currently visible to ALL users — they should only be configured for the current user's profile. New users should see no pre-set research areas and be able to create their own.

### Part A: Remove Remaining Emoji
1. Find it:
   ```bash
   grep -n "job scheduling\|despatch\|dispatch" renderer/index.html | head -10
   ```
2. Find the emoji near it and replace with an SVG icon or remove entirely.
3. **Then do a FULL emoji sweep** to catch any others that might have been missed:
   ```bash
   grep -Pn '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' renderer/index.html
   ```
   Replace every single one found. Zero tolerance.

### Part B: Per-User Research Areas
1. Find where research areas are defined/stored:
   ```bash
   grep -n "researchArea\|research_area\|research.*area\|defaultResearch\|competitiveResearch" renderer/index.html | head -20
   ```

2. **Current problem:** Research areas are likely hardcoded in the renderer as defaults that everyone sees. They should be:
   - **Stored per-user** in `currentData.competitiveAnalysis.researchAreas` (part of the JSONB blob)
   - **Empty by default** for new users
   - **Only populated for the current user** if they've previously configured them

3. **Fix:**
   ```javascript
   function getResearchAreas() {
     // Return user's own research areas — NOT hardcoded defaults
     return currentData?.competitiveAnalysis?.researchAreas || [];
   }

   function addResearchArea(area) {
     if (!currentData.competitiveAnalysis) currentData.competitiveAnalysis = {};
     if (!currentData.competitiveAnalysis.researchAreas) {
       currentData.competitiveAnalysis.researchAreas = [];
     }

     currentData.competitiveAnalysis.researchAreas.push({
       id: generateId(),
       name: area.name,
       description: area.description || '',
       createdAt: new Date().toISOString(),
     });

     saveData();
   }

   function removeResearchArea(areaId) {
     if (!currentData.competitiveAnalysis?.researchAreas) return;
     currentData.competitiveAnalysis.researchAreas =
       currentData.competitiveAnalysis.researchAreas.filter(a => a.id !== areaId);
     saveData();
   }
   ```

4. **Remove the hardcoded default research areas** from the renderer. Replace with:
   ```javascript
   // When rendering the competitive analysis page
   function renderResearchAreas() {
     const areas = getResearchAreas();
     const container = document.getElementById('research-areas-container');

     if (areas.length === 0) {
       container.innerHTML = `
         <div class="empty-state">
           <p>No research areas configured yet.</p>
           <p>Add research areas to focus your competitive analysis.</p>
           <button onclick="showAddResearchArea()" class="btn-primary">
             Add Research Area
           </button>
         </div>
       `;
       return;
     }

     // Render each area with edit/delete controls
     container.innerHTML = areas.map(area => `
       <div class="research-area-card" data-id="${area.id}">
         <span class="area-name">${area.name}</span>
         <div class="area-actions">
           <button onclick="editResearchArea('${area.id}')" class="btn-sm">Edit</button>
           <button onclick="removeResearchArea('${area.id}')" class="btn-sm btn-danger">Remove</button>
         </div>
       </div>
     `).join('');
   }
   ```

5. **The user's existing research areas** (the ones currently hardcoded) should be migrated: on first load, if the current user's data has no `competitiveAnalysis.researchAreas` but the hardcoded list exists, copy them into the user's data ONCE. For any other user, they start with an empty list.

   ```javascript
   // Migration — run once on app load
   function migrateResearchAreas() {
     const currentUserEmail = getCurrentUserEmail();

     // Only migrate for the original user who had these configured
     // For everyone else, they start fresh
     if (currentUserEmail === 'velasabelo@gmail.com' || currentUserEmail === 'your-actual-email') {
       if (!currentData.competitiveAnalysis?.researchAreas) {
         // Move the hardcoded areas into user data
         currentData.competitiveAnalysis = currentData.competitiveAnalysis || {};
         currentData.competitiveAnalysis.researchAreas = LEGACY_HARDCODED_AREAS.map(area => ({
           id: generateId(),
           name: area,
           createdAt: new Date().toISOString(),
         }));
         saveData();
       }
     }
   }
   ```
   After migration, DELETE the hardcoded research areas array from the code entirely.

---

## Fix 7: Navigation State — Wrong Tab Highlighted + Browser Back Button

**Problem:** Two related navigation bugs:
1. When switching pages (e.g., To-Do → Roadmap), the top nav shows the PREVIOUS page tab as highlighted instead of the current one.
2. The browser back button takes you completely out of the app instead of to the previous page.

### Part A: Fix Tab Highlight
1. Find the nav highlight logic:
   ```bash
   grep -n "activeTab\|active.*tab\|nav.*active\|setActive\|highlightNav\|currentTab\|selectedTab\|nav.*highlight\|tab.*selected" renderer/index.html | head -30
   ```

2. **The issue:** The `showPage()` function switches the page content but doesn't update the active state on the navigation tabs/buttons.

3. **Fix:** In `showPage()`, after showing the page, update the nav highlight:
   ```javascript
   function showPage(pageId, options) {
     // ... existing page switching logic (hide all pages, show target) ...

     // UPDATE NAV STATE — this is the fix
     updateNavHighlight(pageId);

     // ... history.pushState if applicable ...
   }

   function updateNavHighlight(pageId) {
     // Remove active class from ALL nav items (sidebar + top nav)
     document.querySelectorAll('.nav-item, .nav-link, .nav-btn, .top-nav-item, [data-page]')
       .forEach(el => {
         el.classList.remove('active', 'selected', 'current');
         el.removeAttribute('aria-current');
       });

     // Add active class to the matching nav item
     // Try multiple selectors to find the right one
     const selectors = [
       `[data-page="${pageId}"]`,
       `[onclick*="showPage('${pageId}')"]`,
       `[onclick*='showPage("${pageId}")']`,
       `.nav-item[data-id="${pageId}"]`,
       `#nav-${pageId}`,
     ];

     for (const selector of selectors) {
       const navItem = document.querySelector(selector);
       if (navItem) {
         navItem.classList.add('active');
         navItem.setAttribute('aria-current', 'page');
         break;
       }
     }
   }
   ```

4. **Verify:** The nav items must have a `data-page` attribute or an `onclick` that includes the page ID. If they don't, add `data-page="pageId"` to each nav button/link for reliable targeting.

### Part B: Fix Browser Back Button
1. Check if the `history.pushState` fix from v4 Fix 8 has been implemented:
   ```bash
   grep -n "pushState\|popstate\|replaceState\|history\.push\|onpopstate" renderer/index.html | head -15
   ```

2. **If NOT implemented yet, implement it now:**
   ```javascript
   // In showPage() — push state on every page change
   function showPage(pageId, options) {
     // ... existing page switching logic ...
     updateNavHighlight(pageId);

     // Push browser history state (unless we're handling a back/forward event)
     if (!_isPopstateNavigation) {
       history.pushState({ page: pageId }, '', '#' + pageId);
     }
     _isPopstateNavigation = false;
   }

   // Handle browser back/forward
   let _isPopstateNavigation = false;
   window.addEventListener('popstate', function(event) {
     if (event.state && event.state.page) {
       _isPopstateNavigation = true;
       showPage(event.state.page);
     } else {
       // No state — check if authenticated
       const isAuth = /* however auth is checked */;
       if (isAuth) {
         _isPopstateNavigation = true;
         showPage('dashboard');
         history.replaceState({ page: 'dashboard' }, '', '#dashboard');
       }
     }
   });

   // After login — replace history so back doesn't go to login
   function onLoginSuccess() {
     history.replaceState({ page: 'dashboard' }, '', '#dashboard');
     showPage('dashboard');
   }
   ```

3. **If it WAS implemented but isn't working,** diagnose why:
   - Is `history.pushState` being called inside `showPage()`? Check.
   - Is the `popstate` listener registered? Check.
   - Is `onLoginSuccess()` calling `replaceState`? If not, the login page stays in history and back goes there.
   - Is there a redirect or `window.location` change that's overriding the state?

---

## Fix 8: Remove "Top 10 Priorities" Tab

**Problem:** The "Top 10 Priorities" page/tab should be removed since this content has been merged into the Prioritisation page (done in v3).

**Approach:**
1. Find the Top 10 Priorities nav item and page:
   ```bash
   grep -n "top.10.*prior\|top10\|topPriorities\|top-priorities" renderer/index.html | head -20
   ```

2. **Remove:**
   - The nav button/link for "Top 10 Priorities" from the sidebar and/or top nav
   - The page `<div>` element (e.g., `<div id="top-priorities-page" ...>`)
   - The `showPage` case for this page (if any)
   - Any routing or history references to this page

3. **Verify** the Prioritisation page already has the Top 10 priorities section embedded in it (from v3 Fix 17). If not, note it in `FIX_LOG_V5.md`.

4. **Ensure no broken links** — search for any references to the removed page ID and update them to point to 'prioritisation' instead.

---

## Fix 9: Feedback Page — Full Build-Out

**Problem:** The feedback page says "No feedback yet" with no functionality. The share/feedback link goes to a 404 on GitHub Pages. Need a full feedback/feature suggestion system.

**Approach:**

### Part A: Fix the Feedback Link
1. Find the feedback link:
   ```bash
   grep -n "feedback.*link\|share.*feedback\|feedback.*url\|feedback.*share\|github.*pages\|feedback.*portal" renderer/index.html | head -15
   ```

2. The link currently points to a GitHub Pages URL that doesn't exist. It should point to a **Supabase Edge Function** endpoint or a page on the web app itself.

3. **Create a public feedback submission page:**
   - URL: `app.pmroadmapper.com/#feedback-submit` (hash-based, served by the SPA)
   - Or: `app.pmroadmapper.com/feedback.html` (static page in `web/static/`)
   - This page does NOT require login — anyone with the link can submit feedback
   - The page should use the existing `feedback-submit` edge function

4. **If `feedback-submit` edge function already exists:**
   ```bash
   ls supabase/functions/ | grep feedback
   ```
   Use it. Update the share link to point to the correct URL.

5. **If the edge function exists but the frontend doesn't,** create a simple public feedback form:
   ```html
   <!-- Public feedback submission form (can be embedded or standalone) -->
   <div id="feedback-submit-page" class="page" style="display:none;">
     <div class="feedback-submit-container">
       <h2>Share Your Feedback</h2>
       <p>Help us improve Roadmap OS. Submit bug reports, feature requests, or general feedback.</p>

       <div class="form-group">
         <label>Type</label>
         <select id="fb-type">
           <option value="bug">Bug Report</option>
           <option value="feature">Feature Request</option>
           <option value="improvement">Improvement Suggestion</option>
           <option value="general">General Feedback</option>
         </select>
       </div>

       <div class="form-group">
         <label>Title</label>
         <input type="text" id="fb-title" placeholder="Brief summary of your feedback">
       </div>

       <div class="form-group">
         <label>Description</label>
         <textarea id="fb-description" rows="5"
                   placeholder="Describe the issue or suggestion in detail..."></textarea>
       </div>

       <div class="form-group">
         <label>Your Email (optional)</label>
         <input type="email" id="fb-email" placeholder="For follow-up if needed">
       </div>

       <div class="form-group">
         <label>Priority</label>
         <select id="fb-priority">
           <option value="low">Low</option>
           <option value="medium" selected>Medium</option>
           <option value="high">High</option>
           <option value="critical">Critical</option>
         </select>
       </div>

       <button onclick="submitFeedback()" class="btn-primary">Submit Feedback</button>
     </div>
   </div>
   ```

### Part B: Feedback Inbox (Authenticated)
1. The feedback inbox should show all submitted feedback items:
   ```
   ┌──────────────────────────────────────────────────────────┐
   │  Feedback Inbox                  [Share Feedback Link]   │
   │  ────────────────────────────────────────────────────    │
   │                                                          │
   │  Filters: [All ▼] [Bug ▼] [Feature ▼] [Status ▼]       │
   │                                                          │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ 🔴 BUG  Dark mode text invisible on Plans page   │   │
   │  │ Status: Reviewing  │  Votes: 5  │  2 days ago    │   │
   │  │ Linked to: Plans Page Overhaul (initiative)      │   │
   │  └──────────────────────────────────────────────────┘   │
   │                                                          │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ 💡 FEATURE  Export roadmap as PDF with branding   │   │
   │  │ Status: Planned  │  Votes: 12  │  1 week ago     │   │
   │  │ Linked to: Export Features (initiative)          │   │
   │  └──────────────────────────────────────────────────┘   │
   └──────────────────────────────────────────────────────────┘
   ```
   (Note: the icons above are for illustration — use SVG icons, not emoji)

2. **Each feedback item should support:**
   - Status workflow: New → Reviewing → Planned → In Progress → Shipped → Declined
   - Vote count (from public voting via the `feedback-vote` edge function)
   - Link to a roadmap initiative (dropdown to select)
   - Owner assignment
   - Response/notes field (for the PM to add internal notes)

3. **Integration with the roadmap:**
   - When a feedback item is linked to an initiative, show it on the initiative's detail/edit view
   - On the roadmap, initiatives with linked feedback items can show a small feedback icon with count

4. **Share link:**
   - Update the "Share Feedback Link" button to copy the correct URL (not the broken GitHub Pages link)
   - URL should point to the public feedback submission page on the web app

### Part C: Make it Better — Best Practices
- **Upvote/downvote on the inbox:** Let the product owner upvote/downvote internally for prioritization
- **Tags:** Allow tagging feedback items (e.g., "UX", "Performance", "Mobile", "Dark Mode")
- **Search:** Full-text search across feedback items
- **Sort:** By votes, date, priority, status
- **Export:** Download feedback as CSV for reporting
- **Notification:** When a feedback item's status changes, optionally notify the submitter via email (if they provided one)

---

## Fix 10: Capacity IQ — Template Text Visibility + Template Picker Fix

**Problem:** Two issues on the Capacity IQ templates page:
1. When checkboxes are checked in light mode, the text becomes too light/hard to read.
2. When creating a new template, you can only select from GoToMarket tasks — should be able to select from ALL templates (platform + Capacity IQ + organisation) and the task library.
3. The "Icon" field when creating templates should be removed.

### Part A: Fix Checked Text Visibility
1. Find the checkbox/checked state styles:
   ```bash
   grep -n "capacity.*check\|ciq.*check\|checked.*text\|task.*checked\|completed.*text" renderer/index.html | grep -i "style\|css\|class" | head -15
   ```

2. The issue: checked/completed tasks likely have a light grey text color (strike-through effect) that's too light in light mode:
   ```css
   /* BAD — too light in light mode */
   .task-checked { color: #ccc; text-decoration: line-through; }
   ```

3. **Fix:**
   ```css
   .task-checked, .task-completed {
     color: var(--text-muted, #888);    /* #888 is readable in both modes */
     text-decoration: line-through;
     opacity: 0.7;                      /* subtle fade, not invisible */
   }
   .dark-mode .task-checked,
   .dark-mode .task-completed {
     color: var(--text-muted, #999);
   }
   ```

### Part B: Fix Template Selection Source
1. Find the Capacity IQ create template logic:
   ```bash
   grep -n "capacity.*createTemplate\|ciq.*newTemplate\|capacity.*addTemplate\|advancedTemplate" renderer/index.html | head -15
   ```

2. **The issue:** The task dropdown only shows GoToMarket tasks. It should show tasks from ALL sources.

3. **Fix:** Replace the task source with `getAllTemplates()` and `currentData.taskLibrary`:
   ```javascript
   function getAvailableTasksForCapacityIQ() {
     const tasks = [];

     // From all templates (platform + organisation)
     const templates = getAllTemplates();
     templates.forEach(tmpl => {
       if (tmpl.tasks) {
         tmpl.tasks.forEach(task => {
           tasks.push({
             ...task,
             templateSource: tmpl.name,
           });
         });
       }
     });

     // From the task library
     if (currentData.taskLibrary) {
       currentData.taskLibrary.forEach(task => {
         tasks.push({
           ...task,
           templateSource: 'Task Library',
         });
       });
     }

     // Deduplicate by name
     const seen = new Set();
     return tasks.filter(t => {
       const key = t.name.toLowerCase();
       if (seen.has(key)) return false;
       seen.add(key);
       return true;
     });
   }
   ```

4. **UI update:** The task picker dropdown should:
   - Show tasks grouped by source (Template name / Task Library)
   - Be searchable
   - Have checkboxes for multi-select
   - Show task hours and priority alongside the name

### Part C: Remove Icon Field
1. Find the icon field in the create template form:
   ```bash
   grep -n "icon.*select\|icon.*input\|icon.*field\|template.*icon\|iconPicker" renderer/index.html | head -10
   ```
2. Remove the entire icon form group (label + input/select + any associated logic).
3. If templates have an `icon` field in the data model, leave it in the schema but don't render UI for it.

---

## Post-Fix Checklist

1. **Template categorization:** Verify platform vs organisation templates display correctly everywhere.
2. **Toolbar centering:** Check EVERY page header — buttons must be centered, not cut off.
3. **Template editor:** Click a platform template → can add tasks, pull from library, save as org template, import to plan.
4. **Create template:** Can add manual tasks, pull from task library, import from existing templates.
5. **Browse Templates on Checklist:** Button works, opens picker, imports into checklist.
6. **Research areas:** Verify a new user sees NO default research areas. Verify existing user's areas are preserved.
7. **Navigation:** Switch between 3+ pages — correct tab is highlighted each time. Browser back goes to previous page.
8. **Top 10 Priorities tab:** Removed from nav.
9. **Feedback page:** Public submission form works. Inbox shows items with status and voting.
10. **Capacity IQ:** Checked text is readable in light mode. Template creator shows ALL template sources. Icon field removed.
11. **Emoji sweep:** `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` — must be 0.
12. **Dark mode check:** All new elements support dark mode.
13. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
14. **Bump version** in `package.json`
15. **Rebuild web:** `cd web && npm run build`
16. **Commit:** `git add -A && git commit -m "vX.Y.Z: v5 fixes — template builder, feedback system, nav state, research areas, toolbar centering"`
17. **Update FIX_LOG_V5.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V5.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix:** Re-read changes, check syntax, verify both light and dark mode.
4. **If a fix is blocked**, implement what you can, add `// TODO:` comments, log it, move on.
5. **Preserve existing patterns.** Match the codebase style exactly.
6. **Both modes matter.** Every element must work in BOTH light mode AND dark mode.
7. **Keep the single-file SPA pattern.** All UI changes go into `renderer/index.html`.
8. **Zero emoji.** Replace any emoji encountered while working.
9. **Template Library is CENTRAL.** Everywhere templates appear, they pull from the same `getAllTemplates()` source. Platform + Organisation types. Task Library integration everywhere.
10. **The toolbar centering fix (Fix 2) is GLOBAL.** Apply it once as a CSS class, then add that class to every page header. No more page-by-page patching.
