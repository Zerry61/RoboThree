# Network & API Disruption Resilience — 跨项目对比

> 核心问题：在网络中断、Model API 异常、进程崩溃等场景下，各类 Agent 的执行记录是否丢失？网络恢复后能否从前一次的成功状态继续？
> 分析日期：2026-07-22

## 0. 三句话答案

1. **会不会丢 ≠ 设计先进不先进**，而是取决于**持久化时机**：只 flush 到内存的（Hermes/Grok 普通模式）必然丢；append-only 事件流（Pi/OpenHands/OpenClaw 核心层）永不丢。
2. **"不丢"是便宜的设计**，但**"在网络恢复后能自动续上 + 不重复副作用"**才是真正难的。所有项目都至少有一个角落处理这个问题，但不是每个项目都处理得正确。
3. **RoboThree 在 KAF-2 已固化最优解**（Command Receipt + Event + Checkpoint + Outbox 单事务提交 + idempotencyKey），下面 §6 给出进一步收紧建议。

---

## 1. 各项目的持久化时机与崩溃保证

### 1.1 持久化触发点对比

| 项目 | 持久化时机 | 写入格式 | Append-only? | 崩溃保证 |
|------|-----------|---------|---------------|------------|
| **Pi Agent** | 每条消息 / 每次 appendEntry（`appendMessage` + `updateLeaf`） | JSONL，每行一个 entry | ✅ 严格 append-only | **写一半也不破坏文件**（任一 JSON 行可直接 parse；leaf pointer 在另一行） |
| **OpenHands** | 每个 Action/Observation Event 产生后立即 append | EventLog 文件 | ✅ Append-only events | 单条事件损坏不影响其他事件 |
| **LangGraph** | 每 superstep 完成后 `_put_checkpoint` + 延迟的 delta writes | Checkpoint（snapshot）+ pending writes | ⚠️ Snapshot 覆盖式，delta append | checkpoint 完成后保证可见；crash 在 wait 前则 step 重做（依赖 channel_versions 幂等） |
| **OpenClaw**（Telegram 渠道 L3） | `durable-before-ack`：消息先 spool 入队，**收到 platform 的确认前不删除** | SQLite spool table | ✅ | **消息层永不丢**；drain 时用 claim token 防止双重结算 |
| **Hermes** | `agent._persist_session` 完整 + `_flush_messages_to_session_db` 增量；**关键：仅在工具执行前和循环关键节点 flush** | SQLite + 内存 messages | ⚠️ 内存是 source of truth | 工具执行前增量刷（避免破坏性工具崩溃丢失 tool-call 块） |
| **Grok Build** | `ChatStateActor` 状态 in-memory；StdioReplayState 缓存 ACP 请求；正常模式不主动持久化 ChatState 本身 | 内存为主；Leader 模式有 replay | ⚠️ | 内存丢失即丢失；Leader 重连通过 `StdioReplayState` 重放 initialize + session/load，**不恢复运行中 tool** |
| **Claude Code Best** | `saveCacheSafeParams` snapshot，Stop hook 触发 `flushSessionStorage`；非 per-event | sessionStorage + 文件 | ❌ Snapshot 覆盖 | snapshot 间隔内改动丢失 |

### 1.2 关键证据

**[F] Pi Agent**：JSONL session 文件设计为"任何 crash 留下有效 JSONL"——每个 entry 是独立的 JSON object，损坏只影响当前行。证据：`session-context-pipeline.md` §1.1 完整 JSONL 样例 + §1.2 `buildSessionContext()` 走 leaf→root。
**[F] OpenClaw Telegram ingress**：`extensions/telegram/CLAUDE.md` 显式声明 Reliability Invariants，spool 必须 durable-before-ack。证据：`channel-runtime-l3.md` §3-§4。
**[F] Hermes**：`conversation_loop.py:4966-4978` 注释明确写"Persist the assistant tool-call turn before any tool side effects run. If a destructive tool restarts or terminates Hermes mid-turn, resume logic still sees the exact tool-call block."
**[F] Grok Build**：`main.rs:638-652` 定义 `StdioReplayState`，缓存 initialize + session/load ACP 请求用于 Leader 重连后的 replay，**明确不恢复 running tool**。证据：`grok-build/architecture.md` §4.3。
**[F] LangGraph**：`_loop.py:1530-1546` `_checkpointer_put_after_previous` 显式先 `concurrent.futures.wait(delta_futs)` 再 `prev.result()` 再 `put(checkpoint)`，严守因果顺序。证据：`langgraph/deep-dive-checkpoint-visibility.md` §2.1。

