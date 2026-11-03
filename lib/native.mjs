import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { modelEnvironment } from './model-env.mjs'

function channel(file, args, ctx, receive) {
  mkdirSync(dirname(ctx.marker), { recursive: true })
  const fd = openSync(ctx.marker, 'a', 0o600)
  let child
  try {
    const env = modelEnvironment()
    for (const key of ['CLAUDECODE','CLAUDE_CODE_ENTRYPOINT','CODEX_THREAD_ID','CODEX_INTERNAL_ORIGINATOR_OVERRIDE']) delete env[key]
    child = spawn(file, args, { cwd: ctx.cwd, env, stdio: ['pipe','pipe','ignore',fd], signal: ctx.signal })
  } finally { closeSync(fd) }
  ctx.owner(child.pid ?? null)
  let failure
  child.on('error', e => { failure = e })
  child.stdin.on('error', () => {})
  createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', line => {
    if (!line.trim() || failure) return
    try { receive(JSON.parse(line)) }
    catch (err) { failure = err; child.kill() }
  })
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve(failure || (code === 0 ? null : new Error(file + ' exited: ' + (signal || code))))))
  return { child, closed }
}

async function streamed(ctx, file, args, input, parse) {
  const ch = channel(file, args, ctx, parse)
  ch.child.stdin.end(input)
  const error = await ch.closed
  if (error) throw error
}

function cached(ctx, n, total) {
  if (Number.isSafeInteger(n) && n >= 0) ctx.event('usage', { cachedInputTokens: n, inputTokens: Number.isSafeInteger(total) && total >= n ? total : null }, 'Cached input: ' + n + ' tokens')
}

async function codexExec(ctx) {
  if (ctx.attachments?.some(f => f.kind !== 'image')) throw new Error('Codex exec fallback cannot send audio attachments')
  let reply, finished = false, failed
  const args = ['exec', ...(ctx.session ? ['resume'] : []), '--json']
  if (!ctx.session && (ctx.review || ctx.worktree)) args.push('--sandbox', ctx.review ? 'read-only' : 'workspace-write')
  if (ctx.model !== 'codex') args.push('--model', ctx.model)
  if (ctx.thinking) args.push('-c', 'model_reasoning_effort=' + JSON.stringify(ctx.thinking))
  for (const file of ctx.attachments ?? []) args.push('--image', file.path)
  if (ctx.session) args.push(ctx.session)
  args.push('-')
  await streamed(ctx, 'codex', args, ctx.text, e => {
    if (e.type === 'thread.started') ctx.bind(e.thread_id, 'exec')
    if (e.type === 'item.completed' && e.item?.type === 'agent_message') reply = e.item.text
    else if (e.item?.type) ctx.event(e.type, {}, e.item.type + ': ' + e.type)
    if (e.type === 'turn.failed') failed = e.error?.message || 'Codex turn failed'
    if (e.type === 'turn.completed') { finished = true; cached(ctx, e.usage?.cached_input_tokens, e.usage?.input_tokens) }
  }).catch(err => { throw new Error(failed || err.message) })
  if (!finished || !reply || failed) throw new Error(failed || 'Codex exec returned no final result')
  return reply
}

