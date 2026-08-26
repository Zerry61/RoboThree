# DFI-2A.2 migration 22、Persistence 与历史回填详细实施方案

## 1. 文档状态

```text
阶段：DFI-2A.2 — Authorization Selection Persistence Foundation
状态：INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED
日期：2026-08-18
上游：DFI-0、DFI-1A、DFI-1B、DFI-2A.1 PASS/CLOSED
范围：Core SQLite migration 22、Task Authorization Persistence、InMemory/SQLite Conformance、
      authorization-aware Task bundle 原子提交入口、legacy materialization 机制
不包含：SubmitTurnCoordinator 生产切换、v1alpha1/v1alpha2 请求编排、HTTP/Main/Preload/Renderer、
        三模式风险动作矩阵、确认复用、DFI-2A.3、DFI-2B、DFI-3、DFI-4
```

本方案已经通过文档评审并完成 DFI-2A.2 实现；两项评审 P3 已在实现和独立 QA 中关闭：indexed
columns 的字段来源已精确冻结，materialization snapshot 已返回完整 `TaskRuntimeSelection`
material 供 Application 重算 digest。独立 QA P0～P3=0，用户已正式接受并关闭本批。

---

## 2. 阶段目标

DFI-2A.2 把 DFI-2A.1 已冻结的以下事实变成可持久、可重放、可校验的数据：

```text
TaskAuthorizationSelection
+ TaskExecutionSelectionIdentity
+ exact TaskRuntimeSelection reference
```

完成后，Persistence Foundation 应能够：

1. 在新 authorization-aware Task bundle 中原子写入 Task、Checkpoint、CapabilityLocks、
   RuntimeSelection、AuthorizationSelection 和既有 SubmitTurn binding；
2. 同一逻辑输入幂等重放，不同授权事实产生 typed conflict；
3. 从 SQLite close/reopen 后重建并验证两个 digest；
4. 为既有 TaskRuntimeSelection 生成诚实的 `smart_confirm / legacy_default` 事实；
5. 在 migration、materialization 或并发中途失败时保持全有或全无；
6. 不改变既有 v1alpha1 bundle digest、RuntimeSelection digest 或生产 SubmitTurn 行为。

---

## 3. 已核实代码事实

### 3.1 已存在且直接复用

- Core SQLite migration 当前最大编号为 `21`；`LATEST_SQLITE_SCHEMA_VERSION` 从迁移数组末项派生；
- migration `8` 已建立 `task_runtime_selections(runtime_selection_id PRIMARY KEY, task_id UNIQUE)`；
- migration `9` 已建立 `task_submit_turn_bindings`；
- `TaskPersistence` 已提供现有 v1alpha1 `commitSubmitTurnTaskBundle()` 与 bundle load API；
- `validateSubmitTurnTaskBundle()` 计算的 `bundleDigest` 只证明既有 Task bundle 基线事实；
- InMemory 与 SQLite Adapter 已具备相同的 bundle 幂等、冲突和精确 CapabilityLock 校验；
- `migrateAndPreflight()` 具备 forward-only migration、history 与 required schema 检查；
- DFI-2A.1 已提供三个可重算 digest 的 strict schema 和纯
  `TaskAuthorizationSelectionService`；
- Desktop private runtime 当前依次启动 conversation、foundation、tasks、coordination，然后进行
  recovery 并公开 HTTP readiness。

### 3.2 当前缺口

| 缺口 | 风险 | DFI-2A.2 处置 |
| --- | --- | --- |
| SQLite 无授权选择表 | 重启后授权选择消失 | migration 22 |
| TaskPersistence 无授权 sidecar API | 调用者只能另起事务 | 新增 versioned persistence path |
| InMemory/SQLite 无同一 Conformance | 两种 Adapter 语义可能漂移 | parameterized suite |
| 旧 TaskRuntimeSelection 无授权事实 | 来源不清、恢复不可审计 | deterministic legacy materializer |
| 直接修改旧 bundle input 会迫使 Coordinator 抢跑 | DFI-2A.3 边界被突破 | 保留旧 API，新增并行入口 |
| migration 成功但 materialization 未完成 | schema 存在但事实不完整 | restart-safe completeness check |

---

## 4. 冻结设计决策

