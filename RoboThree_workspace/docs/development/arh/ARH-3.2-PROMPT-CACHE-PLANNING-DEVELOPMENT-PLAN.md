# RoboThree ARH-3.2 Prompt Cache Planning 与双协议 Projection 详细实施方案

## 1. 文档状态

```text
状态：CONFIRMED REVISION 1 / PASS/CLOSED
日期：2026-08-14
前置：ARH-3.0、ARH-3.1 PASS/CLOSED
ARH-3.2.1：PASS/CLOSED
ARH-3.2.2：PASS/CLOSED
ARH-3.2.3：PASS/CLOSED
ARH-3.3：GATED
```

本文件是 ARH-3.2 的字段级、事务级和批次级实施方案。首轮已由 Claude Code、MiniMax 完成评审；
Revision 1 已由 Claude Code 完成差异复核，结论为 `PASS（P0～P3=0）`；用户已正式关闭计划评审、
确认本方案并单独授权 ARH-3.2.1。3.2.1 已通过开发者门禁与 Claude Code 独立 QA，用户已正式
接受并关闭；ARH-3.2.2 Revision 1 已通过差异复核、实现、独立 QA 与用户接受并正式关闭；
3.2.3 Revision 1 已通过差异复核、实现、独立 QA 与用户接受；ARH-3.2 三个批次全部正式关闭。
ARH-3.3 继续 `GATED`。

### 1.1 ARH-3.2.2 Revision 1 补充收口

ARH-3.2.2 首稿把安全隔离 scope、静态来源版本与实际静态内容混在同一个 digest 语义中，可能
错误阻止同一 Session 合法切换机器人、技能或工具。Revision 1 冻结四层身份：

```text
cacheScopeIdDigest
staticSourceLockDigest
staticPrefixDigest
cacheKeyDigest
```

合法的 Agent/Skill/Tool revision 变化只改变 source lock/key，旧 Plan 不变；只有相同
scope/source/execution/Profile identity 生成不同实际前缀时才失败关闭。`deviceId/clientInstanceId`
继续作为授权与审计锚点，不进入 cache key；不同设备 Core 的本地 HMAC namespace 保证 opaque
Session proof 不会跨设备偶合。3.2.2 QA 由 28 项提高到 44 项，ARH-3.2 总门禁由 70 项提高到
86 项。本次仍为 docs-only。

### 1.2 ARH-3.2 Revision 1 差异收口

首轮文档评审结论为 `PASS（P0=0 / P1=0 / P2=0 / P3=2）`。Revision 1 只关闭两项 P3，
不扩大实现范围：

1. 将 `sessionScopeDigest` 与 `cacheScopeIdDigest` 的关系冻结为显式派生公式；后者必须同时绑定
   Central 已验证的企业/user claims、Credential namespace、exact Session、Model/Binding/
   Adapter/Protocol revision 和 Cache Profile，不允许把前者直接改名后当作 Cache Scope；
2. 冻结 namespace `retired` 的生命周期：只停止生成新 scope，不删除旧 key，不阻断已持久
   invocation context 的精确恢复；Alpha 不建设自动 rotation、GC 或 Provider cache invalidation。

MiniMax 的补充意见已完成边界分流：Foundation 保留 exact Session scope、Provider-side cache、
misconfiguration fail-closed 和默认关闭的 Profile；不引入跨 Session sharing、不把 cache hit 解释为
零 Provider 调用、不以本地摘要静默替代错误 Profile，也不把 UI、PRD 或五类性能场景纳入本批门禁。

## 2. 目标与最终结果

ARH-3.2 只建设**企业模型路径的安全 Prompt Cache 规划底座**：Local Core 使用 exact Session
生成不透明 scope，Central 在已验证企业身份、精确 Binding、能力画像和静态前缀基础上生成
可恢复的 `PromptCachePlan`，最后由 Anthropic-compatible / OpenAI-compatible Adapter 按明确
能力投影 Provider 私有字段。

目标闭环：

```text
Task 已锁定 Agent / Model / Tool / Registry
→ Core 从 exact Session 生成 opaque sessionScopeDigest
→ Enterprise Gateway v1alpha2 strict accept
→ Central 验证身份、请求、Binding 与 PromptCacheProfile
→ 计算 Compatibility Fingerprint 与 Static Prefix Digest
→ dispatch 前持久化 immutable PromptCachePlan
→ Adapter 按计划投影，或明确 cache disabled
→ ARH-3.1 记录 Provider 实际报告的 cache Usage
→ crash/retry/takeover 重用同一 Plan，不静默换 key/profile
```

Cache 只是传输/Provider 优化，不改变 Context Budget、模型选择、授权、Prompt 正文、Task 状态、
Tool 语义、主 request digest 或 Provider Usage 的原始含义。

## 3. 当前代码事实

### 3.1 已存在且必须复用

1. `ModelProviderInvocation` 已包含 Core-private `sessionId`，并区分 `assistant_message` 与
   `compaction_summary`；本批**不再新增 sessionId**，只生成并持久化安全 scope digest；
2. `EnterpriseModelRequestConverter` 生成严格 `v1alpha1` accept document，`requestDigest` 当前
   只覆盖 `modelRequest + admission + timeoutPolicy`；
3. `HttpEnterpriseModelGatewayClient` 与 Central Controller/Filter 当前固定使用
   `/v1alpha1/model-invocations`；
