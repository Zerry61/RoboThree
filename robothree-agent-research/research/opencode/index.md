# OpenCode — Research Index

## Project Identity

| Field | Value |
|---|---|
| **Repository** | https://github.com/opencode-ai/opencode |
| **Study Target** | branch `main`, commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb` (2025-09-18, archived) |
| **License** | MIT (`LICENSE`, Copyright (c) 2025 Kujtim Hoxha) |
| **Language** | Go 1.24 |
| **Research Depth** | Level 3 — Three-Mechanism Deep Dive |
| **Research Method** | 静态源码分析（Static source analysis only，未运行项目） |

## Project Status Caveat

**[F]** README 顶部说明（[README.md:1-5](../../sources/opencode/README.md#L1-L5)）：
> "This repository has been archived. ... Project moved to ..."

仓库已被作者归档并迁移到 Crush（Charm 团队）继续维护。本研究分析的是归档前的最后一份公开源码（commit `73ee493`），不代表 Crush 后续演进。

## Research Status

| Stage | Status | Date |
|---|---|---|
| Stage A: Project Identification | ✅ Complete | 2026-08-11 |
| Stage B: Core Runtime Trace | ✅ Complete | 2026-08-11 |
| Stage C1: L3 Deep Dive — Agent Loop + Serial Tool Dispatch | ✅ Complete | 2026-08-11 |
| Stage C2: L3 Deep Dive — Permission + Persistent Shell | ✅ Complete | 2026-08-11 |
| Stage C3: L3 Deep Dive — Session / Context / Auto-Compact | ✅ Complete | 2026-08-11 |
| Stage D: RoboThree Mapping | ✅ Complete | 2026-08-11 |
| Final Review | ✅ Complete | 2026-08-11 |

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
| [agent-loop-tool-dispatch-l3.md](agent-loop-tool-dispatch-l3.md) | Agent Loop + 串行 Tool Dispatch + Cancellation | 主循环是核心机制；模型→工具→DB→下一轮的串行约束影响所有层 |
| [permission-persistent-shell-l3.md](permission-persistent-shell-l3.md) | Permission System + Persistent Shell Security Boundary | 唯一的安全边界；非交互模式自动批准；持久化 shell 共享状态 |
| [session-context-autocompact-l3.md](session-context-autocompact-l3.md) | Session / Context Pipeline / 95% Auto-Compact | SQLite 消息 parts + summary marker + 95% 触发是 context 治理核心 |

### Advanced

| File | Description |
|---|---|
| [final-review.md](final-review.md) | Level 3 30-item full self-check |

## L3 Mechanism Selection Rationale

Level 3 的"专项深挖"不是 Level 2 的全量展开。基于 Stage A/B 的源码识别，三个机制被认为最能代表 OpenCode 的架构贡献 / 风险点：

1. **Agent Loop + 串行 Tool Dispatch + Cancellation** — 这是 OpenCode 与大多数单文件 Agent（如 Hermes Agent）最显著的差异点。Provider stream → in-memory assistant message → DB write → serial tool call → DB write → next round，整个流程的失败/取消/恢复路径是 RoboThree 借鉴时必须复刻的设计。

2. **Permission + Persistent Shell Security Boundary** — OpenCode 没有 OS sandbox、没有容器隔离、没有网络沙箱；唯一的边界是"command allowlist + file path permission + non-interactive auto-approve"。这一机制同时是它最危险的薄弱点。

3. **Session / Context / Auto-Compact** — 95% 上下文触发 Auto Compact 是 README 公开宣传的能力，但其实现是"在同一 session 内插入 SummaryMessageID"，而非 TUI 文案声称的"新建 session"。这一文档/实现不一致必须在 L3 报告中明确。

## Key Architectural Conclusion (Summary)

OpenCode 是一个 **Go 写的终端 Coding Agent**，整体架构特征：

1. **Cobra CLI + Bubble Tea TUI** 单一二进制入口（[main.go:1-15](../../sources/opencode/main.go#L1-L15)）。
2. **三层 Agent 模型**：Coder（主）、Title、Task、Summarizer — 各自独立的 Provider 实例，但共享同一个进程。
3. **Provider 抽象**用 channel 返回事件流；Anthropic / OpenAI / Gemini / Bedrock / Copilot / Vertex 等多家实现共用同一事件协议（[internal/llm/provider/provider.go:12-57](../../sources/opencode/internal/llm/provider/provider.go#L12-L57)）。
4. **Tool Runtime** 是 `[]tools.BaseTool` 列表 + `BaseTool.Run(ctx, call)` 接口；每个 Tool Call 串行执行，permission deny 会取消后续同批 tool call（[internal/llm/agent/agent.go:322-438](../../sources/opencode/internal/llm/agent/agent.go#L322-L438)）。
5. **Persistence** 用 SQLite + Goose migrations；message parts 以带 type tag 的 JSON 存储（[internal/db/connect.go:1-66](../../sources/opencode/internal/db/connect.go#L1-L66)）。
6. **Subagent** 通过 `agent` tool 创建同进程、独立 session、受限 ToolSet 的子 agent；父 agent 同步等待子 agent 完成（[internal/llm/agent/agent-tool.go:1-96](../../sources/opencode/internal/llm/agent/agent-tool.go#L1-L96)）。
7. **MCP** 支持 stdio 和 SSE；tool 执行前同样走 permission service（[internal/llm/agent/mcp-tools.go:1-200](../../sources/opencode/internal/llm/agent/mcp-tools.go#L1-L200)）。
8. **Permission** 用 event/channel pattern：tool 阻塞等待 `<-respCh`；非交互模式 `AutoApproveSession()` 直接返回 true（[internal/permission/permission.go:74-112](../../sources/opencode/internal/permission/permission.go#L74-L112)）。
9. **Auto Compact** 在 95% context 阈值触发，调用 summarizer Provider 写入 summary message 并设置 `SummaryMessageID`，下一轮从 summary 截断历史（[internal/llm/agent/agent.go:535-704](../../sources/opencode/internal/llm/agent/agent.go#L535-L704)）。

## Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| Architecture overview | HIGH | 多个独立源码交叉验证（main.go, app.go, agent.go） |
| Agent Loop call chain | HIGH | 完整追踪 run/processGeneration/streamAndHandleEvents/processEvent |
| Provider 抽象 | HIGH | provider.go + anthropic.go + openai.go 三角验证 |
| Tool Runtime | HIGH | tools.go + agent.go + 多个 tool 实现 |
| Permission 行为 | HIGH | permission.go + bash.go + write.go 三处确认 |
| **安全边界（Persistent Shell）** | MEDIUM | 静态推断；未做运行时 fuzz 或进程树验证 |
| **Auto Compact 行为** | MEDIUM | 源码可见但 README/TUI 文案与实现不一致 |
| 取消路径 | MEDIUM | 静态代码路径已确认；未运行验证 cancel 时机 |
| Message parts 持久化 | HIGH | message.go + migrations + sql 文件交叉验证 |

## Verification Method

本研究仅做静态源码分析：

- 没有 `go mod download`。
- 没有 `go test` / `go build`。
- 没有运行 opencode。
- 没有启动 MCP / LSP server。
- 没有访问外部网络（仅 tarball 下载）。
- 没有读取任何 Secret。

**所有 [F] 结论必须能由源码路径直接确认；运行时行为只能标注 [I] / [UNKNOWN]。**