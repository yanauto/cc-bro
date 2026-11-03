import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const types = { '.png': ['image','image/png'], '.jpg': ['image','image/jpeg'], '.jpeg': ['image','image/jpeg'], '.gif': ['image','image/gif'], '.webp': ['image','image/webp'], '.mp3': ['audio','audio/mpeg'], '.wav': ['audio','audio/wav'], '.m4a': ['audio','audio/mp4'], '.mp4': ['video','video/mp4'], '.mov': ['video','video/quicktime'], '.webm': ['video','video/webm'], '.pdf': ['pdf','application/pdf'] }
export function describeAttachments(paths = []) {
  if (!Array.isArray(paths) || paths.length > 8) throw new Error('Use at most 8 attachments')
  let total = 0
  return paths.map(path => {
    if (typeof path !== 'string') throw new Error('Expected an attachment path')
    const type = types[extname(path).toLowerCase()]
    if (!type) throw new Error('Unsupported attachment file type')
    const info = statSync(path)
    if (!info.isFile() || info.size > 20 * 1024 * 1024 || info.size === 0) throw new Error('Attachment must be a nonempty file up to 20 MiB')
    total += info.size
    if (total > 32 * 1024 * 1024) throw new Error('Attachments exceed 32 MiB')
    return { path, kind: type[0], mimeType: type[1], name: basename(path) }
  })
}

export function snapshotAttachments(files, directory) {
  return files.map(file => {
    const bytes = readFileSync(file.path)
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('Attachment changed before dispatch')
    const dir = join(directory, 'attachments')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, createHash('sha256').update(bytes).digest('hex') + extname(file.path).toLowerCase())
    if (!existsSync(path)) writeFileSync(path, bytes, { mode: 0o600 })
    return { ...file, path }
  })
}

export function piImages(files = []) {
  return files.map(file => {
    if (file.kind !== 'image') throw new Error('pi RPC only supports image attachments')
    return { type: 'image', mimeType: file.mimeType, data: readFileSync(file.path).toString('base64') }
  })
}
