# CrewAI — Multi-Agent Orchestration & Process (L3 Deep Dive)

> **机制选型依据**：Crew / Agent / Task / Process 是 CrewAI 的核心交付；与其他 Multi-Agent 框架（LangGraph / AutoGen / OpenAI Swarm）最显著差异是「**Process 是 first-class 概念 + Manager LLM 通过 Agent-as-Tool 间接调度子 Agent**」。Consensual 流程在源码顶端显式 `TODO`。

## 1. 核心数据结构

### 1.1 `Process` 枚举（[process.py](../../sources/crewai/lib/crewai/src/crewai/process.py)）

```python
# lib/crewai/src/crewai/process.py:1-11
from enum import Enum

class Process(str, Enum):
    """
    Class representing the different processes that can be used to tackle tasks
    """

    sequential = "sequential"
    hierarchical = "hierarchical"
    # TODO: consensual = 'consensual'
```

只有 2 个实现 + 1 个 TODO。**Consensual Process 在源码中不存在实现**：
- 没有任何 `if self.process == Process.consensual` 分支。
- 任何显式 `consensual` 字符串会落到 `Crew.kickoff:1056` 的 `NotImplementedError`（[crew.py:1056-1058](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1056-L1058)）。

### 1.2 `Crew` 字段（[crew.py:179 类定义](../../sources/crewai/lib/crewai/src/crewai/crew.py#L179)）

```python
class Crew(FlowTrackable, BaseModel):
    agents: list[BaseAgent]
    tasks: list[Task]
    process: Process = Process.sequential
    manager_agent: Optional[BaseAgent] = None
    manager_llm: Optional[Union[str, BaseLLM, Any]] = None
    memory: Union[bool, Memory] = False
    # ...
```

### 1.3 `Task` 关键字段（[task.py](../../sources/crewai/lib/crewai/src/crewai/task.py)）

- `agent: BaseAgent | None` — 任务绑定 Agent
- `async_execution: bool = False` — 异步执行
- `context: list[str] | NOT_SPECIFIED` — 上下文（之前哪些任务的结果）
- `output_pydantic / output_json / output_file / guardrail / guardrails`
- `human_input: bool = False` — 启用人工反馈

### 1.4 `Agent` 关键字段（[agent/core.py:179 `class Agent`](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L179)）

- `role / goal / backstory` — 角色三件套
- `llm: Optional[Union[str, BaseLLM, Any]]` — LLM
- `tools: list[BaseTool] | None` — 工具集
- `allow_delegation: bool = False` — **是否允许 delegation**（关键开关）
- `allow_code_execution: bool = False`
- `memory: bool = False` — 私有 Memory
- `max_execution_time: int | None` — 单次执行超时

## 2. 完整调用链：从 `Crew.kickoff` 到子 Agent 执行

### 2.1 主链路（Synchronous Sequential）

```text
Crew.kickoff(inputs)                                 [crew.py:992]
  └─ if self.process == Process.sequential:
       result = self._run_sequential_process()       [crew.py:1051 / 1509]
       └─ self._execute_tasks(self.tasks)            [crew.py:1558]
            ├─ for task_index, task in enumerate(tasks):
            │   ├─ prepare_task_execution(...)       [crews/utils.py:118]
            │   │   ├─ agent_to_use = crew._get_agent_to_use(task)  [crew.py:1714]
            │   │   │   └─ if process == Process.hierarchical: return self.manager_agent
            │   │   │      else: return task.agent
            │   │   ├─ tools_for_task = task.tools or agent_to_use.tools or []
            │   │   └─ tools_for_task = crew._prepare_tools(agent, task, tools) [crew.py:1645]
            │   │         ├─ if agent.allow_delegation and process == hierarchical:
            │   │         │     tools = self._update_manager_tools(task, tools)  [crew.py:1853]
            │   │         │       └─ _inject_delegation_tools(tools, task.agent, [task.agent])
            │   │         │            └─ task.agent.get_delegation_tools(agents)
            │   │         ├─ elif agent.allow_delegation:
            │   │         │     tools = self._add_delegation_tools(task, tools)  [crew.py:1820]
            │   │         │       └─ agents_for_delegation = [a for a in self.agents if a != task.agent]
            │   │         │       └─ _inject_delegation_tools(tools, task.agent, agents_for_delegation)
            │   │         ├─ if agent.allow_code_execution: tools += code tools
            │   │         ├─ if agent.multimodal: tools += multimodal tools
            │   │         ├─ if agent.apps: tools += platform tools
            │   │         ├─ if agent.mcps: tools += mcp tools
            │   │         ├─ if memory: tools += memory tools
            │   │         └─ if files: tools += file tools
            │   ├─ if task is ConditionalTask:
            │   │     skipped = self._handle_conditional_task(task, ...)
            │   │     if skipped: continue
            │   ├─ if task.async_execution:
            │   │     future = task.execute_async(agent, context, tools)  [task.py:609]
            │   │     futures.append((task, future, task_index))
            │   └─ else:
            │       if futures: → wait on Futures (join)
            │       task.execute_sync(agent, context, tools)  [task.py:585]
            │       └─ _execute_core(...)  [task.py:806]
            │            ├─ PRE_STEP hook
            │            ├─ agent.execute_task(task, context, tools)  [agent/core.py:822]
            │            ├─ guardrail
            │            ├─ POST_STEP hook
            │            └─ emit TaskCompletedEvent
            └─ if futures: → join remaining futures
```

