<script>
  import { fly, fade } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { app, api } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { duration, ago, clock, liveElapsed } from '../lib/format.js'
  import Icon from './Icon.svelte'

  let { projectId, ticketId, onclose } = $props()

  let detail = $state(null)
  let failed = $state(null)

  let live = $derived((app.tickets[projectId] || []).find(x => x.id === ticketId))
  let ticket = $derived(live ? { ...detail, ...live } : detail)
  let signature = $derived(live ? `${live.status}|${live.flag}|${live.turn}|${live.updatedAt}` : '')

  $effect(() => {
    signature
    let cancelled = false
    api.getTicket(projectId, ticketId).then(d => {
      if (!cancelled) { detail = d; failed = null }
    }).catch(e => {
      if (!cancelled) failed = e.message
    })
    return () => { cancelled = true }
  })

  function onkey(e) {
    if (e.key === 'Escape') onclose()
  }

  const statusColor = { queued: 'var(--col-queued)', working: 'var(--col-working)', review: 'var(--col-review)', done: 'var(--col-done)' }
</script>

<svelte:window onkeydown={onkey} />

<div class="scrim" transition:fade={{ duration: 160 }} onclick={onclose} role="presentation"></div>

<aside class="drawer" transition:fly={{ x: 420, duration: 260, easing: cubicOut, opacity: 1 }} aria-label={ticket?.title}>
  <div class="head">
    <div class="status">
      {#if ticket}
        <span class="dot" class:pulse={ticket.status === 'working'} style="background: {statusColor[ticket.status]}"></span>
        <span>{t(ticket.status)}</span>
        {#if ticket.flag === 'error'}<span class="chip err">{t('error')}</span>{/if}
        {#if ticket.flag === 'stopped'}<span class="chip stopped">{t('stopped')}</span>{/if}
      {/if}
    </div>
    <button class="icon-btn" onclick={onclose} aria-label={t('close')}><Icon name="close" size={18} /></button>
  </div>

  {#if failed && !ticket}
    <div class="body"><p class="muted">{t('somethingWrong')}: {failed}</p></div>
  {:else if !ticket}
    <div class="body">
      <div class="sk w70"></div><div class="sk w40"></div><div class="sk block"></div>
    </div>
  {:else}
    <div class="body">
      <h2>{ticket.title}</h2>

      <dl class="facts">
        <div><dt>{t('model')}</dt><dd class="mono">{ticket.model}</dd></div>
        <div><dt>{t('turn')}</dt><dd>{ticket.turn}</dd></div>
        <div><dt>{t('elapsed')}</dt><dd>{duration(liveElapsed(ticket, app.now))}</dd></div>
        <div><dt>{t('updated')}</dt><dd>{ago(ticket.updatedAt, app.now)}</dd></div>
      </dl>

      {#if ticket.status === 'working' && ticket.activity}
        <div class="now">
          <span class="dot pulse"></span>
          <span class="mono">{ticket.activity}</span>
        </div>
      {/if}

      <section>
        <h3>{t('lastReply')}</h3>
        {#if detail?.lastReply}
          <div class="reply">{detail.lastReply}</div>
        {:else}
          <p class="muted">{t('noReply')}</p>
        {/if}
      </section>

      {#if detail?.timeline?.length}
        <section>
          <h3>{t('timeline')}</h3>
          <ol class="timeline">
            {#each [...detail.timeline].reverse() as e, i (e.ts + i)}
              <li class="k-{e.kind}">
                <span class="tl-dot"></span>
                <span class="tl-text">{e.summary}</span>
                <span class="tl-time">{clock(e.ts)}</span>
              </li>
            {/each}
          </ol>
        </section>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(20, 18, 15, 0.22);
  }

  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 41;
    width: min(460px, 100vw);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 14px 0 22px;
    border-bottom: 1px solid var(--border);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
  }

  .body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 22px 32px;
  }

  h2 {
    margin: 0 0 16px;
    font-size: 18px;
    line-height: 1.4;
    letter-spacing: -0.01em;
    word-break: break-word;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 16px;
    margin: 0 0 18px;
    padding: 14px 16px;
    border-radius: 11px;
    background: var(--surface-2);
  }
  .facts div { min-width: 0; }
  dt { font-size: 11.5px; color: var(--muted); margin-bottom: 2px; }
  dd { margin: 0; font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .now {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 12px;
    margin-bottom: 18px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--fg);
    font-size: 12.5px;
  }
  .now .dot { width: 7px; height: 7px; background: var(--accent); }

  section { margin-top: 22px; }

  h3 {
    margin: 0 0 10px;
    font-size: 11.5px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .reply {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13.5px;
    line-height: 1.65;
    padding: 14px 16px;
    border-radius: 11px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .muted { color: var(--muted); margin: 0; }

  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    position: relative;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 4px;
    top: 8px;
    bottom: 8px;
    width: 1px;
    background: var(--border-strong);
  }
  .timeline li {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 5px 0;
    font-size: 13px;
  }
  .tl-dot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--surface);
    border: 2px solid var(--border-strong);
    transform: translateY(1px);
  }
  .timeline li.k-reply .tl-dot, .timeline li.k-message .tl-dot { border-color: var(--accent); }
  .timeline li.k-error .tl-dot { border-color: var(--err); }
  .tl-text { flex: 1; min-width: 0; word-break: break-word; }
  .tl-time { flex: none; font-size: 11.5px; color: var(--faint); font-variant-numeric: tabular-nums; }

  .sk {
    height: 14px;
    border-radius: 6px;
    background: var(--surface-2);
    margin-bottom: 10px;
    animation: shimmer 1.2s ease-in-out infinite alternate;
  }
  .w70 { width: 70%; height: 20px; }
  .w40 { width: 40%; }
  .block { height: 140px; margin-top: 20px; }
  @keyframes shimmer { from { opacity: 0.6; } to { opacity: 1; } }
</style>
