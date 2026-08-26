# DFI-4A.3.3 Agent Loop / Compaction / Recovery 闭环详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 上游：DFI-4A.0～4A.2、DFI-4A.3.1、DFI-4A.3.2 `PASS/CLOSED`  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 架构依据：ADR-011、ADR-013、ADR-013 Addendum A、ADR-015、ADR-017、ARH-1～3、DFI-2A、DFI-4A Revision 1

本文件冻结 DFI-4A.3.3 的生产接入、恢复语义和独立 QA 口径。实现、开发者门禁与独立 QA 均已完成；
用户已接受 P0～P3 全 0 的独立 QA 结论，DFI-4A.3.3 与 DFI-4A.3 阶段整体正式 `PASS/CLOSED`。
DFI-4A.4 仅进入详细方案文档评审，DFI-2B、DFI-3 与 TGM 继续 `GATED`。

## 1. 批次目标

DFI-4A.3.3 把已经具备安全 Provider、Invocation/Usage Persistence、统一选模和精确 Task Lock 的个人模型，
接入既有 Durable Agent Loop、自动 Compaction 与进程恢复链。完成后必须证明：

1. main invocation 与 initial/rolling compaction 都解析同一个标准 `TaskCapabilityLock`；
2. 企业模型和个人模型经过一个穷尽式 Core-private resolver，禁止按 modelId 猜测来源或静默 fallback；
3. 个人 Provider 的 accepted、dispatch、output started、terminal、Usage 和 status observation 使用 migration 24
   的 durable facts 收敛；
4. Conversation Message、Compaction Summary、Provider terminal 与 Usage 各自保持单一事实职责；
5. I1～I5 崩溃窗口在真实子进程 `SIGKILL` + SQLite reopen 下得到确定性分类；
6. Provider 缺失 Usage 时继续保持 unknown，不伪造 0；
7. cancel、deadline、权限收窄、Keychain unavailable、stale fencing 和 Core restart 都不切换模型；
8. 两个独立 Core/SQLite owner、长 Tool Loop、首次/滚动压缩、资源归零和泄漏扫描形成 Closure Evidence。

本批完成后可以声明：

```text
Local Personal Model Agent Loop / Compaction / Recovery Foundation closed
```

不能声明 Desktop 已支持真实个人模型 CRUD、选择、默认偏好或 Key reveal；这些公共 Desktop 能力属于
DFI-4A.4。也不能声明 Provider 调用具备通用 exactly-once 或不重复计费保证。

## 2. 当前代码事实与剩余缺口

### 2.1 已存在并直接复用

- `AgentLoopCoordinator` 已通过 `ModelStreamSequenceValidator` 统一验证所有真实 Provider stream；
- `DurableAgentLoopStarter` 已负责 Task execution、Context Preparation、Compaction、Tool Loop、Assistant Message
  commit、delivery 和恢复等待；
- `ContextPreparationCoordinator`、`CompactionCoordinator` 与 `ModelBackedCompactionSummarizer` 已支持首次与
  rolling compaction、purpose-bound admission、execution binding 和 durable summary commit；
- DFI-4A.3.1 已提供 `LocalPersonalOpenAiCompatibleModelProvider`、migration 24、
  `LocalPersonalModelInvocationPersistence`、Usage Fact/Projection 与 status observation 原子提交；
- DFI-4A.3.2 已提供 `CompositeModelProviderResolver`、`pmcfg1` exact configuration ref、标准 personal
  `TaskCapabilityLock`、统一选模与 Task-backed usage guard；
- DFI-4A.2 已提供 Runtime Active owner authority、Keychain Credential resolve 与敏感内存清理；
- ARH-2 已证明 Agent Loop 自动 Compaction 的原子分组、rolling summary 和七个恢复窗口；
- ARH-3 已冻结 Provider Usage attempt identity、winner/superseded、Projection 与 Cache 事实边界。

### 2.2 当前生产链尚未闭合

1. `DurableAgentLoopStarter` 仍同步调用 `RuntimeAdapterHandles.modelProvider(...)`，没有消费异步
   `CompositeModelProviderResolver`；
