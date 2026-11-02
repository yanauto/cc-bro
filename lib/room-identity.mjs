import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const skillPath = '.claude/skills/cc-bro'
export function identity(dir) {
  const file = join(dir, skillPath, 'instance.json')
  const entry = lstatSync(file,{throwIfNoEntry:false})
  if (!entry) return null
  if (!entry.isFile()) throw new Error('Invalid cc-bro room identity at ' + dir)
  let owner
  try { owner = JSON.parse(readFileSync(file,'utf8')) } catch {}
  if (!owner || typeof owner.home !== 'string' || !isAbsolute(owner.home) || typeof owner.id !== 'string' || !/^[\w-]+$/.test(owner.id)) {
    throw new Error('Invalid cc-bro room identity at ' + dir)
  }
  return owner
}

export function containingRoom(cwd) {
  let dir = cwd
  for (;;) {
    const owner = identity(dir)
    if (owner) return { dir, owner }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function registeredHome(cwd) {
  const room = containingRoom(realpathSync.native(cwd))
  if (!room) return null
  const db = new DatabaseSync(join(room.owner.home, 'projects.sqlite'), { readOnly: true })
  try {
    const p = db.prepare('SELECT roomPath FROM projects WHERE id=? AND phase=?').get(room.owner.id, 'active')
    if (!p || (p.roomPath ?? join(room.owner.home, 'projects', room.owner.id, 'room')) !== room.dir) {
      throw new Error('This manager room has been moved or removed')
    }
    return room.owner.home
  } finally { db.close() }
}
