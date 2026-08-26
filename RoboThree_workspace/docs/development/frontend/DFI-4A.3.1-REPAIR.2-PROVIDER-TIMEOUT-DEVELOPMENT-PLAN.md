# DFI-4A.3 Provider Timeout Repair Revision 1.1 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 计划名称：DFI-4A.3 Provider Timeout Repair  
> 候选开发版本：`0.0.0-dfi.4a.3.1-repair.2`  
> 上游：DFI-4A.3.1～DFI-4A.3.3 `PASS/CLOSED`；`0.0.0-dfi.4a.3.1-repair.1`
> Usage Null Repair 已实现、独立 QA 待收口  
> 架构依据：ADR-005、ADR-015、ADR-015a、DFI-4A.3、DFI-4A.3.3  

Revision 1.1 已完成文档差异复核、实现、开发者门禁与独立 QA，并由用户正式接受为 `PASS/CLOSED`。
本次关闭不解锁 DFI-4A.4、DFI-5/Max、MiniMax Provider Profile 或其他下游批次。

`repair.2` 是候选开发版本名，因为 `repair.1` 已用于 OpenAI-compatible `usage: null` 修复；本文的
“Revision 1.1”是方案文档修订号，不是开发版本号。

实现证据见
[DFI-4A.3.1 repair.2 Provider Timeout 实施报告](./DFI-4A.3.1-REPAIR.2-PROVIDER-TIMEOUT-IMPLEMENTATION-REPORT.md)。

## 0. Revision 1.1 关闭映射

| 发现 | Revision 1.1 冻结结论 | 状态 |
| --- | --- | --- |
| P0-1 合法 SSE 进度帧有歧义 | 冻结 recognized progress frame 判定；空 `content` + `role: assistant` 算进度，纯 `usage:null`、`data:{}`、空 data、comment 和空白不续命 | 已实现并通过独立 QA |
| P0-2 无 `[DONE]` EOF 归因不明 | 正常完整 HTTP EOF 无 `[DONE]` 固定为 `personal_model.stream_terminal_missing`；异常断流与 timeout 分轨 | 已实现并通过独立 QA |
| P1-1 Policy 注入路径未冻结 | 单一 Core Composition 注入 immutable Policy；Agent Loop、Provider Factory、Durable Provider 消费同一 revision/digest | 已实现并通过独立 QA |
| P1-2 durable deadline / migration 25 不够具体 | additive 新表，不重建 migration 24；聚合 prepare、legacy pending fail-closed、deadline 漂移精确定义 | 已实现并通过独立 QA |
| Follow-up 正常 EOF 测试缺失 | QA 矩阵新增正常 EOF 无 `[DONE]` 的精确 typed mapping | 已实现并通过独立 QA |
| Follow-up EOF 检测方式 | 以 HTTP `IncomingMessage` 完整性和 iterator 结果为主，socket 信号为异常证据；禁止只看通用 `ECONNRESET` | 已实现并通过独立 QA |

## 1. 问题、目标与非目标

### 1.1 已确认问题

当前 Local Personal OpenAI-compatible Provider 同时存在五类缺陷：

1. `local-personal-openai-compatible-model-provider.ts` 将 `120_000` 同时作为默认值和允许上限，
   即使 SSE 持续正常输出，到 120 秒仍会主动销毁请求；
2. `DurableAgentLoopStarter` 在 main invocation 与 compaction 路径中以三处 `now + 300_000`
   构造 `deadlineAt`；只放宽 Provider 后，真实 Agent Loop 仍会在五分钟触发上层取消；
3. 请求建立后由本地 timer 销毁 socket，Node 可能向响应 iterator 暴露通用 `ECONNRESET`；若没有先锁定
   termination cause，会被 `mapFailure()` 误归为 `personal_model.network_failure`；
4. `LocalPersonalModelInvocationLink` 和 migration 24 未保存 timeout policy 与 exact
   `invocationDeadlineAt`；Core restart 后重新计算 `now + overall` 会延长同一个 Invocation；
