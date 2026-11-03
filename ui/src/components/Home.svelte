<script>
  import { flip } from 'svelte/animate'
  import { fade } from 'svelte/transition'
  import { app, go, projectHash } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import ProjectCard from './ProjectCard.svelte'

  let sorted = $derived([...app.projects].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')))

</script>

<section class="wrap">

  <div class="head">
    <div>
      <h1>{t('projects')}</h1>
      <p class="tag">{t('tagline')}</p>
    </div>

  </div>

  {#if app.projectsLoaded && sorted.length === 0}
    <div class="empty">
      <div class="empty-art" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
      <h2>{t('noProjects')}</h2>
      <p>{t('noProjectsHint')}</p>

      <code>cc-bro init</code>
    </div>
  {:else}
    <div class="grid">
      {#each sorted as p (p.id)}
        <div animate:flip={{ duration: 260 }}>
          <ProjectCard project={p} onopen={() => go(projectHash(p.id))} />
        </div>
      {/each}

    </div>
  {/if}
</section>

<style>
  .wrap {
    width: 100%;
    max-width: 1180px;
    margin: 0 auto;
    padding: 32px 24px 64px;
  }

  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 22px;
  }

  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .tag {
    margin: 4px 0 0;
    color: var(--muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 72px 24px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
  }
  .empty h2 { margin: 18px 0 6px; font-size: 18px; }
  .empty p { margin: 0 0 20px; color: var(--muted); max-width: 420px; }

  .empty-art {
    display: grid;
    grid-template-columns: repeat(4, 34px);
    gap: 6px;
  }
  .empty-art span {
    height: 46px;
    border-radius: 7px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .empty-art span:nth-child(2) { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }

  @media (max-width: 640px) {
    .wrap { padding: 22px 14px 48px; }
    .head { align-items: flex-start; flex-direction: column; }
  }
</style>