2. Compaction summarizer resolver 仍从 `RuntimeAdapterHandles` 取 exact Provider，个人模型无法按原 lock 恢复；
3. `LocalPersonalOpenAiCompatibleModelProvider` 还是 raw transport Provider，尚未用 migration 24 包装 durable
   attempt lifecycle；
4. migration 24 的 `listPending()` 尚未进入生产 startup/recovery；
5. 现有 owner authority action 只有 configure/reveal/delete，没有 Core-private `use` 执行权限入口；
6. raw stream 的标准 Usage event 已归一化，若不增加 Core-private attempt telemetry，会丢失 cached/reasoning 等
   Provider 原始 Usage breakdown；
7. 已持久 Assistant Message 的 replay 检查发生在 Provider resolve 之后，可能错误要求已结束 Task 仍具备当前
   Credential 或在线调用能力；
8. 尚无个人模型 main + initial compaction + rolling compaction 的真实进程级 Closure Harness。
9. raw personal Provider 当前先产出内部 `started`、随后才解析 Credential/发起 HTTPS；durable wrapper 必须
   冻结该 marker 的缓冲与转发顺序，否则 I2 会退化成无法真实触发的纸面窗口。

### 2.3 本批硬约束

- 不新增第二套 Agent Loop、Compaction Coordinator、Task model lock、Conversation Message 或 Summary；
- 不把个人模型写入企业 Registry Generation；
- 不修改公共 Desktop Contract，不新增 Renderer/Main/Preload API；
- 不实现 DFI-2B 授权模式行为，不把已有主调用确认静默扩张为 compaction 授权；
- 不新增 migration 25。若 migration 24 无法表达必要恢复事实，立即停止编码并回到文档评审；
- 不通过重试隐藏 output-started 不可恢复，不宣称通用 exactly-once；
- 不使用真实用户 Key、外网或产生调用费用的 Provider 做 Foundation 关闭依据。

## 3. 统一生产解析入口

### 3.1 `TaskLockedModelProviderResolver`

新增 Core-private 异步 Port：

```text
TaskLockedModelProviderResolver.resolve({
  taskId,
  runtimeSelection,
  modelLock,
  purpose
}) -> ResolvedTaskModelProvider

ResolvedTaskModelProvider
  provider
  authority = central_enterprise | local_personal
  externalTarget
  exactLockDigest
```

- enterprise 分支委托既有 `RuntimeAdapterHandles`；
- personal 分支委托 `CompositeModelProviderResolver`，并加载 Runtime Active owner authority；
- `externalTarget` 只使用安全的 lock-bound identity/digest，不暴露 canonical Endpoint、Credential Reference 或 owner；
- unknown、混合或损坏 marker 必须失败关闭；
- resolver 不写 Task、不写 preference、不发网络请求、不解析 Secret；
- main invocation 与 compaction 必须消费同一 resolver，禁止各自复制 personal 判断。

### 3.2 Core-private execution authority

为个人模型执行增加 Core-private `use` authority action，或建立语义等价的
`PersonalModelExecutionAuthorityProvider`：

- authority 只能来自 Runtime Active 企业身份、Device Trust、`personal_model.configure` entitlement 与既有
  CGF-1.3 离线状态 2/3；
- 状态 2 允许使用，状态 3 失败关闭；Central 暂时不可达本身不等于权限失效；
- 不接受 Renderer 自报 enterprise/user/device/owner digest；
- authority 只证明当前可执行，不改写旧 Task lock，也不成为新的持久身份事实；
- entitlement 收窄后，不启动新的 Provider attempt；已存在 durable content/terminal 只按恢复规则重放。

### 3.3 replay-first 顺序

`DurableAgentLoopStarter` 必须先检查已持久的 terminal Assistant Message/Task facts，再决定是否解析 Provider：

1. 已存在 terminal Assistant Message：无需 Credential、网络或当前 personal eligibility，完成 Task/delivery replay；
2. 无 durable content、但存在可重放的 failed/cancelled/timed_out terminal：按 typed terminal 收敛；
3. 无可重放事实时才解析 exact Provider，并进入新 attempt 或恢复分类；
4. replay 不得重发 ephemeral delta，不得从 Usage、status 或 terminal 伪造 Assistant Message/Summary。

