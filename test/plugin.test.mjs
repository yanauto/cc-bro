import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { repo } from '../lib/paths.mjs'
import { harness } from './harness.mjs'

function modelResponse(res, model, index, command, background = false) {
  res.setHeader('content-type', 'text/event-stream')
  function emit(type, fields) {
    res.write('event: ' + type + '\ndata: ' + JSON.stringify({ type, ...fields }) + '\n\n')
  }
  const block = command ? { type: 'tool_use', id: 'toolu_' + index, name: 'Bash', input: {} } : { type: 'text', text: '' }
  const delta = command ? { type: 'input_json_delta', partial_json: JSON.stringify({
    command, description: 'cc-bro integration test', run_in_background: background
  }) } : { type: 'text_delta', text: 'Dispatch recorded.' }
  emit('message_start', { message: { id: 'msg_' + index, type: 'message', role: 'assistant', model, content: [],
    stop_reason: null, stop_sequence: null, usage: { input_tokens: 25, output_tokens: 0 } } })
  emit('content_block_start', { index: 0, content_block: block })
  emit('content_block_delta', { index: 0, delta })
  emit('content_block_stop', { index: 0 })
  emit('message_delta', { delta: { stop_reason: command ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } })
  emit('message_stop', {})
  res.end()
}

test('installed user skill dispatches with minimal PATH and receives a native background notification', { timeout: 90000 }, async t => {
  const h = harness(t)
  await h.cli('init','--allow','pi:deepseek','--default-worker','pi:deepseek')
  const cli = await h.cli('setup')
  const cwd = h.cwd
  const gate = join(h.cwd, 'release')
  let requests = 0
  let sawSkill = false
  let notified = false
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (!req.url.includes('/v1/messages') || req.url.includes('count_tokens')) return res.end('{"input_tokens":25}')
    const input = JSON.parse(raw)
    const messages = JSON.stringify(input.messages)
    sawSkill ||= messages.includes(cli) && messages.includes('run_in_background')
    let command
    if (requests === 0) command = cli + ' say native hold --model deepseek/a --bg --json'
    if (requests === 1) command = cli + ' wait native 1 --json'
    if (requests === 2) setTimeout(() => writeFileSync(gate, 'go'), 650)
    if (!notified && messages.includes('<task-notification>') && messages.includes('completed')) {
      notified = true
      rmSync(gate, { force: true })
      command = cli + ' say detached hold --model deepseek/a --bg --json'
    }
    modelResponse(res, input.model, requests, command, requests === 1)
    requests++
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())
  const isolatedHome = join(h.base, 'home')
  mkdirSync(isolatedHome)
  const env = {
    HOME: isolatedHome, SHELL: '/bin/bash',
    PATH: [join(repo, 'test/fixtures'), join(repo, 'bin'), process.env.PATH].join(':'),
    CC_BRO_HOME: h.data, CLAUDE_CONFIG_DIR: h.env.CLAUDE_CONFIG_DIR,
    ANTHROPIC_API_KEY: 'local-fixture-only', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + server.address().port,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1'
  }
  const executable = (await promisify(execFile)('/usr/bin/which',['claude'])).stdout.trim()
  env.PATH = '/usr/bin:/bin'
  delete env.CC_BRO_HOME
  const { stdout } = await promisify(execFile)(executable, ['-p', '/cc-bro' + ' Run the background fixture.',
    '--model', 'claude-haiku-4-5', '--no-session-persistence',
    '--tools', 'Bash', '--allowedTools', 'Bash(' + cli + ' *)', '--setting-sources', 'user', '--strict-mcp-config',
    '--output-format', 'stream-json', '--verbose'], { cwd, env, timeout: 60000 })
  const records = stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.ok(sawSkill)
  assert.ok(notified)
  const completion = records.find(e => e.subtype === 'task_notification' && e.status === 'completed')
  assert.ok(completion)
  t.diagnostic('Claude Code: ' + completion.type + ' ' + completion.subtype + ' ' + completion.status + '; delivered to model')
  assert.equal(h.query("SELECT status FROM conversations WHERE name='detached'")[0].status, 'running')
  writeFileSync(gate, 'go')
  assert.equal(await h.at(cwd,'wait', 'detached', '1'), 'released')
  t.diagnostic('Claude Code exited with second turn running; new CLI: released')
})
