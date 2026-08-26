# RoboThree KAF-4 开发计划：固定授权、用户确认、并发、可靠性与性能

> 状态：**FROZEN — KAF-4.3 INDEPENDENT QA PASS；KAF-4 CLOSED**  
> 日期：2026-07-22  
> 冻结日期：2026-07-22  
> 前置基线：`0.0.0-kaf.3.3` 独立 QA `PASS`、KAF-3 已关闭  
> 编码门槛：[ADR-006](../adr/006-permission-policy-data-approval.md) 已于 2026-07-22 转为 `ACCEPTED`  
> 产品边界：[RoboThree MVP 功能范围与开发基线 v1.0](../product/ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md)

## 1. 目标

KAF-4 在不建设完整 Policy、企业运行时审批、真实 Model/MCP、通用 Worker 或 Desktop UI 的前提下，为现有 Task/Effect/Capability 框架补齐四类运行保障：

1. 固定用户权限、Workspace 边界、Tool 风险与可恢复的用户确认；
2. 系统级有界并发、排队、背压和取消传播；
3. 类型化重试、Outbox 退避和未知副作用保护；
4. 可复现的性能基准、流事件治理、优雅停止和长期内存稳定性。

完成后的最小闭环：

```text
validated Action + TaskCapabilityLock
→ deterministic AuthorizationEvaluator
→ allow | deny | waiting(user_confirmation)
→ durable confirmation + revalidation
→ bounded admission
→ Effect prepared
→ pre-dispatch recheck
→ Effect dispatched
→ ToolExecutionBackend
→ Observation + Event + Checkpoint + Outbox
→ retry/backpressure/recovery under explicit budgets
```

本阶段仍然是 Headless Framework 建设，不实现业务场景。

## 2. 冻结边界

1. Authorization 只使用版本化、规范化输入和固定规则，不读取自然语言 Policy；
2. 决策只有 `allow | deny | require_user_confirmation`；
3. `ToolRiskFacts` 由受信 Definition、平台最低规则和确定性 inspector 产生，Agent 不能降低风险；
4. 普通授权文件 read/create/modify 不逐次确认；
5. delete/bulk overwrite/protected resource/local execution 使用精确单 Action 确认；
6. 外部 Model/Tool/service 按 Task、真实目标和精确数据范围确认；
7. 用户确认不能覆盖权限缺失、Workspace 越界、非法 Contract 或 unavailable；
8. `approval` wait reason 改为 `user_confirmation`，并执行显式 Alpha Contract 演进；
9. 用户确认在 Effect `prepared` 之前；等待后和分发前重新检查；
10. 不改变 ADR-007 的 Effect 六状态、idempotencyKey、requestId 和 uncertain 语义；
11. 不改变 ADR-008 的精确 TaskCapabilityLock，不支持 fallback；
12. 并发和队列必须有界；容量耗尽返回类型化背压结果，不丢弃已经接受的工作；
13. 通用 Retry 不得覆盖 Tool Effect recovery mode，不能重试未知非幂等副作用；
14. Core/Kernel 不依赖 Electron、SQLite、Timer SDK、子进程或具体 Provider；
15. 每批均升级开发版本、追加 DEVELOPMENT-LOG，并在独立 QA `PASS` 后进入下一批。

突破上述边界前必须先修改 ADR，不得通过实现形成事实标准。

## 3. 上游借鉴

| RoboThree 模块 | 主参考 | 借鉴内容 | 明确不照搬 |
| --- | --- | --- | --- |
| Tool 前置授权 | grok-build | `AccessKind → Decision`、permission-before-dispatch | yolo/auto/classifier、多模式 PermissionManager、Rust 实现 |
| 执行安全决策 | OpenClaw | security/allowlist/confirmation 归一为纯 decision、失败关闭 | 多层 Tool Policy、Plugin 权限矩阵、任意 Shell allow-always |
| waiting/resume | LangGraph | Interrupt/Resume、持久等待、Conformance 思路 | Pregel、Graph Builder、Python serializer |
| Action/Observation | OpenHands | 类型化 Action/Observation、取消和 Local/Remote Tool 边界 | Conversation God Object、Python Runtime |
| Retry/Backoff | grok-build + OpenClaw | typed retryability、Retry-After、指数退避、jitter、AbortSignal | Provider fallback、无限重试、Doom-loop classifier |
| Event/Streaming | Open WebUI + OpenClaw | typed delta/status/completion、合并高频 delta、慢消费者隔离 | Renderer `eval`、localStorage Token、Channel 大矩阵 |
| Persistence/Recovery | LangGraph + OpenHands | checkpoint/replay、统一 Conformance、显式不确定性 | KAF-4 改写既有 ADR-007 事务模型 |

