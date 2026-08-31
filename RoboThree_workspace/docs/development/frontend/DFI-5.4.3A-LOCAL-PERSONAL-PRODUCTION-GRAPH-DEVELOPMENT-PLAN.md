# DFI-5.4.3A Local Personal Production Graph 聚焦实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-28  
> 负责人：Codex 5.6  
> 触发来源：[DFI-5.4.3 实施停手报告](./DFI-5.4.3-RENDERER-MAX-UI-IMPLEMENTATION-STOP-REPORT.md)  
> 上游：DFI-5.4.1～5.4.2、R2D-P.1～P.3、PRA-1～PRA-3、DFI-5.3 `PASS/CLOSED`  
> 父批：DFI-5.4.3 已获编码授权，但因详细方案 §16 #10 暂停；本子批通过评审和单独恢复编码授权前不得继续生产代码  
> 明确不包含：migration、第三方依赖、公共 Personal Model CRUD/Reveal、Enterprise/DeepSeek Max、Gateway production route、TGM、Knowledge Provider、Agent Lifecycle、Admin v2

## 0. 结论先行

DFI-5.4.3 已完成 Renderer Max UI、Safe Preview 消费、Task Reasoning 只读投影与 Desktop transport 增量，但无法
安全打开 production gate。现有 Desktop bootstrap 仍以 `agent.fixture.desktop-scripted` / `model.desktop-scripted`
作为非 demo 运行图，且 production `Dfi541SubmitTurnHandler` 实现数为 0。直接把 gate 改成 `true` 会让测试
Provider、测试 Agent 或测试 identity 冒充产品能力，故已按父方案停手。

本聚焦子批只关闭这一条缺口：建立**唯一、可恢复、默认不依赖 Fixture 的 Local Personal production graph**。
它复用既有 Personal Model SQLite facts、Local Desktop subject authority、R2D-P.2 entitlement、PRA-3 admitted
policy/manifest/materializer、DFI-5.3 release-pinned mapping 与 DFI-5.4.1 durable acceptance，不创建第二套选择、
mapping、coordination 或 Provider 状态机。

冻结后的主链：

```text
Desktop v1alpha5 SubmitTurn
  → unique Dfi543LocalPersonalSubmitTurnHandler
  → shared R2D resource planning kernel
  → Local Desktop exact subject + Personal Model exact lock
  → PRA-3 exact policy / manifest / subject materialization
  → ReasoningModeLock v1alpha2 + Runtime Selection v1alpha4
  → existing coordination v1alpha5 / DFI541 Task bundle atomic commit
  → task_committed / completed
  → DurableAgentLoopStarter
  → task-pinned release reconstruction
  → ReleasePinnedReasoningMappingRegistry
  → DurableLocalPersonalModelProvider
  → LocalPersonalOpenAiCompatibleModelProvider
```

本批最高只允许输出：

```text
DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_CONFORMANT
```

它不等于正式安装包已具备 Personal Model 创建或 Secret 录入能力，也不等于所有模型支持 Max。现有
DFI-4A.4 preflight 已确认 production helper packaging 尚未关闭；因此正常产品没有 verified Credential helper
或没有合法 Personal Model 时，Compatibility 必须返回 `runtime_dependencies_unavailable`，不得使用 Fixture、
空 Secret、scripted model 或测试 Keychain 补位。

## 1. 当前工程事实

### 1.1 已存在且必须复用

1. `SqlitePersonalModelPersistence` 已使用 migration 23 的 owner namespace / definition / head / status /
   preference / operation / receipt，启动时复用既有 schema preflight；
2. `SqliteLocalPersonalModelInvocationPersistence` 已使用 migration 24 的 invocation link / timeout / Usage facts；
3. `SqliteDesktopReasoningModePreferencePersistence` 已使用 migration 26，Preference owner domain 与 Personal
   Model owner domain 独立；
4. `LocalDesktopSubjectAuthorityV1` 已冻结 `local_desktop_owner`、独立 HMAC domain 和
   `productionLocalAuthorityReady=true / productionEnterpriseIdentityReady=false / testIdentityUsed=false`；
5. R2D-P.2 已提供唯一 production `TaskResourceEntitlementSource`、一次性 subject proof、bounded acceptance
   lease、`agent.general` 与真实 Registry intersection；
