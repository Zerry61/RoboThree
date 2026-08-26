# DFI-2A 智能授权 Contract、Selection 与持久化开发计划

## 1. 文档状态

```text
阶段：DFI-2A — Task Authorization Selection Foundation
状态：DFI-2A、DFI-2A.1、DFI-2A.2、DFI-2A.3 PASS/CLOSED / DFI-2B、DFI-3、DFI-4 GATED
日期：2026-08-18
上游：DFI-0、DFI-1A、DFI-1B PASS/CLOSED；Workspace 与智能授权 Feature Spec v1.0 已冻结
范围：版本化 SubmitTurn Contract、授权选择解析、组合执行选择 identity、Core SQLite migration 22、
      InMemory/SQLite Conformance、SubmitTurn 持久编排与恢复
不包含：确认风险矩阵、确认复用、Main/Preload/Renderer、真实选择器、DFI-2B、DFI-3、DFI-4
```

本计划只把“用户请求哪种智能授权模式、Core 最终锁定哪种模式”变成可持久、可恢复、可幂等
验证的 Task 事实。三种模式对具体 Tool Action 的放行、询问与复用行为属于 DFI-2B，本批不提前实现。

本文已经通过文档评审。用户确认历史任务和 v1alpha1 请求采用
`smart_confirm / legacy_default`，中文名称继续使用“手动复核 / 智能确认 / 任务内授权”。
DFI-2A.1、DFI-2A.2 均已通过独立 QA 并由用户正式接受、`PASS/CLOSED`；
DFI-2A.3 Revision 1 已通过差异复核并获用户明确编码授权；实现、开发者门禁和独立 QA 均已完成，
用户已正式接受，DFI-2A.3 与 DFI-2A 整体 `PASS/CLOSED`；后续阶段继续 `GATED`。

---

## 2. 目标与用户结果

### 2.1 用户结果

DFI-2A 完成后，Core 具备以下真实能力，但 Desktop 选择器仍保持“待接入”：

```text
接收版本化 requested mode
→ 校验固定 MVP 模式策略
→ 形成 resolved mode + policy revision + source
→ 与 Task Runtime Selection 形成不可漂移的组合 identity
→ 随 Task bundle 持久提交
→ 重启、重放和恢复得到同一事实
```

### 2.2 工程结果

- 保持现有严格 `submitTurn v1alpha1` 的请求、响应和 digest 语义不变；
- 新增 versioned authorization-aware SubmitTurn Contract，但 DFI-2A 不接 HTTP/Main/Preload；
- requested/resolved mode、policy revision 和 source 成为 Core 权威事实；
- 不改写既有 `TaskRuntimeSelection v1alpha1`，通过授权 sidecar 和组合 digest 补齐执行选择 identity；
- 将授权选择纳入现有 Task bundle 单事务，不伪造跨 SQLite 或跨阶段大事务；
- migration `22` 对历史任务做确定性、可审计、幂等的 `legacy_default` 回填；
- DFI-2B 可以在不重写 Selection/Persistence 的前提下消费锁定模式。

---

## 3. 当前代码事实与真实缺口

### 3.1 已存在且必须复用

1. `SubmitTurnCommand v1alpha1` 和 `TaskSelectionRequest` 是 strict schema，没有授权模式字段；
2. `TaskRuntimeSelection v1alpha1` 已锁定 Agent、Model、Skill、Tool、Knowledge、Workspace、
   Registry 和 Platform Prompt revision，并以 `selectionDigest` 自校验；
3. `SubmitTurnCoordinator` 已有 durable record、命令/客户端回合幂等、恢复 mailbox 和命名故障点；
4. Task bundle 已在一个 SQLite 事务中提交 TaskHead、Checkpoint、CapabilityLock、
   TaskRuntimeSelection 与 SubmitTurn binding；
5. Conversation Message、Task bundle、最终 Receipt/Delivery 是由 durable coordinator 串联的不同事务，
   当前架构不宣称它们是一个数据库大事务；
6. `AuthorizationEvaluator` 已实现固定权限、Workspace、Capability availability、风险事实和精确
   Confirmation Scope，但当前不消费任务授权模式；
