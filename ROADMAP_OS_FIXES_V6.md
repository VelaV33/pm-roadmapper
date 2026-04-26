# Roadmap OS — Autonomous Fix Queue v6

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V6.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Data stored as one JSONB blob per user in `roadmap_data` table
- Navigation: `showPage('pageId')` pattern with `history.pushState`
- Dark mode: CSS variables + class toggle
- ZERO emoji policy — SVG icons only
- Template data: `currentData.templateLibrary` — `getAllTemplates()` is the single source of truth
- Task Library: `currentData.taskLibrary` — central task registry across all modules

**Before starting:**
1. `grep -n "quarter\|Q1\|Q2\|Q3\|Q4\|financial.*year\|fiscal.*year\|addQuarter\|legend" renderer/index.html | head -30`
2. `grep -n "importTemplate.*plan\|template.*import\|Import.*Selected\|addTaskToPlan" renderer/index.html | head -20`
3. `grep -n "Add Task.*Plan\|addTask.*modal\|task.*modal\|From Excel\|Import Template\|Capacity IQ.*tab" renderer/index.html | head -30`
4. `grep -n "colour.*btn\|colors.*btn\|Colours\|Colors.*button\|plan.*colour" renderer/index.html | head -15`
5. `grep -n "burger.*menu\|sidebar.*menu\|nav-menu\|Add row\|Add section\|Paste.*spread\|Save backup\|Import data\|Export PDF\|Export Excel" renderer/index.html | head -40`
6. `grep -n "timesheet\|time.*sheet\|capacity.*tab\|my.*capacity\|KPI.*scorecard" renderer/index.html | head -20`
7. `grep -n "todo.*edit\|editTodo\|edit.*task.*todo\|todo.*modal" renderer/index.html | head -15`
8. Log all findings in `FIX_LOG_V6.md`

---

## Fix 1: Quarter / Financial Year Management in Timeline Legend

**Problem:** Users need to add new quarters and financial years directly from the timeline legend. Not all financial years start in January — users should be able to set their FY start month and the system calculates quarters from there.

**Approach:**
1. Find the timeline legend/header:
   ```bash
   grep -n "legend\|timeline.*header\|quarter.*header\|Q1.*Q2\|quarter.*label\|timeline.*legend" renderer/index.html | head -20
   ```

2. **Add controls to the legend area:**
   ```html
   <div class="timeline-legend-controls">
     <!-- Existing quarter labels: Q1 | Q2 | Q3 | Q4 -->

     <!-- New: Add Quarter / Add Financial Year dropdown -->
     <div class="legend-add-dropdown">
       <button onclick="toggleLegendMenu()" class="btn-sm btn-outline" title="Add Quarter / Financial Year">
         <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor"
              stroke-width="1.5" fill="none">
           <line x1="10" y1="4" x2="10" y2="16"/>
           <line x1="4" y1="10" x2="16" y2="10"/>
         </svg>
       </button>
       <div id="legend-add-menu" class="dropdown-menu" style="display:none;">
         <button onclick="addQuarter()">Add Quarter</button>
         <button onclick="addFinancialYear()">Add Financial Year</button>
         <button onclick="configureFYStart()">Configure FY Start Month</button>
       </div>
     </div>
   </div>
   ```

