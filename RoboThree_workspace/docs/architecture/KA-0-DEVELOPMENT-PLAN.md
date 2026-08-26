# RoboThree KA-0 开发计划

> 状态：**CONFIRMED**  
> 日期：2026-07-19  
> 实施策略：**Kernel Framework First，Chat Last**  
> 关联决策：[ADR-001](../adr/001-deployment-boundary.md)、[ADR-003](../adr/003-kernel-alpha-milestones.md)、[ADR-004](../adr/004-kernel-alpha-technology-stack.md)

MVP 用户功能、P0/P1 边界和验收范围以 [RoboThree MVP 功能范围与开发基线 v1.0](../product/ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md) 为准。

## 1. 目的

KA-0 先建设 RoboThree 的应用内核框架，再接入 Electron Chat 作为薄客户端和集成验收入口。

本计划不把 RoboThree 建设成独立的通用 Agent SDK，也不以“先把页面跑起来”为目标。首要目标是形成可验证的边界、状态所有权、扩展接口、恢复语义和性能基线，使后续 Chat、Tool、MCP、Worker 和企业服务均通过稳定 Contract 接入。

```text
KAF-0～KAF-5：Framework First
        ↓
KA-0 Chat：薄客户端集成验收
        ↓
KA-1：真实 Agent、Tool 与本地文件任务
```

## 2. 上游借鉴原则

KA-0 的结构以成熟 Agent 的源码机制为输入，详细来源见[上游借鉴登记表](./UPSTREAM-ADOPTION-REGISTER.md)。

| RoboThree 模块 | 主参考 | 采用内容 | 不照搬内容 |
| --- | --- | --- | --- |
| Core Bootstrap | OpenClaw Gateway | Node.js Core 生命周期、配置加载、数据库预检、Provider 注册 | 20+ Channel、Cron、Marketplace 和大型 Gateway 单文件 |
| Runtime 隔离 | Grok Build | ChatState Actor、消息通道、独立运行任务 | `RefCell/Mutex` 混合共享状态、ACP 和 Leader 模式 |
| 状态与事件 | OpenHands | Agent Definition/State 分离、Action/Observation、EventLog | Python/Pydantic 类型和完整上游事件树 |
| Checkpoint | LangGraph | Checkpoint Port、Interrupt/Resume、Conformance Test 思路 | Pregel、Superstep 和图编排 API |
| Model Runtime | OpenClaw + Grok | Provider Adapter、流式事件、AbortSignal、错误分类与退避 | 同时实现多厂商 Provider 和复杂 fallback |
| Context Assembly | Hermes + OpenHands | 持久消息与 API-time 临时上下文分离 | 将全部知识和 Tool Schema 永久写入 Session |
| UI Protocol | Open WebUI | typed delta/status/completion 事件 | `localStorage` Token、动态 `execute/eval` 事件 |
| Worker 演进 | OpenHands + Daytona | 类型化 ToolExecutionBackend、Control/Compute 分离 | KA-0 建设远程 Sandbox Fleet 或嵌入 AGPL 平台代码 |

任何上游借鉴都必须记录固定 Commit、许可证、证据位置、采用类型和“不照搬原因”。研究报告不能代替源码复核。

## 3. 架构边界

```text
Desktop / Headless Harness / Future Enterprise Client
                         ↓
                  Application API
                         ↓
RoboThree Kernel
├── Runtime State Machine
├── Agent Orchestrator
├── Capability Resolver
├── Authorization / User Confirmation
├── Event / Checkpoint
└── Context Assembly
                         ↓
Ports
├── ModelProvider
├── ToolProvider
├── ToolExecutionBackend
├── Persistence
├── CredentialResolver
└── EventPublisher
                         ↓
Adapters
├── Fake
├── SQLite
├── OpenAI-compatible
├── Local Worker
├── MCP
└── Central Enterprise Service
```

### 3.1 固定依赖方向

```text
Contracts ← Kernel ← Application ← Adapters / API / Desktop
```

- Contract 不依赖 Core、Electron、数据库或 Provider SDK；
- Kernel 不依赖 Electron、SQLite、OpenAI SDK 或具体 Tool；
- Application 只通过 Port 使用外部能力；
- Adapter 可以依赖第三方 SDK，但不得反向泄漏其类型；
- Desktop、CLI 和测试 Harness 使用同一 Application API；
- Worker 只能通过版本化 Execution Protocol 返回 Observation。

### 3.2 核心不变量

1. `AgentDefinition` 不持有 Task 可变状态；
2. Task Runtime 是 Task/Run/Step 状态的唯一写入者；
3. 所有跨边界输入经过运行时 Schema 校验；
4. 每个 Run 具有独立 CancellationScope 和 Deadline；
5. Registry finalize 后，运行中能力集合不可静默变化；
6. 副作用执行前先持久化 Intent；
7. Event 保存后才对 UI/Audit 发布；
8. 不确定副作用进入 Reconciliation，不盲目重试；
9. Secret 不进入 Contract、Event、日志或 Renderer；
10. Core 不包含行业场景分支。

## 4. 最小工程结构

沿用现有 Monorepo，只增加实际需要的目录：

