# RoboThree ARH-3.2.2 Durable Cache Planner、Profile 与 v0009 详细实施方案

## 1. 文档状态

```text
状态：CONFIRMED REVISION 1 / PASS/CLOSED
日期：2026-08-14
前置：ARH-3.0、ARH-3.1、ARH-3.2.1 PASS/CLOSED
ARH-3.2.2：PASS/CLOSED
ARH-3.2.3：PASS/CLOSED
ARH-3.3：GATED
```

本文件细化并约束已经确认的 ARH-3.2.2 范围，不重新开放 ARH-3 架构。Revision 1 已通过差异
复核并由用户明确授权；PostgreSQL v0009、v1alpha2 生产 Bean 与 Durable Prompt Cache Planner
现已完成实现、开发者门禁、Claude Code 独立 QA 与用户接受并正式关闭。Provider cache 字段
投影已由 ARH-3.2.3 实现，并通过独立 QA 与用户接受正式关闭。

### 1.1 Revision 1 修订摘要

首轮评审为 `PASS（P0=0 / P1=0 / P2=0 / P3=1）`。技术负责人随后独立复核发现一个真实 P2：
原稿把 Session/安全隔离、静态来源版本和实际静态内容混入同一个 scope/monotonicity 语义，可能
错误阻止同一 Session 合法切换机器人、技能或工具。Revision 1 关闭该 P2 与评审 P3：

1. 冻结 `cacheScopeIdDigest / staticSourceLockDigest / staticPrefixDigest / cacheKeyDigest` 四层分离；
2. 合法的 Agent/Skill/Tool revision 变化生成新 source lock 与新 key，旧 Plan 保持不可变；
3. 相同 source lock 与相同 exact execution/profile identity 却生成不同 static prefix 时失败关闭；
4. 明确 `deviceId/clientInstanceId` 是授权与审计事实，不是 cache key 材料；设备信任由 Token/
   Device Trust 层保证；不同设备 Core 的本地 HMAC namespace 不同，因此“不含 deviceId”不等于
   跨设备共享；
5. 明确 Profile 默认不启用，只有 exact active Profile 才能生成 eligible Plan；关闭 Cache 使用
   新不可变 Profile revision 与受控滚动部署，不建设 Admin 动态开关；
6. 明确 Provider-side cache hit 仍会调用 Provider，成本事实只取 ARH-3.1 Provider Usage，不在
   Plan 中伪造“节省 Token”估算；
7. QA 从至少 40 项提高到至少 44 项；本轮仍为 docs-only，不自动进入编码。

## 2. 阶段目标

ARH-3.2.2 将 ARH-3.2.1 已冻结的 exact Session cache context 接入 Central 的持久、确定性
Cache Planning 链路：

```text
v1alpha2 accept + verified claims
→ Transaction A 持久 CacheContext
→ exact Binding / Profile resolve
→ Compatibility Classification
→ Static Prefix Projection
→ deterministic PromptCachePlan
→ Transaction B 持久 Plan + dispatch decision
→ commit 后调用受控 no-cache Backend
```

本阶段证明“同一 exact Session 与同一执行锁可以稳定生成并恢复同一个 Cache Plan”。它不证明
Provider 已接收缓存字段、不证明 cache hit、费用下降、retention 或 SLA。真实双协议字段投影属于
ARH-3.2.3。

## 3. 当前代码事实

### 3.1 已有事实

1. Enterprise Gateway Model Invocation `v1alpha2` 已冻结四条 wire-consistent 路由；accept 只新增
   `sessionScopeDigest + cacheContextDigest`；v1alpha1 保持不变；
2. Core migration 21 已持久化 HMAC namespace 与 invocation-side cache context，C1/C2 恢复已通过
   独立 QA；
3. Central `ModelInvocationV1Alpha2GatewayService` 目前只是 typed activation seam，没有生产 Bean；
4. `ModelInvocationRuntime.accept()` 目前只按 semantic `requestDigest` 做幂等，尚未持久
   CacheContext；
5. `ModelInvocationRuntime.dispatchAndExecute()` 已拥有 lease/fencing、exact Binding resolve、
   durable dispatch decision 和 commit-after-dispatch 语义；
6. `ModelInvocationHttpMapper` 对 provider-neutral request 做 strict 校验，当前穷尽字段为：Model
   lock、system/user/assistant/tool message、Tool schema 与 `maxOutputTokens`；
7. Provider request 正文只保存在 `TransientModelProviderRequestSource`，不得进入 PostgreSQL；
8. Central 当前 Schema 为 v0008，生产 Persistence 为 MyBatis-Plus + 显式 Mapper XML；SQL 通过
   baseline/upgrade/manifest 管理，不使用 Flyway；
