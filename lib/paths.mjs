import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repo = fileURLToPath(new URL('../', import.meta.url))

export function canonical(path) {
  if (existsSync(path)) return realpathSync.native(path)
  return join(canonical(dirname(path)), basename(path))
}

export const personalPi = canonical(join(homedir(), '.pi'))
export const checkout = existsSync(join(repo, '.git'))
export const home = canonical(resolve(process.env.CC_BRO_HOME || join(homedir(), '.cc-bro')))
if (home === personalPi || home.startsWith(personalPi + sep) || personalPi.startsWith(home + sep) || home === '/') {
  throw new Error('Choose a cc-bro data directory separate from the personal pi profile.')
}

const sandbox = canonical(join(repo, '.sandbox'))
export const isolated = home === sandbox || home.startsWith(sandbox + sep)
export const toolsPath = isolated ? [join(home, 'tools', 'bin'), process.env.PATH].join(delimiter) : process.env.PATH
export function socketFor(dir) {
  const key = createHash('sha256').update(dir).digest('hex').slice(0, 24)
  return process.platform === 'win32' ? '\\\\.\\pipe\\cc-bro-' + key : '/tmp/cc-bro-' + process.getuid() + '-' + key + '.sock'
}
export const socketPath = socketFor(home)