固定 Commit 和许可证见[上游借鉴登记表](./UPSTREAM-ADOPTION-REGISTER.md)。KAF-4 继续全部采用 `DESIGN_ONLY` TypeScript 重写；若编码中发现适合复用的小型源码，必须另建 `SELECTIVE_SOURCE` 条目并先完成许可证审查。

## 4. 模块和依赖边界

目录只在对应批次出现真实代码时增量建立：

```text
packages/contracts/src/
├── authorization/
│   ├── authorization-decision.ts
│   ├── tool-risk-facts.ts
│   ├── confirmation-scope.ts
│   └── user-confirmation.ts
└── runtime/
    └── task-state.ts                  # approval → user_confirmation

services/core/src/
├── application/
│   ├── authorization-evaluator.ts
│   ├── user-confirmation-coordinator.ts
│   ├── runtime-admission-controller.ts
│   └── retry-coordinator.ts
├── ports/
│   ├── authorization-config-provider.ts
│   ├── execution-admission.ts
│   └── retry-scheduler.ts
├── adapters/
│   ├── memory/
│   └── sqlite/
└── reliability/
    ├── retry-policy.ts
    ├── bounded-queue.ts
    └── bounded-event-stream.ts

services/core/tests/
├── authorization-evaluator.test.ts
├── user-confirmation.integration.test.ts
├── user-confirmation-recovery.test.ts
├── admission-controller.test.ts
├── retry-policy.test.ts
├── backpressure.integration.test.ts
└── performance/
```

依赖方向继续是：

```text
Contracts ← Kernel ← Application ← Ports ← Adapters/API/Desktop
```

- Kernel reducer 只理解 `waiting(user_confirmation)`，不求值权限、不读取配置；
- AuthorizationEvaluator 是纯决策组件，Application 负责装配 Snapshot、Grant、Lock、Risk 和已有 Confirmation；
- UserConfirmationCoordinator 负责持久请求、决定、重检和状态命令，不包含 Desktop UI；
- Worker/Backend 只接收已经通过 Gate 的请求，不自行询问用户或改变范围；
- Central Service 不参与运行时确认热路径。

## 5. Contract 与数据演进

### 5.1 Contract Version

`approval → user_confirmation` 是破坏性跨边界变化，KAF-4.1 将公共 Contract Version 从 `v1alpha1` 升级为 `v1alpha2`。不得只改枚举而保留旧版本号。

KAF-4.1 必须定义：

- `v1alpha1` 读取边界；
- waiting checkpoint 中 `approval` 到 `user_confirmation` 的确定 upgrader；
- 未知 Contract Version 失败关闭；
- upgraded state 重新经过 `v1alpha2` Zod Schema、digest 和状态不变量校验；
- InMemory 与 SQLite close/reopen 的相同行为。

没有发布用户数据时也要保留迁移测试，因为该机制将成为后续 Alpha Contract 演进模板。

### 5.2 最小 Authorization Contract

```text
AuthorizationDecision
├── allowed
├── denied { reasonCode, decisionDigest }
└── user_confirmation_required { request, decisionDigest }

ToolRiskFacts
├── facts[]
├── sourceRevision
└── factsDigest

UserConfirmationRequest
├── confirmationId / taskId / runId? / stepId? / actionId?
├── scope: single_action | task_external_scope
├── targetRef? / dataScopeDigest? / actionDigest?
├── capability/binding/descriptor revisions
├── displaySummary
└── requestedAt

UserConfirmationDecision
├── confirmationId
├── confirmed | rejected
├── decidedByUserId
└── decidedAt
```

所有对象必须 `.strict()`、JSON-safe、版本化且可计算 canonical digest。用户可读摘要不参与安全目标解析；安全判定只使用规范化引用和 digest。

### 5.3 Tool Definition 演进

Tool Definition 增加版本化风险声明或风险 inspector 引用。Registry revision、Definition revision 和 TaskCapabilityLock 按现有规则自然变化，不允许给旧 Definition 静默补默认低风险。

