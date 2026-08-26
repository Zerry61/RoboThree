# grok-build — Open Questions

## 未解答问题

### 1. ~~Sampler 的重试/fallback 完整逻辑~~ (Level 3 部分回答)

**Partially resolved at Level 3**:

**已确认**:
- RetryPolicy 结构: `{ max_retries, rate_limit_retry_threshold }` (config.rs:181)
- Backoff: `retry_backoff_with_jitter()` 指数退避 2s 基础 + 20% jitter, 上限 30s (retry.rs:486-513)
- Retryable: 429/500/502/503/504/520, EventStreamError, StreamError, EmptyResponse, DoomLoopDetected (error.rs:240-256)
- Retry-After header 解析并遵守 (error.rs:265)
- DoomLoopRecoveryPolicy 独立机制, 默认 max_retries=2 (doom_loop.rs:87)

**仍 Unknown**:
- 模型切换的具体触发条件 (model_switch.rs 未深挖)
- 客户端是否在 retry 后才上报到 session vs 立刻上报

### 2. ~~Subagent 的权限继承边界~~ (Level 3 已回答)

**Resolved at Level 3**: 见 [subagent-system.md](subagent-system.md) §2.

- 子 session 通过 `ctx.permission_handle.clone()` 接收父 handle（handle_request.rs:1172）
- `PermissionHandle::Actor` 内 `cmd_tx: Arc<UnboundedSender>` 共享同一 actor
- `yolo_state` / `auto_state` 通过 `Arc<AtomicBool>` 实时跨 session 同步
- 结论: **ADAPT** for RoboThree, 默认独立 PermissionHandle

### 3. MCP Server 完整生命周期

- **问题**: MCP server 的 start/connect/health check/reconnect 完整流程
- **影响**: RoboThree 的 MCP Host 设计
- **How to Close**: 阅读 `xai-grok-shell/src/session/acp_session_impl/mcp.rs` 和 `xai-grok-mcp/src/`
- **优先级**: MEDIUM

### 4. `xai-grok-memory` 持久记忆实现

- **问题**: 跨会话记忆的存储格式、检索方式、命名空间隔离
- **影响**: RoboThree Memory Framework
- **How to Close**: 阅读 `xai-grok-memory/src/` 和 memory tool implementation
- **优先级**: LOW (MVP 非必需)

### 5. Tool 执行并发控制

- **问题**: `execute_tool_calls()` 中的文件锁机制——按 write path 串行化同一文件的操作，其余并发执行。确认该机制的完整实现和边界条件
- **影响**: RoboThree Tool Runtime 的并发策略
- **How to Close**: 阅读 `tool_calls.rs` 中 execute 阶段的 file_locks 构建逻辑
- **优先级**: MEDIUM

### 6. ChatState Compaction 的压缩质量

- **问题**: 长对话的 compaction 策略是否会丢失关键上下文
- **影响**: RoboThree Context System 设计
- **How to Close**: 阅读 `xai-chat-state/src/compaction_*.rs` 和 compaction 测试
- **优先级**: LOW

### 7. Leader 模式下多客户端并发同一 Session

- **问题**: 两个客户端同时向同一 session 发送 prompt 的行为
- **影响**: RoboThree Gateway + Session Manager
- **How to Close**: 追踪 `dispatch_locks` (per-session `Mutex`) 的使用和 SessionActor 的消息队列策略
- **优先级**: MEDIUM

### 8. `xai-codebase-graph` scope graph 算法

- **问题**: 代码索引的构建方式、增量更新、内存占用
- **影响**: RoboThree Workspace 的代码理解能力
- **How to Close**: 阅读 `xai-codebase-graph/src/scope_graph/` 和 language parsers
- **优先级**: LOW

### 9. Sandbox 隔离级别

- **问题**: 确认 seccomp/macOS sandbox-exec 的具体限制范围（文件系统、网络、进程）
- **影响**: RoboThree Sandbox 设计
- **How to Close**: 阅读 `xai-grok-sandbox/src/` 和相关测试
- **优先级**: MEDIUM

### 10. ACP 协议完整规范

- **问题**: ACP 协议是否有独立 spec 文档（未在 repo 中找到）
- **影响**: RoboThree 协议选型
- **How to Close**: 从 `xai-acp-lib/src/` 的类型定义反向推导协议规范
- **优先级**: LOW
