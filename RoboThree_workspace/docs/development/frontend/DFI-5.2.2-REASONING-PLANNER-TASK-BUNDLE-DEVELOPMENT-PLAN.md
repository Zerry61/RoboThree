# DFI-5.2.2 Planner / Stale CAS / Task Bundle 精确物化详细实施方案

> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 上游：DFI-5.2 Revision 1 计划评审、DFI-5.2.1 独立 QA 与用户接受均已 `PASS/CLOSED`  
> 本批最高输出：`DFI522_REASONING_TASK_BUNDLE_CONFORMANT`  
> 下游：DFI-5.2.3、DFI-5.3～5.4、AAPI-0.3～0.4、TGM、Knowledge Provider 继续 `GATED`

## 0. 目标与结论边界

DFI-5.2.2 只负责把 DFI-5.2.1 已冻结的 `default | max` 请求和 ReasoningModeLock Contract 接入 Core
Application、SubmitTurn coordination、authorization-aware Task bundle 以及 InMemory/SQLite readable union：

```text
SubmitTurn v1alpha3（Application-only）
  → prepare exact Agent / Model / Tool locks（无持久副作用）
  → 从 exact Model lock 证明 Reasoning Profile subject
  → single-load current Profile / support revision
  → stale CAS / strict ReasoningModeLock Planner
  → TaskRuntimeSelection v1alpha2
  → authorization selection
  → durable coordination v1alpha3 accept
  → Message append
  → atomic Task + Capability Locks + Runtime Selection v1alpha2
       + Authorization facts + SubmitTurn binding
  → safe v1alpha3 Receipt
```

本批完成后最多允许声明：

```text
DFI522_REASONING_TASK_BUNDLE_CONFORMANT
```

该输出只证明 Planner、提交瞬间 stale CAS、Task bundle 原子物化和 S1～S7 恢复事实成立，不表示：

- Provider 已发送 Max 参数；
- ModelRequest v1alpha2、Compaction Binding v1alpha2 或 Agent Loop 已消费 ReasoningModeLock；
- production SubmitTurn v1alpha3 route、Main IPC、Preload API 或 Renderer Max 开关已开放；
- 任一真实企业或个人模型拥有 production Reasoning Profile；
- Max capability feature 已 ready；
- DFI-5.2.3、DFI-5.3～5.4 或其他 GATED 线已解锁。

DFI-5.3 完成至少一个真实 Provider 的 exact mapping 前，production composition 必须继续不注册
SubmitTurn v1alpha3。DFI-5.2.2 的 v1alpha3 路径只允许由 Application harness/test fixture 直接调用。

## 1. 当前代码事实与缺口

### 1.1 已冻结且必须复用

1. DFI-5.2.1 已冻结 ReasoningModeLock 四种 strict variant、独立 digest domain 与 exact Model lock binding；
2. `TaskRuntimeSelectionV1Alpha2Schema` 已把完整 ReasoningModeLock 纳入 `selectionDigest`；
3. Desktop SubmitTurn v1alpha3 已冻结 default/max strict union、safe Receipt summary 与四个 typed error；
4. coordination v1alpha3 已保存完整 Reasoning plan，并约束 `plannedRuntimeSelectionDigest === plannedSelectionDigest`；
5. `calculateReasoningSupportRevision()` 已覆盖 exact Profile subject、Profile revision/digest、support 与安全原因；
6. `ReasoningProfileSource.loadExact(subject)` 已是唯一 Profile 读取 Port；不存在 production Profile source；
7. `RuntimeSelectionService.prepareForTaskBundle()` 已能 prepare Model/Tool locks，不在 Task bundle 前单独提交；
8. `commitAuthorizationAwareSubmitTurnTaskBundle()` 已在 InMemory/SQLite 中原子提交 Task、Capability Locks、
   Runtime Selection、Authorization facts 与 SubmitTurn binding；
9. `submit_turn_records.record_json`、`task_runtime_selections.selection_json` 与 Receipt JSON 可承载新版本，
   migration 1～26 无需改变；
10. DFI-5.2.1 已证明 private Contract subpath 不进入 Preload/Renderer/Admin。

### 1.2 编码前必须关闭的实现缺口

