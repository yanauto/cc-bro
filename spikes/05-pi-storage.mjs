import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { json, sessions, reply } from './probe.mjs'
await json('Reply STORAGE_OK.')
for (const file of readdirSync(sessions)) {
  const rows = readFileSync(join(sessions, file), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  console.log(file, rows[0], rows.map(row => row.type), reply(rows.findLast(row => row.message?.role === 'assistant').message))
}
