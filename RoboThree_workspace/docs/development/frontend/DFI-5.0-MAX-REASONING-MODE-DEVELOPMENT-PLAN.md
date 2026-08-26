# DFI-5.0 Max Reasoning Mode 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED；DFI-5.1 PASS/CLOSED；DFI-5.2 PLAN REVIEW PASS/CLOSED；DFI-5.2.1 PASS/CLOSED；DFI-5.2.2 DOCUMENT REVIEW PENDING / CODING GATED**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 产品上游：PRD v1.6 Final Revision 12、Frontend Experience Spec Revision 14、Model Experience Spec Revision 3、MVP 功能基线  
> 工程上游：DFI-3A、DFI-4A.3、DFI-4A.3.1 repair.2 均 `PASS/CLOSED`  
> 评审结论：独立文档复核 `PASS（P0=0、P1=0、P2=0、P3=0）`；DFI-5.1 独立 QA P0～P3 全 0 并由用户正式接受关闭；DFI-5.2 仅进入详细方案评审，编码仍 `GATED`

## 0. 目标与结论边界

DFI-5 把新任务 Composer 的单一 `Max` 开关从产品语义落成可验证的任务级运行事实：

```text
用户请求 default | max
  → Core 读取当前有效模型的受控支持事实
  → 提交时锁定请求态与实际解析态
  → Model Protocol 携带 adapter-neutral 策略引用
  → 精确 Adapter 映射 Provider 私有参数
  → main / Tool 后续轮次 / compaction / retry / restart 复用同一锁
```

产品语义固定为：

- `default`：RoboThree 不发送额外 Effort、Thinking Level 或推理预算参数，不代表强制最低档；
- `max`：只在当前模型、能力版本和 Adapter Profile 已验证时使用最强受控策略；
- 提交前已经明确显示 `unsupported/unknown` 时，用户仍可提交，并锁定为模型默认模式；
- 页面曾显示 `supported`，但提交时能力或映射发生漂移时，必须返回 typed stale，由用户刷新后重新提交，不能静默降级；
- Task 创建后锁定请求态与解析态；全局偏好变化不影响当前 Task；
- 不把 `maxOutputTokens` 当成 Max，不向用户展示 `high/xhigh`、thinking budget 或 Provider 参数名。

本方案全部通过、各编码子批独立 QA 并由用户接受后，DFI-5 最多允许声明：

```text
DFI5_MAX_REASONING_MODE_CONFORMANT
```

不得据此声明：

```text
所有模型均支持 Max
Provider 默认行为永久不变
Max 保证更高质量、更快或固定费用
production Enterprise Identity ready
Admin / Robot / Personal Model 配置面支持推理档位
MiniMax SSE terminal profile 已兼容
Knowledge Provider / TGM ready
```

## 1. 当前代码事实与结构缺口

### 1.1 已存在且必须复用

1. `TaskCapabilityLock` 已锁定 definition、binding、adapter descriptor 三层快照；不得创建第二套 Model lock；
2. `TaskRuntimeSelection v1alpha1` 已锁定 Agent、有效模型、Tool、Knowledge、workspace、Registry 与 prompt revision，
   `selectionDigest` 覆盖完整 material；
3. SubmitTurn `v1alpha2` 已有 strict selection request、coordination record、Task bundle 原子提交、durable Receipt、
   retry/restart 恢复和 Agent Loop 启动；
4. `ModelRequest v1alpha1` 由 `ModelMessageConverter` 统一生成并把完整请求 material 纳入 `requestDigest`；
5. main Agent Loop 与 initial/rolling compaction 已复用同一 Task-locked Model Provider Resolver；
6. Enterprise 路径经 Core `EnterpriseModelRequestConverter` → Gateway v1alpha1/v1alpha2 → Central Provider Adapter；
7. Local Personal 路径直接消费 `ModelRequest`，DFI-4A.3.1 repair.2 已提供 30 秒 connect、90 秒 first progress、
   300 秒 idle、900 秒 overall 的 durable timeout policy；
8. Provider 未返回 Usage 时保持 unknown，不伪造 0；
9. Desktop 已有真实模型/机器人选择与 Task Runtime Selection 摘要，Renderer 的 Max 控件仍未编码；
10. 企业 SSO / production identity 已明确延期，测试阶段允许 test-only identity，但不能冒充 production ready。

### 1.2 不能原地扩展的冻结事实

