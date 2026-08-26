# DFI-5.2 SubmitTurn v1alpha3 / ReasoningModeLock / Task 精确锁定详细实施方案

> 状态：**REVISION 1 PLAN REVIEW PASS/CLOSED；DFI-5.2.1～5.2.2 PASS/CLOSED；DFI-5.2.3 DOCUMENT REVIEW PENDING / CODING GATED**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 上游：DFI-5.0 计划评审、DFI-5.1 均已 `PASS/CLOSED`  
> 本批最高输出：`DFI52_TASK_REASONING_LOCK_CONFORMANT`  
> 下游：DFI-5.3～5.4、AAPI-0.3～0.4、TGM、Knowledge Provider 继续 `GATED`

## 0. 目标、批次落点与结论边界

DFI-5.2 只把用户在新任务提交时表达的 `default | max` 解析为一个不可变、可恢复、可验证的 Task 运行事实，
并让 main、Tool 后续轮次、Compaction、retry 与 restart 读取同一事实：

```text
SubmitTurn v1alpha3
  → exact effective Model + existing TaskCapabilityLock
  → exact support observation validation
  → ReasoningModeLock
  → TaskRuntimeSelection v1alpha2
  → authorization-aware Task bundle atomic commit
  → ModelRequest v1alpha2 adapter-neutral reasoning material
  → main / Tool / compaction / retry / recovery use the same lock
```

本批完成后最多允许声明：

```text
DFI52_TASK_REASONING_LOCK_CONFORMANT
```

该输出只证明 Task 级锁定、版本兼容、恢复和 adapter-neutral 请求事实成立，不表示：

- 任一生产 Provider 已支持或实际发送 Max 参数；
- Enterprise Gateway v1alpha3 或 Provider-private mapping 已完成；
- Desktop Main / Preload / Renderer 已开放 Max API 或开关；
- `max_reasoning_mode` compatibility feature 已可投影；
- 所有模型均支持 Max；
- Max 会提高质量、速度或固定成本；
- AAPI、TGM、Knowledge Provider 或 production identity 已解锁。

在 DFI-5.3 至少完成一个真实 Adapter 的 exact Profile/Mapping 前，DFI-5.2 新增的 SubmitTurn v1alpha3
生产入口必须保持不可达；现有 SubmitTurn v1alpha1/v1alpha2 与历史 Task 行为不变。

## 1. 当前代码事实

### 1.1 已存在且必须复用

1. Desktop SubmitTurn 当前有 v1alpha1 与 v1alpha2；v1alpha2 已冻结 authorization preference、strict
   Receipt 与 status query；
2. SubmitTurn coordination 当前有 v1alpha1/v1alpha2 readable union，v1alpha2 已持久化 authorization plan、
   planned selection digest、capability lock IDs 与恢复状态；
3. `RuntimeSelectionService.prepareForTaskBundle()` 已先解析 effective Model，再准备 exact Model/Tool
   `TaskCapabilityLock`，且不会在 Task bundle 提交前单独持久化这些锁；
4. `TaskRuntimeSelection v1alpha1` 的 `selectionDigest` 覆盖完整 selection material，SQLite
   `task_runtime_selections.selection_json` 是 JSON 主事实，索引列不含 schema version；
5. `TaskPersistence.commitAuthorizationAwareSubmitTurnTaskBundle()` 已能原子提交 Task、Capability Locks、
   Runtime Selection、Authorization Selection 与 SubmitTurn Binding；
6. `DurableAgentLoopStarter` 在启动/继续/恢复时读取 durable Task bundle，并由同一
   `TaskLockedModelProviderResolver` 服务 main 与 Compaction；
7. `ModelMessageConverter` 与 `ModelBackedCompactionSummarizer` 当前只生成 `ModelRequest v1alpha1`；
8. `CompactionExecutionBinding v1alpha1` 已绑定 runtime selection、Model lock、Registry、Adapter 与
   external target，但尚未绑定 ReasoningModeLock；
9. DFI-5.1 已交付 strict Core-private Reasoning Profile、safe support revision、Preview、独立 Preference、
   migration 26 与 CAS/Receipt；
10. 当前 production composition 没有真实 supported Reasoning Profile/Provider mapping，Renderer/Preload
    也没有 DFI-5 API。

### 1.2 SQLite 可编码性结论

