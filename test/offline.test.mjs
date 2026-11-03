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

async function piFixture(t) {
  const h = harness(t)
  await h.cli('init','--allow','pi:deepseek','--default-worker','pi:deepseek')
  const cli = h.cli
  h.cli = (...args) => cli(...args, ...(args[0] === 'say' ? ['--model','deepseek/a'] : []))
  return h
}

test('pi requires an allowed provider and preserves the same session after error and stop', async t => {
  const h = await piFixture(t)
  await assert.rejects(h.cli('say','denied','x','--worker','pi:other'), /not allowed/)
  await assert.rejects(h.cli('say','chat','fail'), /fixture provider failed/)
  await h.cli('say','chat','remember first')
  await h.cli('stop','chat')
  assert.equal(await h.cli('say','chat','recall'),'first')
  await assert.rejects(h.cli('say','chat','crash'), /pi exited/)
  assert.equal(await h.cli('say','chat','recall'),'first')
  await assert.rejects(h.cli('say','chat','missing terminal message'), /without an assistant message/)
  assert.equal(await h.cli('say','chat','two replies'),'Checked')
  const raw = h.query("SELECT raw FROM events WHERE kind='fixture.future'").map(r => JSON.parse(r.raw))
  assert.equal(raw[0].probe, '[redacted]')
  assert.equal(raw[0].content, 'raw\u2028value')
})

test('runner SIGKILL during work reconciles pending turns, cleans orphans and leaves unrelated workers alone on stop', async t => {
  const h = await piFixture(t)
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
  assert.equal((await h.json('ls')).find(r => r.id === 'a').flag, 'error')
  assert.equal(await h.cli('say', 'a', 'recall'), 'saved')
  assert.equal((await h.json('show', 'b')).reply, 'healthy')
})

test('stop verifies orphan and separately aborts an active turn', async t => {
  const h = await piFixture(t)
  await h.cli('say', 'a', 'orphan')
  const pid = Number(readFileSync(join(h.cwd, 'orphan.pid'), 'utf8'))
  await h.cli('say', 'a', 'hold', '--bg')
  const result = await h.json('stop', 'a')
  assert.equal(result.forced, false)
  assert.equal(alive(pid), false)
  assert.equal((await h.json('ls'))[0].flag, 'stopped')
  await assert.rejects(h.cli('wait', 'a', '2'), /Stopped/)
  assert.equal((await h.json('stop', 'a')).status, 'stopped')
})

test('unresponsive pi abort is bounded', async t => {
  const h = await piFixture(t)
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
