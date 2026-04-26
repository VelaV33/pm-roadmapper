# Roadmap OS — Autonomous Fix Queue v14

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V14.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Data stored as one JSONB blob per user in `roadmap_data` table
- Navigation: `NavManager.goTo()` / `showPage()` with `history.pushState`
- Dark mode: CSS variables. ZERO emoji — SVG icons only.
- Products = roadmap rows in `currentData.sections[].rows[]`
- Initiatives = sub-items within rows, or the rows themselves depending on context
- Watchers: `row.watchers[]`, notifications: `currentData.notifications[]`

**Before starting:**
1. `grep -n "matrix\|Matrix\|plotItem\|scatter\|quadrant\|valueVsEffort\|prioriti.*chart\|bubble" renderer/index.html | head -30`
2. `grep -n "editRow\|editInitiative\|edit-row\|initiative.*click\|pill.*click\|bar.*click\|openEdit" renderer/index.html | head -30`
3. `grep -n "product.*description\|productDesc\|description.*block\|recording\|record.*btn\|voice.*record" renderer/index.html | head -20`
4. `grep -n "currency\|Currency\|\\\$\|USD\|ZAR\|EUR\|GBP" renderer/index.html | head -15`
5. `grep -n "drag.*drop\|dragstart\|dragover\|dragend\|ondrag\|sortable\|draggable" renderer/index.html | head -30`
6. `grep -n "kanban.*view\|Kanban\|kanban-column\|kanban-card\|kanban.*render" renderer/index.html | head -20`
7. `grep -n "merge.*roadmap\|stack.*roadmap\|combineRoadmap\|mergeRoadmap" renderer/index.html | head -15`
8. `grep -n "range\|Range\|date.*range\|dateRange\|filterRange\|RANGE\|this.*year\|financial.*year" renderer/index.html | head -20`
9. `grep -n "tooltip\|title=\|data-tooltip" renderer/index.html | head -30`
10. Log all findings in `FIX_LOG_V14.md`

---

## Fix 1: Prioritisation Matrix — Plot Items + Select All + Display Panel Position

**Problem:** Three issues on the Value vs Effort Matrix:
1. Selected items are not plotted on the matrix — they appear in the list but not as dots/bubbles on the chart
2. No "Select All" button on the Items tab
3. The "Display" panel (Labels, etc.) is positioned too far right, getting cut off by the page edge

### Part A: Plot Items on the Matrix
1. Find the matrix rendering:
   ```bash
   grep -n "renderMatrix\|drawMatrix\|plotMatrix\|scatter.*plot\|quadrant.*render\|matrix.*canvas\|matrix.*svg" renderer/index.html | head -20
   ```

2. **Diagnose:** Items are checked in the list but the plotting function either:
   - Doesn't read the checked state
   - Doesn't have value/effort scores to determine x,y coordinates
   - Has a rendering bug (items drawn at 0,0 or off-screen)

3. **Fix — ensure items are plotted when selected:**
   ```javascript
   function plotMatrixItems() {
     const container = document.getElementById('matrix-chart') || document.querySelector('.matrix-svg, .matrix-canvas');
     if (!container) return;

     // Get all checked items
     const checkedItems = getCheckedMatrixItems();

     // Clear existing plots
     container.querySelectorAll('.matrix-dot, .matrix-bubble').forEach(el => el.remove());

     checkedItems.forEach(item => {
       // Get scores — items MUST have value and effort scores
       let valueScore = item.valueScore || item.value || 0;
       let effortScore = item.effortScore || item.effort || 0;

       // If no scores exist, calculate from priority/status or prompt user
       if (valueScore === 0 && effortScore === 0) {
         // Auto-assign based on priority as a starting point
         const priorityMap = { 'High': 8, 'Medium': 5, 'Low': 2 };
         valueScore = priorityMap[item.priority] || 5;
         effortScore = 5; // default to middle
       }

       // Calculate pixel/percentage position
       // Value (Y axis) = bottom to top (low=bottom, high=top)
       // Effort (X axis) = left to right (low=left, high=right)
       const maxScore = 10;
       const xPercent = (effortScore / maxScore) * 100;
       const yPercent = 100 - (valueScore / maxScore) * 100; // invert for CSS top

       // Create the dot/bubble
       const dot = document.createElement('div');
       dot.className = 'matrix-dot';
       dot.dataset.itemId = item.id;
       dot.style.cssText = `
         position: absolute;
         left: ${xPercent}%;
         top: ${yPercent}%;
         transform: translate(-50%, -50%);
         width: 24px;
         height: 24px;
         border-radius: 50%;
         background: ${getItemColor(item)};
         border: 2px solid white;
         cursor: pointer;
         z-index: 2;
         box-shadow: 0 2px 6px rgba(0,0,0,0.2);
         transition: transform 0.2s;
       `;
       dot.title = `${item.name}\nValue: ${valueScore} · Effort: ${effortScore}`;
       dot.onclick = () => openProductDetail(item.id);
       dot.onmouseenter = () => dot.style.transform = 'translate(-50%, -50%) scale(1.3)';
       dot.onmouseleave = () => dot.style.transform = 'translate(-50%, -50%) scale(1)';

       // Add label if labels are enabled
       if (isMatrixLabelsEnabled()) {
         const label = document.createElement('span');
         label.className = 'matrix-dot-label';
         label.textContent = item.name.length > 20 ? item.name.substring(0, 18) + '...' : item.name;
         label.style.cssText = `
           position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
           font-size: 10px; white-space: nowrap; color: var(--text-primary);
           margin-top: 4px; pointer-events: none;
         `;
         dot.appendChild(label);
       }

       container.appendChild(dot);
     });
   }

   function getItemColor(item) {
     // Color by section or priority
     const section = findSectionContainingRow(item.id);
     if (section?.color) return section.color;
     const priorityColors = { 'High': '#ef4444', 'Medium': '#f59e0b', 'Low': '#22c55e' };
     return priorityColors[item.priority] || '#3b82f6';
   }
   ```

