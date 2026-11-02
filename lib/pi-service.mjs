import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { home,isolated,toolsPath } from './paths.mjs'
import { loginEnvironment } from './pi.mjs'
import { modelEnvironment } from './model-env.mjs'
import { platform } from './platform/index.mjs'
import { files,sdkRoot } from './pi-profile.mjs'

function profileDir() { return loginEnvironment().PI_CODING_AGENT_DIR ?? join(homedir(),'.pi','agent') }

export function bridge(op,data = {},onEvent = () => {},signal) {
  const dir = profileDir(), root = sdkRoot(toolsPath)
  const args = [process.execPath,fileURLToPath(new URL('./pi-helper.mjs',import.meta.url))]
  const [exe,...argv] = isolated ? platform.protectedCommand(args,'isolated') : args
  const child = spawn(exe,argv,{cwd:home,env:{...modelEnvironment(),...loginEnvironment(),PI_OFFLINE:'1'},stdio:['ignore','ignore','ignore','ipc']})
  const result = new Promise((resolve,reject) => {
    const abort = () => { if (child.connected) child.send({type:'cancel'}); kill = setTimeout(() => child.kill('SIGKILL'),2000); kill.unref() }
    let kill
    const timeout = op === 'login' || op === 'check' ? null : setTimeout(() => child.kill('SIGKILL'),45000)
    signal?.addEventListener('abort',abort,{once:true})
    child.on('message',({type,value}) => {
      if (type === 'event') onEvent(value)
      if (type === 'done') resolve(value)
      if (type === 'error') reject(Object.assign(new Error(value.message),{code:value.code}))
    })
    child.once('error',() => reject(new Error('Could not start the installed pi integration.')))
    child.once('close',() => {
      signal?.removeEventListener('abort',abort)
      clearTimeout(timeout); clearTimeout(kill)
      reject(new Error(signal?.aborted ? 'Cancelled.' : 'The pi integration stopped before it finished.'))
    })
    child.send({type:'start',value:{root,dir,home,op,data}})
    if (signal?.aborted) abort()
  })
  return { result,input:value => { if (child.connected) child.send({type:'input',value}) } }
}

export class PiService {
  constructor(publish,jobs,terminal,request = bridge) {
    this.publish = publish
    this.jobs = jobs
    this.terminal = terminal
    this.request = request
    this.active = new Map()
  }

  fingerprint() {
    return files.concat('models-store.json').map(name => {
      try {
        const s = statSync(join(profileDir(),name),{bigint:true,throwIfNoEntry:false})
        return s ? [s.ino,s.size,s.mtimeNs,s.ctimeNs].join('/') : '-'
      } catch (err) { return err.code }
    }).join(':')
  }

  watch() {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.fingerprint() !== this.stamp) this.read().catch(() => {})
    },1500)
    this.timer.unref()
  }

  async read(force = false) {
    if (!this.reading) {
      const stamp = this.fingerprint()
      this.reading = this.request('read').result.then(config => {
        const changedFile = this.stamp !== stamp
        this.stamp = stamp
        const signature = JSON.stringify(config)
        if (force || changedFile || signature !== this.previous) {
          this.previous = signature
          this.publish({type:'pi',pi:config})
        }
        return config
      }).finally(() => {this.reading = null})
    }
    return this.reading
  }

  async changed() {
    if (this.reading) await this.reading.catch(() => {})
    return this.read(true)
  }

  async write(action,id,value) {
    const result = await this.request('write',{action,id,value}).result
    await this.changed()
    return result
  }

  emit(job) { this.publish({type:'job',job}) }

  start(kind,data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a job request.')
    for (const id of this.active.keys()) {
      const other = this.jobs.get(id)
      if (other.kind === kind && (kind === 'check' || other.provider === data.id) && ['running','waiting'].includes(other.state)) {
        throw Object.assign(new Error('This job is already running.'),{code:'job-busy',status:409})
      }
    }
    if (kind === 'check' && data.models !== undefined && (!Array.isArray(data.models) || data.models.some(x => typeof x !== 'string' || !x.includes('/')))) throw new Error('Expected a list of provider/model identifiers.')
    if (kind === 'check' && data.models) data = {models:[...new Set(data.models)]}
    const job = {id:randomUUID(),kind,state:'running',log:[],...(kind === 'login' ? {provider:data.id} : {results:[]})}
    const controller = new AbortController()
    const handle = this.request(kind,data,event => {
      if (controller.signal.aborted) return
      if (event.auth) job.auth = event.auth
      if (Object.hasOwn(event,'prompt')) {
        if (event.prompt) job.prompt = event.prompt
        else delete job.prompt
        job.state = event.prompt ? 'waiting' : 'running'
      }
      if (event.result) job.results.push(event.result)
      this.emit(job)
    },controller.signal)
    this.jobs.set(job.id,job)
    this.active.set(job.id,{controller,handle})
    this.emit(job)
    const timeout = kind === 'login' ? setTimeout(() => this.cancel(job.id,true),10*60000) : null
    const settled = handle.result.then(async () => {
      if (controller.signal.aborted) return
      if (kind === 'login') await this.changed()
      if (!controller.signal.aborted) job.state = 'done'
    }).catch(async err => {
      if (controller.signal.aborted) return
      job.state = 'failed'
      job.log.push(err.message)
      if (kind === 'login' && err.code === 'pi-sdk-unavailable') {
        try { await this.terminal(); job.log.push('Complete login in the Terminal window.') }
        catch { job.log.push('Open pi in a terminal and run /login.') }
      }
    }).finally(() => {
      clearTimeout(timeout)
      delete job.prompt
      delete job.auth
      this.active.delete(job.id)
      this.emit(job)
    })
    this.active.get(job.id).settled = settled
    return job
  }

  input(id,value) {
    const job = this.jobs.get(id)
    if (job?.state !== 'waiting' || typeof value !== 'string' || !value.trim() || (job.prompt.options && !job.prompt.options.some(o => o.id === value))) throw new Error('Answer the current login prompt.')
    this.active.get(id).handle.input(value)
    delete job.prompt
    job.state = 'running'
    this.emit(job)
    return job
  }

  cancel(id,timedOut = false) {
    const job = this.jobs.get(id)
    if (!job || !['login','check'].includes(job.kind)) throw new Error('This job cannot be cancelled.')
    const active = this.active.get(id)
    if (active && ['waiting','running'].includes(job.state)) {
      job.state = timedOut ? 'failed' : 'cancelled'
      if (timedOut) job.log.push('Login timed out. Start a new login and complete it within ten minutes.')
      delete job.prompt; delete job.auth
      active.controller.abort()
      this.emit(job)
    }
    return job
  }

  async close() {
    clearInterval(this.timer)
    for (const id of this.active.keys()) this.cancel(id)
    await Promise.allSettled([...this.active.values()].map(job => job.settled))
  }
}
