const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Data file path (stored in OS user data dir) ───────────────────────────────
function getDataPath() {
  return path.join(app.getPath('userData'), 'roadmap-data.json');
}

// ── Window ─────────────────────────────────────────────────────────────────────
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Netstar HW Roadmap',
    backgroundColor: '#f4f7fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

// Load data from disk
ipcMain.handle('load-data', () => {
  const filePath = getDataPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return { ok: true, data: JSON.parse(raw) };
    }
    return { ok: false }; // No saved data — use defaults
  } catch (e) {
    console.error('load-data error:', e);
    return { ok: false };
  }
});

// Save data to disk
ipcMain.handle('save-data', (_event, payload) => {
  const filePath = getDataPath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { ok: true };
  } catch (e) {
    console.error('save-data error:', e);
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
      defaultPath: 'Netstar_HW_Roadmap_FY26.pdf',
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

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
