# DFI-5.2.3 ModelRequest / Compaction Binding v1alpha2 与 Lifecycle Harness 详细实施方案

> 状态：**REVISION 0 / PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 上游：DFI-5.0、DFI-5.1、DFI-5.2 Revision 1、DFI-5.2.1、DFI-5.2.2 均已 `PASS/CLOSED`  
> 本批最高输出：`DFI52_TASK_REASONING_LOCK_CONFORMANT`  
> 下游：DFI-5.3～5.4、AAPI-0.3～0.4、TGM、Knowledge Provider 继续 `GATED`

## 0. 目标与结论边界

DFI-5.2.3 只负责把 DFI-5.2.2 已原子物化的 `TaskRuntimeSelection v1alpha2 + ReasoningModeLock`
接入 Core 既有 Model Request、Agent Loop、Tool 后续轮、Compaction、retry、restart 与 terminal replay：

```text
reasoning-aware Task bundle（已持久化）
  -> exact Runtime Selection v1alpha2 / Model lock / ReasoningModeLock 校验
  -> 单一 TaskReasoningRequestMaterializer
  -> ModelRequest v1alpha2 + final requestDigest
  -> main / Tool next round / continuation 共用同一锁
  -> CompactionExecutionBinding v1alpha2
  -> initial / rolling compaction 共用同一锁
  -> retry / Core restart 读取原锁
  -> terminal replay 零 Provider 调用
```

本批完成后最多允许声明：

```text
DFI52_TASK_REASONING_LOCK_CONFORMANT
```

该输出只证明 provider-neutral 的 Task 锁定语义、ModelRequest/Compaction Binding、全生命周期复用和恢复证据
成立，不表示：

- 任一 production Provider 已把 `locked_max_strategy` 映射为真实 `effort/thinking/budget` 参数；
- production SubmitTurn v1alpha3 route、Main IPC、Preload API 或 Renderer Max 开关已开放；
- Max feature 已 production ready；
- default 模式对应 Provider 永久固定的 Medium、Low 或任何具体档位；
- DFI-5.3～5.4 或其他 GATED 线已解锁。

在 DFI-5.3 完成至少一个真实 Provider 的 exact mapping 前，production SubmitTurn v1alpha3 必须继续不可达。
若 v1alpha2 ModelRequest 误入尚未支持的 production Provider，必须在读取 Credential、DNS、TLS 或上游请求前
返回 typed `reasoning_protocol_unavailable`，不得静默忽略 reasoning material。

## 1. 当前代码事实与实现缺口

### 1.1 已冻结且必须复用

1. DFI-5.2.1 已冻结四种 strict `ReasoningModeLock`、Runtime Selection v1alpha2、SubmitTurn/coordination
   v1alpha3 与独立 private subpath；
2. DFI-5.2.2 已实现唯一 Planner、default Profile load=0、max single-load、stale/unavailable 零 durable
   副作用与 reasoning-aware Task bundle 原子提交；
3. coordination v1alpha3 durable accept 后，recovery 只使用原 `ReasoningModeLock`，不重读 Preference/Profile；
4. 既有 Model Protocol 根入口、`ModelProvider` Port、Context Pipeline、Agent Loop、Compaction Summarizer 与
   Compaction Binding 仍严格使用 v1alpha1；
5. 既有 `DurableAgentLoopStarter` 只调用 legacy `loadSubmitTurnTaskBundle()`，尚未消费 reasoning-aware bundle；
6. 既有 `ModelBackedCompactionSummarizer` 独立构造 v1alpha1 ModelRequest，尚未与 main request 共用
   reasoning materializer；
7. Context Pipeline 先形成 v1alpha1 request/receipt；若后续只替换 request 而不更新 receipt digest，会产生
   `Context receipt.modelRequestDigest != final request.requestDigest`；
8. InMemory/SQLite Compaction Binding 都直接解析 v1alpha1 schema，但 binding JSON 可 additive 承载 v1alpha2，
   无需 migration 27；
9. local personal durable Provider 已具有 migration 25 exact timeout fact；本批不得改变 30s/90s/300s/
   900s timeout 数值，也不得在 restart 时重获 deadline；
10. production Reasoning Profile source 与 raw Provider Strategy mapping 仍不存在，符合 fail-closed 前提。

### 1.2 本批必须关闭的缺口