5. 现有 Adapter 只有 overall timer，没有 connect、first-frame 与 streaming idle 的独立语义。

### 1.2 本批目标

本批只完成 Local Personal Provider Timeout Repair：

- 冻结并接入单一版本化 `ModelInvocationTimeoutPolicy v1`；
- 将 DNS/TCP/TLS connect、first recognized progress frame、stream idle、overall 分为四个 timer；
- 以 exact durable Timeout Fact 锁定 Invocation deadline，重试和重启不得延长；
- 本地 timeout、用户 cancel、真实 network/protocol error 精确分轨；
- 保持 DFI-4A.3.3 I1～I5、Usage unknown、无企业/个人 fallback、模型健康不被本地 timeout 污染；
- 用虚拟时间、受控 TLS 与真实 SQLite reopen 验证，不真实等待 15 分钟。

### 1.3 非目标

本批不做：

- Renderer、Main、Preload、Admin Console 或公共 Desktop API；
- Max/DFI-5 推理强度开关、模型参数映射或偏好 UI；
- Enterprise Model Gateway timeout 重构；
- MiniMax 缺 `[DONE]` 的 Provider Profile 兼容策略；
- 长内容分 section 生成、Checkpoint 或任务规划；
- Credential、Keychain、个人模型 CRUD/reveal；
- 新 Provider、新第三方 HTTP/SSE/timeout 依赖；
- 将 timeout 配置开放给普通用户、Renderer、Main 或环境变量。

## 2. 冻结 Timeout Policy v1

### 2.1 生产值

```text
policyRevision                  model-invocation-timeout.v1
connectTimeoutMs                30_000
firstProgressFrameTimeoutMs     90_000
streamIdleTimeoutMs             300_000
defaultOverallTimeoutMs         900_000
minimumOverallTimeoutMs         120_000
maximumOverallTimeoutMs         1_800_000
```

说明：

- Overall 从 Invocation 第一次 prepare 前的单次 `now` 开始；
- connect 覆盖 DNS resolve、TCP connect 与 TLS handshake；
- first-frame 从 TLS `secureConnect`、remoteAddress 复核和 request dispatch 已成立的单一 connect barrier
  后开始，等待第一个 recognized progress frame；HTTP 200/header 本身不算模型进度；
- idle 从第一个 recognized progress frame 后开始，每个后续 progress frame 重置；
- `[DONE]` 是 terminal progress，处理后立即清理全部 timer，不先开启新的 idle timer；
- effective deadline 取外层 Task/Run/Step deadline 与 Policy overall deadline 的更早者；
- 外层 deadline 可以使实际窗口短于 120 秒；120 秒只约束用户/部署请求的 overall 配置，不覆盖更早的
  durable Task deadline。

### 2.2 Policy canonical material

Policy 使用独立 canonical domain：

```text
robothree.local-personal-model.timeout-policy.v1
```

canonical material 必须完整覆盖：

- policy revision；
- connect / first progress / idle；
- default / minimum / maximum overall；
- timeout error mapping revision；
- progress frame classification revision。

`timeoutPolicyDigest = sha256:<64 lowercase hex>`。任何 timer 数值、frame 分类或 error mapping 改变都必须
产生新 revision/digest，不得在同一 revision 下静默改值。

## 3. 合法 SSE Progress Frame

### 3.1 Recognized progress

以下帧通过 SSE framing、UTF-8、JSON object 与现有 profile/schema 基础校验后，算 recognized progress：

1. `delta.role === "assistant"`，即使 `delta.content === ""`；
2. `delta.content` 为字符串，包括已识别的空首帧和非空正文；
3. profile 允许的 reasoning 字段为字符串；reasoning 内容不进入用户正文或日志，但算 Provider 进度；
4. 合法 Tool Call fragment；
5. 非空、合法 finish reason；
6. 非空且通过 strict Usage mapper 的 Usage；
7. `[DONE]`。