3. **FY Start Month Configuration:**
   ```javascript
   function configureFYStart() {
     // Show a modal to set the FY start month
     const modal = createModal('Configure Financial Year');
     modal.innerHTML = `
       <div class="form-group">
         <label>Financial Year starts in:</label>
         <select id="fy-start-month">
           <option value="1">January</option>
           <option value="2">February</option>
           <option value="3">March</option>
           <option value="4" selected>April</option>
           <option value="5">May</option>
           <option value="6">June</option>
           <option value="7">July</option>
           <option value="8">August</option>
           <option value="9">September</option>
           <option value="10">October</option>
           <option value="11">November</option>
           <option value="12">December</option>
         </select>
         <p class="form-hint">Quarters will be calculated from this month.</p>
       </div>
       <div class="form-actions">
         <button onclick="saveFYConfig()" class="btn-primary">Save</button>
         <button onclick="closeModal()" class="btn-secondary">Cancel</button>
       </div>
     `;
     showModal(modal);

     // Pre-select current setting
     const current = currentData?.settings?.fyStartMonth || 1;
     document.getElementById('fy-start-month').value = current;
   }

   function saveFYConfig() {
     const startMonth = parseInt(document.getElementById('fy-start-month').value);
     if (!currentData.settings) currentData.settings = {};
     currentData.settings.fyStartMonth = startMonth;
     saveData();
     recalculateQuarters();
     renderTimeline();
     closeModal();
     showToast('Financial year configured', 'success');
   }

   function recalculateQuarters() {
     const startMonth = currentData?.settings?.fyStartMonth || 1; // default Jan
     // Q1 = startMonth to startMonth+2
     // Q2 = startMonth+3 to startMonth+5
     // Q3 = startMonth+6 to startMonth+8
     // Q4 = startMonth+9 to startMonth+11
     currentData.settings.quarters = [];
     for (let q = 0; q < 4; q++) {
       const qStart = ((startMonth - 1 + q * 3) % 12) + 1;
       const qEnd = ((startMonth - 1 + q * 3 + 2) % 12) + 1;
       currentData.settings.quarters.push({
         label: `Q${q + 1}`,
         startMonth: qStart,
         endMonth: qEnd,
       });
     }
   }

   function addQuarter() {
     // Extend the current FY by one quarter
     // This effectively starts a new FY or extends the timeline
     if (!currentData.settings) currentData.settings = {};
     if (!currentData.settings.timelineYears) {
       currentData.settings.timelineYears = [new Date().getFullYear()];
     }
     // Check if we need to add a new year
     const lastYear = currentData.settings.timelineYears[currentData.settings.timelineYears.length - 1];
     const currentQuarters = currentData.settings.visibleQuarters || 4;
     currentData.settings.visibleQuarters = currentQuarters + 1;

     // If we've gone past 4 quarters, we're into the next FY
     if (currentData.settings.visibleQuarters > currentData.settings.timelineYears.length * 4) {
       currentData.settings.timelineYears.push(lastYear + 1);
     }

     saveData();
     renderTimeline();
     showToast('Quarter added', 'success');
   }

   function addFinancialYear() {
     if (!currentData.settings) currentData.settings = {};
     if (!currentData.settings.timelineYears) {
       currentData.settings.timelineYears = [new Date().getFullYear()];
     }
     const lastYear = currentData.settings.timelineYears[currentData.settings.timelineYears.length - 1];
     currentData.settings.timelineYears.push(lastYear + 1);
     currentData.settings.visibleQuarters = currentData.settings.timelineYears.length * 4;
     saveData();
     renderTimeline();
     showToast(`FY${lastYear + 1} added`, 'success');
   }
   ```

4. **Update the timeline renderer** to use the configured FY start month and dynamic quarters instead of hardcoded Jan-Dec.

---

## Fix 2: Template Import into Plans — Not Working

**Problem:** On the Plans page, selecting a template and clicking "Import Selected" doesn't actually import anything into the project plan.

**Approach:**
1. Find the import handler:
   ```bash
   grep -n "importTemplate\|Import.*Selected\|importSelected\|importToPlan\|importTasksIntoPlan" renderer/index.html | head -20
   ```

2. **Diagnose:**
   - Is the click handler bound to the button?
   - Is the function finding the correct plan to import into?
   - Is `getCurrentPlan()` or equivalent returning the active plan?
   - Are the selected tasks actually being read from the UI?
   - Is `saveData()` being called after import?
   - Is the plan view being re-rendered after import?

3. **Common issues:**
   - The import function might reference a plan ID that doesn't match the active plan
   - The selected tasks array might be empty (checkbox state not being read)
   - The function might silently return without doing anything (no error, no action)

4. **Fix — ensure the complete flow works:**
   ```javascript
   function importSelectedToPlan() {
     // Get selected tasks from the template builder/picker
     const selectedTasks = getSelectedTemplateTasks(); // however they're tracked

     if (!selectedTasks || selectedTasks.length === 0) {
       showToast('No tasks selected', 'warning');
       return;
     }

     // Get the current active plan
     const plan = getCurrentPlan();
     if (!plan) {
       showToast('No active plan — create or select a plan first', 'warning');
       return;
     }

     // Ensure plan has a tasks array
     if (!plan.tasks) plan.tasks = [];

     // Import each task with a new ID
     selectedTasks.forEach(task => {
       plan.tasks.push({
         id: generateId(),
         name: task.name || task.title,
         hours: task.hours || task.estimatedHours || 0,
         priority: task.priority || 'Medium',
         status: 'Not Started',
         description: task.description || '',
         phase: task.phase || '',
         owner: '',
         importedFrom: task.templateSource || 'Template',
         addedAt: new Date().toISOString(),
       });
     });

     // Save and re-render
     saveData();
     renderPlan();

     // Close the template modal/page
     closeTemplateBuilder();
     // Or navigate back to the plan
     showPage('plans');

     showToast(`${selectedTasks.length} tasks imported into plan`, 'success');
   }
   ```

5. **Also verify** that navigating from Plans → Templates → back to Plans maintains the active plan context so the import knows WHERE to put the tasks.

---

## Fix 3: Template Builder — Enhanced Customization + Select All

**Problem:** The template builder needs more customization: ability to select from multiple templates, add from task library with Select All, deselect individual tasks, and save or import at the end. The task library picker has no "Select All" option — you must click 173 tasks one by one.

**Approach:**
1. Find the template builder:
   ```bash
   grep -n "templateBuilder\|template-builder\|TemplateBuilder\|openTemplateBuilder" renderer/index.html | head -20
   ```

