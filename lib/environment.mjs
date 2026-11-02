import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { home, isolated, repo, toolsPath } from './paths.mjs'
import { availableModels, loginEnvironment } from './pi.mjs'
import { platform } from './platform/index.mjs'
import { PiService } from './pi-service.mjs'

const exec = promisify(execFile)
const piPackage = '@earendil-works/pi-coding-agent'

function binary(name) {
  for (const dir of toolsPath.split(delimiter).filter(Boolean)) {
    const path = join(dir, name)
    try {
      accessSync(path, constants.X_OK)
      if (statSync(path).isFile()) return path
    } catch {}
  }
  return null
}

async function version(argv, env) {
  try {
    const [file, ...args] = argv
    const { stdout } = await exec(file, args, { cwd: home, env, timeout: 6000 })
    return stdout.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?/)?.[0] ?? null
  } catch { return null }
}

function compatiblePi(v) {
  if (!v) return false
  const [major, minor] = v.split('.').map(Number)
  return major > 1 || (major === 1 && minor >= 4)
}

export class Environment {
  constructor(publish, desktop = platform) {
    this.publish = publish
    this.desktop = desktop
    this.jobs = new Map()
    this.pi = new PiService(publish,this.jobs,() => this.login())
  }

  refresh() {
    this.check ??= this.detect().then(env => {
      const signature = JSON.stringify(env)
      if (signature !== this.previous) this.publish({ type: 'env', env })
      this.previous = signature
      return env
    }).finally(() => { this.check = null })
    return this.check
  }

  async detect() {
    const piPath = binary('pi')
    const claudePath = binary('claude')
    const env = { ...process.env, ...loginEnvironment() }
    const [piVersion, claudeVersion] = await Promise.all([
      piPath && version(platform.piCommand(['--version'], isolated ? 'isolated' : null), env),
      claudePath && version([claudePath, '--version'], env)
    ])
    const pi = { installed: !!piPath, ok: compatiblePi(piVersion), version: piVersion, required: '>=1.4.0', path: piPath }
    const node = { ok: Number(process.versions.node.split('.')[0]) >= 24, version: process.versions.node, required: '>=24' }
    const claude = { installed: !!claudePath, version: claudeVersion, path: claudePath }
    const models = pi.ok ? await availableModels() : []
    return { platform: process.platform, node, pi, claude, models, ready: node.ok && pi.ok && !!claudeVersion && models.some(m => m.ready) }
  }

  install() {
    if (this.installing) return this.installing
    const job = { id: randomUUID(), kind: 'install-pi', state: 'running', log: [] }
    this.jobs.set(job.id, job)
    this.installing = job
    this.publish({ type: 'job', job })
    this.installation = this.runInstall(job).catch(err => {
      job.state = 'failed'
      job.log.push(err.message)
    }).finally(() => {
      this.installing = null
      this.publish({ type: 'job', job })
    })
    return job
  }

  async runInstall(job) {
    const npm = binary('npm')
    if (!npm) throw new Error('npm is missing from PATH. Install Node.js with npm.')
    const args = ['install', '--global']
    const env = { ...process.env, PATH: toolsPath }
    if (isolated) {
      Object.assign(env, loginEnvironment(), { npm_config_cache: join(home, 'npm-cache') })
      args.push('--prefix', join(home, 'tools'))
    }
    args.push(piPackage + '@latest')
    const child = spawn(npm, args, { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] })
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', line => {
        job.log.push(line.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[redacted]@'))
        this.publish({ type: 'job', job })
      })
    }
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error('npm exited with ' + (signal || code))))
    })
    if (this.check) await this.check.catch(() => {})
    const current = await this.refresh()
    if (!current.pi.ok) throw new Error('npm finished but a compatible pi is not on PATH')
    job.state = 'done'
  }

  login() {
    if (!binary('pi')) throw new Error('Install pi before logging in')
    return this.desktop.openTerminal(home, platform.piCommand(['--session-dir', join(home, 'sessions', 'login')], isolated ? 'isolated' : null), loginEnvironment())
  }

  async supportsDesktop() {
    const claude = binary('claude')
    if (!claude || !this.desktop.hasDesktop) return false
    try {
      const [installed, { stdout }] = await Promise.all([this.desktop.hasDesktop(), exec(claude,['--help'],{ timeout:6000 })])
      return installed && /^\s*--desktop(?:\s|$)/m.test(stdout)
    } catch { return false }
  }

  async openRoom(project, client = 'terminal') {
    const claude = binary('claude')
    if (client === 'desktop') {
      if (await this.supportsDesktop()) {
        try { await this.desktop.openDesktop(claude,project.roomPath); return { ok:true } }
        catch {}
      }
      return { ok:false, code:'desktop-unsupported', roomPath:project.roomPath }
    }
    if (client !== 'terminal') throw new Error('Unknown Claude client')
    if (!claude) throw new Error('Claude Code is missing from PATH')
    await this.desktop.openTerminal(project.roomPath, [claude], {
      PATH: [join(repo, 'bin'), toolsPath].join(delimiter), CC_BRO_HOME: home
    })
    return { ok:true }
  }
}