### 2.2 Hierarchical 链路

```text
Crew.kickoff(inputs)
  └─ if self.process == Process.hierarchical:
       result = self._run_hierarchical_process()      [crew.py:1053 / 1513]
       └─ self._create_manager_agent()              [crew.py:1518]
            ├─ if self.manager_agent is not None:
            │     ├─ manager = self.manager_agent
            │     ├─ manager.allow_delegation = True  (forced)
            │     └─ if manager.tools is not None and len(manager.tools) > 0:
            │         ├─ log warning
            │         ├─ manager.tools = []
            │         └─ raise Exception("Manager agent should not have tools")  [crew.py:1529]
            └─ else:
                 ├─ self.manager_llm = create_llm(self.manager_llm)
                 ├─ manager = Agent(
                 │     role = i18n("hierarchical_manager_agent", "role"),
                 │     goal = i18n("hierarchical_manager_agent", "goal"),
                 │     backstory = i18n("hierarchical_manager_agent", "backstory"),
                 │     tools = AgentTools(agents=self.agents).tools(),  [agent_tools.py:22]
                 │     allow_delegation = True,
                 │     llm = self.manager_llm,
                 │     verbose = self.verbose,
                 │ )
                 └─ self.manager_agent = manager
       └─ return self._execute_tasks(self.tasks)
```

Hierarchical 路径中，`_get_agent_to_use` 总是返回 `manager_agent`（[crew.py:1714-1717](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1714-L1717)），所以 Manager Agent 跑过所有 Task，每个 Task 的 `tools` 列表里只有 `DelegateWorkTool` + `AskQuestionTool`（+ manager 自己的 Manager agent 工具）。

### 2.3 子 Agent 通过 Agent-as-Tool 被 Manager 调用

```text
Manager Agent (running execute_task)
  └─ LLM outputs tool_call: DelegateWorkTool(task=..., context=..., coworker="Research Analyst")
       └─ DelegateWorkTool._run(task, context, coworker)  [delegate_work_tool.py:22]
            └─ coworker = self._get_coworker(coworker, **kwargs)  [base_agent_tools.py:38]
            └─ self._execute(coworker, task, context)  [base_agent_tools.py:46]
                 ├─ sanitized_name = self.sanitize_agent_name(agent_name)
                 │   (`" `"→single space, lowercase, strip quotes)
                 ├─ agent = next(
                 │     a for a in self.agents
                 │     if self.sanitize_agent_name(a.role) == sanitized_name
                 │ )
                 ├─ task_with_assigned_agent = Task(
                 │     description=task,
                 │     agent=selected_agent,
                 │     expected_output=i18n("manager_request"),
                 │ )
                 └─ return selected_agent.execute_task(task_with_assigned_agent, context)
                      └─ ... → Agent Executor → LLM → Tool → Result → return string
```

**关键观察**：
- Manager 的子 Agent 列表在 Manager 创建时**已经固定**（[crew.py:1537: `AgentTools(agents=self.agents).tools()`](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1537)），运行期间不可变。
- 子 Agent 匹配是 **role 字符串的规范匹配**（`casefold` + `strip quotes`），不是 ID 匹配。
- Manager 不能直接执行任何工具（[crew.py:1529](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1529)）—— **「间接调度」** 模式。

### 2.4 Conditional Task

```python
# lib/crewai/src/crewai/tasks/conditional_task.py:14
class ConditionalTask(Task):
    def __init__(self, *, condition: Callable, ...):
        ...