async function appServer(ctx) {
  let next = 0, thread, reply, terminal = false
  const pending = new Map()
  const done = Promise.withResolvers()
  done.promise.catch(() => {})
  const ch = channel('codex', ['app-server'], ctx, e => {
    if (e.id !== undefined) {
      if (e.method) {
        send({ id: e.id, error: { code: -32601, message: 'No interactive manager attached' } })
        return
      }
      const waiter = pending.get(e.id)
      if (waiter) {
        pending.delete(e.id)
        if (e.error) waiter.reject(Object.assign(new Error(e.error.message), { rpcCode: e.error.code }))
        else waiter.resolve(e.result)
      }
      return
    }
    const p = e.params
    if (!thread || p?.threadId !== thread || terminal) return
    if (e.method === 'thread/tokenUsage/updated') cached(ctx, p.tokenUsage?.last?.cachedInputTokens, p.tokenUsage?.last?.inputTokens)
    if (e.method === 'item/started' || e.method === 'item/completed') {
      const item = p.item
      if (item.type === 'agentMessage' && e.method === 'item/completed') reply = item.text
      const target = item.type === 'fileChange' ? item.changes?.map(f => f.path).join(', ') : ''
      ctx.event(e.method, { type: item.type }, [item.type, e.method.endsWith('started') ? 'started' : 'completed', target?.slice(0, 180)].filter(Boolean).join(' '))
    }
    if (e.method === 'turn/completed') {
      terminal = true
      if (p.turn.status === 'completed' && reply) done.resolve(reply)
      else done.reject(new Error(p.turn.error?.message || 'Codex turn ' + p.turn.status + ' without a final reply'))
    }
  })
  const send = obj => ch.child.stdin.write(JSON.stringify(obj) + '\n')
  const closed = ch.closed.then(e => { throw e || new Error('Codex app-server closed') })
  closed.catch(() => {})
  async function request(method, params) {
    const id = ++next
    const waiter = Promise.withResolvers()
    pending.set(id, waiter)
    const timer = setTimeout(() => waiter.reject(new Error('Timed out: ' + method)), 30000)
    try { send({ id, method, params }); return await Promise.race([waiter.promise, closed]) }
    finally { clearTimeout(timer); pending.delete(id) }
  }
  try {
    try { await request('initialize', { clientInfo: { name: 'cc-bro', version: '2' }, capabilities: {} }) }
    catch (err) { err.beforeThread = true; throw err }
    send({ method: 'initialized' })
    const params = { cwd: ctx.cwd, approvalPolicy: 'never' }
    if (ctx.review || ctx.worktree) params.sandbox = ctx.review ? 'read-only' : 'workspace-write'
    if (ctx.model !== 'codex') params.model = ctx.model
    let res
    try {
      res = ctx.session ? await request('thread/resume', { ...params, threadId: ctx.session }) : await request('thread/start', params)
    } catch (err) {
      if (err.rpcCode === -32601) err.beforeThread = true
      throw err
    }
    thread = res.thread.id
    ctx.bind(thread, 'app-server')
    if (!ctx.session) await request('thread/name/set', { threadId: thread, name: ctx.name })
    const started = await request('turn/start', { threadId: thread, ...(ctx.thinking ? { effort: ctx.thinking } : {}), input: [{ type: 'text', text: ctx.text, text_elements: [] }, ...(ctx.attachments ?? []).map(f => ({ type: f.kind === 'image' ? 'localImage' : 'localAudio', path: f.path }))] })
    const turn = started?.turn?.id
    ctx.ready(turn ? async text => {
      if (terminal) return false
      try {
        const res = await request('turn/steer', { threadId: thread, expectedTurnId: turn, input: [{ type: 'text', text, text_elements: [] }] })
        if (res?.turnId !== turn) throw new Error('Unconfirmed turn/steer acknowledgement')
        return true
      } catch (err) {
        if (err.rpcCode !== undefined) return false
        throw err
      }
    } : null)
    return await Promise.race([done.promise, closed])
  } finally {
    ch.child.stdin.end()
    ch.child.kill()
    const kill = setTimeout(() => ch.child.kill('SIGKILL'), 2000)
    try { await ch.closed } finally { clearTimeout(kill) }
  }
}

export async function nativeTurn(ctx) {
  if (ctx.provider !== 'codex') throw new Error('Expected a codex worker')
  if (ctx.transport !== 'exec') {
    try { return await appServer(ctx) }
    catch (err) {
      if (!err.beforeThread || ctx.signal.aborted) throw err
      ctx.event('fallback', {}, 'App-server unavailable; using codex exec')
    }
  }
  ctx.ready(null)
  return codexExec(ctx)
}