7. Core SQLite migration 当前最大编号为 `21`，`22` 已由 DFI 总计划明确预留给 DFI-2A；
8. Desktop Local `v1alpha2` 已存在 additive Contract 空间，但当前 Renderer sidecar 仍严格只有
   compatibility、Workspace Browser、Workspace Reveal 三个成员。

### 3.2 DFI-2A 必须补齐

| 缺口 | 当前风险 | 本批处置 |
| --- | --- | --- |
| requested mode 不进入请求 | 前端选择会被静默丢弃 | 新增 strict versioned SubmitTurn schema |
| Core 无 resolved mode | Renderer 可能复制规则 | 新增固定模式解析 Port/Application Service |
| 授权模式不在 Task identity | 重启或重放可漂移 | 新增授权选择事实与组合 execution selection digest |
| SubmitTurn record 无授权计划 | 中途崩溃会重新读取新策略 | accepted record 锁定 exact resolution facts |
| Task bundle 无授权 sidecar | Task 恢复不知道创建时模式 | 同一 Task bundle 事务插入授权选择 |
| 历史 Task 无授权事实 | 升级后行为来源不明确 | migration 22 后 readiness backfill 为 legacy default |
| v1alpha1 兼容语义不明确 | 可能伪装用户主动选择 | 固定 smart_confirm + legacy_default，不修改公开 receipt |
| 模式具体行为尚未接入 | 容易把本批扩大成 Policy Engine | DFI-2B 继续 GATED |

---

## 4. 冻结架构决策

### 4.1 三种模式沿用已冻结产品语义

Contract 枚举固定为：

```text
manual_review
smart_confirm
task_scoped
```

DFI-2A 只解析并锁定模式，不实现动作矩阵。以下行为继续留给 DFI-2B：

- 普通创建/修改是否直接执行；
- 删除、程序执行和外部发送是否请求确认；
- `task_scoped` 是否可以复用某个精确 Confirmation Scope；
- 风险事实、权限或目标变化时如何失效确认。

### 4.2 v1alpha1 保持严格不变

不得修改：

- `TaskSelectionRequestSchema v1alpha1`；
- `SubmitTurnCommandSchema v1alpha1`；
- `SubmitTurnReceiptSchema v1alpha1`；
- v1alpha1 IPC channel、Main/Preload API 或 Fixture；
- 既有 v1alpha1 request digest 计算方式。

新收到的 v1alpha1 SubmitTurn 在 Core 内部规范化为：

```text
requestedMode = smart_confirm
resolvedMode  = smart_confirm
source        = legacy_default
policyRevision = 当前固定 MVP mode policy 的精确 revision
```

`legacy_default` 表示兼容默认，不得在 UI、审计或日志中描述为“用户选择了智能确认”。

### 4.3 authorization-aware Contract 使用 Desktop Local v1alpha2 空间

DFI-2A 在 `packages/contracts/src/desktop-local/v1alpha2/` 增加 schema，但不修改当前
`window.robothreeDesktopV1Alpha2` 三成员 sidecar，也不注册 HTTP/IPC route。

建议新增：

```text
TaskAuthorizationMode
AuthorizationPreferenceV1Alpha2
ResolvedTaskAuthorizationV1Alpha2
TaskSelectionRequestV1Alpha2
SubmitTurnCommandV1Alpha2
RuntimeSelectionSummaryV1Alpha2
SubmitTurnReceiptV1Alpha2
SubmitTurnStatusQueryV1Alpha2
```

DFI-2B 再单独评审 transport、feature negotiation 和 sidecar additive 方法；Contract schema 存在不等于
Renderer 已能调用，也不得提前把当前只读选择器改成可点击。

### 4.4 模式策略是固定 Snapshot，不建设 Policy Engine

新增 Core-private `TaskAuthorizationModePolicyProvider` 或等价 Port，首期只返回一个冻结 Snapshot：

```text
policyId
policyRevision          // canonical SHA-256
supportedModes          // 首期三种模式
legacyDefaultMode       // smart_confirm
createdAt
```

