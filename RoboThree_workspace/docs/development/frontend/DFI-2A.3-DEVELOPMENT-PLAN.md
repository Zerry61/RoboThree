# DFI-2A.3 SubmitTurn 编排、恢复与 Readiness Cutover 详细实施方案

## 1. 文档状态

```text
阶段：DFI-2A.3 — Authorization-aware SubmitTurn Orchestration & Recovery
状态：INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED
日期：2026-08-18
上游：DFI-0、DFI-1A、DFI-1B、DFI-2A.1、DFI-2A.2 PASS/CLOSED
范围：Core SubmitTurn 编排、coordination 持久化版本兼容、authorization-aware Task bundle、
      legacy normalization、Receipt Projection、启动 materialization/readiness cutover、A1～A7 Harness
不包含：HTTP/Main/Preload/Renderer、三模式风险动作矩阵、Confirmation 复用、AuthorizationEvaluator
        行为改造、DFI-2B、DFI-3、DFI-4、Central、Document Worker、公共业务页面
```

Revision 1 已完成差异复核并由用户明确授权编码；实现、开发者门禁和独立 QA 均已完成，
用户已正式接受独立 QA，DFI-2A.3 与 DFI-2A 整体 `PASS/CLOSED`。DFI-2B 不自动解锁。

---

## 2. 阶段目标

DFI-2A.3 将前两批已经存在但尚未进入生产 SubmitTurn 的事实接到同一条可恢复编排链：

```text
v1alpha1 legacy request
或
v1alpha2 authorization-aware request
        ↓
严格版本解析与原始 request digest
        ↓
Runtime Selection + exact Authorization Selection
        ↓
durable accepted plan
        ↓
Conversation Message
        ↓
authorization-aware Task bundle 原子提交
        ↓
版本匹配的 Receipt + Delivery
        ↓
Agent Loop idempotent start
```

完成后必须满足：

1. v1alpha1 请求继续可用，诚实规范化为 `smart_confirm / legacy_default`；
2. v1alpha2 请求锁定用户明确选择的授权模式，不允许静默降级；
3. accepted coordination record 在任何副作用前冻结 exact Authorization Plan；
4. Task bundle 同一事务写入 Runtime Selection、Authorization Selection、Execution Selection identity；
5. 重启恢复只消费持久计划，不读取更新后的默认策略重新决策；
6. v1alpha1 public Receipt 形状零漂移，v1alpha2 Receipt 投影 resolved authorization 与组合 digest；
7. public readiness 前完成 legacy Task Authorization materialization；
8. A1～A7 崩溃窗口均可通过 SQLite close/reopen 与新进程恢复；
9. 本批不改变 Tool 风险判定和用户确认行为。

---

## 3. 已核实代码事实

### 3.1 已存在且直接复用

- `SubmitTurnCoordinator` 已具备 command/clientTurn 双键幂等、单 command mailbox、Message prepare/append、
  Runtime Selection 重建、Task bundle、Receipt/Delivery 原子完成与 Loop idempotent start；
- `SubmitTurnRecoveryCoordinator` 已按 bounded batch 扫描 `accepted / message_appended /
  task_committed / completed-without-loopStartedAt`；
- `SubmitTurnRecordV1Alpha2Schema` 已冻结 `authorizationPlan` 与 v1alpha2 selection request；
- `ReadableSubmitTurnRecordSchema` 已能读取 v1alpha1/v1alpha2 coordination record；
- `PersistedSubmitTurnReceiptV1Alpha2Schema`、`SubmitTurnReceiptV1Alpha2Schema` 已存在；
- `TaskAuthorizationSelectionService` 已支持 explicit/legacy 两类请求，生成
  `authorizationSelectionDigest` 与 `executionSelectionDigest`；
- `MVP_TASK_AUTHORIZATION_MODE_POLICY` 固定支持三模式，legacy default 为 `smart_confirm`；
- DFI-2A.2 已提供 `commitAuthorizationAwareSubmitTurnTaskBundle()`、两个生产 Adapter、migration 22
  与 `LegacyTaskAuthorizationSelectionMaterializer`；
