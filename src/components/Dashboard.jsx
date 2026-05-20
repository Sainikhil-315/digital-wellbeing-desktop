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
  const [hourly, setHourly] = useState(new Array(24).fill(0))
  const [loading, setLoading] = useState(true)
  const hourlyRef = useRef(null)
  const pieRef = useRef(null)
  const [hoveredSlice, setHoveredSlice] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [s, u, h] = await Promise.all([
          api.getStats(),
          api.getTodayUsage(),
          api.getHourlyUsage ? api.getHourlyUsage() : Promise.resolve(new Array(24).fill(0))
        ])
        if (!cancelled) {
          setStats(s)
          setUsage(u)
          setHourly(h || new Array(24).fill(0))
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
    const W = canvas.width = canvas.offsetWidth * window.devicePixelRatio
    const H = canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight

    ctx.clearRect(0, 0, w, h)
    const barW = (w / 24) - 2
    const maxV = Math.max(...hourly, 1)
    const now = new Date().getHours()

    hourly.forEach((v, i) => {
      const bh = Math.max((v / maxV) * (h - 16), v > 0 ? 3 : 0)
      const x = i * (w / 24) + 1
      const y = h - bh - 12  // leave room for labels

      if (i > now) {
        ctx.fillStyle = '#1e1e1e'
      } else if (v > maxV * 0.7) {
        ctx.fillStyle = '#E24B4A'
      } else if (v > 0) {
        ctx.fillStyle = '#333230'
      } else {
        ctx.fillStyle = '#1e1e1e'
      }

      ctx.beginPath()
      ctx.roundRect(x, y, barW, bh, 2)
      ctx.fill()
    })

    ctx.fillStyle = '#4A4845'
    ctx.font = `9px 'Space Mono'`
    ctx.textAlign = 'center'
    ;[0, 6, 12, 18, 23].forEach(i => {
      const label = i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i-12}p`
      ctx.fillText(label, i * (w / 24) + barW / 2, h - 2)
    })
  }, [hourly])

  // Draw pie chart for app usage distribution
  useEffect(() => {
    const canvas = pieRef.current
    if (!canvas || usage.length === 0) return
    
    const ctx = canvas.getContext('2d')
    const W = canvas.width = canvas.offsetWidth * window.devicePixelRatio
    const H = canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight

    ctx.clearRect(0, 0, w, h)

    const cx = w / 2.5
    const cy = h / 2
    const radius = Math.min(w, h) * 0.25

    const total = usage.reduce((sum, u) => sum + u.total_seconds, 0)
    let startAngle = -Math.PI / 2

    // Draw pie slices
    usage.forEach((u, i) => {
      const sliceAngle = (u.total_seconds / total) * 2 * Math.PI
      const color = appColor(u.app_name, i)
      
      ctx.fillStyle = hoveredSlice === i ? color + 'DD' : color
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle)
      ctx.closePath()
      ctx.fill()

      startAngle += sliceAngle
    })

    // Draw legend
    ctx.font = '12px "Space Mono"'
    ctx.textAlign = 'left'
    const legendX = cx + radius + 40
    let legendY = cy - (usage.length * 16) / 2

    usage.forEach((u, i) => {
      const color = appColor(u.app_name, i)
      const pct = ((u.total_seconds / total) * 100).toFixed(1)
      
      // Draw color dot
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(legendX, legendY + 6, 4, 0, Math.PI * 2)
      ctx.fill()

      // Draw text
      ctx.fillStyle = hoveredSlice === i ? '#fff' : '#999'
      ctx.fillText(`${u.app_name} - ${pct}%`, legendX + 12, legendY + 10)
      ctx.fillStyle = hoveredSlice === i ? '#ccc' : '#666'
      ctx.fillText(fmtSeconds(u.total_seconds), legendX + 12, legendY + 22)

      legendY += 32
    })
  }, [usage, hoveredSlice])

  const handlePieHover = (e) => {
    const canvas = pieRef.current
    if (!canvas || usage.length === 0) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left)
    const y = (e.clientY - rect.top)

    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    const cx = w / 2.5
    const cy = h / 2
    const radius = Math.min(w, h) * 0.25

    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < radius && dist > 0) {
      let angle = Math.atan2(dy, dx) + Math.PI / 2
      if (angle < 0) angle += Math.PI * 2

      const total = usage.reduce((sum, u) => sum + u.total_seconds, 0)
      let currentAngle = 0
      
      for (let i = 0; i < usage.length; i++) {
        const sliceAngle = (usage[i].total_seconds / total) * 2 * Math.PI
        if (angle < currentAngle + sliceAngle) {
          setHoveredSlice(i)
          return
        }
        currentAngle += sliceAngle
      }
    } else {
      setHoveredSlice(null)
    }
  }

  const handlePieLeave = () => {
    setHoveredSlice(null)
  }

  const maxUsage = usage.length ? usage[0].total_seconds : 1

  return (
    <div className="dashboard">
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
      <br />
      <div className="card">
        <div className="card-title">App distribution</div>
        {loading || usage.length === 0 ? (
          <div className="empty-state">No usage data yet</div>
        ) : (
          <div className="pie-wrap">
            <canvas 
              ref={pieRef} 
              className="pie-canvas"
              onMouseMove={handlePieHover}
              onMouseLeave={handlePieLeave}
            />
          </div>
        )}
      </div>
    </div>
  )
}