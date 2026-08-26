# RoboThree 产品与架构基线 v1.0

> 文档状态：基线（v1.0）
> 适用范围：RoboThree_workspace 全部产品、架构、协议和实现工作
> 与 KN-001 的关系：在已确认的能力平台化方向之上，正式发布的产品与架构基线；后续具体技术选择按需建立 ADR

本文件统一 RoboThree 的产品定位、核心概念、MVP 范围、场景边界与关键技术约束，作为编写详细功能点和开始编码之前的对齐基线。文档与 [RoboThree 关键节点记录 KEY-NODES](../architecture/KEY-NODES.md) 中 KN-001 共同构成阶段共识；细节、长期不可回退的技术选择仍需通过 ADR 固化。

---

## 1. 产品定位

### 1.1 一句话定义

RoboThree 是面向企业员工的桌面优先 AI 工作台。

它以通用 Agent 执行能力为核心，在企业统一身份、模型、权限和审计约束下，连接本地文件、企业知识库、Tool、MCP 和企业系统，帮助员工通过自然语言完成真实工作，并将可复用的方法沉淀为 Skill 和 Agent Role。

### 1.2 定位边界

RoboThree 不是：

- 面向大众市场的个人聊天助手；
- 单纯的大模型聊天客户端；
- 只供研发人员使用的 Agent SDK；
- 通用爬虫平台；
- 完整的低代码 BPM 或 Workflow Builder；
- 云端代码托管和 DevOps 平台。

RoboThree 的核心价值是：

```text
企业任务执行
+ 本地工作区协同
+ 企业能力接入
+ 能力沉淀
+ 权限与审计治理
```

### 1.3 “本地”应如何理解

“本地 AI 工作台”不等于所有服务和模型都必须部署在员工电脑上。

RoboThree 的目标形态是：

```text
Windows 桌面客户端
+ 本地工作区与 Local Worker
+ 企业统一管理服务
+ 企业 MaaS / 私有模型 / 经批准的商业模型
```

其中：

- 本地端负责用户交互、本地文件、工程目录和本机执行；
- 企业服务负责身份、配置、注册中心、策略、审计和共享能力；
- 模型可以位于企业 MaaS、私有环境或经管理员批准的外部服务。

因此正式表述使用：

> 桌面优先、企业集中治理、本地执行增强的 AI 工作台。

---

## 2. 目标用户与落地路径

### 2.1 第一阶段用户

- 销售与商务；
- 人力资源；
- 运营与行政；
- 管理人员；
- 后续扩展至研发和其他专业岗位。

这些用户不需要理解模型、MCP、Prompt 或 Agent 调用链，只需要描述工作目标并审核结果。

### 2.2 落地路径

```text
内部团队使用
→ 验证真实工作闭环
→ 小范围企业试点
→ 沉淀标准 Tool / Skill / Role
→ 扩大部门与场景覆盖
```

第一阶段不以“功能数量最多”为目标，而以跑通可信、可控、可扩展的企业工作闭环为目标。

---

## 3. 核心业务价值

### 3.1 统一工作入口

员工通过一个工作台完成：

- 自然语言交互；
- 任务执行与进度查看；
- 本地文件和项目工作区操作；
- 企业 Skill 使用；
- 企业知识查询；
- 成果文件查看和审核。

### 3.2 连接企业能力

RoboThree 通过受治理的 Tool 接入：

- 企业知识库；
- MCP Server；
- OA、CRM、ERP、MES、HR 等系统 API；
- 企业文件系统；
- 企业 MaaS；
- 经批准的外部数据和服务。

MVP 不要求一次接入所有系统，只需建立统一 Tool Contract，并跑通少量真实接入。

### 3.3 沉淀企业工作方法

```text
一次任务
→ 可重复做法
→ Skill 草稿
→ 测试与审核
→ 部门或企业 Skill
→ 被 Role 和员工复用
```

RoboThree 不只生成结果，也逐步沉淀企业的标准工作方法。

### 3.4 企业级治理

平台应能够回答：

