# 独立 worktree 与审查

两个工人可能同时改同一目录，或你需要一份独立的 diff 时，用 worktree。改动完成后，需要第二个工人在收单前检查它时，用 review。

## 从独立分支开工

在有提交的 Git 仓里，给写单的第一条消息加 `--worktree`：

```sh
cc-bro say auth-fix "修复 token 过期问题，运行相关测试。" --worker codex --worktree --bg --json
cc-bro wait auth-fix 1
```

新建的分支和 worktree 从已提交的 HEAD 开始，不包含主工作区尚未提交的改动。要基于这些改动工作，就不加 `--worktree`。同名工单沿用原来的工作目录；不能事后给已有工单补加这个参数来搬迁目录。

## 把已完成的轮次交给审查者

```sh
cc-bro review auth-fix --by pi:deepseek --bg --json
```

这个例子需要先放行 `codex` 和 `pi:deepseek`。审查者会收到写单这一轮的要求、最终回复和改动文件摘要，并在写单的工作目录检查。审查完成前，先别改动这个目录。

回执里是**审查单自己的名字和轮次**。用它们运行 `cc-bro wait`，阅读审查意见。需要修改就回到 `auth-fix`，新一轮完成后可再发审查。审查单和写单分别用 `done` 收单。

## 谁能审？

必须是另一个已放行的工人标识。原生 `codex` 和 `pi:openai-codex` 可以互审；同一 pi 厂商只换模型，仍算同一工人。如果想让 Claude 审，由经理在 Claude Code 里开原生子 agent。

worktree 工单执行 `done` 时会打印清理提示。先检查改动和未跟踪文件，由你决定合并哪些内容、何时删除 worktree；cc-bro 不会自动合并或清理。
