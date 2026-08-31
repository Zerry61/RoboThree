# R2D-3 Runtime Selection v1alpha3 / Entitlement Intersection / Durable Acceptance 详细实施方案 Revision 1

> 状态：**PLAN REVIEW PASS/CLOSED；R2D-3.1～R2D-3.3 PASS/CLOSED；R2D-3 PASS/CLOSED**
> 日期：2026-08-26  
> 负责人：Codex 5.6  
> 计划代号：`R2D-3`  
> 上游：R2D-0～R2D-2 `PASS/CLOSED`、CPC 全线 `PASS/CLOSED`、DFI-5.2 `PASS/CLOSED`  
> 产品基线：PRD v1.6 Final Revision 15、Core Prompt / Context Feature Spec Revision 2、Model Experience Revision 4  
> 本方案最高输出：`R2D_RUNTIME_SELECTION_FOUNDATION_CONFORMANT`  
> 当前结论：**Revision 1 与 R2D-3.1～R2D-3.3 均已关闭；R2D-3 阶段整体 PASS/CLOSED**

## Revision 1 修订摘要

Revision 1 关闭原方案对“原子接受”的过强解释：产品要求的是首次 Provider 调用前，Task、Runtime Selection、
资源锁与 Instruction Binding 已形成唯一 durable winner；Provider/network failure 与 restart 不得重新选择。
它不要求首条消息、Task、全部 locks、coordination、Receipt 和 delivery 必须在一个新建的跨 Repository 物理事务中
同时落库。

本修订因此：

1. 复用现有 `SubmitTurnCoordinator` durable state machine；
2. 保留现有 `accepted -> message_appended -> task_committed -> completed` 可恢复阶段；
3. 将 `task_committed` 冻结为首次 Provider 调用前的不可越过 barrier；
4. `accepted` / `message_appended` 中间态不得向调用者投影为 Task 创建成功；
5. crash/restart 只继续原 coordination plan，不重新读取 current Agent、entitlement、Preference 或 stable order；
6. 删除新增 aggregate persistence Port 与“所有表必须同一 SQLite transaction”的要求；
7. 不实现 production Enterprise Entitlement Adapter，production enterprise entitlement 继续 false；
8. Revision 1 初步把 R2D-3 从 12～20 日修正为 6～10 日；R2D-3.3 详细方案确认需要 Core-private 双
   envelope 后，R2D-3 最终细化为 7～11 日；R2D-4 聚焦收口保持 1～2 日。

## 0. 结论摘要

R2D-2 已经能够精确表达 Agent 对 Model、Skill、Tool、Knowledge 的四类限制，但它没有回答以下运行时问题：

1. 当前可信 subject 到底依法可用哪些资源；
2. Agent 限制、用户明确选择、可信 entitlement、Registry、Workspace 与授权事实如何只做收窄交集；
3. 未显式选择模型时，如何使用用户偏好和后端稳定顺序，而不是回退到 Agent default 或 Renderer 排序；
4. 如何把 exact Agent、资源决策、Model/Tool locks、Reasoning lock、Instruction Binding 与首条用户消息在首次
   `SubmitTurn` 接受时形成同一个 durable winner；
5. 如何把当前测试 fixture 中绑定 scripted model 的 `agent.general` 替换为真实 code-owned、不可编辑、无默认模型的
   built-in Agent，同时保留历史 Task 的 exact revision 可读性。

本方案将 R2D-3 拆成三个串行、分别授权的原子子批：

| 子批 | 交付目标 | 估算 | 当前状态 |
| --- | --- | ---: | --- |
| R2D-3.1 | Entitlement / Decision / Runtime Selection v1alpha3 / coordination v1alpha4 Contract 与 conformance | 2～3 个集中工程日 | `PASS/CLOSED` |
| R2D-3.2 | 单一 Planner、可信交集、code-owned `agent.general` 与 fixture 隔离 | 2～3 个集中工程日 | `PASS/CLOSED` |
| R2D-3.3 | 既有 durable coordination 接线、Provider 前 barrier、recovery/cutover | 3～5 个集中工程日 | `PASS/CLOSED` |
| 合计 |  | **7～11 个集中工程日** | `PASS/CLOSED` |

父计划原先 4～7 日覆盖“新增 selection 版本 + intersection”的草估。Revision 0 曾把产品级原子锁定进一步
解释为跨 Repository 的单一物理事务，导致估算放大到 12～20 日。Revision 1 根据现有 coordination 已具备可恢复
阶段与 exact replay 的工程事实，改为“Provider 前 durable winner + 中间态不对外成功 + restart 不重选”，因此
初步细化为 6～10 日；R2D-3.3 详细方案进一步确认 v1alpha4 摘要不足以单独恢复完整 Task bundle，增加双
Adapter envelope conformance 后，最终修正为 7～11 日。

本批结束后最高只能输出：

```text
R2D_RUNTIME_SELECTION_FOUNDATION_CONFORMANT
```

并且必须同时声明：

```text
productionR2DCoreDeltaEnabled=false
productionCpcActivationEnabled=false
productionEnterpriseEntitlementReady=false
productionTaskResourceEntitlementSourcePresent=false
productionSubmitTurnV1Alpha3Reachable=false
agentLifecycleReady=false
desktopV2ConsumptionReady=false
adminV2ConsumptionReady=false
knowledgeProviderReady=false
```

不得输出 `R2D_CORE_DELTA_CONFORMANT`、`PRODUCTION_READY`、`IDENTITY_COMPOSITION_READY` 或任何真实企业
entitlement ready 结论。

## 1. 目标、非目标与成功定义

### 1.1 本批目标

1. 新增 Core-private `TaskResourceEntitlementSnapshotV1` 和 exact digest；
2. 新增单一纯函数 `AgentResourceDecisionPlanner`，冻结四类资源交集和 Model 选择真值表；
3. 新增 Core-private `TaskRuntimeSelection v1alpha3`，删除旧 `agentDefaultModelId` 假设；
4. 新增 Core-private `SubmitTurn coordination v1alpha4`，绑定 entitlement / decision / selection / authorization；
5. 新增 code-owned、不可编辑、四类 restriction 均为 `unrestricted` 的 `agent.general`；
6. 将 scripted desktop fixture Agent 改用独立 fixture ID 和 test-only source graph；
7. 复用首次 SubmitTurn 的 durable coordination，确保 Task bundle、locks、selection、authorization 与
   Instruction Binding 在首次 Provider 调用前形成唯一 durable winner；
