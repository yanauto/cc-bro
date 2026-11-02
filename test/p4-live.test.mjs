import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { harness,until } from './harness.mjs'
import { seedDeepSeek } from './live-credentials.mjs'

test('sandbox key, custom OpenAI provider, real checks and default-model delegation', {timeout:180000},async t => {
  const h = harness(t,true,{CC_BRO_PORT:'0'})
  const {url,key} = await seedDeepSeek(t,h)
  async function api(path,body) {
    const r = await fetch(url+'/api/'+path,body === undefined ? {} : {method:'POST',headers:{Origin:url},body:JSON.stringify(body)})
    assert.equal(r.status,200)
    return r.json()
  }
  const builtin = 'deepseek/deepseek-flash'
  const custom = 'cc-bro-compatible'
  const model = custom+'/deepseek-flash'
  let config = await api('pi')
  assert.ok(config.models.some(m => m.id === builtin && m.ready))
  const baseUrl = config.providers.find(p => p.id === 'deepseek').baseUrl
  assert.equal(new URL(baseUrl).hostname,'api.deepseek.com')
  const spec = {id:custom,baseUrl,api:'openai-completions',models:[{id:'deepseek-flash'}]}
  await api('pi/providers',{...spec,key})
  await api('pi/providers',{...spec,name:'P4 compatible service'})
  config = await api('pi')
  assert.ok(config.models.some(m => m.id === model && m.ready))
  assert.ok(!JSON.stringify(config).includes(key))
  const job = await api('pi/check',{models:[builtin,model]})
  const done = await until(async () => { const j=await api('jobs/'+job.id); return ['done','failed'].includes(j.state) && j },65000)
  assert.equal(done.results.length,2)
  for (const r of done.results) { t.diagnostic(r.model+' '+r.ok+' '+r.ms+'ms '+(r.error ?? '')); assert.ok(r.ok,r.error) }
  await api('settings',{roomRoot:join(h.base,'rooms'),worker:{thinking:'off',concurrency:2}})
  const project = await api('projects',{repoPath:h.cwd})
  for (const [id,workerModel] of [['default-worker',builtin],['custom-worker',model]]) {
    await api('settings',{worker:{model:workerModel}})
    const reply = await h.inRoom(project.roomPath,'say',id,'Reply with the single word ok.')
    const ticket = await api('projects/'+project.id+'/tickets/'+id)
    assert.equal(ticket.model,workerModel)
    assert.equal(ticket.status,'review')
    assert.match(reply,/ok/i)
    t.diagnostic('cc-bro say without --model: '+ticket.model+' → '+ticket.status)
  }
})
