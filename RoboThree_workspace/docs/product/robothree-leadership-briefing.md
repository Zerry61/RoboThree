# RoboThree 项目汇报

> 内部汇报 · 2026年7月 · 开发版本 0.0.0-kaf.2.3

---

## 一、项目背景：为什么做 RoboThree

企业在引入 AI 时面临四个核心矛盾：

1. **员工自发使用，企业无治理**：员工各自使用公开 AI 工具处理工作，企业无法管控数据流向、模型选择和操作权限，安全风险不可见。
2. **能力碎片化，无法沉淀复用**：每次任务从零开始。好的工作方法无法在企业内标准化、审核和共享，个人经验难以转化为组织能力。
3. **企业系统孤立，AI 无法连接**：CRM、ERP、OA、知识库各自独立，AI 缺乏安全、可控的通道去读取企业数据、调用业务接口。
4. **结果可生成，过程不可审计**：谁、什么时候、用什么模型、调了哪些系统、读了哪些文件——这些关键动作缺乏统一、不可篡改的审计记录。

---

## 二、产品定位：RoboThree 是什么

> **桌面优先、企业集中治理、本地执行增强的 AI 工作台。**

以通用 Agent 执行能力为核心，在企业统一身份、模型、权限和审计约束下，连接本地文件、企业知识库、Tool、MCP 和企业系统，帮助员工通过自然语言完成真实工作，并将可复用的方法沉淀为 Skill 和 Agent Role。

**RoboThree 不是**：聊天客户端 / Agent SDK / 低代码 BPM / 通用爬虫平台。

**三大产品入口**：

| 入口 | 面向用户 | 核心功能 |
|------|---------|---------|
| Employee Workspace | 普通员工 | Chat、Tasks、Skills、Knowledge、Artifacts |
| Admin Console | 管理员 | 用户、权限、模型、Tool、Skill 治理、审计 |
| Agent Runtime Core | 平台 | Task、Tool、Skill、Policy、Artifact 通用执行内核 |

---

## 三、核心能力模型：Tool · Skill · Agent Role

三层能力模型，从原子操作到企业工作方法逐级沉淀：

| 层级 | 定义 | 组成 | 示例 |
|------|------|------|------|
| **Tool** 原子能力 | Agent 可调用的最小单元 | 输入/输出 Schema、权限、风险等级、超时重试 | 读取 PDF、查询 CRM、生成 Excel |
| **Skill** 能力包 | 针对一类任务的可复用方法 | Prompt + Tool + 知识库 + Schema + 规则 + 测试用例 | 投标分析、候选人总结 |
| **Agent Role** 角色 | 身份与能力边界定义 | Skill + Tool + 知识范围 + 权限 + 模型策略 | 投标分析顾问、网页设计助手 |

执行链路：**用户任务 → Agent Role → Skill → Tool → Runtime 执行并返回结果**

---

## 四、项目目标：MVP 范围与验证场景

不以功能数量为目标，以跑通企业工作闭环为目标。

### 三大验证场景

| 场景 | 验证目标 | 核心流程 | 阶段 |
|------|---------|---------|------|
| 场景一：HTML 本机预览 | 最小技术闭环 | Chat → Agent Loop → 本地文件 Tool → 生成 HTML → localhost 预览 → 增量修改 | Phase 1 |
| 场景二：招投标分析 | 企业价值闭环 | 文档解析 → 字段提取 → 企业知识 → 规则判断 → Excel/PPT → 人工审核 → 审计 | Phase 2 |
| 场景三：Skill 生成 | 平台能力生产 | 自然语言 → Skill 草稿 → 依赖检查 → 测试 → 审核 → 发布 → 版本管理 | Phase 3 |

### MVP 成功标准

员工登录 → 使用批准模型 → 调用授权 Tool → 读取有权知识 → 关键节点确认/审核 → 生成保存 Artifact → 任务可查看恢复 → 动作可审计。

### P0 必须有

- **桌面端**：Electron + Vue 客户端、Chat、Task 列表与详情、本地 Workspace 选择与授权、Artifact 展示、本机 HTML 预览、基础用户确认组件
- **Core**：Session、Agent Loop、Task/TaskRun/TaskStep、Context Assembly、Model Gateway、Tool Runtime、Skill Runtime、Agent Role 基础加载、Permission/Policy、Artifact Runtime、基础持久化和步骤恢复
- **企业管理**：用户与部门、Access Role、Model/Tool/Skill Registry、Agent Role 管理、企业知识库接入、审计日志
- **Tool**：本地文件读写、PDF/DOCX/XLSX 解析、企业知识检索、Excel/PPT 生成、本机预览服务

