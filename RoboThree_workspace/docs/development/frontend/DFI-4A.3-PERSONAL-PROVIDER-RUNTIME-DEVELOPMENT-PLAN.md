# DFI-4A.3 个人 Provider Runtime、Usage 与 Task 精确锁定详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED；DFI-4A.3.1～3.3 PASS/CLOSED；DFI-4A.3 PASS/CLOSED**  
> 日期：2026-08-21  
> 负责人：Codex 5.6  
> 上游：DFI-4A.0、DFI-4A.1、DFI-4A.2 `PASS/CLOSED`  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 架构依据：ADR-011、ADR-013、ADR-013 Addendum A、ADR-015、ARH-1～3、DFI-2A、DFI-4A Revision 1  

本文件已经完成 DFI-4A.3 文档评审并获用户接受；DFI-4A.3.1 已完成开发、独立 QA 与用户接受，
正式 `PASS/CLOSED`。DFI-4A.3.2 已完成范围内实现、独立 QA 与用户接受，正式 `PASS/CLOSED`；
DFI-4A.3.3 已完成范围内实现、开发者正式门禁、独立 QA 与用户接受，正式 `PASS/CLOSED`；
DFI-4A.3 阶段整体关闭。后续真实 Provider 验证发现个人 OpenAI-compatible Adapter 的 120 秒 overall
硬上限、Agent Loop 的 300 秒 deadline、timeout/network 归因和 restart deadline 延长存在独立修复需求；
[DFI-4A.3 Provider Timeout Repair Revision 1.1](./DFI-4A.3.1-REPAIR.2-PROVIDER-TIMEOUT-DEVELOPMENT-PLAN.md)
当前为 `DOCUMENT REVIEW PENDING / CODING GATED`。该 repair 不改写 DFI-4A.3 已关闭的历史结论，也不自动
解锁 DFI-4A.4 或任何新业务编码。

## 1. 阶段目标

DFI-4A.3 把已经完成的个人模型配置、Credential Broker、macOS Keychain、CRUD/Recovery 与 Reveal
Foundation 接入真实本地模型调用链，使个人模型可以在不经过 Central Model Gateway 的前提下：

1. 通过 Core 内置 OpenAI-compatible Adapter 发起受控 Streaming 调用；
2. 复用现有 Model Stream Conformance，不产生第二套 Provider stream 语义；
3. 以 `local_personal` authority 持久化调用、Usage 和状态事实；
4. 与企业模型共同参与统一的安全候选、偏好与 effective model 解析；
5. 物化为现有标准 `TaskCapabilityLock`，被 Task、Agent Loop 和 Compaction 精确恢复；
6. 在编辑、删除、权限收窄、Core 重启和调用崩溃后保持原 Task 锁定事实不漂移；
7. 明确拒绝企业模型与个人模型之间的静默 fallback；
8. 保持 Secret 只在本地 Keychain → Core Adapter 的最短生命周期内存在。

本阶段完成后可以声明“个人模型 Provider Runtime Foundation 已闭环”，但不能声明用户可在 Desktop
完成真实 CRUD、选择、默认设置或 Key 查看。公共 Desktop Safe Interface 仍属于 DFI-4A.4。

## 2. 当前代码事实与缺口

### 2.1 已存在并直接复用

- migration 23 已建立个人模型七张 `STRICT` 表：owner namespace、immutable definition、head、
  append-only status history、preference、operation journal、durable command receipt；
- `PersonalModelRuntimeRegistry.resolve()` 已按 owner identity、personalModelId、configurationRevision、
  executionDefinitionDigest 精确读取 definition/status，且 authority 固定为 `local_personal`；
- `PersonalModelDefinition` 已锁定 canonical Endpoint、Provider profile revision、Provider model id、
  capabilities、opaque credentialRef/revision/binding digest；
- DFI-4A.2 已完成 fd4/fd5 敏感通道、真实 macOS Keychain Adapter、CRUD 两阶段恢复和 owner reveal；
- `RuntimeSelectionService`、`TaskRuntimeSelection` 与 `TaskCapabilityLock` 已是 Task 模型锁定的唯一事实；
- `ModelEligibilityEvaluator` 已按 Agent 要求、实时权限、enabled、Credential 和 callable 事实纯计算；
- `ModelProviderInvocation` 已区分 assistant message 与 compaction summary，并携带 exact runtime selection、
  model lock、admission、data scope 与 deadline；
- ARH-1 `ModelStreamSequenceValidator` 已在真实 Agent Loop 唯一消费点验证 started、delta、tool call、
  usage 与 terminal；
