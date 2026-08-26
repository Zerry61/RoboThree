# RoboThree 上游借鉴登记表

> 状态：**ACTIVE**  
> 建立日期：2026-07-19  
> 适用范围：RoboThree 架构、Contract、生产代码、测试与安全设计。

## 1. 目的

本登记表确保 RoboThree 的核心模块能够回答：

1. 参考了哪个成熟项目和固定 Commit；
2. 借鉴了什么机制；
3. 是设计借鉴、选择性源码复用、依赖引入还是明确拒绝；
4. 为什么没有整体照搬；
5. 若复制了代码，复制到哪里、保留了哪些许可证和修改说明。

本表不代表当前已经复制任何上游源码。初始条目均处于设计输入或候选评估状态。

## 2. 采用类型

| 类型 | 含义 |
| --- | --- |
| `DESIGN_ONLY` | 只采用架构原则、状态语义、接口形态或算法思想，不复制实现 |
| `SELECTIVE_SOURCE` | 允许在逐文件审查后复用小范围源码，必须登记目标文件和归属 |
| `DEPENDENCY` | 通过正式依赖使用上游包，不复制源码 |
| `DEFER` | 机制有价值，但当前阶段不实现 |
| `REJECT` | 明确不采用的机制或实现 |

## 3. 状态

| 状态 | 含义 |
| --- | --- |
| `PLANNED` | 已进入计划，尚未写实现 |
| `UNDER_REVIEW` | 正在核对源码、许可证和适配边界 |
| `ADOPTED` | 已在 RoboThree 实现，目标文件和测试已登记 |
| `DEFERRED` | 已确认后置 |
| `REJECTED` | 已明确拒绝 |
| `SUPERSEDED` | 被后续条目替代，保留历史 |

## 4. 登记规则

1. 只有固定 Commit 且有源码证据的项目可以作为实现依据；
2. 研究报告用于定位，编码前必须复核对应源码；
3. `SELECTIVE_SOURCE` 转为 `ADOPTED` 前必须填写 RoboThree 目标文件；
4. 复制或修改源码必须保留许可证、版权和必要的 NOTICE；
5. 上游第三方移植、vendored 目录和多许可证目录需要单独审查；
6. AGPL/GPL 代码默认只允许 `DESIGN_ONLY`，除非完成专项法律与部署评估；
7. 任何上游类型都不能直接穿透 RoboThree Contract 边界；
8. 上游升级不自动同步，必须建立新条目或更新固定 Commit 并重新评估；
9. “常见做法”不能替代具体来源；无法找到适配方案时标记 `OWN`，并说明为什么上游不足；
10. 实际采用后必须附带 Contract/Conformance/Regression Test。

## 5. KA-0 初始登记

### UR-001：OpenClaw Gateway Bootstrap

| 字段 | 内容 |
| --- | --- |
| 上游 | OpenClaw |
| Commit | `deccdb5e57af6800d4f020ea2034166592a149ba` |
| License | MIT；存在 `THIRD_PARTY_NOTICES.md` |
| 证据 | `src/gateway/server.impl.ts`、[架构研究](../../../robothree-agent-research/research/openclaw/architecture.md) |
| RoboThree 模块 | `services/core/src/bootstrap`、`services/core/src/kernel`、Core lifecycle |
| 采用类型 | `DESIGN_ONLY`，个别独立工具函数可进入 `SELECTIVE_SOURCE` 复核 |
| 状态 | `ADOPTED`（KAF-0 Bootstrap 子集） |
| 借鉴 | 启动阶段、配置快照、SQLite preflight、Provider/Service 装配、ready/health 语义 |
| 不照搬 | 20+ Channel、Cron、Plugin Marketplace、100+ RPC、大型单文件 Gateway |
| 原因 | RoboThree KA-0 是单机内核框架，不需要 OpenClaw 的全渠道控制面 |
| RoboThree 目标文件 | `services/core/src/main.ts`、`bootstrap/create-core.ts`、`kernel/lifecycle.ts`、`kernel/core-runtime.ts` |

### UR-002：OpenClaw Model Provider 与流式取消

| 字段 | 内容 |
| --- | --- |
| 上游 | OpenClaw |
| Commit | `deccdb5e57af6800d4f020ea2034166592a149ba` |
| License | MIT；复用前核对包级第三方依赖 |
| 证据 | `packages/llm-core/src/types.ts`、`packages/llm-core/src/utils/event-stream.ts`、`src/infra/abort-signal.ts` |
| RoboThree 模块 | ModelProvider Port、ModelStreamEvent、Cancellation |
| 采用类型 | `DESIGN_ONLY`；小型通用取消/事件工具可候选 `SELECTIVE_SOURCE` |
| 状态 | `ADOPTED`（KAF-0 Port/Fake、KAF-3.2 exact Descriptor Handle 与流事件顺序 Conformance 子集） |
| 借鉴 | Provider Adapter、AbortSignal、流式事件、兼容性元数据、错误归一化 |
| 不照搬 | 多厂商模型矩阵、OpenClaw 内部消息类型、OAuth 与 Channel 耦合 |
| 原因 | KA-0 只需要 OpenAI-compatible/Fake Provider，并须保持 RoboThree Contract 独立 |
| RoboThree 目标文件 | `packages/contracts/src/model.ts`、`services/core/src/ports/model-provider.ts`、`adapters/fake/fake-model-provider.ts` |

### UR-003：Grok Build Runtime、Registry 与 Retry

| 字段 | 内容 |
| --- | --- |
| 上游 | grok-build |
| Commit | `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce` |
| License | 第一方 Apache-2.0；codex/opencode ports 和 vendored code 需单独审查 |
| 证据 | `xai-chat-state` Actor、`ToolRegistryBuilder`/`FinalizedToolset`、Sampler retry；[适配分析](../../../robothree-agent-research/research/grok-build/robothree-fit-analysis.md) |
| RoboThree 模块 | Runtime queue、Capability Registry、RetryPolicy |
| 采用类型 | `DESIGN_ONLY` |
| 状态 | `ADOPTED`（KAF-1 Runtime mailbox、KAF-3.1 RegistryBuilder/immutable snapshot 子集）；RetryPolicy 仍为 `PLANNED` |
| 借鉴 | Actor 隔离、Builder → Finalize、执行前权限、Retry-After、指数退避和 jitter |
| 不照搬 | Rust 实现、`RefCell/Mutex` 混合状态、ACP/Leader、三套 Tool 体系 |
| 原因 | RoboThree 是 TypeScript Core，需要更简单的单写入者和统一 Tool Contract |
| RoboThree 目标文件 | `services/core/src/kernel/in-memory-task-runtime.ts`、`services/core/src/registry/registry-builder.ts`；RetryPolicy 目标待 KAF-4 登记 |

### UR-004：OpenHands State、Event 与 ToolExecutionBackend

| 字段 | 内容 |
| --- | --- |
| 上游 | OpenHands Software Agent SDK |
| Commit | `4fe565663af2b4f1130a6e0dac7566b002bfe9b4` |
| License | MIT |
| 证据 | `conversation/state.py`、`conversation/event_store.py`、`workspace/base.py`、[Event 深挖](../../../robothree-agent-research/research/software-agent-sdk/mechanism-2-event-sourcing.md) |
| RoboThree 模块 | TaskRunState、Action/Observation、EventLog、ToolExecutionBackend Port |
| 采用类型 | `DESIGN_ONLY` |
| 状态 | `ADOPTED`（KAF-1 State/Action/Observation、KAF-2.1 Event Contract、KAF-2.2 event-to-state replay、KAF-3.1 Definition/Binding/Descriptor 分层、KAF-3.2 ToolExecutionBackend/typed Observation 子集） |
| 借鉴 | Definition/State 分离、类型化 Event、Local/Remote 统一接口、惰性事件视图 |
| 不照搬 | Python/Pydantic、完整 Conversation API、文件式 Event Store、Git Worktree 假设 |
| 原因 | RoboThree 需要 SQLite 事务、企业权限和独立 Task/Run/Step 所有权 |
| RoboThree 目标文件 | `packages/contracts/src/runtime/`、`packages/contracts/src/persistence/task-event.ts`、`services/core/src/kernel/task-state-reducer.ts`、`services/core/src/application/durable-task-runtime.ts`、`services/core/src/ports/tool-execution-backend.ts`、`services/core/src/adapters/tool/tool-effect-executor.ts` |

### UR-005：LangGraph Checkpoint 与 Conformance

| 字段 | 内容 |
| --- | --- |
| 上游 | LangGraph |
| Commit | `49ae27c2ae983cfb92091b0dea9f7bc37a716479` |
| License | MIT |
| 证据 | `libs/checkpoint`、`libs/checkpoint-sqlite`、`libs/checkpoint-conformance`、[架构研究](../../../robothree-agent-research/research/langgraph/architecture.md) |
| RoboThree 模块 | Checkpoint Port、Resume、Adapter Conformance Suite |
| 采用类型 | `DESIGN_ONLY` |
| 状态 | `ADOPTED`（Conformance 骨架、KAF-1 Command/Interrupt、KAF-2.1 Checkpoint/SQLite、KAF-2.2 replay/历史幂等、KAF-3.2 三类 Adapter Conformance 子集） |
| 借鉴 | Checkpoint 抽象、SQLite 实现分离、Interrupt/Resume、统一兼容测试 |
| 不照搬 | Pregel/Superstep、Graph Builder、Python 序列化类型和完整图运行时 |
| 原因 | RoboThree 需要动态 Agent Loop，不需要在 KA-0 固化完整 DAG 引擎 |
| RoboThree 目标文件 | `packages/contracts/src/persistence/task-checkpoint.ts`、`services/core/src/ports/task-persistence.ts`、`services/core/src/application/durable-task-runtime.ts`、`services/core/src/adapters/sqlite/`、`services/core/tests/task-persistence.conformance.test.ts` |

### UR-006：Hermes Context Assembly

| 字段 | 内容 |
| --- | --- |
| 上游 | Hermes Agent |
| Commit | `3d9be2789552a495c7adf30148e867e7614a4bdc` |
| License | MIT |
| 证据 | [Session/State/Memory 研究](../../../robothree-agent-research/research/hermes-agent/session-state-memory.md)、[Level 3 深挖](../../../robothree-agent-research/research/hermes-agent/level3-deep-dive.md) |
| RoboThree 模块 | Conversation/Context Contract、ContextAssembler、Memory/Knowledge Binding |
| 采用类型 | `DEFER` / `DESIGN_ONLY` |
| 状态 | `ADOPTED`（KAF-5.0a 持久消息 Envelope 与调用时 Context 版本边界子集）；ContextAssembler 留在 KAF-5.2，长期 Memory/Knowledge 仍为 `DEFERRED` |
| 借鉴 | 持久消息与调用时上下文分离、静态和动态上下文分层 |
| 不照搬 | Hermes 的具体 Prompt、Python Runtime 和自主 Memory 行为 |
| 原因 | KAF-5.0a 只冻结独立版本和持久化边界，不提前实现 Context Assembly、真实 Skill Runtime 或长期 Memory |
| RoboThree 目标文件 | `packages/contracts/src/conversation/`、`packages/contracts/src/context/version.ts`、`packages/contracts/src/compaction/`、`packages/contracts/src/model-protocol/version.ts` |

### UR-007：Open WebUI Typed UI Events 与安全反例

| 字段 | 内容 |
| --- | --- |
| 上游 | Open WebUI |
| Commit | `ecd48e2f718220a6400ecf49eafd4867a38feb10` |
| License | BSD-3-Clause + Branding Protection Clause；不进行源码复制 |
| 证据 | [Chat 架构](../../../robothree-agent-research/research/open-webui/architecture.md)、[运行链路](../../../robothree-agent-research/research/open-webui/runtime-sequence.md)、[安全研究](../../../robothree-agent-research/research/open-webui/security-review.md) |
| RoboThree 模块 | Desktop typed event protocol、Chat UI |
| 采用类型 | `DEFER` / `DESIGN_ONLY` / 部分机制 `REJECT` |
| 状态 | `DEFERRED` |
| 借鉴 | delta/status/completion 类型化事件、Chat 组件分层、Streaming 节流 |
| 不照搬 | Svelte 源码、Token in localStorage、动态 `execute/eval`、不安全 iframe |
| 原因 | 当前 Framework First；许可证、技术栈和安全边界均不适合直接复制 UI |
| RoboThree 目标文件 | Chat 集成阶段登记 |

### UR-008：Daytona Remote Worker 模式

| 字段 | 内容 |
| --- | --- |
| 上游 | Daytona |
| Commit | `ec4c21b`（研究时 partial shallow clone） |
| License | 平台 AGPL-3.0；SDK Apache-2.0 |
| 证据 | [架构研究](../../../robothree-agent-research/research/daytona/architecture.md)、[部署模型](../../../robothree-agent-research/research/daytona/deployment-model.md) |
| RoboThree 模块 | Future Remote Worker / Sandbox Control Plane |
| 采用类型 | `DEFER` / `DESIGN_ONLY` |
| 状态 | `DEFERRED` |
| 借鉴 | Control/Compute 分离、Job Polling、Heartbeat、Sandbox 生命周期 |
| 不照搬 | AGPL 平台代码、特权容器、KA-0 远程轮询和 Fleet |
| 原因 | Kernel Alpha 仅需要 Local/Fake ToolExecutionBackend；AGPL 平台嵌入存在许可证边界 |
| RoboThree 目标文件 | 无，远程执行阶段重新评估 |

### UR-009：OpenClaw SQLite Schema Preflight 与事务后发布

| 字段 | 内容 |
| --- | --- |
| 上游 | OpenClaw |
| Commit | `deccdb5e57af6800d4f020ea2034166592a149ba` |
| License | MIT；存在 `THIRD_PARTY_NOTICES.md` |
| 证据 | `src/gateway/server.impl.ts` 的 database schema preflight、`src/state/openclaw-database-preflight.ts`、`src/config/sessions/` SQLite writer/transaction 研究 |
| RoboThree 模块 | SQLite Adapter、Migration、Schema Preflight、事务后 Outbox 发布 |
| 采用类型 | `DESIGN_ONLY` |
| 状态 | `ADOPTED`（KAF-2.1 Schema Preflight/Migration、KAF-2.2 事务后 Outbox 发布子集） |
| 借鉴 | 启动时较新 schema 拒绝、迁移先于 runtime ready、受控单写入口、事务提交后发布 |
| 不照搬 | OpenClaw Session/Transcript/Channel 表、Gateway 启动链、兼容旧 JSON store 的迁移复杂度 |
| 原因 | RoboThree KAF-2 只需要 Task Event/Checkpoint/Receipt/Outbox 的本地持久化，不应引入全 Gateway 数据模型 |
| RoboThree 目标文件 | `services/core/src/adapters/sqlite/`、`services/core/src/application/outbox-dispatcher.ts`、`services/core/tests/sqlite-persistence.integration.test.ts` |

### UR-010：OpenClaw 声明式 Manifest 与启动注册

| 字段 | 内容 |
| --- | --- |
| 上游 | OpenClaw |
| Commit | `deccdb5e57af6800d4f020ea2034166592a149ba` |
| License | MIT；存在 `THIRD_PARTY_NOTICES.md` |
| 证据 | `src/plugins/manifest.ts`、Plugin Discovery → Validation → Registration → Activation 研究、[Skill/Plugin/MCP 研究](../../../robothree-agent-research/research/openclaw/skill-plugin-mcp.md) |
| RoboThree 模块 | AdapterDescriptor、RegistryBuilder 启动校验、受信声明加载 |
| 采用类型 | `DESIGN_ONLY` |
| 状态 | `ADOPTED`（KAF-3.1 受信静态声明/启动校验/冻结、KAF-3.2 bootstrap 来源 allowlist 子集） |
| 借鉴 | Manifest 只声明能力与配置 Schema；启动阶段发现、校验、注册；静态 Registry 热路径不加载实现 |
| 不照搬 | npm Plugin 安装、运行期 Activation、161 个扩展目录、Channel/Provider 大矩阵、Core 内第三方代码热加载 |
| 原因 | RoboThree Alpha 只加载官方或企业内部可信声明，并在启动时冻结 RegistrySnapshot |
| RoboThree 目标文件 | `packages/contracts/src/capability/adapter-descriptor.ts`、`services/core/src/registry/registry-builder.ts` |

### UR-011：OpenClaw/Grok 执行前授权与确认决策

