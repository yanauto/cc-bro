<script>
  import { slide } from 'svelte/transition'
  import { app, installPi, login } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { shortPath } from '../lib/format.js'
  import Icon from './Icon.svelte'

  let env = $derived(app.env)
  let job = $derived(app.activeJob ? app.jobs[app.activeJob] : null)
  let installing = $derived(job?.state === 'running')
  let readyModels = $derived(env?.models?.filter(m => m.ready) ?? [])

  function openPi() {
    app.piGuide = true
    login(t('piOpened'))
  }

  $effect(() => {
    if (readyModels.length && app.piGuide) app.piGuide = false
  })

  let logEl = $state(null)
  $effect(() => {
    job?.log?.length
    if (logEl) logEl.scrollTop = logEl.scrollHeight
  })
</script>

<div class="list">
    <div class="row" class:ok={env?.node.ok}>
      <span class="state">{#if env?.node.ok}<Icon name="check" size={16} />{:else}<Icon name="alert" size={16} />{/if}</span>
      <div class="info">
        <div class="name">{t('nodeTitle')}</div>
        <div class="detail">
          {#if env}
            {env.node.version ? `v${env.node.version.replace(/^v/, '')}` : t('notFound')}
            {#if !env.node.ok}<span class="need">· {t('needVersion')} {env.node.required}</span>{/if}
          {:else}…{/if}
        </div>
      </div>
      {#if env && !env.node.ok}
        <a class="btn btn-ghost" href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">{t('getNode')} <Icon name="external" size={13} /></a>
      {/if}
    </div>

    <div class="row" class:ok={env?.pi.ok}>
      <span class="state">{#if env?.pi.ok}<Icon name="check" size={16} />{:else}<Icon name="alert" size={16} />{/if}</span>
      <div class="info">
        <div class="name">{t('piTitle')}</div>
        <div class="detail">
          {#if env}
            {#if env.pi.installed}
              v{env.pi.version}{#if env.pi.path}{' · '}<span class="mono">{shortPath(env.pi.path)}</span>{/if}
              {#if !env.pi.ok}<span class="need">· {t('needVersion')} {env.pi.required}</span>{/if}
            {:else}
              {t('notFound')}
            {/if}
          {:else}…{/if}
        </div>
      </div>
      {#if env && !env.pi.ok}
        <button class="btn btn-primary" onclick={installPi} disabled={installing || !env.node.ok}>
          {#if installing}<span class="spin"></span>{t('installing')}{:else}<Icon name="bolt" size={14} />{env.pi.installed ? t('upgradePi') : t('installPi')}{/if}
        </button>
      {/if}
    </div>

    {#if job}
      <div class="log-wrap" transition:slide={{ duration: 200 }}>
        {#if job.state === 'failed'}<p class="log-err">{t('installFailed')}</p>{/if}
        <pre class="log" bind:this={logEl}>{job.log.join('\n')}</pre>
      </div>
    {/if}

    <div class="row" class:ok={env?.claude.installed}>
      <span class="state">{#if env?.claude.installed}<Icon name="check" size={16} />{:else}<Icon name="alert" size={16} />{/if}</span>
      <div class="info">
        <div class="name">{t('claudeTitle')}</div>
        <div class="detail">
          {#if env}
            {#if env.claude.installed}v{env.claude.version}{#if env.claude.path}{' · '}<span class="mono">{shortPath(env.claude.path)}</span>{/if}{:else}{t('notFound')}{/if}
          {:else}…{/if}
        </div>
      </div>
      {#if env && !env.claude.installed}
        <a class="btn btn-ghost" href="https://code.claude.com/docs/en/setup" target="_blank" rel="noreferrer">{t('getClaude')} <Icon name="external" size={13} /></a>
      {/if}
    </div>

    <div class="row" class:ok={readyModels.length > 0}>
      <span class="state">{#if readyModels.length}<Icon name="check" size={16} />{:else}<Icon name="alert" size={16} />{/if}</span>
      <div class="info">
        <div class="name">{t('modelsTitle')}</div>
        <div class="detail">
          {#if env}
            {#if readyModels.length}
              {readyModels.length} {t('modelsReady')}
            {:else}
              {t('noModels')}
            {/if}
          {:else}…{/if}
        </div>
        {#if env && !readyModels.length}
          <p class="help">{t('modelHelp')}</p>
        {/if}
        {#if readyModels.length}
          <div class="models">
            {#each readyModels.slice(0, 12) as m}<span class="chip mono">{m.id}</span>{/each}
            {#if readyModels.length > 12}<span class="chip">+{readyModels.length - 12}</span>{/if}
          </div>
        {/if}
      </div>
      {#if env?.pi.installed}
        <div class="model-acts">
          <button class="btn {readyModels.length ? 'btn-ghost' : 'btn-primary'}" onclick={() => (app.providerDialog = { type: 'add' })}>
            <Icon name="plus" size={14} /> {t('addModel')}
          </button>
          <button class="btn btn-ghost" onclick={openPi} title={t('loginHint')}>
            <Icon name="terminal" size={14} /> {t('login')}
          </button>
        </div>
      {/if}
    </div>

    {#if app.piGuide}
      <div class="guide" transition:slide={{ duration: 200 }}>
        <div class="g-head">
          <span class="g-title"><Icon name="terminal" size={14} /> {t('piGuideTitle')}</span>
          <button class="link" onclick={() => (app.piGuide = false)}>{t('piGuideClose')}</button>
        </div>
        <ol>
          <li><span class="n">1</span><span>{t('piGuide1').split('/login')[0]}<code>/login</code>{t('piGuide1').split('/login')[1]}</span></li>
          <li><span class="n">2</span><span>{t('piGuide2')}</span></li>
          <li><span class="n">3</span><span>{t('piGuide3')}</span></li>
        </ol>
      </div>
    {/if}
  </div>

<style>
  .list {
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
    padding: 16px 18px;
    border-top: 1px solid var(--border);
  }
  .row:first-child { border-top: 0; }

  .state {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--warn-soft);
    color: var(--warn);
  }
  .row.ok .state { background: var(--ok-soft); color: var(--ok); }

  .info { flex: 1; min-width: 0; }
  .name { font-weight: 620; }
  .detail { font-size: 12.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
  .need { color: var(--warn); }

  .models {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  }
  .models .chip { font-size: 11px; }

  .help { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); max-width: 52ch; }
  .model-acts { flex: none; display: flex; flex-direction: column; align-items: stretch; gap: 6px; }

  .guide {
    margin: 0 18px 16px 62px;
    padding: 14px 16px;
    border-radius: 11px;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .g-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .g-title { display: inline-flex; align-items: center; gap: 7px; font-weight: 620; font-size: 13px; }
  .link { color: var(--accent); font-size: 12.5px; font-weight: 560; }
  .guide ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
  .guide li { display: flex; gap: 10px; align-items: flex-start; }
  .guide .n {
    flex: none;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 11.5px;
    font-weight: 700;
  }
  .guide code { padding: 1px 5px; border-radius: 5px; background: var(--surface-2); color: var(--fg); }

  .log-wrap { padding: 0 18px 16px 62px; }
  .log-err { margin: 0 0 8px; color: var(--err); font-size: 13px; }
  .log {
    margin: 0;
    max-height: 200px;
    overflow: auto;
    padding: 12px 14px;
    border-radius: 9px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--muted);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .spin {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
    border-top-color: currentColor;
    animation: rot 0.7s linear infinite;
  }
  @keyframes rot { to { transform: rotate(360deg); } }

  @media (max-width: 640px) {
    .row { flex-wrap: wrap; }
    .log-wrap { padding-left: 18px; }
    .guide { margin-left: 18px; }
    .model-acts { flex-direction: row; flex-wrap: wrap; }
  }
</style>
