# RoboThree 跨项目架构对比矩阵

> 对比日期：2026-07-18  
> 研究范围：`grok-build`、`hermes-agent`、`openclaw`、`software-agent-sdk`（OpenHands）、`langgraph`、`daytona`、`open-webui` 现有研究报告。  
> 说明：`—` 表示该项目不是该维度的主要参考，不能据此断言项目完全没有该能力。

## 1. 核心对比表

| RoboThree 维度 | Grok | Hermes | OpenClaw | OpenHands | LangGraph | Daytona | Open WebUI | RoboThree 决策 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Agent Loop** | `SessionActor` 事件循环；LLM streaming → tool calls → result 回填 | `while` 循环；迭代预算、grace call、API retry/fallback | Gateway 内嵌 Agent Runner；更偏渠道驱动 | 无状态 Agent + `ConversationState`；单步 `step()`；Action/Observation | Pregel Superstep：Plan → Execute → Update/Persist | 不提供推理循环；执行 Job/Sandbox 生命周期 | 仅研究前端消息编排，不是 Agent 内核 | **ADAPT**：采用可持久化 Step Loop，而非纯 while 或完整 Pregel。每步遵循 Plan → Execute → Persist，并使用 Action/Observation + typed event |
| **Session** | `SessionActor`；JSONL + 搜索索引；Leader 可重放 session/load，但不恢复运行中工具 | Session 状态集中在 `AIAgent`；工具执行前增量落库；持久消息与 API 临时消息分离 | `channel:account:conversation` SessionKey；Conversation Binding；JSON/SQLite 渐进迁移 | Conversation 是核心边界；EventLog 为事实源；Local/Remote Conversation 工厂 | `thread_id` + checkpoint 形成持久运行上下文 | 管理 Sandbox/Job，不负责对话 Session | Chat history + 前端消息树；后端 DB 持久化 | **ADOPT/ADAPT**：明确拆分 Session、Task、Run。Session 负责对话连续性；Task 负责持久执行；Run 记录一次尝试。采用多租户 SessionKey 与 EventLog |
| **Worker** | Workspace local/proxy；Leader/本地执行为主 | `BaseEnvironment` 统一 local/docker/ssh/singularity/modal/daytona | Embedded/Inference/Live/Transcript Worker；有 Fleet，但自定义帧协议偏重 | `BaseWorkspace` + Conversation 工厂统一 Local/Remote | 运行节点可并行，但不是基础设施 Worker 抽象 | Runner v2 主动拉 Job；Heartbeat；Executor；控制面与计算面分离 | Pyodide/TTS Web Worker，仅适合浏览器局部计算 | **ADOPT Daytona + ADAPT OpenHands/Hermes**：Worker 拉取带 lease 的 Job，支持 heartbeat；提供统一 Local/Remote Worker 接口；Agent Runtime 不直接管理容器 |
| **Sandbox** | 独立 sandbox crate；worktree 与安全沙箱明确分离，但隔离细节待验证 | 多后端环境；主要工具线程与 Agent 同进程，checkpoint 不是隔离 | Node/Worker/远程设备执行；不是最强的企业沙箱参考 | Local 无隔离；Docker/Apptainer/Cloud/RemoteAPI 多级 Workspace | 不提供 OS 安全边界 | 最强参考：Sandbox 生命周期、网络隔离、资源控制、每 Sandbox Token；但部分特权容器设计应拒绝 | Pyodide WASM Worker/iframe；只适合浏览器端受限执行 | **ADOPT 边界、重做实现**：Sandbox 归 Worker 管理；MVP 使用 rootless container + user namespace + resource limit + egress policy + per-sandbox identity；拒绝 privileged container |
| **Gateway** | Leader + stdio ACP + WebSocket Server，适合 CLI/IDE 多客户端 | 平台 Adapter 存在，但缺少正式 ChannelCapabilities | 最强参考：Gateway Daemon、Channel Plugin、Pairing、Device Node、HTTP/WS | Agent Server：FastAPI REST + WebSocket；偏运行时服务 API | 可提供 SDK/stream API，不是渠道 Gateway | Control Plane REST/Proxy；面向计算资源而非消息渠道 | Web Chat 入口与双通道客户端，非企业 Gateway | **ADAPT OpenClaw + OpenHands**：企业端使用无状态 API Gateway/Channel Adapter；本地部署可有 Edge Hub。显式定义 ChannelCapabilities，不把 Agent Runtime 塞进单体 Gateway |
| **Memory** | 有 `xai-grok-memory`，本次未深挖；ChatState compaction 可参考 | 最强参考之一：持久 Memory、prefetch、API-time 注入、curation/learning；与 Session 分离 | Root Memory + Active Memory + embedding provider；后端 Plugin 化 | 当前研究更强在 Context/Condenser，长期 Memory 不是主要亮点 | Store/Checkpoint 是运行状态，不等于语义长期记忆 | — | 前端选择与展示 Memory；后端注入细节研究有限 | **ADOPT Hermes 的分层原则**：Session History、Working Context、Long-term Memory 分离；只在调用时注入。企业版必须按 tenant/user/agent/resource 做命名空间与 ACL |
| **Skill** | 工具/插件市场存在，但研究未形成成熟 Skill 结论 | Skills、optional skills、bundle、nudge、自动学习；Plugin hooks/MCP 配合 | 文件系统 Markdown Skill、过滤、远程 Skill；Plugin Manifest 生态成熟 | 多来源 Skill；触发词/显式调用；Plugin 打包 Skill + MCP + Hook + Agent | Graph/node 可表达工作流，但不是 Skill 包规范 | — | Skill = Prompt + Tool Set + Model Preference；前端选择体验好 | **ADAPT 综合模型**：Skill 是版本化声明包，至少包含 instructions、tool refs、permission profile、input/output schema、model policy；Skill 与可执行 Plugin 分离；自动生成 Skill 必须审核 |
| **Subagent** | 隐藏 Session，支持 New/Forked/Resumed；权限继承边界待验证 | `delegate_task`；一次性/交互式子 Agent；工具继承与上限，但权限边界仍不清晰 | 独立 Session、Capability Store、Registry、Timeout、Liveness、Reconciliation、ACP 流 | `DelegateTool` + Conversation `fork()`；独立 EventLog/目录；Agent Registry；缺少完整编排和超时 | Subgraph、Send 并行分支、状态 reducer；适合编排语义 | 不提供 Agent 语义；提供承载子任务的 Worker/Sandbox | — | **DEFER 到核心单 Agent 稳定后**：子 Agent 应建模为 Child Task/Run，继承显式快照，默认收窄工具、数据和预算；必须有 timeout、cancel propagation、join、审计 |
| **Permission** | `AccessKind` → `Decision`；执行前集中拦截；worktree ≠ sandbox | scope → plugin → guardrail 多层拦截；approval；破坏操作前 checkpoint | Global/Group/Subagent Tool Policy；Pairing/allowlist | Security Analyzer + Confirmation Policy + pre-action hook；应拒绝 LLM 自填风险等级 | Interrupt/Resume 很适合人工审批，但不是权限引擎 | 组织/API/Sandbox Token、网络策略、审计；基础设施权限强 | 前端 RBAC 展示可参考；localStorage token、`eval()`、宽 CORS/CSP 是反例 | **ADOPT 分层、服务端确定性决策**：RBAC/ABAC + Tool Scope + Resource Policy + Approval。Policy Enforcement 必须在执行前；LLM 只能提供提示，不能决定最终风险或授权 |
| **UI Protocol** | ACP JSON-RPC（stdio/WS）+ session/update；适合 IDE，但完整规范待确认 | CLI/Gateway/ACP Adapter；缺乏统一 Channel capability contract | HTTP + WS JSON-RPC；Channel/Node/ACP 多协议 | Agent Server REST + WebSocket；Event Stream | typed stream modes：values/updates/messages/custom/debug | Control Plane REST；Sandbox Toolbox REST；终端/输出 WS/SSE | 最强前端参考：REST 做 CRUD，Socket.IO 做 delta/status/notification；严禁 execute-JS 事件 | **ADOPT 双通道 + typed events**：REST 用于资源和命令；WebSocket/SSE 用于事件流。统一 EventEnvelope；只允许声明式 UI Action，禁止服务端下发任意代码 |
| **Checkpoint** | Turn 结束持久化；Leader 只回放连接/session，不恢复 tool 中间态 | 破坏操作前 Workspace checkpoint + 工具前增量 session flush；偏恢复保护 | SQLite Session/Cron 状态、reconciliation；不是通用工作流 checkpoint | EventLog/Event Tree 可重放与 fork，但不是 LangGraph 式明确 step checkpoint | 最强参考：step checkpoint、version/seen marker、interrupt/resume、time travel、durable execution | DB-backed Job + 状态协调；Sandbox snapshot；保障基础设施任务可靠性 | Chat 保存，不是 Agent 执行 checkpoint | **ADOPT LangGraph 语义 + Daytona 持久任务**：每个 Step 后 checkpoint；副作用前记录 Intent；工具调用带 idempotency key；保存 pending action、版本、审批状态和 resume token |