- 内置 Echo 明确声明无文件、无命令、无网络副作用；
- 未声明风险的 Tool 在 KAF-4.1 后不能通过受信注册；
- 企业配置只能增加风险事实；
- runtime inspector 输出必须与 Tool Definition 声明和已验证 Action 一致。

## 6. 开发批次

### 6.1 `0.0.0-kaf.4.1`：固定授权与持久用户确认

目标：在不接 Desktop UI 和真实业务 Tool 的情况下，证明任何需要确认的 Tool Action 都不能提前创建 Effect，并能跨重启恢复、确认、拒绝和重检。

交付：

- Contract Version `v1alpha2` 和 `approval → user_confirmation` 演进；
- `AuthorizationDecision`、`ToolRiskFacts`、两类 Confirmation Scope 和 Decision Contract；
- Tool Definition 风险声明、Registry/Lock revision 回归；
- 纯 `AuthorizationEvaluator`；
- 固定用户权限、Tool assignment、FileGrant/WorkspaceGrant 和 active local config revision 输入模型；
- `UserConfirmationCoordinator`；
- exact confirmed scope 复用和 exact rejected Action 防重复提示；
- InMemory/SQLite Confirmation persistence 与共用 Conformance；
- Confirmation Request/Decision、Authorization denied 和 invalidated-before-dispatch Event；
- waiting/resume、用户拒绝 typed `user_rejected` Observation；
- `ToolExecutionService` 在 EffectCoordinator 前接入 Authorization/Confirmation Gate；
- 确认后、`prepared` 前重检，以及 `dispatched` 前的本地 Grant/availability 重检；
- SQLite migration/preflight、close/reopen、故障注入和完整 KAF-0～KAF-3 回归；
- 上游实际采用登记、开发版本、DEVELOPMENT-LOG 和独立 QA 范围。

固定流程：

```text
execute request
→ resolve/lock
→ evaluate
→ allow: prepareAndDispatch
→ deny: typed denial, no Effect
→ confirmation required:
     persist request + Event + wait_step(user_confirmation)
     return waiting

confirm command
→ persist user decision
→ recompute action/target/data scope/authorization/availability
→ mismatch: new request or deny, no old confirmation reuse
→ exact match: resume_step → prepareAndDispatch

reject command
→ persist user decision
→ resume_step
→ record user_rejected Observation
→ no Effect / no Backend call
```

退出门槛：

1. ADR-006 第 7 节 15 项验收全部自动化覆盖；
2. 相同 evaluator 输入结果和 digest 完全一致；
3. routine file 操作无需确认，危险操作与外部范围严格要求正确 scope；
4. 用户确认、拒绝、重复命令和并发决定均幂等；
5. 确认等待期间 Action/目标/范围/revision 漂移不能使用旧决定；
6. 用户确认之前数据库中不存在 Effect Attempt；
7. 确认提交失败不 resume、不 prepare Effect；
8. SQLite 重启恢复后 waiting/confirmed/rejected 语义不变；
9. `v1alpha1` upgrader 或明确失败关闭路径通过测试；
10. Kernel 仍无 Authorization、Persistence、Adapter 或 Electron 依赖；
11. 独立 QA `PASS` 后才能进入 KAF-4.2。

明确不包含：Desktop 确认 UI、真实 File Tool、真实 Model、Central 权限 API、完整 Policy/DataClassification、企业审批、并发调度和 Retry。

### 6.2 `0.0.0-kaf.4.2`：有界并发、背压、取消与类型化重试

目标：让 Task/Tool/Outbox 在明确资源预算内运行，证明满载、取消、暂时性故障和慢消费者不会形成无界内存、静默丢失或未知副作用重试。

交付：