| 字段 | 内容 |
| --- | --- |
| 上游 | OpenClaw + grok-build |
| Commit | OpenClaw `deccdb5e57af6800d4f020ea2034166592a149ba`；grok-build `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce` |
| License | OpenClaw MIT；grok-build 第一方 Apache-2.0，vendored/port 代码不复用 |
| 证据 | OpenClaw `src/node-host/exec-policy.ts`、`src/agents/tool-policy.ts`；grok-build `xai-grok-workspace/src/permission/types.rs`、`tool_calls.rs::prepare_tool_call()`；[Grok 适配分析](../../../robothree-agent-research/research/grok-build/robothree-fit-analysis.md) |
| RoboThree 模块 | AuthorizationEvaluator、ToolRiskFacts、UserConfirmationCoordinator、pre-dispatch Gate |
| 采用类型 | `DESIGN_ONLY` |
| 状态 | `PLANNED`（ADR-006 已接受，等待 KAF-4.1 实现） |
| 借鉴 | 执行前确定性权限 Gate、显式 allow/deny/ask 类决策、allowlist miss 失败关闭、决策与执行分离 |
| 不照搬 | yolo/auto/classifier、多层 Tool Policy、Group/Subagent/Global 策略、任意 Shell allow-always 和 UI callback 阻塞 Core |
| 原因 | RoboThree MVP 需要低打扰的固定授权与可恢复 Desktop 用户确认，不需要通用 Policy 平台 |
| RoboThree 目标文件 | KAF-4.1 预计为 `packages/contracts/src/authorization/`、`services/core/src/application/authorization-evaluator.ts`、`user-confirmation-coordinator.ts`；实际采用后以 AR 记录为准 |

## 6. 明确拒绝清单

| ID | 来源 | 机制 | 结论 | 原因 |
| --- | --- | --- | --- | --- |
| RR-001 | Open WebUI | 后端事件触发 Renderer `eval`/动态代码 | `REJECTED` | 形成模型/后端到桌面主线程的 RCE 通道 |
| RR-002 | Open WebUI | 长期 Token 存入 localStorage | `REJECTED` | Renderer/XSS 可读取凭证 |
| RR-003 | Grok Build | 三套 Tool 实现并存 | `REJECTED` | 参数和行为分裂，不利于 Contract 稳定 |
| RR-004 | LangGraph | KA-0 引入完整 Pregel Runtime | `REJECTED` | 不符合开放式 Agent Loop，复杂度过高 |
| RR-005 | Daytona | 直接嵌入 AGPL 平台代码 | `REJECTED` | 企业产品许可证和部署边界风险 |
| RR-006 | OpenClaw | 未审核 npm Plugin 在 Core 热加载 | `REJECTED` | 违反首期可信扩展和 Core 隔离原则 |

## 7. 实际采用记录模板

每个 `ADOPTED` 条目追加：

```text
RoboThree target:
Upstream source:
Upstream commit:
Adoption type:
Copied or rewritten:
Local modifications:
License/NOTICE action:
Contract test:
Regression test:
Reviewer:
Adopted date:
```

若无法完整填写，不得把条目标记为 `ADOPTED`。

## 8. KAF-0 起实际采用记录

### AR-001：Core Bootstrap 生命周期

```text
RoboThree target:
  services/core/src/main.ts
  services/core/src/bootstrap/create-core.ts
  services/core/src/kernel/lifecycle.ts
  services/core/src/kernel/core-runtime.ts
Upstream source:
  OpenClaw src/gateway/server.impl.ts
Upstream commit:
  deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten for RoboThree; no upstream source copied
Local modifications:
  Minimal component lifecycle, deterministic rollback, reverse shutdown and aggregate health
License/NOTICE action:
  No copied source; upstream reference retained in this register
Contract test:
  ComponentHealth/CoreHealth Zod validation
Regression test:
  services/core/tests/core-lifecycle.test.ts
Reviewer:
  Codex automated implementation review; human review pending
Adopted date:
  2026-07-19
```

### AR-004：每 Task 单写入者 Runtime mailbox

```text
RoboThree target:
  services/core/src/kernel/in-memory-task-runtime.ts
  services/core/tests/task-runtime.test.ts
Upstream source:
  grok-build xai-chat-state/src/actor/mod.rs
  grok-build SessionActor command loop research
Upstream commit:
  98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten in TypeScript; no Rust source copied
Local modifications:
  One Promise mailbox per Task; synchronous pure reducer; typed rejection; no RefCell/Mutex, ACP or Leader mode
License/NOTICE action:
  No copied source; Apache-2.0 upstream reference retained in this register
Contract test:
  packages/contracts/tests/runtime-contracts.test.ts
Regression test:
  services/core/tests/task-runtime.test.ts (concurrent dispatch and stale Run cases)
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-013：Capability Contract 与不可变 Registry

```text
RoboThree target:
  packages/contracts/src/capability/
  services/core/src/registry/capability-revision.ts
  services/core/src/registry/registry-builder.ts
  packages/contracts/tests/capability-contracts.test.ts
  services/core/tests/registry-builder.test.ts
  scripts/check-boundaries.mjs
Upstream source:
  grok-build ToolRegistryBuilder / FinalizedToolset
  OpenHands Tool Spec / ToolDefinition / ExecutableTool
  OpenClaw Plugin Manifest and startup Discovery / Validation / Registration
Upstream commit:
  grok-build 98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree v1alpha1 Zod Contract and TypeScript Registry; no upstream source copied
Local modifications:
  Separate Definition, Binding, AdapterDescriptor and non-Contract RuntimeAdapterHandle;
  split agent-visible model/tool from infrastructure resources;
  canonical SHA-256 exact revisions, one Alpha binding per capability and registration-order-independent snapshot;
  builder is consumed at finalize and returns a deeply frozen snapshot;
  materialized TaskCapabilityLock stores recovery records but excludes process handles, PID, connections and secrets
License/NOTICE action:
  No copied source; Apache-2.0 and MIT upstream references retained in this register
Contract test:
  packages/contracts/tests/capability-contracts.test.ts
Regression test:
  services/core/tests/registry-builder.test.ts
  scripts/check-boundaries.test.mjs
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-005：TaskRunState 与 Action/Observation

```text
RoboThree target:
  packages/contracts/src/runtime/action.ts
  packages/contracts/src/runtime/task-state.ts
  packages/contracts/src/runtime/definition.ts
  services/core/src/kernel/task-state-reducer.ts
Upstream source:
  OpenHands openhands/sdk/conversation/state.py
  OpenHands openhands/sdk/conversation/cancellation.py
  OpenHands typed Action/Observation and Event research
Upstream commit:
  4fe565663af2b4f1130a6e0dac7566b002bfe9b4
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree v1alpha1 Zod Contract and pure TypeScript reducer; no Python source copied
Local modifications:
  Separate Session/Task/Run/Step ownership; AgentDefinitionRef lock; terminal Run immutability; Retry creates new Run
License/NOTICE action:
  No copied source; MIT upstream reference retained in this register
Contract test:
  packages/contracts/tests/runtime-contracts.test.ts
Regression test:
  services/core/tests/task-runtime.test.ts
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-006：显式 Command、Waiting/Resume 与 Step 边界

```text
RoboThree target:
  packages/contracts/src/runtime/task-command.ts
  packages/contracts/src/runtime/definition.ts
  services/core/src/kernel/task-state-reducer.ts
Upstream source:
  LangGraph pregel/_loop.py Command/interrupt/resume semantics
  LangGraph runtime-sequence.md and robothree-fit-analysis.md
Upstream commit:
  49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten for RoboThree; no Python source copied
Local modifications:
  Explicit wait_step/resume_step commands; immutable PlanRevision ref per Step; no exception-based interrupt or Pregel Runtime
License/NOTICE action:
  No copied source; MIT upstream reference retained in this register
Contract test:
  packages/contracts/tests/runtime-contracts.test.ts
Regression test:
  services/core/tests/task-runtime.test.ts (wait/resume/deadline cases)
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-002：ModelProvider Port 与取消边界

```text
RoboThree target:
  packages/contracts/src/model.ts
  services/core/src/ports/model-provider.ts
  services/core/src/adapters/fake/fake-model-provider.ts
Upstream source:
  OpenClaw packages/llm-core/src/types.ts
  OpenClaw packages/llm-core/src/utils/event-stream.ts
  OpenClaw src/infra/abort-signal.ts
Upstream commit:
  deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as minimal RoboThree v1alpha1 Contract; no upstream source copied
Local modifications:
  Only Fake/OpenAI-compatible-ready streaming semantics; no vendor-specific types
License/NOTICE action:
  No copied source; upstream reference retained in this register
Contract test:
  packages/contracts/tests/contracts.test.ts
Regression test:
  services/core/tests/model-provider.conformance.test.ts
Reviewer:
  Codex automated implementation review; human review pending
Adopted date:
  2026-07-19
```

### AR-003：Adapter Conformance Test 骨架

```text
RoboThree target:
  services/core/tests/model-provider.conformance.test.ts
Upstream source:
  LangGraph libs/checkpoint-conformance
Upstream commit:
  49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten for TypeScript ModelProvider; no upstream source copied
Local modifications:
  Initial ordered-stream and cancellation checks; shared suite extraction remains KAF-3 work
License/NOTICE action:
  No copied source; upstream reference retained in this register
Contract test:
  ModelRequest/ModelStreamEvent Zod validation
Regression test:
  services/core/tests/model-provider.conformance.test.ts
Reviewer:
  Codex automated implementation review; human review pending
Adopted date:
  2026-07-19
```

### AR-007：Task Event 与持久状态投影

```text
RoboThree target:
  packages/contracts/src/persistence/task-event.ts
  packages/contracts/src/persistence/task-checkpoint.ts
  services/core/src/ports/task-persistence.ts
Upstream source:
  OpenHands openhands/sdk/conversation/event_store.py
  OpenHands tests/sdk/conversation/test_event_store.py
Upstream commit:
  4fe565663af2b4f1130a6e0dac7566b002bfe9b4
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree JSON-safe Contract and TaskPersistence semantics; no Python source copied
Local modifications:
  SQLite append-only task sequence, Command causation, full TaskRunState checkpoint; no file-per-event tree
License/NOTICE action:
  No copied source; MIT upstream reference retained in this register
Contract test:
  packages/contracts/tests/persistence-contracts.test.ts
Regression test:
  services/core/tests/task-persistence.conformance.test.ts
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-008：Checkpoint Port、SQLite 与 Conformance

```text
RoboThree target:
  packages/contracts/src/persistence/task-checkpoint.ts
  services/core/src/ports/task-persistence.ts
  services/core/src/adapters/memory/in-memory-task-persistence.ts
  services/core/src/adapters/sqlite/sqlite-task-persistence.ts
  services/core/tests/task-persistence.conformance.test.ts
Upstream source:
  LangGraph libs/checkpoint/langgraph/checkpoint/base
  LangGraph libs/checkpoint-sqlite/langgraph/checkpoint/sqlite
  LangGraph libs/checkpoint-conformance
Upstream commit:
  49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten in TypeScript for TaskRunState; no Python or upstream SQL copied
Local modifications:
  Full checkpoint per accepted Command, canonical digest, semantic atomic commit, shared InMemory/SQLite suite
License/NOTICE action:
  No copied source; MIT upstream reference retained in this register
Contract test:
  packages/contracts/tests/persistence-contracts.test.ts
Regression test:
  services/core/tests/task-persistence.conformance.test.ts
  services/core/tests/sqlite-persistence.integration.test.ts
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-009：SQLite Schema Preflight 与 Migration

```text
RoboThree target:
  services/core/src/adapters/sqlite/migrations.ts
  services/core/src/adapters/sqlite/schema-preflight.ts
  services/core/src/adapters/sqlite/sqlite-task-persistence.ts
Upstream source:
  OpenClaw src/gateway/server.impl.ts database schema preflight
  OpenClaw src/state/openclaw-database-preflight.ts
  OpenClaw src/config/sessions SQLite transaction research
Upstream commit:
  deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten for RoboThree task persistence; no OpenClaw source or schema copied
Local modifications:
  Forward-only migration, newer/missing schema fail-closed, WAL/FULL durability, node:sqlite adapter
License/NOTICE action:
  No copied source; MIT upstream reference retained in this register
Contract test:
  packages/contracts/tests/persistence-contracts.test.ts
Regression test:
  services/core/tests/sqlite-persistence.integration.test.ts
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-010：Durable Command、Checkpoint 与 Event Tail Replay

```text
RoboThree target:
  services/core/src/application/durable-task-runtime.ts
  services/core/src/ports/task-persistence.ts
  services/core/src/adapters/memory/in-memory-task-persistence.ts
  services/core/src/adapters/sqlite/sqlite-task-persistence.ts
Upstream source:
  OpenHands openhands/sdk/conversation/event_store.py event-to-state view
  LangGraph libs/checkpoint and checkpoint-conformance replay/idempotency semantics
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Application service; no Python source copied
Local modifications:
  Per-Task mailbox, pure reducer orchestration, atomic Receipt/Event/Checkpoint/Head/Outbox commit,
  historical accepted/rejected result replay, canonical digest conflict and fail-closed tail reconstruction
License/NOTICE action:
  No copied source; MIT upstream references retained in this register
Contract test:
  Existing v1alpha1 Runtime and Persistence Contract suites
Regression test:
  services/core/tests/durable-task-runtime.test.ts
  services/core/tests/task-persistence.conformance.test.ts
  services/core/tests/sqlite-persistence.integration.test.ts
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-011：事务后 Outbox 发布与重启续发

```text
RoboThree target:
  services/core/src/application/outbox-dispatcher.ts
  services/core/src/ports/event-publisher.ts
  services/core/src/adapters/fake/fake-event-publisher.ts
  services/core/src/adapters/sqlite/sqlite-task-persistence.ts
Upstream source:
  OpenClaw SQLite writer/transaction and post-commit publication research
Upstream commit:
  deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten for RoboThree Outbox Contract; no OpenClaw source or schema copied
Local modifications:
  Explicit drain, pending query, attempt accounting, publish-then-ack and at-least-once crash semantics
License/NOTICE action:
  No copied source; MIT upstream reference retained in this register
Contract test:
  packages/contracts/tests/persistence-contracts.test.ts
Regression test:
  services/core/tests/durable-task-runtime.test.ts
  services/core/tests/task-persistence.conformance.test.ts
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-012：Intent-first Effect 与崩溃恢复

```text
RoboThree target:
  packages/contracts/src/persistence/effect-attempt.ts
  services/core/src/application/effect-coordinator.ts
  services/core/src/application/task-recovery-coordinator.ts
  services/core/src/ports/effect-executor.ts
  services/core/src/adapters/fake/fake-effect-executor.ts
  services/core/src/ports/task-persistence.ts
  services/core/src/adapters/memory/in-memory-task-persistence.ts
  services/core/src/adapters/sqlite/sqlite-task-persistence.ts
Upstream source:
  OpenHands typed Action/Observation, EventLog stable identity and event-to-state view
  LangGraph checkpoint/pending-write idempotency, interrupt and conformance patterns
  OpenClaw SQLite single-writer and post-commit publication research
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Effect protocol; no upstream source or schema copied
Local modifications:
  Intent-first prepared/dispatched/result lifecycle; stable idempotency key lookup and concurrent replay;
  executor-declared idempotent_retry/query_then_retry/manual_reconciliation policy;
  terminal or uncertain Effect transition atomically coupled to the reducer Command;
  unknown external result converges to waiting/external_dependency instead of blind retry
License/NOTICE action:
  No copied source; MIT upstream references retained in this register
Contract test:
  packages/contracts/tests/persistence-contracts.test.ts
Regression test:
  services/core/tests/effect-recovery.test.ts
  services/core/tests/task-persistence.conformance.test.ts
  services/core/tests/durable-task-runtime.test.ts
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-20
```

### AR-014：确定性 Resolver、Typed Tool Port 与持久能力锁

```text
RoboThree target:
  services/core/src/registry/capability-resolver.ts
  services/core/src/registry/runtime-adapter-handles.ts
  services/core/src/ports/model-provider.ts
  services/core/src/ports/tool-catalog-provider.ts
  services/core/src/ports/tool-execution-backend.ts
  services/core/src/application/task-capability-lock-service.ts
  services/core/src/application/tool-execution-service.ts
  services/core/src/adapters/tool/tool-effect-executor.ts
  services/core/src/adapters/fake/fake-tool-*.ts
  services/core/src/adapters/{memory,sqlite}/
Upstream source:
  OpenHands typed Action/Observation and Local/Remote tool execution boundary
  LangGraph adapter/checkpoint conformance pattern
  OpenClaw provider adapter and trusted manifest startup validation
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten for RoboThree typed Ports, TaskCapabilityLock and ADR-007 Effect protocol; no upstream source copied
Local modifications:
  Resolver only accepts exact capabilityId and frozen registry revision, with no search, scoring or fallback;
  revoked/disabled/credential/health state can only deny the exact locked route;
  Core-only RuntimeAdapterHandle requires exact descriptor ID/revision/kind;
  RegistryBuilder validates an explicit bootstrap trust allowlist instead of trusting a self-declared official flag;
  TaskCapabilityLock uses semantic InMemory/SQLite persistence and is committed before Effect Intent;
  Fake Tool Observation is carried through the existing Intent-first Effect and atomic Event/Checkpoint result chain
License/NOTICE action:
  No copied source; MIT upstream references retained in this register
Contract test:
  packages/contracts/tests/capability-contracts.test.ts
