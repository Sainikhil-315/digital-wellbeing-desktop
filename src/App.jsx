import { useState, useEffect, useCallback, Component } from 'react'
import {
  IconLayoutDashboard,
  IconClockPause,
  IconFocus2,
  IconCalendarStats,
  IconSettings,
  IconMinus,
  IconCopy,
  IconX
} from '@tabler/icons-react'
import './App.css'
import Dashboard from './components/Dashboard.jsx'
import AppLimits from './components/AppLimits.jsx'
import FocusMode from './components/FocusMode.jsx'
import WeeklyReport from './components/WeeklyReport.jsx'
import Settings from './components/Settings.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'

const api = window.electronAPI || {
  getTodayUsage: async () => [],
  getWeeklyUsage: async () => [],
  getHourlyUsage: async () => new Array(24).fill(0),
  getLimits: async () => [],
  setLimit: async () => {},
  removeLimit: async () => {},
  getSessions: async () => [],
  saveSession: async () => {},
  getStats: async () => ({ today_seconds: 0, weekly_avg_seconds: 0, focus_today_seconds: 0, limit_alerts: 0 }),
  getSettings: async () => ({}),
  saveSetting: async () => {},
  exportCsv: async () => ({ ok: false }),
  snoozeApp: async () => {},
  updateAppKillToggle: async () => {},
  windowMinimize: () => {},
  windowMaximize: () => {},
  windowClose: () => {},
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-msg">Something went wrong in this view.</div>
          <button className="btn-retry" onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      )
    }
    return this.props.children
  }
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard',     icon: IconLayoutDashboard },
  { id: 'limits',    label: 'App Limits',    icon: IconClockPause },
  { id: 'focus',     label: 'Focus Mode',    icon: IconFocus2 },
  { id: 'weekly',    label: 'Weekly Report', icon: IconCalendarStats },
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
            <IconMinus size={16} />
          </button>
          <button onClick={() => api.windowMaximize()} className="wbtn" title="Maximize">
            <IconCopy size={16} style={{transform:'scaleX(-1)'}} />
          </button>
          <button onClick={() => api.windowClose()} className="wbtn wbtn-close" title="Close">
            <IconX size={16} />
          </button>
        </div>
      </div>

      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            {NAV.map(n => {
              const IconComponent = n.icon
              return (
                <button
                  key={n.id}
                  className={`nav-item ${tab === n.id ? 'active' : ''}`}
                  onClick={() => setTab(n.id)}
                >
                  <IconComponent size={20} />
                  <span>{n.label}</span>
                  {n.id === 'limits' && stats?.limit_alerts > 0 && (
                    <span className="nav-badge">{stats.limit_alerts}</span>
                  )}
                </button>
              )
            })}
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

          {/* Settings button below stats */}
          <button
            className={`nav-item settings-nav-btn ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
          >
            <IconSettings size={20} />
            <span>Settings</span>
          </button>

          <UpdateBanner />
        </aside>

        {/* Content */}
        <main className="content-area">
          <div className="content-header">
            <div className="content-title">
              {tab === 'settings' ? 'Settings' : NAV.find(n => n.id === tab)?.label}
            </div>
            <div className="content-date mono">
              {new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
            </div>
          </div>

          <div className="content-body">
            <ErrorBoundary key={tab}>
              {tab === 'dashboard' && <Dashboard api={api} refreshKey={refreshKey} />}
              {tab === 'limits'    && <AppLimits api={api} refreshKey={refreshKey} onRefresh={refresh} />}
              {tab === 'focus'     && <FocusMode api={api} refreshKey={refreshKey} onRefresh={refresh} />}
              {tab === 'weekly'    && <WeeklyReport api={api} refreshKey={refreshKey} />}
              {tab === 'settings'  && <Settings api={api} />}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}
