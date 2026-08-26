# grok-build — Source Map

## 核心运行时 Crate（Agent Runtime）

| Crate | 路径 | 角色 | 关键 Symbol |
| --- | --- | --- | --- |
| `xai-grok-pager-bin` | `crates/codegen/xai-grok-pager-bin/` | CLI 入口 + 命令路由 | `main()`:1592, `async_main()`:1666, `run_agent_command()`:958 |
| `xai-grok-shell` | `crates/codegen/xai-grok-shell/` | Agent 运行时核心 | `MvpAgent`, `run_session()`, session lifecycle, leader 模式 |
| `xai-grok-agent` | `crates/codegen/xai-grok-agent/` | Agent 构建 + System Prompt 组装 | `Agent`, `AgentBuilder`, `AgentDefinition`, `PromptContext` |
| `xai-chat-state` | `crates/codegen/xai-chat-state/` | 对话状态 Actor（无锁） | `ChatStateActor`, `ChatStateHandle`, compaction |
| `xai-agent-lifecycle` | `crates/codegen/xai-agent-lifecycle/` | Agent 生命周期钩子（host-agnostic） | `TurnLifecycleContributor`, `SessionLifecycleContributor`, `ExtensionRegistry` |

## 工具和 Workspace Crate

| Crate | 路径 | 角色 | 关键 Symbol |
| --- | --- | --- | --- |
| `xai-grok-tools` | `crates/codegen/xai-grok-tools/` | 工具实现 + ToolBridge + 注册 | `ToolBridge`:60, `ToolRegistryBuilder`, `FinalizedToolset`, implementations/ (grok_build, codex, opencode) |
| `xai-grok-workspace` | `crates/codegen/xai-grok-workspace/` | 工作区抽象：文件系统、VCS、权限、worktree | `WorkspaceOps`, `PermissionHandle`, `permission::types::Decision` |
| `xai-grok-tools-api` | `crates/codegen/xai-grok-tools-api/` | 工具 API 协议 (protobuf) | Tool gRPC 定义 |

## Session 持久化 Crate

| Crate | 路径 | 角色 | 关键 Symbol |
| --- | --- | --- | --- |
| `xai-sqlite-journal` | `crates/codegen/xai-sqlite-journal/` | SQLite 日志存储 | Session/skill/roster 持久化 |
| `xai-chat-state` (persistence) | `crates/codegen/xai-chat-state/src/persistence.rs` | 对话状态持久化 trait | `ChatPersistence`, `PersistenceRecord` |
| `xai-grok-shell` (session/storage) | `crates/codegen/xai-grok-shell/src/session/storage/` | Session 磁盘读写 | JSONL 格式, `SEARCH_INDEX_MANAGER` |

## Subagent Crate

| Crate | 路径 | 角色 | 关键 Symbol |
| --- | --- | --- | --- |
| `xai-grok-shell` (agent/subagent) | `crates/codegen/xai-grok-shell/src/agent/subagent/` | Subagent coordinator | `handle_subagent_request()`, `SubagentCoordinator`, `SubagentTracker` |
| `xai-grok-subagent-resolution` | `crates/codegen/xai-grok-subagent-resolution/` | Subagent 解析 | Subagent 定义解析 |

## 协议和适配 Crate

| Crate | 路径 | 角色 | 关键 Symbol |
| --- | --- | --- | --- |
| `xai-acp-lib` | `crates/codegen/xai-acp-lib/` | ACP (Agent Client Protocol) 库 | JSON-RPC 2.0 消息, gateway, channel |
| `xai-grok-mcp` | `crates/codegen/xai-grok-mcp/` | MCP Client | MCP server 连接生命周期 |
| `xai-grok-mermaid` | `crates/codegen/xai-grok-mermaid/` | Mermaid 图表渲染 | 依赖 `third_party/` |
| `xai-grok-sampler` | `crates/codegen/xai-grok-sampler/` | LLM 调用 + 流式处理 | Sampling actor, stream |
| `xai-grok-sampling-types` | `crates/codegen/xai-grok-sampling-types/` | Sampling 类型定义 | `SamplingConfig`, `ConversationItem`, `ToolCallResponse` |

## UI Crate

| Crate | 路径 | 角色 | 关键 Symbol |
| --- | --- | --- | --- |
| `xai-grok-pager` | `crates/codegen/xai-grok-pager/` | TUI 全屏交互 | scrollback/blocks, views, app/dispatch, input/mouse |
| `xai-grok-pager-render` | `crates/codegen/xai-grok-pager-render/` | 终端渲染 | ratatui 集成, theme, clipboard |
| `xai-grok-markdown` | `crates/codegen/xai-grok-markdown/` | Markdown 渲染 | 自研 markdown → 终端 |
| `xai-ratatui-inline` | `crates/codegen/xai-ratatui-inline/` | 内联文本编辑 widget | ratatui fork |
| `xai-ratatui-textarea` | `crates/codegen/xai-ratatui-textarea/` | 终端文本输入 widget | ratatui fork |