- `submit_turn_records` 与 `submit_turn_receipts` 的 SQLite indexed columns 都是两个版本共有字段，
  `record_json/receipt_json` 可承载严格版本化 JSON；
- Desktop private runtime 当前在 Persistence start 后先执行一次 SubmitTurn recovery，再启动 HTTP Server
  并公开 ready。

### 3.2 当前缺口

| 缺口 | 当前风险 | DFI-2A.3 处置 |
| --- | --- | --- |
| Coordinator 只接受 v1alpha1 Command | v1alpha2 已有 Schema 但无生产 Core 入口 | 新增严格双版本入口与内部 normalized intent |
| coordination Port/Adapter 只解析 v1alpha1 | v1alpha2 record/receipt 无法持久或恢复 | Port + InMemory + SQLite 同批切换到 readable union |
| 新 Task 仍调用旧 bundle API | 新任务不会持久 Authorization Selection | 一次性切到 authorization-aware bundle |
| accepted record 未冻结授权计划 | 重启后可能依据新策略重算 | accepted 前解析并持久 exact plan |
| 历史 recoverable record 没有 authorizationPlan | 旧中间状态恢复缺少执行身份 | deterministic legacy record normalization CAS |
| Receipt 仅 v1alpha1 | v1alpha2 UI 无法展示 resolved mode/digest | 版本匹配的 Receipt builder/projection |
| materializer 未接 startup | migration 22 存在但 public ready 不保证覆盖 | Persistence start 后、recovery/server 前执行 |
| 现有 A1～A7 未覆盖授权事实 | 不能证明 crash recovery 不漂移 | 扩展 fault points + process/SQLite Harness |

---

## 4. 冻结设计决策

### 4.1 Transport Version、Coordination Version 与 Task Fact 分离

三者不得混为一个字段：

```text
transportContractVersion
= 用户提交/查询使用 v1alpha1 或 v1alpha2

coordinationSchemaVersion
= Core 内部 durable 编排记录的结构版本

TaskAuthorizationSelection.schemaVersion
= 授权事实自身 schema version，当前仍为 v1alpha1
```

规则：

- 新提交的 v1alpha1 和 v1alpha2 请求都生成 v1alpha2 coordination record；
- v1alpha1 请求在 record 中使用确定性的 legacy-normalized selection request，但 `requestDigest` 仍证明
  原始 v1alpha1 wire command；
- 历史 v1alpha1 coordination record 继续可读，不批量重写已终态历史；
- public Receipt 必须与 transport contract version 匹配；内部 schema version 不泄漏给旧客户端。

### 4.2 原始请求 Digest 不使用 Normalized Intent

```text
requestDigest = SHA-256(canonical exact parsed wire command)
```

禁止：

- 在移除 `authorizationPreference` 后计算 v1alpha2 request digest；
- 用 normalized legacy request 替代原始 v1alpha1 request digest；
- 让 v1alpha1 与 v1alpha2 因业务字段接近而共享同一 idempotency identity。

相同 `commandId/clientTurnId`：

- exact wire command 与 digest 相同 → replay；
- Contract Version、授权模式或其他任何请求事实不同 → typed idempotency conflict。

### 4.3 双版本入口统一为 Core-private Normalized Intent

Coordinator 保留现有 v1alpha1 `submit()` 行为并新增明确的 v1alpha2 入口；两者只在严格解析后进入
Core-private `NormalizedSubmitTurnIntent`：

```text
NormalizedSubmitTurnIntent
├── transportContractVersion
├── exactWireRequestDigest
├── command/client/session/user input
├── runtimeSelectionRequest（不含 authorizationPreference）
└── authorizationRequest
    ├── legacy
    └── explicit(preference)
```

该内部类型：

- 不进入公共 Contract；
- 不持久化用户正文副本；
- 不在 Renderer、HTTP 或 Main 中复制解析逻辑；
- 只负责编排输入规范化，不判断 Tool 风险。