- ARH-3 已冻结 `central_enterprise / local_personal` Usage authority、attempt identity、winner/superseded、
  invocation-level projection 与 Session 聚合；
- 现有 `provider_usage_projections` 可承载 `local_personal`，但真实个人模型 Usage authority 尚未实现；
- `PersonalModelPreference` 已支持 enterprise/personal 两类来源，personal preference 锁定精确
  configurationRevision。

### 2.2 尚不存在

- Core 本地 OpenAI-compatible 真实 Provider Adapter；
- DeepSeek、智谱、Kimi 与 custom 的版本化 Provider Profile Registry；
- migration 24 的本地个人模型 invocation/attempt/Usage durable facts；
- 真实 `LocalPersonalUsageAuthorityPort` SQLite 实现；
- 个人模型安全 Catalog candidate、eligibility、preference/effective model 解析服务；
- 个人模型到标准 `TaskCapabilityLock` 的 materializer；
- 企业 Adapter handle 与个人 Adapter handle 的 composite resolver；
- 个人模型 main invocation/compaction 的 status-first durable recovery；
- 个人模型经 Durable Agent Loop 的进程级闭环证据。

### 2.3 代码事实导出的约束

1. **不能把个人模型写入企业 Registry Generation。** 个人模型由本机 owner scope、SQLite 与 Keychain
   管理，企业 Registry generation 无权成为其事实来源。
2. **不能建立第二套 Task model lock。** Agent Loop、Compaction、Admission、Context 和恢复链已经依赖
   标准 `TaskCapabilityLock`；新建 personal lock 会导致两套状态机和恢复语义。
3. **不能复用 Central enterprise Provider。** 个人 API Key 永不发送给 Central，调用必须在 Local Core
   内完成。
4. **不能把 Provider 缺失 Usage 伪装为 0。** Provider 未返回 Usage 时保持 unknown，不生成虚假
   `ProviderUsageFact`。
5. **不能因个人模型失败自动切到企业模型。** model lock、admission 与调用结果必须保持单一上游身份。

## 3. 批次拆分与门禁

### 3.1 DFI-4A.3.1：Secure Provider + Invocation/Usage Foundation

交付：

- Core-private `PersonalModelProviderProfileRegistry`；
- DeepSeek、智谱、Kimi、custom 的版本化 OpenAI-compatible profile；
- Node 内置 HTTPS transport、Endpoint/DNS/IP/redirect/deadline/limit policy；
- SSE decoder、tool call fragment assembler、usage mapper 与 provider-neutral stream projection；
- migration 24；
- `LocalPersonalModelInvocationPersistence` 与真实 `LocalPersonalUsageAuthorityPort`；
- status observation mapper 与 exact configuration CAS；
- InMemory/SQLite/controlled TLS loopback Conformance。

不接 Task selection、Task lock、Agent Loop、Compaction、Main/Preload/Renderer；不使用真实用户 Key。

### 3.2 DFI-4A.3.2：Unified Selection + Exact Task Lock + Composite Resolver

详细方案：
[DFI-4A.3.2 统一选模、精确 Task Lock 与 Composite Resolver 详细实施方案](./DFI-4A.3.2-UNIFIED-SELECTION-EXACT-LOCK-DEVELOPMENT-PLAN.md)。

交付：

- enterprise + personal 的统一 Core-private model candidate view；
- personal status eligibility 与 preference/effective model 解析；
- `PersonalModelTaskLockMaterializer`；
- 个人模型标准 `TaskCapabilityLock` 的 exact material；
- `CompositeModelProviderResolver`；
- Task bundle 原子提交中的 personal model lock；
- edit/delete/revoke 后旧 Task exact recovery；
- InMemory/SQLite selection/lock/resolver Conformance。

不接生产 Agent Loop，不修改公共 Desktop API，不实现 Renderer。

### 3.3 DFI-4A.3.3：Agent Loop / Compaction / Recovery Closure

详细方案：
[DFI-4A.3.3 Agent Loop / Compaction / Recovery 闭环详细实施方案](./DFI-4A.3.3-AGENT-LOOP-COMPACTION-RECOVERY-CLOSURE-DEVELOPMENT-PLAN.md)。

交付：

- personal Provider 接入真实 Durable Agent Loop；
- main invocation 与 compaction summary 共用 exact personal model lock；
- I1～I5 命名崩溃窗口；
- Usage/Status/terminal 的 durable convergence；
- 两个独立 Core 进程、独立 SQLite、受控 TLS Provider 的恢复 Harness；
- 企业/个人无 fallback、权限收窄、Keychain unavailable、取消、deadline、资源归零与泄漏扫描；
- DFI-4A.3 全阶段 Closure Evidence。

