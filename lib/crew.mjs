import { supportedWorker } from './worker-policy.mjs'
import { randomUUID } from 'node:crypto'
import { baseline, changes, createTree, verifyTree } from './worktree.mjs'
import { realpathSync, statSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { withModelEnvironment } from './model-env.mjs'
import { nativeTurn } from './native.mjs'
import { Pi, providerOf } from './pi.mjs'
import { platform } from './platform/index.mjs'

const { owned, reap } = platform

export function activity(e) {
  if (e.type === 'tool_execution_start') {
    const target = e.args?.path ?? e.args?.command ?? ''
    return e.toolName + (target ? ' ' + target : '')
  }
  if (e.type === 'tool_execution_end') return e.toolName + (e.isError ? ' failed' : ' finished')
  if (e.type === 'auto_retry_start') return 'Retrying provider request'
  if (e.type === 'auto_compaction_start') return 'Compacting history'
  if (e.type === 'message_update') {
    const delta = e.assistantMessageEvent?.type
    if (delta === 'thinking_start' || delta === 'thinking_delta') return 'Thinking'
    if (delta === 'text_start' || delta === 'text_delta') return 'Writing reply'
  }
  if (e.type === 'agent_start') return 'Working'
  return ''
}

function messageText(message) {
  if (typeof message.content === 'string') return message.content
  return (message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('')
}

function directory(path) {
  const cwd = realpathSync(path)
  if (!statSync(cwd).isDirectory()) throw new Error('--cwd must be a directory')
  return cwd
}

export class Crew {
  constructor(store, slots, workerSettings = () => ({})) {
    this.store = store
    this.slots = slots
    this.workerSettings = workerSettings
    store.onFinish = (id, next) => {
      const c = store.stmt('SELECT * FROM conversations WHERE id=?').get(id)
      this.refreshFiles(c)
      if (!next) this.environments.delete(id + ':' + (c.turn + 1))
      slots.release(id)
      if (next && slots.reserve(this, c)) this.serial(c.name, () => {
        const fresh = store.byName(c.name)
        if (fresh.turn === c.turn && fresh.status === 'queued') return this.dispatch(fresh)
      }).catch(() => {})
    }
    this.workers = new Map()
    this.queues = new Map()
    this.native = new Map()
    this.environments = new Map()
  }

  refreshFiles(c, live = false) {
    if (live && Date.now() - (c.filesChecked ?? 0) < 1200) return
    c.filesChecked = Date.now()
    const m = this.store.meta(c.id)
    const before = JSON.parse(m?.baseline ?? 'null')
    if (!before) return
    const files = changes(m.worktree ? c.cwd : this.workerSettings().repoPath, before)
    this.store.stmt('UPDATE collaboration SET files=? WHERE cid=?').run(JSON.stringify(files), c.id)
  }

  serial(name, fn) {
    const previous = this.queues.get(name) || Promise.resolve()
    const result = previous.catch(() => {}).then(fn)
    this.queues.set(name, result)
    const release = () => { if (this.queues.get(name) === result) this.queues.delete(name) }
    result.then(release, release)
    return result
  }

  async recover() {
    const list = this.store.stmt("SELECT * FROM conversations WHERE worker_pid IS NOT NULL OR status='running'").all()
    for (const c of list) {
      const reason = 'Runner interrupted; inspect work before resuming'
      for (const m of this.store.stmt("SELECT number,content,turn FROM messages WHERE cid=? AND kind='pending' ORDER BY number").all(c.id)) {
        this.store.follow(c, m.content, 'rejected', 'Runner interrupted; pi delivery unconfirmed', m.turn, m.number)
      }
      if (c.status === 'running') this.store.finish(c.id, c.turn, 'error', reason)
      try {
        await reap(this.store.marker(c.id))
        this.store.owner(c.id, null)
      } catch (err) {
        this.store.finish(c.id, c.turn, 'error', err.message)
        this.store.state(c.id, 'error', err.message)
      }
    }
  }

  record(c, w, e) {
    const s = this.store
    let label = activity(e).replace(/\s+/g, ' ').slice(0, 160)
    if (label === w.activity || !w.active) label = ''
    s.transaction(() => {
      s.event(c.id, w.turn, e.type, e, label)
      if (e.type === 'tool_execution_end') this.refreshFiles(c, true)
      if (label) {
        w.activity = label
        s.state(c.id, 'running', label)
      }
      if (e.type === 'message_start' && e.message.role === 'user' && w.active) {
        if (w.initialSeen) {
          const item = w.steers.find(item => item.text === messageText(e.message))
          if (item) this.piOutcome(w, item, 'injected', 'pi delivered the message in this turn')
        }
        w.initialSeen = true
      }
      if (e.type === 'message_end' && e.message.role === 'assistant' && w.active) {
        const u = e.message.usage
        if (Number.isSafeInteger(u?.cacheRead)) s.event(c.id, w.turn, 'usage', { cachedInputTokens: u.cacheRead, inputTokens: u.input + u.cacheWrite + u.cacheRead }, 'Cached input: ' + u.cacheRead + ' tokens')
        w.sawAssistant = true
        w.replyId = s.assistant(c.id, w.turn, messageText(e.message))
        w.failure = e.message.stopReason === 'error' ? (e.message.errorMessage || 'Model request failed') : ''
        if (e.message.stopReason === 'length') w.failure = 'Model reached its output limit'
        if (e.message.stopReason === 'aborted') w.failure = 'Aborted by pi'
      }
      if (e.type === 'agent_settled' && w.active && !w.settling) {
        w.settling = true
        w.settled.resolve()
        if (w.stopping) return
        const failure = w.failure || (!w.sawAssistant && 'pi settled without an assistant message')
        const status = e.aborted ? 'stopped' : failure ? 'error' : 'done'
        const detail = e.aborted ? 'Stopped by pi' : failure || 'Waiting for input'
        const finish = () => {
          if (!w.active || w.stopping || w.exited) return
          w.active = false
          s.finish(c.id, w.turn, status, detail, w.replyId)
        }
        if (w.steers.length) this.drainPiSteers(w, status).then(finish)
        else finish()
      }
    })
  }

  piOutcome(w, item, outcome, reason) {
    const index = w.steers.indexOf(item)
    if (index < 0) return
    w.steers.splice(index, 1)
    const turn = item.c.turn + (outcome === 'queued' ? 1 : 0)
    const receipt = this.store.follow(item.c, item.text, outcome, reason, turn, item.number)
    if (outcome === 'queued') this.environments.set(item.c.id + ':' + turn, item.env)
    item.receipt.resolve(receipt)
  }

  steerPi(c, w, text, env) {
    const number = this.store.message(c.id, c.turn, 'pending', text)
    const item = { c, text, env, number, receipt: Promise.withResolvers() }
    w.steers.push(item)
    item.ack = w.command('steer', { message: text }).then(ack => {
      if (ack?.disposition === 'queued') return
      if (ack?.disposition !== 'handled') w.resetBeforeReuse = true
      this.piOutcome(w, item, 'rejected', 'pi did not confirm queueing for model delivery')
    }, err => this.piOutcome(w, item, err.declined && !w.stopping ? 'queued' : 'rejected', err.message))
    return { delivery: item.receipt.promise }
  }

  async drainPiSteers(w, status) {
    await Promise.all(w.steers.map(item => item.ack))
    if (!w.steers.length) return
    let remaining = []
    try {
      const cleared = await w.command('clear_queue')
      if (Array.isArray(cleared?.steering)) remaining = cleared.steering
      else w.resetBeforeReuse = true
    } catch { w.resetBeforeReuse = true }
    for (const item of [...w.steers]) {
      const index = remaining.indexOf(item.text)
      if (index >= 0 && status === 'done' && !w.stopping) {
        remaining.splice(index, 1)
        this.piOutcome(w, item, 'queued', 'Recovered undelivered steer from pi for next turn')
      } else this.piOutcome(w, item, 'rejected', 'pi turn ended without confirmed delivery')
    }
  }

  rejectMessage(cid, number, error) {
    this.store.stmt('UPDATE messages SET error=? WHERE cid=? AND number=?').run(error, cid, number)
  }

  async worker(c) {
    let w = this.workers.get(c.id)
    if (w && !w.resetBeforeReuse) return w
    if (w) await this.release(c, w)
    else if (c.worker_pid !== null) await reap(this.store.marker(c.id))
    this.store.owner(c.id, 0)
    w = await Pi.launch(c, (worker, record) => this.record(c, worker, record), (worker, err) => {
      if (worker.expectedExit) return
      for (const item of [...(worker.steers ?? [])]) this.piOutcome(worker, item, 'rejected', 'pi exited before confirming steer')
      this.store.finish(c.id, worker.turn, 'error', err.message)
      this.store.state(c.id, 'error', err.message)
      this.workers.delete(c.id)
      this.serial(c.name, async () => {
        if (this.workers.has(c.id) || this.store.byName(c.name).worker_pid !== worker.child.pid) return
        await reap(this.store.marker(c.id))
        this.store.owner(c.id, null)
      }).catch(error => this.store.state(c.id, 'error', error.message))
    }, this.store.sessions, this.store.marker(c.id))
    this.workers.set(c.id, w)
    this.store.owner(c.id, w.child.pid)
    const state = await w.command('get_state')
    const selected = state?.model
    const actual = selected?.provider + '/' + selected?.id
    if (selected?.provider !== c.provider.slice(3) || !selected.id || (c.model !== c.provider && actual !== c.model) || state.sessionId !== c.id) {
      throw new Error('pi did not select the requested model and session: ' + c.model)
    }
    this.store.stmt("UPDATE conversations SET model=?,native_id=?,transport='pi-rpc' WHERE id=?").run(actual, state.sessionId, c.id)
    return w
  }

  async release(c, w) {
    const marker = this.store.marker(c.id)
    const known = owned(marker, [], w?.child.pid)
    let forced = false
    if (w) {
      w.expectedExit = true
      w.stopping = true
      for (const item of [...(w.steers ?? [])]) this.piOutcome(w, item, 'rejected', 'Stopped before pi confirmed delivery')
      if (w.active && !w.exited) {
        try {
          const terminal = Promise.all([w.command('abort', {}, 4500), w.settled.promise])
          const ack = await Promise.race([terminal.then(() => true), sleep(5000, false, { ref: false })])
          forced = !ack
        } catch { forced = true }
      }
      w.child.stdin.end()
      await Promise.race([w.closed, sleep(600, null, { ref: false })])
    }
    await reap(marker, known)
    if (w && !w.exited) {
      const closed = await Promise.race([w.closed.then(() => true), sleep(1500, false, { ref: false })])
      if (!closed) throw new Error('Could not verify pi RPC process exit')
    }
    this.workers.delete(c.id)
    this.store.owner(c.id, null)
    return forced
  }

  async review({ name, by, model, env }) {
    if (!supportedWorker(by)) throw new Error('Choose --by codex or pi:<provider>')
    const p = this.store.byName(name)
    if (!p || !['review', 'done'].includes(this.store.ticket(p.id).status) || p.status !== 'idle') throw new Error('Review needs a completed writer turn')
    if (by === p.provider) throw new Error('Choose a different worker for review')
    const m = this.store.meta(p.id)
    const files = JSON.parse(m?.files ?? 'null')
    const summary = files === null ? 'Unavailable' : files.map(f => f.status + ' ' + JSON.stringify(f.path)).join('\n') || 'No changes'
    const inputs = this.store.stmt("SELECT content FROM messages WHERE cid=? AND turn=? AND kind IN ('prompt','next','steer') AND error IS NULL ORDER BY number").all(p.id, p.turn)
    const text = ['Review the writer’s work. Inspect the changes in this directory; do not edit files. Report findings and test gaps.',
      'Writer: ' + name + ', turn ' + p.turn, 'Base commit: ' + (JSON.parse(m?.baseline ?? 'null')?.head ?? 'unavailable'),
      'Writer instructions for this turn:', ...inputs.map(i => i.content),
      'File codes describe added, modified or deleted paths since the ticket began; A includes untracked files and does not imply staging.', 'Changed files:', summary, 'Writer final reply:', this.store.reply(p.id, p.turn) ?? '(no reply)'].join('\n')
    const child = name + '-review-' + randomUUID().slice(0, 8)
    return this.say({ name: child, text, worker: by, model, env, title: 'Review: ' + name + ' #' + p.turn,
      defaultCwd: m?.worktree ? p.cwd : this.workerSettings().repoPath }, { parent: p, meta: m })
  }

  async say({ name, text, model, worker, defaultCwd, title, env, worktree }, review) {
    if (typeof name !== 'string' || !name.trim() || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Invalid conversation name')
    let c = this.store.byName(name)
    const settings = this.workerSettings()
    const busy = c && ['running','queued'].includes(c.status)
    worker ??= c?.provider ?? settings.worker
    model ??= c?.model ?? worker
    let invalid
    if (typeof text !== 'string' || !text.trim()) invalid = 'Message is empty'
    else if (title !== undefined && (typeof title !== 'string' || !title.trim())) invalid = 'Title is empty'
    else if (!supportedWorker(worker) || !settings.allow.includes(worker)) invalid = 'Worker not allowed in this project: ' + worker
    else if (c && worker !== c.provider) invalid = 'This name is bound to ' + c.provider
    else if (!worker.startsWith('pi:') && model.includes('/')) invalid = 'Use --worker pi:<provider> for a provider/model ID'
    else if (c && c.model !== model) invalid = 'This name is bound to model ' + c.model
    else if (c && worktree && !this.store.meta(c.id)?.worktree) invalid = 'Choose --worktree when creating a new ticket'
    if (!invalid && worker.startsWith('pi:') && model !== worker) {
      try { if (providerOf(model) !== worker.slice(3)) invalid = 'Choose --model from the allowed pi provider' }
      catch (err) { invalid = err.message }
    }
    if (invalid) {
      if (busy) return this.store.follow(c, typeof text === 'string' ? text : '', 'rejected', invalid)
      throw new Error(invalid)
    }
    let queuedReason
    if (busy) {
      const pi = this.workers.get(c.id)
      if (pi?.active && !pi.stopping && !pi.settling) return this.steerPi(c, pi, text, env)
      const target = c.turn + 1
      const active = this.native.get(c.id)
      const steer = active && await active.ready.promise
      if (steer) {
        try {
          if (await steer(text)) return this.store.follow(c, text, 'injected', 'Codex acknowledged turn/steer')
        } catch (err) { return this.store.follow(c, text, 'rejected', 'Delivery unconfirmed: ' + err.message) }
      }
      queuedReason = steer ? 'Current turn declined steer' : 'Current turn does not accept steer'
      c = this.store.byName(name)
      if (['running','queued'].includes(c.status)) {
        const turn = c.turn === target && c.status === 'queued' ? target : c.turn + 1
        const key = c.id + ':' + turn
        if (!this.environments.has(key)) this.environments.set(key, env)
        return this.store.follow(c, text, 'queued', queuedReason, turn)
      }
      if (c.status !== 'idle') return this.store.follow(c, text, 'rejected', 'Previous turn did not complete')
    }
    const receipt = this.store.transaction(() => {
      if (!c) {
        const tree = worktree ? createTree(defaultCwd, this.store.directory, name) : review?.meta
        const cwd = directory(worktree ? tree.cwd : defaultCwd)
        c = this.store.create(name, cwd, model, title, null, worker)
        this.store.stmt('INSERT INTO collaboration(cid,parent,parent_turn,worktree,branch) VALUES (?,?,?,?,?)').run(
          c.id, review?.parent.id ?? null, review?.parent.turn ?? null, tree?.worktree ?? null, tree?.branch ?? null)
        if (review) this.store.changed(review.parent.id)
      }
      const r = this.store.accept(c, text, title)
      if (queuedReason) {
        Object.assign(r, { outcome: 'queued', reason: queuedReason })
        this.store.event(c.id, r.turn, 'bro.interjection', r, 'queued: ' + queuedReason)
      }
      return r
    })
    c = this.store.byName(name)
    this.environments.set(c.id + ':' + c.turn, env)
    if (!this.slots.reserve(this, c)) return { ...receipt, kind: 'queued' }
    await this.dispatch(c)
    return receipt
  }

  dispatch(c) {
    const key = c.id + ':' + c.turn
    const env = this.environments.get(key)
    this.environments.delete(key)
    return withModelEnvironment(env, () => this.startTurn(c))
  }

  async startTurn(c) {
    const messages = this.store.stmt("SELECT number,content FROM messages WHERE cid=? AND turn=? AND kind IN ('prompt','next') ORDER BY number").all(c.id, c.turn)
    try {
      if (!supportedWorker(c.provider) || !this.workerSettings().allow.includes(c.provider)) throw new Error('Worker no longer allowed: ' + c.provider)
      const m = this.store.meta(c.id)
      c.cwd = directory(m?.worktree ? c.cwd : this.workerSettings().repoPath)
      if (m?.worktree) verifyTree(c.cwd, m.branch)
      if (!m?.baseline) {
        const initial = baseline(c.cwd)
        this.store.stmt('INSERT INTO collaboration(cid,baseline,branch) VALUES (?,?,?) ON CONFLICT(cid) DO UPDATE SET baseline=excluded.baseline,branch=coalesce(collaboration.branch,excluded.branch)').run(c.id, JSON.stringify(initial), initial?.branch ?? null)
      }
      this.store.claim(c)
      if (!c.provider.startsWith('pi:')) {
        const controller = new AbortController()
        this.store.working(c)
        const ready = Promise.withResolvers()
        const task = this.runNative(c, messages.map(m => m.content).join('\n\n'), controller, ready, m)
        this.native.set(c.id, { controller, task, ready })
        return
      }
      const w = await this.worker(c)
      Object.assign(w, { turn: c.turn, active: true, stopping: false, activity: '', sawAssistant: false, replyId: null, failure: '',
        initialSeen: false, settling: false, steers: [], settled: Promise.withResolvers() })
      this.store.working(c)
      const ack = await w.command('prompt', { message: messages.map(m => m.content).join('\n\n') })
      if (ack?.disposition === 'handled' && w.active) {
        w.active = false
        this.store.finish(c.id, w.turn, 'done', 'Input handled by pi')
      }
    } catch (err) {
      this.store.rejectDeferred(c.id, c.turn, err.message)
      for (const m of messages) this.rejectMessage(c.id, m.number, err.message)
      this.store.finish(c.id, c.turn, 'error', err.message)
      const failed = this.workers.get(c.id)
      if (failed) failed.active = false
      await this.release(c, failed)
      throw err
    }
  }

  async runNative(c, text, controller, ready, meta) {
    const s = this.store
    let reply, failure, bound = c.native_id
    try {
      reply = await nativeTurn({
        ...c, text, session: c.native_id, marker: s.marker(c.id), signal: controller.signal,
        ready: ready.resolve, worktree: meta?.worktree, review: !!meta?.parent,
        owner: pid => s.owner(c.id, pid),
        bind: (id, transport) => {
          if (typeof id !== 'string' || !id || (bound && bound !== id)) throw new Error('Native worker returned a different session')
          bound = id
          s.stmt('UPDATE conversations SET native_id=?,transport=? WHERE id=?').run(id, transport, c.id)
        },
        event: (kind, payload, detail) => s.transaction(() => {
          if (kind === 'tool.completed' || (kind === 'item/completed' && ['fileChange','commandExecution'].includes(payload.type))) this.refreshFiles(c, true)
          s.event(c.id, c.turn, kind, payload, detail)
          s.state(c.id, 'running', detail)
        })
      })
      if (!bound) throw new Error('Missing native session ID')
    } catch (err) { failure = err.message }
    finally {
      ready.resolve(null)
      s.owner(c.id, null)
      this.native.delete(c.id)
    }
    const stopped = controller.signal.aborted
    s.transaction(() => s.finish(c.id, c.turn, stopped ? 'stopped' : failure ? 'error' : 'done',
      stopped ? 'Stopped by manager' : failure || 'Waiting for manager', !stopped && !failure ? s.assistant(c.id, c.turn, reply) : null))
  }

  async stop(name) {
    const c = this.store.byName(name)
    if (!c) throw new Error('Unknown conversation: ' + name)
    this.environments.delete(c.id + ':' + c.turn)
    if (c.status === 'queued') this.store.rejectDeferred(c.id, c.turn, 'Stopped before delivery')
    const native = this.native.get(c.id)
    if (native) {
      const marked = owned(this.store.marker(c.id), [], c.worker_pid)
      native.controller.abort()
      await reap(this.store.marker(c.id), marked)
      await native.task
      return { name, status: 'stopped', forced: false }
    }
    const w = this.workers.get(c.id)
    try {
      const forced = await this.release(c, w)
      const detail = forced ? 'Stopped by forced cleanup; processes verified' : 'Stopped; processes verified'
      this.store.finish(c.id, c.turn, 'stopped', detail)
      this.store.state(c.id, 'stopped', detail)
      this.store.event(c.id, c.turn, 'bro.stop', { forced }, detail)
      return { name, status: 'stopped', forced }
    } catch (err) {
      this.store.finish(c.id, c.turn, 'error', err.message)
      this.store.state(c.id, 'error', err.message)
      throw err
    }
  }
}