9. `ModelEndpointBinding` 已锁定 connection mode、protocol、credential revision、capability
   profile revision、timeout profile 与 recovery mode；
10. ARH-3.1 已持久化 authority-scoped Provider Usage Fact；本批不得改写其 terminal、fencing 或
    usage dedupe 语义。

### 3.2 待关闭缺口

1. v1alpha2 没有生产 Application Service，CacheContext 不能进入 Central durable runtime；
2. 没有 immutable CacheContext/PromptCachePlan 表、Repository 与 InMemory/MyBatis Conformance；
3. 没有 versioned Cache Profile、Resolver、Compatibility Classifier、Static Prefix Projector 与
   deterministic Planner；
4. `sessionScopeDigest` 尚未与 verified enterprise/user claims、Credential namespace 共同派生
   `cacheScopeIdDigest`，静态来源锁、实际前缀和 exact execution/Profile 也尚未按四层身份分离；
5. accept 与 dispatch 尚未分别把 CacheContext 和 Cache Plan 纳入原子事务；
6. 重启或双 JVM takeover 尚不能读取相同 Plan 并精确重建 Profile；
7. 没有 Static Prefix Monotonicity 护栏；
8. 当前 Backend request 没有只读 Plan 接缝，但本批也不能提前投影真实 Provider 缓存字段。

## 4. 冻结边界与核心不变量

1. `sessionScopeDigest` 只是 Core 生成的 exact Session opaque proof，不是最终 cache key；
2. `cacheScopeIdDigest`、`staticSourceLockDigest`、`staticPrefixDigest`、`cacheKeyDigest` 与
   transport request identity 严格分离；
3. 只有 leading static system prefix 与稳定 Tool schema 可参与静态前缀；Conversation、Compaction
   Summary、Knowledge、Workspace、Tool Result 均为动态内容；
4. Cache 只优化 Provider 请求，不改变 Model 选择、权限、Task 状态、Context Budget、Prompt 语义、
   ARH-3.1 Usage 原值或恢复策略；
5. 新增 provider-neutral 字段若未被 Compatibility Classifier 穷尽分类，必须
   `cache_disabled_until_reviewed`，模型调用仍可按既有 no-cache 路径执行；
6. Profile disabled 是受控 no-cache；Profile missing、digest/revision 漂移或结构非法是 typed
   fail-closed，二者不得混同；
7. Cache Plan 必须在 Provider 调用前持久化；Backend 不能直接写 Repository、Event 或 terminal；
8. 同一 invocation 只允许一个 immutable CacheContext 和一个 immutable Plan；同 digest 重放幂等，
   不同 digest 冲突；
9. Transport requestId、lease owner、fencing epoch、PID、端口与墙钟不得进入稳定 cache key；
   Transaction B 必须以 expected fencing epoch/CAS 固定 Plan 与 dispatch，但 fencing epoch 本身
   不进入四个稳定 digest；
10. Prompt、Output、Tool Result、Endpoint、Credential、Token、Provider request body 与 cache content
    不得进入 v0009、日志、Trace、Audit 或 Evidence；
11. 本批不修改公共 `ModelRequest`、Kernel reducer、Task 状态、Core migration 21、Gateway
    v1alpha1/v1alpha2 Schema 或 ARH-3.1 v0008；
12. “Plan eligible”只表示满足规划条件，不表示 Provider 字段已投影或 cache hit 已发生；
13. Provider-side cache hit 仍然发生 Provider invocation；命中、cache-read token 与实际费用事实
    只来自 ARH-3.1 的协议验证 Usage，不从 Plan 或本地 Token estimate 推断；
14. 设备/客户端隔离由 Access Token、Device Trust 和 invocation audit 保证，不由 cache key 兜底。

## 5. 领域对象与 Port

### 5.1 PromptCacheProfile

首期 Profile 是 Central 内部、不可变、版本化 Seed，不建设 Admin UI 或数据库可编辑 Profile：

```text
PromptCacheProfile
├── profileId
├── profileRevision
├── profileDigest
├── status                    // active | retired | disabled
├── protocol                  // anthropic_compatible | openai_compatible
├── connectionModes[]         // direct_provider | custom_relay
├── providerProjectionMode    // anthropic_explicit |
│                             // openai_provider_automatic_observed |
│                             // openai_prompt_cache_key
├── routeFamily
├── isolationAssurance
├── retentionAssurance
├── markerPolicyRevision
└── maxCacheKeyBytes?
```

规则：

