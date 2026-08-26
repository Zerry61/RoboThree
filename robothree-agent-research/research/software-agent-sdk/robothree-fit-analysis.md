# robothree-fit-analysis.md — RoboThree 适配分析

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 核心判断

Software Agent SDK 是目前与 RoboThree 设计愿景**最接近的开源参考**。其 Conversation 工厂模式、Workspace 统一抽象、Event Sourcing 架构、Agent Server 部署模型与 RoboThree 的 "Local Worker / Cloud Worker 统一接口" 目标高度一致。

总体建议：**ADAPT** — 借鉴其架构模式与接口设计，但结合 RoboThree 的具体需求重新实现。

---

## 逐维度分析

### 1. Agent Runtime SDK → ADAPT

**借鉴点**：
- `Agent` 作为 frozen 配置对象（`frozen=True`），所有状态在 `ConversationState` 中。这种"无状态 Agent + 全状态 State"分离非常适合 RoboThree 的 SDK 设计。[F]
- `Agent.step()` 的单步执行模型：每次 step 完成一次 LLM 调用 + 工具执行的完整循环。[F]
- `AgentBase` 抽象允许接入不同类型的 Agent（OpenHands / ACP），通过 capability flags（`supports_openhands_tools` 等）控制行为。[F]

**RoboThree 差异**：
- RoboThree 需要更丰富的 Agent 类型体系（Coding Agent / Computer Use / Autonomous）
- 需要支持 Agent 间的能力组合（而非只是 ACP 的外部代理）

**建议**：ADAPT 设计模式，实现 RoboThree 自己的 Agent Runtime SDK。

### 2. Conversation 工厂（Local ↔ Remote 切换） → ADOPT

**机制**：`Conversation(agent, workspace)` 根据 `workspace` 类型自动选择 `LocalConversation` 或 `RemoteConversation`。[F]

