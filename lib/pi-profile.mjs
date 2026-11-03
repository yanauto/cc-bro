import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

export function sdkRoot(path) {
  for (const part of path.split(delimiter)) {
    const exe = join(part,'pi')
    try { accessSync(exe,constants.X_OK); if (!statSync(exe).isFile()) continue } catch { continue }
    let dir = dirname(realpathSync(exe))
    while (dirname(dir) !== dir) {
      try { if (JSON.parse(readFileSync(join(dir,'package.json'),'utf8')).name === '@earendil-works/pi-coding-agent') return dir } catch {}
      dir = dirname(dir)
    }
    break
  }
  return null
}