- 新 Plan 只能使用 `active` Profile；
- `disabled` 产生 bounded skip，不生成 active cache key；
- `retired` 不生成新 Plan，但已持久 Plan 可以按 exact revision 恢复；
- 旧 Profile revision 必须保留到所有引用 Plan 不再需要；本阶段不建设 rotation、GC 或自动删除；
- Profile 与 Binding 的 protocol、connection mode、capabilityProfileRevision 必须精确一致；
- missing、digest mismatch、unknown enum 或多 Profile 匹配均失败关闭，不自动换 Profile。

Port：

```text
PromptCacheProfileResolver
├── resolveForNewPlan(exactBinding) → active profile | disabled decision | typed failure
└── resolveForRecovery(profileId, revision, digest) → active/retired exact profile | typed failure
```

### 5.2 Compatibility Fingerprint

`PromptCacheCompatibilityClassifier` 是纯 Application/Domain 组件，输入 strict
provider-neutral request 的结构清单与 exact Profile，输出：

```text
compatible
incompatible_but_no_cache_safe
cache_disabled_until_reviewed
```

Classifier 必须显式穷尽：

- Model lock 字段；
- 每一种 message role 及其字段；
- content part 类型；
- Tool schema 字段；
- `maxOutputTokens`；
- 当前 canonical request format revision。

输出包含 `compatibilityFingerprintDigest`。新增字段、未知 role/content type 或字段分类缺失时，
不得猜测兼容；只禁用 Cache，不应把本来合法的 no-cache Model invocation 误判为 Task failure。

### 5.3 StaticPromptPrefixProjector

Projector 只消费已经 strict 校验的 canonical provider-neutral request，返回 digest/metadata，不返回
第二份可持久 Prompt：

```text
StaticPrefixProjection
├── staticSourceLockDigest
├── staticPrefixDigest
├── systemSourceCount
├── toolSchemaCount
├── canonicalProjectionRevision
└── hasEligiblePrefix
```

静态输入：

- 从首条开始连续出现的 Platform/Agent/selected Skill system instruction；
- exact locked Tool schema，按稳定 canonical 顺序排序。

`staticSourceLockDigest` 只由**版本身份**派生：Platform Prompt ID/revision、Agent ID/revision、
selected Skill ID/revision 与 Tool capability ID/revision 的稳定有序集合。它不包含静态正文、
`sourceDigest`、Tool `inputSchemaDigest`、Profile、Binding 或 transport identity。这样相同版本锁却
生成不同内容时，可以由 `staticPrefixDigest` 漂移单独证明，而不会被“新的 source lock”掩盖。

`staticPrefixDigest` 由实际 canonical static material 派生，包含 system content 与 Tool schema 的
真实规范化内容，但只持久化 digest，不保存正文。

动态排除：

- user/assistant/tool message；
- Compaction Summary；
- Knowledge/Workspace 注入；
- Tool Result 与确认文本；
- Task/Run/round、requestId、transport metadata。

Projector 不复制 ContextBuilder 的业务选择逻辑；它只对最终 strict provider-neutral projection 做
字段分类和 digest。若 static segment 出现在 dynamic segment 之后，不重新拼接为“伪前缀”。

### 5.4 四层身份与 PromptCacheScopeDeriver

四层身份必须分别派生：

```text
cacheScopeIdDigest = SHA-256(canonical({
  schemaVersion,
  cacheExecutionAuthority: central_enterprise,
  verifiedEnterpriseScopeDigest,
  verifiedUserScopeDigest,
  credentialNamespaceDigest,
  credentialRevision,
  sessionScopeDigest
}))

staticSourceLockDigest = SHA-256(canonical({
  staticSourceLockSchemaVersion,
  platformPromptId,
  platformPromptRevision,
  agentId,
  agentRevision,
  selectedSkills: sorted([{ skillId, skillRevision }]),
  allowedTools: sorted([{ capabilityId, capabilityRevision }])
}))

staticPrefixDigest = SHA-256(canonical(actualStaticProviderNeutralPrefix))

cacheKeyDigest = SHA-256(canonical({
  cacheScopeIdDigest,
  staticSourceLockDigest,
  staticPrefixDigest,
  compatibilityFingerprintDigest,
  modelId,
  modelRevision,
  configurationRevision,
  runtimeRegistryGeneration,
  bindingId,
  bindingRevision,
  bindingDigest,
  adapterProtocol,
  connectionMode,
  profileId,
  profileRevision,
  profileDigest,
  cachePolicyRevision
}))
```

职责：

