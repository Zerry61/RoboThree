# grok-build — 核心架构

> 维度: architecture
> Commit: `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce`
> 所有证据来源：源码静态分析 (SOURCE_CONFIRMED)

## 元信息

- 项目: grok-build
- 仓库: xai-org/grok-build
- 提交: `@98c3b24`
- 分析日期: 2026-07-18
- 维度: architecture
- 许可证: Apache 2.0（见 LICENSE-NOTES.md）

## 1. 结论摘要

- [F] grok-build 是 SpaceXAI 的全栈 Rust Coding Agent，覆盖 TUI → Agent 运行时 → LLM 调用 → 工具执行 → 文件工作区的完整链路
- [F] 共 **5 种运行模式**：TUI（无参数）、Headless（`-p`）、Stdio ACP（`agent stdio`）、Leader 常驻后台（`agent leader`）、WebSocket Server（`agent serve`）
- [F] `ChatStateActor` 运行在独立 tokio task 中，通过 `mpsc` 通道通信；其他核心组件使用 `RefCell` + `Mutex` 管理共享状态
- [F] 工具系统通过 `ToolBridge`（内包 `FinalizedToolset`）统一注册和分发，三套工具实现（grok_build / codex / opencode）通过独立 `ToolRegistryBuilder` 注册
- [F] 权限检查在 `prepare_tool_call()` 中，**先于工具执行**（H10 在 H13 之前）；通过 `self.permissions.request(access_kind)` → `Decision` enum
- [F] Leader 重连通过 `StdioReplayState` 缓存 initialize + session/load 请求，恢复 session 列表和客户端视图，**不恢复运行中的 tool call**
- [I] `xai-hunk-tracker` 使用独立的 actor 模式（`HunkTrackerHandle` + commands/events），但 `MvpAgent` 和 `SessionActor` 内部大量使用 `RefCell` + `Mutex`
- [I] 三套工具实现并存于 `implementations/` 目录，通过各自的注册函数加入 `ToolRegistryBuilder`；目前看起来同时可用而非按配置选择

## 2. 源码事实（[F]）

| 结论 | 源码位置 | Symbol | 为什么重要 |
| --- | --- | --- | --- |
| CLI 入口为 `main()` | `crates/codegen/xai-grok-pager-bin/src/main.rs` | `main()` | 1592 | 命令路由的单一入口 |
| 5 种模式通过 `AgentCmd` 枚举 + headless prompt 分支分发 | `main.rs` | `run_agent_command()` match `agent_args.mode` | 1294-1387, 1918-1987 | 运行模式完全列表 |
| `ToolBridge` 是真实类型，位于 `xai-grok-tools` | `crates/codegen/xai-grok-tools/src/bridge.rs` | `pub struct ToolBridge` | 60 | 工具执行的核心协调层 |
| ToolBridge 内包 `Arc<FinalizedToolset>`（来自 `ToolRegistryBuilder`） | `bridge.rs` | `ToolBridge { registry, terminal }` | 60-63 | 工具的注册与分发机制 |
| `ChatStateActor` 运行在独立 tokio task | `crates/codegen/xai-chat-state/src/actor/mod.rs` | `ChatStateActor::spawn()` → `tokio::spawn(actor.run())` | 54-93 | 对话状态隔离 |
| `ChatStateActor` 通过 `mpsc` 接收命令 | `actor/mod.rs` | `cmd_rx: mpsc::UnboundedReceiver<ChatStateCommand>` | 38 | Actor 通信模式 |
| Session 事件循环在 `run_session()` | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/run_loop.rs` | `pub(super) async fn run_session()` | 33 | Agent 核心事件循环 |
| Prompt 入口为 `handle_prompt()` | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs` | `pub(super) async fn handle_prompt()` | 210 | 用户输入的入口 |
| 工具调用入口为 `execute_tool_calls()` | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs` | `pub(super) async fn execute_tool_calls()` | 284 | 工具批量执行 |
| 工具预检在 `prepare_tool_call()`，含权限检查 | `tool_calls.rs` | `pub(crate) async fn prepare_tool_call()` | 742 | 工具执行前的 MCP/args/hooks/permission 检查 |
| 权限检查调用 `self.permissions.request(access_kind, ..)` | `tool_calls.rs` | `self.permissions.request(access_kind.clone(), tool_call_update, ..)` | 1076-1084 | 执行前权限拦截 |
| 权限决策通过 `Decision` enum 返回 | `crates/codegen/xai-grok-workspace/src/permission/types.rs` | `Decision` (Allow/Reject/Cancelled/FollowupMessage/Ask/PolicyDeny) | — | 权限结果类型 |
| 工具分发通过 `dispatch_tool()` → `WorkspaceOps::call_tool()` → `FinalizedToolset.call()` | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_dispatch.rs` + `crates/codegen/xai-grok-workspace/src/workspace_ops.rs` | `dispatch_tool()`:13, `WorkspaceOps::call_tool()`:1460 | 工具执行的最终路径 |
| Subagent 通过 `handle_subagent_request()` 创建隐藏 session | `crates/codegen/xai-grok-shell/src/agent/subagent/handle_request.rs` | `handle_subagent_request()` | — | Subagent 创建入口 |
| Subagent 支持 New/Forked/Resumed 三种 `InitialContextSource` | `crates/codegen/xai-grok-shell/src/agent/subagent/mod.rs` | `enum InitialContextSource { New, Forked, Resumed }` | 47-56 | Subagent 初始化方式 |
| Leader 重连回放通过 `replay_acp_state_after_reconnect()` | `crates/codegen/xai-grok-pager-bin/src/main.rs` | `async fn replay_acp_state_after_reconnect()` | 885-941 | Session 热恢复机制 |
| `StdioReplayState` 缓存 initialize + session/load 请求 | `main.rs` | `struct StdioReplayState` | 638-652 | 不恢复运行中的 tool |
| `xai-hunk-tracker` 使用 Actor 模式 | `crates/codegen/xai-hunk-tracker/src/actor/` | actor, commands, events 模块 | — | hunk 变更追踪隔离 |

