# R2D-0 Product Revision 2 Core Delta 详细实施总方案

> 状态：**PLAN REVIEW PASS/CLOSED；R2D-1～R2D-3.1 PASS/CLOSED；R2D-3.2 EXACT MATERIAL CONFIRMATION PENDING / CODING GATED**  
> 日期：2026-08-26  
> 负责人：Codex 5.6  
> 计划代号：`R2D`（Product Revision 2 Core Delta）  
> 上游：PRD v1.6 Final Revision 15、Core Prompt / Context Feature Spec Revision 2、Model Experience Revision 4，以及讨论区 `001-用户创建.md`  
> 既有基线：CPC-1～CPC-3 与 CPC 全线 `PASS/CLOSED`；DFI-5.2 `PASS/CLOSED`；DFI-5.3 计划 `PASS/CLOSED / CODING GATED`  
> 本方案最高输出：`R2D_CORE_DELTA_CONFORMANT`  
> 当前结论：**R2D-1～R2D-3.1 PASS/CLOSED；R2D-3.2 `agent.general` docs-only 聚焦确认待评审；R2D-3.2～R2D-4 继续 CODING GATED**

## 0. 结论摘要

产品 Revision 2 新增的四类事实不能作为 CPC 历史实现的“顺手修补”：

1. 每个 Model Invocation 的当前时间、应用语言和操作系统时区；
2. Agent 对 Model、Skill、Tool、Knowledge 的 `unrestricted | allowlist` 四类限制；
3. 首次 `SubmitTurn` 接受时对 Agent、模型和资源的精确原子锁定；
4. Core code-owned、不可编辑且不绑定 scripted model 的 `agent.general`。

本方案将其拆成四个串行批次：

| 批次 | 目标 | 估算 | 编码状态 |
| --- | --- | ---: | --- |
| R2D-1 | Dynamic Request Facts 与 Invocation 级恢复 | 3～5 个集中工程日 | `PASS/CLOSED` |
| R2D-2 | Agent Definition v1alpha2 与四类资源限制 Contract | 3～5 个集中工程日 | `PASS/CLOSED` |
| R2D-3 | Entitlement 决策、Runtime Selection v1alpha3、durable acceptance 与 built-in `agent.general` | 6～10 个集中工程日 | `3.1 PASS/CLOSED；3.2 exact material 确认待评审且编码 GATED；3.3 GATED` |
| R2D-4 | Lifecycle / Compatibility / Security Closure Harness | 1～2 个集中工程日 | `GATED` |
| 合计 |  | **13～22 个集中工程日** | 逐批授权 |

R2D-3 Revision 1 确认当前 SubmitTurn 已有 message / coordination / Task bundle 分阶段持久化和 exact recovery，
产品级原子锁定不要求新建跨 Repository 单一物理事务；改为复用 durable coordination，并把 `task_committed`
冻结为首次 Provider 调用前 barrier。R2D-3 因此修正为 6～10 日，R2D-4 聚焦为 1～2 日，R2D 总工期修正为
13～22 日。详细边界见
[R2D-3 Runtime Selection / Entitlement / Atomic Acceptance 方案](./R2D-3-RUNTIME-SELECTION-ENTITLEMENT-ATOMIC-ACCEPTANCE-DEVELOPMENT-PLAN.md)。

该估算只包含 Core Delta。Desktop Workbench 修复由前端独立批次承担；Agent 草稿、测试、发布、Admin CRUD、
Knowledge Provider、Memory、Effect Reconciliation、DFI-5.3 Provider Mapping 均不计入本方案。

## 1. 目标、成功边界与诚实输出

### 1.1 本期目标

形成以下真实链路：

```text
首次 SubmitTurn
  -> load exact Agent revision
  -> resolve exact four-resource restrictions
  -> load current-user legal-resource snapshot
  -> compute intersection without widening
  -> validate explicit Skill / Knowledge / Model selection
  -> materialize exact Model / Tool locks
  -> atomically persist Task + Runtime Selection + coordination + instruction binding
  -> create first Model Invocation
  -> atomically bind Dynamic Request Facts to that Invocation
  -> produce one request-scoped System Message
  -> existing Context / ModelRequest / Provider path
```

### 1.2 分批最高输出

```text
R2D_DYNAMIC_REQUEST_FACTS_CONFORMANT
R2D_AGENT_RESOURCE_RESTRICTION_CONFORMANT
R2D_CORE_DELTA_CONFORMANT
```

最终 `R2D_CORE_DELTA_CONFORMANT` 必须同时声明：

```text
productionCpcActivationEnabled=false
productionEnterpriseEntitlementReady=false
agentLifecycleReady=false
desktopV2ConsumptionReady=false
adminV2ConsumptionReady=false
knowledgeProviderReady=false
```

### 1.3 不代表以下能力完成

- 不代表 production CPC activation 已开启；
- 不代表 Enterprise SSO、RBAC、真实 production identity 或 enterprise entitlement 已完成；
- 不代表 Agent 创建、草稿、测试、发布、审核或 Admin CRUD 已完成；
- 不代表 Desktop 已消费新版 Agent restriction / Runtime Selection；
- 不代表 Skill Catalog、Knowledge Provider、Memory 或 Effect Reconciliation 已完成；
- 不代表 DFI-5.3 Max raw mapping 或 DFI-5.4 Desktop Max UI 已完成；
- 不代表 `agent.general` 的存在可以绕过 Model、Tool、Workspace、Credential 或用户权限；
- 不输出 `PRODUCTION_READY`、`IDENTITY_COMPOSITION_READY` 或其他下游 ready 结论。

## 2. 既有工程事实与真实缺口

### 2.1 必须保持不变的已关闭事实

1. CPC 已冻结 Platform / Task Boundary / Agent / Skill 的稳定 Instruction Bundle；
2. CPC 每个模型主请求保持恰好一条 `ModelInstructionMessage`；
3. DFI-5.2 已冻结 ReasoningModeLock、TaskRuntimeSelection v1alpha2、ModelRequest v1alpha2 与 coordination v1alpha3；
4. migration 当前止于 26；
5. 现有 root `TaskRuntimeSelectionSchema` 仍只表示 v1alpha1；
6. 现有 v1alpha2 selection 只 additive 增加 ReasoningModeLock；
7. 已关闭 CPC / DFI Contract、digest 与恢复语义不得原地改写；
8. DFI-5.3 仍为独立 Provider-private mapping 线，本方案不读取或暴露 raw reasoning 参数。

