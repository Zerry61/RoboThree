# LangGraph — 项目概览

> Commit: `49ae27c2ae983cfb92091b0dea9f7bc37a716479`
> 日期: 2026-07-18

## 1. 项目定位

LangGraph 是一个**低层级、有状态的 Agent 编排框架**，由 LangChain 团队维护。其核心目标是解决 Agent 长时间运行中的**状态持久化、暂停/恢复、人工介入、时间旅行和复杂工作流管理**问题。

LangGraph 不是应用框架——它是一种**Agent Runtime 基础设施**，类似于 Temporal / Durable Execution 领域在 AI Agent 场景的实现。

官方 README 强调的核心能力：`Stateful`, `Long-running`, `Checkpoint`, `Human-in-the-loop`。

## 2. 技术栈

| 层 | 技术 |
|----|------|
| 语言 | Python 3.10+ |
| 构建系统 | `uv` / `setuptools` (pyproject.toml) |
| 测试框架 | pytest |
| 运行时核心 | `langgraph` (Pregel 引擎) |
| 状态类型 | Pydantic / TypedDict / dataclass |
| 序列化 | msgpack (自定义 JSON+ 扩展) |
| 存储后端 | Memory / SQLite / Postgres |
| 依赖 | `langchain-core` (Runnable 接口 + Callbacks) |
| 并发 | `concurrent.futures` (sync) / `asyncio` (async) |

## 3. Monorepo 结构

```text
libs/
├── langgraph/       # 核心引擎（pregel 运行时、channels、graph builder）
├── checkpoint/      # Checkpoint 基础接口（BaseCheckpointSaver + Serde）
├── checkpoint-sqlite/  # SQLite 后端
├── checkpoint-postgres/ # Postgres 后端
├── cli/             # LangGraph CLI（部署、开发服务器）
├── prebuilt/        # 预构建工具（create_react_agent、ToolNode）
├── sdk-py/          # Python SDK（远程 API 客户端）
└── sdk-js/          # JavaScript SDK
```

依赖关系：`checkpoint → langgraph → prebuilt → sdk-py → cli`

## 4. License

- 文件：[LICENSE](sources/langgraph/LICENSE)
- 类型：MIT License
- 版权方：LangChain Inc.
- 复用分类：`DESIGN_ONLY` — MIT 许可证友好，但 RoboThree 应只提取设计模式，不直接复制代码。

## 5. 核心入口

| 入口 | 文件 | 说明 |
|------|------|------|
| StateGraph | `libs/langgraph/langgraph/graph/state.py` | 用户构建 Graph 的主 API |
| Pregel (编译图) | `libs/langgraph/langgraph/pregel/main.py` | CompiledStateGraph 基类，invoke/stream/astream |
| PregelLoop | `libs/langgraph/langgraph/pregel/_loop.py` | 核心运行时循环（tick 驱动） |
| Runner | `libs/langgraph/langgraph/pregel/_runner.py` | 节点执行器 (PregelRunner) |
| Algorithm | `libs/langgraph/langgraph/pregel/_algo.py` | 任务准备、写入应用、中断判定 |
| Channels | `libs/langgraph/langgraph/channels/` | State 通道系统（Reducer） |

## 6. 验证声明

> 每个官方宣传的能力都需要源码证据支撑。

| 宣传能力 | 验证状态 | 证据摘要 |
|----------|----------|----------|
| Stateful | ✅ 已验证 | Checkpoint TypedDict + `BaseCheckpointSaver` 持久化接口 |
| Long-running | ✅ 已验证 | `_loop.py` tick/superstep 模型 + step/stop 边界 |
| Checkpoint | ✅ 已验证 | `checkpoint/base/__init__.py:92` Checkpoint TypedDict |
| Human-in-the-loop | ✅ 已验证 | `interrupt_before/after` + `GraphInterrupt` + Command(resume=...) |
| Streaming | ✅ 已验证 | `_loop.py:_emit()` + `stream/_types.py` StreamProtocol |
| Durable Execution | ✅ 已验证 | `durability="exit"` 模式 + `_put_checkpoint` + `_put_exit_delta_writes` |
| Time Travel | ✅ 已验证 | `_loop.py:_first()` is_time_traveling 逻辑 + ReplayState |
| Subgraph | ✅ 已验证 | `PregelScratchpad.subgraph_counter()` + checkpoint_ns 命名空间 |
| Parallel Branch | ✅ 已验证 | `Send` API → TASKS channel → Topic channel + BinaryOperatorAggregate reducer |

## 7. 项目规模

核心引擎 (`libs/langgraph/langgraph/`) 约 **~70 个源文件**，核心运行时路径涉及约 15 个关键文件。Monorepo 总体包含 8 个子包，跨 Python + JavaScript。
