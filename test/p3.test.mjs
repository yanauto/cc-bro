import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { promisify } from 'node:util'
import { repo } from '../lib/paths.mjs'
import { defaultRoomRoot } from '../lib/rooms.mjs'
import { harness } from './harness.mjs'

function api(base) {
  return async (path, method = 'GET', data) => {
    const r = await fetch(base + '/api/' + path,{method,headers:{ Origin:base },body:data === undefined ? undefined : JSON.stringify(data)})
    return { status:r.status, data:await r.json() }
  }
}

test('legacy rooms migrate on selection, keep their notes and tickets, move again, archive and refresh skills', async t => {
  const h = harness(t,false,{ CC_BRO_PORT:'0' })
  const dirs = ['one','two'].map(n => join(h.base,n,'shop-api'))
  mkdirSync(h.data)
  const reg = new DatabaseSync(join(h.data,'projects.sqlite'))
  reg.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,repoPath TEXT NOT NULL UNIQUE,created INTEGER NOT NULL,phase TEXT NOT NULL)')
  for (const [i,dir] of dirs.entries()) {
    mkdirSync(dir,{recursive:true})
    writeFileSync(join(dir,'sample.txt'),'original')
    const old = join(h.data,'projects','id-' + i,'room')
    mkdirSync(old,{recursive:true})
    writeFileSync(join(old,'CLAUDE.md'),'Custom manager rules\n')
    writeFileSync(join(old,'brief.md'),'handwritten ' + i)
    reg.prepare("INSERT INTO projects VALUES(?,?,?,?, 'active')").run('id-' + i,'shop-api',dir,100+i)
  }
  reg.close()
  const snapshot = () => dirs.map(d => [readdirSync(d),statSync(d).mtimeMs,readFileSync(join(d,'sample.txt'),'utf8')])
  const before = snapshot()
  let http = api(await h.cli('ui','--no-open'))
  const legacy = join(h.data,'projects/id-0/room')
  await h.inRoom(legacy,'say','old-ticket','remember previous')
  const initial = (await http('settings')).data
  assert.equal(initial.roomRoot,null)
  assert.equal(initial.client,'terminal')
  assert.equal(initial.defaultRoomRoot,defaultRoomRoot())
  assert.equal(typeof initial.desktopSupported,'boolean')
  assert.equal((await http('projects','POST',{repoPath:dirs[0]})).data.error.code,'room-root-unset')
  const root = join(h.base,'Manager Rooms')
  mkdirSync(root)
  symlinkSync(join(root,'missing'),join(root,'shop-api'))
  const settings = await http('settings','POST',{roomRoot:root,client:'desktop'})
  assert.equal(settings.status,200,JSON.stringify(settings.data))
  const project = () => http('projects').then(r => r.data.find(p => p.id === 'id-0'))
  const first = await project()
  assert.equal(first.roomPath,join(root,'shop-api-2'))
  assert.ok(existsSync(join(root,'shop-api-3','brief.md')))
  assert.ok(!existsSync(legacy))
  assert.equal(readFileSync(join(first.roomPath,'brief.md'),'utf8'),'handwritten 0')
  assert.ok(readFileSync(join(first.roomPath,'CLAUDE.md'),'utf8').startsWith('Custom manager rules\n'))
  const local = '.claude/skills/cc-bro'
  const skill = readFileSync(join(first.roomPath,local,'SKILL.md'),'utf8')
  assert.match(skill,/name: cc-bro/)
  assert.ok(skill.includes('./' + local + '/cc-bro wait'))
  const wrapper = join(first.roomPath,local,'cc-bro')
  const run = promisify(execFile)
  assert.equal((await run(wrapper,['show','old-ticket'],{ cwd:first.roomPath,env:{ PATH:'/usr/bin:/bin',HOME:homedir() } })).stdout.trim(),'remember previous')
  const cleanEnv = { PATH:dirname(process.execPath) + ':/usr/bin:/bin',HOME:homedir() }
  assert.equal((await run(process.execPath,[join(repo,'bin/cc-bro'),'show','old-ticket'],{cwd:first.roomPath,env:cleanEnv})).stdout.trim(),'remember previous')
  const secondRoot = join(root,'elsewhere')
  mkdirSync(join(secondRoot,'shop-api-3'),{recursive:true})
  for (const bad of ['/',homedir(),h.data,join(dirs[0],'nested'),join(first.roomPath,'unsafe')]) {
    assert.equal((await http('settings','POST',{roomRoot:bad})).status,400,bad)
    assert.equal((await project()).roomPath,first.roomPath)
  }
  const reply = await http('settings','POST',{roomRoot:secondRoot})
  assert.equal(reply.status,200)
  assert.equal(reply.data.client,'desktop')
  const second = await project()
  assert.equal(second.roomPath,join(secondRoot,'shop-api-2'))
  assert.equal(readFileSync(join(secondRoot,'shop-api','brief.md'),'utf8'),'handwritten 1')
  assert.deepEqual(readdirSync(join(secondRoot,'shop-api-3')),[])
  assert.equal(existsSync(first.roomPath),false)
  assert.equal(await h.inRoom(second.roomPath,'say','old-ticket','recall'),'previous')
  assert.equal(existsSync(join(second.roomPath,'tickets.sqlite')),false)
  assert.equal(existsSync(join(h.data,'projects/id-0/sessions')),true)
  writeFileSync(join(second.roomPath,local,'SKILL.md'),'outdated generated skill')
  await h.cli('shutdown')
  http = api(await h.cli('ui','--no-open'))
  assert.equal(readFileSync(join(second.roomPath,local,'SKILL.md'),'utf8'),skill)
  assert.equal((await project()).roomPath,second.roomPath)
  assert.deepEqual((await http('projects/id-0','DELETE')).data,{ok:true})
  assert.equal(existsSync(second.roomPath),false)
  assert.ok(existsSync(join(h.data,'trash/id-0/room','brief.md')))
  assert.deepEqual(snapshot(),before)
})

