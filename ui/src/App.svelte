<script>
  import { onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import { app, start, go } from './lib/store.svelte.js'
  import { t, lang, setLang } from './lib/i18n.svelte.js'
  import Icon from './components/Icon.svelte'
  import Home from './components/Home.svelte'
  import Board from './components/Board.svelte'
  import Setup from './components/Setup.svelte'
  import Welcome from './components/Welcome.svelte'
  import DesktopHelp from './components/DesktopHelp.svelte'
  import Settings from './components/Settings.svelte'
  import ProviderDialogs from './components/ProviderDialogs.svelte'

  onMount(start)

  let project = $derived(app.route.name === 'board' ? app.projects.find(p => p.id === app.route.id) : null)
  let envState = $derived(!app.env ? 'unknown' : app.env.ready && app.settings?.roomRoot !== null ? 'ready' : 'needed')

  $effect(() => {
    document.documentElement.lang = lang.current === 'zh' ? 'zh-CN' : 'en'
    document.title = project ? `${project.name} · cc-bro` : 'cc-bro'
  })
</script>

<div class="shell">
  <header class="top">
    <div class="left">
      <button class="brand" onclick={() => go('')} aria-label="cc-bro">
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="22" height="22"><rect width="32" height="32" rx="8" fill="currentColor"/><path d="M9 11h6M9 16h10M9 21h14" stroke="var(--bg)" stroke-width="2.6" stroke-linecap="round"/></svg>
        </span>
        <span class="name">cc-bro</span>
      </button>
      {#if app.route.name === 'board'}
        <span class="sep" aria-hidden="true">/</span>
        <span class="crumb">{project?.name ?? ''}</span>
      {:else if app.route.name === 'setup'}
        <span class="sep" aria-hidden="true">/</span>
        <span class="crumb">{t('setup')}</span>
      {:else if app.route.name === 'welcome'}
        <span class="sep" aria-hidden="true">/</span>
        <span class="crumb">{t('welcomeAgain')}</span>
      {:else if app.route.name === 'settings'}
        <span class="sep" aria-hidden="true">/</span>
        <span class="crumb">{t('settings')}</span>
      {/if}
      {#if app.mock}
        <span class="chip demo">{t('demo')}</span>
      {/if}
    </div>
    <div class="right">
      <button class="env {envState}" onclick={() => go('setup')} title={t('setup')}>
        <span class="dot"></span>
        {envState === 'ready' ? t('ready') : envState === 'needed' ? t('setupNeeded') : t('setup')}
      </button>
      <button class="icon-btn" class:active={app.route.name === 'settings'} onclick={() => go('settings')} title={t('settings')} aria-label={t('settings')}>
        <Icon name="sliders" size={17} />
      </button>
      <button class="icon-btn lang" onclick={() => setLang(lang.current === 'zh' ? 'en' : 'zh')} title="Language / 语言">
        <span>{lang.current === 'zh' ? 'EN' : '中'}</span>
      </button>
    </div>
  </header>

  {#if !app.connected && app.everConnected}
    <div class="offline" transition:fade={{ duration: 150 }}>
      <Icon name="refresh" size={14} /> {t('offline')}
    </div>
  {/if}

  <main>
    {#if app.route.name === 'setup'}
      <Setup />
    {:else if app.route.name === 'welcome'}
      <Welcome />
    {:else if app.route.name === 'settings'}
      <Settings />
    {:else if app.route.name === 'board'}
      {#key app.route.id}
        <Board id={app.route.id} />
      {/key}
    {:else}
      <Home />
    {/if}
  </main>

  <DesktopHelp />
  <ProviderDialogs />

  {#if app.toast?.message}
    {#key app.toast.id}
      <div class="toast-wrap">
        <div class="toast {app.toast.kind}" role="status" in:fly={{ y: 12, duration: 180 }} out:fade={{ duration: 150 }}>
          {#if app.toast.kind === 'error'}<Icon name="alert" size={15} />{:else}<Icon name="check" size={15} />{/if}
          <span>{app.toast.message}</span>
        </div>
      </div>
    {/key}
  {/if}
</div>

<style>
  .shell {
    min-height: 100vh;
    overflow-x: clip;
    display: flex;
    flex-direction: column;
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 24px;
    background: color-mix(in srgb, var(--bg) 86%, transparent);
    backdrop-filter: saturate(1.4) blur(12px);
    border-bottom: 1px solid var(--border);
  }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    font-weight: 680;
    font-size: 15px;
    letter-spacing: -0.01em;
  }

  .logo { color: var(--accent); display: grid; }

  .sep { color: var(--faint); }

  .crumb {
    font-weight: 560;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .demo { background: var(--warn-soft); color: var(--warn); }

  .env {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    padding: 0 11px;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 560;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .env:hover { border-color: var(--border-strong); }
  .env .dot { background: var(--faint); }
  .env.ready .dot { background: var(--ok); }
  .env.needed { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 35%, var(--border)); background: var(--warn-soft); }
  .env.needed .dot { background: var(--warn); }

  .icon-btn.active { color: var(--accent); background: var(--accent-soft); }

  .lang span { font-size: 12px; font-weight: 650; }

  .offline {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 7px 16px;
    font-size: 13px;
    background: var(--warn-soft);
    color: var(--warn);
    border-bottom: 1px solid var(--border);
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    width: 100%;
  }

  .toast-wrap {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 28px;
    z-index: 60;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 9px;
    max-width: min(560px, calc(100vw - 32px));
    padding: 11px 16px;
    border-radius: 11px;
    background: var(--fg);
    color: var(--bg);
    box-shadow: var(--shadow-lg);
    font-size: 13.5px;
  }
  .toast.error { background: var(--err); color: #fff; }

  @media (max-width: 640px) {
    .top { padding: 0 14px; }
  }
</style>