### 2.2 当前 Contract 无法表达的产品事实

现有 `AgentDefinitionRevision v1alpha1` 使用：

- `defaultModelId + allowModelOverride`；
- `skillReferences[]`；
- `toolReferences[]`；
- `knowledgeReferences[]`。

其缺口是：

1. 空数组不能区分“未限制”与“明确禁止全部”；
2. `allowModelOverride=true` 不能表达 exact entitlement snapshot 与稳定回退顺序；
3. v1/v2 TaskRuntimeSelection 假设“未显式请求模型时等于 Agent default model”，与 Revision 2 不一致；
4. 当前 Runtime Selection 没有四类 restriction 决策与 entitlement snapshot 的 content-free 证明；
5. 当前 `runtimeFixture()` 中的 `agent.general` 仍与 `model.desktop-scripted` 和 fixture catalog 混合；
6. Context Receipt 没有 Dynamic Request Facts evidence；
7. Model Invocation / Compaction Invocation 恢复没有持久的 exact Dynamic Facts。

### 2.3 为什么不能只改前端

Renderer 只能缩小本地选择，不能成为以下事实的 authority：

- 当前用户合法 Model / Skill / Tool / Knowledge；
- Agent exact revision 与 restriction；
- stable model order；
- Task capability locks；
- Invocation retry/restart 的 exact Dynamic Facts；
- built-in Agent revision/digest；
- Tool candidate policy。

前端修复负责“不自动全选、不回退全局模型、不伪造成功”；本方案负责 Core 的最终验权、交集、锁定、持久和恢复。

## 3. 总体架构

### 3.1 四层事实分离

| 层 | 内容 | 生命周期 | 是否进稳定 Bundle digest |
| --- | --- | --- | --- |
| Task-stable Instruction | Platform、Task Boundary、Agent、selected Skills | Task | 是 |
| Task Runtime Selection | exact Agent / Model / Tool / Skill / Knowledge / Workspace / authorization | Task | 通过既有 selection/bundle digest |
| Dynamic Request Facts | currentTime、locale、timezone | Model Invocation | **否** |
| Provider-private Mapping | reasoning effort / thinking / budget / raw body field | Provider dispatch | 否，继续属 DFI-5.3 |

### 3.2 新增组件

```text
DynamicRequestFactsSource
  ├─ Core Clock
  ├─ ApplicationLocaleSource
  └─ OperatingSystemTimezoneSource

DynamicRequestFactsMaterializer
  -> DynamicRequestFactsV1 + factsDigest

RequestScopedSystemMessageMaterializer
  -> exact CPC bundle + exact Dynamic Facts
  -> one ModelInstructionMessage

AgentDefinitionV1Alpha2Interpreter
  -> legacy v1 or exact v2

TaskResourceEntitlementSource
  -> exact legal-resource snapshot + stable ordinal

AgentResourceDecisionPlanner
  -> restrictions ∩ entitlements ∩ explicit selection

BuiltInGeneralAgentSource
  -> exact code-owned agent.general revision
```

### 3.3 单一 authority 规则

- Agent restriction 只来自 exact Agent revision；
- 用户合法资源只来自 `TaskResourceEntitlementSource`；
- explicit Skill / Knowledge / Model 选择只来自 accepted SubmitTurn；
- stable order 只来自 entitlement snapshot / backend ordering，不由 Renderer 排序；
- Tool final candidate 只来自 Core 的 authoritative tool policy；
- Dynamic Facts 只来自三个 Core-controlled sources；
- Provider Adapter 不重新解释 restriction、entitlement、Agent 或 Dynamic Facts；
- Prompt 文本、Skill 声明、模型输出、Tool Payload 均不能新增资源。

## 4. R2D-1：Dynamic Request Facts

### 4.1 Core-private 数据结构

仅进入 `services/core/**`，不得进入 public Contracts：

```text
DynamicRequestFactsV1
  schemaVersion = "v1"
  invocationKind = "main" | "compaction"
  invocationSubjectId
  currentTime
  locale
  timezone
  sourceRevision
  factsDigest

DynamicRequestFactsEvidenceV1
  schemaVersion = "v1"
  invocationKind
  invocationSubjectId
  factsDigest
  sourceRevision
```

`factsDigest` 使用独立 domain：

```text
robothree.dynamic-request-facts.v1\n
```

digest material 必须覆盖除 `factsDigest` 外的全部字段；不包含 Prompt 正文、Credential、Secret、绝对路径、
Provider raw body 或用户消息。

### 4.2 三个受控来源

#### Core Clock

- `currentTime` 由既有 `Clock.now()` 单次采样；
- 输出必须是 UTC millisecond timestamp；
- 同一 Invocation 不得再次采样；
- retry/restart 不得使用新 `now` 覆盖。

#### Application Locale

- 新增 `ApplicationLocaleSource.requireCurrent()`；
- 当前单语言应用可使用 code-owned、versioned `zh-CN` production source；
- 不接受 Renderer 自报任意 locale、用户 Prompt、模型猜测或 LocalStorage；
- 将来语言切换必须通过受控 composition 更新，不修改历史 Invocation facts。

#### OS Timezone

- 新增 `OperatingSystemTimezoneSource.requireCurrent()`；
- 从 Core 所在系统运行时读取 IANA timezone；
- 用 runtime IANA timezone 支持能力验证；
- 空值、offset-only、非 IANA 值或读取失败返回 typed unavailable；
- 不从用户文本、模型、Renderer 或环境自由字符串猜测。

### 4.3 一条 System Message，不创建第二条高权威消息

R2D-1 不改变 CPC 的“每个模型主请求恰好一条 System Message”：

```text
exact CPC Instruction Bundle message
  + bounded Dynamic Facts block
  -> RequestScopedSystemMessageMaterializer
  -> one ModelInstructionMessage
```

请求级 wrapper 固定：

```text
[RoboThree 本轮可信事实；不授予任何权限]

当前时间：{{request.currentTime}}
界面语言：{{user.locale}}
用户时区：{{user.timezone}}
```

request-scoped message identity：

```text
sourceId = "core.request-context.v1"
sourceRevision = requestContextAssemblyRevision
sourceDigest = digest(
  instructionBundleDigest,
  dynamicFactsDigest,
  exact rendered request-scoped system content
)
```

