import { useState, useEffect } from 'react'
import './UpdateBanner.css'

/**
 * Listens for update-status events from the main process and shows
 * a banner at the bottom of the sidebar when an update is ready.
 *
 * States:
 *   idle        → nothing shown
 *   available   → "Downloading update vX.X.X..." (auto-downloading)
 *   downloading → progress bar
 *   ready       → "Relaunch to update" banner (actionable)
 *   error       → silent, no UI noise
 */
export default function UpdateBanner() {
  const [update, setUpdate] = useState(null) // { status, version, percent }

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return
    const cleanup = window.electronAPI.onUpdateStatus((data) => {
      setUpdate(data)
    })
    return cleanup
  }, [])

  if (!update || update.status === 'error') return null

  if (update.status === 'available') {
    return (
      <div className="update-banner update-banner--downloading">
        <i className="ti ti-download update-icon" />
        <div className="update-text">
          <span className="update-label">Update found</span>
          <span className="update-sub">v{update.version} · downloading…</span>
        </div>
        <div className="update-spinner" />
      </div>
    )
  }

  if (update.status === 'downloading') {
    return (
      <div className="update-banner update-banner--downloading">
        <i className="ti ti-download update-icon" />
        <div className="update-text">
          <span className="update-label">Downloading update</span>
          <span className="update-sub">{update.percent}%</span>
        </div>
        <div className="update-prog-wrap">
          <div className="update-prog-bar" style={{ width: `${update.percent}%` }} />
        </div>
      </div>
    )
  }

  if (update.status === 'ready') {
    return (
      <button
        className="update-banner update-banner--ready"
        onClick={() => window.electronAPI.installUpdate()}
        title={`Relaunch to install v${update.version}`}
      >
        <div className="update-leaf">
          <i className="ti ti-leaf" />
        </div>
        <div className="update-text">
          <span className="update-label">Relaunch to update</span>
          <span className="update-sub">v{update.version} ready</span>
        </div>
        <i className="ti ti-arrow-right update-arrow" />
      </button>
    )
  }

  return null
}