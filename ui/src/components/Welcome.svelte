<script>
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { app, go, addProject, cancelPick, openChat, reveal, copyText, saveSettings, markOnboarded, projectHash } from '../lib/store.svelte.js'
  import { t } from '../lib/i18n.svelte.js'
  import { shortPath, homeOf } from '../lib/format.js'
  import Icon from './Icon.svelte'
  import EnvList from './EnvList.svelte'
  import RoomRoot from './RoomRoot.svelte'

  const steps = ['stepEnv', 'stepRooms', 'stepProject', 'stepOpen']

  let envOk = $derived(!!app.env?.ready)
  let rootOk = $derived(!!app.settings?.roomRoot)
  let latest = $derived([...app.projects].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0])
  let chosen = $state(null)
  let project = $derived(app.projects.find(p => p.id === chosen) || latest)
  let done = $derived([envOk, rootOk, !!project, false])

  function firstOpen() {
    if (!app.env?.ready) return 0
    if (!app.settings?.roomRoot) return 1
    if (!app.projects.length) return 2
    return 3
  }

  let step = $state(firstOpen())
  let dir = $state(1)
  let settled = $state(false)

  $effect(() => {
    if (!settled && app.env && app.settings && app.projectsLoaded) {
      settled = true
      step = firstOpen()
    }
  })

  function goto(i) {
    settled = true
    dir = i > step ? 1 : -1
    step = i
  }

  async function add() {
    const p = await addProject()
    if (p) chosen = p.id
  }

  function launch(client) {
    if (app.settings?.client !== client) saveSettings({ client })
    openChat(project.id, t('opened'), client)
  }

  function finish() {
    markOnboarded()
    go(project ? projectHash(project.id) : '')
  }

  let cmd = $derived(project ? `cd ${shortPath(project.repoPath)} && cc-bro` : 'cc-bro')
  let revealLabel = $derived(app.env?.platform === 'darwin' || !app.env ? t('revealDarwin') : t('revealOther'))
</script>

