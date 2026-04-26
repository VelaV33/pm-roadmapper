# Roadmap OS — Autonomous Fix Queue v8

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V8.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Data stored as one JSONB blob per user in `roadmap_data` table
- Navigation: `showPage('pageId')` with `history.pushState`
- Dark mode: CSS variables + class toggle
- ZERO emoji — SVG icons only
- Template data: `currentData.templateLibrary` via `getAllTemplates()`
- Task Library: `currentData.taskLibrary` — central task registry
- Plans linked to initiatives, initiatives live on the roadmap

**Before starting:**
1. `grep -n "taskLibrary\|task-library\|addTaskToPlan\|Add Task.*Plan\|173\|getTaskLibrary\|loadTaskLibrary" renderer/index.html | head -30`
2. `grep -n "today.*line\|current.*day\|day.*marker\|time.*indicator\|now.*line\|todayLine" renderer/index.html | head -20`
3. `grep -n "burger.*menu\|sidebar.*toggle\|toggleSidebar\|closeSidebar\|openSidebar\|menu.*open\|sidebarOpen" renderer/index.html | head -20`
4. `grep -n "capacityIQ\|capacity-iq\|CapacityIQ\|capacity.*dashboard\|heatmap\|sprint.*page\|initiative.*page.*capacity" renderer/index.html | head -30`
5. `grep -n "feedback.*submit\|feedback.*page\|feedback.*link\|powered.*roadmap\|Submit Feedback" renderer/index.html | head -20`
6. `grep -n "UCR\|ucr.*page\|Use Case\|taskReference\|task-reference\|Task Reference" renderer/index.html | head -15`
7. Log all findings in `FIX_LOG_V8.md`

---

## Fix 1: Task Library — Template Tasks Not Appearing in Add Task to Plan

**Problem:** The task library only shows 173 tasks when adding a task to a plan. All tasks from the 16 uploaded templates should be in the task library but they're missing. This also affects the To-Do list task picker.

**Approach:**
1. Find where templates load their tasks into the task library:
   ```bash
   grep -n "addToTaskLibrary\|populateTaskLibrary\|seedTaskLibrary\|templateToTaskLib" renderer/index.html | head -20
   ```

2. **Diagnose:** The 16 platform templates have tasks defined, but those tasks are NOT being written to `currentData.taskLibrary`. The task library only has 173 manually-added or previously-seeded tasks.

3. **Fix: Create a function that syncs ALL template tasks into the task library:**
   ```javascript
   function syncTemplateTasksToLibrary() {
     if (!currentData.taskLibrary) currentData.taskLibrary = [];

     const existingNames = new Set(
       currentData.taskLibrary.map(t => t.name.toLowerCase().trim())
     );

     const allTemplates = getAllTemplates();
     let addedCount = 0;

     allTemplates.forEach(template => {
       if (!template.tasks) return;

       template.tasks.forEach(task => {
         const normalizedName = (task.name || task.title || '').toLowerCase().trim();
         if (!normalizedName) return;
         if (existingNames.has(normalizedName)) return; // skip duplicates

         currentData.taskLibrary.push({
           id: generateId(),
           name: task.name || task.title,
           hours: task.hours || task.estimatedHours || task.duration || 0,
           category: task.category || task.phase || template.category || inferCategory(template.name),
           priority: task.priority || 'Medium',
           description: task.description || '',
           source: 'template',
           templateName: template.name,
           templateId: template.id,
           createdAt: new Date().toISOString(),
         });

         existingNames.add(normalizedName);
         addedCount++;
       });
     });

     if (addedCount > 0) {
       saveData();
       console.log(`Task Library: synced ${addedCount} tasks from templates. Total: ${currentData.taskLibrary.length}`);
     }

     return addedCount;
   }

   function inferCategory(templateName) {
     const name = templateName.toLowerCase();
     if (name.includes('hardware')) return 'Hardware';
     if (name.includes('frontend') || name.includes('front-end')) return 'Frontend';
     if (name.includes('backend') || name.includes('back-end')) return 'Backend';
     if (name.includes('security')) return 'Security';
     if (name.includes('marketing')) return 'Marketing';
     if (name.includes('sales')) return 'Sales';
     if (name.includes('devops') || name.includes('infrastructure')) return 'Infrastructure';
     if (name.includes('agile') || name.includes('sprint')) return 'Agile';
     if (name.includes('onboarding') || name.includes('customer')) return 'Customer Success';
     if (name.includes('launch') || name.includes('go-to-market') || name.includes('gtm')) return 'Product Launch';
     if (name.includes('discovery')) return 'Product Discovery';
     return 'General';
   }
   ```

