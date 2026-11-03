# Changelog

## 0.3.0

### English

- A live project roster exposes permitted CLIs, models, effort levels, detected defaults, login, capabilities, rules and user notes. The Claude Code skill reads it before choosing a bro. `say` and `review` accept `--effort` and can change models between completed turns.
- Built-in agy and cursor-agent workers join native Codex and pi. They resume by explicit session ID and queue active follow-ups. Cache is shown only when the CLI reports it. Every backend can use worktrees and participate in linked reviews.
- Custom CLI templates provide new-session and resume commands, reply/ID extraction and optional model/effort arguments. A real two-turn memory trial is required before saving. Gemini CLI and OpenCode are editable, degraded presets rather than unverified full adapters.
- The board has global and project Settings: read-only detection, install/update/login commands opened in Terminal, allowlists, defaults, notes and rules. Manager-proposed notes need user confirmation. Settings are stored only in cc-bro; credential-file values and other CLI configuration are untouched.
- The website adds bilingual roster, custom CLI and Settings guides.

#### Upgrade from 0.2.0

Install `cc-bro@0.3.0`, then use the new `cc-bro shutdown` and rerun `cc-bro setup`. Wait first if you want active work to finish: shutdown cancels running and queued turns across the runner’s projects. Existing 0.2 policies, named sessions and ticket history are preserved; no new workers are allowed automatically. The old-runner shutdown path remains compatible with 0.1.0 and M2. See the [upgrade guide](docs-site/en/upgrade.md).

### 简体中文

- 新增实时项目花名册，列出允许的 CLI、模型、档位、检测默认值、登录、能力、规矩和用户备注。Claude Code 技能先读花名册再派活。`say` 和 `review` 支持 `--effort`，完成一轮后可换模型。
- 内置 agy、cursor-agent，与原生 Codex、pi 并列。按明确会话 ID 续聊，运行中追加要求排到下一轮。CLI 有上报才显示缓存。各后端都可使用 worktree、互为关联审查者。
- 自定义 CLI 模板支持新对话、续聊、回复／ID 提取、可选模型和档位参数，保存前必须通过真实两轮记忆试跑。Gemini CLI 和 OpenCode 是可编辑降级预设，不冒充已验证的全功能适配器。
- 看板新增全局／项目配置：只读检测、在终端打开安装／升级／登录命令、允许名单、默认值、备注和规矩。经理提议的备注必须用户确认。配置只存在 cc-bro，不读凭据文件值，不写其他 CLI 配置。
- 官网新增中英花名册、自定义 CLI、配置页指南。

#### 从 0.2.0 升级

安装 `cc-bro@0.3.0`，用新版执行 `cc-bro shutdown` 后重跑 `cc-bro setup`。想让在跑的任务完成就先等待；停机会取消服务所有项目的运行单和排队单。保留 0.2 原有权限、具名会话和工单历史，不自动放行新工人。旧服务停机仍兼容 0.1.0、M2，详见[升级指南](docs-site/zh/upgrade.md)。

## 0.2.0

### English

#### Breaking: the manager room is gone

Open Claude Code in the project itself. The separate manager folder, its local skill and the board’s provider settings were part of 0.1.0. The new user-level skill delegates from the chat you already use. The new registry does not import 0.1.0 tickets or manager notes.

#### Workers and tickets

- Choose native Codex or a pi provider for each ticket. Register the allowed worker IDs and a default per project. Native Codex and pi using a Codex subscription are separate choices.
- Reuse a name to continue a session; use different names to run in parallel. A follow-up receipt says whether it reached the current turn, was queued for the next turn or was rejected.
- Start a ticket in a Git worktree or ask a different worker to review a completed turn. The board shows the branch, changed files, steps, linked reviews and reported input cache hits. Acceptance leaves the branch and worktree intact.

#### Upgrade from 0.1.0

1. Let any work you want to keep running finish. If you have notes in a manager room, keep that folder for reference.
2. Install with `npm install -g cc-bro@0.2.0`. If an old runner is active, use the new `cc-bro shutdown`. It stops running and queued work across that runner’s projects; unfinished turns do not resume automatically. Files already written stay on disk.
3. Run `cc-bro setup`. In the actual project root, run `cc-bro init` and choose allowed workers and a default. Open Claude Code there and type `/cc-bro`. The old ticket database stays on disk.

See the [upgrade walkthrough](docs-site/en/upgrade.md).

### 简体中文

#### 不兼容：移除经理室

直接在项目里打开 Claude Code。0.1.0 的独立经理室、目录里的技能和看板中的厂商设置都已移除。新版把技能装到用户目录，由你正在使用的对话派单。新登记库不会导入 0.1.0 的工单或经理笔记。

#### 工人与工单

- 每张单可选原生 Codex 或一个 pi 厂商。每个项目分别登记允许的工人和默认工人。原生 Codex 和通过 pi 使用 Codex 订阅是两个独立选项。
- 同名续会话，不同名可并行。运行中追加要求，回执明确显示已注入当轮、排到下一轮或被拒。
- 可以用独立 Git worktree 写单，也可以让另一个工人审查已完成的轮次。看板展示分支、改动文件、步骤、关联审查单和工人上报的输入缓存命中率。收单时保留分支和 worktree。

#### 从 0.1.0 升级

1. 想让旧单做完就先等它们结束。经理室里有用的笔记可留在原文件夹查阅。
2. 运行 `npm install -g cc-bro@0.2.0`。若旧服务仍在运行，用新版执行 `cc-bro shutdown`。这会停止该服务所有项目的运行单和排队单；未完成的轮次不会自动续跑，已经写入的文件保留。
3. 运行 `cc-bro setup`。进入实际项目根目录运行 `cc-bro init`，选好允许的工人和默认工人。在这里打开 Claude Code，输入 `/cc-bro`。旧工单数据库保留在磁盘上。

详见[升级指南](docs-site/zh/upgrade.md)。

## 0.1.0

### English

The first macOS preview paired each project with a separate Claude Code manager room. Named pi workers ran in the project and continued working when the manager chat closed.

- The setup board could install pi, connect a provider using a key or subscription, and set the default worker model.
- Tickets moved through Queued, Working, Review and Done. The CLI could send follow-ups, show history, wait for a turn or stop a worker. The local board showed progress across projects.

### 简体中文

首个 macOS 预览版为每个项目建立独立的 Claude Code 经理室。具名 pi 工人在项目里执行任务，关闭经理对话后仍能继续工作。

- 可在引导看板安装 pi、用密钥或订阅连接厂商，并设置默认工人模型。
- 工单经过排队、进行中、待验收、已完成四列。命令行支持插话、查看历史、等待轮次和停止工人；本机看板可以查看多个项目的进度。
