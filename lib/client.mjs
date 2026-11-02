import { platform } from './platform/index.mjs'
import { request } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { home, socketPath } from './paths.mjs'
import { modelVariables } from './model-env.mjs'

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

async function handshake(legacyAllowed) {
  const runner = await call('/ready')
  if (!legacyAllowed && runner.protocol !== 4) throw new Error('An older cc-bro runner is active. Finish its work, run cc-bro shutdown, then retry.')
  if (runner.protocol === 4) await call('/model-env',{env:modelVariables(process.env)})
  return runner
}

export async function ready(legacyAllowed = false) {
  try { return await handshake(legacyAllowed) }
  catch (err) { if (!['ENOENT', 'ECONNREFUSED', 'ECONNRESET'].includes(err.code)) throw err }
  await platform.startService()
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    await sleep(70)
    try { return await handshake(legacyAllowed) }
    catch (err) { if (!['ENOENT', 'ECONNREFUSED', 'ECONNRESET'].includes(err.code)) throw err }
  }
  throw new Error('Runner did not become ready in ' + home)
}
