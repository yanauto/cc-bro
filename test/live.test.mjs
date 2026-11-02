import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { alive, harness, until } from './harness.mjs'
import { piMetadata } from './pi-metadata.mjs'
import { seedDeepSeek } from './live-credentials.mjs'

test('DeepSeek through the released CLI path, independent caller lifetimes and personal profile check', { timeout: 240000 }, async t => {
  const before = piMetadata()
  const h = harness(t, true)
  await seedDeepSeek(t,h)
  t.after(() => {
    const after = piMetadata()
    t.diagnostic('personal pi metadata before/after: ' + JSON.stringify([before, after]))
    assert.deepEqual(after, before)
  })
  const name = 'p1-live'
  const label = 'CASE-' + randomUUID().slice(0, 8)
  const artifact = join(h.cwd, 'artifact.txt')
  const pidFile = join(h.cwd, 'sleep.pid')
  const model = 'deepseek/deepseek-flash'
  const prompt = [
    'Our public test case label is ' + label + '. Later I will ask you to repeat that label in chat.',
    'Use bash to run the following command exactly in this working directory:',
    'sleep 5 && test -z "$CC_BRO_API_KEY" && printf "ready\\n" > artifact.txt',
    'The file should contain only ready followed by a newline. Reply WORK_DONE.'
  ].join('\n')
  const receipt = await h.json('say', name, prompt, '--model', model, '--bg')
  assert.deepEqual(receipt, { name, number: 1, turn: 1, kind: 'prompt' })
  assert.equal(existsSync(artifact), false)
  const state = () => h.query('SELECT status,worker_pid FROM conversations WHERE name=?', name)[0]
  assert.equal(state().status, 'running')
  await until(() => state().status !== 'running', 65000)
  assert.equal(readFileSync(artifact, 'utf8'), 'ready\n')
  assert.match(await h.cli('show', name), /WORK_DONE/)
  t.diagnostic('say caller exited while running; new show: ' + await h.cli('show', name))

  const originalRunner = await h.runnerPid()
  const originalPi = state().worker_pid
  assert.equal(execFileSync('/bin/ps', ['-o', 'ppid=', '-p', String(originalRunner)], { encoding: 'utf8' }).trim(), '1')
  process.kill(originalRunner, 'SIGKILL')
  await until(() => !alive(originalRunner))
  const [restored] = await h.json('ls')
  assert.equal(restored.name, name)
  assert.equal(restored.status, 'idle')
  assert.equal(alive(originalPi), false)
  const nextRunner = await h.runnerPid()
  assert.notEqual(originalRunner, nextRunner)
  const revised = await h.json('say', name, 'Append one line containing reviewed to artifact.txt. Then reply in chat with the public CASE label from our first message.')
  assert.ok(revised.reply.includes(label), 'Expected the public case label in: ' + revised.reply)
  const sessions = h.query("SELECT json_extract(raw,'$.data.sessionFile') AS path FROM events WHERE kind='response' AND json_extract(raw,'$.command')='get_state'")
  assert.equal(sessions.length, 2)
  assert.ok(sessions[0].path.startsWith(join(h.data, 'sessions') + '/'))
  assert.equal(sessions[0].path, sessions[1].path)
  assert.equal(readFileSync(artifact, 'utf8'), 'ready\nreviewed\n')
  t.diagnostic('launchd PPID=1; SIGKILL ' + originalRunner + ' -> ' + nextRunner + '; recalled ' + label + '; same pi session; file ready/reviewed')

  const watch = h.follow('watch')
  await until(() => watch.stdout.includes(name))
  const slow = await h.json('say', name, 'Use bash to run sleep 8. After it finishes reply ORIGINAL only.', '--bg')
  await until(() => /bash .*sleep 8/.test(watch.stdout), 40000)
  const steer = await h.json('say', name, 'Change the final reply to REVISED only.')
  assert.equal(steer.kind, 'steer')
  assert.equal(steer.turn, slow.turn)
  assert.match(steer.reply, /REVISED/)
  await until(() => watch.stdout.includes(name + ' #' + slow.turn + '  Waiting for input'))
  t.diagnostic('watch: ' + watch.stdout.split('\n').filter(s => s.startsWith(name + ' #')).slice(-12).join(' | '))
  watch.child.kill()
  t.diagnostic('steer: ' + JSON.stringify(steer))

  const long = await h.json('say', name, 'Use bash to execute exactly: sleep 90 & echo $! > sleep.pid; wait. The final period is punctuation. Wait for completion.', '--bg')
  const sleepPid = await until(() => existsSync(pidFile) && Number(readFileSync(pidFile, 'utf8').trim()), 50000)
  const piPid = state().worker_pid
  assert.ok(alive(sleepPid) && alive(piPid))
  const stopped = await h.json('stop', name)
  assert.deepEqual(stopped, { name, status: 'stopped', forced: false })
  assert.ok(!alive(sleepPid) && !alive(piPid))
  const terminal = h.query("SELECT raw FROM events WHERE kind='agent_settled' AND turn=?", long.turn)
  assert.equal(JSON.parse(terminal.at(-1).raw).aborted, true)
  t.diagnostic('stop: abort settled; pi ' + piPid + ' and sleep ' + sleepPid + ' both gone')
  const kinds = h.query('SELECT DISTINCT kind FROM events ORDER BY kind').map(e => e.kind)
  for (const kind of ['message_update', 'tool_execution_start', 'tool_execution_end', 'response', 'agent_settled']) assert.ok(kinds.includes(kind))
  t.diagnostic('SQLite raw kinds: ' + kinds.join(', '))
})
