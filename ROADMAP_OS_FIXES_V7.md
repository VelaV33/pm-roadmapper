# Roadmap OS — Autonomous Fix Queue v7

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V7.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/`
- Data stored as one JSONB blob per user in `roadmap_data` table via `sync-roadmap` edge function
- Desktop data also saved locally as JSON files in `%APPDATA%` (Electron) or IndexedDB (web)
- Navigation: `showPage('pageId')` pattern with `history.pushState` for browser back
- Dark mode: CSS variables + class toggle (definitive variable system established in v6)
- ZERO emoji policy — SVG icons only
- Dual-target: same renderer runs in Electron AND web via the shim pattern (24 IPC methods)

**Before starting:**
1. `grep -n "datePicker\|date-picker\|quarterSelect\|monthSelect\|dateInput\|addRow.*date\|new.*row.*date\|startDate\|endDate" renderer/index.html | head -30`
2. `grep -n "editRow\|edit-row\|rowEditor\|openEdit\|closeEdit\|editModal\|row.*modal" renderer/index.html | head -30`
3. `grep -n "addRow\|Add Row\|Add row\|add-row\|addProduct\|Add Product\|addInitiative\|Add Initiative" renderer/index.html | head -30`
4. `grep -n "settings.*page\|settings.*modal\|Settings.*Settings\|Style.*tab\|Brand.*tab\|TPL.*tab\|artefact.*template" renderer/index.html | head -30`
5. `grep -n "syncRoadmap\|sync-roadmap\|loadRoadmap\|saveRoadmap\|syncData\|localData\|remoteData\|mergeData" renderer/index.html | head -30`
6. `grep -n "profilePic\|profile.*photo\|avatar.*upload\|user.*photo\|profile.*image" renderer/index.html | head -20`
7. Log all findings in `FIX_LOG_V7.md`

---

## Fix 1: Date Picker — Default to Current Date Context

**Problem:** When adding a new row, the date/quarter picker allows selecting quarters from last year (2025) even though it's 2026. The picker should default to the current date/quarter so users start from "now" and adjust from there. They should still be able to go back to past dates — it just needs to start at the right place.

**Approach:**
1. Find the date picker in the Add Row modal:
   ```bash
   grep -n "addRow.*modal\|new.*row\|Add Row\|dateSelect\|quarterPicker\|startDate\|date.*input.*row" renderer/index.html | head -20
   ```

2. **Identify the picker type:**
   - Is it a custom quarter picker (Q1 2025, Q2 2025, ...)?
   - Is it a standard `<input type="date">`?
   - Is it a month/year dropdown combination?

3. **Fix: Set default values to current date context:**
   ```javascript
   function initRowDatePicker() {
     const now = new Date();
     const currentYear = now.getFullYear();
     const currentMonth = now.getMonth() + 1; // 1-12
     const currentQuarter = Math.ceil(currentMonth / 3);

     // If it's a quarter picker
     const quarterSelect = document.getElementById('row-quarter-select');
     if (quarterSelect) {
       // Set the default selected value to current quarter
       quarterSelect.value = `Q${currentQuarter} ${currentYear}`;

       // If using separate year + quarter dropdowns:
       const yearSelect = document.getElementById('row-year-select');
       if (yearSelect) yearSelect.value = currentYear;
     }

     // If it's a date input
     const dateInput = document.getElementById('row-start-date');
     if (dateInput) {
       // Set to today's date as default
       dateInput.value = now.toISOString().split('T')[0]; // YYYY-MM-DD
     }

     // If it's a month picker
     const monthSelect = document.getElementById('row-month-select');
     if (monthSelect) {
       monthSelect.value = currentMonth;
     }
   }
   ```

4. **If the picker generates a list of quarters/months,** ensure the list starts scrolled to or centered on the current quarter:
   ```javascript
   function generateQuarterOptions() {
     const now = new Date();
     const currentYear = now.getFullYear();
     const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
     const fyStart = currentData?.settings?.fyStartMonth || 1;

     const options = [];

     // Generate quarters: 2 years back, current year, 2 years forward
     for (let year = currentYear - 2; year <= currentYear + 2; year++) {
       for (let q = 1; q <= 4; q++) {
         const option = {
           label: `Q${q} ${year}`,
           value: `Q${q}-${year}`,
           isCurrent: (year === currentYear && q === currentQuarter),
         };
         options.push(option);
       }
     }

     return options;
   }

   function renderQuarterPicker(selectId) {
     const options = generateQuarterOptions();
     const select = document.getElementById(selectId);
     select.innerHTML = '';

     options.forEach(opt => {
       const optEl = document.createElement('option');
       optEl.value = opt.value;
       optEl.textContent = opt.label;
       if (opt.isCurrent) {
         optEl.selected = true;
       }
       select.appendChild(optEl);
     });
   }
   ```

5. **Also fix the end date** — if the start date defaults to now, the end date should default to start + 1 quarter or start + 3 months.

6. **Call `initRowDatePicker()`** every time the Add Row modal opens, not just once on page load.

---

## Fix 2: Edit Row — Navigation Links Breaking the View

**Problem:** When editing a row and clicking a link like "To-Do" inside the editor, it navigates away from the roadmap view to the To-Do page, and you can't navigate back. The edit modal closes and context is lost.

**Approach:**
1. Find the edit row modal and any internal links:
   ```bash
   grep -n "editRow\|edit-row\|rowEditor\|openEditRow\|editModal\|row-detail" renderer/index.html | head -20
   ```

2. **Diagnose:** Look for links or buttons inside the edit modal that call `showPage()`:
   ```bash
   grep -n "showPage.*todo\|showPage.*plans\|showPage.*checklist" renderer/index.html | head -20
   ```

3. **The fix has two parts:**

   ### Part A: Prevent navigation from closing the modal without saving
   Any link inside the edit modal that navigates to another page should either:
   - **Option 1:** Open in context (don't navigate away — show the linked content in a sub-panel or popup)
   - **Option 2:** Save the current edit state, navigate, and allow the user to return

   Best approach is Option 2 with back navigation support:
   ```javascript
   function navigateFromEditRow(targetPage) {
     // Save current edit state temporarily
     const editState = captureEditRowState();
     sessionStorage.setItem('pendingEditRow', JSON.stringify(editState));

     // Close the edit modal
     closeEditRow();

     // Navigate to the target page
     showPage(targetPage);

     // The back button (history.popstate) will return to roadmap
     // and we can restore the edit state
   }

   // When returning to the roadmap page, check for pending edit
   function onRoadmapPageShown() {
     const pending = sessionStorage.getItem('pendingEditRow');
     if (pending) {
       const editState = JSON.parse(pending);
       sessionStorage.removeItem('pendingEditRow');
       // Re-open the edit modal with the saved state
       openEditRow(editState.rowId);
     }
   }
   ```

   ### Part B: Ensure browser back works from the navigated page
   This relies on the `history.pushState` system (from v4/v5). Verify that:
   - The roadmap page pushes state when shown
   - The edit modal state is tracked
   - Pressing back from To-Do goes back to Roadmap (not login)

   ```javascript
   // In showPage(), after switching to roadmap page:
   if (pageId === 'roadmap') {
     onRoadmapPageShown();
   }
   ```

4. **Alternative simpler fix:** If links inside the edit modal are just informational references (like "linked to To-Do task X"), make them NOT navigate. Instead, show a tooltip or a small popup with the linked item's details:
   ```javascript
   function showLinkedItemPreview(type, itemId) {
     // Instead of navigating away, show a small preview popup
     // with the item's name, status, and a "Go to page" link
     const popup = createPopup(`
       <div class="linked-item-preview">
         <h4>${item.name}</h4>
         <span class="status-badge">${item.status}</span>
         <p>${item.description || 'No description'}</p>
         <button onclick="closePopup(); navigateFromEditRow('${type}')">
           Go to ${type} page →
         </button>
       </div>
     `);
     showPopup(popup);
   }
   ```

---

## Fix 3: Add Initiative Shortcut on Row Three-Dot Menu

**Problem:** Users want to add an initiative directly from the three-dot dropdown menu on a roadmap row, without having to open the full row editor first.

**Approach:**
1. Find the three-dot menu / context menu for rows:
   ```bash
   grep -n "three-dot\|context-menu\|row-menu\|rowMenu\|moreOptions\|row.*dropdown\|row.*actions\|ellipsis" renderer/index.html | head -20
   ```

2. **Add an "Add Initiative" option to the three-dot menu:**
   ```javascript
   function showRowContextMenu(rowId, event) {
     const menu = document.getElementById('row-context-menu');
     menu.innerHTML = `
       <button onclick="addInitiativeToRow('${rowId}')">
         <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor"
              stroke-width="1.5" fill="none">
           <line x1="10" y1="4" x2="10" y2="16"/>
           <line x1="4" y1="10" x2="16" y2="10"/>
         </svg>
         Add Initiative
       </button>
       <!-- existing menu items below -->
       <button onclick="editRow('${rowId}')">Edit</button>
       <button onclick="duplicateRow('${rowId}')">Duplicate</button>
       <button onclick="deleteRow('${rowId}')">Delete</button>
     `;
     // Position menu near the click
     menu.style.top = event.clientY + 'px';
     menu.style.left = event.clientX + 'px';
     menu.style.display = 'block';
   }
   ```

3. **"Add Initiative" flow — lightweight inline creation:**
   Instead of opening the full editor, show a compact inline form or a small modal:
   ```javascript
   function addInitiativeToRow(rowId) {
     closeContextMenu();

     // Show a compact modal
     const modal = createModal('Add Initiative');
     modal.innerHTML = `
       <div class="compact-form">
         <div class="form-group">
           <label>Initiative Name</label>
           <input type="text" id="new-initiative-name" placeholder="e.g., Mobile App v2.0"
                  autofocus>
         </div>
         <div class="form-row">
           <div class="form-group half">
             <label>Priority</label>
             <select id="new-initiative-priority">
               <option value="High">High</option>
               <option value="Medium" selected>Medium</option>
               <option value="Low">Low</option>
             </select>
           </div>
           <div class="form-group half">
             <label>Status</label>
             <select id="new-initiative-status">
               <option value="Strategy">Strategy</option>
               <option value="In Progress" selected>In Progress</option>
               <option value="Released">Released</option>
             </select>
           </div>
         </div>
         <div class="form-actions">
           <button onclick="closeModal()" class="btn-secondary">Cancel</button>
           <button onclick="saveQuickInitiative('${rowId}')" class="btn-primary">Add</button>
         </div>
       </div>
     `;
     showModal(modal);

     // Focus the name input
     setTimeout(() => document.getElementById('new-initiative-name')?.focus(), 100);
   }

   function saveQuickInitiative(parentRowId) {
     const name = document.getElementById('new-initiative-name').value.trim();
     if (!name) {
       showToast('Enter an initiative name', 'warning');
       return;
     }

     const initiative = {
       id: generateId(),
       name: name,
       priority: document.getElementById('new-initiative-priority').value,
       status: document.getElementById('new-initiative-status').value,
       parentRowId: parentRowId, // linked to the parent row
       createdAt: new Date().toISOString(),
     };

     // Find the parent row and add the initiative
     // Initiatives might be sub-rows within a section, or a nested array within a row
     // Check the data model:
     const row = findRowById(parentRowId);
     if (row) {
       if (!row.initiatives) row.initiatives = [];
       row.initiatives.push(initiative);
     }

     saveData();
     renderRoadmap();
     closeModal();
     showToast(`Initiative "${name}" added`, 'success');
   }
   ```

4. **Note on data model:** Check how the existing codebase structures initiatives vs rows. If rows ARE initiatives (flat structure), then "Add Initiative" might mean adding a sub-item or a related row within the same section. Adapt to whatever the existing pattern is.

---

## Fix 4: Rename "Add Row" to "Add Product"

**Problem:** The "Add Row" button/label across the app should be renamed to "Add Product" to better reflect the domain language.

**Approach:**
1. Find all instances:
   ```bash
   grep -n "Add Row\|Add row\|add-row\|addRow\|ADD ROW" renderer/index.html
   ```

2. **Replace ALL visible labels:**
   - Button text: "Add Row" → "Add Product"
   - Tooltips: "Add a new row" → "Add a new product"
   - Placeholders or helper text
   - Any onboarding/tour text that references "row"

3. **Keep function names as-is** for backward compatibility — only change the user-facing labels:
   ```javascript
   // Function stays addRow() internally
   // But the button says "Add Product"
   <button onclick="addRow()">Add Product</button>
   ```

4. **Check these locations:**
   - Sidebar nav (if still there after v6 sidebar reorg)
   - Roadmap page toolbar / legend dropdown
   - Three-dot context menu on sections
   - Keyboard shortcuts or tooltips
   - Onboarding flow text
   - Any documentation strings

5. **Do NOT rename the "Add Initiative" from Fix 3** — that stays as "Add Initiative" since it's a different concept (sub-item of a product/row).

---

## Fix 5: Settings Reorganization

**Problem:** Multiple issues with the Settings page:
1. "Style", "Brand", and "TPL artefacts templates" tabs should be moved to the Artefacts page
2. The settings popup title says "Settings Settings" (doubled)
3. Settings should live under the profile page (top-right avatar), not in the left nav
4. User role field should be read-only (only platform admin can edit roles)
5. The role label should say "User Role" not just "User"

### Part A: Move Style/Brand/TPL to Artefacts
1. Find these tabs:
   ```bash
   grep -n "Style.*tab\|Brand.*tab\|TPL.*tab\|artefact.*template.*tab\|style-settings\|brand-settings" renderer/index.html | head -20
   ```

2. **Cut the HTML content** for these tabs from the Settings page.

3. **Paste into the Artefacts page** as additional tabs or sections:
   - The Artefacts page should now have: Documents, Templates, Brand, Style
   - Or: add them as a "Brand & Style" section within the Artefacts page

4. **Ensure all functionality still works** after the move — any save handlers, data bindings, etc.

### Part B: Fix Double "Settings Settings" Title
1. Find the title:
   ```bash
   grep -n "Settings.*Settings\|settings.*title\|<h[1-6]>.*Settings" renderer/index.html | head -10
   ```

2. There's likely a page title ("Settings") AND a modal/popup title ("Settings") both rendering. Remove the duplicate so only one "Settings" appears.

### Part C: Move Settings to Profile Page (Top-Right)
1. Find the settings nav item in the sidebar:
   ```bash
   grep -n "settings.*nav\|nav.*settings\|sidebar.*settings\|showPage.*settings" renderer/index.html | head -15
   ```

2. **Remove Settings from the left sidebar nav.**

3. **Add Settings to the profile menu** (the dropdown that appears when clicking the user avatar in the top-right):
   ```javascript
   function toggleProfileMenu() {
     const menu = document.getElementById('profile-dropdown');
     menu.innerHTML = `
       <div class="profile-menu">
         <div class="profile-header">
           <div class="profile-avatar"><!-- avatar --></div>
           <div class="profile-info">
             <span class="profile-name">${getUserName()}</span>
             <span class="profile-email">${getUserEmail()}</span>
           </div>
         </div>
         <div class="profile-menu-items">
           <button onclick="showPage('profile')">My Profile</button>
           <button onclick="showPage('settings')">Settings</button>
           <button onclick="showPage('notifications')">Notifications</button>
           <hr>
           <button onclick="logout()">Sign Out</button>
         </div>
       </div>
     `;
     menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
   }
   ```

4. **Profile dropdown CSS:**
   ```css
   .profile-dropdown {
     position: absolute;
     top: 48px; right: 12px;
     background: var(--bg-card);
     border: 1px solid var(--border-primary);
     border-radius: 12px;
     box-shadow: 0 8px 24px rgba(0,0,0,0.15);
     min-width: 240px;
     z-index: 1000;
     padding: 8px 0;
   }
   .profile-menu-items button {
     display: block; width: 100%;
     text-align: left;
     padding: 10px 16px;
     border: none; background: none;
     color: var(--text-primary);
     font-size: 13px;
     cursor: pointer;
   }
   .profile-menu-items button:hover {
     background: var(--bg-hover);
   }
   ```

### Part D: User Role — Read-Only + Label Fix
1. Find the user role field:
   ```bash
   grep -n "user.*role\|userRole\|role.*select\|role.*input\|role.*field" renderer/index.html | grep -i "settings\|profile" | head -10
   ```

2. **Change the label** from "User" to "User Role".

3. **Make it read-only** for non-admin users:
   ```javascript
   function renderRoleField() {
     const currentUserRole = getUserRole(); // 'user', 'admin', 'super_admin', 'platform_admin'
     const canEditRoles = currentUserRole === 'platform_admin' || currentUserRole === 'super_admin';

     if (canEditRoles) {
       return `
         <div class="form-group">
           <label>User Role</label>
           <select id="user-role-select" onchange="updateUserRole(this.value)">
             <option value="user">User</option>
             <option value="admin">Admin</option>
             <option value="super_admin">Super Admin</option>
             ${currentUserRole === 'platform_admin' ? '<option value="platform_admin">Platform Admin</option>' : ''}
           </select>
         </div>
       `;
     } else {
       return `
         <div class="form-group">
           <label>User Role</label>
           <div class="read-only-field">
             <span class="role-badge">${formatRoleName(currentUserRole)}</span>
             <span class="role-hint">Contact your admin to change your role</span>
           </div>
         </div>
       `;
     }
   }

   function formatRoleName(role) {
     const names = {
       'user': 'User',
       'admin': 'Admin',
       'super_admin': 'Super Admin',
       'platform_admin': 'Platform Admin',
     };
     return names[role] || role;
   }
   ```

---

## Fix 6: Desktop ↔ Web Data Sync Investigation + Fix

**Problem:** The data seen on the desktop app (Electron) is different from the data on the web app. Profile pictures and roadmaps are different between the two. They should show identical data for the same logged-in user.

**This is the most critical fix in this batch — data integrity.**

**Approach:**

### Step 1: Understand the Sync Architecture
1. Find the sync mechanism:
   ```bash
   grep -n "syncRoadmap\|sync-roadmap\|saveRoadmap\|loadRoadmap\|fetchRoadmap\|upsertRoadmap" renderer/index.html | head -30
   grep -n "syncRoadmap\|sync-roadmap\|saveRoadmap\|loadRoadmap" main.js | head -20
   grep -n "syncRoadmap\|sync-roadmap\|saveRoadmap\|loadRoadmap" web/shim/electronAPI.js | head -20
   ```

2. **Check the sync-roadmap edge function:**
   ```bash
   cat supabase/functions/sync-roadmap/index.ts
   ```
   Understand: Does it upsert the JSONB blob? Is it keyed by `user_id`?

3. **Map the data flow in BOTH environments:**

   **Electron (desktop):**
   ```
   User action → renderer → window.electronAPI.saveRoadmapData()
                          → main.js IPC handler
                          → saves to local JSON file (%APPDATA%)
                          → ALSO syncs to Supabase via https.request?
   ```

   **Web:**
   ```
   User action → renderer → window.electronAPI.saveRoadmapData()
                          → web/shim/electronAPI.js
                          → saves to IndexedDB (local cache)
                          → ALSO syncs to Supabase via fetch?
   ```

### Step 2: Identify the Discrepancy Root Cause
Common causes for data divergence:

**a) Local-only saves (no server sync):**
- The Electron app might save to `%APPDATA%` but never push to Supabase
- Or the web app saves to IndexedDB but never pushes to Supabase
- Fix: ensure EVERY save triggers a Supabase sync

**b) Load order — local overrides server:**
- On startup, the app might load from local storage FIRST and never check the server
- Or it checks the server but the local data is "newer" (by timestamp) and wins
- Fix: always load from Supabase as the source of truth, then merge with local

**c) Different user IDs:**
- If the user signed up with email on desktop and Google OAuth on web, they might have TWO separate `auth.users` entries with different UUIDs
- The JSONB blob is keyed by `user_id`, so two UUIDs = two separate roadmaps
- Fix: check `auth.users` for duplicate entries with the same email

**d) Profile picture stored differently:**
- Desktop might store the profile pic in `%APPDATA%` or localStorage
- Web might store it in Supabase Storage or as base64 in the JSONB blob
- If one platform writes to local storage and the other to Supabase, they won't match
- Fix: always store profile pic in Supabase Storage and read from there on both platforms

### Step 3: Implement Proper Sync
```javascript
// ============================================
// SYNC STRATEGY: Supabase is the Source of Truth
// ============================================

