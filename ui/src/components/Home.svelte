<script>
  import { flip } from 'svelte/animate'
  import { fade } from 'svelte/transition'
  import { app, go, addProject, cancelPick, openChat, projectHash } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import Icon from './Icon.svelte'
  import ProjectCard from './ProjectCard.svelte'

  let sorted = $derived([...app.projects].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')))

  async function add() {
    const p = await addProject()
    if (p) go(projectHash(p.id))
  }
</script>

<section class="wrap">
  {#if app.env && (!app.env.ready || (app.settings && !app.settings.roomRoot))}
    <button class="banner" onclick={() => go('welcome')} transition:fade={{ duration: 150 }}>
      <Icon name="alert" size={16} />
      <span><strong>{t('setupNeeded')}</strong> · {t('setupIntro')}</span>
      <span class="go">{t('welcomeAgain')} →</span>
    </button>
  {/if}

  <div class="head">
    <div>
      <h1>{t('projects')}</h1>
      <p class="tag">{t('tagline')}</p>
    </div>
    <button class="btn btn-primary" onclick={add} disabled={app.picking}>
      <Icon name="plus" size={15} /> {t('addProject')}
    </button>
  </div>

  {#if app.picking}
    <p class="picking" transition:fade={{ duration: 120 }}><Icon name="folder" size={15} /> {t('picking')} <button class="link" onclick={cancelPick}>{t('cancel')}</button></p>
  {/if}

  {#if app.projectsLoaded && sorted.length === 0}
    <div class="empty">
      <div class="empty-art" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
      <h2>{t('noProjects')}</h2>
      <p>{t('noProjectsHint')}</p>
      <button class="btn btn-primary" onclick={add} disabled={app.picking}>
        <Icon name="folder" size={15} /> {t('addProject')}
      </button>
      <p class="fine">{t('addProjectHint')}</p>
    </div>
  {:else}
    <div class="grid">
      {#each sorted as p (p.id)}
        <div animate:flip={{ duration: 260 }}>
          <ProjectCard project={p} onopen={() => go(projectHash(p.id))} onchat={() => openChat(p.id, t('opened'))} />
        </div>
      {/each}
      {#if app.projectsLoaded}
        <button class="add" onclick={add} disabled={app.picking}>
          <span class="plus"><Icon name="plus" size={18} /></span>
          <span class="add-title">{t('addProject')}</span>
          <span class="add-hint">{t('addProjectHint')}</span>
        </button>
      {/if}
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

  .banner {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    margin-bottom: 24px;
    border-radius: var(--radius);
    background: var(--warn-soft);
    color: var(--warn);
    border: 1px solid color-mix(in srgb, var(--warn) 25%, transparent);
    text-align: left;
    font-size: 13.5px;
  }
  .banner span:nth-child(2) { flex: 1; color: var(--fg); }
  .banner strong { color: var(--warn); }
  .banner .go { font-weight: 600; white-space: nowrap; }

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

  .picking {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: -8px 0 18px;
    color: var(--muted);
    font-size: 13px;
  }

  .link {
    color: var(--accent);
    font-weight: 560;
    margin-left: 4px;
  }
  .link:hover { text-decoration: underline; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }

  .add {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 6px;
    min-height: 196px;
    padding: 22px;
    border-radius: var(--radius);
    border: 1.5px dashed var(--border-strong);
    color: var(--muted);
    text-align: left;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .add:hover:not(:disabled) { border-color: var(--accent); color: var(--fg); background: var(--accent-soft); }
  .plus {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--accent);
    margin-bottom: 6px;
  }
  .add-title { font-weight: 620; font-size: 15px; color: var(--fg); }
  .add-hint { font-size: 12.5px; line-height: 1.5; }

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
  .empty .fine { margin: 16px 0 0; font-size: 12.5px; color: var(--faint); }

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
