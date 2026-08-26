# L3 深挖 — Agent Turn/Step Loop + Append-Only Session Log

> 机制 2/3。回答：`ReactLoopAgent` 的 turn/step 循环如何驱动，以及 append-only session log 如何成为“唯一真相源”。
> 全部结论 Confirmed by: source。

## 1. 一句话结论

`[F]` `ReactLoopAgent` 是一个 phase 机（idle/maintenance/running），通过双队列 `Inbox` 接收输入，把一次 turn 分解为 0..n 个 step（每个 step = 一次模型请求 + 它调用的工具），每一步的每个事实都落进 append-only session log；模型历史不单独存储，而是由 `deriveMessages()` 从 log 的 surface 投影。**“model-visible ⟺ logged”** 是不变量——任何进模型的内容必须能从 log 重建。

## 2. Phase 机与并发控制

- `[F]` `Phase` 三种状态，running 态携带 `AbortController + turn + step + wakeRequested`（[agent.ts:38-46](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L38-L46)）。
- `[F]` 单 flying driver 不变量：`wakeDriver()` 只在 idle 时启动新 driver；非 idle 时要么 latch（maintenance/aborted 后重放），要么让 live driver 自行 claim 队列（[agent.ts:172-193](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L172-L193)）。
- `[F]` `whenIdle()` 循环 `await activityDone` 直到稳定（[agent.ts:195-200](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L195-L200)）。
- `[F]` 每个 turn 结束用**新的 AbortController**，使旧 latch 失效、live driver claim 队列（[agent.ts:324-329](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L324-L329)）。

> `[I]` 这与 Codex 的并发工具 + 分级取消不同：DeepSeek Harness 的 agent 循环是**串行 turn + 步内并发工具**，但每个 turn 有独立取消作用域。取消语义更接近 OpenCode 的串行 dispatch + per-turn abort。

## 3. Turn 分解（turn/step 边界）

- `[F]` `turn()`：`append('turn/start')` → 循环 `preStep` → `step` → 判定 → `append('turn/end', { reason })`（[agent.ts:246-330](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L246-L330)）。
- `[F]` **turn 是 step 的零个或多个**：pre-step 拒绝或首 claim 空 → turn 以 `blocked`/`completed` 结束但 no step（[agent.ts:267-277](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L267-L277)）。
- `[F]` 一个 step 内 `while(true)`：finish 为 error/aborted 时 `agent/request-error` 瀑布可 retry；无 tool-call 或 concluded → step 结束（[agent.ts:339-400](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L339-L400)）。

### 3.1 preStep（进入 step 前）

- `[F]` 顺序：claim inbox → `systemPrompt.assemble()` → `renderContextSections` → `runtimeContext.project` → `waterfall('agent/pre-step')` → 返回 reject 或 enter(messages)（[agent.ts:225-243](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L225-L243)）。
- `[F]` `agent/pre-step` 决定“模型看到什么”：listener 可改写 claimed messages 或 outright reject（[agent.ts:234-240](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L234-L240)）。

### 3.2 buildRequest（请求组装）

- `[F]` `agent/request` waterfall 提议 config；`llm.prepareCall()` 解析 exact-model 默认；`canonicalHeader()` 冻结 header（[agent.ts:438-470](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L438-L470)）。
- `[F]` header 变化才追加 `request/header`（reason: initial/resume/change）；route/contextWindow 变化才追加 `request/context`（[agent.ts:464-483](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L464-L483)）。
- `[F]` 最终 request 由 `markAgentLoopRequest(deepFreeze({...}))` 冻结（[agent.ts:486-493](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L486-L493)）。

### 3.3 step 内容流

- `[F]` `llm.stream(request)` → 每个 chunk `append('assistant/chunk')`（token 级 replay fidelity）→ `BlockAssembler` 聚合 → `append('assistant/message', { message, usage })` 并携带 `sourceEventSeqs`（[agent.ts:343-390](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L343-L390)）。

