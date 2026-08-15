const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const classifier = require('./classifier')
const { buildExcludeClause } = require('./blocklist')

let db = null
let dbPath = null
let SQL = null
const knownAppsCache = new Set()

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
      last_notified_date TEXT DEFAULT '',
      category TEXT DEFAULT 'Other'
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      start_time INTEGER,
      end_time INTEGER,
      duration_seconds INTEGER,
      completed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS known_apps (
      app_name TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'Other',
      user_overridden INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      date TEXT NOT NULL,
      focused_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON app_sessions(date);
    CREATE INDEX IF NOT EXISTS idx_sessions_app  ON app_sessions(app_name);

    CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_log(date);
    CREATE INDEX IF NOT EXISTS idx_usage_app ON usage_log(app_name);
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(timestamp);
  `)

  // Migrations for existing DBs
  const migrations = [
    `ALTER TABLE app_limits ADD COLUMN last_notified_date TEXT DEFAULT ''`,
    `ALTER TABLE app_limits ADD COLUMN category TEXT DEFAULT 'Other'`,
    `ALTER TABLE app_limits ADD COLUMN kill_on_exceeded INTEGER DEFAULT 1`,
    `ALTER TABLE app_limits ADD COLUMN snooze_until INTEGER DEFAULT 0`,
    `ALTER TABLE app_limits ADD COLUMN notified_lo INTEGER DEFAULT 0`,
    `ALTER TABLE app_limits ADD COLUMN notified_hi INTEGER DEFAULT 0`,
  ]
  for (const sql of migrations) {
    try { db.run(sql) } catch (e) { /* already exists */ }
  }

  // Populate in-memory cache of known apps
  const existingKnown = query('SELECT app_name FROM known_apps')
  for (const r of existingKnown) knownAppsCache.add(r.app_name.toLowerCase())

  setInterval(persist, 30000)
  // Reset notification flags at midnight daily
  setInterval(resetDailyNotifications, 60 * 1000)
  resetDailyNotifications()
}

function today() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

// Resets warn/exceeded flags for any app whose last_notified_date != today
function resetDailyNotifications() {
  if (!db) return
  try {
    db.run(
      `UPDATE app_limits SET
        notified_warn = 0, notified_exceeded = 0,
        notified_lo = 0, notified_hi = 0,
        snooze_until = 0,
        last_notified_date = ?
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

function recordUsage(appName, durationSeconds = 5) {
  const key = appName.toLowerCase()
  if (!knownAppsCache.has(key)) {
    const category = classifier.guessCategory(appName)
    run('INSERT OR IGNORE INTO known_apps (app_name, category, user_overridden) VALUES (?, ?, 0)',
      [appName, category])
    knownAppsCache.add(key)
  }
  run('INSERT INTO usage_log (app_name, date, timestamp, duration_seconds) VALUES (?, ?, ?, ?)',
    [appName, today(), Date.now(), durationSeconds])
}

function recordAppFocus(appName) {
  run('INSERT INTO app_sessions (app_name, date, focused_at) VALUES (?, ?, ?)',
    [appName, today(), Date.now()])
}

function getTodayUsage() {
  return query(`
    SELECT app_name, SUM(duration_seconds) as total_seconds
    FROM usage_log
    WHERE date = ? AND ${buildExcludeClause('app_name')}
    GROUP BY app_name
    ORDER BY total_seconds DESC
    LIMIT 6
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
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const year  = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day   = String(d.getDate()).padStart(2, '0')
    days.push(`${year}-${month}-${day}`)
  }

  const rows = query(`
    SELECT date, SUM(duration_seconds) as total_seconds
    FROM usage_log
    WHERE date >= ? AND ${buildExcludeClause('app_name')}
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
      limit_seconds:      Number(l.limit_seconds),
      is_productive:      Number(l.is_productive),
      notified_warn:      Number(l.notified_warn),
      notified_exceeded:  Number(l.notified_exceeded),
      notified_lo:        Number(l.notified_lo || 0),
      notified_hi:        Number(l.notified_hi || 0),
      kill_on_exceeded:   l.kill_on_exceeded === undefined ? 1 : Number(l.kill_on_exceeded),
      snooze_until:       Number(l.snooze_until || 0),
      used_seconds:       used ? Number(used.total_seconds) : 0
    }
  })
}