不接 Desktop public CRUD/selection/reveal，不进入 DFI-4A.4、DFI-2B、DFI-3 或 TGM。

每个子批都必须经过详细方案确认、独立 QA 和用户接受；本文件评审通过不等于任何子批编码授权。

## 4. Provider Profile 与 Endpoint 语义

### 4.1 Profile Registry

Provider Profile 是 Core 内置、版本化、只读的执行事实，不由 Renderer 拼接：

```text
PersonalModelProviderProfile
  providerKind
  profileRevision
  protocol = openai_compatible
  endpointMode = api_base
  chatCompletionsRelativePath = chat/completions
  authScheme = bearer
  requestProjectionRevision
  responseProjectionRevision
  transportPolicyRevision
```

- `deepseek / zhipu / kimi` 使用版本化 Seed；Endpoint 可以由用户配置，但必须通过同一 canonical policy；
- `custom` 允许符合边界的自定义中转站；
- Profile revision 进入 immutable personal definition 和 Task lock；
- Profile 只描述协议和 projection，不持有 Endpoint、Credential 或用户身份；
- Profile 更新不得改写已存在 personal definition 或旧 Task lock。

### 4.2 API Base 拼接规则

首期将 `canonicalEndpoint` 定义为 **API base**，请求 URL 由以下规则唯一生成：

1. canonical Endpoint 必须是 HTTPS URL，禁止 userinfo、query、fragment；
2. canonical Endpoint path 保留经过 DFI-4A.1 冻结的规范化语义；
3. 在 path 末尾按单一分隔斜杠拼接固定 `chat/completions`；
4. 不接受 Renderer 或调用方额外传 request path；
5. 生成的最终 URL 再执行 normalized recheck；
6. Endpoint 已包含 `chat/completions` 时不猜测、不去重，配置必须被拒绝并要求用户填写 API base。

该决策避免 custom relay 在不同调用路径上产生重复或歧义 URL。若产品希望“用户填写完整请求 URL”，
必须在 DFI-4A.3.1 编码前回到文档评审，不能由 Adapter 自动猜测。

### 4.3 Transport Security

- 仅使用 Node 内置 `https`、`dns`、`tls`、`net`，首期不新增第三方依赖；
- 禁止 HTTP、redirect、userinfo、query、fragment、loopback、private、link-local、multicast、unspecified、
  metadata 与 Unix socket；
- DNS 解析出的全部地址都必须通过 allow policy，connect 后复核真实 `remoteAddress`；
- TLS 校验证书与 hostname，SNI/Host 绑定 canonical host；
- test-only loopback 必须由显式 test profile 开启，生产构造器不可接受该开关；
- 固定 connect/header/idle/overall deadline，调用方 deadline 只能进一步收窄；
- 固定 request/header/body/event/delta/tool-call/usage 数量与字节上限；
- `Authorization` 只进入 header，禁止进入 URL、redirect、日志、Trace、错误、Evidence；
- Credential 在请求写入前尽可能晚 resolve，在写入完成、失败、取消或 socket close 后清零。

## 5. OpenAI-compatible Projection

### 5.1 Request

- 使用 provider-neutral `ModelRequest` 生成 OpenAI-compatible request；
- `model` 只使用锁定的 `providerModelId`；
- system/user/assistant/tool message 顺序保持 canonical；
- Tool Schema 使用现有 Context Pipeline 与 Task lock 结果，不由 Adapter 重算权限；
- 不发送 Prompt Cache、Vendor routing、tracking 或未冻结扩展字段；
- requestId/transportRequestId 不进入 semantic model request digest。

### 5.2 Streaming Response

- 第一条 provider-neutral event 必须是 `started`；
- SSE 支持标准 `data:`、空行分隔与 `[DONE]`；
- `delta.content = null / "" / blank` 必须跳过，不能构造空白 `TextDelta`；
- reasoning/thinking/signature/refusal 私有字段不投影为用户正文或内部思考；
- Tool Call fragments 以 provider call index/id 稳定聚合，identity 漂移或重复失败关闭；
- Tool arguments 只有在完整合法 JSON 后才生成 canonical Tool Call；
- usage 字段必须非负、满足 OpenAI-compatible 公式；缺失字段保持 unknown；
- malformed JSON、无 terminal、oversize、非法 event、终态后 event 全部映射为
  `personal_model.protocol_incompatible`；
