import { useState, useEffect } from 'react'
import {
  IconClock, IconBell, IconDatabase, IconInfoCircle,
  IconBug, IconDownload,
} from '@tabler/icons-react'
import './Settings.css'

const GOAL_OPTIONS = [
  { value: '10800', label: '3 hours' },
  { value: '14400', label: '4 hours' },
  { value: '18000', label: '5 hours' },
  { value: '21600', label: '6 hours (default)' },
  { value: '28800', label: '8 hours' },
  { value: '36000', label: '10 hours' },
]

const POLL_OPTIONS = [
  { value: '3000',  label: '3 seconds (more accurate)' },
  { value: '5000',  label: '5 seconds (default)' },
  { value: '10000', label: '10 seconds (less battery)' },
  { value: '30000', label: '30 seconds (minimal impact)' },
]

const WARN_OPTIONS = [
  { value: '0.5', label: '50%' },
  { value: '0.7', label: '70%' },
  { value: '0.8', label: '80% (default)' },
  { value: '0.9', label: '90%' },
]

const RETENTION_OPTIONS = [
  { value: '7',   label: '7 days' },
  { value: '30',  label: '30 days' },
  { value: '90',  label: '90 days (default)' },
  { value: '365', label: '1 year' },
]

const NAV = [
  { id: 'tracking',      label: 'Tracking',      Icon: IconClock },
  { id: 'notifications', label: 'Notifications', Icon: IconBell },
  { id: 'data',          label: 'Data',           Icon: IconDatabase },
  { id: 'about',         label: 'About',          Icon: IconInfoCircle },
]

