import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import test from 'node:test'
import { repo } from '../lib/paths.mjs'
import { alive, harness, until } from './harness.mjs'

function api(url) {
  return async (path, method = 'GET', payload, origin = url) => {
    const headers = origin ? { Origin: origin } : {}
    const res = await fetch(url + '/api/' + path, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) })
    return { status: res.status, data: await res.json() }
  }
}

async function listen(t, url) {
  const controller = new AbortController()
  const res = await fetch(url + '/api/stream', { signal: controller.signal })
  assert.match(res.headers.get('content-type'), /text\/event-stream/)
  const events = []
  const stream = Readable.fromWeb(res.body)
  stream.on('error', () => {})
  const lines = createInterface({ input: stream })
  lines.on('error', () => {})
  lines.on('line', l => { if (l.startsWith('data: ')) events.push(JSON.parse(l.slice(6))) })
  t.after(() => controller.abort())
  return { events, close: () => controller.abort() }
}

test('manager room CLI, durable FIFO across projects, board stream and safe project archive', { timeout: 95000 }, async t => {
  const h = harness(t, false, { CC_BRO_CONCURRENCY: '1', CC_BRO_PORT: '0' })
  const firstDir = join(h.base, "Alice's $& project")
  const otherDir = join(h.base, 'other')
  mkdirSync(firstDir)
  mkdirSync(otherDir)
  const file = join(firstDir, 'keep.txt')
  writeFileSync(file, 'unchanged')
  const snapshot = () => [readdirSync(firstDir), statSync(file).mtimeMs, readFileSync(file, 'utf8'), statSync(firstDir).mtimeMs]
  const before = snapshot()
  const url = await h.cli('ui', '--no-open')
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.notEqual(new URL(url).port, '4517')
  assert.equal(await h.cli('ui', '--no-open'), url)
  let http = api(url)
  const feed = await listen(t, url)
  await until(() => feed.events.length)
  assert.deepEqual(feed.events[0], { type: 'hello', projects: [] })
  assert.equal((await http('projects', 'POST', { repoPath: 'relative' })).status, 400)
  assert.equal((await http('projects', 'POST', { repoPath: h.data })).status, 400)
  const create = async path => {
    const res = await http('projects', 'POST', { repoPath: path })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    return res.data
  }
  assert.equal((await http('projects','POST',{repoPath:firstDir})).data.error.code,'room-root-unset')
  assert.equal((await http('settings','POST',{roomRoot:join(h.base,'rooms')})).status,200)
  const a = await create(firstDir)
  const b = await create(otherDir)
  assert.deepEqual(snapshot(), before)
  symlinkSync(firstDir, join(h.base, 'alias'))
  assert.equal((await create(join(h.base, 'alias'))).id, a.id)
  assert.ok(readFileSync(join(a.roomPath, 'CLAUDE.md'), 'utf8').includes(realpathSync(firstDir)))
  assert.ok(readFileSync(join(a.roomPath, 'brief.md'), 'utf8').includes("Alice's $& project"))
  const sub = join(a.roomPath, 'notes')
  mkdirSync(sub)
  const say = (room, name, msg, ...args) => h.inRoom(room, 'say', name, msg, '--bg', '--json', ...args).then(JSON.parse)
  const ticket = async (project, id) => (await http('projects/' + project.id + '/tickets/' + encodeURIComponent(id))).data
  const list = async project => (await http('projects/' + project.id + '/tickets')).data
  await say(sub, 'same', 'hold', '--title', 'Read sample')
  assert.equal((await ticket(a, 'same')).status, 'working')
  assert.equal((await ticket(a, 'same')).title, 'Read sample')
  const queued = await say(b.roomPath, 'same', 'one')
  assert.equal(queued.kind, 'queued')
  assert.equal((await say(b.roomPath, 'same', 'two')).turn, queued.turn)
  let card = await ticket(b, 'same')
  assert.equal(card.status, 'queued')
  assert.equal(card.startedAt, null)
  assert.equal(card.elapsedMs, 0)
  assert.equal((await list(b)).length, 1)
  await assert.rejects(h.inRoom(b.roomPath, 'done', 'same'), /review/)
  await say(a.roomPath, 'cancel waiting', 'ignored')
  await h.inRoom(a.roomPath, 'stop', 'cancel waiting')
  assert.deepEqual([(await ticket(a, 'cancel waiting')).status, (await ticket(a, 'cancel waiting')).flag], ['queued','stopped'])
  const original = await h.runnerPid()
  process.kill(original, 'SIGKILL')
  await until(() => !alive(original))
  await h.inRoom(a.roomPath, 'ls')
  assert.equal(await h.inRoom(b.roomPath, 'wait', 'same', '1'), 'one\n\ntwo')
  const nextUrl = await h.cli('ui', '--no-open')
  http = api(nextUrl)
  const secondFeed = await listen(t, nextUrl)
  await until(() => secondFeed.events.length)
  card = await ticket(a, 'same')
  assert.deepEqual([card.status, card.flag], ['working','error'])
  assert.equal((await ticket(b, 'same')).status, 'review')
  assert.equal((await http('projects')).data.find(p => p.id === b.id).attention, 1)
  await h.inRoom(b.roomPath, 'say', 'same', 'reworked')
  assert.equal((await ticket(b, 'same')).turn, 2)
  await h.inRoom(b.roomPath, 'done', 'same')
  assert.equal((await h.inRoom(b.roomPath, 'done', 'same', '--json').then(JSON.parse)).status, 'done')
  const final = await ticket(b, 'same')
  assert.equal(final.lastReply, 'reworked')
  assert.ok(final.timeline.some(e => e.kind === 'bro.accepted' && e.ts && e.summary))
  assert.ok(final.startedAt && final.createdAt && final.updatedAt)
  await until(() => secondFeed.events.some(e => e.type === 'ticket' && e.ticket.status === 'done'))
  const stages = secondFeed.events.filter(e => e.type === 'ticket' && e.projectId === b.id).map(e => e.ticket.status)
  for (const stage of ['queued','working','review','done']) assert.ok(stages.includes(stage), stage)
  for (const [i,e] of secondFeed.events.entries()) if (e.type === 'ticket') assert.equal(secondFeed.events[i + 1]?.type, 'project')
  assert.equal((await http('projects')).data[0].id, b.id)
  await h.inRoom(a.roomPath, 'say', 'same', 'orphan')
  const orphan = Number(readFileSync(join(firstDir, 'orphan.pid'), 'utf8'))
  assert.ok(alive(orphan))
  await say(a.roomPath, 'blocking', 'hold')
  await say(a.roomPath, 'queued-at-removal', 'unused')
  assert.deepEqual((await http('projects/' + a.id, 'DELETE')).data, { ok: true })
  assert.equal(alive(orphan), false)
  assert.ok(statSync(join(h.data,'trash',a.id,'room','CLAUDE.md')).isFile())
  assert.ok(statSync(join(h.data,'trash',a.id,'tickets.sqlite')).isFile())
  assert.equal((await http('projects/' + a.id + '/tickets')).status, 404)
  assert.equal((await http('projects/' + b.id + '/tickets/missing')).status, 404)
  await until(() => secondFeed.events.some(e => e.type === 'project-removed' && e.projectId === a.id))
  assert.equal(await h.inRoom(b.roomPath, 'show', 'same'), 'reworked')
  await assert.rejects(h.inRoom(b.roomPath, 'say', 'bad-model', 'ignored', '--model','oauth-fixture/example'), /API-key/)
  const failedStart = await ticket(b,'bad-model')
  assert.deepEqual([failedStart.status,failedStart.flag,failedStart.startedAt], ['queued','error',null])
  await h.inRoom(b.roomPath,'say','memory','remember retained')
  assert.equal(await h.inRoom(b.roomPath,'say','memory','recall'), 'retained')
  assert.deepEqual(readdirSync(firstDir).sort(), ['keep.txt','orphan.pid'])
  assert.equal(readFileSync(file, 'utf8'), before[2])
  assert.equal(statSync(file).mtimeMs, before[1])
  const cleanBefore = [readdirSync(otherDir), statSync(otherDir).mtimeMs]
  await http('projects/' + b.id, 'DELETE')
  assert.deepEqual([readdirSync(otherDir), statSync(otherDir).mtimeMs], cleanBefore)
  assert.deepEqual((await http('projects')).data, [])
  secondFeed.close()
})