4. Gateway `v1alpha1` Model Invocation Schema 与 Java Mapper 均为 strict，accept 顶层只有 9 个
   字段；未知字段失败关闭；
5. Provider-neutral request 已明确 system/user/assistant/tool message、Tool schema 和精确 Model/
   Configuration/Registry revision；
6. Context Pipeline 已区分 static/dynamic segment，Context Assembler 和 Tool projection 已提供稳定
   排序；
7. `ModelEndpointBinding` 已锁定 Binding、Model、Configuration、Registry、Credential、
   `capabilityProfileRevision`、timeout 与 recovery mode；Runtime Handle、Token 不进入 Contract；
8. Central 已有 durable accept、dispatch、lease/fencing、status-first recovery、双 JVM Conformance；
9. ARH-3.1 已提供 `ProviderUsageFact`、cache read/write breakdown 与 authority-scoped attempt
   去重；
10. Core SQLite migration 20 与 Central PostgreSQL v0008 是当前最新事实，旧 migration/script
    不得改写。

### 3.2 真实缺口

1. Core 尚无稳定 `sessionScopeDigest`、scope namespace revision 和 invocation-side cache context；
2. Gateway v1alpha1 无 `cacheContext`，Central 不能从 Task/Run/clientRequestId 猜测 Session；
3. accept 幂等只比较 semantic `requestDigest`，无法拒绝同一 clientRequestId 的 cache scope 漂移；
4. Central 没有版本化 `PromptCacheProfile`、穷尽 Compatibility Fingerprint 或 immutable
   `PromptCachePlan`；
5. dispatch/recovery 只锁 Binding decision，未锁 cache mode/profile/static prefix/key；
6. Anthropic Adapter 未投影 explicit cache marker；OpenAI-compatible Adapter 未区分 Provider
   automatic observation 与显式 `prompt_cache_key`；
7. 尚无跨重启、双 JVM、跨 Session 和 Provider request-body 的统一 Conformance。

### 3.3 纠正旧计划中的过时描述

ARH-3 Revision 3 §3.2/§4.10 曾写“`ModelProviderInvocation` 当前没有 sessionId”。该描述已经
过时：当前代码已有 `sessionId`。ARH-3.2 不为同一事实重复建模，只在 private Adapter/Application
层补 scope digest、Contract sidecar、持久 Cache Context/Plan 和 Provider projection。

## 4. 冻结边界与不变量

### 4.1 执行权威

```text
CacheExecutionAuthority
├── central_enterprise  // 本批唯一生产实现
└── local_personal      // 本批仅 Core-private Port/Fake/Conformance
```

企业路径由 Central 规划并投影；个人模型未来由 Local Core/个人 Adapter 规划。两者共享 scope、
fingerprint、monotonicity 与 evidence 语义，但不共享 Credential、事实表、key namespace 或事务。

### 4.2 exact Session scope

Alpha 的主动 Cache 复用必须同时满足：

```text
同 authority
AND 同 enterprise/user scope
AND 同 Credential namespace
AND 同 exact Session scope
AND 同 Model/Binding/Adapter/Protocol exact revision
AND 同 staticPrefixDigest
AND 同 compatibilityFingerprintDigest
```

同一 Session 的不同 Turn 可以复用；不同 Session 即使属于同一用户且静态内容完全相同，也必须
生成不同的 RoboThree cache key。不同企业、用户、Credential、Binding、revision 必须不同。

### 4.3 三类身份分离

| 身份 | 用途 | 生命周期 | 禁止 |
| --- | --- | --- | --- |
| `sessionScopeDigest` | Core 向 Central 证明 exact Session scope | Session | 不等于 cache key，不含原始 Session ID |
| `cacheScopeIdDigest` | Central 绑定 verified claims、Session 与 exact execution lock | Plan scope | 不等于 Session proof，不含 transport identity |
| `staticPrefixDigest` | 证明本次静态 Provider 前缀 | exact locked prefix | 不含动态 Conversation/Result/Summary |
| `cacheKeyDigest` | Provider 可显式接受时的 bounded opaque key | scope + prefix + profile | 不作为 requestId/clientRequestId |
| transport `requestId` | 单次网络尝试 | attempt | 不参与稳定 cache identity |

### 4.4 semantic-neutral

- 公共 `ModelRequest` 不变；
- v1alpha1 `requestDigest` 公式不变；v1alpha2 semantic `requestDigest` 仍只覆盖
  `modelRequest + admission + timeoutPolicy`；
- `cacheContextDigest` 单独参与 accept 幂等冲突，不混入 semantic request digest；
- cache hit/miss/expiry/unsupported 不改变 Model、Binding、Prompt、Tool schema 或 Task 事实；
- Provider 确定性拒绝 cache 投影时返回既有 typed Provider failure，不静默删除字段后重试；
- cache 不缩小 Token Budget，不放宽确认、权限、Workspace 或数据外发边界。

## 5. Core Session Scope 与本地持久化

### 5.1 SessionScopeDigestProvider

新增 Core-private Port：

```text
SessionScopeDigestProvider
└── resolve({ authority, sessionId })
    → scopeNamespaceRevision
    → sessionScopeDigest
```

实现规则：

1. 首次使用时生成 256-bit 本地随机 namespace key；
2. 使用 length-bound canonical material 与 HMAC-SHA-256 派生 digest；
3. namespace key 只保存在 Core SQLite，不发送 Central、不进入日志/Evidence；
4. 它不是 Model Credential，也不进入 `EnterpriseCredentialStore`；它的目的只是避免向 Central
   发送原始 Session ID；Core 数据库本身已经持有 Session 事实，本批不宣称它可抵御本地数据库
   完整泄漏；
