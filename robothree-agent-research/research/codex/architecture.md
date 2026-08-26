# Architecture — Codex CLI (openai/codex)

> Commit `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7`。Method: 静态源码分析。

## 1. 架构总览

Codex CLI 是一个 **Rust workspace（~117 crates）** 组成的本地 Coding Agent。整体分四层：

```text
┌─────────────────────────────────────────────────────────────┐
│  UI 层        codex-rs/tui（终端 TUI）  codex-rs/app-server   │
│               codex-rs/cli（Clap 入口 + exec/mcp/app 子命令） │
├─────────────────────────────────────────────────────────────┤
│  Runtime 层   codex_core：                                   │
│               ThreadManager → CodexThread → Session → Turn   │
│               (run_turn / run_sampling_request / tool 调度)   │
├─────────────────────────────────────────────────────────────┤
│  能力层       tools/（registry/router/orchestrator/parallel） │
│               exec_policy + sandboxing（安全）                 │
│               ext/* + core-plugins + skills + mcp（扩展）      │
├─────────────────────────────────────────────────────────────┤
│  边界层       protocol（类型）  client（模型）  thread-store/  │
│               history/state（持久化） model-provider（Provider）│
└─────────────────────────────────────────────────────────────┘
```

## 2. 核心概念：Thread / Session / Turn / Step

**[F]** Codex 的运行时对象模型是四层嵌套（由 [codex-rs/core/src/lib.rs](../../sources/codex/codex-rs/core/src/lib.rs) 导出与模块声明确认）：

| 概念 | 类型 | 文件 | 生命周期 |
|---|---|---|---|
| **Thread**（线程/会话） | `CodexThread`、`ThreadManager` | [thread_manager.rs](../../sources/codex/codex-rs/core/src/thread_manager.rs)、[codex_thread.rs](../../sources/codex/codex-rs/core/src/codex_thread.rs) | 跨多轮，可持久化、fork、subagent |
| **Session** | `Session` | [session/session.rs](../../sources/codex/codex-rs/core/src/session/session.rs) | 一个 thread 内的运行时状态（历史、world state、input queue） |
| **Turn**（轮） | `run_turn` / `TurnContext` | [session/turn.rs](../../sources/codex/codex-rs/core/src/session/turn.rs)、[session/turn_context.rs](../../sources/codex/codex-rs/core/src/session/turn_context.rs) | 一次用户输入 → 模型 → 工具 → 终止的完整循环 |
| **Step**（步） | `StepContext` | [session/step_context.rs](../../sources/codex/codex-rs/core/src/session/step_context.rs) | 一次 sampling 请求的「请求视图」：context + advertised tools + tool calls 共享一个快照 |

**[I]** 这一分层是 Codex 与大多数「单文件 Agent」的根本差异：`Turn` 内部可能发生多次 `sampling request`（一次 sampling = 一次模型往返），而 `Step` 保证「同一次模型请求看到的工具列表与上下文一致」。RoboThree 应理解这一 `Thread → Turn → Sampling → Tool` 的粒度分层。

## 3. 主循环：Turn Loop

