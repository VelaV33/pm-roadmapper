# Roadmap OS — Autonomous Fix Queue v4

**Instructions for Claude Code:** Work through every fix below sequentially. For each fix: investigate → implement → self-review → test → log in `FIX_LOG_V4.md` → move to next. Do NOT ask questions. Make your best judgment and document decisions. Do not stop between fixes.

**Codebase context:**
- Main renderer: `renderer/index.html` (single-file SPA — all UI, logic, styles)
- Electron main process: `main.js`
- Web shim: `web/shim/electronAPI.js`
- Supabase edge functions: `supabase/functions/`
- Data stored as one JSONB blob per user in `roadmap_data` table
- Navigation: `showPage('pageId')` pattern
- Dark mode: CSS variables + class toggle
- ZERO emoji policy — SVG icons only (stroke-based, `currentColor`, matching sidebar style)
- All new elements MUST support both light and dark mode with proper contrast
- The web app runs the same renderer via a shim that re-implements 24 IPC methods with browser APIs
- Web app is served from Vercel at `app.pmroadmapper.com`

**Before starting:**
1. `grep -n "importJSON\|importRoadmap\|uploadJSON\|restoreBackup\|fileReader\|\.json.*import" renderer/index.html | head -30`
2. `grep -n "templateLibrary\|template-library\|templatePage\|templateList\|GoToMarket.*Template\|g2m.*template" renderer/index.html | head -30`
3. `grep -n "capacity.*template\|CapacityIQ.*template" renderer/index.html | head -20`
4. `grep -n "addDocument\|uploadDocument\|attachDocument\|document.*upload\|artefact.*add" renderer/index.html | head -20`
5. `grep -n "history\.push\|history\.replace\|pushState\|replaceState\|popstate\|hashchange\|onpopstate" renderer/index.html | head -20`
6. `grep -n "showPage\|function show(" renderer/index.html | head -30`
7. Log all findings in `FIX_LOG_V4.md`

---

## Fix 1: Import Roadmap Not Working on Web App

**Problem:** Importing a JSON roadmap on the web app does nothing — no response, no error, no data loaded. This also affects any other import format (if supported).

**Approach:**

### Step 1: Diagnose the web-specific failure
1. Find the import handler:
   ```bash
   grep -n "importJSON\|importRoadmap\|uploadJSON\|restoreBackup\|loadBackup\|openFile.*json" renderer/index.html | head -30
   ```

2. Check if the import uses `window.electronAPI.openFile()` or a direct file input:
   ```bash
   grep -n "electronAPI\.openFile\|electronAPI\.pickFile\|electronAPI\.readFile" renderer/index.html | head -10
   ```

3. **Common web failure causes:**
   - **The handler calls `window.electronAPI.openFile()` which may not return the file content correctly in the web shim.** Check `web/shim/electronAPI.js` for the `openFile` implementation:
     ```bash
     grep -n "openFile\|pickFile\|readFile" web/shim/electronAPI.js | head -15
     ```
   - **The shim might return a different data format** (e.g., returning a File object instead of the file content string, or returning a path instead of content)
   - **The handler might not await the async result** — `FileReader` is async and the shim might not handle this correctly
   - **The parsed JSON might not be written to the correct data key** — check what key the import writes to and whether `syncRoadmapData()` is called after

4. **Fix the web shim if needed.** The web file open flow should be:
   ```javascript
   // In web/shim/electronAPI.js
   openFile: async function(options) {
     return new Promise((resolve) => {
       const input = document.createElement('input');
       input.type = 'file';
       input.accept = options?.filters?.[0]?.extensions?.map(e => '.' + e).join(',') || '.json';
       input.onchange = async (e) => {
         const file = e.target.files[0];
         if (!file) { resolve(null); return; }
         const text = await file.text();
         resolve({ content: text, filePath: file.name, canceled: false });
       };
       input.click();
     });
   }
   ```
   Make sure the return shape matches what the renderer expects.

5. **Fix the renderer import handler** to work with both Electron and web:
   ```javascript
   async function importRoadmapJSON() {
     try {
       showLoadingOverlay('Importing roadmap...');

       let fileContent;

       if (window.electronAPI && window.electronAPI.openFile) {
         const result = await window.electronAPI.openFile({
           filters: [{ name: 'JSON', extensions: ['json'] }]
         });
         if (!result || result.canceled) {
           hideLoadingOverlay();
           return;
         }
         fileContent = result.content;
       } else {
         // Fallback: direct file input (web)
         fileContent = await pickFileContent('.json');
       }

       if (!fileContent) {
         hideLoadingOverlay();
         return;
       }

       const data = JSON.parse(fileContent);

       // Validate
       if (!data || typeof data !== 'object') {
         throw new Error('Invalid roadmap file format');
       }

       // Apply the imported data
       // Match the exact pattern used elsewhere in the codebase for loading data
       // e.g.: currentData = data; or Object.assign(currentData, data);
       // IMPORTANT: check how the rest of the app loads data and mirror that pattern exactly

       // Sync to server
       await syncRoadmapData();

       // Re-render
       renderRoadmap();

       hideLoadingOverlay();
       showToast('Roadmap imported successfully', 'success');
     } catch (err) {
       hideLoadingOverlay();
       showToast('Import failed: ' + err.message, 'error');
       console.error('Import error:', err);
     }
   }

   // Helper for web file picking
   function pickFileContent(accept) {
     return new Promise((resolve) => {
       const input = document.createElement('input');
       input.type = 'file';
       input.accept = accept;
       input.onchange = async (e) => {
         const file = e.target.files[0];
         if (!file) { resolve(null); return; }
         resolve(await file.text());
       };
       // Handle cancel (user closes file picker without selecting)
       input.addEventListener('cancel', () => resolve(null));
       input.click();
     });
   }
   ```