---

## 五、工程建设说明

### 开发策略：Kernel Framework First，Chat Last

不先做 Chat 页面，而是先建设有清晰边界、状态所有权、持久化、恢复语义和扩展接口的 Kernel Framework。Chat 作为薄客户端最后集成。

### 开发原则

- **Contract 驱动**：所有模块通过版本化 Contract（v1alpha1）对接
- **Port/Adapter 模式**：实现可替换，InMemory + SQLite 双 Adapter 通过同一 Conformance Suite 验证
- **纯 reducer**：Kernel 状态转换无 I/O、无系统时钟、无随机源，可确定性测试和回放
- **上游借鉴 DESIGN_ONLY**：参考 OpenHands / LangGraph / OpenClaw 等成熟 Agent 项目的机制设计，全部 TypeScript 重写，不复制第三方源码
- **每批独立 QA**：每批代码由开发者自测后，经 Claude Code 独立验收，通过后才进入下一批次

### KAF 里程碑与进度

| 里程碑 | 内容 | 状态 | 测试基线 |
|--------|------|------|----------|
| KAF-0 | 工程与边界基线：Monorepo、Contract、Core 生命周期、架构边界检查 | ✅ 完成 | 28 tests |
| KAF-1 | Runtime Kernel：Task/Run/Step 状态机、纯 reducer、Retry/Cancel/Deadline | ✅ 完成 | 45 tests |
| KAF-2 | Event、Persistence 与恢复：SQLite、幂等、Outbox、Effect 崩溃恢复 | 🔄 95% | 111 tests |
| KAF-3 | Capability 与 Adapter：真实模型、Tool/MCP、Skill Registry | ⬜ 未开始 | — |
| KAF-4 | Policy、并发、可靠性与性能 | ⬜ 未开始 | — |
| KAF-5 | Headless Framework 验收 → Electron Chat 薄客户端集成 | ⬜ 未开始 | — |

### KAF-2 三个子批次

| 批次 | 内容 | QA |
|------|------|-----|
| KAF-2.1 | Persistence Contract + SQLite 基础（原子事务、幂等、Migration、Conformance） | ✅ PASS |
| KAF-2.2 | Durable Command Pipeline（DurableTaskRuntime、Event replay、Outbox at-least-once、重启恢复） | ✅ PASS |
| KAF-2.3 | Effect Recovery（Intent-first 副作用、三类恢复模式、崩溃点注入、uncertain 收敛） | 🔄 待 QA |

### 当前代码规模

| 维度 | 数值 |
|------|------|
| 开发版本 | 0.0.0-kaf.2.3 |
| Contract 版本 | v1alpha1 |
| 测试文件 | 13 个 |
| 测试用例 | 111 项 |
| 通过独立 QA 的迭代 | 5 批次 |
| 已确认 ADR | 7 份 |
| Kernel Framework 完成度 | ≈ 45% |

---

## 六、技术架构简介

### 五层逻辑架构

| 层 | 职责 | 核心模块 |
|----|------|---------|
| **Experience Plane** | 面向人的产品入口 | Employee Workspace、Admin Console |
| **Control Plane** | 理解、规划、状态和策略控制 | Agent Runtime、Task Runtime、Skill Runtime、Tool Runtime、Model Gateway、Policy Engine、Artifact Runtime、Context & Memory |
| **Integration Plane** | 连接企业已有系统和数据 | MCP Integration、Enterprise API、Knowledge、File System、MaaS |
| **Execution Plane** | 真正操作文件、代码和环境 | Local Worker、Sandbox Worker (P1)、Remote Worker (P2) |
| **Governance Plane** | 贯穿所有层的治理能力 | Identity & Access、Audit、Data Security、Quality & Evaluation、Cost & Quota |

### 当前技术栈 (ADR-004)

| 项 | 选型 |
|----|------|
| 语言 | TypeScript 5.9.3 |
| 运行时 | Node.js 24.13.0 |
| 桌面框架 | Electron + Vue 3（后续实现） |
| 持久化 | SQLite (node:sqlite)，WAL 模式 |
| 测试框架 | Vitest 4.1.10 |
| 包管理 | pnpm 11.11.0 + Monorepo（Project References） |
| Contract 校验 | Zod + 规范 JSON + SHA-256 Digest |

### 代码分层

```
packages/contracts/         ← 版本化协议，所有模块共同依赖
  ├── runtime/              Task/Session/Action/Observation/Command
  └── persistence/          Event/Checkpoint/Receipt/Effect/Outbox

services/core/
  ├── kernel/               ← 纯状态 reducer，无 I/O，无外部依赖
  ├── application/          ← DurableTaskRuntime、EffectCoordinator、RecoveryCoordinator
  ├── ports/                ← 语义化接口（TaskPersistence、EffectExecutor、EventPublisher…）
  └── adapters/             ← InMemory 实现 + SQLite 实现
```

