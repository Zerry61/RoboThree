# ADR-007：Event、Checkpoint、幂等与副作用一致性

> 状态：**ACCEPTED**  
> 提出日期：2026-07-19  
> 方案形成日期：2026-07-20  
> 接受日期：2026-07-20  
> 一致性修订：2026-07-22，Effect 前置 Gate 术语与 ADR-006 对齐  
> 适用阶段：KAF-2 Event、Persistence 与恢复

## 1. 背景

ADR-005 已经冻结 Task/Run/Step 的纯状态语义和单写入者原则，但 KAF-1 的状态只存在于内存。进程退出、机器重启或写入中断后，RoboThree 还不能回答：

- 一个 Command 是否已经应用；
- 一个 Action 是否已经发给 Worker；
- 外部副作用是否已经发生；
- 当前 TaskState 对应哪一段可信事件历史；
- UI/Audit 是否已经收到已提交事件；
- 重启后应该继续、重试、等待还是进入人工核对。

文件修改、外部 API、通知和 Artifact 生成不能靠“捕获异常后再试一次”保证正确。特别是“外部执行成功，但本地 Result 尚未持久化”这一崩溃窗口，若目标系统不支持幂等，自动重试可能重复产生真实副作用。

本 ADR 冻结 KAF-2 的持久化与恢复不变量，不提前实现 Tool、Worker、固定授权/用户确认或完整 Agent Loop。

## 2. 上游证据与采用方式

| 来源 | 固定 Commit | 借鉴 | RoboThree 调整 |
| --- | --- | --- | --- |
| OpenHands Software Agent SDK | `4fe565663af2b4f1130a6e0dac7566b002bfe9b4` | EventLog 追加写、稳定 Event ID、重复 ID 拒绝、持久事件到状态视图、FileStore 抽象 | 不采用“一事件一 JSON 文件”和事件树作为主存储；改为 SQLite 事务、Task 内单调 sequence 与版本化 JSON Contract |
| LangGraph | `49ae27c2ae983cfb92091b0dea9f7bc37a716479` | Checkpoint Port、checkpoint/parent 关系、pending writes 幂等、SQLite Saver、Conformance Suite | 不采用 Pregel、channel_versions、Python 任意对象序列化或 Graph namespace；改为 TaskRunState 快照、Command/Event 增量重放和 RoboThree Persistence Conformance |
| OpenClaw | `deccdb5e57af6800d4f020ea2034166592a149ba` | Node.js 本地 SQLite、启动 schema preflight、迁移、单写队列、事务提交后发布 | 不采用 Gateway 的 Session/Channel 数据模型和大型启动链；只借鉴数据库所有权、较新 schema 拒绝和事务边界 |

采用类型均为 `DESIGN_ONLY`。KAF-2 不复制上游 Python 或 TypeScript 实现；若后续发现可复用的小型工具函数，必须另建 `SELECTIVE_SOURCE` 登记并完成许可证审查。

## 3. 核心决策

### 3.1 不采用“只有 Event”的纯 Event Sourcing

RoboThree KAF-2 使用三层持久模型：

```text
Command Receipt       # Command 幂等与结果回放
       ↓
Task Event Log        # 追加式事实、顺序与审计
       ↓
Task Checkpoint       # 可快速恢复的 TaskRunState 快照
```

- ADR-005 的纯 reducer 仍是状态转换规则的唯一来源；
- Event 是已提交转换的持久事实，不允许任意业务模块直接追加伪造状态；
- Checkpoint 是可验证快照，不取代 Event；
- 恢复优先读取最新合法 Checkpoint，再重放其后的已接受 Command/Event；
- 当前 Task head 是索引和并发控制记录，不形成第二套状态机。

这样保留事件审计和增量重放能力，同时避免每次启动都从 Task 第一个 Event 全量计算。

### 3.2 SQLite 与 Adapter 边界

Kernel Alpha 本地实现采用应用目录中的单个 SQLite 数据库，由 Local Core 独占写入。首期使用 Node.js 24 的 `node:sqlite`，不增加原生数据库依赖。

