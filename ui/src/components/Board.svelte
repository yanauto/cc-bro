<script>
  import { flip } from 'svelte/animate'
  import { crossfade, fade, scale } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { app, go, removeProject, loadTickets, copyText } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { shortPath } from '../lib/format.js'
  import Icon from './Icon.svelte'
  import TicketCard from './TicketCard.svelte'
  import Drawer from './Drawer.svelte'
  import OpenButton from './OpenButton.svelte'

  let { id } = $props()

  const cols = ['queued', 'working', 'review', 'done']

  const [send, receive] = crossfade({
    duration: d => Math.min(520, Math.sqrt(d) * 22),
    easing: cubicOut,
    fallback: (node) => scale(node, { start: 0.94, duration: 220, opacity: 0 })
  })

  let project = $derived(app.projects.find(p => p.id === id))
  let tickets = $derived(app.tickets[id] || [])
  let loaded = $derived(!!app.ticketsLoaded[id])
  let selected = $state(new URLSearchParams(location.search).get('ticket'))
  let menuOpen = $state(false)
  let confirming = $state(false)

  const order = {
    queued: (a, b) => a.createdAt.localeCompare(b.createdAt),
    working: (a, b) => (a.startedAt || a.updatedAt).localeCompare(b.startedAt || b.updatedAt),
    review: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
    done: (a, b) => b.updatedAt.localeCompare(a.updatedAt)
  }

  let columns = $derived(Object.fromEntries(cols.map(c => [c, tickets.filter(x => x.status === c).sort(order[c])])))

  $effect(() => {
    if (!app.tickets[id]) loadTickets(id)
  })

  function onkey(e) {
    if (e.key === 'Escape') {
      if (confirming) confirming = false
      else if (menuOpen) menuOpen = false
    }
  }
</script>

<svelte:window onkeydown={onkey} onclick={() => (menuOpen = false)} />