- Application 层 `RuntimeAdmissionController`，不进入 Kernel reducer；
- FIFO 有界 admission queue 和全局/资源类型并发预算；
- Alpha 初始默认：16 个 active Run、8 个 active Tool dispatch、256 个等待 admission；
- AdapterDescriptor 可以声明比系统更窄的本地并发上限；Process Echo 保持单飞行，不扩张为进程池；
- queue full、deadline expired、cancelled-before-admission 类型化结果；
- 排队 Task/Action 取消后立即移除，不占用 slot；
- slot 必须在 success/failure/cancel/timeout/throw 的 `finally` 路径释放；
- AbortSignal 继续贯穿 Runtime → Effect → Executor → Backend；
- 纯 `RetryPolicy` 与可注入 Clock/Random/Scheduler；
- Alpha 默认 Retry：最多 3 次实际尝试、指数退避 base 2s、20% jitter、cap 30s，并尊重可信 `Retry-After`；
- Retry 分类：rate-limit、明确 5xx、暂时网络/stream error 可重试；认证、非法 Contract、Authorization deny、user_rejected、deadline 和配置错误不可重试；
- Tool dispatched 后只遵守 ADR-007 recovery mode；未知或不可幂等副作用不能进入通用 Retry；
- OutboxDispatcher 有界 batch、attempt/backoff 和取消/停止语义，保持 at-least-once；
- 并发、队列、Retry attempt 和 backoff 形成结构化 Event/metrics，不记录 payload；
- 确定性 Fake Clock/Random 测试、压力受限集成测试和完整回归。

并发所有权：

```text
Task Runtime mailbox          # 每 Task 状态单写者，ADR-005
RuntimeAdmissionController    # 系统 active Run 与排队上限
ToolAdmission                 # Tool dispatch 上限
Adapter own limit             # Descriptor/Handle 更窄上限
SQLite writer                 # 继续短事务单写边界
```

退出门槛：

1. 所有队列和并发集合都有显式容量，代码中无无界 admission；
2. 16 个并发 Run 不串状态，超过上限按 FIFO 排队；
3. queue full 返回稳定错误，不静默 drop 或无限等待；
4. 取消排队工作不调用 Backend，取消 active 工作释放 slot；
5. 任意异常路径不泄漏 slot、Promise、Timer 或 Abort listener；
6. Retry-After、指数退避、jitter、cap 和 max attempts 在 Fake Clock 下确定可测；
7. 非 retryable 和 uncertain Tool 副作用没有第二次实际 dispatch；
8. Outbox publish→ack 失败仍可重发，backoff 不阻塞 Task mailbox；
9. KAF-4.1 Confirmation Gate 在并发/取消/Retry 下不被绕过；
10. 独立 QA `PASS` 后才能进入 KAF-4.3。

明确不包含：分布式调度、优先级队列、租户配额、Cron、Remote Worker Fleet、自动 Provider failover、通用进程池和商业 SLA。

### 6.3 `0.0.0-kaf.4.3`：性能基准、流事件治理与可靠性收口

目标：用可复现数据验证 KAF-0～KAF-4 框架的性能和长期稳定性，并为 Desktop/Central 并行开发提供稳定的事件与停止边界。

交付：

- 独立 performance/reliability Harness，记录硬件、OS、Node、pnpm、SQLite、数据规模和参数；
- 纯状态转换、admission、confirmation lookup、Registry resolve、SQLite commit、checkpoint tail replay、Outbox drain 和 Echo IPC 基准；
- 16 并发 Run、队列满载、取消风暴、Retry 风暴和慢消费者的有界测试；
- `BoundedEventStream`：typed delta/status/completion，允许合并高频非持久 delta，不允许丢失 confirmation/error/terminal/durable Event；
- 每 subscriber 独立有界缓冲，慢消费者不能阻塞 Task mailbox 或扩大 Core 内存；
- subscriber disconnect/cancel 清理；
- Outbox backlog 有界批处理与恢复 drain；
- Core graceful stop：停止接收新工作、取消/等待有时限的 active 工作、提交已完成事务、停止 dispatcher、反向关闭 Adapter；
- SQLite WAL/busy timeout/prepared statement/事务批处理基准；只有故障测试证明持久性不下降时才允许调整参数；
- 10,000 Event checkpoint + tail replay、长时间队列和重复 restart/recovery 测试；
- 性能报告、已知限制、回归阈值和 Claude Code 独立 QA 清单；
- KAF-4 全阶段关闭记录。

初始目标：

| 指标 | KAF-4.3 目标 |
| --- | --- |
| 纯 reducer 状态转换 | 不含 I/O，P95 < 10 ms |
| AuthorizationEvaluator | 纯内存输入，P95 < 5 ms |
| 取消传播到 Fake Backend | P95 < 100 ms |
| 并发 Run | 16 个 active Run 不串扰、无无界增长 |
| Registry 显式 ID resolve | O(1)，不扫描全部能力 |
| Checkpoint 恢复 | 有合法 Checkpoint 时只重放 tail |
| Event 持久化 | 基准机批量目标 500～1,000 events/s，未达标必须记录瓶颈，不静默降低 durability |
| 慢消费者 | 不阻塞 Task mailbox，关键事件不丢失 |
| 内存 | 满载稳定窗口内无随已完成 Task/取消请求线性泄漏 |

