import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'
import { Rooms, installSkill, legacyRoom, location, moveRoom, owned, unusedRoom, within } from './rooms.mjs'
import { containingRoom } from './room-identity.mjs'
import { DatabaseSync } from 'node:sqlite'
import { Crew } from './crew.mjs'
import { dbPath, home, personalPi, repo } from './paths.mjs'
import { Store } from './store.mjs'

const projectsDir = join(home, 'projects')
const trash = join(home, 'trash')
const ticketsPath = id => join(projectsDir, id, 'tickets.sqlite')

function copyRoom(src, dst, p) {
  mkdirSync(dst, { recursive: true })
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, e.name)
    const to = join(dst, e.name)
    if (e.isDirectory()) copyRoom(from, to, p)
    else if (e.isFile()) {
      const bytes = readFileSync(from)
      const text = bytes.toString('utf8')
      const contents = bytes.equals(Buffer.from(text)) ? text.replace(/{{(project_name|repo_path)}}/g,
        (_, key) => key === 'project_name' ? p.name : p.repoPath) : bytes
      writeFileSync(to, contents)
    } else throw new Error('Unsupported room template entry: ' + e.name)
  }
}

export class Projects {
  constructor(slots, defaultModel, publish) {
    this.db = new DatabaseSync(join(home, 'projects.sqlite'))
    this.db.exec('CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,repoPath TEXT NOT NULL UNIQUE,created INTEGER NOT NULL,phase TEXT NOT NULL)')
    this.rooms = new Rooms(this.db)
    this.slots = slots
    this.publish = publish
    this.defaultModel = defaultModel
    this.entries = new Map()
    this.removals = new Map()
    this.workerSettings = () => this.rooms.settings().worker
    this.legacy = new Crew(new Store(), slots, defaultModel,this.workerSettings)
  }

  attach(p) {
    const store = new Store(false, ticketsPath(p.id))
    const crew = new Crew(store, this.slots, this.defaultModel,this.workerSettings)
    this.entries.set(p.id, { ...p, crew })
    store.onChange = cid => {
      if (crew.closing) return
      this.publish({ type: 'ticket', projectId: p.id, ticket: store.ticket(cid) })
      this.publish({ type: 'project', project: this.summary(p.id) })
    }
    return crew
  }

  provision(p) {
    const room = legacyRoom(p.id)
    mkdirSync(join(projectsDir,p.id), { recursive:true })
    if (p.roomPath && existsSync(p.roomPath) && !owned(p.roomPath,p.id)) {
      p.roomPath = unusedRoom(this.rooms.settings().roomRoot,p.name)
      this.db.prepare('UPDATE projects SET roomPath=? WHERE id=?').run(p.roomPath,p.id)
    }
    if (!existsSync(location(p)) || existsSync(room)) {
      if (!existsSync(room)) {
        const staging = room + '.creating'
        rmSync(staging, { recursive:true, force:true })
        copyRoom(join(repo,'templates','room'),staging,p)
        renameSync(staging,room)
      }
      installSkill(room,p)
      if (p.roomPath) moveRoom(room,p.roomPath,p.id)
    }
    installSkill(location(p),p)
    const crew = this.attach(p)
    this.db.prepare("UPDATE projects SET phase='active' WHERE id=?").run(p.id)
    return crew
  }

  async recover() {
    this.rooms.resume()
    if (!process.env.CC_BRO_CONCURRENCY) this.slots.limit = this.workerSettings().concurrency
    this.slots.paused = true
    await this.legacy.recover()
    for (const p of this.db.prepare('SELECT * FROM projects ORDER BY created').all()) {
      if (p.phase === 'removing' && !existsSync(join(projectsDir, p.id)) && existsSync(join(trash, p.id))) {
        this.db.prepare('DELETE FROM projects WHERE id=?').run(p.id)
        continue
      }
      if (p.phase === 'active' && existsSync(location(p)) && (!p.roomPath || owned(location(p),p.id))) installSkill(location(p),p)
      const crew = p.phase === 'creating' ? this.provision(p) : this.attach(p)
      await crew.recover()
      if (p.phase === 'removing') await this.remove(p.id)
    }
    const pending = this.crews().flatMap(crew => crew.store.stmt("SELECT c.*,r.started AS submitted FROM conversations c JOIN turns r ON r.cid=c.id AND r.turn=c.turn WHERE c.status='queued' ORDER BY r.started,c.rowid").all().map(c => ({ crew, c })))
    pending.sort((a, b) => a.c.submitted - b.c.submitted)
    for (const { crew, c } of pending) this.slots.reserve(crew, c)
    this.slots.paused = false
    this.slots.drain()
  }

  validateProject(path) {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Choose an absolute project folder')
    const repoPath = realpathSync.native(path)
    const root = this.rooms.settings().roomRoot
    if (!statSync(repoPath).isDirectory() || within(realpathSync.native(homedir()),repoPath) ||
        within(home,repoPath) || within(repoPath,home) || within(repoPath,personalPi) ||
        (root && within(root,repoPath)) || containingRoom(repoPath)) {
      throw new Error('Choose a project directory separate from home, manager rooms and cc-bro data')
    }
    return repoPath
  }

