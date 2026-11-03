# 工人选择与登录

按任务环境选择工人，派活前先读花名册。Codex、pi、agy、cursor-agent 有内置适配器；其他 CLI 可用试跑过的模板。各个工人都可具名续聊、使用 worktree 和互相审查。

## 原生 Codex

要让本机 Codex CLI 使用它自己的登录和 app-server 运行任务，工人标识选 `codex`。如果还没安装，先装 CLI，再登录并检查状态：

```sh
npm install -g @openai/codex
codex login
codex login status
```

如果提交任务前 app-server 不可用，cc-bro 可以退回 `codex exec`。在这种通道上，追加要求会排到下一轮。

## pi：使用订阅或厂商账号

选 `pi:<厂商>`，就在 pi 里用该厂商的模型。需要时先安装 pi，然后启动：

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
```

进入 pi 后输入 `/login`。要用 Codex 订阅，选择 OpenAI Codex 并完成登录，在 cc-bro 里填 `pi:openai-codex`。要用 DeepSeek，在 pi 里选择对应厂商并填 API key，或按 pi 支持的方式配置厂商环境；在 cc-bro 里填 `pi:deepseek`。原生 Codex 的登录不能代替 pi 的登录。

在终端检查所选厂商。以下命令不输出凭据：

```sh
pi auth check --provider openai-codex --no-refresh
pi auth check --provider deepseek --no-refresh
pi --list-models
```

## 为每张单选工人

```sh
cc-bro say inspect "说明测试目录的结构。" --worker pi:openai-codex
cc-bro say inspect-native "说明测试目录的结构。" --worker codex
```

要做比较，先放行这两个标识。pi 工单不填 `--model` 时，pi 会在已放行厂商的模型中选择。想指定模型，首条消息加 `--model provider/model-id`，填写 pi 列表里的完整标识。名字绑定工人，完成一轮后可切换模型和档位。

## Antigravity、Cursor 和自定义 CLI

0.3 内置 `agy`、`cursor-agent`，支持结构化步骤、按明确 ID 续聊、worktree 和互相审查。运行中插话排到下一轮；agy 模型上报时显示缓存，Cursor 没有读数时显示未知。派活前先看[花名册](roster.md)。

配置页可以在终端打开官方安装／升级命令。通过 `agy` 或 `cursor-agent login` 登录，用 `agy models` 或 `cursor-agent --list-models` 看模型，`cursor-agent status` 查登录。agy 的只读 `agy -p /model --output-format json`、`/effort` 显示当前默认值。

模型出现在目录不保证额度、地区和账户权限。cc-bro 会报告 CLI 错误，不自动换模型或购买额度。已有 CLI 工具和 MCP 配置继续有效，派单时应交代清楚任务范围。

Gemini CLI、OpenCode 或其他程序使用[自定义模板](custom-cli.md)，试跑成功才可保存。
