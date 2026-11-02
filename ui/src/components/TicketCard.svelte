<script>
  import { app } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { duration, ago, liveElapsed } from '../lib/format.js'

  let { ticket, selected = false, onclick } = $props()

  let modelShort = $derived((ticket.model || '').split('/').pop())
  let elapsed = $derived(liveElapsed(ticket, app.now))
</script>

<button class="tc {ticket.status}" class:selected class:flagged={!!ticket.flag} {onclick}>
  <div class="top">
    <span class="title">{ticket.title}</span>
    {#if ticket.flag === 'error'}
      <span class="chip err">{t('error')}</span>
    {:else if ticket.flag === 'stopped'}
      <span class="chip stopped">{t('stopped')}</span>
    {/if}
  </div>

  {#if ticket.status === 'working' && ticket.activity}
    <div class="activity">
      <span class="dot pulse"></span>
      <span class="act-text">{ticket.activity}</span>
    </div>
  {/if}

  <div class="foot">
    <span class="chip model" title={ticket.model}>{modelShort}</span>
    {#if ticket.turn > 1}<span class="turn" title={t('turn')}>×{ticket.turn}</span>{/if}
    <span class="spacer"></span>
    {#if ticket.status === 'working' || ticket.status === 'review'}
      <span class="time">{duration(elapsed)}</span>
    {:else if ticket.status === 'done'}
      <span class="time">{ago(ticket.updatedAt, app.now)}</span>
    {:else}
      <span class="time">{ago(ticket.createdAt, app.now)}</span>
    {/if}
  </div>
</button>

<style>
  .tc {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px 12px 10px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    text-align: left;
    transition: box-shadow 0.15s, border-color 0.15s, transform 0.15s;
  }
  .tc:hover { box-shadow: var(--shadow-md); border-color: var(--border-strong); }
  .tc.selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-md); }

  .tc.working::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--col-working);
  }
  .tc.review:not(.flagged)::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--col-review);
  }
  .tc.flagged { border-color: color-mix(in srgb, var(--err) 30%, var(--border)); }
  .tc.done .title { color: var(--muted); }

  .top {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .title {
    flex: 1;
    font-size: 13.5px;
    font-weight: 580;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }

  .activity {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--muted);
    min-width: 0;
  }
  .activity .dot { width: 7px; height: 7px; background: var(--accent); }
  .act-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--mono);
    font-size: 12px;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .model { max-width: 60%; }
  .turn { font-size: 11.5px; font-weight: 620; color: var(--muted); }
  .spacer { flex: 1; }
  .time {
    font-size: 11.5px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
