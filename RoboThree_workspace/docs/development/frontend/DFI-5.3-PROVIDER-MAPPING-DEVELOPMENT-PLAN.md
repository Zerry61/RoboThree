# DFI-5.3 Provider Mapping 详细实施方案

> 状态：**DFI-5.3 STAGE PASS/CLOSED / DFI-5.3.1～DFI-5.3.4 PASS/CLOSED**
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 上游：DFI-5.0、DFI-5.1、DFI-5.2（含 5.2.1～5.2.3）均已 `PASS/CLOSED`  
> 本批最高输出：`DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`  
> 下游：[DFI-5.4 详细方案](./DFI-5.4-DESKTOP-MAX-UI-PRODUCTION-CUTOVER-DEVELOPMENT-PLAN.md) 当前 `PLAN REVIEW PASS/CLOSED`；5.4.0 前置确认已 `PASS/CLOSED`；用户选择方案 A，
> [最小 R2D production consumption / Provider Release Admission 计划](./DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md)
> 正在文档评审。TGM、Knowledge Provider、Agent Lifecycle 与 Admin v2 consumption 继续 `GATED`
> 独立技术线：CPC 已 `PASS/CLOSED`，其生产 activation 继续 disabled；本批不得改变 Prompt/Context 语义

> Revision 1 notice（2026-08-27）：§2.2 原公式把 `profileRevision` 放入 `strategyDigest` material，而现有
> Profile revision 又由包含 `strategyDigest` 的 Profile material 派生，形成循环依赖。DFI-5.3.1 编码已按 §13
> 停手；[聚焦修订](./DFI-5.3.1-PRIVATE-MAPPING-DIGEST-ORDERING-FOCUSED-REVISION.md) 冻结非循环双摘要顺序。
> 聚焦复核已通过并由用户接受；DFI-5.3.1 已按该非循环顺序完成实现、通过独立 QA 并由用户正式接受，
> 当前 `PASS/CLOSED`。下一批以
> [DFI-5.3.2 Local Personal Reasoning Mapping 详细方案](./DFI-5.3.2-LOCAL-PERSONAL-REASONING-MAPPING-DEVELOPMENT-PLAN.md)
> 为准；Revision 2 已完成实现与开发者门禁，独立 QA P0～P3 全 0 并已由用户正式接受，当前 `PASS/CLOSED`。
>
> DFI-5.3.2 Revision 1 notice（2026-08-27）：明确 Local timeout ref 为新增 code-owned identifier、对齐父八类与
> Local 十类零副作用口径，并冻结 DFI-5.3.1 historical evidence 与 DFI-5.3.2 authorized consumer 的演进边界。
> DFI-5.3.1 旧 Harness 的 `productionMapperConsumerCount=0/providerAdapterConnected=false` 是历史阶段事实，
> 不得在 DFI-5.3.2 接线后要求 evidenceDigest 不变；新批通过 foundation focused regression + DFI-5.3.2
> consumer allowlist 证明零漂移与授权演进。
>
> DFI-5.3.3 planning notice（2026-08-27）：DFI-5.3.2 独立 QA 已由用户接受并正式 `PASS/CLOSED`；
> DFI-5.3.1 historical evidence/Harness 保持只读，父方案 120 项继续保留至阶段收口。为避免 Gateway v1alpha3、
> Central private registry、cache cross-product 与 Anthropic projector 半装配，DFI-5.3.3 调整为同时完成
> Enterprise OpenAI-compatible 与 Anthropic-compatible mapping；DFI-5.3.4 只保留 Lifecycle / Cutover /
> Stage Closure。详细边界以
> [DFI-5.3.3 详细方案](./DFI-5.3.3-ENTERPRISE-OPENAI-ANTHROPIC-REASONING-MAPPING-DEVELOPMENT-PLAN.md)
> 为准；其实现与独立 QA 已由用户正式接受，当前 `PASS/CLOSED`。父方案 120 项继续保留至
> [DFI-5.3.4 Lifecycle / Cutover / Stage Closure](./DFI-5.3.4-LIFECYCLE-CUTOVER-STAGE-CLOSURE-DEVELOPMENT-PLAN.md)
> 执行；5.3.4 独立文档复核已 `PASS（P0～P2=0/P3=2）`，两个 P3 已作为纯文档精度项吸收，当前为
> `USER ACCEPTANCE PENDING / CODING GATED`。

## 0. 目标与结论边界

DFI-5.3 只负责把 DFI-5.2 已锁定、已进入 `ModelRequest v1alpha2` 的 reasoning 事实，安全、确定地映射到三类
既有 production Provider Adapter：

```text
TaskRuntimeSelection v1alpha2
  + exact Model lock
  + exact ReasoningModeLock
  + ModelRequest v1alpha2
  + original durable deadline
        |
        v
Provider Mapping Preflight
  1. 重算并校验 Task/Model/Reasoning/request identity
  2. default/fallback -> 参数完全省略
  3. max_applied -> exact Profile/Strategy/timeout ref
  4. resolve immutable Provider-private mapping
  5. 校验 mapping digest 与 locked strategy digest
  6. 生成 provider-specific body
        |
        +-> Enterprise OpenAI-compatible
        +-> Enterprise Anthropic-compatible
        +-> Local Personal OpenAI-compatible
```

本批完成后最多允许声明：

```text
DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT
```

它只证明：三类 Adapter 已具备 exact、失败关闭、不会泄漏 raw mapping 的 reasoning 参数映射能力，并且受控真实
HTTP/TLS Provider fixture、Usage、timeout、retry/restart 与生命周期证据成立。

它不表示：

- production SubmitTurn v1alpha3 已开放；
- Desktop Main/Preload/Renderer 已有 Max API 或开关；
- 所有 OpenAI-compatible、Anthropic-compatible 或个人 Endpoint 都支持 Max；
- 没有 exact Profile 的模型可按模型名、Provider 名或协议类型猜测 Max；
- Max 调用失败后可以静默改用默认模式或另一个模型；
- Provider 的默认模式、最高档位或 thinking budget 永久不变；
- Core Prompt/Context Revision 1、AAPI、TGM 或 Knowledge Provider 已获得编码授权。

DFI-5.3 全部完成并通过独立 QA、用户接受前，production SubmitTurn v1alpha3 与 Desktop Max UI 必须继续不可达。
DFI-5.4 才负责产品入口、安全 API、用户提示与联合 E2E。

## 1. 当前代码事实

### 1.1 已完成且必须复用

