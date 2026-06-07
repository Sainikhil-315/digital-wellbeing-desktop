const { exec } = require('child_process')
const { app } = require('electron')

const cache = new Map() // appName → dataURL | null

const PS_TIMEOUT = 4000

function getExePath(processName) {
  return new Promise((resolve) => {
    const safe = processName.replace(/['"`;]/g, '')
    const script = `
$name = '${safe}'
$path = $null
$p = Get-Process -Name $name -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p -and $p.Path) { $path = $p.Path }
if (-not $path) {
  $reg = Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$name.exe" -ErrorAction SilentlyContinue
  if ($reg) { $path = $reg.'(default)' }
}
if (-not $path) {
  $reg2 = Get-ItemProperty "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$name.exe" -ErrorAction SilentlyContinue
  if ($reg2) { $path = $reg2.'(default)' }
}
if ($path) { Write-Output $path }
`.trim()

    exec(`powershell -NoProfile -Command "${script.replace(/\n/g, '; ')}"`,
      { timeout: PS_TIMEOUT },
      (err, stdout) => {
        const p = stdout?.trim()
        resolve(!err && p ? p : null)
      }
    )
  })
}

async function resolveIcon(appName, processName) {
  if (cache.has(appName)) return cache.get(appName)

  const exePath = processName ? await getExePath(processName) : null

  if (exePath) {
    try {
      const icon = await app.getFileIcon(exePath, { size: 'normal' })
      const url = icon.toDataURL()
      cache.set(appName, url)
      return url
    } catch (_) {}
  }

  cache.set(appName, null)
  return null
}

module.exports = { resolveIcon }