## 4. Durable Local Personal Provider

### 4.1 分层

新增 `DurableLocalPersonalModelProvider` 装饰器，位于 Agent Loop/Compaction 与 raw
`LocalPersonalOpenAiCompatibleModelProvider` 之间：

```text
Agent Loop / Compaction
        ↓ ModelProviderInvocation
DurableLocalPersonalModelProvider
        ↓ exact attempt + fencing
LocalPersonalOpenAiCompatibleModelProvider
        ↓ HTTPS/SSE
Controlled or real Provider
```

raw Provider 继续只负责安全传输与 canonical stream；durable wrapper 负责逻辑调用身份、migration 24、恢复、
Usage/Status/terminal 聚合提交和 stale fencing。不得把持久化逻辑复制进 raw transport。

### 4.2 稳定身份与 attempt

- `invocationKind=assistant_message`：`invocationLinkId` 从 taskId/runId/round 稳定派生；
- `invocationKind=compaction_summary`：`invocationLinkId` 使用 compactionJobId 或其稳定派生值；
- `authorityInvocationId` 从 kind、linkId、exact model lock、model request digest、admission scope 稳定派生；
- 同一逻辑调用重启后保持相同 link/authority identity；
- 每个真实网络 attempt 使用更高 fencing epoch 和新的 transport request id；transport identity 不进入稳定业务 digest；
- stale owner、不同 request digest、不同 lock/admission/owner identity 必须 typed conflict，不覆盖 winner；
- 系统只承诺 durable single winner，不承诺 Provider 侧 exactly-once 或绝不重复计费。

### 4.3 dispatch 与 `outputStartedAt`

顺序固定为：

1. `prepareInvocation(accepted)`；
2. CAS claim `dispatching` + fencing epoch；
3. 读取并缓存 raw Provider 的首个 `started` marker，不向上游 consumer 暴露，也不把该内部 marker 单独视为
   Provider output evidence；
4. 继续驱动 raw iterator，使 Credential resolve/HTTPS dispatch 真实发生，并等待第一条 post-start stream event；
5. 在向上游 consumer 暴露 buffered started 与第一条 post-start event 前持久化 `outputStartedAt`；
6. 再转发 started/delta/tool_call/usage/terminal；
7. terminal 聚合提交。

I1 位于 dispatch 前，I2 位于第 4 步的 Provider dispatch/等待窗口；一旦 `outputStartedAt` 存在，自动重新调用
Provider 即被禁止。raw `started` 的缓冲必须有界，cancel/deadline/disconnect 时释放，不得形成第二条流状态机。

### 4.4 Usage telemetry 与原子 terminal

标准 `ModelStreamEvent` 继续保持 Provider-neutral，不为个人模型修改公共事件 Contract。raw Provider 可通过
Core-private、单 attempt、有界的 telemetry 接缝向 durable wrapper 提供原始 OpenAI Usage breakdown：

- normalized input/output token 仍按 ARH-1 stream 规则投影；
- cached/reasoning 等字段只有 Provider 真实返回时才进入 Usage Fact；
- Provider 未返回 Usage：不插入 Usage Fact、不生成 Projection，不伪造 0；
- terminal、可选 Usage Fact、可选 Usage Projection、可选 status observation 在
  `commitTerminalOutcome()` 中原子提交；
- cancelled/deadline 不改写模型健康；late terminal、重复 Usage、stale fencing 不得覆盖 winner；
- status revision 并发冲突只允许有界 reload/rebuild，再次冲突则 typed fail-closed，不做无限重试。

### 4.5 `messageCommitted`

Conversation Message 或 Compaction Summary 才是正文事实。`messageCommitted` 只允许：

- 校验 exact terminal/link/lock identity；
- 记录既有 main/compaction link 所需的 commit marker；
- 不创建第二条正文、不改变 Provider Usage、不重新调用 Provider；
- durable Provider terminal 已完成但正文未提交时，不从 terminal/Usage 重建正文。