| 现有事实 | 原因 | DFI-5 决策 |
| --- | --- | --- |
| `TaskCapabilityLock` 三层快照 | 表达通用 Capability，不表达用户推理偏好 | 新增独立 `ReasoningModeLock`，引用而不改写三层快照 |
| `TaskRuntimeSelection v1alpha1` strict | 没有推理模式字段 | 新增 `v1alpha2`，旧 v1alpha1 继续只读 |
| Desktop SubmitTurn `v1alpha2` strict | 没有 requested/support revision | 新增 SubmitTurn `v1alpha3`，不改写 v1alpha2 |
| `ModelRequest v1alpha1` strict | 只有 `maxOutputTokens` | 新增 Model Protocol `v1alpha2` |
| Enterprise Gateway v1alpha1/v1alpha2 strict | v1alpha2 已服务 Prompt Cache sidecar | Max 进入 additive Gateway `v1alpha3`，不改写旧版本 |
| `personal_model_preferences` | 业务对象是默认模型选择 | 新建 Desktop Experience Preference，不混入个人模型表 |

### 1.3 当前缺口

1. 没有受控、版本化、绑定 exact model/adapter revision 的 Reasoning Profile；
2. Renderer 没有安全的 `supported | unsupported | unknown` 查询面；
3. 没有独立 Max 体验偏好 Port、CAS record 和 durable Receipt；
4. SubmitTurn 没有请求态、观察到的支持态与 support revision；
5. Task Runtime Selection 没有 ReasoningModeLock；
6. Model Protocol、Enterprise Gateway 和三类 Provider Adapter 都没有 lock-bound reasoning strategy；
7. main、Tool 后续轮次与 compaction 目前无法携带同一策略；
8. 没有 supported→drift 的 stale 失败关闭与跨重启 E2E。

## 2. 七项结构修订关闭映射

| 评审发现 | 本方案关闭方式 |
| --- | --- |
| P2-1 锁定落点不明确 | §4 独立 `ReasoningModeLock`；嵌入 `TaskRuntimeSelection v1alpha2` 并进入 selection digest，不修改通用 Capability Snapshot |
| P2-2 Model Protocol 不能借用 `maxOutputTokens` | §6 新建 Model Protocol v1alpha2；strategy ref 进入 request digest；旧 v1alpha1 零漂移 |
| P2-3 前端支持态 Contract 缺失 | §3 新建安全 Preview/Projection，只返回三态、revision 与 safe reason |
| P2-4 default 语义容易过度承诺 | §4.4 固定 `default_passthrough` 只承诺省略额外参数，不声称锁定 Provider 的永久默认实现 |
| P2-5 submit 瞬间能力漂移 | §5.3 exact support revision CAS；supported 后漂移返回 `reasoning_selection_stale`，Task 副作用前失败 |
| P2-6 全局偏好不应混入个人模型表 | §7 独立 Experience Preference + migration 26 + CAS + durable Receipt；production owner 不可信时保持 unavailable |
| P2-7 deadline / Usage / retry | §8 Profile 绑定受控 timeout policy；UI 无权放大；Usage unknown 保留；不增加 Tool round/retry/权限预算 |

## 3. Reasoning Profile 与安全支持态

### 3.1 Core-private Reasoning Profile

新增版本化、不可变的 Core/Central internal profile：

```text
ReasoningProfileV1
  profileId
  profileRevision
  profileDigest
  subject:
    modelCapabilityId
    modelCapabilityRevision
    adapterDescriptorId
    adapterDescriptorRevision
    authority = central_enterprise | local_personal
    personalExecutionDefinitionDigest?   # 仅个人模型
  support = supported | unsupported | unknown
  maxStrategy?:
    strategyId
    strategyRevision
    strategyDigest
    mappingKind = effort_level | boolean_thinking | bounded_budget_preset
    timeoutPolicyRef
  safeUnavailableReasonCode?
```

规则：

1. `supported` 必须有且只有一个 `maxStrategy`；`unsupported/unknown` 禁止携带策略；
2. Profile 必须绑定 exact model capability 与 exact adapter descriptor revision；
3. 个人模型还必须绑定 `executionDefinitionDigest`，不能只按显示名称或 `providerModelId` 猜测；
4. raw Provider 参数名、档位值和预算值只存在于 Provider-private mapping registry，不进入公共 Contract、Task lock、
   Renderer、日志或 Receipt；
5. Profile 变更必须产生新 revision/digest，不得在同 revision 下改映射；
6. 未找到 Profile 是 `unknown`，不是 `unsupported`，更不是默认 supported；
7. Profile 来源只能是代码审计过的 built-in registry 或未来受控发布事实，不接受 Renderer/Main/env/CLI 自报。

Profile authority 按模型来源分离：

- Enterprise：Central 治理面持有 Provider-private mapping；immutable published revision 经既有 Registry
  Generation 向 Local Core materialize **安全支持事实**，Core 不持有 Central raw mapping；