稳定的 `instructionBundleDigest` 保持不变并单独进入 Receipt；不能把 request-scoped message digest 伪装成新的
Task Instruction Bundle digest。

### 4.4 Context Receipt 增量

`ContextAssemblyReceipt` additive 增加 Core-private evidence：

```text
dynamicRequestFactsEvidence
  invocationKind
  invocationSubjectId
  factsDigest
  sourceRevision

requestScopedSystemMessageDigest
```

Receipt 只记录 content-free evidence，不记录完整 System Message 或 Prompt。

### 4.5 Invocation 级持久与恢复

不得在每次 HTTP retry 时临时生成 facts。R2D-1 使用现有 strict `record_json` 承载 additive readable revision：

- `ModelInvocationLink v2` 绑定 exact `DynamicRequestFactsV1` 与 `contextAssemblyReceiptDigest`；
- `CompactionModelInvocationLink v2` 绑定 exact `DynamicRequestFactsV1` 与
  `contextAssemblyReceiptDigest`；
- InMemory 与 SQLite Adapter 使用同一 strict validator；
- 新 v2 record 必须带显式 `schemaVersion="v2"`；历史无 discriminator 的 exact frozen shape 只识别为
  legacy v1；
- readable adapter 先检查 discriminator 是否存在，再进入唯一版本 validator；禁止“先试 v2、失败后 fallback v1”；
- prepare 时将 request digest、Receipt digest、facts 与 Invocation link 作为一个 material 一次提交；
- replay / restart 只读原 record，不重新采样；
- 新 main round / 新 compaction invocation 才创建新 facts；
- terminal replay 不生成 facts、不重建 request、不调用 Provider；
- historical v1 link 继续按 legacy 规则读取，不 backfill；
- 新 R2D invocation 缺 facts、digest 漂移或 subject 不匹配时 fail-closed。

本批不新增 migration 27。若现有 `record_json` 与严格 validator 无法安全承载 readable v2，必须停止回文档评审，
不得静默新增列、表或 migration。

### 4.6 生命周期顺序

```text
terminal replay check
  -> load existing durable Invocation Link by exact subject
  -> if existing: validate and reuse exact Dynamic Facts
  -> if new: sample Clock/Locale/Timezone once in memory
  -> materialize exact CPC bundle
  -> build one request-scoped System Message
  -> assemble / reduce context
  -> finalize Receipt / ModelRequest and their digests
  -> atomically prepare Link + Facts + Receipt digest + ModelRequest digest
  -> reload/compare the durable winner
  -> resolve Provider / perform upstream I/O
```

在 Link prepare 前 crash 时没有 durable Invocation，恢复可重新开始本次 prepare；在 Link prepare 成功后，
facts、Receipt digest 与 ModelRequest digest 已成为同一个 durable winner，恢复不得重新采样。facts source
失败、digest 漂移、Receipt/request 重建不一致或 record 半写入必须发生在 Credential resolve、DNS、socket、TLS、
HTTP body、Central dispatch、usage projection 之前。

### 4.7 typed errors

新增 Core-private sealed codes：

- `context.dynamic_facts_unavailable`；
- `context.dynamic_facts_invalid`；
- `context.dynamic_facts_drift`；
- `context.dynamic_facts_subject_mismatch`；
- `context.dynamic_facts_budget_exceeded`。

用户安全摘要只表达“本轮受控上下文事实不可用/不一致”；不回显 timezone 原始异常、digest、堆栈或内部路径。

## 5. R2D-2：Agent Definition v1alpha2 与四类限制

### 5.1 additive Contract 与导出边界

新增 Core-private subpath：

```text
@robothree/contracts/runtime-selection/agent-definition/v1alpha2
```

规则：

- root `AgentDefinitionRevisionSchema` 继续只指 v1alpha1；
- v1alpha1 文件、exports、digest corpus 字节零漂移；
- v1alpha2 只能通过明确 private subpath 导入；
- Desktop Renderer / Preload / Admin 不直接导入 runtime definition；
- Admin 将来使用 `admin-control` Projection/Command，不复用 Core runtime DTO。

### 5.2 限制类型

四类资源都使用 strict discriminated union：

```text
ResourceRestriction<T>
  = { mode: "unrestricted" }
  | { mode: "allowlist", references: T[] }
```

语义：

- `unrestricted`：Agent 不新增限制，仍受用户、企业、Workspace、Task、资源状态和 Core policy 约束；
- `allowlist(non-empty)`：只允许 allowlist 与 legal-resource snapshot 的 exact 交集；
- `allowlist(empty)`：
  - Model：草稿语义可表示，但不能测试、发布或创建 Task；
  - Skill / Tool / Knowledge：明确禁止该类资源，Task 可在不需要该资源时运行；
- 空 allowlist 不等于 unrestricted；
- 不允许 `null`、字段缺失、空字符串或旧布尔值在 v2 中代替 mode。

### 5.3 exact reference

```text
AgentModelRestrictionRef
  modelId
  revision
  digest

AgentSkillRestrictionRef
  skillId
  revision
  contentDigest

AgentToolRestrictionRef
  capabilityId
  capabilityRevision

AgentKnowledgeRestrictionRef
  knowledgeId
  revision
  contentDigest
```

规则：

- 不把本机 `materializedRef` 放进 portable Agent v2 material；
- ID + revision/digest 必须 exact；
- 同一 allowlist 内 ID 唯一；
- 顺序是 authored/backend stable order，不从点击时间、名称或性能推断；
- 上限沿用现有安全边界：Model 64、Skill 64、Tool 128、Knowledge 64；
- 超限、重复、revision/digest 不一致在保存/加载时失败。

### 5.4 Agent v1alpha2

```text
AgentDefinitionRevisionV1Alpha2
  schemaVersion = "v1alpha2"
  agentDefinitionId
  managementClass = "system_builtin" | "managed"
  name
  identity
  goal
  instructions
  modelRestriction
  skillRestriction
  toolRestriction
  knowledgeRestriction
  requiredModelCapabilities
  createdAt
  revision
  digest
```

v2 不包含 `defaultModelId` 或 `allowModelOverride`。用户默认模型是用户体验偏好，不属于 Agent immutable material。

`managementClass="system_builtin"`：