| 编号 | 当前事实 | DFI-5.2.2 关闭方式 |
| --- | --- | --- |
| G1 | `SubmitTurnCoordinator` 只 parse/dispatch v1alpha1、v1alpha2。 | 新增 Application-only `submitV1Alpha3()`，不注册 production route。 |
| G2 | `RuntimeSelectionService.prepareForTaskBundle()` 只生成 v1alpha1。 | 新增显式 v1alpha2 prepare 路径，复用同一 base selection preparation。 |
| G3 | Core TaskPersistence Port 仍以根入口 `TaskRuntimeSelection` 表示 v1alpha1。 | Core-private 类型改为 `ReadableTaskRuntimeSelection`，不改公共 Contract 根导出。 |
| G4 | bundle/authorization validator 只调用 v1alpha1 parser/digest helper。 | 统一使用 version-dispatch strict validator，v1 路径行为零漂移。 |
| G5 | InMemory/SQLite load/clone/insert 仍直接 `TaskRuntimeSelectionSchema.parse()`。 | 所有 Task bundle 读写入口改用同一 readable parser + digest/index revalidation。 |
| G6 | recovery 会重新调用 v1 selection preparation。 | v3 recovery 只能使用 durable record 内 exact ReasoningModeLock，不再调用 Planner/Profile source。 |
| G7 | `#authorizationFacts()` 只承认 coordination v1alpha2。 | v1alpha2/v1alpha3 共用同一 authorization-plan materializer，分别绑定各自 selection digest。 |
| G8 | Receipt projector 只覆盖 v1/v2。 | 新增单一 lock-to-safe-summary projector，accepted/replay 返回 v1alpha3 Receipt。 |
| G9 | exact Reasoning Profile subject 尚未从 Task-locked Model 统一证明。 | 新增 Core Application `TaskLockedReasoningProfileSubjectResolver`，禁止按 modelId 猜 authority。 |
| G10 | stale 零副作用只是父计划约束，尚无调用顺序保证。 | Planner 完成并成功后才允许 `prepareMessage()` / coordination accept / Task write。 |
| G11 | production 没有 Reasoning Profile/Provider mapping。 | 继续 feature absent；test-only fixture 不计 production readiness。 |
| G12 | 父计划对本批 4～7 日粗估未覆盖 Port/validator/双 Adapter widening。 | 本详细方案修正为 10～16 个集中工程日。 |

## 2. 冻结架构决策

### 2.1 一个 Planner，不复制 variant 判断

新增唯一 Core Application service：

```text
ReasoningModeLockPlanner
```

Runtime Selection、Coordinator、Persistence、Receipt projector 均不得复制 support/profile/variant 真值表。
Planner 只产生 strict ReasoningModeLock 或 typed failure；它：

- 不写数据库；
- 不 append Message；
- 不调用 Provider；
- 不读取 Experience Preference；
- 不接受 Renderer 自报 Profile、Strategy、timeout 或 subject；
- 不按模型名称、Endpoint、Provider kind 或 Adapter package 猜 Max mapping。

### 2.2 requestedMode 只来自当前 SubmitTurn command

SubmitTurn v1alpha3 已携带显式 `reasoningPreference`。DFI-5.2.2 不读取全局 Preference 来覆盖该值：

- `default` 永远表示本 Task 明确使用模型默认行为；
- `max` 才校验页面观察到的 support/revision；
- Preference 在页面默认选中阶段已经完成体验职责，提交后不是 Task 真相来源；
- Preference update 与 submit 并发不改变 command material。

### 2.3 exact subject 必须由 Task-locked Model 证明

新增 Core-private Application seam：

```text
TaskLockedReasoningProfileSubjectResolver.resolve({
  candidateAuthority,
  modelLock,
  personalOwnerAuthority?
}) -> ReasoningProfileSubject
```

固定规则：

1. `modelCapabilityId/revision` 取自通过 revision/digest 校验的 Model capability lock；
2. `adapterDescriptorId/revision` 取自同一 lock 的 exact descriptor snapshot；
3. enterprise candidate 必须对应非 personal lock，authority=`central_enterprise`；
4. personal candidate 必须通过 `isPersonalModelLock()`、owner namespace 与 `pmcfg1` MAC 校验；
5. personal `executionDefinitionDigest` 只取自验证后的 configurationRef identity；
6. candidate authority 与 lock source 不一致时 fail-closed；
7. 禁止从 modelId 前缀、Renderer、当前数据库单行或 Provider 名称推断 authority/digest。

该 Resolver 只证明 Profile subject，不读取 Profile、不创建 Provider、不解析 Credential。

### 2.4 support linearization 是一次 strict load

对于 `requestedMode=max`：

```text
exact subject
  → ReasoningProfileSource.loadExact(subject) 恰好一次
  → strict schema + profile digest + subject 校验
  → calculateReasoningSupportRevision({ subject, profile? })
  → 与 command observed support/revision 做 exact CAS
```

该 load/validation 是本次 submit 的 support 线性化点。禁止 load 两次、先读 support 再读 Strategy、失败后读取
第二个 Profile fallback，或在 coordination accept 后重新检查 current pointer。

对于 `requestedMode=default`，Planner 不调用 Profile source，Profile source unavailable 也不能阻断 default。

### 2.5 stale 与 unavailable 不合并

- current strict fact 存在且与页面 observation 不一致：`reasoning_selection_stale`；
- Profile source 不可用、返回损坏 material、supported Profile/Strategy 无法 strict 验证：
  `reasoning_profile_unavailable`；
