import assert from 'node:assert/strict'
import { once } from 'node:events'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'
import { sdkRoot } from '../lib/pi-profile.mjs'
import { PiService } from '../lib/pi-service.mjs'
import { harness,until } from './harness.mjs'

const realSdk = {skip:!sdkRoot(process.env.PATH) && 'Install pi 1.4+ to run the offline SDK integration.'}
function client(url) {
  return async (path,method = 'GET',data,origin = url) => {
    const res = await fetch(url+'/api/'+path,{method,headers:{Origin:origin},body:data === undefined ? undefined : JSON.stringify(data)})
    return {status:res.status,body:await res.json()}
  }
}

async function stream(t,url) {
  const controller = new AbortController()
  const r = await fetch(url+'/api/stream',{signal:controller.signal})
  t.after(() => controller.abort())
  const events = []
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
  ;(async () => {
    let buffer = ''
    for (;;) {
      const {value,done} = await reader.read()
      if (done) return
      buffer += value
      let end
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0,end)
        buffer = buffer.slice(end+2)
        if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice(6)))
      }
    }
  })().catch(() => {})
  return events
}

test('pi files, builtins, environment and external credentials; locks, backups, rollback and optional keys',realSdk,async t => {
  const firstKey = 'sk-synthetic-first-7839'
  const nextKey = 'sk-synthetic-second-3481'
  const envKey = 'sk-synthetic-env-8821'
  const h = harness(t,true,{CC_BRO_PORT:'0',DEEPSEEK_API_KEY:envKey,AWS_PROFILE:'offline-profile'})
  const dir = join(h.data,'login')
  mkdirSync(dir,{recursive:true})
  const path = name => join(dir,name+'.json')
  const write = (name,data) => writeFileSync(path(name),JSON.stringify(data))
  const settings = {defaultProvider:'deepseek',defaultModel:'deepseek-flash',defaultThinkingLevel:'medium',enabledModels:['deepseek/*']}
  write('settings',settings)
  write('auth',{'orphan-provider':{type:'api_key',key:'!some-secret-command with-private-arguments'}})
  const url = await h.cli('ui','--no-open'), api = client(url), events = await stream(t,url)
  const initial = (await api('pi')).body
  const provider = (config,id) => config.providers.find(p => p.id === id)
  assert.equal(initial.agentDir,dir)
  assert.equal(initial.defaultModel,'deepseek/deepseek-flash')
  assert.equal(initial.defaultThinking,'medium')
  assert.deepEqual(initial.enabledModels,['deepseek/*'])
  assert.deepEqual(provider(initial,'deepseek').credential,{kind:'env',hint:'DEEPSEEK_API_KEY'})
  assert.deepEqual(provider(initial,'amazon-bedrock').credential,{kind:'ambient',hint:'AWS_PROFILE'})
  assert.deepEqual(provider(initial,'orphan-provider').credential,{kind:'command',hint:'!…'})
  assert.ok(provider(initial,'openai-codex').methods.includes('oauth'))
  assert.equal((await api('pi/providers/deepseek/key','POST',{key:firstKey},'https://elsewhere.invalid')).status,403)
  const authLock = path('auth')+'.lock'
  mkdirSync(authLock)
  const saving = api('pi/providers/deepseek/key','POST',{key:firstKey})
  await sleep(250)
  const original = {'external-writer':{type:'api_key',key:'$ANOTHER_ENV'},'orphan-provider':{type:'api_key',key:'!some-secret-command with-private-arguments'}}
  write('auth',original)
  rmSync(authLock,{recursive:true})
  const saved = await saving
  assert.equal(saved.status,200,JSON.stringify(saved.body))
  assert.equal(saved.body.credential.hint,'sk-…7839')
  assert.deepEqual(JSON.parse(readFileSync(path('auth')))['external-writer'],original['external-writer'])
  const backupRoot = join(h.data,'backups/pi')
  const authBackup = readdirSync(backupRoot).map(n => join(backupRoot,n,'auth.json')).find(existsSync)
  assert.deepEqual(JSON.parse(readFileSync(authBackup)),original)
  assert.equal(statSync(authBackup).mode & 0o777,0o600)
  const spec = {id:'local-box',name:'Local box',api:'openai-completions',baseUrl:'http://127.0.0.1:1/v1',models:[{id:'a',contextWindow:4096}]}
  const missing = await api('settings','POST',{worker:{model:'unknown/model'}})
  assert.equal(missing.body.error.code,'model-not-ready')
  assert.equal((await api('pi/providers','POST',{...spec,id:'deepseek'})).body.error.code,'provider-exists')
  assert.equal((await api('pi/providers/deepseek','DELETE')).status,400)
  assert.equal((await api('pi/providers','POST',spec)).body.credential.hint,'none')
  assert.ok((await api('pi')).body.models.some(m => m.id === 'local-box/a' && m.ready && m.contextWindow === 4096))
  assert.equal((await api('pi/providers','POST',{...spec,key:nextKey})).status,200)
  const newSpec = {...spec,name:'Renamed',models:[{id:'b',reasoning:true}]}
  const replaced = await api('pi/providers','POST',newSpec)
  assert.equal(replaced.body.name,'Renamed')
  assert.equal(JSON.parse(readFileSync(path('models'))).providers['local-box'].apiKey,nextKey)
  const baseline = readFileSync(path('models'))
  const unsupported = await api('pi/providers','POST',{...newSpec,api:'unknown-wire-protocol'})
  assert.equal(unsupported.status,400)
  assert.match(unsupported.body.error.message,/protocol/)
  assert.deepEqual(readFileSync(path('models')),baseline)
  const rolledBack = await api('pi/providers','POST',{...newSpec,key:'$MISSING_P4_VAR_XY187'})
  assert.equal(rolledBack.status,400)
  assert.deepEqual(readFileSync(path('models')),baseline)
  assert.equal((await api('settings','POST',{worker:{model:'local-box/b',thinking:'high',concurrency:2}})).status,200)
  assert.deepEqual(JSON.parse(readFileSync(path('settings'))),settings)
  assert.deepEqual((await api('pi/providers/deepseek/credential','DELETE')).body,{ok:true})
  assert.equal(provider((await api('pi')).body,'deepseek').credential.kind,'env')
  assert.deepEqual((await api('pi/providers/local-box','DELETE')).body,{ok:true})
  write('settings',{...settings,defaultThinkingLevel:'low'})
  await until(() => events.some(e => e.type === 'pi' && e.pi.defaultThinking === 'low'))
  write('models',{providers:{broken:{models:[{id:123}]}}})
  writeFileSync(path('auth'),'{"bad secret: '+firstKey)
  const broken = (await api('pi')).body
  assert.ok(broken.files.find(f => f.name === 'models.json').error)
  assert.ok(broken.files.find(f => f.name === 'auth.json').error)
  assert.ok(broken.problems.length >= 2)
  const rejected = await api('pi/providers/openai/key','POST',{key:nextKey})
  assert.equal(rejected.status,400)
  assert.ok(readFileSync(path('auth'),'utf8').startsWith('{"bad secret:'))
  const publicData = JSON.stringify([initial,saved,replaced,rolledBack,broken,rejected,events])
  for (const secret of [firstKey,nextKey,envKey,'with-private-arguments']) assert.ok(!publicData.includes(secret))
})

