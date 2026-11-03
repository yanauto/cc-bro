import { AsyncLocalStorage } from 'node:async_hooks'

const current = new AsyncLocalStorage()
const reserved = /^(?:CC_BRO_(?:HOME|PORT|CONCURRENCY|MARKER|BASH_ENV)|PI_(?:CODING_AGENT_.*|OFFLINE|TELEMETRY)|NODE_OPTIONS|NODE_PATH|DYLD_.*|LD_.*|BASH_ENV|ENV|PATH|HOME|TMPDIR|PWD|OLDPWD|SHELL|SHLVL|TZ|_)$/

export function modelVariables(env) {
  return Object.fromEntries(Object.entries(env).filter(([key,value]) => /^[A-Za-z_]\w*$/.test(key) && !reserved.test(key) && typeof value === 'string'))
}

export function withModelEnvironment(env, run) { return current.run(modelVariables(env ?? {}), run) }
export function modelEnvironment() { return { ...process.env, ...current.getStore() } }
