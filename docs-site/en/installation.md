# Installation

Install cc-bro once on your Mac. Then register each project from its own folder. The Claude Code chat you already use in that project becomes the manager.

## What you need

Use macOS with Node.js 24 or newer and Claude Code. Install the CLI for at least one worker: native Codex, pi, or both. You only need Git if you want to use worktrees. Run these checks in the terminal where you plan to install cc-bro:

```sh
node --version
claude --version
```

## Install the CLI and skill

```sh
npm install -g cc-bro@0.2.0
cc-bro setup
```

`setup` installs the user-level `/cc-bro` skill and prints its launcher path. Run it again after an upgrade or a change of Node installation. If an open Claude Code chat does not see the skill, reopen Claude Code in the project.

## Connect a worker

Follow [Workers and login](workers.md) for the CLI you want. Signing in gives that CLI access to a model. Registering an ID with `cc-bro init` is a separate step: it gives this project permission to use the worker.

Already have the 0.1.0 manager room? Read [Upgrade from 0.1.0](upgrade.md) before registering. Otherwise, [send your first ticket](quickstart.md).
