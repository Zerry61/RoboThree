# architecture.md — Agent SDK 架构总览

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 1. 整体架构

OpenHands Software Agent SDK 采用 **分层 + Event Sourcing** 架构：

```
┌─────────────────────────────────────────────────┐
│                  User / Client                    │
│  (Python SDK, REST API, WebSocket, TypeScript)    │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              Conversation (Factory)               │
│  LocalConversation ←→ RemoteConversation          │
│  Workspace: Local | Remote                        │
└─────┬───────────────────────────────┬───────────┘
      │                               │
┌─────▼────────┐           ┌─────────▼──────────┐
│  Agent Loop  │           │   Agent Server      │
│  (step/astep)│           │  (FastAPI + WS)     │
└─────┬────────┘           └─────────┬──────────┘
      │                               │
┌─────▼──────────────────────────────────────────┐
│                Event Stream                      │
│  EventLog (file-backed) + PubSub (in-memory)     │
│  ActionEvent / ObservationEvent / MessageEvent   │
└────────────────────────────────────────────────┘
      │
┌─────▼──────────────────────────────────────────┐
│           Tool Runtime + Workspace              │
│  Terminal / FileEditor / Browser / Delegate     │
│  Local FS | Docker Container | Cloud VM         │
└────────────────────────────────────────────────┘
```

## 2. 核心架构模式

### 2.1 Agent 无状态 + State 全状态

- **Agent** 是 frozen Pydantic 模型（`frozen=True`）。只包含配置：LLM 实例、工具列表、MCP 配置、prompt 模板。[F]
- **ConversationState** 承载所有运行时状态：事件日志、执行状态、密钥注册表、确认策略、安全分析器、Agent 状态字典。[F]
- Agent 的 `step()` 方法接收 `conversation` 和 `on_event` 回调，状态变更完全通过 Event Stream 驱动。[F]

