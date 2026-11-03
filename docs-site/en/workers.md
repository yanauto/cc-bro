# Workers and login

Choose the environment you want a ticket to run in. Codex, pi, agy and cursor-agent have built-in adapters with named sessions, worktrees and reviews. Custom CLIs provide a tested subset. Read the [roster](roster.md) before choosing.

## Native Codex

Use `codex` as the worker ID if you want your installed Codex CLI to run the task using its own login and app-server. If needed, install the CLI, sign in, then check its status:

```sh
npm install -g @openai/codex
codex login
codex login status
```

If app-server is unavailable before a turn is submitted, cc-bro can fall back to `codex exec`. Follow-ups on that transport wait for the next turn.

## pi: subscription or provider account

Choose `pi:<provider>` to run in pi with that provider’s models. Install pi if needed, then start it:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
```

Inside pi, type `/login`. For a Codex subscription, choose OpenAI Codex and complete its sign-in flow. Use `pi:openai-codex` in cc-bro. For DeepSeek, choose the provider in pi and supply its API key there, or configure the provider through pi’s supported environment. Use `pi:deepseek` in cc-bro. A native Codex login does not replace pi’s own login.

Check the provider you chose in a terminal. These checks do not print credentials:

```sh
pi auth check --provider openai-codex --no-refresh
pi auth check --provider deepseek --no-refresh
pi --list-models
```

## Choose per ticket

```sh
cc-bro say inspect "Explain the test layout." --worker pi:openai-codex
cc-bro say inspect-native "Explain the test layout." --worker codex
```

Allow both IDs first if you want to compare them. With pi, omit `--model` to let pi choose within the allowed provider. To pin a model on a new ticket, pass `--model provider/model-id` using an exact entry from pi’s list. A name stays bound to its worker; model and effort can change between completed turns.

## Antigravity and Cursor

Use worker IDs `agy` and `cursor-agent`. Their structured events provide steps, and their explicit session IDs preserve context. Follow-ups while running queue for the next turn. agy exposes cache usage when its model reports it; Cursor cache stays unknown unless the result supplies it.

Use Settings to open the official install or update command in Terminal. Sign in through `agy` or `cursor-agent login`. Confirm models using `agy models` or `cursor-agent --list-models`, and Cursor login with `cursor-agent status`. agy’s read-only `agy -p /model --output-format json` and `/effort` report current choices.

A listed model can still fail due to quota, account permissions or region restrictions. cc-bro reports the CLI error; it does not silently switch models or buy credits. Your existing CLI tools and MCP setup remain available, so give each task a clear scope.

For Gemini CLI, OpenCode or another program, use [custom templates](custom-cli.md). A successful trial is required before saving.
