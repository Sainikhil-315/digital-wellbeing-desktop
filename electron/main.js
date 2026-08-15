const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')
const iconResolver = require('./iconResolver')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Force same userData path in dev as prod so both share the same DB
if (isDev) app.setName('Digital Wellbeing')

let mainWindow
let tray = null
let trackerInterval = null
const graceTimers = new Map() // appName → setTimeout id

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}


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

  let lastTrackedApp = null

  function startTrackerInterval(intervalMs) {
    if (trackerInterval) clearInterval(trackerInterval)
    const intervalSeconds = intervalMs / 1000
    trackerInterval = setInterval(() => {
      tracker.pollActiveWindow((appName) => {
        if (appName) {
          db.recordUsage(appName, intervalSeconds)
          if (appName !== lastTrackedApp) {
            db.recordAppFocus(appName)
            lastTrackedApp = appName
          }
          checkLimitAlerts(appName, db)
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
  graceTimers.forEach(timer => clearTimeout(timer))
  graceTimers.clear()
})

app.on('activate', () => {
  showWindow()
})

function checkLimitAlerts(appName, db) {
  const limits = db.getLimitsWithUsage()
  const limit = limits.find(l => l.app_name.toLowerCase() === appName.toLowerCase())
  if (!limit) return

  const settings = db.getAllSettings()
  if (settings.notify_enabled === 'false') return

  const pct = limit.used_seconds / limit.limit_seconds
  const now = Date.now()

  // --- 100% exceeded ---
  if (pct >= 1.0 && limit.notified_exceeded !== 1) {
    // Respect snooze
    if (limit.snooze_until > now) return

    db.markNotified(appName, 'exceeded')

    const limitMins = Math.round(limit.limit_seconds / 60)
    const shouldKill = limit.kill_on_exceeded !== 0  // per-app toggle
    const tracker = require('./tracker')
    const processName = tracker.getProcessNameFor(appName)
    const graceMins = parseInt(settings.grace_period_mins || '0')

    function showExceededDialog() {
      dialog.showMessageBox({
        type: 'warning',
        title: 'Daily Limit Reached',
        message: `Time's up for ${appName} today.`,
        detail: `You've used your full ${limitMins}m daily limit.\n\nCome back tomorrow — resets at midnight. Need more time? Update your limits in Digital Wellbeing.`,
        buttons: ['Got it', 'Snooze 15 min', 'Edit Limits'],
        defaultId: 0,
        cancelId: 0,
      }).then(({ response }) => {
        if (response === 1) db.snoozeApp(appName, 15)
        if (response === 2) showWindow()
      })
    }

    if (shouldKill && processName) {
      if (graceMins > 0 && !graceTimers.has(appName)) {
        // Grace period — warn, then kill after delay
        new Notification({
          title: `${appName} — Limit Reached`,
          body: `You have a ${graceMins}-minute grace period. Save your work — app closes soon.`
        }).show()
        const timer = setTimeout(() => {
          graceTimers.delete(appName)
          killProcess(processName)
          showExceededDialog()
        }, graceMins * 60 * 1000)
        graceTimers.set(appName, timer)
      } else if (!graceTimers.has(appName)) {
        // No grace — kill immediately
        killProcess(processName)
        showExceededDialog()
      }
    } else {
      // Soft limit — notify only, app stays open
      new Notification({
        title: `${appName} — Daily Limit Reached`,
        body: `Full ${limitMins}m used. Limit is set to notify-only so the app stays open.`
      }).show()
    }
    return
  }

  // --- Warning steps ---
  const remaining = Math.round((limit.limit_seconds - limit.used_seconds) / 60)

  // 95% warning (high)
  if (settings.warn_step_hi !== 'false' && pct >= 0.95 && limit.notified_hi !== 1) {
    db.markNotified(appName, 'hi')
    new Notification({
      title: `${appName} — 95% of limit used`,
      body: `Only ${remaining}m left for today.`
    }).show()
    return
  }

  // 80% warning (primary, from settings threshold)
  const warnPct = parseFloat(settings.notify_warn_pct || '0.8')
  if (pct >= warnPct && limit.notified_warn !== 1) {
    db.markNotified(appName, 'warn')
    new Notification({
      title: `${appName} — ${Math.round(pct * 100)}% of limit used`,
      body: `${remaining}m remaining for today.`
    }).show()
    return
  }

  // 50% warning (low)
  if (settings.warn_step_lo === 'true' && pct >= 0.5 && limit.notified_lo !== 1) {
    db.markNotified(appName, 'lo')
    new Notification({
      title: `${appName} — halfway through daily limit`,
      body: `${remaining}m remaining for today.`
    }).show()
  }
}

function killProcess(processName) {
  const killCmd = `Stop-Process -Name ${processName} -Force -ErrorAction SilentlyContinue`
  exec(`powershell -Command "${killCmd.replace(/"/g, '\\"')}"`, () => {})
}

function setupIPC(db, startTrackerInterval) {
  ipcMain.handle('get-today-usage',  () => db.getTodayUsage())
  ipcMain.handle('get-weekly-usage', () => db.getWeeklyUsage())
  ipcMain.handle('get-hourly-usage', () => db.getHourlyUsage())
  ipcMain.handle('get-limits',       () => db.getLimitsWithUsage())
  ipcMain.handle('set-limit', (_, { app_name, limit_seconds, is_productive, category, kill_on_exceeded }) =>
    db.setLimit(app_name, limit_seconds, is_productive, category, kill_on_exceeded))
  ipcMain.handle('remove-limit', (_, { app_name }) => {
    // Cancel any active grace timer for this app
    if (graceTimers.has(app_name)) {
      clearTimeout(graceTimers.get(app_name))
      graceTimers.delete(app_name)
    }
    return db.removeLimit(app_name)
  })
  ipcMain.handle('snooze-app', (_, { app_name, minutes }) => {
    // Cancel grace timer if active — snooze takes over
    if (graceTimers.has(app_name)) {
      clearTimeout(graceTimers.get(app_name))
      graceTimers.delete(app_name)
    }
    return db.snoozeApp(app_name, minutes || 15)
  })
  ipcMain.handle('update-app-kill-toggle', (_, { app_name, kill_on_exceeded }) =>
    db.updateAppKillToggle(app_name, kill_on_exceeded))
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
    app.isQuitting = true
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('get-app-usage-detailed', () => db.getAppUsageDetailed())
  ipcMain.handle('get-app-icon', async (_, { app_name, process_name }) => {
    const tracker = require('./tracker')
    const procName = process_name || tracker.getProcessNameFor(app_name)
    return iconResolver.resolveIcon(app_name, procName)
  })
  ipcMain.handle('get-category-breakdown', () => db.getCategoryBreakdown())
  ipcMain.handle('get-productivity-score',  () => db.getProductivityScore())
  ipcMain.handle('get-streak',              () => db.getStreak())
  ipcMain.handle('get-app-trends',          () => db.getAppTrends())
  ipcMain.handle('get-usage-calendar',      (_, days) => db.getUsageCalendar(days || 365))

  ipcMain.handle('open-external',       (_, url) => shell.openExternal(url))

  ipcMain.handle('get-day-bounds',      () => db.getDayBounds())
  ipcMain.handle('get-longest-focus',   () => db.getLongestFocusBlock())
  ipcMain.handle('get-week-comparison', () => db.getWeekComparison())
  ipcMain.handle('get-weekly-heatmap',  () => db.getWeeklyHeatmap())
  ipcMain.handle('get-weekly-top-apps', () => db.getWeeklyTopApps())
  ipcMain.handle('get-report-data', (_, rangeKey) => db.getReportData(rangeKey))
  ipcMain.handle('set-app-category', (_, { app_name, category }) => db.setAppCategory(app_name, category))
}