### 7 份已确认 ADR

| ADR | 主题 | 关键决策 |
|-----|------|---------|
| ADR-001 | 部署边界 | All-in-One Local 开发模式，预留 Desktop + 企业服务演进路径 |
| ADR-002 | 文件授权 | FileGrant / WorkspaceGrant 显式授权，Agent 不绕过 Core 访问文件 |
| ADR-003 | 里程碑 | Kernel Framework First 策略，KA-0～KA-2 渐进式交付 |
| ADR-004 | 技术栈 | TS + Electron + Vue + Node 24 + SQLite |
| ADR-005 | 状态所有权 | Task Runtime 唯一写入者、纯 reducer、Retry 新 Run、显式 waiting/resume |
| ADR-006 | 权限分层 | Authorization → Risk → DataClassification → Policy → Approval 五层模型 |
| ADR-007 | 副作用一致性 | Command 幂等、Append-only Event、Checkpoint、Outbox 单事务、Effect 三类恢复 |

---

## 七、上游技术借鉴

每个核心模块都参考了成熟开源 Agent 项目的机制设计，但全部为 TypeScript 独立重写（DESIGN_ONLY），不复制第三方源码。借鉴原则：学机制不抄代码、适配不照搬、拒绝不妥协。

### 主要参考项目

| 项目 | 许可证 | 参考 Commit | 核心价值 |
|------|--------|------------|---------|
| **OpenClaw** | MIT | `deccdb5` | Node.js Core 生命周期、SQLite 单写、事务后发布、ModelProvider 抽象 |
| **Grok Build** | Apache-2.0 | `98c3b24` | Actor/mailbox 单写入者、Registry Builder→Finalize 模式、Retry 策略 |
| **OpenHands** | MIT | `4fe5656` | Agent Definition/State 分离、类型化 Action/Observation、Append-only Event |
| **LangGraph** | MIT | `49ae27c` | Checkpoint Port、Interrupt/Resume、Conformance Suite、pending-write 幂等 |
| **Hermes** | MIT | `3d9be27` | 持久消息与调用时上下文分离（后置实现） |
| **Open WebUI** | BSD-3 | `ecd48e2` | 类型化 UI 事件协议（后置实现，安全机制明确拒绝） |
| **Daytona** | AGPL-3.0 | `ec4c21b` | Control/Compute 分离、Sandbox 生命周期（远程 Worker 阶段参考） |

### 模块级借鉴对照