### 4.4 accepted plan 必须先于 Message append 和 Task commit

新请求顺序冻结为：

```text
解析 exact wire command
→ Session/Conversation/Registry 校验
→ Runtime Selection prepare
→ 加载 exact fixed Policy snapshot
→ TaskAuthorizationSelectionService.resolve
→ 生成 executionSelectionDigest
→ prepare user Message（仍未 append）
→ prepareAccepted(v1alpha2 record with authorizationPlan)
→ 才允许 append Message
```

`authorizationPlan` 至少锁定：

- requested/resolved mode；
- policy revision；
- source；
- authorization selection digest；
- execution selection digest。

accepted 后恢复不得重新调用新 Policy 做模式选择，只允许校验当前持久计划与精确 Runtime Selection。

### 4.5 生产 Task bundle 一次性切换

DFI-2A.3 将 Coordinator 的生产提交从：

```text
commitSubmitTurnTaskBundle(...)
```

一次性切换为：

```text
commitAuthorizationAwareSubmitTurnTaskBundle({
  ...existingBundle,
  selection,
  executionIdentity,
})
```

硬约束：

- 不保留按运行条件选择旧/新 API 的长期双写分支；
- Port 与 InMemory/SQLite 已由 DFI-2A.2 完整交付，本批只消费；
- bundle commit 后必须重新读取并验证 Runtime/Authorization/Execution 三类事实；
- `bundleDigest` 继续证明既有 Task bundle，授权和组合 identity 使用各自 digest，不改写旧 digest 语义。

### 4.6 历史 v1alpha1 coordination record 的 normalization

历史终态记录不批量重写。仅当 recovery 扫描到状态为 `accepted / message_appended /
task_committed` 的 v1alpha1 record 时，执行一次 Core-private normalization CAS：

```text
v1alpha1 recoverable record
→ 使用固定 MVP Policy + record.createdAt
→ 构造 legacy_default authorization plan
→ CAS 写为同 status 的 v1alpha2 record
→ 再进入正常 progress
```

规则：

- `accepted/message_appended` 尚无 Task Authorization row 时，按 record 锁定的 Runtime Selection
  重建结果确定性生成；
- `task_committed` 已有 Runtime Selection 时，优先读取并校验 DFI-2A.2 materialized Authorization
  row，不另造第二份事实；
- `completed-without-loop-start` 不改写 coordination record；恢复时校验已 materialized 的
  Authorization row，并沿用既有 v1alpha1 Receipt 与 idempotent Loop start；
- normalization 必须逐字段保留以下既有事实，除 `schemaVersion` 与新增授权字段外不得改写：

  ```text
  submitTurnCommandId
  clientTurnId
  desktopSessionId
  internalSessionId
  requestDigest
  selectionRequest 中既有 Agent/Model/Skill/Knowledge/Workspace 请求
  lockedAgent.agentDefinitionId / revision / digest
  registryRevision
  platformPromptRevision
  enterpriseConfigRevision（若存在）
  plannedSelectionDigest
  capabilityLockIds（顺序与内容均保持）
  internalUserMessageId
  internalTaskId
  internalRuntimeSelectionId
  initialCheckpointId
  status
  createdAt
  updatedAt
  lastFailure（若存在）
  loopStartedAt（若存在）
  ```

- v1alpha1 `selectionRequest` 只允许 additive 地补入
  `authorizationPreference = smart_confirm / legacy_default`，不得重新选择 Agent、Model、Skill、
  Knowledge 或 Workspace；
- normalization 不改变原始 `requestDigest`；
- CAS 同内容 replay，不同 plan/digest conflict；
- corrupt 或无法精确重建时 fail-closed，不创建 Task、不启动 Loop。

该 normalization 不是公共 migration，不新增 SQLite migration 23。

### 4.7 Receipt 与 Query Projection