固定依赖方向：

```text
Contracts ← Kernel ← Application Service ← Persistence Port ← SQLite Adapter
```

- Kernel reducer 不得 import `node:sqlite`、SQL、迁移或 Adapter；
- SQLite Adapter 负责连接、事务、迁移和数据编解码；
- InMemory Adapter 与 SQLite Adapter 必须运行同一套 Persistence Conformance Suite；
- KAF-2 不承诺多进程或多 Core 实例同时写同一数据库；
- 企业 Central Service 后续可以实现相同 Port，不改变 Kernel 状态语义。

SQLite 初始安全基线：

```text
PRAGMA journal_mode = WAL
PRAGMA foreign_keys = ON
PRAGMA busy_timeout = 5000
PRAGMA synchronous = FULL
```

性能参数只能在 KAF-4 通过基准与崩溃测试后调整，不能为了吞吐静默降低持久性。

### 3.3 Event Contract

KAF-2 定义版本化 `TaskEvent`，至少包含：

```text
schemaVersion
eventId
taskId
sequence
type
occurredAt
causationId      # 通常为 commandId 或 effectAttemptId
correlationId    # 默认 taskId，允许未来跨 Task 链路
runId? / stepId?
payload          # JSON-safe，禁止可执行值和 Secret
```

不变量：

1. `eventId` 全局唯一；
2. `sequence` 在单个 Task 内从 1 开始严格递增；
3. `(taskId, sequence)` 唯一；
4. Event 一经提交不可原地修改或删除；
5. Event payload 必须通过对应版本 Schema；
6. 大型内容、文件正文和 Artifact 二进制不进入 Event，只记录稳定引用；
7. 凭证、Token、Authorization Header、完整 Prompt Secret 不进入 Event。

KAF-2 最小事件类型：

- `runtime.command_applied`：保存可重放 Command 与 TaskTransition；
- `runtime.command_rejected`：可选审计投影，Canonical 结果仍在 Command Receipt；
- `runtime.effect_intent_recorded`；
- `runtime.effect_result_recorded`；
- `runtime.effect_uncertain`；
- `runtime.recovery_decision_recorded`。

事件类型采用命名空间字符串和 discriminated payload，不建立覆盖所有未来场景的巨大联合类型。

### 3.4 Command 幂等

`commandId` 是 KAF-2 的幂等键，不只是日志字段。

每个 Command 先计算并保存规范化 JSON 的 SHA-256 digest：

- 首次出现：按当前 state revision 执行；
- 相同 `commandId`、相同 digest：不再次执行 reducer，返回已保存的 accepted/rejected 结果；
- 相同 `commandId`、不同 digest：返回 `persistence.idempotency_conflict`；
- 已接受 Command 的 Receipt、Event、Checkpoint 和 Outbox 必须在同一事务提交；
- 被 reducer 拒绝的 Command 也保存 Receipt，使客户端重试得到相同错误，但不增加 Task state revision。

Receipt 不是任意结果缓存。它只保存重建响应所需的状态、revision、错误或引用，不能保存 Secret。

### 3.5 成功状态转换的事务边界

Task 初始化先把 ADR-005 的 revision `0` 状态原子写为 `task_heads + initial checkpoint`。初始 Checkpoint 的 `lastEventSequence = 0`；首个 accepted Command Event 从 sequence `1` 开始。相同 `taskId` 和相同 initialization digest 视为幂等创建，不同 digest 稳定冲突。

处理 Command 时，Application 在 per-Task mailbox 内先查 Receipt、读取已验证 snapshot，并用纯 reducer 计算候选结果。SQLite Adapter 的单个短写事务再完成冲突复核和持久提交：

```text
Before transaction
  1. 查询已有 Command Receipt
  2. 读取并验证当前 Task snapshot
  3. 调用纯 reducer 得到候选 next state + transition

BEGIN IMMEDIATE
  4. 重新校验 commandId/digest 与 expected state revision
  5. append runtime.command_applied Event
  6. 写入新的 Task Checkpoint
  7. 更新 Task head（revision / event sequence / checkpoint）
  8. 写入 Command Receipt
  9. 写入待发布 Outbox
COMMIT
```