Regression test:
  services/core/tests/capability-resolver.test.ts
  services/core/tests/tool-ports.conformance.test.ts
  services/core/tests/tool-execution.integration.test.ts
  services/core/tests/task-persistence.conformance.test.ts
  services/core/tests/sqlite-persistence.integration.test.ts
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-21
```

### AR-015：Process Echo 进程边界、取消与恢复

```text
RoboThree target:
  services/core/src/adapters/process-echo/
  services/core/src/adapters/tool/tool-effect-executor.ts
  services/core/src/application/effect-coordinator.ts
  services/core/src/ports/{effect-executor,tool-execution-backend}.ts
  services/core/tests/process-echo-tool.integration.test.ts
Upstream source:
  OpenHands typed Action/Observation, Local/Remote execution boundary and cancellation token
  OpenClaw trusted startup/lifecycle, provider AbortSignal and health/readiness patterns
  LangGraph persistence/recovery Conformance pattern
  grok-build permission-before-dispatch and turn/tool cancellation ordering
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  grok-build 98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as a RoboThree TypeScript child-process Adapter and internal NDJSON protocol; no upstream source or schema copied
Local modifications:
  Fixed process.execPath child entry with shell disabled and minimal environment;
  strict versioned handshake, bounded NDJSON/stdout/stderr and exact request/effect/action correlation;
  effectAttemptId/idempotencyKey remain stable while each transport retry gets a new requestId;
  AbortSignal propagates through Application/Effect/Executor/Backend;
  dispatched is committed before Backend invocation, and untrusted post-dispatch results remain recoverable rather than becoming deterministic failures;
  SQLite close/reopen proves same locked Effect recovery without persisting PID or Runtime Handle
License/NOTICE action:
  No copied source; upstream references retained in this register
Contract test:
  Internal Adapter protocol only; no public Contract expansion
Regression test:
  services/core/tests/process-echo-tool.integration.test.ts
  services/core/tests/tool-execution.integration.test.ts
  services/core/tests/effect-recovery.test.ts
  services/core/tests/tool-ports.conformance.test.ts
Reviewer:
  Codex automated implementation review; independent QA pending
Adopted date:
  2026-07-21
```

### AR-016：固定授权、持久用户确认与 Effect 前置 Gate

```text
RoboThree target:
  packages/contracts/src/authorization/
  packages/contracts/src/runtime/{action,task-state}.ts
  services/core/src/application/{authorization-evaluator,user-confirmation-coordinator,tool-execution-service}.ts
  services/core/src/adapters/{memory,sqlite}/
  services/core/src/persistence/contract-upgrade.ts
Upstream source:
  grok-build AccessKind/Decision and permission-before-dispatch boundary
  OpenClaw execution allowlist/confirmation normalized as a pure decision
  LangGraph durable interrupt/resume and checkpoint recovery
  OpenHands typed Action/Observation execution result boundary
Upstream commit:
  grok-build 98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree v1alpha2 Contracts, pure TypeScript evaluator and semantic persistence; no upstream source copied
Local modifications:
  fixed three-state decision with deny precedence and no natural-language Policy;
  FileGrant/WorkspaceGrant segment-safe boundary checks and routine-file no-prompt behavior;
  exact single-Action or Task/external-target/data-scope confirmation;
  confirmation request/decision atomically coupled to Task waiting/resume or typed user_rejected Observation;
  Authorization is re-evaluated before Effect prepared and between prepared/dispatched;
  v1alpha1 approval checkpoints use a digest-validating explicit read upgrader;
  public Contract contains no Runtime Handle, PID, credential, file body or Prompt body
License/NOTICE action:
  No copied source; upstream references retained in this register
Contract test:
  packages/contracts/tests/authorization-contracts.test.ts
Regression test:
  services/core/tests/authorization-evaluator.test.ts
  services/core/tests/user-confirmation.integration.test.ts
  services/core/tests/contract-upgrade.test.ts
  services/core/tests/tool-execution.integration.test.ts
  services/core/tests/process-echo-tool.integration.test.ts
Reviewer:
  Codex automated implementation review; independent Claude Code QA pending
Adopted date:
  2026-07-22
```

### AR-017：有界 Admission、类型化 Retry 与 Outbox Backoff

```text
RoboThree target:
  packages/contracts/src/capability/adapter-descriptor.ts
  packages/contracts/src/persistence/outbox.ts
  services/core/src/application/{runtime-admission-controller,retry-policy,retry-coordinator,outbox-dispatcher}.ts
  services/core/src/ports/{scheduler,random-source}.ts
  services/core/src/adapters/{memory,sqlite,process-echo}/
Upstream source:
  LangGraph configurable retry/backoff and checkpoint conformance patterns
  OpenClaw bounded execution/AbortSignal and post-commit event delivery patterns
  OpenHands typed execution errors, cancellation and Local/Remote execution boundary
Upstream commit:
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree TypeScript admission, retry and durable Outbox scheduling; no upstream source or schema copied
Local modifications:
  Alpha limits are 16 active Runs, 8 active Tool dispatches and 256 queued admissions;
  FIFO queue is explicitly bounded, queued cancel/deadline removes work immediately, and leases release in finally;
  locked AdapterDescriptor may only narrow Tool concurrency, with Process Echo fixed to single-flight and no internal Promise queue;
  pure RetryPolicy uses three attempts, 2s exponential base, 20% jitter, 30s cap and trusted Retry-After;
  generic RetryCoordinator only accepts pre-Effect/idempotent non-Effect scopes and cannot import Tool Effect dispatch;
  Outbox nextAttemptAt is persisted through SQLite migration 4, selected only when due, and retains at-least-once delivery without sleeping in Task mailboxes
License/NOTICE action:
  No copied source; upstream references retained in this register
Contract test:
  packages/contracts/tests/{capability-contracts,persistence-contracts}.test.ts
Regression test:
  services/core/tests/admission-controller.test.ts
  services/core/tests/retry-policy.test.ts
  services/core/tests/durable-task-runtime.test.ts
  services/core/tests/task-persistence.conformance.test.ts
  services/core/tests/sqlite-persistence.integration.test.ts
  services/core/tests/tool-execution.integration.test.ts
  services/core/tests/process-echo-tool.integration.test.ts
Reviewer:
  Codex automated implementation review; Claude Code independent QA PASS on 2026-07-23 (31 files / 283 tests / 21 acceptance checks / 0 issues)
Adopted date:
  2026-07-23
```

### AR-019：Durable Compaction 与最小有界 Agent Loop

```text
RoboThree target:
  services/core/src/application/{compaction-coordinator,compacted-context-view,agent-loop-coordinator}.ts
  services/core/src/ports/{compaction-summarizer,agent-tool-call-executor}.ts
  services/core/src/adapters/fake/{fake-compaction-summarizer,scripted-model-provider,fake-agent-tool-call-executor}.ts
  services/core/tests/{compaction-coordinator,agent-loop-coordinator}.test.ts
Upstream source:
  Pi Agent append-only compaction entry and transform/tool turn sequencing
  OpenHands typed model/event/action/observation separation
  LangGraph checkpoint recovery and conformance patterns
Upstream commit:
  Pi Agent c9715af
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Application coordinators and typed Ports; no upstream source, prompt, schema, graph runtime, or provider payload copied
Local modifications:
  compaction keeps the existing Session two-transaction and CAS persistence model;
  the summarizer call runs outside database transactions with a stable Job and new transport request ID;
  context reconstruction reads only the active immutable Summary plus raw tail;
  Agent Loop is explicitly bounded and validates Tool Call/Observation identity before continuing;
  cancellation and incomplete model streams fail closed;
  long-term Memory, real Skill Runtime, real Model Provider, Desktop, Central Service and graph scheduling remain excluded
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/src/model.ts adds only a provider-neutral tool_call stream event
Regression test:
  services/core/tests/compaction-coordinator.test.ts
  services/core/tests/agent-loop-coordinator.test.ts
  services/core/tests/model-provider.conformance.test.ts
Reviewer:
  Codex automated implementation review; KAF-5.3 remains IN_PROGRESS and is not ready for independent stage-closing QA
Adopted date:
  2026-07-23
```

### AR-018：有界事件流、优雅停止与性能可靠性 Harness

```text
RoboThree target:
  services/core/src/reliability/{bounded-event-stream,performance-harness}.ts
  services/core/src/application/{graceful-work-controller,outbox-dispatcher,durable-task-runtime}.ts
  services/core/src/ports/graceful-shutdown.ts
  services/core/src/kernel/lifecycle.ts
  services/core/src/adapters/stream/bounded-event-stream-publisher.ts
  services/core/tests/{bounded-event-stream,graceful-shutdown,reliability-stress,long-run-reliability}.test.ts
  services/core/tests/performance/
Upstream source:
  Open WebUI typed delta/status/completion and streaming throttle design
  OpenClaw bounded streaming, AbortSignal and reverse lifecycle shutdown design
  LangGraph checkpoint/replay and conformance measurement pattern
Upstream commit:
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree TypeScript bounded streams, lifecycle coordination and reproducible benchmark tooling; no upstream source, UI code or schema copied
Local modifications:
  each subscriber has an explicit buffer capacity and absolute ceiling;
  only non-durable delta with the same stream/coalesce key can be replaced;
  critical-only overflow disconnects the slow subscriber explicitly instead of dropping confirmation/error/terminal/durable events or growing memory;
  graceful shutdown stops admission, aborts active work, waits to a fixed deadline, stops Outbox drain, and then closes RuntimeComponent adapters in reverse order;
  DurableTaskRuntime snapshot caching is explicitly bounded and Outbox backlog recovery has a bounded batch count;
  performance reports separate warmup/samples and record p50/p95/p99, environment, data scale and SQLite durability parameters
License/NOTICE action:
  No copied source; Open WebUI remains design-only because of its BSD-3-Clause plus Branding Protection terms
Contract test:
  No public Contract expansion; in-process stream and shutdown ports remain Core-internal
Regression test:
  services/core/tests/bounded-event-stream.test.ts
  services/core/tests/graceful-shutdown.test.ts
  services/core/tests/reliability-stress.test.ts
  services/core/tests/long-run-reliability.test.ts
  services/core/tests/performance/
  services/core/tests/sqlite-persistence.integration.test.ts
Reviewer:
  Codex automated implementation review; independent Claude Code QA pending
Adopted date:
  2026-07-23
```

### AR-020：DCF-0 安全桌面壳与受控 Core 进程

```text
RoboThree target:
  apps/desktop/src/{main,preload,renderer,shared}/
  apps/desktop/tests/
Upstream source:
  OpenClaw bounded child-process lifecycle, AbortSignal and reverse shutdown patterns
  Open WebUI UI/runtime separation and typed status projection patterns
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree Electron Main/Preload/Renderer boundaries and a fixture-only Node child supervisor;
  no upstream source, UI component, protocol, schema or prompt copied
Local modifications:
  Electron Main is the only owner of the child lifecycle and private loopback transport;
  a per-launch token is delivered through child IPC instead of argv, URL or Renderer state;
  concurrent starts coalesce, stderr is bounded, shutdown is graceful and unexpected restart is limited;
  Renderer only consumes a typed status projection through a Preload whitelist and has no direct transport;
  DCF-0 routes and projections are explicitly fixtures and do not implement Desktop Local Runtime Contract business semantics
License/NOTICE action:
  No copied source; Open WebUI remains design-only because of its BSD-3-Clause plus Branding Protection terms
Contract test:
  No production Contract expansion; apps/desktop/src/shared/foundation-api.ts is fixture-only
Regression test:
  apps/desktop/tests/core-harness.integration.test.ts
  apps/desktop/tests/create-desktop-api.test.ts
  apps/desktop/tests/window-security.test.ts
Reviewer:
  Codex implementation review complete; Claude Code independent QA pending
Adopted date:
  2026-07-24
```

### AR-021：CGF-0 模块化 Gateway 骨架与跨语言 Fixture

```text
RoboThree target:
  services/central-service/
  tests/e2e/cgf-foundation-fixture.test.ts
Upstream source:
  OpenClaw gateway/process isolation and compatibility boundary patterns
  Open WebUI provider-facing gateway versus UI/management separation
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as a RoboThree Java 21 modular monolith scaffold with an explicitly non-semantic
  TS/Java Fixture; no upstream Java, Python, TypeScript, DTO, route or schema copied
Local modifications:
  Central remains separate from Local Agent Loop, Session/Task, Workspace and personal credentials;
  Java and TypeScript validate the same JSON Fixture while owning independent language types;
  fixture endpoints bind loopback/random port, use no-store and carry an explicit fixture response marker;
  formal identity, configuration, model/tool DTOs, database migrations and runtime activation stay excluded until CGF-1
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  services/central-service/src/test/resources/conformance/cgf-foundation.fixture.json
  tests/e2e/cgf-foundation-fixture.test.ts
Regression test:
  services/central-service/src/test/java/com/robothree/central/compatibility/
  services/central-service/src/test/java/com/robothree/central/foundation/
Reviewer:
  Codex implementation review complete; Claude Code independent QA pending
Adopted date:
  2026-07-24
```

### AR-022：DCF-1.0 strict Desktop Contract 与 durable delivery 语义

```text
RoboThree target:
  packages/contracts/src/desktop-local/v1alpha1/
  packages/contracts/fixtures/desktop-local/v1alpha1/
  packages/contracts/tests/desktop-local-v1alpha1-contracts.test.ts
  tests/e2e/desktop-contract-consumer-conformance.test.ts
Upstream source:
  OpenClaw typed gateway boundary, bounded delivery and process/runtime separation
  Open WebUI typed streaming event and UI/runtime projection separation
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as RoboThree strict Zod Desktop Contract and shared valid/invalid corpus;
  no upstream schema, event type, route, UI source or protocol copied
Local modifications:
  Desktop Main and Local Core use one v1alpha1 contract family;
  durable and ephemeral events are distinct unions;
  replay_reset_required, bounded projection semantics and Query references are explicit;
  heartbeat remains outside durable/domain events;
  submitTurn is a high-level command and no business Route or coordinator is implemented in DCF-1.0
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/desktop-local-v1alpha1-contracts.test.ts
  tests/e2e/desktop-contract-consumer-conformance.test.ts
Reviewer:
  Codex developer self-review complete; Claude Code independent QA pending
Adopted date:
  2026-07-24
```

### AR-023：CGF-1.0 canonical Enterprise Contract 与身份边界

> 身份 Adapter 子集已由 AR-024 替代；canonical 配置、Package、Descriptor、
> digest、credentialRef 禁入和跨语言 Conformance 部分继续有效。

```text
RoboThree target:
  contracts/enterprise-gateway/v1alpha1/
  docs/adr/014-enterprise-client-identity-and-credential-bootstrap.md
  tests/e2e/enterprise-contract-conformance.test.ts
  services/central-service/src/test/java/com/robothree/central/contract/
Upstream source:
  OpenClaw gateway compatibility, credential isolation and fail-closed boundary patterns
  Open WebUI provider gateway versus client/UI responsibility separation
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as language-neutral OpenAPI 3.1, JSON Schema 2020-12, shared Fixture
  and independent TypeScript/Java conformance consumers; no upstream DTO, route,
  credential code, schema or provider implementation copied
Local modifications:
  root contracts/enterprise-gateway/v1alpha1 is the sole canonical source;
  enterprise credentialRef is forbidden from client Snapshot/Descriptor;
  PackageDocument has UTF-8 byte, document, file-count, path and materialization limits;
  Enrollment is only the first EnterpriseClientIdentityProvider Adapter;
  EnterpriseCredentialStore remains separate from PersonalCredentialStore;
  ADR-014 remains PROPOSED and no identity Route, database or production Secret Adapter is implemented
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  tests/e2e/enterprise-contract-conformance.test.ts
  services/central-service/src/test/java/com/robothree/central/contract/EnterpriseContractConformanceTest.java
Reviewer:
  TypeScript developer self-review complete; Java 21 compile and Claude Code independent QA pending
Adopted date:
  2026-07-24
```

### AR-024：OA Identity、Device Challenge/Proof 与不可导出 Signer

```text
RoboThree target:
  docs/adr/014-enterprise-client-identity-and-credential-bootstrap.md
  contracts/enterprise-gateway/v1alpha1/
  tests/e2e/enterprise-contract-conformance.test.ts
  services/central-service/src/test/java/com/robothree/central/contract/
Upstream source:
  OWN — 企业 OA、Managed Device Trust、平台不可导出密钥和用户确认的安全边界；
  没有开源 Agent 的身份实现可以作为 RoboThree 企业设备信任事实源
Upstream commit:
  NOT_APPLICABLE
Adoption type:
  OWN
Copied or rewritten:
  No upstream identity, device, cryptography, credential, schema or protocol source copied
Local modifications:
  OA identity verification and device trust are independent factors;
  Local EnterpriseDeviceSigner never exports a private key;
  Central issues a short-lived single-use challenge and validates proof, device registration,
  revocation, compliance, permission and compatibility before issuing a token;
  Manual Enrollment is optional and never proves user identity;
  identity schema revision does not change Configuration Snapshot, Package, Descriptor,
  canonical digest, credentialRef exclusion, or Storage/Runtime Activation
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  tests/e2e/enterprise-contract-conformance.test.ts
  services/central-service/src/test/java/com/robothree/central/contract/EnterpriseContractConformanceTest.java
Regression test:
  scripts/check-boundaries.test.mjs