- 产出的 stream 仍必须经过 ARH-1 `ModelStreamSequenceValidator`，Adapter 不能自行替代状态机。

## 6. Migration 24 与 Durable Facts

### 6.1 Forward-only 规则

- migration 24 名称固定为 `dfi_4a3_local_personal_model_invocations`；
- migration 1～23 字节与 digest 不变；
- 如果 24 在编码前被其他批次占用，必须回到文档评审整体升号；
- fresh、23→24 upgrade、close/reopen 与 schema preflight 必须使用同一 migration manifest；
- 所有表为 `STRICT`，JSON 与 indexed columns 逐字段一致并重算 digest。

### 6.2 表 1：local_personal_model_invocation_links

用途：证明一个 assistant message 或 compaction summary 的本地个人模型调用身份与 durable 进度。

至少包含：

```text
invocation_kind = assistant_message | compaction_summary
invocation_link_id
authority_invocation_id
session_id / task_id / run_id / round
task_runtime_selection_id / task_runtime_selection_digest
model_lock_id / model_lock_digest
owner_scope_namespace_revision / owner_scope_digest
personal_model_id / configuration_revision / execution_definition_digest
provider_profile_revision / endpoint_identity_digest / credential_binding_digest
model_request_digest / admission_scope_digest
status = accepted | dispatching | output_started | terminal | recovery_exhausted
fencing_epoch
output_started_at? / terminal_at?
terminal_class? / typed_error_code?
created_at / updated_at / record_json / record_digest
```

禁止保存 Prompt、输出正文、delta、Tool arguments、canonical Endpoint、credentialRef、Secret、Provider body、
PID、socket、Runtime Handle 或 transport request id。

### 6.3 表 2：local_personal_provider_usage_facts

用途：实现真实 `LocalPersonalUsageAuthorityPort`：

- 以 `(authority_invocation_id, provider_attempt_key)` 唯一；
- 保存 `ProviderUsageFact` 的 exact fields、attempt disposition 与 digest；
- 同 attempt 同 digest 幂等，不同 digest typed conflict；
- 未登记 attempt 拒绝；
- terminal winner 与 superseded confirmed 分离；
- Provider 未提供 Usage 时不插入记录，不生成 0 token 投影。

### 6.4 聚合 Persistence

新增 Core-private `LocalPersonalModelInvocationPersistence`，禁止调用方顺序拼接多个 Repository 模拟原子性。
至少提供：

- prepareInvocation；
- markDispatching；
- markOutputStarted；
- commitTerminalOutcome；
- commitRecoveryExhausted；
- load/list pending；
- register/record/load usage attempt。

`commitTerminalOutcome` 在单一 SQLite 事务中提交可用的：

1. invocation terminal；
2. optional Provider Usage Fact；
3. optional `provider_usage_projections`；
4. exact personal model configuration 的 provider observation status。

Projection 必须先于任何“已消费/已完成”cursor 事实，避免 ARH-3.3.2 已修复的 Projection-before-cursor
缺陷复发。无 Usage 时 terminal 仍可提交，但 Usage 保持 unknown。

## 7. Status Observation

真实调用只允许为**实际调用的 immutable configuration revision**追加 status fact：

| 观察 | 状态收敛 | selectable |
| --- | --- | --- |
| 合法 Provider terminal success | `available` | 是 |
| HTTP 401/403 且来源是 Provider auth | `authentication_failed` | 否 |
| Provider 明确的 model-not-found error | `model_not_found` | 否 |
| DNS/connect/TLS/read/network timeout | `network_failed` | 是，可真实重试 |
| malformed SSE/schema/tool-call/protocol | `protocol_incompatible` | 否 |
| Keychain/helper/runtime adapter unavailable | `unavailable` | 否 |
| owner/entitlement/Device Trust 不成立 | `permission_denied` | 否 |

补充不变量：

- 用户取消与 Task 上层 deadline 不代表模型不健康，不更新个人模型状态；
- Provider 返回通用 429/5xx 时默认归 `unavailable` 或安全 typed transient detail，不伪造 network failure；
- status append 必须绑定 exact configurationRevision + executionDefinitionDigest；
- 旧 Task 对旧 revision 的迟到结果不能更新当前新 head；
- `network_failed` 可继续选择，成功后追加 `available`；
- status detail 只保存 typed code/digest，不保存 Provider body。

## 8. 统一候选、偏好与 Effective Model

### 8.1 Composite Candidate View