4. **Make items draggable on the matrix** so users can reposition them to set value/effort scores:
   ```javascript
   function enableMatrixDrag(dot) {
     let isDragging = false;
     let startX, startY;

     dot.addEventListener('mousedown', (e) => {
       isDragging = true;
       startX = e.clientX;
       startY = e.clientY;
       dot.style.zIndex = '10';
       e.preventDefault();
     });

     document.addEventListener('mousemove', (e) => {
       if (!isDragging) return;
       const container = dot.parentElement;
       const rect = container.getBoundingClientRect();
       const x = ((e.clientX - rect.left) / rect.width) * 100;
       const y = ((e.clientY - rect.top) / rect.height) * 100;

       dot.style.left = `${Math.max(0, Math.min(100, x))}%`;
       dot.style.top = `${Math.max(0, Math.min(100, y))}%`;
     });

     document.addEventListener('mouseup', () => {
       if (!isDragging) return;
       isDragging = false;
       dot.style.zIndex = '2';

       // Save the new scores
       const container = dot.parentElement;
       const rect = container.getBoundingClientRect();
       const dotRect = dot.getBoundingClientRect();
       const xPercent = ((dotRect.left + dotRect.width/2 - rect.left) / rect.width) * 100;
       const yPercent = ((dotRect.top + dotRect.height/2 - rect.top) / rect.height) * 100;

       const effortScore = Math.round((xPercent / 100) * 10);
       const valueScore = Math.round(((100 - yPercent) / 100) * 10);

       const itemId = dot.dataset.itemId;
       const row = findRowById(itemId);
       if (row) {
         row.effortScore = effortScore;
         row.valueScore = valueScore;
         saveData();
       }
     });
   }
   ```

### Part B: Select All Button
1. Add a "Select All" checkbox at the top of the Items list:
   ```javascript
   function renderMatrixItemsList() {
     const items = getAllProducts();
     let html = `
       <div class="select-all-bar">
         <label><input type="checkbox" id="matrix-select-all" onchange="toggleAllMatrixItems(this.checked)"> Select All (${items.length})</label>
         <span id="matrix-selected-count">0 on chart</span>
       </div>
     `;
     // ... render individual items with checkboxes ...
     return html;
   }
   ```

### Part C: Fix Display Panel Positioning
1. Find the Display panel:
   ```bash
   grep -n "Display\|display.*panel\|matrix.*display\|labels.*panel\|matrix.*sidebar\|matrix.*controls" renderer/index.html | head -15
   ```

2. **Fix the layout — ensure the panel fits within the page:**
   ```css
   .matrix-controls-panel,
   .matrix-display-panel {
     position: absolute;
     top: auto;
     right: 16px;        /* not too far right */
     max-width: 280px;
     width: 100%;
     box-sizing: border-box;
     overflow: visible;
     z-index: 10;
   }

   /* If it's inside a flex container, ensure it doesn't overflow */
   .matrix-page-layout {
     display: flex;
     gap: 16px;
     overflow: hidden;   /* prevent horizontal scroll */
   }
   .matrix-chart-area { flex: 1; min-width: 0; position: relative; }
   .matrix-sidebar { width: 260px; flex-shrink: 0; overflow-y: auto; max-height: 80vh; }
   ```

3. Ensure no horizontal scrollbar appears from the panel overflowing.

---

## Fix 2: Edit Initiative on Pill Click — Show Full Details

**Problem:** When clicking on an initiative pill/bar on the roadmap timeline, the edit view that opens doesn't show revenue, labels, owner, or comments. These fields only appear when using "Edit Row" from the three-dot menu. Both should show the same complete form.

**Approach:**
1. Find the pill/bar click handler:
   ```bash
   grep -n "pill.*click\|bar.*click\|initiative.*click\|onclick.*initiative\|openInitiative\|clickInitiative" renderer/index.html | head -15
   ```

2. **The pill click likely opens a different/simpler modal** than the three-dot "Edit Row" button. They should both call the SAME function:
   ```javascript
   // The pill click handler should call the same function as Edit Row:
   function onInitiativePillClick(rowId) {
     openEditRow(rowId); // or editProduct(rowId) — whatever the full editor is called
   }
   ```

3. If the pill opens a quick-preview panel (not a full modal), enhance it to include the missing fields, or add a "Full Details" button that opens the complete editor.

4. **Verify the full editor has all fields:** revenue, labels, owner, comments, created date, updated date, attachments, linked initiatives.

---

## Fix 3: Edit Product Page — Layout Fixes

