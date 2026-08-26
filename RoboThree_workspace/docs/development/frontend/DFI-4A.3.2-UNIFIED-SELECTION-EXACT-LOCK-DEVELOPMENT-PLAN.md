# DFI-4A.3.2 统一选模、精确 Task Lock 与 Composite Resolver 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 上游：DFI-4A.0～4A.2、DFI-4A.3.1 `PASS/CLOSED`  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 架构依据：ADR-011、ADR-013、ADR-013 Addendum A、ADR-015、ARH-1～3、DFI-2A、DFI-4A Revision 1  

本文件定义 DFI-4A.3.2 的实现边界和验收口径。方案已通过差异复核并由用户接受，用户已单独授权
DFI-4A.3.2 编码；实现、独立 QA 与用户接受均已完成，现正式 `PASS/CLOSED`。DFI-4A.3.3 已进入
详细方案文档评审，DFI-4A.4、DFI-2B、DFI-3 与 TGM 继续 `GATED`。

## 1. 批次目标

DFI-4A.3.2 将已经可安全调用的本地个人模型接入 Task 创建前的统一选择与精确锁定链，但不启动真实
Agent Loop。完成后应具备：

1. 企业模型和个人模型的 Core-private 统一候选视图；
2. 对个人模型 active head、exact definition、状态、owner authority、Credential observation 和模型能力的
   确定性 eligibility；
3. 用户偏好、Agent default/override 与显式选择的纯解析结果；
4. 将个人模型 immutable facts 物化为现有标准 `TaskCapabilityLock`；
5. 将个人模型锁与企业 Tool locks、`TaskRuntimeSelection`、授权事实一起交给既有 Task bundle 原子事务；
6. 通过 standard lock 中的 Core-private `configurationRef` 在重启后解析 exact old revision；
7. 企业与个人 Provider 的穷尽式 Composite Resolver，不按 modelId 猜测来源、不静默 fallback；
8. 个人模型进入非终态 Task 后，为更新、删除和 Credential cleanup 提供真实 usage guard。

本批完成后只能声明：

```text
Personal Model Selection / Exact Lock Foundation implemented
```

不能声明个人模型已经通过生产 Agent Loop 执行，也不能声明 Desktop 已支持真实个人模型选择、默认偏好、
CRUD 或 Key reveal。上述运行闭环属于 DFI-4A.3.3，公共 Desktop 接入属于 DFI-4A.4 与后续 DFE 集成批次。

## 2. 当前代码事实

### 2.1 已存在并直接复用

- `RuntimeSelectionService.prepareForTaskBundle()` 是生产 SubmitTurn 在 Message/Task 副作用前准备
  `TaskRuntimeSelection + TaskCapabilityLock[]` 的入口；
- `commitAuthorizationAwareSubmitTurnTaskBundle()` 已在一个 TaskPersistence 事务中提交 Task、model/tool
  locks、runtime selection 与 authorization selection；
- `TaskCapabilityLockSchema` 已固定 definition/binding/descriptor snapshots 和单一 `registryRevision`；
- `validateSubmitTurnTaskBundle()` 要求一个 Task bundle 内所有 model/tool locks 的 `registryRevision` 与
  `TaskRuntimeSelection.registryRevision` 完全相同；
- `TaskCapabilityLockService` 与 `CapabilityResolver` 当前只从企业 Registry Snapshot 解析 definition、binding
  与 descriptor；
- `RuntimeSelectionService` 当前只依赖 `TrustedModelRepository`、`ModelDefinition`、
  `ModelLiveEligibility` 和企业 Capability Resolver；
- `PersonalModelPersistence` 已提供 active heads、immutable definitions、append-only statuses、exact
  preference 和 owner namespace；
- `PersonalModelRuntimeRegistry.resolve()` 已能按 owner、personalModelId、configurationRevision、
  executionDefinitionDigest 读取 exact definition/status；
- DFI-4A.2 已提供 owner authority、Credential `inspect()`/resolve 与删除 guard 接缝；
- DFI-4A.3.1 已提供 `LocalPersonalOpenAiCompatibleModelProvider`、Provider Profile Registry、migration 24
  invocation/Usage facts 与安全 transport；
