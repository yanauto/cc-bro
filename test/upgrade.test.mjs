import assert from 'node:assert/strict'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import test from 'node:test'
import { call } from '../lib/client.mjs'
import { socketFor } from '../lib/paths.mjs'
import { harness } from './harness.mjs'

for (const [release, protocol] of [['0.1.0', 4], ['M2', 6], ['0.2.0', 7]]) {
  test('upgrade from ' + release + ': guard normal commands, allow graceful shutdown, then start the new runner', async t => {
    const h = harness(t)
    const socket = socketFor(h.data)
    const requests = []
    let canStop = false
    const server = createServer(async (req, res) => {
      requests.push([req.method, req.url])
      if (req.url === '/ready') return res.end(JSON.stringify({ protocol, pid: process.pid }))
      if (req.url === '/shutdown' && canStop) {
        server.close()
        return res.end(JSON.stringify({ status: 'offline' }))
      }
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Worker cleanup failed' }))
    })
    server.listen(socket)
    await once(server, 'listening')
    try {
      for (const args of [['init', '--allow', 'codex'], ['say', 'job', 'text'], ['ls']]) {
        await assert.rejects(h.cli(...args), err => {
          assert.match(err.stderr, /running and queued work/)
          assert.match(err.stderr.trim(), /\ncc-bro shutdown$/)
          return true
        })
      }
      assert.deepEqual(requests, Array(3).fill(['GET', '/ready']))
      await assert.rejects(h.cli('shutdown'), /Worker cleanup failed/)
      canStop = true
      assert.equal(await h.cli('shutdown'), 'Runner stopped')
      assert.deepEqual(requests.slice(3), Array(2).fill(['POST', '/shutdown']))
      await h.cli('shutdown')
      assert.equal(existsSync(join(h.data, 'runner.plist')), false)
      await h.cli('init', '--allow', 'codex')
      assert.equal((await call('/ready', undefined, socket)).protocol, 8)
      assert.deepEqual(await h.json('ls'), [])
    } finally {
      if (server.listening) await new Promise(resolve => server.close(resolve))
    }
  })
}
