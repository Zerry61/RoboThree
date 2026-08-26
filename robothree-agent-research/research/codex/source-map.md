# Source Map — Codex CLI (openai/codex)

> Commit `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7`。路径为仓库相对路径（镜像根 `sources/codex/`）。

## 1. 包拓扑（与 Agent Runtime 相关的 crate）

### 1.1 核心运行时（最重要）

| Crate | 路径 | 职责 | 关键 Symbol |
|---|---|---|---|
| `codex-core` | [codex-rs/core](../../sources/codex/codex-rs/core) | Agent Runtime 心脏：Session / Turn / Thread / Tool / exec_policy / compact / mcp / skills / plugins | `ThreadManager`、`CodexThread`、`Session`、`run_turn`、`ToolRouter`、`ToolCallRuntime` |
| `codex-protocol` | [codex-rs/protocol](../../sources/codex/codex-rs/protocol) | 跨层类型：`ResponseItem`、`TurnInput`、`AskForApproval`、`PermissionProfile`、Event | `AskForApproval`、`PermissionProfile`、`Event` |

### 1.2 模型与后端

| Crate | 职责 |
|---|---|
| [codex-rs/backend-client](../../sources/codex/codex-rs/backend-client) | OpenAI 后端 HTTP 客户端 |
| [codex-rs/codex-api](../../sources/codex/codex-rs/codex-api) | Responses API 模型 |
| [codex-rs/model-provider](../../sources/codex/codex-rs/model-provider) | 模型 Provider 抽象（`ModelClient` 背后） |
| [codex-rs/models-manager](../../sources/codex/codex-rs/models-manager) | 模型列表 / ETag 刷新 |
| [codex-rs/responses-api-proxy](../../sources/codex/codex-rs/responses-api-proxy) | Responses API 代理 |
| [codex-rs/ollama](../../sources/codex/codex-rs/ollama)、[lmstudio](../../sources/codex/codex-rs/lmstudio) | 本地模型 Provider 接入 |

### 1.3 执行与沙箱（安全层）

| Crate | 职责 |
|---|---|
| [codex-rs/exec](../../sources/codex/codex-rs/exec) | 命令执行抽象（exec CLI） |
| [codex-rs/exec-server](../../sources/codex/codex-rs/exec-server) | 远程 / 隔离 exec server |
| [codex-rs/execpolicy](../../sources/codex/codex-rs/execpolicy) | 命令批准策略（`.rules` 文件） |
| [codex-rs/sandboxing](../../sources/codex/codex-rs/sandboxing) | 沙箱抽象：`SandboxManager`、`SandboxType`、spawn transform |
| [codex-rs/linux-sandbox](../../sources/codex/codex-rs/linux-sandbox) | Linux 沙箱二进制（bwrap + landlock + proxy） |
| [codex-rs/bwrap](../../sources/codex/codex-rs/bwrap) | Bubblewrap 包装二进制 |
| [codex-rs/process-hardening](../../sources/codex/codex-rs/process-hardening) | 进程加固 |
| [codex-rs/windows-sandbox-rs](../../sources/codex/codex-rs/windows-sandbox-rs) | Windows Restricted Token / AppContainer |

### 1.4 扩展 / 插件 / Skill / MCP

| Crate | 职责 |
|---|---|
| [codex-rs/ext/extension-api](../../sources/codex/codex-rs/ext/extension-api) | 进程内扩展 API：`ExtensionRegistry` + 12 种 Contributor trait |
| [codex-rs/ext/agent](../../sources/codex/codex-rs/ext/agent) | 多 Agent 扩展 |
| [codex-rs/ext/guardian](../../sources/codex/codex-rs/ext/guardian) | 守护扩展 |
| [codex-rs/ext/memories](../../sources/codex/codex-rs/ext/memories) | 记忆扩展 |
| [codex-rs/ext/skills](../../sources/codex/codex-rs/ext/skills)、[web-search](../../sources/codex/codex-rs/ext/web-search)、[image-generation](../../sources/codex/codex-rs/ext/image-generation)、[connectors](../../sources/codex/codex-rs/ext/connectors) | 能力扩展 |
| [codex-rs/core-plugins](../../sources/codex/codex-rs/core-plugins) | 插件管理器 / marketplace（add/remove/upgrade） |
| [codex-rs/plugin](../../sources/codex/codex-rs/plugin) | 插件 manifest / provider / loader |
| [codex-rs/skills](../../sources/codex/codex-rs/skills) | Skill 系统（SKILL.md 模型 / 选择 / 调用） |
| [codex-rs/mcp-server](../../sources/codex/codex-rs/mcp-server) | Codex 作为 **MCP Server** 对外暴露 |
| [codex-rs/codex-mcp](../../sources/codex/codex-rs/codex-mcp) | MCP **Client** 侧（binding / catalog / connection_manager） |
| [codex-rs/rmcp-client](../../sources/codex/codex-rs/rmcp-client) | MCP 传输层（stdio / in_process / streamable_http / oauth） |