- `TaskPersistence` 已能列出 Task、读取 Task head 和按 Task 列出 `TaskCapabilityLock`，SQLite 中
  `task_capability_locks(task_id, capability_id)` 已有索引；
- public SubmitTurn v1alpha1/v1alpha2 只有 `requestedModelId`，没有“同时更新默认偏好”的显式命令意图。

### 2.2 代码事实暴露的 6 个集成缺口

#### G1：个人模型 ID 的 Domain 比 Capability ID 更宽

`PersonalModelDefinition.personalModelId` 当前只满足 `NamespacedResourceIdSchema`；标准 model lock 则要求
`CapabilityIdSchema` 且以 `model.` 开头。现有测试遵循 `model.personal.*` 约定，但 Domain 没有强制。

本批不得静默重写 ID。候选和 lock materializer 必须额外验证 `model.*`；不符合的历史配置仍允许 owner
查看、修复或删除，但不得进入候选或 Task lock。

#### G2：个人模型缺少可信 context window 事实

个人模型当前只保存 `text / streaming / tool_calling / vision` 四类粗能力；`ModelDefinition` 的 eligibility
需要完整 `ModelCapabilityFacts`，其中 `contextWindow` 必填。把未知 context window 填成任意数字会伪造能力。

因此不能把个人模型强行伪装成企业 `ModelDefinition`。本批必须使用 Core-private 统一候选联合类型；个人模型
的 context window 保持 unknown。Agent/输入明确要求 `minimumContextWindow` 时，unknown 必须
fail-closed 为 `model.context_window_unknown`。

#### G3：Task bundle 只允许一个共享 registryRevision

父计划曾把 personal local `registryRevision` 描述为独立 lock material digest；但现有
`validateSubmitTurnTaskBundle()` 要求 model 与所有 enterprise Tool locks 共用
`TaskRuntimeSelection.registryRevision`。若 personal lock 写入另一 digest，合法 Task bundle 必然被拒绝。

Revision 3.2 的冻结口径是：

- personal model 不进入企业 Registry Generation；
- personal lock 的 `registryRevision` 仍使用该 Task bundle 已锁定的企业 Registry Snapshot revision，
  仅作为同一 Task 的共同配置 epoch；
- personal model 的真实性与版本完整性由 definition/binding/descriptor revision、lock digest、
  signed `configurationRef`、exact personal definition 与 executionDefinitionDigest 证明；
- 不再创建或声称存在第二个 personal local registry generation。

这不是把个人模型注册进企业 Registry，而是服从现有单一 Task bundle Contract。若评审不接受该解释，必须
回到公共 Contract 评审，不能在编码时绕开 bundle validator。

#### G4：DFI-4A.3.1 Provider identity 尚未等同于标准 Lock identity

当前 personal Provider 校验 `ModelRequest.model.capabilityRevision === executionDefinitionDigest`，且 handle 的
`adapterDescriptorRevision` 使用 profile response projection revision；而标准 Task 请求使用
`definitionSnapshot.revision`，descriptor snapshot revision 则是完整 descriptor material digest。两组 revision
不可能天然相等。

本批必须通过 lock-bound Provider factory 修正：

- resolver 先验证 standard lock 和 signed configurationRef；
- 再加载 exact personal definition/profile；
- Provider 实例显式绑定 lock 中的 capability revision 与 descriptor id/revision；
- Provider 仍独立校验 personal `executionDefinitionDigest`、profile revision 和 definition integrity；
- 禁止通过伪造 Capability revision 或跳过 `validateTaskCapabilityLockRevisions()` 解决不匹配。

#### G5：现有 Agent Contract 没有有序 allowed-model 列表

现有 `AgentDefinitionRevision` 只有 `defaultModelId` 与 `allowModelOverride`，没有产品 Spec 所描述的机器人
有序模型范围。因此本批只能落实当前可证明语义：