这些是 Kernel Alpha 工程基准，不是商业 SLA。任何阈值调整必须连同测试参数和原因记录，不能只为了让测试通过而放宽。

退出门槛：

1. 基准可重复运行并输出机器可读和人类可读结果；
2. 满载、慢消费者和取消风暴下队列/内存保持有界；
3. durable/terminal/confirmation Event 不因合并或背压丢失；
4. graceful stop 后无未关闭 Timer、subscriber、SQLite 事务或 ChildProcess；
5. SQLite 调优不破坏故障原子性、close/reopen 和 schema preflight；
6. KAF-0～KAF-4.2 全量回归、boundary、lint、typecheck 和 smoke 通过；
7. 独立 QA `PASS` 后关闭 KAF-4，进入 KAF-5 Headless Framework 验收。

明确不包含：Desktop WebSocket、真实 Central Event Bus、OpenTelemetry 全链路、生产告警平台、分布式压测和跨机器 SLA。

## 7. 测试策略

### 7.1 Contract Tests

- strict/JSON-safe/version/digest；
- Confirmation 两类 Scope 的必填字段和互斥字段；
- target/data/action revision 漂移；
- Secret-like 字段、正文、PID/Handle 和未知字段拒绝；
- `v1alpha1 → v1alpha2` upgrader 与未知版本失败关闭。

### 7.2 Pure Decision Tests

- 相同输入相同输出；
- deny precedence；
- risk floor 只能提高；
- routine/destructive/execution/external/unknown 矩阵；
- Workspace real path、operation grant 和 external-send 分离；
- exact action/scope matching。

### 7.3 Persistence/Recovery

- Confirmation request/decision 幂等；
- 同 ID 不同 digest 冲突；
- request + Event + waiting state 原子性；
- decision + Event + resume/Observation 原子性；
- SQLite close/reopen；
- waiting、confirmed、rejected 和 stale confirmation 恢复；
- Effect 尚未创建和已经 dispatched 的崩溃窗口回归。

### 7.4 Concurrency/Backpressure

- 小容量队列的边界值和 FIFO；
- 并发 acquire/release；
- queued/active cancellation；
- timeout while queued；
- failure/throw/abort 后 slot 回收；
- slow subscriber、disconnect 和关键 Event 保留。

### 7.5 Retry/Effect Safety

- retryable/non-retryable 分类；
- Retry-After、jitter、cap、max attempts；
- Abort/Deadline 优先于下一次 retry；
- user_rejected/authorization denied 不重试；
- idempotent/query/manual reconciliation 三种 Effect mode 不回归；
- 不可确认副作用保持 uncertain。

### 7.6 Performance/Long-Run

- warmup 和正式采样分离；
- 固定 seed；
- 记录 p50/p95/p99 和样本数；
- 不在普通单元测试里加入易抖动的过紧墙钟断言；
- CI 使用宽松回归护栏，正式报告使用隔离基准；
- 压力测试只使用临时数据库和 Fake/Echo，不触碰用户业务数据。

## 8. 架构与安全护栏

KAF-4 必须扩展自动边界检查：

1. Kernel 不得 import Authorization config、Confirmation persistence、SQLite、Timer、Electron 或 Adapter；
2. Contracts 不得包含函数、UI callback、Runtime Handle、PID、Secret 或第三方 SDK 类型；
3. AuthorizationEvaluator 不得 import ModelProvider、ToolExecutionBackend、Persistence 或网络 API；
4. Desktop/Main/API 不能直接修改 Confirmation/Task 数据库记录；
5. Worker/Backend 不能创建“已确认”结果或扩大 scope；
6. RetryCoordinator 不能直接重发未知 Tool Effect；
7. `Array.push`/unbounded channel 不能作为 admission 或 subscriber queue 的事实实现；
8. 模型输出不能直接触发 bypass/yolo/allow-always。

## 9. 开发记录与独立 QA

每一批必须：

