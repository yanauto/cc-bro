import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { ask } from './probe.mjs'
const code = randomUUID()
const first = await ask('Remember ' + code + '. Reply ACK.')
const id = first.find(e => e.event === 'init').conversation_id
const second = await ask('Repeat the code in my first message.', ['--conversation', id])
console.log('init', id, 'result', second.at(-1).result)
assert.equal(second.at(-1).result.conversation_id, id)
assert.ok(second.at(-1).result.response.includes(code))