test('all HTTP routes, SSE snapshots, browser origin, missing-pi install and native action arguments', { timeout: 30000 }, async t => {
  const base = mkdtempSync(join(repo, '.sandbox', 'api-'))
  const data = join(base, 'data')
  const path = join(base, 'path')
  const dist = join(base, 'dist')
  const fixtureRepo = join(base, 'sample')
  mkdirSync(path)
  mkdirSync(fixtureRepo)
  writeFileSync(join(fixtureRepo, 'sample'), 'original')
  const before = [readdirSync(fixtureRepo), statSync(fixtureRepo).mtimeMs, statSync(join(fixtureRepo,'sample')).mtimeMs]
  symlinkSync(process.execPath, join(path, 'node'))
  writeFileSync(join(path, 'claude'), '#!/bin/sh\nif [ "$1" = --help ]; then echo "  --desktop  Open the app"; else printf "2.1.316 (Claude Code)\\n"; fi\n', { mode: 0o755 })
  const installer = [
    '#!/usr/bin/env node', "import fs from 'node:fs'; import p from 'node:path'",
    "const i=process.argv.indexOf('--prefix'), bin = p.join(process.argv[i+1], 'bin')",
    "if(i<0 || !process.argv.includes('--global') || !process.argv.includes('@earendil-works/pi-coding-agent@latest')) process.exit(2)",
    "console.log('Installing fixture pi'); if(fs.existsSync(p.join(process.env.CC_BRO_HOME,'fail-install'))) process.exit(1)",
    "setTimeout(()=>{fs.mkdirSync(bin,{recursive:true}); fs.symlinkSync(process.env.FIXTURE_PI,p.join(bin,'pi')); console.log('Installed fixture pi')},200)"
  ].join('\n')
  writeFileSync(join(path, 'npm'), installer, { mode: 0o755 })
  const child = spawn(process.execPath, [join(repo,'test/fixtures/p2-server.mjs')], {
    env: { HOME: base, CC_BRO_HOME: data, PATH: path + ':/usr/bin:/bin', FIXTURE_PI: join(repo,'test/fixtures/pi'), FIXTURE_DIST: dist, FIXTURE_REPO: fixtureRepo },
    stdio: ['ignore','ignore','inherit','ipc']
  })
  const [{ url, occupied }] = await once(child, 'message')
  assert.equal(Number(new URL(url).port), occupied + 1)
  t.after(() => { if (child.connected) child.disconnect() })
  const http = api(url)
  const feed = await listen(t, url)
  assert.match(await (await fetch(url)).text(), /Build ui\/dist/)
  mkdirSync(dist)
  writeFileSync(join(dist, 'index.html'), 'fixture board')
  writeFileSync(join(dist, 'app.js'), 'fixture')
  symlinkSync(join(fixtureRepo, 'sample'), join(dist, 'outside.js'))
  assert.equal(await (await fetch(url)).text(), 'fixture board')
  assert.equal((await fetch(url + '/app.js')).headers.get('content-type'), 'text/javascript')
  assert.equal((await fetch(url + '/outside.js')).status, 404)
  for (const [method, route] of [['POST','projects'],['POST','projects/pick'],['POST','projects/id/open'],['POST','projects/id/reveal'],['POST','settings'],['POST','settings/pick-room-root'],['DELETE','projects/id'],['POST','env/install-pi'],['POST','env/login']]) {
    for (const origin of [null, 'http://localhost:4517', url + '.example']) {
      const res = await http(route, method, undefined, origin)
      assert.equal(res.status, 403)
      assert.equal(res.data.error.code, 'INVALID_ORIGIN')
    }
  }
  const initial = (await http('env')).data
  assert.deepEqual(initial.pi, { installed: false, ok: false, version: null, required: '>=1.4.0', path: null })
  assert.equal(initial.ready, false)
  assert.equal(initial.node.ok, true)
  assert.equal(initial.claude.version, '2.1.316')
  assert.equal(initial.platform, 'darwin')
  assert.equal((await http('env/login','POST')).status, 400)
  const job = (await http('env/install-pi','POST')).data
  assert.equal(job.state, 'running')
  assert.equal((await http('env/install-pi','POST')).data.id, job.id)
  const terminal = await until(async () => {
    const j = (await http('jobs/' + job.id)).data
    return j.state !== 'running' && j
  })
  assert.equal(terminal.state, 'done', terminal.log.join('\n'))
  const fresh = (await http('env')).data
  assert.equal(fresh.ready, true)
  assert.equal(fresh.pi.path, join(data,'tools/bin/pi'))
  assert.deepEqual(fresh.models, [{ id: 'deepseek-flash', provider:'deepseek', ready:true }])
  assert.deepEqual((await http('env/login','POST')).data, { ok: true })
  assert.deepEqual((await http('projects/pick','POST')).data, { path: fixtureRepo })
  assert.deepEqual((await http('projects/pick','POST')).data, { cancelled: true })
  assert.equal((await http('settings','POST',{roomRoot:join(base,'rooms')})).status,200)
  const p = (await http('projects','POST',{ repoPath: fixtureRepo })).data
  assert.deepEqual((await http('projects/' + p.id + '/open','POST')).data, { ok:true })
  const [login, manager] = readFileSync(join(data, 'desktop.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(login.env.PI_CODING_AGENT_DIR, join(data,'login'))
  assert.ok(login.argv.includes('/usr/bin/sandbox-exec'))
  assert.equal(manager.cwd, p.roomPath)
  assert.deepEqual(manager.argv, [join(path,'claude')])
  const defaults = (await http('settings')).data
  assert.equal(defaults.desktopSupported,true)
  assert.equal(defaults.client,'terminal')
  assert.equal((await http('settings/pick-room-root','POST')).data.path,join(base,'rooms'))
  const saved = (await http('settings','POST',{...defaults,client:'desktop'})).data
  assert.equal(saved.client,'desktop')
  const openRoute = 'projects/' + p.id + '/open'
  assert.deepEqual((await http(openRoute,'POST')).data,{ok:true})
  assert.deepEqual((await http('projects/'+p.id+'/reveal','POST')).data,{ok:true})
  const actions = readFileSync(join(data,'actions.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
  assert.deepEqual(actions,[{claude:join(path,'claude'),roomPath:p.roomPath},{reveal:p.roomPath}])
  writeFileSync(join(data,'desktop-missing'),'yes')
  assert.deepEqual((await http(openRoute,'POST')).data,{ok:false,code:'desktop-unsupported',roomPath:p.roomPath})
  assert.deepEqual((await http(openRoute,'POST',{client:'terminal'})).data,{ok:true})
  assert.equal((await http(openRoute,'POST',{client:'unknown'})).status,400)
  assert.ok(feed.events.some(e => e.type==='settings' && e.settings.client==='desktop'))
  assert.deepEqual((await http('projects/' + p.id + '/tickets')).data, [])
  assert.deepEqual((await http('projects/' + p.id,'DELETE')).data, { ok:true })
  assert.deepEqual([readdirSync(fixtureRepo),statSync(fixtureRepo).mtimeMs,statSync(join(fixtureRepo,'sample')).mtimeMs], before)
  assert.equal(readFileSync(join(fixtureRepo,'sample'),'utf8'), 'original')
  writeFileSync(join(data, 'fail-install'), 'yes')
  const failed = (await http('env/install-pi','POST')).data
  await until(async () => (await http('jobs/' + failed.id)).data.state === 'failed')
  assert.equal((await http('jobs/missing')).status, 404)
  assert.equal((await http('missing')).status, 404)
  assert.ok(feed.events.some(e => e.type === 'env' && e.env.ready))
  assert.ok(feed.events.some(e => e.type === 'job' && e.job.state === 'running' && e.job.log.includes('Installing fixture pi')))
  assert.ok(feed.events.some(e => e.type === 'job' && e.job.state === 'done'))
  feed.close()
})

test('installed layout uses the stand-in user profile for OAuth and a project-owned pi session', async () => {
  const { cpSync } = await import('node:fs')
  const base = mkdtempSync(join(repo,'.sandbox','installed-layout-'))
  const installed = join(base, 'package')
  cpSync(join(repo, 'lib'), join(installed,'lib'), { recursive: true })
  const profile = join(base,'user')
  const bin = join(base,'path')
  const data = join(profile,'.cc-bro')
  mkdirSync(join(profile,'.pi','agent'), { recursive:true })
  mkdirSync(bin)
  mkdirSync(data)
  const sentinel = join(profile,'.pi','agent','fixture-only')
  writeFileSync(sentinel, 'stand-in login')
  symlinkSync(process.execPath, join(bin,'node'))
  writeFileSync(join(bin,'pi'), [
    '#!/usr/bin/env node', "import fs from 'node:fs'; import path from 'node:path'",
    "const args=process.argv.slice(2), dir=process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME,'.pi','agent')",
    "if(args[0]==='auth' || fs.readFileSync(path.join(dir,'fixture-only'),'utf8')!=='stand-in login') process.exit(3)",
    "console.log(JSON.stringify({home:process.env.HOME,dir,sessions:process.env.PI_CODING_AGENT_SESSION_DIR,args,tz:process.env.TZ}))"
  ].join('\n'), { mode:0o755 })
  const script = [
    "import { home, isolated } from './lib/paths.mjs'; import { spawnPi } from './lib/pi.mjs'; import { once } from 'node:events'",
    "if(isolated) throw new Error('Unexpected development profile')",
    "const s=home+'/projects/example/sessions'",
    "const {child}=await spawnPi('openai-codex/example',process.cwd(),home+'/workers/tag',['--session-dir',s,'--model','openai-codex/example'])",
    "child.stdout.pipe(process.stdout);child.stdin.end();const [code]=await once(child,'close');process.exitCode=code"
  ].join('\n')
  const { stdout } = await promisify(execFile)(process.execPath,['--input-type=module','-e',script],{
    cwd: installed, env: { HOME:profile, PATH:bin+':/usr/bin:/bin', TZ:'Pacific/Auckland' }
  })
  const evidence = JSON.parse(stdout)
  assert.equal(evidence.dir, join(profile,'.pi','agent'))
  assert.equal(evidence.sessions, join(data,'projects/example/sessions'))
  assert.equal(evidence.tz, 'Pacific/Auckland')
  assert.deepEqual(readdirSync(evidence.dir), ['fixture-only'])
})

test('native picker returns the exact path and a distinct cancellation without shell interpolation', async () => {
  const { runInNewContext } = await import('node:vm')
  const code = readFileSync(join(repo,'lib/platform/choose-folder.js'),'utf8') + '\nrun()'
  const path = '/test/.hidden/A \'"$&/项目'
  const panel = { URL: { path }, runModal: 1 }
  const app = { setActivationPolicy() {}, activateIgnoringOtherApps() {} }
  const context = { ObjC: { import(){}, unwrap: s => s }, $: {
    NSApplication: { sharedApplication: app }, NSOpenPanel: { openPanel: panel }, NSModalResponseOK: 1
  } }
  assert.deepEqual(JSON.parse(runInNewContext(code,context)), { path })
  assert.equal(panel.canChooseFiles, false)
  assert.equal(panel.canChooseDirectories, true)
  panel.runModal = 0
  assert.deepEqual(JSON.parse(runInNewContext(code,context)), { cancelled:true })
})
