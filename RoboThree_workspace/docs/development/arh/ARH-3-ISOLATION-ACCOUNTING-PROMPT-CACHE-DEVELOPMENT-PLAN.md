# RoboThree ARH-3 Isolation、Usage Accounting 与 Prompt Cache Development Plan

## 1. 文档状态

```text
状态：ARH-3 PASS/CLOSED
日期：2026-08-16
前置：ARH-0、ARH-1、ARH-2 PASS/CLOSED
ARH-3.0：PASS/CLOSED
ARH-3.1：PASS/CLOSED
ARH-3.2：PASS/CLOSED；3.2.1/3.2.2/3.2.3 PASS/CLOSED
ARH-3.3：3.3.0/3.3.1/3.3.2/3.3.3 PASS/CLOSED
```

Revision 3 已通过 Claude Code 差异复核并由用户正式接受；用户已关闭 ARH-3.0、确认本计划
并单独授权 ARH-3.1。ARH-3.1 已通过独立 QA并由用户正式接受关闭；ARH-3.2 Revision 1 也已
通过差异复核并由用户确认。ARH-3.2.1 已完成开发者门禁与独立 QA并由用户正式关闭；
ARH-3.2.2 Revision 1 已通过差异复核、实现、独立 QA 与用户接受并正式关闭；ARH-3.2.3
Revision 1 已通过差异复核、实现、独立 QA 与用户接受；ARH-3.2 整体已正式关闭。ARH-3.3
详细方案评审已通过并由用户确认；ARH-3.3.1、ARH-3.3.2 已通过独立 QA并由用户正式接受
关闭；ARH-3.3.3 repair.1 已通过独立 QA并由用户接受，ARH-3.3 与 ARH-3 已正式关闭。

### 1.1 Revision 3 修订摘要

Revision 3 保留 Revision 2 基于 Codex 源码研究形成的 exact Session cache scope、三类身份
分离、兼容性指纹、静态前缀单调性和两级 Usage Projection，并根据 RoboThree 同时支持
企业模型与个人模型的产品基线，补充以下长期边界：

1. `ProviderUsageFact` 与 `PromptCachePlan` 改为**执行位置中立的语义**，不再把 Central 写进
   概念定义；实际事实权威由 `UsageAuthority` 决定；
2. `UsageAuthority` 首期穷尽为 `central_enterprise` 与 `local_personal`：企业模型由 Central
   持有权威 Usage Fact，个人模型将来由 Local Core 的独立个人存储持有权威 Fact；
3. attempt identity 与 Usage digest 必须包含 authority namespace，禁止企业 invocation 与本地
   invocation 因 ID 偶合而错误去重；
4. `InvocationUsageProjection` / `SessionUsageProjection` 继续使用同一派生规则，可聚合两类
   authority，但不覆盖各自权威事实，也不建立第二套可修改累计值；
5. Prompt Cache 增加 `CacheExecutionAuthority`：企业路径由 Central 规划并投影，个人路径由
   Local Core 的个人 Model Adapter 规划并投影；两者共用 exact Session scope、Compatibility
   Fingerprint、Static Prefix Monotonicity 和安全 Evidence 语义；
6. 用户接受 Enterprise Gateway `v1alpha2 cacheContext` 作为企业跨进程路径的最小 Contract
   例外；它不用于个人模型路径，不进入公共 `ModelRequest`，具体 Schema/Fixture 与实现仍由
   ARH-3.2 单独授权；
7. ARH-3.1 只实现 `central_enterprise` 权威链路，同时冻结个人路径的 Core-private Port 和
   Conformance；ARH-3.2 同样只实现企业 Cache 链路和个人路径的 Fake/Conformance，不提前
   接入个人凭据、真实个人 Provider 或 UI；
8. Root/Child Agent 的 Session Family cache sharing 继续延后到 Subagent 阶段；
9. OpenAI Prompt Caching 依据链接修正为官方 Prompt Caching 指南；
10. Revision 3 的父级估算为 40 / 44 / 30 项、12～19 工程工作日；ARH-3.2 代码事实核验后，
    详细方案将 3.2 拆成三个受控批次；3.2.2 Revision 1 修正 scope/source/prefix/key 身份后，
    ARH-3.2 至少 86 项验收，ARH-3 总工程量调整为
    20～31 天。

本次仍为 docs-only；没有修改代码、公共 Contract、Schema/migration、依赖、版本或测试。

## 2. 阶段目标

ARH-3 关闭 Agent Runtime Foundation 的三类剩余缺口：

1. **Usage Fact Accounting**：区分本地预算估算、Provider 报告 Usage 和未来计费投影，
   把可证明的 Provider Usage 作为持久事实记录；
2. **Retry Usage Dedupe**：同一 Provider attempt 的 Usage 重放必须幂等，不同 attempt 的
   已确认 Usage 不得被错误合并；
3. **Prompt Cache**：利用既有 Context static/dynamic 分层，对静态前缀生成隔离、版本化、
   可失效的缓存计划，并由 Anthropic-compatible / OpenAI-compatible Adapter 按各自能力投影；
4. **Multi-Session Isolation & Evidence**：证明 Session 动态上下文不串线，缓存 key 不跨安全
   边界共享，Usage 不因 retry/replay 重复累计，Evidence 不泄漏正文、凭据或本地路径。

ARH-3 不是模型运营平台、账单系统或 UI 项目。它只完成运行时底座和可验证事实。

## 3. 当前代码事实与缺口

### 3.1 已有事实

1. 公共 `ModelStreamEvent` 已支持 `usage(inputTokens, outputTokens)`；ARH-1 已拒绝同一流内
   Usage 重复、回退、terminal 后 Usage；
2. Central 已在 terminal 事务中写入 `usage_recorded` durable event，并在
   `model_invocation.usage_json` 保存 input/output；
3. Enterprise Gateway Contract 已有 `usage_recorded`，但只公开 input/output；
4. 主 Assistant 调用和 Compaction 调用分别具有稳定 `clientRequestId`、`modelRequestId`、
   `invocationId` 与本地 durable link；transport `requestId` 可随网络尝试变化；
5. Context Pipeline 已把 system instruction、selected Skill 和 Tool schema 标记为 static，
   把 Conversation、Compaction Summary 和 Tool Result 标记为 dynamic；
6. Provider Adapter 已分别实现 Anthropic-compatible 与 OpenAI-compatible 请求/Usage 投影；
7. ARH-2 已证明首次/rolling Compaction、50-round Tool Loop 和七个崩溃窗口，不需要在
   ARH-3 重写这些基础设施；
8. Codex 源码快照已证明其默认以 Session ID 作为 Prompt Cache Key、为每个 Turn 新建
   `ModelClientSession`、逐字段判定增量请求兼容性，并从持久 `TokenCount` 恢复 Usage
   Projection；这些事实作为 ARH-3 Revision 2/3 的设计输入，不作为 RoboThree 已实现能力；
