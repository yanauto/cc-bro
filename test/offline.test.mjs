import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { repo } from '../lib/paths.mjs'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { activity } from '../lib/crew.mjs'
import { alive, harness, until } from './harness.mjs'

test('activity describes tool, reply, reasoning and provider transitions', () => {
  assert.equal(activity({ type: 'tool_execution_start', toolName: 'edit', args: { path: 'a.js' } }), 'edit a.js')
  assert.equal(activity({ type: 'tool_execution_end', toolName: 'bash', isError: true }), 'bash failed')
  assert.equal(activity({ type: 'message_update', assistantMessageEvent: { type: 'text_delta' } }), 'Writing reply')
  assert.equal(activity({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta' } }), 'Thinking')
  assert.equal(activity({ type: 'unknown' }), '')
})

test('simultaneous cold starts, one writer, numbered steers, event stream and durable wait', async t => {
  const h = harness(t)
  const watch = h.follow('watch')
  const concurrent = await Promise.all([1, 2, 3, 4].map(() => h.json('say', 'shared', 'hold', '--bg')))
  assert.deepEqual(concurrent.map(r => r.number).sort(), [1, 2, 3, 4])
  assert.equal(concurrent.filter(r => r.kind === 'prompt').length, 1)
  assert.equal(concurrent.filter(r => r.kind === 'steer').length, 3)
  assert.ok(concurrent.every(r => r.turn === 1))
  const [c] = h.query('SELECT id,worker_pid FROM conversations')
  assert.ok(alive(c.worker_pid))
  await until(() => watch.stdout.includes('read fixture.txt'))
  await assert.rejects(h.cli('say', 'shared', 'reject steer'), /rejected steer/)
  await assert.rejects(h.cli('say', 'shared', 'other', '--model', 'deepseek/other'), /between turns/)
  await assert.rejects(h.cli('say', 'shared', 'other', '--cwd', h.base), /bound to/)
  const waiter = h.follow('say', 'shared', 'revised')
  await until(() => waiter.stderr.includes('steer accepted into current turn'))
  writeFileSync(join(h.cwd, 'release'), 'ok')
  await until(() => waiter.stdout.includes('revised'))
  assert.match(watch.stdout, /shared #1/)
  assert.equal(await h.cli('show', 'shared'), 'revised')
  const next = await h.json('say', 'shared', 'ordinary')
  assert.equal(next.turn, 2)
  assert.equal(h.query('SELECT worker_pid FROM conversations')[0].worker_pid, c.worker_pid)
  assert.equal(await h.cli('wait', 'shared', '1'), 'revised')
  const log = await h.json('show', 'shared', '--all')
  assert.equal(log.filter(m => m.kind === 'reply').length, 2)
  assert.equal(log.find(m => m.content === 'reject steer').error, 'rejected steer')
  const raw = h.query("SELECT raw FROM events WHERE kind='fixture.future'").map(r => JSON.parse(r.raw))
  assert.equal(raw[0].content, 'raw\u2028value')
  assert.equal(raw[0].probe, '[redacted]')
  const rows = h.query("SELECT raw FROM events WHERE kind='response'").map(e => JSON.parse(e.raw))
  assert.equal(rows.filter(row => row.command === 'get_state').length, 1)
  assert.equal(rows.filter(row => row.command === 'prompt').length, 2)
  assert.equal(rows.filter(row => row.command === 'steer').length, 5)
})

test('errors, fallback model rejection, model change, key isolation and stopped-session resume', async t => {
  const h = harness(t)
  await assert.rejects(h.cli('say', 'chat', 'x', '--model', 'openai-codex/x'), /Sign in to this provider/)
  await assert.rejects(h.cli('say', 'chat', 'x', '--model', 'oauth-fixture/x'), /No API-key credential/)
  await assert.rejects(h.cli('say', 'chat', 'x', '--model', 'deepseek/wrong-model'), /requested model/)
  await assert.rejects(h.cli('say', 'chat', 'fail', '--model', 'deepseek/a'), /fixture provider failed/)
  assert.equal((await h.json('ls'))[0].status, 'error')
  await h.cli('say', 'chat', 'remember first')
  const original = h.query('SELECT worker_pid FROM conversations')[0].worker_pid
  assert.equal(await h.cli('say', 'chat', 'recall', '--model', 'deepseek/b'), 'first')
  assert.equal(alive(original), false)
  await h.cli('stop', 'chat')
  assert.equal(await h.cli('say', 'chat', 'recall'), 'first')
  await assert.rejects(h.cli('say', 'chat', 'crash'), /pi exited/)
  assert.equal((await h.json('ls'))[0].status, 'error')
  assert.equal(await h.cli('say', 'chat', 'recall'), 'first')
  await assert.rejects(h.cli('say', 'chat', 'missing terminal message'), /without an assistant message/)
  assert.equal(await h.cli('say', 'chat', 'two replies'), 'Checked')
  const history = await h.json('show', 'chat', '--all')
  assert.deepEqual(history.slice(-2).map(m => m.content), ['Checking files', 'Checked'])
  const separated = await h.json('say', 'chat', 'a\u2028b')
  assert.equal(separated.reply, 'a\u2028b')
  const files = readdirSync(h.data, { recursive: true, withFileTypes: true }).filter(e => e.isFile())
  for (const f of files) {
    const path = join(f.parentPath, f.name)
    assert.equal(readFileSync(path).includes('synthetic-' + 'credential-for-offline-test'), false, path)
  }
})

test('runner SIGKILL during work reconciles pending turns, cleans orphans and leaves unrelated workers alone on stop', async t => {
  const h = harness(t)
  await h.cli('say', 'a', 'remember saved')
  await h.cli('say', 'a', 'orphan')
  const orphan = Number(readFileSync(join(h.cwd, 'orphan.pid'), 'utf8'))
  assert.ok(alive(orphan))
  await h.cli('say', 'b', 'healthy')
  await h.cli('stop', 'b')
  assert.ok(alive(orphan))
  const caller = h.follow('say', 'a', 'hold')
  await until(() => caller.stderr.includes('prompt accepted'))
  const pi = h.query("SELECT worker_pid FROM conversations WHERE name='a'")[0].worker_pid
  process.kill(await h.runnerPid(), 'SIGKILL')
  await until(() => caller.stderr.includes('Runner interrupted'), 25000)
  assert.equal(alive(orphan), false)
  assert.equal(alive(pi), false)
  assert.equal((await h.json('ls')).find(r => r.name === 'a').status, 'error')
  assert.equal(await h.cli('say', 'a', 'recall'), 'saved')
  assert.equal(await h.cli('show', 'b'), 'healthy')
})

test('stop verifies orphan and separately aborts an active turn', async t => {
  const h = harness(t)
  await h.cli('say', 'a', 'orphan')
  const pid = Number(readFileSync(join(h.cwd, 'orphan.pid'), 'utf8'))
  await h.cli('say', 'a', 'hold', '--bg')
  const result = await h.json('stop', 'a')
  assert.equal(result.forced, false)
  assert.equal(alive(pid), false)
  assert.equal((await h.json('ls'))[0].status, 'stopped')
  await assert.rejects(h.cli('wait', 'a', '2'), /Stopped/)
  assert.equal((await h.json('stop', 'a')).status, 'stopped')
})

test('late steer is reported and removed before another turn; unresponsive abort is bounded', async t => {
  const h = harness(t)
  await h.cli('say', 'a', 'late', '--bg')
  await assert.rejects(h.cli('say', 'a', 'missed', '--bg'), /before steer was delivered/)
  assert.equal(await h.cli('say', 'a', 'new turn'), 'new turn')
  assert.ok(existsSync(join(h.cwd, 'cleared')))
  await h.cli('say', 'a', 'no abort', '--bg')
  const pid = h.query('SELECT worker_pid FROM conversations')[0].worker_pid
  const result = await h.json('stop', 'a')
  assert.equal(result.forced, true)
  assert.equal(alive(pid), false)
})

test('historical pi probes also require the isolated launcher', async t => {
  const h = harness(t)
  const profile = join(h.base, 'stand-in-home')
  const canary = join(profile, '.pi', 'canary')
  mkdirSync(join(profile, '.pi'), { recursive: true })
  writeFileSync(canary, 'fixture only')
  const script = [
    "import { rpc, assistant, reply } from './spikes/probe.mjs'",
    "const events = await rpc('isolation ' + process.env.CC_BRO_FIXTURE_CANARY)",
    "console.log(events.find(e => e.type === 'fixture.future').probe, reply(assistant(events)))"
  ].join('\n')
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
    cwd: repo, env: { ...process.env, HOME: profile, CC_BRO_HOME: h.data, CC_BRO_FIXTURE_CANARY: canary,
      PATH: join(repo, 'test/fixtures') + ':' + process.env.PATH }
  })
  assert.equal(readFileSync(canary, 'utf8'), 'fixture only')
  assert.ok(stdout.includes('read denied'))
  assert.ok(stdout.includes(join(h.data, 'spikes')))
  assert.ok(stdout.includes('[redacted]'))
})
