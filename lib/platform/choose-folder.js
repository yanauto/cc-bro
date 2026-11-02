ObjC.import('AppKit')

function run(args = []) {
  const app = $.NSApplication.sharedApplication
  app.setActivationPolicy($.NSApplicationActivationPolicyRegular)
  const panel = $.NSOpenPanel.openPanel
  panel.title = args[0] === 'rooms' ? 'Choose where to keep manager rooms' : 'Choose a project for cc-bro'
  panel.canChooseFiles = false
  panel.canChooseDirectories = true
  panel.allowsMultipleSelection = false
  app.activateIgnoringOtherApps(true)
  if (panel.runModal !== $.NSModalResponseOK) return JSON.stringify({ cancelled: true })
  return JSON.stringify({ path: ObjC.unwrap(panel.URL.path) })
}