9. 企业模型的 Provider 调用与持久 Invocation 已经位于 Central；个人模型的凭据、调用链与
   运行时仍属于 Local Core/Desktop 边界，当前没有可直接复用的个人 Usage 权威实现。

### 3.2 剩余缺口

1. Agent Loop 当前忽略 Usage；Core durable link 没有 Usage event identity、digest 或安全投影；
2. Central 的 `usage_json` 是 terminal 附属字段，不是具备 attempt identity、digest 和唯一约束
   的独立 Usage Fact；
3. 现有 input/output 无法表达 cache read、cache write 等 Provider 报告明细；
4. 没有区分“上下文预算估算”和“Provider 报告 Usage”，容易误把两者当成同一事实；
5. static/dynamic segment 已存在，但没有 `PromptCachePlan`、隔离 scope、key 或 Provider 能力
   配置；
6. Anthropic Adapter 未投影 `cache_control`，OpenAI-compatible Adapter 未显式处理
   `prompt_cache_key` 或 provider-automatic cache；
7. 没有明确分离 cache scope、static prefix identity 与 transport session/request identity；
8. 没有缓存兼容性穷尽指纹；新增请求字段后可能被错误地视为可复用；
9. 没有冻结静态前缀不可原地重写的单调性不变量；
10. `ModelProviderInvocation` 当前已有 Core-private `sessionId`，但没有 `sessionScopeDigest` 和
    invocation-side durable cache context；严格 Gateway accept envelope 也没有 cache sidecar，
    Central 仍无法从 Task ID 或 clientRequestId 可靠推导 exact Session；
11. 当前 Usage/Cache 方案只完整描述了企业 Central 路径；若不先冻结执行位置中立语义，未来
    个人模型接入时会出现第二套 Fact、dedupe、projection 与 cache planner；
12. 没有跨 Session、retry、restart、双 JVM 的统一 Usage/Cache 机器证据。

## 4. 冻结概念与所有权

### 4.1 三类 Token 对象必须分离

| 对象 | 所有者 | 性质 | 是否持久 | 是否用于账单 |
| --- | --- | --- | --- | --- |
| `ContextBudgetEstimate` | Local Core | 本地 tokenizer/estimator 的 pre-call 估算 | Receipt 已留摘要 | 否 |
| `ProviderUsageFact` | `UsageAuthority` 对应执行位置 | Provider 对一次已识别 attempt 报告的 Usage | 是 | 仅作事实输入 |
| `CostProjection` | 未来运营/计费模块 | 价格表、币种、折扣和结算规则的计算结果 | 本阶段不实现 | 本阶段不实现 |

禁止把 `ContextBudgetEstimate` 写成 Provider Usage；禁止用缓存 token 与 input/output 简单相加
推断 context window；禁止宣称 `ProviderUsageFact` 与供应商最终账单完全一致。Provider 未返回的
字段保持 `unknown`，不得猜测为 0。

### 4.2 ProviderUsageFact 与 UsageAuthority

`ProviderUsageFact` 是执行位置中立的私有运行时事实。权威存储由穷尽枚举决定：

```text
UsageAuthority
├── central_enterprise  // 企业模型，Central PostgreSQL 是权威
└── local_personal      // 个人模型，未来 Local Core 私有 SQLite 是权威
```

两类 authority 必须共享同一字段语义、digest 规则和 Conformance，但不能共享 Credential
namespace、事务实现或可变存储。事实至少包含：

`UsageAuthority`、`ProviderUsageFact` 与下述个人路径 Port 均为 Core/Central 私有语义；本阶段
不把它们提升为 Desktop Contract、公共 `ModelRequest` 或用户可编辑字段。

```text
usageFactId
usageAuthority
authorityInvocationId
providerAttemptKey
fencingEpoch
usageDigest
sourceProtocol
reportingSemanticsRevision
providerInputTokens
providerOutputTokens
cacheReadInputTokens?    // optional, 未报告时不存在
cacheWriteInputTokens?   // optional, 未报告时不存在
reasoningOutputTokens?   // optional, 未报告时不存在
normalizedTotalInputTokens
attemptDisposition       // terminal_winner | superseded_confirmed
recordedAt
```

约束：

- `providerAttemptKey` 由稳定 `usageAuthority + authorityInvocationId + fencingEpoch` 派生，不使用
  transport requestId；不同 authority 即使 invocation ID 文本相同也不得碰撞；
- 同一 `providerAttemptKey + usageDigest` 重放为幂等；
- 同一 attempt、不同 digest 返回 typed conflict，不覆盖旧事实；
- 不同 attempt 的已确认 Usage 是不同事实，不得因为属于同一 logical invocation 就去重；
- Alpha 只保证记录运行时**实际收到且通过协议验证**的 Usage。失败或失联 attempt 若 Provider
  没有返回可验证 Usage，保持 unknown，不估算账单；
- `reportingSemanticsRevision` 必须声明 Provider input count 与 cache breakdown 的关系：
  Anthropic-compatible 的 `providerInputTokens` 按当前官方语义只表示最后 cache breakpoint
  之后的 uncached input，`normalizedTotalInputTokens = providerInputTokens +
  cacheReadInputTokens + cacheWriteInputTokens`；OpenAI-compatible 的 `providerInputTokens`
  已包含 cached tokens，`cacheReadInputTokens` 是其子集，`normalizedTotalInputTokens =
  providerInputTokens`。Adapter 必须按 Profile revision 选择公式，禁止跨协议统一相加；
- terminal winner 的 Usage Fact、`usage_recorded` Event、Audit Outbox 与 Invocation terminal
  必须在 authority 所在执行位置的同一事务提交：企业路径使用 Central PostgreSQL；未来个人
  路径使用 Local Core 私有 SQLite。Backend 不能直接提交 durable terminal 或绕过 Runtime；
- 如果旧 fencing epoch 在新 owner 已提交 terminal 后才返回**协议已验证的完整 Usage**，Runtime
  可以把预先登记的旧 attempt 写为 `superseded_confirmed`，但不得追加公共 Invocation Event、
  改变 terminal 或覆盖 winner Usage；该事实只进入 attempt ledger 和安全 Audit Outbox。没有
  完整 Provider Usage 时不得估算 superseded attempt；
- cache 明细不改变既有 input/output 语义；规范化总输入单独保存并带语义版本，不回写或覆盖
  Provider 原值。

### 4.3 Core Usage Projection

企业路径中，Local Core 不是 Provider Usage 的权威源，只保存恢复和 Session 隔离所需的安全
投影；个人路径中，未来的本地权威 Fact Store 与下列派生 Projection 必须使用不同 Port 和写入
职责，不能因为都在 Core 进程内就合并成一张可覆盖累计表：