- `allowModelOverride=false`：只允许 Agent default；
- `allowModelOverride=true`：允许 exact explicit/preference candidate；
- Agent default 不可用且没有合法 explicit selection 时失败关闭；
- 不伪造“机器人配置顺序中的第一个可用模型”。未来若 Agent Feature Spec 增加有序 allowed-model refs，
  必须另立 Contract/计划接入。

#### G6：SubmitTurn 不表达 preference mutation intent

`requestedModelId` 只能证明本 Task 请求哪个模型，不能证明用户是否要求把它保存为长期默认；它也无法区分
工作台显式选择、已有偏好回填和 Agent 临时 override。

因此 DFI-4A.3.2：

- 可以读取 durable preference 并计算 effective model；
- 不得仅凭 `requestedModelId` 自动写 preference；
- 冻结 Core-private `ModelSelectionIntent` / `PreferenceMutationIntent` 接缝；
- 真正“手动选择后更新默认”的命令与用户可见 partial outcome 留给 DFI-4A.4 safe API/E2E；
- 本批可实现独立 `commitPreference` application service 的 Core conformance，但不得把它偷偷挂到现有
  SubmitTurn wire command。

## 3. 核心内部类型

### 3.1 UnifiedModelCandidate

新增 Core-private discriminated union，不进入 public Contract：

```text
UnifiedModelCandidate
  common:
    authority = central_enterprise | local_personal
    modelId
    displayName
    capabilityFacts
      inputModalities
      outputModalities
      supportsToolCalling
      supportsStreaming
      contextWindow = known(value) | unknown
    selectionState
    safeReasonCode?

  central_enterprise:
    exact ModelDefinition
    enterpriseOrder
    live eligibility facts
    registryRevision

  local_personal:
    ownerIdentity
    exact PersonalModelHead
    exact PersonalModelDefinition
    exact PersonalModelStatusFact
    credentialObservation = matching_present | unavailable | mismatch
```

约束：

- enterprise 顺序只继承 `TrustedModelRepository.listModels()` 返回顺序，不按名称、本地时间或 latency 重排；
- personal 顺序只用于稳定展示/测试，不可成为隐式默认；
- 跨 authority 同 `modelId` 视为 `model.identity_ambiguous`，整个选择请求失败关闭；
- safe candidate 不包含 canonical Endpoint、credentialRef、owner digest、Secret、Binding handle 或 Provider body；
- personal definition 的 `text` 映射为 text input/output，`vision` 只增加 image input，首期不推断 image output
  或 audio；缺少 `text` 的 personal model 不进入 P0 selectable candidate；
- context window unknown 不用 0、1 或 Provider 猜测值代替。

### 3.2 Eligibility

新增 `UnifiedModelEligibilityEvaluator`，复用现有能力比较规则但支持 unknown：

| 事实 | enterprise | personal |
| --- | --- | --- |
| permission | 既有 live userAllowed | Runtime Active owner + entitlement + 离线状态 2/3 |
| enabled/head | 既有 enabled | exact head 必须 active 且指向 exact definition |
| credential | 既有 credentialAvailable | `inspect()` 必须 matching present |
| callable | 既有 callable | profile、definition、status、Credential observation 均可解析 |
| context window | known | unknown；有 minimum 要求即拒绝 |

个人状态矩阵固定为：

```text
selectable: unverified, available, network_failed
blocked: authentication_failed, protocol_incompatible,
         model_not_found, unavailable, permission_denied
```

`network_failed` 允许再次选择并触发未来真实调用；eligibility 不能把它改写成 available。

## 4. ModelSelectionIntentResolver

### 4.1 输入与输出

Resolver 是纯 Application service，不写 Task、不写 preference、不调用 Provider：

```text
input
  exact Agent revision
  requestedModelId?
  durable user preference?
  unified candidates
  input requirements

output
  effective candidate
  selectionSource = explicit | user_preference | agent_default | enterprise_first
  preferenceMutation = none | requires_explicit_safe_command
  safe explanation code?
```

### 4.2 决策顺序

