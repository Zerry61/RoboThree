# open-questions.md — 未解决问题

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 开放问题

### 1. [UNKNOWN] ACP 协议详情

**问题**：ACPAgent 通过什么协议与外部 Agent 进程通信？具体的消息格式是什么？

**为什么重要**：ACP Agent 是 OpenHands 的多 Agent 互操作核心。理解 ACP 协议有助于设计 RoboThree 的外部 Agent 集成接口。

**How to Close**：阅读 `acp_agent.py` 和 `acp_models.py` 的完整实现，追踪 ACP 子进程的启动和通信流程。

### 2. [UNKNOWN] EventLog 文件格式和性能

**问题**：EventLog 如何实现惰性加载 30k+ 事件的高效读写？文件格式是 JSONL 还是其他？

**为什么重要**：如果 RoboThree 采用 Event Sourcing，EventLog 的存储效率直接决定大规模会话的可扩展性。

**How to Close**：深入阅读 `event_store.py` 和 `events_list_base.py`，理解文件编码、分片、索引机制。

### 3. [UNKNOWN] DockerWorkspace 的完整安全配置

**问题**：DockerWorkspace 使用什么 Docker 运行参数？`--read-only`？`--cap-drop`？网络限制？

**为什么重要**：Sandbox 安全性是 RoboThree Cloud Worker 的核心需求。

**How to Close**：阅读 `docker/workspace.py` 和 `docker/dev_workspace.py` 了解容器配置。

### 4. [INFERENCE] Condensation 的质量和局限性

**问题**：`LLMSummarizingCondenser` 在压缩长对话时的信息保留率如何？是否会丢失关键上下文（如工具调用的精确参数）？

**为什么重要**：Condensation 的质量直接影响长时间 Agent 运行的成功率。

**How to Close**：运行 Level 3 专项深挖，或通过测试用例验证 condensation 后的 Agent 行为一致性。

### 5. [UNKNOWN] 生产环境的 Agent Server 扩展

**问题**：Agent Server 如何横向扩展？会话如何在多个实例间分布？是否有外部状态存储（如 Redis）支持？

**为什么重要**：RoboThree 的 Cloud Worker 需要支持水平扩展。

**How to Close**：检查 Agent Server 的部署文档和 Kubernetes 配置。`ConversationLease` 暗示了多实例支持，但需要验证外部状态存储。

### 6. [UNKNOWN] 工具超时的精确行为

**问题**：当工具超时时，是否会优雅地清理子进程？tmux 会话是否会泄漏？

**为什么重要**：资源泄漏是 Agent Runtime 的常见问题。

**How to Close**：阅读 `TerminalTool` 的超时处理逻辑和 tmux 会话清理机制。

### 7. [INFERENCE] Plugin 的运行时安全

**问题**：Plugin 代码是否在沙箱中运行？如果恶意 Plugin 包含 `__init__.py` 中的危险代码会怎样？

**为什么重要**：Plugin 系统是重要的攻击面。

**How to Close**：审查 Plugin 加载代码的进程隔离和安全策略。

### 8. [UNKNOWN] 多 Agent 对话的并发和协调

**问题**：当父 Agent 等待子 Agent 完成时，父 Agent 的 Loop 是否阻塞？`fork()` 后两个 Conversation 是否可并发运行？

**为什么重要**：影响 RoboThree 的多 Agent 并发模型。

**How to Close**：追踪 `DelegateTool` 的完整执行路径，理解父 Agent 在等待子 Agent 时的状态。

### 9. [INFERENCE] StuckDetector 的检测规则

**问题**：死循环检测使用了什么规则？是基于模式匹配还是基于统计？

**为什么重要**：StuckDetector 是防止 Agent 无限消耗资源的关键安全机制。

**How to Close**：阅读 `stuck_detector.py` 的检测逻辑和阈值配置。

### 10. [UNKNOWN] TypeScript/Web SDK 的完整性

**问题**：README 提到 TypeScript 和 REST API 客户端。TypeScript SDK 是否是对 Python SDK 的完整端口？还是只提供了部分功能？

**为什么重要**：影响 RoboThree 的多语言 SDK 策略。

**How to Close**：检查 GitHub 组织中是否有独立的 TypeScript SDK 仓库或客户端包。

---

## Level 3 深挖关闭的问题

### L3-1. [RESOLVED] Conversation 工厂路由机制 → 详见 mechanism-1