8. 确保事务提交后 Provider/network 失败、retry 或 restart 不重新选择 Agent、资源或模型；
9. 保持 v1 Agent、Runtime Selection v1/v2、coordination v1～v3、CPC 与 DFI-5.2 历史行为零漂移；
10. production gate、production CPC activation 与 production enterprise entitlement 全部继续 false。

### 1.2 非目标

- 不实现 Enterprise SSO、RBAC、真实企业 Principal、真实 production entitlement Adapter；
- 不实现 Agent draft/save/test/publish/review/delete、owner lifecycle 或 Admin CRUD；
- 不实现 Desktop/Admin v2 DTO、页面、IPC、HTTP 或新 SubmitTurn public Contract；
- 不实现 Knowledge retrieval、Memory、Effect Reconciliation 或 Skill Runtime；
- 不实现 DFI-5.3 Provider raw Max mapping 或 DFI-5.4 Desktop Max UI；
- 不把 Tool 普通 availability 变化写成历史 Task 的资源扩张；
- 不为历史 Task backfill entitlement snapshot 或 v3 selection；
- 不新增 migration 27，不改 migration 1～26；
- 不引入依赖，不修改 `pnpm-lock.yaml`；
- 不把 test-only entitlement 或 fixture Agent 冒充 production ready。

### 1.3 成功边界

```text
accepted SubmitTurn v1alpha3
  -> exact Agent revision single load
  -> exact entitlement snapshot single load
  -> pure AgentResourceDecisionPlanner
  -> exact Model/Tool locks + ReasoningModeLock
  -> TaskRuntimeSelection v1alpha3
  -> Task Instruction Binding
  -> SubmitTurn coordination v1alpha4
  -> existing durable coordination reaches task_committed
  -> immutable Task bundle becomes the durable winner
  -> response / Agent Loop
```

任何一步不能证明 exact authority 时必须 fail-closed；不得回退当前 Agent、当前 entitlement、全局模型、全局 Tool、
Renderer 缓存或 scripted fixture。

## 2. 既有工程事实与必须修复的真实缺口

### 2.1 已关闭、不得改写的事实

1. root `TaskRuntimeSelectionSchema` 继续只表示 v1alpha1；
2. private v1alpha2 只 additive 增加 `ReasoningModeLock`，仍保持历史 default-model 语义；
3. public Desktop SubmitTurn 继续使用已冻结 v1alpha3；
4. coordination v1alpha3 精确绑定 Runtime Selection v1alpha2；
5. R2D-2 Agent Definition v1alpha2 只从 exact private subpath 导出；
6. CPC Instruction Binding 与 Bundle 由 durable Runtime Selection / SubmitTurn bundle 确定性派生；
7. DFI-5.2 的 ReasoningModeLock 与 capability lock identity 分离；
8. migration 仍止 26；
9. production CPC activation 与 enterprise entitlement 继续 false。

### 2.2 当前缺口

#### 缺口 A：旧 Runtime Selection 无法表达新模型语义

v1/v2 在 `requestedModelId` 缺失时要求 `resolvedModelLock` 等于 `agentDefaultModelId`。Revision 2 已明确：

```text
explicit requested model
  > current-user preference
  > entitlement stable fallback
```

Agent v2 没有 default model，因此必须新增 v1alpha3，不能原地改 v1/v2。

#### 缺口 B：现有阶段必须补足 product-level logical atomicity

当前 production 流程按阶段写入：

```text
Conversation.prepareMessage
  -> coordination.prepareAccepted
  -> Conversation.appendPreparedMessage
  -> TaskPersistence.commitReasoningAwareSubmitTurnTaskBundle
  -> coordination.complete + Receipt
```

现有状态机已经能够持久恢复，不需要推倒重建。R2D-3.3 必须补足的产品语义是：

1. `accepted` / `message_appended` 只是内部 coordination 状态，不得对外返回 Task 创建成功；
2. 只有 exact Task bundle、Runtime Selection、locks、authorization 与 Instruction Binding 已 durable commit，
   才能越过 `task_committed` barrier；
3. 首次 Provider 调用只能发生在该 barrier 之后；
4. crash/restart 必须继续同一个 accepted plan，不重新选择；
5. Receipt/response loss 必须 exact replay。

因此本批复用既有 Repository 与 coordination transition，不新增跨 Repository aggregate Port，也不把所有表强制
塞入一个物理事务。每个既有原子 commit 仍必须保持自身事务完整，不能返回半写入 bundle。

#### 缺口 C：现有 `agent.general` 是 fixture

当前 bootstrap 的 `agent.general`：

- 是 v1alpha1；
- 绑定 `model.desktop-scripted`；
- 与 Desktop fixture Registry / Document Tool fixture 混合；
- 不是独立 code-owned system artifact。

R2D-3.2 必须把真实 built-in 与 fixture 分离，同时保留历史 exact revision 的读取兼容。

#### 缺口 D：没有 production entitlement authority

EIPC-1.2 以后已明确 `DEFERRED / OUT OF CURRENT RELEASE`；当前没有可信 production enterprise identity / entitlement
来源。R2D-3 只实现 Port、strict validator、test-only conformance Adapter 和 activation exclusion；不得用 fixed userId、
OS user、单行数据库、Fake 或 Renderer 自报填补缺口。

## 3. Authority 与数据边界

### 3.1 单一事实源

| 事实 | 唯一 authority | 明确不是 authority |
| --- | --- | --- |
| Agent 限制 | accepted exact Agent revision | 当前 Agent pointer、Renderer、Prompt |
| 当前合法资源 | `TaskResourceEntitlementSource.loadExact()` | fixed userId、OS user、UI 列表、Registry 全集 |
| explicit selection | accepted SubmitTurn request | LocalStorage、旧页面状态、模型输出 |
| 模型稳定顺序 | entitlement snapshot 的 `stableOrdinal` | allowlist authored order、Renderer sort |
| Tool task candidates | `TaskToolCandidatePolicy` | Agent/Skill 文本、模型建议、所有 Registry Tool |
| Workspace / authorization | 既有 verified Core facts | Agent restriction、entitlement snapshot |
| Reasoning mode | DFI-5.2 exact Task lock | 当前 Preference、当前 Profile |
| Dynamic Request Facts | R2D-1 exact Invocation fact | Task selection、Prompt |

### 3.2 只收窄、不扩张

最终候选必须是：

```text
Agent exact restriction
  ∩ exact subject entitlement
  ∩ Registry exact revision / availability
  ∩ Workspace / authorization constraints
  ∩ accepted explicit selection
```

