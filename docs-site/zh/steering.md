# 运行中插话

要补充当前任务，对同一个名字再发一次 `say`。要让另一件事并行运行，则另起名字。

```sh
cc-bro say auth-fix "修复 token 过期的测试。" --bg --json
cc-bro say auth-fix "也覆盖 refresh token 已过期的情况。" --bg --json
```

## 看第二张回执

| 结果 | 接下来怎么做 |
| --- | --- |
| `injected`（已注入） | 工人已确认当轮收到要求。等待这张回执里的轮次。 |
| `queued`（排到下一轮） | 要求会在下一轮处理。等回执指定的轮次完成后再审查或收单。 |
| `rejected`（被拒） | 查看原因。若不能确定是否送达，先看 `cc-bro show auth-fix --all` 再决定是否重发，以免重复。 |

如果原轮已经做完，第二次 `say` 会在同一会话里直接开始新一轮。重新打开经理对话后，用 `cc-bro ls` 和 `cc-bro show auth-fix --json` 找回工单，再等待相应轮次。