## 5. Main invocation 恢复语义

### 5.1 I1～I5 命名崩溃窗口

| 窗口 | 崩溃点 | durable facts | 恢复分类 |
| --- | --- | --- | --- |
| I1 | accepted link 提交后、dispatch claim 前 | accepted，无 output | 同逻辑身份可由新 owner 提升 fencing 后调用 |
| I2 | dispatch claim/Provider 可能 accept 后、`outputStartedAt` 前 | dispatching，无 output | Generic OpenAI 无 status/resume 时允许新 attempt；明确可能重复计费，不宣称 exactly-once |
| I3 | `outputStartedAt` 后、terminal 前 | output_started | `model_stream_resume_unavailable` / recovery exhausted；不重发、不拼 partial |
| I4 | 完整 terminal 只在死亡进程内存、原子 terminal commit 前 | output_started | 与 I3 相同；不因“可能完整”而猜测正文 |
| I5 | terminal/Usage/status 已原子提交、Assistant Message commit 前后 | terminal，可选 Usage/status | 有 durable Message 则 replay；无 Message 时 completed 正文不可恢复，failed/cancelled/timed_out 可重放 typed terminal |

I2 是 at-least-once transport 风险窗口。Evidence 必须明确计数 attempt 与可能重复计费，不得用“幂等 requestId”
伪装 Provider 一定支持幂等。

### 5.2 cancel、deadline 与 ownership

- dispatch 前 cancel：不调用 Provider，Task 收敛 cancelled；
- live cancel/deadline：终止 socket，单 terminal；不更新模型健康；
- cancel/deadline 与 terminal 竞争由 durable fencing/CAS 决定唯一 winner；
- Task/Run stale owner 不得提交 terminal、Usage、status 或 Assistant Message；
- 权限、Credential、definition 或 profile 在 attempt 前不匹配：失败关闭，不 fallback；
- attempt 已 output started 后权限收窄：停止/取消当前执行，不以新模型继续。

## 6. Compaction 闭环

### 6.1 exact lock 与双层事实

initial 与 rolling compaction 必须：

- 使用 Task 已锁定的同一 personal model lock、configuration revision、profile/adapter revision；
- 经过 `TaskLockedModelProviderResolver` 与 purpose=`compaction_summary` 的独立 admission；
- 继续复用 `CompactionExecutionBinding`、`CompactionCoordinator`、`ModelBackedCompactionSummarizer`；
- 不把 main invocation 的授权静默扩张给 compaction；
- 不因 personal Provider 失败切换 enterprise Provider。

两类 durable link 职责分离：

- `compaction_model_invocation_links` 证明 Compaction 编排、model request 与 Summary commit；
- `local_personal_model_invocation_links` 证明个人 Provider attempt、Usage、status 与 terminal；
- 两者通过 compactionJobId/modelRequest/exact binding 对齐，但都不成为第二份 Summary 正文。

### 6.2 首次与 rolling

- 首次压缩：raw immutable prefix → Summary 1 + raw tail；
- rolling：base Summary 1 + raw extension → Summary 2；Record 2 仍证明完整 immutable source range；
- 两次调用必须使用同一 exact personal lock，不能因 head/config/profile 更新漂移；
- Summary + raw tail semantic digest 在重启前后稳定，排除墙钟、PID、端口、transport request id；
- Tool Call/Result 与 waiting confirmation 原子组继续由共享 Planner 决定，不得在 personal 路径复制边界算法。

### 6.3 Compaction 不可恢复输出

- personal terminal committed 但 Summary 未 commit，且没有完整可重放正文：标记 resume unavailable，不创建 Summary；
- Summary 已 durable commit：按既有 Compaction Receipt replay，不要求当前 Keychain/Provider；
- partial delta 永不进入 Summary；
- compaction failure 不伪造主 Task terminal，按既有 waiting/external dependency 语义收敛。

## 7. Startup 与 Recovery Coordinator

### 7.1 有界扫描

新增 Core-private local personal invocation recovery：

