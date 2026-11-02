async function request(method, path, body, signal) {
  const res = await fetch(path, {
    method,
    signal,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const err = new Error(data?.error?.message || `${res.status} ${res.statusText}`)
    err.code = data?.error?.code
    throw err
  }
  return data
}

export function createRealApi() {
  return {
    mock: false,
    getEnv: () => request('GET', '/api/env'),
    installPi: () => request('POST', '/api/env/install-pi'),
    getJob: id => request('GET', `/api/jobs/${encodeURIComponent(id)}`),
    login: () => request('POST', '/api/env/login'),
    listProjects: () => request('GET', '/api/projects'),
    pickFolder: signal => request('POST', '/api/projects/pick', undefined, signal),
    createProject: repoPath => request('POST', '/api/projects', { repoPath }),
    removeProject: id => request('DELETE', `/api/projects/${encodeURIComponent(id)}`),
    openChat: (id, client) => request('POST', `/api/projects/${encodeURIComponent(id)}/open`, client ? { client } : {}),
    reveal: id => request('POST', `/api/projects/${encodeURIComponent(id)}/reveal`),
    getSettings: () => request('GET', '/api/settings'),
    saveSettings: patch => request('POST', '/api/settings', patch),
    revealRoomRoot: () => request('POST', '/api/settings/reveal-room-root'),
    pickRoomRoot: signal => request('POST', '/api/settings/pick-room-root', undefined, signal),
    getPi: () => request('GET', '/api/pi'),
    setKey: (provider, key) => request('POST', `/api/pi/providers/${encodeURIComponent(provider)}/key`, { key }),
    startLogin: provider => request('POST', `/api/pi/providers/${encodeURIComponent(provider)}/login`),
    removeCredential: provider => request('DELETE', `/api/pi/providers/${encodeURIComponent(provider)}/credential`),
    addProvider: body => request('POST', '/api/pi/providers', body),
    removeProvider: provider => request('DELETE', `/api/pi/providers/${encodeURIComponent(provider)}`),
    check: models => request('POST', '/api/pi/check', models ? { models } : {}),
    answerJob: (id, value) => request('POST', `/api/jobs/${encodeURIComponent(id)}/input`, { value }),
    cancelJob: id => request('DELETE', `/api/jobs/${encodeURIComponent(id)}`),
    listTickets: id => request('GET', `/api/projects/${encodeURIComponent(id)}/tickets`),
    getTicket: (id, tid) => request('GET', `/api/projects/${encodeURIComponent(id)}/tickets/${encodeURIComponent(tid)}`),
    subscribe(onMessage, onStatus) {
      const source = new EventSource('/api/stream')
      source.onmessage = e => {
        try { onMessage(JSON.parse(e.data)) } catch {}
      }
      source.onopen = () => onStatus(true)
      source.onerror = () => onStatus(false)
      return () => source.close()
    }
  }
}