```text
packages/contracts/src
├── common
├── session
├── task
├── agent
├── capability
├── model
├── tool
├── execution
├── policy
├── event
└── checkpoint

services/core/src
├── bootstrap
├── kernel
│   ├── commands
│   ├── runtime
│   ├── state-machine
│   ├── transitions
│   └── cancellation
├── application
├── capabilities
│   ├── registry
│   ├── resolver
│   └── bindings
├── ports
├── adapters
└── api

tests
├── contract
├── conformance
├── integration
├── recovery
├── performance
└── e2e
```

KA-0 不预先创建独立 `kernel`、`sdk`、`registry` 公共 package。只有出现两个以上真实消费者、独立发布或权限隔离需求后再拆包。

## 5. 开发阶段

### KAF-0：工程与边界基线

**预计：2～3 个工作日**

交付：

- pnpm Workspace 的 build/test/lint/typecheck 脚本；
- TypeScript strict 配置和模块依赖规则；
- Contract 运行时 Schema 基础；
- Core 独立启动入口与生命周期；
- Fake Clock、Fake ID、Fake Model、Fake Persistence；
- Adapter Conformance Test 骨架；
- 结构化日志基础和敏感字段过滤；
- 上游借鉴登记与第三方声明流程。

参考：OpenClaw Gateway Bootstrap、OpenClaw Zod/TypeBox 边界、LangGraph Conformance Suite。

退出门槛：Core 可在不依赖 Electron、真实模型和 SQLite 的条件下启动并完成健康检查；边界测试阻止 Kernel 引用 Adapter。

### KAF-1：Runtime Kernel

**预计：4～6 个工作日**  
**前置门槛：冻结 ADR-005 的必要部分。**

交付：

- Session/Task/Run/Step；
- AgentDefinition 与 TaskRunState 分离；
- Command、Transition、RuntimeError；
- Action/Observation；
- ExecutionPlanRevision 最小引用模型；
- 单写入者运行队列；
- Cancellation、Deadline 和失败收敛；
- 纯内存状态机和确定性测试。

参考：OpenHands ConversationState 与 Action/Observation；Grok ChatState Actor；LangGraph 显式状态与 Interrupt。

退出门槛：状态机不依赖 I/O；非法转换稳定拒绝；并发 Command 不会产生双写或跨 Run 串扰。

### KAF-2：Event、Persistence 与恢复

**预计：4～6 个工作日**  
**前置门槛：冻结 ADR-007 的事务与恢复不变量。**

详细批次、模块边界和故障注入矩阵见 [KAF-2 开发计划](./KAF-2-DEVELOPMENT-PLAN.md)。

交付：

- SQLite migration 与 Repository；
- Event append 与 sequence；
- Action Intent、Observation、Checkpoint；
- Outbox；
- Idempotency Key；
- Waiting/Running/Uncertain 状态恢复；
- Checkpoint 后增量重放；
- 崩溃点注入测试。

参考：OpenHands EventLog/ConversationState；LangGraph SQLite Checkpointer 与 Checkpoint Conformance；OpenClaw SQLite preflight。

退出门槛：在 Intent 前、执行后未保存 Result、保存 Result 未发布等崩溃点均能得到确定恢复结果，不重复可确认副作用。

### KAF-3：Capability 与 Adapter 框架

**预计：4～6 个工作日**

**编码门槛：ADR-008 已接受。详细批次与边界见 [KAF-3 开发计划](./KAF-3-DEVELOPMENT-PLAN.md)。**

交付：

- CapabilityDefinition、CapabilityBinding、AdapterDescriptor 与非 Contract 的 RuntimeAdapterHandle 分层；
- RegistryBuilder → validate → finalize → immutable registry；
- Agent 可见 model/tool 与基础设施资源分区；
- 只按显式 ID 解析的 CapabilityResolver；
- ModelProvider、ToolCatalogProvider、ToolExecutionBackend Port；
- TaskCapabilityLock 精确修订与物化恢复信息；
- Fake Model/Tool Backend；
- 最小进程外 Echo Tool Adapter；
- 每类 Adapter 的 Conformance Test。

参考：Grok ToolRegistryBuilder/FinalizedToolset；OpenHands Spec/Definition/Executable 与 Local/Remote 执行抽象；OpenClaw 声明式 Manifest 与启动校验。

退出门槛：新增第二个 Fake Provider/Tool Backend 不修改 Kernel；不兼容 Contract 在注册或启动阶段失败；Runtime Handle 不进入持久 Contract；真实进程外 Echo 的 IPC、序列化、超时、崩溃和 Observation 链路通过。

明确不包含：通用能力搜索/评分、Binding failover、CredentialResolver/EventPublisher 扩张、完整 MCP/Office/Browser、真实模型和第三方代码热加载。

### KAF-4：固定授权、用户确认、并发、可靠性与性能

**预计：6～9 个工作日**  
**编码门槛：ADR-006 已接受；详细批次与边界见 [KAF-4 开发计划](./KAF-4-DEVELOPMENT-PLAN.md)。**

交付：