- Local Personal：Local Core 持有绑定 exact personal execution definition 的 private mapping，不发送 Central，
  也不创建第二套 enterprise Registry Generation；
- 两条 authority 可共享 canonical Profile/Strategy schema 与 fixture，但不共享 mutable registry、Credential、
  Endpoint 或 raw mapping store。

### 3.2 安全支持态 Projection

Desktop Local additive `v1alpha3` 新增：

```text
PreviewReasoningModeQuery
ReasoningModePreview
GetReasoningModePreferenceQuery
UpdateReasoningModePreferenceCommand
ReasoningModePreferenceReceipt
```

`ReasoningModePreview` 只允许：

```text
effectiveModelId
effectiveModelRevision
maxSupport = supported | unsupported | unknown
maxSupportRevision
safeUnavailableReason?
preference = default | max
preferenceRevision?
preferencePersistence = available | unavailable
testIdentityUsed
productionIdentityReady
```

禁止返回：

- `high/xhigh`、thinking budget、raw Provider 参数名；
- adapter capability string、完整 Reasoning Profile、Endpoint、Credential Reference；
- Provider 私有模型标识、profile material 或 mapping JSON；
- owner scope digest、企业 token、权限内部事实。

Preview 使用与 SubmitTurn 相同的 `UnifiedModelSelection` / effective model 规则，但只读、不创建 Task、不写 preference、
不生成 Capability Lock。换模型、换机器人或约束改变时必须重新查询，Renderer 不缓存上一模型的支持态。

在 DFI-5.3 的 exact Provider mapping 与 DFI-5.2 的 Task lifecycle 尚未同时安装前，生产 Projection 不得返回
`supported`。Desktop compatibility 的 `max_reasoning_mode` feature 只在 safe Preview、SubmitTurn v1alpha3、
ReasoningModeLock、Model Protocol v1alpha2、至少一个真实 Profile mapping 与 Main/Preload 接线全部安装时投影；
半装配状态保持 feature absent / typed unavailable，不以测试 fixture 标记 ready。

### 3.3 `maxSupportRevision`

固定 canonical material：

```text
domain = robothree.reasoning-mode-support.v1\n
effectiveModelId
effectiveModelRevision
modelCapabilityRevision
adapterDescriptorId
adapterDescriptorRevision
profileId | null
profileRevision | null
profileDigest | null
support
safeUnavailableReasonCode | null
```

输出为 `sha256:<64 lowercase hex>`。它不包含 raw mapping、Secret、Credential、Endpoint、owner 或文案。

## 4. ReasoningModeLock 与 Task Runtime Selection

### 4.1 独立锁结构

新增 `ReasoningModeLock v1alpha1`：

```text
schemaVersion
reasoningModeLockId
taskId
modelLockId
modelLockDigest
requestedMode = default | max
resolution =
  default_passthrough
  | max_applied
  | max_unsupported_default
  | max_capability_unknown_default
maxSupportRevision
profileRef?        # max_applied only
strategyRef?       # max_applied only
timeoutPolicyRef
lockedAt
reasoningModeLockDigest
```

强约束：

- `default_passthrough` 只能对应 `requestedMode=default`，禁止 Profile/Strategy；
- `max_applied` 只能对应 `requestedMode=max + supported`，必须有 exact profile/strategy；
- `max_unsupported_default` / `max_capability_unknown_default` 只能对应 `requestedMode=max`，禁止 strategy；
- lock 必须引用当前 Task 的 exact Model lock id/digest；
- raw Provider 参数和预算永不进入 lock；
- lock digest 使用独立 domain-separated canonical SHA-256；
- 一个 Task 只有一个 ReasoningModeLock，不能在后续轮次替换。

### 4.2 `TaskRuntimeSelection v1alpha2`

新版本在 v1alpha1 material 基础上新增：

```text
reasoningModeLock
```

`selectionDigest` 覆盖整个 lock。历史 v1alpha1 Task：

- 继续按 v1alpha1 strict schema 读取；
- 语义等价于历史任务没有 DFI-5 锁，不补造 `default_passthrough`；
- 重试/恢复继续走历史请求，不迁移、不改写历史 digest；
- 不允许把历史 Task 自动升级成 Max。

`task_runtime_selections.selection_json` 已是 JSON 主事实且索引字段不需要推理模式，因此本批不为 Runtime Selection
新增表或 migration；Persistence 必须使用 v1alpha1/v1alpha2 discriminated union，并分别重算对应 digest。

### 4.3 单一 Model lock

ReasoningModeLock 只引用既有 Model `TaskCapabilityLock`：

