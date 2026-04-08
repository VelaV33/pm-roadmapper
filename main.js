const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
let pdfParse, mammoth;
try { pdfParse = require('pdf-parse-new'); } catch(e) { try { pdfParse = require('pdf-parse'); } catch(e2) { console.warn('pdf-parse not available:', e2.message); } }
try { mammoth = require('mammoth'); } catch(e) { console.warn('mammoth not available:', e.message); }

// ── Data file path (stored in OS user data dir, scoped by user ID) ───────────
let _activeUserId = null;

function getDataPath(userId) {
  const uid = userId || _activeUserId;
  if (uid) return path.join(app.getPath('userData'), 'roadmap-data-' + uid + '.json');
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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
    },
  });

  // Permission policy: deny by default, allow only what we explicitly need.
  // The renderer is local trusted code but a future XSS via shared content
  // shouldn't be able to escalate to camera/screen capture/etc.
  const ALLOWED_PERMS = new Set(['media', 'microphone']);
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMS.has(permission));
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMS.has(permission);
  });

  // Block any attempt to navigate the main window away from our local file://
  // page, and force any new-window requests through shell.openExternal with
  // protocol validation. This neuters most XSS-to-RCE escalation paths.
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
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

// Set the active user ID so data files are scoped per user.
// No automatic migration — data comes from Supabase (cloud-first).
// Local files are an offline cache only.
ipcMain.handle('set-active-user', (_event, userId) => {
  _activeUserId = userId || null;
  return { ok: true };
});

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

// Open an attachment with the system default app.
// SECURITY: validate that storedName cannot escape the attachments directory.
// Without this, a renderer XSS could pass '..\\..\\..\\Windows\\System32\\cmd.exe'
// and we'd hand it to shell.openPath.
ipcMain.handle('open-attachment', async (_event, storedName) => {
  if (typeof storedName !== 'string' || !storedName) {
    return { ok: false, error: 'Invalid name' };
  }
  // Reject any path separators or traversal segments outright.
  if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..') || path.isAbsolute(storedName)) {
    return { ok: false, error: 'Invalid name' };
  }
  const dir = getAttachmentsDir();
  const filePath = path.resolve(dir, storedName);
  // Defence in depth: resolved path must still live inside the attachments dir.
  const dirResolved = path.resolve(dir);
  if (!filePath.startsWith(dirResolved + path.sep)) {
    return { ok: false, error: 'Invalid name' };
  }
  if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found' };
  try {
    await shell.openPath(filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Open an external URL in the default browser.
// SECURITY: only http(s) and mailto are allowed. Without this check, a
// renderer XSS could pass file:///C:/Windows/System32/cmd.exe (or other
// dangerous schemes) and shell.openExternal would happily launch it.
ipcMain.handle('open-external', async (_event, url) => {
  try {
    if (typeof url !== 'string') return { ok: false, error: 'Invalid URL' };
    let parsed;
    try { parsed = new URL(url); } catch { return { ok: false, error: 'Invalid URL' }; }
    const allowed = ['http:', 'https:', 'mailto:'];
    if (!allowed.includes(parsed.protocol)) {
      console.warn('[open-external] blocked scheme:', parsed.protocol);
      return { ok: false, error: 'URL scheme not allowed' };
    }
    await shell.openExternal(parsed.toString());
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

    // Copy file to attachments dir for persistence
    const attachDir = path.join(app.getPath('userData'), 'attachments');
    if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });
    const storedName = Date.now() + '_' + name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedPath = path.join(attachDir, storedName);
    try { fs.copyFileSync(filePath, storedPath); } catch(copyErr) { console.warn('Could not copy file:', copyErr.message); }

    // PDF — extract text
    if (ext === '.pdf' && pdfParse) {
      try {
        const data = await pdfParse(buf);
        return { ok: true, name, ext, text: data.text || '', storedName };
      } catch(pdfErr) {
        console.warn('PDF parse failed:', pdfErr.message);
        return { ok: true, name, ext, text: '[PDF text extraction failed - ' + pdfErr.message + ']', storedName };
      }
    }

    // Word (.docx) — extract text
    if (ext === '.docx' && mammoth) {
      const result = await mammoth.extractRawText({ buffer: buf });
      return { ok: true, name, ext, text: result.value || '', storedName };
    }

    // Excel — return base64 for SheetJS in renderer
    if (['.xlsx', '.xls'].includes(ext)) {
      return { ok: true, name, ext, base64: buf.toString('base64'), storedName };
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
        return { ok: true, name, ext, text: text.trim(), storedName };
      } catch (e) {
        return { ok: true, name, ext, base64: buf.toString('base64'), storedName };
      }
    }

    // Old Word (.doc)
    if (ext === '.doc') {
      const rawText = buf.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n');
      return { ok: true, name, ext, text: rawText, storedName };
    }

    // CSV, TXT and others — read as text
    return { ok: true, name, ext, text: buf.toString('utf-8'), storedName };
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

  // ── Auto-update ──
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    if (win) win.webContents.send('update-available', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    if (win) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update Ready',
        message: 'Version ' + info.version + ' has been downloaded.',
        detail: 'The update will be installed when you restart the app.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0
      }).then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.log('Auto-update error:', err.message);
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.log('Update check failed:', err.message);
    });
  }, 5000);
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