5. Alpha 不自动轮换。未来轮换只影响新 invocation；已准备 invocation 必须继续使用已持久化
   context，不重新派生；
6. key 丢失或记录 digest 漂移时失败关闭，不使用裸 sessionId 降级。
7. 同一 authority 同一时刻只能有一个 `active` namespace；新 context 只能读取该 active revision；
8. `retired` 只表示“禁止生成新 context”，不表示 key 已删除、Provider cache 已失效或旧事实不可读；
9. 已持久 context 必须按自身 `scopeNamespaceRevision` 读取 active 或 retired namespace，禁止在重启
   时替换为当前 active revision；
10. Alpha 不自动删除 namespace row/key。历史 revision 缺失、key 不可解析或 record digest 漂移时
    失败关闭；未来 rotation/GC 必须另立 ADR、引用计数和迁移门禁。

### 5.2 Core SQLite migration 21

新增私有 forward-only migration 21，migrations 1～20 不改写：

```text
prompt_cache_scope_namespaces
  namespace_revision PK
  cache_execution_authority
  namespace_key
  status                 // active | retired
  created_at
  UNIQUE(cache_execution_authority) WHERE status = 'active'

model_invocation_cache_contexts
  invocation_kind       // assistant_message | compaction_summary
  invocation_link_id
  cache_execution_authority
  session_scope_digest
  scope_namespace_revision
  cache_context_digest
  gateway_contract_version
  record_digest
  created_at
  UNIQUE(invocation_kind, invocation_link_id)
```

禁止保存：原始 Session ID 副本、Prompt、Output、Tool Result、Endpoint、Credential、Token、Provider
request body 或 cache contents。

### 5.3 本地写入/恢复顺序

Core 当前 main/compaction link 已有稳定 invocation link ID。ARH-3.2 不伪造跨表原子：

```text
prepare durable invocation link
→ ensure immutable cache-context record
→ build v1alpha2 accept document
→ Gateway accept
```

- link 后、context 前 crash：按同一 Session 与 namespace deterministic re-prepare；
- context 后、accept 前 crash：读取同一 context，不生成新 scope；
- 同 link + 同 digest 幂等；同 link + 不同 digest typed conflict；
- accept 后重启：只读取已持久 context，禁止按当前 active namespace 重算；
- v1alpha1 path 不创建 active cache context，明确 `cache disabled`。

## 6. Enterprise Gateway v1alpha2

### 6.1 版本策略

v1alpha1 文件、Fixture、digest 与路由保持不变。新增 v1alpha2 Model Invocation 子协议，语义差异
只在 accept 增加 Cache sidecar；为避免一次 invocation 混用响应版本，v1alpha2 同时提供 accept、
status、cancel、events 四条 Model 路由，响应/Event 的 `contractVersion` 全程保持 v1alpha2。

Core 不自动探测、也不在失败后静默降级：

- 已验证兼容能力包含 `enterprise_model_prompt_cache_v1alpha2` 才构造 v1alpha2 operation；
- 不支持该 feature 时继续使用 v1alpha1，模型调用正常但 RoboThree 主动 cache disabled；
- invocation link/cache context 锁定 `gatewayContractVersion`，重启不得换版本；
- v1alpha2 status/cancel/events 不新增 cache 业务字段，只有 wire version 随 operation 一致。

### 6.2 最小 Cache sidecar

v1alpha2 accept 只新增：

```text
cacheContext
└── sessionScopeDigest  // 64 lowercase hex

cacheContextDigest      // SHA-256(canonical cacheContext)
```

不得包含 sessionId、Task/Run、enterpriseId/userId、Credential namespace、Model 名称、Prompt、
Endpoint 或 Provider key。Central 从已验证 Token claims 获取企业/user/device/client identity，从
locked Binding 获取 Credential namespace 和 revision。

### 6.3 Digest 与幂等

- semantic `requestDigest` 保持原公式；
- 相同 client request + 相同 requestDigest + 相同 cacheContextDigest：幂等；
- requestDigest 或 cacheContextDigest 任一不同：复用
  `model_gateway.client_request_conflict`，旧 invocation/cache context 不变；
- cacheContext 自身 digest 不匹配、缺失、未知字段或格式非法：strict reject；
- v1alpha1 accept 不允许 sidecar；v1alpha2 accept 必须有 sidecar，不使用 optional/猜测语义。

### 6.4 跨语言 Conformance

新增语言中立 Schema、OpenAPI、valid/invalid/conformance Fixture 和 canonical digest；TypeScript
与 Java 独立实现，同一 Fixture 通过。至少覆盖：

- v1alpha2 四路由与 compatibility feature；
- valid assistant/compaction accept；
- missing/extra/raw session/scope format/digest mismatch；
- same request replay 与 request/cache-context conflict；
- v1alpha1 文件逐字节/digest 未改写；
- Bearer Filter 与 thin Controller 同时覆盖 v1alpha1/v1alpha2，不在 Controller 写业务逻辑。

## 7. Compatibility Fingerprint 与静态前缀

### 7.1 Provider-neutral 字段穷尽分类

`PromptCacheCompatibilityClassifier` 必须枚举当前 provider-neutral request 全部字段：