6. **If a loading overlay already exists** (from v3 Fix 1), use it. If not, create one.

7. **Test by searching for any error paths** that might silently swallow failures:
   ```bash
   grep -n "catch\|\.catch\|onerror" renderer/index.html | grep -i "import\|upload\|file\|json" | head -10
   ```

---

## Fix 2: Templates Page Templates Not Showing in Capacity IQ Templates

**Problem:** The templates created/listed on the main Templates page (left nav) are not appearing on the Capacity IQ templates sub-page. These should be the same template data source.

**Approach:**
1. Find both template rendering locations:
   ```bash
   # Main templates page
   grep -n "template-page\|templates-page\|renderTemplates\|showTemplates\|loadTemplates" renderer/index.html | head -20

   # Capacity IQ templates
   grep -n "capacity.*template\|capacityTemplate\|ciq.*template" renderer/index.html | head -20
   ```

2. **Identify the data source mismatch:**
   - The main Templates page likely reads from `currentData.templateLibrary` or a `templates` array
   - The Capacity IQ templates page might read from a different array or have its own hardcoded list
   - They MUST read from the same data source

3. **Fix: Unify the data source.**
   ```javascript
   // Single source of truth for all templates
   function getAllTemplates() {
     const templates = [];

     // Platform defaults (built-in)
     templates.push(...getDefaultTemplates());

     // User-created templates
     if (currentData.templateLibrary) {
       templates.push(...currentData.templateLibrary);
     }

     // Deduplicate by ID
     const seen = new Set();
     return templates.filter(t => {
       if (seen.has(t.id)) return false;
       seen.add(t.id);
       return true;
     });
   }
   ```

4. **Update the Capacity IQ templates page** to call `getAllTemplates()` instead of its own local template list.

5. **Ensure rendering is called** when the Capacity IQ templates tab is opened:
   ```javascript
   // In the showPage or tab-switch handler for Capacity IQ templates
   function renderCapacityIQTemplates() {
     const templates = getAllTemplates();
     const container = document.getElementById('ciq-templates-container');
     container.innerHTML = '';

     templates.forEach(template => {
       // Render template card — match the style of the main templates page
       const card = createTemplateCard(template);
       container.appendChild(card);
     });
   }
   ```

6. **Verify both pages show identical template lists** after the fix.

---

## Fix 3: Template Builder — Complete Overhaul

**Problem:** The "Go-to-Market Templates" button needs to become a full template builder system. This is a major feature.

### Part A: Rename and Restructure

1. Find the GoToMarket Templates button:
   ```bash
   grep -n "GoToMarket.*Template\|Go.to.Market.*Template\|g2m.*template\|gtm.*template" renderer/index.html | head -20
   ```

2. **Rename:** Change all visible labels from "Go-to-Market Templates" or "GTM Templates" to just **"Templates"**.

3. **When "Templates" is clicked**, instead of showing a narrow list, show a **Template Browser** modal/page:

### Part B: Template Browser

The Template Browser is a modal or full page that shows ALL templates and lets users build custom templates by selecting tasks from them.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Templates                                    [Search]  │
│                                                         │
│  ┌──────────────┐  ┌──────────────────────────────────┐ │
│  │ Template List │  │ Template Detail                  │ │
│  │              │  │                                  │ │
│  │ ▸ GoToMarket │  │ GoToMarket Product Launch        │ │
│  │   Product    │  │ ──────────────────────           │ │
│  │   Launch     │  │                                  │ │
│  │              │  │ Phase 1: Pre-Launch (Wk 1-4)     │ │
│  │ ▸ Agile      │  │ ☐ Define target market           │ │
│  │   Sprint     │  │ ☐ Competitive analysis           │ │
│  │              │  │ ☑ Create positioning doc          │ │
│  │ ▸ Security   │  │ ☐ Set pricing strategy           │ │
│  │   Audit      │  │                                  │ │
│  │              │  │ Phase 2: Development (Wk 5-12)   │ │
│  │ ▸ Frontend   │  │ ☐ API design review              │ │
│  │   Dev        │  │ ☐ Frontend build                 │ │
│  │              │  │ ...                              │ │
│  │ ▸ Backend    │  │                                  │ │
│  │   Dev        │  │ [Selected: 3 tasks]              │ │
│  │              │  │                                  │ │
│  │ ▸ Marketing  │  │ ┌─────────────────────────────┐  │ │
│  │   Campaign   │  │ │ Save as New Template        │  │ │
│  │              │  │ │ Template name: ___________  │  │ │
│  │ ▸ My Custom  │  │ │         [Save]  [Import]   │  │ │
│  │   Templates  │  │ └─────────────────────────────┘  │ │
│  └──────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Functionality:**
1. **Left panel:** Lists all templates (platform + user-created) with search/filter
2. **Right panel:** When a template is selected, shows ALL its tasks organized by phase
3. **Checkboxes on each task:** User checks the tasks they want to include
4. **"Select All" / "Deselect All"** buttons per phase and globally
5. **Cross-template selection:** User can click a different template in the left panel, check tasks from it too. Selected tasks accumulate across templates.
6. **Selected tasks counter:** Shows "X tasks selected" at the bottom
7. **Two actions at the bottom:**
   - **"Import Selected"** — pulls the checked tasks back into the CALLING page (Plans, To-Do, Checklist, etc.)
   - **"Save as New Template"** — prompts for a template name, saves the selected tasks as a new custom template in `currentData.templateLibrary`

