import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronUp, IconChevronDown, IconSelector } from '@tabler/icons-react'
import './AppUsage.css'

function fmtSeconds(s) {
  if (!s) return '0m'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const CATEGORIES = [
  'Browser', 'Development', 'Communication', 'Productivity',
  'Entertainment', 'Gaming', 'Social', 'Utility', 'Other',
]

const CAT_COLORS = {
  browser:       '#4B8FE2',
  development:   '#6366F1',
  communication: '#2AADAD',
  productivity:  '#5C9E2E',
  entertainment: '#D4821A',
  gaming:        '#E24B4A',
  social:        '#BF5CBF',
  utility:       '#8884A0',
  work:          '#6366F1',
  other:         '#48455A',
}

function catColor(name) {
  return CAT_COLORS[(name || '').toLowerCase()] || CAT_COLORS.other
}

export default function AppUsage({ api, refreshKey }) {
  const [apps, setApps]       = useState([])
  const [icons, setIcons]     = useState({})
  const [loading, setLoading] = useState(true)
  const [sortCol, setSortCol] = useState('total_seconds')
  const [sortDir, setSortDir] = useState('desc')
  const [overrides, setOverrides] = useState({})

  useEffect(() => {
    setLoading(true)
    const fn = api.getAppUsageDetailed
      ? api.getAppUsageDetailed()
      : Promise.resolve([])
    fn.then(data => {
      const list = data || []
      setApps(list)
      if (api.getAppIcon) {
        list.forEach(app => {
          api.getAppIcon({ app_name: app.app_name })
            .then(url => {
              if (url) setIcons(prev => ({ ...prev, [app.app_name]: url }))
            })
            .catch(() => {})
        })
      }
    })
    .catch(() => {})
    .finally(() => setLoading(false))
  }, [refreshKey])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  async function handleCategoryChange(app_name, category) {
    setOverrides(prev => ({ ...prev, [app_name]: category }))
    if (api.setAppCategory) {
      await api.setAppCategory({ app_name, category }).catch(() => {})
    }
  }

  const sorted = [...apps].sort((a, b) => {
    const av = sortCol === 'app_name' ? a[sortCol] : Number(a[sortCol])
    const bv = sortCol === 'app_name' ? b[sortCol] : Number(b[sortCol])
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function SortIcon({ col }) {
    if (sortCol !== col) return <IconSelector size={12} className="sort-icon sort-idle" />
    return sortDir === 'desc'
      ? <IconChevronDown size={12} className="sort-icon sort-active" />
      : <IconChevronUp   size={12} className="sort-icon sort-active" />
  }

  const totalToday = apps.reduce((s, a) => s + Number(a.total_seconds), 0)

  return (
    <div className="app-usage">
      <div className="card-glass usage-table-card">
        <div className="usage-meta">
          <span className="usage-count mono">{apps.length} apps tracked today</span>
          <span className="usage-total mono">{fmtSeconds(totalToday)} total</span>
        </div>

        {loading ? (
          <div className="usage-empty">Loading...</div>
        ) : apps.length === 0 ? (
          <div className="usage-empty">No app usage recorded today. Keep the app running.</div>
        ) : (
          <table className="usage-table">
            <thead>
              <tr>
                <th className="col-app th-btn" onClick={() => toggleSort('app_name')}>
                  App <SortIcon col="app_name" />
                </th>
                <th className="col-cat">Category</th>
                <th className="col-time th-btn" onClick={() => toggleSort('total_seconds')}>
                  Time <SortIcon col="total_seconds" />
                </th>
                <th className="col-opens th-btn" onClick={() => toggleSort('open_count')}>
                  Opens <SortIcon col="open_count" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((app, i) => {
                const category = overrides[app.app_name] || app.category || 'Other'
                const color = catColor(category)
                const pct = totalToday > 0
                  ? (Number(app.total_seconds) / totalToday) * 100
                  : 0
                return (
                  <tr key={app.app_name} className={i % 2 === 0 ? 'row-even' : ''}>
                    <td className="col-app">
                      <div className="app-cell">
                        {icons[app.app_name]
                          ? <img src={icons[app.app_name]} className="app-icon-img" alt="" />
                          : <span className="app-icon-letter" style={{ background: color + '33', color }}>
                              {app.app_name.charAt(0).toUpperCase()}
                            </span>
                        }
                        <span className="app-name-text">{app.app_name}</span>
                      </div>
                      <div className="app-bar-row">
                        <div className="app-usage-bar" style={{ width: `${pct}%`, background: color + '66' }} />
                      </div>
                    </td>
                    <td className="col-cat">
                      <CategoryPill
                        category={category}
                        color={color}
                        onSelect={cat => handleCategoryChange(app.app_name, cat)}
                      />
                    </td>
                    <td className="col-time mono">{fmtSeconds(app.total_seconds)}</td>
                    <td className="col-opens mono">{app.open_count}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const DROPDOWN_H = 310

function CategoryPill({ category, color, onSelect }) {
  const [open, setOpen]   = useState(false)
  const [style, setStyle] = useState({})
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen() {
    const r = btnRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < DROPDOWN_H && r.top > DROPDOWN_H
    setStyle({
      position: 'fixed',
      left: r.left,
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 5 }
        : { top: r.bottom + 5 }),
      zIndex: 9999,
    })
    setOpen(o => !o)
  }

  return (
    <div className="cat-wrap">
      <button
        ref={btnRef}
        className="cat-pill cat-pill-btn"
        style={{ background: color + '22', color }}
        onClick={handleOpen}
        title="Click to change category"
      >
        {category}
        <span className="cat-pill-caret">▾</span>
      </button>
      {open && createPortal(
        <div className="cat-dropdown" style={style}>
          {CATEGORIES.map(cat => {
            const c = catColor(cat)
            return (
              <button
                key={cat}
                className={`cat-option ${cat === category ? 'selected' : ''}`}
                style={{ '--opt-color': c }}
                onClick={() => { onSelect(cat); setOpen(false) }}
              >
                <span className="cat-option-dot" style={{ background: c }} />
                {cat}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
