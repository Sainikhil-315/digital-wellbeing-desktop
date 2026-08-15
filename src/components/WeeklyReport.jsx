import { useState, useEffect } from 'react'
import { IconTrendingUp, IconChartBar, IconFlame, IconLeaf, IconTarget, IconCalendarCheck, IconDownload, IconActivity } from '@tabler/icons-react'
import './WeeklyReport.css'

function heatmapColor(secs) {
  if (secs === 0)    return 'rgba(255,255,255,0.04)'
  if (secs < 300)   return 'rgba(47,217,168,0.18)'
  if (secs < 900)   return 'rgba(47,217,168,0.38)'
  if (secs < 1800)  return 'rgba(47,217,168,0.62)'
  if (secs < 3600)  return 'rgba(47,217,168,0.84)'
  return '#2FD9A8'
}

function fmtSeconds(s) {
  if (!s) return '0m'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

function barColor(hours) {
  if (hours > 9) return 'var(--red)'
  if (hours > 7) return 'var(--amber)'
  return 'var(--green)'
}

export default function WeeklyReport({ api, refreshKey }) {
  const [weekly, setWeekly] = useState([])
  const [topApps, setTopApps] = useState([])
  const [weekComparison, setWeekComparison] = useState(null)
  const [heatmap, setHeatmap] = useState({ days: [], matrix: [] })
  const [weeklyTopApps, setWeeklyTopApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getWeeklyUsage(),
      api.getTodayUsage(),
      api.getWeekComparison ? api.getWeekComparison() : Promise.resolve(null),
      api.getWeeklyHeatmap  ? api.getWeeklyHeatmap()  : Promise.resolve({ days: [], matrix: [] }),
      api.getWeeklyTopApps  ? api.getWeeklyTopApps()  : Promise.resolve([]),
    ]).then(([w, t, wc, hm, wta]) => {
      setWeekly((w || []).map(d => ({ ...d, total_seconds: Number(d.total_seconds) || 0 })))
      setTopApps((t || []).map(a => ({ ...a, total_seconds: Number(a.total_seconds) || 0 })))
      setWeekComparison(wc || null)
      setHeatmap(hm || { days: [], matrix: [] })
      setWeeklyTopApps((wta || []).map(a => ({ ...a, total_seconds: Number(a.total_seconds), days_active: Number(a.days_active) })))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [refreshKey])

  async function handleExport() {
    if (!api.exportCsv) return
    setExporting(true)
    setExportMsg('')
    try {
      const result = await api.exportCsv()
      if (result.cancelled) setExportMsg('')
      else if (result.ok) {
        setExportMsg('Exported!')
        setTimeout(() => setExportMsg(''), 3000)
      }
    } catch { setExportMsg('Export failed') }
    setExporting(false)
  }

  const totalSecs = weekly.reduce((a, d) => a + d.total_seconds, 0)
  const activeDays = weekly.filter(d => d.total_seconds > 0).length
  const avgSecs = activeDays ? Math.round(totalSecs / activeDays) : 0
  const daysWithData = weekly.filter(d => d.total_seconds > 0)
  const peakDay = daysWithData.length ? daysWithData.reduce((a, d) => d.total_seconds > a.total_seconds ? d : a) : null
  const bestDay = daysWithData.length ? daysWithData.reduce((a, d) => d.total_seconds < a.total_seconds ? d : a) : null
  const maxSecs = Math.max(...weekly.map(d => d.total_seconds), 1)
  const _d = new Date()
  const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`

  if (loading) return <div className="empty-state">Loading report...</div>

  return (
    <div className="weekly-report">
      {/* Bar chart */}
      <div className="card-glass week-chart-card">
        <div className="card-title-row">
          <div className="card-title">Screen time — last 7 days</div>
          {api.exportCsv && (
            <button className="btn-export" onClick={handleExport} disabled={exporting}>
              <IconDownload size={14} />
              {exporting ? 'Saving...' : exportMsg || 'Export CSV'}
            </button>
          )}
        </div>
        <div className="week-bars">
          {weekly.map(d => {
            const h = d.total_seconds / 3600
            const pct = (d.total_seconds / maxSecs) * 100
            const isToday = d.date === today
            return (
              <div key={d.date} className={`day-col ${isToday ? 'today' : ''}`}>
                <div className="day-val mono">{h > 0 ? `${h.toFixed(1)}h` : '—'}</div>
                <div className="day-bar-wrap">
                  <div className="day-bar" style={{ height: `${pct}%`, background: barColor(h), opacity: isToday ? 1 : 0.65 }} />
                </div>
                <div className="day-label mono">{dayLabel(d.date)}</div>
                {isToday && <div className="today-dot" />}
              </div>
            )
          })}
        </div>
        <div className="bar-legend">
          <span><span className="bl-dot" style={{background:'var(--green)'}} />Under 7h (good)</span>
          <span><span className="bl-dot" style={{background:'var(--amber)'}} />7–9h (moderate)</span>
          <span><span className="bl-dot" style={{background:'var(--red)'}} />Over 9h (high)</span>
        </div>
      </div>

      {/* Insight cards */}
      <div className="insights-grid">
        <div className="card-glass insight-card">
          <IconTrendingUp size={24} className="insight-icon" />
          <div className="insight-title">Weekly total</div>
          <div className="insight-val mono">{fmtSeconds(totalSecs)}</div>
          <div className="insight-desc">across {activeDays} tracked days</div>
        </div>
        <div className="card-glass insight-card">
          <IconChartBar size={24} className="insight-icon" />
          <div className="insight-title">Daily average</div>
          <div className="insight-val mono">{fmtSeconds(avgSecs)}</div>
          <div className="insight-desc">per active day</div>
        </div>
        <div className="card-glass insight-card" style={peakDay ? {borderColor:'var(--red-dim)'} : {}}>
          <IconFlame size={24} className="insight-icon" style={{color:'var(--red)'}} />
          <div className="insight-title">Peak day</div>
          <div className="insight-val mono">{peakDay ? dayLabel(peakDay.date) : '—'}</div>
          <div className="insight-desc">{peakDay ? fmtSeconds(peakDay.total_seconds) : 'No data yet'}</div>
        </div>
        <div className="card-glass insight-card" style={bestDay ? {borderColor:'var(--green-dim)'} : {}}>
          <IconLeaf size={24} className="insight-icon" style={{color:'var(--green)'}} />
          <div className="insight-title">Best day</div>
          <div className="insight-val mono">{bestDay ? dayLabel(bestDay.date) : '—'}</div>
          <div className="insight-desc">{bestDay ? fmtSeconds(bestDay.total_seconds) : 'No data yet'}</div>
        </div>
        <div className="card-glass insight-card">
          <IconTarget size={24} className="insight-icon" />
          <div className="insight-title">Top app today</div>
          <div className="insight-val mono">{topApps[0]?.app_name || '—'}</div>
          <div className="insight-desc">{topApps[0] ? fmtSeconds(topApps[0].total_seconds) : 'No data'}</div>
        </div>
        <div className="card-glass insight-card">
          <IconCalendarCheck size={24} className="insight-icon" style={{color:'var(--blue)'}} />
          <div className="insight-title">Days tracked</div>
          <div className="insight-val mono">{activeDays} / 7</div>
          <div className="insight-desc">days with usage data</div>
        </div>
        {weekComparison && (
          <div className="card-glass insight-card" style={{borderColor: weekComparison.this_week_seconds < weekComparison.last_week_seconds ? 'var(--green-dim)' : weekComparison.this_week_seconds > weekComparison.last_week_seconds ? 'var(--red-dim)' : ''}}>
            <IconActivity size={24} className="insight-icon" style={{color: weekComparison.this_week_seconds <= weekComparison.last_week_seconds ? 'var(--green)' : 'var(--red)'}} />
            <div className="insight-title">vs last week</div>
            <div className={`insight-val mono ${weekComparison.this_week_seconds <= weekComparison.last_week_seconds ? 'wc-good' : 'wc-bad'}`}>
              {weekComparison.this_week_seconds <= weekComparison.last_week_seconds ? '−' : '+'}
              {fmtSeconds(Math.abs(weekComparison.this_week_seconds - weekComparison.last_week_seconds))}
            </div>
            <div className="insight-desc">prev week {fmtSeconds(weekComparison.last_week_seconds)}</div>
          </div>
        )}
        {weeklyTopApps.length > 0 && (
          <div className="card-glass insight-card">
            <IconCalendarCheck size={24} className="insight-icon" style={{color:'var(--accent)'}} />
            <div className="insight-title">Most consistent</div>
            <div className="insight-val mono" style={{fontSize: 18}}>{weeklyTopApps[0]?.app_name || '—'}</div>
            <div className="insight-desc">{weeklyTopApps[0] ? `${weeklyTopApps[0].days_active}/7 days this week` : ''}</div>
          </div>
        )}
      </div>

      {/* App consistency */}
      {weeklyTopApps.length > 0 && (
        <div className="card-glass">
          <div className="card-title">App consistency — last 7 days</div>
          <div className="consistency-list">
            {weeklyTopApps.map(app => (
              <div key={app.app_name} className="consistency-row">
                <span className="consistency-name">{app.app_name}</span>
                <div className="consistency-dots">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className={`cons-dot ${i < app.days_active ? 'cons-dot-active' : ''}`} />
                  ))}
                </div>
                <span className="consistency-frac mono">{app.days_active}/7</span>
                <span className="consistency-time mono">{fmtSeconds(app.total_seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hourly heatmap */}
      {heatmap.days.length > 0 && (
        <div className="card-glass">
          <div className="card-title">Hourly activity — last 7 days</div>
          <div className="heatmap-wrap">
            {/* Hour label row */}
            <div className="heatmap-grid">
              <div className="heatmap-corner" />
              {Array.from({length: 24}, (_, i) => (
                <div key={i} className="heatmap-hour-label">
                  {i % 3 === 0 ? (i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i-12}p`) : ''}
                </div>
              ))}
              {heatmap.days.flatMap((day, di) => {
                const d = new Date(day + 'T00:00:00')
                const label = d.toLocaleDateString('en-US', { weekday: 'short' })
                return [
                  <div key={`lbl-${day}`} className="heatmap-row-label">{label}</div>,
                  ...(heatmap.matrix[di] || []).map((secs, hi) => (
                    <div
                      key={`${day}-${hi}`}
                      className="heatmap-cell"
                      style={{ background: heatmapColor(secs) }}
                      title={`${label} ${hi}:00 — ${fmtSeconds(secs)}`}
                    />
                  ))
                ]
              })}
            </div>
            <div className="heatmap-legend">
              <span>Less</span>
              {[0, 300, 900, 1800, 3600].map(s => (
                <div key={s} className="heatmap-legend-cell" style={{background: heatmapColor(s)}} />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
