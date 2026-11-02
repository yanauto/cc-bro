<script>
  import { fade, scale } from 'svelte/transition'
  import { t } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'

  let { title, onclose, width = 480, children, footer } = $props()
  const id = 'm-' + Math.random().toString(36).slice(2, 8)
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && onclose()} />

<div class="scrim" transition:fade={{ duration: 140 }} onclick={onclose} role="presentation"></div>
<div class="dialog" style:--w="{width}px" role="dialog" aria-modal="true" aria-labelledby={id} transition:scale={{ start: 0.96, duration: 160 }}>
  <div class="head">
    <h2 {id}>{title}</h2>
    <button class="icon-btn" onclick={onclose} aria-label={t('close')}><Icon name="close" size={16} /></button>
  </div>
  <div class="body">{@render children()}</div>
  {#if footer}<div class="foot">{@render footer()}</div>{/if}
</div>

<style>
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
    width: min(var(--w), calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 18px 0 24px;
  }
  h2 { margin: 0; font-size: 17px; letter-spacing: -0.01em; }

  .body {
    padding: 14px 24px 22px;
    overflow: auto;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    padding: 14px 24px;
    border-top: 1px solid var(--border);
  }
</style>