```text
invocationLink identity
usageAuthority
authorityInvocationId
usage eventId
usage eventDigest
inputTokens
outputTokens
usageRecordedAt
```

主 Assistant link 与 Compaction link 都必须支持该投影。投影不保存价格、凭据、Endpoint、
完整 Provider 响应、Prompt、Output 或缓存正文。

Core 在此基础上提供两个**派生读模型**：

```text
InvocationUsageProjection  // 一次主调用或 Compaction 调用的已确认安全投影
SessionUsageProjection     // 从 Session 内 InvocationUsageProjection 确定性聚合
```

`SessionUsageProjection` 可以确定性聚合企业与个人两类 invocation，但不建立可被独立修改的
累计事实，不通过“最新累计值覆盖旧累计值”记账；
它必须从 invocation-level durable projection 重建。同一 invocation 的 replay 只更新/确认同一
投影，不得让 Session 聚合重复累计。重启或 Desktop 重连只重新发布读模型，不生成新的
`usage_recorded` durable Event。

Core 收到同一 eventId/digest 时幂等；相同 eventId 不同 digest、同一 invocation 第二个不同
Usage Event 或 Usage 在 terminal 后漂移时失败关闭。Core SQLite 不与 Central PostgreSQL 假装
跨数据库原子；重启后按 durable cursor/status-first 重新读取并收敛。

### 4.4 PromptCachePlan

`PromptCachePlan` 是执行位置中立、Provider-neutral 的私有运行计划，不进入公共
`ModelRequest` Contract。企业模型由 Central 生成和投影；个人模型未来由 Local Core 的个人
Model Adapter 生成和投影：

```text
cacheMode
cacheExecutionAuthority
cacheScopeIdDigest
staticSourceLockDigest
staticPrefixDigest
compatibilityFingerprintDigest
cacheKeyDigest
cachePolicyRevision
bindingRevision
providerProjectionMode
eligible
skipReason?
```

它只由以下材料确定性生成：

- exact Model / Binding / Adapter / Protocol revision；
- authority scope、enterprise/user 或 local-user scope、Credential namespace 与 exact Session
  identity 的安全隔离摘要；
- Platform/Agent/selected Skill 等 leading system instruction 的 revision/digest；
- exact Tool schema / CapabilityLock / Registry revision；
- cache policy revision 与 Provider capability profile revision。

禁止把以下动态材料纳入可共享静态前缀：

- Task/Run/round/requestId；
- 用户消息、Assistant Message、Tool Result；
- Compaction Summary、Knowledge 查询结果、Workspace 文件内容；
- transport requestId、Token、Credential、Endpoint 明文；
- wall clock、PID、端口或进程调度信息。

### 4.5 Alpha Session Cache Scope

Alpha 的 Cache 身份必须按四层分离：

```text
cacheScopeIdDigest
= authority + enterprise/user + Credential namespace + exact Session

staticSourceLockDigest
= Platform Prompt + Agent + selected Skills + allowed Tools exact revisions

staticPrefixDigest
= actual canonical provider-neutral static prefix

cacheKeyDigest
= scope + source lock + prefix + compatibility + exact Model/Binding/Adapter/Profile/Policy
```

同一 Session 的不同 Turn 可以复用相同 cache key；不同 Session 即使属于同一用户、静态正文
完全一致，也必须使用不同 cache key。ARH-3 Foundation 不做同用户跨 Session 共享。

同一 Session 合法切换 Agent/Skill/Tool revision 时，scope 保持不变，但 source lock/key 必须变化，
旧 Plan 保持不可变。Model/Binding/Profile 或 Compatibility/Policy 合法变化同样产生新 key/Plan，
不要求把安全 scope 伪装成配置版本。只有相同 scope/source/execution/Profile identity 生成不同
canonical prefix 才属于 drift 并失败关闭。

禁止跨用户、跨企业、个人模型与企业模型之间、不同 Credential namespace 或不同 Binding
共享。未来如引入 Subagent，可以单独评审由 Root Session 与其 Child Agent Tree 组成的
`Session Family`；当前 ARH-3 不实现 Subagent，也不预留静默共享。任何跨 Session、跨用户或
跨企业共享均属于后续 Enterprise Integration 优化，必须单独安全评审。

四个稳定 digest 与 transport identity 必须分离：

| 身份 | 生命周期 | 用途 | 禁止用途 |
| --- | --- | --- | --- |
| `cacheScopeIdDigest` | Session 级 | 限定缓存安全范围 | 不表示静态正文相同 |
| `staticSourceLockDigest` | 静态来源修订级 | 锁定 Platform/Agent/Skill/Tool 精确版本 | 不保存或代替正文 |
| `staticPrefixDigest` | 锁定静态前缀修订级 | 证明可缓存前缀内容与版本 | 不作为 Session/请求身份 |
| `cacheKeyDigest` | immutable Plan 级 | 组合 scope/source/prefix/compatibility/execution | 不作 Token/Transport 身份 |
| `transportSessionId/requestId` | Turn/网络尝试级 | sticky routing、网络追踪与重试 | 不进入 cache key 的稳定身份 |

Transport sticky state、`previous_response_id` 或连接实例不得跨 Turn/重启恢复为缓存身份。
`deviceId/clientInstanceId` 继续作为 Token、Device Trust 与 Audit 锚点，不进入 cache key；不同设备
Local Core 使用不同 HMAC namespace，因此 raw Session 偶合也不会跨设备共享 opaque scope。

### 4.6 Usage/Cache 执行位置矩阵

| 模型路径 | UsageAuthority | Usage 权威存储 | CacheExecutionAuthority | 跨进程 sidecar | ARH-3 实现边界 |
| --- | --- | --- | --- | --- | --- |
| 企业 Model / MaaS / 企业中转站 | `central_enterprise` | Central PostgreSQL | `central_enterprise` | Enterprise Gateway `v1alpha2 cacheContext` | 3.1/3.2 实现 |
| 个人 Model / 厂商直连 / 个人中转站 | `local_personal` | 未来 Local Core 私有 SQLite | `local_personal` | 不需要 | 本阶段只冻结 Port、Fake 与 Conformance |

共同语义包括：Provider Usage 字段、attempt dedupe、authority namespace、两级 Projection、exact
Session cache scope、Compatibility Fingerprint、Static Prefix Monotonicity 和 Evidence 安全格式。

禁止：

- 让个人模型调用绕行 Central 仅为复用 Usage/Cache 实现；
- 让企业模型在 Local Core 复制第二份权威 Usage Fact；
- 在企业与个人 Credential namespace 之间共享 cache key；
- 将 `UsageAuthority` 或 `CacheExecutionAuthority` 变成用户可选择的路由开关；它们由锁定的
  Model Binding/执行位置确定。

