const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
let pdfParse, mammoth;
try { pdfParse = require('pdf-parse-new'); } catch(e) { try { pdfParse = require('pdf-parse'); } catch(e2) { console.warn('pdf-parse not available:', e2.message); } }
try { mammoth = require('mammoth'); } catch(e) { console.warn('mammoth not available:', e.message); }

// ── Data file path (stored in OS user data dir) ───────────────────────────────
function getDataPath() {
  return path.join(app.getPath('userData'), 'roadmap-data.json');
}

// ── Window ─────────────────────────────────────────────────────────────────────
let win;

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'PM Roadmapper',
    icon: iconPath,
    backgroundColor: '#f4f7fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Grant microphone permission for voice-to-text
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'microphone') {
      callback(true);
    } else {
      callback(true);
    }
  });

  win.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'microphone') return true;
    return true;
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Custom menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Reset to Default Data',
          click: () => {
            win.webContents.send('reset-data');
          },
        },
        { type: 'separator' },
        {
          label: 'Show Data File Location',
          click: () => {
            const p = getDataPath();
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'Data File Location',
              message: 'Your roadmap data is saved at:',
              detail: p,
              buttons: ['OK'],
            });
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// ── IPC Handlers ───────────────────────────────────────────────────────────────

// Load data — tries main file, then .bak, then falls back to built-in defaults
ipcMain.handle('load-data', () => {
  const filePath = getDataPath();
  const backupPath = filePath + '.bak';
  const tryLoad = (p) => {
    try {
      if (!fs.existsSync(p)) return null;
      const raw = fs.readFileSync(p, 'utf-8').trim();
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || (!data.rows && !data.sections)) return null;
      return data;
    } catch (e) { console.error('load error', p, e.message); return null; }
  };
  const data = tryLoad(filePath) || tryLoad(backupPath);
  return data ? { ok: true, data } : { ok: false };
});

// Save data — atomic write (tmp then rename) + .bak rotation
ipcMain.handle('save-data', (_event, payload) => {
  const filePath = getDataPath();
  const tmpPath  = filePath + '.tmp';
  const bakPath  = filePath + '.bak';
  try {
    const json = JSON.stringify(payload, null, 2);
    fs.writeFileSync(tmpPath, json, 'utf-8');
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, bakPath);
    fs.renameSync(tmpPath, filePath);
    return { ok: true };
  } catch (e) {
    console.error('save-data error:', e);
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    return { ok: false, error: e.message };
  }
});

// Backup — export a copy to a user-chosen location
ipcMain.handle('export-backup', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Export Roadmap Backup',
    defaultPath: 'netstar-roadmap-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  try {
    const src = getDataPath();
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, filePath);
    }
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Import backup
ipcMain.handle('import-backup', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Import Roadmap Backup',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false };
  try {
    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    const data = JSON.parse(raw);
    fs.writeFileSync(getDataPath(), JSON.stringify(data, null, 2), 'utf-8');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Print to PDF (native Electron) ────────────────────────────────────────────
ipcMain.handle('print-pdf', async (_event, htmlContent) => {
  // Create a hidden window, load the print HTML, then printToPDF
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true },
  });

  await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

  try {
    const pdfBuffer = await printWin.webContents.printToPDF({
      landscape: true,
      pageSize: 'A3',
      printBackground: true,
      marginsType: 1, // minimum margins
    });
    printWin.close();

    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Save PDF',
      defaultPath: 'PM_Roadmapper_FY27.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, pdfBuffer);
    return { ok: true, path: filePath };
  } catch (e) {
    printWin.close();
    return { ok: false, error: e.message };
  }
});