test('bare terminal entry prompts once, uses current stdio, reopens from repo/subfolder/room and refuses unsafe folders', async t => {
  const h = harness(t,false,{ CC_BRO_PORT:'0' })
  const fake = join(h.base,'bin')
  mkdirSync(fake)
  writeFileSync(join(fake,'claude'), '#!/bin/sh\nif [ "$1" = --help ]; then exit 0; fi\nprintf "CLAUDE_CWD=%s ARGC=%s\\n" "$PWD" "$#"\n', { mode:0o755 })
  const profile = join(h.base,'user')
  mkdirSync(profile)
  const env = { ...process.env, HOME:profile, CC_BRO_HOME:h.data, CC_BRO_PORT:'0', PATH:fake + ':' + process.env.PATH }
  async function entry(cwd, input = '') {
    const p = spawn(process.execPath,[join(repo,'bin/cc-bro')],{cwd,env,stdio:'pipe'})
    let out = '', err = ''
    p.stdout.on('data',s => {out+=s})
    p.stderr.on('data',s => {err+=s})
    p.stdin.end(input)
    const [code] = await once(p,'close')
    return { out,err,code }
  }
  for (const cwd of ['/',profile,h.data]) {
    const r = await entry(cwd)
    assert.equal(r.code,1,cwd)
    assert.doesNotMatch(r.out,/Where should|Register this/)
  }
  const rooms = join(profile,'cc-bro')
  assert.match((await entry(h.cwd,'\nn\n')).out,/Registration cancelled/)
  assert.equal(existsSync(rooms),false)
  const first = await entry(h.cwd,'\ny\n')
  assert.equal(first.code,0,first.err)
  assert.match(first.out,/Where should.*Register this.*Board: http:\/\/127\.0\.0\.1:\d+\/#p-/s)
  const room = join(rooms,'work')
  assert.ok(first.out.includes('CLAUDE_CWD=' + room + ' ARGC=0'))
  mkdirSync(join(h.cwd,'sub'))
  mkdirSync(join(room,'notes'))
  for (const cwd of [h.cwd,join(h.cwd,'sub'),room,join(room,'notes')]) {
    const next = await entry(cwd)
    assert.equal(next.code,0,next.err)
    assert.doesNotMatch(next.out,/Where should|Register this/)
    assert.ok(next.out.includes('CLAUDE_CWD=' + room + ' ARGC=0'))
  }
  assert.equal((await entry(rooms)).code,1)
  const sibling = join(rooms,'another-repo')
  mkdirSync(sibling)
  const adjacent = await entry(sibling,'y\n')
  assert.equal(adjacent.code,0,adjacent.err)
  assert.ok(adjacent.out.includes('CLAUDE_CWD=' + sibling + '-2 ARGC=0'))
  assert.deepEqual(readdirSync(sibling),[])
  assert.deepEqual(readdirSync(h.cwd),['sub'])
})

test('journal resumes a partly completed batch and preserves ticket paths', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { Rooms } = await import('../lib/rooms.mjs')
  const { home } = await import('../lib/paths.mjs')
  const dir = mkdtempSync(join(repo,'.sandbox','p3-journal-'))
  const db = new DatabaseSync(join(dir,'projects.sqlite'))
  db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,repoPath TEXT,created INTEGER,phase TEXT)')
  const rooms = new Rooms(db)
  const root = join(dir,'new')
  mkdirSync(root)
  const moves = ['a','b'].map(id => {
    const src = join(dir,'original-' + id), dst = join(root,id)
    const skill = join(src,'.claude/skills/cc-bro')
    mkdirSync(skill,{recursive:true})
    writeFileSync(join(skill,'instance.json'),JSON.stringify({home,id}))
    writeFileSync(join(src,'decisions.md'),'keep-' + id)
    db.prepare("INSERT INTO projects VALUES(?,?,?,0,'active',?)").run(id,id,join(dir,'repo-'+id),src)
    return { id,src,dst }
  })
  db.prepare('UPDATE room_settings SET pending=?').run(JSON.stringify({root,client:'desktop',moves}))
  renameSync(moves[0].src,moves[0].dst)
  db.close()
  const recovered = new DatabaseSync(join(dir,'projects.sqlite'))
  const next = new Rooms(recovered)
  next.resume()
  next.resume()
  assert.equal(next.settings().roomRoot,root)
  for (const m of moves) {
    assert.equal(recovered.prepare('SELECT roomPath FROM projects WHERE id=?').get(m.id).roomPath,m.dst)
    assert.equal(readFileSync(join(m.dst,'decisions.md'),'utf8'),'keep-'+m.id)
    assert.equal(existsSync(m.src),false)
  }
  recovered.close()
})

