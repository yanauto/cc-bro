import { createHash } from 'node:crypto'
import { createReadStream, lstatSync, readdirSync, readlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function piMetadata() {
  const root = join(homedir(), '.pi')
  const entries = []
  function visit(rel) {
    const path = join(root, rel)
    const stat = lstatSync(path, { bigint: true, throwIfNoEntry: false })
    if (!stat) return
    entries.push([rel, stat.mode, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join('\0'))
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(rel, name))
    }
  }
  visit('')
  return { entries: entries.length, digest: createHash('sha256').update(entries.join('\n')).digest('hex') }
}

export async function piFileHashes() {
  const root = join(homedir(), '.pi')
  const aggregate = createHash('sha256')
  let files = 0
  async function visit(rel) {
    const path = join(root, rel)
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (stat?.isDirectory()) {
      for (const name of readdirSync(path).sort()) await visit(join(rel,name))
    } else if (stat?.isFile() || stat?.isSymbolicLink()) {
      const hash = createHash('sha256')
      if (stat.isSymbolicLink()) hash.update(readlinkSync(path))
      else for await (const chunk of createReadStream(path)) hash.update(chunk)
      aggregate.update(JSON.stringify([rel,hash.digest('hex')]) + '\n')
      files++
    }
  }
  await visit('')
  return { files, digest:aggregate.digest('hex') }
}
