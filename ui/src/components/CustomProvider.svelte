<script>
  import { untrack } from 'svelte'
  import { app, addProvider, toast } from '../lib/store.svelte.js'
  import { t, tf } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  let { provider = null, onclose } = $props()

  const apis = [
    { id: 'openai-completions', label: 'OpenAI Chat Completions' },
    { id: 'openai-responses', label: 'OpenAI Responses' },
    { id: 'anthropic-messages', label: 'Anthropic Messages' },
    { id: 'google-generative-ai', label: 'Google Gemini' }
  ]

  const init = untrack(() => provider)
  const editing = !!init
  let id = $state(init?.id ?? '')
  let name = $state(init?.name ?? '')
  let baseUrl = $state(init?.baseUrl ?? '')
  let api = $state(init?.api ?? 'openai-completions')
  let key = $state('')
  let models = $state(editing ? untrack(() => app.pi?.models ?? []).filter(m => m.provider === init.id).map(m => m.id.slice(init.id.length + 1)).join('\n') : '')
  let auto = $state(!editing)
  let touched = $state(false)
  let saving = $state(false)
  let error = $state('')

  let list = $derived(models.split(/[\n,]/).map(s => s.trim()).filter(Boolean))
  let errId = $derived(!/^[a-z0-9][a-z0-9-]*$/.test(id) ? t('errId') : !editing && (app.pi?.providers ?? []).some(p => p.id === id) ? t('errIdTaken') : '')
  let errBase = $derived(!/^https?:\/\/\S+$/.test(baseUrl.trim()) ? t('errBase') : '')
  let errModels = $derived(list.length === 0 ? t('errModels') : '')
  let valid = $derived(!errId && !errBase && !errModels)

  $effect(() => {
    if (auto) id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  })

  async function save(e) {
    e.preventDefault()
    touched = true
    if (!valid || saving) return
    saving = true
    error = ''
    const body = { id, name: name.trim() || undefined, baseUrl: baseUrl.trim(), api, models: [...new Set(list)].map(m => ({ id: m })) }
    if (key.trim()) body.key = key.trim()
    const err = await addProvider(body)
    saving = false
    if (err) error = err
    else {
      toast(t('provConnected') + ' · ' + (name.trim() || id))
      onclose()
    }
  }
</script>

<Modal title={editing ? tf('customEditTitle', { name: provider.name }) : t('customTitle')} {onclose} width={520}>
  <form id="customform" class="form" onsubmit={save}>
    <div class="two">
      <label class="f">
        <span class="l">{t('customName')} <em>{t('optional')}</em></span>
        <input type="text" bind:value={name} placeholder="My proxy" />
      </label>
      <label class="f">
        <span class="l">{t('customId')}</span>
        <input class="mono" type="text" bind:value={id} oninput={() => (auto = false)} disabled={editing} placeholder="my-proxy" autocomplete="off" spellcheck="false" class:bad={touched && errId} />
        {#if touched && errId}<span class="e">{errId}</span>{:else}<span class="h">{t('customIdHint')}</span>{/if}
      </label>
    </div>

    <label class="f">
      <span class="l">{t('customBase')}</span>
      <input class="mono" type="url" bind:value={baseUrl} placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false" class:bad={touched && errBase} />
      {#if touched && errBase}<span class="e">{errBase}</span>{/if}
    </label>

    <label class="f">
      <span class="l">{t('customApi')}</span>
      <div class="select">
        <select bind:value={api}>
          {#each apis as a}<option value={a.id}>{a.label}</option>{/each}
        </select>
        <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </div>
    </label>

    <label class="f">
      <span class="l">{t('customKey')} <em>{t('optional')}</em></span>
      <input class="mono" type="password" bind:value={key} autocomplete="off" spellcheck="false" placeholder={editing ? '••••••••' : 'sk-…'} />
      <span class="h">{editing ? t('customKeyKeep') : t('customKeyHint')}</span>
    </label>

    <label class="f">
      <span class="l">{t('customModels')}</span>
      <textarea class="mono" rows="4" bind:value={models} placeholder={'qwen3-coder\nllama-4-scout'} spellcheck="false" class:bad={touched && errModels}></textarea>
      {#if touched && errModels}<span class="e">{errModels}</span>{:else}<span class="h">{t('customModelsHint')}</span>{/if}
    </label>

    {#if error}<p class="err"><Icon name="alert" size={14} /> {error}</p>{/if}
  </form>

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>{t('cancel')}</button>
    <button class="btn btn-primary" type="submit" form="customform" disabled={saving}>
      {#if saving}<span class="spin"></span>{t('keySaving')}{:else}{editing ? t('customUpdate') : t('customSave')}{/if}
    </button>
  {/snippet}
</Modal>

<style>
  .form { display: flex; flex-direction: column; gap: 14px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .f { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .l { font-weight: 600; font-size: 13px; }
  .l em { font-style: normal; font-weight: 450; color: var(--faint); font-size: 12px; margin-left: 4px; }
  .h { font-size: 12px; color: var(--faint); }
  .e { font-size: 12px; color: var(--err); }

  input, textarea, select {
    width: 100%;
    border-radius: 9px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    outline: 0;
  }
  input, select { height: 36px; padding: 0 12px; }
  textarea { padding: 9px 12px; resize: vertical; line-height: 1.5; }
  input.mono, textarea.mono { font-family: var(--mono); font-size: 12.5px; }
  input:focus, textarea:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  input:disabled { opacity: 0.6; }
  .bad { border-color: var(--err) !important; }

  .select { position: relative; }
  select { appearance: none; padding-right: 32px; cursor: pointer; }
  .chev { position: absolute; right: 12px; top: 12px; color: var(--muted); pointer-events: none; }

  .err { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--err); font-size: 13px; }

  .spin {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
    border-top-color: currentColor;
    animation: rot 0.7s linear infinite;
  }
  @keyframes rot { to { transform: rotate(360deg); } }

  @media (max-width: 520px) {
    .two { grid-template-columns: 1fr; }
  }
</style>