<section class="wrap">
  <header class="intro">
    <h1>{t('welcomeTitle')}</h1>
    <p>{t('welcomeIntro')}</p>
  </header>

  <ol class="steps">
    {#each steps as s, i}
      <li class:current={i === step} class:done={done[i] && i !== step}>
        <button onclick={() => goto(i)} disabled={i > 0 && !done[i - 1] && !done[i]}>
          <span class="num">{#if done[i] && i !== step}<Icon name="check" size={13} />{:else}{i + 1}{/if}</span>
          <span class="lbl">{t(s)}</span>
        </button>
      </li>
    {/each}
  </ol>

  <div class="stage">
    {#key step}
      <div class="panel" in:fly={{ x: 24 * dir, duration: 240, easing: cubicOut }}>
        {#if step === 0}
          <h2>{t('setupTitle')}</h2>
          <p class="lead">{t('setupIntro')}</p>
          <EnvList />
          <div class="nav">
            <span></span>
            <div class="right">
              {#if !envOk}<button class="btn btn-ghost" onclick={() => goto(1)}>{t('skipForNow')}</button>{/if}
              <button class="btn btn-primary" onclick={() => goto(1)} disabled={!envOk}>{t('next')} →</button>
            </div>
          </div>
        {:else if step === 1}
          <h2>{t('roomsTitle')}</h2>
          <p class="lead">{t('roomsIntro')}</p>
          <div class="diagram" aria-hidden="true">
            <div class="d-box"><span class="d-k">{t('projects')}</span><span class="mono">{homeOf(app.settings?.defaultRoomRoot) || '~'}/code/my-app/</span><span class="d-s">{t('staysUntouched')}</span></div>
            <div class="d-arrow">→</div>
            <div class="d-box accent"><span class="d-k">{t('roomRootLabel')}</span><span class="mono">{app.settings?.roomRoot || app.settings?.defaultRoomRoot || '~/cc-bro'}/my-app/</span><span class="d-s">CLAUDE.md · brief.md · decisions.md</span></div>
          </div>
          <RoomRoot big />
          <div class="nav">
            <button class="btn btn-ghost" onclick={() => goto(0)}>← {t('backStep')}</button>
            <button class="btn btn-primary" onclick={() => goto(2)} disabled={!rootOk}>{t('next')} →</button>
          </div>
        {:else if step === 2}
          <h2>{t('projectTitle')}</h2>
          <p class="lead">{t('projectIntro')} <span class="mono">{app.settings?.roomRoot || ''}</span></p>
          {#if project}
            <div class="ready">
              <span class="ok"><Icon name="check" size={15} /></span>
              <div class="ready-body">
                <div class="ready-title">{t('projectReady')} · <strong>{project.name}</strong></div>
                <div class="ready-row"><span class="k">{t('projects')}</span><span class="mono">{project.repoPath}</span></div>
                <div class="ready-row"><span class="k">{t('roomRootLabel')}</span><span class="mono">{project.roomPath}</span></div>
              </div>
            </div>
            <button class="btn btn-ghost" onclick={add} disabled={app.picking}><Icon name="folder" size={14} /> {t('pickAnother')}</button>
          {:else}
            <button class="pick" onclick={add} disabled={app.picking}>
              <span class="pick-ic"><Icon name="folder" size={20} /></span>
              <span class="pick-t">{t('addProject')}</span>
              <span class="pick-s">{t('addProjectHint')}</span>
            </button>
          {/if}
          {#if app.picking}
            <p class="picking">{t('picking')} <button class="link" onclick={cancelPick}>{t('cancel')}</button></p>
          {/if}
          <div class="nav">
            <button class="btn btn-ghost" onclick={() => goto(1)}>← {t('backStep')}</button>
            <button class="btn btn-primary" onclick={() => goto(3)} disabled={!project}>{t('next')} →</button>
          </div>
        {:else}
          <h2>{t('openTitle')}</h2>
          <p class="lead">{t('openIntro')}</p>
          {#if project}
            <div class="clients">
              <button class="client" class:pref={(app.settings?.client || 'terminal') === 'terminal'} onclick={() => launch('terminal')}>
                <span class="c-ic"><Icon name="terminal" size={20} /></span>
                <span class="c-t">{t('viaTerminal')}</span>
                <span class="c-s">{t('viaTerminalHint')}</span>
              </button>
              <button class="client" class:pref={app.settings?.client === 'desktop'} onclick={() => launch('desktop')}>
                <span class="c-ic"><Icon name="chat" size={20} /></span>
                <span class="c-t">{t('viaDesktop')}</span>
                <span class="c-s">{t('viaDesktopHint')}</span>
              </button>
            </div>
            <div class="minor">
              <button class="link" onclick={() => reveal(project.id)}>{revealLabel}</button>
              <span class="dotsep">·</span>
              <button class="link" onclick={() => copyText(project.roomPath, t('copied'))}>{t('copyPath')}</button>
            </div>

            <div class="say">
              <div class="say-k">{t('tryAsk')}</div>
              <div class="say-v">
                <span>“{t('trySample')}”</span>
                <button class="icon-btn" onclick={() => copyText(t('trySample'), t('copied'))} aria-label={t('copy')}><Icon name="copy" size={14} /></button>
              </div>
            </div>

            <div class="tip">
              <div class="tip-t"><Icon name="bolt" size={14} /> {t('tipTitle')}</div>
              <div class="tip-b">{t('tipBody')}</div>
              <div class="cmd">
                <code>{cmd}</code>
                <button class="btn btn-ghost sm" onclick={() => copyText(cmd, t('copied'))}><Icon name="copy" size={13} /> {t('copy')}</button>
              </div>
            </div>
          {/if}
          <div class="nav">
            <button class="btn btn-ghost" onclick={() => goto(2)}>← {t('backStep')}</button>
            <button class="btn btn-primary" onclick={finish}>{t('goBoard')} →</button>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</section>


<style>
  .wrap {
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    padding: 40px 24px 72px;
  }

  .intro h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; }
  .intro p { margin: 6px 0 0; color: var(--muted); font-size: 15px; }

  .steps {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin: 28px 0 22px;
    padding: 0;
  }
  .steps li button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 12px;
    border-radius: 11px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    text-align: left;
    font-size: 13px;
    font-weight: 560;
  }
  .steps li button:disabled { opacity: 0.55; }
  .steps li.current button { border-color: var(--accent); color: var(--fg); box-shadow: 0 0 0 3px var(--accent-soft); }
  .steps li.done button { color: var(--fg); }
  .num {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface-2);
    font-size: 12px;
    font-weight: 700;
  }
  .current .num { background: var(--accent); color: var(--accent-fg); }
  .done .num { background: var(--ok-soft); color: var(--ok); }
  .lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .stage { position: relative; }

  h2 { margin: 0 0 6px; font-size: 20px; letter-spacing: -0.01em; }
  .lead { margin: 0 0 18px; color: var(--muted); line-height: 1.6; }

  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 22px;
  }
  .right { display: flex; gap: 8px; }

  .diagram {
    display: flex;
    align-items: stretch;
    gap: 10px;
    margin-bottom: 16px;
  }
  .d-box {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px;
    border-radius: 11px;
    border: 1px solid var(--border);
    background: var(--surface);
    min-width: 0;
  }
  .d-box.accent { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); background: var(--accent-soft); }
  .d-k { font-size: 11.5px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .d-box .mono { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .d-s { font-size: 12px; color: var(--muted); }
  .d-arrow { align-self: center; color: var(--faint); font-size: 18px; }

  .pick {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 36px 20px;
    border-radius: 14px;
    border: 1.5px dashed var(--border-strong);
    background: var(--surface);
    text-align: center;
    transition: border-color 0.15s, background 0.15s;
  }
  .pick:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-soft); }
  .pick-ic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); margin-bottom: 4px; }
  .pick-t { font-weight: 640; font-size: 15px; }
  .pick-s { font-size: 12.5px; color: var(--muted); max-width: 380px; }

  .picking { margin: 12px 0 0; font-size: 13px; color: var(--muted); }
  .link { color: var(--accent); font-weight: 560; font-size: 13px; }
  .link:hover { text-decoration: underline; }

  .ready {
    display: flex;
    gap: 12px;
    padding: 16px 18px;
    margin-bottom: 12px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--ok) 35%, var(--border));
    background: var(--ok-soft);
  }
  .ok { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--ok); color: #fff; }
  .ready-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .ready-title { font-weight: 600; margin-bottom: 2px; }
  .ready-row { display: flex; gap: 10px; font-size: 12.5px; min-width: 0; }
  .ready-row .k { flex: none; width: 92px; color: var(--muted); }
  .ready-row .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .clients {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .client {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 18px;
    border-radius: 14px;
    border: 1.5px solid var(--border);
    background: var(--surface);
    text-align: left;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  }
  .client:hover { border-color: var(--accent); box-shadow: var(--shadow-md); transform: translateY(-1px); }
  .client.pref { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
  .c-ic { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; background: var(--accent-soft); color: var(--accent); margin-bottom: 6px; }
  .c-t { font-weight: 640; font-size: 15px; }
  .c-s { font-size: 12.5px; color: var(--muted); }

  .minor { display: flex; align-items: center; gap: 8px; margin: 12px 2px 0; }
  .dotsep { color: var(--faint); }

  .say {
    margin-top: 20px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .say-k { font-size: 11.5px; font-weight: 620; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .say-v { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 14px; }

  .tip {
    margin-top: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .tip-t { display: flex; align-items: center; gap: 6px; font-weight: 620; color: var(--accent); }
  .tip-b { font-size: 13px; color: var(--muted); margin: 4px 0 8px; }
  .cmd {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 12px;
    border-radius: 9px;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .cmd code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sm { height: 28px; padding: 0 10px; font-size: 12.5px; }

  @media (max-width: 640px) {
    .wrap { padding: 24px 14px 56px; }
    .steps { grid-template-columns: repeat(2, 1fr); }
    .clients { grid-template-columns: 1fr; }
    .diagram { flex-direction: column; }
    .d-arrow { transform: rotate(90deg); }
  }
</style>
