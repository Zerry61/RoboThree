# DFI-5.3.2 Local Personal Reasoning Mapping 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-27  
> 负责人：Codex 5.6  
> 父计划：[DFI-5.3 Provider Mapping](./DFI-5.3-PROVIDER-MAPPING-DEVELOPMENT-PLAN.md)  
> 上游：DFI-5.3.1 `PASS/CLOSED`  
> 本批最高输出：`DFI532_LOCAL_PERSONAL_REASONING_MAPPING_CONFORMANT`  
> 下游：DFI-5.3.3～5.3.4、DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与
> Desktop/Admin v2 consumption 继续 `GATED`

> Revision 1 notice（2026-08-27）：吸收独立文档复核的两项有效 P3，并修正一项复核建议自身的口径错误：
> §3.3 明确 `timeoutPolicyRef` 是本批新增的 code-owned identifier，只有 revision/digest/数值复用既有 policy；
> §6.3 显式对齐父方案八类与 Local 十类零副作用通道；§11 不要求 DFI-5.3.1 历史 Harness 在获授权的 Local
> consumer 接线后继续保持 `productionMapperConsumerCount=0` 或 evidenceDigest 不变，而是冻结历史 evidence、
> 复跑 foundation focused regression，并由 DFI-5.3.2 Harness 证明只有授权 Local 路径新增 consumer。

> Revision 2 focused notice（2026-08-27）：编码前代码事实核对发现 Revision 1 把
> `ReasoningProfileSubject.modelCapabilityRevision` 错写成 Personal Model
> `configurationRevision`。现有 DFI-5.3.1 Mapper 的冻结语义要求该字段精确等于
> `TaskCapabilityLock.definitionSnapshot.revision`；Personal Model configuration/execution 身份则由已验证的
> Personal lock configuration binding 与 `personalExecutionDefinitionDigest` 分层证明。两者属于不同摘要域，
> 不得互相代替。Revision 2 只修正 §3.2 与对应 QA/评审口径，不修改其他冻结决策；用户接受前暂停生产代码。

## 0. 结论先行

DFI-5.3.2 只把已经锁入 Task 的 reasoning 决策，安全接到 **Local Personal
OpenAI-compatible Provider**。本批不开发新的模型能力、不开放 Desktop Max UI，也不凭
DeepSeek、智谱、Kimi 或 `custom` 名称猜测 Provider 参数。

本批完成后必须同时成立：

1. `default_passthrough` 与两种 fallback 的请求体完全省略 reasoning 专属参数；
2. `max_applied` 只消费 Task 已锁定的 exact Profile、Strategy、Personal Model execution
   definition、Adapter 与 timeout policy；
3. mapping 缺失、重复、摘要漂移或 identity 冲突在 Credential、DNS、socket、TLS、HTTP body、
   durable invocation prepare 和 Usage 之前失败关闭；
4. retry、Tool 后续轮、Compaction 与 restart 复用原 Task lock、原 mapping revision 与 migration 25
   exact deadline；
5. raw directive 不进入公共 Contract、Task/Message/Receipt、日志、UI、Dynamic Request Facts 或
   Context Receipt；
6. 受控本地 HTTP/TLS/SSE fixture 证明 body-level omission/mapping、Usage、终态与 timeout 行为；
7. 当前没有获批 production Local Personal Max release 时，production supported entry 数必须为 0，
   产品态只能是 `unknown`，不得用 test fixture 冒充 production ready。

因此，本批最高只输出：

```text
DFI532_LOCAL_PERSONAL_REASONING_MAPPING_CONFORMANT
```

它不表示任一真实 DeepSeek/智谱/Kimi/custom model 已通过 Max 准入，也不表示 production
SubmitTurn v1alpha3、Desktop Max UI、Enterprise mapping 或完整 DFI-5.3 已完成。

## 1. 当前代码事实与缺口

### 1.1 已关闭且必须复用

1. DFI-5.3.1 已提供 `ProviderReasoningMappingRelease`、非循环
   `Strategy commitment → safe Profile → full private mapping` 摘要链；
2. `ReleasePinnedReasoningMappingRegistry` 只允许 exact lookup，不提供 current/latest/fallback；
3. `TaskLockedReasoningProviderMapper` 已验证 ModelRequest v1alpha2、Runtime Selection v1alpha2、
   Model lock、ReasoningModeLock、Profile/Strategy refs 与 timeout identity；
4. default 在 Profile/mapping load 前返回 `omit`，读取次数为 0；max 对 exact Profile/mapping
   各读取一次；
5. Local Personal Provider 已具备安全 HTTPS/SSE、Credential 清零、Usage `null` 跳过、四阶段 timeout、
   migration 25 exact Timeout Fact 与 durable recovery；
6. Local Personal 的 reasoning/thinking delta 目前只作为 progress，不进入 assistant 正文；
7. ModelRequest v1alpha2 已携带 locked reasoning identity；retry/Tool/Compaction/restart 已复用同一 Task
   lock；
8. Local Personal raw Adapter 与 durable wrapper 目前都在任何外部副作用前拒绝 v1alpha2，防止
   “协议已到、映射未到”的半接通。

### 1.2 本批真实缺口

