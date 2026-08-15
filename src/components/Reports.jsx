import { useState, useEffect, useRef, useMemo } from 'react'
import {
  IconTrendingUp, IconTrendingDown, IconFlame, IconCalendarCheck,
  IconDownload, IconTrophy, IconActivity, IconChartBar,
} from '@tabler/icons-react'
import { catColor } from '../categoryColors.js'
import './Reports.css'

const RANGES = [
  { key: '7d',   label: '7 days' },
  { key: '30d',  label: '30 days' },
  { key: '90d',  label: '90 days' },
  { key: '365d', label: '1 year' },
  { key: 'all',  label: 'All time' },
]

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtSeconds(s) {
  if (!s) return '0m'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtSecondsShort(s) {
  if (!s) return '0h'
  const h = s / 3600
  return `${h.toFixed(1)}h`
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Reports({ api, refreshKey }) {
  const [range, setRange] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const trendRef = useRef(null)
  const catRef = useRef(null)
  const weekdayRef = useRef(null)
  const balanceRef = useRef(null)
  const [hoveredCat, setHoveredCat] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getReportData(range).then(d => {
      if (!cancelled) setData(d)
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range, refreshKey])

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

  const daily = data?.daily || []
  const maxSecs = Math.max(...daily.map(d => d.total_seconds), 1)
  const catTotal = (data?.category_breakdown || []).reduce((s, c) => s + Number(c.total_seconds), 0) || 1
  const delta = data ? data.total_seconds - data.prev_total_seconds : 0
  const deltaPct = data && data.prev_total_seconds > 0
    ? Math.round((delta / data.prev_total_seconds) * 100)
    : null

  // Average screen time per weekday, across every occurrence of that weekday in range
  const weekdayAvg = useMemo(() => {
    const sums = new Array(7).fill(0)
    const counts = new Array(7).fill(0)
    daily.forEach(d => {
      const dow = new Date(d.date + 'T00:00:00').getDay()
      sums[dow] += d.total_seconds
      counts[dow]++
    })
    return sums.map((s, i) => (counts[i] ? Math.round(s / counts[i]) : 0))
  }, [daily])

  // Bucket daily_groups down to at most ~60 bars so long ranges stay readable
  const balanceBuckets = useMemo(() => {
    const groups = data?.daily_groups || []
    if (groups.length <= 60) return groups
    const chunkSize = Math.ceil(groups.length / 60)
    const buckets = []
    for (let i = 0; i < groups.length; i += chunkSize) {
      const chunk = groups.slice(i, i + chunkSize)
      buckets.push({
        date: chunk[0].date,
        productive_seconds: chunk.reduce((s, d) => s + d.productive_seconds, 0),
        distracting_seconds: chunk.reduce((s, d) => s + d.distracting_seconds, 0),
        neutral_seconds: chunk.reduce((s, d) => s + d.neutral_seconds, 0),
      })
    }
    return buckets
  }, [data])

  const heatMax = useMemo(() => {
    const m = data?.weekday_hour_avg || []
    return Math.max(...m.flat(), 1)
  }, [data])

  function heatColor(secs) {
    const f = Math.min(secs / heatMax, 1)
    if (f === 0) return 'rgba(128,128,140,0.12)'
    return `color-mix(in srgb, var(--accent) ${Math.round(f * 100)}%, transparent)`
  }

  // Trend chart — bars for shorter ranges, filled area line for long ranges
  useEffect(() => {
    const canvas = trendRef.current
    if (!canvas || daily.length === 0) return
    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    ctx.clearRect(0, 0, w, h)

    const rootStyle = getComputedStyle(document.documentElement)
    const accent = rootStyle.getPropertyValue('--accent').trim() || '#2FD9A8'
    const gridColor = rootStyle.getPropertyValue('--border-bright').trim()
    const mutedColor = rootStyle.getPropertyValue('--text-muted').trim()
    const emptyFill = rootStyle.getPropertyValue('--bg-hover').trim()

    const yAxisW = 40
    const xAxisH = 16
    const topPad = 8
    const chartH = h - xAxisH - topPad
    const chartW = w - yAxisW
    const maxV = Math.max(maxSecs, 3600)

    ;[0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const yPx = topPad + chartH - f * chartH
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(yAxisW, yPx)
      ctx.lineTo(w, yPx)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = mutedColor
      ctx.font = `9px 'Space Mono'`
      ctx.textAlign = 'right'
      ctx.fillText(fmtSecondsShort(f * maxV), yAxisW - 6, yPx + 3)
    })

    const asBars = daily.length <= 60

    if (asBars) {
      const barW = Math.max((chartW / daily.length) - 2, 1)
      daily.forEach((d, i) => {
        const bh = Math.max((d.total_seconds / maxV) * chartH, d.total_seconds > 0 ? 2 : 0)
        const x = yAxisW + i * (chartW / daily.length) + 1
        const y = topPad + chartH - bh
        ctx.fillStyle = d.total_seconds > 0 ? accent : emptyFill
        ctx.beginPath()
        ctx.roundRect(x, y, barW, bh, 2)
        ctx.fill()
      })
    } else {
      // Filled area line for long ranges
      ctx.beginPath()
      daily.forEach((d, i) => {
        const x = yAxisW + (i / (daily.length - 1)) * chartW
        const y = topPad + chartH - (d.total_seconds / maxV) * chartH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.lineTo(yAxisW + chartW, topPad + chartH)
      ctx.lineTo(yAxisW, topPad + chartH)
      ctx.closePath()
      ctx.fillStyle = accent + '26'
      ctx.fill()

      ctx.beginPath()
      daily.forEach((d, i) => {
        const x = yAxisW + (i / (daily.length - 1)) * chartW
        const y = topPad + chartH - (d.total_seconds / maxV) * chartH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // X labels — first, middle, last
    ctx.fillStyle = mutedColor
    ctx.font = `9px 'Space Mono'`
    ctx.textAlign = 'center'
    const idxs = daily.length > 1 ? [0, Math.floor((daily.length - 1) / 2), daily.length - 1] : [0]
    idxs.forEach(i => {
      const x = yAxisW + (asBars ? (i + 0.5) * (chartW / daily.length) : (i / Math.max(daily.length - 1, 1)) * chartW)
      ctx.fillText(fmtDate(daily[i].date), x, h - 3)
    })
  }, [daily, maxSecs])

  // Category donut
  useEffect(() => {
    const canvas = catRef.current
    const catBreakdown = data?.category_breakdown || []
    if (!canvas || catBreakdown.length === 0) return
    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    ctx.clearRect(0, 0, w, h)

    const rootStyle = getComputedStyle(document.documentElement)
    const surfaceColor = rootStyle.getPropertyValue('--bg-surface').trim()
    const primaryTextColor = rootStyle.getPropertyValue('--text-primary').trim()
    const secondaryTextColor = rootStyle.getPropertyValue('--text-secondary').trim()

    const r = Math.min(w, h) * 0.36
    const cx = r + 12
    const cy = h / 2
    let startAngle = -Math.PI / 2
    catBreakdown.forEach((c, i) => {
      const sliceAngle = (Number(c.total_seconds) / catTotal) * 2 * Math.PI
      const color = catColor(c.category)
      ctx.fillStyle = hoveredCat === i ? color : color + 'CC'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle)
      ctx.closePath()
      ctx.fill()
      startAngle += sliceAngle
    })
    ctx.fillStyle = surfaceColor
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2)
    ctx.fill()

    ctx.textAlign = 'left'
    const lx = cx + r + 18
    let ly = cy - (catBreakdown.length * 18) / 2
    catBreakdown.forEach((c, i) => {
      const color = catColor(c.category)
      const pct = ((Number(c.total_seconds) / catTotal) * 100).toFixed(0)
      ctx.fillStyle = hoveredCat === i ? color : color + 'AA'
      ctx.beginPath()
      ctx.roundRect(lx, ly, 8, 8, 2)
      ctx.fill()
      ctx.font = hoveredCat === i ? `bold 10px "Space Mono"` : `10px "Space Mono"`
      ctx.fillStyle = hoveredCat === i ? primaryTextColor : secondaryTextColor
      ctx.fillText(`${c.category}  ${pct}%`, lx + 13, ly + 8)
      ly += 18
    })
  }, [data, hoveredCat, catTotal])

  // Weekday bar chart
  const weekdayAvgMax = Math.max(...weekdayAvg, 1)
  useEffect(() => {
    const canvas = weekdayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    ctx.clearRect(0, 0, w, h)

    const rootStyle = getComputedStyle(document.documentElement)
    const accent = rootStyle.getPropertyValue('--accent').trim() || '#2FD9A8'
    const mutedColor = rootStyle.getPropertyValue('--text-muted').trim()
    const emptyFill = rootStyle.getPropertyValue('--bg-hover').trim()

    const xAxisH = 16
    const topPad = 10
    const chartH = h - xAxisH - topPad
    const barW = (w / 7) * 0.5
    const gap = w / 7

    weekdayAvg.forEach((secs, i) => {
      const bh = Math.max((secs / weekdayAvgMax) * chartH, secs > 0 ? 2 : 0)
      const x = i * gap + (gap - barW) / 2
      const y = topPad + chartH - bh
      ctx.fillStyle = secs > 0 ? accent : emptyFill
      ctx.beginPath()
      ctx.roundRect(x, y, barW, bh, 3)
      ctx.fill()
      if (secs > 0) {
        ctx.fillStyle = mutedColor
        ctx.font = `9px 'Space Mono'`
        ctx.textAlign = 'center'
        ctx.fillText(fmtSecondsShort(secs), x + barW / 2, y - 4)
      }
    })

    ctx.fillStyle = mutedColor
    ctx.font = `9px 'Space Mono'`
    ctx.textAlign = 'center'
    DOW_LABELS.forEach((label, i) => {
      ctx.fillText(label, i * gap + gap / 2, h - 3)
    })
  }, [weekdayAvg, weekdayAvgMax])

  // Productive vs distracting balance — stacked bars
  useEffect(() => {
    const canvas = balanceRef.current
    if (!canvas || balanceBuckets.length === 0) return
    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    ctx.clearRect(0, 0, w, h)

    const rootStyle = getComputedStyle(document.documentElement)
    const greenColor = rootStyle.getPropertyValue('--green').trim() || '#5C9E2E'
    const redColor = rootStyle.getPropertyValue('--red').trim() || '#E24B4A'
    const mutedFill = rootStyle.getPropertyValue('--bg-hover').trim()
    const mutedColor = rootStyle.getPropertyValue('--text-muted').trim()

    const xAxisH = 16
    const topPad = 6
    const chartH = h - xAxisH - topPad
    const maxTotal = Math.max(...balanceBuckets.map(d =>
      d.productive_seconds + d.distracting_seconds + d.neutral_seconds), 1)
    const barW = Math.max((w / balanceBuckets.length) - 2, 1)

    balanceBuckets.forEach((d, i) => {
      const x = i * (w / balanceBuckets.length) + 1
      let yCursor = topPad + chartH
      const segments = [
        [d.productive_seconds, greenColor],
        [d.neutral_seconds, mutedFill],
        [d.distracting_seconds, redColor],
      ]
      segments.forEach(([secs, color]) => {
        const segH = (secs / maxTotal) * chartH
        yCursor -= segH
        if (segH > 0) {
          ctx.fillStyle = color
          ctx.fillRect(x, yCursor, barW, segH)
        }
      })
    })

    ctx.fillStyle = mutedColor
    ctx.font = `9px 'Space Mono'`
    ctx.textAlign = 'center'
    const idxs = balanceBuckets.length > 1
      ? [0, Math.floor((balanceBuckets.length - 1) / 2), balanceBuckets.length - 1]
      : [0]
    idxs.forEach(i => {
      const x = i * (w / balanceBuckets.length) + (w / balanceBuckets.length) / 2
      ctx.fillText(fmtDate(balanceBuckets[i].date), x, h - 3)
    })
  }, [balanceBuckets])

  function handleCatHover(e) {
    const canvas = catRef.current
    const catBreakdown = data?.category_breakdown || []
    if (!canvas || catBreakdown.length === 0) return
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
      let currentAngle = 0
      for (let i = 0; i < catBreakdown.length; i++) {
        const sliceAngle = (Number(catBreakdown[i].total_seconds) / catTotal) * 2 * Math.PI
        if (angle < currentAngle + sliceAngle) { setHoveredCat(i); return }
        currentAngle += sliceAngle
      }
    } else {
      setHoveredCat(null)
    }
  }

  if (loading && !data) return <div className="empty-state">Loading report...</div>

  return (
    <div className="reports">
      <div className="reports-header">
        <div className="range-tabs">
          {RANGES.map(r => (
            <button
              key={r.key}
              className={`range-tab ${range === r.key ? 'active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {api.exportCsv && (
          <button className="btn-export" onClick={handleExport} disabled={exporting}>
            <IconDownload size={14} />
            {exporting ? 'Saving...' : exportMsg || 'Export CSV'}
          </button>
        )}
      </div>

      {/* Overview */}
      <div className="reports-overview">
        <div className="card-glass overview-card">
          <div className="overview-label">Total screen time</div>
          <div className="overview-val mono">{fmtSeconds(data?.total_seconds)}</div>
          {deltaPct !== null && (
            <div className={`overview-delta ${delta > 0 ? 'bad' : 'good'}`}>
              {delta > 0 ? <IconTrendingUp size={13} /> : <IconTrendingDown size={13} />}
              {Math.abs(deltaPct)}% vs prior period
            </div>
          )}
        </div>
        <div className="card-glass overview-card">
          <div className="overview-label">Active days</div>
          <div className="overview-val mono">{data?.active_days ?? 0} / {daily.length}</div>
          <div className="overview-sub">days with tracked usage</div>
        </div>
        <div className="card-glass overview-card">
          <div className="overview-label">Daily average</div>
          <div className="overview-val mono">{fmtSeconds(data?.avg_seconds)}</div>
          <div className="overview-sub">per active day</div>
        </div>
        <div className="card-glass overview-card">
          <IconFlame size={16} className="overview-icon" style={{ color: 'var(--red)' }} />
          <div className="overview-label">Longest streak</div>
          <div className="overview-val mono">{data?.longest_streak ?? 0}d</div>
          <div className="overview-sub">consecutive active days</div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="card-glass trend-card">
        <div className="card-title">Screen time trend — {RANGES.find(r => r.key === range)?.label}</div>
        <div className="trend-wrap">
          <canvas ref={trendRef} className="trend-canvas" />
        </div>
      </div>

      <div className="reports-grid">
        {/* Top apps ranking */}
        <div className="card-glass ranking-card">
          <div className="card-title">Top apps ranking</div>
          {(!data?.top_apps || data.top_apps.length === 0) ? (
            <div className="empty-state">No usage data in this range</div>
          ) : (
            <div className="ranking-list">
              {data.top_apps.map((app, i) => {
                const color = catColor(app.category)
                const pct = Math.min(100, (app.total_seconds / data.top_apps[0].total_seconds) * 100)
                return (
                  <div key={app.app_name} className="ranking-row">
                    <span className="ranking-num mono">{i + 1}</span>
                    <span className="ranking-dot" style={{ background: color }} />
                    <span className="ranking-name">{app.app_name}</span>
                    <div className="ranking-bar-wrap">
                      <div className="ranking-bar" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="ranking-days mono">{app.days_active}d</span>
                    <span className="ranking-time mono">{fmtSeconds(app.total_seconds)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Category donut */}
        <div className="card-glass cat-card">
          <div className="card-title">By category</div>
          {(!data?.category_breakdown || data.category_breakdown.length === 0) ? (
            <div className="empty-state">No category data yet</div>
          ) : (
            <div className="pie-wrap">
              <canvas ref={catRef} className="pie-canvas" onMouseMove={handleCatHover} onMouseLeave={() => setHoveredCat(null)} />
            </div>
          )}
        </div>
      </div>

      <div className="reports-grid reports-grid-2">
        {/* Balance: productive vs distracting */}
        <div className="card-glass">
          <div className="card-title">Balance — productive vs distracting</div>
          <div className="balance-wrap">
            <canvas ref={balanceRef} className="balance-canvas" />
          </div>
          <div className="hourly-legend">
            <span><span className="legend-dot" style={{ background: 'var(--green)' }} />Productive</span>
            <span><span className="legend-dot" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-bright)' }} />Neutral</span>
            <span><span className="legend-dot" style={{ background: 'var(--red)' }} />Distracting</span>
          </div>
        </div>

        {/* By day of week */}
        <div className="card-glass">
          <div className="card-title">By day of week</div>
          <div className="weekday-wrap">
            <canvas ref={weekdayRef} className="weekday-canvas" />
          </div>
        </div>
      </div>

      {/* Typical week heatmap */}
      <div className="card-glass">
        <div className="card-title">Typical week — average by hour</div>
        <div className="heatmap-wrap">
          <div className="heatmap-grid">
            <div className="heatmap-corner" />
            {Array.from({ length: 24 }, (_, i) => (
              <div key={i} className="heatmap-hour-label">
                {i % 3 === 0 ? (i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`) : ''}
              </div>
            ))}
            {DOW_LABELS.flatMap((label, dow) => [
              <div key={`lbl-${dow}`} className="heatmap-row-label">{label}</div>,
              ...(data?.weekday_hour_avg?.[dow] || new Array(24).fill(0)).map((secs, hi) => (
                <div
                  key={`${dow}-${hi}`}
                  className="heatmap-cell"
                  style={{ background: heatColor(secs) }}
                  title={`${label} ${hi}:00 — avg ${fmtSeconds(secs)}`}
                />
              )),
            ])}
          </div>
          <div className="heatmap-legend">
            <span>Less</span>
            {[0, 0.25, 0.5, 0.75, 1].map(f => (
              <div key={f} className="heatmap-legend-cell" style={{ background: heatColor(f * heatMax) }} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  )
}
