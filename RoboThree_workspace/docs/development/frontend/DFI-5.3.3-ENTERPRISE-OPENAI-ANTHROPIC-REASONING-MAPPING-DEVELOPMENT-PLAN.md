# DFI-5.3.3 Enterprise OpenAI-compatible / Anthropic-compatible Reasoning Mapping 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED / PASS/CLOSED**  
> 日期：2026-08-27  
> 负责人：Codex 5.6  
> 父计划：[DFI-5.3 Provider Mapping](./DFI-5.3-PROVIDER-MAPPING-DEVELOPMENT-PLAN.md)  
> 上游：DFI-5.3.1、DFI-5.3.2 `PASS/CLOSED`  
> 本批最高输出：`DFI533_ENTERPRISE_REASONING_MAPPING_CONFORMANT`  
> 下游：DFI-5.3.4、DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与
> Desktop/Admin v2 consumption 继续 `GATED`

> Document review clarification（2026-08-27）：独立文档复核总体 `PASS`。复核原 P3-1 将 Core-private
> `packages/contracts/src/model-protocol/v1alpha2.ts` 与既有 Wire Contract
> `contracts/enterprise-gateway/v1alpha1～v1alpha2/**` 混为同一协议落点，事实不成立；v1alpha3 继续新增在
> `contracts/enterprise-gateway/v1alpha3/**`。有效 P3 仅剩一项，并已在 §3.2 写死：既有
> `ModelReasoningV1Alpha2Schema` 字节冻结，Gateway v1alpha3 reasoning sidecar 是独立 Wire Schema。

## 0. 结论先行

DFI-5.3.3 负责把 Task 已锁定的 reasoning 决策，经 Core 与 Central 两次独立校验，接到两类既有企业
Provider Adapter：

```text
ModelRequest v1alpha2 + exact Task/Model/Reasoning locks
  -> Core exact private mapping preflight
  -> Enterprise Gateway v1alpha3 safe reasoning sidecar
  -> Central exact mapping/binding second validation
  -> sealed OpenAI-compatible or Anthropic-compatible projector
  -> controlled HTTP/TLS/SSE fixture
```

本详细方案对父计划分批做一项明确调整：**DFI-5.3.3 同时完成 Enterprise OpenAI-compatible 与
Anthropic-compatible mapping**；DFI-5.3.4 只保留三 Provider 联合 lifecycle、cutover 与 DFI-5.3 阶段
Closure。这样避免 Gateway v1alpha3、Central private registry、cache cross-product 与 Anthropic projector
被人为拆成两次半装配。

本批完成后必须同时成立：

1. `default_passthrough` 及两类 fallback 在两个企业 Adapter 的 HTTP body 中完全省略
   `reasoning/effort/thinking/budget`；
2. `max_applied` 只使用 Task 已锁定的 exact Profile、Strategy、mapping 与 timeout identity；
3. Core 不发送 raw effort/budget；Central 只按 immutable private release 和 exact Endpoint Binding 映射；
4. Gateway v1alpha3 additive，v1alpha1/v1alpha2 Contract、digest 与 Controller 语义零漂移；
5. OpenAI 只允许 sealed `reasoning_effort: high | xhigh`；Anthropic 只允许 sealed
   `thinking: {type:"enabled", budget_tokens}`；
6. Prompt Cache 与 Reasoning 正交组合，不互相重算或覆盖；
7. mapping/binding/profile/timeout drift 失败关闭，不切 current、不降级 default、不换模型；
8. retry、Tool 后续轮、Compaction 与 restart 复用原 Task lock 和原 durable deadline；
9. private reasoning/thinking/signature 不进入 Message、Receipt、日志、UI 或 assistant 正文；
10. production SubmitTurn v1alpha3、Desktop Max UI 与 production enterprise Max release 继续不可达/0。

因此本批最高只输出：

```text
DFI533_ENTERPRISE_REASONING_MAPPING_CONFORMANT
```

它不表示 production 企业 Max 已可用，不表示 SSO/production entitlement 已就绪，也不表示 DFI-5.3 父方案
120 项矩阵已全部执行。父矩阵继续保留至 DFI-5.3.4 阶段收口。

## 1. 当前代码事实与真实缺口

### 1.1 已关闭且必须复用

1. DFI-5.3.1 已冻结并实现非循环摘要顺序：
   `Strategy commitment -> safe Profile -> full private mapping`；
2. `TaskLockedReasoningProviderMapper` 已实现 default 零 load、max exact Profile/mapping 各一次 load、
   historical exact lookup 与 typed fail-closed；
3. sealed private directive 当前只有 OpenAI effort 与 Anthropic bounded budget 两个合法 variant；
4. DFI-5.3.2 已证明 mapping-before-durable-prepare、raw Adapter defence-in-depth、body allowlist、
   retry/restart exact deadline 与 terminal replay 零 mapping load；