// ── Save arbitrary file (Excel HTML) ──────────────────────────────────────────
ipcMain.handle('save-file', async (_event, { content, defaultName, ext, label }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Save ' + label,
    defaultPath: defaultName,
    filters: [{ name: label, extensions: [ext] }],
  });
  if (canceled || !filePath) return { ok: false };
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Attachments ────────────────────────────────────────────────────────────────
function getAttachmentsDir() {
  const dir = path.join(app.getPath('userData'), 'attachments');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Pick files and copy them into the app's attachments folder
ipcMain.handle('pick-attachments', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Attach Documents',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents', extensions: ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','png','jpg','jpeg','gif','svg','zip','rar'] },
      { name: 'All Files', extensions: ['*'] }
    ],
  });
  if (canceled || !filePaths.length) return { ok: false };
  const results = [];
  const dir = getAttachmentsDir();
  for (const src of filePaths) {
    const origName = path.basename(src);
    // Unique stored name to avoid collisions
    const storedName = Date.now() + '_' + origName;
    const dest = path.join(dir, storedName);
    try {
      fs.copyFileSync(src, dest);
      results.push({ name: origName, storedName: storedName });
    } catch (e) {
      console.error('attach copy error:', e.message);
    }
  }
  return { ok: true, files: results };
});

// Open an attachment with the system default app
ipcMain.handle('open-attachment', async (_event, storedName) => {
  const filePath = path.join(getAttachmentsDir(), storedName);
  if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found' };
  try {
    await shell.openPath(filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Open an external URL in the default browser
ipcMain.handle('open-external', async (_event, url) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Read file contents (for document parsing)
ipcMain.handle('read-file', async (_event, opts) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: opts?.title || 'Select Document',
    properties: ['openFile'],
    filters: opts?.filters || [
      { name: 'Documents', extensions: ['pdf', 'xlsx', 'xls', 'csv', 'txt', 'doc', 'docx', 'pptx'] },
      { name: 'All Files', extensions: ['*'] }
    ],
  });
  if (canceled || !filePaths.length) return { ok: false };
  try {
    const filePath = filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);
    const buf = fs.readFileSync(filePath);

    // PDF — extract text
    if (ext === '.pdf' && pdfParse) {
      const data = await pdfParse(buf);
      return { ok: true, name, ext, text: data.text || '' };
    }

    // Word (.docx) — extract text
    if (ext === '.docx' && mammoth) {
      const result = await mammoth.extractRawText({ buffer: buf });
      return { ok: true, name, ext, text: result.value || '' };
    }

    // Excel — return base64 for SheetJS in renderer
    if (['.xlsx', '.xls'].includes(ext)) {
      return { ok: true, name, ext, base64: buf.toString('base64') };
    }

    // PowerPoint (.pptx) — basic XML text extraction
    if (ext === '.pptx') {
      try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(buf);
        let text = '';
        zip.getEntries().forEach(entry => {
          if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml/)) {
            const xml = entry.getData().toString('utf-8');
            // Extract text from <a:t> tags
            const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
            matches.forEach(m => { text += m.replace(/<\/?a:t>/g, '') + ' '; });
            text += '\n';
          }
        });
        return { ok: true, name, ext, text: text.trim() };
      } catch (e) {
        // If adm-zip not available, return base64 as fallback
        return { ok: true, name, ext, base64: buf.toString('base64') };
      }
    }

    // Old Word (.doc) — return base64, can't easily parse
    if (ext === '.doc') {
      // Try to extract readable ASCII text from binary
      const rawText = buf.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n');
      return { ok: true, name, ext, text: rawText };
    }

    // CSV, TXT and others — read as text
    return { ok: true, name, ext, text: buf.toString('utf-8') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Transcribe audio via Gemini API (runs in main process to avoid CORS)
ipcMain.handle('transcribe-audio', async (_event, { base64, apiKey, mimeType }) => {
  const mime = mimeType || 'audio/webm';
  console.log(`[Transcribe] Starting — mime: ${mime}, base64 length: ${base64?.length || 0}`);
  let firstError = '';
  const models = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-flash'];
  for (const model of models) {
    try {
      console.log(`[Transcribe] Trying ${model}...`);
      const payload = JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: mime, data: base64 } },
          { text: 'This is a voice recording of someone giving instructions for a product roadmap tool. Listen carefully and transcribe EXACTLY what is spoken, word for word. Do NOT make up or generate content. If you cannot hear clear speech, respond with "[unclear audio]". Return ONLY the exact transcription.' }
        ]}],
        generationConfig: { maxOutputTokens: 2000, temperature: 0 }
      });

      const result = await new Promise((resolve) => {
        const options = {
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            console.log(`[Transcribe] ${model} status: ${res.statusCode}, size: ${data.length}`);
            try { resolve({ ok: res.statusCode < 300, data: JSON.parse(data), status: res.statusCode }); }
            catch(e) { resolve({ ok: false, data: {}, status: res.statusCode }); }
          });
        });
        req.on('error', e => { console.log(`[Transcribe] ${model} error: ${e.message}`); resolve({ ok: false, error: e.message }); });
        req.write(payload);
        req.end();
      });

      if (result.ok && result.data.candidates) {
        let text = '';
        const parts = result.data.candidates[0]?.content?.parts || [];
        parts.forEach(p => { if (p.text) text += p.text; });
        if (text.trim() && !text.toLowerCase().includes('unable to process audio') && !text.toLowerCase().includes('cannot transcribe') && !text.toLowerCase().includes('[unclear audio]')) {
          console.log(`[Transcribe] Success with ${model}: "${text.trim().substring(0, 50)}..."`);
          return { ok: true, text: text.trim(), model };
        }
        console.log(`[Transcribe] ${model} returned: "${text.substring(0, 100)}"`);
      } else {
        const errDetail = JSON.stringify(result.data).substring(0, 300);
        console.log(`[Transcribe] ${model} failed — status: ${result.status}, response:`, errDetail);
        // Return the first error we get so user can see it
        if (!firstError) firstError = `${model}: HTTP ${result.status} — ${errDetail}`;
      }
    } catch (e) {
      console.log(`[Transcribe] ${model} exception: ${e.message}`);
    }
  }
  return { ok: false, error: firstError || ('All models failed. base64 size: ' + (base64?.length || 0)) };
});

