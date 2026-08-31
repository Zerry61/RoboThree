# DFI-5.3.4 Lifecycle / Cutover / Stage Closure 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-27  
> 负责人：Codex 5.6  
> 父计划：[DFI-5.3 Provider Mapping](./DFI-5.3-PROVIDER-MAPPING-DEVELOPMENT-PLAN.md)  
> 上游：DFI-5.3.1、DFI-5.3.2、DFI-5.3.3 均已 `PASS/CLOSED`  
> 本批最高输出：`DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`  
> 下游：DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 `GATED`

> Document review note（2026-08-27）：独立文档复核结论为 `PASS（P0=0/P1=0/P2=0/P3=2）`。两个非阻断
> P3 已直接吸收：QA-063 明确校验 DFI-5.3.3 落盘的四个 Gateway v1alpha3 canonical file digests；§1.1
> 显式说明 DFI-4A.3.1 repair.2 的 durable Timeout Fact 即 migration 25。两项均不改变范围、架构、工期或
> 编码门禁，无需重新完整评审。

## 0. 结论先行

DFI-5.3.4 是 **closure-only** 批次。它不再新增 Provider reasoning 字段、mapping variant、production release、
业务 route 或 UI，而是把已经关闭的三条 Provider 映射链放进同一个可重复、可崩溃、可恢复的验收体系：

```text
DFI-5.3.1 private mapping foundation
  + DFI-5.3.2 Local Personal OpenAI-compatible mapping
  + DFI-5.3.3 Enterprise OpenAI-compatible / Anthropic-compatible mapping
  + DFI-5.2.3 Task lock / ModelRequest / lifecycle facts
  + DFI-4A.3.1 repair.2 durable timeout facts
        |
        v
three-provider lifecycle + cutover + stage-closure harness
        |
        +-> parent 120-item matrix executed with item-level evidence
        +-> real process restart / exact historical mapping / exact deadline
        +-> Gateway v1alpha1 / v1alpha2 / v1alpha3 single dispatch
        +-> leakage and real resource convergence
        +-> honest readiness report
```

本批关闭后最多只允许声明：

```text
DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT
```

该结论只证明三类 Provider 的 reasoning mapping 在既有安全边界内完成工程 conformance。它不表示：

- production SubmitTurn v1alpha3 已开放；
- Desktop Max 开关已实现；
- production Local Personal 或 Enterprise Max release 已安装；
- production Gateway v1alpha3 route 已启用；
- 任意 OpenAI-compatible / Anthropic-compatible 模型都支持 Max；
- production identity、enterprise entitlement、TGM、Knowledge Provider 或 Agent Lifecycle 已就绪；
- DFI-5.4 或任何下游获得编码授权。

## 1. 当前代码事实与本批缺口

### 1.1 已关闭且必须复用的事实

1. DFI-5.3.1 已实现 sealed private directive、非循环 Strategy/Profile/mapping digest、exact historical registry
   与唯一 `TaskLockedReasoningProviderMapper`；
2. DFI-5.3.2 已实现 Local Personal mapping-before-durable-prepare、body allowlist、exact timeout identity、
   terminal replay 零 mapping load；
3. DFI-5.3.3 已实现 additive Enterprise Gateway v1alpha3、Core/Central 双重 exact 校验、OpenAI effort 与
   Anthropic bounded thinking projector；
4. `default_passthrough` 与 unsupported/unknown fallback 在三类 Adapter 中均不发送 reasoning 字段；
5. `max_applied` 只使用 Task 中锁定的 Profile、Strategy、mapping 与 timeout refs；
6. retry、Tool 后续轮、Compaction 与 restart 已沿用原 Task lock；Local Personal 已沿用 migration 25 exact
   deadline；
7. terminal replay 已在 Provider/mapping 前短路；Usage 缺失保持 unknown，不伪造 0；
8. private reasoning/thinking/signature 只作协议进度，不进入 assistant text、Message、Receipt、日志或 UI；
9. Gateway v1alpha1/v1alpha2 保持历史语义，v1alpha3 为 additive 独立 Wire Contract；
10. DFI-5.3.1/5.3.2/5.3.3 historical Harness 和 Evidence 均已冻结为只读历史证据。

其中，DFI-4A.3.1 repair.2 的 durable Timeout Fact 与 migration 25 是同一持久化事实；migration 名称为
`dfi_4a31_local_personal_invocation_timeout_facts`，不得将二者解释为两套 deadline authority。