任何一步失败都整体回滚。若 expected revision 冲突，候选结果作废并返回类型化冲突；KAF-2 不在同一次 dispatch 内隐式无限重试。数据库提交后才能更新进程内快照或向 UI/Audit 发布。

Reducer 拒绝的 Command 不改变 Task head、Event sequence 或 Checkpoint；只在独立短事务中幂等保存 rejected Receipt。是否生成审计投影由 Application 层决定，不能伪装成状态 Event。

### 3.6 Checkpoint

KAF-2 的 `TaskCheckpoint` 至少包含：

```text
checkpointId
taskId
stateRevision
lastEventSequence
parentCheckpointId?
contractVersion
stateJson
stateDigest
createdAt
```

决策：

- KAF-2 每个成功 Command 都生成完整 Checkpoint，先保证正确性和可验收性；
- Checkpoint 中的 `TaskRunState` 必须经过当前 Zod Schema 校验；
- `stateDigest` 用于发现损坏或非事务性外部修改，不用于加密；
- Checkpoint 必须引用准确的最后 Event sequence；
- 恢复不得信任无法解析、digest 不匹配或 revision/sequence 不连续的 Checkpoint；
- Checkpoint 压缩、稀疏快照和保留清理延后到有基准数据后决定。

### 3.7 Outbox 与发布语义

Task Event 和待发布 Outbox 在同一事务写入。Outbox Dispatcher 只处理已经提交的行。

- 发布保证为 **at-least-once**，不声称 exactly-once；
- 每个发布消息携带稳定 `eventId/outboxId`，消费者必须去重；
- 发布成功后记录 `publishedAt`；
- 进程在“发布成功、尚未标记成功”之间崩溃时允许重复发布；
- Dispatcher 不得修改 TaskState；
- KAF-2 先实现 Fake/InMemory Publisher 和确定性 drain，不接 Desktop WebSocket 或企业 Audit Service；
- retry/backoff、死信和慢消费者治理在 KAF-4 完善。

### 3.8 副作用 Intent 与 Effect Attempt

KAF-2 先冻结、测试副作用协议，不接入真实 Tool/Worker。每次具有外部副作用的 Action 使用稳定的：

```text
actionId
effectAttemptId
idempotencyKey
executorCapability
status
requestRef / resultRef
```

Effect Attempt 状态：

```text
prepared → dispatched → succeeded | failed | cancelled | uncertain
```

- `prepared` Intent 必须在调用 Worker 前提交；
- Effect 状态变更、对应 Event 与 Outbox 必须原子提交；
- Worker Result 转换为 `record_observation` 时，Effect 终态更新与 accepted Command 事务一起提交；
- 支持幂等键的 Worker/外部系统可以对同一 attempt 使用相同 key 安全重试；
- `dispatched` 后本地没有可信 Result 的 attempt，在重启时不能假定成功或失败；
- 若目标明确支持查询或幂等重试，Recovery Coordinator 可以执行相应恢复策略；
- 若目标不支持幂等或查询，必须标记 `uncertain`，并通过 ADR-005 的 `wait_step(external_dependency)` 让 Task/Run/Step 收敛到显式等待；
- 只有新的 Command 才能解除等待、记录人工核对结果或创建新的 attempt；
- 不允许把未知副作用当成普通失败自动重试。

#### 分发事实、标识与 Authorization/UserConfirmation 接入点澄清

KAF-3.3 在不改变上述状态图的前提下进一步冻结：

