# RoboThree 关键节点记录

本文件记录 RoboThree 产品与架构演进过程中已经形成共识、会影响后续设计和实现的重要节点。

## 维护规则

1. 每个关键节点使用稳定编号 `KN-NNN`，按时间顺序追加。
2. 只记录已经确认、足以约束后续工作的内容；讨论中的方案放在“待确认事项”，不得表述为最终决定。
3. 后续决策发生变化时，不静默删除历史；新增节点并在旧节点上标记 `SUPERSEDED BY KN-NNN`。
4. 关键节点用于记录阶段共识，具体且长期不可回退的技术选择仍需建立 ADR。
5. 每个节点至少说明背景、确认内容、边界、工程影响和下一步。

---

# KN-001：RoboThree MVP 产品方向与架构原则收敛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-18 |
| 状态 | **CONFIRMED** |
| 阶段 | 正式架构设计之前 |
| 主题 | 能力平台定位、扩展模型、动态编排、安全边界与工程推进方式 |
| 主要输入 | Grok Build、Hermes Agent、OpenClaw、OpenHands Software Agent SDK、LangGraph、Daytona、Open WebUI 架构研究及跨项目对比 |

## 1. 产品定位

RoboThree MVP 是一个本地优先、企业统一治理、支持 MaaS、MCP、Skill、Knowledge 和可扩展 Tool 的通用 Agent 工作台与运行平台。

RoboThree 不以招投标、合同审查或其他单一业务场景定义 Core。平台提供通用运行时和开放能力，企业在平台之上逐步组合和沉淀具体场景。

## 2. 已确认的产品原则

### 2.1 能力平台优先

RoboThree MVP 采用能力平台优先的产品方向，在通用平台能力之上逐步补充场景能力。

同时明确：

> **架构设计采用能力平台化，研发实施采用最小通用垂直链路优先。**

“能力平台优先”不等于先建设大型 Registry、Marketplace、管理后台和所有扩展设施，再运行真实任务。第一版可从本地 Manifest、SQLite Registry、内置能力目录和简单管理接口起步，由端到端任务链路持续验证并抽象平台能力。

### 2.2 标准业务场景与开放式任务并存

标准业务场景由以下能力按需组合形成：

```text
Agent Definition
+ Skill
+ Tool / MCP
+ Knowledge
+ Task Template
+ Policy Profile
```

开放式任务由 RoboThree Core 在运行时动态选择和编排已授权能力。

动态编排不表示模型可以随意执行。Core 必须生成可验证的 `ExecutionPlan`，实际执行只能使用满足以下全部条件的能力：

```text
已注册
+ 已发布
+ 当前启用
+ 版本兼容
+ 当前身份有权限
+ 组织与部门可见
+ 当前策略允许
+ 设备具备运行条件
+ Worker 当前可用
+ Credential 有效
```

### 2.3 场景和具体软件能力不进入 Core

RoboThree Core 仅承载通用运行时能力，不包含场景分支和行业逻辑。

Core 只认识通用概念：

```text
Session
Task / Run / Step
Agent Definition
Skill
Tool
Knowledge
ExecutionPlan
Action / Observation
Artifact
Policy / Approval
Event / Checkpoint
```

Browser、Office、PDF、Shell、数据库等具体执行能力以官方 Tool Pack、MCP/HTTP Provider 或隔离 Worker 方式提供。

招投标、合同审查等业务能力以 Agent、Skill、Tool/MCP、Knowledge 和 Task Template 组合而成的业务扩展包提供。

Core 中不得出现类似以下场景判断：

```text
if scenario == "招投标" ...
else if scenario == "合同审查" ...
```

### 2.4 第一版定义开放、版本化的 Contract

第一版即定义开放、版本化的：

- Agent Contract；
- Skill Contract；
- Tool Contract；
- Knowledge/Resource Contract；
- Task/ExecutionPlan Contract；
- Artifact Contract；
- Event Contract；
- Worker/Execution Protocol。

首期只支持官方和企业内部可信扩展的注册与部署：

- 不建设公开 Marketplace；
- 不允许任务执行中下载代码并动态加载到 Core；
- 不允许未经审核的第三方代码在 Core 进程中热加载；
- 即使是可信可执行扩展，也优先在独立 Worker、受控子进程、Sandbox、MCP Server 或远程服务中运行。

## 3. 扩展与执行模型

### 3.1 声明式扩展与可执行扩展分离

声明式扩展包括：

- Agent Definition；
- Skill 指令；
- Task Template；
- 业务场景组合；
- Knowledge Binding；
- Prompt/Output Template；
- Model/Policy 配置。

声明式扩展可使用 YAML、JSON、Markdown 等格式，经过 Schema、依赖、引用权限和提示安全检查后动态加载。

可执行扩展包括：

- Python/Node/C# Tool；
- 本地二进制程序；
- Browser Automation；
- Office COM Worker；
- Model Provider Adapter；
- Connector；
- Artifact Renderer；
- Execution Backend。

可执行扩展需要更严格的来源认证、签名、安全扫描、权限清单、安装审批、隔离、资源限制、回滚和审计。

### 3.2 声明式场景的边界

声明式业务场景可以定义：

- Agent、Skill、Tool 和 Knowledge 引用；
- 输入输出 Schema；
- 默认步骤、条件和完成标准；
- 审批节点；
- Artifact 和前端渲染提示。

声明式定义中不得嵌入任意 Python、JavaScript 或 Shell。需要执行代码的逻辑必须封装为已经注册和审核的 Tool 或 Worker 能力。

### 3.3 Tool Pack、接入协议和执行位置是正交维度

三者分别回答不同问题：

| 维度 | 作用 | 示例 |
| --- | --- | --- |
| Tool Pack | 能力如何打包、发布和注册 | Office Tool Pack、CRM Tool Pack |
| 接入协议 | 能力如何接入 RoboThree | MCP、HTTP、Internal Worker Protocol |
| 执行位置 | 能力在哪里、以何种隔离方式执行 | Local Worker、Sandbox Worker、Remote Service |

正确关系示例：

```text
Office Tool Pack
→ Internal Worker Protocol
→ Local Office Worker

CRM Tool Pack
→ MCP Adapter
→ Remote CRM MCP Server
```

具体能力最终以 Tool、Resource/Knowledge Provider、Prompt/Skill Asset 等内部 Contract 暴露，而不是以 Tool Pack、MCP、Worker 三选一的方式建模。

### 3.4 MCP 能力映射

MCP 的不同能力映射到不同 RoboThree Contract：

| MCP 能力 | RoboThree 内部映射 |
| --- | --- |
| MCP Tools | Tool Contract |
| MCP Resources | Knowledge/Resource Provider Contract |
| MCP Prompts | Prompt Asset 或 Skill Asset |
| MCP Notifications | Provider Event |
| MCP Server 生命周期与能力协商 | Connector/Provider Contract |

MCP Tool 必须经过统一的 Tool Runtime、Policy、Timeout、Cancellation 和 Audit，不构成权限旁路。

## 4. Contract、Registry 与 ExecutionPlan

三者的职责固定为：

```text
Contract 定义“资源和协议应该长什么样”
Registry 记录“企业当前拥有哪些版本化能力”
ExecutionPlan 决定“某个 Task/Run 具体绑定并使用哪些能力”
```

### 4.1 Contract

Contract 是独立基础包，不属于 Core 内部模块，由 Core、Client、Worker、企业控制面和 Extension SDK 共同依赖。

Contract 定义：

- 数据结构和字段语义；
- 输入输出 Schema；
- 生命周期和错误模型；
- 安全元数据；
- 兼容、弃用和迁移规则；
- 跨进程通信协议。

### 4.2 Registry

企业 Registry 属于控制面，不属于本地 Core。

Registry 管理符合 Contract 的版本化资源实例及其：

- 发布状态；
- 所有者和可见范围；
- 依赖；
- 签名、哈希和来源；
- 风险等级；
- 兼容性；
- 安装位置；
- 生命周期状态。

本地 Core 只保留 `Registry Client + Local Capability Cache + Capability Resolver`。MVP 可先使用本地 Manifest/SQLite 实现 Registry 接口，不提前建设大型服务。

### 4.3 ExecutionPlan 与 Plan Revision

`ExecutionPlan` 是某个 Task/Run 的任务级能力绑定和执行描述，至少记录：

- 任务目标和完成标准；
- 当前计划步骤和依赖；
- Agent、Skill、Tool、Knowledge、Model 的解析版本和 digest；
- Worker/Execution Backend 约束；
- 输入和 Artifact 引用；
- 权限上下文和策略快照；
- 审批要求；
- 预算、超时和重试规则。

开放式任务允许增量规划，不强制在开始时生成完整 DAG：

```text
Plan Revision 1
→ 执行当前可确定步骤
→ 根据 Observation 发现新信息
→ 创建 Plan Revision 2
→ 重新校验并继续执行
```

已确认规则：

- ExecutionPlan 可以动态修订；
- 每个 Plan Revision 创建后不可变；
- 修改计划必须创建新 Revision；
- 每个 Step 必须引用明确的 Plan Revision；
- 新 Revision 不得篡改已执行历史；
- 每次 Revision 均重新进行能力解析和计划级 Policy Check。

## 5. 版本和策略语义

### 5.1 三类版本

| 版本类型 | 作用 | 示例 |
| --- | --- | --- |
| Contract Schema Version | 字段和语义规范 | `apiVersion: robothree.io/v1alpha1` |
| Capability Resource Version | 具体能力发布版本 | `office-tool-pack@1.3.2` |
| Runtime Protocol Version | 组件间通信协议 | `worker-protocol@1.0` |

版本体系必须定义向后兼容、未知字段处理、弃用周期、迁移方式、最低 Core 版本和兼容范围，不能只增加一个无语义的 `version` 字段。

Task 运行时锁定能力和配置的具体版本及 digest。对无法锁定底层权重版本的 MaaS 模型，至少记录 Provider、Model ID、Endpoint 配置摘要、Provider 返回版本、Sampling 参数和 Model Policy 版本。

### 5.2 策略快照与实时安全覆盖

Task 保存 `Policy Snapshot`，用于审计、解释、恢复和复现当时的决策上下文。

实际执行前仍必须应用当前生效的：

- 用户/角色权限撤销；
- Tool/MCP/Provider 紧急禁用；
- Credential 撤销；
- 高危版本封禁；
- 数据外发紧急策略；
- Endpoint 隔离和全局 Kill Switch。

有效策略为：

```text
Effective Policy
= Task Policy Snapshot
+ Current Permission State
+ Live Safety Overlay
```

实时安全覆盖只能收紧权限，不能静默扩大旧 Task 的权限。

## 6. 副作用、事件和恢复原则

以下内容作为下一阶段一致性模型设计的强约束：

1. Task Runtime 是 TaskState 的唯一写入者；
2. Plan Revision 不可变；
3. Step 使用稳定 ID；
4. Action/Tool Call 使用稳定 ID 和幂等键；
5. 状态变化产生不可变 Event；
6. Event 持久化后才能推送 UI、Audit 和其他订阅方；
7. 有副作用的执行必须先持久化 Intent；
8. 执行结果必须持久化为 Observation/Event；
9. Checkpoint 必须引用明确的最后事件序号；
10. 外部系统不支持幂等且结果不确定时，进入 Reconciliation/人工确认，不盲目重试；
11. Approval 绑定具体 Task、Run、Plan Revision、Step、Action、参数摘要和资源范围；
12. Action 参数、目标资源或 Plan Revision 变化时，原 Approval 失效。

副作用的候选执行顺序：

```text
创建 Plan Revision
→ 生成稳定 Step/Action/Idempotency ID
→ 持久化 Action Intent 和 Outbox
→ Policy/Approval
→ Worker 执行
→ 持久化 Observation 和状态事件
→ 提交 Checkpoint
→ 通过 Outbox 发布 UI/Audit 事件
```

具体事务、Outbox 和恢复算法仍需在后续详细设计中确认。

## 7. 当前 Core 模块边界候选

以下模块边界已收敛为下一阶段详细设计输入，但尚未升级为最终 ADR：

```text
RoboThree Core
├── Local Gateway
├── Session Runtime
├── Task Runtime
├── Agent Orchestrator
├── Planning Runtime
├── Capability Resolver
├── Context Engine
├── Model Runtime
├── Tool Runtime
├── Policy & Approval Runtime
├── Worker Manager
├── Artifact Runtime
├── Event Store
├── Checkpoint Store
└── Registry Client & Local Capability Cache
```

边界约束：

- Enterprise Registry 属于控制面，Core 只有 Client、Cache 和 Resolver；
- Contract 位于独立共享包，不能放入 Core；
- Task Runtime 是 Task 生命周期和状态的唯一所有者；
- Agent Orchestrator 不直接持久化，也不直接执行 Tool；
- Tool Runtime 不绕过 Policy，Worker 不自行扩大 Action 权限；
- 第一版 Skill 先实现 Loader、Resolver 和 Context Builder，不提前建设庞大 Skill Runtime。

## 8. 已锁定的架构不变量

1. RoboThree 采用能力平台化设计，但研发以最小通用垂直任务链路推进，避免平台先行过度建设。
2. 业务场景、行业逻辑和具体软件能力不进入 Core。
3. 标准场景使用声明式 Agent、Skill、Tool、Knowledge 和 Task Template 组合；需要执行代码的逻辑必须封装为已审核能力。
4. 开放任务由 Core 动态生成和修订 ExecutionPlan。
5. 动态编排只能选择已注册、已发布、版本兼容，并通过身份、策略、设备、Credential、健康状态和运行环境校验的能力。
6. Core 不热加载未经审核的可执行代码；可执行扩展优先在独立 Worker、Sandbox、MCP Server 或远程服务中运行。
7. 所有核心 Contract 均版本化，并明确兼容、弃用和迁移规则。
8. Task 锁定能力、配置、模型绑定和 ExecutionPlan 版本，并保存策略快照；实际执行仍应用当前权限撤销和紧急安全控制。
9. MCP Tools 适配 Tool Contract；MCP Resources、Prompts、Notifications 和 Server 生命周期分别适配对应资源契约。
10. Tool Pack、接入协议和执行位置是三个正交维度。
11. 声明式扩展与可执行扩展采用不同的审核、签名、安装和运行信任模型。
12. 第一版只建设企业私有能力注册和管理，不建设公开 Marketplace。
13. ExecutionPlan 可以动态修订，但每个 Plan Revision 不可变、可审计、可恢复。
14. 所有具有副作用的执行必须经过 Intent、Policy Enforcement、Tool Runtime、Worker 和统一事件记录。
15. Task Runtime 是任务状态的唯一写入者。
16. Approval 必须绑定具体 Plan Revision、Step、Action、参数摘要和资源范围。

## 9. 当前未决事项

以下内容尚未确认，不得在实现中擅自固化：

1. Local Core 的主要实现语言和框架；
2. Contract 包的具体拆分和首批 Schema；
3. Registry 资源表、Manifest 和生命周期数据模型；
4. Capability Resolver 的匹配、排序和冲突规则；
5. ExecutionPlan/PlanRevision 的完整 Schema；
6. Task、Event、Checkpoint、Outbox 的事务一致性算法；
7. Worker Protocol 和 Windows Sandbox 策略；
8. 企业控制面与本地 Registry MVP 的部署关系；
9. 第一条通用端到端垂直链路的具体范围和验收标准。

## 10. 下一阶段顺序

```text
1. 确认 Core 模块边界
2. 设计 Contract 类型体系
3. 设计 Registry 资源模型
4. 设计 Capability Resolution
5. 设计 ExecutionPlan 与 Plan Revision
6. 设计 Task / Event / Checkpoint 一致性模型
7. 选择并实现第一条通用端到端垂直链路
```

在上述设计确认前，不开始建设大型管理平台、公开 Marketplace、复杂 Workflow Builder 或开放式第三方代码加载体系。

---

# KN-002：Kernel Alpha 启动基线冻结

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-19 |
| 状态 | **CONFIRMED** |
| 阶段 | Kernel Alpha 开发之前 |
| 主题 | 部署边界、本地文件授权、渐进式里程碑与技术栈 |
| 正式决策 | ADR-001、ADR-002、ADR-003、ADR-004 |

## 1. 已确认事项

### 1.1 部署与企业演进边界

Kernel Alpha 采用 All-in-One Local，但保持 Desktop UI、Local Core、Worker 和 Persistence 的逻辑边界。

企业试点的目标形态为：

```text
Desktop Client
+ Local Worker
+ Central Enterprise Service
```

Kernel Alpha 不提前建设中央服务，但本地边界和版本化 Contract 不得阻断后续企业形态。

### 1.2 本地文件授权

RoboThree 默认只访问自身应用目录。业务文件必须通过 `FileGrant` 或 `WorkspaceGrant` 显式授权。

Workspace 可访问授权根目录及未越界的真实子目录。高风险写操作、程序执行和外部发送仍需额外权限或确认。Agent 和 Renderer 均不得绕过 Core/Worker 直接访问用户业务文件。

### 1.3 Kernel Alpha 渐进式里程碑

```text
KA-0：Chat、模型调用和本地持久化
KA-1：最小 Agent、Tool 和本地文件任务
KA-2：HTML 生成和 localhost 预览，完成 Alpha 最终验收
```

HTML 是通用 Agent、Tool、Artifact 与预览能力的验收载体，不代表产品限定为网页生成场景。

### 1.4 Kernel Alpha 技术栈

```text
TypeScript Monorepo
+ Electron + Vue
+ Node.js Local Core
+ SQLite
```

Python、C# 等能力通过独立 Worker 或 Tool 接入。Renderer 不直接访问文件系统、数据库、凭证和系统命令。

## 2. 对 KN-001 未决事项的影响

本节点解决了 KN-001 中以下启动级问题：

- Local Core 主语言与桌面技术栈；
- Kernel Alpha 的本地部署形态和企业演进方向；
- 第一条通用端到端垂直链路及最终验收载体；
- Workspace 的基础授权边界。

Contract 细节、Task 状态所有权、权限分层和副作用一致性仍按对应 `PROPOSED` ADR 在进入相关实现前冻结。

## 3. 工程影响

1. 可以开始 KA-0 工程搭建与开发，不再等待完整产品功能架构冻结；
2. KA-0 优先形成 Electron Chat → Local Core → Model → SQLite 的运行闭环；
3. KA-1 前必须完成 Task/Run/Step、Policy/Approval 和 Event/Checkpoint 相关 ADR 的必要冻结；
4. 文件与凭证访问从第一天遵循 Renderer 隔离和显式授权原则；
5. 不因 All-in-One Local 将具体 Tool、业务逻辑或高权限执行合入 Renderer/Core。

## 4. 下一步

按 KA-0 范围形成工程实施计划、首批 Contract、目录增量、验收用例和开发任务拆分；在用户明确要求开始编码前，不写入生产代码。

---

# KN-003：KA-0 采用 Kernel Framework First 实施顺序

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-19 |
| 状态 | **CONFIRMED** |
| 阶段 | 第一批生产代码之前 |
| 主题 | Framework First、性能与扩展性门槛、上游借鉴可追溯性 |
| 影响 | 补充 ADR-003；调整 KN-002 第 3 节第 2 项的内部实施顺序，不改变 KA-0 产品验收结果 |

## 1. 已确认事项

KA-0 不优先实现可运行 Chat，而是先建设具有清晰边界、性能基线和扩展能力的 RoboThree Kernel Framework。

```text
KAF-0：工程与边界基线
KAF-1：Runtime Kernel
KAF-2：Event、Persistence 与恢复
KAF-3：Capability 与 Adapter
KAF-4：Policy、并发、可靠性与性能
KAF-5：Headless Framework 验收
  ↓
Electron Chat 薄客户端集成
```

Chat 仍保留为 KA-0 产品验收结果，但不作为第一批代码，也不反向决定 Kernel 的状态、Provider、持久化和事件结构。

## 2. 框架边界

框架强度通过以下约束体现：

1. Kernel 不依赖 Electron、SQLite、OpenAI SDK 和具体 Tool；
2. 新增 ModelProvider、Tool 或 ExecutionBackend 不修改 Kernel；
3. Task Runtime 是运行状态的唯一写入者；
4. 所有 Adapter 使用版本化 Contract 和统一 Conformance Test；
5. 取消、超时、恢复、幂等和 backpressure 从框架阶段验证；
6. 不通过增加 Marketplace、Workflow Builder、Multi-Agent 或大量 package 冒充扩展性。

## 3. 上游借鉴要求

每个核心模块必须记录：

- 上游项目和固定 Commit；
- 源码/研究证据；
- 许可证；
- 采用类型；
- 借鉴内容；
- 不照搬内容及原因；
- 实际实现目标文件和验证测试。

初始主参考关系为：OpenClaw 负责 Node/Core/Provider/SQLite 模式，Grok Build 负责 Runtime/Registry/Retry，OpenHands 负责 State/Event/ExecutionBackend，LangGraph 负责 Checkpoint/Conformance，Hermes 负责后续 Context Assembly，Open WebUI 负责后续 typed UI event，Daytona 仅作为远程 Worker 的后置设计参考。

## 4. 工程影响

- 第一批代码只进入 KAF-0，不实现 Chat、真实模型、SQLite 业务 Schema、Agent Loop、Tool、MCP 或 Worker；
- ADR-005、ADR-007、ADR-006 分别在进入 KAF-1、KAF-2、KAF-4 前冻结必要部分；
- Framework First 仍必须通过 Fake Adapter 和 Headless Harness 持续形成可执行闭环；
- 所有选择性源码复用必须先进入上游借鉴登记表，并补充许可证与测试信息。

## 5. 正式文档

- [KA-0 开发计划](./KA-0-DEVELOPMENT-PLAN.md)；
- [上游借鉴登记表](./UPSTREAM-ADOPTION-REGISTER.md)；
- [ADR-003：Kernel Alpha 里程碑](../adr/003-kernel-alpha-milestones.md)。

---

# KN-004：KAF-0 通过并冻结 Runtime Kernel 状态所有权

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-20 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-0 关闭、KAF-1 开始之前 |
| 主题 | KAF-0 发布处置、Task/Run/Step 所有权、Retry、Cancellation 与 Deadline |
| 正式决策 | ADR-005 |

## 1. KAF-0 发布结论

`0.0.0-kaf.0.2` 经 Claude Code 独立复验为 `PASS`，KAF-0.1 的三项 P3 已关闭。KAF-0 工程与边界基线作为内部框架里程碑接受，允许进入 KAF-1。

QA 环境仍使用 Node 22，而项目基线为 Node 24.13.0；该差异作为非阻断环境风险保留，不能用 Node 22 结果替代后续正式 Node 24 基线。

## 2. Runtime Kernel 已确认原则

1. Agent Definition 与 TaskRunState 分离；
2. Task 可以选择绑定 Session，后台/开放任务可以不绑定 Session；
3. Task Runtime 是 Task/Run/Step 唯一写入者；
4. 同一 Task 最多一个活动 Run，同一 Run 最多一个活动 Step；
5. Retry 总是创建新 Run，旧 Run 不覆盖；
6. waiting/resume 是显式状态，不用异常模拟正常中断；
7. Cancellation 和 Deadline 必须让活动 Step、Run、Task 一致收敛；
8. 所有 ID 和时间由调用方随 Command 提供，纯 reducer 不读取 I/O、系统时钟或随机源；
9. KAF-1 使用每 Task 串行 mailbox，KAF-2 再映射到事务、Event 与 Checkpoint。

## 3. 上游借鉴

- OpenHands：显式状态、Action/Observation 和协作取消；
- Grok Build：Actor/mailbox 单写入者；
- LangGraph：显式 Command、Step、Interrupt/Resume；
- RoboThree：拆分独立 Task/Run/Step 所有权并形成版本化 Contract。

所有采用均为设计重写，不复制上游源码。

## 4. 下一步

进入 `0.0.0-kaf.1.1`：实现 Contract、纯 reducer、单写入者内存 Runtime、Retry/Cancellation/Deadline 和确定性测试；不提前进入 KAF-2 持久化与恢复。

---

# KN-005：KAF-1.1 通过并进入 KAF-2 架构冻结门槛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-20 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-1 关闭、KAF-2 架构确认之前 |
| 主题 | Runtime Kernel 发布处置、Event/Persistence/恢复前置门槛 |
| 依据 | `0.0.0-kaf.1.1` Claude Code 独立 QA `PASS` |

## 1. KAF-1.1 发布结论

`0.0.0-kaf.1.1` 经独立 QA 为 `PASS`：13 项建议范围全部覆盖，ADR-005 十条关键不变量全部落地，8 个测试文件、45 项测试、Architecture boundary 与 Core smoke 全部通过，KAF-0 的 28 项测试无回归。

唯一未关闭项为 `P3-ENV-001`：Claude QA 使用 Node 22.22.1，而正式开发基线是 Node 24.13.0。Codex 已在 Node 24.13.0 完成相同自测，因此该环境差异继续作为非阻断风险保留。

KAF-1.1 作为内部 Runtime Kernel 基线接受。后续持久化实现不得改变 ADR-005 reducer 的纯函数、单写入者、Retry 新 Run 和终态不重开语义。

## 2. KAF-2 前置门槛

KAF-2 不直接从 SQLite 表结构开始编码。必须先确认 ADR-007 的：

1. Event、Checkpoint 与 Command Receipt 的职责；
2. accepted Command 的事务边界；
3. Command 和 Effect 的幂等语义；
4. Outbox 的交付保证；
5. 重启、损坏与副作用 uncertain 的恢复规则；
6. Migration/schema preflight 和失败关闭策略；
7. Kernel、Application、Port、SQLite Adapter 的依赖方向。

## 3. 当前处置

- 已形成 [ADR-007 可确认方案](../adr/007-event-checkpoint-side-effect-consistency.md)；
- 已形成 [KAF-2 开发计划](./KAF-2-DEVELOPMENT-PLAN.md)；
- ADR-007 仍为 `PROPOSED — READY_FOR_CONFIRMATION`；
- 用户确认 ADR-007 七项冻结项前，不开始 `0.0.0-kaf.2.1` 生产代码。

---

# KN-006：接受 ADR-007 并启动 KAF-2.1

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-20 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-2.1 开始之前 |
| 主题 | Event、Checkpoint、Command 幂等、SQLite 事务、Outbox 与副作用恢复 |
| 正式决策 | ADR-007 |

## 1. 已接受事项

用户接受 ADR-007 七项冻结决策：Node 24 `node:sqlite` 单写入者；Command Receipt + append-only Event + Checkpoint；accepted Command 的 Receipt/Event/Checkpoint/Task head/Outbox 单事务提交；每 accepted Command 完整 Checkpoint；`commandId + canonical SHA-256 digest` 幂等；Outbox at-least-once；未知副作用进入 uncertain/reconciliation，禁止盲目重试。

## 2. KAF-2.1 范围

首批只实现 Persistence Contract、语义化 Port、InMemory/SQLite Adapter、Migration/Schema Preflight 和共用 Conformance Suite。不实现 DurableTaskRuntime、Outbox Dispatcher、Effect Recovery、真实 Tool/Worker 或 UI。

## 3. 上游边界

- OpenHands：采用 append-only、稳定 ID 和事件到状态视图思想，不采用文件式事件树；
- LangGraph：采用 Checkpoint Port、SQLite Saver 和 Conformance 思路，不采用 Pregel/channel_versions；
- OpenClaw：采用 Node SQLite、schema preflight、迁移和事务后发布，不采用 Gateway 数据模型；
- 全部为 `DESIGN_ONLY` 重写，无上游源码复制。

---

# KN-007：KAF-2.1 通过并启动 Durable Command Pipeline

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-20 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-2.1 关闭、KAF-2.2 开始之前 |
| 主题 | Persistence 基线发布、Node 环境统一、Durable Runtime 接管 |
| 依据 | `0.0.0-kaf.2.1` Claude Code 独立 QA `PASS` |

## 1. KAF-2.1 发布结论

`0.0.0-kaf.2.1` 在 Node 24.13.0 上完成独立 QA：15 项建议范围全部覆盖，11 个测试文件、73 项测试、Architecture boundary 和 Core smoke 全部通过，问题为 0。Persistence Contract、InMemory/SQLite Conformance、原子事务、幂等、回滚、Migration 与 schema fail-closed 作为内部持久化基线接受。

贯穿 KAF-0.1 至 KAF-1.1 的 `P3-ENV-001` 已关闭。后续正式开发与 QA 均使用 `.node-version` 声明的 Node 24，不再接受低版本环境结果替代发布基线。

## 2. KAF-2.2 边界

允许 Application 层 DurableTaskRuntime 接管 KAF-1 Command 提交，并增加 Event tail/replay、历史 Receipt 回放和最小 Outbox 发布；不得改变纯 reducer，也不得提前实现真实 Tool/Worker 副作用、Effect uncertain 恢复或自动后台 Recovery Coordinator。

## 3. 上游边界

- LangGraph：借鉴 Checkpoint/replay、pending writes 幂等和 Conformance，不引入 Pregel；
- OpenHands：借鉴事件重建状态与稳定 causation，不采用文件事件树；
- OpenClaw：借鉴事务提交后发布与 SQLite 单写入口，不采用 Gateway 模型；
- 全部继续按 `DESIGN_ONLY` 重写，产品仓库不复制研究仓或第三方源码。

---

# KN-008：KAF-2.2 通过并启动 Effect Recovery

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-20 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-2.2 关闭、KAF-2.3 开始之前 |
| 主题 | Durable Command Pipeline 发布与 Effect 崩溃恢复边界 |
| 依据 | `0.0.0-kaf.2.2` Claude Code 独立 QA `PASS` |

## 1. KAF-2.2 发布结论

`0.0.0-kaf.2.2` 在 Node 24.13.0 上完成独立 QA：18 项建议范围全部覆盖，12 个测试文件、89 项测试、Architecture boundary 和 Core smoke 全部通过，问题为 0，`P3-ENV-001` 保持关闭。DurableTaskRuntime 的 load/reduce/idempotency/atomic commit/replay 闭环和 Outbox at-least-once 语义作为内部基线接受。

## 2. KAF-2.3 边界

允许以 Fake Effect Executor 实现 Intent-first Effect 生命周期、稳定 idempotencyKey、命名崩溃点和重启恢复。`prepared` 可安全 dispatch；`dispatched` 只能按 Executor 明示的幂等重试、查询后重试或人工核对策略恢复；无法确认的结果必须进入 `uncertain + waiting/external_dependency`。不得接入真实 Tool、MCP、Worker、用户文件写入或未经授权的外部副作用。

## 3. 上游边界

- OpenHands：借鉴稳定 Event、显式 Action/Observation 与事件到状态视图；
- LangGraph：借鉴持久 pending write、Checkpoint 恢复、Interrupt 和 Conformance 测试方式；
- OpenClaw：继续沿用 SQLite 单写、schema preflight 和事务后 Outbox；
- Intent-first Effect、三种 recovery mode 和 uncertain 收敛是 RoboThree 对上述成熟机制的组合适配，全部 `DESIGN_ONLY` 重写，不复制上游源码。

---

# KN-009：KAF-2.3 通过并关闭 KAF-2

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-20 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-2 关闭、KAF-3 架构冻结之前 |
| 主题 | Effect Recovery 发布结论、SQLite 测试风险与 KAF-3 前置门槛 |
| 依据 | `0.0.0-kaf.2.3` Claude Code 独立 QA `PASS` |

## 1. KAF-2.3 发布结论

`0.0.0-kaf.2.3` 在 Node 24.13.0 上完成独立 QA：21 项建议范围全部覆盖，13 个测试文件、111 项测试、ESLint、TypeScript、Architecture boundary 和 Core smoke 全部通过。Effect 三种 recovery mode、稳定 idempotencyKey、Intent-first 原子提交链、RecoveryCoordinator 非终态恢复边界及全部 `DESIGN_ONLY` 上游采用得到独立验证。

KAF-2.1～KAF-2.3 至此全部通过独立 QA。ADR-007 的 Event、Checkpoint、Command/Effect 幂等、SQLite 原子事务、Outbox at-least-once 和 uncertain reconciliation 已形成可执行内部基线，KAF-2 正式关闭。

## 2. 已接受的非阻断风险

保留 `ISSUE-P3-001`：`sqlite-persistence.integration.test.ts` 在 Vitest 并发 worker pool 下偶发出现 `enableDefensive is not a function`，独立运行和复跑通过，当前证据指向 Node 24 `node:sqlite` 实验性 API 与测试 worker 隔离边界，不影响单 Core 生产运行路径。

处置原则：

1. 不把生产 Adapter 的 `enableDefensive(true)` 改为静默跳过，继续保持数据库安全配置失败关闭；
2. 优先通过 SQLite 集成测试隔离、Vitest pool 配置或 Node 运行时升级验证解决测试 flake；
3. 最迟在 KAF-4 可靠性与性能阶段关闭或重新定级；
4. 若后续在非 Vitest 生产式进程复现，立即升级为产品运行时问题，不再按 P3 接受。

## 3. KAF-3 前置门槛

KAF-3 不直接接真实 Tool/MCP/Worker。编码前先确认 Capability、Registry 与 Adapter 的最小 Contract 和依赖方向，至少回答：

- Capability 是声明、实例还是二者分离；
- Tool/MCP/Model/Worker 如何共享注册与版本锁定机制；
- Task 如何锁定能力版本，同时实时应用撤销和安全控制；
- Adapter capability、health、lifecycle 与 recovery mode 如何声明；
- Registry finalize 后是否不可变，运行期如何形成 Task 可用能力快照；
- Core 如何避免可信扩展代码在进程内未经审核热加载。

上述边界冻结前，不开始 KAF-3 生产代码。

---

# KN-010：接受 ADR-008 并打开 KAF-3.1 编码入口

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-20 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-3.1 开始之前 |
| 主题 | Capability 分层、不可变 Registry、Task 锁定、实时收窄与首批 Adapter Port |
| 依据 | 用户接受七项原则及两项范围修订；ADR-008 `ACCEPTED` |

## 1. Capability 与 Registry

Kernel Alpha 明确分离 `CapabilityDefinition`、`CapabilityBinding`、`AdapterDescriptor` 和 `RuntimeAdapterHandle`。前三者是版本化、JSON-safe、可锁定的 Contract；Runtime Handle 只属于 Local Core 运行时，不进入 Contract、Event、Checkpoint 或 Task lock。

Alpha 在启动时从官方及企业内部可信声明构建并冻结一个 RegistrySnapshot。Snapshot 内区分 Agent 可见能力与基础设施资源；Agent 首期只感知 model 和 tool，不感知 Binding、Adapter、Worker、Credential 或其他基础设施对象。运行期不新增能力，不加载未经审核的第三方代码。

## 2. 解析、锁定与实时状态

CapabilityResolver 首期只接受显式 capability ID，确定性返回唯一 Definition、Binding 和 AdapterDescriptor，不建设能力搜索、评分、成本路由或智能 fallback。

Task 锁定 Registry、Definition、Binding 和 AdapterDescriptor 的精确 revision，并在 TaskCapabilityLock 中物化恢复所需的规范投影；不得锁定 Runtime Handle、PID、连接实例、Secret 或瞬时 health。revoked、disabled、credential unavailable 和 unhealthy 只能把已锁定能力收窄为不可用，Alpha 禁止静默更换 Binding。

未来 failover 只有在候选 Binding 已预先锁定、Policy 允许、完整 Event/Audit 记录且副作用恢复安全时才可另行设计。

## 3. 首批 Port 与进程边界

KAF-3 首批 Port 限于：

- `ModelProvider`；
- `ToolCatalogProvider`；
- `ToolExecutionBackend`。

拒绝万能 `Capability.execute()`，原通用 `ExecutionBackend` 名称收窄为 `ToolExecutionBackend`。`CredentialResolver` 与 `EventPublisher` 不借本阶段扩张。

KAF-3 先以 Fake 和 Conformance Suite 验证 Contract/Port，关闭前必须增加一个最小真实进程外 Echo Tool Adapter，穿透 IPC、序列化、Timeout、Crash 和 Observation/Event/Checkpoint 链路。完整 MCP、Office、PDF、Browser、真实模型与企业 MaaS Adapter 后置。

## 4. 上游边界

- grok-build：借鉴 `ToolRegistryBuilder → FinalizedToolset`，不照搬三套 Tool 体系；
- OpenHands：借鉴 Spec/Definition/Executable 分层与类型化 Action/Observation，进一步隔离 Runtime Handle；
- OpenClaw：借鉴声明式 Manifest 和启动校验，拒绝运行期第三方 Plugin Activation/热加载；
- 全部先按 `DESIGN_ONLY` TypeScript 重写，不复制上游源码。

## 5. 开发结论

[ADR-008](../adr/008-capability-registry-and-adapter-boundary.md) 和 [KAF-3 开发计划](./KAF-3-DEVELOPMENT-PLAN.md) 构成 KAF-3 的正式实现边界。KAF-3.1 编码入口已打开，但首批必须停在 Capability Contract 与不可变 Registry，不提前进入 Tool 执行、进程 IPC 或真实 Provider。

---

# KN-011：接收 KAF-3.1 PASS 并打开 KAF-3.2 编码入口

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-21 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-3.1 关闭、KAF-3.2 开始之前 |
| 主题 | Capability Contract/Registry 发布结论与 Fake-only 执行边界 |
| 依据 | `0.0.0-kaf.3.1` Claude Code 独立 QA `PASS` |

## 1. KAF-3.1 发布结论

`0.0.0-kaf.3.1` 在 Node 24.13.0 上完成独立 QA：18 项建议范围全部覆盖，15 个测试文件、132 项测试、ESLint、TypeScript、Architecture boundary 与 Core smoke 全部通过，问题为 0。Capability Contract、精确 revision、一次性 RegistryBuilder、深层不可变 Snapshot、Agent/基础设施分区和 RuntimeAdapterHandle 边界形成内部基线。

## 2. KAF-3.2 允许范围

KAF-3.2 可以实现显式 ID Resolver、实时 deny-only 收窄、三类 Typed Port/Fake、TaskCapabilityLock 持久化和 Fake Tool 的 Effect/Observation/Event/Checkpoint 闭环。Runtime Handle 仍只属于 Core，Task 只锁定 Definition、Binding、Descriptor 和 Registry 的精确修订。

本批继续禁止能力搜索、评分、智能选路、Binding fallback、运行期热加载、真实进程 IPC、完整 MCP、CredentialResolver/EventPublisher 扩张和真实模型。进程外 Echo Tool 只能在 KAF-3.2 独立 QA `PASS` 后进入 KAF-3.3。

## 3. 信任边界补强

KAF-3.1 的 `source.trust` 只是可序列化声明，不构成信任证明。KAF-3.2 的 RegistryBuilder 必须由 Bootstrap 提供官方/企业可信来源精确 allowlist，并拒绝未在 allowlist 中、仅自称 `official` 的记录。签名、安装来源证明和企业审批流仍属于后续可信加载器，不在本批扩张。

---

# KN-012：确认企业服务端 Java 与本地 Agent Node.js 双栈边界

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-21 |
| 状态 | **CONFIRMED** |
| 阶段 | Kernel Alpha 开发期间，对未来企业管理后台的前置技术约束 |
| 主题 | 企业控制面、Admin API 与本地 Agent Runtime 的主语言边界 |
| 正式决策 | ADR-009 |

## 1. 已确认事项

1. 公司现有服务端以 Java 为主，未来 RoboThree Central Enterprise Service 与 Admin API 后端沿用 Java；
2. 本地 Agent Runtime / Local Core 继续采用 Node.js，不为技术栈表面统一而重写；
3. Admin Console 前端技术栈暂不锁定，它通过 Admin API 使用 Java 企业服务；
4. Java 企业服务与 Node.js Local Core 通过版本化、语言无关 Contract 通信，不互相导入源码或共享进程内对象；
5. Python、C# 和其他语言继续只按 Worker、Tool、MCP Server 或远程能力的真实生态需求接入。

## 2. 当前范围

该决定是未来企业管理后台的技术约束，不改变当前 `0.0.0-kaf.3.2`、KAF-3.3 或 Kernel Alpha 实施范围。现在不创建 Java 服务目录，不选择 Java 版本、框架、数据库、构建工具或 Admin Console 前端框架。

## 3. 后续门槛

管理后台进入真实规划时，必须先定义 Java Admin API 与 Node.js Local Core 的语言无关 Contract、认证授权、兼容性、幂等、超时和审计边界，再决定具体 Java 工程结构和部署方式。

---

# KN-013：冻结 KAF-3.3 真实进程 Tool 分发与不确定性语义

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-21 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-3.2 独立 QA `PASS`、KAF-3.3 开发之前 |
| 主题 | Effect 分发事实、Policy 接入点、进程协议标识与崩溃恢复 |
| 依据 | 用户确认 KAF-3.3 最终八项原则 |

## 1. Effect 与分发语义

状态图继续使用 `prepared → dispatched → succeeded | failed | cancelled | uncertain`，不增加 `dispatch_started`、`dispatch_confirmed` 或 `unknown`。`dispatched` 必须先持久化再调用 Backend，仅代表 Core 已持久化分发决定，不代表对端已收到或执行。

`failed` 只表示可信确定性失败。请求可能已经产生外部副作用但结果无法确认时，按锁定 recovery mode 查询或使用相同幂等键重试；既不可查询也不可安全重试时进入 `uncertain + waiting/reconciliation`。RoboThree 不宣称通用 exactly-once。

## 2. Policy 与实时收窄

Policy/Approval 位于 Effect `prepared` 之前。长时间审批通过后及实际分发前必须重新检查 revoked、disabled、credential 和 health，只能收窄当前锁定 Binding，不允许静默 fallback。KAF-3.3 不实现完整 Policy/Approval，只冻结未来接入顺序。

## 3. 进程协议与标识

- `effectAttemptId`：一个持久 Effect Attempt 内稳定；
- `idempotencyKey`：同一 Attempt 查询、恢复和重试时稳定；
- `requestId`：每次实际传输重新生成，只做进程协议请求响应关联；
- 进程协议属于 Adapter 内部版本化 Contract，不进入公共 Contracts；
- Runtime Handle、PID、连接和子进程实例不得进入 Task lock、Event、Checkpoint 或 Registry。

## 4. KAF-3.3 范围

只实现固定受信路径的 Process Echo、握手与 NDJSON framing、严格关联校验、有界 stdout/stderr、取消/超时、进程崩溃和 SQLite 重启恢复。完整 Policy、Worker、MCP、Office、Browser、真实模型和 trace 系统继续后置。

---

# KN-014：接收 KAF-3.3 PASS 并关闭 KAF-3

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-21 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-3.3 独立 QA 完成、KAF-3 关闭 |
| 主题 | Process Echo 发布结论与 KAF-3 阶段关闭 |
| 依据 | `0.0.0-kaf.3.3` Claude Code 独立 QA `PASS` |

## 1. KAF-3.3 发布结论

`0.0.0-kaf.3.3` 在 Node 24.13.0 上完成独立 QA：27 项建议范围全部覆盖，19 个测试文件、172 项测试、ESLint、TypeScript、Architecture boundary 与 Core smoke 全部通过，问题为 0。

真实 Process Echo 已验证固定受信子进程、版本化 NDJSON、严格 request/effect/action 关联、有界输出、端到端取消、超时、进程替换和 SQLite 重启恢复。请求发出后的 crash、malformed response 和 wrong request ID 保留 `dispatched`，没有伪造确定性 `failed`；恢复保持 `effectAttemptId + idempotencyKey`，每次传输生成新 `requestId`。

## 2. KAF-3 阶段结论

- KAF-3.1：Capability Contract、精确 revision、不可变 Registry 与 Runtime Handle 边界，PASS；
- KAF-3.2：显式 ID Resolver、Typed Ports、实时只收窄、持久 TaskCapabilityLock 与 Fake Tool 闭环，PASS；
- KAF-3.3：真实进程 Tool Adapter、协议、取消和崩溃恢复，PASS。

三批全部通过独立 QA，0 个问题，KAF-3 正式关闭。Capability/Adapter 框架可以作为后续 Policy、Agent Loop、真实 Tool/MCP 与企业 MaaS Adapter 的内部基础，但不等于这些后续能力已经实现。

## 3. 下一阶段门槛

进入 KAF-4 编码前，必须先冻结 Policy/Approval、并发模型、资源预算、重试与背压、可靠性指标和审计边界。不得把 Process Echo 的无业务副作用、单进程、单飞行假设直接推广到真实副作用 Tool 或通用 Worker。

---

# KN-015：冻结 RoboThree MVP 功能范围与开发基线 v1.0

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-22 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-3 关闭、KAF-4 架构收敛之前 |
| 主题 | MVP 产品范围、投入优先级、用户确认与能力管理边界 |
| 正式基线 | [RoboThree MVP 功能范围与开发基线 v1.0](../product/ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md) |

## 1. 冻结结论

经多轮收敛，原 `MVP 功能点-v0.5.md` 正式提升并命名为《RoboThree MVP 功能范围与开发基线 v1.0》。该文件自本节点起约束 MVP 的功能范围、P0/P1、阶段边界、开发优先级、用户流程和验收结果。

后续实质增加、删除或改变本基线范围时，不静默覆盖历史，必须追加新的关键节点；涉及长期且难以回退的技术选择时，同时建立或替代 ADR。

## 2. 已冻结的产品边界

1. Desktop Client 与 RoboThree Core 优先，Local Worker/Tool Adapter 高投入，Central Enterprise Service 中等投入，Admin Console 保持最小可用；
2. Tool 是唯一原子执行能力类型，MCP 只是 Tool 的实现来源；Agent、Skill、Tool、Model、Knowledge 在产品界面分别管理，“能力”只作为导航容器；
3. 企业模型与个人模型具有独立凭证和调用链路；管理员填写企业 API Key，个人模型只允许有权限用户添加，Credential Reference 由系统内部生成；
4. Skill Runtime 负责发现和读取本地 Skill；首期兼容用户级和项目级 `.claude/skills` 及 `.robothree/skills`，不兼容 `.workbuddy`，也不强制导入或转换；
5. 普通已授权文件创建和修改不重复确认；外部调用按任务、目标与数据范围确认，同一范围内复用确认，范围改变时重新确认；
6. MVP 不建设 Task/Run/Step/Tool Action 企业审批、Approver 角色、独立审批模块、完整 Policy 系统、实时撤销生命周期或复杂健康监控；
7. Agent/Skill 以完整、固定、不可编辑的能力包完成创建、测试、提交、审核与发布闭环，不建设独立测试报告系统；
8. Core 的自动选择只发生在用户选择、默认 Agent、Agent 固定依赖和管理员开放能力形成的边界内，不建设全局能力搜索、评分和智能选路平台；
9. 中央远程 Tool 与客户端预装本地 Tool 分开管理；Skill 内容由 Skill Runtime 读取，不把“读取 Skill”包装成 Tool；
10. Task Template、Model/Tool 调用量统计和审计导出后置到 P1。

## 3. 与既有文档和 ADR 的关系

- 较早的《产品与架构基线 v1.0》继续保留产品定位、架构语境和历史价值；若其 MVP 功能范围、P0/P1 或验收定义与本基线冲突，以本基线为准；
- KAF-1～KAF-3 已接受的状态机、持久化、Effect 恢复、Capability/Registry、类型化 Port 与进程 Adapter 决策继续有效；产品文档不暴露这些内部技术细节；
- ADR-006 当前仍为 `PROPOSED`，其中完整 Policy、企业运行时审批和实时撤销设计超出本基线，不得按现稿直接接受；
- KN-013 中关于 Effect 分发、标识生命周期和不确定性恢复的结论继续有效，其中预留的 Policy/Approval 接入点由本节点收缩为固定授权与 Desktop 用户确认接入点。

## 4. 下一阶段门槛

产品功能范围已经冻结，但这不等于 KAF-4 可以立即编码。下一步必须先重构或替代 ADR-006，冻结固定用户权限、Workspace 边界、Tool 风险与 Desktop 用户确认的最小 Contract 和状态语义；随后建立 KAF-4 分批开发计划，再进入代码实现和独立 QA。

---

# KN-016：接受 ADR-006 并冻结 KAF-4 至发布闭环的开发顺序

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-22 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-3 关闭、KAF-4.1 编码之前 |
| 主题 | 固定授权、用户确认、KAF-4 三批计划与后续产品实施顺序 |
| 正式决策 | [ADR-006](../adr/006-permission-policy-data-approval.md)、[KAF-4 开发计划](./KAF-4-DEVELOPMENT-PLAN.md) |

## 1. ADR-006 接受结论

原 ADR-006 的完整 Authorization/Risk/Data/Policy/Approval 五层草案从未接受，现已原位重构并转为 `ACCEPTED`。MVP 运行时只保留：

1. 固定用户和 Model/Tool 使用权限；
2. FileGrant/WorkspaceGrant 与真实路径、操作权限边界；
3. 由受信 Tool Definition、平台下限和确定性 inspector 产生的 ToolRiskFacts；
4. Desktop 用户确认；
5. 与 Authorization 分离、只能收窄当前锁定 Binding 的本地可用性检查。

决策只有 `ALLOW | DENY | REQUIRE_USER_CONFIRMATION`。用户确认不能覆盖越权、非法 Contract、未知风险或 unavailable。

## 2. 四项定稿内容

1. Runtime 的 `approval` 等待原因在 KAF-4.1 改为 `user_confirmation`，同步进行破坏性 Alpha Contract 版本升级和持久数据演进验证；
2. 外部确认首期只支持 Task、真实目标和数据范围的精确匹配，不做子集推导、智能合并或自动扩大；
3. 外部确认在 Task 生命周期内有效、可跨应用重启，不跨 Task；
4. 用户拒绝形成引用原 Action 的类型化 `user_rejected` Observation，不创建 Effect，也不算系统故障。

普通已授权文件 read/create/modify 不逐次确认；delete、批量覆盖、受保护资源和本地程序执行绑定精确单 Action 确认；外部 Model/Tool/service 按 Task、目标和数据范围确认。

## 3. KAF-4 三批顺序

- `0.0.0-kaf.4.1`：固定授权、Tool 风险、持久用户确认、`v1alpha2` Contract 演进、Effect 前置 Gate；
- `0.0.0-kaf.4.2`：有界 admission、并发预算、背压、取消和类型化 Retry；
- `0.0.0-kaf.4.3`：性能基准、流事件治理、优雅停止、SQLite/Outbox 与长期可靠性收口。

每批均需完整自测和 Claude Code 独立 QA `PASS` 后才能进入下一批。KAF-4 不建设 Desktop UI、Central Service、完整 Policy、企业运行时审批、真实 Model/MCP、通用 Worker 或 Agent/Skill 发布审核。

## 4. KAF-4 后续顺序

```text
KAF-4.1 → KAF-4.2 → KAF-4.3
→ KAF-5 Headless Framework 验收
→ KAF-5 独立 QA PASS 后并行：
     A. Desktop Client
     B. Central Service Gateway 基础
→ Gateway 基础稳定后建设精简 Admin Console
→ Core、Desktop、Central 基础稳定后接入 Agent/Skill 发布闭环
```

Desktop 和 Gateway 的并行开发不得提前于 KAF-5 PASS。精简 Admin Console 不得提前于 Gateway 基础稳定。Agent/Skill 发布闭环必须等 Core、Desktop 和 Central 三侧基础边界稳定后接入。

## 5. 下一道门槛

ADR-006、MVP 功能基线和 KAF-4 开发计划已经一致，KAF-4.1 文档门槛满足。用户发出开始 KAF-4.1 指令后，开发版本进入 `0.0.0-kaf.4.1`，公共 Contract 进入 `v1alpha2`，并按 KAF-4 计划执行实现、自测、开发日志和独立 QA。

---

# KN-017：冻结 KAF-4 执行并建立 ADR-010/KAF-5 文档评审门槛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-22 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-4.1 开发启动、KAF-5 架构预审 |
| 主题 | KAF-4 冻结执行、Context/Compaction 草案状态与 KAF-5.0 进入门槛 |
| 正式/候选文档 | [KAF-4 计划](./KAF-4-DEVELOPMENT-PLAN.md)、[ADR-010 PROPOSED](../adr/010-session-context-compaction-and-memory-boundary.md)、[KAF-5 DRAFT](./KAF-5-DEVELOPMENT-PLAN.md) |

## 1. 已确认执行顺序

1. KAF-4 开发计划完成并冻结，立即进入 `0.0.0-kaf.4.1`；
2. KAF-4.1、4.2、4.3 继续逐批实现、自测和独立 QA；
3. 同期把 ADR-010 与 KAF-5 开发计划分别保存为 `PROPOSED` 和 `DRAFT`，只用于文档评审；
4. Claude Code 第一轮只评审文档，不修改产品代码；
5. KAF-4.3 独立 QA `PASS` 后，只有文档评审无 P0 且用户再次确认，ADR-010 才能转为 `ACCEPTED` 并进入 KAF-5.0。

## 2. Context/Compaction 候选边界

- Session/Conversation、Task 执行状态、Context Source、Turn Snapshot、ModelRequest 和 CompactionRecord 分离；
- KAF-5.0 采用方案 B：不改写 KAF-0～KAF-4 已有 `v1alpha2` schemaVersion，新领域使用独立版本；
- Compaction 使用 Session Command/Receipt/Event 的双事务，不复用 Task Receipt/Checkpoint 或 Tool EffectAttempt；
- KAF-5.0 正式版本内部使用 5.0a Contract 与 5.0b Persistence 两个顺序检查点；
- KAF-5.2 不建设真实 Skill Reader，只消费已物化、已选择、有界的 Skill Context Fixture；
- KAF-5 总工程量暂按 18～25 个工作日规划，文档评审后仍可调整。

## 3. 状态约束

ADR-010 的 `PROPOSED` 与 KAF-5 的 `DRAFT` 不构成已接受架构，不得影响 KAF-4 Contract、代码和 QA 范围。KAF-4.3 PASS 前不得为 KAF-5.0 创建生产代码或数据库 migration。

---

# KN-018：接收 KAF-4.1 repair PASS 并打开 KAF-4.2 编码入口

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-23 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-4.1 修复复验完成、KAF-4.2 开发之前 |
| 主题 | Authorization/Confirmation 基线关闭与有界并发开发门槛 |
| 依据 | `0.0.0-kaf.4.1-repair.1` Claude Code 独立 QA `PASS` |

## 1. KAF-4.1 发布结论

`0.0.0-kaf.4.1-repair.1` 在 Node 24.13.0 上完成修复复验：29 个测试文件、265 项测试和 5 文件/39 项修复专项全部通过，原 `ISSUE-KAF41-001/002/003` 三项阻塞全部关闭，新问题为 0。

Authorization allowed/denied audit 在 Effect 前持久且失败关闭；Confirmation 持久摘要只接受 typed scope 固定安全枚举；危险操作、并发决定、SQLite 重启和 prepared/dispatched 前重检形成自动化基线。原 `0.0.0-kaf.4.1` 阻塞视为关闭。

## 2. KAF-4.2 允许范围

KAF-4.2 可以实现 Application 层有界 Run/Tool admission、全局与 Adapter 并发预算、FIFO 排队、typed backpressure、排队取消与 deadline、类型化 RetryPolicy、可注入 Clock/Random/Scheduler，以及 Outbox 有界 batch 和持久 backoff。

Tool admission 必须位于 KAF-4.1 Authorization/Confirmation Gate 之后、Effect Intent 之前。已经 `dispatched` 的 Tool Effect 继续只遵守 ADR-007 的 `idempotent_retry | query_then_retry | manual_reconciliation`，不得由通用 RetryCoordinator 盲目重发。

## 3. 继续冻结的范围

KAF-4.2 不建设优先级队列、租户配额、分布式调度、Remote Worker Fleet、通用进程池、自动 Provider failover、流事件治理、性能基准或优雅停止。后四项可靠性收口属于 KAF-4.3。

ADR-010 继续保持 `PROPOSED`，KAF-5 继续保持 `DRAFT`；KAF-4.3 独立 QA `PASS` 前不得进入 KAF-5 代码。

---

# KN-019：接收 KAF-4.2 PASS 并打开 KAF-4.3 编码入口

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-23 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-4.2 独立验收完成、KAF-4.3 开发之前 |
| 主题 | 有界并发、重试与 Outbox 可靠性基线关闭 |
| 依据 | `0.0.0-kaf.4.2` Claude Code 独立 QA `PASS` |

## 1. KAF-4.2 发布结论

`0.0.0-kaf.4.2` 在 Node 24.13.0 上完成独立验收：31 个测试文件、283 项测试、Architecture boundary、lint、typecheck 和 Core smoke 全部通过；21 项验收范围全部通过，问题为 0。

Runtime admission 的 16 Run、8 Tool、256 queue 显式预算和释放路径成立；Authorization/Confirmation Gate 在并发、取消和 Retry 下不可绕过；Process Echo 保持单飞行且没有内部无界排队；未知 Tool 副作用不会被通用 Retry 盲目重发；Outbox 的持久 backoff、due-only selection 和 SQLite restart 行为通过验证。

## 2. KAF-4.3 允许范围

KAF-4.3 可以实现可复现 performance/reliability Harness、每 subscriber 独立有界的事件流、只针对非持久 delta 的合并、慢消费者隔离、disconnect/cancel 清理、Core graceful stop、Outbox backlog 恢复 drain、10,000 Event checkpoint/tail replay 以及长期内存和重复 restart/recovery 验证。

SQLite WAL、busy timeout、prepared statement 和事务批处理只允许先测量；没有故障测试证明持久性不下降时，不改变现有 `synchronous = FULL`、事务原子性、schema preflight 或 close/reopen 语义。

## 3. 继续冻结的范围

KAF-4.3 不建设 Desktop WebSocket、Central Event Bus、OpenTelemetry 全链路、生产告警、分布式压测或跨机器 SLA。ADR-010 继续保持 `PROPOSED`，KAF-5 继续保持 `DRAFT`；只有 KAF-4.3 独立 QA `PASS`、文档评审无 P0 且用户再次接受后，才能接受 ADR-010 或进入 KAF-5.0。

---

# KN-020：接受 ADR-010、关闭 KAF-4 并打开 KAF-5.0a

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-23 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-4.3 独立 QA 与 ADR-010 第二轮文档评审完成 |
| 主题 | Session/Context/Compaction 架构接受与 KAF-5.0 顺序入口 |
| 依据 | `0.0.0-kaf.4.3` Claude Code 独立 QA `PASS`；`DISC-20260723-145409-codex` 第二轮文档评审 `PASS`；用户明确批准 |
| 正式文档 | [ADR-010 ACCEPTED](../adr/010-session-context-compaction-and-memory-boundary.md)、[KAF-5 CONFIRMED](./KAF-5-DEVELOPMENT-PLAN.md) |

## 1. KAF-4 关闭

`0.0.0-kaf.4.3` 在 Node.js 24.13.0 上完成独立 QA：38 个测试文件、304 项测试、Architecture boundary 和 Core smoke 全部通过，问题为 0。KAF-4.1～KAF-4.3 均已通过独立 QA，KAF-4 正式关闭。

## 2. ADR-010 接受

ADR-010 原 5 个 P2 和 4 个 P3 经修订后全部关闭，第二轮只读文档评审结论为 P0/P1/P2/P3 均为 0。用户在评审结论后明确批准，ADR-010 从 `PROPOSED` 转为 `ACCEPTED`，KAF-5 开发计划从 `DRAFT` 转为 `CONFIRMED`。

已冻结的核心边界包括：

1. Session 与 Task 保持独立 head、revision、receipt、event sequence 和 checkpoint 所有权，只复用底层基础设施；
2. Context 使用 `Turn Snapshot → Budget Policy → Context Assembly → Token Measurement/Reduction → Model Conversion`；
3. ConversationMessage append-only，Compaction Summary 不是 Task 或执行结果事实源；
4. Compaction 使用 Session 级双事务、数据库 pending 唯一约束和 `activeCompactionId + contextRevision` compare-and-set；
5. KAF-4 冻结的 `v1alpha2` 不重写，新 Conversation/Context/Compaction/Model 领域各自从 `v1alpha1` 演进；
6. KAF-5 不建设跨 Session 长期 Memory、真实 Skill Runtime、真实 Model Provider、Desktop、Central Service 或 Knowledge 平台。

## 3. KAF-5.0 顺序门槛

只打开 `0.0.0-kaf.5.0` 内部的 5.0a Contract Checkpoint。5.0a 必须完成独立版本、strict/JSON-safe Contract、unknown-version fail-closed、敏感运行时对象拒绝、canonical digest、引用边界、架构 boundary、类型检查和 KAF-0～KAF-4 回归。

5.0a 全部检查和独立 QA `PASS` 前，不得进入 5.0b，不得新增 Session/Compaction SQLite migration、Persistence Adapter 或双事务生产实现。

---

# KN-021：接收 KAF-5.0a PASS 并打开 5.0b Persistence Spine

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-23 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-5.0a 独立 QA 完成、KAF-5.0b 开发入口打开 |
| 主题 | Contract Checkpoint 验收与 Session/Compaction Persistence 实施 |
| 依据 | `docs/development/qa/0.0.0-kaf.5.0-claude-qa.md`：39 files / 316 tests / 10/10 checklist / 14/14 QA / P0=P1=P2=P3=0 |
| 正式文档 | [ADR-010 ACCEPTED](../adr/010-session-context-compaction-and-memory-boundary.md)、[KAF-5 CONFIRMED](./KAF-5-DEVELOPMENT-PLAN.md) |

## 1. 5.0a 验收结论

Claude Code 确认四个新领域独立 `v1alpha1`、strict/JSON-safe Contract、canonical digest、Session/Task 所有权隔离、`SelectedSkillContext` 公共边界和 KAF-4 `v1alpha2` 回归全部通过。5.0a 未提前创建 migration 5、ConversationPersistence 或 CompactionCoordinator，问题为 0，5.0b 正式解锁。

## 2. 5.0b 实施边界

5.0b 只实现 Conversation/Compaction Persistence Spine：语义 Port、InMemory/SQLite 共用 Conformance、连续 migration、数据库 pending 唯一约束、两笔 `BEGIN IMMEDIATE` 事务、T2 CAS、Receipt 幂等、Outbox 和崩溃恢复。

本批不实现 rich message、摘要模型、真实 CompactionCoordinator、Context Assembly、Agent Loop、长期 Memory、Skill Runtime、真实 Model Provider、Desktop、Central Service 或 Knowledge 平台。

## 3. 当前门槛

5.0b 已完成开发者自测：41 个测试文件、342 项测试、Architecture boundary 和 Core smoke 全部通过，状态为 `READY_FOR_INDEPENDENT_QA`。只有 5.0b 独立 QA `PASS` 后，`0.0.0-kaf.5.0` 才完成并允许进入 KAF-5.1。

---

# KN-022：关闭 KAF-5.0 并打开 KAF-5.1 Conversation 与 Turn Foundation

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-23 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-5.0b 独立 QA 完成、KAF-5.1 开发入口打开 |
| 主题 | Session/Compaction Persistence 验收与 Turn Snapshot 基础 |
| 依据 | `DISC-20260723-165428-codex` Claude Code 回复：41 files / 342 tests / 20/20 Conformance / 6/6 SQLite integration / P0=P1=P2=P3=0 |
| 正式文档 | [KAF-5.0 QA](../development/qa/0.0.0-kaf.5.0-claude-qa.md)、[KAF-5 CONFIRMED](./KAF-5-DEVELOPMENT-PLAN.md) |

## 1. KAF-5.0 关闭

Claude Code 确认 5.0b 满足 ADR-010 §3.8：两笔事务内重读、数据库 pending 唯一约束、T2 CAS 与回滚、Receipt 幂等、prefix tail、竞争 stale、三类崩溃恢复、migration 4→5 和 InMemory/SQLite Conformance 全部通过。问题为 0，KAF-5.0 正式完成。

## 2. KAF-5.1 允许范围

KAF-5.1 可以实现 append-only rich ConversationMessage、provider-neutral user/assistant/tool message、稳定 Task/Action/Observation 引用、Session→Task 查询、TurnContextSnapshot 和确定性事实投影，以及 migration、close/reopen 和 Conformance。

本批不得注入 Tool Schema、生成 ModelRequest、执行 Context Budget/Assembly、接真实 Model Provider、读取真实 Skill/Knowledge/Workspace，也不得进入 CompactionCoordinator、Agent Loop、Desktop、Central 或长期 Memory。

## 3. 当前门槛

KAF-5.1 已完成开发者自测：44 个测试文件、357 项测试、Architecture boundary 和 Core smoke 全部通过，状态为 `READY_FOR_INDEPENDENT_QA`。只有 5.1 独立 QA `PASS` 后才能进入 KAF-5.2。

---

# KN-023：接收 KAF-5.1 PASS 并打开 KAF-5.2 Context Pipeline

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-23 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-5.1 独立 QA 完成、KAF-5.2 开发入口打开 |
| 主题 | Conversation/Turn Foundation 验收与纯 Context Assembly |
| 依据 | `DISC-20260723-181056-codex` Claude Code 回复：44 files / 357 tests / targeted 3 files / 15 tests / P0=P1=P2=P3=0 |
| 正式文档 | [KAF-5 CONFIRMED](./KAF-5-DEVELOPMENT-PLAN.md) |

## 1. KAF-5.1 关闭

Claude Code 确认 3 User、3 Assistant、1 组 tool exchange、2 Tasks 的固定 Fixture，连续投影 10 次、InMemory/SQLite 一致、close/reopen、append-only、精确 Task/Action/Observation 引用、migration 6、legacy envelope 和损坏正文失败关闭全部通过。问题为 0，KAF-5.1 正式完成。

## 2. KAF-5.2 允许范围

KAF-5.2 可以实现纯 Context Pipeline、有限 Alpha Budget Policy、Core 内部已物化 `SelectedSkillContext`、保守 Fake TokenEstimator、Static/Dynamic Segment、基于当前 Snapshot 与 TaskCapabilityLock 的 Tool Schema 注入、provider-neutral ModelRequest、Tool Result 有界 preview/reference，以及 pre-call/mid-turn 全量重新预算。

本批不得接真实 Skill Reader、Knowledge/Workspace Reader、真实 Model Provider、厂商 SDK、CompactionCoordinator、Agent Loop、Desktop、Central Service 或跨 Session 长期 Memory。

## 3. 当前门槛

KAF-5.2 已完成开发者自测：46 个测试文件、373 项测试、Architecture boundary 和 Core smoke 全部通过，状态为 `READY_FOR_INDEPENDENT_QA`。只有 5.2 独立 QA `PASS` 后才能进入 KAF-5.3。

---

# KN-024：接收 KAF-5.3 PASS、关闭 KAF-5 并打开双线规划入口

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-23 |
| 状态 | **CONFIRMED** |
| 阶段 | KAF-5.3 独立 QA 完成、产品外壳与企业控制面规划之前 |
| 主题 | Headless Agent Framework 验收与 Desktop/Central 双线入口 |
| 依据 | `DISC-20260723-195924-codex` Claude Code 回复：Harness 7 files / 75 tests；完整门禁 48 files / 394 tests；15/15；P0=P1=P2=P3=0 |
| 正式文档 | [KAF-5.3 QA](../development/qa/0.0.0-kaf.5.3-claude-qa.md)、[KAF-5 CLOSED](./KAF-5-DEVELOPMENT-PLAN.md) |

## 1. KAF-5.3 验收结论

Claude Code 在 Node.js 24.13.0 环境实际重跑统一 `harness:kaf53` 和完整 `check`。Model、Context、Compaction、Agent Loop、Tool Execution、User Confirmation 与 Effect Recovery 七组 Harness 共 75 项测试通过；完整门禁 48 个测试文件、394 项测试通过，Architecture boundary、ESLint、TypeScript、build 和 Core smoke 均通过。

用户追加的三项门槛全部成立：`waiting_user_confirmation` 在 5 个 fresh SQLite 数据库完成等待持久化、close/reopen 和同一 Tool Action 恢复；延迟旧 Compaction 结果显式收敛为 stale 且不改变 Head/Record；独立 QA 实际重跑完整 Harness，digest 仅作为重复执行比较证据。

## 2. KAF-5 关闭

KAF-5.0～5.3 已全部通过独立 QA。RoboThree 已形成无 UI 的 Conversation、Context Assembly、Token Budget、durable Compaction、最小 Agent Loop、ToolExecutionService bridge、用户确认恢复和有界 Headless Harness。真实 Model Provider、真实 Skill Runtime、Knowledge、Desktop、Central Service 和跨 Session 长期 Memory 仍按既定范围留在后续阶段。

## 3. 下一阶段入口

允许并行规划：

1. Desktop Client 基础：Electron/Vue 安全壳、Local Core 连接、会话与任务交互、Workspace Grant、模型选择、用户确认和运行状态；
2. Central Service Gateway 基础：Java 服务骨架、客户端身份、企业配置同步、企业模型/Tool 元数据和最近一次成功同步的离线快照边界；
3. 在两条线编码前，先分别冻结开发计划，并冻结 Desktop ↔ Local Core、Local Core ↔ Central Service 的版本化 Contract；
4. Gateway 基础稳定后再建设精简 Admin Console；Core、Desktop、Central 基础稳定后再接入 Agent/Skill 发布闭环。

---

# KN-025：确认 Desktop/Central Foundation 方向并建立正式业务编码解阻塞门槛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-24 |
| 状态 | **CONFIRMED_WITH_REQUIRED_REVISIONS** |
| 阶段 | KAF-5 关闭后、Desktop/Central Foundation 正式业务编码之前 |
| 主题 | 四项总体方向确认、两份 Contract 提案状态与全局架构阻塞项 |
| 前置事实 | KAF-5.3 `PASS`；KAF-5 `CLOSED`；KN-024 已打开 Desktop/Central 双线规划入口 |
| Contract 状态 | Desktop Local Runtime Contract `PROPOSED`；Enterprise Gateway Contract `PROPOSED` |
| 编码状态 | **BLOCKED_BEYOND_NON_SEMANTIC_SCAFFOLDING** |

## 1. 当前状态

Desktop/Central 四项总体架构方向已经确认，不再回退到 Renderer 直连 Core、Central 接管 Agent Loop、运行期智能选模、微服务优先或增量配置热替换等候选方案。DCF-0/CGF-0 可以准备工程目录、Build/Lint/Test/CI、空模块、Fake Adapter 和非语义传输 Harness；两份 Contract 尚未冻结，正式业务 HTTP/SSE、持久化、Runtime Selection、Submit Turn、Credential 和 Runtime Activation 实现继续阻塞。

三个全局阻塞项为：

1. Task Runtime Selection；
2. Submit Turn Coordination；
3. Configuration Storage Activation 与 Runtime Registry Activation 分层。

三个阻塞项完成文档评审并被 PM 明确接受后，必须追加新的 KEY-NODE 升级状态，不得回写本节点。

## 2. 已确认的核心架构方向

1. Desktop 负责用户输入、选择、展示、用户确认、Artifact 和应用生命周期；Local Core 是 Session/Task/Agent Loop/Runtime Selection/Prompt Assembly/本地恢复的唯一协调者；Central Service 负责企业 Gateway、中央凭证、配置、固定权限和最小审计；
2. Renderer 不直接访问 Local Core、文件系统、数据库、系统命令或凭证，只经 Preload 白名单和 Electron Main；
3. Electron Main 与 Local Core 采用私有 loopback、随机端口、短期令牌的 localhost HTTP + SSE；该措施用于降低本地攻击面，不宣称绝对阻止同一 OS 用户下已被攻陷或具备调试权限的恶意进程；
4. Java Central Service 采用模块化单体，跨语言边界采用 OpenAPI 3.1、JSON Schema、HTTPS/JSON 和 SSE 方向；
5. 企业配置采用完整 Snapshot、候选校验、强依赖物化和原子 Storage Activation；
6. 每个 Agent 必须具有 defaultModel；`allowModelOverride` 只控制用户是否可为单个 Task 显式选择其他合法模型；
7. Local Core 负责确定性 Runtime Selection；Central Gateway 只校验并执行已经解析、锁定的 Model，不参与自动选模；
8. Task 启动后，Agent、Model、Skill、Tool、Knowledge、Workspace 和 Prompt 运行组合不得因配置同步、health、断线或定义更新静默改变；
9. 本地发现 Skill 不等于 Agent 允许使用，也不等于当前 Task 已启用；只有允许、授权、启用、解析且锁定的 Skill 才能进入 Prompt；
10. Capability Registry 继续只管理 Model 和 Tool；Agent、Skill、Knowledge 保持独立产品对象。

## 3. 本轮架构评审问题摘要

| 编号 | 问题名称 | 当前决策 | 解决文档 | 状态 |
| --- | --- | --- | --- | --- |
| P0-1 | RuntimeSelectionSnapshot 未落位 | 新建不可变 TaskRuntimeSelection，分离 Selection/Lock/Turn/Request | ADR-011 Task Runtime Selection | OPEN |
| P0-2 | submitTurn 缺应用层编排 | 建立最小 SubmitTurnCoordinator 和恢复记录 | ADR-012 Submit Turn Coordination | OPEN |
| P0-3 | Snapshot 激活与冻结 Registry 冲突 | 分离 Storage Activation 与 Runtime Registry Activation | ADR-008/009 一致性修订 | OPEN |
| P0-4 | 离线配置缺少物化依赖 | 以 MaterializedEnterpriseConfiguration 为技术激活单位 | Enterprise Gateway Contract / CGF Plan | OPEN |
| P0-5 | 个人 Model 凭证所有权矛盾 | Local Core Application 持有业务生命周期，OS Keychain 由 Port/Adapter 隔离 | ADR-013 Personal Credential Store / Broker | OPEN |
| P2-1 | 默认 Model 基线不一致 | defaultModel 必填，override 只影响单 Task | MVP 基线修订 | REQUIRED |
| P2-2 | 企业 Agent 修改路径不一致 | 发布版本只读，创建者派生个人草稿后重提 | MVP 基线 / DCF Plan | REQUIRED |
| P2-3 | ModelEligibilityEvaluator 边界不清 | 独立纯确定性过滤，不复用 CapabilityResolver | ADR-011 | REQUIRED |
| P2-4 | DCF-1 Streaming 依赖真实 Model | DCF-1 用 Scripted/Fake；真实企业/个人 Model 后续联合验收 | DCF Plan | REQUIRED |
| P2-5 | 真实 Skill Runtime 未进入计划 | Core Skill Runtime Foundation 为 DCF-3 前置门槛 | DCF Plan | REQUIRED |
| P2-6 | Model Gateway 幂等承诺过强 | 只承诺 Invocation 接受幂等和有限事件重放 | Enterprise Gateway Contract / CGF Plan | REQUIRED |
| P3-1 | Local API 安全措辞过强 | 改为降低攻击面并定义令牌受控交付 | Desktop Local Runtime Contract | REQUIRED |
| P3-2 | “排队中”可能污染 TaskStatus | 只作为 Desktop Projection | Desktop Local Runtime Contract / DCF Plan | REQUIRED |
| P3-3 | 三种模型默认值混淆 | 分离 Agent default、User personal default、Task requested | ADR-011 / MVP 基线 | REQUIRED |

## 4. 待建 ADR 与配置激活修订

本轮建立三个待评审 ADR：

1. Task Runtime Selection；
2. Submit Turn Coordination；
3. Personal Credential Store / Broker。

配置同步不新建第四个 ADR，而是在 ADR-008、ADR-009、Enterprise Gateway Contract 和 CGF 计划中区分：

- **Configuration Storage Activation**：配置和全部强依赖已校验、物化并成为本地最近成功配置；
- **Runtime Registry Activation**：Local Core 受控重启或由既有 ADR 明确允许的 rebuild 后创建新 RegistrySnapshot，新 Task 才能使用新配置。

Storage Activation 不修改当前冻结 RegistrySnapshot。当前 Task 继续使用旧 TaskCapabilityLock；Alpha 不做运行期 Binding 热替换、多代 Registry 热并存或静默 Model/Tool 切换。

## 5. 阶段门槛

以下为阶段门槛和 Core/Contract 工作包，不新增用户侧产品模块：

- `MaterializedEnterpriseConfiguration`：CGF-1 和离线配置可用性的技术激活单位；
- `Core Skill Runtime Foundation`：真实本地/企业物化 Skill 进入 DCF-3 前的前置工作包；
- `Personal Credential Store / Broker`：个人 Model 功能开始前的安全前置决策。

## 6. 本轮不进入的范围

- 跨 Session 长期 Memory；
- 自动模型评分、成本路由、失败自动换模型；
- Multi-Agent/Subagent；
- 复杂 RBAC、组织继承和正式 SSO；
- Policy Engine、运行时企业审批和实时权限撤销；
- 完整 Admin Console；
- Central 微服务拆分；
- 多代 RegistrySnapshot 运行期热并存。

---

# KN-026：接受 Desktop/Central Foundation Contract 并打开 DCF-0/CGF-0

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-24 |
| 状态 | **CONFIRMED** |
| 阶段 | KN-025 文档收口与两轮独立复核完成 |
| 主题 | Runtime Selection、Submit Turn、个人凭证和 Desktop/Central 跨边界 Contract 正式接受 |
| 依据 | 用户明确接受；`DISC-20260724-133608-codex` 首轮评审；`DISC-20260724-134646-codex` 修订复核全部 `CLOSED`、新增问题为 0 |
| 正式文档 | [ADR-011](../adr/011-task-runtime-selection.md)、[ADR-012](../adr/012-submit-turn-coordination.md)、[ADR-013](../adr/013-personal-credential-store-broker.md)、[Desktop Contract](./contracts/DESKTOP-LOCAL-RUNTIME-CONTRACT-v1alpha1.md)、[Enterprise Contract](./contracts/ENTERPRISE-GATEWAY-CONTRACT-v1alpha1.md) |

## 1. 接受结论

正式接受：

1. ADR-011 Agent Definition 与 Task Runtime Selection；
2. ADR-012 Submit Turn 跨 Session/Task 最小协调与恢复；
3. ADR-013 Personal Credential Store 与受控 Broker 边界；
4. Desktop Local Runtime Contract `v1alpha1`；
5. Enterprise Gateway Contract `v1alpha1`；
6. ADR-008/009 中 Configuration Storage Activation 与 Runtime Registry Activation 的一致性修订。

KN-025 的五项 P0 已在架构文档层全部关闭。Runtime Selection、Submit Turn、MaterializedEnterpriseConfiguration、个人凭证所有权和两层激活成为后续实现必须遵守的正式约束。

## 2. 打开的开发范围

打开：

- DCF-0：Electron/Vue/TypeScript 安全桌面壳、Main/Preload/Renderer 边界、Local Core 非业务进程 Harness、Fake readiness/compatibility、资源清理和安全测试；
- CGF-0：Java 模块化单体工程骨架、非业务 readiness/compatibility Fixture、跨语言 Conformance 基础、Fake Secret Store/Model/Tool 和构建测试基础。

DCF-0/CGF-0 可以形成有效代码、构建和测试基线，但不得借 Foundation 名义提前实现 DCF-1+/CGF-1+ 的正式业务能力。

## 3. 继续按批次控制的范围

以下内容不是“无限期阻塞”，而是按开发批次逐项解锁：

- DCF-1 前：Desktop 字段级 Schema、版本兼容、localhost 威胁模型与 Conformance；
- CGF-1 前：公司 Java/数据库/Secret Store 基线、身份 Bootstrap、字段级 OpenAPI/JSON Schema 与 TS/Java Conformance；
- Runtime Selection、SubmitTurnCoordinator、业务数据库表和 migration 只能进入其计划批次；
- OS Keychain/Broker 与真实个人 Model 只能进入 DCF-3，并独立验证 Secret 禁入边界；
- 真实 Skill Runtime 必须在 DCF-3 前形成单独实施计划和验收；
- 企业真实 Model/Tool 分别在 CGF-2/CGF-3 验收，不在 CGF-0 混入。

## 4. 不变的架构边界

- Renderer 不直接访问 Local Core、文件系统、数据库、系统命令或凭证；
- Local Core 是 Runtime Selection、Agent Loop、Session/Task 和本地恢复的唯一协调者；
- Central Gateway 不自动选模、不接管 Agent Loop、不接收本地 Workspace 或个人 Secret；
- Capability Registry 只管理 Model 和 Tool；
- 已启动 Task 不因配置同步、health 或断线静默切换能力；
- Storage Activation 不修改当前冻结 RegistrySnapshot，Runtime Activation 只在受控重启/rebuild 后发生；
- 不引入长期 Memory、Multi-Agent、复杂 RBAC、Policy Engine、完整 Admin Console、微服务拆分或运行期多代 Registry 热切换。

## 5. 下一道门槛

DCF-0 与 CGF-0 分别完成开发者自测和独立 QA 后，才能进入 DCF-1/CGF-1。两个 Foundation 批次可以并行开发，但必须分别报告构建环境、测试证据和已知缺口；任一条线的 `PASS` 不自动替代另一条线的门槛。

---

# KN-027：DCF-0/CGF-0 双 Foundation 独立 QA 通过并关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-24 |
| 状态 | **CONFIRMED** |
| 阶段 | Desktop/Central 非语义 Foundation |
| 主题 | 两条 Foundation 分别完成独立 QA，进入下一批前置准备 |
| 依据 | Claude Code 对 DCF-0 进行三轮 Node/Desktop 全量重跑；对 CGF-0 使用 JDK 21 分别执行在线与离线 Maven Wrapper 验证 |

## 1. 验收结论

```text
DCF-0 0.0.0-dcf.0.1
PASS
52 files / 399 tests / 3 rounds stable
P0=P1=P2=P3=0

CGF-0 0.0.0-cgf.0.1-SNAPSHOT
PASS
mvnw verify + mvnw -o verify
5 tests / 0 failures
P0=P1=P2=P3=0
```

两个 Foundation 批次各自满足 KN-026 门槛，正式关闭。任一批次的结果没有
替代另一批次的独立 QA。

## 2. 已验证边界

- Desktop Renderer、Preload、Main 和 Fake Core 进程保持安全分层；
- DCF Fixture 不冒充正式 Desktop Local Runtime Contract；
- Central Java 模块化单体和真实随机端口 HTTP Harness 可构建、启动和离线复跑；
- CGF Fixture 不进入公共 Contracts，不冒充 Enterprise Gateway 业务 DTO；
- 没有提前实现 Runtime Selection、SubmitTurn、企业身份/配置、数据库、
  Credential、真实 Model/Tool Gateway 或 Runtime Activation。

## 3. Java 工具链后续处理

CGF-0 首轮独立 QA 曾因验收环境没有 Java 21 而暂停。临时 JDK 证明代码可运行，
但 `/private/tmp` 不是工程依赖。Foundation 关闭后建立
`0.0.0-cgf.0.1-repair.1`，以 `.java-version`、可移植 JDK 检查和未来 CI
显式安装解决可复现性；禁止硬编码开发机路径或静默安装 JDK。

## 4. 下一道门槛

DCF-1/CGF-1 只开放前置准备，不自动开放正式业务编码：

- DCF-1：字段级 Desktop Contract Schema、localhost 威胁模型、Fixture-to-formal
  迁移规则和 Conformance；
- CGF-1：Java Toolchain 收口、公司数据库/Secret Store 基线、身份 Bootstrap
  边界、字段级 OpenAPI/JSON Schema 和 TS/Java Conformance；
- 两条线的准备材料分别确认后，再单独打开 DCF-1/CGF-1。

## 5. Java Toolchain 收口结果

`0.0.0-cgf.0.1-repair.1` 已完成独立 QA：

```text
check:java: PASS
check:central: 5 tests / BUILD SUCCESS
check:central:offline: 5 tests / BUILD SUCCESS
Node/Desktop: 53 files / 402 tests PASS
P0=P1=P2=P3=0
```

Java 21 现在由 `.java-version`、可移植发现/校验脚本、Maven Wrapper 和 Maven
Enforcer 共同约束，不依赖 `/private/tmp` 或开发者固定路径。Java Toolchain
Foundation 正式关闭，不再阻塞 DCF-1/CGF-1 前置准备。

---

# KN-028：确认 DCF-1/CGF-1 指定修订并打开双 Contract 工作流

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-24 |
| 状态 | **CONFIRMED** |
| 阶段 | DCF-1 / CGF-1 |
| 主题 | Java Toolchain 前提已满足；两份 1.0 Contract/Conformance 批次解阻塞 |
| 依据 | 用户确认 DCF-1 与 CGF-1 为 `CONFIRMED_WITH_SPECIFIED_REVISIONS` |

## 1. Java Toolchain Foundation

Java Toolchain Foundation 已完成并通过独立 QA：

- Java 21；
- Maven Wrapper；
- `.java-version`；
- Maven Enforcer；
- CI 安装 Temurin 21；
- Windows/macOS/Linux 跨平台入口；
- `check:java`、`check:central` 和 `check:central:offline`。

CGF-0 与 Java Toolchain 均为 `CLOSED`，该前提不再阻塞 CGF-1.0。该节点只按时间
追加，不改写 KN-027 的历史结论。

## 2. DCF-1 确认与门槛

DCF-1 状态为 `CONFIRMED_WITH_SPECIFIED_REVISIONS`。指定修订包括：

- 统一受认证 SSE，durable/critical 优先于可合并 ephemeral delta；
- `replay_reset_required` 与 Snapshot-first 恢复；
- 有界 `DesktopDeliveryRecord`；
- 大型正文通过 Query/Snapshot 获取；
- `deleteSession` 固定为 tombstone，活动 Task 返回
  `session_has_active_task`；
- heartbeat 默认 15 秒且不进入 durable/domain event；
- Core 业务机制属于 DCF-1.1，不属于 DCF-1.0。

DCF-1.0 已打开，用于正式 Schema、Threat Model、Fixture 和 Contract
Conformance。DCF-1.1 只有在 DCF-1.0 评审无 P0/P1 且继续符合 ADR-011/012 后
才解锁。

## 3. CGF-1 确认与门槛

CGF-1 状态为 `CONFIRMED_WITH_SPECIFIED_REVISIONS`。指定修订包括：

- `EnterpriseCredentialStore` 与 `PersonalCredentialStore` 分离；
- 企业 credentialRef 不下发 Local Core；
- 单个 Package 文件默认上限 512 KiB；
- `contracts/enterprise-gateway/v1alpha1/` 是唯一 canonical source；
- Runtime Activation 不得中断非终态 Task；
- Enrollment 是可替换 `EnterpriseClientIdentityProvider` 的首个 Alpha Adapter。

CGF-1.0 已打开，用于 ADR-014、Enterprise Contract Pack 和 TS/Java
Conformance。CGF-1.1 仍未解阻塞；必须等待 ADR-014 `ACCEPTED`、CGF-1.0
Schema/Conformance 无 P0/P1、PostgreSQL/Secret Store 基线确认和 canonical
source 唯一确定。

## 4. 并行关系与范围

```text
DCF-1.0 ─────→ DCF-1.1
CGF-1.0 ─────→ CGF-1.1
```

两条 1.0 工作流可以并行，互不等待对方的 1.1。共享的是既有 ADR 与 Contract
语义，不是业务实现完成状态。本节点不解锁真实企业 Model、真实 MCP、个人
Credential、Admin 写端、真实 Skill Reader、长期 Memory、多 Agent、自动模型
路由、复杂 RBAC 或 Policy Engine。

## 5. 工期风险

DCF-1 的 8～12 个工作日和 CGF-1 的 12～18 个工作日均为单一主开发流的工程
工作量，不含独立 QA、架构复审、环境/企业基础设施等待，也不是日历承诺。PM
日历应预留约 1.5～2 倍窗口。该项为 `P2 — SCHEDULE RISK`，不阻塞两条 1.0
启动，也不改变技术验收门槛。

---

# KN-029：确认 OA Enterprise Identity、Managed Device Trust 与不可导出 Device Signer

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-24 |
| 状态 | **CONFIRMED** |
| 阶段 | DCF-1.0/CGF-1.0 独立 QA 后的企业身份子协议修订 |
| 主题 | OA 用户身份、可信设备、固定权限和 Compatibility 交集后签发短期 Token |
| 依据 | 用户明确接受 DCF-1.0/CGF-1.0 QA，并对 Enterprise Identity、Device Challenge/Proof、离线规则和工期作出最终决策 |
| 正式文档 | [ADR-014（PROPOSED）](../adr/014-enterprise-client-identity-and-credential-bootstrap.md)、[Enterprise Gateway Contract](./contracts/ENTERPRISE-GATEWAY-CONTRACT-v1alpha1.md)、[CGF-1 方案](./CGF-1-INFRASTRUCTURE-IDENTITY-AND-CONFORMANCE-PLAN.md) |

## 1. 双 Contract QA 结论

用户接受：

```text
DCF-1.0：PASS
CGF-1.0：PASS
P0/P1/P2/P3：0
DCF-1.1：UNBLOCKED
CGF-1.1：GATED
```

CGF-1.0 的 Configuration Snapshot、Package、Descriptor、revision/digest、
ETag、canonical JSON、credentialRef 禁入和两层激活主体保持有效，不因身份
子协议修订返工。

## 2. 企业会话成立条件

```text
OA Enterprise Identity
∩ Managed Device Trust
∩ RoboThree Permission
∩ Compatibility
→ Short-lived RoboThree Access Token
```

不采用系统浏览器、OIDC、PKCE 或浏览器 Callback。OA 官方 SDK、Ticket 或
Token Exchange 优先于账号密码 API；RoboThree 不自行设计密码加密算法。

## 3. 六个所有者

```text
Local Core / Desktop
├── EnterpriseUserIdentityClient
├── EnterpriseCredentialStore
└── EnterpriseDeviceSigner

Central Service
├── EnterpriseUserIdentityVerifier
│   └── OAIdentityAdapter
├── EnterpriseDeviceTrustProvider
└── RoboThreeAccessTokenIssuer
```

Local 与 Central Port 不得合并。Renderer 只能瞬时采集 OA 材料，不得持有
企业 Token、Ticket、Refresh/Device/Client Credential 或设备私钥。

## 4. 不可导出 Device Signer 与防重放

```text
EnterpriseDeviceSigner
├── getDeviceKeyId
├── getPublicKey
└── sign(deviceChallenge)
```

禁止获取、解析或导出设备私钥。Central 生成短期、单次、随机、绑定 identity、
purpose、audience 和 `clientInstanceId` 的 Challenge；可信设备必须同时通过
登记公钥签名、未撤销记录和当前合规检查。成功验证后 Challenge 立即原子消费。

## 5. Manual Enrollment 与离线

Enrollment Code 只作为可选 Manual Device Enrollment Adapter：

```text
已验证 OA 用户
→ IT 一次性设备授权
→ 不可导出设备密钥
→ Challenge/Proof
→ Central 登记设备公钥
```

没有有效企业会话时，配置缓存可以保留，但不得重新同步、Storage/Runtime
Activation、进入 Runtime Registry/Prompt 或调用企业 Model/Central Tool。
历史 Task/Audit 不删除。离线企业能力执行和纯本地个人模式继续后置。

## 6. Contract 与阶段门槛

身份 repair 只修改可选 Enrollment、Token、Device Challenge/Proof、Access
Token Claims、Compatibility feature 和 typed error Fixture。配置主体不变。

```text
ADR-014：PROPOSED
CGF-1.1：GATED
```

只有 identity repair 的 TypeScript/Java Conformance 与独立 QA 无 P0/P1，且
用户明确接受 ADR-014 后，CGF-1.1 才解锁。CGF-1.1 集中工程量为 11～16 天；
真实 OA、MDM/设备证书和生产 Device Signer 必须在企业试点前完成，但不是
CGF-1.1 Foundation 完成门槛。

---

# KN-030：接受 ADR-014 并解锁 CGF-1.1

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **CONFIRMED** |
| 阶段 | `0.0.0-cgf.1.0-repair.1` 独立 QA 后 |
| 主题 | Enterprise Identity 正式架构基线接受；CGF-1.1 进入条件满足 |
| 依据 | Claude Code 独立 QA `PASS`，P0/P1/P2/P3 均为 0；用户明确接受 ADR-014 |
| 正式文档 | [ADR-014（ACCEPTED）](../adr/014-enterprise-client-identity-and-credential-bootstrap.md)、[Enterprise Gateway Contract](./contracts/ENTERPRISE-GATEWAY-CONTRACT-v1alpha1.md)、[CGF-1 方案](./CGF-1-INFRASTRUCTURE-IDENTITY-AND-CONFORMANCE-PLAN.md) |

## 1. 独立 QA 结论

`0.0.0-cgf.1.0-repair.1` 独立 QA 实际重跑：

```text
Node/Desktop：56 files / 417 tests PASS
TypeScript Identity：1 file / 10 tests PASS
Java Toolchain：Java 21 ready
check:central：12 tests / BUILD SUCCESS
check:central:offline：12 tests / BUILD SUCCESS
Architecture boundary / ESLint / TypeScript / Vite / smoke：PASS
P0/P1/P2/P3：0
```

34 个共享 Fixture、九份 Schema、六个 OpenAPI 精确 `$defs` 引用、七个
device/challenge typed error、Device Challenge/Proof、Access Token Claims、
OA wire 隔离、设备私钥禁入和配置主体不变均获得独立验证。

## 2. ADR-014 正式接受

ADR-014 从 `PROPOSED` 转为 `ACCEPTED`。后续实现必须遵守：

```text
OA Enterprise Identity
∩ Managed Device Trust
∩ RoboThree Permission
∩ Compatibility
→ Short-lived RoboThree Access Token
```

Local 侧所有者：

- `EnterpriseUserIdentityClient`；
- `EnterpriseCredentialStore`；
- `EnterpriseDeviceSigner`。

Central 侧所有者：

- `EnterpriseUserIdentityVerifier`；
- `EnterpriseDeviceTrustProvider`；
- `RoboThreeAccessTokenIssuer`。

## 3. CGF-1.1 状态

```text
ADR-014：ACCEPTED
CGF-1.0 identity repair：PASS
CGF-1.1：UNBLOCKED
```

CGF-1.1 可以按已确认范围实施：

- PostgreSQL/Flyway/Testcontainers；
- Fake OA Adapter 和 verified identity context；
- Device Challenge/Proof、Proof Verifier 和防重放状态；
- EnterpriseDeviceTrustProvider；
- RoboThreeAccessTokenIssuer；
- Fake/Test EnterpriseDeviceSigner；
- 可选 Manual Device Enrollment；
- Configuration Snapshot/Package/Descriptor 读服务与 ETag；
- 企业 Secret/Credential Port 和 Fake。

## 4. 仍未授权的范围

本节点不授权：

- 真实 OA Adapter；
- 真实 MDM、企业设备证书或生产 OS Device Signer；
- Policy Engine、复杂设备后台或实时撤销；
- 多租户 SaaS、复杂 RBAC；
- 重新设计 CGF-1.0 Configuration/Package/Descriptor 主体；
- 企业试点部署或生产凭证接入。

CGF-1.1 预计仍为 11～16 个集中工程工作日。该数字不包含独立 QA、返工、
真实 OA/MDM、生产 Signer 和公司 IT 等待。

---

# KN-031：确认 CGF-1.1 五项冻结建议并进入 CGF-1.1A

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **CONFIRMED** |
| 阶段 | `0.0.0-cgf.1.0-repair.1` 独立 QA 后 |
| 主题 | CGF-1.1 分批开发、安全默认值与密码学表达边界正式冻结 |
| 依据 | repair.1 独立 QA `PASS`，P1-GOV-001 已关闭；用户明确接受全部五项冻结建议 |
| 正式文档 | [CGF-1.1 开发计划（CONFIRMED）](./CGF-1.1-DEVELOPMENT-PLAN.md)、[ADR-014（ACCEPTED）](../adr/014-enterprise-client-identity-and-credential-bootstrap.md) |

## 1. 五项冻结结论

用户接受：

1. CGF-1.1A～1.1D 四个检查点，每批完成后进行独立 QA；
2. 开发计划 §6 的 Alpha TTL 默认值和绝对上限；
3. `ROBOTHREE_DEVICE_PROOF_V1\n + canonicalJson(DeviceChallenge)` 作为设备
   证明的签名字节；
4. Alpha 仅执行 `ES256 + spki_der_base64`，证书格式在可信 Adapter 完成前
   失败关闭；
5. Token 响应丢失后重新获取 Challenge，不保存或重放 Bearer Token 明文。

## 2. 当前编码权限

```text
CGF-1.1 plan：CONFIRMED
CGF-1.1A：AUTHORIZED
CGF-1.1B～1.1D：GATED BY PREVIOUS BATCH INDEPENDENT QA
```

CGF-1.1A 只允许实现 PostgreSQL/Flyway、migration preflight、显式事务、
类型化 Repository Port、JDBC/Fake Conformance、测试 Fake 和 trusted seed
基础。不得提前实现 Challenge/Proof、Token Issuer、正式身份 HTTP Route 或
Configuration Read Route。

## 3. 下一道门槛

`0.0.0-cgf.1.1a` 必须完成开发者自测并提交独立 QA。只有独立 QA 无 P0/P1
且结论为 `PASS`，才能进入 CGF-1.1B。

---

# KN-032：接受 CGF-1.1A 条件通过并保留 Docker 门槛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **CONFIRMED** |
| 阶段 | `0.0.0-cgf.1.1a` 独立 QA 后 |
| 主题 | CGF-1.1A 先条件通过，随后以真实 Testcontainers 补充验证关闭环境门槛 |
| 依据 | Claude Code 独立 QA：P0/P1/P2=0、P3=1；用户明确选择保留 Docker/Testcontainers 门槛 |
| 正式文档 | [CGF-1.1 开发计划](./CGF-1.1-DEVELOPMENT-PLAN.md)、[CGF-1.1A QA](../development/qa/0.0.0-cgf.1.1a-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 1. 已接受的工程结论

```text
Node/Desktop：56 files / 404 tests PASS
Java：22 tests / 0 failures
Maven online/offline：BUILD SUCCESS
PostgreSQL 16 Embedded：3 tests PASS
P0/P1/P2：0
P3：1（Docker/Testcontainers skipped）
```

CGF-1.1A 的代码、Migration、typed Port、JDBC/InMemory Conformance、schema
preflight、事务和安全边界不返工、不回滚。

## 2. 用户最终处置

Claude Code 原始 QA 报告保留 `PASS` 和其 `UNBLOCKED` 建议，不回写独立报告。
RoboThree 正式治理状态以用户决定为准：

```text
CGF-1.1A：PASS_WITH_P3_ENV
P3-CGF-DOCKER-001：OPEN
CGF-1.1B：GATED
```

## 3. 唯一补充门槛

必须在 Docker 可用环境实际执行
`PostgreSqlCentralPersistenceIntegrationTest`，使用
`postgres:16-alpine`，且：

- Testcontainers 测试不得 skipped；
- migration、Repository Conformance、typed conflict 和 schema preflight
  全部通过；
- 每测试使用独立容器/数据库，不共享脏状态；
- 追加独立 evidence 和 P3 关闭记录。

补充验证不要求重做 CGF-1.1A 开发、架构评审或完整独立 QA。只有证据通过并关闭
P3-CGF-DOCKER-001，CGF-1.1B 才可提交解锁。Claude 原报告使用
`P3-ENV-001`；正式治理重编号是为了避免与历史上已经关闭的 Node 环境问题重名。

## 4. Docker 补充验证与最终状态

Docker Desktop/Engine 安装后，Claude Code 首次验证和 Codex 现场复跑均确认：

```text
check:central：22 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS
check:central:offline：22 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS
PostgreSqlCentralPersistenceIntegrationTest：实际执行 PASS
postgres:16-alpine：实际启动
```

最终状态：

```text
P3-CGF-DOCKER-001：CLOSED
CGF-1.1A：PASS
CGF-1.1B：READY_FOR_USER_UNLOCK
```

补充记录：
[CGF-1.1A Docker/Testcontainers 补充验证](../development/qa/0.0.0-cgf.1.1a-docker-supplement.md)。
该状态不自动授权 1.1B 编码，仍等待用户明确确认。

---

# KN-033：接受 CGF-1.1A 正式 PASS 并解锁 CGF-1.1B

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **CONFIRMED** |
| 阶段 | `P3-CGF-DOCKER-001` 关闭后 |
| 主题 | CGF-1.1A 正式关闭；进入 Identity、Challenge、Proof 与 Device Trust |
| 依据 | Central online/offline 均为 22 tests / 0 failures / 0 skipped；用户明确接受并授权 |
| 正式文档 | [CGF-1.1 开发计划](./CGF-1.1-DEVELOPMENT-PLAN.md)、[Docker 补充验证](../development/qa/0.0.0-cgf.1.1a-docker-supplement.md) |

## 1. 阶段状态

```text
CGF-1.1A：PASS / CLOSED
P3-CGF-DOCKER-001：CLOSED
CGF-1.1B：AUTHORIZED
CGF-1.1C～1.1D：GATED
```

## 2. CGF-1.1B 允许范围

- Fake OA 产生短期 verified identity context；
- Device Challenge 创建、持久化和单次消费；
- `ROBOTHREE_DEVICE_PROOF_V1` canonical 签名字节和 ES256 验证；
- `EnterpriseDeviceTrustProvider`；
- 可选 Manual Device Enrollment；
- Challenge/Enrollment 显式事务、并发与幂等；
- 七个 device/challenge typed error；
- 正式 challenge/enrollment HTTP Route；
- 过期、重放、撤销、签名非法、上下文漂移和重启测试。

## 3. 继续禁止

本节点不授权 Token Issuer、Token Route、Permission/Compatibility 组合、
Configuration Read、ETag、Model/Tool Gateway、真实 OA/MDM/证书或生产
Device Signer。CGF-1.1B 独立 QA 无 P0/P1 且用户接受前，CGF-1.1C 保持关闭。

---

# KN-034：CGF-1.1B 开发者自测完成并提交独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-cgf.1.1b` |
| 主题 | Enterprise Identity、Challenge/Proof、Device Trust 与 Manual Enrollment |
| 依据 | Node/Desktop 全量回归、Central online/offline、Docker/Embedded PostgreSQL 均通过 |
| 正式文档 | [CGF-1.1 开发计划](./CGF-1.1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 1. 已实现

- Fake OA 结果生成短期 Verified Enterprise Identity，OA 原始材料不持久化；
- Device Challenge 使用安全 nonce、绝对 TTL、精确上下文绑定和单次消费；
- `ROBOTHREE_DEVICE_PROOF_V1` canonical 字节与 ES256/SPKI DER 验证；
- `EnterpriseDeviceTrustProvider` 对 unmanaged、non-compliant、revoked/disabled
  失败关闭，`deviceKeyId` 本身不能建立信任；
- 可选 Manual Enrollment 要求 OA Identity、IT Grant、Device Proof 三者同时成立；
- enrollment 同 request digest 幂等，不同 digest 返回 replay conflict；
- V5 只做向前 migration，不改写 CGF-1.1A 已验收的 V1～V4；
- 正式 challenge/enrollment Route 使用 strict JSON、统一 typed Error Envelope
  和 `Cache-Control: no-store`。

## 2. 自测结论

```text
pnpm run check：
56 files / 404 tests PASS
Core smoke：ready
Desktop smoke：ready / fixtureOnly=true

check:central：
34 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS

check:central:offline：
34 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS

PostgreSQL：
Testcontainers postgres:16-alpine PASS
PostgreSQL 16 Embedded PASS
```

## 3. 阶段门槛

```text
CGF-1.1B：READY_FOR_INDEPENDENT_QA
CGF-1.1C～1.1D：GATED
```

本节点不是 CGF-1.1B 的正式 `PASS`。Claude Code 必须独立重跑完整门禁并确认
无 P0/P1；用户接受独立 QA 后，CGF-1.1C 才可解锁。

---

# KN-035：接受 CGF-1.1B PASS 并解锁 CGF-1.1C

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **CONFIRMED** |
| 阶段 | `0.0.0-cgf.1.1c` |
| 主题 | Token Issuer、固定 Permission、Compatibility 与 Configuration Read |
| 依据 | CGF-1.1B 独立 QA：Node 56/404；Java online/offline 34/0/0；P0/P1/P2/P3 全为 0 |
| 正式文档 | [CGF-1.1B QA](../development/qa/0.0.0-cgf.1.1b-claude-qa.md)、[CGF-1.1 开发计划](./CGF-1.1-DEVELOPMENT-PLAN.md) |

## 阶段状态

```text
CGF-1.1A：PASS / CLOSED
CGF-1.1B：PASS / CLOSED
CGF-1.1C：AUTHORIZED
CGF-1.1D：GATED
```

CGF-1.1C 只允许实现四因素 Token 签发与验证、固定 Permission、
Compatibility evaluator、JWS Codec Port/Fake、受保护 Configuration Read、
ETag/304 和 trusted seed 引用完整性。真实 OA/MDM/证书/OS Signer、
Model/Tool Gateway、配置写 API和 CGF-1.1D 恢复矩阵继续禁止。

---

# KN-036：CGF-1.1C 开发者自测完成并提交独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-cgf.1.1c` |
| 主题 | 四因素 Token、固定 Permission/Compatibility 与 Configuration Read |
| 依据 | Node/Desktop、Central online/offline、Docker/Embedded PostgreSQL 完整自测 |
| 正式文档 | [CGF-1.1 开发计划](./CGF-1.1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 1. 已实现

- `Identity ∩ Device Trust ∩ Permission ∩ Compatibility` 四因素 Token 签发，
  事务内锁定 Challenge 并重检身份、设备、权限和 Compatibility revision；
- Token 候选只在事务提交后返回，数据库只保存 digest 和 Claims 绑定事实；
- typed JWS Codec Port、Test Fake、issuer/audience/time/issuance 校验；
- 受 `configuration.read` 保护的配置读取、稳定 quoted ETag 与无正文 304；
- Snapshot、Package、文件 content digest 和 Agent/Skill Package reference
  完整性验证，trusted seed 缺引用时整笔回滚；
- 正式 Token、Compatibility、Configuration Route 按模块分离并保持 strict/no-store。

## 2. 自测结论

```text
pnpm run check：
56 files / 404 tests PASS
Core smoke：ready
Desktop smoke：ready / fixtureOnly=true

check:central：
48 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS

check:central:offline：
48 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS

PostgreSQL：
Testcontainers postgres:16-alpine PASS
PostgreSQL 16 Embedded PASS
```

## 3. 阶段门槛

```text
CGF-1.1C：READY_FOR_INDEPENDENT_QA
CGF-1.1D：GATED
```

本节点不是 CGF-1.1C 的正式 `PASS`。Claude Code 必须独立重跑完整门禁并确认
无 P0/P1；用户接受独立 QA 后，CGF-1.1D 才可解锁。

---

# KN-037：接受 CGF-1.1C PASS 并解锁 CGF-1.1D

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **CONFIRMED** |
| 阶段 | `0.0.0-cgf.1.1d` |
| 主题 | PostgreSQL 全链恢复矩阵与 CGF-1.1 阶段收口 |
| 依据 | CGF-1.1C 独立 QA：Node 56/404；Java online/offline 48/0/0；P0/P1/P2/P3 全为 0 |
| 正式文档 | [CGF-1.1C QA](../development/qa/0.0.0-cgf.1.1c-claude-qa.md)、[CGF-1.1 开发计划](./CGF-1.1-DEVELOPMENT-PLAN.md) |

## 阶段状态

```text
CGF-1.1A：PASS / CLOSED
CGF-1.1B：PASS / CLOSED
CGF-1.1C：PASS / CLOSED
CGF-1.1D：AUTHORIZED
```

CGF-1.1D 只允许实现真实 PostgreSQL
`Identity → Challenge → Proof → Token → Configuration` 全链、命名故障点、
close/reopen、并发/超时/有界资源与安全扫描矩阵，以及阶段文档和独立 QA 收口。
真实 OA/MDM、生产 Device Signer/Secret Store、Model/Tool Gateway、配置写 API
和 Runtime Activation 继续禁止。

---

# KN-038：CGF-1.1D 开发者自测完成并提交独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-cgf.1.1d` |
| 主题 | PostgreSQL 全链恢复矩阵与 CGF-1.1 阶段收口 |
| 依据 | Node/Desktop、Central online/offline、Docker/Embedded PostgreSQL 完整自测 |
| 正式文档 | [CGF-1.1 开发计划](./CGF-1.1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 1. 已实现

- 同一恢复 Harness 在 Docker `postgres:16-alpine` 与 PostgreSQL 16 Embedded
  执行完整
  `Fake OA Identity → Enrollment Challenge/Proof → Device → Token Challenge/Proof → Token → Configuration`
  链路；
- 7 个命名故障点覆盖 Identity、Enrollment Challenge、Device Enrollment、
  Token Challenge、Token commit 前、Token commit 后响应丢失和 Configuration
  seed 后的 runtime rebuild；
- Token commit 前故障回滚 Challenge 消费和 issuance；commit 后响应丢失保留
  持久事实、拒绝重放并要求新 Challenge；
- 32 次有界并发只有一个 Token issuance 成功；Challenge 相等到期边界在重启后
  失败关闭；
- 数据库断言 OA 原始材料、Enrollment Code 和两个 Bearer Token 明文均为
  0 命中；测试日志/Fixture 未发现 compact Token；
- 未修改 Enterprise Gateway canonical Contract、V1～V5 Migration 或任何生产
  身份/配置语义，命名故障 Hook 只存在于测试代码。

## 2. 自测结论

```text
pnpm run check：
56 files / 404 tests PASS
Core smoke：ready
Desktop smoke：ready / fixtureOnly=true

check:central：
50 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS

check:central:offline：
50 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS

PostgreSQL：
Testcontainers postgres:16-alpine PASS
PostgreSQL 16 Embedded PASS
```

## 3. 阶段门槛

```text
CGF-1.1D：READY_FOR_INDEPENDENT_QA
CGF-1.1：OPEN
CGF-1.2：GATED
```

本节点不是 CGF-1.1D 的正式 `PASS`，也不关闭 CGF-1.1。Claude Code 必须独立
重跑完整门禁和恢复矩阵并确认无 P0/P1；用户接受独立 QA 后才能关闭 CGF-1.1
并决定是否进入 CGF-1.2。

---

# KN-039：接受 CGF-1.1D PASS 并关闭 CGF-1.1

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **CONFIRMED / CLOSED** |
| 阶段 | `0.0.0-cgf.1.1d` |
| 主题 | CGF-1.1 Identity 与 Configuration Read Foundation 阶段关闭 |
| 依据 | CGF-1.1D 独立 QA：14/14 范围覆盖；Node 56/404；Java online/offline 50/0/0；P0/P1/P2/P3 全为 0 |
| 正式文档 | [CGF-1.1D QA](../development/qa/0.0.0-cgf.1.1d-claude-qa.md)、[CGF-1.1 开发计划](./CGF-1.1-DEVELOPMENT-PLAN.md) |

## 阶段结论

```text
CGF-1.1A：PASS / CLOSED
CGF-1.1B：PASS / CLOSED
CGF-1.1C：PASS / CLOSED
CGF-1.1D：PASS / CLOSED
CGF-1.1：PASS / CLOSED
CGF-1.2：GATED
```

用户正式接受 CGF-1.1D 独立 QA 结论。CGF-1.1 已完成 PostgreSQL/Flyway、
Fake OA Identity、Device Challenge/Proof、Managed Device Trust、可选 Manual
Enrollment、固定 Permission、Compatibility、短期 Token、不可变 Configuration
Read 和全链恢复矩阵。

本节点不代表企业试点已具备生产身份条件，也不授权下一阶段。真实 OA/MDM、
生产 Device Signer/Secret Store 仍是企业试点前置项；CGF-1.2 必须先提交方案、
完成评审并取得用户明确授权。

---

# KN-040：确认 CGF-1.2 指定修订并授权进入 CGF-1.2A

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **CONFIRMED_WITH_SPECIFIED_REVISIONS** |
| 阶段 | `CGF-1.2` |
| 主题 | Local Core 企业配置物化、Storage Activation 与状态 Projection |
| 依据 | 用户接受 CGF-1.2 §14 十项冻结及 P1/P2/P3 指定修订 |
| 正式文档 | [CGF-1.2 开发计划](./CGF-1.2-DEVELOPMENT-PLAN.md)、[Enterprise Gateway Contract](./contracts/ENTERPRISE-GATEWAY-CONTRACT-v1alpha1.md)、[Desktop Local v1alpha2 Proposal](./contracts/DESKTOP-LOCAL-RUNTIME-CONTRACT-v1alpha2-PROPOSAL.md) |

## 冻结结论

- CGF-1.2 只完成 Configuration Storage Activation，Runtime Registry Activation
  留在 CGF-1.3；
- 新建 Local `EnterpriseAccessTokenProvider` 语义 Port，但复用 ADR-014 的
  Identity/Credential/Device Signer 链；每请求检查 Token，只允许一次有界同
  scope 重新签发；
- Materialized Configuration 保持不可变，Activation Status 从 storage/runtime
  pointer 和 failure facts 派生；`pendingRuntimeActivation` 不是第二事实源；
- Desktop configuration status 使用明确的 Local Runtime Contract `v1alpha2`
  proposal，不静默修改 `v1alpha1` strict union；
- Local enterprise configuration 使用独立 `enterprise-configuration.sqlite`、
  独立连接、migration registry 和 schema preflight；
- Package 下载并发参数属于 Core bootstrap 注入的内部 Alpha 配置，不进入企业
  Contract 或 Snapshot；
- 记录 MVP 离线语义修订项，CGF-1.2 代码按 ADR-014 严格企业会话门槛执行；
- 工程工作量为 6～9 engineer-days，PM 日历窗口为 8～12 business days。

## 阶段门槛

```text
CGF-1.2：CONFIRMED_WITH_SPECIFIED_REVISIONS
CGF-1.2A：AUTHORIZED / NOT_STARTED
CGF-1.2B：GATED by CGF-1.2A independent QA PASS
CGF-1.2C：GATED by CGF-1.2B independent QA PASS
CGF-1.3：GATED，等待独立方案与用户授权
```

本节点使用创建时 `KEY-NODES.md` 的下一个可用编号 `KN-040`。未来 CGF-1.2
关闭时重新检查下一个可用编号，不预留、不回写已有节点。

---

# KN-041：接受 CGF-1.2A PASS 并解锁 CGF-1.2B

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-25 |
| 状态 | **CONFIRMED / CGF-1.2A CLOSED / CGF-1.2B AUTHORIZED** |
| 阶段 | `0.0.0-cgf.1.2b` |
| 主题 | Local Core 企业配置 strict consumer、物化与 Storage Activation |
| 依据 | CGF-1.2A 独立 QA 全部门禁通过，用户明确接受并授权进入 CGF-1.2B |
| 正式文档 | [CGF-1.2 开发计划](./CGF-1.2-DEVELOPMENT-PLAN.md)、[CGF-1.2A QA](../development/qa/0.0.0-cgf.1.2a-claude-qa.md) |

## 阶段结论

```text
CGF-1.2A：PASS / CLOSED
CGF-1.2B：AUTHORIZED
CGF-1.2C：GATED by CGF-1.2B independent QA PASS + user acceptance
CGF-1.3：GATED，等待独立方案与用户授权
```

CGF-1.2B 的范围只包括：

- TypeScript strict consumer、Validator 与确定性 Package Materializer；
- `EnterpriseConfigurationPersistence` 语义 Port；
- InMemory/SQLite 相同 Conformance；
- 独立 `enterprise-configuration.sqlite`、独立 migration registry 和 preflight；
- candidate stage/seal、scope 隔离、CAS active/previous pointer、状态事件；
- 激活提交后响应丢失、重启和较新/缺损 schema 的失败关闭。

本节点不授权 Enterprise Gateway HTTP Client、Java↔Node E2E、Runtime Registry
Activation、受控重启、Desktop UI、真实 OA/MDM 或企业 Model/Tool Gateway。

---

# KN-042：接受 CGF-1.2B PASS 并解锁 CGF-1.2C

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **CONFIRMED / CGF-1.2B CLOSED / CGF-1.2C AUTHORIZED** |
| 阶段 | `0.0.0-cgf.1.2c` |
| 主题 | 企业配置正式 HTTP Client、Java↔Node↔SQLite E2E 与恢复矩阵 |
| 依据 | CGF-1.2B 独立 QA 以 Node 64 files / 440 tests、Central online/offline 各 53 tests、P0/P1/P2/P3 均为 0 通过；两个 Agent 均确认无补充问题，用户明确接受并授权进入 CGF-1.2C |
| 正式文档 | [CGF-1.2 开发计划](./CGF-1.2-DEVELOPMENT-PLAN.md)、[CGF-1.2B QA](../development/qa/0.0.0-cgf.1.2b-claude-qa.md) |

## 阶段结论

```text
CGF-1.2A：PASS / CLOSED
CGF-1.2B：PASS / CLOSED
CGF-1.2C：AUTHORIZED
CGF-1.3：GATED，等待 CGF-1.2C 独立 QA、用户接受及后续方案授权
```

CGF-1.2C 只允许完成：

- `EnterpriseConfigurationClient` 类型化 Port 与正式 HTTP Adapter；
- 短期 Access Token Session、同 Origin、手动 Redirect、超时、取消和响应上限；
- ETag/304 完整本地校验与缺损修复；
- 同 scope 串行、不同 scope 隔离及 1/4 有界 Package 并发；
- `enterprise-config-V2` 前向 migration 和安全同步事实；
- Java Central test-profile 真实 Token 链 → Node Core → 独立 SQLite 的随机
  loopback E2E；
- 部分 stage、commit 后响应丢失、Central 切换、offline、close/reopen 等
  故障恢复矩阵。

本节点不授权 Runtime Registry Activation、受控 Core restart、Desktop UI、
真实 OA/MDM、企业 Model/Tool Gateway、自动 GC 或 CGF-1.3 实现。

---

# KN-043：CGF-1.2C 开发者自测完成并提交独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-cgf.1.2c` |
| 主题 | Enterprise Configuration HTTP、同步恢复与跨语言 E2E 收口 |
| 正式文档 | [Development Log](../development/DEVELOPMENT-LOG.md)、[CGF-1.2 开发计划](./CGF-1.2-DEVELOPMENT-PLAN.md)、[AR-031](./UPSTREAM-ADOPTION-REGISTER.md) |

## 开发者结论

```text
Architecture boundary：PASS
Node/Desktop：66 files / 458 tests PASS
Central online：53 tests / 0 failures / 0 errors / 0 skipped
Central offline：53 tests / 0 failures / 0 errors / 0 skipped
Java Central Token → Node Core → SQLite E2E：1 test PASS
P0/P1：开发者自测未发现
```

CGF-1.2C 已实现正式类型化 HTTP Client、可信 Origin 与有界传输、ETag/304
修复、同 scope 单写者、有界 Package 并发、部分 stage 恢复、
`enterprise-config-V2` 同步事实和 Java↔Node↔SQLite close/reopen E2E。

当前只提交 Claude Code 独立 QA。CGF-1.2C 独立 QA `PASS` 并经用户明确接受前，
CGF-1.2 不关闭，CGF-1.3 不解锁。本节点不授权 Runtime Registry Activation、
受控 Core restart、Desktop UI、真实 OA/MDM 或 Model/Tool Gateway。

---

# KN-044：接受 CGF-1.2C 与 repair.1 PASS 并关闭 CGF-1.2

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **CONFIRMED / CGF-1.2 CLOSED / CGF-1.3 GATED** |
| 阶段 | `0.0.0-cgf.1.2c`、`0.0.0-cgf.1.2c-repair.1` |
| 主题 | Enterprise Configuration Storage Activation 阶段正式收口 |
| 依据 | CGF-1.2C 独立 QA：66 files / 458 tests、Central online/offline 各 53 tests、Java↔Node↔SQLite E2E PASS、P0/P1/P2/P3=0；repair.1 独立 QA：67 files / 473 tests、维护专项 15 tests、Central offline 53 tests、P0/P1/P2/P3=0；用户明确接受两份结论 |
| 正式文档 | [CGF-1.2C QA](../development/qa/0.0.0-cgf.1.2c-claude-qa.md)、[repair.1 QA](../development/qa/0.0.0-cgf.1.2c-repair.1-claude-qa.md)、[CGF-1.2 开发计划](./CGF-1.2-DEVELOPMENT-PLAN.md) |

## 正式结论

```text
CGF-1.2A：PASS / CLOSED
CGF-1.2B：PASS / CLOSED
CGF-1.2C：PASS / CLOSED
0.0.0-cgf.1.2c-repair.1：PASS / CLOSED
CGF-1.2：CLOSED
CGF-1.3：GATED，等待方案确认和明确授权
```

CGF-1.2 已经形成从受保护 Enterprise Gateway 到 Local Core 最近成功配置的完整
Storage Activation 基线：

- exact Snapshot/Package Read 与短期企业 Token；
- strict validation、immutable materialization、stage/seal 和 CAS activation；
- 独立 `enterprise-configuration.sqlite`、V1/V2 migration 与 active/previous；
- 可信 Origin、有界 HTTP、ETag/304 修复、离线保留旧 active；
- 同 scope 单写者、有界 Package 并发和崩溃恢复；
- Java Token 链 → Node Core → SQLite close/reopen 的真实跨语言 E2E。

QA 报告中 response-too-large、protocol-invalid、手动超时实现和无条件 304
错误码的文字已按实际代码修正，不影响验收结论。

本节点明确不授权 CGF-1.3。Runtime Registry Activation、受控 Core restart、
Task/Lock 引用安全、自动 GC、Desktop 企业配置 UI 及后续企业运行能力，均须
先形成 CGF-1.3 方案并由用户明确接受。

---

# KN-045：授权 DCF-1.1A 并完成开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **AUTHORIZED / IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.1.1a` |
| 主题 | WorkspaceGrant、Session 元数据、Conversation Projection 与简化恢复矩阵 |
| 依据 | DCF-1.1/CGF-1.3 最终文档复核 P0=0、P1=0；用户明确授权 DCF-1.1A 并要求 CGF-1.3 继续 GATED |
| 正式文档 | [DCF-1.1 开发计划](./DCF-1.1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-032](./UPSTREAM-ADOPTION-REGISTER.md) |

## 阶段结论

```text
DCF-1.1A：IMPLEMENTED / DEVELOPER PASS / READY_FOR_INDEPENDENT_QA
DCF-1.1B：GATED
DCF-1.1C：GATED
CGF-1.3：GATED
```

本批复用 KAF-5 Conversation，不建立第二套对话系统；WorkspaceGrant 只接受
受信 selection handle 的 realpath 结果，Session title/revision/tombstone 独立
持久化。跨 SessionHead/metadata 两事务通过持久 create intent 锁定 command
digest，并以 Receipt、SQLite close/reopen 和命名故障点验证响应丢失恢复。

本节点不授权 Runtime Selection、SubmitTurn、Desktop Delivery、Electron UI 或
CGF-1.3。只有 Claude Code 独立 QA `PASS` 且用户明确接受后，DCF-1.1B 才可进入。

---

# KN-046：接受 DCF-1.1A PASS 并解锁 DCF-1.1B

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **CONFIRMED / DCF-1.1A CLOSED / DCF-1.1B AUTHORIZED** |
| 阶段 | `0.0.0-dcf.1.1b` |
| 主题 | Agent/Model 确定性 Runtime Selection 与 Capability Lock |
| 依据 | DCF-1.1A 独立 QA：69 files / 485 tests、专项 3 files / 15 tests、P0/P1/P2/P3=0；用户明确接受并授权进入 DCF-1.1B |
| 正式文档 | [DCF-1.1 开发计划](./DCF-1.1-DEVELOPMENT-PLAN.md)、[DCF-1.1A QA](../development/qa/0.0.0-dcf.1.1a-claude-qa.md) |

## 阶段边界

```text
DCF-1.1A：PASS / CLOSED
DCF-1.1B：AUTHORIZED
DCF-1.1C：GATED
CGF-1.3：GATED
```

DCF-1.1B 只允许实现受信 Agent/Model Repository、纯确定性
ModelEligibilityEvaluator、Agent/Model Projection、TaskRuntimeSelection、
Model/Tool TaskCapabilityLock 和 Skill/Knowledge/Workspace 精确引用及恢复。

本节点不授权 SubmitTurnCoordinator、DesktopDeliveryRecord、Electron UI、
真实 Model Provider、自动模型路由、运行中 fallback 或 CGF-1.3。

---

# KN-047：DCF-1.1B 开发者自测完成并提交独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **IMPLEMENTED / DEVELOPER PASS / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.1.1b` |
| 主题 | Agent/Model 确定性 Runtime Selection、精确 Capability Lock 与恢复 |
| 依据 | KN-046 用户授权；ADR-008/011；完整门禁 71 files / 495 tests；P0/P1 开发者自测未发现 |
| 正式文档 | [DCF-1.1 开发计划](./DCF-1.1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-033](./UPSTREAM-ADOPTION-REGISTER.md) |

## 开发者结论

```text
DCF-1.1A：PASS / CLOSED
DCF-1.1B：IMPLEMENTED / DEVELOPER PASS / READY_FOR_INDEPENDENT_QA
DCF-1.1C：GATED
CGF-1.3：GATED
Architecture boundary：PASS
Node/Desktop：71 files / 495 tests PASS
Core smoke：core.ready
Desktop smoke：ready / fixtureOnly=true
```

DCF-1.1B 已形成受信 Agent/Model Repository、纯确定性 Eligibility、默认模型与
显式覆盖、TaskRuntimeSelection、Model/Tool 精确 Lock、Skill/Knowledge/
Workspace 引用、稳定摘要、安全 Projection，以及 Memory/SQLite close/reopen
恢复基线。缺失或漂移的 Lock、Agent materialized reference、Registry revision
或 WorkspaceGrant 均失败关闭。

本节点只提交 Claude Code 独立 QA，不解锁 DCF-1.1C。Task/Selection/Locks/
userMessageId 原子 bundle、SubmitTurn 双领域协调、durable delivery、commit 后
Agent Loop 启动、Electron UI、真实 Model Provider 和 CGF-1.3 仍未获授权。

---

# KN-048：接受 DCF-1.1B PASS 并解锁 DCF-1.1C

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **CONFIRMED / DCF-1.1B CLOSED / DCF-1.1C AUTHORIZED** |
| 阶段 | `0.0.0-dcf.1.1c` |
| 主题 | SubmitTurn 双领域持久协调与 Headless E2E |
| 依据 | DCF-1.1B 独立 QA：71 files / 495 tests、专项 2 files / 10 tests、P0/P1/P2/P3=0；用户明确接受并授权进入 DCF-1.1C |
| 正式文档 | [DCF-1.1 开发计划](./DCF-1.1-DEVELOPMENT-PLAN.md)、[DCF-1.1B QA](../development/qa/0.0.0-dcf.1.1b-claude-qa.md)、[ADR-012](../adr/012-submit-turn-coordination.md) |

## 阶段边界

```text
DCF-1.1A：PASS / CLOSED
DCF-1.1B：PASS / CLOSED
DCF-1.1C：AUTHORIZED
CGF-1.3：GATED
```

DCF-1.1C 只允许实现 SubmitTurnRecord/Receipt、幂等用户 Message、Task +
Selection + Locks + userMessageId 原子 Task bundle、DesktopDeliveryRecord、
commit 后 Agent Loop starter、有界恢复扫描、最小 Headless Command/Query 和
ADR-012 六场景 close/reopen Harness。

本节点不授权 Electron UI、真实 Model Provider、通用 Saga/Workflow Engine、
长期 Memory、自动模型路由、CGF-1.3 或 Central Service 修改。

---

# KN-049：DCF-1.1C 开发者自测完成并提交独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **IMPLEMENTED / DEVELOPER PASS / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.1.1c` |
| 主题 | SubmitTurn 双领域持久协调、durable delivery 与 Headless E2E |
| 依据 | KN-048 用户授权；ADR-012；专项 3 files / 17 tests、SQLite/Task 回归 7 files / 66 tests、完整门禁 74 files / 512 tests |
| 正式文档 | [DCF-1.1 开发计划](./DCF-1.1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-034](./UPSTREAM-ADOPTION-REGISTER.md) |

## 开发者结论

```text
DCF-1.1A：PASS / CLOSED
DCF-1.1B：PASS / CLOSED
DCF-1.1C：IMPLEMENTED / DEVELOPER PASS / READY_FOR_INDEPENDENT_QA
CGF-1.3：GATED
Architecture boundary：PASS
Node/Desktop：74 files / 512 tests PASS
Core smoke：core.ready
Desktop smoke：ready / fixtureOnly=true
```

DCF-1.1C 已形成 stable SubmitTurn command、Session-owned Message intent、
Task/Selection/Locks/userMessageId 原子 bundle、durable Receipt/Delivery、
commit 后 Agent Loop starter、有界 Scheduler recovery 和最小 Headless
Command/Query。Memory/SQLite 使用同一语义；7 个命名中断点均以真实 SQLite
close/reopen 收敛到一条 Message、一份 Task bundle、一份 Delivery 和一次逻辑
Loop start。

旧 `conversation_messages.task_id → task_heads` 跨领域外键已通过 migration 9
前向移除，因为 ADR-012 固定 Message 先于 Task 提交；跨领域相关性改由
SubmitTurnRecord 和原子 Task bundle 的 exact ID/digest 校验负责，不合并 Session
与 Task 所有权。

本节点只提交 Claude Code 独立 QA，不关闭 DCF-1.1C。Electron UI、真实 Model、
Skill Runtime、通用 Saga/Workflow Engine 和 CGF-1.3 仍未获授权。

---

# KN-050：接受 DCF-1.1C PASS 并关闭 DCF-1.1

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **CONFIRMED / DCF-1.1C CLOSED / DCF-1.1 CLOSED** |
| 阶段 | `0.0.0-dcf.1.1c` |
| 主题 | 接受 SubmitTurn 持久协调独立 QA 并关闭 DCF-1.1 |
| 依据 | 独立 QA：74 files / 512 tests、SubmitTurn 专项 3 files / 17 tests、16/16 范围覆盖、P0/P1/P2/P3=0；用户明确接受 |
| 正式文档 | [DCF-1.1C QA](../development/qa/0.0.0-dcf.1.1c-claude-qa.md)、[DCF-1.1 开发计划](./DCF-1.1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 阶段边界

```text
DCF-1.1A：PASS / CLOSED
DCF-1.1B：PASS / CLOSED
DCF-1.1C：PASS / CLOSED
DCF-1.1：CLOSED
CGF-1.3：GATED
```

DCF-1.1 已建立 Workspace/Session/Conversation、Agent/Model 确定性 Selection、
精确 Capability Lock、SubmitTurn 双领域协调、Task 原子 bundle、durable
Receipt/Delivery、commit 后 Loop starter、有界恢复和 Headless E2E 基线。

本节点不授权 CGF-1.3、DCF-1.2、Electron UI、真实 Model Provider、Skill
Runtime 或其他新阶段编码。CGF-1.3 继续等待方案确认和用户明确授权。

---

# KN-051：确认 DCF-1.2 指定修订并解锁 DCF-1.2A

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **CONFIRMED_WITH_SPECIFIED_REVISIONS / DCF-1.2A UNBLOCKED** |
| 阶段 | `DCF-1.2` 方案确认；下一开发版本 `0.0.0-dcf.1.2a` |
| 主题 | Desktop Bridge、Application Facade、类型化 Delivery 与最小工作台 |
| 依据 | 用户接受 DCF-1.2 A/B/C 拆分、四项 P0、Claude Code P1×2/P2×3/P3×2 和 MiniMax PM 补充，并明确允许完成文档同步后进入 DCF-1.2A |
| 正式文档 | [DCF-1.2 开发计划](./DCF-1.2-DEVELOPMENT-PLAN.md)、[Desktop Local Runtime Contract v1alpha1](./contracts/DESKTOP-LOCAL-RUNTIME-CONTRACT-v1alpha1.md)、[DCF-1 Contract/Threat Model](./DCF-1-CONTRACT-THREAT-MODEL-AND-CONFORMANCE-PLAN.md) |

## 冻结边界

四项 P0 正式冻结：

1. `AgentLoopStarter` 归 Local Core Application/Bootstrap，Task bundle 与 Receipt
   持久化后才以稳定身份启动现有 durable Agent Loop；
2. Durable Desktop Delivery 只通过类型化、安全的 Projection/Delivery Port
   输出，不暴露 Kernel Event、Outbox、Effect、Receipt、Checkpoint、
   TaskCapabilityLock 或数据库结构；
3. Electron Main 是私有 loopback HTTP/SSE 的唯一客户端，每次启动使用短期令牌
   和单一认证 SSE，Renderer 不直连 Core；
4. Assistant delta 只属于 ephemeral；最终 Assistant Message 先持久化，再形成
   durable `message_committed`。

两个 P1 已形成最终方案：

- Application Facade 是唯一业务入口；`HeadlessDesktopRuntime` 只作为薄
  Headless/Test Adapter，与生产 HTTP/SSE Adapter 委托同一 Facade、运行同一
  Conformance Corpus，不进入正式 Electron 启动路径，也不绑定第二个 Agent Loop；
- `selectionHandle` 只存在于 Main↔Core 私有流程，TTL 不超过 30 秒、单次使用、
  取消/超时/重启失效，绑定 runtime/client/request；Renderer、Preload 返回值、
  SQLite、Event、Audit、日志和 URL 均不得取得真实 handle。

## 阶段门槛

```text
DCF-1.2：CONFIRMED_WITH_SPECIFIED_REVISIONS
DCF-1.2A：UNBLOCKED
DCF-1.2B：GATED
DCF-1.2C：GATED
DCF-1.3：GATED
CGF-1.3：GATED
```

DCF-1.2A 独立 QA `PASS` 且用户接受后才解锁 1.2B；1.2B 还必须完成用户现场
演示“选择 Workspace → 创建 Session → 选择 Agent/Model → submitTurn →
accepted → 持久 Snapshot”，独立 QA `PASS` 且用户接受后才解锁 1.2C；
1.2C 独立 QA `PASS` 且用户接受后才可关闭 DCF-1.2。

本节点只表示方案接受和 DCF-1.2A 获得开发授权，不表示 DCF-1.2 已完成，也不
授权 DCF-1.3、CGF-1.3、真实 Model、Credential、Skill Reader、Knowledge、
Task/Confirmation/Artifact UI、Admin、Multi-Agent、长期 Memory 或自动模型路由。

---

# KN-052：DCF-1.2A 开发者门禁通过并提交独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **IMPLEMENTED / DEVELOPER PASS / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.1.2a` |
| 主题 | Application Facade、正式 Core 私有 HTTP/SSE 与 Electron Main Client |
| 依据 | `pnpm run check`：77 files / 518 tests，架构边界、ESLint、TypeScript、Core smoke 与 Desktop fixture smoke 全部通过 |
| 正式文档 | [DCF-1.2 开发计划](./DCF-1.2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-035](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现边界

- `DesktopApplicationFacade` 是 Headless 与 HTTP/SSE Adapter 的唯一业务入口；
- Electron 正式启动路径使用受监督 Core 子进程，不再使用 DCF-0 Fixture；
- Main Client 通过随机 loopback 端口、短期 Bearer、严格 Host/Origin 和单一
  认证 SSE 访问 Core；
- `selectionHandle` 只在 Main↔Core 私有流程存活，TTL≤30 秒、单次使用、
  context 绑定、重启失效且不进入 SQLite、日志、Event、URL、Preload 或 Renderer；
- `DurableAgentLoopStarter` 校验已经持久化的 Task/Selection/Capability Lock，
  并复用既有 Context Pipeline 与 Agent Loop；重复启动不会重复提交 Assistant
  Message；
- 本批只使用确定性 Scripted Model 验证进程与持久链路，未接真实 Model 或
  Credential。

## 阶段门槛

```text
DCF-1.2A：READY_FOR_INDEPENDENT_QA
DCF-1.2B：GATED
DCF-1.2C：GATED
DCF-1.3：GATED
CGF-1.3：GATED
```

只有 Claude Code 独立 QA `PASS` 且用户明确接受，DCF-1.2A 才能转为
`PASS/CLOSED` 并解锁 DCF-1.2B。本节点不构成该接受，也不授权后续批次编码。

---

# KN-053：接受 DCF-1.2A 独立 QA 并解锁 DCF-1.2B

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **DCF-1.2A PASS/CLOSED / DCF-1.2B UNBLOCKED** |
| 阶段 | `0.0.0-dcf.1.2a` |
| 主题 | 接受正式 Desktop 私有桥接独立 QA |
| 依据 | 77 files / 518 tests、20/20 QA 覆盖、P0/P1/P2/P3=0；用户明确接受 |
| 正式文档 | [独立 QA 报告](../development/qa/0.0.0-dcf.1.2a-claude-qa.md)、[DCF-1.2 开发计划](./DCF-1.2-DEVELOPMENT-PLAN.md) |

用户正式接受 DCF-1.2A 独立 QA，关闭 1.2A，并授权进入 1.2B。该授权仅覆盖
Preload 白名单和最小 Vue 工作台；DCF-1.2C、DCF-1.3 与 CGF-1.3 继续
`GATED`。

---

# KN-054：DCF-1.2B 开发者门禁通过并提交独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **IMPLEMENTED / DEVELOPER PASS / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.1.2b` |
| 主题 | Preload 固定白名单与最小 Agent 工作台 |
| 依据 | `pnpm run check`：80 files / 525 tests；专项 4 files / 8 tests；架构边界、Renderer build、Core/Desktop smoke 全通过 |
| 正式文档 | [DCF-1.2 开发计划](./DCF-1.2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-036](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现边界

- Main 只注册固定业务 IPC，系统目录选择不离开 Main/Core 私有边界；
- Preload 输入和输出双重校验，不暴露 raw IPC 或 Core Transport；
- Renderer 只消费 Workspace、Session、Agent、Model、Message、Receipt 与
  Runtime Status Projection；
- 最小工作台已形成 Workspace → Session → Agent/Model → SubmitTurn →
  持久 Snapshot 自动化闭环；
- Renderer CSP 保持 `connect-src 'none'`，没有 Node、Electron、fetch、
  WebSocket 或 EventSource；
- streaming/reconnect/cursor reset 仍属于 DCF-1.2C。

## 下一门槛

```text
Claude Code 独立 QA PASS
＋
用户现场完成最小工作台演示
＋
用户明确接受
→ DCF-1.2B PASS/CLOSED
→ DCF-1.2C 才可解锁
```

本节点不是独立 QA，也不代表用户现场演示已经完成。CGF-1.3 继续 `GATED`。

---

# KN-055：确认先 DCF-1.3、后 CGF-1.3 的可靠性建设顺序

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **SEQUENCE CONFIRMED / DCF-1.3 PLAN PROPOSED / CODING GATED** |
| 阶段 | DCF-1.3 方案收口；CGF-1.3 继续 GATED |
| 主题 | 先建设 Desktop/Core Runtime Reliability，再进入企业 Runtime Activation |
| 依据 | DCF-1.2 已通过独立 QA 并由用户接受关闭；用户明确确认 DCF-1.3 → CGF-1.3 顺序 |
| 正式文档 | [DCF-1.3 开发计划](./DCF-1.3-DEVELOPMENT-PLAN.md)、[CGF-1.3 开发计划](./CGF-1.3-DEVELOPMENT-PLAN.md)、[企业离线语义修订项](../product/MVP-BASELINE-REVISION-ITEM-001-ENTERPRISE-OFFLINE-SEMANTICS.md) |

## 顺序与边界

```text
DCF-1.2：PASS / CLOSED
DCF-1.3：PLAN PROPOSED / CODING GATED
CGF-1.3：GATED
```

DCF-1.3 先完成 Desktop/Core restart/recovery、SSE reconnect、slow consumer、
resource cleanup、`runtimeInstanceId` 生命周期和 30～60 分钟长稳 Harness。
它不实现企业 Registry Generation 或 Runtime Activation。

CGF-1.3 只有在以下条件全部成立后才可重新进入授权流程：

1. DCF-1.3 `PASS/CLOSED`；
2. 企业离线语义修订完成并由用户接受；
3. CGF-1.3 方案重新确认；
4. 用户明确授权 CGF-1.3A。

CGF-1.3 后续仍必须保持 Storage Activation 与 Runtime Activation 分离；新 Task
使用新 Registry Generation；已运行 Task 保持原 TaskRuntimeSelection 与
TaskCapabilityLock；配置变化不得影响正在执行的 Task。

本节点只确认顺序和建立 DCF-1.3 正式计划，不授权 DCF-1.3A 或 CGF-1.3 编码。

---

# KN-056：接受 DCF-1.3 指定修订并解锁 DCF-1.3A

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **CONFIRMED_WITH_SPECIFIED_REVISIONS / DCF-1.3A UNBLOCKED** |
| 阶段 | `DCF-1.3` 方案确认；下一开发版本 `0.0.0-dcf.1.3a` |
| 主题 | Desktop/Core Runtime Reliability 最终边界与首批授权 |
| 依据 | 用户接受 A/B/C 拆分，并冻结 lifecycle、failed 恢复、slow consumer、selectionHandle、Kernel、Harness、安全数据、压力、工期与 CGF 门槛十项指定修订 |
| 正式文档 | [DCF-1.3 开发计划](./DCF-1.3-DEVELOPMENT-PLAN.md)、[DCF-1 Contract/Threat Model](./DCF-1-CONTRACT-THREAT-MODEL-AND-CONFORMANCE-PLAN.md) |

## 冻结边界

- lifecycle 只允许 `stopped/starting/ready/restarting/stopping/failed`，不增加
  `recovering`；
- Alpha 自动 restart 最多一次，budget 耗尽进入 `failed`，只允许用户重启
  Desktop 恢复；
- slow consumer 只由 `response.write() === false` 后等待 `drain` 超过 30 秒
  触发，heartbeat 15 秒只负责 keep-alive；
- `EphemeralWorkspaceSelectionStore` TTL≤30 秒，resolve/cancel/Core stop/restart
  后清理，禁入 SQLite/Event/Audit/Renderer；
- DCF-1.3 不修改 Kernel reducer，KAF-2/3 既有语义不变；
- 独立 QA 必须实际运行 30 分钟 Harness，阶段关闭验证实际运行 60 分钟扩展
  Harness；
- Harness 报告只允许 count、digest、status、duration、resource metrics 和
  typed error code；
- DCF-1.3B 增加 dedupeSet 指标和 durable-only 测试；
- 工程工作量 6～9 集中工作日，PM 日历按 10～16 天登记 P2 Schedule Risk。

## 阶段门槛

```text
DCF-1.3：CONFIRMED_WITH_SPECIFIED_REVISIONS
DCF-1.3A：UNBLOCKED
DCF-1.3B：GATED
DCF-1.3C：GATED
CGF-1.3：GATED
```

CGF-1.3 进入条件保持四项交集：DCF-1.3 `PASS/CLOSED`、企业离线语义修订完成、
CGF-1.3 方案重新确认、用户明确授权 CGF-1.3A。DCF-1.3 不自动解锁 CGF-1.3。

---

# KN-057：DCF-1.3A 完成开发者实现并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.1.3a` |
| 主题 | Desktop/Core lifecycle、单次自动恢复与 Runtime Instance 失效边界 |
| 依据 | DCF-1.3 指定修订、开发者专项矩阵 5 files / 18 tests、完整门禁 86 files / 543 tests |
| 正式文档 | [DCF-1.3 开发计划](./DCF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-038](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现

- Core lifecycle 固定为 `stopped/starting/ready/restarting/stopping/failed`，
  不增加 `recovering`；
- 并发 start/stop/restart 通过单一操作串行，包含 ready 状态下 stop 尚未完成时
  收到新 start 的竞态；
- 启动前失败或 ready 后异常退出最多自动 restart 一次，额度耗尽后进入
  `failed`，不再自动重试；
- 受控 restart 不消耗自动恢复额度，新实例使用新 token、端口和
  `runtimeInstanceId`；
- 旧 Client/SSE、旧运行代投影和旧 `selectionHandle` 失败关闭；同一 SQLite
  中的持久 Session 在 close/reopen 后保持；
- `EphemeralWorkspaceSelectionStore` 在 resolve、cancel、Core stop/restart 后
  清理，不进入 SQLite、Event、Audit 或 Renderer；
- Renderer 只获得冻结的不可重试失败文案；有界诊断会脱敏本地路径和
  Bearer-like 内容；
- Kernel reducer 未修改，新增架构护栏防止 supervisor、selection store、
  runtime instance 和 restart budget 进入 Kernel。

## 当前门槛

```text
DCF-1.3A：IMPLEMENTED / READY_FOR_INDEPENDENT_QA
DCF-1.3B：GATED
DCF-1.3C：GATED
CGF-1.3：GATED
```

DCF-1.3A 必须由 Claude Code 独立复跑并由用户接受后才能关闭；本节点不授权
DCF-1.3B、DCF-1.3C 或 CGF-1.3。PM 周报及 PM 风险台账不属于本开发批次产物，
由 MiniMax 独立维护。

---

# KN-058：接受 DCF-1.3A 独立 QA 并授权 DCF-1.3B

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **DCF-1.3A PASS/CLOSED；DCF-1.3B AUTHORIZED** |
| 阶段 | `0.0.0-dcf.1.3a` 关闭；下一开发版本 `0.0.0-dcf.1.3b` |
| 主题 | 生命周期可靠性验收与 SSE 背压/资源清理批次解锁 |
| 依据 | Claude Code 独立 QA：86 files / 543 tests、专项 5 files / 18 tests、20/20、P0/P1/P2/P3=0；用户正式接受 |
| QA 报告 | [0.0.0-dcf.1.3a-claude-qa.md](../development/qa/0.0.0-dcf.1.3a-claude-qa.md) |

## 状态变化

```text
DCF-1.3A：PASS / CLOSED
DCF-1.3B：AUTHORIZED
DCF-1.3C：GATED
CGF-1.3：GATED
```

DCF-1.3B 只实现已确认的 SSE `response.write() === false` 背压、30 秒
slow-consumer、heartbeat 隔离、资源所有权、dedupeSet 指标、durable-only
与压力矩阵。该授权不包含 30/60 分钟长稳 Harness、企业 Runtime Activation
或 CGF-1.3。

---

# KN-059：DCF-1.3B 完成开发者实现并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-26 |
| 状态 | **IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.1.3b` |
| 主题 | 单一 Desktop SSE 背压、慢消费者、资源回收与压力矩阵 |
| 依据 | DCF-1.3B 专项 4 files / 18 tests、完整门禁 87 files / 554 tests |
| 正式文档 | [DCF-1.3 开发计划](./DCF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-039](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现

- 只有 `response.write() === false` 才进入 backpressure；durable flush 等待
  `drain`，30 秒未恢复才关闭当前慢连接；
- blocked 期间不建立应用级帧队列：durable 留在 SQLite，ephemeral delta
  丢弃，heartbeat 跳过且不推进 cursor；
- durable cursor 只在对应帧成功写入并恢复 drain 后推进；超时后由 Main
  Snapshot-first reconnect，最终 Assistant Message 仍以持久事实收敛；
- Core HTTP Adapter 显式计数 active server/SSE/poll timer/heartbeat timer/
  ephemeral subscription、cleanup 和 slow-consumer；
- Main dedupe Set 上限 2048，暴露内部
  `dedupeSetSize/maxDedupeSize/cleanupCount`，在 reset、运行代变化和 abort 时清理；
- durable-only 路径只验证 `message_committed` 与 `task_status_changed`；
- 自动压力覆盖 10,000 ephemeral、3,000 durable、100 Main reconnect、
  100 真实 SSE disconnect、25 Core restart、20 start-stop，以及慢消费者
  drain/timeout 各 20 轮；
- Transport metrics 未进入公共 Contract，Kernel reducer 和 KAF-2/3 语义未修改。

## 当前门槛

```text
DCF-1.3A：PASS / CLOSED
DCF-1.3B：IMPLEMENTED / READY_FOR_INDEPENDENT_QA
DCF-1.3C：GATED
CGF-1.3：GATED
```

DCF-1.3B 必须由 Claude Code 实际复跑完整压力矩阵并经用户接受后才能关闭。
本节点不授权 30/60 分钟长稳 Harness、DCF-1.3C 或 CGF-1.3。

---

# KN-060：接受 DCF-1.3B 独立 QA 并授权 DCF-1.3C

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-1.3B PASS/CLOSED；DCF-1.3C AUTHORIZED** |
| 阶段 | `0.0.0-dcf.1.3b` 关闭；下一开发版本 `0.0.0-dcf.1.3c` |
| 主题 | SSE 背压与资源矩阵验收、长稳阶段关闭批次解锁 |
| 依据 | Claude Code 独立 QA：87 files / 554 tests、专项 4 files / 18 tests、20/20、P0/P1/P2/P3=0；用户正式接受 |
| QA 报告 | [0.0.0-dcf.1.3b-claude-qa.md](../development/qa/0.0.0-dcf.1.3b-claude-qa.md) |

## 状态变化

```text
DCF-1.3A：PASS / CLOSED
DCF-1.3B：PASS / CLOSED
DCF-1.3C：AUTHORIZED
CGF-1.3：GATED
```

DCF-1.3C 只实现并实际执行已经冻结的压缩矩阵、30 分钟真实长稳 Harness、
60 分钟扩展 Harness、机器可读安全报告与阶段关闭证据。该授权不包含企业配置
Runtime Activation、Registry Generation 切换或 CGF-1.3。

---

# KN-061：DCF-1.3C 完成开发者长稳验证并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.1.3c` |
| 主题 | Desktop/Core 30/60 分钟真实长稳 Harness 与阶段关闭证据 |
| 依据 | 压缩真实 Harness 1/1、完整门禁 88 files / 555 tests、30 分钟 1,800,314ms PASS、60 分钟 3,600,326ms PASS |
| 正式文档 | [DCF-1.3 开发计划](./DCF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-040](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已完成

- 正式 CLI 只提供真实 `30m` 与 `60m` 两种长稳模式，普通 `pnpm run check`
  只运行约两秒的压缩真实矩阵；
- 长稳链路使用真实 Core 子进程、loopback SSE、SQLite、WorkspaceGrant、
  Session、SubmitTurn、持久 Message/Snapshot 与 close/reopen；
- 固定工作负载混合 reconnect、unknown cursor reset、controlled restart、
  graceful stop/start 和 production backpressure writer drain/timeout probe；
- 30 分钟运行完成 177 个回合、16 个唯一 runtime instance；60 分钟运行完成
  349 个回合、32 个唯一 runtime instance；两者错误码均为零；
- 两份报告最终 active child/controller/dedupe set 均为零，最终 RSS/heap 均低于
  峰值，无全程连续单调增长；
- 报告安全校验禁止正文、Token、Credential、私钥引用和完整本地路径；
- resolved 报告采样问题 `P3-DCF13C-REPORT-001` 仅调整 abort 后指标读取顺序，
  不改变长稳负载；最终压缩 Harness 和完整门禁已复跑通过；
- 公共 Contract、Kernel reducer、KAF-2/3 语义和 CGF-1.3 均未修改。

## 当前门槛

```text
DCF-1.3A：PASS / CLOSED
DCF-1.3B：PASS / CLOSED
DCF-1.3C：IMPLEMENTED / READY_FOR_INDEPENDENT_QA
DCF-1.3：USER ACCEPTANCE PENDING
CGF-1.3：GATED
```

独立 QA 必须在最终代码上实际重跑完整 30/60 分钟 Harness，不能以本节点、
开发者历史报告或 digest 替代。即使独立 QA 通过，仍需用户明确接受后才能关闭
DCF-1.3；DCF-1.3 关闭也不会自动解锁 CGF-1.3。

---

# KN-062：接受 DCF-1.3C 独立 QA 并正式关闭 DCF-1.3

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-1.3C PASS/CLOSED；DCF-1.3 CLOSED；CGF-1.3 GATED** |
| 阶段 | `0.0.0-dcf.1.3c` |
| 主题 | Desktop/Core Runtime Reliability 阶段正式关闭 |
| 依据 | Claude Code 独立 QA：88 files / 555 tests；30 分钟与 60 分钟 Harness 均实际重跑；27/27 范围覆盖；P0～P3=0；用户正式接受 |
| 正式文档 | [DCF-1.3 开发计划](./DCF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[独立 QA 报告](../development/qa/0.0.0-dcf.1.3c-claude-qa.md) |

## 正式关闭状态

```text
DCF-1.3A：PASS / CLOSED
DCF-1.3B：PASS / CLOSED
DCF-1.3C：PASS / CLOSED
DCF-1.3：PASS / CLOSED
CGF-1.3：GATED
```

独立 QA 在最终代码上实际执行了 30 分钟与 60 分钟长稳 Harness；最终结果分别
为 178 turns / 16 runtime instances / 0 errors 和 350 turns /
32 runtime instances / 0 errors。完整门禁、资源收敛、安全报告、Kernel/Contract
边界与无超前 CGF-1.3 均通过。

## CGF-1.3 仍未解锁

DCF-1.3 关闭只满足 CGF-1.3 四项进入条件中的第一项。以下三项仍是必须由用户
逐步确认的独立门槛：

1. 完成并接受企业离线语义修订；
2. 重新确认 CGF-1.3 开发方案；
3. 用户明确授权进入 CGF-1.3A 开发。

在三项条件全部成立前，CGF-1.3 保持 `GATED`；不得因为 DCF-1.3 已关闭而
自动进入 Runtime Activation、Registry Generation 切换或其他 CGF-1.3 编码。

---

# KN-063：重新确认 CGF-1.3 并关闭企业离线语义 P1/P2 文档门槛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **CGF-1.3 CONFIRMED_WITH_SPECIFIED_REVISIONS / CGF-1.3A USER AUTHORIZATION PENDING** |
| 阶段 | CGF-1.3 Runtime Registry Activation |
| 主题 | 企业离线四状态、Controlled Core Restart、generation 恢复与 A/B/C 方案重新确认 |
| 依据 | 用户接受企业离线四状态、Storage/Runtime Activation 分离、Registry Generation、Controlled Core Restart、A/B/C 三阶段及 MVP 非目标，并给出六组最终修订 |
| 正式文档 | [企业离线语义修订](../product/MVP-BASELINE-REVISION-ITEM-001-ENTERPRISE-OFFLINE-SEMANTICS.md)、[MVP 功能范围与开发基线](../product/ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md)、[CGF-1.3 开发计划](./CGF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 1. 当前状态

```text
DCF-1.3：PASS / CLOSED
CGF-1.3：CONFIRMED_WITH_SPECIFIED_REVISIONS / GATED
CGF-1.3A：DOCUMENT GATES CLOSED / USER AUTHORIZATION PENDING
```

DCF-1.3 已提供稳定的 controlled restart、runtimeInstance 生命周期、SSE 重连、
资源回收和长稳底座。CGF-1.3 仍未获得编码授权。

## 2. 企业离线四状态

1. 企业在线：能力正常；
2. 企业服务暂时不可用：企业会话仍有效时，当前已 Runtime Active 且完全本地
   可运行的能力可以继续；
3. 企业会话失效：企业能力暂停；
4. 企业恢复：Core 自动检测，Desktop 展示发现更新并等待用户确认应用。

状态 4 的恢复检测来自 SSE reconnect、periodic polling、Access Token 有效和
Device Trust 有效。检测不等于自动激活；禁止后台静默下载配置、Storage
Activation、Runtime Activation 或重启 Core。

## 3. 已关闭的 P1

### P1-1：状态 4 恢复触发

```text
Central 恢复
→ Core 自动检测并复核身份/设备事实
→ Desktop 请求用户确认
→ Storage Activation
→ Controlled Core Restart
→ Runtime Activation
```

### P1-2：完全本地可运行判定

```text
runtimeActive generation
∩ package sealed
∩ package digest valid
∩ required dependencies available
∩ referenced Model/Tool usable
```

判定事实只能来自 `enterprise-configuration.sqlite`，不依赖内存、UI 或上次运行
缓存。

### P1-3：旧 generation 回退

允许回退必须逐项满足：old generation 是上一次成功 runtimeActive、已 sealed、
当前 storageActive 仍匹配失败 attempt 目标、enterprise scope 一致、user/device
session 有效、Package digest 通过、Snapshot 完整、Model Registry 可重建、
Tool Registry 可重建、Adapter 可信且仍存在、不改变 Binding/Model/Tool/revision，
并产生持久 failure fact。任一不成立即 `activation_failed`，不得静默回退。

### P1-4：双 SQLite 恢复

`enterprise-configuration.sqlite` 权威持有 generation、activation record 和
Runtime Registry 状态；Task SQLite 权威持有 Task、TaskRuntimeSelection 和
TaskCapabilityLock。不存在跨库事务，恢复顺序固定为：

```text
enterprise activation record
→ active generation
→ Task references
→ Task Projection
```

## 4. 已关闭的 P2

- Desktop 禁止显示模糊的“正在使用缓存配置”，必须显示企业在线、服务暂时不可
  用、企业会话失效、企业恢复等待应用四种状态；
- CGF-1.3 不实现配置过期策略、离线租约、受限模式、实时撤销、Policy Engine、
  自动个人 Model fallback、自动 Binding 切换、自动破坏性 GC 或复杂 RBAC。

## 5. A/B/C 范围

- CGF-1.3A：Enterprise Registry Materializer、精确 generation 和
  LocalExecutable 判定；
- CGF-1.3B：Activation Intent、Controlled Restart、internal readiness、
  runtimeActive commit、崩溃恢复和受限旧运行代回退；
- CGF-1.3C：新旧 Task 引用安全、双 SQLite 恢复、GC blocker、四状态 Projection
  和阶段 Harness。

本节点关闭方案 P1/P2，不授权编码。只有用户明确授权后才可进入
`0.0.0-cgf.1.3a`。

---

# KN-064：用户授权并完成 CGF-1.3A 开发者实现

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **CGF-1.3A IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-cgf.1.3a` |
| 主题 | 精确企业 generation、不可变 Registry 与完全本地可运行判定 |
| 依据 | 用户明确授权进入 CGF-1.3A；专项 2 files / 26 tests、完整门禁 89 files / 570 tests |
| 正式文档 | [CGF-1.3 开发计划](./CGF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-041](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现

- 只读 `EnterpriseRuntimeRegistrySource` 从 CGF-1.2 精确 Storage Active
  generation 读取事实，不建立 Runtime Activation CRUD；
- Materializer 在构建前复核有效企业会话、四因素 scope、Compatibility、
  Snapshot/Package/file/materialization digest 和 sealed 完整性；
- Model/Tool Descriptor 确定性生成 KAF-3 Definition、Binding 和
  AdapterDescriptor，并通过既有 RegistryBuilder 排序、校验、计算 revision
  和 deep freeze；
- `core:`、`local:` 与远程 Gateway 边界分离，远程 descriptor 不复制原始
  endpoint 或任何 Credential；
- Agent/Skill/Knowledge 继续作为独立版本引用，不进入 Capability Registry；
- disabled、凭证不可用、不可用原因或权限缺失只收窄能力，不选择替代 Binding；
- 五项 `LocalExecutableEnterpriseCapability` 判定分别报告 generation、
  Package sealed、Package digest、依赖可用和引用 Model/Tool 本地可执行；
  依赖集合由已校验 Agent Definition 固定引用推导，不接受调用方手填 ID 列表；
- InMemory/SQLite 共用 Conformance 与 KAF-3 Registry 回归覆盖失败关闭、
  注册顺序、deep freeze、typed port 和无超前实现；
- 公共 Contract、Kernel、Central Java、Storage Active pointer 和 SQLite
  migration 均未修改。

## 当前门槛

```text
CGF-1.3A：IMPLEMENTED / READY_FOR_INDEPENDENT_QA
CGF-1.3B：GATED
CGF-1.3C：GATED
CGF-1.3：IN PROGRESS
```

Claude Code 必须独立重跑完整门禁和 CGF-1.3A 专项。独立 QA 即使通过，仍需
用户明确接受后才能关闭 CGF-1.3A；本节点不授权 activation intent、Controlled
Restart、runtimeActive commit 或 CGF-1.3B。

---

# KN-065：接受 CGF-1.3A 独立 QA 并授权 CGF-1.3B

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **CGF-1.3A PASS/CLOSED；CGF-1.3B AUTHORIZED** |
| 阶段 | CGF-1.3 |
| 主题 | 关闭 Registry Materializer 门槛并进入受控 Runtime Activation |
| 依据 | Claude Code 独立 QA：89 files / 570 tests、专项 2 files / 26 tests、Central 53 tests，P0～P3=0；用户明确接受并授权 |
| 正式文档 | [CGF-1.3 开发计划](./CGF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[独立 QA](../development/qa/0.0.0-cgf.1.3a-claude-qa.md) |

## 决议

```text
CGF-1.3A：PASS / CLOSED
CGF-1.3B：AUTHORIZED
CGF-1.3C：GATED
CGF-1.3：IN PROGRESS
```

CGF-1.3B 只实现既定的 Activation Intent、类型化 Controlled Core Restart
Port、精确 generation 重建、internal readiness、`runtimeActive` 原子提交、
崩溃恢复和满足十二项 checklist 的受限旧 generation 回退。

本节点不授权 Task 双 SQLite 恢复、跨 generation Task 安全、企业离线四状态
Desktop Projection、generation GC 或其他 CGF-1.3C 内容。

---

# KN-066：CGF-1.3B 完成开发者实现并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **CGF-1.3B IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-cgf.1.3b` |
| 主题 | Durable Runtime Activation、受控重启与崩溃恢复 |
| 依据 | 用户明确授权；专项 2 files / 24 tests、完整门禁 91 files / 594 tests、Central 53 tests |
| 正式文档 | [CGF-1.3 开发计划](./CGF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-042](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现

- 内部 Runtime Activation Port、Persistence、Coordinator、Restart Port 和
  Registry Installer，不修改公共 Contract 或 Kernel；
- enterprise configuration SQLite V3 持久 attempt、failure/fallback 和
  runtimeActive；V1/V2 checksum 不改写；
- restart intent 与精确 startup target 校验、per-scope 单写者和重复请求抑制；
- internal readiness 后原子提交 completed attempt + runtimeActive，再开放
  public readiness；
- commit 后响应丢失、close/reopen 和 deterministic Registry rebuild；
- 九个命名故障点、Storage Active 并发推进、会话失效及显式旧运行代回退；
- Storage Active 不因失败回滚，不选择个人 Model、其他 Binding 或替代
  generation；
- Contracts、Kernel、Central Java、Task SQLite 和 CGF-1.3C 产品范围未改动。

## 当前门槛

```text
CGF-1.3A：PASS / CLOSED
CGF-1.3B：IMPLEMENTED / READY_FOR_INDEPENDENT_QA
CGF-1.3C：GATED
CGF-1.3：IN PROGRESS
```

Claude Code 必须独立重跑完整门禁、新增 2 files / 24 tests、V3 migration、
九点故障矩阵和 Central 回归。即使独立 QA 通过，也必须由用户明确接受
CGF-1.3B 并授权后才能进入 CGF-1.3C。

---

# KN-067：接受 CGF-1.3B 独立 QA 并授权 CGF-1.3C

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **CGF-1.3B PASS/CLOSED；CGF-1.3C AUTHORIZED** |
| 阶段 | CGF-1.3 |
| 主题 | 关闭 Durable Runtime Activation 门槛并进入阶段收口批次 |
| 依据 | Claude Code 独立 QA：91 files / 594 tests、Runtime Activation 专项 2 files / 24 tests、Central 53 tests，P0～P3=0；用户明确接受并授权 |
| 正式文档 | [CGF-1.3 开发计划](./CGF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[独立 QA](../development/qa/0.0.0-cgf.1.3b-claude-qa.md) |

## 决议

```text
CGF-1.3A：PASS / CLOSED
CGF-1.3B：PASS / CLOSED
CGF-1.3C：AUTHORIZED
CGF-1.3：IN PROGRESS
```

CGF-1.3C 按既定计划只实现新旧 Task 引用安全、双 SQLite 确定恢复顺序、
generation GC blocker、企业离线四状态 Desktop Projection 和完整阶段
Harness。

本节点仅授权进入 CGF-1.3C 开发，不代表 CGF-1.3C 或 CGF-1.3 已完成。
CGF-1.3C 仍须完成开发者自测、独立 QA 和用户验收后方可关闭。

---

# KN-068：CGF-1.3C 完成开发者实现并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **CGF-1.3C IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-cgf.1.3c` |
| 主题 | 新旧 Task generation 隔离、双 SQLite 恢复、GC blocker 与企业离线四状态 |
| 依据 | 用户明确授权；专项 3 files / 15 tests、完整门禁 93 files / 600 tests、Central 在线/离线各 53 tests |
| 正式文档 | [CGF-1.3 开发计划](./CGF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-043](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现

- enterprise activation authority → Task SQLite 的固定只读恢复顺序，不使用
  ATTACH、跨库事务或第二个 activation authority；
- current/locked previous/local/waiting/unavailable/integrity mismatch 六类 Task
  恢复结论，既有 Selection/Lock 不改写、不换 Binding；
- active/previous/runtime/pending/failure/fallback/非终态 Task 的可审计
  generation blocker，只输出 `safeToDelete=false`，不执行 GC；
- online、service unavailable、session invalid、recovered waiting application
  四状态纯 Projection，恢复后不静默同步或激活；
- 双 SQLite close/reopen 阶段 Harness 验证新旧 Task 隔离、会话失败和 blocker
  重建；
- 公共 Contract、Kernel reducer、Central Java/API 保持不变。

## 当前门槛

```text
CGF-1.3A：PASS / CLOSED
CGF-1.3B：PASS / CLOSED
CGF-1.3C：IMPLEMENTED / READY_FOR_INDEPENDENT_QA
CGF-1.3：IN PROGRESS
```

Claude Code 必须独立重跑完整 Node 门禁、`pnpm run harness:cgf13c` 和
Central 在线/离线回归。独立 QA 即使通过，仍需用户明确接受后才能关闭
CGF-1.3C 与 CGF-1.3。

---

# KN-069：接受 CGF-1.3C 独立 QA 并正式关闭 CGF-1.3

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **CGF-1.3C PASS/CLOSED；CGF-1.3 PASS/CLOSED** |
| 阶段 | CGF-1.3 |
| 主题 | 关闭 Runtime Registry Activation、Task generation 恢复和企业离线语义阶段 |
| 依据 | Claude Code 独立 QA：93 files / 600 tests、专项 Harness 3 files / 15 tests、Central 在线/离线各 53 tests、14/14、P0～P3=0；用户明确接受 |
| 正式文档 | [CGF-1.3 开发计划](./CGF-1.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[独立 QA](../development/qa/0.0.0-cgf.1.3c-claude-qa.md) |

## 最终结论

```text
CGF-1.3A：PASS / CLOSED
CGF-1.3B：PASS / CLOSED
CGF-1.3C：PASS / CLOSED
CGF-1.3：PASS / CLOSED
下一阶段：GATED
```

CGF-1.3 已完成精确企业 Registry materialization、Durable Runtime
Activation、受控重启、旧运行代安全回退、新旧 Task generation 隔离、双
SQLite 恢复、GC blocker 和企业离线四状态。

本节点不授权任何下一阶段编码。下一阶段必须先完成方案确认，并获得用户明确
授权后才能进入。

---

# KN-070：确认 DCF-2 方案并解锁 DCF-2.0

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-2 CONFIRMED_WITH_SPECIFIED_REVISIONS；DCF-2.0 UNBLOCKED** |
| 阶段 | DCF-2 |
| 主题 | Task、用户确认、任务控制与恢复闭环 |
| 依据 | 用户确认 DCF-2 最终修订；DCF-1.3 与 CGF-1.3 已 PASS/CLOSED |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[Desktop Client Foundation](./DESKTOP-CLIENT-FOUNDATION-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 决议

```text
DCF-2：CONFIRMED_WITH_SPECIFIED_REVISIONS
DCF-2.0：UNBLOCKED
DCF-2A：GATED
DCF-2B：GATED
DCF-2C：GATED
CGF-2：GATED
```

DCF-2 冻结 Local Core 单一事实源、四类产品 Projection、五类高层 Command、
用户态状态 additive 兼容、Desktop 用户确认、`confirmationId +
requestDigest` 幂等、Retry 新 Run 与迟到 Observation 隔离、`uncertain`
人工处理以及 DCF-1.3 Harness 复用。

本节点只授权进入 DCF-2.0 的 Contract、Projection、威胁模型和 Conformance，
不授权直接进入 DCF-2A，也不解锁 CGF-2。

---

# KN-071：DCF-2.0 完成实现并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-2.0 IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.2.0` |
| 主题 | Task、Tool Activity、User Confirmation 与 Task Control Contract |
| 依据 | 用户授权；专项 5 files / 51 tests、完整门禁 94 files / 614 tests |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-044](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现

- 四类 strict 产品 Projection 与五类高层 Task Command；
- Task revision 与 `confirmationId + requestDigest` 幂等绑定；
- bounded Task/Confirmation Query 与 query-ref-only durable Event；
- Task/Confirmation typed error；
- 用户态状态顺序、Projection 安全字段和 Kernel 隔离护栏；
- 未修改 Kernel reducer、内部 Confirmation Persistence 或 Desktop UI。

## 当前门槛

```text
DCF-2.0：IMPLEMENTED / READY_FOR_INDEPENDENT_QA
DCF-2A：GATED
DCF-2B：GATED
DCF-2C：GATED
CGF-2：GATED
```

Claude Code 必须独立重跑完整门禁和 DCF-2.0 Contract 专项。即使独立 QA
通过，也必须由用户明确接受后才能关闭 DCF-2.0 并授权进入 DCF-2A。

---

# KN-072：接受 DCF-2.0 独立 QA 并授权 DCF-2A

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-2.0 PASS/CLOSED；DCF-2A AUTHORIZED** |
| 阶段 | DCF-2 |
| 主题 | 关闭 Task/Confirmation Contract 门槛并进入 Task 只读产品投影 |
| 依据 | Claude Code 独立 QA：94 files / 614 tests、Contracts 14 tests、P0～P3=0；用户明确接受并授权 |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[独立 QA](../development/qa/0.0.0-dcf.2.0-claude-qa.md) |

## 决议

```text
DCF-2.0：PASS / CLOSED
DCF-2A：AUTHORIZED / IN PROGRESS
DCF-2B：GATED
DCF-2C：GATED
CGF-2：GATED
```

DCF-2A 只实现 Session 下 Task 列表、Task Detail、Run/Step 与 Tool Activity
安全投影，以及 durable Event、SSE reconnect、SQLite restart 后的读取收敛。
本节点不授权用户确认、Task Control、阶段恢复 Harness 或 CGF-2。

---

# KN-073：DCF-2A 完成实现并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-2A IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.2.1` |
| 主题 | Task/Run/Step、Tool Activity 与 Desktop durable convergence |
| 依据 | 用户明确授权；专项 6 files / 47 tests、完整门禁 95 files / 615 tests |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-045](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现

- Scripted Agent Loop 复用 durable Task Runtime 产生真实 Run/Step/Observation；
- Local Core 确定性构建 Task list/detail 与 Tool Activity 安全投影；
- HTTP、Main IPC、Preload 与 Renderer 只读链路和 Task 状态面板；
- Task/Tool durable Event、运行代内幂等 sequence 与 restart Snapshot 收敛；
- SQLite V11 forward-only delivery 扩展；
- `uncertain` 人工处理映射和敏感字段禁入护栏。

## 当前门槛

```text
DCF-2A：IMPLEMENTED / READY_FOR_INDEPENDENT_QA
DCF-2B：GATED
DCF-2C：GATED
CGF-2：GATED
```

独立 QA 即使通过，仍须由用户明确接受后才能关闭 DCF-2A 并解锁 DCF-2B。

---

# KN-074：接受 DCF-2A 独立 QA 并授权 DCF-2B

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-2A PASS/CLOSED；DCF-2B AUTHORIZED** |
| 阶段 | DCF-2 |
| 主题 | 关闭 Task 只读产品投影并进入 Desktop 用户确认与任务控制 |
| 依据 | Claude Code 独立 QA：95 files / 615 tests、13/13 范围覆盖、P0～P3=0；用户明确接受并授权 |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[独立 QA](../development/qa/0.0.0-dcf.2.1-claude-qa.md) |

## 决议

```text
DCF-2.0：PASS / CLOSED
DCF-2A：PASS / CLOSED
DCF-2B：AUTHORIZED / IN PROGRESS
DCF-2C：GATED
CGF-2：GATED
```

DCF-2B 只实现 Desktop 用户确认、allow/reject、cancel/retry/continue/provide
input，以及重复、迟到、过期和错绑定决定的失败关闭。确认后仍须在外部调用前
检查 disabled、revoked、health、credential 和 permission 等实时收窄状态。

本节点不授权 DCF-2C 恢复 Harness 或 CGF-2。

---

# KN-075：DCF-2B 完成实现并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-2B IMPLEMENTED / READY_FOR_INDEPENDENT_QA** |
| 阶段 | `0.0.0-dcf.2.2` |
| 主题 | Desktop 用户确认、Task Control 与持久恢复 |
| 依据 | 用户明确授权；专项 4 files / 25 tests、loopback E2E 2 files / 4 tests、完整门禁 96 files / 620 tests |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-046](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现

- Application 层五类高层 Task Control，复用既有 durable reducer、Receipt、
  Conversation 和 Confirmation Coordinator；
- cancel 的 AbortSignal 传播、retry 新 Run、受限 continue 和持久补充输入；
- Confirmation 与 Task/Run/Step/Action/requestDigest 精确绑定，以及过期、重放、
  冲突、迟到和实时状态收窄的失败关闭；
- Confirmation 安全 Projection、HTTP/Main/Preload/Renderer 白名单链路；
- SQLite V12 forward-only delivery 扩展和 pending/decided 确认恢复；
- Kernel reducer、Enterprise Gateway、DCF-2C 和 CGF-2 均未修改或提前实现。

## 当前门槛

```text
DCF-2A：PASS / CLOSED
DCF-2B：IMPLEMENTED / READY_FOR_INDEPENDENT_QA
DCF-2C：GATED
CGF-2：GATED
```

Claude Code 必须独立重跑完整门禁和 DCF-2B Confirmation/Task Control 专项。
独立 QA 即使通过，仍须由用户明确接受后才能关闭 DCF-2B 并解锁 DCF-2C。

---

# KN-076：接受 DCF-2B 独立 QA 并授权 DCF-2C

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-2B PASS/CLOSED；DCF-2C AUTHORIZED** |
| 阶段 | DCF-2 |
| 主题 | 关闭 Desktop 用户确认与 Task Control，进入恢复闭环与阶段 Harness |
| 依据 | Claude Code 独立 QA：96 files / 620 tests、15/15 范围覆盖、P0～P3=0；用户明确接受并授权 |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[独立 QA](../development/qa/0.0.0-dcf.2.2-claude-qa.md) |

## 决议

```text
DCF-2.0：PASS / CLOSED
DCF-2A：PASS / CLOSED
DCF-2B：PASS / CLOSED
DCF-2C：AUTHORIZED / IN PROGRESS
CGF-2：GATED
```

DCF-2C 只实现 running、waiting_input、waiting_user_confirmation、Desktop
restart、Core restart、SSE reconnect、cancel/retry 与迟到 Observation 的恢复
矩阵，以及 slow consumer 和资源回收的统一 Harness。

本节点不授权 CGF-2、真实企业 Model/Tool、Policy Engine 或 Kernel reducer 修改。

---

# KN-077：DCF-2C 完成实现并进入独立 QA 与用户体验门槛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **DCF-2C IMPLEMENTED / READY_FOR_INDEPENDENT_QA_AND_USER_DEMO** |
| 阶段 | `0.0.0-dcf.2.3` |
| 主题 | Task/Confirmation/Control 恢复闭环与 Desktop/Core/SSE 统一 Harness |
| 依据 | 用户明确授权；DCF-2C Harness 4 files / 18 tests、完整门禁 98 files / 630 tests |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-047](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现

- SQLite close/reopen 恢复 running、waiting_input、waiting_user_confirmation、
  allow/reject、cancel、retry 和旧 Run 迟到 Observation；
- 迟到 Observation 不改变新 Run 或 state revision，只通过类型化 Port 追加安全
  `runtime.command_rejected` Event 与 Outbox；
- Desktop Main 重建、Core restart、runtimeInstance 变化、SSE cursor 续接、
  无重复 durable Event、slow consumer 与资源归零统一 E2E；
- waiting_input、waiting_confirmation、recovering 和 manual_attention 的产品
  guidance；
- Kernel reducer、公共 Contract、Enterprise Gateway 与 CGF-2 均未修改或提前实现。

## 当前门槛

```text
DCF-2B：PASS / CLOSED
DCF-2C：IMPLEMENTED / READY_FOR_INDEPENDENT_QA_AND_USER_DEMO
CGF-2：GATED
```

Claude Code 必须独立重跑完整门禁和 `pnpm run harness:dcf2c`。自动化 QA 不能
替代用户现场体验确认；只有独立 QA 与用户体验均被用户接受后，DCF-2C 和 DCF-2
阶段才可关闭。

---

# KN-078：接受 DCF-2C 技术 QA，保留用户现场体验门槛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **TECHNICAL_QA_ACCEPTED；USER_DEMO_PENDING；DCF-2C NOT CLOSED** |
| 阶段 | `0.0.0-dcf.2.3` |
| 主题 | 接受恢复闭环技术验收，但不以自动化替代用户现场体验 |
| 依据 | Claude Code 独立 QA：98 files / 630 tests、DCF-2C Harness 4 files / 18 tests、P0～P3=0；用户明确接受技术结论 |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[独立 QA](../development/qa/0.0.0-dcf.2.3-claude-qa.md) |

## 决议

```text
DCF-2B：PASS / CLOSED
DCF-2C：TECHNICAL_QA_ACCEPTED / USER_DEMO_PENDING / NOT_CLOSED
DCF-2：NOT CLOSED
CGF-2：GATED
```

用户现场仍须完成 Session、Agent/Model/Workspace、Task/Tool Activity、用户确认、
中断或重启、恢复和最终持久结果的完整体验链路。在此之前，不关闭 DCF-2C 或
DCF-2，也不自动解锁 CGF-2。

---

# KN-079：DCF-2C 隔离用户演示入口就绪

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-27 |
| 状态 | **READY_FOR_USER_DEMO；DCF-2C NOT CLOSED；CGF-2 GATED** |
| 阶段 | `0.0.0-dcf.2.3-demo.1` |
| 主题 | 用独立数据目录和受控 Process Echo 完成可操作的现场体验入口 |
| 依据 | 用户要求先实现隔离演示模式；完整门禁 99 files / 631 tests、DCF-2C Harness 5 files / 19 tests |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[用户现场体验指南](../development/DCF-2C-USER-DEMO-GUIDE.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-048](./UPSTREAM-ADOPTION-REGISTER.md) |

## 决议

- `pnpm run demo:dcf2c` 是显式、隔离的用户体验入口；
- 使用独立 Electron userData 和 SQLite，不改变正常 Desktop 数据；
- 固定 Demo Agent/Scripted Model/Process Echo Tool 只验证 DCF-2C 恢复与确认；
- 真实 Tool 输入由 Core 固定生成，不执行用户文本、Shell 或业务文件；
- Demo Runner 保持在 Application/Adapter 边界，不进入 Contract、Kernel、
  Preload 或 Renderer；
- 自动化验证不能替代用户现场接受。DCF-2C 与 DCF-2 仍未关闭，CGF-2 继续
  `GATED`。

---

# KN-080：接受 DCF-2C 用户现场体验并关闭 DCF-2

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **DCF-2C PASS/CLOSED；DCF-2 PASS/CLOSED；CGF-2 GATED** |
| 阶段 | `0.0.0-dcf.2.3-demo.1` |
| 主题 | 用户连续两次完成隔离演示，关闭 DCF-2 最终体验门槛 |
| 依据 | DCF-2C 独立技术 QA 已接受；用户实际运行两次并明确反馈“均未发现异常，通过测试” |
| 正式文档 | [DCF-2 开发计划](./DCF-2-DEVELOPMENT-PLAN.md)、[用户现场体验指南](../development/DCF-2C-USER-DEMO-GUIDE.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 用户验证结果

- Demo Agent 与 Scripted Demo Model 正确加载；
- Task、Step、Confirmation 和 Tool Activity 正确展示；
- 等待确认可在 Desktop/Core 重启后恢复；
- 用户允许后，真实进程外 Process Echo 成功完成；
- 最终 Assistant Message 持久化并在恢复后保持一致；
- 连续两次测试均未发现异常。

## 决议

```text
DCF-2.0：PASS / CLOSED
DCF-2A：PASS / CLOSED
DCF-2B：PASS / CLOSED
DCF-2C：PASS / CLOSED
DCF-2：PASS / CLOSED
CGF-2：GATED
```

DCF-2 的独立技术 QA 与用户现场体验门槛均已满足。CGF-2 不因本节点自动
解锁，仍须完成方案确认并获得用户明确开发授权。

---

# KN-081：接受公司 Central Java 技术方向并提出 ADR-016

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **COMPANY BASELINE ACCEPTED；ADR-016 PROPOSED；ALIGNMENT/CGF-2 GATED** |
| 阶段 | Central Java Platform Alignment |
| 主题 | 接受公司 Java 工程约束，先完成低风险规范和持久化/无状态迁移，再重新对齐 CGF-2 |
| 依据 | 公司技术负责人九项约束、`DISC-20260728-006-java-baseline-cx` 评审、用户明确确认执行顺序 |
| 正式文档 | [ADR-016](../adr/016-central-java-engineering-baseline.md)、[技术架构与技术选型说明](./ROBOTHREE-TECHNOLOGY-ARCHITECTURE-SELECTION-v1.0.md) |

## 决议

Central 目标技术基线接受：

- MyBatis-Plus 只进入 Persistence Adapter，关键事务、锁和幂等继续使用显式
  SQL；
- Flyway 迁移到版本化 SQL Script，但保留 V1～V5 历史、digest、preflight
  和完整 upgrade 测试；
- CAS 作为首个生产企业身份 Adapter，具体 Wire Protocol 在企业集成前确认；
- Lombok 受限使用，业务 HTTP 固定 GET/POST；
- 建立全局异常、链路追踪和 Thin Controller；
- PostgreSQL/共享存储作为集群权威事实源，双节点恢复 Harness 是硬门槛。

执行顺序固定为：

```text
ADR-016
→ Alignment-1：低风险工程规范
→ Alignment-2：Persistence + Stateless
→ CGF-2 按新基线重新对齐
```

真实 CAS、企业 MDM/RBAC、正式 Secret Store 和企业 MaaS 后置，不阻塞
Alignment-1/2 或 Development Profile 的真实 DeepSeek Foundation。

## 当前门槛

```text
ADR-016：PROPOSED / USER ACCEPTANCE PENDING
Alignment-1：GATED
Alignment-2：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

ADR-016 需要先由 Claude Code 评审并由用户明确接受。其接受只解锁
Alignment-1 计划编写，不自动授权 Alignment-1 编码。

---

# KN-082：接受 ADR-016 并进入 Alignment-1 计划评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **ADR-016 ACCEPTED；ALIGNMENT-1 PLAN PROPOSED；CODING GATED** |
| 阶段 | Central Java Platform Alignment |
| 主题 | 关闭 ADR-016 文档评审 P2/P3，正式拆分 Alignment-2A/2B，并编写 Alignment-1 计划 |
| 依据 | Claude Code ADR-016 独立文档评审 `PASS`：P0=0、P1=0、P2=1、P3=1；用户要求评审后开始下一步 |
| 正式文档 | [ADR-016](../adr/016-central-java-engineering-baseline.md)、[Alignment-1 Development Plan](./CENTRAL-JAVA-ALIGNMENT-1-DEVELOPMENT-PLAN.md) |

## 评审问题关闭

- P2：执行主链正式拆为 Alignment-2A（MyBatis-Plus/SQL/V1～V5 Bridge）和
  Alignment-2B（Stateless Foundation/双节点 Harness）；
- P3：Alignment-2A 不为 CGF-2 预建 Model Invocation/Durable Event 空表；
  CGF-2 使用后续版本化 SQL Script 增加其已确认 Schema。

## 决议

```text
ADR-016：ACCEPTED
Alignment-1 Plan：PROPOSED / REVIEW PENDING
Alignment-1A：GATED
Alignment-1B：GATED
Alignment-2A：GATED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

Alignment-1 计划只处理受限 Lombok、GET/POST Guard、Thin Controller、
Bearer Security Adapter、Global Exception Handler 和安全 Tracing，不修改
MyBatis/Flyway/Schema、真实 CAS、Model Invocation、公共 Contract 或 CGF-2。

下一道门槛是 Claude Code 独立评审 Alignment-1 Plan。只有用户接受计划并明确
授权 Alignment-1A 后，才允许修改 Central Java 代码。

---

# KN-083：Alignment-1A 实现完成并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **ALIGNMENT-1A IMPLEMENTED / DEVELOPER CHECK PASS / INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cja.1a` |
| 主题 | 完成 Central HTTP/Lombok/Exception/Controller 低风险工程对齐 |
| 依据 | Alignment-1 Plan 评审 P0=0/P1=0/P2=0/P3=1；用户接受计划、允许编码落实 P3 并明确授权 Alignment-1A；开发者 online/offline 各 66 tests 全通过 |
| 正式文档 | [ADR-016](../adr/016-central-java-engineering-baseline.md)、[Alignment-1 Development Plan](./CENTRAL-JAVA-ALIGNMENT-1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 已实现

- 有限 Lombok 与危险注解 Guard，Lombok 不进入可执行 fat jar；
- GET/POST-only 与 Thin Controller Java Source Guard；
- Identity/Token/Configuration 的 Validator、Mapper、Response Assembler；
- 只保护企业配置路径的有序 Bearer Filter；
- strict `v1alpha1` 安全 Error Envelope 和统一 `GlobalExceptionHandler`；
- Filter order、64 路并发 Bearer/correlationId 隔离与敏感信息不泄漏测试；
- Central online/offline、Testcontainers PostgreSQL 16 和 Embedded
  PostgreSQL 16 全量回归。

## 当前门槛

```text
ADR-016：ACCEPTED
Alignment-1A：IMPLEMENTED / INDEPENDENT QA PENDING
Alignment-1B：GATED
Alignment-2A：GATED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

独立 QA 和用户接受是 Alignment-1A 关闭门槛。本节点不自动解锁后续批次。

---

# KN-084：关闭 Alignment-1A 并完成 Alignment-1B 实现

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **ALIGNMENT-1A PASS/CLOSED；ALIGNMENT-1B IMPLEMENTED / INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cja.1b` |
| 主题 | 建立 Central W3C Trace、默认无外连 OTLP 和敏感数据安全观测基线 |
| 依据 | Alignment-1A 独立 QA 66/0/0 x2、P0～P3=0 已由用户接受；用户明确授权 Alignment-1B；开发者 online/offline 各 77 tests 全通过 |
| 正式文档 | [ADR-016](../adr/016-central-java-engineering-baseline.md)、[Alignment-1 Development Plan](./CENTRAL-JAVA-ALIGNMENT-1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 已实现

- Spring Boot Actuator、Micrometer Tracing、OpenTelemetry Bridge 和可选
  OTLP Exporter，默认不创建网络 Exporter；
- W3C `traceparent/tracestate`、`X-RoboThree-Trace-Id` 与独立
  correlationId；
- HTTP/Application/JDBC 固定低基数 Span 和格式受限 typed errorCode；
- query、Header、Token、Credential、Prompt、正文、结果、SQL 参数和完整
  异常信息防泄漏 Guard；
- 合法/非法 Context、48 路并发、Exporter failure、WebMvc slice、真实
  Testcontainers JDBC Transaction 与 Embedded PostgreSQL 全量回归；
- Enterprise Gateway canonical Contract、Schema、Fixture、V1～V5、
  Persistence 语义和 Local Core 均未修改。

## 当前门槛

```text
ADR-016：ACCEPTED
Alignment-1A：PASS / CLOSED
Alignment-1B：IMPLEMENTED / INDEPENDENT QA PENDING
Alignment-1：NOT CLOSED
Alignment-2A：GATED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

Claude Code 必须独立实际执行 Java 21 online/offline 全量门禁并验证 W3C、
并发、默认零外连、Exporter 故障不阻断与敏感信息防泄漏。用户接受
Alignment-1B 独立 QA 后才可关闭 Alignment-1；本节点不授权
Alignment-2A/2B 或 CGF-2。

---

# KN-085：关闭 Alignment-1B 与 Alignment-1

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **ALIGNMENT-1B PASS/CLOSED；ALIGNMENT-1 PASS/CLOSED；ALIGNMENT-2A/2B、CGF-2 GATED** |
| 阶段 | `0.0.0-cja.1b` |
| 主题 | 接受 Central Tracing 独立 QA 并关闭 Alignment-1 |
| 依据 | Claude Code 独立执行 Central online/offline 各 77 tests，Testcontainers 与 Embedded PostgreSQL 实际执行，12/12 QA 覆盖且 P0～P3=0；用户正式接受 |
| QA 报告 | [0.0.0-cja.1b Claude QA](../development/qa/0.0.0-cja.1b-claude-qa.md) |
| 正式文档 | [ADR-016](../adr/016-central-java-engineering-baseline.md)、[Alignment-1 Development Plan](./CENTRAL-JAVA-ALIGNMENT-1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 验收结论

- W3C Trace Context 合法传播、非法输入拒绝及 48 路并发隔离通过；
- OTLP 默认关闭，Exporter failure 和真实 timeout 均不阻断业务；
- HTTP/Application/JDBC Span 使用固定低基数边界，Token、正文、SQL
  参数等敏感数据不进入 Span；
- strict Error Body、Contract、Schema、Fixture、V1～V5 和 fat jar
  Lombok 边界未改变；
- Alignment-2 与 CGF-2 均未提前实现。

## 当前门槛

```text
ADR-016：ACCEPTED
Alignment-1A：PASS / CLOSED
Alignment-1B：PASS / CLOSED
Alignment-1：PASS / CLOSED
Alignment-2A：GATED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

下一步只允许制定并确认 Alignment-2A 开发方案。本节点不授权
Alignment-2A/2B 或 CGF-2 编码。

---

# KN-086：提出 Alignment-2A Persistence Migration 开发计划

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **ALIGNMENT-2A PLAN PROPOSED / REVIEW PENDING；CODING GATED** |
| 主题 | 冻结 MyBatis-Plus、SQL Script、V1～V5 Bridge 与 Schema Preflight 的实施草案 |
| 前置 | Alignment-1A、Alignment-1B 与 Alignment-1 `PASS/CLOSED` |
| 正式文档 | [Alignment-2A Development Plan](./CENTRAL-JAVA-ALIGNMENT-2A-DEVELOPMENT-PLAN.md)、[ADR-016](../adr/016-central-java-engineering-baseline.md) |

## 草案边界

- 计划拆为 2A.1 SQL Governance/V5 Bridge/Preflight、2A.2
  MyBatis-Plus Adapter Parity、2A.3 Production Persistence Cutover；
- 计划使用 MyBatis-Plus Spring Boot 3 Starter 3.5.16，关键锁、幂等、
  revision 和 consume 操作继续使用 Mapper XML/显式 SQL；
- SQL 由 DBA/部署系统在服务外执行，Central 生产启动只做只读 Preflight；
- Fresh Baseline 与精确 Flyway V5 Bridge 均必须在 Testcontainers 和
  Embedded PostgreSQL 16 实际执行；
- V1～V5 与 `flyway_schema_history` 保留历史事实，生产运行时最终不再依赖
  Flyway；
- Alignment-2A 不建设 Production Profile、双节点 Harness、Model
  Invocation、Durable Event、CAS、DeepSeek 或 CGF-2 占位表。

## 当前门槛

```text
ADR-016：ACCEPTED
Alignment-1：PASS / CLOSED
Alignment-2A Plan：PROPOSED / REVIEW PENDING
Alignment-2A.1：GATED
Alignment-2A.2：GATED
Alignment-2A.3：GATED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

下一步是 Claude Code 独立文档评审和用户确认。本节点不授权任何
Alignment-2A、Alignment-2B 或 CGF-2 编码。

---

# KN-087：吸收 Alignment-2A 首轮文档评审修订

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **PLAN REVISED / CLAUDE RE-REVIEW PENDING；CODING GATED** |
| 评审 | P0=0、P1=0、P2=8、P3=3 |
| 主题 | 完整吸收 Alignment-2A Persistence Migration 首轮评审意见 |
| 依据 | [讨论区 008](../../../讨论区/20260728/008-alignment-2a-plan-review-cc.md) |
| 正式文档 | [Alignment-2A Development Plan](./CENTRAL-JAVA-ALIGNMENT-2A-DEVELOPMENT-PLAN.md) |

## 修订结果

- Bridge 改为逐条验证 V1～V5 全部 Flyway history 记录；
- 增加 Fresh/Bridge Schema Structural Equivalence；
- Legacy Ledger 保留原 `installed_on`，Manifest 使用固定 `.sha256` sidecar；
- 增加 MyBatis SqlSession 与 Spring Transaction 同一 JDBC Connection 实测；
- 显式关闭 MyBatis SQL/参数/结果日志；
- V1～V5 使用 byte-by-byte、MD5、SHA-256 三重比对；
- Mapper 动态 SQL 和 Java Test-only Script Installer 边界明确；
- dependency tree 验证时机改为依赖加入后立即执行；
- 2A.2 工期调整为 5～7 天，Alignment-2A 总计 9～13 个工程工作日。

## 当前门槛

```text
Alignment-2A Plan：REVISED / CLAUDE RE-REVIEW PENDING
Alignment-2A.1：GATED
Alignment-2A.2：GATED
Alignment-2A.3：GATED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

Claude Code 复核和用户接受前不得进入编码。本节点不授权 Alignment-2A.1、
Alignment-2B 或 CGF-2。

---

# KN-088：确认 Alignment-2A 计划并完成 2A.1 实现

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **ALIGNMENT-2A PLAN CONFIRMED；2A.1 IMPLEMENTED / INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cja.2a.1` |
| 主题 | 建立 SQL version 6、精确 V5 Bridge、Manifest/Ledger 与 MyBatis 只读 Preflight |
| 依据 | Claude 修订版复核 11/11 CLOSED、P0～P3=0；用户正式接受并授权 2A.1；开发者 Central online/offline 各 90 tests PASS |
| 正式文档 | [Alignment-2A Development Plan](./CENTRAL-JAVA-ALIGNMENT-2A-DEVELOPMENT-PLAN.md)、[ADR-016](../adr/016-central-java-engineering-baseline.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 已实现

- MyBatis-Plus 3.5.16 依赖加入后立即完成 dependency tree 收敛验证；
- Fresh `B0006`、精确 Flyway V5 Bridge `U0006`、canonical Manifest、
  `.sha256` sidecar 和 `robothree_schema_version`；
- V1～V5 byte-by-byte、MD5、SHA-256 及 Flyway checksum 冻结；
- Java Test-only Installer 的 digest、单事务、幂等、冲突和命名回滚；
- MyBatis Schema Inspection Mapper、只读 Manifest Loader 与失败关闭
  Preflight；
- `NoLoggingImpl` 及 SQL、参数、敏感值不进入日志/Trace 的动态验证；
- Testcontainers/Embedded PostgreSQL 16 Fresh、Bridge、结构等价、旧/新/
  缺失/checksum/结构漂移矩阵；
- 生产 `CentralSchemaManager` 和 Flyway 执行路径删除，Flyway 降为
  test scope；业务 JDBC Persistence 尚未迁移。

## 当前门槛

```text
Alignment-2A Plan：CONFIRMED
Alignment-2A.1：IMPLEMENTED / INDEPENDENT QA PENDING
Alignment-2A.2：GATED
Alignment-2A.3：GATED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

Claude Code 必须独立实际执行完整门禁。用户接受独立 QA 后才可关闭 2A.1；
本节点不授权 2A.2、2A.3、Alignment-2B 或 CGF-2。

---

# KN-089：关闭 Alignment-2A.1 并完成 2A.2 Adapter Parity 实现

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-28 |
| 状态 | **2A.1 PASS/CLOSED；2A.2 IMPLEMENTED / INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cja.2a.2` |
| 主题 | 建立 Authentication/Configuration MyBatis-Plus Adapter 与 JDBC 等价验证 |
| 前置 | Alignment-2A.1 独立 QA 90/0/0/0、P0～P3=0，用户正式接受并授权 2A.2 |
| 正式文档 | [Alignment-2A Development Plan](./CENTRAL-JAVA-ALIGNMENT-2A-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 已实现边界

- 新增 8 个 Persistence Entity、显式 Domain Converter、UUID/TEXT[]
  TypeHandler、Authentication/Configuration Mapper/XML；
- 新增 `MyBatisAuthenticationPersistence`、
  `MyBatisConfigurationPersistence` 与 `SpringCentralTransactionRunner`；
- 关键 `FOR UPDATE`、`ON CONFLICT`、revision、consume、conditional
  update 均为固定显式 SQL；
- JDBC/MyBatis 共用 Persistence、Recovery、Concurrency Conformance；
- 真实 PostgreSQL 证明 MyBatis SqlSession 与 Spring Transaction 共用同一
  JDBC Connection；
- 32 路 Token issuance、20 路 Enrollment replay、close/reopen、故障注入和
  回滚矩阵均通过；
- Central online/offline 各 98 tests、0 failures、0 errors、0 skipped。

## 当前门槛

```text
Alignment-2A Plan：CONFIRMED
Alignment-2A.1：PASS / CLOSED
Alignment-2A.2：IMPLEMENTED / DEVELOPER SELF-TEST PASS / INDEPENDENT QA PENDING
Alignment-2A.3：GATED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

旧 JDBC Adapter 仍为生产路径；Production Cutover、旧实现删除和 Flyway
test scope 清理只属于 2A.3。Claude Code 必须独立实际执行完整门禁，用户
接受后才能关闭 2A.2；本节点不授权 2A.3、Alignment-2B 或 CGF-2。

---

# KN-090：关闭 Alignment-2A.2 并完成 2A.3 Production Cutover

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-29 |
| 状态 | **2A.2 PASS/CLOSED；2A.3 IMPLEMENTED / INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cja.2a.3` |
| 主题 | MyBatis-Plus 成为唯一生产 Persistence，清理 JDBC/Flyway 并固定启动前 Preflight |
| 前置 | Alignment-2A.2 独立 QA 98/0/0/0、P0～P3=0，用户正式接受并授权 2A.3 |
| 正式文档 | [Alignment-2A Development Plan](./CENTRAL-JAVA-ALIGNMENT-2A-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 已实现边界

- 删除三项旧 JDBC Persistence/Transaction 生产实现及其测试 Variant；
- 删除 Flyway test dependency 和自动 Migration 资源路径；
- V1～V5 仅作为受控 legacy audit/digest 事实，由无 Flyway 的 Test-only
  Installer 重建精确历史；
- 正式 Spring/MyBatis 装配只在 DataSource 存在时生效，并在 ready 前执行
  Schema Ledger/Manifest/Structure Preflight；
- Persistence、Recovery、Concurrency、Enrollment 统一使用 Script +
  MyBatis；
- Central online/offline 各 96 tests 全通过，Testcontainers 与 Embedded
  PostgreSQL 16 均实际执行；
- dependency tree、fat jar 和生产源码审计确认 Flyway/旧 JDBC 路径为零；
- 根级 CGF Guard 已迁移到 MyBatis、受控 legacy SQL、Bearer Filter 与
  Response Assembler 的当前所有权，完整 101 files / 644 tests 门禁通过；
- 未修改公共 Contract/Schema/Fixture，未进入 Alignment-2B 或 CGF-2。

## 当前门槛

```text
Alignment-2A Plan：CONFIRMED
Alignment-2A.1：PASS / CLOSED
Alignment-2A.2：PASS / CLOSED
Alignment-2A.3：IMPLEMENTED / DEVELOPER SELF-TEST PASS / INDEPENDENT QA PENDING
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

Claude Code 必须独立实际执行完整门禁；用户接受后才能关闭 2A.3 与
Alignment-2A。本节点不授权 Alignment-2B 或 CGF-2。

---

# KN-091：关闭 Alignment-2A.3 与 Alignment-2A

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-29 |
| 状态 | **Alignment-2A.3 PASS/CLOSED；Alignment-2A PASS/CLOSED** |
| 阶段 | `0.0.0-cja.2a.3` |
| 主题 | 接受 Production Persistence Cutover 独立 QA 并关闭 Alignment-2A |
| 依据 | Central online/offline 各 96/0/0/0；Testcontainers 与 Embedded PostgreSQL 实际执行；P0～P3=0；用户正式接受 |
| 正式文档 | [独立 QA](../development/qa/0.0.0-cja.2a.3-claude-qa.md)、[Alignment-2A Development Plan](./CENTRAL-JAVA-ALIGNMENT-2A-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 最终结论

- MyBatis-Plus 是 Central 唯一生产 Persistence 实现；
- 生产 Flyway、JdbcTemplate、旧 JDBC Persistence 和自动 Migration 路径
  均为零；
- V1～V5 仅保留为受控 legacy audit 事实；
- Fresh、V5 Bridge、Preflight、Persistence、Recovery、Concurrency、
  Testcontainers 与 Embedded PostgreSQL 矩阵均通过；
- Alignment-2A.1、2A.2、2A.3 和 Alignment-2A 全部关闭。

## 后续门槛

```text
Alignment-2B：GATED / 等待方案确认和用户明确授权
CGF-2：GATED / RE-ALIGNMENT PENDING / 等待方案确认和用户明确授权
```

Alignment-2A 的关闭不授权后续阶段编码。

---

# KN-092：确认 Alignment-2B 方案并完成 2B.1 实现

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-29 |
| 状态 | **ALIGNMENT-2B PLAN CONFIRMED；2B.1 IMPLEMENTED / INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cja.2b.1` |
| 主题 | Production Dependency Manifest、失败关闭与空业务库 Readiness |
| 依据 | Alignment-2B 修订版 Claude 复核 P0～P3=0；用户确认正式方案并授权 2B.1；开发者 Central online/offline 各 109 tests PASS |
| 正式文档 | [Alignment-2B Development Plan](./CENTRAL-JAVA-ALIGNMENT-2B-DEVELOPMENT-PLAN.md)、[ADR-016](../adr/016-central-java-engineering-baseline.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 已实现边界

- Production Dependency Manifest 按类型白名单登记数据库、事务、MyBatis、
  Schema、Identity、Device、Secret、Token、Compatibility 和配置仓储；
- 缺失、歧义或 Fake/InMemory/Development Bean 在 Context ready 前 typed
  failure，不使用 `@Primary`、`@ConditionalOnMissingBean` 或 Fake fallback；
- Production Readiness 验证 `SELECT 1`、Schema ledger/version/digest/
  manifest/preflight 和两类零结果表读取；
- 合法空业务库允许 Ready，业务数据不存在由请求级 typed error 表达；
- liveness/readiness 分离，Foundation Fixture 不在 production 暴露；
- Source Guard、ApplicationContextRunner、动态失败矩阵与 Testcontainers/
  Embedded PostgreSQL 真探针通过；
- 未进入双 JVM、跨节点 Permission revision、Model Gateway 或 CGF-2。

## 当前门槛

```text
Alignment-2B：CONFIRMED_WITH_SPECIFIED_REVISIONS
Alignment-2B.1：IMPLEMENTED / DEVELOPER SELF-TEST PASS / INDEPENDENT QA PENDING
Alignment-2B.2：GATED
Alignment-2B.3：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

Claude Code 必须独立实际执行完整门禁。用户接受独立 QA 后才可关闭 2B.1 并
解锁 2B.2；本节点不授权 2B.2、2B.3 或 CGF-2。

# KN-093：关闭 Alignment-2B.1 并完成 2B.2 双节点实现

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-29 |
| 状态 | **2B.1 PASS/CLOSED；2B.2 IMPLEMENTED / INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cja.2b.2` |
| 主题 | 双 JVM、共享 PostgreSQL 与 Central Foundation 无状态正确性 |
| 依据 | Alignment-2B.1 独立 QA 109/0/0/0、P0～P3=0 且用户正式接受；用户明确授权 2B.2；开发者 Central online/offline 各 113 tests PASS |
| 正式文档 | [Alignment-2B Development Plan](./CENTRAL-JAVA-ALIGNMENT-2B-DEVELOPMENT-PLAN.md)、[ADR-016](../adr/016-central-java-engineering-baseline.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 已实现边界

- 两个独立 Java PID、随机 loopback 端口和独立 Hikari 连接池共享同一个
  PostgreSQL 16；
- 验证跨节点 Challenge、Device Proof、Token、Configuration、exact Package、
  ETag 304 和 Permission revision；
- 同一 Challenge 并发消费由 PostgreSQL 保证恰好一个成功；
- A 停止后 B 继续服务，A 以新 PID 重启后只从 PostgreSQL 和测试 Port 恢复；
- 测试 Token key 运行时随机生成并仅经环境注入，Harness 和控制端点只存在于
  test source；
- Central online/offline 各 113/0/0/0，工作区 107 files / 678 tests 和
  全部 smoke 通过；
- 未修改公共 Contract/Schema/Fixture、V1～V5 或生产业务源码，未进入
  Alignment-2B.3、Model Gateway 或 CGF-2。

## 当前门槛

```text
Alignment-2B：CONFIRMED_WITH_SPECIFIED_REVISIONS
Alignment-2B.1：PASS / CLOSED
Alignment-2B.2：IMPLEMENTED / DEVELOPER SELF-TEST PASS / INDEPENDENT QA PENDING
Alignment-2B.3：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

Claude Code 必须独立实际执行双 JVM Harness 和完整门禁。用户接受独立 QA
后才可关闭 2B.2 并解锁 2B.3；本节点不授权 2B.3 或 CGF-2。

# KN-094：关闭 Alignment-2B.2 并完成 2B.3 故障恢复收口

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **2B.2 PASS/CLOSED；2B.3 IMPLEMENTED / INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cja.2b.3` |
| 主题 | 双 JVM 事务崩溃、数据库恢复、Schema 漂移与资源归零 |
| 依据 | Alignment-2B.2 独立 QA 113/0/0/0、P0～P3=0 且用户正式接受；用户明确授权 2B.3；开发者 Central online/offline 各 117 tests PASS |
| 正式文档 | [Alignment-2B Development Plan](./CENTRAL-JAVA-ALIGNMENT-2B-DEVELOPMENT-PLAN.md)、[ADR-016](../adr/016-central-java-engineering-baseline.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 已实现边界

- commit 前 JVM 退出由 PostgreSQL 回滚；commit 后响应丢失由另一节点按
  revision/content 幂等或 conflict 收敛；
- Challenge 消费中断只允许成功或已消费两种可信结果；
- PostgreSQL 中断使两节点 readiness 降级，恢复后无需重启 JVM 即重新 ready；
- Schema digest 漂移使两节点失败关闭，恢复权威 digest 后重新 ready；
- 重复启动/停止验证 PID、子进程、端口、Hikari 连接与 PostgreSQL 会话归零；
- 故障注入、Docker pause 和 Schema 漂移控制只存在于 test source；
- Central online/offline 各 117/0/0/0，工作区 107 files / 678 tests 和全部
  smoke 通过；
- 未修改公共 Contract/Schema/Fixture、V1～V5 或生产业务源码，未建立通用
  lease/claim，未进入 Model Gateway 或 CGF-2。

## 当前门槛

```text
Alignment-2B：CONFIRMED_WITH_SPECIFIED_REVISIONS
Alignment-2B.1：PASS / CLOSED
Alignment-2B.2：PASS / CLOSED
Alignment-2B.3：IMPLEMENTED / DEVELOPER SELF-TEST PASS / INDEPENDENT QA PENDING
CGF-2：GATED / RE-ALIGNMENT PENDING
```

Claude Code 必须独立实际重跑真实双 JVM 故障矩阵、Central online/offline 和
工作区完整门禁。用户接受独立 QA 后才可关闭 Alignment-2B.3 与
Alignment-2B；CGF-2 不因本批实现或阶段关闭自动解锁。

# KN-095：关闭 Alignment-2B.3 与 Alignment-2B

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **Alignment-2B.3 PASS/CLOSED；Alignment-2B PASS/CLOSED** |
| 阶段 | `0.0.0-cja.2b.3` |
| 主题 | Central Java 无状态集群工程基线完成独立 QA 与用户接受 |
| 依据 | Claude Code 独立 QA：Central online/offline 各 117/0/0/0、工作区 107 files / 678 tests、P0～P3=0；用户正式接受并关闭 |
| 正式文档 | [Alignment-2B Development Plan](./CENTRAL-JAVA-ALIGNMENT-2B-DEVELOPMENT-PLAN.md)、[ADR-016](../adr/016-central-java-engineering-baseline.md)、[Claude QA](../development/qa/0.0.0-cja.2b.3-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- Alignment-2B.1、2B.2、2B.3 全部独立 QA `PASS` 且已获用户接受；
- Central Foundation 已证明 Production fail-closed、双 JVM 无状态正确性、
  故障恢复和资源收口；
- 该结论不代表 Model Gateway、CAS、MaaS 或企业试点已经完成；
- CGF-2 不因 Alignment-2B 关闭自动解锁。

## 下一道门槛

```text
Alignment-2B：PASS / CLOSED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

进入 CGF-2 前必须依次完成：方案重新对齐、评审确认、用户对具体开发批次的
明确授权。

# KN-096：完成 CGF-2 方案重新对齐草案

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **REALIGNED_DRAFT / REVIEW REQUIRED；CGF-2 GATED** |
| 阶段 | CGF-2 Model Gateway Foundation 方案重新对齐 |
| 主题 | ADR-016、Alignment-2、双协议 Provider 与无状态 Model Invocation |
| 依据 | Alignment-2B `PASS/CLOSED`；用户要求开始下一步；ADR-016 §12/§14 |
| 正式文档 | [CGF-2 Development Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[ADR-015 草案](../adr/015-enterprise-model-invocation-and-development-provider-boundary.md)、[ADR-016](../adr/016-central-java-engineering-baseline.md) |

## 重新对齐结论

- Persistence 固定为 MyBatis-Plus Adapter + 关键显式 SQL；
- Schema 固定为下一个可用版本化 SQL、manifest、digest 与只读 Preflight，
  不使用 Flyway；
- Invocation、Durable Event、cancel、dispatch decision、lease、fencing 和
  recovery owner 以 PostgreSQL 为权威；
- Model Invocation 必须通过两个独立 Java PID 的双节点接管、迟到 epoch 拒绝、
  SSE reconnect 和资源归零 Harness；
- Central 同时建立 Anthropic-compatible 与 OpenAI-compatible 独立 Adapter，
  不建设万能 Provider 或自动协议切换；
- CGF-2B 真实 DeepSeek 仅使用 synthetic 非敏感 Prompt；真实用户内容必须等
  CGF-2C 类型化外发确认；
- Central Invocation outcome 与 Local delivery outcome 分离，残缺 Assistant
  Message 不得伪装成完整持久消息；
- 真实 Tool Calling 不作为文本 Model Gateway Foundation 强制关闭门槛。

## 当前门槛

```text
ADR-015：PROPOSED / REALIGNED / NOT ACCEPTED
CGF-2 Plan：REALIGNED_DRAFT / REVIEW REQUIRED
CGF-2：GATED
CGF-2.0：GATED
```

下一步仅允许 Claude Code/MiniMax 文档评审、问题修订和用户确认。未获得用户对
CGF-2.0 的明确授权前不得修改 Contract、SQL 或业务代码。

# KN-097：接受 ADR-015 与 CGF-2 计划并授权 CGF-2.0

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **ADR-015 ACCEPTED；CGF-2 PLAN CONFIRMED；CGF-2.0 AUTHORIZED** |
| 阶段 | CGF-2.0：ADR、Contract、Fixture、Conformance 与威胁模型 |
| 主题 | 通用 Enterprise Model Invocation 语义正式冻结并进入首批实现 |
| 依据 | Claude Code 修订版复核 6 项 P2、3 项 P3 全部关闭，P0～P3=0；用户正式接受 ADR-015、确认 CGF-2 Plan 并明确授权 CGF-2.0 |
| 正式文档 | [ADR-015](../adr/015-enterprise-model-invocation-and-development-provider-boundary.md)、[CGF-2 Development Plan](./CGF-2-DEVELOPMENT-PLAN.md) |

## 冻结结论

- Model Invocation 使用独立、additive、语言中立的 Enterprise Gateway
  Contract，不复用 Tool Effect/Receipt；
- 公共状态固定为 accepted、running、completed、failed、cancelled、
  timed_out、uncertain；
- Durable Event 与 ephemeral delta 分离，opaque cursor 不与 Task/Event
  sequence 混用；
- lease TTL、Provider request deadline、stream idle timeout 与 recovery
  query deadline 分离，uncertain 按可信证据收敛；
- Anthropic-compatible 与 OpenAI-compatible 使用独立 Adapter/Stub
  Conformance，第二协议真实企业 Endpoint 验证后置；
- CGF-2B synthetic 与 CGF-2C 真实用户外发严格分层；
- 业务场景排序、HTML Fake Provider 和日历排期不属于 CGF-2 技术门槛。

## 当前门槛

```text
ADR-015：ACCEPTED
CGF-2 Plan：CONFIRMED
CGF-2：IN PROGRESS / CGF-2.0
CGF-2.0：AUTHORIZED
CGF-2A：GATED
CGF-2B：GATED
CGF-2C：GATED
```

CGF-2.0 仅允许实现 Contract、Fixture、TypeScript/Java Conformance、威胁模型
和架构护栏。未经过独立 QA、用户接受和明确授权，不得进入 CGF-2A SQL、
Persistence、Durable Runtime 或双 JVM Recovery 实现。

# KN-098：完成 CGF-2.0 Model Gateway Contract 与双语言 Conformance

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **IMPLEMENTED / DEVELOPER SELF-TEST PASS；INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cgf.2.0` |
| 主题 | Enterprise Model Invocation 公共 Contract、内部恢复协调和安全边界落地 |
| 依据 | 用户已接受 ADR-015 并授权 CGF-2.0；开发者完整门禁 Node 107/685、Central online/offline 各 124/0/0/0 |
| 正式文档 | [CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[CGF-2.0 Threat Model](./CGF-2.0-MODEL-GATEWAY-THREAT-MODEL.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-049](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已实现边界

- Enterprise Gateway `v1alpha1` additive 增加 Model Invocation
  accept/status/cancel/SSE；
- 公共状态固定为七项，固定 `enterprise-model-gateway` audience 与
  `model.use` permission，精确锁定 Model/config/runtime generation；
- provider-neutral Message/Tool/Event 与 strict safety limit 已冻结；
- durable lifecycle/usage 与 ephemeral delta 分离；
- server-owned recovery policy、lease、takeover 和 fenced commit 使用独立
  内部协调 Schema，客户端不能提交 lease/recovery control；
- Anthropic-compatible 与 OpenAI-compatible test-only 私有帧在 TS/Java
  映射为同一 provider-neutral Projection；
- 状态、幂等、timeout、sequence、cursor、fencing 和 Credential 禁入由共享
  Fixture/Conformance 与 Architecture Guard 验证；
- 没有创建 SQL、Persistence、Controller、Provider Adapter、真实 Model 调用
  或 Desktop 外发链路。

## 当前门槛

```text
CGF-2.0：IMPLEMENTED / DEVELOPER SELF-TEST PASS / INDEPENDENT QA PENDING
CGF-2A：GATED
CGF-2B：GATED
CGF-2C：GATED
```

Claude Code 必须独立实际重跑 TS/Java 共用 corpus、完整 Node 门禁和 Central
online/offline。只有用户接受独立 QA 并明确授权 CGF-2A 后，才允许增加下一个
可用 SQL 版本、Model Invocation Persistence、Durable Event 或 lease/fencing
Runtime。

# KN-099：CGF-2.0 正式关闭并完成 CGF-2A.1 Persistence Foundation

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **CGF-2.0 PASS/CLOSED；CGF-2A.1 IMPLEMENTED / INDEPENDENT QA PENDING** |
| 阶段 | `0.0.0-cgf.2a.1` |
| 主题 | Model Invocation PostgreSQL Schema、Persistence 与 Conformance |
| 依据 | CGF-2.0 独立 QA 124/0/0/0、P0～P3=0 已由用户正式接受；用户授权进入 CGF-2A |
| 正式文档 | [ADR-015](../adr/015-enterprise-model-invocation-and-development-provider-boundary.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 本批结论

- `v0007` 是实现前确认的下一个可用 PostgreSQL 版本；v0006 与更早历史文件
  保持冻结；
- 新增 Model Invocation、Durable Event、Recovery Lease 与 Audit Outbox
  Schema/Domain/Port；
- InMemory 与 MyBatis-Plus 使用同一幂等、冲突、revision、sequence、
  fencing、rollback 和并发单写者 Conformance；
- Prompt、Model 输出、token delta、Credential 与 Provider endpoint
  不进入持久层；
- 未进入 Application Runtime、Provider Adapter、真实模型调用、双 JVM
  Recovery Harness 或 Desktop 外发。

## 当前门槛

```text
CGF-2.0：PASS / CLOSED
CGF-2A.1：IMPLEMENTED / DEVELOPER SELF-TEST PASS / INDEPENDENT QA PENDING
CGF-2A.2：GATED
CGF-2A.3：GATED
CGF-2B：GATED
CGF-2C：GATED
```

CGF-2A.1 必须经 Claude Code 独立实际重跑并由用户接受，方可进入
CGF-2A.2；本节点不授权后续批次。

# KN-100：关闭 CGF-2A.1 并进入 ADR-015 补充修订 A 文档评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **CGF-2A.1 PASS/CLOSED；ADDENDUM A DOCUMENT REVIEW；CGF-2A.2 GATED** |
| 阶段 | CGF-2 Model Gateway Foundation |
| 主题 | Durable Persistence Foundation 正式关闭，厂商直连与企业中转边界进入评审 |
| 依据 | Claude Code 独立 QA Central online/offline 各 134/0/0/0、Workspace 107/685、P0～P3=0；用户正式接受 CGF-2A.1 |
| 正式文档 | [ADR-015 补充修订 A](../adr/015a-direct-provider-and-custom-relay-addendum.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 结论

- CGF-2A.1 Schema v0007、Domain/Port、InMemory/MyBatis Persistence 与
  Conformance 正式关闭；
- CGF-2.0 与 CGF-2A.1 不因补充修订返工；
- ADR-015 补充修订 A 保持 `PROPOSED`，进入用户确认以及 Claude
  Code/MiniMax 文档评审；
- RoboThree 候选方向为同时支持厂商直连与企业中转站，但不建设模型报备、
  Key 签发、聚合路由和运营平台；
- 本节点不授权 CGF-2A.2、2A.3、2B 或 2C。

## 当前门槛

```text
CGF-2A.1：PASS / CLOSED
ADR-015 补充修订 A：PROPOSED / DOCUMENT REVIEW
CGF-2A.2：GATED
CGF-2A.3：GATED
CGF-2B：GATED
CGF-2C：GATED
```

## Claude Code 首轮评审补充

Claude Code 对 ADR-015 补充修订 A 的首轮结论为：

```text
P0=0
P1=0
P2=2
P3=2
可进入用户接受流程
```

Codex 5.6 已吸收四项修订：

- 固定保留不可变历史 Binding revision，不物化 Endpoint/Credential 到
  Invocation；
- 两条真实链路使用不同 Binding、Base URL、Credential 和 canary；允许企业
  Relay 保留相同 upstream Model ID；
- Admin UI 后置，不作为 Foundation 门槛；
- 补全 capability/timeout Profile revision 的所有权。

当前等待 Claude Code 复核；CGF-2A.2 继续 `GATED`。

# KN-101：ADR-015 补充修订 A 文档复核通过

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **REVIEW_PASS / USER_ACCEPTANCE_PENDING；CGF-2A.2 GATED** |
| 阶段 | ADR-015 补充修订 A |
| 主题 | 厂商直连、自定义中转站与 Model Endpoint Binding 边界完成复核 |
| 依据 | Claude Code 修订版复核 P0=0、P1=0、P2=0、P3=0，全部四项关闭 |
| 正式文档 | [ADR-015 补充修订 A](../adr/015a-direct-provider-and-custom-relay-addendum.md)、[讨论线程](../../../讨论区/20260730/002-model-access-cx.md) |

## 复核结论

- 固定不可变 Binding revision 保留，不向 Invocation 物化连接字段；
- 厂商直连与企业中转站以不同 Connection、Binding、URL、Credential 和
  canary 验证，upstream Model ID 保持灵活；
- Admin UI 后置，Foundation 使用版本化 Seed；
- Capability/Timeout Profile 的内容、所有权和精确 revision 已明确；
- 对 CGF-2.0、CGF-2A.1 和 v0007 Schema 零影响。

## 当前门槛

```text
ADR-015 补充修订 A：PROPOSED / REVIEW_PASS / USER_ACCEPTANCE_PENDING
CGF-2A.2：GATED
CGF-2A.3：GATED
CGF-2B：GATED
CGF-2C：GATED
```

# KN-102：接受 ADR-015 补充修订 A 并修订 CGF-2 开发计划

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **ADR-015 ADDENDUM A ACCEPTED；CGF-2 PLAN REVISION PENDING CONFIRMATION；CGF-2A.2 GATED** |
| 阶段 | CGF-2 Model Gateway Foundation |
| 主题 | 冻结厂商直连、自定义中转站与 Model Endpoint Binding 增量边界 |
| 依据 | 用户正式接受 ADR-015 补充修订 A；Claude Code 修订版复核 P0～P3=0 |
| 正式文档 | [ADR-015 补充修订 A](../adr/015a-direct-provider-and-custom-relay-addendum.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md) |

## 结论

- `direct_provider` 与 `custom_relay` 是同等级 Connection Mode；
- Protocol Adapter 与 Connection Mode 正交；
- Central 使用不可变历史 `ModelEndpointBinding` revision 恢复原连接事实，
  不向 Invocation 物化 Base URL 或 Credential；
- Foundation 使用版本化 Seed，Admin Model 页面后置；
- CGF-2.0、CGF-2A.1 无需返工；
- CGF-2A.2 不因 ADR 接受自动解锁。

## 当前门槛

```text
ADR-015 补充修订 A：ACCEPTED
CGF-2 Plan 补充对齐修订：USER_CONFIRMATION_PENDING
CGF-2A.2：GATED
CGF-2A.3：GATED
CGF-2B：GATED
CGF-2C：GATED
```

# KN-103：CGF-2 补充对齐计划复核通过

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **PLAN REVIEW PASS / USER CONFIRMATION PENDING；CGF-2A.2 GATED** |
| 阶段 | CGF-2 Model Gateway Foundation |
| 主题 | ADR-015a 与 CGF-2 Plan 补充对齐完成无问题复核 |
| 依据 | Claude Code：ADR-015a 修订版复核 P0～P3=0、四项关闭；CGF-2 Plan 补充对齐修订复核 P0～P3=0 |
| 正式文档 | [ADR-015 补充修订 A](../adr/015a-direct-provider-and-custom-relay-addendum.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[讨论线程](../../../讨论区/20260730/002-model-access-cx.md) |

## 结论

- ADR-015 补充修订 A 保持 `ACCEPTED`；
- CGF-2 Plan 补充对齐修订无 P0/P1/P2/P3；
- CGF-2.0、CGF-2A.1 无需返工；
- 当前只等待用户确认修订计划和明确授权 CGF-2A.2；
- 计划复核通过不自动解锁 CGF-2A.2。

## 当前门槛

```text
ADR-015 补充修订 A：ACCEPTED
CGF-2 Plan 补充对齐修订：REVIEW_PASS / USER_CONFIRMATION_PENDING
CGF-2A.2：GATED
CGF-2A.3：GATED
CGF-2B：GATED
CGF-2C：GATED
```

# KN-104：接受 OpenWorker 修订决断并建立 ADR-017

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-30 |
| 状态 | **ADR-017 ACCEPTED / DOCUMENT REVIEW PENDING；CGF-2A.2 GATED** |
| 阶段 | CGF-2 Model Gateway Foundation / Core Agent Runtime |
| 主题 | Tool-Call 批次收敛、取消与恢复，以及 Skill 渐进披露边界 |
| 依据 | 用户接受修订后的 OpenWorker 最终决断，并允许建立 ADR-017 与相关计划修订 |
| 正式文档 | [ADR-017](../adr/017-agent-tool-call-batch-completion-cancellation-and-recovery.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Desktop Foundation Plan](./DESKTOP-CLIENT-FOUNDATION-DEVELOPMENT-PLAN.md)、[AR-050](./UPSTREAM-ADOPTION-REGISTER.md) |

## 结论

- RoboThree 接受 no-orphan Tool Call completion 不变量，但使用自有
  Task/Run/Effect/Confirmation/Conversation 模型实现，不复制 OpenWorker 源码；
- 用户取消与进程崩溃必须形成不同 durable 事实；尚未分发的调用在取消后不得
  被 crash recovery 重新执行；
- 同批调用保持稳定顺序，等待用户确认时后续调用不得越过确认点；
- Retry 创建新 Run，不继承旧 pending 调用，不自动重放或复用旧 Run 的成功
  Tool Call；
- ADR-017 的实现、Conformance、独立 QA 和用户接受是 CGF-2C.1 的硬门槛，
  但不新增 `CGF-2C.0` 批次；
- Skill Runtime 采用 Summary Catalog + Locked Body Materialization 两级披露，
  不把 `load_skill` 建模为 Agent Tool；
- OpenWorker 低风险并行调度和通用 Inbox/Message Bus 延后；
- CGF-2.0、CGF-2A.1 已 `PASS/CLOSED`，本次文档修订不返工既有实现。

## 当前门槛

```text
ADR-017：ACCEPTED / DOCUMENT CONSISTENCY REVIEW PENDING / NOT IMPLEMENTED
CGF-2 Plan OpenWorker 对齐修订：DOCUMENT REVIEW PENDING
CGF-2.0：PASS / CLOSED
CGF-2A.1：PASS / CLOSED
CGF-2A.2：GATED
CGF-2A.3：GATED
CGF-2B：GATED
CGF-2C：GATED
```

Claude Code 完成文档一致性复核、文档问题关闭且用户明确授权前，
不得进入 CGF-2A.2 编码。本节点只记录架构与计划收口，不代表 ADR-017
已经实现，也不授权 CGF-2C。

# KN-105：ADR-017 与 OpenWorker 对齐文档一致性复核通过

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **DOCUMENT REVIEW PASS；CGF-2A.2 USER AUTHORIZATION PENDING / GATED** |
| 阶段 | CGF-2 Model Gateway Foundation / Core Agent Runtime |
| 主题 | ADR-017、CGF-2 Plan、Skill Runtime 与治理记录完成一致性复核 |
| 依据 | Claude Code：10 份文档全部一致，P0=0、P1=0、P2=0、P3=0 |
| 正式文档 | [ADR-017](../adr/017-agent-tool-call-batch-completion-cancellation-and-recovery.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[AR-050](./UPSTREAM-ADOPTION-REGISTER.md)、[讨论线程](../../../讨论区/20260730/003-openworker-cx.md) |

## 复核结论

- ADR-017 定位保持为 CGF-2C.1 前置硬门槛，不新增 `CGF-2C.0`；
- CGF-2 Plan §7.0 已正确表达实现、Conformance、独立 QA、用户接受等前置
  条件；
- Development Log 明确本批只有文档收口，不修改代码、Schema 或版本；
- 并行 Tool、通用 Inbox 和多模式权限继续保持 `DEFER` 或 `REJECT`；
- ADR-017、AR-050、KN-104 编号连续；
- 文档复核通过不代表 ADR-017 已实现，也不自动解锁 CGF-2A.2。

## 当前门槛

```text
ADR-017：ACCEPTED / DOCUMENT CONSISTENCY REVIEW PASS / NOT IMPLEMENTED
CGF-2 Plan OpenWorker 对齐修订：DOCUMENT REVIEW PASS
CGF-2.0：PASS / CLOSED
CGF-2A.1：PASS / CLOSED
CGF-2A.2：GATED / USER AUTHORIZATION PENDING
CGF-2A.3：GATED
CGF-2B：GATED
CGF-2C：GATED
```

下一步只等待用户明确授权 CGF-2A.2。未经授权，不得开始 Application Runtime
编码。

# KN-106：CGF-2A.2 Application Runtime 完成开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **DEVELOPER_SELF_TEST_PASS / INDEPENDENT_QA_PENDING** |
| 阶段 | CGF-2A.2：Application Runtime、Binding Resolver、Durable Event 与 Lease/Fencing |
| 依据 | 用户明确授权开始 CGF-2A.2；CGF-2A.1 已 PASS/CLOSED |
| 正式文档 | [CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-051](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已完成

- 建立 Provider-neutral Model Invocation Application Runtime 和类型化
  Binding/状态/Credential/Endpoint/Execution Port；
- 仅接入版本化 Development Binding Seed 与 Scripted Fake Provider，不实现
  真实 Anthropic/OpenAI-compatible Wire Adapter；
- `accepted`、dispatch decision、`running`、terminal、Durable Event 与
  Audit Outbox 按事务边界持久化，Provider 调用发生在 running commit 之后；
- token delta 只进入有界 ephemeral buffer，不作为恢复事实；
- 使用数据库时间 recovery lease、fencing epoch、过期 takeover 和 stale
  owner 写入拒绝；
- 冻结 idempotent retry、query-then-retry、manual reconciliation 三种恢复；
- v0007 保持不变，64 字符 dispatch decision 以 canonical digest 同时锁定
  Binding revision/digest，URL、Credential 与 HTTP Client 不落库；
- InMemory、Testcontainers PostgreSQL 16 与 Embedded PostgreSQL 16 的
  Application Runtime/Adapter 重建场景通过开发者测试。

## 边界

```text
CGF-2A.2：DEVELOPER_SELF_TEST_PASS / INDEPENDENT_QA_PENDING
CGF-2A.3：GATED
CGF-2B：GATED
CGF-2C：GATED
```

本节点不代表独立 QA 或用户验收，不授权真实 Provider、双 JVM Recovery
Harness、Model HTTP/SSE Controller 或 Desktop 用户内容外发。

# KN-107：CGF-2A.2 正式关闭并完成 CGF-2A.3 双 JVM恢复开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **CGF-2A.2 PASS/CLOSED；CGF-2A.3 DEVELOPER_SELF_TEST_PASS / INDEPENDENT_QA_PENDING** |
| 阶段 | CGF-2A.3：真实双 JVM Model Invocation Recovery Harness |
| 依据 | CGF-2A.2 独立 QA P0～P3=0 且用户正式接受；用户明确授权进入 CGF-2A.3 |
| 正式文档 | [CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-052](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已完成

- CGF-2A.2 独立 QA 在线/离线各 148/0/0/0、工作区 107/685、P0～P3=0
  已由用户接受，阶段正式关闭；
- CGF-2A.3 使用两个真实独立 Java PID、随机 loopback 端口、独立 Hikari
  Pool 与共享 PostgreSQL 16，不使用同 JVM 双 ApplicationContext；
- 同一 Harness 覆盖跨节点 durable SSE reconnect、running 后 crash、
  database-time lease takeover、旧 epoch 迟到提交拒绝、cancel/completion
  单终态和并发幂等/conflict；
- 补充 PostgreSQL pause/unpause、v0007 digest 漂移失败关闭及重复 JVM
  启停后的 PID、端口、连接、active lease、subscriber 和阻塞资源归零；
- test-only Profile 承载 Controller、Backend、ProcessBuilder 和故障注入，
  生产 Contract、v0007、Model Runtime、HTTP Surface 均未改变；
- 开发者 Central 在线/离线各 153/0/0/0，工作区 Architecture + 107/685
  以及 Core/Desktop/Preload smoke 全部通过。

## 边界

```text
CGF-2A.2：PASS / CLOSED
CGF-2A.3：DEVELOPER_SELF_TEST_PASS / INDEPENDENT_QA_PENDING
CGF-2B：GATED
CGF-2C：GATED
```

本节点不代表 CGF-2A.3 独立 QA 或用户验收，不授权真实 Provider、正式
Model HTTP/SSE Controller、真实模型调用或 Desktop 用户内容外发。

# KN-108：CGF-2A.3 与 CGF-2A 整体正式关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **CGF-2A.3 PASS/CLOSED；CGF-2A PASS/CLOSED** |
| 阶段 | CGF-2A Durable Model Invocation、Application Runtime 与双 JVM Recovery Foundation |
| 依据 | Claude Code 独立 QA Central online/offline 各 153/0/0/0、工作区 107/685、P0～P3=0；用户正式接受 |
| 正式文档 | [CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[QA Report](../development/qa/0.0.0-cgf.2a.3-claude-qa.md) |

## 关闭结论

- CGF-2A.1 的 v0007 Schema、Domain、Persistence，CGF-2A.2 的
  Application Runtime、Binding、Lease/Fencing，以及 CGF-2A.3 的真实双
  JVM Recovery Harness 均已完成独立 QA 和用户验收；
- CGF-2A 全阶段 P0/P1/P2/P3 均为 0，正式 `PASS/CLOSED`；
- 本次只同步阶段状态，没有修改代码、Contract、Schema、依赖或开发版本；
- CGF-2B、CGF-2C 不因 CGF-2A 关闭而自动解锁。

## 下一门槛

```text
CGF-2A：PASS / CLOSED
CGF-2B：GATED / PLAN RECONFIRMATION + USER AUTHORIZATION REQUIRED
CGF-2C：GATED
```

下一步仅允许重新确认 CGF-2B 的真实 Provider Adapter 方案。未经用户明确
授权，不得开始 CGF-2B 编码，也不得进入 CGF-2C Desktop 用户内容外发。

# KN-109：CGF-2B.1 阶段前差异确认与开发计划草案

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **PHASE-DIFF COMPLETE / PLAN DRAFT / USER CONFIRMATION PENDING** |
| 阶段 | CGF-2B.1：双协议 Provider Stub 与安全传输 |
| 依据 | 用户决定不重审完整 CGF-2B 架构，只做阶段前差异确认并单独确认/授权 B.1 |
| 正式文档 | [CGF-2B.1 Development Plan](./CGF-2B.1-DEVELOPMENT-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md) |

## 差异结论

- CGF-2A 已关闭的 Binding、Credential reference/revision 校验、
  Invocation Runtime、Durable Event、Lease/Fencing 和双 JVM恢复可以直接
  复用；
- B.1 必须补齐 provider-neutral 瞬态请求、实时流式 Sink、Credential
  材料的授权 Transport、生产级 Endpoint/HTTP 安全及两套独立 Provider
  Wire Adapter；
- 这些接缝属于已接受 CGF-2B 范围，不修改 ADR-015/015a、Enterprise
  Gateway `v1alpha1`、PostgreSQL `v0007` 或 CGF-2A 恢复语义；
- B.1 不调用真实 Provider，不使用真实 Key，不建立正式 Controller，不接
  Desktop 用户正文。

## 当前门槛

```text
CGF-2A：PASS / CLOSED
CGF-2B.1：GATED / PLAN CONFIRMATION PENDING
CGF-2B.2：GATED
CGF-2B.3：GATED
CGF-2C：GATED
```

用户确认开发计划并明确授权后，才允许开始 CGF-2B.1 编码；不得据此自动
解锁 CGF-2B.2、2B.3 或 CGF-2C。

# KN-110：CGF-2B.1 双协议 Provider Stub 与安全传输完成开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **DEVELOPER_SELF_TEST_PASS / INDEPENDENT_QA_PENDING** |
| 阶段 | CGF-2B.1：Dual-Protocol Provider Stub and Safe Transport |
| 依据 | 用户确认 CGF-2B.1 开发计划并明确授权；CGF-2A 已 PASS/CLOSED |
| 正式文档 | [CGF-2B.1 Plan](./CGF-2B.1-DEVELOPMENT-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-053](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已完成

- 建立 provider-neutral 瞬态 Request、有界 Stream Sink 与精确 digest 校验；
- 建立 Credential 只在授权 Transport 瞬时使用的边界，认证 Header 不进入
  Adapter、Domain、Runtime、Persistence、日志或公共 Contract；
- 建立严格 Endpoint allowlist、DNS 地址类别、固定 route、禁止 redirect、
  W3C trace Header 白名单、请求/响应/SSE 大小、deadline/cancel/idle 边界；
- 分别实现 Anthropic-compatible 与 OpenAI-compatible Stub Adapter，两套
  独立 Wire Parser 归一为同一 text/Tool fragment/usage/terminal Projection；
- Tool Call fragment 在 terminal 前完成 index/id/name 与完整 JSON 参数校验；
- Central online/offline 各 167 tests、工作区 107 files / 685 tests 全通过；
- 公共 Enterprise Gateway Contract、PostgreSQL v0007、CGF-2A Runtime、
  双 JVM Recovery 和生产 Controller 均未改变；
- 未调用真实 Provider、未使用真实 API Key、未接 Desktop 用户正文。

## 当前门槛

```text
CGF-2B.1：DEVELOPER_SELF_TEST_PASS / INDEPENDENT_QA_PENDING
CGF-2B.2：GATED
CGF-2B.3：GATED
CGF-2C：GATED
```

本节点不代表独立 QA 或用户验收，也不授权真实厂商直连、企业中转站、
Runtime Streaming Bridge 或 Desktop 用户内容外发。

# KN-111：CGF-2B.1 独立 QA 与用户验收完成并正式关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **CGF-2B.1 PASS/CLOSED；CGF-2B.2、2B.3、2C GATED** |
| 阶段 | CGF-2B.1：Dual-Protocol Provider Stub and Safe Transport |
| 依据 | Claude Code 独立 QA P0～P3=0；用户正式接受 |
| 正式文档 | [CGF-2B.1 Plan](./CGF-2B.1-DEVELOPMENT-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[QA Report](../development/qa/0.0.0-cgf.2b.1-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 关闭结论

- Central online/offline 各 167 tests、B.1 专项 27 tests、工作区
  107 files / 685 tests 由 Claude Code 独立重跑通过；
- Anthropic-compatible 与 OpenAI-compatible 两套 Stub Adapter、Credential
  授权 Transport、Endpoint/HTTP/SSE 安全及一致 Projection 验收通过；
- 敏感信息动态扫描通过，P0/P1/P2/P3 均为 0；
- 用户正式接受独立 QA，CGF-2B.1 `PASS/CLOSED`；
- 本次只同步状态，不修改代码、Contract、Schema、依赖或开发版本。

## 下一门槛

```text
CGF-2B.1：PASS / CLOSED
CGF-2B.2：GATED / PLAN CONFIRMATION + TEST RESOURCES + USER AUTHORIZATION REQUIRED
CGF-2B.3：GATED
CGF-2C：GATED
```

CGF-2B.1 关闭不代表真实厂商直连、企业中转站或 Desktop 用户外发已经可用。

# KN-112：CGF-2B.2 厂商直连 Runtime Bridge 与真实 Provider 计划形成

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **PLAN DRAFT / CGF-2B.2 GATED** |
| 阶段 | CGF-2B.2：Direct Provider Runtime Bridge and Real Conformance |
| 依据 | CGF-2B.1 已完成独立 QA 和用户验收；用户要求开始下一步 |
| 正式文档 | [CGF-2B.2 Plan](./CGF-2B.2-DIRECT-PROVIDER-CONFORMANCE-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 计划结论

- B.2 将 B.1 双协议安全 Adapter 接入 CGF-2A 持久 Invocation Runtime，不再
  重建 Provider Wire；
- 新增计划接缝为 Request Source、Provider-backed Execution Backend、live
  Ephemeral Publisher、Adapter Registry 和 Development Credential Source；
- 真实验收只覆盖一条获准厂商直连 Binding 与固定 synthetic 非敏感 request；
- 真实用户内容、企业中转站、双 JVM真实 Provider Recovery 和 Desktop 外发
  继续后置；
- 此前对话中暴露过的旧 Key 禁止继续使用，真实 Harness 前必须撤销/轮换；
- 默认门禁无 Secret、无外网仍可通过，真实 Provider 使用独立 opt-in Harness。

## 当前门槛

```text
CGF-2B.1：PASS / CLOSED
CGF-2B.2：PLAN DRAFT / GATED
CGF-2B.3：GATED
CGF-2C：GATED
```

计划确认、测试资源和用户明确编码授权是三个独立门槛。本节点不授权
CGF-2B.2 编码，也不解锁 CGF-2B.3 或 CGF-2C。

# KN-113：CGF-2B.2 首轮评审完成并形成修订计划

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **REVISED PLAN / DOCUMENT RE-REVIEW PENDING / CGF-2B.2 GATED** |
| 阶段 | CGF-2B.2：Direct Provider Runtime Bridge and Real Conformance |
| 依据 | Claude Code 首轮评审 `P0=0 / P1=0 / P2=3 / P3=2`；MiniMax 补充建议；Codex 5.6 最终技术决策 |
| 正式文档 | [CGF-2B.2 Plan](./CGF-2B.2-DIRECT-PROVIDER-CONFORMANCE-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 修订结论

- Claude Code 提出的 3 项 P2 与 2 项 P3 全部采纳并关闭；
- Provider-backed Backend 只通过 Result 返回执行结果，Runtime 保持 durable
  terminal 唯一提交者；
- ephemeral `clear` 冻结为 best-effort，delta 丢失不得改变 durable facts；
- 自动化 QA 的 Secret 只通过 Harness 子进程受控环境提供，真实 delta 数量
  必须显式记录；
- 接受编码授权与真实 Key/网络资源授权分离；
- 五类业务场景、CAS、前端、Tool Pack 和 PM 统计不构成本批门槛；
- ADR-017 仍是 CGF-2C.1 前置硬门槛，不提前进入 CGF-2B.2。

## 当前门槛

```text
CGF-2B.1：PASS / CLOSED
CGF-2B.2：REVISED PLAN / DOCUMENT RE-REVIEW PENDING / GATED
CGF-2B.2 coding authorization：NOT GRANTED
real Provider resources：NOT GRANTED
CGF-2B.3：GATED
CGF-2C：GATED
```

本节点只记录文档评审与技术取舍，不授权编码，不修改代码、Contract、Schema、
依赖或版本。

# KN-114：CGF-2B.2 获得编码授权并完成无 Secret Runtime Bridge 自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **IMPLEMENTED / DEVELOPER SELF-TEST PASS / REAL PROVIDER RESOURCES GATED / INDEPENDENT QA PENDING** |
| 阶段 | CGF-2B.2：Direct Provider Runtime Bridge and Real Conformance |
| 依据 | 修订计划复核 `P0～P3=0`；用户确认计划并授权编码；版本 `0.0.0-cgf.2b.2` 开发者自测 |
| 正式文档 | [CGF-2B.2 Plan](./CGF-2B.2-DIRECT-PROVIDER-CONFORMANCE-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 实现结论

- 已通过类型化 Request Source、Provider-backed Backend、严格 Adapter
  Registry 和 Ephemeral Publisher 接通 CGF-2A Runtime 与 B.1 双协议
  Adapter；
- Runtime 保持 durable terminal 唯一提交者，Backend 不访问 Repository；
- Anthropic/OpenAI 两套 loopback Stub 通过同一 Bridge Conformance；
- Development Credential Source 只接受预先允许的 opaque reference/revision
  与 Harness 子进程环境，Secret 不进入 Binding、日志或报告；
- 真实 Harness 已覆盖正常 Streaming、invalid Credential、cancel、deadline、
  deltaCount、output digest 与 canary 扫描；
- 无资源执行明确返回 `RESOURCE_GATED`，不访问外网、不误报 PASS；
- 公共 Contract、PostgreSQL v0007、Controller、生产 Profile、Desktop/Core
  均未修改。

## 开发者自测

```text
Central online：180 / 0 / 0 / 0
Central offline：180 / 0 / 0 / 0
Workspace：Architecture PASS + 107 files / 685 tests PASS
Direct Provider Harness：RESOURCE_GATED / no network call attempted
```

## 当前门槛

```text
CGF-2B.1：PASS / CLOSED
CGF-2B.2：IMPLEMENTED / SELF-TEST PASS / REAL RESOURCES GATED / QA PENDING
CGF-2B.3：GATED
CGF-2C：GATED
```

真实 Provider 资源到位并实际通过 Harness、Claude Code 独立 QA 通过且用户
接受之前，不得关闭 CGF-2B.2。

# KN-115：CGF-2B.2 无真实 Provider 独立 QA 已由用户接受

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **WITHOUT REAL PROVIDER QA PASS / USER ACCEPTED / REAL PROVIDER RESOURCES GATED / NOT CLOSED** |
| 阶段 | CGF-2B.2：Direct Provider Runtime Bridge and Real Conformance |
| 依据 | Claude Code 独立 QA `180/0/0/0 x2 + 107/685`、`P0～P3=0`；用户正式接受无真实 Provider 部分 |
| 正式文档 | [QA Report](../development/qa/0.0.0-cgf.2b.2-claude-qa.md)、[CGF-2B.2 Plan](./CGF-2B.2-DIRECT-PROVIDER-CONFORMANCE-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 接受结论

- 无真实 Provider 的 Runtime Bridge、Stub Conformance、Development
  Credential Source、资源门禁与零网络调用行为已通过独立 QA；
- 用户正式接受该部分 QA 结论；
- 真实 Provider Streaming、invalid Credential、cancel、deadline、
  deltaCount 与 canary 泄漏扫描仍未执行；
- `RESOURCE_GATED` 不等于真实 Provider PASS，也不等于阶段关闭。

## 当前门槛

```text
CGF-2B.2 without-real-provider QA：PASS / USER ACCEPTED
real Provider resources and real Harness：GATED
CGF-2B.2 overall：NOT CLOSED
CGF-2B.3：GATED
CGF-2C：GATED
```

# KN-116：CGF-2B.2 真实 Provider Harness 开发者验证通过

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **REAL PROVIDER DEVELOPER HARNESS PASS / REPAIR.1 QA PENDING / CGF-2B.2 NOT CLOSED** |
| 阶段 | CGF-2B.2：Direct Provider Runtime Bridge and Real Conformance |
| 依据 | 用户单独授权受限真实 Provider 资源；版本 `0.0.0-cgf.2b.2-repair.1` 开发者真实联网验证 |
| 正式文档 | [CGF-2B.2 Plan](./CGF-2B.2-DIRECT-PROVIDER-CONFORMANCE-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 验证结论

- 真实 Anthropic-compatible Streaming 产生 83 个 text delta，并形成合法聚合
  与 SHA-256 输出 digest；
- 非法凭证收敛为 `failed`，取消收敛为 `cancelled`，Deadline 收敛为
  `timed_out`；
- Adapter 严格校验 `thinking_delta` / `signature_delta`，但不投影、不持久化
  Provider 私有推理与签名；
- Key 与唯一 canary 泄漏扫描为 0，临时 Key 文件执行后已删除；
- `canaryObserved=false` 仅表示模型未原样复述 canary，不改变 Transport、
  Streaming、终态和泄漏扫描结论。

## 当前门槛

```text
CGF-2B.2 repair.1 developer real Harness：PASS
CGF-2B.2 repair.1 independent QA：PENDING
CGF-2B.2 overall：NOT CLOSED
CGF-2B.3：GATED
CGF-2C：GATED
```

独立 QA 必须实际重跑完整门禁和真实 Provider Harness；用户接受 repair.1 QA
前，不得关闭 CGF-2B.2，也不得解锁 CGF-2B.3 或 CGF-2C。

# KN-117：CGF-2B.2 repair.1 独立 QA P1 已由 repair.2 修复

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **REPAIR.1 QA FAIL P1 / REPAIR.2 P1 FIXED + FULL REGRESSION PASS / REAL PROVIDER RE-QA PENDING** |
| 阶段 | CGF-2B.2：OpenAI-compatible blank content delta repair |
| 依据 | repair.1 Claude Code QA 报告；版本 `0.0.0-cgf.2b.2-repair.2` 开发者回归 |
| 正式文档 | [repair.1 QA Report](../development/qa/0.0.0-cgf.2b.2-repair.1-claude-qa.md)、[CGF-2B.2 Plan](./CGF-2B.2-DIRECT-PROVIDER-CONFORMANCE-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 修复结论

- OpenAI-compatible Adapter 现在忽略 null、空字符串和纯空白 `content` 帧；
- 新增同一流中空字符串、纯空白与真实文本的 Conformance，确保只投影真实
  `TextDelta`；
- Central online/offline 各 182 tests、Workspace 107/685 与三项 smoke
  通过；
- 公共 Contract、v0007、Controller、Runtime durable/ephemeral 边界未变；
- repair.1 P1 代码层已关闭，但真实 Provider 四场景与泄漏扫描尚未在
  repair.2 上由独立 QA 重跑。

## 当前门槛

```text
repair.2 developer full regression：PASS
repair.2 real Provider independent QA：PENDING
CGF-2B.2 overall：NOT CLOSED
CGF-2B.3：GATED
CGF-2C：GATED
```

独立 QA 和用户接受完成前，不得关闭 CGF-2B.2，也不得解锁后续阶段。

# KN-118：CGF-2B.2 repair.2 独立 QA 与用户验收完成

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 状态 | **REPAIR.2 PASS/CLOSED；CGF-2B.2 PASS/CLOSED；CGF-2B.3、CGF-2C GATED** |
| 阶段 | CGF-2B.2：Direct Provider Runtime Bridge and Real Conformance |
| 依据 | Claude Code repair.2 独立 QA `PASS`；用户正式接受并关闭 repair.2 与 CGF-2B.2 |
| 正式文档 | [repair.2 QA Report](../development/qa/0.0.0-cgf.2b.2-repair.2-claude-qa.md)、[CGF-2B.2 Plan](./CGF-2B.2-DIRECT-PROVIDER-CONFORMANCE-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 关闭证据

- Central online/offline 各 182/0/0/0，Workspace 107/685 与三项 smoke
  独立通过；
- OpenAI-compatible blank content P1 由 `!isBlank()` 与 10 项 Conformance
  关闭；
- 真实 Streaming 产生 293 deltas，非法凭证、取消、Deadline 分别收敛为
  `failed`、`cancelled`、`timed_out`；
- Key/canary 泄漏为 0，临时 Key 文件确认删除；
- P0/P1/P2=0，四项 P3 均为既有非阻塞环境或时序问题；
- 用户正式接受 repair.2 独立 QA，repair.2 与 CGF-2B.2 均关闭。

## 下一门槛

```text
CGF-2B.2：PASS / CLOSED
CGF-2B.3：GATED / PLAN CONFIRMATION + USER AUTHORIZATION REQUIRED
CGF-2C：GATED
```

CGF-2B.2 关闭不自动解锁 CGF-2B.3 或 CGF-2C，也不扩大真实用户内容外发、
企业中转站或 Desktop 产品范围。

# KN-119：CGF-2B.3.1 已实现并通过默认门禁，真实 Relay 资源待补

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-01 |
| 状态 | **IMPLEMENTED / DEFAULT GATES PASS / REAL RELAY RESOURCE_GATED / INDEPENDENT QA PENDING / NOT CLOSED** |
| 阶段 | CGF-2B.3.1：Custom Relay Binding and Real Conformance |
| 依据 | CGF-2B.3 修订版复核 `P0～P3=0`；用户确认计划并授权 B.3.1；版本 `0.0.0-cgf.2b.3.1` 开发者自测 |
| 正式文档 | [CGF-2B.3 Plan](./CGF-2B.3-DEVELOPMENT-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-054](./UPSTREAM-ADOPTION-REGISTER.md) |

## 实现结论

- 既有 Provider-backed Backend 显式支持 `DIRECT_PROVIDER` 与
  `CUSTOM_RELAY`，没有复制第三套 Relay Adapter；
- Central 内部 Binding 分离 RoboThree `modelId` 与 Wire
  `upstreamModelId`，两者与 Endpoint、Protocol、Credential reference/revision
  一起进入精确 Test Binding revision/digest；
- direct-provider 与 custom-relay 使用独立 Endpoint Policy 和 Host allowlist，
  不合并、不自动 fallback；
- Runtime Bridge loopback 已覆盖两种 Connection Mode × 两种 Wire Protocol；
- null、空字符串、纯空白和缺失 `content` 均不会产生非法 `TextDelta`；
- 真实 Relay opt-in Harness 已具备 Streaming、usage/finish、invalid Credential、
  cancel、deadline、deltaCount/digest 与动态泄漏扫描；
- 公共 Contract、PostgreSQL v0007、Controller、Desktop、Local Core 均未修改。

## 开发者自测

```text
Central online：189 / 0 / 0 / 0
Central offline：189 / 0 / 0 / 0
Workspace：Architecture PASS + 107 files / 685 tests + 三项 smoke PASS
Custom Relay Harness：RESOURCE_GATED / no network call attempted
Direct Provider regression Harness：RESOURCE_GATED / no network call attempted
```

## 当前门槛

```text
CGF-2B.3.1 default/no-network implementation：PASS
real enterprise Relay Harness：RESOURCE_GATED
CGF-2B.3.1 independent QA：PENDING
CGF-2B.3.1 overall：NOT CLOSED
CGF-2B.3.2：GATED
CGF-2B.3.3：GATED
CGF-2C：GATED
```

真实 Relay Base URL、Protocol、RoboThree Model ID、upstream Model ID、受限 Key、
网络和测试额度到位并实际通过 Harness，且独立 QA 与用户接受完成前，不得关闭
CGF-2B.3.1 或进入后续批次。

# KN-120：CGF-2B.3.1 repair.1 公网 Custom Relay Conformance 通过

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-02 |
| 状态 | **PUBLIC CUSTOM RELAY PASS / ENTERPRISE RELAY GATED / INDEPENDENT QA PENDING / NOT CLOSED** |
| 阶段 | CGF-2B.3.1 repair.1：Controlled Credential Namespace 与 Monotonic Usage 收敛 |
| 依据 | 用户授权受限公网中转资源；版本 `0.0.0-cgf.2b.3.1-repair.1` 开发者自测与真实 Harness |
| 正式文档 | [CGF-2B.3 Plan](./CGF-2B.3-DEVELOPMENT-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-054](./UPSTREAM-ADOPTION-REGISTER.md) |

## 修复与验证结论

- Development Credential Source 允许 B.2/B.3 两个受控环境命名空间，其他阶段
  和非受控名称继续失败关闭；
- OpenAI-compatible Adapter 接受单调不减的逐帧 usage 与重复最终值，但只向
  Runtime 投影一次最终 Usage；任何 token 计数回退仍拒绝；
- 硅基流动公网 Custom Relay Harness 通过：167 个 text delta、canary 命中、
  非法 Credential `failed`、取消 `cancelled`、Deadline `timed_out`、动态泄漏
  扫描为 0；
- Central online/offline 各 `191/0/0/0`，Workspace Architecture 与
  `107/685`、三项 smoke 全部通过；
- 公共 Contract、PostgreSQL v0007、Controller、Desktop、Local Core 与
  Runtime durable terminal 所有权均未修改。

## 验收边界

```text
PUBLIC_CUSTOM_RELAY_CONFORMANCE_PASS
!=
ENTERPRISE_RELAY_CONFORMANCE_PASS
```

公网中转证据不能替代企业内网路由、CA/代理、CAS/RBAC、企业凭证/审计和生产
Secret Store 验收。Claude Code 独立 QA 与用户接受前，repair.1 和 B.3.1 均
`NOT CLOSED`；B.3.2、B.3.3、CGF-2C 继续 `GATED`。

# KN-121：CGF-2B.3.1 Foundation 关闭并后移企业内网 Relay 门槛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-02 |
| 状态 | **REPAIR.1 PASS/CLOSED；CGF-2B.3.1 FOUNDATION PASS/CLOSED；ENTERPRISE RELAY CONFORMANCE MOVED TO ENTERPRISE INTEGRATION；B.3.2/B.3.3/CGF-2C GATED** |
| 阶段 | CGF-2B.3.1：Custom Relay Binding and Real Conformance |
| 依据 | Claude Code repair.1 独立 QA `P0/P1/P2/P3=0`；用户正式接受 QA 并确认 Foundation/Enterprise Integration 门槛拆分 |
| 正式文档 | [repair.1 QA Report](../development/qa/0.0.0-cgf.2b.3.1-repair.1-claude-qa.md)、[CGF-2B.3 Plan](./CGF-2B.3-DEVELOPMENT-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[AR-054](./UPSTREAM-ADOPTION-REGISTER.md) |

## Foundation 关闭证据

- Claude Code 独立重跑 Central online/offline 各 `191/0/0/0`、Workspace
  Architecture 与 `107/685`、三项 smoke；
- 真实公网 Custom Relay Harness 产生 116 个 delta，非法 Credential、取消和
  Deadline 分别收敛为 `failed`、`cancelled`、`timed_out`；
- Development Credential B.2/B.3 受控命名空间与 cumulative usage 幂等收敛
  均由独立 Conformance 覆盖；
- Key、Endpoint、Model、canary 泄漏扫描为 0，临时 Key 文件已删除；
- 公共 Contract、PostgreSQL v0007、Desktop、Local Core 与 Runtime durable
  terminal 所有权未改变；
- 用户正式接受 repair.1 独立 QA，以
  `PUBLIC_CUSTOM_RELAY_CONFORMANCE_PASS` 作为 B.3.1 Foundation 的真实资源
  退出依据。

## 门槛拆分

```text
CGF-2B.3.1 repair.1：PASS/CLOSED
CGF-2B.3.1 Foundation：PASS/CLOSED
Enterprise Relay Conformance：Enterprise Integration / GATED
CGF-2B.3.2：GATED
CGF-2B.3.3：GATED
CGF-2C：GATED
```

公网证据不声明企业生产就绪。企业内网路由、企业 CA/代理、CAS/RBAC、企业
Credential/审计与生产 Secret Store 必须在 Enterprise Integration 中独立
验收。该门槛调整不解锁任何后续编码批次。

# KN-122：CGF-2B.3.2 双 JVM Relay Recovery 实现并通过开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-02 |
| 状态 | **IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING / NOT CLOSED** |
| 阶段 | CGF-2B.3.2：Dual-JVM Relay Recovery Conformance |
| 依据 | B.3.2 文档复核 `P0～P3=0`；用户确认计划并授权编码；版本 `0.0.0-cgf.2b.3.2` 开发者验证 |
| 正式文档 | [CGF-2B.3.2 Plan](./CGF-2B.3.2-DEVELOPMENT-PLAN.md)、[CGF-2B.3 Plan](./CGF-2B.3-DEVELOPMENT-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 实现结论

- 两个独立 Central Java PID 共享 PostgreSQL 16，并通过独立进程外受控 Relay
  运行正式 Provider-backed Backend、双协议 Adapter 与 HTTP/SSE Transport；
- F1～F10 验证 dispatch 前后崩溃、pre/mid-stream、terminal 提交窗口、
  lease/fencing、取消竞争、durable cursor、ephemeral 不重放及 Binding V1/V2；
- dispatch_decision 后不盲目重发不可查询的 Relay 请求，唯一收敛为
  `uncertain`；stale owner 不能提交终态；
- Central online/offline 各 `195/0/0/0`，Workspace Architecture 与
  `107/685`、三项 smoke 全部通过；
- 公共 Contract、PostgreSQL v0007、生产源码、Controller、Desktop 与 Local
  Core 均未修改。

## 当前门槛

```text
CGF-2B.3.2：IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING / NOT CLOSED
CGF-2B.3.3：GATED
CGF-2C：GATED
Enterprise Integration：GATED
```

独立 QA 必须实际重跑完整双 JVM Harness，不能使用历史 digest 代替。只有独立
QA PASS 且用户明确接受后，CGF-2B.3.2 才能关闭。

# KN-123：CGF-2B.3.2 独立 QA 通过并正式关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-02 |
| 状态 | **CGF-2B.3.2 PASS/CLOSED；B.3.3/CGF-2C/ENTERPRISE INTEGRATION GATED** |
| 阶段 | CGF-2B.3.2：Dual-JVM Relay Recovery Conformance |
| 依据 | Claude Code 独立 QA `P0=0 / P1=0 / P2=0 / P3=0`；用户正式接受独立 QA |
| 正式文档 | [Independent QA Report](../development/qa/0.0.0-cgf.2b.3.2-claude-qa.md)、[CGF-2B.3.2 Plan](./CGF-2B.3.2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 关闭证据

- 两个独立 Central JVM、独立端口与 Hikari Pool，共享真实 PostgreSQL 16；
- 第三个进程外受控 Relay 使用独立数据面和控制面；
- 正式 Provider-backed Backend/Adapter/Transport 全链路，无 Fake Backend；
- F1～F10 全部通过，`providerRequestCount=8`、`durableTerminalCount=10`、
  `durableCursor=4`、`fencingConflictCount=1`；
- 最终数据库连接和有效 Recovery Lease 均为 0，动态泄漏扫描为 0；
- Contract hash、PostgreSQL v0007、B0008/生产源码边界保持不变；
- Claude Code 独立 QA `P0/P1/P2/P3=0`，用户正式接受。

## 后续门槛

```text
CGF-2B.3.2：PASS/CLOSED
CGF-2B.3.3：GATED
CGF-2C：GATED
Enterprise Integration：GATED
```

CGF-2B.3.2 的关闭不构成任何后续批次的开发授权。

# KN-124：CGF-2B.3.3 repair.1 完成安全与资源收口开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-02 |
| 状态 | **IMPLEMENTED / REPAIR.1 / DEVELOPER GATES PASS / INDEPENDENT QA PENDING / NOT CLOSED；CGF-2C/ENTERPRISE INTEGRATION GATED** |
| 阶段 | CGF-2B.3.3：Security, Protocol and Resource Closure |
| 依据 | B.3.3 文档评审 `P0～P3=0`；用户确认计划并授权编码；版本 `0.0.0-cgf.2b.3.3-repair.1` 开发者验证 |
| 正式文档 | [CGF-2B.3.3 Plan](./CGF-2B.3.3-DEVELOPMENT-PLAN.md)、[CGF-2B.3 Plan](./CGF-2B.3-DEVELOPMENT-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## repair.1 与实现结论

- encoded route 负向测试发现 `%2e%2e` / `%2f` 可越过请求前校验并触发网络尝试，
  按计划转入 repair.1；Transport 现在在构造网络请求前拒绝 `%` 和反斜杠；
- 两协议共同覆盖 redirect、错误 Content-Type、malformed/oversize/incomplete
  stream、连接 reset 与正常完成；确定性协议错误进入 `failed`，不完整或未知断流
  保持 `uncertain`；
- 五轮实际启动 10 个 Central JVM 与 5 个进程外 Relay；10 个 Invocation 均只有
  一个 durable terminal；PID、端口、Hikari 连接、lease、subscriber、ephemeral
  buffer、Relay request 和 child process 最终为 0；
- Credential、Prompt、Provider output、Header canary 的原文/Base64/URL encoding
  动态扫描命中 0；真实 Provider 环境被强制清空并返回 `RESOURCE_GATED/零网络`；
- Central online/offline 各 `202/0/0/0`，Workspace Architecture 与
  `107/685`、三项 smoke 全部通过；公共 Contract、v0007、生产 Controller、
  Desktop 与 Local Core 未修改。

## 后续门槛

```text
CGF-2B.3.3 repair.1：DEVELOPER GATES PASS / INDEPENDENT QA PENDING / NOT CLOSED
CGF-2B.3 / CGF-2B：NOT CLOSED
CGF-2C：GATED
Enterprise Integration：GATED
```

独立 QA 必须实际执行统一 closure Harness；只有独立 QA PASS 且用户明确接受后，
才能关闭 repair.1、B.3.3、B.3 或 B。开发者门禁不自动解锁 CGF-2C。

# KN-125：CGF-2B.3.3 repair.1 独立 QA 通过并依序关闭 CGF-2B

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-02 |
| 状态 | **REPAIR.1 / CGF-2B.3.3 / CGF-2B.3 / CGF-2B PASS/CLOSED；CGF-2C/ENTERPRISE INTEGRATION GATED** |
| 阶段 | CGF-2B Model Provider 与 Custom Relay Foundation 最终关闭 |
| 依据 | Claude Code 独立 QA `P0=0 / P1=0 / P2=0 / P3=0`；用户正式接受并指定依序关闭 |
| 正式文档 | [Independent QA Report](../development/qa/0.0.0-cgf.2b.3.3-repair.1-claude-qa.md)、[CGF-2B.3.3 Plan](./CGF-2B.3.3-DEVELOPMENT-PLAN.md)、[CGF-2B.3 Plan](./CGF-2B.3-DEVELOPMENT-PLAN.md)、[CGF-2 Plan](./CGF-2-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 独立 QA 关闭证据

- Central online/offline `BUILD SUCCESS ×2`，Workspace Architecture、
  `107/685` 与三项 smoke 全部通过；
- closure Harness 实际重跑 B.3.2 F1～F10、10 个安全场景和 5 轮生命周期，
  共启停 10 个 Central JVM 与 5 个进程外 Relay；
- connection、lease、subscriber、ephemeral buffer、Relay request、child process
  六类资源最终全部为 0；
- encoded route P1 已在 Transport 网络调用前拒绝，redirect 不跟随且 Credential
  不转发；
- Credential、Prompt、Provider output、Header 四类 canary 动态泄漏扫描为 0；
- Direct Provider 保持 `RESOURCE_GATED/零网络`，公共 Contract、PostgreSQL
  v0007、生产 Controller、Desktop 与 Local Core 保持不变；
- Claude Code 独立 QA `P0/P1/P2/P3=0`，用户正式接受。

## 阶段结论

```text
CGF-2B.3.3 repair.1：PASS/CLOSED
CGF-2B.3.3：PASS/CLOSED
CGF-2B.3：PASS/CLOSED
CGF-2B：PASS/CLOSED
CGF-2C：GATED
Enterprise Integration：GATED
```

CGF-2B 只形成 Model Gateway Foundation 能力，不声明企业内网 Relay 或企业生产
集成就绪。CGF-2C 与 Enterprise Integration 均须重新确认方案并由用户明确授权。

# KN-126：ADR17-I1 Batch Persistence 完成开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-02 |
| 状态 | **IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING；ADR17-I2/I3、CGF-2C、ENTERPRISE INTEGRATION GATED** |
| 阶段 | ADR17-I1：Batch Contract、Persistence 与原子 intent |
| 依据 | ADR-017 与实施计划已确认；用户明确授权 ADR17-I1；版本 `0.0.0-adr17.i1` 开发者验证 |
| 正式文档 | [ADR-017](../adr/017-agent-tool-call-batch-completion-cancellation-and-recovery.md)、[ADR-017 Implementation Plan](./ADR-017-IMPLEMENTATION-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 实现结论

- Core 内部新增 strict Batch/Disposition schema，七类 disposition 不进入公共
  Task/Effect/Desktop Contract；
- SQLite migration 13 与 InMemory/SQLite 两套 Adapter 实现 Transaction A/C，
  Assistant batch intent 和 Tool Result completion 均无半事务可见状态；
- Batch digest、唯一约束、expected revision/CAS、并发单写、推进后 replay、
  精确 Effect Attempt 身份和 terminal 不可改写共同约束幂等与冲突；
- 三个命名故障点、旧 Conversation migration、close/reopen 和既有 Agent Loop /
  Compaction/SubmitTurn/DCF-2C 回归全部通过；
- `harness:adr17i1` 为 4 files / 52 tests，完整 Node 门禁为
  109 files / 711 tests，三项 smoke 通过；
- Kernel、公共 Contracts、Desktop、Central 与 Enterprise Gateway 未修改。

## 当前门槛

```text
ADR17-I1：IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING / NOT CLOSED
ADR17-I2/I3：GATED
CGF-2C.1/2/3：GATED
Enterprise Integration：GATED
```

独立 QA 必须实际重跑 I1 Harness 与完整门禁。只有独立 QA `P0/P1=0` 且用户
明确接受后才可关闭 ADR17-I1；关闭不自动解锁 ADR17-I2。

# KN-127：ADR17-I1 正式关闭并完成 ADR17-I2 开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-02 |
| 状态 | **ADR17-I1 PASS/CLOSED；ADR17-I2 IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING；ADR17-I3、CGF-2C、ENTERPRISE INTEGRATION GATED** |
| 阶段 | ADR17-I2：Agent Loop、取消、确认与精确恢复 |
| 依据 | 用户接受 ADR17-I1 独立 QA 并单独授权 ADR17-I2；版本 `0.0.0-adr17.i2` 开发者门禁 |
| 正式文档 | [ADR-017](../adr/017-agent-tool-call-batch-completion-cancellation-and-recovery.md)、[ADR-017 Implementation Plan](./ADR-017-IMPLEMENTATION-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 实现结论

- 应用层 `ToolCallBatchCoordinator` 以 Task/Run/Batch 精确身份串行执行 Tool Calls，
  Agent Loop 只有在整批结果完整或明确终止后才继续调用模型；
- Effect `PREPARED` 后、Backend dispatch 前持久链接 `effectAttemptId`，覆盖
  Effect 已存在但链接未提交、链接已提交但结果未提交等崩溃窗口；
- 分发前取消不调用 Backend，确认 allow/reject 分别进入实时收窄后的分发和 typed
  denial；Retry 只恢复新 Run，旧 Run 迟到事实不能污染新 Run；
- 旧逐条 Tool Result 追加与 Session 级 pending scan 已移除，含 Tool Calls 的
  Assistant Message 必须走 Batch Coordinator；
- `harness:adr17i2` 为 7 files / 84 tests，完整门禁为 110 files / 721 tests，
  架构边界和 Core/Desktop/Preload 三项 smoke 全部通过；
- Kernel、公共 Contracts、SQLite schema、Desktop、Central 与 Enterprise Gateway
  未修改，ADR17-I3 和 CGF-2C 均无超前实现。

## 当前门槛

```text
ADR17-I1：PASS/CLOSED
ADR17-I2：IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING / NOT CLOSED
ADR17-I3：GATED
CGF-2C.1/2/3：GATED
Enterprise Integration：GATED
```

Claude Code 必须实际重跑 ADR17-I2 专项 Harness 和完整门禁，不能用开发者历史
结果或 digest 代替。独立 QA `P0/P1=0` 且用户明确接受后，ADR17-I2 才可关闭；
关闭不自动解锁 ADR17-I3。

# KN-128：ADR17-I2 正式关闭并完成 ADR17-I3 统一恢复矩阵

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-02 |
| 状态 | **ADR17-I1/I2 PASS/CLOSED；ADR17-I3 IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING；CGF-2C、ENTERPRISE INTEGRATION GATED** |
| 阶段 | ADR17-I3：统一 Conformance 与 Recovery Harness |
| 依据 | 用户接受 ADR17-I2 独立 QA 并单独授权 ADR17-I3；版本 `0.0.0-adr17.i3` 开发者门禁 |
| 正式文档 | [ADR-017](../adr/017-agent-tool-call-batch-completion-cancellation-and-recovery.md)、[ADR-017 Implementation Plan](./ADR-017-IMPLEMENTATION-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 统一矩阵结论

- ADR-017 §11 的 18 项场景具有稳定编号和实际测试证据，统一命令必须重跑全部
  10 个证据文件，证据文件或测试标题漂移会失败关闭；
- 分发前取消、首调用执行中取消、进程外 DISPATCHED 取消、uncertain、等待确认
  重启、allow/reject、Transaction A/C、Effect 链接窗口、旧 Run 迟到事实、
  Retry 隔离和 Provider History 完整性全部进入同一门禁；
- 新增首调用执行中取消验证：当前 Effect 保持精确关联，同批后续调用不分发；
- 新增 A 后 B 前恢复，并强化 SQLite close/reopen 后并发 recovery 单 owner；
- `harness:adr17i3` 为 10 files / 130 tests、18/18 场景，evidence digest 为
  `sha256:e9bfc55d94c8e2a5968d90aeba90b666b292a55fa073848f208fd4bcea3641e8`，
  报告敏感内容扫描为 0；
- 完整门禁为 111 files / 743 tests，架构边界和 Core/Desktop/Preload 三项 smoke
  全部通过；
- 生产 Runtime、Kernel、公共 Contracts、migration 13、Desktop、Central 与
  Enterprise Gateway Schema 均未修改。

## 当前门槛

```text
ADR17-I1/I2：PASS/CLOSED
ADR17-I3：IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING / NOT CLOSED
CGF-2C.1/2/3：GATED
Enterprise Integration：GATED
```

Claude Code 必须实际执行统一 Harness 和完整门禁，digest 只作为结果比较证据，
不能代替重跑。独立 QA `P0/P1=0` 且用户明确接受后，ADR17-I3 才可关闭；关闭
不自动解锁 CGF-2C.1。

# KN-129：ADR17-I3 正式关闭并完成 ADR-017 Implementation Gate

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-03 |
| 状态 | **ADR17-I1/I2/I3 与 ADR-017 IMPLEMENTATION GATE PASS/CLOSED；CGF-2C、ENTERPRISE INTEGRATION GATED** |
| 阶段 | ADR17-I3 独立 QA 与用户接受收口 |
| 依据 | Claude Code 独立 QA `P0/P1/P2/P3=0`；用户正式接受 ADR17-I3 并关闭 Implementation Gate 三批 |
| 正式文档 | [ADR-017](../adr/017-agent-tool-call-batch-completion-cancellation-and-recovery.md)、[ADR-017 Implementation Plan](./ADR-017-IMPLEMENTATION-PLAN.md)、[独立 QA 报告](../development/qa/0.0.0-adr17.i3-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 关闭证据

- Claude Code 实际重跑 `harness:adr17i3`：10 files / 130 tests、18/18 场景；
- evidence digest 与开发者结果一致，敏感内容泄漏扫描为 0；
- 完整 `pnpm run check`：Architecture PASS、111 files / 743 tests 和三项 smoke；
- I3 新增的首调用执行中取消、Transaction A 后首次 dispatch 前崩溃、SQLite
  重启后并发 recovery 单 owner 均通过；
- I1/I2 全量回归保留，生产代码、公共 Contracts、migration 13 未改写；
- 独立 QA 结论 `P0=0 / P1=0 / P2=0 / P3=0`，已由用户正式接受。

## 当前门槛

```text
ADR17-I1/I2/I3：PASS/CLOSED
ADR-017 Implementation Gate：PASS/CLOSED
CGF-2C.1/2/3：GATED
Enterprise Integration：GATED
```

Implementation Gate 的关闭只完成 CGF-2C.1 的技术前置，不构成方案确认或开发
授权。CGF-2C.1、CGF-2C.2、CGF-2C.3 与 Enterprise Integration 均继续等待
用户明确授权。

# KN-130：CGF-2C.1 具体实施方案进入文档评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-03 |
| 状态 | **PROPOSED / DOCUMENT REVIEW PENDING / CODE GATED；CGF-2C.2/2C.3、ENTERPRISE INTEGRATION GATED** |
| 阶段 | CGF-2C.1：Model Admission、Core Provider 与 Central HTTP/SSE |
| 依据 | ADR-017 Implementation Gate 已关闭；用户要求先形成 C.1 具体方案并提交 Claude Code、MiniMax 评审 |
| 正式文档 | [CGF-2C.1 Development Plan](./CGF-2C.1-DEVELOPMENT-PLAN.md)、[CGF-2C Parent Plan](./CGF-2C-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 方案结论

- C.1 必须同时关闭按 Task 精确 ModelProvider resolution、Model 外发确认、
  Central 正式 HTTP/SSE、Invocation durable link 和输出连续性恢复，不能仅新增
  一个 HTTP Client；
- Model 专用 `task_model_external_scope` 绑定 Runtime Selection、Model/Binding/
  Descriptor revision、外发目标、七类 provenance 和数据范围，不伪造 Tool
  revision；
- 本地 SQLite 使用编码时下一个可用 migration（当前为 14）记录 L1/L2/L3
  协调事实，与 Central PostgreSQL 不宣称跨库原子事务；
- Central 采用 Thin Controller、Production user-confirmed Admission 和
  subscriber-before-execute 的 bounded SSE owner 方案，继续兼容双 JVM无状态
  部署与 lease/fencing；
- 完整输出连续性丢失时明确进入 `model.output_unrecoverable` 人工处理，不保存
  Prompt/输出正文，也不盲目创建第二 Invocation；
- C.1 不修改 Kernel reducer、Central v0007、Enterprise canonical Model
  Schema、CGF-2B Provider Adapter 或 Desktop Renderer，最终 UX 留给 C.2 PRD。

## 当前门槛

```text
CGF-2C.1 Plan：PROPOSED / DOCUMENT REVIEW PENDING / CODE GATED
CGF-2C.1：GATED
CGF-2C.2/2C.3：GATED
Enterprise Integration：GATED
```

讨论区评审只形成文档结论，不自动授权编码。必须先关闭 P0/P1、由用户接受计划
并明确授权后，才能进入 CGF-2C.1 实现。

# KN-131：CGF-2C.1 首轮评审修订进入复核

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-03 |
| 状态 | **REVISION 1 / DOCUMENT RE-REVIEW PENDING / CODE GATED；CGF-2C.2/2C.3、ENTERPRISE INTEGRATION GATED** |
| 阶段 | CGF-2C.1：首轮文档评审问题关闭与复核 |
| 依据 | Claude Code 首轮评审 `P0=0 / P1=0 / P2=1 / P3=2`；用户要求修订后提交 Claude Code 复核 |
| 正式文档 | [CGF-2C.1 Development Plan](./CGF-2C.1-DEVELOPMENT-PLAN.md)、[CGF-2C Parent Plan](./CGF-2C-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 修订决断

- 关闭 P2：同 Invocation 重新订阅时，已有未过期 owner 的节点外只能作为
  passive subscriber；只有 owner 缺失或 lease 到期且 recovery policy 允许时
  才能通过 CAS/fencing 竞争执行权，禁止第二次 Backend 调用；
- 关闭两项 P3：加入 SSE disconnect/network jitter 的 status-first 测试，并将
  Core SSE strict consumer 固定到 heartbeat window、sequence、unknown frame、
  event digest 和 opaque cursor 字段级检查；
- 校正初稿术语：canonical ephemeral event 仅为 `started`、`text_delta`、
  `tool_call`，heartbeat 属于 transport；输出连续性丢失复用 ADR-015
  `model_stream_resume_unavailable`；
- 五个业务场景不成为 C.2 硬门槛；PM 可以并行规划。C.2 PRD 必须定义
  `manual_attention` 的用户说明、动作与责任，24/72 小时等运营 SLA 后置；
- C.1 Headless Stub/loopback 不等于 production synthetic：生产路径仍只接受
  `user_confirmed`，`development_synthetic` 仅限 development/test profile。

## 当前门槛

```text
CGF-2C.1 Plan：REVISION 1 / DOCUMENT RE-REVIEW PENDING / CODE GATED
CGF-2C.1：GATED
CGF-2C.2/2C.3：GATED
Enterprise Integration：GATED
```

Revision 1 只进入 Claude Code 文档复核；复核结论不自动解锁编码。仍需用户正式
接受计划并单独授权 CGF-2C.1。

# KN-132：CGF-2C.1 Revision 1 通过复核并获编码授权

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-03 |
| 状态 | **CGF-2C.1 PLAN ACCEPTED / IMPLEMENTATION IN PROGRESS；CGF-2C.2/2C.3、ENTERPRISE INTEGRATION GATED** |
| 阶段 | CGF-2C.1：Model Admission、Core Provider 与 Central HTTP/SSE |
| 依据 | Claude Code Revision 1 复核 `P0=0 / P1=0 / P2=0 / P3=0`；用户正式接受计划并明确授权编码 |
| 正式文档 | [CGF-2C.1 Development Plan](./CGF-2C.1-DEVELOPMENT-PLAN.md)、[CGF-2C Parent Plan](./CGF-2C-DEVELOPMENT-PLAN.md) |

## 授权边界

- 允许进入 CGF-2C.1 计划内的 Contract/Core/Central/Headless Foundation 实现；
- 继续遵守 per-Task Model Lock、用户外发确认、status-first、lease/fencing、
  canonical Event 与输出连续性人工处理边界；
- CGF-2C.2 Desktop 最终 Model Experience、CGF-2C.3 联合恢复收口和
  Enterprise Integration 均不因本次授权自动解锁。

# KN-133：CGF-2C.1 实现完成并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-03 |
| 状态 | **IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING；CGF-2C.2/2C.3、ENTERPRISE INTEGRATION GATED** |
| 阶段 | CGF-2C.1：Model Admission、Core Provider 与 Central HTTP/SSE Foundation |
| 依据 | 用户授权的 Revision 1；版本 `0.0.0-cgf.2c.1` 开发者专项与完整门禁 |
| 正式文档 | [CGF-2C.1 Development Plan](./CGF-2C.1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Changelog](../../CHANGELOG.md) |

## 实现结论

- Model 外发使用独立 confirmation scope 和七类 provenance，按 Task 锁定
  Model/Binding/Descriptor 精确解析；
- Core migration 14 仅保存 L1/L2/L3 identity/digest 协调事实，不保存 Prompt、
  输出、Token、Endpoint 或 Credential；
- Core 与 Central HTTP/SSE 已支持一次 Token renewal、strict sequence/digest、
  durable cursor、subscriber-before-execute、lease/fencing 和 passive subscription；
- 输出连续性不能证明时以 `model_stream_resume_unavailable` 进入人工处理，禁止
  第二 Invocation；
- `harness:cgf2c1` 11 Node files / 79 tests、8 Java classes、30 项矩阵映射与
  泄漏扫描 0；Node 完整门禁 116 files / 757 tests 与三项 smoke、Central
  online/offline 各 214 tests 全部通过。

CGF-2C.1 仍等待独立 QA 和用户接受；不得据此进入 CGF-2C.2、CGF-2C.3 或
Enterprise Integration。

# KN-134：CGF-2C.1 独立 QA 获用户接受并正式关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-03 |
| 状态 | **CGF-2C.1 PASS/CLOSED；CGF-2C.2/2C.3、ENTERPRISE INTEGRATION GATED** |
| 阶段 | CGF-2C.1：独立 QA 与用户接受收口 |
| 依据 | Claude Code 独立 QA `P0=0 / P1=0 / P2=0 / P3=0`；用户正式接受并关闭 CGF-2C.1 |
| 正式文档 | [Independent QA Report](../development/qa/0.0.0-cgf.2c.1-claude-qa.md)、[CGF-2C.1 Development Plan](./CGF-2C.1-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 关闭结论

- 专项 Harness：11 Node files / 79 tests、8 Java classes、30/30 matrix、leak 0；
- Workspace：116 files / 757 tests 与三项 smoke；
- Central online/offline：各 214 tests / 0 failures / 0 errors / 0 skipped；
- 首次 QA 并行执行造成的 Surefire 报告目录竞态已通过串行复跑排除，非产品缺陷；
- Model confirmation、per-Task Provider、migration 14 L1/L2/L3、token-once、
  status-first、Central SSE owner 和 `model_stream_resume_unavailable` 均通过。

CGF-2C.2 不自动解锁。用户将在后续提供需求，由 Codex 协助整理并确认聚焦的
Model Experience PRD/UX；完成确认和明确授权后才能进入 C.2。

# KN-135：DTP-0 独立 QA 获用户接受并正式关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-03 |
| 状态 | **DTP-0-repair.2 PASS/CLOSED；DTP-0 PASS/CLOSED；DTP-1～DTP-4 GATED** |
| 阶段 | Document Tool Pack：Worker 安全与运行时底座收口 |
| 依据 | Claude Code 独立 QA `P0=0 / P1=0 / P2=0 / P3=0`；用户明确要求关闭 DTP-0 |
| 正式记录 | [Development Log](../development/DEVELOPMENT-LOG.md)、[Changelog](../../CHANGELOG.md) |

## 关闭结论

- Document Worker build、13 files / 117 tests、lint/Architecture boundary、Workspace
  129 files / 874 tests 与三项 smoke 均通过独立复跑；
- `realpath` 路径 containment、symlink 外逃、Windows/UNC、bounded file read、
  FileHandle cleanup、OOXML fail-closed 和错误脱敏均通过；
- Runtime completion/cancel/deadline、单并发 `worker_busy`、late callback 隔离与
  1000 次同进程资源收口均通过；
- 生产源码无测试诊断入口，Document Worker 依赖仍为空，未修改 lockfile、根
  TypeScript references、Core、Contracts、Desktop 或 Central；
- 当前底座可以进入下一阶段计划评审，但尚未实现任何真实 PDF/XLSX/DOCX Tool。

## 下一道门槛

```text
DTP-1 Plan 评审与修订
AND 用户确认 DTP-1 Plan
AND 用户单独授权 DTP-1.0
AND 依赖/lockfile 独占窗口
→ 才允许进入 DTP-1.0
```

DTP-0 关闭不自动解锁 DTP-1，也不授权安装 SheetJS、pdfjs-dist、Mammoth 或任何
Fixture 依赖。

# KN-136：ARH-0 关闭并完成 ARH-1 Provider Stream Conformance 开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-12 |
| 状态 | **ARH-0 PASS/CLOSED；ARH-1 DEVELOPER SELF-TEST PASS / INDEPENDENT QA PENDING；ARH-2/ARH-3 GATED** |
| 阶段 | Agent Runtime Harness 优化：Provider Stream Conformance |
| 依据 | Claude Code 文档评审 `P0=0 / P1=0 / P2=0 / P3=2`；用户接受并关闭 ARH-0，明确只授权 ARH-1 编码 |
| 正式文档 | [ARH Development Plan](../development/arh/ARH-AGENT-RUNTIME-HARNESS-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Adoption Register AR-055](./UPSTREAM-ADOPTION-REGISTER.md) |

## 实现结论

- Core 在唯一 Model stream 消费点验证 started/terminal 顺序、blank delta、Tool Call
  identity 和 usage 单调性；terminal 只在上游自然结束后交付；
- 非法或不完整流不能制造 completed Assistant Message，取消后的迟到事件不进入 durable
  timeline；Provider 内部错误不泄漏，企业模型 `model_stream_resume_unavailable` 仍由既有
  Durable Runtime 恢复；
- Anthropic-compatible 与 OpenAI-compatible Adapter 增加等价负向 Conformance；
- ARH-1 专项 3 files / 22 tests、完整 Workspace 151 files / 1041 tests、Central
  online/offline 各 215 tests 及 DTP-4 packaging audit 已通过开发者复跑；
- 公共 Contracts、Kernel、数据库迁移、Desktop、Compaction 与 token accounting 未修改。

## 后续门禁

ARH-1 等待 Claude Code 独立 QA 和用户接受。ARH-2 必须纳入 Tool Call/Result 不被
compaction source range 拆分的不变量；ARH-3 必须在 durable usage 事实入口实现 retry
幂等，不得用进程内 Set 冒充持久去重。两批均不因 ARH-1 自测通过自动解锁。

# KN-137：ARH-1 正式关闭并启动 ARH-2 详细方案文档评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-12 |
| 状态 | **ARH-1 PASS/CLOSED；ARH-2 DOCUMENT_REVIEW_PENDING / CODING_GATED；ARH-3 GATED** |
| 阶段 | Agent Runtime Harness 优化：Automatic Compaction Orchestration 方案收口 |
| 依据 | Claude Code 独立 QA `PASS（P0=0 / P1=0 / P2=0 / P3=0）`；用户正式接受并关闭 ARH-1，要求先输出 ARH-2 详细方案并评审，不自动进入编码 |
| 正式文档 | [ARH-2 Detailed Plan](../development/arh/ARH-2-AUTOMATIC-COMPACTION-ORCHESTRATION-DEVELOPMENT-PLAN.md)、[ARH Parent Plan](../development/arh/ARH-AGENT-RUNTIME-HARNESS-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- ARH-1 独立复跑覆盖专项 3 files / 22 tests、完整 Workspace 151 files / 1041 tests +
  3 smoke 及 Central online/offline，用户已正式关闭该批次；
- ARH-2 只处理生产 Agent Loop 的自动 Context Compaction 编排，不进入长期 Memory、
  Knowledge、Skill Reader、Desktop UI、Tool 并行或 ARH-3 token accounting；
- 方案要求 Context reduction 与 persistent source range 共用 Tool Call Batch 原子分组规则，
  Summary 保持派生低权限上下文，不成为 Task/执行事实；
- 本节点只启动 Claude Code / MiniMax 文档评审。ARH-2.1 必须在评审、用户确认和明确授权后
  才能编码；ARH-3 不因 ARH-1 关闭而解锁。

# KN-138：ARH-2 首轮评审修订进入 Revision 1 复核

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-12 |
| 状态 | **ARH-2 REVISION 1 REVIEW PENDING / CODING GATED；ARH-3 GATED** |
| 阶段 | Automatic Compaction Orchestration 详细方案修订 |
| 依据 | 首轮文档评审 `PASS（P0=0 / P1=0 / P2=2 / P3=1）`；用户尚未授权编码 |
| 正式文档 | [ARH-2 Revision 1](../development/arh/ARH-2-AUTOMATIC-COMPACTION-ORCHESTRATION-DEVELOPMENT-PLAN.md)、[讨论线程](../../../讨论区/20260812/002-arh-2-plan-cx.md) |

## 修订决策

- 必须新增 Core 私有 `CompactionExecutionBinding` migration，与 Job 第一事务原子写入，
  防止重启或 Registry 升级后静默漂移模型、Binding 或 Adapter；
- 当前轮次或 static context 自身超过硬预算时，以稳定 typed code 和安全可操作建议失败
  关闭，不自动删减、换模型或创建新会话；
- multi-turn `waiting_user_confirmation` 的因果用户轮次与 Tool Call Batch 保持 open atomic
  group，未 durable 闭合前不得进入 Compaction source range；
- Revision 1 仅提交复核。即使复核 PASS，也必须由用户确认计划并单独授权 ARH-2.1。

# KN-139：ARH-2.0 关闭并完成 ARH-2.1 Atomic Planning 开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-12 |
| 状态 | **ARH-2.0 PASS/CLOSED；ARH-2.1 SELF-TEST PASS / INDEPENDENT QA PENDING；ARH-2.2/2.3、ARH-3 GATED** |
| 阶段 | Automatic Compaction Orchestration：原子规划、派生 Summary 与恢复绑定 |
| 依据 | Revision 1 复核 `P0=0 / P1=0 / P2=0 / P3=0`；用户正式确认计划并只授权 ARH-2.1 |
| 正式文档 | [ARH-2 Plan](../development/arh/ARH-2-AUTOMATIC-COMPACTION-ORCHESTRATION-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Changelog](../../CHANGELOG.md) |

## 实现结论

- Context reduction 与 durable Compaction source range 共用 `ConversationAtomicGroupPlanner`；
  Tool Call Batch、waiting confirmation 的因果用户轮次和 Result 不会跨压缩边界拆分；
- 首次及滚动 source planning 始终保留最新用户组和 open group，滚动摘要只接收 base Summary
  与新增 raw extension，Record 继续证明完整 `1..sourceEnd`；
- active Summary 仅作为低权限派生 conversation context 进入请求，不成为系统指令、消息、
  Task 或执行事实，receipt 不记录正文；
- Core migration 18 将私有 `CompactionExecutionBinding` 与 Job 第一事务原子写入，锁定精确
  Task Model/Binding/Adapter/Registry revision，禁止持久化运行句柄、Endpoint、Credential、
  Token、Prompt 或正文；
- `harness:arh2.1` 7 files / 70 tests、完整 Workspace 153 files / 1056 tests 与三项 smoke
  已通过开发者复跑。

ARH-2.1 等待 Claude Code 独立 QA 与用户接受。生产自动触发、外发 admission、Model-backed
summarizer 和超预算用户错误属于 ARH-2.2，不因本节点自动解锁。

# KN-140：ARH-2.1 独立 QA 通过并正式关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-12 |
| 状态 | **ARH-2.0/2.1 PASS/CLOSED；ARH-2.2/2.3、ARH-3 GATED** |
| 阶段 | Automatic Compaction Orchestration：Atomic Planning 阶段关闭 |
| 依据 | Claude Code 独立 QA `PASS（P0=0 / P1=0 / P2=0 / P3=0）`；用户正式接受并关闭 ARH-2.1 |
| 正式文档 | [ARH-2 Plan](../development/arh/ARH-2-AUTOMATIC-COMPACTION-ORCHESTRATION-DEVELOPMENT-PLAN.md)、[QA Report](../development/qa/0.0.0-arh.2.1-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 关闭证据

- ARH-2.1 Harness：7 files / 70 tests；
- 完整 Workspace：153 files / 1056 tests + 3 smoke；
- Central online/offline：均为 `BUILD SUCCESS`；
- Tool Call/Result/waiting confirmation 原子边界、source range、低权限 Summary、私有
  `CompactionExecutionBinding`、migration 18、digest 自校验与 T1 中间故障回滚全部通过；
- 公共 Contracts、Kernel reducer 和 Desktop 未修改，未提前实现 ARH-2.2。

ARH-2.2、ARH-2.3 与 ARH-3 继续 `GATED`。下一步只能先确认 ARH-2.2 详细实施方案；没有
用户明确开发授权不得进入编码。

# KN-141：ARH-2.2 详细实施方案进入文档评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-12 |
| 状态 | **ARH-2.2 DOCUMENT REVIEW PENDING / CODING GATED；ARH-2.3、ARH-3 GATED** |
| 阶段 | Production Automatic Compaction Orchestration 方案冻结 |
| 依据 | ARH-2.1 已正式关闭；用户要求继续提交 ARH-2.2 方案评审，不自动进入编码 |
| 正式文档 | [ARH-2.2 Plan](../development/arh/ARH-2.2-PRODUCTION-AUTOMATIC-COMPACTION-ORCHESTRATION-DEVELOPMENT-PLAN.md)、[ARH-2 Parent Plan](../development/arh/ARH-2-AUTOMATIC-COMPACTION-ORCHESTRATION-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[讨论线程](../../../讨论区/20260812/003-arh-22-plan-cx.md) |

## 方案决策

- `ContextPreparationCoordinator` 是每轮 assessment、eligibility、admission、compact、reload、
  final rerun 的唯一 Application 编排者；
- Summary provenance 从 immutable source range 重新推导，摘要外发 scope digest 绑定
  `purpose=compaction_summary`，不能静默复用不等价的主调用确认；
- `CompactionCoordinator` 按 ARH-2.1 immutable ExecutionBinding 解析精确 Model Provider，
  恢复期间禁止换 Model、Binding、Adapter 或 Relay；
- 主 `model_invocation_links` 的 `(taskId, runId, round)` 与 Assistant Message commit 语义不适合
  摘要调用。方案提出私有 migration 19，分离 compaction logical invocation 与 summary
  committed 事实，不修改公共 Contract 或 Central Schema；
- 本轮只有文档改动。评审通过后仍须用户确认和明确授权才能进入 ARH-2.2 编码。

# KN-142：ARH-2.2 首轮评审修订进入 Revision 1 复核

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-12 |
| 状态 | **ARH-2.2 REVISION 1 RE-REVIEW PENDING / CODING GATED；ARH-2.3、ARH-3 GATED** |
| 阶段 | Production Automatic Compaction Orchestration 详细方案修订 |
| 依据 | 首轮评审 `PASS（P0=0 / P1=0 / P2=1 / P3=1）`；七项代码缺口全部成立，P0/P1=0 |
| 正式文档 | [ARH-2.2 Revision 1](../development/arh/ARH-2.2-PRODUCTION-AUTOMATIC-COMPACTION-ORCHESTRATION-DEVELOPMENT-PLAN.md)、[讨论线程](../../../讨论区/20260812/003-arh-22-plan-cx.md) |

## 修订决策

- `ContextPreparationCoordinator.prepare()` 返回 Core 私有 JSON-safe Receipt，以固定 decision/
  reason 区分跳过、压缩、恢复、stale 和失败；`static_context_too_large` 等 hard failure 不得
  伪装成成功跳过；
- 历史 assistant provenance 兼容性以 external target、runtime selection、Model、Binding、
  Adapter、Registry 的 exact revision/digest tuple 判断；名称、协议、Model ID 或 Relay Host
  相同不足以证明兼容；
- QA 门槛由 45 项增至 47 项。本轮仍是 docs-only，Revision 1 复核通过后也不得自动编码。

# KN-143：ARH-2.2 生产自动压缩编排完成开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-12 |
| 状态 | **ARH-2.2 SELF-TEST PASS / INDEPENDENT QA PENDING；ARH-2.3、ARH-3 GATED** |
| 阶段 | Production Automatic Compaction Orchestration 实施收口 |
| 依据 | ARH-2.2 Revision 1 复核 `P0～P3=0`；用户关闭计划评审并明确授权 ARH-2.2 编码 |
| 正式文档 | [ARH-2.2 Plan](../development/arh/ARH-2.2-PRODUCTION-AUTOMATIC-COMPACTION-ORCHESTRATION-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Adoption Register AR-057](./UPSTREAM-ADOPTION-REGISTER.md) |

## 实现结论

- 唯一 `ContextPreparationCoordinator` 已接入生产 Agent Loop，复用 Context Pipeline 执行
  assessment、旧完整前缀 eligibility、一次性 compact/reload/final-rerun；
- 摘要外发 scope 明确绑定 `purpose=compaction_summary`，用户确认前零 Job；恢复通过 immutable
  ExecutionBinding 重建精确 Model/Binding/Adapter/Registry 组合，不静默换目标；
- migration 19 以私有 `compaction_model_invocation_links` 分离摘要调用与主 Assistant invocation，
  summary committed 和 Compaction 第二事务原子收敛；
- active Summary 类别从 immutable source range 重建，历史 assistant exact provenance 任一漂移
  均失败关闭；Model-backed summarizer 禁止 Tool、验证完整 stream 且不提交部分输出；
- `harness:arh2.2`、完整 Workspace 与 Central online/offline 已通过开发者复跑。公共 Contracts、
  Kernel reducer、Desktop、Central、Document Worker、依赖和 lockfile 未修改。

ARH-2.2 等待独立 QA 与用户接受；ARH-2.3 与 ARH-3 不因本节点自动解锁。

# KN-144：ARH-2.2 正式关闭并提交 ARH-2.3 恢复 Harness 详细方案

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-2.2 PASS/CLOSED；ARH-2.3 DOCUMENT REVIEW PENDING / CODING GATED；ARH-3 GATED** |
| 阶段 | Automatic Compaction Orchestration 恢复与长循环关闭方案 |
| 依据 | Claude Code 独立 QA `PASS（P0～P3=0）`，用户正式接受 ARH-2.2；用户要求提交 ARH-2.3 详细方案后再评审 |
| 正式文档 | [ARH-2.3 Plan](../development/arh/ARH-2.3-RECOVERY-CLOSURE-HARNESS-DEVELOPMENT-PLAN.md)、[ARH-2.2 QA](../development/qa/0.0.0-arh.2.2-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[讨论线程](../../../讨论区/20260813/001-arh-23-plan-cx.md) |

## 关闭与方案结论

- ARH-2.2 独立 QA 实际串行复跑专项 9 files / 47 tests、完整 Workspace 156 files /
  1067 tests + 3 smoke 及 Central online/offline，14 项核查全部通过；
- ARH-2.3 不新增恢复状态或协议，只以真实子进程、受控 Provider/Tool 和 SQLite reopen 证明
  ARH-2.1/2.2 已有生产链；
- 七窗口分别冻结可见持久事实、恢复分类、必须断言和禁止行为；output-started 且完整输出
  不可恢复时明确 `recovery_exhausted`，不盲目新建摘要调用；
- 首次/rolling Compaction、50-round durable Tool loop、Tool/Summary 两类确认、原子边界、
  digest 稳定、资源归零和四通道泄漏扫描进入同一 50 项 QA 矩阵；
- 本节点只启动文档评审。没有用户明确授权，不得进入 ARH-2.3 编码；ARH-3 继续 `GATED`。

# KN-145：ARH-2.3 首轮评审完成并进入 Revision 1 收口复核

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-2.3 REVISION 1 / RE-REVIEW PENDING / CODING GATED；ARH-3 GATED** |
| 阶段 | Recovery Closure Harness 详细方案修订 |
| 依据 | 首轮评审 `PASS（P0=0 / P1=0 / P2=1 / P3=1）`；P0/P1=0，ARH-2.3 可在修订关闭后提交用户接受 |
| 正式文档 | [ARH-2.3 Revision 1](../development/arh/ARH-2.3-RECOVERY-CLOSURE-HARNESS-DEVELOPMENT-PLAN.md)、[讨论线程](../../../讨论区/20260813/001-arh-23-plan-cx.md) |

## 修订结论

- 受控 Provider 必须分别提供 accepted/no-output 与 output-started/unreplayable 故障模式，并以
  partial-output 和 full-output-delivered-but-unreplayable 子场景真实触发 W3/W4；
- 同一 seed 被精确定义为 semantic script seed，只固定消息、Model、Tool、业务身份、故障窗口和
  决策序列，不要求 PID、端口、墙钟、传输 ID 或操作系统调度一致；
- timeline/view digest 只消费规范化 durable semantic facts，QA 门槛由 50 项增至 52 项；
- 本节点仍为 docs-only。Revision 1 复核和用户明确授权前不得编码，ARH-3 继续 `GATED`。

# KN-146：ARH-2.3 恢复关闭 Harness 完成开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-2.3 SELF-TEST PASS / INDEPENDENT QA PENDING；ARH-3 GATED** |
| 阶段 | Automatic Compaction Recovery Closure 实施收口 |
| 依据 | ARH-2.3 Revision 1 复核 `P0～P3=0`；用户关闭计划评审并明确授权 ARH-2.3 编码 |
| 正式文档 | [ARH-2.3 Plan](../development/arh/ARH-2.3-RECOVERY-CLOSURE-HARNESS-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[讨论线程](../../../讨论区/20260813/001-arh-23-plan-cx.md) |

## 实现结论

- 七个命名窗口 W1～W7 已通过真实 Core child、受控 Provider/Tool 和 SQLite close/reopen
  验证；accepted/no-output 使用 status-first 恢复，output-started 且完整结果不可重放时明确
  `recovery_exhausted`；
- 同一 50-round 场景已经真实 `DurableAgentLoopStarter`、Process Model/Tool 和 durable
  Tool Batch/Effect 链执行，完成首次与 rolling Compaction，51 个主 Model round 和 50 次
  Tool 调用一一收敛；
- closed Tool cycle 现可成为独立旧原子组；Compaction 内部 `invocationCommit` 与持久
  `CompactionRecord` 已分离，避免严格 Summary Record 被内部提交材料污染；
- `harness:arh2.3` 17 files / 115 tests、52/52 场景，完整 Workspace 160 files /
  1087 tests + 3 smoke，以及 Central online/offline 各 215 tests 已通过开发者串行复跑；
- 公共 Contracts、Kernel reducer、Desktop、Central 生产代码与 Schema、migration 1～19、
  依赖和 lockfile 未修改。ARH-3 没有提前实现。

ARH-2.3 等待 Claude Code 独立 QA 和用户接受，不能仅凭本节点关闭；ARH-3 继续 `GATED`。

# KN-147：ARH-2.3 生产功能独立 QA 通过并进入 W6 Harness repair.1

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-2.3 PRODUCTION QA PASS / REPAIR.1 SELF-TEST PASS / INDEPENDENT QA PENDING；ARH-3 GATED** |
| 阶段 | W6 Concurrent Recovery Harness Stability Repair |
| 依据 | Claude Code 独立 QA `PASS（P0=0 / P1=0 / P2=1 / P3=0）`；用户接受生产功能结论但因完整门禁 flaky 暂不关闭 ARH-2.3，并授权 repair.1 |
| 正式文档 | [ARH-2.3 QA](../development/qa/0.0.0-arh.2.3-claude-qa.md)、[ARH-2.3 Plan](../development/arh/ARH-2.3-RECOVERY-CLOSURE-HARNESS-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[QA 交接线程](../../../讨论区/20260813/002-arh-23独立qa交接-cx.md) |

## 修复结论

- 仅将超时从 10 秒改为 30 秒不能关闭 P2：第 2 次复跑仍超时；真实根因是两个 Owner 并发
  初始化 WAL 时失败子进程提前退出未被 helper 捕获，以及两个测试 Owner 复用了相同确定性 ID；
- repair.1 让两个 fresh Owner 分别完成 SQLite start，再同时释放恢复；Owner 使用独立确定性
  ID 区间，符合生产 UUID 不碰撞前提；W6 helper/外层分别为 30/40 秒，并立即报告提前 exit；
- W6 连续 10/10、ARH-2.3 17 files / 115 tests（52/52）与完整 Workspace 160 files /
  1087 tests + 3 smoke 已通过；
- 生产 Application、Persistence Adapter、公共 Contracts、Kernel、Desktop、Central、Schema、
  migration、依赖与 lockfile 未修改。

repair.1 等待 Claude Code 独立复跑和用户接受；在此之前 ARH-2.3 不关闭，ARH-3 继续 `GATED`。

# KN-148：ARH-2.3 repair.1、ARH-2.3 与 ARH-2 整体正式关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-2.3-REPAIR.1 PASS/CLOSED；ARH-2.3 PASS/CLOSED；ARH-2 PASS/CLOSED；ARH-3 GATED** |
| 阶段 | Automatic Context Compaction Foundation 阶段关闭 |
| 依据 | Claude Code repair.1 独立 QA `PASS（P0=0 / P1=0 / P2=0 / P3=0）`；用户正式接受并依次关闭 repair.1、ARH-2.3 与 ARH-2 |
| 正式文档 | [repair.1 QA](../development/qa/0.0.0-arh.2.3-repair.1-claude-qa.md)、[ARH-2.3 QA](../development/qa/0.0.0-arh.2.3-claude-qa.md)、[ARH-2.3 Plan](../development/arh/ARH-2.3-RECOVERY-CLOSURE-HARNESS-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 正式关闭结论

- W6 连续独立复跑 10/10，ARH-2.3 Harness 52/52，完整 Workspace 160 files /
  1087 tests，Central online/offline 均通过，上一轮唯一 P2 已关闭；
- ARH-2 已形成完整闭环：ARH-2.1 固定原子规划与 Compacted View，ARH-2.2 接入生产自动
  Compaction，ARH-2.3 以七窗口、首次/rolling 和 50-round Durable Tool Loop 证明恢复闭环；
- repair.1 只修改 test/fixture，生产 Application、Persistence、公共 Contract、Kernel、Desktop、
  Central、Schema/migration、依赖与 lockfile 均未改变；
- ARH-2 关闭只证明单 Session 自动 Context Compaction Foundation，不代表长期 Memory、Prompt
  Cache、精确 token accounting、retry usage dedupe 或生产 SLA 已实现。

ARH-3 不自动解锁。下一步只能先提交 ARH-3 详细实施方案，完成文档评审并取得用户明确编码授权。

# KN-149：ARH-3 详细方案进入文档评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-2 PASS/CLOSED；ARH-3.0 DOCUMENT REVIEW PENDING；ARH-3.1/3.2/3.3 CODING GATED** |
| 阶段 | Isolation、Usage Accounting 与 Prompt Cache 方案收敛 |
| 依据 | ARH-2 整体正式关闭；用户要求进入下一步；既有 ARH 总计划规定 ARH-3 必须先详细方案评审 |
| 正式文档 | [ARH-3 Detailed Plan](../development/arh/ARH-3-ISOLATION-ACCOUNTING-PROMPT-CACHE-DEVELOPMENT-PLAN.md)、[ARH Parent Plan](../development/arh/ARH-AGENT-RUNTIME-HARNESS-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结提案

- `ContextBudgetEstimate`、`ProviderUsageFact` 与未来 `CostProjection` 分离；ARH-3 只记录
  Provider 已报告且可验证的 Usage，不宣称等于最终账单；
- retry dedupe 使用 durable `invocationId + fencingEpoch` attempt identity；同 attempt 重放
  幂等，不同 attempt 的已确认 Usage 分别保留，禁止进程内 Set；
- Prompt Cache Alpha 只允许同企业、同用户、同 Credential namespace、同 exact Model/
  Binding/Adapter/Protocol 与同静态前缀的跨 Session 共享；跨用户/企业默认禁止；
- cache 是 Provider 优化，不改变 Context Budget、Model/Binding、权限、Prompt 正文、Task
  状态或请求语义；真实 Provider cache hit/计费验证继续 RESOURCE_GATED；
- ARH-3.1/3.2/3.3 均未获编码授权。本文档评审通过后仍需用户明确授权 ARH-3.1。

# KN-150：ARH-3 Revision 2 引入 Codex Cache/Usage 经验并重新评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-3.0 REVISION 2 / DOCUMENT RE-REVIEW PENDING；ARH-3.1/3.2/3.3 CODING GATED** |
| 阶段 | Codex 研究提升与 ARH-3 方案修订 |
| 依据 | 用户要求重新查看 Codex 研究并修订方案；研究源码快照 `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7` |
| 正式文档 | [ARH-3 Revision 2](../development/arh/ARH-3-ISOLATION-ACCOUNTING-PROMPT-CACHE-DEVELOPMENT-PLAN.md)、[ARH Parent Plan](../development/arh/ARH-AGENT-RUNTIME-HARNESS-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 修订决策

- Alpha Prompt Cache 使用 exact Session scope：同一 Session 跨 Turn 可以复用，不同 Session
  即使同一用户且静态前缀相同也不得共享；
- `cacheScopeIdDigest`、`staticPrefixDigest` 与 transport session/request identity 分离；
- 新增穷尽 `PromptCacheCompatibilityFingerprint`，新增请求字段默认关闭缓存直至明确分类；
- 新增 Static Prefix Monotonicity；Task lock 期间不原地重写静态前缀，key/prefix 漂移失败关闭；
- `InvocationUsageProjection` 与 `SessionUsageProjection` 是从 invocation-level durable facts
  重建的派生读模型，不是第二 Usage 事实源；重启/重连不生成新 durable Usage Event；
- 现有 Core-private invocation 与严格 Gateway v1alpha1 envelope 没有 Session scope；Revision 2
  提议最小 v1alpha2 `cacheContext` sidecar，不改公共 `ModelRequest`，v1alpha1 缺少 sidecar 时
  cache disabled；
- 保留 `ProviderUsageFact`、attempt identity、fencing、Central 事务和 Core/Central 双数据库恢复；
  不照搬 Codex 的进程内累计 TokenUsage；
- Root/Child Session Family cache sharing 延后到 Subagent 阶段；当前不预留静默共享。

本节点是对 KN-149 提案的收紧和补充，不表示 ARH-3 已获编码授权。Revision 2 必须先由
Claude Code 重新评审，之后仍由用户决定是否关闭 ARH-3.0 并授权 ARH-3.1。

# KN-151：ARH-3 Revision 3 统一企业/个人模型 Usage 与 Cache 语义

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-3.0 REVISION 3 / DIFFERENTIAL DOCUMENT REVIEW PENDING；ARH-3.1/3.2/3.3 CODING GATED** |
| 阶段 | Usage/Cache 执行位置中立收敛 |
| 依据 | 用户要求从长期价值、未来必要性和返工风险给出整体方案，并接受按该方案进入下一步文档修订 |
| 正式文档 | [ARH-3 Revision 3](../development/arh/ARH-3-ISOLATION-ACCOUNTING-PROMPT-CACHE-DEVELOPMENT-PLAN.md)、[ARH Parent Plan](../development/arh/ARH-AGENT-RUNTIME-HARNESS-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 最终方向

- ARH-3 有长期价值并应继续，但不以“新增参考”为理由重写已冻结 Core；新增内容被限制为
  Usage 权威事实、retry dedupe、Prompt Cache Planner 和统一 Evidence 的独立增量层；
- `ProviderUsageFact` / `PromptCachePlan` 使用执行位置中立语义：企业路径由
  `central_enterprise`（Central PostgreSQL）承担权威，个人路径未来由 `local_personal`
  （Local Core 私有存储）承担权威；
- attempt identity/digest、Invocation/Session Projection、exact Session Cache、Compatibility
  Fingerprint 与 Prefix Monotonicity 共用同一 Conformance，但两类路径的存储、Credential
  namespace、cache key 和事务实现严格隔离；
- ARH-3.1/3.2 只实现企业生产路径，个人路径只冻结 Core-private Port、Fake 和 Conformance，
  防止将来接入个人模型时复制第二套语义，也避免现在超前建设未进入范围的真实个人链路；
- 用户接受 Enterprise Gateway `v1alpha2 cacheContext` 作为企业路径的最小 Contract 例外；
  它不进入公共 ModelRequest，个人路径不发送 sidecar，字段级实现仍由 ARH-3.2 单独授权；
- OpenAI Prompt Cache 官方依据已校正；QA 调整为 40/44/30，工程估算为 12～19 工作日。

本节点仍为 docs-only。Claude Code 必须先完成 Revision 3 差异复核；复核 PASS 不自动授权
ARH-3.1，所有编码继续 `GATED`。

# KN-152：ARH-3.0 正式关闭并完成 ARH-3.1 开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-3.0 PASS/CLOSED；ARH-3.1 IMPLEMENTED / DEVELOPER TEST PASS / INDEPENDENT QA PENDING；ARH-3.2/3.3 GATED** |
| 阶段 | Durable Usage Facts 与 Retry Dedupe |
| 依据 | Claude Code Revision 3 差异复核 `P0～P3=0`；用户正式接受、关闭 ARH-3.0、确认计划并单独授权 ARH-3.1 |
| 正式文档 | [ARH-3 Plan](../development/arh/ARH-3-ISOLATION-ACCOUNTING-PROMPT-CACHE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Register](./UPSTREAM-ADOPTION-REGISTER.md) |

## 实现结论

- `ProviderUsageFact`、authority-scoped attempt identity 与 self-validating digest 已实现；企业
  `central_enterprise` 由 Central PostgreSQL v0008 持有权威事实，`local_personal` 首期只冻结
  Core-private Port/Fake，不接真实个人 Provider、凭据、权威表或 UI；
- terminal winner 的 Usage Fact、durable Event、Audit Outbox 与 terminal 状态同一事务提交；
  stale owner 只能记录 `superseded_confirmed`，同 attempt 重放幂等且不同 digest 冲突；
- Core migration 20 只保存安全 Invocation Usage Projection，主 Assistant 与 Compaction 调用
  共用同一规则；Session Projection 从 invocation-level facts 确定性重建，不建立第二事实源；
- v0008 的 Fresh、v0006、v0007 与 Legacy Bridge 四条路径已在 PostgreSQL 16 和 Embedded
  PostgreSQL 16 验证；v0001～v0007 不改写；
- ARH-3.1 专项 4 files / 24 tests、完整 Workspace 162 files / 1099 tests + 3 smoke、Central
  online/offline 各 223 tests 已通过开发者串行复跑；公共 Contracts、Kernel、Desktop 均未修改；
- Prompt Cache、Gateway v1alpha2 `cacheContext`、真实个人模型链路与 ARH-3.3 均未提前实现。

ARH-3.1 等待 Claude Code 独立 QA 和用户接受，不能仅凭本节点关闭；ARH-3.2/3.3 继续
`GATED`。

# KN-153：ARH-3.1 正式关闭并提交 ARH-3.2 详细实施方案评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-3.1 PASS/CLOSED；ARH-3.2 PLAN DOCUMENT REVIEW PENDING / CODING GATED；ARH-3.3 GATED** |
| 阶段 | Session-scoped Prompt Cache Planning 与双协议 Projection 方案收口 |
| 依据 | Claude Code ARH-3.1 独立 QA `PASS（P0=0 / P1=0 / P2=0 / P3=0）`；用户正式接受并关闭 ARH-3.1，要求先提交 ARH-3.2 详细方案评审且不得自动编码 |
| 正式文档 | [ARH-3.2 Detailed Plan](../development/arh/ARH-3.2-PROMPT-CACHE-PLANNING-DEVELOPMENT-PLAN.md)、[ARH-3 Plan](../development/arh/ARH-3-ISOLATION-ACCOUNTING-PROMPT-CACHE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Register](./UPSTREAM-ADOPTION-REGISTER.md) |

## 关闭与方案结论

- ARH-3.1 的 v0008 Provider Usage Fact、authority-scoped attempt identity、terminal 原子事务、
  Core migration 20 safe projection 与企业/个人 authority 边界已通过独立 QA 并正式关闭；
- 当前 Core-private `ModelProviderInvocation` 已存在 exact `sessionId`；ARH-3.2 不重复创建 Session
  身份，只增加 opaque `sessionScopeDigest`、link-side durable Cache Context 和跨进程 v1alpha2
  sidecar；
- ARH-3.2 采用 3.2.1 Contract/Scope、3.2.2 Durable Planner/Profile、3.2.3 Provider Projection
  三批，分别覆盖 Core migration 21、Central v0009、双 JVM恢复和 Anthropic/OpenAI 投影；
- Cache 只作为 semantic-neutral Provider 优化，不改变公共 `ModelRequest`、Context Budget、
  Model/Binding、授权、Task 状态或 ARH-3.1 Usage 原始语义；v1alpha1/unsupported Relay 默认
  cache disabled；
- 本节点为 docs-only。Claude Code 与 MiniMax 文档评审通过也不自动解锁 ARH-3.2.1，仍需
  用户明确编码授权；ARH-3.3 继续 `GATED`。

# KN-154：ARH-3.2 Revision 1 收口 Cache Scope 派生与 namespace 退役语义

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 状态 | **ARH-3.2 REVISION 1 / DIFFERENTIAL DOCUMENT REVIEW PENDING / CODING GATED；ARH-3.3 GATED** |
| 阶段 | Session-scoped Prompt Cache 详细方案首轮评审修订 |
| 依据 | Claude Code 首轮计划评审 `PASS（P0=0 / P1=0 / P2=0 / P3=2）`；用户要求开始下一步修订与复核 |
| 正式文档 | [ARH-3.2 Detailed Plan Revision 1](../development/arh/ARH-3.2-PROMPT-CACHE-PLANNING-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 修订结论

- `sessionScopeDigest` 只是 Core 提供的 exact Session opaque proof；Central 的
  `cacheScopeIdDigest` 必须绑定 verified enterprise/user claims、Credential namespace、exact
  Session 与 Model/Binding/Adapter/Protocol/Profile revision，不能直接改名或单字段退化；
- namespace `retired` 只禁止生成新 context，不删除旧 key，不阻断已持久 invocation 按旧 revision
  精确恢复；Alpha 不建设自动 rotation、删除、GC 或 Provider cache invalidation；
- ARH-3.2.1/3.2.2 QA 各增加 4 项，总计划门禁提高到至少 70 项，验证派生输入漂移、transport
  identity 分离、retired reopen 和历史 namespace 缺失失败关闭；
- MiniMax 补充意见中与 exact Session、Provider-side cache 与 fail-closed 基线冲突的部分不采纳，
  UI、PRD 和五类性能场景不进入 Foundation 门禁；
- 本节点为 docs-only，不修改代码、Contract、Schema、migration、依赖或版本。Claude Code 差异
  复核 PASS 也不自动解锁 ARH-3.2.1，仍需用户明确授权。

# KN-155：ARH-3.2.1 完成 Contract 与 exact Session Scope Foundation 开发者自测

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-14 |
| 状态 | **ARH-3.2 PLAN PASS/CLOSED；ARH-3.2.1 IMPLEMENTED / DEVELOPER TEST PASS / INDEPENDENT QA PENDING；ARH-3.2.2/3.2.3/3.3 GATED** |
| 阶段 | Gateway v1alpha2 Contract、Core exact Session scope 与 C1/C2 恢复底座 |
| 依据 | Claude Code Revision 1 差异复核 `P0～P3=0`；用户关闭计划评审并单独授权 ARH-3.2.1；开发者完整门禁全绿 |
| 正式文档 | [ARH-3.2 Plan](../development/arh/ARH-3.2-PROMPT-CACHE-PLANNING-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Register](./UPSTREAM-ADOPTION-REGISTER.md) |

## 实现结论

- Enterprise Gateway Model Invocation `v1alpha2` 以语言中立 Schema/OpenAPI/Fixture/canonical digest
  冻结 strict cache sidecar，TypeScript 与 Java 使用相同 Fixture；v1alpha1 未改写；
- Core migration 21 持久化 authority-scoped HMAC namespace 和 invocation-side cache context，
  主调用与 Compaction 调用均通过 stable link 完成 C1/C2 幂等恢复；raw Session 和 namespace key
  不进入网络 Contract；
- Gateway client 一次锁定 v1alpha1/v1alpha2 operation，四条路由不混用；Central v1alpha2
  Controller 依赖无生产 Bean 的 typed seam，确保本批不会提前启用 Cache Planner；
- retired namespace 可供既有 context 精确恢复，但不生成新 context；历史 namespace 缺失、
  digest 漂移与 cache sidecar 漂移均失败关闭，不自动 rotation、删除或 GC；
- ARH-3.2.1 专项 4 files / 60 tests、Workspace 163 files / 1132 tests + 3 smoke、Central
  online/offline 各 233 tests 已由开发者串行复跑通过；独立 QA 尚未执行，不能据此关闭本批；
- Central v0009、PromptCachePlan/Profile、Provider cache 字段投影、真实 cache hit 与个人模型路径
  均未实现；ARH-3.2.2、ARH-3.2.3 与 ARH-3.3 继续 `GATED`。

# KN-156：ARH-3.2.1 正式关闭并进入 ARH-3.2.2 详细方案评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-14 |
| 状态 | **ARH-3.2.1 PASS/CLOSED；ARH-3.2.2 DOCUMENT REVIEW PENDING / CODING GATED；ARH-3.2.3/3.3 GATED** |
| 阶段 | exact Session Scope Foundation 收口与 Durable Cache Planner 文档门禁 |
| 依据 | Claude Code 独立 QA `P0～P3=0`；用户正式接受并关闭 ARH-3.2.1，要求先评审 ARH-3.2.2 详细方案 |
| 正式文档 | [ARH-3.2.2 Detailed Plan](../development/arh/ARH-3.2.2-DURABLE-CACHE-PLANNER-DEVELOPMENT-PLAN.md)、[ARH-3.2 Parent Plan](../development/arh/ARH-3.2-PROMPT-CACHE-PLANNING-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 收口与下一阶段边界

- ARH-3.2.1 独立 QA 实际串行复跑专项 4 files / 60 tests、Workspace 163 files / 1132 tests +
  3 smoke、Central online/offline 各 233 tests；13 项重点核查全过且 `P0～P3=0`，用户已正式接受；
- ARH-3.2.2 详细方案将 Profile、Compatibility Classifier、Static Prefix Projector、Scope Deriver、
  deterministic Planner、Central v0009 两表、accept/dispatch 两事务、Static Prefix Monotonicity 与
  C3～C7 双 JVM恢复冻结为待评审边界；
- ARH-3.2.2 只建立 durable Plan，不能把 `eligible` 解释为 Provider cache 已投影或命中；真实
  Anthropic/OpenAI cache 字段和 Usage 集成仍属于 ARH-3.2.3；
- 本节点为 docs-only，没有新增代码、Schema、migration、生产 Bean、依赖、版本或测试；文档评审
  PASS 不自动解锁编码，仍需用户明确接受和授权；
- ARH-3.2.3 与 ARH-3.3 继续 `GATED`。

# KN-157：ARH-3.2.2 修正 Cache Scope 与 Static Source 语义混用

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-14 |
| 状态 | **ARH-3.2.2 REVISION 1 DIFFERENTIAL REVIEW PENDING / CODING GATED；ARH-3.2.3/3.3 GATED** |
| 阶段 | Durable Cache Planner 文档矛盾修复与四层身份冻结 |
| 依据 | Claude Code 首轮评审 `P0～P2=0 / P3=1`；技术负责人独立复核确认 scope/source/prefix 混用为真实 P2 |
| 正式文档 | [ARH-3.2.2 Revision 1](../development/arh/ARH-3.2.2-DURABLE-CACHE-PLANNER-DEVELOPMENT-PLAN.md)、[ARH-3.2 Parent Plan](../development/arh/ARH-3.2-PROMPT-CACHE-PLANNING-DEVELOPMENT-PLAN.md)、[ARH-3 Master Plan](../development/arh/ARH-3-ISOLATION-ACCOUNTING-PROMPT-CACHE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 决策与门禁

- `cacheScopeIdDigest` 只绑定 enterprise/user/Credential/exact Session 安全隔离身份；
- `staticSourceLockDigest` 精确锁定 Platform Prompt、Agent、selected Skill 与 allowed Tool revisions；
- `staticPrefixDigest` 只证明实际 canonical 静态内容；`cacheKeyDigest` 再组合 source、prefix、
  Compatibility 与 exact Model/Binding/Adapter/Profile/Policy；
- 同一 Session 合法切换 Agent/Skill/Tool revision 必须创建新 source lock/key，旧 Plan 不变；只有
  相同 source/execution/Profile identity 生成不同 prefix 时失败关闭；
- `deviceId/clientInstanceId` 保持 Token、Device Trust 与 Audit 锚点，不进入 cache key；不同设备
  Core 使用不同 HMAC namespace，不能跨设备共享 opaque Session scope；
- Provider-side cache hit 仍发生 Provider 调用，Usage/成本事实只来自 ARH-3.1 Provider Usage，
  Plan 不估算“节省 Token”；
- ARH-3.2.2 QA 提高到 44 项，ARH-3.2 总门禁提高到 86 项；本节点仍为 docs-only；
- Revision 1 只提交 Claude Code 差异复核。复核 PASS 不自动解锁编码，仍需用户明确授权。

# KN-158：ARH-3.2.2 完成 Durable Cache Planner 开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-14 |
| 状态 | **ARH-3.2.2 IMPLEMENTED / DEVELOPER TEST PASS / INDEPENDENT QA PENDING；ARH-3.2.3/3.3 GATED** |
| 阶段 | Central Prompt Cache Profile、Durable Plan、PostgreSQL v0009 与 C3～C7 恢复 |
| 依据 | Revision 1 差异复核 `P0～P3=0`；用户关闭计划评审并单独授权；专项和完整开发者门禁全绿 |
| 正式文档 | [ARH-3.2.2 Plan](../development/arh/ARH-3.2.2-DURABLE-CACHE-PLANNER-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Register](./UPSTREAM-ADOPTION-REGISTER.md) |

## 实现结论

- v1alpha2 accept 通过 Transaction A 原子绑定 Invocation、exact Cache Context、accepted Event 与
  Audit Outbox；Transaction B 在调用 Backend 前原子持久 Prompt Cache Plan、dispatch decision、
  running Event 与 Outbox；
- `cacheScopeIdDigest`、`staticSourceLockDigest`、`staticPrefixDigest` 与 `cacheKeyDigest` 四层分离，
  合法切换 Agent/Skill/Tool revision 生成新 Plan，旧 Plan 不变；相同 source lock 内容漂移失败关闭；
- Central PostgreSQL v0009、InMemory/MyBatis Port 与 Schema Conformance 已落地；Profile 仍来自
  versioned Seed，不进入可变数据库配置，不保存 Prompt、输出、Credential、Endpoint 或 Token；
- C3～C7 通过真实双 JVM、共享 PostgreSQL、lease/fencing 与 takeover 验证；v1alpha1 仍走 no-cache，
  Runtime 仍是 durable terminal 唯一写入者；
- 专项 `harness:arh3.2.2` 为 9 test classes / 66 tests PASS，Provider projection disabled、敏感
  输出扫描为零；完整门禁结果记录在 Development Log；
- 本批不投影 `cache_control`、`prompt_cache_key`，不宣称 Provider cache hit 或 Token 节省；
  ARH-3.2.3 与 ARH-3.3 继续 `GATED`，独立 QA 与用户接受前不得关闭 ARH-3.2.2。

# KN-159：ARH-3.2.2 正式关闭并进入 ARH-3.2.3 Provider Projection 方案评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-14 |
| 状态 | **ARH-3.2.2 PASS/CLOSED；ARH-3.2.3 DOCUMENT REVIEW PENDING / CODING GATED；ARH-3.3 GATED** |
| 阶段 | Durable Cache Planner 收口与双协议 Provider Cache Projection 文档门禁 |
| 依据 | Claude Code 独立 QA `P0～P3=0`；用户正式接受并关闭 ARH-3.2.2，要求先评审 ARH-3.2.3 详细方案 |
| 正式文档 | [ARH-3.2.3 Detailed Plan](../development/arh/ARH-3.2.3-PROVIDER-CACHE-PROJECTION-CLOSURE-DEVELOPMENT-PLAN.md)、[ARH-3.2 Parent Plan](../development/arh/ARH-3.2-PROMPT-CACHE-PLANNING-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 收口与下一阶段边界

- ARH-3.2.2 独立 QA 实际串行复跑专项 9 classes / 66 tests、Workspace 163 files / 1132 tests +
  3 smoke、Central online/offline；四层身份、v0009、Transaction A/B、C3～C7、双 JVM 和敏感输出
  均通过，`P0～P3=0`，用户已正式接受；
- ARH-3.2.3 只补 immutable Plan 的消费与双协议 Provider projection，不建设缓存平台、第二套
  Planner、Usage 权威或 UI；
- Application 层负责 exact Plan/Profile/Binding/static prefix 复核与 typed projection，Backend/
  Adapter 不访问 Repository、不提交 durable terminal；
- Anthropic 首期只允许 versioned default 5m marker；OpenAI 区分 automatic-observed 与
  exact-profile explicit key；未冻结的 retention/TTL、真实付费 Provider、个人模型和 ARH-3.3
  继续延后；
- 本节点为 docs-only，没有修改代码、公共 Contract、Schema/migration、依赖、版本或测试；
  文档评审 PASS 不自动解锁编码，仍需用户明确接受和授权。

# KN-160：ARH-3.2.3 完成双协议 Provider Cache Projection 开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-14 |
| 状态 | **ARH-3.2.3 IMPLEMENTED / DEVELOPER TEST PASS / INDEPENDENT QA PENDING；ARH-3.3 GATED** |
| 阶段 | immutable Prompt Cache Plan 到 Provider wire 与 durable Usage 的闭环 |
| 依据 | Revision 1 差异复核 `P0～P3=0`；用户明确授权；专项、Central online/offline 与 Workspace 完整门禁全绿 |
| 正式文档 | [ARH-3.2.3 Plan](../development/arh/ARH-3.2.3-PROVIDER-CACHE-PROJECTION-CLOSURE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Register](./UPSTREAM-ADOPTION-REGISTER.md) |

## 实现结论

- Application 层从 immutable Plan、Profile、Binding、Compatibility 与四层 cache identity 解析
  typed Provider Projection；任何 digest/revision/static prefix 漂移在 Provider 调用前失败关闭；
- canonical static material planner 同时服务 prefix digest 与 Adapter wire builder，Anthropic marker
  只落在最后一个受控静态 system/tool block，OpenAI explicit key 保持 opaque，dynamic 内容不标记；
- marker Policy ID 不写入 `5m` 等 Provider 时间常量；Anthropic 不发送显式 TTL，OpenAI 不发送
  retention，未来行为变化必须建立新 Policy revision；
- Provider Usage 是 cache hit/write 的唯一事实；Backend/Adapter 不访问 Repository、不写 terminal，
  Runtime 继续保持 durable terminal 单写者；
- 进程外 Controlled Provider 已证明 C8～C10、确定拒绝不降级重试、取消、deadline、敏感输出为零
  和 child/port 资源归零；专项 10 classes / 93 tests、Central online/offline 各 297 tests、Workspace
  163 files / 1132 tests + 3 smoke 全部通过；
- 本批没有修改公共 Contract、v0009、Core migration、Kernel、Desktop 或依赖；独立 QA 与用户接受
  前不得关闭 ARH-3.2.3/ARH-3.2，ARH-3.3 不自动解锁。

# KN-161：ARH-3.2.3 与 ARH-3.2 正式关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **ARH-3.2.3 PASS/CLOSED；ARH-3.2 PASS/CLOSED；ARH-3.3 GATED** |
| 阶段 | Provider Cache Projection Closure 独立 QA 与 Prompt Cache Planning 整体收口 |
| 依据 | Claude Code 独立 QA `P0=0 / P1=0 / P2=0 / P3=1`；用户正式接受并关闭 ARH-3.2.3 与 ARH-3.2 |
| 正式文档 | [ARH-3.2.3 Plan](../development/arh/ARH-3.2.3-PROVIDER-CACHE-PROJECTION-CLOSURE-DEVELOPMENT-PLAN.md)、[QA Report](../development/qa/0.0.0-arh.3.2.3-claude-qa.md)、[Test Reliability Tracker](../development/qa/CENTRAL-TEST-RELIABILITY-TRACKER.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 收口结论

- 独立 QA 实际复跑专项 10 classes / 93 tests、Workspace 163 files / 1132 tests + 3 smoke、
  Central offline 297/0/0/0；双协议 wire projection、C8～C10、durable Usage、敏感扫描与资源归零
  全部通过；
- Central online 首次出现的两个偶发失败均来自既有 CGF-2A.3/MyBatis 测试，单项复跑稳定通过；
  Codex 5.6 另一轮 Central online/offline 完整套件均 297/0/0/0，当前证据不构成生产回归；
- P3-1 登记为 `CTR-P3-001` 独立测试可靠性维护项；不得修改生产 lease/fencing/事务语义迁就
  测试，不得使用无界 retry，也不得静默并入 ARH-3.3；
- ARH-3.2.1、3.2.2、3.2.3 三批均已关闭，ARH-3.2 整体正式关闭；ARH-3.3 继续 `GATED`，
  必须经过详细方案评审和用户明确授权。

# KN-162：ARH-3.3 进入 Multi-Session Evidence 详细方案评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **ARH-3.3 DETAILED PLAN DOCUMENT REVIEW PENDING / CODING GATED** |
| 阶段 | ARH-3 统一 Multi-Session Isolation 与 Evidence 关闭方案 |
| 依据 | 用户接受技术负责人建议：先建立详细方案、提交讨论区评审，不自动进入编码 |
| 正式文档 | [ARH-3.3 Development Plan](../development/arh/ARH-3.3-MULTI-SESSION-EVIDENCE-HARNESS-DEVELOPMENT-PLAN.md)、[ARH-3 Master Plan](../development/arh/ARH-3-ISOLATION-ACCOUNTING-PROMPT-CACHE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结边界

- ARH-3.3 是证据收口阶段，原则上只增加 test fixture、Harness、architecture guard 与机器可读
  Evidence，不增加新的生产 Usage、Cache、Context、Compaction 或 Agent Loop 机制；
- 两个 Core child、两个 Central JVM、共享 PostgreSQL、独立 SQLite 与受控 Provider 组成最小
  进程外拓扑；三个 Session、两 user/enterprise scope 证明同用户跨 Session 与跨企业隔离；
- 企业完整路径与 `local_personal` Port/Fake 共用语义但不共享事实、Credential、attempt 或 cache
  identity；不得宣称真实个人 Provider 已接通；
- ARH-3.3 拆为 3.3.1/2/3 并逐批评审、授权、独立 QA；详细方案评审 PASS 不自动解锁编码；
- 若 Harness 发现生产缺陷，必须停止对应批次并另立 repair，经用户授权后处理；
- `CTR-P3-001` 继续独立跟踪，不属于 ARH-3.3，也不得通过本阶段顺手修复。

# KN-163：ARH-3.3.1 Multi-Session Topology Foundation 完成开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **ARH-3.3.0 PASS/CLOSED；ARH-3.3.1 IMPLEMENTED / DEVELOPER TEST PASS / INDEPENDENT QA PENDING；ARH-3.3.2/3 GATED** |
| 阶段 | ARH-3 Multi-Session Isolation 与统一 Evidence Harness |
| 依据 | 用户接受 ARH-3.3 文档评审、确认正式计划并单独授权 ARH-3.3.1 |
| 正式文档 | [ARH-3.3 Development Plan](../development/arh/ARH-3.3-MULTI-SESSION-EVIDENCE-HARNESS-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Register AR-062](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已完成事实

- 两个独立 Core child、两份独立 Core SQLite、两个 Central JVM、共享 PostgreSQL 与受控进程外
  Provider 形成实际拓扑；A1/A2/B1 三 Session 跨两个 user/enterprise scope；
- 同一 Session 跨 Turn 的 scope identity 稳定，同用户跨 Session 不复用；Conversation、Usage
  Projection、Cache Context 和数据库 identity 均保持隔离；
- `central_enterprise` 与 `local_personal` Fake 不共享 attempt、Gateway sidecar 或 Central
  Projection；未宣称真实个人 Provider 已实现；
- 专项 **12/12**、Central 选定 **44 tests**、Workspace **164 files / 1139 tests + 3 smoke**、
  Central online/offline 各 **299 tests** 已通过开发者门禁；敏感扫描与资源余量为 0；
- 本批未修改生产代码、Contract、Schema/migration、依赖、Kernel 或 Desktop。M1～M8、
  Compaction 恢复矩阵和统一关闭 Evidence 继续属于 ARH-3.3.2/3，未经用户授权不得进入。

# KN-164：ARH-3.3.1 正式关闭并进入 ARH-3.3.2 详细方案评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **ARH-3.3.1 PASS/CLOSED；ARH-3.3.2 DOCUMENT REVIEW PENDING / CODING GATED；ARH-3.3.3 GATED** |
| 阶段 | ARH-3 Recovery、Usage 与 Compaction 统一 Evidence |
| 依据 | Claude Code 独立 QA PASS；用户正式接受并关闭 ARH-3.3.1，要求下一步只建立 ARH-3.3.2 详细方案并评审 |
| 正式文档 | [ARH-3.3.2 Development Plan](../development/arh/ARH-3.3.2-RECOVERY-USAGE-COMPACTION-MATRIX-DEVELOPMENT-PLAN.md)、[ARH-3.3 Parent Plan](../development/arh/ARH-3.3-MULTI-SESSION-EVIDENCE-HARNESS-DEVELOPMENT-PLAN.md)、[QA Report](../development/qa/0.0.0-arh.3.3.1-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 收口与新门槛

- ARH-3.3.1 独立 QA：专项 **12/12**、Workspace **164/1139 + 3 smoke**、Central
  online/offline **299/0/0/0**；唯一 P3 为既有 `CTR-P3-001`，不构成本批产品缺陷；
- ARH-3.3.2 选择 test-only Java topology coordinator 统一拥有双 Central、共享 PostgreSQL、
  Provider 与双 Core，使 M1～M8 和 Central durable Usage Event → Core Projection 可在真实进程
  链中验证；
- 计划覆盖 main/initial/rolling Compaction Usage、attempt/fencing、cache 状态、SQLite reopen、
  PostgreSQL pause/unpause 与 Summary + raw tail digest，QA 规划 52 项；
- 本节点只确认 docs-only 方案进入评审。ARH-3.3.2 未获用户明确编码授权，ARH-3.3.3 继续
  `GATED`，且 `CTR-P3-001` 不得被静默并入。

# KN-165：ARH-3.3.2 因 Usage Projection-before-cursor P1 暂停并进入前置修复

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **repair.1 IMPLEMENTED / DEVELOPER TEST PASS / INDEPENDENT QA PENDING；ARH-3.3.2 PAUSED；ARH-3.3.3 GATED** |
| 阶段 | Assistant/Compaction durable Usage 恢复顺序修正 |
| 依据 | 用户将问题确认为 ARH-3.3.2 前置 P1，并仅授权 `0.0.0-arh.3.3.2-preflight-repair.1` |
| 正式文档 | [ARH-3.3.2 Development Plan](../development/arh/ARH-3.3.2-RECOVERY-USAGE-COMPACTION-MATRIX-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 修复结论与门槛

- 纠正此前方案评审中的错误代码事实：Assistant 与 Compaction 的 `usage_recorded` 原实现均先推进
  durable cursor、后写 Core Usage Projection，崩溃可造成 Projection 永久缺失；
- 两条生产路径均改为 Projection-before-cursor；Projection 已提交但 cursor 失败时依靠稳定
  identity/digest 幂等重放，不创建第二事实、不重复 Gateway accept；
- 新增四个崩溃窗口测试，覆盖 Assistant/Compaction 的 Projection 前故障与 Projection 后、cursor
  前故障；Assistant 使用 SQLite close/reopen 验证持久恢复；
- 本批没有修改公共 Contract、Schema/migration、Kernel、Desktop、Central 或依赖，也没有进入
  ARH-3.3.2 M1～M8 主 Harness；
- 开发者专项 **15 tests**、Workspace **164 files / 1143 tests + 3 smoke** 已通过。独立 QA PASS
  且用户接受前不得关闭 repair.1 或恢复 ARH-3.3.2，ARH-3.3.3 继续 `GATED`。

# KN-166：ARH-3.3.2 前置修复正式关闭并恢复主 Harness 开发

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **repair.1 PASS/CLOSED；ARH-3.3.2 AUTHORIZED / IN PROGRESS；ARH-3.3.3 GATED** |
| 决策者 | 用户 |
| 依据 | Claude Code 独立 QA `P0～P3=0`；用户正式接受并关闭 `0.0.0-arh.3.3.2-preflight-repair.1`，恢复既有 ARH-3.3.2 开发授权 |
| 正式文档 | [ARH-3.3.2 Development Plan](../development/arh/ARH-3.3.2-RECOVERY-USAGE-COMPACTION-MATRIX-DEVELOPMENT-PLAN.md)、[QA Report](../development/qa/0.0.0-arh.3.3.2-preflight-repair.1-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- Assistant 与 Compaction 两条企业 Usage 路径已统一为 Projection-before-cursor；Projection 前、
  Projection 后 cursor 前、SQLite reopen 与幂等重放均通过独立 QA；
- 前置 P1 已关闭，不再阻塞已确认的 M1～M8、Usage、Cache 与 Compaction 跨进程矩阵；
- 本节点只恢复 ARH-3.3.2 主开发，不授权 ARH-3.3.3，也不改变公共 Contract、Schema/migration、
  Kernel、Desktop 或 Central 生产语义。

# KN-167：真实 Central terminal 顺序暴露 durable Usage 重放 P1

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **repair.2 PROPOSED / USER DECISION REQUIRED；ARH-3.3.2 PAUSED；ARH-3.3.3 GATED** |
| 决策者 | Codex 5.6 提交问题与方案，等待用户授权 |
| 依据 | ARH-3.3.2 真实 Central 接缝核查；主计划 §11 要求发现生产缺陷后停止并单列 repair |
| 正式文档 | [Repair.2 Plan](../development/arh/ARH-3.3.2-PREFLIGHT-REPAIR.2-DURABLE-USAGE-RECONCILIATION-PLAN.md)、[ARH-3.3.2 Plan](../development/arh/ARH-3.3.2-RECOVERY-USAGE-COMPACTION-MATRIX-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 代码事实与决策边界

- Central terminal 事务内已经可靠持久化 Usage 与 terminal；Central SSE 也允许从旧 cursor 回放
  durable Events；
- Core Assistant/Compaction 目前会因 `outputStartedAt` 或 `completed` status 在订阅 durable Events
  前退出，导致 repair.1 未消费的 Usage 在真实 M3/M4 下仍不能进入本地 Projection；
- repair.2 只拟分离“durable Usage/cursor 恢复”与“ephemeral output 不可恢复”，不改变输出失败
  语义，不引入新状态、Contract、Schema/migration 或 exactly-once 声明；
- 未获用户明确授权前不得编码 repair.2，也不得继续 ARH-3.3.2 M1～M8 或进入 ARH-3.3.3。

# KN-168：ARH-3.3.2 terminal durable Usage 前置修复完成开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **repair.2 IMPLEMENTED / DEVELOPER TEST PASS / INDEPENDENT QA PENDING；ARH-3.3.2 PAUSED；ARH-3.3.3 GATED** |
| 决策者 | 用户授权 repair.2；Codex 5.6 实施并完成开发者门禁 |
| 依据 | 用户将问题确认为 ARH-3.3.2 新前置 P1，授权 `0.0.0-arh.3.3.2-preflight-repair.2`，要求独立 QA 和用户接受后才恢复主开发 |
| 正式文档 | [Repair.2 Plan](../development/arh/ARH-3.3.2-PREFLIGHT-REPAIR.2-DURABLE-USAGE-RECONCILIATION-PLAN.md)、[ARH-3.3.2 Plan](../development/arh/ARH-3.3.2-RECOVERY-USAGE-COMPACTION-MATRIX-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 已完成事实

- Assistant 与 Compaction 统一为 status-first terminal reconciliation：本地 cursor 落后时只补偿
  durable Usage/terminal facts，`usage_recorded` 仍严格 Projection-before-cursor；
- terminal catch-up 到达 status cursor 后，completed 仍明确输出不可恢复，其余终态保持既有 typed
  failure；ephemeral delta、Assistant Message、Summary 和 Provider invocation 均不重建；
- Assistant/Compaction M3/M4 均由 SQLite close/reopen 验证；无 Usage、四类失败终态、wrong
  invocation、cursor 不可达与 digest drift 均失败关闭；
- 专项 **27 tests**、Workspace **164 files / 1155 tests + 3 smoke**、Central online/offline
  **299/0/0/0** 均已通过开发者门禁；
- 公共 Contract、Schema/migration、Kernel、Desktop、Central 生产代码、依赖和 lockfile 未变。
  独立 QA PASS 且用户接受前，不得关闭 repair.2 或恢复 ARH-3.3.2；ARH-3.3.3 继续 `GATED`。

# KN-169：ARH-3.3.2 repair.2 正式关闭并恢复主开发

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **repair.2 PASS/CLOSED；ARH-3.3.2 AUTHORIZED / IN PROGRESS；ARH-3.3.3 GATED** |
| 决策者 | 用户 |
| 依据 | Claude Code 独立 QA `P0～P3=0`；用户正式接受并关闭 `0.0.0-arh.3.3.2-preflight-repair.2`，恢复既有 ARH-3.3.2 主开发授权 |
| 正式文档 | [Repair.2 Plan](../development/arh/ARH-3.3.2-PREFLIGHT-REPAIR.2-DURABLE-USAGE-RECONCILIATION-PLAN.md)、[QA Report](../development/qa/0.0.0-arh.3.3.2-preflight-repair.2-claude-qa.md)、[ARH-3.3.2 Plan](../development/arh/ARH-3.3.2-RECOVERY-USAGE-COMPACTION-MATRIX-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- Assistant 与 Compaction 已能在 Central terminal 已提交、Core cursor 落后的真实顺序下，先补偿
  durable Usage/terminal facts，再保持 ephemeral output 不可恢复的既有失败关闭；
- 独立 QA 已串行通过专项 **27 tests**、Workspace **164 files / 1155 tests** 与 Central
  online/offline **299/0/0/0**，没有新增 P0～P3；
- repair.2 不再阻塞 M1～M8 联合恢复矩阵；本节点不授权 ARH-3.3.3。

# KN-170：ARH-3.3.2 联合恢复矩阵完成开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **ARH-3.3.2 IMPLEMENTED / DEVELOPER PASS / READY_FOR_INDEPENDENT_QA；ARH-3.3.3 GATED** |
| 决策者 | 用户授权；Codex 5.6 实施并完成开发者门禁 |
| 依据 | repair.2 正式关闭后恢复的 ARH-3.3.2 开发授权 |
| 正式文档 | [ARH-3.3.2 Plan](../development/arh/ARH-3.3.2-RECOVERY-USAGE-COMPACTION-MATRIX-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Register AR-063](./UPSTREAM-ADOPTION-REGISTER.md) |

## 已完成事实

- 唯一专项入口实际串行执行 Core **79 tests** 与 Central **27 tests**，安全 Evidence 为 **52/52**，
  命名崩溃窗口 M1～M8 全部覆盖；
- 三类 invocation、五类 cache status、Usage Projection、first/rolling Compaction、fencing、
  PostgreSQL pause/unpause 和 SQLite reopen 均进入同一开发者验收矩阵；
- Workspace **164 files / 1155 tests + 3 smoke**、Central online/offline 各 **299/0/0/0**；资源
  计数和敏感输出扫描均为 0；
- `CTR-P3-001` 没有被重试或修改吸收，专项只选择 M6 所需的稳定方法；公共 Contract、Schema/
  migration、Kernel、Desktop、生产 recovery、依赖和 lockfile 未变；
- 本节点仅提交 ARH-3.3.2 独立 QA，不授权 ARH-3.3.3。

# KN-171：ARH-3.3.2 正式关闭并进入 ARH-3.3.3 方案评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **ARH-3.3.2 PASS/CLOSED；ARH-3.3.3 DOCUMENT REVIEW PENDING / CODING GATED** |
| 决策者 | 用户 |
| 依据 | Claude Code 独立 QA `P0～P3=0`；用户正式接受并关闭 ARH-3.3.2，只授权输出 ARH-3.3.3 详细方案与文档评审 |
| 正式文档 | [ARH-3.3.2 Plan](../development/arh/ARH-3.3.2-RECOVERY-USAGE-COMPACTION-MATRIX-DEVELOPMENT-PLAN.md)、[ARH-3.3.2 QA](../development/qa/0.0.0-arh.3.3.2-claude-qa.md)、[ARH-3.3.3 Plan](../development/arh/ARH-3.3.3-UNIFIED-CLOSURE-EVIDENCE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- ARH-3.3.2 专项 **52/52**、Node **79 tests**、Central **27 tests**、Workspace **164 files /
  1155 tests + 3 smoke**、Central online/offline **299/0/0/0** 已通过独立 QA，用户正式接受关闭；
- ARH-3.3.3 只负责 Actual Result Evidence、三轮 fresh semantic replay、30 分钟且至少 5 个
  lifecycle cycle、四通道敏感扫描、资源归零和 ARH-3 阶段关闭证据；
- 现有矩阵定义 digest 不得冒充实际 durable result digest；详细方案要求二者分离；
- 本节点不授权 ARH-3.3.3 编码，不修改生产代码、测试、公共 Contract、Schema/migration、依赖
  或版本；评审、用户接受和明确授权前继续 `GATED`；
- `CTR-P3-001` 仍是独立维护项，不进入 ARH-3.3.3。

# KN-172：ARH-3.3.3 Revision 1 吸收长稳与真实资源诊断门槛

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **REVISION 1 / CLAUDE CODE DIFFERENCE REVIEW PENDING / CODING GATED** |
| 决策者 | 用户接受 30 分钟/5 lifecycle 新门槛；Codex 5.6 完成方案修订 |
| 依据 | Claude Code 首轮评审 `PASS（P0=0 / P1=0 / P2=2 / P3=2）`；用户同意按建议进入下一步 |
| 正式文档 | [ARH-3.3.3 Plan](../development/arh/ARH-3.3.3-UNIFIED-CLOSURE-EVIDENCE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 修订结论

- 用户明确接受 30 分钟且至少 5 个 lifecycle cycle 的阶段关闭硬门槛；
- 现有 Harness 的硬编码资源 0 不再被视为阶段关闭证据；Revision 1 要求 test-only 真实资源诊断，
  缺失诊断、默认 0、空断言和单纯 sleep 均失败关闭；
- 每个 cycle 必须至少产生 main terminal、initial/rolling Compaction、Central takeover、Core
  reopen 和 status-first reconciliation 六类 durable/recovery 事实；
- 52 场景明确为父计划 36 场景的超集，QA 增至至少 52 项，工期调整为 5～8 个工程工作日；
- 本节点只允许 Claude Code 差异复核，不授权 ARH-3.3.3 编码，不修改代码、测试、Contract、
  Schema/migration、依赖或版本。

# KN-173：ARH-3.3.3 Revision 1 差异复核通过并等待用户授权

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-15 |
| 状态 | **DIFFERENCE REVIEW PASS / USER ACCEPTANCE PENDING / CODING GATED** |
| 决策者 | Claude Code 独立文档复核；等待用户最终接受与编码授权 |
| 依据 | Revision 1 差异复核 `PASS（P0=0 / P1=0 / P2=0 / P3=2）` |
| 正式文档 | [ARH-3.3.3 Plan](../development/arh/ARH-3.3.3-UNIFIED-CLOSURE-EVIDENCE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 复核结论

- 首轮 P2/P3 四项均已关闭：长稳决策、真实资源诊断、逐 cycle 量化与 52→36 场景映射完整；
- Revision 1 QA 1～52 连续，工期 5～8 天、父计划总工期 11～19 天和 KN-172 一致；
- 剩余两项 P3 仅为 §10.3 编号范围和 §7.1 用户接受措辞，现已修正；
- 本节点不构成用户接受或编码授权。用户明确授权前，ARH-3.3.3 coding 继续 `GATED`。

# KN-174：ARH-3.3.3 完成开发者正式门禁并进入独立 QA

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-16 |
| 状态 | **IMPLEMENTED / DEVELOPER GATES PASS / READY_FOR_INDEPENDENT_QA；ARH-3.3/ARH-3 NOT CLOSED** |
| 决策者 | 用户接受计划并授权；Codex 5.6 实施与完成开发者门禁 |
| 依据 | ARH-3.3.3 Revision 1、Claude Code 对原长稳 Harness 偏差的独立复核、正式 30 分钟 Harness 结果 |
| 正式文档 | [ARH-3.3.3 Plan](../development/arh/ARH-3.3.3-UNIFIED-CLOSURE-EVIDENCE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[Upstream Register AR-064](./UPSTREAM-ADOPTION-REGISTER.md) |

## 冻结结论

- 原长稳实现每 cycle 重放完整 Central M1～M8 矩阵，偏离已冻结 §7.1；本批将三轮完整
  semantic replay 与后续轻量 stability cycle 严格分离，不将问题误归类为 `CTR-P3-001`；
- 正式门禁实际完成 3 轮完整重放和 85 个轻量 cycle，总计 88 个 lifecycle cycle，长稳阶段超过
  30 分钟，52/52 场景、semantic/stability digest、敏感扫描和真实资源归零全部通过；
- 三个实施期失败运行均留下安全 `failure.json`，没有被删除或用补跑隐藏；
- 本批只修改 Harness、Fixture、测试和治理记录；公共 Contract、Schema/migration、Kernel、
  Desktop、生产 Runtime 与依赖均未修改；
- Claude Code 必须实际重跑完整 Harness，digest 不得代替执行。独立 QA 与用户接受前，不关闭
  ARH-3.3.3、ARH-3.3 或 ARH-3。

# KN-175：ARH-3.3.3 独立 QA P1 进入确定性握手 repair.1

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-16 |
| 状态 | **ARH-3.3.3 INDEPENDENT QA FAIL ACCEPTED；repair.1 IMPLEMENTED / DEVELOPER GATES PASS / READY_FOR_INDEPENDENT_QA；ARH-3.3/ARH-3 NOT CLOSED** |
| 决策者 | 用户接受独立 QA FAIL 并授权 repair.1；Codex 5.6 实施并完成开发者正式门禁 |
| 依据 | Claude Code 正式长稳在第 26 个轻量 cycle 复现 failpoint wait P1；用户明确禁止延长轮询、自动重试或删除 takeover 场景 |
| 正式文档 | [ARH-3.3.3 Plan](../development/arh/ARH-3.3.3-UNIFIED-CLOSURE-EVIDENCE-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md)、[原独立 QA](../development/qa/0.0.0-arh.3.3.3-claude-qa.md) |

## 冻结结论

- repair.1 将 test-only failpoint 收敛为 exact `sessionId`、单次 latch wait 与精确 release；stale
  或错配 session 失败关闭，不再轮询可变化的全局 blocked 状态；
- takeover、lease/fencing 和 Provider 语义保持不变；未增加轮询时长、未加入自动 retry、未删除
  场景，也未修改生产代码、公共 Contract、Schema/migration、Kernel、Desktop、依赖或 lockfile；
- 四通道泄漏扫描覆盖 process output、child log/trace、test/machine evidence、safe JSON/
  diagnostics，并对五类 marker 的 raw、Base64、URL-encoded 形态失败关闭；
- 开发者正式门禁完成 3 轮完整 replay、52/52 场景和 86 个轻量长稳 cycle，共 89 lifecycle
  cycles；四通道命中与八类资源余量均为 0，Workspace 166 files / 1176 tests + 3 smoke、Central
  online/offline 302/0/0/0 全部通过；
- 本节点只把 repair.1 提交独立 QA。repair.1 独立 QA PASS 且用户接受前，不关闭 repair.1、
  ARH-3.3.3、ARH-3.3 或 ARH-3。

# KN-176：ARH-3.3.3 repair.1 通过并关闭 ARH-3

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-16 |
| 状态 | **repair.1、ARH-3.3.3、ARH-3.3、ARH-3 PASS/CLOSED** |
| 决策者 | Claude Code 独立 QA；用户正式接受并关闭阶段 |
| 依据 | repair.1 正式 Harness、精确 takeover、Workspace 与 Central online/offline 串行复跑全部通过，P0～P3=0 |
| 正式文档 | [ARH-3.3.3 Plan](../development/arh/ARH-3.3.3-UNIFIED-CLOSURE-EVIDENCE-DEVELOPMENT-PLAN.md)、[独立 QA](../development/qa/0.0.0-arh.3.3.3-repair.1-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- 独立 QA 在 Node 24.13.0、Java 21 和 Docker 环境下严格串行从零执行正式 Harness，三轮
  semantic replay、92 个轻量长稳 cycle（36.6 分钟）与精确 takeover 10/10 全部通过；
- Workspace **166 files / 1176 tests + 3 smoke**、Central online/offline **302/0/0/0** 全绿，
  semantic result digest 三轮一致，四通道泄漏命中和八类资源余量均为 0；
- exact-session latch handshake 已关闭上一轮第 26 cycle 的 P1，不通过延长轮询、自动重试或
  删除 takeover 规避问题；
- 用户正式接受后，repair.1、ARH-3.3.3、ARH-3.3 与 ARH-3 依次 `PASS/CLOSED`；
- 后续正式 Harness、Central online 与 Central offline 门禁必须串行执行；digest 只能作为比较
  证据，不能代替实际重跑。

# KN-177：DFI-1B 完成 Workspace Browser 跨进程开发者门禁

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-17 |
| 状态 | **IMPLEMENTED / DEVELOPER GATES PASS / READY_FOR_INDEPENDENT_QA；DFI-2/3/4 GATED** |
| 决策者 | 用户接受 Revision 1 并明确授权；Codex 5.6 实施与完成开发者门禁 |
| 依据 | DFI-1A PASS/CLOSED、DFI-1B Revision 1 差异复核 P0～P3=0、用户明确编码授权 |
| 正式文档 | [DFI-1B Plan](../development/frontend/DFI-1B-DEVELOPMENT-PLAN.md)、[DFI Main Plan](../development/frontend/DESKTOP-P0-INTERFACE-COMPLETION-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- Desktop Local `v1alpha2` 以 additive sidecar 接入 Workspace Browser / Reveal，不修改
  `v1alpha1`；Renderer 只能提交 Task authority、opaque proof 与高层 command；
- Core 使用独立 `wra1` HMAC domain 签发短期 reveal authority，Main 在 OS 打开前再次验证
  exact root identity；路径、HMAC key、私有 token 与 Shell 不进入 Renderer；
- 5 秒 OS deadline 超时收敛为不可自动重试的 uncertain；同 command 幂等、有界 Attempt
  Registry 和 late-settle 资源释放已进入实现与测试；
- 开发者 focused **7 files / 28 tests**、Workspace **186 files / 1238 tests + 3 smoke**、Central
  online/offline **302/0/0/0** 已串行通过；独立 QA 和用户接受前 DFI-1B 不关闭；
- Renderer 页面和 Mock 删除不在本批，DFI-2、DFI-3、DFI-4 继续 `GATED`。

# KN-178：DFI-1B 独立 QA 通过并正式关闭

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-17 |
| 状态 | **DFI-1B PASS/CLOSED；DFI-2/3/4 GATED** |
| 决策者 | Claude Code 独立 QA；用户正式接受并关闭阶段 |
| 依据 | DFI-1B Workspace、Central online/offline 与跨进程安全边界独立复核 P0～P3=0 |
| 正式文档 | [DFI-1B Plan](../development/frontend/DFI-1B-DEVELOPMENT-PLAN.md)、[Independent QA](../development/qa/dfi-1b-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- 独立 QA 实际串行通过 Workspace **186 files / 1238 tests + 3 smoke**、Central online/offline
  **302/0/0/0**；首次 Central online 偶发失败复跑全过，与本批无因果关系，不计为缺陷；
- `wra1` 短期授权、prepare/consume、Core 重启失效、Main root identity 二次校验、5 秒 uncertain、
  Attempt Registry 幂等和路径零泄漏均通过独立核查；
- 用户正式接受后 DFI-1B `PASS/CLOSED`；该关闭不等于 Renderer 已接入，Workspace tree Mock
  仍需前端批次按既有删除门槛处理；
- DFI-2、DFI-3、DFI-4 继续 `GATED`，等待各自方案确认和用户明确授权。

# KN-179：DFI-2A.2 独立 QA 通过并进入 DFI-2A.3 文档评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-18 |
| 状态 | **DFI-2A.2 PASS/CLOSED；DFI-2A.3 REVISION 1 DIFFERENCE REVIEW PENDING / CODING GATED；DFI-2B/3/4 GATED** |
| 决策者 | Claude Code 独立 QA；用户正式接受并关闭 DFI-2A.2；Codex 5.6 起草 DFI-2A.3 详细方案 |
| 依据 | DFI-2A.2 Workspace、Central online/offline、migration 22 与双 Adapter 独立复核 P0～P3=0 |
| 正式文档 | [DFI-2A.2 Plan](../development/frontend/DFI-2A.2-DEVELOPMENT-PLAN.md)、[DFI-2A.2 Independent QA](../development/qa/dfi-2a.2-claude-qa.md)、[DFI-2A.3 Plan](../development/frontend/DFI-2A.3-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- DFI-2A.2 独立 QA 串行通过 Workspace **191 files / 1275 tests + 3 smoke**、Central
  online/offline **302/0/0/0**；migration 22、Port + InMemory/SQLite 双 Adapter、两项 P3、
  deterministic legacy materialization 与三 digest 分离均通过核查；
- 用户正式接受并关闭 DFI-2A.2；该关闭不自动授权生产 SubmitTurnCoordinator、恢复或 readiness
  cutover；
- DFI-2A.3 详细方案冻结双版本 coordination、exact wire digest、authorization-aware Task bundle、
  legacy normalization、版本化 Receipt、startup materialization/readiness 与 A1～A7 Harness；
- DFI-2A.3 首轮评审 P0/P1/P2=0、P3=2；Revision 1 已冻结 legacy normalization 全量身份字段，
  并拆分 normalization I/O 与 persisted plan 纯校验职责；差异复核、用户接受并单独授权前不得编码；
- DFI-2B、DFI-3、DFI-4 继续 `GATED`。

# KN-180：DFI-2A.3 完成 SubmitTurn 授权编排与 Readiness Cutover

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-18 |
| 状态 | **INDEPENDENT QA PASS / USER ACCEPTANCE PENDING；DFI-2B/3/4 GATED** |
| 决策者 | 用户接受 Revision 1 并明确进入下一步；Codex 5.6 实施与完成开发者门禁 |
| 依据 | DFI-2A.1、DFI-2A.2 PASS/CLOSED；DFI-2A.3 Revision 1 差异复核 P0～P3=0 |
| 正式文档 | [DFI-2A.3 Plan](../development/frontend/DFI-2A.3-DEVELOPMENT-PLAN.md)、[DFI-2A Plan](../development/frontend/DFI-2A-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- 新 v1alpha1/v1alpha2 SubmitTurn 均在任何 Message/Task 副作用前持久化 exact Authorization Plan；
  原始 transport request digest 不由 normalized intent 代替；
- Coordinator 生产路径只提交 authorization-aware Task bundle，不保留旧 bundle 双写；历史 recoverable
  v1alpha1 record 只允许通过全身份 CAS normalization 补齐固定 legacy plan；
- v1alpha1 Receipt/Query 形状保持不变，v1alpha2 投影增加 resolved authorization 与 execution digest；
  不同 transport 的 Receipt 不允许互相冒充；
- startup 在 public ready 前完成 legacy authorization materialization，再执行 recovery 和 private server
  启动；materialization 失败时失败关闭；
- 开发者 focused **5 files / 55 tests**、Workspace **191 files / 1286 tests + 3 smoke**、Central
  online/offline **302/0/0/0** 已严格串行通过；
- 独立 QA 已通过；用户接受前 DFI-2A.3 不关闭，DFI-2B、DFI-3、DFI-4 继续 `GATED`。

# KN-181：Model Experience 产品语义冻结，个人模型真实链路保持 GATED

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-19 |
| 状态 | **INITIAL FREEZE / SUPERSEDED IN PART BY KN-182；DFE-5A / PERSONAL MODEL BACKEND / DFI-2B GATED** |
| 决策者 | 用户确认 Model Experience 产品规则并要求完成正式文档；Codex 5.6 文档收敛 |
| 依据 | 用户确认企业/个人模型来源、字段、无测试连接、默认/机器人临时模型、删除、状态和个人 Key 查看口径 |
| 正式文档 | [Model Experience Feature Spec](../product/MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md)、[PRD](../product/PRD-ROBOTHREE-MVP.md)、[Frontend Spec](../product/FRONTEND-EXPERIENCE-SPEC-v1.0.md)、[DFE Plan](../development/frontend/DESKTOP-FRONTEND-DEVELOPMENT-PLAN.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- 企业模型由后台配置、排序和授权；个人模型入口由后台权限控制，配置与 Credential 属于本机；两类模型统一参与新任务选择但凭证域和调用路径保持隔离；
- 初版采用单一模型名称字段，尚未拆分 Provider 技术标识和用户显示名称；Provider 为 DeepSeek/智谱/Kimi/自定义，个人设置不提供测试连接，保存后状态为“未验证”；该字段口径已由 KN-182 修订；
- 用户默认模型与机器人约束产生的当前有效模型分离；无机器人约束的手动选择更新用户默认，机器人临时选择不覆盖默认，任务首次提交后锁定；
- 个人模型仅在存在执行中任务时禁止删除；终态任务保留历史模型摘要；初版删除默认个人模型的直接企业回退规则已由 KN-182 的统一默认选择规则替代；
- 个人 Key 默认掩码，所有者可主动查看；Renderer 只在受控交互期间短暂处理明文。应用不建设系统截图检测，官方测试和证据只使用假 Key；
- ADR-013 当前未冻结已保存 Secret 反向返回 Renderer 的通道，真实查看必须先完成 ADR-013 Addendum 或等价架构决策；本节点不修改既有 ADR；
- 个人模型真实后端建议作为 DFI-4A 或等价独立批次规划；DFE-5A、个人模型后端和 DFI-2B 分别评审、分别授权，本节点不构成任何编码授权。
- 本节点中的单一“模型名称”、网络失败禁用和删除默认个人模型回退规则，已由 KN-182 Revision 1 修订口径替代。

# KN-182：接受 Model Experience Revision 1 产品修订

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-19 |
| 状态 | **REVISION 1 PRODUCT DECISIONS ACCEPTED / DOCUMENT REVIEW PENDING；DFE-5A / PERSONAL MODEL BACKEND / DFI-2B GATED** |
| 决策者 | 用户接受三项产品修订；Codex 5.6 同步正式文档 |
| 依据 | DFE-5.0 复核发现个人模型字段冲突、网络失败恢复死路和企业模型为空规则冲突 |
| 正式文档 | [Model Experience Feature Spec](../product/MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md)、[PRD](../product/PRD-ROBOTHREE-MVP.md)、[MVP Baseline](../product/ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md)、[Frontend Spec](../product/FRONTEND-EXPERIENCE-SPEC-v1.0.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- 个人模型同时保留精确 Provider 模型标识、用户可见显示名称和不可编辑 Personal Model ID，三个事实不得混写；
- 个人模型保存不调用 Provider，保存后为“未验证”；网络失败允许再次选择并通过下一次真实调用恢复；
- 有效用户偏好优先；企业模型为空但存在可用个人模型时要求用户明确选择，企业与个人模型均不可用时才阻止任务；
- 删除默认个人模型和取消机器人后的回退复用同一默认选择规则，不生成假默认模型；
- 本节点只接受产品语义并进入文档复核，不授权 DFE-5A、DFI-2B 或 DFI-4A 编码，也不关闭 DFI-2A.3 或 DFE-4B-repair.1。

# KN-183：DFI-2A.3 独立 QA 通过并关闭 DFI-2A

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-20 |
| 状态 | **DFI-2A.3 PASS/CLOSED；DFI-2A PASS/CLOSED；DFI-2B/3/4 GATED** |
| 决策者 | Claude Code 独立 QA；用户正式接受并关闭阶段 |
| 依据 | DFI-2A.3 SubmitTurn 编排、恢复、readiness cutover 与 A1～A7 恢复矩阵独立 QA P0～P3=0 |
| 正式文档 | [DFI-2A.3 Plan](../development/frontend/DFI-2A.3-DEVELOPMENT-PLAN.md)、[DFI-2A Plan](../development/frontend/DFI-2A-DEVELOPMENT-PLAN.md)、[Independent QA](../development/qa/dfi-2a.3-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- 独立 QA 实际串行通过 Workspace **191 files / 1286 tests + 3 smoke**、Central online/offline
  **302/0/0/0**；本批 P0～P3=0；
- v1alpha1/v1alpha2 SubmitTurn、exact wire digest、Authorization Plan 副作用前锁定、authorization-aware
  Task bundle 原子提交、legacy CAS normalization、版本化 Receipt/Query、startup materialization 与
  A1～A7 SQLite close/reopen 恢复均通过核查；
- 用户正式接受后，DFI-2A.3 与 DFI-2A 整体 `PASS/CLOSED`；
- 本节点不授权 DFI-2B、DFI-3 或 DFI-4，后续阶段继续等待详细方案评审和用户明确授权。

# KN-184：DFE-5B.1 正式关闭并进入 DFI-4A 个人模型方案评审

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-20 |
| 状态 | **DFE-5B.1 PASS/CLOSED；DFI-4A DOCUMENT REVIEW / CODING GATED；DFE-5B.2 PLAN PREPARATION ONLY；DFE-6/DFI-2B/DFI-3 GATED** |
| 决策者 | Claude Code 独立 QA；用户正式接受 DFE-5B.1 并指定下一阶段优先级；Codex 5.6 起草 DFI-4A 计划 |
| 依据 | DFE-5B.1 独立 QA P0～P3=0；Model Experience Revision 1 与 ADR-013 Personal Credential Store 边界 |
| 正式文档 | [DFI-4A Plan](../development/frontend/DFI-4A-PERSONAL-MODEL-CREDENTIAL-DEVELOPMENT-PLAN.md)、[DFE Plan](../development/frontend/DESKTOP-FRONTEND-DEVELOPMENT-PLAN.md)、[Independent QA](../development/qa/dfe-5b.1-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- DFE-5B.1 已通过 focused、build、lint、audit 和完整 Workspace 独立门禁，用户接受后正式
  `PASS/CLOSED`；真实 Knowledge Provider 仍未解锁；
- DFI-4A 计划把真实个人模型拆分为架构/Keychain preflight、Domain/Persistence、Credential
  Broker/CRUD、Provider Runtime/Usage/Task lock、Desktop Safe Interface/E2E 五批；
- 所有者查看已保存 Key 必须先接受 ADR-013 Addendum；Secret 不得进入普通 HTTP、公共 Contract、
  URL、argv、env、SQLite、日志、Trace、Fixture 或 Evidence；
- migration 23/24、macOS Keychain、private child IPC、local_personal authority、Endpoint SSRF/
  DNS rebinding 防护和跨 SQLite/Keychain operation journal 进入文档评审；
- DFI-4A.0～4A.4 当前全部 `GATED`。DFE-5B.2 只允许准备方案，DFE-6、DFI-2B、DFI-3 不自动启动。

# KN-185：DFI-4A.0 正式关闭并进入 DFI-4A.1 Revision 1 文档复核

| 属性 | 内容 |
| --- | --- |
| 日期 | 2026-08-21 |
| 状态 | **DFI-4A.0-repair.1 PASS/CLOSED；DFI-4A.0 PASS/CLOSED；DFI-4A.1 REVISION 1 DOCUMENT REVIEW PENDING / CODING GATED** |
| 决策者 | Claude Code 独立 QA；用户正式接受并关闭 DFI-4A.0；Codex 5.6 重写 DFI-4A.1 Revision 1 |
| 依据 | DFI-4A.0-repair.1 独立 QA P0～P3=0；用户要求基于四项结构问题重写 DFI-4A.1 并只进入文档复核 |
| 正式文档 | [DFI-4A.1 Revision 1 Plan](../development/frontend/DFI-4A.1-DOMAIN-CONTRACT-PERSISTENCE-DEVELOPMENT-PLAN.md)、[DFI-4A Main Plan](../development/frontend/DFI-4A-PERSONAL-MODEL-CREDENTIAL-DEVELOPMENT-PLAN.md)、[Independent QA](../development/qa/dfi-4a.0-repair.1-claude-qa.md)、[Development Log](../development/DEVELOPMENT-LOG.md) |

## 冻结结论

- DFI-4A.0-repair.1 已实际通过 Preflight、lint/architecture boundary、Workspace
  **201 files / 1318 tests + 3 smoke**、Central online/offline **302/0/0/0**；独立 QA
  P0～P3=0，用户接受后 repair.1 与 DFI-4A.0 正式 `PASS/CLOSED`；
- 并发窗口产生的旧 DFI-4A.1 草案已隔离，不构成正式计划或编码授权；
- DFI-4A.1 Revision 1 分离 `configurationRevision`、`executionDefinitionDigest`、
  `statusRevision` 与 `recordDigest`，状态变化不污染执行身份；
- immutable definition history + current head 支撑旧 Task exact revision 恢复；Core 私有 SQLite
  保存不含 Secret 的 opaque `credentialRef` 与完整 canonical Endpoint，普通 Projection 只返回安全摘要；
- Operation Journal 与 durable Command Receipt 是两类独立事实，migration 23 六表结构、52 项 QA
  与 7～11 个集中工程工作日进入文档复核；
- 本节点仅修改正式计划和治理文档，不修改 Contract、Core、migration、Main、Preload、Renderer、
  Central、依赖、版本或 lockfile；
- DFI-4A.1 在文档复核通过且用户明确编码授权前继续 `CODING GATED`；DFI-4A.2～4A.4、DFI-2B、
  DFI-3、DFE-6、TGM-1+ 继续 `GATED`。