新增 Core-private `CompositeTrustedModelCatalog`：

- 企业候选继续来自现有 `TrustedModelRepository` 与 Central 顺序；
- 个人候选来自 active personal head + immutable definition + latest exact status；
- 相同 modelId 跨来源冲突失败关闭，不静默覆盖；
- Catalog Projection 只包含安全字段，不含 Endpoint、credentialRef、owner digest；
- 统一 candidate view 不是新的持久事实，权威仍分别属于 Central enterprise 与 Local personal。

个人状态 eligibility 固定：

```text
selectable: unverified, available, network_failed
blocked: authentication_failed, protocol_incompatible,
         model_not_found, unavailable, permission_denied
```

### 8.2 Preference 与选择规则

按 Model Experience Spec 冻结：

1. 有效 user preference 优先；
2. 无有效 preference 时，选择 Central 顺序中的首个可用企业模型；
3. 企业模型为空而存在可用个人模型时，返回 `personal_model.explicit_selection_required`；
4. 两类均不可用时，阻止 Task 创建并返回安全 typed error；
5. Robot/Agent 限制只改变本 Task 的 effective model，不改写 user preference；
6. 用户在无 Robot 或允许 override 的场景显式选模，只有独立 safe preference command 才能更新
   preference；现有 SubmitTurn 的 `requestedModelId` 不足以证明长期偏好 mutation intent；
7. DFI-4A.4 接入 preference command 后，preference 提交失败不得改写已锁定 Task，并返回 typed partial
   outcome；DFI-4A.3.2 不凭 requestedModelId 静默写入；
8. 删除默认模型、取消 Robot、模型停用后统一复用以上规则，不另建 fallback。

### 8.3 与 ADR-011 的关系

DFI-4A.3 不改写 ADR-011 的 Agent default/override 语义。新增纯 `ModelSelectionIntentResolver` 在
`RuntimeSelectionService` 前产生 explicit requestedModelId：

- 有 Robot/Agent 时，Agent default 与 `allowModelOverride` 仍是上层约束；
- 当前 Agent Contract 没有有序 allowed-model refs，本批不得伪造“机器人模型范围的首个可用项”；
- user preference 只在 Agent 允许 override 或无专用 Agent 限制时参与；
- Resolver 不写 Task、不写 preference、不调用 Provider；
- `RuntimeSelectionService` 仍是 Task selection 与 bundle 的唯一提交编排者。

## 9. 标准 TaskCapabilityLock 物化

### 9.1 不建立第二套 Lock

新增 `PersonalModelTaskLockMaterializer`，将 immutable personal model facts 物化为现有标准：

```text
TaskCapabilityLock
  definitionSnapshot
  bindingSnapshot
  adapterDescriptorSnapshot
  registryRevision
```

不修改 `TaskRuntimeSelection` schema，不新增 `PersonalTaskModelLock`，不把个人模型注册进企业
Registry Generation。

### 9.2 Lock Material

- `definitionSnapshot.capabilityId = personalModelId`，且必须满足 `model.*` CapabilityId 规则；
- definition revision 从 personal configuration/execution material 确定性派生；
- `CapabilitySource` 表示 RoboThree 内置 personal-model materializer/adapter 代码包的可信来源，**不表示
  模型归平台所有**；个人所有权仍由 owner identity 和 personal definition 证明；
- binding 指向 exact definition 与内置 personal OpenAI-compatible descriptor；
- `configurationRef` 使用 Core-private stable ref，绑定 owner namespace revision/digest、personalModelId、
  configurationRevision、executionDefinitionDigest；
- descriptor 固定为内置 personal adapter exact revision；
- `credentialRef` 不写入 descriptor，也不进入普通 Task Projection；resolver 通过 configurationRef 加载
  exact personal definition 后在 Core 内获得 credentialRef；
- 依据 DFI-4A.3.2 的代码事实复核，personal lock 不创建第二套 local Registry Generation；它使用
  Task bundle 已冻结的 shared `registryRevision` 作为 model/tool locks 的共同配置 epoch。personal
  integrity 由 definition/binding/descriptor revision、lock digest、authenticated configurationRef 与
  exact immutable facts 独立证明；
- Task lock 不保存 canonical Endpoint、Secret、PID、socket、Runtime Handle 或瞬时 health。

### 9.3 恢复与实时收窄