| Digest | 证明内容 | 合法变化 |
| --- | --- | --- |
| `cacheScopeIdDigest` | 企业/user/Credential/exact Session 安全隔离范围 | Session 或安全身份变化 |
| `staticSourceLockDigest` | Platform/Agent/Skill/Tool 精确版本锁 | 合法切换机器人、技能、工具版本 |
| `staticPrefixDigest` | 实际规范化静态内容 | 只有 source lock 或 projection identity 合法变化时允许 |
| `cacheKeyDigest` | scope + source lock + prefix + compatibility + exact execution/Profile | 任一组成事实合法变化 |

`deviceId`、`clientInstanceId` 仍是既有 Invocation 的授权与 Audit 锚点，但不进入 cache key：

1. Device Trust 由 Central Token issuance 与每次企业调用的有效 Access Token 保证；
2. `clientInstanceId` 是短生命周期实例身份，不能承担 Session cache identity；
3. 不同设备/安装的 Local Core 使用不同本地 HMAC namespace，即使 raw Session 文本偶合，
   `sessionScopeDigest` 也不同，因此“不含 deviceId”**不等于跨设备共享**；
4. Evidence 只记录 `deviceTrustVerified`、authorization context digest 或 typed denial，不记录 raw
   device/client ID；
5. 编码时不得静默把 device/client 字段加入 key；未来若要跨设备同步 Session/cache，必须另立
   Contract、密钥迁移和安全评审。

### 5.5 Deterministic PromptCachePlanner

Planner 是无 I/O 的纯组件：

```text
plan(
  verifiedSubjectScope,
  exactBinding,
  exactProfile,
  cacheContext,
  compatibilityFingerprint,
  staticPrefixProjection,
  cachePolicyRevision
) → PromptCachePlan
```

Plan 至少包含：

```text
cacheExecutionAuthority
cacheScopeIdDigest
staticSourceLockDigest
staticPrefixDigest
compatibilityFingerprintDigest
cacheKeyDigest?
cachePolicyRevision
bindingRevision / bindingDigest
profileId / profileRevision / profileDigest
providerProjectionMode
eligible
skipReason?
planDigest
```

Planner 只在 exact active Profile 明确启用时生成 `eligible=true`。没有显式启用的 Profile、未知
Relay 或未完成 Compatibility 分类一律保持 no-cache；不得因 v1alpha2 可用就默认开启。

Profile 运营关闭采用新的不可变 Profile revision + 受控双 JVM 滚动部署；旧 Plan 仍按旧 revision
恢复。本阶段不建设 Admin 动态开关，也不要求每一次内容不变的状态切换都新建 ADR；只有改变
冻结语义或安全边界时才需要 ADR 修订。

`cacheKeyDigest` 只在 explicit-key 模式且隔离证明成立时生成；Anthropic explicit marker 不伪造一个
Provider 不支持的 external key；OpenAI automatic-observed 记录 projection mode，但本批不把它
宣称为 RoboThree 主动隔离的可复用 key。

稳定 skip reason 穷尽为：

```text
profile_disabled
provider_automatic_observed
no_static_prefix
unsupported_connection_mode
isolation_unproven
compatibility_unreviewed
```

Profile misconfigured、exact revision missing、digest drift 与 same-scope prefix drift 不属于 skip，
必须 typed fail-closed。

## 6. PostgreSQL v0009 与持久化

### 6.1 最小两表模型

`model_invocation_cache_context`：

```text
invocation_id PK/FK
cache_execution_authority      // central_enterprise
gateway_contract_version       // v1alpha2
session_scope_digest
cache_context_digest
context_record_digest
created_at
```

`model_invocation_prompt_cache_plan`：

```text
invocation_id PK/FK
cache_context_digest
cache_scope_id_digest
static_source_lock_digest
static_prefix_digest
compatibility_fingerprint_digest
cache_key_digest nullable
cache_policy_revision
binding_revision
binding_digest
profile_id
profile_revision
profile_digest
provider_projection_mode
eligible
skip_reason nullable
plan_digest
created_at
```

不新增可变累计表、Cache 内容表、Profile CRUD 表或第二份 Prompt。verified subject、Model lock 与
Invocation identity 继续以既有 `model_invocation` 为权威；Plan 只物化恢复需要的精确 cache 决策。

### 6.2 Repository

新增 Central-private Port：

```text
ModelInvocationCacheContextRepository
├── findByInvocationId
└── insertImmutable

PromptCachePlanRepository
├── findByInvocationId
├── findLatestByMonotonicityIdentity
└── insertImmutable
```

`findLatestByMonotonicityIdentity` 使用显式 tuple 查询：

```text
cacheScopeIdDigest
+ staticSourceLockDigest
+ exact Binding revision/digest
+ exact Profile revision/digest
+ compatibilityFingerprintDigest
+ cachePolicyRevision
+ providerProjectionMode
```

