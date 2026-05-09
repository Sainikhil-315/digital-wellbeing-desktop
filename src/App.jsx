import { useState, useEffect, useCallback } from 'react'
import './App.css'
import Dashboard from './components/Dashboard.jsx'
import AppLimits from './components/AppLimits.jsx'
import FocusMode from './components/FocusMode.jsx'
import WeeklyReport from './components/WeeklyReport.jsx'

const api = window.electronAPI || {
  getTodayUsage: async () => [],
  getWeeklyUsage: async () => [],
  getLimits: async () => [],
  setLimit: async () => {},
  removeLimit: async () => {},
  getSessions: async () => [],
  saveSession: async () => {},
  getStats: async () => ({ today_seconds: 0, weekly_avg_seconds: 0, focus_today_seconds: 0, limit_alerts: 0 }),
  windowMinimize: () => {},
  windowMaximize: () => {},
  windowClose: () => {},
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard',     icon: 'ti-layout-dashboard' },
  { id: 'limits',    label: 'App Limits',    icon: 'ti-clock-pause' },
  { id: 'focus',     label: 'Focus Mode',    icon: 'ti-focus-2' },
  { id: 'weekly',    label: 'Weekly Report', icon: 'ti-calendar-stats' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {})
    const iv = setInterval(() => api.getStats().then(setStats).catch(() => {}), 30000)
    return () => clearInterval(iv)
  }, [refreshKey])

  function fmtSeconds(s) {
    if (!s) return '0m'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  return (
    <div className="app-shell">
      {/* Custom titlebar */}
      <div className="titlebar titlebar-drag">
        <div className="titlebar-left">
          <span className="titlebar-dot" />
          <span className="titlebar-title">Digital Wellbeing</span>
        </div>
        <div className="titlebar-controls">
          <button onClick={() => api.windowMinimize()} className="wbtn" title="Minimize">
            <i className="ti ti-minus" />
          </button>
          <button onClick={() => api.windowMaximize()} className="wbtn" title="Maximize">
            <i className="ti ti-copy" style={{transform:'scaleX(-1)'}} />
          </button>
          <button onClick={() => api.windowClose()} className="wbtn wbtn-close" title="Close">
            <i className="ti ti-x" />
          </button>
        </div>
      </div>

      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            {NAV.map(n => (
              <button
                key={n.id}
                className={`nav-item ${tab === n.id ? 'active' : ''}`}
                onClick={() => setTab(n.id)}
              >
                <i className={`ti ${n.icon}`} />
                <span>{n.label}</span>
                {n.id === 'limits' && stats?.limit_alerts > 0 && (
                  <span className="nav-badge">{stats.limit_alerts}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Quick stats at bottom of sidebar */}
          {stats && (
            <div className="sidebar-stats">
              <div className="ss-row">
                <span className="ss-label">Today</span>
                <span className="ss-val mono">{fmtSeconds(stats.today_seconds)}</span>
              </div>
              <div className="ss-row">
                <span className="ss-label">Wk avg</span>
                <span className="ss-val mono">{fmtSeconds(stats.weekly_avg_seconds)}</span>
              </div>
              <div className="ss-row">
                <span className="ss-label">Focus</span>
                <span className="ss-val mono" style={{color:'var(--green)'}}>{fmtSeconds(stats.focus_today_seconds)}</span>
              </div>
            </div>
          )}
        </aside>

        {/* Content */}
        <main className="content-area">
          <div className="content-header">
            <div className="content-title">
              {NAV.find(n => n.id === tab)?.label}
            </div>
            <div className="content-date mono">
              {new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
            </div>
          </div>

          <div className="content-body">
            {tab === 'dashboard' && <Dashboard api={api} refreshKey={refreshKey} />}
            {tab === 'limits'    && <AppLimits api={api} refreshKey={refreshKey} onRefresh={refresh} />}
            {tab === 'focus'     && <FocusMode api={api} refreshKey={refreshKey} onRefresh={refresh} />}
            {tab === 'weekly'    && <WeeklyReport api={api} refreshKey={refreshKey} />}
          </div>
        </main>
      </div>
    </div>
  )
}