1. 有 `requestedModelId`：
   - 必须存在唯一 eligible candidate；
   - Agent `allowModelOverride=false` 时拒绝，继续保持既有 ADR-011 行为；
   - 返回 `explicit`，但不自动写 preference。
2. 无 explicit 且 Agent 不允许 override：
   - 只检查 exact Agent default；不可用则失败，不扩大范围。
3. 无 explicit 且 Agent 允许 override：
   - durable preference 仍存在、revision/authority 精确匹配且 eligible 时优先；
   - preference stale/不可用时不改写、不删除，只继续后续规则并返回 safe reason。
4. Agent default eligible 时使用 Agent default；
5. 没有有效 preference/default 时，从 Central 权威顺序选择第一个 eligible enterprise candidate；
6. enterprise 没有 eligible candidate、但存在 personal selectable candidate时返回
   `personal_model.explicit_selection_required`，不自动选第一个个人模型；
7. 两类均不可用时返回 `selection.model_unavailable`；
8. 任意路径都不因某个 personal/enterprise candidate 失败而在 Task 创建后切换另一 authority。

说明：第 4 步保留当前 Agent default 事实；第 5 步只在 Agent Contract 允许 override 时成立。本批不声称已经
实现未来“Agent 有序 allowed-model 范围”。

### 4.3 Preference

- personal preference 必须匹配 exact `configurationRevision`；head 变化后旧 preference 为 stale，不指向新 head；
- enterprise preference 继续只锁 modelId，权威 revision 来自当前企业 Catalog；
- preference 读取损坏必须 fail-closed，不静默清空；
- `PersonalModelPreferenceService` 如在本批实现，只接受独立 commandId/requestDigest/expected revision，并复用
  migration 23 的 CAS/Receipt；
- Task bundle 成功与 preference command 成功是两个事实，不互相伪造；DFI-4A.4 必须向用户表达 partial outcome。

## 5. PersonalModelTaskLockMaterializer

### 5.1 Materialization 前置校验

- personalModelId 必须满足 `CapabilityIdSchema` 且以 `model.` 开头；
- owner namespace key/check digest、head、definition、status 和 Provider profile 必须通过各自完整性校验；
- head 必须 active 且指向 definition exact configuration/execution tuple；
- Credential `inspect()` 必须 matching present；
- `lockedAt`、`lockId` 与 shared task `registryRevision` 由调用方明确传入；
- materializer 不读 current preference、不调用 Provider、不创建 Task。

### 5.2 Standard Lock material

`definitionSnapshot`：

- `capabilityId = personalModelId`；
- `name = displayName`，description 使用固定安全说明；
- source 固定为 RoboThree 内置 personal runtime 可信代码包，不表示平台拥有该个人模型；
- model family 使用 provider/protocol 安全枚举，不包含 Endpoint、Credential 或 owner；
- input/output modality 按 §3.1 保守映射；
- contextWindow 未知时省略；
- revision 必须由既有 `createCapabilityDefinition()` 计算。

`bindingSnapshot`：

- binding id 从 personalModelId + configurationRevision 的 domain-separated digest 确定性派生；
- capability ref 指向 exact definition revision；
- adapter descriptor ref 指向内置 personal OpenAI-compatible descriptor exact revision；
- `configurationRef` 使用 §5.3 的 authenticated Core-private ref；
- 不保存 credentialRef 或 canonical Endpoint。

`adapterDescriptorSnapshot`：

- id 固定为 `adapter.model.local-personal-openai-compatible`；
- implementationRef 固定为 endpoint identity 的不透明 safe target ref，不包含 host/path；
- runtimeBoundary 固定为 `in_process`；
- protocol 固定为版本化 `openai_compatible`；
- credentialRef/configurationRef 均不进入 descriptor；
- revision 必须由既有 `createAdapterDescriptor()` 计算。

`TaskCapabilityLock.registryRevision`：

- 使用 Task bundle 已冻结的 enterprise Registry Snapshot revision；
- 它只证明本 Task 的共同配置 epoch，不证明 personal model 属于企业 Registry；
- personal material integrity 由 snapshots、configurationRef 和 lock digest 独立证明。

