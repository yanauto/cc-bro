import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('installed Codex schema accepts the native requests and publishes the fields consumed by its adapter', t => {
  const dir = mkdtempSync(join(tmpdir(),'cc-bro-schema-'))
  t.after(() => rmSync(dir,{recursive:true,force:true}))
  execFileSync('codex',['app-server','generate-json-schema','--out',dir],{cwd:dir})
  const schema = name => JSON.parse(readFileSync(join(dir,name+'.json'),'utf8'))
  const methods = name => schema(name).oneOf.flatMap(v => v.properties.method.enum)
  const client = methods('ClientRequest'), server = methods('ServerNotification')
  for (const k of ['initialize','thread/start','thread/resume','thread/name/set','turn/start','turn/steer']) assert.ok(client.includes(k),k)
  for (const k of ['item/started','item/completed','thread/tokenUsage/updated','turn/completed']) assert.ok(server.includes(k),k)
  for (const [type,fields] of Object.entries({
    ThreadStartParams:['cwd','approvalPolicy','model'],
    ThreadResumeParams:['threadId','cwd','approvalPolicy','model'],
    ThreadSetNameParams:['threadId','name'],
    TurnStartParams:['threadId','input'],
    TurnSteerParams:['threadId','expectedTurnId','input']
  })) {
    const params = schema('v2/'+type)
    assert.ok((params.required ?? []).every(k => fields.includes(k)),type+' needs a new field')
    for (const k of fields) assert.ok(k in params.properties,type+'.'+k)
  }
  assert.ok(schema('v2/TurnSteerResponse').required.includes('turnId'))
  const usage = schema('v2/ThreadTokenUsageUpdatedNotification').definitions
  assert.ok(usage.ThreadTokenUsage.required.includes('last'))
  assert.ok(usage.TokenUsageBreakdown.required.includes('cachedInputTokens'))
  const input = schema('v2/TurnStartParams').definitions.UserInput.oneOf.find(v => v.properties?.type?.enum?.includes('text'))
  assert.ok(input.required.every(k => ['type','text','text_elements'].includes(k)))
})