`task_runtime_selections`、`submit_turn_records` 与 Compaction binding 表均以 JSON 保存完整版本化事实，已有
索引列不需要新增 Reasoning 字段；现有 CHECK 也不限制上述 JSON schema version。因此 DFI-5.2：

- 不新增 migration 27；
- 不修改 migration 1～26；
- 通过 strict v1alpha1/v1alpha2/v1alpha3 readable union 与 load-time digest/index revalidation 支持新事实；
- 若编码发现必须新增列、表、索引或修改既有 CHECK，必须停止并回文档评审。

## 2. Revision 1 结构澄清

本详细方案在不改变 DFI-5.0 产品语义的前提下，关闭七个可编码性歧义。

### 2.1 default 与 max 使用 strict discriminated union

显式 `default` 不依赖页面支持态，不应因 Profile 更新被判 stale。因此 SubmitTurn v1alpha3 的
`reasoningPreference` 固定为：

```text
{ requestedMode: "default" }

或

{
  requestedMode: "max"
  observedMaxSupport: "supported" | "unsupported" | "unknown"
  observedMaxSupportRevision: sha256
}
```

`default` 分支禁止携带 observed support/revision；`max` 分支必须完整携带。Renderer 不能提交 Profile、
Strategy、timeout、budget 或 Provider 参数。

### 2.2 timeoutPolicyRef 只属于 `max_applied`

DFI-5.1 的 Profile 只有 `supported` 才携带 Max Strategy 与 `timeoutPolicyRef`。因此：

- `max_applied` 锁定 exact `timeoutPolicyRef`；
- `default_passthrough`、`max_unsupported_default`、`max_capability_unknown_default` 不伪造 Profile 或
  timeout 引用，继续使用该 Provider 已验收的默认 Invocation timeout；
- DFI-5.2 不修改任何 timeout 数值；
- DFI-5.3 若需要 Max 专属 timeout policy，必须验证 exact ref 后才可 dispatch。

### 2.3 coordination 必须新增 v1alpha3 durable plan

仅把 ReasoningModeLock 放入最终 Task Runtime Selection 不足以覆盖“coordination accepted 后、Task bundle
前崩溃”。必须新增 `SubmitTurnRecord v1alpha3`，在第一次 durable accept 时保存完整、安全、不可变的
Reasoning plan。恢复只能读取该 plan，禁止重新读取全局 Preference 或当前 Profile。

### 2.4 ReasoningModeLock 是独立逻辑事实，但嵌入 Runtime Selection

ReasoningModeLock 使用独立 schema/id/digest/domain，不修改通用 `TaskCapabilityLock`；持久化时作为
`TaskRuntimeSelection v1alpha2` 的必填成员进入 `selection_json`，不建第二张 lock 表，不新增 migration。

`capabilityLockIds` 仍只列 Model/Tool `TaskCapabilityLock`，不得把 ReasoningModeLock ID 混入该数组。

### 2.5 Compaction Binding 必须新增 v1alpha2

Compaction 的 immutable execution binding 必须新增 `reasoningModeLockId`、`reasoningModeLockDigest` 与
`modelRequestProtocolVersion=v1alpha2`。历史 v1alpha1 binding 继续读取，不补造 Reasoning lock。

### 2.6 DFI-5.2 不激活半成品生产链

本批可实现完整 Contract、Application、Persistence、Fake/Memory/SQLite conformance 与 process Harness，
但生产 composition 不注册 SubmitTurn v1alpha3 route，不让现有 production Provider 接收 v1alpha2 Max 请求。
测试使用显式 test-only Reasoning Profile 与 Provider consumer，且不得把 fixture 计入 production readiness。

### 2.7 完整锁与执行协议保持 Core-private

ReasoningModeLock、TaskRuntimeSelection v1alpha2、ModelRequest v1alpha2 与 coordination v1alpha3 均含
Strategy/timeout 或完整 durable plan 引用，不属于 Renderer 安全 Projection。它们必须通过独立 Core-private
package subpath 导出，不得从 `@robothree/contracts` 根入口导出；Architecture boundary 必须禁止 Desktop
Preload/Renderer 与 Admin 导入这些 subpath。

Desktop Local v1alpha3 根入口只导出 safe SubmitTurn request、Receipt/status query 与 DFI-5.1 safe Preview；
不导出完整锁、Profile、Strategy 或 timeout material。构建后还必须扫描 Preload/Renderer/Admin bundle，确认上述
私有字段和 domain separator 不可达。