### 5.3 pmcfg1 configurationRef

使用 Core-private stable ref：

```text
pmcfg1:<base64url(binary payload || hmac)>
```

payload 最小包含：

- ownerScopeNamespaceRevision；
- ownerScopeDigest；
- configurationRevision；
- executionDefinitionDigest。

`personalModelId` 由 lock capabilityId 提供并进入 HMAC material，不在 payload 重复。HMAC：

- 使用 owner namespace key；
- domain 固定 `robothree.personal-model.configuration-ref.v1`；
- 覆盖 schema/domain、personalModelId、payload 全字段；
- ref 总长度必须小于 `StableResourceRefSchema` 512 字节上限；
- decode 前严格验证 prefix、base64url、固定长度和 namespace revision；
- 使用 timing-safe MAC 比较；
- ref 不进入 Desktop Projection、错误、日志、Evidence 或 Model Prompt；
- namespace key 永不进入 ref、Task lock 或测试快照。

本批不新增 lookup table 或 migration 25；exact lookup 由 decoded identity + personalModelId 完成。

## 6. Task bundle 接入

### 6.1 Planner 拆分

为避免把 personal model 塞入企业 `CapabilityResolver`，新增 Core-private：

```text
CompositeModelTaskLockPlanner
  enterprise candidate -> existing TaskCapabilityLockService.prepare()
  personal candidate   -> PersonalModelTaskLockMaterializer.prepare()

Tool locks             -> existing TaskCapabilityLockService.prepare()
```

`RuntimeSelectionService` 只消费统一 candidate + planner result；Tool lock 路径保持不变。

### 6.2 原子性

- personal lock 仍和 Tool locks、Task、RuntimeSelection、Authorization Selection 一次性提交到既有
  `commitAuthorizationAwareSubmitTurnTaskBundle()`；
- 不新增 personal lock 表、不新增第二次补写；
- Task bundle commit 失败时不得留下 Task lock 或 preference mutation；
- replay 必须加载并重算 standard lock、configurationRef 和 RuntimeSelection digest；
- 相同 command/identity 幂等；相同 command 不同 personal exact tuple typed conflict；
- `RuntimeSelectionService.resolveAndPersist()` 与 production `prepareForTaskBundle()` 必须共享同一 selection/
  materialization planner，不能保留两套判断逻辑。

### 6.3 公共 Contract

- 不修改 `TaskRuntimeSelection`、`TaskCapabilityLock`、SubmitTurn v1alpha1/v1alpha2 schema；
- existing `requestedModelId` 足够指定 globally unique `model.*` candidate；
- `RuntimeSelectionSummary` 继续只展示 safe model id/revision，不展示 configurationRef、owner、Endpoint、
  credentialRef 或 adapter internals；
- 若实现中发现必须给 TaskRuntimeSelection 增 authority/configuration revision 字段，立即停止编码并回文档评审。

## 7. CompositeModelProviderResolver

### 7.1 穷尽分派

Resolver 先执行 `validateTaskCapabilityLockRevisions()`，再按完整 marker 组合分派：

```text
enterprise source/package + enterprise adapter id/revision
  -> existing RuntimeAdapterHandles.modelProvider()

official personal-runtime source/package
+ adapter.model.local-personal-openai-compatible exact revision
+ valid pmcfg1 configurationRef
  -> load owner namespace and verify MAC
  -> PersonalModelRuntimeRegistry.resolve(exact tuple)
  -> verify profile + Credential matching present + live authority narrowing
  -> lock-bound LocalPersonalOpenAiCompatibleModelProvider

unknown / mixed / partial marker
  -> fail-closed
```

不能只按 modelId prefix、source.trust 或 adapter id 单字段判断。

### 7.2 Lock-bound Provider factory

为关闭 G4，personal Provider factory 必须显式传入并验证：

- locked capabilityId/revision；
- locked adapterDescriptorId/revision；
- decoded configuration tuple；
- exact personal definition 与 profile；
- Credential Store；
- DFI-4A.3.1 invocation/Usage persistence。