1. DFI-5.1 已冻结 safe `ReasoningProfile v1alpha1`、三态 Preview、Preference、migration 26、CAS 与 Receipt；
2. DFI-5.2.1 已冻结 strict `ReasoningModeLock`、Runtime Selection v1alpha2、SubmitTurn/coordination v1alpha3；
3. DFI-5.2.2 已实现唯一 Planner：default 不读 Profile，max 只做一次 exact Profile load；
4. DFI-5.2.3 已实现 ModelRequest v1alpha2、唯一 request materializer、Context receipt 原子 finalizer、
   Compaction Binding v1alpha2 与全生命周期 lock 复用；
5. `default_passthrough` 与 `locked_max_strategy` 已进入 ModelRequest v1alpha2 的完整 canonical digest；
6. `ReasoningModeLock.max_applied` 持有 exact Profile ref、Strategy ref 与 `timeoutPolicyRef`；
7. local personal 与 enterprise durable Provider 当前都在任何外部副作用前拒绝 v1alpha2，返回 typed
   `reasoning_protocol_unavailable`；
8. Local Personal 已有 DFI-4A.3.1 repair.2 exact timeout policy 与 migration 25 Timeout Fact：30 秒 connect、
   90 秒 first progress、300 秒 idle、900 秒 default overall；
9. main、Tool continuation、initial/rolling Compaction、retry/restart 已复用原 Task lock；terminal replay
   已证明零 Provider 调用；
10. Provider 未返回 Usage 时保持 unknown、不伪造 0；Reasoning/Thinking 私有内容不作为 assistant 正文投影。

### 1.2 当前真实缺口

1. `ReasoningProfileSource` 目前只有 InMemory 实现，没有 production exact Profile source；
2. safe Profile 只携带 Profile/Strategy digest，不携带 raw Provider 字段和值，这是正确边界，但 raw mapping
   registry 尚不存在；
3. Local Personal `projectRequest()` 只接 legacy ModelRequest，固定输出常规 OpenAI Chat Completions body；
4. `EnterpriseModelRequestConverter` 只解析 v1 ModelRequest，只生成 Gateway v1alpha1/v1alpha2；
5. Enterprise Gateway v1alpha2 专用于 Prompt Cache sidecar，严格 schema 不允许 reasoning；
6. Central `OpenAiCompatibleModelProviderAdapter` 与 `AnthropicCompatibleModelProviderAdapter` 尚未接收受控
   reasoning directive；
7. Central 当前没有可按 exact Profile/Strategy revision 解析的 Provider-private mapping registry；
8. Generic OpenAI-compatible、`custom` Personal Endpoint 或仅凭 protocol/modelId 不能证明 Max 支持；
9. Enterprise 既有 timeout profile 尚未与 Reasoning `timeoutPolicyRef` 建立 exact 对齐；
10. 尚无三类 Provider body-level omission/mapping、真实 HTTP/TLS fixture 与多轮恢复联合证据。

### 1.3 本批必须关闭的缺口

| 编号 | 缺口 | DFI-5.3 关闭方式 |
| --- | --- | --- |
| G1 | safe Profile 与 raw mapping 无明确边界。 | 冻结 safe control plane 与 Provider-private mapping plane；raw material 永不进入公共面。 |
| G2 | default/fallback 可能被 Adapter 误映射为 low/minimal。 | 三类 Adapter body-level omission；禁止发送任何 reasoning/effort/thinking/budget 参数。 |
| G3 | max 可能按当前 Profile 或模型名重算。 | 只使用 Task lock 的 exact Profile/Strategy ref；不读 current pointer、不按名称猜测。 |
| G4 | Strategy digest 尚未约束 raw mapping material。 | Provider-private registry 重算 raw mapping digest，必须与 locked `strategyDigest` 一致。 |
| G5 | Enterprise Gateway 无 reasoning 版本。 | additive `enterprise-gateway/v1alpha3`，只传 safe refs，不传 raw mapping。 |
| G6 | Prompt Cache v1alpha2 与 Reasoning v1alpha3 组合未定义。 | v1alpha3 reasoning 必填、cache sidecar all-or-none 可选；v1/v2 零漂移。 |
| G7 | Local Personal generic Endpoint 容易被默认 supported。 | exact executionDefinition/provider profile/adapter revision 绑定；无 entry=`unknown`。 |
| G8 | Enterprise OpenAI/Anthropic raw body 各自不同。 | 两个 typed projector，禁止 generic JSON Patch/JSON Pointer/任意字段注入。 |
| G9 | timeoutPolicyRef 可能被忽略或放大。 | exact policy resolver；不改数值；不匹配在外部副作用前失败。 |
| G10 | retry/restart 可能解析 current mapping。 | immutable historical mapping 按 locked revision 读取；缺失即 fail-closed，不切 current。 |
| G11 | Provider failure 可能污染 support 状态。 | capability/support 与 invocation health 分离；timeout/network/protocol 不改写为 unsupported。 |
| G12 | raw mapping/Secret/私有 reasoning 可能进入日志或 Receipt。 | allowlist projection + 多编码泄漏扫描 + body capture test-only 隔离。 |
| G13 | production safe Profile source 尚不存在。 | 发布版本锁定的 Core safe projection 与 Provider-private mapping 配对；跨语言 digest conformance 防双源漂移。 |

## 2. 冻结架构决策

### 2.1 两层事实面：safe control plane 与 Provider-private mapping plane

#### Safe control plane

现有公共/任务安全事实继续只包含：

```text
ReasoningProfile:
  subject
  support
  profileId/revision/digest
  strategyId/revision/digest
  mappingKind
  timeoutPolicyRef

ReasoningModeLock / ModelRequest:
  exact lock/profile/strategy refs
  default_passthrough | locked_max_strategy
```

禁止增加：

- Provider 原始字段名；
- `high`、`xhigh` 或其他 raw effort 值；
- thinking budget 数值；
- Provider request fragment / JSON Patch / JSON Pointer；
- Endpoint、Credential Reference、Authorization header；
- provider-private evidence material。

#### Provider-private mapping plane

本节所有 safe/private digest 的生成顺序以
[DFI-5.3.1 Digest Ordering 聚焦修订 §2.1～2.3](./DFI-5.3.1-PRIVATE-MAPPING-DIGEST-ORDERING-FOCUSED-REVISION.md)
为准；不得从本节概念形状反推已废弃的循环公式。

新增内部 immutable mapping material，概念形状如下，但不得作为公共 Contract 导出：

```text
ProviderReasoningMappingV1
  mappingId
  mappingRevision
  mappingDigest
  authority = central_enterprise | local_personal
  providerFamily = enterprise_openai | enterprise_anthropic | local_openai
  exactSubject
  profileRef
  strategyRef
  timeoutPolicyIdentity
  requestProjectionRevision
  evidenceRevision
  typedPrivateDirective
```

