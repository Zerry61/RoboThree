# CrewAI — Research Index

## Project Identity

| Field | Value |
|---|---|
| **Repository** | https://github.com/crewAIInc/crewAI |
| **Study Target** | branch `main`, commit `63884215103e287c87fa1e9f3010938dc6c12404` (2026-08-17) |
| **License** | MIT ([LICENSE](../../sources/crewai/LICENSE)) |
| **Language** | Python ≥ 3.10, < 3.14（多包 uv workspace：`crewai` / `crewai-core` / `crewai-files` / `crewai-tools` / `cli` / `devtools`） |
| **Version** | `crewai-workspace` monorepo；`lib/crewai/pyproject.toml` 内嵌独立版本，未单独读出 |
| **Research Depth** | Level 3 — Three-Mechanism Deep Dive |
| **Research Method** | 静态源码分析（Static source analysis only，未运行项目） |

## Research Status

| Stage | Status | Date |
|---|---|---|
| Stage A: Project Identification | ✅ Complete | 2026-08-18 |
| Stage B: Core Runtime Trace | ✅ Complete | 2026-08-18 |
| Stage C1: L3 Deep Dive — Multi-Agent Orchestration & Process (Sequential / Hierarchical / Consensual) | ✅ Complete | 2026-08-18 |
| Stage C2: L3 Deep Dive — Unified Memory System (Short / Long / Entity / Knowledge) | ✅ Complete | 2026-08-18 |
| Stage C3: L3 Deep Dive — Tool & Agent-as-Tool Abstraction | ✅ Complete | 2026-08-18 |
| Stage D: RoboThree Mapping | ✅ Complete | 2026-08-18 |
| Final Review | ✅ Complete | 2026-08-18 |

## Research Outputs

### Required (7)

| File | Description |
|---|---|
| [index.md](index.md) | This file |
| [project-overview.md](project-overview.md) | Project positioning, tech stack, license snapshot |
| [source-map.md](source-map.md) | Directory map, entry points, package topology |
| [architecture.md](architecture.md) | Architecture overview (含 Permission / Security 主报告段落) |
| [runtime-sequence.md](runtime-sequence.md) | End-to-end call chain with Mermaid + Hop Evidence |
| [robothree-fit-analysis.md](robothree-fit-analysis.md) | ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE |
| [open-questions.md](open-questions.md) | Unresolved items with How to Close |

### Conditional — Level 3 Deep Dives (3)

| File | Mechanism | Trigger |
|---|---|---|
| [process-orchestration-l3.md](process-orchestration-l3.md) | Multi-Agent Orchestration & Process (`Sequential` / `Hierarchical` + `Consensual` TODO) | Crew / Agent / Task / Process 是 crewAI 的核心交付；与其他多 Agent 框架最显著差异是「Process 是 first-class 概念 + manager LLM + Agent-as-Tool delegation」 |
| [memory-system-l3.md](memory-system-l3.md) | Unified Memory System | 单 `Memory` 对象统管 4 类（Short/Long/Entity/Knowledge），scope 路径 + 后台编码 + 异步写入 + 复合打分 + 工厂可替换 backend；对 RoboThree 单一 Memory 抽象是关键参考 |
| [tool-agent-as-tool-l3.md](tool-agent-as-tool-l3.md) | Tool & Agent-as-Tool Abstraction | `BaseTool` + `BaseAgentTool` + `AgentTools` 生成 DelegateWork/AskQuestion 工具 + LiteAgent + MCP 封装是 RoboThree 工具集/Multi-Agent 工具桥的关键参考 |

### Advanced

| File | Description |
|---|---|
| [final-review.md](final-review.md) | Level 3 30-item full self-check |
| [LICENSE-NOTES.md](LICENSE-NOTES.md) | License 登记 + 复用分类 |

## L3 Mechanism Selection Rationale

Level 3 的「专项深挖」不是 Level 2 的全量展开。基于 Stage A/B 的源码识别，三个机制最能代表 CrewAI 的架构贡献 / 风险点：

1. **Multi-Agent Orchestration & Process** — Crew 是入口，但真正驱动"角色分工"实现的是 `Process.sequential` / `Process.hierarchical` 枚举 + `_run_sequential_process` / `_run_hierarchical_process` 分派 + Manager Agent + `AgentTools` 注入 DelegateWork / AskQuestion 工具。Consensual 在 `process.py:11` 显式标记 `TODO`。这条线索对 RoboThree「Multi-Agent 编排」是直接模板。
2. **Unified Memory System** — 单一 `Memory`（[memory/unified_memory.py:76](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L76)）承载 Short / Long / Entity / Knowledge 四类，提供 `scope()` / `slice()` / `recall()` / `remember()` / `extract_memories()` / `drain_writes()`；背后是 `StorageBackend` Protocol + `set_memory_storage_factory()` 进程级工厂 + LanceDB/Qdrant 内置实现 + 后台 `Future` 写入 + `compute_composite_score` 折衷打分。Multi-Agent 协作下的记忆共享/隔离直接服务 RoboThree「Memory 抽象 + Capability Seam」。
3. **Tool & Agent-as-Tool Abstraction** — `BaseTool` 执行抽象 + `ToolUsage` 解析 + `CacheHandler` + `ToolFailure` 失败策略 + `BaseAgentTool`（agent 互调工具基类）+ `AgentTools` 工厂（注入 delegate/ask）+ `MCP` 桥接 + `lite_agent` 单 Agent 轻量入口（绕过 Crew）。三态分级（同步/异步/流式）+ `tools/agent_tools/__init__.py` 可见 Agent-as-Tool 是 RoboThree 工具调用模型的最直接对位。

