# Workers and login

Choose the environment you want a ticket to run in. Both backends support named sessions, steering, worktrees and reviews. You can use either one on its own.

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

Allow both IDs first if you want to compare them. With pi, omit `--model` to let pi choose within the allowed provider. To pin a model on a new ticket, pass `--model provider/model-id` using an exact entry from pi’s list. A name stays bound to its worker and model; choose a new name to switch.
