# project-overview.md — OpenHands Software Agent SDK

## 项目定位

OpenHands Software Agent SDK 是一套 **Python + REST API 的 Agent 引擎**，用于构建与代码交互的 AI Agent。它是 [OpenHands CLI](https://github.com/OpenHands/OpenHands-CLI) 和 [OpenHands Cloud](https://github.com/OpenHands/OpenHands) 背后的核心引擎。

**核心价值主张**：提供统一的 SDK 接口来构建 Agent，Agent 可以在**本地工作区**运行，也可以在**临时工作区**（Docker / Kubernetes）中通过 Agent Server 远程执行。

## 技术栈

| 维度 | 详情 |
| --- | --- |
| **语言** | Python 3.13 |
| **包管理** | uv workspace (monorepo) |
| **Web 框架** | FastAPI (Agent Server) |
| **LLM 适配** | LiteLLM (统一多 Provider 接口) |
| **数据校验** | Pydantic v2 |
| **异步** | asyncio + ThreadPoolExecutor |
| **测试框架** | pytest + pytest-asyncio + pytest-xdist |
| **类型检查** | Pyright |
| **Lint** | Ruff |
| **WebSocket** | FastAPI WebSocket + 自定义 pub/sub |
| **容器化** | Docker SDK (workspace), Dockerfile (server) |

## Monorepo 结构

| 包 | 路径 | PyPI 名 | 职责 |
| --- | --- | --- | --- |
| **openhands-sdk** | `openhands-sdk/` | `openhands-sdk` | 核心 SDK：Agent、Conversation、Event、LLM、Tool、Workspace、Skills、Subagent、MCP、Plugin |
| **openhands-tools** | `openhands-tools/` | `openhands-tools` | 内置工具：TerminalTool、FileEditorTool、TaskTrackerTool、BrowserTool、DelegateTool 等 |
| **openhands-workspace** | `openhands-workspace/` | `openhands-workspace` | 工作区后端：Local、Docker、Cloud、Apptainer、Remote API |
| **openhands-agent-server** | `openhands-agent-server/` | `openhands-agent-server` | Agent Server：FastAPI REST + WebSocket |

## 版本与许可证

| 字段 | 值 |
| --- | --- |
| **许可证** | MIT License |
| **版权方** | OpenHands contributors (2026) |
| **复用分类** | `DESIGN_ONLY` — 可参考接口与模式，但实现需从零构建 |
| **许可证风险** | 无。MIT 允许自由使用、修改、分发 |

## 关键规模指标

| 指标 | 估值 |
| --- | --- |
| SDK 核心 Python 文件 | ~150+ |
| Agent Server Python 文件 | ~50 |
| Tool 实现 | 15+ 工具包 |
| Workspace 后端 | 5 种 |
| 最大迭代次数（默认） | 500 |
| 默认工具并发限制 | 1（可配） |

## 顶层入口

| 入口 | 文件 | 说明 |
| --- | --- | --- |
| SDK Public API | `openhands-sdk/openhands/sdk/__init__.py` | 导出 > 60 个公共符号 |
| Agent 实现 | `openhands-sdk/openhands/sdk/agent/agent.py` | `Agent` 类 — 核心 Agent Loop |
| Conversation 工厂 | `openhands-sdk/openhands/sdk/conversation/conversation.py` | `Conversation` — 自动选择 Local/Remote |
| 本地 Conversation | `openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py` | `LocalConversation` — 运行循环 |
| 远程 Conversation | `openhands-sdk/openhands/sdk/conversation/impl/remote_conversation.py` | `RemoteConversation` — WebSocket 客户端 |
| Agent Server | `openhands-agent-server/openhands/agent_server/api.py` | FastAPI 应用工厂 |
| Agent Server 入口 | `openhands-agent-server/openhands/agent_server/__main__.py` | `python -m openhands.agent_server` |
| Tool 注册 | `openhands-sdk/openhands/sdk/tool/registry.py` | 工具注册/解析/发现 |
| Workspace 抽象 | `openhands-sdk/openhands/sdk/workspace/base.py` | `BaseWorkspace` ABC |
| Event 系统 | `openhands-sdk/openhands/sdk/event/base.py` | `Event` / `LLMConvertibleEvent` |