- 固定用户权限、Workspace 边界、Tool 风险和 Desktop 用户确认链路；
- 普通已授权文件创建/修改不重复确认，外部调用按任务、目标与数据范围确认，范围变化时重新确认；
- bounded queue 与 backpressure；
- 每 Run 单写入者和系统级并发上限；
- 全链路取消、Timeout、Deadline；
- retry/error classification；
- Streaming/Event 批量与合并；
- SQLite WAL、事务批处理与 prepared statement；
- 性能基准和内存稳定性测试。

参考：Grok Permission 前置检查和 Sampler Retry；OpenClaw AbortSignal/Backoff；OpenHands 远程执行取消与事件增量。

明确不包含：完整 Policy 规则系统、企业运行时审批、Approver 角色、实时撤销生命周期和独立审批模块。

退出门槛：授权范围内的普通文件操作无重复弹窗；外部调用在相同确认范围内可连续执行，目标或数据范围变化时重新确认；慢消费者不会造成无界队列；取消传播、状态转换、恢复和 Event 写入达到本计划的初始性能目标。

### KAF-5：无 UI 框架验收

**预计：2～3 个工作日**

通过 Headless Test Harness 验证：

```text
1. Fake Model → Streaming → Completed
2. Model → Tool Action → Observation → Completed
3. High-risk Action → WaitingForUserConfirmation → Resume
4. Persist Intent → Crash → Restart → Recover
```

Harness 只用于测试，不发展成独立产品 CLI。

退出门槛：四条链路均可重复运行，输出一致的 Event Timeline，并证明 Kernel 不依赖 UI 和具体业务场景。

### KA-0 Chat：薄客户端集成

KAF-0～KAF-5 通过后，再接入 Electron + Vue Chat：

- 只调用 Application API；
- 只消费 typed realtime event；
- 不直接访问 SQLite、凭证、文件和系统命令；
- 不在 Renderer 复制 Session/Task 状态机；
- 不通过模型事件执行任意 JavaScript。

Chat 仍是 ADR-003 定义的 KA-0 产品验收结果，但不再主导 Kernel 的开发顺序。

## 6. 初始性能目标

以下是框架基准目标，不是最终商业 SLA。基准报告必须记录硬件、操作系统、Node 版本、数据规模和测试参数。

| 指标 | 初始目标 |
| --- | --- |
| 纯状态转换 | 不含 I/O，P95 小于 10 ms |
| 取消传播 | 到达 Fake Adapter，P95 小于 100 ms |
| 并发运行 | 16 个 Run 并发时状态不串扰，无无界队列 |
| Session 数据量 | 10,000 个 Session 可稳定分页，不全量载入内存 |
| Event 持久化 | 批量条件下 500～1,000 events/s，具体以基准机实测为准 |
| 恢复 | 有 Checkpoint 时不从第一个 Event 全量重放 |
| Streaming | 不按每个 Token 单独提交 SQLite 事务 |
| 内存稳定性 | 10,000 次短 Run 后无持续线性增长 |

达不到目标时，先通过 profiling 定位，再决定是否引入缓存、批处理或数据结构调整，不提前引入分布式组件。

## 7. 扩展性验收

1. 新增 ModelProvider 不修改 Kernel；
2. 新增 Tool 不修改 Task Runtime；
3. Local Worker 替换为 Remote Worker 不修改 Agent Loop；
4. SQLite 替换为 InMemory Persistence 不修改领域逻辑；
5. 同类 Adapter 运行统一 Conformance Suite；
6. Contract 版本不兼容时明确拒绝；
7. Registry finalize 后不能在运行中静默扩大能力；
8. Provider/Tool/Worker 错误统一映射为 RuntimeError；
9. Desktop、Harness 和未来企业 Client 使用同一 Application API；
10. Central Enterprise Service 通过 Port/Adapter 接入，不重写 Local Core。

## 8. 明确不做

- 公共 Plugin SDK；
- Marketplace；
- Workflow Builder；
- Multi-Agent/Subagent；
- 完整 Skill 治理；
- 完整 MCP 生命周期；
- Remote Sandbox Fleet；
- 多数据库兼容；
- 完整 DAG/Pregel 引擎；
- 大量 Provider；
- 每个概念一个 package 或微服务。

## 9. 第一批代码范围

文档确认后的第一批代码只实施 KAF-0：

```text
Workspace scripts
+ Contract runtime-schema foundation
+ Core bootstrap/lifecycle
+ Fake ports/adapters
+ Boundary and conformance test skeleton
```

第一批代码不实现 Chat UI、真实模型、SQLite 业务 Schema、Agent Loop、Tool、MCP 或 Worker。其目的在于建立后续代码必须遵守的工程和架构护栏。

## 10. 周期

- 最小 Kernel 骨架：7～10 个工作日；
- Contract、Runtime、Adapter 和 Persistence 框架：15～20 个工作日；
- 恢复、性能、扩展性与 Headless 验收：20～29 个工作日；
- 后续 Electron Chat 薄客户端：约 4～6 个工作日。

周期假设：单一主开发流、依赖安装正常、ADR 按阶段及时冻结，并可使用固定的本地测试环境。
