<script>
  import { flip } from 'svelte/animate'
  import { app, removeCredential, removeProvider } from '../lib/store.svelte.js'
  import { t, tf } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import Section from './Section.svelte'
  import Modal from './Modal.svelte'

  let dialog = $state(null)
  let menu = $state(null)

  let connected = $derived((app.pi?.providers ?? []).filter(p => p.credential || p.source === 'custom'))
  let editable = kind => kind === 'api_key' || kind === 'oauth'

  function readyCount(p) {
    return (app.pi?.models ?? []).filter(m => m.provider === p.id && m.ready).length
  }

  function choose(p, method) {
    app.providerDialog = !p ? { type: 'custom' } : method === 'oauth' ? { type: 'login', provider: p } : { type: 'key', provider: p }
  }

  function add() {
    app.providerDialog = { type: 'add' }
  }

  async function confirm() {
    const { action, provider } = dialog
    dialog = null
    if (action === 'disconnect') await removeCredential(provider.id, t('provDisconnected'))
    else await removeProvider(provider.id, t('provDeleted'))
  }

  function initial(p) {
    return (p.name || p.id).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase()
  }
</script>

<svelte:window onclick={() => (menu = null)} />

<Section title={t('provTitle')} intro={t('provIntro')}>
  {#snippet actions()}
    <button class="btn btn-primary" onclick={add} disabled={!app.pi}><Icon name="plus" size={14} /> {t('provAdd')}</button>
  {/snippet}

  {#if app.pi && connected.length === 0}
    <div class="empty">
      <span class="empty-ic"><Icon name="key" size={20} /></span>
      <div class="empty-t">{t('provEmpty')}</div>
      <div class="empty-h">{t('provEmptyHint')}</div>
      <button class="btn btn-primary" onclick={add}><Icon name="plus" size={14} /> {t('provAdd')}</button>
    </div>
  {:else if app.pi}
    <ul class="list">
      {#each connected as p (p.id)}
        <li class="row" animate:flip={{ duration: 200 }}>
          <span class="avatar" class:custom={p.source === 'custom'}>{initial(p)}</span>
          <div class="info">
            <div class="line1">
              <span class="pname">{p.name}</span>
              <span class="pid mono">{p.id}</span>
              {#if p.source === 'custom'}<span class="chip">{t('provCustom')}</span>{/if}
            </div>
            <div class="line2">
              {#if p.credential?.hint === 'none'}
                <span class="cred none">{t('noKey')}</span>
              {:else if p.credential}
                <span class="cred {p.credential.kind}">
                  <Icon name={p.credential.kind === 'oauth' ? 'user' : p.credential.kind === 'api_key' ? 'key' : p.credential.kind === 'env' ? 'terminal' : 'server'} size={12} />
                  {t('cred_' + p.credential.kind)}
                </span>
                {#if p.credential.kind !== 'oauth' || p.credential.hint.includes('@')}<span class="hint mono">{p.credential.hint}</span>{/if}
              {/if}
              <span class="count">{readyCount(p)} {readyCount(p) === 1 ? t('provModel') : t('provModels')}</span>
              {#if p.baseUrl && p.source === 'custom'}<span class="hint mono url">{p.baseUrl}</span>{/if}
            </div>
            {#if p.credential && !editable(p.credential.kind)}<div class="envnote">{t('provEnvNote')}</div>{/if}
          </div>
          <div class="acts">
            {#if p.source === 'custom'}
              <button class="btn btn-ghost sm" onclick={() => (app.providerDialog = { type: 'custom', provider: p })}>{t('provEdit')}</button>
            {:else if p.credential?.kind === 'oauth'}
              <button class="btn btn-ghost sm" onclick={() => choose(p, 'oauth')}>{t('provRelogin')}</button>
            {:else if !p.credential || p.credential.kind === 'api_key'}
              <button class="btn btn-ghost sm" onclick={() => choose(p, 'api_key')}>{t('provChangeKey')}</button>
            {/if}
            {#if (p.credential && editable(p.credential.kind) && p.source !== 'custom') || p.source === 'custom'}
              <div class="more-wrap">
                <button class="icon-btn" aria-label="…" aria-expanded={menu === p.id} onclick={e => { e.stopPropagation(); menu = menu === p.id ? null : p.id }}><Icon name="more" size={16} /></button>
                {#if menu === p.id}
                  <div class="menu" role="menu">
                    {#if p.source === 'custom'}
                      <button role="menuitem" class="danger" onclick={() => (dialog = { type: 'confirm', action: 'delete', provider: p })}><Icon name="trash" size={14} /> {t('provDelete')}</button>
                    {:else}
                      {#if p.methods.includes('api_key') && p.credential.kind === 'oauth'}
                        <button role="menuitem" onclick={() => choose(p, 'api_key')}><Icon name="key" size={14} /> {t('methodKey')}</button>
                      {/if}
                      {#if p.methods.includes('oauth') && p.credential.kind === 'api_key'}
                        <button role="menuitem" onclick={() => choose(p, 'oauth')}><Icon name="user" size={14} /> {t('methodOauth')}</button>
                      {/if}
                      <button role="menuitem" class="danger" onclick={() => (dialog = { type: 'confirm', action: 'disconnect', provider: p })}><Icon name="close" size={14} /> {t('provDisconnect')}</button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="skeleton"></div>
  {/if}
</Section>

{#if dialog?.type === 'confirm'}
  <Modal title={dialog.action === 'delete' ? t('provDelete') : t('provDisconnect')} onclose={() => (dialog = null)} width={420}>
    <p class="confirm">{tf(dialog.action === 'delete' ? 'provDeleteConfirm' : 'provDisconnectConfirm', { name: dialog.provider.name })}</p>
    {#snippet footer()}
      <button class="btn btn-ghost" onclick={() => (dialog = null)}>{t('cancel')}</button>
      <button class="btn btn-danger" onclick={confirm}>{dialog.action === 'delete' ? t('provDelete') : t('provDisconnect')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 15px 16px 15px 18px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
  .row:first-child { border-top: 0; border-radius: 14px 14px 0 0; }
  .row:last-child { border-radius: 0 0 14px 14px; }
  .row:only-child { border-radius: 14px; }

  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
    font-size: 14px;
  }
  .avatar.custom { background: var(--surface-2); color: var(--muted); }

  .info { flex: 1; min-width: 0; }
  .line1 { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .pname { font-weight: 620; }
  .pid { font-size: 12px; color: var(--faint); }
  .line2 {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 3px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .cred {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 7px;
    border-radius: 6px;
    font-size: 11.5px;
    font-weight: 580;
    background: var(--ok-soft);
    color: var(--ok);
  }
  .cred.none, .cred.env, .cred.command, .cred.ambient { background: var(--surface-2); color: var(--muted); }
  .hint { font-size: 12px; color: var(--muted); }
  .url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
  .envnote { font-size: 12px; color: var(--faint); margin-top: 3px; }

  .acts { flex: none; display: flex; align-items: center; gap: 4px; }
  .sm { height: 30px; padding: 0 11px; font-size: 12.5px; }

  .more-wrap { position: relative; }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 30;
    min-width: 190px;
    padding: 5px;
    border-radius: 11px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 7px;
    font-size: 13px;
    text-align: left;
  }
  .menu button:hover { background: var(--surface-2); }
  .menu .danger { color: var(--err); }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 40px 20px;
    border-radius: 14px;
    border: 1.5px dashed var(--border-strong);
    text-align: center;
  }
  .empty-ic {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
    margin-bottom: 6px;
  }
  .empty-t { font-weight: 620; }
  .empty-h { color: var(--muted); font-size: 13px; margin-bottom: 10px; }

  .skeleton { height: 180px; border-radius: 14px; background: var(--surface-2); opacity: 0.6; }

  .confirm { margin: 0; color: var(--muted); }

  @media (max-width: 640px) {
    .row { flex-wrap: wrap; }
    .acts { width: 100%; justify-content: flex-end; }
  }
</style>