## 3. 推断（[I]）

| 推断 | 依据 | 可证伪条件 |
| --- | --- | --- |
| grok-build 从 SpaceXAI monorepo 定期同步而来 | README: "synced periodically from the SpaceXAI monorepo" + SOURCE_REV 文件 | 若 monorepo 内部结构完全不同 |
| root Cargo.toml 是生成的，不可编辑 | README 明确声明 | 直接编辑 root Cargo.toml 无 error |
| 三套工具实现同时可用而非按配置选择 | `implementations/` 下三目录并存；`ToolRegistryBuilder` 上无明显的 feature flag 互斥 | 若实际运行时只有一套生效 |
| MvpAgent 内部大量使用 `RefCell` + `Mutex` 管理状态 | `acp_agent.rs` 和 `session_lifecycle.rs` 中 `self.sessions.borrow_mut()` 等调用模式 | 若重构为全 actor 模式 |
| Worktree 是工作区隔离（Git）而非安全沙箱 | `xai-fast-worktree/src/` 实现 git worktree + btrfs/overlayfs；`xai-grok-sandbox` 为独立 crate | 若 worktree 实现了 seccomp 限制 |

## 4. 设计取舍

### 4.1 对话状态：Actor 模式 vs 共享锁

- **取舍点**: 对话状态管理架构选择
- **上游选择了**: `ChatStateActor` 独立 tokio task + `mpsc` 通道；`MvpAgent` 和 `SessionActor` 用 `RefCell<HashMap<..>>` + `Mutex` 管理 sessions/handles
- **源码证据**: `ChatStateActor::spawn()` at `xai-chat-state/src/actor/mod.rs:54-93`；`MvpAgent.sessions: RefCell<HashMap<..>>` pattern at `session_lifecycle.rs`
- **优劣**: ChatState 隔离清晰、易推理；但整体并非"完全无锁"，多处使用 `RefCell::borrow_mut()` 和 `tokio::sync::Mutex`
- RoboThree 映射: **ADAPT** — 保留 ChatState 的 Actor 隔离，但整体消息类型定义应更简洁
- 风险: 若扩展为多线程并发访问，`RefCell` 会 panic（非 Send）

### 4.2 工具：三套范式并存 vs 统一 API

- **取舍点**: 工具实现组织方式
- **上游选择了**: `grok_build` / `codex` / `opencode` 三套实现并存，各自通过 `ToolRegistryBuilder` 注册
- **源码证据**: `crates/codegen/xai-grok-tools/src/implementations/` 下三个目录
- **优劣**: 兼容多生态；维护成本高、参数 key 存在差异
- RoboThree 映射: **DEFER** — 初期统一一套工具 API

### 4.3 Leader 模式 vs 纯单进程

- **取舍点**: 多客户端架构
- **上游选择了**: Leader 常驻后台 + 多客户端通过 Unix socket/WebSocket 共享
- **源码证据**: `run_leader()` → `connect_or_spawn()` → `LeaderReconnector`；`StdioReplayState` for crash recovery
- **优劣**: 支持 IDE/web/CLI 多入口、session 复用；增加进程管理和恢复复杂度
- RoboThree 映射: **DEFER** — MVP 阶段不需要；Leader 模式在 IDE 插件场景有价值但复杂度高

## 5. 权限系统（Permission）

权限系统在 `xai-grok-workspace/src/permission/` 中实现。

### Permission Check 调用位置