## Key Architectural Conclusion (Summary)

CrewAI (`crewai`) 是 CrewAI Inc. 推出的**Python 多 Agent 协作框架**，MIT 许可，整体是一个 **uv workspace 6 包**（crewai / crewai-core / crewai-files / crewai-tools / cli / devtools）：

1. **核心四元组**：`Crew`（容器）→ `Agent`（角色）→ `Task`（任务）→ `Process`（编排方式）。`Process` 是 `enum.Enum`，已知实现 `sequential` 与 `hierarchical`，`consensual` 在源文件顶部 `TODO` 注释占位（[process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11)）。
2. **Agent 执行核心**：[`Agent.execute_task`](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L822)（同步路径 / ThreadPoolExecutor 兜底 timeout）→ [`AgentExecutor.invoke`](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L946) → `ToolUsage` 解析 → LLM 流式/非流式调用 → 工具执行 → 状态回写。
3. **LLM 抽象**：[`BaseLLM`](../../sources/crewai/lib/crewai/src/crewai/llms/base_llm.py) + `providers/` 多 provider 子包（OpenAI/Anthropic/Gemini/Bedrock/Groq/Ollama 等），通过工厂构造，类型 + JSON 校验走 Pydantic + Instructor。
4. **Memory 抽象**：单一 `Memory` 对象（[unified_memory.py:76](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L76)），支持 `remember/recall/scope/slice/list_scopes/extract_memories/drain_writes`，后台 `Future` 异步写入 + `StorageBackend` Protocol + 工厂可替换。
5. **Agent-as-Tool**：`AgentTools.tools()` 自动生成 `DelegateWorkTool` + `AskQuestionTool`（[agent_tools.py:22](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py#L22)），依赖 `allow_delegation=True`；Manager 经常以 LLM（非显式 Agent）出现。
6. **Event Bus**：`crewai_event_bus` + `BaseEvent` + `EventListener` + `BaseEventListener` + `handler_graph.py` 实现类型化事件订阅，构成可观测地基。
7. **安全**：未发现中心化 `Permission` / `Sandbox` 模块；`CodeInterpreter` 等工具通过 `crewai-tools` 第三方实现。代码执行隔离弱（seealso architecture.md §9）。

## Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| 项目定位 + License | HIGH | README + LICENSE + uv workspace |
| 入口与启动链路 | HIGH | `Crew.kickoff()` → `_run_sequential_process` / `_run_hierarchical_process` 直接源码 |
| Agent execute_task 主循环 | HIGH | `agent/core.py` `execute_task` (822-891) + `_execute_without_timeout` (933-961) 完整阅读 |
| Task execute_sync 主循环 | HIGH | `task.py` `_execute_core` (806) 已读部分 |
| Process / Manager / AgentTools | HIGH | `process.py` (11) + `crew.py` `_create_manager_agent` (1518) + `agent_tools/agent_tools.py` (16-80) 已读 |
| Memory unified API | HIGH | `unified_memory.py` 关键方法（remember/recall/scope/extract_memories/drain_writes）已读 |
| Memory 存储 backend 可替换 | HIGH | `storage/factory.py` 完整阅读 + `StorageBackend` Protocol |
| Tool + BaseTool + ToolUsage | HIGH | `tools/base_tool.py` + `tools/tool_usage.py` 关键段已读 |
| 异步执行实际并发行为 | MEDIUM | `kickoff_async` + `execute_async` + `async_execution` Task 路径；未做运行时验证 |
| Manager LLM 决策真的来自 LLM | MEDIUM | 静态推断；未观测 ToolUsage in `_create_manager_agent` |
| CodeInterpreter 沙箱隔离强度 | LOW | 跨包，未深读 `crewai-tools` 子仓；列为 open-question |
| A2A / MCP 实际桥接行为 | MEDIUM | 目录已识别（`a2a/`, `mcp/`）但未深入 |

## Verification Method

本研究仅做静态源码分析：

- 未 `uv sync` / `pip install`。
- 未运行 `crewai` CLI、未运行测试、未启动任何 Agent / 工具 / Memory 后端。
- 未访问外部网络（仅 `git clone`）。
- 未读取任何 Secret。

**所有 `[F]` 结论必须能由源码路径直接确认；运行时行为只能标注 `[I]` / `[UNKNOWN]`。**
