import { platform } from './platform/index.mjs'
import { request } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { home, socketPath } from './paths.mjs'

export const shutdownEffect = 'Shutdown stops running and queued work across all projects on this runner. Unfinished turns will not resume automatically.'

export function call(path, data, socket = socketPath) {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: socket, path, agent: false, method: data ? 'POST' : 'GET' }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', part => { body += part })
      res.once('error', reject)
      res.once('end', () => {
        try {
          const value = JSON.parse(body)
          if (res.statusCode !== 200) throw new Error(value.error)
          resolve(value)
        } catch (err) { reject(err) }
      })
    })
    req.once('error', reject)
    req.end(data ? JSON.stringify(data) : undefined)
  })
}

async function handshake() {
  const runner = await call('/ready')
  if (runner.protocol !== 8) throw new Error('An incompatible cc-bro runner is active. ' + shutdownEffect +
    ' To let that work finish, wait before shutting down. To stop the runner and retry your command, first run:\ncc-bro shutdown')
  return runner
}

export async function shutdown() {
  try {
    const reply = await call('/shutdown', {})
    if (reply?.status !== 'offline') throw new Error('Runner did not confirm shutdown')
  } catch (err) {
    if (err.syscall !== 'connect' || !['ENOENT', 'ECONNREFUSED'].includes(err.code)) throw err
  }
  await platform.removeService()
}

export async function ready() {
  try { return await handshake() }
  catch (err) { if (!['ENOENT', 'ECONNREFUSED', 'ECONNRESET'].includes(err.code)) throw err }
  await platform.startService()
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    await sleep(70)
    try { return await handshake() }
    catch (err) { if (!['ENOENT', 'ECONNREFUSED', 'ECONNRESET'].includes(err.code)) throw err }
  }
  throw new Error('Runner did not become ready in ' + home)
}
