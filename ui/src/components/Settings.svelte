<script>
  import { onMount } from 'svelte'
  import { app, go, toast } from '../lib/store.svelte.js'
  import { request } from '../lib/api.js'
  import { lang } from '../lib/i18n.svelte.js'
  let { scope } = $props()
  let config = $state(null), roster = $state(null), selected = $state('codex'), loading = $state(true), working = $state(''), error = $state('')
  let modelSearch = $state('')
  let savedEntries = $state({})
  let newId = $state(''), templateText = $state(''), trialStatus = $state(''), drafts = $state({}), templateBase = $state('')
  const l = (en, zh) => lang.current === 'zh' ? zh : en
  let entry = $derived(config?.entries[selected] ?? {})
  let detected = $derived(roster?.workers.find(w => w.id === selected))
  let ids = $derived([...new Set([...(roster?.workers.map(w => w.id) ?? []), ...Object.keys(config?.entries ?? {})])])
  let effective = $derived(config?.effective)
  let inheritedEntry = $derived(config?.inherited?.entries?.[selected] ?? {})
  let hiddenModels = $derived(entry.hiddenModels ?? inheritedEntry.hiddenModels ?? [])
  const modelKey = id => id.split('/').at(-1).replace(/\[[^\]]*\]$/, '').replace(/(?:-(?:low|medium|high|xhigh|max|fast|thinking))+$/, '')
  const hidden = id => hiddenModels.some(m => modelKey(m) === modelKey(id))
  function hideModel(id, checked) { set('hiddenModels', checked ? [...new Set([...hiddenModels, modelKey(id)])] : hiddenModels.filter(m => modelKey(m) !== modelKey(id))) }
  let isCustom = $derived(selected.startsWith('custom:'))
  function choose(id, preserve = true) {
    if (preserve && selected.startsWith('custom:') && templateText !== templateBase) drafts[selected] = templateText
    selected = id
    modelSearch = ''
    templateBase = JSON.stringify(config?.entries[id]?.template ?? config?.inherited?.entries?.[id]?.template ?? config?.presets?.[id] ?? {}, null, 2)
    templateText = drafts[id] ?? templateBase
    trialStatus = ''
  }
  async function load() {
    error = ''; loading = true
    try {
      config = await request('GET', '/api/settings/' + scope)
      savedEntries = Object.fromEntries(Object.entries(config.effective?.entries ?? config.entries).map(([id, e]) => [id, { model: e.model, effort: e.effort }]))
      config.allow ??= []; config.worker ??= ''
      drafts = {}
      choose(selected, false)
      roster = await request('GET', '/api/roster/' + scope)
    } catch (e) { error = e.message }
    finally { loading = false }
  }
  onMount(load)
  function set(key, value) { config.entries[selected] = { ...entry, [key]: value } }
  function lines(value) { return value.split('\n').map(s => s.trim()).filter(Boolean) }
  function allow(id, checked) {
    config.allow = checked ? [...config.allow, id] : config.allow.filter(x => x !== id)
    if (!config.allow.includes(config.worker)) config.worker = config.allow[0] ?? ''
  }
  function add() {
    const id = newId.trim()
    if (!/^(?:pi|custom):[a-z0-9][a-z0-9_.-]*$/.test(id)) { error = l('Use pi:provider or custom:name', '请输入 pi:厂商 或 custom:名称'); return }
    config.entries[id] ??= {}
    choose(id); newId = ''; error = ''
  }
  async function save() {
    working = 'save'; error = ''
    try {
      if (isCustom && templateText !== templateBase) drafts[selected] = templateText
      for (const [id, text] of Object.entries(drafts)) if (text.trim() !== '{}') config.entries[id] = { ...config.entries[id], template: JSON.parse(text) }
      config = await request('POST', '/api/settings/' + scope, config)
      savedEntries = Object.fromEntries(Object.entries(config.effective?.entries ?? config.entries).map(([id, e]) => [id, { model: e.model, effort: e.effort }]))
      drafts = {}; choose(selected, false)
      toast(l('Saved. Applies to the next dispatch.', '已保存，下次派活生效。'))
    } catch (e) { error = e.message }
    finally { working = '' }
  }
  async function trial() {
    working = 'test'; error = ''; trialStatus = ''
    try {
      const template = JSON.parse(templateText)
      const result = await request('POST', '/api/templates/' + scope + '/test', { template, model: entry.model, effort: entry.effort })
      set('template', template)
      trialStatus = l('Passed: new session and ID resume. Save within 15 minutes.', '通过：新会话与按 ID 续聊。请在 15 分钟内保存。') + ' ' + result.session
    } catch (e) { error = e.message }
    finally { working = '' }
  }
  async function action(kind) {
    working = kind; error = ''
    try {
      await request('POST', '/api/cli/' + encodeURIComponent(isCustom ? selected : detected.cli) + '/' + kind, { projectId: scope === 'global' ? undefined : scope })
      toast(l('Command opened in Terminal. Refresh detection after it finishes.', '已在终端打开命令，完成后刷新检测。'))
    } catch (e) { error = e.message }
    finally { working = '' }
  }
  async function proposal(id, accept) {
    working = 'note'; error = ''
    try { config = await request('POST', '/api/notes/' + scope + '/' + id, { accept }); toast(l('Proposal updated.', '提议已处理。')) }
    catch (e) { error = e.message }
    finally { working = '' }
  }