- **路由入口**：`Conversation.__new__()` 根据 `isinstance(workspace, RemoteWorkspace)` 自动选择 [conversation.py:122-235](openhands-sdk/openhands/sdk/conversation/conversation.py#L122-L235)
- **Workspace 抽象**：`BaseWorkspace` 5 方法 ABC（`execute_command`, `file_upload`, `file_download`, `git_changes`, `git_diff`）+ 可选 `pause`/`resume` [base.py:23-182](openhands-sdk/openhands/sdk/workspace/base.py#L23-L182)
- **流式协议**：Generator-based 把"启动 → 轮询"封装为单一 `execute_command` 方法 [remote_workspace_mixin.py:67-200](openhands-sdk/openhands/sdk/workspace/remote/remote_workspace_mixin.py#L67-L200)
- **WebSocket 重连**：致命 close code (4001, 4004) 不重试；其他错误指数退避 [remote_conversation.py:67-263](openhands-sdk/openhands/sdk/conversation/impl/remote_conversation.py#L67-L263)
- **延迟初始化**：warm-pool 场景必备，Server 启动时不加载 LLM 密钥 [api.py:216-231](openhands-agent-server/openhands/agent_server/api.py#L216-L231)

### L3-2. [RESOLVED] EventLog 性能与树形结构 → 详见 mechanism-2

- **内存索引**：EventLog 启动扫描构建 `_id_to_idx` 索引，事件内容惰性加载 [event_store.py:49-57](openhands-sdk/openhands/sdk/conversation/event_store.py#L49-L57)
- **30k+ 事件支持**：通过内存索引 + 内容 LRU 缓存实现 [event_store.py:52-54](openhands-sdk/openhands/sdk/conversation/event_store.py#L52-L54)
- **树形事件**：`_effective_parent_id()` 让旧版线性事件无需迁移即可升级为树形 [event_store.py:91-104](openhands-sdk/openhands/sdk/conversation/event_store.py#L91-L104)
- **增量 View**：`ConversationState.view` 通过 `_view_branch_leaf` 跟踪，仅在分支切换时 O(n) 重建 [state.py:336-381](openhands-sdk/openhands/sdk/conversation/state.py#L336-L381)
- **Fork 隔离**：`fork()` 通过 JSON 序列化往返复制事件，剥离运行时字段 [local_conversation.py:660-795](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L660-L795)

### L3-3. [RESOLVED] Tool 批处理资源安全 → 详见 mechanism-3

- **取消流程**：`CancellationToken` 是 `threading.Event` 而非 asyncio 原语（跨线程兼容）[cancellation.py:21-44](openhands-sdk/openhands/sdk/conversation/cancellation.py#L21-L44)
- **资源锁**：锁键 `<prefix>:<resource>`，排序获取防死锁 [resource_lock_manager.py:84-118](openhands-sdk/openhands/sdk/conversation/resource_lock_manager.py#L84-L118)
- **DeclaredResources 三态**：`declared=False` 默认互斥；`declared=True, keys=()` 完全无锁；`declared=True, keys=(...)` 精确锁 [tool.py:100-127](openhands-sdk/openhands/sdk/tool/tool.py#L100-L127)
- **ActionEvent 字段**：`tool_call`（原始 LLM 输出，含 security_risk）与 `action`（解析后，安全剥离）分离 [action.py:40-57](openhands-sdk/openhands/sdk/event/llm_convertible/action.py#L40-L57)
- **多 Action 合并**：共享 thought 只在第一个事件，避免重复 [base.py:173-193](openhands-sdk/openhands/sdk/event/base.py#L173-L193)

---

## Level 3 仍未解决的关键问题

### L3-OPEN-1. [UNKNOWN] RemoteWorkspace 在网络分区下的行为

**问题**：当 Agent Server 与客户端断网时，RemoteWorkspace 的 execute_command 行为是什么？会立即报错还是重试到超时？WebSocket 关闭后 RemoteConversation 如何同步最终状态？

**为什么重要**：RoboThree 的 Cloud Worker 必须设计网络分区下的明确恢复语义。

**How to Close**：阅读 `RemoteWorkspace._execute` 错误处理路径和 `RemoteConversation` 的关闭逻辑；可能需要实际注入网络故障测试。

### L3-OPEN-2. [UNKNOWN] fork() 在大会话上的性能

**问题**：`LocalConversation.fork()` 通过 JSON 序列化往返复制全部事件。对 30k+ 事件会话，复制成本多大？是否有增量 fork 优化？

**为什么重要**：RoboThree 的多 Agent 场景可能频繁 fork。

**How to Close**：在 benchmarks 中测试 fork() 的延迟；或者阅读 git log 中的 fork 实现历史看是否有优化记录。

### L3-OPEN-3. [UNKNOWN] ResourceLockManager 的公平性边界

**问题**：默认超时（30s 文件锁、300s 终端锁）是否合理？当大量工具争用同一文件时会发生什么？

**为什么重要**：RoboThree 的并发工具执行需要明确的资源调度策略。

**How to Close**：通过 stress test 验证；或者从代码反推 OpenHands 内部的最佳实践。

### L3-OPEN-4. [UNKNOWN] EventLog 文件锁与 SQLite/PostgreSQL 的对比

**问题**：文件后端 EventLog 在 RoboThree 规模下的性能上限是多少？是否应直接采用数据库？

**Why Important**：RoboThree 的 Event Sourcing 实现选择。

**How to Close**：运行 benchmarks 对比文件后端与数据库后端的读写吞吐；阅读 issue tracker 中的性能讨论。
