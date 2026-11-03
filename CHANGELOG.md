# Changelog

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