同一 Session scope 可以合法存在多个 source lock 和多个 immutable Plan；Repository 不得把
`cacheScopeIdDigest` 误当成唯一静态内容身份。

InMemory 与 MyBatis 必须通过同一 Conformance；MyBatis 只使用显式 SQL、参数绑定、`FOR UPDATE`、
唯一约束和受控枚举，不使用 `${}`、Wrapper、`.last()` 或 SQL 参数日志。

### 6.3 SQL 治理

计划文件：

```text
deploy/sql/postgresql/baseline/B0009__prompt_cache_planning.sql
deploy/sql/postgresql/upgrade/U0009__prompt_cache_planning_from_v0008.sql
deploy/sql/postgresql/manifest/postgresql-v0009.json
deploy/sql/postgresql/manifest/postgresql-v0009.json.sha256
```

- v0001～v0008 与既有 sidecar 字节不改写；
- Fresh、v0008 upgrade、legacy bridge 三条路径结构等价；
- 执行任何 SQL 前先校验 manifest/script digest 与当前 Schema；
- Preflight 增加表、列、约束、索引与 manifest 版本探针；
- 空业务表可以 readiness ready，结构或 digest 漂移必须失败关闭；
- 生产代码不得引入 Flyway、JdbcTemplate 或自动 migration。

## 7. 两个原子事务

### 7.1 Transaction A：accept + CacheContext

v1alpha2 Application Service 先完成 Bearer authorization、strict sidecar 校验、admission 与 selection
校验，然后在同一 PostgreSQL 事务写入：

```text
ModelInvocation(accepted)
+ immutable CacheContext
+ accepted durable Event
+ Audit Outbox
```

幂等键继续是 verified subject scope + `clientRequestId`，但 replay 必须同时比较：

```text
semantic requestDigest
cacheContextDigest
gateway contract version
```

三者相同返回既有 invocation；任一不同返回既有
`model_gateway.client_request_conflict`，不得覆盖旧事实。Transaction A 任一点失败整笔回滚；commit
后响应丢失可按同一 request/context 重放。canonical Provider request 继续进入 transient source，
不写 PostgreSQL。

### 7.2 Transaction B：Plan + dispatch

持 lease 的唯一 owner 在事务外准备纯计算输入，在事务内重新锁定并验证 Invocation/lease/fencing、
exact Binding 与实时 disabled/revoked/credential/health 收窄条件，然后原子写入：

```text
immutable PromptCachePlan
+ existing ModelDispatchDecision
+ running durable Event
+ Audit Outbox
+ lease/fencing state
```

事务 commit 后才调用 Backend。Transaction B 必须以 expected fencing epoch/status revision 做 CAS，
把 Plan、dispatch decision、running Event、Outbox 与 lease/fencing 事实锁定在同一次 accepted owner
提交中；fencing epoch 只证明写入所有权，不进入稳定 digest。Transaction B 中途失败不得调用
Provider；commit 后响应或进程丢失，新 owner 必须读取同一 Plan、同一 dispatch decision 和同一
Provider attempt identity，不重新生成不同 key。Backend 只获得只读
`PromptCacheExecutionContext`，不能写 Plan/Repository/terminal。

## 8. Static Prefix Monotonicity

Monotonicity 比较身份是：

```text
cacheScopeIdDigest
+ staticSourceLockDigest
+ exact Binding revision/digest
+ exact Profile revision/digest
+ compatibilityFingerprintDigest
+ cachePolicyRevision
+ providerProjectionMode
```

冻结规则：

- 没有相同比较身份的历史 Plan：允许创建新 immutable Plan；
- 比较身份相同且 `staticPrefixDigest/cacheKeyDigest/planDigest` 相同：允许幂等重放；
- 比较身份相同但实际 canonical static prefix 产生不同 `staticPrefixDigest`：返回
  `model_gateway.cache_static_prefix_drift`，禁止 Provider 调用和原地改写；
- 同一 Session 合法切换 Agent/Skill/Tool revision：`cacheScopeIdDigest` 保持不变，
  `staticSourceLockDigest` 与 `cacheKeyDigest` 必须变化，旧 Plan 保持不可变；
- Model/Binding/Profile 或 Compatibility/Policy identity 合法变化：scope 仍可保持不变，但必须产生
  新 `cacheKeyDigest` 和新 Plan；不得覆盖旧 Plan；
- dynamic Conversation 增长、transport requestId、lease owner、fencing epoch 变化不得改变
  scope、source lock、prefix 或 key；
- 相同 `cacheKeyDigest` 对应不同 canonical static content，无论查询路径如何，都必须
  `model_gateway.cache_plan_conflict` 或 `cache_static_prefix_drift` 失败关闭。

