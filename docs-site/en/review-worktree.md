# Worktrees and review

Choose a worktree when two writers could change the same checkout or when you want an isolated diff. Choose a review when a second worker should check a finished change before you accept it.

## Start an isolated change

From a Git repository with a commit, dispatch the writer with `--worktree` on its first message:

```sh
cc-bro say auth-fix "Fix token expiry and run its tests." --worker codex --worktree --bg --json
cc-bro wait auth-fix 1
```

The new branch and worktree start from committed HEAD. Uncommitted changes in your main checkout are not included. To work with those changes, omit `--worktree`. Reusing the name keeps the same checkout. You cannot move an existing ticket into a worktree by adding the flag later.

## Hand the finished turn to a reviewer

```sh
cc-bro review auth-fix --by pi:deepseek --bg --json
```

In this example, allow `codex` and `pi:deepseek` first. The reviewer gets the writer’s instructions for the completed turn, final reply and changed-file summary. It inspects the writer’s checkout. Keep that checkout stable until the review finishes.

The receipt contains the **review ticket’s own name and turn**. Use them with `cc-bro wait`, then read the findings. Send requested fixes to `auth-fix`; ask for a fresh review after the new turn. Accept reviewer and writer separately with `done`.

## Who can review?

Use a different allowed worker ID. Native `codex` can review `pi:openai-codex` or vice versa. Changing only the model within the same pi provider does not make it a different reviewer. If you want Claude to review, have the manager open a native Claude Code subagent.

`done` prints a cleanup reminder for a worktree. Check its changes and untracked files before you decide what to merge or remove. cc-bro does neither automatically.
