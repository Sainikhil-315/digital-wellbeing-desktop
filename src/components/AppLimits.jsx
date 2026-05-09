import { useState, useEffect } from 'react'
import './AppLimits.css'

function fmtSeconds(s) {
  if (!s) return '0m'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function getStatus(used, limit) {
  const pct = used / limit
  if (pct >= 1) return 'exceeded'
  if (pct >= 0.7) return 'warn'
  return 'ok'
}

export default function AppLimits({ api, refreshKey, onRefresh }) {
  const [limits, setLimits] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [newApp, setNewApp] = useState('')
  const [newHours, setNewHours] = useState('1')
  const [newMins, setNewMins] = useState('0')
  const [newProd, setNewProd] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getLimits().then(setLimits).catch(() => {})
  }, [refreshKey])

  async function addLimit() {
    if (!newApp.trim()) return
    const secs = (parseInt(newHours) || 0) * 3600 + (parseInt(newMins) || 0) * 60
    if (secs === 0) return
    setSaving(true)
    await api.setLimit({ app_name: newApp.trim(), limit_seconds: secs, is_productive: newProd })
    setSaving(false)
    setNewApp(''); setNewHours('1'); setNewMins('0'); setNewProd(false)
    setShowAdd(false)
    onRefresh()
  }

  async function remove(app_name) {
    await api.removeLimit({ app_name })
    onRefresh()
  }

  return (
    <div className="app-limits">
      <div className="limits-header">
        <p className="limits-desc">Set daily time limits per app. You'll get a notification at 80% and when exceeded.</p>
        <button className="btn-add" onClick={() => setShowAdd(v => !v)}>
          <i className="ti ti-plus" /> Add limit
        </button>
      </div>

      {showAdd && (
        <div className="card add-form">
          <div className="form-row">
            <label>App name</label>
            <input
              className="form-input"
              placeholder="e.g. Instagram, Chrome, Spotify"
              value={newApp}
              onChange={e => setNewApp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addLimit()}
              autoFocus
            />
          </div>
          <div className="form-row form-row-inline">
            <label>Daily limit</label>
            <div className="time-inputs">
              <input className="form-input time-in" value={newHours} onChange={e => setNewHours(e.target.value)} type="number" min="0" max="23" />
              <span className="time-sep">h</span>
              <input className="form-input time-in" value={newMins} onChange={e => setNewMins(e.target.value)} type="number" min="0" max="59" step="5"/>
              <span className="time-sep">m</span>
            </div>
          </div>
          <div className="form-row form-row-inline">
            <label>Productive app</label>
            <button className={`toggle-btn ${newProd ? 'on' : ''}`} onClick={() => setNewProd(v => !v)}>
              {newProd ? 'Yes' : 'No'}
            </button>
          </div>
          <div className="form-actions">
            <button className="btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn-save" onClick={addLimit} disabled={saving}>
              {saving ? 'Saving...' : 'Save limit'}
            </button>
          </div>
        </div>
      )}

      {limits.length === 0 ? (
        <div className="card empty-limits">
          <i className="ti ti-clock-pause empty-icon" />
          <p>No limits set yet.</p>
          <p className="muted">Add limits to track and control your app usage.</p>
        </div>
      ) : (
        <div className="limits-list">
          {limits.map(l => {
            const status = getStatus(l.used_seconds, l.limit_seconds)
            const pct = Math.min(100, Math.round((l.used_seconds / l.limit_seconds) * 100))
            const barColor = status === 'exceeded' ? 'var(--red)' : status === 'warn' ? 'var(--amber)' : l.is_productive ? 'var(--green)' : 'var(--blue)'
            return (
              <div key={l.app_name} className="limit-item card">
                <div className="limit-top">
                  <div className="limit-app">
                    <span className="limit-app-name">{l.app_name}</span>
                    {l.is_productive && <span className="pill pill-green">Productive</span>}
                  </div>
                  <div className="limit-right">
                    <span className={`pill pill-${status === 'exceeded' ? 'red' : status === 'warn' ? 'amber' : 'green'}`}>
                      {status === 'exceeded' ? 'Exceeded' : status === 'warn' ? `${pct}%` : 'OK'}
                    </span>
                    <button className="remove-btn" onClick={() => remove(l.app_name)} title="Remove limit">
                      <i className="ti ti-x" />
                    </button>
                  </div>
                </div>
                <div className="prog-wrap limit-prog">
                  <div className="prog-bar" style={{width: `${pct}%`, background: barColor}} />
                </div>
                <div className="limit-footer">
                  <span className="mono">{fmtSeconds(l.used_seconds)} used</span>
                  <span className="mono muted">limit: {fmtSeconds(l.limit_seconds)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