| 编号 | 当前缺口 | DFI-5.2.3 关闭方式 |
| --- | --- | --- |
| G1 | Model Protocol 只有根入口 v1alpha1。 | 新增 Core-private top-level v1alpha2 与 readable union；根入口仍只表示 v1alpha1。 |
| G2 | ModelProvider/Invocation/Resolver Port 只接受 v1 请求与 v1 selection。 | 只在 Core-private Port widening 为 readable union；公共 Contract 不静默扩张。 |
| G3 | Context Pipeline receipt 绑定的是 materialize 前 v1 digest。 | 新增原子 request/receipt finalizer，一次返回最终 v2 request 与匹配 receipt。 |
| G4 | main、Tool 后续轮和 Compaction 分别构造请求。 | 唯一 `TaskReasoningRequestMaterializer`，禁止复制 lock variant 判断。 |
| G5 | Agent Loop 只读取 legacy Task bundle。 | 新增单一 strict executable bundle loader，按 durable schemaVersion dispatch，不 try/fallback 猜版本。 |
| G6 | Compaction Binding 只有 v1。 | additive v1alpha2 + readable union + InMemory/SQLite 共用 load validator。 |
| G7 | Compaction authorization 尚未绑定 Reasoning lock。 | v2 binding digest 覆盖 lock id/digest 与 protocol version；不得扩大既有授权。 |
| G8 | production Provider 可能以 Zod/generic error 拒绝 v2。 | 统一 typed preflight guard，在任何外部副作用前返回 `reasoning_protocol_unavailable`。 |
| G9 | retry/restart/terminal replay 尚未有 reasoning lifecycle 证据。 | 真实 Core child + SQLite reopen + deterministic barriers 的 lifecycle Harness。 |
| G10 | 父计划 5～8 日未覆盖 Port widening、receipt finalizer、双 Adapter 与进程级 Harness。 | 本详细方案修正为 10～17 个集中工程日。 |

## 2. 冻结架构决策

### 2.1 Model Protocol v1alpha2 只升级顶层 envelope

新增 private export：

```text
@robothree/contracts/model-protocol/v1alpha2
```

该 subpath 提供：

- `ModelRequestV1Alpha2Schema`；
- `ReadableModelRequestSchema = v1alpha1 | v1alpha2`；
- 对应 types 与 version-dispatch digest helper。

固定规则：

1. Contracts 根入口 `ModelRequestSchema` 与 `MODEL_PROTOCOL_VERSION` 继续只表示 v1alpha1；
2. messages/tools/artifacts 复用现有 provider-neutral v1alpha1 子结构；
3. instruction/message 内部 `schemaVersion` 继续为 v1alpha1，本批不批量改写历史 Conversation Message；
4. 只有 top-level request `schemaVersion=v1alpha2`；
5. private subpath 不得进入 Desktop public Contract、Main/Preload/Renderer/Admin bundle；
6. v1alpha1 fixture、digest 与 Provider 行为字节零漂移。

不得把根入口改成 union，也不得让旧业务在不显式选择 private parser 的情况下接受 v1alpha2。

### 2.2 reasoning 是 strict discriminated union

```text
reasoning =
  {
    mode: default_passthrough
    reasoningModeLockId
    reasoningModeLockDigest
  }
  |
  {
    mode: locked_max_strategy
    reasoningModeLockId
    reasoningModeLockDigest
    strategyId
    strategyRevision
    strategyDigest
    timeoutPolicyRef
  }
```

固定映射：

| ReasoningModeLock resolution | ModelRequest reasoning |
| --- | --- |
| `default_passthrough` | `default_passthrough` |
| `max_unsupported_default` | `default_passthrough` |
| `max_capability_unknown_default` | `default_passthrough` |
| `max_applied` | `locked_max_strategy` |

不允许：

- default/fallback 带 Profile、Strategy 或 timeout ref；
- `maxOutputTokens` 表示 reasoning mode；
- raw Provider 参数、budget、header/body field name 进入 ModelRequest；
- Adapter 根据 modelId、Provider 名称或当前 Preference 临时推导 reasoning；
- fallback 在后续轮次因 Profile 变化自动升级为 Max。

### 2.3 v1alpha2 requestDigest 的唯一公式

v1alpha1 digest helper 原样保留。v1alpha2 request material 为除 `requestDigest` 外的完整 strict object：

```text
sha256CanonicalJson({
  schemaVersion: "v1alpha2",
  requestId,
  snapshotId,
  contextSourceDigest,
  model,
  messages,
  tools,
  artifacts,
  maxOutputTokens,
  reasoning
})
```