编码前历史证据基线：

| 批次 | evidence digest |
| --- | --- |
| DFI-5.3.1 | `sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841` |
| DFI-5.3.2 | `sha256:d8fcaa832b0aa689d6d939e143fc56e3cf3180b28f77f50c4f14e5e020ef60fb` |
| DFI-5.3.3 | `sha256:b8ede54d8d22e0458ab80cd7fe059c2c97a105c2101c9cb47622fea48ed9d826` |

当前 migration 最大 id 为 26；`pnpm-lock.yaml` 基线 digest 为
`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

### 1.2 仍需由 DFI-5.3.4 关闭的缺口

1. 尚无一个联合 Harness 同时覆盖 Local Personal、Enterprise OpenAI-compatible 与 Enterprise
   Anthropic-compatible 的 main/Tool/Compaction/retry/restart/terminal replay；
2. 父方案 120 项 QA 仍是 `retained_for_dfi53_stage_closure`，尚未形成逐项执行账本；
3. 尚无真实 Core child、Central child、SQLite reopen 与受控 Provider fixtures 组成的阶段级崩溃恢复证据；
4. 尚无 Gateway v1/v2/v3 与 Local/Enterprise disabled/test-only cutover 的统一证据；
5. 尚无三条 Provider 链共同的 semantic replay、泄漏扫描与资源归零报告；
6. 尚未输出 DFI-5.3 父阶段的诚实 Closure 结论。

## 2. 范围与明确不做

### 2.1 本批允许实施

- DFI-5.3.4 focused lifecycle / cutover / boundary tests；
- 真实 Core child、Central test child、受控 Local/Enterprise Provider fixture 与 SQLite reopen Harness；
- 确定性 barrier、diagnostic counters、semantic evidence aggregator；
- 父方案 120 项 item-level execution ledger；
- DFI-5.3.1～5.3.3 historical regression 与 digest read-only 校验；
- 多编码泄漏负向覆盖、真实资源收敛、阶段 Closure Evidence；
- 实施报告、Evidence、版本和治理文档。

若现有诊断口无法证明关键计数，最多允许增加 **constructor-injected、production 默认 no-op、content-free** 的
最小诊断接缝。任何生产业务语义变化都必须停止并回评审。

### 2.2 本批明确禁止

- 不新增或修改 Provider reasoning body 字段、sealed directive 或 mapping digest 公式；
- 不安装 production Profile/mapping release；
- 不开放 production SubmitTurn v1alpha3、Gateway v1alpha3、Main/Preload/Renderer Max API；
- 不修改 Desktop、Admin、TGM、Knowledge Provider 或 Agent Lifecycle；
- 不修改 Gateway v1alpha1/v1alpha2/v1alpha3 Contract、ModelRequest Contract 或公共 Contract；
- 不新增 migration 27、Central migration、表、列、索引或 durable store；
- 不新增依赖，不修改 `pnpm-lock.yaml`；
- 不改变 timeout 数值、retry 次数、Tool round、context/output budget；
- 不修 MiniMax `[DONE]` 或顺带扩展其他 Provider Profile；
- 不使用公网、真实用户 Key、production Endpoint 或付费模型；
- 不覆盖 DFI-5.3.1～5.3.3 historical Evidence/Harness。

## 3. 冻结架构决策

### 3.1 G1：closure-only 与最小生产接缝

本批的默认文件面是 test、fixture、script、evidence 与 docs。只有当真实进程 Harness 无法读取既有诊断时，才允许
增加最小生产诊断接缝，并必须同时满足：

1. constructor 注入；
2. production composition 显式安装 no-op；
3. 不改变控制流、错误分类、持久化、网络请求或 body；
4. 只输出 non-secret integer/state identity；
5. boundary test 证明 Renderer/Admin/公共 Contract 不可见。

### 3.2 G2：阶段级真实拓扑

聚合 Harness 必须启动两个真实子拓扑，并由父进程统一观察：

```text
Topology A — Local Personal
parent harness
  -> controlled loopback TLS/SSE fixture
  -> Core child PID-A + real SQLite file
  -> SIGKILL at named barrier
  -> Core child PID-B reopens the same SQLite file

Topology B — Enterprise
parent harness
  -> controlled OpenAI/Anthropic HTTP/SSE fixtures
  -> Central test child PID-C on ephemeral loopback port
  -> Core child PID-D + real SQLite file
  -> Gateway v1alpha3 HTTP accept/status/events
  -> independently SIGKILL/restart Core and Central
  -> new PIDs reopen/reload exact durable and immutable facts