- `prepared` 表示已持久化执行 Intent，但尚未授权一次实际分发；
- `dispatched` 必须先于 Backend 调用持久化，只表示 Core 已持久化分发决定，不证明请求已经发送、被接收或被执行；
- `succeeded | failed | cancelled | uncertain` 是 Effect Attempt 终态；`uncertain` 对应的 Task/Run/Step 必须进入显式 reconciliation waiting，而不是随 Effect 一起假装完成；
- `failed` 只用于具有可信证据的确定性失败；请求发出后发生超时、进程退出、非法响应或结果提交前崩溃时，必须按 recovery mode 查询/幂等重试，无法确认则进入 `uncertain`；
- RoboThree 不承诺任意外部系统的 exactly-once，保证的是 durable intent、at-least-once dispatch、稳定幂等身份和 explicit uncertainty；
- `effectAttemptId` 在一个持久 Attempt 内稳定，`idempotencyKey` 在该 Attempt 的查询/恢复/重试中稳定；每次具体传输使用新的 `requestId`，只负责请求响应关联，不替代幂等身份；
- ADR-006 的固定授权和必要 Desktop 用户确认位于 `prepared` 之前；用户确认等待后必须重新计算 Authorization、Action/目标/数据范围和本地可用性，实际分发前仍须重新应用已加载 Grant 与 revoked/disabled/credential/health 收窄。MVP 不实现完整 Policy 引擎、企业运行时审批或中央实时撤销传输。

### 3.9 恢复流程

Core 启动顺序：

```text
Database preflight
→ Forward migrations
→ Validate latest Task heads/checkpoints
→ Replay accepted Commands after checkpoint
→ Reconcile pending Effect Attempts
→ Start Outbox Dispatcher
→ Core ready
```

恢复分类：

| 持久状态 | 恢复动作 |
| --- | --- |
| 终态 Task | 验证后加载，不重新执行 |
| waiting Task | 原样加载，等待显式 resume/command |
| running，且无未决副作用 | 恢复为可调度状态，不在数据库装载阶段直接执行 |
| `prepared` Effect | 尚未 dispatch，可由调度器安全提交一次 |
| `dispatched` 且 Executor 支持幂等/查询 | 使用相同 idempotencyKey 查询或重试 |
| `dispatched` 且无法确认 | 记录 uncertain，并转换为显式 reconciliation waiting |
| Checkpoint/Event 不连续或损坏 | Core health 为 unavailable；不猜测修复，不执行副作用 |

重放必须使用相同纯 reducer，并验证 replay 后 revision、transition 和 Event 声明一致。发现不一致时停止恢复并返回类型化持久化错误。

### 3.10 Migration 与 Schema Preflight

- 使用只增不减的整数 migration ID 和 `schema_migrations` 记录；
- Migration 按顺序、事务性执行，并可重复检查是否已应用；
- 数据库 schema 高于当前二进制支持版本时启动失败，禁止旧版本写入新数据库；
- schema 低于当前版本时先迁移，迁移失败则 Core 不进入 ready；
- 不使用应用启动时散落的 `CREATE TABLE IF NOT EXISTS` 代替 migration；
- KAF-2 新建数据库不承担旧产品数据导入；未来真实迁移必须先备份并提供失败恢复说明。

### 3.11 逻辑表边界

KAF-2 冻结职责，不在 ADR 中锁死全部 SQL 字段：

| 表 | 职责 | 关键唯一性 |
| --- | --- | --- |
| `schema_migrations` | 已应用 migration | `migration_id` |
| `task_heads` | Task 初始化 digest、当前 revision、sequence、checkpoint 和状态索引 | `task_id` |
| `task_events` | append-only Task Event | `event_id`、`(task_id, sequence)` |
| `task_checkpoints` | 版本化完整状态快照 | `checkpoint_id`、`(task_id, state_revision)` |
| `command_receipts` | Command 幂等与结果回放 | `command_id` |
| `effect_attempts` | Intent、幂等键、执行与 uncertain 状态 | `effect_attempt_id`、`idempotency_key` |
| `outbox` | 事务后事件发布 | `outbox_id`、`event_id + destination` |

物理索引、JSON/TEXT 选择和 prepared statement 由实现评审决定，但不得破坏本 ADR 的事务与唯一性不变量。

## 4. 并发与所有权