`typedPrivateDirective` 由各 Adapter 私有 sealed/discriminated type 表示。禁止提供“任意 JSON 字段 + 任意值”
的通用注入器。任何 raw mapping 改动必须产生新 `mappingDigest`、`strategyDigest`、Strategy revision 和 Profile
revision；不得在相同 digest/revision 下修改行为。

### 2.2 Strategy digest 是 raw mapping 的不可逆承诺

> **Revision 1 supersession：**下述原始字段清单保留为评审历史，不再作为可编码公式。`profileRevision` 不能
> 进入 Strategy commitment material；替代公式、完整 private mapping digest 与 exact 校验责任以
> [DFI-5.3.1 Digest Ordering 聚焦修订](./DFI-5.3.1-PRIVATE-MAPPING-DIGEST-ORDERING-FOCUSED-REVISION.md) 为准。

`ReasoningProfile` 不公开 raw mapping，但其 `strategyDigest` 必须由 Provider-private canonical material 计算：

```text
domain = robothree.provider-reasoning-strategy.v1\n
authority
providerFamily
exactSubject
profileId/profileRevision
strategyId/strategyRevision
timeoutPolicyIdentity
requestProjectionRevision
evidenceRevision
typedPrivateDirective
```

公共面只持有 digest。Provider 在 dispatch 前重算私有 material，若不等于 Task lock 中的 `strategyDigest`，返回
typed `reasoning_mapping_conflict`，且以下计数必须全部为 0：

```text
credentialResolve
dnsLookup
socketConnect
tlsHandshake
httpRequestBodyWrite
gatewayAccept
durableInvocationPrepare（首次调用）
usageProjection
```

### 2.3 Provider mapping preflight 是唯一入口

本节 preflight 重算的 Strategy commitment 与 full private mapping digest，必须遵循
[DFI-5.3.1 Digest Ordering 聚焦修订 §2.1～2.3](./DFI-5.3.1-PRIVATE-MAPPING-DIGEST-ORDERING-FOCUSED-REVISION.md)
的非循环顺序。

新增唯一 `TaskLockedReasoningProviderMapper`（名称可在编码时按现有 style 微调，但职责不得拆散）。固定顺序：

1. strict parse `ReadableModelRequest`；
2. require exact `ModelProviderInvocation`；
3. validate Runtime Selection digest；
4. validate exact Model lock 与 selection；
5. validate ReasoningModeLock id/digest/modelLockRef；
6. validate request reasoning 与 ReasoningModeLock 精确对应；
7. `default_passthrough`：返回 `omit`，Profile/mapping load count=0；
8. `locked_max_strategy`：读取 lock 中 exact Profile/Strategy refs；
9. resolve exact immutable Provider-private mapping，恰好一次；
10. 重算 mapping/strategy digest并核对 exact subject、adapter、authority、timeout；
11. 返回 typed internal directive；
12. Adapter 才可读取 Credential、解析 Endpoint 或创建上游 request。

Main、Agent Loop、Compaction、Local Personal Adapter、Enterprise converter 与 Central Adapter 禁止各自复制
lock/Profile 真值表。Core preflight 负责 Task identity；Central 只负责 Gateway safe sidecar、Endpoint Binding 与
Provider-private mapping 的第二次独立校验。

### 2.4 `default_passthrough` 与两类 fallback 的省略语义

以下 ReasoningModeLock resolution 最终都产生 ModelRequest `default_passthrough`：

```text
default_passthrough
max_unsupported_default
max_capability_unknown_default
```

Provider 层统一解释为：

```text
省略所有额外 reasoning 参数
```

固定规则：

1. Profile load count=0、private mapping load count=0；
2. 不发送 `reasoning`、`reasoning_effort`、`effort`、`thinking`、`budget_tokens` 或等价 Provider 字段；
3. 不发送 low/minimal/off/disabled 来模拟“关闭 Max”；
4. fallback 不写成 `max_applied`，不在 Provider 调用成功后改写 Receipt；
5. Provider 默认行为变化不属于 Task drift；本锁只承诺参数省略；
6. request body serializer 必须使用 allowlist 构造，不先放 raw map 再删除字段。

### 2.5 `max_applied` 只使用 exact locked mapping

本节 exact refs 校验所依赖的两层 private digest 以
[DFI-5.3.1 Digest Ordering 聚焦修订 §2.1～2.3](./DFI-5.3.1-PRIVATE-MAPPING-DIGEST-ORDERING-FOCUSED-REVISION.md)
为唯一可编码公式。

`max_applied` 必须同时满足：

- request = `locked_max_strategy`；
- request lock id/digest == Runtime Selection lock id/digest；
- request Strategy ref == ReasoningModeLock Strategy ref；
- ReasoningModeLock Profile ref 可读取 exact immutable Profile；
- Profile subject == exact Model lock subject；
- local personal 还必须匹配 `personalExecutionDefinitionDigest`；
- enterprise 必须匹配 exact Model Endpoint Binding 的 model/configuration/registry/adapter/protocol revision；
- private mapping digest == locked Strategy digest；
- `timeoutPolicyRef` 可解析且与 mapping、binding、invocation timeout material 一致。

任何一项缺失、损坏或冲突都失败关闭。禁止：

- 切换到 current/latest Profile；
- 根据 modelId、upstreamModelId、Provider 名或协议猜策略；
- 用相同 mappingKind 下另一个 raw 值替代；
- silent fallback 为 default；
- 自动换模型或换 enterprise/personal authority。

已锁定的历史 Profile 即使不再是 current，只要 immutable material 仍可验证，就继续按原 revision 执行。所谓
“drift”是 exact material 缺失、digest 不匹配、subject/binding/timeout identity 改变；不是“current pointer 后来
指向新版本”。

### 2.6 production safe Profile source 与 private mapping 必须成对发布

DFI-5.1 目前只有 `InMemoryReasoningProfileSource`，不能把 test fixture 当 production support。DFI-5.3 必须新增
不可变、发布版本锁定的 production source：

#### Local Personal

- 同一个 Local Core private mapping corpus 生成 safe `ReasoningProfile` projection 与 raw mapping entry；
- production Profile source 只暴露 safe projection；Provider mapper 才能读取 private entry；
- 两者必须共享 exact subject/Profile/Strategy digest，不允许分别手写后“看起来一致”；
- 用户创建/修改 Personal Model 不会自动生成 supported Profile；只有审计 entry exact match 才 supported。

#### Enterprise