test('OpenAI-compatible checks send one short request, stream individual outcomes, classify errors and cancel',realSdk,async t => {
  let active = 0, peak = 0
  const requests = []
  const server = createServer(async (req,res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    requests.push(body)
    peak = Math.max(peak,++active)
    res.on('close',() => {active--})
    await sleep(body.model === 'slow' ? 1500 : 120)
    if (body.model === 'broken') {
      res.writeHead(401,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:{message:'Invalid API key: never-show-this-string'}}))
    }
    res.writeHead(200,{'Content-Type':'text/event-stream'})
    const frame = {id:'fixture',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{role:'assistant',content:'ok'},finish_reason:'stop'}]}
    res.end('data: '+JSON.stringify(frame)+'\n\ndata: [DONE]\n\n')
  })
  server.listen(0,'127.0.0.1');await once(server,'listening')
  t.after(() => {server.closeAllConnections();server.close()})
  const h = harness(t,true,{CC_BRO_PORT:'0'})
  const url = await h.cli('ui','--no-open'), api=client(url), events=await stream(t,url)
  const ids = ['one','two','three','four','broken','slow']
  const created = await api('pi/providers','POST',{id:'offline',baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',api:'openai-completions',models:ids.map(id=>({id}))})
  assert.equal(created.status,200,JSON.stringify(created.body))
  const job = (await api('pi/check','POST',{models:ids.slice(0,5).map(id=>'offline/'+id)})).body
  const done = await until(async()=>{const j=(await api('jobs/'+job.id)).body;return j.state==='done' && j})
  assert.equal(requests.length,5)
  assert.ok(peak > 1 && peak <= 3)
  assert.ok(requests.every(b => b.messages.length === 1 && b.messages[0].content === 'Reply ok.' && (b.max_tokens ?? b.max_completion_tokens) === 16))
  assert.equal(done.results.filter(r=>r.ok).length,4)
  assert.match(done.results.find(r=>!r.ok).error,/Authentication/)
  await until(()=>events.some(e=>e.job?.id===job.id && e.job.results.length===1))
  assert.ok(!JSON.stringify(events).includes('never-show-this-string'))
  const second = (await api('pi/check','POST',{models:['offline/slow']})).body
  assert.equal((await api('jobs/'+second.id,'DELETE')).body.state,'cancelled')
  await sleep(200)
  assert.equal((await api('jobs/'+second.id)).body.results.length,0)
  writeFileSync(join(h.data,'login','settings.json'),JSON.stringify({defaultProvider:'offline',defaultModel:'two'}))
  assert.equal((await api('settings')).body.worker.model,null)
  assert.equal(await h.cli('say','pi-default','Reply ok.'),'ok')
  assert.equal(h.query("SELECT model FROM conversations WHERE name='pi-default'")[0].model,'offline/two')
})

