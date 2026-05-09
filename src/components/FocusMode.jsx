import { useState, useEffect, useRef } from 'react'
import './FocusMode.css'

const MODES = [
  { id: 'pomodoro',    label: 'Pomodoro',    mins: 25, color: '#E24B4A' },
  { id: 'short',       label: 'Short Break', mins: 5,  color: '#5C9E2E' },
  { id: 'long',        label: 'Long Break',  mins: 15, color: '#4B8FE2' },
]

const RADIUS = 80
const CIRC = 2 * Math.PI * RADIUS

function formatTime(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

export default function FocusMode({ api, refreshKey, onRefresh }) {
  const [modeIdx, setModeIdx] = useState(0)
  const [seconds, setSeconds] = useState(MODES[0].mins * 60)
  const [total, setTotal] = useState(MODES[0].mins * 60)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState([])
  const [label, setLabel] = useState('')
  const [editingLabel, setEditingLabel] = useState(false)
  const intervalRef = useRef(null)
  const startTimeRef = useRef(null)

  const mode = MODES[modeIdx]
  const pct = seconds / total
  const offset = CIRC * (1 - pct)

  useEffect(() => {
    api.getSessions().then(setSessions).catch(() => {})
  }, [refreshKey])

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  function startStop() {
    if (running) {
      clearInterval(intervalRef.current)
      setRunning(false)
    } else {
      startTimeRef.current = Date.now()
      setRunning(true)
      intervalRef.current = setInterval(() => {
        setSeconds(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false)
            handleComplete()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
  }

  function reset() {
    clearInterval(intervalRef.current)
    setRunning(false)
    const t = mode.mins * 60
    setSeconds(t)
    setTotal(t)
  }

  async function handleComplete() {
    const now = Date.now()
    const start = startTimeRef.current || now - total * 1000
    const dur = total - seconds
    const session = {
      label: label || mode.label,
      start_time: start,
      end_time: now,
      duration_seconds: dur > 0 ? dur : total,
      completed: 1
    }
    await api.saveSession(session)
    onRefresh()
    setSessions(prev => [session, ...prev])
    reset()
  }

  function switchMode(idx) {
    clearInterval(intervalRef.current)
    setRunning(false)
    setModeIdx(idx)
    const t = MODES[idx].mins * 60
    setSeconds(t)
    setTotal(t)
  }

  function fmtSessionTime(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  return (
    <div className="focus-mode">
      <div className="focus-main">
        {/* Mode tabs */}
        <div className="mode-tabs">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              className={`mode-tab ${modeIdx === i ? 'active' : ''}`}
              style={modeIdx === i ? { borderColor: m.color, color: m.color } : {}}
              onClick={() => switchMode(i)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Timer ring */}
        <div className="timer-wrap">
          <svg width="200" height="200" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--bg-raised)" strokeWidth="8" />
            <circle
              cx="100" cy="100" r={RADIUS}
              fill="none"
              stroke={mode.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px', transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
            />
          </svg>
          <div className="timer-center">
            <div className="timer-time mono" style={{color: running ? mode.color : 'var(--text-primary)'}}>
              {formatTime(seconds)}
            </div>
            <div className="timer-label">
              {editingLabel ? (
                <input
                  className="label-input"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  onBlur={() => setEditingLabel(false)}
                  onKeyDown={e => e.key === 'Enter' && setEditingLabel(false)}
                  placeholder="Session name..."
                  autoFocus
                />
              ) : (
                <span onClick={() => setEditingLabel(true)} className="label-text" title="Click to name session">
                  {label || mode.label} <i className="ti ti-pencil" style={{fontSize:10,opacity:0.4}} />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="timer-controls">
          <button className="ctrl-btn" onClick={reset} title="Reset">
            <i className="ti ti-refresh" />
          </button>
          <button className="ctrl-btn ctrl-primary" onClick={startStop} style={{background: mode.color, borderColor: mode.color}}>
            <i className={`ti ${running ? 'ti-player-pause-filled' : 'ti-player-play-filled'}`} />
            {running ? 'Pause' : 'Start'}
          </button>
          <button className="ctrl-btn" onClick={handleComplete} title="Mark done" disabled={!running && seconds === total}>
            <i className="ti ti-check" />
          </button>
        </div>
      </div>

      {/* Sessions list */}
      <div className="sessions-panel card">
        <div className="card-title">Today's sessions</div>
        {sessions.length === 0 ? (
          <div className="empty-sessions">No sessions completed yet. Start your first Pomodoro!</div>
        ) : (
          <div className="sessions-list">
            {sessions.map((s, i) => (
              <div key={i} className="session-row">
                <div className="session-info">
                  <span className="session-name">{s.label || 'Focus session'}</span>
                  <span className="session-time mono">
                    {fmtSessionTime(s.start_time)}
                    {s.end_time ? ` – ${fmtSessionTime(s.end_time)}` : ''}
                  </span>
                </div>
                <span className="pill pill-green">
                  {Math.round((s.duration_seconds || 0) / 60)}m
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