1. durable wrapper 尚未注入 `TaskLockedReasoningProviderMapper`；
2. raw Adapter 仍只接受 legacy `ModelRequest`，`projectRequest()` 无 typed reasoning projection；
3. Personal Model definition、Model lock 与 `ReasoningProfileSubject` 尚无单一 exact subject builder；
4. Local timeout policy 尚未投影成 DFI-5.3.1 所需的 exact private timeout identity；
5. mapping 通过后与 durable invocation prepare 的先后顺序尚未锁定；
6. retry/restart 时如何复用 historical exact mapping、且不把 raw directive持久化，尚未形成闭环；
7. 当前 Personal Model Provider Profile 只有协议/endpoint/request/response/transport revision，
   没有任何获批的 exact upstream model Max evidence；
8. 缺少真实进程 HTTP/TLS/SSE body capture 与 omission/mapping/Usage/timeout 联合证据。

## 2. 本批范围与明确不做

### 2.1 实施范围

- Local Personal exact subject 与 timeout identity 投影；
- Local Personal release source/registry composition；
- durable wrapper 的唯一 mapping preflight；
- raw OpenAI-compatible Adapter 的 sealed request projection；
- default/fallback body omission；
- `openai_reasoning_effort` exact mapping 执行路径；
- mapping failure typed error 与零上游副作用；
- retry、Tool、Compaction、restart、terminal replay 回归；
- 受控本地 HTTP/TLS/SSE Provider fixture；
- focused Harness、evidence 与父方案 120 项保留状态。

### 2.2 明确不做

- 不实现 Enterprise OpenAI/Anthropic mapping 或 Gateway v1alpha3；
- 不开放 production SubmitTurn v1alpha3；
- 不修改 Desktop Main/Preload/Renderer/Admin；
- 不实现 DFI-5.4 Max UI；
- 不增加或修改公共 Contract；
- 不新增 migration 27，不修改 migration 1～26；
- 不新增依赖，不修改 `pnpm-lock.yaml`；
- 不修改 30s/90s/300s/900s timeout 数值；
- 不放宽 MiniMax 缺 `[DONE]` 的终态约束；
- 不把 reasoning/thinking 私有输出展示给用户；
- 不实现 TGM、Knowledge Provider、Agent Lifecycle；
- 不使用真实用户 Secret、公网 Endpoint 或付费模型完成门禁。

## 3. 冻结架构决策

### 3.1 单一 Local Personal preflight

唯一允许决定 `omit | apply` 的组件仍是 DFI-5.3.1 的
`TaskLockedReasoningProviderMapper`。Local Personal durable wrapper 只负责提供已验证输入，不复制
Profile/Strategy 真值表。

固定顺序：

```text
1. strict parse ReadableModelRequest
2. require exact ModelProviderInvocation
3. validate Personal Model definition and exact Model lock
4. derive exact local ReasoningProfileSubject
5. derive exact Local Personal timeout policy identity
6. TaskLockedReasoningProviderMapper.map() exactly once
7. mapping failure -> typed fail, zero durable/upstream side effects
8. mapping success -> load or prepare durable invocation
9. existing invocation -> validate exact durable identity/deadline
10. dispatch raw Adapter with private sealed projection
11. Adapter validates projection again
12. Credential resolve, DNS/TLS/HTTP/SSE
```

步骤 6 必须早于 `prepareInvocation()`。不得先写 Invocation Link 再发现 mapping drift。

### 3.2 exact Local Personal subject builder

新增一个 Core-private 纯函数，输入只能是：

```text
validated PersonalModelDefinition
validated exact TaskCapabilityLock
locked Adapter descriptor
```

输出：

```text
authority = local_personal
modelCapabilityId = definition.personalModelId
modelCapabilityRevision = modelLock.definitionSnapshot.revision
adapterDescriptorId = modelLock.adapterDescriptorSnapshot.adapterDescriptorId
adapterDescriptorRevision = modelLock.adapterDescriptorSnapshot.revision
personalExecutionDefinitionDigest = definition.executionDefinitionDigest
```

并强制：

- Model lock capability id 与 Personal Model id 精确一致；`modelCapabilityRevision` 必须精确等于
  `modelLock.definitionSnapshot.revision`，保持 DFI-5.3.1 对 safe Profile subject 的既有 Contract 语义；
- Personal Model `configurationRevision` 不得冒充 Capability revision；它必须由已验证的 Personal Model
  definition 与 Personal lock `configurationRef`/binding identity 证明，`executionDefinitionDigest` 则独立提交
  provider profile、endpoint identity、provider model、capability 与 credential binding 等执行事实；
- Adapter id/revision 与 raw Provider 精确一致；
- definition 的 providerProfileRevision、endpointIdentityDigest、providerModelId、credentialBindingDigest
  已包含在 `executionDefinitionDigest` 的重算校验中；
- 不把 endpoint、credential ref、providerModelId 原文放入 subject 或 safe Profile；
- 不按 displayName、providerKind 或 modelId 前缀猜 subject。

### 3.3 timeout identity：新增 code-owned ref，revision/digest/数值投影既有 policy

新增 Core-private code-owned 投影：

```text
timeoutPolicyRef = timeout.local-personal.model-invocation.v1
timeoutPolicyRevision = model-invocation-timeout.v1
timeoutPolicyDigest = LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyDigest
```

