import { useState, useEffect } from 'react'
import { IconSettings2, IconBell, IconDatabase, IconClock, IconPlayerPlay } from '@tabler/icons-react'
import './Settings.css'

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

export default function Settings({ api }) {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState({})
  const [saved, setSaved] = useState({})

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

  if (!settings) return <div className="empty-state">Loading settings...</div>

  return (
    <div className="settings-page">

      <section className="settings-section card">
        <div className="settings-section-header">
          <IconClock size={18} />
          <span>Tracking</span>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">Poll interval</div>
            <div className="settings-label-desc">How often the active window is checked</div>
          </div>
          <div className="settings-control">
            <select
              className="settings-select"
              value={settings.poll_interval || '5000'}
              onChange={e => save('poll_interval', e.target.value)}
              disabled={saving.poll_interval}
            >
              {POLL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {saved.poll_interval && <span className="saved-badge">Saved</span>}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">Launch at startup</div>
            <div className="settings-label-desc">Start minimized to tray when Windows boots</div>
          </div>
          <div className="settings-control">
            <button
              className={`toggle-btn ${settings.startup_launch !== 'false' ? 'on' : ''}`}
              onClick={() => save('startup_launch', settings.startup_launch === 'false' ? 'true' : 'false')}
              disabled={saving.startup_launch}
            >
              {settings.startup_launch !== 'false' ? 'On' : 'Off'}
            </button>
            {saved.startup_launch && <span className="saved-badge">Saved</span>}
          </div>
        </div>
      </section>

      <section className="settings-section card">
        <div className="settings-section-header">
          <IconBell size={18} />
          <span>Notifications & Limits</span>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">Enable notifications</div>
            <div className="settings-label-desc">Show alerts when app limits are approached or exceeded</div>
          </div>
          <div className="settings-control">
            <button
              className={`toggle-btn ${settings.notify_enabled !== 'false' ? 'on' : ''}`}
              onClick={() => save('notify_enabled', settings.notify_enabled === 'false' ? 'true' : 'false')}
              disabled={saving.notify_enabled}
            >
              {settings.notify_enabled !== 'false' ? 'On' : 'Off'}
            </button>
            {saved.notify_enabled && <span className="saved-badge">Saved</span>}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">Primary warning threshold</div>
            <div className="settings-label-desc">Main alert fires when usage hits this % of your daily limit</div>
          </div>
          <div className="settings-control">
            <select
              className="settings-select"
              value={settings.notify_warn_pct || '0.8'}
              onChange={e => save('notify_warn_pct', e.target.value)}
              disabled={saving.notify_warn_pct || settings.notify_enabled === 'false'}
            >
              {WARN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {saved.notify_warn_pct && <span className="saved-badge">Saved</span>}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">50% warning</div>
            <div className="settings-label-desc">Also notify when you're halfway through your daily limit</div>
          </div>
          <div className="settings-control">
            <button
              className={`toggle-btn ${settings.warn_step_lo === 'true' ? 'on' : ''}`}
              onClick={() => save('warn_step_lo', settings.warn_step_lo === 'true' ? 'false' : 'true')}
              disabled={saving.warn_step_lo || settings.notify_enabled === 'false'}
            >
              {settings.warn_step_lo === 'true' ? 'On' : 'Off'}
            </button>
            {saved.warn_step_lo && <span className="saved-badge">Saved</span>}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">95% warning</div>
            <div className="settings-label-desc">Final warning when only 5% of your limit remains</div>
          </div>
          <div className="settings-control">
            <button
              className={`toggle-btn ${settings.warn_step_hi !== 'false' ? 'on' : ''}`}
              onClick={() => save('warn_step_hi', settings.warn_step_hi === 'false' ? 'true' : 'false')}
              disabled={saving.warn_step_hi || settings.notify_enabled === 'false'}
            >
              {settings.warn_step_hi !== 'false' ? 'On' : 'Off'}
            </button>
            {saved.warn_step_hi && <span className="saved-badge">Saved</span>}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">Grace period</div>
            <div className="settings-label-desc">
              When a limit is hit, warn first and wait this long before closing the app.
              Gives you time to save your work. Applies only to hard limits.
            </div>
          </div>
          <div className="settings-control">
            <select
              className="settings-select"
              value={settings.grace_period_mins || '0'}
              onChange={e => save('grace_period_mins', e.target.value)}
              disabled={saving.grace_period_mins}
            >
              <option value="0">None — close immediately</option>
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
            </select>
            {saved.grace_period_mins && <span className="saved-badge">Saved</span>}
          </div>
        </div>
        <div className="settings-info-row">
          <span>Per-app close behavior (hard vs soft) is set on each limit card in App Limits.</span>
        </div>
      </section>

      <section className="settings-section card">
        <div className="settings-section-header">
          <IconDatabase size={18} />
          <span>Data</span>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">Data retention</div>
            <div className="settings-label-desc">Usage history older than this is automatically deleted</div>
          </div>
          <div className="settings-control">
            <select
              className="settings-select"
              value={settings.data_retention_days || '90'}
              onChange={e => save('data_retention_days', e.target.value)}
              disabled={saving.data_retention_days}
            >
              {RETENTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {saved.data_retention_days && <span className="saved-badge">Saved</span>}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">Export data</div>
            <div className="settings-label-desc">Save last 30 days of usage as a CSV file</div>
          </div>
          <div className="settings-control">
            <ExportButton api={api} />
          </div>
        </div>
      </section>

      <section className="settings-section card">
        <div className="settings-section-header">
          <IconSettings2 size={18} />
          <span>About</span>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-label-title">Digital Wellbeing</div>
            <div className="settings-label-desc">Track screen time, set limits, stay focused</div>
          </div>
          <div className="settings-control">
            <span className="settings-version mono">v2.1.0</span>
          </div>
        </div>
      </section>

    </div>
  )
}

function ExportButton({ api }) {
  const [state, setState] = useState('idle')

  async function doExport() {
    if (!api.exportCsv) return
    setState('loading')
    try {
      const result = await api.exportCsv()
      if (result.ok) {
        setState('done')
        setTimeout(() => setState('idle'), 3000)
      } else {
        setState('idle')
      }
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <button className="settings-btn" onClick={doExport} disabled={state === 'loading'}>
      {state === 'loading' ? 'Saving...' : state === 'done' ? 'Exported!' : state === 'error' ? 'Failed' : 'Export CSV'}
    </button>
  )
}