2. **Add "Select All" / "Deselect All" controls everywhere tasks are listed:**
   ```javascript
   function renderSelectAllControls(containerId, tasks) {
     return `
       <div class="select-all-bar">
         <label class="select-all-label">
           <input type="checkbox" onchange="toggleSelectAll('${containerId}', this.checked)"
                  class="select-all-checkbox">
           Select All (${tasks.length})
         </label>
         <span class="selected-count" id="${containerId}-count">0 selected</span>
       </div>
     `;
   }

   function toggleSelectAll(containerId, checked) {
     const container = document.getElementById(containerId);
     const checkboxes = container.querySelectorAll('input[type="checkbox"].task-checkbox');
     checkboxes.forEach(cb => {
       cb.checked = checked;
       // Trigger the selection state update
       const taskId = cb.dataset.taskId;
       if (checked) {
         addToSelection(taskId);
       } else {
         removeFromSelection(taskId);
       }
     });
     updateSelectedCount(containerId);
   }

   function updateSelectedCount(containerId) {
     const container = document.getElementById(containerId);
     const checked = container.querySelectorAll('input.task-checkbox:checked').length;
     const total = container.querySelectorAll('input.task-checkbox').length;
     const countEl = document.getElementById(`${containerId}-count`);
     if (countEl) countEl.textContent = `${checked} of ${total} selected`;
   }
   ```

3. **Enhanced template builder flow:**

   The builder should support this workflow:
   ```
   1. User opens template builder
   2. Sees template list on the left
   3. Clicks "Hardware Product Launch" → sees all tasks with checkboxes + "Select All"
   4. Checks desired tasks (or Select All, then deselect unwanted)
   5. WITHOUT closing, clicks another template (e.g., "Security Audit")
   6. Checks additional tasks from that template
   7. Clicks "Task Library" tab
   8. Sees all 173+ tasks with "Select All" + category filters
   9. Checks additional individual tasks or selects entire categories
   10. At the bottom, sees total: "47 tasks selected"
   11. Option A: "Save as Template" → names it → saved to org templates
   12. Option B: "Import Selected" → tasks go into the calling module (Plans/Todo/Checklist)
   ```

4. **Task Library with category-based Select All:**
   ```javascript
   function renderTaskLibraryInBuilder() {
     const tasks = currentData.taskLibrary || [];
     const categories = [...new Set(tasks.map(t => t.category || 'Uncategorized'))].sort();

     let html = '<div class="task-library-browser" id="task-library-browser">';

     // Global select all
     html += renderSelectAllControls('task-library-browser', tasks);

     // Category filter buttons
     html += '<div class="category-filters">';
     html += '<button class="cat-filter active" onclick="filterTaskLibCategory(\'all\')">All</button>';
     categories.forEach(cat => {
       const count = tasks.filter(t => (t.category || 'Uncategorized') === cat).length;
       html += `<button class="cat-filter" onclick="filterTaskLibCategory('${cat}')">${cat} (${count})</button>`;
     });
     html += '</div>';

     // Per-category sections with their own Select All
     categories.forEach(cat => {
       const catTasks = tasks.filter(t => (t.category || 'Uncategorized') === cat);
       html += `<div class="task-category-section" data-category="${cat}">`;
       html += `<div class="category-header">`;
       html += `<label><input type="checkbox" onchange="toggleCategorySelectAll('${cat}', this.checked)"> ${cat} (${catTasks.length})</label>`;
       html += `</div>`;
       catTasks.forEach(task => {
         html += `
           <div class="task-item" data-category="${cat}">
             <label>
               <input type="checkbox" class="task-checkbox" data-task-id="${task.id}"
                      onchange="toggleTaskSelection('${task.id}', this.checked); updateSelectedCount('task-library-browser')">
               <span class="task-name">${task.name}</span>
               <span class="task-hours">${task.hours || '-'}h</span>
             </label>
           </div>
         `;
       });
       html += '</div>';
     });

     html += '</div>';
     return html;
   }

   function toggleCategorySelectAll(category, checked) {
     const items = document.querySelectorAll(`.task-item[data-category="${category}"] .task-checkbox`);
     items.forEach(cb => {
       cb.checked = checked;
       toggleTaskSelection(cb.dataset.taskId, checked);
     });
     updateSelectedCount('task-library-browser');
   }
   ```

5. **Accumulated selection persists across tabs.** When the user switches from one template to another, or to the task library tab, their previous selections must be preserved. Use a Set or Map to track selected task IDs globally within the builder session.

---

## Fix 4: Add Task to Plan — Simplify Tabs

**Problem:** The "Add Task to Plan" modal has too many tabs that overlap with existing functionality. Need to clean up:
- **Keep:** Custom tab (manual task entry)
- **Remove:** "From Excel" tab (Upload Excel button already exists separately)
- **Remove:** "Import Template" tab (dedicated template function already exists)
- **Keep:** "To-Do List" tab (pull tasks from to-do)
- **Remove:** "Capacity IQ" tab (those tasks are in the task library already)
- **Ensure:** All tasks from everywhere end up in the Task Library with proper categories

