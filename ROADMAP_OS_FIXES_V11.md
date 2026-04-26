# Roadmap OS — Autonomous Fix Queue v11

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V11.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/`
- Data stored as one JSONB blob per user in `roadmap_data` table
- Navigation: `showPage('pageId')` with `history.pushState` / `popstate`
- Dark mode: CSS variables (`:root` for light, `.dark-mode` overrides)
- ZERO emoji — SVG icons only
- Teams: `currentData.teams[]`
- Initiatives/rows live in `currentData.sections[].rows[]`
- Plans in `currentData.plans[]` or equivalent
- Notifications: `currentData.notifications[]`
- Alert preferences: `currentData.settings.alerts`

**Before starting:**
1. `grep -n "onboarding\|onboardingStep\|setup.*flow\|welcome.*wizard\|firstLogin\|showOnboarding" renderer/index.html | head -30`
2. `grep -n "loading.*overlay\|loadingSpinner\|showLoading\|hideLoading\|loading-overlay" renderer/index.html | head -20`
3. `grep -n "free.*trial\|Free Trial\|30.day\|freeTrial\|trial" renderer/index.html | head -30`
4. `grep -n "editRow\|edit-row\|rowEditor\|initiative.*edit\|editInitiative\|row.*modal\|row.*detail" renderer/index.html | head -30`
5. `grep -n "pushState\|popstate\|replaceState\|history\.push\|onpopstate\|showPage" renderer/index.html | head -30`
6. `grep -n "share.*plan\|sharePlan\|email.*plan\|plan.*share\|plan.*invite" renderer/index.html | head -15`
7. `grep -n "comment\|Comment\|thread\|reply\|addComment" renderer/index.html | head -20`
8. `grep -n "archive\|Archive\|archived\|duplicate\|Duplicate\|watch\|Watch\|follow\|Follow" renderer/index.html | head -20`
9. Log all findings in `FIX_LOG_V11.md`

---

## Fix 1: Onboarding — Add Team Setup Step

**Problem:** The onboarding flow (created in v3) doesn't include a step for configuring teams. Teams should be set up as part of the first-time experience.

**Approach:**
1. Find the onboarding flow:
   ```bash
   grep -n "onboarding.*step\|showOnboardingStep\|onboarding-step\|step-1\|step-2\|step-3" renderer/index.html | head -20
   ```

2. **Add a "Set Up Your Team" step** after the roadmap setup step and before the template/task import step. The step order should be:
   1. Welcome
   2. Create Your Roadmap
   3. **Set Up Your Team (NEW or enhanced)**
   4. Import Tasks / Templates
   5. Explore Features
   6. You're All Set

3. **Team setup step content:**
   ```html
   <div id="onboarding-step-team" class="onboarding-step" style="display:none;">
     <div class="onboarding-step-header">
       <div class="step-icon">
         <svg viewBox="0 0 24 24" width="48" height="48" stroke="var(--accent-primary)"
              stroke-width="1.5" fill="none">
           <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
           <circle cx="9" cy="7" r="4"/>
           <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
           <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
         </svg>
       </div>
       <h2>Set Up Your Team</h2>
       <p>Add your team members so you can collaborate on roadmaps, assign tasks, and track capacity together.</p>
     </div>

     <div class="onboarding-team-form">
       <!-- Team name -->
       <div class="form-group">
         <label>Team Name</label>
         <input type="text" id="onboarding-team-name" placeholder="e.g., Product Team, Engineering">
       </div>

       <!-- Team description -->
       <div class="form-group">
         <label>Description (optional)</label>
         <input type="text" id="onboarding-team-desc" placeholder="What does this team do?">
       </div>

       <!-- Add members by email -->
       <div class="form-group">
         <label>Invite Team Members</label>
         <div id="onboarding-member-list">
           <div class="onboarding-member-row">
             <input type="email" class="onboarding-member-email" placeholder="teammate@company.com">
             <button onclick="addOnboardingMemberRow()" class="btn-icon" title="Add another">
               <svg viewBox="0 0 16 16" width="16" height="16" stroke="currentColor" stroke-width="1.5" fill="none">
                 <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
               </svg>
             </button>
           </div>
         </div>
         <p class="form-hint">Team members will receive an email invitation to join Roadmap OS.</p>
       </div>
     </div>

     <div class="onboarding-actions">
       <button onclick="skipOnboardingTeam()" class="btn-secondary">Skip for now</button>
       <button onclick="saveOnboardingTeam()" class="btn-primary">Create Team & Continue</button>
     </div>
   </div>
   ```

4. **Logic:**
   ```javascript
   function addOnboardingMemberRow() {
     const list = document.getElementById('onboarding-member-list');
     const row = document.createElement('div');
     row.className = 'onboarding-member-row';
     row.innerHTML = `
       <input type="email" class="onboarding-member-email" placeholder="teammate@company.com">
       <button onclick="this.parentElement.remove()" class="btn-icon btn-danger-subtle" title="Remove">
         <svg viewBox="0 0 16 16" width="16" height="16" stroke="currentColor" stroke-width="1.5" fill="none">
           <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
         </svg>
       </button>
     `;
     list.appendChild(row);
   }

   async function saveOnboardingTeam() {
     const teamName = document.getElementById('onboarding-team-name').value.trim();
     if (!teamName) {
       showToast('Enter a team name', 'warning');
       return;
     }

     // Gather emails
     const emails = Array.from(document.querySelectorAll('.onboarding-member-email'))
       .map(input => input.value.trim())
       .filter(e => e && e.includes('@'));

     // Create the team
     if (!currentData.teams) currentData.teams = [];
     const team = {
       id: generateId(),
       name: teamName,
       description: document.getElementById('onboarding-team-desc').value.trim(),
       color: '#3b82f6',
       members: [],
       createdBy: getCurrentUserId(),
       createdAt: new Date().toISOString(),
     };

     // Add current user as lead
     team.members.push({
       email: getCurrentUserEmail(),
       name: getCurrentUserName(),
       userId: getCurrentUserId(),
       role_in_team: 'lead',
       addedAt: new Date().toISOString(),
     });

     // Add invited members
     for (const email of emails) {
       team.members.push({
         email: email,
         name: email.split('@')[0],
         role_in_team: 'member',
         status: 'invited',
         addedAt: new Date().toISOString(),
       });

       // Send invite email
       try {
         await sendInviteEmail(email);
       } catch (err) {
         console.error(`Failed to invite ${email}:`, err);
       }
     }

     currentData.teams.push(team);
     saveData();

     showToast(`Team "${teamName}" created with ${team.members.length} members`, 'success');
     showOnboardingStep('next'); // advance to next step
   }

   function skipOnboardingTeam() {
     showOnboardingStep('next');
   }
   ```

5. **Ensure the step ordering is updated** in the `showOnboardingStep()` function to include this new step in the correct position.

---

## Fix 2: Loading Spinner with Roadmap OS Logo

**Problem:** Pages that take a while to load should show a branded loading spinner with the Roadmap OS logo, not a blank screen.

**Approach:**
1. Find the existing loading overlay (may have been created in v3/v4):
   ```bash
   grep -n "loading-overlay\|loadingOverlay\|showLoadingOverlay\|hideLoadingOverlay\|loading.*spinner" renderer/index.html | head -15
   ```

2. **If it exists, enhance it. If not, create it:**
   ```html
   <div id="loading-overlay" style="display:none;">
     <div class="loading-content">
       <!-- Roadmap OS logo -->
       <div class="loading-logo">
         <svg viewBox="0 0 120 120" width="64" height="64" class="loading-logo-svg">
           <!-- Simplified Roadmap OS icon -->
           <rect x="10" y="10" width="100" height="100" rx="20" fill="var(--accent-primary, #3b82f6)" opacity="0.1"/>
           <rect x="25" y="35" width="70" height="8" rx="4" fill="var(--accent-primary, #3b82f6)" opacity="0.6"/>
           <rect x="25" y="50" width="55" height="8" rx="4" fill="var(--accent-primary, #3b82f6)" opacity="0.8"/>
           <rect x="25" y="65" width="40" height="8" rx="4" fill="var(--accent-primary, #3b82f6)"/>
           <rect x="25" y="80" width="60" height="8" rx="4" fill="var(--accent-primary, #3b82f6)" opacity="0.5"/>
         </svg>
       </div>

       <!-- Spinning animation -->
       <svg class="loading-spinner-ring" viewBox="0 0 50 50" width="40" height="40">
         <circle cx="25" cy="25" r="20" fill="none" stroke="var(--border-primary, #e2e4e8)" stroke-width="3"/>
         <circle cx="25" cy="25" r="20" fill="none" stroke="var(--accent-primary, #3b82f6)"
                 stroke-width="3" stroke-dasharray="31.4 94.2" stroke-linecap="round">
           <animateTransform attributeName="transform" type="rotate"
                             from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/>
         </circle>
       </svg>

       <p class="loading-text" id="loading-message">Loading...</p>
     </div>
   </div>
   ```

3. **CSS:**
   ```css
   #loading-overlay {
     position: fixed; top: 0; left: 0; right: 0; bottom: 0;
     background: var(--bg-primary);
     display: flex; align-items: center; justify-content: center;
     z-index: 99999;
     opacity: 1;
     transition: opacity 0.3s;
   }
   #loading-overlay.fade-out {
     opacity: 0;
     pointer-events: none;
   }
   .loading-content {
     text-align: center;
     display: flex; flex-direction: column; align-items: center; gap: 16px;
   }
   .loading-logo-svg {
     animation: loadingPulse 2s ease-in-out infinite;
   }
   @keyframes loadingPulse {
     0%, 100% { opacity: 1; transform: scale(1); }
     50% { opacity: 0.7; transform: scale(0.95); }
   }
   .loading-text {
     color: var(--text-secondary);
     font-size: 14px;
     font-weight: 500;
     margin: 0;
   }
   ```

4. **Show loading spinner when:**
   - App is first loading after login (before roadmap data is fetched)
   - Navigating to heavy pages (Capacity IQ dashboard, Reports Dashboard)
   - Performing sync operations
   - Importing data (JSON, Excel)

5. **Implementation:**
   ```javascript
   function showLoadingOverlay(message) {
     const overlay = document.getElementById('loading-overlay');
     const msgEl = document.getElementById('loading-message');
     if (msgEl) msgEl.textContent = message || 'Loading...';
     if (overlay) {
       overlay.classList.remove('fade-out');
       overlay.style.display = 'flex';
     }
   }

   function hideLoadingOverlay() {
     const overlay = document.getElementById('loading-overlay');
     if (overlay) {
       overlay.classList.add('fade-out');
       setTimeout(() => {
         overlay.style.display = 'none';
         overlay.classList.remove('fade-out');
       }, 300);
     }
   }
   ```

6. **Add to `showPage()` for heavy pages:**
   ```javascript
   function showPage(pageId, options) {
     const heavyPages = ['capacityiq', 'reports', 'strategy', 'integrations'];
     if (heavyPages.includes(pageId)) {
       showLoadingOverlay(`Loading ${pageId}...`);
     }

     // ... existing page switching ...

     // After rendering:
     if (heavyPages.includes(pageId)) {
       requestAnimationFrame(() => hideLoadingOverlay());
     }
   }
   ```

---

## Fix 3: Remove "Free Trial" References — Just Let People Log In

**Problem:** References to "free trial" and "30-day free trial" throughout the app should be removed. Users should just log in and get access. The free trial is handled on the backend (subscription tier) and shouldn't be plastered across the UI.

**Approach:**
1. Find ALL free trial references:
   ```bash
   grep -n "free trial\|Free Trial\|free-trial\|freeTrial\|30.day\|30 day\|trial" renderer/index.html
   ```

2. **Remove or replace each occurrence:**
   - Login/signup page: Remove any "Start your 30-day free trial" CTAs. Replace with "Sign Up" or "Get Started".
   - Invite flows: Remove "Invitees get a 30-day free trial" text from team invite modals. (Note: user previously said to keep it on the edit team popup, but then said to remove all free trial references — follow the LATEST instruction: remove everything except the one on the public feedback page which says "Start your 30-day free trial" as a CTA for non-users visiting the feedback form.)
   - Onboarding: Remove trial mentions. Just welcome the user.
   - Settings/Profile: Remove any trial status displays.
   - Any buttons, labels, tooltips, or helper text mentioning trials.

3. **Exceptions (keep):**
   - The public feedback submission page CTA "Start your 30-day free trial" — this is for marketing to non-users and is acceptable.

4. **After removal, verify:**
   ```bash
   grep -n "free trial\|Free Trial\|30.day" renderer/index.html
   ```
   Should only return the feedback page CTA (if applicable).

---

## Fix 4: Onboarding — Load Dummy Data for First-Time Users

**Problem:** When users log in for the first time, the app is completely empty. Need to pre-load dummy/sample data so users can see what a populated Roadmap OS looks like and understand the features.

**Approach:**
1. Find where first-login / empty-state is checked:
   ```bash
   grep -n "firstLogin\|first_login\|isEmpty\|emptyState\|onboardingComplete\|newUser" renderer/index.html | head -20
   ```

2. **Create a comprehensive dummy dataset:**
   ```javascript
   function getSampleData() {
     return {
       sections: [
         {
           id: 'sample-section-1',
           name: 'Mobile Platform',
           color: '#3b82f6',
           rows: [
             {
               id: 'sample-row-1',
               name: 'Mobile App v2.0 Launch',
               description: 'Complete redesign of the mobile experience with new navigation and performance improvements.',
               status: 'In Progress',
               priority: 'High',
               owner: 'You',
               tags: ['mobile', 'redesign'],
               labels: ['UX', 'Frontend'],
               revenue: 250000,
               dateRange: { start: getCurrentQuarterStart(), end: getNextQuarterEnd() },
               createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
               updatedAt: new Date().toISOString(),
               initiatives: [],
               links: [],
               comments: [
                 {
                   id: 'sample-comment-1',
                   userId: 'sample',
                   userName: 'Sample User',
                   content: 'Great progress on the navigation redesign! Can we review the new flows on Friday?',
                   createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                   likes: 2,
                   replies: [],
                 }
               ],
             },
             {
               id: 'sample-row-2',
               name: 'Push Notification System',
               description: 'Implement real-time push notifications for task assignments and roadmap updates.',
               status: 'Strategy',
               priority: 'Medium',
               owner: 'You',
               tags: ['mobile', 'notifications'],
               labels: ['Backend', 'Infrastructure'],
               revenue: 50000,
               dateRange: { start: getNextQuarterStart(), end: getQuarterEndAfterNext() },
               createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
               updatedAt: new Date().toISOString(),
               initiatives: [],
               links: [],
               comments: [],
             },
           ],
         },
         {
           id: 'sample-section-2',
           name: 'Core Platform',
           color: '#8b5cf6',
           rows: [
             {
               id: 'sample-row-3',
               name: 'API v3 Migration',
               description: 'Migrate all REST endpoints to v3 with improved authentication and rate limiting.',
               status: 'In Progress',
               priority: 'High',
               owner: 'You',
               tags: ['api', 'backend'],
               labels: ['Backend', 'Security'],
               revenue: 0,
               dateRange: { start: getCurrentQuarterStart(), end: getCurrentQuarterEnd() },
               createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
               updatedAt: new Date().toISOString(),
               initiatives: [],
               links: [],
               comments: [],
             },
             {
               id: 'sample-row-4',
               name: 'Analytics Dashboard',
               description: 'Build customer-facing analytics with real-time metrics, custom reports, and export.',
               status: 'Strategy',
               priority: 'Medium',
               owner: 'You',
               tags: ['analytics', 'data'],
               labels: ['Data', 'Frontend'],
               revenue: 180000,
               dateRange: { start: getNextQuarterStart(), end: getQuarterEndAfterNext() },
               createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
               updatedAt: new Date().toISOString(),
               initiatives: [],
               links: [],
               comments: [],
             },
           ],
         },
         {
           id: 'sample-section-3',
           name: 'Growth & Marketing',
           color: '#22c55e',
           rows: [
             {
               id: 'sample-row-5',
               name: 'Self-Serve Onboarding',
               description: 'Redesign the signup-to-activation flow to reduce time-to-value from 7 days to 1 day.',
               status: 'Released',
               priority: 'High',
               owner: 'You',
               tags: ['onboarding', 'growth'],
               labels: ['UX', 'Marketing'],
               revenue: 320000,
               dateRange: { start: getPreviousQuarterStart(), end: getCurrentQuarterStart() },
               createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
               updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
               initiatives: [],
               links: [],
               comments: [],
             },
           ],
         },
       ],

       // Sample to-do items
       todos: [
         { id: 'sample-todo-1', name: 'Review API v3 migration plan', status: 'In Progress', priority: 'High', dueDate: getTodayPlus(3), linkedInitiative: 'sample-row-3', createdAt: new Date().toISOString() },
         { id: 'sample-todo-2', name: 'Design push notification UX mockups', status: 'To Do', priority: 'Medium', dueDate: getTodayPlus(7), linkedInitiative: 'sample-row-2', createdAt: new Date().toISOString() },
         { id: 'sample-todo-3', name: 'Write mobile v2.0 PRD', status: 'Done', priority: 'High', dueDate: getTodayPlus(-2), linkedInitiative: 'sample-row-1', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
       ],

       // Sample KPIs
       kpis: [
         { id: 'sample-kpi-1', name: 'Monthly Active Users', value: 12500, target: 15000, unit: 'users', trend: 'up' },
         { id: 'sample-kpi-2', name: 'Customer Satisfaction', value: 4.2, target: 4.5, unit: 'score', trend: 'stable' },
         { id: 'sample-kpi-3', name: 'Feature Adoption Rate', value: 68, target: 80, unit: '%', trend: 'up' },
       ],

       // Mark as sample data so we can offer to clear it
       _isSampleData: true,
     };
   }

   // Helper date functions for sample data
   function getCurrentQuarterStart() {
     const now = new Date();
     const q = Math.floor(now.getMonth() / 3);
     return new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0];
   }
   function getCurrentQuarterEnd() {
     const now = new Date();
     const q = Math.floor(now.getMonth() / 3);
     return new Date(now.getFullYear(), (q + 1) * 3, 0).toISOString().split('T')[0];
   }
   function getNextQuarterStart() {
     const now = new Date();
     const q = Math.floor(now.getMonth() / 3) + 1;
     return new Date(now.getFullYear() + Math.floor(q / 4), (q % 4) * 3, 1).toISOString().split('T')[0];
   }
   function getNextQuarterEnd() {
     const now = new Date();
     const q = Math.floor(now.getMonth() / 3) + 1;
     return new Date(now.getFullYear() + Math.floor((q + 1) / 4), ((q + 1) % 4) * 3, 0).toISOString().split('T')[0];
   }
   function getQuarterEndAfterNext() {
     const now = new Date();
     const q = Math.floor(now.getMonth() / 3) + 2;
     return new Date(now.getFullYear() + Math.floor((q + 1) / 4), ((q + 1) % 4) * 3, 0).toISOString().split('T')[0];
   }
   function getPreviousQuarterStart() {
     const now = new Date();
     const q = Math.floor(now.getMonth() / 3) - 1;
     const year = q < 0 ? now.getFullYear() - 1 : now.getFullYear();
     const adjQ = q < 0 ? 3 : q;
     return new Date(year, adjQ * 3, 1).toISOString().split('T')[0];
   }
   function getTodayPlus(days) {
     return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
   }
   ```

3. **Load sample data on first login:**
   ```javascript
   function loadSampleDataIfNewUser() {
     // Check if user has any existing data
     const hasData = currentData?.sections?.length > 0 ||
                     currentData?.todos?.length > 0 ||
                     currentData?.plans?.length > 0;

     if (!hasData && !currentData?._sampleDataDismissed) {
       const sampleData = getSampleData();
       Object.assign(currentData, sampleData);
       saveData();

       // Show a banner explaining it's sample data
       showSampleDataBanner();
     }
   }

   function showSampleDataBanner() {
     const banner = document.createElement('div');
     banner.id = 'sample-data-banner';
     banner.className = 'sample-data-banner';
     banner.innerHTML = `
       <div class="banner-content">
         <span class="banner-icon">
           <svg viewBox="0 0 20 20" width="18" height="18" stroke="currentColor" stroke-width="1.5" fill="none">
             <circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="10"/><line x1="10" y1="13" x2="10.01" y2="13"/>
           </svg>
         </span>
         <span>You're viewing sample data to help you explore Roadmap OS. </span>
         <button onclick="clearSampleData()" class="btn-sm btn-outline">Clear Sample Data</button>
         <button onclick="dismissSampleBanner()" class="btn-sm btn-ghost">Keep exploring</button>
       </div>
     `;
     document.body.insertBefore(banner, document.body.firstChild);
   }

   function clearSampleData() {
     // Remove all sample data
     currentData.sections = [];
     currentData.todos = [];
     currentData.kpis = [];
     currentData._isSampleData = false;
     currentData._sampleDataDismissed = true;
     saveData();
     renderRoadmap();
     document.getElementById('sample-data-banner')?.remove();
     showToast('Sample data cleared. Start building your roadmap!', 'success');
   }

   function dismissSampleBanner() {
     document.getElementById('sample-data-banner')?.remove();
   }
   ```

4. **CSS for the banner:**
   ```css
   .sample-data-banner {
     position: sticky; top: 0; z-index: 100;
     background: var(--accent-light, #dbeafe);
     border-bottom: 1px solid var(--accent-primary);
     padding: 10px 20px;
   }
   .banner-content {
     display: flex; align-items: center; gap: 10px;
     font-size: 13px; color: var(--text-primary);
     max-width: 1200px; margin: 0 auto;
   }
   .dark-mode .sample-data-banner {
     background: var(--bg-tertiary);
   }
   ```

5. Call `loadSampleDataIfNewUser()` after login/data load, before rendering.

---

## Fix 5: Initiative Data Model — Revenue/ROI, Labels, Owner, Dates

**Problem:** Each initiative (roadmap row) needs additional fields: revenue/ROI, labels/tags (UX, UI, Hardware, Backend, Data, etc.), initiative owner (defaults to roadmap owner but assignable), created date, and last updated date.

**Approach:**
1. Find the row/initiative data model:
   ```bash
   grep -n "addRow\|createRow\|newRow\|row\.\|initiative\.\|defaultRow" renderer/index.html | grep -i "data\|object\|struct\|field\|property" | head -20
   ```

2. **Extend the data model.** Wherever a new row/initiative is created, add these fields:
   ```javascript
   const newRow = {
     // ... existing fields (id, name, description, status, priority, etc.) ...

     // NEW FIELDS
     revenue: 0,                        // Expected revenue / ROI in currency
     labels: [],                        // Array of strings: ['UX', 'Backend', 'Hardware', etc.]
     owner: getCurrentUserName(),        // Defaults to roadmap owner, reassignable
     ownerEmail: getCurrentUserEmail(),
     createdAt: new Date().toISOString(),
     updatedAt: new Date().toISOString(),
   };
   ```

3. **Predefined label options** (users can also type custom ones):
   ```javascript
   const INITIATIVE_LABELS = [
     'UX', 'UI', 'Frontend', 'Backend', 'Hardware', 'Data',
     'Security', 'Infrastructure', 'DevOps', 'Marketing',
     'Sales', 'Support', 'Legal', 'Finance', 'Operations',
     'Mobile', 'Web', 'API', 'Integration', 'Analytics',
   ];
   ```

4. **Auto-update `updatedAt`** every time a row is edited and saved:
   ```javascript
   function saveRowEdit(rowId) {
     const row = findRowById(rowId);
     if (!row) return;

     // ... existing save logic ...

     row.updatedAt = new Date().toISOString();
     saveData();
   }
   ```

---

## Fix 6: Edit Initiative Page — Revenue, Labels, Owner, Comments, Timestamps

**Problem:** The edit initiative modal needs all the new fields displayed and editable, plus a full comments section at the bottom.

**Approach:**
1. Find the edit row/initiative modal:
   ```bash
   grep -n "editRow\|openEditRow\|row-editor\|initiative-editor\|edit.*modal.*row" renderer/index.html | head -20
   ```

2. **Add the new fields to the edit form:**

   **Revenue/ROI field:**
   ```html
   <div class="form-group">
     <label>Revenue / ROI</label>
     <div class="revenue-input-wrapper">
       <span class="currency-prefix">$</span>
       <input type="number" id="edit-row-revenue" value="${row.revenue || 0}"
              placeholder="Expected revenue" min="0">
     </div>
   </div>
   ```

   **Labels field (multi-select with autocomplete):**
   ```html
   <div class="form-group">
     <label>Labels</label>
     <div class="labels-input">
       <div id="edit-row-labels-display" class="label-pills">
         ${(row.labels || []).map(l => `
           <span class="label-pill" data-label="${l}">
             ${escapeHtml(l)}
             <button onclick="removeLabel('${rowId}', '${l}')" class="pill-remove">&times;</button>
           </span>
         `).join('')}
       </div>
       <div class="label-add">
         <input type="text" id="edit-row-label-input" placeholder="Add label..."
                list="label-suggestions" oninput="filterLabelSuggestions(this.value)"
                onkeydown="if(event.key==='Enter'){event.preventDefault();addLabelFromInput('${rowId}');}">
         <datalist id="label-suggestions">
           ${INITIATIVE_LABELS.map(l => `<option value="${l}">`).join('')}
         </datalist>
       </div>
     </div>
   </div>
   ```

   **Initiative Owner field:**
   ```html
   <div class="form-group">
     <label>Initiative Owner</label>
     <select id="edit-row-owner">
       <option value="${getCurrentUserEmail()}">${getCurrentUserName()} (You)</option>
       ${getTeamMembersForDropdown().map(m => `
         <option value="${m.email}" ${row.ownerEmail === m.email ? 'selected' : ''}>${escapeHtml(m.name || m.email)}</option>
       `).join('')}
     </select>
   </div>
   ```

   **Timestamps (read-only):**
   ```html
   <div class="form-row meta-info">
     <div class="meta-item">
       <span class="meta-label">Created</span>
       <span class="meta-value">${formatDate(row.createdAt)}</span>
     </div>
     <div class="meta-item">
       <span class="meta-label">Last Updated</span>
       <span class="meta-value">${formatDate(row.updatedAt)}</span>
     </div>
   </div>
   ```

3. **Comments Section at the bottom of the edit modal:**
   ```html
   <div class="initiative-comments-section">
     <h4>Comments</h4>

     <!-- Comment list -->
     <div id="edit-row-comments" class="comments-list">
       ${renderComments(row.comments || [], rowId)}
     </div>

     <!-- Add comment form -->
     <div class="add-comment-form">
       <div class="comment-avatar">
         ${getUserAvatarHTML(getCurrentUserName())}
       </div>
       <div class="comment-input-wrapper">
         <textarea id="new-comment-text" placeholder="Add a comment..." rows="2"></textarea>
         <button onclick="addComment('${rowId}')" class="btn-sm btn-primary">Post</button>
       </div>
     </div>
   </div>
   ```

4. **Comment rendering with likes, replies, and threads:**
   ```javascript
   function renderComments(comments, rowId) {
     if (!comments || comments.length === 0) {
       return '<p class="empty-comments">No comments yet. Be the first to share your thoughts.</p>';
     }

     return comments.map(comment => `
       <div class="comment-item" data-comment-id="${comment.id}">
         <div class="comment-header">
           <div class="comment-avatar-sm">${getUserAvatarHTML(comment.userName)}</div>
           <span class="comment-author">${escapeHtml(comment.userName)}</span>
           <span class="comment-time">${formatTimeAgo(comment.createdAt)}</span>
         </div>
         <div class="comment-body">${escapeHtml(comment.content)}</div>
         <div class="comment-actions">
           <button onclick="likeComment('${rowId}', '${comment.id}')" class="btn-ghost btn-xs">
             <svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" stroke-width="1.5" fill="none">
               <path d="M4.5 9.5L8 13l3.5-3.5"/>
               <path d="M8 3a3 3 0 0 0-3 3c0 2 3 4 3 4s3-2 3-4a3 3 0 0 0-3-3z"/>
             </svg>
             ${comment.likes || 0}
           </button>
           <button onclick="showReplyForm('${rowId}', '${comment.id}')" class="btn-ghost btn-xs">
             Reply
           </button>
           ${comment.userId === getCurrentUserId() ? `
             <button onclick="deleteComment('${rowId}', '${comment.id}')" class="btn-ghost btn-xs btn-danger-subtle">
               Delete
             </button>
           ` : ''}
         </div>

         <!-- Replies -->
         ${(comment.replies || []).length > 0 ? `
           <div class="comment-replies">
             ${comment.replies.map(reply => `
               <div class="reply-item">
                 <div class="comment-header">
                   <div class="comment-avatar-xs">${getUserAvatarHTML(reply.userName)}</div>
                   <span class="comment-author">${escapeHtml(reply.userName)}</span>
                   <span class="comment-time">${formatTimeAgo(reply.createdAt)}</span>
                 </div>
                 <div class="comment-body">${escapeHtml(reply.content)}</div>
               </div>
             `).join('')}
           </div>
         ` : ''}

         <!-- Reply form (hidden by default) -->
         <div id="reply-form-${comment.id}" class="reply-form" style="display:none;">
           <textarea class="reply-input" placeholder="Write a reply..." rows="1"></textarea>
           <button onclick="postReply('${rowId}', '${comment.id}')" class="btn-xs btn-primary">Reply</button>
         </div>
       </div>
     `).join('');
   }

   function addComment(rowId) {
     const textarea = document.getElementById('new-comment-text');
     const content = textarea.value.trim();
     if (!content) return;

     const row = findRowById(rowId);
     if (!row) return;
     if (!row.comments) row.comments = [];

     row.comments.push({
       id: generateId(),
       userId: getCurrentUserId(),
       userName: getCurrentUserName(),
       content: content,
       likes: 0,
       likedBy: [],
       replies: [],
       createdAt: new Date().toISOString(),
     });

     row.updatedAt = new Date().toISOString();
     saveData();

     // Re-render comments section
     document.getElementById('edit-row-comments').innerHTML = renderComments(row.comments, rowId);
     textarea.value = '';

     // Notify watchers
     notifyWatchers(rowId, 'comment', { commenter: getCurrentUserName(), content: content });
   }

   function likeComment(rowId, commentId) {
     const row = findRowById(rowId);
     const comment = row?.comments?.find(c => c.id === commentId);
     if (!comment) return;

     if (!comment.likedBy) comment.likedBy = [];
     const userId = getCurrentUserId();

     if (comment.likedBy.includes(userId)) {
       // Unlike
       comment.likedBy = comment.likedBy.filter(id => id !== userId);
       comment.likes = Math.max(0, (comment.likes || 0) - 1);
     } else {
       // Like
       comment.likedBy.push(userId);
       comment.likes = (comment.likes || 0) + 1;
     }

     saveData();
     document.getElementById('edit-row-comments').innerHTML = renderComments(row.comments, rowId);
   }

   function showReplyForm(rowId, commentId) {
     const form = document.getElementById(`reply-form-${commentId}`);
     if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
   }

   function postReply(rowId, commentId) {
     const form = document.getElementById(`reply-form-${commentId}`);
     const input = form?.querySelector('.reply-input');
     const content = input?.value?.trim();
     if (!content) return;

     const row = findRowById(rowId);
     const comment = row?.comments?.find(c => c.id === commentId);
     if (!comment) return;
     if (!comment.replies) comment.replies = [];

     comment.replies.push({
       id: generateId(),
       userId: getCurrentUserId(),
       userName: getCurrentUserName(),
       content: content,
       createdAt: new Date().toISOString(),
     });

     row.updatedAt = new Date().toISOString();
     saveData();
     document.getElementById('edit-row-comments').innerHTML = renderComments(row.comments, rowId);

     // Notify the original commenter
     notifyWatchers(rowId, 'reply', { replier: getCurrentUserName(), content: content });
   }
   ```

5. **CSS for labels:**
   ```css
   .label-pills {
     display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;
   }
   .label-pill {
     display: inline-flex; align-items: center; gap: 4px;
     padding: 3px 10px; border-radius: 12px;
     background: var(--accent-light); color: var(--accent-primary);
     font-size: 12px; font-weight: 500;
   }
   .pill-remove {
     background: none; border: none; cursor: pointer;
     color: var(--accent-primary); opacity: 0.6;
     font-size: 14px; line-height: 1; padding: 0 2px;
   }
   .pill-remove:hover { opacity: 1; }
   ```

6. **CSS for comments:**
   ```css
   .comments-list { margin-top: 16px; }
   .comment-item {
     padding: 12px 0;
     border-bottom: 1px solid var(--border-primary);
   }
   .comment-header {
     display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
   }
   .comment-author { font-weight: 600; font-size: 13px; color: var(--text-primary); }
   .comment-time { font-size: 11px; color: var(--text-muted); }
   .comment-body { font-size: 14px; line-height: 1.5; color: var(--text-primary); margin-bottom: 8px; }
   .comment-actions { display: flex; gap: 12px; }
   .comment-replies { margin-left: 32px; margin-top: 8px; }
   .reply-item { padding: 8px 0; border-left: 2px solid var(--border-primary); padding-left: 12px; }
   .reply-form { margin-top: 8px; display: flex; gap: 8px; align-items: flex-start; }
   .add-comment-form { display: flex; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-primary); }
   .comment-input-wrapper { flex: 1; display: flex; flex-direction: column; gap: 8px; }
   ```

---

## Fix 7: Duplicate, Archive, and Watch Initiatives

**Problem:** Need three new actions on each initiative: Duplicate, Archive (soft-delete with restore), and Watch (follow for change notifications).

### Part A: Duplicate Initiative
1. Add "Duplicate" to the three-dot menu or edit modal actions:
   ```javascript
   function duplicateInitiative(rowId) {
     const row = findRowById(rowId);
     if (!row) return;

     const section = findSectionContainingRow(rowId);
     if (!section) return;

     // Deep clone
     const duplicate = JSON.parse(JSON.stringify(row));
     duplicate.id = generateId();
     duplicate.name = row.name + ' (Copy)';
     duplicate.createdAt = new Date().toISOString();
     duplicate.updatedAt = new Date().toISOString();
     duplicate.comments = []; // don't copy comments
     duplicate.watchers = []; // don't copy watchers

     // Regenerate IDs for nested items
     if (duplicate.initiatives) {
       duplicate.initiatives.forEach(i => { i.id = generateId(); });
     }

     // Add after the original
     const index = section.rows.indexOf(row);
     section.rows.splice(index + 1, 0, duplicate);

     saveData();
     renderRoadmap();
     showToast(`"${row.name}" duplicated`, 'success');
   }
   ```

### Part B: Archive Initiative
1. **Data model:** Add an `archived` field to rows and a global archive array:
   ```javascript
   function archiveInitiative(rowId) {
     const row = findRowById(rowId);
     if (!row) return;

     const section = findSectionContainingRow(rowId);
     if (!section) return;

     if (!confirm(`Archive "${row.name}"? You can restore it later from the archive.`)) return;

     // Move to archive
     if (!currentData.archive) currentData.archive = [];
     currentData.archive.push({
       ...row,
       archivedAt: new Date().toISOString(),
       archivedFrom: section.name,
       archivedFromSectionId: section.id,
     });

     // Remove from active roadmap
     section.rows = section.rows.filter(r => r.id !== rowId);

     saveData();
     renderRoadmap();
     showToast(`"${row.name}" archived`, 'info');
   }
   ```

2. **Archive page / modal to view and restore:**
   ```javascript
   function showArchive() {
     const archive = currentData.archive || [];

     const modal = createModal('Archived Initiatives');
     if (archive.length === 0) {
       modal.innerHTML = '<p class="empty-state">No archived initiatives.</p>';
     } else {
       let html = '<div class="archive-list">';
       archive.forEach(item => {
         html += `
           <div class="archive-item">
             <div class="archive-info">
               <h4>${escapeHtml(item.name)}</h4>
               <p class="archive-meta">
                 From: ${escapeHtml(item.archivedFrom)} · Archived ${formatTimeAgo(item.archivedAt)}
               </p>
             </div>
             <div class="archive-actions">
               <button onclick="restoreFromArchive('${item.id}')" class="btn-sm btn-primary">Restore</button>
               <button onclick="deleteFromArchive('${item.id}')" class="btn-sm btn-danger-subtle">Delete Permanently</button>
             </div>
           </div>
         `;
       });
       html += '</div>';
       modal.innerHTML = html;
     }
     showModal(modal);
   }

   function restoreFromArchive(rowId) {
     const archive = currentData.archive || [];
     const item = archive.find(a => a.id === rowId);
     if (!item) return;

     // Find the original section or create a new one
     let section = currentData.sections?.find(s => s.id === item.archivedFromSectionId);
     if (!section) {
       // Original section no longer exists — add to first section or create one
       if (currentData.sections?.length > 0) {
         section = currentData.sections[0];
       } else {
         section = { id: generateId(), name: 'Restored', color: '#6b7280', rows: [] };
         currentData.sections = [section];
       }
     }

     // Remove archive metadata
     const restored = { ...item };
     delete restored.archivedAt;
     delete restored.archivedFrom;
     delete restored.archivedFromSectionId;
     restored.updatedAt = new Date().toISOString();

     section.rows.push(restored);
     currentData.archive = archive.filter(a => a.id !== rowId);

     saveData();
     closeModal();
     renderRoadmap();
     showToast(`"${item.name}" restored to ${section.name}`, 'success');
   }
   ```

3. **Add an "Archive" link in the sidebar or roadmap toolbar** to view archived items.

### Part C: Watch/Follow Initiative
1. **Data model:** Each row gets a `watchers` array:
   ```javascript
   row.watchers = [
     { userId: 'user-id', email: 'user@example.com', watchedAt: '...' }
   ];
   ```

2. **Watch button on the edit modal and three-dot menu:**
   ```javascript
   function toggleWatch(rowId) {
     const row = findRowById(rowId);
     if (!row) return;
     if (!row.watchers) row.watchers = [];

     const userId = getCurrentUserId();
     const isWatching = row.watchers.some(w => w.userId === userId);

     if (isWatching) {
       row.watchers = row.watchers.filter(w => w.userId !== userId);
       showToast('Stopped watching this initiative', 'info');
     } else {
       row.watchers.push({
         userId: userId,
         email: getCurrentUserEmail(),
         name: getCurrentUserName(),
         watchedAt: new Date().toISOString(),
       });
       showToast('Watching this initiative — you\'ll get alerts on changes', 'success');
     }

     saveData();
     // Re-render the watch button state
     updateWatchButton(rowId, !isWatching);
   }

   function isWatching(rowId) {
     const row = findRowById(rowId);
     return row?.watchers?.some(w => w.userId === getCurrentUserId()) || false;
   }
   ```

3. **Watch button UI** (eye icon):
   ```javascript
   function renderWatchButton(rowId) {
     const watching = isWatching(rowId);
     return `
       <button onclick="toggleWatch('${rowId}')" class="btn-icon ${watching ? 'active' : ''}" title="${watching ? 'Stop watching' : 'Watch this initiative'}">
         <svg viewBox="0 0 20 20" width="18" height="18" stroke="currentColor" stroke-width="1.5" fill="${watching ? 'currentColor' : 'none'}">
           <path d="M1 10s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z"/>
           <circle cx="10" cy="10" r="3"/>
         </svg>
       </button>
     `;
   }
   ```

4. **Notify watchers** when the initiative changes:
   ```javascript
   function notifyWatchers(rowId, eventType, details) {
     const row = findRowById(rowId);
     if (!row?.watchers) return;

     row.watchers.forEach(watcher => {
       if (watcher.userId === getCurrentUserId()) return; // don't notify yourself

       // Create in-app notification
       if (!currentData.notifications) currentData.notifications = [];
       currentData.notifications.push({
         id: generateId(),
         type: `initiative_${eventType}`, // 'initiative_comment', 'initiative_edit', etc.
         title: getNotificationTitle(eventType, row.name, details),
         body: getNotificationBody(eventType, details),
         entityId: rowId,
         entityType: 'initiative',
         read: false,
         createdAt: new Date().toISOString(),
       });
     });

     saveData();
     updateNotificationBadge();
   }

   function getNotificationTitle(eventType, rowName, details) {
     switch(eventType) {
       case 'comment': return `New comment on "${rowName}"`;
       case 'reply': return `Reply on "${rowName}"`;
       case 'edit': return `"${rowName}" was updated`;
       case 'status_change': return `"${rowName}" status changed`;
       default: return `Update on "${rowName}"`;
     }
   }
   ```

5. **Add Duplicate, Archive, Watch to the three-dot context menu:**
   ```javascript
   // In the context menu rendering:
   `<button onclick="duplicateInitiative('${rowId}')">Duplicate</button>`
   `<button onclick="archiveInitiative('${rowId}')">Archive</button>`
   `<button onclick="toggleWatch('${rowId}')">${isWatching(rowId) ? 'Stop Watching' : 'Watch'}</button>`
   ```

---

## Fix 8: Browser Back Button — Definitive Fix

**Problem:** The browser back button STILL doesn't work properly. It navigates to random pages, shows incorrect page in the URL while displaying a different page, or takes you out of the app entirely. This has been reported in v4, v5, v7, and now v11.

**This is the DEFINITIVE fix. Read the entire navigation system first.**

**Approach:**

### Step 1: Full Audit of Current State
```bash
# Find EVERYTHING related to navigation
grep -n "showPage\|pushState\|popstate\|replaceState\|history\.\|location\.hash\|location\.href\|window\.location" renderer/index.html | head -60
```

Read the ENTIRE `showPage()` function. Read the ENTIRE `popstate` handler. Understand every line.

### Step 2: Identify the Root Cause
The most likely issue: **multiple competing navigation systems.** There may be:
- A `showPage()` that pushes state
- A hash-based router (`location.hash`)
- Sidebar clicks that call `showPage()` without consistent state
- Modal opens/closes that manipulate history
- The onLoginSuccess function not properly replacing the login state

### Step 3: Implement a Clean Single Navigation System

**Replace ALL existing navigation state management with this:**

```javascript
// ============================================================
// NAVIGATION STATE MANAGER — SINGLE SOURCE OF TRUTH
// ============================================================