规则：

1. `timeoutPolicyRef` 是本批新增、通过 `NamespacedResourceIdSchema` 校验的 code-owned identifier；它不是
   既有代码中已经存在的字符串；
2. `timeoutPolicyRevision`、`timeoutPolicyDigest` 与全部 timeout 数值只投影既有 policy，不铸造第二份
   timeout 配置；
3. 不修改 connect 30s、first progress 90s、idle 300s、overall default 900s；
4. mapping 的 timeout identity、Reasoning lock 的 `timeoutPolicyRef`、invocation timeout material 与
   migration 25 Timeout Fact 必须一致；
5. restart 从原 Timeout Fact 读取 exact deadline，不重新 `now + 900s`；
6. 外层 deadline 更早时仍取更早者，不把 Max 当作延长 deadline 的理由。

### 3.4 sealed Local Personal request projection

新增 Core-private discriminated union，不进入 Contracts：

```text
LocalPersonalReasoningProjection =
  | { mode: "omit" }
  | {
      mode: "apply";
      providerFamily: "local_openai";
      mappingRevision: Sha256Digest;
      mappingDigest: Sha256Digest;
      directive: { kind: "openai_reasoning_effort"; effort: "high" | "xhigh" };
    }
```

本批只消费 DFI-5.3.1 已冻结且适用于 `local_openai` 的
`openai_reasoning_effort`。`boolean_thinking` 与 `bounded_budget_preset` 虽是父方案预留的 mapping kind，
当前 private directive domain 没有对应 Local OpenAI variant；本批不得用任意 JSON 或临时字段补齐。

若后续获批 Local Provider 需要 boolean/budget 形状，必须先形成 exact Provider Profile/evidence 的聚焦修订，
再 additive 扩展 sealed union；不得在 Adapter 内按 providerKind 分支硬编码。

父方案 120 项中的 Local 46/47 继续保留，但本批验收为“未安装 boolean/bounded variant 时 strict reject、
production support 保持 unknown”的负向准入证明，不伪造正向 body mapping。该解释已同步回父方案 §9.3；不会
删除矩阵项或把它们标成已具备 production 支持。

### 3.5 body serializer 必须 allowlist 构造

`projectRequest()` 改为显式接收 `LocalPersonalReasoningProjection`，并从空白 allowlist body 构造：

```text
legacy fields:
  model/messages/stream/stream_options/max_tokens/tools

reasoning fields:
  omit  -> 不添加任何字段
  apply -> 只添加经 sealed directive 允许的 exact 字段和值
```

禁止：

- 先 spread raw directive 再删除未知字段；
- generic JSON Patch/JSON Pointer；
- `Record<string, unknown>` 作为 reasoning 注入入口；
- default/fallback 发送 `low|minimal|off|disabled|false`；
- 用 `max_tokens`、temperature、Tool 设置或 timeout 冒充 Max；
- 修改 model、messages、system、tools、stream、Usage、endpoint、authorization。

对于当前已冻结 `openai_reasoning_effort` variant，Local private projector 的唯一映射写死为：

```text
directive.kind = openai_reasoning_effort
  -> request body.reasoning_effort = directive.effort（high | xhigh）
```

字段名与值只存在于 Provider-private domain/projector 与受控测试 evidence；不得回写到 safe Profile、Task lock、
Receipt、公共日志或 UI。任何其他字段名、嵌套形状或值都必须 strict reject。

### 3.6 default 与 fallback 完全省略

以下三种 Task resolution 最终均为 ModelRequest `default_passthrough`：

- `default_passthrough`；
- `max_unsupported_default`；
- `max_capability_unknown_default`。

它们必须共享同一 `omit` projection：

- Profile load=0；mapping load=0；
- legacy body 与新 body 除 canonical serialization 方式外语义及字节 fixture 等价；
- body 中不得出现 `reasoning`、`reasoning_effort`、`effort`、`thinking`、`budget_tokens`、
  `enable_thinking` 等候选字段；
- fallback 不能在 Provider 成功后改写为 “Max 已生效”；
- Provider 默认行为变化不构成 Task drift，因为 Task 只承诺省略额外参数。

### 3.7 `max_applied` 只按 exact historical release

先冻结 Provider 入口真值表：

| Durable Task / Request 事实 | Profile / mapping 状态 | 结果 | 是否上游调用 |
| --- | --- | --- | --- |
| default passthrough | 不读取 | omit | 是，普通 body |
| max unsupported fallback | 不读取 | omit | 是，普通 body |
| max unknown fallback | 不读取 | omit | 是，普通 body |
| locked max | exact 唯一、全量验证通过 | apply exact directive | 是 |
| locked max | Profile 或 mapping 缺失/source unavailable | `reasoning_mapping_unavailable` | 否 |
| locked max | duplicate/digest/material drift | `reasoning_mapping_conflict` | 否 |
| locked max | subject/family/Adapter 不一致 | `reasoning_mapping_conflict` | 否 |
| locked max | timeout identity 不一致 | `reasoning_mapping_conflict` | 否 |

区别必须保留：用户提交时已经是 unknown/unsupported，Planner 会锁定 default fallback，任务可继续；用户提交时
已经锁定 `max_applied`，之后 exact mapping 丢失或漂移属于 durable fact 冲突，必须失败关闭，不能静默降级。

