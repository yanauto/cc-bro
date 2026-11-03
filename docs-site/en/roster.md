# The worker roster

Before each dispatch, run `cc-bro roster --json`. The manager reads the live project roster and chooses a CLI, model and effort for the task. No backend gets automatic preference.

Every allowed bro includes its ID, executable, installation and version, login status, model catalog, detected and effective defaults, effort choices, capability level, steering behavior, user note and rules. Unknown means the CLI did not report a value. A model listed by a CLI is not a guarantee of account quota or availability.

```sh
cc-bro roster
cc-bro say investigate "Explain the failing test." --worker codex --model MODEL_FROM_ROSTER --effort low --bg --json
```

pi models use `provider/model-id`. Cursor can use a listed model variant, or `--effort` with an explicit parameterized model; cc-bro first resolves an exact listed effort variant, then uses `[effort=...]` for parameterized models. For pi and agy, reported effort choices refer to the current default model; another model may support different levels. The CLI validates the selection. A worker name remains tied to its backend, but a completed session can receive a different model or effort on its next turn.

The allowlist is a hard boundary, including pi’s individual providers. It is checked when a message is accepted and before queued work starts. Revoking a worker does not interrupt a turn already running. Rules are natural-language reminders in the receipt and board, not a second access-control engine. The manager evaluates whether a task follows them.

Settings and notes update on the next dispatch. A turn already accepted stores its model, effort and custom template; running work is unchanged. New defaults take effect on later dispatches, including an idle name. Explicit command options take precedence.

User notes take priority. The manager can propose a note, without applying it:

```sh
cc-bro note agy "Useful for a separate implementation review." --json
```

The user sees the current and proposed note in [Settings](settings.md), then accepts or dismisses it. Accepting replaces that bro’s note at the chosen scope. There is no CLI command for the manager to approve its own proposal.