5. ModelRequest v1alpha2 已携带 exact ReasoningModeLock/Profile/Strategy refs，并进入 request digest；
6. Enterprise durable wrapper 当前在任何 Gateway/Provider 副作用前拒绝 v1alpha2，避免半接通；
7. Enterprise Gateway v1alpha1 已承载普通 invocation；v1alpha2 仅承载 required Prompt Cache sidecar；
8. Central 已有 exact `ModelEndpointBinding`，含 model/configuration/registry generation、protocol、
   binding/credential/capability profile/timeout profile revisions；
9. OpenAI-compatible 与 Anthropic-compatible Adapter 已有独立 allowlist body builder、SSE、Usage、Tool、
   timeout 与 cache projection；
10. Anthropic `thinking_delta`/signature 与 OpenAI reasoning detail 已处于私有流处理边界，不作为 assistant 正文。

### 1.2 本批真实缺口

1. `EnterpriseModelRequestConverter` 仍只解析 v1 ModelRequest，只生成 Gateway v1alpha1/v1alpha2；
2. `DurableEnterpriseModelProvider` 仍用 `requireLegacyModelRequestForUnmappedProvider()` 拒绝 v1alpha2；
3. `contracts/enterprise-gateway` 尚无 v1alpha3 reasoning-aware additive Contract；
4. Central HTTP mapper/Controller 尚不能 strict parse v1alpha3；
5. Central Provider request 尚无 sealed reasoning projection；
6. Central 尚无 release-pinned enterprise private mapping source 与 exact second validator；
7. 两个企业 Adapter 尚未执行 body-level omission/apply；
8. Core safe subject 与 Central Endpoint Binding protocol/configuration/registry/timeout 的双端一致性尚未证明；
9. Anthropic budget 与 locked `maxOutputTokens` 的冲突尚未冻结失败语义；
10. 尚无 v3 + cache absent/present + 两 Provider family 的真实 HTTP/TLS/SSE cross-product 证据。

## 2. 范围与明确不做

### 2.1 本批实施范围

- additive `enterprise-gateway/v1alpha3` schema、OpenAPI、fixtures 与 TS/Java conformance；
- Core enterprise exact subject/family/timeout identity resolver；
- Core durable enterprise mapping preflight 与 v1alpha3 converter；
- Central release-pinned enterprise reasoning mapping source；
- Central v1alpha3 strict Controller/HTTP mapper 与 second validator；
- sealed `ProviderReasoningProjection` 在 Central Provider request 中的内部传递；
- OpenAI-compatible body omission/apply；
- Anthropic-compatible body omission/apply；
- Prompt Cache × reasoning 的正交组合；
- controlled local HTTP/TLS/SSE fixtures、Usage/timeout/private-output/security evidence；
- focused Harness、cross-language digest evidence、boundary scan 与治理报告。

### 2.2 明确不做

- 不开放 production SubmitTurn v1alpha3 route、Main IPC、Preload API 或 Desktop Max UI；
- 不安装任何 production OpenAI/Anthropic Max release，production supported release count 保持 0；
- 不修改 Local Personal mapping 或覆盖 DFI-5.3.1/5.3.2 historical evidence；
- 不实现 production identity/SSO、enterprise entitlement、TGM、Knowledge Provider 或 Agent Lifecycle；
- 不修改 Desktop/Admin；
- 不新增 migration 27，不修改 migration 1～26；
- 不新增 Central DB migration/表/列/索引；
- 不新增依赖，不修改 `pnpm-lock.yaml`；
- 不改变现有 timeout 数值、retry 次数、Tool round、context/output budget；
- 不修 MiniMax `[DONE]`，不扩展 boolean thinking 或通用 JSON patch；
- 不使用公网、真实用户 Secret 或付费 Provider 作为门禁；
- 不把本批 Conformance 宣称为 production ready。

## 3. 冻结架构决策

### 3.1 单一 Core mapping preflight

Enterprise 路径复用唯一 `TaskLockedReasoningProviderMapper`，不在 converter、Gateway client、Central 或
Adapter 复制 lock/Profile 真值表。固定顺序：

```text
1. strict parse ReadableModelRequest
2. require exact ModelProviderInvocation
3. validate Runtime Selection / Model lock / ReasoningModeLock / request digest
4. terminal replay 先短路，mapping load = 0
5. default_passthrough -> omit，Profile/mapping load = 0
6. max -> 从可信 Adapter descriptor registry 派生 enterprise provider family
7. 从 exact Model lock 派生 ReasoningProfileSubject(authority=central_enterprise)
8. 从 code-owned enterprise timeout registry 派生 exact timeout identity
9. exact Profile/mapping 各 load 恰好一次
10. 重算 Strategy/Profile/mapping digest
11. 生成 safe Gateway reasoning sidecar；raw directive 不离开 Core private mapper
12. 才允许 prepare Core durable Invocation Link 与发起 Gateway v1alpha3 accept
```

Provider family 只能来自可信、revision-pinned Adapter descriptor material。禁止按 modelId、营销名称、Endpoint
URL、用户输入或“兼容 OpenAI/Anthropic”字符串猜测。Core 与 Central 对 family 的判断必须独立：Core 依据 exact
Adapter descriptor；Central 依据 exact `ModelEndpointBinding.protocol`。两者不一致即 conflict。