- 缺失或 `unknown` 不得解释为 allowed；
- disabled / revoked / permission denied 只能缩小；
- Agent `unrestricted` 仅表示 Agent 不再缩小，不表示全局可用；
- Agent `allowlist([])` 对 Model 表示无候选，对 Skill/Tool/Knowledge 表示明确禁止该类；
- 当前配置更新不能扩张已接受 Task；
- Prompt、Skill 文本、Tool Payload、Provider 响应均不能新增资源。

## 4. R2D-3.1：Canonical Decision Contract 与 private revisions

### 4.1 TaskResourceEntitlementSnapshotV1

仅进入 Core-private application/port，不进入 public Desktop/Admin Contract：

```text
TaskResourceEntitlementSnapshotV1
  schemaVersion = "v1"
  subjectBindingDigest
  authorityKind = "runtime_active_enterprise_identity"
  authorityRevision
  observedAt
  models[]    = exact Model ref + stableOrdinal
  skills[]    = exact Skill ref + stableOrdinal
  tools[]     = exact Tool ref + stableOrdinal
  knowledge[] = exact Knowledge ref + stableOrdinal
  identityEvidence
    testIdentityUsed
    productionIdentityReady
  snapshotDigest
```

约束：

1. `subjectBindingDigest` 是不可逆 binding，不持久化 raw user/tenant/device；
2. `authorityRevision` 与四类资源、exact refs、stable ordinals、identity evidence 全部进入 digest；
3. digest domain 固定为 `robothree.task-resource-entitlement-snapshot.v1\n`；
4. Model/Skill/Knowledge 每类最多 64，Tool 最多 128；
5. 每类 ID 唯一、ordinal 唯一、非负且有界；
6. 稳定排序只按 `stableOrdinal`，再以 exact ID 作防损坏 tie-break；正常资料不得出现 ordinal tie；
7. snapshot 只包含该 subject 当次依法可用的 exact resources；缺失即不允许；
8. 任何重复、损坏、未知版本、subject drift 或 digest mismatch 整体失败，不跳过坏记录；
9. `testIdentityUsed=true` 必须同时 `productionIdentityReady=false`；
10. production activation 要求 `testIdentityUsed=false` 且 `productionIdentityReady=true`。

### 4.2 TaskResourceEntitlementSource

```text
TaskResourceEntitlementSource.loadExact(input)
  input:
    verifiedRuntimeSubject
    acceptedClientBinding
    requestedAgentRef
  output:
    exact TaskResourceEntitlementSnapshotV1
```

- 每次首次接受恰好调用一次；
- Planner、Persistence、Provider、Renderer 不得二次加载；
- 本批 production implementation count 必须为 0；
- test-only Adapter 只能位于 test/support source set，且 source graph 不可达 production composition；
- 禁止 `@ConditionalOnMissing`/`getIfAvailable(Fake::new)`/固定 userId/OS user/单行 DB 推断；
- 缺 production source 时返回 typed unavailable 或在启用 gate 时启动失败，不构造空 snapshot 冒充合法用户。

### 4.3 AgentResourceDecisionV1

```text
AgentResourceDecisionV1
  schemaVersion = "v1"
  taskId
  agentRef
  entitlementSnapshotDigest
  registryRevision
  modelSelectionSource = explicit | user_preference | stable_fallback
  requestedModelId?
  resolvedModelRef
  activeSkillRefs[]
  toolCandidateRefs[]
  knowledgeRefs[]
  decisionDigest
```

digest domain：

```text
robothree.agent-resource-decision.v1\n
```

Decision 只保存最终 exact refs 与来源摘要，不复制 raw entitlement、完整 allowlist、用户身份、Credential、Endpoint、
Provider private mapping、Skill/Knowledge 正文或 Tool Binding。

### 4.4 TaskRuntimeSelection v1alpha3

新增 exact private subpath：

```text
@robothree/contracts/runtime-selection/v1alpha3
```

v1alpha3 是新 material，不继承 v1/v2 的 `agentDefaultModelId`：

```text
TaskRuntimeSelectionV1Alpha3
  schemaVersion = "v1alpha3"
  runtimeSelectionId
  taskId
  agent
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

强约束：

1. `agent.revision === agent.digest`；
2. resolved Model ref == Decision exact Model ref；
3. explicit 时 `requestedModelId` 必填且等于 resolved Model；其他来源不得伪造 requested ID；
4. Skill/Knowledge 使用 R2D-2 portable exact refs，不回填 `materializedRef`；
5. capability lock IDs 只含 exact Model/Tool locks；Reasoning lock ID 必须独立；
6. Reasoning lock 必须 exact 绑定 resolved Model lock；
7. selection digest 覆盖 entitlement/decision refs、全部 exact locks、Skill/Knowledge refs 和既有运行事实；
8. 不包含 raw entitlement、raw allowlist、owner、Credential、Endpoint 或 Provider raw Max 参数；
9. root v1 和 private v1alpha2 export/bytes/digests 全部零漂移；
10. readable union 只从新的 Core-private subpath 暴露，旧根入口不改成 union。

### 4.5 SubmitTurn coordination v1alpha4

新增 exact private subpath：

```text
@robothree/contracts/submit-turn-coordination/v1alpha4
```

v1alpha4 继续使用 public SubmitTurn v1alpha3 request surface，并新增：

- exact selection v1alpha3 digest；
- exact entitlement snapshot digest；
- exact AgentResourceDecision digest；
- exact authorization selection / execution identity digest；
- exact Task bundle digest 与 Task Instruction Binding digest；
- Model/Tool capability lock IDs 与 Reasoning lock separate identity；
- durable acceptance revision / receipt identity；
- 单次 schemaVersion dispatch；损坏 v4 不 fallback v3。

不得修改 coordination v1～v3，也不得新增 Desktop v1alpha4 请求。

### 4.6 package/export 边界

- v1alpha3/v1alpha4 只能通过 exact private subpath 导入；
- Contracts root、runtime-selection root、Desktop bundle、Admin bundle 不导出新类型；
- 构建后必须真实 `import()` JS 与 declarations，而非只检查源码文件存在；
- exact subpath 缺失、产物不可导入或 root export 被扩宽均 fail gate。

## 5. R2D-3.2：单一 Planner 与可信资源交集

### 5.1 AgentResourceDecisionPlanner

Planner 是唯一实现真值表的组件：

```text
plan({
  taskId,
  exactAgent,
  exactEntitlementSnapshot,
  acceptedSelectionRequest,
  exactUserModelPreference?,
  registrySnapshot,
  workspaceAndAuthorizationFacts,
  taskToolCandidates,
}) -> AgentResourceDecisionV1
```

Planner 必须：

- pure、同步、无 IO；
- 不读当前 Agent pointer、current entitlement、Preference DB 或 Renderer state；
- 不创建 Task/Message/Lock/Receipt；
- 不调 Provider、Credential、DNS、socket 或 Central；
- 不猜 modelId/provider family；
- 不复制到 Runtime Selection Service、Coordinator、Persistence、Provider 或 UI。

### 5.2 Model 真值表

先计算：

```text
eligibleModels =
  entitlement.models
  ∩ Agent model restriction
  ∩ Registry exact revision + availability
  ∩ required model capabilities
  ∩ Workspace / authorization constraints
