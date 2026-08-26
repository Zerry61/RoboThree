# RoboThree KAF-2 开发计划：Event、Persistence 与恢复

> 状态：**COMPLETED — KAF-2.3 INDEPENDENT QA PASS**  
> 日期：2026-07-20  
> 前置基线：`0.0.0-kaf.1.1` 独立 QA `PASS`、ADR-005 `ACCEPTED`  
> 编码门槛：[ADR-007](../adr/007-event-checkpoint-side-effect-consistency.md) 已于 2026-07-20 转为 `ACCEPTED`

## 1. 目标

KAF-2 把 KAF-1 的确定性内存 Task Runtime 变成可持久、可幂等提交、可重启恢复的本地 Runtime，同时保持纯 reducer 和 Adapter 边界不变。

完成后的最小闭环：

```text
TaskCommand
→ Per-Task mailbox
→ Pure reducer
→ Receipt + Event + Checkpoint + Task head + Outbox（SQLite 单事务）
→ committed snapshot
→ restart
→ load checkpoint + replay tail
→ same TaskRunState
```

KAF-2 验证通用运行时基础，不接真实模型、Tool、MCP、Worker、Desktop 或业务场景。

## 2. 架构原则

1. ADR-005 reducer 继续保持同步、无 I/O；
2. `DurableTaskRuntime` 负责编排，Persistence Port 负责原子提交，SQLite 只存在于 Adapter；
3. 持久化接口表达 Task 事务语义，不建设任意 CRUD Repository 大全；
4. Event、Checkpoint、Receipt、Outbox 和 Effect payload 均为版本化 JSON-safe Contract；
5. 数据库写成功前不更新内存 snapshot，不向外发布；
6. Command 与副作用分别使用稳定幂等键；
7. 任何未知副作用都进入 reconciliation，不根据进程内存猜测；
8. 每一批都保留 InMemory 实现和 SQLite 实现的统一 Conformance Test；
9. 不为未来分布式部署提前引入消息队列、Postgres 或分布式锁。

## 3. 上游借鉴

| RoboThree 能力 | 主参考 | 借鉴内容 | 不照搬内容 |
| --- | --- | --- | --- |
| Event Log | OpenHands | append-only、稳定 Event ID、重复拒绝、持久 Event 生成状态视图 | 一事件一文件、文件锁、Conversation 事件树 |
| Checkpoint Port | LangGraph | Saver 抽象、latest/by-id、parent、pending writes、Conformance Suite | Pregel、channel_versions、Python serializer、Graph namespace |
| SQLite | LangGraph + OpenClaw | WAL、事务、唯一键幂等、启动 schema preflight、迁移 | LangGraph 表结构原样复制、OpenClaw Gateway 数据模型 |
| 恢复 | LangGraph + OpenHands | checkpoint 后增量恢复、显式 interrupt/resume、事件视图重建 | 隐式 Graph 恢复、Conversation God Object |
| 发布 | RoboThree 事务 Outbox | Event 提交后再发布、稳定 ID 去重 | 声称 exactly-once、KAF-2 接入真实 UI/Audit |
| 副作用一致性 | RoboThree 基于上游状态/幂等机制适配 | Intent-first、稳定 idempotencyKey、uncertain reconciliation | 不支持幂等时自动重试 |

全部先按 `DESIGN_ONLY` 实现。固定 Commit 和目标文件在[上游借鉴登记表](./UPSTREAM-ADOPTION-REGISTER.md)维护。

## 4. 目标模块边界

只在代码实际开始时增量创建以下目录，不因本计划预建空模块：

```text
packages/contracts/src/persistence/
├── task-event.ts
├── task-checkpoint.ts
├── command-receipt.ts
├── effect-attempt.ts
└── outbox.ts

services/core/src/
├── application/
│   ├── durable-task-runtime.ts
│   ├── task-recovery-coordinator.ts
│   └── outbox-dispatcher.ts
├── ports/
│   ├── task-persistence.ts
│   └── event-publisher.ts
└── adapters/
    ├── memory/
    └── sqlite/
        ├── sqlite-persistence.ts
        ├── migrations/
        └── schema-preflight.ts

services/core/tests/
├── task-persistence.conformance.ts
├── durable-task-runtime.test.ts
├── sqlite-persistence.integration.test.ts
└── task-recovery.test.ts
```

`services/core/src/kernel/` 只保留领域状态与 reducer；不得因 SQLite 方便把事务或 SQL 放入 Kernel。

## 5. 开发批次

### 5.1 `0.0.0-kaf.2.1`：Persistence Contract 与 SQLite 基础