规则：

- v1alpha2 requested mode 必须存在且在 supportedModes 中；
- requested mode 不可用时直接类型化拒绝，不静默降级；
- v1alpha1 只允许使用 Snapshot 声明的 legacy default；
- legacy default 缺失或 Snapshot digest 不合法时 Core readiness/SubmitTurn 失败关闭；
- DFI-2A 不实现组织策略、用户例外、实时撤销、复杂优先级或 Admin 配置页面。

### 4.5 授权选择是独立持久事实

新增 Core/Contract 事实：

```text
TaskAuthorizationSelection
├── schemaVersion
├── taskId
├── runtimeSelectionId
├── requestedMode
├── resolvedMode
├── policyRevision
├── source: user_selected | legacy_default
├── createdAt
└── authorizationSelectionDigest
```

约束：

- 首期 `resolvedMode === requestedMode`；未来若需要管理员只允许部分模式，仍是“不支持即拒绝”，
  不加入静默降级；
- `source=user_selected` 只能来自通过 strict v1alpha2 Contract 的明确请求；
- `source=legacy_default` 只能来自 v1alpha1 请求或历史数据回填；
- record 不包含用户正文、文件路径、Tool 参数、Confirmation payload、Credential 或 Runtime Handle。

### 4.6 不改写 TaskRuntimeSelection，增加组合执行选择 identity

既有 `TaskRuntimeSelection.selectionDigest` 已被 Model、Compaction、Prompt Cache、CapabilityLock 和
恢复链使用，不在 DFI-2A 改变其含义。

新增：

```text
TaskExecutionSelectionIdentity
├── taskId
├── runtimeSelectionId
├── runtimeSelectionDigest
├── authorizationSelectionDigest
└── executionSelectionDigest
```

派生公式：

```text
executionSelectionDigest = sha256(canonical-json({
  schemaVersion,
  taskId,
  runtimeSelectionId,
  runtimeSelectionDigest,
  authorizationSelectionDigest
}))
```

因此：

- Agent/Model/Tool 等选择不变但授权模式变化时，`runtimeSelectionDigest` 不变，
  `executionSelectionDigest` 必须变化；
- 同一 Task 的授权模式不能被替换；
- DFI-2B 的确认模式和确认复用必须绑定 `executionSelectionDigest`，不能只看旧
  `runtimeSelectionDigest`；
- 不修改现有 ARH/Compaction/Prompt Cache 使用的 RuntimeSelection digest 语义。

### 4.7 accepted record 锁定授权计划，恢复不重新选模式

新 SubmitTurn coordination record 版本必须保存：

```text
authorizationSelectionDigest
executionSelectionDigest
requestedMode
resolvedMode
policyRevision
source
```

accepted 之后：

- 不读取新 policy revision 后重新解析；
- 不因为应用重启而改用新的默认值；
- exact policy implementation 不可用时失败关闭或等待外部依赖，不改写已接受事实；
- 同 command/clientTurn 重放必须得到相同 Receipt；模式或 policy facts 不同则 idempotency conflict。

### 4.8 Task bundle 原子边界保持真实

Task bundle 单事务新增 `TaskAuthorizationSelection`，一次提交：

```text
TaskHead
+ initial Checkpoint
+ CapabilityLocks
+ TaskRuntimeSelection
+ TaskAuthorizationSelection
+ TaskSubmitTurnBinding
```

Conversation Message 和最终 SubmitTurn Receipt/Delivery 仍由既有 coordinator 的前后事务提交。
本计划不得把它们描述为一个跨阶段原子事务；正确性由 durable state transition、幂等与恢复保证。

既有 `TaskSubmitTurnBinding.bundleDigest` 保持原有基线事实含义，不为历史记录重新计算。新授权事实通过
`authorizationSelectionDigest` 和 `executionSelectionDigest` 独立校验；Task bundle replay 必须同时
比较原 bundle digest 与授权选择 digest。

---

## 5. Contract 方案

### 5.1 AuthorizationPreference

