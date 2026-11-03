# cc-bro

[中文](README.zh-CN.md) · [Website](https://cc-bro.yanauto.me/) · [Docs](https://cc-bro.yanauto.me/docs/) · [Changelog](CHANGELOG.md)

Your project’s Claude Code chat is the manager. cc-bro gives it a roster of your existing CLIs, models and effort levels, then delivers work to named, persistent sessions. Run jobs in parallel, clarify active work, ask a different worker to review a patch, and follow the results on a local board.

## Your tools, one roster

Run `cc-bro roster --json` before dispatch. The compact view gives Claude permitted model families, project permissions, login status, defaults, user notes and rules. Denied bros take one line; effort/fast variants share a row and older models are folded. Use `roster --worker codex --json --full` when you need detailed metadata or exact variants. It checks input capabilities first, then model descriptions and picks; user notes and rules take priority.

| Worker | Integration | Follow-up during a turn |
| --- | --- | --- |
| `codex` | Native Codex app-server, with an existing CLI login | Injects when the turn accepts steering; otherwise queues |
| `pi:<provider>` | pi RPC, one allowed ID per provider; includes Codex subscription login | Injects when pi confirms delivery; otherwise queues |
| `agy` | Native Antigravity CLI, structured events and ID resume | Queues for the next turn |
| `cursor-agent` | Native Cursor CLI, structured events and ID resume | Queues for the next turn |
| `custom:<name>` | Your tested new-session and resume command templates | Queues; detailed steps and cache are unavailable |

Built-in adapters expose what each CLI reports. Missing cache data stays unknown. Gemini CLI and OpenCode have editable custom presets; they must pass a real two-turn trial before use. Claude’s own work belongs in the manager’s native Claude Code subagents.

## Start in your project

Requires macOS, Node.js 24+, Claude Code and at least one worker CLI. Sign in with the worker’s own CLI.

```sh
npm install -g cc-bro@0.3.1
cc-bro setup
cc-bro init --allow codex,pi:openai-codex,agy,cursor-agent --default-worker codex
cc-bro roster
cc-bro ui
```

Use only the workers you want in `--allow`. With one worker, it is also the default. Plain `init` prompts on first use and preserves existing policy on later runs. In Claude Code, type **/cc-bro** and describe the task. Reopen the chat if the newly installed skill is not visible.

```sh
cc-bro say auth-fix "Fix the failing token expiry test." --worker codex --worktree --bg --json
cc-bro wait auth-fix 1
cc-bro say auth-fix "Cover expired refresh tokens too." --bg --json
cc-bro wait auth-fix 2
cc-bro review auth-fix --by pi:openai-codex --bg --json
cc-bro show auth-fix --json
cc-bro done auth-fix
```

Always wait for the name and turn in the receipt. An active follow-up can be injected into the same turn, queued for the next turn, or rejected with a reason. Accept the linked review separately. Different worker IDs can review each other; two pi models from the same provider count as the same worker.

Pass `--model EXACT_ID --effort LEVEL` on `say` or `review` using the roster. For pi, model IDs include `provider/`. Cursor can use a listed model variant or `--effort` with an explicit parameterized model. A name stays bound to its CLI, while the model and effort can change between completed turns.

## Settings and boundaries

Open **Settings** on the board to inspect CLIs, open installation or login commands in Terminal, set global defaults or project overrides, edit rules and notes, hide model families globally or per project, and test custom command templates. Hidden models are absent from the manager’s roster and rejected on dispatch. New installations and logins are discovered automatically without granting project permission. The template trial starts a new conversation and checks memory after resuming its exact ID. It uses two real prompts and may consume your CLI subscription.

The allowlist is enforced on every `say` and again before queued work starts. Rules are reminders in receipts and ticket details; Claude interprets them. Settings affect subsequent dispatches. Active turns keep their settings. The manager can propose a note with `cc-bro note WORKER "suggestion"`; only a user confirmation in Settings applies it.

cc-bro stores its settings and tickets in `~/.cc-bro/`, or `CC_BRO_HOME`. It reads public CLI commands and selected non-secret configuration fields. It never reads credential-file values or writes another CLI’s configuration. The CLI itself manages login, token refresh and its native session storage. A project gets only a self-ignored `.cc-bro/` identity marker.

Choose `--worktree` on the first message to start from committed HEAD in an independent branch. The board shows steps, changed files, reviews, cache readings and follow-up results. `done` leaves the worktree intact; the manager decides what to integrate and when to remove it.

## Upgrading and development

After installing 0.3.1, wait for work you want to preserve, then run `cc-bro shutdown` and `cc-bro setup`. Shutdown stops running and queued work across all projects on that runner. Unfinished turns do not automatically resume; written files remain. The new command can stop 0.1.0, M2, 0.2.0 and 0.3.0 runners. Existing 0.2 project policies, sessions and tickets carry forward without broadening access. [0.1.0 migration](docs-site/en/upgrade.md) also needs registration in the new registry; the old manager room is gone.

From source, use `npm ci --prefix ui`, `npm run build --prefix ui` and `npm test`. Tests use offline model fixtures; the installed Codex schema and Claude Code background-notification integration are also checked. Build public docs with `npm ci --prefix docs-site && npm run build --prefix docs-site`. `npm run install:local` builds and installs a tarball; use an isolated `CC_BRO_HOME` and `CC_BRO_PORT=0` for testing.

[Apache-2.0 license](LICENSE)

Model descriptions ship in `lib/model-catalog.json`; optional `~/.cc-bro/models.json` merges overrides by ID. CLI capability and limit data takes precedence over API catalog values. Send supported media with repeated `say --attach FILE`; see [Capabilities and attachments](docs-site/en/model-inputs.md).