**Implementation:**
```javascript
// State for the template builder
let templateBuilderState = {
  selectedTasks: [],        // Array of task objects checked by the user
  sourceContext: null,      // Where to import back to: 'plans', 'todo', 'checklist', 'capacityiq'
  activePlanId: null,       // If importing to a specific plan
};

function openTemplateBuilder(sourceContext, options) {
  templateBuilderState.selectedTasks = [];
  templateBuilderState.sourceContext = sourceContext;
  templateBuilderState.activePlanId = options?.planId || null;

  const templates = getAllTemplates();
  renderTemplateBuilderList(templates);

  // Show the first template by default
  if (templates.length > 0) {
    renderTemplateBuilderDetail(templates[0]);
  }

  document.getElementById('template-builder-modal').style.display = 'flex';
}

function toggleTaskSelection(task, checked) {
  if (checked) {
    templateBuilderState.selectedTasks.push(task);
  } else {
    templateBuilderState.selectedTasks = templateBuilderState.selectedTasks.filter(
      t => t.id !== task.id
    );
  }
  updateSelectedCount();
}

function importSelectedTasks() {
  const tasks = templateBuilderState.selectedTasks;
  if (tasks.length === 0) {
    showToast('No tasks selected', 'warning');
    return;
  }

  switch (templateBuilderState.sourceContext) {
    case 'plans':
      importTasksIntoPlan(tasks, templateBuilderState.activePlanId);
      break;
    case 'todo':
      importTasksIntoTodo(tasks);
      break;
    case 'checklist':
      importTasksIntoChecklist(tasks);
      break;
    case 'capacityiq':
      importTasksIntoCapacityIQ(tasks);
      break;
  }

  closeTemplateBuilder();
  showToast(`${tasks.length} tasks imported`, 'success');
}

function saveAsNewTemplate() {
  const tasks = templateBuilderState.selectedTasks;
  if (tasks.length === 0) {
    showToast('No tasks selected', 'warning');
    return;
  }

  const name = document.getElementById('new-template-name').value.trim();
  if (!name) {
    showToast('Please enter a template name', 'warning');
    return;
  }

  if (!currentData.templateLibrary) currentData.templateLibrary = [];

  currentData.templateLibrary.push({
    id: generateId(),
    name: name,
    type: 'custom',
    tasks: tasks.map(t => ({
      ...t,
      id: generateId(), // New IDs for the template copy
    })),
    createdAt: new Date().toISOString(),
    taskCount: tasks.length,
  });

  saveData();
  closeTemplateBuilder();
  showToast(`Template "${name}" saved with ${tasks.length} tasks`, 'success');
}
```

### Part C: Task Library Integration in Template Builder

In addition to browsing templates, the Template Builder should have a **"Task Library" tab** in the left panel:

- Shows all tasks from `currentData.taskLibrary`
- Searchable by name, category, source
- Same checkbox selection behavior
- Users can pick individual tasks from the Task Library alongside template tasks
- All selected tasks (from templates + task library) are combined when importing or saving

### Part D: Template Builder on the Main Templates Page

On the main Templates page (left nav), add a **"Create Custom Template"** button that opens the Template Builder in "save" mode:
- User browses templates and task library
- Checks tasks
- Saves as a new custom template
- The new template appears in the Templates page list

---

## Fix 4: Artefacts Page — Document Upload Fix

**Problem:** The "Add Document" feature only collects metadata (name, description) but doesn't let you actually attach a file from your computer.

**Approach:**
1. Find the add document handler:
   ```bash
   grep -n "addDocument\|uploadDocument\|newDocument\|document.*modal\|artefact.*add\|artifact.*add" renderer/index.html | head -20
   ```