---

## 2. 网络/模型 API 中断的具体恢复路径

### 2.1 Pi Agent：`continue()` 是断网恢复的设计入口

**[F]** Pi 设计了显式的 `continue()` API（不是隐式重连），适用场景包括：

> "Designed for retries after provider errors."

证据：`pi/agent-loop-three-layer.md` §1.2 表格行 "continue() semantics: Resumes from existing context without adding a new message. The last message must be `user` or `toolResult`."

**Pi 的恢复语义**：

```
Pi Recovery Path:
  1. Provider 流式响应中断（4xx/5xx/网络断）
     ↓
  2. message_update stream 终止，agent_loop 进入 finish-with-error 路径
     ↓
  3. JSONL 已记录：assistant 流的所有已接收 chunk
     ↓
  4. 用户重新发送 prompt → state.agent.prompt(rebuild)
     ↓
  5. Agent.prompt() → createTurnState() → agentLoop()
     ↓
  6. buildSessionContext() 重建（不丢失任何已 append 的 entry）
     ↓
  7. LLM 重新从头生成（本轮无 state pollution 因为 append-only）
```

**丢失什么**：本轮中断时刻**之后**未到达的 LLM chunk（这部分本来在内存里没 append）。
**保留什么**：本轮之前所有 Entry + 已收到的 chunk。
**副作用风险**：如果 LLM 在中断前已发出 tool_call 但未收到 tool_result，Pi 不会自动重做（这是 agent 层职责，需要 harness 判断 `last message must be user or toolResult`）。

### 2.2 LangGraph：`_checkpointer_put_after_previous` 是核心保证

**[F]** LangGraph 的两段式持久化：

```
Superstep N:
  [Node 写入] → put_writes(N, [msg1]) → submit → fut_A
  [Node 写入] → put_writes(N, [msg2]) → submit → fut_B
  [_put_checkpoint]
    ↓
  [_checkpointer_put_after_previous]
    ├─ 1. wait(fut_A, fut_B)        ← 等所有 delta 持久化
    ├─ 2. wait(prev_checkpoint)     ← 等上次 checkpoint
    └─ 3. put(checkpoint_N)         ← 然后才持久化 checkpoint
```

证据：`langgraph/deep-dive-checkpoint-visibility.md` §2.1，`_loop.py:1530-1546`。

**关键崩溃修复语义（§3.2）**：

```
进程崩溃后：
  - crash 在 wait(futs) 之前 → writes 可能部分写入，checkpoint 没写入 → 下次启动时读不到该 step → **重新执行该 step** → channel_versions 保证幂等
  - crash 在 put(checkpoint) 之后 → 整个 step 完整 → 下次启动继续
```

幂等性由 `channel_versions` 保证：相同 input 产生相同 version → 节点调度器发现 channel 未变化 → 不重执行。

### 2.3 OpenClaw（Telegram L3）：四阶段 + 双 funnel 协议

**[F]** OpenClaw 的 L3 深挖展示了 Channel Adapter 的真实生产级模式，**核心不是 Agent 本身的恢复**，而是从外部 Channel 拉消息的 ingress 流程：

```
阶段 1: Durable-Before-Ack
  → 消息先 spool 入 SQLite，再 reply "received"

阶段 2: Adoption 循环
  → Worker 通过 claim-token 获取消息所有权
  → 8 次重试 × 24 小时 age gate

阶段 3: Lane-Serialized Adoption
  → 按账号 lane 串行化，避免 race

阶段 4: Adoption-Time Complete
  → 系统接管时立即 tombstone，不延迟到 settle

出站双漏斗：
  durable funnel：persistent send + retry
  streaming funnel：Edit-in-place（实时预览）
  → 两条必须等价降级
```

