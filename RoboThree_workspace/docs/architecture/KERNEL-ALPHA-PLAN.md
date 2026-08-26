# RoboThree Kernel Alpha 方案

> 状态：**CONFIRMED**  
> 日期：2026-07-19  
> 性质：通用能力平台的首个渐进式产品与技术闭环。

## 1. 已冻结基线

| 决策 | Kernel Alpha 基线 |
| --- | --- |
| 部署 | All-in-One Local，保持 Desktop UI、Local Core、Worker、Persistence 逻辑边界 |
| 企业演进 | Desktop Client + Local Worker + Central Enterprise Service |
| 文件授权 | 默认仅应用目录；业务文件需要 File Grant 或 Workspace Grant |
| 里程碑 | KA-0 Chat；KA-1 Agent/Tool/文件；KA-2 HTML/localhost 验收 |
| 技术栈 | TypeScript Monorepo、Electron + Vue、Node.js Local Core、SQLite |
| 多语言能力 | Python、C# 等通过独立 Worker 或 Tool 接入 |
| Renderer 安全 | 不直接访问文件、数据库、凭证和系统命令 |

详细决策见 [ADR-001](../adr/001-deployment-boundary.md)、[ADR-002](../adr/002-local-file-authorization.md)、[ADR-003](../adr/003-kernel-alpha-milestones.md) 和 [ADR-004](../adr/004-kernel-alpha-technology-stack.md)。

内部开发采用 **Kernel Framework First，Chat Last**。KAF-0～KAF-5 的任务、性能目标和退出门槛见 [KA-0 开发计划](./KA-0-DEVELOPMENT-PLAN.md)；MVP 用户能力和阶段范围以 [MVP 功能范围与开发基线 v1.0](../product/ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md) 为准；每个模块的上游来源见[上游借鉴登记表](./UPSTREAM-ADOPTION-REGISTER.md)。

## 2. 目标

以三个连续、可运行的垂直切片，验证 RoboThree 从对话到通用 Agent 执行，再到可查看 Artifact 的最小平台闭环：

```text
Chat
→ Model
→ Agent / Task
→ Tool
→ Grant / Authorization / User Confirmation
→ Worker
→ Artifact
→ localhost Preview
→ Event / Persistence
```

HTML 只是通用能力验收载体，不把 RoboThree 定位为网页生成产品，也不在 Core 中引入场景分支。

## 3. 逻辑架构

```text
Electron + Vue Desktop
├── Chat / Task / User Confirmation / Artifact UI
└── typed preload IPC
        ↓
Node.js Local Core
├── Session & Task Runtime
├── Model Runtime
├── Agent Orchestrator
├── Tool Runtime
├── Grant / Authorization / Confirmation
├── Event / Checkpoint
└── Artifact / Preview Coordinator
        ↓
Worker / Tool Adapter
├── Local File Tool
└── HTML Artifact & Preview Tool
        ↓
SQLite + App Data + Granted Workspace
```

首期可统一安装和启动，但依赖方向必须遵守上述边界。

## 4. 渐进式里程碑

### KA-0：Chat、模型调用与本地持久化

KA-0 先完成 KAF-0～KAF-5 的 Headless Kernel Framework，再实现本节 Electron Chat。Chat 是薄客户端和产品验收入口，不是 Kernel 的结构来源。

范围：

- Electron + Vue 最小 Chat；
- OpenAI-compatible 模型配置与调用；
- Session 和 Message；
- SQLite migration 与 Repository；
- 凭证经 Main/Core 管理，不进入 Renderer；
- Streaming、取消、错误展示和基础日志；
- 应用重启后恢复会话。

KA-0 暂不建设完整 Agent Loop、通用 Tool Registry 或企业服务。

验收：用户可创建会话、连续对话、重启恢复；Renderer 无法直接读取凭证和数据库。

### KA-1：最小 Agent、Tool 与本地文件任务

范围：

- 版本化的最小 Agent、Tool、Task、Run、Step、Action、Observation Contract；
- Agent Definition 与运行状态分离；
- Tool 注册、解析、Schema 校验与调用；
- FileGrant 和 WorkspaceGrant；
- 真实路径规范化与越界防护；
- Local File Worker：最小 read/create/modify；
- 高风险操作进入 Desktop 用户确认，未授权或越界操作拒绝；
- Event、必要 Checkpoint 与失败恢复；
- 一条自然语言驱动的本地文件 E2E。