## 2. 各项目的最佳参考定位

| 项目 | 最适合借鉴的部分 | 不应让它主导的部分 |
| --- | --- | --- |
| **Grok Build** | Agent Loop、Tool Registry、Permission Gate、本地 Coding Agent Runtime | 企业多租户、Durable Workflow、云端 Worker 控制面 |
| **Hermes Agent** | Context 分层、Memory、Skill、Hook、Provider fallback、工具前持久化 | 单一 `AIAgent` 大对象、线程内风险工具隔离 |
| **OpenClaw** | Gateway、Channel、Session Routing、Pairing、设备接入、Plugin Manifest | 企业云端调度内核、强 Sandbox、自定义 Worker 帧协议 |
| **OpenHands SDK** | 无状态 Agent、Conversation、Action/Observation、EventLog、Local/Remote 抽象 | LLM 自评安全风险、LocalWorkspace 生产隔离 |
| **LangGraph** | Durable Step、Checkpoint、Interrupt/Resume、Reducer、并行/子图语义 | 直接照搬完整 Pregel Runtime 或强迫所有 Agent 使用可视化 Graph |
| **Daytona** | 三平面、Job Polling、Worker Heartbeat、Sandbox Lifecycle、审计 | AGPL 后端源码、特权容器、Docker-in-Docker |
| **Open WebUI** | Chat UX、REST + realtime、Status Event、Command Palette、前端组件边界 | localStorage Token、服务端推送代码执行、不安全默认配置 |

