# Command reference

Run project commands from a registered project root or one of its subdirectories. Uppercase words in the examples stand for values you supply. Use `cc-bro --help` to see the installed CLI’s syntax.

## Setup and project policy

| Command | Behavior |
| --- | --- |
| `cc-bro setup` | Install or update the user-level Claude Code skill and its launcher. |
| `cc-bro init [--allow IDS] [--default-worker ID] [--json]` | Register this directory or update its policy. Separate IDs with commas. |

## Read the roster and propose notes

`cc-bro roster [--worker ID] [--full] [--json]` defaults to compact model families, effective defaults, input capabilities, notes and rules. Denied bros get one line without models; older models are folded. Use `--worker ID` for one bro and `--full` for exact variants, limits and full metadata. Read the compact view before every dispatch.

`cc-bro note WORKER TEXT [--json]` proposes a note. A user must accept it in Settings; proposing does not edit the current note.

## Dispatch and accept

```text
cc-bro say NAME MESSAGE [--worker ID] [--model MODEL] [--effort LEVEL] [--title TITLE] [--worktree] [--bg] [--json]
cc-bro review NAME --by ID [--model MODEL] [--effort LEVEL] [--bg] [--json]
cc-bro wait NAME TURN [--json]
cc-bro done NAME [--json]
```

Quote the message and any title containing spaces. Without `--bg`, `say` and `review` wait for the result; with it they return a receipt. `wait` takes a positive turn number from the receipt. `done` accepts a finished ticket. It does not merge a patch or accept linked tickets.

## Inspect work

| Command | Behavior |
| --- | --- |
| `cc-bro ls [--json]` | List tickets in the current project. |
| `cc-bro show NAME [--all] [--json]` | Show the current result, or conversation history with `--all`. |
| `cc-bro watch` | Follow project activity in the terminal. |
| `cc-bro ui [--no-open]` | Open the local board, or only print its URL. |

## Stop work

| Command | Scope |
| --- | --- |
| `cc-bro stop NAME [--json]` | Stop one named worker in the current project. |
| `cc-bro shutdown` | Stop the local runner, including running and queued turns across all its projects. Unfinished turns do not restart automatically. |


Use repeated `say --attach FILE` to send [native image attachments](model-inputs.md) to a supported CLI + model.
