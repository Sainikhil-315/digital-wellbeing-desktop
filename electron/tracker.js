const { exec } = require('child_process')
const { platform } = require('os')
const fs = require('fs')
const path = require('path')
const os_module = require('os')
const { BLOCKED_PROCESSES } = require('./blocklist')

const os = platform()

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
  'whatsapp':        'WhatsApp',
  'telegram':        'Telegram',
  'signal':          'Signal',
}

// Strip UWP host/helper suffixes before lookup
function normalizeProcessName(raw) {
  return raw.replace(/\.(root|desktop|backgroundhost|helper|backgroundtaskhost)$/i, '').trim()
}

const STATIC_REVERSE = {}
for (const [proc, name] of Object.entries(STATIC_MAP)) {
  STATIC_REVERSE[name.toLowerCase()] = proc
}

let dynamicMap = {}
let dynamicReverse = {}

function extractDisplayName(title) {
  const parts = title.split(/ [–—-] /)
  return parts[parts.length - 1].trim() || title.trim()
}

function refreshDynamicProcesses() {
  if (os !== 'win32') return
  exec(
    "powershell -NoProfile -Command \"Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object Name, MainWindowTitle | ConvertTo-Json -Compress\"",
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
          if (STATIC_MAP[procLower]) continue
          const displayName = extractDisplayName(item.MainWindowTitle)
          if (!displayName) continue
          if (!newMap[procLower]) {
            newMap[procLower] = displayName
            newReverse[displayName.toLowerCase()] = item.Name
          }
        }
        dynamicMap = newMap
        dynamicReverse = newReverse
      } catch (e) {}
    }
  )
}

refreshDynamicProcesses()
setInterval(refreshDynamicProcesses, 30000)

function getProcessNameFor(friendlyName) {
  if (!friendlyName) return null
  const lower = friendlyName.toLowerCase()
  return STATIC_REVERSE[lower] || dynamicReverse[lower] || null
}

function getAllKnownApps() {
  const result = { ...STATIC_MAP }
  for (const [proc, name] of Object.entries(dynamicMap)) {
    if (!result[proc]) result[proc] = name
  }
  return result
}

function pollActiveWindow(callback) {
  if (os === 'win32') pollWindows(callback)
  else if (os === 'darwin') pollMacOS(callback)
  else pollLinux(callback)
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
            try { return Process.GetProcessById(pid).ProcessName; } catch {}
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
        callback(resolveProcessName(processName))
      }
    )
  } catch (e) {
    console.error('[Tracker] Script error:', e.message)
  }
}

function resolveProcessName(rawName) {
  const normalized = normalizeProcessName(rawName)
  const lower = normalized.toLowerCase()
  if (BLOCKED_PROCESSES.has(lower)) return null
  for (const [key, val] of Object.entries(STATIC_MAP)) {
    if (lower.includes(key)) return val
  }
  if (dynamicMap[lower]) return dynamicMap[lower]
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
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
