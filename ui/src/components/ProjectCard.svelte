<script>
  import { app } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { ago, shortPath } from '../lib/format.js'
  import Icon from './Icon.svelte'

  let { project, onopen, onchat } = $props()

  const cols = ['queued', 'working', 'review', 'done']
  let total = $derived(cols.reduce((n, c) => n + (project.counts?.[c] || 0), 0))
  let active = $derived((project.counts?.working || 0) > 0)

  function chat(e) {
    e.stopPropagation()
    onchat()
  }
</script>

<div class="card" role="link" tabindex="0" onclick={onopen} onkeydown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onopen())}>
  <div class="row">
    <div class="title">
      <span class="name">{project.name}</span>
      {#if active}<span class="dot live pulse" title={t('working')}></span>{/if}
    </div>
    {#if project.attention > 0}
      <span class="attn">{project.attention} {project.attention === 1 ? t('needsYouOne') : t('needsYou')}</span>
    {/if}
  </div>
  <div class="path mono" title={project.repoPath}>{shortPath(project.repoPath)}</div>

  <div class="bar" aria-hidden="true">
    {#if total === 0}
      <span class="seg empty"></span>
    {:else}
      {#each cols as c}
        {#if project.counts?.[c]}
          <span class="seg {c}" style="flex: {project.counts[c]}"></span>
        {/if}
      {/each}
    {/if}
  </div>

  <div class="counts">
    {#each cols as c}
      <div class="count">
        <span class="n">{project.counts?.[c] || 0}</span>
        <span class="l"><span class="dot {c}"></span>{t(c)}</span>
      </div>
    {/each}
  </div>

  <div class="foot">
    <span class="when">{t('updated')} {ago(project.updatedAt, app.now)}</span>
    <button class="btn btn-ghost sm" onclick={chat}>
      <Icon name="chat" size={14} /> {t('openChatShort')}
    </button>
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 196px;
    padding: 18px 18px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    transition: box-shadow 0.18s, border-color 0.18s, transform 0.18s;
  }
  .card:hover {
    box-shadow: var(--shadow-md);
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .name {
    font-size: 16px;
    font-weight: 650;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .live { background: var(--accent); }

  .attn {
    flex: none;
    font-size: 11.5px;
    font-weight: 620;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--warn-soft);
    color: var(--warn);
  }

  .path {
    color: var(--faint);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: -4px;
  }

  .bar {
    display: flex;
    gap: 3px;
    height: 6px;
    margin-top: 6px;
  }
  .seg { border-radius: 3px; min-width: 6px; transition: flex 0.4s ease; }
  .seg.empty { flex: 1; background: var(--surface-2); }
  .seg.queued { background: var(--col-queued); opacity: 0.55; }
  .seg.working { background: var(--col-working); }
  .seg.review { background: var(--col-review); }
  .seg.done { background: var(--col-done); opacity: 0.75; }

  .counts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .count { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .n { font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
  .l {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .l .dot { width: 6px; height: 6px; }
  .dot.queued { background: var(--col-queued); }
  .dot.working { background: var(--col-working); }
  .dot.review { background: var(--col-review); }
  .dot.done { background: var(--col-done); }

  .foot {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .when { font-size: 12px; color: var(--faint); }
  .sm { height: 28px; padding: 0 10px; font-size: 12.5px; border-radius: 8px; }
</style>