2. **Fix the form to include actual file upload:**
   ```html
   <div class="add-document-form">
     <div class="form-group">
       <label>Document Name</label>
       <input type="text" id="doc-name" placeholder="e.g., Product Requirements Doc">
     </div>

     <div class="form-group">
       <label>Description (optional)</label>
       <textarea id="doc-description" placeholder="Brief description..."></textarea>
     </div>

     <div class="form-group">
       <label>Attach File</label>
       <div class="file-upload-zone" id="doc-upload-zone"
            ondragover="event.preventDefault(); this.classList.add('drag-over')"
            ondragleave="this.classList.remove('drag-over')"
            ondrop="handleDocDrop(event)">
         <div class="upload-icon">
           <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor"
                stroke-width="1.5" fill="none">
             <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
             <polyline points="17 8 12 3 7 8"/>
             <line x1="12" y1="3" x2="12" y2="15"/>
           </svg>
         </div>
         <p>Drag & drop a file here, or <button onclick="triggerDocFilePicker()" class="link-btn">browse</button></p>
         <p class="upload-hint">Supports all file types: PDF, DOCX, XLSX, PPTX, images, ZIP, and more</p>
         <input type="file" id="doc-file-input" style="display:none"
                onchange="handleDocFileSelect(event)"
                accept="*/*">
       </div>
       <div id="doc-file-preview" style="display:none;">
         <span id="doc-file-name"></span>
         <span id="doc-file-size"></span>
         <button onclick="removeDocFile()" class="btn-sm">Remove</button>
       </div>
     </div>

     <div class="form-group">
       <label>Folder (optional)</label>
       <select id="doc-folder">
         <option value="">No folder</option>
         <!-- Populated dynamically from existing folders -->
       </select>
     </div>

     <div class="form-group">
       <label>Tags (optional)</label>
       <input type="text" id="doc-tags" placeholder="Comma-separated tags">
     </div>

     <div class="form-group">
       <label>Link to Initiative (optional)</label>
       <select id="doc-initiative" multiple>
         <!-- Populated from roadmap initiatives -->
       </select>
     </div>

     <div class="form-actions">
       <button onclick="cancelAddDocument()" class="btn-secondary">Cancel</button>
       <button onclick="saveDocument()" class="btn-primary">Save Document</button>
     </div>
   </div>
   ```

3. **File handling logic:**
   ```javascript
   let pendingDocFile = null;

   function triggerDocFilePicker() {
     document.getElementById('doc-file-input').click();
   }

   function handleDocFileSelect(event) {
     const file = event.target.files[0];
     if (file) setDocFile(file);
   }

   function handleDocDrop(event) {
     event.preventDefault();
     event.target.classList.remove('drag-over');
     const file = event.dataTransfer.files[0];
     if (file) setDocFile(file);
   }

   function setDocFile(file) {
     pendingDocFile = file;
     document.getElementById('doc-file-name').textContent = file.name;
     document.getElementById('doc-file-size').textContent = formatFileSize(file.size);
     document.getElementById('doc-file-preview').style.display = 'flex';
     document.getElementById('doc-upload-zone').style.display = 'none';

     // Auto-fill name if empty
     if (!document.getElementById('doc-name').value) {
       document.getElementById('doc-name').value = file.name.replace(/\.[^.]+$/, '');
     }
   }

   function removeDocFile() {
     pendingDocFile = null;
     document.getElementById('doc-file-preview').style.display = 'none';
     document.getElementById('doc-upload-zone').style.display = 'block';
     document.getElementById('doc-file-input').value = '';
   }

   async function saveDocument() {
     const name = document.getElementById('doc-name').value.trim();
     if (!name) {
       showToast('Please enter a document name', 'warning');
       return;
     }

     showLoadingOverlay('Saving document...');

     try {
       let storagePath = null;
       let fileType = null;
       let fileSize = null;

       // Upload file if attached
       if (pendingDocFile) {
         fileType = pendingDocFile.name.split('.').pop().toLowerCase();
         fileSize = pendingDocFile.size;

         const user = await getUser(); // however auth user is accessed
         const timestamp = Date.now();
         const safeName = pendingDocFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
         storagePath = `${user.id}/docs/${timestamp}_${safeName}`;

         // Upload to Supabase Storage
         // Check if running in Electron or web
         if (window.electronAPI && window.electronAPI.uploadFile) {
           // Electron: read file and upload via Node
           await window.electronAPI.uploadFile('attachments', storagePath, pendingDocFile);
         } else {
           // Web: direct Supabase upload
           const { error } = await _supabase.storage
             .from('attachments')
             .upload(storagePath, pendingDocFile, {
               cacheControl: '3600',
               upsert: false
             });
           if (error) throw error;
         }
       }

       // Save metadata
       if (!currentData.documentRepository) {
         currentData.documentRepository = { folders: [], documents: [] };
       }

       const doc = {
         id: generateId(),
         name: name,
         description: document.getElementById('doc-description').value.trim(),
         folderId: document.getElementById('doc-folder').value || null,
         tags: document.getElementById('doc-tags').value
           .split(',').map(t => t.trim()).filter(Boolean),
         linkedInitiatives: Array.from(
           document.getElementById('doc-initiative').selectedOptions
         ).map(o => o.value),
         fileType: fileType,
         fileSize: fileSize,
         storagePath: storagePath,
         fileName: pendingDocFile ? pendingDocFile.name : null,
         uploadedAt: new Date().toISOString(),
         updatedAt: new Date().toISOString(),
       };

       currentData.documentRepository.documents.push(doc);
       await saveData();

       pendingDocFile = null;
       hideLoadingOverlay();
       closeAddDocumentModal();
       renderDocumentRepository();
       showToast('Document saved successfully', 'success');
     } catch (err) {
       hideLoadingOverlay();
       showToast('Failed to save document: ' + err.message, 'error');
       console.error('Document save error:', err);
     }
   }

   function formatFileSize(bytes) {
     if (bytes < 1024) return bytes + ' B';
     if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
     return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
   }
   ```