### 3.2 Gateway v1alpha3 safe sidecar

新增 `contracts/enterprise-gateway/v1alpha3/**`，不修改 v1alpha1/v1alpha2。v1alpha3 在 provider-neutral
`modelRequest` 中增加 strict `reasoning`：

```text
default_passthrough:
  mode = default_passthrough
  reasoningModeLockId
  reasoningModeLockDigest

locked_max_strategy:
  mode = locked_max_strategy
  reasoningModeLockId
  reasoningModeLockDigest
  profileId/profileRevision/profileDigest
  strategyId/strategyRevision/strategyDigest
  mappingRevision/mappingDigest
  timeoutPolicyRef
```

`mappingRevision/mappingDigest` 是 content-free immutable identity，允许进入 safe sidecar，用于 Central exact
lookup 和第二次校验；它不包含 raw field/value、effort、budget、JSON fragment、Endpoint、Credential、
upstream model 或完整 private release。

既有 `packages/contracts/src/model-protocol/v1alpha2.ts` 中的 `ModelReasoningV1Alpha2Schema` 必须保持字节冻结。
Gateway v1alpha3 `reasoning` 是独立新增的 Wire Schema：Core converter 只在转换阶段把既有 v1alpha2 reasoning
事实与 `TaskLockedReasoningProviderMapper` 派生的 exact Profile/mapping refs 合并成 v3 sidecar；不得修改、扩宽
或回填既有 v1alpha2 reasoning member，也不得让 Renderer/Main/Central 反向写入 Core ModelRequest。

strict union 规则：

- default variant 禁止 Profile/Strategy/mapping/timeout 字段；
- max variant 上述字段全部必填；
- `mappingRevision === mappingDigest`；
- ReasoningModeLock、Profile、Strategy 与 mapping refs 必须与 Core exact preflight 结果一致；
- raw `reasoning_effort`、`thinking`、`budget_tokens`、`enable_thinking` 等字段一律 schema reject。

### 3.3 v1alpha3 request digest 唯一公式

v1alpha3 只允许以下 canonical material：

```text
requestDigest = sha256CanonicalJson({
  modelRequest,            // 已包含 safe reasoning sidecar
  admission,
  timeoutPolicy,
  ...(cacheContextDigest absent ? {} : {cacheContextDigest})
})
```

规则：

1. cache absent 时不得补 `disabled`、null 或空 digest；
2. cache present 时先独立重算 `cacheContextDigest`，再把 exact digest 放入 requestDigest material；
3. raw cacheContext 不重复进入 requestDigest，避免两套含义；
4. reasoning 已作为 modelRequest 的 strict member进入同一摘要，不另建循环 digest；
5. TS converter 与 Java mapper 必须对同一 fixture 得出同一 digest；
6. v1/v2 digest helper 与 fixtures 字节冻结，不改成 readable union 自动解析。

### 3.4 v1/v2/v3 单次 dispatch

Core 按 ModelRequest schemaVersion 一次 dispatch：

```text
v1alpha1 ModelRequest -> Gateway v1alpha1 或 cache-required v1alpha2（既有）
v1alpha2 ModelRequest -> Gateway v1alpha3（reasoning 必填，cache 可选）
unknown/corrupt        -> typed fail-closed
```

Central 按 URL/Contract version 一次 strict dispatch，不允许：

- v3 parse 失败后尝试 v2/v1；
- 依据 JSON 中是否出现 `reasoning` 猜版本；
- 用 v3 Controller 替代 v1/v2；
- v1/v2 Controller 宽松接收 v3 字段。

cancel/status/events 继续各自 exact version identity；不得跨版本复用请求 body 后再事后改
`contractVersion`。

### 3.5 Central immutable private mapping release

Central 新增 Core-private `EnterpriseReasoningMappingSource/Registry`（最终命名可按 Java style 微调），只按以下
exact key 读取：

```text
authority = central_enterprise
providerFamily
model capability id/revision
adapter descriptor id/revision
profile id/revision/digest
strategy id/revision/digest
mapping revision/digest
timeout policy ref/revision/digest
```

registry 必须：

- 启动时拒绝 duplicate exact identity；
- 不提供 current/latest/alias/fallback；
- historical release 只能 exact 读取；
- 缺失返回 unavailable，重复/摘要漂移返回 conflict；
- raw directive 只留在 Central private mapping object；
- `toString()`、日志、error 与 diagnostics 只输出 safe identity，不输出 raw directive；
- production release list 初始为空；test-only fixture 明确带 `testOnly=true`，不得进入 production graph。

跨语言 fixture 由同一 canonical release material产生 safe Profile/Strategy/mapping refs和 Central private
directive。TS 与 Java 各自重算，而不是 Java 信任 TS 预填 digest。

### 3.6 Central 第二次 exact 校验

v1alpha3 Controller 在调用既有 invocation runtime/accept 之前执行 second validator：

```text
Gateway safe reasoning refs
  == exact Central private release refs
  == provider-neutral model/configuration/registry refs
  == resolved immutable ModelEndpointBinding selection
  == binding protocol -> provider family
  == binding capabilityProfileRevision
  == binding timeoutProfileRevision / exact timeout policy identity
```