这条护栏只禁止“相同 source/execution identity 产生不同静态内容”，不把 Session 固化为唯一
机器人、技能或工具组合。它同时保证合法演进产生新 key、旧 Plan 可恢复且不会被新配置覆盖。

## 9. v1alpha2 生产激活边界

ARH-3.2.2 可新增 `ModelInvocationV1Alpha2GatewayService` 的生产实现和 Bean，但只有在以下条件全部
成立时才允许 Controller 激活：

```text
v0009 preflight PASS
AND CacheContext Repository 唯一实现
AND PromptCachePlan Repository 唯一实现
AND exact Profile Registry 可用
AND Compatibility Classifier/Planner 可用
AND existing v1alpha1 Runtime dependencies ready
```

缺失或歧义必须 readiness fail-closed，不允许 v1alpha2 静默回落到 request-digest-only runtime。
v1alpha1 路径继续正常 no-cache 执行，不创建 CacheContext/Plan。

## 10. Profile 恢复与双 JVM

1. 新 Plan 只解析 active exact Profile；
2. 已持久 Plan 恢复时允许读取 active 或 retired 的同 revision Profile；
3. Profile Registry 必须保留不可变历史 revision；missing/digest mismatch 失败关闭，不换 Profile；
4. Plan 已物化执行语义，但仍需 Profile Resolver 校验该 revision 是可信、已登记的版本；
5. 双 JVM 共享 PostgreSQL，不能依赖进程内 Planner cache、static registry 单例状态或本地 wall clock；
6. 一个 owner 失效后，另一个 owner 通过数据库 lease/fencing 接管；stale owner 不能覆盖 Plan、
   terminal 或 ARH-3.1 Usage winner；
7. Profile retired 不阻断已有 Plan 恢复，但禁止为新 invocation 创建该 Profile 的 Plan；
8. 本批不实现 Profile rotation/GC、Admin 编辑、动态热加载或跨节点配置推送。

## 11. 命名故障窗口

| 窗口 | 故障位置 | 必须收敛结果 |
| --- | --- | --- |
| C3 | Invocation/CacheContext Transaction A 中途 | 整体回滚，无半条 CacheContext |
| C4 | Transaction A commit 后响应丢失 | same request/context 幂等返回同 invocation |
| C5 | Planner 计算完成、Transaction B 前 | 无 running/Plan；恢复重算同 plan digest |
| C6 | Plan/dispatch Transaction B 中途 | 整体回滚，无 Provider 调用 |
| C7 | Transaction B commit 后、Provider 前 | takeover 读取同一 Plan/key/Binding decision |

命名窗口使用真实 PostgreSQL、独立 JVM/进程和受控 barrier；仅 `throw` 不替代进程崩溃证据。

## 12. Provider Backend 边界

ARH-3.2.2 只使用受控 no-cache Stub/Backend：

- 可以接收并断言 immutable `PromptCacheExecutionContext`；
- Anthropic/OpenAI 请求正文必须与 ARH-3.2.1/CGF-2B 基线逐字段相同；
- 不发送 `cache_control`、`prompt_cache_key` 或 Relay 私有字段；
- 不宣称 cache eligible 等于 cache applied/hit；
- Provider Usage 继续按 ARH-3.1 记录，但本批不要求 cache breakdown；
- 双协议 Projection、受控 Provider 字段验证与 cache Usage 集成只在 ARH-3.2.3 实现。

## 13. Typed 结果与错误

计划阶段使用 bounded skip reason；错误至少包括：

```text
model_gateway.cache_profile_missing
model_gateway.cache_profile_invalid
model_gateway.cache_plan_conflict
model_gateway.cache_static_prefix_drift
model_gateway.cache_plan_unavailable
model_gateway.client_request_conflict       // 复用 request/context 冲突
```

错误继续通过既有 strict Error Envelope 返回；不向响应暴露 Session、企业/user、Credential、
Endpoint、Prompt、Profile 内部配置或 Provider body。Compatibility unreviewed 是 no-cache skip，不是
调用失败；精确锁与持久事实漂移才是 fail-closed error。

## 14. 实施步骤

### Step 1：纯领域与 Planner

- PromptCacheProfile/Registry/Resolver；
- Compatibility Classifier；
- Static Prefix Projector；
- Scope Deriver 与 deterministic Planner；
- digest、monotonicity、skip/failure 单元矩阵。

退出：纯组件无 Spring/MyBatis/HTTP/Provider import，字段穷尽 Guard 与 1-token 级边界无关但
canonical/digest 矩阵全绿。

### Step 2：v0009 与事务接入

