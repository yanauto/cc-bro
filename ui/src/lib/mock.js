const now = () => new Date().toISOString()
const minutesAgo = m => new Date(Date.now() - m * 60000).toISOString()

const activities = [
  'Reading src/routes/auth.ts',
  'Running npm test',
  'Editing lib/session.js',
  'Searching for "retryPolicy"',
  'Writing test/upload.test.mjs',
  'Thinking',
  'Running git diff --stat'
]

function ticket(id, title, status, model, opts = {}) {
  return {
    id, title, status, model,
    flag: opts.flag ?? null,
    activity: status === 'working' ? activities[Math.floor(Math.random() * activities.length)] : null,
    turn: opts.turn ?? 1,
    createdAt: minutesAgo(opts.age ?? 40),
    updatedAt: minutesAgo(opts.updated ?? 2),
    startedAt: status === 'working' ? minutesAgo(opts.started ?? 3) : null,
    elapsedMs: (opts.elapsed ?? 4) * 60000
  }
}

function seed() {
  const projects = [
    { id: 'shop-api', name: 'shop-api', repoPath: '/Users/demo/code/shop-api', roomPath: '/Users/demo/cc-bro/shop-api', updatedAt: minutesAgo(1) },
    { id: 'landing', name: 'landing-site', repoPath: '/Users/demo/code/landing-site', roomPath: '/Users/demo/cc-bro/landing-site', updatedAt: minutesAgo(26) },
    { id: 'ml-notebooks', name: 'ml-notebooks', repoPath: '/Users/demo/research/ml-notebooks', roomPath: '/Users/demo/cc-bro/ml-notebooks', updatedAt: minutesAgo(60 * 30) }
  ]
  const tickets = {
    'shop-api': [
      ticket('t1', 'Add retry to payment webhook', 'working', 'deepseek/deepseek-flash', { started: 4, turn: 2 }),
      ticket('t2', 'Find why upload test is flaky', 'working', 'openai-codex/gpt-6-astra', { started: 11 }),
      ticket('t3', 'Review t1 with a second model', 'queued', 'zai/glm-5'),
      ticket('t4', 'Map the auth module for the brief', 'review', 'deepseek/deepseek-flash', { elapsed: 6 }),
      ticket('t5', 'Bump Node to 24 in CI', 'review', 'deepseek/deepseek-flash', { flag: 'error', elapsed: 2 }),
      ticket('t6', 'Remove dead feature flags', 'done', 'deepseek/deepseek-flash', { elapsed: 9, updated: 50 }),
      ticket('t7', 'Rename OrderItem to LineItem', 'done', 'openai-codex/gpt-6-astra', { elapsed: 17, updated: 90, turn: 3 }),
      ticket('t8', 'Draft changelog for 2.4', 'queued', 'deepseek/deepseek-flash')
    ],
    landing: [
      ticket('l1', 'Make hero image load faster', 'review', 'deepseek/deepseek-flash', { elapsed: 5 }),
      ticket('l2', 'Fix mobile nav overlap', 'done', 'deepseek/deepseek-flash', { elapsed: 3, updated: 120 }),
      ticket('l3', 'Translate pricing page', 'working', 'zai/glm-5', { started: 2, flag: null })
    ],
    'ml-notebooks': [
      ticket('m1', 'Clean up data loading cell', 'done', 'deepseek/deepseek-flash', { elapsed: 8, updated: 60 * 30 }),
      ticket('m2', 'Pin numpy version', 'review', 'deepseek/deepseek-flash', { flag: 'stopped', elapsed: 1, updated: 60 * 31 })
    ]
  }
  return { projects, tickets }
}

function counts(list) {
  const c = { queued: 0, working: 0, review: 0, done: 0 }
  for (const t of list) c[t.status]++
  return c
}

function attention(list) {
  return list.filter(t => t.status === 'review' || t.flag).length
}