4. **CSS for the upload zone:**
   ```css
   .file-upload-zone {
     border: 2px dashed var(--border-color);
     border-radius: 12px;
     padding: 32px;
     text-align: center;
     cursor: pointer;
     transition: border-color 0.2s, background 0.2s;
   }
   .file-upload-zone:hover,
   .file-upload-zone.drag-over {
     border-color: var(--accent-color);
     background: rgba(59, 130, 246, 0.05);
   }
   .dark-mode .file-upload-zone.drag-over {
     background: rgba(59, 130, 246, 0.1);
   }
   .upload-hint {
     font-size: 12px;
     color: var(--text-muted);
     margin-top: 8px;
   }
   #doc-file-preview {
     display: flex;
     align-items: center;
     gap: 12px;
     padding: 12px;
     background: var(--surface-bg);
     border-radius: 8px;
     border: 1px solid var(--border-color);
   }
   ```

5. **Download functionality:** Ensure each document in the repository has a download button that retrieves the file from Supabase Storage:
   ```javascript
   async function downloadDocument(doc) {
     if (!doc.storagePath) {
       showToast('No file attached to this document', 'warning');
       return;
     }

     try {
       showLoadingOverlay('Downloading...');

       if (window.electronAPI && window.electronAPI.downloadFile) {
         await window.electronAPI.downloadFile('attachments', doc.storagePath, doc.fileName);
       } else {
         const { data, error } = await _supabase.storage
           .from('attachments')
           .download(doc.storagePath);
         if (error) throw error;

         // Trigger browser download
         const url = URL.createObjectURL(data);
         const a = document.createElement('a');
         a.href = url;
         a.download = doc.fileName || doc.name;
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         URL.revokeObjectURL(url);
       }

       hideLoadingOverlay();
     } catch (err) {
       hideLoadingOverlay();
       showToast('Download failed: ' + err.message, 'error');
     }
   }
   ```

6. Ensure dark mode support on ALL document upload UI elements.

---

## Fix 5: Sign-Up Flow — Invite Teammates + Google Integration

**Problem:** As part of the sign-up flow, users should be able to optionally invite teammates by email, and optionally import contacts from Google Calendar or Google Contacts.

**Approach:**

### Part A: Invite Teammates Step in Sign-Up/Onboarding
1. Find the sign-up flow or onboarding flow:
   ```bash
   grep -n "signup\|sign-up\|onboarding\|registerUser\|createAccount\|welcome.*step\|onboardingStep" renderer/index.html | head -30
   ```

2. **Add an "Invite Your Team" step** in the onboarding flow (this should come after "Set Up Your Team"):
   ```html
   <div id="onboarding-step-invite" class="onboarding-step" style="display:none;">
     <h2>Invite Your Teammates</h2>
     <p>Collaborate with your team on roadmaps, plans, and priorities.</p>
     <p class="step-optional-label">Optional — you can always do this later</p>

     <div class="invite-section">
       <h3>Add by Email</h3>
       <div class="invite-email-list" id="invite-email-list">
         <div class="invite-email-row">
           <input type="email" placeholder="teammate@company.com" class="invite-email-input">
           <button onclick="addInviteRow()" class="btn-icon" title="Add another">
             <svg viewBox="0 0 20 20" width="18" height="18" stroke="currentColor"
                  stroke-width="1.5" fill="none">
               <line x1="10" y1="4" x2="10" y2="16"/>
               <line x1="4" y1="10" x2="16" y2="10"/>
             </svg>
           </button>
         </div>
       </div>

       <div class="invite-divider">
         <span>or</span>
       </div>

       <h3>Import from Google</h3>
       <div class="google-import-buttons">
         <button onclick="importGoogleContacts()" class="btn-google">
           <svg viewBox="0 0 20 20" width="18" height="18"><!-- Google icon --></svg>
           Import from Google Contacts
         </button>
         <button onclick="importGoogleCalendar()" class="btn-google">
           <svg viewBox="0 0 20 20" width="18" height="18"><!-- Calendar icon --></svg>
           Import from Google Calendar
         </button>
       </div>
       <p class="import-note">We'll find teammates from your recent meetings and contacts</p>
     </div>

     <div class="onboarding-actions">
       <button onclick="skipInviteStep()" class="btn-secondary">Skip for now</button>
       <button onclick="sendInvites()" class="btn-primary">Send Invites</button>
     </div>
   </div>
   ```

