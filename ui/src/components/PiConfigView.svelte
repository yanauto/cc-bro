<script>
  import { app, copyText, refreshPi } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { shortPath } from '../lib/format.js'
  import Icon from './Icon.svelte'
  import Section from './Section.svelte'

  let showAll = $state(false)
  let loading = $state(false)

  let pi = $derived(app.pi)
  let groups = $derived.by(() => {
    if (!pi) return []
    const out = []
    for (const m of pi.models) {
      if (!showAll && !m.ready) continue
      let g = out.find(x => x.provider === m.provider)
      if (!g) out.push(g = { provider: m.provider, name: pi.providers.find(p => p.id === m.provider)?.name ?? m.provider, models: [] })
      g.models.push(m)
    }
    return out
  })
  let hidden = $derived(pi ? pi.models.filter(m => !m.ready).length : 0)

  async function reload() {
    loading = true
    await refreshPi()
    loading = false
  }

  function ctx(n) {
    if (!n) return ''
    return n >= 1000000 ? (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M' : Math.round(n / 1000) + 'K'
  }
</script>

<Section title={t('pcTitle')} intro={t('pcIntro')}>
  {#snippet actions()}
    <button class="btn btn-ghost" onclick={reload} disabled={loading}>
      <span class="ri" class:spinning={loading}><Icon name="refresh" size={14} /></span> {t('refresh')}
    </button>
  {/snippet}

  {#if pi}
    {#if pi.problems.length}
      <div class="problems">
        <div class="pt"><Icon name="alert" size={15} /> {t('pcProblems')}</div>
        <ul>{#each pi.problems as p}<li>{p}</li>{/each}</ul>
      </div>
    {/if}

    <div class="grid">
      <div class="card">
        <div class="ch">{t('pcDir')}</div>
        <div class="dir">
          <code title={pi.agentDir}>{shortPath(pi.agentDir)}</code>
          <button class="icon-btn" onclick={() => copyText(pi.agentDir, t('copied'))} aria-label={t('copyPath')}><Icon name="copy" size={14} /></button>
        </div>
        <div class="ch sp">{t('pcFiles')}</div>
        <ul class="files">
          {#each pi.files as f}
            <li>
              <code>{f.name}</code>
              {#if f.error}<span class="fs bad" title={f.error}><Icon name="alert" size={12} /> {t('pcBroken')}</span>
              {:else if !f.exists}<span class="fs none">{t('pcMissing')}</span>
              {:else}<span class="fs ok"><Icon name="check" size={12} /> {t('pcFine')}</span>{/if}
            </li>
            {#if f.error}<li class="ferr mono">{f.error}</li>{/if}
          {/each}
        </ul>
      </div>

      <div class="card">
        <div class="ch">{t('pcDefaults')} <span class="src">{t('pcFromSettings')}</span></div>
        <dl>
          <dt>{t('pcDefaultModel')}</dt>
          <dd class="mono">{pi.defaultModel ?? t('pcNotSet')}</dd>
          <dt>{t('pcDefaultThinking')}</dt>
          <dd>{pi.defaultThinking ? t('th_' + pi.defaultThinking) : t('pcNotSet')}</dd>
          <dt>{t('pcEnabled')}</dt>
          <dd>
            {#if pi.enabledModels?.length}
              <div class="chips">{#each pi.enabledModels as m}<span class="chip mono">{m}</span>{/each}</div>
            {:else}{t('pcAll')}{/if}
          </dd>
        </dl>
      </div>
    </div>

    <div class="mhead">
      <h3>{t('pcModels')} <span class="cnt">{pi.models.filter(m => m.ready).length}</span></h3>
      {#if hidden}
        <label class="toggle"><input type="checkbox" bind:checked={showAll} /> {t('pcShowAll')} <span class="cnt">{hidden}</span></label>
      {/if}
    </div>
    <div class="models">
      {#each groups as g (g.provider)}
        <div class="mg">
          <div class="gname">{g.name} <span class="mono gid">{g.provider}</span></div>
          <ul>
            {#each g.models as m (m.id)}
              <li class:off={!m.ready}>
                <span class="mono mid">{m.id.slice(m.provider.length + 1)}</span>
                {#if m.name && m.name !== m.id.slice(m.provider.length + 1)}<span class="mname">{m.name}</span>{/if}
                <span class="grow"></span>
                {#if m.reasoning}<span class="tag">{t('pcReasoning')}</span>{/if}
                {#if m.contextWindow}<span class="tag">{ctx(m.contextWindow)} {t('pcContext')}</span>{/if}
                <span class="tag {m.ready ? 'ok' : 'no'}">{m.ready ? t('pcReady') : t('pcNoCred')}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {:else}
    <div class="skeleton"></div>
  {/if}
</Section>

<style>
  .problems {
    padding: 12px 16px;
    margin-bottom: 14px;
    border-radius: 12px;
    background: var(--err-soft);
    color: var(--err);
  }
  .pt { display: flex; align-items: center; gap: 7px; font-weight: 620; }
  .problems ul { margin: 6px 0 0; padding-left: 22px; font-size: 13px; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .card {
    padding: 16px 18px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    min-width: 0;
  }
  .ch { font-size: 11.5px; font-weight: 620; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .ch.sp { margin-top: 16px; }
  .src { text-transform: none; letter-spacing: 0; font-weight: 450; color: var(--faint); margin-left: 4px; }

  .dir { display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 12px; border-radius: 9px; background: var(--bg); border: 1px solid var(--border); }
  .dir code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .files li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .fs { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 560; }
  .fs.ok { color: var(--ok); }
  .fs.bad { color: var(--err); }
  .fs.none { color: var(--faint); }
  .ferr { font-size: 11.5px; color: var(--err); padding-left: 2px; }

  dl { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 9px 16px; font-size: 13px; }
  dt { color: var(--muted); }
  dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }

  .mhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 26px 0 10px; }
  h3 { margin: 0; font-size: 15px; }
  .cnt { font-size: 12px; font-weight: 600; color: var(--muted); background: var(--surface-2); border-radius: 999px; padding: 1px 7px; margin-left: 4px; }
  .toggle { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); cursor: pointer; }
  .toggle input { accent-color: var(--accent); }

  .models {
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }
  .mg + .mg { border-top: 1px solid var(--border); }
  .gname { padding: 11px 18px 4px; font-weight: 620; font-size: 13px; }
  .gid { font-size: 11.5px; color: var(--faint); font-weight: 450; margin-left: 4px; }
  .mg ul { list-style: none; margin: 0; padding: 0 0 8px; }
  .mg li { display: flex; align-items: center; gap: 8px; padding: 5px 18px; font-size: 13px; }
  .mg li.off { opacity: 0.55; }
  .mid { font-size: 12.5px; }
  .mname { font-size: 12px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grow { flex: 1; }
  .tag { flex: none; font-size: 11px; padding: 1px 7px; border-radius: 6px; background: var(--surface-2); color: var(--muted); white-space: nowrap; }
  .tag.ok { background: var(--ok-soft); color: var(--ok); }
  .tag.no { background: var(--warn-soft); color: var(--warn); }

  .skeleton { height: 220px; border-radius: 14px; background: var(--surface-2); opacity: 0.6; }

  .ri { display: inline-grid; }
  .spinning { animation: rot 0.8s linear infinite; }
  @keyframes rot { to { transform: rotate(360deg); } }

  @media (max-width: 700px) {
    .grid { grid-template-columns: 1fr; }
    .mname { display: none; }
  }
</style>
