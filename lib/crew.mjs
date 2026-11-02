import { realpathSync, statSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
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
  constructor(store, slots, defaultModel, workerSettings = () => ({})) {
    this.store = store
    this.slots = slots
    this.defaultModel = defaultModel
    this.workerSettings = workerSettings
    store.onFinish = id => slots.release(id)
    this.workers = new Map()
    this.queues = new Map()
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
      if (label) {
        w.activity = label
        s.state(c.id, 'running', label)
      }
      if (e.type === 'message_start' && e.message.role === 'user' && w.steers?.length) {
        const i = w.steers.findIndex(item => item.text === messageText(e.message))
        if (i !== -1) w.steers.splice(i, 1)
      }
      if (e.type === 'message_end' && e.message.role === 'assistant' && w.active) {
        w.sawAssistant = true
        w.replyId = s.assistant(c.id, w.turn, messageText(e.message))
        w.failure = e.message.stopReason === 'error' ? (e.message.errorMessage || 'Model request failed') : ''
        if (e.message.stopReason === 'length') w.failure = 'Model reached its output limit'
        if (e.message.stopReason === 'aborted') w.failure = 'Aborted by pi'
      }
      if (e.type === 'agent_settled' && w.active) {
        for (const item of w.steers) this.rejectMessage(c.id, item.number, 'Turn settled before steer was delivered')
        w.clearQueue = w.steers.length > 0
        w.steers = []
        w.settled.resolve()
        if (w.stopping) return
        const failure = w.failure || (!w.sawAssistant && 'pi settled without an assistant message')
        const status = e.aborted ? 'stopped' : failure ? 'error' : 'done'
        const detail = e.aborted ? 'Stopped by pi' : failure || 'Waiting for input'
        s.finish(c.id, w.turn, status, detail, w.replyId)
        w.active = false
      }
    })
  }

  rejectMessage(cid, number, error) {
    this.store.stmt('UPDATE messages SET error=? WHERE cid=? AND number=?').run(error, cid, number)
  }

  async worker(c) {
    let w = this.workers.get(c.id)
    if (w) return w
    if (c.worker_pid !== null) await reap(this.store.marker(c.id))
    this.store.owner(c.id, 0)
    w = await Pi.launch(c, (worker, record) => this.record(c, worker, record), (worker, err) => {
      if (worker.expectedExit) return
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
    if (state?.model?.provider + '/' + state?.model?.id !== c.model || state.sessionId !== c.id) {
      throw new Error('pi did not select the requested model and session: ' + c.model)
    }
    return w
  }

  async release(c, w) {
    const marker = this.store.marker(c.id)
    const known = owned(marker, [], w?.child.pid)
    let forced = false
    if (w) {
      w.expectedExit = true
      w.stopping = true
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

  async say({ name, text, model, cwd, defaultCwd, title }) {
    if (this.closing) throw new Error('Project is closing')
    if (typeof name !== 'string' || !name.trim() || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Invalid conversation name')
    if (typeof text !== 'string' || !text.trim()) throw new Error('Message is empty')
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) throw new Error('Title is empty')
    let c = this.store.byName(name)
    const defaults = c ? {} : this.workerSettings()
    model ??= c?.model ?? defaults.model ?? await this.defaultModel()
    providerOf(model)
    if (c && cwd && directory(cwd) !== c.cwd) throw new Error('This name is bound to ' + c.cwd)
    let first
    if (!c) this.store.transaction(() => {
      c = this.store.create(name, directory(cwd ?? defaultCwd), model, title,defaults.thinking)
      first = this.store.accept(c, text, 'prompt', title)
    })
    let w = this.workers.get(c.id)
    if (w?.stopping) {
      await this.release(c, w)
      w = undefined
      c = this.store.byName(name)
    }
    if (model !== c.model) {
      if (w?.active || c.status === 'queued') throw new Error('Change model between turns, or stop first')
      await this.release(c, w)
      this.store.stmt('UPDATE conversations SET model=? WHERE id=?').run(model, c.id)
      c = this.store.byName(name)
      w = undefined
    }
    if (w?.active) {
      const receipt = this.store.accept(c, text, 'steer', title)
      try {
        w.steers.push({ number: receipt.number, text })
        const ack = await w.command('steer', { message: text })
        if (ack?.disposition === 'handled') w.steers = w.steers.filter(item => item.number !== receipt.number)
        const row = this.store.stmt('SELECT error FROM messages WHERE cid=? AND number=?').get(c.id, receipt.number)
        if (row.error) throw new Error(row.error)
      } catch (err) {
        this.rejectMessage(c.id, receipt.number, err.message)
        w.steers = w.steers.filter(item => item.number !== receipt.number)
        throw err
      }
      return receipt
    }
    if (c.status === 'queued') return this.store.accept(c, text, 'queued', title)
    const receipt = first ?? this.store.accept(c, text, 'prompt', title)
    c = this.store.byName(name)
    if (!this.slots.reserve(this, c)) return { ...receipt, kind: 'queued' }
    await this.dispatch(c)
    return receipt
  }

  async dispatch(c) {
    const messages = this.store.stmt("SELECT number,content FROM messages WHERE cid=? AND turn=? AND kind IN ('prompt','queued') ORDER BY number").all(c.id, c.turn)
    try {
      this.store.claim(c)
      const w = await this.worker(c)
      if (w.clearQueue) await w.command('clear_queue')
      Object.assign(w, { turn: c.turn, active: true, stopping: false, activity: '', sawAssistant: false, replyId: null, failure: '',
        clearQueue: false, steers: [], settled: Promise.withResolvers() })
      this.store.working(c)
      const ack = await w.command('prompt', { message: messages.map(m => m.content).join('\n\n') })
      if (ack?.disposition === 'handled' && w.active) {
        w.active = false
        this.store.finish(c.id, w.turn, 'done', 'Input handled by pi')
      }
    } catch (err) {
      for (const m of messages) this.rejectMessage(c.id, m.number, err.message)
      this.store.finish(c.id, c.turn, 'error', err.message)
      const failed = this.workers.get(c.id)
      if (failed) failed.active = false
      await this.release(c, failed)
      throw err
    }
  }

  async stop(name) {
    const c = this.store.byName(name)
    if (!c) throw new Error('Unknown conversation: ' + name)
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
