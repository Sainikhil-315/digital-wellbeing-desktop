# Digital Wellbeing — Desktop App

A Windows-first Electron + React desktop app for tracking screen time, enforcing app limits, running Pomodoro focus sessions, and reviewing weekly usage. Runs silently in the system tray — tracking happens in the background without keeping a window open.

---

## Features

- **Screen time tracking** — polls the active window every 5 seconds, records usage to a local SQLite database
- **App limits** — set daily time limits per app, get notifications at 80% and 100%
- **Focus mode** — Pomodoro timer (25/5/15 min modes) with aggressive app blocking; kills non-whitelisted processes every second
- **Weekly report** — 7-day bar chart, streak tracking, productive vs. distraction breakdown
- **System tray** — runs in background; window hides on close, tray icon gives quick access
- **Auto-launch** — starts hidden at Windows login, tray only
- **Auto-update** — checks GitHub Releases every 4 hours, shows download progress banner, one-click relaunch to install

---

## Stack

| Layer | Tech |
|---|---|
| Desktop | Electron 29 |
| UI | React 18 + Vite |
| Database | sql.js (SQLite WASM, no native build required) |
| Icons | @tabler/icons-react |
| IPC | Electron ipcMain / ipcRenderer via contextBridge |
| Updates | electron-updater + GitHub Releases |

---

## Getting Started

### 1. Prerequisites

- **Node.js 18+** — https://nodejs.org

No native build tools required — the database uses sql.js (WASM-based SQLite).

### 2. Install dependencies

```bash
npm install
```

### 3. Run in development

```bash
npm run dev
```

Starts Vite (port 5173) and Electron together via `concurrently`.

---

## Project Structure

```
digital-wellbeing/
├── assets/
│   └── tray-icon.png          # System tray icon
├── electron/
│   ├── main.js                # Main process: window, tray, tracker, IPC, focus mode
│   ├── preload.js             # contextBridge API exposed to renderer
│   ├── db.js                  # SQLite schema + all queries (sql.js WASM)
│   └── tracker.js             # OS-level active window polling (Win/macOS/Linux)
├── src/
│   ├── App.jsx / App.css      # Shell: titlebar, sidebar, routing
│   ├── components/
│   │   ├── Dashboard.jsx      # Today's usage, top apps, hourly chart
│   │   ├── AppLimits.jsx      # Per-app time limits + notifications
│   │   ├── FocusMode.jsx      # Pomodoro timer + app blocking
│   │   ├── WeeklyReport.jsx   # 7-day chart + insight cards
│   │   └── UpdateBanner.jsx   # Auto-update download progress + install button
│   ├── index.css              # CSS variables, reset, global styles
│   └── main.jsx               # React entry point
├── index.html
├── vite.config.js
└── package.json
```

---

## OS-Level App Tracking

### Windows (primary target)
Uses PowerShell + Win32 API (`GetForegroundWindow` / `GetWindowThreadProcessId`) to detect the foreground process every 5 seconds. Process names are mapped to friendly names (e.g. `msedge` → `Microsoft Edge`).

### macOS
Uses `osascript` to query the frontmost application via System Events.

### Linux
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
| `getHourlyUsage()` | `[{hour, total_seconds}]` for today |
| `getLimits()` | `[{app_name, limit_seconds, used_seconds, ...}]` |
| `setLimit({app_name, limit_seconds, is_productive})` | `{ok}` |
| `removeLimit({app_name})` | `{ok}` |
| `getSessions()` | Today's focus sessions |
| `saveSession(session)` | `{ok}` |
| `getStats()` | `{today_seconds, weekly_avg_seconds, focus_today_seconds, limit_alerts}` |
| `startFocusMode({apps})` | Activates blocking, kills non-whitelisted apps |
| `stopFocusMode()` | Deactivates blocking |

---

## Building for Distribution

```bash
npm run build
```

Outputs a Windows NSIS installer to `dist-electron/Digital-Wellbeing-Setup-<version>.exe`.

### Releasing to GitHub

Releases are published to GitHub Releases and picked up by `electron-updater` in installed copies.

Requires `GH_TOKEN` in a `.env` file at the project root with `repo` scope (classic PAT) or `Contents: Read and write` (fine-grained PAT).

```bash
npm run release
```

---

## Roadmap

- [ ] AI weekly analysis (Anthropic API integration)
- [ ] Settings page (polling interval, theme, notification preferences)
- [ ] App category tagging (work / social / entertainment)
- [ ] Export usage data as CSV
- [ ] Goals / streaks system