- 不复制 definition/binding/adapter snapshots；
- 不创建第二套 model selection；
- 不改变 `registryRevision` 的企业 Task bundle epoch 语义；
- personal model 继续用 `pmcfg1` exact configuration ref 与 execution definition digest 证明真实性；
- Provider Resolver 先验证 Model lock，再验证 ReasoningModeLock 与之 exact 绑定。

### 4.4 default 的诚实语义

`default_passthrough` 只保证：

```text
RoboThree 每次调用都省略额外 reasoning 参数
```

它不保证：

```text
Provider 永久使用 Medium
同一 Provider 未来默认质量/耗时/费用完全不变
不同 Provider 的默认行为等价
```

安全摘要固定为“模型默认模式”，不得显示“最低推理”“关闭推理”或具体档位。

## 5. SubmitTurn v1alpha3 与解析规则

### 5.1 请求形状

在 Desktop Local `v1alpha3` 新增 strict SubmitTurn：

```text
reasoningPreference:
  requestedMode = default | max
  observedMaxSupport = supported | unsupported | unknown
  observedMaxSupportRevision
```

`reasoningPreference` 进入 SubmitTurn command digest。Renderer 不提交 strategy、profile、raw 参数或 budget。

### 5.2 原子计划与持久化

固定顺序：

1. strict parse SubmitTurn v1alpha3；
2. 读取同一 frozen selection context；
3. 解析 effective model；
4. 准备 exact Model lock；
5. 用该 Model lock 查询 Reasoning Profile；
6. 校验 observed support/revision；
7. 生成 ReasoningModeLock；
8. 生成 TaskRuntimeSelection v1alpha2 与 selection digest；
9. 在 SubmitTurn coordination record 记录完整 reasoning plan；
10. 与 Task、Capability Locks、Runtime Selection、Authorization facts 一次原子提交；
11. Receipt 返回 Core 生成的安全 locked summary；
12. 启动 Agent Loop。

禁止“先提交 Task，再补 Reasoning lock”，也禁止 Adapter 第一次调用时才临时读取全局偏好。

### 5.3 支持态与漂移真值表

| 用户请求 | 页面观察 | 提交时事实 | 结果 |
| --- | --- | --- | --- |
| default | 任意 | 任意 | `default_passthrough`；不发送额外参数 |
| max | supported | exact same supported revision | `max_applied` |
| max | unsupported | exact same unsupported revision | `max_unsupported_default` |
| max | unknown | exact same unknown revision | `max_capability_unknown_default` |
| max | supported | revision/status/profile/strategy 任一漂移 | `reasoning_selection_stale`；Task 副作用前失败 |
| max | unsupported/unknown | revision/status 发生变化 | `reasoning_selection_stale`；刷新后重提 |
| max | supported | exact profile 无法加载或 digest 不匹配 | `reasoning_profile_unavailable`；不得静默默认 |

页面已明确提示 unsupported/unknown 时 fallback 是用户可见、可审计的解析结果；页面曾显示 supported 时静默 fallback
违反诚实性，因此失败关闭。

### 5.4 Receipt / Task 摘要

只返回：

```text
requestedMode
resolvedMode = model_default | max
resolutionReason = requested_default | applied | unsupported | capability_unknown
lockedSummary
reasoningModeLockDigest
```

不返回 raw mapping、budget、Profile material、内部 unavailable message。`resolvedMode=max` 只能来自 `max_applied`。

## 6. Model Protocol v1alpha2 与全生命周期消费

### 6.1 Additive Model Protocol

新增 `ModelRequest v1alpha2`，在 v1alpha1 material 基础上增加：

```text
reasoning:
  mode = default_passthrough | locked_max_strategy
  reasoningModeLockDigest
  strategyId?
  strategyRevision?
  strategyDigest?
  timeoutPolicyRef
```

整个 `reasoning` 进入 `requestDigest`。禁止：

- 使用 `maxOutputTokens` 表示 Max；
- Adapter 根据全局偏好、模型名或当前 Catalog 临时重算；
- v1alpha1 请求带 reasoning 字段；
- `default_passthrough` 带 strategy；
- raw Provider 参数进入 Model Protocol。

### 6.2 main / Tool / compaction / retry / restart

以下所有请求必须由同一 Task Runtime Selection v1alpha2 的 ReasoningModeLock 生成：

1. 初次 assistant message；
2. Tool Call 结果后的下一轮；
3. 用户补充输入后的后续轮；
4. initial compaction summary；
5. rolling compaction summary；
6. retry；
7. Core restart 后 recovery；
8. terminal replay（直接 replay durable 事实，不重新调用 Provider）。

`ModelMessageConverter`、Context Pipeline、Compaction Summarizer 只接收 lock-bound adapter-neutral material，
不得各自复制支持判断。

### 6.3 Enterprise Gateway additive v1alpha3