证据：`openclaw/channel-runtime-l3.md` §3。

**关键数字（§3 末尾）**：retry attempts = 8；retry age gate = 24h；claim 续约周期 = `claimLeaseMs / 3`。

### 2.4 Hermes：`agent._flush_messages_to_session_db` 的关键时机

**[F]** Hermes 把持久化时机显式选在工具执行前（`conversation_loop.py:4966-4978`）：

```python
# Persist the assistant tool-call turn before any tool side effects run.
# If a destructive tool restarts or terminates Hermes mid-turn,
# resume logic still sees the exact tool-call block.
```

**Provider 失败的处理（L1513-1630）**：

```python
# Response 校验失败 → fallback chain
agent._try_activate_fallback(switch_reason) → agent._fallback_chain 中的下一个 Provider
```

证据：`hermes-agent/architecture.md` §2.3。

### 2.5 Grok Build：Leader 模式 ≠ 普通模式

**[F]** Grok Build 区分两种持久化语义：

| 模式 | ChatState 持久化 | 重启恢复 |
|------|-------------------|----------|
| 普通 TUI / Headless | `ChatStateActor` 内存，进程退出即丢 | 无；进程退出 = 状态全失 |
| Leader 常驻后台 | 不直接持久化 ChatState | `StdioReplayState` 重放 initialize + session/load ACP 请求，**恢复会话列表/客户端视图但不恢复运行中 tool** |

证据：`grok-build/architecture.md` §1 末尾摘要 + §4.3。
源码：`main.rs:638-652` (`StdioReplayState`) + `main.rs:885-941` (`replay_acp_state_after_reconnect`)。

### 2.6 Claude Code Best：snapshot 丢失窗口

**[I]** Claude Code Best 用 sessionStorage + 周期 snapshot，**snapshot 间隔内的状态变更在 crash 时丢失**。这是其机制本身的特性（snapshot 不可能 per-event）。
证据：`context-handling.md` §4.1 行 "Snapshot-based; `saveCacheSafeParams` captures only session metadata; `--continue/--resume` for recovery"。

### 2.7 OpenHands：EventLog append-only + Action/Observation

**[F]** OpenHands 与 Pi 同族（前者 EventLog，后者 JSONL），但 OpenHands Event 是 typing 化的可识别对象，并通过 `parent_id` 形成 tree。OpenHands 强项是 `LocalConversation.fork()` ——可按 step fork。
证据：`context-handling.md` §4.1 + §4.2。

---

## 3. "断网恢复后能否自动续上"

| 项目 | 自动续上？ | 触发机制 | 副作用安全 |
|------|-------------|----------|------------|
| **Pi Agent** | ❌ 隐式，依赖 JSONL 完整 + 用户重发 | `prompt()` / `continue()` 重新进入 agentLoop | 天然安全（idempotent tools + JSONL 不重复 append） |
| **OpenHands** | ❌ 隐式，从 EventLog 重建 State | `LocalConversation.fork(fromEventId)` 可重放某一节点 | EventLog 自身 append-only，Fork 干净 |
| **LangGraph** | ✅ 是的（设计内） | `invoke(Command(resume=...), config)` | channel_versions 幂等保证 |
| **OpenClaw** | ✅ 是的（drain 自动续） | Spool + claim token 自动 retry | claim token 防双结算 |
| **Hermes** | ⚠️ 半自动 | Tool 执行前 flush + `_fallback_chain` 切 Provider | fallback 后 retry counter reset |
| **Grok Build** | ❌ 仅 Leader 模式部分恢复 | `StdioReplayState` | 不恢复 running tool（明确告知） |
| **Claude Code Best** | ❌ 手动 `--continue` / `--resume` | 用户命令 | snapshot 完整性取决于最近 flush |
| **RoboThree（KAF-2 已实现）** | ✅ **设计内**，完全自动化 | `TaskPersistence` 物化 `commandId + canonical SHA-256 digest` | **idempotencyKey 三种 recovery mode（ADR-007）** |