**Problem:** Multiple layout issues:
1. Product description block sits to the right instead of below the "Product Description" title
2. Revenue defaults to USD only — need currency selector
3. Initiative owner needs a dropdown of all org users
4. Remove the recording/voice boxes next to the description
5. Product label description should sit below the title "Product Label"
6. Attachments can't be opened/downloaded when clicked

### Part A: Description Block Layout
1. Find the description rendering:
   ```bash
   grep -n "product.*description\|productDesc\|description.*textarea\|description.*block" renderer/index.html | head -15
   ```

2. Fix: ensure `display: block` or `flex-direction: column` so the textarea sits BELOW the label:
   ```css
   .form-group.description-group {
     display: flex;
     flex-direction: column;  /* stack vertically */
   }
   .form-group.description-group label {
     margin-bottom: 6px;
   }
   .form-group.description-group textarea {
     width: 100%;
     max-width: 100%;
   }
   ```

### Part B: Currency Selector for Revenue/ROI
1. Find the revenue input:
   ```bash
   grep -n "revenue\|Revenue\|ROI\|roi\|currency" renderer/index.html | head -15
   ```

2. Add a currency dropdown alongside the revenue input:
   ```html
   <div class="form-group">
     <label>Revenue / ROI</label>
     <div class="revenue-input-row" style="display:flex; gap:8px;">
       <select id="edit-currency" style="width:100px;" onchange="saveCurrencyPreference(this.value)">
         <option value="USD">$ USD</option>
         <option value="ZAR">R ZAR</option>
         <option value="EUR">€ EUR</option>
         <option value="GBP">£ GBP</option>
         <option value="KES">KSh KES</option>
         <option value="ZMW">ZK ZMW</option>
         <option value="MWK">MK MWK</option>
         <option value="NGN">₦ NGN</option>
         <option value="INR">₹ INR</option>
         <option value="AUD">A$ AUD</option>
         <option value="CAD">C$ CAD</option>
         <option value="JPY">¥ JPY</option>
         <option value="CNY">¥ CNY</option>
         <option value="BRL">R$ BRL</option>
       </select>
       <input type="number" id="edit-revenue" style="flex:1;" min="0" placeholder="Projected revenue">
     </div>
   </div>
   ```

3. Store the user's currency preference in `currentData.settings.currency` so it persists.

4. **Apply the same currency selector** to the ROI field and anywhere else currency amounts appear.

### Part C: Initiative Owner Dropdown
1. The owner field should list all org users:
   ```javascript
   function renderOwnerDropdown(currentOwner) {
     const users = getAllOrgUsers();
     return `
       <select id="edit-owner">
         <option value="">Unassigned</option>
         ${users.map(u => `
           <option value="${u.email}" ${currentOwner === u.email ? 'selected' : ''}>
             ${escapeHtml(u.name || u.email)}${u.email === getCurrentUserEmail() ? ' (You)' : ''}
           </option>
         `).join('')}
       </select>
     `;
   }
   ```

### Part D: Remove Recording Boxes
1. Find the recording/voice boxes:
   ```bash
   grep -n "record\|Record\|voice.*record\|recording\|mic\|microphone\|transcri" renderer/index.html | head -15
   ```
2. Remove the recording UI elements from the edit product page. Remove the HTML, any associated JS event handlers, and CSS for those boxes.

### Part E: Product Label Description Below Title
Same fix as Part A — ensure `flex-direction: column` on the label form group.

### Part F: Attachment Download Fix
1. Find attachment click handler:
   ```bash
   grep -n "attachment.*click\|openAttachment\|downloadAttachment\|attachment.*link\|attachment.*href" renderer/index.html | head -15
   ```

2. Fix: when clicking an attachment, trigger a download:
   ```javascript
   function openAttachment(attachment) {
     if (!attachment.storagePath && !attachment.url && !attachment.data) {
       showToast('No file attached', 'warning');
       return;
     }

     // If it's a Supabase Storage file
     if (attachment.storagePath) {
       downloadFromStorage(attachment.storagePath, attachment.fileName || attachment.name);
       return;
     }

     // If it's a base64 data URL
     if (attachment.data) {
       const a = document.createElement('a');
       a.href = attachment.data;
       a.download = attachment.fileName || attachment.name || 'attachment';
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       return;
     }

     // If it's a URL
     if (attachment.url) {
       window.open(attachment.url, '_blank');
     }
   }

   async function downloadFromStorage(path, fileName) {
     try {
       showLoadingOverlay('Downloading...');
       const { data, error } = await _supabase.storage
         .from('attachments')
         .download(path);
       if (error) throw error;

       const url = URL.createObjectURL(data);
       const a = document.createElement('a');
       a.href = url;
       a.download = fileName || 'attachment';
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       URL.revokeObjectURL(url);
       hideLoadingOverlay();
     } catch (err) {
       hideLoadingOverlay();
       showToast('Download failed: ' + err.message, 'error');
     }
   }
   ```

3. **Make each attachment item clickable** with a download icon:
   ```javascript
   function renderAttachment(att) {
     return `
       <div class="attachment-item" onclick="openAttachment(${JSON.stringify(att).replace(/"/g, '&quot;')})">
         <span class="attachment-icon">${getFileTypeIcon(att.fileType || att.fileName)}</span>
         <span class="attachment-name">${escapeHtml(att.fileName || att.name)}</span>
         <span class="attachment-size">${att.fileSize ? formatFileSize(att.fileSize) : ''}</span>
         <span class="attachment-download-icon">
           <svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" stroke-width="1.5" fill="none">
             <path d="M8 2v9M4 8l4 4 4-4"/><line x1="2" y1="14" x2="14" y2="14"/>
           </svg>
         </span>
       </div>
     `;
   }
   ```