Enterprise Model Gateway v1alpha1/v1alpha2 保持零漂移；v1alpha3 的 `modelRequest` 才允许 safe reasoning strategy ref。

Central 必须：

- 重算 Gateway request digest；
- 将 strategy ref 与 exact published model/binding/adapter revision 对齐；
- 由 Provider-private registry 解析 raw mapping；
- mapping 不匹配时在发出上游请求前失败；
- 不让 Core 或 Renderer直接提交 Provider 参数。

## 7. Desktop Experience Preference

### 7.1 独立业务对象

新增 Core-private Port：

```text
DesktopReasoningModePreferencePersistence
load(owner)
commit(commandId, requestDigest, expectedRevision, nextMode)
loadReceipt(commandId)
```

偏好只保存 `default|max`，不保存 model id、strategy、Profile、support state 或 Task lock。

### 7.2 migration 26

若编码授权时 migration 26 已被其他批次占用，必须停止回文档评审，不得静默改号。

偏好 owner 使用独立 `DesktopExperiencePreferenceOwnerIdentity`，其原始 material 仍是 Runtime Active
`enterpriseId + userId + deviceId`，但必须使用独立 HMAC domain：

```text
robothree.desktop-experience-preference-owner.v1\n
```

不得复用 Personal Model、Prompt Cache 或 Enterprise Session 的 namespace key/digest。Additive 新增三张
STRICT 表：

```text
desktop_experience_owner_scope_namespaces
  owner_scope_namespace_revision
  namespace_key
  namespace_key_check_digest
  lifecycle_state = active
  created_at
  record_json
  record_digest
  partial unique(active)

desktop_reasoning_mode_preferences
  owner_scope_namespace_revision
  owner_scope_digest
  preference_revision
  requested_mode
  updated_at
  record_json
  record_digest
  PK(owner tuple)

desktop_reasoning_mode_preference_receipts
  owner_scope_namespace_revision
  owner_scope_digest
  command_id
  request_digest
  expected_preference_revision
  committed_preference_revision
  requested_mode
  outcome = preference_committed
  committed_at
  receipt_json
  receipt_digest
  PK(owner tuple, command_id)
```

偏好与 success Receipt 同一 SQLite transaction 提交；同 commandId + requestDigest replay 原 Receipt，不同 material
返回 idempotency conflict。conflict/unavailable 不得伪造 durable success Receipt。不得使用 LocalStorage、
SessionStorage、Renderer store、Personal Model namespace 或个人模型 preference 表伪装持久化。

### 7.3 owner authority 与当前发布边界

偏好 owner 只能来自 Runtime Active enterprise/user/device tuple 的可信 authority，经上述独立 domain 派生；或
test/dev 明确 test-only owner：

- test/dev：`testIdentityUsed=true`、`productionIdentityReady=false`；
- production 无可信 owner：`preferencePersistence=unavailable`，读取默认 `default`，更新 typed unavailable；
- 不使用 fixed userId、OS user、Main/Renderer 参数或“数据库只有一行”推断 owner；
- production preference unavailable 不阻断当前 Composer 的显式 `reasoningPreference` 提交；
- UI 不得在 Receipt 前显示“已保存”。

## 8. Provider Mapping、deadline 与 Usage

### 8.1 Adapter-private 映射

| mappingKind | Provider-private 行为 | 公共面允许看到 |
| --- | --- | --- |
| `effort_level` | 使用 Profile 固定的最高已验证档位 | `max` |
| `boolean_thinking` | 开启已验证的布尔 thinking | `max` |
| `bounded_budget_preset` | 使用审计过的有界预算 preset | `max` |

Generic OpenAI-compatible 或任意个人 Endpoint 不默认支持 Max。只有 exact Profile 证明当前 model + adapter +
execution definition 时才能投影 supported。

### 8.2 default 参数省略

每类 Adapter 都必须有 body-level 断言：

- `default_passthrough` 不出现 reasoning/effort/thinking/budget 相关字段；
- fallback default 与显式 default 使用相同省略语义；
- `max_applied` 只出现 Profile 允许的 exact 字段；
- strategy digest 不匹配时零上游请求。

### 8.3 timeout policy

Timeout 不由 UI 调整。`timeoutPolicyRef` 是 Reasoning Profile 与 ReasoningModeLock 的受控事实：

- Local Personal 首批复用已验收的 DFI-4A.3.1 repair.2 policy：30s connect / 90s first progress /
  300s idle / 900s overall；
- 若某 Max Profile 需要不同预算，必须另建版本化、审核过的 policy 并单独评审；不得在 Adapter 中随手放大；
- Enterprise Adapter 在其现有 deadline 未完成专项验证前不得投影相应 Max Profile 为 supported；
- retry/restart 复用原 Task lock 与原 invocation durable deadline，不重新获得无界时间；
- Max 不增加 Tool Loop 最大轮数、重试次数、workspace scope、权限或风险确认范围。