`schemaVersion` 与完整 reasoning material 进入摘要；不得只把 reasoning lock digest 拼到旧摘要字符串，也不得
改变 v1alpha1 公式。readable validator 必须先按版本 strict parse，再用对应版本 helper 重算。

### 2.4 一个 Materializer，不复制四 variant 判断

新增唯一 Core Application service：

```text
TaskReasoningRequestMaterializer.materialize({
  baseRequestV1Alpha1,
  runtimeSelectionV1Alpha2,
  exactModelLock
}) -> ModelRequestV1Alpha2
```

它必须：

1. strict 验证 Runtime Selection v1alpha2 与完整 ReasoningModeLock；
2. 验证 `reasoningModeLock.taskId == selection.taskId`；
3. 验证 `modelLockRef` 与 selection 的 exact resolved Model lock 一致；
4. 重算 exact Model lock digest；
5. 只从 durable lock 投影两种 request reasoning variant；
6. 计算最终 requestDigest；
7. 不读 Preference/Profile current pointer；
8. 不写数据库、不调用 Provider、不改变 timeout 数值。

main、Tool 后续轮、continuation 和 `ModelBackedCompactionSummarizer` 必须调用该服务。不得在 Agent Loop、
Summarizer、Provider Converter 各自写一份 switch。

### 2.5 Request 与 Context Receipt 必须原子 finalize

新增单一 Application helper：

```text
ReasoningAwareContextRequestFinalizer.finalize({
  preparedContext,
  runtimeSelection,
  exactModelLock
}) -> {
  request: ModelRequestV1Alpha2,
  contextReceipt: ContextAssemblyReceipt with final modelRequestDigest
}
```

固定规则：

- v2 Agent Loop 不得先把 v1 receipt 放入 provenance map，再只替换 request；
- final receipt 的 `modelRequestDigest` 必须精确等于 v2 request digest；
- prompt、tool、artifact、token estimate、budget/compaction decision 仍来自既有 Context Pipeline；
- reasoning metadata 不计入 prompt token budget，不改变 `maxOutputTokens`；
- finalizer 失败时 Provider 调用、invocation link、Message/Tool side effect 均为 0；
- legacy v1 Task 不走该 finalizer，行为零漂移。

### 2.6 Core-private Port widening，不扩张公共面

下列 Core-private seam 改用 readable types：

- `ModelProvider.stream()`；
- `ModelProviderInvocation.modelRequest/runtimeSelection`；
- `TaskLockedModelProviderResolver.resolve()`；
- `AgentLoopCoordinator.buildRequest/buildInvocation`；
- `ContextPreparation` 完成后的内部 final request；
- Compaction Summarizer invocation callback。

约束：

1. readable union 只存在于 Core/Contracts private subpath；
2. legacy v1 callers 无需伪造 Reasoning lock；
3. existing fake/scripted Provider 若用于 v1 回归继续 strict v1；
4. 只有明确标记为 DFI-5.2.3 test-only 的 consumer 可接受并观测 v2；
5. production Provider 在 DFI-5.3 前必须使用共享 fail-closed guard，不得把 generic Zod error 当成已完成映射。

### 2.7 一个 executable Task bundle loader

TaskPersistence 新增 Core-private：

```text
loadExecutableSubmitTurnTaskBundle(commandId)
  -> legacy v1 bundle | reasoning-aware v2 bundle | undefined
```

它按 durable coordination/bundle schemaVersion 作单次 strict dispatch。禁止：

- 先调用 legacy loader，失败后再试 reasoning loader；
- parse 失败时猜另一个版本；
- 按 selection JSON 是否含 `reasoningModeLock` 猜版本；
- 对损坏 v2 bundle fallback v1。

InMemory/SQLite 必须共享同一 readable validator、indexed-vs-JSON 校验和 exact digest 规则。

## 3. CompactionExecutionBinding v1alpha2

### 3.1 strict schema

v1alpha1 保持原样。v1alpha2 保留全部 v1 字段并新增：

```text
schemaVersion = v1alpha2
reasoningModeLockId
reasoningModeLockDigest
modelRequestProtocolVersion = v1alpha2
bindingDigest
```

`bindingDigest` 覆盖除自身外的完整 strict material。新增：

```text
ReadableCompactionExecutionBinding = v1alpha1 | v1alpha2
```

### 3.2 exact binding 不变量

v2 binding 必须同时证明：