</script>

<section class="settings">
  <div class="heading"><div><p class="eyebrow">CC-BRO / {l('YOUR CREW', '你的工人')}</p><h1>{l('Worker settings', '工人配置')}</h1><p>{l('Choose the tools your manager can call. Your CLI keeps its own login and configuration.', '决定经理能调用哪些工具。登录和配置仍由各家 CLI 自己管理。')}</p></div><button class="btn" disabled={loading || !!working} onclick={load}>{loading ? l('Detecting…', '检测中…') : l('Refresh detection', '刷新检测')}</button></div>
  <label class="scope">{l('Settings for', '配置范围')}<select value={scope} onchange={e => go('settings-' + e.currentTarget.value)}><option value="global">{l('Global defaults', '全局默认')}</option>{#each app.projects as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if config}
    <div class="policy panel">
      <div><h2>{l('Dispatch policy', '派单规则')}</h2><p>{l('The allowlist is enforced. Rules are reminders, evaluated by your manager.', '允许名单硬拒；规矩作为提醒，由经理判断。')}</p></div>
      {#if scope !== 'global'}<label class="check"><input type="checkbox" bind:checked={config.inheritPolicy} />{l('Inherit global allowlist and default bro', '继承全局允许名单和默认 bro')}</label>{/if}
      <div class="allowlist">{#each ids as id}<label class="check"><input type="checkbox" checked={(config.inheritPolicy ? effective?.allow ?? [] : config.allow).includes(id)} disabled={config.inheritPolicy} onchange={e => allow(id, e.currentTarget.checked)} />{id}</label>{/each}</div>
      <label>{l('Default bro', '默认 bro')}<select bind:value={config.worker} disabled={config.inheritPolicy}><option value="">{l('None', '无')}</option>{#each config.allow as id}<option value={id}>{id}</option>{/each}</select></label>
      {#if config.inheritPolicy}<p>{l('Effective allowlist', '实际允许名单')}: {effective?.allow?.join(', ')} · {l('Default', '默认')}: {effective?.worker}</p>{/if}
      <label>{l('Rules · one per line', '规矩 · 每行一条')}<textarea rows="3" value={config.rules.join('\n')} oninput={e => config.rules = lines(e.currentTarget.value)} placeholder={l('Use a different bro for reviews.', '审查交给不同的 bro。')}></textarea></label>
      {#if scope !== 'global'}<label class="check"><input type="checkbox" bind:checked={config.rulesOverride} />{l('Replace global rules for this project', '本项目规矩覆盖全局规矩')}</label>{/if}
    </div>
    <div class="workspace">
      <aside class="panel roster"><h2>{l('Workers', '花名册')}</h2>{#each ids as id}<button class:active={id === selected} onclick={() => choose(id)}>{id}<span>{(config.inheritPolicy ? effective?.allow ?? [] : config.allow).includes(id) ? l('Allowed', '已允许') : l('Not allowed', '未允许')}</span></button>{/each}<label>{l('Add provider or custom CLI', '添加厂商或自定义 CLI')}<input bind:value={newId} placeholder="pi:provider / custom:name" /></label><button class="btn" onclick={add}>{l('Add', '添加')}</button></aside>
      <div class="panel editor">
        <div class="worker-title"><h2>{selected}</h2><span class="badge">{isCustom ? l('Degraded · template', '降级 · 模板') : l('Full · native adapter', '全功能 · 原生适配器')}</span></div>
        {#if detected}<dl><div><dt>{l('CLI / version', 'CLI / 版本')}</dt><dd>{detected.cli} · {detected.version || l('Unknown', '未知')}</dd></div><div><dt>{l('Installed / login', '安装 / 登录')}</dt><dd>{detected.installed ? l('Installed', '已安装') : l('Not installed', '未安装')} · {detected.loginStatus}</dd></div><div><dt>{l('Steering / cache', '插话 / 缓存')}</dt><dd>{detected.steering === 'inject' ? l('Current turn', '当前轮注入') : l('Next turn', '下一轮')} · {detected.cache ? l('Reported when available', '接口有值时显示') : l('Not reported', '暂无读数')}</dd></div><div><dt>{l('Detected defaults', '检测到的默认值')}</dt><dd>{detected.detectedModel || l('CLI chooses', '由 CLI 选择')} · {detected.detectedEffort || l('CLI chooses', '由 CLI 选择')}</dd></div></dl>
          <p class="hint">{l('Saved effective defaults', '已保存的生效默认值')}: {savedEntries[selected]?.model || detected.detectedModel || l('CLI chooses', '由 CLI 选择')} · {savedEntries[selected]?.effort || detected.detectedEffort || l('CLI chooses', '由 CLI 选择')}</p>
          {#each detected.warnings as warning}<p class="hint">{warning}</p>{/each}
          {#if detected.install || detected.upgrade || detected.login}<div class="actions"><button class="btn" disabled={!!working || !(detected.installed ? detected.upgrade : detected.install)} onclick={() => action(detected.installed ? 'upgrade' : 'install')}>{detected.installed ? l('Upgrade in Terminal', '在终端升级') : l('Install in Terminal', '在终端安装')}</button><button class="btn" disabled={!!working || !detected.installed || !detected.login} onclick={() => action('login')}>{l('Log in with CLI', '打开 CLI 登录')}</button></div><p class="hint">{detected.loginHint || detected.login}</p>{/if}
        {:else}<p class="hint">{l('Save and refresh to detect this CLI. Custom templates must pass the trial first.', '保存后刷新可检测此 CLI。自定义模板需先试跑通过。')}</p>{/if}
        <div class="two"><label>{l('Model override', '模型覆盖')}<input list="worker-models" value={entry.model ?? ''} oninput={e => set('model', e.currentTarget.value)} placeholder={inheritedEntry.model || detected?.defaultModel || l('Inherit CLI default', '继承 CLI 默认')} /><datalist id="worker-models">{#each detected?.models ?? [] as m}<option value={m.id}>{m.name || m.id}{m.efforts?.length ? ' · ' + m.efforts.join(', ') : ''}</option>{/each}</datalist></label><label>{l('Effort override', '档位覆盖')}<input list="worker-efforts" value={entry.effort ?? ''} oninput={e => set('effort', e.currentTarget.value)} placeholder={inheritedEntry.effort || detected?.defaultEffort || l('Inherit CLI default', '继承 CLI 默认')} /><datalist id="worker-efforts">{#each detected?.efforts ?? [] as effort}<option value={effort}></option>{/each}</datalist></label></div>
        {#if detected?.models.length}<div class="models"><h3>{l('Model visibility', '模型可见性')}</h3><p class="hint">{l('Models are detected automatically. Hide a model family to remove it from the manager’s roster and reject dispatch, including effort/speed variants.', '模型自动检测。隐藏会从经理花名册移除并拒绝派单，包含同系列的档位／速度变体。')}</p><label>{l('Find a model', '查找模型')}<input bind:value={modelSearch} /></label>
          {#if scope !== 'global'}<label class="check"><input type="checkbox" checked={entry.hiddenModels === undefined} onchange={e => { if (e.currentTarget.checked) { const copy = { ...entry }; delete copy.hiddenModels; config.entries[selected] = copy } else set('hiddenModels', [...hiddenModels]) }} />{l('Inherit global model visibility', '继承全局模型隐藏设置')}</label>{/if}
          <div class="model-list">{#each detected.models.filter(m => m.id.toLowerCase().includes(modelSearch.toLowerCase())) as m}<article><label class="check"><input type="checkbox" checked={hidden(m.id)} onchange={e => hideModel(m.id, e.currentTarget.checked)} />{l('Hide', '隐藏')} {m.id}</label>{#if m.catalog}<p>{m.catalog.tier} · {m.catalog.grade} · {lang.current === 'zh' ? m.catalog.summary?.zh : m.catalog.summary?.en}</p>{#if m.catalog.stale}<p class="hint">{l('Description is stale; update catalog.', '简介已过期，请更新目录。')} {m.catalog.as_of}</p>{/if}{/if}<p class="hint">{l('Input', '输入')}: {Object.entries(m.capabilities.input).map(([k,v]) => k + '=' + v).join(' · ')}<br />{l('Context / max output', '上下文／最大输出')}: {m.capabilities.context_tokens} ({m.capabilities.sources.context_tokens}) / {m.capabilities.max_output_tokens} ({m.capabilities.sources.max_output_tokens})</p></article>{/each}</div></div>{/if}
        <label>{l('Your note', '你的备注')}<textarea rows="3" value={entry.note ?? ''} oninput={e => set('note', e.currentTarget.value)} placeholder={inheritedEntry.note || l('What this bro does well; constraints to remember.', '擅长什么，派活时需要记住什么。')}></textarea></label>
        <label>{l('Rules for this bro · one per line', '这个 bro 的规矩 · 每行一条')}<textarea rows="2" value={(entry.rules ?? []).join('\n')} oninput={e => set('rules', lines(e.currentTarget.value))}></textarea></label>
        {#if scope !== 'global' && config.entries[selected]}<button class="subtle" onclick={() => { delete config.entries[selected]; delete drafts[selected]; choose(selected, false) }}>{l('Remove this project override', '移除本项目覆盖')}</button>{/if}
        {#if isCustom}<div class="template"><h3>{l('Command template', '命令模板')}</h3><p>{l('Arguments are JSON arrays, passed directly without a shell. Use {prompt}, {session}, {model}, {effort}, {cwd}. Extract a reply and session ID with dotted JSON paths or text capture groups.', '参数用 JSON 数组，直接执行、不经 shell。支持 {prompt}、{session}、{model}、{effort}、{cwd}。用 JSON 路径或文本捕获组取回复和会话 ID。')}</p><label>{l('Start with a preset', '从预设开始')}<select value="" onchange={e => { templateText = JSON.stringify(config.presets[e.currentTarget.value], null, 2); trialStatus = '' }}><option value="" disabled>{l('Choose a preset…', '选择预设…')}</option>{#each Object.keys(config.presets) as id}<option value={id}>{id}</option>{/each}</select></label><label>{l('Template JSON', '模板 JSON')}<textarea class="code" rows="15" bind:value={templateText} oninput={() => trialStatus = ''}></textarea></label><div class="two"><label>{l('Model choices · one per line', '模型列表 · 每行一条')}<textarea rows="3" value={(entry.models ?? []).join('\n')} oninput={e => set('models', lines(e.currentTarget.value))}></textarea></label><label>{l('Effort choices · one per line', '档位列表 · 每行一条')}<textarea rows="3" value={(entry.efforts ?? []).join('\n')} oninput={e => set('efforts', lines(e.currentTarget.value))}></textarea></label></div><p class="hint">{l('Test runs two real, small prompts in a temporary directory and may use your subscription. It asks the CLI to avoid tools and verifies memory across both turns.', '试跑在临时目录执行两个真实小提示，可能消耗订阅额度；要求 CLI 不使用工具，并验证两轮记忆。')}</p><button class="btn" disabled={!!working} onclick={trial}>{working === 'test' ? l('Testing both turns…', '正在试跑两轮…') : l('Test new session + resume', '试跑新对话＋续聊')}</button>{#if trialStatus}<p class="success" role="status">{trialStatus}</p>{/if}</div>{/if}
      </div>
    </div>
    {#if config.proposals?.length}<div class="panel proposals"><h2>{l('Notes proposed by your manager', '经理提议的备注')}</h2><p>{l('Nothing is written until you accept. Accepting replaces the note for that bro in this scope.', '确认前不会写入。确认会替换此范围内该 bro 的备注。')}</p>{#each config.proposals as p}<article><strong>{p.worker}</strong><p>{p.note}</p><p class="hint">{l('Current note', '现有备注')}: {config.entries[p.worker]?.note || effective?.entries?.[p.worker]?.note || '—'}</p><div class="actions"><button class="btn" disabled={!!working} onclick={() => proposal(p.id, true)}>{l('Accept note', '确认备注')}</button><button class="btn" disabled={!!working} onclick={() => proposal(p.id, false)}>{l('Dismiss', '忽略')}</button></div></article>{/each}</div>{/if}
    <footer class="save"><p>{l('Changes affect the next dispatch. Running turns keep their settings.', '下次派活生效。在跑的这一轮保留原配置。')}</p><button class="btn primary" disabled={!!working} onclick={save}>{working === 'save' ? l('Saving…', '保存中…') : l('Save settings', '保存配置')}</button></footer>
  {/if}
</section>

<style>
  .settings { width:100%; max-width:1180px; margin:auto; padding:32px 24px 60px }
  .heading,.worker-title,.actions,.save { display:flex; align-items:center; justify-content:space-between; gap:16px }
  .heading { align-items:flex-start; margin-bottom:24px }
  h1 { font-size:28px; margin:4px 0 8px; letter-spacing:-.025em } h2 { font-size:18px; margin:0 0 10px } h3 { font-size:16px; margin:0 0 8px }
  p { color:var(--muted); margin:6px 0 16px; line-height:1.6 } .eyebrow { font-size:11px; letter-spacing:.12em; color:var(--accent); margin:0 }
  .panel { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:22px }
  .policy,.proposals { margin:20px 0 } .workspace { display:grid; grid-template-columns:230px minmax(0,1fr); gap:20px; align-items:start }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:16px } label { display:grid; gap:7px; font-size:13px; font-weight:560; margin:16px 0 }
  input:not([type=checkbox]),textarea,select { width:100%; min-width:0; color:var(--fg); background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font:inherit; font-weight:400 }
  input:focus,textarea:focus,select:focus { outline:2px solid var(--accent); outline-offset:2px } textarea { resize:vertical; line-height:1.6 } .code { font:12px/1.6 ui-monospace,monospace; tab-size:2 }
  .scope { max-width:360px } .check { display:flex; align-items:center; gap:8px; margin:6px 0; font-weight:400 } .allowlist { display:flex; flex-wrap:wrap; gap:12px 24px; margin:16px 0 }
  .btn { padding:10px 15px; border:1px solid var(--border); border-radius:8px; font-size:13px; font-weight:600; white-space:nowrap } .btn:hover { background:var(--surface-2) } .btn:disabled { opacity:.5; cursor:wait } .primary { background:var(--accent); color:var(--bg); border-color:var(--accent) } .primary:hover { opacity:.9; background:var(--accent) }
  .roster button:not(.btn) { display:block; width:100%; text-align:left; padding:12px; border-radius:8px; overflow-wrap:anywhere } .roster button span { display:block; font-size:11px; color:var(--muted); margin-top:3px } .roster button.active { background:var(--accent-soft); color:var(--accent) }
  .badge { background:var(--surface-2); font-size:11px; padding:5px 9px; border-radius:20px; white-space:nowrap } .worker-title h2 { margin:0; overflow-wrap:anywhere } dl { margin:20px 0; display:grid; grid-template-columns:1fr 1fr; gap:16px } dt { font-size:11px; color:var(--muted) } dd { font-size:13px; margin:5px 0 0; overflow-wrap:anywhere }
  .model-list { max-height:380px; overflow:auto } .model-list article { padding:12px 0; overflow-wrap:anywhere } .model-list p { font-size:12px; margin:6px 0 } .models { margin-top:24px }
  .hint { font-size:12px; overflow-wrap:anywhere } .actions { justify-content:flex-start; flex-wrap:wrap; margin:15px 0 } .template { border-top:1px solid var(--border); margin-top:20px; padding-top:20px } .subtle { font-size:12px; color:var(--accent) }
  .error { padding:14px; background:var(--err-soft,var(--surface-2)); color:var(--err); border-radius:8px; overflow-wrap:anywhere } .success { color:var(--accent); overflow-wrap:anywhere } article { border-top:1px solid var(--border); padding:18px 0 }
  .save { position:sticky; bottom:0; background:var(--bg); border-top:1px solid var(--border); margin-top:20px; padding:16px 0; z-index:10 } .save p { font-size:12px; margin:0 }
  @media(max-width:700px) { .settings { padding:24px 14px 40px } .workspace { grid-template-columns:1fr } .roster { display:flex; flex-wrap:wrap; gap:8px } .roster h2,.roster label { width:100% } .roster button:not(.btn) { width:auto } .heading,.worker-title { align-items:flex-start; flex-direction:column } .two,dl { grid-template-columns:1fr } .panel { padding:18px } .allowlist { gap:10px } .save { align-items:flex-start } }
</style>
