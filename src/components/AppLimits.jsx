import { useState, useEffect } from 'react'
import { IconPlus, IconX, IconClockPause, IconPencil, IconCheck } from '@tabler/icons-react'
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

function secsToHM(s) {
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) }
}

const CATEGORIES = ['Work', 'Social', 'Entertainment', 'Utility', 'Other']

export default function AppLimits({ api, refreshKey, onRefresh }) {
  const [limits, setLimits] = useState([])
  const [trackedApps, setTrackedApps] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [newApp, setNewApp] = useState('')
  const [newHours, setNewHours] = useState('1')
  const [newMins, setNewMins] = useState('0')
  const [newProd, setNewProd] = useState(false)
  const [newCategory, setNewCategory] = useState('Other')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingApp, setEditingApp] = useState(null)  // app_name being edited inline
  const [editHours, setEditHours] = useState('1')
  const [editMins, setEditMins] = useState('0')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getLimits(),
      api.getTodayUsage ? api.getTodayUsage() : Promise.resolve([])
    ]).then(([limitsData, usageData]) => {
      setLimits(limitsData)
      const appNames = usageData.map(u => u.app_name)
      setTrackedApps([...new Set(appNames)].sort())
    }).catch(() => {}).finally(() => setLoading(false))
  }, [refreshKey])

  // Apps that already have a limit should not appear in the "add" dropdown
  const availableApps = trackedApps.filter(app => !limits.some(l => l.app_name === app))

  async function addLimit() {
    if (!newApp.trim()) return
    const secs = (parseInt(newHours) || 0) * 3600 + (parseInt(newMins) || 0) * 60
    if (secs === 0) return
    setSaving(true)
    await api.setLimit({ app_name: newApp.trim(), limit_seconds: secs, is_productive: newProd, category: newCategory })
    setSaving(false)
    setNewApp(''); setNewHours('1'); setNewMins('0'); setNewProd(false); setNewCategory('Other')
    setShowAdd(false)
    onRefresh()
  }

  async function remove(app_name) {
    await api.removeLimit({ app_name })
    if (editingApp === app_name) setEditingApp(null)
    onRefresh()
  }

  function startEdit(l) {
    const { h, m } = secsToHM(l.limit_seconds)
    setEditHours(String(h))
    setEditMins(String(m))
    setEditingApp(l.app_name)
  }

  function cancelEdit() {
    setEditingApp(null)
  }

  async function saveEdit(l) {
    const secs = (parseInt(editHours) || 0) * 3600 + (parseInt(editMins) || 0) * 60
    if (secs === 0) return
    setEditSaving(true)
    await api.setLimit({
      app_name: l.app_name,
      limit_seconds: secs,
      is_productive: l.is_productive,
      category: l.category || 'Other'
    })
    setEditSaving(false)
    setEditingApp(null)
    onRefresh()
  }

  if (loading) return <div className="empty-state">Loading limits...</div>

  return (
    <div className="app-limits">
      <div className="limits-header">
        <p className="limits-desc">Set daily time limits per app. You'll get a notification at 80% and when the limit is hit — the app will be closed automatically.</p>
        <button className="btn-add" onClick={() => setShowAdd(v => !v)}>
          <IconPlus size={16} /> Add limit
        </button>
      </div>

      {showAdd && (
        <div className="card add-form">
          <div className="form-row">
            <label>App name</label>
            <select
              className="form-input form-select"
              value={newApp}
              onChange={e => setNewApp(e.target.value)}
              autoFocus
            >
              <option value="">Select an app...</option>
              {availableApps.map(app => (
                <option key={app} value={app}>{app}</option>
              ))}
            </select>
            {trackedApps.length === 0 && (
              <div className="form-hint">No apps tracked yet. Open some apps and they'll appear here.</div>
            )}
            {trackedApps.length > 0 && availableApps.length === 0 && (
              <div className="form-hint">All tracked apps already have limits set.</div>
            )}
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
            <label>Category</label>
            <select className="form-input form-select form-select-sm" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-row form-row-inline">
            <label>Productive app</label>
            <button className={`toggle-btn ${newProd ? 'on' : ''}`} onClick={() => setNewProd(v => !v)}>
              {newProd ? 'Yes' : 'No'}
            </button>
          </div>
          <div className="form-actions">
            <button className="btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn-save" onClick={addLimit} disabled={saving || !newApp}>
              {saving ? 'Saving...' : 'Save limit'}
            </button>
          </div>
        </div>
      )}

      {limits.length === 0 ? (
        <div className="card empty-limits">
          <IconClockPause size={48} className="empty-icon" />
          <p>No limits set yet.</p>
          <p className="muted">Add limits to track and control your app usage.</p>
        </div>
      ) : (
        <div className="limits-list">
          {limits.map(l => {
            const status = getStatus(l.used_seconds, l.limit_seconds)
            const pct = Math.min(100, Math.round((l.used_seconds / l.limit_seconds) * 100))
            const barColor = status === 'exceeded' ? 'var(--red)' : status === 'warn' ? 'var(--amber)' : l.is_productive ? 'var(--green)' : 'var(--blue)'
            const isEditing = editingApp === l.app_name

            return (
              <div key={l.app_name} className={`limit-item card ${status === 'exceeded' ? 'limit-exceeded' : ''}`}>
                <div className="limit-top">
                  <div className="limit-app">
                    <span className="limit-app-name">{l.app_name}</span>
                    {l.category && l.category !== 'Other' && (
                      <span className="pill pill-blue">{l.category}</span>
                    )}
                    {l.is_productive === 1 && <span className="pill pill-green">Productive</span>}
                  </div>
                  <div className="limit-right">
                    <span className={`pill pill-${status === 'exceeded' ? 'red' : status === 'warn' ? 'amber' : 'green'}`}>
                      {status === 'exceeded' ? 'Exceeded' : status === 'warn' ? `${pct}%` : 'OK'}
                    </span>
                    {/* Inline edit trigger */}
                    {!isEditing && (
                      <button className="edit-btn" onClick={() => startEdit(l)} title="Edit limit">
                        <IconPencil size={14} />
                      </button>
                    )}
                    <button className="remove-btn" onClick={() => remove(l.app_name)} title="Remove limit">
                      <IconX size={16} />
                    </button>
                  </div>
                </div>

                <div className="prog-wrap limit-prog">
                  <div className="prog-bar" style={{width: `${pct}%`, background: barColor}} />
                </div>

                {isEditing ? (
                  <div className="limit-edit-row">
                    <span className="edit-label mono">New limit:</span>
                    <div className="time-inputs">
                      <input
                        className="form-input time-in"
                        value={editHours}
                        onChange={e => setEditHours(e.target.value)}
                        type="number" min="0" max="23"
                        autoFocus
                      />
                      <span className="time-sep">h</span>
                      <input
                        className="form-input time-in"
                        value={editMins}
                        onChange={e => setEditMins(e.target.value)}
                        type="number" min="0" max="59" step="5"
                      />
                      <span className="time-sep">m</span>
                    </div>
                    <div className="edit-actions">
                      <button className="btn-cancel btn-cancel-sm" onClick={cancelEdit}>Cancel</button>
                      <button
                        className="btn-save btn-save-sm"
                        onClick={() => saveEdit(l)}
                        disabled={editSaving}
                      >
                        <IconCheck size={13} />
                        {editSaving ? 'Saving...' : 'Update'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="limit-footer">
                    <span className="mono">{fmtSeconds(l.used_seconds)} used</span>
                    <span className="mono muted">limit: {fmtSeconds(l.limit_seconds)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