```text
AuthorizationPreferenceV1Alpha2
├── schemaVersion: "v1alpha1"
└── requestedMode: manual_review | smart_confirm | task_scoped
```

`schemaVersion` 是授权偏好对象自身版本，不以缺失字段表示默认。未知 mode、额外字段或缺失字段全部拒绝。

### 5.2 ResolvedTaskAuthorization

```text
ResolvedTaskAuthorizationV1Alpha2
├── requestedMode
├── resolvedMode
├── policyRevision
├── source
└── authorizationSelectionDigest
```

Renderer-safe Projection 只返回枚举、revision 和 digest，不返回策略正文、规则表达式或确认 payload。

### 5.3 SubmitTurn v1alpha2

`SubmitTurnCommandV1Alpha2` 复用 v1alpha1 的业务字段，但使用 v1alpha2 command metadata，并在
`selectionRequest` 中强制包含 `authorizationPreference`。

`SubmitTurnReceiptV1Alpha2` 至少返回：

```text
既有 receipt identity/status
+ RuntimeSelectionSummaryV1Alpha2
  ├── 既有 runtime selection 摘要
  ├── resolvedAuthorization
  └── executionSelectionDigest
```

不得把 `policyRevision` 或 `source` 只放在日志中；它们必须是 receipt/task projection 可恢复事实。

### 5.4 SubmitTurn coordination 版本

新增 coordination record schema version，能够表示 normalized authorization plan。读取端必须支持：

- 已存在的 v1alpha1 coordination record；
- 新 v1alpha2 coordination record；
- 未知较新 record version 失败关闭。

历史 v1alpha1 in-flight record 恢复时只能生成 `smart_confirm + legacy_default`，不得伪造
`user_selected`。

---

## 6. Core Application 方案

### 6.1 TaskAuthorizationSelectionService

建议新增纯 Application Service：

```text
输入：
- taskId / runtimeSelectionId / runtimeSelectionDigest
- explicit authorizationPreference 或 legacy request marker
- exact TaskAuthorizationModePolicySnapshot
- createdAt

输出：
- TaskAuthorizationSelection
- TaskExecutionSelectionIdentity
```

服务必须：

- strict parse；
- 验证 Snapshot digest；
- 验证 explicit mode 支持情况；
- 生成 source；
- 计算两个 digest；
- 无 I/O、无 Renderer 文案、无风险动作判断。

### 6.2 SubmitTurnCoordinator 接入

新请求流程：

```text
解析 v1alpha1 或 v1alpha2 Command
→ 保持各自原始 request digest
→ 解析 Runtime Selection
→ 解析并锁定 Authorization Selection
→ accepted record 保存 exact plan
→ append prepared user message
→ Task bundle 单事务提交 Runtime + Authorization Selection
→ final Receipt/Delivery 提交
→ Agent Loop 启动
```

要求：

- v1alpha1 公开 Receipt 形状不变；
- v1alpha2 Receipt 返回 resolved authorization；
- Coordinator 不执行 Tool 风险决策；
- 已接受记录恢复时从持久计划重建，不从当前 UI 或默认值推断；
- `failed_terminal` 仍只允许发生在 Task 创建前的确定性失败。

### 6.3 RuntimeSelectionService 边界

`RuntimeSelectionService` 继续只负责 Agent/Model/Skill/Tool/Knowledge/Workspace 解析，不把授权模式
塞入 Capability Registry 或 CapabilityLock。

授权选择由 SubmitTurn orchestration 在 RuntimeSelection 产生后组合，二者通过 exact taskId、
runtimeSelectionId 和 digest 绑定。

---

## 7. Persistence 与 migration 22

### 7.1 新表

建议 migration 名称：

```text
id: 22
name: dfi_2a_task_authorization_selection
```

新增：

```text
task_authorization_selections
├── task_id TEXT PRIMARY KEY FK task_heads
├── runtime_selection_id TEXT UNIQUE FK task_runtime_selections
├── requested_mode TEXT CHECK (...)
├── resolved_mode TEXT CHECK (...)
├── policy_revision TEXT
├── resolution_source TEXT CHECK ('user_selected','legacy_default')
├── authorization_selection_digest TEXT
├── execution_selection_digest TEXT
├── created_at TEXT
└── record_json TEXT
```