Provider 对 `ModelRequest` 校验 standard locked capability revision；同时 resolver 在实例化前证明该 revision
对应的 definition snapshot 确实由 exact personal execution material 产生。adapter handle 对外暴露 lock
descriptor exact id/revision，不能继续把 profile response revision 冒充 descriptor revision。

### 7.3 实时收窄与恢复

- 新 Task 要求 current active head + selectable status + matching Credential；
- 已锁 Task 恢复使用 pmcfg1 中 exact old revision，不以 current head 替代；
- current head 更新不改旧 lock；
- owner authority 状态 2 允许、状态 3 禁止执行；Central 暂时不可达本身不等于权限失效；
- Credential missing/unavailable、权限收回或 hard status 只阻止执行，不换企业模型；
- Provider handle、Secret、socket 不持久化、不缓存到跨请求 registry。

## 8. Task usage guard

新增基于 TaskPersistence 的真实 `PersonalModelDeletionGuard` 与
`PersonalCredentialReferenceUsage` Adapter：

- 只识别通过 personal marker + valid pmcfg1 ref 的 Task model lock；
- non-terminal Task 引用 exact personal tuple → `in_use/referenced`；
- terminal Task 不阻止删除，但保留历史 lock summary；
- lock/ref 损坏、Task 状态未知、读失败 → `unknown`，保守阻止；
- update cleanup 只有确认旧 credentialRef 不被任何 non-terminal exact lock 引用时才 `unused`；
- SQLite 查询使用既有 task heads + task capability locks 索引，不做无界 JSON 全表加载；
- 如需扩 `TaskPersistence` Port，必须在同一批一次性交付 InMemory + SQLite 双实现和 Conformance，不允许
  Port 半切换；
- 不新增 migration 25，除非评审前代码事实证明现有索引无法满足有界查询。

## 9. 错误语义

新增或复用 Core typed errors：

```text
model.identity_ambiguous
model.personal_id_not_capability_id
model.context_window_unknown
personal_model.explicit_selection_required
personal_model.preference_stale
personal_model.configuration_ref_invalid
personal_model.lock_material_invalid
personal_model.lock_authority_mismatch
personal_model.credential_unavailable
personal_model.in_use_or_usage_unknown
selection.model_unavailable
selection.model_ineligible
selection.model_override_forbidden
```

错误只含 code、retryable 与安全 next action，不含 Endpoint、credentialRef、owner digest、configurationRef、
Provider body、stack 或 Task 正文。

## 10. 修改边界

### 10.1 编码获授权后允许修改

- `services/core/src/application/**`；
- `services/core/src/ports/**`；
- `services/core/src/adapters/memory/**`、`sqlite/**`、`https/**`（仅 lock-bound Provider 接缝）；
- `services/core/src/registry/**`（只新增 composite/private 接缝，不把 personal 写入企业 Registry）；
- `services/core/tests/**`；
- `scripts/run-dfi4a32*.mjs`；
- 版本、CHANGELOG、DEVELOPMENT-LOG、README 只在获授权编码后的独占收口窗口更新。

### 10.2 禁止修改

- public `packages/contracts` production schema；
- migration 1～24；默认不新增 migration 25；
- `apps/desktop/src/main/**`、`preload/**`、`renderer/**`；
- `services/central-service/**`、`services/document-worker/**`；
- Durable Agent Loop、Compaction production wiring；
- DFI-4A.3.3、DFI-4A.4、DFI-2B、DFI-3、TGM；
- 根依赖、`pnpm-lock.yaml`、根 `tsconfig.json`；
- 真实用户 Key、外网 Provider 或费用资源。

若必须突破任一禁止范围，停止编码并回文档评审。

## 11. 实施步骤

### Step 1：统一候选与 eligibility

- `CompositeTrustedModelCatalog`；
- `UnifiedModelCandidate` 联合类型；
- personal active heads/definition/status/authority/credential observation 读取；
- optional context window 与 conservative capability mapping；
- 跨来源 ID conflict 与安全 candidate tests。

