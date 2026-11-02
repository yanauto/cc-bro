<script>
  import { app, go, saveSettings } from '../lib/store.svelte.js'
  import { t, tf } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import Section from './Section.svelte'

  const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

  let worker = $derived(app.settings?.worker ?? { kind: 'pi', model: null, thinking: null, concurrency: 3 })
  let ready = $derived((app.pi?.models ?? []).filter(m => m.ready))
  let groups = $derived.by(() => {
    const out = []
    for (const m of ready) {
      let g = out.find(x => x.provider === m.provider)
      if (!g) out.push(g = { provider: m.provider, name: app.pi.providers.find(p => p.id === m.provider)?.name ?? m.provider, models: [] })
      g.models.push(m)
    }
    return out
  })
  let piDefault = $derived(app.pi?.defaultModel ?? null)
  let missing = $derived(worker.model && app.pi && !ready.some(m => m.id === worker.model))

  function save(patch) {
    saveSettings({ worker: patch }, t('saved'))
  }

  function step(d) {
    const n = Math.min(10, Math.max(1, worker.concurrency + d))
    if (n !== worker.concurrency) save({ concurrency: n })
  }
</script>

<Section title={t('workerTitle')} intro={t('workerIntro')}>
  <div class="card">
    <div class="row">
      <div class="label">
        <div class="name">{t('workerKind')}</div>
        <div class="hint">{t('workerKindHint')}</div>
      </div>
      <div class="control">
        <span class="kind"><span class="pi">pi</span>{#if app.env?.pi.version}<span class="ver">v{app.env.pi.version}</span>{/if}</span>
      </div>
    </div>

    <div class="row">
      <div class="label">
        <div class="name">{t('defaultModel')}</div>
        <div class="hint">{t('defaultModelHint')}</div>
      </div>
      <div class="control">
        {#if app.pi && ready.length === 0}
          <div class="empty">
            <span>{t('noReadyModels')}</span>
            <button class="btn btn-primary" onclick={() => go('settings/models')}><Icon name="plus" size={14} /> {t('goModels')}</button>
          </div>
        {:else}
          <div class="select" class:warn={missing}>
            <select value={worker.model ?? ''} onchange={e => save({ model: e.currentTarget.value || null })} disabled={!app.pi}>
              <option value="">{piDefault ? tf('followPiIs', { model: piDefault }) : t('followPiUnset')}</option>
              {#if missing}<option value={worker.model}>{worker.model}</option>{/if}
              {#each groups as g}
                <optgroup label={g.name}>
                  {#each g.models as m}<option value={m.id}>{m.id}</option>{/each}
                </optgroup>
              {/each}
            </select>
            <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </div>
          {#if missing}<div class="warn-text"><Icon name="alert" size={13} /> {t('pcNoCred')}</div>{/if}
        {/if}
      </div>
    </div>

    <div class="row">
      <div class="label">
        <div class="name">{t('thinking')}</div>
        <div class="hint">{t('thinkingHint')}</div>
      </div>
      <div class="control">
        <div class="seg" role="radiogroup" aria-label={t('thinking')}>
          <button role="radio" aria-checked={worker.thinking === null} class:on={worker.thinking === null} onclick={() => save({ thinking: null })}>{t('followPi')}</button>
          {#each levels as l}
            <button role="radio" aria-checked={worker.thinking === l} class:on={worker.thinking === l} onclick={() => save({ thinking: l })}>{t('th_' + l)}</button>
          {/each}
        </div>
      </div>
    </div>

    <div class="row">
      <div class="label">
        <div class="name">{t('concurrency')}</div>
        <div class="hint">{t('concurrencyHint')}</div>
      </div>
      <div class="control">
        <div class="stepper">
          <button onclick={() => step(-1)} disabled={worker.concurrency <= 1} aria-label="−">−</button>
          <span class="n">{worker.concurrency}</span>
          <button onclick={() => step(1)} disabled={worker.concurrency >= 10} aria-label="+">+</button>
        </div>
      </div>
    </div>
  </div>
  <p class="note">{t('applyNote')}</p>
</Section>

<style>
  .card {
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
    gap: 20px;
    align-items: center;
    padding: 18px 20px;
    border-top: 1px solid var(--border);
  }
  .row:first-child { border-top: 0; }

  .name { font-weight: 620; }
  .hint { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .control { min-width: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }

  .kind {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 12px;
    border-radius: 9px;
    background: var(--surface-2);
  }
  .pi { font-family: var(--mono); font-weight: 650; }
  .ver { font-size: 12px; color: var(--muted); }

  .select { position: relative; width: 100%; max-width: 360px; }
  select {
    appearance: none;
    width: 100%;
    height: 36px;
    padding: 0 34px 0 12px;
    border-radius: 9px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font: inherit;
    font-family: var(--mono);
    font-size: 12.5px;
    cursor: pointer;
  }
  select:hover { border-color: var(--border-strong); }
  .select.warn select { border-color: var(--warn); }
  .chev { position: absolute; right: 12px; top: 12px; color: var(--muted); pointer-events: none; }
  .warn-text { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--warn); }

  .empty { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; color: var(--muted); font-size: 13px; text-align: right; }

  .seg {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: var(--surface-2);
  }
  .seg button {
    height: 28px;
    padding: 0 10px;
    border-radius: 7px;
    font-size: 12.5px;
    font-weight: 560;
    color: var(--muted);
  }
  .seg button:hover { color: var(--fg); }
  .seg button.on { background: var(--surface); color: var(--fg); box-shadow: var(--shadow-sm); }

  .stepper {
    display: inline-flex;
    align-items: center;
    border-radius: 9px;
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .stepper button {
    width: 34px;
    height: 34px;
    font-size: 17px;
    color: var(--muted);
  }
  .stepper button:hover:not(:disabled) { background: var(--surface-2); color: var(--fg); }
  .stepper button:disabled { opacity: 0.4; }
  .stepper .n {
    min-width: 40px;
    text-align: center;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    line-height: 34px;
  }

  .note { margin: 10px 2px 0; font-size: 12.5px; color: var(--faint); }

  @media (max-width: 640px) {
    .row { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .control { align-items: flex-start; }
    .seg { justify-content: flex-start; }
    .empty { align-items: flex-start; text-align: left; }
  }
</style>