固定责任：

- Core 证明 Task/Model/Reasoning lock；
- Central 证明 Endpoint Binding、provider family、private directive 与 enterprise timeout binding；
- Core 不自报 Endpoint/Credential/raw directive；
- Central 不读取 JWT payload、Renderer hint 或 model name 推断 mapping。

Central second validation 失败必须发生在 invocation accept、Credential resolve、Adapter select、DNS、socket、TLS、
HTTP body write 与 Usage projection之前，对这些 **Central-side** 计数断言全 0。

需要诚实区分：Core 已在本地 durable link transaction 后才发 Gateway accept；因此仅由 Central 独立发现的
远端 drift，可以留下一个 content-free Core pending link。不得伪报该场景“Core durable link count=0”。该 link
必须记录 typed failure/recovery state，restart 不重选 mapping。Core 自己发现的 mapping conflict 才要求 Core
durable prepare 与 Gateway accept 均为 0。

### 3.7 Central Provider request 的 sealed projection

`ModelProviderRequest` additive 增加 Core-private sealed projection：

```text
EnterpriseProviderReasoningProjection =
  | Omit
  | OpenAiEffort(mappingRef, effort=high|xhigh)
  | AnthropicThinkingBudget(mappingRef, budgetTokens=1024..131072)
```

禁止：

- `Map<String,Object>` 任意字段注入；
- JSON Patch/JSON Pointer；
- boolean `enableThinking`；
- 用 Protocol 枚举直接推导默认 raw 值；
- Adapter 再次读取 registry/current Profile；
- projection 持有 Credential、Endpoint 或 full release。

`ModelProviderRequest` 构造时重验 projection 与 binding protocol；不匹配立即失败，不允许进入 Adapter。

### 3.8 OpenAI-compatible body mapping

OpenAI projector 从既有 allowlist body builder 的最终安全对象开始，只允许：

```text
Omit          -> 不增加任何 reasoning 字段
OpenAiEffort  -> 增加 reasoning_effort: "high" | "xhigh"
```

规则：

- default/unsupported/unknown 三类锁的 body 在 reasoning 字段外与 legacy byte-equivalent；
- 不发送 `low/minimal/off/false` 模拟默认；
- 不修改 model/messages/tools/max_tokens/stream/stream_options/cache/deadline；
- Anthropic directive 送入 OpenAI Adapter 必须 protocol conflict；
- 未批准 boolean/bounded OpenAI variant 必须 strict reject/unknown，不临时映射。

### 3.9 Anthropic-compatible body mapping

Anthropic projector 只允许：

```text
Omit -> 不增加 thinking 字段
AnthropicThinkingBudget ->
  thinking: {
    type: "enabled",
    budget_tokens: <exact locked integer>
  }
```

规则：

- `budgetTokens` 范围继续由 sealed directive 限制为 1,024～131,072；
- 必须满足 `budgetTokens < maxOutputTokens`；不满足返回 conflict，禁止自动增大 max tokens；
- 不发送 `{type:"disabled"}` 或 `budget_tokens:0` 模拟默认；
- 不修改 model/messages/system/tools/max_tokens/stream/cache/deadline；
- OpenAI directive 送入 Anthropic Adapter 必须 protocol conflict；
- `thinking_delta`、signature/verification material 只可作为 progress/protocol evidence，不进入 assistant text。

### 3.10 Prompt Cache 与 Reasoning 正交组合

必须覆盖四个组合：

| Cache | Reasoning | 行为 |
| --- | --- | --- |
| absent | omit | legacy body + 无 cache marker + 无 reasoning field |
| present | omit | 只投影既有 cache marker |
| absent | apply | 只投影 exact reasoning directive |
| present | apply | 同时投影既有 cache marker与 exact reasoning directive |

cache planner 不读取/改变 reasoning；reasoning projector 不读取/改变 cache marker。任一侧失败都不得删除另一侧
事实后继续请求。OpenAI `prompt_cache_key` 与 `reasoning_effort`、Anthropic explicit cache marker 与 `thinking`
必须分别由已有 typed projector + 新 typed projector组合，禁止在一个 generic body mutator 内交叉处理。

### 3.11 Timeout、retry、restart 与 replay

- 本批不改变任何 timeout 数值；
- Enterprise timeout identity 必须 exact 对齐 Central binding 的 `timeoutProfileRevision`；
- overall deadline 继续使用 invocation 已锁定 `providerRequestDeadlineAt`，restart 不重新 now+duration；
- retry、Tool 后续轮、用户 continuation、initial/rolling compaction 每次只按原 exact refs读取 immutable mapping；
- current Profile/mapping/binding 变化不迁移历史 Task；historical release 缺失则 fail-closed；
- terminal replay mapping/profile/registry/Adapter/Provider/upstream 调用全部为 0；
- timeout/cancel/network/protocol failure 不修改 support 或 Profile；
- Central 无法自动安全恢复时维持既有 uncertain/manual reconciliation，不因 Max 新建第二套恢复协议。