- `reasoning_lock_integrity_invalid` 只用于 durable lock/selection/record 的完整性失败；
- 不得把 Provider 调用错误、timeout、network failure 映射为 support stale/unsupported。

### 2.6 Reasoning lock 不是 capability lock

- `capabilityLocks` 和 `capabilityLockIds` 继续只承载 Model/Tool `TaskCapabilityLock`；
- ReasoningModeLock 只嵌入 Runtime Selection v1alpha2 与 coordination v1alpha3；
- 不新增 Reasoning lock 表，不修改 `task_capability_locks`；
- Task bundle digest 自然覆盖 Runtime Selection 中的完整 Reasoning lock。

### 2.7 readable union 只在 Core-private persistence 边界扩展

TaskPersistence、bundle validator、InMemory/SQLite adapter 内部使用：

```text
ReadableTaskRuntimeSelection = v1alpha1 | v1alpha2
```

Contracts 根入口的 `TaskRuntimeSelectionSchema` 继续只代表 v1alpha1。禁止为了方便而把根入口静默改成 union。

### 2.8 durable accept 后只读 plan

coordination v1alpha3 durable accept 后：

- recovery 使用 record 内 exact ReasoningModeLock；
- 不重新读取 Experience Preference；
- 不重新读取 Reasoning Profile current pointer；
- 不重新生成 Reasoning lock ID/lockedAt/digest；
- reconstructed Runtime Selection 必须与 `plannedSelectionDigest` 完全相同；
- Profile 后续变化不能升级 fallback，也不能降级 `max_applied`。

### 2.9 production 路径继续不可达

本批只新增 Application method、Core-private Port/Adapter 支持与 Harness。禁止：

- 注册 Core private HTTP route；
- 修改 Desktop Main IPC 白名单；
- 修改 Preload/contextBridge；
- 修改 Renderer；
- 在 production bootstrap 安装 Profile fixture 或 v1alpha3 endpoint；
- 用 Fake Profile source 将 production feature 标为 ready。

## 3. Planner 输入、输出与 typed failure

### 3.1 输入

```text
ReasoningModeLockPlanner.plan({
  reasoningPreference: SubmitTurnReasoningPreferenceV1Alpha3
  taskId
  reasoningModeLockId
  lockedAt
  modelLock
  candidateAuthority
  personalOwnerAuthority?
})
```

`reasoningModeLockId` 与 `lockedAt` 由 Coordinator 在 durable accept 前预生成；不是数据库事实，只有随
coordination v1alpha3 accept 成功后才成为 durable identity。

### 3.2 输出

```text
{ ok: true, lock: ReasoningModeLock }

或

{
  ok: false,
  error: RuntimeError(
    reasoning_selection_stale |
    reasoning_profile_unavailable
  )
}
```

Planner 使用 DFI-5.2.1 `createReasoningModeLock()` 生成 digest，不手工拼 lock JSON。

### 3.3 安全错误

| 错误 | retryable | category | 安全语义 |
| --- | --- | --- | --- |
| `reasoning_selection_stale` | false | `configuration` | 页面观察已过期，请重新确认当前模型。 |
| `reasoning_profile_unavailable` | true | `configuration` | 当前模型的 Max 配置暂不可验证。 |
| `reasoning_lock_integrity_invalid` | false | `persistence` | 已锁定的推理配置损坏，失败关闭。 |

错误不得返回 current support revision、Profile/Strategy ID、mappingKind、timeoutPolicyRef、personal execution
digest 或原始异常正文。

## 4. Stale 真值表

严格执行以下顺序：先证明 exact model subject；max 才 single-load Profile；先 strict 验证 current material；再计算
current support revision；最后比较 observation 并物化 lock。

| 请求 | current Profile fact | observation | 结果 |
| --- | --- | --- | --- |
| default | 任意/缺失/Source 不可用 | 无 observed 字段 | `default_passthrough`，Profile load count=0 |
| max | valid supported + exact subject | supported + exact revision | `max_applied`，锁定 exact Profile/Strategy/timeout ref |
| max | valid unsupported + exact subject | unsupported + exact revision | `max_unsupported_default` |
| max | 无 Profile | unknown + 对该 exact subject 计算出的 revision | `max_capability_unknown_default` |
| max | valid unknown Profile | unknown + exact revision | `max_capability_unknown_default` |
| max | 任意 valid fact | support 不同 | `reasoning_selection_stale` |
| max | 任意 valid fact | support 相同但 revision 不同 | `reasoning_selection_stale` |
| max | effective Model/Adapter/personal execution identity 已变化 | 旧 observation | `reasoning_selection_stale` |
| max | Profile current pointer 指向另一个 valid revision | 旧 observation | `reasoning_selection_stale` |
| max | source 抛 unavailable | 任意 | `reasoning_profile_unavailable` |
| max | Profile strict/digest/subject 校验失败 | 任意 | `reasoning_profile_unavailable` |
| max | supported Profile 缺失或损坏 Strategy/timeout ref | supported | `reasoning_profile_unavailable` |

