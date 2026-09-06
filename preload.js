const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ledgerAPI', {
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  createAccount: (username, password) => ipcRenderer.invoke('accounts:create', username, password),
  login: (id, password) => ipcRenderer.invoke('accounts:login', id, password),
  save: (sessionId, data) => ipcRenderer.invoke('ledger:save', sessionId, data),
  exportBackup: (sessionId, data) => ipcRenderer.invoke('backup:export', sessionId, data),
  importBackup: (sessionId, encrypted) => ipcRenderer.invoke('backup:import', sessionId, encrypted),
  clearSession: (sessionId) => ipcRenderer.send('session:clear', sessionId)
});