### 4.7 PromptCacheCompatibilityFingerprint

`PromptCacheCompatibilityFingerprint` 是 authority 实现私有、共享同一语义与
Conformance 的穷尽兼容性判定，至少覆盖：

```text
Model / Binding / Adapter / Protocol exact revision
Platform Prompt / Agent / Skill / Tool Schema exact revision or digest
toolChoice / parallelToolCalls
reasoning configuration
output schema / output text configuration
provider projection mode / service tier（若 Provider 声明影响缓存）
cache policy / Provider capability profile revision
```

新增任何 Provider 请求字段时，必须显式归类为：

```text
affects_cache
does_not_affect_cache
cache_disabled_until_reviewed
```

默认是 `cache_disabled_until_reviewed`。禁止用一个宽松对象比较或遗漏新字段来推断兼容。

### 4.8 Static Prefix Monotonicity

Task 启动并锁定运行组合后，静态前缀必须保持字节级规范化结果与排序稳定：

- Platform/Agent/Skill/Tool Schema 不在当前 Task 内原地改写；修订漂移失败关闭；
- 可合法变化的 Workspace、权限、环境或用户补充输入通过 bounded dynamic delta 追加，不重写
  已发送静态前缀；
- Tool Schema 固定规范化排序；Compaction 只替换动态 Conversation view，不改变静态前缀；
- 相同 source/execution/Profile identity 的下一 Turn 前缀必须保持完全相同；
- 合法切换 Agent/Skill/Tool revision 必须产生新 `staticSourceLockDigest/cacheKeyDigest`，旧 Plan
  不变；Model/Binding/Profile 合法变化产生新 key/Plan，不改写旧 scope 事实；
- 不得出现“相同 key 或相同比较身份却前缀已变”；
- 请求新增字段尚未归类时，禁用 cache，而不是继续沿用旧 key。

### 4.9 Cache 是优化，不是语义依赖

- cache hit/miss/unsupported 不改变 Model、Binding、Prompt 正文、Tool schema、权限或 Task 状态；
- cache key 不参与 `ModelRequest.requestDigest`，但 `PromptCachePlan` 自身必须有独立 digest 并
  进入内部 dispatch/evidence；
- Provider Profile 明确区分 `disabled`、`anthropic_explicit`、
  `openai_prompt_cache_key`、`provider_automatic`；不能仅凭 protocol 猜测支持；
- Profile 还必须声明 TTL、data-retention compatibility、logical isolation scope 与 Provider
  physical cache scope assurance；缺一项时 `disabled`；
- 自定义 Relay 默认 `disabled`，只有版本化配置明确支持才启用；
- Provider 确定性拒绝 cache 字段时返回 typed configuration/protocol error，不在可能已发送
  请求后静默移除缓存字段并盲目重试；
- cache 失效时继续用相同语义请求正常调用，不能换 Model、换 Binding 或删减 Context；
- Context Budget 仍使用 pre-call estimator，禁止使用 cache hit token 降低 Context 占用判断。

`cacheScopeIdDigest` 只证明 RoboThree 的逻辑规划与 Evidence 隔离，不能虚构 Provider
物理缓存隔离。若 Provider 只按相同前缀/组织共享，且无法用 opaque key、独立 Credential
namespace 或已审计的 Workspace 隔离满足 Profile，Alpha 必须保持 `disabled`。更宽的企业级
跨用户共享策略继续后置，不在本阶段自动开启。

### 4.10 企业 Session Scope 的跨进程输入

代码事实表明，当前 Core-private `ModelProviderInvocation` 已有 exact `sessionId`，但尚未生成
稳定的 `sessionScopeDigest` 或持久 invocation-side cache context；Enterprise Gateway
`v1alpha1` accept envelope 又是 strict schema。Central 不能使用 Task ID、Run ID、
clientRequestId 或 transport requestId 伪装 Session scope。

用户已接受 Revision 3 的架构方向：

1. 复用 Core-private invocation 既有 exact `sessionId`，不复制到公共 `ModelRequest`；
2. Core 使用版本化本地 namespace key 和 exact Session identity 生成 opaque
   `sessionScopeDigest`，不发送原始
   Session ID；
3. Enterprise Gateway 新增最小 `v1alpha2 cacheContext` sidecar，仅包含严格、定长的
   `sessionScopeDigest`；Central 再结合已验证 enterprise/user claims、Credential namespace、
   exact Session 安全事实生成 `cacheScopeIdDigest`，再结合 static source lock、实际 prefix、
   compatibility 与 exact Binding/Profile 生成 `cacheKeyDigest`；
4. `cacheContext` 不进入 Provider-neutral `ModelRequest`，不改变模型语义 request digest；但其
   独立 digest 必须参加 Gateway accept 幂等冲突判断、dispatch decision 和 Evidence；
5. `v1alpha1` 客户端或缺少 sidecar 时 cache 必须 `disabled`，不得从 Task/client request 猜测；
6. v1alpha1 Schema/Fixture 字节不改写；v1alpha2 使用 TS/Java 同一 valid/invalid Fixture 和严格
   Conformance；sidecar 不包含原始 Session ID、Prompt、Credential、Endpoint 或正文。

这是仅服务 `central_enterprise` 路径的最小跨语言 Contract 差异。用户已接受该架构例外，
但不等于字段级 Schema/Fixture 或代码已获授权；具体实现仍必须在 ARH-3.2 前完成独立计划、
跨语言 Conformance 和单独授权。`local_personal` 路径不经过 Gateway，不发送该 sidecar。
它不阻塞只处理 Usage Fact 的 ARH-3.1。

## 5. Provider 投影规则

### 5.1 Anthropic-compatible

- 仅 `PromptCacheProfile=anthropic_explicit` 时投影 `cache_control`；
- System instruction 和 Tool schema 保持稳定排序，并在经过 Profile 允许的位置添加 cache
  breakpoint；
- 用户消息、Tool Result、Compaction Summary 不标记为共享静态缓存；
- 读取 Provider 报告的 cache read/cache creation 字段时保留其原始语义，不并入 inputTokens；
- `normalizedTotalInputTokens` 使用 Anthropic 语义的 uncached + cache-read + cache-write，
  与公共 `inputTokens` 分开；
- 缺字段表示 unknown，不返回伪造 0；重复、负数或回退继续由 Provider/ARH-1 Conformance
  失败关闭。
- Alpha 不采用 Anthropic top-level automatic caching；共享企业 Credential 无法证明 user-scoped
  physical isolation 时，Anthropic cache profile 保持 `disabled`。未来放宽必须单独安全决策。

### 5.2 OpenAI-compatible