- 谁发起了任务；
- 使用了哪个模型；
- 调用了哪些 Tool；
- 读取或修改了哪些文件；
- 使用了哪些知识来源；
- 是否发生外部数据发送；
- 哪些敏感操作经过了确认或审批；
- 最终生成了哪些成果。

---

## 4. 核心能力模型：Tool、Skill、Role

### 4.1 Tool

Tool 是 Agent 可调用的最小原子能力。

Tool 的实现方式可以是：

- MCP Tool；
- API Tool；
- Local Tool；
- Built-in Tool。

示例：

- 读取 PDF；
- 执行 OCR；
- 查询企业知识库；
- 查询 CRM 客户；
- 生成 Excel；
- 生成 PPT；
- 修改本地文件；
- 启动本机 HTML 预览。

Tool 至少包含：

```text
Tool ID
名称与说明
输入 Schema
输出 Schema
实现类型
权限要求
风险等级
超时与重试策略
版本与状态
调用审计
```

工具箱只管理 Tool。

MCP、API、本地程序和内置能力是 Tool 的实现来源，不是 Agent 面前的另一套调用模型。

### 4.2 Skill

Skill 是针对一类任务的可复用能力包。

Skill 可以由以下内容组成：

```text
Prompt / Instructions
Tool 引用
知识库引用
输入 Schema
输出 Schema
规则
模板
Hook
受限脚本
测试用例
风险与权限声明
版本信息
```

MVP 中应限制 Skill 的可执行范围：

- 允许 Prompt、Schema、Tool、知识库、规则和模板；
- 平台 Hook 可以使用；
- 普通用户不能通过 Skill 生成任意系统脚本；
- 带外部副作用的动作必须经 Tool Runtime 调用，不能由脚本绕过。

### 4.3 Agent Role

Agent Role 定义 Agent 的身份、职责、能力边界和默认策略。

Role 可以引用：

- Skill；
- Tool；
- 知识范围；
- 模型策略；
- 行为规则；
- 权限边界；
- 记忆策略；
- 输出规范；
- 人工确认规则。

示例：

```text
投标分析顾问
网页设计助手
候选人总结助手
```

### 4.4 术语冲突处理

系统中存在两类“角色”，必须分开命名：

- `Access Role`：RBAC 权限角色，例如 System Admin、Employee；
- `Agent Role`：Agent 的身份与能力配置，例如投标分析顾问。

产品和代码中不得只使用含糊的 `Role` 表示二者。

### 4.5 运行关系

```text
用户任务
→ 选择或匹配 Agent Role
→ Agent Role 使用 Skill
→ Skill 调用 Tool
→ Runtime 执行并返回结果
```

Role 也可以直接使用经过授权的通用 Tool。

---

## 5. 产品形态

### 5.1 Employee Workspace

员工工作台面向普通员工，目标架构包含：

```text
Chat
Tasks
Skills
Knowledge
Artifacts
Scheduled Tasks（P1）
```

MVP 优先实现：

- Chat；
- Tasks；
- Skills 使用入口；
- 本地 Workspace；
- Artifact 查看；
- 基础知识检索。

### 5.2 Admin Console

管理员控制台面向平台管理员和业务管理员，负责：

- 组织、用户和部门；
- Access Role 与权限；
- Model Registry；
- Tool Registry；
- MCP 接入管理；
- Skill Governance；
- Agent Role Management；
- Knowledge Management；
- Audit；
- Cost and Usage。

Admin Console 是管理入口，不是 Worker 或执行基础设施。

---

## 6. 目标逻辑架构

