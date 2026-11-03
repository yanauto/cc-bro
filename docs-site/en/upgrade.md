# Upgrade from 0.1.0

Version 0.2.0 removes manager rooms. The manager is now your Claude Code chat in the actual project. The new registry starts separately; it does not import 0.1.0 tickets, manager notes or project permissions.

## 1. Decide when to stop the old runner

If you want running and queued tickets to finish, let them finish first. Keep any old manager folders and notes you still need; the upgrade does not require deleting them.

## 2. Install and stop the old service

```sh
npm install -g cc-bro@0.2.0
cc-bro shutdown
cc-bro setup
```

You can use the **new** CLI to stop the 0.1.0 runner, even if `init` or `ls` reports an incompatible runner. Shutdown stops running and queued turns across that runner’s projects. Unfinished turns will not resume automatically. Files already written and the 0.1.0 ticket database remain on disk.

## 3. Register the actual project

Leave the old manager room and open a terminal in the repository you want workers to use. Run the following there:

```sh
cc-bro init
cc-bro ls
```

Choose allowed worker IDs and a default. An empty list of tickets is expected for a newly registered 0.1.0 project. Open Claude Code **in this project directory** and use `/cc-bro`. See [Your first ticket](quickstart.md) for an end-to-end check.
