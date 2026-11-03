import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function git(cwd, ...args) {
  return execFileSync('git', ['--no-optional-locks', '-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 })
}

export function createTree(cwd, directory, name) {
  const prefix = git(cwd, 'rev-parse', '--show-prefix').trimEnd()
  if (prefix) git(cwd, 'cat-file', '-e', 'HEAD:' + prefix.slice(0, -1))
  const id = randomUUID()
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-|-$/g, '') || 'ticket'
  const branch = 'cc-bro/' + slug + '-' + id.slice(0, 8)
  mkdirSync(join(directory, 'worktrees'), { recursive: true })
  const worktree = join(directory, 'worktrees', id)
  git(cwd, 'worktree', 'add', '-q', '-b', branch, worktree, 'HEAD')
  return { branch, worktree, cwd: join(worktree, prefix) }
}

export function verifyTree(cwd, branch) {
  if (git(cwd, 'symbolic-ref', '--short', 'HEAD').trimEnd() !== branch) throw new Error('Ticket worktree is no longer on ' + branch)
}

function snapshot(cwd, base) {
  const files = new Map()
  const diff = (...args) => git(cwd, 'diff', '--no-ext-diff', '--relative', '--no-renames', '-z', ...args, base, '--', '.').split('\0')
  const tracked = diff('--name-status')
  for (let i = 0; i + 1 < tracked.length; i += 2) files.set(tracked[i+1], [tracked[i], null])
  const staged = diff('--cached', '--raw', '--no-abbrev')
  for (let i = 0; i + 1 < staged.length; i += 2) {
    const path = staged[i+1], entry = staged[i]
    files.set(path, [files.get(path)?.[0] ?? entry.split(' ').at(-1), entry])
  }
  for (const p of git(cwd, 'ls-files', '--others', '--exclude-standard', '-z', '--', '.').split('\0').filter(Boolean)) files.set(p, ['A', files.get(p)?.[1] ?? null])
  return Object.fromEntries([...files].map(([p, [status, index]]) => {
    const s = lstatSync(join(cwd, p), { bigint: true, throwIfNoEntry: false })
    return [p, [status, s ? String(s.ctimeNs) : null, index]]
  }))
}

export function baseline(cwd) {
  try {
    let head
    try { head = git(cwd, 'rev-parse', '--verify', 'HEAD').trimEnd() }
    catch { head = git(cwd, 'hash-object', '-t', 'tree', '--stdin').trimEnd() }
    const branch = git(cwd, 'branch', '--show-current').trimEnd() || null
    return { head, branch, files: snapshot(cwd, head) }
  } catch { return null }
}

export function changes(cwd, before) {
  if (!before) return null
  try {
    const now = snapshot(cwd, before.head)
    return [...new Set([...Object.keys(before.files), ...Object.keys(now)])].sort()
      .filter(p => JSON.stringify(Object.hasOwn(now, p) ? now[p] : null) !== JSON.stringify(Object.hasOwn(before.files, p) ? before.files[p] : null))
      .map(path => {
        if (Object.hasOwn(now, path)) return { path, status: now[path][0] }
        const exists = lstatSync(join(cwd, path), { throwIfNoEntry: false })
        return { path, status: !exists ? 'D' : before.files[path][0] === 'D' ? 'A' : 'M' }
      })
  } catch { return null }
}