`max_applied` 必须同时验证：

1. request 为 `locked_max_strategy`；
2. ReasoningModeLock、ModelRequest、Runtime Selection 的 lock id/digest 一致；
3. exact subject 与 Personal Model definition/Model lock/Adapter 一致；
4. exact Profile ref 与 Strategy ref 各字段一致；
5. private mapping authority=`local_personal`、family=`local_openai`；
6. mapping/strategy/Profile 三层 digest 重算一致；
7. timeout identity 与原 Task lock、policy、durable Timeout Fact 一致；
8. private directive 是本批允许的 sealed Local variant；
9. Profile/mapping 各读取恰好一次；
10. historical release 即使不再 current，只要 exact material 仍可验证，就继续执行。

禁止切换到 current/latest Profile、另一个 personal configuration、另一个 upstream model、另一个 raw
effort 值或 default。

### 3.8 production release 与 test fixture 严格分离

当前工程没有经批准的 exact Local Personal Max production evidence。Personal Model 的
`providerModelId` 又是用户输入，不能因为 `providerKind=deepseek|zhipu|kimi` 自动创建 supported Profile。

因此 DFI-5.3.2 冻结：

```text
production Local Personal reasoning release count = 0
test-only exact Local Personal reasoning release count > 0
```

test fixture 只用于证明：

- exact subject/revision/digest；
- body omission 与 exact effort mapping；
- HTTP/TLS/SSE/Usage/timeout；
- drift 与零副作用。

它必须位于 test/support 或 fixture 路径，带 `test-only` 命名，且 production bootstrap 引用数为 0。
未来真实模型支持需单独提交：Provider-owned/批准规范、exact upstream model、request projection revision、
受控 fixture、evidence revision 与安全复核；合入后才允许 production release count 增加。

### 3.9 durable link 不持久化 raw directive

本批不新增 migration，也不在 `LocalPersonalModelInvocationLink` 中存 raw field/value。

恢复规则：

1. TaskRuntimeSelection、ReasoningModeLock、ModelRequest 与 Personal Model execution definition 已持久化
   exact safe identity；
2. restart 使用这些 exact refs 向 immutable release registry 再做一次 exact lookup；
3. 同一 invocation 已存在时，还必须通过既有 Link identity 与 migration 25 Timeout Fact 校验；
4. release 缺失或 digest 漂移时 typed fail-closed，不回退 default、不重建新 lock；
5. mapping lookup 是确定性读取，不产生新的 Task/Receipt/Invocation fact；
6. terminal replay 在 Provider resolution/mapping 前短路，mapping load=0、upstream=0。

### 3.10 typed failure 与优先级

沿用 DFI-5.3.1：

- `reasoning_mapping_unavailable`：exact Profile/mapping 缺失、source unavailable；
- `reasoning_mapping_conflict`：重复、摘要、subject、Adapter、timeout 或 directive family 冲突。

优先级：

```text
mapping typed cause
> local deadline/cancel typed cause（仅 mapping 已成功且已进入调用后）
> protocol error
> network failure
```

mapping error 不得被后续通用 `ECONNRESET`、credential error 或 schema parse error 覆盖。safe summary 不含
Profile/Strategy/mapping digest、providerModelId、endpoint、credential ref 或 raw directive。

### 3.11 Usage、私有 reasoning 输出与终态零漂移

1. 内容帧 `usage:null` 继续跳过，不能触发 `usage_invalid`；
2. final valid Usage 正常投影；缺 Usage 保持 unknown，不伪造 0；
3. reasoning/thinking delta 只作为 progress，不能进入 assistant text、Message、Receipt、日志或 UI；
4. `[DONE]` 后 timer 全部取消；
5. 正常 EOF 无 `[DONE]` 仍为 `stream_terminal_missing`；
6. 本批不增加 MiniMax terminal exception；
7. timeout/network/provider failure 不改写 Reasoning support 为 unsupported。

## 4. Composition 与依赖方向

### 4.1 构造路径

`DurableCompositeTaskModelProviderResolver` 在构造 Local durable Provider 时注入：

```text
TaskLockedReasoningProviderMapper
exact Local Personal timeout identity
```

`DurableLocalPersonalModelProvider`：

- 从 exact invocation + definition + lock 派生 subject；
- 调 mapper；
- mapping 成功后才进入既有 durable prepare/dispatch；
- 将 sealed projection 传给 raw transport。

`LocalPersonalOpenAiCompatibleModelProvider`：

- 不读取 Profile current pointer；
- 不自行决定 Max；
- 独立校验 projection family/directive 与 request identity；
- 投影 body 后才 resolve Credential。

### 4.2 raw Adapter 独立 fail-closed

raw Adapter 仍可能被测试或未来 composition 直接调用，因此不得只信 durable wrapper：

- v1alpha2 缺 private projection → `reasoning_protocol_unavailable`，started/credential/DNS/socket=0；
- v1 legacy 请求只允许 internal legacy path 或显式 `omit`；
- v1alpha2 + `omit` 与 request reasoning 不符 → conflict；
- v1alpha2 + `apply` 但 lock/mapping identity 不符 → conflict；
- public caller 无法构造任意 raw JSON。

