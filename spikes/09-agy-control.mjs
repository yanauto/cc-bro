import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { agy, dir, run } from './probe.mjs'

const modes = process.argv[2] ? [process.argv[2]] : ['queue', 'stop']
for (const mode of modes) {
  const path = join(dir, mode + '.pid')
  let timer
  let acted = false
  try {
    await run('agy', [...agy, '--mode', 'accept-edits', '--input-format', 'stream-json', '-p', ''], {
      interrupted: mode === 'stop',
      start(send, child) {
        send({ event: 'user', message: { content: 'Run this command now in the current directory: sleep 20 & echo $! > ' + mode + '.pid; wait. Wait for its completion then reply ORIGINAL only.' } })
        timer = setInterval(() => {
          if (!existsSync(path) || acted) return
          acted = true
          console.log('during sleep', mode)
          if (mode === 'stop') child.kill('SIGTERM')
          else {
            send({ event: 'user', message: { content: 'Change your answer to REVISED only.' } })
            child.stdin.end()
          }
        }, 100)
      },
      event(e, child) {
        if (e.event === 'result') {
          console.log(JSON.stringify({ status: e.result.status, response: e.result.response, error: e.result.error, num_turns: e.result.num_turns }))
          if (!acted) child.stdin.end()
        }
        if (e.step_update?.state === 'DONE') console.log('done', e.step_update.step_type)
      }
    })
  } finally { clearInterval(timer) }
  if (!acted) throw new Error('sleep was not observed')
  if (mode === 'stop') {
    await delay(1000)
    const pid = Number(readFileSync(path, 'utf8').trim())
    try { process.kill(pid, 0); console.log('sleep alive', pid) }
    catch (err) { if (err.code !== 'ESRCH') throw err; console.log('sleep gone', pid) }
  }
}