- Central release artifact 持有 private mapping ledger；
- Core release artifact只持有从同一审计 evidence corpus 生成的 safe Profile projection，不包含 raw字段和值；
- TS/Java conformance 必须证明 safe Profile/Strategy digest与 Central private mapping逐 entry一致；
- entry 绑定 exact Registry Generation 中物化出的 model capability revision 与 adapter descriptor revision；
- Configuration Snapshot/Descriptor 仍是 model/adapter identity authority，safe projection不能扩大其可用性；
- 缺 entry、generation不匹配或 conformance drift均为 `unknown/unavailable`，不得默认 supported。

本批不把 reasoning material 编码进既有 descriptor `capabilities` 字符串，也不原地改写 Enterprise Configuration
Snapshot v1alpha1。如果未来要求 Central 在运行时动态发布/撤销 Reasoning Profile，必须另立 additive
Configuration/Profile Contract 与持久化评审；不得在 DFI-5.3 编码时用自由字符串、HTTP临时响应或 current alias
绕开。

### 2.7 mapping entry 的准入证据

任何 production `supported` entry 在合入前必须同时具备：

1. Provider 官方、Provider-owned Contract 或企业已批准适配规范的版本化证据；
2. exact protocol、model subject、adapter revision与request projection revision；
3. 受控真实 HTTP/TLS fixture 对 body字段和值的证明；
4. default/fallback omission 的同 Adapter 对照证据；
5. Usage、终态、timeout与私有 reasoning output处理证据；
6. `evidenceRevision` 与 private mapping digest；
7. safe projection与private entry的跨语言conformance；
8. 安全评审确认 raw material未进入公共面。

只完成 projector 代码但没有上述 exact entry 时，该模型仍为 `unknown`。不得用 test-only entry、Provider 产品族名称
或营销文案宣称 production supported。

## 3. 三类 Provider 的独立映射

### 3.1 Enterprise OpenAI-compatible

Central 新增 private typed projector。允许的 raw directive 必须是代码审计过的封闭 variant，例如：

```text
OpenAiReasoningDirective
  omit
  chat_effort_level(exact reviewed value)
  chat_boolean_thinking(exact reviewed shape)
  chat_bounded_budget_preset(exact reviewed preset)
```

具体 variant 是否安装由 exact Profile evidence 决定，不能因为协议名是 `openai_compatible` 就默认支持。
Projector 只能修改 reasoning 专属 allowlist 字段，不得改：

- model/upstreamModelId；
- messages/system/tool schema；
- `max_tokens` / `maxOutputTokens`；
- stream/Usage 选项；
- Endpoint、Authorization、cache projection；
- deadline 或 retry policy。

`default_passthrough` 的最终 body 必须与相同 legacy request 的 body 在 reasoning 字段之外字节/语义等价。

### 3.2 Enterprise Anthropic-compatible

Anthropic 使用独立 private projector，不能复用 OpenAI body 逻辑。允许的封闭 variant：

```text
AnthropicReasoningDirective
  omit
  thinking_enabled_with_bounded_budget(exact reviewed preset)
```

规则：

1. `thinking` 与 budget 必须由 exact immutable mapping 同时给出，禁止 Adapter 临时计算；
2. budget 必须满足 Provider 协议、locked output/context budget 与产品上限；无法证明则 Profile 不是 supported；
3. Max 不得通过放大 `max_tokens` 冒充；
4. thinking delta、signature 或其他 chain-of-thought metadata 继续只验证/丢弃，不进入 assistant text、日志、
   Receipt 或 UI；
5. Prompt Cache marker 与 thinking body 必须分别投影，不能因字段顺序/分支覆盖丢失任一已锁定事实；
6. Provider 返回无 Usage 仍是 unknown，不用 budget 推断 token 数。

### 3.3 Local Personal OpenAI-compatible

Local Personal mapping 只存在于 Local Core，不发送 Central。exact key 至少覆盖：

```text
personalModelId
configurationRevision
executionDefinitionDigest
providerKind
providerProfileRevision
providerModelId binding digest（不可作为公共投影）
adapterDescriptorId/revision
profileRef
strategyRef
timeoutPolicyIdentity
```

规则：

1. `custom` 与任意用户 Endpoint 默认 `unknown`；
2. DeepSeek/Zhipu/Kimi 等 providerKind 本身也不足以证明支持，必须进一步绑定 exact execution definition 与
   Provider model evidence；
3. raw field/value 只能由 `LocalPersonalReasoningMappingRegistry` 的审计 entry 提供；
4. 不允许用户、Renderer、Main、env、CLI 或 Personal Model CRUD 自报 raw reasoning 参数；
5. Credential resolve 必须发生在 mapping preflight 全部通过之后；
6. local default/fallback 继续使用 DFI-4A.3.1 repair.2 已验收的普通 body 与 timeout；
7. max 只有在 locked `timeoutPolicyRef` 精确解析后才调用；本批不新增 timeout 数值或放宽 30 分钟 hard max；
8. `usage:null` 继续视为本帧无 Usage，最终真实 Usage 正常投影；没有 Usage 不生成 0；
9. 无 `[DONE]` 的正常 EOF 仍是 `stream_terminal_missing`，本批不顺带修 MiniMax Profile。

### 3.4 未验证模型的统一结论

三类 Provider 共同规则：

| 情况 | Preview/提交事实 | Provider 行为 |
| --- | --- | --- |
| 无 safe Profile | `unknown` | fallback lock 走参数省略；不得临时尝试 Max |
| safe Profile=`unsupported` | `unsupported` | fallback lock 走参数省略 |
| safe supported + exact private mapping | `max_applied` | exact mapping |
| safe supported + private mapping 缺失/损坏 | submit/dispatch unavailable | 零上游，禁止 default fallback |
| Provider 调用 4xx/5xx/timeout/protocol | invocation typed failure | 不改 support/Profile，不写 unsupported |

## 4. Enterprise Gateway v1alpha3

### 4.1 additive Contract，v1alpha1/v1alpha2 零漂移

新增：

```text
contracts/enterprise-gateway/v1alpha3/**
POST /v1alpha3/model-invocations
```

v1alpha3 只为 reasoning-aware ModelRequest 增加 safe sidecar。禁止原地修改 v1alpha1/v1alpha2 schema、fixture、
digest 或 Controller 语义。

v1alpha3 `modelRequest` 增加 strict `reasoning`：

```text
default_passthrough:
  mode
  reasoningModeLockId
  reasoningModeLockDigest

locked_max_strategy:
  mode
  reasoningModeLockId
  reasoningModeLockDigest
  profileId/profileRevision/profileDigest
  strategyId/strategyRevision/strategyDigest
  timeoutPolicyRef
```