const replies = {
  review: 'Done. The auth module has three parts:\n\n1. `routes/auth.ts` — login, logout, refresh\n2. `lib/session.js` — cookie sessions, 14-day expiry\n3. `lib/oauth/` — GitHub and Google providers\n\nTests: 42 passing. I did not change any code.',
  error: 'The CI run failed: `actions/setup-node@v4` does not accept `node-version: 24.x` on the self-hosted runner. I stopped there.',
  done: 'Removed 6 flags that were always on. All tests pass. Diff: 4 files, -118 lines.'
}

const catalog = [
  { id: 'anthropic', name: 'Anthropic', source: 'builtin', methods: ['oauth', 'api_key'], credential: null, baseUrl: null, api: null, modelCount: 3 },
  { id: 'openai', name: 'OpenAI', source: 'builtin', methods: ['api_key'], credential: null, baseUrl: null, api: null, modelCount: 4 },
  { id: 'github-copilot', name: 'GitHub Copilot', source: 'builtin', methods: ['oauth'], credential: null, baseUrl: null, api: null, modelCount: 6 },
  { id: 'openrouter', name: 'OpenRouter', source: 'builtin', methods: ['oauth', 'api_key'], credential: null, baseUrl: null, api: null, modelCount: 40 },
  { id: 'google', name: 'Google Gemini', source: 'builtin', methods: ['api_key'], credential: null, baseUrl: null, api: null, modelCount: 3 },
  { id: 'xai', name: 'xAI', source: 'builtin', methods: ['oauth', 'api_key'], credential: null, baseUrl: null, api: null, modelCount: 2 },
  { id: 'moonshot', name: 'Moonshot (Kimi)', source: 'builtin', methods: ['api_key'], credential: null, baseUrl: null, api: null, modelCount: 2 },
  { id: 'minimax', name: 'MiniMax', source: 'builtin', methods: ['api_key'], credential: null, baseUrl: null, api: null, modelCount: 2 },
  { id: 'mistral', name: 'Mistral', source: 'builtin', methods: ['api_key'], credential: null, baseUrl: null, api: null, modelCount: 3 }
]