async function syncData() {
  try {
    const userId = getCurrentUserId();
    if (!userId) return;

    // 1. Fetch server data
    const serverData = await fetchServerRoadmap(userId);

    // 2. Get local data
    const localData = getLocalRoadmapData();

    // 3. Determine which is newer
    const serverTimestamp = serverData?.lastModified || 0;
    const localTimestamp = localData?.lastModified || 0;

    if (serverTimestamp > localTimestamp) {
      // Server is newer — use server data
      currentData = serverData;
      saveLocalRoadmapData(currentData); // update local cache
      console.log('Sync: loaded from server (newer)');
    } else if (localTimestamp > serverTimestamp) {
      // Local is newer — push to server
      currentData = localData;
      await pushToServer(currentData);
      console.log('Sync: pushed local to server (newer)');
    } else {
      // Same timestamp — no action needed
      currentData = serverData || localData;
      console.log('Sync: data is in sync');
    }

    // 4. Re-render
    renderRoadmap();

  } catch (err) {
    console.error('Sync error:', err);
    // Fallback to local data if server is unreachable
    currentData = getLocalRoadmapData();
    renderRoadmap();
  }
}

async function saveData() {
  // Add timestamp
  currentData.lastModified = Date.now();

  // Save locally (fast, immediate)
  saveLocalRoadmapData(currentData);

  // Push to server (async, can fail gracefully)
  try {
    await pushToServer(currentData);
  } catch (err) {
    console.error('Server sync failed (will retry):', err);
    // Queue for retry
    markPendingSync();
  }
}

