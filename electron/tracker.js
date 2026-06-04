const { exec } = require('child_process')
const { platform } = require('os')
const fs = require('fs')
const path = require('path')
const os_module = require('os')

const os = platform()

// Static map: process name (lowercase) → friendly display name
// These take priority over dynamic detection
const STATIC_MAP = {
  'chrome':          'Google Chrome',
  'firefox':         'Firefox',
  'msedge':          'Microsoft Edge',
  'code':            'VS Code',
  'windowsterminal': 'Windows Terminal',
  'notepad':         'Notepad',
  'explorer':        'File Explorer',
  'slack':           'Slack',
  'discord':         'Discord',
  'spotify':         'Spotify',
  'vlc':             'VLC',
  'teams':           'Microsoft Teams',
  'zoom':            'Zoom',
  'photoshop':       'Photoshop',
  'figma':           'Figma',
  'obs64':           'OBS Studio',
  'obs32':           'OBS Studio',
}

// Reverse of STATIC_MAP: friendly name (lowercase) → process name
const STATIC_REVERSE = {}
for (const [proc, name] of Object.entries(STATIC_MAP)) {
  STATIC_REVERSE[name.toLowerCase()] = proc
}

// Dynamic maps populated from live Get-Process query
let dynamicMap = {}        // processName (lower) → displayName (for unknown apps)
let dynamicReverse = {}    // displayName (lower) → processName

function extractDisplayName(title) {
  // "Gmail - Google Chrome" → "Google Chrome"
  // "index.js — VS Code"   → "VS Code"
  // "Slack"                → "Slack"
  const parts = title.split(/ [–—-] /)
  return parts[parts.length - 1].trim() || title.trim()
}

function refreshDynamicProcesses() {
  if (os !== 'win32') return
  exec(
    'powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \'\'} | Select-Object Name, MainWindowTitle | ConvertTo-Json -Compress"',
    { timeout: 6000, maxBuffer: 512 * 1024 },
    (err, stdout) => {
      if (err || !stdout.trim()) return
      try {
        let items = JSON.parse(stdout.trim())
        if (!Array.isArray(items)) items = [items]
        const newMap = {}
        const newReverse = {}
        for (const item of items) {
          if (!item || !item.Name || !item.MainWindowTitle) continue
          const procLower = item.Name.toLowerCase()
          // Static map takes priority — skip known processes
          if (STATIC_MAP[procLower]) continue
          const displayName = extractDisplayName(item.MainWindowTitle)
          if (!displayName) continue
          // Only store if not already mapped (first window title wins per process)
          if (!newMap[procLower]) {
            newMap[procLower] = displayName
            newReverse[displayName.toLowerCase()] = item.Name
          }
        }
        dynamicMap = newMap
        dynamicReverse = newReverse
      } catch (e) { /* malformed JSON — ignore */ }
    }
  )
}

// Run once at startup, then every 30s
refreshDynamicProcesses()
setInterval(refreshDynamicProcesses, 30000)

// Returns process name (e.g. "chrome") for a given friendly name (e.g. "Google Chrome")
// Used by main.js to kill apps. Returns null if unknown.
function getProcessNameFor(friendlyName) {
  if (!friendlyName) return null
  const lower = friendlyName.toLowerCase()
  if (STATIC_REVERSE[lower]) return STATIC_REVERSE[lower]
  if (dynamicReverse[lower]) return dynamicReverse[lower]
  return null
}

// Returns merged map of ALL known apps: { processName: displayName }
// Used by focus mode to enumerate killable apps
function getAllKnownApps() {
  const result = { ...STATIC_MAP }
  for (const [proc, name] of Object.entries(dynamicMap)) {
    if (!result[proc]) result[proc] = name
  }
  return result
}

function pollActiveWindow(callback) {
  if (os === 'win32') {
    pollWindows(callback)
  } else if (os === 'darwin') {
    pollMacOS(callback)
  } else {
    pollLinux(callback)
  }
}

function pollWindows(callback) {
  const scriptContent = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;

public class WinUtil {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);

    public static string GetActiveProcessName() {
        int pid = 0;
        IntPtr hwnd = GetForegroundWindow();
        GetWindowThreadProcessId(hwnd, out pid);
        if (pid > 0) {
            try {
                return Process.GetProcessById(pid).ProcessName;
            } catch {}
        }
        return "";
    }
}
"@
$proc = [WinUtil]::GetActiveProcessName()
Write-Output $proc
`

  const tempDir = os_module.tmpdir()
  const scriptPath = path.join(tempDir, 'get_active_window.ps1')

  try {
    fs.writeFileSync(scriptPath, scriptContent)
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { timeout: 4000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        try { fs.unlinkSync(scriptPath) } catch (e) {}
        if (err) return
        const processName = stdout.trim()
        if (!processName) return
        const cleanName = resolveProcessName(processName)
        callback(cleanName)
      }
    )
  } catch (e) {
    console.error('[Tracker] Script error:', e.message)
  }
}

function resolveProcessName(rawName) {
  const lower = rawName.toLowerCase()
  // 1. Static map (exact or substring match for known apps)
  for (const [key, val] of Object.entries(STATIC_MAP)) {
    if (lower.includes(key)) return val
  }
  // 2. Dynamic map (exact match from live process list)
  if (dynamicMap[lower]) return dynamicMap[lower]
  // 3. Fallback: capitalize first letter of raw process name
  return rawName.charAt(0).toUpperCase() + rawName.slice(1)
}

function pollMacOS(callback) {
  exec(
    `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
    { timeout: 4000 },
    (err, stdout) => {
      if (err || !stdout.trim()) return
      callback(stdout.trim())
    }
  )
}

function pollLinux(callback) {
  exec('xdotool getactivewindow getwindowname', { timeout: 4000 }, (err, stdout) => {
    if (err || !stdout.trim()) return
    const title = stdout.trim()
    const parts = title.split(/ [—\-] /)
    callback(parts[parts.length - 1].trim())
  })
}

module.exports = { pollActiveWindow, getProcessNameFor, getAllKnownApps, refreshDynamicProcesses }