4. **Call `syncTemplateTasksToLibrary()` on app startup** (after data loads) and whenever templates change:
   ```javascript
   // In the main initialization flow, after currentData is loaded:
   syncTemplateTasksToLibrary();
   ```

5. **Verify the Add Task to Plan picker reads from the full task library:**
   ```bash
   grep -n "taskLibrary\|getTaskLibrary\|task.*picker\|task.*dropdown" renderer/index.html | grep -i "plan\|addTask" | head -15
   ```
   Ensure it reads from `currentData.taskLibrary` (which now includes template tasks).

6. **Do the same for the To-Do list task picker** — ensure it also reads from the complete `currentData.taskLibrary`.

7. **After fix, verify:** `currentData.taskLibrary.length` should be significantly more than 173.

---

## Fix 2: Roadmap "Today" Line — Wrong Position

**Problem:** The vertical line on the roadmap that shows the current day is always stuck to the far left instead of sitting on the actual current date.

**Approach:**
1. Find the today line rendering:
   ```bash
   grep -n "todayLine\|today-line\|current-day\|now-marker\|day-indicator\|today.*marker\|today.*position" renderer/index.html | head -20
   ```

2. **Diagnose the position calculation:**
   The line position should be calculated as a percentage or pixel offset based on:
   - The timeline's total date range (start date to end date)
   - Today's date
   - The position = ((today - startDate) / (endDate - startDate)) * timelineWidth

3. **Common bugs:**
   - `startDate` is not being read correctly (wrong format, wrong timezone)
   - The calculation uses a fixed position instead of a dynamic one
   - The timeline container width isn't being measured correctly
   - The FY/quarter boundaries aren't aligned with the date calculation

4. **Fix:**
   ```javascript
   function positionTodayLine() {
     const todayLine = document.getElementById('today-line');
     if (!todayLine) return;

     const now = new Date();
     const timelineContainer = document.getElementById('timeline-container');
     // Or however the timeline element is referenced
     if (!timelineContainer) return;

     // Get the timeline's date range
     const timelineStart = getTimelineStartDate(); // first visible date
     const timelineEnd = getTimelineEndDate();     // last visible date

     if (!timelineStart || !timelineEnd) return;

     // Calculate position as percentage
     const totalMs = timelineEnd.getTime() - timelineStart.getTime();
     const nowMs = now.getTime() - timelineStart.getTime();

     if (totalMs <= 0) return;

     const percentage = (nowMs / totalMs) * 100;

     // Clamp between 0-100 (today might be outside visible range)
     if (percentage < 0 || percentage > 100) {
       todayLine.style.display = 'none'; // hide if today is outside range
       return;
     }

     todayLine.style.display = 'block';
     todayLine.style.left = percentage + '%';
   }
   ```

5. **Check how the timeline renders quarters/months** and ensure the date math aligns:
   ```bash
   grep -n "getTimelineStart\|timelineStart\|timeline.*range\|timeline.*date\|renderTimeline\|drawTimeline" renderer/index.html | head -20
   ```

6. **Call `positionTodayLine()`:**
   - On initial roadmap render
   - When the timeline is scrolled or zoomed
   - When quarters/financial years are added
   - On window resize (if the timeline is responsive)

7. **Style the line appropriately:**
   ```css
   #today-line {
     position: absolute;
     top: 0;
     bottom: 0;
     width: 2px;
     background: #ef4444; /* red — stands out */
     z-index: 5;
     pointer-events: none;
   }
   #today-line::before {
     content: 'Today';
     position: absolute;
     top: -20px;
     left: -16px;
     font-size: 10px;
     color: #ef4444;
     font-weight: 600;
     white-space: nowrap;
   }
   ```

---

## Fix 3: Burger Menu — Auto-Close on Page Navigation (Web)

**Problem:** On the web app, when the burger menu (sidebar) is open and you click a page (Dashboard, Roadmap, Checklist, etc.), the menu stays open. It should auto-close when a page is selected.

**Approach:**
1. Find the sidebar toggle and page navigation:
   ```bash
   grep -n "toggleSidebar\|closeSidebar\|openSidebar\|sidebarOpen\|menuOpen\|burger.*click\|hamburger" renderer/index.html | head -20
   ```

