export function supportedWorker(id) {
  return typeof id === 'string' && /^(codex|agy|cursor-agent|(?:pi|custom):[a-z0-9][a-z0-9_.-]*)$/.test(id)
}

export const chooseAllow = 'Choose allowed workers with --allow codex,pi:<provider>,agy,cursor-agent,custom:<name> (or a single worker)'
export const chooseDefault = 'Choose a default from the allowed workers with --default-worker'

export function workerPolicy(allow, worker, current) {
  if (allow === undefined && !current?.allow.length) throw new Error(chooseAllow)
  const providers = allow === undefined ? current.allow : [...new Set(allow.split(',').map(v => v.trim()))]
  if (!providers.every(supportedWorker)) throw new Error('Expected codex, pi:<provider>, agy, cursor-agent or custom:<name>')
  const selected = worker ?? (providers.includes(current?.worker) ? current.worker : providers.length === 1 ? providers[0] : null)
  if (!selected) throw new Error(chooseDefault)
  if (!providers.includes(selected)) throw new Error('Default worker must be allowed')
  return { allow: providers, worker: selected }
}
