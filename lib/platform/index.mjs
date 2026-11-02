function unsupported() {
  throw new Error('cc-bro desktop integration currently requires macOS')
}

export const platform = process.platform === 'darwin' ? await import('./macos.mjs') : {
  startService: unsupported, removeService: unsupported, openTerminal: unsupported, pickFolder: unsupported,
  openBrowser: unsupported, hasDesktop: async () => false, openDesktop: unsupported, reveal: unsupported,
  piCommand: unsupported, owned: unsupported, reap: unsupported
}