“纯 `usage:null`”固定定义为：该 JSON 帧除 `usage:null` 外，不包含任一上述 progress fact；无 assistant
role、content、reasoning、Tool Call、finish reason 或有效 Usage。同一帧只要包含任一 progress fact，
即使同时携带 `usage:null`，仍属于 recognized progress。

### 3.2 不续命但不立即失败

以下输入不重置 first-frame/idle，也不能成为 completed 证据：

- `data: {}` 或只有未知字段的 JSON object；
- 纯 `usage:null`；
- 空 `data:`；
- SSE comment / heartbeat；
- TCP 空白字节；
- 只含无法识别、但未违反 profile strict schema 的无进度帧。

它们可以被安全忽略，但不能无限延长 Invocation。

### 3.3 立即 protocol failure

以下输入保持既有 fail-closed，不等待 idle：

- 非法 UTF-8；
- 非法 JSON；
- 非 object payload；
- 超出 event/response/tool argument/tool call 上限；
- conflicting finish reason、duplicate terminal、event after terminal；
- 已被 Provider Profile 明确拒绝的字段形状。

## 4. EOF、Terminal 与异常断流

### 4.1 正常 HTTP EOF

正常 EOF 必须同时满足：

1. response async iterator 正常结束，没有 throw；
2. `IncomingMessage.complete === true`；
3. `IncomingMessage.aborted !== true`；
4. 没有已锁定的 timeout/cancel/network termination cause；
5. 没有 response/socket error 或 `close(hadError=true)` 证据。

正常 EOF 但未观察到 `[DONE]`，固定映射为：

```text
code      personal_model.stream_terminal_missing
kind      protocol
category  validation
```

不得映射为 `stream_idle_timeout` 或 `network_failure`。

不能只用底层 socket `end` 判断 HTTP body 完成：keep-alive 下 HTTP response 可以完整结束而 socket 继续存在。
主事实必须是 HTTP `IncomingMessage` 与 async iterator 完整性。

### 4.2 异常断流

以下属于异常断流证据：

- response iterator 抛错；
- response `aborted === true` 或 `complete !== true`；
- response/socket `error`；
- socket `close(hadError=true)`；
- HTTP parser 报 incomplete/premature close。

异常后必须先读取已锁定的 `terminationCause`：

1. 本地 timeout cause → 对应 timeout code；
2. 外层 deadline cause → `invocation_deadline_exceeded`；
3. 用户取消 → cancelled；
4. 没有以上 cause 且存在真实 OS/TLS/DNS/socket error → network failure。

禁止根据最终出现的通用 `ECONNRESET` 反向猜测业务原因。

### 4.3 MiniMax 边界

MiniMax 若持续以“完整内容 + 正常 EOF、无 `[DONE]`”结束，当前仍属于
`personal_model.stream_terminal_missing`。是否允许 Provider Profile 把特定可信 finish frame 作为 terminal，
必须另立兼容方案、真实脱敏帧评审和 conformance；本批不全局接受无 `[DONE]` EOF。

## 5. 单一注入路径

### 5.1 Composition 所有权

```text
Core Production Composition
  └─ immutable ModelInvocationTimeoutPolicy v1
       ├─ DurableAgentLoopStarter
       │    └─ 计算并锁定 effective invocation deadline
       ├─ Personal Model Provider Factory / Composite Resolver
       │    └─ 注入 connect / first-frame / idle / overall policy
       └─ DurableLocalPersonalModelProvider
            └─ 校验 policy revision/digest 与 durable Timeout Fact
```

同一个 immutable policy object/material 必须同时进入 Agent Loop 与 Provider factory，不允许两边各自定义默认值。

### 5.2 依赖与测试注入

- Production 注入现有 `Clock` + `Scheduler`，实现为 `SystemClock` / `SystemScheduler`；
- 测试注入现有 `FakeClock` / `FakeScheduler`，通过确定性推进验证 30/90/300/900/1800 秒边界；
- HTTPS event listener 可以使用一个 Core-private `ProviderTimeoutController`，但它只能消费已经解析、验证过的
  Policy，不得读取 env、Renderer 或 Main 参数；