1. task/session/compaction job identity；
2. Runtime Selection v1alpha2 ID/digest；
3. exact Model lock ID/digest/capability revision/adapter descriptor revision；
4. exact external target digest 与 summarizer prompt revision；
5. exact ReasoningModeLock ID/digest；
6. `modelRequestProtocolVersion=v1alpha2`；
7. Reasoning lock 的 modelLockRef 与 binding Model lock exact match。

缺一项或任一 digest 漂移都必须 fail-closed，不得重新读取 Profile 来“修复”。

### 3.3 授权不得因 Compaction 扩张

Compaction 继续复用既有：

- `CompactionExecutionBinding` authorization；
- Task/Run/Step/Action identity；
- data categories / data scope digest；
- exact Model lock、external target 与 prompt revision；
- user confirmation/admission 事实。

新增 Reasoning lock 只收窄调用参数身份，不给 Compaction 新权限。main assistant 获得 Max 锁不等于任何未授权
Compaction 可自动调用；反之 Compaction 也不能产生不同 reasoning mode。

### 3.4 Persistence 无 migration 27

现有 binding JSON 容器可保存 v2，indexed columns 不变。InMemory/SQLite：

- write 时使用 readable strict validator；
- load 时重算 binding digest；
- 比较全部现有 indexed fields 与 JSON；
- v2 额外验证 lock/protocol；
- 损坏记录整体失败关闭，不跳过、不回退 v1；
- migration 1～26 字节零漂移，最大 migration id 仍为 26。

若实现发现必须增加列、索引、Trigger、CHECK 或 migration 27，立即停止并回文档评审。

## 4. Agent Loop 生命周期接入

### 4.1 单一启动分流

`DurableAgentLoopStarter` 只加载一次 executable bundle：

- legacy bundle + Runtime Selection v1alpha1：沿用 ModelRequest/Binding v1alpha1；
- reasoning-aware bundle + Runtime Selection v1alpha2：校验 exact Reasoning lock，建立 Task-scoped materializer，
  所有 main/Tool/compaction request 使用 v1alpha2；
- coordination schema 与 bundle/selection 版本不匹配：typed fail-closed；
- 不允许同一 Task 在不同 round 混用 v1/v2 request。

### 4.2 main / Tool / continuation

以下请求必须使用相同 `reasoningModeLockId/digest`：

1. 初次 assistant invocation；
2. Tool result 后的下一 round；
3. 用户补充输入后的 continuation；
4. output 前允许的既有 retry；
5. Core restart 后允许的既有 resume。

每轮 `requestId/snapshotId/contextSourceDigest/requestDigest` 可以按既有语义变化，但 Reasoning lock identity 不得
变化。Tool round 不重新读 Preference/Profile，不因工具结果或模型文本动态升级/降级 mode。

### 4.3 initial / rolling compaction

initial 与 rolling compaction：

- 使用与 main 同一 Task-scoped materializer；
- 使用各自稳定 requestId/snapshotId/context digest，但相同 Reasoning lock；
- prepare invocation link 前必须持久化并验证 v2 binding；
- recovery 先读 binding，再构造请求；不得先发 Provider 后补 binding；
- pending compaction restart 不重读 Profile/Preference；
- binding 与 Runtime Selection/Model lock/Reasoning lock 任一不匹配时零上游请求。

### 4.4 SubmitTurn v1alpha3 的 Loop handoff

DFI-5.2.2 已完成 Receipt 但刻意不启动 v1alpha3 Loop。本批允许 Application-only v1alpha3 path 在 Receipt 后调用
既有 `AgentLoopStarter`，并复用 `loopStartedAt`/recovery 语义。仍不得注册 production Desktop route。

S7（Receipt 后、Loop 前）恢复必须：

1. replay 同一 durable Receipt；
2. strict load 同一 reasoning-aware Task bundle；
3. 启动同一 lock-bound Loop；
4. 不重读 Preview/Preference/Profile；
5. 双 Core 只允许一个实际 execution winner。

### 4.5 retry、restart 与 terminal replay

- retry/restart 读取原 Runtime Selection v1alpha2 与 Reasoning lock；
- local personal invocation 继续使用 migration 25 exact deadline，不能重新获得 15 分钟；
- DFI-5.2.3 不增加 retry 次数、Tool round、output/context budget、权限或 confirmation；
- output 已开始后的恢复沿用 DFI-4A.3.3 I3/I4：不重发、不拼 partial；
- terminal Message 已存在时先 replay，再执行 Provider resolve/materialize；Provider/materializer/Profile load 均为 0；
- I2 at-least-once 风险继续如实保留，不因 Max 锁伪装 exactly-once。