| 字段 | 分类 |
| --- | --- |
| exact model/configuration/registry revision | `affects_cache` |
| leading system messages 的 source revision/digest/content | `affects_cache` |
| Tool definitions、schema digest、稳定顺序 | `affects_cache` |
| user/assistant/tool messages | `dynamic_excluded` |
| snapshotId、contextSourceDigest | `dynamic_excluded` |
| maxOutputTokens | `does_not_affect_cache` |

Adapter projection 的 route family、upstream model、protocol、cache mode/profile revision、marker/key
位置同样属于 `affects_cache`。新增字段未归类时默认 `cache disabled until reviewed`，不能沿用旧 key。

### 7.2 静态前缀

`StaticPromptPrefixProjector` 必须消费**实际发送 Central/Provider 的 canonical projection**，不得从
另一套 prompt 逻辑猜测：

1. system message 必须形成 leading contiguous prefix；system 插入动态消息之后则 cache disabled；
2. Tool schema 使用现有 deterministic order，并进入 static digest；
3. Conversation、Compaction Summary、Knowledge result、Workspace preview、Tool Result 全部动态；
4. `staticPrefixDigest` 绑定完整 canonical static material，不保存正文；
5. 没有可缓存静态前缀时正常执行但 `eligible=false/no_static_prefix`。

### 7.3 Static Prefix Monotonicity

Monotonicity 使用 `cacheScopeIdDigest + staticSourceLockDigest + exact Binding/Profile +
compatibility/cache policy identity` 比较，而不是只按 Session scope 比较：

- dynamic messages 增长不改变 staticPrefixDigest；
- Agent/Skill/Tool revision 合法变化生成新 `staticSourceLockDigest/cacheKeyDigest`，旧 Plan 不变；
- Model/Binding/Profile/Compatibility/Policy 合法变化生成新 key/Plan，不要求改写 Session scope；
- 相同比较身份生成不同 `staticPrefixDigest` 才属于 drift，必须失败关闭；
- 相同 `cacheKeyDigest` 却出现不同 staticPrefixDigest，返回
  `model_gateway.cache_static_prefix_drift` 并停止 Provider 调用；
- 新 Task/新 Session/新 revision 可创建新计划，不修改旧计划；同一 Session 可持有多个 immutable
  Plan；
- Central 按完整 monotonicity identity 查询最近 immutable Plan；不得使用只按 scope 查询或 JVM 内
  Map 作为事实。

## 8. PromptCacheProfile 与 Planner

### 8.1 版本化 Profile

新增 Central-private `PromptCacheProfile`，由版本化 Seed/Registry 提供，不进入 Admin UI：

```text
profileId
profileRevision
profileDigest
protocol
connectionModes[]
projectionMode
routeFamily
isolationAssurance
retentionAssurance
markerPolicy
maxCacheKeyBytes?
```

`capabilityProfileRevision` 必须解析到 exact Profile：

- Profile 显式 `disabled`：模型调用正常、cache disabled；
- Binding 声明某 revision 但 Registry 缺失/digest 不符：Binding unavailable，失败关闭；
- Relay 未声明 exact route/field/isolation：不发送 cache 字段；
- disabled 与 misconfigured 必须区分，避免把配置错误伪装成正常 cache miss；
- Profile 不含 Endpoint、Credential 明文或 Runtime Handle。

### 8.2 ProjectionMode

首期穷尽：

```text
disabled
anthropic_explicit
openai_provider_automatic_observed
openai_prompt_cache_key
```

`openai_provider_automatic_observed` 只表示 Provider 可能自行缓存且 ARH-3.1 可记录其 Usage；
RoboThree 不发送 key，也不宣称 exact Session physical isolation，因此它不算主动复用计划。

### 8.3 逻辑隔离与物理隔离

RoboThree 的 `cacheKeyDigest` 只能证明本地逻辑身份。Provider 若不接受显式 key，仅靠正文缓存，
RoboThree 无法凭空证明 exact Session 物理隔离：

- Anthropic explicit marker 只有在 Profile 证明 upstream/Relay 能以 per-session Credential namespace
  或等价机制隔离时才 eligible；共享 Credential 的标准内容寻址缓存默认 disabled；
- OpenAI `prompt_cache_key` 只有 exact route/profile 明确支持时启用；
- Provider automatic 只观察 Usage，不作为“Session 隔离缓存已启用”的证据；
- 不能通过向 system prompt 注入 Session marker 来伪造隔离，因为这会改变模型可见语义。

### 8.4 deterministic PromptCachePlan

Plan 至少包含：

```text
invocationId
cacheExecutionAuthority
cacheContextDigest
cacheScopeIdDigest
staticSourceLockDigest
staticPrefixDigest
compatibilityFingerprintDigest
cacheKeyDigest?
cachePolicyRevision
profileId / profileRevision / profileDigest
bindingRevision / bindingDigest
providerProjectionMode
eligible
skipReason?
planDigest
createdAt
```

正常 skip reason 穷尽：

```text
gateway_v1alpha1
profile_disabled
provider_automatic_observed_only
relay_capability_undeclared
isolation_unproven
retention_unapproved
no_static_prefix
unclassified_request_field
```

Profile drift、context conflict、prefix drift 是 typed error，不降级成 skip。

### 8.5 Cache Scope 显式派生