## 3. 允许范围与禁止范围

### 3.1 获编码授权后允许

- `packages/contracts/src/reasoning-mode/**`：在既有 Core-private subpath 新增 ReasoningModeLock v1alpha1；
- `packages/contracts/src/runtime-selection/**`：additive Core-private v1alpha2 与 readable union；
- `packages/contracts/src/desktop-local/v1alpha3/**`：SubmitTurn v1alpha3/Receipt/status query；
- `packages/contracts/src/submit-turn-coordination/**`：additive v1alpha3/readable union；
- `packages/contracts/src/model-protocol/**`：additive Core-private ModelRequest v1alpha2；
- `services/core/src/application/**`：Reasoning planner、SubmitTurn/selection/Loop/Compaction 接缝；
- `services/core/src/ports/**`、`services/core/src/persistence/**`；
- `services/core/src/adapters/memory/**`、`services/core/src/adapters/sqlite/**` 的 union 读取与 conformance；
- 对应 tests、Harness、Evidence、README/CHANGELOG/DEVELOPMENT-LOG。

### 3.2 明确禁止

- 修改 migration 1～26 或新增 migration 27；
- 修改 Desktop Main、Preload、Renderer、IPC、contextBridge 或 compatibility projection；
- 修改 Central、Enterprise Gateway 或企业 Provider Adapter；
- 从 Contracts 根入口导出 ReasoningModeLock、Runtime Selection v1alpha2、ModelRequest v1alpha2 或
  coordination v1alpha3；
- 实现 OpenAI/Anthropic/Personal Provider raw reasoning mapping；
- 注册 production SubmitTurn v1alpha3 route 或宣称 feature ready；
- 使用模型名、Endpoint、Renderer 输入或当前偏好推断 Strategy；
- 把 raw effort/thinking/budget 写入公共 Contract、Task lock、日志、Receipt 或 Evidence；
- 修改 AAPI/Admin Console、TGM、Knowledge Provider、SSO/RBAC；
- 新增依赖，修改 root package、workspace、tsconfig 或 `pnpm-lock.yaml`；
- 删除或改写 v1alpha1/v1alpha2 历史 Contract/fixture/digest。

## 4. ReasoningModeLock v1alpha1

### 4.1 共同基字段

```text
schemaVersion = v1alpha1
reasoningModeLockId
taskId
modelLockRef:
  lockId
  lockDigest
lockedAt
reasoningModeLockDigest
```

`modelLockRef` 只引用既有 exact Model `TaskCapabilityLock`；不复制 definition、binding、adapter snapshot，
也不创建第二套 Model selection。

### 4.2 四种 strict variant

```text
DefaultPassthroughLock
  requestedMode = default
  resolution = default_passthrough

MaxAppliedLock
  requestedMode = max
  observedMaxSupport = supported
  observedMaxSupportRevision
  resolution = max_applied
  profileRef = profileId + profileRevision + profileDigest
  strategyRef = strategyId + strategyRevision + strategyDigest + timeoutPolicyRef

MaxUnsupportedDefaultLock
  requestedMode = max
  observedMaxSupport = unsupported
  observedMaxSupportRevision
  resolution = max_unsupported_default

MaxUnknownDefaultLock
  requestedMode = max
  observedMaxSupport = unknown
  observedMaxSupportRevision
  resolution = max_capability_unknown_default
```

禁止可空字段伪装统一对象。只有 `max_applied` 能携带 Profile/Strategy/timeout；其他三种 variant 的 strict
schema 必须拒绝这些字段。

### 4.3 digest 与完整性

```text
domain = robothree.reasoning-mode-lock.v1\n
material = 除 reasoningModeLockDigest 外的完整 strict variant
digest = sha256(canonical JSON({ domain, material }))
```

验证顺序：strict parse → digest 重算 → taskId 对齐 → modelLock ID/digest 对齐 → variant 联合约束。
任何失败统一 fail-closed，不按字段缺失猜历史版本。

### 4.4 锁定语义

- 一个 Task 恰好零或一个 ReasoningModeLock：历史 Runtime Selection v1alpha1 为零；v1alpha2 恰好一个；
- Task 创建后不能替换、升级或删除锁；
- 全局 Preference、Profile current pointer、Catalog 或模型健康变化不改写既有锁；
- 锁表达“提交时解析事实”，不表达调用是否成功，也不把 Provider 失败改写为 unsupported。

