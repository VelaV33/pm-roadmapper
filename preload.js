const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData:     ()            => ipcRenderer.invoke('load-data'),
  saveData:     (data)        => ipcRenderer.invoke('save-data', data),
  exportBackup: ()            => ipcRenderer.invoke('export-backup'),
  importBackup: ()            => ipcRenderer.invoke('import-backup'),
  printPDF:     (html)        => ipcRenderer.invoke('print-pdf', html),
  saveFile:     (opts)        => ipcRenderer.invoke('save-file', opts),
  onResetData:  (cb)          => ipcRenderer.on('reset-data', cb),
});