2. **Find `showPage()` and add sidebar close:**
   ```javascript
   function showPage(pageId, options) {
     // ... existing page switching logic ...

     // AUTO-CLOSE sidebar on mobile / web when a page is selected
     closeSidebarIfOpen();

     // ... rest of showPage (nav highlight, history push) ...
   }

   function closeSidebarIfOpen() {
     const sidebar = document.getElementById('sidebar'); // or however it's referenced
     if (!sidebar) return;

     // Check if sidebar is currently open
     const isOpen = sidebar.classList.contains('open') ||
                    sidebar.classList.contains('active') ||
                    sidebar.style.display === 'block' ||
                    sidebar.style.transform === 'translateX(0px)' ||
                    document.body.classList.contains('sidebar-open');

     if (isOpen) {
       closeSidebar();
     }
   }
   ```

3. **Alternatively, if `showPage` calls are made via `onclick` on sidebar items,** add `closeSidebar()` to each click handler:
   ```html
   <!-- Before: -->
   <button onclick="showPage('dashboard')">Dashboard</button>

   <!-- After: -->
   <button onclick="showPage('dashboard')">Dashboard</button>
   <!-- closeSidebar is called inside showPage now -->
   ```

4. **Verify the `closeSidebar()` function exists and works:**
   ```bash
   grep -n "function closeSidebar\|function toggleSidebar\|function openSidebar" renderer/index.html | head -10
   ```
   If it doesn't exist, create it based on how the sidebar open/close mechanism works (CSS class toggle, transform, display, etc.).

5. **This should ONLY auto-close on the web** (on desktop Electron, the sidebar can stay persistent). Check if there's a way to detect the platform:
   ```javascript
   const isWeb = !window.electronAPI || window.electronAPI._isShim;
   // Or: const isWeb = !window.require;
   // Or: check for a flag set by the shim
   ```
   If you can't detect, it's fine to auto-close on both — the user can re-open it.

---

## Fix 4: Remove Pages / Buttons — Cleanup

**Problem:** Several pages and buttons need to be removed:
- Remove "Export to Word" button from the Timesheet page (KPI)
- Remove the UCR (Use Case Requirements) page entirely
- Remove the Task Reference page from Capacity IQ
- Remove the Initiatives page from Capacity IQ
- Remove the Sprints page from Capacity IQ
- Remove To-Do List from the burger menu (already in top nav)
- Remove Insights from the burger menu (already in top nav)

**Approach:**

### Part A: Remove "Export to Word" from Timesheet
1. Find it:
   ```bash
   grep -n "Export.*Word\|export.*word\|exportWord\|word.*export\|docx.*export" renderer/index.html | head -10
   ```
2. Remove the button element. Remove any associated export function if it's ONLY used here.

### Part B: Remove UCR Page
1. Find it:
   ```bash
   grep -n "UCR\|ucr\|Use Case Requirement\|use-case-requirement\|ucr-page" renderer/index.html | head -15
   ```
2. Remove:
   - The nav item/button for UCR (sidebar, top nav, wherever it appears)
   - The page `<div>` element
   - The `showPage` case for UCR
   - Any UCR-specific JavaScript functions (be careful not to remove shared utilities)