  create(path) {
    const root = this.rooms.settings().roomRoot
    if (!root) throw Object.assign(new Error('Choose the manager-room root first'), { code:'room-root-unset' })
    if (!existsSync(root) || realpathSync.native(root) !== root || !statSync(root).isDirectory()) throw new Error('The selected manager-room root is unavailable: ' + root)
    const repoPath = this.validateProject(path)
    const old = this.db.prepare('SELECT * FROM projects WHERE repoPath=?').get(repoPath)
    if (old?.phase === 'removing') throw new Error('Project removal in progress')
    if (old?.phase === 'active') return this.summary(old.id)
    const p = old ?? { id: randomUUID(), name: basename(repoPath), repoPath, created: Date.now(), roomPath: unusedRoom(root,basename(repoPath)) }
    if (!old) this.db.prepare("INSERT INTO projects(id,name,repoPath,created,phase,roomPath) VALUES (?,?,?,?,'creating',?)").run(p.id, p.name, repoPath, p.created, p.roomPath)
    this.provision(p)
    const project = this.summary(p.id)
    this.publish({ type: 'project', project })
    return project
  }

  get(id) {
    const p = this.entries.get(id)
    if (!p || p.crew.closing) throw Object.assign(new Error('Project not found'), { code: 'PROJECT_NOT_FOUND', status: 404 })
    return p
  }

  context(cwd) {
    const path = realpathSync.native(cwd)
    const p = [...this.entries.values()].find(p => within(path,location(p)))
    if (p) {
      this.get(p.id)
      return { projectId:p.id, database:ticketsPath(p.id), defaultCwd:p.repoPath }
    }
    if (within(path,trash)) throw new Error('This project has been removed')
    if (within(path,projectsDir) || containingRoom(path)) throw new Error('This room is not registered in this cc-bro instance')
    return { projectId: null, database: dbPath, defaultCwd: path }
  }

  forOpen(id) {
    const p = this.get(id)
    installSkill(location(p),p)
    return this.summary(id)
  }

  entry(cwd) {
    const context = this.context(cwd)
    if (context.projectId) return { project:this.summary(context.projectId), settings:this.rooms.settings() }
    const path = this.validateProject(cwd)
    const match = [...this.entries.values()].filter(p => within(path,p.repoPath)).sort((a,b) => b.repoPath.length - a.repoPath.length)[0]
    return { project:match ? this.summary(match.id) : null, settings:this.rooms.settings() }
  }

  configure(patch, candidate) {
    if (this.removals.size) throw new Error('Wait for project removal to finish')
    this.rooms.update(patch,candidate)
    if (!process.env.CC_BRO_CONCURRENCY) this.slots.limit = this.workerSettings().concurrency
    this.slots.drain()
    for (const row of this.db.prepare('SELECT id,roomPath FROM projects').all()) {
      const p = this.entries.get(row.id)
      if (p && p.roomPath !== row.roomPath) {
        p.roomPath = row.roomPath
        this.publish({ type:'project', project:this.summary(p.id) })
      }
    }
    return this.rooms.settings()
  }

  summary(id) {
    const p = this.get(id)
    const counts = { queued: 0, working: 0, review: 0, done: 0 }
    let attention = 0
    let updated = p.created
    for (const r of p.crew.store.stmt('SELECT stage,flag,count(*) AS n,max(updated) AS updated FROM tickets GROUP BY stage,flag').all()) {
      counts[r.stage] += r.n
      if (r.flag || r.stage === 'review') attention += r.n
      updated = Math.max(updated, r.updated)
    }
    return { id, name: p.name, repoPath: p.repoPath, roomPath: location(p), counts, attention, updatedAt: new Date(updated).toISOString() }
  }

  list() {
    return [...this.entries.values()].filter(p => !p.crew.closing).map(p => this.summary(p.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
  }

  crews() {
    return [this.legacy, ...[...this.entries.values()].map(p => p.crew)]
  }

  remove(id) {
    if (this.removals.has(id)) return this.removals.get(id)
    const p = this.entries.get(id)
    if (!p) this.get(id)
    const task = this.archive(p).finally(() => this.removals.delete(id))
    this.removals.set(id, task)
    return task
  }

  async archive(p) {
    const { id, crew } = p
    this.db.prepare("UPDATE projects SET phase='removing' WHERE id=?").run(id)
    crew.closing = true
    await Promise.allSettled([...crew.queues.values()])
    for (const c of crew.store.stmt("SELECT * FROM conversations WHERE status IN ('running','queued') OR worker_pid IS NOT NULL").all()) await crew.stop(c.name)
    mkdirSync(trash, { recursive: true })
    if (location(p) !== legacyRoom(id)) moveRoom(location(p),legacyRoom(id),id)
    crew.store.db.close()
    try { renameSync(join(projectsDir, id), join(trash, id)) }
    catch (err) { this.attach(p).closing = true; throw err }
    this.entries.delete(id)
    this.db.prepare('DELETE FROM projects WHERE id=?').run(id)
    this.publish({ type: 'project-removed', projectId: id })
    return { ok: true }
  }
}