## 5. TaskRuntimeSelection v1alpha2

### 5.1 schema 版本策略

Contracts 根入口保留现有：

```text
TaskRuntimeSelectionV1Alpha1Schema
TaskRuntimeSelectionV1Alpha1MaterialSchema
```

新增 Core-private subpath（禁止 Desktop/Admin 导入）：

```text
TaskRuntimeSelectionV1Alpha2Schema
TaskRuntimeSelectionV1Alpha2MaterialSchema
ReadableTaskRuntimeSelectionSchema = union(v1alpha1, v1alpha2)
```

为避免现有代码被静默改义，Contracts 根入口的旧导出名称继续只指向 v1alpha1；Core 内部显式从 private
subpath 导入 v1alpha2/readable union。禁止直接把现有 `TaskRuntimeSelectionSchema` 改成 union 后让旧业务
无感接受新版本。

### 5.2 v1alpha2 新字段

v1alpha2 完整复用 v1alpha1 material，并新增：

```text
reasoningModeLock: ReasoningModeLockV1Alpha1
```

强约束：

- lock.taskId = selection.taskId；
- lock.modelLockRef = selection.resolvedModelLock 的 exact ID/digest；
- `selectionDigest` 覆盖完整 ReasoningModeLock；
- Model/Tool lock 唯一性规则不变；
- `registryRevision`、personal `pmcfg1` 与 authorization 语义不变。

### 5.3 Persistence 读取与原子提交

- SQLite indexed columns 与 `selection_json` 必须逐字段一致；
- v1alpha1 与 v1alpha2 分别使用自己的 strict validator/digest material；
- Authorization execution identity 继续绑定 `runtimeSelectionDigest`，自然覆盖 Reasoning lock；
- Task bundle transaction 必须同时提交 Capability Locks、v1alpha2 Runtime Selection、Authorization facts、
  Task 与 SubmitTurn Binding；
- 不允许先写 v1alpha1 selection 后 UPDATE 为 v1alpha2；
- InMemory 与 SQLite 必须共用同一 conformance 矩阵。

## 6. SubmitTurn Desktop Local v1alpha3

### 6.1 Command

v1alpha3 复用 v1alpha2 的 command metadata、Task selection 与 authorization preference，新增
`reasoningPreference` discriminated union：

```text
SubmitTurnCommandV1Alpha3
  contractVersion = v1alpha3
  commandId / correlationId / clientInstanceId
  type = submit_turn
  clientTurnId / sessionId / userInput
  selectionRequest:
    agentId / requestedModelId / skillIds / knowledgeIds / workspaceGrantId
    authorizationPreference
    reasoningPreference
```

整个 strict command 进入既有 SubmitTurn request digest。相同 commandId/clientTurnId 只有完整 digest 相同才可
replay；reasoning preference 不同必须 idempotency conflict。

### 6.2 Receipt 与 status query

`SubmitTurnReceiptV1Alpha3` 在 v1alpha2 安全摘要上新增：

```text
reasoning:
  requestedMode = default | max
  resolvedMode = model_default | max
  resolutionReason = requested_default | applied | unsupported | capability_unknown
  reasoningModeLockId
  reasoningModeLockDigest
```

禁止返回 Profile ID、Strategy ID、timeout ref、raw mapping、budget 或内部错误正文。status query replay 必须返回
同一 durable Receipt，不重新解析 Preference/Profile。

### 6.3 typed error

至少冻结：

- `reasoning_selection_stale`：页面观察与提交时 current support revision/status 不一致；
- `reasoning_profile_unavailable`：页面观察 supported，但 exact Profile/Strategy 不可验证；
- `reasoning_lock_integrity_invalid`：durable lock/digest/model binding 损坏；
- `reasoning_protocol_unavailable`：DFI-5.3 未安装，生产入口保持不可达；
- 既有 `submit_turn.idempotency_conflict`、selection/auth 错误保持原语义。

错误只返回安全摘要；不得泄漏 support source、Profile/Strategy material 或 Provider 参数。

## 7. Support 校验与 Reasoning planner

### 7.1 单一 Planner

新增 Core Application `ReasoningModeLockPlanner`，输入仅为：

- v1alpha3 `reasoningPreference`；
- 已准备但尚未提交的 exact Model lock；
- effective model 对应 `ReasoningProfileSubject`；
- 当前 `ReasoningProfileSource`；
- Core clock/id generator。

