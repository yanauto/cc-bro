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
    listProjects: () => request('GET', '/api/projects'),
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
