# OpenClaw — Channel Runtime (L3 深挖)

> **深挖维度：A1 / Channel Adapter 真实运行时机制**
> Commit: `deccdb5e57af6800d4f020ea2034166592a149ba`
> 入口：`extensions/telegram/src/` + `src/channels/message/ingress-drain.ts`

## 1. 核心结论摘要

**Channel Adapter 的生产级模式不是简单的"接收消息 → 转发"**，而是 **durable-before-ack + claim-based + lane-serialized + adoption-time complete** 的四阶段协议。这是 L2 报告中 `[F]` Channel Plugin 接口描述之外、需要 L3 深挖才能揭开的核心运行时结构。

## 2. 关键文件清单（telegram 作为代表渠道）

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| [telegram-ingress-spool.ts](../../sources/openclaw/extensions/telegram/src/telegram-ingress-spool.ts) | 141 | **持久化入队：durable-before-ack** |
| [telegram-ingress-drain.ts](../../sources/openclaw/extensions/telegram/src/telegram-ingress-drain.ts) | ~200+ | **消费循环：adoption 超时、claim、retry** |
| [telegram-ingress-supersede.ts](../../sources/openclaw/extensions/telegram/src/telegram-ingress-supersede.ts) | — | **预占用抑制：仅授权命令可替换** |
| [telegram-ingress-non-retryable.ts](../../sources/openclaw/extensions/telegram/src/telegram-ingress-non-retryable.ts) | — | **不可重试分类（missing harness, dispatch-dedupe rollback）** |
| [send.ts](../../sources/openclaw/extensions/telegram/src/send.ts) | 2753 | **durable 出站漏斗（含 share 预测）** |
| [monitor-webhook.runtime.ts](../../sources/openclaw/extensions/telegram/src/monitor-webhook.runtime.ts) | 2 (barrel) | webhook runtime barrel |
| [webhook.ts](../../sources/openclaw/extensions/telegram/src/webhook.ts) | — | webhook server + 401 secret header |
| [polling-lease.ts](../../sources/openclaw/extensions/telegram/src/polling-lease.ts) | — | polling 租约 |
| [monitor.ts](../../sources/openclaw/extensions/telegram/src/monitor.ts) | — | 主入口：concurrency, retry, polling 超时 |

## 3. 四阶段协议

### 阶段 1：Durable-Before-Ack（先持久化再应答）

**[F]** 核心不变式（`extensions/telegram/CLAUDE.md` Reliability Invariants + 代码）：

| 传输 | accept 时机 | 来源 |
| --- | --- | --- |
| **Polling** | 仅在父级 spool enqueue 已 commit 后才推进 offset | `telegram-ingress-spool.ts:108-135` `writeTelegramSpooledUpdate()` |
| **Webhook** | 200 仅在 spool 写成功后返回；写失败必须返回非 200 | `extensions/telegram/CLAUDE.md` Reliability Invariants |
| **共用通路** | 入队后 → 调用核心 `createTelegramTransportIngressDrain(...).drainOnce()`；不保留私有 claim 循环 | `CLAUDE.md` 明确禁止私有 claim loop |

**[F]** 入队参数（`telegram-ingress-spool.ts:108-135`）：

```typescript
export async function writeTelegramSpooledUpdate(params: {
  spoolDir: string;
  update: unknown;
  laneKey?: string;        // getTelegramSequentialKey() 派生
  now?: number;
}): Promise<number> {
  const updateId = resolveTelegramUpdateId(params.update);
  if (updateId === null) throw new Error("Telegram update missing numeric update_id.");
  const queue = openTelegramIngressQueue(params.spoolDir);
  await queue.enqueue(
    telegramQueueEventId(updateId),  // padStart(16,'0') 字符串编码
    { version, updateId, receivedAt, update },
    { receivedAt, laneKey: params.laneKey ?? ... }
  );
  return updateId;
}
```

**[F]** 配置参数（`telegram-ingress-spool.ts:14-25`）：
- 失败 TTL = 30 天（`TELEGRAM_SPOOLED_UPDATE_FAILED_TTL_MS`）
- 完成 TTL = 30 天（`TELEGRAM_SPOOLED_UPDATE_COMPLETED_TTL_MS`）
- 最大条目 = 1000（`TELEGRAM_SPOOLED_UPDATE_FAILED_MAX_ENTRIES`）
- 完成重试 backoff：initial 250ms, max 5s, factor 2, jitter 0.2

### 阶段 2：Claim-Based Settlement（认领式结算）

**[F]** 核心接口（`src/channels/message/ingress-drain.ts:57-180`）：