```text
v1alpha1 transport
→ Persisted v1alpha1 Receipt
→ public v1alpha1 Receipt（形状完全不变）

v1alpha2 transport
→ Persisted v1alpha2 Receipt
→ public v1alpha2 Receipt
   ├── resolvedAuthorization
   └── executionSelectionDigest
```

规则：

- Receipt 必须从已经持久化的 authorization-aware bundle 构建，不从当前 Policy 推断；
- v1alpha2 `runtimeSelectionSummary.digest` 仍是既有 Runtime Selection digest；
- `executionSelectionDigest` 单独投影，不冒充 Runtime Selection digest；
- v1alpha1 查询不会收到 v1alpha2 extra fields；
- Core facade 可以新增 v1alpha2 submit/query 高层方法，但 HTTP/Main/Preload/Renderer 接入留给 DFI-2B。

### 4.8 Readiness Cutover

Desktop private runtime 启动顺序冻结为：

```text
1. start Conversation/Foundation/Task/Coordination Persistence
2. load exact fixed Authorization Policy snapshot
3. LegacyTaskAuthorizationSelectionMaterializer.materialize()
4. 验证 materialization 结果与 coverage digest
5. SubmitTurnRecoveryCoordinator.recoverOnce()
6. start bounded background recovery
7. start private HTTP server
8. runtimeStatus = ready / 发出 desktop.core.ready
```

失败语义：

- policy invalid、materialization conflict、coverage drift、corrupt row → Core startup fail-closed；
- 不在 public ready 后后台静默补齐缺失 Authorization row；
- 普通 SubmitTurn 的可重试 registry/external dependency failure仍沿用既有 recovery 语义，不借本批扩大
  为“所有 recoverable 必须清零才 ready”；
- Server 启动前没有新的用户 SubmitTurn，因此 materialization 不与正常写入竞争。

### 4.9 三模式行为本批不生效

DFI-2A.3 只完成“选择、锁定、持久化、恢复和投影”，不修改：

- `AuthorizationEvaluator` 风险矩阵；
- Tool Action 的 allow/deny/confirmation 决策；
- Confirmation scope、确认复用或 task-scoped allowlist；
- UI 的模式说明和交互。

因此不得宣称 `manual_review / smart_confirm / task_scoped` 已改变 Tool 行为。DFI-2B 必须单独方案
说明如何消费持久选择并映射风险动作。

### 4.10 不新增 migration 23

DFI-2A.3 不需要新表：

- migration 22 已保存 Task Authorization facts；
- coordination 表的 common indexed columns 可承载两版 record/receipt JSON；
- Adapter 改为严格 union parse，并逐字段校验共有 indexed columns；
- migrations 1～22 不改写。

若编码发现必须改变表结构，立即停止并回到文档评审，禁止静默新增 migration 23。

---

## 5. Core 内部接口调整

### 5.1 SubmitTurnPersistence 同批版本化

Port、InMemory 与 SQLite 必须同一批完成：

```text
SubmitTurnRecord
→ ReadableSubmitTurnRecord

PersistedSubmitTurnReceipt
→ PersistedSubmitTurnReceipt | PersistedSubmitTurnReceiptV1Alpha2
```

允许新增的最小内部能力：

```text
normalizeLegacyRecoverableRecord(expected v1alpha1, replacement v1alpha2)
```

要求：

- exact CAS；
- 同一 replacement replay；
- 不同 replacement conflict；
- InMemory/SQLite 同一 Conformance；
- 不留 Port 半切换；
- indexed columns 与 JSON 共识字段逐字段一致。

### 5.2 SubmitTurnCoordinator

计划新增或收敛：

```text
submit(v1alpha1)
submitV1Alpha2(v1alpha2)
normalizeIntent(...)
prepareRuntimeAndAuthorizationPlan(...)
normalizeLegacyRecoverableRecord(...)
validatePersistedAuthorizationPlan(...)
buildVersionedReceipt(...)
projectVersionedReceipt(...)
```

所有版本分支只允许位于解析、record/receipt builder 和 public projection 边界；状态推进主体保持共享。