输出 strict `ReasoningModeLock`，不写数据库、不调用 Provider、不读全局 Preference。

### 7.2 解析真值表

| 请求 | 提交时 current fact | 结果 |
| --- | --- | --- |
| default | 任意 | `default_passthrough`，不读取/比较 observed support |
| max + observed supported | exact same supported revision + valid Profile/Strategy | `max_applied` |
| max + observed unsupported | exact same unsupported revision | `max_unsupported_default` |
| max + observed unknown | exact same unknown revision | `max_capability_unknown_default` |
| max | support/status/revision/subject 任一漂移 | `reasoning_selection_stale` |
| max + observed supported | Profile/Strategy digest 或 subject 不匹配 | `reasoning_profile_unavailable` |

所有失败必须发生在 Message intent、coordination accept、Task、Receipt 等 durable 副作用之前。

### 7.3 线性化与后续 Profile 变化

提交时 current Profile 的一次 strict load/validation 是本次 plan 的线性化点。成功生成并 durable accept 后：

- 后续 Profile current pointer 变化不改写本 Task；
- recovery 不重新执行 support CAS；
- DFI-5.3 必须能按 lock 中 exact ref 读取 immutable mapping；缺失或损坏时 fail-closed，不静默 default；
- unsupported/unknown fallback 锁不因未来 Profile supported 自动升级。

## 8. SubmitTurn coordination v1alpha3

### 8.1 durable record

新增 Core-private `SubmitTurnRecordV1Alpha3`，保留 v1alpha2 全部字段，调整：

```text
schemaVersion = v1alpha3
transportContractVersion = v1alpha3
selectionRequest = TaskSelectionRequestV1Alpha3
reasoningPlan:
  reasoningModeLock
  plannedRuntimeSelectionDigest
```

`reasoningPlan.reasoningModeLock` 必须与 `plannedSelectionDigest` 所指 v1alpha2 selection 完全一致。
`capabilityLockIds` 仍只列 Model/Tool locks。

### 8.2 固定执行顺序

1. strict parse v1alpha3 command；
2. requestDigest/idempotency lookup；
3. 验证 Desktop Session/Conversation；
4. 单次捕获 frozen Runtime Selection context；
5. 准备 exact Agent/Model/Tool locks；
6. 用 exact Model lock 生成 ReasoningModeLock，并完成 stale 检查；
7. 生成 Runtime Selection v1alpha2；
8. 生成 Authorization Selection/Execution Identity；
9. 校验完整 planned bundle digest；
10. durable accept v1alpha3 coordination record；
11. append Message；
12. 原子提交 Task bundle；
13. durable Receipt/Delivery；
14. 启动 lock-bound Agent Loop。

步骤 6 的错误必须在步骤 10 前返回。步骤 10 后禁止重新读取 Preference/Profile 来改变 plan。

### 8.3 恢复

- `accepted/message_appended`：从 v1alpha3 record 的完整 plan 重建同一 bundle；
- `task_committed`：读取 bundle，验证 selection/lock/record 三方 digest，再完成 Receipt；
- `completed`：replay durable Receipt；
- `failed_terminal`：replay existing terminal error；
- v1alpha1/v1alpha2 record 继续原恢复路径，不补造 Reasoning lock。
- durable accept 之前生成的 lock ID、`lockedAt` 与 digest 尚不是事实，崩溃重提时可以生成新的、语义等价的
  plan；只有 v1alpha3 record durable accept 后才要求 exact lock identity/digest 永久复用。

## 9. Model Protocol v1alpha2

### 9.1 版本与子消息

新增 Core-private top-level `ModelRequestV1Alpha2Schema`，不得从 Contracts 根导出。其 messages/tools/artifacts
继续复用已冻结的 provider-neutral v1alpha1 子结构；只有 request envelope 版本升级，不批量改写历史
Conversation Message schema。

### 9.2 reasoning material

```text
reasoning =
  {
    mode: default_passthrough
    reasoningModeLockId
    reasoningModeLockDigest
  }
  |
  {
    mode: locked_max_strategy
    reasoningModeLockId
    reasoningModeLockDigest
    strategyId
    strategyRevision
    strategyDigest
    timeoutPolicyRef
  }
```

`reasoning` 进入 `requestDigest`。default 与两种 fallback 都生成 `default_passthrough`；只有 `max_applied`
生成 `locked_max_strategy`。

禁止：