**[F]** 主循环位于 [session/turn.rs:153](../../sources/codex/codex-rs/core/src/session/turn.rs#L153) `run_turn()`。其文档注释（[turn.rs:139-152](../../sources/codex/codex-rs/core/src/session/turn.rs#L139-L152)）直接定义语义：

> 每次 sampling request，模型返回 function calls 或 assistant message。若请求 function call，则执行并把 output 发回下一轮；若只返回 assistant message，则记录并视为 turn 完成。

**Turn 的完整流程**（[turn.rs:160-568](../../sources/codex/codex-rs/core/src/session/turn.rs#L160-L568)）：

1. `drain_async_hook_results` — 回收上一轮的异步 hook 结果。
2. `run_pre_sampling_compact` — 预采样压缩（在上下文更新前抢占式压缩）。
3. `capture_step_context_with_required_mcp_servers` — 捕获首个 step（context + MCP）。
4. `record_context_updates_and_set_reference_context_item` — 记录 world state。
5. `build_skills_and_plugins` — 构建 skill/plugin 注入项。
6. **`loop`**（[turn.rs:281](../../sources/codex/codex-rs/core/src/session/turn.rs#L281)）：
   - 取 pending input（用户运行中提交的消息）。
   - `record_step_world_state_if_changed` — 记录 step world state 变化。
   - `clone_history().for_prompt()` — 构造模型输入。
   - `run_sampling_request` — 模型 + 工具执行（见 §4）。
   - 采样后：`context_window_token_status` 检查 token；`needs_follow_up` 判定。
   - 若 `should_roll_over` → `run_auto_compact`（mid-turn 压缩）→ continue。
   - 若 `!needs_follow_up` → `run_turn_stop_hooks` → break（turn 完成）。

**[F]** 终止判定（[turn.rs:482-531](../../sources/codex/codex-rs/core/src/session/turn.rs#L482-L531)）：`needs_follow_up = model_needs_follow_up || has_pending_input`。当模型返回 assistant message（非 tool call）且无 pending input 时，进入 stop-hook 流程；`stop_outcome.should_stop` 为真则 break。

## 4. 采样与工具执行

**[F]** 采样在 [session/turn.rs:1325](../../sources/codex/codex-rs/core/src/session/turn.rs#L1325) `run_sampling_request()`，内部有重试循环，包裹 [session/turn.rs:2154](../../sources/codex/codex-rs/core/src/session/turn.rs#L2154) `try_run_sampling_request()`：

- `client_session.stream(prompt, ...)` — 流式调用模型（[turn.rs:2184](../../sources/codex/codex-rs/core/src/session/turn.rs#L2184)），`ModelClientSession::stream` 定义于 [client.rs:1851](../../sources/codex/codex-rs/core/src/client.rs#L1851)。
- **事件驱动循环**（[turn.rs:2219-2702](../../sources/codex/codex-rs/core/src/session/turn.rs#L2219-L2702)）：消费 `ResponseEvent`，包括 `OutputItemAdded` / `OutputItemDone` / `OutputTextDelta` / `ToolCallInputDelta` / `Completed` / `ReasoningSummaryDelta` 等。
- `OutputItemDone` → `handle_output_item_done`（[stream_events_utils.rs:288](../../sources/codex/codex-rs/core/src/stream_events_utils.rs#L288)）→ 解析出 `ToolCall` → 生成 `tool_future` 放入 `in_flight: FuturesOrdered`。
- **流结束后** `drain_in_flight`（[turn.rs:2718](../../sources/codex/codex-rs/core/src/session/turn.rs#L2718)）并发 await 所有工具 future。

**[F]** 工具**并发执行**的关键机制（[tools/parallel.rs:92](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L92) `handle_tool_call_with_source`）：

- 每个工具调用 spawn 一个 `AbortOnDropHandle` 的 tokio task。
- **RW-lock 并行门**：`supports_parallel` 的工具取 `lock.read()`（共享，可并发）；不支持的取 `lock.write()`（独占，串行化，见 [parallel.rs:153-157](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L153-L157)）。
- **取消**：`tokio::select!` 在 dispatch 与 `cancellation_token.cancelled()` 之间（[parallel.rs:180-219](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L180-L219)）；`wait_for_runtime_cancellation` 的工具需等待 runtime 清理（如持久 shell 进程回收）。

详见 [agent-turn-concurrent-tool-l3.md](agent-turn-concurrent-tool-l3.md)。

## 5. 模型抽象

**[F]** [client.rs:254](../../sources/codex/codex-rs/core/src/client.rs#L254) `ModelClient` / [client.rs:274](../../sources/codex/codex-rs/core/src/client.rs#L274) `ModelClientSession` 是模型访问的入口。`ModelClientSession` 是 **turn-scoped**（[turn.rs:273-274](../../sources/codex/codex-rs/core/src/session/turn.rs#L273-L274) 注释明确：缓存 WebSocket + sticky routing，跨重试复用）。

**[I]** Provider 抽象在 `codex-rs/model-provider` crate；`ModelClient` 通过 Responses API 协议与 OpenAI 后端（及 ollama / lmstudio 本地 Provider）通信，事件统一为 `ResponseEvent`。这一「Provider 事件流」抽象与 OpenCode 的 provider channel 设计同构。

## 6. 权限与安全（主报告段落）

> Level 2 强制检查。详细深挖见 [sandbox-execpolicy-l3.md](sandbox-execpolicy-l3.md)。

**[F]** Codex 的安全模型是**三层**：

1. **执行前决策**：`exec_policy`（[exec_policy.rs](../../sources/codex/codex-rs/core/src/exec_policy.rs)）对命令做 allow/prompt/deny 决策，决策来源是 `AskForApproval` 策略 + `.rules` 文件 + 「危险命令 / 已知安全命令」启发式。
2. **沙箱隔离**：`sandboxing`（[sandboxing/src/manager.rs](../../sources/codex/codex-rs/sandboxing/src/manager.rs)）在 spawn 前 transform 进程，Linux 用 Landlock/Bubblewrap，macOS 用 Seatbelt，Windows 用 Restricted Token。
3. **运行时批准**：`tools/approvals.rs` + `tools/network_approval.rs` + `protocol/approvals.rs` 承载「沙箱内失败 → 提升权限 → 用户批准」的升级流（EscalationPermissions / ExecPolicyAmendment）。

**[F]** `AskForApproval` 枚举（[protocol.rs:906](../../sources/codex/codex-rs/protocol/src/protocol.rs#L906)）四模式：

- `UnlessTrusted`（"untrusted"）— 仅「已知安全只读命令」自动批准。
- `OnRequest`（默认）— 模型决定何时请求批准。
- `Granular(GranularApprovalConfig)` — 按 `sandbox_approval` / `rules` / `skill_approval` / `request_permissions` / `mcp_elicitations` 细粒度开关。
- `Never` — 从不询问，失败直接返回模型。

**[F]** `render_decision_for_unmatched_command`（[exec_policy.rs:726](../../sources/codex/codex-rs/core/src/exec_policy.rs#L726)）是无规则命中命令的决策核心，其 allow/prompt/forbid 决策矩阵是 Codex 安全模型最有价值的可借鉴设计（详见 L3）。

## 7. 扩展架构

**[F]** Codex 有**四条并行扩展机制**（详见 [extension-plugin-skills-mcp-l3.md](extension-plugin-skills-mcp-l3.md)）：

1. **进程内扩展**（`ext/extension-api`）：`ExtensionRegistry` + 12 种 Contributor trait（`ToolContributor` / `ContextContributor` / `McpServerContributor` / `TurnItemContributor` / `ToolLifecycleContributor` / `ApprovalReviewContributor` 等）。
2. **插件**（`core-plugins` + `plugin`）：manifest + marketplace（add/remove/upgrade）+ 远程 bundle。
3. **Skill**（`skills`）：SKILL.md 声明的能力，含 selection / invocation / mentions。
4. **MCP**：既是 Client（`codex-mcp` / `rmcp-client`）也是 Server（`mcp-server`，把 Codex 自身工具暴露为 MCP）。

## 8. 持久化

**[F]** 三层持久化：

1. **Thread 存储**：`codex-thread-store`（SQLite）。
2. **Rollout**：JSONL 追加式会话记录（[rollout.rs](../../sources/codex/codex-rs/core/src/rollout.rs)，导出 `RolloutRecorder` / `Cursor` / `SessionMeta`），支持 `resume_thread_from_rollout`。
3. **State DB**：`codex-state` / `state_db_bridge`（`StateDbHandle`）。

## 9. 与其它 Agent 的关键差异

| 维度 | Codex | 对比 |
|---|---|---|
| 语言/规模 | Rust，~117 crates | 远大于单文件 Agent（Hermes 5k+ 行单文件） |
| 工具执行 | **并发**（RW-lock 门 + FuturesOrdered） | OpenCode 串行；Pi 三策略 |
| 沙箱 | **真 OS 沙箱**（Seatbelt/Landlock/Bwrap/RestrictedToken） | 多数 Agent 无 OS 沙箱 |
| 扩展 | 4 机制（ext/plugin/skill/MCP） | 多数只有 1-2 种 |
| 模型 | Responses API 事件流 | Provider channel 抽象 |
| 取消 | CancellationToken + AbortOnDropHandle + 分级取消 | sync.Map + CancelFunc（OpenCode） |

## 10. 置信度

| 结论 | 置信度 | 依据 |
|---|---|---|
| Thread/Session/Turn/Step 分层 | HIGH | lib.rs + thread_manager.rs + turn.rs 交叉验证 |
| Turn 主循环 | HIGH | run_turn 完整阅读 |
| 并发工具调度（RW-lock 门） | HIGH | parallel.rs 完整阅读 + 测试 |
| 沙箱三层模型 | HIGH | sandboxing manager + exec_policy + protocol 交叉 |
| 扩展四机制 | HIGH | ext/ + core-plugins + skills + mcp 目录确认 |
| 运行时取消时机 | MEDIUM | 静态路径确认，未运行时验证 |
| Sandbox 实际隔离强度 | MEDIUM | 静态推断，未做进程/文件系统实测 |
