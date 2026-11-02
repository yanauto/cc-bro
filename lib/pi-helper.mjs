import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PiProfile,beijingTime,loadSdk,modelKey } from './pi-profile.mjs'

const controller = new AbortController()
const signal = controller.signal
let reply
const send = (type,value) => { if (process.connected) process.send({type,value}) }
const event = value => send('event',value)
const finish = (type,value) => new Promise(resolve => process.send({type,value},resolve))
const specific = message => Object.assign(new Error(message),{code:'pi-request-error'})

function answer(prompt) {
  const pending = Promise.withResolvers()
  const finish = (value,err) => {
    if (reply !== finish) return
    reply = null
    prompt.signal?.removeEventListener('abort',abort)
    if (err) pending.reject(err)
    else pending.resolve(value)
  }
  const abort = () => { finish(null,new Error('Prompt cancelled')); event({prompt:null}) }
  reply = finish
  prompt.signal?.addEventListener('abort',abort,{once:true})
  event({prompt:{message:prompt.message,placeholder:prompt.placeholder ?? null,options:prompt.options?.map(({id,label}) => ({id,label})) ?? null}})
  if (prompt.signal?.aborted) abort()
  return pending.promise
}

function loginNotice(notice) {
  if (notice.type === 'auth_url') event({auth:{url:notice.url,instructions:notice.instructions ?? null}})
  if (notice.type === 'device_code') event({auth:{verificationUri:notice.verificationUri,userCode:notice.userCode}})
}

export function checkError(error) {
  const message = String(error?.message ?? error)
  if (/401|403|unauthorized|forbidden|invalid.*key|authentication|invalid_grant/i.test(message)) return 'Authentication failed. Check the key or sign in again.'
  if (/402|insufficient|balance|credit|billing|quota/i.test(message)) return 'Insufficient balance or quota.'
  if (/404|not found|unknown model|model.*exist/i.test(message)) return 'Model or endpoint not found.'
  if (/429|rate.limit/i.test(message)) return 'Provider rate limit reached.'
  if (/timeout|timed out|abort/i.test(message)) return 'Request timed out.'
  if (/fetch|connect|network|ENOTFOUND|socket/i.test(message)) return 'Could not reach the provider.'
  return 'The provider rejected the request.'
}

async function check(profile,ids) {
  const rt = await profile.runtime(undefined,signal)
  const available = new Map(rt.getAvailableSnapshot().map(m => [modelKey(m),m]))
  const queue = ids ?? [...available.keys()]
  let cursor = 0
  async function next() {
    while (!signal.aborted && cursor < queue.length) {
      const id = queue[cursor++], started = performance.now()
      let error = null
      const timeout = AbortSignal.timeout(20000)
      try {
        const model = available.get(id)
        if (!model) error = 'Model is not ready. Configure its provider first.'
        else {
          const context = { messages:[{role:'user',content:'Reply ok.',timestamp:Date.now()}] }
          const stop = AbortSignal.any([signal,timeout])
          const aborted = Promise.withResolvers()
          const abort = () => aborted.reject(new Error('Request aborted.'))
          stop.addEventListener('abort',abort,{once:true})
          let result
          try {
            stop.throwIfAborted()
            const stream = rt.streamSimple(model,context,{reasoning:'off',maxTokens:16,maxRetries:0,signal:stop})
            result = await Promise.race([stream.result(),aborted.promise])
          } finally { stop.removeEventListener('abort',abort) }
          if (['error','aborted'].includes(result.stopReason)) error = checkError(result.errorMessage ?? result.stopReason)
        }
      } catch (e) { error = checkError(e) }
      if (timeout.aborted) error = 'Request timed out.'
      if (!signal.aborted) event({result:{model:id,ok:!error,ms:Math.round(performance.now()-started),error,at:beijingTime()}})
    }
  }
  await Promise.all(Array.from({length:Math.min(3,queue.length)},next))
}

async function run({root,dir,home,op,data}) {
  const sdk = await loadSdk(root)
  const profile = new PiProfile(dir,home,sdk)
  if (op === 'read') return profile.read()
  if (op === 'write') return profile.write(data.action,data.id,data.value)
  if (op === 'check') return check(profile,data.models)
  let auth = {}
  if (op === 'default') {
    try { auth = JSON.parse(readFileSync(join(dir,'auth.json'),'utf8')) } catch {}
  }
  const rt = await profile.runtime(auth,signal)
  if (op === 'login') {
    if (typeof rt.login !== 'function') throw Object.assign(new Error('This pi version cannot run browser login here.'),{code:'pi-sdk-unavailable'})
    const provider = rt.getProvider(data.id)
    if (!provider?.auth?.oauth) throw specific('This pi provider has no browser login method.')
    const cred = await rt.login(data.id,'oauth',{signal,prompt:answer,notify:loginNotice})
    signal.throwIfAborted()
    if (cred?.type !== 'oauth') throw specific('pi did not return an OAuth credential.')
    return profile.write('oauth',data.id,cred,signal)
  }
  if (op === 'default') {
    let s = {}
    try { s = JSON.parse(readFileSync(join(dir,'settings.json'),'utf8')) } catch {}
    const scopedModels = Array.isArray(s.enabledModels) ? await sdk.resolver.resolveModelScope(s.enabledModels,rt) : []
    const r = await sdk.resolver.findInitialModel({scopedModels,isContinuing:false,defaultProvider:s.defaultProvider,defaultModelId:s.defaultModel,defaultThinkingLevel:s.defaultThinkingLevel,modelRuntime:rt})
    return r.model ? modelKey(r.model) : null
  }
  throw specific('Unknown pi operation.')
}

process.on('disconnect',() => {controller.abort(); process.exit()})
process.on('message',async msg => {
  if (msg.type === 'input') return reply?.(msg.value)
  if (msg.type === 'cancel') {controller.abort(); reply?.(null,new Error('Cancelled')); return}
  if (msg.type !== 'start') return
  try { await finish('done',await run(msg.value)) }
  catch (err) {
    const known = ['pi-config-error','pi-sdk-unavailable','pi-request-error','provider-exists'].includes(err.code)
    await finish('error',{code:known ? err.code : 'pi-operation-failed',message:known ? err.message : checkError(err)})
  }
  if (process.connected) process.disconnect()
})
