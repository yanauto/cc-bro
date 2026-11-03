# 模型能力与附件

选模型前先确认它通过这个 CLI 实际能接收什么。读取 `cc-bro roster --json` 的 `capabilities.input`：`true` 表示模型和 cc-bro 当前 CLI 通道都支持，`false` 表示至少一方不支持，`unknown` 表示尚无依据。模型 API 能看视频，不代表 CLI 能把视频交过去。

## 派一张带图片的单

```sh
cc-bro roster --json
cc-bro say visual-check "描述图片里的布局。" --worker codex --model 花名册里的模型ID --attach ./screen.png --bg --json
cc-bro wait visual-check 1
cc-bro done visual-check
```

多个文件重复传 `--attach`。相对路径以发送命令的终端目录为准。文件在接受派单前复制到 cc-bro 的项目数据目录，排队时不依赖原文件继续存在或保持不变。最多 8 个，每个不超过 20 MiB，合计不超过 32 MiB。运行中的同名工人收到附件时排下一轮，回执明确显示。能力不支持或未知会在派给工人前拒绝；提示词里写文件名不等于传了原生附件。

## 各家 CLI 的输入通道

| CLI／当前通道 | 交付方式与边界 |
| --- | --- |
| Codex app-server | 图片转成 `localImage` 输入块。本机 schema 也有 `localAudio`，仅当模型明确报告支持音频时才启用。`codex exec` 回退用重复的 `--image`；音频会拒绝，不能静默丢弃。当前通道没有视频和 PDF 的直接输入块。 |
| pi RPC | `images` 数组发送 `{type,data,mimeType}` 图片块，data 为 base64。模型的 `input`、`contextWindow`、`maxTokens` 提供精确元数据，不解析表格里的四舍五入数字。当前 RPC prompt 没有音频、视频、PDF 附件字段。 |
| agy print／stream-json | 官方无界面输入只接受文本块。交互界面可粘贴图片和视频，不代表无界面通道能传，因此此处不可用。 |
| cursor-agent print | 本机 CLI 未公开直接附件参数。工具能读图、ACP 是另一种接口，都不能证明当前 print 适配器能直接交付媒体。能力记 unknown，显式附件拒绝。 |
| 自定义模板 | 当前模板只有文本参数或 stdin，没有经过验证的媒体通道。媒体能力记 unknown，显式附件拒绝。 |

Gemini CLI 文档列出文件工具和 `@file` 上下文可接图片、音频与 PDF；OpenCode 有 `run --file`。这是后续模板适配的可选路线，不算当前通用文本模板已经具备的能力。不要从模型 API 推断视频能传。

依据：[OpenAI app-server 输入](https://developers.openai.com/codex/app-server)、[pi RPC](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)、[agy 无界面输入](https://antigravity.google/docs/cli/headless)、[Cursor CLI 参数](https://cursor.com/docs/cli/reference/parameters)、[Gemini 文件工具](https://geminicli.com/docs/tools/file-system/)、[OpenCode CLI](https://opencode.ai/docs/cli/)。

## 上下文与输出上限

用 `cc-bro roster --worker 工人ID --json --full` 查询 token 上限及来源。紧凑版保留 `capabilities.input`；合并变体的输入能力不一致时标为 `unknown`，需要查完整视图中的具体变体。

CLI 实测元数据优先于目录。只有目录值时，来源标记为 `catalog-api-limit`：它是 API 上限，不保证当前订阅真的给这么多。缺数据写 `unknown`。比如 pi 的 Codex 订阅可能只报告 272K／500K，就保留 pi 报的数，不用 API 的 1M 覆盖。

简介、档次和 picks 是参考研究，不是能力检测或额度承诺；用户备注和规矩优先。覆盖文件与过期提醒见[花名册](roster.md)。
