import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { dbPath } from './paths.mjs'

export class Store {
  constructor(readOnly = false, path = dbPath) {
    this.db = new DatabaseSync(path, { readOnly })
    this.directory = dirname(path)
    this.sessions = join(this.directory, 'sessions')
    this.sql = new Map()
    this.dirty = new Set()
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON')
    if (readOnly) return
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL')
    this.db.exec([
      'CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, cwd TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, activity TEXT NOT NULL, turn INTEGER NOT NULL DEFAULT 0, worker_pid INTEGER)',
      'CREATE TABLE IF NOT EXISTS turns (cid TEXT REFERENCES conversations, turn INTEGER, status TEXT NOT NULL, started INTEGER NOT NULL, finished INTEGER, error TEXT, PRIMARY KEY(cid,turn))',
      'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, cid TEXT NOT NULL, turn INTEGER NOT NULL, number INTEGER, kind TEXT NOT NULL, content TEXT NOT NULL, error TEXT, UNIQUE(cid,number), FOREIGN KEY(cid,turn) REFERENCES turns)',
      'CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, cid TEXT REFERENCES conversations, turn INTEGER NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, raw TEXT NOT NULL, summary TEXT NOT NULL)',
      'CREATE INDEX IF NOT EXISTS messages_by_turn ON messages(cid,turn,id)',
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
    this.stmt('UPDATE tickets SET updated=? WHERE cid=?').run(Date.now(), cid)
    this.dirty.add(cid)
  }

  byName(name) {
    return this.stmt('SELECT * FROM conversations WHERE name=?').get(name)
  }

  create(name, cwd, model, title, thinking = null) {
    return this.transaction(() => {
      const id = randomUUID()
      this.stmt("INSERT INTO conversations(id,name,cwd,model,thinking,status,activity) VALUES (?,?,?,?,?,'idle','Ready')").run(id, name, cwd, model,thinking)
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

  accept(c, text, kind, title) {
    return this.transaction(() => {
      const turn = kind === 'prompt' ? c.turn + 1 : c.turn
      if (kind === 'prompt') {
        this.stmt("INSERT INTO turns(cid,turn,status,started) VALUES (?,?,'queued',?)").run(c.id, turn, Date.now())
        this.stmt("UPDATE conversations SET turn=?,status='queued',activity='Queued' WHERE id=?").run(turn, c.id)
        this.stmt("UPDATE tickets SET stage='queued',flag=NULL,started=NULL WHERE cid=?").run(c.id)
      }
      if (title) this.stmt('UPDATE tickets SET title=? WHERE cid=?').run(title, c.id)
      this.changed(c.id)
      const { number } = this.stmt('SELECT coalesce(max(number),0)+1 AS number FROM messages WHERE cid=?').get(c.id)
      this.stmt('INSERT INTO messages(cid,turn,number,kind,content) VALUES (?,?,?,?,?)').run(c.id, turn, number, kind, text)
      this.event(c.id, turn, 'bro.say', { number, kind }, kind === 'steer' ? 'Submitting steer' : 'Queued')
      return { name: c.name, number, turn, kind }
    })
  }

  claim(c) {
    this.transaction(() => {
      this.stmt("UPDATE turns SET status='running' WHERE cid=? AND turn=?").run(c.id, c.turn)
      this.state(c.id, 'running', 'Starting pi')
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

  finish(cid, turn, status, detail, replyId = null) {
    return this.transaction(() => {
      const updated = this.stmt("UPDATE turns SET status=?,finished=?,error=? WHERE cid=? AND turn=? AND status IN ('queued','running')").run(status, Date.now(), status === 'done' ? null : detail, cid, turn)
      if (!updated.changes) return
      if (replyId !== null) this.stmt("UPDATE messages SET kind='reply' WHERE cid=? AND turn=? AND id=?").run(cid, turn, replyId)
      if (status === 'done') this.stmt("UPDATE tickets SET stage='review',flag=NULL WHERE cid=?").run(cid)
      this.state(cid, status === 'done' ? 'idle' : status, detail)
      this.event(cid, turn, 'bro.' + status, {}, detail)
      this.onFinish?.(cid)
    })
  }

  list() {
    return this.stmt('SELECT c.name,c.model,c.cwd,c.status,c.activity,c.turn,r.started,r.finished FROM conversations c LEFT JOIN turns r ON r.cid=c.id AND r.turn=c.turn ORDER BY c.name').all()
  }

  ticketRows(where = '', ...params) {
    const sql = 'SELECT c.name AS id,t.title,t.stage AS status,t.flag,c.model,c.activity,c.turn,t.created,t.updated,t.started,r.finished FROM tickets t JOIN conversations c ON c.id=t.cid LEFT JOIN turns r ON r.cid=c.id AND r.turn=c.turn '
    return this.stmt(sql + where + ' ORDER BY t.created,c.name').all(...params).map(row => {
      const { created, updated, started, finished, ...fields } = row
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
    const lastReply = this.stmt("SELECT content FROM messages WHERE cid=? AND kind='reply' ORDER BY id DESC LIMIT 1").get(c.id)?.content ?? null
    const rows = this.stmt("SELECT at,kind,summary FROM events WHERE cid=? AND summary<>'' ORDER BY id").all(c.id)
    return { ...this.ticket(c.id), lastReply, timeline: rows.map(e => ({ ts: new Date(e.at).toISOString(), kind: e.kind, summary: e.summary })) }
  }

  history(cid) {
    return this.stmt('SELECT turn,number,kind,content,error FROM messages WHERE cid=? ORDER BY id').all(cid)
  }

  reply(cid, turn) {
    return this.stmt("SELECT content FROM messages WHERE cid=? AND turn=? AND kind='reply' ORDER BY id DESC LIMIT 1").get(cid, turn)?.content
  }

  result(cid, turn) {
    const t = this.stmt('SELECT turn,status,error FROM turns WHERE cid=? AND turn=?').get(cid, turn)
    if (!t) throw new Error('Unknown turn ' + turn)
    return { ...t, reply: this.reply(cid, turn) ?? null }
  }
}