### 3.12 Usage、私有输出与敏感边界

1. OpenAI 继续消费可信最终 Usage；`usage:null` 不造 0；reasoning token 只可进入既有 Provider-private Usage
   字段，不扩公共 Contract；
2. Anthropic 继续使用既有 input/output/cache Usage 聚合；不从 budget 或输出长度推断 Usage；
3. repeated attempt 继续保持 at-least-once 费用语义，不宣称 exactly-once billing；
4. raw effort/budget、private release、Endpoint、Credential、Authorization header 不进入 Gateway public response、
   Task/Message/Receipt、Context evidence、日志或 UI；
5. 受控 fixture 的 captured body 只能留 test evidence，必须用 canary Secret 并在四通道扫描后销毁；
6. safe error 固定映射，不包含 digest、binding ID、Zod/Jackson path、stack、raw provider body。

## 4. Activation 与生产边界

### 4.1 三态 installation gate

v1alpha3 Controller/Service 必须复用已验收的 conditional registration 模式：

| 状态 | 行为 |
| --- | --- |
| feature=false | v1alpha3 Controller/route/service bean count 全 0 |
| feature=true + graph incomplete/ambiguous/non-production dependency | HTTP ready 前 fail-fast |
| test composition + complete exact graph | v1alpha3 route 可用于受控 E2E |

完整 graph 至少包含 exact Profile source、private mapping registry、Endpoint Binding resolver、second validator、
v3 request source、Provider Adapter registry、timeout identity verifier 与 test identity/admission。禁止
`@ConditionalOnMissingBean` 用 Fake/Development fallback 补 production graph。

### 4.2 本批 production 状态

编码与 QA 完成后仍必须为：

```text
productionSubmitTurnV1Alpha3Reachable = false
productionGatewayV1Alpha3RouteCount = 0
productionEnterpriseOpenAiMaxReleaseCount = 0
productionEnterpriseAnthropicMaxReleaseCount = 0
desktopMaxUiReady = false
productionCpcActivationEnabled = false
productionEnterpriseEntitlementReady = false
```

test-only fixture 能证明映射实现正确，但不能证明某个真实企业模型支持 Max。

## 5. 错误语义

| 场景 | typed code | HTTP/运行语义 |
| --- | --- | --- |
| Core exact Profile/mapping 缺失 | `reasoning_mapping_unavailable` | Provider/Gateway 前失败 |
| Core digest/subject/timeout conflict | `reasoning_mapping_conflict` | durable prepare 前失败 |
| Central exact release 缺失 | `model_gateway.reasoning_mapping_unavailable` | 503，Central accept/upstream=0 |
| Central refs/binding/protocol/digest conflict | `model_gateway.reasoning_mapping_conflict` | 422，Central accept/upstream=0 |
| v3 malformed/unknown variant | `model_gateway.request_invalid` | 422，不 fallback v2/v1 |
| Anthropic budget >= maxOutputTokens | `model_gateway.reasoning_mapping_conflict` | body write=0 |
| production graph incomplete | startup failure | HTTP ready 前失败 |
| Provider timeout/network/protocol | 沿用既有 typed failure | 不改 support/Profile |

错误响应只返回 safe code、固定 summary、request correlation identity 与可重试性；不返回 raw mapping、exact Secret、
Endpoint、private digest chain 或 Provider response body。

## 6. 实施步骤与估算

### DFI-5.3.3.1 Gateway v1alpha3 Contract / conformance（2～3 日）

- 新增 v1alpha3 schema/OpenAPI/fixtures/canonical digest；
- strict reasoning union + mapping ref；
- cache absent/present requestDigest 唯一公式；
- Core TS/Central Java cross-language conformance；
- v1/v2 byte/digest/controller zero-drift。

### DFI-5.3.3.2 Core enterprise mapping / converter（2～3 日）

- exact subject/family/timeout resolvers；
- durable enterprise mapping-before-link；
- v1alpha2 ModelRequest -> Gateway v1alpha3 converter；
- terminal/recovery exact semantics；
- Core-side zero-effect diagnostics。

### DFI-5.3.3.3 Central registry / second validation（2～4 日）

- release-pinned private registry；
- v1alpha3 Controller/HTTP mapper/test-only composition；
- Endpoint Binding/protocol/config/registry/timeout exact validation；
- sealed provider projection；
- Central-side zero-effect diagnostics与 safe errors。

### DFI-5.3.3.4 双 Adapter / real fixture / Harness（2～3 日）

- OpenAI omission/apply；
- Anthropic omission/apply + budget/max token conflict；
- cache cross-product；
- real local HTTP/TLS/SSE body capture、Usage、private output、timeout、resource cleanup；
- focused Harness、evidence、report与全量回归。

合计 **8～13 个集中工程日**，不含独立 QA、真实企业模型准入证据与返工。四步按顺序实施但作为一个原子授权批
交付；不允许只注册 v1alpha3 route 或只装一个 Adapter 后宣称 partial ready。

## 7. 文件边界

### 7.1 获授权后允许修改

