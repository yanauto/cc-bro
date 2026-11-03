import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export class Store {
  constructor(readOnly, path) {
    this.db = new DatabaseSync(path, { readOnly })
    this.directory = dirname(path)
    this.sessions = join(this.directory, 'sessions')
    this.sql = new Map()
    this.dirty = new Set()
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON')
    if (readOnly) return
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL')
    this.db.exec([
      'CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, cwd TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, activity TEXT NOT NULL, turn INTEGER NOT NULL DEFAULT 0, worker_pid INTEGER, provider TEXT NOT NULL, native_id TEXT, transport TEXT)',
      'CREATE TABLE IF NOT EXISTS turns (cid TEXT REFERENCES conversations, turn INTEGER, status TEXT NOT NULL, started INTEGER NOT NULL, finished INTEGER, error TEXT, PRIMARY KEY(cid,turn))',
      'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, cid TEXT NOT NULL, turn INTEGER NOT NULL, number INTEGER, kind TEXT NOT NULL, content TEXT NOT NULL, error TEXT, UNIQUE(cid,number), FOREIGN KEY(cid,turn) REFERENCES turns)',
      'CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, cid TEXT REFERENCES conversations, turn INTEGER NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, raw TEXT NOT NULL, summary TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS collaboration (cid TEXT PRIMARY KEY REFERENCES conversations, parent TEXT REFERENCES conversations, parent_turn INTEGER, worktree TEXT, branch TEXT, baseline TEXT, files TEXT)',
      'CREATE INDEX IF NOT EXISTS reviews_by_parent ON collaboration(parent)',
      'CREATE INDEX IF NOT EXISTS messages_by_turn ON messages(cid,turn,id)',
      "CREATE INDEX IF NOT EXISTS interjections_by_ticket ON events(cid,id) WHERE kind='bro.interjection'",
      "CREATE INDEX IF NOT EXISTS usage_by_turn ON events(cid,turn,id) WHERE kind='usage'",
      'CREATE INDEX IF NOT EXISTS events_by_turn ON events(cid,turn,id)',
      'CREATE TABLE IF NOT EXISTS tickets (cid TEXT PRIMARY KEY REFERENCES conversations, title TEXT NOT NULL, stage TEXT NOT NULL, flag TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL, started INTEGER)',
      "INSERT OR IGNORE INTO tickets SELECT c.id,c.name,CASE WHEN c.turn=0 THEN 'queued' WHEN c.status='idle' THEN 'review' ELSE 'working' END, CASE WHEN c.status IN ('error','stopped') THEN c.status END, coalesce((SELECT min(started) FROM turns WHERE cid=c.id),0),coalesce(r.finished,r.started,0),r.started FROM conversations c LEFT JOIN turns r ON r.cid=c.id AND r.turn=c.turn"
    ].join(';'))
    if (!this.db.prepare('PRAGMA table_info(conversations)').all().some(c => c.name === 'thinking')) this.db.exec('ALTER TABLE conversations ADD COLUMN thinking TEXT')
  }

  marker(id) { return join(this.directory, 'workers', id) }

  stmt(sql) {
    if (!this.sql.has(sql)) this.sql.set(sql, this.db.prepare(sql))
    return this.sql.get(sql)
  }

  transaction(fn) {
    if (this.db.isTransaction) return fn()
    this.db.exec('BEGIN')
    let value
    try {
      value = fn()
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      this.dirty.clear()
      throw err
    }
    const changed = [...this.dirty]
    this.dirty.clear()
    for (const cid of changed) this.onChange?.(cid)
    return value
  }

  changed(cid) {
    this.stmt('UPDATE tickets SET updated=max(updated+1,?) WHERE cid=?').run(Date.now(), cid)
    this.dirty.add(cid)
  }

  byName(name) {
    return this.stmt('SELECT * FROM conversations WHERE name=?').get(name)
  }

  create(name, cwd, model, title, thinking, provider) {
    return this.transaction(() => {
      const id = randomUUID()
      this.stmt("INSERT INTO conversations(id,name,cwd,model,thinking,provider,status,activity) VALUES (?,?,?,?,?,?,'idle','Ready')").run(id, name, cwd, model,thinking,provider)
      this.stmt("INSERT INTO tickets(cid,title,stage,created,updated) VALUES (?,?,'queued',?,?)").run(id, title || name, Date.now(), Date.now())
      return this.byName(name)
    })
  }

  state(cid, status, activity) {
    this.transaction(() => {
      this.stmt('UPDATE conversations SET status=?,activity=? WHERE id=?').run(status, activity, cid)
      if (status === 'error' || status === 'stopped') this.stmt('UPDATE tickets SET flag=? WHERE cid=?').run(status, cid)
      this.changed(cid)
    })
  }

  owner(cid, pid) {
    this.stmt('UPDATE conversations SET worker_pid=? WHERE id=?').run(pid, cid)
  }

  event(cid, turn, kind, raw, summary = '') {
    this.stmt('INSERT INTO events(cid,turn,at,kind,raw,summary) VALUES (?,?,?,?,?,?)').run(cid, turn, Date.now(), kind, JSON.stringify(raw), summary)
  }

  accept(c, text, title) {
    return this.transaction(() => {
      const turn = this.nextTurn(c.id)
      this.stmt("INSERT INTO turns(cid,turn,status,started) VALUES (?,?,'queued',?)").run(c.id, turn, Date.now())
      this.stmt("UPDATE conversations SET turn=?,status='queued',activity='Queued' WHERE id=?").run(turn, c.id)
      this.stmt("UPDATE tickets SET stage='queued',flag=NULL,started=NULL WHERE cid=?").run(c.id)
      if (title) this.stmt('UPDATE tickets SET title=? WHERE cid=?').run(title, c.id)
      this.changed(c.id)
      const number = this.message(c.id, turn, 'prompt', text)
      this.event(c.id, turn, 'bro.say', { number, kind: 'prompt' }, 'Queued')
      return { name: c.name, number, turn, kind: 'prompt' }
    })
  }

  nextTurn(cid) {
    return this.stmt('SELECT coalesce(max(turn),0)+1 AS n FROM turns WHERE cid=?').get(cid).n
  }

  meta(cid) {
    return this.stmt('SELECT * FROM collaboration WHERE cid=?').get(cid)
  }

  message(cid, turn, kind, text, error = null) {
    const { number } = this.stmt('SELECT coalesce(max(number),0)+1 AS number FROM messages WHERE cid=?').get(cid)
    this.stmt('INSERT INTO messages(cid,turn,number,kind,content,error) VALUES (?,?,?,?,?,?)').run(cid, turn, number, kind, text, error)
    return number
  }

  follow(c, text, outcome, reason, turn = outcome === 'queued' ? c.turn + 1 : c.turn, pendingNumber) {
    return this.transaction(() => {
      if (outcome === 'queued') {
        this.stmt("INSERT OR IGNORE INTO turns(cid,turn,status,started) VALUES (?,?,'queued',?)").run(c.id, turn, Date.now())
      }
      const kind = outcome === 'queued' ? 'next' : outcome === 'injected' ? 'steer' : 'rejected'
      const error = outcome === 'rejected' ? reason : null
      const number = pendingNumber ?? this.message(c.id, turn, kind, text, error)
      if (pendingNumber !== undefined) this.stmt("UPDATE messages SET turn=?,kind=?,error=? WHERE cid=? AND number=? AND kind='pending'").run(turn, kind, error, c.id, number)
      const receipt = { name: c.name, turn, number, kind, outcome, reason }
      this.event(c.id, turn, 'bro.interjection', receipt, outcome + ': ' + reason)
      this.changed(c.id)
      return receipt
    })
  }

  claim(c) {
    this.transaction(() => {
      this.stmt("UPDATE turns SET status='running' WHERE cid=? AND turn=?").run(c.id, c.turn)
      this.state(c.id, 'running', 'Starting worker')
    })
  }

  working(c) {
    this.transaction(() => {
      this.stmt("UPDATE tickets SET stage='working',flag=NULL,started=? WHERE cid=?").run(Date.now(), c.id)
      this.state(c.id, 'running', 'Working')
      this.event(c.id, c.turn, 'bro.working', {}, 'Working')
    })
  }

  done(name) {
    const c = this.byName(name)
    if (!c) throw new Error('Unknown ticket: ' + name)
    const ticket = this.ticket(c.id)
    if (ticket.status === 'done') return ticket
    if (ticket.status !== 'review') throw new Error('Only tickets in review can be accepted')
    this.transaction(() => {
      this.stmt("UPDATE tickets SET stage='done',flag=NULL WHERE cid=?").run(c.id)
      this.state(c.id, 'idle', 'Accepted by manager')
      this.event(c.id, c.turn, 'bro.accepted', {}, 'Accepted by manager')
    })
    return this.ticket(c.id)
  }

  assistant(cid, turn, text) {
    if (!text) return null
    return this.stmt("INSERT INTO messages(cid,turn,kind,content) VALUES (?,?,'assistant',?)").run(cid, turn, text).lastInsertRowid
  }

  rejectDeferred(cid, turn, reason) {
    for (const { number } of this.stmt("SELECT number FROM messages WHERE cid=? AND turn=? AND kind='next' AND error IS NULL").all(cid, turn)) {
      this.stmt('UPDATE messages SET error=? WHERE cid=? AND number=?').run(reason, cid, number)
      this.event(cid, turn, 'bro.interjection', { number, turn, outcome: 'rejected', reason }, 'rejected: ' + reason)
    }
  }

  finish(cid, turn, status, detail, replyId = null) {
    return this.transaction(() => {
      const updated = this.stmt("UPDATE turns SET status=?,finished=?,error=? WHERE cid=? AND turn=? AND status IN ('queued','running')").run(status, Date.now(), status === 'done' ? null : detail, cid, turn)
      if (!updated.changes) return
      if (replyId !== null) this.stmt("UPDATE messages SET kind='reply' WHERE cid=? AND turn=? AND id=?").run(cid, turn, replyId)
      if (status === 'done') this.stmt("UPDATE tickets SET stage='review',flag=NULL WHERE cid=?").run(cid)
      this.state(cid, status === 'done' ? 'idle' : status, detail)
      this.event(cid, turn, 'bro.' + status, {}, detail)
      const next = this.stmt("SELECT turn FROM turns WHERE cid=? AND turn>? AND status='queued' ORDER BY turn LIMIT 1").get(cid, turn)
      if (next && status === 'done') {
        this.stmt("UPDATE conversations SET turn=?,status='queued',activity='Queued follow-up' WHERE id=?").run(next.turn, cid)
        this.stmt("UPDATE tickets SET stage='queued',flag=NULL,started=NULL WHERE cid=?").run(cid)
      } else if (next) {
        const reason = 'Previous turn did not complete: ' + detail
        this.stmt("UPDATE turns SET status=?,error=?,finished=? WHERE cid=? AND turn=?").run(status, reason, Date.now(), cid, next.turn)
        this.rejectDeferred(cid, next.turn, reason)
      }
      this.onFinish?.(cid, next && status === 'done')
    })
  }

  list() {
    return this.stmt('SELECT c.name,c.model,c.cwd,c.status,c.activity,c.turn,r.started,r.finished FROM conversations c LEFT JOIN turns r ON r.cid=c.id AND r.turn=c.turn ORDER BY c.name').all()
  }

  ticketRows(where = '', ...params) {
    const sql = 'SELECT c.id AS cid,c.name AS id,t.title,t.stage AS status,t.flag,c.provider,c.model,c.activity,c.turn,t.created,t.updated,t.started,r.finished FROM tickets t JOIN conversations c ON c.id=t.cid LEFT JOIN turns r ON r.cid=c.id AND r.turn=c.turn '
    return this.stmt(sql + where + ' ORDER BY t.created,c.name').all(...params).map(row => {
      const { cid, created, updated, started, finished, ...fields } = row
      const meta = this.meta(cid)
      const parent = meta?.parent ? this.stmt('SELECT name FROM conversations WHERE id=?').get(meta.parent).name : null
      const reviews = this.stmt('SELECT c.name AS id,m.parent_turn AS turn FROM collaboration m JOIN conversations c ON c.id=m.cid WHERE m.parent=? ORDER BY m.rowid').all(cid)
      const interjections = this.stmt("SELECT raw FROM events WHERE cid=? AND kind='bro.interjection' ORDER BY id").all(cid).map(e => JSON.parse(e.raw))
      const usage = this.usage(cid, fields.turn)
      Object.assign(fields, usage, { parent, parentTurn: meta?.parent_turn ?? null, reviews, interjections, branch: meta?.branch ?? null,
        worktree: meta?.worktree ?? null, changedFiles: JSON.parse(meta?.files ?? 'null') })
      if (fields.status === 'done' && fields.worktree && !parent) fields.cleanupHint = 'Worktree and branch retained. After preserving changes, remove the worktree manually: ' + fields.worktree
      return { ...fields, createdAt: new Date(created).toISOString(), updatedAt: new Date(updated).toISOString(),
        startedAt: started === null ? null : new Date(started).toISOString(),
        elapsedMs: started === null ? 0 : Math.max(0, (finished ?? Date.now()) - started) }
    })
  }

  ticket(cid) {
    return this.ticketRows('WHERE t.cid=?', cid)[0]
  }

  detail(name) {
    const c = this.byName(name)
    if (!c) return null
    const lastReply = this.reply(c.id, c.turn) ?? null
    const rows = this.stmt("SELECT turn,at,kind,summary FROM events WHERE cid=? AND summary<>'' ORDER BY id").all(c.id)
    return { ...this.ticket(c.id), lastReply, timeline: rows.map(e => ({ turn: e.turn, ts: new Date(e.at).toISOString(), kind: e.kind, summary: e.summary })) }
  }

  history(cid) {
    return this.stmt('SELECT turn,number,kind,content,error FROM messages WHERE cid=? ORDER BY id').all(cid)
  }

  reply(cid, turn) {
    return this.stmt("SELECT content FROM messages WHERE cid=? AND turn=? AND kind='reply' ORDER BY id DESC LIMIT 1").get(cid, turn)?.content
  }

  usage(cid, turn) {
    const row = this.stmt("SELECT raw FROM events WHERE cid=? AND turn=? AND kind='usage' ORDER BY id DESC LIMIT 1").get(cid, turn)
    const { cachedInputTokens = null, inputTokens = null } = row ? JSON.parse(row.raw) : {}
    return { cachedInputTokens, inputTokens, cacheRatio: inputTokens > 0 && cachedInputTokens !== null ? cachedInputTokens / inputTokens : null }
  }

  result(cid, turn) {
    const t = this.stmt('SELECT turn,status,error FROM turns WHERE cid=? AND turn=?').get(cid, turn)
    if (!t) throw new Error('Unknown turn ' + turn)
    return { ...t, ...this.usage(cid, turn), reply: this.reply(cid, turn) ?? null }
  }
}
