<script>
  import { fade, scale } from 'svelte/transition'
  import { app, copyText, reveal } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { shortPath } from '../lib/format.js'
  import Icon from './Icon.svelte'

  let help = $derived(app.desktopHelp)
  let copied = $state(false)

  async function copy() {
    copied = await copyText(help.roomPath, t('copied'))
  }

  function close() {
    app.desktopHelp = null
    copied = false
  }
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && help && close()} />

{#if help}
  <div class="scrim" transition:fade={{ duration: 140 }} onclick={close} role="presentation"></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dh-title" transition:scale={{ start: 0.96, duration: 160 }}>
    <h2 id="dh-title">{t('desktopHelpTitle')}</h2>
    <p class="intro">{t('desktopHelpIntro')}</p>
    <ol>
      <li>
        <span class="n">1</span>
        <div class="body">
          <span>{t('desktopStep1')}</span>
          <div class="path">
            <code title={help.roomPath}>{shortPath(help.roomPath)}</code>
            <button class="btn btn-ghost sm" onclick={copy}>
              {#if copied}<Icon name="check" size={13} /> {t('copied')}{:else}{t('copyPath')}{/if}
            </button>
          </div>
        </div>
      </li>
      <li><span class="n">2</span><div class="body">{t('desktopStep2')}</div></li>
      <li><span class="n">3</span><div class="body">{t('desktopStep3')}</div></li>
    </ol>
    <div class="actions">
      <button class="btn btn-ghost" onclick={() => reveal(help.projectId)}>
        <Icon name="folder" size={14} /> {app.env?.platform === 'darwin' || !app.env ? t('revealDarwin') : t('revealOther')}
      </button>
      <button class="btn btn-primary" onclick={close}>{t('gotIt')}</button>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(20, 18, 15, 0.38);
  }

  .dialog {
    position: fixed;
    z-index: 51;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    width: min(480px, calc(100vw - 32px));
    padding: 24px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }

  h2 { margin: 0 0 6px; font-size: 18px; }
  .intro { margin: 0 0 18px; color: var(--muted); }

  ol { list-style: none; margin: 0 0 22px; padding: 0; display: flex; flex-direction: column; gap: 14px; }
  li { display: flex; gap: 12px; align-items: flex-start; }
  .n {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12.5px;
    font-weight: 700;
  }
  .body { flex: 1; min-width: 0; padding-top: 2px; }

  .path {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 6px 6px 6px 12px;
    border-radius: 9px;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .path code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sm { height: 28px; padding: 0 10px; font-size: 12.5px; }

  .actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
