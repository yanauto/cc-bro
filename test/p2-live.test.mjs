import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { harness } from './harness.mjs'
import { piMetadata } from './pi-metadata.mjs'
import { seedDeepSeek } from './live-credentials.mjs'

test('Claude Code in a provisioned room delegates to DeepSeek and accepts its actual file result', { timeout: 160000 }, async t => {
  const before = piMetadata()
  const h = harness(t, true, { CC_BRO_PORT: '0' })
  await seedDeepSeek(t,h)
  t.after(() => assert.deepEqual(piMetadata(), before))
  const label = 'case-' + randomUUID().slice(0, 8)
  writeFileSync(join(h.cwd, 'sample.txt'), label + '\n')
  const url = await h.cli('ui', '--no-open')
  const model = 'deepseek/deepseek-flash'
  const setup = await fetch(url + '/api/settings',{ method:'POST',headers:{Origin:url},body:JSON.stringify({roomRoot:join(h.base,'rooms'),worker:{model,thinking:'off'}}) })
  assert.equal(setup.status,200)
  const res = await fetch(url + '/api/projects', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify({ repoPath: h.cwd }) })
  assert.equal(res.status, 200)
  const project = await res.json()
  const cli = './.claude/skills/cc-bro/cc-bro'
  const prompt = [
    'Run this acceptance check in the current manager room. You have permission to delegate this one small task to DeepSeek.',
    'Use Bash to execute: ' + cli + ' say inspect "Read sample.txt with your read tool and reply with the exact line you found." --title "Read sample". Use the configured default, without a --model flag.',
    'When the worker returns a case label, run ' + cli + ' done inspect and report the label. Only the worker reads the sample.'
  ].join('\n')
  const exec = promisify(execFile)
  const claude = (await exec('/usr/bin/which',['claude'])).stdout.trim()
  const env = { ...process.env, PATH:'/usr/bin:/bin' }
  delete env.CC_BRO_HOME
  const { stdout } = await exec(claude, ['-p', prompt, '--model', 'haiku',
    '--tools', 'Bash', '--allowedTools', 'Bash(' + cli + ' *)', '--strict-mcp-config', '--no-session-persistence'], {
    cwd: project.roomPath, env, timeout: 140000
  })
  const ticket = await (await fetch(url + '/api/projects/' + project.id + '/tickets/inspect')).json()
  assert.equal(ticket.status, 'done')
  assert.equal(ticket.model,model)
  assert.ok(ticket.lastReply.includes(label))
  assert.ok(stdout.includes(label))
  const kinds = ticket.timeline.map(e => e.kind)
  for (const kind of ['bro.say', 'bro.working', 'tool_execution_start', 'bro.done', 'bro.accepted']) assert.ok(kinds.includes(kind), kind)
  assert.deepEqual(readdirSync(h.cwd), ['sample.txt'])
  assert.equal(readFileSync(join(h.cwd, 'sample.txt'),'utf8'), label + '\n')
  t.diagnostic('Claude accepted ' + ticket.id + '; DeepSeek returned ' + label + '; timeline ' + kinds.join(' → '))
})
