import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

function processTable() {
  const output = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,lstart='], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
  return output.trim().split('\n').map(line => {
    const [, pid, parent, birth] = line.trim().match(/^(\d+)\s+(\d+)\s+(.+?)\s*$/)
    return { pid: Number(pid), parent: Number(parent), birth }
  })
}

function holders(marker) {
  if (!existsSync(marker)) return []
  try {
    const output = execFileSync('/usr/sbin/lsof', ['-nP', '-t', '--', marker], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    if (!output) return []
    const pids = output.split(/\s+/).map(Number)
    if (pids.some(pid => !Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid)) {
      throw new Error('Invalid process identity')
    }
    return pids
  } catch (err) {
    if (err.status === 1 && !err.stdout?.trim() && !err.stderr?.trim()) return []
    throw new Error('Cannot verify pi process ownership with lsof')
  }
}

export function owned(marker, known = [], childPid) {
  const marked = new Set(holders(marker))
  const table = processTable()
  const old = new Map(known.map(p => [p.pid, p.birth]))
  const roots = table.filter(p => marked.has(p.pid) || old.get(p.pid) === p.birth || (p.pid === childPid && p.parent === process.pid))
  const ids = new Set(roots.map(p => p.pid))
  let size
  do {
    size = ids.size
    for (const p of table) if (ids.has(p.parent)) ids.add(p.pid)
  } while (ids.size > size)
  return table.filter(p => ids.has(p.pid))
}

export async function reap(marker, known = []) {
  for (let i = 0; i < 24; i++) {
    known = owned(marker, known)
    if (!known.length) return
    for (const p of known) {
      try { process.kill(p.pid, i < 5 ? 'SIGTERM' : 'SIGKILL') }
      catch (err) { if (err.code !== 'ESRCH') throw err }
    }
    await sleep(70)
  }
  throw new Error('Could not confirm that all owned processes exited')
}
