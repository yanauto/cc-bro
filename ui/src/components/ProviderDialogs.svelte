<script>
  import { app, refreshPi } from '../lib/store.svelte.js'
  import AddProvider from './AddProvider.svelte'
  import KeyDialog from './KeyDialog.svelte'
  import LoginDialog from './LoginDialog.svelte'
  import CustomProvider from './CustomProvider.svelte'

  let d = $derived(app.providerDialog)

  $effect(() => {
    if (d && !app.pi) refreshPi()
  })

  function close() {
    app.providerDialog = null
  }

  function choose(p, method) {
    if (!p) app.providerDialog = { type: 'custom' }
    else if (method === 'oauth') app.providerDialog = { type: 'login', provider: p }
    else app.providerDialog = { type: 'key', provider: p }
  }
</script>

{#if d?.type === 'add'}
  <AddProvider onclose={close} onchoose={choose} />
{:else if d?.type === 'key'}
  <KeyDialog provider={d.provider} onclose={close} />
{:else if d?.type === 'login'}
  <LoginDialog provider={d.provider} onclose={close} />
{:else if d?.type === 'custom'}
  <CustomProvider provider={d.provider} onclose={close} />
{/if}