- [F] 在 `prepare_tool_call()` 中，先于工具执行
- [F] 调用 `self.permissions.request(access_kind, ..)` 进行权限决策
- [F] `AccessKind` 覆盖：`Read(p)`, `Edit(p)`, `Bash(cmd)`, `Grep{path, glob}`, `MCPTool{name, ..}`, `WebFetch(u)`, `WebSearch(q)`
- [F] 决策结果: `Decision::Allow` / `Reject` / `Cancelled` / `FollowupMessage` / `Ask` / `PolicyDeny`

### 权限模式

- [F] 三级：`yolo_state` / `auto_state` / 默认 `ask` — 实际由 `Arc<AtomicBool>` 实现于 `PermissionHandle::Actor` (manager.rs:82-85)
- [F] 权限管理器通过 `spawn_permission_manager_with_hub()` 创建（manager.rs:923）
- [F] 子 session 可继承父 session 的 `PermissionHandle`（spawn.rs:180, 218-224）

### 权限继承的精确边界（Level 3 深挖）

参考 [subagent-system.md](subagent-system.md) §2。关键事实：

- 父 → 子传递 `ctx.permission_handle.clone()`（handle_request.rs:1172）
- `Arc<UnboundedSender<PermissionCommand>>` 共享同一 actor task
- `yolo_state` / `auto_state` 通过 `Arc<AtomicBool>` 实时同步
- `deny_read_globs: Arc<Vec<String>>` 复制给子 session
- `permission_events_rx` 丢弃 — 子 session 看不到自己的权限事件流

**RoboThree 含义**: 默认应让每个 session 拥有独立 PermissionHandle（None mode），仅在显式配置下继承。

### Worktree 不是 Sandbox

- [F] `xai-fast-worktree` 提供 git worktree + btrfs/overlayfs 工作区隔离
- [F] `xai-grok-sandbox` 是独立 crate，负责进程级安全限制
- [F] Worktree 隔离文件系统命名空间；Sandbox 限制进程/网络/信号

## 6. 对 RoboThree 的建议（[R]）

1. **ADAPT ChatState Actor 模式** — 对话状态隔离有价值，但不需全盘照搬
2. **DEFER Leader 模式** — MVP 阶段不需要多客户端共享进程
3. **DEFER 多工具范式** — 从一套统一工具 API 起步
4. **ADAPT 权限分级模型** — AccessKind + Decision enum 的明确语义值得借鉴
5. **ADAPT Subagent 权限继承边界**（Level 3 升级）— 默认独立 PermissionHandle，仅显式 opt-in 继承
6. **ADAPT Tool 并发模型**（Level 3 升级）— `FuturesUnordered` + per-path `Mutex` 模式可借鉴，但 RoboThree 应使用 `JoinSet` + bounded mpsc

## 6.1 Sampler Retry / Fallback 逻辑（Level 3 Mechanism 2）

参考 [open-questions.md](open-questions.md) 中已回答项：

- **Retry Policy**: `RetryPolicy { max_retries: u32, rate_limit_retry_threshold: u32 }` (config.rs:181-187)
- **Default values**: `DEFAULT_MAX_RETRIES` + `RATE_LIMIT_RETRY_THRESHOLD` constants (config.rs:192-193)
- **Backoff**: 指数退避 + 20% jitter, base 2s, cap 30s (`retry_backoff_with_jitter`, retry.rs:486-513)
- **Retryable errors**: 429/500/502/503/504/520, EventStreamError, StreamError, EmptyResponse, DoomLoopDetected (error.rs:240-256)
- **Non-retryable**: Auth, InvalidConfiguration, Serialization, IdleTimeout, MaxTokensTruncation
- **Retry-After header**: parsed into `retry_after_secs`; respected when present (error.rs:99-100, 265)
- **Should-Retry header**: `x-should-retry` server hint; Some(false) skips retry (error.rs:101-105, 274)
- **Doom loop recovery**: separate mechanism via `DoomLoopRecoveryPolicy { max_threshold, max_retries }` (doom_loop.rs:54-87); default threshold 8, max_retries 2, clamped 0..=5

**RoboThree 含义**: retry/backoff/duration caps 是值得借鉴的实现细节。Doom-loop 检测是 server-side trigger，目前 RoboThree 不需要此机制。

## 7. 引用清单

- 仓库: https://github.com/xai-org/grok-build
- 分析 Commit: `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce`
- 许可证: Apache License 2.0
- 本地 clone: `/tmp/grok-build-clone/`

## 8. 未解答问题

- [ ] `xai-grok-sampler` 的 LLM 重试/fallback 完整逻辑
- [ ] `xai-grok-memory` 持久记忆存储实现细节
- [ ] MCP server 完整生命周期
- [ ] Subagent 的权限继承（与父 session `PermissionHandle` 共享的确切边界）
- [ ] Tool 执行并发控制的具体实现
