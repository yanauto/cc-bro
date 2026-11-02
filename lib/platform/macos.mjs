import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { home, personalPi } from '../paths.mjs'
export { startService, removeService } from './launchd.mjs'
export { owned, reap } from './processes.mjs'

const exec = promisify(execFile)
const quote = word => "'" + word.replaceAll("'", "'\\''") + "'"

export function piCommand(args, access) {
  return protectedCommand(['pi', ...args],access)
}

export function protectedCommand(args, access) {
  if (!access) return args
  const deny = access === 'readonly' ? 'file-write*' : 'file-read* file-write*'
  return ['/usr/bin/sandbox-exec', '-D', 'PERSONAL=' + personalPi, '-p',
    '(version 1)(allow default)(deny ' + deny + ' (subpath (param "PERSONAL")))', ...args]
}

const chooser = fileURLToPath(new URL('./choose-folder.js', import.meta.url))

export async function pickFolder(signal, purpose) {
  try {
    const { stdout } = await exec('/usr/bin/osascript', ['-l', 'JavaScript', chooser, purpose || 'project'], { signal, timeout: 180000 })
    return JSON.parse(stdout)
  } catch (err) {
    if (signal?.aborted) return { cancelled: true }
    if (err.killed) throw new Error('Folder selection timed out. Open the picker again.')
    throw new Error('Could not open the macOS folder picker: ' + (err.stderr?.trim() || err.message))
  }
}

export async function openBrowser(url) {
  await exec('/usr/bin/open', [url])
}

export async function openTerminal(cwd, argv, env) {
  const dir = join(home, 'terminal')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const script = join(dir, 'cc-bro-' + randomUUID() + '.command')
  const lines = ['#!/bin/sh', 'set -e', 'rm -f "$0"', 'cd ' + quote(cwd)]
  for (const [key, value] of Object.entries(env)) lines.push('export ' + key + '=' + quote(value))
  lines.push('exec ' + argv.map(quote).join(' '))
  writeFileSync(script, lines.join('\n') + '\n', { mode: 0o700 })
  try { await exec('/usr/bin/open', ['-a', 'Terminal', script]) }
  catch (err) { rmSync(script, { force: true }); throw err }
}

export async function hasDesktop() {
  const script = 'ObjC.import("AppKit"); function run(){ return !$.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier("com.anthropic.claudefordesktop").isNil() }'
  const { stdout } = await exec('/usr/bin/osascript',['-l','JavaScript','-e',script],{ timeout:5000 })
  return stdout.trim() === 'true'
}

export async function openDesktop(claude, roomPath) {
  const child = spawn('/usr/bin/script',['-q','/dev/null',claude,'--desktop'],{ cwd:roomPath, stdio:'ignore', timeout:15000 })
  const [code] = await once(child,'close')
  if (code !== 0) throw new Error('Claude Desktop could not open the manager room')
}

export async function reveal(roomPath) {
  await exec('/usr/bin/open',['-R',roomPath])
}
