---
name: crew
description: Delegate work to a named pi agent, continue or steer its conversation, check progress, stop work, and receive background results. Use when the user asks to send a model to work, such as “让 deepseek 去这个目录查一下”, “接着刚才那段补上”, or “看看老弟们在干嘛”.
---

Use cc-bro from PATH. Inside a manager room the CLI automatically selects the project and uses its repository as the worker's default directory. Keep the room as the manager's working directory and delegate code work to workers. Use a short stable ticket name for revisions. Pass the caller's chosen provider/model when specified. Quote names, paths, and message text as separate shell arguments.

- To delegate, run cc-bro say with a short name, the user's concrete assignment, an optional --title, and the requested provider/model. Supply --cwd only when the user wants a different worker directory. For example, run `cc-bro say tests "查一下这里的失败用例，告诉我怎么复现。" --cwd "/path/to/project" --model deepseek/deepseek-flash`.
- For a background assignment, call `cc-bro say tests "运行测试，报告失败用例。" --bg --json`. Read the conversation name and turn number from its receipt. Immediately use the Bash tool with `run_in_background: true` to run `cc-bro wait tests 1 --json`, substituting the actual name and turn. The wait command exits with the recorded result and Claude Code receives the background task completion. Report the reply or error to the user. A receipt acknowledges submission. Check the result before declaring work complete.
- For “接着刚才那段，把漏的补上”, identify the name from the last receipt or `cc-bro ls --json`, then use `cc-bro say tests "补上之前漏掉的边界用例。"`. A queued receipt means the message is persisted for dispatch. During an active turn the receipt says steer. If a waiter already covers that turn, reuse it. Once the turn ends, the same command starts a new turn with the previous context.
- For “看看老弟们在干嘛”, use `cc-bro ls`. Summarize each active task's directory, elapsed time, and current activity. The user can run `cc-bro watch` for a live terminal. Get the last reply using `cc-bro show tests` or the full exchange using `cc-bro show tests --all`.
- When the user asks to stop a task, run `cc-bro stop tests` and report its result. After a Claude Code restart, use `cc-bro ls` and reattach a waiter to the appropriate running turn or read its finished result. If the runner recorded an interruption, inspect the working files before sending another instruction.

A completed worker turn moves its ticket to Review. Read the reply, send rework to the same name if needed, and use `cc-bro done tests` when you accept the result. A failed or stopped ticket carries a flag and stays in its current column.
