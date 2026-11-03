import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { harness, until } from './harness.mjs'
import { templateArgs, validateTemplate } from '../lib/templates.mjs'
import { cursorModel } from '../lib/stream-workers.mjs'
import { Roster } from '../lib/roster.mjs'

const template = { command:'template-cli', newArgs:['--prompt','{prompt}'], resumeArgs:['--resume','{session}','--prompt','{prompt}'], modelArgs:['--model','{model}'], effortArgs:['--effort','{effort}'], format:'json', reply:{path:'reply'}, session:{path:'id'} }
async function api(h) {
  const url = await h.cli('ui','--no-open')
  return async (path, data) => {
    const r = await fetch(url+'/api/'+path, {method:data?'POST':'GET',headers:data?{Origin:url,'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined})
    const value=await r.json()
    if(!r.ok) throw new Error(value.error.message)
    return value
  }
}

test('roster reads CLI metadata, reflects project overrides, and note proposals require explicit acceptance', async t => {
  const h=harness(t), p=await h.json('init','--allow','codex,agy,cursor-agent,pi:deepseek','--default-worker','codex'), web=await api(h)
  const r=await h.json('roster')
  assert.equal(r.workers.length,4)
  assert.equal(r.workers[0].loginStatus,'ready')
  assert.equal(r.workers[0].defaultModel,'fixture-model')
  assert.deepEqual(r.workers[0].efforts,['low','medium'])
  assert.equal(r.workers.find(w=>w.id==='agy').defaultModel,'fixture-model')
  writeFileSync(join(h.cwd,'fixture-signed-out'),'')
  assert.equal((await h.json('roster')).workers.some(w=>w.id==='cursor-agent'),false)
  const global=await web('settings/global')
  Object.assign(global,{allow:['codex'],worker:'codex',rules:['Keep changes scoped'],entries:{codex:{model:'fixture-model',effort:'low',note:'User note'}}})
  await web('settings/global',global)
  const proposal=await h.json('note','codex','Manager suggestion')
  assert.equal((await h.json('roster')).workers[0].note,'User note')
  let cfg=await web('settings/'+p.id)
  assert.equal(cfg.proposals[0].id,proposal.id)
  cfg=await web('notes/'+p.id+'/'+proposal.id,{accept:true})
  assert.equal(cfg.entries.codex.note,'Manager suggestion')
  const result=await h.json('say','job','hello','--effort','medium')
  assert.deepEqual(result.reminders,['Rule reminder: Keep changes scoped'])
  assert.equal(result.effort,'medium')
  assert.equal((await h.json('show','job')).rules[0],'Keep changes scoped')
  assert.equal(JSON.parse(readFileSync(join(h.cwd,'selections'),'utf8').trim()).effort,'medium')
  await assert.rejects(web('settings/global',global),/Settings changed/)
  await h.cli('shutdown')
  assert.equal((await h.json('roster')).workers[0].note,'Manager suggestion')
})

test('new dispatch uses hot settings, in-flight model stays fixed, revoked workers are hard refused',async t=>{
  const h=harness(t),p=await h.json('init','--allow','codex,agy','--default-worker','codex'),web=await api(h)
  await h.json('say','active','hold','--model','original','--effort','low','--bg')
  let cfg=await web('settings/'+p.id)
  cfg.entries={codex:{model:'changed',effort:'high'}};cfg.rules=['Research with agy']
  await web('settings/'+p.id,cfg)
  const steer=await h.json('say','active','finish','--bg')
  assert.equal(steer.model,'original');assert.equal(steer.effort,'low');assert.equal(steer.outcome,'injected')
  await h.cli('wait','active','1')
  const again=await h.json('say','active','next')
  assert.equal(again.model,'changed');assert.equal(again.effort,'high')
  cfg=await web('settings/'+p.id);cfg.allow=['agy'];cfg.worker='agy'
  await web('settings/'+p.id,cfg)
  await assert.rejects(h.cli('say','active','blocked'),/not allowed/)
  const next=await h.json('say','new','hello')
  assert.equal(next.worker,'agy');assert.equal(next.reminders.length,1)
})

for(const worker of ['agy','cursor-agent']) test(worker+' resumes, queues interjections, shows changes, reviews and stops',async t=>{
  const h=harness(t),web=await api(h)
  execFileSync('git',['init','-q'],{cwd:h.cwd});execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.test','commit','--allow-empty','-qm','base'],{cwd:h.cwd})
  const p=await h.json('init','--allow',worker+',codex','--default-worker',worker)
  await h.json('say','memory','remember trail')
  const one=await h.json('show','memory')
  if(worker==='agy') assert.equal(one.cacheRatio,80/180)
  assert.equal((await h.json('say','memory','recall')).reply,'trail')
  assert.equal((await h.json('show','memory')).session,one.session)
  await h.json('say','queued','hold','--bg')
  const queued=await h.json('say','queued','second','--bg')
  assert.equal(queued.outcome,'queued');assert.equal(queued.turn,2)
  writeFileSync(join(h.cwd,'release-stream'),'')
  assert.equal((await h.json('wait','queued','2')).reply,'second')
  await h.json('say','change','write fixture','--worktree')
  const change=await h.json('show','change')
  assert.ok(change.branch);assert.ok(change.changedFiles.some(f=>f.path==='stream-proof.txt'))
  assert.equal(existsSync(join(h.cwd,'stream-proof.txt')),false)
  const review=await h.json('review','change','--by','codex')
  assert.equal((await h.json('show',review.name)).parent,'change')
  const reviewBack=await h.json('review',review.name,'--by',worker)
  assert.equal(reviewBack.worker,worker)
  await h.cli('done','change')
  assert.equal((await web('projects/'+p.id+'/tickets/change')).status,'done')
  await h.json('say','cancel','hold','--bg','--worktree');await h.cli('stop','cancel')
  assert.equal((await h.json('show','cancel')).status,'stopped')
})

test('custom template must pass new/resume trial; argument boundaries, snapshots and failed extraction are preserved',async t=>{
  const h=harness(t),p=await h.json('init','--allow','codex'),web=await api(h)
  const cfg=await web('settings/'+p.id)
  cfg.entries={'custom:fixture':{template}};cfg.allow=['codex','custom:fixture']
  await assert.rejects(web('settings/'+p.id,cfg),/Test this exact template/)
  const trial=await web('templates/'+p.id+'/test',{template})
  assert.equal(trial.status,'passed')
  await web('settings/'+p.id,cfg)
  const first=await h.json('say','custom','remember safe','--worker','custom:fixture','--model','m','--effort','low')
  assert.equal(first.capability,'degraded')
  assert.equal((await h.json('say','custom','recall')).reply,'safe')
  const id=(await h.json('show','custom')).session
  const shellText='$(touch should-not-exist) `touch also-not` ; quoted "value"'
  assert.equal((await h.json('say','custom',shellText)).reply,shellText)
  assert.equal(existsSync(join(h.cwd,'should-not-exist')),false)
  assert.equal((await h.json('show','custom')).session,id)
  const bad={...template,resumeArgs:[...template.resumeArgs,'--wrong-id']}
  await assert.rejects(web('templates/'+p.id+'/test',{template:bad}),/different session|remember/)
  await h.cli('done','custom')
})

test('global inheritance is explicit and project allowlists remain isolated',async t=>{
  const h=harness(t),p=await h.json('init','--allow','codex'),web=await api(h)
  let g=await web('settings/global');g.allow=['agy'];g.worker='agy';await web('settings/global',g)
  assert.equal((await h.json('roster')).defaultWorker,'codex')
  const cfg=await web('settings/'+p.id);cfg.inheritPolicy=true;await web('settings/'+p.id,cfg)
  assert.equal((await h.json('roster')).defaultWorker,'agy')
  await assert.rejects(h.cli('say','denied','hi','--worker','codex'),/not allowed/)
  await h.cli('init','--allow','codex')
  assert.equal((await h.json('roster')).defaultWorker,'codex')
})

test('template validation rejects missing resume and treats placeholders as single argv entries',()=>{
  assert.throws(()=>validateTemplate({...template,resumeArgs:['--prompt','{prompt}']}),/session/)
  assert.throws(()=>validateTemplate({...template,command:'sh -c'}),/executable/)
  const t=validateTemplate(template)
  assert.deepEqual(templateArgs(t,{text:'a b; $x',provider:'custom:fixture',model:'custom:fixture',cwd:'/tmp'}).args,['--prompt','a b; $x'])
  assert.equal(cursorModel('grok-4.7','low'),'grok-4.7[effort=low]')
  assert.equal(cursorModel('grok-4.7-high','low',['grok-4.7-low']),'grok-4.7-low')
  assert.equal(cursorModel('m[fast=true,effort=high]','low'),'m[fast=true,effort=low]')
})

test('Terminal actions use explicit commands and quote each custom argument',()=>{
  const roster=Object.create(Roster.prototype)
  roster.read=()=>({entries:{'custom:example':{template:{actions:{login:['example-cli','login','literal $(touch nope)',"quote'value"]}}}}})
  assert.equal(roster.terminalCommand('custom:example','login','global'),"'example-cli' 'login' 'literal $(touch nope)' 'quote'\\''value'")
  assert.equal(roster.terminalCommand('codex','upgrade','global'),'npm install -g @openai/codex@latest')
  assert.throws(()=>roster.terminalCommand('codex','remove','global'),/Unknown CLI action/)
})
