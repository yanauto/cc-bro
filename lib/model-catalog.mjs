import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { home } from './paths.mjs'

export const modalities = ['text', 'image', 'audio', 'video', 'pdf']
export const transportInputs = {
  codex: { text: true, image: true, audio: true, video: false, pdf: false },
  pi: { text: true, image: true, audio: false, video: false, pdf: false },
  agy: { text: true, image: false, audio: false, video: false, pdf: false },
  'cursor-agent': { text: true, image: 'unknown', audio: 'unknown', video: 'unknown', pdf: 'unknown' },
  custom: { text: true, image: 'unknown', audio: 'unknown', video: 'unknown', pdf: 'unknown' }
}

export function modelKey(id) {
  return id.split('/').at(-1).replace(/\[[^\]]*\]$/, '').replace(/(?:-(?:low|medium|high|xhigh|max|fast|thinking))+$/, '')
}

export function hiddenModel(id, hidden = []) {
  return hidden.some(item => item === id || modelKey(item) === modelKey(id))
}

export function matchModel(id, catalog) {
  const exact = catalog.models.find(m => m.id === id || m.aliases?.includes(id))
  if (exact) return exact
  const key = modelKey(id)
  return catalog.models.find(m => m.id === key || m.aliases?.includes(key)) ?? null
}

export function loadCatalog(path = join(home, 'models.json'), now = Date.now()) {
  const catalog = JSON.parse(readFileSync(new URL('./model-catalog.json', import.meta.url), 'utf8'))
  const warnings = []
  if (existsSync(path)) {
    try {
      const extra = JSON.parse(readFileSync(path, 'utf8'))
      if (!extra || !Array.isArray(extra.models) || extra.models.some(m => !m || typeof m.id !== 'string' || !m.id)) throw new Error('Expected models with IDs')
      if (extra.models.some(m => m.aliases !== undefined && (!Array.isArray(m.aliases) || m.aliases.some(id => typeof id !== 'string')) || m.modalities != null && (typeof m.modalities !== 'object' || m.modalities.input !== undefined && (!Array.isArray(m.modalities.input) || m.modalities.input.some(v => !modalities.includes(v)))))) throw new Error('Invalid model metadata')
      if (extra.picks && Object.values(extra.picks).some(p => !p || !Array.isArray(p.first) || !Array.isArray(p.backup))) throw new Error('Invalid model picks')
      if (new Set(extra.models.map(m => m.id)).size !== extra.models.length) throw new Error('Duplicate model IDs')
      for (const entry of extra.models) {
        const i = catalog.models.findIndex(m => m.id === entry.id), old = catalog.models[i] ?? {}
        const merged = { ...old, ...entry, ...((entry.as_of ?? extra.as_of) ? { as_of: entry.as_of ?? extra.as_of } : {}), ...(extra.source ? { source: extra.source } : {}) }
        for (const key of ['summary', 'modalities']) if (entry[key] && typeof entry[key] === 'object') merged[key] = { ...old[key], ...entry[key] }
        if (i === -1) catalog.models.push(merged)
        else catalog.models[i] = merged
      }
      if (extra.picks && typeof extra.picks === 'object') catalog.picks = { ...catalog.picks, ...extra.picks }
      if (typeof extra.effort_advice === 'string') catalog.effort_advice = extra.effort_advice
    } catch { warnings.push('Could not load models.json overrides; using the built-in model catalog.') }
  }
  const age = date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null
    const stamp = Date.parse(date + 'T00:00:00Z')
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date ? Math.max(0, Math.floor((now - stamp) / 86400000)) : null
  }
  catalog.models = catalog.models.map(m => ({ ...m, as_of: m.as_of ?? catalog.as_of, source: m.source ?? catalog.source, age_days: age(m.as_of ?? catalog.as_of), stale: age(m.as_of ?? catalog.as_of) === null || age(m.as_of ?? catalog.as_of) > 60 }))
  return { ...catalog, warnings, stale_after_days: 60 }
}

const limit = n => Number.isSafeInteger(n) && n > 0 ? n : null
export function modelCapabilities(worker, model, description) {
  const kind = worker.startsWith('pi:') ? 'pi' : worker.startsWith('custom:') ? 'custom' : worker
  const transport = transportInputs[kind] ?? transportInputs.custom
  const fallback = description?.modalities ?? {}
  const declared = Array.isArray(model.input) ? model.input : Array.isArray(fallback.input) ? fallback.input : null
  const inputs = Object.fromEntries(modalities.map(type => {
    const canModel = declared ? declared.includes(type) : 'unknown'
    const canCLI = transport[type]
    return [type, canModel === false || canCLI === false ? false : canModel === true && canCLI === true ? true : 'unknown']
  }))
  const context = limit(model.contextWindow), output = limit(model.maxTokens)
  return { input: inputs, cli_input: transport, model_input: declared ?? 'unknown', context_tokens: context ?? limit(fallback.context_tokens) ?? 'unknown', max_output_tokens: output ?? limit(fallback.max_output_tokens) ?? 'unknown',
    sources: { input: Array.isArray(model.input) ? 'cli' : declared ? 'catalog' : 'unknown', context_tokens: context ? 'cli' : limit(fallback.context_tokens) ? 'catalog-api-limit' : 'unknown', max_output_tokens: output ? 'cli' : limit(fallback.max_output_tokens) ? 'catalog-api-limit' : 'unknown' } }
}

export function visiblePicks(catalog, workers) {
  const visible = new Set(workers.flatMap(w => w.allowed ? w.models.map(m => m.catalog?.id).filter(Boolean) : []))
  return Object.fromEntries(Object.entries(catalog.picks ?? {}).map(([key, pick]) => [key, { ...pick, first: (pick.first ?? []).filter(id => visible.has(id)), backup: (pick.backup ?? []).filter(id => visible.has(id)) }]))
}