补充不变量：

- valid Profile 改成另一个 valid revision 是 stale，不是 unavailable；
- 同 revision 改 material 会先因 Profile digest 失败而 unavailable；
- source 返回 `undefined` 是“该 exact subject 没有 Profile”，语义为 unknown，不等于 source unavailable；
- unsupported/unknown 是诚实 fallback，不写成 `max_applied`；
- stale/unavailable 都不能自动 fallback default 并继续创建 Task。

## 5. 首次提交固定顺序与零副作用边界

### 5.1 v1alpha3 首次提交

1. strict parse SubmitTurn v1alpha3；
2. 计算完整 requestDigest；
3. commandId/clientTurnId idempotency lookup；
4. 验证 Session/Conversation；
5. 单次捕获 frozen Runtime Selection context；
6. 预生成 Task/Message/Runtime Selection/Capability lock/Reasoning lock/checkpoint IDs 与 `createdAt`；
7. prepare exact Agent/Model/Tool locks，零持久写；
8. 从 exact Model lock 证明 Reasoning Profile subject；
9. Planner 完成 default 或 max stale CAS，生成 strict ReasoningModeLock；
10. 物化 TaskRuntimeSelection v1alpha2；
11. 物化 Authorization Selection/Execution Identity；
12. 验证 planned bundle/selection/authorization/reasoning digest；
13. prepare user Message intent；
14. durable accept coordination v1alpha3 record；
15. append Message；
16. 原子提交 authorization-aware Task bundle；
17. durable v1alpha3 Receipt/Delivery；
18. 本批测试使用 Noop/test-only Loop starter；production v1alpha3 route 仍不存在。

### 5.2 零副作用硬边界

步骤 9 任一 stale/unavailable failure 必须发生在以下计数仍为 0 时：

- prepared/durable Message intent；
- appended Conversation Message；
- coordination record；
- Task/Checkpoint；
- Capability lock；
- Runtime Selection；
- Authorization facts；
- SubmitTurn binding；
- Receipt/Delivery；
- Agent Loop start；
- Provider invocation。

ID/Clock 的内存采样不属于 durable 副作用，但测试不得把它包装成业务成功事实。

### 5.3 idempotency

- existing exact command/clientTurn/requestDigest：继续原 record/Receipt，不再调用 Planner/Profile source；
- same commandId + 不同 reasoning preference/observation：`submit_turn.idempotency_conflict`；
- same clientTurnId + different commandId/material：conflict；
- stale 第一次尝试没有 durable record；用户刷新 observation 后必须使用新的 commandId 重新提交。

## 6. Runtime Selection v1alpha2 精确物化

### 6.1 显式版本化方法

保留现有 v1 路径不改义，新增：

```text
RuntimeSelectionService.prepareForTaskBundleV1Alpha2(...)
```

现有 v1/v2 transport 继续调用 `prepareForTaskBundle()` 并生成 v1alpha1 selection。禁止通过 optional
`reasoningModeLock?` 让同一个方法隐式改变返回版本。

### 6.2 共享 base preparation

两条公开 Application 方法必须复用一个 private base preparation：Agent materialization、Model selection、
Model/Tool lock prepare、Workspace/Skill/Knowledge 校验只实现一次。v1alpha2 路径在 exact Model lock 已准备后调用
Planner，再使用 `createTaskRuntimeSelectionV1Alpha2()`。

### 6.3 首次与恢复输入分离

```text
首次：reasoningPreference + Planner dependencies
恢复：expectedReasoningModeLock（来自 durable v1alpha3 record）
```

恢复分支：

- 禁止调用 Planner/Profile source；
- 验证 lock digest/task/modelLock exact binding；
- 使用 record 内原 lock ID、lockedAt、digest；
- 用原 runtimeSelectionId、capabilityLockIds、createdAt 重建；
- selection digest 必须等于 record.plannedSelectionDigest。

### 6.4 exact candidate/subject 传播

base preparation 内部结果需保留 `UnifiedModelCandidate.authority`，仅供 subject resolver 验证。它不进入公共
Contract，不进入 Receipt，不作为 Provider mapping。禁止后续从 `resolvedModelLock.capabilityId` 重新猜 authority。

## 7. Task bundle 与 Persistence readable union

### 7.1 Core-private Port widening

以下 Core Port 类型改为 `ReadableTaskRuntimeSelection`：

- SubmitTurn Task bundle input/output；
- authorization-aware bundle input/output；
- `loadTaskRuntimeSelection()`；
- `commitTaskRuntimeSelection()` 的内部可读写边界；
- authorization materialization snapshot 中的 runtime selections。