async function pushToServer(data) {
  // Call the sync-roadmap edge function
  const response = await fetch(SUPABASE_URL + '/functions/v1/sync-roadmap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getAccessToken(),
    },
    body: JSON.stringify({ data: data }),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`);
  }
}
```

### Step 4: Fix the Electron Sync Path
1. Check `main.js` for the save handler:
   ```bash
   grep -n "saveRoadmap\|ipcMain.*save\|roadmap.*save\|writeFile.*roadmap" main.js | head -15
   ```

2. **Ensure the Electron save path ALSO pushes to Supabase:**
   - If it only writes to a local JSON file, add a Supabase sync call
   - The Electron main process has access to `https.request` (Node.js) for making API calls
   - The sync should happen AFTER the local save succeeds (local is the fast path)

3. **Ensure the Electron load path fetches from Supabase:**
   - On startup, fetch from Supabase and compare with local
   - If server is newer, use server data
   - If local is newer, push to server

### Step 5: Fix Profile Picture Sync
1. Profile pictures should be stored in **Supabase Storage** — not locally:
   ```javascript
   async function uploadProfilePicture(file) {
     const userId = getCurrentUserId();
     const path = `${userId}/profile/avatar`;

     // Upload to Supabase Storage
     const { error } = await _supabase.storage
       .from('attachments')
       .upload(path, file, { upsert: true });

     if (error) throw error;

     // Get public URL
     const { data } = _supabase.storage
       .from('attachments')
       .getPublicUrl(path);

     // Save URL to user data (synced via JSONB blob)
     if (!currentData.settings) currentData.settings = {};
     currentData.settings.profilePictureUrl = data.publicUrl;
     await saveData(); // triggers sync

     // Update the avatar display
     loadUserAvatar();
   }
   ```

2. **On load, the avatar should always read from the synced data:**
   ```javascript
   function loadUserAvatar() {
     const url = currentData?.settings?.profilePictureUrl;
     const avatarImg = document.getElementById('user-avatar-img');
     const avatarInitials = document.getElementById('user-avatar-initials');

     if (url) {
       avatarImg.src = url;
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

### Step 6: Verify the Fix
After implementing:
1. Log in on web → make a change → verify it appears on desktop (after login/refresh)
2. Log in on desktop → make a change → verify it appears on web
3. Upload a profile picture on web → verify it shows on desktop
4. Upload a profile picture on desktop → verify it shows on web
5. Check that the `roadmap_data` table in Supabase has exactly ONE row per user (not duplicates)

---

## Post-Fix Checklist

1. **Date picker:** Open Add Product (formerly Add Row) → date/quarter picker starts at current date/quarter. Can still scroll back to past dates.
2. **Edit row navigation:** Click a link inside the edit modal → navigates to that page → browser back returns to roadmap → edit modal can be re-opened.
3. **Add Initiative:** Three-dot menu on a row → "Add Initiative" → compact form → saves without opening full editor.
4. **Add Product:** All "Add Row" labels changed to "Add Product".
5. **Settings reorganization:**
   - Style/Brand/TPL moved to Artefacts page
   - No "Settings Settings" double title
   - Settings accessible from profile menu (top-right), not sidebar
   - User Role field shows "User Role" label and is read-only for non-admins
6. **Data sync:** Same user logged into desktop AND web sees identical data: same roadmap, same profile picture, same everything.
7. **Dark mode:** All new UI elements use CSS variables from v6.
8. **Emoji sweep:** `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` — must be 0.
9. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
10. **Bump version** in `package.json`
11. **Rebuild web:** `cd web && npm run build`
12. **Commit:** `git add -A && git commit -m "vX.Y.Z: v7 — data sync fix, settings reorg, add initiative, add product rename, date picker context"`
13. **Update FIX_LOG_V7.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V7.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix:** Re-read changes, check syntax, verify both light and dark mode.
4. **If a fix is blocked**, implement what you can, add `// TODO:` comments, log it, move on.
5. **Preserve existing patterns.** Match the codebase style exactly.
6. **Both modes matter.** Every element uses CSS variables.
7. **Keep the single-file SPA pattern.** All UI changes go into `renderer/index.html`.
8. **Zero emoji.** Replace any emoji encountered.
9. **Fix 6 (data sync) is the most critical.** Data integrity between desktop and web is foundational — take extra care with the sync logic. Check BOTH `main.js` (Electron) AND `web/shim/electronAPI.js` (web). Ensure Supabase is the source of truth.
10. **Fix 5 (settings reorg) touches navigation.** Verify the sidebar still works after removing Settings, and the profile dropdown works for accessing Settings.