至少增加按 `policy_revision/resolved_mode/task_id` 的稳定索引。不得保存 policy 正文、用户正文或路径。

### 7.2 Port 与 Adapter

扩展 Task Persistence：

```text
commitSubmitTurnTaskBundle(... authorizationSelection)
loadTaskAuthorizationSelection(taskId)
loadTaskExecutionSelectionIdentity(taskId)
loadSubmitTurnTaskBundle(...) // 返回 exact authorization selection
```

InMemory 与 SQLite 必须通过同一 parameterized Conformance；不能只在 SQLite 实现回填/冲突语义。

### 7.3 历史数据回填

migration 22 创建表后，Core 在公开 readiness 之前执行一次事务化 materialization：

```text
读取所有已有 task_runtime_selections
→ 找到缺少授权选择的 Task
→ 使用固定 MVP Snapshot 生成 smart_confirm / legacy_default
→ 计算 authorization + execution selection digest
→ 原子插入
→ 全量引用与 digest 校验
→ 才允许 Core ready
```

规则：

- 同一输入多次执行结果相同；
- 已有完全一致记录 no-op；
- 已有不同记录 conflict 并阻止 ready；
- 中途故障整批回滚，下次启动重试；
- 不修改历史 `TaskRuntimeSelection.selectionDigest`、SubmitTurn binding 或 Receipt；
- 该回填选择与当前既有确认行为最接近，但 source 明确为 `legacy_default`；
- 不把历史任务冒充为用户主动选择。

### 7.4 Schema preflight

更新 required table/columns，并验证：

- fresh database `0 → 22`；
- `21 → 22`；
- 历史 Task/RuntimeSelection/SubmitTurn binding 数据保留；
- table/column/index/check constraint 缺失失败关闭；
- schema `>22` 失败关闭；
- migrations `1～21` 的 ID、name、SQL 与既有预期不改写。

如果编码前 migration `22` 已被其他用户授权批次占用，必须停止并回到文档评审；不得静默改为 23。

---

## 8. 幂等、并发与恢复

### 8.1 幂等 identity

| 场景 | 结果 |
| --- | --- |
| 同 commandId + clientTurnId + 同完整 v1alpha2 request | replay 同一 receipt |
| 同 commandId 或 clientTurnId、不同 requested mode | `submit_turn.idempotency_conflict` |
| 同 Task/runtime selection、不同 authorization digest | persistence conflict |
| 同授权事实、字段顺序不同 | canonical digest 相同 |
| v1alpha1 与 v1alpha2 复用同 command/clientTurn | request digest 不同，conflict |
| policy revision 在 accepted 后变化 | 使用 accepted exact plan，不重新解析 |

### 8.2 七个命名故障窗口

| 窗口 | 持久事实 | 恢复语义 |
| --- | --- | --- |
| A1：授权解析后、accepted record 前 | 无 record | 安全重试；重新读取当前 policy |
| A2：accepted record 后、Message append 前 | exact authorization plan 已持久 | 重放 append，禁止换 mode/revision |
| A3：Message append 后、Task bundle 前 | Message + exact plan | 重建同一 Runtime/Authorization Selection |
| A4：Task bundle 事务中 auth insert 前后崩溃 | 整个 bundle rollback 或完整 commit | 不允许半个 Task/半个 auth row |
| A5：Task bundle commit 后、record transition 前 | bundle 完整 | load exact bundle 后推进，不重复创建 |
| A6：record task_committed 后、Receipt commit 前 | Task/selection 完整 | 生成同一 v1alpha1/v1alpha2 receipt |
| A7：Receipt commit 后响应丢失 | receipt/delivery 完整 | query/replay 返回同一 resolved facts |

另需覆盖 migration backfill 中途进程崩溃：事务回滚、close/reopen 后重新 materialize，不产生部分行。

### 8.3 并发