- `contracts/enterprise-gateway/v1alpha3/**`；
- `services/core/src/application/durable-enterprise-model-provider.ts`；
- `services/core/src/application/enterprise-model-request-converter.ts`；
- `services/core/src/application/**enterprise*reasoning*`、必要 private Port/registry composition；
- `services/core/tests/**dfi5.3.3*` 与既有 Enterprise focused regression；
- `services/central-service/src/main/java/**/modelgateway/**`；
- `services/central-service/src/test/**/modelgateway/**`；
- `scripts/run-dfi5.3.3-harness.mjs`、test-only fixture/evidence；
- package-local version、root harness script 与必要治理文档。

### 7.2 明确禁止

- `apps/desktop/**`、`apps/admin-console/**`；
- Local Personal production implementation（除只读历史回归）；
- public Desktop/Admin Contract；
- production SubmitTurn v1alpha3 route/IPC/Preload；
- migration、Central DB schema、新依赖、`pnpm-lock.yaml`；
- TGM、Knowledge Provider、Agent Lifecycle、production identity/SSO；
- Core Prompt/CPC、R2D 已关闭实现；
- DFI-5.3.1/5.3.2 historical evidence overwrite；
- DFI-5.3.4 lifecycle closure、DFI-5.4 UI。

## 8. Lifecycle / 并发窗口

### 8.1 L1～L10

| 窗口 | 必须证明 |
| --- | --- |
| L1 default 首次调用 | mapping/profile load 0；v3 default sidecar；body omit |
| L2 max 首次调用 | exact Profile/mapping 各 1；single Central release load |
| L3 Tool 后续轮 | 同 lock/profile/strategy/mapping，不能 current |
| L4 user continuation | 同上，且 request digest 随新消息变化 |
| L5 initial compaction | 同 lock；Summarizer 权限不扩大 |
| L6 rolling compaction | 同 lock；cache/reasoning正交 |
| L7 Core restart | historical exact refs；durable deadline不延长 |
| L8 Central restart | immutable release exact lookup；不能 alias current |
| L9 terminal replay | mapping/provider/upstream 全 0 |
| L10 response loss | 复用既有 accept/status/recovery，不重选 Model/Strategy |

### 8.2 C1～C8

| 窗口 | 必须证明 |
| --- | --- |
| C1 duplicate Core dispatch | durable claim/fencing 单 winner |
| C2 duplicate Central accept | clientRequestId/requestDigest 幂等语义不变 |
| C3 mapping registry reload | immutable entry 不原地替换 |
| C4 Profile current pointer change | historical Task 不迁移 |
| C5 Endpoint Binding current change | exact historical binding可用则执行，否则 conflict |
| C6 timeout 与 cancel | 首个 typed termination cause胜出 |
| C7 terminal 与 late callback | late body/Usage清理，不第二次投影 |
| C8 cache plan 与 mapping race | 两者都绑定同一 request material，不能跨 invocation 拼接 |

测试窗口使用 deterministic barrier，禁止 `sleep` 猜时序、自动 retry 掩盖失败或单进程 direct call 冒充真实
Gateway/HTTP 生命周期。

## 9. QA 矩阵（108 项）

> 本矩阵是 DFI-5.3.3 本批 focused acceptance；父方案 120 项继续
> `retained_for_dfi53_stage_closure`，二者必须分别留证，不得互相替代。

### 9.1 Gateway Contract / digest / dispatch（QA-001～QA-018）

1. QA-001 v3 default valid；
2. QA-002 v3 max valid；
3. QA-003 default 禁 Profile refs；
4. QA-004 default 禁 mapping refs；
5. QA-005 max Profile refs 全必填；
6. QA-006 max Strategy refs 全必填；
7. QA-007 max mapping revision/digest 全必填且相等；
8. QA-008 raw effort 禁入；
9. QA-009 raw thinking/budget 禁入；
10. QA-010 Endpoint/Credential 禁入；
11. QA-011 cache absent digest TS/Java 一致；
12. QA-012 cache present digest TS/Java 一致；
13. QA-013 cache half-present 拒绝；
14. QA-014 reasoning byte flip 改变 requestDigest；
15. QA-015 cache digest byte flip 改变 requestDigest；
16. QA-016 v1 fixtures/digest 零漂移；
17. QA-017 v2 fixtures/digest 零漂移；
18. QA-018 malformed v3 单次拒绝且不 fallback。

### 9.2 Core preflight / safe sidecar（QA-019～QA-036）

19. QA-019 default Profile load=0；
20. QA-020 default mapping load=0；
21. QA-021 unsupported fallback load=0；
22. QA-022 unknown fallback load=0；
23. QA-023 max Profile load=1；
24. QA-024 max mapping load=1；
25. QA-025 exact Model lock subject；
26. QA-026 exact Adapter descriptor subject；
27. QA-027 provider family只来自可信 descriptor；
28. QA-028 modelId/provider name不推断 family；
29. QA-029 exact timeout identity；
30. QA-030 Profile mismatch conflict；
31. QA-031 Strategy mismatch conflict；
32. QA-032 mapping missing unavailable；
33. QA-033 mapping duplicate conflict；
34. QA-034 mapping digest drift conflict；
35. QA-035 Core conflict时 durable prepare/Gateway accept=0；
36. QA-036 terminal replay mapping/profile/Gateway=0。

