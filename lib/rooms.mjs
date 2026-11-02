import { randomUUID } from 'node:crypto'
import { chmodSync, cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path'
import { canonical, home, personalPi, repo } from './paths.mjs'
import { identity, skillPath } from './room-identity.mjs'
import { thinkingLevels } from './pi-profile.mjs'

export const within = (dir, parent) => dir === parent || dir.startsWith(parent.endsWith(sep) ? parent : parent + sep)
const overlap = (a, b) => within(a, b) || within(b, a)
const present = path => !!lstatSync(path, { throwIfNoEntry: false })
export const defaultRoomRoot = () => join(homedir(),'cc-bro')
const quote = word => "'" + word.replaceAll("'", "'\\''") + "'"
export const owned = (dir, id) => {
  if (!lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() || canonical(dir) !== dir) return false
  const i = identity(dir)
  return i?.id === id && i.home === home
}
export const legacyRoom = id => join(home, 'projects', id, 'room')
export const location = p => p.roomPath ?? legacyRoom(p.id)

function writeManaged(path, text, mode = 0o600) {
  const s = lstatSync(path, { throwIfNoEntry: false })
  if (s?.isFile() && (s.mode & 0o777) === mode && readFileSync(path,'utf8') === text) return
  const tmp = path + '.' + randomUUID()
  try {
    writeFileSync(tmp, text, { flag: 'wx', mode })
    chmodSync(tmp, mode)
    renameSync(tmp, path)
  } finally { rmSync(tmp, { force: true }) }
}

export function installSkill(dir, p) {
  if (canonical(dir) !== dir || !lstatSync(dir,{throwIfNoEntry:false})?.isDirectory()) throw new Error('Manager room is unavailable: ' + dir)
  if (dir !== legacyRoom(p.id) && !owned(dir,p.id)) throw new Error('Cannot identify the manager room at ' + dir)
  let path = dir
  for (const part of skillPath.split('/')) {
    path = join(path, part)
    if (!present(path)) mkdirSync(path)
    if (!lstatSync(path).isDirectory()) throw new Error('Expected a manager-owned directory at ' + path)
  }
  const info = identity(dir)
  if (info && (info.id !== p.id || info.home !== home)) throw new Error('Room belongs to another project: ' + dir)
  if (!info && readdirSync(path).length) throw new Error('A different local skill already occupies ' + path)
  writeManaged(join(path,'instance.json'), JSON.stringify({ id: p.id, home }) + '\n')
  const local = './' + skillPath + '/cc-bro'
  const source = readFileSync(join(repo,'plugin/skills/crew/SKILL.md'),'utf8')
  const skill = source.replace(/^name: crew$/m, 'name: cc-bro').replace('Use cc-bro from PATH.', 'Run the room-local launcher from the manager room, including for every background wait.')
    .replace(/\x60cc-bro (?=\w)/g, '\x60' + local + ' ')
  writeManaged(join(path,'SKILL.md'), skill)
  const launcher = ['#!/bin/sh', 'export CC_BRO_HOME=' + quote(home),
    'export PATH=' + quote(dirname(process.execPath) + ':' + (process.env.PATH ?? '/usr/bin:/bin')) + ':"$PATH"',
    'cd -P "${0%/*}/../../.." || exit 1',
    'node=' + quote(process.execPath), '[ -x "$node" ] || node=node',
    'exec "$node" ' + quote(join(repo,'bin/cc-bro')) + ' "$@"', ''].join('\n')
  writeManaged(join(path,'cc-bro'), launcher, 0o700)
  const guide = join(dir,'CLAUDE.md')
  const stat = lstatSync(guide, { throwIfNoEntry: false })
  if (stat && !stat.isFile()) throw new Error('Expected a regular room guide at ' + guide)
  const text = stat ? readFileSync(guide, 'utf8') : ''
  if (!text.includes(local)) {
    writeManaged(guide, text.trimEnd() + '\n\nUse the room-local /cc-bro skill. Invoke the commands in this guide with \x60' + local +
      '\x60 from this room, including background waits. This launcher also works in Desktop and IDE sessions.\n', stat ? stat.mode & 0o777 : 0o600)
  }
}

function sameTree(a, b) {
  const x = lstatSync(a), y = lstatSync(b)
  if (x.isSymbolicLink()) return y.isSymbolicLink() && readlinkSync(a) === readlinkSync(b)
  if (x.isFile()) return y.isFile() && x.size === y.size && readFileSync(a).equals(readFileSync(b))
  if (!x.isDirectory() || !y.isDirectory()) return false
  const aa = readdirSync(a).sort(), bb = readdirSync(b).sort()
  return aa.length === bb.length && aa.every((name,i) => name === bb[i] && sameTree(join(a,name),join(b,name)))
}

function retireCopy(src, dst, id) {
  const bin = join(dirname(src), '.cc-bro-retire-' + id)
  const record = join(bin,'transfer.json')
  const previous = join(bin,'room')
  const label = JSON.stringify({ src,dst,home,id })
  if (!present(bin)) {
    if (!present(src)) return
    mkdirSync(bin)
    writeFileSync(record,label,{flag:'wx'})
  } else if (!lstatSync(bin).isDirectory() || !lstatSync(record,{throwIfNoEntry:false})?.isFile() || readFileSync(record,'utf8') !== label) {
    if (!present(src)) return
    throw new Error('Cannot use the temporary room location: ' + bin)
  }
  if (present(src)) {
    if (present(previous)) throw new Error('Both room copies were retained at ' + bin)
    renameSync(src,previous)
  }
  rmSync(previous,{recursive:true,force:true})
  rmSync(record)
  rmdirSync(bin)
}

export function moveRoom(src, dst, id) {
  if (src === dst) return
  if (present(dst)) {
    if (!owned(dst, id)) throw new Error('Room destination already exists: ' + dst)
    if (!present(src)) return retireCopy(src,dst,id)
    const source = lstatSync(src), target = lstatSync(dst)
    if (source.ino === target.ino && source.dev === target.dev) return
    if (!owned(src,id) || !sameTree(src,dst)) throw new Error('Room copies differ; both have been preserved: ' + src + ' and ' + dst)
  } else {
    if (!owned(src,id)) throw new Error('Cannot identify the original manager room: ' + src)
    try { renameSync(src, dst); return }
    catch (err) { if (err.code !== 'EXDEV') throw err }
    const stage = join(dirname(dst), '.cc-bro-copy-' + randomUUID())
    try {
      cpSync(src,stage,{ recursive:true, preserveTimestamps:true, verbatimSymlinks:true, errorOnExist:true, force:false })
      if (!sameTree(src,stage)) throw new Error('Room changed during copy: ' + src)
      renameSync(stage,dst)
    } finally { rmSync(stage,{recursive:true,force:true}) }
  }
  retireCopy(src,dst,id)
}

export function unusedRoom(root, name, reserved = new Set(), previousName) {
  let stem = name.replace(/^\.+/, '') || 'project'
  while (Buffer.byteLength(stem) > 240) stem = [...stem].slice(0,-1).join('')
  function available(folder) {
    const dest = join(root, folder)
    const key = dest.normalize('NFC').toLowerCase()
    if (present(dest) || reserved.has(key)) return null
    reserved.add(key)
    return dest
  }
  if (previousName && previousName !== stem) {
    const prior = available(previousName)
    if (prior) return prior
  }
  for (let i = 1; ; i++) {
    const dest = available(i === 1 ? stem : stem + '-' + i)
    if (dest) return dest
  }
}

export class Rooms {
  constructor(db) {
    this.db = db
    if (!db.prepare('PRAGMA table_info(projects)').all().some(c => c.name === 'roomPath')) db.exec('ALTER TABLE projects ADD COLUMN roomPath TEXT')
    db.exec("CREATE TABLE IF NOT EXISTS room_settings(id INTEGER PRIMARY KEY,root TEXT,client TEXT NOT NULL,pending TEXT); INSERT OR IGNORE INTO room_settings(id,root,client,pending) VALUES(1,NULL,'terminal',NULL)")
    if (!db.prepare('PRAGMA table_info(room_settings)').all().some(c => c.name === 'worker')) db.exec('ALTER TABLE room_settings ADD COLUMN worker TEXT')
  }

  settings() {
    const { root, client, worker } = this.db.prepare('SELECT root,client,worker FROM room_settings WHERE id=1').get()
    return { roomRoot: root, defaultRoomRoot: defaultRoomRoot(), client,
      worker:worker ? JSON.parse(worker) : {kind:'pi',model:null,thinking:null,concurrency:3} }
  }

  save(root,client,worker) {
    this.db.prepare('UPDATE room_settings SET root=?,client=?,worker=? WHERE id=1').run(root,client,JSON.stringify(worker))
  }

  validateRoot(value, projects, candidate) {
    if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('Choose an absolute manager-room root')
    const root = canonical(resolve(value))
    if (root === parse(root).root || within(canonical(homedir()),root) || overlap(root,home) || overlap(root,personalPi) ||
        (candidate && within(root,canonical(candidate))) || projects.some(p => within(root,canonical(p.repoPath)) || within(root,location(p)))) {
      throw new Error('Choose a room root separate from home, project folders, existing rooms and cc-bro data')
    }
    return root
  }

  resume() {
    const { pending } = this.db.prepare('SELECT pending FROM room_settings WHERE id=1').get()
    if (!pending) return
    const plan = JSON.parse(pending)
    const moves = plan.rollback ? [...plan.moves].reverse() : plan.moves
    for (const { id, src, dst } of moves) {
      if (plan.rollback && owned(src,id) && !owned(dst,id)) continue
      moveRoom(plan.rollback ? dst : src, plan.rollback ? src : dst, id)
    }
    this.db.exec('BEGIN')
    try {
      if (!plan.rollback) {
        for (const m of moves) this.db.prepare('UPDATE projects SET roomPath=? WHERE id=?').run(m.dst,m.id)
        this.save(plan.root,plan.client,plan.worker ?? this.settings().worker)
      }
      this.db.exec('UPDATE room_settings SET pending=NULL WHERE id=1; COMMIT')
    } catch (err) { this.db.exec('ROLLBACK'); throw err }
  }

  update(patch, candidate) {
    this.resume()
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
        Object.keys(patch).some(k => !['roomRoot','client','desktopSupported','defaultRoomRoot','worker'].includes(k))) throw new Error('Unknown settings field')
    const old = this.settings()
    if ('worker' in patch && (!patch.worker || typeof patch.worker !== 'object' || Array.isArray(patch.worker) ||
        Object.keys(patch.worker).some(k => !Object.hasOwn(old.worker,k)))) throw new Error('Invalid worker settings.')
    const worker = {...old.worker,...patch.worker}
    if (worker.kind !== 'pi' || (worker.model !== null && typeof worker.model !== 'string') ||
        (worker.thinking !== null && !thinkingLevels.includes(worker.thinking)) || !Number.isSafeInteger(worker.concurrency) || worker.concurrency < 1) throw new Error('Invalid worker settings.')
    const client = patch.client === undefined ? old.client : patch.client
    if (!['terminal','desktop'].includes(client)) throw new Error('Unknown Claude client')
    const unchanged = typeof patch.roomRoot === 'string' && isAbsolute(patch.roomRoot) && canonical(resolve(patch.roomRoot)) === old.roomRoot
    if (patch.roomRoot === undefined || patch.roomRoot === old.roomRoot || unchanged) {
      this.save(old.roomRoot,client,worker)
      return
    }
    const projects = this.db.prepare('SELECT * FROM projects ORDER BY created,id').all()
    if (projects.some(p => p.phase !== 'active')) throw new Error('Finish project creation or removal before moving rooms')
    if (patch.roomRoot === null && !projects.length) {
      this.save(null,client,worker)
      return
    }
    const root = this.validateRoot(patch.roomRoot, projects, candidate)
    mkdirSync(root,{recursive:true})
    const reserved = new Set()
    const moves = projects.filter(p => dirname(location(p)) !== root).map(p => {
      const src = location(p)
      installSkill(src,p)
      return { id:p.id, src, dst:unusedRoom(root, p.name, reserved, p.roomPath && basename(src)) }
    })
    const plan = { root,client,moves,worker }
    this.db.prepare('UPDATE room_settings SET pending=? WHERE id=1').run(JSON.stringify(plan))
    try { this.resume() }
    catch (err) {
      plan.rollback = true
      this.db.prepare('UPDATE room_settings SET pending=? WHERE id=1').run(JSON.stringify(plan))
      this.resume()
      throw err
    }
  }
}