### 4.1 migration 22 是唯一 Schema 变化

```text
id: 22
name: dfi_2a_task_authorization_selections
```

规则：

- migrations `1～21` 的 ID、name、SQL、历史测试与 checksum 预期不得改写；
- 若编码开始前 `22` 已被其他已授权批次占用，停止并回到文档评审，不静默改号；
- migration 22 只建表和索引，不在 SQL 中伪造 canonical JSON 或 SHA-256 digest；
- 数据 materialization 由 Core 使用 DFI-2A.1 的纯 Resolver 完成。

### 4.2 不修改既有 v1alpha1 Task bundle API 语义

本批不得把授权字段直接设为现有 `SubmitTurnTaskBundle` 的必填字段，否则尚未授权的
`SubmitTurnCoordinator` 会被迫同时改造。

新增并行类型和方法：

```text
AuthorizationAwareSubmitTurnTaskBundle
PersistedAuthorizationAwareSubmitTurnTaskBundle

commitAuthorizationAwareSubmitTurnTaskBundle(...)
loadAuthorizationAwareSubmitTurnTaskBundle(...)
```

既有：

```text
commitSubmitTurnTaskBundle(...)
loadSubmitTurnTaskBundle(...)
```

保持行为和 digest 不变。DFI-2A.3 才负责将生产 Coordinator 切换到新入口。

### 4.3 三个 digest 各自证明不同事实

| Digest | 证明范围 | 本批规则 |
| --- | --- | --- |
| `bundleDigest` | 既有 Task/Checkpoint/Locks/RuntimeSelection bundle | 不重算历史、不加入授权字段 |
| `authorizationSelectionDigest` | Task 授权选择 material | 使用 DFI-2A.1 validator 重算 |
| `executionSelectionDigest` | RuntimeSelection digest + Authorization digest 的组合 identity | 使用 DFI-2A.1 validator 重算 |

同一 `submitTurnCommandId + bundleDigest` 但授权或 execution digest 不同，必须返回冲突，不能按旧
bundle 幂等吞掉差异。

### 4.4 DFI-2A.2 不激活生产 SubmitTurn cutover

DFI-2A.2 交付并验证 persistence/materialization 能力，但：

- 不修改 `SubmitTurnCoordinator`；
- 不修改 Desktop private HTTP/Main/Preload/Renderer；
- 不把 authorization row 设为现有公共 runtime readiness 的强制条件；
- 不声称所有在运行中的新 Task 已携带授权 sidecar。

DFI-2A.3 必须在一个明确 cutover 中完成：

```text
启动 Persistence
→ 执行 legacy materialization
→ 验证 coverage 完整
→ 切换 Coordinator 到 authorization-aware bundle
→ 才公开 Desktop runtime readiness
```

这样避免 DFI-2A.2 中间版本出现“旧 Coordinator 仍创建 Task，但 readiness 已要求授权事实”的
半切换状态。

### 4.5 历史回填只使用冻结 legacy policy

历史 materialization 固定使用 DFI-2A.1 已接受并导出的
`MVP_TASK_AUTHORIZATION_MODE_POLICY` exact snapshot：

```text
requestedMode = smart_confirm
resolvedMode  = smart_confirm
source        = legacy_default
policyRevision = Fixed MVP legacy policy exact revision
createdAt     = TaskRuntimeSelection.createdAt
```

禁止：

- 使用启动墙钟生成 `createdAt`；
- 逐行重新读取可变 Policy；
- 将历史记录标记为 `user_selected`；
- 因未来默认值变化而重写既有授权事实。

编码时必须用测试锁定该常量的 `policyId`、`legacyDefaultMode`、`createdAt` 和计算后的
`policyRevision`；不得在 Materializer 内复制第二份对象或手写另一个 digest。

---

## 5. migration 22 Schema

建议表结构：