### Step 2：选择意图与 preference boundary

- `ModelSelectionIntentResolver`；
- Agent default/override、preference、enterprise first、personal explicit required；
- stale preference 与 no-fallback；
- 冻结独立 preference command 接缝，不接 public SubmitTurn 自动写入。

### Step 3：个人标准 Lock 物化

- `pmcfg1` codec；
- trusted source/package/descriptor constants；
- definition/binding/descriptor materializer；
- shared Task registryRevision；
- exact revision/digest/tamper/size tests。

### Step 4：RuntimeSelection 与 Task bundle

- `CompositeModelTaskLockPlanner`；
- `RuntimeSelectionService` 共享 planner refactor；
- personal model lock + enterprise tool locks + authorization facts 原子提交；
- replay/conflict/restart 与 v1alpha1/v1alpha2 regression。

### Step 5：Composite Resolver 与 usage guard

- exact marker dispatch；
- lock-bound personal Provider factory，修正 capability/descriptor revision identity；
- exact old revision recovery/live narrowing；
- Task-backed delete/credential usage adapters；
- InMemory/SQLite 同一 Conformance。

### Step 6：收口

- focused harness；
- Workspace 与 Central online/offline 严格串行；
- Contract/migration/Desktop/Agent Loop boundary scan；
- 四通道五类 marker 多编码泄漏扫描；
- 版本与治理文档独占收口。

## 12. QA 验收矩阵（72 项）

### 12.1 Candidate / Eligibility（1～18）

1. enterprise 顺序保持；2. personal active heads 有界加载；3. personal exact definition/status 完整性；
4. `model.*` ID 接受；5. 非 Capability personal ID 不可选但可管理/删除；6. 跨 authority 同 ID conflict；
7. safe candidate 无 Endpoint/ref/owner；8. text modality 保守映射；9. vision 只映射 image input；
10. context window unknown 不伪造；11. minimum context + unknown 拒绝；12. unverified selectable；
13. available selectable；14. network_failed selectable；15. 五类 hard status blocked；
16. Credential matching present；17. mismatch/unavailable blocked；18. owner 状态 2/3。

### 12.2 Selection / Preference（19～34）

19. explicit exact candidate；20. explicit unknown rejected；21. override forbidden；22. valid preference 优先；
23. personal preference exact revision；24. stale preference 不改写；25. Agent default eligible；
26. Agent default unavailable fail-closed；27. enterprise first 只用权威顺序；
28. enterprise 空 + personal 可用 explicit required；29. 两类均不可用；30. 不自动选第一个 personal；
31. 不因 failure 换 authority；32. requestedModelId 不自动写 preference；33. independent preference CAS；
34. preference partial outcome 不改 Task lock。

### 12.3 Lock / configurationRef（35～52）

35. standard `TaskCapabilityLock` strict parse；36. definition revision 重算；37. binding revision 重算；
38. descriptor revision 重算；39. source 只证明 trusted runtime code；40. shared task registryRevision；
41. personal 不出现在 enterprise Registry Snapshot；42. pmcfg1 round-trip；43. wrong prefix/length/base64 拒绝；
44. wrong namespace key/MAC 拒绝；45. wrong capabilityId 拒绝；46. tuple tamper 拒绝；
47. ref 小于 512 bytes；48. ref 不含 Secret/Endpoint/credentialRef；49. descriptor 不含 credentialRef；
50. exact old revision materialization 稳定；51. current head 变化旧 lock digest 不变；
52. public Task summary 不泄漏 configurationRef/owner/Endpoint。

### 12.4 Task bundle / Resolver / Usage Guard（53～68）

53. personal model + enterprise tools 共用一份 registryRevision；54. authorization-aware bundle 原子提交；
55. Transaction rollback 无半 lock；56. replay exact；57. same command different tuple conflict；
58. RuntimeSelection digest 稳定；59. resolveAndPersist/prepareForTaskBundle 共用 planner；
60. enterprise resolver route；61. personal exact marker route；62. mixed marker fail-closed；
63. lock-bound capability revision；64. lock-bound descriptor revision；65. profile/execution digest 双重校验；
66. non-terminal Task 阻止删除/cleanup；67. terminal Task 不阻止；68. unknown/corrupt lock 保守阻止。