---

## Fix 4: Checklist Completion — Confetti Animation + Sound

**Problem:** When all checklist items are marked "Yes" (or all applicable items are "Yes" with remaining as "N/A"), show a celebratory confetti animation with a congratulations popup and a jingle sound.

**Approach:**
1. Find the checklist item toggle/check handler:
   ```bash
   grep -n "checklistItem\|toggleChecklist\|checklist.*status\|checklist.*yes\|checklist.*complete\|updateChecklist" renderer/index.html | head -15
   ```

2. **After each checklist status change, check if all are complete:**
   ```javascript
   function onChecklistItemChanged() {
     const items = getCurrentChecklistItems();
     if (!items || items.length === 0) return;

     const applicableItems = items.filter(i => i.status !== 'na' && i.status !== 'not_applicable');
     const completedItems = applicableItems.filter(i => i.status === 'yes' || i.status === 'complete' || i.status === 'done');

     if (applicableItems.length > 0 && completedItems.length === applicableItems.length) {
       showChecklistCelebration();
     }
   }
   ```

3. **Create the confetti animation:**
   ```javascript
   function showChecklistCelebration() {
     // Create overlay
     const overlay = document.createElement('div');
     overlay.id = 'celebration-overlay';
     overlay.innerHTML = `
       <div class="celebration-content">
         <div class="confetti-container" id="confetti-container"></div>
         <div class="celebration-message">
           <svg viewBox="0 0 64 64" width="64" height="64" class="celebration-icon">
             <circle cx="32" cy="32" r="30" fill="none" stroke="#22c55e" stroke-width="3"/>
             <polyline points="20 32 28 40 44 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>
           <h2>Congratulations!</h2>
           <p>You've completed all checklist items. Ready to launch!</p>
           <button onclick="dismissCelebration()" class="btn-primary">Continue</button>
         </div>
       </div>
     `;
     document.body.appendChild(overlay);

     // Generate confetti pieces
     const confettiContainer = document.getElementById('confetti-container');
     const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
     for (let i = 0; i < 80; i++) {
       const piece = document.createElement('div');
       piece.className = 'confetti-piece';
       piece.style.cssText = `
         position: absolute;
         width: ${Math.random() * 10 + 5}px;
         height: ${Math.random() * 10 + 5}px;
         background: ${colors[Math.floor(Math.random() * colors.length)]};
         left: ${Math.random() * 100}%;
         top: -20px;
         border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
         animation: confettiFall ${Math.random() * 2 + 1.5}s ease-in ${Math.random() * 0.5}s forwards;
         transform: rotate(${Math.random() * 360}deg);
       `;
       confettiContainer.appendChild(piece);
     }

     // Play celebration sound
     playCelebrationSound();

     // Auto-dismiss after 5 seconds
     setTimeout(() => dismissCelebration(), 5000);
   }

   function dismissCelebration() {
     const overlay = document.getElementById('celebration-overlay');
     if (overlay) {
       overlay.style.opacity = '0';
       setTimeout(() => overlay.remove(), 300);
     }
   }

   function playCelebrationSound() {
     try {
       // Create a simple celebratory jingle using Web Audio API
       const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

       const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
       const durations = [0.15, 0.15, 0.15, 0.4];

       let startTime = audioCtx.currentTime;
       notes.forEach((freq, i) => {
         const osc = audioCtx.createOscillator();
         const gain = audioCtx.createGain();
         osc.type = 'sine';
         osc.frequency.value = freq;
         gain.gain.setValueAtTime(0.15, startTime);
         gain.gain.exponentialRampToValueAtTime(0.01, startTime + durations[i]);
         osc.connect(gain);
         gain.connect(audioCtx.destination);
         osc.start(startTime);
         osc.stop(startTime + durations[i]);
         startTime += durations[i] * 0.8;
       });
     } catch (e) {
       // Audio not supported — silent celebration
     }
   }
   ```

4. **CSS:**
   ```css
   #celebration-overlay {
     position: fixed; top: 0; left: 0; right: 0; bottom: 0;
     background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
     display: flex; align-items: center; justify-content: center;
     z-index: 99999;
     transition: opacity 0.3s;
   }
   .celebration-content { position: relative; text-align: center; }
   .confetti-container {
     position: fixed; top: 0; left: 0; right: 0; bottom: 0;
     pointer-events: none; overflow: hidden;
   }
   @keyframes confettiFall {
     0% { transform: translateY(0) rotate(0deg); opacity: 1; }
     100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
   }
   .celebration-message {
     background: var(--bg-card); border-radius: 16px;
     padding: 40px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
     position: relative; z-index: 1;
   }
   .celebration-message h2 {
     color: var(--text-primary); font-size: 28px; margin: 16px 0 8px;
   }
   .celebration-message p {
     color: var(--text-secondary); font-size: 15px; margin: 0 0 24px;
   }
   .celebration-icon { margin-bottom: 8px; }
   ```

---

## Fix 5: GTM Templates Button → Template Library

**Problem:** The "Go to Market Templates" button on the Checklist page should open the template library where users can browse, select, import, and save templates.