### 4.3 activation 边界

本批允许 Local Personal internal Provider 链消费 ModelRequest v1alpha2，但 production SubmitTurn v1alpha3
入口仍保持不可达。因此：

- 这是 Provider-capability 接线，不是用户入口 activation；
- production supported Profile count=0 时不存在真实 `max_applied` production Task；
- default legacy behavior 不得因本批回归；
- DFI-5.3.3/5.3.4 完成前不得输出 DFI-5.3 stage conformant；
- DFI-5.4 前 Desktop 不出现 Max 开关。

## 5. 真实 Provider fixture

### 5.1 必须使用的拓扑

```text
Core Local Personal durable provider
  -> real loopback DNS/IP policy seam
  -> real local TLS socket
  -> controlled HTTP server
  -> capture raw request bytes
  -> emit controlled SSE frames
  -> [DONE] / normal EOF / reset / delayed progress
```

要求：

- 真实 Node HTTP/TLS server 与 socket，不直接调用 `projectRequest()` 冒充 E2E；
- 使用 test-only CA 与 loopback allow seam；
- Secret 为 synthetic canary，服务端只断言 header 是否存在，不把值写入 evidence；
- request body capture 只存在测试进程内，测试结束清零；
- 使用 deterministic barrier，不用 `sleep`；
- 不访问公网、不使用真实 Key、不产生费用。

### 5.2 场景矩阵

| 场景 | 预期 |
| --- | --- |
| default | body 完全无 reasoning 字段，正常 SSE/Usage/completed |
| unsupported fallback | 与 default body 等价，不声称 Max |
| unknown fallback | 与 default body 等价，不声称 Max |
| max exact release | body 仅出现封闭 exact directive，其他字段不漂移 |
| mapping missing | HTTP request count=0，typed unavailable |
| mapping duplicate/drift | HTTP request count=0，typed conflict |
| timeout identity mismatch | durable prepare/credential/socket=0 |
| `usage:null` + content | 正文正常，最终 Usage 正确 |
| reasoning-only progress | 重置 idle，不进入 assistant text |
| normal EOF without `[DONE]` | `stream_terminal_missing` |
| restart before dispatch | exact mapping/deadline 复用，不重新选择 |
| terminal replay | mapping/provider/upstream 全 0 |

## 6. 生命周期与并发窗口

### 6.1 L1～L8

1. L1 default 首轮：mapper load=0/0，omit；
2. L2 max 首轮：Profile/mapping load=1/1；
3. L3 Tool continuation：同 lock/mapping/deadline；
4. L4 50-round Tool loop：每轮同 Task lock，mapping identity 不变；
5. L5 initial Compaction：同 lock/mapping，权限不扩张；
6. L6 rolling Compaction：同上；
7. L7 retry before output：沿用 exact mapping 与 original deadline；
8. L8 terminal replay：mapping/provider/upstream=0。

### 6.2 C1～C8

1. C1 mapping 成功后、durable prepare 前崩溃：恢复重做 exact lookup，无 durable 半事实；
2. C2 durable accepted 后、dispatch 前崩溃：原 Link/Timeout Fact + exact mapping；
3. C3 dispatch claimed 后、socket 前崩溃：既有 fencing 规则；
4. C4 HTTP body write 前 mapping release 变 current：仍读 historical exact release；
5. C5 historical release 缺失：typed unavailable，不 default fallback；
6. C6 同 identity duplicate release：composition/startup 或 lookup conflict；
7. C7 output started 后崩溃：沿用既有 recovery exhausted，不自动重放；
8. C8 late response/ECONNRESET：不得覆盖已锁定 timeout/mapping cause。

### 6.3 零副作用计数

mapping unavailable/conflict 时逐项必须为 0：

```text
durableInvocationPrepare
credentialResolve
dnsLookup
socketConnect
tlsHandshake
httpRequestBodyWrite
providerStartedEvent
usageProjection
statusObservation
assistantMessageCommit
```

与父方案 §2.2 的八类 canonical 集合对齐如下：七个共享通道
`credentialResolve/dnsLookup/socketConnect/tlsHandshake/httpRequestBodyWrite/durableInvocationPrepare/usageProjection`
保持不变；Local Personal 没有 Central `gatewayAccept`，因此以 `providerStartedEvent` 替代该通道，并额外加入
`statusObservation` 与 `assistantMessageCommit`，形成上面的 Local 十类集合。DFI-5.3.3～5.3.4 的 Enterprise
验收仍使用父方案含 `gatewayAccept` 的八类集合，不把 Local 专属三通道强加给 Central。

计数必须来自 instrumented seam/真实诊断，不允许硬编码 0、`?? 0` 或“没有抛错所以视为 0”。

## 7. 安全与泄漏边界

至少扫描以下通道：

- stdout；
- stderr；
- structured evidence；
- failure payload；
- Task/Message/Receipt/Dynamic Facts/Context Receipt durable records；
- public Contracts、Desktop、Admin source graph。

Canary 至少覆盖：

- synthetic credential；
- endpoint host/path；
- providerModelId；
- raw directive field/value；
- mapping private material；
- reasoning/thinking private delta。