6. PRA-3 已提供一个 code-owned OpenAI GPT-5.2 exact admitted policy、immutable conformance manifest 与 admitted
   capable materializer；DeepSeek 继续 `requires_mapping_revision`；
7. DFI-5.3 已提供 sealed Local Personal projection、`ReleasePinnedReasoningMappingRegistry`、Task-locked mapper、
   durable timeout、Usage 与 Provider recovery；
8. DFI-5.4.1 已提供 Runtime Selection v1alpha4、coordination v1alpha5、ReasoningModeLock v1alpha2、accepted-plan
   envelope、DFI541 Task bundle 原子提交；
9. DFI-5.4.2 已提供六条 Core private route、六个 Main IPC channel、restart lease revalidation 与 frozen sandboxed
   Preload API；
10. DFI-5.4.3 partial 已提供 strict Task Reasoning read model、Renderer Adapter、单一 Max switch 与 safe summary。

### 1.2 真实缺口（本子批的唯一原因）

| 缺口 | 当前代码事实 | 本子批关闭方式 |
| --- | --- | --- |
| Submit handler | `Dfi541SubmitTurnHandler` 只有 interface，production implementation=0 | 新增唯一 production handler，复用既有四阶段 coordination |
| Executable bundle | `PersistedExecutableSubmitTurnTaskBundle` 未包含 DFI541 bundle | additive 扩宽 Core-private readable union，single dispatch |
| Runtime resolver | `TaskLockedModelProviderResolver` Port 的 `runtimeSelection` 类型仍只收 v1alpha2；具体 Runtime Adapter 按 exact capability lock 解析且当前未消费 selection 内容 | 只在 Core-private Port / normalized view 上 additive 接受 v1alpha4，不改 public Contract |
| Request materializer | `TaskReasoningRequestMaterializer` 只收 v1alpha2 | 先 normalize v1alpha2/v1alpha4 为单一 reasoning view，再走唯一公式 |
| Provider graph | `DurableAgentLoopStarter` 非 demo 仍以 scripted Provider 为默认 | non-demo 必须从 exact Task lock 解析 Local Personal Provider；scripted 只留 demo/fixture |
| Personal persistence | Desktop bootstrap 未 start/stop Personal Model、Invocation、Reasoning Preference SQLite adapters | 接入同一 database path 的既有 adapters，严格生命周期 |
| Admission source | 没有 production `Dfi541ExactSubjectAdmissionInputSource` | 从 exact locked subject 和历史 immutable facts 构造，不枚举预装用户 release |
| Mapping recovery | admitted release 只在 materialization 返回值中，restart 后无 task-pinned source | 用 durable lock/evidence 重构 exact release并逐项比对，不读取 current pointer |
| Credential runtime | production Broker handler仍拒绝，verified helper packaging 未完成 | 本批不伪造；缺 verified runtime 时 feature unavailable；test fixture 不能变 production ready |
| Bootstrap | `create-desktop-private-runtime.ts` 非 demo graph仍注册 scripted Agent/Model | final composition 分离 production graph与 explicit demo graph |

### 1.3 本批不解决的已知边界

- DFI-4A.4 public Personal Model list/CRUD/reveal、Renderer Secret transport 与安装包 helper manifest继续 GATED；
- 本批可以读取既有 Personal Model durable facts并调用既有 Credential Port，但不能新增创建/编辑/Reveal API；
- 若正式 Credential 调用必须修改 helper packaging、签名、公证或敏感 Renderer transport，立即按 §13 停手，转回
  DFI-4A.4 独立评审；
- Enterprise identity/entitlement/Gateway、DeepSeek、其他 OpenAI snapshot 均不进入本批。

## 2. G1：单一 final production composition

新增 Core-private `Dfi543LocalPersonalProductionComposition`（最终名称可按现有命名风格调整），只允许由 Desktop
bootstrap 构造一次。结构图必须 exact 含以下 16 项，缺失或重复在 HTTP ready 前 fail-fast：

1. `SqlitePersonalModelPersistence`；
2. `SqliteLocalPersonalModelInvocationPersistence`；
3. `SqliteDesktopReasoningModePreferencePersistence`；
4. `PersonalCredentialStore` 与 content-free readiness probe；
5. Local Desktop subject authority；
6. R2D-P.2 production entitlement / acceptance authority / Planner kernel；
7. code-owned PRA-3 admitted policy source；
8. immutable conformance manifest；
9. exact subject admission input source；
10. exact subject-bound materializer；
11. task-pinned release reconstructor；
12. release-pinned Profile / mapping source；
13. `ReasoningModeLockPlannerV1Alpha2`；
14. 唯一 `Dfi541SubmitTurnHandler`；
15. task-locked Local Personal Provider resolver与durable timeout/Invocation persistence；
16. Preview / Preference / v1alpha5 API / Task Reasoning projection。