```text
RoboThree
├── Experience Plane
│   ├── Employee Workspace
│   └── Admin Console
│
├── Control Plane
│   └── RoboThree Core
│       ├── Agent Runtime
│       ├── Task Runtime
│       ├── Skill Runtime
│       ├── Tool Runtime
│       ├── Agent Role Runtime
│       ├── Knowledge Runtime
│       ├── Model Gateway
│       ├── Permission Engine
│       ├── Policy Engine
│       ├── Artifact Runtime
│       ├── Context and Memory
│       └── Execution Router
│
├── Integration Plane
│   ├── MCP Integration
│   ├── Enterprise API Integration
│   ├── File / Knowledge Integration
│   ├── Notification Integration
│   └── MaaS Integration
│
├── Execution Plane
│   ├── Local Worker
│   ├── Sandbox Worker（P1/P2）
│   ├── Remote Worker（P1/P2）
│   └── Browser Worker（P2）
│
└── Governance Plane
    ├── Identity and Access
    ├── Tool / Skill / Agent Role Governance
    ├── Data Security and Privacy
    ├── Network and External Access Policy
    ├── Audit and Compliance
    ├── Quality and Evaluation
    ├── Observability
    └── Cost, Quota and Usage
```

### 6.1 架构视角说明

- Experience Plane：面向人的产品入口；
- Control Plane：理解、规划、状态和策略控制；
- Integration Plane：连接企业已有系统和数据；
- Execution Plane：真正操作文件、代码和环境；
- Governance Plane：贯穿所有层的治理能力。