它不包含 raw field/value、budget、effort、Endpoint、Credential 或完整 ReasoningModeLock。

### 4.2 与 Prompt Cache 的组合

v1alpha3 规则：

- `reasoning` 必填；
- `cacheContext + cacheContextDigest` 要么同时存在，要么同时缺失；
- 存在时复用 v1alpha2 已验收的 exact digest、Session Scope 与 Prompt Cache planning；
- 缺失时明确表示该调用没有 cache sidecar，不补造 disabled cache fact；
- reasoning digest 与 cache digest 都进入 v1alpha3 Gateway request digest；
- cache planner 不读取、修改或重算 reasoning；reasoning mapper 不读取、修改 cache marker；
- v1alpha2 仍表示“cache sidecar required、无 reasoning”，不能被 v1alpha3 替代或宽松解析。

### 4.3 双端 strict conformance

Core TS converter 与 Central Java mapper 必须共享 canonical fixture corpus，验证：

1. v1alpha3 accept/cancel/status/event schema；
2. default/max strict union；
3. cache absent/present 两种合法组合；
4. raw parameter/Secret/Endpoint/credential 字段负向拒绝；
5. request digest 跨语言一致；
6. v1alpha1/v1alpha2 canonical digests 零漂移；
7. 损坏 v1alpha3 不 fallback v1/v2；
8. v1alpha3 Controller 只在完整 reasoning mapping graph 安装时注册。

### 4.4 Central 的第二次 exact 校验

Central 在 Adapter dispatch 前固定校验：

```text
Gateway reasoning refs
  == provider-neutral request refs
  == exact immutable Central mapping refs
  == resolved Endpoint Binding protocol/model/config/registry/timeout identity
```

Central 不读取 JWT/user 参数或 Core 自报 raw mapping。映射缺失/重复/digest drift 时 typed fail-closed，
`adapterInvoked=false`、HTTP outbound count=0。

## 5. Timeout、retry、Tool、Compaction 与 restart

### 5.1 本批不改变 timeout 数值

- Local Personal default/fallback 继续 30s connect / 90s first progress / 300s idle / 900s overall；
- max 只能引用已注册的 exact policy；首批允许映射到同一已验收 policy，不新增“Max 自动延长”；
- Enterprise 只允许 exact `timeoutPolicyRef` 对齐既有 binding `timeoutProfileRevision` 与 invocation deadline；
- UI/Main/Renderer/env/CLI 不得覆盖；
- 若真实 mapping 需要新 timeout policy，停止本批并回专项文档评审。

### 5.2 全调用链复用原 Task lock

以下路径都必须使用同一 `reasoningModeLockId/digest` 与 Strategy ref：

1. main 首轮；
2. Tool Result 后续轮；
3. 用户补充输入；
4. initial compaction；
5. rolling compaction；
6. retry；
7. Core restart；
8. terminal replay。

映射读取计数：

```text
default/fallback                     0
max first dispatch                   1 exact lookup
同一次 body projection               不允许第二次 current lookup
合法 retry/Tool/Compaction           每次按同一 exact ref lookup，可缓存 immutable entry
restart                              exact historical ref，不读 current pointer
terminal replay                      0
```

允许按 digest 缓存 immutable mapping，但缓存 key 必须包含完整 authority/subject/Profile/Strategy/adapter identity，
有界且无 latest alias；缓存 miss 只回 exact registry，不回 current。

### 5.3 durable deadline

- Local Personal 继续读取 migration 25 Timeout Fact；retry/restart 不重新 `now + 900s`；
- outer Task deadline 更早时继续取更早者；
- Tool 后续轮和 Compaction 使用既有调用级 durable deadline 语义，不因 Max 增加总 Task 时间；
- Enterprise Gateway v1alpha3 继续携带 exact `providerRequestDeadlineAt` 与 idle timeout；
- timeout 触发保持 `timed_out/deadline_exceeded`，不能被 late reset 改成 network failure；
- timeout、cancelled、network、protocol 均不得改变 Reasoning Profile support。

## 6. Usage、输出与敏感边界

### 6.1 Usage

1. OpenAI-compatible 继续以可信最终 Usage 帧记录 input/output；`usage:null` 不伪造 0；
2. Anthropic-compatible 继续使用已验收 Usage 聚合；缺失即 protocol/unknown，按既有语义处理；
3. Provider 提供可信 reasoning token 明细时，本批最多允许在 Provider-private test evidence 中验证，不新增公共
   Usage Contract；
4. 不用 thinking budget、输出字符数、耗时或 max token 推断 Usage；
5. default/max 不改变 Usage fact 的 authority、attempt key、terminal 原子提交或 projection 语义；
6. retry 的可能重复计费继续沿用既有 at-least-once 证据，不因 Max 伪装 exactly-once。

### 6.2 私有 reasoning 输出

- OpenAI `reasoning_content`、Anthropic thinking delta/signature 等不得投影为 assistant text；
- 不进入 Conversation Message、Summary、Artifact、Receipt、日志、错误详情或 UI；
- 可以作为 progress frame 维持已验收 idle timeout，但不得作为业务正文；
- malformed private reasoning frame 仍按 Provider protocol 失败关闭，不静默拼入正文。

### 6.3 Secret 与 raw mapping

禁止进入 durable/日志/公共响应的 material：

```text
Authorization/Bearer/API Key
Credential Reference
Endpoint/private upstream model id
raw reasoning field/value
effort level name
thinking budget
Provider request body
private reasoning content/signature
```

Provider request body只允许存在于调用栈和受控 test fixture capture；production 日志、Evidence、Receipt 只记录安全
结果、exact digest 和 typed code。Local Credential bytes 继续在既有边界 `fill(0)`；本批不声称 Java/JS String
或 HTTP library 内部副本可可靠清零。

## 7. Provider fixture 与证据

### 7.1 “真实 Provider fixture”的定义

本批要求受控本地进程提供真实 HTTP/TLS/SSE 链路，而不是直接调用 `requestBody()` 或 mock 返回对象冒充：

```text
Parent Harness
  -> Core / Central production Adapter
  -> real DNS/loopback policy seam（test-only allowlist）
  -> TLS handshake / HTTP request serialization
  -> controlled Provider fixture process
  -> real SSE chunk boundaries / terminal / Usage
```

不使用真实用户 API Key，不访问公网 Provider，不把 fixture 标记 production ready。测试 Secret 使用明确 sentinel，
并由泄漏扫描验证未进入 stdout/stderr/report/failure artifact。

### 7.2 body-level assertions

