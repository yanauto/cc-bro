# 命令参考

请在已登记项目的根目录或子目录里运行项目命令。以下大写单词代表需要替换的参数。运行 `cc-bro --help` 可查看已安装 CLI 的语法。

## 安装和项目策略

| 命令 | 作用 |
| --- | --- |
| `cc-bro setup` | 安装或更新用户级 Claude Code 技能和启动器。 |
| `cc-bro init [--allow IDS] [--default-worker ID] [--json]` | 登记当前目录或更新项目策略，多个工人标识以逗号分隔。 |

## 派单与收单

```text
cc-bro say NAME MESSAGE [--worker ID] [--model MODEL] [--title TITLE] [--worktree] [--bg] [--json]
cc-bro review NAME --by ID [--model MODEL] [--bg] [--json]
cc-bro wait NAME TURN [--json]
cc-bro done NAME [--json]
```

消息或标题含空格时要加引号。`say` 和 `review` 默认等待结果；加 `--bg` 则先交回回执。`wait` 使用回执里的正整数轮次。`done` 验收一张已完成的工单，不会合并改动或顺带验收关联单。

## 查看工作

| 命令 | 作用 |
| --- | --- |
| `cc-bro ls [--json]` | 列出当前项目的工单。 |
| `cc-bro show NAME [--all] [--json]` | 查看当前结果；加 `--all` 可读对话历史。 |
| `cc-bro watch` | 在终端持续查看项目活动。 |
| `cc-bro ui [--no-open]` | 打开本机看板；加 `--no-open` 时只打印地址。 |

## 停止工作

| 命令 | 影响范围 |
| --- | --- |
| `cc-bro stop NAME [--json]` | 停止当前项目的一个具名工人。 |
| `cc-bro shutdown` | 停止整个本机服务，包括该服务下所有项目的运行单和排队单。未完成轮次不会自动续跑。 |
