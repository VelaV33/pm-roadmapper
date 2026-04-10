const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// v1.27.4: Heavy modules are lazy-loaded on first use to keep cold-start
// fast. Previously these were synchronously required at the top of main.js
// and added ~3s of disk I/O + module parsing to every cold start, even if
// the user never opened a PDF / DOCX or ran an update check.
let pdfParse = null;        // pdf-parse-new — required by read-file handler
let mammoth  = null;        // DOCX parser — required by read-file handler
let _autoUpdater = null;    // electron-updater — required only once after window-ready

function getPdfParse() {
  if (pdfParse) return pdfParse;
  try { pdfParse = require('pdf-parse-new'); }
  catch (e) {
    try { pdfParse = require('pdf-parse'); }
    catch (e2) { console.warn('pdf-parse not available:', e2.message); }
  }
  return pdfParse;
}

function getMammoth() {
  if (mammoth) return mammoth;
  try { mammoth = require('mammoth'); }
  catch (e) { console.warn('mammoth not available:', e.message); }
  return mammoth;
}

function getAutoUpdater() {
  if (_autoUpdater) return _autoUpdater;
  try { _autoUpdater = require('electron-updater').autoUpdater; }
  catch (e) { console.warn('electron-updater not available:', e.message); }
  return _autoUpdater;
}

// ── Custom protocol (pmroadmapper://) for OAuth deep-link handoff ────────────
// v1.27.3: When the desktop user signs in with Google/Microsoft, the OAuth
// flow runs in their default browser. After Supabase completes auth, the web
// page at app.pmroadmapper.com builds a pmroadmapper://oauth-callback#... URL
// and triggers it; the OS routes it back here, and we forward the tokens to
// the renderer via IPC. See checkOAuthRedirect() and onOAuthCallback() in
// renderer/index.html for the other half.
//
// On Windows the protocol must be registered BEFORE app.whenReady() and is
// stored per-user under HKCU\Software\Classes\pmroadmapper. Linux uses
// .desktop files. macOS uses Info.plist (handled at build time by
// electron-builder, but the runtime registration is also needed for dev).
if (process.defaultApp) {
  // Running via `electron .` in dev — pass our script path so the OS can
  // re-launch us correctly when the deep link arrives.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('pmroadmapper', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('pmroadmapper');
}

// Single-instance lock — without this, opening a deep link launches a SECOND
// copy of the app instead of routing to the existing one. With the lock, the
// 2nd launch immediately quits and fires 'second-instance' on the original.
const _gotTheLock = app.requestSingleInstanceLock();
if (!_gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine /*, workingDirectory */) => {
    // Bring the original window to the foreground.
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    // Find the deep-link URL in the launch arguments and forward it.
    const deepLink = commandLine.find((arg) => typeof arg === 'string' && arg.startsWith('pmroadmapper://'));
    if (deepLink) handleDeepLink(deepLink);
  });

  // macOS only: deep links arrive via 'open-url' instead of CLI args.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });
}

// Forward a deep-link URL to the renderer. Idempotent — safe to call multiple
// times. The renderer parses the URL and sets the Supabase session.
function handleDeepLink(url) {
  if (!url || typeof url !== 'string') return;
  if (!url.startsWith('pmroadmapper://')) return;
  // Wait until the window exists, then send.
  const sendNow = () => { try { win.webContents.send('oauth-callback', url); } catch (_) {} };
  if (win && win.webContents) {
    sendNow();
  } else {
    // App was launched cold by the deep link — store and send once the window is ready.
    app.once('browser-window-created', () => setTimeout(sendNow, 800));
  }
}

