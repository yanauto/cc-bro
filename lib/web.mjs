import { createReadStream, mkdirSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { checkout, repo } from './paths.mjs'
import { platform } from './platform/index.mjs'

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp' }

function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code })
}

function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function body(req, optional = false) {
  let data = ''
  req.setEncoding('utf8')
  for await (const chunk of req) {
    data += chunk
    if (data.length > 65536) fail(413, 'BODY_TOO_LARGE', 'Request is too large')
  }
  if (optional && !data.trim()) return {}
  try { return JSON.parse(data) } catch { fail(400, 'INVALID_JSON', 'Expected a JSON request body') }
}

export class Web {
  constructor(projects, environment, { desktop = platform, dist = checkout ? join(repo, 'ui', 'dist') : join(repo, 'bundle', 'board'), port = Number(process.env.CC_BRO_PORT ?? 4517) } = {}) {
    this.projects = projects
    this.environment = environment
    this.desktop = desktop
    this.dist = dist
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid CC_BRO_PORT')
    this.port = port
    this.streams = new Set()
    this.server = createServer((req, res) => {
      this.route(req, res).catch(err => {
        if (res.headersSent) return res.destroy()
        json(res, { error: { code: err.code || 'REQUEST_FAILED', message: err.message } }, err.status || 400)
      })
    })
  }

  start() {
    this.starting ??= this.listen().catch(err => { this.starting = null; throw err })
    return this.starting
  }

  async listen() {
    for (let port = this.port; port <= 65535; port++) {
      try {
        await new Promise((ok, bad) => {
          const error = err => { this.server.off('listening', listening); bad(err) }
          const listening = () => { this.server.off('error', error); ok() }
          this.server.once('error', error).once('listening', listening).listen(port, '127.0.0.1')
        })
        this.origin = 'http://127.0.0.1:' + this.server.address().port
        return this.origin
      } catch (err) { if (err.code !== 'EADDRINUSE') throw err }
    }
    throw new Error('No available loopback port')
  }

  publish(event) {
    if (!this.streams.size) return
    const frame = 'data: ' + JSON.stringify(event) + '\n\n'
    for (const res of this.streams) {
      if (res.destroyed || res.writableEnded) continue
      if (res.writableLength > 1024 * 1024) res.destroy()
      else res.write(frame)
    }
  }

