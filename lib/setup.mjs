import { chmodSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { home, repo } from './paths.mjs'

const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"

export function setup() {
  const dir = resolve(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'skills', 'cc-bro')
  mkdirSync(dir, { recursive: true })
  const launcher = join(dir, 'cc-bro')
  const node = realpathSync(process.execPath)
  const cli = realpathSync(join(repo, 'bin', 'cc-bro'))
  const path = [dirname(node), ...process.env.PATH.split(':').filter(p => p.startsWith('/'))].join(':')
  const script = ['#!/bin/sh', 'export PATH=' + quote(path) + ':"$PATH"',
    'if [ -z "$CC_BRO_HOME" ]; then export CC_BRO_HOME=' + quote(home) + '; fi',
    'exec ' + quote(node) + ' ' + quote(cli) + ' "$@"', ''].join('\n')
  const skill = readFileSync(join(repo,'skills','cc-bro','SKILL.md'),'utf8').replaceAll('{{launcher}}', () => quote(launcher))
  for (const [file, content, mode] of [[launcher, script, 0o755], [join(dir, 'SKILL.md'), skill, 0o644]]) {
    const tmp = file + '.' + randomUUID()
    writeFileSync(tmp, content, { mode, flag: 'wx' })
    chmodSync(tmp, mode)
    renameSync(tmp, file)
  }
  return launcher
}
