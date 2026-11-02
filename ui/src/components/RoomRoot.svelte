<script>
  import { app, saveSettings, pickRoomRoot, cancelPickRoot, revealRoomRoot } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { friendlyPath } from '../lib/format.js'
  import Icon from './Icon.svelte'

  let { big = false, onsaved = () => {} } = $props()

  let root = $derived(app.settings?.roomRoot)
  let fallback = $derived(app.settings?.defaultRoomRoot || '~/cc-bro')
  let saving = $state(false)
  let mac = $derived(!app.env || app.env.platform === 'darwin')
  let where = p => friendlyPath(p) ? (mac ? t('inFinder') : t('inFiles')) + friendlyPath(p) : ''

  async function use(path) {
    saving = true
    const ok = await saveSettings({ roomRoot: path }, t('saved'))
    saving = false
    if (ok) onsaved()
  }

  async function choose() {
    const path = await pickRoomRoot()
    if (path) use(path)
  }
</script>

{#if big}
  <div class="big">
    <button class="option" class:chosen={root === fallback} onclick={() => use(fallback)} disabled={saving}>
      <span class="radio" aria-hidden="true">{#if root === fallback}<Icon name="check" size={13} />{/if}</span>
      <span class="opt-main">
        <span class="opt-path mono">{fallback}</span>
        <span class="opt-sub">{where(fallback)}</span>
      </span>
      <span class="badge">{t('recommended')}</span>
    </button>
    {#if root && root !== fallback}
      <div class="option chosen static">
        <span class="radio" aria-hidden="true"><Icon name="check" size={13} /></span>
        <span class="opt-main">
          <span class="opt-path mono">{root}</span>
          <span class="opt-sub">{where(root)}</span>
        </span>
      </div>
    {/if}
    <div class="other">
      <button class="btn btn-ghost" onclick={choose} disabled={saving || app.pickingRoot}>
        <Icon name="folder" size={14} /> {t('chooseOther')}
      </button>
      {#if root}
        <button class="btn btn-ghost" onclick={revealRoomRoot}>
          <Icon name="external" size={14} /> {mac ? t('revealRoot') : t('revealRootOther')}
        </button>
      {/if}
      {#if app.pickingRoot}
        <span class="picking">{t('picking')} <button class="link" onclick={cancelPickRoot}>{t('cancel')}</button></span>
      {/if}
    </div>
  </div>
{:else}
  <div class="row">
    <span class="ico"><Icon name="folder" size={16} /></span>
    <div class="info">
      <div class="name">{t('roomRootLabel')}</div>
      <div class="detail mono">{root || t('roomRootUnset')}</div>
      {#if root}<div class="note">{where(root)}</div>{/if}
      {#if root && app.projects.length}<div class="note">{t('moveNote')}</div>{/if}
    </div>
    {#if app.pickingRoot}
      <button class="link" onclick={cancelPickRoot}>{t('cancel')}</button>
    {/if}
    {#if root}
      <button class="btn btn-ghost" onclick={revealRoomRoot}>{mac ? t('revealRoot') : t('revealRootOther')}</button>
    {/if}
    <button class="btn btn-ghost" onclick={root ? choose : () => use(fallback)} disabled={saving || app.pickingRoot}>
      {root ? t('change') : t('useThis')}
    </button>
  </div>
{/if}

<style>
  .big { display: flex; flex-direction: column; gap: 10px; }

  .option {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 16px 18px;
    border-radius: 12px;
    border: 1.5px solid var(--border);
    background: var(--surface);
    text-align: left;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .option:hover:not(:disabled):not(.static) { border-color: var(--border-strong); }
  .option.chosen { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

  .radio {
    flex: none;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid var(--border-strong);
    color: var(--accent-fg);
  }
  .chosen .radio { background: var(--accent); border-color: var(--accent); }

  .opt-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .opt-path { font-size: 14px; font-weight: 600; color: var(--fg); overflow-wrap: anywhere; }
  .opt-sub { font-size: 12.5px; color: var(--muted); }
  .badge {
    flex: none;
    font-size: 11.5px;
    font-weight: 620;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--ok-soft);
    color: var(--ok);
  }

  .other { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
  .picking { font-size: 12.5px; color: var(--muted); }

  .link { color: var(--accent); font-weight: 560; font-size: 13px; }
  .link:hover { text-decoration: underline; }

  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
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
  .info { flex: 1; min-width: 0; }
  .name { font-weight: 620; }
  .detail { font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; }
  .note { font-size: 12px; color: var(--faint); margin-top: 2px; }
</style>
