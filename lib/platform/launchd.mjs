import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { home, isolated, socketPath } from '../paths.mjs'

const exec = promisify(execFile)
const label = 'local.cc-bro.' + socketPath.split('-').at(-1).replace('.sock', '')
const domain = 'gui/' + process.getuid()
const target = domain + '/' + label

function ctl(...args) {
  return exec('/bin/launchctl', args, { timeout: 10000 })
}

export async function startService() {
  try { await ctl('kickstart', target); return }
  catch {}
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const path = join(home, 'runner.plist')
  const tmp = path + '.' + randomUUID()
  const values = { Label: label, ThrottleInterval: 1, ProgramArguments: [process.execPath, fileURLToPath(new URL('../runner.mjs', import.meta.url))],
    EnvironmentVariables: { CC_BRO_HOME: home, PATH: process.env.PATH, HOME: process.env.HOME,
      ...(process.env.CC_BRO_PORT ? { CC_BRO_PORT: process.env.CC_BRO_PORT } : {}),
      ...(process.env.CC_BRO_CONCURRENCY ? { CC_BRO_CONCURRENCY: process.env.CC_BRO_CONCURRENCY } : {}),
      ...(process.env.TZ ? { TZ: process.env.TZ } : {}),
      ...(isolated ? { PI_CODING_AGENT_DIR: join(home, 'login') } :
        process.env.PI_CODING_AGENT_DIR ? { PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR } : {}),
      PI_CODING_AGENT_SESSION_DIR: join(home, 'sessions') } }
  writeFileSync(tmp, JSON.stringify(values), { mode: 0o600 })
  try {
    await exec('/usr/bin/plutil', ['-convert', 'xml1', tmp])
    renameSync(tmp, path)
  } finally { rmSync(tmp, { force: true }) }
  try { await ctl('bootstrap', domain, path) } catch {}
  try { await ctl('kickstart', target) }
  catch { throw new Error('Could not start the cc-bro launchd service in ' + domain) }
}

export async function removeService() {
  await ctl('bootout', target)
}