`sessionScopeDigest` 只是 Core 提供的 exact Session opaque proof；`cacheScopeIdDigest` 只表示
Central 验证后的 Session 安全隔离边界。静态来源版本、实际内容与最终执行 key 必须分离：

```text
CacheScopeDerivationMaterial
├── schemaVersion
├── cacheExecutionAuthority
├── verifiedEnterpriseScopeDigest
├── verifiedUserScopeDigest
├── credentialNamespaceDigest
└── sessionScopeDigest

cacheScopeIdDigest = SHA-256(canonical(CacheScopeDerivationMaterial))

staticSourceLockDigest = SHA-256(canonical({
  platformPromptId / revision,
  agentId / revision,
  selectedSkillIds / revisions,
  allowedToolCapabilityIds / revisions
}))

staticPrefixDigest = SHA-256(canonical(actualStaticProviderNeutralPrefix))

cacheKeyDigest = SHA-256(canonical({
  cacheScopeIdDigest,
  staticSourceLockDigest,
  staticPrefixDigest,
  compatibilityFingerprintDigest,
  modelId / modelRevision,
  configurationRevision / runtimeRegistryGeneration,
  bindingId / bindingRevision / bindingDigest,
  adapterProtocol / connectionMode,
  profileId,
  profileRevision,
  profileDigest,
  cachePolicyRevision
}))
```

约束：

1. `verifiedEnterpriseScopeDigest` / `verifiedUserScopeDigest` 只能从 Central 已验证 Access Token claims
   派生，不能信任请求正文自报 identity；
2. derivation material 不含 raw enterprise/user/session ID、Endpoint、Credential、Token、PID、端口或
   transport requestId；
3. 企业/user/Credential/Session 变化必须改变 scope；Agent/Skill/Tool source revision 变化必须改变
   source lock/key；Model/Binding/Adapter/Protocol/Profile 变化必须改变 key，不要求改变 scope；
4. transport retry/takeover 只更换 requestId/fencing owner，不改变已持久 Plan 的四个 digest；
5. canonical 字段遗漏、未知字段、Binding/Profile digest 漂移必须失败关闭，不以
   `sessionScopeDigest` 单字段回退；
6. `deviceId/clientInstanceId` 是 Token/Device Trust/Audit 事实，不进入 key；不同设备 Core 使用不同
   HMAC namespace，所以不含 raw device ID 不代表跨设备共享。

## 9. Central PostgreSQL v0009 与事务

### 9.1 Schema

新增整体 v0009，B0009/U0009/manifest/SHA-256 sidecar；v0001～v0008 字节不改写：

```text
model_invocation_cache_context
  invocation_id PK/FK
  cache_context_digest
  session_scope_digest
  gateway_contract_version
  record_digest
  created_at

model_invocation_cache_plan
  invocation_id PK/FK
  cache_execution_authority
  cache_scope_id_digest
  static_source_lock_digest
  static_prefix_digest
  compatibility_fingerprint_digest
  cache_key_digest NULL
  cache_policy_revision
  profile_id / revision / digest
  binding_revision / digest
  projection_mode
  eligible / skip_reason
  plan_digest
  created_at
```

只存 digest、revision、enum 和时间，不存 Prompt、Output、Tool 参数/结果、Provider body、Endpoint、
Credential、Token、raw Session ID 或 cache content。InMemory/MyBatis 运行同一 Conformance，SQL
显式且无 `${}`/Wrapper；不引入 Flyway。

### 9.2 Transaction A：accept

同一 Central 事务提交：

```text
Invocation accepted
+ immutable CacheContext
+ accepted durable Event
+ Audit Outbox
```

v1alpha1 新 invocation 可不建 CacheContext，并被明确解释为 cache disabled；升级前 legacy row 也
保持 disabled。v1alpha2 缺 Context row 是 schema/invariant failure。

### 9.3 Transaction B：dispatch

在 Provider 调用之前，同一事务：

```text
resolve exact Binding/Profile
→ derive/validate immutable PromptCachePlan
→ register Provider attempt/lease facts
→ accepted → running
→ persist Binding dispatchDecision + PromptCachePlan
→ append dispatch_decided Event + Audit Outbox
```

现有 `ModelDispatchDecision` 继续只表示可恢复 Binding identity，避免破坏
`resolveDispatchDecision()`；`PromptCachePlan.planDigest` 是独立、同事务的 dispatch evidence。
Runtime 只有在两者都成功后才能调用 Backend。公共 durable Event 不增加正文或 cache 私有字段。

### 9.4 recovery

- running recovery 先读取 Binding decision 与 immutable Plan；
- exact Profile revision/digest 不可重建时失败关闭，不切换 mode/key/Binding；
- takeover owner 复用相同 cache key/plan digest，但 transport requestId 和 fencing epoch 按既有
  规则更新；
- plan 已提交、Provider 前 crash：恢复同一 Plan；
- Provider 已开始但响应丢失：沿用既有 RecoveryMode/status-first，不因 cache 重发改变语义；
- terminal 后 Plan 只读；重放不得新增第二 Plan。

## 10. Provider Adapter Projection

### 10.1 Anthropic-compatible

- `eligible && mode=anthropic_explicit` 才添加 `cache_control`；
- cache disabled 时保持现有 request body 字节/shape 回归，不为“支持缓存”重排动态正文；
- enabled 时 system content 使用受控 block projection，breakpoint 只放在 Profile 允许的最后一个
  static system block/Tool definition；不得标记 user、assistant、Tool Result、Summary；
