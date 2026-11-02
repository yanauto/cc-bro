import { assistant, json } from './probe.mjs'
for (const prompt of ['Remember the following filler. Reply OK. ' + 'green paper orange pencil '.repeat(600), 'What color was the pencil?']) {
  const m = assistant(await json(prompt))
  console.log(m.model, m.stopReason, m.usage)
}
