/**
 * Copies sql-wasm.wasm from sql.js package into the electron/ folder
 * so Electron's main process can load it at runtime.
 * Runs automatically after `npm install` via the postinstall script.
 */
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
const dest = path.join(__dirname, '..', 'electron', 'sql-wasm.wasm')

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest)
  console.log('✓ Copied sql-wasm.wasm to electron/')
} else {
  console.warn('⚠ sql-wasm.wasm not found at', src, '— run npm install first')
}