冻结规则：

- 不修改 DFI-5.4.1 historical `DFI541_MAX_CORE_DEFAULT_ENABLED=false`、installed count=0 或 helper行为；
- 新建 DFI-5.4.3 code-owned structural decision，禁止 env、CLI、Admin、Renderer、远端配置打开；
- `enabled=false` 时不构造半张 production graph；`enabled=true` 且结构依赖缺失时 HTTP ready 前 fail-fast；
- 结构完整与用户数据可用是两层事实：没有 Personal Model或verified Credential runtime不使 Core崩溃，但 Max
  Compatibility 必须为 `runtime_dependencies_unavailable`；
- production bootstrap preinstalled user subject release count始终为0；release只在首次 SubmitTurn对 exact locked
  subject即时物化；
- `agent.fixture.desktop-scripted`、`model.desktop-scripted`、InMemory Credential/Personal Model adapter只允许
  explicit demo/test composition；non-demo source graph出现任一即 boundary failure。

## 3. G2：Persistence 与 Credential 生命周期

### 3.1 SQLite lifecycle

三个新接入 adapter使用同一个既有 `databasePath`，但各自保留现有 connection、preflight与防御设置：

```text
start order
  Conversation / Foundation / Task / Coordination
  → Personal Model
  → Local Personal Invocation
  → Desktop Reasoning Preference
  → structural graph validation
  → recovery
  → HTTP server ready

stop order = reverse start order
```

任一 adapter start失败时，已启动 adapter按逆序关闭；不得留下 listener、statement、database handle或临时 key。
不得新增 migration 27、表、索引或 durable cursor；migration 23/24/26不够时立即停手。

### 3.2 Credential readiness

- production graph只依赖 `PersonalCredentialStore` Port，不把Secret带入composition或diagnostics；
- `MacOsKeychainPersonalCredentialStore.productionReady` 只在 existing trust verifier验证包内路径、regular file、
  manifest digest、designated requirement与Team ID后为true；
- 未提供descriptor、descriptor漂移、helper不可用或Keychain不可用时，Compatibility/Preview返回安全 unavailable，
  Credential resolve count与upstream request count保持0；
- 受控E2E可以使用 `activation="test_isolated"` +临时Keychain，但evidence必须同时写
  `testCredentialRuntimeUsed=true / productionCredentialRuntimeReady=false`，不得宣称production ready；
- 本批不修改Renderer→Main敏感transport，不创建Secret，不Reveal，不把测试Secret放进SQLite、HTTP、日志或Evidence。

## 4. G3：Local execution authority，不扩张 CRUD authority

现有 `PersonalModelOwnerAuthority` 继续只表达 `runtime_active_enterprise_identity` 的 configure/use/reveal/delete
语义，不把 `local_desktop_owner` 塞入该对象。新增 Core-private execution-only discriminated union：

```text
TaskLockedPersonalModelExecutionAuthority =
  | { authorityKind: "runtime_active_enterprise_identity", ...historical }
  | { authorityKind: "local_desktop_owner", ownerIdentity, authorityRevision,
      productionLocalAuthorityReady: true,
      productionEnterpriseIdentityReady: false,
      testIdentityUsed: false }
```

Local variant只能用于：

- R2D首次接受时读取 exact Personal Model facts；
- Task lock验证；
- Provider invocation前验证owner scope；
- cold recovery从durable lock重建execution identity。

它不能授权 configure/reveal/delete，不能投影enterprise ready，不能从OS用户名、固定activeUserId、Main/Renderer
自报ID派生。`CompositeModelProviderResolver` 若需扩宽，只能扩宽 execution-only input；旧 enterprise resolver与
Personal Model CRUD authority字节/行为保持不变。

## 5. G4：Exact admission 与 task-pinned release

### 5.1 首次接受

唯一 production `Dfi541ExactSubjectAdmissionInputSource` 在首次接受阶段按以下顺序恰好读取：

