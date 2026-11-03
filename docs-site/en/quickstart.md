# Your first ticket

Try a read-only task in a project you know. Start in the project root with a signed-in worker. This example asks where tests live; nothing needs to be changed.

## 1. Register the project

```sh
cc-bro init
```

At the prompts, enter the worker IDs you allow, then pick a default if you listed more than one. One ID is enough. The next command uses that default, so the same example works with any allowed bro. A new project inherits global defaults if you have already saved them.

## 2. Read the roster and send a named ticket

```sh
cc-bro roster
cc-bro say test-map "Locate the tests and tell me how to run one. Do not edit files." --bg --json
```

`--bg` returns a receipt while the worker continues. Read its `name` and `turn`. A new ticket named `test-map` starts at turn 1; a reused name continues the existing session.

## 3. Wait, check, accept

```sh
cc-bro wait test-map 1
cc-bro show test-map
cc-bro done test-map
```

Replace `1` with the turn in your receipt. Read the reply before running `done`. If the answer needs work, send another `say` with the same name, then wait for that receipt’s turn.

## Do the same from Claude Code

In your project chat, type `/cc-bro` and ask: “Find where the tests live. Don’t edit anything.” The skill dispatches the ticket and waits in the background. Open [the board](board.md) to see it run.
