# Digital Wellbeing — Desktop App

A Windows-first Electron + React desktop app for tracking screen time, enforcing app limits, and reviewing weekly usage patterns. Runs silently in the system tray — tracking happens in the background without keeping a window open.

---

## Features

- **Screen time tracking** — polls the active window every 5 seconds, records usage to a local SQLite database
- **App limits** — set daily time limits per app with soft (notify) or hard (force-close) enforcement, warning thresholds, grace periods, and snooze
- **App usage & categories** — full sortable table of every app used today; click any category pill to override auto-classification permanently
- **Weekly report** — 7-day bar chart, insight cards (peak day, best day, daily avg, week comparison), app consistency grid, hourly heatmap
- **Dashboard** — today's metrics, hourly activity chart, category breakdown, goal tracker calendar with streak badge
- **System tray** — runs in background; window hides on close, tray icon gives quick access
- **Auto-launch** — starts hidden at Windows login, tray only
- **Auto-update** — checks GitHub Releases every 4 hours, shows download progress banner, one-click relaunch to install
- **Export CSV** — exports last 30 days of usage data to Downloads folder

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
│   ├── main.js                # Main process: window, tray, tracker, IPC, updater
│   ├── preload.js             # contextBridge API exposed to renderer
│   ├── db.js                  # SQLite schema + all queries (sql.js WASM)
│   ├── tracker.js             # OS-level active window polling + process normalization
│   ├── blocklist.js           # System process blocklist (OpenWith, WerFault, etc.)
│   ├── classifier.js          # App name → category classifier (200+ entries)
│   └── iconResolver.js        # Resolves app icons from Windows registry/executables
├── src/
│   ├── App.jsx / App.css      # Shell: titlebar, sidebar, tab routing
│   ├── components/
│   │   ├── Dashboard.jsx      # Today's metrics, hourly chart, category breakdown, calendar
│   │   ├── AppUsage.jsx       # Per-app usage table with sortable columns + category override
│   │   ├── AppLimits.jsx      # Per-app time limits + soft/hard enforcement
│   │   ├── WeeklyReport.jsx   # 7-day chart, insight cards, heatmap, consistency grid
│   │   ├── Settings.jsx       # Tracking, notifications, data, about panels
│   │   └── UpdateBanner.jsx   # Auto-update download progress + install button
│   ├── index.css              # CSS variables, reset, global styles
│   └── main.jsx               # React entry point
├── website/
│   ├── index.html             # Marketing / landing page
│   └── docs.html              # Full user documentation
├── index.html
├── vite.config.js
└── package.json
```

---

## OS-Level App Tracking

### Windows (primary target)
Uses PowerShell + Win32 API (`GetForegroundWindow` / `GetWindowThreadProcessId`) to detect the foreground process every 5 seconds. Process names are normalized (UWP suffixes like `.Root`, `.Desktop`, `.BackgroundHost` stripped) then mapped to friendly names via a 200+ entry static map and substring classifier.

### macOS / Linux
Placeholder stubs exist but are untested and not actively supported.

---

## SQLite Database

Stored at: `%APPDATA%\digital-wellbeing\wellbeing.db` (Windows)

### Schema

```sql
-- Raw usage events (5s intervals)
usage_log (id, app_name, date, timestamp, duration_seconds)

-- Per-app daily limits
app_limits (app_name, limit_seconds, is_productive, category, kill_on_exceeded,
            notified_warn, notified_exceeded, snooze_until)

-- Known apps with user-overridable categories
known_apps (app_name, category, user_overridden)

-- App settings (key/value)
settings (key, value)
```

---

## IPC API

The renderer calls these via `window.electronAPI`:

| Method | Returns |
|---|---|
| `getTodayUsage()` | `[{app_name, total_seconds}]` sorted by usage |
| `getWeeklyUsage()` | `[{date, total_seconds}]` for last 7 days |
| `getHourlyUsage()` | `number[24]` seconds per hour today |
| `getLimits()` | `[{app_name, limit_seconds, used_seconds, kill_on_exceeded, ...}]` |
| `setLimit(data)` | `{ok}` |
| `removeLimit({app_name})` | `{ok}` |
| `getStats()` | `{today_seconds, weekly_avg_seconds, limit_alerts}` |
| `getAppUsageDetailed()` | `[{app_name, total_seconds, open_count, category}]` |
| `setAppCategory({app_name, category})` | `{ok}` — persists with user_overridden flag |
| `getCategoryBreakdown()` | `[{category, total_seconds}]` |
| `getProductivityScore()` | `{score, productive_seconds, total_seconds}` |
| `getStreak()` | `number` consecutive tracked days |
| `getAppTrends()` | `{app_name: pct_delta}` vs 7-day avg |
| `getUsageCalendar(days)` | `[{date, total_seconds}]` |
| `getLongestFocus()` | `{app_name, duration_ms}` |
| `getWeekComparison()` | `{this_week_seconds, last_week_seconds, same_day_last_week_seconds}` |
| `getWeeklyHeatmap()` | `{days, matrix}` 7×24 grid |
| `getWeeklyTopApps()` | `[{app_name, total_seconds, days_active}]` |
| `snoozeApp({app_name})` | Suspends limit enforcement for 15 min |
| `exportCsv()` | Saves last 30 days as CSV to Downloads |
| `getSettings()` | `{key: value}` all settings |
| `saveSetting({key, value})` | `{ok}` |

---

## Building for Distribution

```bash
npm run build
```

Outputs a Windows NSIS installer to `dist/Digital-Wellbeing-Setup-<version>.exe`.

### Releasing to GitHub

Requires `GH_TOKEN` in a `.env` file at the project root with `repo` scope (classic PAT) or `Contents: Read and write` (fine-grained PAT).

```bash
npm run release
```

Or manually:
1. `npm run build` to produce the installer
2. Create a GitHub Release tagged `v3.0.0`
3. Upload `Digital-Wellbeing-Setup-3.0.0.exe` as the release asset

`electron-updater` in installed copies will pick up the new release automatically within 4 hours.

---

## Privacy

All data is stored locally in SQLite. No telemetry, no analytics, no accounts. The only outbound request is a version check against GitHub Releases every 4 hours — no device ID or usage data is sent.