- 只允许 code-owned source 创建；
- 不进入普通 Admin edit/delete/publish；
- 不接受用户 owner；
- 不能被测试 Fixture 冒充。

### 5.5 v1 compatibility interpreter

Core 使用单一 `ReadableAgentDefinitionInterpreter`：

| v1 事实 | v2 等价解释 |
| --- | --- |
| `allowModelOverride=true` | Model `unrestricted` |
| `allowModelOverride=false + defaultModelId` | 单模型 allowlist |
| `skillReferences[]` | Skill allowlist，包括空数组 |
| `toolReferences[]` | Tool allowlist，包括空数组 |
| `knowledgeReferences[]` | Knowledge allowlist，包括空数组 |

兼容边界：

1. 不重写 v1 record；
2. 不改变 v1 digest；
3. 历史 Task recovery 读取 durable Runtime Selection，不重新用 current Agent 解释；
4. 新 v2 Task 只能加载 exact v2 material；
5. v1 解释结果只用于 legacy compatibility，不生成伪 v2 revision；
6. 无法证明 exact v1 material 时 fail-closed；
7. Renderer 不获得 interpreter，也不从旧字段猜 v2。

### 5.6 typed errors

- `selection.agent_restriction_invalid`；
- `selection.agent_restriction_drift`；
- `selection.agent_model_allowlist_empty`；
- `selection.resource_not_allowed`；
- `selection.resource_entitlement_unavailable`；
- `selection.resource_entitlement_drift`。

错误对外只给安全业务摘要；不暴露完整 allowlist、用户 entitlement、内部 binding 或 digest。

## 6. R2D-3：Entitlement、Runtime Selection v1alpha3 与 built-in Agent

### 6.1 TaskResourceEntitlementSource

新增 Core Port：

```text
TaskResourceEntitlementSource.loadExact(input)
  subject
  authorityRevision
  models[]       // exact ref + stableOrdinal
  skills[]
  tools[]
  knowledge[]
  snapshotDigest
  authorityKind
```

硬约束：

1. snapshot 属于 accepted caller/owner authority，不能使用 fixed userId、OS username 或单行 DB 猜用户；
2. production test fixture/Fake 不可达；
3. 每类条目 ID 唯一、ordinal 唯一且有界；
4. stable order 只按 ordinal；
5. resource status/revocation 只能缩小；
6. snapshot digest 覆盖 subject、authority revision、四类 exact refs 与 ordinal；
7. 同一次 Task acceptance 只 load 一次，不能四次读取拼出跨 revision snapshot；
8. production enterprise source 未实现时 v2 activation fail-closed；
9. test-only account 必须标记 `testIdentityUsed=true`、`productionIdentityReady=false`；
10. 不因本 Port 存在而关闭任何 identity blocker。

### 6.2 AgentResourceDecisionPlanner

单一 Planner 输入：

- exact interpreted Agent restriction；
- exact entitlement snapshot；
- accepted explicit Model / Skill / Knowledge selection；
- required Model capabilities；
- authoritative Tool candidate policy；
- current registry/availability safe facts。

Planner：

- 不写库；
- 不创建 locks；
- 不读 Renderer；
- 不调 Provider；
- 不读取 current/latest Agent 第二次；
- 不使用 Prompt、Skill 声明或模型文本扩权；
- 输出 content-free `AgentResourceDecisionV1` 与 decision digest。

### 6.3 Model 真值表

候选 = Agent restriction 与 entitlement snapshot 的 exact 交集，再应用 required capabilities / availability：

| 场景 | 结果 |
| --- | --- |
| explicit requested model 在候选中 | 使用该模型；source=`explicit` |
| 无 explicit，用户偏好在候选中 | 使用偏好；source=`user_preference` |
| 无 explicit/偏好不可用，候选非空 | 使用 stable ordinal 最小项；source=`stable_fallback` |
| explicit 不在候选 | typed rejected，不能 fallback |
| 候选为空 | typed unavailable，Task 零 durable 副作用 |
| restriction/entitlement drift | typed fail-closed，不读 current replacement |

“stable fallback”只是本 Task 的有效模型，不覆盖用户默认模型。

### 6.4 Skill 与 Knowledge

- 用户未选择时保持空；
- 只保留 accepted request 的 exact selection；
- 每一项必须同时存在于 entitlement 与 Agent restriction 允许范围；
- v2 Core 不做“空则全选”；
- 不兼容选择在 Task durable create 前整体拒绝，不静默删除后继续；
- 前端切换机器人时的交集清理只改善体验，不替代 Core 校验；
- Knowledge Provider 未 ready 时，锁定 ref 不代表可检索；调用路径继续按现有 typed boundary 失败。

### 6.5 Tool

当前 Workbench 没有逐项 Tool selector，因此 Tool 不能照搬 Skill/Knowledge 规则：

1. `TaskToolCandidatePolicy` 从 registry、Workspace/authorization 与 entitlement 产生 exact task-eligible Tool；
2. `unrestricted` 只表示“不被 Agent 再收窄”，不表示任意 registry Tool 都可用；
3. non-empty allowlist 与 candidates 求 exact 交集；
4. empty allowlist 产生零 Tool locks；
5. locked Tool 上限 128；
6. 模型文本、Agent Prompt、Skill 声明不能新增 Tool；
7. task-eligible Tool authority 无法证明时 fail-closed；
8. Tool 普通停用/revocation 只影响后续执行可用性，不把新 Tool 加入旧 Task。

### 6.6 TaskRuntimeSelection v1alpha3

新增 private subpath：

```text
@robothree/contracts/runtime-selection/v1alpha3
```

v1alpha3 以 v1alpha2 reasoning lock 为基础，但不继承旧 default-model 假设：

```text
TaskRuntimeSelectionV1Alpha3
  schemaVersion = "v1alpha3"
  runtimeSelectionId
  taskId
  exact agent ref
  agentResourceDecisionDigest
  resourceEntitlementSnapshotDigest
  modelSelectionSource
  requestedModelId?
  resolvedModelLock
  activeSkillRevisions[]
  toolLocks[]
  knowledgeRevisions[]
  reasoningModeLock
  workspaceGrantId?
  enterpriseConfigRevision?
  platformPromptRevision
  registryRevision
  createdAt
  selectionDigest
```

禁止：