test('EXDEV moves the full room, including symlinks, and refuses a conflicting target', async t => {
  const fs = (await import('node:fs')).default
  const { syncBuiltinESMExports } = await import('node:module')
  const { home } = await import('../lib/paths.mjs')
  const { moveRoom } = await import('../lib/rooms.mjs')
  const dir = fs.mkdtempSync(join(repo,'.sandbox','p3-volume-'))
  const src = join(dir,'source'), dst = join(dir,'destination')
  mkdirSync(join(src,'.claude/skills/cc-bro'),{recursive:true})
  writeFileSync(join(src,'.claude/skills/cc-bro/instance.json'),JSON.stringify({home,id:'test-volume'}))
  writeFileSync(join(src,'notes'),'my notes')
  symlinkSync('notes',join(src,'pointer'))
  mkdirSync(dst)
  writeFileSync(join(dst,'personal'),'leave me here')
  assert.throws(() => moveRoom(src,dst,'test-volume'),/already exists/)
  assert.equal(readFileSync(join(dst,'personal'),'utf8'),'leave me here')
  const target = join(dir,'other-volume')
  const original = fs.renameSync
  t.mock.method(fs,'renameSync',(a,b) => {
    if (a===src && b===target) throw Object.assign(new Error('different device'),{code:'EXDEV'})
    return original(a,b)
  })
  syncBuiltinESMExports()
  try { moveRoom(src,target,'test-volume') }
  finally { t.mock.restoreAll(); syncBuiltinESMExports() }
  assert.equal(existsSync(src),false)
  assert.equal(fs.readlinkSync(join(target,'pointer')),'notes')
  assert.equal(readFileSync(join(target,'pointer'),'utf8'),'my notes')
})
