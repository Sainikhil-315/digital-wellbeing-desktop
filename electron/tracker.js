const { exec } = require('child_process')
const { platform } = require('os')

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

// Uses GetForegroundWindow via PowerShell + .NET interop — actually gets the focused window
function pollWindows(callback) {
  const script = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  using System.Diagnostics;
  public class WinUtil {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
    public static string GetForegroundProcessName() {
      int pid = 0;
      GetWindowThreadProcessId(GetForegroundWindow(), out pid);
      try { return Process.GetProcessById(pid).ProcessName; } catch { return ""; }
    }
  }
"@ -Language CSharp 2>$null
[WinUtil]::GetForegroundProcessName()
`.trim()

  exec(`powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
    { timeout: 4000 },
    (err, stdout) => {
      if (err || !stdout.trim()) return
      callback(cleanWindowsProcessName(stdout.trim()))
    }
  )
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