- 测试不得通过把生产常量改成 5ms/5s 来冒充 15 分钟语义；短窗口只能来自 explicit test fixture policy，且
  `NODE_ENV !== test` 时禁止构造 test-only policy。

### 5.3 禁止路径

禁止：

- Adapter 自建 production 默认；
- Agent Loop 与 Adapter 保存两份可能漂移的 policy；
- `process.env`、CLI flag、Renderer/Main 输入覆盖 policy；
- Personal Model definition 保存 timeout；
- 用户 Profile/LocalStorage 保存 timeout；
- Max 开关静默改变 timeout；
- Provider profile 在同 revision 下静默改变 timer。

## 6. Effective Deadline 与 Drift

### 6.1 一次性计算

Invocation 第一次 prepare 使用一次 `clock.now()` 产生 `invocationStartedAt`：

```text
policyDeadlineAt = invocationStartedAt + selectedOverallTimeoutMs
invocationDeadlineAt = min(policyDeadlineAt, outerDeadlineAt?)
effectiveDeadlineSource =
  outerDeadlineAt exists && outerDeadlineAt < policyDeadlineAt
    ? outer_deadline
    : policy_overall
```

同一 `authorityInvocationId` 的 retry、I1/I2 recovery、Core restart、compaction recovery 必须读取该 exact
fact；不得重新采样 now，不得重新增加 15 分钟。

### 6.2 Deadline drift 精确定义

以下任一条件成立即 `local_personal.timeout_fact_drift`，失败关闭：

1. Timeout Fact 的 `recordDigest` 与 canonical material 重算不一致；
2. `invocationDeadlineAt <= invocationStartedAt`；
3. `selectedOverallTimeoutMs` 不在 120,000～1,800,000 内；
4. `policyDeadlineAt !== invocationStartedAt + selectedOverallTimeoutMs`；
5. `invocationDeadlineAt !== min(policyDeadlineAt, outerDeadlineAt?)`；
6. `invocationDeadlineAt > policyDeadlineAt`；
7. `effectiveDeadlineSource` 与实际更早者不一致；
8. timeout policy revision/digest 与当前锁定 Policy material 不一致；
9. 同一 authority invocation 的 prepare/replay/restart candidate 改变 startedAt、deadlineAt、source、
   selected overall 或 policy identity；
10. indexed fields、record JSON 与 record digest 不一致。

外层 durable deadline 允许使实际窗口短于 minimum overall；该情况必须保存 `outerDeadlineAt` 且 source 为
`outer_deadline`，不能误判为配置越界。

## 7. Migration 25：Additive Timeout Fact

### 7.1 新表

若编码前 migration id 25 已被其他获授权批次占用，必须停止并回文档评审，禁止静默改号。

本批不 ALTER/重建 migration 24 表，只新增：

```text
local_personal_invocation_timeout_facts
```

字段至少包括：

```text
authority_invocation_id           PRIMARY KEY / FK
timeout_policy_revision           TEXT
timeout_policy_digest             sha256 digest
selected_overall_timeout_ms       INTEGER
effective_deadline_source         policy_overall | outer_deadline
outer_deadline_at                 nullable UTC millisecond timestamp
invocation_started_at             UTC millisecond timestamp
policy_deadline_at                UTC millisecond timestamp
invocation_deadline_at            UTC millisecond timestamp
record_json                       bounded canonical JSON
record_digest                     sha256 digest
```

表使用 `STRICT`、长度/enum/digest/CHECK/FK；时间顺序与 canonical min 规则由共享 strict validator 重算，
SQLite CHECK 只承担可可靠表达的局部约束，不用字符串技巧伪装完整时间运算。

### 7.2 聚合 prepare