test('worker limits change immediately and thinking is bound to the ticket across restarts',async t => {
  const h=harness(t,false,{CC_BRO_PORT:'0'})
  let api=client(await h.cli('ui','--no-open'))
  const set=async worker=>assert.equal((await api('settings','POST',{worker})).status,200)
  await set({concurrency:1,thinking:'low'})
  await h.cli('say','first','hold','--bg','--model','deepseek/a')
  await h.cli('say','second','hold','--bg')
  const state=n=>h.query('SELECT model,thinking,status FROM conversations WHERE name=?',n)[0]
  assert.equal(state('second').status,'queued')
  await set({concurrency:2,thinking:'high'})
  await until(()=>state('second').status==='running')
  assert.equal(state('second').thinking,'low')
  await set({concurrency:1})
  await h.cli('say','third','hold','--bg')
  assert.equal(state('third').status,'queued')
  await h.cli('stop','first')
  assert.equal(state('third').status,'queued')
  await h.cli('stop','second')
  await until(()=>state('third').status==='running')
  assert.equal(state('third').thinking,'high')
  await h.cli('stop','third')
  await h.cli('shutdown')
  api=client(await h.cli('ui','--no-open'))
  assert.equal((await api('settings')).body.worker.concurrency,1)
  assert.equal(await h.cli('say','first','worker-config'),'a low')
  const override=harness(t,false,{CC_BRO_PORT:'0',CC_BRO_CONCURRENCY:'1'})
  const api2=client(await override.cli('ui','--no-open'))
  await api2('settings','POST',{worker:{concurrency:5}})
  await override.cli('say','a','hold','--bg');await override.cli('say','b','hold','--bg')
  assert.equal(override.query("SELECT status FROM conversations WHERE name='b'")[0].status,'queued')
})

test('login jobs forward both auth flows and prompts, suppress submitted secrets, cancel and offer Terminal fallback',async () => {
  const jobs=new Map(), events=[]
  let note, pending, answer, fallback=0
  const api=new PiService(event=>events.push(structuredClone(event)),jobs,async()=>{fallback++},(op,data,emit,signal)=>{
    if (op==='read') return {result:Promise.resolve({models:[],providers:[]})}
    note=emit;pending=Promise.withResolvers()
    signal.addEventListener('abort',()=>pending.reject(new Error('cancelled')))
    return {result:pending.promise,input:value=>{answer=value}}
  })
  const j=api.start('login',{id:'subscription'})
  note({auth:{url:'https://example.invalid/login',instructions:null}})
  note({prompt:{message:'Choose',placeholder:null,options:[{id:'device',label:'Device'}]}})
  assert.throws(()=>api.input(j.id,'wrong'))
  api.input(j.id,'device')
  note({auth:{verificationUri:'https://example.invalid/device',userCode:'A-B'}})
  note({prompt:{message:'Paste callback',placeholder:null,options:null}})
  api.input(j.id,'one-use-secret')
  assert.equal(answer,'one-use-secret')
  pending.resolve();await until(()=>j.state==='done')
  assert.ok(!JSON.stringify(events).includes('one-use-secret'))
  assert.ok(events.some(e=>e.type==='pi'))
  const second=api.start('login',{id:'subscription'})
  assert.equal(api.cancel(second.id).state,'cancelled')
  const third=api.start('login',{id:'unavailable'})
  pending.reject(Object.assign(new Error('Upgrade pi.'),{code:'pi-sdk-unavailable'}))
  await until(()=>third.state==='failed')
  assert.equal(fallback,1)
  const timeout=api.start('login',{id:'subscription'})
  assert.equal(api.cancel(timeout.id,true).state,'failed')
  assert.match(timeout.log[0],/timed out/)
  await api.close()
})