- Profile 必须声明 exact marker position、TTL/retention 与 physical isolation assurance；
- Adapter 不生成 Plan、不访问 Repository，只消费 typed Plan 并返回 typed Provider Result；
- ARH-3.1 Usage 继续按 Anthropic uncached + cache-read + cache-write 语义记录。

### 10.2 OpenAI-compatible

- `openai_provider_automatic_observed` 不添加字段，只记录 Provider 明确返回的 cache breakdown；
- `openai_prompt_cache_key` 只在 exact route/profile 允许时添加 bounded opaque key；
- direct Provider 与 custom Relay 分别配置，不能因为协议同为 OpenAI-compatible 就继承能力；
- key 不含业务名称、企业/user/session 明文；
- cache disabled 时现有 Chat Completions request body 不变；
- ARH-3.1 继续把 cached tokens 视为 input tokens 子集，不重复相加。

### 10.3 Controlled Provider

ARH-3.2 Foundation 使用进程外受控 Provider/Relay 证明 request body、marker/key、Usage、取消、
deadline 与 crash recovery。真实 OpenAI/Anthropic/企业 Relay 的 cache hit、计费、retention 与 SLA
继续 `RESOURCE_GATED`，不作为 ARH-3.2 Foundation 关闭门槛。

## 11. 分批实施

### 11.1 ARH-3.2.1：Contract 与 Session Scope Foundation

交付：

1. v1alpha2 Model Invocation/Compatibility Schema、OpenAPI、Fixture、TS/Java Conformance；
2. v1alpha1 字节/digest Guard；
3. Core-private SessionScopeDigestProvider、InMemory/SQLite、migration 21；
4. main/compaction invocation cache-context preparation 与 crash/replay；
5. Gateway client version-locked operation；
6. 尚不建立 Central Cache Plan，不投影 Provider cache 字段。

退出：专项、Workspace、Central online/offline、SQLite close/reopen 与独立 QA 全部 PASS，用户关闭
3.2.1 后才可评审/授权 3.2.2。

### 11.2 ARH-3.2.2：Durable Planner、Profile 与 v0009

字段、事务、恢复窗口与 40 项 QA 见
[ARH-3.2.2 Durable Cache Planner Detailed Plan](./ARH-3.2.2-DURABLE-CACHE-PLANNER-DEVELOPMENT-PLAN.md)。

交付：

1. Compatibility Classifier、Static Prefix Projector、Profile Resolver、deterministic Planner；
2. Central v0009 CacheContext/Plan + InMemory/MyBatis Conformance；
3. accept/dispatch 两个事务与 idempotency/conflict；
4. Static Prefix Monotonicity；
5. 双 JVM lease/takeover/recovery 与 exact Profile rebuild；
6. Provider Backend 仍可使用受控无-cache stub，不进入真实协议字段投影。

退出：Fresh/upgrade/legacy bridge、双 JVM、故障矩阵、完整门禁和独立 QA PASS，用户关闭 3.2.2
后才可评审/授权 3.2.3。

### 11.3 ARH-3.2.3：双协议 Projection Closure

交付：

1. Anthropic explicit 与 OpenAI automatic-observed/explicit-key Adapter projection；
2. 进程外 Controlled Provider request-body Conformance；
3. ARH-3.1 Usage breakdown 集成；
4. cancel/deadline/recovery/profile drift/unsupported Relay；
5. 四通道泄漏与资源归零；
6. `local_personal` 仅 Port/Fake/Conformance，不接真实个人模型。

退出：3.2.1/3.2.2 全量回归、受控双协议、完整 Workspace/Central、独立 QA 与用户现场接受后，
ARH-3.2 才可整体关闭。ARH-3.3 不自动解锁。

## 12. 命名故障与恢复矩阵

| 窗口 | 崩溃位置 | 恢复结果 |
| --- | --- | --- |
| C1 | link 后、Core cache context 前 | deterministic re-prepare，同 scope |
| C2 | Core context 后、Gateway accept 前 | 读取同一 context，不生成新 digest |
| C3 | Central Invocation 前/CacheContext 中途 | Transaction A 整体回滚 |
| C4 | Central accept commit 后响应丢失 | same request/context 幂等返回 |
| C5 | Planner 计算后、Transaction B 前 | 无 running/Plan，重算结果 digest 必须相同 |
| C6 | Plan/dispatch transaction 中途 | 整体回滚，无 Provider 调用 |
| C7 | Plan/dispatch commit 后、Provider 前 | takeover 重用同一 Plan/key |
| C8 | Provider accept 后、首 delta 前 | 既有 status-first RecoveryMode；Plan 不变 |
| C9 | Provider output started 后断线 | 既有 uncertain/resume 语义；不盲目换无-cache 调用 |
| C10 | terminal/Usage transaction 前后 | ARH-3.1 winner/fencing/dedupe 不变 |

所有窗口必须使用真实 SQLite/PostgreSQL close/reopen 或双 JVM 进程级故障；仅 throw 不代替命名
crash evidence。

## 13. QA 验收矩阵

### 13.1 ARH-3.2.1（至少 24 项）