## 4. Session Log：append-only 真相源

### 4.1 事件词汇（SessionEventMap）

- `[F]` merge-extensible append-only log；每个 event = `{ type, seq, time, data }`，surface 事件额外携带 `surfaceOp` + `sourceEventSeqs`（[types.ts:404-436](../../sources/deepseek-harness/packages/core/session/src/types.ts#L404-L436)）。
- `[F]` 三类事件：
  - **surface 事件**（`user/message` / `assistant/message` / `tool/result`）— 产生模型消息，可进入有序 surface（[types.ts:343-347](../../sources/deepseek-harness/packages/core/session/src/types.ts#L343-L347)）。
  - **log-only 边界**（turn/start、step/start、step/end、turn/end）— 结构事实。
  - **log-only 快照**（`todo/write`、`request/header`、`request/context`、`session/end-seed`）— 不进入模型历史。

### 4.2 deriveMessages：历史从 surface 投影

- `[F]` `deriveMessages()` 用 `derivedGeneration` 缓存，只增量投影新增 surface 节点（[index.ts:726-747](../../sources/deepseek-harness/packages/core/session/src/index.ts#L726-L747)）。
- `[F]` surface 由 `SurfaceManager` 维护，`surfaceOp: 'append'` 追加尾部，`{ op:'replace', start, end }` 替换区间（用于 compaction）（[types.ts:372-374](../../sources/deepseek-harness/packages/core/session/src/types.ts#L372-L374)）。

### 4.3 Model-visible ⟺ logged 不变量

- `[F]` 文档明文：`Model-visible means logged. Anything that reaches a model request must be reconstructable from the log`（[architecture.md](../../sources/deepseek-harness/docs/architecture.md)）。
- `[F]` 实现侧：`assistant/message` 落 log 时携带 `sourceEventSeqs: chunkSeqs`，使 raw chunk 与聚合 message 关联（[agent.ts:381-390](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L381-L390)）。
- `[F]` `ignorable` 标记：读者遇未知 required 事件必须拒绝重建；只有 `ignorable: true` 可安全跳过，默认 required 使“忘标标记”倾向过拒绝而非静默丢（[types.ts:411-422](../../sources/deepseek-harness/packages/core/session/src/types.ts#L411-L422)）。

### 4.4 fork / resume / lineage

- `[F]` `SessionHeader` 携带 `version / id / createdAt / cwd / parentSession / seedLength / origin / delegationDepth / agentPreset`（[types.ts:61-99](../../sources/deepseek-harness/packages/core/session/src/types.ts#L61-L99)）。
- `[F]` `SessionForkError` code 覆盖 `SESSION_NOT_FOUND / SESSION_NOT_LIVE / SESSION_ALREADY_EXISTS / INVALID_BOUNDARY / OPEN_TURN`（[index.ts:771-776](../../sources/deepseek-harness/packages/core/session/src/index.ts#L771-L776)）。
- `[F]` `SessionStore.fork(source, boundary?, childSessionId?)`（[index.ts:1081](../../sources/deepseek-harness/packages/core/session/src/index.ts#L1081)）。

## 5. 事件瀑布：loop 的扩展面

`[F]` 关键 waterfall/serial 扩展点（agent-loop 内）：

| 事件 | 模式 | 作用 | 证据 |
|---|---|---|---|
| `agent/pre-step` | waterfall | 决定模型看到什么（rewrite/reject） | [agent.ts:234](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L234) |
| `agent/request` | waterfall | 提议请求 config（provider/model/effort） | [agent.ts:438](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L438) |
| `agent/request-error` | waterfall | 决定是否 retry | [agent.ts:354](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L354) |
| `agent/turn-stopping` | serial（无 next） | 拦截 turn 停止 | [agent.ts:296](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L296) |
| `tools/pre-execute` | waterfall | allow/deny/ask | [tools/index.ts:152](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L152) |
| `tools/execute` | waterfall | timeout/retry/metrics 包装 | [tools/index.ts:163](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L163) |
| `tools/post-execute` | waterfall | accept/replace/enrich/block | [tools/index.ts:175](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L175) |

- `[F]` `agent/pre-step` / `agent/request` / `llm/stream` / 三个 `tools/*` 是 waterfall（listener 必须 `next()`）；`agent/turn-stopping` 是 serial 无 `next()`（docs/architecture.md）。

## 6. 工具并发（step 内）

- `[F]` `executeToolCalls` 按 `executionMode` 分 parallel/exclusive；exclusive 形成 barrier（[tool-calls.ts:84-100](../../sources/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts#L84-L100)）。
- `[F]` `runGroup` 用 bounded rolling pool（`maxParallelToolCalls`），结果按 **model 顺序** commit（`commitReady` 只推进连续 slot）（[tool-calls.ts:145-246](../../sources/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts#L145-L246)）。
- `[F]` 调度器协议 `[TOOL_RUNTIME_SCHEDULER]`：`prepare`（pre-execute + guard）→ `dispatch`（execute + body）→ `finalize`/`finish`（post-execute + materialize）（[tools/index.ts:796-801](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L796-L801)）。

## 7. 失败 / 取消 / 恢复路径

- `[F]` 取消：`cancel(cause)` → 清 inbox + `phase.abort.abort(cause)`；turn 以 `aborted` 结束，`turn/end.reason` 记录细分（user/parent/hook/disposed/legacy）（[agent.ts:134-140](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L134-L140)、[types.ts:143-150](../../sources/deepseek-harness/packages/core/session/src/types.ts#L143-L150)）。
- `[F]` 工具取消不放弃 body：`dispatchToolBody` 用 fused signal，started promise 到 quiescence 后结果才变 `ABORTED`（[tools/index.ts:1532-1560](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L1532-L1560)）。
- `[F]` 未启动的 skipped 调用记录合成 `tool/call`+`tool/result`（`ABORTED_BEFORE_DISPATCH`），保证 replay 合法（[tool-calls.ts:248-259](../../sources/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts#L248-L259)）。
- `[F]` 崩溃恢复：`interrupted` turn 结束标记由持久化后端在 reload 时关闭 crash-orphaned turn，loop 不产生此标记（[types.ts:169-173](../../sources/deepseek-harness/packages/core/session/src/types.ts#L169-L173)）。

## 8. 对 RoboThree 的直接启示

1. `[R]` **append-only event log + deriveMessages 投影**是 session/state/memory 模块的强范式：模型历史不单独存，而是从 log 派生，天然支持 fork/resume/replay/telemetry/compaction。
2. `[R]` **“model-visible ⟺ logged”** 应作为 RoboThree 的运行时 invariant：新增任何模型可见输入必须对应一个新的 session event，否则无法重建/审计。
3. `[R]` **waterfall 作为 loop 扩展面**（pre-step/request/request-error/turn-stopping）把“改循环”变成“挂 listener”，符合 CLAUDE.md「Plugins, not loop changes」原则。
4. `[R]` **turn/step 双层边界 + per-turn abort** 提供了清晰的取消/恢复/持久化 checkpoint 单位。
5. `[R]` **compaction 用 surfaceOp replace**（区间替换）而非整体重写，是 context 压缩且保留来源链的优雅做法。

## 9. 风险 / 局限

- `[I]` `SESSION_FORMAT_VERSION = 0` 且 backend reject old formats：log schema 尚无真实迁移路径（升级需 bump 版本 + 迁移链，机制见 `.agents/notes/...session-log-version-mechanism.md`，但该 note 是过程记录，非权威）。
- `[I]` surface replace（compaction）要求 `sourceEventSeqs` 覆盖被替换节点，正确性依赖调用方，易出错。
- `[UNKNOWN]` `deriveMessages` 的增量缓存在大 log 下的内存/投影性能未实测。