- 同 command mailbox 保持单写者；
- commandId/clientTurnId 双 identity 冲突保持现有语义；
- 两个进程/连接并发 materialize 同一历史 Task，最终只允许一个相同事实；
- 不允许 last-write-wins 覆盖 Task authorization selection；
- DFI-2A 不新增跨 Task 共享确认缓存。

---

## 9. Typed Error 与安全边界

建议错误码：

```text
authorization.mode_invalid
authorization.mode_unsupported
authorization.policy_unavailable
authorization.policy_digest_mismatch
authorization.selection_drift
authorization.selection_conflict
authorization.selection_missing
authorization.execution_selection_digest_mismatch
```

要求：

- 不将 schema issue、内部 stack、policy 正文或 SQL 暴露给 Renderer；
- unsupported 与 unavailable 分离；
- mode 不受支持不得 retry 为另一个模式；
- 临时 policy provider unavailable 可以 retry，但 accepted plan 不得重新解析；
- 日志、Trace、Fixture、QA Evidence 只允许 mode 枚举、revision/digest、状态、计数和 typed code；
- 禁止记录用户正文、Prompt、Tool 参数、文件内容、路径、Credential、Token 或 Confirmation payload。

---

## 10. 开发批次

### DFI-2A.1：Contract 与纯解析

交付：

- authorization mode/preference/resolution/selection/identity schemas；
- Desktop Local v1alpha2 SubmitTurn schemas；
- coordination v1alpha2 record schema 与 v1alpha1 read compatibility；
- fixed MVP policy snapshot + fake provider；
- `TaskAuthorizationSelectionService`；
- Contract/Fake/纯函数 Conformance。

禁止：migration、生产 SubmitTurn 接入、HTTP/Main/Preload/Renderer。

退出：独立 QA PASS + 用户接受后，才可进入 DFI-2A.2。

### DFI-2A.2：migration 22 与 Persistence

交付：

- migration 22、required schema preflight；
- InMemory/SQLite task authorization selection；
- Task bundle 原子提交；
- 历史 legacy materialization；
- fresh/upgrade/backfill/close-reopen/concurrency Conformance。

禁止：生产确认行为、Desktop transport、Renderer。

退出：独立 QA PASS + 用户接受后，才可进入 DFI-2A.3。

### DFI-2A.3：SubmitTurn 编排与恢复

交付：

- v1alpha1 legacy normalization；
- v1alpha2 authorization-aware Core SubmitTurn；
- exact accepted plan、组合 identity、Receipt projection；
- A1～A7 崩溃恢复 Harness；
- 全量回归与 DFI-2A 关闭证据。

禁止：HTTP/Main/Preload/Renderer、风险矩阵和确认复用。

退出：独立 QA PASS + 用户接受后，DFI-2A 才可关闭；DFI-2B 仍需单独方案复核和授权。

---

## 11. 文件所有权与修改边界

### 11.1 预计允许修改

```text
packages/contracts/src/authorization/**
packages/contracts/src/desktop-local/v1alpha2/**
packages/contracts/src/submit-turn-coordination/**
packages/contracts/tests/**

services/core/src/application/**authorization-selection**
services/core/src/application/submit-turn-coordinator.ts
services/core/src/ports/task-persistence.ts
services/core/src/ports/**authorization-policy**
services/core/src/adapters/memory/**
services/core/src/adapters/sqlite/migrations.ts
services/core/src/adapters/sqlite/schema-preflight.ts
services/core/src/adapters/sqlite/sqlite-task-persistence.ts
services/core/src/persistence/submit-turn-bundle-validation.ts
services/core/tests/**

版本文件、CHANGELOG、DEVELOPMENT-LOG、README 和本计划状态
```

### 11.2 禁止修改

```text
apps/desktop/src/renderer/**
apps/desktop/src/main/**
apps/desktop/src/preload/**
apps/desktop/src/shared/foundation-api.ts
services/central-service/**
services/document-worker/**
Kernel reducer
migrations 1～21
依赖与 pnpm-lock.yaml（除非另行评审并授权）
DFI-2B / DFI-3 / DFI-4 生产代码
```

前端窗口可以继续 Renderer 页面工作，但不得在 DFI-2A 完成前把智能授权只读说明改成真实选择器。