每个 canary 用 plain/URL/base64/hex 四种编码做负向扫描器非恒真证明；正常证据命中必须为 0。

## 8. QA 矩阵（96 项）

### 8.1 Domain / subject / timeout（QA-001～QA-016）

1. QA-001 exact local subject 字段逐项正确，且 `modelCapabilityRevision` 精确等于 locked Capability
   definition revision、不得等于或伪装 Personal Model `configurationRevision`；
2. QA-002 Personal Model id 漂移拒绝；
3. QA-003 configuration revision 漂移拒绝；
4. QA-004 execution definition digest 漂移拒绝；
5. QA-005 Adapter id 漂移拒绝；
6. QA-006 Adapter revision 漂移拒绝；
7. QA-007 provider profile revision 漂移经 definition integrity 拒绝；
8. QA-008 endpoint/providerModel/credential binding 漂移改变 execution digest；
9. QA-009 displayName 不作为 reasoning authority；
10. QA-010 providerKind 不单独证明 supported；
11. QA-011 timeout ref 固定为 code-owned id；
12. QA-012 timeout revision exact；
13. QA-013 timeout digest exact；
14. QA-014 timeout identity mismatch conflict；
15. QA-015 timeout 数值保持 30/90/300/900 秒；
16. QA-016 不新增 migration 27。

### 8.2 Omission / body mapping（QA-017～QA-036）

17. QA-017 default Profile load=0；
18. QA-018 default mapping load=0；
19. QA-019 unsupported fallback load=0/0；
20. QA-020 unknown fallback load=0/0；
21. QA-021 default body 无 `reasoning`；
22. QA-022 default body 无 `reasoning_effort`；
23. QA-023 default body 无 `effort`；
24. QA-024 default body 无 `thinking`；
25. QA-025 default body 无 `budget_tokens`；
26. QA-026 default body 无 `enable_thinking`；
27. QA-027 default 不发送 low/minimal/off/disabled/false；
28. QA-028 unsupported body 与 default 等价；
29. QA-029 unknown body 与 default 等价；
30. QA-030 max exact effort field/value；
31. QA-031 max 不改变 model；
32. QA-032 max 不改变 messages/system；
33. QA-033 max 不改变 tools；
34. QA-034 max 不改变 stream/Usage；
35. QA-035 max 不改变 max_tokens；
36. QA-036 serializer 无 generic patch/spread raw directive。

### 8.3 Mapping / failure / zero-side-effect（QA-037～QA-056）

37. QA-037 max Profile load=1；
38. QA-038 max mapping load=1；
39. QA-039 exact historical release 可执行；
40. QA-040 current pointer 变化不影响 historical release；
41. QA-041 missing Profile → unavailable；
42. QA-042 missing mapping → unavailable；
43. QA-043 duplicate mapping → conflict；
44. QA-044 Strategy digest drift → conflict；
45. QA-045 Profile digest drift → conflict；
46. QA-046 mapping digest drift → conflict；
47. QA-047 subject drift → conflict；
48. QA-048 directive family drift → conflict；
49. QA-049 timeout drift → conflict；
50. QA-050 durable prepare count=0；
51. QA-051 credential resolve count=0；
52. QA-052 DNS/socket/TLS counts=0；
53. QA-053 HTTP body/provider started counts=0；
54. QA-054 Usage/status/message counts=0；
55. QA-055 mapping error safe summary 无 private material；
56. QA-056 late network error 不覆盖 mapping typed cause。

### 8.4 Provider / SSE / Usage / timeout（QA-057～QA-072）

57. QA-057 真实 loopback TLS server 接收 default；
58. QA-058 真实 loopback TLS server 接收 max；
59. QA-059 synthetic Authorization 存在但不入 evidence；
60. QA-060 request capture 只在 test process；
61. QA-061 `usage:null` 内容帧不失败；
62. QA-062 final valid Usage 正确；
63. QA-063 缺 Usage 保持 unknown；
64. QA-064 reasoning progress 重置 idle；
65. QA-065 reasoning delta 不进 assistant text；
66. QA-066 `[DONE]` 后 timer 清理；
67. QA-067 无 `[DONE]` EOF → terminal_missing；
68. QA-068 connect timeout typed；
69. QA-069 first-progress timeout typed；
70. QA-070 idle timeout typed；
71. QA-071 overall deadline 复用 exact fact；
72. QA-072 Provider timeout/network 不改 support state。

### 8.5 Lifecycle / recovery（QA-073～QA-088）

73. QA-073 Tool continuation 同 lock/mapping；
74. QA-074 50-round Tool loop mapping identity 唯一；
75. QA-075 initial Compaction 同 lock/mapping；
76. QA-076 rolling Compaction 同 lock/mapping；
77. QA-077 retry 不读 current Profile；
78. QA-078 retry 不重新获得 deadline；
79. QA-079 restart exact Link/Timeout Fact；
80. QA-080 restart exact historical mapping；
81. QA-081 mapping 后 prepare 前崩溃无半事实；
82. QA-082 accepted 后恢复不重新选择模型；
83. QA-083 output-started 后不自动 replay；
84. QA-084 terminal replay mapping load=0；
85. QA-085 terminal replay Provider resolve=0；
86. QA-086 terminal replay upstream=0；
87. QA-087 late callback 资源清理；
88. QA-088 deterministic barrier，禁止 sleep。