- `provider_automatic` 不添加非标准字段，只记录静态前缀 digest 和 Provider 报告 cached tokens；
- 只有 `PromptCacheProfile=openai_prompt_cache_key` 才投影 bounded、opaque 的 cache key；
- 自定义 Relay 若未声明支持，禁止因为其协议为 OpenAI-compatible 就发送 `prompt_cache_key`；
- `prompt_tokens_details.cached_tokens` 等可选明细按 Profile/协议版本解析；未知扩展不污染公共
  Contract；
- OpenAI-compatible 的 cached tokens 是 input tokens 的子集，不得再次加到
  `normalizedTotalInputTokens`；
- cache key 只使用 opaque digest，不发送 enterpriseId、userId、Agent 名称或 Skill 名称。
- Provider automatic 模式不能提供所需 physical isolation assurance 时保持 `disabled`；不得因为
  官方 Provider 默认支持缓存就自动启用。

### 5.3 Contract 边界

ARH-3 保持以下公共模型语义不变：

- `ModelRequest` 字段不增加 cache hint；
- `ModelStreamEvent.usage` 仍公开 input/output；
- Enterprise Gateway `usage_recorded` 仍兼容现有 v1alpha1 Fixture；
- Task/Run/Step、Kernel reducer 与 Desktop Projection 不新增 token/cache 状态。

cache breakdown、attempt fact、cache plan 和 evidence 属于 Central/Core 私有实现。唯一已知
跨进程差异是 §4.10 接受的 Enterprise Gateway `v1alpha2 cacheContext` sidecar；它不进入公共
`ModelRequest`，且 v1alpha1 保持兼容并禁用 cache。除该已显式评审的 sidecar 外，若编码时发现
还必须修改公共 Contract，必须停止对应批次，重新提交差异评审和用户决策，不能以 additive
为由静默扩展。

## 6. 持久化与事务

### 6.1 Central PostgreSQL

ARH-3.1 预计新增整体 Schema `v0008`，遵循公司 SQL 脚本治理：

- 新 `B0008` baseline、`U0008` upgrade、manifest 与 SHA-256 sidecar；
- `v0007` baseline/upgrade/manifest 字节不得改写；
- 新 `model_invocation_usage_fact`（最终命名由代码评审确认）；
- 如果同一 logical invocation 可能存在多个 fencing attempt，必须同时有 durable attempt
  registration；Usage Fact 只能引用已登记 attempt，不得仅凭迟到请求正文创建 ledger 事实；
- unique `(usage_authority, authority_invocation_id, provider_attempt_key)`；企业 v0008 的
  `usage_authority` 固定为 `central_enterprise`；
- `usage_digest`、JSON-safe 严格明细、非负约束、protocol/reporting revision；
- terminal winner Fact、durable Event、Audit Outbox 与 Invocation terminal 同事务；
- MyBatis-Plus + 显式 Mapper SQL，不使用 `${}`、Wrapper 或动态任意列；
- 不引入 Flyway；SQL 日志保持关闭；Controller 不写业务逻辑。

### 6.2 Core SQLite

ARH-3.1 预计新增私有 migration 20：

- 在主/Compaction invocation link 或独立 safe projection 表保存 Usage event identity/digest；
- InMemory/SQLite 运行同一 Conformance；
- close/reopen、same event replay、digest conflict、cursor replay、terminal 后漂移全部验证；
- migrations 1～19 不改写；
- 不把 Provider Usage 写入 Conversation Message、Task State、Compaction Record 或 Kernel。

migration 20 只保存企业 Fact 的本地安全投影，不提前建立 `local_personal` 权威事实表。个人
模型未来接入时必须使用已冻结的 Core-private `LocalPersonalUsageAuthorityPort` 与同一
Conformance，再以新的 forward-only migration 建立本地权威存储，禁止借 migration 20 混合
权威事实和派生 Projection。

### 6.3 无跨数据库原子事务

权威顺序为：

```text
Central terminal transaction commits ProviderUsageFact + usage_recorded + terminal
→ Core 从 status/SSE 读取 durable usage event
→ Core 以 event identity/digest 幂等写 safe projection
→ crash 后按 cursor/status-first 重放收敛
```

Central 成功、Core 写入前崩溃不丢权威事实；Core 重放不得让 Central 再累计一次 Usage。
未来个人路径没有跨数据库事务，但仍必须在 Local Personal Usage Store 内以单事务提交 terminal
winner Fact/Event/terminal，再由同一投影接口幂等构建 Session 读模型。

## 7. 批次拆分

### 7.1 ARH-3.0：Detailed Plan 与文档评审

交付：

- 本计划；
- 当前代码事实与缺口核验；
- Token 三对象、attempt identity、cache isolation 和公共 Contract 边界；
- 3.1/3.2/3.3 范围、工期与 QA 门槛。

退出：Claude Code 文档评审无未关闭 P0/P1，用户确认计划并明确授权 ARH-3.1。

### 7.2 ARH-3.1：Durable Usage Facts 与 Retry Dedupe

范围：

1. 执行位置中立的 `ProviderUsageFact`、`UsageAuthority`、authority-scoped attempt identity/
   digest Core-private 语义；
2. Provider 两协议可选 Usage breakdown 解析；
3. PostgreSQL v0008 + MyBatis Conformance；
4. terminal transaction 的 Usage Fact/Event/Outbox/terminal 原子提交；
5. Core private durable event digest 投影 + SQLite migration 20；
6. 主调用与 Compaction 调用同一 dedupe 不变量；
7. crash/replay/fencing/stale owner/different attempt 测试；
8. `central_enterprise` 生产实现；`local_personal` 只冻结 Core-private Port、Fake 和同一
   Conformance，不建立真实个人 Provider、凭据或权威表；
9. 不接 Prompt Cache，不增加 UI，不计算价格。

退出：Central online/offline、Core InMemory/SQLite、完整 Workspace 与独立 QA PASS，用户接受关闭。

### 7.3 ARH-3.2：Prompt Cache Planning 与双协议 Projection

字段级、事务级和分批实施方案见
[ARH-3.2 Prompt Cache Planning 与双协议 Projection 详细实施方案](./ARH-3.2-PROMPT-CACHE-PLANNING-DEVELOPMENT-PLAN.md)。
ARH-3.2.2 的 Durable Planner、Profile、v0009 与 C3～C7 细化见
[ARH-3.2.2 Durable Cache Planner Detailed Plan](./ARH-3.2.2-DURABLE-CACHE-PLANNER-DEVELOPMENT-PLAN.md)。
该详细方案将本节范围拆分为 ARH-3.2.1/3.2.2/3.2.3；三个批次均需独立授权，文档评审通过
不自动进入编码。

范围：