`LocalPersonalModelInvocationPersistence.prepareInvocation()` 必须升级为聚合输入并在单一 transaction 中：

1. 校验 Invocation Link；
2. 校验 Timeout Fact；
3. 校验二者 authority identity 精确一致；
4. 同时插入 link + timeout fact；
5. 任一失败整体回滚；
6. replay 时两者均 exact match 才返回 idempotent success；一侧缺失或 digest 不同为 corrupt/conflict。

禁止先写 link、再顺序调用另一个 Repository 写 timeout fact。

### 7.3 migration 24 历史事实

- 历史 terminal/recovery_exhausted link 没有 Timeout Fact 仍可只读；不得补造 deadline；
- 历史 pending link 没有 Timeout Fact 时，startup recovery 保守收敛为 `recovery_exhausted`，typed code 为
  `local_personal.timeout_fact_legacy_missing`；不得重新 dispatch；
- migration 不改写历史 record JSON/digest，不给旧记录补 `now + 15min`；
- migration 24 schema/script/digest 必须零漂移；
- InMemory 与 SQLite 共用同一 strict Timeout Fact validator 和同一 conformance matrix。

### 7.4 preflight / 半迁移

必须覆盖：

- fresh migration 1→25；
- exact migration 24→25；
- migration 1～24 文件/digest 零漂移；
- 新表已建但缺 index/foreign key/check 的半迁移失败；
- link 有 fact 无、fact 有 link 无、digest 损坏、duplicate authority、invalid time ordering 全失败；
- startup 中 migration/preflight 完成前 Provider runtime 不 ready。

## 8. 四阶段 Timeout Controller

### 8.1 状态机

```text
created
  -> resolving_and_connecting     connect timer + overall timer
  -> awaiting_first_progress      first-frame timer + overall timer
  -> streaming                    idle timer(reset on progress) + overall timer
  -> terminal                     all timers/listeners cleared
```

非法状态迁移、重复 terminal 或 late timer callback 只能清理，不得覆盖 winner cause。

### 8.2 Timer ownership

- overall 在 DNS 前开始，terminal/cancel/error 后清理；
- connect 在 DNS 前开始，TLS `secureConnect` 成立后清理；
- first-frame 在 connect 成立且 request body dispatch 后开始，首个 recognized progress 后清理；
- idle 在首个 recognized progress 后开始，每个 recognized progress cancel+replace；
- `[DONE]`、failed terminal、cancel、deadline、response error、normal EOF 后所有 timer 必须为 0；
- timer callback 先以 CAS 写入 `terminationCause`，winner 才能 destroy 当前 request/response；loser 只清理。

### 8.3 资源清理

所有路径必须释放：

- connect/first/idle/overall scheduled tasks；
- AbortSignal listener；
- request/response/socket listeners；
- request body Buffer；
- credential Buffer；
- SSE decoder residual text；
- late chunk working Buffer；
- DNS late result引用；
- Provider registry / inflight invocation entry。

## 9. Typed Error、Retry 与健康状态

### 9.1 内部 typed code

```text
personal_model.connect_timeout
personal_model.first_response_timeout
personal_model.stream_idle_timeout
personal_model.invocation_deadline_exceeded
personal_model.stream_terminal_missing
personal_model.network_failure
personal_model.cancelled
```

四种 timeout 均投影 `RuntimeError.category = timeout`；正常 EOF 缺 terminal 投影 validation；真实网络失败投影
provider/network safe message。用户界面不得显示 socket stack、host/IP、Credential 或 Provider 原始 body。

### 9.2 原因优先级

```text
locked local timeout/deadline cause
  > explicit user cancellation
  > strict protocol failure
  > actual network/TLS/DNS/socket failure
  > generic unavailable fallback
```

同一事件竞争只允许第一个 CAS winner；晚到 `ECONNRESET`、close、timer、abort 不得覆盖 winner。

### 9.3 Retry / Recovery

