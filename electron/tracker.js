const { exec } = require('child_process')
const { platform } = require('os')

const os = platform()

/**
 * Poll the currently active/foreground application name.
 * Calls callback(appName) with a cleaned app name string.
 */
function pollActiveWindow(callback) {
  if (os === 'win32') {
    pollWindows(callback)
  } else if (os === 'darwin') {
    pollMacOS(callback)
  } else {
    pollLinux(callback)
  }
}

// ─── Windows ────────────────────────────────────────────────────────────────
// Uses PowerShell to get the foreground window process name
const WIN_SCRIPT = `
$proc = Get-Process | Where-Object {$_.MainWindowHandle -eq (Add-Type -MemberDefinition '
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
' -Name WinAPI -Namespace Win32 -PassThru)::GetForegroundWindow() } | Select-Object -First 1
if ($proc) { Write-Output $proc.ProcessName } else { Write-Output "" }
`.trim()

function pollWindows(callback) {
  // Simpler, faster approach: get foreground process via Get-Process + MainWindowHandle check
  const script = `
(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object CPU -Descending | Select-Object -First 1).ProcessName
`.trim()

  exec(`powershell -NoProfile -NonInteractive -Command "${script}"`, { timeout: 4000 }, (err, stdout) => {
    if (err || !stdout.trim()) return
    const raw = stdout.trim()
    callback(cleanWindowsProcessName(raw))
  })
}

function cleanWindowsProcessName(name) {
  const map = {
    'chrome': 'Google Chrome',
    'firefox': 'Firefox',
    'msedge': 'Microsoft Edge',
    'code': 'VS Code',
    'Code': 'VS Code',
    'WindowsTerminal': 'Windows Terminal',
    'notepad': 'Notepad',
    'explorer': 'File Explorer',
    'slack': 'Slack',
    'discord': 'Discord',
    'spotify': 'Spotify',
    'vlc': 'VLC',
    'Teams': 'Microsoft Teams',
    'zoom': 'Zoom',
    'photoshop': 'Photoshop',
    'figma': 'Figma',
    'obs64': 'OBS Studio',
    'obs32': 'OBS Studio',
  }
  const lower = name.toLowerCase()
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key.toLowerCase())) return val
  }
  // Title-case the raw name
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// ─── macOS ───────────────────────────────────────────────────────────────────
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

// ─── Linux ───────────────────────────────────────────────────────────────────
function pollLinux(callback) {
  exec('xdotool getactivewindow getwindowname', { timeout: 4000 }, (err, stdout) => {
    if (err || !stdout.trim()) return
    // Get just the app name from window title (last part after ' - ')
    const parts = stdout.trim().split(' - ')
    callback(parts[parts.length - 1].trim())
  })
}

module.exports = { pollActiveWindow }
