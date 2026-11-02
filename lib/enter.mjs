import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { call, ready } from './client.mjs'
import { home, repo, toolsPath } from './paths.mjs'

export async function enter() {
  const cwd = process.cwd()
  await ready()
  const entry = await call('/entry',{ cwd })
  let project = entry.project
  let root
  if (!entry.settings.roomRoot || !project) {
    const lines = createInterface({ input:process.stdin })
    const answers = lines[Symbol.asyncIterator]()
    async function ask(prompt) {
      process.stdout.write(prompt)
      const result = await answers.next()
      if (result.done) throw new Error('Setup cancelled before receiving an answer')
      return result.value.trim()
    }
    try {
      if (!entry.settings.roomRoot) {
        const input = await ask('Where should manager rooms live? [' + entry.settings.defaultRoomRoot + '] ')
        root = resolve(cwd,input.replace(/^~(?=\/|$)/,() => homedir()) || entry.settings.defaultRoomRoot)
      }
      if (!project && !/^(y|yes)$/i.test(await ask('Register this project and create its manager room? ' + cwd + ' [y/N] '))) {
        console.log('Registration cancelled.')
        return
      }
    } finally { lines.close() }
  }
  if (root) await call('/settings',{ patch:{ roomRoot:root }, candidate:project?.repoPath ?? cwd })
  project = project ? await call('/project',{ projectId:project.id }) : await call('/register',{ cwd })
  const { url } = await call('/ui',{})
  console.log('Board: ' + url + '/#p-' + encodeURIComponent(project.id))
  console.log('Manager room: ' + project.roomPath)
  const child = spawnSync('claude',[],{ cwd:project.roomPath, stdio:'inherit',
    env:{ ...process.env, CC_BRO_HOME:home, PATH:[join(repo,'bin'),toolsPath].join(delimiter) } })
  if (child.error?.code === 'ENOENT') throw new Error('Claude Code was not found on PATH')
  if (child.error) throw child.error
  process.exitCode = child.status ?? 1
}
