# Roadmap OS — Autonomous Fix Queue v12

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V12.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/`
- Email sending: Resend (via `send-invite` edge function)
- Data stored as one JSONB blob per user in `roadmap_data` table
- Templates: `currentData.templateLibrary` via `getAllTemplates()`
- Task Library: `currentData.taskLibrary`
- Teams: `currentData.teams[]`
- Dark mode: CSS variables. ZERO emoji — SVG icons only.

**Before starting:**
1. `grep -n "Select All\|selectAll\|select-all\|toggleSelectAll\|Go to market\|GoToMarket\|g2m.*tab\|From Task Library" renderer/index.html | head -30`
2. `grep -n "eight hours\|8 hours\|one working day\|hours.*description\|hours.*tooltip\|hours.*help" renderer/index.html | head -15`
3. `grep -n "timeline.*view\|gantt.*view\|timeline.*pill\|timeline.*bar\|timeline.*row\|filter.*timeline\|timeline.*filter" renderer/index.html | head -30`
4. `grep -n "editTeam\|edit-team\|Edit Team\|team.*modal\|Current members\|No members\|team.*logo\|team.*image" renderer/index.html | head -30`
5. `grep -n "send.*invite\|sendInvite\|invite.*email\|Resend\|resend\|invite.*error\|email.*could.*not" renderer/index.html | head -20`
6. `grep -n "capacity.*template\|ciq.*template\|CapacityIQ.*template\|getAllTemplates\|getDefaultTemplates" renderer/index.html | head -20`
7. `grep -n "portfolio.*overview\|Portfolio Overview\|portfolioOverview\|portfolio-overview" renderer/index.html | head -10`
8. Log all findings in `FIX_LOG_V12.md`

---

## Fix 1: Select All Buttons — Add Task to Plan (G2M Tab + Task Library Tab + Planning Page)

**Problem:** Three places need "Select All" buttons:
1. The "Go to Market" tab inside the "Add Tasks to Plan" modal
2. The "From Task Library" tab inside the "Add Tasks to Plan" modal
3. The Planning page itself (ability to select all tasks in the plan view)

**Approach:**

### Part A: G2M Tab — Select All
1. Find the G2M tab inside the Add Tasks modal:
   ```bash
   grep -n "go.to.market\|GoToMarket\|g2m.*tab\|gtm.*tab\|checklist.*tab" renderer/index.html | grep -i "add.*task\|modal\|tab" | head -15
   ```

2. Add a Select All bar at the top of the G2M task list:
   ```javascript
   function renderG2MTabSelectAll(containerId, tasks) {
     return `
       <div class="select-all-bar">
         <label class="select-all-label">
           <input type="checkbox" id="${containerId}-select-all"
                  onchange="toggleAllCheckboxes('${containerId}', this.checked)">
           <span>Select All (${tasks.length})</span>
         </label>
         <span class="selected-count" id="${containerId}-selected-count">0 selected</span>
       </div>
     `;
   }
   ```

3. Implement the toggle function (reusable across all three locations):
   ```javascript
   function toggleAllCheckboxes(containerId, checked) {
     const container = document.getElementById(containerId);
     if (!container) return;

     const checkboxes = container.querySelectorAll('input[type="checkbox"].task-cb');
     checkboxes.forEach(cb => {
       if (cb.id && cb.id.endsWith('-select-all')) return; // skip the select-all checkbox itself
       cb.checked = checked;
     });
     updateSelectionCount(containerId);
   }

   function updateSelectionCount(containerId) {
     const container = document.getElementById(containerId);
     if (!container) return;

     const total = container.querySelectorAll('input[type="checkbox"].task-cb').length;
     const checked = container.querySelectorAll('input[type="checkbox"].task-cb:checked').length;
     const countEl = document.getElementById(`${containerId}-selected-count`);
     if (countEl) countEl.textContent = `${checked} of ${total} selected`;

     // Update the select-all checkbox state
     const selectAllCb = document.getElementById(`${containerId}-select-all`);
     if (selectAllCb) {
       selectAllCb.checked = checked === total && total > 0;
       selectAllCb.indeterminate = checked > 0 && checked < total;
     }
   }
   ```

4. Ensure every individual task checkbox calls `updateSelectionCount(containerId)` on change.

### Part B: Task Library Tab — Select All
1. Find the Task Library tab inside Add Tasks modal:
   ```bash
   grep -n "task.*library.*tab\|From Task Library\|from-task-library\|taskLibrary.*tab" renderer/index.html | head -15
   ```

2. Add the same Select All bar pattern at the top of the task library list.
3. Also add **category-level Select All** — each category group has its own checkbox:
   ```javascript
   function renderCategorySelectAll(category, taskCount) {
     return `
       <div class="category-select-header">
         <label>
           <input type="checkbox" class="category-select-all"
                  data-category="${category}"
                  onchange="toggleCategoryTasks('${category}', this.checked)">
           <strong>${escapeHtml(category)}</strong> (${taskCount})
         </label>
       </div>
     `;
   }

   function toggleCategoryTasks(category, checked) {
     const tasks = document.querySelectorAll(`.task-cb[data-category="${category}"]`);
     tasks.forEach(cb => { cb.checked = checked; });
     // Update the parent container's count
     const container = document.querySelector('.task-library-list')?.closest('[id]');
     if (container) updateSelectionCount(container.id);
   }
   ```

### Part C: Planning Page — Select All Tasks
1. Find the plan task list rendering on the Planning page:
   ```bash
   grep -n "plan.*task.*list\|renderPlanTasks\|plan-tasks\|planTaskList\|task-row.*plan" renderer/index.html | head -15
   ```

2. Add a toolbar-level Select All above the task list:
   ```html
   <div class="plan-bulk-actions" id="plan-bulk-actions" style="display:none;">
     <label class="select-all-label">
       <input type="checkbox" id="plan-select-all"
              onchange="toggleAllPlanTasks(this.checked)">
       Select All
     </label>
     <span id="plan-selected-count">0 selected</span>
     <div class="bulk-buttons">
       <button onclick="bulkDeletePlanTasks()" class="btn-sm btn-danger-subtle">Delete Selected</button>
       <button onclick="bulkMovePlanTasks()" class="btn-sm btn-outline">Move to...</button>
       <button onclick="bulkStatusChange()" class="btn-sm btn-outline">Change Status</button>
     </div>
   </div>
   ```

3. Add checkboxes to each plan task row:
   ```javascript
   // In the plan task rendering function, add a checkbox at the start of each row:
   `<input type="checkbox" class="plan-task-cb" data-task-id="${task.id}"
          onchange="onPlanTaskSelect()">`
   ```

4. Show/hide the bulk actions bar based on whether any task is selected:
   ```javascript
   function onPlanTaskSelect() {
     const checked = document.querySelectorAll('.plan-task-cb:checked').length;
     const bulkBar = document.getElementById('plan-bulk-actions');
     if (bulkBar) bulkBar.style.display = checked > 0 ? 'flex' : 'none';

     const countEl = document.getElementById('plan-selected-count');
     if (countEl) countEl.textContent = `${checked} selected`;
   }

   function toggleAllPlanTasks(checked) {
     document.querySelectorAll('.plan-task-cb').forEach(cb => { cb.checked = checked; });
     onPlanTaskSelect();
   }

   function bulkDeletePlanTasks() {
     const ids = Array.from(document.querySelectorAll('.plan-task-cb:checked'))
       .map(cb => cb.dataset.taskId);
     if (ids.length === 0) return;
     if (!confirm(`Delete ${ids.length} tasks?`)) return;

     const plan = getCurrentPlan();
     if (plan) {
       plan.tasks = plan.tasks.filter(t => !ids.includes(t.id));
       saveData();
       renderPlan();
       showToast(`${ids.length} tasks deleted`, 'success');
     }
   }
   ```

---

## Fix 2: Edit Task — Hours Description → Tooltip

**Problem:** The edit task modal has a long text description under the hours field that says "8 hours equal one working day" with additional explanation text. This pushes the form too far down. Replace it with a small question mark icon that shows a tooltip on hover.

**Approach:**
1. Find the hours description text:
   ```bash
   grep -n "eight hours\|8 hours\|one working day\|hours.*equal\|hours.*description\|working.*day" renderer/index.html | head -10
   ```

2. **Replace the inline description** with a tooltip icon:
   ```html
   <!-- BEFORE (remove this): -->
   <!-- <p class="form-hint">8 hours equal one working day. ...</p> -->

   <!-- AFTER: -->
   <div class="form-group">
     <label>
       Hours
       <span class="tooltip-trigger" data-tooltip="8 hours = 1 working day. Enter the estimated effort in hours. This is used for capacity planning and timeline calculations.">
         <svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" stroke-width="1.5" fill="none" style="vertical-align: middle; opacity: 0.5; cursor: help;">
           <circle cx="8" cy="8" r="7"/>
           <path d="M6 6a2 2 0 1 1 2.5 1.94c-.47.2-.5.5-.5.81V10"/>
           <circle cx="8" cy="12" r="0.5" fill="currentColor"/>
         </svg>
       </span>
     </label>
     <input type="number" id="edit-task-hours" value="${task.hours || 0}" min="0" step="0.5">
   </div>
   ```

3. **Tooltip CSS:**
   ```css
   .tooltip-trigger {
     position: relative;
     display: inline-flex;
     align-items: center;
   }
   .tooltip-trigger::after {
     content: attr(data-tooltip);
     position: absolute;
     bottom: calc(100% + 8px);
     left: 50%;
     transform: translateX(-50%);
     background: var(--bg-card);
     color: var(--text-primary);
     border: 1px solid var(--border-primary);
     border-radius: 8px;
     padding: 8px 12px;
     font-size: 12px;
     font-weight: 400;
     line-height: 1.4;
     white-space: normal;
     width: 240px;
     box-shadow: 0 4px 12px rgba(0,0,0,0.15);
     opacity: 0;
     pointer-events: none;
     transition: opacity 0.2s;
     z-index: 1000;
   }
   .tooltip-trigger:hover::after {
     opacity: 1;
   }
   .dark-mode .tooltip-trigger::after {
     background: var(--bg-tertiary);
     border-color: var(--border-primary);
   }
   ```

4. **Apply this tooltip pattern** to any other form field that has long inline help text — convert them all to tooltip icons.

---

## Fix 3: Timeline View — Date/Pill Sync Fix + Filters + Scroller

**Problem:** Three issues on the timeline/Gantt view of the Plans page:
1. When editing a task's date, the pill/bar on the timeline view doesn't update its visual width/position to match the new date range (but the Gantt view does update)
2. The Filters button on the timeline view doesn't work
3. No horizontal scroller at the bottom of the timeline view

### Part A: Timeline Pill Sync
1. Find the timeline rendering:
   ```bash
   grep -n "timeline.*render\|renderTimeline\|drawTimeline\|timeline.*pill\|timeline.*bar\|task.*bar\|gantt.*bar" renderer/index.html | head -20
   ```

2. **Diagnose:** There are likely two separate views being rendered:
   - A list/table view with task names and details
   - A Gantt/timeline view with visual bars

   When a task's dates are edited, the Gantt view recalculates bar widths, but the list view's inline date pill/badge doesn't update.

3. **Fix:** After any task date edit, call the full re-render:
   ```javascript
   function onTaskDateChanged(taskId, newStartDate, newEndDate) {
     const task = findTaskInPlan(taskId);
     if (!task) return;

     task.startDate = newStartDate;
     task.endDate = newEndDate;
     task.updatedAt = new Date().toISOString();

     saveData();

     // Re-render BOTH views
     renderPlanTimeline();    // Gantt bars
     renderPlanTaskList();    // List/table rows with date badges

     // Also update any linked roadmap initiative dates if needed
     if (task.linkedInitiative) {
       updateInitiativeDates(task.linkedInitiative);
     }
   }
   ```

4. **Also check** if the bar width calculation is correct:
   ```javascript
   function calculateBarWidth(startDate, endDate, timelineStart, timelineEnd) {
     const totalDays = daysBetween(timelineStart, timelineEnd);
     const startOffset = daysBetween(timelineStart, new Date(startDate));
     const duration = daysBetween(new Date(startDate), new Date(endDate));

     if (totalDays <= 0) return { left: '0%', width: '0%' };

     const leftPercent = (startOffset / totalDays) * 100;
     const widthPercent = (duration / totalDays) * 100;

     return {
       left: `${Math.max(0, leftPercent)}%`,
       width: `${Math.min(100 - leftPercent, Math.max(1, widthPercent))}%`,
     };
   }

   function daysBetween(date1, date2) {
     return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
   }
   ```

### Part B: Filters on Timeline View
1. Find the filter button:
   ```bash
   grep -n "filter.*timeline\|timeline.*filter\|Filter.*btn\|filterBtn\|planFilter" renderer/index.html | head -15
   ```

2. **If the button exists but isn't wired up, wire it:**
   ```javascript
   function openTimelineFilters() {
     const modal = createModal('Filter Timeline');
     modal.innerHTML = `
       <div class="filter-form" style="max-width:400px; margin:0 auto;">
         <div class="form-group">
           <label>Status</label>
           <div class="filter-checkboxes">
             <label><input type="checkbox" class="filter-status" value="Not Started" checked> Not Started</label>
             <label><input type="checkbox" class="filter-status" value="In Progress" checked> In Progress</label>
             <label><input type="checkbox" class="filter-status" value="Complete" checked> Complete</label>
             <label><input type="checkbox" class="filter-status" value="Blocked" checked> Blocked</label>
           </div>
         </div>
         <div class="form-group">
           <label>Priority</label>
           <div class="filter-checkboxes">
             <label><input type="checkbox" class="filter-priority" value="High" checked> High</label>
             <label><input type="checkbox" class="filter-priority" value="Medium" checked> Medium</label>
             <label><input type="checkbox" class="filter-priority" value="Low" checked> Low</label>
           </div>
         </div>
         <div class="form-group">
           <label>Owner</label>
           <select id="filter-owner">
             <option value="">All owners</option>
             ${getUniqueOwners().map(o => `<option value="${o}">${escapeHtml(o)}</option>`).join('')}
           </select>
         </div>
         <div class="form-group">
           <label>Phase</label>
           <select id="filter-phase">
             <option value="">All phases</option>
             ${getUniquePhases().map(p => `<option value="${p}">${escapeHtml(p)}</option>`).join('')}
           </select>
         </div>
         <div class="form-actions">
           <button onclick="applyTimelineFilters()" class="btn-primary">Apply</button>
           <button onclick="clearTimelineFilters()" class="btn-outline">Clear All</button>
           <button onclick="closeModal()" class="btn-secondary">Cancel</button>
         </div>
       </div>
     `;
     showModal(modal);
   }

   function applyTimelineFilters() {
     const statusFilters = Array.from(document.querySelectorAll('.filter-status:checked')).map(cb => cb.value);
     const priorityFilters = Array.from(document.querySelectorAll('.filter-priority:checked')).map(cb => cb.value);
     const ownerFilter = document.getElementById('filter-owner').value;
     const phaseFilter = document.getElementById('filter-phase').value;

     // Apply to timeline rows
     document.querySelectorAll('.timeline-task-row, .gantt-row, [data-task-id]').forEach(row => {
       const status = row.dataset.status || '';
       const priority = row.dataset.priority || '';
       const owner = row.dataset.owner || '';
       const phase = row.dataset.phase || '';

       const show = statusFilters.includes(status) &&
                    priorityFilters.includes(priority) &&
                    (!ownerFilter || owner === ownerFilter) &&
                    (!phaseFilter || phase === phaseFilter);

       row.style.display = show ? '' : 'none';
     });

     closeModal();
     showToast('Filters applied', 'info');
   }

   function clearTimelineFilters() {
     document.querySelectorAll('.timeline-task-row, .gantt-row, [data-task-id]').forEach(row => {
       row.style.display = '';
     });
     closeModal();
     showToast('Filters cleared', 'info');
   }
   ```

3. **Ensure each timeline row has `data-` attributes** for filtering:
   ```html
   <div class="timeline-task-row" data-task-id="${task.id}"
        data-status="${task.status}" data-priority="${task.priority}"
        data-owner="${task.owner || ''}" data-phase="${task.phase || ''}">
   ```

### Part C: Horizontal Scroller on Timeline
1. Find the timeline container:
   ```bash
   grep -n "timeline.*container\|gantt.*container\|timeline.*wrapper\|timeline.*scroll" renderer/index.html | head -10
   ```

2. **Add `overflow-x: auto` to the timeline container:**
   ```css
   .timeline-container,
   .gantt-container,
   .plan-timeline-view {
     overflow-x: auto;
     overflow-y: visible;
     -webkit-overflow-scrolling: touch;
     scrollbar-width: thin;
     scrollbar-color: var(--text-muted) transparent;
   }

   /* Custom scrollbar for webkit browsers */
   .timeline-container::-webkit-scrollbar,
   .gantt-container::-webkit-scrollbar {
     height: 8px;
   }
   .timeline-container::-webkit-scrollbar-thumb,
   .gantt-container::-webkit-scrollbar-thumb {
     background: var(--text-muted);
     border-radius: 4px;
   }
   .timeline-container::-webkit-scrollbar-track,
   .gantt-container::-webkit-scrollbar-track {
     background: transparent;
   }
   ```

3. **Ensure the inner content has a minimum width** that exceeds the container so scrolling activates:
   ```css
   .timeline-content,
   .gantt-content {
     min-width: 1200px; /* or wider based on the number of time columns */
   }
   ```

---

## Fix 4: Edit Team — Add Members from Organisation Dropdown

**Problem:** Under "Current Members" it says "No members yet" but there's no way to add members from your organisation. Need a dropdown of all org users. Also one member can belong to multiple teams.

**Approach:**
1. Find the edit team members section:
   ```bash
   grep -n "Current members\|No members\|team.*member.*list\|editTeam.*member\|add.*member.*team" renderer/index.html | head -15
   ```

2. **Add a member dropdown** below the "Current members" / "No members yet" text:
   ```javascript
   function renderTeamMemberSection(teamId) {
     const team = (currentData.teams || []).find(t => t.id === teamId);
     const members = team?.members || [];

     // Get all users in the org who are NOT already in THIS team
     // (but they CAN be in other teams — multi-team membership allowed)
     const allUsers = getAllOrgUsers();
     const teamEmails = new Set(members.map(m => m.email));
     const availableUsers = allUsers.filter(u => !teamEmails.has(u.email));

     let html = '<div class="team-members-section">';
     html += '<h4>Team Members</h4>';

     if (members.length > 0) {
       html += '<div class="current-members-list">';
       members.forEach(member => {
         html += `
           <div class="member-row">
             <span class="member-name">${escapeHtml(member.name || member.email)}</span>
             <select class="member-role-select"
                     onchange="updateTeamMemberRole('${teamId}', '${member.email}', this.value)">
               <option value="member" ${member.role_in_team === 'member' ? 'selected' : ''}>Member</option>
               <option value="lead" ${member.role_in_team === 'lead' ? 'selected' : ''}>Lead</option>
             </select>
             <button onclick="removeTeamMember('${teamId}', '${member.email}')"
                     class="btn-icon-sm btn-danger-subtle" title="Remove">
               <svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" stroke-width="1.5" fill="none">
                 <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
               </svg>
             </button>
           </div>
         `;
       });
       html += '</div>';
     } else {
       html += '<p class="empty-text">No members yet. Add members from your organisation below.</p>';
     }

     // Add member dropdown
     html += `
       <div class="add-member-control" style="margin-top:12px;">
         <label>Add from Organisation</label>
         <div style="display:flex; gap:8px;">
           <select id="add-member-select-${teamId}" style="flex:1;">
             <option value="">Select a user...</option>
             ${availableUsers.map(u => `
               <option value="${u.email}">${escapeHtml(u.name || u.email)}</option>
             `).join('')}
           </select>
           <button onclick="addMemberFromDropdown('${teamId}')" class="btn-sm btn-primary">Add</button>
         </div>
       </div>
     `;

     html += '</div>';
     return html;
   }

   function getAllOrgUsers() {
     const users = [];
     const seen = new Set();

     // Current user
     const currentEmail = getCurrentUserEmail();
     if (!seen.has(currentEmail)) {
       users.push({ name: getCurrentUserName(), email: currentEmail });
       seen.add(currentEmail);
     }

     // From contacts
     (currentData.contacts || []).forEach(c => {
       if (!seen.has(c.email)) {
         users.push({ name: c.name || c.email, email: c.email });
         seen.add(c.email);
       }
     });

     // From all teams (members can be in multiple teams)
     (currentData.teams || []).forEach(t => {
       (t.members || []).forEach(m => {
         if (!seen.has(m.email)) {
           users.push({ name: m.name || m.email, email: m.email });
           seen.add(m.email);
         }
       });
     });

     // From plan task assignments
     // ... iterate plans and extract unique assignees

     return users.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
   }

   function addMemberFromDropdown(teamId) {
     const select = document.getElementById(`add-member-select-${teamId}`);
     const email = select?.value;
     if (!email) { showToast('Select a user to add', 'warning'); return; }

     const team = (currentData.teams || []).find(t => t.id === teamId);
     if (!team) return;
     if (!team.members) team.members = [];

     // Check for duplicates
     if (team.members.some(m => m.email === email)) {
       showToast('This user is already in the team', 'warning');
       return;
     }

     const userInfo = getAllOrgUsers().find(u => u.email === email);
     team.members.push({
       email: email,
       name: userInfo?.name || email.split('@')[0],
       role_in_team: 'member',
       addedAt: new Date().toISOString(),
     });

     saveData();
     // Re-render the edit team modal to show updated member list
     openEditTeam(teamId);
     showToast(`${userInfo?.name || email} added to ${team.name}`, 'success');
   }
   ```

3. **One member can belong to multiple teams** — the code above already handles this by only filtering members of THIS specific team, not globally.

---

## Fix 5: Team Invite Email — Fix Resend Error + Branded Email Template

**Problem:** When trying to invite a user by email, the error "Invite saved but email could not be sent (check Resend config)" appears. The email should be branded with Roadmap OS design and include a signup/login link.

### Part A: Diagnose and Fix the Email Send Error
1. Find the invite email function:
   ```bash
   grep -n "sendInvite\|send-invite\|inviteEmail\|sendEmail\|resend\|Resend" renderer/index.html | head -15
   ```

2. Find the edge function:
   ```bash
   cat supabase/functions/send-invite/index.ts
   ```

3. **Common causes of "check Resend config":**
   - `RESEND_API_KEY` Supabase secret is not set or expired
   - The `from` email address is not verified in Resend
   - The edge function has a try/catch that swallows the actual error

4. **Fix the edge function** to return the actual error:
   ```typescript
   // In send-invite/index.ts, ensure the error message is specific:
   try {
     const resendApiKey = Deno.env.get('RESEND_API_KEY');
     if (!resendApiKey) {
       throw new Error('RESEND_API_KEY not configured in Supabase secrets');
     }

     const response = await fetch('https://api.resend.com/emails', {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${resendApiKey}`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         from: 'Roadmap OS <noreply@pmroadmapper.com>',  // Must be verified in Resend
         to: [recipientEmail],
         subject: subject,
         html: emailHtml,
       }),
     });

     if (!response.ok) {
       const errData = await response.json();
       throw new Error(`Resend API error: ${errData.message || response.status}`);
     }

     return new Response(JSON.stringify({ success: true }), { ... });
   } catch (err) {
     console.error('Email send error:', err);
     return new Response(JSON.stringify({
       error: err.message,
       hint: 'Check: 1) RESEND_API_KEY is set via supabase secrets set, 2) From domain is verified in Resend dashboard, 3) Recipient email is valid'
     }), { status: 500, headers: corsHeaders });
   }
   ```

5. **On the frontend,** show the actual error instead of a generic message:
   ```javascript
   async function sendInviteEmail(email, options) {
     try {
       const token = getAccessToken();
       const response = await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           recipientEmail: email,
           ...options,
         }),
       });

       const data = await response.json();

       if (!response.ok || data.error) {
         throw new Error(data.error || data.hint || 'Email sending failed');
       }

       return data;
     } catch (err) {
       // Show specific error to user
       showToast(`Email error: ${err.message}`, 'error');
       throw err;
     }
   }
   ```

### Part B: Branded Email Template
1. The invite email HTML should match Roadmap OS branding:
   ```javascript
   function getInviteEmailHtml(inviterName, recipientEmail, options) {
     const loginUrl = options?.deepLink || 'https://app.pmroadmapper.com';
     const message = options?.message || '';

     return `
       <!DOCTYPE html>
       <html>
       <head><meta charset="utf-8"></head>
       <body style="margin:0; padding:0; background:#f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
         <div style="max-width:560px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

           <!-- Header -->
           <div style="background:#3b82f6; padding:32px; text-align:center;">
             <h1 style="color:#ffffff; font-size:24px; margin:0; font-weight:700;">Roadmap OS</h1>
           </div>

           <!-- Body -->
           <div style="padding:32px;">
             <h2 style="color:#1a1a2e; font-size:20px; margin:0 0 16px;">You've been invited!</h2>
             <p style="color:#4a4a6a; font-size:15px; line-height:1.6; margin:0 0 16px;">
               <strong>${escapeHtml(inviterName)}</strong> has invited you to collaborate on Roadmap OS
               ${options?.planName ? ` — specifically on the plan "<strong>${escapeHtml(options.planName)}</strong>"` : ''}.
             </p>

             ${message ? `
               <div style="background:#f8f9fa; border-left:3px solid #3b82f6; padding:12px 16px; margin:16px 0; border-radius:0 8px 8px 0;">
                 <p style="color:#4a4a6a; font-size:14px; margin:0; font-style:italic;">"${escapeHtml(message)}"</p>
               </div>
             ` : ''}

             <p style="color:#4a4a6a; font-size:15px; line-height:1.6; margin:0 0 24px;">
               Click the button below to get started.
             </p>

             <div style="text-align:center; margin:24px 0;">
               <a href="${loginUrl}" style="display:inline-block; background:#3b82f6; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">
                 Join Roadmap OS
               </a>
             </div>

             <p style="color:#9ca3af; font-size:12px; text-align:center; margin:24px 0 0;">
               If the button doesn't work, copy and paste this link:<br>
               <a href="${loginUrl}" style="color:#3b82f6; word-break:break-all;">${loginUrl}</a>
             </p>
           </div>

           <!-- Footer -->
           <div style="background:#f8f9fa; padding:16px 32px; text-align:center;">
             <p style="color:#9ca3af; font-size:12px; margin:0;">
               Sent by Roadmap OS · <a href="https://pmroadmapper.com" style="color:#3b82f6;">pmroadmapper.com</a>
             </p>
           </div>
         </div>
       </body>
       </html>
     `;
   }
   ```

2. **Pass this HTML to the edge function** instead of plain text.

---

## Fix 6: Edit Team — Logo Upload, Description on Card, Bottom Rounding

### Part A: Team Logo Upload
1. Add a logo upload field to the edit team modal:
   ```html
   <div class="form-group">
     <label>Team Logo (optional)</label>
     <div class="team-logo-upload">
       <div id="team-logo-preview-${teamId}" class="logo-preview">
         ${team.logo ? `<img src="${team.logo}" alt="Team logo">` : `
           <svg viewBox="0 0 40 40" width="40" height="40" stroke="var(--text-muted)" stroke-width="1.5" fill="none">
             <rect x="5" y="5" width="30" height="30" rx="6"/>
             <circle cx="15" cy="15" r="3"/><path d="M5 30l8-8 5 5 7-7 10 10"/>
           </svg>
         `}
       </div>
       <button onclick="uploadTeamLogo('${teamId}')" class="btn-sm btn-outline">Upload Logo</button>
       ${team.logo ? `<button onclick="removeTeamLogo('${teamId}')" class="btn-sm btn-ghost">Remove</button>` : ''}
     </div>
   </div>
   ```

2. **Logo upload logic:**
   ```javascript
   function uploadTeamLogo(teamId) {
     const input = document.createElement('input');
     input.type = 'file';
     input.accept = 'image/*';
     input.onchange = async (e) => {
       const file = e.target.files[0];
       if (!file) return;

       // Convert to base64 (small logos < 100KB are fine as base64)
       const reader = new FileReader();
       reader.onload = () => {
         const team = (currentData.teams || []).find(t => t.id === teamId);
         if (team) {
           team.logo = reader.result; // base64 data URL
           saveData();
           openEditTeam(teamId); // refresh
         }
       };
       reader.readAsDataURL(file);
     };
     input.click();
   }
   ```

### Part B: Show Description and Members on Team Card
1. Find the team card/list rendering:
   ```bash
   grep -n "team-card\|teamCard\|renderTeam\|team-list\|teamRow" renderer/index.html | head -15
   ```

2. **Update team card to show description and top 5 members:**
   ```javascript
   function renderTeamCard(team) {
     const memberCount = (team.members || []).length;
     const topMembers = (team.members || []).slice(0, 5);

     return `
       <div class="team-card" data-team-id="${team.id}">
         <div class="team-card-header">
           ${team.logo
             ? `<img src="${team.logo}" class="team-logo-sm" alt="${escapeHtml(team.name)}">`
             : `<div class="team-logo-placeholder" style="background:${team.color || '#3b82f6'};">
                 ${team.name.charAt(0).toUpperCase()}
               </div>`
           }
           <div class="team-card-info">
             <h4>${escapeHtml(team.name)}</h4>
             ${team.description ? `<p class="team-description">${escapeHtml(team.description)}</p>` : ''}
           </div>
           <button onclick="openEditTeam('${team.id}')" class="btn-sm btn-outline">Edit</button>
         </div>

         <div class="team-card-members">
           <div class="member-avatars">
             ${topMembers.map(m => `
               <div class="avatar-circle-sm" title="${escapeHtml(m.name || m.email)}">
                 ${(m.name || m.email).charAt(0).toUpperCase()}
               </div>
             `).join('')}
             ${memberCount > 5 ? `<div class="avatar-circle-sm more">+${memberCount - 5}</div>` : ''}
           </div>
           <span class="member-count">${memberCount} member${memberCount !== 1 ? 's' : ''}</span>
         </div>
       </div>
     `;
   }
   ```

### Part C: Fix Bottom Rounding on Edit Team Modal
1. Find the edit team modal styles:
   ```bash
   grep -n "edit-team.*modal\|team.*modal\|team.*popup\|editTeam.*style" renderer/index.html | grep -i "style\|css\|border\|radius" | head -10
   ```

2. **Fix the inconsistent border-radius:**
   ```css
   .edit-team-form,
   .edit-team-modal,
   .modal-content {
     border-radius: 12px;  /* consistent all corners */
   }

   /* If the Done button area has a different background, round its bottom */
   .modal-footer,
   .form-actions {
     border-radius: 0 0 12px 12px;
   }

   /* Specifically target the edit team modal if it has different class */
   .team-editor-modal {
     border-radius: 12px !important;
     overflow: hidden; /* ensures children don't break the rounding */
   }
   ```

3. If the issue is that the modal container has `border-radius` but the last child (Done button area) has a colored background that creates square corners, add `overflow: hidden` to the modal.

---

## Fix 7: Capacity IQ Templates — Only 2 Templates on Desktop

**Problem:** On the Electron desktop app, the Capacity IQ templates page only shows 2 templates instead of all the platform templates. This is likely because the template sync or `getAllTemplates()` isn't returning the full list.

**Approach:**
1. Find the template loading on the CIQ page:
   ```bash
   grep -n "renderCapacityIQTemplates\|ciq.*templates\|capacity.*templates\|loadCIQTemplates" renderer/index.html | head -15
   ```

2. **Check if `getAllTemplates()` returns the full list:**
   ```javascript
   // Debug: log the template count
   function debugTemplates() {
     const all = getAllTemplates();
     console.log('Total templates:', all.length);
     console.log('Platform:', all.filter(t => t.type === 'platform').length);
     console.log('Organisation:', all.filter(t => t.type === 'organisation').length);
     console.log('Template names:', all.map(t => t.name));
   }
   ```

3. **Common causes:**
   - `getDefaultTemplates()` returns fewer templates than expected — check the function and count
   - The Capacity IQ page has its own template list that's separate from `getAllTemplates()`
   - The desktop app's data sync doesn't include `templateLibrary` from the server
   - Template loading is conditional and fails silently

4. **Fix:** Ensure the CIQ templates page calls `getAllTemplates()`:
   ```javascript
   function renderCapacityIQTemplates() {
     const templates = getAllTemplates(); // MUST return all platform + org templates
     const container = document.getElementById('ciq-templates-container');
     if (!container) return;

     if (templates.length === 0) {
       container.innerHTML = '<p class="empty-state">No templates available.</p>';
       return;
     }

     container.innerHTML = templates.map(template => renderTemplateCard(template)).join('');
   }
   ```

5. **If `getDefaultTemplates()` only returns 2,** find it and verify ALL templates are defined:
   ```bash
   grep -n "function getDefaultTemplates\|function getAllTemplates\|defaultTemplates\s*=" renderer/index.html | head -10
   ```
   Then read the entire function to count how many templates are in the array.

6. **If templates were supposed to be added in previous fix batches but weren't applied to the desktop,** ensure the `getDefaultTemplates()` function contains ALL templates (10+ platform templates from v3 Fix 11).

---

## Fix 8: Capacity IQ Dashboard — Show Team Capacity in Addition to Individual

**Problem:** The Capacity IQ dashboard currently shows team member capacity. It should ALSO show aggregated team-level capacity — total hours for the team, allocated, utilization as a team.

**Approach:**
1. Find the dashboard rendering:
   ```bash
   grep -n "capacity.*dashboard\|renderCapacity.*Dashboard\|capDashboard\|teamMemberCapacity" renderer/index.html | head -15
   ```

2. **Add a "Teams" section above or alongside the "Team Members" section:**
   ```javascript
   function renderTeamCapacitySummary() {
     const teams = currentData.teams || [];
     if (teams.length === 0) return '';

     let html = '<div class="team-capacity-section"><h3>Team Capacity</h3>';
     html += '<div class="team-capacity-grid">';

     teams.forEach(team => {
       const members = team.members || [];
       const totalWeeklyHours = members.reduce((sum, m) => {
         return sum + (m.weeklyCapacity || currentData?.settings?.weeklyCapacity || 40);
       }, 0);
       const totalAllocated = members.reduce((sum, m) => {
         return sum + calculateMemberAllocatedHours(m.userId || m.email);
       }, 0);
       const utilization = totalWeeklyHours > 0 ? Math.round((totalAllocated / totalWeeklyHours) * 100) : 0;
       const available = totalWeeklyHours - totalAllocated;

       html += `
         <div class="team-capacity-card">
           <div class="team-cap-header">
             ${team.logo
               ? `<img src="${team.logo}" class="team-logo-xs" alt="">`
               : `<div class="team-dot" style="background:${team.color || '#3b82f6'};"></div>`
             }
             <h4>${escapeHtml(team.name)}</h4>
             <span class="member-badge">${members.length} members</span>
           </div>
           <div class="team-cap-stats">
             <div class="cap-stat">
               <span class="stat-value">${totalWeeklyHours}h</span>
               <span class="stat-label">Total Capacity/wk</span>
             </div>
             <div class="cap-stat">
               <span class="stat-value">${totalAllocated}h</span>
               <span class="stat-label">Allocated</span>
             </div>
             <div class="cap-stat">
               <span class="stat-value ${available < 0 ? 'over-capacity' : ''}">${available}h</span>
               <span class="stat-label">Available</span>
             </div>
             <div class="cap-stat">
               <span class="stat-value ${utilization > 100 ? 'over-capacity' : ''}">${utilization}%</span>
               <span class="stat-label">Utilization</span>
             </div>
           </div>
           <!-- Utilization bar -->
           <div class="utilization-bar">
             <div class="utilization-fill ${utilization > 100 ? 'over' : utilization > 80 ? 'high' : ''}"
                  style="width:${Math.min(100, utilization)}%"></div>
           </div>
         </div>
       `;
     });

     html += '</div></div>';
     return html;
   }
   ```

3. **CSS:**
   ```css
   .team-capacity-grid {
     display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
     gap: 16px; margin-bottom: 24px;
   }
   .team-capacity-card {
     background: var(--bg-card); border: 1px solid var(--border-primary);
     border-radius: 12px; padding: 16px;
   }
   .team-cap-header {
     display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
   }
   .team-cap-stats { display: flex; gap: 16px; margin-bottom: 12px; }
   .cap-stat { text-align: center; }
   .utilization-bar {
     height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden;
   }
   .utilization-fill {
     height: 100%; background: #22c55e; border-radius: 3px; transition: width 0.3s;
   }
   .utilization-fill.high { background: #eab308; }
   .utilization-fill.over { background: #ef4444; }
   .over-capacity { color: #ef4444; font-weight: 600; }
   ```

4. **Insert the team capacity section** at the top of the dashboard, before the individual member breakdown.

---

## Fix 9: Delete Portfolio Overview from Reports Dashboard

**Problem:** Remove the "Portfolio Overview" tab/section from the Reports Dashboard page.

**Approach:**
1. Find it:
   ```bash
   grep -n "Portfolio Overview\|portfolio.*overview\|portfolioOverview\|portfolio-overview" renderer/index.html | head -10
   ```

2. **Remove:**
   - The tab/button for "Portfolio Overview"
   - The content panel/section
   - Any associated JavaScript rendering functions
   - Any data fetching specifically for the portfolio overview

3. **Verify** the Reports Dashboard still works correctly after removal — other tabs/sections should shift up and remain functional.

4. **Also remove any references** in nav items, breadcrumbs, or onboarding text.

---

## Post-Fix Checklist

1. **Select All:** Works on G2M tab, Task Library tab (with per-category Select All), and Planning page (with bulk actions).
2. **Hours tooltip:** Question mark icon shows tooltip on hover, no inline description text pushing the form down.
3. **Timeline:** Pill/bar updates match date edits. Filters modal works (status, priority, owner, phase). Horizontal scroller present at bottom.
4. **Edit Team members:** Dropdown of org users available. Can add members (multi-team allowed). No "No members yet" with no way to add.
5. **Invite email:** Actually sends (or shows the specific Resend error). Branded HTML template with Roadmap OS design.
6. **Team card:** Shows description, logo (if uploaded), top 5 member avatars. Edit modal has rounded bottom corners.
7. **CIQ templates:** All platform templates visible on both desktop and web (not just 2).
8. **CIQ dashboard:** Shows team-level capacity aggregation with utilization bars, in addition to individual members.
9. **Portfolio Overview:** Removed from Reports Dashboard.
10. **Dark mode:** All new elements use CSS variables.
11. **Emoji sweep:** `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` — must be 0.
12. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
13. **Bump version** in `package.json`
14. **Rebuild web:** `cd web && npm run build`
15. **Commit:** `git add -A && git commit -m "vX.Y.Z: v12 — select all, timeline fixes, team mgmt, email invites, CIQ templates, team capacity"`
16. **Update FIX_LOG_V12.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V12.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix.** Re-read changes, check syntax, verify both light and dark mode.
4. **If a fix is blocked**, implement what you can, add `// TODO:` comments, log it, move on.
5. **Preserve existing patterns.** Match the codebase style.
6. **Both modes matter.** Every element uses CSS variables.
7. **Keep the single-file SPA pattern.** All UI changes in `renderer/index.html`.
8. **Zero emoji.** SVG icons everywhere.
9. **Fix 5 (email invite) touches an edge function.** Read the existing `send-invite` function, diagnose the actual Resend error, fix it, and update the email HTML template.
10. **Fix 7 (CIQ templates) is likely a `getDefaultTemplates()` issue.** Count the templates in that function. If fewer than 10, the templates from v3 weren't properly added — add them now.
11. **The tooltip pattern (Fix 2) should be reusable.** Create it as a CSS utility class that can be applied anywhere with `data-tooltip="..."`.