### 8.4 Usage 与错误分类

- Provider 未返回 Usage 继续 unknown，不生成 0；
- reasoning token 若 Provider 已有可信 Usage fact，可作为内部 Usage 明细；否则不推断；
- timeout/cancelled/network/protocol 不得改写为 unsupported；
- unsupported/unknown 是提交时能力解析事实，不是调用失败后的健康结论；
- Max 不自动 fallback 到另一个模型或 enterprise/personal authority。

## 9. Threat Model 与敏感边界

| 威胁 | 必须缓解 |
| --- | --- |
| Renderer 伪造 supported | Core 重算 exact support revision；Renderer 只提交观察值 |
| 支持态查询后能力漂移 | Submit 前 CAS；任何 revision/status 漂移 typed stale |
| 按模型名猜最高档 | 只读受控 Profile；无 Profile=unknown |
| raw budget 泄漏 | raw mapping 仅 Provider-private；公共 Contract/lock/log/Receipt 静态扫描 |
| default 被实现成 low | body-level omission tests；不得发送 low/minimal |
| Max 被实现成更大 output token | Model Protocol 分离；architecture test 禁复用 `maxOutputTokens` |
| restart 重新解析策略 | ReasoningModeLock durable；恢复只读 exact lock |
| 后续 Tool/compaction 丢失 Max | 单一 converter 输入与全调用链 E2E |
| Profile 同 revision 被篡改 | digest 重算、exact revision、fail-closed |
| 偏好跨 owner 泄漏 | owner-scoped PK/CAS/Receipt；test identity 显式标记 |
| UI 放大 timeout/预算 | UI Contract 无此字段；Profile-only policy ref |
| Provider 调用失败被写成“不支持” | capability fact 与 invocation health/status 分离 |

Max 不涉及 Secret；但 Profile 的 raw Provider 参数、预算和 adapter internals 仍视为 private operational material，
不得进入 Renderer、安全 Projection、普通日志或用户可导出 Evidence。

## 10. 恢复与并发窗口

### 10.1 Preference P1～P5

| 窗口 | 结果 |
| --- | --- |
| P1 Receipt 前失败 | 无偏好变更、无 success Receipt |
| P2 preference 写入与 Receipt 间崩溃 | 同 transaction，不允许半提交 |
| P3 response lost | 同 command exact replay Receipt，不重复推进 revision |
| P4 并发 CAS | 恰好一个 winner；loser typed conflict |
| P5 owner/session rebind | 旧 owner command 不得写入新 owner scope |

### 10.2 Submit S1～S6

| 窗口 | 结果 |
| --- | --- |
| S1 support preview 后 profile 漂移 | submit stale，零 Task 副作用 |
| S2 Reasoning plan 后 coordination accept 前崩溃 | 无 Task bundle；同 command 重建 exact plan或 stale |
| S3 coordination accepted 后 bundle 前崩溃 | 从 durable plan 恢复，不读全局偏好 |
| S4 Task bundle commit 后 Receipt 前崩溃 | replay exact locked summary |
| S5 Receipt 后 Agent Loop 前崩溃 | 恢复启动同一 lock-bound Loop |
| S6 supported profile digest 损坏 | fail-closed，不 fallback default |

### 10.3 Invocation I1～I5

| 窗口 | 结果 |
| --- | --- |
| I1 Provider send 前 | 可按既有恢复规则用同 lock 重试 |
| I2 request 已发、output 未开始 | 沿用现有 Provider at-least-once 语义，不因 Max 伪装 exactly-once |
| I3 output 已开始 | 不重发、不拼接 partial |
| I4 terminal 后 Message 前 | 复用既有 durable invocation recovery |
| I5 Message committed | replay Message，零 Provider 调用 |

## 11. 分批开发计划

| 子批 | 范围 | 估算 | 最高输出 |
| --- | --- | --- | --- |
| DFI-5.0 | 代码事实、Contract/Profile/Threat Model 与分批冻结（本文件） | `PASS/CLOSED` | `DFI5_PLAN_FROZEN` |
| DFI-5.1 | safe Preview/Projection、独立 Experience Preference、migration 26、CAS/Receipt | `PASS/CLOSED` | `DFI51_REASONING_EXPERIENCE_FOUNDATION_CONFORMANT` |
| DFI-5.2 | SubmitTurn v1alpha3、ReasoningModeLock、Runtime Selection v1alpha2、Model Protocol v1alpha2、main/Tool/compaction/recovery | Plan 与 5.2.1 `PASS/CLOSED`；5.2.2 document review pending；5.2.3 GATED | `DFI52_TASK_REASONING_LOCK_CONFORMANT` |
| DFI-5.3 | Provider Profile/Mapping；至少一个真实已验证 Adapter；Enterprise Gateway v1alpha3 如进入 enterprise mapping | 7～12 日 | `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT` |
| DFI-5.4 | Main/Preload safe API、Composer UI、只读摘要、换模/漂移/retry/restart 联合 E2E | 5～8 日 | `DFI5_MAX_REASONING_MODE_CONFORMANT` |

