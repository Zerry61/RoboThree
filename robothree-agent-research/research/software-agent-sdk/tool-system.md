# tool-system.md — Tool Runtime 深度分析

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 1. Tool 系统架构

### 1.1 三层抽象

```
Tool (Spec)          →  用户配置（name + params）
ToolDefinition       →  解析后的完整工具定义（schema + action_type + executor）
ExecutableTool       →  运行时可执行工具（executor 已初始化）
```

证据 — [tool/__init__.py](openhands-sdk/openhands/sdk/tool/__init__.py) 和 [tool/tool.py](openhands-sdk/openhands/sdk/tool/tool.py)

### 1.2 ToolDefinition 结构

```python
class ToolDefinition(DiscriminatedUnionMixin):
    name: str                          # 工具名
    annotations: ToolAnnotations       # 元数据（readOnlyHint 等）
    action_type: type[Action]          # Action Pydantic 模型
    observation_type: type[Observation] # Observation Pydantic 模型
    executor: ToolExecutor             # 执行器 callable
```

**核心方法**：
- `action_from_arguments(dict) → Action` — 将 LLM 输出解析为 Action 对象
- `as_executable() → ExecutableTool` — 返回可执行工具
- `__call__(action, conversation) → Observation` — 执行工具

证据 — [tool/tool.py](openhands-sdk/openhands/sdk/tool/tool.py)

### 1.3 Action / Observation 类型系统

Action 和 Observation 都是 Pydantic 模型，但通过 `Schema` 基类提供动态 schema 生成：

- `Schema.model_json_schema()` 重写以过滤内部字段（`thought`, `summary`, `security_risk`）
- 支持 `$ref` 解析和循环引用检测
- MCP 工具通过 `inputSchema` 定义参数

证据 — [schema.py:26-120](openhands-sdk/openhands/sdk/tool/schema.py#L26-L120)

## 2. 工具注册与发现

### 2.1 解析链

```python
resolve_tool(tool_spec: Tool, state: ConversationState) -> list[ToolDefinition]
```

解析步骤：
1. 按名称查找全局注册表 (`_TOOL_REGISTRY`)
2. 按名称查找文件系统模块
3. 按名称查找 MCP 服务器
4. 实例化并调用 `.create(state)` 返回 ToolDefinition 列表
5. 支持并发的 `ThreadPoolExecutor` 并行解析

证据 — [registry.py](openhands-sdk/openhands/sdk/tool/registry.py)

### 2.2 内置工具

| 工具 | 类 | 说明 |
| --- | --- | --- |
| `finish` | `FinishTool` | 标记 Agent 完成 |
| `think` | `ThinkTool` | 思考（不执行操作） |
| `invoke_skill` | `InvokeSkillTool` | 调用 AgentSkill |

动态附加规则：
- `InvokeSkillTool`：当 AgentContext 中有 invocable AgentSkills-format skill 时自动附加
- `VisionInspectTool`：当使用非多模态模型时自动附加

证据 — [base.py:546-586](openhands-sdk/openhands/sdk/agent/base.py#L546-L586)

### 2.3 运行时工具

- `agent.add_runtime_tools()` — 在 Agent 初始化后动态注入工具（如 MCP 工具）
- 名称去重检查，不允许与已有工具冲突

证据 — [base.py:804-829](openhands-sdk/openhands/sdk/agent/base.py#L804-L829)

### 2.4 客户端工具（ClientToolSpec）

支持从客户端（如前端）注入工具定义，Agent 可调用，但实际执行由前端回调完成：
- 工具通过 `register_client_tools()` 注册
- 执行返回确认消息（acknowledgment）
- 真正的执行由消费 `ActionEvent` 的消费者完成

证据 — [client_tool.py](openhands-sdk/openhands/sdk/tool/client_tool.py)

## 3. 工具执行机制

### 3.1 批处理流程

```python
_ActionBatch.prepare(action_events, state, executor, tool_runner, tools, cancel_token)
```

1. **截断**：`_truncate_at_finish()` — 如果 FinishTool 在批中，丢弃其后的所有调用
2. **阻塞检查**：`state.pop_blocked_action()` — 检查被 Hook 阻塞的 Action
3. **并行执行**：`ParallelToolExecutor.execute_batch()` — 用 ThreadPoolExecutor 并发执行

证据 — [agent.py:227-258](openhands-sdk/openhands/sdk/agent/agent.py#L227-L258)

### 3.2 单工具执行

```python
Agent._execute_action_event(conversation, action_event) -> list[Event]
```

1. 查找 ToolDefinition
2. 调用 `tool(action, conversation)` → `Observation`
3. 包装为 `ObservationEvent`
4. 错误处理：`ValueError` → `AgentErrorEvent`

证据 — [agent.py:1293-1351](openhands-sdk/openhands/sdk/agent/agent.py#L1293-L1351)

### 3.3 并行执行器

`ParallelToolExecutor` 的关键特性：
- 默认 `max_workers=1`（顺序执行）
- `tool_concurrency_limit` 可配置为 > 1 启用并行执行
- 同步模式：`ThreadPoolExecutor` + 直接调用
- 异步模式：`run_in_executor` + `asyncio.gather`

证据 — [parallel_executor.py](openhands-sdk/openhands/sdk/agent/parallel_executor.py)

## 4. 工具参数处理

### 4.1 参数规范化

`normalize_tool_call()` 处理工具名称别名和参数改写：
- `ShellTool` / `BashTool` → `TerminalTool`
- `EditTool` / `StrReplaceEditorTool` → `FileEditorTool`（推断参数）
- 用户定义的别名注册

证据 — [agent/utils.py](openhands-sdk/openhands/sdk/agent/utils.py) 中的 `normalize_tool_call()`

### 4.2 参数修复

`fix_malformed_tool_arguments()` 自动修复常见 LLM 输出错误：
- 字符串拼接的 JSON
- 嵌套引号问题
- 路径格式修复

### 4.3 Summary 提取

每个工具调用需要 `summary` 字段：
- 如果工具自身 schema 有 `summary` 参数（如 Jira），保留原值
- 否则从 LLM 提供的参数中弹出 `summary`
- 如果 LLM 未提供，生成默认 summary：`{tool_name}: {args_json}`

证据 — [agent.py:1061-1106](openhands-sdk/openhands/sdk/agent/agent.py#L1061-L1106)

## 5. 工具超时与取消

- 每个工具执行通过 `timeout` 参数控制（默认 30s，由 Workspace 层实现）
- `CancellationToken` 提供协作式取消：工具可以检查 `conversation.cancel_token.is_cancelled`
- 没有强制的沙箱级超时（依赖底层实现）

## 6. 已注册的工具类型

| 类别 | 工具 |
| --- | --- |
| **Shell** | TerminalTool（tmux + subprocess 双后端） |
| **文件** | FileEditorTool（view/create/str_replace/insert/undo_edit） |
| **搜索** | GrepTool, GlobTool |
| **任务** | TaskTrackerTool, TaskTool, WorkflowTool |
| **浏览器** | BrowserTool（browser-use 集成） |
| **补丁** | ApplyPatchTool |
| **委托** | DelegateTool（Subagent 委托） |
| **规划** | PlanningFileEditorTool |
| **Gemini** | 兼容 Gemini 的 edit/read_file/write_file/list_directory |
| **内置** | FinishTool, ThinkTool, InvokeSkillTool, VisionInspectTool |
