# Deep Dive 1: Agent Turn Loop + Concurrent Tool Dispatch + Cancellation

> L3 Mechanism #1 | commit `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7`
> Method: 静态源码分析（无运行时验证）

## 1. Executive Summary

Codex 的 Agent 主循环由三段嵌套函数构成：`run_turn`（turn 级循环）→ `run_sampling_request`（带重试）→ `try_run_sampling_request`（事件流循环）。工具执行**并发**进行，通过一个 **RwLock 并行门**区分「可并发工具」与「必须串行工具」，取消采用 `CancellationToken` + `AbortOnDropHandle` + 分级取消。

这是 Codex 与绝大多数 Coding Agent 框架最显著的差异点：

1. **三层循环**：turn / sampling（重试）/ event-stream。
2. **并发工具执行**：`FuturesOrdered` + RwLock 门（read=并发，write=独占）。
3. **流式事件驱动**：模型响应是 `ResponseEvent` 流，边流边分派工具，不等整个响应结束。
4. **turn-scoped 模型会话**：`ModelClientSession` 缓存 WebSocket + sticky routing，跨重试复用。
5. **分级取消**：支持「立即 abort」与「等待 runtime 清理」两种取消语义。

## 2. 完整调用链

### 2.1 入口：从用户输入到 run_turn

```text
TUI 提交
→ CodexThread.submit()                        [codex_thread.rs:193]
→ start_or_steer_turn()                        [codex_thread.rs:265]
→ submit_turn_input_with_mode()                [codex_thread.rs:317]
→ io.submit_turn_input()                       → input_queue 入队
→ Session 任务调度
→ tasks/RegularTask::run()                     [tasks/regular.rs:39-91]
    ├─ 发送 TurnStarted 事件
    ├─ consume_startup_prewarm_for_regular_turn（预暖 client session）
    └─ loop { run_turn(...) }  ← 外层循环处理 pending input
```

