<script>
  import { slide } from 'svelte/transition'
  import { app } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  let { onclose, onchoose } = $props()

  let q = $state('')
  let open = $state(null)

  const popular = ['openai-codex', 'anthropic', 'github-copilot', 'deepseek', 'zai', 'zai-coding-cn', 'moonshotai', 'kimi-coding', 'openrouter', 'openai', 'google', 'xai', 'minimax']
  const rank = id => (popular.indexOf(id) + 1) || 999

  let options = $derived((app.pi?.providers ?? [])
    .filter(p => p.source === 'builtin' && !p.credential)
    .toSorted((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
    .filter(p => !q.trim() || (p.name + ' ' + p.id).toLowerCase().includes(q.trim().toLowerCase())))

  function pick(p) {
    if (p.methods.length === 1) onchoose(p, p.methods[0])
    else open = open === p.id ? null : p.id
  }

  function go(p, method) {
    onchoose(p, method)
  }

  function focus(node) {
    node.focus()
  }
</script>

<Modal title={t('addTitle')} {onclose} width={520}>
  <label class="search">
    <Icon name="search" size={15} />
    <input type="text" placeholder={t('addSearch')} bind:value={q} use:focus aria-label={t('addSearch')} />
  </label>

  <div class="group">{t('addBuiltin')}</div>
  <ul class="opts">
    {#if !app.pi}<li class="none">…</li>{/if}
    {#each options as p (p.id)}
      <li>
        <button class="opt" class:expanded={open === p.id} onclick={() => pick(p)} aria-expanded={p.methods.length > 1 ? open === p.id : undefined}>
          <span class="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
          <span class="txt">
            <span class="n">{p.name}</span>
            <span class="i mono">{p.id}</span>
          </span>
          <span class="methods">
            {#if p.methods.includes('oauth')}<span class="m"><Icon name="user" size={12} /></span>{/if}
            {#if p.methods.includes('api_key')}<span class="m"><Icon name="key" size={12} /></span>{/if}
          </span>
        </button>
        {#if open === p.id}
          <div class="choices" transition:slide={{ duration: 160 }}>
            <button class="choice" onclick={() => go(p, 'oauth')}>
              <Icon name="user" size={15} />
              <span><span class="ct">{t('methodOauth')}</span><span class="ch">{t('methodOauthHint')}</span></span>
            </button>
            <button class="choice" onclick={() => go(p, 'api_key')}>
              <Icon name="key" size={15} />
              <span><span class="ct">{t('methodKey')}</span><span class="ch">{t('methodKeyHint')}</span></span>
            </button>
          </div>
        {/if}
      </li>
    {:else}
      <li class="none">{t('addNone')}</li>
    {/each}
  </ul>

  <button class="custom" onclick={() => go(null)}>
    <span class="avatar alt"><Icon name="server" size={15} /></span>
    <span class="txt">
      <span class="n">{t('addCustomTitle')}</span>
      <span class="h">{t('addCustomHint')}</span>
    </span>
    <Icon name="plus" size={15} />
  </button>
</Modal>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
  }
  .search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--fg);
    font: inherit;
  }

  .group {
    margin: 16px 2px 6px;
    font-size: 11.5px;
    font-weight: 620;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .opts {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 320px;
    overflow: auto;
  }

  .opt, .custom {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 9px 10px;
    border-radius: 10px;
    text-align: left;
  }
  .opt:hover, .opt.expanded, .custom:hover { background: var(--surface-2); }

  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
    font-size: 13px;
  }
  .avatar.alt { background: var(--surface-2); color: var(--muted); }

  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .n { font-weight: 600; }
  .i { font-size: 11.5px; color: var(--faint); }
  .h { font-size: 12.5px; color: var(--muted); }

  .methods { display: flex; gap: 4px; color: var(--faint); }
  .m { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--surface-2); }

  .choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 6px 10px 10px 52px; }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    text-align: left;
  }
  .choice:hover { border-color: var(--accent); }
  .choice :global(svg) { margin-top: 2px; color: var(--accent); flex: none; }
  .ct { display: block; font-weight: 600; font-size: 13px; }
  .ch { display: block; font-size: 12px; color: var(--muted); }

  .none { padding: 12px 10px; color: var(--muted); font-size: 13px; }

  .custom {
    margin-top: 10px;
    border: 1.5px dashed var(--border-strong);
    padding: 12px;
    color: var(--muted);
  }
  .custom .n { color: var(--fg); }

  @media (max-width: 520px) {
    .choices { grid-template-columns: 1fr; padding-left: 10px; }
  }
</style>