| RoboThree 模块 | 主参考 | 借鉴了什么 | 为什么没照搬 |
|---------------|--------|-----------|-------------|
| **Core Bootstrap 生命周期** | OpenClaw | 启动阶段顺序、配置快照、SQLite preflight、ready/health 语义 | OpenClaw 是 20+ Channel 的全渠道 Gateway，RoboThree 只需要单机内核的组件装配和反向停止 |
| **ModelProvider Port** | OpenClaw | Provider Adapter 抽象、AbortSignal 取消、流式事件归一化 | OpenClaw 内建多厂商模型矩阵与 OAuth 耦合，RoboThree 先做 Fake + OpenAI-compatible，保持 Contract 独立 |
| **Task Runtime Mailbox** | Grok Build | Actor 隔离、每 Task 串行消息通道、单写入者 | Grok Build 是 Rust 实现，使用 RefCell/Mutex 共享状态和 ACP/Leader 模式；RoboThree 用 TypeScript Promise mailbox，更简单且无锁 |
| **TaskRunState + Action/Observation** | OpenHands | Agent Definition 与运行状态分离、类型化 Action/Observation、显式状态机 | OpenHands 是 Python/Pydantic，完整 Conversation API 和文件式 Event Store；RoboThree 拆分为独立 Task/Run/Step 所有权 + SQLite 事务 |
| **Command + Interrupt/Resume** | LangGraph | 显式 Command、Step 边界、Interrupt 非异常控制流、waiting/resume 语义 | LangGraph 依赖 Pregel/Superstep 和 Graph Builder；RoboThree 做开放式 Agent Loop，不引入完整 DAG 引擎 |
| **Event Log + 状态投影** | OpenHands | Append-only Event、稳定 Event ID、重复拒绝、从 Event 重建状态视图 | OpenHands 一事件一文件 + 文件锁；RoboThree 用 SQLite 行存储 + 单事务原子写入 |
| **Checkpoint Port + Conformance** | LangGraph | Checkpoint 抽象（latest/by-id/parent）、SQLite Saver 分离、统一兼容测试套件 | 不引入 Pregel/channel_versions、Python 序列化、Graph namespace；RoboThree 每 accepted Command 一个完整 Checkpoint |
| **SQLite Schema Preflight + Migration** | OpenClaw | 启动时较新 schema 拒绝、迁移先于 runtime ready、WAL + foreign keys + busy timeout | OpenClaw 有 Session/Transcript/Channel 等复杂表结构和旧 JSON store 兼容迁移；RoboThree 只需 Task Event/Checkpoint/Outbox 的 forward-only migration |
| **Durable Command Pipeline** | OpenHands + LangGraph | 事件到状态重建、Checkpoint 恢复、pending-write 幂等、确定性 replay | 全部 DESIGN_ONLY 重写：每 Task mailbox + 纯 reducer 编排 + Receipt/Event/Checkpoint/Head/Outbox 原子提交 |
| **Outbox 发布** | OpenClaw | 事务提交后发布、pending 记录、重启续发 | 自研显式 drain + attempt 计数 + publish-then-ack at-least-once 语义，不引入 OpenClaw Gateway 数据模型 |
| **Effect 崩溃恢复** | OpenHands + LangGraph + OpenClaw | Intent-first 副作用、稳定幂等键、三类 recovery mode、uncertain → waiting 收敛 | 三者的组合适配：OpenHands 的类型化 Action/Observation + LangGraph 的 pending-write 幂等 + OpenClaw 的事务后发布。RoboThree 独创 prepared/dispatched/terminal/uncertain 生命周期 |
| **Capability Registry** | Grok Build + OpenHands + OpenClaw | Builder→Finalize 不可变快照、Definition/Binding/Descriptor 分层、启动校验与冻结 | 三者的融合重写：分离声明式 Capability 与 RuntimeAdapterHandle，capability lock 不泄露进程句柄和密钥 |
| **Context Assembly** | Hermes | 持久消息与调用时临时上下文分离、静态/动态上下文分层 | 后置实现；Hermes 的具体 Prompt 和 Python Runtime 行为不适用 |

### 明确拒绝的机制

| 来源 | 拒绝的机制 | 原因 |
|------|-----------|------|
| Open WebUI | 后端事件触发 Renderer `eval` / 动态代码执行 | 形成模型→桌面主线程的 RCE 通道 |
| Open WebUI | 长期 Token 存入 localStorage | Renderer/XSS 可读取凭证 |
| Grok Build | 三套 Tool 实现并存 | 参数和行为分裂，不利于 Contract 稳定 |
| LangGraph | KA-0 引入完整 Pregel Runtime | 不符合开放式 Agent Loop，复杂度过高 |
| Daytona | 直接嵌入 AGPL 平台代码 | 企业产品许可证和部署边界风险 |
| OpenClaw | 未审核 npm Plugin 在 Core 热加载 | 违反首期可信扩展和 Core 隔离原则 |

---

## 八、下一步计划

### 短期（当前）

- 完成 KAF-2.3 独立 QA，关闭 KAF-2 里程碑
- 确认 ADR-006 Policy 方案从 PROPOSED → ACCEPTED
- 冻结 KAF-3 Capability 最小必要 Contract

### 中期（KAF-3 / KAF-4）

- 真实 ModelProvider 接入（流式、Tool Calling、Token 计数）
- Capability Resolver 实现（Tool/Skill/Model 匹配与绑定）
- Tool Runtime + MCP 适配
- Policy Engine 在 DurableTaskRuntime dispatch 链路预留接入点
- Skill Manifest 定义 + Skill Runtime
- 性能基线测量与背压机制

### 待决策事项

- 功能详设（用户流程、UI 交互、场景细节）
- 第一条端到端垂直链路的具体范围与验收标准
- KAF-3 开发计划与资源安排

---

## 九、总结

| 维度 | 当前状态 |
|------|---------|
| Kernel 框架地基 | KAF-0/1/2 三层完成，状态机 + 持久化 + 崩溃恢复已就绪 |
| 工程质量 | 111 项测试、13 个测试文件、5 批次独立 QA PASS、0 严重缺陷 |
| 架构决策 | 7 份 ADR 已确认，Contract/Port/Adapter 模式已跑通验证 |
| 产品功能 | 尚未开始。Chat、真实模型、Tool、Skill、Electron 客户端均待建设 |
| 下一步 | 关闭 KAF-2 → 功能详设 → 启动 KAF-3 Capability 与真实集成 |

> **地基已就位，产品待启航。**
