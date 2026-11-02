import { randomUUID } from 'node:crypto'
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mask,secretsFrom } from './pi-secrets.mjs'

export const files = ['settings.json','models.json','auth.json']
export const thinkingLevels = ['off','minimal','low','medium','high','xhigh','max']
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_.-]*$/.test(id) && !Object.hasOwn(Object.prototype,id)
const safeText = value => typeof value === 'string' && value.trim() && !/[\x00-\x1f\x7f]/.test(value)
const problem = (message,code = 'pi-config-error') => Object.assign(new Error(message),{code})
const noKey = 'cc-bro-no-key-required'
export const modelKey = m => m.provider + '/' + m.id
export const beijingTime = () => new Date(Date.now() + 8 * 3600000).toISOString().replace('Z','+08:00')

export function sdkRoot(path) {
  for (const part of path.split(delimiter)) {
    const exe = join(part,'pi')
    try { accessSync(exe,constants.X_OK); if (!statSync(exe).isFile()) continue } catch { continue }
    let dir = dirname(realpathSync(exe))
    while (dirname(dir) !== dir) {
      try { if (JSON.parse(readFileSync(join(dir,'package.json'),'utf8')).name === '@earendil-works/pi-coding-agent') return dir } catch {}
      dir = dirname(dir)
    }
    break
  }
  return null
}

export async function loadSdk(root) {
  if (!root) return null
  try {
    const require = createRequire(join(root,'package.json'))
    const module = name => import(pathToFileURL(join(root,'dist/core',name + '.js')))
    const [{ ModelRuntime },{ AuthStorage },resolver] = await Promise.all([module('model-runtime'),module('auth-storage'),module('model-resolver')])
    if (!ModelRuntime?.create || !AuthStorage?.inMemory) return null
    const catalog = await ModelRuntime.create({credentials:AuthStorage.inMemory(),modelsPath:null,refreshOnCreate:false})
    const ai = findPackageJSON('@earendil-works/pi-ai',pathToFileURL(join(root,'dist/index.js')))
    const entry = JSON.parse(readFileSync(ai,'utf8')).exports['./compat'].import
    const { getApiProvider } = await import(pathToFileURL(join(dirname(ai),entry)))
    return { ModelRuntime, AuthStorage, resolver, getApiProvider, lock:require('proper-lockfile'),builtins:new Set(catalog.getProviders().map(p => p.id)) }
  } catch { return null }
}

function readDocument(dir,name) {
  const path = join(dir,name)
  const present = existsSync(path)
  try {
    const data = present ? JSON.parse(readFileSync(path,'utf8')) : {}
    if (!record(data)) throw new Error()
    if (name === 'auth.json' && Object.values(data).some(c => !record(c) || !['api_key','oauth'].includes(c.type))) throw new Error()
    if (name === 'models.json' && Object.hasOwn(data,'providers') && !record(data.providers)) throw new Error()
    return { info:{name,path,exists:present,error:null}, data }
  } catch {
    return { info:{name,path,exists:present,error:'Invalid or unreadable ' + name}, data:{} }
  }
}

function credential(raw, spec, status) {
  if (raw?.type === 'oauth') return { kind:'oauth',hint:'Signed in' }
  const key = raw?.key ?? spec?.apiKey
  if (!raw?.key && key === noKey && spec.authHeader === false) return {kind:'api_key',hint:'none'}
  if (typeof key === 'string') {
    if (key.startsWith('!')) return { kind:'command',hint:'!…' }
    const refs = [...key.matchAll(/\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g)].map(m => m[1] || m[2])
    if (refs.length) return { kind:'env',hint:refs.join(', ') }
    return { kind:'api_key',hint:(key.startsWith('sk-') && key.length > 9 ? 'sk-' : '') + '…' + (key.length > 7 ? key.slice(-4) : '') }
  }
  if (!status?.configured) return null
  const label = status.label ?? ''
  if (/^(AWS_PROFILE|AWS_WEB_IDENTITY_TOKEN_FILE|GOOGLE_APPLICATION_CREDENTIALS)$/.test(label)) return {kind:'ambient',hint:label}
  if (/^[A-Z][A-Z0-9_]+$/.test(label)) return {kind:'env',hint:label}
  return {kind:'ambient',hint:'Configured by the provider environment'}
}

function publicUrl(value) {
  try {
    const url = new URL(value)
    if (!['http:','https:'].includes(url.protocol)) return null
    return url.origin + url.pathname
  } catch { return null }
}