1. 每 Task mailbox 继续保证进程内 Command 顺序；
2. SQLite 写事务使用 expected revision 做乐观并发校验；
3. SQLite Adapter 内部只有一个受控写入口；
4. TaskState 只能由 Durable Task Runtime 在事务成功后更新；
5. Outbox、Recovery、UI 和 Worker 不得直接更新 `task_heads` 或 Checkpoint；
6. KAF-2 不支持两个 Local Core 同时拥有同一数据库；多实例租约和分布式锁属于企业服务阶段。

## 5. 数据、安全与保留

- 所有持久 payload 为 JSON-safe、显式版本并在读写两端校验；
- 不使用 Python pickle、任意 class serializer、JavaScript 函数或动态代码反序列化；
- Secret 只保存 Credential Reference，不保存明文值；
- Event/Checkpoint 中的敏感业务内容按最小必要原则保存；
- Artifact、大文件和流式 Token 不逐项写入 Checkpoint；
- KAF-2 不删除历史 Event/Checkpoint；Retention、压缩、导出和依法删除在形成产品策略后单独 ADR；
- SQLite 数据库只位于 RoboThree 应用目录，不因此获得用户业务目录访问权。

## 6. KAF-2 明确不做

- 完整 Event Sourcing 框架或 CQRS 平台；
- Pregel、Graph Builder、channel version 系统；
- 多数据库兼容和 Postgres Adapter；
- 多进程/多机器并发写；
- 真实 Tool、MCP、Worker 或外部 API 副作用；
- 自动解决无法确认的外部副作用；
- UI/Audit 网络推送、死信管理后台和复杂重试策略；
- Event 压缩、历史清理、Time Travel、Task Fork；
- Session Message、Knowledge、Artifact 正文和企业审计全量持久化。

## 7. 后果

正面后果：

- Command 重试不会重复应用状态转换；
- Task 的 Event、Checkpoint、Receipt 和 Outbox 具有清晰事务边界；
- 重启后可以确定恢复，不靠内存猜测；
- 不支持幂等的未知副作用不会被盲目重试；
- Persistence Adapter 可以通过统一 Conformance Suite 替换。

代价：

- 每个成功 Command 一个完整 Checkpoint，KAF-2 写放大较高；
- at-least-once 发布要求消费者去重；
- 不确定副作用可能暂停并要求人工核对；
- 单 SQLite 写入口不适合未来多实例部署，届时由 Central Service 实现相同 Port。

## 8. KAF-2 验收门槛

1. 同一 Command 重复提交只应用一次；相同 ID 不同内容稳定冲突；
2. Event sequence、state revision 和 Checkpoint 引用连续一致；
3. 任意事务注入失败不会留下半个 State/Event/Receipt/Outbox；
4. InMemory 与 SQLite Adapter 通过同一 Conformance Suite；
5. 重启从 Checkpoint 恢复后状态与崩溃前一致；
6. Checkpoint 后 Event 可以通过纯 reducer 增量重放；
7. Outbox 在提交后发布，重复发布可被稳定 ID 去重；
8. prepared/dispatched/uncertain Effect 在每个崩溃窗口都有确定恢复结果；
9. 损坏或较新 schema 失败关闭，不执行副作用；
10. 原 KAF-0/KAF-1 全部测试、边界检查和 smoke 保持通过。

## 9. 已接受的冻结项

用户已于 2026-07-20 接受以下七项：

1. 本地 KAF-2 使用 Node 24 `node:sqlite` 和单数据库、单 Core 写入者；
2. 采用 Command Receipt + append-only Event + Checkpoint，而不是纯 Event Sourcing；
3. accepted Command 的 Receipt/Event/Checkpoint/Task head/Outbox 单事务提交；
4. KAF-2 每个 accepted Command 都保存完整 Checkpoint；
5. `commandId + canonical digest` 作为 Command 幂等规则；
6. Outbox 使用 at-least-once，消费者按稳定 ID 去重；
7. 无法确认的外部副作用进入 `uncertain + waiting/reconciliation`，禁止盲目重试。

这七项从 `0.0.0-kaf.2.1` 起约束 KAF-2 生产代码；如需改变，必须建立替代 ADR，不能静默修改历史。
