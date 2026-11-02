<script>
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { app, go, refreshPi } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import WorkerSettings from './WorkerSettings.svelte'
  import Providers from './Providers.svelte'
  import ConfigCheck from './ConfigCheck.svelte'
  import PiConfigView from './PiConfigView.svelte'
  import GeneralSettings from './GeneralSettings.svelte'

  const tabs = [
    { id: 'worker', label: 'tabWorker', icon: 'bolt' },
    { id: 'models', label: 'tabModels', icon: 'key' },
    { id: 'check', label: 'tabCheck', icon: 'pulse' },
    { id: 'pi', label: 'tabPi', icon: 'server' },
    { id: 'general', label: 'tabGeneral', icon: 'sliders' }
  ]

  let tab = $derived(tabs.some(x => x.id === app.route.tab) ? app.route.tab : 'worker')

  onMount(refreshPi)
</script>

<section class="wrap">
  <h1>{t('settings')}</h1>

  <div class="layout">
    <nav aria-label={t('settings')}>
      {#each tabs as x}
        <button class="tab" class:on={tab === x.id} aria-current={tab === x.id ? 'page' : undefined} onclick={() => go(x.id === 'worker' ? 'settings' : 'settings/' + x.id)}>
          <Icon name={x.icon} size={15} /> <span>{t(x.label)}</span>
        </button>
      {/each}
    </nav>

    <div class="pane">
      {#if app.piError && !app.pi && tab !== 'general'}
        <div class="error"><Icon name="alert" size={16} /> {app.piError}</div>
      {/if}
      {#key tab}
        <div in:fade={{ duration: 120 }}>
          {#if tab === 'worker'}<WorkerSettings />
          {:else if tab === 'models'}<Providers />
          {:else if tab === 'check'}<ConfigCheck />
          {:else if tab === 'pi'}<PiConfigView />
          {:else}<GeneralSettings />{/if}
        </div>
      {/key}
    </div>
  </div>
</section>

<style>
  .wrap {
    width: 100%;
    max-width: 980px;
    margin: 0 auto;
    padding: 36px 24px 72px;
  }

  h1 { margin: 0 0 22px; font-size: 26px; letter-spacing: -0.02em; }

  .layout {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
  }

  nav {
    position: sticky;
    top: 80px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 12px;
    border-radius: 9px;
    color: var(--muted);
    font-weight: 560;
    text-align: left;
    transition: background 0.15s, color 0.15s;
  }
  .tab:hover { background: var(--surface-2); color: var(--fg); }
  .tab.on { background: var(--surface); color: var(--fg); box-shadow: var(--shadow-sm); border: 1px solid var(--border); }
  .tab.on :global(svg) { color: var(--accent); }

  .pane { min-width: 0; }

  .error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 14px;
    margin-bottom: 16px;
    border-radius: 10px;
    background: var(--err-soft);
    color: var(--err);
  }

  @media (max-width: 760px) {
    .wrap { padding-top: 24px; }
    .layout { grid-template-columns: minmax(0, 1fr); gap: 18px; }
    nav {
      position: static;
      flex-direction: row;
      overflow-x: auto;
      margin: 0 -24px;
      padding: 0 24px 2px;
      scrollbar-width: none;
    }
    .tab { flex: none; }
  }
</style>