### Part B: Email Invite Logic
```javascript
function addInviteRow() {
  const list = document.getElementById('invite-email-list');
  const row = document.createElement('div');
  row.className = 'invite-email-row';
  row.innerHTML = `
    <input type="email" placeholder="teammate@company.com" class="invite-email-input">
    <button onclick="this.parentElement.remove()" class="btn-icon btn-danger-subtle" title="Remove">
      <svg viewBox="0 0 20 20" width="18" height="18" stroke="currentColor"
           stroke-width="1.5" fill="none">
        <line x1="5" y1="5" x2="15" y2="15"/>
        <line x1="15" y1="5" x2="5" y2="15"/>
      </svg>
    </button>
  `;
  list.appendChild(row);
}

async function sendInvites() {
  const inputs = document.querySelectorAll('.invite-email-input');
  const emails = Array.from(inputs)
    .map(i => i.value.trim())
    .filter(e => e && e.includes('@'));

  if (emails.length === 0) {
    showToast('Enter at least one email address', 'warning');
    return;
  }

  showLoadingOverlay('Sending invites...');

  for (const email of emails) {
    try {
      // Use existing invite/send-invite edge function
      await sendInviteEmail(email);
    } catch (err) {
      console.error(`Failed to invite ${email}:`, err);
    }
  }

  hideLoadingOverlay();
  showToast(`${emails.length} invite(s) sent!`, 'success');
  showOnboardingStep('next'); // Move to next step
}
```

### Part C: Google Contacts / Calendar Import
**Note:** This requires Google OAuth scopes that may not already be configured. Implement what's possible with the current auth setup. If the Google OAuth is already configured for sign-in, we may be able to request additional scopes.

```javascript
async function importGoogleContacts() {
  try {
    // Check if we have Google OAuth access
    const user = await getUser();
    const provider = user?.app_metadata?.provider;

    if (provider !== 'google') {
      showToast('Please sign in with Google to import contacts', 'info');
      return;
    }

    // The Google People API requires the 'contacts.readonly' scope
    // If we don't have it, we need to re-auth with the additional scope
    // For now, show an explanation and let users manually enter emails

    showToast('Google Contacts import requires additional permissions. You can add teammates manually by email.', 'info');

    // TODO: Implement full Google Contacts API integration
    // This requires:
    // 1. Adding 'https://www.googleapis.com/auth/contacts.readonly' to OAuth scopes
    // 2. Using the People API: GET https://people.googleapis.com/v1/people/me/connections
    // 3. Extracting email addresses from the response
    // 4. Showing a list for the user to select from

    // PLACEHOLDER: Log that this needs backend OAuth scope changes
    console.log('Google Contacts import: needs contacts.readonly OAuth scope');

  } catch (err) {
    showToast('Failed to import contacts: ' + err.message, 'error');
  }
}

async function importGoogleCalendar() {
  try {
    const user = await getUser();
    const provider = user?.app_metadata?.provider;

    if (provider !== 'google') {
      showToast('Please sign in with Google to import calendar contacts', 'info');
      return;
    }

    // Similar to contacts — needs 'calendar.readonly' scope
    // Would fetch recent meeting attendees

    showToast('Google Calendar import requires additional permissions. You can add teammates manually by email.', 'info');

    // TODO: Implement full Google Calendar API integration
    // 1. Add 'https://www.googleapis.com/auth/calendar.readonly' to OAuth scopes
    // 2. Fetch recent events: GET https://www.googleapis.com/calendar/v3/calendars/primary/events
    // 3. Extract unique attendee emails
    // 4. Show a list for user to select from

    console.log('Google Calendar import: needs calendar.readonly OAuth scope');

  } catch (err) {
    showToast('Failed to import calendar: ' + err.message, 'error');
  }
}
```

**Important:** For the Google integration, implement the UI and the function stubs. The actual API calls need additional OAuth scopes that must be configured in the Google Cloud Console and Supabase Auth settings. Log this as a `// TODO: requires backend OAuth scope configuration` and document the steps needed in `FIX_LOG_V4.md`.

---

## Fix 6: Plans Page — Button Vertical Centering

**Problem:** On the Plans page, buttons (Colours, Templates, Upload Excel, Save Templates, etc.) and the plan name field are sitting too high in the toolbar. They need to be vertically centered.

**Approach:**
1. Find the Plans page toolbar:
   ```bash
   grep -n "plans.*toolbar\|plans.*header\|plan-header\|plan.*buttons\|plan.*actions" renderer/index.html | head -20
   ```

