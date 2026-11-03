import { supportedWorker, workerPolicy } from './worker-policy.mjs'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, sep } from 'node:path'
import { homedir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { Crew } from './crew.mjs'
import { home } from './paths.mjs'
import { Store } from './store.mjs'
import { Roster } from './roster.mjs'

const ticketsPath = id => join(home, 'projects', id, 'tickets.sqlite')
const within = (path, root) => path === root || path.startsWith(root + sep)
const info = path => lstatSync(path, { throwIfNoEntry: false })

function binding(root) {
  const dir = join(root, '.cc-bro')
  if (info(dir) && !info(dir).isDirectory()) throw new Error('Expected a .cc-bro directory at ' + root)
  const file = join(dir, 'project-id')
  if (!info(file)) return null
  if (!info(file).isFile()) throw new Error('Invalid project-id at ' + root)
  return readFileSync(file, 'utf8').trim()
}

function bind(root, id) {
  const dir = join(root, '.cc-bro')
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of [['.gitignore', '*\n'], ['project-id', id + '\n']]) {
    const file = join(dir, name)
    if (!info(file)) writeFileSync(file, content, { flag: 'wx' })
    else if (!info(file).isFile() || readFileSync(file, 'utf8').trim() !== content.trim()) throw new Error('Conflicting project marker: ' + file)
  }
}

export class Projects {
  constructor(slots, publish) {
    this.db = new DatabaseSync(join(home, 'registry-v2.sqlite'))
    this.db.exec('CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,repoPath TEXT NOT NULL UNIQUE,created INTEGER NOT NULL,allow TEXT NOT NULL,worker TEXT NOT NULL)')
    this.slots = slots
    this.publish = publish
    this.entries = new Map()
    this.roster = new Roster(this)
  }

  attach(row) {
    const allow = JSON.parse(row.allow).filter(supportedWorker)
    const worker = allow.includes(row.worker) ? row.worker : ''
    if (JSON.stringify(allow) !== row.allow || worker !== row.worker) {
      this.db.prepare('UPDATE projects SET allow=?,worker=? WHERE id=?').run(JSON.stringify(allow), worker, row.id)
    }
    const p = { ...row, allow, worker }
    mkdirSync(dirname(ticketsPath(p.id)), { recursive: true })
    const store = new Store(false, ticketsPath(p.id))
    p.crew = new Crew(store, this.slots, () => ({ ...p, ...this.roster.effective(p) }))
    this.entries.set(p.id, p)
    store.onChange = cid => {
      this.publish({ type: 'ticket', projectId: p.id, ticket: store.ticket(cid) })
      this.publish({ type: 'project', project: this.summary(p.id) })
    }
    return p
  }

  async recover() {
    this.slots.paused = true
    for (const row of this.db.prepare('SELECT * FROM projects ORDER BY created').all()) await this.attach(row).crew.recover()
    const queued = this.crews().flatMap(crew => crew.store.stmt("SELECT c.*,r.started FROM conversations c JOIN turns r ON r.cid=c.id AND r.turn=c.turn WHERE c.status='queued'").all().map(c => ({ crew, c })))
    for (const {crew, c} of queued.sort((a,b) => a.c.started - b.c.started)) this.slots.reserve(crew, c)
    this.slots.paused = false
    this.slots.drain()
  }

  register(cwd, allow, worker) {
    const repoPath = realpathSync.native(cwd)
    if (!statSync(repoPath).isDirectory() || !basename(repoPath) || within(home,repoPath) || within(repoPath,home) || repoPath === homedir()) throw new Error('Choose a project directory separate from cc-bro data')
    const id = binding(repoPath)
    let p = id === null ? [...this.entries.values()].find(p => p.repoPath === repoPath) : this.get(id)
    if (p && p.repoPath !== repoPath && existsSync(p.repoPath)) throw new Error('Project ID already bound to ' + p.repoPath)
    const global = this.roster.read('global')
    const inheritNew = !p && allow === undefined && worker === undefined && global.allow?.length
    const settings = workerPolicy(allow, worker, p ?? (global.allow?.length ? global : undefined))
    const entries = p ? this.roster.effective(p).entries : global.entries
    if (settings.allow.some(id => id.startsWith('custom:') && !entries[id]?.template)) throw new Error('Configure and test custom workers in cc-bro ui first')
    const key = p?.id ?? randomUUID()
    const name = basename(repoPath)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET repoPath=excluded.repoPath,name=excluded.name,allow=excluded.allow,worker=excluded.worker').run(key, name, repoPath, Date.now(), JSON.stringify(settings.allow), settings.worker)
      bind(repoPath, key)
      this.db.exec('COMMIT')
    } catch (err) { this.db.exec('ROLLBACK'); throw err }
    if (p) Object.assign(p, { name, repoPath, ...settings })
    else p = this.attach(this.db.prepare('SELECT * FROM projects WHERE id=?').get(key))
    if (inheritNew) this.db.prepare('INSERT INTO roster_settings VALUES (?,?,?)').run(p.id, 1, JSON.stringify({ entries: {}, rules: [], inheritPolicy: true }))
    if (allow !== undefined || worker !== undefined) {
      const local = this.roster.read(p.id)
      if (local.inheritPolicy) {
        const { revision, ...data } = local
        this.db.prepare('UPDATE roster_settings SET revision=?,data=? WHERE scope=?').run(revision + 1, JSON.stringify({ ...data, inheritPolicy: false }), p.id)
      }
    }
    const project = this.summary(p.id)
    this.publish({ type: 'project', project })
    return project
  }

  get(id) {
    const p = this.entries.get(id)
    if (!p) throw new Error('Unknown project ID; check CC_BRO_HOME and run cc-bro init')
    return p
  }

  context(cwd) {
    const path = realpathSync.native(cwd)
    let p
    for (let root = path; ; root = dirname(root)) {
      const id = binding(root)
      if (id !== null) {
        p = this.get(id)
        if (p.repoPath !== root) this.register(root)
        break
      }
      if (dirname(root) === root) break
    }
    p ??= [...this.entries.values()].filter(p => within(path,p.repoPath)).sort((a,b) => b.repoPath.length-a.repoPath.length)[0]
    if (!p && within(path, home)) p = [...this.entries.values()].find(project =>
      project.crew.store.stmt('SELECT DISTINCT worktree FROM collaboration WHERE worktree IS NOT NULL').all().some(row => within(path, row.worktree)))
    if (!p) throw new Error('Project is not registered. Run cc-bro init in the project root.')
    return { projectId: p.id, database: ticketsPath(p.id), defaultCwd: p.repoPath }
  }

  summary(id) {
    const p = this.get(id)
    const counts = { queued: 0, working: 0, review: 0, done: 0 }
    let attention = 0, updated = p.created
    for (const r of p.crew.store.stmt('SELECT stage,flag,count(*) AS n,max(updated) AS updated FROM tickets GROUP BY stage,flag').all()) {
      counts[r.stage] += r.n
      if (r.flag || r.stage === 'review') attention += r.n
      updated = Math.max(updated, r.updated)
    }
    const policy = this.roster.effective(p)
    return { id, name: p.name, repoPath: p.repoPath, allow: policy.allow, worker: policy.worker, counts, attention, updatedAt: new Date(updated).toISOString() }
  }

  list() { return [...this.entries.keys()].map(id => this.summary(id)) }
  crews() { return [...this.entries.values()].map(p => p.crew) }
}
