const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getTodayUsage:   () => ipcRenderer.invoke('get-today-usage'),
  getWeeklyUsage:  () => ipcRenderer.invoke('get-weekly-usage'),
  getHourlyUsage:  () => ipcRenderer.invoke('get-hourly-usage'),
  getLimits:       () => ipcRenderer.invoke('get-limits'),
  setLimit:        (data) => ipcRenderer.invoke('set-limit', data),
  removeLimit:     (data) => ipcRenderer.invoke('remove-limit', data),
  getSessions:     () => ipcRenderer.invoke('get-sessions'),
  saveSession:     (session) => ipcRenderer.invoke('save-session', session),
  getStats:        () => ipcRenderer.invoke('get-stats'),

  getSettings:     () => ipcRenderer.invoke('get-settings'),
  saveSetting:     (data) => ipcRenderer.invoke('save-setting', data),
  exportCsv:       () => ipcRenderer.invoke('export-csv'),

  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose:    () => ipcRenderer.invoke('window-close'),

  startFocusMode: (apps) => ipcRenderer.invoke('start-focus-mode', { apps }),
  stopFocusMode:  () => ipcRenderer.invoke('stop-focus-mode'),

  onUpdateStatus: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  },
  installUpdate: () => ipcRenderer.invoke('update-install'),
})