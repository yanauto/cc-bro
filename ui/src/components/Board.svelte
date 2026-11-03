<script>
  import { flip } from 'svelte/animate'
  import { crossfade, fade, scale } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { app, go, loadTickets } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { shortPath } from '../lib/format.js'
  import Icon from './Icon.svelte'
  import TicketCard from './TicketCard.svelte'
  import Drawer from './Drawer.svelte'

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

</script>

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
  </div>

  {#if loaded && tickets.length === 0}
    <div class="hint" in:fade={{ duration: 160 }}>
      <Icon name="chat" size={16} />
      <div>
        <strong>{t('noTickets')}</strong>
        <span>{t('noTicketsHint')}</span>

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
  <Drawer onselect={name => (selected = name)} projectId={id} ticketId={selected} onclose={() => (selected = null)} />
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

  @media (max-width: 1100px) {
    .cols { overflow-x: auto; grid-template-columns: repeat(4, minmax(250px, 1fr)); padding-bottom: 6px; }
  }

  @media (max-width: 640px) {
    .board { padding: 14px 12px 20px; }
    .bar { flex-wrap: wrap; }
    .cols { grid-template-columns: repeat(4, 82vw); scroll-snap-type: x mandatory; }
    .col { scroll-snap-align: start; }
  }
</style>
