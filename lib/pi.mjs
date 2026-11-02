import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { home, isolated, toolsPath } from './paths.mjs'

import { platform } from './platform/index.mjs'
import { sdkRoot } from './pi-profile.mjs'
import { mask,secretsFrom } from './pi-secrets.mjs'
import { modelEnvironment } from './model-env.mjs'

const exec = promisify(execFile)
export function providerOf(model) {
  const match = /^([a-z0-9][a-z0-9_.-]*)\/([^\s\x00-\x1f\x7f]+)$/.exec(model)
  if (!match) throw new Error('Expected an exact --model provider/model-id')
  return match[1]
}


function writeConfig(path, data) {
  const tmp = path + '.' + randomUUID()
  writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
  renameSync(tmp, path)
}

async function credentialCommand(access, args, env) {
  try {
    const [file, ...argv] = platform.piCommand(['auth', ...args], access)
    const { stdout } = await exec(file, argv, {
      cwd: home, env, encoding: 'utf8', timeout: 20000
    })
    return stdout.trim()
  } catch {
    throw new Error('pi auth could not resolve an API key for ' + args[args.indexOf('--provider') + 1])
  }
}

export function loginEnvironment() {
  const env = { PATH: toolsPath, PI_CODING_AGENT_SESSION_DIR: join(home, 'sessions') }
  if (isolated) {
    Object.assign(env, { HOME: join(home, 'home'), TMPDIR: join(home, 'tmp'), PI_CODING_AGENT_DIR: join(home, 'login'), PI_TELEMETRY: '0' })
    for (const dir of [env.HOME, env.TMPDIR, env.PI_CODING_AGENT_DIR]) mkdirSync(dir, { recursive: true })
  } else if (process.env.PI_CODING_AGENT_DIR) env.PI_CODING_AGENT_DIR = process.env.PI_CODING_AGENT_DIR
  mkdirSync(env.PI_CODING_AGENT_SESSION_DIR, { recursive: true })
  return env
}

async function workerEnvironment(provider, marker) {
  const login = loginEnvironment()
  const configured = login.PI_CODING_AGENT_DIR && ['auth.json','models.json'].some(name => existsSync(join(login.PI_CODING_AGENT_DIR,name)))
  if (!isolated || sdkRoot(toolsPath) || configured) {
    const prelude = join(home, 'bash-env')
    const original = process.env.BASH_ENV || ''
    const env = modelEnvironment()
    const credentialNames = Object.keys(env).filter(k => /^[A-Za-z_][A-Za-z0-9_]*(?:API_KEY|TOKEN|ACCESS_KEY|SECRET)$/.test(k))
    const unset = isolated && credentialNames.length ? 'unset ' + credentialNames.join(' ') + '\n' : ''
    writeFileSync(prelude, 'if [ -n "$CC_BRO_BASH_ENV" ]; then . "$CC_BRO_BASH_ENV"; fi\n' + unset + 'exec 19<"$CC_BRO_MARKER"\n')
    return { ...env, ...login, CC_BRO_MARKER: marker, BASH_ENV: prelude, CC_BRO_BASH_ENV: original }
  }
  if (['openai-codex','github-copilot','google-antigravity','google-gemini-cli'].includes(provider)) throw new Error('Sign in to this provider in the sandbox pi profile.')
  const env = { ...login, PI_OFFLINE: '1', PI_CODING_AGENT_DIR: join(home, 'agents', provider) }
  for (const name of ['LANG', 'LC_ALL', 'TZ', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS']) {
    if (process.env[name]) env[name] = process.env[name]
  }
  mkdirSync(env.PI_CODING_AGENT_DIR, { recursive: true })
  writeConfig(join(env.PI_CODING_AGENT_DIR, 'auth.json'), { [provider]: { type: 'api_key', key: '$CC_BRO_API_KEY' } })
  writeConfig(join(env.PI_CODING_AGENT_DIR, 'settings.json'), { shellCommandPrefix: 'unset CC_BRO_API_KEY; exec 19<"$CC_BRO_MARKER"' })

  const check = ['check', '--no-refresh', '--json', '--provider', provider]
  const lookup = { ...modelEnvironment(), ...login, PI_OFFLINE: '1' }
  const status = await credentialCommand('isolated', check, lookup).then(JSON.parse).catch(() => null)
  if (status?.authType !== 'api_key') throw new Error('No API-key credential for ' + provider)
  const result = JSON.parse(await credentialCommand('isolated', [...check, '--credentials'], lookup))
  if (result.authType !== 'api_key' || !result.credentials) throw new Error('API-key lookup failed for ' + provider)
  env.CC_BRO_API_KEY = result.credentials
  env.CC_BRO_API_KEY = await credentialCommand('isolated', ['print-api-key', '--provider', provider], env)
  if (!env.CC_BRO_API_KEY || /[\r\n]/.test(env.CC_BRO_API_KEY)) throw new Error('Invalid API-key export for ' + provider)
  env.CC_BRO_MARKER = marker
  return env
}

export async function spawnPi(model, cwd, marker, args) {
  const env = await workerEnvironment(providerOf(model), marker)
  const sessionFlag = args.lastIndexOf('--session-dir')
  if (sessionFlag !== -1) {
    env.PI_CODING_AGENT_SESSION_DIR = args[sessionFlag + 1]
    mkdirSync(env.PI_CODING_AGENT_SESSION_DIR, { recursive: true })
  }
  mkdirSync(dirname(marker), { recursive: true })
  const fd = openSync(marker, 'a+', 0o600)
  try {
    const [file, ...argv] = platform.piCommand(args, isolated ? 'isolated' : null)
    const child = spawn(file, argv, {
      cwd, env, detached: true, stdio: ['pipe', 'pipe', 'ignore', fd]
    })
    return { child, redact: workerRedactor(env) }
  } finally { closeSync(fd) }
}

function workerRedactor(env) {
  const dir = env.PI_CODING_AGENT_DIR ?? join(homedir(),'.pi','agent')
  const paths = ['auth.json','models.json'].map(n => join(dir,n))
  let known = []
  let last
  return line => {
    const stamp = paths.map(p => {const s=statSync(p,{bigint:true,throwIfNoEntry:false}); return s && String(s.ctimeNs)}).join('/')
    if (stamp !== last) {
      last = stamp
      const records = []
      for (const path of paths) { try { records.push(JSON.parse(readFileSync(path,'utf8'))) } catch {} }
      const current = secretsFrom(records,env).map(v => JSON.stringify(v).slice(1,-1))
      known = [...new Set([...known,...current])]
    }
    return mask(line,known)
  }
}

export function onLine(stream, consume) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', chunk => {
    buffer += chunk
    let lf
    while ((lf = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, lf)
      buffer = buffer.slice(lf + 1)
      if (line.trim()) consume(line)
    }
  })
}

