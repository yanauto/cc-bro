# cc-bro

[English](README.md) · [官网](https://cc-bro.yanauto.me/?lang=zh) · [文档](https://cc-bro.yanauto.me/zh/docs/) · [更新日志](CHANGELOG.md)

项目里正在用的 Claude Code 就是经理。cc-bro 把你已有的 CLI、模型、档位列成花名册，经理按任务挑选，再把活交给具名、可续聊的工人。可以并行、运行中插话、换人审查，以及在本地看板看结果。

## 你的工具，一份花名册

派活前执行 `cc-bro roster --json`。安装的技能会让 Claude 先读当前允许名单、模型、登录状态、默认值、用户备注和规矩，再决定派给谁。

| 工人 | 接入方式 | 运行中追加要求 |
| --- | --- | --- |
| `codex` | 原生 Codex app-server，沿用 CLI 登录 | 当前轮支持时注入，否则排到下一轮 |
| `pi:<厂商>` | pi RPC，每个厂商单独放行，也支持 Codex 订阅 | pi 确认当轮投递时注入，否则排队 |
| `agy` | 原生 Antigravity CLI，结构化事件、按 ID 续聊 | 排到下一轮 |
| `cursor-agent` | 原生 Cursor CLI，结构化事件、按 ID 续聊 | 排到下一轮 |
| `custom:<名称>` | 试跑通过的新会话／续聊命令模板 | 排队；无原生步骤和缓存读数 |

内置适配器按各家 CLI 能力上报，缺少的缓存数据显示未知。Gemini CLI 和 OpenCode 提供可编辑模板预设，使用前必须通过真实两轮试跑。需要 Claude 干活，由经理调用 Claude Code 原生子 agent。

## 在项目里开始

需要 macOS、Node.js 24+、Claude Code，以及至少一个工人 CLI。先通过该 CLI 自己的方式登录。

```sh
npm install -g cc-bro@0.3.1
cc-bro setup
cc-bro init --allow codex,pi:openai-codex,agy,cursor-agent --default-worker codex
cc-bro roster
cc-bro ui
```

`--allow` 只填你允许的工人。只允许一个时，它也作为默认。首次直接运行 `init` 会询问选择，已登记项目再次运行会保留原设置。在 Claude Code 输入 **/cc-bro** 并交代任务；看不到新技能时重新打开对话。

```sh
cc-bro say auth-fix "修复 token 过期测试。" --worker codex --worktree --bg --json
cc-bro wait auth-fix 1
cc-bro say auth-fix "也覆盖 refresh token 过期。" --bg --json
cc-bro wait auth-fix 2
cc-bro review auth-fix --by pi:openai-codex --bg --json
cc-bro show auth-fix --json
cc-bro done auth-fix
```

始终按回执中的名字和轮次等待。运行中插话可能已注入当前轮、排到下一轮或被拒；审查单单独验收。写单和审查者必须是不同工人标识；同一 pi 厂商的两个模型仍算同一个工人。

按花名册给 `say` 或 `review` 加 `--model 模型ID --effort 档位`。pi 模型带 `厂商/` 前缀；Cursor 可选具体模型变体，也可对支持参数的明确模型传 `--effort`。同名绑定同一个 CLI，完成一轮后可以切换模型和档位。

## 配置与边界

看板的**配置**页可以检测 CLI，在终端打开安装、升级或登录命令，设置全局默认和项目覆盖，编辑规矩与备注，试跑自定义命令模板。试跑会创建新会话，再按同一 ID 续聊核对记忆；会执行两个真实提示，可能消耗 CLI 订阅额度。

允许名单在每次派活时硬拒，排队单开跑前再次检查。规矩只在回执和工单详情中提醒，由 Claude 判断如何遵守。设置变更影响后续派活，在跑的轮次保持原配置。经理通过 `cc-bro note 工人 "建议"` 提议备注，只有用户在配置页确认才写入。

设置和工单存在 `~/.cc-bro/`（可用 `CC_BRO_HOME` 改位置）。cc-bro 优先通过公开命令读取 CLI 信息，只取非敏感配置字段；不读取凭据文件的值，不写任何其他 CLI 的配置。登录、令牌刷新、原生会话存储由 CLI 自己处理。项目里只有自忽略的 `.cc-bro/` 身份标记。

首次派单可加 `--worktree`，从已提交 HEAD 开独立分支。看板展示步骤、改动文件、审查关系、缓存和插话结果。`done` 保留 worktree，合并和回收由经理决定。

## 升级与开发

安装 0.3.1 后，先等想保留的任务完成，再运行 `cc-bro shutdown` 和 `cc-bro setup`。停机会取消该服务所有项目的运行单、排队单；未完成轮次不会自动续跑，已写文件保留。新版命令能停止 0.1.0、M2、0.2.0 和 0.3.0 服务。0.2 的项目权限、会话、工单会保留，不会扩大允许名单。[从 0.1.0 升级](docs-site/zh/upgrade.md)还需在新登记库登记实际项目，经理室已移除。

源码开发先运行 `npm ci --prefix ui`、`npm run build --prefix ui`，再运行 `npm test`。测试用离线工人，也检查本机 Codex 协议和 Claude Code 后台通知。公开文档用 `npm ci --prefix docs-site && npm run build --prefix docs-site` 生成。`npm run install:local` 会打包并安装；测试请设置独立 `CC_BRO_HOME` 和 `CC_BRO_PORT=0`。

[Apache-2.0 许可证](LICENSE)

花名册自动发现已安装、已登录 CLI 的所有模型，不自动扩大项目权限。配置页可按 bro 隐藏模型系列，支持全局与项目覆盖；隐藏的不会给经理看，派单也拒绝。内置介绍在 lib/model-catalog.json，用户覆盖放 ~/.cc-bro/models.json、按 id 合并。CLI 实报能力与上限优先于 API 目录。派带图任务用重复的 `say --attach 文件`，详见[能力与附件](docs-site/zh/model-inputs.md)。

花名册默认紧凑输出：未允许的 bro 只列一行；允许的模型按档位／fast 变体合并，上一代与被取代型号折叠。`roster --json` 同样精简，需要详细能力、上限或具体变体时再用 `roster --worker codex --json --full`。
