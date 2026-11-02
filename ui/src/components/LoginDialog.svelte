<script>
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { app, startLogin, answerJob, cancelJob, copyText, login, toast } from '../lib/store.svelte.js'
  import { t, tf } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  let { provider, onclose } = $props()

  let jobId = $state(null)
  let starting = $state(true)
  let answer = $state('')
  let sending = $state(false)
  let job = $derived(jobId ? app.jobs[jobId] : null)
  let live = $derived(job && (job.state === 'running' || job.state === 'waiting'))

  async function begin() {
    starting = true
    answer = ''
    jobId = await startLogin(provider.id)
    starting = false
  }

  onMount(begin)

  $effect(() => {
    if (job?.state === 'done') toast(tf('loginDone', { name: provider.name }))
  })

  function close() {
    if (live) cancelJob(jobId)
    onclose()
  }

  async function send(value) {
    if (sending || !String(value).trim()) return
    sending = true
    await answerJob(jobId, String(value).trim())
    answer = ''
    sending = false
  }

  function terminal() {
    if (live) cancelJob(jobId)
    login(t('loginTerminalHint'))
    onclose()
  }

  function host(url) {
    try { return new URL(url).host } catch { return url }
  }
</script>

<Modal title={tf('loginTitle', { name: provider.name })} onclose={close} width={480}>
  {#if starting || (job && job.state === 'running' && !job.auth)}
    <div class="center" in:fade={{ duration: 120 }}>
      <span class="spin big"></span>
      <p>{t('loginStarting')}</p>
    </div>
  {:else if !job}
    <div class="center">
      <p class="err">{t('loginFailed')}</p>
    </div>
  {:else if job.state === 'done'}
    <div class="center" in:fade={{ duration: 150 }}>
      <span class="ok"><Icon name="check" size={22} /></span>
      <p class="strong">{tf('loginDone', { name: provider.name })}</p>
    </div>
  {:else if job.state === 'failed' || job.state === 'cancelled'}
    <div class="center" in:fade={{ duration: 150 }}>
      <span class="bad"><Icon name={job.state === 'failed' ? 'alert' : 'close'} size={20} /></span>
      <p class="strong">{job.state === 'failed' ? t('loginFailed') : t('loginCancelled')}</p>
      {#if job.state === 'failed' && job.log.length}<p class="why">{job.log[job.log.length - 1]}</p>{/if}
    </div>
  {:else}
    <div in:fade={{ duration: 150 }}>
      {#if job.auth && 'url' in job.auth}
        <p class="intro">{job.auth.instructions || t('loginUrlIntro')}</p>
        <div class="actions">
          <a class="btn btn-primary" href={job.auth.url} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> {t('loginOpen')}</a>
          <button class="btn btn-ghost" onclick={() => copyText(job.auth.url, t('copied'))}><Icon name="copy" size={14} /> {t('loginCopy')}</button>
        </div>
        <div class="url mono" title={job.auth.url}><span class="h">{host(job.auth.url)}</span>{job.auth.url.slice(job.auth.url.indexOf(host(job.auth.url)) + host(job.auth.url).length)}</div>
      {:else if job.auth}
        <p class="intro">{t('loginDeviceIntro')}</p>
        <div class="device">
          <a class="link mono" href={job.auth.verificationUri} target="_blank" rel="noreferrer">{job.auth.verificationUri} <Icon name="external" size={12} /></a>
          <div class="code-row">
            <span class="code mono">{job.auth.userCode}</span>
            <button class="btn btn-ghost sm" onclick={() => copyText(job.auth.userCode, t('copied'))}><Icon name="copy" size={13} /> {t('loginCopyCode')}</button>
          </div>
        </div>
      {/if}

      {#if job.state === 'waiting' && job.prompt}
        <div class="prompt" in:fade={{ duration: 150 }}>
          <div class="q">{job.prompt.message}</div>
          {#if job.prompt.options}
            <div class="opts">
              {#each job.prompt.options as o}
                <button class="btn btn-ghost" onclick={() => send(o.id)} disabled={sending}>{o.label}</button>
              {/each}
            </div>
          {:else}
            <form class="ans" onsubmit={e => { e.preventDefault(); send(answer) }}>
              <input type="text" autocomplete="off" spellcheck="false" placeholder={job.prompt.placeholder || ''} bind:value={answer} />
              <button class="btn btn-primary" type="submit" disabled={sending || !answer.trim()}>{t('loginSubmit')}</button>
            </form>
          {/if}
        </div>
      {:else}
        <div class="waiting"><span class="spin"></span> {t('loginWaiting')}</div>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    <button class="link-btn" onclick={terminal}><Icon name="terminal" size={13} /> {t('loginTerminal')}</button>
    <span class="grow"></span>
    {#if job?.state === 'failed' || job?.state === 'cancelled'}
      <button class="btn btn-ghost" onclick={close}>{t('close')}</button>
      <button class="btn btn-primary" onclick={begin}>{t('loginRetry')}</button>
    {:else if job?.state === 'done'}
      <button class="btn btn-primary" onclick={onclose}>{t('gotIt')}</button>
    {:else}
      <button class="btn btn-ghost" onclick={close}>{t('cancel')}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .center { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 0 8px; text-align: center; }
  .center p { margin: 0; color: var(--muted); }
  .center .strong { color: var(--fg); font-weight: 620; }
  .why { font-size: 12.5px; max-width: 40ch; }
  .err { color: var(--err) !important; }

  .ok, .bad {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: var(--ok-soft);
    color: var(--ok);
  }
  .bad { background: var(--err-soft); color: var(--err); }

  .intro { margin: 0 0 14px; color: var(--muted); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .actions a { text-decoration: none; }

  .url {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 9px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--faint);
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .url .h { color: var(--muted); }

  .device {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .link { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; }
  .code-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .code { font-size: 24px; font-weight: 700; letter-spacing: 0.12em; color: var(--fg); }
  .sm { height: 30px; padding: 0 11px; font-size: 12.5px; }

  .waiting { display: flex; align-items: center; gap: 9px; margin-top: 18px; font-size: 13px; color: var(--muted); }

  .prompt {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .q { font-weight: 600; font-size: 13.5px; margin-bottom: 10px; }
  .opts { display: flex; flex-wrap: wrap; gap: 8px; }
  .ans { display: flex; gap: 8px; }
  .ans input {
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 12px;
    border-radius: 9px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font-family: var(--mono);
    font-size: 12.5px;
    outline: 0;
  }
  .ans input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

  .link-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); }
  .link-btn:hover { color: var(--fg); }
  .grow { flex: 1; }

  .spin {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
    border-top-color: currentColor;
    animation: rot 0.7s linear infinite;
    flex: none;
  }
  .spin.big { width: 26px; height: 26px; border-width: 2.5px; color: var(--accent); }
  @keyframes rot { to { transform: rotate(360deg); } }
</style>