// Save binary file (e.g. XLSX) from base64
ipcMain.handle('save-binary-file', async (_event, { base64, defaultName, ext, label }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Save ' + label,
    defaultPath: defaultName,
    filters: [{ name: label, extensions: [ext] }],
  });
  if (canceled || !filePath) return { ok: false };
  try {
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buf);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


// ── Supabase Auth IPC (runs in Node — no CORS restrictions) ──────────────────
const https = require('https');

const SUPA_URL  = 'nigusoyssktoebzscbwe.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pZ3Vzb3lzc2t0b2VienNjYndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4Mzg4MDEsImV4cCI6MjA4OTQxNDgwMX0.RhMTy0kL5LuEhxPb3R6SSxUTHGauouudCWlPHWteTtI';

function supaFetch(path, method, body, token) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: SUPA_URL,
      path: path,
      method: method || 'GET',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPA_ANON,
        'Authorization': 'Bearer ' + (token || SUPA_ANON),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ ok: false, status: res.statusCode, data: {} }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, data: { error_description: e.message } }));
    if (payload) req.write(payload);
    req.end();
  });
}

ipcMain.handle('supa-request', async (_event, { path, method, body, token }) => {
  return supaFetch(path, method, body, token);
});

ipcMain.handle('supa-db-request', async (_event, { path, method, body, token }) => {
  return new Promise((resolve) => {
    const m = (method || 'GET').toUpperCase();
    const payload = body ? JSON.stringify(body) : null;
    // Only send Prefer on writes — GET requests reject it
    const preferHeader = m === 'GET' || m === 'DELETE'
      ? {}
      : { 'Prefer': 'return=representation' };
    const opts = {
      hostname: SUPA_URL,
      path: path,
      method: m,
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPA_ANON,
        'Authorization': 'Bearer ' + (token || SUPA_ANON),
        ...preferHeader,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data.trim() ? JSON.parse(data) : (m === 'DELETE' ? [] : {});
          resolve({ ok: res.statusCode < 300, status: res.statusCode, data: parsed });
        } catch(e) {
          resolve({ ok: false, status: res.statusCode, data: { message: 'Parse error: '+data.slice(0,100) } });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, data: { message: e.message } }));
    if (payload) req.write(payload);
    req.end();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