- `agentDefaultModelId`；
- raw entitlement/allowlist 全量复制；
- 用户 owner、Credential、Endpoint；
- Provider raw Max mapping；
- reasoning lock ID 混入 capability lock IDs。

root v1 与 private v1alpha2 均保持零漂移。

### 6.7 coordination 与 bundle additive revision

现有 coordination v1alpha3 精确绑定 Runtime Selection v1alpha2，因此新增：

```text
@robothree/contracts/submit-turn-coordination/v1alpha4
```

v1alpha4：

- 精确绑定 selection v1alpha3 digest；
- 精确绑定 AgentResourceDecision digest 与 entitlement snapshot digest；
- capability lock IDs 与 Model/Tool locks exact；
- reasoning lock 继续独立；
- accepted 后 recovery 不重新读取 current Agent、entitlement、preference 或 stable order；
- 不修改 v1alpha1～v1alpha3；
- SubmitTurn request surface 继续使用已冻结 v1alpha3，不在本批扩 Desktop API。

Core 的 readable Task bundle 使用单次 schemaVersion dispatch；禁止“先按旧版 parse，失败再试新版”或按 JSON 字段猜版本。

### 6.8 首次 SubmitTurn 原子顺序

固定顺序：

1. 解析 accepted SubmitTurn v1alpha3；
2. 检查 command/replay；
3. resolve exact Agent revision 一次；
4. interpret exact restriction；
5. load exact entitlement snapshot 一次；
6. validate Workspace / authorization safe facts；
7. run AgentResourceDecisionPlanner；
8. 任何 rejected/unavailable 在 durable create 前返回；
9. materialize exact Model lock；
10. materialize exact Tool locks；
11. create TaskRuntimeSelection v1alpha3；
12. derive Task Instruction Binding / bundle；
13. create coordination v1alpha4；
14. 通过既有 durable coordination 推进 message append 与 Task bundle 局部原子 commit，达到 `task_committed`；
15. strict load exact bundle并完成 Receipt 后，才允许首次 Model Invocation；
16. Provider/network failure 不回到步骤 3～10。

不同 material 的同 command replay 必须 typed conflict；exact replay 返回原 durable result。

### 6.9 code-owned `agent.general`

新增 `BuiltInGeneralAgentSource`：

- stable ID 固定 `agent.general`；
- `managementClass="system_builtin"`；
- exact content、revision 与 digest 随 Core release artifact 固化；
- Model / Skill / Tool / Knowledge restriction 均为 `unrestricted`；
- 用户未明确选择 Skill / Knowledge 时仍为空；
- Tool 仍必须经过 `TaskToolCandidatePolicy`；
- 不声明 default model；
- 不绑定 `model.desktop-scripted`；
- 不进入普通 Admin Agent 管理列表；
- 不允许编辑、删除、发布或 owner rebind；
- 历史 exact revision 在兼容窗口内可 load；
- 升级新增 revision，不覆盖旧 revision。

`runtimeFixture()`：

- scripted model 与测试 Agent 改用明确 fixture ID；
- production built-in artifact 与 test fixture 由 source graph 静态隔离；
- fixture 不可进入 production dependency graph；
- 不删除历史 Task 仍引用的 exact `agent.general` revision。

### 6.10 activation

新增单一 release decision：

```text
r2dCoreDeltaEnabled = false
```

三态：

- false：v2 Agent / selection v3 / coordination v4 production route 不安装；
- true + 依赖缺失/重复/test-only：HTTP/desktop runtime ready 前启动失败；
- true + 全 production dependencies：仍需 R2D-4 closure 和用户另行 activation 授权。

本方案结束时保持 false。

## 7. R2D-4：Lifecycle / Conformance Closure

### 7.1 真实拓扑

Harness 必须复用既有真实 Core child + SQLite reopen 原语：

```text
parent harness
  -> spawn real Core child
  -> real SQLite persistence
  -> controlled entitlement/locale/timezone adapters
  -> deterministic named barriers
  -> SIGKILL exact process
  -> new PID + reopen same database
```

禁止单进程 `throw` 冒充 crash、删除数据库冒充 reopen、sleep 猜窗口、自动 retry 覆盖失败或硬编码资源 0。

### 7.2 Dynamic Facts 窗口 D1～D8

| 窗口 | 触发点 | 断言 |
| --- | --- | --- |
| D1 | facts sample 前 crash | 无 Invocation Link / facts |
| D2 | facts materialized、prepare 前 crash | 无 durable facts |
| D3 | Link + facts committed、request build 前 crash | restart 复用 exact facts |
| D4 | request finalized、Provider resolve 前 crash | exact request digest / facts |
| D5 | HTTP accepted、首帧前 crash | at-least-once 诚实，facts 不变 |
| D6 | stream progress 后 crash | recovery 沿用 original facts/deadline |
| D7 | terminal commit 后 response lost | terminal replay 不重建 facts/Provider |
| D8 | new round / compaction | new subject、新 facts、新 digest |

### 7.3 Selection / Agent 窗口 S1～S8

| 窗口 | 断言 |
| --- | --- |
| S1 Agent load 前 | 无 Task durable facts |
| S2 entitlement load 失败 | Task/lock/selection/Receipt 全 0 |
| S3 restriction/entitlement drift | 不切 current Agent/snapshot |
| S4 model candidates empty | Task/locks 全 0 |
| S5 accepted/message_appended 后 crash | 恢复原 plan，不对外成功、不重选 |
| S6 Task bundle committed、Provider 前 crash | restart 使用 exact selection |
| S7 Provider/network failure | 不重选 Agent/Model/Tool/Skill/Knowledge |
| S8 terminal replay | Agent/entitlement/Planner/lock/Provider 调用均 0 |

### 7.4 compatibility C1～C8

1. v1 Agent + v1 selection 历史 Task exact recovery；
2. v1 Agent 解释为 legacy restriction，但不生成伪 v2 revision；
3. v2 Agent + v3 selection 正常 materialization；
4. v2 selection 损坏不得 fallback v1/v2；
5. current Agent 更新不改变 accepted Task；
6. entitlement current revision 更新不改变 accepted Task；
7. code-owned `agent.general` 新旧 revision exact load；
8. DFI-5.2 / CPC Harness 全量回归，selection v1alpha2 行为零漂移。

### 7.5 semantic replay

同一 seed 三轮 fresh process：