export class PiProfile {
  constructor(dir, home, sdk) { this.dir = dir; this.home = home; this.sdk = sdk }

  async runtime(auth,signal) {
    if (!this.sdk) throw problem('Installed pi does not expose the required SDK. Install or upgrade pi.','pi-sdk-unavailable')
    const { AuthStorage,ModelRuntime } = this.sdk
    const credentials = auth === undefined ? AuthStorage.create(join(this.dir,'auth.json')) : AuthStorage.inMemory(auth)
    return ModelRuntime.create({ credentials,modelsPath:join(this.dir,'models.json'),allowModelNetwork:false,signal })
  }

  async read() {
    const [settings,models,auth] = files.map(name => readDocument(this.dir,name))
    const s = settings.data
    const config = { agentDir:this.dir, files:[settings.info,models.info,auth.info],
      defaultModel:safeText(s.defaultProvider) && safeText(s.defaultModel) ? s.defaultProvider + '/' + s.defaultModel : null,
      defaultThinking:thinkingLevels.includes(s.defaultThinkingLevel) ? s.defaultThinkingLevel : null,
      enabledModels:Array.isArray(s.enabledModels) ? s.enabledModels.filter(x => typeof x === 'string') : null,
      providers:[], models:[], problems:[] }
    try {
      const runtime = await this.runtime(auth.data)
      if (runtime.getError()) models.info.error ||= 'pi could not load the model configuration. Check provider protocol, URL and model definitions.'
      const ready = new Set((await runtime.getAvailable()).map(modelKey))
      const all = runtime.getModels()
      config.models = all.map(m => ({ id:modelKey(m),provider:m.provider,name:m.name,ready:ready.has(modelKey(m)),reasoning:!!m.reasoning,contextWindow:m.contextWindow ?? null }))
      const custom = models.data.providers ?? {}
      const ids = new Set([...runtime.getProviders().map(p => p.id),...Object.keys(custom),...Object.keys(auth.data)])
      for (const id of [...ids].sort()) {
        const p = runtime.getProvider(id), spec = Object.hasOwn(custom,id) ? custom[id] : null
        const list = all.filter(m => m.provider === id)
        if (spec && !this.sdk.builtins.has(id) && list.some(m => !this.sdk.getApiProvider(m.api))) {
          models.info.error ||= 'models.json uses a protocol without an installed pi transport.'
        }
        const methods = []
        if (p?.auth?.apiKey || spec?.apiKey || auth.data[id]?.type === 'api_key') methods.push('api_key')
        if (p?.auth?.oauth || auth.data[id]?.type === 'oauth') methods.push('oauth')
        config.providers.push({ id,name:spec?.name ?? p?.name ?? id,source:spec && !this.sdk.builtins.has(id) ? 'custom' : 'builtin',methods,
          credential:credential(auth.data[id],spec,runtime.getProviderAuthStatus(id)),baseUrl:publicUrl(spec?.baseUrl ?? p?.baseUrl ?? list[0]?.baseUrl),
          api:spec?.api ?? list[0]?.api ?? null,modelCount:list.length })
      }
    } catch {
      config.problems.push(this.sdk ? 'pi could not read its model registry.' : 'Install a compatible pi SDK to manage providers.')
    }
    config.problems.push(...config.files.flatMap(f => f.error ? [f.error] : []))
    const secrets = secretsFrom([auth.data,models.data],process.env)
    if (!secrets.length) return config
    return JSON.parse(JSON.stringify(config,(_,v) => typeof v === 'string' ? mask(v,secrets) : v))
  }

