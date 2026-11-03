import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { harness } from './harness.mjs'
import { rosterOutput, rosterText } from '../lib/roster-output.mjs'

const caps = { input: { text: true, image: true, audio: false, video: false, pdf: false }, context_tokens: 500000, max_output_tokens: 128000, sources: { context_tokens: 'cli' } }
const model = (id, tier = 'workhorse') => ({ id, efforts: [], capabilities: structuredClone(caps), catalog: { id: id.replace(/-(?:low|high|fast).*$/, ''), tier, grade: 'A', summary: { en: 'Daily coding model. More details stay in full output.', zh: '日常编程。细节留在完整输出。' }, as_of: '2026-11-03', stale: false, source: 'Long research source '.repeat(100), modalities: { context_tokens: 1000000 } } })
const worker = (id, allowed, models) => ({ id, allowed, cli: id.split(':')[0], capability: 'full', steering: 'inject', cache: true, installed: true, loginStatus: 'ready', defaultModel: models[0]?.id, defaultEffort: 'high', efforts: ['low','high'], note: '', rules: [], warnings: [], models })
const roster = workers => ({ projectId: 'fixture-project', defaultWorker: workers[0].id, rules: ['Keep changes scoped'], workers, picks: { coding: { first: ['current'], backup: ['old'] } }, effort_advice: 'Use medium for ordinary work.', catalog: { as_of: '2026-11-03', stale_after_days: 60, warnings: [] } })

test('compact roster bounds a three-bro roster and never expands denied workers, even with full', () => {
  const input = roster([
    worker('codex', true, [model('current'),model('old','previous generation'),model('replaced','superseded')]),
    worker('pi:openai-codex', true, [model('provider/current'),model('provider/old','previous generation')]),
    worker('agy', true, [model('gemini-low'),model('gemini-high'),model('gemini-high-fast')]),
    worker('cursor-agent', false, Array.from({length:300},(_,i)=>model('denied-'+i)))
  ])
  input.workers[0].note = 'User note\nkept in full'
  input.workers[1].models[0].catalog.summary = {zh:'日常编程。细节留在完整输出。'}
  const compact = rosterOutput(input)
  assert.deepEqual(compact.workers.at(-1), {id:'cursor-agent',allowed:false})
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < 10000)
  assert.ok(rosterText(compact).split('\n').length <= 60)
  assert.equal(compact.workers[0].note,input.workers[0].note)
  assert.equal(compact.workers[0].olderModels,2)
  assert.equal(compact.workers[0].models.length,1)
  assert.equal(compact.workers[0].models[0].catalog.summary,'Daily coding model.')
  assert.equal(compact.workers[1].models[0].catalog.summary,'日常编程。')
  assert.equal(compact.workers[0].models[0].capabilities.context_tokens,undefined)
  assert.equal(compact.workers[0].models[0].catalog.source,undefined)
  assert.deepEqual(compact.picks.coding.backup,[])
  const text = rosterText(compact)
  assert.equal(text.split('\n').filter(line=>line.includes('cursor-agent')).length,1)
  assert.match(text,/cursor-agent.*NOT ALLOWED/)
  assert.doesNotMatch(JSON.stringify(compact),/denied-299|Long research/)
  const full = rosterOutput(input,{full:true})
  assert.equal(full.workers[0].models.length,3)
  assert.equal(full.workers[0].models[0].capabilities.context_tokens,500000)
  assert.deepEqual(full.workers.at(-1), {id:'cursor-agent',allowed:false})
  assert.deepEqual(input.workers[0].models.length,3)
})