2. **Fix vertical alignment:**
   ```css
   /* Plans page toolbar — and any similar toolbar across the app */
   .plan-toolbar,
   .page-toolbar,
   .page-header-bar {
     display: flex;
     align-items: center;       /* vertically center ALL children */
     min-height: 52px;
     padding: 0 16px;
     gap: 8px;
   }

   /* Ensure no child has top margin pushing it up */
   .plan-toolbar > *,
   .page-toolbar > * {
     margin-top: 0;
     margin-bottom: 0;
   }

   /* If buttons have their own padding that causes misalignment */
   .plan-toolbar button,
   .plan-toolbar input,
   .plan-toolbar select {
     vertical-align: middle;
   }
   ```

3. **Check for inline styles** that might override:
   ```bash
   grep -n "style=.*margin-top\|style=.*padding-top" renderer/index.html | grep -i "plan\|toolbar" | head -10
   ```
   Remove any hardcoded `margin-top` or `padding-top` that pushes elements up.

4. **Apply this fix to ALL page toolbars** — check Templates page, Capacity IQ, Checklist, Artefacts, and any other page with a toolbar.

---

## Fix 7: Plans Page — Import Template as Plan

**Problem:** On the Plans page, clicking "Templates" navigates to the template library page but doesn't let you import a template and turn it into a plan.

**Approach:**
1. Find the Plans page Templates button:
   ```bash
   grep -n "plan.*template.*btn\|template.*button.*plan\|openTemplate.*plan" renderer/index.html | head -15
   ```

2. **Change the behavior:** Instead of navigating to the templates page, open the **Template Builder** (Fix 3) in "import to plan" mode:
   ```javascript
   function openPlanTemplateImport() {
     openTemplateBuilder('plans', { planId: currentPlanId });
   }
   ```

3. **If the Template Builder from Fix 3 is not yet implemented,** create a simpler version:
   ```javascript
   function showPlanTemplateImporter() {
     const templates = getAllTemplates();
     const modal = createModal('Import Template into Plan');

     const list = document.createElement('div');
     list.className = 'template-import-list';

     templates.forEach(template => {
       const card = document.createElement('div');
       card.className = 'template-import-card';
       card.innerHTML = `
         <div class="template-card-header">
           <h4>${template.name}</h4>
           <span class="task-count">${template.tasks?.length || 0} tasks</span>
         </div>
         <p class="template-description">${template.description || ''}</p>
         <button onclick="importTemplateIntoPlan('${template.id}')" class="btn-primary btn-sm">
           Import into Plan
         </button>
       `;
       list.appendChild(card);
     });

     modal.appendChild(list);
     showModal(modal);
   }

   function importTemplateIntoPlan(templateId) {
     const templates = getAllTemplates();
     const template = templates.find(t => t.id === templateId);
     if (!template || !template.tasks) return;

     // Get the current plan
     const plan = getCurrentPlan(); // however the current plan is accessed

     // Import tasks into the plan with new IDs
     template.tasks.forEach(task => {
       const newTask = {
         ...task,
         id: generateId(),
         status: 'Not Started',
         importedFrom: template.name,
         addedAt: new Date().toISOString(),
       };
       plan.tasks.push(newTask);
     });

     saveData();
     renderPlan();
     closeModal();
     showToast(`Imported ${template.tasks.length} tasks from "${template.name}"`, 'success');
   }
   ```

4. **Ensure the imported tasks include all relevant fields:** task name, duration/hours, phase, priority, description, dependencies (if any).

---

## Fix 8: Browser Back Navigation — Broken on Web App

**Problem:** On the web app, pressing the browser back button or swiping back always navigates to the sign-up/login page instead of the previous page within the app.

**Root cause:** The SPA uses `showPage()` to switch views but never pushes state to the browser's history API. So when the user presses back, the browser navigates to the actual previous URL (which is the login page or the initial page load).

**Approach:**

### Step 1: Implement Browser History Integration
1. Find the `showPage` function:
   ```bash
   grep -n "function showPage\|function show(" renderer/index.html | head -10
   ```