- SQL baseline/upgrade/manifest/preflight；
- InMemory/MyBatis Repository Conformance；
- v1alpha2 Application Service 生产实现；
- Transaction A/B、activation dependency manifest、readiness；
- 受控 no-cache Backend 的只读 Plan 接缝。

退出：Fresh/upgrade/bridge、回滚、幂等/conflict 与无正文持久化扫描全绿。

### Step 3：双 JVM Recovery Closure

- C3～C7 故障注入；
- concurrent accept/dispatch、lease takeover、stale fencing；
- active/retired Profile 精确恢复；
- 资源归零、四通道泄漏、完整 Central online/offline 与 Workspace 回归。

退出：独立 QA 实际重跑全部门禁、无 P0/P1，用户接受后才关闭 ARH-3.2.2。

## 15. QA 验收矩阵（至少 44 项）

### 15.1 Profile / Compatibility（1～10）

1. Profile strict、digest 与 immutable revision；
2. active/retired/disabled 语义；
3. missing、misconfigured 与 disabled 分离；
4. direct/custom Relay capability 不串用；
5. provider-neutral 字段穷尽；
6. 新字段 unclassified → cache disabled until reviewed；
7. known incompatible → no-cache safe；
8. Profile protocol/connection mode/binding revision 精确匹配；
9. retired 不建新 Plan、可恢复旧 Plan；
10. Profile 历史 revision 缺失/digest drift 失败关闭。

### 15.2 Static / Scope / Monotonicity（11～26）

11. leading static system prefix；
12. dynamic Conversation 排除；
13. Tool Result/Summary/Knowledge/Workspace 排除；
14. Tool schema canonical stable order；
15. static 出现在 dynamic 后不被重新拼成前缀；
16. same Session/different Turn scope/key 稳定；
17. same user/different Session scope/key 不同；
18. enterprise/user/Credential/Session 任一变化改变 scope；exact execution/Profile 变化改变 key，
    不要求改变 scope；
19. `sessionScopeDigest` 不能直接替代 `cacheScopeIdDigest`；
20. transport requestId/lease/fencing 不改变四个稳定 digest；
21. 同一 Session 合法切换 Agent revision → 新 source lock/key，旧 Plan 不变；
22. 同一 Session 合法切换 Skill revision → 新 source lock/key，旧 Plan 不变；
23. 同一 Session 合法切换 Tool revision/schema → 新 source lock/key，旧 Plan 不变；
24. 相同 scope/source/execution/Profile identity 却产生不同 prefix → typed drift failure；
25. 相同 cache key 对应不同 canonical static content → conflict/fail-closed；
26. 不同设备 Core namespace 导致 Session proof 不同；key 不含 raw deviceId 也不能跨设备共享。

### 15.3 Persistence / Transactions（27～38）

27. v0009 Fresh；
28. v0008→v0009 upgrade；
29. legacy bridge；
30. v0001～v0008 byte/digest Guard；
31. InMemory/MyBatis 同一 Conformance；
32. CacheContext same digest 幂等/different digest conflict；
33. Plan same digest 幂等/different digest conflict；
34. Transaction A 全链原子回滚；
35. Transaction A commit-response-loss replay；
36. Transaction B 全链原子回滚且 Provider 调用计数为 0；
37. canonical request 仍只存在 transient source；
38. Prompt/Output/Endpoint/Credential/cache content 数据库与日志扫描 0。

### 15.4 Recovery / Architecture（39～44）

39. C5 重算得到相同 plan digest；
40. C6 rollback 无 running/Plan/Provider；
41. C7 takeover 使用同一 Plan/key/dispatch decision；
42. 双 JVM concurrent dispatch 只有一个有效 owner，stale fencing 不覆盖；
43. v1alpha2 只有 exact active Profile 才可 eligible，activation fail-closed，v1alpha1 no-cache 不受影响；
44. Provider request body未增加缓存字段；Provider hit/节省 Token 不由 Plan 推断；
    ARH-3.2.3/3.3/个人模型/UI 无超前。

独立 QA 必须串行实际执行专项 Harness、完整 Workspace、Central online/offline 与真实 PostgreSQL
双 JVM Harness；历史报告、开发者 digest 或单元测试推断不能替代重跑。

## 16. Evidence 安全格式

只允许：

```text
scenarioId / status / duration / typed error code
contractVersion / profile revision / projectionMode / eligible / skipReason
contextCount / planCount / invocationCount / providerCallCount
scope/source-lock/static/fingerprint/key/plan digest
lease/fencing/resource metrics
```

禁止：Session ID、企业/user/device/client 明文、Prompt、消息正文、Tool 参数/Result、Summary、Skill/
Knowledge/Workspace 内容、Provider request/response body、API Key、Credential、Endpoint、Token、完整
本地路径、PID、端口或 cache content。