- 使用 `maxOutputTokens` 表达 reasoning mode；
- v1alpha1 request 携带 reasoning；
- default/fallback 携带 strategy/timeout；
- raw Provider 参数进入 ModelRequest；
- Adapter 按模型名或全局 Preference 临时重算。

### 9.3 DFI-5.2 的 production fail-closed

- 新增 `ReadableModelRequest = v1alpha1 | v1alpha2` 和版本化 digest helper；
- 现有 production Provider 在 DFI-5.3 前不得 silently ignore v1alpha2 reasoning；若内部误达，必须在零上游
  request 前返回 `reasoning_protocol_unavailable`；
- DFI-5.2 Harness 使用 test-only consumer 验证 v1alpha2 material；
- 不允许把“Contract 能解析”写成“Provider 已支持 Max”。

## 10. Agent Loop / Tool / Compaction / Retry / Recovery

### 10.1 单一 materializer

新增 `TaskReasoningRequestMaterializer`，只接受已验证的 Runtime Selection + exact Model lock，生成
ModelRequest v1alpha2 的 adapter-neutral `reasoning`。main 和 Compaction 必须共用该服务，不得复制 variant 判断。

### 10.2 调用矩阵

下列路径必须复用同一 `reasoningModeLockId/digest`：

1. 初次 assistant invocation；
2. Tool result 后下一轮；
3. 用户补充输入/继续任务；
4. initial compaction；
5. rolling compaction；
6. retry；
7. Core restart recovery；
8. terminal replay（零 Provider 调用）。

### 10.3 CompactionExecutionBinding v1alpha2

v1alpha2 在现有 binding 上新增：

```text
reasoningModeLockId
reasoningModeLockDigest
modelRequestProtocolVersion = v1alpha2
```

`bindingDigest` 覆盖新字段。main 授权不得静默扩大给 Compaction；Compaction 仍复用既有 authorization、
Model lock、external target 与 prompt revision，只增加对同一 Reasoning lock 的 exact 绑定。

SQLite binding JSON 可承载 v1alpha2，索引列无需变化；load-time validator 必须使用 v1alpha1/v1alpha2 union。

### 10.4 retry/restart

- retry 读取原 Runtime Selection v1alpha2，不重新查询 Preview、Preference 或 Profile current pointer；
- restart 验证 Runtime Selection、Reasoning lock、Model lock、Authorization 与 Compaction binding digest；
- local personal invocation 继续读取 migration 25 exact deadline，不重新获得 15 分钟；
- DFI-5.2 不增加 retry 次数、Tool round、context/output budget、权限或风险确认；
- output 已开始后的恢复语义沿用 DFI-4A.3.3，不重发、不拼接 partial。

## 11. 并发、崩溃与恢复窗口

### 11.1 Submit S1～S8

| 窗口 | 强制结果 |
| --- | --- |
| S1 Preview 后 support/Profile 漂移 | typed stale；Task/Message/Receipt/coordination 零副作用 |
| S2 Model lock 准备后、Reasoning plan 前崩溃 | 无 durable bundle；同 command 重做并重新执行 CAS |
| S3 Reasoning plan 后、coordination accept 前崩溃 | plan 未持久化；同 command 可生成语义等价的新 plan或因漂移 stale，不承诺相同 lock ID/digest |
| S4 coordination accepted 后、Message 前崩溃 | 从 durable v1alpha3 plan 恢复，不读 Preference/Profile |
| S5 Message appended 后、Task bundle 前崩溃 | 恢复 exact plan；不得提交 v1alpha1 selection |
| S6 Task bundle 后、Receipt 前崩溃 | 读取 exact v1alpha2 selection，生成同一 locked summary |
| S7 Receipt 后、Loop 前崩溃 | replay Receipt并启动同一 lock-bound Loop |
| S8 Loop/Tool/Compaction 中 Core restart | 新进程读取同一 lock；不得换 mode/profile/strategy |

### 11.2 并发 C1～C6

| 窗口 | 强制结果 |
| --- | --- |
| C1 同 commandId + exact material | replay 同一 record/Receipt |
| C2 同 commandId + 不同 reasoning material | idempotency conflict |
| C3 同 clientTurnId + 不同 commandId | conflict，不创建第二 Task |
| C4 Profile pointer 与 submit 并发 | 以 single strict Profile load 为线性化点；只允许 exact lock或 stale |
| C5 preference update 与 submit 并发 | submit 只消费 command 显式 requestedMode；不二次读全局 Preference |
| C6 双 Core 恢复同一 record | Task bundle/Receipt single winner；loser strict reload |