```sql
CREATE TABLE task_authorization_selections (
  task_id TEXT PRIMARY KEY
    REFERENCES task_heads(task_id) ON DELETE CASCADE,
  runtime_selection_id TEXT NOT NULL UNIQUE
    REFERENCES task_runtime_selections(runtime_selection_id) ON DELETE CASCADE,
  runtime_selection_digest TEXT NOT NULL,
  requested_mode TEXT NOT NULL
    CHECK (requested_mode IN ('manual_review','smart_confirm','task_scoped')),
  resolved_mode TEXT NOT NULL
    CHECK (resolved_mode IN ('manual_review','smart_confirm','task_scoped')),
  policy_revision TEXT NOT NULL,
  resolution_source TEXT NOT NULL
    CHECK (resolution_source IN ('user_selected','legacy_default')),
  authorization_selection_digest TEXT NOT NULL,
  execution_selection_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  record_json TEXT NOT NULL,
  CHECK (requested_mode = resolved_mode)
) STRICT;

CREATE INDEX task_authorization_selections_policy_idx
  ON task_authorization_selections(
    policy_revision, resolved_mode, task_id
  );
```

`record_json` 是 Core-private strict persistence record：

```text
TaskAuthorizationPersistenceRecord
├── selection: TaskAuthorizationSelection
└── executionIdentity: TaskExecutionSelectionIdentity
```

要求：

- indexed columns 必须与 `record_json` 逐字段一致；
- `runtime_selection_digest` 精确来自 `record.executionIdentity.runtimeSelectionDigest`；
- `authorization_selection_digest` 精确来自
  `record.selection.authorizationSelectionDigest`；
- `execution_selection_digest` 精确来自
  `record.executionIdentity.executionSelectionDigest`；
- task/runtime/mode/policy/source/createdAt 精确来自 `record.selection`；
- `runtime_selection_digest` 必须等于被引用的 TaskRuntimeSelection；
- 两个对象必须通过 DFI-2A.1 的 digest 重算；
- 不保存 Policy 正文、确认 payload、用户输入、Prompt、路径、Token、Credential 或 Runtime Handle。

---

## 6. Persistence Port

### 6.1 新增读取能力

```text
loadTaskAuthorizationSelection(taskId)
loadTaskExecutionSelectionIdentity(taskId)
loadAuthorizationAwareSubmitTurnTaskBundle(submitTurnCommandId)
```

读取时必须同时验证：

- strict record schema；
- indexed column 与 JSON 一致；
- authorization/execution digest；
- taskId、runtimeSelectionId、runtimeSelectionDigest 精确绑定；
- RuntimeSelection 自身 digest 有效；
- 既有 bundle 的 CapabilityLock 引用仍有效。

缺失返回 `undefined`；已存在但损坏必须 fail-closed，不得伪装缺失。

### 6.2 新增原子提交能力

`commitAuthorizationAwareSubmitTurnTaskBundle()` 的输入包含：

```text
既有 SubmitTurnTaskBundle
+ TaskAuthorizationSelection
+ TaskExecutionSelectionIdentity
```

提交前验证：

1. 先复用 `validateSubmitTurnTaskBundle()`；
2. authorization selection 通过 digest 校验；
3. selection/task/runtime identities 与 bundle 完全一致；
4. execution identity 引用 exact `runtimeSelection.selectionDigest`；
5. execution identity 引用 exact authorization digest；
6. requested/resolved mode 不发生静默降级；
7. source 只允许 DFI-2A.1 Contract 枚举；
8. 所有验证完成后才允许写入。

原子写入集合：

```text
TaskHead
+ initial Checkpoint
+ CapabilityLocks
+ TaskRuntimeSelection
+ TaskAuthorizationSelection record
+ existing TaskSubmitTurnBinding
```

Conversation Message 和最终 SubmitTurn Receipt/Delivery 仍不属于该事务。

### 6.3 幂等与冲突

| 场景 | 结果 |
| --- | --- |
| 同 command + 同 base bundle + 同 authorization + 同 execution | replay success |
| 同 command + base bundle 不同 | `persistence.submit_turn_bundle_conflict` |
| 同 base bundle + authorization digest 不同 | `persistence.authorization_selection_conflict` |
| 同 authorization + runtime digest/execution digest 不同 | `persistence.execution_selection_conflict` |
| task/runtime selection identity 已被其他 command 占用 | typed identity conflict |
| existing row indexed facts 与 JSON/digest 不同 | `persistence.authorization_selection_corrupt` |

禁止 last-write-wins、delete-and-reinsert 或回退为 legacy default。

---

## 7. InMemory Adapter