```

然后按下表选择：

| explicit | user preference | eligible | 结果 | source |
| --- | --- | --- | --- | --- |
| 有，且 exact eligible | 任意 | 非空 | 选择 explicit | `explicit` |
| 有，但不 eligible | 任意 | 任意 | typed reject；不得 fallback | 无 |
| 无 | exact eligible | 非空 | 选择 user preference | `user_preference` |
| 无 | 缺失/不 eligible | 非空 | 选择最小 stableOrdinal | `stable_fallback` |
| 无 | 任意 | 空 | typed reject；零 durable side effect | 无 |

附加规则：

1. stable fallback 不使用 Agent allowlist authored order；
2. v1 legacy `single_model_id` 只有在 entitlement 中找到同 ID exact ref 才可使用；不得伪造 revision/digest；
3. explicit 不合法时不得静默改用 user preference 或 fallback；
4. user preference 漂移只使其不命中，不改变 accepted explicit；
5. Registry revision/digest 损坏是 unavailable，不是“不支持”；
6. Tool candidates 非空时，模型必须满足 Tool Calling；无 Tool 时不凭空扩大 required capabilities；
7. 模型/Provider 调用失败不修改 Decision。

### 5.3 Skill 与 Knowledge

- 只处理 accepted request 显式选择或 code-owned Agent exact fixed refs；
- 每个 ref 必须同时存在于 Agent restriction、entitlement 和 exact Registry/material source；
- 不自动全选 entitlement 中所有 Skill/Knowledge；
- `unrestricted` 仅不额外收窄；
- `allowlist([])` 明确产生零 active refs；
- 任一 requested ref 缺失、revoked、revision drift 或 digest mismatch，在 durable create 前 typed reject；
- 切换 Agent 后取消的选择不得由 Core 自动恢复；
- Knowledge Provider 未 ready 时，非空 Knowledge selection 必须 typed unavailable，不能锁一个不可 materialize 的假 ref；
- Skill production resolver 仍为 0 时，非空 Skill Task 在 CPC runtime 阶段继续诚实 fail-closed。

### 5.4 Tool candidate policy

新增单一 Port：

```text
TaskToolCandidatePolicy.resolveExact({
  exactAgent,
  selectedSkills,
  entitlementSnapshot,
  registryRevision,
  workspaceAndAuthorizationFacts,
})
```

规则：

1. Tool 不由 Renderer 选择；
2. 候选仅来自 authoritative general Tool policy 与可信 Skill dependency facts；
3. Agent `unrestricted` 只表示不再缩小候选；
4. Agent allowlist 与候选、entitlement、Registry、Workspace/authorization 求 exact 交集；
5. empty allowlist 产生零 Tool locks；
6. 最多 128 个 exact Tool refs；
7. Tool ID/revision 唯一，稳定排序不由 Renderer 决定；
8. Skill dependency authority 不可用时 fail-closed，不解析 Skill 文本猜 Tool；
9. Agent/Prompt/模型输出不能新增 Tool；
10. historical Task 不因 Tool policy current 更新而扩张。

### 5.5 code-owned `agent.general`

新增 `BuiltInGeneralAgentSource`。编码前 exact material 由
[R2D-3.2 `agent.general` Exact Material 编码前置聚焦确认](./R2D-3.2-AGENT-GENERAL-EXACT-MATERIAL-PREFLIGHT-CONFIRMATION.md)
统一冻结；下列内容以产品 Core Prompt Revision 2 的完整默认 Agent block 为唯一来源：

```text
schemaVersion = "v1alpha2"
agentDefinitionId = "agent.general"
managementClass = "system_builtin"
name = "RoboThree 通用助手"
identity = "你是 RoboThree 通用任务助手，帮助用户处理分析、写作、信息整理和当前能力允许的工作空间任务。"
goal = "准确理解用户目标，以尽量少的阻塞完成任务，并交付真实、清晰、可验证的结果。"
instructions = "- 优先解决用户当前问题。\n- 不预设行业角色或专业立场。\n- 只使用当前任务真实启用的 Skill、Tool 和参考资料。\n- 不编造未提供的能力、文件、来源或执行结果。"
modelRestriction = unrestricted
skillRestriction = unrestricted
toolRestriction = unrestricted
knowledgeRestriction = unrestricted
requiredModelCapabilities = text input + text output；supportsToolCalling=false；supportsStreaming=false；minimumContextWindow omitted
createdAt = "2026-08-26T00:00:00.000Z"
revision = digest = "sha256:f846f63e9b0b7135df865a2de832f0605643eeb25919201e1285315a250078cc"
```

边界：

- 无 default model；
- 不绑定 `model.desktop-scripted`；
- 未显式选择 Skill/Knowledge 时保持空集合；
- Tool 仍走 `TaskToolCandidatePolicy`；
- 不进入普通 Admin Agent 管理列表；
- 不允许 edit/delete/publish/owner rebind；
- 新版本新增 exact revision，不覆盖旧 revision；
- 历史 exact revision 在兼容窗口内可加载；
- 头像、标签、展示文案不进入 instruction material 或 digest。

中文字段、LF/尾随换行规则、digest domain、canonical material 和 fixture exact ID 以聚焦确认文档为准；若产品
需要调整任一字节，必须在 R2D-3.2 编码前完成新的差异复核。

### 5.6 fixture 隔离

现有 scripted runtime fixture 必须：

- 改用 `agent.fixture.desktop-scripted` 或等价明确 test/fixture ID；
- 继续绑定 scripted model，但不得使用 `agent.general`；
- 与 BuiltInGeneralAgentSource 分属不同 source graph；
- test/demo source 不得被 production composition 引用；
- 不删除历史 Task 可能引用的旧 `agent.general` exact revision；
- compatibility loader 可读旧 revision，但新 Task 不再创建旧 fixture material。

## 6. R2D-3.3：首次 SubmitTurn Durable Acceptance

详细可编码方案见：
[R2D-3.3 Durable Acceptance / Coordination v1alpha4 / Task Bundle Atomic Commit 详细实施方案](./R2D-3.3-DURABLE-ACCEPTANCE-COORDINATION-DEVELOPMENT-PLAN.md)。

详细方案根据 v1alpha4 `resourcePlan` 只含 digest/ID、无法单独重建完整 Task bundle 的代码事实，新增
Core-private coordination/task-binding 双 envelope，复用既有 JSON 列与事务，不改 Contract、不加 migration 27；
因此 R2D-3.3 明细估算由父计划 2～4 日修正为 3～5 日。

### 6.1 复用既有 coordination，不新建第二套状态机

R2D-3.3 继续使用：

```text
accepted
  -> message_appended
  -> task_committed
  -> completed
