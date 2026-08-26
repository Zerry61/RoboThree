# CrewAI — Architecture Overview

> **深度**：Level 3 Stage B（核心运行路径）
> **方法**：静态源码分析
> **关键源码引用**：所有 `[F]` 来自静态源码；运行时行为仅 `[I]` / `[UNKNOWN]`

## 1. Layered Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           User / Application Code                            │
│                from crewai import Crew, Agent, Task, Process, Memory         │
└────────────────────────────────────────────────────────────────────┬─────────┘
                                                                     │
                                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Crew (Crew Container)                           │
│  Kickoff / KickoffAsync / Train / KickoffForEach / Checkpoint / Streaming    │
│  crew.py:992 (kickoff) → _run_sequential_process (1509) /                    │
│  _run_hierarchical_process (1513) → _create_manager_agent (1518)            │
└────────────────────────────────────────────────────────────────────┬─────────┘
                                                                     │
                                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Process (Orchestrator)                            │
│  Process.sequential → for task in self.tasks: task.execute_sync()            │
│  Process.hierarchical → spawn Manager Agent (tools=AgentTools(agents).tools())│
│  process.py:1 (Enum)                                                         │
└────────────────────────────────────────────────────────────────────┬─────────┘
                                                                     │
                                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Task (execute_sync / async / _execute_core)            │
│  Hooks: PRE_STEP → agent.execute_task → POST_STEP → guardrail → emit events  │
│  task.py:585 (execute_sync) / :609 (execute_async) / :806 (_execute_core)    │
└────────────────────────────────────────────────────────────────────┬─────────┘
                                                                     │
                                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Agent (Core + Execute)                              │
│  _prepare_task_execution (540) → _finalize_task_prompt (568) →              │
│  execute_task (822) → _execute_with_timeout (893) / _execute_without_timeout │
│  ThreadPoolExecutor.timeout + agent_executor.invoke (946)                    │
│  agent/core.py                                                                │
└────────────────────────────────────────────────────────────────────┬─────────┘
                                                                     │
                            ┌────────────────────────────────────────┼─────────────────────┐
                            ▼                                        ▼                     ▼
              ┌─────────────────────────┐         ┌───────────────────────────┐  ┌────────────────────┐
              │  AgentExecutor (Flow)   │         │  Memory (Unified)         │  │  EventBus          │
              │  experimental/agent_    │         │  memory/unified_memory.py │  │  events/event_bus  │
              │  executor.py            │         │  unified_memory.py:76     │  │  + listeners       │
              │  + Flow @start/@listen  │         │  + Storage backend        │  │                    │
              │  + State (AgentExecutor │         │  (LanceDB / Qdrant /      │  │                    │
              │  State)                 │         │   factory-replaceable)    │  │                    │
              └────────────┬────────────┘         └───────────────────────────┘  └────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐         ┌───────────────────────────┐
              │  LLM (BaseLLM + providers)│         │  ToolUsage (parsing)      │
              │  llms/base_llm.py        │         │  tools/tool_usage.py      │
              │  + litellm-style adapter │         │  + CacheHandler           │
              │  + streaming            │         │  + ToolFailure            │
              └─────────────────────────┘         └───────────────────────────┘
                                                                       │
                                                                       ▼
                                                ┌───────────────────────────┐
                                                │  BaseTool / BaseAgentTool │
                                                │  tools/base_tool.py       │
                                                │  _run (388)               │
                                                │  + AgentTools.factory     │
                                                │  (DelegateWork/AskQuest)  │
                                                └───────────────────────────┘