1. exact active owner namespace；
2. exact model lock中的configuration identity；
3. exact immutable definition revision；
4. exact head与status（证明首次接受时仍可用）；
5. exact Credential observation（只读metadata，不resolve Secret）；
6. exact Personal Model provider profile；
7. PRA-3 code-owned exact policy与manifest；
8. materializer产出admitted release；
9. release/profile/strategy/mapping/materialization refs与DFI541 planner input逐项一致；
10. 仅把safe admission evidence和lock refs写入existing durable plan/bundle。

不得遍历全部用户模型、按display name猜model、切到current policy或预装全局release。

### 5.2 冷恢复与执行

新增 `TaskPinnedReasoningReleaseResolver`（名称可调整）分离两条路径：

- `materializeForAcceptance`：允许读取上节 current acceptance facts；
- `reconstructForExecution`：只使用 durable Model lock、exact immutable definition、code-owned policy/manifest与
  durable admission evidence重算release；禁止读取current head、current preference、current profile pointer、
  current mapping alias或重新做选择。

重构后的 release 必须同时匹配：

- ReasoningModeLock profile/strategy refs；
- safe admission evidence的policy/profile/strategy/mapping/manifest/materialization digests；
- Task model lock digest、adapter descriptor revision、execution definition digest；
- durable timeout policy identity。

任一缺失/漂移返回typed fail-closed，Credential/DNS/socket/TLS/HTTP body/Invocation prepare/Usage/Loop均为0。
允许bounded in-memory cache，但key只能是durable materialization digest；cache miss必须重构，cache不能成为authority，
restart后cache为空不改变语义。

重构成功后每次为exact release构造 `ReleasePinnedReasoningMappingRegistry([release])` 或等价sealed source；不得建立
`current/latest/fallback` registry。

## 6. G5：唯一 DFI541 SubmitTurn handler

新增唯一 production `Dfi543LocalPersonalSubmitTurnHandler implements Dfi541SubmitTurnHandler`。它必须复用现有
coordination v1alpha5与Persistence方法，不新增第二套状态机：

```text
new command
  validate request / command identity
  → load exact Desktop session
  → capture Local subject proof once
  → shared R2D resource planning kernel once
  → plan ReasoningModeLock v1alpha2 once
  → create DurableDfi541AcceptancePlanV1
  → prepare Message intent
  → prepareAcceptedDfi541

progress/recovery
  accepted          → append prepared Message
  message_appended  → commitDfi541SubmitTurnTaskBundle atomically
  task_committed    → complete coordination + Receipt + Delivery
  completed         → start Agent Loop once
```

关键约束：

1. 从 `R2D3DurableAcceptancePlanner` 提取或复用单一resource planning kernel；不得复制 entitlement/intersection/
   authorization/tool-policy 真值表，也不得把v1alpha5降级成legacy SubmitTurn再“补”reasoning；
2. `accepted` 前Agent/Entitlement/Preference/Registry/Workspace/Auth/Tool Policy与Reasoning Profile各按方案规定次数
   读取；accepted后恢复这些current authority读取增量全0；
3. `task_committed` 前Provider resolve、Credential Secret resolve、DNS/socket/TLS、HTTP body、Model Invocation Link、
   Usage与Agent Loop调用数全0；
4. Task、Model/Tool locks、Runtime Selection v1alpha4、Authorization、ReasoningModeLock、Task Instruction Binding、
   admission/resolution evidence继续由existing DFI541 Task bundle transaction原子提交；
5. response loss、restart与同command replay只读取durable envelope/bundle/receipt，不重新选择Agent/Model/Skill/
   Tool/Knowledge；
6. existing command requestDigest不一致返回conflict；同一clientTurn映射不同command同样conflict；
7. terminal replay不重新materialize release、不resolve Provider、不启动Loop；
8. `agent.general`是唯一production Agent；scripted fixture只存在explicit demo graph。

## 7. G6：Executable bundle、Request 与 Agent Loop cutover

### 7.1 Core-private readable union

`PersistedExecutableSubmitTurnTaskBundle` additive包含 `PersistedDfi541SubmitTurnTaskBundle`，InMemory/SQLite
`loadExecutableSubmitTurnTaskBundle`按durable schema单次dispatch：

- 不先试legacy失败再试DFI541；
- 不按JSON是否含`reasoningModeLock`猜版本；
- 损坏v1alpha5 bundle不fallback旧版本；
- v1/v2/v3历史bundle行为零漂移。

### 7.2 单一 reasoning request materializer

