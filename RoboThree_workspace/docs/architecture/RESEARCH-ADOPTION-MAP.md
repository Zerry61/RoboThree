# RoboThree 开源 Agent 架构借鉴映射

> 状态：**PROPOSED**  
> 日期：2026-07-19  
> 用途：作为 RoboThree ADR 和 Kernel Alpha 设计输入，不代表直接复用上游代码。

## 1. 采用原则

1. 借鉴经过本地研究报告确认的架构模式，不因字段相似就复制上游实现。
2. 先判断模式是否适合 RoboThree 的企业治理、本地执行和开放扩展目标，再判断许可证和代码复用。
3. 每项采用结论使用 `ADOPT / ADAPT / DEFER / REJECT / OWN`：
   - `ADOPT`：设计原则可直接采用；
   - `ADAPT`：模式有价值，但需按 RoboThree 边界重新实现；
   - `DEFER`：当前不进入 Kernel Alpha；
   - `REJECT`：明确不采用；
   - `OWN`：上游没有满足要求的完整方案，由 RoboThree 自主设计。
4. 未进入 `robothree-agent-research/`、没有固定版本和源码证据的项目，只能作为候选线索，不能标记为已验证借鉴来源。

## 2. 借鉴矩阵

| RoboThree 能力 | 主参考 | 结论 | 采用内容 | 明确不照搬 |
| --- | --- | --- | --- | --- |
| Agent 配置与状态 | OpenHands | ADOPT 原则 | Agent Definition 与运行状态分离；状态显式进入 Task/Run State | 不把 `Agent.step()`描述为纯函数；不绑定 Pydantic 实现 |
| Agent Loop | Grok + OpenHands | ADAPT | Model → Action → Observation 的可取消循环 | Grok 内部混合 `RefCell/Mutex`；大型单函数循环 |
| Step/Checkpoint | LangGraph | ADAPT | Step 作为持久化边界；Interrupt/Resume；不可变 Plan Revision | 完整 Pregel/Superstep Runtime 和图编排 API |
| Event/Observation | OpenHands | ADAPT | 类型化 Action/Observation；EventLog 作为运行事实记录 | 直接采用上游全部事件树和存储格式 |
| Context Assembly | Hermes + OpenHands | ADOPT 原则 | 持久消息与 API-time 临时上下文分离；静态与动态上下文分层 | 将企业知识永久写入 Session 消息；把所有 Tool Schema 强塞 System Prompt |
| Tool Registry | Grok + OpenHands + OpenClaw | ADAPT | Definition/Binding/Descriptor 分层；受信声明注册、校验、冻结后执行 | Grok 三套 Tool 实现并存；OpenClaw 运行期 Plugin Activation |
| Workspace | OpenHands | ADAPT | Workspace 作为授权资源边界；Local/Remote 抽象 | 把 Workspace 当作 Tool Runtime；生产使用无隔离 LocalWorkspace |
| Permission | Grok + Hermes | ADAPT | 类型化 Access/Decision；Scope、Policy、Guardrail 分层 | 依赖字符串约定；各 Plugin 自行决定最终权限 |
| Data Policy | RoboThree | OWN | 数据等级、目的地、模型外发和脱敏策略独立建模 | 将数据等级映射为 Tool 风险等级 |
| Action Risk | Grok + OpenHands 机制参考 | ADAPT | 由 Tool 元数据、参数和目标资源确定风险 | 让 LLM 自填风险后获得权限 |
| Skill | Hermes + OpenClaw + OpenHands | ADAPT | 声明式、版本化 Skill；引用 Tool/Knowledge；多来源加载 | Skill 内嵌任意 Python/JavaScript/Shell |
| Agent Role/Definition | OpenHands Registry + OpenClaw Capability | ADAPT | Agent 身份、Skill、Tool、Knowledge、Model、Policy Binding | 与 Access Role 混用；运行中静默扩大 Tool 集合 |
| MCP | OpenHands + OpenClaw + Grok | ADAPT | MCP Tool/Resource/Prompt/Notification 映射到对应内部 Contract | 将 MCP 整体降格为 Tool；绕过 Policy/Audit |
| Knowledge/Memory | OpenClaw + Hermes | ADAPT | Provider 接口；调用时检索注入；Memory 与 Knowledge 分层 | Core 绑定单一向量库；自主无限写 Memory |
| Model Gateway | Grok 简化协议 + Provider Adapter 模式 | ADAPT | OpenAI-compatible 作为首个 Adapter；统一流式、错误、用量 | Kernel Alpha 同时实现大量 Provider；过早绑定 LiteLLM 或单一厂商 |
| Local Worker | OpenHands/Hermes 环境抽象 | ADAPT | 类型化 ToolExecutionBackend；独立执行进程；显式 Cancellation/Deadline | 万能 ExecutionBackend；风险 Tool 与 Core 共享线程和地址空间 |
| Remote/Sandbox Worker | Daytona | DEFER/ADAPT | P1/P2 参考 Job Polling、Heartbeat、Control/Compute 分离 | P0 Local Worker 使用远程轮询；特权容器；AGPL 代码直接嵌入 |
| Audit | OpenHands EventLog + Daytona 模式 | ADAPT | Intent/Result 记录；Event 派生审计视图 | Kernel Alpha 引入 OpenSearch 等重型审计设施 |
| UI Protocol | Open WebUI + OpenHands | ADOPT 原则 | REST 命令/资源 + typed realtime events | localStorage 长期令牌；后端推送任意代码执行 |
| Observability | OpenTelemetry | ADOPT 基础 | Trace/Span、结构化日志、Token/Cost 指标 | 同时耦合多套 LLM 观测产品 |
| Identity | 通用 OIDC/RBAC + OpenClaw Device 思路 | OWN/ADAPT | 通用 OIDC、Access Role、设备凭证 | Auth0 锁定；把设备 Pairing 等同用户授权 |
| Capability Resolution | RoboThree | OWN | Alpha 只按显式 ID 确定性解析并应用实时收窄；Identity/Policy/候选路由后置 | 搜索、评分、health 自动换 Binding；仅凭“已注册”判断能力可执行 |
| ExecutionPlan | RoboThree + LangGraph 语义参考 | OWN | 增量规划；Revision 不可变；每步引用明确 Revision | 强制预先生成完整 DAG；原地修改计划 |

