import { modalities } from './model-catalog.mjs'

const levels = ['off','none','minimal','low','medium','high','extra-high','xhigh','max','ultra']
const older = model => ['previous generation','superseded','being retired'].includes(model.catalog?.tier)
const line = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const sentence = value => line(value).match(/^.*?(?:[。！？]|[.!?](?=\s|$)|$)/u)?.[0] ?? ''

function variant(id) {
  const options = /\[([^\]]*)\]$/.exec(id)?.[1]?.split(',') ?? []
  const base = id.replace(/\[[^\]]*\]$/, '')
  const suffix = /(?:-(?:extra-high|off|none|minimal|low|medium|high|xhigh|max|ultra|fast|thinking))+$/.exec(base)?.[0] ?? ''
  const other = options.filter(o => !/^(?:effort|fast)=/.test(o))
  return { family: base.slice(0, base.length - suffix.length) + (other.length ? '[' + other.join(',') + ']' : ''),
    efforts: [...suffix.matchAll(/-(extra-high|off|none|minimal|low|medium|high|xhigh|max|ultra)(?=-|$)/g)].map(m => m[1]).concat(options.filter(o => o.startsWith('effort=')).map(o => o.slice(7))),
    fast: /(?:^|-)fast(?:-|$)/.test(suffix) || options.includes('fast=true') }
}

function compactWorker(worker) {
  const groups = new Map()
  for (const model of worker.models.filter(m => !m.hidden)) {
    const family = variant(model.id).family
    if (!groups.has(family)) groups.set(family, [])
    groups.get(family).push(model)
  }
  const models = [], defaultFamily = variant(worker.defaultModel ?? '').family
  let olderModels = 0, defaultFolded = false
  for (const [family, group] of groups) {
    if (group.every(older)) { olderModels++; defaultFolded ||= family === defaultFamily; continue }
    const chosen = group.find(m => m.id === worker.defaultModel) ?? group.find(m => m.id === family) ?? group[0]
    const variants = group.map(m => variant(m.id))
    const efforts = [...new Set(group.flatMap(m => m.efforts ?? []).concat(variants.flatMap(v => v.efforts)))].sort((a,b) => (levels.indexOf(a) === -1 ? 99 : levels.indexOf(a)) - (levels.indexOf(b) === -1 ? 99 : levels.indexOf(b)) || a.localeCompare(b))
    const input = Object.fromEntries(modalities.map(type => {
      const values = group.map(m => m.capabilities?.input?.[type] ?? 'unknown')
      return [type, values.every(v => v === true) ? true : values.every(v => v === false) ? false : 'unknown']
    }))
    const catalog = chosen.catalog
    models.push({ id: chosen.id, efforts, ...(group.length > 1 ? { variantCount: group.length } : {}), ...(variants.some(v => v.fast) ? { fast: true } : {}), capabilities: { input },
      ...(catalog ? { catalog: { id: catalog.id, tier: catalog.tier, grade: catalog.grade, summary: sentence(catalog.summary?.en || catalog.summary?.zh), as_of: catalog.as_of, stale: group.some(m => m.catalog?.stale) } } : {}) })
  }
  return { id: worker.id, allowed: true, cli: worker.cli, loginStatus: worker.loginStatus, capability: worker.capability, steering: worker.steering, cache: worker.cache,
    defaultModel: worker.defaultModel, defaultEffort: worker.defaultEffort, efforts: worker.efforts, ...(worker.defaultBlocked ? { defaultBlocked: true } : {}), ...(defaultFolded ? { defaultFolded: true } : {}),
    note: worker.note, rules: worker.rules, ...(worker.warnings?.length ? { warnings: worker.warnings } : {}), models, ...(olderModels ? { olderModels } : {}) }
}

