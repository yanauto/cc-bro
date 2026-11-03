import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { presets } from '../lib/templates.mjs'

if (process.argv[2] !== '--live' || !process.argv[3]) {
  console.log('Usage: node spikes/10-roster-smoke.mjs --live CASES_JSON [--custom-codex]')
  console.log('CASES_JSON: [{"worker":"codex","model":"MODEL_FROM_ROSTER","effort":"low"}]')
  console.log('Uses real CLI subscriptions. Runs two no-tool prompts per worker in a new temporary Git repository.')
  process.exit(process.argv.includes('--help') ? 0 : 2)
}
const cases = JSON.parse(process.argv[3])
assert.ok(Array.isArray(cases) && cases.length && cases.every(c => typeof c.worker === 'string'))
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const base = mkdtempSync(join(tmpdir(), 'cc-bro-roster-smoke-')), cwd = join(base, 'repo')
mkdirSync(cwd)
const env = { ...process.env, TZ: 'Asia/Shanghai', CC_BRO_HOME: join(base, 'data'), CC_BRO_PORT: '0' }
const exec = promisify(execFile)
const cli = async (...args) => (await exec(process.execPath, [join(root, 'bin/cc-bro'), ...args], { cwd, env, timeout: 240000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim()
const json = async (...args) => JSON.parse(await cli(...args, '--json'))
const results = []
console.log('Sandbox:', base)
try {
  await exec('git', ['init', '-q'], { cwd })
  const project = await json('init', '--allow', [...new Set(cases.map(c => c.worker))].join(','), '--default-worker', cases[0].worker)
  if (process.argv.includes('--custom-codex')) {
    const codex = cases.find(c => c.worker === 'codex')
    assert.ok(codex, '--custom-codex needs a Codex case with its model and effort')
    const url = await cli('ui', '--no-open')
    const api = async (path, body) => {
      const r = await fetch(url + '/api/' + path, { method: body ? 'POST' : 'GET', headers: { Origin: url, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error.message)
      return data
    }
    const template = presets['custom:codex-json']
    await api('templates/' + project.id + '/test', { template, model: codex.model, effort: codex.effort })
    const config = await api('settings/' + project.id)
    config.entries['custom:codex-json'] = { template }
    config.allow.push('custom:codex-json')
    await api('settings/' + project.id, config)
    cases.push({ ...codex, worker: 'custom:codex-json' })
  }
  for (const c of cases) {
    const name = c.worker.replaceAll(':', '-') + '-' + Date.now(), code = randomUUID()
    const options = ['--worker', c.worker, ...(c.model ? ['--model', c.model] : []), ...(c.effort ? ['--effort', c.effort] : [])]
    const first = await json('say', name, 'Do not use tools, MCP, network, plugins or files. Remember ' + code + '. Reply ACK only.', ...options, '--bg')
    await json('wait', name, String(first.turn))
    const before = await json('show', name)
    const second = await json('say', name, 'Without tools, repeat the exact code from my first message. No other text.', '--bg')
    const reply = await json('wait', name, String(second.turn)), after = await json('show', name)
    assert.ok(reply.reply.includes(code), c.worker + ' did not recall the first turn')
    assert.ok(before.session && before.session === after.session, c.worker + ' changed session')
    await cli('done', name)
    results.push({ ...c, name, passed: true, session: after.session, transport: after.transport, cacheRatio: after.cacheRatio })
    console.log(c.worker + ': dispatch → resume → done passed')
  }
} finally {
  writeFileSync(join(base, 'results.json'), JSON.stringify({ time: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' Asia/Shanghai', results }, null, 2))
  await cli('shutdown').catch(() => {})
  console.log('Evidence retained:', join(base, 'results.json'))
}