```

不允许：

- 单进程直接调 service 冒充真实进程；
- `throw` 冒充 SIGKILL；
- 删除重建 SQLite 冒充 reopen；
- request-body mock 冒充 HTTP/TLS Provider；
- `sleep` 猜窗口；
- 自动 retry 掩盖首跑失败。

所有 fixture 只使用 test sentinel Secret，且 `testIdentityUsed=true`、`productionIdentityReady=false`。

### 3.3 G3：cutover 三态与 production-disabled 边界

| 状态 | 必须观察到的事实 |
| --- | --- |
| feature disabled | production Gateway v3 controller/service/mapping source = 0；Local/Enterprise production release = 0 |
| enabled 但依赖缺失、重复或 non-production | HTTP ready 前 fail-fast，不注册半装配 route |
| test-only complete graph | exact 单一 controller/service/source，允许受控 fixture E2E；readiness 仍 false |

`robothree.model-gateway.enterprise-reasoning-v1alpha3-enabled` 继续默认 false。任何 env/CLI/Renderer 自报、
`@ConditionalOnMissingBean` fallback 或 Fake 进入 production graph 都视为失败。

### 3.4 G4：跨版本只允许单次 dispatch

- Local durable Invocation Link 按显式 schema version 单次 dispatch；
- Enterprise Gateway v1alpha1/v1alpha2/v1alpha3 按显式 contract version 单次 dispatch；
- malformed/unknown v3 不得 fallback v2/v1；
- 历史 v1/v2 digest、Controller、Usage、timeout 与 cache 行为必须零漂移；
- v1alpha3 reasoning sidecar 只影响 v3 exact path，不得被 legacy Adapter 忽略后继续请求。

### 3.5 G5：exact historical authority 与 load 次数

首次非 terminal 调用：

```text
default/fallback: Profile load=0, mapping load=0
max:              exact Profile load=1, exact mapping load=1
```

Task 首次 durable accept 后，Tool continuation、user continuation、Compaction、retry、Core restart 与 Central
restart 必须复用：

- 同一 ReasoningModeLock id/digest；
- 同一 Profile/Strategy/mapping revision/digest；
- 同一 Model lock 与 request digest family；
- 同一 durable Invocation Link identity；
- 同一 original durable deadline。

不得读取 current/latest alias，不得重新选择 Strategy，不得因为新 Profile 发布而迁移旧 Task。terminal replay
的 Profile/mapping/Provider resolve/upstream count 必须全部为 0。

### 3.6 G6：durable deadline 与失败归因

Local Personal 必须复用 migration 25 exact Timeout Fact；Enterprise 必须沿用既有 durable deadline。restart 不得
重新 `now + 900s`。timeout、user cancellation、network failure、protocol failure、mapping unavailable/conflict
必须保持 typed cause，late socket reset 不得覆盖先锁定的 cause，也不得修改模型 support/Profile 状态。

### 3.7 G7：body、Usage 与私有输出

- default/fallback 三 Provider HTTP body 中 reasoning 字段数为 0；
- Local/Enterprise OpenAI Max 只出现 sealed `reasoning_effort`；
- Anthropic Max 只出现 sealed `thinking` bounded budget；
- mapping 不改变 model、messages、tools、cache 或 output token limit；
- `usage:null` 不失败，final Usage exact；Usage 缺失保持 unknown；
- retry/recovery 不重复投影已 committed Usage；
- reasoning/thinking/signature 不进入 assistant text、Message、Receipt、stdout/stderr/evidence/failure summary。

### 3.8 G8：父方案 120 项必须形成执行账本

DFI-5.3.4 必须读取父方案 §9 的原始 1～120 项，验证编号连续、唯一，并在执行账本中规范化为
`QA-001`～`QA-120`，为每一项记录：

```text
qaId
ownerTest
providerPath
evidenceKey
result = pass | fail
```

聚合 Harness 必须在同一 run 内实际复跑 DFI-5.3.1、DFI-5.3.2、DFI-5.3.3 与本批 focused tests；historical
Evidence 只用于校验摘要不漂移，不得替代实际回归。只有 120 项全部 pass，才允许把：

```text
parentMatrixExecutionStatus
```

从 `retained_for_dfi53_stage_closure` 变为 `executed_at_dfi53_stage_closure`。禁止硬编码该状态或把 96 项本批
focused 矩阵冒充父矩阵。

父方案 QA-042/043/046/047 继续遵循既有 clarification：未安装的 boolean/bounded sealed variant 必须 strict
reject / 保持 unknown，不要求临时增加正向映射。

### 3.9 G9：三轮 semantic replay

至少三轮 fresh process 使用同一受控 Clock/ID seed。semantic digest 必须包含：

- Provider path 与 exact mapping identities；
- ReasoningModeLock / Model lock / request digest；
- original durable deadline；
- cutover version；
- terminal classification 与 content-free Usage identity；
- authoritative barrier outcomes。

PID、port、临时路径、墙钟启动时间和 transport nonce 可作为 process noise 排除。任何 authoritative lock、mapping、
deadline、body mode 或 Usage identity 漂移，必须改变 semantic digest 或 typed fail-closed；不得通过从摘要删除权威
字段伪造三轮一致。

### 3.10 G10：泄漏扫描与资源归零

负向扫描至少覆盖 5 个 canary × 4 种编码 × 4 个通道 = 80 次：

```text
canary: credential / endpoint / raw effort / raw budget / private reasoning
encoding: plain / json-escaped / base64 / percent-encoded
channel: stdout / stderr / evidence / failure summary
```

每次注入必须精确检出，正常 run 四通道命中数为 0。结束时以下 14 类真实诊断必须归零：

1. Core child；2. Central child；3. Provider fixture server；4. listening port；5. SQLite handle；
6. in-flight Invocation Link claim；7. Provider stream；8. SSE subscription；9. timer/scheduler；
10. AbortController；11. mapping lookup lease/callback；12. pending Usage projection；13. late callback；
14. temporary fixture file handle。

禁止缺失字段当 0、`?? 0`、硬编码 0 或由 parent 直接相信 child 的声明。

### 3.11 G11：诚实阶段输出

最终 Evidence 必须至少包含：

```text
outcome = DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT
parentQaMatrixCount = 120
parentMatrixExecutionStatus = executed_at_dfi53_stage_closure
localPersonalPathConformant = true
enterpriseOpenAiPathConformant = true
enterpriseAnthropicPathConformant = true
productionSubmitTurnV1Alpha3Reachable = false
desktopMaxUiReady = false
productionGatewayV1Alpha3RouteCount = 0
productionLocalPersonalMaxReleaseCount = 0
productionEnterpriseOpenAiMaxReleaseCount = 0
productionEnterpriseAnthropicMaxReleaseCount = 0
productionCpcActivationEnabled = false
productionEnterpriseEntitlementReady = false
tgmReady = false
knowledgeProviderReady = false
agentLifecycleReady = false
desktopAdminV2ConsumptionReady = false
```

禁止输出 `PRODUCTION_READY`、`MAX_READY_FOR_ALL_MODELS`、`IDENTITY_READY` 或任何下游 ready 声明。

## 4. 生命周期与崩溃窗口

### 4.1 正常路径 L1～L12

| 窗口 | 必须验证 |
| --- | --- |
| L1 Local default | body omission；Profile/mapping load=0/0 |
| L2 Local max | exact effort；load=1/1；Usage exact |
| L3 Enterprise OpenAI default | Gateway v3 safe sidecar + Provider body omission |
| L4 Enterprise OpenAI max | Central second validation + exact effort |
| L5 Enterprise Anthropic default | body omission；thinking absent |
| L6 Enterprise Anthropic max | exact bounded budget；signature 不投影 |
| L7 Tool continuation | 同一 lock/mapping/deadline |
| L8 user continuation | 同一 lock/mapping/deadline |
| L9 initial Compaction | 同一 lock/mapping，Summarizer 权限不扩大 |
| L10 rolling Compaction | 同一 lock/mapping，Context Receipt 不漂移 |
| L11 retry | exact historical mapping，不读 current，不重获 deadline |
| L12 terminal replay | mapping/Provider/upstream/Usage 新投影均为 0 |

### 4.2 崩溃恢复 C1～C10

每个窗口必须使用 test-only named barrier，不得用 sleep：

| 窗口 | barrier | 预期 |
| --- | --- | --- |
| C1 mapping 后、durable prepare 前 | `reasoning_mapping_validated` | 无 durable 半事实；恢复 exact lookup |
| C2 durable prepare 后、Credential 前 | `invocation_link_committed` | claim exact，deadline 不变 |
| C3 Credential 后、request write 前 | `credential_resolved` | Secret 清理；未写 body |
| C4 request 已发送、output 未开始 | `provider_request_sent` | 保留 at-least-once 风险，不伪装 exactly-once |
| C5 output 已开始 | `provider_output_started` | 不自动重发、不拼 partial |
| C6 Usage committed、terminal 前 | `usage_committed` | Usage 不重复投影 |
| C7 terminal committed、Message 前 | `provider_terminal_committed` | exact durable recovery，不换 Strategy |
| C8 Core restart | `core_restart_ready` | 新 PID、同 SQLite、同 lock/mapping/deadline |
| C9 Central restart | `central_restart_ready` | 新 PID、immutable exact release、诚实 resume |
| C10 terminal replay 与晚到 callback | `terminal_replay_started` | 晚到资源清理，不产生第二 Message/Usage |

若既有 Enterprise 协议在 C4/C5 只能诚实收敛为 resume unavailable / uncertain，本批保持该终态，不为 Max 新建
第二套恢复协议，也不得自动重发。

### 4.3 漂移与并发 D1～D10

1. 同 invocation 双 claim：既有 fencing 单 winner；
2. current Profile 发布：旧 Task 继续 old exact ref；
3. current mapping 发布：旧 Task 继续 old exact release；
4. historical mapping 缺失：typed unavailable，不切 current；
5. same revision material 漂移：typed conflict；
6. Endpoint Binding protocol/configuration/registry drift：Central accept/provider count=0；
7. timeout identity drift：durable prepare/upstream=0；
8. cancel/timeout 竞争：首个 typed cause 胜出；
9. terminal replay/late callback：单 terminal、单 Usage winner；
10. cache present/absent 与 reasoning 组合：request digest 与 sidecar exact，不交叉覆盖。

## 5. Evidence 与 Harness 设计

### 5.1 新增测试与脚本（编码授权后）

建议文件名可按现有工程 style 微调，但职责不得合并成单个不可审计脚本：

```text
services/core/tests/dfi5.3.4-lifecycle-closure.test.ts
services/core/tests/dfi5.3.4-process-lifecycle.test.ts
services/core/tests/dfi5.3.4-boundary.test.ts
services/core/tests/fixtures/dfi534-lifecycle-child.mjs
services/central-service/src/test/**/Dfi534EnterpriseLifecycleIntegrationTest.java
scripts/dfi5.3.4-evidence.mjs
scripts/dfi5.3.4-evidence.test.mjs
scripts/run-dfi5.3.4-harness.mjs
artifacts/dfi534/evidence.json
docs/development/frontend/DFI-5.3.4-LIFECYCLE-CUTOVER-STAGE-CLOSURE-IMPLEMENTATION-REPORT.md
```

### 5.2 Evidence 必须由运行事实生成

- parent 从 OS 观察 child PID/exit，并验证旧 PID 不存在；
- SQLite reopen 使用同一实际文件；
- Provider body 从真实 loopback server capture，测试结束立即销毁；
- authority load、mapping load、network、Usage 与资源计数来自 instrumented diagnostics；
- parent QA ledger 从实际 test result 与 evidence keys 聚合；
- historical evidence 文件只读并校验 digest，不重写；
- `evidenceDigest` 对完整 canonical evidence 计算，禁止自引用字段。

## 6. DFI-5.3.4 focused QA 矩阵（96 项）

父方案 120 项是阶段 closure 的主矩阵；以下 96 项是本批实现和 Harness 本身的 focused 验收，二者都必须留证。

### 6.1 Topology / cutover（QA-001～QA-016）

1. QA-001 Local topology 使用真实 Core child；
2. QA-002 Enterprise topology 使用真实 Core child；
3. QA-003 Enterprise topology 使用真实 Central child；
4. QA-004 Local fixture 为真实 loopback TLS/SSE；
5. QA-005 Enterprise OpenAI fixture 为真实 loopback HTTP/SSE；
6. QA-006 Enterprise Anthropic fixture 为真实 loopback HTTP/SSE；
7. QA-007 SIGKILL 后旧 PID 由 OS 证明退出；
8. QA-008 restart 获得不同新 PID；
9. QA-009 SQLite 原文件 reopen；
10. QA-010 production Gateway v3 property 默认 false；
11. QA-011 disabled 时 v3 controller/service/source count=0；
12. QA-012 enabled+missing dependency 在 HTTP ready 前失败；
13. QA-013 enabled+ambiguous dependency 在 HTTP ready 前失败；
14. QA-014 enabled+non-production dependency 在 HTTP ready 前失败；
15. QA-015 test-only complete graph exact count=1；
16. QA-016 production Local/Enterprise release counts=0。

### 6.2 Three-provider lifecycle（QA-017～QA-036）

17. QA-017 Local default body omission；
18. QA-018 Local max exact effort；
19. QA-019 Enterprise OpenAI default body omission；
20. QA-020 Enterprise OpenAI max exact effort；
21. QA-021 Enterprise Anthropic default body omission；
22. QA-022 Enterprise Anthropic max exact budget；
23. QA-023 default/fallback Profile load=0；
24. QA-024 default/fallback mapping load=0；
25. QA-025 max Profile load=1；
26. QA-026 max mapping load=1；
27. QA-027 Tool continuation exact lock/mapping；
28. QA-028 user continuation exact lock/mapping；
29. QA-029 initial Compaction exact lock/mapping；
30. QA-030 rolling Compaction exact lock/mapping；
31. QA-031 retry exact historical release；
32. QA-032 retry 不读 current alias；
33. QA-033 retry 不重新获得 deadline；
34. QA-034 terminal replay mapping load=0；
35. QA-035 terminal replay Provider/upstream=0；
36. QA-036 terminal replay Usage projection=0。

### 6.3 Crash / recovery / concurrency（QA-037～QA-056）

37. QA-037 C1 mapping 后 prepare 前无半事实；
38. QA-038 C2 exact Link claim 恢复；
39. QA-039 C3 Secret/body reference 清理；
40. QA-040 C4 request-sent 诚实 at-least-once；
41. QA-041 C5 output-started 不自动重发；
42. QA-042 C6 Usage 不重复；
43. QA-043 C7 terminal 后 exact recovery；
44. QA-044 C8 Core 新 PID/同 SQLite；
45. QA-045 C9 Central 新 PID/immutable release；
46. QA-046 C10 late callback 不产生第二终态；
47. QA-047 双 claim 单 winner；
48. QA-048 current Profile 漂移不影响旧 Task；
49. QA-049 current mapping 漂移不影响旧 Task；
50. QA-050 historical mapping 缺失 fail-closed；
51. QA-051 same revision changed material conflict；
52. QA-052 Endpoint Binding drift 零 Provider accept；
53. QA-053 timeout identity drift 零 durable prepare/upstream；
54. QA-054 cancel/timeout 首 cause 胜出；
55. QA-055 cache/reasoning 四组合 digest exact；
56. QA-056 所有崩溃窗口使用 named barrier、源码无 sleep。

### 6.4 Compatibility / Usage / timeout（QA-057～QA-072）

57. QA-057 Gateway v1 single dispatch；
58. QA-058 Gateway v2 single dispatch；
59. QA-059 Gateway v3 single dispatch；
60. QA-060 malformed v3 不 fallback v2/v1；
61. QA-061 v1 canonical digest 零漂移；
62. QA-062 v2 canonical digest 零漂移；
63. QA-063 v3 schema / compatibility / OpenAPI / manifest 四个 canonical file digests 逐项等于
    DFI-5.3.3 `CANONICAL-DIGESTS.sha256` 落盘历史事实；
64. QA-064 Local Invocation Link unknown version fail-closed；
65. QA-065 OpenAI `usage:null` 内容帧不失败；
66. QA-066 Local/OpenAI final Usage exact；
67. QA-067 Anthropic Usage exact；
68. QA-068 Usage 缺失保持 unknown；
69. QA-069 reasoning/thinking progress 重置 idle；
70. QA-070 Local exact durable deadline；
71. QA-071 restart 不延长 overall deadline；
72. QA-072 timeout/cancel/network 不改 support state。

### 6.5 Semantic / leakage / resources（QA-073～QA-084）

73. QA-073 三轮 fresh-process semantic digest 唯一；
74. QA-074 三轮 PID 不同；
75. QA-075 authoritative lock drift 改变 digest或 fail-closed；
76. QA-076 mapping drift 改变 digest或 fail-closed；
77. QA-077 deadline drift 改变 digest或 fail-closed；
78. QA-078 80 次负向泄漏注入全部精确检出；
79. QA-079 正常 stdout 命中0；
80. QA-080 正常 stderr 命中0；
81. QA-081 正常 evidence 命中0；
82. QA-082 正常 failure summary 命中0；
83. QA-083 14 类资源读取真实诊断并全部归零；
84. QA-084 无硬编码0、`?? 0` 或 parent盲信 child。

### 6.6 Parent ledger / boundary / honesty（QA-085～QA-096）

85. QA-085 父方案 QA 编号 1～120 连续唯一；
86. QA-086 每项都有 ownerTest/evidenceKey/result；
87. QA-087 同 run 复跑 DFI-5.3.1 focused/Harness；
88. QA-088 同 run 复跑 DFI-5.3.2 focused/Harness；
89. QA-089 同 run 复跑 DFI-5.3.3 focused/Harness；
90. QA-090 三个 historical evidence digest 不漂移且文件只读；
91. QA-091 120 项全部 pass 后 execution status 才迁移；
92. QA-092 public Contract/Task/Receipt/UI raw mapping 命中0；
93. QA-093 migration max=26、lockfile digest不变；
94. QA-094 production SubmitTurn/Desktop UI/Gateway v3均不可达；
95. QA-095 十项下游 readiness 全 false；
96. QA-096 outcome 仅为 `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`。

## 7. 实施步骤与估算

### Step 1：Parent matrix ledger 与 Evidence primitives（0.5～1 日）

- 解析并冻结父方案 120 项；
- 建立 item-level test/evidence mapping；
- 建立 historical digest read-only verifier；
- 建立 semantic/leak/resource evidence primitives。

### Step 2：三 Provider 真实进程 Lifecycle（1.5～2.5 日）

- Local Core child + TLS/SSE fixture + SQLite reopen；
- Enterprise Core/Central child + 两类 Provider fixture；
- C1～C10 named barrier、SIGKILL/restart；
- main/Tool/Compaction/retry/replay 联合验证。

### Step 3：Cutover / compatibility / security closure（0.5～1 日）

- production-disabled 三态 gate；
- Gateway v1/v2/v3 single dispatch；
- 三轮 semantic replay；
- 80 次泄漏注入与 14 类资源归零。

### Step 4：聚合 Harness / full gates / 报告（0.5～1 日）

- 执行本批 96 项与父方案 120 项 ledger；
- 复跑历史 Harness、root/Central/full boundary；
- 生成 canonical Evidence 与实施报告；
- 如实输出阶段 Closure 状态。

合计：**3～5 个集中工程日**，不含独立 QA、并发窗口外部阻塞与返工。

## 8. 文件边界

### 8.1 编码获授权后允许

- `services/core/tests/**` 中 DFI-5.3.4 tests/fixtures；
- `services/central-service/src/test/**` 中 DFI-5.3.4 test-only lifecycle fixture；
- `scripts/dfi5.3.4-*.mjs`、`scripts/run-dfi5.3.4-harness.mjs`；
- `artifacts/dfi534/**`；
- package-local test script、开发版本和必要治理文档；
- 仅在 §3.1 条件全部成立时的最小 content-free diagnostic seam。

### 8.2 明确禁止

- `apps/desktop/**`、`apps/admin-console/**`；
- `packages/contracts/src/**`、`contracts/enterprise-gateway/v1alpha1～v1alpha3/**` 的任何协议修改；
- Provider body mapping、private release、timeout/Usage 的生产语义修改；
- migration、依赖、lockfile；
- production route、identity、entitlement、TGM、Knowledge、Agent Lifecycle；
- DFI-5.3.1～5.3.3 historical artifact 覆盖。

## 9. 门禁

编码后至少串行执行：

```text
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
node --version                         # v24.13.0
pnpm --version                         # 11.11.0
pnpm run harness:dfi5.3.4
pnpm run harness:dfi5.3.3
pnpm run harness:dfi5.3.2
pnpm run harness:dfi5.3.1
pnpm run harness:dfi5.2.3
pnpm run harness:cpc3
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
shasum -a 256 pnpm-lock.yaml
migration max / production route / release / consumer scans
```

真实进程 Harness 若受 sandbox 限制，必须在获准的非沙箱环境执行并记录；不得用单进程替代。Central online/offline
即使本批没有生产 Java 变更也不得省略。

## 10. 实施报告必须给出的证据

1. 实际修改文件与 before/after version；
2. 两套真实进程拓扑、PID、SIGKILL、SQLite reopen；
3. L1～L12、C1～C10、D1～D10 窗口结果；
4. 三 Provider default/max captured body；
5. exact Profile/mapping load count 与 terminal replay 0 count；
6. original durable deadline 与 restart 不延长；
7. Usage/timeout/cancel/network/private output 结果；
8. Gateway v1/v2/v3 single-dispatch 与 canonical digest；
9. 父方案原始 1～120 项规范化后的 `QA-001`～`QA-120` item-level ledger；
10. DFI-5.3.4 focused QA-001～QA-096；
11. 三个 historical evidence digest 与只读校验；
12. 三轮 semantic replay；
13. 80 次负向泄漏注入、四通道 0 命中；
14. 14 类真实资源归零；
15. migration、lockfile、production route/release/readiness 状态；
16. focused/root/Central/frozen install 原始门禁结果；
17. 最终 canonical evidence digest 与诚实 outcome。

## 11. 停手条件

出现以下任一情况必须停止编码并回文档评审：

1. 必须修改任何公共或 Gateway Contract；
2. 必须新增/改变 Provider raw mapping 或 digest 公式；
3. 必须安装 production Max release 才能测试；
4. 必须开放 production SubmitTurn/Gateway/Desktop UI；
5. 必须新增 migration、Central schema、依赖或 lockfile 变化；
6. 必须使用公网、真实用户 Secret 或付费 Provider；
7. 必须按 current/latest/model name 恢复 historical mapping；
8. restart 只能重新获得 deadline；
9. terminal replay 会重新 mapping/Provider/upstream；
10. malformed v3 只能 fallback legacy 才能运行；
11. 需要把 private reasoning、Endpoint、Credential 或 raw mapping 写入 Evidence/日志；
12. 120 项无法逐项绑定真实 test/evidence；
13. 需要硬编码 `executed_at_dfi53_stage_closure` 或资源 0；
14. 真实进程只能用 direct method/throw/删库/sleep 冒充；
15. 现有生产逻辑发现缺陷，需要语义 repair；
16. DFI-5.3.1～5.3.3 historical evidence 必须覆盖才能通过；
17. 发现未授权 Desktop/Admin/TGM/Knowledge/Agent Lifecycle 代码混入；
18. root/Central 门禁失败来自并发窗口且无法安全归因。

## 12. 当前状态与后续授权

```text
DFI-5.3                       PLAN REVIEW PASS/CLOSED
DFI-5.3.1                     PASS/CLOSED
DFI-5.3.2                     PASS/CLOSED
DFI-5.3.3                     PASS/CLOSED
DFI-5.3.4                     PASS/CLOSED
DFI-5.4                       GATED
TGM / Knowledge Provider      GATED
Agent Lifecycle               GATED
Desktop/Admin v2 consumption  GATED
production SubmitTurn v1a3    UNREACHABLE / 0
production Gateway v1a3       ROUTE COUNT = 0
production Local Max          RELEASE COUNT = 0
production Enterprise Max     RELEASE COUNT = 0
Desktop Max UI                UNREACHABLE / 0
```

独立 QA 已通过（P0～P3 全 0）并由用户正式接受，DFI-5.3.4 与 DFI-5.3 父阶段现已 `PASS/CLOSED`。本次关闭
只确认 `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`，不代表 production ready；DFI-5.4 与全部下游不得
自动解锁。

## 13. 独立评审问题

1. 是否接受 DFI-5.3.4 为 closure-only，不新增生产 mapping 能力；
2. 是否接受 Local 与 Enterprise 分成两套真实子拓扑、由一个聚合 Harness 共同关闭；
3. 是否接受真实 Core/Central child、SIGKILL、新 PID、SQLite reopen 为必要证据；
4. 是否接受 production-disabled / incomplete fail-fast / test-only complete 三态 cutover；
5. 是否接受父方案 120 项必须形成 item-level execution ledger，historical evidence 不能替代实际回归；
6. 是否接受未安装 boolean/bounded variant 的父矩阵项以 strict reject/unknown 通过；
7. 是否接受 request-sent/output-started 窗口保留既有 at-least-once / resume unavailable 诚实语义；
8. 是否接受三轮 semantic replay 保留 exact lock/mapping/deadline/Usage 权威字段；
9. 是否接受 80 次负向泄漏注入与 14 类真实资源归零；
10. 是否接受最高只输出 `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT` 并附全部 readiness false；
11. 是否接受无生产语义变化时只允许最小 content-free diagnostic seam；
12. 是否接受 3～5 个集中工程日估算与四步交付。

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
CODING AUTHORIZED = true
```
