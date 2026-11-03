# 工人选择与登录

按这张单应当在哪个环境里运行来选。两种后端都能同名续会话、插话、开 worktree 和审查；也可以一直只用其中一种。

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

要做比较，先放行这两个标识。pi 工单不填 `--model` 时，pi 会在已放行厂商的模型中选择。想指定模型，首条消息加 `--model provider/model-id`，填写 pi 列表里的完整标识。名字会绑定工人和模型；想换就另起名字。
