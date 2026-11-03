import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { cliActions, detectCli } from './detect.mjs'
import { executable, inspectCommand } from './cli-process.mjs'
import { home } from './paths.mjs'
import { supportedWorker } from './worker-policy.mjs'
import { presets, templateTurn, validateTemplate } from './templates.mjs'
import { platform } from './platform/index.mjs'
import { execFileSync } from 'node:child_process'

const fingerprint = t => createHash('sha256').update(JSON.stringify(validateTemplate(t))).digest('hex')
const list = (v, label) => {
  if (!Array.isArray(v) || v.length > 100 || v.some(s => typeof s !== 'string' || s.length > 4000)) throw new Error('Invalid ' + label)
  return v
}
const label = v => { if (typeof v !== 'string' || v.length > 4000 || v.includes('\0')) throw new Error('Invalid text setting'); return v }

export class Roster {
  constructor(projects) {
    this.projects = projects
    this.db = projects.db
    this.db.exec('CREATE TABLE IF NOT EXISTS roster_settings(scope TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS note_proposals(id TEXT PRIMARY KEY,scope TEXT NOT NULL,worker TEXT NOT NULL,note TEXT NOT NULL,created INTEGER NOT NULL)')
    this.verified = new Map()
  }

  read(scope) {
    const row = this.db.prepare('SELECT * FROM roster_settings WHERE scope=?').get(scope)
    return row ? { revision: row.revision, ...JSON.parse(row.data) } : { revision: 0, entries: {}, rules: [] }
  }

  effective(project) {
    const global = this.read('global'), local = this.read(project.id)
    const entries = structuredClone(global.entries)
    for (const [id, entry] of Object.entries(local.entries)) entries[id] = { ...entries[id], ...entry }
    const policy = local.inheritPolicy ? global : { allow: project.allow, worker: project.worker }
    return { allow: policy.allow ?? [], worker: policy.worker ?? '', entries, rules: local.rulesOverride ? local.rules : [...global.rules, ...local.rules] }
  }

  config(scope) {
    const p = scope === 'global' ? null : this.projects.get(scope)
    const raw = this.read(scope)
    return { scope, ...raw, ...(p ? { allow: p.allow, worker: p.worker, effective: this.effective(p), inherited: this.read('global') } : {}), presets, proposals: this.db.prepare('SELECT id,worker,note FROM note_proposals WHERE scope=? ORDER BY created').all(scope) }
  }