- connect/first-frame timeout 在没有 output evidence、outer deadline 仍有效且既有 retry policy 允许时才可重试；
- I2 Provider 可能已接收但无 output evidence，继续保留 at-least-once 风险计数，不假装 Provider 幂等；
- output started 后 stream idle/overall 不盲目重发、不拼接 partial；
- deadline 已到时不得通过 recovery 创建新 15 分钟窗口；
- timeout/cancel 不更新个人模型健康；
- 只有真实 network failure 才允许进入既有 `network_failed` observation；
- protocol terminal missing 继续进入 protocol incompatible 事实，不误记 network failure。

## 10. 允许修改范围与禁止范围

### 10.1 后续获权后允许

- `services/core/src/application/**`：Policy、deadline material、Durable Provider/Agent Loop 接缝；
- `services/core/src/ports/**`：Core-private policy/persistence 输入；
- `services/core/src/adapters/https/**`：Timeout Controller、HTTP/SSE EOF/error 归因；
- `services/core/src/adapters/sqlite/**`：migration 25、新表、preflight、聚合 persistence；
- `services/core/src/adapters/fake/**`：test-only policy/fact adapter；
- `services/core/tests/**`、`scripts/**`：focused/conformance/process Harness；
- 授权编码完成后的版本、CHANGELOG、README、DEVELOPMENT-LOG 与 QA evidence 收口。

### 10.2 禁止

- `apps/desktop/src/main/**`、`preload/**`、`renderer/**`；
- `apps/admin-console/**`；
- `services/central-service/**`、`services/document-worker/**`；
- Desktop Local/Public Contract 与 Core private HTTP；
- migration 1～24 改写；
- Credential、Keychain、CRUD/reveal；
- DFI-3A、AAPI、DFI-5/Max、TGM、Knowledge Provider；
- root dependency、第三方 timeout/SSE 包、`pnpm-lock.yaml`。

若实现发现必须修改禁止范围，必须停止编码、保留 evidence 并回文档评审。

## 11. 测试与独立 QA

### 11.1 Policy / canonical（1～12）

1. 默认值精确；2. 最小值；3. 最大值；4. 低于最小拒绝；5. 高于最大拒绝；6. phase 值进入 digest；
7. frame revision 进入 digest；8. error revision 进入 digest；9. 同 material digest 稳定；10. 任一字段改变 digest；
11. production 禁 test-only policy；12. Renderer/Main/env 无注入路径。

### 11.2 Progress frame（13～30）

13. 空 content + assistant role 算进度；14. 正文算进度；15. reasoning 算进度但不外泄；
16. Tool Call fragment 算进度；17. finish reason 算进度；18. valid Usage 算进度；19. `[DONE]` terminal；
20. content + usage:null 仍算进度；21. reasoning + usage:null 仍算进度；22. 纯 usage:null 不续命；
23. `{}` 不续命；24. unknown-only object 不续命；25. 空 data 不续命；26. comment 不续命；
27. 空白 bytes 不续命；28. invalid JSON 立即 protocol；29. invalid UTF-8 立即 protocol；
30. oversized event 立即 protocol。

### 11.3 Timer 状态机（31～48）

31. DNS stall connect timeout；32. TCP stall；33. TLS stall；34. connect 成立清 timer；35. header 不算 progress；
36. 90 秒无 progress first-frame timeout；37. 首 progress 清 first timer；38. 超过旧 120 秒持续输出不终止；
39. 299 秒 idle 不终止；40. 300 秒无 progress 终止；41. 每 progress 重置 idle；42. 噪声不重置；
43. 默认 900 秒 overall；44. 1800 秒 hard max；45. 更早 outer deadline winner；46. `[DONE]` 后 timer=0；
47. failed/cancel 后 timer=0；48. late timer callback 不覆盖 terminal。

### 11.4 EOF / error / health（49～64）

