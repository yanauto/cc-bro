# Steer a running ticket

Send another `say` to the same name when you want to clarify a task already in progress. Use a different name when the work should run in parallel.

```sh
cc-bro say auth-fix "Fix the token expiry test." --bg --json
cc-bro say auth-fix "Also cover an expired refresh token." --bg --json
```

## Read the second receipt

| Outcome | What to do |
| --- | --- |
| `injected` | The worker confirmed delivery in the current turn. Wait for the turn in this receipt. |
| `queued` | The instruction is for the next turn. Wait for the returned turn before reviewing or accepting the work. |
| `rejected` | Read the reason. If delivery was uncertain, inspect `cc-bro show auth-fix --all` before retrying so the instruction is not sent twice. |

If the original turn has already finished, the second `say` simply starts a new turn in the same session. When you reopen the manager chat, use `cc-bro ls` and `cc-bro show auth-fix --json` to find the ticket and reattach a wait.