结合 DFI-5.2.2 详细代码事实，全线集中工程粗估更新为约 37～61 日；DFI-5.1 已完成，DFI-5.2～5.4 剩余
约 30～49 日，不含独立 QA 与返工。若首发只交付 Local Personal 的单一已验证 Profile，DFI-5.3 可缩小到
4～7 日，剩余约 27～44 日；不得把未验证 Enterprise OpenAI-compatible / Anthropic-compatible 投影为 supported。

每个子批必须单独详细方案/差异复核、用户授权、独立 QA 与用户接受。DFI-5.1、DFI-5.2.1 已关闭；
DFI-5.2 父计划见
[DFI-5.2 Task Reasoning Lock 详细实施方案](./DFI-5.2-TASK-REASONING-LOCK-DEVELOPMENT-PLAN.md)，DFI-5.2.2
细化见
[DFI-5.2.2 Planner / Stale CAS / Task Bundle 详细方案](./DFI-5.2.2-REASONING-PLANNER-TASK-BUNDLE-DEVELOPMENT-PLAN.md)。
当前只进入 DFI-5.2.2 文档评审，不自动解锁其编码、DFI-5.2.3 或 DFI-5.3～5.4。

## 12. 文件所有权与禁止范围

### 12.1 未来获授权后允许

- `packages/contracts/src/runtime-selection/**` 新版本；
- `packages/contracts/src/model-protocol/**` 新版本；
- `packages/contracts/src/desktop-local/v1alpha3/**`；
- `packages/contracts/src/submit-turn-coordination/**` additive 新版本；
- `services/core/src/application/**`、相关 ports/memory/sqlite/http adapters；
- DFI-5.3 获单独授权后允许的 Central Model Gateway / Provider Adapter 文件；
- DFI-5.4 获单独授权后的 Desktop Main/Preload/Renderer；
- 对应 tests、Harness、Evidence 和正式文档。

### 12.2 当前及未授权子批禁止

- 原地改写 Runtime Selection v1alpha1、Model Protocol v1alpha1、SubmitTurn v1alpha1/v1alpha2、Gateway v1alpha1/v1alpha2；
- AAPI/Admin Console、Robot/Skill/Knowledge 配置；
- EIPC production identity、SSO、RBAC；
- TGM、Knowledge Provider、MiniMax terminal Profile；
- Secret/Credential/Keychain/Reveal；
- 新依赖、root package/tsconfig/workspace/lockfile；
- 未经 Provider Profile 评审直接写 raw mapping；
- 在 DFI-5.1～5.3 未闭合前先做可点击且声称生效的 Renderer 控件。

发现实现必须修改禁止范围时，必须停止编码并回文档评审。

## 13. QA 矩阵（100 项）

### 13.1 Contract / canonical / legacy（1～18）

1. Reasoning Profile strict valid；2. unknown field 拒绝；3. support/strategy 联合约束；
4. personal execution digest 绑定；5. support canonical digest；6. Profile digest tamper；
7. ReasoningModeLock default；8. max applied；9. unsupported fallback；10. unknown fallback；
11. 非法 requested/resolution 组合；12. raw parameter 静态拒绝；13. TaskRuntimeSelection v1alpha1 fixture 零漂移；
14. v1alpha2 selection digest；15. Model Protocol v1alpha1 fixture 零漂移；16. v1alpha2 request digest；
17. SubmitTurn v1alpha1/v1alpha2 零漂移；18. v1alpha3 strict parse。

### 13.2 Support Preview / stale（19～34）

19. supported preview；20. unsupported preview；21. unknown preview；22. effective model switch 重算；
23. robot default 重算；24. personal exact execution binding；25. model-name inference 禁止；
26. supported exact submit；27. unsupported exact fallback；28. unknown exact fallback；
29. supported→unsupported stale；30. supported→unknown stale；31. unsupported→supported stale；
32. profile revision drift stale；33. adapter revision drift stale；34. stale 时零 Task/Message/Receipt 副作用。

### 13.3 Preference（35～48）

