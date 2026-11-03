# Read the board

Open the local board to see what is waiting, what changed, and which completed turns still need a decision.

```sh
cc-bro ui
cc-bro ui --no-open
```

The first command opens a browser. The second prints the current local URL without opening one. Pick a project to see its tickets.

## Follow a ticket

- **Queued:** the ticket is waiting for a worker slot. A second ticket name can run in parallel when a slot is free.
- **Working:** the turn is running. Open the ticket for its latest steps, selected worker and model, branch and changed files when available.
- **Review:** the worker has returned a result for the manager to inspect. This column alone does not mean an independent reviewer has checked the work. Use `review --by` when you want one.
- **Done:** the manager accepted the ticket with `cc-bro done NAME`.

## Inspect the evidence

Use the detail view to read the reply and the timeline, including follow-up outcomes and links between writer and reviewer. The input cache ratio uses the worker’s last usage report. Missing usage is unknown, not a measured zero. Recorded file changes are a starting point for inspecting the checkout; they do not mean anything has been committed.

In a terminal, `cc-bro ls` lists this project’s tickets, `cc-bro watch` follows activity, and `cc-bro show NAME --all` prints the conversation history.


Open **Settings** in the header to manage the [roster](roster.md), [project policy](settings.md) and [custom templates](custom-cli.md). Ticket details include the selected effort, capability level, user note and rule reminders.
