const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow
let tray = null
let trackerInterval = null
let focusModeActive = false
let whitelistedApps = []
let focusModeInterval = null


function setupAutoUpdater() {
  if (isDev) return
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-status', { status: 'available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-status', { status: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-status', { status: 'ready', version: info.version })
    new Notification({
      title: 'Update Ready',
      body: `Digital Wellbeing ${info.version} downloaded. Relaunch to apply.`
    }).show()
  })
  autoUpdater.on('error', (err) => { console.error('Updater error:', err) })

  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0D0D0D',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function showWindow() {
  if (!mainWindow) createWindow()
  mainWindow.show()
  mainWindow.focus()
}

app.whenReady().then(async () => {
  const db = require('./db')
  await db.init()
  const tracker = require('./tracker')

  const settings = db.getAllSettings()

  // Auto-launch on Windows login (respects user setting)
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: settings.startup_launch === 'true',
      openAsHidden: true
    })
  }

  createWindow()

  // Hide window if auto-launched at login
  if (process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden) {
    mainWindow.hide()
  }

  // System tray
  const iconPath = path.join(__dirname, '../assets/tray-icon.png')
  tray = new Tray(iconPath)
  tray.setToolTip('Digital Wellbeing')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Digital Wellbeing', click: showWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } }
  ]))
  tray.on('double-click', showWindow)

  setupAutoUpdater()

  function startTrackerInterval(intervalMs) {
    if (trackerInterval) clearInterval(trackerInterval)
    trackerInterval = setInterval(() => {
      tracker.pollActiveWindow((appName) => {
        if (appName) {
          db.recordUsage(appName)
          const currentSettings = db.getAllSettings()
          if (currentSettings.notify_enabled !== 'false') {
            checkLimitAlerts(appName, db, parseFloat(currentSettings.notify_warn_pct || '0.8'))
          }
        }
      })
    }, intervalMs)
  }

  startTrackerInterval(parseInt(settings.poll_interval || '5000'))

  // Clean up old data on startup based on retention setting
  db.deleteOldData(parseInt(settings.data_retention_days || '90'))

  setupIPC(db, startTrackerInterval)
})

app.on('window-all-closed', () => {
  // Keep running in tray — tracking continues in background
})

app.on('before-quit', () => {
  if (trackerInterval) clearInterval(trackerInterval)
})

app.on('activate', () => {
  showWindow()
})

function checkLimitAlerts(appName, db, warnPct = 0.8) {
  const limits = db.getLimitsWithUsage()
  const limit = limits.find(l => l.app_name.toLowerCase() === appName.toLowerCase())
  if (!limit) return

  const pct = limit.used_seconds / limit.limit_seconds
  if (pct >= 1.0 && limit.notified_exceeded !== 1) {
    db.markNotified(appName, 'exceeded')

    const limitMins = Math.round(limit.limit_seconds / 60)
    const shouldKill = db.getSetting('kill_on_exceeded', 'true') === 'true'
    const tracker = require('./tracker')
    const processName = tracker.getProcessNameFor(appName)

    if (shouldKill && processName) {
      // Kill first, then show blocking dialog
      killProcess(processName)
      dialog.showMessageBox({
        type: 'warning',
        title: 'Daily Limit Reached',
        message: `Time's up for ${appName} today.`,
        detail: `You've used your full ${limitMins}m daily limit for ${appName}.\n\nCome back tomorrow — your session resets at midnight. Want more time? You can always update your limits in Digital Wellbeing.`,
        buttons: ['Got it', 'Edit Limits'],
        defaultId: 0,
        cancelId: 0,
      }).then(({ response }) => {
        if (response === 1) showWindow()
      })
    } else {
      // Soft mode — notify only, app keeps running
      new Notification({
        title: `${appName} — Daily Limit Reached`,
        body: `You've used your full ${limitMins}m for today. The app is still open — disable "close on exceeded" in Settings.`
      }).show()
    }
  } else if (pct >= warnPct && limit.notified_warn !== 1) {
    db.markNotified(appName, 'warn')
    new Notification({
      title: `${appName} — ${Math.round(pct * 100)}% of daily limit used`,
      body: `You have ${Math.round((limit.limit_seconds - limit.used_seconds) / 60)}m left for today.`
    }).show()
  }
}

