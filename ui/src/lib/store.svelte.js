import { createRealApi } from './api.js'
import { createMockApi } from './mock.js'

const useMock = new URLSearchParams(location.search).has('mock')
export const api = useMock ? createMockApi() : createRealApi()

function parseRoute() {
  const h = decodeURIComponent(location.hash.slice(1))
  if (h === 'setup') return { name: 'setup' }
  if (h === 'welcome') return { name: 'welcome' }
  if (h === 'settings' || h.startsWith('settings/')) return { name: 'settings', tab: h.split('/')[1] || 'worker' }
  if (h.startsWith('p-')) return { name: 'board', id: h.slice(2) }
  return { name: 'home' }
}

export const app = $state({
  route: parseRoute(),
  env: null,
  envError: null,
  projects: [],
  projectsLoaded: false,
  tickets: {},
  ticketsLoaded: {},
  connected: true,
  everConnected: false,
  jobs: {},
  toast: null,
  now: Date.now(),
  mock: useMock,
  picking: false,
  activeJob: null,
  settings: null,
  desktopHelp: null,
  pickingRoot: false,
  pi: null,
  piError: null,
  checkJob: null,
  checkResults: {},
  providerDialog: null,
  piGuide: false,
  checkPending: []
})

export function onboarded() {
  try { return localStorage.getItem('cc-bro-onboarded') === '1' } catch { return false }
}

export function markOnboarded() {
  try { localStorage.setItem('cc-bro-onboarded', '1') } catch {}
}

export function needsOnboarding() {
  if (!app.env || !app.settings || !app.projectsLoaded) return false
  return !app.env.ready || !app.settings.roomRoot || (app.projects.length === 0 && !onboarded())
}

export async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text)
    toast(message)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch {}
    ta.remove()
    if (ok) toast(message)
    return ok
  }
}

let toastTimer = null
export function toast(message, kind = 'info') {
  app.toast = { message, kind, id: Math.random() }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { app.toast = null }, kind === 'error' ? 6000 : 3200)
}

export function go(hash) {
  if (location.hash.slice(1) === hash) return
  location.hash = hash ? hash : ''
  if (!hash) history.replaceState(null, '', location.pathname + location.search)
  app.route = parseRoute()
}

export function projectHash(id) {
  return 'p-' + encodeURIComponent(id)
}

function upsertProject(p) {
  const i = app.projects.findIndex(x => x.id === p.id)
  if (i >= 0) app.projects[i] = p
  else app.projects.unshift(p)
}

function upsertTicket(pid, t) {
  if (!app.tickets[pid]) return
  const list = app.tickets[pid]
  const i = list.findIndex(x => x.id === t.id)
  if (i >= 0) list[i] = t
  else list.push(t)
}

function handle(msg) {
  switch (msg.type) {
    case 'hello':
      app.projects = msg.projects
      app.projectsLoaded = true
      if (app.route.name === 'board') loadTickets(app.route.id)
      break
    case 'project':
      upsertProject(msg.project)
      break
    case 'project-removed':
      app.projects = app.projects.filter(p => p.id !== msg.projectId)
      delete app.tickets[msg.projectId]
      if (app.route.name === 'board' && app.route.id === msg.projectId) go('')
      break
    case 'ticket':
      upsertTicket(msg.projectId, msg.ticket)
      break
    case 'env':
      app.env = msg.env
      break
    case 'settings':
      app.settings = msg.settings
      break
    case 'job':
      app.jobs[msg.job.id] = msg.job
      if (msg.job.kind === 'install-pi' && msg.job.state !== 'running') refreshEnv()
      if (msg.job.kind === 'login' && msg.job.state === 'done') { refreshPi(); refreshEnv() }
      if (msg.job.kind === 'check') takeCheck(msg.job)
      break
    case 'pi':
      app.pi = msg.pi
      refreshEnv()
      break
  }
}

export async function refreshEnv() {
  try {
    app.env = await api.getEnv()
    app.envError = null
  } catch (e) {
    app.envError = e.message
  }
}

export async function loadProjects() {
  try {
    app.projects = await api.listProjects()
    app.projectsLoaded = true
  } catch (e) {
    toast(e.message, 'error')
  }
}

export async function loadTickets(pid) {
  try {
    app.tickets[pid] = await api.listTickets(pid)
    app.ticketsLoaded[pid] = true
  } catch (e) {
    app.ticketsLoaded[pid] = true
    app.tickets[pid] = app.tickets[pid] || []
    toast(e.message, 'error')
  }
}

let pickAbort = null
export function cancelPick() {
  pickAbort?.abort()
  pickAbort = null
  app.picking = false
}

export async function addProject() {
  pickAbort = new AbortController()
  const signal = pickAbort.signal
  try {
    app.picking = true
    const picked = await api.pickFolder(signal)
    if (signal.aborted) return null
    if (!picked || picked.cancelled) return null
    const project = await api.createProject(picked.path)
    upsertProject(project)
    return project
  } catch (e) {
    if (e.code === 'room-root-unset') go('welcome')
    else if (!signal.aborted) toast(e.message, 'error')
    return null
  } finally {
    if (pickAbort?.signal === signal) pickAbort = null
    app.picking = false
  }
}

export async function openChat(pid, message, client) {
  try {
    const res = await api.openChat(pid, client)
    if (res && res.ok === false) {
      if (res.code === 'desktop-unsupported') {
        const p = app.projects.find(x => x.id === pid)
        app.desktopHelp = { projectId: pid, roomPath: res.roomPath || p?.roomPath || '' }
      } else {
        toast(res.message || res.code || 'Failed', 'error')
      }
      return false
    }
    toast(message)
    return true
  } catch (e) {
    toast(e.message, 'error')
    return false
  }
}