**Approach:**
1. Find the Add Task modal:
   ```bash
   grep -n "addTask.*modal\|add-task.*modal\|taskModal\|Add Task.*tab\|From Excel\|Import Template\|Capacity IQ.*tab\|Custom.*tab" renderer/index.html | head -30
   ```

2. **Remove the specified tabs:**
   - Find the tab buttons and their associated content panels
   - Remove: "From Excel" tab + panel
   - Remove: "Import Template" tab + panel
   - Remove: "Capacity IQ" tab + panel
   - Keep: "Custom" tab + panel
   - Keep: "To-Do List" tab + panel (rename to "From To-Do" for clarity)

3. **Add a "From Task Library" tab** (replaces the removed tabs with a better UX):
   ```html
   <div class="tab-content" id="add-task-library-tab">
     <div class="task-library-search">
       <input type="text" placeholder="Search tasks..."
              oninput="filterAddTaskLibrary(this.value)">
       <select onchange="filterAddTaskCategory(this.value)">
         <option value="all">All Categories</option>
         <!-- Populated dynamically -->
       </select>
     </div>
     <div class="select-all-bar">
       <label><input type="checkbox" onchange="toggleAddTaskSelectAll(this.checked)"> Select All</label>
       <span id="add-task-selected-count">0 selected</span>
     </div>
     <div id="add-task-library-list">
       <!-- Task list with checkboxes, grouped by category -->
     </div>
     <button onclick="addSelectedLibraryTasksToPlan()" class="btn-primary">
       Add Selected to Plan
     </button>
   </div>
   ```

4. **Ensure ALL tasks from everywhere feed the Task Library with categories:**
   - Scan every place tasks are created:
     ```bash
     grep -n "\.push(\|addTask\|createTask\|newTask\|addItem" renderer/index.html | head -40
     ```
   - Each task should have a `category` field. If not set, infer from context:
     - Tasks from GoToMarket templates → category from template category
     - Tasks from Plans → "Project Management" or match template source
     - Tasks from To-Do → "General" or user-specified
     - Tasks from Capacity IQ → "Resource Planning"
     - Hardware templates → "Hardware"
     - Software templates → "Software/Engineering"
     - Security templates → "Security"
     - Marketing templates → "Marketing"

---

## Fix 5: Plans Page — Remove Colours Button + Remove Category Field

**Problem:** 
1. The "Colours" button on the Plans page doesn't work — in dark mode it just turns white. Remove it entirely.
2. There's a category field on plan tasks (showing "template" or "capacity") that serves no purpose. Remove it.

### Part A: Remove Colours Button
1. Find it:
   ```bash
   grep -n "colour.*button\|colors.*button\|Colours\|Colors.*btn\|plan.*colour\|plan.*color.*btn" renderer/index.html | head -15
   ```
2. Remove the button element from the Plans page toolbar.
3. Remove any associated functions (`openColourPicker`, `changeColour`, etc. if they relate specifically to the Plans page colour button).
4. If there's CSS for this button, clean it up.

### Part B: Remove Category Field from Plan Tasks
1. Find the category display in plan task rows:
   ```bash
   grep -n "category.*plan\|plan.*category\|template.*capacity.*label\|task.*type.*label" renderer/index.html | head -15
   ```