## 5. Provider fail-closed 边界

### 5.1 共享 guard

新增 Core-private guard：

```text
requireMappedReasoningProtocol(request, mappingCapability)
```

在 DFI-5.3 前，production Provider 的 capability 为 v1 only。收到 v2 时：

```text
reasoning_protocol_unavailable
retryable = false
safeSummary = 当前模型的 Max 映射尚不可用
```

### 5.2 零上游副作用

typed failure 必须发生在：

- Credential resolve/Keychain reveal 前；
- DNS、socket、TLS、HTTP body 创建前；
- enterprise Central invocation dispatch 前；
- local personal invocation/usage fact prepare 前；
- Provider health/usage projection 更新前。

测试必须分别证明 enterprise/local personal production adapter `upstreamRequestCount=0`。不能把“schema parse 失败”
或“fixture 没发请求”当作此边界的替代证据。

### 5.3 本批 test-only consumer

允许一个明确 test-only provider/consumer：

- strict 接收 ModelRequest v1alpha2；
- 只记录 safe semantic summary 与 request digest；
- 不访问真实网络、Credential、个人 Key；
- 不宣称 raw mapping 已完成；
- production source/dependency graph 必须证明该 fixture 不可达。

## 6. 崩溃、并发与恢复窗口

### 6.1 Lifecycle L1～L10

| 窗口 | 强制结果 |
| --- | --- |
| L1 v1alpha3 Receipt 后、Loop start 前崩溃 | restart 复用 exact lock，启动一次 Loop。 |
| L2 main request finalizer 后、Provider 前崩溃 | 无上游请求；恢复用同一 lock，按既有 invocation 规则继续。 |
| L3 main output 前 retry | 新 request identity 可变，reasoning lock identity 不变。 |
| L4 Tool result append 后、next round 前崩溃 | next round 使用同一 lock，不读 Profile。 |
| L5 initial compaction binding 后、Provider 前崩溃 | recovery 读取 exact v2 binding，使用同一 lock。 |
| L6 rolling compaction output 前崩溃 | 沿用既有恢复语义，不换 mode/Strategy。 |
| L7 Core SIGKILL/restart | 新 PID，SQLite reopen，Runtime/Task lock identity 不变。 |
| L8 outputStarted 后 restart | 不自动重发，不拼 partial。 |
| L9 terminal Message commit 后、marker 前崩溃 | replay Message，Provider/materializer 零调用。 |
| L10 terminal replay | request build、binding prepare、Provider resolve/upstream 均为 0。 |

### 6.2 Consistency C1～C8

| 窗口 | 强制结果 |
| --- | --- |
| C1 v1 bundle | 全程 v1；不补造 Reasoning lock。 |
| C2 v2 bundle | 全程 v2；不得中途降级 v1。 |
| C3 selection/lock digest mismatch | typed integrity failure，零上游请求。 |
| C4 request/receipt digest mismatch | finalizer fail-closed，不记录错误 provenance。 |
| C5 binding/request protocol mismatch | fail-closed，不尝试修复。 |
| C6 main 与 compaction 并发 | 相同 lock identity，各自 request digest 独立。 |
| C7 双 Core resume | durable execution/binding single winner；loser strict reload。 |
| C8 Provider mapping 尚未安装 | typed unavailable，禁止 silent default/upstream。 |

### 6.3 Profile/Preference load 计数

| 路径 | Preference load | Profile load |
| --- | ---: | ---: |
| v2 Task 首次 Loop | 0 | 0 |
| Tool next round | 0 | 0 |
| continuation | 0 | 0 |
| initial/rolling compaction | 0 | 0 |
| retry/restart | 0 | 0 |
| terminal replay | 0 | 0 |

DFI-5.2.3 只消费 durable lock。任何非零计数都表示越界回读 current fact，必须阻断。

## 7. 真实进程 Lifecycle Harness

### 7.1 拓扑

Harness 必须使用：

```text
Parent Node harness
  -> spawn fresh Core child process
  -> real SQLite file
  -> Application-only SubmitTurn v1alpha3 fixture
  -> test-only v2 Model consumer
  -> deterministic barrier/fault injector
  -> SIGKILL exact Core child
  -> spawn new Core PID + reopen same SQLite
```

禁止用以下证据冒充 process lifecycle：

