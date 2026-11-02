import { fixture, json, rpc, task } from './probe.mjs'
for (const invoke of [json, rpc]) {
  fixture()
  const events = await invoke(task)
  console.log(invoke.name, [...new Set(events.map(e => e.type))])
  console.log('deltas', [...new Set(events.flatMap(e => e.assistantMessageEvent?.type || []))])
  for (const e of events.filter(e => e.type.startsWith('tool_execution') && !e.type.endsWith('update') || e.type === 'agent_settled'))
    console.log(e.type, e.toolName, e.args ?? e.isError ?? e.aborted)
}
