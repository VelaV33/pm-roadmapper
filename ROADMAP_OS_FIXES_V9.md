# Roadmap OS — Autonomous Fix Queue v9

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V9.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/`
- Data stored as one JSONB blob per user in `roadmap_data` table
- Navigation: `showPage('pageId')` with `history.pushState`
- Dark mode: CSS variables (`:root` for light, `.dark-mode` overrides)
- ZERO emoji — SVG icons only (stroke-based, `currentColor`, 1.5-2px stroke)
- Template data: `currentData.templateLibrary` via `getAllTemplates()`
- Task Library: `currentData.taskLibrary` — central task registry
- Teams: `currentData.teams[]` with members, descriptions, etc.
- Plans linked to initiatives (roadmap rows), initiatives live in `currentData.sections[].rows[]`

**Before starting:**
1. `grep -n "capacity.*template\|ciq.*template\|CapacityIQ.*template\|template.*card\|template.*icon\|template.*click" renderer/index.html | head -30`
2. `grep -n "editTeam\|edit-team\|Edit Team\|addMember\|Add Member\|team.*modal\|team.*popup\|team.*invite\|30.day.*free\|free.*trial.*invite" renderer/index.html | head -30`
3. `grep -n "strategy.*page\|Strategy\|strategy-page\|report.*dashboard\|Reports Dashboard\|initiative.*log\|change.*log\|audit.*log" renderer/index.html | head -30`
4. `grep -n "notification\|Notification\|alert.*setting\|alert.*config\|notify\|sendEmail\|email.*notification" renderer/index.html | head -30`
5. `grep -n "todayLine\|today-line\|today.*marker\|current.*day.*line\|positionTodayLine" renderer/index.html | head -20`
6. `grep -n "My Capacity\|myCapacity\|my-capacity\|KPI.*capacity\|capacity.*kpi" renderer/index.html | head -15`
7. `grep -n "Shared with me\|shared.*card\|sharedWithMe\|dashboard.*card\|plan.*count\|plan.*overview" renderer/index.html | head -15`
8. `grep -n "date.*range\|dateRange\|timeline.*filter\|timeline.*zoom\|quarter.*view\|view.*range" renderer/index.html | head -20`
9. Log all findings in `FIX_LOG_V9.md`

---

## Fix 1: Capacity IQ Templates — Icons, Clickable Cards, Focused Template View, Save Fix, Search

**Problem:** Multiple issues with the Capacity IQ templates:
1. No icons on template cards
2. Cards aren't clickable — can't see tasks inside a template
3. When you click a template, it opens the full template builder showing ALL templates instead of focusing on the one you clicked
4. Saving a template doesn't persist — it doesn't appear back on the Capacity IQ templates page
5. No search functionality for templates
6. Need a "Search Templates" button alongside "Build New Template"

### Part A: Add SVG Icons to Template Cards
1. Find template card rendering:
   ```bash
   grep -n "templateCard\|template-card\|renderTemplate.*card\|capacity.*template.*render" renderer/index.html | head -20
   ```

2. Create a category-to-icon mapping using clean SVG icons:
   ```javascript
   function getTemplateIcon(template) {
     const category = (template.category || template.name || '').toLowerCase();
     const icons = {
       'product launch': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M4.5 16.5l3-9 9 3-3 9z"/><circle cx="12" cy="12" r="1"/><path d="M2 12h2M12 2v2M20 12h2M12 20v2"/></svg>',
       'hardware': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16"/></svg>',
       'frontend': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><circle cx="6" cy="6" r="0.5" fill="currentColor"/><circle cx="9" cy="6" r="0.5" fill="currentColor"/></svg>',
       'backend': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="18" r="1" fill="currentColor"/></svg>',
       'security': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z"/></svg>',
       'marketing': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
       'agile': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
       'sales': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
       'devops': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9"/></svg>',
       'customer': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
       'discovery': '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
     };

     // Match by keyword
     for (const [key, svg] of Object.entries(icons)) {
       if (category.includes(key)) return svg;
     }

     // Default icon
     return '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>';
   }
   ```

3. Apply icon to every template card rendering:
   ```javascript
   function renderTemplateCard(template) {
     return `
       <div class="template-card clickable" onclick="openTemplateFocused('${template.id}')"
            data-template-id="${template.id}">
         <div class="template-card-icon">
           ${getTemplateIcon(template)}
         </div>
         <div class="template-card-info">
           <h4 class="template-card-name">${escapeHtml(template.name)}</h4>
           <span class="template-card-count">${template.tasks?.length || 0} tasks</span>
           <span class="template-card-type ${template.type === 'platform' ? 'badge-platform' : 'badge-org'}">
             ${template.type === 'platform' ? 'Platform' : 'Custom'}
           </span>
         </div>
       </div>
     `;
   }
   ```

### Part B: Focused Template View (Not Full Builder)
1. When a user clicks a template card, show ONLY that template's tasks — not the full template builder with all templates:
   ```javascript
   function openTemplateFocused(templateId) {
     const templates = getAllTemplates();
     const template = templates.find(t => t.id === templateId);
     if (!template) return;

     const modal = createModal(template.name);
     let html = `
       <div class="focused-template-view">
         <div class="template-header">
           <div class="template-icon-lg">${getTemplateIcon(template)}</div>
           <div>
             <h3>${escapeHtml(template.name)}</h3>
             <p class="template-meta">${template.tasks?.length || 0} tasks · ${template.type === 'platform' ? 'Platform Template' : 'Custom Template'}</p>
           </div>
         </div>

         <div class="template-tasks-list">
           <div class="select-all-bar">
             <label>
               <input type="checkbox" checked onchange="toggleAllFocusedTasks(this.checked)">
               Select All
             </label>
             <span id="focused-selected-count">${template.tasks?.length || 0} selected</span>
           </div>
     `;

     // Group tasks by phase if phases exist
     const phases = {};
     (template.tasks || []).forEach(task => {
       const phase = task.phase || 'Tasks';
       if (!phases[phase]) phases[phase] = [];
       phases[phase].push(task);
     });

     Object.entries(phases).forEach(([phase, tasks]) => {
       html += `<div class="phase-group"><h4 class="phase-label">${escapeHtml(phase)}</h4>`;
       tasks.forEach(task => {
         html += `
           <div class="task-item-row">
             <label class="task-check-label">
               <input type="checkbox" class="focused-task-cb" data-task-id="${task.id}" checked>
               <span class="task-name-text">${escapeHtml(task.name)}</span>
             </label>
             <span class="task-hours-badge">${task.hours || '-'}h</span>
             <button class="btn-icon-sm" onclick="editFocusedTask('${task.id}')" title="Edit">
               <svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" stroke-width="1.5" fill="none">
                 <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/>
               </svg>
             </button>
           </div>
         `;
       });
       html += '</div>';
     });

     html += `
         </div>

         <div class="focused-template-actions">
           <button onclick="importFocusedSelected('${templateId}')" class="btn-primary">Import Selected</button>
           <button onclick="saveFocusedAsTemplate('${templateId}')" class="btn-secondary">Save as Custom Template</button>
           <button onclick="closeModal()" class="btn-outline">Close</button>
         </div>
       </div>
     `;

     modal.innerHTML = html;
     showModal(modal);
   }

   function editFocusedTask(taskId) {
     // Open an inline edit form for this specific task within the focused view
     const taskRow = document.querySelector(`.task-item-row [data-task-id="${taskId}"]`)?.closest('.task-item-row');
     if (!taskRow) return;

     // Find the task data
     const allTemplates = getAllTemplates();
     let foundTask = null;
     allTemplates.forEach(t => {
       (t.tasks || []).forEach(task => {
         if (task.id === taskId) foundTask = task;
       });
     });
     if (!foundTask) return;

     // Replace the row with an edit form
     const originalHTML = taskRow.innerHTML;
     taskRow.innerHTML = `
       <div class="inline-task-edit">
         <input type="text" class="edit-task-name" value="${escapeHtml(foundTask.name)}" style="flex:1;">
         <input type="number" class="edit-task-hours" value="${foundTask.hours || 0}" style="width:60px;" placeholder="Hours">
         <select class="edit-task-priority" style="width:80px;">
           <option value="High" ${foundTask.priority === 'High' ? 'selected' : ''}>High</option>
           <option value="Medium" ${foundTask.priority === 'Medium' ? 'selected' : ''}>Medium</option>
           <option value="Low" ${foundTask.priority === 'Low' ? 'selected' : ''}>Low</option>
         </select>
         <button onclick="saveFocusedTaskEdit('${taskId}', this)" class="btn-sm btn-primary">Save</button>
         <button onclick="this.closest('.task-item-row').innerHTML = '${originalHTML.replace(/'/g, "\\'")}'" class="btn-sm">Cancel</button>
       </div>
     `;
   }
   ```

### Part C: Fix Template Save Persistence
1. Find the save template function:
   ```bash
   grep -n "saveTemplate\|saveAsTemplate\|saveCustomTemplate\|templateLibrary\.push" renderer/index.html | head -15
   ```

2. **Diagnose:** Templates saved from the Capacity IQ context might not be writing to `currentData.templateLibrary` or `saveData()` might not be called after push.

3. **Fix:**
   ```javascript
   function saveFocusedAsTemplate(sourceTemplateId) {
     const checkedTasks = getCheckedFocusedTasks();
     if (checkedTasks.length === 0) {
       showToast('Select at least one task', 'warning');
       return;
     }

     // Prompt for name
     const name = prompt('Template name:');
     if (!name || !name.trim()) return;

     if (!currentData.templateLibrary) currentData.templateLibrary = [];

     const newTemplate = {
       id: generateId(),
       name: name.trim(),
       type: 'organisation',
       category: inferCategoryFromTasks(checkedTasks),
       tasks: checkedTasks.map(t => ({
         ...t,
         id: generateId(), // new IDs for the copy
       })),
       taskCount: checkedTasks.length,
       sourceTemplateId: sourceTemplateId,
       createdBy: getCurrentUserId(),
       createdAt: new Date().toISOString(),
     };

     currentData.templateLibrary.push(newTemplate);
     saveData(); // THIS IS CRITICAL — must actually persist

     closeModal();
     renderCapacityIQTemplates(); // re-render to show the new template
     showToast(`Template "${name}" saved with ${checkedTasks.length} tasks`, 'success');
   }
   ```

4. **Verify `saveData()` actually syncs to Supabase** — check the function chain:
   ```bash
   grep -n "function saveData\|function syncRoadmap\|function save(" renderer/index.html | head -10
   ```

### Part D: Search Templates
1. Add search bar alongside "Build New Template":
   ```html
   <div class="template-toolbar page-toolbar">
     <div class="toolbar-title">Templates</div>
     <div class="toolbar-actions">
       <div class="template-search-wrapper">
         <input type="text" id="ciq-template-search" placeholder="Search templates..."
                oninput="filterCIQTemplates(this.value)">
       </div>
       <button onclick="openBuildNewTemplate()" class="btn-primary">Build New Template</button>
     </div>
   </div>
   ```

2. Filter function:
   ```javascript
   function filterCIQTemplates(query) {
     const q = query.toLowerCase().trim();
     const cards = document.querySelectorAll('#ciq-templates-container .template-card');
     cards.forEach(card => {
       const name = card.querySelector('.template-card-name')?.textContent?.toLowerCase() || '';
       const match = !q || name.includes(q);
       card.style.display = match ? '' : 'none';
     });
   }
   ```

---

## Fix 2: Capacity Dashboard — Show Individual User Capacity When No Teams

**Problem:** The Capacity Dashboard says "No team members yet." It should also show individual users' capacity even if they haven't been assigned to teams.

**Approach:**
1. Find the dashboard rendering:
   ```bash
   grep -n "capacity.*dashboard\|renderCapacity.*dash\|no team members\|No team members" renderer/index.html | head -15
   ```

2. **Fix:** When there are no teams or team members, show the current user's own capacity:
   ```javascript
   function getCapacityMembers() {
     const members = [];

     // 1. From teams
     (currentData.teams || []).forEach(team => {
       (team.members || []).forEach(member => {
         if (!members.find(m => (m.userId || m.email) === (member.userId || member.email))) {
           members.push({
             ...member,
             teamName: team.name,
           });
         }
       });
     });

     // 2. If no team members, add the current user
     if (members.length === 0) {
       const currentUser = getCurrentUser(); // however user data is accessed
       members.push({
         name: currentUser?.name || currentUser?.email?.split('@')[0] || 'Me',
         email: currentUser?.email || '',
         userId: getCurrentUserId(),
         teamName: 'Individual',
         weeklyCapacity: currentData?.settings?.weeklyCapacity || 40,
         role: 'user',
       });
     }

     // 3. Also add any contacts or collaborators who have tasks assigned
     (currentData.contacts || []).forEach(contact => {
       if (!members.find(m => m.email === contact.email)) {
         // Check if this contact has any assigned tasks
         const hasAssignments = hasAssignedTasks(contact.email);
         if (hasAssignments) {
           members.push({
             name: contact.name || contact.email,
             email: contact.email,
             teamName: 'Unassigned',
             weeklyCapacity: 40, // default
           });
         }
       }
     });

     return members;
   }

   function hasAssignedTasks(email) {
     // Check plans for tasks assigned to this email
     let found = false;
     // Check all plans
     // ... iterate through plans and check task.owner or task.assignedTo
     return found;
   }
   ```

3. **Update the dashboard rendering** to use `getCapacityMembers()` instead of only looking at team members:
   - If `members.length === 0` after all sources: show a helpful empty state with "Add team members or configure your capacity" CTA
   - If `members.length > 0`: show the capacity table/cards

---

## Fix 3: Edit Team — Complete Overhaul

**Problem:** Multiple issues with the Edit Team popup:
1. No dropdown to select existing users/org members to add to team
2. Horizontal scroller appears (content overflows right)
3. Send invite link might not work
4. "Invitees get a 30-day free trial" text should be KEPT (user changed their mind)
5. No team description field
6. Under "Current members" should say "Add Members" with a dropdown of all org users
7. Everything should be centered — no horizontal scrollbar

### Full Redesign:
1. Find the edit team modal:
   ```bash
   grep -n "editTeam\|edit-team\|Edit Team\|team.*modal\|team.*popup\|teamEditor" renderer/index.html | head -20
   ```

2. **Redesign the modal:**
   ```javascript
   function openEditTeam(teamId) {
     const team = (currentData.teams || []).find(t => t.id === teamId);
     if (!team) return;

     // Close any existing modals first (prevent stacking)
     closeAllModals();

     const modal = createModal('Edit Team');
     modal.innerHTML = `
       <div class="edit-team-form" style="max-width:480px; margin:0 auto;">
         <div class="form-group">
           <label>Team Name</label>
           <input type="text" id="edit-team-name" value="${escapeHtml(team.name)}" style="width:100%;">
         </div>

         <div class="form-group">
           <label>Description</label>
           <textarea id="edit-team-description" rows="3" placeholder="What does this team do?"
                     style="width:100%; resize:vertical;">${escapeHtml(team.description || '')}</textarea>
         </div>

         <div class="form-group">
           <label>Team Color</label>
           <input type="color" id="edit-team-color" value="${team.color || '#3b82f6'}" style="width:60px; height:36px;">
         </div>

         <div class="form-section">
           <h4>Team Members</h4>

           <!-- Current members list -->
           <div id="edit-team-members-list" class="team-members-list">
             ${(team.members || []).map(member => `
               <div class="member-row" data-email="${member.email}">
                 <span class="member-name">${escapeHtml(member.name || member.email)}</span>
                 <select class="member-role-select" onchange="updateMemberRole('${teamId}', '${member.email}', this.value)">
                   <option value="member" ${(member.role || member.role_in_team) === 'member' ? 'selected' : ''}>Member</option>
                   <option value="lead" ${(member.role || member.role_in_team) === 'lead' ? 'selected' : ''}>Lead</option>
                 </select>
                 <button onclick="removeMemberFromTeam('${teamId}', '${member.email}')" class="btn-icon-sm btn-danger-subtle" title="Remove">
                   <svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" stroke-width="1.5" fill="none">
                     <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
                   </svg>
                 </button>
               </div>
             `).join('')}
           </div>

           <!-- Add member section -->
           <div class="add-member-section">
             <h5>Add Members</h5>

             <!-- Dropdown of existing org users -->
             <div class="form-group">
               <label>From Organisation</label>
               <select id="add-member-dropdown" style="width:100%;">
                 <option value="">Select a user...</option>
                 ${getOrgUsersNotInTeam(teamId).map(user => `
                   <option value="${user.email}">${escapeHtml(user.name || user.email)}</option>
                 `).join('')}
               </select>
               <button onclick="addSelectedMemberToTeam('${teamId}')" class="btn-sm btn-primary" style="margin-top:8px;">
                 Add to Team
               </button>
             </div>

             <!-- Invite by email -->
             <div class="form-group" style="margin-top:16px;">
               <label>Invite by Email</label>
               <div style="display:flex; gap:8px;">
                 <input type="email" id="invite-member-email" placeholder="email@example.com" style="flex:1;">
                 <button onclick="inviteMemberToTeam('${teamId}')" class="btn-sm btn-primary">
                   Send Invite
                 </button>
               </div>
             </div>
           </div>
         </div>

         <div class="form-actions" style="margin-top:20px;">
           <button onclick="saveTeamEdits('${teamId}')" class="btn-primary">Save Changes</button>
           <button onclick="closeModal()" class="btn-secondary">Cancel</button>
         </div>
       </div>
     `;
     showModal(modal);
   }

   function getOrgUsersNotInTeam(teamId) {
     const team = (currentData.teams || []).find(t => t.id === teamId);
     const teamEmails = new Set((team?.members || []).map(m => m.email));

     // Gather all known users: from contacts, other teams, collaborators
     const allUsers = [];
     const seen = new Set();

     // From contacts
     (currentData.contacts || []).forEach(c => {
       if (!seen.has(c.email) && !teamEmails.has(c.email)) {
         allUsers.push({ name: c.name, email: c.email });
         seen.add(c.email);
       }
     });

     // From other teams
     (currentData.teams || []).forEach(t => {
       (t.members || []).forEach(m => {
         if (!seen.has(m.email) && !teamEmails.has(m.email)) {
           allUsers.push({ name: m.name || m.email, email: m.email });
           seen.add(m.email);
         }
       });
     });

     return allUsers;
   }

   function addSelectedMemberToTeam(teamId) {
     const select = document.getElementById('add-member-dropdown');
     const email = select.value;
     if (!email) { showToast('Select a user', 'warning'); return; }

     const team = (currentData.teams || []).find(t => t.id === teamId);
     if (!team) return;
     if (!team.members) team.members = [];

     // Find user info
     const userInfo = getOrgUsersNotInTeam(teamId).find(u => u.email === email);
     team.members.push({
       email: email,
       name: userInfo?.name || email,
       role_in_team: 'member',
       addedAt: new Date().toISOString(),
     });

     saveData();
     // Re-render the modal to show the updated member list
     openEditTeam(teamId);
     showToast(`${userInfo?.name || email} added to team`, 'success');
   }

   async function inviteMemberToTeam(teamId) {
     const email = document.getElementById('invite-member-email').value.trim();
     if (!email || !email.includes('@')) {
       showToast('Enter a valid email', 'warning');
       return;
     }

     // Send invite via the send-invite edge function
     try {
       await sendInviteEmail(email);

       // Also add to team
       const team = (currentData.teams || []).find(t => t.id === teamId);
       if (team) {
         if (!team.members) team.members = [];
         team.members.push({
           email: email,
           name: email.split('@')[0],
           role_in_team: 'member',
           status: 'invited',
           addedAt: new Date().toISOString(),
         });
         saveData();
       }

       openEditTeam(teamId); // refresh
       showToast(`Invite sent to ${email}`, 'success');
     } catch (err) {
       showToast('Failed to send invite: ' + err.message, 'error');
     }
   }
   ```

3. **Fix horizontal scroller:**
   ```css
   .edit-team-form {
     max-width: 480px;
     margin: 0 auto;
     overflow-x: hidden;    /* prevent horizontal scroll */
     box-sizing: border-box;
     padding: 0 4px;        /* slight padding to prevent edge clipping */
   }
   .edit-team-form * {
     max-width: 100%;
     box-sizing: border-box;
   }
   .edit-team-form input,
   .edit-team-form select,
   .edit-team-form textarea {
     width: 100%;
   }
   ```

4. **For the Add Team modal,** apply the same design — popup with team name, description, member add from dropdown, invite by email.

---

## Fix 4: Add Team — Proper Popup

**Problem:** The "Add Team" flow needs a proper popup with team name, description, and the ability to add/invite members.

**Approach:**
1. Find the add team handler:
   ```bash
   grep -n "addTeam\|createTeam\|newTeam\|Add Team\|Create Team" renderer/index.html | head -15
   ```

2. **Create/replace with a proper modal:**
   ```javascript
   function openAddTeam() {
     closeAllModals();

     const modal = createModal('Create Team');
     modal.innerHTML = `
       <div class="edit-team-form" style="max-width:480px; margin:0 auto;">
         <div class="form-group">
           <label>Team Name</label>
           <input type="text" id="new-team-name" placeholder="e.g., Platform Engineering" style="width:100%;">
         </div>
         <div class="form-group">
           <label>Description</label>
           <textarea id="new-team-description" rows="3" placeholder="What does this team do?"
                     style="width:100%; resize:vertical;"></textarea>
         </div>
         <div class="form-group">
           <label>Color</label>
           <input type="color" id="new-team-color" value="#3b82f6" style="width:60px; height:36px;">
         </div>

         <div class="form-section">
           <h4>Add Members</h4>

           <!-- Add from org users -->
           <div id="new-team-members" class="team-members-list"></div>

           <div class="form-group">
             <label>Select User</label>
             <select id="new-team-user-select" style="width:100%;">
               <option value="">Select a user...</option>
               ${getAllOrgUsers().map(u => `
                 <option value="${u.email}">${escapeHtml(u.name || u.email)}</option>
               `).join('')}
             </select>
             <button onclick="addMemberToNewTeam()" class="btn-sm btn-primary" style="margin-top:8px;">
               Add Member
             </button>
           </div>

           <!-- Invite by email -->
           <div class="form-group" style="margin-top:12px;">
             <label>Invite by Email</label>
             <div style="display:flex; gap:8px;">
               <input type="email" id="new-team-invite-email" placeholder="email@example.com" style="flex:1;">
               <button onclick="addInviteToNewTeam()" class="btn-sm btn-outline">Add</button>
             </div>
           </div>
         </div>

         <div class="form-actions" style="margin-top:20px;">
           <button onclick="saveNewTeam()" class="btn-primary">Create Team</button>
           <button onclick="closeModal()" class="btn-secondary">Cancel</button>
         </div>
       </div>
     `;
     showModal(modal);
   }
   ```

---

## Fix 5: Strategy Page — Rename to "Reports Dashboard" + Initiative Change Log + Multi-Period Capacity

### Part A: Rename Strategy → Reports Dashboard
1. Find all references:
   ```bash
   grep -n "Strategy\|strategy-page\|strategy.*nav\|showPage.*strategy" renderer/index.html | head -20
   ```
2. Rename the visible label from "Strategy" to "Reports Dashboard" everywhere:
   - Sidebar nav item (if still present)
   - Top nav item
   - Page title/header
   - Any breadcrumbs or references
3. Keep the internal page ID as `'strategy'` for backward compatibility, just change the display label.

### Part B: Initiative Change Log
1. Add a "Change Log" section under "Initiatives by Section":
   ```javascript
   // Data model for change log
   function logRoadmapChange(change) {
     if (!currentData.changeLog) currentData.changeLog = [];
     currentData.changeLog.push({
       id: generateId(),
       type: change.type,       // 'row_added', 'row_edited', 'row_deleted', 'section_added', 'initiative_added', 'status_changed', etc.
       entityType: change.entityType, // 'row', 'section', 'initiative'
       entityId: change.entityId,
       entityName: change.entityName,
       field: change.field,     // which field changed (e.g., 'status', 'priority', 'name')
       oldValue: change.oldValue,
       newValue: change.newValue,
       userId: getCurrentUserId(),
       userName: getCurrentUserName(),
       timestamp: new Date().toISOString(),
     });

     // Keep last 500 entries
     if (currentData.changeLog.length > 500) {
       currentData.changeLog = currentData.changeLog.slice(-500);
     }

     saveData();
   }
   ```

2. **Add `logRoadmapChange()` calls** everywhere roadmap data is modified:
   - `addRow()` / `addProduct()` → log type 'row_added'
   - `editRow()` / `saveRowEdit()` → log type 'row_edited' with field + old/new values
   - `deleteRow()` → log type 'row_deleted'
   - `addSection()` → log type 'section_added'
   - `editSection()` → log type 'section_edited'
   - `addInitiative()` → log type 'initiative_added'
   - Status changes → log type 'status_changed'

3. **Render the change log** on the Reports Dashboard page:
   ```javascript
   function renderChangeLog() {
     const log = (currentData.changeLog || []).slice().reverse(); // newest first
     let html = '<div class="change-log-section"><h3>Roadmap Change Log</h3>';

     if (log.length === 0) {
       html += '<p class="empty-state">No changes recorded yet.</p>';
     } else {
       html += '<div class="change-log-list">';
       log.slice(0, 50).forEach(entry => { // show last 50
         const timeAgo = formatTimeAgo(entry.timestamp);
         html += `
           <div class="change-log-entry">
             <div class="change-icon">${getChangeIcon(entry.type)}</div>
             <div class="change-details">
               <span class="change-actor">${escapeHtml(entry.userName || 'Unknown')}</span>
               <span class="change-action">${formatChangeAction(entry)}</span>
               <span class="change-entity">${escapeHtml(entry.entityName || '')}</span>
               ${entry.field ? `<span class="change-field">(${entry.field}: ${escapeHtml(entry.oldValue || '')} → ${escapeHtml(entry.newValue || '')})</span>` : ''}
             </div>
             <span class="change-time">${timeAgo}</span>
           </div>
         `;
       });
       html += '</div>';
     }

     html += '</div>';
     return html;
   }
   ```

### Part C: Multi-Period Capacity View
1. The capacity section on Reports Dashboard should support daily, weekly, monthly, quarterly, and yearly breakdowns.
2. Add period toggle buttons:
   ```html
   <div class="capacity-period-toggle">
     <button class="period-btn" data-period="daily" onclick="switchReportCapacity('daily')">Daily</button>
     <button class="period-btn active" data-period="weekly" onclick="switchReportCapacity('weekly')">Weekly</button>
     <button class="period-btn" data-period="monthly" onclick="switchReportCapacity('monthly')">Monthly</button>
     <button class="period-btn" data-period="quarterly" onclick="switchReportCapacity('quarterly')">Quarterly</button>
     <button class="period-btn" data-period="yearly" onclick="switchReportCapacity('yearly')">Yearly</button>
   </div>
   ```
3. Each view should show drill-down into teams and individual users.
4. Clicking on a team expands to show its members' individual capacity.
5. Clicking on a user shows their task breakdown.

---

## Fix 6: My Capacity — Move from KPI Scorecard to Capacity IQ

**Problem:** The "My Capacity" tab should be removed from the KPI Scorecard and added to the Capacity IQ page as a button/tab where users can view and configure their own capacity.

**Approach:**
1. Find My Capacity in KPI Scorecard:
   ```bash
   grep -n "My Capacity\|myCapacity\|my-capacity\|capacity.*kpi\|kpi.*capacity" renderer/index.html | head -15
   ```

2. **Remove from KPI Scorecard:**
   - Remove the tab button
   - Remove the tab content panel
   - Move the HTML and logic to Capacity IQ

3. **Add to Capacity IQ page:**
   - Add a "My Capacity" button/tab on the Capacity IQ page
   - When clicked, shows the user's personal capacity view:
     - Hours per week (configurable)
     - Current allocation breakdown (which plans/initiatives)
     - Daily/weekly/monthly capacity view
     - Utilization percentage
     - Available capacity

   ```javascript
   function renderMyCapacityOnCIQ() {
     const weeklyHours = currentData?.settings?.weeklyCapacity || 40;
     const allocated = calculateMyAllocatedHours();
     const utilization = weeklyHours > 0 ? Math.round((allocated / weeklyHours) * 100) : 0;

     return `
       <div class="my-capacity-section">
         <div class="capacity-config-bar">
           <h3>My Capacity</h3>
           <div class="form-inline">
             <label>Hours/Week:</label>
             <input type="number" value="${weeklyHours}" id="my-hours-input"
                    onchange="saveMyWeeklyHours(this.value)" style="width:60px;">
           </div>
         </div>

         <div class="capacity-summary-cards">
           <div class="cap-card">
             <span class="cap-label">Weekly Capacity</span>
             <span class="cap-value">${weeklyHours}h</span>
           </div>
           <div class="cap-card">
             <span class="cap-label">Allocated</span>
             <span class="cap-value">${allocated}h</span>
           </div>
           <div class="cap-card">
             <span class="cap-label">Available</span>
             <span class="cap-value ${(weeklyHours - allocated) < 0 ? 'over-capacity' : ''}">${weeklyHours - allocated}h</span>
           </div>
           <div class="cap-card">
             <span class="cap-label">Utilization</span>
             <span class="cap-value ${utilization > 100 ? 'over-capacity' : ''}">${utilization}%</span>
           </div>
         </div>

         <!-- Period toggle -->
         <div class="period-toggle">
           <button onclick="switchMyCapPeriod('daily')" class="period-btn">Daily</button>
           <button onclick="switchMyCapPeriod('weekly')" class="period-btn active">Weekly</button>
           <button onclick="switchMyCapPeriod('monthly')" class="period-btn">Monthly</button>
         </div>

         <!-- Allocation breakdown by initiative/plan -->
         <div id="my-capacity-breakdown">
           ${renderMyAllocationBreakdown()}
         </div>
       </div>
     `;
   }
   ```

---

## Fix 7: Today Line — Still Broken on Desktop

**Problem:** The "today" line on the roadmap is STILL sitting on the far left on the desktop app instead of the actual current date. This was supposedly fixed previously but it's still broken.

**Approach:**
1. Find the today line code:
   ```bash
   grep -n "todayLine\|today-line\|today.*marker\|positionTodayLine\|current.*day.*line\|today.*position" renderer/index.html | head -20
   ```

2. **Read the entire today line function** — view the full implementation, not just grep:
   ```bash
   # Find the function and read 30+ lines around it
   ```

3. **Common reasons it's still broken:**
   - The `getTimelineStartDate()` or `getTimelineEndDate()` functions return wrong values
   - The timeline container element ID has changed
   - The position calculation uses `offsetWidth` but the element hasn't rendered yet (timing issue)
   - The FY start month configuration changes the quarter boundaries but the today line calculation doesn't account for it
   - On desktop (Electron), the window might load before the DOM is fully painted

4. **Definitive fix:**
   ```javascript
   function positionTodayLine() {
     const todayLine = document.getElementById('today-line');
     if (!todayLine) {
       console.warn('Today line element not found');
       return;
     }

     const now = new Date();

     // Find the timeline content area (the scrollable/zoomable part with quarter columns)
     // Try multiple selectors to find the right container
     const container = document.querySelector('.timeline-content') ||
                       document.querySelector('.timeline-body') ||
                       document.querySelector('.roadmap-timeline') ||
                       document.getElementById('timeline-container');

     if (!container) {
       console.warn('Timeline container not found');
       return;
     }

     // Get the date range from the rendered quarter columns
     const quarterCols = container.querySelectorAll('[data-start-date], .quarter-column, .timeline-column');
     if (quarterCols.length === 0) {
       console.warn('No quarter columns found');
       return;
     }

     // Calculate the full timeline range from the columns
     let timelineStartDate = null;
     let timelineEndDate = null;

     // Try to get dates from data attributes
     quarterCols.forEach(col => {
       const startAttr = col.dataset.startDate || col.dataset.start;
       const endAttr = col.dataset.endDate || col.dataset.end;

       if (startAttr) {
         const d = new Date(startAttr);
         if (!timelineStartDate || d < timelineStartDate) timelineStartDate = d;
       }
       if (endAttr) {
         const d = new Date(endAttr);
         if (!timelineEndDate || d > timelineEndDate) timelineEndDate = d;
       }
     });

     // Fallback: calculate from FY settings
     if (!timelineStartDate || !timelineEndDate) {
       const fyStart = currentData?.settings?.fyStartMonth || 1;
       const years = currentData?.settings?.timelineYears || [now.getFullYear()];
       const firstYear = Math.min(...years);
       const lastYear = Math.max(...years);

       timelineStartDate = new Date(firstYear, fyStart - 1, 1);
       timelineEndDate = new Date(lastYear + 1, fyStart - 1, 0); // last day of FY
     }

     // Calculate position
     const totalMs = timelineEndDate.getTime() - timelineStartDate.getTime();
     const nowMs = now.getTime() - timelineStartDate.getTime();

     if (totalMs <= 0) {
       todayLine.style.display = 'none';
       return;
     }

     const percentage = (nowMs / totalMs) * 100;

     if (percentage < 0 || percentage > 100) {
       todayLine.style.display = 'none';
       return;
     }

     todayLine.style.display = 'block';
     todayLine.style.left = `${percentage}%`;
     todayLine.style.position = 'absolute';
     todayLine.style.top = '0';
     todayLine.style.bottom = '0';
     todayLine.style.width = '2px';
     todayLine.style.background = '#ef4444';
     todayLine.style.zIndex = '5';
     todayLine.style.pointerEvents = 'none';
   }
   ```

5. **Call the function with a delay** to ensure DOM is ready:
   ```javascript
   // After rendering the roadmap
   function afterRoadmapRender() {
     // Use requestAnimationFrame to ensure DOM is painted
     requestAnimationFrame(() => {
       requestAnimationFrame(() => {
         positionTodayLine();
       });
     });
   }
   ```

6. **Also call on:**
   - Window resize
   - Timeline scroll
   - Quarter add/remove
   - FY configuration change
   - Page visibility change (when user switches back to roadmap tab)

---

## Fix 8: Roadmap Date Range Filter

**Problem:** Users want the ability to filter the roadmap view by date range — select a start and end date and only see initiatives that fall within that range.

**Approach:**
1. **Add a date range picker to the roadmap toolbar (inside the "Data" dropdown or alongside the legend):**
   ```html
   <div class="date-range-filter">
     <button onclick="toggleDateRangeFilter()" class="btn-sm btn-outline" title="Filter by date range">
       <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor" stroke-width="1.5" fill="none">
         <rect x="3" y="4" width="14" height="14" rx="2"/>
         <line x1="3" y1="8" x2="17" y2="8"/>
         <line x1="7" y1="2" x2="7" y2="5"/>
         <line x1="13" y1="2" x2="13" y2="5"/>
       </svg>
       Date Range
     </button>
     <div id="date-range-panel" class="dropdown-panel" style="display:none;">
       <div class="form-group">
         <label>From</label>
         <input type="date" id="roadmap-date-from" onchange="applyDateRangeFilter()">
       </div>
       <div class="form-group">
         <label>To</label>
         <input type="date" id="roadmap-date-to" onchange="applyDateRangeFilter()">
       </div>
       <div class="quick-ranges">
         <button onclick="setQuickRange('this-quarter')">This Quarter</button>
         <button onclick="setQuickRange('next-quarter')">Next Quarter</button>
         <button onclick="setQuickRange('this-fy')">This FY</button>
         <button onclick="setQuickRange('next-6m')">Next 6 Months</button>
         <button onclick="setQuickRange('all')">Show All</button>
       </div>
       <button onclick="clearDateRangeFilter()" class="btn-sm btn-outline">Clear Filter</button>
     </div>
   </div>
   ```

2. **Filter logic:**
   ```javascript
   function applyDateRangeFilter() {
     const from = document.getElementById('roadmap-date-from').value;
     const to = document.getElementById('roadmap-date-to').value;

     if (!from && !to) {
       clearDateRangeFilter();
       return;
     }

     const fromDate = from ? new Date(from) : new Date(0);
     const toDate = to ? new Date(to) : new Date(9999, 11, 31);

     // Filter rows: hide rows whose date range doesn't overlap with the filter range
     document.querySelectorAll('.roadmap-row, .timeline-row, [data-row-id]').forEach(row => {
       const rowStart = row.dataset.startDate ? new Date(row.dataset.startDate) : null;
       const rowEnd = row.dataset.endDate ? new Date(row.dataset.endDate) : null;

       // Show if any overlap
       const overlaps = (!rowStart || rowStart <= toDate) && (!rowEnd || rowEnd >= fromDate);
       row.style.display = overlaps ? '' : 'none';
     });

     // Also adjust the timeline viewport/scroll to center on the date range
     scrollTimelineToDate(fromDate);

     // Show active filter indicator
     document.querySelector('.date-range-filter')?.classList.add('filter-active');
   }

   function setQuickRange(preset) {
     const now = new Date();
     const currentYear = now.getFullYear();
     const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
     let from, to;

     switch(preset) {
       case 'this-quarter':
         from = new Date(currentYear, (currentQuarter - 1) * 3, 1);
         to = new Date(currentYear, currentQuarter * 3, 0);
         break;
       case 'next-quarter':
         const nextQ = currentQuarter === 4 ? 1 : currentQuarter + 1;
         const nextQYear = currentQuarter === 4 ? currentYear + 1 : currentYear;
         from = new Date(nextQYear, (nextQ - 1) * 3, 1);
         to = new Date(nextQYear, nextQ * 3, 0);
         break;
       case 'this-fy':
         const fyStart = currentData?.settings?.fyStartMonth || 1;
         from = new Date(currentYear, fyStart - 1, 1);
         to = new Date(currentYear + 1, fyStart - 1, 0);
         break;
       case 'next-6m':
         from = now;
         to = new Date(currentYear, now.getMonth() + 6, now.getDate());
         break;
       case 'all':
         clearDateRangeFilter();
         return;
     }

     document.getElementById('roadmap-date-from').value = from.toISOString().split('T')[0];
     document.getElementById('roadmap-date-to').value = to.toISOString().split('T')[0];
     applyDateRangeFilter();
   }
   ```

---

## Fix 9: In-App Notifications + Email Alerts System

**Problem:** Users need notifications within the app and desktop when tasks are assigned to them, plus configurable alerts for roadmap changes, late tasks, shipped products, and feedback received.

### Part A: In-App Notification on Task Assignment
1. Find task assignment logic:
   ```bash
   grep -n "assignTask\|task.*owner\|task.*assignee\|assign.*user\|setOwner" renderer/index.html | head -15
   ```

2. When a task is assigned, create a notification:
   ```javascript
   function onTaskAssigned(task, assigneeId, assignerName) {
     // Create in-app notification
     if (!currentData.notifications) currentData.notifications = [];
     currentData.notifications.push({
       id: generateId(),
       type: 'task_assigned',
       title: 'New Task Assigned',
       body: `${assignerName || 'Someone'} assigned you "${task.name}"`,
       entityId: task.id,
       entityType: 'task',
       read: false,
       createdAt: new Date().toISOString(),
     });
     saveData();
     updateNotificationBadge();

     // Send email notification via edge function
     sendNotificationEmail(assigneeId, {
       subject: `[Roadmap OS] New task assigned: ${task.name}`,
       body: `You've been assigned a task: "${task.name}"\n\nPriority: ${task.priority || 'Medium'}\n\nLog in to view: https://app.pmroadmapper.com`,
     });

     // Desktop notification (Electron)
     if (window.electronAPI?.showNotification) {
       window.electronAPI.showNotification({
         title: 'New Task Assigned',
         body: `${assignerName || 'Someone'} assigned you "${task.name}"`,
       });
     }

     // Web notification (if permission granted)
     if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
       new Notification('Roadmap OS — New Task', {
         body: `You've been assigned: "${task.name}"`,
         icon: '/favicon.ico',
       });
     }
   }
   ```

### Part B: Configurable Alerts
1. Add an "Alerts" section in Settings or the notification preferences:
   ```javascript
   function renderAlertSettings() {
     const alerts = currentData?.settings?.alerts || {
       roadmapChange: true,
       productShipped: true,
       taskLate: true,
       feedbackReceived: true,
     };

     return `
       <div class="alert-settings">
         <h3>Alert Preferences</h3>
         <div class="alert-toggle">
           <label>
             <input type="checkbox" ${alerts.roadmapChange ? 'checked' : ''}
                    onchange="toggleAlert('roadmapChange', this.checked)">
             Roadmap changes (rows added, edited, deleted)
           </label>
         </div>
         <div class="alert-toggle">
           <label>
             <input type="checkbox" ${alerts.productShipped ? 'checked' : ''}
                    onchange="toggleAlert('productShipped', this.checked)">
             Product released or shipped
           </label>
         </div>
         <div class="alert-toggle">
           <label>
             <input type="checkbox" ${alerts.taskLate ? 'checked' : ''}
                    onchange="toggleAlert('taskLate', this.checked)">
             Task or plan is late / overdue
           </label>
         </div>
         <div class="alert-toggle">
           <label>
             <input type="checkbox" ${alerts.feedbackReceived ? 'checked' : ''}
                    onchange="toggleAlert('feedbackReceived', this.checked)">
             Feedback received for initiatives you're involved with
           </label>
         </div>
       </div>
     `;
   }
   ```

2. **Trigger alerts** at the relevant points:
   - Roadmap change: hook into `logRoadmapChange()` from Fix 5
   - Product shipped: when row status changes to "Released" or "Shipped"
   - Task late: check on app load and periodically — compare task due dates to today
   - Feedback received: when new feedback is submitted via the edge function

3. **Request browser notification permission** on first login:
   ```javascript
   function requestNotificationPermission() {
     if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
       Notification.requestPermission();
     }
   }
   ```

---

## Fix 10: Dashboard — Replace "Shared with Me" Card with Plan Count Overview

**Problem:** Remove the "Shared with me" card on the dashboard and replace it with an overview card showing the number of plans.

**Approach:**
1. Find the dashboard cards:
   ```bash
   grep -n "Shared with me\|shared.*card\|sharedWithMe\|dashboard.*card" renderer/index.html | head -15
   ```

2. **Remove the "Shared with me" card.**

3. **Add a "Plans Overview" card:**
   ```javascript
   function renderPlansOverviewCard() {
     const plans = getAllPlans(); // however plans are accessed
     const totalPlans = plans.length;
     const activePlans = plans.filter(p => p.status !== 'Completed' && p.status !== 'Archived').length;
     const completedPlans = plans.filter(p => p.status === 'Completed').length;
     const totalTasks = plans.reduce((sum, p) => sum + (p.tasks?.length || 0), 0);

     return `
       <div class="dashboard-card">
         <div class="card-header">
           <span class="card-icon">
             <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none">
               <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
               <rect x="9" y="3" width="6" height="4" rx="1"/>
               <line x1="9" y1="12" x2="15" y2="12"/>
               <line x1="9" y1="16" x2="13" y2="16"/>
             </svg>
           </span>
           <h4>Plans</h4>
         </div>
         <div class="card-stats">
           <div class="stat">
             <span class="stat-value">${totalPlans}</span>
             <span class="stat-label">Total Plans</span>
           </div>
           <div class="stat">
             <span class="stat-value">${activePlans}</span>
             <span class="stat-label">Active</span>
           </div>
           <div class="stat">
             <span class="stat-value">${completedPlans}</span>
             <span class="stat-label">Completed</span>
           </div>
           <div class="stat">
             <span class="stat-value">${totalTasks}</span>
             <span class="stat-label">Total Tasks</span>
           </div>
         </div>
       </div>
     `;
   }
   ```

---

## Fix 11: Capacity IQ — Remove Initiatives, Sprints, Task Reference (Confirmation)

**Problem:** These were supposed to be removed in v8 Fix 4. Verify they are actually gone. If not, remove them now.

**Approach:**
1. Check if they still exist:
   ```bash
   grep -n "initiative.*tab.*capacity\|sprint.*tab.*capacity\|task.*reference.*capacity" renderer/index.html | head -10
   ```
2. If any remain, remove the tabs, content panels, and nav items.
3. The Capacity IQ page should only have: Dashboard, Teams/People, Templates, My Capacity.

---

## Post-Fix Checklist

1. **Capacity IQ templates:** All cards have SVG icons, are clickable, open focused view, editing works, save persists, search works.
2. **Capacity Dashboard:** Shows individual users if no teams. Shows real capacity data.
3. **Edit Team:** Dropdown for org users, no horizontal scroller, description field, proper add/invite flow.
4. **Add Team:** Proper popup with name, description, color, member selection.
5. **Reports Dashboard:** Renamed from Strategy. Change log visible. Multi-period capacity (daily/weekly/monthly/quarterly/yearly).
6. **My Capacity:** Removed from KPI Scorecard, added to Capacity IQ.
7. **Today line:** Correctly positioned on the actual current date on BOTH web and desktop.
8. **Date range filter:** Can filter roadmap view by date range with quick presets.
9. **Notifications:** In-app + desktop + email on task assignment. Alert preferences configurable.
10. **Dashboard:** Plans overview card replaces "Shared with me."
11. **Removals verified:** Initiatives, Sprints, Task Reference gone from Capacity IQ.
12. **Dark mode:** All new elements use CSS variables.
13. **Emoji sweep:** `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` — must be 0.
14. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
15. **Bump version** in `package.json`
16. **Rebuild web:** `cd web && npm run build`
17. **Commit:** `git add -A && git commit -m "vX.Y.Z: v9 — CIQ templates, team mgmt, reports dashboard, notifications, date range, today line fix"`
18. **Update FIX_LOG_V9.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V9.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix.** Re-read changes, check syntax, verify both light and dark mode.
4. **If a fix is blocked**, implement what you can, add `// TODO:` comments, log it, move on.
5. **Preserve existing patterns.** Match the codebase style.
6. **Both modes matter.** Every element uses CSS variables.
7. **Keep the single-file SPA pattern.** All UI changes in `renderer/index.html`.
8. **Zero emoji.** Health indicators = SVG dots. Icons = SVG stroke-based. No unicode emoji anywhere.
9. **Fix 7 (today line) has been reported THREE times.** Get it right this time. Read the FULL function, understand the timeline date math, use `requestAnimationFrame` for timing, and test with the actual FY configuration.
10. **Fix 3 (edit team) must prevent modal stacking.** Call `closeAllModals()` before opening a new one.
11. **Fix 9 (notifications) requires edge function calls for email.** If the notifications-api edge function exists, use it. If not, implement the frontend and log the backend requirement.
12. **The change log (Fix 5B) hooks into existing functions.** Find every place roadmap data is modified and add a `logRoadmapChange()` call. Don't miss any — grep thoroughly.