export class Pi {
  static async launch(c, onRecord, onExit, sessions, marker) {
    const provider = providerOf(c.model)
    const args = ['--mode', 'rpc', '--provider', provider, '--model', c.model.slice(provider.length + 1),
      '--session-dir', sessions, '--session-id', c.id, '--no-approve']
    if (c.thinking) args.push('--thinking',c.thinking)
    if (isolated) args.push('--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-themes', '--tools', 'read,bash,edit,write')
    const { child, redact } = await spawnPi(c.model, c.cwd, marker, args)
    return new Pi(child, redact, onRecord, onExit)
  }

  constructor(child, redact, onRecord, onExit) {
    this.child = child
    this.pending = new Map()
    this.turn = 0
    this.expectedExit = false
    this.closed = new Promise(resolve => {
      let problem
      const fail = err => {
        problem = err
        child.kill('SIGKILL')
      }
      child.on('error', () => fail(new Error('Could not launch sandboxed pi')))
      child.stdin.on('error', () => fail(new Error('Lost pi RPC stdin')))
      onLine(child.stdout, line => {
        if (problem) return
        try {
          const record = JSON.parse(redact(line), (key, value) =>
            /^(authorization|x-api-key|apiKey|access_token|refresh_token)$/i.test(key) ? '[redacted]' : value)
          if (typeof record.type !== 'string') throw new Error()
          onRecord(this, record)
          const ack = record.type === 'response' && this.pending.get(record.id)
          if (ack) {
            this.pending.delete(record.id)
            if (record.success) ack.resolve(record.data)
            else ack.reject(new Error(record.error || 'pi rejected ' + record.command))
          }
        } catch { fail(new Error('Could not read or persist pi RPC record')) }
      })
      child.once('close', (code, signal) => {
        const err = problem || new Error('pi exited (' + (signal || code) + ')')
        this.exited = true
        for (const ack of this.pending.values()) ack.reject(err)
        this.pending.clear()
        onExit(this, err)
        resolve()
      })
    })
  }

  command(type, args = {}, timeout = 25000) {
    if (this.exited) return Promise.reject(new Error('pi is offline'))
    const id = randomUUID()
    let timer
    const response = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      timer = setTimeout(() => {
        this.pending.delete(id)
        this.child.kill('SIGKILL')
        reject(new Error('Timed out waiting for pi ' + type))
      }, timeout)
      this.child.stdin.write(JSON.stringify({ id, type, ...args }) + '\n')
    })
    return response.finally(() => clearTimeout(timer))
  }
}

async function listModels(env) {
  const args = ['--list-models', '--no-approve', '--no-context-files', '--no-mcp', '--no-skills']
  if (isolated) args.push('--no-extensions')
  const [file, ...argv] = platform.piCommand(args, isolated ? 'isolated' : null)
  const { stdout } = await exec(file, argv, { cwd: home, env: { ...env, PI_OFFLINE: '1', NO_COLOR: '1' }, timeout: 20000 })
  const lines = stdout.split(/\r?\n/)
  const header = lines.findIndex(line => /^provider\s+model\s+context\b/.test(line.trim()))
  if (header < 0) return []
  return lines.slice(header + 1).filter(line => line.trim()).map(line => {
    const [provider, id] = line.trim().split(/\s+/)
    return { id, provider, ready: true }
  })
}

export async function availableModels() {
  const login = { ...modelEnvironment(), ...loginEnvironment() }
  const models = await listModels(login)
  if (!isolated || sdkRoot(toolsPath)) return models
  const providers = [...new Set(models.map(m => m.provider))]
  for (const provider of providers) {
    const args = ['check', '--no-refresh', '--json', '--provider', provider]
    const status = await credentialCommand('isolated', args, login).then(JSON.parse).catch(() => null)
    for (const m of models.filter(m => m.provider === provider)) m.ready = status?.authType === 'api_key'
  }
  if (!providers.includes('deepseek')) {
    try {
      const env = await workerEnvironment('deepseek', '')
      models.push(...(await listModels(env)).filter(m => m.provider === 'deepseek'))
    } catch {}
  }
  return models
}

export async function defaultModel() {
  if (sdkRoot(toolsPath)) {
    const {bridge} = await import('./pi-service.mjs')
    const selected = await bridge('default').result
    if (!selected) throw new Error('Set up a pi provider before starting a worker.')
    return selected
  }
  if (isolated) return 'deepseek/deepseek-flash'
  const models = await availableModels()
  const m = models.find(m => m.provider === 'deepseek' && m.id === 'deepseek-flash') ?? models[0]
  if (!m) throw new Error('Log in to a pi provider and recheck the environment')
  return m.provider + '/' + m.id
}