`TaskReasoningRequestMaterializer`先把Runtime Selection v1alpha2/v1alpha4规范化为一个Core-private
`TaskLockedReasoningRequestView`，再使用唯一ModelRequest v1alpha2公式。禁止复制digest或variant真值表。

default/fallback必须body-level完全省略reasoning/effort/thinking/budget；`max_applied`只能使用durable lock中的exact
strategy。Context Receipt的`modelRequestDigest`继续精确等于最终v2 request digest。

### 7.3 Task-locked Provider

`TaskLockedModelProviderResolver` additive接受v1alpha4 readable selection并严格校验exact model lock。non-demo
`DurableAgentLoopStarter`不得持有scripted Provider作为fallback：

- assistant首轮、Tool continuation、Compaction都通过同一个task-locked resolver；
- Provider resolve后注入由task-pinned release构造的mapper；
- 三类调用复用同一mapping digest与durable deadline；
- `AgentLoopCoordinator`若保留default model参数，该参数只能用于explicit demo graph；production缺resolved model
  必须fail-closed，不调用scripted model；
- late callback、AbortController、stream iterator、Credential bytes、mapping registry、SQLite handle全部可收敛。

## 8. G7：Activation 与 Compatibility

DFI-5.4.3A区分三个状态：

| 状态 | 启动 | Compatibility / Submit |
| --- | --- | --- |
| structural gate=false | 不构造production graph | `production_gate_disabled`；不得部分暴露Max |
| gate=true但结构依赖缺失/重复 | HTTP ready前fail-fast | 无对外空窗口 |
| graph完整但用户runtime不可用 | Core可ready | `runtime_dependencies_unavailable`；default旧路径按既有Contract可用性执行，不fallback fixture |
| graph完整且exact Personal Model/Credential可用 | Core ready | v1alpha5 `available/ready`；只允许exact admitted Local path |

用户runtime不可用包括：无active namespace、无合法Personal Model、head/status漂移、Credential observation缺失、
verified helper不可用、模型不在exact admitted allowlist。Compatibility probe只返回safe enum，不暴露modelId、Endpoint、
Credential ref、path、digest或Keychain状态细节。

`runtime_dependencies_unavailable` 已存在于冻结的 Desktop Local v1alpha5 Compatibility `reasonCode` enum。本批只负责
在 runtime readiness 不满足时返回该既有typed value；不得修改、扩写或重新发布v1alpha5 public Contract。

activation顺序：

1. complete graph先在test-only composition构造；
2. handler/persistence/provider/recovery focused测试通过；
3. 真实Core child + SQLite reopen +受控TLS/SSE +隔离Keychain fixture通过；
4. historical harness/evidence零漂移；
5. 才允许将DFI-5.4.3 code-owned structural decision设为true；
6. 从零复跑全部门禁；
7. production normal run仍按runtime readiness决定`ready`或`runtime_dependencies_unavailable`。

## 9. 生命周期与并发矩阵

至少覆盖下列12个窗口：

| 窗口 | 崩溃/并发点 | 恢复要求 |
| --- | --- | --- |
| L1 | subject proof前 | 无durable side effect，可同command重试 |
| L2 | exact admission后、accepted前 | release未成为durable authority，零Provider |
| L3 | accepted后 | 复用accepted plan，current authority reads=0 |
| L4 | message_appended后 | Message恰1，复用plan |
| L5 | Task bundle transaction中 | 全回滚或全提交 |
| L6 | task_committed后、complete前 | Provider/Loop仍0 |
| L7 | completed后、Loop start前 | Receipt/Delivery恰1，Loop可恢复启动一次 |
| L8 | Provider dispatch_claimed后 | 复用Invocation Link与deadline；按既有resume语义处理 |
| L9 | output_started后 | 不自动重复上游；typed resume unavailable |
| L10 | Tool continuation前后 | 同release/mapping/deadline |
| L11 | Compaction前后 | 同release/mapping/deadline |
| L12 | terminal Message已提交后 | upstream/materializer/mapping/Usage增量0 |

每个窗口必须使用named deterministic barrier；不得用`sleep`猜时序、`throw`冒充SIGKILL、删库冒充reopen或自动retry
掩盖失败。三轮fresh-process replay必须产生同一semantic digest；PID、port、临时路径、墙钟和transport nonce排除，
Model lock、release、mapping、deadline、Receipt与Task summary保留。