<section class="board">
  <div class="bar">
    <div class="who">
      <button class="icon-btn" onclick={() => go('')} title={t('back')} aria-label={t('back')}>
        <Icon name="back" size={18} />
      </button>
      <div class="meta">
        <h1>{project?.name ?? id}</h1>
        {#if project}<div class="path mono" title={project.repoPath}>{shortPath(project.repoPath)}</div>{/if}
      </div>
    </div>
    <div class="actions">
      {#if project}<OpenButton {project} />{/if}
      <div class="menu-wrap">
        <button class="icon-btn" aria-label="More" aria-expanded={menuOpen} onclick={e => { e.stopPropagation(); menuOpen = !menuOpen }}>
          <Icon name="more" size={18} />
        </button>
        {#if menuOpen}
          <div class="menu" transition:scale={{ start: 0.96, duration: 120 }}>
            <button class="item danger" onclick={() => { menuOpen = false; confirming = true }}>
              <Icon name="trash" size={15} /> {t('remove')}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if loaded && tickets.length === 0}
    <div class="hint" in:fade={{ duration: 160 }}>
      <Icon name="chat" size={16} />
      <div>
        <strong>{t('noTickets')}</strong>
        <span>{t('noTicketsHint')}</span>
        {#if project}
          <span class="tipline">{t('tipBody')} <button class="cmdchip mono" onclick={() => copyText(`cd ${shortPath(project.repoPath)} && cc-bro`, t('copied'))}>cd {shortPath(project.repoPath)} && cc-bro</button></span>
        {/if}
      </div>
    </div>
  {/if}

  <div class="cols">
    {#each cols as c}
      <div class="col {c}">
        <div class="col-head">
          <span class="dot {c}"></span>
          <span class="col-name">{t(c)}</span>
          <span class="col-n">{columns[c].length}</span>
        </div>
        <div class="col-body">
          {#each columns[c] as ticket (ticket.id)}
            <div class="slot" in:receive={{ key: ticket.id }} out:send={{ key: ticket.id }} animate:flip={{ duration: 280, easing: cubicOut }}>
              <TicketCard {ticket} selected={selected === ticket.id} onclick={() => (selected = ticket.id)} />
            </div>
          {/each}
          {#if loaded && columns[c].length === 0}
            <div class="col-empty">{t('emptyColumn')}</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</section>

{#if selected}
  <Drawer projectId={id} ticketId={selected} onclose={() => (selected = null)} />
{/if}

{#if confirming}
  <div class="scrim" transition:fade={{ duration: 140 }} onclick={() => (confirming = false)} role="presentation"></div>
  <div class="dialog" role="dialog" aria-modal="true" transition:scale={{ start: 0.96, duration: 160 }}>
    <h2>{t('remove')}</h2>
    <p>{t('removeConfirm')}</p>
    <div class="dialog-actions">
      <button class="btn btn-ghost" onclick={() => (confirming = false)}>{t('cancel')}</button>
      <button class="btn btn-danger" onclick={() => { confirming = false; removeProject(id) }}>{t('confirmRemove')}</button>
    </div>
  </div>
{/if}

<style>
  .board {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    padding: 20px 24px 28px;
    min-height: 0;
    min-width: 0;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .who .icon-btn { margin-left: -6px; }

  .meta { min-width: 0; }

  h1 {
    margin: 0;
    font-size: 21px;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .path {
    font-size: 12px;
    color: var(--faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }

  .menu-wrap { position: relative; }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    min-width: 200px;
    padding: 5px;
    border-radius: 11px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    transform-origin: top right;
  }

  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border-radius: 7px;
    font-size: 13.5px;
    text-align: left;
  }
  .item:hover { background: var(--surface-2); }
  .item.danger { color: var(--err); }

  .hint {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    padding: 13px 16px;
    margin-bottom: 16px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .hint div { display: flex; flex-direction: column; gap: 2px; }
  .hint strong { color: var(--fg); font-weight: 620; }
  .hint span { color: var(--muted); font-size: 13px; }
  .tipline { margin-top: 4px; }
  .cmdchip {
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--fg);
    font-size: 12px;
  }
  .cmdchip:hover { border-color: var(--accent); }

  .cols {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(4, minmax(240px, 1fr));
    gap: 14px;
    min-height: 0;
  }

  .col {
    display: flex;
    flex-direction: column;
    min-height: 320px;
    border-radius: 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .col-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px 10px;
    font-size: 13px;
    font-weight: 620;
  }
  .col-name { flex: 1; }
  .col-n {
    min-width: 22px;
    height: 20px;
    padding: 0 6px;
    display: inline-grid;
    place-items: center;
    border-radius: 6px;
    font-size: 11.5px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    background: var(--surface);
    color: var(--muted);
  }

  .dot.queued { background: var(--col-queued); }
  .dot.working { background: var(--col-working); }
  .dot.review { background: var(--col-review); }
  .dot.done { background: var(--col-done); }

  .col.working .col-head { color: var(--fg); }

  .col-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 2px 10px 12px;
    overflow-y: auto;
  }

  .col-empty {
    margin-top: 4px;
    padding: 18px 0;
    text-align: center;
    font-size: 12.5px;
    color: var(--faint);
    border: 1.5px dashed var(--border-strong);
    border-radius: 10px;
  }

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
    width: min(420px, calc(100vw - 32px));
    padding: 22px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .dialog h2 { margin: 0 0 8px; font-size: 17px; }
  .dialog p { margin: 0 0 20px; color: var(--muted); }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

  @media (max-width: 1100px) {
    .cols { overflow-x: auto; grid-template-columns: repeat(4, minmax(250px, 1fr)); padding-bottom: 6px; }
  }

  @media (max-width: 640px) {
    .board { padding: 14px 12px 20px; }
    .bar { flex-wrap: wrap; }
    .cols { grid-template-columns: repeat(4, 82vw); scroll-snap-type: x mandatory; }
    .col { scroll-snap-align: start; }
    .actions .btn { height: 32px; }
  }
</style>