旧调用者继续传 v1alpha1，TypeScript/运行时行为不变。不得从 Contracts 根导出 readable union。

### 7.2 单一 version-dispatch validator

`validateSubmitTurnTaskBundle()` 与 authorization record validator 必须调用：

```text
parseReadableTaskRuntimeSelection()
```

并按 schemaVersion 执行 exact digest 校验。v1alpha2 额外强制：

- nested ReasoningModeLock digest valid；
- lock.taskId = Task；
- lock.modelLockRef = bundled Model lock exact ID/digest；
- Reasoning lock ID 不在 capability lock IDs；
- authorization execution identity runtimeSelectionDigest = v1alpha2 selectionDigest。

### 7.3 InMemory 与 SQLite 同矩阵

所有以下位置必须使用同一 readable validator，禁止 Adapter 各自宽松 parse：

- insert/commit；
- duplicate replay；
- load by Task；
- load SubmitTurn bundle；
- authorization materialization snapshot；
- clone/structuredClone；
- startup/reopen integrity validation。

InMemory 不得假定内存对象可信；SQLite 不得只校验 indexed columns 而跳过 JSON/digest。

### 7.4 SQLite indexed/JSON revalidation

`task_runtime_selections` 现有列保持不变。load 时至少逐项比对：

- runtime_selection_id；
- task_id；
- agent_definition_id/revision；
- resolved_model_lock_id；
- registry_revision；
- selection_digest；
- selection_json 内 schemaVersion 对应 strict material。

ReasoningModeLock 完整 material 只在 `selection_json`，由 nested digest + outer selection digest 双重保护。

### 7.5 bundleDigest 与 coverageDigest

- `TaskSubmitTurnBinding` schema/version 不变；现有 bundleDigest 因包含完整 Runtime Selection，自然覆盖 Reasoning lock；
- authorization coverage digest 继续使用 taskId/runtimeSelectionId/selectionDigest 的既有 material，不因 schemaVersion
  增加而重写历史 v1 coverage digest；
- 不新增第二份 Reasoning bundle digest；
- duplicate replay 必须 exact bundleDigest + authorization facts 一致。

### 7.6 migration 结论

- migration 最大 id 保持 26；
- 不修改 migration 1～26；
- 不增加表、列、索引、Trigger 或 CHECK；
- migration 25/26 历史测试必须继续全绿；
- 若实现发现 JSON 列无法承载 readable union，立即停手回评审，不得新增 migration 27。

## 8. SubmitTurn Coordinator v1alpha3

### 8.1 Application-only 入口

新增：

```text
SubmitTurnCoordinator.submitV1Alpha3(command)
```

返回类型 widening 为 v1/v2/v3 safe Receipt union。该方法存在不等于 feature ready；production Desktop/Core route
与 composition 必须保持零引用。

### 8.2 v1alpha3 record

首次成功 plan 后创建 `SubmitTurnRecordV1Alpha3`：

- selectionRequest 为 v1alpha3 strict material；
- authorizationPlan 与 v1alpha2 相同；
- reasoningPlan 保存完整 ReasoningModeLock + planned selection digest；
- capabilityLockIds 只列 Model/Tool lock；
- requestDigest 覆盖完整 command observation；
- accepted 前再次 strict parse record。

### 8.3 Message 与 accept 顺序

父计划规定 stale 零 durable side effect，同时 coordination 必须在 Message append 前 durable。现有
`prepareMessage()` 是可持久化 intent，因此固定顺序为：

```text
Planner success
  → prepareMessage intent
  → coordination accept
  → appendPreparedMessage
```

测试必须证明 Planner failure 时 `prepareMessage` 未调用；prepareMessage 成功但 coordination accept 失败时，
prepared intent 不得成为 Conversation Message，沿用现有 orphan-safe cleanup/recovery 语义。

### 8.4 Authorization facts

v1alpha3 复用 v1alpha2 authorization plan schema与 materializer，但 execution identity 必须绑定 v1alpha2
Runtime Selection digest。`#authorizationFacts()` 对 v2/v3 显式分支，不得通过结构相似直接 cast。

### 8.5 safe Receipt projector

新增唯一 projector：

| lock resolution | requestedMode | resolvedMode | resolutionReason |
| --- | --- | --- | --- |
| default_passthrough | default | model_default | requested_default |
| max_applied | max | max | applied |
| max_unsupported_default | max | model_default | unsupported |
| max_capability_unknown_default | max | model_default | capability_unknown |

accepted/replayed Receipt 必须含 safe reasoning summary；rejected Receipt 不要求 runtime selection summary。Receipt 不返回
Profile/Strategy/timeout/material。status replay 只读 persisted Receipt，不重新 project current Profile。

## 9. Recovery 与三方一致性

### 9.1 状态恢复