```
DrainClaimLifecycle = {
  dispatch(claim, lifecycle, replyOpts) ->
    { kind: "completed" }   // 立即 tombstone
  | { kind: "release" }    // 释放，重试
  | -                     // 抛出 → 自动 dead-letter
}
```

**三个关键约束**（`ingress-drain.ts:63-95`）：

1. **Drain 完成时（adoption）即 tombstone，从不在 settle**
   > "Drain completes (tombstones) the claim here — never at settle"

2. **完成时机是 adoption，不是 settle**
   > "Complete at turn adoption, not settle. Deferred holds the claim; watchdog stays armed through deferral; dead-letter reason `handler-timeout`."

3. **Claim-token 围栏**
   > "A claim-token fence rejects complete/fail (lease reclaimed by another owner)."

**[F]** 超时控制（`telegram-ingress-drain.ts:27-42` + `CLAUDE.md`）：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENCLAW_TELEGRAM_SPOOLED_HANDLER_TIMEOUT_MS` | `DEFAULT_INGRESS_ADOPTION_STALL_MS` | adoption-stall watchdog |
| `TELEGRAM_SPOOLED_DRAIN_START_LIMIT` | 100 | drainOnce 初始 limit |
| `TELEGRAM_SPOOLED_DRAIN_SCAN_LIMIT` | 1000 | scan limit |
| 全局：retry attempts | 8 | "One retry policy: attempt floor **and** age gate" |
| 全局：retry age gate | 24h | 来自 `src/channels/message/ingress-drain.ts` invariants |
| Claim refresh | `claimLeaseMs / 3` | Claim lease 三分之一周期续约 |

### 阶段 3：Lane-Serialized Adoption（按车道串行化）

**[F]** Lane 是 per-(chat/topic) 串行单位，避免乱序导致的人工混乱：

```
laneKey 派生 (sequential-key.ts) = chat_id + topic_key
所有同一 lane 的入队消息必须被按 update_id 顺序处理
```

**[F]** room_event ambient 工作流与父 chat 共享 sequential lane —— 这样"后续用户 turn 可以在 adoption 前 supersede 它"。但已 adoption 的用户 turn 永远不会被打扰（`CLAUDE.md` Reliability Invariants）。

### 阶段 4：Supersede Pre-Adoption（预占用抑制）

**[F]** Supersede 谓词（`telegram-ingress-supersede.ts`，`CLAUDE.md` Reliability Invariants）：

| 类型 | 可被 supersede？ |
| --- | --- |
| text 消息 | ✅ 是 |
| 已授权显式命令 | ✅ 是 |
| 待处理的 ambient room_event | ✅ 是 |
| 普通消息（adoption 后） | ❌ 否（已被核心 drain supersede 接管） |

**[I]** 这是 OpenClaw 防止"用户看到自己的新消息还没发出去就看到旧回复"的核心机制。

## 4. 出站漏斗：durable + streaming 双通道

**[F]** Telegram 维护两个**必须等价降级**的出站漏斗（`CLAUDE.md` Reliability Invariants）：

1. **durable funnel** (`send.ts`, 2753 行)：持久化发送、retry、rate-limit
2. **streaming funnel** (`bot/delivery.*`)：实时流式预览

**[F]** 共享降级路径（`CLAUDE.md` 明确禁止非对称行为）：
- rich-entity 400 → 退化为纯文本
- caption parse 400 → 退化为普通 caption
- quote-not-found 400 → 退化为 legacy reply
- 新退路写入 `send-error-predicates.ts` 或 `reply-parameters.ts`——**绝不**只在单一漏斗中加

**[F]** 泛洪等待（`CLAUDE.md` Reliability Invariants）：
> Outbound flood waits honor `retry_after` up to `TELEGRAM_OUTBOUND_RETRY_AFTER_CAP_MS`; do not re-clamp Telegram sends to the generic channel retry ceiling.

**[F]** 流式预览约束：
- Telegram drafts 是 30 秒临时预览（private chat），最终仍需 `sendMessage`
- OpenClaw 用 `sendMessage` + `editMessageText`，最终 in-place 定稿（一persistent 答复）
- 一个 preview message 即每次流式只能有一个；编辑前进
- Token 级 delta 必须合并到 cumulative preview（**永不**删除 first-preview debounce）

## 5. Webhook 安全顺序

**[F]**（`CLAUDE.md` Reliability Invariants：Webhook security ordering）：

```
1. 秘密 header 常数时间比较 (timingSafeEqual)
2. 单 header 强制（防止意外 multi-header）
3. 401 时关闭连接
4. request rate limit 仅作用于 failed-auth
   （Telegram 自身投递永不被节流）