## 3. 必须保持独立的概念

### 3.1 Authorization、Risk、Data、Policy、Approval

```text
Authorization：用户是否有资格访问资源
Action Risk：本次操作的危险程度
Data Classification：数据的敏感程度
Policy Decision：结合上下文作出 Allow/Deny/RequireApproval
Approval：对具体 Action 的人工决策
```

五者不能互相替代。尤其不能使用以下错误映射：

```text
LOW Risk = PUBLIC Data
HIGH Risk = CONFIDENTIAL Data
ConfirmationPolicy = RBAC
```

### 3.2 Tool、Worker、Workspace

```text
Tool：Agent 可以请求什么操作
Worker：操作在哪里、由谁执行
Workspace：操作允许触达哪些资源
```

Tool Runtime 负责校验和分发，Worker 负责执行，Workspace 负责资源边界。

### 3.3 Tool Pack、接入协议、执行位置

```text
Tool Pack：能力如何打包和发布
Protocol：MCP / HTTP / Internal Worker Protocol
Execution Location：Local / Sandbox / Remote Service
```

三个维度正交，不建模成三选一类型。

## 4. Kernel Alpha 采用清单

Kernel Alpha 只采用能验证通用内核的最小模式：

- Agent Definition 与 TaskRunState 分离；
- Task/Run/Step；
- Action/Observation；
- 不可变 Event；
- ExecutionPlan Revision；
- ToolDefinition 与内存 Registry；
- Capability Resolver；
- PolicyDecision；
- ToolExecutionBackend；
- SQLite Event/Checkpoint；
- OpenAI-compatible/Fake Model Adapter；
- Fake/Local Tool；
- Headless typed event stream。

以下不进入 Kernel Alpha：

- 完整 Skill 治理；
- 企业 Registry 服务；
- 远程 Worker Polling；
- Sandbox Fleet；
- 多 Agent/Subagent；
- 完整 Knowledge/Memory 平台；
- Marketplace；
- Workflow Builder；
- 多套 Observability 产品。

## 5. 证据来源

- `robothree-agent-research/research/grok-build/`
- `robothree-agent-research/research/hermes-agent/`
- `robothree-agent-research/research/openclaw/`
- `robothree-agent-research/research/software-agent-sdk/`
- `robothree-agent-research/research/langgraph/`
- `robothree-agent-research/research/daytona/`
- `robothree-agent-research/research/open-webui/`
- `robothree-agent-research/research/comparisons/robothree-architecture-matrix.md`

在 ADR 引用具体上游机制前，应回到对应研究报告核对证据等级、固定 commit、许可证和未决问题。