两个恢复 helper 的职责必须严格分离：

```text
normalizeLegacyRecoverableRecord(v1alpha1 recoverable record)
= Application 层 normalization 入口
→ 只处理 accepted / message_appended / task_committed
→ 使用 fixed MVP Policy 与既有 Runtime/Authorization facts 构造 replacement
→ 调用 Persistence exact CAS
→ reload 并返回 v1alpha2 record

validatePersistedAuthorizationPlan(v1alpha2 record)
= 无 I/O 的严格校验
→ 重算 policy / authorization / execution digest
→ 校验 Runtime Selection、Authorization row 与 record identity 一致
→ 只返回已持久 plan 或 typed failure
→ 不读当前 Policy、不写 Persistence、不执行 normalization
```

`completed / failed_terminal` 的历史 v1alpha1 record 继续读取既有 v1alpha1 Receipt，不为查询或
replay 强制 normalization。任何恢复路径不得用 `validatePersistedAuthorizationPlan()` 重新解析或选择
授权模式。

### 5.3 DesktopApplicationFacade

允许新增 Core application-level：

```text
submitTurnV1Alpha2(...)
querySubmitTurnV1Alpha2(...)
```

但本批禁止：

- 在 `CorePrivateHttpServer` 注册 v1alpha2 SubmitTurn 路由；
- 修改 Electron Main/Preload sidecar；
- Renderer 调用新 API；
- 删除现有 Mock。

---

## 6. 状态推进与不变量

状态机保持：

```text
accepted
→ message_appended
→ task_committed
→ completed
→ loopStartedAt

accepted/message_appended
→ failed_terminal
```

不新增 `authorization_resolved` 或 `materializing` 状态。授权计划已经是 accepted record 的不可变字段。

### 6.1 每阶段不变量

| 阶段 | 必须存在 | 禁止存在 |
| --- | --- | --- |
| accepted | exact request digest + Runtime plan + Authorization plan | appended Message、Task |
| message_appended | accepted plan + exactly one user Message | Task bundle partial facts |
| task_committed | complete authorization-aware Task bundle | Receipt/Delivery 半提交 |
| completed | Receipt + Delivery 同事务 | 未持久 Receipt 的 accepted response |
| loop started | completed Receipt + idempotent Loop start | 重复新 Run |

### 6.2 恢复时禁止重新选择

恢复只允许：

- 解析 durable record；
- 精确重建 locked Registry revision；
- 重算并比对 Runtime/Authorization/Execution digests；
- 读取已提交 bundle；
- 幂等完成下一阶段。

恢复禁止：

- 使用新 Policy revision；
- 静默切换授权模式；
- 改变 Agent/Model/Skill/Tool/Knowledge/Workspace；
- 将 v1alpha1 legacy source 改称 user_selected；
- 因 v1alpha2 query 重写历史 v1alpha1 Receipt。

---

## 7. A1～A7 命名崩溃窗口

| 窗口 | 故障点 | 持久事实 | 恢复结论 |
| --- | --- | --- | --- |
| A1 | Runtime + Authorization resolve 后、accepted commit 前 | 无 coordination record、无 Message append、无 Task | exact request 可重新解析；固定 Policy 下 digest 必须一致 |
| A2 | accepted v1alpha2 record commit 后、Message append 前 | exact accepted plan | 按 plan append 一次 Message，不重新选模式 |
| A3 | Message append 后、status transition 前/后 | prepared/committed Message + accepted/message_appended | Message idempotent，推进到 task bundle |
| A4 | authorization-aware bundle 事务中 | bundle 全无或全有 | partial Runtime/Auth/Execution facts 不允许存在 |
| A5 | bundle commit 后、coordination task_committed 前 | 完整 bundle + message_appended record | 重读并校验 bundle，CAS 推进，不生成第二 Task |
| A6 | Receipt+Delivery 完成事务后、HTTP/Core caller 收到响应前 | completed record + Receipt + Delivery | exact replay，v1alpha1/v1alpha2 projection 稳定 |
| A7 | Agent Loop start 后、loopStartedAt commit 前 | completed Receipt；Loop 可能已启动 | idempotent starter 恢复，不创建第二 Run |