- 每次 startup 最多加载 200 条 pending link；超过上限记录安全计数并分批处理，不全表装入内存；
- 对每条 link 重读 Task、Run、runtime selection、exact model lock、request/admission、owner namespace 与
  invocation kind；
- corrupt digest、缺失 Task/lock、mixed authority、stale owner 均 typed fail-closed；
- recovery 在 Core ready 前完成分类，但不得在没有 Task ownership/admission 的情况下后台盲发网络请求；
- 同一 link 只能由 fencing CAS 选出一个 active owner。

### 7.2 启动顺序

```text
SQLite migrate/preflight
→ personal model materialization / namespace integrity
→ Credential Broker ready or typed unavailable
→ local personal invocation recovery classification
→ Agent Loop / Compaction recovery
→ private server ready
```

生产 helper 不可用不应阻断整个 Core 启动，但所有需要 personal Credential 的新执行必须 typed fail-closed；已完成
durable Message/Summary replay 不依赖 helper。

## 8. 真实 Closure Harness

### 8.1 拓扑

- Core A 与 Core B 为独立子进程，分别拥有 dbA/dbB，不共享 Core SQLite；
- 每个 Core crash 后由新 PID 只重开自己的原 SQLite 文件；
- 受控 HTTPS/SSE Provider 独立进程，支持 accept barrier、output barrier、terminal barrier、cancel/deadline；
- 使用隔离测试 Keychain 与假 Credential，禁止用户 Key、外网和调用费用；
- Tool backend 独立受控进程，真实经过 Durable Agent Loop/Tool Batch/Effect；
- 进程间 barrier 使用一次性 identity/latch，不使用轮询运气、延长超时或自动重试掩盖问题。

### 8.2 场景

1. enterprise 与 personal main invocation 并行隔离，互不 fallback；
2. personal main I1～I5，逐窗 `SIGKILL` + SQLite reopen；
3. initial + rolling compaction 均真实触发，不预写 Summary 冒充；
4. compaction I1～I5 的适用窗口与 Summary commit 前后恢复；
5. 50-round Tool Loop，至少一次 initial + 一次 rolling compaction；
6. waiting_user_confirmation 在 compaction 边界前后重启恢复；
7. Keychain unavailable/locked、权限状态 2/3、stale lock、status revision conflict；
8. cancel、deadline、late terminal、双 owner fencing；
9. Provider omitted Usage、cached/reasoning Usage、Usage duplicate/conflict；
10. 同一 semantic seed 至少 3 次，semantic digest 与业务计数一致。

semantic seed 只固定 Conversation/Model/Tool 脚本、业务身份、故障窗口与决策序列；不包含墙钟、PID、端口、
进程调度、transport request id。

### 8.3 资源与泄漏

每个场景和最终收口都必须证明以下资源为 0：

- active Core child、Provider/Tool child、socket/TLS connection；
- pending timer、abort listener、stream subscriber/buffer；
- active Agent run、pending local invocation、pending compaction、Keychain operation；
- stale lease/fencing owner。

四通道独立扫描 stdout、stderr、Evidence JSON 与 diagnostic artifact；五类 marker 为 canary、credential、
endpoint、正文、路径；扫描 raw/Base64/URL-encoded/hex 形态。负向注入必须证明 scanner 会失败，报告只保留
计数、digest、状态、duration、typed error 与资源指标。

## 9. 修改范围

编码获得授权后允许：

- `services/core/src/application/**`；
- `services/core/src/ports/**`；
- `services/core/src/adapters/memory/**`、`services/core/src/adapters/sqlite/**`；
- 必要的 Core bootstrap 私有 wiring；
- `services/core/tests/**`、根 `scripts/run-dfi4a33-*.mjs`；
- 本批专项脚本、QA allowlist 与治理文档收口。

禁止：

- `packages/contracts/**` 公共 Contract；
- migration 1～24 改写或新增 migration 25；
- `apps/desktop/src/main/**`、`preload/**`、`renderer/**`；
- `services/central-service/**`、`services/document-worker/**`；
- DFI-4A.4、DFI-2B、DFI-3、TGM；
- 新依赖、根 `tsconfig.json`、`pnpm-lock.yaml`；
- 真实用户 Key、外网 Provider、Prompt Cache 新行为。