目标：先冻结存储边界和数据库生存能力，不接管 KAF-1 Runtime。

交付：

- `TaskEvent`、`TaskCheckpoint`、`CommandReceipt`、`EffectAttempt`、`OutboxRecord` Zod Contract；
- 规范 JSON 编码与 SHA-256 digest 规则；
- 语义化 `TaskPersistence` Port；
- InMemory Persistence Adapter；
- Node 24 `node:sqlite` Adapter；
- `schema_migrations` 与 KAF-2 初始 migration；
- WAL、foreign keys、busy timeout、synchronous preflight；
- 新 schema 创建、旧 schema migration、较新 schema 拒绝；
- InMemory/SQLite 共用的 Persistence Conformance Suite；
- 临时数据库 clean/reopen 测试。

首批 Port 应围绕以下原子能力设计：

```text
createTask(initialState, initializationDigest)
loadTask(taskId)
findCommandReceipt(commandId)
commitAcceptedCommand(expectedRevision, receipt, event, checkpoint, head, outbox)
commitRejectedCommand(receipt)
listRecoveryCandidates()
```

不建立 `saveAnything(table, json)` 或把数据库事务回调暴露给 Kernel。

退出门槛：

- 两个 Adapter 对相同输入产生相同可观察结果；
- revision 0 Task 初始化可幂等创建并在 reopen 后完整恢复；
- duplicate ID、sequence gap、revision conflict、digest mismatch 稳定拒绝；
- Migration 重复启动不重复执行，较新 schema 失败关闭；
- 关闭并重开 SQLite 后所有 Contract 往返一致；
- KAF-0/KAF-1 的 45 项测试全部回归。

明确不包含：DurableTaskRuntime、Command 自动幂等回放、Outbox dispatcher、Effect 恢复。

### 5.2 `0.0.0-kaf.2.2`：Durable Command Pipeline

目标：用 KAF-2 Persistence 接管 KAF-1 Command 提交，但不改变 reducer 语义。

交付：

- `DurableTaskRuntime`：per-Task mailbox + load/reduce/atomic commit；
- accepted/rejected Command Receipt 幂等；
- 相同 commandId/same digest 返回原结果；
- 相同 commandId/different digest 返回冲突；
- `runtime.command_applied` Event；
- 每 accepted Command 一个完整 Checkpoint；
- Task head expected revision 乐观并发校验；
- committed 后才替换内存 snapshot；
- 最小 Outbox drain + Fake EventPublisher；
- Checkpoint latest/by-id 加载和 tail replay；
- KAF-1 `InMemoryTaskRuntime` 保留用于纯状态测试。

退出门槛：

- 重复提交不会增加 state revision 或 event sequence；
- 任一持久写入点失败均不产生部分提交；
- Outbox 不会看到未提交 Event；
- 重启后 snapshot 与提交前最终状态完全相同；
- replay 结果与持久 Checkpoint digest/revision 一致；
- 原 KAF-1 并发、Retry、Cancellation、Deadline 行为不变。

明确不包含：真实 EventPublisher、Tool/Worker、Effect dispatch、自动后台恢复执行。

### 5.3 `0.0.0-kaf.2.3`：恢复与副作用崩溃语义

目标：用 Fake Effect Executor 验证副作用 Intent 和所有关键崩溃窗口。

交付：

- Effect Intent/Attempt 持久生命周期；
- `prepared/dispatched/succeeded/failed/cancelled/uncertain`；
- `TaskRecoveryCoordinator`；
- prepared 安全恢复；
- 支持幂等或查询的 dispatched attempt 使用同一 key 恢复；
- 无法确认的 dispatched attempt 转为 `uncertain`；
- uncertain 通过 reducer Command 收敛为 `waiting/external_dependency`；
- Outbox 重启续发和重复投递去重测试；
- 损坏 Checkpoint、sequence gap、digest mismatch、较新 Contract/schema 失败关闭；
- 崩溃点注入 Harness 和恢复矩阵。

崩溃注入至少覆盖：

| 崩溃点 | 期望恢复 |
| --- | --- |
| Intent 提交前 | 没有副作用记录，可重新规划 |
| Intent 已提交、dispatch 前 | `prepared`，允许安全 dispatch |
| dispatch 后、Result 前，可幂等 | 使用相同 key 查询/重试 |
| dispatch 后、Result 前，不可幂等 | `uncertain + waiting`，禁止自动重试 |
| Result/Event/Checkpoint 事务中 | 整体回滚，按 effect 状态恢复 |
| 事务已提交、Outbox 发布前 | 重启后继续发布 |
| 发布成功、publishedAt 前 | 允许重复，消费者按 ID 去重 |