- 单进程 unit test 中 throw；
- Fake Persistence 不 reopen；
- sleep/轮询猜测窗口；
- 自动 retry 覆盖第一次失败；
- 硬编码资源计数为 0；
- test-only Profile/Provider fixture 冒充 production ready。

### 7.2 deterministic barriers

至少提供：

- `receipt_committed_before_loop_start`；
- `main_request_finalized_before_provider`；
- `tool_result_committed_before_next_round`；
- `compaction_binding_committed_before_provider`；
- `model_output_started_before_terminal`；
- `terminal_message_committed_before_marker`。

每个 barrier 只允许触发一次；未观察即 fail-fast。15 秒进程 watchdog 只防 harness 挂死，不可用于判断业务窗口。

### 7.3 semantic replay

同一固定 seed 至少三轮 fresh process replay，semantic digest 必须一致。digest 排除：

- PID、端口、临时路径；
- wall clock 与随机 transport nonce；
- OS process handle；
- fault injector 内部序号。

digest 必须包含：

- lifecycle scenario/terminal；
- request protocol version；
- reasoning lock id/digest；
- main/Tool/compaction request reasoning summary；
- binding digest relationship；
- Profile/Preference/upstream/materializer counts；
- resource cleanup counts。

### 7.4 资源归零

正常完成、typed failure、SIGKILL/restart、terminal replay 后至少统计：

- active Core child；
- active Agent Loop run；
- pending provider stream；
- pending model invocation link；
- pending compaction job/binding；
- scheduler/timer；
- SQLite handle/transaction；
- mailbox/abort controller；
- test consumer working buffers；
- fault barrier waiter。

资源值必须来自真实 diagnostic adapter、process handle 或 OS process observation，不能用 `?? 0` 或常量填充。

## 8. 文件所有权与允许范围

### 8.1 允许修改

- `packages/contracts/src/model-protocol/**` 与 package private export；
- `services/core/src/application/**` 中 request materializer、context finalizer、Agent Loop/Compaction 接缝；
- `services/core/src/ports/**` 的 Core-private readable widening；
- `services/core/src/persistence/**` 的 Compaction Binding readable union；
- `services/core/src/adapters/memory/**`、`services/core/src/adapters/sqlite/**` 的 strict readable persistence；
- production Provider 的共享 typed fail-closed guard 接入，但不实现 raw mapping；
- `services/core/tests/**`、`packages/contracts/tests/**` 与 `scripts/**` focused/lifecycle Harness；
- 本计划、后续实施报告、README、CHANGELOG、DEVELOPMENT-LOG 与 QA evidence。

### 8.2 禁止修改

- Desktop public Contract、Main、Preload、Renderer、Admin Console；
- Central、Document Worker、PTX；
- DFI-5.3 Provider raw mapping 或 DFI-5.4 UI；
- TGM、Knowledge Provider；
- migration 1～26 或新增 migration 27；
- root dependency、workspace config、`pnpm-lock.yaml`；
- timeout 数值、retry 次数、Tool round、token/context/output budget；
- Credential、Keychain、Endpoint、authorization/confirmation 语义；
- production SubmitTurn v1alpha3 route/feature projection。

若实现发现必须改禁止范围，必须停止并回文档评审。

## 9. 分步实施计划与估算

### Step 1：Contract / readable Port（2～4 日）

- ModelRequest v1alpha2 strict schema/private export/digest；
- readable ModelRequest 与 Core-private Port widening；
- production Provider typed preflight guard；
- v1 fixture/digest/bundle zero-drift conformance。

### Step 2：Materializer / Context finalizer / main lifecycle（3～5 日）

- 单一 `TaskReasoningRequestMaterializer`；
- request + Context receipt atomic finalizer；
- executable Task bundle loader；
- main/Tool/continuation/retry/restart 接入；
- v1alpha3 Application-only Loop handoff。

### Step 3：Compaction Binding / recovery（2～4 日）

- CompactionExecutionBinding v1alpha2/readable validator；
- InMemory/SQLite conformance；
- initial/rolling compaction 共用 materializer；
- binding/request/authorization/recovery exact 校验。

### Step 4：Process Harness / 阶段收口（3～6 日）

- L1～L10/C1～C8 deterministic fault matrix；
- fresh Core child + SQLite reopen + SIGKILL；
- three-round semantic replay；
- real resource cleanup / leak / production-graph scans；
- 全量门禁、实施报告与阶段收口证据。

