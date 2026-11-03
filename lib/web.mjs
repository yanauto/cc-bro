import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { checkout, repo } from './paths.mjs'

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp' }

function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code })
}

function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function body(req) {
  let text = ''
  for await (const part of req) {
    text += part
    if (Buffer.byteLength(text) > 256 * 1024) fail(413, 'BODY_TOO_LARGE', 'Settings exceed 256 KiB')
  }
  return JSON.parse(text || '{}')
}

export class Web {
  constructor(projects, { dist = checkout ? join(repo, 'ui', 'dist') : join(repo, 'bundle', 'board'), port = Number(process.env.CC_BRO_PORT ?? 4517) } = {}) {
    this.projects = projects
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
    const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000)
    res.on('close', () => { clearInterval(heartbeat); this.streams.delete(res) })
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
    if (path === '/api/projects' && method === 'GET') return json(res, this.projects.list())
    const roster = this.projects.roster
    if (group === 'settings' && rawId && !resource) {
      if (method === 'GET') return json(res, roster.config(rawId))
      if (method === 'POST') return json(res, roster.save(rawId, await body(req)))
    }
    if (group === 'roster' && rawId && !resource && method === 'GET') return json(res, await roster.list(rawId, true))
    if (group === 'templates' && rawId && resource === 'test' && method === 'POST') {
      const input = await body(req)
      return json(res, await roster.trial(rawId, input.template, input.model, input.effort))
    }
    if (group === 'notes' && rawId && resource && method === 'POST') {
      const input = await body(req)
      if (typeof input.accept !== 'boolean') fail(400, 'INVALID_INPUT', 'Expected accept: true or false')
      return json(res, roster.resolveProposal(rawId, resource, input.accept))
    }
    if (group === 'cli' && rawId && resource && method === 'POST') {
      const input = await body(req)
      return json(res, await roster.terminal(decodeURIComponent(rawId), resource, input.projectId ? this.projects.get(input.projectId).repoPath : process.cwd(), input.projectId ?? 'global'))
    }
    if (group === 'projects' && rawId) {
      const p = this.projects.get(rawId)
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
    for (const stream of this.streams) stream.end()
    if (this.server.listening) await new Promise(ok => this.server.close(ok))
  }
}