每类 Adapter至少覆盖：

| Provider | default/fallback | max |
| --- | --- | --- |
| Enterprise OpenAI-compatible | forbidden reasoning keys 全部缺失 | exact audited field/value，其他候选字段缺失 |
| Enterprise Anthropic-compatible | `thinking`/budget 全部缺失 | exact `thinking` shape + bounded preset |
| Local Personal OpenAI-compatible | forbidden reasoning keys 全部缺失 | exact execution-bound field/value |

断言必须读取 fixture 实际收到的 HTTP body；不能只断言内部 DTO。body capture 只保留测试 sentinel 与安全结构摘要，
结束即释放，不写正式 Evidence。

### 7.3 流式响应矩阵

- OpenAI跨 chunk CRLF、空 assistant 首帧、reasoning progress、正文、Tool Call、`usage:null`、最终 Usage、`[DONE]`；
- Anthropic message_start、thinking delta/signature、text、Tool Use、Usage、message_stop；
- 无终态、重复终态、终态后事件、非法 JSON、oversized frame/body、idle、overall、cancel；
- thinking/reasoning 私有内容不得出现在 canonical stream；
- terminal 后所有 timer/stream/credential/body references 收敛。

## 8. 恢复、漂移与并发窗口

### 8.1 M1～M8 Mapping 窗口

| 窗口 | 预期终态 |
| --- | --- |
| M1 request/lock 校验前失败 | 零 mapping load、零 Provider 副作用 |
| M2 exact mapping load 前 subject drift | typed conflict，零上游 |
| M3 mapping 缺失 | typed unavailable，禁止 default fallback |
| M4 mapping digest 损坏 | typed conflict，零上游 |
| M5 timeout policy ref 不匹配 | typed unavailable，零 durable invocation/上游 |
| M6 body 生成后、send 前失败 | body 释放，零上游 bytes |
| M7 current Profile 更新 | 已锁 Task 继续 exact historical mapping，不读 current |
| M8 historical mapping 被错误删除 | fail-closed，不切 current/latest |

### 8.2 I1～I7 Invocation 窗口

| 窗口 | 预期终态 |
| --- | --- |
| I1 durable prepare 前 | 可用同 lock/deadline重试 |
| I2 prepare 后、Credential/Gateway 前 | exact replay/claim，不改 mapping |
| I3 request sent、output 未开始 | 沿用既有 at-least-once 风险，不伪装 exactly-once |
| I4 output 已开始 | 不重发、不拼 partial |
| I5 terminal 后 Message 前 | 复用既有 durable recovery，不换 Strategy |
| I6 Message committed | replay Message，mapping load/upstream 全 0 |
| I7 Core/Central restart | 读取 exact historical refs与原 deadline；无法证明则 recovery fail-closed |

### 8.3 C1～C6 并发窗口

| 窗口 | 约束 |
| --- | --- |
| C1 两个相同 invocation | 既有 durable claim/fencing 决定单 winner |
| C2 mapping registry reload | immutable revision 不原地替换 |
| C3 Profile 发布与旧 Task retry | 旧 Task 仍按旧 exact ref |
| C4 binding revision 更新 | 与旧 lock 不一致则 typed conflict，不迁移 Task |
| C5 cancel 与 timeout 竞争 | 首个 typed termination cause 胜出，不污染 support |
| C6 terminal replay 与晚到 callback | 晚到 body/Usage 清理，不产生第二 projection |

若现有 enterprise restart 语义只能收敛为 `uncertain` / resume unavailable，本批保持该诚实终态，不为 Max 新建第二套
恢复协议，也不因映射存在而自动重发。

## 9. QA 矩阵（120 项）

### 9.1 Contract / digest / registry（1～20）

1. v1alpha3 valid default；2. valid max；3. strict default 禁 max refs；4. strict max 必带 Profile/Strategy；
5. raw effort 禁入；6. raw thinking 禁入；7. budget 禁入；8. Credential 禁入；9. Endpoint 禁入；
10. v3 digest TS/Java一致；11. cache absent；12. cache present；13. cache half-present 拒绝；
14. v1 digest 零漂移；15. v2 digest 零漂移；16. Strategy private digest 重算；17. duplicate mapping 拒绝；
18. exact subject；19. historical lookup；20. current alias 禁止。

### 9.2 default / fallback omission（21～40）

21～23. 三类 Adapter explicit default body omission；24～26. unsupported fallback omission；
27～29. unknown fallback omission；30. default Profile load=0；31. default mapping load=0；
32. fallback mapping load=0；33. 不发送 low；34. 不发送 minimal；35. 不发送 disabled thinking；
36. 不改 maxOutputTokens；37. 不改 messages；38. 不改 tools；39. 不改 cache；40. legacy v1 body 回归。

### 9.3 max exact mapping（41～64）

41. Enterprise OpenAI exact effort；42. OpenAI boolean variant；43. OpenAI bounded variant；
44. Enterprise Anthropic exact thinking budget；45. Local exact effort；46. Local boolean；47. Local bounded；
48. model subject mismatch；49. adapter revision mismatch；50. execution definition mismatch；
51. Profile ref mismatch；52. Strategy revision mismatch；53. Strategy digest mismatch；54. timeout ref mismatch；
55. mapping missing；56. mapping duplicate；57. same revision changed material；58. current Profile changed；
59. current mapping changed；60. custom Endpoint remains unknown；61. Provider kind alone不支持；
62. failure不回退 default；63. failure不换模型；64. failure不改 support。

> DFI-5.3.2 clarification（2026-08-27）：DFI-5.3.1 当前 sealed directive 只安装 OpenAI effort 与
> Anthropic bounded budget。矩阵 42/43/46/47 继续保留，但在没有后续获批 additive sealed variant 时，验收语义是
> “未安装 boolean/bounded variant 必须 strict reject / 保持 unknown”，不是要求 Adapter 用任意 JSON 临时实现
> 正向映射；只有未来聚焦评审批准 exact Provider evidence 与 additive variant 后，才把对应项提升为正向 body mapping。

### 9.4 Enterprise Gateway / Adapter（65～84）

65. v3 Controller disabled when graph incomplete；66. complete graph registration；67. malformed v3不 fallback；
68. Core converter exact Profile refs；69. Central second validation；70. binding protocol mismatch；
71. binding model mismatch；72. configuration mismatch；73. registry generation mismatch；74. timeout profile mismatch；
75. OpenAI body real HTTP；76. Anthropic body real HTTP；77. Prompt Cache + OpenAI Max；
78. Prompt Cache + Anthropic Max；79. adapterInvoked=0 on mapping error；80. outbound count=0；
81. v1 endpoint回归；82. v2 endpoint回归；83. status/event语义回归；84. Central restart诚实收敛。

