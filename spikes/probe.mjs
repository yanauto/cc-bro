import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { home } from '../lib/paths.mjs'
import { onLine, spawnPi } from '../lib/pi.mjs'
import { join } from 'node:path'

const probeRoot = join(home, 'spikes')
mkdirSync(probeRoot, { recursive: true })
export const dir = mkdtempSync(join(probeRoot, 'cc-bro-p0-'))
export const sessions = join(dir, 'sessions')
mkdirSync(sessions)
process.env.PI_CODING_AGENT_DIR = join(dir, 'agent')
process.env.PI_CODING_AGENT_SESSION_DIR = sessions
export const model = process.env.PI_MODEL || 'deepseek/deepseek-flash'
export const pi = ['--no-context-files', '--no-skills', '--no-extensions', '--no-mcp', '--no-approve', '--session-dir', sessions, '--session-id', 'p0-chat', '--model', model]
export const agy = ['--model', process.env.AGY_MODEL || 'gemini-3.8-flash-low', '--effort', 'low', '--output-format', 'stream-json', '--log-file', join(dir, 'agy.log')]
console.log('workspace', dir)

export async function run(bin, args, { start, event, interrupted = false } = {}) {
  const { child, redact } = bin === 'agy'
    ? { child: spawn('agy', args, { cwd: dir, stdio: ['pipe', 'pipe', 'inherit'] }), redact: line => line }
    : await spawnPi(args[args.lastIndexOf('--model') + 1], dir, join(dir, 'worker'), args)
  const events = []
  const send = obj => child.stdin.write(JSON.stringify(obj) + '\n')
  const timer = setTimeout(() => child.kill('SIGKILL'), 150000)
  child.stdin.on('error', err => { if (err.code !== 'EPIPE') throw err })
  onLine(child.stdout, line => {
    const item = JSON.parse(redact(line))
    events.push(item)
    event?.(item, child, send)
    if (bin === 'pi' && item.type === 'agent_settled') child.stdin.end()
  })
  if (start) start(send, child)
  else child.stdin.end()
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      console.log('exit', code, signal)
      const cancelled = interrupted && (signal === 'SIGTERM' || (code === 1 && events.at(-1)?.result?.error === 'interrupted'))
      if (code !== 0 && !cancelled) reject(new Error('unexpected exit'))
      else resolve(events)
    })
  })
}

export const json = (prompt, chosen = model) => run('pi', [...pi, '--model', chosen, '--mode', 'json', '-p', prompt])
export const rpc = (message, event) => run('pi', [...pi, '--mode', 'rpc'], { start: send => send({ type: 'prompt', message }), event })
export const ask = (message, extra = [], options) => run('agy', [...agy, ...extra, '-p', message], options)
export const assistant = events => events.filter(e => e.type === 'message_end' && e.message.role === 'assistant').at(-1)?.message
export const reply = message => message?.content.filter(c => c.type === 'text').map(c => c.text).join('')
export function fixture() {
  writeFileSync(join(dir, 'sample.txt'), 'red\n')
}
export const task = 'Use your tools in this working directory only. Read sample.txt, edit red to blue, write copy.txt containing blue, then run cat copy.txt and finally try to read missing.txt with the read tool. Report briefly.'