export async function reveal(pid) {
  try {
    await api.reveal(pid)
  } catch (e) {
    toast(e.message, 'error')
  }
}

export async function refreshSettings() {
  try {
    app.settings = await api.getSettings()
  } catch (e) {
    app.settings = app.settings || { roomRoot: null, defaultRoomRoot: '~/cc-bro', client: 'terminal', desktopSupported: false }
  }
}

export async function saveSettings(patch, message) {
  try {
    app.settings = await api.saveSettings(patch)
    if (message) toast(message)
    if (patch.roomRoot) loadProjects()
    return true
  } catch (e) {
    toast(e.message, 'error')
    return false
  }
}

let rootAbort = null
export async function pickRoomRoot() {
  rootAbort?.abort()
  rootAbort = new AbortController()
  const signal = rootAbort.signal
  try {
    app.pickingRoot = true
    const res = await api.pickRoomRoot(signal)
    if (signal.aborted || !res || res.cancelled) return null
    return res.path
  } catch (e) {
    if (!signal.aborted) toast(e.message, 'error')
    return null
  } finally {
    app.pickingRoot = false
  }
}

export async function revealRoomRoot() {
  try {
    await api.revealRoomRoot()
  } catch (e) {
    toast(e.message, 'error')
  }
}

export function cancelPickRoot() {
  rootAbort?.abort()
  app.pickingRoot = false
}

export async function removeProject(pid) {
  try {
    await api.removeProject(pid)
    app.projects = app.projects.filter(p => p.id !== pid)
    go('')
  } catch (e) {
    toast(e.message, 'error')
  }
}

export async function installPi() {
  try {
    const job = await api.installPi()
    app.jobs[job.id] = job
    app.activeJob = job.id
    poll(job.id)
  } catch (e) {
    toast(e.message, 'error')
  }
}

async function poll(id) {
  while (app.jobs[id]?.state === 'running') {
    await new Promise(r => setTimeout(r, 1500))
    if (app.jobs[id]?.state !== 'running') break
    try {
      const job = await api.getJob(id)
      if (job.log.length >= (app.jobs[id]?.log.length || 0) || job.state !== 'running') app.jobs[id] = job
    } catch { break }
  }
  refreshEnv()
}

export async function login(message) {
  try {
    await api.login()
    toast(message)
  } catch (e) {
    toast(e.message, 'error')
  }
}

export async function refreshPi() {
  try {
    app.pi = await api.getPi()
    app.piError = null
  } catch (e) {
    app.piError = e.message
  }
}

function piChanged() {
  refreshPi()
  refreshEnv()
}

export async function setKey(provider, key) {
  try {
    await api.setKey(provider, key)
    piChanged()
    return null
  } catch (e) {
    return e.message
  }
}

export async function addProvider(body) {
  try {
    await api.addProvider(body)
    piChanged()
    return null
  } catch (e) {
    return e.message
  }
}

export async function removeCredential(provider, message) {
  try {
    await api.removeCredential(provider)
    piChanged()
    toast(message)
  } catch (e) {
    toast(e.message, 'error')
  }
}

export async function removeProvider(provider, message) {
  try {
    await api.removeProvider(provider)
    piChanged()
    toast(message)
  } catch (e) {
    toast(e.message, 'error')
  }
}

export async function startLogin(provider) {
  try {
    const job = await api.startLogin(provider)
    app.jobs[job.id] = job
    return job.id
  } catch (e) {
    toast(e.message, 'error')
    return null
  }
}

export async function answerJob(id, value) {
  try {
    app.jobs[id] = await api.answerJob(id, value)
  } catch (e) {
    toast(e.message, 'error')
  }
}

export async function cancelJob(id) {
  try {
    app.jobs[id] = await api.cancelJob(id)
  } catch {}
}

function takeCheck(job) {
  if (job.id !== app.checkJob) return
  for (const r of job.results ?? []) app.checkResults[r.model] = r
  const done = new Set((job.results ?? []).map(r => r.model))
  app.checkPending = job.state === 'running' ? app.checkPending.filter(m => !done.has(m)) : []
}

export async function runCheck(models) {
  app.checkPending = models ?? (app.pi?.models ?? []).filter(m => m.ready).map(m => m.id)
  try {
    const job = await api.check(models)
    app.jobs[job.id] = job
    app.checkJob = job.id
    takeCheck(job)
  } catch (e) {
    app.checkPending = []
    toast(e.message, 'error')
  }
}

let started = false
export function start() {
  if (started) return
  started = true
  addEventListener('hashchange', () => {
    app.route = parseRoute()
    if (app.route.name === 'board' && !app.tickets[app.route.id]) loadTickets(app.route.id)
  })
  setInterval(() => { app.now = Date.now() }, 1000)
  Promise.all([refreshEnv(), refreshSettings(), loadProjects()]).then(() => {
    if (app.route.name === 'home' && needsOnboarding()) go('welcome')
  })
  if (app.route.name === 'board') loadTickets(app.route.id)
  api.subscribe(handle, ok => {
    if (ok && !app.connected) {
      loadProjects()
      refreshEnv()
      refreshSettings()
      if (app.route.name === 'board') loadTickets(app.route.id)
      if (app.route.name === 'settings') refreshPi()
    }
    app.connected = ok
    if (ok) app.everConnected = true
  })
}