```

## 2. Concrete Module Map

| Layer | File | Symbol | Purpose |
|---|---|---|---|
| Container | `crew.py` | `Crew` (Pydantic) | Kickoff / Train / Async / Streaming / Checkpoint |
| Orchestration | `process.py` | `Process` (str Enum) | `sequential` / `hierarchical` / `consensual` (TODO) |
| Orchestration | `crew.py` | `_run_sequential_process` (1509) | `_execute_tasks(self.tasks)` |
| Orchestration | `crew.py` | `_run_hierarchical_process` (1513) | `_create_manager_agent()` + `_execute_tasks` |
| Orchestration | `crew.py` | `_create_manager_agent` (1518) | 创建或配置 `Agent(allow_delegation=True, tools=AgentTools(agents).tools())` |
| Task | `task.py` | `Task._execute_core` (806) | PRE_STEP → execute_task → POST_STEP → guardrail → emit |
| Task | `task.py` | `Task.execute_sync` (585) | 同步入口 |
| Task | `task.py` | `Task.execute_async` (609) | 异步入口（Thread + contextvars） |
| Task | `task.py` | `Task.aexecute_sync` (640) | async/await 入口 |
| Agent | `agent/core.py` | `Agent.execute_task` (822) | 准备 prompt → 注入 Memory/Knowledge → emit StartedEvent → 调 `agent_executor.invoke` |
| Agent | `agent/core.py` | `_execute_with_timeout` (893) | ThreadPoolExecutor.submit + `.result(timeout=...)` |
| Agent | `agent/core.py` | `_execute_without_timeout` (946) | `agent_executor.invoke({"input": ..., "tool_names": ..., "tools": ..., "ask_for_human_input": ...})` |
| Agent | `agent/core.py` | `aexecute_task` (963) | asyncio 版本 |
| AgentExecutor | `experimental/agent_executor.py` | `AgentExecutor` (173) | 继承 `Flow[AgentExecutorState]` + `BaseAgentExecutor` |
| AgentExecutor | `experimental/agent_executor.py` | `AgentExecutor.invoke` (2802) | `_setup_messages → kickoff → state.current_answer → _save_to_memory → return output` |
| AgentExecutor | `experimental/agent_executor.py` | `AgentExecutor._invoke_loop` (3273) | 重入 feedback iteration |
| Memory | `memory/unified_memory.py` | `Memory` (76) | `remember / recall / scope / slice / extract_memories / drain_writes` |
| Memory | `memory/storage/factory.py` | `set_memory_storage_factory` (33) | 进程级 setter |
| Memory | `memory/storage/backend.py` | `StorageBackend` (Protocol) | `search / upsert / delete` 等 |
| Memory | `memory/storage/lancedb_storage.py` | `LanceDBStorage` (42) | 内置实现 |
| Memory | `memory/storage/qdrant_edge_storage.py` | `QdrantEdgeStorage` (81) | 内置实现 |
| Tool | `tools/base_tool.py` | `BaseTool` (103) | `_run (388) / async_run` + Pydantic args schema |
| Tool | `tools/tool_usage.py` | `ToolUsage` (84) | 解析 / 调用 / 重复检测 / 限制 |
| Tool | `tools/tool_failure.py` | `ToolFailure` / `ToolFailurePolicy` | 失败策略 |
| Tool | `tools/agent_tools/agent_tools.py` | `AgentTools` (16) | 工厂：生成 DelegateWork / AskQuestion |
| Tool | `tools/agent_tools/base_agent_tools.py` | `BaseAgentTool` (15) | Agent 工具基类 |
| Event | `events/event_bus.py` | `crewai_event_bus` | 单例 bus |
| Event | `events/base_events.py` | `BaseEvent` | 事件基类 |
| Event | `events/base_event_listener.py` | `BaseEventListener` | 监听器基类 |
| Hook | `hooks/dispatch.py` | `dispatch / InterceptionPoint` | PRE_STEP / POST_STEP |

## 3. Five-Cardinality Structure

CrewAI 的核心抽象是 **「Crew × Agent × Task × Tool × Memory」** 五张卡片。每一张都有明确的入/出口：

```python
# 用户代码形态
crew = Crew(
    agents=[agent1, agent2],          # Agent[]
    tasks=[task1, task2],             # Task[]
    process=Process.sequential,       # Process
    memory=True,                      # Memory
    manager_agent=Optional[Agent],    # hierarchical
    manager_llm=Optional[str|BaseLLM],# hierarchical
)
crew.kickoff(inputs={"topic": "..."})
```

Crews → Agents (执行单元) → Tasks (工作) → Tools (能力) → Memory (持久化外部状态) → Events (可观测)。

## 4. Process Orchestrator

详见 [process-orchestration-l3.md](process-orchestration-l3.md)。

要点：
- `Process` 是 `str` 枚举：`sequential = "sequential"` / `hierarchical = "hierarchical"` / `consensual` 显式 `TODO`（[process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11)）。
- `Crew.kickoff` dispatch（[crew.py:1051-1058](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1051-L1058)）：sequential → `_run_sequential_process`；hierarchical → `_run_hierarchical_process`；其他 → `NotImplementedError`。
- 两者殊途同归到 `_execute_tasks(self.tasks)`（[crew.py:1558](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1558)）。
- Hierarchical 路径先 `_create_manager_agent`（[crew.py:1518](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1518)），把 `AgentTools(agents).tools()` 注入 manager 的 `tools` 字段（即 DelegateWork / AskQuestion）。
- `Task.async_execution = True`（[crew.py:1597-1606](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1597-L1606)）→ 走 `task.execute_async()`（thread + contextvars）→ `Future` 等待 join。

## 5. Agent Execute Loop

详见 [tool-agent-as-tool-l3.md](tool-agent-as-tool-l3.md) § 工具调用侧。

要点：
- `Agent.execute_task`（[agent/core.py:822](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L822)）四个阶段：
  1. `_prepare_task_execution` (540) → `_finalize_task_prompt` (568) → 注入 `Memory.retrieve` + `Knowledge.query` 上下文。
  2. `validate_max_execution_time`（默认 None）→ 决定走 `_execute_with_timeout` 还是 `_execute_without_timeout`。
  3. `_execute_with_timeout` (893) 用 `ThreadPoolExecutor.submit(ctx.run, ...)` + `.result(timeout=…)` 兜底；超时转 `TimeoutError`。
  4. `_execute_without_timeout` (933) → `agent_executor.invoke({"input": ..., "tool_names": ..., "tools": ..., "ask_for_human_input": ...})` → 返回 `{"output": ...}`。
- `agent_executor`（[experimental/agent_executor.py:173](../../sources/crewai/lib/crewai/src/crewai/experimental/agent_executor.py#L173)）继承 `Flow[AgentExecutorState]`，使用 `kickoff()` 驱动 Flow 编排（典型 `@start / @listen / @router` 节点）。
- 状态：`_setup_messages → kickoff → state.current_answer → _save_to_memory`（[agent_executor.py:2802-2892](../../sources/crewai/lib/crewai/src/crewai/experimental/agent_executor.py#L2802-L2892)）。
- 锁：`_execution_lock + _is_executing` 拒绝同一 executor 实例的并发 invoke（[agent_executor.py:2821-2827](../../sources/crewai/lib/crewai/src/crewai/experimental/agent_executor.py#L2821-L2827)）。

## 6. LLM 抽象

- `BaseLLM`（[llms/base_llm.py](../../sources/crewai/lib/crewai/src/crewai/llms/base_llm.py)）+ `providers/` 子包（OpenAI / Anthropic / Gemini / Bedrock / Groq / Ollama / 等）。
- `llm.py`（2721 行）持有 `LLM` 单例 + helpers（含 `create_llm`、`get_llm`、fallback 链）。
- **关键缺口**：源码中存在 `BaseLLM` + 多个 provider，但**没有发现「Fall-back 协调 / Routing 决策」**的中央模块。Provider 切换基本在 `llm.py` 的工厂 / `BaseLLM` 内部处理；用户可能通过 `with_llm(llm)` 覆盖。
- **结论**：CrewAI 的 LLM 抽象是 **「Provider 矩阵 + 工厂」**，不是 **「Router / Fallback / Cost-aware Selection」**。对 RoboThree 的可借鉴度低于对 Memory / Process 的可借鉴度。

## 7. Tool 抽象

详见 [tool-agent-as-tool-l3.md](tool-agent-as-tool-l3.md)。

要点：
- `BaseTool` (103) + Pydantic args schema + `@tool` 装饰器。`_run` (388) / `async_run`。
- `ToolUsage` 解析 LLM 输出 → 决定调用哪个工具 → 执行 → 收集结果 → 反馈给 LLM。
- `CacheHandler` 缓存同 prompt 的工具调用结果。
- `ToolFailure` / `ToolFailurePolicy` / `ToolFailureReason` / `ToolFailureRecord` 失败策略（重试 / 替换 / 终止）。
- `BaseAgentTool` (15) 是 Agent-互调工具的基类；`AgentTools.tools()` (22) 为 Manager 注入 `DelegateWorkTool` / `AskQuestionTool`。
- `MCP` 桥接（[mcp/](../../sources/crewai/lib/crewai/src/crewai/mcp/)）通过 `mcp_native_tool.py` / `mcp_tool_wrapper.py`；未深入。

## 8. Memory 抽象

详见 [memory-system-l3.md](memory-system-l3.md)。

要点：
- 单一 `Memory` 对象（[unified_memory.py:76](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L76)）承载四类（Short / Long / Entity / Knowledge）—— **不是 4 个独立对象**。
- `Memory` 暴露 `remember(content, scope, categories, importance, source, private, ...)` / `recall(query, scope, limit, min_score, ...)` / `scope(path)` / `slice(filters)` / `extract_memories(text)` / `drain_writes()` / `forget(id)` / `reset(scope)`。
- `StorageBackend` Protocol（[storage/backend.py:45](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L45)）+ `set_memory_storage_factory`（[storage/factory.py:33](../../sources/crewai/lib/crewai/src/crewai/memory/storage/factory.py#L33)）允许注入自定义 backend。
- 内置 backend：`LanceDBStorage` (default) / `QdrantEdgeStorage` (for spec `"qdrant-edge"`)。
- 写入是 `Future` + 后台编码（[unified_memory.py:297](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L297)）：`_submit_save` → `concurrent.futures.ThreadPoolExecutor` → `_on_save_done` 回调；`drain_writes` (350) 用于在 Crew 退出前同步等待。
- 召回：`_RECALL_OVERSAMPLE_FACTOR = 2`（[types.py:26](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L26)）：先多取再过滤 → `compute_composite_score` 折衷评分。

## 9. Permission / Security（主报告）

**CrewAI 没有中心化的 `Permission` / `Sandbox` 模块**：

- `security/` 目录：
  ```bash
  ls lib/crewai/src/crewai/security/
  ```
  （需要再确认；初步 grep 表明含 `fingerprint.py` / `test_security.py` 等，但**不**包含 `permission.py` / `sandbox.py`。）
- `BaseTool` 子类（包括 `CodeInterpreterTool` / `FileReadTool` / `ShellExecTool` 等）**运行在主进程**，无沙箱。
- `CodeInterpreterTool`（推测在 `lib/crewai-tools/` 中）通过 `subprocess` / `eval` 隔离弱（**需要运行时验证**）。
- 创建 Manager Agent 时（[crew.py:1547-1548](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1547-L1548)）**显式禁用 manager 自带工具**：如果用户给 `manager_agent.tools` 传了任何工具，源码会强制 `manager.tools = []` 并 `raise Exception("Manager agent should not have tools")`（[crew.py:1529](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1529)）。
- Manager Agent 的工具是 **`AgentTools(agents).tools()`**（[crew.py:1537](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1537)）—— 即 `DelegateWorkTool` + `AskQuestionTool`，**只能调用其他 Agent**，不能直接执行 Shell / 文件 / 网络。
- **结论**：CrewAI 的安全模型是 **「Manager 与子 Agent 间通过 Agent-as-Tool 间接调度 + User 不可越过 Agent 直接执行 Shell」**。但是 **子 Agent 本身**仍然无沙箱。这是一个「轻沙箱」方案。

**Permission 系统**：

- **未发现** 用户级 `Permission` 配置。Agent 完全是 autonomous（除非 `human_input = True`）。
- `human_input = True`（[agent/core.py:951](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L951)）→ `inputs["ask_for_human_input"] = True` → Executor 走 `_handle_human_feedback`（[agent_executor.py:2873](../../sources/crewai/lib/crewai/src/crewai/experimental/agent_executor.py#L2873)）。
- `guardrail` / `_guardrails` (Task 层) 是输出校验 + 重试机制（[task.py:889-905](../../sources/crewai/lib/crewai/src/crewai/task.py#L889-L905)），不是权限拦截。

**对照 RoboThree**：

- 中心化 `Permission` / `Sandbox` 缺失 → **REJECT** 给 RoboThree「直接复用」；但 **Agent-as-Tool 隔离 Manager** 是 **ADOPT** 候选。
- `human_input` 机制 → **ADOPT** 候选（Pin 到 executor 输入 + 在 result 后插入 human feedback）。

## 10. Event System

- `crewai_event_bus` 单例（[events/event_bus.py](../../sources/crewai/lib/crewai/src/crewai/events/event_bus.py)）。
- `BaseEvent` 子类（如 `CrewKickoffStartedEvent` / `AgentExecutionStartedEvent` / `TaskStartedEvent` / `TaskCompletedEvent` / `ToolUsageStartedEvent` / `ToolUsageFinishedEvent`）。
- `BaseEventListener`（[events/base_event_listener.py](../../sources/crewai/src/crewai/events/base_event_listener.py)） + 各种 `events/listeners/` 实现。
- `crewai_event_bus._enter_runtime_scope / _exit_runtime_scope`（[crew.py:1047 / 1086](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1047-L1086)）—— **runtime scope** 隔离事件订阅，避免 crew 嵌套时事件错乱。
- 类型化订阅：见 `handler_graph.py`（[events/handler_graph.py](../../sources/crewai/lib/crewai/src/crewai/events/handler_graph.py)）。

## 11. Hooks / Interception

- `hooks/dispatch.py` 提供 `InterceptionPoint` + `dispatch(point, ctx)`。
- `StepContext`（[hooks/contexts.py](../../sources/crewai/lib/crewai/src/crewai/hooks/contexts.py)）携带 `kind / step_name / agent / task / payload / output`。
- `Task._execute_core` 早（在 `agent.execute_task` 之前）dispatch `InterceptionPoint.PRE_STEP`（[task.py:846](../../sources/crewai/lib/crewai/src/crewai/task.py#L846)）；在 guardrail 之后 dispatch `InterceptionPoint.POST_STEP`（[task.py:916](../../sources/crewai/lib/crewai/src/crewai/task.py#L916)）。
- Hooks 是 **in-process decorator** 风格，不是 OpenAI Hooks 那种 protocol-by-spec。

## 12. Flow / LiteAgent

- `flow/`（[flow/](../../sources/crewai/lib/crewai/src/crewai/flow/)）是 `@start / @listen / @router` 装饰器式 DAG。**与 Crew / Task 解耦**，是另一种编排方式。
- `lite_agent.py`（1059 行）是 **单 Agent 入口**（无需 Crew），适合嵌入到 Flow / 已有应用中。
- `experimental/` 含多个实验 API（`AgentExecutor` 等）；尽管在 `experimental/` 目录，但引用计数显示是当前主要实现。

## 13. Multi-Agent 协作模式概览

| 模式 | 实现 | 来源 |
|---|---|---|
| **Sequential** | `Process.sequential` → `_execute_tasks` 顺序循环 | [crew.py:1051 / 1509](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1051-L1509) |
| **Hierarchical** | `Process.hierarchical` → `_create_manager_agent` → Manager 持 `AgentTools(agents).tools()` | [crew.py:1053 / 1513 / 1518](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1053-L1518) |
| **Async** | `Task.async_execution = True` → `execute_async` (Future + Thread) | [crew.py:1597-1606](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1597-L1606) + [task.py:609](../../sources/crewai/lib/crewai/src/crewai/task.py#L609) |
| **Consensual** | **TODO** | [process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11) |
| **Flow (DAG)** | `@start / @listen / @router` | [flow/](../../sources/crewai/lib/crewai/src/crewai/flow/) |
| **Agent-as-Tool** | `AgentTools.tools()` + `BaseAgentTool` | [agent_tools/agent_tools.py:22](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py#L22) |
| **Multi-Crew** | `Crew.kickoff_for_each` (1091) | [crew.py:1091](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1091) |
| **A2A** | `a2a/`（推测 Google A2A 协议） | [a2a/](../../sources/crewai/lib/crewai/src/crewai/a2a/) |

## 14. 调度边界 / 进程模型

- **单进程**：`Crew` / `Task` / `Agent` 全部运行在主进程内。
- **同进程线程**：`Task.execute_async` 用 `threading.Thread` + `contextvars.copy_context`（[task.py:617-622](../../sources/crewai/lib/crewai/src/crewai/task.py#L617-L622)）。
- **`ThreadPoolExecutor`**：Agent 超时（[agent/core.py:909-913](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L909-L913)） + Memory 写入（[unified_memory.py:297](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L297)）。
- **没有跨进程 / 跨主机** 的 native 调度。**没有 sibling isolation**。

## 15. 与 RoboThree 现有认知的对照

| 维度 | CrewAI | RoboThree 现状（自述） |
|---|---|---|
| 进程模型 | 单进程 + 线程 | （待确认） |
| 中心化 Permission | ❌ | （待确认） |
| 沙箱 | ❌ 主进程 | （待确认） |
| Memory 抽象 | 单一 + storage factory | （待确认） |
| Tool 抽象 | BaseTool + Agent-as-Tool | （待确认） |
| Skills | `skills/` 目录存在 | （待确认） |
| Hooks | `hooks/dispatch.py` | （待确认） |
| MCP | `mcp/` 桥接 | （待确认） |
| A2A | `a2a/` 协议 | （待确认） |
| Process | `Process` 枚举（first-class） | （待确认） |

> **注**：RoboThree 现状的具体细节需要后续确认；本表格仅占位。

## 16. 已知风险 / 缺口

| 风险 | 位置 | 严重度 |
|---|---|---|
| 无中心化 Permission | 全局 | 高 |
| 无子 Agent 沙箱 | Agent execute_task | 高 |
| Code Interpreter 隔离强度 | `crewai-tools`（未深入） | 中（待确认） |
| Manager 永不为失败 agent 提供兜底工具 | [crew.py:1529](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1529) | 低（设计约束） |
| Consensual Process TODO | [process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11) | 低（未实现） |
| Memory 持久化 backend 切换 | [storage/factory.py:33](../../sources/crewai/lib/crewai/src/crewai/memory/storage/factory.py#L33) | 低（设计可控） |
| 跨任务结果回写 | [crew.py:1507](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1507) `_task_output_handler.update` | 中（依赖 IO） |
| Tool 输出截断 / 长度限制 | `tool_usage.py` `_should_remember_format` | 中（待深入） |
