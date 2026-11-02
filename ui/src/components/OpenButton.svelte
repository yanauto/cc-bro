<script>
  import { scale } from 'svelte/transition'
  import { app, openChat, reveal, copyText, saveSettings } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'

  let { project } = $props()

  let open = $state(false)
  let client = $derived(app.settings?.client || 'terminal')
  let revealLabel = $derived(app.env?.platform === 'darwin' || !app.env ? t('revealDarwin') : t('revealOther'))

  function launch(c) {
    open = false
    if (c !== client) saveSettings({ client: c })
    openChat(project.id, t('opened'), c)
  }
</script>

<svelte:window onclick={() => (open = false)} onkeydown={e => e.key === 'Escape' && (open = false)} />

<div class="split">
  <button class="btn btn-primary main" onclick={() => openChat(project.id, t('opened'), client)}>
    <Icon name="chat" size={15} /> {t('openChat')}
  </button>
  <button class="btn btn-primary caret" aria-label={t('openWith')} aria-expanded={open} onclick={e => { e.stopPropagation(); open = !open }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  </button>
  {#if open}
    <div class="menu" transition:scale={{ start: 0.96, duration: 120 }} role="menu">
      <div class="label">{t('openWith')}</div>
      <button class="item" role="menuitem" onclick={() => launch('terminal')}>
        <span class="ic"><Icon name="terminal" size={15} /></span>
        <span class="tx"><span class="ti">{t('viaTerminal')}</span><span class="hi">{t('viaTerminalHint')}</span></span>
        {#if client === 'terminal'}<span class="ck"><Icon name="check" size={14} /></span>{/if}
      </button>
      <button class="item" role="menuitem" onclick={() => launch('desktop')}>
        <span class="ic"><Icon name="chat" size={15} /></span>
        <span class="tx"><span class="ti">{t('viaDesktop')}</span><span class="hi">{t('viaDesktopHint')}</span></span>
        {#if client === 'desktop'}<span class="ck"><Icon name="check" size={14} /></span>{/if}
      </button>
      <div class="sep"></div>
      <button class="item" role="menuitem" onclick={() => { open = false; reveal(project.id) }}>
        <span class="ic"><Icon name="folder" size={15} /></span>
        <span class="tx"><span class="ti">{revealLabel}</span></span>
      </button>
      <button class="item" role="menuitem" onclick={() => { open = false; copyText(project.roomPath, t('copied')) }}>
        <span class="ic"><Icon name="copy" size={15} /></span>
        <span class="tx"><span class="ti">{t('copyPath')}</span></span>
      </button>
    </div>
  {/if}
</div>

<style>
  .split { position: relative; display: inline-flex; }
  .main { border-radius: 9px 0 0 9px; }
  .caret {
    border-radius: 0 9px 9px 0;
    padding: 0 10px;
    margin-left: 1px;
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    width: 280px;
    padding: 6px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    transform-origin: top right;
  }

  .label {
    padding: 6px 10px 4px;
    font-size: 11.5px;
    font-weight: 620;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    text-align: left;
  }
  .item:hover { background: var(--surface-2); }
  .ic { color: var(--muted); display: grid; }
  .tx { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .ti { font-size: 13.5px; font-weight: 560; }
  .hi { font-size: 12px; color: var(--muted); }
  .ck { color: var(--accent); display: grid; }
  .sep { height: 1px; background: var(--border); margin: 5px 4px; }
</style>
