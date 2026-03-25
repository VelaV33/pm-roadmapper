const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData:     ()            => ipcRenderer.invoke('load-data'),
  saveData:     (data)        => ipcRenderer.invoke('save-data', data),
  exportBackup: ()            => ipcRenderer.invoke('export-backup'),
  importBackup: ()            => ipcRenderer.invoke('import-backup'),
  printPDF:     (html)        => ipcRenderer.invoke('print-pdf', html),
  saveFile:     (opts)        => ipcRenderer.invoke('save-file', opts),
  onResetData:  (cb)          => ipcRenderer.on('reset-data', cb),
  supaRequest:  (opts)         => ipcRenderer.invoke('supa-request', opts),
  supaDb:       (opts)         => ipcRenderer.invoke('supa-db-request', opts),
  pickAttachments: ()          => ipcRenderer.invoke('pick-attachments'),
  openAttachment:  (name)      => ipcRenderer.invoke('open-attachment', name),
  openExternal:    (url)       => ipcRenderer.invoke('open-external', url),
  saveBinaryFile:  (opts)      => ipcRenderer.invoke('save-binary-file', opts),
  readFile:        (opts)      => ipcRenderer.invoke('read-file', opts),
});