测试要求：

- SQLite 窗口必须 close 旧进程/实例并 reopen 同一 DB；
- A2～A7 至少覆盖 v1alpha2 explicit；
- v1alpha1 legacy 至少覆盖 A2、A4、A6；
- historical v1alpha1 recoverable normalization 至少覆盖 A3/A5；
- 不能用开发者历史 digest 代替实际 Harness 执行。

---

## 8. 错误与安全语义

### 8.1 Typed error

至少覆盖：

```text
authorization_mode.policy_invalid
authorization_mode.mode_unsupported
authorization_mode.selection_invalid
authorization_mode.execution_identity_invalid
submit_turn.authorization_plan_missing
submit_turn.authorization_plan_drift
submit_turn.authorization_record_missing
submit_turn.execution_selection_drift
submit_turn.legacy_normalization_conflict
submit_turn.idempotency_conflict
```

规则：

- unsupported mode 非 retryable，不降级；
- accepted 前 fixed provider 临时 unavailable 可 retry；
- accepted 后只读持久 plan，policy 后续变化不影响 Task；
- missing/corrupt persisted fact fail-closed；
- safeSummary 不含用户正文、Policy 正文、路径、SQL、stack、Credential 或内部 JSON。

### 8.2 Evidence allowlist

开发者/QA Evidence 只允许：

- Contract/record schema version；
- mode 枚举与 source；
- revision/digest；
- stage/status/count/duration；
- typed error code；
- resource metrics。

禁止记录用户输入、Prompt、Tool 参数、Confirmation payload、文件内容、路径、Token、Credential、
完整 record JSON 或 Receipt JSON。

---

## 9. 预计修改边界

### 9.1 允许修改

```text
services/core/src/application/submit-turn-coordinator.ts
services/core/src/application/submit-turn-recovery-coordinator.ts（仅必要的 union/报告适配）
services/core/src/application/desktop-application-facade.ts（Core v1alpha2 方法，不接 HTTP）
services/core/src/application/legacy-task-authorization-selection-materializer.ts（仅 readiness 结果接缝）
services/core/src/ports/submit-turn-persistence.ts
services/core/src/adapters/memory/in-memory-submit-turn-persistence.ts
services/core/src/adapters/sqlite/sqlite-submit-turn-persistence.ts
services/core/src/bootstrap/create-desktop-private-runtime.ts
services/core/tests/**
packages/contracts/tests/**（只补既有 schema conformance；原则上不改生产 schema）
版本文件、README、CHANGELOG、DEVELOPMENT-LOG、计划状态
```

### 9.2 禁止修改

```text
apps/desktop/src/renderer/**
apps/desktop/src/main/**
apps/desktop/src/preload/**
services/core/src/adapters/http/core-private-http-server.ts
services/core/src/kernel/**
services/central-service/**
services/document-worker/**
pnpm-lock.yaml
依赖清单
SQLite migration 1～22
AuthorizationEvaluator / Tool risk matrix / Confirmation reuse
```

### 9.3 并发纪律

- DFI-2A.3 开发期间前端窗口保持停止；
- Port 与 InMemory/SQLite 必须在同一完整批次交付；
- 若其他窗口修改允许范围或共享治理文件，立即停止并报告，不继续补齐；
- 完整 Workspace、Central online、Central offline 严格串行；
- 独立 QA 只读，不在验收时修复生产代码。

---

## 10. 实施步骤

### Step 1：Coordination union 与双 Adapter Conformance

- Port 切换为 readable record/receipt union；
- InMemory/SQLite 严格解析两版 JSON；
- legacy recoverable normalization CAS；
- 两 Adapter 同一 Conformance；
- migrations 1～22 byte/行为回归。

### Step 2：Coordinator 双版本与 authorization-aware bundle cutover

