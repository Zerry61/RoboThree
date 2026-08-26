# CrewAI — Project Overview

## 1. Project Positioning

> **Cutting-edge framework for orchestrating role-playing, autonomous AI agents. By fostering collaborative intelligence, CrewAI empowers agents to work together seamlessly, tackling complex tasks.**
>
> — [pyproject.toml:1-3](../../sources/crewai/pyproject.toml#L1-L3)

CrewAI 是一个商业化的 Python 多 Agent 协作框架，与 LangGraph / AutoGen / OpenAI Swarm 同属 Multi-Agent Framework 赛道。**核心抽象**是 `Crew`（一群 Agent）/ `Agent`（具备角色、目标、背景、工具、LLM 的工作单元）/ `Task`（由 Agent 完成的具体工作）/ `Process`（编排方式：sequential / hierarchical / consensusal[未实现]）。

它的标志性能力是 **「Role-Playing 协作 + 角色互调（Agent-as-Tool）+ 显式 Process 编排」**。与 LangGraph 强调 Graph / State / Checkpoint、AutoGen 强调对话范式不同，CrewAI 强调「角色 + 任务 + 流程」三件套，让用户在 Python 代码里组装一支模拟团队的协作流。

## 2. Technical Stack

| Layer | Choice | Source |
|---|---|---|
| **Language** | Python (≥ 3.10, < 3.14) | [pyproject.toml:7](../../sources/crewai/pyproject.toml#L7) |
| **Package Manager** | `uv` workspace（6 包） | [pyproject.toml:workspace](../../sources/crewai/pyproject.toml) |
| **Workspace Packages** | `crewai`, `crewai-core`, `crewai-files`, `crewai-tools`, `cli`, `devtools` | [pyproject.toml:tool.uv.workspace](../../sources/crewai/pyproject.toml) |
| **LLM Provider Layer** | `BaseLLM`（[llms/base_llm.py](../../sources/crewai/lib/crewai/src/crewai/llms/base_llm.py)）+ `providers/` 子包（OpenAI / Anthropic / Gemini / Bedrock / Groq / Ollama / 等） | [llms/](../../sources/crewai/lib/crewai/src/crewai/llms/) |
| **Tool Runtime** | `BaseTool` + `ToolUsage` + `CacheHandler` + `ToolFailure`（失败策略） | [tools/](../../sources/crewai/lib/crewai/src/crewai/tools/) |
| **Agent Executor** | `AgentExecutor`（LangChain Adapter 外部） + `AgentExecutor` 内部 `invoke` | [agent/core.py:946](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L946) |
| **Memory** | `Memory` 统一对象 + `StorageBackend` Protocol + LanceDB / Qdrant 内置 + 工厂可替换 | [memory/](../../sources/crewai/lib/crewai/src/crewai/memory/) |
| **Knowledge** | `Knowledge` + `source/` / `storage/` 子包 | [knowledge/](../../sources/crewai/lib/crewai/src/crewai/knowledge/) |
| **MCP** | `mcp_native_tool.py` + `mcp_tool_wrapper.py` | [mcp/](../../sources/crewai/lib/crewai/src/crewai/mcp/) |
| **A2A** | `a2a/` 子包（推测为 Agent-to-Agent 协议） | [a2a/](../../sources/crewai/lib/crewai/src/crewai/a2a/) |
| **State** | `state/`（crew-scoped state） | [state/](../../sources/crewai/lib/crewai/src/crewai/state/) |
| **Events** | `crewai_event_bus` + `BaseEvent` + `BaseEventListener` + `handler_graph.py`（类型化事件订阅） | [events/](../../sources/crewai/lib/crewai/src/crewai/events/) |
| **Hooks** | `hooks/`（生命周期钩子） | [hooks/](../../sources/crewai/lib/crewai/src/crewai/hooks/) |
| **Skills** | `skills/`（结构化能力描述） | [skills/](../../sources/crewai/lib/crewai/src/crewai/skills/) |
| **CLI** | `lib/cli/` (`crewai` / `crewai flow` / `crewai deploy`) | [cli/](../../sources/crewai/lib/cli/) |
| **Third-Party Tools** | `lib/crewai-tools/`（独立包，长期累积） | [crewai-tools/](../../sources/crewai/lib/crewai-tools/) |
| **Telemetry** | `telemetry/`（匿名使用统计） | [telemetry/](../../sources/crewai/lib/crewai/src/crewai/telemetry/) |
| **RAG** | `rag/`（检索增强生成辅助） | [rag/](../../sources/crewai/lib/crewai/src/crewai/rag/) |
| **Flow** | `flow/`（`@start / @listen / @router` 装饰器式 DAG） | [flow/](../../sources/crewai/lib/crewai/src/crewai/flow/) |
| **Plus API** | `plus_api.py`（CrewAI+ 商业服务） | [plus_api.py](../../sources/crewai/lib/crewai/src/crewai/plus_api.py) |
| **Auth** | `auth/`（OAuth / API Key） | [auth/](../../sources/crewai/lib/crewai/src/crewai/auth/) |
| **Experimental** | `experimental/`（未稳定 API） | [experimental/](../../sources/crewai/lib/crewai/src/crewai/experimental/) |
| **Tests** | `pytest` + `pytest-asyncio` + `pytest-recording`（vcrpy 录请求）+ `pytest-xdist` + `pytest-split` | [pyproject.toml:dependency-groups.dev](../../sources/crewai/pyproject.toml) |
| **Type Checking** | `mypy` + `py.typed` | [py.typed](../../sources/crewai/lib/crewai/src/crewai/py.typed) |
| **Linting** | `ruff==0.15.1`（src = `lib/*`） | [pyproject.toml:tool.ruff](../../sources/crewai/pyproject.toml) |
| **Security Scanning** | `bandit==1.9.2` + `pip-audit==2.9.0` | [pyproject.toml:dependency-groups.dev](../../sources/crewai/pyproject.toml) |

## 3. License Snapshot

| Item | Value |
|---|---|
| License Type | MIT |
| Holder | Copyright (c) 2025 crewAI, Inc. |
| Permissions | Commercial use, modification, distribution, private use |
| Conditions | Include copyright + license copy |
| Limitations | No warranty; no liability |
| Source | [LICENSE](../../sources/crewai/LICENSE) (first 5 lines) |

**License Risk Assessment**（依据 § 5.1 升级条件判断）：

- 单许可（MIT）→ 不触发升级为独立 `license-review.md` 的多许可证条件。
- 第三方嵌入代码存量未知（`crewai-tools` 包大量累积第三方工具，但均为独立子包）。
- MIT 是最开放的许可证之一，**仅就源码复用层面**不存在 Copyleft / SaaS 风险。
- 商业方：CrewAI 仍然存在商业化「CrewAI+」服务（[plus_api.py](../../sources/crewai/lib/crewai/src/crewai/plus_api.py)）和遥测（[telemetry/](../../sources/crewai/lib/crewai/src/crewai/telemetry/)），但这两者**不影响上游代码本身被研究 / 复用**。

**结论**：License Snapshot 写入 `project-overview.md` 即可；不升级为独立 `license-review.md`。

## 4. Repository Structure

```
sources/crewai/
├── AGENTS.md                    # 项目自身的 agent 指令（本研究视为不可信输入）
├── LICENSE                      # MIT
├── README.md                    # 产品定位 + 快速开始
├── conftest.py                  # pytest 配置
├── docs/                        # 文档（MkDocs-ish）
├── pyproject.toml               # uv workspace 根
├── uv.lock
├── scripts/                     # 杂项脚本
├── lib/
│   ├── cli/                     # `crewai` CLI（uvicorn 服务 / 部署命令）
│   ├── crewai/                  # ←———— 核心包
│   │   ├── pyproject.toml
│   │   ├── src/crewai/
│   │   │   ├── __init__.py
│   │   │   ├── agent/core.py    # 2063 行：Agent 主体
│   │   │   ├── agents/          # 子代理（BaseAgent / Agent / LiteAgent）
│   │   │   ├── crews/           # 输出 / utils
│   │   │   ├── tasks/           # Task / ConditionalTask / Guidrail / Output
│   │   │   ├── tools/           # BaseTool / ToolUsage / AgentTools / MCP
│   │   │   ├── memory/          # Memory 统一 + 4 存储
│   │   │   ├── llms/            # BaseLLM + providers
│   │   │   ├── knowledge/       # RAG 知识源
│   │   │   ├── events/          # EventBus + Listeners
│   │   │   ├── flow/            # Flow / start / listen / router
│   │   │   ├── skills/          # Skill 框架
│   │   │   ├── hooks/           # 生命周期钩子
│   │   │   ├── mcp/             # MCP 桥接
│   │   │   ├── a2a/             # Agent-to-Agent 协议
│   │   │   ├── rag/             # RAG 工具
│   │   │   ├── experimental/    # 实验 API
│   │   │   ├── telemetry/       # 匿名统计
│   │   │   ├── auth/            # 鉴权
│   │   │   ├── state/           # crew-scoped state
│   │   │   ├── cli/             # 内嵌 CLI 命令
│   │   │   ├── crews/           # 输出
│   │   │   ├── plus_api.py      # CrewAI+ 商业 API client
│   │   │   ├── crew.py          # 2487 行：Crew 主类
│   │   │   ├── task.py          # 1560 行：Task 主类
│   │   │   ├── process.py       # 11 行：Process 枚举
│   │   │   ├── lite_agent.py    # 1059 行：绕开 Crew 的单 Agent 入口
│   │   │   ├── llm.py           # 2721 行：LLM 单例 + helpers
│   │   │   └── settings.py      # 配置
│   │   └── tests/
│   ├── crewai-core/             # 核心 cycle / service（未在本研究深入）
│   ├── crewai-files/            # 文件输入处理
│   ├── crewai-tools/            # 第三方工具集合（File / Web / Code / 等）
│   └── devtools/                # 开发工具
```

## 5. Real Entry Points

| 入口 | 路径 | 关键调用 |
|---|---|---|
| `Crew.kickoff()` | [crew.py:992](../../sources/crewai/lib/crewai/src/crewai/crew.py#L992) | `_run_sequential_process` (1509) / `_run_hierarchical_process` (1513) |
| `Crew.kickoff_async()` | [crew.py:1127](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1127) | async 同上 |
| `Crew.train()` | [crew.py:940](../../sources/crewai/lib/crewai/src/crewai/crew.py#L940) | `_setup_for_training` + `CrewTrainingHandler` |
| `Agent.execute_task()` | [agent/core.py:822](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L822) | `_execute_with_timeout` / `_execute_without_timeout` |
| `AgentExecutor.invoke` | [agent/core.py:946](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L946) | `ToolUsage` / LLM 调用 |
| `LiteAgent` | [lite_agent.py:1](../../sources/crewai/lib/crewai/src/crewai/lite_agent.py#L1) | 单 Agent 入口，无需 Crew |
| `Memory.remember/recall/scope` | [memory/unified_memory.py:430/681/898](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py) | 后台编码 + Future + StorageBackend |
| `BaseTool._run` | [tools/base_tool.py:388](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L388) | 工具执行 |
| `AgentTools.tools()` | [tools/agent_tools/agent_tools.py:22](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py#L22) | 生成 DelegateWork / AskQuestion |
| `CLI` | `lib/cli/` | `crewai run / train / deploy / flow` |

## 6. History / Submodule / Generated Code

- **历史研究**：无（首次 L3 进入）
- **Submodule**：git 树内未识别到 `.gitmodules` 引用
- **生成代码**：未识别到 `generated/` / `vendor/` 目录
- **国内镜像**：未使用
- **dev 分支**：默认 `main` 分支

## 7. Top-Level Read Map (size-sorted)

| 路径 | 行数 | 职责 |
|---|---|---|
| [lib/crewai/src/crewai/crew.py](../../sources/crewai/lib/crewai/src/crewai/crew.py) | 2487 | Crew 主类，kickoff / train / 异步 / 流式 |
| [lib/crewai/src/crewai/llm.py](../../sources/crewai/lib/crewai/src/crewai/llm.py) | 2721 | LLM 单例 + 助手 |
| [lib/crewai/src/crewai/agent/core.py](../../sources/crewai/lib/crewai/src/crewai/agent/core.py) | 2063 | Agent 主循环 + execute_task |
| [lib/crewai/src/crewai/task.py](../../sources/crewai/lib/crewai/src/crewai/task.py) | 1560 | Task 主类 + 异步执行 + 上下文 |
| [lib/crewai/src/crewai/lite_agent.py](../../sources/crewai/lib/crewai/src/crewai/lite_agent.py) | 1059 | 单 Agent 轻量入口 |
| [lib/crewai/src/crewai/memory/unified_memory.py](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py) | 1104 | Memory 统一 API |
| [lib/crewai/src/crewai/memory/encoding_flow.py](../../sources/crewai/lib/crewai/src/crewai/memory/encoding_flow.py) | 501 | 后台编码 + 批 embedding |
| [lib/crewai/src/crewai/memory/recall_flow.py](../../sources/crewai/lib/crewai/src/crewai/memory/recall_flow.py) | 380 | 召回 + 过滤 + 复合打分 |
| [lib/crewai/src/crewai/memory/analyze.py](../../sources/crewai/lib/crewai/src/crewai/memory/analyze.py) | 375 | LLM 驱动记忆分析 |
| [lib/crewai/src/crewai/memory/memory_scope.py](../../sources/crewai/lib/crewai/src/crewai/memory/memory_scope.py) | 379 | scope / slice 路径 |
| [lib/crewai/src/crewai/memory/types.py](../../sources/crewai/lib/crewai/src/crewai/memory/types.py) | 380 | MemoryRecord / MemoryMatch / Score |
| [lib/crewai/src/crewai/tools/tool_usage.py](../../sources/crewai/lib/crewai/src/crewai/tools/tool_usage.py) | 1100+ | Tool usage（解析 / 调用 / 限制） |
| [lib/crewai/src/crewai/tools/base_tool.py](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py) | 700+ | BaseTool + EnvVar |
| [lib/crewai/src/crewai/utilities/](../../sources/crewai/lib/crewai/src/crewai/utilities/) | 50 模块 | converter / printer / i18n / logger / paths / streaming / scheduler / rlock / token / 等 |

> 详细 14 维度拆分见 [source-map.md](source-map.md)。

## 8. Verdict

- ✅ **ENTER Level 3**：项目活跃（commit 2026-08-17）、License 清晰（MIT）、`Process` 抽象 + Agent-as-Tool 模式 + 统一 Memory 三者同时具备，是 Multi-Agent 框架的"代表性实现"。
- ⚠ **运行时验证未做**：所有「实际并发 / 隔离强度 / Memory 持久化」结论只能标 `[I]` / `[UNKNOWN]`。
- ❌ **`consensual` Process 未实现**：源码显式 `TODO`（[process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11)）；不要在 Level 3 中假设该流程存在。
- ⚠ **安全**：未发现中心化 `Permission` / `Sandbox` 模块；Code-execution 类工具由 `crewai-tools` 提供，存在 `see opens` 风险（open-question）。