function killProcess(processName) {
  const killCmd = `Stop-Process -Name ${processName} -Force -ErrorAction SilentlyContinue`
  exec(`powershell -Command "${killCmd.replace(/"/g, '\\"')}"`, () => {})
}

function killNonWhitelistedApps() {
  const tracker = require('./tracker')
  const allApps = tracker.getAllKnownApps() // { processName: displayName }
  Object.entries(allApps).forEach(([processName, displayName]) => {
    if (whitelistedApps.includes(displayName) || displayName === 'File Explorer') return
    killProcess(processName)
  })
}

function monitorForBlockedApps() {
  if (!focusModeActive) return
  const tracker = require('./tracker')
  const allApps = tracker.getAllKnownApps()
  Object.entries(allApps).forEach(([processName, displayName]) => {
    if (whitelistedApps.includes(displayName) || displayName === 'File Explorer') return
    killProcess(processName)
  })
}

function setupIPC(db, startTrackerInterval) {
  ipcMain.handle('get-today-usage',  () => db.getTodayUsage())
  ipcMain.handle('get-weekly-usage', () => db.getWeeklyUsage())
  ipcMain.handle('get-hourly-usage', () => db.getHourlyUsage())
  ipcMain.handle('get-limits',       () => db.getLimitsWithUsage())
  ipcMain.handle('set-limit',   (_, { app_name, limit_seconds, is_productive, category }) =>
    db.setLimit(app_name, limit_seconds, is_productive, category))
  ipcMain.handle('remove-limit', (_, { app_name }) => db.removeLimit(app_name))
  ipcMain.handle('get-sessions', () => db.getSessions())
  ipcMain.handle('save-session', (_, session) => db.saveSession(session))
  ipcMain.handle('get-stats',    () => db.getStats())

  // Settings
  ipcMain.handle('get-settings', () => db.getAllSettings())
  ipcMain.handle('save-setting', (_, { key, value }) => {
    db.saveSetting(key, value)
    if (key === 'poll_interval') {
      startTrackerInterval(parseInt(value) || 5000)
    }
    if (key === 'startup_launch' && process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: value === 'true', openAsHidden: true })
    }
    if (key === 'data_retention_days') {
      db.deleteOldData(parseInt(value) || 90)
    }
    return { ok: true }
  })

  // CSV Export
  ipcMain.handle('export-csv', async () => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `digital-wellbeing-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
    if (!filePath) return { ok: false, cancelled: true }
    const rows = db.exportUsageData(30)
    const header = 'App Name,Date,Total Minutes\n'
    const csv = header + rows.map(r =>
      `"${r.app_name}",${r.date},${Math.round(Number(r.total_seconds) / 60)}`
    ).join('\n')
    fs.writeFileSync(filePath, csv, 'utf8')
    return { ok: true, path: filePath }
  })

  ipcMain.handle('window-minimize', () => mainWindow?.minimize())
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window-close', () => mainWindow?.hide())

  ipcMain.handle('update-install', () => {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.quitAndInstall()
  })

  // Focus mode handlers
  ipcMain.handle('start-focus-mode', (_, { apps }) => {
    focusModeActive = true
    whitelistedApps = apps
    killNonWhitelistedApps()
    
    // Monitor for blocked app attempts every 1 second (aggressive blocking)
    if (focusModeInterval) clearInterval(focusModeInterval)
    focusModeInterval = setInterval(monitorForBlockedApps, 1000)
    
    return true
  })

  ipcMain.handle('stop-focus-mode', () => {
    focusModeActive = false
    whitelistedApps = []
    if (focusModeInterval) {
      clearInterval(focusModeInterval)
      focusModeInterval = null
    }
    return true
  })
}