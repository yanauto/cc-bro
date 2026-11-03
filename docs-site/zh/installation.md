# 安装

在 Mac 上安装一次 cc-bro，然后到各个项目目录分别登记。你原本在项目里使用的 Claude Code 对话就是经理。

## 准备环境

需要 macOS、Node.js 24 或更新版本，以及 Claude Code。至少安装一种工人 CLI：原生 Codex、pi，或两者都装。只有使用 worktree 时才需要 Git。在准备安装 cc-bro 的终端检查版本：

```sh
node --version
claude --version
```

## 安装命令行和技能

```sh
npm install -g cc-bro@0.2.0
cc-bro setup
```

`setup` 安装用户级 `/cc-bro` 技能并打印启动器路径。升级 cc-bro 或换了 Node 安装位置后，重新执行一次。已打开的 Claude Code 对话看不到技能时，在项目里重新打开 Claude Code。

## 连接工人

按照[工人选择与登录](workers.md)配置要用的 CLI。登录让 CLI 能使用模型；随后用 `cc-bro init` 登记工人标识，决定这个项目能不能用它。

以前用过经理室？先读[从 0.1.0 升级](upgrade.md)。首次使用可以直接[派第一张单](quickstart.md)。
