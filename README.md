# Digital Wellbeing — Desktop App

A cross-platform Electron + React desktop app for tracking screen time, enforcing app limits, running Pomodoro focus sessions, and reviewing weekly usage — built for Windows first.

---

## Stack

| Layer | Tech |
|---|---|
| Desktop | Electron 29 |
| UI | React 18 + Vite |
| Database | better-sqlite3 (local, no server) |
| IPC | Electron ipcMain / ipcRenderer |
| Fonts | Space Mono + DM Sans |

---

## Getting Started

### 1. Prerequisites

- **Node.js 18+** — https://nodejs.org
- **Python** (for native module build) — https://python.org
- **Visual Studio Build Tools** (Windows) — needed for `better-sqlite3`
  - Install via: `npm install --global windows-build-tools`
  - OR install "Desktop development with C++" workload from Visual Studio Installer

### 2. Install dependencies

```bash
npm install
```

> On Windows, `better-sqlite3` compiles a native addon. This requires the build tools above.
> If you hit errors, run: `npm install --global node-gyp` then retry.

### 3. Run in development

```bash
npm run dev
```

This starts Vite (port 5173) and Electron together via `concurrently`.

---

## Project Structure

```
digital-wellbeing/
├── electron/
│   ├── main.js       # Electron main process, IPC setup, tracker polling
│   ├── preload.js    # Secure contextBridge API exposed to renderer
│   ├── db.js         # SQLite schema + all queries (better-sqlite3)
│   └── tracker.js    # OS-level active window polling (Windows/macOS/Linux)
├── src/
│   ├── App.jsx / App.css          # Shell: titlebar, sidebar, routing
│   ├── components/
│   │   ├── Dashboard.jsx/.css     # Metrics, top apps, hourly activity
│   │   ├── AppLimits.jsx/.css     # Per-app time limits + alerts
│   │   ├── FocusMode.jsx/.css     # Pomodoro timer (25/5/15 modes)
│   │   └── WeeklyReport.jsx/.css  # 7-day bar chart + insight cards
│   ├── index.css    # CSS variables, reset, global styles
│   └── main.jsx     # React entry point
├── index.html
├── vite.config.js
└── package.json
```

---

## OS-Level App Tracking

### Windows (primary target)
Uses PowerShell to detect the foreground window's process name every 5 seconds:
```powershell
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object CPU | Select-Object -First 1
```
Process names are mapped to friendly names (e.g. `msedge` → `Microsoft Edge`).

### macOS (supported)
Uses `osascript` to query the frontmost application via System Events.

### Linux (supported)
Uses `xdotool getactivewindow getwindowname`.

---

## SQLite Database

Stored at: `%APPDATA%\digital-wellbeing\wellbeing.db` (Windows)

### Schema

```sql
-- Raw usage events (5s intervals)
usage_log (id, app_name, date, timestamp, duration_seconds)

-- Per-app daily limits
app_limits (app_name, limit_seconds, is_productive, notified_warn, notified_exceeded)

-- Completed Pomodoro sessions
focus_sessions (id, label, start_time, end_time, duration_seconds, completed)
```

---

## IPC API

The renderer calls these via `window.electronAPI`:

| Method | Returns |
|---|---|
| `getTodayUsage()` | `[{app_name, total_seconds}]` sorted by usage |
| `getWeeklyUsage()` | `[{date, total_seconds}]` for last 7 days |
| `getLimits()` | `[{app_name, limit_seconds, used_seconds, ...}]` |
| `setLimit({app_name, limit_seconds, is_productive})` | `{ok}` |
| `removeLimit({app_name})` | `{ok}` |
| `getSessions()` | Today's focus sessions |
| `saveSession(session)` | `{ok}` |
| `getStats()` | `{today_seconds, weekly_avg_seconds, focus_today_seconds, limit_alerts}` |

---

## Building for Distribution

```bash
npm run build
```

Outputs a Windows NSIS installer to `dist-electron/`.

---

## Roadmap

- [ ] AI weekly analysis (Anthropic API integration)
- [ ] Settings page (polling interval, theme, notification preferences)
- [ ] App blocking during Focus Mode
- [ ] App category tagging (work / social / entertainment)
- [ ] Export usage data as CSV
- [ ] Goals / streaks system
