import { useState, useEffect, useRef, useCallback } from 'react'
import { IconApps, IconCircleCheckFilled, IconPencil, IconRefresh, IconPlayerPlayFilled, IconPlayerPauseFilled, IconCheck } from '@tabler/icons-react'
import './FocusMode.css'

const RADIUS = 100
const CENTER = 120
const EDGE_RADIUS = RADIUS + 15

function getAngleFromMouse(e, canvas) {
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left - CENTER
  const y = e.clientY - rect.top - CENTER
  let angle = Math.atan2(y, x) * (180 / Math.PI) + 90
  if (angle < 0) angle += 360
  return angle
}

function angleToMinutes(angle) {
  return Math.round((angle / 360) * 60) % 60
}

function minutesToAngle(mins) {
  return (mins / 60) * 360
}

export default function FocusMode({ api, refreshKey, onRefresh }) {
  const [minutes, setMinutes] = useState(25)
  const [displayMinutes, setDisplayMinutes] = useState(25)
  const [displaySeconds, setDisplaySeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [sessions, setSessions] = useState([])
  const [label, setLabel] = useState('')
  const [editingLabel, setEditingLabel] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [trackedApps, setTrackedApps] = useState([])
  const [selectedApps, setSelectedApps] = useState([])
  const [showAppSelector, setShowAppSelector] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)

  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const secondIntervalRef = useRef(null)
  const startTimeRef = useRef(null)
  const totalMinutesRef = useRef(25)
  const secondsCounterRef = useRef(0)

  useEffect(() => {
    setLoadingSessions(true)
    Promise.all([
      api.getSessions(),
      api.getTodayUsage?.() || Promise.resolve([])
    ]).then(([s, usage]) => {
      setSessions(s)
      const appNames = usage?.map(u => u.app_name) || []
      setTrackedApps([...new Set(appNames)].sort())
    }).catch(() => {}).finally(() => setLoadingSessions(false))
  }, [refreshKey])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (secondIntervalRef.current) clearInterval(secondIntervalRef.current)
    }
  }, [])

  // Draw clock with second-lines
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = 240 * dpr
    canvas.height = 240 * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, 240, 240)

    // 60 second-tracking lines around the edge
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2 - Math.PI / 2
      const x1 = CENTER + Math.cos(angle) * EDGE_RADIUS
      const y1 = CENTER + Math.sin(angle) * EDGE_RADIUS
      const x2 = CENTER + Math.cos(angle) * (EDGE_RADIUS + 8)
      const y2 = CENTER + Math.sin(angle) * (EDGE_RADIUS + 8)

      // Check if this second has passed (light up blue if we're past it in current minute)
      const isActive = i < displaySeconds
      ctx.strokeStyle = isActive ? '#4B8FE2' : '#333230'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.globalAlpha = isActive ? 1 : 0.4
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Clock circle
    ctx.strokeStyle = 'var(--border-bright)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2)
    ctx.stroke()

    // Minute markers
    ctx.strokeStyle = 'var(--text-muted)'
    ctx.lineWidth = 1
    for (let i = 0; i < 60; i += 5) {
      const angle = (i / 60) * Math.PI * 2 - Math.PI / 2
      const x1 = CENTER + Math.cos(angle) * (RADIUS - 8)
      const y1 = CENTER + Math.sin(angle) * (RADIUS - 8)
      const x2 = CENTER + Math.cos(angle) * RADIUS
      const y2 = CENTER + Math.sin(angle) * RADIUS
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }

    // Center circle
    ctx.fillStyle = 'var(--text-primary)'
    ctx.beginPath()
    ctx.arc(CENTER, CENTER, 6, 0, Math.PI * 2)
    ctx.fill()

    // Hand
    const handAngle = minutesToAngle(displayMinutes) * (Math.PI / 180) - Math.PI / 2
    const handLength = RADIUS - 20
    const handX = CENTER + Math.cos(handAngle) * handLength
    const handY = CENTER + Math.sin(handAngle) * handLength

    ctx.strokeStyle = running ? '#4B8FE2' : '#E24B4A'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(CENTER, CENTER)
    ctx.lineTo(handX, handY)
    ctx.stroke()

  }, [displayMinutes, displaySeconds, running])

  const handleMouseDown = (e) => {
    if (running || showAppSelector) return
    setDragging(true)
  }

  const handleMouseMove = useCallback((e) => {
    if (running) return
    const angle = getAngleFromMouse(e, canvasRef.current)
    if (angle !== null) {
      const mins = angleToMinutes(angle)
      setMinutes(mins)
      setDisplayMinutes(mins)
    }
  }, [running])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  const handleComplete = useCallback(async () => {
    if (!started) return
    
    // Stop focus mode
    if (window.electronAPI?.stopFocusMode) {
      await window.electronAPI.stopFocusMode()
    }
    
    const now = Date.now()
    const start = startTimeRef.current || now
    const elapsed = totalMinutesRef.current * 60 - displayMinutes * 60 - displaySeconds
    const dur = elapsed > 0 ? elapsed : totalMinutesRef.current * 60

    const session = {
      label: label || 'Focus Session',
      start_time: start,
      end_time: now,
      duration_seconds: dur,
      completed: 1
    }
    
    await api.saveSession(session)
    onRefresh()
    setSessions(prev => [session, ...prev])
    
    // Reset
    setMinutes(25)
    setDisplayMinutes(25)
    setDisplaySeconds(0)
    setRunning(false)
    setStarted(false)
    setLabel('')
    setSelectedApps([])
    setShowAppSelector(false)
    secondsCounterRef.current = 0
  }, [label, displayMinutes, displaySeconds, started, api, onRefresh])

  function startStop() {
    if (running) {
      clearInterval(secondIntervalRef.current)
      setRunning(false)
    } else {
      if (!started) {
        startTimeRef.current = Date.now()
        setStarted(true)
        totalMinutesRef.current = minutes
        secondsCounterRef.current = 0
        setDisplaySeconds(0)
        setDisplayMinutes(minutes)

        // Start focus mode - kill non-whitelisted apps
        if (window.electronAPI?.startFocusMode && selectedApps.length > 0) {
          window.electronAPI.startFocusMode(selectedApps)
        }

        setShowAppSelector(false)
      }
      setRunning(true)
      
      // Countdown timer - tick every 1 second
      const totalSeconds = totalMinutesRef.current * 60
      secondIntervalRef.current = setInterval(() => {
        secondsCounterRef.current += 1
        const elapsedSeconds = secondsCounterRef.current
        const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds)
        const mins = Math.floor(remainingSeconds / 60)
        const secs = remainingSeconds % 60
        
        setDisplayMinutes(mins)
        setDisplaySeconds(secs)
        
        // When timer reaches 0
        if (remainingSeconds <= 0) {
          clearInterval(secondIntervalRef.current)
          setRunning(false)
          handleComplete()
        }
      }, 1000)
    }
  }

  function reset() {
    clearInterval(secondIntervalRef.current)
    setRunning(false)
    setStarted(false)
    setMinutes(25)
    setDisplayMinutes(25)
    setDisplaySeconds(0)
    setLabel('')
    setSelectedApps([])
    setShowAppSelector(false)
    secondsCounterRef.current = 0
    
    if (window.electronAPI?.stopFocusMode) {
      window.electronAPI.stopFocusMode()
    }
  }

  function toggleApp(appName) {
    setSelectedApps(prev =>
      prev.includes(appName)
        ? prev.filter(a => a !== appName)
        : [...prev, appName]
    )
  }

  function fmtSessionTime(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  return (
    <div className="focus-mode">
      <div className="timer-card card">
          <div className="clock-container">
            <canvas 
              ref={canvasRef}
              className="clock-canvas"
              onMouseDown={handleMouseDown}
              style={{ cursor: (running || showAppSelector) ? 'default' : 'pointer' }}
            />
            <div className="time-display mono">
              {String(displayMinutes).padStart(2, '0')}:{String(displaySeconds).padStart(2, '0')}
              <span className="time-unit">min:sec</span>
            </div>
          </div>



          <div className="session-label">
            {editingLabel ? (
              <input
                className="label-input"
                value={label}
                onChange={e => setLabel(e.target.value)}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={e => e.key === 'Enter' && setEditingLabel(false)}
                placeholder="Name your session..."
                autoFocus
              />
            ) : (
              <span 
                className="label-text" 
                onClick={() => setEditingLabel(true)}
                title="Click to name session"
              >
                {label || 'Focus Session'} 
                <IconPencil size={14} />
              </span>
            )}
          </div>

          <div className="timer-controls">
            <button 
              className="ctrl-btn btn-secondary" 
              onClick={reset}
              title="Reset timer"
              disabled={!started && minutes === 25 && displaySeconds === 0}
            >
              <IconRefresh size={16} />
              Reset
            </button>
            <button 
              className="ctrl-btn btn-primary" 
              onClick={startStop}
            >
              {running ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
              {running ? 'Pause' : 'Start'}
            </button>
            <button 
              className="ctrl-btn btn-secondary"
              onClick={handleComplete} 
              title="Mark session as complete"
              disabled={!started}
            >
              <IconCheck size={16} />
              Done
            </button>
          </div>
      </div>

      <div className="focus-sidebar">
        <div className="selected-apps-panel card">
          <div className="card-title">Whitelisted Apps</div>
          {!started ? (
            <button 
              className="btn-select-apps"
              onClick={() => setShowAppSelector(!showAppSelector)}
              style={{ marginBottom: '8px' }}
            >
              <IconApps size={16} />
              {selectedApps.length > 0 ? `${selectedApps.length} apps` : 'Select Apps'}
            </button>
          ) : (
            <div className="active-apps-list">
              {selectedApps.length === 0 ? (
                <div className="no-apps">No apps selected</div>
              ) : (
                selectedApps.map(app => (
                  <div key={app} className="active-app-item">
                    <IconCircleCheckFilled size={16} />
                    {app}
                  </div>
                ))
              )}
            </div>
          )}
          {showAppSelector && !started && (
            <div className="app-selector">
              <div className="selector-title">All Tracked Apps</div>
              <div className="app-checkboxes">
                {trackedApps.length === 0 ? (
                  <div className="no-apps">No apps tracked yet</div>
                ) : (
                  trackedApps.map(app => (
                    <label key={app} className="app-checkbox">
                      <input 
                        type="checkbox"
                        checked={selectedApps.includes(app)}
                        onChange={() => toggleApp(app)}
                      />
                      <span>{app}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="sessions-panel card">
        <div className="card-title">Today's sessions</div>
        {loadingSessions ? (
          <div className="empty-sessions">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="empty-sessions">No sessions yet. Start focusing!</div>
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
                <span className="pill pill-blue">
                  {Math.round((s.duration_seconds || 0) / 60)}m
                </span>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