const NavManager = {
  currentPage: null,
  isHandlingPopstate: false,
  pageStack: [], // for debugging

  init() {
    // Handle browser back/forward
    window.addEventListener('popstate', (event) => {
      NavManager.isHandlingPopstate = true;

      if (event.state && event.state.page) {
        NavManager._switchPage(event.state.page);
      } else {
        // No state — might be the initial load or login page
        if (isAuthenticated()) {
          NavManager._switchPage('dashboard');
          history.replaceState({ page: 'dashboard' }, '', '#dashboard');
        }
      }

      NavManager.isHandlingPopstate = false;
    });

    // Handle hash on initial load
    const hash = location.hash.replace('#', '').split('?')[0];
    if (hash && isValidPage(hash)) {
      history.replaceState({ page: hash }, '', `#${hash}`);
    }
  },

  goTo(pageId) {
    if (!pageId || pageId === NavManager.currentPage) return;

    NavManager._switchPage(pageId);

    // Only push state if this ISN'T a popstate-triggered navigation
    if (!NavManager.isHandlingPopstate) {
      history.pushState({ page: pageId }, '', `#${pageId}`);
    }

    NavManager.pageStack.push(pageId);
    if (NavManager.pageStack.length > 50) NavManager.pageStack.shift();
  },

  _switchPage(pageId) {
    NavManager.currentPage = pageId;

    // Hide ALL pages
    document.querySelectorAll('.page').forEach(p => {
      p.style.display = 'none';
    });

    // Show the target page
    const targetPage = document.getElementById(pageId + '-page') ||
                       document.getElementById(pageId);
    if (targetPage) {
      targetPage.style.display = 'block';
    } else {
      console.warn(`Page not found: ${pageId}`);
      // Fallback to dashboard
      const dashboard = document.getElementById('dashboard-page') ||
                        document.getElementById('dashboard');
      if (dashboard) dashboard.style.display = 'block';
      NavManager.currentPage = 'dashboard';
    }

    // Update navigation highlights
    NavManager._updateNavHighlight(pageId);

    // Close sidebar on mobile/web
    closeSidebarIfOpen();

    // Page-specific init
    NavManager._onPageShow(pageId);
  },

  _updateNavHighlight(pageId) {
    // Remove active from ALL nav items
    document.querySelectorAll('[data-page], .nav-item, .top-nav-item').forEach(el => {
      el.classList.remove('active', 'selected', 'current');
      el.removeAttribute('aria-current');
    });

    // Add active to matching nav items (both sidebar and top nav)
    const selectors = [
      `[data-page="${pageId}"]`,
      `[onclick*="'${pageId}'"]`,
      `[onclick*='"${pageId}"']`,
    ];
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        el.classList.add('active');
        el.setAttribute('aria-current', 'page');
      });
    });
  },

  _onPageShow(pageId) {
    // Call page-specific render functions
    switch(pageId) {
      case 'roadmap': afterRoadmapRender(); break;
      case 'integrations': renderIntegrationsPage(); break;
      case 'capacityiq': renderCapacityIQDashboard(); break;
      // ... add other pages that need init on show
    }
  },

  onLoginSuccess() {
    // Replace the login entry in history so back doesn't go there
    history.replaceState({ page: 'dashboard' }, '', '#dashboard');
    NavManager.goTo('dashboard');
  },
};