1. 根包、Contracts、Core 开发版本进入对应 `0.0.0-kaf.4.x`；
2. KAF-4.1 同步升级公共 Contract Version 为 `v1alpha2`；
3. 在 DEVELOPMENT-LOG 记录目标、实现、上游、测试、缺口和 QA 建议；
4. 在 UPSTREAM-ADOPTION-REGISTER 增加实际 AR 记录；
5. 更新 CHANGELOG Unreleased 高层摘要；
6. 使用 Node 24.13.0、冻结 lockfile、clean、完整 `pnpm run check`；
7. Claude Code 第一轮独立 QA 不修改产品代码；
8. QA `PASS` 前不得把下一批标记为完成。

## 10. 风险与控制

| 风险 | 控制 |
| --- | --- |
| Authorization 演变为 Policy 平台 | 固定输入、三态输出、无 DSL/LLM/远程热路径 |
| Tool 风险声明被低报 | 平台最低规则、受信 inspector、unknown 失败关闭 |
| Confirmation 与企业 Approval 混淆 | Contract/UI/事件统一使用 `user_confirmation`，Admin 无运行时审批 |
| 确认后发生 TOCTOU | 等待后重算，Worker 执行时继续真实路径检查，分发前重检 |
| 并发抽象侵入纯 Kernel | admission 和 retry 位于 Application/reliability 层 |
| Retry 重复真实副作用 | Tool Effect 只遵守 ADR-007 recovery mode，uncertain 不盲重试 |
| queue full 导致静默丢任务 | typed backpressure，已接受工作不丢弃，所有容量显式 |
| 性能优化降低 SQLite durability | 先基准和故障测试，任何 PRAGMA 调整保留原子/重启验证 |
| 流事件合并误丢终态 | 只合并可重建 delta，terminal/error/confirmation/durable 永不丢弃 |
| 基准在 CI 中抖动 | 隔离正式基准与宽松回归护栏，记录完整环境 |

## 11. 非目标

- 完整 Policy、DataClassification、企业运行时审批和 Approver；
- Central Service、Admin Console、Desktop UI；
- Agent/Skill 发布审核；
- 真实 OpenAI-compatible/MaaS Model Adapter；
- 完整 MCP、Office、Browser、PDF 或 Local File Tool Pack；
- 通用 Worker/Sandbox、进程池、Remote Worker 和 Fleet；
- Subagent/Multi-Agent、Cron/Scheduled Task、Task Template；
- Provider 智能路由、自动 fallback、成本优化；
- 公开 Marketplace 和第三方代码热加载；
- 商业 SLA、分布式追踪和生产告警平台。

## 12. 周期与后续顺序

单一主开发流、边界不再变化、Node 24.13.0 环境可用时，KAF-4 预计 **6～9 个工作日**：

- KAF-4.1：约 2～3 个工作日；
- KAF-4.2：约 2～3 个工作日；
- KAF-4.3：约 2～3 个工作日。

工作日是工程量估算，不表示后台连续执行固定 8 小时，也不包含等待用户确认和独立 QA 的时间。

后续顺序已冻结为：

```text
KAF-4.1 → 独立 QA PASS
→ KAF-4.2 → 独立 QA PASS
→ KAF-4.3 → 独立 QA PASS，关闭 KAF-4
→ 接受已通过文档评审的 ADR-010
→ KAF-5.0 Context Contract 与 Persistence Spine
→ KAF-5.1～KAF-5.3 Headless Framework
→ KAF-5 独立 QA PASS 后并行：
     A. Desktop Client
     B. Central Service Gateway 基础
→ Gateway 基础稳定后建设精简 Admin Console
→ Core、Desktop、Central 基础稳定后接入 Agent/Skill 发布闭环
```

ADR-010 与 KAF-5 开发计划可以在 KAF-4 实施期间分别以 `PROPOSED` 和 `DRAFT` 状态接受 Claude Code 文档评审，但不得形成 KAF-4 的实现依赖，也不得在 KAF-4.3 独立 QA `PASS` 前转为 `ACCEPTED` 或进入 KAF-5.0 编码。

KAF-4.1 编码的唯一入口条件是：本计划、ADR-006、KN-016 和产品 MVP 基线保持一致。用户已于 2026-07-22 明确要求开始 KAF-4.1，开发版本进入 `0.0.0-kaf.4.1`，按本计划实施 Contract/Authorization/Confirmation、自测、开发记录和独立 QA。