证据：
- `AgentBase` 定义 `model_config = ConfigDict(frozen=True)` — [base.py:105](openhands-sdk/openhands/sdk/agent/base.py#L105)
- `ConversationState` 包含 `execution_status`, `events`, `secret_registry`, `confirmation_policy`, `security_analyzer`, `agent_state` — [state.py](openhands-sdk/openhands/sdk/conversation/state.py)

### 2.2 Event Sourcing + 树形事件

- 所有状态变更都以 Event 形式记录在 EventLog 中。[F]
- Event 具有 `parent_id` 形成树形结构，支持 fork/branch/navigate。[F]
- EventLog 是惰性文件后端存储（`EventsListBase`），支持 30k+ 事件而不全量加载到内存。[I]

证据：
- `Event.__init__` 包含 `parent_id: EventID | None` — [base.py:33-40](openhands-sdk/openhands/sdk/event/base.py#L33-L40)
- `LocalConversation.fork()` 使用 `events.path_to_root()` 拷贝分支 — [local_conversation.py:660-795](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L660-L795)
- `ConversationState.events` 是 `EventsListBase` — [state.py](openhands-sdk/openhands/sdk/conversation/state.py)

### 2.3 Action / Observation 模式

- **Action** — Pydantic 模型，由 Tool Schema 动态生成，代表工具输入。[F]
- **Observation** — Pydantic 模型，代表工具执行结果。[F]
- **ToolDefinition** 封装 Schema + Action Type + Observation Type + Executor。[F]
- 执行流程：`ActionEvent → Tool(action, conversation) → Observation → ObservationEvent`。[F]

证据：
- `Action` 和 `Observation` 导出 — [tool/__init__.py:27-29](openhands-sdk/openhands/sdk/tool/__init__.py#L27-L29)
- `ToolDefinition.__call__` 调用 `executor(action, conversation)` 返回 `Observation` — [tool.py](openhands-sdk/openhands/sdk/tool/tool.py)
- `Agent._execute_action_event()` — [agent.py:1293-1351](openhands-sdk/openhands/sdk/agent/agent.py#L1293-L1351)

### 2.4 Workspace 统一抽象

`BaseWorkspace` ABC 定义统一接口：

| 方法 | 用途 |
| --- | --- |
| `execute_command(command, cwd, timeout)` | 执行 shell 命令 |
| `file_upload(src, dst)` | 上传文件 |
| `file_download(src, dst)` | 下载文件 |
| `git_changes(path)` | Git 变更列表 |
| `git_diff(path)` | Git diff |
| `pause()` / `resume()` | 暂停/恢复工作区 |

证据 — [base.py:23-182](openhands-sdk/openhands/sdk/workspace/base.py#L23-L182)

实现类型：
- **LocalWorkspace** — 直接调用本地文件系统和 subprocess。[F]
- **DockerWorkspace** — 在 Docker 容器中执行，提供沙箱隔离。[F]
- **RemoteAPIWorkspace** — 通过 Agent Server REST API 远程执行。[F]
- **CloudWorkspace** — 云端临时工作区。[F]
- **ApptainerWorkspace** — HPC 容器环境。[F]

### 2.5 Event Stream 是唯一真实来源

系统的核心抽象是 Event Stream：

```
SystemPromptEvent
  → MessageEvent (user)
    → ActionEvent (tool call)
      → ObservationEvent (tool result)
    → MessageEvent (assistant)
  → MessageEvent (user)
    → ...
```

- `ConversationState.view` 提供 LLM-ready 消息视图（增量缓存维护）。[F]
- Condenser 在上下文窗口超限时压缩历史事件。[F]
- EventLog 是文件后端，惰性加载，支持分片。[I]

证据：
- `prepare_llm_messages(state.view, ...)` 在 `Agent.step()` 中调用 — [agent.py:651-653](openhands-sdk/openhands/sdk/agent/agent.py#L651-L653)
- `LLMSummarizingCondenser` 在 LLMContextWindowExceedError 时触发 — [agent.py:759-772](openhands-sdk/openhands/sdk/agent/agent.py#L759-L772)

## 3. Agent Loop 架构（核心）

### 3.1 主循环

Agent 主循环位于 `Agent.step()`：

```
1. 检查待处理 Action（确认模式回放）
2. 检查被 Hook 阻塞的消息
3. 构建 LLM CallContext（prompt_cache_key + session_id）
4. 准备 LLM 消息（来自 State.view 的增量缓存）
5. 处理 Condensation 事件（如有）
6. 检查非多模态模型的图像输入
7. 调用 LLM → LLMResponse
8. classify_response() 分类为 TOOL_CALLS / CONTENT / REASONING_ONLY / EMPTY
9. 根据类型分发：
   - TOOL_CALLS → 验证参数 → 安全分析 → 确认检查 → 并行执行 → 观察输出 → 检查 Finish
   - CONTENT → 发送消息事件 → 设置 FINISHED
   - REASONING_ONLY / EMPTY → 发送事件 → 注入纠正提示
```

证据 — [agent.py:612-796](openhands-sdk/openhands/sdk/agent/agent.py#L612-L796)

### 3.2 工具调用批处理

工具调用支持三种模式：

1. **并行执行**：多个工具调用通过 `ParallelToolExecutor` 并发执行，每个工具在独立线程中运行。[F]
2. **Finish 截断**：`FinishTool` 之后的工具调用被丢弃。[F]
3. **确认模式**：`_requires_user_confirmation()` 根据安全风险和确认策略暂停执行，等待用户显式确认。[F]

证据：
- `_ActionBatch.prepare()` 处理截断 + 阻塞检查 + 批执行 — [agent.py:227-258](openhands-sdk/openhands/sdk/agent/agent.py#L227-L258)
- `ParallelToolExecutor` 使用 `ThreadPoolExecutor` — [parallel_executor.py](openhands-sdk/openhands/sdk/agent/parallel_executor.py)
- `_requires_user_confirmation()` — [agent.py:991-1032](openhands-sdk/openhands/sdk/agent/agent.py#L991-L1032)

### 3.3 外层运行循环

`LocalConversation.run()` 提供外层循环：

```
while True:
    with state lock:
        check terminal states (PAUSED/STUCK/FINISHED)
        stop hook check
        stuck detection
        agent.step(conversation, on_event, on_token)
        iteration++
        check budget exceeded
        check max iterations
```

证据 — [local_conversation.py:1725-1893](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L1725-L1893)

## 4. 安全架构

### 4.1 双层安全模型

1. **安全分析器** (`SecurityAnalyzerBase`)：分析工具调用的安全风险，给每个 Action 分配 `SecurityRisk` 等级（LOW / MEDIUM / HIGH / UNKNOWN）。[F]
2. **确认策略** (`ConfirmationPolicyBase`)：根据风险等级决定是否需要用户确认。[F]

风险等级由 LLM 通过工具参数中的 `security_risk` 字段填充，安全分析器进行验证和覆盖。[I]

证据：
- `_extract_security_risk()` — [agent.py:1034-1059](openhands-sdk/openhands/sdk/agent/agent.py#L1034-L1059)
- `_requires_user_confirmation()` — [agent.py:991-1032](openhands-sdk/openhands/sdk/agent/agent.py#L991-L1032)

### 4.2 Hook 系统

Hook 系统提供事件级拦截能力：
- **Pre-action hooks**：在工具执行前拦截，可拒绝（`blocked_actions`）
- **Post-action hooks**：在工具执行后观察/修改结果
- **Stop hooks**：在 Agent 完成时决定是否继续
- **Session start/end hooks**：会话生命周期

证据 — [local_conversation.py:1099-1114](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L1099-L1114)

### 4.3 Sandbox 边界

| Workspace 类型 | 隔离级别 | 说明 |
| --- | --- | --- |
| LocalWorkspace | 无隔离 | 直接操作系统调用 |
| DockerWorkspace | 容器隔离 | Docker 容器执行命令 |
| ApptainerWorkspace | 容器隔离 | HPC 环境 |
| CloudWorkspace | VM 隔离 | 云端临时 VM |
| RemoteAPIWorkspace | 网络隔离 | 远程 API 调用 |

注意：**LocalWorkspace 不提供任何沙箱**。这是设计选择，适用于开发场景但存在安全风险。

## 5. 多 Agent 架构

### 5.1 Subagent 委托

通过 `DelegateTool` 实现多 Agent 协调：

1. 父 Agent 调用 `delegate` 工具，指定任务描述和子 Agent 类型。[F]
2. 创建子 Conversation（fork 父 Conversation 的状态）。[F]
3. 子 Agent 在隔离的工作区中执行任务。[F]
4. 完成后结果返回父 Agent。[I]

证据：
- `DelegateTool` 实现 — [delegate/impl.py](openhands-tools/openhands/tools/delegate/impl.py)
- `LocalConversation.fork()` 创建分支 — [local_conversation.py:660-795](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L660-L795)

### 5.2 Agent 注册系统

- `register_agent(name, factory)` — 程序化注册
- `discover_agents()` — 从文件系统发现（Markdown 定义文件）
- Agent 定义文件支持 `.agents/agents/*.md` 和 `.openhands/agents/*.md`。[F]

## 6. Workspace 本地 vs 远程切换

`Conversation` 工厂根据 `workspace` 参数自动选择：

```python
if isinstance(workspace, RemoteWorkspace):
    return RemoteConversation(...)  # WebSocket 连接到 Agent Server
return LocalConversation(...)       # 本地执行
```

## 7. Condensation（上下文压缩）

- `CondenserBase` 抽象接口，`LLMSummarizingCondenser` 是默认实现。[F]
- 当 `LLMContextWindowExceedError` 触发时，自动请求 condensation。[F]
- Condensation 产生摘要替换历史事件，压缩后继续。[I]

## 8. 可观测性

- `Laminar` 集成用于分布式追踪。[F]
- `@observe` 装饰器标注关键 span：`conversation.run`, `agent.step`, 工具执行。[F]
- `ConversationStats` 跟踪 token 用量和成本。[F]
- StuckDetector 检测死循环模式。[F]
