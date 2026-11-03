import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'
import { call } from '../lib/client.mjs'
import { repo, socketFor } from '../lib/paths.mjs'

const exec = promisify(execFile)

export async function until(check, ms = 15000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await check()
    if (value) return value
    await sleep(80)
  }
  assert.fail('Timed out waiting for ' + check.toString().slice(0, 140))
}

export function alive(pid) {
  try { process.kill(pid, 0); return true }
  catch (err) { if (err.code !== 'ESRCH') throw err; return false }
}

export function harness(t, live = false, overrides = {}) {
  const sandbox = join(repo, '.sandbox')
  mkdirSync(sandbox, { recursive: true })
  const base = realpathSync(mkdtempSync(join(sandbox, live ? 'live-' : 'offline-')))
  const data = join(base, 'data')
  const cwd = join(base, 'work')
  mkdirSync(cwd)
  const env = { ...process.env, CC_BRO_HOME: data, CLAUDE_CONFIG_DIR: join(base, 'config'), CC_BRO_PORT: '0', ...overrides }
  if (!live) env.PATH = join(repo, 'test/fixtures') + ':' + env.PATH
  const bin = join(repo, 'bin/cc-bro')
  const cli = async (...args) => (await exec(process.execPath, [bin, ...args], { env, cwd, timeout: 100000 })).stdout.trim()
  const at = async (dir, ...args) => (await exec(process.execPath, [bin, ...args], { env, cwd: dir, timeout: 100000 })).stdout.trim()
  const json = async (...args) => JSON.parse(await cli(...args, '--json'))
  const children = new Set()
  function follow(...args) {
    const child = spawn(process.execPath, [bin, ...args], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const log = { child, stdout: '', stderr: '' }
    children.add(child)
    child.stdout.setEncoding('utf8').on('data', p => { log.stdout += p })
    child.stderr.setEncoding('utf8').on('data', p => { log.stderr += p })
    child.once('exit', () => children.delete(child))
    return log
  }
  let db
  function query(sql, ...params) {
    db ??= new DatabaseSync(join(data, 'projects', readFileSync(join(cwd,'.cc-bro','project-id'),'utf8').trim(), 'tickets.sqlite'), { readOnly: true })
    return db.prepare(sql).all(...params)
  }
  async function runnerPid() { return (await call('/ready', undefined, socketFor(data))).pid }
  t.after(async () => {
    for (const child of children) child.kill()
    db?.close()
    if (await runnerPid().catch(() => null)) await cli('shutdown')
    rmSync(base, { recursive: true, force: true })
  })
  return { base, data, cwd, env, cli, at, json, follow, query, runnerPid }
}