1. v1alpha2 accept/status/cancel/events strict Schema；
2. v1alpha2 compatibility feature；
3. TS/Java valid Fixture；
4. missing/unknown cacheContext reject；
5. raw session/user/enterprise 字段 reject；
6. sessionScopeDigest 格式；
7. cacheContextDigest 自校验；
8. same request/context replay；
9. requestDigest conflict；
10. cacheContextDigest conflict；
11. v1alpha1 sidecar reject；
12. v1alpha1 文件/digest byte guard；
13. Core namespace 首次生成与 reopen；
14. same Session digest 稳定；
15. different Session digest 不同；
16. main/compaction context 一致语义；
17. same link idempotent/different digest conflict；
18. C1/C2 crash recovery；
19. raw session/key 不进日志/Evidence；
20. 无 Planner/Provider projection 超前；
21. 同一 authority 只允许一个 active namespace；
22. retired namespace 不得生成新 context；
23. 已持久 context 可按 retired revision 在 close/reopen 后精确恢复；
24. historical namespace 缺失/漂移失败关闭，且无自动删除、rotation 或 GC。

### 13.2 ARH-3.2.2（至少 44 项）

1. Profile strict/digest/revision；
2. disabled 与 misconfigured 分离；
3. Relay capability default disabled；
4. provider-neutral 字段穷尽；
5. 新字段 unclassified disabled；
6. leading static prefix；
7. dynamic Conversation 排除；
8. Tool Result/Summary/Knowledge/Workspace 排除；
9. Tool schema stable order；
10. same Session/different Turn 四个稳定 digest 不变；
11. same user/different Session scope/key 不同；
12. cross-user/enterprise/Credential scope 不同；
13. `sessionScopeDigest` 不得直接等于或替代 `cacheScopeIdDigest`；
14. transport requestId/lease/fencing 不改变四个稳定 digest；
15. 合法切换 Agent revision → 新 source lock/key、旧 Plan 不变；
16. 合法切换 Skill revision → 新 source lock/key、旧 Plan 不变；
17. 合法切换 Tool revision/schema → 新 source lock/key、旧 Plan 不变；
18. Model/Binding/Profile revision 变化改变 key，不要求改变 scope；
19. 相同 scope/source/execution/Profile identity 的 prefix drift typed failure；
20. 相同 key 对应不同 canonical static content 失败关闭；
21. 不同设备 HMAC namespace 不共享 scope/key，且 raw deviceId 不进入 key；
22. Profile 只有 explicit active exact revision 才可 eligible；
23. v0009 Fresh；
24. v0008→v0009 upgrade；
25. legacy bridge；
26. v0001～v0008 byte/digest guard；
27. InMemory/MyBatis parity；
28. CacheContext same digest replay/different digest conflict；
29. Plan same digest replay/different digest conflict；
30. accept Transaction A rollback；
31. accept Transaction A commit-response-loss replay；
32. dispatch Transaction B rollback 且 Provider count=0；
33. Transaction B expected fencing/status CAS；
34. canonical request 只存在 transient source；
35. 无 Prompt/Output/Endpoint/Credential/cache content 持久化；
36. C5 相同 plan digest；
37. C6 rollback 无 running/Plan/Provider；
38. C7 takeover 复用同一 Plan/key/dispatch；
39. 双 JVM concurrent dispatch 单 owner；
40. stale fencing 不覆盖 Plan/terminal/Usage winner；
41. v1alpha2 activation fail-closed；
42. v1alpha1 no-cache 路径不受影响；
43. Provider request body 不增加缓存字段；
44. Provider cache hit/节省 Token 不由 Plan 推断，且无 3.2.3/3.3/个人模型/UI 超前。

### 13.3 ARH-3.2.3（至少 18 项）

1. Anthropic disabled body unchanged；
2. Anthropic explicit system marker；
3. Anthropic Tool marker；
4. Anthropic dynamic block 无 marker；
5. Anthropic isolation unproven disabled；
6. OpenAI automatic-observed 无新字段；
7. OpenAI explicit key exact route；
8. custom Relay undeclared 不发送 key；
9. direct/relay profile 不串用；
10. Provider request semantic content 等价；
11. cache miss/hit/expired 不改 Task 语义；
12. Provider deterministic reject 不静默无-cache retry；
13. cache Usage breakdown 进入 ARH-3.1 Fact；
14. unknown Usage 不伪造 0；
15. cancel/deadline；
16. C8/C9/C10 recovery；
17. 四通道 canary 泄漏 0、资源归零；
18. 个人模型/真实 Credential/Desktop/ARH-3.3 无超前。

独立 QA 必须串行实际重跑各批 Harness、完整 Workspace、Central online/offline；历史报告或 digest
不能代替执行。

## 14. Evidence 安全格式

只允许：

```text
scenarioId / status / duration
contractVersion / projectionMode / eligible / skipReason
sessionCount / invocationCount / planCount / usageFactCount
scope/source-lock/static/fingerprint/key/plan digest
cache token numeric breakdown
resource metrics / typed error code
```

禁止：Session ID、企业/user ID、Prompt、用户/Assistant 正文、Tool 参数/Result、Summary、Skill/
Knowledge/Workspace 内容、Provider body、API Key、Credential、Access Token、Endpoint、完整路径、
PID、端口或 cache contents。

## 15. 非目标与 PRD 依赖

本阶段不实现：

- 真实个人 Model Provider、个人 Credential Store 或个人 Usage 权威表；
- Redis/自建缓存、缓存正文、跨 Session/用户/企业共享；
- Provider Cache Admin UI、用户开关、成本报表、费用/账单；
- 新 Provider、新模型路由、智能 fallback、Binding 切换；
- Prompt/Tool 并行、Subagent、多 Agent、长期 Memory；
- 修改 Kernel reducer、Task 状态、Context Budget、ADR-017 Effect；
- 真实 Provider cache hit/retention/计费/SLA 声明。

