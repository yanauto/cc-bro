import { rpc, assistant, reply } from './probe.mjs'
let sent = false
const events = await rpc('Run sleep 5 using bash. After it finishes reply ORIGINAL.', (e, child, send) => {
  if (!sent && e.type === 'tool_execution_start') {
    sent = true
    send({ type: 'steer', message: 'Change the final answer to REVISED only.' })
  }
  if (['response','tool_execution_start','tool_execution_end','agent_settled'].includes(e.type)) {
    const { type, command, success, toolName, aborted } = e
    console.log(JSON.stringify({ type, command, success, toolName, aborted }))
  }
})
console.log('steer sent', sent, 'final', reply(assistant(events)))