### 11.3 Invocation I1～I5

保持 DFI-4A.3.3 已验收语义：I1 可按既有规则重试；I2 明确 at-least-once 风险；I3/I4 不重发、不拼
partial；I5 replay Message、零 Provider 调用。Max 不提供新的 exactly-once 承诺。

## 12. 分批编码计划

| 子批 | 范围 | 估算 | 最高输出 |
| --- | --- | --- | --- |
| DFI-5.2.1 | ReasoningModeLock、Runtime Selection v1alpha2、SubmitTurn/coordination v1alpha3 canonical Contract 与 conformance | 3～5 日 | `DFI521_REASONING_LOCK_CONTRACT_CONFORMANT` |
| DFI-5.2.2 | Planner、stale 真值表、authorization-aware Task bundle、InMemory/SQLite readable union 与 recovery | 10～16 日 | `DFI522_REASONING_TASK_BUNDLE_CONFORMANT` |
| DFI-5.2.3 | ModelRequest/Compaction Binding v1alpha2、main/Tool/compaction/retry/restart test-only lifecycle Harness 与阶段收口 | 10～17 日 | `DFI52_TASK_REASONING_LOCK_CONFORMANT` |

集中工程合计 23～38 日，不含独立 QA 与返工。该估算替代 DFI-5.0 的 8～13 日粗估；DFI-5.2.2 的
10～16 日详细估算来自 Planner 单次 Profile 线性化、task-locked subject authority、stale 零副作用、
TaskPersistence readable union、SQLite/InMemory 同构与恢复/并发 Harness。详见
[DFI-5.2.2 详细实施方案](./DFI-5.2.2-REASONING-PLANNER-TASK-BUNDLE-DEVELOPMENT-PLAN.md)。
DFI-5.2.3 的 10～17 日详细估算进一步覆盖 Context receipt finalization、Core-private Port widening、
Compaction Binding 双 Adapter conformance 与真实进程 lifecycle Harness，详见
[DFI-5.2.3 详细实施方案](./DFI-5.2.3-MODEL-REQUEST-COMPACTION-LIFECYCLE-DEVELOPMENT-PLAN.md)。

每个子批都必须独立文档差异复核、用户授权、独立 QA 与用户接受；本文件评审通过不自动授权任何编码。

## 13. QA 矩阵（108 项）

### 13.1 Contract / canonical / legacy（1～20）

1. default command union valid；2. default 携带 observed 字段拒绝；3. max 缺 support 拒绝；
4. max 缺 revision 拒绝；5. Reasoning lock default valid；6. max applied valid；
7. unsupported fallback valid；8. unknown fallback valid；9. variant 多余字段拒绝；10. lock digest tamper；
11. model lock ref mismatch；12. private schemas 不从 root 导出且 Desktop/Admin bundle 零命中；
13. Runtime Selection v1alpha1 fixture 零漂移；
14. v1alpha2 selection strict；15. v1alpha2 selection digest；16. SubmitTurn v1alpha1 fixture 零漂移；
17. SubmitTurn v1alpha2 fixture 零漂移；18. v1alpha3 strict parse；19. coordination v1/v2 零漂移；
20. coordination v3 reasoning plan strict。

### 13.2 Planner / stale / zero side effect（21～40）

21. default 无 Profile；22. default 在 supported Profile 下仍 passthrough；23. supported exact max applied；
24. unsupported exact fallback；25. unknown exact fallback；26. supported→unsupported stale；
27. supported→unknown stale；28. unsupported→supported stale；29. unknown→supported stale；
30. support revision drift stale；31. model subject drift stale；32. adapter revision drift stale；
33. personal execution digest drift stale；34. Profile digest tamper unavailable；35. Strategy digest tamper unavailable；
36. same revision altered material fail-closed；37. stale 前 Message intent=0；38. stale 前 coordination=0；
39. stale 前 Task/lock=0；40. stale 前 Receipt/Delivery=0。

### 13.3 Bundle / Persistence / recovery（41～60）

