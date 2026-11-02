import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = join(root, 'ui', 'dist')
const target = join(root, 'bundle', 'board')
if (existsSync(join(source, 'index.html'))) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  cpSync(source, target, { recursive: true })
} else if (!existsSync(join(target, 'index.html'))) {
  throw new Error('Build the board with npm run build --prefix ui before packing cc-bro')
}