### 8.6 Boundary / evidence / regression（QA-089～QA-096）

89. QA-089 production Local supported release count=0；
90. QA-090 test fixture production consumer count=0；
91. QA-091 raw mapping public Contract/Desktop/Admin leak=0；
92. QA-092 多编码负向扫描非恒真、正常四通道命中=0；
93. QA-093 migration=26、lockfile digest 不变；
94. QA-094 DFI-5.3.1 historical evidence 不覆盖、foundation focused regression 通过，且 parent 120 matrix
    definition 保留、未伪报全执行；
95. QA-095 DFI-5.3.3/5.3.4、production SubmitTurn、Desktop Max UI 均 false；
96. QA-096 outcome 仅为 `DFI532_LOCAL_PERSONAL_REASONING_MAPPING_CONFORMANT`。

## 9. 文件边界

### 9.1 编码授权后允许

- `services/core/src/application/durable-local-personal-model-provider.ts`；
- `services/core/src/application/task-locked-model-provider-resolution.ts`；
- `services/core/src/application/*local-personal*reasoning*.ts`；
- `services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts`；
- `services/core/src/ports/**` 中必要的 private transport signature；
- `services/core/src/bootstrap/create-desktop-private-runtime.ts`，仅用于注入空 production release source 与
  mapper，不开放 SubmitTurn v1alpha3；
- `services/core/src/index.ts`，仅 Core-private export；
- `services/core/tests/**`、`scripts/run-dfi5.3.2-harness.mjs`、`artifacts/dfi532/**`；
- Root/Core package version、实施报告与治理文档。

`services/core/tests/dfi5.3.1-boundary.test.ts` 允许做最小 stage-aware 修订：把“任何 production consumer=0”
这一已经被 DFI-5.3.2 授权取代的阶段性断言，改成“只有 Local Personal allowlist 路径可消费，unexpected/
Enterprise/Desktop/Admin/Central consumer=0”；其余 DFI-5.3.1 digest、strict schema、public leak、migration、
lockfile 等长期不变量必须保留。

### 9.2 禁止

- `packages/contracts/src/**`；
- `services/central-service/**`；
- `apps/desktop/**`；
- `apps/admin-console/**`；
- `services/document-worker/**`；
- SQLite migration；
- dependency 与 `pnpm-lock.yaml`；
- DFI-5.3.3～5.4、TGM、Knowledge Provider、Agent Lifecycle；
- production SubmitTurn v1alpha3 route；
- 真实 Provider Secret/公网测试。
- `scripts/run-dfi5.3.1-harness.mjs` 与 `artifacts/dfi531/**` 历史 evidence 的覆盖或改写。

若实现发现必须修改禁止路径、增加 migration/dependency、安装真实 production mapping entry 或扩展 Local
boolean/budget directive，立即停止并回到聚焦差异评审。

## 10. 实施步骤与估算

### Step 1 — Exact identity 与 private projection（1～2 日）

- exact subject builder；
- timeout identity projection；
- sealed Local request projection；
- domain/conformance tests。

### Step 2 — Durable/raw Provider 接线（2～3 日）

- mapper 注入；
- mapping-before-prepare；
- allowlist body serializer；
- typed failure 与 recovery identity；
- legacy/default regression。

### Step 3 — Real fixture / lifecycle / closure（1～2 日）

- loopback TLS/SSE fixture；
- body/Usage/timeout/restart/Tool/Compaction tests；
- leak/boundary scan；
- Harness/evidence/report/full gates。

合计：**4～7 个集中工程日**。不含真实 Provider Profile 证据审批、独立 QA 与等待时间。

## 11. 门禁

### 11.1 历史 DFI-5.3.1 evidence 与后续回归的分层

编码前先在原始基线运行一次 `harness:dfi5.3.1`，确认历史 evidenceDigest：

```text
sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841
```

编码后**不得**要求旧 Harness 继续通过或重新生成相同 digest。原因是旧 Harness 的阶段性结论明确包含：

```text
productionMapperConsumerCount=0
providerAdapterConnected=false
dfi532Unlocked=false
```

DFI-5.3.2 获授权后的目标正是改变这三项中的 Local Personal 接线事实。强制旧 digest 不变会同时要求“接线”和
“未接线”，属于不可能约束。

编码后改用以下分层证据：

1. 直接复跑 DFI-5.3.1 domain/mapper tests，证明非循环摘要、strict schema、exact registry/mapper 语义零漂移；
2. 最小修订 DFI-5.3.1 boundary test，只移除已被授权取代的“所有 production consumer=0”阶段性断言；
3. `harness:dfi5.3.2` 记录上述历史 digest，但不覆盖 `artifacts/dfi531/**`；
4. 新 Harness 扫描 authorized Local Personal consumer allowlist，要求至少一个已授权 Local consumer，且
   `unexpectedProductionMapperConsumerCount=0`；
5. Enterprise、Central、Desktop、Admin、公共 Contract consumer/leak 继续为 0；
6. 父方案 120 项继续 `retained_for_dfi53_stage_closure`。

### 11.2 编码后命令

编码完成后至少执行：