若实现必须突破任一禁止项，立即停止并回到文档评审，不得边编码边扩范围。

## 10. 实施步骤

1. **Resolver/Authority 接缝**：新增统一 async resolver 和 Core-private `use` authority，改造 replay-first 顺序；
2. **Durable wrapper**：接入 migration 24、stable identity、fencing、output-started 与 private Usage telemetry；
3. **Main Loop**：把 personal Provider 接入 Durable Agent Loop，验证 Message/terminal/Usage/status 原子职责；
4. **Compaction**：让 initial/rolling compaction 使用同一 resolver/exact lock，关闭双 link 对齐；
5. **Recovery**：实现 bounded startup classification、I1～I5、cancel/deadline/stale owner；
6. **Closure Harness**：真实子进程、SQLite reopen、50-round、三次 semantic replay、资源与泄漏扫描；
7. **共享文档收口**：仅在代码与测试冻结后更新版本、CHANGELOG、DEVELOPMENT-LOG、README。

每一步都必须保持可编译；Port 与所有生产 Adapter 必须同一批完整交付，不留下半切换。

## 11. QA 验收矩阵（80 项）

### 11.1 Resolver、authority 与 wiring（1～12）

1. enterprise lock 只解析 enterprise Provider；
2. personal lock 只解析 personal Provider；
3. unknown/mixed marker 失败关闭；
4. 不按 modelId 猜来源；
5. 不发生 enterprise/personal fallback；
6. main/compaction 共用同一 resolver；
7. owner authority 来自 Runtime Active facts；
8. 状态 2 允许、状态 3 拒绝；
9. Renderer 自报 owner identity 无入口；
10. safe externalTarget 不含 Endpoint/Credential/owner；
11. 已提交 Assistant Message replay 不解析 Credential；
12. bootstrap 无 personal runtime 时 enterprise 行为不回归。

### 11.2 Durable wrapper、Usage 与 status（13～28）

13. stable assistant invocationLinkId；14. stable compaction invocationLinkId；15. stable authorityInvocationId；
16. retry 使用新 transport id；17. fencing epoch 单调；18. stale owner 不能 commit；
19. accepted 在网络前持久；20. outputStarted 在首事件前持久；21. started 计入 output；
22. terminal/Usage/Projection/status 原子提交；23. omitted Usage 不写 Fact/Projection；
24. cached/reasoning 仅真实返回时记录；25. duplicate Usage 幂等；26. different digest conflict；
27. cancel/deadline 不改健康；28. status CAS retry 有界且不改变 terminal identity。

### 11.3 Main invocation I1～I5（29～43）

29～33. I1～I5 分别真实 `SIGKILL`；34. I1 可恢复；35. I2 显式 at-least-once 风险；
36. I3 resume unavailable；37. I4 不猜测完整输出；38. I5 有 Message 可 replay；
39. I5 无 Message 的 completed 不伪造正文；40. failed typed terminal 可 replay；
41. partial delta 不写 Message；42. terminal 后事件拒绝；43. 双 owner 只产生一个 durable winner。

### 11.4 Compaction 与原子边界（44～56）

44. initial compaction 实际触发；45. rolling compaction 实际触发；46. rolling 只发 base Summary + raw extension；
47. Record 仍证明完整 source range；48. main/compaction exact lock 相同；49. compaction 独立 admission；
50. 两类 link identity 对齐；51. local link 不冒充 Summary；52. generic link 不冒充 Usage；
53. Summary committed 后 replay 不解析 Credential；54. Summary 未 commit 不重建正文；
55. Tool Call/Result 不跨边界；56. waiting confirmation open group 保留 raw tail。

### 11.5 Loop、取消、隔离与安全（57～68）

57. 50-round Durable Tool Loop；58. 无递归 compaction；59. enterprise/personal 双 Core 隔离；
60. dbA/dbB 不交叉；61. Keychain locked/unavailable typed fail；62. 权限收窄不 fallback；
63. dispatch 前 cancel 零 Provider；64. live cancel 单 terminal；65. deadline 单 terminal；
66. late terminal 不覆盖；67. corrupt lock/link/digest fail-closed；68. startup scan 有界不盲发网络。

