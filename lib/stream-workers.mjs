import { commandTurn, templateTurn } from './templates.mjs'
import { inspectCommand } from './cli-process.mjs'

export function cursorModel(model, effort, catalog = []) {
  if (!effort) return model
  if (model === 'cursor-agent') throw new Error('Choose an explicit Cursor model when selecting effort')
  const match = /^([^\[\]]+)(?:\[([^\[\]]*)\])?$/.exec(model)
  if (!match) throw new Error('Invalid Cursor model override')
  if (!match[2]) {
    const fast = model.endsWith('-fast') ? '-fast' : ''
    const base = model.replace(/-fast$/, '').replace(/-(?:none|minimal|low|medium|high|xhigh|extra-high|max)$/, '')
    const variant = base + '-' + effort + fast
    if (catalog.includes(variant)) return variant
  }
  const options = (match[2]?.split(',') ?? []).filter(s => s && !s.startsWith('effort='))
  return match[1] + '[' + [...options, 'effort=' + effort].join(',') + ']'
}

export async function streamTurn(ctx) {
  if (ctx.provider.startsWith('custom:')) return templateTurn(ctx)
  let reply, completed = false, failure
  const agy = ctx.provider === 'agy'
  let chosen = ctx.model
  if (!agy && ctx.thinking) {
    const listed = await inspectCommand('cursor-agent', ['--list-models'], ctx.cwd)
    const ids = listed.text.split('\n').map(l => /^(\S+) - /.exec(l.trim())?.[1]).filter(Boolean)
    chosen = cursorModel(ctx.model, ctx.thinking, ids)
  }
  const args = [...(agy ? [] : ['--print']), '--output-format', 'stream-json']
  if (ctx.session) args.push(agy ? '--conversation' : '--resume', ctx.session)
  if (ctx.model !== ctx.provider) args.push('--model', chosen)
  if (ctx.thinking) {
    if (agy) args.push('--effort', ctx.thinking)
  }
  if (agy) args.push('--mode', ctx.review ? 'plan' : 'accept-edits', '--disable-slash-commands')
  else args.push('--trust', ...(ctx.review ? ['--mode', 'plan'] : ['--force']))
  args.push(...(agy ? ['--print=' + ctx.text] : ['--', ctx.text]))
  await commandTurn(ctx, ctx.provider, args, '', e => {
    if (agy) {
      if (e.event === 'init') ctx.bind(e.conversation_id, 'stream-json')
      if (e.step_update) {
        const s = e.step_update
        ctx.event(s.state === 'DONE' ? 'tool.completed' : 'tool.started', { step: s.step_index, type: s.step_type }, [s.tool_name || s.step_type, s.state].join(' '))
        const u = s.usage
        if (s.state === 'DONE' && Number.isSafeInteger(u?.cache_read_tokens) && Number.isSafeInteger(u.input_tokens)) ctx.event('usage', { cachedInputTokens: u.cache_read_tokens, inputTokens: u.input_tokens + u.cache_read_tokens }, 'agy reported cache usage')
      }
      if (e.event === 'result') {
        if (e.result?.conversation_id) ctx.bind(e.result.conversation_id, 'stream-json')
        completed = true
        reply = e.result?.response
        if (e.result?.status !== 'SUCCESS') failure = 'agy turn did not succeed'
      }
    } else {
      if (e.session_id) ctx.bind(e.session_id, 'stream-json')
      if (e.type === 'tool_call') {
        const tool = e.tool_call?.name || Object.keys(e.tool_call ?? {}).find(k => k.endsWith('ToolCall')) || 'tool'
        ctx.event(e.subtype === 'completed' ? 'tool.completed' : 'tool.started', { tool }, 'Cursor ' + tool + ' ' + (e.subtype || 'running'))
      }
      if (e.type === 'result') {
        completed = true
        reply = e.result
        if (e.is_error || e.subtype !== 'success') failure = 'Cursor turn did not succeed'
        const u = e.usage
        if (Number.isSafeInteger(u?.cache_read_input_tokens) && Number.isSafeInteger(u.input_tokens)) ctx.event('usage', { cachedInputTokens: u.cache_read_input_tokens, inputTokens: u.input_tokens + u.cache_read_input_tokens + (u.cache_creation_input_tokens ?? 0) }, 'Cursor reported cache usage')
      }
    }
  })
  if (!completed || !reply || failure) throw new Error(failure || 'CLI returned no final result')
  return reply
}