---

## 4. 网络断开 vs 模型 API 中断 vs 进程崩溃 三种场景

| 场景 | Pi | LangGraph | OpenClaw | Hermes | Grok Build | RoboThree |
|------|-----|-----------|----------|--------|-----------|-----------|
| **断网（ping 不通）** | LLM 调用直接失败 / 客户端连接断开，user 重连 | 提交中请求超时，checkpoint 不更新到 latest，resume 时从 last complete step | Spool 持久化（消息永不丢），等网络回来 drain retry | Tool 网络请求失败 → 进 retry loop → fallback chain | 内存 ChatState 丢失（普通）；Leader 模式 `LeaderReconnector` 重连 | Outbox dispatch pending → publish 失败记录 attempt → pending 保留 → 重启续发 |
| **Model API 4xx/5xx/超时** | `continue()` 重发同一消息 | `concurrent.futures.wait` 抛异常 → `_suppress_interrupt` 抑制 → resume | Channel adapter 重试（attempt floor + age gate） | `classify_api_error` + `agent._try_activate_fallback()` | sampler 内部 retry/退避（`UR-003` 借鉴但未深挖） | Receipt 触发后调用；abort signal 贯穿 KAF-3.3 已固化 |
| **进程崩溃** | JSONL 完整保留，UI 重启读到 last leaf | wait 之前 crash → 重新执行该 step；wait 之后 crash → 完整恢复 | Spool 入队持久化，重启 drain 继续 | 工具前已 flush tool-call；resume 读取已 flush 块 | 普通：内存全失；Leader：`StdioReplayState` | **Receipt + Event + Checkpoint + Head + Outbox 单事务**，崩溃后续 commit 起点 = lastEventSequence + 1 |

### 4.1 重点：RoboThree 在哪些场景与 LangGraph 等价 / 比 Pi 强？

**等价场景**：进程崩溃后从 last checkpoint 恢复 —— 这一点 LangGraph/RoboThree 行为一致。

**RoboThree 比 LangGraph 更严格**：

| 维度 | LangGraph | RoboThree |
|------|-----------|-----------|
| 每步持久化 | superstep 后异步等待 delta | **每 accepted Command 单事务（含 Receipt+Event+Checkpoint+Head+Outbox）** |
| 因果顺序保证 | `_checkpointer_put_after_previous` Future 链 | **SQLite `BEGIN IMMEDIATE` 同一事务**，无需 Future |
| 不变量 1 | "snapshot 包含 channel_value 时，后续 writes 必须等到 snapshot 持久化" | "accepted Command 的 Event/Checkpoint/Receipt/Outbox 同事务；后续 Effect/Task state 引用 lastEventSequence"（ADR-007） |
| Crash recovery | 依赖 `channel_versions` 幂等 | **idempotencyKey + 三种 recovery mode + canonical JSON digest**（KAF-2.3） |

**RoboThree 比 Pi 强**：Pi 是 append-only JSONL，恢复靠 replay；RoboThree 持久化是关系型 + Checkpoint，**可查询**（id/digest/status），不需要 replay 就能拿到 lastEventSequence + Task head。

---

## 5. "前面执行记录是否丢失"的最终答案矩阵

> 给一个具体的真实场景：用户做了 N 步，K 步时进程崩溃 / 网络断。重启后，问 K-1 步之前的成果是否完整可见。