// Force keyboard focus back to the window (fixes Electron losing input after overlay changes)
ipcMain.handle('refocus-window', () => {
  if (win) {
    win.blur();
    win.focus();
    win.webContents.focus();
  }
  return { ok: true };
});

// ── AI API Proxy (routes through main process to bypass CORS) ──
ipcMain.handle('ai-request', async (_event, { provider, apiKey, model, prompt, systemPrompt, imageBase64, imageMime }) => {
  return new Promise((resolve) => {
    try {
      let hostname, reqPath, headers, payload;

      if (provider === 'gemini') {
        hostname = 'generativelanguage.googleapis.com';
        reqPath = '/v1beta/models/' + (model || 'gemini-2.5-flash') + ':generateContent?key=' + apiKey;
        headers = { 'Content-Type': 'application/json' };
        // Support image input for vision
        var parts = [];
        if (imageBase64) {
          parts.push({ inlineData: { mimeType: imageMime || 'image/png', data: imageBase64 } });
        }
        parts.push({ text: (systemPrompt ? systemPrompt + '\n\n' : '') + prompt });
        payload = JSON.stringify({
          contents: [{ parts: parts }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
        });
      } else if (provider === 'openai') {
        hostname = 'api.openai.com';
        reqPath = '/v1/chat/completions';
        headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
        payload = JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3, max_tokens: 8192
        });
      } else if (provider === 'claude') {
        hostname = 'api.anthropic.com';
        reqPath = '/v1/messages';
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        };
        payload = JSON.stringify({
          model: model || 'claude-sonnet-4-5-20250514',
          max_tokens: 8192,
          system: systemPrompt || 'You are a helpful assistant.',
          messages: [{ role: 'user', content: prompt }]
        });
      } else {
        resolve({ ok: false, error: 'Unknown provider: ' + provider });
        return;
      }

      const opts = {
        hostname, path: reqPath, method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) }
      };

      const req = https.request(opts, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            let text = null;
            if (provider === 'gemini') {
              text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
            } else if (provider === 'openai') {
              text = data.choices?.[0]?.message?.content || null;
            } else if (provider === 'claude') {
              text = data.content?.[0]?.text || null;
            }
            if (text) {
              resolve({ ok: true, text });
            } else {
              console.error('[AI] No text in response:', JSON.stringify(data).substring(0, 500));
              resolve({ ok: false, error: data.error?.message || JSON.stringify(data).substring(0, 200) });
            }
          } catch (e) {
            resolve({ ok: false, error: 'Parse error: ' + e.message });
          }
        });
      });
      req.on('error', e => resolve({ ok: false, error: e.message }));
      req.write(payload);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
});

ipcMain.handle('supa-request', async (_event, { path, method, body, token }) => {
  return supaFetch(path, method, body, token);
});

ipcMain.handle('supa-db-request', async (_event, { path, method, body, token }) => {
  return new Promise((resolve) => {
    const m = (method || 'GET').toUpperCase();
    const payload = body ? JSON.stringify(body) : null;
    // Only send Prefer on writes — GET requests reject it
    // resolution=merge-duplicates is required for upserts to update existing rows
    const preferHeader = m === 'GET' || m === 'DELETE'
      ? {}
      : { 'Prefer': 'return=representation,resolution=merge-duplicates' };
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
          if (res.statusCode >= 300) {
            console.error('[SUPABASE]', m, path, '→', res.statusCode, JSON.stringify(parsed).substring(0, 300));
          }
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