### 12.5 Boundary / Security（69～72）

69. v1alpha1/v1alpha2 public Contract 与 migration 1～24 零漂移；
70. Main/Preload/Renderer/Central/Document Worker/Agent Loop/Compaction 零改动；
71. canary + credential/endpoint/body/path/configurationRef 四通道多编码泄漏 0；
72. focused、Workspace、Central online/offline 严格串行全绿，无 DFI-4A.3.3/4A.4/DFI-2B/3/TGM 超前。

## 13. 验证门禁

编码获授权后至少执行：

```bash
source ~/.nvm/nvm.sh
nvm use 24.13.0
cd /Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace
CI=true pnpm run harness:dfi4a3.2
CI=true pnpm run lint
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

- 所有正式门禁严格串行；
- 自动化使用 Fake/受控本地 facts，不调用外网、不使用真实 Key；
- 本批没有正式 Provider network E2E，Provider/Agent Loop 运行闭环属于 DFI-4A.3.3；
- Evidence 只允许 count、digest、状态、typed error、duration 和资源指标。

## 14. 工期

| 工作 | 集中工程工作日 |
| --- | ---: |
| Candidate + eligibility + selection resolver | 1.5～2.5 |
| personal lock materializer + pmcfg1 | 1.5～2.5 |
| RuntimeSelection/Task bundle integration | 1.5～2.5 |
| Composite Resolver + usage guard | 1.5～2.5 |
| Harness、回归与收口 | 1～2 |
| 合计 | **7～12** |

相较父计划的 5～8 日上调，原因是当前代码事实暴露了 shared registryRevision、Provider/descriptor revision
identity、unknown context window 与 preference intent 四个必须显式解决的集成问题。该估算不是日历或上线承诺。

## 15. 文档评审问题

请评审者基于当前代码回答：

1. G1～G6 是否与当前代码一致，是否还有未识别的 integration mismatch；
2. personal model 不进企业 Registry、但 personal lock 使用 Task bundle shared registryRevision 是否是当前
   public Contract 下唯一最小方案；
3. personal authority/integrity 由 snapshots + pmcfg1 + exact facts 证明是否足够；
4. unknown context window fail-closed 是否比伪造默认值更正确；
5. 当前 Agent Contract 只落实 default/allowOverride、不伪造 ordered allowed models 是否正确；
6. 不凭 requestedModelId 自动写 user preference、把显式 preference command 留给 DFI-4A.4 是否正确；
7. standard definition/binding/descriptor material 是否泄漏 owner/Endpoint/Credential；
8. pmcfg1 payload/HMAC/长度与 exact old revision recovery 是否完整；
9. lock-bound Provider factory 是否正确关闭 DFI-4A.3.1 capability/descriptor revision mismatch；
10. RuntimeSelection + locks + authorization 继续使用既有原子 Task bundle是否完整；
11. Task-backed delete/credential usage guard 是否应属于本批，现有索引是否足够无需 migration 25；
12. 72 项 QA、7～12 日与修改边界是否可执行；
13. 是否存在必须修改 public Contract/migration/Main/Preload/Central 的事实；
14. 给出 PASS / PASS_WITH_REVISIONS / FAIL 与 P0/P1/P2/P3 发现。

## 16. 门禁状态

```text
DFI-4A.3 Plan   PASS/CLOSED
DFI-4A.3.1      PASS/CLOSED
DFI-4A.3.2      PASS/CLOSED
DFI-4A.3.3      PASS/CLOSED
DFI-4A.3        PASS/CLOSED
DFI-4A.4 Plan   DOCUMENT REVIEW PENDING
DFI-4A.4.0+     CODING GATED

DFI-2B          GATED
DFI-3           GATED
TGM             GATED
```

本方案已通过文档复核、范围内实现、独立 QA 与用户接受，正式 `PASS/CLOSED`；不得自动解锁任何后续批次。