模块级边界、Contract、Registry、ExecutionPlan 与一致性模型以 [KEY-NODES KN-001](../architecture/KEY-NODES.md#kn-001robothree-mvp-产品方向与架构原则收敛) 为准；本基线不重复展开 Control Plane 内部细节。

---

## 7. 部署边界

### 7.1 本地端

```text
RoboThree Desktop
├── UI
├── Local Agent Host
├── Local Worker
├── Local Workspace Manager
├── Local Preview Service
├── Local State Cache
└── Secure Credential Adapter
```

本地端负责：

- 用户交互；
- 本地文件和工程目录操作；
- 本机 HTML 预览；
- 需要靠近用户电脑执行的任务；
- 离线或弱网下的部分状态保存。

### 7.2 企业服务端

```text
RoboThree Enterprise Service
├── Identity / SSO
├── Organization and RBAC
├── Model Registry / Gateway
├── Tool Registry
├── Skill Registry
├── Agent Role Registry
├── Policy Service
├── Audit Service
├── Knowledge Gateway
└── Admin API
```

企业多用户试点必须有最小管理服务，否则无法真正实现统一权限、模型治理和集中审计。

### 7.3 开发模式与企业模式

开发阶段可以支持：

```text
All-in-One Local Dev Mode
```

企业试点应支持：

```text
Desktop Client
+ Local Worker
+ Central Enterprise Service
```

两种模式应复用相同接口，避免开发模式与企业部署形成两套架构。

---

## 8. MVP 共同基础设施

### 8.1 核心领域对象

```text
User
Department
AccessRole
AgentRoleDefinition
ModelDefinition
ToolDefinition
ToolVersion
SkillDefinition
SkillVersion
KnowledgeBase
Workspace
Task
TaskRun
TaskStep
Artifact
SourceReference
ReviewRequest
ApprovalRequest
AuditEvent
LocalWorker
```

### 8.2 Task 模型

MVP 不必立即实现任意复杂 DAG。

第一版建议使用可持久化的步骤模型：

```text
Task
└── TaskRun
    ├── TaskStep 1
    ├── TaskStep 2
    └── TaskStep N
```

支持：

- 步骤依赖；
- 每步输入和输出；
- 状态持久化；
- 失败节点重试；
- 从已完成步骤继续；
- 等待用户输入；
- 等待审核。

后续再扩展为完整 DAG 和自动影响分析。Plan Revision 与 ExecutionPlan 不可变修订规则按 [KEY-NODES §4.3](../architecture/KEY-NODES.md#43-executionplan-与-plan-revision) 执行。

### 8.3 统一状态

```text
Created
Pending
Running
WaitingForInput
WaitingForApproval
Retrying
Succeeded
Failed
Cancelled
```

“部分完成”建议作为运行结果属性，而不是核心状态：

```text
outcome = partial
completed_steps = [...]
failed_steps = [...]
```

### 8.4 Artifact 与 Workspace File 的区别

- `Workspace File`：任务执行过程中可持续修改的工作文件；
- `Artifact`：任务对用户交付、可查看、可追溯版本的成果。

例如：

- HTML 工程中的 `styles.css` 是 Workspace File；
- 一次审核节点保存的网页快照可以成为 Artifact；
- Excel、PPT 和分析报告属于 Artifact；
- localhost 预览地址属于 Preview Session，不属于 Artifact。

### 8.5 来源追溯

所有关键业务结论应能够关联：

```text
来源文件
页码 / Sheet / 单元格 / 段落
知识库文档
Tool 调用记录
提取方式
可信状态
人工确认状态
```

---

## 9. 场景一：招投标材料分析与投标机会辅助

### 9.1 场景目标

销售人员手动选择已合法获取的招标公告、招标文件和附件。RoboThree 解析材料、提取关键字段、执行企业规则、查询企业知识库，并生成投标机会分析、Excel 和 PPT，最终交由销售人员审核。

MVP 不访问、监控或采集第三方招标网站。

### 9.2 核心流程

```text
选择本地材料
→ 创建或绑定项目 Workspace
→ 文件分类与解析
→ 提取并标准化招标字段
→ 检测来源冲突和未知项
→ 执行固定企业规则
→ 查询产品、资质和案例知识
→ 形成满足项、缺口和风险
→ 生成分析结果、Excel、PPT
→ 执行一致性检查
→ 用户审核、补充或退回
→ 保存结果和审计
```

### 9.3 MVP 输入

优先支持：

- 原生文本 PDF；
- DOCX；
- XLSX；
- Markdown / TXT。

扫描版 PDF 和图片：

- MVP 必须能够检测“无法可靠原生解析”；
- 如暂未接入 OCR，应提示用户提供可搜索版本；
- OCR Tool 可作为 P1 或企业已有能力接入。

ZIP、复杂跨页表格和低清晰度扫描件不作为首个版本硬性要求。

### 9.4 MVP 输出

- 页面内结构化项目分析；
- 风险与待确认清单；
- 来源索引；
- 投标机会汇总 Excel；
- 销售汇报 PPT；
- 质量检查结果；
- 用户审核记录。

不强制同时生成 Word。

### 9.5 决策状态

```text
Recommended
NotRecommended
NeedsReview
```

每个结论必须包含原因与来源。证据不足时只能输出 `NeedsReview`，不得推断企业具备不存在的产品、资质或案例。

### 9.6 MVP 边界

实现：

- 本地文件选择与解析；
- 关键字段提取和来源追溯；
- 固定投标规则；
- 一个企业知识库；
- Excel / PPT 生成；
- 人工审核；
- 基础步骤恢复和审计。

不实现：

- 网站访问和自动采集；
- 定时抓取；
- 第三方登录和验证码；
- 完整正式标书自动生成；
- 自动对外发送和提交；
- 通用外部招标数据接口。

未来外部数据统一通过 Tool 接入，并转换为同一 `TenderRecord`。

### 9.7 验收重点

- 多文件可被识别和解析；
- 关键字段可追溯来源；
- 冲突不会被静默覆盖；
- 未知信息不会被写成事实；
- 企业知识无匹配时不伪造；
- Excel、PPT 与结构化数据保持一致；
- 用户可以补充材料并重跑受影响步骤；
- 全程不访问第三方招标网站。

---

## 10. 场景二：根据业务需求生成企业 Skill

### 10.1 场景目标

业务人员通过自然语言描述工作流程，RoboThree 生成结构化 Skill 草稿，识别 Tool、知识、权限和风险依赖，经过测试与审核后供指定范围员工使用。

### 10.2 核心流程

```text
业务人员描述需求
→ 系统结构化澄清
→ 生成 Skill Specification
→ 生成 Prompt、Schema、Tool 和知识绑定
→ 检查依赖、权限和风险
→ 使用测试数据试运行
→ 生成测试与审核报告
→ 业务审核
→ 管理员审核
→ 发布至指定范围
→ 记录运行结果与版本
```

### 10.3 Skill 组成

MVP Skill 包含：

- 名称、说明和适用场景；
- Prompt / Instructions；
- 输入、输出 Schema；
- Tool 引用；
- Knowledge Base 引用；
- 规则和模板；
- 所需权限；
- 风险等级；
- 测试用例；
- 版本与发布范围。

MVP 不支持普通用户生成任意可执行脚本。Skill 中不直接声明“MCP 依赖”，而是依赖 Tool；该 Tool 可以由 MCP 实现。

### 10.4 生命周期与可见范围

生命周期：

```text
Draft
→ Reviewing
→ Published
→ Disabled
```

补充状态：

```text
Rejected
```

可见范围单独建模：

```text
OwnerOnly
Department
Enterprise
```

草稿可以由创建者在测试模式中运行，但不能绕过审核直接对其他员工发布。

### 10.5 MVP 边界

实现：

- 自然语言生成 Skill 草稿；
- 结构化编辑；
- Tool 和知识绑定；
- Schema 校验；
- 依赖和权限检查；
- 测试运行；
- 人工审核；
- 发布、停用和基础版本记录。

不实现：

- 任意脚本执行；
- 自动无审批发布；
- 灰度发布；
- 复杂可视化流程编排；
- 完整 Workflow Builder；
- 自动修改已发布版本。

### 10.6 验收重点

- 可从自然语言形成结构化 Skill；
- 缺少 Tool 或权限时不能发布；
- 权限申请可审查；
- 测试失败可返回具体原因；
- 未发布 Skill 不可被非授权人员使用；
- 已发布版本可追溯和停用。

---

## 11. 场景三：自然语言生成 HTML 并在本机预览

### 11.1 场景目标

用户选择或创建本地工程目录，通过自然语言生成和修改 HTML、CSS、JavaScript，并在本机启动 localhost 预览。文件始终保存在本地工程区，不需要额外下载。

### 11.2 核心流程

```text
打开本地 Workspace
→ 描述网页需求
→ 检查现有工程
→ 规划文件变更
→ 生成或增量修改 HTML / CSS / JavaScript
→ 保存本地文件
→ 基础静态检查
→ 启动 localhost 预览
→ 用户查看并继续反馈
→ 增量修改
→ 刷新预览
→ 停止预览
```

### 11.3 MVP 技术范围

支持：

- HTML；
- CSS；
- 原生 JavaScript；
- 本地图片、字体和静态资源；
- 默认多文件工程结构；
- localhost 静态服务；
- 系统浏览器或客户端 WebView 预览；
- 文件修改后刷新；
- 简单撤销或修改前备份。

不支持：

- React、Vue、Angular；
- npm 与第三方依赖安装；
- 后端与数据库；
- 云端托管；
- 测试环境和公网发布；
- CI/CD；
- Browser Worker 自动操作；
- 多人协作和复杂版本控制。

### 11.4 安全边界

- 仅操作用户明确选择的 Workspace；
- 默认不得访问 Workspace 之外的文件；
- 不执行网页生成的任意系统命令；
- 不自动安装依赖；
- 不向公网暴露预览服务；
- 预览仅监听 `127.0.0.1`；
- 删除、大范围覆盖和目录移动需要确认；
- RoboThree 退出后应停止预览服务。

### 11.5 验收重点

- 能在选定目录生成和修改网页文件；
- 已有文件默认增量修改，不直接覆盖；
- 本机预览服务可启动和停止；
- 页面可通过 localhost 打开；
- CSS、JavaScript 和本地资源引用正确；
- 用户可以继续自然语言修改；
- 所有代码始终保存在本地 Workspace；
- 无 Browser Worker 也能完成整个闭环。

---

## 12. 三个场景的能力覆盖

| 能力                   | 场景一 | 场景二 | 场景三  |
| -------------------- | --- | --- | ---- |
| Agent Loop           | 必需  | 必需  | 必需   |
| Task / Run / Step    | 必需  | 必需  | 必需   |
| Local Workspace      | 必需  | 可选  | 必需   |
| Local Worker         | 必需  | 部分  | 必需   |
| Tool Runtime         | 必需  | 必需  | 必需   |
| Skill Runtime        | 使用  | 核心  | 可选   |
| Agent Role           | 可绑定 | 可绑定 | 可绑定  |
| 企业知识库                | 必需  | 可绑定 | 可选   |
| PDF / DOCX / XLSX 解析 | 必需  | 可选  | 否    |
| OCR                  | 可后置 | 否   | 否    |
| Excel / PPT          | 必需  | 否   | 否    |
| HTML 本机预览            | 否   | 否   | 必需   |
| Browser Worker       | 否   | 否   | 否    |
| Sandbox Worker       | 否   | 否   | 否    |
| Scheduled Task       | 否   | 否   | 否    |
| 人工审核                 | 必需  | 必需  | 用户确认 |
| 基础恢复                 | 必需  | 必需  | 必需   |
| 审计                   | 必需  | 必需  | 必需   |

三个场景是代表性验证场景，但不应理解为第一个版本必须同时达到完全生产可用。

---

## 13. MVP 范围

### 13.1 P0 必须有

桌面端

- Windows Electron + Vue 客户端（当前技术假设，建议通过 ADR 固化）；
- Chat；
- Task 列表与任务详情；
- 本地 Workspace 选择与授权；
- Artifact 展示；
- 本机 HTML 预览；
- 基础用户确认组件。

Core

- Session；
- Agent Loop；
- Task / TaskRun / TaskStep；
- Context Assembly；
- Model Gateway；
- Tool Runtime；
- Skill Runtime；
- Agent Role 基础加载；
- 基础 Permission / Policy；
- Artifact Runtime；
- 基础持久化和步骤恢复。

企业管理

- 用户与部门；
- Access Role 与基础授权；
- Model Registry；
- Tool Registry；
- Skill Registry 与审核；
- Agent Role 基础管理；
- 一个企业知识库接入；
- 审计日志。

Tool

至少跑通：

- 本地文件读取与写入；
- PDF / DOCX / XLSX 原生解析；
- 企业知识检索；
- Excel 生成；
- PPT 生成；
- 本机预览服务。

### 13.2 P0 可简化

- SSO：企业试点接入真实 SSO；本地开发使用 Mock Identity；
- Checkpoint：先做步骤输出持久化和失败步骤恢复；
- Quality：先做场景级确定性检查，不做通用质量平台；
- Skill 测试：只允许声明式 Skill 和受控 Tool；
- Agent Role：先支持管理员配置和系统内置，不做复杂可视化拼装；
- 数据分级：先由管理员给模型和资源打标签；
- 成本：先记录 Token 和 Tool 调用量。

### 13.3 P1 / P2 后置

- Scheduled Tasks；
- Browser Worker；
- Sandbox Worker；
- Remote Worker；
- OCR 高精度处理；
- Subagent / Multi-Agent；
- 完整 DAG；
- Workflow Builder；
- Skill 脚本与复杂 Hook；
- 移动端；
- 多租户 SaaS；
- 外部网站自动访问；
- 公网部署和 DevOps；
- 用户自定义外部模型 API Key。

---

## 14. 模型、权限和数据策略

### 14.1 Model Registry

至少管理：

```text
Provider
Model
Endpoint
Credential Reference
Capability
Allowed Users / Departments
Allowed Data Classification
Default / Fallback
Cost Policy
Status
```

员工不能直接绕过 Model Registry 调用未批准模型。

### 14.2 Permission 与 Policy

```text
Permission：
当前用户是否有资格访问这个模型、Tool、Skill、知识或 Workspace？

Policy：
即使有资格，在当前数据、场景和风险条件下是否允许执行？
```

### 14.3 数据分级

建议保留：

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
```

MVP 使用管理员显式标签，不要求自动数据分类。

模型调用前的基本链路：

```text
Context Assembly
→ Data Classification Check
→ Model Policy Check
→ 必要时脱敏、确认或阻止
→ Model Call
```

---

## 15. 推荐实现顺序

### Phase 0：冻结基础 Contract

先确定：

- Tool Contract；
- Skill Manifest；
- Agent Role Definition；
- Task / Run / Step；
- Workspace / Artifact；
- Model Registry；
- Permission / Policy；
- Audit Event。

### Phase 1：最小技术闭环——HTML 本机预览

```text
Chat
→ Agent Loop
→ Local File Tool
→ 生成 HTML
→ Local Preview
→ 用户反馈
→ 增量修改
```

它能最快验证客户端、本地 Worker、Tool Runtime、任务状态和工作区。

### Phase 2：企业价值闭环——招投标材料分析

增加：

- 文档解析；
- 企业知识；
- 来源追溯；
- 规则判断；
- Excel / PPT；
- 人工审核；
- 基础恢复。

### Phase 3：平台能力生产——Skill 生成与治理

增加：

- Skill Specification；
- Skill 编辑；
- 测试；
- 权限分析；
- 审核、发布和版本。

这种顺序比一开始同时实现三个完整场景更容易控制风险。

---

## 16. 开始编码前必须冻结的事项

完成详细功能点后，可以进入编码，但建议先冻结以下最小决策：

1. 本地与服务端边界  
   哪些数据只在本地，哪些进入企业服务端。
2. Workspace 授权模型  
   用户选择目录后，RoboThree 可以执行哪些文件操作。
3. Tool Contract  
   输入输出、权限、风险、确认、超时、重试和审计格式。
4. Skill Manifest  
   Prompt、Schema、Tool、Knowledge、版本和权限如何声明。
5. Agent Role Definition  
   身份、Skill、Tool、知识、模型和策略如何绑定。
6. Task 状态模型  
   Task、Run、Step、等待输入、等待审核和失败恢复。
7. Artifact 模型  
   工作文件与交付成果的边界、版本和来源关系。
8. 身份与权限术语  
   Access Role 与 Agent Role 严格分离。
9. 模型与凭证管理  
   API Key 不进入普通配置和日志，统一使用 Credential Reference。
10. 审计事件规范  
    模型调用、Tool 调用、文件修改、知识访问和人工确认如何记录。

这些 Contract 冻结后，就可以开始以垂直切片方式编码，不需要等所有功能点都设计到极致。

---

## 17. 最新产品定义

> RoboThree 是一个桌面优先、企业集中治理、本地执行增强的 AI 工作台。它通过管理员统一配置的企业 MaaS、私有模型和经批准的商业模型，连接本地工作区、企业知识库、Tool、MCP 和内部系统，让员工通过自然语言创建、执行和沉淀真实工作任务。RoboThree 以 Tool、Skill 和 Agent Role 为能力模型，支持任务状态、办公成果生成、权限策略、人工审核和全过程审计，在保护企业数据的前提下提供通用 Agent 执行能力。

---

## 18. MVP 成功判定

MVP 成功不以模块数量判断，而以以下闭环是否成立判断：

```text
员工登录
→ 打开本地 Workspace 或提交企业任务
→ 使用管理员批准的模型
→ 调用经过授权的 Tool
→ 读取有权访问的企业知识
→ 在必要节点请求确认或审核
→ 生成并保存 Artifact
→ 任务可以查看状态和恢复
→ 所有关键动作可审计
```

第一版只要能够稳定跑通这一闭环，并通过场景三和场景一验证，就已经具备继续扩展 Skill 治理和更多企业集成的基础。

---

## 附录 A：与其他文档的关系

- 与 [KEY-NODES KN-001](../architecture/KEY-NODES.md#kn-001robothree-mvp-产品方向与架构原则收敛) 共同构成阶段共识：本文档以产品视角描述定位、范围、场景与验收，KEY-NODES 以架构视角描述 Contract、Registry、ExecutionPlan 与一致性模型。
- 与 [CHANGELOG](../../CHANGELOG.md) 联动：本文档落地的版本变更、范围调整或边界修订必须在 `Unreleased` 中登记。
- 与 ADR 的关系：本基线不替代 ADR；进入具体、长期且难以回退的技术选择时另起 ADR。