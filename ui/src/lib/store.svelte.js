import { createRealApi } from './api.js'
export const api = createRealApi()
function parseRoute() {
  const h = decodeURIComponent(location.hash.slice(1))
  if (h.startsWith('p-')) return { name: 'board', id: h.slice(2) }
  return { name: 'home' }
}

export const app = $state({
  route: parseRoute(),
  projects: [], projectsLoaded: false, tickets: {}, ticketsLoaded: {},
  connected: true, everConnected: false, toast: null, now: Date.now()
})

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

let started = false
export function start() {
  if (started) return
  started = true
  addEventListener('hashchange', () => {
    app.route = parseRoute()
    if (app.route.name === 'board' && !app.tickets[app.route.id]) loadTickets(app.route.id)
  })
  setInterval(() => { app.now = Date.now() }, 1000)
  loadProjects()
  if (app.route.name === 'board') loadTickets(app.route.id)
  api.subscribe(handle, ok => {
    if (ok && !app.connected) {
      loadProjects()
      if (app.route.name === 'board') loadTickets(app.route.id)
    }
    app.connected = ok
    if (ok) app.everConnected = true
  })
}
