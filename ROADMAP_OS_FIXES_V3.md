# Roadmap OS — Autonomous Fix Queue v3

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V3.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/`
- Data stored as one JSONB blob per user in `roadmap_data` table
- Navigation: `showPage('pageId')` pattern
- Dark mode: CSS variables + class toggle
- ZERO emoji policy — use SVG icons only (stroke-based, `currentColor`, matching sidebar style)
- All new elements MUST support both light and dark mode with proper contrast

**Before starting:**
1. `grep -n "function showPage\|function loadRoadmap\|function importJSON\|uploadJSON\|restoreBackup" renderer/index.html | head -30`
2. `grep -n "taskLibrary\|task-library\|templateLibrary\|template-library" renderer/index.html | head -30`
3. `grep -n "editMember\|Edit Membership\|edit-membership\|teamModal" renderer/index.html | head -30`
4. `grep -n "stackRoadmap\|stack-roadmap\|mergeRoadmap\|merge-roadmap" renderer/index.html | head -30`
5. `grep -n "onboarding\|setup-flow\|welcome-wizard\|product-tour\|guided-tour" renderer/index.html | head -20`
6. Log all findings in `FIX_LOG_V3.md`

---

## Fix 1: JSON Roadmap Upload — Not Working + Loading Animation

**Problem:** On the web app, uploading a JSON roadmap does nothing — no response, no data loaded. Need a loading animation with the Roadmap OS logo while uploading.

**Approach:**
1. Find the JSON upload handler:
   ```bash
   grep -n "importJSON\|uploadJSON\|restoreBackup\|\.json.*upload\|fileReader.*json\|JSON\.parse.*roadmap" renderer/index.html | head -20
   ```

2. Diagnose why it fails on web:
   - Check if the file picker is using `window.electronAPI.openFile()` which may not be shimmed correctly for web
   - Check if `FileReader` is being used correctly (it's async — common bug is not waiting for `onload`)
   - Check if the parsed JSON is being written to the correct data structure and if sync is triggered
   - Check the web shim (`web/shim/electronAPI.js`) for the file open implementation

3. Fix the upload flow:
   ```javascript
   async function importJSONRoadmap() {
     const input = document.createElement('input');
     input.type = 'file';
     input.accept = '.json';
     input.onchange = async (e) => {
       const file = e.target.files[0];
       if (!file) return;

       // Show loading overlay
       showLoadingOverlay('Uploading your roadmap...');

       try {
         const text = await file.text();
         const data = JSON.parse(text);

         // Validate structure
         if (!data || typeof data !== 'object') {
           throw new Error('Invalid roadmap file');
         }

         // Merge or replace current data
         // ... (match existing pattern)

         // Sync to server
         await syncRoadmapData();

         // Re-render
         renderRoadmap();

         hideLoadingOverlay();
         showToast('Roadmap uploaded successfully', 'success');
       } catch (err) {
         hideLoadingOverlay();
         showToast('Failed to upload roadmap: ' + err.message, 'error');
       }
     };
     input.click();
   }
   ```

4. **Create a branded loading overlay:**
   ```html
   <div id="loading-overlay" style="display:none;">
     <div class="loading-content">
       <div class="loading-logo">
         <!-- Roadmap OS logo SVG or text -->
         <svg class="loading-spinner" viewBox="0 0 50 50">
           <circle cx="25" cy="25" r="20" fill="none" stroke="var(--accent-color)"
                   stroke-width="3" stroke-dasharray="31.4 31.4"
                   stroke-linecap="round">
             <animateTransform attributeName="transform" type="rotate"
                               from="0 25 25" to="360 25 25" dur="1s"
                               repeatCount="indefinite"/>
           </circle>
         </svg>
       </div>
       <p class="loading-text" id="loading-message">Loading...</p>
     </div>
   </div>
   ```
   ```css
   #loading-overlay {
     position: fixed; top: 0; left: 0; right: 0; bottom: 0;
     background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
     display: flex; align-items: center; justify-content: center;
     z-index: 10000;
   }
   .loading-content {
     text-align: center; padding: 40px;
     background: var(--card-bg, #fff); border-radius: 16px;
     box-shadow: 0 20px 60px rgba(0,0,0,0.3);
   }
   .loading-spinner { width: 48px; height: 48px; margin-bottom: 16px; }
   .loading-text {
     color: var(--text-primary); font-size: 15px; font-weight: 500;
     margin: 0;
   }
   ```

5. Create reusable functions:
   ```javascript
   function showLoadingOverlay(message) {
     document.getElementById('loading-message').textContent = message || 'Loading...';
     document.getElementById('loading-overlay').style.display = 'flex';
   }
   function hideLoadingOverlay() {
     document.getElementById('loading-overlay').style.display = 'none';
   }
   ```

6. Use this loading overlay for ALL async operations: JSON upload, Excel import, sync, backup restore, template import.

---

## Fix 2: Profile Photo Not Showing in Top Right

**Problem:** User has uploaded a profile photo but the top-right avatar only shows their initials, not the photo.

**Approach:**
1. Find the avatar rendering:
   ```bash
   grep -n "avatar\|profile-pic\|profile.*photo\|user-avatar\|initials" renderer/index.html | head -20
   ```

2. Check:
   - Where is the profile photo stored? (Supabase Storage, localStorage base64, or `user_metadata`?)
   - Is the avatar element checking for a photo URL on load?
   - Is the photo URL being fetched correctly from Supabase Storage?

3. Fix the avatar load logic:
   ```javascript
   async function loadUserAvatar() {
     const avatarImg = document.getElementById('user-avatar-img');
     const avatarInitials = document.getElementById('user-avatar-initials');

     // Check multiple sources
     let photoUrl = null;

     // Source 1: Supabase user_metadata
     const user = await getUser(); // or however auth user is accessed
     if (user?.user_metadata?.avatar_url) {
       photoUrl = user.user_metadata.avatar_url;
     }

     // Source 2: Google OAuth avatar (stored in user_metadata by Supabase Auth)
     if (!photoUrl && user?.user_metadata?.picture) {
       photoUrl = user.user_metadata.picture;
     }

     // Source 3: Custom upload in app data
     if (!photoUrl && currentData?.settings?.profilePicture) {
       photoUrl = currentData.settings.profilePicture;
     }

     // Source 4: Supabase Storage
     if (!photoUrl) {
       try {
         const { data } = await supabase.storage
           .from('attachments')
           .getPublicUrl(`${user.id}/profile/avatar`);
         if (data?.publicUrl) {
           // Verify it exists with a HEAD request or try loading
           photoUrl = data.publicUrl;
         }
       } catch(e) { /* no avatar in storage */ }
     }

     if (photoUrl) {
       avatarImg.src = photoUrl;
       avatarImg.style.display = 'block';
       avatarImg.onerror = () => {
         avatarImg.style.display = 'none';
         avatarInitials.style.display = 'flex';
       };
       avatarInitials.style.display = 'none';
     } else {
       avatarImg.style.display = 'none';
       avatarInitials.style.display = 'flex';
     }
   }
   ```

4. Call `loadUserAvatar()` on login/page load and after profile picture upload.

---

## Fix 3: Task Library — Missing 500 Tasks + Population Fix

**Problem:** Tasks that were supposed to be pre-loaded (500+) are not showing in the Task Library. The Task Library isn't being populated from task creation in other modules.

**Approach:**
1. Find the Task Library data and rendering:
   ```bash
   grep -n "taskLibrary\|task-library\|renderTaskLibrary\|loadTaskLibrary" renderer/index.html | head -30
   ```

2. **Check if default/seed tasks exist:**
   - Search for where default templates or seed data are defined
   - If there's a hardcoded task list that should be loaded on first use, verify it's actually being written to `currentData.taskLibrary`

3. **Ensure the Task Library is initialized:**
   ```javascript
   function ensureTaskLibrary() {
     if (!currentData.taskLibrary) {
       currentData.taskLibrary = [];
     }
     // If empty and this is a new user, seed with default tasks
     if (currentData.taskLibrary.length === 0) {
       currentData.taskLibrary = getDefaultTaskLibrary();
     }
   }
   ```

4. **Build a comprehensive default task library.** Create at minimum 200 realistic tasks organized by category. Include the GoToMarket launch template tasks. Each task needs:
   ```javascript
   {
     id: generateId(),
     name: 'Task name',
     hours: estimatedHours,
     category: 'Engineering|Marketing|Sales|Support|Legal|Design|QA|DevOps|Product|Operations',
     priority: 'High|Medium|Low',
     description: 'Brief description',
     source: 'template',
     templateName: 'GoToMarket Launch|Agile Sprint|Product Launch|...',
     createdAt: new Date().toISOString()
   }
   ```

5. **Categories and realistic task sets to include:**

   **GoToMarket Launch Template** (the one starting with "Is there a VBU number?"):
   - Replicate ALL tasks from the existing GoToMarket template
   - Include every task from the 132-field template that was previously built
   - Realistic timelines (not AI-guessed — use standard PM timeframes)

   **Product Development:**
   - Requirements gathering, PRD writing, design review, API design, sprint planning, code review, QA testing, UAT, deployment, post-launch monitoring, etc.

   **Marketing:**
   - Market research, competitor analysis, positioning doc, messaging framework, content calendar, launch blog, social media plan, press release, analyst briefing, webinar prep, etc.

   **Engineering:**
   - Architecture review, tech spec, database design, API development, frontend build, integration testing, load testing, security audit, CI/CD setup, documentation, etc.

   **Sales Enablement:**
   - Sales deck, battle cards, demo script, pricing sheet, objection handling doc, CRM setup, territory planning, pipeline review, etc.

   **Security & Compliance:**
   - Threat modeling, penetration testing, GDPR compliance check, SOC 2 prep, access control review, incident response plan, etc.

   **Infrastructure:**
   - Server provisioning, monitoring setup, backup configuration, disaster recovery plan, performance optimization, cost optimization, etc.

6. **Cross-module population — wire up task creation hooks:**
   Find EVERY place where tasks are created and add the `addToTaskLibrary()` call:
   ```bash
   grep -n "\.push(\|addTask\|createTask\|newTask\|addItem\|addChecklist\|saveTask" renderer/index.html | head -40
   ```
   In each task creation function, after the task is saved to its module's data, also call:
   ```javascript
   addToTaskLibrary({
     name: task.name || task.title,
     hours: task.hours || task.estimatedHours || null,
     category: determineCategory(sourceModule),
     source: sourceModule, // 'todo', 'plans', 'g2m', 'capacityiq'
   });
   ```

---

## Fix 4: Task Library UI — Edit/Delete Buttons + Inline Editing

**Problem:** Edit and delete buttons are stacked vertically (on top of each other). Each row should support direct inline editing without clicking Edit.

**Approach:**
1. Find the Task Library row rendering:
   ```bash
   grep -n "task-library.*row\|taskLibrary.*item\|renderTask.*library\|task-row" renderer/index.html | head -20
   ```

2. **Fix button layout:**
   - Put Edit and Delete buttons side by side (horizontal, not stacked):
   ```css
   .task-actions {
     display: flex; gap: 8px; align-items: center;
     flex-shrink: 0;
   }
   .task-actions button {
     padding: 6px 12px; border-radius: 6px;
     font-size: 12px; cursor: pointer;
     border: 1px solid var(--border-color);
     background: var(--surface-bg);
     color: var(--text-primary);
   }
   ```

3. **Inline editing:**
   - Make task name, hours, and category cells directly editable on click (not requiring a separate Edit button)
   - Use `contenteditable="true"` on the text cells, or replace with an input on click
   - Auto-save on blur or Enter key
   - Keep the Edit button for opening a full edit modal (for description, priority, etc.)
   - Keep Delete button with a confirmation

4. **Row structure:**
   ```html
   <div class="task-library-row">
     <span class="task-name" contenteditable="true"
           onblur="updateTaskField(taskId, 'name', this.textContent)">Task Name</span>
     <span class="task-hours" contenteditable="true"
           onblur="updateTaskField(taskId, 'hours', this.textContent)">4</span>
     <span class="task-category">Engineering</span>
     <span class="task-source-badge">Plans</span>
     <div class="task-actions">
       <button onclick="editTaskDetails('${taskId}')">Edit</button>
       <button onclick="deleteTask('${taskId}')" class="btn-danger">Delete</button>
     </div>
   </div>
   ```

---

## Fix 5: Edit Membership — Fix Stacking Modals + Usability

**Problem:** Clicking "Edit Membership" opens a module listing teams but you can't edit anything — only a "Done" button. Clicking again opens another stacked modal. This repeats infinitely.

**Approach:**
1. Find the edit membership handler:
   ```bash
   grep -n "editMembership\|Edit Membership\|edit-membership\|teamMembership\|membershipModal" renderer/index.html | head -20
   ```

2. **Fix the stacking bug:**
   - The modal is likely appending a new element each time instead of toggling an existing one
   - Fix: check if modal already exists before creating. Use a single modal element with `display:none/flex` toggle
   - Or: close any existing modal before opening a new one
   ```javascript
   function openEditMembership(teamId) {
     // Close any existing modal first
     closeAllModals();

     // Show the single membership modal
     const modal = document.getElementById('membership-modal');
     // ... populate and show
   }
   ```

3. **Make it functional:**
   - The modal should list team members with their roles
   - Each member row should have:
     - Name/email
     - Role dropdown (Member, Lead) — editable
     - Remove button (with confirmation)
   - "Add Member" button at the bottom — opens a search/email input to add a new member
   - Save and Cancel buttons (not just "Done")

---

## Fix 6: Capacity IQ Templates — Light Mode Text Fix + List All Templates

**Problem:** In light mode, template text is too light to read. Also, all previously built templates should be listed.

**Approach:**
1. Find CapacityIQ template rendering:
   ```bash
   grep -n "capacity.*template\|capacityTemplate\|CapacityIQ.*template" renderer/index.html | head -20
   ```

2. **Fix light mode contrast:**
   - The text color is likely a light grey (`#ccc`, `#999`, or similar) that works in dark mode but washes out in light mode
   - Fix: use `var(--text-primary)` which should be dark in light mode and light in dark mode
   - Check ALL text elements on this page for proper contrast in BOTH modes

3. **List all templates:**
   - Find where templates are defined: `grep -n "templateData\|defaultTemplates\|capacityTemplates" renderer/index.html | head -20`
   - Ensure every template that was built is included in the template list
   - If templates are stored in a variable/array, verify the array is complete

---

## Fix 7: Capacity IQ — Initiatives Section Fix

**Problem:** The "New Initiative" button is cut off at the top. It says "No initiatives" but should auto-pull all initiatives from the roadmap.

**Approach:**
1. Find the CapacityIQ initiatives section:
   ```bash
   grep -n "capacity.*initiative\|capacityInitiative\|no initiatives\|No initiatives" renderer/index.html | head -20
   ```

2. **Fix button positioning:**
   - Add `margin-top: 16px` or appropriate spacing to push the button down
   - Ensure the button is fully visible within its container (check for `overflow: hidden` on parent)

3. **Auto-pull initiatives from roadmap:**
   ```javascript
   function loadCapacityInitiatives() {
     const initiatives = [];
     if (currentData?.sections) {
       currentData.sections.forEach(section => {
         if (section.rows) {
           section.rows.forEach(row => {
             initiatives.push({
               id: row.id,
               name: row.name,
               section: section.name,
               status: row.status,
               priority: row.priority,
               owner: row.owner,
               dateRange: row.dateRange
             });
           });
         }
       });
     }
     return initiatives;
   }
   ```
   - Call this when the CapacityIQ initiatives page renders
   - Display all roadmap initiatives with the ability to assign teams and allocate capacity

---

## Fix 8: Team Management — Full Overhaul

**Problem:** Teams need descriptions, direct inline editing, member association, and should list all associated initiatives and project plans.

**Approach:**
1. Find team rendering:
   ```bash
   grep -n "team-card\|teamCard\|renderTeam\|team-list\|teamList" renderer/index.html | head -20
   ```

2. **Extend team data model:**
   ```javascript
   team = {
     id: 'team-id',
     name: 'Platform Team',
     description: 'Responsible for core platform infrastructure',
     color: '#3b82f6',
     members: [
       { userId: '...', email: '...', name: '...', role: 'lead' },
       { userId: '...', email: '...', name: '...', role: 'member' }
     ],
     createdBy: 'user-id',
     createdAt: '...',
     updatedAt: '...'
   };
   ```

3. **Team card/row should display:**
   - Team name (editable inline or via edit button)
   - Description (editable)
   - Member count with avatar circles
   - Edit button that opens a proper team editor modal:
     - Name field
     - Description textarea
     - Color picker
     - Member list with add/remove
     - Add member: email input with search across contacts
   - **Associated Initiatives:** Auto-populated from roadmap rows where `row.team === team.name` or `row.teamId === team.id`. Show as a list with status badges.
   - **Associated Plans:** Auto-populated from plans where the plan is linked to this team. Show plan name + progress.

4. **Ensure this works across CapacityIQ and the Team management page.**

---

## Fix 9: Stacked Roadmaps — Remove, Add Rows/Sections, Merge

**Problem:** Once you stack a roadmap, you can't remove it, can't add rows/sections/initiatives, and can't merge two roadmaps.

**Approach:**
1. Find stacked roadmap functionality:
   ```bash
   grep -n "stackRoadmap\|stack-roadmap\|stacked\|stackedRoadmap\|combineRoadmap" renderer/index.html | head -20
   ```

2. **Add "Remove from Stack" button:**
   - Each stacked roadmap should have an "×" button or "Unstack" option
   - Clicking it removes that roadmap from the stacked view (doesn't delete the roadmap itself)

3. **Add row/section/initiative controls:**
   - When viewing a stacked roadmap, the toolbar should still show "Add Row", "Add Section", etc.
   - These actions should add to the currently selected/primary roadmap in the stack
   - If there's ambiguity about which roadmap to add to, show a dropdown to select the target roadmap

4. **Merge functionality:**
   - Add a "Merge Roadmaps" button in the roadmap toolbar or stacked view
   - Merge modal:
     - Select source roadmap (from stacked or shared roadmaps)
     - Preview sections and rows that will be merged
     - Option: "Merge into current" (adds source sections/rows to the primary roadmap)
     - Option: "Create new merged roadmap" (creates a new roadmap combining both)
     - Conflict handling: if section names match, offer to merge rows into existing section or create duplicate
   - After merge, sync the combined data

5. **Implementation:**
   ```javascript
   function mergeRoadmaps(primaryData, sourceData, mode) {
     if (mode === 'merge-into-current') {
       sourceData.sections.forEach(srcSection => {
         const existingSection = primaryData.sections.find(
           s => s.name.toLowerCase() === srcSection.name.toLowerCase()
         );
         if (existingSection) {
           // Merge rows into existing section
           srcSection.rows.forEach(row => {
             row.id = generateId(); // new ID to avoid conflicts
             row.mergedFrom = sourceData.ownerEmail || 'merged';
             existingSection.rows.push(row);
           });
         } else {
           // Add entire section
           srcSection.id = generateId();
           primaryData.sections.push(srcSection);
         }
       });
     }
     return primaryData;
   }
   ```

---

## Fix 10: Roadmap Page — Auto-Populate Owner + Collaborators Field

**Problem:** The roadmap should show the owner's username automatically. If roadmaps are merged/shared, show collaborators.

**Approach:**
1. Find where the roadmap owner/name is displayed:
   ```bash
   grep -n "roadmap.*owner\|roadmap.*name\|roadmapTitle\|roadmap-header\|your name" renderer/index.html | head -20
   ```

2. **Auto-populate owner:**
   - On roadmap creation, store `ownerId` and `ownerName` (from auth user) in the roadmap data
   - Display the owner name in the roadmap header/title area
   - If the user hasn't set a display name, derive from email (part before @)

3. **Collaborators field:**
   ```javascript
   roadmapData.collaborators = [
     { email: 'user@example.com', name: 'User Name', role: 'editor', addedAt: '...' }
   ];
   ```
   - Auto-populated when a roadmap is shared or merged
   - Display as small avatar circles or a comma-separated list next to the owner name
   - "Add Collaborator" button that uses the existing share/invite flow

---

## Fix 11: Template Library — Quality Overhaul + Missing Tasks

**Problem:** The platform templates are low quality with unrealistic timelines and tasks. The 500 tasks and the GoToMarket launch template with all its tasks weren't included.

**Approach:**
1. Find the template definitions:
   ```bash
   grep -n "defaultTemplate\|templateData\|planTemplate\|platformTemplate\|builtInTemplate" renderer/index.html | head -30
   ```

2. **Overhaul ALL default templates with realistic content:**

   Create comprehensive, realistic templates. Each template should have phases with realistic task names and timeframes. Here are the templates to build:

   **Template 1: GoToMarket Product Launch** (this is the primary one — include ALL tasks from the existing 132-field template)
   - Phase 1: Pre-Launch Planning (Weeks 1-4)
   - Phase 2: Development & Build (Weeks 5-12)
   - Phase 3: Testing & QA (Weeks 13-16)
   - Phase 4: Launch Preparation (Weeks 17-18)
   - Phase 5: Launch Execution (Week 19)
   - Phase 6: Post-Launch (Weeks 20-24)
   Include every existing task from the GoToMarket template. If the template has "Is there a VBU number?" as a starting task, include that exact task and all subsequent ones.

   **Template 2: Agile Sprint Cycle**
   - Sprint Planning, Backlog Grooming, Daily Standups, Sprint Review, Retrospective, etc.
   - Realistic 2-week sprint tasks

   **Template 3: Product Discovery**
   - User Research, Competitive Analysis, Jobs-to-be-Done interviews, Opportunity mapping, Solution sketching, Prototype testing

   **Template 4: Security Audit & Compliance**
   - Threat modeling, Vulnerability assessment, Penetration testing, Compliance review (GDPR, SOC 2), Incident response plan, Access control audit

   **Template 5: Frontend Development**
   - Design system setup, Component library, Responsive layouts, Accessibility audit, Cross-browser testing, Performance optimization, Storybook documentation

   **Template 6: Backend Development**
   - API design, Database schema, Authentication/authorization, Rate limiting, Caching strategy, Error handling, Logging/monitoring, Load testing

   **Template 7: Marketing Campaign**
   - Campaign strategy, Content creation, Channel planning, Budget allocation, Creative brief, A/B testing, Analytics setup, ROI reporting

   **Template 8: Sales Enablement**
   - Sales deck creation, Battle cards, Demo environment, Pricing strategy, Objection handling, CRM configuration, Pipeline reporting

   **Template 9: Infrastructure & DevOps**
   - CI/CD pipeline, Container orchestration, Monitoring/alerting, Backup/disaster recovery, Security hardening, Cost optimization, Documentation

   **Template 10: Customer Onboarding**
   - Welcome flow design, Training materials, Help docs, In-app tooltips, Success metrics, Feedback loops, Health scoring

3. **Ensure realistic timelines:**
   - Don't compress everything into 1-2 days
   - Use realistic business timeframes (e.g., "Design review: 3 days", "Security audit: 2 weeks", "Beta testing: 4 weeks")
   - Include dependencies between tasks where logical

4. **All template tasks should also exist in the Task Library** so users can pull individual tasks out.

---

## Fix 12: Top Nav Button Alignment — Sitting Too High

**Problem:** On Plans page and Templates page, the buttons and name field in the top navigation bar are sitting too high. They need to be vertically centered.

**Approach:**
1. Find the top nav bar on these pages:
   ```bash
   grep -n "plans.*header\|plans.*toolbar\|plans.*nav\|template.*header\|template.*toolbar" renderer/index.html | head -20
   ```

2. Fix vertical alignment:
   ```css
   .page-toolbar, .page-header-bar {
     display: flex;
     align-items: center;     /* vertical center */
     min-height: 56px;        /* consistent height */
     padding: 0 20px;
     gap: 12px;
   }
   .page-toolbar input,
   .page-toolbar button,
   .page-toolbar select {
     margin: 0;               /* remove any margin that pushes up */
   }
   ```

3. Check ALL page headers for this issue, not just Plans and Templates.

---

## Fix 13: Template Upload via Excel/CSV + Link Back to Plans

**Problem:** Users need to upload Excel/CSV files to create templates. Templates on the templates page can't be pulled back into plans.

### Part A: Template Upload from Excel/CSV
1. Add an "Upload Template" button on the Create Template page
2. When clicked:
   - File picker for `.xlsx`, `.csv`, `.xls`
   - Parse the file using the existing Excel/CSV parser
   - Map columns: Task Name (required), Duration/Hours, Phase, Priority, Description, Dependencies
   - Show a preview table
   - "Save as Template" button that creates a new template from the parsed data
3. Store in `currentData.templateLibrary[]`

### Part B: Pull Templates Back into Plans
1. On the Plans page, add an "Import from Template" button
2. When clicked:
   - Show a modal listing all available templates (platform defaults + user-created)
   - Preview the template tasks
   - "Import" button copies all template tasks into the current plan
   - Tasks get new IDs (to avoid conflicts)
   - The plan-template link is preserved: `plan.sourceTemplate = templateId`

### Part C: Pull Templates into To-Do
1. On the To-Do page, when the user clicks "Template Library":
   - Instead of just navigating to the templates page, show a picker modal
   - List all templates
   - User selects a template
   - Template tasks are imported as To-Do items
   - Each item gets a new ID and default status "To Do"

---

## Fix 14: To-Do List — Task Library Search + Task Text Visibility

### Part A: Task Library Search
1. On the To-Do "Add Task" form, add a search input:
   - Searches across `currentData.taskLibrary`
   - Shows matching tasks in a dropdown
   - Clicking a result populates the task name/description
   - User can still manually type a custom task

### Part B: Task Text Visibility (Light Mode)
1. Find to-do task rendering:
   ```bash
   grep -n "todo.*task.*text\|todo.*item.*name\|kanban.*card.*text" renderer/index.html | head -20
   ```
2. The task text is too light in light mode — likely `color: #ccc` or `color: #999`
3. Fix:
   - Light mode text: `color: #1a1a1a` or `var(--text-primary)`
   - Ensure proper contrast in BOTH light and dark modes
   - Apply to ALL text elements on the to-do page

---

## Fix 15: Onboarding / Setup Flow for New Users

**Problem:** New users see an empty app with no guidance. Need a step-by-step onboarding flow.

**Approach:**
1. Create an onboarding system with these steps:

   **Step 1: Welcome**
   - "Welcome to Roadmap OS!" with logo
   - Brief value proposition (2 sentences)
   - "Let's set up your workspace" CTA button

   **Step 2: Create Your Roadmap**
   - Guide user to create their first roadmap
   - Show them how to add sections and initiatives
   - Highlight: "Add Section" → name it → "Add Row" → fill in initiative details
   - Use animated arrows/highlights pointing to the actual UI elements
   - Or if animations aren't feasible: clear text instructions with numbered steps and descriptions of where to click

   **Step 3: Set Up Your Team** (optional, can skip)
   - "Do you work with a team?"
   - If yes: guide them to create a team and invite members
   - Show the team creation flow
   - Option to invite via email
   - Note: all users can add team members; only admins/super admins can edit team settings

   **Step 4: Import Your Tasks & Templates**
   - "Got existing tasks? Import them!"
   - Show options:
     - Upload Excel/CSV with tasks → goes to Task Library
     - Use a platform template → shows template picker
     - Start from scratch → skip
   - Guide them to the Task Library, Template Library, and Plans pages

   **Step 5: Explore Features**
   - Quick overview cards for key features:
     - Plans (project planner)
     - Capacity IQ (resource planning)
     - Prioritisation (scoring frameworks)
     - Go-to-Market (launch checklists)
   - Each card has a "Take me there" button

   **Step 6: You're All Set!**
   - Celebration moment (subtle animation, not emoji)
   - "Start building your roadmap" CTA
   - "You can always revisit this guide from Settings" footnote

2. **Implementation:**
   ```javascript
   function showOnboarding() {
     // Check if user has completed onboarding
     if (currentData?.settings?.onboardingComplete) return;

     // Show onboarding overlay
     document.getElementById('onboarding-overlay').style.display = 'flex';
     showOnboardingStep(1);
   }

   function showOnboardingStep(step) {
     // Hide all steps
     document.querySelectorAll('.onboarding-step').forEach(el => el.style.display = 'none');
     // Show current step
     document.getElementById(`onboarding-step-${step}`).style.display = 'block';
     // Update progress dots
     updateOnboardingProgress(step);
   }

   function completeOnboarding() {
     currentData.settings = currentData.settings || {};
     currentData.settings.onboardingComplete = true;
     saveData();
     document.getElementById('onboarding-overlay').style.display = 'none';
   }
   ```

3. **Design the onboarding screens:**
   - Clean, centered modal/overlay
   - Progress indicator (dots or step numbers: 1/6, 2/6, etc.)
   - "Skip" and "Next" buttons on each step
   - Use the app's design language (colors, fonts, border-radius)
   - Dark mode support
   - No emoji — use clean SVG illustrations or icons
   - For "screenshots": describe the UI elements with clear text and arrows pointing to specific locations. Use CSS highlights/borders to draw attention to UI elements if the onboarding can overlay on the actual app.

4. **Trigger onboarding:**
   - On first login (when `currentData` is empty or `onboardingComplete` is falsy)
   - Available from Settings to re-run

---

## Fix 16: Burger Menu Open by Default on Login

**Problem:** When a user logs in, the sidebar/burger menu should be open by default, not collapsed.

**Approach:**
1. Find the sidebar toggle logic:
   ```bash
   grep -n "toggleSidebar\|sidebar.*open\|sidebar.*close\|burger.*menu\|menuOpen\|sidebarOpen" renderer/index.html | head -20
   ```

2. Ensure the sidebar starts in the open state:
   - On page load / after login, set the sidebar to open
   - Don't rely on saved preference for first visit — default to open
   - Save the user's preference after they manually toggle it
   ```javascript
   function initSidebar() {
     const savedPref = currentData?.settings?.sidebarOpen;
     // Default to open if no preference saved
     const shouldBeOpen = savedPref !== undefined ? savedPref : true;
     if (shouldBeOpen) {
       openSidebar();
     } else {
       closeSidebar();
     }
   }
   ```

---

## Fix 17: Merge Top 10 Priorities into Prioritisation Page + Comments

**Problem:** The Top 10 Priorities page (if created in a previous fix) should be merged into the Prioritisation page as the first thing users see. Add a comment section for discussion.

**Approach:**
1. Find the Prioritisation page:
   ```bash
   grep -n "prioriti.*page\|prioritisation\|prioritization\|scoring-page" renderer/index.html | head -20
   ```

2. **Add a "Top Priorities" section at the TOP of the Prioritisation page:**
   - Show the top 10 initiatives ranked by priority/score
   - Each priority card shows:
     - Rank (#1, #2, etc.)
     - Initiative name (clickable — opens the initiative)
     - Priority level badge
     - Status badge (color-coded)
     - Owner
     - Progress % (from linked plan tasks)
     - Links to: Roadmap (jump to initiative), Delivery Plan (if linked), Sprint (if assigned)
     - Any other relevant context

3. **Comment section per priority:**
   ```javascript
   priorityItem.comments = [
     {
       id: 'comment-id',
       userId: 'user-id',
       userName: 'User Name',
       content: 'This should be moved up because...',
       createdAt: '...',
       replies: []
     }
   ];
   ```
   - Each priority item has a collapsible comment thread
   - "Add Comment" textarea with "Post" button
   - Comments show user name, timestamp, and content
   - Threaded replies (one level deep)
   - Users can edit/delete their own comments

4. **If a separate Top 10 Priorities page exists from a previous fix:**
   - Remove it from the navigation
   - Move its content into the Prioritisation page as the first tab/section
   - The Prioritisation page should have tabs or sections: "Top Priorities", "Score Initiatives", "Frameworks", "Value vs Effort"

---

## Fix 18: Rename G2M to "Checklist" in Top Nav + Expand Template Use

**Problem:** Rename "GTM" / "G2M" / "Go-to-Market" in the top navigation to just "Checklist". The concept should be broader — checklists for any workflow, not just go-to-market.

**Approach:**
1. Find all G2M/GTM references in the nav:
   ```bash
   grep -n "G2M\|GTM\|Go.to.Market\|go-to-market\|goToMarket" renderer/index.html | head -40
   ```

2. **Rename in the top navigation only:** Change the nav button label from "G2M" / "GTM" to "Checklist"
   - The page can internally still be called "g2m" for backward compatibility
   - But the visible label should be "Checklist"

3. **Broaden the checklist concept:**
   - The page should not be limited to go-to-market — it's a general-purpose checklist
   - Add a "Template" dropdown at the top that lets users pick from checklist templates:
     - GoToMarket Launch (existing)
     - Product Release Checklist
     - Frontend Development Checklist
     - Backend Development Checklist
     - Security Checklist
     - Marketing Campaign Checklist
     - Sales Enablement Checklist
     - And any other templates from Fix 11
   - When a template is selected, it populates the checklist with those items
   - Users can also create a blank checklist and add items manually

4. **The idea:** A user downloads the app and gets access to many templates. These templates guide their development workflow. Whether they're a vibe coder, a startup founder, or a PM at an enterprise — the checklists help them know what to do for:
   - Releasing products
   - Frontend development
   - Backend development
   - Security
   - Marketing
   - Any other workflow

5. Make sure existing G2M data isn't lost — just rename the UI label.

---

## Fix 19: Global Light Mode / Dark Mode Contrast Audit

**Problem:** Across the entire app, text visibility is poor in BOTH modes — light text on light backgrounds in light mode, and white text on white backgrounds in dark mode. This is a fundamental UX issue.

**Approach:**
This is a comprehensive audit pass. After all other fixes are done, do a full sweep:

1. **Light mode audit:**
   ```bash
   grep -n "color.*#ccc\|color.*#ddd\|color.*#999\|color.*#aaa\|color.*#bbb\|color.*lightgr" renderer/index.html
   ```
   - Any text color lighter than `#666` on a white/light background is a problem
   - Fix: ensure minimum contrast ratio of 4.5:1 (WCAG AA)
   - Primary text: `#1a1a1a` to `#333333`
   - Secondary text: `#555555` to `#666666`
   - Muted text: no lighter than `#888888`

2. **Dark mode audit:**
   ```bash
   grep -n "background.*#fff\|background.*white\|background-color.*white" renderer/index.html
   ```
   - Every white background must have a dark mode override
   - No grey text on dark backgrounds — use `#e8e8e8` minimum

3. **Check every page:**
   - Dashboard ✓
   - Roadmap ✓
   - Plans ✓
   - CapacityIQ ✓
   - Prioritisation ✓
   - Checklist (G2M) ✓
   - Feedback ✓
   - Artefacts ✓
   - To-Do ✓
   - Task Library ✓
   - Templates ✓
   - Settings ✓
   - User Management ✓
   - All modals and popups ✓
   - All dropdowns ✓
   - All input fields ✓
   - All buttons ✓
   - All headers/title bars ✓
   - Navigation (sidebar + top) ✓

---

## Fix 20: Go-to-Market Page — Hours Input Size Fix

**Problem:** The hours increment/decrement buttons are so large they obscure the actual number. Users need free-text input.

**Approach:**
1. Find the hours input on the G2M page:
   ```bash
   grep -n "hours.*g2m\|g2m.*hours\|checklist.*hours\|hour.*input\|hour.*increment" renderer/index.html | head -15
   ```

2. Fix: same approach as described in v2 Fix 10. Make +/- buttons 24-28px, input 60px wide, allow free text. Proper dark mode styling.

---

## Post-Fix Checklist

1. **Emoji sweep:** `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` — must be 0
2. **Contrast sweep:** Manually verify every page header, every dropdown, every modal in both light and dark modes
3. **Task Library verification:** Confirm 200+ tasks are seeded, cross-module population works
4. **Template verification:** All 10+ templates have realistic tasks and timelines
5. **Onboarding verification:** New user flow triggers correctly, all steps work
6. **Navigation verification:** Every nav button routes correctly
7. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
8. **Bump version** in `package.json`
9. **Rebuild web:** `cd web && npm run build`
10. **Commit:** `git add -A && git commit -m "vX.Y.Z: v3 fixes — onboarding, templates, task library, team mgmt, stacked roadmaps, contrast overhaul"`
11. **Update FIX_LOG_V3.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V3.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix:** Re-read changes, check syntax, verify both light and dark mode.
4. **If a fix is blocked**, implement what you can, add `// TODO:` comments, log it, move on.
5. **Preserve existing patterns.** Match the codebase style exactly.
6. **Both modes matter.** Every element must work in BOTH light mode AND dark mode. Check both.
7. **Keep the single-file SPA pattern.** All UI changes go into `renderer/index.html`.
8. **Zero emoji.** Replace any emoji encountered while working.
9. **Realistic content only.** Templates and seed data must have realistic task names, descriptions, and timelines — not AI-generated filler.
10. **When building templates/seed data,** use real PM/engineering/marketing terminology and realistic timeframes based on standard industry practices.
