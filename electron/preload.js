const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getTodayUsage:  () => ipcRenderer.invoke('get-today-usage'),
  getWeeklyUsage: () => ipcRenderer.invoke('get-weekly-usage'),
  getLimits:      () => ipcRenderer.invoke('get-limits'),
  setLimit:       (data) => ipcRenderer.invoke('set-limit', data),
  removeLimit:    (data) => ipcRenderer.invoke('remove-limit', data),
  getSessions:    () => ipcRenderer.invoke('get-sessions'),
  saveSession:    (session) => ipcRenderer.invoke('save-session', session),
  getStats:       () => ipcRenderer.invoke('get-stats'),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose:    () => ipcRenderer.invoke('window-close'),
})