---

## 12. QA 验收矩阵

### 12.1 Contract 与解析（1～14）

1. 三个 mode 枚举全覆盖，unknown 拒绝；
2. v1alpha2 authorizationPreference 缺失拒绝；
3. 额外字段 strict 拒绝；
4. v1alpha1 Command/Receipt schema 与 Fixture 不变；
5. v1alpha2 Receipt 返回 resolved authorization 与 execution digest；
6. 三种 explicit mode 均解析为 `user_selected`；
7. v1alpha1 解析为 `smart_confirm / legacy_default`；
8. unsupported mode 不降级；
9. policy missing/invalid digest 失败关闭；
10. legacy default 不在 supportedModes 时失败关闭；
11. 同输入 canonical digest 稳定；
12. mode 改变 authorization digest 必须改变；
13. policy revision 改变 authorization digest 必须改变；
14. selection record 不含正文、路径、Credential、Token、Tool 参数。

### 12.2 组合 identity（15～22）

15. 既有 RuntimeSelection digest 公式不变；
16. 相同 Runtime + 相同 Authorization 产生同 execution digest；
17. 相同 Runtime + 不同 mode 产生不同 execution digest；
18. taskId/runtimeSelectionId 错配拒绝；
19. runtime selection digest 漂移拒绝；
20. authorization selection digest 漂移拒绝；
21. 同 Task 不能替换 authorization selection；
22. DFI-2B 尚未接入前，现有 AuthorizationEvaluator 行为零变化。

### 12.3 Persistence 与 migration（23～38）

23. InMemory/SQLite 同一 Conformance；
24. Task bundle 六类事实单事务成功；
25. auth insert 故障整包 rollback；
26. 同 bundle replay 幂等；
27. 不同 auth digest conflict；
28. load by task/runtime 返回 exact record；
29. fresh `0 → 22`；
30. `21 → 22`；
31. 历史 Task backfill 为 legacy_default；
32. backfill 不修改 RuntimeSelection digest；
33. backfill 同输入重复执行 no-op；
34. backfill 已有冲突记录阻止 ready；
35. backfill 中途故障 rollback + reopen 恢复；
36. schema `>22` 失败关闭；
37. table/column/index/check constraint 缺失失败关闭；
38. migrations `1～21` ID/name/SQL/历史预期零改写。

### 12.4 SubmitTurn、幂等与恢复（39～55）

39. v1alpha1 request digest 与既有结果不变；
40. v1alpha2 request digest 包含 requested mode；
41. 同 command/clientTurn 同请求 replay；
42. 同 identity 不同 mode conflict；
43. v1alpha1/v1alpha2 identity 混用 conflict；
44. accepted record 锁定 exact authorization plan；
45. accepted 后 policy revision 改变不重解析；
46. A1 安全重试；
47. A2 恢复 exact plan；
48. A3 重建同 Runtime/Authorization Selection；
49. A4 无半包；
50. A5 bundle replay；
51. A6 同一 Receipt；
52. A7 响应丢失后 query/replay 收敛；
53. v1alpha1 Receipt 形状不增加字段；
54. v1alpha2 rejected receipt 不伪造 resolved selection；
55. close/reopen 后 mode/source/policy/execution digest 全一致。

### 12.5 安全、架构与回归（56～66）

56. Renderer/Main/Preload/shared API 零修改；
57. 智能授权 UI 仍是只读“待接入”；
58. Core 是唯一 mode resolver；
59. 不新增 Policy Engine、企业审批或 Admin 配置；
60. 不修改 Kernel reducer；
61. 不修改 Central/Document Worker；
62. 不修改依赖/lockfile；
63. 日志、Trace、Fixture、Evidence 敏感扫描 0；
64. Node 24 Workspace 全量门禁；
65. Central online/offline 串行回归；
66. DFI-2B、DFI-3、DFI-4 无超前实现。

---

## 13. 开发者门禁与独立 QA

每个子批次至少执行：