- 新 Task 只接受 active head 与 selectable status；
- Task lock 提交后，displayName/edit/new head 不改写旧 lock；
- 删除必须继续受 DFI-4A.2 usage guard 约束；存在非终态 Task lock 时视为 in use/unknown；
- 权限撤回、Credential unavailable 或 status hard-failure 只把已锁定能力收窄为不可执行，不换模型；
- 旧 revision 可从 immutable definition + Keychain ref 精确恢复；缺失/不匹配失败关闭。

## 10. Composite Provider Resolver

`CompositeModelProviderResolver` 按 lock 的 adapter descriptor/source 做穷尽分派：

```text
enterprise adapter marker
  → existing RuntimeAdapterHandles / enterprise path

built-in personal adapter marker
  → validate personal configurationRef
  → PersonalModelRuntimeRegistry.resolve(exact tuple)
  → PersonalCredentialStore.resolve(exact credentialRef)
  → LocalPersonalOpenAiCompatibleModelProvider

unknown / mixed marker
  → fail-closed
```

- 不按 modelId 字符串猜 authority；
- 不允许 enterprise lock 调用 personal adapter，反之亦然；
- 不允许 current head 替代 lock 中的 old revision；
- 不缓存 Secret 或 socket；可缓存无敏感的 immutable profile/definition digest 校验结果；
- Provider handle 仅属于当前 Core runtime，不进入 SQLite、Task lock、日志或 Projection。

## 11. Invocation Recovery：I1～I5

RoboThree 不宣称通用 exactly-once Provider billing。稳定 logical identity 与每次 transport request identity
必须分离。

| 窗口 | 持久事实 | 恢复分类 |
| --- | --- | --- |
| I1：invocation link 已提交、网络发送前崩溃 | accepted，无 output | 同 logical invocation、新 transport request 可安全恢复 |
| I2：Provider 已接受但无 output evidence | dispatching，无 outputStartedAt | status-first；只在同 exact lock、admission、deadline 仍有效时保守重试，并承认可能重复计费 |
| I3：已出现任意 output 后崩溃 | outputStartedAt 已持久 | `personal_model.invocation_resume_unavailable`，不自动重试、不拼 partial output |
| I4：完整 Provider terminal 只存在于死亡进程内存 | durable terminal 不存在 | recovery exhausted；不伪造 Assistant Message/Summary/Usage |
| I5：terminal/usage/status 已提交但调用方响应丢失 | durable terminal 存在 | 幂等重放安全 terminal facts；正文未 durable commit 时仍不得重建正文 |

补充规则：

- 每次网络 attempt 使用新 transport request id；logical authorityInvocationId/providerAttemptKey 稳定；
- outputStartedAt 必须在向上游 consumer 暴露第一条 ephemeral output 前 durable 提交；
- ephemeral delta 永不写 SQLite；
- main invocation 与 compaction 使用相同 model lock，但拥有独立 invocation link identity；
- compaction 不重新读取 preference/current head，不换模型 revision；
- admission 在重启后仍须校验 purpose、scope 和 exact lock；
- cancel 不复活，late terminal 不能覆盖已收敛终态。

## 12. Error、Receipt 与安全边界

复用主计划既有 `personal_model.*` error family，并补充/冻结：

```text
personal_model.provider_profile_unsupported
personal_model.endpoint_rejected
personal_model.authentication_failed
personal_model.network_failed
personal_model.protocol_incompatible
personal_model.model_not_found
personal_model.invocation_resume_unavailable
personal_model.invocation_identity_conflict
personal_model.usage_conflict
personal_model.explicit_selection_required
```

- typed error 只含 code、retryable、safe next action；
- 不返回 Provider body、Endpoint path、credentialRef、Secret、owner digest、stack 或任务正文；
- Invocation Receipt 不是 Assistant Message、Summary、Usage 或 status 的第二事实源；
- Usage 只来自真实 Provider fact，不按本地 token estimator 伪造；
- 状态变化不等于连接测试，本阶段仍无“测试连接”操作；
- 生产、测试、Evidence 四通道均扫描唯一 canary 的 raw/base64/url-encoded/hex 形态；
- 扫描另覆盖 credential、endpoint、prompt/output body、local path 五类 marker；
- test fixture 只使用受控假 Key，禁止用户真实 Key。

## 13. 修改边界

### 13.1 DFI-4A.3 编码授权后可修改

- `services/core/src/application/**`；
- `services/core/src/ports/**`；
- `services/core/src/adapters/https/**`、`memory/**`、`sqlite/**`；
- `services/core/src/reliability/**`（仅复用/接入，不重写 ARH-1 状态机）；
- `services/core/src/bootstrap/**` 或现有 runtime composition root；
- `services/core/tests/**`；
- `scripts/run-dfi4a3*.mjs`；
- 版本、CHANGELOG、DEVELOPMENT-LOG 与必要 README 只在每个获授权编码批次收口窗口修改。