1. 执行位置中立的 `PromptCacheProfile`、`PromptCachePlan`、`CacheExecutionAuthority` 与
   deterministic planner 语义；
2. exact Session cache scope，默认禁止跨 Session 共享；
3. cache scope / static source / static prefix / cache key / transport identity 五分离；
4. `PromptCacheCompatibilityFingerprint` 穷尽分类；
5. Static Prefix Monotonicity 与稳定排序；
6. Core-private exact Session identity 与最小 Gateway `v1alpha2 cacheContext` sidecar；
7. Anthropic explicit marker projection；
8. OpenAI automatic/key 两模式；
9. Provider/Relay capability fail-closed；
10. cache Usage breakdown 接入 ARH-3.1 Fact；
11. `central_enterprise` 生产投影与受控 Provider Conformance；
12. `local_personal` 只冻结 Core-private Cache Planner Port、Fake 和 Conformance，不实现真实
    个人模型调用或凭据。

退出：两协议受控 Provider 的 request-body、invalidation、unsupported、usage breakdown、泄漏与
回归全部 PASS，用户接受关闭。

### 7.4 ARH-3.3：Multi-Session Isolation 与统一 Evidence Harness

范围：

1. 至少 3 个并发 Session、2 个 user scope、2 个 Central JVM、共享 PostgreSQL；
2. 同一 Session 跨 Turn/static key 稳定，dynamic context 不进入 key；
3. 不同 Session（包括同一用户）、cross-user/cross-enterprise/cross-binding/cross-revision key
   必须不同；
4. 同 attempt usage replay 不重复、不同 attempt 已确认事实分别保留；
5. terminal commit 前/后、Core projection 前/后、cursor response 丢失等命名崩溃窗口；
6. 首次/rolling Compaction、主调用与摘要调用 Usage 不串线；
7. Provider cache hit/miss/disabled/unsupported 不改变 semantic request digest；
8. 机器可读 Evidence、四通道 canary 扫描与资源归零。
9. `central_enterprise` 完整生产 Harness，加一组 `local_personal` Port/Conformance Harness，
   证明两类 authority 共用语义但不共享事实、凭据或 cache key；不得宣称个人 Provider 已接通。

真实 Provider Cache 行为依赖 Key、Endpoint、网络和费用，继续作为独立
`RESOURCE_GATED` Conformance；受控 Provider 能关闭 Foundation，但不得据此宣称特定厂商或
企业 Relay 的真实 cache hit、计费准确或生产 SLA。

## 8. 关键恢复与并发场景

### 8.1 Usage

| 场景 | 期望 |
| --- | --- |
| 同 attempt 同 digest 重放 | 幂等，Fact/Event/Projection 计数不增加 |
| 同 attempt 不同 digest | typed conflict，旧事实不变 |
| 新 fencing epoch 的新 attempt 返回 Usage | 新事实；不得错误当成旧 attempt replay |
| stale owner 在新 owner terminal 后迟到 | 不能改 terminal；完整且引用已登记 attempt 的 Usage 可记为 superseded_confirmed，不产生公共 Invocation Event |
| Central commit 后响应丢失 | 重查返回同 Fact/Event，不重复累计 |
| Core 写 projection 前崩溃 | cursor/status-first 重放并写一次 |
| Core projection commit 后响应丢失 | 同 event replay，projection 不重复 |
| Provider 未报告 Usage | terminal 可按既有协议规则失败或 unknown；禁止估算为 Provider Fact |
| 企业与个人 authority 使用相同 invocation ID 文本 | providerAttemptKey 仍必须不同，不得跨 authority 去重 |
| `local_personal` Fake 重放 | 与企业路径使用同一幂等/冲突 Conformance，但不写 Central PostgreSQL |

### 8.2 Prompt Cache

| 场景 | 期望 |
| --- | --- |
| 同一 Session、同静态前缀、不同 Turn | cacheKeyDigest 相同；transport identity 不同 |
| 同一用户、同静态前缀、不同 Session | cacheKeyDigest 必须不同；Foundation 禁止跨 Session 共享 |
| Skill/Tool/Agent/Model 任一 revision 改变 | cache key 失效 |
| Conversation/Tool Result/Summary 改变 | cache key 不变，但完整 request digest 改变 |
| 不同用户/企业/Credential namespace | cache key 必须不同 |
| compatibility fingerprint 任一 affects_cache 字段改变 | cache key 失效 |
| 新请求字段尚未归类 | cache disabled，不沿用旧 key |
| 静态前缀正文变化但 key 未变 | typed invariant failure |
| Relay 未声明支持 | 不发送 cache 字段 |
| Profile 声明错误、Provider 确定性拒绝 | typed failure；不静默换 Binding 或盲目重试 |
| cache miss/expired | 相同语义请求正常执行，不改变 Task 事实 |
| cache Usage 缺失 | unknown；不伪造 0、不推断 hit |
| 企业与个人路径静态前缀相同 | cacheExecutionAuthority 与 Credential namespace 不同，key 必须不同 |
| 个人路径执行 cache 规划 | 不发送 Enterprise Gateway sidecar，只经 Core-private Planner Port |

## 9. QA 验收矩阵

### 9.1 ARH-3.1（建议 40 项）

1. Token 三对象类型和模块边界；
2. ProviderUsageFact 严格字段、非负、optional unknown；
3. Anthropic/OpenAI input/cache 语义与 normalized total 公式分离；
4. attempt key 稳定且不含 transport requestId；
5. same attempt same digest 幂等；
6. same attempt different digest conflict；
7. different attempt 不错误去重；
8. fencing/stale owner；
9. terminal winner 原子事务；
10. commit 前回滚；
11. commit 后响应丢失 replay；
12. Usage Event 唯一；
13. Audit Outbox 唯一；
14. Anthropic input/output；
15. Anthropic cache optional fields；
16. OpenAI input/output；
17. OpenAI cached token optional fields；
18. winner 与 superseded_confirmed attempt 分离；
19. 未登记 attempt 拒绝；
20. negative/regressed/conflicting usage 拒绝；
21. Provider missing usage 沿用既有 fail-closed；
22. v0008 fresh；
23. v0007→v0008 upgrade；
24. legacy bridge；
25. v0007 digest 不变；
26. MyBatis/Testcontainers/Embedded PostgreSQL 一致；
27. Core main link projection；
28. Core compaction link projection；
29. Core InMemory/SQLite 一致；
30. close/reopen/cursor replay；
31. 无 Prompt/Output/Credential/Endpoint 泄漏；
32. InvocationUsageProjection 从 Fact/Event 确定性重建；
33. SessionUsageProjection 从 invocation-level projection 聚合；
34. 重启/重连 projection replay 不生成新 durable Usage Event；
35. Session 聚合不以累计字段覆盖、不同 invocation 不串线；
36. 公共 Contract/Kernel/Desktop 不变且 ARH-3.2/3.3 无超前；
37. UsageAuthority 枚举穷尽且未知值失败关闭；
38. 同 invocation 文本在不同 authority 下 attempt key/digest 不碰撞；
39. local_personal Core-private Port/Fake 通过与 enterprise 相同的幂等/冲突 Conformance；
40. ARH-3.1 不建立个人 Provider、个人凭据、个人权威表或 UI。