- semantic digest 一致；
- PID、PGID、port、path、wall clock、transport nonce 不进入 semantic seed；
- Dynamic Facts 使用固定 FakeClock/Fake locale/timezone source 才能比较；
- source drift 必须改变 outcome 或 typed fail，不能被 normalization 掩盖；
- production Harness 不使用 test-only source。

### 7.6 泄漏扫描

四通道：

- process stdout；
- process stderr；
- evidence；
- failure artifact。

至少五类 marker：

- credential/token canary；
- absolute workspace path；
- raw entitlement subject/owner；
- full Agent allowlist；
- Provider-private reasoning parameter。

四种编码：

- raw；
- base64；
- hex；
- URL encoding。

共 4 × 5 × 4 = 80 次负向注入；scanner 必须证明每种注入恰能检出，再对正常 evidence 断言 0 命中。

### 7.7 真实资源归零

至少来自真实 diagnostics 的 12 类：

1. active Core child；
2. SQLite handles；
3. prepared Invocation links；
4. pending coordination；
5. active capability locks；
6. active Agent resolution lease；
7. active entitlement snapshot lease；
8. active timeout schedulers；
9. active Provider requests；
10. active context materializers；
11. active compaction jobs；
12. late callbacks。

禁止 `?? 0`、常量 0 或仅相信 child 自报。

## 8. 安全与 Threat Model

| 威胁 | 强制控制 |
| --- | --- |
| 空 allowlist 被当 unrestricted | discriminated union，不以数组空值猜 mode |
| Renderer 伪造合法资源 | Core entitlement snapshot + exact intersection |
| Agent Prompt 声明额外 Tool | Tool candidate policy + capability lock |
| 用户文本伪造时间/时区 | Core-controlled facts sources |
| retry 获取新时间改变语义 | facts 与 Invocation Link 原子持久 |
| current Agent 更新改写旧 Task | exact accepted revision recovery |
| current entitlement 更新扩大旧 Task | accepted snapshot digest + exact locks |
| test fixture 冒充 built-in Agent | production source graph exclusion |
| scripted model 成为隐式默认 | v2 无 defaultModelId；built-in 不绑定 scripted model |
| Provider raw mapping 泄漏 | 不进入 R2D Contract/Receipt/log/UI |
| Dynamic Facts 成为第二条高权威消息 | 单一 request-scoped System Message materializer |
| facts/receipt 半写入 | Invocation Link 单 material prepare |
| v2 parse 失败 fallback legacy | single schemaVersion dispatch |
| stable order 被前端改变 | backend ordinal only |
| identity 未 ready 却声明 entitlement ready | activation disabled + production source count gate |

## 9. 文件所有权与边界

### 9.1 R2D-1 允许

- `services/core/src/application/*dynamic-request-facts*`；
- `services/core/src/ports/*locale*`、`*timezone*`；
- `services/core/src/application/context-*`；
- `services/core/src/ports/model-invocation-link-persistence.ts`；
- `services/core/src/ports/compaction-model-invocation-link-persistence.ts`；
- 对应 InMemory / SQLite Adapter、tests、Harness、evidence、docs。

### 9.2 R2D-2 允许

- `packages/contracts/src/runtime-selection/agent-definition/v1alpha2/**`；
- package exact subpath export；
- Core readable interpreter、canonical helpers、conformance tests；
- 既有 v1 digest zero-drift fixtures；
- docs/Harness。

### 9.3 R2D-3 允许

- `packages/contracts/src/runtime-selection/v1alpha3/**`；
- `packages/contracts/src/submit-turn-coordination/v1alpha4/**`；
- Core resource decision/entitlement ports、RuntimeSelection、bundle readable union；
- code-owned built-in Agent source；
- bootstrap 的最小 production composition / fixture isolation；
- Task persistence adapters 仅限 existing JSON readable revision；
- docs/Harness。

### 9.4 R2D-4 允许

- `services/core/tests/**`；
- `scripts/run-r2d*.mjs`；
- evidence、implementation report、QA 文档与治理回链；
- 必要的最小 diagnostics seam，若增加 production seam 必须构造注入且默认 Noop。

### 9.5 全线禁止

- `apps/desktop/src/renderer/**`（由前端独立修复）；
- `apps/admin-console/**`；
- Desktop Main / Preload / public IPC；
- Central production service；
- Document Worker / PTX；
- DFI-5.3 Provider-private raw mapping；
- Agent draft/test/publish/Admin CRUD；
- Knowledge Provider、Memory、Effect Reconciliation；
- migration 27 或修改 migration 1～26；
- 新依赖或修改 `pnpm-lock.yaml`；
- public Contracts root export 静默 widening；
- production CPC activation；
- Fake identity / fixed userId 冒充 production。

## 10. QA 矩阵（96 项连续）

### 10.1 R2D-1 Dynamic Facts（QA-001～QA-024）

1. QA-001：facts schema strict，拒绝额外字段；
2. QA-002：currentTime 必须 UTC millisecond；
3. QA-003：locale 必须 BCP 47 safe value；
4. QA-004：timezone 必须 runtime 可验证的 IANA timezone；
5. QA-005：facts domain 与 CPC/selection/receipt domain 分离；
6. QA-006：facts digest 重算 exact；
7. QA-007：用户文本不能覆盖 currentTime；
8. QA-008：Renderer locale 自报不能进入 source；
9. QA-009：offset-only timezone 拒绝；
10. QA-010：同 Invocation retry facts 相同；
11. QA-011：同 Invocation restart facts 相同；
12. QA-012：新 main round facts 重新采样；
13. QA-013：新 compaction invocation facts 重新采样；
14. QA-014：terminal replay facts/materializer/Provider 调用 0；
15. QA-015：facts 不改变 instructionBundleDigest；
16. QA-016：request-scoped system digest 覆盖 bundle + facts；
17. QA-017：每个主请求仍恰好一条 System Message；
18. QA-018：Dynamic block 不授予 Tool/Workspace/Credential 权限；
19. QA-019：Receipt 同时绑定 stable bundle 与 facts；
20. QA-020：Receipt 不含 Prompt 正文；
21. QA-021：Link + facts InMemory strict roundtrip；
22. QA-022：Link + facts SQLite restart roundtrip；
23. QA-023：缺失/损坏 facts 在上游 I/O 前失败；
24. QA-024：historical v1 link 不 backfill、不漂移。

