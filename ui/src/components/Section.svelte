<script>
  let { title, intro = '', children, actions } = $props()
</script>

<div class="section">
  <div class="top">
    <div class="titles">
      <h2>{title}</h2>
      {#if intro}<p>{intro}</p>{/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
  {@render children()}
</div>

<style>
  .section + :global(.section) { margin-top: 34px; }
  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }
  .titles { min-width: 0; }
  h2 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
  p { margin: 4px 0 0; color: var(--muted); max-width: 60ch; }
  .actions { flex: none; display: flex; gap: 8px; }

  @media (max-width: 640px) {
    .top { flex-direction: column; align-items: stretch; }
  }
</style>