退出门槛：ADR-007 十项验收门槛全部自动化覆盖，形成独立 QA 报告后才结束 KAF-2。

明确不包含：真实 Tool、文件修改、MCP、Worker IPC、Approval UX 和人工 Reconciliation 页面。

## 6. Contract 与数据演进规则

- 继续使用 `v1alpha1`，只有出现破坏性跨边界变化时才升级 Contract Version；
- 每类持久记录都保存自身 `schemaVersion`；
- migration 处理物理 schema，Contract upgrader 处理 JSON payload，二者不得混为一体；
- KAF-2 不实现任意旧版本自动升级器，但未知版本必须明确拒绝；
- Event 和 Checkpoint 写入前、读取后都进行 Schema 校验；
- 数据库内部时间、ID 和 digest 均由明确 Port/Adapter 生成或传入，不让 reducer 读取系统时钟或随机源。

## 7. 测试策略

### 7.1 Contract Tests

- JSON-safe 与 Secret-like 禁止字段；
- Event/Checkpoint/Receipt/Effect/Outbox discriminated schema；
- revision、sequence、causation 和状态一致性；
- 未知 schemaVersion 拒绝。

### 7.2 Persistence Conformance

同一套测试工厂运行 InMemory 与 SQLite：

- create/load/latest/list；
- accepted transaction atomicity；
- rejected receipt 不改变 state；
- command/event/checkpoint 唯一键；
- idempotent same input；
- conflict different input；
- optimistic revision conflict；
- close/reopen round trip。

### 7.3 Integration 与 Recovery

- 使用临时目录和真实 SQLite 文件；
- 每个测试独立数据库，不触碰用户应用数据；
- 在命名故障点注入异常，不 kill 用户进程；
- 恢复后比较完整 `TaskRunState`、revision、event sequence 和 effect 状态；
- 每批运行完整 KAF-0/KAF-1 回归及 Core smoke。

### 7.4 性能基线

KAF-2 记录而不提前优化：

- 单个 accepted Command 事务延迟；
- 1,000/10,000 Event 的 latest checkpoint 与 tail replay 时间；
- 批量 append/commit 吞吐；
- 数据库大小和 Checkpoint 写放大；
- Outbox backlog drain 时间。

KAF-4 再依据测量决定批处理、Checkpoint 间隔或 `synchronous` 调整。

## 8. 代码评审门槛

每个 KAF-2 批次必须回答：

1. 参考了哪个上游固定 Commit；
2. 借鉴了什么机制；
3. 哪些代码是 RoboThree 重写，是否复制过上游源码；
4. 数据库事务的原子边界是什么；
5. Command 和 Effect 的幂等键是什么；
6. 崩溃后哪个持久事实用于恢复；
7. 未知副作用为什么不会被盲目重试；
8. 哪个 Conformance/Recovery Test 证明上述结论。

没有固定证据、事务说明和故障测试的 Persistence 代码不得合入。

## 9. 风险与控制

| 风险 | 控制 |
| --- | --- |
| `node:sqlite` 同步调用阻塞事件循环 | 单写队列、短事务、prepared statements；KAF-4 基准后再决定 Worker 化 |
| 每 Command 完整 Checkpoint 写放大 | KAF-2 先保正确；记录基准，后续可安全调整间隔 |
| JSON Contract 演进 | schemaVersion + Zod 双向校验 + unknown version fail closed |
| Outbox 重复发布 | at-least-once 明示，稳定 ID，消费者去重 |
| 外部副作用未知 | uncertain + reconciliation waiting，不自动 retry |
| 数据库损坏或新旧版本不兼容 | digest、sequence、preflight、migration、unavailable health |
| 单数据库未来扩展受限 | Persistence Port 保持 Adapter 可替换；KAF-2 不提前分布式化 |

## 10. 周期与确认门槛

沿用总体计划，KAF-2 预计 **4～6 个工作日**：

- KAF-2.1：约 1.5～2 个工作日；
- KAF-2.2：约 1.5～2 个工作日；
- KAF-2.3：约 1～2 个工作日。

这是单一主开发流、ADR 及时确认、Node 24.13.0 本地环境可用的工程量估算，不表示后台连续运行满 8 小时的计时承诺。

用户已接受 ADR-007 第 9 节七项冻结项。KAF-2.1、KAF-2.2、KAF-2.3 均已通过独立 QA，KAF-2 于 2026-07-20 关闭。`ISSUE-P3-001` 作为不阻断的 SQLite/Vitest 并发测试稳定性风险保留，不改变生产 Adapter 的失败关闭安全基线。