3. Keep: any data model references (in case users have saved UCR data — don't delete their data from the JSONB blob, just remove the UI)

### Part C: Remove Task Reference from Capacity IQ
1. Find it:
   ```bash
   grep -n "Task Reference\|taskReference\|task-reference" renderer/index.html | head -15
   ```
2. Remove the tab/button and its content panel from the Capacity IQ page.
3. Rationale: users can manage task hours directly in the Task Library when editing tasks.

### Part D: Remove Initiatives from Capacity IQ
1. Find it:
   ```bash
   grep -n "capacity.*initiative\|ciq.*initiative\|Initiative.*capacity" renderer/index.html | head -15
   ```
2. Remove the Initiatives tab/section from Capacity IQ.
3. Rationale: users manage initiatives from the Plans page.

### Part E: Remove Sprints from Capacity IQ
1. Find it:
   ```bash
   grep -n "sprint.*page\|sprint.*tab\|Sprint.*capacity\|ciq.*sprint" renderer/index.html | head -15
   ```
2. Remove the Sprints tab/section from Capacity IQ.

### Part F: Remove To-Do List from Burger Menu
1. Find the To-Do nav item in the sidebar:
   ```bash
   grep -n "sidebar.*todo\|sidebar.*to-do\|burger.*todo\|nav.*todo\|To.Do.*nav" renderer/index.html | head -10
   ```
2. Remove it from the sidebar/burger menu only. Keep it in the top nav.

### Part G: Remove Insights from Burger Menu
1. Find the Insights nav item in the sidebar:
   ```bash
   grep -n "sidebar.*insight\|burger.*insight\|nav.*insight\|Insight.*nav" renderer/index.html | head -10
   ```
2. Remove it from the sidebar/burger menu only. Keep it in the top nav.

### After all removals:
- Verify no broken references (functions calling removed elements)
- Verify no dead nav links
- Remaining sidebar items should shift up cleanly

---

## Fix 5: Move Capacity IQ to Top Navigation + Remove from Sidebar

**Problem:** Capacity IQ should be a top navigation tab, not a sidebar item.

**Approach:**
1. Find Capacity IQ in the sidebar:
   ```bash
   grep -n "capacityIQ.*nav\|capacity-iq.*nav\|sidebar.*capacity\|burger.*capacity\|CapacityIQ.*sidebar" renderer/index.html | head -10
   ```

2. **Remove from sidebar/burger menu.**

3. **Add to top navigation bar:**
   ```bash
   grep -n "top-nav\|topNav\|nav-bar.*top\|header-nav\|navigation-tabs" renderer/index.html | head -15
   ```
   Add a "Capacity IQ" button/tab alongside the other top nav items (Dashboard, Roadmap, Plans, etc.):
   ```html
   <button class="top-nav-item" data-page="capacityiq" onclick="showPage('capacityiq')">
     Capacity IQ
   </button>
   ```

4. Style consistently with other top nav items.

5. Verify the page still loads correctly when clicked from the new location.

---

## Fix 6: Capacity IQ Dashboard — Complete Overhaul

**Problem:** The Capacity IQ dashboard currently shows dummy heatmap content. It needs to be rebuilt as a real capacity intelligence dashboard.

**Approach:**

### Step 1: Remove Old Content
1. Find the current dashboard content:
   ```bash
   grep -n "capacity.*dashboard\|Capacity Dashboard\|heatmap\|Team X\|capacity.*heat" renderer/index.html | head -20
   ```
2. Remove: Heatmap placeholders, "Team X" print content, any placeholder/dummy data.

### Step 2: Build the New Dashboard
The dashboard should show real data pulled from:
- `currentData.sections[].rows[]` (initiatives/products)
- Plan tasks with hours and assignments
- Team member data with configured capacity
- To-Do items with time estimates

**Dashboard layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Capacity IQ Dashboard           [Weekly ▾] [Filter by Team ▾] │
│  ───────────────────────────────────────────────────────────    │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐│
│  │ Total Hours  │ │ Allocated    │ │ Available    │ │ Util%  ││
│  │ 320h/week    │ │ 280h/week    │ │ 40h/week     │ │ 87.5%  ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────┘│
│                                                                 │
│  ── Team Member Capacity ──────────────────────────────────    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Member       │ Team      │ Capacity │ Allocated │ Util%  │  │
│  │ Vela S.      │ Platform  │ 40h/wk   │ 35h       │ 87%   │  │
│  │ Krassi D.    │ Hardware  │ 40h/wk   │ 42h       │ 105%⚠ │  │
│  │ ...          │           │          │           │        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ── Initiative Capacity ───────────────────────────────────    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Initiative         │ Status  │ Hours │ Delivery │ Health │  │
│  │ Mobile App v2.0    │ Active  │ 120h  │ Jun 2026 │ 🟢    │  │
│  │ API Refactor       │ Active  │ 80h   │ May 2026 │ 🟡    │  │
│  │ Security Audit     │ Late    │ 45h   │ Overdue  │ 🔴    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  (health indicators are SVG dots, NOT emoji)                    │
│                                                                 │
│  ── Breakdown View ─── [Daily] [Weekly] [Monthly] [Quarterly]  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Bar chart / utilization breakdown by selected period     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Step 3: Implement Data Aggregation
```javascript
function getCapacityDashboardData(period) {
  // period: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'

  const data = {
    teamMembers: [],
    initiatives: [],
    summary: { totalCapacity: 0, totalAllocated: 0, utilization: 0 },
  };

  // 1. Team members and their capacity
  const teams = currentData.teams || [];
  const members = [];
  teams.forEach(team => {
    (team.members || []).forEach(member => {
      const weeklyHours = member.weeklyCapacity || currentData.settings?.defaultWeeklyHours || 40;
      const allocated = calculateMemberAllocatedHours(member.userId || member.email, period);

      members.push({
        name: member.name || member.email,
        team: team.name,
        weeklyCapacity: weeklyHours,
        allocated: allocated,
        utilization: weeklyHours > 0 ? Math.round((allocated / weeklyHours) * 100) : 0,
        isOverCapacity: allocated > weeklyHours,
      });

      data.summary.totalCapacity += weeklyHours;
      data.summary.totalAllocated += allocated;
    });
  });
  data.teamMembers = members;

  // 2. Initiatives with capacity data
  if (currentData.sections) {
    currentData.sections.forEach(section => {
      (section.rows || []).forEach(row => {
        const planHours = calculateInitiativeHours(row.id);
        const deliveryDate = estimateDeliveryDate(row.id);
        const isLate = deliveryDate && deliveryDate < new Date();
        const isOverCapacity = false; // calculate based on allocated vs available

        data.initiatives.push({
          name: row.name,
          status: row.status || 'Active',
          totalHours: planHours.total,
          completedHours: planHours.completed,
          remainingHours: planHours.remaining,
          expectedDelivery: deliveryDate,
          isLate: isLate,
          health: isLate ? 'red' : (planHours.remaining > planHours.total * 0.5 ? 'yellow' : 'green'),
          section: section.name,
        });
      });
    });
  }

  // Sort initiatives: late first, then by remaining hours desc
  data.initiatives.sort((a, b) => {
    if (a.isLate && !b.isLate) return -1;
    if (!a.isLate && b.isLate) return 1;
    return b.remainingHours - a.remainingHours;
  });

  // Summary
  data.summary.utilization = data.summary.totalCapacity > 0
    ? Math.round((data.summary.totalAllocated / data.summary.totalCapacity) * 100)
    : 0;

  return data;
}

function calculateMemberAllocatedHours(userId, period) {
  let hours = 0;
  // Sum hours from all plan tasks assigned to this user
  // Check plans, to-do items, etc.
  // Adjust by period (daily = weekly/5, monthly = weekly*4, etc.)
  return hours;
}

function calculateInitiativeHours(initiativeId) {
  let total = 0, completed = 0;
  // Find plans linked to this initiative
  // Sum task hours, split by status
  return { total, completed, remaining: total - completed };
}

function estimateDeliveryDate(initiativeId) {
  // Based on remaining hours and available capacity
  // Simple: remaining hours / (allocated hours per week) = weeks remaining
  // Delivery date = now + weeks remaining
  return null; // or calculated date
}
```

### Step 4: Personal Capacity Configuration
```javascript
// Allow each user to configure their own capacity
function renderMyCapacityConfig() {
  const settings = currentData.settings || {};
  return `
    <div class="capacity-config">
      <h3>My Capacity Settings</h3>
      <div class="form-group">
        <label>Hours per Week</label>
        <input type="number" id="my-weekly-hours"
               value="${settings.weeklyCapacity || 40}"
               onchange="saveMyCapacity(this.value)">
      </div>
      <div class="form-group">
        <label>My Team</label>
        <select id="my-team" onchange="saveMyTeam(this.value)">
          <option value="">Select team...</option>
          ${(currentData.teams || []).map(t =>
            `<option value="${t.id}" ${settings.myTeamId === t.id ? 'selected' : ''}>${t.name}</option>`
          ).join('')}
        </select>
      </div>
    </div>
  `;
}

function saveMyCapacity(hours) {
  if (!currentData.settings) currentData.settings = {};
  currentData.settings.weeklyCapacity = parseInt(hours) || 40;
  saveData();
}
```

### Step 5: Period Switching (Daily/Weekly/Monthly/Quarterly/Yearly)
```javascript
function switchCapacityPeriod(period) {
  const data = getCapacityDashboardData(period);
  renderCapacityDashboard(data, period);

  // Update active button
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.period-btn[data-period="${period}"]`)?.classList.add('active');
}
```

### Step 6: Ensure dark mode, no emoji (health indicators are colored SVG circles, not emoji).

---

## Fix 7: Reports Dashboard — Add Monthly Capacity View

**Problem:** The reports/strategy dashboard only shows a weekly capacity view. Need a monthly view with per-user breakdown showing who's working on what, their time allocation, etc.

**Approach:**
1. Find the reports dashboard:
   ```bash
   grep -n "report.*dashboard\|strategy.*dashboard\|Report.*page\|weekly.*capacity\|capacity.*report" renderer/index.html | head -20
   ```

2. **Add period toggle** (if not already present from Fix 6):
   - Weekly (existing)
   - Monthly (new)
   - Quarterly (new)

3. **Monthly capacity view:**
   ```javascript
   function renderMonthlyCapacityReport() {
     const teams = currentData.teams || [];
     const plans = getAllPlans(); // however plans are stored

     let html = '<div class="monthly-capacity-report">';
     html += '<h3>Monthly Capacity Overview</h3>';

     // For each team member
     teams.forEach(team => {
       html += `<div class="team-capacity-section">`;
       html += `<h4>${team.name}</h4>`;
       html += `<table class="capacity-table">`;
       html += `<thead><tr>
         <th>Member</th><th>Weekly Hours</th><th>Monthly Hours</th>
         <th>Products/Plans</th><th>Allocated</th><th>Available</th><th>Utilization</th>
       </tr></thead><tbody>`;

       (team.members || []).forEach(member => {
         const weeklyHours = member.weeklyCapacity || 40;
         const monthlyHours = weeklyHours * 4;
         const allocated = calculateMemberMonthlyAllocated(member);
         const available = monthlyHours - allocated;
         const utilization = monthlyHours > 0 ? Math.round((allocated / monthlyHours) * 100) : 0;

         // Find what products/plans this member is working on
         const assignedPlans = findMemberAssignedPlans(member.userId || member.email);

         html += `<tr>
           <td>${member.name || member.email}</td>
           <td>${weeklyHours}h</td>
           <td>${monthlyHours}h</td>
           <td>${assignedPlans.map(p => `<span class="plan-tag">${p.name}</span>`).join(' ')}</td>
           <td>${allocated}h</td>
           <td class="${available < 0 ? 'over-capacity' : ''}">${available}h</td>
           <td class="${utilization > 100 ? 'over-capacity' : ''}">${utilization}%</td>
         </tr>`;
       });

       html += '</tbody></table></div>';
     });

     html += '</div>';
     return html;
   }
   ```

4. Ensure dark mode support for all table elements.

---

## Fix 8: Help / Support Widget — Bottom-Right Button

**Problem:** Need a floating help button in the bottom-right corner that lets users request help, log a ticket, request a feature, or contact the Roadmap OS team.

**Approach:**
1. **Create a floating action button (FAB):**
   ```html
   <div id="help-widget" class="help-fab">
     <button onclick="toggleHelpWidget()" class="help-fab-button" title="Help & Support">
       <svg viewBox="0 0 24 24" width="24" height="24" stroke="white"
            stroke-width="2" fill="none">
         <circle cx="12" cy="12" r="10"/>
         <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
         <line x1="12" y1="17" x2="12.01" y2="17"/>
       </svg>
     </button>

     <div id="help-panel" class="help-panel" style="display:none;">
       <div class="help-panel-header">
         <h3>How can we help?</h3>
         <button onclick="toggleHelpWidget()" class="close-btn">&times;</button>
       </div>
       <div class="help-panel-body">
         <button onclick="openHelpForm('bug')" class="help-option">
           <span class="help-icon">
             <svg viewBox="0 0 20 20" width="20" height="20" stroke="currentColor"
                  stroke-width="1.5" fill="none">
               <circle cx="10" cy="10" r="8"/>
               <line x1="10" y1="6" x2="10" y2="10"/>
               <line x1="10" y1="13" x2="10.01" y2="13"/>
             </svg>
           </span>
           <span>Report a Bug</span>
         </button>
         <button onclick="openHelpForm('feature')" class="help-option">
           <span class="help-icon">
             <svg viewBox="0 0 20 20" width="20" height="20" stroke="currentColor"
                  stroke-width="1.5" fill="none">
               <polygon points="10,2 13,8 19,8 14,12 16,18 10,14 4,18 6,12 1,8 7,8"/>
             </svg>
           </span>
           <span>Request a Feature</span>
         </button>
         <button onclick="openHelpForm('help')" class="help-option">
           <span class="help-icon">
             <svg viewBox="0 0 20 20" width="20" height="20" stroke="currentColor"
                  stroke-width="1.5" fill="none">
               <path d="M18 10c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8"/>
               <path d="M8 8a2 2 0 1 1 4 0c0 1-2 1.5-2 3"/>
               <line x1="10" y1="14" x2="10.01" y2="14"/>
             </svg>
           </span>
           <span>Get Help</span>
         </button>
         <button onclick="openHelpForm('ticket')" class="help-option">
           <span class="help-icon">
             <svg viewBox="0 0 20 20" width="20" height="20" stroke="currentColor"
                  stroke-width="1.5" fill="none">
               <rect x="3" y="3" width="14" height="14" rx="2"/>
               <line x1="7" y1="7" x2="13" y2="7"/>
               <line x1="7" y1="10" x2="13" y2="10"/>
               <line x1="7" y1="13" x2="10" y2="13"/>
             </svg>
           </span>
           <span>Log a Ticket</span>
         </button>
       </div>
     </div>
   </div>
   ```

2. **Help form (opens inline in the panel):**
   ```javascript
   function openHelpForm(type) {
     const typeLabels = {
       bug: 'Report a Bug',
       feature: 'Request a Feature',
       help: 'Get Help',
       ticket: 'Log a Ticket',
     };

     const panel = document.getElementById('help-panel');
     panel.querySelector('.help-panel-body').innerHTML = `
       <div class="help-form">
         <h4>${typeLabels[type]}</h4>
         <div class="form-group">
           <label>Subject</label>
           <input type="text" id="help-subject" placeholder="Brief summary">
         </div>
         <div class="form-group">
           <label>Description</label>
           <textarea id="help-description" rows="4"
                     placeholder="Describe the issue or request..."></textarea>
         </div>
         <div class="form-group">
           <label>Priority</label>
           <select id="help-priority">
             <option value="low">Low</option>
             <option value="medium" selected>Medium</option>
             <option value="high">High</option>
           </select>
         </div>
         <button onclick="submitHelpRequest('${type}')" class="btn-primary">Submit</button>
         <button onclick="showHelpOptions()" class="btn-secondary">Back</button>
       </div>
     `;
   }

   async function submitHelpRequest(type) {
     const subject = document.getElementById('help-subject').value.trim();
     const description = document.getElementById('help-description').value.trim();
     const priority = document.getElementById('help-priority').value;

     if (!subject) { showToast('Enter a subject', 'warning'); return; }

     // Route to email
     const emailBody = encodeURIComponent(
       `Type: ${type}\nPriority: ${priority}\nUser: ${getUserEmail()}\n\n${description}`
     );
     const mailtoLink = `mailto:support@pmroadmapper.com?subject=${encodeURIComponent('[Roadmap OS] ' + subject)}&body=${emailBody}`;

     // Also save to feedback items if the edge function exists
     try {
       await submitFeedbackItem({
         type: type,
         title: subject,
         description: description,
         priority: priority,
         email: getUserEmail(),
       });
     } catch (e) {
       console.log('Feedback submission to server failed, opening email instead');
     }

     // Open email as fallback
     window.open(mailtoLink, '_blank');

     showToast('Request submitted! We\'ll get back to you soon.', 'success');
     showHelpOptions(); // reset the panel
   }
   ```

3. **CSS for the floating widget:**
   ```css
   .help-fab {
     position: fixed;
     bottom: 24px; right: 24px;
     z-index: 9999;
   }
   .help-fab-button {
     width: 56px; height: 56px;
     border-radius: 50%;
     background: var(--accent-primary, #3b82f6);
     border: none;
     box-shadow: 0 4px 16px rgba(59,130,246,0.4);
     cursor: pointer;
     display: flex; align-items: center; justify-content: center;
     transition: transform 0.2s, box-shadow 0.2s;
   }
   .help-fab-button:hover {
     transform: scale(1.1);
     box-shadow: 0 6px 20px rgba(59,130,246,0.5);
   }
   .help-panel {
     position: absolute;
     bottom: 72px; right: 0;
     width: 320px;
     background: var(--bg-card);
     border: 1px solid var(--border-primary);
     border-radius: 16px;
     box-shadow: 0 12px 40px rgba(0,0,0,0.2);
     overflow: hidden;
   }
   .help-panel-header {
     padding: 16px 20px;
     display: flex; justify-content: space-between; align-items: center;
     border-bottom: 1px solid var(--border-primary);
   }
   .help-option {
     display: flex; align-items: center; gap: 12px;
     width: 100%; padding: 14px 20px;
     border: none; background: none;
     color: var(--text-primary);
     cursor: pointer; font-size: 14px;
     text-align: left;
   }
   .help-option:hover { background: var(--bg-hover); }
   ```

---

## Fix 9: Feedback Submission Page — Branding + Attachments + Free Trial CTA

**Problem:** The public feedback submission page has no logo, no Roadmap OS branding, no ability to add attachments, a generic favicon, and no "Start your 30-day free trial" CTA.

**Approach:**
1. Find the feedback submission page:
   ```bash
   grep -n "feedback-submit\|feedback.*form\|Submit.*Feedback\|feedback.*public" renderer/index.html | head -15
   # Also check for a standalone page:
   ls web/static/ | grep -i feedback
   ```

2. **Brand the page:**
   - Add the Roadmap OS logo at the top (SVG version for inline rendering)
   - Use the app's color scheme and typography
   - Match the overall UI style of the app

3. **Add Roadmap OS logo as SVG** (create a simple text-based logo if no SVG exists):
   ```html
   <div class="feedback-page-header">
     <div class="feedback-logo">
       <!-- Roadmap OS logo SVG -->
       <svg viewBox="0 0 200 40" width="200" height="40">
         <text x="0" y="28" font-family="Inter, system-ui, sans-serif"
               font-size="24" font-weight="700" fill="var(--accent-primary)">
           Roadmap OS
         </text>
       </svg>
     </div>
     <h1>Share Your Feedback</h1>
     <p>Help us build a better product for you.</p>
   </div>
   ```

4. **Add attachment support:**
   ```html
   <div class="form-group">
     <label>Attachments (optional)</label>
     <div class="attachment-upload">
       <input type="file" id="feedback-attachment" multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx">
       <label for="feedback-attachment" class="attachment-label">
         <svg viewBox="0 0 20 20" width="18" height="18" stroke="currentColor"
              stroke-width="1.5" fill="none">
           <path d="M15 7l-5 5-2-2"/>
           <rect x="3" y="3" width="14" height="14" rx="2"/>
         </svg>
         Attach files (images, PDFs, documents)
       </label>
       <div id="feedback-attachment-list"></div>
     </div>
   </div>
   ```

5. **Favicon:**
   - Check if a Roadmap OS favicon exists:
     ```bash
     find . -name "favicon*" -o -name "*.ico" | head -10
     ```
   - If it exists but isn't being used on the feedback page, add the `<link rel="icon">` tag
   - If it doesn't exist, create a simple SVG favicon:
     ```html
     <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%233b82f6'/><text x='16' y='22' text-anchor='middle' font-size='18' font-weight='700' fill='white'>R</text></svg>">
     ```

6. **"Start your 30-day free trial" CTA:**
   ```html
   <div class="feedback-footer">
     <p class="powered-by">Powered by Roadmap OS</p>
     <a href="https://pmroadmapper.com/signup" class="trial-cta">
       Start your 30-day free trial →
     </a>
   </div>
   ```
   Style the CTA as a prominent link or button, matching the brand colors.

7. **Dark mode support** on the feedback page.

---

## Post-Fix Checklist

1. **Task Library count:** Verify `currentData.taskLibrary.length` is significantly more than 173 — all template tasks should be synced.
2. **Today line:** On the roadmap, the red line sits on today's actual date, not far left.
3. **Burger menu:** On web, clicking a page closes the sidebar automatically.
4. **Removed pages:** UCR, Task Reference, Sprints, Initiatives (from CapacityIQ) are all gone. Export to Word removed from Timesheet.
5. **Nav cleanup:** To-Do and Insights removed from sidebar (still in top nav). Capacity IQ in top nav (not sidebar).
6. **Capacity IQ dashboard:** Shows real member/team/initiative data with period switching.
7. **Reports:** Monthly capacity view available alongside weekly.
8. **Help widget:** Floating button in bottom-right with bug/feature/help/ticket options.
9. **Feedback page:** Branded with logo, favicon, attachments, free trial CTA.
10. **Dark mode:** All new elements use CSS variables.
11. **Emoji sweep:** `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` — must be 0.
12. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
13. **Bump version** in `package.json`
14. **Rebuild web:** `cd web && npm run build`
15. **Commit:** `git add -A && git commit -m "vX.Y.Z: v8 — task library sync, capacity dashboard, help widget, nav cleanup, today line fix"`
16. **Update FIX_LOG_V8.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V8.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix.** Re-read changes, check syntax, verify both light and dark mode.
4. **If a fix is blocked**, implement what you can, add `// TODO:` comments, log it, move on.
5. **Preserve existing patterns.** Match the codebase style.
6. **Both modes matter.** Every element uses CSS variables.
7. **Keep the single-file SPA pattern.** All UI changes in `renderer/index.html`.
8. **Zero emoji.** Health indicators use colored SVG dots (`<circle>`) not emoji.
9. **Fix 1 (task library sync) should run on app startup** — add `syncTemplateTasksToLibrary()` to the init flow.
10. **Fix 4 removals are surgical.** Remove the UI but don't delete user data from the JSONB blob — users may have saved data in those modules.
11. **Fix 6 (Capacity IQ dashboard) is the heaviest.** Build real data aggregation, not placeholders. Pull from plans, teams, initiatives, to-do items.
