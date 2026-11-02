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

for (const local of [false,true]) test((local ? 'room skill with minimal PATH' : 'repository plugin') + ' dispatches, receives a native completion and leaves a second job running', { timeout: 90000 }, async t => {
  const h = harness(t,false,{CC_BRO_PORT:'0'})
  let cwd = h.cwd
  let api
  let project
  const cli = local ? './.claude/skills/cc-bro/cc-bro' : 'cc-bro'
  if (local) {
    api = await h.cli('ui','--no-open')
    const post = async (path,data) => (await fetch(api+'/api/'+path,{method:'POST',headers:{origin:api},body:JSON.stringify(data)})).json()
    await post('settings',{roomRoot:join(h.base,'Visible rooms')})
    project = await post('projects',{repoPath:h.cwd})
    cwd = project.roomPath
  }
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
    sawSkill ||= messages.includes(cli + ' wait')
    let command
    if (requests === 0) command = cli + ' say native hold --bg --json'
    if (requests === 1) command = cli + ' wait native 1 --json'
    if (requests === 2) setTimeout(() => writeFileSync(gate, 'go'), 650)
    if (!notified && messages.includes('<task-notification>') && messages.includes('completed')) {
      notified = true
      rmSync(gate, { force: true })
      command = cli + ' say detached hold --bg --json'
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
    CC_BRO_HOME: h.data, CLAUDE_CONFIG_DIR: join(h.base, 'claude'),
    ANTHROPIC_API_KEY: 'local-fixture-only', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + server.address().port,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1'
  }
  const executable = (await promisify(execFile)('/usr/bin/which',['claude'])).stdout.trim()
  if (local) {
    env.PATH = '/usr/bin:/bin'
    delete env.CC_BRO_HOME
  }
  const { stdout } = await promisify(execFile)(executable, ['-p', (local ? '/cc-bro' : '/cc-bro:crew') + ' Run the background fixture.',
    '--model', 'claude-haiku-4-5', '--no-session-persistence', ...(local ? [] : ['--plugin-dir', join(repo,'plugin')]),
    '--tools', 'Bash', '--allowedTools', 'Bash(' + cli + ' *)', '--setting-sources', local ? 'project' : '', '--strict-mcp-config',
    '--output-format', 'stream-json', '--verbose'], { cwd, env, timeout: 60000 })
  const records = stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.ok(sawSkill)
  assert.ok(notified)
  const completion = records.find(e => e.subtype === 'task_notification' && e.status === 'completed')
  assert.ok(completion)
  t.diagnostic('Claude Code: ' + completion.type + ' ' + completion.subtype + ' ' + completion.status + '; delivered to model')
  if (local) {
    const ticket = await (await fetch(api+'/api/projects/'+project.id+'/tickets/detached')).json()
    assert.equal(ticket.status,'working')
  } else assert.equal(h.query("SELECT status FROM conversations WHERE name='detached'")[0].status, 'running')
  writeFileSync(gate, 'go')
  assert.equal(await h.inRoom(cwd,'wait', 'detached', '1'), 'released')
  t.diagnostic('Claude Code exited with second turn running; new CLI: released')
})