// Replace the old showPage function
function showPage(pageId, options) {
  NavManager.goTo(pageId);
}

function isValidPage(pageId) {
  return !!document.getElementById(pageId + '-page') ||
         !!document.getElementById(pageId);
}
```

### Step 4: Update ALL Navigation Triggers
1. Find every `showPage(` call and ensure they all just pass the page ID:
   ```bash
   grep -n "showPage(" renderer/index.html | wc -l
   ```
   They should all be simple: `showPage('dashboard')`, `showPage('plans')`, etc.

2. **Remove any duplicate `pushState` calls** that exist outside of NavManager.

3. **Remove any `location.hash = ` assignments** that bypass the NavManager.

4. **After login,** call `NavManager.onLoginSuccess()` instead of manual `replaceState + showPage`.

### Step 5: Handle Modal Navigation
```javascript
// When opening a modal, push a state so back closes it
function showModal(modal) {
  // ... show the modal ...
  history.pushState({ page: NavManager.currentPage, modal: true }, '', `#${NavManager.currentPage}`);
}

// In the popstate handler, check for modal state
// (already handled by NavManager — if state.page is the same as current, close modal)
```

### Step 6: Test Scenarios
After implementing, mentally trace these flows:
1. Dashboard → Plans → Roadmap → Back → Plans → Back → Dashboard → Back → stays on Dashboard (NOT login)
2. Roadmap → open edit modal → Back → closes modal, stays on Roadmap
3. Plans → Templates → Back → Plans (not login)
4. Refresh on any page → stays on that page
5. URL `#roadmap` → opens Roadmap directly

---

## Fix 9: Plans Page — Share Button + Follow (Eye) Button

**Problem:** Need a share button to email plans to internal/external users, and an eye button to follow plan changes.

### Part A: Share Plan
1. Find the Plans page toolbar:
   ```bash
   grep -n "plan.*toolbar\|plans.*header\|plan.*actions" renderer/index.html | head -15
   ```

2. **Add Share button to the Plans toolbar:**
   ```javascript
   function renderPlanShareButton(planId) {
     return `
       <button onclick="sharePlan('${planId}')" class="btn-sm btn-outline" title="Share this plan">
         <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor" stroke-width="1.5" fill="none">
           <circle cx="15" cy="4" r="3"/><circle cx="5" cy="10" r="3"/><circle cx="15" cy="16" r="3"/>
           <line x1="7.5" y1="8.5" x2="12.5" y2="5.5"/><line x1="7.5" y1="11.5" x2="12.5" y2="14.5"/>
         </svg>
         Share
       </button>
     `;
   }

   function sharePlan(planId) {
     const plan = findPlanById(planId);
     if (!plan) return;

     const modal = createModal('Share Plan');
     modal.innerHTML = `
       <div class="share-plan-form" style="max-width:480px; margin:0 auto;">
         <h3>Share "${escapeHtml(plan.name || 'Untitled Plan')}"</h3>

         <div class="form-group">
           <label>Share with (email)</label>
           <div id="share-email-list">
             <div class="share-email-row" style="display:flex; gap:8px; margin-bottom:8px;">
               <input type="email" class="share-email-input" placeholder="email@company.com" style="flex:1;">
               <button onclick="addShareEmailRow()" class="btn-icon" title="Add another">
                 <svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" stroke-width="1.5" fill="none">
                   <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
                 </svg>
               </button>
             </div>
           </div>
         </div>

         <div class="form-group">
           <label>Permission</label>
           <select id="share-permission">
             <option value="view">View only</option>
             <option value="comment">Can comment</option>
             <option value="edit">Can edit</option>
           </select>
         </div>

         <div class="form-group">
           <label>Message (optional)</label>
           <textarea id="share-message" rows="3" placeholder="Add a note for the recipients..."></textarea>
         </div>

         <div class="share-info">
           <p class="form-hint">External users who don't have a Roadmap OS account will be invited to sign up. After completing onboarding, they'll be directed straight to this plan.</p>
         </div>

         <div class="form-actions" style="margin-top:16px;">
           <button onclick="sendPlanShare('${planId}')" class="btn-primary">Send</button>
           <button onclick="closeModal()" class="btn-secondary">Cancel</button>
         </div>
       </div>
     `;
     showModal(modal);
   }

   async function sendPlanShare(planId) {
     const emails = Array.from(document.querySelectorAll('.share-email-input'))
       .map(i => i.value.trim())
       .filter(e => e && e.includes('@'));

     if (emails.length === 0) {
       showToast('Enter at least one email', 'warning');
       return;
     }

     const permission = document.getElementById('share-permission').value;
     const message = document.getElementById('share-message').value.trim();

     showLoadingOverlay('Sending invitations...');

     for (const email of emails) {
       try {
         // Create a deep link that routes to the plan after onboarding
         const deepLink = `${window.location.origin}/#plans?planId=${planId}&shared=true`;

         // Send invite via edge function
         await sendInviteEmail(email, {
           type: 'plan_share',
           planId: planId,
           planName: findPlanById(planId)?.name || 'Plan',
           permission: permission,
           message: message,
           deepLink: deepLink,
           sharedBy: getCurrentUserName(),
         });

         // Track the share
         if (!currentData.planShares) currentData.planShares = [];
         currentData.planShares.push({
           planId: planId,
           email: email,
           permission: permission,
           sharedAt: new Date().toISOString(),
           sharedBy: getCurrentUserId(),
         });
       } catch (err) {
         console.error(`Failed to share with ${email}:`, err);
       }
     }

     saveData();
     hideLoadingOverlay();
     closeModal();
     showToast(`Plan shared with ${emails.length} people`, 'success');
   }

   function addShareEmailRow() {
     const list = document.getElementById('share-email-list');
     const row = document.createElement('div');
     row.className = 'share-email-row';
     row.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';
     row.innerHTML = `
       <input type="email" class="share-email-input" placeholder="email@company.com" style="flex:1;">
       <button onclick="this.parentElement.remove()" class="btn-icon btn-danger-subtle">
         <svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" stroke-width="1.5" fill="none">
           <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
         </svg>
       </button>
     `;
     list.appendChild(row);
   }
   ```

3. **Handle deep link on load** — if someone clicks the share link and needs to sign up:
   ```javascript
   function handleDeepLink() {
     const hash = location.hash;
     if (hash.includes('planId=')) {
       const params = new URLSearchParams(hash.split('?')[1]);
       const planId = params.get('planId');
       if (planId) {
         // After auth/onboarding, navigate to the shared plan
         sessionStorage.setItem('deepLinkTarget', JSON.stringify({ page: 'plans', planId: planId }));
       }
     }
   }

   // After login/onboarding completes:
   function checkDeepLink() {
     const target = sessionStorage.getItem('deepLinkTarget');
     if (target) {
       sessionStorage.removeItem('deepLinkTarget');
       const { page, planId } = JSON.parse(target);
       showPage(page);
       if (planId) openPlan(planId);
     }
   }
   ```

### Part B: Follow Plan (Eye Button)
1. **Add a follow/watch eye button on the Plans page:**
   ```javascript
   function renderPlanFollowButton(planId) {
     const following = isPlanFollowed(planId);
     return `
       <button onclick="togglePlanFollow('${planId}')" class="btn-icon ${following ? 'active' : ''}"
               title="${following ? 'Stop following' : 'Follow this plan for change alerts'}">
         <svg viewBox="0 0 20 20" width="18" height="18" stroke="currentColor" stroke-width="1.5"
              fill="${following ? 'currentColor' : 'none'}">
           <path d="M1 10s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z"/>
           <circle cx="10" cy="10" r="3"/>
         </svg>
       </button>
     `;
   }

   function isPlanFollowed(planId) {
     return currentData?.planFollowers?.some(
       f => f.planId === planId && f.userId === getCurrentUserId()
     ) || false;
   }

   function togglePlanFollow(planId) {
     if (!currentData.planFollowers) currentData.planFollowers = [];
     const userId = getCurrentUserId();
     const existing = currentData.planFollowers.findIndex(
       f => f.planId === planId && f.userId === userId
     );

     if (existing >= 0) {
       currentData.planFollowers.splice(existing, 1);
       showToast('Stopped following this plan', 'info');
     } else {
       currentData.planFollowers.push({
         planId: planId,
         userId: userId,
         email: getCurrentUserEmail(),
         followedAt: new Date().toISOString(),
       });
       showToast('Following this plan — you\'ll get alerts on changes', 'success');
     }

     saveData();
   }
   ```

2. **Notification rules for plan followers:**
   - **Any change to the plan** → in-app alert only (under the bell icon)
   - **A task assigned to the follower is modified** → in-app alert + email
   - **A task relevant to the follower (owner/assignee) is changed** → in-app alert + email

   ```javascript
   function notifyPlanFollowers(planId, eventType, details) {
     const followers = (currentData.planFollowers || []).filter(f => f.planId === planId);
     const plan = findPlanById(planId);

     followers.forEach(follower => {
       if (follower.userId === getCurrentUserId()) return;

       // In-app alert for ALL changes
       if (!currentData.notifications) currentData.notifications = [];
       currentData.notifications.push({
         id: generateId(),
         type: `plan_${eventType}`,
         title: `Plan "${plan?.name || 'Unknown'}" updated`,
         body: details.summary || 'A change was made to a plan you follow.',
         entityId: planId,
         entityType: 'plan',
         read: false,
         createdAt: new Date().toISOString(),
       });

       // Email ONLY if the change is relevant to the follower (assigned task modified)
       if (details.isRelevantTo === follower.email || details.isRelevantTo === follower.userId) {
         sendNotificationEmail(follower.userId, {
           subject: `[Roadmap OS] Update to your task in "${plan?.name}"`,
           body: details.emailBody || `A task assigned to you was updated in "${plan?.name}".`,
         });
       }
     });

     saveData();
     updateNotificationBadge();
   }
   ```

---

## Post-Fix Checklist

1. **Onboarding:** Team setup step works — can name team, add description, invite members by email.
2. **Loading spinner:** Shows the Roadmap OS branded spinner on heavy page loads and async operations.
3. **Free trial:** All references removed from the app UI (except the feedback page CTA for non-users).
4. **Sample data:** First-time users see a populated roadmap with sample sections, initiatives, to-dos, and KPIs. Banner offers to clear it.
5. **Initiative fields:** Revenue/ROI, labels, owner, created/updated dates all visible and editable on the edit modal.
6. **Comments:** Can add comments, like, reply in threads on initiatives. Watchers get notified.
7. **Duplicate:** Creates a copy of the initiative in the same section.
8. **Archive:** Soft-deletes to archive, restorable from an archive view.
9. **Watch:** Eye icon toggles following. Changes trigger in-app alerts for watchers.
10. **Browser back:** Works correctly across ALL page transitions. No random pages, no login redirect, no URL/page mismatch.
11. **Share plan:** Can share via email with permission levels. External users get deep link through onboarding.
12. **Follow plan:** Eye button sends in-app alerts for all changes, email only for relevant/assigned task changes.
13. **Dark mode:** All new elements use CSS variables.
14. **Emoji sweep:** `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` — must be 0.
15. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
16. **Bump version** in `package.json`
17. **Rebuild web:** `cd web && npm run build`
18. **Commit:** `git add -A && git commit -m "vX.Y.Z: v11 — initiative comments/labels/archive/watch, onboarding teams, browser nav fix, plan sharing"`
19. **Update FIX_LOG_V11.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V11.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix.** Re-read changes, check syntax, verify both light and dark mode.
4. **If a fix is blocked**, implement what you can, add `// TODO:` comments, log it, move on.
5. **Preserve existing patterns.** Match the codebase style.
6. **Both modes matter.** Every element uses CSS variables.
7. **Keep the single-file SPA pattern.** All UI changes in `renderer/index.html`.
8. **Zero emoji.** SVG icons for everything.
9. **Fix 8 (browser back) is the FOURTH attempt.** Replace the entire navigation state system with `NavManager`. Remove ALL competing `pushState/popstate/hash` code. Single source of truth. Test mentally against the 5 scenarios listed.
10. **Fix 7 (archive) creates a new data structure** (`currentData.archive`). Ensure it's included in the backup export (Fix 16 from v1) and the sync system.
11. **Fix 9 (plan share) needs deep linking.** The shared link must work for users who don't have accounts yet — store the target in `sessionStorage`, complete onboarding, then redirect to the plan.
