# 工人花名册

每次派活前运行 `cc-bro roster --json`。经理读取当前项目花名册，按任务选 CLI、模型和档位，不自动偏向某一种后端。

文本和 JSON 默认都用紧凑版。不允许的 bro 只有名字和 `allowed:false`，即使 `--full` 也不展开模型。允许的 bro 保留生效默认值、登录状态、能力等级、用户备注和规矩。未知表示 CLI 没有提供该值。出现在模型列表里不保证账户额度和实际可用性。

```sh
cc-bro roster
cc-bro roster --worker codex --json
cc-bro roster --worker codex --json --full
cc-bro say investigate "解释失败的测试。" --worker codex --model 花名册里的模型ID --effort low --bg --json
```

pi 模型带 `厂商/模型` 前缀。Cursor 可选具体模型变体，也可给支持参数的明确模型传 `--effort`；cc-bro 优先匹配目录中的具体档位变体，再使用模型的 `[effort=...]` 参数。pi 和 agy 的档位列表描述当前默认模型；换模型后支持范围可能不同，由 CLI 验证。同名一直绑定同一个后端，完成一轮后可以切换模型或档位。

允许名单是硬边界，pi 每个厂商单独放行。接受消息和排队单开跑前都会检查；撤销权限不会中断已经在跑的轮次。规矩是回执和看板里的自然语言提醒，由经理判断任务是否符合，不是另一套自动权限系统。

配置和备注下次派活生效。已接受的轮次保存模型、档位和自定义模板快照；运行中不变。新默认值作用于后续派活，也包括空闲的同名工人。显式命令参数优先。

用户备注优先。经理可以提议，不能直接生效：

```sh
cc-bro note agy "适合做独立实现审查。" --json
```

用户在[配置页](settings.md)核对现有备注与建议，确认或忽略。确认会替换此范围内该 bro 的备注；没有供经理批准自己提议的 CLI 命令。


## 紧凑版与完整细节

当前模型每个系列一行：真实检测到的模型 ID、支持的输入、定位／档次、报告的档位和一句简介。同型号的档位与 fast 变体合并，`variantCount` 和 `fast` 描述变体数量及是否存在快速版。代表 ID 优先取生效默认值，再取 CLI 已列出的基础 ID，否则取首个实际变体，不生成不存在的模型名。档位取模型元数据与变体 ID，空列表表示未知；变体之间输入能力不一致时，合并值为 `unknown`，派媒体单前应查具体变体。

目录明确标为 `previous generation`、`superseded`、`being retired` 的型号，每个 bro 折叠成一行数量（`olderModels`），`--full` 可展开。默认模型即使被折叠，也保留在 `defaultModel` 并带 `defaultFolded:true`，不偷偷换默认值。目录没匹配上的型号，不靠版本号猜它是不是旧款。

`--json` 返回 `mode:"compact"`；每个模型保留 `id`、`efforts`、`capabilities.input` 和精简 `catalog`：`id`、`tier`、`grade`、单句 `summary`、`as_of`、`stale`。`picks` 只推荐当前视图中的模型。用户备注和规矩原样保留、不截断。`--json --full` 返回 `mode:"full"`，展开允许 bro 的全部变体、旧型号、完整目录条目、上下文／输出上限、来源及检测元数据。用户隐藏的模型在两种模式下都不出现。

两种模式都支持 `--worker ID` 只查一个 bro，未检测到的 ID 报错。经理默认读紧凑版，任务确实需要细节才用 `--full`。看板配置页仍展示完整检测模型，便于配置。

## 自动发现与隐藏

每次花名册查询重新检查已安装 CLI 的公开模型列表。新装或新登录的工人自动出现；`allowed` 仍表示项目权限，发现不等于放行。未安装、未登录的内置 CLI 不列。自定义模板没有通用登录检测，已试跑并配置模型的模板仍列出，但登录标为 unknown。

配置页按 bro 隐藏模型系列，支持全局和项目覆盖；同系列档位、速度变体一起隐藏。隐藏模型不进入经理花名册或 picks；显式派单、默认模型和排队开跑都会拒绝。默认值被隐藏后应选可见默认值，不自动换模型。项目可以替换全局隐藏列表，也可恢复继承。

## 模型介绍目录

内置 `lib/model-catalog.json` 随 npm 包和公开源码发布。可在 `~/.cc-bro/models.json`（或 `$CC_BRO_HOME/models.json`）放覆盖文件，`models` 按精确 id 合并，省略的字段继续继承；`summary`、`modalities` 按字段合并。根级 `picks` 和 `effort_advice` 也可覆盖；下次查询即生效。

```json
{"models":[{"id":"gpt-6.1-sol","summary":{"zh":"我们常用的主力写手。"},"grade":"团队首选"}]}
```

匹配使用精确模型 ID 或 alias；先去 CLI 厂商前缀和约定的档位、速度后缀，不模糊猜测。匹配不上的没有简介。完整 JSON 带全部匹配项与[能力依据](model-inputs.md)，两种模式都带 picks、effort_advice。`as_of` 超过 60 天或缺失时标记过期，由 skill 提醒用户更新。研究评级未逐条独立验证，用户备注与规矩优先。