### 9.2 ARH-3.2（父级 44 条不变量）

以下是父计划验收不变量。详细方案进一步拆为至少 24 + 44 + 18 项可执行检查；若两者表述
不同，以不降低安全/恢复门槛的详细方案为准。

1. static/dynamic 分类消费现有 Context 事实；
2. staticSourceLockDigest 与 staticPrefixDigest 分离且排序稳定；
3. cacheScopeIdDigest 同一 Session 稳定；
4. 同一用户不同 Session 不同；
5. cross-user 不同；
6. cross-enterprise 不同；
7. cross-credential namespace 不同；
8. Model/Binding/Adapter/Protocol revision 合法变化生成新 key/Plan；
9. Agent/Skill/Tool revision 合法变化生成新 source lock/key，旧 Plan 不变；
10. cache scope / static source / static prefix / cache key / transport identity 五分离；
11. transport sticky state 不跨 Turn/重启；
12. compatibility fingerprint 穷尽字段；
13. affects_cache 字段变化失效；
14. does_not_affect_cache 字段变化不误伤；
15. 未分类新字段 cache disabled；
16. 相同 source/execution/Profile identity 下 static prefix 跨 Turn 字节级稳定；
17. 相同 key 或相同比较身份但 prefix 变化失败关闭；
18. dynamic Conversation 不入 key；
19. Tool Result 不入 key；
20. Compaction Summary 不入 key；
21. requestId/taskId/runId 不入 key；
22. opaque key 不含业务名称；
23. disabled profile；
24. custom Relay 默认 disabled；
25. Anthropic explicit request body；
26. Anthropic marker 边界；
27. OpenAI provider automatic；
28. OpenAI explicit key；
29. data retention / physical isolation assurance 缺失时 disabled；
30. Anthropic shared Credential 不满足 user scope 时 disabled；
31. unsupported profile fail-closed；
32. cache miss/hit 语义不变；
33. optional Usage breakdown；
34. unknown 不伪造 0；
35. 两协议 Conformance + cache plan digest 安全 Evidence；
36. 公共 ModelRequest 不变且 ARH-3.3 无超前；
37. Core-private sessionId 传播不进入 ModelRequest、Message、日志或 Evidence；
38. v1alpha2 cacheContext strict sidecar、独立 digest 与 accept conflict；
39. v1alpha1/sidecar missing 路径 cache disabled 且不猜测 scope；
40. TS/Java v1alpha2 valid/invalid Conformance，v1alpha1 Fixture 不改写；
41. CacheExecutionAuthority 枚举穷尽且由锁定 Binding 决定；
42. 企业与个人路径、不同设备 HMAC namespace 即使静态前缀相同也不共享 cache key，raw deviceId
    不进入 key；
43. local_personal Core-private Planner Port/Fake 通过相同 scope/fingerprint/monotonicity
    Conformance，且不发送 Gateway sidecar；
44. ARH-3.2 不接入真实个人 Provider、Credential Store 或 Desktop 设置。

### 9.3 ARH-3.3（建议 30 场景）

1. 三 Session 并发无消息串线；
2. 主调用 Usage 按 Session 隔离；
3. Compaction Usage 与主调用分离；
4. same-session cross-turn static key 稳定；
5. same-user cross-session key 隔离；
6. dynamic context 不共享；
7. cross-user 隔离；
8. cross-enterprise 隔离；
9. cross-binding 隔离；
10. cross-revision invalidation；
11. compatibility fingerprint invalidation；
12. prefix monotonicity / key-prefix mismatch fail-closed；
13. same attempt replay；
14. different attempt facts；
15. Central terminal commit 前 crash；
16. Central terminal commit 后 response loss；
17. Core projection 前 crash；
18. Core projection 后 response loss；
19. Usage Projection 重启/重连不制造新事实；
20. 双 JVM takeover/fencing；
21. PostgreSQL pause/unpause；
22. Core SQLite close/reopen；
23. initial/rolling Compaction Usage 隔离；
24. cache disabled/unsupported；
25. four-channel leak scan；
26. resource count 全部归零；
27. enterprise authority 完整生产路径；
28. local personal Port/Fake Conformance 路径；
29. 同 Session 企业/个人 invocation 的 Usage Projection 可确定性聚合但事实不串线；
30. enterprise/personal Credential namespace、cache key、attempt identity 四通道隔离。

独立 QA 必须实际运行 Harness；历史 digest 或开发者报告不能代替重跑。

## 10. Evidence 安全格式

报告只允许：

```text
scenarioId
status
duration
usageAuthority / cacheExecutionAuthority（仅固定枚举）
sessionCount / invocationCount / attemptCount / usageFactCount
input/output/cache token counts（仅数值）
requestDigest / usageDigest / cacheKeyDigest（只保留 digest）
cache mode / hit state（Provider 明确报告时）
resource metrics
typed error code
```

禁止记录：Prompt、用户/Assistant 正文、Tool 参数/结果、Summary、Skill/Knowledge/Workspace
内容、API Key、Credential、Access Token、Endpoint、完整本地路径、PID、端口或 Provider 原始响应。

## 11. 非目标

ARH-3 不实现：

- 价格表、币种、折扣、成本中心、预算告警或账单对账；
- Admin/ Desktop Usage 页面、导出、排行榜或统计看板；
- 用户可见 Prompt Cache 开关；
- 跨用户/跨企业缓存共享；
- Redis/分布式自建 Prompt Cache 服务；
- Provider 响应正文缓存；
- 自动模型路由、fallback、Binding 切换；
- 新模型协议或新 Provider；
- 真实个人 Model Provider、个人 API Key 生命周期、个人模型设置页面和本地个人 Usage 权威表；
- 长期 Memory、Knowledge RAG、Skill Runtime；
- Tool 并行、Subagent、多 Agent；
- 修改 Kernel reducer、Task 状态或 ADR-017 Effect 语义；
- 宣称通用 exactly-once、精确供应商账单或真实 Provider cache SLA。

## 12. PRD 依赖

ARH-3.1～3.3 **不依赖 PRD**，因为只处理运行时正确性、持久事实、Provider Adapter 和安全
Evidence，不新增用户页面或交互。

未来下列内容必须另有 PRD/Feature Spec：