### 1.5 持久化与状态

| Crate | 职责 |
|---|---|
| [codex-rs/thread-store](../../sources/codex/codex-rs/thread-store) | Thread 存储（SQLite） |
| [codex-rs/agent-graph-store](../../sources/codex/codex-rs/agent-graph-store) | 多 Agent 图存储 |
| [codex-rs/history](../../sources/codex/codex-rs/history) | 历史 / rollout item |
| [codex-rs/state](../../sources/codex/codex-rs/state) | StateRuntime / StateDbHandle |

## 2. 真实入口链

```
codex-cli/bin/codex.js (npm bin)
  → codex 二进制（下载自 releases.openai.com）
    → codex-rs/cli/src/main.rs (Clap)
      → arg0_dispatch_or_else → TuiCli / ExecCli / McpCmd / AppCmd / Doctor
        → codex-rs/tui (终端 UI)
          → codex_core::ThreadManager / CodexThread
            → Session → tasks/RegularTask → run_turn
```

**[F]** CLI 入口 [codex-rs/cli/src/main.rs](../../sources/codex/codex-rs/cli/src/main.rs)：Clap derive，`codex_arg0::arg0_dispatch_or_else` 根据 argv[0] 分发；核心子命令包括 TUI（`codex_tui::Cli`）、`exec`（`codex_exec::Cli`）、`app`（桌面）、`mcp`、`doctor`、`marketplace`、`plugin`。

**[F]** `codex_core` 模块声明 [codex-rs/core/src/lib.rs](../../sources/codex/codex-rs/core/src/lib.rs)：`thread_manager` / `codex_thread` / `session` / `tools` / `exec_policy` / `compact` / `mcp` / `skills` / `plugins` / `rollout` 等模块，导出 `ThreadManager` / `CodexThread` / `ModelClient`。

## 3. 核心运行时文件（Stage B/C 重点）

| 文件 | 行数 | 职责 |
|---|---|---|
| [session/turn.rs](../../sources/codex/codex-rs/core/src/session/turn.rs) | 2760 | **主循环**：`run_turn` → `run_sampling_request` → `try_run_sampling_request` |
| [session/session.rs](../../sources/codex/codex-rs/core/src/session/session.rs) | 1440 | `Session`：历史、world state、事件发送 |
| [tools/parallel.rs](../../sources/codex/codex-rs/core/src/tools/parallel.rs) | 833 | `ToolCallRuntime`：并发工具调度 + RW-lock 并行门 |
| [tools/router.rs](../../sources/codex/codex-rs/core/src/tools/router.rs) | 295 | `ToolRouter`：tool call 解析与分发 |
| [tools/registry.rs](../../sources/codex/codex-rs/core/src/tools/registry.rs) | 829 | `ToolRegistry`：工具注册表 |
| [tools/orchestrator.rs](../../sources/codex/codex-rs/core/src/tools/orchestrator.rs) | 531 | 工具编排 |
| [client.rs](../../sources/codex/codex-rs/core/src/client.rs) | 2497 | `ModelClient` / `ModelClientSession` / `stream()` |
| [exec_policy.rs](../../sources/codex/codex-rs/core/src/exec_policy.rs) | 1153 | 命令批准决策引擎 |
| [tools/approvals.rs](../../sources/codex/codex-rs/core/src/tools/approvals.rs) | 664 | 批准流 |
| [tools/network_approval.rs](../../sources/codex/codex-rs/core/src/tools/network_approval.rs) | 1120 | 网络批准 |
| [compact.rs](../../sources/codex/codex-rs/core/src/compact.rs) | 783 | Context 压缩 |
| [mcp.rs](../../sources/codex/codex-rs/core/src/mcp.rs) | 292 | `McpManager` |
| [thread_manager.rs](../../sources/codex/codex-rs/core/src/thread_manager.rs) | 2136 | `ThreadManager`：线程生命周期 |
| [codex_thread.rs](../../sources/codex/codex-rs/core/src/codex_thread.rs) | 714 | `CodexThread`：单线程 / 提交 turn |

## 4. 历史研究 / 生成代码 / Vendor

- **历史研究**：无（本研究为首次）。
- **生成代码**：`MODULE.bazel.lock`（1.5MB，Bazel 锁文件）、`pnpm-lock.yaml`。
- **Vendor / 第三方**：`third_party/`（v8、wezterm、wine、powershell）——沙箱/终端/Windows 工具，与 agent 逻辑无关。
- **子模块**：无。

## 5. 命名与引用约定

- 本项目引用：`codex@e766f75:codex-rs/core/src/session/turn.rs:153`。
- 所有路径相对镜像根 `sources/codex/`。