| 项目 | K-1 步之前的所有完成步骤 | K 步已写入的 Observation | 重建起点 | 重启后能否直接看到 K-1 步成果？ |
|------|--------------------------|--------------------------|----------|-------------------------------|
| **Pi Agent** | ✅ 全部在 JSONL | 部分已 append 的 chunk | leaf entry | ✅ 直接读取（`buildSessionContext`） |
| **OpenHands** | ✅ 全部在 EventLog | 同上（EventLog 文件） | last event / fork point | ✅ 直接读取 |
| **LangGraph** | ✅ 大概率在（取决于 last checkpoint） | 不在（delta channel 未 snapshot） | last checkpoint + after-events | ✅ 直接读取（snapshot state） |
| **OpenClaw (Telegram)** | ✅ 全部在 SQLite spool | 消息已 ack + retry 中，等处理 | spool queue | ✅ 直接读取（drain 状态可查） |
| **Hermes** | ✅ 大概率（flush 时机频繁） | 工具执行前已 flush tool-call block | last session persist | ⚠️ 需要 resume 逻辑（`resume logic still sees the exact tool-call block`） |
| **Grok Build** | ❌ 普通模式全部丢；Leader 模式部分 | ❌ 普通模式丢 | ❌ 普通模式无起点 | ❌ 普通：丢失；Leader：StdioReplayState 仅恢复客户端视图 |
| **Claude Code Best** | ⚠️ 取决于 last `flushSessionStorage` 时机 | 丢（snapshot 周期内） | snapshot 状态 | ⚠️ 用户需 --continue 手动 |
| **RoboThree (KAF-2.3)** | ✅ 全部在 SQLite Persistence | ✅ 如果 Observation 已被 `commitAcceptedCommand` 原子提交则保留；否则按 Effect 三种 mode 走 | **lastEventSequence + Task head + Outbox pending** | ✅ **直接 `snapshot(taskId)` 拿到完整状态** |

---

## 6. RoboThree 设计建议（基于跨项目对比）

### 6.1 ADOPT（已经在 KAF-2/3 实现，无需修改）

| # | 模式 | 来源 | 已在 RoboThree |
|---|------|------|---------------|
| 1 | Append-only + 物化 Checkpoint（不依赖 replay 直接可查询） | Pi + LangGraph 综合 | ✅ `TaskCheckpoint` + `TaskEvent` 表结构 |
| 2 | Accepted Command 单事务原子提交（含 Receipt/Event/Checkpoint/Head/Outbox） | RoboThree 独创（基于上游综合） | ✅ KAF-2.2 |
| 3 | idempotencyKey + 三种 recovery mode | LangGraph pending-write + OpenHands Action ID | ✅ KAF-2.3 |
| 4 | Outbox at-least-once + 续发 | OpenClaw post-transaction publish | ✅ KAF-2.2 |
| 5 | Stable Action ID / Step ID / Command ID（per-Task mailbox） | LangGraph Command + Pi Event ID | ✅ KAF-1 |

### 6.2 ADAPT（建议在 KAF-4 实施）

| # | 修改 | 来源 | RoboThree 化建议 |
|---|------|------|------------------|
| 1 | **断网后客户端重连恢复语义** | Pi 的 `continue()` + OpenClaw 的 durable-spool | Desktop 重连后从 Local Core `snapshot(taskId)` 拿到 last good state，UI 展示"上次中断于 step K，taskId=X，是否继续？"。不要自动重连发送新 prompt（保留 user agency） |
| 2 | **Model Provider 4xx/5xx/超时的 fallback 链** | Hermes `_fallback_chain`（`[F] conversation_loop.py:1546`） | 为企业 MaaS 引入 retry → fallback → uncertain 三段。fallback 顺序写在 Admin Module 配置，**API Key 切换由 Local Core → Enterprise Gateway 处理**（KAF-7+） |
| 3 | **大窗口 Context 的预检崩溃保护** | Pi 的 known bugs #3660/#5512（compaction 触发在 overflow 之后） | RoboThree 应在 Stage 0（context pipeline 之前）做 token 预算预检。详见 `comparisons/context-handling.md` §12.4 |
| 4 | **UI 同步展示"等待超时/Retry x/N"** | Hermes 暴露 `agent.step_callback` 给 gateway | Durable Runtime 通过 Event Stream 把"等待模型 API / Retry / Uncertain"事件发给 Desktop，**不允许 Client 处于"什么都不知道"状态** |

### 6.3 REJECT（明确不要照搬）