function setLimit(app_name, limit_seconds, is_productive = 0, category = 'Other', kill_on_exceeded = 1) {
  run(`
    INSERT INTO app_limits (app_name, limit_seconds, is_productive, last_notified_date, category, kill_on_exceeded)
    VALUES (?, ?, ?, '', ?, ?)
    ON CONFLICT(app_name) DO UPDATE SET
      limit_seconds = excluded.limit_seconds,
      is_productive = excluded.is_productive,
      category = excluded.category,
      kill_on_exceeded = excluded.kill_on_exceeded
  `, [app_name, limit_seconds, is_productive ? 1 : 0, category, kill_on_exceeded ? 1 : 0])
  // User explicitly set category — lock it in known_apps
  run(`INSERT INTO known_apps (app_name, category, user_overridden) VALUES (?, ?, 1)
       ON CONFLICT(app_name) DO UPDATE SET category = excluded.category, user_overridden = 1`,
    [app_name, category])
  knownAppsCache.add(app_name.toLowerCase())
  return { ok: true }
}

function snoozeApp(app_name, minutes) {
  const snoozeUntil = Date.now() + minutes * 60 * 1000
  run('UPDATE app_limits SET snooze_until = ? WHERE app_name = ?', [snoozeUntil, app_name])
  return { ok: true }
}

function updateAppKillToggle(app_name, kill_on_exceeded) {
  run('UPDATE app_limits SET kill_on_exceeded = ? WHERE app_name = ?', [kill_on_exceeded ? 1 : 0, app_name])
  return { ok: true }
}

function removeLimit(app_name) {
  run('DELETE FROM app_limits WHERE app_name = ?', [app_name])
  return { ok: true }
}

function markNotified(app_name, type) {
  const colMap = {
    'exceeded': 'notified_exceeded',
    'warn':     'notified_warn',
    'lo':       'notified_lo',
    'hi':       'notified_hi',
  }
  const col = colMap[type] || 'notified_warn'
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

  const todayRows = query(`SELECT SUM(duration_seconds) as total FROM usage_log WHERE date = ? AND ${buildExcludeClause('app_name')}`, [today()])
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

function getSetting(key, defaultVal = null) {
  const rows = query('SELECT value FROM settings WHERE key = ?', [key])
  return rows.length ? rows[0].value : defaultVal
}

function saveSetting(key, value) {
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)]
  )
  return { ok: true }
}

function getAllSettings() {
  const defaults = {
    poll_interval: '5000',
    startup_launch: 'true',
    notify_enabled: 'true',
    notify_warn_pct: '0.8',
    data_retention_days: '90',
    grace_period_mins: '0',
    warn_step_lo: 'false',
    warn_step_hi: 'true',
    daily_goal_seconds: '21600',
  }
  const rows = query('SELECT key, value FROM settings')
  const stored = {}
  for (const row of rows) stored[row.key] = row.value
  return { ...defaults, ...stored }
}

function exportUsageData(days = 30) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffDate = cutoff.toISOString().slice(0, 10)
  return query(`
    SELECT app_name, date, SUM(duration_seconds) as total_seconds
    FROM usage_log
    WHERE date >= ?
    GROUP BY app_name, date
    ORDER BY date DESC, total_seconds DESC
  `, [cutoffDate])
}

function deleteOldData(retentionDays) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - Number(retentionDays))
  const cutoffDate = cutoff.toISOString().slice(0, 10)
  run('DELETE FROM usage_log WHERE date < ?', [cutoffDate])
  return { ok: true }
}

function getCategoryBreakdown() {
  return query(`
    SELECT
      COALESCE(al.category, ka.category, 'Other') AS category,
      SUM(ul.duration_seconds) AS total_seconds
    FROM usage_log ul
    LEFT JOIN known_apps ka ON LOWER(ul.app_name) = LOWER(ka.app_name)
    LEFT JOIN app_limits al ON LOWER(ul.app_name) = LOWER(al.app_name)
    WHERE ul.date = ? AND ${buildExcludeClause('ul.app_name')}
    GROUP BY COALESCE(al.category, ka.category, 'Other')
    ORDER BY total_seconds DESC
  `, [today()])
}

