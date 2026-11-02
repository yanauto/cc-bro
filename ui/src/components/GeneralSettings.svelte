<script>
  import { app, go, saveSettings } from '../lib/store.svelte.js'
  import { t, lang, setLang } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import Section from './Section.svelte'
  import RoomRoot from './RoomRoot.svelte'

  let client = $derived(app.settings?.client ?? 'terminal')
  let envOk = $derived(app.env?.ready)
</script>

<Section title={t('tabGeneral')}>
  <div class="card">
    <RoomRoot />

    <div class="row">
      <span class="ico"><Icon name="chat" size={16} /></span>
      <div class="info"><div class="name">{t('genOpenWith')}</div></div>
      <div class="seg" role="radiogroup" aria-label={t('genOpenWith')}>
        <button role="radio" aria-checked={client === 'terminal'} class:on={client === 'terminal'} onclick={() => saveSettings({ client: 'terminal' }, t('saved'))}><Icon name="terminal" size={13} /> {t('viaTerminal')}</button>
        <button role="radio" aria-checked={client === 'desktop'} class:on={client === 'desktop'} onclick={() => saveSettings({ client: 'desktop' }, t('saved'))}><Icon name="chat" size={13} /> {t('viaDesktop')}</button>
      </div>
    </div>

    <div class="row">
      <span class="ico" class:ok={envOk} class:warn={app.env && !envOk}><Icon name={envOk ? 'check' : 'alert'} size={16} /></span>
      <div class="info">
        <div class="name">{t('genEnv')}</div>
        <div class="detail">{app.env ? (envOk ? t('ready') : t('setupNeeded')) : '…'}</div>
      </div>
      <button class="btn btn-ghost" onclick={() => go('setup')}>{t('genEnvBtn')}</button>
    </div>

    <div class="row">
      <span class="ico"><Icon name="globe" size={16} /></span>
      <div class="info"><div class="name">{t('genLang')}</div></div>
      <div class="seg" role="radiogroup" aria-label={t('genLang')}>
        <button role="radio" aria-checked={lang.current === 'en'} class:on={lang.current === 'en'} onclick={() => setLang('en')}>English</button>
        <button role="radio" aria-checked={lang.current === 'zh'} class:on={lang.current === 'zh'} onclick={() => setLang('zh')}>中文</button>
      </div>
    </div>
  </div>
</Section>

<style>
  .card {
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    border-top: 1px solid var(--border);
  }

  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--muted);
  }
  .ico.ok { background: var(--ok-soft); color: var(--ok); }
  .ico.warn { background: var(--warn-soft); color: var(--warn); }
  .info { flex: 1; min-width: 0; }
  .name { font-weight: 620; }
  .detail { font-size: 12.5px; color: var(--muted); }

  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: var(--surface-2);
  }
  .seg button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 11px;
    border-radius: 7px;
    font-size: 12.5px;
    font-weight: 560;
    color: var(--muted);
  }
  .seg button:hover { color: var(--fg); }
  .seg button.on { background: var(--surface); color: var(--fg); box-shadow: var(--shadow-sm); }

  @media (max-width: 560px) {
    .row { flex-wrap: wrap; }
    .seg { margin-left: 44px; }
  }
</style>
