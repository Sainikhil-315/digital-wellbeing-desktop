const { app, BrowserWindow, ipcMain, Notification, powerMonitor } = require('electron')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow
let trackerInterval = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0D0D0D',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.removeMenu()

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  // Lazy-load db and tracker after app is ready
  const db = require('./db')
  await db.init()

  const tracker = require('./tracker')

  createWindow()

  // Poll active window every 5 seconds
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
  const limits = db.getLimits()
  const todayUsage = db.getTodayUsage()
  const limit = limits.find(l => l.app_name.toLowerCase() === appName.toLowerCase())
  if (!limit) return

  const used = todayUsage.find(u => u.app_name.toLowerCase() === appName.toLowerCase())
  if (!used) return

  const pct = used.total_seconds / limit.limit_seconds
  if (pct >= 1.0 && !limit._notifiedExceeded) {
    db.markNotified(appName, 'exceeded')
    new Notification({
      title: 'Limit Exceeded',
      body: `${appName} has exceeded your daily limit of ${Math.round(limit.limit_seconds / 60)}m`
    }).show()
  } else if (pct >= 0.8 && !limit._notifiedWarn) {
    db.markNotified(appName, 'warn')
    new Notification({
      title: 'Approaching Limit',
      body: `${appName} is at ${Math.round(pct * 100)}% of your daily limit`
    }).show()
  }
}

function setupIPC(db) {
  ipcMain.handle('get-today-usage', () => db.getTodayUsage())
  ipcMain.handle('get-weekly-usage', () => db.getWeeklyUsage())
  ipcMain.handle('get-limits', () => db.getLimitsWithUsage())
  ipcMain.handle('set-limit', (_, { app_name, limit_seconds, is_productive }) =>
    db.setLimit(app_name, limit_seconds, is_productive))
  ipcMain.handle('remove-limit', (_, { app_name }) => db.removeLimit(app_name))
  ipcMain.handle('get-sessions', () => db.getSessions())
  ipcMain.handle('save-session', (_, session) => db.saveSession(session))
  ipcMain.handle('get-stats', () => db.getStats())
  ipcMain.handle('window-minimize', () => mainWindow?.minimize())
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window-close', () => mainWindow?.close())
}