```text
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm exec vitest run \
  services/core/tests/dfi5.3.1-private-mapping-domain.test.ts \
  services/core/tests/dfi5.3.1-task-locked-mapper.test.ts \
  services/core/tests/dfi5.3.1-boundary.test.ts
env -u ELECTRON_RUN_AS_NODE CI=true pnpm run harness:dfi5.3.2
env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm install --offline --frozen-lockfile
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
shasum -a 256 pnpm-lock.yaml
```

Central 即使本批不改 Java 也不得省略。若并发窗口造成 root check 无法形成可信基线，应停止收口并如实报告，
不得自动 retry 掩盖首跑事实。

## 12. 实施报告必须给出的证据

1. 修改文件清单与 before/after version；
2. production/test release count；
3. default/fallback Profile/mapping load count；
4. max exact Profile/mapping load count；
5. mapping failure 十类零副作用计数；
6. captured body 的 content-free key/value assertions；
7. Tool/Compaction/retry/restart/terminal replay identity；
8. migration 25 exact deadline 复用；
9. Usage/null/[DONE]/private reasoning output 结果；
10. 多编码泄漏扫描与资源归零；
11. 父方案 120 项 `retained_for_dfi53_stage_closure`，并明确本批未全部执行；
12. DFI-5.3.1 historical evidenceDigest 保持历史只读、未覆盖；domain/mapper/boundary focused regression
    结果，以及 authorized Local consumer allowlist / unexpected consumer=0；
13. production SubmitTurn/Desktop Max UI/Enterprise mapping/readiness false；
14. lockfile digest 与 migration 最大 id；
15. focused/full/Central/frozen install 门禁原始结果。

## 13. 停手条件

出现以下任一情况立即停止编码并回评审：

1. 必须修改公共 Contract；
2. 必须新增 migration 27；
3. 必须新增依赖或修改 lockfile；
4. 需要把 raw directive 持久化到 Task/Receipt/Link；
5. 需要 generic JSON Patch/任意字段注入；
6. 需要按 Provider/model 名称猜 Max；
7. 需要安装未经批准的 production supported release；
8. 需要为 Local boolean/budget 临时扩展未评审 schema；
9. mapping 无法在 durable prepare/Credential/DNS 前完成；
10. restart 只能读取 current mapping 或重新获得 deadline；
11. default/fallback 只能通过发送 low/off 模拟；
12. reasoning 私有输出必须进入正文/日志才能工作；
13. 需要放宽 `[DONE]` 或顺带修 MiniMax；
14. 需要修改 Enterprise/Desktop/Admin/TGM/Knowledge/Agent Lifecycle；
15. 真实验证必须使用公网、用户 Secret 或付费调用；
16. test fixture 会进入 production graph；
17. 父方案 120 项被误报为本批已全部执行；
18. workspace 并发变化无法安全归因或完整门禁无法形成可信基线。
19. 为让旧 DFI-5.3.1 Harness/evidenceDigest 继续不变而隐藏已授权的 Local consumer，或反向覆盖历史 evidence。

## 14. 评审问题

请独立评审者重点确认：

1. 是否接受 production Local supported release count=0 的诚实边界；
2. 是否接受本批只执行已冻结的 `openai_reasoning_effort`，boolean/budget 需另行证据评审；
3. mapping-before-durable-prepare 是否足以保证零副作用；
4. exact subject 是否以 Capability revision + Personal execution digest + Adapter revision 分层绑定；
   Personal configuration revision 是否继续由已验证 definition/binding 证明而未被错误复用为 Capability revision；
5. raw directive 不持久化、restart 重新 exact lookup immutable release 是否可接受；
6. default/fallback body omission 是否足够严格；
7. timeout identity 与 migration 25 deadline 复用是否零漂移；
8. 真实 loopback TLS/SSE fixture 是否足以代替公网/真实 Key；
9. 96 项本批矩阵与父方案 120 项保留关系是否清晰；
10. 4～7 日估算是否合理。

## 15. 当前状态

```text
DFI-5.3.1  PASS/CLOSED
DFI-5.3.2  PASS/CLOSED
DFI-5.3.3  PASS/CLOSED
DFI-5.3.4  DOCUMENT REVIEW PASS / USER ACCEPTANCE PENDING / CODING GATED
DFI-5.4    GATED
```

Revision 2 已由用户聚焦接受；实现与开发者门禁完成后，Claude Code 独立 QA 给出
`INDEPENDENT_QA_PASS`（P0～P3 全 0），用户已正式接受，DFI-5.3.2 当前 `PASS/CLOSED`。详见
[实施报告](./DFI-5.3.2-LOCAL-PERSONAL-REASONING-MAPPING-IMPLEMENTATION-REPORT.md)与
[独立 QA 报告](../qa/dfi-5.3.2-claude-qa.md)。DFI-5.3.1 historical evidence/Harness 继续只读；父方案
120 项矩阵继续保留至 DFI-5.3 阶段收口，不视为本批已全部执行。DFI-5.3.3 已完成实现、独立 QA 与用户接受，
正式 `PASS/CLOSED`；DFI-5.3.4 独立文档复核已 PASS，两个 P3 文档精度项已吸收，未获用户正式接受与单独
编码授权前继续 `CODING GATED`。