```text
source ~/.nvm/nvm.sh
nvm use 24.13.0
CI=true pnpm run lint
CI=true pnpm exec vitest run <本批专项>
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

要求：

- Workspace、Central online、Central offline 严格串行；
- 独立 QA 必须实际重跑，不接受 digest 或开发者报告代替；
- 测试 Evidence 不记录正文、路径或凭据；
- 子批次只有在独立 QA PASS 且用户接受后才能进入下一批；
- DFI-2A.3 独立 QA 和用户接受前，DFI-2A 不关闭，DFI-2B 不解锁。

---

## 14. 工期与风险

| 批次 | 集中工程工作日 |
| --- | ---: |
| DFI-2A.1 Contract / Resolver | 2～3 |
| DFI-2A.2 migration / Persistence / Backfill | 4～6 |
| DFI-2A.3 Coordinator / Recovery Harness | 2～3 |
| 合计 | **8～12** |

这是工程工作量，不是日历承诺，不包含独立 QA、用户等待和返工。

相比总计划原粗估 `4～6` 天增加的主要原因是：

- 不改写 `TaskRuntimeSelection`，新增组合 identity 和完整 Conformance；
- migration 22 必须处理已有 Task，而不是只验证空库；
- DFI-2A.2 采用 Application Materializer + coverage CAS，不把业务解析塞入 Adapter；
- v1alpha1 in-flight record 与 A1～A7 恢复必须保留；
- 三个子批次分别独立 QA，避免一次性跨 Contract/Persistence/Coordinator 大提交。

主要风险：

| 风险 | 等级 | 处置 |
| --- | --- | --- |
| 历史任务默认来源被误写为 user_selected | P1 | 强制 legacy_default + 回填测试 |
| 修改 RuntimeSelection digest 破坏 ARH/Cache | P1 | 保持旧 digest，新增组合 identity |
| policy revision 在恢复时漂移 | P1 | accepted record 锁定 exact plan |
| migration backfill 半完成 | P1 | readiness 前单事务 materialization |
| DFI-2A 偷跑风险矩阵/UI | P2 | 文件边界、架构扫描与独立 QA |
| 工期高于原粗估 | P2 Schedule | 采用 2A.1/2A.2/2A.3 分批门禁 |

---

## 15. 评审重点

请 Claude Code / MiniMax 重点确认：

1. 使用 Desktop Local v1alpha2 schema、但 DFI-2A 不修改现有三成员 sidecar，是否合理；
2. v1alpha1 strict shape 和 request digest 是否真正保持不变；
3. 历史 Task 固定回填 `smart_confirm / legacy_default` 是否与既有行为兼容；
4. `TaskRuntimeSelection` 不改写、增加授权 sidecar + `executionSelectionDigest` 是否是最小正确方案；
5. DFI-2B 是否应统一绑定 `executionSelectionDigest`，而不是继续只绑定旧 selection digest；
6. Task bundle 原子边界是否描述准确，没有伪造跨阶段事务；
7. accepted record 是否已经锁定足够事实，避免 policy revision 漂移；
8. migration 22 backfill、preflight 与 v1alpha1 in-flight recovery 是否完整；
9. 66 项 QA 是否覆盖幂等、冲突、七窗口与敏感边界；
10. 7～10 个集中工程工作日是否合理；
11. 是否存在新的 P0/P1、公共 Contract 冲突或必须由用户重新决策的产品语义。

---

## 16. 阶段门禁

```text
DFI-0：PASS/CLOSED
DFI-1A：PASS/CLOSED
DFI-1B：PASS/CLOSED
DFI-2A：PASS/CLOSED
DFI-2A.1：PASS/CLOSED
DFI-2A.2：PASS/CLOSED
DFI-2A.3：PASS/CLOSED
DFI-2B：GATED
DFI-3：GATED
DFI-4：GATED
```

后续状态：

```text
DFI-2A 已关闭
→ DFI-2B / DFI-3 / DFI-4 保持 GATED
→ 各阶段必须先完成详细方案评审并获得用户明确授权
```

DFI-2A 的关闭不自动授权 DFI-2B、DFI-3 或 DFI-4。

— Codex 5.6
