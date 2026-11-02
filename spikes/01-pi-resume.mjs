import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { assistant, json, model, reply } from './probe.mjs'
const code = randomUUID()
for (const [prompt, chosen] of [
  ['Remember ' + code + '. Reply ACK.', model],
  ['Repeat the code from my first message.', model],
  ['Repeat the code from my first message.', process.env.PI_SECOND_MODEL || 'deepseek/deepseek-v4-pro']
]) {
  const result = assistant(await json(prompt, chosen))
  console.log(result.model, reply(result))
  if (!prompt.startsWith('Remember')) assert.ok(reply(result).includes(code))
}