function catalogModels(provider) {
  const names = { anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'], openai: ['gpt-6', 'gpt-6-mini', 'o7', 'o7-mini'], 'github-copilot': ['gpt-6', 'claude-sonnet-5-5'], openrouter: ['auto'], google: ['gemini-3.8-pro', 'gemini-3.8-flash'], xai: ['grok-5'], moonshot: ['kimi-k3'], minimax: ['minimax-m3'], mistral: ['devstral-3'] }[provider] || ['default']
  return names.map(n => ({ id: provider + '/' + n, provider, name: n, ready: true, reasoning: true, contextWindow: 200000 }))
}

function mockPi() {
  const fresh = new URLSearchParams(location.search).has('fresh') || new URLSearchParams(location.search).has('nomodels')
  const providers = [
    { id: 'deepseek', name: 'DeepSeek', source: 'builtin', methods: ['api_key'], credential: fresh ? null : { kind: 'api_key', hint: 'sk-…3f9a' }, baseUrl: null, api: null, modelCount: 2 },
    { id: 'openai-codex', name: 'ChatGPT (Codex)', source: 'builtin', methods: ['oauth'], credential: fresh ? null : { kind: 'oauth', hint: 'demo@example.com' }, baseUrl: null, api: null, modelCount: 2 },
    { id: 'zai', name: 'Z.ai (GLM)', source: 'builtin', methods: ['api_key'], credential: fresh ? null : { kind: 'env', hint: 'ZAI_API_KEY' }, baseUrl: null, api: null, modelCount: 2 },
    { id: 'local', name: 'Local Ollama', source: 'custom', methods: ['api_key'], credential: fresh ? null : { kind: 'api_key', hint: 'none' }, baseUrl: 'http://localhost:11434/v1', api: 'openai-completions', modelCount: 1 }
  ]
  const models = [
    { id: 'deepseek/deepseek-flash', provider: 'deepseek', name: 'DeepSeek Flash', reasoning: true, contextWindow: 128000 },
    { id: 'deepseek/deepseek-v4-pro', provider: 'deepseek', name: 'DeepSeek V4 Pro', reasoning: true, contextWindow: 128000 },
    { id: 'openai-codex/gpt-6-astra', provider: 'openai-codex', name: 'GPT-6 Astra', reasoning: true, contextWindow: 400000 },
    { id: 'openai-codex/gpt-6-astra-mini', provider: 'openai-codex', name: 'GPT-6 Astra mini', reasoning: true, contextWindow: 400000 },
    { id: 'zai/glm-5', provider: 'zai', name: 'GLM-5', reasoning: true, contextWindow: 200000 },
    { id: 'zai/glm-5.3-flash', provider: 'zai', name: 'GLM-5.3 Flash', reasoning: false, contextWindow: 200000 },
    { id: 'local/qwen3-coder', provider: 'local', name: 'qwen3-coder', reasoning: false, contextWindow: 32768 }
  ].map(m => ({ ...m, ready: !fresh }))
  for (const c of catalog) {
    providers.push({ ...c })
    models.push(...catalogModels(c.id).map(m => ({ ...m, ready: false })))
  }
  for (const p of providers) p.modelCount = models.filter(m => m.provider === p.id).length
  return {
    agentDir: '/Users/demo/.pi/agent',
    files: [
      { name: 'settings.json', path: '/Users/demo/.pi/agent/settings.json', exists: true, error: null },
      { name: 'auth.json', path: '/Users/demo/.pi/agent/auth.json', exists: !fresh, error: null },
      { name: 'models.json', path: '/Users/demo/.pi/agent/models.json', exists: !fresh, error: new URLSearchParams(location.search).has('broken') ? 'Unexpected token } in JSON at line 14' : null }
    ],
    defaultModel: fresh ? null : 'deepseek/deepseek-flash',
    defaultThinking: fresh ? null : 'medium',
    enabledModels: fresh ? null : ['deepseek/deepseek-flash', 'openai-codex/gpt-6-astra', 'zai/glm-5'],
    providers,
    models,
    problems: new URLSearchParams(location.search).has('broken') ? ['models.json could not be read, so custom providers are missing.'] : []
  }
}

export function createMockApi() {
  const db = seed()
  let listener = () => {}
  const enrich = p => ({ ...p, counts: counts(db.tickets[p.id] || []), attention: attention(db.tickets[p.id] || []) })
  const env = {
    platform: 'darwin',
    node: { ok: true, version: '26.11.1', required: '>=24' },
    pi: { installed: true, ok: true, version: '1.4.0', required: '>=1.4.0', path: '/opt/homebrew/bin/pi' },
    claude: { installed: true, version: '3.2.0', path: '/usr/local/bin/claude' },
    models: [
      { id: 'deepseek/deepseek-flash', provider: 'deepseek', ready: true },
      { id: 'openai-codex/gpt-6-astra', provider: 'openai-codex', ready: true },
      { id: 'zai/glm-5', provider: 'zai', ready: true }
    ],
    ready: true
  }
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const settings = { roomRoot: '/Users/demo/cc-bro', defaultRoomRoot: '/Users/demo/cc-bro', client: 'terminal', desktopSupported: false, worker: { kind: 'pi', model: null, thinking: null, concurrency: 3 } }
  const pi = mockPi()
  const jobs = {}
  const syncEnv = () => {
    env.models = pi.models.filter(m => m.ready).map(m => ({ id: m.id, provider: m.provider, ready: true }))
    env.ready = env.pi.ok && env.node.ok && env.claude.installed && env.models.length > 0
    listener({ type: 'env', env: structuredClone(env) })
  }
  const emitPi = () => { pi.models.forEach(m => { m.ready = !!pi.providers.find(p => p.id === m.provider)?.credential }); listener({ type: 'pi', pi: structuredClone(pi) }); syncEnv() }
  const emitJob = job => listener({ type: 'job', job: structuredClone(job) })
  if (new URLSearchParams(location.search).has('noroot')) {
    settings.roomRoot = null
    db.projects = []
  }
  if (new URLSearchParams(location.search).has('nomodels')) {
    env.models = []
    env.ready = false
  }
  if (new URLSearchParams(location.search).has('fresh')) {
    Object.assign(env.pi, { installed: false, ok: false, version: null, path: null })
    env.models = []
    env.ready = false
    settings.roomRoot = null
    db.projects = []
  }

  function emitTicket(pid, t) {
    listener({ type: 'ticket', projectId: pid, ticket: { ...t } })
    const p = db.projects.find(x => x.id === pid)
    if (p) {
      p.updatedAt = now()
      listener({ type: 'project', project: enrich(p) })
    }
  }

  function tick() {
    const pid = db.projects[Math.floor(Math.random() * 2)].id
    const list = db.tickets[pid]
    const roll = Math.random()
    const working = list.filter(t => t.status === 'working')
    if (roll < 0.45 && working.length) {
      const t = working[Math.floor(Math.random() * working.length)]
      t.activity = activities[Math.floor(Math.random() * activities.length)]
      t.updatedAt = now()
      emitTicket(pid, t)
      return
    }
    const order = ['queued', 'working', 'review']
    const movable = list.filter(t => order.includes(t.status) && !t.flag)
    if (!movable.length) return
    const t = movable[Math.floor(Math.random() * movable.length)]
    const next = { queued: 'working', working: 'review', review: Math.random() < 0.7 ? 'done' : 'working' }[t.status]
    if (t.status === 'review' && next === 'working') t.turn++
    t.status = next
    t.updatedAt = now()
    t.startedAt = next === 'working' ? now() : null
    t.activity = next === 'working' ? 'Starting' : null
    emitTicket(pid, t)
    if (list.filter(x => x.status !== 'done').length < 3) {
      const id = 'n' + Math.random().toString(36).slice(2, 7)
      const titles = ['Write tests for coupon rules', 'Check bundle size', 'Explain the cache layer', 'Fix typo in README', 'Profile slow search query']
      const nt = ticket(id, titles[Math.floor(Math.random() * titles.length)], 'queued', 'deepseek/deepseek-flash', { age: 0, updated: 0 })
      list.push(nt)
      emitTicket(pid, nt)
    }
  }

  let timer = null

  function finishLogin(job) {
    if (job.state !== 'running') return
    const p = pi.providers.find(x => x.id === job.provider)
    p.credential = { kind: 'oauth', hint: 'demo@example.com' }
    job.state = 'done'
    job.log.push('Logged in')
    emitPi()
    emitJob(job)
  }

  return {
    mock: true,
    async getEnv() { await wait(150); return structuredClone(env) },
    async installPi() {
      const job = { id: 'job1', kind: 'install-pi', state: 'running', log: ['$ npm install -g @earendil-works/pi-coding-agent'] }
      const steps = ['added 214 packages in 9s', 'pi 1.4.0 installed at /opt/homebrew/bin/pi']
      steps.forEach((line, i) => setTimeout(() => {
        job.log.push(line)
        if (i === steps.length - 1) {
          job.state = 'done'
          Object.assign(env.pi, { installed: true, ok: true, version: '1.4.0', path: '/opt/homebrew/bin/pi' })
        }
        listener({ type: 'job', job: structuredClone(job) })
      }, 900 * (i + 1)))
      return structuredClone(job)
    },
    async getJob(id) { return structuredClone(jobs[id] || { id: 'job1', kind: 'install-pi', state: 'running', log: [] }) },
    async login() {
      await wait(200)
      setTimeout(() => {
        env.models = [{ id: 'deepseek/deepseek-flash', provider: 'deepseek', ready: true }]
        env.ready = env.pi.ok && env.node.ok && env.claude.installed
        listener({ type: 'env', env: structuredClone(env) })
      }, 1500)
      return { ok: true }
    },
    async listProjects() { await wait(120); return db.projects.map(enrich).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) },
    async pickFolder(signal) { await wait(700); if (signal?.aborted) throw new Error('aborted'); return { path: '/Users/demo/code/new-thing' } },
    async createProject(repoPath) {
      await wait(300)
      const name = repoPath.split(/[\\/]/).filter(Boolean).pop()
      let p = db.projects.find(x => x.repoPath === repoPath)
      if (!settings.roomRoot) { const e = new Error('Choose where manager rooms live first.'); e.code = 'room-root-unset'; throw e }
      if (!p) {
        p = { id: name, name, repoPath, roomPath: `${settings.roomRoot}/${name}`, updatedAt: now() }
        db.projects.unshift(p)
        db.tickets[p.id] = []
      }
      listener({ type: 'project', project: enrich(p) })
      return enrich(p)
    },
    async removeProject(id) {
      await wait(200)
      db.projects = db.projects.filter(p => p.id !== id)
      listener({ type: 'project-removed', projectId: id })
      return { ok: true }
    },
    async openChat(id, client) {
      await wait(250)
      const p = db.projects.find(x => x.id === id)
      if ((client || settings.client) === 'desktop' && !settings.desktopSupported) return { ok: false, code: 'desktop-unsupported', roomPath: p?.roomPath }
      return { ok: true }
    },
    async reveal() { await wait(150); return { ok: true } },
    async getSettings() { await wait(100); return structuredClone(settings) },
    async saveSettings(patch) {
      await wait(200)
      if (patch.worker?.model && !pi.models.find(m => m.id === patch.worker.model && m.ready)) { const e = new Error('That model is not ready in pi.'); e.code = 'model-not-ready'; throw e }
      const { worker, ...rest } = patch
      Object.assign(settings, rest)
      if (worker) settings.worker = { ...settings.worker, ...worker }
      if (patch.roomRoot) for (const p of db.projects) p.roomPath = `${patch.roomRoot}/${p.name}`
      listener({ type: 'settings', settings: structuredClone(settings) })
      return structuredClone(settings)
    },
    async revealRoomRoot() { await wait(150); return { ok: true } },
    async pickRoomRoot(signal) { await wait(600); if (signal?.aborted) throw new Error('aborted'); return { path: '/Users/demo/cc-bro' } },
    async getPi() { await wait(180); return structuredClone(pi) },
    async setKey(id, key) {
      await wait(500)
      const p = pi.providers.find(x => x.id === id)
      if (!p) throw new Error('Unknown provider')
      if (key.trim().length < 8) throw new Error('pi did not accept this key. Check it and try again.')
      p.credential = { kind: 'api_key', hint: key.trim().slice(0, 3) + '…' + key.trim().slice(-4) }
      emitPi()
      return structuredClone(p)
    },
    async startLogin(id) {
      await wait(300)
      const device = new URLSearchParams(location.search).has('device')
      const job = { id: 'login-' + id + '-' + Date.now(), kind: 'login', provider: id, state: 'running', log: ['Starting ' + id + ' login'] }
      jobs[job.id] = job
      setTimeout(() => {
        if (job.state !== 'running') return
        job.auth = device ? { verificationUri: 'https://github.com/login/device', userCode: 'WDJB-MJHT' } : { url: 'https://auth.openai.com/oauth/authorize?client_id=app_EMoamEEZ73f0CkXaXp7hrann&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&scope=openid+profile+email+offline_access&code_challenge=Xq3', instructions: null }
        job.log.push('Waiting for the browser')
        emitJob(job)
      }, 700)
      if (new URLSearchParams(location.search).has('paste')) setTimeout(() => {
        if (job.state !== 'running') return
        job.state = 'waiting'
        job.prompt = { message: 'Paste the final redirect URL or authorization code', placeholder: 'http://localhost:1455/auth/callback?code=…', options: null }
        emitJob(job)
      }, 2500)
      else setTimeout(() => finishLogin(job), 6000)
      return structuredClone(job)
    },
    async answerJob(jid, value) {
      await wait(300)
      const job = jobs[jid]
      job.prompt = undefined
      job.state = 'running'
      job.log.push('Got the code')
      setTimeout(() => finishLogin(job), 900)
      return structuredClone(job)
    },
    async cancelJob(jid) {
      const job = jobs[jid]
      if (job && (job.state === 'running' || job.state === 'waiting')) { job.state = 'cancelled'; job.prompt = undefined; emitJob(job) }
      return structuredClone(job)
    },
    async removeCredential(id) {
      await wait(250)
      const p = pi.providers.find(x => x.id === id)
      if (p) p.credential = null
      emitPi()
      return { ok: true }
    },
    async addProvider(body) {
      await wait(600)
      if (!/^https?:\/\//.test(body.baseUrl || '')) throw new Error('The address must start with http:// or https://')
      pi.providers = pi.providers.filter(p => p.id !== body.id)
      pi.models = pi.models.filter(m => m.provider !== body.id)
      const p = { id: body.id, name: body.name || body.id, source: 'custom', methods: ['api_key'], credential: body.key ? { kind: 'api_key', hint: body.key.slice(0, 3) + '…' + body.key.slice(-4) } : { kind: 'api_key', hint: 'none' }, baseUrl: body.baseUrl, api: body.api, modelCount: body.models.length }
      pi.providers.push(p)
      pi.models.push(...body.models.map(m => ({ id: body.id + '/' + m.id, provider: body.id, name: m.name || m.id, ready: true, reasoning: !!m.reasoning, contextWindow: m.contextWindow || null })))
      emitPi()
      return structuredClone(p)
    },
    async removeProvider(id) {
      await wait(250)
      pi.providers = pi.providers.filter(p => p.id !== id)
      pi.models = pi.models.filter(m => m.provider !== id)
      emitPi()
      return { ok: true }
    },
    async check(models) {
      await wait(200)
      const list = models || pi.models.filter(m => m.ready).map(m => m.id)
      const job = { id: 'check-' + Date.now(), kind: 'check', state: 'running', log: [], results: [] }
      jobs[job.id] = job
      list.forEach((model, i) => setTimeout(() => {
        if (job.state !== 'running') return
        const bad = model.startsWith('zai/') ? 'Your balance is not enough. Top up at the provider, then check again.' : model.startsWith('local/') ? 'Could not reach http://localhost:11434/v1. Is the server running?' : null
        job.results.push({ model, ok: !bad, ms: bad ? null : 400 + Math.round(Math.random() * 2400), error: bad, at: now() })
        if (job.results.length === list.length) job.state = 'done'
        emitJob(job)
      }, 500 + i * 650 + Math.random() * 400))
      return structuredClone(job)
    },
    async listTickets(id) { await wait(120); return structuredClone(db.tickets[id] || []) },
    async getTicket(id, tid) {
      await wait(150)
      const t = (db.tickets[id] || []).find(x => x.id === tid)
      if (!t) throw new Error('Ticket not found')
      const reply = t.flag === 'error' ? replies.error : t.status === 'done' ? replies.done : t.status === 'review' ? replies.review : null
      const base = new Date(t.createdAt).getTime()
      const timeline = [
        { kind: 'message', summary: 'Manager: ' + t.title },
        { kind: 'tool', summary: 'Read package.json' },
        { kind: 'tool', summary: 'Searched for "webhook"' },
        { kind: 'tool', summary: 'Edited src/payments/webhook.ts' },
        { kind: 'tool', summary: 'Ran npm test — 42 passed' },
        { kind: 'reply', summary: 'Replied to manager' }
      ].map((e, i) => ({ ...e, ts: new Date(base + i * 47000).toISOString() }))
      return { ...structuredClone(t), lastReply: reply, timeline }
    },
    subscribe(onMessage, onStatus) {
      listener = onMessage
      onStatus(true)
      setTimeout(() => onMessage({ type: 'hello', projects: db.projects.map(enrich) }), 50)
      if (!new URLSearchParams(location.search).has('still')) timer = setInterval(tick, 2600)
      return () => { clearInterval(timer); listener = () => {} }
    }
  }
}