| # | 来源 | 拒绝原因 |
|---|------|---------|
| 1 | Hermes 把消息主存放在内存（in-memory god object） | 反例——RoboThree 必须 Snapshot-on-accept |
| 2 | Grok Build 普通模式 ChatState 不持久化 | 反例——RoboThree 必须每 accepted Command 落 SQLite |
| 3 | Claude Code Best 的 snapshot 周期写 | 反例——RoboThree 是 per-accepted-Command 原子写，无需快照策略 |
| 4 | OpenClaw 的 StdioReplayState | 不照搬——RoboThree 是单进程 Core + Electron Client，不需要 Leader 重连协议 |

### 6.4 设计不变量必须长期保持

从跨项目对比提炼：

1. **Accepted Command 必须原子形成 Event + Checkpoint + Receipt + Head + Outbox**（KAF-2.2 已经做到）
2. **Crash 后恢复 = 读 Checkpoint + replay Event tail 不超过 lastEventSequence**（KAF-2.2 已经做到）
3. **Effect 必须 idempotencyKey 稳定 + recovery mode 显式声明**（KAF-2.3 已经做到）
4. **Outbox 至少 one-time + 重启续发 + 消费者去重**（KAF-2.2 已经做到）
5. **Provider 失败不破坏 Task state**——失败时 Task 自己保持原 status，Effect 进入 uncertain/retry，等待用户决策（KAF-2.3 已经做到）
6. **恢复语义必须对用户可见**——"网络中断，已恢复，是否重试？"，不允许默默重发

### 6.5 不显式提及但隐式存在的设计选择

这次对比揭示了一个**重要的架构选择**：RoboThree 没有走"以 Conversation 为中心"的模型（Hermes / Pi / Claude Code Best 都是），而是走"以 Task 为中心"的模型。这意味着：

- 跨 session 上下文共享不是第一优先级
- 进程崩溃恢复点天然是 Task-boundary（无需人工界定）
- 多 Task 并发是 first-class（per-Task mailbox 已就位）

这是个正确选择，因为 RoboThree 是企业工作台，不是个人助手的 IDE/CLI。

---

## 7. 还没回答但应该在 KAF-4 实施时注意的灰色地带

### 7.1 真实流式响应中断时，用户输入模型中途 partial content

KAF-3.3 固化了 **ProcessEcho** 在 `dispatched` 后崩溃保留 dispatched 状态。但 LLM stream 的 partial content 怎么办？

**当前行为**：LLM 在 stream 中途断，model provider Adapter 抛异常 → Task 还没 record_observation（Observation 是 stream 完整后才有）→ Core catch 异常 → Step 失败。

**风险**：KAF-3 没显式测过这个。当前模型假设是 fake，stream 是"全部 mock 一次性返回"。

**KAF-4 建议**：接入真实 streaming Model 后，需要测：
1. Stream 在 50% 处断网
2. Stream 在 90% 处 API 返回 5xx
3. Stream 正常完成但客户端在最后一帧断网

这些应该在 `kaf-4` 的 ToolExecutionService regression 测试中覆盖。

### 7.2 个人 Model 的 Provider（KAF-7 未到，目前用本地 API Key）

MVP v0.5 §7.5 个人 Model 不走企业 Gateway。这条链路断网时**没有回退**——因为个人 Model 的故障域就是用户本机。这是设计选择，不是漏洞。但产品文档应明确告诉用户"个人 Model 不可用 = 不可用，不会有第二选择"。

### 7.3 KAF-4 / KAF-5 应该增加的端到端韧性测试

| 场景 | 验证项 |
|------|--------|
| 100 步任务，第 50 步时进程 SIGKILL | 重启后 step 1-50 完整恢复；可继续 step 51+ |
| Tool 在 dispatched 后被 `kill -9` SQLite 断电 | Effect 保持 dispatched，下个 Core 启动时由 TaskRecoveryCoordinator 检查 |
| Outbox publisher ack 崩溃（at-least-once 验证） | 重启后 from outboxId/eventId 重发，Consumer 去重 |
| LLM 在 stream 中途 5xx | Step 进入 uncertain waiting/external_dependency，不假装 failed |
| 企业 Gateway 长时间不可达 | Local Core 继续使用 cached config，按 MVP v0.5 §7.14 本地回退 |

