import { useState, useEffect, useRef } from 'react'
import { IconFlame, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { CATEGORY_COLORS, catColor } from '../categoryColors.js'
import './Dashboard.css'

function fmtSeconds(s) {
  if (!s) return '0m'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtMs(ms) {
  if (!ms || ms < 60000) return '<1m'
  const totalMins = Math.floor(ms / 60000)
  const hh = Math.floor(totalMins / 60)
  const mm = totalMins % 60
  return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`
}

function getDayStatus(totalSeconds, goalSeconds) {
  if (totalSeconds === 0) return 'dot-empty'
  if (totalSeconds < goalSeconds) return 'dot-good'
  if (totalSeconds < goalSeconds * 1.2) return 'dot-warn'
  return 'dot-bad'
}

function buildMonthGrid(year, month, dataMap, todayStr) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      day: d,
      date: dateStr,
      total_seconds: dataMap[dateStr] || 0,
      isFuture: dateStr > todayStr,
      isToday: dateStr === todayStr,
    })
  }
  return cells
}

export default function Dashboard({ api, refreshKey }) {
  const [stats, setStats] = useState(null)
  const [usage, setUsage] = useState([])
  const [hourly, setHourly] = useState(new Array(24).fill(0))
  const [categoryBreakdown, setCategoryBreakdown] = useState([])
  const [productivityScore, setProductivityScore] = useState(null)
  const [appTrends, setAppTrends] = useState({})
  const [calendarData, setCalendarData] = useState([])
  const [goalSeconds, setGoalSeconds] = useState(21600)
  const [streak, setStreak] = useState(0)
  const [dayBounds, setDayBounds] = useState({ first_ts: 0, last_ts: 0 })
  const [longestFocus, setLongestFocus] = useState(null)
  const [weekComparison, setWeekComparison] = useState(null)
  const [loading, setLoading] = useState(true)
  const hourlyRef = useRef(null)
  const pieRef = useRef(null)
  const [hoveredSlice, setHoveredSlice] = useState(null)

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const [calMonth, setCalMonth] = useState({ year: now.getFullYear(), month: now.getMonth() })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [s, u, h, cat, prod, trends, cal, settings, strk, bounds, longest, weekComp] = await Promise.all([
          api.getStats(),
          api.getTodayUsage(),
          api.getHourlyUsage ? api.getHourlyUsage() : Promise.resolve(new Array(24).fill(0)),
          api.getCategoryBreakdown ? api.getCategoryBreakdown() : Promise.resolve([]),
          api.getProductivityScore ? api.getProductivityScore() : Promise.resolve({ score: 0 }),
          api.getAppTrends ? api.getAppTrends() : Promise.resolve({}),
          api.getUsageCalendar ? api.getUsageCalendar(365) : Promise.resolve([]),
          api.getSettings ? api.getSettings() : Promise.resolve({}),
          api.getStreak ? api.getStreak() : Promise.resolve(0),
          api.getDayBounds ? api.getDayBounds() : Promise.resolve({ first_ts: 0, last_ts: 0 }),
          api.getLongestFocus ? api.getLongestFocus() : Promise.resolve(null),
          api.getWeekComparison ? api.getWeekComparison() : Promise.resolve(null),
        ])
        if (!cancelled) {
          setStats(s)
          setUsage(u)
          setHourly(h || new Array(24).fill(0))
          setCategoryBreakdown(cat || [])
          setProductivityScore(prod)
          setAppTrends(trends || {})
          setCalendarData(cal || [])
          setGoalSeconds(parseInt(settings?.daily_goal_seconds || '21600'))
          setStreak(strk || 0)
          setDayBounds(bounds || { first_ts: 0, last_ts: 0 })
          setLongestFocus(longest || null)
          setWeekComparison(weekComp || null)
        }
      } catch(e) {}
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey])

  useEffect(() => {
    const canvas = hourlyRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    ctx.clearRect(0, 0, w, h)

    const rootStyle = getComputedStyle(document.documentElement)
    const mutedColor = rootStyle.getPropertyValue('--text-muted').trim() || '#48455A'
    const gridColor = rootStyle.getPropertyValue('--border-bright').trim() || 'rgba(255,255,255,0.05)'
    const emptyFill = rootStyle.getPropertyValue('--bg-hover').trim() || 'rgba(255,255,255,0.04)'

    const yAxisW = 36
    const xAxisH = 14
    const topPad = 10
    const chartH = h - xAxisH - topPad
    const chartW = w - yAxisW
    const maxV = 3600  // fixed 0–60 min scale
    const barW = (chartW / 24) - 2
    const nowHr = new Date().getHours()

    // Y grid lines + labels at 0, 15, 30, 45, 60 min
    ctx.font = `9px 'Space Mono'`
    ctx.textAlign = 'right'
    ;[0, 900, 1800, 2700, 3600].forEach(secs => {
      const yPx = topPad + chartH - (secs / maxV) * chartH
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(yAxisW, yPx)
      ctx.lineTo(w, yPx)
      ctx.stroke()
      ctx.setLineDash([])
      const label = secs === 0 ? '0' : secs === 3600 ? '1h' : `${secs / 60}m`
      ctx.fillStyle = mutedColor
      ctx.fillText(label, yAxisW - 4, yPx + 3)
    })

    // Bars
    hourly.forEach((v, i) => {
      const capped = Math.min(v, maxV)
      const bh = Math.max((capped / maxV) * chartH, v > 0 ? 3 : 0)
      const x = yAxisW + i * (chartW / 24) + 1
      const y = topPad + chartH - bh
      if (i > nowHr) ctx.fillStyle = emptyFill
      else if (capped > maxV * 0.7) ctx.fillStyle = '#2FD9A8'
      else if (v > 0) ctx.fillStyle = 'rgba(47,217,168,0.35)'
      else ctx.fillStyle = emptyFill
      ctx.beginPath()
      ctx.roundRect(x, y, barW, bh, 2)
      ctx.fill()
    })

    // Peak hour label
    const peakVal = Math.max(...hourly)
    if (peakVal > 0) {
      const peakHr = hourly.indexOf(peakVal)
      if (peakHr <= nowHr) {
        const capped = Math.min(peakVal, maxV)
        const bh = Math.max((capped / maxV) * chartH, 3)
        const px = yAxisW + peakHr * (chartW / 24) + barW / 2
        const py = topPad + chartH - bh - 5
        ctx.fillStyle = '#2FD9A8'
        ctx.font = `bold 8px 'Space Mono'`
        ctx.textAlign = 'center'
        ctx.fillText('▲', px, py)
      }
    }

    // X labels
    ctx.fillStyle = mutedColor
    ctx.font = `9px 'Space Mono'`
    ctx.textAlign = 'center'
    ;[0, 6, 12, 18, 23].forEach(i => {
      const label = i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i-12}p`
      ctx.fillText(label, yAxisW + i * (chartW / 24) + barW / 2, h - 2)
    })
  }, [hourly])

  useEffect(() => {
    const canvas = pieRef.current
    if (!canvas || categoryBreakdown.length === 0) return
    const ctx = canvas.getContext('2d')
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    ctx.clearRect(0, 0, w, h)
    const rootStyle = getComputedStyle(document.documentElement)
    const surfaceColor = rootStyle.getPropertyValue('--bg-surface').trim() || '#0f0f1a'
    const primaryTextColor = rootStyle.getPropertyValue('--text-primary').trim() || '#F0EDF8'
    const secondaryTextColor = rootStyle.getPropertyValue('--text-secondary').trim() || '#8884A0'
    const r = Math.min(w, h) * 0.36
    const cx = r + 12
    const cy = h / 2
    const total = categoryBreakdown.reduce((sum, c) => sum + Number(c.total_seconds), 0)
    let startAngle = -Math.PI / 2
    categoryBreakdown.forEach((c, i) => {
      const sliceAngle = (Number(c.total_seconds) / total) * 2 * Math.PI
      const color = catColor(c.category)
      ctx.fillStyle = hoveredSlice === i ? color : color + 'CC'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle)
      ctx.closePath()
      ctx.fill()
      startAngle += sliceAngle
    })
    // donut hole
    ctx.fillStyle = surfaceColor
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2)
    ctx.fill()
    // legend
    ctx.textAlign = 'left'
    const lx = cx + r + 18
    let ly = cy - (categoryBreakdown.length * 18) / 2
    categoryBreakdown.forEach((c, i) => {
      const color = catColor(c.category)
      const pct = ((Number(c.total_seconds) / total) * 100).toFixed(0)
      ctx.fillStyle = hoveredSlice === i ? color : color + 'AA'
      ctx.beginPath()
      ctx.roundRect(lx, ly, 8, 8, 2)
      ctx.fill()
      ctx.font = hoveredSlice === i ? `bold 10px "Space Mono"` : `10px "Space Mono"`
      ctx.fillStyle = hoveredSlice === i ? primaryTextColor : secondaryTextColor
      ctx.fillText(`${c.category}  ${pct}%`, lx + 13, ly + 8)
      ly += 18
    })
  }, [categoryBreakdown, hoveredSlice])

  const handlePieHover = (e) => {
    const canvas = pieRef.current
    if (!canvas || categoryBreakdown.length === 0) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const h = canvas.offsetHeight
    const r = Math.min(canvas.offsetWidth, h) * 0.36
    const cx = r + 12
    const cy = h / 2
    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < r && dist > r * 0.52) {
      let angle = Math.atan2(dy, dx) + Math.PI / 2
      if (angle < 0) angle += Math.PI * 2
      const total = categoryBreakdown.reduce((sum, c) => sum + Number(c.total_seconds), 0)
      let currentAngle = 0
      for (let i = 0; i < categoryBreakdown.length; i++) {
        const sliceAngle = (Number(categoryBreakdown[i].total_seconds) / total) * 2 * Math.PI
        if (angle < currentAngle + sliceAngle) { setHoveredSlice(i); return }
        currentAngle += sliceAngle
      }
    } else {
      setHoveredSlice(null)
    }
  }

  // Calendar logic
  const dataMap = {}
  calendarData.forEach(d => { dataMap[d.date] = d.total_seconds })

  const isCurrentMonth = calMonth.year === now.getFullYear() && calMonth.month === now.getMonth()
  const earliestDate = calendarData.length > 0 ? calendarData[0].date : todayStr
  const earliestYear = parseInt(earliestDate.slice(0, 4))
  const earliestMonth = parseInt(earliestDate.slice(5, 7)) - 1
  const isEarliestMonth = calMonth.year === earliestYear && calMonth.month === earliestMonth

  function prevMonth() {
    setCalMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })
  }
  function nextMonth() {
    setCalMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })
  }

  const calCells = buildMonthGrid(calMonth.year, calMonth.month, dataMap, todayStr)
  const monthName = new Date(calMonth.year, calMonth.month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const monthUnderGoal = calCells.filter(c => c && !c.isFuture && c.total_seconds > 0 && c.total_seconds < goalSeconds).length

  const maxUsage = usage.length ? usage[0].total_seconds : 1
  const catTotal = categoryBreakdown.reduce((s, c) => s + Number(c.total_seconds), 0) || 1

  const todayVsLastWeekDelta = weekComparison
    ? (stats?.today_seconds || 0) - weekComparison.same_day_last_week_seconds
    : null

  const metrics = [
    { label: 'Weekly avg', val: fmtSeconds(stats?.weekly_avg_seconds), sub: weekComparison ? `last week ${fmtSeconds(Math.round(weekComparison.last_week_seconds / 7))}` : 'per day', subClass: '', valClass: '' },
    { label: 'Limit alerts', val: stats?.limit_alerts ?? 0, sub: 'limits triggered', subClass: stats?.limit_alerts > 0 ? 'bad' : '', valClass: stats?.limit_alerts > 0 ? 'val-red' : '' },
  ]

  const ringPct = Math.max(0, Math.min(1, (stats?.today_seconds || 0) / (goalSeconds || 1)))
  const ringColor = ringPct < 1 ? 'var(--accent)' : ringPct < 1.2 ? 'var(--amber)' : 'var(--red)'
  const R = 42
  const CIRC = 2 * Math.PI * R

  return (
    <div className="dashboard">
      <div className="metrics-row">
        <div className="metric-card card-elevated ring-card">
          <div className="ring-wrap">
            <svg viewBox="0 0 100 100" className="ring-svg">
              <circle cx="50" cy="50" r={R} className="ring-track" />
              <circle
                cx="50" cy="50" r={R}
                className="ring-progress"
                style={{
                  stroke: ringColor,
                  strokeDasharray: CIRC,
                  strokeDashoffset: CIRC * (1 - Math.min(ringPct, 1)),
                }}
              />
            </svg>
            <div className="ring-center">
              <div className="ring-val mono">{fmtSeconds(stats?.today_seconds)}</div>
              <div className="ring-label">Today</div>
            </div>
          </div>
          <div className="ring-side">
            <div className="ring-goal-label">Goal {fmtSeconds(goalSeconds)}</div>
            {todayVsLastWeekDelta !== null && (
              <div className={`metric-sub ${todayVsLastWeekDelta > 0 ? 'bad' : 'good'}`}>
                {todayVsLastWeekDelta >= 0 ? '+' : ''}{fmtSeconds(Math.abs(todayVsLastWeekDelta))} vs last week
              </div>
            )}
          </div>
        </div>
        {metrics.map((m, i) => (
          <div key={i} className="metric-card card-elevated">
            <div className="metric-label">{m.label}</div>
            <div className={`metric-val mono ${m.valClass}`}>{m.val}</div>
            {m.sub && <div className={`metric-sub ${m.subClass}`}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {(dayBounds?.first_ts > 0 || longestFocus) && (
        <div className="secondary-stats">
          {dayBounds?.first_ts > 0 && (
            <div className="stat-chip">
              <span className="stat-chip-label">Active today</span>
              <span className="stat-chip-val mono">{fmtTime(dayBounds.first_ts)} — {fmtTime(dayBounds.last_ts)}</span>
            </div>
          )}
          {longestFocus && (
            <div className="stat-chip">
              <span className="stat-chip-label">Longest focus</span>
              <span className="stat-chip-val mono">{longestFocus.app_name} · {fmtMs(longestFocus.duration_ms)}</span>
            </div>
          )}
          {weekComparison && (
            <div className="stat-chip">
              <span className="stat-chip-label">This week</span>
              <span className="stat-chip-val mono">
                {fmtSeconds(weekComparison.this_week_seconds)}
                <span className={`chip-delta ${weekComparison.this_week_seconds <= weekComparison.last_week_seconds ? 'chip-good' : 'chip-bad'}`}>
                  {weekComparison.last_week_seconds > 0 ? ` · prev ${fmtSeconds(weekComparison.last_week_seconds)}` : ''}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="dash-grid">
        <div className="card-glass">
          <div className="card-title">Top apps — today</div>
          {loading ? (
            <div className="empty-state">Tracking...</div>
          ) : usage.length === 0 ? (
            <div className="empty-state">No usage data yet. Keep the app running.</div>
          ) : (
            <div className="app-list">
              {usage.slice(0, 6).map((u, i) => {
                const color = catColor(u.category)
                const pct = Math.min(100, (u.total_seconds / maxUsage) * 100)
                const trend = appTrends[u.app_name]
                return (
                  <div key={u.app_name} className="app-row">
                    <span className="app-dot" style={{background: color}} />
                    <span className="app-name">{u.app_name}</span>
                    <div className="app-bar-wrap">
                      <div className="app-bar prog-bar" style={{width: `${pct}%`, background: color}} />
                    </div>
                    <span className="app-time mono">{fmtSeconds(u.total_seconds)}</span>
                    {trend !== undefined && (
                      <span className={`app-trend ${trend > 0 ? 'trend-up' : 'trend-dn'}`}>{trend > 0 ? '↑' : '↓'}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card-glass">
          <div className="card-title">Hourly activity</div>
          <div className="hourly-wrap">
            <canvas ref={hourlyRef} className="hourly-canvas" />
          </div>
          <div className="hourly-legend">
            <span><span className="legend-dot" style={{background:'#2FD9A8'}} />High usage</span>
            <span><span className="legend-dot" style={{background:'rgba(47,217,168,0.35)'}} />Low usage</span>
          </div>
        </div>
      </div>

      {categoryBreakdown.length > 0 && (
        <div className="card-glass cat-breakdown-card">
          <div className="card-title">Time by category</div>
          <div className="cat-bar-track">
            {categoryBreakdown.map(cat => {
              const color = catColor(cat.category)
              return (
                <div key={cat.category} className="cat-bar-seg"
                  style={{ width: `${(Number(cat.total_seconds) / catTotal) * 100}%`, background: color }}
                  title={`${cat.category}: ${fmtSeconds(cat.total_seconds)}`}
                />
              )
            })}
          </div>
          <div className="cat-legend">
            {categoryBreakdown.map(cat => {
              const color = catColor(cat.category)
              return (
                <div key={cat.category} className="cat-legend-item">
                  <span className="cat-dot" style={{background: color}} />
                  <span className="cat-name">{cat.category}</span>
                  <span className="cat-time mono">{fmtSeconds(cat.total_seconds)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pie chart + Calendar side by side */}
      <div className="bottom-grid">
        <div className="card-glass">
          <div className="card-title">Category distribution</div>
          {loading || categoryBreakdown.length === 0 ? (
            <div className="empty-state">No category data yet</div>
          ) : (
            <div className="pie-wrap">
              <canvas ref={pieRef} className="pie-canvas" onMouseMove={handlePieHover} onMouseLeave={() => setHoveredSlice(null)} />
            </div>
          )}
        </div>

        <div className="card-glass monthly-cal-card">
          <div className="monthly-cal-header">
            <div className="cal-header-row1">
              <span className="card-title" style={{marginBottom:0}}>Goal tracker</span>
              {streak > 0 && (
                <div className="streak-badge">
                  <IconFlame size={11} />
                  <span>{streak}d</span>
                </div>
              )}
            </div>
            <div className="cal-header-row2">
              <span className="cal-goal-label">Goal: {fmtSeconds(goalSeconds)}/day</span>
            </div>
            <div className="cal-month-nav">
              <button className="cal-nav-btn" onClick={prevMonth} disabled={isEarliestMonth}>
                <IconChevronLeft size={12} />
              </button>
              <span className="cal-month-label">{monthName}</span>
              <button className="cal-nav-btn" onClick={nextMonth} disabled={isCurrentMonth}>
                <IconChevronRight size={12} />
              </button>
            </div>
          </div>

          <div className="cal-dow-row">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="cal-dow">{d}</div>
            ))}
          </div>

          <div className="cal-month-grid">
            {calCells.map((cell, i) => {
              if (!cell) return <div key={i} className="cal-cell-empty" />
              const status = cell.isFuture ? '' : getDayStatus(cell.total_seconds, goalSeconds)
              return (
                <div key={cell.date}
                  className={`cal-day-cell ${cell.isToday ? 'is-today' : ''} ${cell.isFuture ? 'is-future' : ''} ${status}`}
                  title={cell.isFuture ? '' : `${cell.date}: ${fmtSeconds(cell.total_seconds)}`}
                >
                  <span className="cal-day-num">{cell.day}</span>
                  {!cell.isFuture && cell.total_seconds > 0 && (
                    <span className="cal-day-time mono">{fmtSeconds(cell.total_seconds)}</span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="cal-legend">
            <div className="cal-legend-item"><div className="cal-legend-dot dot-good-bg" /><span>Under</span></div>
            <div className="cal-legend-item"><div className="cal-legend-dot dot-warn-bg" /><span>Near</span></div>
            <div className="cal-legend-item"><div className="cal-legend-dot dot-bad-bg" /><span>Over</span></div>
            <div className="cal-legend-item"><div className="cal-legend-dot dot-empty-bg" /><span>None</span></div>
            <div className="cal-legend-spacer" />
            <span className="cal-month-stat mono">{monthUnderGoal}d under goal</span>
          </div>
        </div>
      </div>
    </div>
  )
}
