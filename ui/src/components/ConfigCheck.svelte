<script>
  import { flip } from 'svelte/animate'
  import { app, runCheck, cancelJob, go } from '../lib/store.svelte.js'
  import { t, tf } from '../lib/i18n.svelte.js'
  import { ago } from '../lib/format.js'
  import Icon from './Icon.svelte'
  import Section from './Section.svelte'

  let job = $derived(app.checkJob ? app.jobs[app.checkJob] : null)
  let running = $derived(job?.state === 'running')
  let ready = $derived((app.pi?.models ?? []).filter(m => m.ready))

  let rows = $derived(ready.map(m => ({ model: m, result: app.checkResults[m.id] ?? null, waiting: app.checkPending.includes(m.id) })))
  let okCount = $derived(rows.filter(r => r.result?.ok).length)
  let failCount = $derived(rows.filter(r => r.result && !r.result.ok).length)
  let checked = $derived(rows.some(r => r.result))

  function all() {
    runCheck()
  }

  function one(id) {
    runCheck([id])
  }

  function msColor(ms) {
    return ms < 1500 ? 'fast' : ms < 4000 ? 'mid' : 'slow'
  }
</script>

<Section title={t('checkTitle')} intro={t('checkIntro')}>
  {#snippet actions()}
    {#if running}
      <button class="btn btn-ghost" onclick={() => cancelJob(app.checkJob)}><Icon name="stop" size={13} /> {t('checkStop')}</button>
    {/if}
    <button class="btn btn-primary" onclick={all} disabled={running || ready.length === 0}>
      {#if running}<span class="spin"></span>{t('checkRunning')}{:else}<Icon name="pulse" size={14} /> {checked ? t('checkAgain') : t('checkAll')}{/if}
    </button>
  {/snippet}

  {#if app.pi && ready.length === 0}
    <div class="empty">
      <span>{t('checkNoModels')}</span>
      <button class="btn btn-ghost" onclick={() => go('settings/models')}>{t('goModels')}</button>
    </div>
  {:else if app.pi}
    {#if checked}
      <div class="summary">
        <span class="s ok"><span class="dot"></span>{okCount}</span>
        <span class="s bad"><span class="dot"></span>{failCount}</span>
        <span class="stext">{tf('checkSummary', { ok: okCount, fail: failCount })}</span>
      </div>
    {/if}
    <ul class="list">
      {#each rows as r (r.model.id)}
        <li class="row" class:fail={r.result && !r.result.ok && !r.waiting} animate:flip={{ duration: 200 }}>
          <span class="st">
            {#if r.waiting}<span class="spin"></span>
            {:else if !r.result}<span class="idle"></span>
            {:else if r.result.ok}<span class="okc"><Icon name="check" size={13} /></span>
            {:else}<span class="badc"><Icon name="close" size={12} /></span>{/if}
          </span>
          <div class="info">
            <div class="mid mono">{r.model.id}</div>
            {#if r.waiting}
              <div class="sub">{t('checkWaiting')}…</div>
            {:else if r.result && !r.result.ok}
              <div class="sub errt">{r.result.error}</div>
            {:else if r.result}
              <div class="sub">{ago(r.result.at, app.now)}</div>
            {:else}
              <div class="sub">{t('checkNever')}</div>
            {/if}
          </div>
          {#if r.result?.ok && !r.waiting}
            <span class="ms {msColor(r.result.ms)}">{(r.result.ms / 1000).toFixed(1)}s</span>
          {/if}
          <button class="btn btn-ghost sm" onclick={() => one(r.model.id)} disabled={r.waiting || running}>{t('checkOne')}</button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="skeleton"></div>
  {/if}
</Section>

<style>
  .summary { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; font-size: 13px; }
  .s { display: inline-flex; align-items: center; gap: 6px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .s.ok .dot { background: var(--ok); }
  .s.bad .dot { background: var(--err); }
  .stext { color: var(--muted); }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 13px 16px 13px 18px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
  .row:first-child { border-top: 0; }
  .row.fail { background: color-mix(in srgb, var(--err-soft) 45%, var(--surface)); }

  .st { flex: none; display: grid; place-items: center; width: 24px; height: 24px; }
  .idle { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--border-strong); }
  .okc, .badc { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--ok-soft); color: var(--ok); }
  .badc { background: var(--err-soft); color: var(--err); }

  .info { flex: 1; min-width: 0; }
  .mid { font-size: 13px; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 12px; color: var(--muted); }
  .errt { color: var(--err); }

  .ms { font-size: 12.5px; font-weight: 620; font-variant-numeric: tabular-nums; }
  .ms.fast { color: var(--ok); }
  .ms.mid { color: var(--warn); }
  .ms.slow { color: var(--err); }

  .sm { height: 28px; padding: 0 10px; font-size: 12px; }

  .empty { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; border-radius: 14px; border: 1.5px dashed var(--border-strong); color: var(--muted); }

  .skeleton { height: 180px; border-radius: 14px; background: var(--surface-2); opacity: 0.6; }

  .spin {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
    border-top-color: currentColor;
    animation: rot 0.7s linear infinite;
  }
  .st .spin { color: var(--accent); }
  @keyframes rot { to { transform: rotate(360deg); } }
</style>
