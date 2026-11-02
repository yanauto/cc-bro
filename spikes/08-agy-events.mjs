import { ask, fixture, task } from './probe.mjs'
fixture()
const events = await ask(task, ['--mode', 'accept-edits'])
for (const e of events) {
  const s = e.step_update
  if (s) console.log(e.event, s.step_index, s.step_type, s.state, s.tool_name ?? '', Object.keys(s).join(','))
  else console.log(e.event, e.result?.status, e.result?.response)
}