### 10.2 R2D-2 Agent restriction（QA-025～QA-048）

25. QA-025：四类 restriction 都是 strict discriminated union；
26. QA-026：四类 unrestricted 可解析；
27. QA-027：四类 non-empty allowlist 可解析；
28. QA-028：四类 empty allowlist 可解析且语义不丢失；
29. QA-029：缺 mode 拒绝；
30. QA-030：null / legacy boolean 在 v2 拒绝；
31. QA-031：Model duplicate ID 拒绝；
32. QA-032：Skill duplicate ID 拒绝；
33. QA-033：Tool duplicate capability 拒绝；
34. QA-034：Knowledge duplicate ID 拒绝；
35. QA-035：exact revision/digest drift 拒绝；
36. QA-036：allowlist stable order roundtrip；
37. QA-037：v2 不含 defaultModelId；
38. QA-038：v2 不含 allowModelOverride；
39. QA-039：v2 portable material 不含 materializedRef；
40. QA-040：v1 allowModelOverride=true 解释为 unrestricted；
41. QA-041：v1 false + defaultModelId 解释为单模型 allowlist；
42. QA-042：v1 skill empty 保持 legacy empty allowlist；
43. QA-043：v1 tool empty 保持 legacy empty allowlist；
44. QA-044：v1 knowledge empty 保持 legacy empty allowlist；
45. QA-045：v1 Agent digest corpus 零漂移；
46. QA-046：root export 继续只指 v1；
47. QA-047：Renderer/Preload/Admin 不导入 private v2；
48. QA-048：system_builtin 不能由非 code-owned source 创建。

### 10.3 R2D-3 Selection / built-in Agent（QA-049～QA-072）

49. QA-049：entitlement snapshot 四类 exact refs 单次 load；
50. QA-050：snapshot ordinal 重复拒绝；
51. QA-051：snapshot digest drift 失败；
52. QA-052：unrestricted 不扩大 entitlement；
53. QA-053：allowlist 只取 exact intersection；
54. QA-054：model empty allowlist 阻止 Task；
55. QA-055：skill empty allowlist 产生零 selected Skill；
56. QA-056：tool empty allowlist 产生零 Tool lock；
57. QA-057：knowledge empty allowlist 产生零 Knowledge ref；
58. QA-058：explicit model 不合法时拒绝，不 fallback；
59. QA-059：合法用户偏好优先；
60. QA-060：偏好不合法时按 backend ordinal fallback；
61. QA-061：fallback 不修改用户默认偏好；
62. QA-062：Skill 空选择保持空，不自动全选；
63. QA-063：Knowledge 空选择保持空，不自动全选；
64. QA-064：Tool 只来自 authoritative candidate policy；
65. QA-065：selection v1alpha3 不含 agentDefaultModelId；
66. QA-066：selection v1alpha3 精确绑定 decision/snapshot digest；
67. QA-067：coordination v1alpha4 精确绑定 selection v3；
68. QA-068：旧 selection v1/v2 digest 零漂移；
69. QA-069：agent.general ID/revision/digest 跨重启一致；
70. QA-070：agent.general 不绑定 scripted model；
71. QA-071：agent.general 不进入普通 Admin management projection；
72. QA-072：production graph 中 test fixture Agent 数为 0。

### 10.4 R2D-4 lifecycle / boundary（QA-073～QA-096）

73. QA-073：restriction/entitlement 失败十类 durable count=0；
74. QA-074：Task/selection/locks/binding/coordination 原子提交；
75. QA-075：commit 前 SIGKILL 无半写入；
76. QA-076：commit 后 SIGKILL exact restart；
77. QA-077：Provider network failure 不重选 Agent；
78. QA-078：Provider network failure 不重选 Model；
79. QA-079：retry 不重选 Tool/Skill/Knowledge；
80. QA-080：current Agent 更新不改 accepted Task；
81. QA-081：current entitlement 更新不改 accepted Task；
82. QA-082：terminal replay Planner/locks/Provider 调用 0；
83. QA-083：D1～D8 全窗口；
84. QA-084：S1～S8 全窗口；
85. QA-085：C1～C8 compatibility；
86. QA-086：三轮 fresh process semantic digest 一致；
87. QA-087：semantic seed 排除 PID/port/path/wall clock/nonce；
88. QA-088：source drift 不被 normalization 掩盖；
89. QA-089：80 次负向泄漏注入全部可检出；
90. QA-090：正常四通道敏感命中 0；
91. QA-091：12 类真实资源归零；
92. QA-092：resource count 不硬编码 0、不使用 `?? 0`；
93. QA-093：CPC-1～CPC-3 Harness 全绿；
94. QA-094：DFI-5.2.1～5.2.3 Harness 全绿；
95. QA-095：Central online/offline 全绿；
96. QA-096：lockfile 不变、migration 止 26、全部 downstream false。

测试禁止 `.skip`、`.only`、`@Disabled`、sleep 猜窗口、自动 retry 覆盖失败和 Fake 宣称 production。

## 11. 门禁

每个编码批至少执行：

```text
CI=true pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
```

并执行本批 focused Harness：

```text
pnpm run harness:r2d1
pnpm run harness:r2d2
pnpm run harness:r2d3
pnpm run harness:r2d4
```

若当前 package scripts 尚不存在，对应批次可 additive 增加；不能用手工单测冒充正式 Harness。

## 12. 分批交付

### R2D-1：Dynamic Request Facts（3～5 日）

交付：

- facts schema / source ports / materializer；
- one-system-message request-scoped materializer；
- Receipt evidence；
- main + compaction Invocation Link readable v2；
- InMemory/SQLite conformance；
- retry/restart Harness。

最高输出：`R2D_DYNAMIC_REQUEST_FACTS_CONFORMANT`。  
完成后不自动授权 R2D-2。

### R2D-2：Agent restriction Contract（3～5 日）

交付：

- AgentDefinition v1alpha2；
- four-resource restriction union；
- exact ref/canonical digest；
- legacy interpreter；
- v1 zero-drift；
- cross-language 不适用说明（当前 Core/TS private family）。

最高输出：`R2D_AGENT_RESOURCE_RESTRICTION_CONFORMANT`。  
完成后不自动授权 R2D-3。

### R2D-3：Selection / Entitlement / Durable Acceptance / built-in Agent（6～10 日）

交付：

