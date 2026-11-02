import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { home } from '../../lib/paths.mjs'
import { Projects } from '../../lib/projects.mjs'
import { Slots } from '../../lib/slots.mjs'
import { Web } from '../../lib/web.mjs'
import { Environment } from '../../lib/environment.mjs'

mkdirSync(home, { recursive: true })
let picks = 0
const desktop = {
  hasDesktop() { return !existsSync(join(home,'desktop-missing')) },
  openDesktop(claude,roomPath) { appendFileSync(join(home,'actions.jsonl'),JSON.stringify({claude,roomPath}) + '\n') },
  reveal(roomPath) { appendFileSync(join(home,'actions.jsonl'),JSON.stringify({reveal:roomPath}) + '\n') },
  pickFolder(signal,purpose) { if (purpose === 'rooms') return {path:join(home,'..','rooms')}; return picks++ ? { cancelled: true } : { path: process.env.FIXTURE_REPO } },
  openTerminal(cwd, argv, env) {
    appendFileSync(join(home, 'desktop.jsonl'), JSON.stringify({ cwd, argv, env }) + '\n')
  }
}
const publish = event => web.publish(event)
const projects = new Projects(new Slots(3), () => 'deepseek/deepseek-flash', publish)
const environment = new Environment(publish, desktop)
const blocker = createServer(socket => socket.destroy())
blocker.listen(0, '127.0.0.1')
await once(blocker, 'listening')
const occupied = blocker.address().port
const web = new Web(projects, environment, { port: occupied, desktop, dist: process.env.FIXTURE_DIST })
await projects.recover()
process.send({ url: await web.start(), occupied })
blocker.close()
process.on('disconnect', async () => {
  await web.close()
  for (const crew of projects.crews()) crew.store.db.close()
  projects.db.close()
})