### 13.2 默认不修改

- `packages/contracts` 生产 schema：计划复用现有 TaskCapabilityLock/TaskRuntimeSelection/ModelRequest；
- `apps/desktop/src/main/**`、`preload/**`、`renderer/**`；
- `services/central-service/**`；
- `services/document-worker/**`；
- Kernel reducer；
- migration 1～23；
- 根 `package.json`、`tsconfig.json`、依赖与 `pnpm-lock.yaml`。

如果编码事实证明必须修改公共 Contract、现有 Task lock schema、Central、Main/Preload 或新增依赖，必须停止
编码并回到文档评审，不能以“最小补丁”为由越界。

## 14. QA 验收矩阵（96 项）

### 14.1 Identity / Profile / Contract（1～12）

1. personalModelId、providerModelId、displayName 不混写；
2. profile revision 确定性且旧 revision 可恢复；
3. API base 拼接只有一种结果；
4. 已含 chat/completions 的 base 失败关闭；
5. Endpoint identity/profile/execution digest tamper 拒绝；
6. CapabilitySource 只表示可信代码 provenance，不冒充个人模型 ownership；
7. configurationRef 不含 Secret/canonical Endpoint/credentialRef；
8. standard TaskCapabilityLock strict parse 通过；
9. TaskRuntimeSelection schema 与 digest 不变；
10. enterprise/personal authority 混配失败关闭；
11. unknown adapter/profile revision 失败关闭；
12. public Contract 与 v1alpha1/v1alpha2 现有 schema 零漂移。

### 14.2 HTTPS / SSE / Provider Projection（13～32）

13. HTTPS-only；14. userinfo/query/fragment 拒绝；15. redirect 拒绝；16. loopback/private/link-local 拒绝；
17. metadata/multicast/unspecified 拒绝；18. mixed DNS 拒绝；19. connect 后 remoteAddress 复核；
20. TLS CA/hostname/SNI/Host 正确；21. invalid certificate 拒绝；22. connect/header/idle/overall deadline；
23. request/header/body/event/delta limits；24. cancel/socket close 资源归零；25. Authorization 仅 header；
26. canonical request projection；27. started 首事件；28. blank/null content 跳过；29. tool fragment 稳定聚合；
30. invalid JSON/identity drift 拒绝；31. usage 公式和 unknown；32. terminal 后事件/自然结束 fail-closed。

### 14.3 Migration / Persistence / Usage / Status（33～52）

33. migration 24 fresh；34. migration 23→24 upgrade；35. migration 1～23 未改写；36. close/reopen；
37. `STRICT`/FK/CHECK/index 完整；38. record_json/indexed columns 一致；39. invocation prepare 幂等；
40. 同 identity 不同 digest conflict；41. fencing epoch stale owner 拒绝；42. outputStartedAt 顺序；
43. terminal aggregate atomicity；44. Usage attempt 先登记；45. 同 attempt 幂等；46. 不同 usage digest conflict；
47. winner/superseded 分离；48. Provider 缺 Usage 不伪造 0；49. projection-before-cursor；
50. exact configuration status append；51. stale old revision 不更新新 head；52. cancel/deadline 不污染 status。

### 14.4 Catalog / Preference / Lock / Resolver（53～74）

53. enterprise 与 personal 候选合并稳定；54. 跨来源同 modelId conflict；55. safe candidate 无敏感字段；
56. unverified selectable；57. available selectable；58. network_failed selectable；59. 五类 hard failure 不可选；
60. user preference 优先；61. enterprise first fallback；62. enterprise 空 + personal 可用要求显式选择；
63. 全不可用阻止 Task；64. Agent default 保持 ADR-011；65. override forbidden；66. Robot effective 不改 preference；
67. preference 只由独立显式 safe command 写入，不凭 requestedModelId 推断；68. preference partial failure 不改 Task；69. standard lock materialization；
70. shared Task registryRevision + personal exact integrity 证明稳定；71. current head 变化旧 lock 不变；72. exact old revision resolver；
73. permission/credential 收窄不换模型；74. enterprise/personal resolver 无 fallback。

### 14.5 Recovery / Agent Loop / Compaction / Security（75～96）