### 9.3 Central second validation / activation（QA-037～QA-058）

37. QA-037 feature=false v3 Controller/mapping/service=0；
38. QA-038 feature=true graph缺失 HTTP ready前失败；
39. QA-039 test complete graph 注册 exact v3 route；
40. QA-040 production non-production dependency 拒绝；
41. QA-041 exact private release single load；
42. QA-042 duplicate release startup拒绝；
43. QA-043 current/latest alias API=0；
44. QA-044 profile refs exact；
45. QA-045 strategy refs exact；
46. QA-046 mapping refs exact；
47. QA-047 model revision exact；
48. QA-048 configuration revision exact；
49. QA-049 registry generation exact；
50. QA-050 Adapter descriptor exact；
51. QA-051 Endpoint Binding protocol exact；
52. QA-052 capability profile revision exact；
53. QA-053 timeout profile identity exact；
54. QA-054 unavailable -> Central accept/credential/adapter/outbound=0；
55. QA-055 conflict -> Central accept/credential/adapter/outbound=0；
56. QA-056 Core pending link对 Central drift诚实保留并 typed failed；
57. QA-057 safe error无 raw mapping/digest/path/stack；
58. QA-058 production OpenAI/Anthropic release count=0。

### 9.4 OpenAI / Anthropic body / cache（QA-059～QA-080）

59. QA-059 OpenAI default body reasoning字段=0；
60. QA-060 OpenAI unsupported fallback reasoning字段=0；
61. QA-061 OpenAI unknown fallback reasoning字段=0；
62. QA-062 OpenAI max high exact body；
63. QA-063 OpenAI max xhigh exact body；
64. QA-064 OpenAI 不发送 low/minimal/off；
65. QA-065 OpenAI directive 不能进 Anthropic binding；
66. QA-066 Anthropic default body thinking字段=0；
67. QA-067 Anthropic unsupported fallback thinking字段=0；
68. QA-068 Anthropic unknown fallback thinking字段=0；
69. QA-069 Anthropic exact thinking budget body；
70. QA-070 Anthropic 不发送 disabled/0；
71. QA-071 budget >= maxOutputTokens body write=0；
72. QA-072 Anthropic directive 不能进 OpenAI binding；
73. QA-073 cache absent + OpenAI omit；
74. QA-074 cache present + OpenAI apply；
75. QA-075 cache absent + Anthropic omit；
76. QA-076 cache present + Anthropic apply；
77. QA-077 reasoning 不改变 cache marker；
78. QA-078 cache 不改变 reasoning directive；
79. QA-079 两 Adapter model/messages/tools/max/stream 零漂移；
80. QA-080 真实 loopback HTTP/TLS 捕获 body，不用内部 DTO 冒充。

### 9.5 Usage / timeout / lifecycle / security（QA-081～QA-096）

81. QA-081 OpenAI final Usage 正确；
82. QA-082 OpenAI usage:null 不造 0；
83. QA-083 Anthropic Usage 聚合正确；
84. QA-084 Usage 缺失沿用既有 typed语义；
85. QA-085 reasoning/thinking content不进 assistant text；
86. QA-086 thinking signature不进任何公共面；
87. QA-087 timeout数值零漂移；
88. QA-088 restart不重获 deadline；
89. QA-089 Tool 后续轮复用 exact mapping；
90. QA-090 user continuation复用 exact mapping；
91. QA-091 initial/rolling compaction复用 exact lock且不扩权；
92. QA-092 current Profile/mapping变化不迁移 historical Task；
93. QA-093 terminal replay provider/upstream/usage=0；
94. QA-094 timeout/network/protocol不改 support；
95. QA-095 raw mapping/Secret 四通道多编码扫描命中0；
96. QA-096 body/socket/timer/stream资源真实归零。

### 9.6 Boundary / stage honesty（QA-097～QA-108）

97. QA-097 public Contract raw directive命中0；
98. QA-098 Task/Message/Receipt raw directive命中0；
99. QA-099 Desktop/Admin imports命中0；
100. QA-100 production SubmitTurn v1alpha3 reachable=false；
101. QA-101 production Gateway v3 route count=0；
102. QA-102 Desktop Max UI ready=false；
103. QA-103 production Local/Enterprise release counts均0；
104. QA-104 migration max=26；
105. QA-105 lockfile digest与编码前基线一致；
106. QA-106 DFI-5.3.1/5.3.2 historical evidence只读且摘要不漂移；
107. QA-107 父方案120项状态仍 retained_for_dfi53_stage_closure；
108. QA-108 无 `.skip/.only/@Disabled/sleep/自动retry/硬编码资源0/??0` 逃逸。

## 10. 门禁

编码后至少执行：

