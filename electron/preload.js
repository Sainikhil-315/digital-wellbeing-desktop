const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Data
  getTodayUsage:  () => ipcRenderer.invoke('get-today-usage'),
  getWeeklyUsage: () => ipcRenderer.invoke('get-weekly-usage'),
  getLimits:      () => ipcRenderer.invoke('get-limits'),
  setLimit:       (data) => ipcRenderer.invoke('set-limit', data),
  removeLimit:    (data) => ipcRenderer.invoke('remove-limit', data),
  getSessions:    () => ipcRenderer.invoke('get-sessions'),
  saveSession:    (session) => ipcRenderer.invoke('save-session', session),
  getStats:       () => ipcRenderer.invoke('get-stats'),

  // Window
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose:    () => ipcRenderer.invoke('window-close'),

  // Auto-updater
  onUpdateStatus: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('update-status', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('update-status', handler)
  },
  installUpdate: () => ipcRenderer.invoke('update-install'),
})