```

**[F]** undici transport 在所有退出路径必须关闭：
- polling session
- webhook 关闭和启动失败
- probe-cache 回收

## 6. Translate Backoff Policy

**[F]**（`telegram-ingress-spool.ts:20-25`）：
```typescript
TELEGRAM_SPOOLED_COMPLETION_RETRY_POLICY: BackoffPolicy = {
  initialMs: 250,
  maxMs: 5_000,
  factor: 2,
  jitter: 0.2,
}
```

**[I]** 这是 OpenClaw 自己实现的 backoff（`@openclaw/normalization-core/backoff`），无外部退避依赖。

## 7. 与 RoboThree 的相关性

### ADOPT（直接采纳）

| 机制 | 理由 | 证据 |
| --- | --- | --- |
| **Durable-before-Ack 协议** | 消息持久化再应答可有效避免 gateway 崩溃导致的丢消息 | `telegram-ingress-spool.ts:108-135` + `CLAUDE.md` Reliability Invariants |
| **Adoption-Time Complete** | 在系统接管消息所有权时立即 tombstone（不延迟到 settle） | `ingress-drain.ts:63-80` 不变式 |
| **Claim-Token 围栏** | 防止两个 worker 同时结算同一消息 | `ingress-drain.ts:44-46` |

### ADAPT（借鉴并适配）

| 机制 | 适配方案 | 理由 |
| --- | --- | --- |
| **Lane 串行化** | 用 channel+topic 派生 laneKey，per-lane 串行处理 | 防止乱序回复，但 OpenClaw 对 MVP 可简化为仅 `channel:chat_id` |
| **Supersede Pre-Adoption** | 仅授权命令与 text 消息可替换预占用 | 比 OpenClaw 进一步收窄：MVP 默认禁止任何 supersede |
| **Stall Watchdog** | 入队后启动计时，超时则 dead-letter reason=`handler-timeout` | RoboThree 同等实现 |
| **Send 漏斗等价降级** | rich→plain, caption→text, quote→legacy 三层降级 | MVP 至少实现 rich→plain 一条 |

### DEFER（推迟）

| 机制 | 理由 |
| --- | --- |
| **durable funnel retry** | MVP 用简单的"发送失败 + 单次重试"足够，无需 exponential backoff |
| **Streaming funnel (Edit-in-place)** | MVP 不做实时流式，全部 sendMessage 后一次性发送 |
| **Webhook 401 / undici 关闭** | MVP 直接用 polling，避免 webhook 部署复杂性 |

### REJECT（不采纳）

| 机制 | 理由 |
| --- | --- |
| **probe-cache eviction** | MVP 没有 probe 缓存需要管理 |

### NEEDS_MORE_EVIDENCE

| 机制 | 缺失证据 | How to Close |
| --- | --- | --- |
| **`TELEGRAM_SPOOLED_DRAIN_START_LIMIT` 在高并发下的实际吞吐** | 静态分析只能看到 limit = 100，需要运行时测试 | 高 QPS 压测 |
| **claim-token 失败率** | claim-token fence 失败会发生死锁吗？需要看 `reclaimed` 状态处理 | 重试场景运行时验证 |
| **Slack/Discord 渠道的 durable-before-ack 实现是否一致** | 当前只深挖 Telegram | 需对 `extensions/slack/src/monitor.ts` 做平行深挖 |

## 8. 工程含义

**[I]** 对 RoboThree 而言，这意味着 Channel Adapter 不只是 30 行 OAuth 集成代码——生产级 Channel Adapter 至少要包含：

1. **持久化层**：durable spool queue（local SQLite），account-scoped
2. **认领机制**：单一 worker 拥有消息所有权（claim token）
3. **超时控制**：adoption-stall watchdog（默认 5 分钟）
4. **重试策略**：attempt floor + age gate 双重约束
5. **车道串行**：per (chat, topic) 串行处理
6. **降级漏斗**：发送失败时的多层回退
7. **Webhook 安全**：常数时间 header 校验 + 速率限制

**[R]** 对 RoboThree MVP 建议：
- **复用 OpenClaw 这套四阶段协议的简化版**——剥离 streaming，仅保留 durable 通道
- **保留 durable-before-ack + adoption-time complete + claim fence** 三个核心不变量
- **降级漏斗内置到 Channel Adapter SDK**——所有渠道插件必须实现 send-fallback-dispatcher
- **推迟 streaming 流式等到 Phase 2**——MVP 用全量一次性发送