ARH-3.2 不依赖 PRD/UX，因为没有用户页面或交互；若未来增加可见开关、统计、费用或 Admin 配置，
必须先有 PRD/Feature Spec。

### 15.1 上游借鉴与登记纪律

- **Codex**：只借鉴 exact Session cache identity、transport identity 分离和请求字段兼容性穷尽
  比较；不照搬进程内 client/session state 或跨 Session sharing；
- **OpenAI / Anthropic 官方协议**：只决定 Provider Adapter 的字段投影和 Usage 解释，不能覆盖
  RoboThree 的权限、Binding lock、durable recovery 与隔离边界；
- **RoboThree 自有基线**：复用 ARH-1 Stream Validator、ARH-2 static/dynamic Context、CGF-2
  durable invocation/lease/fencing 和 ARH-3.1 Usage Fact；
- 采用 `DESIGN_ONLY + OWN_CACHE_CONTEXT + OWN_CACHE_PLANNER + OWN_PROVIDER_PROJECTION +
  OWN_PERSISTENCE + OWN_CONFORMANCE`，不复制第三方源码、DTO、SQL、Prompt、Fixture 或 SDK；
- 本轮只是 proposed plan，不预先占用 Upstream Adoption Register 编号。代码批次真正采用后，再用
  当时下一个可用 AR 编号登记并补真实测试证据。

## 16. 工期

| 批次 | 集中工程工作量 |
| --- | --- |
| ARH-3.2.1 | 4～6 工程工作日 |
| ARH-3.2.2 | 5～8 工程工作日 |
| ARH-3.2.3 | 3～5 工程工作日 |
| ARH-3.2 合计 | **12～19 工程工作日** |

此前父计划对 ARH-3.2 的 4～7 天估算偏低。当前代码事实证明本批包含跨语言 v1alpha2、Core
migration 21、Central v0009、双 JVM recovery 和双 Provider projection，不能把它当成“给请求
加一个 cache key”。ARH-3 整体工程量相应调整为约 20～31 工程工作日；不含独立 QA、真实
Provider/企业 Relay 资源等待和返工。这是工程工作量，不是日历承诺。

## 17. 文档评审重点

ARH-3.2 父计划首轮评审已完成；本次只请 Claude Code 对 ARH-3.2.2 Revision 1 及其向上同步内容
按 P0/P1/P2/P3 做差异复核：

1. 当前代码事实是否准确，尤其 `ModelProviderInvocation` 已有 sessionId；
2. exact Session scope、HMAC namespace key 与本地威胁边界是否合理；
3. v1alpha2 是否应保持四条 Model 路由 wire-consistent，而不是只升级 accept；
4. v1alpha2 只新增 cacheContext/cacheContextDigest 是否仍属最小 Contract 差异；
5. semantic requestDigest 与 cacheContextDigest 分离是否正确；
6. migration 21 和 v0009 是否必要且最小；
7. Core 两步 prepare 是否诚实处理 crash，而非假装跨表原子；
8. accept/dispatch 两个 Central 事务是否完整；
9. Binding decision 与 Cache Plan digest 分离是否保持现有 recovery resolver；
10. compatibility classifier 是否穷尽实际请求字段；
11. static prefix 是否消费实际 wire projection并排除所有动态内容；
12. Profile missing/misconfigured/disabled/unsupported 是否正确区分；
13. Anthropic 无 explicit key 时的物理隔离限制是否足够保守；
14. OpenAI automatic-observed 是否避免虚假 Session 隔离声明；
15. 3.2.1/3.2.2/3.2.3 拆分、QA 与 12～19 天是否可执行；
16. 是否出现 P0/P1 或需要用户重新确认的公共范围变化；
17. §8.5 是否把 scope/source lock/prefix/key 四层公式真正分开，而非只新增字段名；
18. `retired` 是否只停止新 scope、仍支持旧 context 精确恢复，并明确 Alpha 不自动删除/轮换；
19. 合法切换 Agent/Skill/Tool 是否总是新 source lock/key、旧 Plan 不变；
20. deviceId/Device Trust 审计锚点与 per-device HMAC namespace 是否同时成立；
21. Provider-side hit 仍调用 Provider、Usage 不由 Plan 估算是否保持 ARH-3.1 权威；
22. 44 项 QA 是否足以关闭本次 P2/P3，且未改变 3.2.1/3.2.2/3.2.3 的授权边界。

## 18. 当前门禁

```text
ARH-3.1：PASS/CLOSED
ARH-3.2 plan Revision 1：PASS/CLOSED / CONFIRMED
ARH-3.2.1：PASS/CLOSED
ARH-3.2.2 detailed plan Revision 1：PASS/CLOSED
ARH-3.2.2 coding：PASS/CLOSED
ARH-3.2.3 detailed plan Revision 1：PASS/CLOSED
ARH-3.2.3 coding：PASS/CLOSED
ARH-3.3：GATED
```

ARH-3.2.1、ARH-3.2.2、ARH-3.2.3 均已通过独立 QA 并由用户正式关闭，ARH-3.2 整体关闭。
`CTR-P3-001` 独立跟踪且不自动进入 ARH-3.3；ARH-3.3 不自动解锁。