function getProductivityScore() {
  const totalRows = query(`SELECT SUM(duration_seconds) AS total FROM usage_log WHERE date = ? AND ${buildExcludeClause('app_name')}`, [today()])
  const total = totalRows[0]?.total || 0

  const prodRows = query(`
    SELECT SUM(ul.duration_seconds) AS total
    FROM usage_log ul
    JOIN app_limits al ON LOWER(ul.app_name) = LOWER(al.app_name)
    WHERE ul.date = ? AND al.is_productive = 1
  `, [today()])
  const productive = prodRows[0]?.total || 0

  const score = Number(total) > 0 ? Math.round((Number(productive) / Number(total)) * 100) : 0
  return { score, productive_seconds: Number(productive), total_seconds: Number(total) }
}

function getStreak() {
  const rows = query(`
    SELECT DISTINCT date FROM usage_log
    WHERE date < ?
    ORDER BY date DESC
    LIMIT 60
  `, [today()])

  if (!rows.length) return 0

  let streak = 0
  const check = new Date()
  check.setDate(check.getDate() - 1)

  for (const row of rows) {
    const expected = check.toISOString().slice(0, 10)
    if (row.date === expected) {
      streak++
      check.setDate(check.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

function getAppTrends() {
  const compare = new Date()
  compare.setDate(compare.getDate() - 7)
  const compareDate = compare.toISOString().slice(0, 10)

  const todayRows = query(`
    SELECT app_name, SUM(duration_seconds) AS secs
    FROM usage_log WHERE date = ?
    GROUP BY app_name
  `, [today()])

  const priorRows = query(`
    SELECT app_name, SUM(duration_seconds) AS secs
    FROM usage_log WHERE date = ?
    GROUP BY app_name
  `, [compareDate])

  const priorMap = {}
  for (const r of priorRows) priorMap[r.app_name] = Number(r.secs)

  const result = {}
  for (const r of todayRows) {
    if (priorMap[r.app_name] !== undefined) {
      result[r.app_name] = Number(r.secs) - priorMap[r.app_name]
    }
  }
  return result
}

function getUsageCalendar(days = 84) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days + 1)
  const cutoffDate = cutoff.toISOString().slice(0, 10)

  const rows = query(`
    SELECT date, SUM(duration_seconds) AS total_seconds
    FROM usage_log
    WHERE date >= ? AND date <= ?
    GROUP BY date
  `, [cutoffDate, today()])

  const rowMap = {}
  for (const r of rows) rowMap[r.date] = Number(r.total_seconds)

  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    result.push({ date: dateStr, total_seconds: rowMap[dateStr] || 0 })
  }
  return result
}

function getAppUsageDetailed() {
  return query(`
    SELECT
      u.app_name,
      SUM(u.duration_seconds) AS total_seconds,
      COALESCE(s.open_count, 0) AS open_count,
      COALESCE(ka.category, 'Other') AS category
    FROM usage_log u
    LEFT JOIN (
      SELECT app_name, COUNT(*) AS open_count
      FROM app_sessions
      WHERE date = ?
      GROUP BY app_name
    ) s ON LOWER(u.app_name) = LOWER(s.app_name)
    LEFT JOIN known_apps ka ON LOWER(u.app_name) = LOWER(ka.app_name)
    WHERE u.date = ? AND ${buildExcludeClause('u.app_name')}
    GROUP BY u.app_name
    ORDER BY total_seconds DESC
  `, [today(), today()])
}

function buildLocalDays(n) {
  const days = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const year  = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day   = String(d.getDate()).padStart(2, '0')
    days.push(`${year}-${month}-${day}`)
  }
  return days
}

function getDayBounds() {
  const rows = query(
    'SELECT MIN(focused_at) as first_ts, MAX(focused_at) as last_ts FROM app_sessions WHERE date = ?',
    [today()]
  )
  return {
    first_ts: rows[0]?.first_ts ? Number(rows[0].first_ts) : 0,
    last_ts:  rows[0]?.last_ts  ? Number(rows[0].last_ts)  : 0,
  }
}