export default function Settings({ api }) {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving]     = useState({})
  const [saved, setSaved]       = useState({})
  const [active, setActive]     = useState('tracking')

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => setSettings({}))
  }, [])

  async function save(key, value) {
    setSaving(s => ({ ...s, [key]: true }))
    await api.saveSetting({ key, value })
    setSettings(s => ({ ...s, [key]: value }))
    setSaving(s => ({ ...s, [key]: false }))
    setSaved(s => ({ ...s, [key]: true }))
    setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
  }

  if (!settings) return <div className="settings-loading">Loading settings…</div>

  return (
    <div className="settings-wrap">
      <nav className="settings-sidebar">
        <div className="settings-sidebar-title">Preferences</div>
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`settings-nav-item ${active === id ? 'active' : ''}`}
            onClick={() => setActive(id)}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="settings-content">

        {active === 'tracking' && (
          <Section title="Tracking">
            <Row title="Poll interval" desc="How often the active window is checked">
              <select
                className="s-select"
                value={settings.poll_interval || '5000'}
                onChange={e => save('poll_interval', e.target.value)}
                disabled={saving.poll_interval}
              >
                {POLL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Saved show={saved.poll_interval} />
            </Row>
            <Row title="Daily screen time goal" desc="Target for streak calendar — days under goal are green">
              <select
                className="s-select"
                value={settings.daily_goal_seconds || '21600'}
                onChange={e => save('daily_goal_seconds', e.target.value)}
                disabled={saving.daily_goal_seconds}
              >
                {GOAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Saved show={saved.daily_goal_seconds} />
            </Row>
            <Row title="Launch at startup" desc="Start minimized to tray when Windows boots">
              <Toggle
                on={settings.startup_launch !== 'false'}
                disabled={saving.startup_launch}
                onChange={() => save('startup_launch', settings.startup_launch === 'false' ? 'true' : 'false')}
              />
              <Saved show={saved.startup_launch} />
            </Row>
          </Section>
        )}

        {active === 'notifications' && (
          <Section title="Notifications & Limits">
            <Row title="Enable notifications" desc="Show alerts when app limits are approached or exceeded">
              <Toggle
                on={settings.notify_enabled !== 'false'}
                disabled={saving.notify_enabled}
                onChange={() => save('notify_enabled', settings.notify_enabled === 'false' ? 'true' : 'false')}
              />
              <Saved show={saved.notify_enabled} />
            </Row>
            <Row title="Primary warning threshold" desc="Main alert fires when usage hits this % of your daily limit">
              <select
                className="s-select"
                value={settings.notify_warn_pct || '0.8'}
                onChange={e => save('notify_warn_pct', e.target.value)}
                disabled={saving.notify_warn_pct || settings.notify_enabled === 'false'}
              >
                {WARN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Saved show={saved.notify_warn_pct} />
            </Row>
            <Row title="50% warning" desc="Also notify when you're halfway through your daily limit">
              <Toggle
                on={settings.warn_step_lo === 'true'}
                disabled={saving.warn_step_lo || settings.notify_enabled === 'false'}
                onChange={() => save('warn_step_lo', settings.warn_step_lo === 'true' ? 'false' : 'true')}
              />
              <Saved show={saved.warn_step_lo} />
            </Row>
            <Row title="95% warning" desc="Final warning when only 5% of your limit remains">
              <Toggle
                on={settings.warn_step_hi !== 'false'}
                disabled={saving.warn_step_hi || settings.notify_enabled === 'false'}
                onChange={() => save('warn_step_hi', settings.warn_step_hi === 'false' ? 'true' : 'false')}
              />
              <Saved show={saved.warn_step_hi} />
            </Row>
            <Row title="Grace period" desc="Wait this long before closing an app when its limit is hit">
              <select
                className="s-select"
                value={settings.grace_period_mins || '0'}
                onChange={e => save('grace_period_mins', e.target.value)}
                disabled={saving.grace_period_mins}
              >
                <option value="0">None — close immediately</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
              </select>
              <Saved show={saved.grace_period_mins} />
            </Row>
            <div className="s-info">Per-app close behavior (hard vs soft) is configured on each limit card in App Limits.</div>
          </Section>
        )}

        {active === 'data' && (
          <Section title="Data">
            <Row title="Data retention" desc="Usage history older than this is automatically deleted">
              <select
                className="s-select"
                value={settings.data_retention_days || '90'}
                onChange={e => save('data_retention_days', e.target.value)}
                disabled={saving.data_retention_days}
              >
                {RETENTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Saved show={saved.data_retention_days} />
            </Row>
            <Row title="Export data" desc="Save last 30 days of usage as a CSV file">
              <ExportButton api={api} />
            </Row>
          </Section>
        )}

        {active === 'about' && (
          <Section title="About">
            <div className="about-hero">
              <div className="about-hero-dot" />
              <div className="about-hero-name">Digital Wellbeing</div>
              <div className="about-hero-version mono">v3.0.0</div>
              <div className="about-hero-tagline">Track screen time · Set limits · Stay focused</div>
            </div>
            <Row title="Made with passion by Nikh" desc="Built for focus, shipped with love">
              <span className="about-heart">♥</span>
            </Row>
            <Row title="Support development" desc="If this app helps you, consider buying me a coffee">
              <button className="s-btn bmc" onClick={() => api.openExternal('https://buymeacoffee.com/nikh315')}>
                ☕ Buy me a coffee
              </button>
            </Row>
            <Row title="Report a bug" desc="Found something broken? Open a GitHub issue">
              <button
                className="s-btn"
                onClick={() => api.openExternal('https://github.com/Sainikhil-315/digital-wellbeing-desktop/issues/new')}
              >
                <IconBug size={14} /> Report bug
              </button>
            </Row>
          </Section>
        )}

      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="s-section">
      <div className="s-section-title">{title}</div>
      <div className="s-section-body">{children}</div>
    </div>
  )
}

function Row({ title, desc, children }) {
  return (
    <div className="s-row">
      <div className="s-row-label">
        <div className="s-row-title">{title}</div>
        {desc && <div className="s-row-desc">{desc}</div>}
      </div>
      <div className="s-row-control">{children}</div>
    </div>
  )
}

function Toggle({ on, disabled, onChange }) {
  return (
    <button
      className={`s-toggle ${on ? 'on' : ''}`}
      onClick={onChange}
      disabled={disabled}
      aria-pressed={on}
    >
      <span className="s-toggle-thumb" />
    </button>
  )
}

function Saved({ show }) {
  if (!show) return null
  return <span className="s-saved">Saved</span>
}

function ExportButton({ api }) {
  const [state, setState] = useState('idle')

  async function doExport() {
    if (!api.exportCsv) return
    setState('loading')
    try {
      const result = await api.exportCsv()
      setState(result.ok ? 'done' : 'idle')
      if (result.ok) setTimeout(() => setState('idle'), 3000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <button className="s-btn" onClick={doExport} disabled={state === 'loading'}>
      <IconDownload size={14} />
      {state === 'loading' ? 'Saving…' : state === 'done' ? 'Exported!' : state === 'error' ? 'Failed' : 'Export CSV'}
    </button>
  )
}
