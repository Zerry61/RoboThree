# software-agent-sdk — 项目研究索引

## 研究元数据

| 字段 | 值 |
| --- | --- |
| **仓库** | https://github.com/OpenHands/software-agent-sdk |
| **分析 Commit** | `4fe565663af2b4f1130a6e0dac7566b002bfe9b4` |
| **分析日期** | 2026-07-18 |
| **研究深度** | Level 2 |
| **优先级** | 最高 |
| **结论预期** | ADAPT |

## 产物清单

### Required（7 张）

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| [index.md](index.md) | ✅ | 本文件 |
| [project-overview.md](project-overview.md) | ✅ | 项目定位 + 技术栈 + License 初查 |
| [source-map.md](source-map.md) | ✅ | 源码地图 + 真实入口 |
| [architecture.md](architecture.md) | ✅ | 架构总览 + Permission/Security 主报告 |
| [runtime-sequence.md](runtime-sequence.md) | ✅ | 端到端调用链 + Mermaid + Hop Evidence |
| [robothree-fit-analysis.md](robothree-fit-analysis.md) | ✅ | ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE |
| [open-questions.md](open-questions.md) | ✅ | 未解决项 |

### Conditional（全部触发）

| 文件 | 触发条件 | 状态 |
| --- | --- | --- |
| [tool-system.md](tool-system.md) | Tool Runtime 复杂 (Registry/Dispatch/超时/取消/Truncation/Approval) | ✅ |
| [skill-plugin-mcp.md](skill-plugin-mcp.md) | 存在 Skill / Plugin / Hook / MCP | ✅ |
| [subagent-system.md](subagent-system.md) | 存在真实多 Agent（Subagent/Fork/Delegate） | ✅ |
| [permission-system.md](permission-system.md) | 执行 Shell / 文件 / 网络 / 浏览器 | ✅ |
| [security-review.md](security-review.md) | 同上 | ✅ |
| [deployment-model.md](deployment-model.md) | 本地与云端协作 (Agent Server) | ✅ |
| [context-system.md](context-system.md) | Condenser / Prompt Cache / Context 管理 | ✅ |

### Level 3 深挖产物

| 文件 | 深挖机制 |
| --- | --- |
| [mechanism-1-conversation-worker.md](mechanism-1-conversation-worker.md) | **Conversation 工厂与 Worker 抽象**（Local/Remote 切换、Generator 流式协议、WebSocket 重连） |
| [mechanism-2-event-sourcing.md](mechanism-2-event-sourcing.md) | **Event Sourcing 与 ConversationState**（Event 树、EventLog、增量 View、fork/navigate） |
| [mechanism-3-tool-batch.md](mechanism-3-tool-batch.md) | **Action/Observation + Tool 批处理**（Schema、ActionEvent、ParallelToolExecutor、ResourceLockManager） |
| [final-review.md](final-review.md) | 30 项完整自检 + Level 3 验收 |

## 核心结论摘要

1. **Agent SDK** 采用 **Action/Observation + Event Stream** 架构，Agent 是无状态的 Pydantic 模型，所有运行时状态保存在 `ConversationState` 中。
2. **Conversation** 是关键抽象：既是 Agent Loop 的驱动器，也是 Workspace、EventLog、Hook、Plugin 的协调器。
3. **Workspace** 通过统一抽象 `BaseWorkspace` 实现 Local ↔ Remote 切换，是 SDK 本地/云端统一接口的核心。
4. **Agent Server** 是 FastAPI 应用，提供 REST + WebSocket API，管理会话生命周期和工作区隔离（git worktree）。
5. **Event Stream** 是整个系统的唯一真实来源（Single Source of Truth），事件树支持分支、导航和压缩。
6. **Security** 采用安全分析器 + 确认策略双层模型，工具参数中嵌入 `security_risk` 字段由 LLM 填写。