| record status | v1alpha3 恢复行为 |
| --- | --- |
| accepted | append prepared Message；不读 Profile/Preference。 |
| message_appended | 按 record exact IDs + Reasoning lock 重建 v1alpha2 selection；验证 planned digest 后提交 bundle。 |
| task_committed | load bundle，验证 record/selection/reasoning/authorization 四方一致，再完成 Receipt。 |
| completed | replay persisted v1alpha3 Receipt；Planner/Profile load count=0。 |
| failed_terminal | replay原 terminal error/Receipt；不重新 fallback。 |

### 9.2 三方/四方校验

至少同时验证：

1. record.reasoningPlan.reasoningModeLock = selection.reasoningModeLock exact canonical material；
2. record.plannedSelectionDigest = selection.selectionDigest；
3. selection.reasoningModeLock.modelLockRef = bundled Model lock ID/digest；
4. authorization execution identity.runtimeSelectionDigest = selection.selectionDigest；
5. Receipt reasoning lock ID/digest = selection lock ID/digest；
6. capabilityLockIds 与 bundled Model/Tool lock IDs exact ordered match，且不含 Reasoning lock ID。

任一失败返回 `reasoning_lock_integrity_invalid` 或现有 persistence integrity error，禁止按 current Profile 修复。

### 9.3 历史版本

- coordination v1alpha1/v1alpha2 继续原恢复路径；
- Runtime Selection v1alpha1 继续原 validator；
- 历史 Task 不补造 ReasoningModeLock；
- v1/v2 Receipt 不升级为 v3；
- 不以“当前 Preference=default”解释历史 Task，只维持无 DFI-5 lock 的历史语义。

## 10. 并发与崩溃窗口

### 10.1 Submit S1～S7

| 窗口 | 强制结果 |
| --- | --- |
| S1 Preview 后 valid Profile/support 漂移 | stale；所有 durable 计数 0。 |
| S2 base locks prepare 后、Planner 前崩溃 | 无 durable record；重提重新执行 CAS。 |
| S3 Planner 后、coordination accept 前崩溃 | lock 尚非事实；重提可生成新 ID/lockedAt，或因漂移 stale。 |
| S4 coordination accepted 后、Message append 前崩溃 | 从 exact v3 record 继续；Profile load count=0。 |
| S5 Message appended 后、Task bundle 前崩溃 | exact 重建 v1alpha2 selection并原子提交。 |
| S6 Task bundle 后、Receipt 前崩溃 | strict load bundle并生成同一 safe summary。 |
| S7 Receipt 后、后续生命周期前崩溃 | replay Receipt；本批不启动 production v1alpha3 Loop。 |

S8 Agent Loop/Tool/Compaction restart 留 DFI-5.2.3，因为本批尚未实现 ModelRequest/Compaction Binding v1alpha2。

### 10.2 并发 C1～C7

| 窗口 | 强制结果 |
| --- | --- |
| C1 exact same command 并发 | coordination/bundle/Receipt single winner，loser exact replay。 |
| C2 same command 不同 observation | idempotency conflict。 |
| C3 same clientTurn 不同 command | conflict，零第二 Task。 |
| C4 Profile current pointer 与 submit 并发 | single load 是线性化点，只允许 exact plan 或 stale。 |
| C5 Profile source 在 load 后更新 | 已 accept plan不变；下一 command 看到新 revision。 |
| C6 preference update 与 submit 并发 | command requestedMode 唯一，Preference 不参与 Planner。 |
| C7 双 Core recovery | Task bundle/Receipt single winner，loser strict reload，不再读 Profile。 |

禁止 sleep 猜窗口；使用 test-only fault injector、deferred Promise/barrier 与真实 SQLite reopen。

## 11. 文件所有权与边界

### 11.1 编码授权后允许修改

- `services/core/src/application/reasoning-mode-lock-planner.ts`；
- `services/core/src/application/task-locked-reasoning-profile-subject.ts`；
- `services/core/src/application/runtime-selection-service.ts`；
- `services/core/src/application/submit-turn-coordinator.ts`；
- `services/core/src/ports/desktop-reasoning-mode.ts`；
- `services/core/src/ports/task-persistence.ts`、`submit-turn-persistence.ts` 的 Core-private union 类型；
- `services/core/src/persistence/submit-turn-bundle-validation.ts`；
- `services/core/src/persistence/task-authorization-selection-record.ts`；
- `services/core/src/adapters/memory/in-memory-task-persistence.ts`；
- `services/core/src/adapters/sqlite/sqlite-task-persistence.ts`；
- `services/core/src/adapters/memory|sqlite/*submit-turn-persistence.ts` 的 v3 readable Receipt/record 支持；
- 对应 tests、Harness、Evidence、实施报告与治理摘要；
- 如静态边界需要，仅可 additive 更新既有 architecture/audit script。