Reviewer:
  Codex developer self-review and TypeScript/Java Conformance complete;
  Claude Code independent QA PASS with P0/P1/P2/P3 all zero;
  ADR-014 accepted by the user on 2026-07-25
Adopted date:
  2026-07-24
```

### AR-025：CGF-1.1A PostgreSQL Persistence Foundation

```text
RoboThree target:
  services/central-service/src/main/resources/db/migration/
  services/central-service/src/main/java/com/robothree/central/persistence/
  services/central-service/src/main/java/com/robothree/central/authentication/port/
  services/central-service/src/main/java/com/robothree/central/configuration/
  services/central-service/src/test/java/com/robothree/central/persistence/
Upstream source:
  OpenHands EventLog stable identity and event-to-state separation
  LangGraph checkpoint persistence conformance pattern
  OpenClaw database schema preflight and fail-closed compatibility pattern
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY
Copied or rewritten:
  Rewritten as a RoboThree Java 21 / Spring JDBC / PostgreSQL persistence spine;
  no upstream SQL, repository, migration, schema, DTO or test source copied
Local modifications:
  V1-V4 migrations follow ADR-014 ownership and never persist OA login material,
  Bearer token plaintext, device private keys or local key-provider handles;
  semantic typed repositories replace generic CRUD;
  InMemory and PostgreSQL adapters run the same conformance;
  schema preflight rejects newer, incomplete, missing-table and missing-index states;
  trusted immutable configuration seeding is transaction-bound;
  PostgreSQL 16 Testcontainers is the canonical container path and a PostgreSQL 16
  embedded test path preserves real-database verification when Docker is unavailable
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  services/central-service/src/test/java/com/robothree/central/persistence/CentralPersistenceConformance.java
Regression test:
  services/central-service/src/test/java/com/robothree/central/persistence/
  services/central-service/src/test/java/com/robothree/central/configuration/application/TrustedConfigurationSeederTest.java
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA PASS; user accepted CGF-1.1A
Adopted date:
  2026-07-25
```

### AR-026：CGF-1.1B Identity、Challenge/Proof 与 Device Trust

```text
RoboThree target:
  services/central-service/src/main/java/com/robothree/central/authentication/
  services/central-service/src/main/resources/db/migration/V5__challenge_consumption_idempotency.sql
  services/central-service/src/test/java/com/robothree/central/authentication/
  services/central-service/src/test/java/com/robothree/central/persistence/DeviceEnrollmentJdbcRecoveryConformance.java
Upstream source:
  OpenHands stable identity and durable fact separation
  LangGraph adapter/persistence conformance across implementations
  OpenClaw fail-closed gateway compatibility and typed boundary errors
  OWN — enterprise OA, managed-device trust, ES256 proof and replay defense
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + OWN_SECURITY
Copied or rewritten:
  Rewritten as RoboThree Java Application/Port/Adapter code;
  no upstream identity, cryptography, HTTP, migration or test source copied
Local modifications:
  OA identity and managed-device trust remain separate factors;
  deviceKeyId never substitutes for challenge signature and current trust state;
  challenge consumption is durable, single-writer and request-digest aware;
  manual enrollment is optional, requires an already verified OA identity and a one-time IT grant;
  only ES256 with SPKI DER is executable in Alpha, while private keys never enter Central;
  formal identity routes are strict/no-store and Token/Configuration routes remain gated
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  services/central-service/src/test/java/com/robothree/central/authentication/adapter/http/
Regression test:
  services/central-service/src/test/java/com/robothree/central/authentication/application/
  services/central-service/src/test/java/com/robothree/central/persistence/
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA PASS; user accepted CGF-1.1B
Adopted date:
  2026-07-25
```

### AR-027：CGF-1.1C Token、Permission、Compatibility 与 Configuration Read

```text
RoboThree target:
  services/central-service/src/main/java/com/robothree/central/authentication/
  services/central-service/src/main/java/com/robothree/central/configuration/
  services/central-service/src/main/java/com/robothree/central/shared/json/
  services/central-service/src/test/java/com/robothree/central/authentication/
  services/central-service/src/test/java/com/robothree/central/configuration/
Upstream source:
  OpenHands gateway boundary and stable identity/durable fact separation
  LangGraph durable state and adapter conformance pattern
  OpenClaw fail-closed gateway compatibility/config validation
  OWN — four-factor enterprise token and JWS/Secret/plaintext security boundary
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + OWN_SECURITY
Copied or rewritten:
  Rewritten as RoboThree Java Application/Port/Adapter and canonical integrity code;
  no upstream token, JOSE, permission, compatibility, configuration or test source copied
Local modifications:
  token issuance requires identity, current device trust, fixed permission and frozen
  compatibility, then rechecks mutable facts under the challenge transaction;
  compact token plaintext is returned only after commit and only its SHA-256 digest persists;
  token validation binds signature, issuer, audience, time, issuance fact and five subjects;
  configuration requires configuration.read, returns an exact canonical snapshot and stable ETag;
  seed/read paths verify snapshot, package, file digests and package references fail closed;
  only a test JWS codec and test secret handles exist in this batch
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  services/central-service/src/test/java/com/robothree/central/authentication/adapter/http/
Regression test:
  services/central-service/src/test/java/com/robothree/central/authentication/application/
  services/central-service/src/test/java/com/robothree/central/configuration/application/
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA PASS; user accepted CGF-1.1C
Adopted date:
  2026-07-25
```

### AR-028：CGF-1.1D PostgreSQL 全链恢复矩阵

```text
RoboThree target:
  services/central-service/src/test/java/com/robothree/central/persistence/Cgf11dPostgreSqlRecoveryConformance.java
  services/central-service/src/test/java/com/robothree/central/persistence/PostgreSqlCentralPersistenceIntegrationTest.java
  services/central-service/src/test/java/com/robothree/central/persistence/EmbeddedPostgreSqlCentralPersistenceIntegrationTest.java
  scripts/check-boundaries.mjs
Upstream source:
  OpenHands stable typed Action/fact boundaries and restart-oriented integration tests
  LangGraph durable state, replay/failure injection and Adapter conformance pattern
  OpenClaw fail-closed Gateway compatibility and credential non-disclosure boundary
  RoboThree KAF-2/KAF-5 named crash-point and recovery Harness practice
  OWN — enterprise identity/device/token/configuration security matrix
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY
Copied or rewritten:
  Rewritten as a RoboThree Java/PostgreSQL test Harness;
  no upstream recovery, identity, token, database or test source copied
Local modifications:
  one identical Harness runs against Docker PostgreSQL and Embedded PostgreSQL;
  every Application/Port/Adapter object is rebuilt at named committed boundaries;
  before-commit failure rolls back Challenge consumption and Token issuance;
  commit-before-response preserves the issuance fact and requires a new Challenge;
  bounded concurrency proves one writer, equal expiry fails closed, and generated
  OA material, enrollment code and Bearer Token plaintext are absent from the database;
  fault hooks remain test-only and no migration or canonical Contract is changed
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  Existing Enterprise Gateway v1alpha1 corpus remains unchanged
Regression test:
  services/central-service/src/test/java/com/robothree/central/persistence/
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA PASS; user accepted CGF-1.1D and closed CGF-1.1
Adopted date:
  2026-07-25
```

### AR-029：CGF-1.2A exact Package Read 与本地 Token Session

```text
RoboThree target:
  contracts/enterprise-gateway/v1alpha1/
  packages/contracts/src/desktop-local/v1alpha2/
  services/core/src/ports/enterprise-access-token-provider.ts
  services/core/src/application/enterprise-configuration-token-session.ts
  services/core/src/application/enterprise-configuration-status.ts
  services/central-service/src/main/java/com/robothree/central/configuration/
  tests/e2e/enterprise-contract-conformance.test.ts
  scripts/check-boundaries.mjs
Upstream source:
  OpenClaw immutable startup/config snapshot and fail-closed compatibility boundary
  LangGraph shared Adapter conformance and durable snapshot discipline
  RoboThree ADR-008/009/014 and CGF-1.0/1.1 canonical Contract practice
  OWN — exact Snapshot closure authorization, four-factor Token session and
  pointer-derived enterprise configuration activation status
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY + OWN_CONTRACT
Copied or rewritten:
  Rewritten for RoboThree TypeScript/Java boundaries;
  no upstream Contract, authentication, HTTP, token or configuration source copied
Local modifications:
  canonical v1alpha1 adds an exact Snapshot-bound Package read without latest/list/write;
  Central requires token, configuration.read, exact membership and stable ETag;
  Local EnterpriseAccessTokenProvider remains separate from the Central issuer;
  one operation permits at most one same-scope renewal and rechecks before sealing;
  Desktop Local v1alpha2 exposes only safe derived activation status and durable event;
  v1alpha1 remains strict and Kernel remains free of enterprise configuration orchestration
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  contracts/enterprise-gateway/v1alpha1/fixtures/manifest.json
  packages/contracts/tests/desktop-local-v1alpha2-contracts.test.ts
  tests/e2e/enterprise-contract-conformance.test.ts
  services/central-service/src/test/java/com/robothree/central/contract/
Regression test:
  services/core/tests/enterprise-configuration-token-session.test.ts
  services/core/tests/enterprise-configuration-status.test.ts
  services/central-service/src/test/java/com/robothree/central/authentication/adapter/http/
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-25
```

### AR-030：CGF-1.2B 本地配置物化与 Storage Activation

```text
RoboThree target:
  packages/contracts/src/enterprise-configuration-consumer/
  services/core/src/application/configuration-validator.ts
  services/core/src/application/package-materializer.ts
  services/core/src/application/configuration-activation-coordinator.ts
  services/core/src/ports/enterprise-configuration-persistence.ts
  services/core/src/adapters/memory/in-memory-enterprise-configuration-persistence.ts
  services/core/src/adapters/sqlite/enterprise-configuration-*.ts
  services/core/src/adapters/sqlite/sqlite-enterprise-configuration-persistence.ts
  services/core/tests/enterprise-configuration-*.test.ts
Upstream source:
  OpenClaw immutable startup configuration and fail-closed schema preflight
  LangGraph Persistence Adapter and shared Conformance pattern
  OpenHands stable identity facts separated from runtime projections
  RoboThree KAF-2/KAF-5 single-writer, atomic commit, named fault and recovery Harness
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Application/Port/Adapter code and tests;
  no upstream configuration, persistence, SQL, schema or test source copied
Local modifications:
  strict consumer remains subordinate to the canonical Enterprise Gateway corpus;
  candidate identity binds enterprise/user/device/client plus exact snapshot facts;
  package closure, file and canonical digests are revalidated before sealing;
  an independent SQLite file and migration registry isolate configuration storage;
  Storage Activation uses CAS, retains active/previous, and emits a safe status fact;
  runtime Registry Activation remains outside CGF-1.2B
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/enterprise-configuration-consumer.test.ts
Regression test:
  services/core/tests/enterprise-configuration-validation.test.ts
  services/core/tests/enterprise-configuration-persistence.conformance.test.ts
  services/core/tests/sqlite-enterprise-configuration-persistence.integration.test.ts
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-25
```

### AR-031：CGF-1.2C 企业配置传输与跨语言恢复 Harness

```text
RoboThree target:
  services/core/src/ports/enterprise-configuration-client.ts
  services/core/src/adapters/http/http-enterprise-configuration-client.ts
  services/core/src/application/enterprise-configuration-sync-coordinator.ts
  services/core/src/adapters/sqlite/enterprise-configuration-migrations.ts
  services/core/tests/http-enterprise-configuration-client.integration.test.ts
  services/core/tests/enterprise-configuration-sync-coordinator.test.ts
  services/core/tests/e2e/cgf12c-java-node-runner.mjs
  services/central-service/src/test/java/com/robothree/central/configuration/
    Cgf12cJavaNodeE2e.java
Upstream source:
  OpenClaw trusted Gateway origin and fail-closed compatibility boundary
  LangGraph durable checkpoint/retry and Adapter Conformance pattern
  OpenHands immutable configuration identity and Local/Remote separation
  RoboThree KAF-2/KAF-3 named fault, at-least-once retry and real process-boundary Harness
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY
Copied or rewritten:
  Rewritten as RoboThree TypeScript/Java Port, Adapter, coordinator and Harness;
  no upstream transport, retry, persistence or test source copied
Local modifications:
  every read operation binds one four-factor enterprise scope and one Token Session;
  bearer requests use a fixed trusted origin, manual redirects, bounded streaming,
  typed timeout/cancel and one session-wide renewal limit;
  Snapshot 304 is accepted only after local canonical revalidation, otherwise repaired
  through an unconditional read;
  Package reads stay bound to exact Snapshot/reference facts and partially staged
  validated packages resume without changing the active pointer;
  same-scope synchronization is serialized while Package fan-out is explicitly bounded;
  Java test-profile token issuance and validation feed the production Node HTTP Adapter,
  which activates and reopens an independent SQLite generation
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  services/central-service/src/test/java/com/robothree/central/authentication/adapter/http/
  services/core/tests/http-enterprise-configuration-client.integration.test.ts
Regression test:
  services/core/tests/enterprise-configuration-sync-coordinator.test.ts
  services/core/tests/enterprise-configuration-persistence.conformance.test.ts
  services/core/tests/sqlite-enterprise-configuration-persistence.integration.test.ts
  services/central-service/src/test/java/com/robothree/central/configuration/
    Cgf12cJavaNodeE2e.java
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA PASS;
  user accepted CGF-1.2C and closed CGF-1.2
Adopted date:
  2026-07-26
```

### AR-032：DCF-1.1A Workspace、Session 元数据与恢复

```text
RoboThree target:
  services/core/src/application/workspace-grant-service.ts
  services/core/src/application/desktop-session-service.ts
  services/core/src/application/desktop-conversation-projection-service.ts
  services/core/src/ports/desktop-foundation-persistence.ts
  services/core/src/ports/workspace-selection.ts
  services/core/src/adapters/memory/in-memory-desktop-foundation-persistence.ts
  services/core/src/adapters/sqlite/sqlite-desktop-foundation-persistence.ts
  services/core/src/adapters/node/node-workspace-path-resolver.ts
  services/core/tests/desktop-foundation-persistence.conformance.test.ts
  services/core/tests/desktop-foundation-services.integration.test.ts
Upstream source:
  Grok Build actor command serialization and stable command identity
  OpenClaw SQLite preflight and fail-closed local Gateway boundary
  Open WebUI UI Projection separation from runtime facts
  LangGraph persistence Adapter Conformance and close/reopen recovery pattern
  RoboThree ADR-002/010/012 and KAF-2/KAF-5 persistence/conversation foundation
Upstream commit:
  Grok Build 98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Application/Port/Adapter code and tests;
  no upstream source, SQL, schema or tests copied
Local modifications:
  opaque Desktop selection handles are resolved once and never persisted;
  realpath, segment and symlink checks enforce the WorkspaceGrant boundary;
  KAF-5 SessionHead remains the conversation fact while Desktop title/revision/
  tombstone use separate metadata;
  a durable create intent locks command digest before the two-domain create;
  command receipts make response-loss recovery deterministic;
  Desktop Conversation Projection consumes but does not invent durable cursors
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/desktop-local-contracts.test.ts
Regression test:
  services/core/tests/desktop-foundation-persistence.conformance.test.ts
  services/core/tests/desktop-foundation-services.integration.test.ts
  services/core/tests/sqlite-conversation-persistence.integration.test.ts
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-26
```

### AR-033：DCF-1.1B Agent/Model Runtime Selection 与精确锁定

```text
RoboThree target:
  packages/contracts/src/runtime-selection/
  services/core/src/ports/trusted-runtime-catalog.ts
  services/core/src/application/model-eligibility-evaluator.ts
  services/core/src/application/runtime-selection-revisions.ts
  services/core/src/application/runtime-selection-service.ts
  services/core/src/adapters/memory/in-memory-trusted-runtime-catalog.ts
  services/core/src/adapters/memory/in-memory-task-persistence.ts
  services/core/src/adapters/sqlite/sqlite-task-persistence.ts
  services/core/tests/runtime-selection.integration.test.ts
Upstream source:
  Grok Build finalized Registry, exact capability identity and actor single-writer
  OpenHands Definition/Runtime State separation and typed execution facts
  LangGraph persistence Adapter Conformance and close/reopen recovery
  OpenClaw immutable startup configuration and Provider Catalog boundary
  RoboThree ADR-008/011 and KAF-2/KAF-3 exact Lock/durable persistence foundation
Upstream commit:
  Grok Build 98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Contract/Application/Port/Adapter code and tests;
  no upstream source, SQL, Schema or tests copied