2. **Modify `showPage()` to push history state:**
   ```javascript
   // Keep track of whether we're handling a popstate event
   let isPopstateNavigation = false;

   function showPage(pageId, options) {
     // ... existing page switching logic ...

     // After switching the page, push state to browser history
     // (but NOT if we're already handling a back/forward navigation)
     if (!isPopstateNavigation) {
       const state = { page: pageId, options: options || {} };
       const url = `#${pageId}`;

       // Use pushState so back button works
       history.pushState(state, '', url);
     }

     isPopstateNavigation = false;
   }
   ```

3. **Handle the `popstate` event** (fires when user presses back/forward):
   ```javascript
   window.addEventListener('popstate', function(event) {
     if (event.state && event.state.page) {
       isPopstateNavigation = true;
       showPage(event.state.page, event.state.options);
     } else {
       // No state — this might be the initial page or login
       // Check if user is authenticated
       const isAuthenticated = checkAuth(); // however auth is checked
       if (isAuthenticated) {
         // Stay on the current page or go to dashboard
         isPopstateNavigation = true;
         showPage('dashboard');
         // Push state so next back won't go to login
         history.pushState({ page: 'dashboard' }, '', '#dashboard');
       }
       // If not authenticated, let normal navigation happen (back to login is correct)
     }
   });
   ```

4. **Set initial history state on login/page load:**
   ```javascript
   // After successful login or when the app loads with an authenticated session
   function onAuthComplete() {
     // ... existing post-auth logic ...

     // Set initial history state
     const initialPage = getCurrentPageId(); // whatever page is shown first (dashboard)
     history.replaceState({ page: initialPage }, '', `#${initialPage}`);
   }
   ```

5. **Handle hash on page load** (in case user bookmarks a page or refreshes):
   ```javascript
   function handleInitialRoute() {
     const hash = window.location.hash.replace('#', '');
     if (hash && isValidPageId(hash)) {
       showPage(hash);
     } else {
       showPage('dashboard'); // default
     }
   }

   // Call after auth is confirmed
   function isValidPageId(pageId) {
     // Check if a page element with this ID exists
     return !!document.getElementById(pageId + '-page') ||
            !!document.getElementById(pageId);
   }
   ```

6. **Prevent back-to-login trap:**
   ```javascript
   // After login, replace the login page history entry
   // so back doesn't go there
   function onLoginSuccess() {
     // Replace the login URL in history with the dashboard
     history.replaceState({ page: 'dashboard' }, '', '#dashboard');
     showPage('dashboard');
   }
   ```

7. **Test scenarios:**
   - Dashboard → Plans → Roadmap → Back → should go to Plans
   - Dashboard → Plans → Back → should go to Dashboard
   - Dashboard → Back → should stay on Dashboard (not go to login)
   - Refresh on Plans page → should stay on Plans
   - Direct URL `app.pmroadmapper.com/#plans` → should open Plans

### Step 2: Handle Edge Cases
- **Modal navigation:** If a modal is open and user presses back, close the modal instead of changing pages
- **Tab navigation within pages:** If a page has internal tabs, consider whether tab changes should also push history (probably not — keep it simple, just page-level)

```javascript
// Enhanced popstate handler with modal awareness
window.addEventListener('popstate', function(event) {
  // If a modal is open, close it instead of navigating
  const openModal = document.querySelector('.modal[style*="display: flex"], .modal.active, .overlay.active');
  if (openModal) {
    closeAllModals(); // or close the specific modal
    // Re-push current state so back still works for page nav
    const currentPage = getCurrentPageId();
    history.pushState({ page: currentPage }, '', `#${currentPage}`);
    return;
  }

  // Normal page navigation
  if (event.state && event.state.page) {
    isPopstateNavigation = true;
    showPage(event.state.page, event.state.options);
  } else {
    const isAuthenticated = checkAuth();
    if (isAuthenticated) {
      isPopstateNavigation = true;
      showPage('dashboard');
      history.pushState({ page: 'dashboard' }, '', '#dashboard');
    }
  }
});
```

---

## Post-Fix Checklist

1. **Import test:** Verify JSON roadmap import works on the web — check the flow from file picker to data write to render.
2. **Template unification:** Verify the Templates page and Capacity IQ templates show the SAME list.
3. **Template Builder:** Verify you can browse templates, check tasks, and either import them or save as a new custom template.
4. **Document upload:** Verify you can drag-and-drop or browse for a file, and it saves to Supabase Storage.
5. **Back button:** On the web app, navigate between 3+ pages and press back — should go to the previous page, NOT to login.
6. **Plans template import:** On Plans, click Templates → should open a template picker → import tasks into the plan.
7. **Toolbar alignment:** Verify Plans, Templates, and other toolbars have vertically centered buttons.
8. **Dark mode check:** All new UI elements support dark mode.
9. **Emoji check:** `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` — must be 0.
10. **Syntax check:** `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"`
11. **Bump version** in `package.json`
12. **Rebuild web:** `cd web && npm run build`
13. **Commit:** `git add -A && git commit -m "vX.Y.Z: v4 fixes — import, template builder, doc upload, browser nav, invites"`
14. **Update FIX_LOG_V4.md** with final summary

---

## Autonomous Operation Rules

1. **Never ask for clarification.** Make the best decision and document it in `FIX_LOG_V4.md`.
2. **Never stop between fixes.** Complete one, move to the next.
3. **Self-review after each fix:** Re-read changes, check syntax, verify both light and dark mode.
4. **If a fix is blocked** (e.g., needs Google OAuth scope changes), implement the UI and stubs, add `// TODO:` comments, log the required backend steps in `FIX_LOG_V4.md`, move on.
5. **Preserve existing patterns.** Match the codebase style exactly.
6. **Both modes matter.** Every element must work in BOTH light mode AND dark mode.
7. **Keep the single-file SPA pattern.** All UI changes go into `renderer/index.html`.
8. **Zero emoji.** Replace any emoji encountered while working.
9. **The Template Builder (Fix 3) is the centerpiece of this batch.** Get it right — it's used by Plans, To-Do, Checklist, and Capacity IQ.
10. **Browser history (Fix 8) is critical for web UX.** Test thoroughly with the popstate scenarios described.
