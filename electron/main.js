const { app, BrowserWindow, ipcMain, Notification } = require('electron')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow
let trackerInterval = null

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

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  const db = require('./db')
  await db.init()
  const tracker = require('./tracker')

  createWindow()
  setupAutoUpdater()

  trackerInterval = setInterval(() => {
    tracker.pollActiveWindow((appName) => {
      if (appName) {
        db.recordUsage(appName)
        checkLimitAlerts(appName, db)
      }
    })
  }, 5000)

  setupIPC(db)
})

app.on('window-all-closed', () => {
  if (trackerInterval) clearInterval(trackerInterval)
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

function checkLimitAlerts(appName, db) {
  const limits = db.getLimitsWithUsage()  // use the one that already has used_seconds
  const limit = limits.find(l => l.app_name.toLowerCase() === appName.toLowerCase())
  if (!limit) return

  const pct = limit.used_seconds / limit.limit_seconds
  // Explicit integer comparison — sql.js returns 0/1 not booleans
  if (pct >= 1.0 && limit.notified_exceeded !== 1) {
    db.markNotified(appName, 'exceeded')
    new Notification({
      title: 'Limit Exceeded',
      body: `${appName} has exceeded your daily limit of ${Math.round(limit.limit_seconds / 60)}m`
    }).show()
  } else if (pct >= 0.8 && limit.notified_warn !== 1) {
    db.markNotified(appName, 'warn')
    new Notification({
      title: 'Approaching Limit',
      body: `${appName} is at ${Math.round(pct * 100)}% of your daily limit`
    }).show()
  }
}

function setupIPC(db) {
  ipcMain.handle('get-today-usage',  () => db.getTodayUsage())
  ipcMain.handle('get-weekly-usage', () => db.getWeeklyUsage())
  ipcMain.handle('get-hourly-usage', () => db.getHourlyUsage())
  ipcMain.handle('get-limits',       () => db.getLimitsWithUsage())
  ipcMain.handle('set-limit',   (_, { app_name, limit_seconds, is_productive }) =>
    db.setLimit(app_name, limit_seconds, is_productive))
  ipcMain.handle('remove-limit', (_, { app_name }) => db.removeLimit(app_name))
  ipcMain.handle('get-sessions', () => db.getSessions())
  ipcMain.handle('save-session', (_, session) => db.saveSession(session))
  ipcMain.handle('get-stats',    () => db.getStats())

  ipcMain.handle('window-minimize', () => mainWindow?.minimize())
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window-close', () => mainWindow?.close())

  ipcMain.handle('update-install', () => {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.quitAndInstall()
  })
}