## 权限和沙箱 Crate

| Crate | 路径 | 角色 |
| --- | --- | --- |
| `xai-grok-workspace` (permission/) | `crates/codegen/xai-grok-workspace/src/permission/` | 权限管理器、策略、决策 |
| `xai-grok-sandbox` | `crates/codegen/xai-grok-sandbox/` | 沙箱执行（seccomp 等） |
| `xai-grok-secrets` | `crates/codegen/xai-grok-secrets/` | Secret 管理 |

## 辅助或第三方 Vendored Crate

| Crate | 路径 | 角色 |
| --- | --- | --- |
| `xai-fast-worktree` | `crates/codegen/xai-fast-worktree/` | 高性能 git worktree (btrfs/overlayfs) |
| `xai-codebase-graph` | `crates/codegen/xai-codebase-graph/` | 代码图索引 (scope graph) |
| `xai-hunk-tracker` | `crates/codegen/xai-hunk-tracker/` | Diff hunk 追踪 Actor |
| `xai-grok-telemetry` | `crates/codegen/xai-grok-telemetry/` | OpenTelemetry + Sentry |
| `xai-crash-handler` | `crates/codegen/xai-crash-handler/` | 崩溃报告 |
| `xai-grok-update` | `crates/codegen/xai-grok-update/` | 自动更新 |
| `xai-grok-auth` | `crates/codegen/xai-grok-auth/` | 认证 |
| `xai-grok-config` | `crates/codegen/xai-grok-config/` | 配置加载 |
| `xai-grok-hooks` | `crates/codegen/xai-grok-hooks/` | Hook 系统 |
| `xai-grok-plugin-marketplace` | `crates/codegen/xai-grok-plugin-marketplace/` | 插件市场 |
| `xai-grok-memory` | `crates/codegen/xai-grok-memory/` | 持久记忆 |

## 真实入口（不依赖 README）

| 入口 | 文件 | Symbol | Lines |
| --- | --- | --- | --- |
| CLI main | `crates/codegen/xai-grok-pager-bin/src/main.rs` | `main()` | 1592 |
| TUI 启动 | `crates/codegen/xai-grok-pager/src/app/` | `run()` | — |
| Agent Stdio | `crates/codegen/xai-grok-shell/src/agent/app.rs` | `run_stdio_agent()` | — |
| Agent Leader | `crates/codegen/xai-grok-shell/src/agent/app.rs` | `run_leader()` | — |
| Agent Headless | `crates/codegen/xai-grok-shell/src/agent/app.rs` | `run_headless()` | — |
| Agent Serve | `crates/codegen/xai-grok-shell/src/agent/server.rs` | `run_agent_server()` | — |
| ACP Agent trait | `crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs` | `impl acp::Agent for MvpAgent` | 7 |
| Session Actor spawn | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/spawn.rs` | `SessionActor::spawn()` | — |
| Session run loop | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/run_loop.rs` | `run_session()` | 33 |
| Prompt handler | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs` | `handle_prompt()` | 210 |

## 推荐源码阅读顺序

1. `xai-grok-pager-bin/src/main.rs` — CLI 入口，理解命令路由
2. `xai-grok-shell/src/agent/mvp_agent/mod.rs` — MvpAgent 结构体定义
3. `xai-grok-shell/src/agent/mvp_agent/acp_agent.rs` — ACP trait 实现
4. `xai-grok-shell/src/session/acp_session_impl/spawn.rs` — SessionActor 创建
5. `xai-grok-shell/src/session/acp_session_impl/run_loop.rs` — 主事件循环
6. `xai-grok-shell/src/session/acp_session_impl/turn.rs` → `handle_prompt()`
7. `xai-grok-shell/src/session/acp_session_impl/sampler_turn.rs` — LLM 调用循环
8. `xai-grok-shell/src/session/acp_session_impl/tool_calls.rs` → `execute_tool_calls()` + `prepare_tool_call()`
9. `xai-grok-shell/src/session/acp_session_impl/tool_dispatch.rs` → `dispatch_tool()`
10. `xai-grok-tools/src/bridge.rs` — ToolBridge
11. `xai-grok-workspace/src/workspace_ops.rs` → `call_tool()`
12. `xai-grok-workspace/src/permission/` — 权限系统
13. `xai-chat-state/src/actor/mod.rs` — ChatStateActor