新增两个以 Task/runtime identity 索引的内存结构，但只保存一份 canonical record：

```text
taskId → TaskAuthorizationPersistenceRecord
runtimeSelectionId → taskId
```

要求：

- 写前完成全部解析和冲突检查；
- 使用临时 clone/staging，确认全部可提交后一次性替换，模拟 SQLite 全有或全无；
- replay 返回重新 parse 的值，不暴露内部对象引用；
- stop/start 不伪装持久恢复；close/reopen 语义只由 SQLite 证明；
- 与 SQLite 共用同一 parameterized Conformance，不能维护两套测试结论。

---

## 8. SQLite Adapter

### 8.1 Schema preflight

`requiredColumns` 增加 `task_authorization_selections` 全部列。测试同时验证：

- migration 22 只出现一次且是当前最大连续编号；
- fresh database 直接到 22；
- 21 → 22 upgrade 保留所有旧数据；
- schema 23+ 失败关闭；
- 缺表、缺列、错误 migration name、重复 migration row 失败关闭；
- migrations 1～21 byte-level/历史期望不变。

### 8.2 Transaction

authorization-aware bundle 使用同一个 `BEGIN IMMEDIATE`：

```text
validate all facts
→ check replay/conflict
→ insert Task base facts
→ insert authorization record
→ insert existing binding
→ reload exact bundle
→ COMMIT
```

任何 insert、reload 或 integrity check 失败都 `ROLLBACK`。不得先提交旧 bundle，再补授权表。

### 8.3 close/reopen

重开后必须证明：

- 三个 digest 不变；
- source、policy revision、createdAt 不变；
- Task/RuntimeSelection/AuthorizationSelection 的 identity 仍精确绑定；
- replay 不产生第二行；
- corrupt JSON、indexed drift 或 digest tamper 失败关闭。

---

## 9. Legacy Materialization

### 9.1 Application 与 Port 分层

新增 Application Service：

```text
LegacyTaskAuthorizationSelectionMaterializer.materialize({
  exactPolicySnapshot,
  persistence
})
```

Persistence 只提供 Core-private snapshot/CAS 接缝：

```text
loadTaskAuthorizationMaterializationSnapshot() -> {
  runtimeSelections, // 完整 TaskRuntimeSelection material，不是部分引用
  existingAuthorizationRecords,
  coverageDigest
}

commitTaskAuthorizationMaterialization({
  expectedCoverageDigest,
  records
}) -> {
  existingCount,
  insertedCount,
  totalRuntimeSelectionCount,
  coverageDigest
}
```

`coverageDigest` 从按 taskId 稳定排序的
`taskId + runtimeSelectionId + selectionDigest` 集合派生。Application 使用 DFI-2A.1 的纯 Resolver；
Adapter 不解析 legacy policy、不选择 mode。公开结果不返回用户正文、Task 列表或完整记录。

### 9.2 算法

```text
验证 exact Policy snapshot
→ 加载带 coverageDigest 的稳定 materialization snapshot
→ 对每项重算并验证 RuntimeSelection digest
→ 已有 authorization row：验证 exact identity 与 digest
→ 缺失 row：用 pure Resolver 生成 smart_confirm/legacy_default
→ 以 expectedCoverageDigest 单事务提交全部缺失 row
→ 事务内重算 coverage；漂移则 typed conflict，不提交
→ 验证最终 authorization coverage = runtime selection count
→ 生成只含 count/digest 的结果
```

SQLite 使用一个 `BEGIN IMMEDIATE`；InMemory 使用 staged copy。任一损坏、并发 coverage 漂移或
冲突导致整批不写入。DFI-2A.3 在公开 readiness 前调用时不存在正常 Task 写入竞争；CAS 仍用于
崩溃恢复与双 owner 防护。

### 9.3 重启与并发

| 窗口 | 恢复语义 |
| --- | --- |
| M1：migration 22 提交后、materialization 前崩溃 | 重启发现缺行并重跑 |
| M2：materialization 中间失败 | 整体 rollback，零部分行 |
| M3：materialization commit 后响应丢失 | 重跑验证 existing，inserted=0 |
| M4：两个 owner 并发 materialize | SQLite 单写者；loser 重读并幂等收敛 |
| M5：已有一行 digest/identity 漂移 | fail-closed，不覆盖、不继续插入 |

