# CrewAI — Source Map

> **研究深度**：Level 3
> **方法**：静态源码分析（未运行项目）
> **覆盖范围**：lib/crewai 核心包（6 uv workspace 包中唯一在 L3 内的）+ 入口解析

## 1. Top-Level Layout

```
sources/crewai/                       # uv workspace 根
├── AGENTS.md                          # 项目自身 agent 指令（不可信输入）
├── LICENSE                            # MIT
├── README.md                          # 产品定位 + 快速开始（仅定位引用）
├── pyproject.toml                     # uv workspace 配置
├── lib/
│   ├── cli/                           # `crewai` CLI（uvicorn / deploy / flow）
│   ├── crewai/                        # ←— L3 主要研究对象
│   ├── crewai-core/                   # 核心 service（未深入）
│   ├── crewai-files/                  # File 输入
│   ├── crewai-tools/                  # 第三方工具集（未深入）
│   └── devtools/                      # 开发工具
├── docs/                              # 文档
├── scripts/                           # 杂项
└── conftest.py
```

## 2. Entry Points（真实、非 README 推断）

| 入口 | 路径 | 进入链路 | 备注 |
|---|---|---|---|
| **CLI 启动** | `lib/cli/src/crewai_cli/cli.py` | `crewai run/train/flow/deploy` | 实现 CLI 命令 |
| **程序入口** | `from crewai import Crew, Agent, Task, Process` | `Crew(...)` → `crew.kickoff()` | 用户代码 |
| **Crew 入口** | [lib/crewai/src/crewai/crew.py:992](../../sources/crewai/lib/crewai/src/crewai/crew.py#L992) `Crew.kickoff()` | 包外 API | 主入口 |
| **Crew 异步** | [crew.py:1127](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1127) `Crew.kickoff_async()` | 同上 | |
| **Crew 训练** | [crew.py:940](../../sources/crewai/lib/crewai/src/crewai/crew.py#L940) `Crew.train()` | + `CrewTrainingHandler` | |
| **Agent 同步** | [agent/core.py:822](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L822) `Agent.execute_task()` | ThreadPoolExecutor timeout | |
| **Agent 异步** | [agent/core.py:963](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L963) `Agent.aexecute_task()` | asyncio.wait_for | |
| **Lite Agent** | [lite_agent.py](../../sources/crewai/lib/crewai/src/crewai/lite_agent.py) | 单 Agent 入口，无需 Crew | |
| **Memory 入口** | [memory/unified_memory.py:76](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L76) `Memory()` | 单一 Memory 对象 | |
| **Tool 入口** | [tools/base_tool.py:103](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L103) `BaseTool` | 子类实现 `_run` | |
| **AgentTools** | [tools/agent_tools/agent_tools.py:16](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py#L16) | 自动生成 DelegateWork / AskQuestion | |
| **Flow** | [flow/](../../sources/crewai/lib/crewai/src/crewai/flow/) | `@start / @listen / @router` | DAG 风格 |

## 3. Core Package Layout — `lib/crewai/src/crewai/`

### 3.1 顶层

| Path | File LoC | Purpose |
|---|---|---|
| `__init__.py` | — | 暴露 `Agent, Crew, Task, Process, LLM, Memory` |
| `crew.py` | 2487 | `Crew` 主类（kickoff / train / async / 流式 / checkpoint） |
| `task.py` | 1560 | `Task` / `ConditionalTask` / `_execute_core` |
| `process.py` | 11 | `Process`（sequential / hierarchical / consensusal[TODO]） |
| `lite_agent.py` | 1059 | 绕开 Crew 的单 Agent 入口 |
| `llm.py` | 2721 | `LLM` 单例 + helpers |
| `execution.py` | 70 | `begin_execution / end_execution` 单例 |
| `settings.py` | — | 配置 |
| `plus_api.py` | — | CrewAI+ 商业服务 client |
| `llms/` | 分类 | `BaseLLM` + providers |
| `memory/` | 3275 | 统一 Memory |
| `tools/` | 大 | BaseTool + ToolUsage + AgentTools |
| `agent/` | 2063 | `Agent` 主体 |
| `agents/` | — | `BaseAgent` / `LiteAgent` / etc |
| `tasks/` | — | Task 子类 / `Output` / `Guardrail` |
| `crews/` | — | `CrewOutput` |
| `events/` | — | EventBus + Listeners |
| `flow/` | — | Flow 装饰器 |
| `hooks/` | — | 生命周期钩子 |
| `skills/` | — | Skill 框架 |
| `mcp/` | — | MCP 桥接 |
| `a2a/` | — | Agent-to-Agent 协议 |
| `rag/` | — | RAG 工具 |
| `knowledge/` | — | Knowledge 源 |
| `state/` | — | crew-scoped state |
| `auth/` | — | 鉴权 |
| `experimental/` | — | 实验 API |
| `telemetry/` | — | 匿名统计 |
| `cli/` | — | 内嵌 CLI 命令 |
| `utilities/` | 50+ 子模块 | converter / printer / i18n / logger / paths / streaming / scheduler / rlock / token / 等 |

### 3.2 关键二级目录

#### `memory/`

| Path | LoC | Purpose |
|---|---|---|
| `__init__.py` | 53 | 延迟导入（避免 lancedb 触发） |
| `unified_memory.py` | 1104 | 单一 `Memory` 对象核心 API |
| `memory_scope.py` | 379 | `MemoryScope` / `MemorySlice` 路径 |
| `types.py` | 380 | `MemoryRecord` / `MemoryMatch` / `Score` |
| `encoding_flow.py` | 501 | 后台 Python 编码 + 批量 embedding |
| `recall_flow.py` | 380 | recall + 复合打分 + 过滤 |
| `analyze.py` | 375 | LLM 分析 + 提取记忆 |
| `utils.py` | 103 | 工具 |
| `storage/` | 5 文件 | LanceDB / Qdrant / factory / backend Protocol |

注：`unified_memory.py` 中通过 `MemoryStorageFactory` 进程级 setter（[memory/storage/factory.py:33](../../sources/crewai/lib/crewai/src/crewai/memory/storage/factory.py#L33)）允许注入自定义 backend。

#### `tools/`

| Path | Purpose |
|---|---|
| `base_tool.py` | `BaseTool` + `tool` 装饰器 + `EnvVar` |
| `tool_usage.py` | `ToolUsage` 解析 / 调用 / 缓存 |
| `tool_failure.py` | `ToolFailure` 失败策略 |
| `tool_calling.py` | 工具调用 helper |
| `structured_tool.py` | 结构化工具 |
| `mcp_native_tool.py` | MCP 原生封装 |
| `mcp_tool_wrapper.py` | MCP 包装 |
| `memory_tools.py` | 记忆工具 |
| `cache_tools/` | 缓存工具 |
| `agent_tools/` | **Agent-as-Tool**：`AgentTools` / `DelegateWorkTool` / `AskQuestionTool` |
| `tool_types.py` | 工具类型 |

#### `events/`

| Path | Purpose |
|---|---|
| `event_bus.py` | `crewai_event_bus` 单例 |
| `base_events.py` | `BaseEvent` 基础 |
| `base_event_listener.py` | `BaseEventListener` |
| `event_listener.py` | `EventListener` |
| `event_types.py` | 类型 |
| `event_context.py` | 上下文 |
| `stream_context.py` | 流式上下文 |
| `handler_graph.py` | 类型化订阅图 |
| `depends.py` | 依赖注入 |
| `listeners/` | 各种事件监听器 |
| `types/` | 事件类型分类 |
| `utils/` | 工具 |

#### `utilities/`

| Path | Purpose |
|---|---|
| `prompts.py` | 提示模板 |
| `i18n.py` | 国际化 |
| `logger.py` / `logger_utils.py` | 日志 |
| `converter.py` | 转换器 |
| `printer.py` | 终端输出 |
| `paths.py` | 文件路径 |
| `env.py` | 环境变量 |
| `errors.py` / `exceptions/` | 错误 |
| `serializer.py` / `crew_json_encoder.py` | 序列化 |
| `internal_instructor.py` | Instructor helper |
| `pydantic_schema_utils.py` | Pydantic 工具 |
| `import_utils.py` | 动态导入 |
| `token_counter_callback.py` | Token 计数 |
| `streaming.py` | 流式输出 |
| `rmp_controller.py` | RPM（每分钟请求）控制 |
| `rw_lock.py` | 读写锁 |
| `lock_store.py` | 全局锁仓库 |
| `step_execution_context.py` | 步骤上下文 |
| `guardrail.py` / `guardrail_types.py` | 防护栏 |
| `crew_chat.py` / `crew_chat.py` | 协作聊天 |
| `planner_handler.py` / `planner_types.py` | 规划器 |
| `reasoning_handler.py` | 推理 |
| `training_handler.py` / `training_converter.py` | 训练 |
| `reset_memories.py` | 重置记忆 |
| `task_output_storage_handler.py` | 任务输出存储 |
| `evaluators/` | 评估器 |
| `config.py` | 配置 |
| `constants.py` | 常量 |
| `agent_utils.py` | agent utils |
| `tool_utils.py` | tool utils |
| `formatter.py` | 格式化 |
| `file_handler.py` / `file_store.py` | 文件 |
| `declarative_refs.py` | 声明式引用 |
| `project_utils.py` | 项目 utils |
| `version.py` | 版本 |

#### `flow/`

> `_flow_` 是 CrewAI 提供的「Decorators + Persistence」DAG 抽象（`@start / @listen / @router`）。
> 在 L3 中**不深入**（与 RoboThree 决策无关），但需要识别其存在。

#### `a2a/`, `mcp/`, `skills/`, `hooks/`

- `a2a/`：Agent-to-Agent 协议（推测 Google A2A 协议）。未深入。
- `mcp/`：MCP 桥接（`mcp_native_tool.py` + `mcp_tool_wrapper.py`）。
- `skills/`：Skill 框架（目录存在）。
- `hooks/`：生命周期钩子（目录存在）。

## 4. 主要模块依赖关系（粗）

```
                          ┌───────────────────────┐
                          │       Crew (entry)    │
                          │  crew.py              │
                          └─────────┬─────────────┘
                                    │ kickoff
                                    ▼
                          ┌───────────────────────┐
                          │ Process (sequential   │
                          │  / hierarchical)      │
                          │  process.py / crew.py │
                          └─────┬─────────┬───────┘
                                │         │
              _run_sequential  │         │ _run_hierarchical
                                ▼         ▼
                  ┌────────────────────┐  ┌──────────────────────┐
                  │ Task.execute_sync  │  │ _create_manager_agent│
                  │ task.py            │  │ → AgentTools.tools() │
                  └─────────┬──────────┘  │ (DelegateWork/       │
                            │             │  AskQuestion)        │
                            ▼             └──────────┬───────────┘
                  ┌─────────────────────┐            │
                  │ Agent.execute_task  │◄───────────┘
                  │ agent/core.py       │
                  │ + ThreadPoolExecutor│
                  │   timeout           │
                  └─────────┬───────────┘
                            │
                            ▼
                  ┌─────────────────────┐
                  │ AgentExecutor.invoke│
                  │ + ToolUsage         │
                  │ tools/tool_usage.py │
                  └────┬──────────┬─────┘
                       │          │
                       ▼          ▼
               ┌───────────┐  ┌──────────────┐
               │  LLM call │  │ BaseTool._run│
               │ llms/...  │  │ + AgentTools │
               └───────────┘  └──────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
               ┌────────────────────┐  ┌───────────────────┐
               │ Memory (unified)   │  │ Event Bus emit    │
               │ + LanceDB / Qdrant │  │ 各种 events       │
               │ + Factory          │  └───────────────────┘
               └────────────────────┘
```

## 5. Tool & Agent-as-Tool 拓扑

```
                                BaseTool (base_tool.py)
                                │
                ┌───────────────┼────────────────┐
                ▼               ▼                ▼
            Tool           StructuredTool    Tool subclasses
            (generic)      (Pydantic)        (crewai-tools/...)
                                │
                                ▼
                          MCP-native wrapper
                          (mcp_native_tool.py, mcp_tool_wrapper.py)
                                │
                                ▼
                          BaseAgentTool (agent_tools/base_agent_tools.py)
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
        DelegateWorkTool                AskQuestionTool
        (delegate_work_tool.py)         (ask_question_tool.py)
                │                               │
                ▼                               ▼
        AgentTools (agent_tools.py)      tools() returns
        └─ tools() ──► [delegate, ask]   [BaseTool list]
```

## 6. Memory 拓扑

```
                Memory (统一入口)
                  unified_memory.py:76
                ┌────────┬──────────┬───────────┐
                ▼        ▼          ▼           ▼
        remember()  recall()  scope()/slice()  forget/update/...
                │        │          │
                ▼        ▼          ▼
        EncodingFlow  RecallFlow  MemoryScope/Slice
        (background)  (composite  (path: /company/team/...)
        + Future       scoring)
                │        │
                ▼        ▼
        StorageBackend Protocol
        (storage/backend.py)
                │
       ┌────────┴────────┐
       ▼                 ▼
  LanceDBStorage    QdrantEdgeStorage
  (built-in)        (built-in for "qdrant-edge")

  + 进程级 factory：
    set_memory_storage_factory(fn)
    (storage/factory.py:33)
```

## 7. Event Bus 拓扑

```
crewai_event_bus（单例）
  ├── emit(source, event)            ← 在 agent/core.py, crew.py, task.py 中调用
  ├── handlers（typed 订阅）
  ├── runtime_scope (enter/exit)     ← crew.py:1047-1086（runtime scope）
  └── BaseEventListener 子类
        ├── Tracer
        ├── StreamListener
        └── …（events/listeners/）
```

## 8. 关键调用链速查

| 调用 | 入口 | 终点 |
|---|---|---|
| **User → Crew → Task → Agent → LLM** | `Crew.kickoff()` ([crew.py:992](../../sources/crewai/lib/crewai/src/crewai/crew.py#L992)) | `AgentExecutor.invoke` ([agent/core.py:946](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L946)) |
| **Hierarchical Manager → 子 Agent** | `_create_manager_agent` ([crew.py:1518](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1518)) | `AgentTools.tools()` ([agent_tools/agent_tools.py:22](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py#L22)) |
| **Tool call → 执行** | `ToolUsage.use` ([tool_usage.py:148](../../sources/crewai/lib/crewai/src/crewai/tools/tool_usage.py#L148)) | `BaseTool._run` ([base_tool.py:388](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L388)) |
| **Memory write** | `Memory.remember` ([unified_memory.py:430](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L430)) | `_submit_save` ([unified_memory.py:297](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L297)) → Future |
| **Memory recall** | `Memory.recall` ([unified_memory.py:681](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L681)) | `RecallFlow` + Storage backend |
| **Event emit** | `crewai_event_bus.emit` | `_handlers`（含 listener） |

## 9. 不在 Level 3 范围内的子包

- `lib/crewai-files/`（File 输入处理）
- `lib/crewai-tools/`（150+ 第三方工具集；本研究不深入）
- `lib/crewai-core/`（未深入）
- `lib/cli/`（CLI 本体）
- `lib/devtools/`（开发工具）

仅在「影响 RoboThree 边界」或「依赖已知」时纳入引用。

## 10. Glossary

| 术语 | 含义 |
|---|---|
| **Crew** | 容器：包含若干 Agent、若干 Task、Process、Manager、Memory 等 |
| **Agent** | 角色工作单元：role / goal / backstory / llm / tools / allow_delegation |
| **Task** | 由 Agent 完成的任务：description / expected_output / agent / context / async_execution |
| **Process** | Orchestration 模式：sequential / hierarchical / [consensual TODO] |
| **Manager Agent** | hierarchical 模式下自动创建的 Agent；持 DelegateWork / AskQuestion 工具 |
| **Memory** | 统一记忆对象（Scope / Slice / Record / Match） |
| **Knowledge** | RAG 风格外部知识 |
| **BaseTool** | 工具基类（run / async_run / Pydantic schema） |
| **AgentTools** | 工厂：基于一组 Agent 生成 DelegateWork / AskQuestion 工具 |
| **LiteAgent** | 单 Agent 入口（无需 Crew） |
| **Flow** | `@start / @listen / @router` 装饰器 DAG |