### 11.2 明确禁止

- 修改 DFI-5.2.1 已冻结 Contract schema/digest/domain；
- 修改 Contracts 根入口语义；
- 修改 migration 1～26或新增 migration 27；
- 修改 Desktop Main、Preload、Renderer、IPC、contextBridge；
- 修改 Admin Console/AAPI；
- 修改 Central、Enterprise Gateway、Document Worker、PTX；
- 修改 Provider Adapter、ModelRequest、Compaction Binding 或 Agent Loop；
- 注册 production SubmitTurn v1alpha3 route；
- 新增 production Reasoning Profile fixture/source；
- 新增依赖或修改 `pnpm-lock.yaml`；
- 修改 root package、workspace、根 tsconfig；
- 进入 TGM、Knowledge Provider、SSO/RBAC 或其他 GATED 线。

若编码发现必须修改禁止范围，必须停止并回文档评审。

## 12. 分步实施计划与估算

| Step | 内容 | 集中工程估算 | 完成门槛 |
| --- | --- | --- | --- |
| 1 | Planner、task-locked subject resolver、stale/unavailable 真值表 | 3～5 日 | truth table + zero-side-effect harness 全绿 |
| 2 | Runtime Selection v1alpha2 preparation、TaskPersistence readable union、双 Adapter | 4～6 日 | InMemory/SQLite 同矩阵、migration 26 上限不变 |
| 3 | Coordinator v1alpha3、safe Receipt、S1～S7 recovery/concurrency | 3～5 日 | real SQLite reopen、single winner、legacy regression 全绿 |

合计 10～16 个集中工程日，不含独立 QA 与返工。该估算替代父计划的 4～7 日粗估。DFI-5.2 全阶段更新为：

```text
DFI-5.2.1  3～5 日（已完成）
DFI-5.2.2  10～16 日
DFI-5.2.3  5～8 日
合计       18～29 日
```

上述 Step 是同一授权批内部顺序，不允许把“只加 production route”或“只让 SQLite 宽松接受 v2”拆成半成品。

## 13. QA 矩阵（96 项）

### 13.1 Planner / truth table / zero side effect（1～24）

1. default 产生 passthrough；2. default Profile load=0；3. default source unavailable 仍成功；
4. max supported exact applied；5. max unsupported exact fallback；6. max missing Profile exact unknown fallback；
7. max unknown Profile exact fallback；8. supported→unsupported stale；9. supported→unknown stale；
10. unsupported→supported stale；11. unknown→supported stale；12. same support revision drift stale；
13. Model capability revision drift stale；14. Adapter revision drift stale；15. personal execution digest drift stale；
16. valid Profile current pointer drift stale；17. Profile source unavailable typed unavailable；
18. Profile schema invalid unavailable；19. Profile digest tamper unavailable；20. Profile subject mismatch unavailable；
21. supported Strategy invalid unavailable；22. stale Message intent=0；23. stale coordination/Task/Receipt=0；
24. unavailable Provider invocation=0。

### 13.2 Subject / lock / selection（25～40）

25. enterprise subject exact Model lock；26. personal subject verifies pmcfg1；27. personal owner mismatch reject；
28. candidate enterprise + personal lock reject；29. candidate personal + enterprise lock reject；
30. modelId cannot choose authority；31. default lock exact Task/Model；32. applied lock exact Profile/Strategy；
33. fallback no Profile/Strategy/timeout；34. reasoning lock nested digest valid；35. nested tamper rejected；
36. Runtime Selection v2 outer digest covers lock；37. reasoning ID not capability IDs；
38. v1 method continues producing v1；39. v2 first prepare exact IDs；40. v2 recovery reuses exact lock identity。

### 13.3 Task bundle / Persistence（41～64）

41. Port accepts v1；42. Port accepts v2；43. v1 bundle digest regression；44. v2 bundle digest covers lock；
45. authorization execution digest binds v2；46. wrong Model ref rejected；47. wrong Reasoning task rejected；
48. reasoning ID in capability list rejected；49. InMemory v1 reopen；50. InMemory v2 reopen；
51. SQLite v1 reopen；52. SQLite v2 reopen；53. indexed runtime ID drift rejected；54. indexed Task drift rejected；
55. indexed Agent drift rejected；56. indexed Model lock drift rejected；57. indexed Registry drift rejected；
58. indexed selection digest drift rejected；59. JSON nested lock tamper rejected；60. duplicate exact replay；
61. duplicate different bundle conflict；62. authorization record mismatch rejected；63. coverage digest v1 zero drift；
64. migration 1～26 zero drift/no 27。

### 13.4 Coordinator / Receipt / recovery（65～84）

