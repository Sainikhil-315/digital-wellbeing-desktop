import { useState, useEffect } from 'react'
import { IconTrendingUp, IconChartBar, IconFlame, IconLeaf, IconTarget, IconCalendarCheck, IconDownload } from '@tabler/icons-react'
import './WeeklyReport.css'

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
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getWeeklyUsage(),
      api.getTodayUsage()
    ]).then(([w, t]) => {
      setWeekly(w)
      setTopApps(t)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [refreshKey])

  async function handleExport() {
    if (!api.exportCsv) return
    setExporting(true)
    setExportMsg('')
    try {
      const result = await api.exportCsv()
      if (result.cancelled) {
        setExportMsg('')
      } else if (result.ok) {
        setExportMsg('Exported!')
        setTimeout(() => setExportMsg(''), 3000)
      }
    } catch {
      setExportMsg('Export failed')
    }
    setExporting(false)
  }

  const totalSecs = weekly.reduce((a, d) => a + d.total_seconds, 0)
  const avgSecs = weekly.length ? Math.round(totalSecs / weekly.filter(d => d.total_seconds > 0).length || 1) : 0
  const peakDay = weekly.reduce((a, d) => d.total_seconds > (a?.total_seconds || 0) ? d : a, null)
  const bestDay = weekly.filter(d => d.total_seconds > 0).reduce((a, d) => d.total_seconds < (a?.total_seconds || Infinity) ? d : a, null)
  const maxSecs = Math.max(...weekly.map(d => d.total_seconds), 1)
  const today = new Date().toISOString().slice(0, 10)

  if (loading) return <div className="empty-state">Loading report...</div>

  return (
    <div className="weekly-report">
      {/* Bar chart */}
      <div className="card week-chart-card">
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
                  <div
                    className="day-bar"
                    style={{
                      height: `${pct}%`,
                      background: barColor(h),
                      opacity: isToday ? 1 : 0.65
                    }}
                  />
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
        <div className="card insight-card">
          <IconTrendingUp size={24} className="insight-icon" />
          <div className="insight-title">Weekly total</div>
          <div className="insight-val mono">{fmtSeconds(totalSecs)}</div>
          <div className="insight-desc">across {weekly.filter(d=>d.total_seconds>0).length} tracked days</div>
        </div>
        <div className="card insight-card">
          <IconChartBar size={24} className="insight-icon" />
          <div className="insight-title">Daily average</div>
          <div className="insight-val mono">{fmtSeconds(avgSecs)}</div>
          <div className="insight-desc">per active day</div>
        </div>
        <div className="card insight-card" style={peakDay ? {borderColor:'var(--red-dim)'} : {}}>
          <IconFlame size={24} className="insight-icon" style={{color:'var(--red)'}} />
          <div className="insight-title">Peak day</div>
          <div className="insight-val mono">{peakDay ? dayLabel(peakDay.date) : '—'}</div>
          <div className="insight-desc">{peakDay ? fmtSeconds(peakDay.total_seconds) : 'No data yet'}</div>
        </div>
        <div className="card insight-card" style={bestDay ? {borderColor:'var(--green-dim)'} : {}}>
          <IconLeaf size={24} className="insight-icon" style={{color:'var(--green)'}} />
          <div className="insight-title">Best day</div>
          <div className="insight-val mono">{bestDay ? dayLabel(bestDay.date) : '—'}</div>
          <div className="insight-desc">{bestDay ? fmtSeconds(bestDay.total_seconds) : 'No data yet'}</div>
        </div>
        <div className="card insight-card">
          <IconTarget size={24} className="insight-icon" />
          <div className="insight-title">Top app today</div>
          <div className="insight-val mono">{topApps[0]?.app_name || '—'}</div>
          <div className="insight-desc">{topApps[0] ? fmtSeconds(topApps[0].total_seconds) : 'No data'}</div>
        </div>
        <div className="card insight-card">
          <IconCalendarCheck size={24} className="insight-icon" style={{color:'var(--blue)'}} />
          <div className="insight-title">Days tracked</div>
          <div className="insight-val mono">{weekly.filter(d=>d.total_seconds>0).length} / 7</div>
          <div className="insight-desc">days with usage data</div>
        </div>
      </div>
    </div>
  )
}