本批只实现和测试该机制，不把它接入 Desktop public readiness。正式启动顺序由 DFI-2A.3 一次性
接入，避免旧 Coordinator 在同一进程继续产生无 sidecar 的新 Task。

---

## 10. Typed Error 与证据边界

建议错误码：

```text
persistence.invalid_authorization_selection
persistence.authorization_selection_conflict
persistence.execution_selection_conflict
persistence.authorization_selection_corrupt
persistence.authorization_materialization_incomplete
persistence.authorization_materialization_conflict
persistence.authorization_policy_invalid
```

要求：

- 错误只包含 typed code 与安全摘要；
- 不返回 schema issue、SQL、stack、record JSON、Task 列表或路径；
- 日志/Trace/QA Evidence 只记录 count、digest、status、duration 和 typed code；
- Fixture 不含用户正文、Prompt、Tool 参数、文件内容、Credential、Token、Endpoint 或本地路径。

---

## 11. 修改边界

### 11.1 允许修改

```text
services/core/src/adapters/sqlite/migrations.ts
services/core/src/adapters/sqlite/schema-preflight.ts
services/core/src/adapters/sqlite/sqlite-task-persistence.ts
services/core/src/adapters/memory/in-memory-task-persistence.ts
services/core/src/ports/task-persistence.ts
services/core/src/persistence/submit-turn-bundle-validation.ts
services/core/src/persistence/**authorization-selection**
services/core/src/application/legacy-task-authorization-selection-materializer.ts
services/core/tests/**dfi-2a2**
services/core/tests/**task-persistence**
README.md
CHANGELOG.md
docs/development/DEVELOPMENT-LOG.md
docs/development/frontend/DFI-2A*.md
```

### 11.2 禁止修改

```text
services/core/src/application/submit-turn-coordinator.ts
services/core/src/bootstrap/create-desktop-private-runtime.ts
services/core/src/kernel/**
services/core/src/adapters/http/**
apps/desktop/**
services/central-service/**
services/document-worker/**
pnpm-lock.yaml
公共 v1alpha1 schema / request digest / bundle digest
packages/contracts/**
AuthorizationEvaluator 风险矩阵
```

若实现发现必须修改禁止文件，停止编码并回到文档评审，不以“顺手接入”扩大范围。

---

## 12. 实施步骤

### Step 1：Schema 与私有 persistence record

- 新增 migration 22；
- 扩展 required schema preflight；
- 定义 strict persistence record 与验证函数；
- 冻结三个 digest 的独立语义。

### Step 2：Port 与 InMemory

- 新增 authorization-aware bundle 类型与方法；
- 新增读取、materialization snapshot/CAS API 与 Application Materializer；
- InMemory staged atomic commit；
- 先建立 parameterized Conformance。

### Step 3：SQLite

- 同事务 bundle 写入；
- strict row parser；
- legacy materialization 单事务；
- fresh/upgrade/close-reopen/concurrency 故障注入。

### Step 4：范围与回归收口

- 证明旧 bundle API 与 digest 零漂移；
- 证明 Coordinator/bootstrap/Desktop 零修改；
- 更新版本、CHANGELOG、README、Development Log；
- 串行执行完整门禁并交独立 QA。

---

## 13. QA 验收矩阵（48 项）

### 13.1 migration 与 preflight（1～10）

1. migration 22 ID/name 精确；
2. migrations 1～21 未改写；
3. fresh database → 22；
4. 21 → 22 保留旧数据；
5. 重复启动 migration 幂等；
6. schema 23+ 失败关闭；
7. 缺表失败关闭；
8. 缺列失败关闭；
9. migration name/history 漂移失败关闭；
10. 索引、FK、CHECK 与 STRICT 表存在。

### 13.2 strict record 与 digest（11～19）

11. valid 三模式 record；
12. unknown mode 拒绝；
13. extra field 拒绝；
14. requested/resolved 不同拒绝；
15. authorization digest tamper 拒绝；
16. execution digest tamper 拒绝；
17. runtimeSelectionDigest mismatch 拒绝；
18. task/runtime identity mismatch 拒绝；
19. indexed column 与 JSON drift 拒绝。

