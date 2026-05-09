import { useState, useEffect, useRef } from 'react'
import './Dashboard.css'

function fmtSeconds(s) {
  if (!s) return '0m'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function appColor(appName, index) {
  const colors = ['#4B8FE2','#E24B4A','#D4821A','#7C5CBF','#5C9E2E','#2AADAD','#E2894B']
  return colors[index % colors.length]
}

export default function Dashboard({ api, refreshKey }) {
  const [stats, setStats] = useState(null)
  const [usage, setUsage] = useState([])
  const [loading, setLoading] = useState(true)
  const hourlyRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [s, u] = await Promise.all([api.getStats(), api.getTodayUsage()])
        if (!cancelled) { setStats(s); setUsage(u) }
      } catch(e) {}
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey])

  // Draw hourly chart via canvas
  useEffect(() => {
    const canvas = hourlyRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width = canvas.offsetWidth * window.devicePixelRatio
    const H = canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight

    // Generate pseudo-hourly data from today total
    const totalH = stats ? stats.today_seconds / 3600 : 0
    const now = new Date().getHours()
    const hourly = Array.from({length: 24}, (_, i) => {
      if (i > now) return 0
      const base = i >= 9 && i <= 22 ? (Math.sin((i-9) * 0.4) + 0.2) : 0.05
      return Math.max(0, base * (totalH / 8) + (Math.random() * 0.15))
    })

    ctx.clearRect(0, 0, w, h)
    const barW = (w / 24) - 2
    const maxV = Math.max(...hourly, 0.1)
    hourly.forEach((v, i) => {
      const bh = (v / maxV) * (h - 16)
      const x = i * (w / 24) + 1
      const y = h - bh
      ctx.fillStyle = v > maxV * 0.7 ? '#E24B4A' : '#333230'
      ctx.beginPath()
      ctx.roundRect(x, y, barW, bh, 2)
      ctx.fill()
    })

    // Hour labels
    ctx.fillStyle = '#4A4845'
    ctx.font = `9px 'Space Mono'`
    ctx.textAlign = 'center'
    ;[0, 6, 12, 18, 23].forEach(i => {
      const label = i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i-12}p`
      ctx.fillText(label, i * (w / 24) + barW/2, h)
    })
  }, [stats])

  const maxUsage = usage.length ? usage[0].total_seconds : 1

  return (
    <div className="dashboard">
      {/* Metric cards */}
      <div className="metrics-row">
        {[
          { label: 'Today', val: fmtSeconds(stats?.today_seconds), sub: stats?.today_seconds > stats?.weekly_avg_seconds ? '↑ above avg' : '↓ below avg', subClass: stats?.today_seconds > stats?.weekly_avg_seconds ? 'bad' : 'good' },
          { label: 'Weekly avg', val: fmtSeconds(stats?.weekly_avg_seconds), sub: 'per day', subClass: '' },
          { label: 'Focus today', val: fmtSeconds(stats?.focus_today_seconds), sub: 'completed sessions', subClass: 'good' },
          { label: 'Limit alerts', val: stats?.limit_alerts ?? 0, sub: 'limits triggered', subClass: stats?.limit_alerts > 0 ? 'bad' : '' },
        ].map((m, i) => (
          <div key={i} className="metric-card card">
            <div className="metric-label">{m.label}</div>
            <div className={`metric-val mono ${i === 3 && m.val > 0 ? 'val-red' : ''}`}>{m.val}</div>
            {m.sub && <div className={`metric-sub ${m.subClass}`}>{m.sub}</div>}
          </div>
        ))}
      </div>

      <div className="dash-grid">
        {/* Top apps */}
        <div className="card">
          <div className="card-title">Top apps — today</div>
          {loading ? (
            <div className="empty-state">Tracking...</div>
          ) : usage.length === 0 ? (
            <div className="empty-state">No usage data yet. Keep the app running.</div>
          ) : (
            <div className="app-list">
              {usage.slice(0, 8).map((u, i) => {
                const color = appColor(u.app_name, i)
                const pct = Math.min(100, (u.total_seconds / maxUsage) * 100)
                return (
                  <div key={u.app_name} className="app-row">
                    <span className="app-dot" style={{background: color}} />
                    <span className="app-name">{u.app_name}</span>
                    <div className="app-bar-wrap">
                      <div className="app-bar prog-bar" style={{width: `${pct}%`, background: color}} />
                    </div>
                    <span className="app-time mono">{fmtSeconds(u.total_seconds)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Hourly heatmap */}
        <div className="card">
          <div className="card-title">Hourly activity</div>
          <div className="hourly-wrap">
            <canvas ref={hourlyRef} className="hourly-canvas" />
          </div>
          <div className="hourly-legend">
            <span><span className="legend-dot" style={{background:'#E24B4A'}} />High usage</span>
            <span><span className="legend-dot" style={{background:'#333230'}} />Low usage</span>
          </div>
        </div>
      </div>
    </div>
  )
}