65. v1 submit regression；66. v2 submit regression；67. v3 Application-only submit；68. production route count=0；
69. v3 requestDigest includes observation；70. v3 record strict；71. reasoning plan exact planned digest；
72. capability IDs exclude reasoning ID；73. accepted safe default Receipt；74. accepted safe max Receipt；
75. unsupported safe Receipt；76. unknown safe Receipt；77. Receipt excludes private fields；
78. status replay no Profile load；79. S4 accepted recovery；80. S5 Message recovery；81. S6 bundle recovery；
82. completed exact replay；83. failed terminal replay；84. recovery selection/record/Receipt mismatch fail-closed。

### 13.5 Concurrency / legacy / gates（85～96）

85. same command single winner；86. different observation conflict；87. same clientTurn conflict；
88. Profile update barrier linearizes；89. preference update does not affect plan；90. dual Core bundle single winner；
91. v1/v2 coordination fixture zero drift；92. historical Runtime Selection v1 zero drift；
93. DFI-5.1 Preview/Preference regression；94. DFI-2A authorization regression；
95. lint/root/frozen install/Central online/offline 全绿；96. lockfile digest unchanged且 private material bundle 零命中。

测试禁止 `.skip`、`.only`、`@Disabled`、sleep 猜窗口、自动 retry 覆盖失败、硬编码资源计数 0，或以 Fake
Profile/authority 宣称 production ready。

## 14. 开发者与独立 QA 门禁

若未来获得编码授权，至少执行：

```text
Node 24 exact runtime
focused Planner / truth table / subject resolver tests
focused Task bundle InMemory + SQLite conformance
focused SubmitTurn v1alpha3 S1～S7 recovery/concurrency Harness
DFI-5.2.1 Contract/domain regression
DFI-5.1 Preview/Preference/migration regression
DFI-2A authorization regression
historical SubmitTurn / Runtime Selection fixture regression
pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run check
pnpm install --frozen-lockfile --offline
check:central
check:central:offline
```

Central 必须在 JDK 21 + Docker 环境串行补跑；本批不改 Central 不能成为省略理由。

实施报告必须列出：

- production SubmitTurn v1alpha3 route count=0；
- production Reasoning Profile implementation count=0；
- migration 最大 id=26；
- lockfile before/after digest；
- Planner failure 的十类 durable side-effect count=0；
- Profile load count（default=0、max first plan=1、recovery/replay=0）。

## 15. 停手条件

出现任一情况必须停止编码并回文档评审：

1. 需要修改 DFI-5.2.1 Contract 或 digest；
2. 需要 migration 27 或修改 migration 1～26；
3. 需要把 Contracts 根入口 Runtime Selection 改成 union；
4. 需要将 ReasoningModeLock 写入 capability lock 表/数组；
5. 无法在 stale/unavailable 时证明 durable side effects 全 0；
6. recovery 必须重新读取 Preference/Profile 才能重建 bundle；
7. personal subject 只能靠 modelId/Provider 名称猜测；
8. 需要 production SubmitTurn v1alpha3 route 才能完成 Harness；
9. 需要 Provider/ModelRequest/Compaction/Agent Loop 改动；
10. 需要 Desktop、Admin、Central、Document Worker、PTX 改动；
11. 需要新增依赖或修改 lockfile；
12. v1/v2 historical fixture/digest 发生漂移；
13. InMemory 与 SQLite 无法使用同一 strict conformance；
14. supported Profile 损坏时只能 silent fallback default；
15. 发现 root check 失败来自其他并发窗口且不能安全隔离。

## 16. 当前状态与评审请求

```text
DFI-5.0                       PLAN REVIEW PASS/CLOSED
DFI-5.1                       PASS/CLOSED
DFI-5.2                       REVISION 1 PLAN REVIEW PASS/CLOSED
DFI-5.2.1                     PASS/CLOSED
DFI-5.2.2                     PASS/CLOSED
DFI-5.2.3                     DOCUMENT REVIEW PENDING / CODING GATED
DFI-5.3～DFI-5.4              GATED
AAPI-0.3～AAPI-0.4            GATED
TGM / Knowledge Provider      GATED
```

文档评审重点：

1. 是否接受 task-locked subject resolver 的 authority/pmcfg1 证明边界；
2. 是否接受 default Profile load=0、max single-load 为线性化点；
3. 是否接受 stale/unavailable 分类与零 durable side-effect 门槛；
4. 是否接受 TaskPersistence Core-private readable union 且根入口 v1 语义不变；
5. 是否接受 durable accept 后 recovery 不再读取 Preference/Profile；
6. 是否接受 production v1alpha3 route/Provider/Agent Loop 继续不可达；
7. 是否接受 10～16 日详细估算替代父计划 4～7 日粗估。

本方案、编码、开发者门禁、独立 QA 与用户接受均已完成，DFI-5.2.2 正式 `PASS/CLOSED`。该关闭不自动
授权 DFI-5.2.3 编码；DFI-5.2.3 当前仅进入详细方案文档评审。

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
```