// Also handle the case where the cold-start launch arg IS the deep link
// (Windows/Linux). app.argv on cold start includes any URL the OS handed us.
const _coldStartDeepLink = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith('pmroadmapper://'));
if (_coldStartDeepLink) {
  // Defer until the window has loaded, otherwise the IPC send is dropped.
  app.whenReady().then(() => {
    setTimeout(() => handleDeepLink(_coldStartDeepLink), 1500);
  });
}

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
    // v1.27.4: don't show the window until the renderer has painted at least
    // once. Without this you see a blank/white window for the first second or
    // two of cold start while the 1.3 MB renderer parses. With it the window
    // appears already-rendered, which feels significantly snappier.
    show: false,
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
  win.once('ready-to-show', () => { win.show(); });
  // Safety net: if ready-to-show never fires (e.g. renderer crash during init),
  // force the window to appear after 5s so the user isn't stuck with nothing.
  setTimeout(() => { try { if (win && !win.isVisible()) win.show(); } catch(_){} }, 5000);

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
  // v1.26.8: harden the hidden print window — sandbox + nodeIntegration off,
  // webSecurity on, no preload. The HTML we load is built in the renderer
  // and could in theory carry an XSS payload from a row name; this isolates it.
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      javascript: false,  // no scripts needed for print rendering
    },
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

    // PDF — extract text (pdf-parse loaded lazily on first use)
    if (ext === '.pdf') {
      const pp = getPdfParse();
      if (pp) {
        try {
          const data = await pp(buf);
          return { ok: true, name, ext, text: data.text || '', storedName };
        } catch(pdfErr) {
          console.warn('PDF parse failed:', pdfErr.message);
          return { ok: true, name, ext, text: '[PDF text extraction failed - ' + pdfErr.message + ']', storedName };
        }
      }
    }

    // Word (.docx) — extract text (mammoth loaded lazily on first use)
    if (ext === '.docx') {
      const mm = getMammoth();
      if (mm) {
        const result = await mm.extractRawText({ buffer: buf });
        return { ok: true, name, ext, text: result.value || '', storedName };
      }
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
// v1.25.0: All transcript previews removed from logs — voice content is user
// data and shouldn't be in stdout. Set PMR_DEBUG=1 to re-enable debug logging.
ipcMain.handle('transcribe-audio', async (_event, { base64, apiKey, mimeType }) => {
  const mime = mimeType || 'audio/webm';
  const DEBUG = process.env.PMR_DEBUG === '1';
  if (DEBUG) console.log(`[Transcribe] Starting — mime: ${mime}`);
  let firstError = '';
  const models = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-flash'];
  for (const model of models) {
    try {
      if (DEBUG) console.log(`[Transcribe] Trying ${model}`);
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
            if (DEBUG) console.log(`[Transcribe] ${model} status: ${res.statusCode}`);
            try { resolve({ ok: res.statusCode < 300, data: JSON.parse(data), status: res.statusCode }); }
            catch(e) { resolve({ ok: false, data: {}, status: res.statusCode }); }
          });
        });
        req.on('error', e => { if (DEBUG) console.log(`[Transcribe] ${model} error`); resolve({ ok: false, error: e.message }); });
        req.write(payload);
        req.end();
      });

      if (result.ok && result.data.candidates) {
        let text = '';
        const parts = result.data.candidates[0]?.content?.parts || [];
        parts.forEach(p => { if (p.text) text += p.text; });
        if (text.trim() && !text.toLowerCase().includes('unable to process audio') && !text.toLowerCase().includes('cannot transcribe') && !text.toLowerCase().includes('[unclear audio]')) {
          if (DEBUG) console.log(`[Transcribe] Success with ${model}`);
          return { ok: true, text: text.trim(), model };
        }
        if (DEBUG) console.log(`[Transcribe] ${model} returned empty / unclear`);
      } else {
        if (DEBUG) console.log(`[Transcribe] ${model} failed — HTTP ${result.status}`);
        // Return a generic error for the user — don't echo the model's response body
        if (!firstError) firstError = `${model}: HTTP ${result.status}`;
      }
    } catch (e) {
      if (DEBUG) console.log(`[Transcribe] ${model} exception`);
    }
  }
  return { ok: false, error: firstError || 'All transcription models failed.' };
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
  // v1.27.4: electron-updater is lazy-loaded and the entire wiring runs on a
  // 5-second timer so it never competes with cold-start. Module require alone
  // used to add ~0.5-1s before window-paint.
  setTimeout(() => {
    const updater = getAutoUpdater();
    if (!updater) return;

    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;

    updater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      if (win) win.webContents.send('update-available', info.version);
    });

    updater.on('update-downloaded', (info) => {
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
          if (result.response === 0) updater.quitAndInstall();
        });
      }
    });

    updater.on('error', (err) => {
      console.log('Auto-update error:', err.message);
    });

    updater.checkForUpdatesAndNotify().catch(err => {
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
            // v1.25.0: log status + error code only — full bodies can leak
            // schema details and JWT prefixes into local logs.
            const code = (parsed && (parsed.code || parsed.error || parsed.error_description)) || '';
            console.error('[SUPABASE]', m, path, '→', res.statusCode, code);
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

// ── Saved credentials ────────────────────────────────────────────────────────
// Stored encrypted by safeStorage, which uses:
//   • Windows: DPAPI (per-user, tied to the OS account)
//   • macOS: Keychain
//   • Linux: kwallet / libsecret
// The ciphertext is meaningless on any other machine or under any other OS user.
// We store ONE record per app — the last user who chose "Remember me".
function getCredentialsPath() {
  return path.join(app.getPath('userData'), 'pmr-credentials.bin');
}

ipcMain.handle('credentials:save', async (_event, { email, password }) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[credentials:save] OS encryption not available — refusing to store plaintext');
      return { ok: false, error: 'OS encryption not available' };
    }
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return { ok: false, error: 'Invalid input' };
    }
    const blob = JSON.stringify({ email, password, savedAt: Date.now() });
    const cipher = safeStorage.encryptString(blob);
    fs.writeFileSync(getCredentialsPath(), cipher);
    return { ok: true };
  } catch (e) {
    console.error('[credentials:save] error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('credentials:load', async () => {
  try {
    const p = getCredentialsPath();
    if (!fs.existsSync(p)) return { ok: true, found: false };
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'OS encryption not available' };
    }
    const cipher = fs.readFileSync(p);
    const blob = safeStorage.decryptString(cipher);
    const data = JSON.parse(blob);
    if (!data || !data.email || !data.password) return { ok: true, found: false };
    return { ok: true, found: true, email: data.email, password: data.password };
  } catch (e) {
    console.error('[credentials:load] error:', e.message);
    // Corrupted blob — wipe so we don't keep failing.
    try { fs.unlinkSync(getCredentialsPath()); } catch {}
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('credentials:clear', async () => {
  try {
    const p = getCredentialsPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return { ok: true };
  } catch (e) {
    console.error('[credentials:clear] error:', e.message);
    return { ok: false, error: e.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