## 17. 非目标与 PRD 依赖

本批不实现：

- Anthropic `cache_control`、OpenAI `prompt_cache_key` 或真实 cache hit；
- 真实 Provider/企业 Relay cache retention、计费、性能或 SLA 声明；
- 个人 Model Provider、个人 Credential Store 或本地个人 Cache Planner；
- Profile Admin CRUD、数据库可编辑 Profile、配置热更新、rotation/GC；
- Cache UI、用户开关、统计、成本报表、通知；
- 跨 Session/用户/企业共享、Session Family/Subagent sharing；
- Redis/自建 Prompt 内容缓存；
- 修改 Context Budget、Compaction、Kernel reducer、ADR-017、Task 状态；
- ARH-3.2.3 Provider Projection 或 ARH-3.3 Evidence Closure。

ARH-3.2.2 不依赖 PRD/UX，因为没有用户页面或交互。如果未来增加用户/管理员可见开关、统计、
费用或 Profile 配置，必须先有 PRD/Feature Spec。

## 18. 上游借鉴

- Codex：借鉴 exact Session cache identity、transport identity 分离与请求字段兼容性穷尽检查；
- OpenAI/Anthropic 官方文档：仅用于约束后续 Provider projection 能力，不在本批发送字段；
- RoboThree：复用 ARH-3.2.1 v1alpha2/Session scope、CGF-2 lease/fencing、ARH-3.1 Usage Fact 和
  Alignment-2 Java/MyBatis/无状态集群基线；
- 采用 `DESIGN_ONLY + OWN_CACHE_PLANNER + OWN_PERSISTENCE + OWN_CONFORMANCE`；不复制第三方
  源码、DTO、SQL、Prompt、Fixture 或 SDK。

编码真正采用后，使用当时下一个可用 AR 编号登记；本轮 docs-only 不预占编号。

## 19. 工期

| 内容 | 集中工程工作量 |
| --- | --- |
| 纯 Planner/Profile/Classifier/Projector | 2～3 工程工作日 |
| v0009/MyBatis/两个事务/activation | 2～3 工程工作日 |
| 双 JVM Recovery/Harness/收口 | 1～2 工程工作日 |
| 合计 | **5～8 工程工作日** |

不包含独立 QA、真实 Provider/企业 Relay 资源等待和返工；这是集中工程量，不是日历承诺。

## 20. 文档评审问题

请 Claude Code 按 P0/P1/P2/P3 做 Revision 1 差异复核：

1. 当前代码事实与缺口是否准确；
2. ARH-3.2.2 是否保持“只建 durable Plan、不投影 Provider 缓存字段”；
3. Profile 使用不可变版本化 Seed、不建 CRUD 表是否满足 Alpha；
4. active/retired/disabled 与新建/恢复边界是否明确；
5. Compatibility Classifier 是否真正穷尽当前 provider-neutral 字段；
6. Static Prefix Projector 是否消费最终 strict projection 且没有复制 ContextBuilder；
7. scope/source lock/prefix/key 四层公式与 Monotonicity 是否前后一致；
8. explicit key、Anthropic marker 与 automatic-observed 语义是否避免虚假隔离声明；
9. v0009 两表是否是恢复所需的最小持久模型；
10. Profile 不入数据库、Plan 物化 exact profile identity 是否足以恢复；
11. Transaction A 是否完整绑定 request/cache context 幂等；
12. Transaction B 是否保持 commit 后 Provider、Runtime 唯一 terminal writer；
13. 合法切换 Agent/Skill/Tool 是否总是新 source lock/key、旧 Plan 不变；
14. C3～C7 与双 JVM takeover 是否覆盖完整；
15. v1alpha2 生产 Bean activation fail-closed 是否充分；
16. no-cache Backend 是否足以防止 ARH-3.2.3 超前；
17. Device Trust 审计锚点和 per-device HMAC namespace 是否同时关闭跨设备误共享疑问；
18. 44 项 QA 与 5～8 工程工作日是否可执行；
19. 是否出现 P0/P1、公共 Contract 变化或需要用户重新决策的范围。

## 21. 当前门禁

```text
ARH-3.2.1：PASS/CLOSED
ARH-3.2.2 detailed plan Revision 1：PASS/CLOSED
ARH-3.2.2 coding：PASS/CLOSED
ARH-3.2.3：PASS/CLOSED
ARH-3.3：GATED
```

ARH-3.2.2 与 ARH-3.2.3 已通过独立 QA 并由用户正式关闭，ARH-3.2 整体关闭。ARH-3.3 继续
`GATED`。