## 10. 安全、泄漏与资源归零

统一scanner继承DFI-5.4.2/5.4.3已有canary并扩展检查：Secret bytes、Authorization/Cookie、Credential ref、真实
Endpoint、workspace real path、owner digest、configurationRef、request/selection/mapping digest、thinking/reasoning
private delta、stack/Zod path、transport identity。

执行80次负向注入：5类canary × 4种编码（plain/url/base64/hex）× 4通道（stdout/stderr/evidence/failure）。每次必须
精确检出，正常四通道命中0。

真实诊断至少记录并最终归零：SQLite handles、prepared statements、HTTP servers、sockets、TLS sessions、stream
iterators、AbortControllers、timers、Core children、native helper children、Credential byte buffers、subject proofs、
acceptance leases、task-pinned release caches、mapping registries、listeners、late callbacks。禁止`?? 0`、缺字段当0、
硬编码0或parent盲信child。

## 11. Focused QA 矩阵（96项）

### 11.1 Composition / persistence（QA-001～QA-016）

1. QA-001 gate=false不构造graph；2. QA-002 graph依赖缺失fail-fast；3. QA-003 duplicate handler fail-fast；
4. QA-004 exact16项graph；5. QA-005 Personal Model SQLite start；6. QA-006 Invocation SQLite start；
7. QA-007 Preference SQLite start；8. QA-008 reverse stop；9. QA-009 partial start cleanup；
10. QA-010 migration max=26；11. QA-011 lockfile digest不变；12. QA-012 no new dependency；
13. QA-013 no scripted production Agent；14. QA-014 no scripted production Model；15. QA-015 demo graph隔离；
16. QA-016 HTTP ready after graph validation。

### 11.2 Authority / admission / release（QA-017～QA-032）

17. QA-017 local authority exact；18. QA-018 enterprise flag false；19. QA-019 test flag false；
20. QA-020 CRUD authority未扩张；21. QA-021 subject proof single-use；22. QA-022 namespace key清零；
23. QA-023 definition exact revision；24. QA-024 head/status exact；25. QA-025 Credential observation metadata-only；
26. QA-026 policy exact model allowlist；27. QA-027 manifest exact；28. QA-028 materialized release deterministic；
29. QA-029 bootstrap preinstalled release=0；30. QA-030 DeepSeek not admitted；31. QA-031 no display-name guess；
32. QA-032 admission drift upstream=0。

### 11.3 Durable handler / coordination（QA-033～QA-048）

33. QA-033 unique production handler count=1；34. QA-034 shared resource kernel；35. QA-035 no legacy translation；
36. QA-036 request identity conflict；37. QA-037 accepted envelope exact；38. QA-038 Message intent before accept；
39. QA-039 Message exactly once；40. QA-040 DFI541 bundle atomic；41. QA-041 task_committed barrier；
42. QA-042 complete Receipt exactly once；43. QA-043 Delivery exactly once；44. QA-044 Loop start after complete；
45. QA-045 recovery authority reads=0；46. QA-046 response loss same receipt；47. QA-047 terminal replay Loop delta=0；
48. QA-048 old coordination single-dispatch zero drift。

### 11.4 Bundle / request / Provider（QA-049～QA-064）

49. QA-049 executable union includes DFI541；50. QA-050 damaged v1alpha5 no fallback；51. QA-051 v1/v2/v3 zero drift；
52. QA-052 single normalized reasoning view；53. QA-053 default body omission；54. QA-054 fallback body omission；
55. QA-055 max exact strategy；56. QA-056 Receipt digest equals request digest；57. QA-057 v1alpha4 resolver exact lock；
58. QA-058 release reconstruction exact；59. QA-059 cache not authority；60. QA-060 assistant same release；
61. QA-061 Tool same release；62. QA-062 Compaction same release；63. QA-063 restart same deadline；
64. QA-064 terminal replay upstream/Usage=0。

### 11.5 Availability / credential / lifecycle（QA-065～QA-080）

65. QA-065 gate disabled reason；66. QA-066 runtime dependencies unavailable consumes existing frozen v1alpha5 enum and public Contract zero drift；67. QA-067 no model unavailable；
68. QA-068 helper missing unavailable；69. QA-069 helper drift unavailable；70. QA-070 exact admitted ready；
71. QA-071 no fixture fallback；72. QA-072 test helper not production ready；73. QA-073 Secret four-channel zero；
74. QA-074 real Core child；75. QA-075 real SQLite reopen；76. QA-076 real TLS/SSE fixture；
77. QA-077 real SIGKILL/new PID；78. QA-078 12 lifecycle windows；79. QA-079 three semantic replays；
80. QA-080 authoritative drift changes digest or typed fail-close。

