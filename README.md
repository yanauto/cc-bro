# cc-bro

Open a project's manager in Claude Code, delegate work to [pi](https://github.com/earendil-works/pi) agents, and follow each ticket from **Queued** to **Working**, **Review**, and **Done**. The manager keeps its brief and decisions in a folder you choose. Workers run in the project itself.

## Install

**Preview (0.1).** macOS only for now. You need Node.js 24 or later and [Claude Code](https://code.claude.com/docs/en/setup). cc-bro can install pi for you.

```sh
npm install --global cc-bro
cc-bro ui
```

The board opens in your browser and walks you through setup: tools, where manager rooms live, your first project, and meeting the manager. Add a model there with an API key or a subscription login.

## Open a manager

```sh
cd /path/to/shop-api
cc-bro
```

On first use, press Return to keep rooms under **~/cc-bro/**, or enter another parent folder. Confirm registration of the current project. cc-bro prints the board URL and starts Claude Code **in the current terminal**, inside a room such as `~/cc-bro/shop-api/`. Another project called shop-api gets `shop-api-2` if that name is available. Run the same command from a registered project, one of its subfolders, or its manager room to return directly.

Ask the manager, for example, “Have DeepSeek read the failing test and tell me how to reproduce it.” The manager can send a follow-up to the same worker or accept its result. The worker keeps running if you close the manager.

**Prefer the browser?** Run `cc-bro ui`. In Settings, select the parent folder for manager rooms and choose Terminal or Claude Desktop. Add a project folder, then choose **Open manager chat**. The project menu can also reveal its manager room in Finder. The board normally uses `http://127.0.0.1:4517` and selects the next free port if needed. `cc-bro ui --no-open` prints its address.

The first time a client opens Terminal, macOS may ask whether to **allow control of Terminal**. Choose **Allow** for the launch you requested. If you previously denied that prompt, check **System Settings → Privacy & Security → Automation** for the requesting app and Terminal. Claude may separately ask whether you trust the newly created room.

**Claude Desktop and IDEs.** Open the manager room as the working folder in the client's Claude Code mode. Recent macOS versions of Claude Code and Desktop support opening it directly through `claude --desktop`. If the local installation lacks this capability, copy the room path or reveal it in Finder, then select that folder in Desktop's Code tab. Each room contains its own `/cc-bro` skill and launcher. They locate the right instance and Node installation even when the client's PATH does not include cc-bro. No global Claude plugin installation or `--plugin-dir` flag is required.

## Models and tickets

Open the environment page to check Node, Claude Code and pi. Use **Install** or **Upgrade** for pi and follow the installation log.

Open **Settings** to configure workers. Choose a ready default model, a thinking level and a concurrency limit. These preferences belong to cc-bro. Leaving the model unset lets pi choose its startup model. Each new ticket keeps the model and thinking level it started with. Changing the limit affects the queue immediately and allows active turns to finish.

Under **Providers**, enter an API key for a built-in provider, or start its browser login. Follow the link or device code, then return to the board. If the local browser callback cannot connect, paste the redirect into the waiting prompt. You can cancel a login or start again after a timeout. When the installed pi SDK cannot drive browser login, cc-bro opens pi in Terminal.

For an OpenAI-compatible or other custom service, enter its own provider ID, API protocol, base URL and model IDs. A new service without a key can be used with a local endpoint. When replacing a custom provider, omit the key to keep its existing value. Built-in IDs are reserved. **Check configuration** sends one short request per selected model and reports each result and latency as it arrives. With no selection the check runs against all ready models.

The settings page also shows pi's configuration directory, file errors, configured defaults and credential sources. Saved keys, custom model definitions and subscription logins use pi's native files. Before editing one, cc-bro backs up its original contents under `CC_BRO_HOME/backups/pi/`. Backups containing credentials have owner-only permissions. Providers or logins changed in a separate pi session appear on an open board.

From a manager room:

```sh
cc-bro say inspect "Find the cause of the failing test." --title "Inspect failing test" --model deepseek/deepseek-flash --bg --json
cc-bro wait inspect 1
cc-bro show inspect --all
cc-bro say inspect "Cover the empty-input case as well."
cc-bro done inspect
cc-bro ls
```

The name is scoped to this project. A message during an active turn steers that turn. Messages added while queued are delivered together in order. A successful reply moves the ticket to Review. An error or stop adds a flag in the current column. Accepting with `done` moves it to Done. Use `cc-bro watch` for live terminal progress and `cc-bro stop <ticket>` to cancel. The room skill starts a background Bash waiter for the turn returned by `--bg`, so Claude Code receives its completion notification.

By default three turns can run across the instance. A positive `CC_BRO_CONCURRENCY` environment variable overrides the saved limit for the lifetime of the runner. Queued turns survive a restart. Interrupted in-flight work is flagged for inspection before retrying.

## Rooms, moves, and data

The room root is a **user setting**. A room contains the manager's documents and its local Claude skill. Change the root in Settings to move all rooms, including rooms created by P2. Close sessions using the old paths and reopen their rooms after moving. Existing folders at the destination are preserved. Manager notes are carried along, and the bundled skill is refreshed when the runner starts or cc-bro opens the room. Keep your own skills under other names.

Machine data stays under **~/.cc-bro/**, independently configurable with `CC_BRO_HOME`:

```text
projects.sqlite
projects/<id>/tickets.sqlite
projects/<id>/sessions/
trash/<id>/
```

Changing the room root keeps project IDs, ticket history and worker conversations. Removing a project stops its workers and archives the room and machine data under `trash/<id>/`. No cc-bro files are added to the selected project. Outside a manager room, the explicit ticket subcommands still support the standalone conversations from P1.

An installation uses the user's pi profile, including signed-in OAuth providers, and respects `PI_CODING_AGENT_DIR`. Its worker sessions are stored with the project data. `cc-bro shutdown` stops this instance and unloads its temporary launchd service.

## Development

A Git checkout defaults to `.sandbox/` for machine data. Choose a separate room root. Development workers use an isolated HOME and the pi profile at `CC_BRO_HOME/login/`. Configure keys or log in separately in that sandbox. A sandbox worker can refresh its OAuth token in the same profile. Development installs go to the sandbox npm prefix.

```sh
export PATH="$PWD/bin:$PATH"
npm ci --prefix ui
npm run build --prefix ui
cc-bro ui
npm test
```

The Node service serves the API and board from one origin. In a checkout it reads `ui/dist/`. Prepack copies that build into the installation at `bundle/board/`. A missing build produces a short hint while the API remains available. For an independent instance, set `CC_BRO_HOME` and optionally `CC_BRO_PORT` (0 requests an ephemeral port).

- `npm test` runs the offline suite, including first-run registration, P2 migration, room moves and recovery, ticket queues, same-origin checks, and platform adapters.
- `npm run test:plugin` uses real Claude Code with local model fixtures to verify background notifications through both the plugin and the independent room skill.
- `npm run test:live` uses a real DeepSeek key. `npm run test:p2-live` also uses the local Claude login to delegate and accept a real ticket in a provisioned room. These opt-in tests use the corresponding model accounts.
- `npm run test:p4-live` tests a real DeepSeek key, a custom OpenAI-compatible provider, configuration checks and delegation through the configured default. The live tests seed a temporary profile from `DEEPSEEK_API_KEY` or pi's read-only credential lookup and remove the test credentials and backups on exit. The offline SDK tests use the installed npm distribution of pi and a loopback model server.

License: Apache-2.0
