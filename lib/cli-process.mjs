import { execFile, spawn } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { toolsPath } from './paths.mjs'

const exec = promisify(execFile)
export function executable(name) {
  for (const file of name.includes('/') ? [name] : toolsPath.split(delimiter).map(p => join(p, name))) {
    try { accessSync(file, constants.X_OK); if (statSync(file).isFile()) return file } catch {}
  }
  return null
}

export async function inspectCommand(file, args, cwd) {
  try {
    const r = await exec(file, args, { cwd, env: { ...process.env, PATH: toolsPath, NO_COLOR: '1', PI_OFFLINE: '1' }, timeout: 20000, maxBuffer: 4 * 1024 * 1024 })
    return { ok: true, text: (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '') }
  } catch { return { ok: false, text: '' } }
}

export async function inspectRpc(file, args, cwd, run, kind = 'jsonrpc') {
  const child = spawn(file, args, { cwd, env: { ...process.env, PATH: toolsPath, PI_OFFLINE: '1' }, stdio: ['pipe', 'pipe', 'ignore'] })
  const pending = new Map()
  let next = 0
  const fail = () => { for (const p of pending.values()) p.reject(new Error('CLI inspection unavailable')); pending.clear() }
  child.on('error', fail)
  child.stdin.on('error', fail)
  child.once('close', fail)
  const closed = new Promise(ok => child.once('close', ok))
  createInterface({ input: child.stdout }).on('line', line => {
    try {
      const r = JSON.parse(line), p = pending.get(r.id)
      if (!p) return
      pending.delete(r.id)
      if (r.error || r.success === false) p.reject(new Error('CLI inspection unavailable'))
      else p.resolve(kind === 'pi' ? r.data : r.result)
    } catch {}
  })
  const send = obj => child.stdin.write(JSON.stringify(obj) + '\n')
  const request = (method, params = {}) => {
    const id = String(++next)
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      send(kind === 'pi' ? { id, type: method, ...params } : { id, method, params })
    })
  }
  const timer = setTimeout(() => { fail(); child.kill('SIGKILL') }, 20000)
  try { return await run(request, send) }
  finally {
    clearTimeout(timer)
    child.stdin.end()
    child.kill()
    const kill = setTimeout(() => child.kill('SIGKILL'), 1000)
    await closed
    clearTimeout(kill)
  }
}