```

新增 coordination v1alpha4 只扩展 exact plan/binding 字段，不改变四阶段的业务含义。禁止另建平行
`R2D3SubmitTurnAcceptancePersistence`、第二张 coordination 表或 migration 27。

product-level logical atomicity 定义为：

1. `accepted` / `message_appended` 是内部可恢复状态，不是用户可见成功；
2. `task_committed` 之前不得 resolve Provider、建立 DNS/socket/TLS、写 Model Invocation Link 或启动 Agent Loop；
3. `task_committed` 必须能 strict load exact Task bundle、selection v1alpha3、capability locks、authorization 与
   Task Instruction Binding；任一缺失/不匹配不得继续；
4. `completed` Receipt 必须从该 durable bundle 构造；
5. response loss/restart 继续原 record，不重做 Agent/entitlement/Planner；
6. Provider/network failure发生在 durable winner 之后，不允许回到 selection 阶段。

### 6.2 既有局部事务继续严格原子

Revision 1 不放宽既有 Adapter 的局部事务：

- `Conversation.prepare/append` 仍必须自身原子、可 replay；
- `TaskPersistence.commitReasoningAwareSubmitTurnTaskBundle` 的 R2D-3 overload 必须在一个 Task Persistence
  transaction 中提交 Task、Model/Tool locks、selection v1alpha3、authorization、Task bundle binding 与
  Task Instruction Binding；
- `SubmitTurnPersistence.complete` 仍必须原子提交 completed record、Receipt 与 delivery；
- 任一局部 commit 失败不得投影下一阶段；
- 不允许靠 catch 后逐行删除模拟 rollback；
- 不把 Provider 调用放入任何数据库事务。

R2D-3 可以 additive widen 现有 Task bundle Port/Adapter；不得顺序调用多个 Task Repository 方法后冒充 bundle
commit。InMemory 与 SQLite 必须继续共享同一 bundle validator/conformance。

### 6.3 Durable plan 与 recovery 输入

coordination v1alpha4 在 `accepted` 时必须持久化足以恢复原 plan 的 content-free facts：

- exact Agent ref；
- entitlement snapshot digest；
- AgentResourceDecision digest；
- planned Runtime Selection v1alpha3 digest；
- exact capability lock IDs；
- separate Reasoning lock identity；
- authorization plan digests；
- Task/Runtime/Message/Checkpoint IDs；
- request/selection material digest。

`message_appended` 后恢复可以按 record 中的 exact material重新物化同一个 bundle，但：

- Agent current load count=0；
- entitlement current load count=0；
- user Preference load count=0；
- Planner run count=0；
- stable order/current Registry pointer 不重新读取；
- reconstructed selection/locks/binding digests 必须精确等于 planned values，否则 terminal typed drift。

### 6.4 首次接受固定顺序

1. strict parse accepted SubmitTurn v1alpha3；
2. 读取 existing command/client-turn；exact replay 直接返回 durable Receipt；
3. resolve exact Agent revision **恰好一次**；无 Agent 时使用 exact code-owned `agent.general`；
4. 单次解释 Agent restriction；
5. `TaskResourceEntitlementSource.loadExact()` **恰好一次**；
6. 加载 exact Registry/Workspace/authorization safe facts；
7. 读取 accepted user model preference **至多一次**；
8. `TaskToolCandidatePolicy` 单次产生 exact candidates；
9. `AgentResourceDecisionPlanner` 单次运行；
10. rejected/unavailable 在任何 durable create 前返回；
11. materialize exact Model/Tool locks 与 ReasoningModeLock；
12. create Runtime Selection v1alpha3；
13. derive Task bundle + Task Instruction Binding；
14. create coordination v1alpha4 + accepted Receipt；
15. 通过既有 coordination 推进 message append 与 R2D-3 Task bundle 原子 commit，达到 `task_committed`；
16. 从 exact durable bundle完成 Receipt，达到 `completed`；之后才允许 Agent Loop / first Provider Invocation。

步骤 9 形成 accepted plan 后不得重新读取 current Agent、entitlement、Preference、Registry ordering 或 Tool policy
改变 planned winner；步骤 15 durable commit 后更不得改变 Task winner。

### 6.5 recovery 与 replay

- crash 发生在 `accepted` / `message_appended`：恢复原 plan并继续，不对外宣称成功；
- Task bundle commit 内 fault：bundle transaction rollback，coordination 保留可恢复前态；
- `task_committed` 后 response loss：从 exact durable bundle完成或重放原 Receipt；
- same commandId + different material：typed conflict；
- same clientTurnId + different commandId：typed conflict；
- restart 从 coordination v1alpha4 / selection v1alpha3 / exact bindings 恢复；Agent/entitlement/Planner load count 均 0；
- Provider/network failure 不重新选择 Agent/Model/Skill/Tool/Knowledge；
- Reasoning lock、CPC binding 与 R2D-1 durable deadline/facts 继续复用原 Task/Invocation authority；
- terminal replay 不构建新 Task、不创建新 locks、不调 Provider。

### 6.6 authorization digest 循环边界

Runtime Selection 不把 authorization digest 放入自身 digest，以避免 circular binding；authorization selection 继续 exact
绑定 Runtime Selection digest。coordination v1alpha4 同时绑定 selection digest、authorization digest、execution identity
digest、Task bundle digest 和 Instruction Binding digest，由 coordination 状态转换与 Task bundle 局部原子 commit
共同保证同一 durable winner。

## 7. activation 与 production exclusion

新增单一 release decision：

```text
r2dCoreDeltaEnabled = false
```

三态规则：

| 状态 | 行为 |
| --- | --- |
| false | v2 Agent consumption、selection v3、coordination v4 与新 acceptance path 均不注册；既有 production 行为不变 |
| true + production entitlement/依赖缺失、重复或 test-only | Desktop runtime ready 前启动失败关闭；不得静默回旧路径 |
| true + 全 production 依赖 | 仍必须等 R2D-4 closure + 用户另行 activation 授权 |

本批结束时：

- `r2dCoreDeltaEnabled=false`；
- `productionCpcActivationEnabled=false`；
- `productionEnterpriseEntitlementReady=false`；
- production `TaskResourceEntitlementSource` count=0；
- SubmitTurn v1alpha3 production route 不得进入 selection v3 path；
- test fixture 必须显式 `testIdentityUsed=true / productionIdentityReady=false`。

## 8. typed error 与安全摘要

建议 Core-private error codes：

| code | 触发事实 | 用户安全摘要 |
| --- | --- | --- |
| `r2d.agent_revision_unavailable` | exact Agent revision 不可加载 | 机器人版本暂不可用 |
| `r2d.agent_revision_invalid` | digest/schema/restriction 损坏 | 机器人配置无法验证 |
| `r2d.entitlement_unavailable` | 可信 entitlement authority 缺失 | 当前可用资源暂无法确认 |
| `r2d.entitlement_invalid` | snapshot subject/digest/ordinal 损坏 | 当前可用资源无法验证 |
| `r2d.model_selection_rejected` | explicit model 不在 exact candidates | 所选模型不适用于当前任务 |
| `r2d.model_candidate_empty` | 交集后无模型 | 当前机器人没有可用模型 |
| `r2d.skill_selection_rejected` | requested Skill 不在交集 | 所选技能不适用于当前机器人 |
| `r2d.knowledge_selection_rejected` | requested Knowledge 不在交集 | 所选知识库不适用于当前机器人 |
| `r2d.tool_policy_unavailable` | Tool candidate authority 不可证明 | 当前工具范围暂无法确认 |
| `r2d.selection_drift` | accepted material 与 durable material 不一致 | 任务运行配置无法验证 |
| `r2d.acceptance_conflict` | command/client turn material conflict | 该请求与已接受任务不一致 |
| `r2d.acceptance_persistence_failed` | coordination 或 bundle commit 失败 | 任务暂未创建，请重试 |

要求：

- safe summary 不包含 resource IDs、digest、owner、Credential、Endpoint、路径、Zod path、SQL、stack；
- “不可用”不改写成“无权限”或“不支持”；
- explicit reject 不自动 fallback；
- coordination/bundle commit failure 不返回 accepted/success；
- typed code 可进入 content-free Receipt，原始内部原因只留受控诊断。

## 9. 并发、失败与恢复矩阵

### 9.1 决策窗口 D1～D10

| 窗口 | 断言 |
| --- | --- |
| D1 command parse 失败 | Agent/entitlement/Task/Message 全 0 |
| D2 Agent exact load 失败 | entitlement/Planner/durable 全 0 |
| D3 entitlement unavailable | Planner/durable 全 0 |
| D4 snapshot digest/subject drift | 不跳过坏记录、不用旧缓存 |
| D5 explicit model rejected | 不 fallback preference/stable，durable 全 0 |
| D6 model candidate empty | Task/locks/Receipt 全 0 |
| D7 Skill/Knowledge rejected | 不自动删除后继续创建 Task |
| D8 Tool policy unavailable | 不退化零 Tool 冒充成功 |
| D9 Planner 完成、lock materialize 前异常 | durable 全 0 |
| D10 current Agent/entitlement 在 plan 后变化 | accepted exact material不重新读取 current pointer |

### 9.2 Durable acceptance 窗口 A1～A12

| 窗口 | 断言 |
| --- | --- |
| A1 accepted plan 前 crash | Message/Task/locks/selection/Receipt 全 0 |
| A2 accepted plan committed、message append 前 crash | 中间态不对外成功；restart 继续原 plan |
| A3 message append 后、Task bundle 前 crash | restart 不重读 current Agent/entitlement/Preference |
| A4 Task bundle commit 内 fault | bundle 局部事务 rollback；coordination 保留前态 |
| A5 task_committed 后、Receipt 前 crash | strict load exact bundle并完成原 Receipt |
| A6 completed 后、response 前 crash | restart exact replay original Receipt |
| A7 两个 exact same command 并发 | single durable winner；loser exact replay |
| A8 same command different material | typed conflict，不泄原 selection |
| A9 same client turn different command | typed conflict |
| A10 Provider 首次调用失败 | Task/selection 保持原 winner，不 replan |
| A11 restart 后 Agent/entitlement current changed | load count 0，使用原 v3/v4 records |
| A12 terminal replay | Agent/entitlement/Planner/lock/Provider 全 0 |

### 9.3 built-in/compatibility C1～C10

1. historical Agent v1 + selection v1 exact recover；
2. historical Agent v1 + selection v2 exact recover；
3. Agent v2 + selection v3 strict materialization；
4. unknown selection version typed fail，不 fallback；
5. unknown coordination version typed fail，不 fallback；
6. old fixture `agent.general` exact revision 可读，新 Task 不再生成；
7. new code-owned `agent.general` 无 default model、四类 unrestricted；
8. built-in revision 更新不改历史 Task；
9. fixture agent/source production graph 不可达；
10. CPC/DFI-5.2/R2D-1/R2D-2 digest corpus 零漂移。

## 10. Threat Model

| 威胁 | 控制 |
| --- | --- |
| Renderer 自报可用资源 | entitlement 只读可信 Port；Renderer 不是 authority |
| fixed userId/OS user 冒充身份 | source graph exclusion + activation fail-closed |
| Agent unrestricted 被解释为全部允许 | 必须与 entitlement/registry/workspace 求交集 |
| empty allowlist 被解释为未配置 | strict discriminated union；Model 拒绝、其余明确零集合 |
| explicit model 不合法时 silent fallback | 真值表 typed reject + zero-side-effect |
| allowlist authored order 被当 fallback | stableOrdinal 唯一 authority |
| Prompt/Skill 文本新增 Tool | TaskToolCandidatePolicy exact authority |
| current Agent/entitlement 漂移改变已接受 Task | durable v3/v4 exact refs；recovery 零 load |
| reasoning lock 混入 capability lock | Contract cross-field invariant |
| raw entitlement/owner 泄漏 | selection/Receipt allowlist + four-channel scanner |
| 中间 coordination 状态被当作成功 | 只有 completed Receipt 对外；Provider 必须晚于 task_committed |
| commit 失败仍返回 success | Receipt 仅从 committed durable winner 返回 |
| test identity 冒充 production | evidence flags + production source count 0 + activation gate |
| scripted fixture 污染 `agent.general` | distinct ID/source graph + historical compatibility only |
| corrupted v3/v4 fallback legacy | explicit single-version dispatch |
| Provider/network error触发重选 | commit 后禁止 replan；recovery load count 0 |

## 11. 文件所有权与改动边界

### 11.1 允许修改

- `packages/contracts/src/runtime-selection/v1alpha3/**`；
- `packages/contracts/src/submit-turn-coordination/v1alpha4/**`；
- `packages/contracts/package.json` 的 exact private subpath；
- `services/core/src/application/**` 中 R2D-3 decision/planner/selection/coordinator 接缝；
- `services/core/src/ports/**` 中 entitlement、built-in Agent、Tool policy 与既有 Task bundle Port additive widening；
- `services/core/src/adapters/memory/**` 与 `services/core/src/adapters/sqlite/**` 的同批 Adapter；
- `services/core/src/bootstrap/create-desktop-private-runtime.ts` 的 disabled gate、built-in/fixture 隔离；
- `services/core/tests/**`、`packages/contracts/tests/**`、`scripts/run-r2d3*.mjs`；
- R2D 方案、实施报告、QA evidence、DEVELOPMENT-LOG、README、CHANGELOG；
- root/Core/Contracts 开发版本仅在获授权编码子批中按治理规则更新。

### 11.2 明确禁止

- `apps/desktop/**`（含 Main、Preload、IPC、Renderer）；
- `apps/admin-console/**`；
- `services/central-service/**`；
- `services/document-worker/**`；
- public Desktop SubmitTurn schema；
- Contracts root export widening；
- migration 1～26 或新增 migration 27；
- `pnpm-lock.yaml`、依赖新增/升级；
- Provider raw reasoning mapping、DFI-5.3/5.4；
- Knowledge Provider、Memory、Effect Reconciliation、Agent Lifecycle；
- production CPC activation、production enterprise entitlement 或真实 Secret。

### 11.3 停手条款

实现发现以下任一情况必须停止并回文档评审：

1. 必须新增 migration 27；
2. 必须原地修改 v1/v2 Runtime Selection 或 v1～v3 coordination；
3. 必须修改 public SubmitTurn / Desktop IPC 才能完成；
4. 现有 Task bundle transaction 无法原子承载 selection v3、locks、authorization 与 bindings；
5. 必须持久化 raw identity、entitlement、Credential、Endpoint 或 Secret；
6. 需要 production enterprise identity/entitlement 才能测试；
7. 需要 fixed userId/Fake/OS user 进入 production graph；
8. 需要把 allowlist order 当 stable order；
9. 需要 silent fallback 掩盖 explicit reject 或 drift；
10. 需要把 Agent/Skill/Prompt 文本当 Tool authority；
11. 需要删除历史 `agent.general` revision；
12. 需要让 built-in Agent 进入普通 Admin CRUD；
13. 需要启动 production CPC 或 R2D route；
14. 需要修改 Provider timeout/Max mapping；
15. root check 被并发窗口污染且无法安全隔离；
16. 发现本方案必须改动任何禁止范围。

## 12. 分批实施步骤

### 12.1 R2D-3.1（2～3 日）

1. 冻结 Entitlement Snapshot / Decision strict schemas 与 domains；
2. 新增 Runtime Selection v1alpha3 / coordination v1alpha4 exact private subpaths；
3. 新增 create/revalidate/single-dispatch helpers；
4. 加入 package build/import、root export、legacy digest conformance；
5. production consumer count 必须保持 0。

### 12.2 R2D-3.2（2～3 日）

1. 新增 Entitlement/Tool policy Ports 与 strict test adapters；
2. 实现单一 Planner、Model 真值表、Skill/Knowledge/Tool intersection；
3. 实现 BuiltInGeneralAgentSource 与 exact content/digest corpus；
4. widen Core-private readable Agent repository，不修改 public/root Contract；
5. 隔离 scripted fixture ID/source graph；
6. 验证 zero-side-effect、single-load、no-fallback。

### 12.3 R2D-3.3（3～5 日）

1. additive widen 既有 reasoning-aware Task bundle Port/validator；
2. 同批更新 InMemory/SQLite Task bundle Adapter 与同一 conformance；
3. 新增 v1alpha4 coordinator branch并复用既有四阶段状态机，旧 v1～v3 branch 零漂移；
4. 接入 Task Instruction Binding、authorization、Reasoning lock；
5. 完成 fault/recovery/concurrency matrix；
6. 加入 disabled activation gate 和 production graph exclusion；
7. 不进入 Provider/Desktop/Admin。

## 13. QA 门禁与 120 项连续矩阵

### 13.1 Contract / digest / export（QA 001～020）

1. Entitlement snapshot strict schema；
2. subject binding 必填且 digest 格式正确；
3. authority revision 进入 digest；
4. identity evidence 组合约束；
5. Model ref exact revision/digest；
6. Skill ref portable exact；
7. Tool ref portable exact；
8. Knowledge ref portable exact；
9. 四类数量上限；
10. ID 唯一；
11. ordinal 唯一；
12. ordinal 非负有界；
13. snapshot digest 重算；
14. Decision digest 重算；
15. v3 selection digest 重算；
16. v4 coordination cross-field validation；
17. v3 built JS/declaration exact import；
18. v4 built JS/declaration exact import；
19. root exports 零扩宽；
20. v1/v2/v1～v3 frozen digest corpus 零漂移。

### 13.2 Entitlement / Planner（QA 021～044）

21. production entitlement implementation count=0；
22. test adapter production unreachable；
23. single-load count=1；
24. duplicate resource整体失败；
25. duplicate ordinal 整体失败；
26. subject drift 失败；
27. snapshot digest drift 失败；
28. unrestricted 不扩张；
29. allowlist exact intersection；
30. empty Model allowlist reject；
31. empty Skill allowlist -> zero；
32. empty Tool allowlist -> zero；
33. empty Knowledge allowlist -> zero；
34. explicit exact model success；
35. explicit invalid zero-side-effect reject；
36. user preference exact success；
37. stale preference 不冒充 explicit；
38. stable fallback by ordinal；
39. allowlist order 不影响 fallback；
40. required capability intersection；
41. Skill requested drift reject；
42. Knowledge unavailable reject；
43. Tool policy unavailable fail-closed；
44. Planner 无 IO/Provider/Persistence dependency。

### 13.3 built-in / fixture / compatibility（QA 045～060）

45. `agent.general` stable ID；
46. managementClass=system_builtin；
47. exact byte material/digest；
48. 四类 unrestricted；
49. 无 default model；
50. 不绑定 scripted model；
51. 无显式 Skill/Knowledge 时为空；
52. Tool 仍走 policy；
53. Admin management projection 排除；
54. edit/delete/publish/rebind 拒绝；
55. new revision additive；
56. old exact revision readable；
57. fixture 使用独立 Agent ID；
58. fixture source production unreachable；
59. v1 Agent interpreter exact compatibility；
60. unknown Agent version 不 fallback。

### 13.4 v3/v4 selection binding（QA 061～080）

61. v3 不含 agentDefaultModelId；
62. explicit requested ID exact binding；
63. preference source 禁 requested ID；
64. fallback source 禁 requested ID；
65. resolved Model lock exact；
66. Tool locks exact unique；
67. Skill portable refs 无 materializedRef；
68. Knowledge portable refs 无 materializedRef；
69. Reasoning lock exact Model binding；
70. Reasoning ID 不在 capability IDs；
71. entitlement digest exact binding；
72. decision digest exact binding；
73. selection digest exact binding；
74. authorization selection binds selection；
75. v4 binds Task bundle；
76. v4 binds Instruction Binding；
77. v4 capability IDs exact；
78. v4 unknown version fail；
79. corrupted v4 不 fallback v3；
80. raw entitlement/owner/Provider mapping leak count=0。

### 13.5 durable coordination / bundle / concurrency（QA 081～104）

81. accepted 中间态不对外成功；
82. message_appended 中间态不对外成功；
83. Provider resolve 晚于 task_committed；
84. Invocation Link prepare 晚于 task_committed；
85. InMemory Task bundle single swap；
86. SQLite Task bundle one transaction；
87. shared bundle validator；
88. lock/selection/authorization/binding fault bundle rollback；
89. accepted 后 crash 继续原 plan；
90. message_appended 后 crash 不 replan；
91. task_committed 后 strict bundle load；
92. completed Receipt 从 exact bundle 构造；
93. exact same command single winner；
94. exact loser replay；
95. same command different material conflict；
96. same client turn different command conflict；
97. commit 后 response loss exact replay；
98. restart Agent load count=0；
99. restart entitlement load count=0；
100. restart Planner count=0；
101. Provider failure no replan；
102. terminal replay Provider count=0；
103. no partial Task bundle rows；
104. no migration 27。

### 13.6 security / regression / governance（QA 105～120）

105. production gate false route count=0；
106. gate true + entitlement missing startup fail；
107. gate true + test source startup fail；
108. production CPC activation false；
109. production enterprise entitlement false；
110. Desktop/Admin/Central consumer count=0；
111. public SubmitTurn bytes/digest零漂移；
112. DFI-5.2 Harness 回归；
113. CPC Harness 回归；
114. R2D-1 Harness 回归；
115. R2D-2 Harness 回归；
116. lint/typecheck/root check；
117. Central online 404 回归；
118. Central offline 404 回归；
119. lockfile digest 与编码前基线一致；
120. test count、source graph 和 false flags 来自真实扫描，不硬编码结果。

测试纪律：禁止 `.skip`、`.only`、`@Disabled`、sleep 猜窗口、自动重试覆盖失败、硬编码资源 0、`?? 0`、
Fake 宣称 production、只测 InMemory 不测 SQLite。

## 14. 编码后必须执行的门禁

每个获授权子批至少执行：

```text
CI=true pnpm run harness:r2d3.<subbatch>
CI=true pnpm run typecheck
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm install --frozen-lockfile --offline
```

并独立核对：

- `pnpm-lock.yaml` digest 与编码前 baseline 一致；
- migration 最大 id 仍为 26；
- Desktop/Admin/Central/Document Worker 无本批修改；
- exact package subpaths 的 built JS/declaration 可导入；
- production entitlement implementation count=0；
- gate=false route/consumer count=0；
- `agent.general` 与 scripted fixture source graph 分离。

## 15. 实施报告必须提供的证据

1. R2D-3.1～3.3 实际改动文件清单；
2. snapshot/decision/selection/coordination digest fixtures；
3. exact package subpath import evidence；
4. Model 真值表逐行结果；
5. Agent load / entitlement load / Planner 调用计数；
6. stale/rejected 时 Message/Task/Lock/Selection/Binding/Coordination/Receipt/Provider 十类计数；
7. InMemory/SQLite 同一 conformance 结果；
8. coordination A1～A12 每一窗口的状态、局部 rollback 与 exact recovery 事实；
9. same command / client turn 并发 single-winner 证据；
10. restart/replay load counts=0；
11. built-in exact material/digest 与 fixture isolation 扫描；
12. production implementation/route/consumer 真实 source graph count；
13. migration / lockfile / legacy digest 零漂移；
14. focused/root/Central/frozen install 全部门禁；
15. 上述九项 false 与最高输出。

## 16. 独立评审重点问题

1. v3 是否彻底删除旧 `agentDefaultModelId` 假设，而不是用可空字段伪装；
2. Entitlement Snapshot 是否只承载可信 exact legal facts，且 production implementation 诚实为 0；
3. explicit invalid 是否严格 reject，而不是 fallback；
4. stable order 是否只来自 entitlement ordinal；
5. Skill/Knowledge/Tool 的 empty allowlist 是否分别保持正确语义；
6. Tool candidate 是否来自 authoritative policy，而非文本或 Registry 全集；
7. `agent.general` exact 文本、无 default model 与 fixture 隔离是否可接受；
8. `task_committed` barrier 是否真阻止 Provider/Invocation 提前发生，中间态是否不对外成功；
9. authorization 与 selection digest 是否避免 circular binding；
10. 不新增 migration 27 的假设是否被现有 selection/record JSON 与 Task bundle transaction 真实支持；
11. recovery 是否完全不重读 current Agent/entitlement/Preference；
12. 7～11 日是否诚实覆盖三个子批、Core-private 双 envelope 与既有双 Adapter conformance。

## 17. 冻结与下一步

当前实施状态为：

```text
R2D-3 PLAN REVIEW PASS/CLOSED
R2D-3.1 PASS/CLOSED
R2D-3.2 PASS/CLOSED
R2D-3.3 PASS/CLOSED
R2D-3 PASS/CLOSED
```

R2D-3.2 exact material 聚焦确认、实现与独立 QA 均已由用户正式接受并 `PASS/CLOSED`。R2D-3.3 实现与独立 QA
也已由用户正式接受，R2D-3 阶段整体 `PASS/CLOSED`。R2D-4 已完成 closure-only 实现与开发者门禁，当前等待独立 QA；
这不构成 production activation 授权。DFI-5.3 子批、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、
Effect Reconciliation、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 GATED。production CPC activation、
production R2D gate 与 production enterprise entitlement 继续保持 false。