---

## 8. 证据强度与覆盖

| 维度 | 状态 |
|------|------|
| 各项目持久化时机 | ✅ 全部 [F] 证据（已读 L2/L3 文档确认） |
| 崩溃恢复机制（LangGraph / Pi / OpenClaw） | ✅ 源码级证据 |
| Grok Build Leader 普通模式差异 | ✅ 主项目文 + Robothree-fit-analysis 已确认 |
| RoboThree 当前实现 | ✅ 从 KAF-2/3 验证报告反推 |
| 真实 Model API 中断处理 | ⚠️ 当前 ModelProvider 是 Fake，**未真实测试过** |
| 5xxx Edge Case（partial stream） | ❌ UNKNOWN，需 KAF-4 实证 |

---

## 9. 结论与建议

| 关注点 | 结论 |
|--------|------|
| 会不会丢前面执行记录？ | **绝大多数项目不会完全丢**，但 Gamma 级的完整恢复（包含当前正在做的 step）只有 Pi + OpenHands + RoboThree 这类按 event/command 粒度持久化的项目做到了 |
| 网络恢复后能否自动续上？ | **看 Provider 失败处理** ——RoboThree KAF-3 已实现 RecoveryCoordinator，但需要 KAF-4 接真实 Model 后再验证 |
| 超时/重试的 UX 是？ | **当前没有统一规范**，建议 KAF-4 引入 Local Core Event Stream 把"等待/重试/降级"状态推给 UI |
| 最危险的盲区？ | **真实 Model stream 中断**——Fake 测试无法覆盖。KAF-4 接入真模型后第一个测试场景必须包含 |

**RoboThree 已经把最难的部分做对了**（持久化原子性、副作用幂等、恢复决策）。剩下要做的是把用户能感知的故障语义暴露出来，而不是等到 KAF-4 才发现 UI 不知道"为什么停了"。

---

## 参考文档索引

| 文档 | 关键章节 |
|------|---------|
| [`research/pi/session-context-pipeline.md`](../pi/session-context-pipeline.md) | §1 持久化 §3 compaction §7 RoboThree Implications |
| [`research/pi/agent-loop-three-layer.md`](../pi/agent-loop-three-layer.md) | §1.2 `continue()` §3.5 Turn Snapshots |
| [`research/langgraph/deep-dive-checkpoint-visibility.md`](../langgraph/deep-dive-checkpoint-visibility.md) | §2 因果顺序保证 §3.2 崩溃修复 |
| [`research/langgraph/deep-dive-interrupt-resume.md`](../langgraph/deep-dive-interrupt-resume.md) | 全部（Interrupt/Resume 状态机） |
| [`research/openclaw/channel-runtime-l3.md`](../openclaw/channel-runtime-l3.md) | §3 四阶段协议 §4 双漏斗 |
| [`research/openclaw/deployment-model.md`](../openclaw/deployment-model.md) | §2.2 Gateway 重启责任 |
| [`research/hermes-agent/architecture.md`](../hermes-agent/architecture.md) | §2.3 retry/fallback §7 持久化时机 |
| [`research/grok-build/architecture.md`](../grok-build/architecture.md) | §1 主摘要 §4.3 Leader 重连 |
| [`research/claude-code-best/tool-system-deep-dive.md`](../claude-code-best/tool-system-deep-dive.md) | §1.3 ToolUseContext（含 abortController 与回退） |
| [`research/comparisons/context-handling.md`](context-handling.md) | §4 持久化对比 §12 RoboThree 上下文管线建议 |
| RoboThree `0.0.0-kaf.2.2` / `0.0.0-kaf.2.3` 独立 QA 报告 | §1 验收结论 §2 问题统计 |
| RoboThree ADR-007 Event/Checkpoint/Side-Effect | §4 副作用执行顺序 §5 恢复规则 |