75. I1；76. I2；77. I3；78. I4；79. I5；80. new transport id + stable logical identity；
81. partial output 不 durable；82. Assistant terminal 单一；83. Compaction terminal 单一；
84. main/compaction exact same lock；85. compaction 不读 current preference/head；86. purpose-bound admission 保持；
87. Core restart exact recovery；88. SQLite reopen；89. Keychain locked/unavailable；90. 权限状态 2/3；
91. edit/delete/revoke 竞争；92. 真实 50-round/rolling compaction 回归；93. 企业/个人无 fallback E2E；
94. 四通道五类 marker 多编码泄漏 0；95. timer/socket/request/subscription/child/keychain handle 全归零；
96. Workspace、Central online/offline 严格串行全绿且无 DFI-4A.4/DFI-2B/DFI-3/TGM 超前。

## 15. 验证门禁

每个子批详细方案必须给出 focused command。全阶段最低门禁：

```bash
source ~/.nvm/nvm.sh
nvm use 24.13.0
cd /Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace
CI=true pnpm exec vitest run <DFI-4A.3 focused suites>
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

- 正式 Harness、Workspace、Central online/offline 必须严格串行；
- 网络自动化使用受控 TLS Provider，不需要用户真实 Key、外网或费用；
- 真实 public relay/provider conformance 若未来需要，单独设 Resource Gate，不作为 Foundation 的偷换门槛；
- DFI-4A.3.3 必须使用真实子进程、真实 SQLite reopen 与现有真实 Keychain test activation；
- QA Evidence 只允许 count、digest、status、duration、typed error、资源指标，不含正文和敏感身份。

## 16. 工作量

| 子批 | 集中工程工作日 |
| --- | ---: |
| DFI-4A.3.1 Secure Provider + Invocation/Usage Foundation | 5～8 |
| DFI-4A.3.2 Selection + Exact Lock + Composite Resolver | 5～8 |
| DFI-4A.3.3 Agent Loop/Compaction/Recovery Closure | 7～12 |
| 合计 | **17～28** |

相较主计划原 8～13 日上调，是因为当前代码事实要求同时完成安全 HTTPS/SSE、migration 24 durable
invocation/Usage、标准 Task lock materialization、统一选模和进程级恢复闭环。该调整是工程工作量估算，
不是日历或上线承诺。

## 17. 文档评审问题

请评审者基于当前代码逐项回答：

1. 个人模型不进入企业 Registry Generation、但复用标准 `TaskCapabilityLock`，是否是最小正确方向；
2. `CapabilitySource` 仅表示内置 materializer/adapter 代码 provenance，而个人 ownership 仍由 owner facts
   证明，是否存在语义冲突；
3. configurationRef 承载 exact safe identity、descriptor 不保存 credentialRef，是否足够恢复且不泄漏；
4. personal lock 使用 Task bundle shared registryRevision、而 personal authority/integrity 由 exact lock
   material 单独证明，是否是当前公共 Contract 下的最小正确方案；
5. migration 24 两表 + 既有 provider_usage_projections 是否最小，是否缺少必要 durable fact；
6. terminal/Usage/status 的聚合 Transaction 与 Projection-before-cursor 是否完整；
7. API base + 固定 `chat/completions` 规则是否与产品 Endpoint 语义一致；
8. OpenAI-compatible SSE/tool call/usage projection 是否覆盖 DeepSeek、智谱、Kimi与 custom relay 最小交集；
9. I1～I5 是否诚实区分恢复与无法恢复，是否存在伪 exactly-once；
10. `ModelSelectionIntentResolver` 与 ADR-011 Agent default/override 的边界是否清晰；
11. user preference、enterprise first、personal explicit selection、Robot effective model 是否与产品 Spec 一致；
12. DFI-4A.3.1～3.3 拆分、3.3 的 80 项 Closure QA 与总体 17～28 日是否可执行；
13. 是否需要公共 Contract、Main/Preload/Central 变更；若需要，是否应在编码前回文档评审；
14. 是否出现新的 P0/P1/P2/P3 或需要用户重新决策的产品范围。

## 18. 门禁状态

```text
DFI-4A.0        PASS/CLOSED
DFI-4A.1        PASS/CLOSED
DFI-4A.2.1      PASS/CLOSED
DFI-4A.2.2      PASS/CLOSED
DFI-4A.2.3      PASS/CLOSED
DFI-4A.2        PASS/CLOSED

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

DFI-4A.3 计划已复核并由用户接受；DFI-4A.3.1～3.3 均已完成实现、独立 QA 和用户接受，
DFI-4A.3 阶段整体正式 `PASS/CLOSED`。DFI-4A.4 只进入详细方案文档评审，编码继续 `GATED`。
