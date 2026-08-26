# grok-build → RoboThree Fit Analysis

> Commit: `98c3b24` | 映射日期: 2026-07-18

## 结论地图

| 机制 | 结论 | 理由摘要 |
| --- | --- | --- |
| Agent 运行时 (ChatState Actor) | **ADAPT** | Actor 隔离有价值，但 grok-build 内部并非全 Actor 化 |
| Agent 运行时 (Leader 模式) | **DEFER** | MVP 不需要多客户端共享 + 崩溃恢复 |
| Tool Runtime (ToolBridge + FinalizedToolset) | **ADAPT** | 统一注册 + Finalize + 资源注入的模式好，但三套工具范式是反面教材 |
| Tool Runtime (并发: FuturesUnordered + per-path Mutex) | **ADAPT** (Level 3) | per-path 锁 + 读并发模型清晰; RoboThree 改用 JoinSet |
| Tool Registry (ToolRegistryBuilder) | **ADAPT** | Builder → Finalized 模式值得借鉴 |
| Tool Permission (AccessKind + Decision) | **ADAPT** | 枚举化的权限类型 + 决策清晰，但 yolo/auto/ask 三级对 MVP 过重 |
| Subagent Runtime (隐藏 session fork/resume) | **ADAPT** (Level 3 升级) | 权限继承边界明确，RoboThree 默认独立 PermissionHandle |
| Subagent 权限继承 (Arc-shared PermissionHandle) | **ADAPT** (Level 3) | Arc<AtomicBool> 共享 yolo_state 是干净的设计 |
| Sampler Retry/Backoff | **ADAPT** (Level 3) | 指数退避 + 20% jitter + Retry-After 解析都值得借鉴 |
| Session 持久化 (JSONL + 搜索索引) | **ADAPT** | JSONL 简单实用，搜索索引是增值能力 |
| ACP 协议层 | **DEFER** | 自定义 JSON-RPC 协议 vs 标准化 MCP-Agent 协议的选择需要更多调研 |
| Sandbox (独立 crate) | **NEEDS_MORE_EVIDENCE** | 确认隔离级别后再决定 |
| Worktree (fast git worktree) | **DEFER** | btrfs/overlayfs 依赖 Linux 特定能力；MVP 可用简单临时目录 |

---

## RoboThree 模块映射

### Agent Runtime

| 属性 | 值 |
| --- | --- |
| 结论 | **ADAPT** |
| 上游机制 | `MvpAgent` 管理 sessions map (`RefCell<HashMap<..>>`) → `SessionActor` → `run_session()` 事件循环 |
| 源码证据 | `xai-grok-shell/src/agent/mvp_agent/`, `xai-grok-shell/src/session/acp_session_impl/run_loop.rs:33` |
| RoboThree 场景 | Coding Agent + Worker + Local Worker |
| 上游限制 | 内部使用 `RefCell`（非 Send），不适合跨线程共享；MvpAgent 非纯 Actor |
| 需调整 | 从头设计消息类型（SessionCommand/Event），避免 grok-build 的过度复杂 |
| 安全风险 | 无直接安全风险（纯架构模式） |
| MVP 是否需要 | **是** — Agent 运行时的核心事件循环 |

### Tool Runtime

| 属性 | 值 |
| --- | --- |
| 结论 | **ADAPT** |
| 上游机制 | `ToolRegistryBuilder` → `FinalizedToolset` → `ToolBridge` → `WorkspaceOps::call_tool()` |
| 源码证据 | `xai-grok-tools/src/bridge.rs:60`, `xai-grok-tools/src/registry/types.rs`, `xai-grok-workspace/src/workspace_ops.rs:1460` |
| RoboThree 场景 | Tool Runtime + Tool Registry |
| 上游限制 | 三套工具实现并存增加维护成本；`Arc<Mutex<Resources>>` 作为共享状态 |
| 需调整 | 统一工具 API；简化 `ToolContext` 依赖注入 |
| 安全风险 | 工具可执行 Shell/文件/网络，需独立的 permission gate |
| MVP 是否需要 | **是** — 核心能力 |

### Tool Permission

| 属性 | 值 |
| --- | --- |
| 结论 | **ADAPT** |
| 上游机制 | `AccessKind` 枚举（Read/Edit/Bash/Grep/MCPTool/WebFetch/WebSearch）→ `permissions.request()` → `Decision` |
| 源码证据 | `xai-grok-workspace/src/permission/types.rs` (AccessKind, Decision), `xai-grok-shell/src/session/acp_session_impl/tool_calls.rs:1000-1084` |
| RoboThree 场景 | Tool Permission + Channel Capabilities |
| 上游限制 | yolo/auto/ask 三级 + classifier-based 对 MVP 过重；权限管理器需要 UI prompter 回调 |
| 需调整 | MVP 阶段简化为 Allow/Deny 二元决策 + 路径白名单 |
| 安全风险 | 必须在执行前拦截（grok-build 正确做到了这点） |
| MVP 是否需要 | **是** — 但简化为二元决策 |

### Session Manager

| 属性 | 值 |
| --- | --- |
| 结论 | **ADAPT** |
| 上游机制 | SessionActor 封装 session 生命周期；JSONL 持久化；`SEARCH_INDEX_MANAGER` |
| 源码证据 | `xai-grok-shell/src/session/acp_session_impl/spawn.rs`, `xai-grok-shell/src/session/storage/` |
| RoboThree 场景 | Session Manager |
| 上游限制 | 与 ACP 协议深度耦合；session 恢复逻辑复杂 |
| 需调整 | 提取 session 生命周期为独立 trait；持久化可选 |
| 安全风险 | Session 文件中可能含敏感信息 |
| MVP 是否需要 | **是** — 基本 session 管理 |