### 11.6 Harness、泄漏与回归（69～80）

69. 三次 semantic replay digest 一致；70. 资源八类归零；71. 四通道五类 marker 零命中；
72. scanner 负向注入会失败；73. 无真实 Key/外网/费用；74. Node 24.13.0；
75. DFI-4A.3.1 Provider Conformance 回归；76. DFI-4A.3.2 selection/lock 回归；
77. ARH-1 stream validator 回归；78. ARH-2 compaction/50-round 回归；79. ADR-017 Tool Effect 回归；
80. 无 migration 25、公共 Contract、Desktop、Central、DFI-2B/3、TGM 超前实现。

## 12. 正式门禁

编码交付后串行执行：

```text
CI=true pnpm run harness:dfi4a3.3
CI=true pnpm run lint
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

- Node 必须为项目声明的 `24.13.0`，JDK 21，Docker 可用；
- Formal Harness 与任何 Central/Testcontainers 测试必须严格串行；
- 首次失败必须留 failure artifact，不得只复跑后报告 PASS；
- 完整门禁全绿后才进入独立 QA，不以 focused test 替代 Workspace/Central。

## 13. 工作量

| 工作项 | 集中工程工作日 |
| --- | ---: |
| Resolver、authority、replay-first | 1～2 |
| Durable wrapper、Usage/status convergence | 2～3 |
| Agent Loop + Compaction 接入 | 2～3 |
| I1～I5 Recovery + Closure Harness | 2～4 |
| 合计 | **7～12** |

相较父计划原 5～8 日上调，原因是当前代码事实证明还需要统一异步 resolver、durable personal wrapper、
private Usage telemetry、replay-first 顺序与真实进程级 Harness。该估算是集中工程工作量，不是日历或上线承诺。

## 14. 文档评审问题

请评审者基于当前代码逐项回答：

1. 当前 9 个生产缺口是否与代码一致，特别是 raw `started` 缓冲是否能真实保留 I2，是否仍有未识别接入点；
2. 单一 async `TaskLockedModelProviderResolver` 是否是 main/compaction 的最小正确接缝；
3. Core-private `use` authority 是否正确复用 CGF-1.3 状态 2/3，且未进入 DFI-2B；
4. replay-first 是否正确避免已完成 Task 依赖当前 Credential/权限；
5. durable wrapper 与 raw HTTPS/SSE Provider 分层是否清晰；
6. stable logical identity + new transport identity + fencing 是否诚实且不伪 exactly-once；
7. `outputStartedAt` 在向 consumer 暴露 buffered started 前持久，是否关闭了自动重发歧义；
8. private Usage telemetry 是否必要，是否保持公共 Model Stream Contract 不变；
9. I1～I5 是否正确区分可重试、at-least-once 风险和不可恢复正文；
10. compaction generic link 与 local personal link 的职责是否单一、无第二事实源；
11. migration 24 是否足够，禁止 migration 25 是否可执行；
12. 两 Core/两 SQLite/受控 Provider 的 Harness 是否能证明隔离与恢复；
13. 80 项 QA 与 7～12 日是否可执行；
14. 是否存在必须修改公共 Contract、Desktop、Central 或进入 DFI-2B/3/TGM 的事实；
15. 给出 PASS / PASS_WITH_REVISIONS / FAIL 及 P0/P1/P2/P3 发现。

## 15. 门禁状态

```text
DFI-4A.3 Plan   PASS/CLOSED
DFI-4A.3.1      PASS/CLOSED
DFI-4A.3.2      PASS/CLOSED
DFI-4A.3.3      PASS/CLOSED
DFI-4A.3        PASS/CLOSED
DFI-4A.4 Plan   DOCUMENT REVIEW PENDING
DFI-4A.4.0+     CODING GATED

DFI-2B          GATED
DFI-3           GATED
TGM             GATED
```

本批正式门禁、独立 QA 与用户接受均已完成，现已 `PASS/CLOSED`。该关闭不自动授权 DFI-4A.4 编码。