  async edit(name,change,verify,signal) {
    if (!this.sdk) throw problem('Install a compatible pi SDK.','pi-sdk-unavailable')
    const path = join(this.dir,name)
    mkdirSync(this.dir,{recursive:true,mode:0o700})
    const release = await this.sdk.lock.lock(path,{realpath:false,stale:30000,retries:{retries:55,minTimeout:40,maxTimeout:700}})
    try {
      signal?.throwIfAborted()
      const stat = lstatSync(path,{throwIfNoEntry:false})
      if (stat && !stat.isFile()) throw problem('Expected a regular pi configuration file.')
      const original = stat ? readFileSync(path) : undefined
      const document = readDocument(this.dir,name)
      if (document.info.error) throw problem(document.info.error)
      const next = change(document.data)
      const bytes = Buffer.from(JSON.stringify(next,null,2) + '\n')
      const stamp = beijingTime().replace('+08:00','+0800').replace(/[:.]/g,'-')
      const backup = join(this.home,'backups/pi',stamp + '-' + randomUUID())
      mkdirSync(backup,{recursive:true,mode:0o700})
      if (original) writeFileSync(join(backup,name),original,{flag:'wx',mode:0o600})
      const replace = data => {
        const temp = path + '.' + randomUUID()
        try { writeFileSync(temp,data,{flag:'wx',mode:0o600}); renameSync(temp,path) }
        finally { rmSync(temp,{force:true}) }
      }
      replace(bytes)
      try {
        const config = await this.read()
        signal?.throwIfAborted()
        const invalid = config.files.find(f => f.name === name).error
        if (invalid || !await verify(config)) throw problem((invalid ?? 'pi did not recognize this change.') + ' The previous configuration was restored.')
        return config
      } catch (error) {
        if (!readFileSync(path).equals(bytes)) throw problem('Another process changed the file. The original is available in the pi backup directory.')
        if (original) replace(original)
        else rmSync(path)
        throw error
      }
    } finally { await release() }
  }

  async write(action,id,value,signal) {
    if (!validId(id)) throw problem('Invalid provider ID.')
    if (!this.sdk) throw problem('Install a compatible pi SDK.','pi-sdk-unavailable')
    const config = await this.read()
    const provider = config.providers.find(p => p.id === id)
    const ready = c => c.providers.some(p => p.id === id && p.credential) && c.models.some(m => m.provider === id && m.ready)
    if (action === 'key' || action === 'oauth') {
      if (!provider || (action === 'key' && !this.sdk?.builtins.has(id)) || !provider.methods.includes(action === 'key' ? 'api_key' : 'oauth')) throw problem('This provider does not support the requested login method.')
      if (action === 'key' && !safeText(value)) throw problem('Enter a nonempty API key.')
      const updated = await this.edit('auth.json',doc => {
        const previous = doc[id]?.type === 'api_key' ? doc[id] : {}
        return {...doc,[id]:action === 'key' ? {...previous,type:'api_key',key:value} : value}
      },ready,signal)
      return updated.providers.find(p => p.id === id)
    }
    if (action === 'credential') {
      await this.edit('auth.json',doc => { delete doc[id]; return doc },() => !Object.hasOwn(readDocument(this.dir,'auth.json').data,id))
    } else if (action === 'remove') {
      if (provider?.source !== 'custom') throw problem('Only a custom provider can be removed.')
      await this.edit('models.json',doc => { delete doc.providers[id]; return doc },c => !c.providers.some(p => p.id === id && p.source === 'custom'))
    } else if (action === 'provider') {
      if (this.sdk?.builtins.has(id)) throw problem('A built-in pi provider already uses this ID.','provider-exists')
      if (!record(value) || !publicUrl(value.baseUrl) || !safeText(value.api) || ('key' in value && !safeText(value.key)) || !Array.isArray(value.models) || !value.models.length) throw problem('Provide an HTTP URL, protocol and at least one model. A supplied key must be nonempty.')
      const models = value.models.map(m => {
        if (!record(m) || !safeText(m.id) || (m.name !== undefined && !safeText(m.name)) || (m.reasoning !== undefined && typeof m.reasoning !== 'boolean') ||
            (m.contextWindow !== undefined && (!Number.isSafeInteger(m.contextWindow) || m.contextWindow < 1))) throw problem('Invalid model definition.')
        return {id:m.id,name:m.name ?? m.id,reasoning:m.reasoning ?? false,...(m.contextWindow ? {contextWindow:m.contextWindow} : {})}
      })
      if (new Set(models.map(m => m.id)).size !== models.length || (value.name !== undefined && !safeText(value.name))) throw problem('Invalid provider name or duplicate model ID.')
      const updated = await this.edit('models.json',doc => {
        const old = doc.providers?.[id]
        const key = value.key ?? (old ? old.apiKey : noKey)
        const spec = {baseUrl:value.baseUrl,api:value.api,models,...(value.name ? {name:value.name} : {})}
        if (key !== undefined) spec.apiKey = key
        if (key === noKey) spec.authHeader = false
        return {...doc,providers:{...doc.providers,[id]:spec}}
      },c => models.every(m => c.models.some(x => x.id === id + '/' + m.id && x.ready)))
      return updated.providers.find(p => p.id === id)
    } else throw problem('Unknown provider operation.')
    return {ok:true}
  }
}