### Subagent Runtime

| 属性 | 值 |
| --- | --- |
| 结论 | **NEEDS_MORE_EVIDENCE** |
| 上游机制 | `SubagentCoordinator` → 隐藏 session fork/resume；共享 hunk tracker + workspace |
| 源码证据 | `xai-grok-shell/src/agent/subagent/mod.rs:47-56` (InitialContextSource), `xai-grok-shell/src/agent/subagent/handle_request.rs` |
| RoboThree 场景 | Subagent Runtime + Worker Runtime |
| 上游限制 | 深挖不足：共享状态的确切边界、清理逻辑、中断传播未确认 |
| 需调整 | 待 Level 3 深挖后确定 |
| 安全风险 | 子 session 权限继承范围未确认 |
| MVP 是否需要 | **否** — 可在 post-MVP 再引入 |

### Workspace Manager

| 属性 | 值 |
| --- | --- |
| 结论 | **DEFER** |
| 上游机制 | `WorkspaceOps` 抽象 local/proxy 两种后端；worktree 用 btrfs/overlayfs |
| 源码证据 | `xai-grok-workspace/src/workspace_ops.rs:1460` |
| RoboThree 场景 | Workspace Manager |
| 上游限制 | 与 git worktree 深度绑定；btrfs/overlayfs 依赖 Linux |
| 需调整 | MVP 阶段用简单临时目录；post-MVP 再考虑 git worktree |
| 安全风险 | 文件系统访问需权限控制 |
| MVP 是否需要 | **否** — 简单文件系统即可 |

### Sandbox

| 属性 | 值 |
| --- | --- |
| 结论 | **NEEDS_MORE_EVIDENCE** |
| 上游机制 | `xai-grok-sandbox` 独立 crate，基于 seccomp/macOS sandbox-exec |
| 源码证据 | `xai-grok-sandbox/src/` — 未在本次深入 |
| RoboThree 场景 | Sandbox |
| 上游限制 | 确认平台支持范围、隔离级别后再决定 |
| 需调整 | 待 Level 3 深挖 |
| 安全风险 | Sandbox 实现缺陷可导致逃逸 |
| MVP 是否需要 | **否** — MVP 可用受限容器；Sandbox 是 post-MVP 安全加固项 |

### Observability

| 属性 | 值 |
| --- | --- |
| 结论 | **ADAPT** |
| 上游机制 | OpenTelemetry + Sentry + jemalloc profiling + crash handler |
| 源码证据 | `xai-grok-telemetry/`, `xai-crash-handler/`, `xai-grok-pager-bin/src/main.rs` (tracing init) |
| RoboThree 场景 | Observability |
| 上游限制 | Sentry SDK 和 OTel 配置较重 |
| 需调整 | MVP: structured logging (tracing) + basic metrics；post-MVP: OTel + Sentry |
| 安全风险 | 低 — telemetry 数据不应含敏感信息 |
| MVP 是否需要 | **部分** — 结构化日志即可 |

---

## Proposed RoboThree Changes

> 以下是基于本次研究提出的 RoboThree 候选变更。**未自动落地**。

1. **Agent Runtime 采用消息通道 + 独立 task 的 Actor 模式**（ADAPT ChatStateActor）
   - 影响: RoboThree Core / Agent Runtime 模块边界
2. **Tool Registry 采用 Builder → Finalized 两阶段模式**（ADAPT ToolRegistryBuilder）
   - 影响: Tool Registry 接口设计
3. **Permission 在工具执行前拦截**，使用显式 `AccessKind` 枚举（ADAPT）
   - 影响: Tool Permission / Channel Capabilities 模块
4. **Tool 并发模型**: per-path `Mutex` + 读工具无锁（Level 3 ADAPT）— 用 `JoinSet` 替代 `FuturesUnordered`
   - 影响: Tool Runtime 并发策略
5. **Subagent 权限继承**: 默认独立 `PermissionHandle`; 仅显式 `inherit_from_parent: true` 时共享 Arc<AtomicBool> yolo/auto state（Level 3 ADAPT）
   - 影响: Subagent Runtime 安全模型
6. **Sampler Retry**: `RetryPolicy { max_retries, rate_limit_retry_threshold }` + 指数退避 2s 基础 + 20% jitter + cap 30s + Retry-After 解析（Level 3 ADAPT）
   - 影响: Sampler 设计
7. **暂不引入 Leader 模式**（DEFER）
   - 影响: Gateway 模块 — MVP 阶段保持单进程
8. **暂不引入 git worktree 隔离**（DEFER）
   - 影响: Workspace Manager — MVP 使用简单工作目录

## Requires Human Approval

> 以下项需要用户拍板。默认状态: `PENDING_HUMAN_DECISION`。

1. **PENDING_HUMAN_DECISION** → **RESOLVED at Level 3**: Subagent Runtime 的 fork/resume + 权限继承机制 = ADAPT。详见 [subagent-system.md](subagent-system.md)。
2. **PENDING_HUMAN_DECISION**: ACP 协议 vs 标准化 MCP-Agent 协议的选择？当前 ACP 是 grok-build 自有协议。
3. **PENDING_HUMAN_DECISION**: Tool Permission 在 MVP 阶段是否需要 auto-mode（classifier-based），还是简化为 Allow/Deny 二元？
4. **PENDING_HUMAN_DECISION (Level 3 新增)**: Sampler retry 策略中 max_retries 默认值？Level 3 找到 `DEFAULT_MAX_RETRIES` 常量但需确认其值后写 MVP config。
