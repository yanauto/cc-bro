# 自定义 CLI 模板

CLI 需要支持非交互新对话、按明确会话 ID 续聊，以及可提取的最终回复和 ID。在[配置页](settings.md)登记为 `custom:名称`。Gemini CLI 和 OpenCode 预设只是起点，不是已验收的内置适配器；先安装、登录，再按实际版本调整模板。

模板使用一个可执行文件和 JSON 参数数组。cc-bro 直接启动命令、不经过 shell；提示中的空格、引号、shell 字符仍属于原参数。占位符包括 `{prompt}`、`{session}`、`{model}`、`{effort}`、`{cwd}`。更复杂的协议可自行写包装可执行文件。

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

`modelArgs`、`effortArgs` 可省略，有选择值时才追加。标准输入传提示可用 `"stdin": "{prompt}"`。新对话和续聊都必须收到提示，续聊必须含 `{session}`。命令可填绝对路径或 PATH 中的名称。

`jsonl` 用点分路径和可选的相等条件提取最后一个匹配事件。例如 Codex JSON 预设用 `{"path":"item.text","when":{"type":"item.completed","item.type":"agent_message"}}` 取回复，从 `thread.started` 的 `thread_id` 取会话。新对话和续聊都需返回 ID 和最终回复。`text` 格式用 `{"regex":"Reply: (.+)"}`、`{"regex":"Session: (.+)"}`，各取第一个捕获组。退出码非零、输出格式错误或 ID 变化都会让该轮失败。

**试跑新对话＋续聊**在 cc-bro 数据下的临时目录执行两次真实调用，要求 CLI 不使用工具，核对第二轮能否记住第一轮的随机码，且两轮提取的 ID 相同。通过后 15 分钟内可保存同一模板；修改模板后需要重新试跑。失败不改变已有配置。试跑可能消耗订阅额度。

自定义工人明确标为**降级**：支持具名续聊、下一轮插话、停止、worktree、独立审查；没有原生步骤、当轮注入或缓存读数。看板仍用 Git 统计改动文件。保存后可派一个小任务，核对 CLI 自身编辑和权限行为。

可选 `versionArgs` 定义只读版本命令。可选 `actions` 用以可执行文件开头的数组定义 `login`、`install`、`upgrade`，例如 `"actions": {"login": ["my-agent", "login"]}`。只有用户点击相应终端按钮才执行。已知 CLI 预设自带公开命令；未知 CLI 登录状态保持未知，不读取凭据文件。不要在模板中填凭据。
