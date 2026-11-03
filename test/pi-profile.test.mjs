import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { repo } from '../lib/paths.mjs'

test('installed layout uses the stand-in user profile for OAuth and a project-owned pi session', async () => {
  const { cpSync } = await import('node:fs')
  const base = mkdtempSync(join(repo,'.sandbox','installed-layout-'))
  const installed = join(base, 'package')
  cpSync(join(repo, 'lib'), join(installed,'lib'), { recursive: true })
  const profile = join(base,'user')
  const bin = join(base,'path')
  const data = join(profile,'.cc-bro')
  mkdirSync(join(profile,'.pi','agent'), { recursive:true })
  mkdirSync(bin)
  mkdirSync(data)
  const sentinel = join(profile,'.pi','agent','fixture-only')
  writeFileSync(sentinel, 'stand-in login')
  symlinkSync(process.execPath, join(bin,'node'))
  writeFileSync(join(bin,'pi'), [
    '#!/usr/bin/env node', "import fs from 'node:fs'; import path from 'node:path'",
    "const args=process.argv.slice(2), dir=process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME,'.pi','agent')",
    "if(args[0]==='auth' || fs.readFileSync(path.join(dir,'fixture-only'),'utf8')!=='stand-in login') process.exit(3)",
    "console.log(JSON.stringify({home:process.env.HOME,dir,sessions:process.env.PI_CODING_AGENT_SESSION_DIR,args,tz:process.env.TZ}))"
  ].join('\n'), { mode:0o755 })
  const script = [
    "import { home, isolated } from './lib/paths.mjs'; import { spawnPi } from './lib/pi.mjs'; import { once } from 'node:events'",
    "if(isolated) throw new Error('Unexpected development profile')",
    "const s=home+'/projects/example/sessions'",
    "const {child}=await spawnPi('openai-codex/example',process.cwd(),home+'/workers/tag',['--session-dir',s,'--model','openai-codex/example'])",
    "child.stdout.pipe(process.stdout);child.stdin.end();const [code]=await once(child,'close');process.exitCode=code"
  ].join('\n')
  const { stdout } = await promisify(execFile)(process.execPath,['--input-type=module','-e',script],{
    cwd: installed, env: { HOME:profile, PATH:bin+':/usr/bin:/bin', TZ:'Pacific/Auckland' }
  })
  const evidence = JSON.parse(stdout)
  assert.equal(evidence.dir, join(profile,'.pi','agent'))
  assert.equal(evidence.sessions, join(data,'projects/example/sessions'))
  assert.equal(evidence.tz, 'Pacific/Auckland')
  assert.deepEqual(readdirSync(evidence.dir), ['fixture-only'])
})
