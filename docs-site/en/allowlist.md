# Project allowlist

Grant access to exactly the worker IDs this project may use. Each pi provider is a separate permission. Allowing native Codex does not grant `pi:openai-codex`, even when both use the same subscription.

## Set the default

```sh
cc-bro init --allow codex,pi:deepseek --default-worker codex
```

Run this in the project root. A plain `say` uses the default; `--worker pi:deepseek` overrides it for a new name. An ID outside the list is rejected before dispatch. In a terminal, plain `init` prompts on first use. In scripts, supply the list and, when needed, the default.

## Change the policy

```sh
cc-bro init --allow pi:deepseek --default-worker pi:deepseek
```

An explicit list replaces the previous list. With one ID the default is implied. Rerunning `init` without flags preserves existing choices. Workers already bound to a ticket keep their identity; changing the default does not reassign the ticket.

The project gets a self-ignored `.cc-bro/` identity marker. The registry and ticket history live in `~/.cc-bro/` by default. Run project commands in the root or one of its subdirectories.

Global defaults and project overrides are available in [Settings](settings.md). An explicit `init --allow` selects a local policy again. New projects without explicit flags inherit a configured global policy; existing projects keep their original permissions. Running turns are unaffected by revocation; queued turns are checked again before starting.