**证据**：[conversation.py:63-235](openhands-sdk/openhands/sdk/conversation/conversation.py#L63-L235)

**对 RoboThree 的价值**：这就是需求的 "Local Worker 和 Cloud Worker 的统一接口"。

```python
# RoboThree 可直接借鉴
conversation = RoboThreeConversation(
    agent=agent,
    worker=LocalWorker(path="./project")    # → LocalRuntime
)
# 或
conversation = RoboThreeConversation(
    agent=agent,
    worker=CloudWorker(endpoint="https://...")  # → RemoteRuntime
)
```

**建议**：ADOPT — 工厂模式是最优的 Local/Remote 统一方案。

### 3. Workspace 抽象 → ADAPT

**机制**：`BaseWorkspace` ABC 定义五个抽象方法（`execute_command`, `file_upload`, `file_download`, `git_changes`, `git_diff`），5 种后端实现。[F]

**证据**：[base.py:23-182](openhands-sdk/openhands/sdk/workspace/base.py#L23-L182)

**RoboThree 差异**：
- RoboThree 的 Workspace 概念可能更广义（不仅是文件系统和命令执行，还包括沙箱抽象）
- `pause()` / `resume()` 方法对容器化 Worker 很有价值
- 缺少流式文件传输和增量同步

**建议**：ADAPT — 保留接口抽象模式，扩展为包含 Sandbox 边界、流式 I/O 和增量同步。

### 4. Action / Observation 模式 → ADOPT

**机制**：`Action` 是工具输入（Pydantic 模型），`Observation` 是工具输出。`ToolDefinition` 封装三元组 `(schema, action_type, observation_type)` + executor。[F]

**证据**：[tool/schema.py](openhands-sdk/openhands/sdk/tool/schema.py), [tool/tool.py](openhands-sdk/openhands/sdk/tool/tool.py)

**对 RoboThree 的价值**：
- Action/Observation 模式是 Agent Runtime 的核心通信原语
- Pydantic Schema → JSON Schema 的自动转换
- 类型安全的工具接口定义

**建议**：ADOPT — 直接复制概念，使用 RoboThree 的类型系统实现。

### 5. Event Stream → ADAPT

**机制**：所有状态变更以 Event 形式记录在 EventLog 中。Event 具有 `parent_id` 形成树形结构。Event 类型分为 `ActionEvent`, `ObservationEvent`, `MessageEvent`, `SystemPromptEvent` 等。[F]

**证据**：[event/base.py](openhands-sdk/openhands/sdk/event/base.py)

**RoboThree 差异**：
- 需要更丰富的事件类型（Worker 生命周期事件、Sandbox 事件、连接事件）
- EventLog 需要支持持久化消息队列（不仅是文件）
- 树形事件结构对 RoboThree 的多 Agent 分支场景有价值

**建议**：ADAPT — 保留 Event Sourcing 思想 + 树形结构，扩展事件类型并更换存储后端。

### 6. Agent Server 部署模型 → ADAPT

**机制**：FastAPI 应用提供 REST + WebSocket 接口，管理会话生命周期。支持延迟初始化（warm-pool）、Git Worktree 隔离、会话租约。[F]

**证据**：[api.py](openhands-agent-server/openhands/agent_server/api.py), [conversation_service.py](openhands-agent-server/openhands/agent_server/conversation_service.py)

**RoboThree 差异**：
- RoboThree 的 Agent Server 可能需要支持更多 Workers 类型（Container / VM / Browser）
- 需要任务队列和调度层（不仅是会话管理）
- 需要支持多用户租户模型

**建议**：ADAPT — 保留 FastAPI + WebSocket 架构骨架 + 延迟初始化模式。

### 7. Skill Framework → ADAPT

**机制**：Skill 是文本指令，按触发词或 Agent 显式调用激活。来源：用户/项目/Plugin/公开 marketplace。[F]

**RoboThree 差异**：
- RoboThree 的 Skill 可能需要更强的结构（不仅是文本指令，还包括工具绑定和 Hook 配置）
- 版本化管理 Skill
- 跨 Worker 的 Skill 分发

**建议**：ADAPT — 保留多来源 + 触发词模式，增强 Skill 结构。

### 8. Plugin System → ADAPT

**机制**：Plugin 打包 Skills + MCP Config + Hooks + Agent Definitions。来源：github/git/local，确定性引用解析（ref → commit SHA）。[F]

**对 RoboThree 的价值**：
- Plugin 的合并语义（Skills 覆盖、MCP 覆盖、Hooks 连接）设计精良
- 来源解析 + 版本锁定 + 确定性恢复是一流的工程实践

**建议**：ADAPT — 合并语义可直接借鉴，来源解析模式值得推广。

### 9. Sandbox Boundary → DEFER（短期）/ ADAPT（长期）

**机制**：5 种 Workspace 后端提供不同程度的隔离。LocalWorkspace 无隔离。[F]

**RoboThree 评估**：
- Docker Workspace 的容器隔离可作为 MVP 的 Cloud Worker Sandbox
- LocalWorkspace 的零隔离不可用于生产，但可用于开发
- 缺少 seccomp / bubblewrap 等更轻量的隔离方案

**建议**：DEFER — MVP 先聚焦 Workspace 抽象，Sandbox 隔离在 Worker 层实现。

### 10. Multi-agent → ADAPT

**机制**：`DelegateTool` + `fork()` 实现 Subagent 委托。Agent 注册系统支持多级发现。[F]

**RoboThree 差异**：
- 需要更正式的多 Agent 编排（不只是委托）
- 需要 Agent 间路由和消息传递
- 需要 Subagent 的超时和资源限制

**建议**：ADAPT — Fork-based 隔离模式 + Agent 注册系统可参考。

### 11. Security Model → REJECT（核心模式）/ ADAPT（部分机制）

**拒绝**：LLM 自评安全的模式不适合 RoboThree。
- `security_risk` 由 LLM 在工具参数中填写 [F]
- 攻击者通过 prompt 注入可使高风险操作被标记为 LOW

**借鉴**：
- Hook 拦截机制（pre-action 可阻止执行）值得保留
- 确认策略分层（Analyst 评级 → Policy 决策）的设计值得参考，但 Analyst 必须由服务端确定性实现

**建议**：REJECT LLM 自评模式；ADAPT Hook 拦截和确认策略的分层架构。

---

## Proposed RoboThree Changes

> 列出会影响 RoboThree 模块边界 / 技术栈 / 数据模型 / 安全模型 / 部署形态的候选变更。**仅作为提议，未自动落地。**

1. **Agent Runtime SDK**：采用"无状态 Agent + 全状态 ConversationState"架构。分离 Agent 配置与运行时。
2. **Worker 统一接口**：采用 `Conversation` 工厂模式，根据 Worker 类型（Local/Cloud/Container）自动选择执行后端。
3. **Event Sourcing**：所有状态变更以 Event 形式持久化，Event 树结构支持分支和导航。
4. **Action/Observation**：作为 Agent 与 Worker 之间的通信协议。
5. **Agent Server**：采用 FastAPI + WebSocket + 延迟初始化 + 会话租约的架构。
6. **安全模型**：服务端确定性安全分析替代 LLM 自评。Hook 拦截 + 确认策略分层。
7. **Prompt Caching**：Static/Dynamic prompt 分离以利用 LLM prompt caching。

## Requires Human Approval

> 列出需要用户拍板才能推进 RoboThree 正式架构决策的项。
> 默认状态：`PENDING_HUMAN_DECISION`。

1. **Agent SDK 技术栈**：Python vs TypeScript vs Polyglot？OpenHands 是纯 Python。RoboThree 的 SDK 面向什么语言生态？
   - 状态：`PENDING_HUMAN_DECISION`

2. **Event Stream 存储后端**：文件（OpenHands 当前方式）vs SQLite vs PostgreSQL vs 消息队列？
   - 状态：`PENDING_HUMAN_DECISION`

3. **Agent Server 语言/框架**：FastAPI（OpenHands 选择）vs Go/Node.js/Elixir？
   - 状态：`PENDING_HUMAN_DECISION`

4. **Sandbox 隔离级别**：Docker vs Firecracker vs gVisor vs seccomp-only？
   - 状态：`PENDING_HUMAN_DECISION`

5. **Multi-Agent 编排复杂度**：OpenHands 的 delegate fork 模式 vs 完整的 Agent DAG 编排？
   - 状态：`PENDING_HUMAN_DECISION`

6. **Skill 结构深度**：纯文本指令（OpenHands 当前）vs 结构化 Skill（含工具绑定和 Hook 配置）？
   - 状态：`PENDING_HUMAN_DECISION`