49. 正常完整 EOF 无 `[DONE]` → `stream_terminal_missing`；50. 该场景不是 idle；51. 该场景不是 network；
52. incomplete response → network；53. aborted response → network/cause-aware；54. socket reset → network；
55. local timeout + late ECONNRESET 保留 timeout；56. outer deadline + late reset 保留 deadline；
57. user cancel 保留 cancelled；58. protocol error 不被 close 覆盖；59. timeout category；60. terminal missing validation；
61. network safe projection；62. timeout 不更新模型健康；63. cancel 不更新模型健康；
64. 真实 network 才更新 network observation。

### 11.5 Migration / durable recovery（65～82）

65. fresh 1→25；66. exact 24→25；67. migration 1～24 digest 零漂移；68. STRICT schema；69. FK；
70. link+fact 原子 prepare；71. link-only 回滚；72. fact-only corrupt；73. exact replay；74. changed replay conflict；
75. record digest tamper；76. deadline <= started；77. deadline > policy max；78. wrong min/source；
79. restart deadline 不延长；80. retry deadline 不延长；81. legacy terminal 可读；82. legacy pending recovery_exhausted。

### 11.6 Regression / boundary（83～96）

83. usage:null 回归；84. 最终 Usage 正常；85. Usage absent 不伪造 0；86. Tool Call assembly；
87. stream terminal duplicate；88. event after terminal；89. 50-round Tool Loop 回归；90. compaction 共用 policy；
91. I1～I5 回归；92. 资源计数全 0；93. 四通道多编码泄漏扫描 0；94. migration 26 不存在；
95. 禁止目录零漂移；96. lockfile/依赖零漂移。

### 11.7 验证门禁

编码后至少串行执行：

```text
Node 24.13.0
focused timeout/provider/persistence tests
DFI-4A.3.1 Provider harness
DFI-4A.3.3 durable loop / process recovery harness
Core build
lint + architecture boundary
audit:dtp4
frozen install
root check
Central online
Central offline
```

受控 TLS、fake clock/scheduler 与 SQLite reopen 是正式证据；不得真实等待 15～30 分钟，也不得用 sleep/poll
猜测 timer barrier。

## 12. 实施顺序与工期

### Step 1：Policy / Composition（1～1.5 日）

- strict Policy、canonical digest、单一 Composition 注入；
- 删除 Adapter 120 秒与 Agent Loop 300 秒私有默认；
- main/compaction 共用 exact effective deadline material。

### Step 2：Migration 25 / Aggregate Persistence（1～1.5 日）

- additive timeout fact 表；
- InMemory/SQLite strict validator 与 atomic prepare；
- legacy/restart/drift recovery。

### Step 3：Four-phase Timeout Controller（1～1.5 日）

- connect/first/idle/overall 状态机；
- recognized progress classifier；
- EOF/incomplete response 与 termination cause CAS。

### Step 4：Error / Recovery Closure（0.5～1 日）

- typed error；
- health/retry/I1～I5；
- late cause/资源归零。

### Step 5：QA / 收口（1～1.5 日）

- 96 项矩阵；
- focused/full/Central 门禁；
- 版本、日志、QA evidence。

合计：**5～7 个集中工程日**，不含独立 QA、返工和真实 Provider 现场验收。

## 13. 退出条件

只有以下全部成立，候选编码批才能交独立 QA：

1. 四阶段 timer 与单一 Policy 真实接线；
2. Provider 120 秒和 Agent Loop 300 秒私有默认清零；
3. migration 25 exact、migration 1～24 零漂移；
4. restart/retry 不延长 Invocation；
5. 正常 EOF 无 `[DONE]` 精确为 terminal missing；
6. 本地 timeout 不再误报 network failure；
7. timeout/cancel 不污染模型健康；
8. 96 项矩阵及正式门禁全绿；
9. Renderer/Admin/Central/DFI-5/依赖/lockfile 零漂移。

本文 Revision 1.1 已完成聚焦差异复核、开发者门禁与独立 QA；用户已正式接受独立 QA 结论，
`0.0.0-dfi.4a.3.1-repair.2` 现为 `PASS/CLOSED`。