35. 默认无记录=default；36. test-only owner create；37. CAS update；38. exact replay；
39. different material conflict；40. concurrent single winner；41. preference+Receipt 原子；42. SQLite reopen；
43. record digest tamper；44. owner scope mismatch；45. session rebind；46. production authority unavailable；
47. LocalStorage/个人模型表零使用；48. save failure 不改变当前 Composer 显式选择。

### 13.4 Task lock / lifecycle（49～70）

49. Reasoning lock exact Model lock；50. selection digest 覆盖 lock；51. Task bundle 原子提交；
52. coordination plan recovery；53. Receipt locked summary；54. default 不含 strategy；55. max exact strategy；
56. Tool 后轮次同 digest；57. 用户后续轮次同 digest；58. initial compaction 同 digest；
59. rolling compaction 同 digest；60. retry 同 digest；61. Core restart 同 digest；62. terminal replay 零调用；
63. 全局偏好变化不改当前 Task；64. Catalog/Profile 变化不改当前 Task；65. missing exact strategy fail-closed；
66. strategy tamper fail-closed；67. historical v1alpha1 Task 可读；68. historical Task 不补造 Max；
69. 不建第二 Model lock；70. operation/resource snapshot 真实归零。

### 13.5 Provider / timeout / Usage（71～88）

71. explicit default body omission；72. unsupported fallback body omission；73. unknown fallback body omission；
74. effort mapping exact；75. boolean thinking exact；76. bounded budget exact；77. 未列 Profile 零参数；
78. strategy digest mismatch 零上游请求；79. Local Personal timeout ref exact；80. UI 无 timeout override；
81. restart 不延长 deadline；82. retry 不增加次数；83. Tool round 上限不变；84. Usage absent=unknown；
85. Usage present exact；86. timeout 不改 unsupported；87. cancel 不改 unsupported；88. 不自动切换 authority/model。

### 13.6 Desktop / E2E / security（89～100）

89. safe Projection 无 raw参数；90. Main/Preload strict parse；91. compatibility feature 半装配不投影；
92. supported UI 与 Core exact lock；93. unsupported inline notice；94. unknown inline notice；
95. 键盘与可见焦点；96. submit 后只读摘要；97. navigation/restart 不误改 Task；
98. 四通道敏感/私有 material 扫描 0；99. full root + Desktop + Core + Central online/offline；
100. 三轮 process E2E semantic digest 一致，资源计数来自真实 snapshot，不硬编码 0。

## 14. 阶段门禁与停止条件

DFI-5.1 编码前必须由文档评审确认：

1. 独立 ReasoningModeLock，而非修改 TaskCapabilityLock；
2. v1alpha1/v1alpha2 legacy Contract 零改写策略；
3. migration 26 未被占用；
4. production owner 不可信时 preference unavailable 的诚实边界；
5. supported 后漂移必须 stale，不静默 fallback；
6. Profile raw mapping 的私有边界；
7. 首个计划支持的真实 Provider Profile 与其 timeout policy 另行明确。

必须停手并回评审的条件：

- 需要从模型名、Endpoint 或 Renderer 自报推断支持；
- 需要把 raw Provider 参数写进公共 Contract/Task lock；
- 需要原地扩展已冻结 strict Contract；
- 需要修改历史 migration 1～25；
- 需要使用 test identity 宣称 production preference ready；
- 需要在已锁 Task 上重新解析 reasoning mode；
- 需要以 silent fallback 掩盖 previously-supported drift；
- 需要扩大权限、Tool round、retry 或 Secret 边界。

## 15. 文档自检与当前状态

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
```

该自检只说明七项已知结构问题在方案中有明确关闭映射，不替代独立文档复核。

当前状态：

```text
DFI-3A                         PASS/CLOSED
DFI-4A.3                      PASS/CLOSED
DFI-4A.3.1 repair.2           PASS/CLOSED
DFI-5.0                       PLAN REVIEW PASS/CLOSED
DFI-5.1                       PASS/CLOSED
DFI-5.2                       REVISION 1 PLAN REVIEW PASS/CLOSED
DFI-5.2.1                     PASS/CLOSED
DFI-5.2.2                     DOCUMENT REVIEW PENDING / CODING GATED
DFI-5.2.3                     GATED
DFI-5.3～DFI-5.4              GATED
AAPI-0.3～AAPI-0.4            GATED
TGM / Knowledge Provider      GATED
```

DFI-5.2 Revision 1 已通过独立复核并由用户接受；DFI-5.2.1 独立 QA P0～P3 全 0，已由用户正式接受并
`PASS/CLOSED`。DFI-5.2.2 当前仅进入详细方案评审，后续子批不得自动解锁。
DFI-5.3～5.4、AAPI-0.3～0.4、TGM 与 Knowledge Provider 继续 `GATED`。
