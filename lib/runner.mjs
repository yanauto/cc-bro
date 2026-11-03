import { mkdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { home, socketPath } from './paths.mjs'
import { Slots } from './slots.mjs'
import { Projects } from './projects.mjs'
import { Web } from './web.mjs'

process.umask(0o077)
mkdirSync(home, { recursive: true })
const lease = new DatabaseSync(join(home, 'runner.lock'))
try { lease.exec('BEGIN EXCLUSIVE') }
catch (err) {
  if (err.errcode !== 5) throw err
  process.exit(0)
}
const slots = new Slots(Number(process.env.CC_BRO_CONCURRENCY ?? 3))
const publish = event => web.publish(event)
const projects = new Projects(slots, publish)
const web = new Web(projects)
await projects.recover()
rmSync(socketPath, { force: true })
let closing = false
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  try {
    if (closing) throw new Error('Runner is shutting down')
    if (req.url === '/ready' && req.method === 'GET') {
      res.end(JSON.stringify({ pid: process.pid, protocol:9 }))
      return
    }
    if (req.method !== 'POST') throw new Error('Expected POST')
    let body = ''
    req.setEncoding('utf8')
    for await (const part of req) body += part
    const input = JSON.parse(body)
    const crew = input.projectId ? projects.get(input.projectId).crew : null
    let reply
    if (req.url === '/ui') reply = { url: await web.start() }
    else if (req.url === '/register') reply = projects.register(input.cwd, input.allow, input.worker)
    else if (req.url === '/context') reply = projects.context(input.cwd)
    else if (req.url === '/roster') reply = await projects.roster.list(input.projectId)
    else if (req.url === '/note-proposal') reply = projects.roster.propose(input.projectId, input.worker, input.note)
    else if (req.url === '/say') {
      input.defaultCwd = projects.get(input.projectId).repoPath
      reply = await crew.serial(input.name, () => crew.say(input))
      if (reply.delivery) reply = await reply.delivery
    } else if (req.url === '/review') reply = await crew.serial(input.name, () => crew.review(input))
    else if (req.url === '/stop') reply = await crew.serial(input.name, () => crew.stop(input.name))
    else if (req.url === '/done') reply = await crew.serial(input.name, () => crew.store.done(input.name))
    else if (req.url === '/shutdown') {
      closing = true
      try { await stopWorkers() } catch (err) { closing = false; slots.paused = false; slots.drain(); throw err }
      reply = { status: 'offline' }
      res.once('finish', () => server.close())
    } else throw new Error('Unknown command')
    res.end(JSON.stringify(reply))
  } catch (err) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: err.message }))
  }
})

async function stopWorkers() {
  slots.paused = true
  await web.close()
  for (const crew of projects.crews()) {
    await Promise.allSettled([...crew.queues.values()])
    for (const c of crew.store.stmt("SELECT * FROM conversations WHERE worker_pid IS NOT NULL OR status IN ('queued','running')").all()) {
      if (['queued','running'].includes(c.status)) await crew.stop(c.name)
      else await crew.release(c, crew.workers.get(c.id))
    }
  }
}

async function shutdown() {
  if (closing) return
  closing = true
  try { await stopWorkers() }
  catch { process.exitCode = 1 }
  finally { server.close() }
}

server.on('close', () => {
  for (const crew of projects.crews()) crew.store.db.close()
  projects.db.close()
  lease.close()
})
server.listen(socketPath)
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