```text
Node 24.13.0 exact / pnpm 11.11.0
focused TS Gateway schema + Core mapping tests
focused Java v3 mapper/registry/Adapter/HTTP fixture tests
cross-language canonical fixture conformance
pnpm run harness:dfi5.3.3
pnpm run harness:dfi5.3.2     # historical read-only regression
pnpm run harness:dfi5.3.1     # historical read-only regression
pnpm run harness:cpc3
pnpm run check
pnpm run check:central
pnpm run check:central:offline
pnpm run lint
pnpm run audit:dtp4
pnpm install --frozen-lockfile --offline
lockfile digest / migration max / production route count / release count scans
```

实施报告必须分别列出：

- Core mapping failure 八类零副作用计数；
- Central second validation failure 的 Central-side零副作用计数；
- default/max Profile/mapping/release load counts；
- OpenAI/Anthropic body exact captured evidence；
- cache cross-product；
- Usage、timeout、restart、terminal replay证据；
- production readiness false 状态；
- DFI-5.3.1/5.3.2 historical evidence digest；
- DFI-5.3.3 focused 108项与父方案120项 retained 状态，禁止混报。

## 11. 停手条件

发现以下任一情况必须停止编码并回文档评审：

1. 必须修改 Gateway v1alpha1/v1alpha2 才能实现 v3；
2. 必须把 raw effort/budget/thinking 放入 safe Gateway Contract；
3. 必须用 generic JSON Patch/Map 才能映射 body；
4. Core 无法从可信 exact Adapter descriptor证明 provider family；
5. Central 无法从 immutable Endpoint Binding证明 protocol/config/registry/timeout；
6. 必须按 current/latest/model name猜 mapping；
7. 必须 silent fallback default 或自动换模型；
8. Anthropic budget 只能通过扩大 maxOutputTokens 才能合法；
9. cache 与 reasoning 无法正交组合；
10. Central second validation 只能在 Credential/HTTP body之后执行；
11. 必须新增 migration、Central schema或第三方依赖；
12. 必须修改 Local Personal/DFI-5.3.1/5.3.2 historical evidence；
13. 必须暴露 private reasoning output、Secret、Endpoint或raw mapping；
14. 必须提前开放 production SubmitTurn、Gateway v3 route或Desktop Max UI；
15. 必须使用公网/真实用户 Secret/付费 Provider 才能完成验收；
16. 无法区分 Core-local conflict 与 Central-remote drift 的 durable side-effect语义；
17. v1/v2 digest、Controller、Usage、timeout或cache语义发生漂移；
18. root check失败来自并发窗口且无法安全隔离；
19. 发现未授权 Desktop/Admin/TGM/Knowledge/Agent Lifecycle代码混入；
20. production release count无法诚实保持0却又没有单独准入评审。

## 12. 当前状态与后续授权

```text
DFI-5.3                       PLAN REVIEW PASS/CLOSED
DFI-5.3.1                     PASS/CLOSED
DFI-5.3.2                     PASS/CLOSED
DFI-5.3.3                     PASS/CLOSED
DFI-5.3.4                     DOCUMENT REVIEW PASS / USER ACCEPTANCE PENDING / CODING GATED (Closure only)
DFI-5.4                       GATED
TGM / Knowledge Provider      GATED
Agent Lifecycle               GATED
Desktop/Admin v2 consumption  GATED
production SubmitTurn v1a3    UNREACHABLE / 0
production Enterprise Max     RELEASE COUNT = 0
production Local Max          RELEASE COUNT = 0
Desktop Max UI                UNREACHABLE / 0
```

DFI-5.3.3 已完成实现、独立 QA 与用户接受，正式 `PASS/CLOSED`。文档复核阶段关于 Gateway Contract 路径的
误报澄清保留为历史记录，不作为实现缺陷。DFI-5.3.4 独立文档复核已 PASS，两个 P3 文档精度项已吸收，
当前等待用户正式接受且未获单独编码授权；
DFI-5.4 与全部下游继续 GATED。

## 13. 独立评审问题

1. 是否接受 DFI-5.3.3 同时完成 Enterprise OpenAI-compatible 与 Anthropic-compatible，5.3.4 只做 Closure；
2. 是否接受 v3 safe sidecar 为 max 增加 content-free mappingRevision/mappingDigest，不增加 raw参数；
3. 是否接受 v3 requestDigest包含完整 reasoning-aware modelRequest与可选 cacheContextDigest；
4. 是否接受 Core/ Central 分别以 Adapter descriptor与 Endpoint Binding独立证明 provider family；
5. 是否接受 Core conflict与 Central remote drift使用不同的 durable side-effect零计数口径；
6. 是否接受 Central private registry无 current/latest/fallback，production release count=0；
7. 是否接受 OpenAI只支持 sealed high/xhigh、Anthropic只支持 sealed bounded budget；
8. 是否接受 Anthropic budget必须严格小于 maxOutputTokens，冲突时不自动放大；
9. 是否接受 cache 与 reasoning四组合正交、v1/v2零漂移；
10. 是否接受 production v3 route/SubmitTurn/Desktop UI继续0/不可达；
11. 是否接受本批108项 focused矩阵与父方案120项分别留证；
12. 是否接受8～13个集中工程日估算与四步原子交付。

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
CODING AUTHORIZATION = COMPLETED / CLOSED
```