  save(scope, data) {
    const p = scope === 'global' ? null : this.projects.get(scope)
    const old = this.read(scope)
    if (data.revision !== old.revision) throw new Error('Settings changed; reload before saving')
    const next = { entries: {}, rules: list(data.rules ?? [], 'rules'), rulesOverride: !!data.rulesOverride, inheritPolicy: !!data.inheritPolicy }
    const inherited = this.read('global').entries
    for (const [id, raw] of Object.entries(data.entries ?? {})) {
      if (!supportedWorker(id) || !raw || typeof raw !== 'object') throw new Error('Unknown worker ID: ' + id)
      const entry = {}
      for (const key of ['model', 'effort', 'note']) if (raw[key] !== undefined) entry[key] = label(raw[key])
      if (raw.rules !== undefined) entry.rules = list(raw.rules, 'worker rules')
      if (raw.models !== undefined) entry.models = list(raw.models, 'custom models')
      if (raw.efforts !== undefined) entry.efforts = list(raw.efforts, 'custom efforts')
      if (id.startsWith('custom:') && raw.template) {
        entry.template = validateTemplate(raw.template)
        const hash = fingerprint(entry.template)
        const previous = old.entries[id]?.template ?? inherited[id]?.template
        if ((!previous || fingerprint(previous) !== hash) && !(this.verified.get(scope + ':' + hash) > Date.now())) throw new Error('Test this exact template successfully before saving')
      }
      next.entries[id] = entry
    }
    const allow = [...new Set(list(data.allow ?? p?.allow ?? old.allow ?? [], 'allowlist'))]
    const worker = data.worker ?? p?.worker ?? old.worker ?? ''
    if (allow.some(id => !supportedWorker(id))) throw new Error('Invalid worker allowlist')
    if (allow.some(id => id.startsWith('custom:') && !(next.entries[id]?.template ?? inherited[id]?.template))) throw new Error('Allowed custom workers need a tested template')
    if ((allow.length && !allow.includes(worker)) || (!allow.length && worker)) throw new Error('Default worker must be allowed')
    if (!p) Object.assign(next, { allow, worker })
    if (p && next.inheritPolicy && !this.read('global').allow?.length) throw new Error('Set a global allowlist before inheriting it')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO roster_settings VALUES (?,?,?) ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(scope, old.revision + 1, JSON.stringify(next))
      if (p) this.db.prepare('UPDATE projects SET allow=?,worker=? WHERE id=?').run(JSON.stringify(allow), worker, p.id)
      this.db.exec('COMMIT')
    } catch (err) { this.db.exec('ROLLBACK'); throw err }
    if (p) Object.assign(p, { allow, worker })
    for (const id of this.projects.entries.keys()) this.projects.publish({ type: 'project', project: this.projects.summary(id) })
    return this.config(scope)
  }

  async list(scope, all = false) {
    const project = scope === 'global' ? null : this.projects.get(scope)
    const effective = project ? this.effective(project) : this.read('global')
    const allow = effective.allow ?? []
    const ids = [...new Set([...allow, ...(all ? ['codex', 'pi:openai-codex', 'pi:deepseek', 'agy', 'cursor-agent', ...Object.keys(effective.entries), ...Object.keys(presets)] : [])])]
    const rows = await Promise.all(ids.map(async id => {
      const entry = effective.entries[id] ?? {}
      const custom = id.startsWith('custom:')
      const template = entry.template ?? presets[id]
      const cli = template?.command ?? ''
      const actions = { ...cliActions[cli], ...Object.fromEntries(Object.entries(template?.actions ?? {}).map(([k, v]) => [k, v.join(' ')])) }
      const detected = custom ? { ...actions, cli, installed: !!executable(cli), capability: 'degraded', steering: 'queue', cache: false, version: null, loginStatus: 'unknown', models: (entry.models ?? []).map(id => ({ id })), efforts: entry.efforts ?? [], defaultModel: null, defaultEffort: null, tested: !!entry.template, warnings: [entry.template ? 'Custom CLI: session and reply extraction verified; detailed steps, live steering and cache are unavailable.' : 'Preset only: test this CLI before saving and allowing it.'] } : await detectCli(id, project?.repoPath ?? home)
      if (custom && detected.installed && (template?.versionArgs || cliActions[cli])) {
        const version = await inspectCommand(cli, template.versionArgs ?? ['--version'], project?.repoPath ?? home)
        detected.version = version.ok ? version.text.trim().split('\n')[0].slice(0, 200) : null
      }
      return { id, ...detected, allowed: allow.includes(id), defaultModel: entry.model || detected.defaultModel, defaultEffort: entry.effort || detected.defaultEffort,
        detectedModel: detected.defaultModel, detectedEffort: detected.defaultEffort, note: entry.note ?? '', rules: [...effective.rules, ...(entry.rules ?? [])] }
    }))
    return { projectId: project?.id ?? null, defaultWorker: effective.worker ?? '', rules: effective.rules, workers: rows }
  }

  async trial(scope, raw, model, thinking) {
    if (scope !== 'global') this.projects.get(scope)
    const template = validateTemplate(raw)
    if (!executable(template.command)) throw new Error('CLI is not installed: ' + template.command)
    const base = join(home, 'template-tests')
    mkdirSync(base, { recursive: true })
    const cwd = mkdtempSync(join(base, 'trial-'))
    execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' })
    const marker = join(cwd, 'owner'), controller = new AbortController()
    const nonce = randomUUID()
    let session, pid, known = []
    const timer = setTimeout(() => { known = platform.owned(marker, [], pid); controller.abort() }, 120000)
    const ctx = { cwd, marker, signal: controller.signal, template, provider: 'custom:trial', model: model || 'custom:trial', thinking,
      owner: id => { pid = id }, ready() {}, event() {}, bind: id => { if (session && session !== id) throw new Error('CLI resumed a different session'); session = id } }
    try {
      const first = await templateTurn({ ...ctx, text: 'Do not use tools or read or change files. Remember the exact code ' + nonce + '. Reply only ACK.' })
      if (!first || !session) throw new Error('New session extraction failed')
      const reply = await templateTurn({ ...ctx, session, text: 'Without tools, repeat the exact code from my previous message. No other text.' })
      if (!reply.includes(nonce)) throw new Error('Resumed session did not remember the first turn')
      this.verified.set(scope + ':' + fingerprint(template), Date.now() + 15 * 60 * 1000)
      return { status: 'passed', session, capability: 'degraded', expiresInSeconds: 900 }
    } finally { clearTimeout(timer); const owned = platform.owned(marker, known, pid); await platform.reap(marker, owned) }
  }

  propose(scope, worker, note) {
    this.projects.get(scope)
    if (!supportedWorker(worker)) throw new Error('Unknown worker')
    label(note)
    if (!note.trim()) throw new Error('Note is empty')
    const id = randomUUID()
    this.db.prepare('INSERT INTO note_proposals VALUES (?,?,?,?,?)').run(id, scope, worker, note, Date.now())
    return { id, status: 'pending-user-confirmation' }
  }

  resolveProposal(scope, id, accept) {
    const proposal = this.db.prepare('SELECT * FROM note_proposals WHERE id=? AND scope=?').get(id, scope)
    if (!proposal) throw new Error('Unknown proposal')
    if (accept) {
      const data = this.config(scope)
      data.entries[proposal.worker] = { ...data.entries[proposal.worker], note: proposal.note }
      this.save(scope, data)
    }
    this.db.prepare('DELETE FROM note_proposals WHERE id=?').run(id)
    return this.config(scope)
  }

  terminalCommand(id, action, scope) {
    if (!['login', 'install', 'upgrade'].includes(action)) throw new Error('Unknown CLI action')
    let command
    if (id.startsWith('custom:')) {
      const settings = scope === 'global' ? this.read('global') : this.effective(this.projects.get(scope))
      const template = settings.entries[id]?.template ?? presets[id]
      const args = template?.actions?.[action]
      const quote = s => "'" + s.replaceAll("'", "'\\''") + "'"
      command = args ? args.map(quote).join(' ') : cliActions[template?.command]?.[action]
    } else command = cliActions[id]?.[action]
    if (!command) throw new Error('No command configured for this CLI action')
    return command
  }

  async terminal(id, action, cwd, scope) {
    return platform.openTerminal(this.terminalCommand(id, action, scope), cwd)
  }
}
