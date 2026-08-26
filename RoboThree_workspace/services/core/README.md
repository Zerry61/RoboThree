# Core

RoboThree Agent Runtime 与本地 API。

- `bootstrap`：启动、配置和依赖装配。
- `kernel`：不依赖 I/O 实现的运行时状态、生命周期和状态机。
- `ports`：Kernel 访问模型、存储、时钟、日志和执行能力的抽象边界。
- `adapters`：Port 的系统、第三方与测试实现。
- `agent`：Agent 主循环与编排。
- `sessions`：会话、消息和运行状态。
- `models`：模型适配与调用。
- `tools`：工具注册、权限判断与执行。
- `storage`：持久化实现。
- `api`：提供给客户端的接口。

## KAF-2.3 当前内容

- 位于 `kernel`、可按顺序启动、反向停止并在失败时回滚的 Core Lifecycle；
- 位于 `kernel`、聚合 Component Health 的 Core Runtime；
- Clock、ID、Logger、ModelProvider、Persistence Lifecycle Port；
- System 与 Fake Adapter；
- ModelProvider Conformance Test 骨架；
- 日志敏感字段脱敏；
- 基于 TypeScript AST、对 Contracts 与 Kernel 真实目录生效的自动依赖边界检查。
- 纯函数 Task 状态 reducer 与类型化非法转换；
- 每 Task 串行 Promise mailbox，保证单写入者；
- Retry 新 Run、显式 waiting/resume、Cancellation 与 Deadline 收敛；
- 不可变运行快照及确定性并发、迟到 Observation 回归测试。
- 语义化 TaskPersistence Port，不向 Kernel 暴露 SQL 或任意 CRUD；
- InMemoryTaskPersistence 与 Node 24 `node:sqlite` Adapter；
- forward-only Migration、WAL/foreign keys/busy timeout/synchronous 基线和较新/损坏 schema 失败关闭；
- revision 0 Task 幂等创建；Receipt/Event/Checkpoint/Task head/Outbox 原子提交；
- `commandId + digest` 幂等冲突、expected revision 与 event sequence 防覆盖；
- 两个 Adapter 共用 Persistence Conformance Suite，SQLite close/reopen 集成验证。
- Application 层 DurableTaskRuntime：per-Task mailbox、load/reduce/atomic commit 和 committed 后快照替换；
- accepted/rejected Command Receipt 历史结果回放及 same ID/different digest 冲突；
- Checkpoint latest/by-id/by-revision、Event tail 查询和确定性 replay fail-closed；
- 最小 OutboxDispatcher、EventPublisher Port 与 FakeEventPublisher，支持失败计数、重启续发和 at-least-once 交付；
- SQLite 关闭重开后的 DurableTaskRuntime 恢复，以及 Retry、Cancellation、Deadline 的 KAF-1 语义回归。
- EffectCoordinator 以 Intent-first 顺序提交 `prepared`、`dispatched` 和终态，稳定 idempotencyKey 的顺序/并发重试只形成一个 Effect；
- Effect 终态或 uncertain 与对应 `record_observation`、`cancel_task`、`wait_step` Command 在同一事务提交；
- TaskRecoveryCoordinator 对 prepared 安全 dispatch，对 dispatched 按幂等重试、查询后重试或人工核对策略恢复；
- 无法确认的外部结果收敛为 `uncertain + waiting/external_dependency`，不会盲目重试；
- FakeEffectExecutor、命名崩溃点和真实 SQLite close/reopen 覆盖 Result 丢失、事务失败与重启恢复。

KAF-2.3 只使用 Fake Effect Executor 验证协议和崩溃语义，尚未实现真实 Model Provider、Tool、MCP、Worker、后台调度、人工 Reconciliation UI 或完整 Agent Loop；这些能力不会绕过 Task Runtime 和 Persistence Port 直接修改状态。