验收：Agent 能在明确授权范围内完成本地文件任务；越界路径不触达 Worker；执行过程可追踪。

### KA-2：HTML 生成与 localhost 预览

范围：

- 从自然语言目标规划并生成 HTML Artifact；
- Artifact 文件、元数据和来源关系持久化；
- 受控 localhost 静态预览；
- 预览服务的端口、生命周期和路径隔离；
- 正常、拒绝、失败、取消与重启恢复测试；
- 可重复的最终验收脚本与演示任务。

验收：用户从 Chat 提出开放式 HTML 目标，RoboThree 经 Agent、Tool、授权与 Worker 生成 Artifact，并在 localhost 安全预览；整个链路不存在 HTML 专用 Core 分支。

## 5. 最小工程边界

沿用现有 Monorepo，不为概念提前创建大量 package。目标边界是：

```text
apps/desktop                 # Electron + Vue
services/core                # Node.js Local Core
packages/contracts           # 跨边界版本化 Contract
workers/local                # 确有进程隔离需求时建立
tests/e2e                    # 跨模块验收
```

具体目录只在对应里程碑开始时按现有仓库状态增量建立。逻辑模块可以先存在于 Core 内部，出现独立发布或复用需求后再拆包。

## 6. Alpha 期间明确不做

- 招投标、合同审查等业务包；
- 公开 Marketplace；
- 未审核第三方代码热加载；
- 完整企业 Registry、SSO、审计与管理后台；
- Remote Sandbox 和 Remote Worker 平台；
- Multi-Agent / Subagent；
- Workflow Builder；
- 全套 Browser、Office、PDF Tool Pack；
- 生产级多模型智能路由；
- 任意 Shell 和任意网络默认授权。

## 7. 跨阶段工程门槛

1. 每个里程碑都可单独启动、测试和演示；
2. Renderer 不直接访问高权限资源；
3. 跨边界输入均做运行时 Schema 校验；
4. 业务文件只有显式 Grant 后可访问；
5. Workspace 使用真实路径判定，不能经链接或重解析点越界；
6. Tool 在执行前完成固定权限、Workspace 边界、Tool 风险与必要用户确认检查；
7. Event 只记录必要数据，不持久化明文 Secret；
8. 数据库结构通过 migration 演进；
9. Core 不出现具体行业场景判断；
10. 每阶段包含自动化测试和人工验收清单。

## 8. 分阶段冻结的 ADR

ADR-005 已于 2026-07-20 在 KAF-1 前冻结为 `ACCEPTED`。KAF-4 前置安全决策也已经完成：

- [ADR-006：MVP 固定授权、Tool 风险与 Desktop 用户确认](../adr/006-permission-policy-data-approval.md)；
- [ADR-007：Event、Checkpoint 与副作用一致性](../adr/007-event-checkpoint-side-effect-consistency.md)。

ADR-007 已在 KAF-2 前冻结并完成实现验证。ADR-006 已于 2026-07-22 原位替代未接受的完整 Policy/Approval 草案，并冻结为固定权限、Workspace 边界、Tool 风险与 Desktop 用户确认的最小决策模型。KAF-4 分批方案见 [KAF-4 开发计划](./KAF-4-DEVELOPMENT-PLAN.md)。

KAF-1.1、KAF-2.1、KAF-2.2 与 KAF-2.3 已通过独立 QA，`P3-ENV-001` 保持关闭，KAF-2 正式结束。ADR-008 已冻结 Capability/Registry/Adapter 最小边界；KAF-3.1～KAF-3.3 已全部通过独立 QA并关闭 KAF-3。KAF-2、KAF-3 与 KAF-4 的完整分批方案分别见 [KAF-2 开发计划](./KAF-2-DEVELOPMENT-PLAN.md)、[KAF-3 开发计划](./KAF-3-DEVELOPMENT-PLAN.md)和 [KAF-4 开发计划](./KAF-4-DEVELOPMENT-PLAN.md)。