集中工程合计 **10～17 日**，不含独立 QA 与返工。该估算替代父计划的 5～8 日粗估，原因是当前代码事实明确
要求同时完成 Context receipt finalization、Core-private Port widening、InMemory/SQLite readable Binding 与真实进程
lifecycle，而不是只新增两个 schema。

本详细方案评审通过只表示方案可冻结，不构成任何编码授权。

## 10. QA 矩阵（100 项）

### 10.1 Contract / digest / private boundary（1～18）

1. v2 default valid；2. v2 max valid；3. default 多余 Strategy 拒绝；4. max 缺 Strategy 拒绝；
5. v2 unknown field 拒绝；6. v2 request digest exact；7. reasoning tamper 拒绝；8. lock id tamper 拒绝；
9. lock digest tamper 拒绝；10. request schemaVersion 进入 digest；11. v1 digest zero drift；
12. nested message 保持 v1alpha1；13. root ModelRequest 仍只接受 v1；14. private subpath 可显式导入；
15. Preload bundle 零命中；16. Renderer bundle 零命中；17. Admin bundle 零命中；18. raw Provider field 零命中。

### 10.2 Materializer / receipt / Port（19～36）

19. default lock -> default request；20. unsupported fallback -> default request；
21. unknown fallback -> default request；22. max_applied -> locked max；23. default 不泄漏 Strategy；
24. max exact Strategy/timeout；25. modelLockRef mismatch；26. selection task mismatch；27. model lock digest mismatch；
28. Profile load count=0；29. Preference load count=0；30. main final receipt digest exact；
31. receipt mismatch fail-closed；32. reasoning 不改变 token estimate；33. reasoning 不改变 maxOutputTokens；
34. v1 caller zero drift；35. readable Port strict dispatch；36. corrupt v2 不 fallback v1。

### 10.3 Main / Tool / continuation lifecycle（37～54）

37. v3 Receipt 后启动 v2 Loop；38. initial request exact lock；39. Tool next round same lock；
40. user continuation same lock；41. retry same lock；42. restart same lock；43. request IDs 可变化；
44. reasoning lock ID 不变化；45. lock digest 不变化；46. fallback 不自动升级；47. max 不自动降级；
48. no Profile reread；49. no Preference reread；50. C3 integrity failure upstream=0；
51. v1 Task 全程 v1；52. v2 Task 不混 v1；53. dual Core single execution winner；54. S7 exact Receipt replay。

### 10.4 Compaction / binding / recovery（55～74）

55. v2 binding valid；56. binding unknown field reject；57. binding digest tamper；58. lock id mismatch；
59. lock digest mismatch；60. request protocol mismatch；61. model lock mismatch；62. runtime selection mismatch；
63. initial compaction same lock；64. rolling compaction same lock；65. main/compaction distinct request digest；
66. same reasoning lock；67. binding precedes Provider；68. pending recovery no Profile read；
69. pending recovery no Preference read；70. SQLite load revalidation；71. InMemory same validator；
72. corrupt v2 binding no fallback；73. authorization scope not expanded；74. migration max id=26。

### 10.5 Provider fail-closed / security（75～86）

75. enterprise v2 typed unavailable；76. local personal v2 typed unavailable；77. Credential resolve count=0；
78. DNS count=0；79. socket/TLS count=0；80. HTTP/upstream count=0；81. invocation fact count=0；
82. usage/health projection count=0；83. test consumer production graph unreachable；84. generic parse error 不替代 typed error；
85. default request 不承诺具体 Provider 档位；86. timeout/retry/budget 配置零漂移。

### 10.6 Process Harness / gates（87～100）

87. L1；88. L2；89. L4；90. L5；91. L7 true SIGKILL/new PID；92. L8 no replay；
93. L9 terminal Message recovery；94. L10 provider/materializer=0；95. barriers fail-fast；
96. 三轮 semantic digest 一致；97. semantic seed 排除 PID/端口/路径/墙钟；98. 资源计数真实归零；
99. focused/root/frozen/Central online/offline/audit 全绿；100. lockfile digest unchanged 且 GATED 范围零漂移。

所有测试禁止 `.skip`、`.only`、`@Disabled`、sleep 猜窗口、自动 retry 覆盖首轮失败、硬编码资源 0，或以
test-only Profile/Provider/identity 宣称 production ready。

## 11. 开发者与独立 QA 门禁

若未来获得编码授权，至少执行：