### 13.3 authorization-aware bundle（20～30）

20. InMemory 首次原子提交；
21. SQLite 首次原子提交；
22. 同输入 replay；
23. base bundle conflict；
24. authorization selection conflict；
25. execution selection conflict；
26. CapabilityLock drift 仍拒绝；
27. authorization insert 前故障零 Task 事实；
28. authorization insert 后、binding 前故障整体 rollback；
29. commit 后响应丢失 replay 收敛；
30. 两个并发 writer 恰好一个首次提交者。

### 13.4 legacy materialization（31～39）

31. 全部历史 row 为 smart_confirm/legacy_default；
32. createdAt 等于各自 RuntimeSelection.createdAt；
33. exact fixed policy revision；
34. M1 migration 后崩溃重跑；
35. M2 中间故障整体 rollback；
36. M3 commit 后响应丢失幂等；
37. M4 并发 owner 收敛；
38. M5 corrupt existing row 失败关闭且零覆盖；
39. coverage count/digest 重启前后一致。

### 13.5 Adapter parity、边界与回归（40～48）

40. InMemory/SQLite 同一 Conformance；
41. SQLite close/reopen 精确恢复；
42. 旧 `commitSubmitTurnTaskBundle` 行为不变；
43. 旧 `bundleDigest` 公式不变；
44. v1alpha1 Contract/request digest 零漂移；
45. SubmitTurnCoordinator/bootstrap/Desktop/Kernel/Central 零修改；
46. migration 22 未接 public readiness；
47. 四通道敏感扫描 0；
48. DFI-2A.3、DFI-2B、DFI-3、DFI-4 无超前实现。

---

## 14. 开发者门禁与独立 QA

必须使用 Node `24.13.0`，并严格串行执行：

```text
CI=true pnpm exec vitest run <DFI-2A.2 focused suites>
CI=true pnpm run lint
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

要求：

- 独立 QA 必须实际重跑，不接受 digest 或开发者报告代替；
- Workspace 与 Central online/offline 不得并行；
- Evidence 只允许安全计数、digest、状态、duration 和 typed code；
- DFI-2A.2 独立 QA 与用户接受门槛已经满足；该关闭只允许进入 DFI-2A.3 文档评审，不自动授权编码。

---

## 15. 工期

| 工作项 | 集中工程工作日 |
| --- | ---: |
| migration 22 + preflight + record validator | 1～1.5 |
| Port + InMemory/SQLite 原子 bundle | 1.5～2 |
| legacy materialization + 并发/故障恢复 | 1～1.5 |
| 完整回归、文档与返工余量 | 0.5～1 |
| 合计 | **4～6** |

这是工程工作量，不是日历承诺，不包含文档等待、独立 QA 和用户等待。

---

## 16. 评审重点

请重点确认：

1. 新增并行 authorization-aware bundle API、保留旧 API，是否是避免 DFI-2A.3 抢跑的最小方案；
2. DFI-2A.2 只实现 materialization 机制、不接 public readiness，是否正确；
3. migration 22 表结构、FK、索引和 strict record 是否足够；
4. 三个 digest 的证明范围是否彻底分离；
5. 同 base bundle 但授权/执行 digest 不同是否必须 typed conflict；
6. historical `createdAt = RuntimeSelection.createdAt` 是否提供确定性；
7. fixed legacy policy snapshot 是否避免未来默认值重写历史；
8. materialization 单事务与 M1～M5 是否覆盖完整；
9. InMemory staged commit 是否足以与 SQLite atomicity 对齐；
10. 48 项 QA 是否覆盖 migration、并发、恢复和零超前；
11. 是否出现新的 P0/P1、公共 Contract 冲突或需要用户重新决策的边界。

---

## 17. 阶段门禁

```text
DFI-2A.1：PASS/CLOSED
DFI-2A.2：PASS/CLOSED
DFI-2A.3：PLAN DRAFT / DOCUMENT REVIEW / CODING GATED
DFI-2B：GATED
DFI-3：GATED
DFI-4：GATED
```

当前执行路径：

```text
DFI-2A.3 详细方案文档评审
→ 吸收必要修订并关闭 P0/P1
→ 用户接受并单独授权后才可编码
```

— Codex 5.6