**Approach:**
1. Find the button:
   ```bash
   grep -n "Go to market\|GoToMarket\|GTM.*template\|g2m.*template\|checklist.*template.*btn" renderer/index.html | head -10
   ```

2. Wire it to open the template builder/library:
   ```javascript
   function openChecklistTemplates() {
     openTemplateBuilder('checklist');
   }
   ```

3. Ensure the button's `onclick` calls this function.

---

## Fix 6: Capacity IQ Template Icons

**Problem:** Templates on the Capacity IQ page don't have icons above their titles. Every template should have a relevant SVG icon.

**Approach:**
1. This was addressed in v9 Fix 1 but may not be fully applied. Use the `getTemplateIcon(template)` function created there.
2. Find the CIQ template card rendering and ensure every card includes the icon:
   ```javascript
   // In the template card HTML:
   `<div class="template-card-icon">${getTemplateIcon(template)}</div>`
   ```
3. Verify ALL templates have icons — not just some.

---

## Fix 7: Drag and Drop — Products Between Sections

**Problem:** Dragging a product from one section to another doesn't work properly. Other products in the target section get displaced or reordered. The dragged product should insert exactly where dropped without disturbing other products.

**Approach:**
1. Find the drag-and-drop implementation:
   ```bash
   grep -n "dragstart\|dragover\|dragend\|ondrag\|draggable\|drop.*handler\|handleDrop\|onDrop" renderer/index.html | head -30
   ```

2. **Fix the drop logic:**
   ```javascript
   function handleProductDrop(e, targetSectionId) {
     e.preventDefault();
     const draggedRowId = e.dataTransfer.getData('text/plain');
     if (!draggedRowId) return;

     // Find the dragged row and its source section
     let draggedRow = null;
     let sourceSection = null;

     currentData.sections.forEach(section => {
       const rowIndex = (section.rows || []).findIndex(r => r.id === draggedRowId);
       if (rowIndex >= 0) {
         draggedRow = section.rows[rowIndex];
         sourceSection = section;
         // Remove from source
         section.rows.splice(rowIndex, 1);
       }
     });

     if (!draggedRow) return;

     // Find target section
     const targetSection = currentData.sections.find(s => s.id === targetSectionId);
     if (!targetSection) return;
     if (!targetSection.rows) targetSection.rows = [];

     // Determine drop position within the target section
     const dropTarget = e.target.closest('[data-row-id]');
     if (dropTarget) {
       // Insert before or after the drop target
       const targetRowId = dropTarget.dataset.rowId;
       const targetIndex = targetSection.rows.findIndex(r => r.id === targetRowId);

       // Determine if dropping above or below based on mouse position
       const rect = dropTarget.getBoundingClientRect();
       const midY = rect.top + rect.height / 2;
       const insertIndex = e.clientY < midY ? targetIndex : targetIndex + 1;

       targetSection.rows.splice(insertIndex, 0, draggedRow);
     } else {
       // No specific target row — append to end of section
       targetSection.rows.push(draggedRow);
     }

     // Log the move
     logProductHistory(draggedRow.id, {
       type: 'lifecycle',
       title: `Moved from "${sourceSection.name}" to "${targetSection.name}"`,
       autoGenerated: true,
     });

     saveData();
     renderRoadmap();
   }
   ```

3. **Add drop indicators** to show where the item will land:
   ```javascript
   function handleDragOver(e) {
     e.preventDefault();
     e.dataTransfer.dropEffect = 'move';

     // Show drop indicator
     const target = e.target.closest('[data-row-id]');
     if (target) {
       // Remove all existing indicators
       document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

       // Add indicator above or below
       const rect = target.getBoundingClientRect();
       const midY = rect.top + rect.height / 2;
       const indicator = document.createElement('div');
       indicator.className = 'drop-indicator';
       indicator.style.cssText = 'height:2px; background:var(--accent-primary); border-radius:1px;';

       if (e.clientY < midY) {
         target.parentNode.insertBefore(indicator, target);
       } else {
         target.parentNode.insertBefore(indicator, target.nextSibling);
       }
     }
   }
   ```

4. **Ensure `draggable="true"`** is set on each product row and the correct events are bound.

---

## Fix 8: Kanban View — Show Initiatives Not Products + Hide Today Line

**Problem:**
1. Kanban view currently shows products (rows). It should show initiatives instead. When you click an initiative card, you can see which product it belongs to.
2. The red "today" line should NOT appear in Kanban view — only in Timeline view.

### Part A: Kanban Shows Initiatives
1. Find the Kanban rendering:
   ```bash
   grep -n "renderKanban\|kanban.*render\|kanban.*card\|kanban.*column" renderer/index.html | head -20
   ```

2. **Change the data source:** Instead of iterating `sections[].rows[]` directly, iterate the initiatives within each row:
   ```javascript
   function getKanbanItems() {
     const items = [];
     (currentData.sections || []).forEach(section => {
       (section.rows || []).forEach(row => {
         // If the row has sub-initiatives, use those
         if (row.initiatives && row.initiatives.length > 0) {
           row.initiatives.forEach(initiative => {
             items.push({
               ...initiative,
               parentProductName: row.name,
               parentProductId: row.id,
               sectionName: section.name,
               sectionColor: section.color,
             });
           });
         } else {
           // If no sub-initiatives, treat the row itself as an initiative
           items.push({
             ...row,
             parentProductName: row.name,
             parentProductId: row.id,
             sectionName: section.name,
             sectionColor: section.color,
             isProduct: true,
           });
         }
       });
     });
     return items;
   }
   ```

