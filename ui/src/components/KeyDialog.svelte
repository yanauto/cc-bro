<script>
  import { setKey, toast } from '../lib/store.svelte.js'
  import { t, tf } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  let { provider, onclose } = $props()

  let key = $state('')
  let reveal = $state(false)
  let saving = $state(false)
  let error = $state('')

  async function save(e) {
    e.preventDefault()
    if (!key.trim() || saving) return
    saving = true
    error = ''
    const err = await setKey(provider.id, key.trim())
    saving = false
    if (err) error = err
    else {
      key = ''
      toast(t('provConnected') + ' · ' + provider.name)
      onclose()
    }
  }

  function focus(node) {
    node.focus()
  }
</script>

<Modal title={tf('keyTitle', { name: provider.name })} {onclose} width={460}>
  <form id="keyform" onsubmit={save}>
    <label class="lbl" for="k">{t('keyLabel')}</label>
    <div class="field" class:bad={error}>
      <input id="k" type={reveal ? 'text' : 'password'} autocomplete="off" spellcheck="false" placeholder={t('keyPlaceholder')} bind:value={key} use:focus oninput={() => (error = '')} />
      <button type="button" class="eye" onclick={() => (reveal = !reveal)}>{reveal ? t('hide') : t('show')}</button>
    </div>
    {#if error}<p class="err"><Icon name="alert" size={14} /> {error}</p>{/if}
    <p class="note"><Icon name="key" size={13} /> {t('keyNote')}</p>
    <p class="adv">{t('keyAdvanced')}</p>
  </form>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>{t('cancel')}</button>
    <button class="btn btn-primary" type="submit" form="keyform" disabled={!key.trim() || saving}>
      {#if saving}<span class="spin"></span>{t('keySaving')}{:else}{t('keySave')}{/if}
    </button>
  {/snippet}
</Modal>

<style>
  .lbl { display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
  .field {
    display: flex;
    align-items: center;
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    padding: 0 6px 0 12px;
  }
  .field:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .field.bad { border-color: var(--err); }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--fg);
    font-family: var(--mono);
    font-size: 13px;
  }
  .eye { font-size: 12px; color: var(--muted); padding: 4px 8px; border-radius: 6px; }
  .eye:hover { background: var(--surface-2); color: var(--fg); }

  .err { display: flex; align-items: center; gap: 6px; margin: 8px 0 0; color: var(--err); font-size: 13px; }
  .note { display: flex; align-items: center; gap: 6px; margin: 14px 0 0; font-size: 12.5px; color: var(--muted); }
  .adv { margin: 6px 0 0; font-size: 12px; color: var(--faint); }

  .spin {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
    border-top-color: currentColor;
    animation: rot 0.7s linear infinite;
  }
  @keyframes rot { to { transform: rotate(360deg); } }
</style>
