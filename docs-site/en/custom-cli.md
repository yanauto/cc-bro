# Custom CLI templates

A CLI needs a noninteractive new-session command, resume by an explicit session ID, and a machine-readable final reply and ID. Register it as `custom:name` in [Settings](settings.md). Gemini CLI and OpenCode presets are starting points, not prevalidated built-ins. Install and log in through the CLI first, then adapt the preset to your version.

A template uses an executable and JSON arrays of arguments. cc-bro calls the executable directly, without a shell. A prompt containing spaces, quotes or shell syntax remains an argument. Placeholders are `{prompt}`, `{session}`, `{model}`, `{effort}` and `{cwd}`. Use a wrapper executable if a CLI needs a more elaborate protocol.

```json
{
  "command": "my-agent",
  "newArgs": ["--json", "--prompt", "{prompt}"],
  "resumeArgs": ["--json", "--resume", "{session}", "--prompt", "{prompt}"],
  "modelArgs": ["--model", "{model}"],
  "effortArgs": ["--effort", "{effort}"],
  "stdin": "",
  "format": "json",
  "reply": {"path": "reply"},
  "session": {"path": "session_id"}
}
```

`modelArgs` and `effortArgs` are optional and appended only when a value is selected. For stdin-based input use `"stdin": "{prompt}"`. Both the new and resume commands must receive the prompt; resume must include `{session}`. The executable can be an absolute path or a name on PATH.

For `jsonl`, extract the latest matching event using dotted paths and optional equality conditions. For example, the native Codex JSON preset uses `{"path":"item.text","when":{"type":"item.completed","item.type":"agent_message"}}` for its reply and `thread_id` on `thread.started` for the session. Each new or resumed command must report the ID and a final reply. For `text`, use `{"regex":"Reply: (.+)"}` and `{"regex":"Session: (.+)"}`; the first capture group supplies each value. Nonzero exit, malformed output or a changed session ID fails the turn.

**Test new session + resume** makes two real calls in a temporary directory under cc-bro data, asks the CLI not to use tools, and verifies that the second response recalls a random code from the first. The extracted session ID must stay the same. A successful test authorizes saving that exact template for 15 minutes. Edits to the template need another trial. Test failure leaves the saved configuration untouched. Trials may consume subscription usage.

Custom workers are labeled **Degraded**. They support named ID continuation, queued follow-ups, stop, worktrees and independent reviews. They do not provide native step events, current-turn steering or cache usage. The board still derives changed files from Git. Run a small real task after saving to confirm the CLI’s own editing and permission behavior.

Optional `versionArgs` enables a read-only version command. Optional `actions` defines `login`, `install` and `upgrade` as arrays beginning with an executable, for example `"actions": {"login": ["my-agent", "login"]}`. These only run when a user clicks the corresponding Terminal action. Built-in CLI presets supply documented actions; unknown CLIs show unknown login state instead of reading credential files. Do not embed credentials in templates.