- strict v1alpha1/v1alpha2 entry；
- exact wire request digest；
- normalized intent；
- fixed Policy + Selection Service；
- accepted v1alpha2 plan；
- legacy recoverable normalization 与 persisted plan validation 两条职责分离；
- production bundle 一次性切换；
- versioned Receipt/Query projection。

### Step 3：Startup readiness 与 A1～A7 Harness

- materializer 接 public readiness 前；
- recovery 顺序冻结；
- SQLite reopen / process restart Harness；
- idempotency/concurrency/resource/leak scan；
- 完整 Workspace 与 Central 串行回归。

三个 Step 属同一 DFI-2A.3 编码批次，不分别解锁，不允许在 Step 1 或 Step 2 的半切换状态提交 QA。

---

## 11. QA 验收矩阵

### 11.1 Contract 与版本兼容（1～10）

1. v1alpha1 command/receipt public schema 字节与行为零漂移；
2. v1alpha2 command strict 拒绝未知字段；
3. v1alpha2 explicit preference 被完整解析；
4. v1alpha1 规范化为 `smart_confirm / legacy_default`；
5. v1alpha1 source 不冒充 `user_selected`；
6. unsupported mode typed reject，不静默降级；
7. request digest 基于 exact wire command；
8. 同 command ID 跨 Contract Version typed conflict；
9. Readable record/receipt union 拒绝未知版本；
10. public v1alpha1 query 不出现 v1alpha2 字段。

### 11.2 accepted plan 与 Task bundle（11～22）

11. accepted record 在 Message append 前已含 exact authorization plan；
12. plan requested/resolved mode 与 request 一致；
13. policy revision/digest 可重算；
14. authorization selection digest 可重算；
15. execution selection digest 可重算；
16. execution digest 精确组合 Runtime + Authorization；
17. capability locks 与既有 Runtime Selection 一致；
18. 新任务只调用 authorization-aware bundle；
19. bundle 同事务写 Task/Checkpoint/Locks/Runtime/Auth/Execution；
20. 任一冲突整笔回滚；
21. bundle commit 后完整重读验证；
22. 旧 `bundleDigest` 与 Runtime Selection digest 零改写。

### 11.3 Coordination Persistence（23～32）

23. Port + InMemory + SQLite 同批实现，无半切换；
24. v1alpha1 historical record 可读，normalization 逐字段保留 §4.6 全部既有事实；
25. v1alpha2 new record 可读；
26. common indexed columns 与 record JSON 一致；
27. v1alpha1/v1alpha2 receipt JSON 均严格读取；
28. normalization exact CAS 幂等，且只 additive 补入 legacy authorization preference/plan；
29. 同 ID 不同 plan typed conflict；
30. close/reopen 后 transport/coordination/authorization version 不漂移；
31. corrupt record/receipt fail-closed；
32. migration 23 不存在，migration 1～22 未改写。

### 11.4 Legacy 与 Readiness（33～41）

33. 既有 Runtime Selection 全部 materialize Authorization row；
34. materialized createdAt 等于 RuntimeSelection.createdAt；
35. fixed MVP policy revision 精确匹配；
36. coverage digest drift 阻断 startup；
37. corrupt Authorization row 阻断 startup；
38. materialization 在 recovery/server 前完成；
39. public ready 前不存在缺 Authorization 的既有 Task；
40. historical pre-completion recoverable record 按固定 legacy plan normalization；
    completed-without-loop-start 继续使用 v1alpha1 Receipt 并只执行 idempotent Loop start，其他 terminal
    v1alpha1 查询/replay 不被强制改写；
41. 普通 transient recovery failure 不被误判为 authorization corruption。

### 11.5 A1～A7（42～50）

42. A1 无 durable side effect，retry digest 一致；
43. A2 accepted plan replay，不重新读新 policy；
44. A3 Message 只 append 一次；
45. A4 bundle 全有或全无；
46. A5 bundle commit 后恢复不创建第二 Task；
47. A6 Receipt/Delivery replay，不重复 Delivery；
48. A7 Loop idempotent start，不创建第二 Run；
49. historical v1alpha1 recoverable A3/A5 close/reopen；
50. explicit v1alpha2 A2～A7 全覆盖。