```

Conditional Task 在 `_handle_conditional_task`（[crew.py:1629](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1629)）处理：
- 若 `condition` 满足 → 跳过（不进入 task loop）
- 若 `condition` 不满足 → 正常执行

`check_conditional_skip` 委托到 `crews/utils.py:180`，**逻辑简单**：基于前序 Task output 决定是否执行。

### 2.5 Async Task Execution

```python
# lib/crewai/src/crewai/task.py:609-623
def execute_async(self, agent, context, tools) -> Future[TaskOutput]:
    future: Future[TaskOutput] = Future()
    ctx = contextvars.copy_context()
    threading.Thread(daemon=True, target=ctx.run, args=(self._execute_task_async, agent, context, tools, future)).start()
    return future
```

- `Future` + `threading.Thread` + `contextvars.copy_context` — **同一进程内线程池**，非跨进程。
- 主线程在每个 sync task 之前先 `if futures:` 等待 join（[crew.py:1608-1610](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1608-L1610)）。
- `daemon=True` → 进程退出时立即终止。
- 对比 LangGraph 的 `Pregel` / `Superstep` 模型，**CrewAI 的 async task 异常朴素**。

## 3. 关键矩阵（Process × Agent 行为）

| 条件 | Sequential | Hierarchical |
|---|---|---|
| `_get_agent_to_use(task)` | `task.agent` | `self.manager_agent` |
| `_prepare_tools` 中 `allow_delegation` | `_add_delegation_tools(task, tools)`（子 Agent 互调） | `_update_manager_tools(task, tools)`（Manager 调度所有 Agent） |
| `_prepare_tools` 中 Manager 的 tools | N/A | `AgentTools(agents).tools()`（强制重置） |
| `_create_manager_agent` | 跳过 | 创建 Manager（用户提供 / 自动生成） |
| `consensual` 分支 | `NotImplementedError` | `NotImplementedError` |

## 4. Manager 实际决策机制

### 4.1 Manager 的 LLM 看到什么

Manager = `Agent(role="...", goal="...", backstory="...", allow_delegation=True, tools=[DelegateWorkTool, AskQuestionTool])`。

- 系统 Prompt 由 i18n 模板 (`hierarchical_manager_agent.role / goal / backstory`) 拼出（[crew.py:1534-1536](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1534-L1536)）。
- 工具描述由 `I18N_DEFAULT.tools("delegate_work").format(coworkers=coworkers)` 拼出（[agent_tools/agent_tools.py:30](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py#L30)）。`coworkers` 是所有 Agent 的 `role` 字符串 join。
- 所以 Manager 看到的工具 schema 是：
  - `Delegate work to coworker`（[delegate_work_tool.py](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/delegate_work_tool.py)）
  - `Ask question to coworker`（[ask_question_tool.py](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/ask_question_tool.py)）
  - 两者 args schema 都有 `task/question / context / coworker` 字段。

### 4.2 Manager 的 LLM 决策出 `DelegateWorkTool(task=..., coworker="X")` 之后会怎样

- Tool 解析 → `DelegateWorkTool._run(task, context, coworker)` → `BaseAgentTool._execute(coworker, task, context)`。
- 构造新 `Task(description=task, agent=selected_agent, expected_output=i18n("manager_request"))`（[base_agent_tools.py:112-116](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L112-L116)）。
- `selected_agent.execute_task(task_with_assigned_agent, context)`。
- 子 Agent 的 `execute_task` 走完整链路（包含 `_prepare_task_execution` → `agent_executor.invoke`）。
- **子 Agent 又可以递归调用它的 Agent-as-Tool**（如果 `allow_delegation`），但 Manager 已经限制了 `manager_agent` 自带工具，所以**递归深度有限**。

### 4.3 Manager 决策有误的容错

- 子 Agent 找不到时的字符串：
  ```python
  # base_agent_tools.py:99-108
  I18N_DEFAULT.errors("agent_tool_unexisting_coworker").format(
      coworkers="\n".join([f"- {sanitize_agent_name(agent.role)}" for agent in self.agents]),
      error=f"No agent found with role '{sanitized_name}'",
  )
  ```
- 子 Agent 抛异常 → 转换为 `I18N_DEFAULT.errors("agent_tool_execution_error").format(...)`（[base_agent_tools.py:121-124](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L121-L124)）。
- ⚠ **没有 retry / backoff 机制**——Manager 收回错误后由 LLM 决定下一步动作。

## 5. 全局状态 / 持久化

### 5.1 Task output sequence

`task_outputs: list[TaskOutput]` 在 `_execute_tasks` 内累积（[crew.py:1578-1607](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1578-L1607)），每位 task 完成后追加到该列表。

`_get_context(task, task_outputs)`（[crew.py:1865-1874](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1865-L1874)）：
- `task.context == NOT_SPECIFIED` → 聚合**所有**前序 task 的 raw 输出。
- `task.context == []` → 没有上下文。
- `task.context == [task_id1, task_id2, ...]` → 只聚合指定 task 的 raw 输出。

### 5.2 Task output 持久化

`_task_output_handler.update(task_index, log)`（[crew.py:1507](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1507)）—— `KickoffTaskOutputsSQLiteStorage` (kickoff 生命周期内临时缓存，[storage/kickoff_task_outputs_storage.py](../../sources/crewai/lib/crewai/src/crewai/memory/storage/kickoff_task_outputs_storage.py))。

### 5.3 Crew 级别 state

`state/` 目录（[state/](../../sources/crewai/lib/crewai/src/crewai/state/)）提供 crew-scoped state —— 与 Flow (`@start / @listen`) 协同工作。

## 6. 失败 / 取消 / 恢复路径

### 6.1 失败

| Layer | 失败处理 | 源码 |
|---|---|---|
| Task._execute_core | `try/except → TaskFailedEvent.emit → re-raise` | [task.py:954-960](../../sources/crewai/lib/crewai/src/crewai/task.py#L954-L960) |
| Agent.execute_task | `try/except → AgentExecutionErrorEvent.emit → _handle_execution_error` | [agent/core.py:878-891](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L878-L891) |
| AgentExecutor.invoke | `try/except → handle_unknown_error(PRINTER, e) → raise` | [agent_executor.py:2879-2892](../../sources/crewai/lib/crewai/src/crewai/experimental/agent_executor.py#L2879-L2892) |
| Manager delegation | Convert to error string → tools result | [base_agent_tools.py:121-124](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L121-L124) |
| Crew.kickoff | `try/except → CrewKickoffFailedEvent.emit → re-raise` | [crew.py:1068-1078](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1068-L1078) |

### 6.2 取消

**没有中心化 cancel 机制**。
- `max_execution_time` → `ThreadPoolExecutor.submit(...).result(timeout=...)`（[agent/core.py:909-919](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L909-L919)）兜底。
- 超时：`future.cancel()`（不一定立即生效，因为代码可能在 IO 阻塞）→ `raise TimeoutError` → `AgentExecutionErrorEvent.emit` → `_handle_execution_error`（仅展示错误，不自动重试，除非用户显式 catch）。
- `task.async_execution` 的 `threading.Thread(daemon=True)` 没有 cancel 机制。

### 6.3 恢复

`kickoff(from_checkpoint=...)`：
- `apply_checkpoint(self, from_checkpoint)`（[crew.py:1010](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1010)）。
- `Checkpoint` / `CheckpointConfig` 类（推测在 `utilities/checkpoint.py`）—— **未深入**。
- replay 路径：`prepare_task_execution` 中 `if start_index is not None and task_index < start_index: task_outputs.append(task.output); ... should_skip=True`（[crews/utils.py:143-152](../../sources/crewai/lib/crewai/src/crewai/crews/utils.py#L143-L152)）。

### 6.4 错误恢复策略

- **Agent 级**：`max_retries`（[task.py:582](../../sources/crewai/lib/crewai/src/crewai/task.py#L582)）+ `guardrail_max_retries` 区分：guardrail 失败最大重试数。
- **Tool 级**：`ToolFailurePolicy` / `ToolFailureReason` / `ToolFailureRecord`（[tools/tool_failure.py](../../sources/crewai/lib/crewai/src/crewai/tools/tool_failure.py)）—— 失败时可重试 / 替换 / 终止。
- **Manager delegation**：**没有 retry 机制**——失败直接返回错误字符串，由 LLM 重新决策。

## 7. 关键决策矩阵（Process × Tools × Memory）

| 决策点 | Sequential | Hierarchical |
|---|---|---|
| Manager Agent 创建 | ❌ | ✅（自动 / 用户提供） |
| Manager tools | N/A | `AgentTools(agents).tools()` + error if user-provided |
| 子 Agent.allow_delegation | 决定子 Agent 是否能互调 | 决定子 Agent 是否能互调（但不调 Manager） |
| Manager 决策载体 | — | LLM 调用 DelegateWork / AskQuestion |
| 失败兜底 | `ThreadPoolExecutor.timeout` | 同上 + Manager 收到错误 string |
| Async Task 支持 | ✅ | ✅ |
| Conditional Task 支持 | ✅ | ✅ |

## 8. 风险与边界

| 风险 | 位置 | 严重度 |
|---|---|---|
| Consensual Process 未实现 | [process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11) | 低（设计 TODO） |
| Manager 决策完全依赖 LLM，无 deterministic fallback | [crew.py:1531-1542](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1531-L1542) | 高 |
| Manager 工具不能由用户提供，可能丢失定制能力 | [crew.py:1529](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1529) | 中 |
| 子 Agent 失败仅返回 error string，无 retry | [base_agent_tools.py:121-124](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L121-L124) | 中 |
| role 字符串匹配易踩坑（带特殊字符 / 大小写） | [base_agent_tools.py:80-87](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L80-L87) | 中 |
| cross-task context 走 raw 聚合，无摘要 | [crew.py:1865-1874](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1865-L1874) + [utilities](../../sources/crewai/lib/crewai/src/crewai/utilities/) | 中 |
| Async Task 用 threading + daemon，无最大并发数限制 | [task.py:611-622](../../sources/crewai/lib/crewai/src/crewai/task.py#L611-L622) | 中 |
| 无中心化 cancel 机制 | 全局 | 高 |
| Checkpoint 实际能力未深入 | [crew.py:1010](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1010) | UNKNOWN |

## 9. 对 RoboThree 的五分类建议

详见 [robothree-fit-analysis.md](robothree-fit-analysis.md)。

| 机制 | 分类 | 关键理由 |
|---|---|---|
| **Process 枚举 first-class** | ADOPT | 让编排策略升级为可演进的版本化概念 |
| **Manager LLM 间接调度** | ADAPT | 通过 Agent-as-Tool 隔离 Manager 直接能力；但保留 RoboThree 用户对 Manager 工具的自定义能力 |
| **Agent-as-Tool (DelegateWork/AskQuestion)** | ADOPT | 子 Agent 互调无中心化调度器；role 字符串匹配应改成 ID 匹配 |
| **ConditionalTask** | ADAPT | 简单，但是 good-enough；可考虑扩展为 `condition` linter |
| **Async Task (Thread + Future)** | ADAPT | 简朴可工作；RoboThree 需考虑进程 / 协程 边界 |
| **Manager 必须无自定义工具** | DEFER | 太严格；RoboThree 应用 allowlist 而非 hard 拒绝 |
| **Manager 失败无 retry** | DEFER | 视 RoboThree 决策；可考虑 backoff |
| **Consensual 流程** | DEFER | 源码 TODO，无成熟实现 |
| **crew.py:1529 Exception** | REJECT | 应改成 warning + ignore |
| **Consensual Process** | NEEDS_MORE_EVIDENCE | 良久未实现是否有设计原因？ |

## 10. 关键引用清单

| 引用 | 位置 |
|---|---|
| Crew 入口 | [crew.py:992](../../sources/crewai/lib/crewai/src/crewai/crew.py#L992) |
| _run_sequential_process | [crew.py:1509](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1509) |
| _run_hierarchical_process | [crew.py:1513](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1513) |
| _create_manager_agent | [crew.py:1518](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1518) |
| _execute_tasks | [crew.py:1558](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1558) |
| _get_agent_to_use | [crew.py:1714](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1714) |
| _prepare_tools | [crew.py:1645](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1645) |
| _add_delegation_tools | [crew.py:1820](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1820) |
| _update_manager_tools | [crew.py:1853](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1853) |
| _inject_delegation_tools | [crew.py:1740](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1740) |
| AgentTools.tools() | [agent_tools/agent_tools.py:22](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py#L22) |
| BaseAgentTool._execute | [base_agent_tools.py:46](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L46) |
| DelegateWorkTool._run | [delegate_work_tool.py:22](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/delegate_work_tool.py#L22) |
| AskQuestionTool._run | [ask_question_tool.py:30](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/ask_question_tool.py#L30) |
| Task._execute_core | [task.py:806](../../sources/crewai/lib/crewai/src/crewai/task.py#L806) |
| Task.execute_async | [task.py:609](../../sources/crewai/lib/crewai/src/crewai/task.py#L609) |
| Process 枚举 | [process.py:1-11](../../sources/crewai/lib/crewai/src/crewai/process.py#L1-L11) |
| ConditionalTask | [tasks/conditional_task.py:14](../../sources/crewai/lib/crewai/src/crewai/tasks/conditional_task.py#L14) |
| prepare_task_execution | [crews/utils.py:118](../../sources/crewai/lib/crewai/src/crewai/crews/utils.py#L118) |
| _get_context | [crew.py:1865](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1865) |
| _drain_memory_writes | [crew.py:1887](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1887) |
| _create_crew_output | [crew.py:1919](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1919) |