### 9.5 Lifecycle / Usage / security（85～108）

85. main lock复用；86. Tool next round；87. user continuation；88. initial compaction；89. rolling compaction；
90. retry；91. Core restart；92. terminal replay mapping load=0；93. terminal replay upstream=0；
94. local exact durable deadline；95. restart不延长；96. timeout typed；97. cancel typed；98. network typed；
99. OpenAI usage；100. usage:null；101. Usage absent不造0；102. Anthropic Usage；103. repeated billing evidence；
104. reasoning content不投影；105. thinking signature不投影；106. Secret四通道扫描；
107. raw mapping多编码扫描；108. body/credential/timer资源收敛。

### 9.6 Boundary / gates（109～120）

109. production SubmitTurn v1alpha3 route count=0；110. Main Max IPC count=0；111. Preload Max API count=0；
112. Renderer Max UI count=0；113. Admin imports=0；114. public Contract raw mapping=0；
115. Task Receipt raw mapping=0；116. migration max=26；117. no Central v0011；118. lockfile digest不变；
119. Core Prompt/Context代码零改动；120. `.skip/.only/@Disabled/sleep/硬编码资源0` 静态扫描。

## 10. 分批实施计划与估算

### DFI-5.3.1 Provider-private Mapping Foundation（3～5 日）

- private canonical mapping material、digest、exact registry 与 typed errors；
- 唯一 mapping preflight；
- default/fallback omission primitive；
- Local safe/private 同源 projection 与 Enterprise release-pinned safe/private 配对；
- Core/Central shared conformance fixture、entry admission evidence 与 production/test-only 隔离；
- 不接真实 Adapter，不注册 Gateway v1alpha3；
- 最高输出：`DFI531_PRIVATE_MAPPING_FOUNDATION_CONFORMANT`。

### DFI-5.3.2 Local Personal Mapping（4～7 日）

- Local Personal exact mapping source；
- exact execution definition/adapter/profile/strategy/timeout binding；
- OpenAI-compatible body projector；
- 真实受控 TLS/SSE fixture、Usage/timeout/Secret cleanup；
- generic/custom 未验证模型保持 unknown；
- 最高输出：`DFI532_LOCAL_PERSONAL_REASONING_MAPPING_CONFORMANT`。

详细边界、96 项本批 QA、production release count=0 的诚实状态与真实 loopback TLS/SSE fixture，见
[DFI-5.3.2 详细方案](./DFI-5.3.2-LOCAL-PERSONAL-REASONING-MAPPING-DEVELOPMENT-PLAN.md)。父方案 120 项矩阵继续
保留到 DFI-5.3 阶段收口，不视为 DFI-5.3.1 或 DFI-5.3.2 单批已全部执行。

### DFI-5.3.3 Enterprise Gateway v1alpha3 + OpenAI/Anthropic Mapping（8～13 日）

- Gateway v1alpha3 schema/openapi/fixtures/TS-Java digest；
- cache optional all-or-none 组合；
- Central exact mapping registry与第二次校验；
- Enterprise OpenAI typed projector + real HTTP fixture；
- Enterprise Anthropic typed thinking projector、budget/max token fail-closed；
- cache + reasoning 四组合与 private thinking/signature 隔离；
- v1/v2 零漂移；
- 最高输出：`DFI533_ENTERPRISE_REASONING_MAPPING_CONFORMANT`。

详细边界、108 项本批 focused QA 与 Gateway v1alpha3 digest 公式见
[DFI-5.3.3 详细方案](./DFI-5.3.3-ENTERPRISE-OPENAI-ANTHROPIC-REASONING-MAPPING-DEVELOPMENT-PLAN.md)。

### DFI-5.3.4 Lifecycle / Cutover / Stage Closure（3～5 日）

- 三 Provider main/Tool/Compaction/retry/restart/terminal replay联合 Harness；
- Gateway v1/v2/v3 与 Local/Enterprise production cutover boundary；
- 120 项 QA、Central online/offline、阶段收口；
- 最高输出：`DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`。

详细真实进程拓扑、父方案 120 项执行账本、96 项 focused QA、三轮 semantic replay、泄漏与资源归零边界见
[DFI-5.3.4 详细方案](./DFI-5.3.4-LIFECYCLE-CUTOVER-STAGE-CLOSURE-DEVELOPMENT-PLAN.md)。

按已关闭子批与修订后的工作估算，DFI-5.3 全阶段仍约 **18～30 个集中工程日**；当前仅剩
DFI-5.3.4 的 **3～5 日**，不含独立 QA、真实模型清单补证和返工。该估算替代 DFI-5.0 的 7～12 日粗估，
原因是本次明确要求同时覆盖 Local Personal、Enterprise OpenAI-compatible、Enterprise Anthropic-compatible、
additive Gateway v1alpha3、跨语言 conformance 与真实进程 Provider fixture。

每个子批必须单独：详细差异方案或本方案分批确认、编码授权、开发者门禁、独立 QA、用户接受。评审通过本文件
不自动授权 DFI-5.3.1，更不自动授权后续子批。

### 10.1 冻结开发时点

DFI-5.3 不被取消或无限期搁置，但当前不抢占系统提示词与 Admin 真实接口的 MVP 优先级。进入 DFI-5.3.1 编码前
必须同时满足：

1. CPC-1～CPC-3 已逐批 `PASS/CLOSED`，`CPC_CORE_PROMPT_MVP_CONFORMANT` 已成立；
2. AAPI-0.3～AAPI-0.4 已完成，或用户明确决定调整优先级、先做 Max；
3. DFI-5.3.1 获得用户单独编码授权；
4. 共享工作区无其他窗口并行修改 ModelRequest、Provider、Gateway、timeout、Usage 或 lockfile；
5. 编码前重新记录 CPC/DFI-5.2/Provider fixture、migration 26 与 lockfile digest 基线；
6. DFI-5.3 门禁必须加入已关闭 CPC Harness，证明 Max mapping 不改变 System Message、Context Receipt 或
   Prompt/Reference authority。
7. DFI-5.3.1 Digest Ordering 聚焦修订已完成独立聚焦复核并由用户接受，状态为 `PASS/CLOSED`。

正常优先级为：

```text
CPC-1～CPC-3
  -> AAPI-0.3～AAPI-0.4
  -> DFI-5.3.1～DFI-5.3.4
  -> DFI-5.4 Desktop Max UI
```

用户可以明确调整顺序，但任何“优先级调整”都不等同于 DFI-5.3.1 编码授权。