41. Runtime selection lock exact Model lock；42. selection digest covers lock；43. authorization execution digest covers selection；
44. capabilityLockIds 不含 reasoning ID；45. atomic Task bundle；46. InMemory conformance；47. SQLite conformance；
48. indexed/JSON drift fail-closed；49. v1alpha1 selection reopen；50. v1alpha2 selection reopen；
51. S4 accepted recovery；52. S5 message recovery；53. S6 bundle recovery；54. S7 Receipt recovery；
55. completed exact replay；56. failed terminal replay；57. same command exact replay；58. different material conflict；
59. same clientTurn conflict；60. dual Core single winner。

### 13.4 Model Protocol / lifecycle（61～84）

61. ModelRequest v1alpha1 fixture 零漂移；62. v1alpha2 default strict；63. v1alpha2 max strict；
64. default 无 strategy/timeout；65. fallback 无 strategy/timeout；66. max exact strategy/timeout；
67. reasoning enters request digest；68. maxOutputTokens 不表示 Max；69. production v1alpha2 zero-upstream fail-closed；
70. test-only consumer receives exact lock；71. first assistant same digest；72. Tool next round same digest；
73. user continuation same digest；74. initial compaction same digest；75. rolling compaction same digest；
76. retry same digest；77. restart same digest；78. terminal replay zero call；79. preference change no effect；
80. Profile current change no effect；81. Compaction Binding v1 zero drift；82. Binding v2 exact lock；
83. Binding tamper fail-closed；84. main/Compaction share one materializer。

### 13.5 Timeout / authorization / safety（85～100）

85. local personal deadline unchanged；86. restart does not extend deadline；87. enterprise deadline unchanged；
88. Tool round limit unchanged；89. retry count unchanged；90. authorization mode unchanged；
91. workspace scope unchanged；92. risk confirmation unchanged；93. Usage absent remains unknown；
94. timeout does not change support；95. cancel does not change support；96. network failure does not change support；
97. no model/authority fallback；98. no raw mapping in lock；99. no raw mapping in Receipt/log；
100. production feature remains absent。

### 13.6 Process / gates（101～108）

101. deterministic S1 barrier；102. deterministic S4 barrier；103. real Core restart new PID；
104. SQLite reopen exact lock；105. three-round semantic replay digest equal；106. resource counts from real snapshot；
107. full root + lint + boundary + frozen install；108. Central online/offline 串行通过且 lockfile digest 不变。

测试禁止 `.skip`、`.only`、`@Disabled`、sleep 猜窗口、自动重试覆盖失败或硬编码资源计数 0。

## 14. 开发者与独立 QA 门禁

若未来获得编码授权，至少执行：

```text
Node 24 exact runtime
focused Contract/Planner/Persistence/Loop/Compaction tests
DFI-5.1 regression
DFI-2A authorization regression
DFI-4A.3.2/3.3 personal lock + Agent Loop regression
historical Runtime Selection / SubmitTurn / Model Protocol fixture digest checks
pnpm run lint
pnpm run check
pnpm install --frozen-lockfile --offline
check:central
check:central:offline
```

Central 虽非本批修改范围，仍必须在 JDK 21 + Docker 环境串行补跑；不得以“不改 Central”为由省略。

## 15. 停手条件

出现任一情况必须停止编码并回文档评审：

- 需要 migration 27 或修改 migration 1～26；
- 需要原地修改 v1alpha1/v1alpha2 strict schema/digest；
- 需要让 Desktop/Admin 通过 Contracts 根入口或其他公共入口读取完整 Reasoning lock/strategy/timeout material；
- 需要把 ReasoningModeLock 塞进 `TaskCapabilityLock`；
- 需要在 default/fallback 中伪造 Profile、Strategy 或 timeout ref；
- 需要重新读取 Preference/Profile 改写已 accepted 的 durable plan；
- 需要生产 Provider silently ignore ModelRequest v1alpha2；
- 需要注册 production v1alpha3 route 才能完成本批测试；
- 需要进入 Desktop、Central、Provider raw mapping、AAPI、TGM 或 Knowledge Provider；
- 需要新增依赖或修改 lockfile；
- 无法证明 main/Tool/Compaction/retry/restart 复用同一 lock。

## 16. 当前状态与下一步

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

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
```

Revision 1 已通过独立文档复核并由用户正式接受；DFI-5.2.1 与 DFI-5.2.2 的实现、独立 QA 和用户接受均已
完成并 `PASS/CLOSED`。DFI-5.2.3 当前只输出详细方案供文档评审，不构成编码授权；不得自动进入
DFI-5.2.3、DFI-5.3/5.4 或任何 Desktop/Provider 业务实现。