- entitlement source Port；
- single Planner；
- stable model selection；
- Tool candidate policy；
- Runtime Selection v1alpha3；
- coordination v1alpha4 / readable bundle；
- 复用既有 SubmitTurn durable coordination；
- `task_committed` Provider 前 barrier 与 Task bundle 双 Adapter conformance；
- built-in `agent.general`；
- fixture isolation；
- production activation 继续 false。

最高输出：`R2D_RUNTIME_SELECTION_FOUNDATION_CONFORMANT`。  
完成后不自动授权 R2D-4。

### R2D-4：Lifecycle / Closure（1～2 日）

交付：

- D1～D8 / S1～S8 / C1～C8；
- real process / SQLite reopen；
- three-round semantic replay；
- 80 次负向泄漏扫描；
- 12 类资源归零；
- CPC/DFI regression；
- final evidence 与 implementation report。

最高输出：`R2D_CORE_DELTA_CONFORMANT`，并附六项 false。  
该输出仍不等于 production activation。

## 13. 与其他计划的衔接

### 13.1 Desktop

Workbench P1 Repair 独立处理：

- 不自动选全部 Skill；
- Knowledge 显式选择或安全空数组；
- Agent eligible models 为空时不回退全局；
- 切换 Agent 只保留交集，切回不恢复。

R2D 不触碰 Renderer。R2D-4 后另立 Desktop v2 consumption 计划，不能把前端 Repair 当作 v2 Contract 已接入。

### 13.2 Admin

AAPI-0.3～0.4 继续原 read-only Projection / HTTP foundation 边界，不扩成 Agent CRUD。

Agent 草稿、保存、测试、发布、审核、published revision 与 Admin 页面另立后续计划（建议 `AAPI-1 Agent Lifecycle`）：

- 草稿只要求名称；
- 测试/发布要求完整字段；
- 只测试 saved exact revision；
- empty model allowlist 阻止测试/发布；
- avatar/tag 不进 instruction digest。

### 13.3 DFI-5.3

DFI-5.3 保持 `PASS/CLOSED / CODING GATED`。未来授权时必须：

- 支持 readable Runtime Selection v1alpha3；
- 继续只按 exact Task ReasoningModeLock mapping；
- 加入 R2D Harness 回归；
- 不让 Dynamic Facts 改变 Max mapping；
- 不暴露 raw mapping 到 R2D Contract/Receipt。

### 13.4 Knowledge / Memory / Effect

全部继续 GATED。R2D 只锁 exact ref 与禁止扩权，不实现检索、长期记忆或 uncertain 人工核对。

## 14. 停手条件

遇到任一情况必须停止编码并回文档评审：

1. 必须修改 Agent v1 或 TaskRuntimeSelection v1/v2 既有字段语义；
2. 必须把新 union 静默导出到 Contracts root；
3. 必须新增 migration 27；
4. existing JSON persistence 无法原子承载 Invocation/selection readable revision；
5. Dynamic Facts 必须创建第二条 System Message；
6. retry/restart 无法复用 exact facts；
7. 必须从 Renderer/用户文本/env 自报 locale/timezone；
8. entitlement 必须依赖 Fake/fixed userId/OS username；
9. Tool unrestricted 只能通过“锁全部 registry Tool”实现且无 authority proof；
10. built-in `agent.general` 必须继续绑定 scripted model；
11. 历史 Task 只能通过 backfill current Agent 才能恢复；
12. 必须提前实现 Agent CRUD/publish；
13. 必须修改 DFI-5.3 raw mapping；
14. 必须改 Desktop/Admin 生产代码；
15. 必须新增依赖或修改 lockfile；
16. root check 失败来自并发窗口且无法安全隔离；
17. production CPC/identity/entitlement 只能通过假实现才能开启；
18. 任何实现试图把 `R2D_*_CONFORMANT` 解释为 production ready。

## 15. 文档评审问题

1. 是否接受 Dynamic Facts 通过 request-scoped materializer 合并为唯一 System Message？
2. 是否接受 facts 与现有 Invocation Link readable v2 原子持久、无 migration 27？
3. 是否接受 current single-language locale 使用 code-owned `zh-CN` source，而非 Renderer 自报？
4. 是否接受 OS timezone 不可验证时 typed fail，而不是猜 UTC/offset？
5. 是否接受 Agent v2 采用四个独立 `unrestricted | allowlist` union？
6. 是否接受 v2 移除 defaultModelId/allowModelOverride，并保留 v1 compatibility interpreter？
7. 是否接受 final stable order 来自 entitlement ordinal，而不是 allowlist/UI 顺序？
8. 是否接受 Tool 使用独立 authoritative candidate policy，不照搬 Skill/Knowledge 显式选择？
9. 是否接受 TaskRuntimeSelection v1alpha3 与 coordination v1alpha4 additive revision？
10. 是否接受 built-in `agent.general` 四类 restriction 均 unrestricted，但仍受 Core policy 与 explicit selection？
11. 是否接受 enterprise entitlement 未 ready 时 production v2 activation 继续 fail-closed？
12. 是否接受 Agent draft/test/publish 移出本计划、后续另立 AAPI-1？
13. 是否接受按 R2D-3 Revision 1 将总工期修正为 13～22 个集中工程日及四批逐批授权？

## 16. 当前状态

```text
R2D-0 PLAN
  PASS/CLOSED

R2D-1 Dynamic Request Facts
  PASS/CLOSED

R2D-2 Agent Definition v1alpha2 / Restrictions
  PASS/CLOSED

R2D-3 Runtime Selection v1alpha3 / Entitlement / agent.general
  PLAN REVIEW PASS/CLOSED
  3.1 PASS/CLOSED
  3.2 EXACT MATERIAL CONFIRMATION PENDING / CODING GATED
  3.3 CODING GATED

R2D-4 Lifecycle / Closure
  GATED

productionCpcActivationEnabled=false
productionEnterpriseEntitlementReady=false
agentLifecycleReady=false
desktopV2ConsumptionReady=false
adminV2ConsumptionReady=false
knowledgeProviderReady=false
```

R2D-1～R2D-3.1 已通过独立 QA并由用户正式接受关闭；R2D-3.2 `agent.general` exact material 已形成
docs-only 聚焦确认稿，但编码仍未授权；R2D-3.2～R2D-3.3 与 R2D-4 继续 GATED。