## 11. 文件所有权

### 11.1 未来对应子批获授权后允许

- `contracts/enterprise-gateway/v1alpha3/**`；
- `services/core/src/application/**` 中 reasoning mapping/converter；
- `services/core/src/ports/**` 中 private mapping source；
- `services/core/src/adapters/https/**` 的 Local Personal body mapping；
- `services/core/src/adapters/memory/**` 的 test-only/conformance source；
- `services/central-service/src/main/java/**/modelgateway/**`；
- `services/central-service/src/test/**` 对应 conformance/Provider fixture；
- `services/core/tests/**`、`scripts/run-dfi5.3*-harness.mjs`、Evidence；
- package-local version、root harness script 与必要治理文档。

### 11.2 明确禁止

- `apps/desktop/src/main/**`、`preload/**`、`renderer/**`；
- `apps/admin-console/**`；
- production SubmitTurn v1alpha3 route / IPC / Preload API；
- Core Prompt/Context Feature Spec Revision 1 的 Contract/assembly/compiler实现；
- TGM、Knowledge Provider、Robot/Skill 配置；
- DFI-4A Credential CRUD/reveal 边界；
- migration 1～26 改写、migration 27、新 Central v0011；
- 新第三方依赖或 `pnpm-lock.yaml`；
- 公共 Contract/Task Receipt/UI/日志中的 raw Provider 参数；
- 真实用户 Key、生产 Endpoint 或公网 live Provider 测试；
- MiniMax `[DONE]` 兼容 repair；
- 企业真实 SSO/identity production composition。

## 12. 门禁

每个编码子批至少执行：

```text
Node 24.13.0 exact
focused DFI-5.3 harness
contracts build/conformance（涉及 Gateway 时 TS + Java）
Core build/test
Central online/offline（涉及或不涉及 Central 都不得省略最终收口）
pnpm run lint + Architecture boundary
pnpm run check（VITEST_MAX_WORKERS=1）
pnpm install --frozen-lockfile --offline
audit:dtp4
lockfile digest / migration max / Central schema version检查
多编码 Secret/raw mapping泄漏扫描
```

真实进程 Harness 禁止用 sleep 猜窗口、自动 retry 掩盖失败、单进程 direct method 冒充 HTTP/TLS、硬编码资源 0、
`?? 0` 补缺失诊断或 Fake Profile 宣称 production supported。

## 13. 停手条件

实现发现以下任一情况，必须停止编码并回文档评审：

1. 必须把 raw effort/thinking/budget 放入公共 Contract、Task lock、Receipt、日志或 UI；
2. 必须增加 generic JSON Patch/JSON Pointer 才能支持 Provider；
3. 无法让 Strategy digest 承诺 exact private mapping；
4. 必须按 modelId/Provider 名/current Profile 猜 mapping；
5. 必须 silent fallback default 才能维持调用；
6. 必须原地修改 Gateway v1alpha1/v1alpha2；
7. Gateway v1alpha3 无法与 Prompt Cache sidecar严格组合；
8. 必须新增 migration 27 或 Central v0011；
9. 必须改变 timeout 数值、retry 次数、Tool round、context/output budget；
10. 必须把 reasoning/thinking 私有输出暴露为 assistant text；
11. 真实 Provider fixture 只能使用真实用户 Secret/公网生产 Endpoint；
12. production SubmitTurn/Desktop UI 必须提前开放才能测试；
13. 必须修改 Core Prompt/Context、AAPI、TGM、Knowledge Provider；
14. historical mapping 无法按 exact revision保留，只能切 current；
15. Provider failure 会修改 support/Profile；
16. v1/v2 Provider/Gateway/Usage/timeout 行为发生漂移；
17. root check 失败来自并发窗口且无法安全隔离；
18. 发现未授权跨线代码、依赖或 migration 混入本批。

## 14. 当前状态与后续授权

```text
DFI-5.0                       PLAN REVIEW PASS/CLOSED
DFI-5.1                       PASS/CLOSED
DFI-5.2                       PASS/CLOSED
DFI-5.2.1～DFI-5.2.3         PASS/CLOSED
DFI-5.3                       PLAN REVIEW PASS/CLOSED
DFI-5.3.1                     PASS/CLOSED
DFI-5.3.2                     PASS/CLOSED
DFI-5.3.3                     PASS/CLOSED
DFI-5.3.4                     PASS/CLOSED
DFI-5.4                       PLAN REVIEW PASS/CLOSED
DFI-5.4.0                     PASS/CLOSED
Scheme A prerequisite plan   DOCUMENT REVIEW PENDING / CODING GATED
AAPI-0.3～AAPI-0.4            PASS/CLOSED
TGM / Knowledge Provider      GATED
CPC-1～CPC-3 / CPC             PASS/CLOSED
```

独立文档复核已对以下十二项全部给出接受结论，P0～P3 全 0：

1. 是否接受 safe control plane 与 Provider-private mapping plane 分离；
2. 是否接受 Strategy digest 对 raw mapping material 做不可逆承诺，但 raw material 不进入公共面；
3. 是否接受 default/fallback Profile/mapping load=0 且三 Adapter body-level完全省略；
4. 是否接受 max 只按 Task lock exact refs解析，current Profile变化不迁移历史 Task；
5. 是否接受 Gateway v1alpha3 reasoning必填、cache sidecar all-or-none可选，v1/v2零漂移；
6. 是否接受 OpenAI、Anthropic、Local Personal 使用三个 typed projector，禁止 generic JSON注入；
7. 是否接受 generic/custom或无 exact evidence的模型保持 unknown；
8. 是否接受 timeout数值不变、retry/Tool/Compaction/restart复用原 lock与durable deadline；
9. 是否接受 private reasoning output持续丢弃、不作为 assistant正文；
10. 是否接受真实受控 HTTP/TLS fixture而非公网/真实用户Key；
11. 是否接受 production SubmitTurn/Desktop Max UI继续不可达；
12. 是否接受 DFI-5.3 全阶段 18～30 日、当前仅剩 DFI-5.3.4 的 3～5 日，以及修订后的四个串行子批边界。

本方案已通过独立文档复核并由用户确认可冻结；DFI-5.3.1～5.3.3 已分别获得授权、完成独立 QA 并
`PASS/CLOSED`。DFI-5.3.4 独立 QA 已通过并由用户正式接受；父方案 120 项账本正式确认为
`executed_at_dfi53_stage_closure`，DFI-5.3 阶段整体 `PASS/CLOSED`。该结论不自动授权 DFI-5.4、Desktop、
Admin 或其他下游编码。

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
```
