const { exec } = require('child_process')
const { platform } = require('os')
const fs = require('fs')
const path = require('path')
const os_module = require('os')

const os = platform()

function pollActiveWindow(callback) {
  if (os === 'win32') {
    pollWindows(callback)
  } else if (os === 'darwin') {
    pollMacOS(callback)
  } else {
    pollLinux(callback)
  }
}

// Uses a temp PowerShell script file to get the active window
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
      (err, stdout, stderr) => {
        try {
          fs.unlinkSync(scriptPath)
        } catch (e) {}
        
        if (err) {
          console.error('[Tracker] PS error:', err.message.split('\n')[0])
          return
        }
        
        const processName = stdout.trim()
        if (!processName) {
          console.warn('[Tracker] No active process found')
          return
        }
        
        const cleanName = cleanWindowsProcessName(processName)
        console.log(`[Tracker] Active: ${processName} -> ${cleanName}`)
        callback(cleanName)
      }
    )
  } catch (e) {
    console.error('[Tracker] Script error:', e.message)
  }
}

function cleanWindowsProcessName(name) {
  const map = {
    'chrome': 'Google Chrome',
    'firefox': 'Firefox',
    'msedge': 'Microsoft Edge',
    'code': 'VS Code',
    'windowsterminal': 'Windows Terminal',
    'notepad': 'Notepad',
    'explorer': 'File Explorer',
    'slack': 'Slack',
    'discord': 'Discord',
    'spotify': 'Spotify',
    'vlc': 'VLC',
    'teams': 'Microsoft Teams',
    'zoom': 'Zoom',
    'photoshop': 'Photoshop',
    'figma': 'Figma',
    'obs64': 'OBS Studio',
    'obs32': 'OBS Studio',
  }
  const lower = name.toLowerCase()
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val
  }
  return name.charAt(0).toUpperCase() + name.slice(1)
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
    // Try to extract app name: last segment after ' — ' or ' - '
    const parts = title.split(/ [—\-] /)
    callback(parts[parts.length - 1].trim())
  })
}

module.exports = { pollActiveWindow }