2. Remove the category column/field from the plan task row rendering.
3. Keep the `category` field in the task DATA (it's useful for the task library), just don't display it in the plan view.

---

## Fix 6: To-Do List — Add Task Parity with Plans + Edit Task + Auto-Pull Assigned Tasks

**Problem:** Three issues:
1. The To-Do "Add Task" button should work the same as the Plans "Add Task" (with Custom + Task Library tabs)
2. There's no way to edit a to-do list task once created
3. Tasks assigned to a user on the Plans page should auto-pull into their To-Do list

### Part A: Add Task Button Enhancement
1. Find the To-Do add task handler:
   ```bash
   grep -n "addTodo\|addTask.*todo\|todo.*addTask\|newTodoTask" renderer/index.html | head -15
   ```

2. Replace/enhance the add task flow to match the Plans page:
   - **Custom tab:** Manual entry with task name, description, priority, due date
   - **From Task Library tab:** Searchable task library with Select All + category filters
   - After adding: prompt to link to an initiative and link to a KPI
   ```javascript
   function addTodoTask(taskData) {
     const task = {
       id: generateId(),
       name: taskData.name,
       description: taskData.description || '',
       priority: taskData.priority || 'Medium',
       status: 'To Do',
       dueDate: taskData.dueDate || null,
       linkedInitiative: null,   // user can link after creation
       linkedKPI: null,          // user can link after creation
       assignedTo: getCurrentUserId(),
       createdAt: new Date().toISOString(),
     };

     // Add to to-do list
     if (!currentData.todos) currentData.todos = [];
     currentData.todos.push(task);

     // Also add to task library
     addToTaskLibrary({
       name: task.name,
       hours: taskData.hours || null,
       category: 'General',
       source: 'todo',
     });

     saveData();
     renderTodoList();

     // Show link prompt
     showLinkTaskModal(task.id);
   }

   function showLinkTaskModal(taskId) {
     // Modal to optionally link to initiative and KPI
     const modal = createModal('Link Task');
     modal.innerHTML = `
       <div class="form-group">
         <label>Link to Initiative (optional)</label>
         <select id="link-initiative">
           <option value="">None</option>
           ${getInitiativeOptions()}
         </select>
       </div>
       <div class="form-group">
         <label>Link to KPI (optional)</label>
         <select id="link-kpi">
           <option value="">None</option>
           ${getKPIOptions()}
         </select>
       </div>
       <div class="form-actions">
         <button onclick="saveLinkAndClose('${taskId}')" class="btn-primary">Save</button>
         <button onclick="closeModal()" class="btn-secondary">Skip</button>
       </div>
     `;
     showModal(modal);
   }
   ```

### Part B: Edit To-Do Task
1. Add edit functionality to each to-do task:
   ```javascript
   function editTodoTask(taskId) {
     const task = currentData.todos.find(t => t.id === taskId);
     if (!task) return;

     const modal = createModal('Edit Task');
     modal.innerHTML = `
       <div class="form-group">
         <label>Task Name</label>
         <input type="text" id="edit-todo-name" value="${escapeHtml(task.name)}">
       </div>
       <div class="form-group">
         <label>Description</label>
         <textarea id="edit-todo-desc">${escapeHtml(task.description || '')}</textarea>
       </div>
       <div class="form-group">
         <label>Priority</label>
         <select id="edit-todo-priority">
           <option value="High" ${task.priority === 'High' ? 'selected' : ''}>High</option>
           <option value="Medium" ${task.priority === 'Medium' ? 'selected' : ''}>Medium</option>
           <option value="Low" ${task.priority === 'Low' ? 'selected' : ''}>Low</option>
         </select>
       </div>
       <div class="form-group">
         <label>Status</label>
         <select id="edit-todo-status">
           <option value="To Do" ${task.status === 'To Do' ? 'selected' : ''}>To Do</option>
           <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
           <option value="Done" ${task.status === 'Done' ? 'selected' : ''}>Done</option>
         </select>
       </div>
       <div class="form-group">
         <label>Due Date</label>
         <input type="date" id="edit-todo-due" value="${task.dueDate || ''}">
       </div>
       <div class="form-group">
         <label>Linked Initiative</label>
         <select id="edit-todo-initiative">
           <option value="">None</option>
           ${getInitiativeOptions(task.linkedInitiative)}
         </select>
       </div>
       <div class="form-group">
         <label>Linked KPI</label>
         <select id="edit-todo-kpi">
           <option value="">None</option>
           ${getKPIOptions(task.linkedKPI)}
         </select>
       </div>
       <div class="form-actions">
         <button onclick="saveTodoEdit('${taskId}')" class="btn-primary">Save</button>
         <button onclick="closeModal()" class="btn-secondary">Cancel</button>
       </div>
     `;
     showModal(modal);
   }
   ```

2. Add an edit button (pencil icon) to each to-do task card/row.

### Part C: Auto-Pull Assigned Plan Tasks into To-Do
1. Find where plan tasks are assigned to users:
   ```bash
   grep -n "assignTask\|task.*owner\|task.*assignee\|assign.*user\|owner.*select" renderer/index.html | head -15
   ```

2. When a task is assigned to the current user in Plans, automatically create a corresponding To-Do item:
   ```javascript
   function onPlanTaskAssigned(task, assigneeId) {
     // If assigned to the current user, add to their to-do
     if (assigneeId === getCurrentUserId()) {
       if (!currentData.todos) currentData.todos = [];

       // Check for duplicates
       const exists = currentData.todos.find(t =>
         t.sourcePlanTaskId === task.id
       );
       if (exists) return; // already linked

       currentData.todos.push({
         id: generateId(),
         name: task.name,
         description: task.description || '',
         priority: task.priority || 'Medium',
         status: 'To Do',
         hours: task.hours || 0,
         sourcePlanTaskId: task.id,   // link back to the plan task
         sourcePlanName: getCurrentPlanName(),
         linkedInitiative: task.linkedInitiative || null,
         assignedTo: assigneeId,
         autoCreated: true,
         createdAt: new Date().toISOString(),
       });

       saveData();
       showToast(`"${task.name}" added to your To-Do list`, 'info');
     }
   }
   ```

3. **Bidirectional sync:** When the to-do task status changes, update the plan task status too (and vice versa):
   ```javascript
   function syncTodoPlanStatus(todoTaskId, newStatus) {
     const todoTask = currentData.todos.find(t => t.id === todoTaskId);
     if (todoTask?.sourcePlanTaskId) {
       // Find the plan task and update its status
       const planTask = findPlanTaskById(todoTask.sourcePlanTaskId);
       if (planTask) {
         planTask.status = newStatus;
         saveData();
       }
     }
   }
   ```

---

## Fix 7: Dark Mode + Light Mode — DEFINITIVE FINAL AUDIT

**Problem:** Dark mode contrast issues keep recurring. Light text on light backgrounds in dark mode, and light text on white backgrounds in light mode. This needs a one-time comprehensive fix that makes it IMPOSSIBLE for this to happen again.

**Approach:**

### Step 1: Create a Bulletproof CSS Variable System
```css
/* ================================================
   DEFINITIVE COLOR SYSTEM — LIGHT MODE DEFAULTS
   All colors MUST use these variables. No exceptions.
   ================================================ */
:root {
  /* Backgrounds */
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-tertiary: #f1f3f5;
  --bg-card: #ffffff;
  --bg-modal: #ffffff;
  --bg-input: #ffffff;
  --bg-hover: #f1f3f5;
  --bg-selected: #e7f0ff;

  /* Text */
  --text-primary: #1a1a2e;
  --text-secondary: #4a4a6a;
  --text-muted: #6b7280;
  --text-disabled: #9ca3af;
  --text-inverse: #ffffff;

  /* Borders */
  --border-primary: #e2e4e8;
  --border-secondary: #d1d5db;
  --border-focus: #3b82f6;

  /* Accent */
  --accent-primary: #3b82f6;
  --accent-hover: #2563eb;
  --accent-light: #dbeafe;
}

/* ================================================
   DARK MODE OVERRIDES — COMPREHENSIVE
   ================================================ */
.dark-mode {
  --bg-primary: #0f0f1a;
  --bg-secondary: #1a1a2e;
  --bg-tertiary: #1e2a3a;
  --bg-card: #16213e;
  --bg-modal: #1a1a2e;
  --bg-input: #1e2a3a;
  --bg-hover: #253550;
  --bg-selected: #1e3a5f;

  --text-primary: #e8e8f0;
  --text-secondary: #b0b0c8;
  --text-muted: #8888a8;
  --text-disabled: #606078;
  --text-inverse: #1a1a2e;

  --border-primary: #2a3a5a;
  --border-secondary: #354868;
  --border-focus: #4a90e8;

  --accent-primary: #4a90e8;
  --accent-hover: #5ca0f0;
  --accent-light: #1e3a5f;
}
```

### Step 2: Global Reset — Force All Elements to Use Variables
```css
/* NUCLEAR OPTION: override all hardcoded colors */
.dark-mode * {
  /* This catches elements that use hardcoded colors */
}

/* More targeted: override common patterns */
.dark-mode .page,
.dark-mode .card,
.dark-mode .modal,
.dark-mode .overlay,
.dark-mode .panel,
.dark-mode .section,
.dark-mode [class*="container"],
.dark-mode [class*="wrapper"],
.dark-mode [class*="content"],
.dark-mode [class*="header"],
.dark-mode [class*="toolbar"],
.dark-mode [class*="footer"] {
  background-color: var(--bg-secondary);
  color: var(--text-primary);
}

.dark-mode input,
.dark-mode select,
.dark-mode textarea,
.dark-mode option {
  background-color: var(--bg-input);
  color: var(--text-primary);
  border-color: var(--border-primary);
}

.dark-mode button {
  color: var(--text-primary);
}

.dark-mode h1, .dark-mode h2, .dark-mode h3,
.dark-mode h4, .dark-mode h5, .dark-mode h6 {
  color: var(--text-primary);
}

.dark-mode p, .dark-mode span, .dark-mode label,
.dark-mode td, .dark-mode th, .dark-mode li {
  color: var(--text-primary);
}

.dark-mode a {
  color: var(--accent-primary);
}
```

### Step 3: Find and Destroy All Hardcoded Colors
```bash
# Find all hardcoded backgrounds
grep -n "background.*#fff\|background.*white\|background.*#f[0-9a-f]\{5\}\|background-color.*white\|background-color.*#fff" renderer/index.html > /tmp/hardcoded_bg.txt

# Find all hardcoded text colors that are too light for dark mode
grep -n "color:.*#[cdef]\|color:.*#[89ab][89ab]\|color:.*lightgr\|color:.*#9\|color:.*#a\|color:.*#b" renderer/index.html > /tmp/hardcoded_text.txt
```

For each hardcoded color found:
- Replace with the appropriate CSS variable
- Or ensure a `.dark-mode` override exists

### Step 4: Specifically Fix Reported Pages
After the global fix, verify these specific pages:
- **Insights page:** white background + grey text → fix
- **Plans/Gantt:** alternating row colors → fix
- **Capacity IQ header:** white background → fix
- **To-Do page:** light task text in light mode → fix
- **All dropdowns:** ensure option text is visible
- **All modals:** ensure backgrounds and text are correct

### Step 5: Prevention — Add a Development Rule
Add a comment at the top of the `<style>` section:
```css
/*
 * ================================================================
 * COLOR RULES — READ BEFORE EDITING
 * ================================================================
 * 1. NEVER use hardcoded colors (#fff, white, #333, etc.)
 * 2. ALWAYS use CSS variables (var(--bg-primary), var(--text-primary), etc.)
 * 3. The dark mode system handles everything automatically via variables
 * 4. If you add a new element, use variables. Period.
 * 5. Test BOTH light and dark mode after every change.
 * ================================================================
 */
```

---

## Fix 8: Sidebar Reorganization — Roadmap + Data Dropdowns in Legend Area

**Problem:** The sidebar currently has items (Add Row, Add Section, Paste from Spreadsheets, Edit Timeline, Export Excel, Export PDF, Save Backup, Import Data) that should live on the Roadmap page itself — in the legend/toolbar area — not in the sidebar nav, since they're only relevant to the Roadmap.

**Approach:**
1. Find these sidebar items:
   ```bash
   grep -n "Add row\|Add section\|Paste.*spread\|Edit.*Timeline\|Export Excel\|Export PDF\|Save backup\|Import data" renderer/index.html | head -30
   ```

2. **Create two dropdown menus in the Roadmap page legend/toolbar area:**

   **Dropdown 1: "Roadmap" actions**
   ```html
   <div class="legend-dropdown">
     <button onclick="toggleDropdown('roadmap-actions')" class="btn-outline btn-sm">
       Roadmap ▾
     </button>
     <div id="roadmap-actions" class="dropdown-menu" style="display:none;">
       <button onclick="addRow()">Add Row</button>
       <button onclick="addSection()">Add Section</button>
       <button onclick="pasteFromSpreadsheet()">Paste from Spreadsheet</button>
       <button onclick="addQuarter()">Add Quarter</button>
       <button onclick="addFinancialYear()">Add Financial Year</button>
     </div>
   </div>
   ```

   **Dropdown 2: "Data" actions**
   ```html
   <div class="legend-dropdown">
     <button onclick="toggleDropdown('data-actions')" class="btn-outline btn-sm">
       Data ▾
     </button>
     <div id="data-actions" class="dropdown-menu" style="display:none;">
       <button onclick="editTimeline()">Edit Timeline</button>
       <button onclick="exportExcel()">Export Excel</button>
       <button onclick="exportPDF()">Export PDF</button>
       <button onclick="saveBackup()">Save Backup</button>
       <button onclick="importData()">Import Data</button>
     </div>
   </div>
   ```

3. **Dropdown CSS:**
   ```css
   .legend-dropdown {
     position: relative; display: inline-block;
   }
   .legend-dropdown .dropdown-menu {
     position: absolute; top: 100%; left: 0;
     background: var(--bg-card);
     border: 1px solid var(--border-primary);
     border-radius: 8px;
     box-shadow: 0 4px 12px rgba(0,0,0,0.15);
     min-width: 200px;
     z-index: 100;
     padding: 4px 0;
   }
   .legend-dropdown .dropdown-menu button {
     display: block; width: 100%;
     text-align: left;
     padding: 10px 16px;
     border: none; background: none;
     color: var(--text-primary);
     font-size: 13px;
     cursor: pointer;
   }
   .legend-dropdown .dropdown-menu button:hover {
     background: var(--bg-hover);
   }
   .dark-mode .legend-dropdown .dropdown-menu {
     background: var(--bg-card);
     border-color: var(--border-primary);
   }
   ```

4. **Remove these items from the sidebar** — but DON'T delete the sidebar entries entirely. Instead:
   - Remove: Add Row, Add Section, Paste from Spreadsheet, Edit Timeline, Export Excel, Export PDF, Save Backup, Import Data
   - Keep in sidebar: All page navigation items (Dashboard, Roadmap, Plans, etc.)
   - Keep in sidebar: Settings, User Management, Platform Admin
   - **Shift remaining items up** so there's no gap: Settings, User Management, Platform Admin should move up to sit right below the page nav items (below Insights)

5. **Settings in sidebar:** Instead of just a gear icon, make it a proper text label "Settings" with a gear icon beside it.

6. **Verify ALL functions still work** after moving them to the dropdown. Each button must call the same function it called from the sidebar.

7. **Close dropdown when clicking outside:**
   ```javascript
   document.addEventListener('click', function(e) {
     if (!e.target.closest('.legend-dropdown')) {
       document.querySelectorAll('.legend-dropdown .dropdown-menu').forEach(m => {
         m.style.display = 'none';
       });
     }
   });
   ```

---

## Fix 9: To-Do Page — Add Timesheet + My Capacity Tabs

**Problem:** The Timesheet and Capacity (from KPI Scorecard) should live within the To-Do page as tabs. Rename "Capacity" to "My Capacity" to avoid confusion with Capacity IQ.

**Approach:**
1. Find the Timesheet and Capacity sections:
   ```bash
   grep -n "timesheet\|time.*sheet\|TimeSheet\|capacity.*tab\|capacity.*section\|KPI.*scorecard.*capacity" renderer/index.html | head -20
   ```

2. **Add tab navigation to the To-Do page:**
   ```html
   <div id="todo-page" class="page" style="display:none;">
     <!-- Tab bar -->
     <div class="todo-tabs page-toolbar">
       <div class="toolbar-title">Tasks</div>
       <div class="tab-buttons">
         <button class="tab-btn active" onclick="switchTodoTab('todo')" data-tab="todo">
           To-Do List
         </button>
         <button class="tab-btn" onclick="switchTodoTab('timesheet')" data-tab="timesheet">
           Timesheet
         </button>
         <button class="tab-btn" onclick="switchTodoTab('my-capacity')" data-tab="my-capacity">
           My Capacity
         </button>
       </div>
     </div>

     <!-- Tab content -->
     <div id="todo-tab-content" class="tab-content active">
       <!-- Existing to-do list content -->
     </div>
     <div id="timesheet-tab-content" class="tab-content" style="display:none;">
       <!-- Timesheet content (moved from KPI Scorecard) -->
     </div>
     <div id="my-capacity-tab-content" class="tab-content" style="display:none;">
       <!-- Personal capacity content (moved from KPI Scorecard, renamed) -->
     </div>
   </div>
   ```

3. **Tab switching logic:**
   ```javascript
   function switchTodoTab(tabName) {
     // Hide all tab contents
     document.querySelectorAll('#todo-page .tab-content').forEach(el => {
       el.style.display = 'none';
     });
     // Remove active from all tab buttons
     document.querySelectorAll('#todo-page .tab-btn').forEach(btn => {
       btn.classList.remove('active');
     });

     // Show selected tab
     document.getElementById(`${tabName}-tab-content`).style.display = 'block';
     document.querySelector(`#todo-page .tab-btn[data-tab="${tabName}"]`).classList.add('active');

     // Render tab content if needed
     if (tabName === 'timesheet') renderTimesheet();
     if (tabName === 'my-capacity') renderMyCapacity();
   }
   ```

4. **Move Timesheet content** from wherever it currently lives (KPI Scorecard) into the `timesheet-tab-content` div.

5. **Move Capacity content** from KPI Scorecard into `my-capacity-tab-content`. Rename ALL references from "Capacity" to "My Capacity" in this context (labels, headers, tooltips).

6. **Remove the Timesheet and Capacity tabs/sections from KPI Scorecard** since they now live in the To-Do page.

7. **If Timesheet doesn't exist yet, create a basic one:**
   ```javascript
   function renderTimesheet() {
     // Show a weekly timesheet grid
     // Rows = tasks from to-do list + assigned plan tasks
     // Columns = days of the week (Mon-Sun)
     // Cells = hours logged
     // Total row at bottom
   }
   ```

8. **If My Capacity doesn't exist yet, create it:**
   ```javascript
   function renderMyCapacity() {
     // Show the current user's capacity allocation
     // - Total available hours per week/sprint
     // - Hours allocated across plans/initiatives
     // - Remaining capacity
     // - Utilization % with a visual bar
   }
   ```

---

## Post-Fix Checklist

1. **Quarter/FY:** Can add quarters, add FY, configure FY start month from the timeline legend.
2. **Template import:** Plans → Templates → select template → Import Selected → tasks appear in plan.
3. **Template builder:** Can select from multiple templates, Select All, category-based selection, save as template or import.
4. **Add Task to Plan:** Only Custom, From To-Do, and From Task Library tabs remain. Excel/Import Template/Capacity IQ tabs removed.
5. **Colours button:** Removed from Plans toolbar.
6. **Category field:** Removed from plan task display.
7. **To-Do Add Task:** Matches Plans functionality with Custom + Task Library. Can link to initiative + KPI.
8. **To-Do Edit:** Can edit any task via edit button.
9. **Auto-pull:** Tasks assigned to current user in Plans auto-appear in To-Do.
10. **Dark/Light mode:** DEFINITIVE audit complete. All pages use CSS variables. Zero hardcoded colors remaining.
11. **Sidebar:** Roadmap actions + Data actions moved to legend dropdowns. Settings shows as text label. Items shifted up.
12. **To-Do tabs:** Timesheet + My Capacity tabs functional.
13. **Emoji sweep:** `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` — must be 0.
14. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
15. **Bump version** in `package.json`
16. **Rebuild web:** `cd web && npm run build`
17. **Commit:** `git add -A && git commit -m "vX.Y.Z: v6 — FY quarters, template builder Select All, sidebar reorg, timesheet tabs, dark mode definitive fix"`
18. **Update FIX_LOG_V6.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V6.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix:** Re-read changes, check syntax, verify both light and dark mode.
4. **If a fix is blocked**, implement what you can, add `// TODO:` comments, log it, move on.
5. **Preserve existing patterns.** Match the codebase style exactly.
6. **Both modes matter.** Every element uses CSS variables. No hardcoded colors.
7. **Keep the single-file SPA pattern.** All UI changes go into `renderer/index.html`.
8. **Zero emoji.** Replace any emoji encountered.
9. **Fix 7 (dark mode) is the DEFINITIVE audit.** After this, hardcoded colors should be impossible because every element uses variables. Treat it as infrastructure, not a patch.
10. **Template system consistency:** `getAllTemplates()` is the only source. Select All is mandatory wherever tasks are listed. Categories are mandatory on all tasks.