function getLongestFocusBlock() {
  const sessions = query(
    'SELECT app_name, focused_at FROM app_sessions WHERE date = ? ORDER BY focused_at ASC',
    [today()]
  )
  if (sessions.length < 2) return null
  let best = null
  for (let i = 0; i < sessions.length - 1; i++) {
    const dur = Number(sessions[i + 1].focused_at) - Number(sessions[i].focused_at)
    if (!best || dur > best.duration_ms) {
      best = { app_name: sessions[i].app_name, duration_ms: dur }
    }
  }
  return best
}

function getWeekComparison() {
  const thisDays = buildLocalDays(7)
  const allDays  = buildLocalDays(14)
  const lastWeekStart  = allDays[0]
  const thisWeekStart  = thisDays[0]

  const thisRows = query(
    `SELECT SUM(duration_seconds) as total FROM usage_log WHERE date >= ? AND ${buildExcludeClause('app_name')}`,
    [thisWeekStart]
  )
  const lastRows = query(
    `SELECT SUM(duration_seconds) as total FROM usage_log WHERE date >= ? AND date < ? AND ${buildExcludeClause('app_name')}`,
    [lastWeekStart, thisWeekStart]
  )
  const sameDayRows = query(
    `SELECT SUM(duration_seconds) as total FROM usage_log WHERE date = ? AND ${buildExcludeClause('app_name')}`,
    [allDays[6]]
  )

  return {
    this_week_seconds:          Number(thisRows[0]?.total || 0),
    last_week_seconds:          Number(lastRows[0]?.total || 0),
    same_day_last_week_seconds: Number(sameDayRows[0]?.total || 0),
  }
}

function getWeeklyHeatmap() {
  const days = buildLocalDays(7)

  const rows = query(`
    SELECT date, timestamp, duration_seconds FROM usage_log
    WHERE date >= ? AND ${buildExcludeClause('app_name')}
    ORDER BY timestamp ASC
  `, [days[0]])

  const dateIndex = {}
  days.forEach((d, i) => { dateIndex[d] = i })

  const matrix = days.map(() => new Array(24).fill(0))
  for (const row of rows) {
    const dayIdx = dateIndex[row.date]
    if (dayIdx === undefined) continue
    const hour = new Date(Number(row.timestamp)).getHours()
    matrix[dayIdx][hour] += Number(row.duration_seconds)
  }

  return { days, matrix }
}

function getWeeklyTopApps() {
  const days = buildLocalDays(7)
  return query(`
    SELECT app_name, SUM(duration_seconds) as total_seconds, COUNT(DISTINCT date) as days_active
    FROM usage_log
    WHERE date >= ? AND ${buildExcludeClause('app_name')}
    GROUP BY app_name
    ORDER BY total_seconds DESC
    LIMIT 8
  `, [days[0]])
}

function setAppCategory(app_name, category) {
  run(`INSERT INTO known_apps (app_name, category, user_overridden) VALUES (?, ?, 1)
       ON CONFLICT(app_name) DO UPDATE SET category = excluded.category, user_overridden = 1`,
    [app_name, category])
  run(`UPDATE app_limits SET category = ? WHERE LOWER(app_name) = LOWER(?)`, [category, app_name])
  return { ok: true }
}

module.exports = {
  init, recordUsage, recordAppFocus, getTodayUsage, getHourlyUsage, getWeeklyUsage,
  getLimits, getLimitsWithUsage, setLimit, removeLimit, markNotified,
  getSessions, saveSession, getStats,
  getSetting, saveSetting, getAllSettings, exportUsageData, deleteOldData,
  snoozeApp, updateAppKillToggle,
  getCategoryBreakdown, getProductivityScore, getStreak, getAppTrends, getUsageCalendar,
  getAppUsageDetailed, setAppCategory,
  getDayBounds, getLongestFocusBlock, getWeekComparison, getWeeklyHeatmap, getWeeklyTopApps,
}