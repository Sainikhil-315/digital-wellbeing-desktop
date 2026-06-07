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

  getSettings:          () => ipcRenderer.invoke('get-settings'),
  saveSetting:          (data) => ipcRenderer.invoke('save-setting', data),
  exportCsv:            () => ipcRenderer.invoke('export-csv'),
  snoozeApp:            (data) => ipcRenderer.invoke('snooze-app', data),
  updateAppKillToggle:  (data) => ipcRenderer.invoke('update-app-kill-toggle', data),

  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose:    () => ipcRenderer.invoke('window-close'),

  getAppUsageDetailed:  () => ipcRenderer.invoke('get-app-usage-detailed'),
  getAppIcon:           (data) => ipcRenderer.invoke('get-app-icon', data),
  setAppCategory:       (data) => ipcRenderer.invoke('set-app-category', data),
  getCategoryBreakdown: () => ipcRenderer.invoke('get-category-breakdown'),
  getProductivityScore: () => ipcRenderer.invoke('get-productivity-score'),
  getStreak:            () => ipcRenderer.invoke('get-streak'),
  getAppTrends:         () => ipcRenderer.invoke('get-app-trends'),
  getUsageCalendar:     (days) => ipcRenderer.invoke('get-usage-calendar', days),

  getDayBounds:      () => ipcRenderer.invoke('get-day-bounds'),
  getLongestFocus:   () => ipcRenderer.invoke('get-longest-focus'),
  getWeekComparison: () => ipcRenderer.invoke('get-week-comparison'),
  getWeeklyHeatmap:  () => ipcRenderer.invoke('get-weekly-heatmap'),
  getWeeklyTopApps:  () => ipcRenderer.invoke('get-weekly-top-apps'),

  onUpdateStatus: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  },
  installUpdate:  () => ipcRenderer.invoke('update-install'),
  openExternal:   (url) => ipcRenderer.invoke('open-external', url),
})