Local modifications:
  Agent, Model and TaskRuntimeSelection remain separate immutable owners;
  eligibility uses only explicit permission, live availability and capability facts;
  default Model never silently falls back and override must be explicit and allowed;
  Model/Tool use exact TaskCapabilityLock while Skill/Knowledge use materialized refs;
  Selection stores only lock references/digests and excludes handles and credentials;
  Memory/SQLite reject missing or drifted lock facts and recover exact historic selection;
  Desktop receives a safe Projection rather than Registry infrastructure
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/runtime-selection-contracts.test.ts
Regression test:
  services/core/tests/runtime-selection.integration.test.ts
  services/core/tests/task-persistence.conformance.test.ts
  services/core/tests/sqlite-persistence.integration.test.ts
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-26
```

### AR-034：DCF-1.1C SubmitTurn 双领域持久协调与恢复

```text
RoboThree target:
  packages/contracts/src/submit-turn-coordination/
  services/core/src/application/submit-turn-coordinator.ts
  services/core/src/application/submit-turn-recovery-coordinator.ts
  services/core/src/application/headless-desktop-runtime.ts
  services/core/src/ports/submit-turn-persistence.ts
  services/core/src/ports/runtime-selection-context-provider.ts
  services/core/src/ports/agent-loop-starter.ts
  services/core/src/persistence/submit-turn-bundle-validation.ts
  services/core/src/adapters/memory/in-memory-submit-turn-persistence.ts
  services/core/src/adapters/sqlite/sqlite-submit-turn-persistence.ts
  services/core/src/adapters/{memory,sqlite}/*conversation-persistence.ts
  services/core/src/adapters/{memory,sqlite}/*task-persistence.ts
  services/core/tests/submit-turn-*.test.ts
Upstream source:
  Grok Build actor mailbox, stable command identity and explicit Tool registry
  LangGraph checkpoint/persistence Adapter Conformance and crash replay
  OpenHands Definition/Runtime separation and recoverable execution facts
  OpenClaw local SQLite preflight, immutable configuration and fail-closed startup
  RoboThree ADR-007/008/010/011/012 and KAF-2/KAF-5 durable foundations
Upstream commit:
  Grok Build 98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Contract/Application/Port/Adapter code,
  forward-only SQLite migration and independent tests; no upstream source,
  SQL, Schema or tests copied
Local modifications:
  Session and Task remain separate owners rather than one cross-domain transaction;
  a Session-owned prepared Message intent closes accepted-record crash gaps without
  copying user text into SubmitTurnRecord;
  TaskPersistence exposes one semantic atomic bundle instead of a generic transaction;
  exact Agent/Registry/Prompt/Lock IDs and selection digest are retained for recovery;
  durable receipt/delivery commits precede an idempotent AgentLoopStarter;
  recovery uses a bounded scan and injectable Scheduler;
  the old Conversation→Task SQLite foreign key is removed because the frozen ordering
  intentionally persists Message before Task, while coordinator/bundle validation owns
  cross-domain correlation;
  public Headless projection excludes request digest, terminal internals, credentials,
  Runtime Handle, PID and user body
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/submit-turn-coordination-contracts.test.ts
Regression test:
  services/core/tests/submit-turn-persistence.conformance.test.ts
  services/core/tests/submit-turn-coordinator.integration.test.ts
  services/core/tests/sqlite-conversation-persistence.integration.test.ts
  services/core/tests/sqlite-persistence.integration.test.ts
  services/core/tests/task-persistence.conformance.test.ts
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-26
```

### AR-035：DCF-1.2A Application Facade 与私有 Desktop Bridge

```text
RoboThree target:
  packages/contracts/src/desktop-local/v1alpha1/
  services/core/src/application/desktop-application-facade.ts
  services/core/src/application/durable-agent-loop-starter.ts
  services/core/src/adapters/http/core-private-http-server.ts
  services/core/src/adapters/memory/ephemeral-workspace-selection-store.ts
  services/core/src/bootstrap/create-desktop-private-runtime.ts
  services/core/src/desktop-private-main.ts
  apps/desktop/src/main/core-private-client.ts
  apps/desktop/src/main/core-private-supervisor.ts
  apps/desktop/src/shared/foundation-api.ts
  tests/e2e/dcf12a-core-private.e2e.test.ts
Upstream source:
  OpenHands server/runtime separation and typed external API projection
  OpenClaw loopback local Gateway, startup token and fail-closed local boundary
  LangGraph durable state replay and one persistence semantics across adapters
  Grok Build actor mailbox and one application command entry
  RoboThree DCF-0 process supervision, ADR-007/008/010/012 and KAF-5 Context/
  Agent Loop plus DCF-1.1 durable SubmitTurn foundation
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  Grok Build 98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Contract/Application/Adapter/Main code and
  tests; no upstream source, route, protocol, schema or test copied
Local modifications:
  one DesktopApplicationFacade owns all business entry semantics while Headless
  and HTTP/SSE are thin adapters over the same Facade;
  formal Electron startup uses a supervised Core child, loopback random port,
  one startup token, strict Host/Origin/Bearer checks and one authenticated SSE;
  Renderer-safe API excludes port, token, real path, selection handle and
  persistence/runtime internals;
  selection handles are process-local, request-bound, single-use, TTL<=30s,
  excluded from durable command digest and invalid after restart;
  DurableAgentLoopStarter validates the persisted SubmitTurn Task/Selection/
  Message identity, then reuses TurnSnapshotBuilder, ContextPipeline,
  AgentLoopCoordinator and DurableAgentConversationWriter;
  the Alpha production composition uses a deterministic official Scripted Model
  only; real Model, Tool UI, Preload workbench and streaming delta remain gated
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/desktop-local-v1alpha1-contracts.test.ts
  tests/e2e/desktop-contract-consumer-conformance.test.ts
Regression test:
  services/core/tests/ephemeral-workspace-selection-store.test.ts
  services/core/tests/submit-turn-coordinator.integration.test.ts
  tests/e2e/dcf12a-core-private.e2e.test.ts
  apps/desktop/tests/core-private-supervisor.integration.test.ts
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-26
```

### AR-036：DCF-1.2B Preload 白名单与最小工作台

```text
RoboThree target:
  apps/desktop/src/shared/foundation-api.ts
  apps/desktop/src/main/desktop-ipc-router.ts
  apps/desktop/src/main/index.ts
  apps/desktop/src/preload/create-desktop-api.ts
  apps/desktop/src/preload/index.ts
  apps/desktop/src/renderer/main.ts
  apps/desktop/src/renderer/styles.css
  apps/desktop/tests/create-desktop-api.test.ts
  apps/desktop/tests/desktop-ipc-router.test.ts
  apps/desktop/tests/renderer-workbench-boundary.test.ts
  tests/e2e/dcf12b-workbench-bridge.e2e.test.ts
Upstream source:
  OpenHands UI/server ownership separation and server-owned task facts
  OpenClaw local gateway trust boundary and typed client projection
  Grok Build single command entry and stable application identity
  RoboThree DCF-1.2A Application Facade/CorePrivateClient, DCF-1.1 durable
  SubmitTurn and accepted Desktop Local Runtime Contract v1alpha1
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  Grok Build 98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_UI
Copied or rewritten:
  Rewritten as RoboThree Electron Main/Preload/Vue code and independent tests;
  no upstream UI, component, style, IPC route, source or test copied
Local modifications:
  Main owns the system directory picker and transforms a private selection into
  a durable WorkspaceGrant before anything returns to Renderer;
  one fixed IPC router maps the frozen Renderer-safe API to CorePrivateClient;
  Preload validates both request and response and drops invalid events;
  Renderer stores only transient view state and always rebuilds Session,
  Message, Agent/Model eligibility and Task facts from Core Projection;
  defaultModel and override candidates come from AgentProjection rather than
  UI-side permission calculation;
  durable events trigger Snapshot refresh but do not create a second reducer;
  CSP keeps all Renderer network access disabled;
  the UI is an original RoboThree minimal workbench and deliberately excludes
  DCF-1.2C streaming/reconnect, DCF-2 confirmations and later admin features
License/NOTICE action:
  No copied source or assets; no additional NOTICE action
Contract test:
  apps/desktop/tests/create-desktop-api.test.ts
  apps/desktop/tests/desktop-ipc-router.test.ts
Regression test:
  apps/desktop/tests/renderer-workbench-boundary.test.ts
  tests/e2e/dcf12b-workbench-bridge.e2e.test.ts
  tests/e2e/dcf12a-core-private.e2e.test.ts
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending;
  user live workbench demonstration pending
Adopted date:
  2026-07-26
```

### AR-037：DCF-1.2C Streaming、Cursor 与 Snapshot 收敛

```text
RoboThree target:
  services/core/src/application/desktop-ephemeral-event-bus.ts
  services/core/src/application/agent-loop-coordinator.ts
  services/core/src/application/durable-agent-loop-starter.ts
  services/core/src/application/desktop-application-facade.ts
  services/core/src/adapters/http/core-private-http-server.ts
  services/core/src/adapters/memory/in-memory-submit-turn-persistence.ts
  services/core/src/adapters/sqlite/sqlite-submit-turn-persistence.ts
  apps/desktop/src/main/desktop-event-reconnect-controller.ts
  apps/desktop/src/renderer/main.ts
  apps/desktop/tests/dcf12c-real-process.e2e.test.ts
Upstream source:
  OpenHands server-owned execution state and transient UI event separation
  OpenClaw local Gateway stream lifecycle and fail-closed reconnect boundary
  LangGraph durable checkpoint/replay as recovery source of truth
  RoboThree ADR-007/010/012, DCF-1.0 Contract and DCF-1.2A private bridge
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_RECOVERY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Application/Adapter/Main/Renderer code and
  independent tests; no upstream source, protocol, SQL or test copied
Local modifications:
  Model delta is process-local and discardable while final Assistant Message is
  committed once and projected through the existing global durable delivery;
  the same preallocated Message ID connects temporary and durable projections;
  Desktop reconnect is Snapshot-first, resumes from an opaque durable cursor,
  deduplicates by eventId and clears temporary state on disconnect or runtime
  generation change;
  delivery retention defaults to 2048 records with monotonic sequence and typed
  reset for ahead or expired cursors;
  one real child-process E2E aborts after the first delta, then proves SQLite
  Snapshot and durable Message convergence after reconnect
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/desktop-local-v1alpha1-contracts.test.ts
  packages/contracts/tests/submit-turn-coordination-contracts.test.ts
Regression test:
  services/core/tests/desktop-event-projection.test.ts
  services/core/tests/submit-turn-persistence.conformance.test.ts
  apps/desktop/tests/desktop-event-reconnect-controller.test.ts
  apps/desktop/tests/dcf12c-real-process.e2e.test.ts
  tests/e2e/dcf12a-core-private.e2e.test.ts
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-26
```

### AR-038：DCF-1.3A Desktop/Core 生命周期与单次自动恢复

```text
RoboThree target:
  apps/desktop/src/shared/foundation-api.ts
  apps/desktop/src/main/core-private-supervisor.ts
  apps/desktop/src/main/desktop-event-reconnect-controller.ts
  apps/desktop/src/main/desktop-ipc-router.ts
  apps/desktop/src/main/index.ts
  services/core/src/adapters/memory/ephemeral-workspace-selection-store.ts
  services/core/src/adapters/http/core-private-http-server.ts
  scripts/check-boundaries.mjs
  apps/desktop/tests/core-private-supervisor-lifecycle.test.ts
  apps/desktop/tests/core-private-supervisor.integration.test.ts
  apps/desktop/tests/desktop-event-reconnect-controller.test.ts
  services/core/tests/ephemeral-workspace-selection-store.test.ts
Upstream source:
  OpenClaw local Gateway lifecycle and bounded reconnect boundary
  OpenHands server/runtime ownership separation and recovery isolation
  LangGraph durable checkpoint/Snapshot as the recovery source of truth
  Electron Main/Preload/Renderer security and process lifecycle model
  RoboThree DCF-1.2A private child bridge, DCF-1.2C Snapshot/cursor recovery,
  ADR-007 durable persistence and accepted DCF-1.3 plan
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  Electron API semantics from the pinned Electron 43.2.0 dependency
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_LIFECYCLE
Copied or rewritten:
  Rewritten as RoboThree TypeScript Main/Application/Adapter code and independent
  tests; no upstream process supervisor, retry, recovery, protocol or test copied
Local modifications:
  lifecycle is frozen to stopped/starting/ready/restarting/stopping/failed and
  deliberately excludes recovering;
  concurrent starts and stops share one operation, including start received
  while a ready Core is still stopping;
  an unexpected startup or runtime failure consumes at most one automatic
  restart, then failed rejects further start attempts until Desktop restarts;
  controlled restart does not consume the automatic failure budget;
  every replacement Core receives a new high-entropy token and runtimeInstanceId,
  invalidating old Client/SSE and process-local Workspace selection handles;
  the replacement opens the same SQLite file so durable Session facts survive;
  Renderer receives only the frozen non-retryable failure summary, while bounded
  diagnostics redact bearer-like values and local paths;
  Kernel reducer and KAF-2/3 Effect, Receipt, Outbox and CapabilityLock semantics
  remain unchanged and a new architecture check enforces that boundary
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  apps/desktop/tests/desktop-ipc-router.test.ts
  apps/desktop/tests/desktop-event-reconnect-controller.test.ts
Regression test:
  apps/desktop/tests/core-private-supervisor-lifecycle.test.ts
  apps/desktop/tests/core-private-supervisor.integration.test.ts
  services/core/tests/ephemeral-workspace-selection-store.test.ts
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-26
```

### AR-039：DCF-1.3B SSE 背压、慢消费者与资源所有权

```text
RoboThree target:
  services/core/src/adapters/http/sse-backpressure-writer.ts
  services/core/src/adapters/http/core-private-http-server.ts
  apps/desktop/src/main/desktop-event-reconnect-controller.ts
  scripts/check-boundaries.mjs
  services/core/tests/sse-backpressure-writer.test.ts
  apps/desktop/tests/desktop-event-reconnect-controller.test.ts
  tests/e2e/dcf12a-core-private.e2e.test.ts
  apps/desktop/tests/core-private-supervisor.integration.test.ts
Upstream source:
  OpenClaw single local Gateway stream and bounded reconnect ownership
  OpenHands server-owned durable state and discardable UI stream updates
  LangGraph checkpoint/Snapshot replay as durable recovery source
  Node.js HTTP writable backpressure and drain semantics
  RoboThree DCF-1.2C durable cursor/Snapshot convergence and DCF-1.3A lifecycle
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  Node.js API semantics from the pinned Node 24.13.0 runtime
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_BACKPRESSURE
Copied or rewritten:
  Rewritten as RoboThree TypeScript HTTP Adapter/Main code and independent
  tests; no upstream stream writer, buffer, retry, metrics or test copied
Local modifications:
  every SSE frame passes through one response owner;
  only response.write() returning false begins backpressure, pauses durable
  polling through the existing single flush and waits for drain;
  the internal slow-consumer deadline is frozen at 30 seconds and can be
  shortened only through constructor dependency injection for tests;
  durable events are never copied into an application queue and advance the
  cursor only after the frame is accepted and drain recovers;
  ephemeral frames are dropped and heartbeat frames skipped while blocked;
  slow timeout destroys only the affected SSE so Main reconnects Snapshot-first;
  HTTP Adapter exposes process-local resource counts for server, SSE, timers and
  ephemeral subscriptions without adding a public Contract;
  Main dedupe storage is capped at 2048 and reports dedupeSetSize,
  maxDedupeSize and cleanupCount, clearing on reset, runtime change and abort;
  deterministic tests cover 10,000 ephemeral frames, 100 reconnects, 100 real
  SSE disconnects, 25 real Core restarts, 20 start-stop cycles, 100+ durable
  events and 20 drain/timeout rounds
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/desktop-local-v1alpha1-contracts.test.ts
  services/core/tests/sse-backpressure-writer.test.ts
Regression test:
  apps/desktop/tests/desktop-event-reconnect-controller.test.ts
  tests/e2e/dcf12a-core-private.e2e.test.ts
  apps/desktop/tests/core-private-supervisor.integration.test.ts
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-26
```

### AR-040：DCF-1.3C Desktop/Core 长稳与阶段关闭 Harness

```text
RoboThree target:
  scripts/run-dcf13c-stability.mjs
  scripts/run-dcf13c-stability.test.mjs
  scripts/check-boundaries.mjs
  package.json
Upstream source:
  OpenClaw long-running local Gateway lifecycle and reconnect ownership
  OpenHands service/runtime separation and restart-safe durable state
  LangGraph checkpoint/Snapshot recovery and replay convergence
  Node.js child process, HTTP/SSE, process resource and monotonic clock semantics
  RoboThree DCF-1.2C/1.3A/1.3B existing runtime primitives
Upstream commit:
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  Node.js API semantics from the pinned Node 24.13.0 runtime
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_STABILITY_HARNESS
Copied or rewritten:
  Rewritten as RoboThree-owned JavaScript test tooling; no upstream Harness,
  workload, reporter, fixture or test copied
Local modifications:
  formal CLI exposes only actual 30-minute and 60-minute modes;
  each run uses a real supervised Core child, random loopback HTTP/SSE, SQLite,
  WorkspaceGrant, Session, SubmitTurn and Snapshot convergence;
  deterministic schedules mix reconnect, unknown cursor reset, controlled
  restart, graceful stop/start, close/reopen and production backpressure writer
  drain/timeout probes without adding a public fault-injection API;
  the report contains only counts, digests, duration, resource metrics, status
  and typed error codes, with an explicit safety validator;
  production Contracts and Kernel remain unchanged;
  compressed real-process coverage runs in the normal test gate while the
  actual 30/60-minute modes remain separate commands and must be rerun by QA
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  scripts/run-dcf13c-stability.test.mjs
Regression test:
  pnpm run check
Long-run evidence:
  qa-reports/2026-07-27-dcf.1.3c-dev/evidence/
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-27
```

### AR-041：CGF-1.3A Enterprise Registry Materializer

```text
RoboThree target:
  services/core/src/ports/enterprise-runtime-registry-source.ts
  services/core/src/adapters/enterprise-configuration/
    persistence-enterprise-runtime-registry-source.ts
  services/core/src/application/enterprise-registry-materializer.ts
  services/core/tests/enterprise-registry-materializer.conformance.test.ts
Upstream source:
  Grok Build ToolRegistryBuilder → FinalizedToolset
  OpenHands immutable Definition/Spec separated from runtime implementation
  OpenClaw immutable startup configuration and fail-closed registry bootstrap
  LangGraph shared Persistence Adapter Conformance
  RoboThree KAF-3 RegistryBuilder and CGF-1.2 exact Storage Active generation
Upstream commit:
  Grok Build 98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY
Copied or rewritten:
  Rewritten as RoboThree TypeScript Application/Port/Adapter code and tests;
  no upstream Registry, configuration, persistence or test source copied
Local modifications:
  materialization begins only after the existing four-factor enterprise session
  gate and reloads the exact sealed Storage Active generation;
  Snapshot, Package, file and materialization digests are revalidated before any
  Registry record is constructed;
  only Model and Tool enter the immutable Capability Registry while Agent, Skill
  and Knowledge remain independent revision-locked runtime references;
  disabled, credential-unavailable or permission-ineligible resources only
  narrow the Registry and never trigger alternate Binding selection;
  local core/process capabilities are separated from remote Gateway capabilities;
  the five LocalExecutable checks expose deterministic failures without claiming
  exactly-once, automatic fallback or Runtime Activation;
  InMemory and SQLite use one Conformance suite and KAF-3 Registry tests remain
  the source of truth for order independence, typed ports and deep freeze
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  No public Contract change in CGF-1.3A
Regression test:
  services/core/tests/enterprise-registry-materializer.conformance.test.ts
  services/core/tests/registry-builder.test.ts
  pnpm run check
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-27
```

### AR-042：CGF-1.3B Durable Runtime Activation 与受控重启

```text
RoboThree target:
  services/core/src/ports/runtime-activation-persistence.ts
  services/core/src/ports/controlled-core-restart.ts
  services/core/src/ports/runtime-registry-installer.ts
  services/core/src/application/runtime-activation-coordinator.ts
  services/core/src/adapters/memory/in-memory-runtime-activation-persistence.ts
  services/core/src/adapters/sqlite/sqlite-runtime-activation-persistence.ts
  services/core/src/adapters/fake/fake-controlled-core-restart.ts
  services/core/src/adapters/fake/fake-runtime-registry-installer.ts
  services/core/tests/runtime-activation-persistence.conformance.test.ts
  services/core/tests/runtime-activation-coordinator.test.ts
Upstream source:
  LangGraph durable checkpoint/replay and shared persistence Conformance
  OpenHands immutable runtime specification separated from process implementation
  OpenClaw startup-frozen configuration and bounded local runtime lifecycle
  RoboThree KAF-2 durable intent/idempotency/atomic commit principles
  RoboThree KAF-3 immutable Registry and DCF-1.3 controlled restart lifecycle
Upstream commit:
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_TRANSACTION_MODEL
Copied or rewritten:
  Rewritten as RoboThree TypeScript Application/Port/Adapter code and tests;
  no upstream activation workflow, restart supervisor, persistence schema or
  test source copied
Local modifications:
  the persisted activation intent and exact target are committed before the
  restart side effect, while restart dispatch is idempotent by attempt ID;
  the new Core must observe the same opaque startup intent and rebuild the same
  generation and Registry revision before installing runtime handles;
  internal readiness precedes one atomic transaction that records both
  runtimeActive and the completed attempt, and public readiness follows it;
  a lost response after commit is resolved by exact deterministic rebuild, not
  by Effect uncertain or a second activation attempt;
  Storage Active and Runtime Active remain separate pointers in the independent
  enterprise configuration SQLite, with V3 forward-only migration;
  target failure never rolls back Storage Active and may expose only the exact
  last successful Runtime Active generation after all accepted safety checks;
  InMemory and SQLite share one Conformance and the coordinator covers all nine
  named failure windows plus concurrent single-writer recovery;
  public Contracts, Kernel reducer, Central Java DTO/API and Task database remain
  unchanged
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  No public Contract change in CGF-1.3B
Regression test:
  services/core/tests/runtime-activation-persistence.conformance.test.ts
  services/core/tests/runtime-activation-coordinator.test.ts
  services/core/tests/enterprise-registry-materializer.conformance.test.ts
  services/core/tests/sqlite-enterprise-configuration-persistence.integration.test.ts
  pnpm run check
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-27
```

### AR-043：CGF-1.3C Task Generation Recovery 与 GC Blocker

```text
RoboThree target:
  services/core/src/application/enterprise-generation-recovery.ts
  services/core/src/application/enterprise-configuration-status.ts
  services/core/src/ports/runtime-activation-persistence.ts
  services/core/src/adapters/memory/in-memory-runtime-activation-persistence.ts
  services/core/src/adapters/sqlite/sqlite-runtime-activation-persistence.ts
  services/core/tests/cgf13c-dual-sqlite-recovery-harness.test.ts
  services/core/tests/enterprise-offline-projection.test.ts
Upstream source:
  LangGraph durable checkpoint/replay and persistence-led recovery
  OpenHands immutable state/spec separated from execution implementation
  OpenClaw startup-frozen configuration and explicit local lifecycle status
  RoboThree KAF-2/KAF-3 and CGF-1.3A/B durable facts and immutable locks
Upstream commit:
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_RECOVERY_MODEL
Copied or rewritten:
  Rewritten as RoboThree TypeScript Application code and recovery tests;
  no upstream recovery coordinator, GC, persistence, projection or test copied
Local modifications:
  enterprise activation facts are read before independent Task SQLite facts;
  TaskRuntimeSelection and TaskCapabilityLock remain immutable and no recovery
  path silently changes a generation, Model, Tool, Binding or Adapter;
  enterprise raw revisions and Task sha256-prefixed digests use one explicit
  normalization at the Application join boundary;
  the generation analyzer emits auditable deletion blockers only and contains
  no destructive operation or decrementing reference counter;
  the four offline states are a pure projection and recovered configuration
  always waits for explicit user application;
  a two-file SQLite close/reopen Harness verifies current/previous Task
  isolation, session failure and blocker reconstruction
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  No public Contract change in CGF-1.3C
Regression test:
  services/core/tests/cgf13c-dual-sqlite-recovery-harness.test.ts
  services/core/tests/enterprise-offline-projection.test.ts
  services/core/tests/runtime-activation-persistence.conformance.test.ts
  pnpm run harness:cgf13c
  pnpm run check
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-27
```

### AR-044：DCF-2.0 Task、Confirmation 与 Tool Activity Contract

```text
RoboThree target:
  packages/contracts/src/desktop-local/v1alpha1/task.ts
  packages/contracts/src/desktop-local/v1alpha1/query.ts
  packages/contracts/src/desktop-local/v1alpha1/event.ts
  packages/contracts/src/desktop-local/v1alpha1/error.ts
  packages/contracts/tests/dcf-2-0-contracts.test.ts
  scripts/check-boundaries.mjs
Upstream source:
  OpenHands Action/Observation and user-readable execution trajectory
  LangGraph interrupt/resume and checkpoint-led recovery
  OpenClaw local Tool risk and explicit user confirmation boundary
  grok-build Tool Registry and Agent-visible Tool Schema separation
  RoboThree KAF-1 through KAF-5 and DCF-1 durable runtime facts
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  grok-build local research baseline recorded by RoboThree research repository
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_CONTRACT
Copied or rewritten:
  Rewritten as RoboThree-owned Zod Contracts, tests and architecture guards;
  no upstream Contract, reducer, UI or test source copied
Local modifications:
  Desktop receives product-safe Projection and high-level commands only;
  all Task control carries expectedTaskRevision;
  confirmation idempotency uses confirmationId plus requestDigest;
  durable changed events carry only identifiers and queryRef;
  internal Effect, Receipt, Outbox, Checkpoint, CapabilityLock, credentials,
  ActionIntent and raw Tool arguments remain excluded;
  Task display status order and semantics are frozen while future versions may
  add new values;
  Kernel reducer and existing internal confirmation persistence remain unchanged
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/dcf-2-0-contracts.test.ts
Regression test:
  packages/contracts/tests/desktop-local-v1alpha1-contracts.test.ts
  packages/contracts/tests/authorization-contracts.test.ts
  services/core/tests/user-confirmation.integration.test.ts
  services/core/tests/task-runtime.test.ts
  pnpm run check
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-27
```

### AR-045：DCF-2A Task Projection 与 Desktop 收敛

```text
RoboThree target:
  services/core/src/application/desktop-task-projection-service.ts
  services/core/src/application/durable-agent-loop-starter.ts
  services/core/src/ports/task-persistence.ts
  services/core/src/adapters/sqlite/sqlite-task-persistence.ts
  services/core/src/adapters/sqlite/migrations.ts
  apps/desktop/src/main/core-private-client.ts
  apps/desktop/src/main/desktop-ipc-router.ts
  apps/desktop/src/preload/create-desktop-api.ts
  apps/desktop/src/renderer/main.ts
  tests/e2e/dcf12a-core-private.e2e.test.ts
Upstream source:
  OpenHands Action/Observation execution trajectory
  LangGraph durable state, snapshot and replay convergence
  OpenClaw local Tool activity and safe user-facing status boundary
  RoboThree KAF-1/KAF-2 and DCF-1.2/DCF-1.3 durable runtime foundations
Upstream commit:
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_PROJECTION
Copied or rewritten:
  Rewritten as RoboThree-owned TypeScript Application/Adapter/Desktop code
  and tests; no upstream reducer, persistence, UI or test source copied
Local modifications:
  durable Task state remains the sole source for Task/Run/Step status;
  the existing RoboThree reducer and DurableTaskRuntime drive the Scripted
  Agent Loop instead of inferring completion from Assistant Message state;
  Desktop Task and Tool Activity projections exclude internal payloads and
  force uncertain external outcomes to manual attention;
  Renderer receives identifiers and query references, then reloads Core
  Snapshot rather than maintaining a second reducer;
  process-local projected event sequence prevents duplicate delivery during
  one runtime generation, while restart reconstruction uses durable Snapshot
  and does not reinsert historical pruned events;
  SQLite V11 only expands the existing delivery type constraint
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/dcf-2-0-contracts.test.ts
Regression test:
  services/core/tests/desktop-task-projection-service.test.ts
  services/core/tests/task-persistence.conformance.test.ts
  services/core/tests/sqlite-conversation-persistence.integration.test.ts
  tests/e2e/dcf12a-core-private.e2e.test.ts
  tests/e2e/dcf12b-workbench-bridge.e2e.test.ts
  pnpm run check
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-27
```

### AR-046：DCF-2B Desktop 用户确认与 Task Control

```text
RoboThree target:
  packages/contracts/src/authorization/user-confirmation.ts
  packages/contracts/src/desktop-local/v1alpha1/task.ts
  services/core/src/application/desktop-task-control-service.ts
  services/core/src/application/desktop-task-projection-service.ts
  services/core/src/application/durable-agent-loop-starter.ts
  services/core/src/ports/task-persistence.ts
  services/core/src/adapters/sqlite/sqlite-task-persistence.ts
  services/core/src/adapters/sqlite/migrations.ts
  apps/desktop/src/main/desktop-ipc-router.ts
  apps/desktop/src/preload/create-desktop-api.ts
  apps/desktop/src/renderer/main.ts
  services/core/tests/desktop-task-control-service.test.ts
Upstream source:
  LangGraph interrupt/resume and checkpoint-led continuation
  OpenHands Action/Observation separation and user-controlled execution
  OpenClaw local high-risk Tool confirmation boundary
  RoboThree KAF-1/KAF-2/KAF-4/KAF-5 and DCF-2A durable foundations
Upstream commit:
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_APPLICATION_COORDINATION
Copied or rewritten:
  Rewritten as RoboThree-owned TypeScript Application/Adapter/Desktop code
  and tests; no upstream confirmation handler, reducer, UI or test copied
Local modifications:
  Desktop issues only high-level typed Task commands and never mutates the
  immutable ActionIntent;
  command replay uses commandId plus canonical digest while Confirmation uses
  the existing confirmationId and exact request digest;
  Confirmation decisions bind to the current Task, Run, Step and Action and
  fail closed for stale revision, expiry, mismatch and conflicting replay;
  a confirmed decision still passes a live disabled, revoked, health,
  credential and permission narrowing check before the existing Coordinator
  may prepare or dispatch a Tool Effect;
  retry always delegates to the existing reducer to create a new Run, cancel
  propagates AbortSignal to an active Agent Loop, and continue/input cannot
  bypass another waiting reason;
  task input reuses the durable Conversation prepared-message transaction;
  Renderer receives only safe Confirmation Projection and reloads Snapshot
  after durable events rather than owning another state machine;
  SQLite V12 only expands the existing Desktop delivery constraint;
  Kernel reducer and Enterprise Gateway remain unchanged
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  packages/contracts/tests/dcf-2-0-contracts.test.ts
Regression test:
  services/core/tests/desktop-task-control-service.test.ts
  services/core/tests/user-confirmation.integration.test.ts
  services/core/tests/task-persistence.conformance.test.ts
  services/core/tests/sqlite-conversation-persistence.integration.test.ts
  apps/desktop/tests/create-desktop-api.test.ts
  apps/desktop/tests/desktop-ipc-router.test.ts
  pnpm run check
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-27
```

### AR-047：DCF-2C Task 恢复闭环与统一 Harness

```text
RoboThree target:
  services/core/src/application/durable-task-runtime.ts
  services/core/src/ports/task-persistence.ts
  services/core/src/persistence/validation.ts
  services/core/src/adapters/memory/in-memory-task-persistence.ts
  services/core/src/adapters/sqlite/sqlite-task-persistence.ts
  services/core/tests/dcf2c-task-recovery-harness.test.ts
  services/core/tests/task-persistence.conformance.test.ts
  tests/e2e/dcf2c-desktop-recovery-harness.e2e.test.ts
  apps/desktop/src/renderer/main.ts
Upstream source:
  LangGraph checkpoint-led replay and interrupt/resume recovery
  OpenHands Action/Observation execution trajectory and late-result isolation
  OpenClaw local runtime lifecycle and user-visible recovery boundaries
  RoboThree KAF-1/KAF-2/KAF-3, DCF-1.3 and DCF-2A/B durable foundations
Upstream commit:
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + INTERNAL_REUSE + OWN_RECOVERY_HARNESS
Copied or rewritten:
  Rewritten as RoboThree-owned TypeScript Application/Adapter/Desktop code
  and tests; no upstream persistence, recovery coordinator, UI or test copied
Local modifications:
  existing TaskRunState, reducer, Receipt, Event, Outbox, Confirmation and
  Conversation facts remain the recovery source;
  running, waiting_input, waiting_user_confirmation, cancel and retry recover
  from SQLite without adding a second Desktop state machine;
  a late Observation from an old Run remains rejected by the pure reducer and
  cannot change the current state revision, while an internal typed persistence
  port appends one runtime.command_rejected audit Event containing identifiers,
  status, timestamps and digest only;
  Desktop restart is simulated by a new clientInstanceId against the same Core,
  while Core restart rotates the token and runtimeInstanceId and reopens the
  same SQLite database;
  durable cursor replay is tested for no duplicate Event and ephemeral deltas
  remain non-replayable;
  existing DCF-1.3 backpressure, reconnect and resource accounting are reused;
  public Contracts, Kernel reducer and Enterprise Gateway remain unchanged
License/NOTICE action:
  No copied source; no additional NOTICE action
Contract test:
  No public Contract change
Regression test:
  services/core/tests/dcf2c-task-recovery-harness.test.ts
  services/core/tests/task-persistence.conformance.test.ts
  services/core/tests/durable-task-runtime.test.ts
  tests/e2e/dcf2c-desktop-recovery-harness.e2e.test.ts
  apps/desktop/tests/desktop-event-reconnect-controller.test.ts
  services/core/tests/sse-backpressure-writer.test.ts
  pnpm run harness:dcf2c
  pnpm run check
Reviewer:
  Codex developer self-review complete;
  Claude Code independent QA pending
Adopted date:
  2026-07-27
```

### AR-048：DCF-2C 隔离用户演示与真实 Process Echo

```text
RoboThree target:
  services/core/src/application/dcf2c-demo-agent-runner.ts
  services/core/src/bootstrap/create-desktop-private-runtime.ts
  apps/desktop/src/main/index.ts
  tests/e2e/dcf2c-user-demo.e2e.test.ts
Upstream source:
  RoboThree KAF-3 Process Echo, typed Tool backend and recovery semantics
  RoboThree DCF-2 Task, Confirmation and Desktop Projection foundations
Adoption type:
  INTERNAL_REUSE + OWN_DEMO_HARNESS
Copied or rewritten:
  RoboThree-owned integration code only; no third-party source copied
Local modifications:
  explicit demo boot flag remains inside Desktop Main/Core boot IPC;
  isolated Electron userData and SQLite preserve the normal Desktop dataset;
  a fixed demo Agent and fixed Tool payload exercise the existing real
  ProcessEchoToolBackend, Effect, Observation and Confirmation chain;
  restart recovery uses existing durable Task and Conversation facts;
  public Contracts, Kernel reducer, Renderer and CGF-2 remain unchanged
License/NOTICE action:
  No copied source; no additional NOTICE action
Regression test:
  tests/e2e/dcf2c-user-demo.e2e.test.ts
  pnpm run harness:dcf2c
  pnpm run check
Reviewer:
  Codex developer self-review complete;
  user experience pending
Adopted date:
  2026-07-27
```

### AR-049：CGF-2.0 Model Invocation Contract 与双协议 Conformance

```text
RoboThree target:
  contracts/enterprise-gateway/v1alpha1/openapi.yaml
  contracts/enterprise-gateway/v1alpha1/schemas/model-invocation.schema.json
  contracts/enterprise-gateway/v1alpha1/schemas/model-invocation-recovery.schema.json
  contracts/enterprise-gateway/v1alpha1/fixtures/
  tests/e2e/enterprise-contract-conformance.test.ts
  services/central-service/src/test/java/com/robothree/central/contract/
  docs/architecture/CGF-2.0-MODEL-GATEWAY-THREAT-MODEL.md
Upstream source:
  Open WebUI Provider Gateway and UI/provider responsibility separation
  OpenHands stable typed execution facts and transient stream separation
  OpenClaw fail-closed Gateway compatibility and credential non-disclosure
Upstream revision:
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + OWN_CONTRACT + OWN_CONFORMANCE
Copied or rewritten:
  No third-party source, DTO, route, schema, credential code or Provider
  adapter copied; all canonical Contract and tests are RoboThree-owned
Local modifications:
  public Model Invocation states are independent from Tool Effect states;
  Local Core locks the exact Model while Central verifies and executes it;
  durable lifecycle/usage facts are separated from ephemeral text/Tool deltas;
  Anthropic-compatible and OpenAI-compatible private frames exist only in
  test-only Adapter fixtures and normalize to one provider-neutral projection;
  recovery lease/fencing remains a server-owned internal coordination Contract;
  credentials, identity self-declaration and Provider endpoints are forbidden
  from the client Wire Contract
License/NOTICE action:
  No copied source; no additional NOTICE action
Regression test:
  tests/e2e/enterprise-contract-conformance.test.ts
  services/central-service EnterpriseContractConformanceTest
  pnpm run check
  pnpm run check:central
  pnpm run check:central:offline
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS;
  user acceptance complete
Adopted date:
  2026-07-30
```

### AR-050：OpenWorker Tool-Call 收敛与 Skill 渐进披露

```text
RoboThree target:
  docs/adr/017-agent-tool-call-batch-completion-cancellation-and-recovery.md
  docs/architecture/CGF-2-DEVELOPMENT-PLAN.md
  docs/architecture/DESKTOP-CLIENT-FOUNDATION-DEVELOPMENT-PLAN.md
  Future Agent Loop / Conversation Persistence / Tool Recovery implementation
  Future Core Skill Runtime Reader / Materializer implementation
Upstream source:
  robothree-agent-research/sources/openworker/coworker/engine.py
  robothree-agent-research/sources/openworker/coworker/skills/base.py
Upstream revision:
  OpenWorker f96ad4c8e6865f0aec519681a3717b6bcdd81546
Adoption type:
  DESIGN_ONLY + OWN_RUNTIME_MODEL + OWN_CONFORMANCE
Copied or rewritten:
  No OpenWorker Python source, asyncio scheduler, Tool implementation, prompt,
  DTO or test copied; current delivery is architecture and plan documentation
  only
Local modifications:
  no-orphan completion is expressed with RoboThree Task/Run/Assistant Message,
  Tool Call, Action, Observation, Confirmation and ADR-007 Effect semantics;
  user cancellation is distinguished from crash recovery, and an undispatched
  call cannot be recovered after an accepted cancel;
  confirmation blocks later calls in the same ordered batch;
  Retry creates a new Run and never inherits, automatically replays or
  automatically reuses the old Run's Tool Calls;
  low-risk parallel scheduling and a generic Inbox/Message Bus are deferred;
  Skill progressive disclosure is implemented by a Core Skill Runtime summary
  catalog plus locked body reader/materializer, not by exposing load_skill as
  an Agent Tool;
  discovered, Agent-allowed and Task-active Skills remain separate, and only
  the locked active body may enter Context Assembly
License/NOTICE action:
  Upstream repository is MIT; no source copied, so no product NOTICE change
  is required for this design-only adoption
Research limitation:
  Static source analysis only; upstream tests were not executed during the
  research review, and the research package did not contain LICENSE-NOTES.md
Contract test:
  Planned under ADR-017; no public Contract change in this documentation batch
Regression test:
  Planned Agent Loop/Conversation/Recovery InMemory+SQLite Conformance and
  Skill Reader/Materializer boundary tests; CGF-2C joint Harness remains gated
Reviewer:
  User accepted the corrected OpenWorker decision;
  Claude Code document consistency review PASS on 2026-07-31;
  10 documents consistent, P0/P1/P2/P3 all zero
Adopted date:
  2026-07-30
```

### AR-051：CGF-2A.2 Durable Model Invocation Application Runtime

```text
RoboThree target:
  services/central-service/src/main/java/com/robothree/central/modelgateway/
  services/central-service/src/main/java/com/robothree/central/persistence/
  services/central-service/src/test/java/com/robothree/central/modelgateway/
  services/central-service/src/test/java/com/robothree/central/persistence/
Upstream source:
  Open WebUI Provider Gateway responsibility separation
  OpenHands stable execution facts and transient stream separation
  OpenClaw fail-closed Gateway compatibility and credential non-disclosure
Upstream revision:
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + OWN_APPLICATION_RUNTIME + OWN_CONFORMANCE
Copied or rewritten:
  No third-party source, DTO, Provider adapter, protocol parser, route,
  credential implementation or test copied
Local modifications:
  Local Core remains the owner of Model selection while Central resolves one
  immutable ModelEndpointBinding and persists a canonical dispatch-decision
  digest before invoking the backend;
  stable status, usage, event-chain and audit facts are durable while text
  deltas are held only in a bounded ephemeral buffer;
  provider credentials and endpoints remain behind typed Central ports and
  never enter the public Invocation Contract or durable ledger;
  recovery uses database-time lease and fencing plus three explicit
  evidence-based modes, without claiming generic exactly-once;
  only a Development scripted Fake backend is implemented in CGF-2A.2
License/NOTICE action:
  No copied source; no additional NOTICE action
Regression test:
  ModelInvocationRuntimeTest
  ModelInvocationRuntimePersistenceConformance
  CentralCgf2a2ArchitectureTest
  pnpm run check:central
  pnpm run check:central:offline
  pnpm run check
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS;
  user acceptance complete
Adopted date:
  2026-07-31
```

### AR-052：CGF-2A.3 真实双 JVM Model Recovery Harness

```text
RoboThree target:
  services/central-service/src/test/java/com/robothree/central/modelgateway/recovery/
  services/central-service/src/test/java/com/robothree/central/architecture/
  docs/architecture/CGF-2-DEVELOPMENT-PLAN.md
Upstream source:
  LangGraph durable checkpoint/replay and persistence conformance discipline
  OpenHands stable execution facts and transient stream separation
  OpenClaw fail-closed Gateway lifecycle and reconnect boundaries
Upstream revision:
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + OWN_DUAL_JVM_HARNESS + OWN_FAILURE_MATRIX
Copied or rewritten:
  No third-party source, process supervisor, checkpoint implementation,
  Provider adapter, route, DTO or test copied
Local modifications:
  RoboThree uses its own PostgreSQL Model Invocation/Event/Lease/Outbox facts
  as the only cross-process recovery source;
  the Harness starts two real Java PIDs with independent loopback ports and
  Hikari pools, and reuses only the project's already-closed Alignment-2B
  test infrastructure patterns;
  database-time lease takeover and fencing are verified together with
  durable SSE reconnect, cancellation races, database outage, schema drift
  and resource cleanup;
  all control routes, ProcessBuilder code and failure injection remain in a
  dedicated test-only profile and never enter the production Model Gateway
License/NOTICE action:
  No copied source; no additional NOTICE action
Regression test:
  Cgf2a3DualNodeModelRecoveryIntegrationTest
  CentralCgf2a3ArchitectureTest
  pnpm run check:central
  pnpm run check:central:offline
  pnpm run check
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS;
  user acceptance complete
Adopted date:
  2026-07-31
```

### AR-053：CGF-2B.1 双协议 Provider Stub 与安全传输

```text
RoboThree target:
  services/central-service/src/main/java/com/robothree/central/modelgateway/provider/
  services/central-service/src/main/java/com/robothree/central/modelgateway/port/
  services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/http/
  services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/provider/
  services/central-service/src/test/java/com/robothree/central/modelgateway/provider/
Upstream source:
  Open WebUI Provider Gateway and upper-layer responsibility separation
  OpenHands stable execution facts and transient stream separation
  OpenClaw fail-closed Gateway, credential non-disclosure and bounded connection lifecycle
Upstream revision:
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
Adoption type:
  DESIGN_ONLY + OWN_PROVIDER_PORTS + OWN_WIRE_ADAPTERS + OWN_CONFORMANCE
Copied or rewritten:
  No third-party source, DTO, parser, HTTP transport, credential implementation,
  route, test fixture or Provider SDK copied
Local modifications:
  RoboThree keeps public Invocation and durable recovery facts unchanged while
  introducing a transient provider-neutral request and bounded stream sink;
  Anthropic-compatible and OpenAI-compatible use separate fixed-route adapters
  and normalize to one RoboThree-owned event projection;
  credentials are resolved only inside the authorized POST transport and the
  source char array is cleared after header construction;
  strict allowlist/address/redirect/header/UTF-8/deadline/cancel/idle limits
  fail closed, with loopback HTTP available only through explicit test policy;
  CGF-2B.1 does not call a real provider or bridge user content from Desktop
License/NOTICE action:
  No copied source; no additional NOTICE action
Regression test:
  ModelProviderAdapterConformanceTest
  ModelProviderTransportSecurityTest
  CentralCgf2b1ArchitectureTest
  pnpm run check:central
  pnpm run check:central:offline
  pnpm run check
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS;
  user acceptance complete
Adopted date:
  2026-07-31
```

### AR-054：CGF-2B.3.1 Custom Relay Binding 与真实 Conformance

```text
RoboThree target:
  services/central-service/src/main/java/com/robothree/central/modelgateway/domain/
  services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/runtime/
  services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/provider/
  services/central-service/src/test/java/com/robothree/central/modelgateway/
  scripts/run-cgf2b3-custom-relay.mjs
Upstream source:
  Open WebUI Provider Gateway and upper-layer responsibility separation
  OpenHands stable execution facts and transient stream separation
  OpenClaw fail-closed Gateway, credential non-disclosure and bounded connection lifecycle
  LangGraph durable replay and conformance discipline
Upstream revision:
  Open WebUI ecd48e2f718220a6400ecf49eafd4867a38feb10
  OpenHands 4fe565663af2b4f1130a6e0dac7566b002bfe9b4
  OpenClaw deccdb5e57af6800d4f020ea2034166592a149ba
  LangGraph 49ae27c2ae983cfb92091b0dea9f7bc37a716479
Adoption type:
  DESIGN_ONLY + OWN_BINDING_MODEL + OWN_RUNTIME_BRIDGE + OWN_HARNESS + OWN_CONFORMANCE
Copied or rewritten:
  No third-party source, DTO, Provider SDK, HTTP client, parser, endpoint policy,
  credential implementation, test fixture or recovery code copied
Local modifications:
  RoboThree treats direct Provider and enterprise Relay as two Connection Modes
  sharing the same protocol-specific Adapter set instead of duplicating a Relay
  adapter hierarchy;
  an immutable Central-internal Binding separates the RoboThree modelId from the
  upstreamModelId used only in the wire request;
  direct and relay endpoints use independent strict allowlist policy instances,
  while redirect, address, header, UTF-8, cancellation and deadline rules remain
  unchanged;
  real Relay verification is opt-in and resource-gated, with safe diagnostics,
  deltaCount/digest evidence and dynamic Key/canary/endpoint leakage scanning;
  repair.1 additionally accepts only the controlled B.2/B.3 credential
  environment namespaces and folds monotonic per-frame OpenAI-compatible usage
  into one final Usage event while rejecting any token-count regression;
  a public SiliconFlow custom relay completed Streaming, invalid credential,
  cancellation, deadline and zero-leak conformance, but is not treated as
  enterprise private-network readiness;
  public Contract, PostgreSQL v0007, Controller, Desktop and Local Core remain
  unchanged
License/NOTICE action:
  No copied source; no additional NOTICE action
Regression test:
  ProviderBackedModelInvocationExecutionBackendTest
  ProviderRuntimeBridgeConformanceTest
  ModelProviderAdapterConformanceTest
  ModelProviderTransportSecurityTest
  CustomRelayBindingSeedTest
  CentralCgf2b31ArchitectureTest
  pnpm run check:central
  pnpm run check:central:offline
  pnpm run check
  pnpm run check:cgf2b3:custom-relay
Reviewer:
  Codex 5.6 repair.1 developer self-review and public relay conformance complete;
  Claude Code independent QA PASS; user acceptance complete;
  enterprise private-network conformance moved to Enterprise Integration
Adopted date:
  2026-08-02
```

### AR-055：ARH-1 Provider Stream Conformance

```text
RoboThree target:
  services/core/src/reliability/model-stream-validator.ts
  services/core/src/application/agent-loop-coordinator.ts
  services/core/src/application/durable-enterprise-model-provider.ts
  services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/provider/
  services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/runtime/
  services/core/tests/model-provider.conformance.test.ts
  services/core/tests/agent-loop-coordinator.test.ts
  services/central-service/src/test/java/com/robothree/central/modelgateway/provider/
Upstream source:
  OpenCode Agent Loop / Provider Channel / serial Tool dispatch design
Upstream revision:
  73ee493265acf15fcd8caab2bc8cd3bd375b63cb (archived)
Adoption type:
  DESIGN_ONLY + OWN_STREAM_STATE_MACHINE + OWN_CONFORMANCE
Copied or rewritten:
  No OpenCode Go source, DTO, provider adapter, SDK integration, fixture, prompt,
  migration or protocol field copied
Local modifications:
  RoboThree keeps its provider-neutral public ModelStreamEvent unchanged and
  adds a Core-internal sequence validator at the Agent Loop's single stream
  consumption point;
  terminal is buffered until natural stream completion so a late event cannot
  manufacture a completed Assistant Message;
  cancellation drops late ephemeral events, provider errors become safe typed
  failures, and Tool Call / usage identities fail closed on duplicate or drift;
  existing Central Anthropic-compatible and OpenAI-compatible adapters retain
  protocol-specific validation and add equivalent blank-text / duplicate Tool
  identity coverage;
  ARH-1 does not enter automatic Compaction or persistent token accounting
License/NOTICE action:
  OpenCode is MIT; design-only adoption with no copied source requires no new
  bundled NOTICE action
Regression test:
  model-provider.conformance.test.ts
  agent-loop-coordinator.test.ts
  durable-enterprise-model-provider.test.ts
  ModelProviderAdapterConformanceTest
  pnpm run check:central
  pnpm run check:central:offline
  pnpm run check
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS (P0/P1/P2/P3 = 0);
  user accepted and closed ARH-1
Adopted date:
  2026-08-12
```

### AR-056：ARH-2.1 Atomic Compaction Planning

```text
RoboThree target:
  services/core/src/application/conversation-atomic-group-planner.ts
  services/core/src/application/compaction-source-range-planner.ts
  services/core/src/application/context-assembler.ts
  services/core/src/application/turn-snapshot-builder.ts
  services/core/src/persistence/compaction-execution-binding.ts
  services/core/src/adapters/sqlite/migrations.ts
Upstream source:
  OpenCode archived compaction / serial Tool dispatch design;
  existing RoboThree ADR-010 Context Pipeline and ADR-017 Tool Call durable facts
Upstream revision:
  73ee493265acf15fcd8caab2bc8cd3bd375b63cb (archived)
Adoption type:
  DESIGN_ONLY + OWN_ATOMIC_PLANNER + OWN_PERSISTENCE_CONFORMANCE
Copied or rewritten:
  No OpenCode Go source, DTO, provider adapter, fixture, prompt, migration or
  protocol field copied
Local modifications:
  RoboThree uses its own durable ToolCallBatch dispositions, ConversationMessage
  envelopes, CompactionJob/Record double transaction and exact Task capability lock;
  Summary remains a low-authority derived conversation segment;
  CompactionExecutionBinding is a Core-private immutable recovery fact;
  production automatic orchestration remains deferred to ARH-2.2
License/NOTICE action:
  OpenCode is MIT; design-only adoption with no copied source requires no new
  bundled NOTICE action
Regression test:
  pnpm run harness:arh2.1
  conversation-atomic-group-planner.test.ts
  compaction-source-range-planner.test.ts
  context-pipeline.test.ts
  conversation-persistence.conformance.test.ts
  sqlite-conversation-persistence.integration.test.ts
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS (P0/P1/P2/P3 = 0);
  user accepted and closed ARH-2.1
Adopted date:
  2026-08-12
```

### AR-057：ARH-2.2 Production Automatic Compaction Orchestration

```text
RoboThree target:
  services/core/src/application/context-preparation-coordinator.ts
  services/core/src/application/compaction-provenance-resolver.ts
  services/core/src/application/model-backed-compaction-summarizer.ts
  services/core/src/application/durable-agent-loop-starter.ts
  services/core/src/ports/compaction-model-invocation-link-persistence.ts
  services/core/src/adapters/sqlite/migrations.ts
Upstream source:
  OpenCode archived compaction / serial Agent Loop design;
  existing RoboThree ADR-010 Context Pipeline, ADR-017 durable execution,
  ARH-1 stream state machine and ARH-2.1 immutable execution binding
Upstream revision:
  73ee493265acf15fcd8caab2bc8cd3bd375b63cb (archived)
Adoption type:
  DESIGN_ONLY + OWN_ORCHESTRATOR + OWN_DURABLE_LINK + OWN_CONFORMANCE
Copied or rewritten:
  No OpenCode Go source, DTO, prompt, provider adapter, fixture, migration or
  protocol field copied
Local modifications:
  RoboThree keeps Context assessment, purpose-bound external admission, exact
  Task capability locks, two-transaction Compaction and Assistant Message commit
  as separate local concepts;
  active Summary provenance is rebuilt from immutable Conversation evidence;
  a Core-private invocation link separates summary calls from main Assistant calls;
  ARH-1 validates every summary stream and partial output never becomes durable;
  ARH-2.3 full recovery harness and ARH-3 accounting remain gated
License/NOTICE action:
  OpenCode is MIT; design-only adoption with no copied source requires no new
  bundled NOTICE action
Regression test:
  pnpm run harness:arh2.2
  pnpm run check
  pnpm run check:central
  pnpm run check:central:offline
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS;
  user accepted and closed ARH-2.2
Adopted date:
  2026-08-12
```

### AR-058：ARH-3.1 Durable Usage Facts 与 Retry Dedupe

```text
RoboThree target:
  services/central-service/src/main/java/com/robothree/central/modelgateway
  services/central-service/deploy/sql/postgresql/baseline/B0008__provider_usage_facts.sql
  services/central-service/deploy/sql/postgresql/upgrade/U0008__provider_usage_facts_from_v0007.sql
  services/core/src/ports/provider-usage.ts
  services/core/src/ports/provider-usage-projection-persistence.ts
  services/core/src/adapters/sqlite/sqlite-provider-usage-projection-persistence.ts
  services/core/src/adapters/sqlite/migrations.ts
Upstream source:
  Codex persistent token-count replay and Session usage tracking design;
  OpenCode retry/accounting design research;
  existing RoboThree CGF-2 durable invocation, fencing and ARH-1 stream facts
Upstream revision:
  Codex e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7;
  OpenCode 73ee493265acf15fcd8caab2bc8cd3bd375b63cb
Adoption type:
  DESIGN_ONLY + OWN_USAGE_FACT + OWN_PERSISTENCE + OWN_CONFORMANCE
Copied or rewritten:
  No third-party source, DTO, SQL, Provider SDK, fixture, prompt or protocol
  field copied
Local modifications:
  RoboThree separates ContextBudgetEstimate, ProviderUsageFact and future CostProjection;
  authority namespace, invocation identity and fencing epoch define durable attempt identity;
  Central PostgreSQL is authoritative only for central_enterprise, while local_personal is
  limited to a Core-private Port/Fake in ARH-3.1;
  terminal winner Fact/Event/Outbox/terminal are committed atomically, stale owner facts are
  superseded_confirmed, and Core stores only a safe derived invocation projection;
  Session totals are deterministically rebuilt instead of maintained as a second mutable fact
License/NOTICE action:
  Design-only adoption with no copied source requires no new bundled NOTICE action
Regression test:
  pnpm run harness:arh3.1
  pnpm run check
  pnpm run check:central
  pnpm run check:central:offline
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS (4 files / 24 tests; Workspace 162 / 1099;
  Central online/offline BUILD SUCCESS; P0/P1/P2/P3 = 0);
  user accepted and closed ARH-3.1 on 2026-08-13
Adopted date:
  2026-08-13
```

### AR-059：ARH-3.2.1 Exact Session Scope 与 Gateway v1alpha2 Foundation

```text
RoboThree target:
  contracts/enterprise-gateway/v1alpha2
  services/core/src/ports/session-scope-digest-provider.ts
  services/core/src/application/session-scope-digest-provider.ts
  services/core/src/adapters/sqlite/sqlite-prompt-cache-context-persistence.ts
  services/core/src/adapters/http/http-enterprise-model-gateway-client.ts
  services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/http
Upstream source:
  Codex exact Session cache identity and transport-identity separation design;
  OpenAI and Anthropic official protocol documentation;
  existing RoboThree CGF-2C.1 Gateway recovery and ARH-3.1 authority model
Upstream revision:
  Codex e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7;
  official protocol documentation reviewed for ARH-3 Revision 3
Adoption type:
  DESIGN_ONLY + OWN_CACHE_CONTEXT + OWN_PERSISTENCE + OWN_CONFORMANCE
Copied or rewritten:
  No third-party source, DTO, SQL, Provider SDK, fixture, prompt or protocol
  implementation copied
Local modifications:
  RoboThree derives an opaque exact Session proof through a Core-private HMAC namespace;
  semantic request digest and cache-context digest remain separate;
  v1alpha2 locks all four Model routes to one wire operation while v1alpha1 stays unchanged;
  Core migration 21 preserves C1/C2 recovery facts without persisting raw Session or namespace key
  outside local SQLite;
  Central exposes only a conditional typed seam in 3.2.1, so durable Planner, v0009 and Provider
  cache projection remain gated
License/NOTICE action:
  Design-only adoption with no copied source requires no new bundled NOTICE action
Regression test:
  pnpm run harness:arh3.2.1
  pnpm run check
  pnpm run check:central
  pnpm run check:central:offline
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS (4 files / 60 tests; Workspace 163 / 1132 + 3 smoke;
  Central online/offline 233 / 0 / 0 / 0; P0/P1/P2/P3 = 0);
  user accepted and closed ARH-3.2.1 on 2026-08-14
Adopted date:
  2026-08-14
```

### AR-060：ARH-3.2.2 Durable Prompt Cache Planner 与 v0009

```text
RoboThree target:
  services/central-service/src/main/java/com/robothree/central/modelgateway/application
  services/central-service/src/main/java/com/robothree/central/modelgateway/domain
  services/central-service/src/main/java/com/robothree/central/modelgateway/port
  services/central-service/deploy/sql/postgresql/baseline/B0009__prompt_cache_planning.sql
  services/central-service/deploy/sql/postgresql/upgrade/U0009__prompt_cache_planning_from_v0008.sql
  scripts/run-arh322-harness.mjs
Upstream source:
  Codex exact Session cache identity, static-prefix identity separation and
  prompt-cache compatibility design;
  OpenAI and Anthropic official prompt-cache protocol documentation;
  existing RoboThree ARH-3.1 Usage Facts and ARH-3.2.1 v1alpha2 Context Foundation
Upstream revision:
  Codex e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7;
  official protocol documentation reviewed for ARH-3 Revision 3
Adoption type:
  DESIGN_ONLY + OWN_CACHE_PLANNER + OWN_PERSISTENCE + OWN_CONFORMANCE
Copied or rewritten:
  No third-party source, DTO, SQL, Provider SDK, fixture, prompt or protocol
  implementation copied
Local modifications:
  RoboThree separates Session security scope, immutable static-source lock,
  final static-prefix digest and cache key into four durable identities;
  versioned Profile Seed and exhaustive Compatibility classification are
  materialized into an immutable Plan instead of a mutable runtime toggle;
  Transaction A binds invocation and cache context, Transaction B persists the
  exact Plan before dispatch, and Runtime remains the sole terminal writer;
  PostgreSQL v0009, InMemory/MyBatis conformance and C3-C7 dual-JVM recovery are
  owned locally; Provider cache-field projection remains gated to ARH-3.2.3
License/NOTICE action:
  Design-only adoption with no copied source requires no new bundled NOTICE action
Regression test:
  pnpm run harness:arh3.2.2
  pnpm run check
  pnpm run check:central
  pnpm run check:central:offline
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS (9 classes / 66 tests; Workspace 163 / 1132 +
  3 smoke; Central online/offline BUILD SUCCESS; P0/P1/P2/P3 = 0);
  user accepted and closed ARH-3.2.2 on 2026-08-14
Adopted date:
  2026-08-14
```

### AR-061：ARH-3.2.3 双协议 Provider Cache Projection Closure

```text
RoboThree target:
  services/central-service/src/main/java/com/robothree/central/modelgateway/application
  services/central-service/src/main/java/com/robothree/central/modelgateway/domain
  services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/provider
  scripts/run-arh323-harness.mjs
Upstream source:
  OpenAI and Anthropic official prompt-cache protocol documentation;
  existing RoboThree ARH-3.1 Usage Facts and ARH-3.2.2 immutable Prompt Cache Plan
Upstream revision:
  official protocol documentation reviewed for ARH-3 Revision 3 and ARH-3.2.3 Revision 1
Adoption type:
  DESIGN_ONLY + OWN_PROVIDER_PROJECTION + OWN_USAGE_FACT + OWN_RECOVERY + OWN_CONFORMANCE
Copied or rewritten:
  No Provider SDK, third-party source, DTO, fixture, SQL, prompt or protocol implementation copied
Local modifications:
  RoboThree resolves an immutable Plan into a typed provider projection before Adapter dispatch;
  Anthropic uses a reviewed provider-default ephemeral marker without a hard-coded TTL, while
  OpenAI separates automatic-observed and explicit opaque prompt-cache-key modes;
  static material planning is shared by digest validation and wire construction, and deterministic
  rejection never retries silently without cache fields;
  Provider Usage remains the only cache hit/write fact, and Runtime remains the sole durable terminal writer;
  controlled out-of-process providers prove C8-C10, cancellation, deadline, leakage and resource cleanup
License/NOTICE action:
  Design-only adoption with no copied source requires no new bundled NOTICE action
Regression test:
  pnpm run harness:arh3.2.3
  pnpm run check
  pnpm run check:central
  pnpm run check:central:offline
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS (10 classes / 93 tests; Workspace 163 / 1132 +
  3 smoke; Central offline 297 / 0 / 0 / 0; P0/P1/P2 = 0, P3 = 1 non-product flake);
  user accepted and closed ARH-3.2.3 and ARH-3.2 on 2026-08-15;
  CTR-P3-001 tracked separately and does not enter ARH-3.3 automatically
Adopted date:
  2026-08-14
```

### AR-062：ARH-3.3.1 Multi-Session Topology Foundation

```text
RoboThree target:
  services/core/tests/fixtures/arh331-core-child.mjs
  services/core/tests/arh3.3.1-multi-session-topology.test.ts
  services/central-service/src/test/java/com/robothree/central/modelgateway/application/PromptCachePlannerTest.java
  scripts/run-arh331-harness.mjs
Upstream source:
  AR-058 through AR-061 accepted RoboThree designs;
  Codex/OpenCode research for Session-scoped accounting and evidence-driven harness design
Upstream revision:
  local research baseline reviewed through ARH-3 Revision 3 and ARH-3.3 detailed plan
Adoption type:
  DESIGN_ONLY + OWN_EVIDENCE_HARNESS + OWN_CONFORMANCE
Copied or rewritten:
  No third-party source, Provider SDK, DTO, fixture, SQL, prompt or runtime implementation copied
Local modifications:
  RoboThree keeps two independent Core processes alive with separate SQLite stores while Central proves
  dual-JVM shared-PostgreSQL behavior and a controlled out-of-process Provider;
  three Sessions across two enterprise/user scopes prove same-Session cross-Turn stability, cross-Session
  isolation, Usage Projection isolation and enterprise/local-personal authority separation;
  final Evidence contains only counts, digests, statuses, duration and resource metrics, while M1-M8 and
  Compaction recovery remain gated for ARH-3.3.2/3
License/NOTICE action:
  Design-only adoption with no copied source requires no new bundled NOTICE action
Regression test:
  pnpm run harness:arh3.3.1
  pnpm run check
  pnpm run check:central
  pnpm run check:central:offline
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS (12/12 scenarios; Workspace 164 / 1139 + 3 smoke;
  Central online/offline 299 / 0 / 0 / 0 after bounded rerun; P0/P1/P2 = 0, P3 = 1 existing CTR-P3-001);
  user accepted and closed ARH-3.3.1 on 2026-08-15
Adopted date:
  2026-08-15
```

### AR-063：ARH-3.3.2 Recovery、Usage 与 Compaction Matrix

```text
RoboThree target:
  scripts/run-arh332-harness.mjs
  existing RoboThree Core/Central recovery, Usage, Cache and Compaction Harnesses
Upstream source:
  AR-057 through AR-062 accepted RoboThree designs;
  Codex/OpenCode research for evidence-driven and failure-window Harness composition
Upstream revision:
  local research baseline reviewed through ARH-3 Revision 3 and ARH-3.3.2 plan
Adoption type:
  DESIGN_ONLY + OWN_MATRIX_ORCHESTRATION + OWN_SAFE_EVIDENCE
Copied or rewritten:
  No third-party source, Provider SDK, DTO, SQL, fixture, prompt or runtime implementation copied
Local modifications:
  RoboThree composes existing real Core SQLite/process recovery and Central dual-JVM/Testcontainers
  harness owners through one serial runner instead of duplicating their topology implementations;
  M1-M8, main/initial/rolling Usage, five cache observations, first/rolling Compaction and resource
  closure are normalized into an allowlisted 52-scenario evidence record;
  known CTR-P3-001 timing maintenance is excluded by exact method selection rather than retry masking
License/NOTICE action:
  Design-only adoption with no copied source requires no new bundled NOTICE action
Regression test:
  pnpm run harness:arh3.3.2
  pnpm run check
  pnpm run check:central
  pnpm run check:central:offline
Reviewer:
  Codex 5.6 developer self-review complete;
  Claude Code independent QA PASS (52/52 scenarios; Node 79 tests; Central 27 tests;
  Workspace 164 / 1155 + 3 smoke; Central online/offline 299 / 0 / 0 / 0; P0-P3 = 0);
  user accepted and closed ARH-3.3.2 on 2026-08-15
Adopted date:
  2026-08-15
```

### AR-064：ARH-3.3.3 Unified Closure Evidence 与轻量长稳 Harness

```text
RoboThree target:
  scripts/run-arh333-harness.mjs
  scripts/run-arh333-stability-cycle.mjs
  scripts/arh333-evidence.mjs
  test-only Core/Central safe evidence and controlled process fixtures
Upstream source:
  AR-057 through AR-063 accepted RoboThree runtime and evidence designs;
  Codex/OpenCode research for evidence-driven harness, semantic replay and failure-window testing
Upstream revision:
  local research baseline reviewed through ARH-3 Revision 3 and ARH-3.3.3 Revision 1
Adoption type:
  DESIGN_ONLY + OWN_UNIFIED_HARNESS + OWN_SAFE_EVIDENCE + OWN_STABILITY_CYCLE
Copied or rewritten:
  No third-party source, Provider SDK, DTO, SQL, prompt, fixture or runtime implementation copied
Local modifications:
  RoboThree separates three full M1-M8 semantic replays from a subsequent lightweight stability phase;
  each lightweight cycle proves six durable/recovery facts and eight real resource counters without
  replaying the full Central matrix;
  exact Node 24 preflight, semantic/stability digest separation, OS-assigned relay ports and safe failure
  evidence make the closure result reproducible without masking failed runs;
  CTR-P3-001 remains an independent maintenance item and is not absorbed by this harness
License/NOTICE action:
  Design-only adoption with no copied source requires no new bundled NOTICE action
Regression test:
  pnpm run harness:arh3.3.3:quick
  pnpm run harness:arh3.3.3
  pnpm run check
  pnpm run check:central
  pnpm run check:central:offline
Reviewer:
  Codex 5.6 developer self-review complete;
  developer formal gate PASS (3 full replays + 85 lightweight cycles, 88 lifecycle cycles total,
  52/52 scenarios, sensitive scan 0, eight resource counters 0);
  independent QA pending
Adopted date:
  2026-08-16
```