### 11.6 Boundary / regression / evidence（QA-081～QA-096）

81. QA-081 DFI541 historical helper unchanged；82. QA-082 DFI541 evidence unchanged；83. QA-083 DFI542 evidence unchanged；
84. QA-084 R2D-P.2/P.3 evidence unchanged；85. QA-085 PRA-3 evidence unchanged；86. QA-086 DFI-5.3.4 evidence unchanged；
87. QA-087 Renderer/Main无private mapping；88. QA-088 public Contract无raw mapping/Secret；
89. QA-089 Enterprise route count=0；90. QA-090 TGM/Knowledge/Agent Lifecycle/Admin v2 zero change；
91. QA-091 DFI-4A.4 CRUD/Reveal zero change；92. QA-092 80 negative detections；93. QA-093 normal four-channel zero；
94. QA-094 real resources all zero；95. QA-095 no skip/only/Disabled/sleep/auto retry；
96. QA-096 outcome exact且无PRODUCTION_READY。

## 12. 实施步骤与估算

### Step 1：Composition / persistence / execution authority（1～2日）

- final composition与三态startup；
- Personal/Invocation/Preference persistence生命周期；
- execution-only local authority；
- explicit demo/production graph隔离。

### Step 2：Exact admission / task-pinned release（1～2日）

- exact admission input source；
- acceptance materialization与cold reconstruction；
- release-pinned Profile/mapping source；
- Credential/runtime readiness safe probe。

### Step 3：Unique handler / durable recovery（2～3日）

- shared R2D resource planning kernel；
-唯一DFI541 handler；
- existing coordination与Task bundle transaction；
- response loss/restart/replay矩阵。

### Step 4：Agent Loop / Provider / focused closure（1～2日）

- executable bundle与runtime-selection readable union；
- request materializer normalization；
- task-locked Local Provider及Tool/Compaction复用；
-真实Core/SQLite/TLS-SSE/isolated Keychain fixture、Harness/Evidence/报告。

细化估算：**5～8个集中工程日**。它替代父方案Step 3的2～3日粗估；增加量来自production handler此前为0、
executable bundle/runtime resolver尚未接受v1alpha4、restart后需要durable task-pinned release重构，以及Credential
runtime必须诚实区分test fixture与production readiness。

DFI-5.4.3A关闭后，父批仍需完成真实Electron Renderer DOM与DFI-5父账本收口；不得把本子批Harness冒充父批
全部E2E。

## 13. 停手条件

发现任一情况立即停止并回评审：

1. 必须修改public v1alpha1～v1alpha5 request/receipt/API；
2. 必须新增migration 27、表或索引；
3. 必须新增第三方依赖或改变lockfile；
4. 必须修改Reasoning lock/selection/coordination/mapping/request digest公式；
5. 必须复制R2D resource intersection或另建coordination状态机；
6. 必须按current/latest/alias/display name重建release；
7. cold recovery必须读取current Preference/head/status/mapping pointer才能继续；
8. accepted后恢复会重新选择Agent/Model/Skill/Tool/Knowledge；
9. task_committed前必须resolve Secret/Provider或创建Invocation Link；
10. non-demo production graph必须保留scripted Agent/Model fallback；
11. 必须用fixed activeUserId、OS用户名、Renderer/Main自报或test identity充当authority；
12. 必须把local authority扩张为configure/reveal/delete权限；
13. 必须将test-isolated helper、临时Keychain或loopback Endpoint声明为production ready；
14. production credential可用必须修改helper packaging、签名、公证或敏感Renderer transport；
15. 必须打开DFI-4A.4 CRUD/Reveal才能完成本批；
16. default/fallback必须发送low/minimal/off/disabled；
17. 必须打开Enterprise Gateway、enterprise entitlement、CPC、DeepSeek或其他模型release；
18. 必须进入TGM、Knowledge Provider、Agent Lifecycle或Admin v2；
19. historical Evidence必须改写才能通过；
20. 真实E2E必须使用公网、真实用户Key或收费调用；
21. 只能用JSDOM/direct method/body mock冒充Core/Provider lifecycle；
22. root/Central失败来自共享并发窗口且无法安全隔离。