## 3. 推荐的 RoboThree 顶层架构

```text
┌──────────────────── Interface Plane ────────────────────┐
│ Web UI / API / CLI / Enterprise Channels               │
│ Gateway · Auth · Channel Adapters · Typed Event Stream  │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────── Control Plane ──────────────────────┐
│ Session Service       Task Orchestrator                 │
│ Agent/Skill Registry  Policy & Approval                 │
│ Memory Service        Audit / Observability             │
│ Model Gateway         Job Queue + Reconciliation        │
└──────────────────────────┬───────────────────────────────┘
                           │ leased jobs / events
┌──────────────────── Compute Plane ──────────────────────┐
│ Local Worker / Cloud Worker / Customer-managed Worker  │
│ Agent Runtime → Tool Runtime → Sandbox / Connectors     │
│ Heartbeat · Capacity · Cancellation · Artifact Upload   │
└──────────────────────────────────────────────────────────┘
```

### 关键依赖方向

1. Gateway 只能调用 Control Plane，不能直接执行 Tool。
2. Agent Runtime 通过 Worker/Sandbox Contract 执行，不直接创建容器。
3. Tool Runtime 必须先经过 Policy Enforcement，再进入 Sandbox 或 Connector。
4. Memory 通过 Context Assembly 注入；长期记忆不能直接混入 Session EventLog。
5. UI 只消费 typed event，不解释或执行后端下发的任意代码。

## 4. 建议的核心数据模型

```text
Session       = 用户与 Agent 的长期交互容器
Task          = 一个可暂停、恢复、取消、重试的业务目标
Run           = Task 的一次执行尝试
Step          = Run 内的原子 Plan/Execute/Persist 边界
Action        = Agent 请求执行的类型化操作
Observation   = Action 的类型化结果
Checkpoint    = Step 完成后的可恢复状态
Job           = Control Plane 分配给 Worker 的基础设施执行单元
Artifact      = 文件、报告、截图、Diff 等可追踪产物
Approval      = 对特定 Action/Resource/Scope 的人工决策
```

## 5. MVP 架构顺序

### P0：先建立正确骨架

1. Session / Task / Run / Step 数据模型。
2. 单 Agent Durable Step Loop。
3. Action/Observation + Typed Event Envelope。
4. Tool Registry + 确定性 Permission Gate + Approval。
5. Local Worker + rootless container Sandbox。
6. REST + WebSocket/SSE；Web UI 展示 message delta、step status、tool call、approval。
7. PostgreSQL 持久化 Task/Checkpoint/Audit；本地单机版可以 SQLite 实现同一 Store Contract。

### P1：企业可用

1. Remote Worker Job Polling、lease、heartbeat、reconciliation。
2. OIDC/SSO、Tenant、RBAC/ABAC、Secret Vault、完整审计。
3. Context Assembly 与带 ACL 的 Long-term Memory。
4. Skill Manifest、版本锁定、签名与审批发布。
5. Connector/MCP Host 与网络出站策略。

### P2：增强智能与生态

1. Subagent Child Task、并行分支、join/reducer。
2. Skill/Plugin SDK 和 Marketplace。
3. 多渠道 Gateway、Edge Hub、Device Bridge。
4. Time Travel、任务分支和高级可视化编排。

## 6. 当前证据限制

- 所有项目结论主要来自静态研究报告，不等于运行时验证。
- Hermes、Grok 的部分高级机制仍标记为需要更多证据。
- Daytona 部分证据来自架构文档、Web 搜索与 PR，且后端为 AGPL-3.0，只宜设计参考。
- Open WebUI 是前端专项研究，不能据此判断其完整后端 Agent Runtime。
- 全局 `research/index.md` 对 Grok/Hermes 的状态仍显示待填充，与各自目录内已完成的 Level 2 报告不一致，后续应修正索引。

## 7. 主要研究来源

- `research/grok-build/architecture.md`、`runtime-sequence.md`、`robothree-fit-analysis.md`
- `research/hermes-agent/architecture.md`、`session-state-memory.md`、`permission-system.md`、`robothree-fit-analysis.md`
- `research/openclaw/architecture.md`、`session-state-memory.md`、`subagent-system.md`、`robothree-fit-analysis.md`
- `research/software-agent-sdk/architecture.md`、`subagent-system.md`、`permission-system.md`、`robothree-fit-analysis.md`
- `research/langgraph/architecture.md`、`runtime-sequence.md`、`robothree-fit-analysis.md`
- `research/daytona/architecture.md`、`deployment-model.md`、`security-review.md`、`robothree-fit-analysis.md`
- `research/open-webui/architecture.md`、`runtime-sequence.md`、`security-review.md`、`robothree-fit-analysis.md`