### 11.6 安全、资源与回归（51～60）

51. mode 尚未影响 AuthorizationEvaluator，禁止超前行为声明；
52. Confirmation scope/reuse 零修改；
53. HTTP/Main/Preload/Renderer 零修改；
54. Kernel/Central/Document Worker 零修改；
55. user input/Prompt/路径/Credential/Token 四通道扫描 0；
56. mailbox/recovery scheduler/DB handle/resource 最终归零；
57. 同 command 32 路并发单写者；
58. DFI-1A/1B、DFI-2A.1/2A.2 全量回归；
59. Workspace、Central online、Central offline 严格串行全绿；
60. DFI-2B/DFI-3/DFI-4 无超前实现。

---

## 12. 工期估算

集中工程工作量：

```text
Coordination union + 双 Adapter Conformance：1.5～2.5 天
Coordinator 双版本 + bundle/Receipt cutover：2～3 天
Readiness + A1～A7 Harness：1.5～2.5 天
合计：5～8 个集中工程工作日
```

该估算不包含：

- 独立 QA 等待；
- 用户接受等待；
- DFI-2B 风险矩阵与 Confirmation 行为；
- Desktop transport/Renderer 接入；
- 其他窗口冲突导致的返工。

这是工程工作量，不是日历交付承诺。

---

## 13. 退出门槛

DFI-2A.3 只有同时满足以下条件才可关闭：

```text
Plan 文档评审 P0=0 / P1=0
AND
用户明确授权编码
AND
60 项 QA 全部有实际证据
AND
Workspace / Central online / Central offline 严格串行 PASS
AND
独立 QA P0=0 / P1=0
AND
用户明确接受独立 QA
```

关闭后：

- DFI-2A 整体可建议 `PASS/CLOSED`；
- DFI-2B 仍保持 `GATED`，必须单独输出风险矩阵/Confirmation 消费方案并获授权；
- DFI-3、DFI-4 不自动解锁；
- 前端真实接入不因 Core 完成自动发生。

---

## 14. 请重点评审

1. 新 v1alpha1/v1alpha2 提交都使用 v1alpha2 coordination record、public Receipt 按 transport version
   投影，是否是最小兼容方案；
2. exact wire request digest 与 normalized intent 分离是否充分关闭幂等混淆；
3. accepted plan 是否确实早于 Message append/Task commit；
4. historical v1alpha1 recoverable record 的 normalization CAS 是否足够诚实且可恢复；
5. coordination Port + InMemory/SQLite union 是否能在不新增 migration 23 的情况下完成；
6. materialization → recovery → server → ready 顺序是否正确；
7. DFI-2A.3 不消费三模式风险行为、只锁事实，是否与 DFI-2B 边界一致；
8. A1～A7 是否覆盖全部 durable 窗口；
9. 60 项 QA 与 5～8 天估算是否可执行；
10. 是否出现新的 P0/P1 或必须由用户决定的产品语义。

---

## 15. Revision 1 修订映射

| 评审项 | 修订 | 状态 |
| --- | --- | --- |
| P3-1 normalization“保留全部身份”字段不够精确 | §4.6 冻结 v1alpha1 record 全量逐字段保留清单，并明确 selectionRequest 只 additive 补授权偏好 | CLOSED |
| P3-2 `ensureReadableAuthorizationPlan(...)` 职责不清 | §5.2 拆为 legacy normalization I/O 入口与 persisted plan 纯校验，冻结适用状态和禁止行为 | CLOSED |

Revision 1 不改变阶段范围、公共 Contract、migration 编号、60 项 QA 总数或 5～8 天估算。

---

## 16. 当前状态

```text
DFI-2A.2：PASS/CLOSED
DFI-2A.3：INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED
DFI-2B：GATED
DFI-3：GATED
DFI-4：GATED
```

— Codex 5.6
