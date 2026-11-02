import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rpc, dir } from './probe.mjs'
const path = join(dir, 'child.pid')
const timer = setInterval(() => {
  if (cancel && existsSync(path)) {
    cancel({ type: 'abort' })
    clearInterval(timer)
  }
}, 100)
let cancel
try {
  await rpc('Use bash to run exactly: sleep 50 & echo $! > child.pid; wait. Then reply DONE.', (e, child, send) => {
    if (e.type === 'tool_execution_start') cancel = send
    if (['response','tool_execution_end','agent_settled'].includes(e.type)) {
      const { type, command, success, aborted, isError } = e
      console.log(JSON.stringify({ type, command, success, aborted, isError }))
    }
  })
} finally { clearInterval(timer) }
const pid = Number(readFileSync(path, 'utf8').trim())
try { process.kill(pid, 0); console.log('sleep alive', pid) }
catch (err) { if (err.code !== 'ESRCH') throw err; console.log('sleep gone', pid) }