```text
Node 24 exact runtime
focused ModelRequest v1alpha2 Contract/digest/private-boundary tests
focused TaskReasoningRequestMaterializer / Context receipt finalizer tests
focused Agent Loop main/Tool/continuation/retry/restart tests
focused Compaction Binding InMemory + SQLite conformance
real-process DFI-5.2.3 lifecycle Harness（三轮）
DFI-5.2.1 Contract regression
DFI-5.2.2 Planner/Task bundle/recovery regression
DFI-5.1 Preview/Preference/migration 26 regression
DFI-4A.3.3 durable Agent Loop/Compaction regression
DFI-4A.3.1 repair.2 timeout/migration 25 regression
pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run check
pnpm install --frozen-lockfile --offline
pnpm run audit:dtp4
check:central
check:central:offline
```

Central 即使不改生产代码也必须在 JDK 21 + Docker 环境串行复跑；不能以“本批只改 Core/Contracts”为由省略。

实施报告必须列出：

- production SubmitTurn v1alpha3 route count=0；
- production Reasoning Profile/Strategy mapping implementation count=0；
- production v2 Provider upstream request count=0；
- main/Tool/continuation/compaction/retry/restart exact lock matrix；
- Profile/Preference load count全 0；
- terminal replay Provider/materializer count全 0；
- migration 最大 id=26；
- lockfile before/after digest；
- lifecycle 三轮 semantic digest 与真实资源计数来源。

## 12. 停手条件

出现任一情况必须停止编码并回文档评审：

1. 需要修改已冻结的 ReasoningModeLock、Runtime Selection v1alpha2 或 coordination v1alpha3 语义；
2. 需要把 Contracts 根入口 ModelRequest/Runtime Selection 改成 union；
3. 需要新增 migration 27 或修改 migration 1～26；
4. Context receipt 无法绑定 final v2 request digest；
5. main 与 Compaction 无法共用同一 materializer；
6. recovery 必须重读 Preference/Profile current pointer；
7. production Provider 只能 silent ignore v2 或先发上游再拒绝；
8. 需要 raw Provider mapping 才能完成 Harness；
9. 需要调整 timeout、retry、Tool round 或 token/context/output budget；
10. 需要扩大 main/Compaction authorization；
11. 需要 production SubmitTurn v1alpha3 route、Main/Preload/Renderer/Admin 改动；
12. 需要 Central、Document Worker、PTX、TGM 或 Knowledge Provider 改动；
13. 需要新增依赖、改 workspace/root config 或 `pnpm-lock.yaml`；
14. v1 historical fixture/digest/provider 行为发生漂移；
15. InMemory/SQLite 无法共享 readable binding validator；
16. process lifecycle 只能用 throw/sleep/Fake Persistence 冒充；
17. 资源归零只能硬编码或 `?? 0`；
18. root check 失败来自其他并发窗口且无法安全隔离。

## 13. 当前状态与评审请求

```text
DFI-5.0                       PLAN REVIEW PASS/CLOSED
DFI-5.1                       PASS/CLOSED
DFI-5.2                       PASS/CLOSED
DFI-5.2.1                     PASS/CLOSED
DFI-5.2.2                     PASS/CLOSED
DFI-5.2.3                     PASS/CLOSED
DFI-5.3                       DOCUMENT REVIEW PENDING / CODING GATED
DFI-5.4                       GATED
AAPI-0.3～AAPI-0.4            GATED
TGM / Knowledge Provider      GATED
```

文档评审重点：

1. 是否接受 ModelRequest v1alpha2 只升级顶层 envelope、nested messages 继续 v1alpha1；
2. 是否接受 v2 requestDigest 覆盖完整 strict reasoning material且 v1 helper 零漂移；
3. 是否接受 request + Context receipt 原子 finalizer，禁止 receipt 留在 v1 digest；
4. 是否接受 main/Tool/continuation/Compaction 共用唯一 materializer；
5. 是否接受 executable bundle 单次版本 dispatch，损坏 v2 不 fallback v1；
6. 是否接受 Compaction Binding v2 只收窄 exact lock、不扩张 authorization；
7. 是否接受 DFI-5.3 前 production Provider typed fail-closed且零上游副作用；
8. 是否接受真实 Core child + SQLite reopen + SIGKILL 的 lifecycle Harness；
9. 是否接受 10～17 日详细估算替代父计划 5～8 日粗估。

本文件已通过独立文档复核、编码、开发者门禁、独立 QA 与用户正式接受，当前为 `PASS/CLOSED`；DFI-5.2
阶段整体同时关闭。本批完成不构成 DFI-5.3 编码、DFI-5.4 或其他下游授权。

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
```