3. **On each Kanban card, show the parent product:**
   ```javascript
   function renderKanbanCard(item) {
     return `
       <div class="kanban-card" draggable="true" data-id="${item.id}">
         <div class="kanban-card-header">
           <span class="kanban-card-section" style="color:${item.sectionColor}">${escapeHtml(item.sectionName)}</span>
         </div>
         <h4 class="kanban-card-title">${escapeHtml(item.name)}</h4>
         ${!item.isProduct ? `<p class="kanban-card-product">Product: ${escapeHtml(item.parentProductName)}</p>` : ''}
         <div class="kanban-card-meta">
           ${item.priority ? `<span class="priority-badge priority-${item.priority.toLowerCase()}">${item.priority}</span>` : ''}
           ${item.owner ? `<span class="owner-badge">${escapeHtml(item.owner)}</span>` : ''}
         </div>
       </div>
     `;
   }
   ```

### Part B: Hide Today Line in Kanban
1. In the view-switching logic, hide/show the today line:
   ```javascript
   function switchRoadmapView(view) {
     // ... existing view switching ...

     const todayLine = document.getElementById('today-line');
     if (todayLine) {
       todayLine.style.display = (view === 'timeline' || view === 'Timeline') ? 'block' : 'none';
     }
   }
   ```

---

## Fix 9: Sort — Keep Section Titles Visible

**Problem:** When sorting the roadmap by priority or other fields, all section titles disappear. They should stay visible.

**Approach:**
1. Find the sort function:
   ```bash
   grep -n "sortRoadmap\|sortRows\|sort.*priority\|sort.*roadmap\|handleSort\|applySort" renderer/index.html | head -15
   ```

2. **The bug:** Sorting likely flattens all rows into one list, losing the section grouping. Fix by sorting WITHIN each section:
   ```javascript
   function sortRoadmap(sortBy) {
     if (!currentData.sections) return;

     const sortFn = getSortFunction(sortBy);

     // Sort rows WITHIN each section — don't flatten
     currentData.sections.forEach(section => {
       if (section.rows) {
         section.rows.sort(sortFn);
       }
     });

     saveData();
     renderRoadmap(); // sections stay, rows reordered within them
   }

   function getSortFunction(sortBy) {
     switch (sortBy) {
       case 'priority':
         const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
         return (a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9);
       case 'name':
         return (a, b) => (a.name || '').localeCompare(b.name || '');
       case 'status':
         return (a, b) => (a.status || '').localeCompare(b.status || '');
       case 'owner':
         return (a, b) => (a.owner || '').localeCompare(b.owner || '');
       case 'revenue':
         return (a, b) => (b.revenueProjected || 0) - (a.revenueProjected || 0);
       default:
         return () => 0;
     }
   }
   ```

---

## Fix 10: Roadmap Merge Functionality

**Problem:** No option to merge two roadmaps. Should appear in the Roadmap dropdown when a secondary roadmap exists. Two options: Stack (one on top of the other) or Merge (combine into one).

**Approach:**
1. Find roadmap management:
   ```bash
   grep -n "roadmap.*dropdown\|roadmap.*menu\|addRoadmap\|switchRoadmap\|roadmapList\|currentRoadmap" renderer/index.html | head -20
   ```

2. **Add "Merge Roadmaps" option** to the Roadmap dropdown (only visible when 2+ roadmaps exist):
   ```javascript
   function renderRoadmapDropdown() {
     const roadmaps = currentData.roadmaps || [{ id: 'default', name: 'My Roadmap' }];
     if (roadmaps.length < 2) return ''; // no merge option for single roadmap

     return `
       <div class="dropdown-divider"></div>
       <button onclick="openMergeRoadmaps()">Merge Roadmaps</button>
     `;
   }
   ```

