# The worker roster

Before each dispatch, run `cc-bro roster --json`. The manager reads the live project roster and chooses a CLI, model and effort for the task. No backend gets automatic preference.

The default output is compact in both text and JSON. Denied bros contain only their ID and `allowed:false`, even with `--full`. Allowed bros retain effective defaults, login, capability level, user notes and rules. Unknown means the CLI did not report a value. A model listed by a CLI is not a guarantee of account quota or availability.

```sh
cc-bro roster
cc-bro roster --worker codex --json
cc-bro roster --worker codex --json --full
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


## Compact and detailed views

Each current model family takes one text line: a real detected model ID, confirmed inputs, tier/grade, reported effort choices and one sentence. Effort and fast variants share a row; `variantCount` and `fast` describe the group. The representative ID is the effective default when present, otherwise a listed base ID or first listed variant. It is never an invented model name. Effort choices come from model metadata and variant IDs; empty choices mean unknown. If variants disagree on an input capability, the grouped value is `unknown`; inspect the specific variant before dispatching media.

Models explicitly labeled `previous generation`, `superseded` or `being retired` in the catalog are folded into one count per bro (`olderModels`). Their IDs are available with `--full`. A folded default stays visible as `defaultModel`, with `defaultFolded:true`; cc-bro never silently changes it. Unmatched models are not classified as old by guessing their version number.

`--json` has `mode:"compact"`. Each model keeps `id`, `efforts`, `capabilities.input` and a small `catalog` with `id`, `tier`, `grade`, one-sentence `summary`, `as_of` and `stale`. `picks` refers only to models in the current view. User notes and rules are preserved without truncation. `--json --full` restores individual variants, older models, complete catalog records, token limits, sources and detection metadata for allowed bros, with `mode:"full"`. Hidden models remain hidden in both modes.

Use `--worker ID` to restrict either mode to one detected bro. An unknown ID is an error. Prefer the compact view before dispatch; request `--full` only for details that matter to the task. The board's Settings page still exposes the full detected model list for configuration.

## Automatic discovery and hidden models

Each roster refresh checks the installed CLIs and their current public model lists. Newly installed or newly signed-in workers appear automatically. `allowed` still describes the project permission: discovery does not grant access. Signed-out and missing native CLIs are omitted. A tested custom template with configured models is shown with unknown login because it has no generic authentication detector.

Settings can hide model families per bro, globally or per project. Effort and speed variants of a hidden family are hidden together. Hidden models disappear from the manager’s roster and picks; explicit dispatch, implicit defaults and queued starts also reject them. Choose a visible default rather than relying on an automatic replacement. A project can override the global hidden list or restore inheritance.

## Model catalog

The built-in `lib/model-catalog.json` ships in the npm package and public source. Optional `~/.cc-bro/models.json` (or `$CC_BRO_HOME/models.json`) merges `models` entries by exact `id`; omitted fields remain inherited. `summary` and `modalities` merge by field. A root `picks` map and `effort_advice` can also override the built-in guidance. Changes are read on the next roster call.

```json
{"models":[{"id":"gpt-6.1-sol","summary":{"en":"Our default coder."},"grade":"Team preferred"}]}
```

Matching uses an exact model ID or alias after removing the CLI provider prefix and documented effort/speed suffixes; there is no fuzzy match. Unmatched models get no invented description. Full JSON includes the complete matched catalog entry and [input capability evidence](model-inputs.md); both modes include `picks` and `effort_advice`. Descriptions older than 60 days, or without a valid `as_of`, are flagged stale; the skill asks the user to refresh them. These comparisons came from research and are not independently verified.