export function rosterOutput(roster, { full = false, worker } = {}) {
  const selected = roster.workers.filter(w => !worker || w.id === worker)
  if (worker && !selected.length) throw new Error('Worker is not in the detected roster: ' + worker)
  const workers = selected.map(w => !w.allowed ? { id: w.id, allowed: false } : full ? { ...w, models: w.models.filter(m => !m.hidden) } : compactWorker(w))
  const visible = new Set(workers.flatMap(w => (w.models ?? []).map(m => m.catalog?.id).filter(Boolean)))
  const picks = Object.fromEntries(Object.entries(roster.picks ?? {}).map(([key, p]) => [key, { ...p, first: p.first.filter(id => visible.has(id)), backup: p.backup.filter(id => visible.has(id)) }]))
  return { ...roster, mode: full ? 'full' : 'compact', workers, picks,
    ...(!full ? { catalog: { as_of: roster.catalog.as_of, stale_after_days: roster.catalog.stale_after_days, warnings: roster.catalog.warnings } } : {}) }
}

function inputs(model) {
  const input = model.capabilities.input
  const yes = modalities.filter(k => input[k] === true), unknown = modalities.filter(k => input[k] === 'unknown')
  return (yes.join(',') || 'none confirmed') + (unknown.length ? '; unknown=' + unknown.join(',') : '')
}

export function rosterText(roster) {
  const full = roster.mode === 'full'
  const output = ['Default bro: ' + roster.defaultWorker + ' · ' + roster.mode, ...roster.rules.map(r => 'Rule: ' + line(r))]
  for (const w of roster.workers) {
    if (!w.allowed) { output.push(w.id + ' · NOT ALLOWED / 不允许'); continue }
    const defaultModel = w.defaultBlocked ? 'hidden; choose a visible default' : w.defaultModel || 'CLI default'
    output.push(w.id + ' · ' + w.cli + '/' + w.capability + ' · login=' + w.loginStatus + ' · default=' + defaultModel + '/' + (w.defaultEffort || 'CLI default') + (w.defaultFolded ? ' (older; --full)' : ''))
    if (w.efforts?.length) output.push('  Default-model efforts: ' + w.efforts.join(','))
    if (w.note) output.push('  Note: ' + line(w.note))
    for (const rule of w.rules ?? []) if (!roster.rules.includes(rule)) output.push('  Rule: ' + line(rule))
    for (const m of w.models) {
      const c = m.catalog, summary = full ? c?.summary?.en || c?.summary?.zh : c?.summary
      output.push('  ' + m.id + ' · input=' + inputs(m) + ' · ' + ([c?.tier, c?.grade].filter(Boolean).join('/') || 'unrated') + ' · effort=' + (m.efforts?.join(',') || 'unknown') + (m.fast ? ' · fast available' : '') +
        (m.variantCount ? ' · ' + m.variantCount + ' variants' : '') + (summary ? ' · ' + line(summary) : '') + (c?.stale ? ' · STALE ' + c.as_of + '; refresh catalog' : ''))
      if (full) {
        const cap = m.capabilities
        output.push('    Context: ' + cap.context_tokens + ' (' + cap.sources.context_tokens + ') · Max output: ' + cap.max_output_tokens + ' (' + cap.sources.max_output_tokens + ')')
      }
    }
    if (w.olderModels) output.push('  Older/superseded: ' + w.olderModels + ' model families folded; use --full')
    for (const warning of w.warnings ?? []) output.push('  Notice: ' + line(warning))
  }
  for (const [key, pick] of Object.entries(roster.picks)) if (pick.first.length || pick.backup.length) output.push('Pick ' + key + ': ' + pick.first.join(',') + (pick.backup.length ? ' / backup=' + pick.backup.join(',') : '') + (pick.note ? ' · ' + line(pick.note) : ''))
  if (roster.effort_advice) output.push('Effort advice: ' + line(roster.effort_advice))
  for (const warning of roster.catalog.warnings ?? []) output.push('Notice: ' + line(warning))
  if (!full) output.push('Details: roster --full [--json]; one bro: roster --worker ID [--full] [--json]')
  return output.join('\n')
}
