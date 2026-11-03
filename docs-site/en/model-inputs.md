# Model capabilities and attachments

Choose a model by what it can actually receive through its CLI. Read `capabilities.input` in `cc-bro roster --json` before attaching media. A value of `true` means the model and cc-bro’s current CLI transport both support it; `false` means one side does not; `unknown` means support has not been established. A model’s vision, audio or video capability alone is not enough.

## Send an image

```sh
cc-bro roster --json
cc-bro say visual-check "Describe the layout in this image." --worker codex --model MODEL_FROM_ROSTER --attach ./screen.png --bg --json
cc-bro wait visual-check 1
cc-bro done visual-check
```

Repeat `--attach` for multiple files. Paths are resolved from the sending terminal’s directory. Files are copied into cc-bro’s project data before acceptance, so a queued turn does not depend on the original file remaining unchanged. Up to eight attachments are accepted, each up to 20 MiB and all together up to 32 MiB. A follow-up with attachments queues for the next turn; its receipt says so. Unsupported or unknown input capabilities are rejected before the worker receives the prompt. A filename in ordinary prompt text is not a native attachment.

## What each transport accepts

| CLI / current transport | Delivery and limits |
| --- | --- |
| Codex app-server | Sends images as `localImage` input blocks. The installed schema also accepts `localAudio`; audio is enabled only when the selected model reports support. `codex exec` fallback uses repeated `--image`; it rejects audio instead of dropping it. Video and PDF have no direct input block in this transport. |
| pi RPC | Sends `images` with image content blocks (`type`, base64 `data`, `mimeType`). Its `input`, `contextWindow` and `maxTokens` model fields supply exact metadata, without parsing rounded table values. The current RPC prompt type has no audio/video/PDF attachment field. |
| agy print / stream-json | The documented headless input accepts text blocks only. Interactive clipboard support for images and videos does not establish a headless attachment route, so these are unavailable here. |
| cursor-agent print | No direct attachment option is documented by the installed CLI. Tools may read images, and ACP is a separate integration; that is not proof of direct media delivery in the current print adapter. Media input is unknown and explicit attachments are rejected. |
| custom templates | Existing templates pass text arguments or stdin. They do not declare a verified media route, so media remains unknown and explicit attachments are rejected. |

Gemini CLI documents image, audio and PDF input through its file tools and `@file` context. OpenCode documents `run --file`. These are possible routes for future template adapters, not capabilities that cc-bro’s current generic text template claims. Do not infer video support from the model’s API alone.

[Official OpenAI app-server input documentation](https://developers.openai.com/codex/app-server), [pi RPC documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md), [agy headless input](https://antigravity.google/docs/cli/headless), [Cursor CLI parameters](https://cursor.com/docs/cli/reference/parameters), [Gemini file tools](https://geminicli.com/docs/tools/file-system/), [OpenCode CLI](https://opencode.ai/docs/cli/).

## Limits and descriptions

Use `cc-bro roster --worker WORKER --json --full` for token limits and their sources. Compact output keeps `capabilities.input`; when grouped variants disagree, it reports `unknown` until you inspect the specific full variant.

CLI-reported limits take precedence over the catalog. If only the catalog supplies a value, its source is `catalog-api-limit`: an API ceiling, not a guarantee of this subscription’s effective limit. Missing values stay `unknown`. For example, pi’s Codex subscription can report a smaller window than the model’s API catalog. The roster keeps pi’s reported value.

Descriptions, grades and picks are advisory research, not capability detection or a quota guarantee. User notes and rules take precedence. See [the roster](roster.md) for local overrides and freshness reminders.
