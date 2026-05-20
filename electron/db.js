const path = require('path')
const fs = require('fs')
const { app } = require('electron')

let db = null
let dbPath = null
let SQL = null

let persistTimer = null

function persist() {
  if (!db || !dbPath) return
  try {
    const data = db.export()
    fs.writeFileSync(dbPath, Buffer.from(data))
  } catch (e) {
    console.error('DB persist error:', e)
  }
}

function schedulePersist() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persist()
    persistTimer = null
  }, 2000)
}

async function init() {
  const initSqlJs = require('sql.js')
  SQL = await initSqlJs({ locateFile: () => path.join(__dirname, 'sql-wasm.wasm') })

  const userDataPath = app.getPath('userData')
  dbPath = path.join(userDataPath, 'wellbeing.db')

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      date TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      duration_seconds INTEGER DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS app_limits (
      app_name TEXT PRIMARY KEY,
      limit_seconds INTEGER NOT NULL,
      is_productive INTEGER DEFAULT 0,
      notified_warn INTEGER DEFAULT 0,
      notified_exceeded INTEGER DEFAULT 0,
      last_notified_date TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      start_time INTEGER,
      end_time INTEGER,
      duration_seconds INTEGER,
      completed INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_log(date);
    CREATE INDEX IF NOT EXISTS idx_usage_app ON usage_log(app_name);
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(timestamp);
  `)

  // Add last_notified_date column to existing DBs that don't have it
  try {
    db.run(`ALTER TABLE app_limits ADD COLUMN last_notified_date TEXT DEFAULT ''`)
  } catch (e) { /* column already exists, ignore */ }

  setInterval(persist, 30000)
  // Reset notification flags at midnight daily
  setInterval(resetDailyNotifications, 60 * 1000)
  resetDailyNotifications()
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// Resets warn/exceeded flags for any app whose last_notified_date != today
function resetDailyNotifications() {
  if (!db) return
  try {
    db.run(
      `UPDATE app_limits SET notified_warn = 0, notified_exceeded = 0, last_notified_date = ?
       WHERE last_notified_date != ?`,
      [today(), today()]
    )
    schedulePersist()
  } catch (e) {
    console.error('Reset notifications error:', e)
  }
}

function query(sql, params = []) {
  if (!db) return []
  try {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
  } catch (e) {
    console.error('DB query error:', e, sql)
    return []
  }
}

function run(sql, params = []) {
  if (!db) return
  try {
    db.run(sql, params)
    schedulePersist()
  } catch (e) {
    console.error('DB run error:', e, sql)
  }
}

function recordUsage(appName) {
  run('INSERT INTO usage_log (app_name, date, timestamp, duration_seconds) VALUES (?, ?, ?, 5)',
    [appName, today(), Date.now()])
}

function getTodayUsage() {
  return query(`
    SELECT app_name, SUM(duration_seconds) as total_seconds
    FROM usage_log
    WHERE date = ?
    GROUP BY app_name
    ORDER BY total_seconds DESC
    LIMIT 10
  `, [today()])
}

// Returns hourly breakdown for today using local timestamps
function getHourlyUsage() {
  const rows = query(`
    SELECT timestamp, duration_seconds
    FROM usage_log
    WHERE date = ?
  `, [today()])

  const hourly = new Array(24).fill(0)
  for (const row of rows) {
    const hour = new Date(Number(row.timestamp)).getHours()
    hourly[hour] += Number(row.duration_seconds)
  }
  return hourly  // array of 24 values (seconds per hour)
}

function getWeeklyUsage() {
  // Build last 7 days using local dates (not SQLite's UTC date())
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }

  const rows = query(`
    SELECT date, SUM(duration_seconds) as total_seconds
    FROM usage_log
    WHERE date >= ?
    GROUP BY date
  `, [days[0]])

  return days.map(dateStr => {
    const found = rows.find(r => r.date === dateStr)
    return { date: dateStr, total_seconds: found ? Number(found.total_seconds) : 0 }
  })
}

function getLimits() {
  return query('SELECT * FROM app_limits')
}

function getLimitsWithUsage() {
  const limits = query('SELECT * FROM app_limits')
  const usage = getTodayUsage()
  return limits.map(l => {
    const used = usage.find(u => u.app_name.toLowerCase() === l.app_name.toLowerCase())
    return {
      ...l,
      limit_seconds: Number(l.limit_seconds),
      is_productive: Number(l.is_productive),
      notified_warn: Number(l.notified_warn),
      notified_exceeded: Number(l.notified_exceeded),
      used_seconds: used ? Number(used.total_seconds) : 0
    }
  })
}

function setLimit(app_name, limit_seconds, is_productive = 0) {
  run(`
    INSERT INTO app_limits (app_name, limit_seconds, is_productive, last_notified_date)
    VALUES (?, ?, ?, '')
    ON CONFLICT(app_name) DO UPDATE SET
      limit_seconds = excluded.limit_seconds,
      is_productive = excluded.is_productive
  `, [app_name, limit_seconds, is_productive ? 1 : 0])
  return { ok: true }
}

function removeLimit(app_name) {
  run('DELETE FROM app_limits WHERE app_name = ?', [app_name])
  return { ok: true }
}

function markNotified(app_name, type) {
  const col = type === 'exceeded' ? 'notified_exceeded' : 'notified_warn'
  run(`UPDATE app_limits SET ${col} = 1, last_notified_date = ? WHERE app_name = ?`, [today(), app_name])
}

function getSessions() {
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  return query(`
    SELECT * FROM focus_sessions
    WHERE start_time >= ?
    ORDER BY start_time DESC
  `, [dayStart.getTime()])
}

function saveSession(session) {
  run(`
    INSERT INTO focus_sessions (label, start_time, end_time, duration_seconds, completed)
    VALUES (?, ?, ?, ?, ?)
  `, [session.label, session.start_time, session.end_time, session.duration_seconds, session.completed ? 1 : 0])
  return { ok: true }
}

function getStats() {
  if (!db) return {}

  const todayRows = query('SELECT SUM(duration_seconds) as total FROM usage_log WHERE date = ?', [today()])
  const todayTotal = todayRows[0]?.total || 0

  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  const weekRows = query(`SELECT SUM(duration_seconds) as total FROM usage_log WHERE date >= ?`, [days[0]])
  const weekDayRows = query(`SELECT COUNT(DISTINCT date) as days FROM usage_log WHERE date >= ?`, [days[0]])
  const weekTotal = weekRows[0]?.total || 0
  const weekDays = weekDayRows[0]?.days || 1
  const weekAvg = weekDays > 0 ? Math.round(weekTotal / weekDays) : 0

  const dayStart = new Date().setHours(0, 0, 0, 0)
  const focusRows = query(
    'SELECT SUM(duration_seconds) as total FROM focus_sessions WHERE start_time >= ? AND completed = 1',
    [dayStart]
  )
  const focusTotal = focusRows[0]?.total || 0

  const alertRows = query('SELECT COUNT(*) as cnt FROM app_limits WHERE notified_exceeded = 1 OR notified_warn = 1')
  const alertCnt = alertRows[0]?.cnt || 0

  return {
    today_seconds: Number(todayTotal),
    weekly_avg_seconds: Number(weekAvg),
    focus_today_seconds: Number(focusTotal),
    limit_alerts: Number(alertCnt)
  }
}

module.exports = {
  init, recordUsage, getTodayUsage, getHourlyUsage, getWeeklyUsage,
  getLimits, getLimitsWithUsage, setLimit, removeLimit, markNotified,
  getSessions, saveSession, getStats
}