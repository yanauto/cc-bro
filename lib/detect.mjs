import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { executable, inspectCommand, inspectRpc } from './cli-process.mjs'

const value = v => typeof v === 'string' && v.length < 300 ? v : null
function settings(path) { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return {} } }

export const builtins = {
  codex: { cli: 'codex', capability: 'full', steering: 'inject', cache: true, login: 'codex login', install: 'npm install -g @openai/codex', upgrade: 'npm install -g @openai/codex@latest' },
  pi: { cli: 'pi', capability: 'full', steering: 'inject', cache: true, login: 'pi', loginHint: 'Use /login, then choose the provider.', install: 'npm install -g @earendil-works/pi-coding-agent', upgrade: 'npm install -g @earendil-works/pi-coding-agent@latest' },
  agy: { cli: 'agy', capability: 'full', steering: 'queue', cache: true, login: 'agy', loginHint: 'Complete the CLI sign-in flow.', install: 'curl -fsSL https://antigravity.google/cli/install.sh | bash -s -- --skip-aliases --skip-path', upgrade: 'agy update' },
  'cursor-agent': { cli: 'cursor-agent', capability: 'full', steering: 'queue', cache: false, login: 'cursor-agent login', install: 'curl -fsSL https://cursor.com/install | bash', upgrade: 'cursor-agent update' }
}

export const cliActions = {
  ...builtins,
  gemini: { login: 'gemini', loginHint: 'Sign in inside Gemini CLI.', install: 'npm install -g @google/gemini-cli', upgrade: 'npm install -g @google/gemini-cli@latest' },
  opencode: { login: 'opencode auth login', install: 'curl -fsSL https://opencode.ai/install | bash', upgrade: 'curl -fsSL https://opencode.ai/install | bash' }
}