test('variants share one row with a real dispatch ID, explicit efforts and conservative input', () => {
  const models = [model('provider/current-low'),model('provider/current-high-fast'),model('provider/current[effort=ultra,fast=true]'),model('provider/current-next'),model('provider/current-extra-high'),model('provider/current-off')]
  models[1].capabilities.input.image = false
  models[3].catalog = undefined
  const input = roster([worker('pi:fixture',true,models)])
  input.workers[0].defaultModel = models[1].id
  const output = rosterOutput(input)
  assert.equal(output.workers[0].models.length,2)
  const group = output.workers[0].models[0]
  assert.equal(group.id,models[1].id)
  assert.equal(group.variantCount,5)
  assert.deepEqual(group.efforts,['off','low','high','extra-high','ultra'])
  assert.equal(group.fast,true)
  assert.equal(group.capabilities.input.image,'unknown')
  assert.equal(group.capabilities.input.text,true)
  assert.equal(output.workers[0].models[1].catalog,undefined)
  assert.deepEqual(output.workers[0].models[1].efforts,[])
  const only = rosterOutput(input,{worker:'pi:fixture',full:true})
  assert.equal(only.workers.length,1)
  assert.equal(only.workers[0].models.length,6)
  input.workers[0].models[0].hidden = true
  assert.equal(rosterOutput(input,{full:true}).workers[0].models.some(m=>m.id===models[0].id),false)
  assert.throws(()=>rosterOutput(input,{worker:'missing'}),/not in the detected roster/)
})

test('older defaults, stale descriptions and all user rules survive compact projection', () => {
  const input = roster([worker('codex',true,[model('old','previous generation'),model('current')]),worker('blocked',false,[model('secret')])])
  input.workers[0].models[1].catalog.stale = true
  input.workers[0].rules = ['Keep all rules','Do not publish']
  input.workers[0].warnings = ['CLI warning']
  const output = rosterOutput(input,{worker:'codex'})
  assert.equal(output.workers[0].defaultModel,'old')
  assert.equal(output.workers[0].defaultFolded,true)
  assert.deepEqual(output.workers[0].rules,input.workers[0].rules)
  assert.match(rosterText(output),/STALE/)
  assert.match(rosterText(output),/older.*--full/)
  assert.match(rosterText(output),/Do not publish/)
  assert.deepEqual(rosterOutput(input,{worker:'blocked'}).workers,[{id:'blocked',allowed:false}])
})

test('CLI defaults to compact JSON and text; full and worker filters preserve details without revealing denied models', async t => {
  const h = harness(t)
  await h.cli('init','--allow','codex')
  writeFileSync(join(h.cwd,'fixture-models.json'),JSON.stringify([
    { model:'gpt-6.1-sol-low',inputModalities:['text','image'] },
    { model:'gpt-6.1-sol-high-fast',inputModalities:['text','image'] },
    { model:'gpt-5.6-sol',inputModalities:['text','image'] }
  ]))
  const compact = await h.json('roster'), text = await h.cli('roster')
  assert.equal(compact.mode,'compact')
  const codex = compact.workers.find(w=>w.id==='codex')
  assert.equal(codex.models.length,1)
  assert.equal(codex.olderModels,1)
  assert.deepEqual(codex.models[0].efforts,['low','high'])
  assert.equal(text.split('\n').filter(s=>s.includes('gpt-6.1-sol-low')).length,1)
  assert.match(text,/Older\/superseded: 1/)
  const full = await h.json('roster','--full')
  assert.equal(full.mode,'full')
  assert.equal(full.workers.find(w=>w.id==='codex').models.length,3)
  assert.equal(full.workers.find(w=>w.id==='codex').models[0].capabilities.context_tokens,1050000)
  assert.ok(full.workers.filter(w=>!w.allowed).every(w=>Object.keys(w).join(',')==='id,allowed'))
  const one = await h.json('roster','--worker','codex','--full')
  assert.deepEqual(one.workers.map(w=>w.id),['codex'])
  assert.equal((await h.json('roster','--worker','codex')).workers[0].models.length,1)
  assert.match(await h.cli('roster','--worker','codex','--full'),/Context: 1050000 \(catalog-api-limit\)/)
  await assert.rejects(h.cli('roster','--worker','pi:missing'),/not in the detected roster/)
})