3. **Merge modal:**
   ```javascript
   function openMergeRoadmaps() {
     const roadmaps = currentData.roadmaps || [];
     const modal = createModal('Merge Roadmaps');
     modal.innerHTML = `
       <div class="merge-form" style="max-width:480px; margin:0 auto;">
         <div class="form-group">
           <label>Source Roadmap (merge FROM)</label>
           <select id="merge-source">
             ${roadmaps.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
           </select>
         </div>
         <div class="form-group">
           <label>Target Roadmap (merge INTO)</label>
           <select id="merge-target">
             ${roadmaps.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
           </select>
         </div>
         <div class="form-group">
           <label>Merge Type</label>
           <div class="merge-options">
             <label class="radio-option">
               <input type="radio" name="merge-type" value="stack" checked>
               <div>
                 <strong>Stack</strong>
                 <p>Place one roadmap on top of the other. All sections kept separate.</p>
               </div>
             </label>
             <label class="radio-option">
               <input type="radio" name="merge-type" value="merge">
               <div>
                 <strong>Merge</strong>
                 <p>Combine sections with matching names. Products can be rearranged after.</p>
               </div>
             </label>
           </div>
         </div>
         <div class="form-actions">
           <button onclick="executeMerge()" class="btn-primary">Merge</button>
           <button onclick="closeModal()" class="btn-secondary">Cancel</button>
         </div>
       </div>
     `;
     showModal(modal);
   }

   function executeMerge() {
     const sourceId = document.getElementById('merge-source').value;
     const targetId = document.getElementById('merge-target').value;
     const mergeType = document.querySelector('input[name="merge-type"]:checked').value;

     if (sourceId === targetId) {
       showToast('Source and target must be different', 'warning');
       return;
     }

     const source = getRoadmapById(sourceId);
     const target = getRoadmapById(targetId);

     if (mergeType === 'stack') {
       // Append all source sections to target
       target.sections = [...(target.sections || []), ...(source.sections || [])];
     } else {
       // Merge matching sections, add non-matching as new
       (source.sections || []).forEach(srcSection => {
         const matchingTarget = (target.sections || []).find(
           ts => ts.name.toLowerCase() === srcSection.name.toLowerCase()
         );
         if (matchingTarget) {
           matchingTarget.rows = [...(matchingTarget.rows || []), ...(srcSection.rows || [])];
         } else {
           target.sections.push({ ...srcSection, id: generateId() });
         }
       });
     }

     // Update collaborators
     if (!target.collaborators) target.collaborators = [];
     if (source.ownerEmail && !target.collaborators.find(c => c.email === source.ownerEmail)) {
       target.collaborators.push({ email: source.ownerEmail, name: source.ownerName, role: 'contributor' });
     }

     saveData();
     closeModal();
     renderRoadmap();
     showToast(`Roadmaps ${mergeType === 'stack' ? 'stacked' : 'merged'} successfully`, 'success');
   }
   ```

---

## Fix 11: Follow Product + Follow Initiative + Follow Section

**Problem:** Need "Follow Product", "Follow Initiative", and follow options on sections in the three-dot dropdown menus. Following means getting alerts when anything changes on that entity.

**Approach:**
1. The watch/follow system was built in v11 for initiatives. Extend it to products and sections:

   ```javascript
   // Generic follow/unfollow for any entity type
   function toggleFollow(entityId, entityType) {
     const entity = entityType === 'section'
       ? currentData.sections.find(s => s.id === entityId)
       : findRowById(entityId);

     if (!entity) return;
     if (!entity.followers) entity.followers = [];

     const userId = getCurrentUserId();
     const index = entity.followers.findIndex(f => f.userId === userId);

     if (index >= 0) {
       entity.followers.splice(index, 1);
       showToast(`Stopped following this ${entityType}`, 'info');
     } else {
       entity.followers.push({
         userId: userId,
         email: getCurrentUserEmail(),
         name: getCurrentUserName(),
         followedAt: new Date().toISOString(),
       });
       showToast(`Following this ${entityType} — you'll get alerts on changes`, 'success');
     }

     saveData();
   }

   function isFollowing(entityId) {
     const entity = findRowById(entityId) || currentData.sections?.find(s => s.id === entityId);
     return entity?.followers?.some(f => f.userId === getCurrentUserId()) || false;
   }
   ```

2. **Add to the three-dot dropdowns:**
   - Product three-dot menu: add "Follow Product"
   - Initiative three-dot menu / info button: add "Follow Initiative"
   - Section menu: add "Follow Section"

3. **Notify followers** when changes occur — hook into existing edit/save/status change functions.

---

## Fix 12: Dynamic Range Filter — Adjust Timeline + Quarters

**Problem:** When adjusting the date range filter, the quarter headers stay but the products/initiatives disappear. The range should dynamically adjust BOTH the timeline columns (quarters/months) AND filter the products to only show relevant ones.

**Approach:**
1. Find the range filter:
   ```bash
   grep -n "range\|Range\|dateRange\|filterRange\|RANGE\|adjustRange\|setRange\|this.*year\|financial.*year" renderer/index.html | head -20
   ```

2. **Fix the range to adjust the timeline columns too:**
   ```javascript
   function applyRangeFilter(rangeType) {
     const now = new Date();
     const fyStartMonth = currentData?.settings?.fyStartMonth || 1;
     let startDate, endDate;

     switch (rangeType) {
       case 'this-quarter':
         const q = Math.floor(now.getMonth() / 3);
         startDate = new Date(now.getFullYear(), q * 3, 1);
         endDate = new Date(now.getFullYear(), (q + 1) * 3, 0);
         break;
       case 'this-fy':
         const fyYear = now.getMonth() + 1 >= fyStartMonth ? now.getFullYear() : now.getFullYear() - 1;
         startDate = new Date(fyYear, fyStartMonth - 1, 1);
         endDate = new Date(fyYear + 1, fyStartMonth - 1, 0);
         break;
       case 'this-year':
         startDate = new Date(now.getFullYear(), 0, 1);
         endDate = new Date(now.getFullYear(), 11, 31);
         break;
       case 'all':
         startDate = null;
         endDate = null;
         break;
       default:
         // Custom range from date inputs
         startDate = document.getElementById('range-start')?.value ? new Date(document.getElementById('range-start').value) : null;
         endDate = document.getElementById('range-end')?.value ? new Date(document.getElementById('range-end').value) : null;
     }

     // Store the active range
     currentData._activeRange = { startDate, endDate, rangeType };

     // Re-render the ENTIRE timeline with the new range
     renderRoadmapTimeline(startDate, endDate);
   }

   function renderRoadmapTimeline(rangeStart, rangeEnd) {
     // 1. Generate quarter/month columns based on the range
     const columns = generateTimelineColumns(rangeStart, rangeEnd);

     // 2. Filter products/initiatives to only those overlapping the range
     const filteredSections = filterSectionsToRange(rangeStart, rangeEnd);

     // 3. Render with the filtered data and adjusted columns
     renderTimelineView(columns, filteredSections);

     // 4. Reposition today line
     positionTodayLine();
   }

   function filterSectionsToRange(rangeStart, rangeEnd) {
     if (!rangeStart && !rangeEnd) return currentData.sections; // show all

     return currentData.sections.map(section => ({
       ...section,
       rows: (section.rows || []).filter(row => {
         // Show row if its date range overlaps with the filter range
         const rowStart = row.dateRange?.start ? new Date(row.dateRange.start) : null;
         const rowEnd = row.dateRange?.end ? new Date(row.dateRange.end) : null;

         if (!rowStart && !rowEnd) return true; // no dates = always show
         if (rangeStart && rowEnd && rowEnd < rangeStart) return false; // ends before range
         if (rangeEnd && rowStart && rowStart > rangeEnd) return false; // starts after range
         return true;
       }),
     })).filter(section => section.rows.length > 0); // hide empty sections
   }
   ```

---

## Fix 13: Tooltip Refresh — Entire Application

**Problem:** Many new buttons and features don't have tooltips. Need a comprehensive pass to add `title="..."` attributes to all interactive elements.

**Approach:**
1. **Find all buttons and interactive elements WITHOUT titles:**
   ```bash
   grep -n "<button\|onclick=" renderer/index.html | grep -v "title=" | head -50
   ```

2. **Systematically add tooltips to:**
   - All top nav buttons
   - All sidebar nav items
   - All toolbar buttons (Plans, Roadmap, Checklist, etc.)
   - All icon-only buttons (three-dot menus, edit, delete, close)
   - All filter/sort dropdowns
   - View toggle buttons (Timeline, Kanban, List, Cards)
   - Action buttons (Share, Follow, Watch, Archive, Duplicate)
   - The help widget FAB
   - The notification bell
   - The user avatar
   - All form labels with `?` tooltip icons

3. **Use consistent tooltip text patterns:**
   - Action buttons: verb + object ("Edit product", "Delete task", "Share plan")
   - Toggle buttons: state + action ("Switch to dark mode", "Toggle sidebar")
   - Navigation: destination ("Go to Dashboard", "View Reports")
   - Status indicators: what it means ("Synced just now", "3 tasks overdue")

4. **For complex tooltips (more than a few words), use the `data-tooltip` CSS pattern** from v12 Fix 2 instead of the native `title` attribute.

5. **Run a final audit:**
   ```bash
   # Count buttons without titles
   grep -c "<button" renderer/index.html
   grep -c 'title="' renderer/index.html
   # Second number should be close to or greater than the first
   ```

---

## Post-Fix Checklist

1. **Matrix:** Items plot as draggable dots. Select All works. Display panel fits on screen.
2. **Initiative pill click:** Opens full editor with revenue, labels, owner, comments.
3. **Edit product layout:** Description below title. Currency selector on revenue/ROI. Owner dropdown with org users. Recording boxes removed. Label description below title.
4. **Attachments:** Clicking downloads the file.
5. **Checklist celebration:** Confetti animation + jingle when all items complete.
6. **GTM Templates button:** Opens template library.
7. **CIQ template icons:** All templates have SVG icons.
8. **Drag and drop:** Products move between sections cleanly, no displacement of other items.
9. **Kanban:** Shows initiatives (not products). Parent product name on each card. No today line.
10. **Sort:** Section titles preserved when sorting.
11. **Merge roadmaps:** Stack or merge option in Roadmap dropdown.
12. **Follow:** Product, initiative, and section follow options in three-dot menus.
13. **Range filter:** Adjusts timeline columns AND filters products/initiatives.
14. **Tooltips:** Comprehensive coverage across the entire app.
15. **Dark mode:** All new elements use CSS variables.
16. **Emoji:** Zero.
17. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
18. **Bump version** in `package.json`
19. **Rebuild web:** `cd web && npm run build`
20. **Commit:** `git add -A && git commit -m "vX.Y.Z: v14 — matrix plotting, confetti, drag-drop, kanban initiatives, merge roadmaps, tooltips refresh"`
21. **Update FIX_LOG_V14.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Document decisions in `FIX_LOG_V14.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix.** Check syntax, verify both light and dark mode.
4. **Preserve existing patterns.** Match the codebase style.
5. **Both modes.** CSS variables everywhere.
6. **Single-file SPA.** All UI changes in `renderer/index.html`.
7. **Zero emoji.** SVG icons only.
8. **Fix 1 (matrix) is the most complex visually.** The dots must be positioned correctly using percentage-based coordinates. Make them draggable to set scores. Ensure the chart container has `position: relative`.
9. **Fix 4 (confetti) uses Web Audio API** for the jingle — wrap in try/catch since some browsers block autoplay.
10. **Fix 7 (drag and drop) must not displace other items.** The key is: remove from source → calculate insert position in target → splice at exact index.
11. **Fix 13 (tooltips) is a sweep.** Don't just add a few — grep the entire file for buttons without titles and add them systematically.
