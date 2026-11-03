import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { personalPi } from '../paths.mjs'
export { startService, removeService } from './launchd.mjs'
export { owned, reap } from './processes.mjs'

const exec = promisify(execFile)
export function piCommand(args, access) {
  return protectedCommand(['pi', ...args],access)
}

export function protectedCommand(args, access) {
  if (!access) return args
  const deny = access === 'readonly' ? 'file-write*' : 'file-read* file-write*'
  return ['/usr/bin/sandbox-exec', '-D', 'PERSONAL=' + personalPi, '-p',
    '(version 1)(allow default)(deny ' + deny + ' (subpath (param "PERSONAL")))', ...args]
}

export async function openBrowser(url) {
  await exec('/usr/bin/open', [url])
}