**[F]** [tasks/regular.rs:76-90](../../sources/codex/codex-rs/core/src/tasks/regular.rs#L76-L90)：`RegularTask::run` 外层 `loop` 调 `run_turn`，每轮结束后若 `input_queue.has_pending_input` 则继续（处理运行中提交的新输入）。

### 2.2 run_turn 主循环

**[F]** [turn.rs:153-571](../../sources/codex/codex-rs/core/src/session/turn.rs#L153-L571) `run_turn()`：

```text
run_turn(sess, turn_context, input, prewarmed_client_session, cancellation_token)
├─ drain_async_hook_results(before_user_prompt=true)          [161]
├─ client_session = prewarmed.unwrap_or(new_session)          [163-164]
├─ run_pre_sampling_compact(...)                              [169]  // 抢占式压缩
├─ turn_user_input(input)                                     [192]
├─ required_mcp_servers_for_input(...)                        [193]  // MCP 依赖
├─ capture_step_context_with_required_mcp_servers(...)        [207]  // 首个 step
├─ record_context_updates_and_set_reference_context_item      [224]  // world state
├─ build_skills_and_plugins(...)                              [230]  // skill/plugin 注入
├─ run_hooks_and_record_inputs(PersistContext::TurnStart)     [246]
├─ record_conversation_items(injection_items)                 [258]
└─ loop {                                                    [281]
     ├─ pending_input = input_queue.get_pending_input()        [285]
     ├─ step_context = next_step_context.take() 或 capture     [314-336]
     ├─ record_step_world_state_if_changed()                   [345]
     ├─ sampling_request_input = clone_history().for_prompt()  [350]
     ├─ run_sampling_request(...)                              [363]
     ├─ needs_follow_up = model_needs_follow_up || has_pending_input [405]
     ├─ token_status = context_window_token_status()           [396]
     ├─ should_roll_over → run_auto_compact (MidTurn) → continue [452-479]
     ├─ !needs_follow_up → run_turn_stop_hooks()               [484]
     │    └─ should_stop → break                                [518]
     └─ continue                                               [533]
   }
```

### 2.3 run_sampling_request 重试循环

**[F]** [turn.rs:1325-1428](../../sources/codex/codex-rs/core/src/session/turn.rs#L1325-L1428)：

```text
run_sampling_request(sess, step_context, turn_store, turn_diff_tracker,
                     client_session, responses_metadata, input, cancellation_token)
├─ router = step_context.tool_router
├─ base_instructions = sess.get_base_instructions()
├─ tool_runtime = ToolCallRuntime::new(...)                     [1340]
├─ code_mode_service.start_turn_worker(...)                     [1345]
├─ loop {                                                       [1355]
│    ├─ prompt_input = initial_input 或 clone_history().for_prompt()
│    ├─ attach_pending_to_prompt(executed_tool_calls)           [1364]
│    ├─ prompt = build_prompt(prompt_input, router, ...)        [1370]
│    ├─ try_run_sampling_request(...)                           [1376]
│    │    ├─ Ok → return
│    │    ├─ ContextWindowExceeded → 记 full，return Err
│    │    ├─ UsageLimitReached → 更新 rate limits，return Err
│    │    └─ 其它 → 若 !is_retryable → return Err
│    └─ handle_retryable_response_stream_error(...)             [1416]
│         → 复用 client_session（sticky routing）重试
   }
```

**[F]** `build_prompt`（[turn.rs:1297](../../sources/codex/codex-rs/core/src/session/turn.rs#L1297)）是模型输入的最后组装点：拼接 `base_instructions` + 工具 spec + 历史。

### 2.4 try_run_sampling_request 事件流循环

**[F]** [turn.rs:2154-2745](../../sources/codex/codex-rs/core/src/session/turn.rs#L2154-L2745)：

```text
try_run_sampling_request(tool_runtime, sess, turn_context, turn_store,
                         client_session, responses_metadata, turn_diff_tracker,
                         prompt, cancellation_token)
├─ stream = client_session.stream(prompt, ...)                 [2184]
├─ in_flight: FuturesOrdered<BoxFuture<ResponseInputItem>>     [2198]
└─ loop {                                                       [2219]
     ├─ event = stream.next().or_cancel(cancellation_token)     [2235]
     ├─ match event:
     │    ├─ OutputItemDone(item):
     │    │    ├─ assign_missing_streamed_response_item_id
     │    │    ├─ handle_output_item_done(&mut ctx, item, ...)  [2353]
     │    │    │    → 返回 tool_future → in_flight.push_back()  [2360]
     │    │    │    → last_agent_message / needs_follow_up 更新
     │    │    └─ (mailbox 优先：commentary/reasoning 时若 pending mail → 提前 break)
     │    ├─ OutputItemAdded(item):                              [2375]
     │    │    ├─ CustomToolCall → create_diff_consumer          [2384]
     │    │    └─ handle_non_tool_response_item → agent message  [2391]
     │    ├─ OutputTextDelta(delta) → 流式渲染 agent message     [2554]
     │    ├─ ToolCallInputDelta → consume_diff                   [2586]
     │    ├─ ReasoningSummaryDelta/ReasoningContentDelta → 渲染
     │    ├─ Completed { response_id, token_usage, end_turn }:   [2508]
     │    │    ├─ record_token_usage_info
     │    │    ├─ end_turn == Some(false) → needs_follow_up = true [2546]
     │    │    └─ break Ok(SamplingRequestResult{...})
     │    └─ ...（RateLimits / ModelsEtag / SafetyBuffering 等）
   }
├─ drain_in_flight(&mut in_flight, ...)                        [2718]  ← 并发 await
├─ send_token_count_event
├─ if cancellation_token.is_cancelled() → TurnAborted          [2729]
└─ should_emit_turn_diff → send TurnDiffEvent                    [2733]
```

**[I]** 关键观察：工具 future 在 `OutputItemDone` 时**立即入队并开始执行**（`FuturesOrdered` 会尽快 poll），而 stream 继续消费后续事件——这实现了「边流边执行」。`Completed` 事件只在模型流结束时到达，此时所有工具 call 已入队，`drain_in_flight` 统一 await。

## 3. 并发工具调度：RwLock 并行门

**[F]** 核心在 [tools/parallel.rs:92-222](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L92-L222) `handle_tool_call_with_source`：

```text
handle_tool_call_with_source(self, call, source, cancellation_token)
├─ router.tool_supports_parallel(&call)          // 工具是否可并发
├─ router.tool_runtime(&call)                     // 工具 runtime
├─ router.tool_waits_for_runtime_cancellation(&call)
├─ dispatch_handle = AbortOnDropHandle::new(tokio::spawn(async {
│    ├─ tool_runtime.wait_until_ready(&session)   // 就绪等待
│    ├─ let _guard = if supports_parallel {
│    │      Either::Left(lock.read().await)       // 共享读锁 → 并发
│    │  } else {
│    │      Either::Right(lock.write().await)     // 独占写锁 → 串行
│    │  };
│    └─ router.dispatch_tool_call_with_terminal_outcome(...)
   }))
└─ tokio::select! {
     res = &mut dispatch_handle => ...            // 正常完成
     _ = cancellation_token.cancelled() => {     // 取消
        if terminal_outcome_reached || is_finished → await 取结果
        else if wait_for_runtime_cancellation → await runtime 清理 → aborted
        else → dispatch_handle.abort() → aborted
     }
   }
```

**[F]** 并行门语义（[parallel.rs:153-157](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L153-L157)）：

- **可并发工具**取 `read()` 锁 → 多个并发工具共享，同时执行。
- **不可并发工具**取 `write()` 锁 → 独占，排他于所有其它工具（含其它 write 与所有 read）。

**[I]** 这是一个 elegant 的调度抽象：工具通过 `supports_parallel_tool_calls` 声明自己的并发兼容性，调度器用一把 RwLock 天然表达「并发组」与「串行屏障」。比 OpenCode 的「全串行」和简单「全并发」都更精细。

**[F]** `tool_supports_parallel` 由 `ToolRouter` 委托 `ToolRegistry.supports_parallel_tool_calls`（[router.rs:137-141](../../sources/codex/codex-rs/core/src/tools/router.rs#L137-L141)）。

## 4. 取消路径（分级）

**[F]** 取消令牌 `CancellationToken`（`tokio_util`）从 `run_turn` 一路 `child_token()` 下传：

| 层级 | 取消点 | 行为 |
|---|---|---|
| 流消费 | [turn.rs:2235-2244](../../sources/codex/codex-rs/core/src/session/turn.rs#L2235-L2244) | `stream.next().or_cancel(...)` → `CodexErr::TurnAborted` |
| 工具 dispatch | [parallel.rs:180-219](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L180-L219) | `tokio::select!` 三分支 |
| 采样结束 | [turn.rs:2729-2731](../../sources/codex/codex-rs/core/src/session/turn.rs#L2729-L2731) | `cancellation_token.is_cancelled()` → `TurnAborted` |

**[F]** 工具取消的三种语义（[parallel.rs:182-217](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L182-L217)）：

1. **已完成**：`terminal_outcome_reached` 或 `dispatch_handle.is_finished()` → await 取回真实结果（不丢弃已完成工作）。
2. **等待 runtime 清理**：`wait_for_runtime_cancellation`（如持久 shell / unified_exec 进程）→ await runtime 完成进程 teardown，再返回 `aborted by user`。
3. **立即中止**：`dispatch_handle.abort()`（`AbortOnDropHandle` 语义）→ 返回 aborted。

**[F]** `wait_for_runtime_cancellation` 来自 `CoreToolRuntime::waits_for_runtime_cancellation()`（测试例 [parallel.rs:629-633](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L629-L633) 展示 `CancellationCleanupHandler` 返回 true）。

**[I]** 这是 Codex 取消模型最有价值之处：**区分「立即 kill」与「优雅清理」**，避免持久进程（shell）在取消时留下孤儿进程。

## 5. 失败 / 恢复路径

| 路径 | 处理 | 证据 |
|---|---|---|
| 模型流错误 | `is_retryable` → `handle_retryable_response_stream_error`（`stream_max_retries`） | [turn.rs:1412-1426](../../sources/codex/codex-rs/core/src/session/turn.rs#L1412-L1426) |
| ContextWindowExceeded | `set_total_tokens_full` → 触发压缩 | [turn.rs:1393-1396](../../sources/codex/codex-rs/core/src/session/turn.rs#L1393-L1396) |
| UsageLimitReached | `update_rate_limits` | [turn.rs:1397-1403](../../sources/codex/codex-rs/core/src/session/turn.rs#L1397-L1403) |
| 工具 Fatal | `CodexErr::Fatal` | [parallel.rs:84](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L84) |
| 工具非 Fatal 错误 | 转 `FunctionCallOutput`（`success:false`）回喂模型 | [parallel.rs:230-255](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L230-L255) |
| 工具 deny / 直接回答 | `FunctionCallError::RespondToModel` → 推入 transcript | [stream_events_utils.rs:362-382](../../sources/codex/codex-rs/core/src/stream_events_utils.rs#L362-L382) |

## 6. 状态写回

**[F]** 状态通过 `Session` 的多个「record」方法写回：`record_conversation_items` / `record_completed_response_item` / `record_step_world_state_if_changed` / `record_token_usage_info`。事件通过 `sess.send_event` / `emit_turn_item_started/completed` 推给 TUI。持久化由 `RolloutRecorder`（JSONL）+ `thread-store`（SQLite）承担（[rollout.rs](../../sources/codex/codex-rs/core/src/rollout.rs)）。

## 7. 与其它框架对比

| 维度 | Codex | OpenCode | Hermes Agent | Pi |
|---|---|---|---|---|
| 工具执行 | **并发**（RwLock 门） | 串行 | 串行 | 三策略（含并发） |
| 循环结构 | 三层（turn/sampling/event） | 三段式（processGeneration） | 单循环 | 状态机 |
| 取消 | CancellationToken + 分级（立即/优雅） | sync.Map + CancelFunc | — | — |
| 流式 | ResponseEvent 全事件流 | 10 种 event channel | — | Event Stream |
| 模型会话 | turn-scoped sticky session | 每 provider 实例 | — | — |

## 8. RoboThree 映射

| 机制 | 分类 | 理由 |
|---|---|---|
| Thread→Turn→Sampling→Tool 四层粒度 | **ADOPT** | 清晰的粒度分层是 RoboThree Runtime 的骨架 |
| 并发工具调度 RwLock 门 | **ADAPT** | 「工具声明并发兼容性 + RwLock 表达并发组」是通用模式，但需结合 RoboThree 的工具模型改造 |
| FuturesOrdered 边流边执行 | **ADAPT** | 减少模型等待；需处理「工具输出顺序回喂」的一致性问题 |
| 分级取消（立即/优雅清理） | **ADOPT** | 持久 shell/worker 必须优雅清理，避免孤儿进程 |
| turn-scoped sticky model session | **ADAPT** | 对长会话有价值，但引入连接复用复杂度 |
| 流式事件驱动 loop | **ADAPT** | Provider 事件流抽象通用；RoboThree 需定义自己的事件协议 |
| `build_prompt` 集中组装点 | **ADOPT** | 单一 prompt 组装点是 context 治理的关键边界 |

详细 ADOPT/ADAPT/DEFER/REJECT 汇总见 [robothree-fit-analysis.md](robothree-fit-analysis.md)。
