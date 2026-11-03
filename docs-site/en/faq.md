# Frequently asked questions

Start with the message you saw, or the part of a ticket that surprised you.

## Why is a signed-in worker “not allowed”?

Login and project permission are separate. In the project root, run `cc-bro init` to see the saved policy. Update the explicit list if needed. `codex`, `pi:openai-codex` and `pi:deepseek` are three different IDs. See [Project allowlist](allowlist.md).

## Why can’t I change a worker’s model?

A name belongs to one native session. Use a new name to change worker or model. For pi, run `pi --list-models` and supply the complete `provider/model-id` from the permitted provider.

## I closed the manager chat. Did the ticket stop?

Closing the chat does not stop the local runner. Use `cc-bro ls`, inspect `cc-bro show NAME --json` and run `cc-bro wait NAME TURN` for the outstanding turn. To cancel just that worker use `cc-bro stop NAME`.

## Why can’t the reviewer see my latest edits?

A worktree starts from committed HEAD. Check the writer’s branch and files on the board. Wait for the correct turn, including any queued follow-up, and keep the writer’s checkout stable during review. See [Worktrees and review](review-worktree.md).

## Where do I enter a key or open the old manager room?

In 0.2.0, sign in with your chosen worker CLI and open Claude Code in your actual project. The board has no provider-login screen. For an incompatible old runner, follow [Upgrade from 0.1.0](upgrade.md).
