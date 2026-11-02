<script>
  import { fade } from 'svelte/transition'
  import { app, go, refreshEnv, refreshSettings } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import EnvList from './EnvList.svelte'
  import RoomRoot from './RoomRoot.svelte'

  let checking = $state(false)

  async function recheck() {
    checking = true
    await Promise.all([refreshEnv(), refreshSettings()])
    checking = false
  }
</script>

<section class="wrap">
  <h1>{t('setupTitle')}</h1>
  <p class="intro">{t('setupIntro')}</p>

  {#if app.envError && !app.env}
    <div class="error"><Icon name="alert" size={16} /> {app.envError}</div>
  {/if}

  <EnvList />

  <div class="rooms">
    <RoomRoot />
  </div>

  <div class="foot">
    <div class="left">
      <button class="btn btn-ghost" onclick={recheck} disabled={checking}>
        <span class:spinning={checking} class="ri"><Icon name="refresh" size={14} /></span> {t('recheck')}
      </button>
      <button class="btn btn-ghost" onclick={() => go('welcome')}>{t('welcomeAgain')}</button>
    </div>
    {#if app.env?.ready && app.settings?.roomRoot}
      <button class="btn btn-primary" onclick={() => go('')} in:fade={{ duration: 150 }}>{t('continue')} →</button>
    {/if}
  </div>
</section>

<style>
  .wrap {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: 40px 24px 64px;
  }

  h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
  .intro { margin: 6px 0 26px; color: var(--muted); }

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

  .rooms {
    margin-top: 14px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .foot {
    display: flex;
    justify-content: space-between;
    margin-top: 18px;
    gap: 8px;
  }
  .left { display: flex; gap: 8px; }

  .ri { display: inline-grid; }
  .spinning { animation: rot 0.8s linear infinite; }
  @keyframes rot { to { transform: rotate(360deg); } }
</style>