  stream(res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write('data: ' + JSON.stringify({ type: 'hello', projects: this.projects.list() }) + '\n\n')
    this.streams.add(res)
    this.environment.pi.watch()
    const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000)
    res.on('close', () => { clearInterval(heartbeat); this.streams.delete(res) })
  }

  async settings() {
    return { ...this.projects.rooms.settings(), desktopSupported: await this.environment.supportsDesktop() }
  }

  async configure(patch,candidate,initialOnly = false) {
    const model = patch?.worker?.model
    if (model !== undefined && model !== null && !(await this.environment.pi.read()).models.some(m => m.id === model && m.ready)) fail(400,'model-not-ready','Select a ready pi model.')
    const desktopSupported = await this.environment.supportsDesktop()
    if (initialOnly && this.projects.rooms.settings().roomRoot !== null) throw new Error('Another session already selected a room root. Run cc-bro again.')
    const settings = { ...this.projects.configure(patch,candidate), desktopSupported }
    this.publish({ type:'settings', settings })
    return settings
  }

  async route(req, res) {
    if ('http://' + req.headers.host !== this.origin) fail(403, 'INVALID_HOST', 'Use the local cc-bro address')
    const method = req.method
    if (['POST', 'DELETE'].includes(method) && req.headers.origin !== this.origin) {
      fail(403, 'INVALID_ORIGIN', 'This action must come from this cc-bro page')
    }
    const path = new URL(req.url, this.origin).pathname
    if (!path.startsWith('/api/')) {
      if (!['HEAD', 'GET'].includes(method)) fail(405, 'METHOD_NOT_ALLOWED', 'Unsupported method')
      return this.static(req, res, path)
    }
    const [, , group, rawId, resource, rawTicket, ...extra] = path.split('/')
    if (extra.length) fail(404, 'NOT_FOUND', 'Unknown endpoint')
    if (path === '/api/stream' && method === 'GET') return this.stream(res)
    if (path === '/api/env' && method === 'GET') return json(res, await this.environment.refresh())
    if (path === '/api/env/install-pi' && method === 'POST') return json(res, this.environment.install())
    if (path === '/api/env/login' && method === 'POST') {
      await this.environment.login()
      return json(res, { ok: true })
    }
    if (group === 'pi') {
      const pi = this.environment.pi
      if (path === '/api/pi' && method === 'GET') return json(res,await pi.read())
      if (path === '/api/pi/check' && method === 'POST') return json(res,pi.start('check',await body(req,true)))
      if (rawId === 'providers' && !resource && method === 'POST') {
        const data = await body(req)
        return json(res,await pi.write('provider',data?.id,data))
      }
      if (rawId === 'providers' && resource) {
        const id = decodeURIComponent(resource)
        if (rawTicket === 'key' && method === 'POST') return json(res,await pi.write('key',id,(await body(req))?.key))
        if (rawTicket === 'login' && method === 'POST') return json(res,pi.start('login',{id}))
        if (rawTicket === 'credential' && method === 'DELETE') return json(res,await pi.write('credential',id))
        if (!rawTicket && method === 'DELETE') return json(res,await pi.write('remove',id))
      }
    }
    if (group === 'jobs' && rawId && !rawTicket) {
      const job = this.environment.jobs.get(rawId)
      if (!job) fail(404, 'JOB_NOT_FOUND', 'Install job not found')
      if (!resource && method === 'GET') return json(res, job)
      if (!resource && method === 'DELETE') return json(res,this.environment.pi.cancel(rawId))
      if (resource === 'input' && method === 'POST') return json(res,this.environment.pi.input(rawId,(await body(req))?.value))
    }
    if (path === '/api/settings' && method === 'GET') return json(res,await this.settings())
    if (path === '/api/settings' && method === 'POST') return json(res,await this.configure(await body(req)))
    if (path === '/api/settings/reveal-room-root' && method === 'POST') {
      const root = this.projects.rooms.settings().roomRoot
      if (!root) fail(400,'room-root-unset','Choose where manager rooms live first.')
      mkdirSync(root,{ recursive:true })
      await this.desktop.reveal(root)
      return json(res,{ ok:true })
    }
    if (['/api/projects/pick','/api/settings/pick-room-root'].includes(path) && method === 'POST') {
      if (this.picker) fail(409, 'PICKER_BUSY', 'A folder picker is already open')
      const controller = new AbortController()
      this.picker = controller
      const abort = () => controller.abort()
      res.once('close', abort)
      try {
        const picked = await this.desktop.pickFolder(controller.signal,path === '/api/settings/pick-room-root' ? 'rooms' : 'project')
        if (!res.destroyed) json(res, picked)
      } finally {
        res.off('close', abort)
        this.picker = null
      }
      return
    }
    if (path === '/api/projects') {
      if (method === 'GET') return json(res, this.projects.list())
      if (method === 'POST') return json(res, this.projects.create((await body(req))?.repoPath))
    }
    if (group === 'projects' && rawId) {
      if (!resource && method === 'DELETE') return json(res, await this.projects.remove(rawId))
      const p = this.projects.get(rawId)
      if (resource === 'open' && !rawTicket && method === 'POST') {
        const input = await body(req,true)
        if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400,'INVALID_CLIENT','Expected a client selection')
        const client = input.client === undefined ? this.projects.rooms.settings().client : input.client
        return json(res,await this.environment.openRoom(this.projects.forOpen(rawId),client))
      }
      if (resource === 'reveal' && !rawTicket && method === 'POST') {
        await this.desktop.reveal(this.projects.summary(rawId).roomPath)
        return json(res,{ ok:true })
      }
      if (resource === 'tickets' && method === 'GET') {
        if (!rawTicket) return json(res, p.crew.store.ticketRows())
        const ticket = p.crew.store.detail(decodeURIComponent(rawTicket))
        if (!ticket) fail(404, 'TICKET_NOT_FOUND', 'Ticket not found')
        return json(res, ticket)
      }
    }
    fail(404, 'NOT_FOUND', 'Unknown endpoint')
  }

  async static(req, res, path) {
    let root
    try { root = await realpath(this.dist) }
    catch (err) {
      if (err.code !== 'ENOENT') throw err
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('cc-bro is running. Build ui/dist to open the board.')
    }
    let file = resolve(root, '.' + decodeURIComponent(path))
    if (file !== root && !file.startsWith(root + sep)) fail(404, 'NOT_FOUND', 'File not found')
    if (file === root || !extname(file)) file = join(root, 'index.html')
    try { file = await realpath(file) } catch { fail(404, 'NOT_FOUND', 'File not found') }
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) fail(404, 'NOT_FOUND', 'File not found')
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).on('error', () => res.destroy()).pipe(res)
  }

  async close() {
    await this.environment.pi.close()
    this.picker?.abort()
    for (const stream of this.streams) stream.end()
    if (this.server.listening) await new Promise(ok => this.server.close(ok))
  }
}