export async function detectCli(id, cwd) {
  const cli = id.startsWith('pi:') ? 'pi' : id
  const base = { ...builtins[cli], cli, installed: !!executable(cli), version: null, loginStatus: 'unknown', models: [], defaultModel: null, defaultEffort: null, efforts: [], source: 'CLI inspection', warnings: [] }
  if (!base.installed) return { ...base, loginStatus: 'not-installed' }
  const version = await inspectCommand(cli, ['--version'], cwd)
  base.version = version.ok ? value(version.text.trim().split('\n')[0]) : null
  try {
    if (cli === 'codex') {
      await inspectRpc(cli, ['app-server'], cwd, async (request, send) => {
        await request('initialize', { clientInfo: { name: 'cc-bro-roster', version: '0.3.1' }, capabilities: {} })
        send({ method: 'initialized' })
        let cursor = null
        do {
          const page = await request('model/list', { limit: 100, cursor })
          base.models.push(...(page.data ?? []).filter(m => !m.hidden).map(m => ({ input: m.inputModalities, contextWindow: m.contextWindow, maxTokens: m.maxOutputTokens, id: m.model, name: m.displayName, efforts: (m.supportedReasoningEfforts ?? []).map(e => e.reasoningEffort), defaultEffort: m.defaultReasoningEffort, isDefault: m.isDefault })))
          cursor = page.nextCursor
        } while (cursor)
        const { config } = await request('config/read', { cwd, includeLayers: false })
        base.defaultModel = value(config?.model) ?? base.models.find(m => m.isDefault)?.id ?? null
        base.defaultEffort = value(config?.model_reasoning_effort) ?? base.models.find(m => m.id === base.defaultModel)?.defaultEffort ?? null
        const account = await request('account/read', { refreshToken: false })
        base.loginStatus = account.account ? 'ready' : account.requiresOpenaiAuth === false ? 'not-required' : 'signed-out'
        base.efforts = base.models.find(m => m.id === base.defaultModel)?.efforts ?? []
      })
    } else if (cli === 'pi') {
      const provider = id.slice(3)
      await inspectRpc(cli, ['--mode', 'rpc', '--models', provider + '/*', '--no-session', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-approve', '--offline'], cwd, async request => {
        const state = await request('get_state')
        const models = await request('get_available_models')
        base.models = (models.models ?? []).filter(m => m.provider === provider).map(m => ({ input: m.input, contextWindow: m.contextWindow, maxTokens: m.maxTokens, id: provider + '/' + m.id, name: m.name, efforts: m.reasoning ? [] : ['off'] }))
        base.defaultModel = state.model?.provider === provider ? provider + '/' + state.model.id : null
        base.defaultEffort = value(state.thinkingLevel)
        const thinking = await request('get_available_thinking_levels').catch(() => null)
        base.efforts = thinking?.levels ?? base.models.find(m => m.id === base.defaultModel)?.efforts ?? []
      }, 'pi')
      const auth = await inspectCommand(cli, ['auth', 'check', '--no-refresh', '--json', '--provider', provider], cwd)
      if (auth.ok) { const a = JSON.parse(auth.text); base.loginStatus = ['ready', 'expired', 'missing', 'unavailable'].includes(a.status) ? a.status : 'unknown' }
      base.credentialFilePresent = existsSync(join(process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'), 'auth.json'))
    } else if (cli === 'agy') {
      const models = await inspectCommand(cli, ['models'], cwd)
      base.models = models.text.split('\n').filter(l => /^\S+\t/.test(l)).map(l => { const [id, name] = l.split('\t'); return { id, name, efforts: [] } })
      base.loginStatus = models.ok && base.models.length ? 'ready' : 'unknown'
      const effort = await inspectCommand(cli, ['-p', '/effort', '--output-format', 'json'], cwd)
      if (effort.ok) { const e = JSON.parse(effort.text).command?.data; base.defaultEffort = value(e?.current); base.efforts = e?.available ?? [] }
      const model = await inspectCommand(cli, ['-p', '/model', '--output-format', 'json'], cwd)
      if (model.ok) base.defaultModel = value(JSON.parse(model.text).command?.data?.id)
      base.source = 'agy models and read-only /model, /effort'
    } else if (cli === 'cursor-agent') {
      const models = await inspectCommand(cli, ['--list-models'], cwd)
      base.models = models.text.split('\n').map(l => /^(\S+) - (.+)$/.exec(l.trim())).filter(Boolean).map(([, id, name]) => ({ id, name, efforts: [], isDefault: name.includes('(default)') }))
      base.defaultModel = base.models.find(m => m.isDefault)?.id ?? null
      const s = settings(join(process.env.CURSOR_CONFIG_DIR || join(homedir(), '.cursor'), 'cli-config.json'))
      base.defaultModel = value(s.model?.modelId) ?? value(s.model) ?? base.defaultModel
      base.defaultEffort = value(s.model?.effort) ?? /-(none|minimal|low|medium|high|xhigh|max)(?:-fast)?$/.exec(base.defaultModel ?? '')?.[1] ?? null
      base.efforts = [...new Set(base.models.flatMap(m => { const level = /-(none|minimal|low|medium|high|xhigh|max)(?:-fast)?$/.exec(m.id)?.[1]; return level ? [level] : [] }))]
      const auth = await inspectCommand(cli, ['status'], cwd)
      base.loginStatus = /not logged|not authenticated/i.test(auth.text) ? 'signed-out' : auth.ok && /logged in|authenticated/i.test(auth.text) ? 'ready' : 'unknown'
      base.source = 'cursor-agent models/status; public settings model'
      base.warnings.push('Cursor --effort selects an exact listed model variant when available; otherwise it uses a [effort=...] override, which the selected model must support.')
    }
  } catch { base.warnings.push('Some inspection commands are unavailable. Unknown values are not a sign-in failure.') }
  return base
}

export async function discoverPi(cwd) {
  if (!executable('pi')) return []
  const listed = await inspectCommand('pi', ['--list-models', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-approve', '--offline'], cwd)
  return [...new Set(listed.text.split('\n').map(line => /^([a-z0-9][a-z0-9_.-]*)\s+\S+\s+[0-9.]+[KM]?\s+[0-9.]+[KM]?\s+(?:yes|no)\s+(?:yes|no)\s*$/.exec(line)?.[1]).filter(Boolean))].map(p => 'pi:' + p)
}