- 用户或管理员查看 Token/费用；
- 成本预算、额度、告警、报表和导出；
- 用户可见缓存状态或开关；
- 企业级跨用户共享策略；
- 价格模型与账单对账。

## 13. 上游借鉴与拒绝项

### 13.1 借鉴

- **Codex**：参考 Session-scoped `prompt_cache_key`、Turn-scoped Model Client Session、
  请求兼容性穷尽比较、稳定前缀测试和持久 TokenCount 的 connection-scoped replay；
- **OpenCode**：参考 Session Usage 跟踪和 retry 需要统一 accounting 的问题意识；
- **OpenHands Software Agent SDK**：参考 static/dynamic prompt 分层与 `prompt_cache_key`
  的设计方向；
- **Hermes**：参考 Anthropic cache marker 在 Adapter 层投影、系统 Prompt 稳定和失效意识；
- **RoboThree 自有基线**：复用 ARH-1 Stream Validator、CGF-2 durable invocation、ARH-2
  Context segment/Compaction、ADR-017 durable identity 与 SQL 治理。

### 13.2 明确拒绝

- 不复制 OpenCode Go 源码、DTO、SQL、Prompt、Fixture 或 Provider SDK；
- 不采用 OpenCode 将 cache tokens 简单加进 prompt/completion 总数的公式；
- 不用 Session 累计字段覆盖历史 Usage；
- 不照搬 Codex 的内存累计 `TokenUsageInfo` 作为企业权威账本；
- 不发送原始 Session ID 作为 cache key，只发送带作用域的 opaque digest；
- 不在 Alpha 照搬同 Session Root/Child Agent Cache 共享，因为 Subagent 尚未进入范围；
- 不用进程内 Set 做 retry dedupe；
- 不把 Session ID 直接作为可跨 Session 共享的 cache key；
- 不把 Provider cache 命中当作 Context window 缩小或权限放宽依据；
- 不照搬某一家 Provider 的 cache 字段到公共 Model Contract。

实现阶段如采用上述设计，应追加下一个可用 Upstream Adoption Register 编号，类型为
`DESIGN_ONLY + OWN_USAGE_FACT + OWN_CACHE_PLANNER + OWN_CONFORMANCE`。

### 13.3 Provider 官方语义依据

- OpenAI 官方 API 文档：`prompt_cache_key` 只作为 Prompt Cache 优化线索；Provider 返回的
  `cached_tokens` 属于输入 Token 明细，不能当作额外输入再次累计；
- Anthropic 官方 Prompt Caching 文档：`cache_read_input_tokens`、
  `cache_creation_input_tokens` 与普通 `input_tokens` 具有独立语义；RoboThree 必须在 Adapter
  内按 Provider Profile 投影，不能用一套公共公式猜测；
- Provider 文档只能决定 Adapter 的协议映射，不能覆盖本计划冻结的权限、隔离、版本锁定和
  durable fact 不变量。

官方参考：

- https://developers.openai.com/api/docs/guides/prompt-caching
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching

## 14. 工期

集中工程工作量：

| 批次 | 估算 |
| --- | --- |
| ARH-3.1 | 5～8 工程工作日 |
| ARH-3.2 | 12～19 工程工作日 |
| ARH-3.3 | 3～4 工程工作日 |
| 合计 | 20～31 工程工作日 |

PM 日历预估：约 30～50 天，不包含真实 Provider Key/网络等待、独立 QA、用户验收和返工。
“工程工作日”表示约一个完整工程师工作日的集中投入，不代表当前对话必须连续运行 8 小时，
也不是日历承诺。

## 15. 文档评审问题

请重点复核：

1. Token 三对象是否彻底避免预算估算、Provider Usage 与账单混淆；
2. providerAttemptKey、fencingEpoch 与 transport requestId 生命周期是否正确；
3. 同 attempt 去重、不同 attempt 分别保留是否符合实际计费不确定性；
4. Central v0008 与 Core migration 20 是否必要且边界最小；
5. terminal winner Usage Fact/Event/Outbox/terminal 原子事务是否完整；
6. Core projection 是否避免跨 SQLite/PostgreSQL伪原子；
7. Alpha exact Session cache scope 是否比 same-user cross-session 更安全且足够有价值；
8. cache scope/static source/static prefix/cache key/transport identity 五分离是否清楚；
9. compatibility fingerprint 的穷尽分类和默认 disabled 是否可执行；
10. Prefix Monotonicity 是否覆盖 Task lock、动态 delta 与 Compaction；
11. Invocation/Session Usage Projection 是否避免第二事实源及 replay 重复事件；
12. exact Session scope 是否必须通过最小 Gateway v1alpha2 sidecar 才能跨进程成立；
13. sidecar 是否保持 ModelRequest 语义不变、v1alpha1 cache disabled 和严格兼容；
14. static prefix 是否正确排除 Conversation、Tool Result、Summary 和 Knowledge；
15. Provider Profile 是否避免把“协议兼容”误当作“支持 cache 扩展”；
16. Anthropic/OpenAI 两种投影是否保持公共 Model Contract 不变；
17. 机器 Evidence 与真实 Provider RESOURCE_GATED 边界是否清楚；
18. UsageAuthority / CacheExecutionAuthority 是否避免未来个人模型复制第二套语义；
19. ARH-3.1/3.2 只冻结个人路径 Port/Fake/Conformance、暂不建设真实个人链路是否边界适中；
20. 企业 v1alpha2 sidecar 不适用于个人模型、且不改变公共 ModelRequest 是否清楚；
21. 是否存在 P0/P1 或需要用户重新决策的范围变化。

## 16. 当前门禁

```text
ARH-3.0：PASS/CLOSED
ARH-3.1：PASS/CLOSED
ARH-3.2 plan：PASS/CLOSED / CONFIRMED
ARH-3.2.1：PASS/CLOSED
ARH-3.2.2 detailed plan Revision 1：PASS/CLOSED
ARH-3.2.2：PASS/CLOSED
ARH-3.2.3：PASS/CLOSED
ARH-3.3 detailed plan：PASS/CLOSED
ARH-3.3.1：PASS/CLOSED
ARH-3.3.2：PASS/CLOSED
ARH-3.3.3 plan：PASS/CLOSED
ARH-3.3.3 coding：PASS/CLOSED
ARH-3：PASS/CLOSED
```

ARH-3.2.2 与 ARH-3.2.3 均已完成独立 QA 与用户接受，ARH-3.2 整体正式关闭。`CTR-P3-001`
作为独立测试可靠性维护项，不自动进入 ARH-3.3。ARH-3.3.3 repair.1 已通过独立 QA 并由
用户正式接受；ARH-3.3.3、ARH-3.3 与 ARH-3 已依次正式关闭。正式 Harness 与 Central 门禁
后续必须串行执行。