## 14. 允许文件与禁止边界

### 14.1 预计允许（编码获单独授权后）

- `services/core/src/application/**` 中DFI543 composition/handler/release resolver及必要的Core-private additive
  readable-union接缝；
- `services/core/src/bootstrap/create-desktop-private-runtime.ts` 与 `desktop-private-main.ts` 的composition wiring；
- 既有SQLite adapter的composition引用，不改变写语义；
- `services/core/tests/**`、`tests/e2e/**`、`scripts/run-dfi5.4.3a-*`、`artifacts/dfi543a/**`；
- root/Core/Desktop版本、Harness命令、README/CHANGELOG/DEVELOPMENT-LOG与实施报告。

### 14.2 禁止

- `packages/contracts/src/**`；
- migration、依赖与lockfile；
- Personal Model public CRUD/Reveal Contract、Main/Preload/Renderer敏感transport；
- production helper packaging/signing/notarization；
- Enterprise/Central Provider production route；
- TGM、Knowledge Provider、Agent Lifecycle、Admin v2；
- DFI-5.3/5.4.1/5.4.2 historical Evidence与Harness覆盖写。

## 15. 开发门禁（编码后）

```text
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
CI=true pnpm run harness:dfi5.4.3a
CI=true pnpm run harness:dfi5.4.2
CI=true pnpm run harness:dfi5.4.1
CI=true pnpm run harness:r2dp3
CI=true pnpm run harness:r2dp2
CI=true pnpm run harness:pra3
CI=true pnpm run harness:dfi5.3.4
CI=true pnpm run harness:r2d4
CI=true pnpm run typecheck
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central:offline
```

历史Harness/Evidence必须只读不漂移；若环境无法提供JDK21或真实loopback/Keychain fixture，实施报告必须明确
留给独立QA补跑，不得伪报PASS。

## 16. 当前状态与评审问题

```text
DFI-5.4.1～5.4.2                    PASS/CLOSED
DFI-5.4.3                           PARTIAL IMPLEMENTATION / RESTORE AUTHORIZATION PENDING
DFI-5.4.3A                          PASS/CLOSED
production DFI-5.4 Max              false
production Local subject path       structural graph incomplete
production Credential runtime       unavailable unless verified descriptor exists
production Gateway / Enterprise Max false / route count=0
DFI-4A.4 CRUD/Reveal                 GATED
TGM / Knowledge / Agent Lifecycle / Admin v2 GATED
```

请独立评审重点回答：

1. 是否接受DFI-5.4.3A只补production graph，不重写Renderer UI或public Contract？
2. 是否接受保留`PersonalModelOwnerAuthority` enterprise-only，另建execution-only local authority？
3. 是否接受从R2D3 Planner提取单一resource planning kernel，禁止v1alpha5翻译成legacy路径？
4. 是否接受首次接受读取current exact facts，恢复只从durable lock/evidence重构task-pinned release？
5. 是否接受production bootstrap不预装用户release，active subject release按Task即时物化？
6. 是否接受non-demo Agent Loop彻底移除scripted Provider fallback？
7. 是否接受结构graph complete与用户runtime available分层，无Personal Model/helper时返回
   `runtime_dependencies_unavailable`而不使Core启动失败？
8. 是否接受test-isolated Keychain/TLS fixture只能证明lifecycle，不能宣称production helper ready？
9. 是否接受helper packaging/签名若成为必需修改则停手转DFI-4A.4，而不藏入本批？
10. 是否接受5～8日替代父方案Step 3的2～3日粗估？
11. 是否确认DFI-5.4.3A关闭不等于DFI-5.4.3或DFI-5全线关闭？
12. 是否确认Enterprise/DeepSeek/TGM/Knowledge/Agent Lifecycle/DFI-4A.4 CRUD/Admin v2继续GATED？

独立文档复核、编码、开发者门禁、独立代码QA及聚焦精度修订均已完成；用户已正式接受最终独立QA结论，
DFI-5.4.3A现为`PASS/CLOSED`。该关闭只确认Local Personal production graph conformance，不代表真实Credential
runtime或DFI-5.4.3父批已经关闭；父批剩余Renderer Max UI、Safe Preview、真实Desktop E2E与DFI-5阶段Closure
仍须用户单独恢复授权后方可继续。
