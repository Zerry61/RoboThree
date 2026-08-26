# Project Overview — Codex CLI (openai/codex)

## 1. What It Is

**[F]** Codex CLI（[openai/codex](https://github.com/openai/codex)）是 OpenAI 官方开源的**本地运行 Coding Agent**。README 定位（[README.md:1-6](../../sources/codex/README.md#L1-L6)）：

> "Codex CLI is a coding agent from OpenAI that runs locally on your computer."

与三类产品区分：**Codex IDE 扩展**（VS Code / Cursor / Windsurf）、**Codex App**（桌面）、**Codex Web**（云端 ChatGPT 版）。本仓库是 **CLI** 形态的本地 agent，是 OpenAI 在 Coding Agent 领域的**参考实现**，也是其 MCP / sandbox / 扩展机制的官方样板。

## 2. License Snapshot

| Field | Value |
|---|---|
| License | Apache License 2.0 ([LICENSE](../../sources/codex/LICENSE)) |
| NOTICE | Present ([NOTICE](../../sources/codex/NOTICE)) |
| Rust workspace | `codex-rs/`（~117 crates，均继承 `license.workspace = true`） |
| npm 包装 | `@openai/codex`（[codex-cli/package.json](../../sources/codex/codex-cli/package.json)），`Apache-2.0` |

详见 [LICENSE-NOTES.md](LICENSE-NOTES.md)。

## 3. Study Target

| Field | Value |
|---|---|
| Repository | https://github.com/openai/codex |
| Branch | `main` |
| Commit SHA | `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7` |
| Commit date | 2026-08-13 |
| Commit subject | `Move codex-execpolicy to protocol dev dependencies (#38285)` |
| Research depth | Level 3 — 三机制深挖 |

## 4. Technology Stack

| Layer | Technology |
|---|---|
| 语言 | Rust（workspace 主体）；TypeScript（`sdk/typescript`、`codex-cli`）；Python（`sdk/python`） |
| 构建系统 | **Bazel**（[MODULE.bazel](../../sources/codex/MODULE.bazel)）+ **Cargo**（[codex-rs/Cargo.toml](../../sources/codex/codex-rs/Cargo.toml)）双轨 |
| 异步运行时 | Tokio（multi-thread，`rt-multi-thread`） |
| CLI 框架 | Clap（derive） |
| TUI | 自研（`codex-rs/tui`，Bubble Tea 风格事件循环） |
| 模型协议 | OpenAI Responses API（`codex-rs/responses-api-proxy`、`codex-api`） |
| 持久化 | SQLite（`codex-state`/`state_db`）+ JSONL rollout（`codex-rs/core/src/rollout.rs`）+ `codex-thread-store` |
| MCP | `rmcp`（第三方 Rust MCP 库）+ 自研 `codex-mcp` / `mcp-server` / `rmcp-client` |
| 沙箱 | Linux：Landlock + Bubblewrap；macOS：Seatbelt；Windows：Restricted Token / AppContainer |

## 5. Top-Level Layout

```
codex-cli/          npm 包装（bin/codex.js → 下载/调用 codex-rs 二进制）
codex-rs/           Rust workspace（~117 crates，核心实现）
  ├── core/          codex_core —— Agent Runtime 心脏
  ├── protocol/      codex_protocol —— 类型（ResponseItem / TurnInput / permissions / approvals）
  ├── cli/           CLI 入口（main.rs / lib.rs）
  ├── tui/           终端 UI
  ├── exec/ exec-server/ execpolicy/ sandboxing/ linux-sandbox/ bwrap/ process-hardening/
  ├── mcp-server/ codex-mcp/ rmcp-client/
  ├── ext/           extension-api + 12 个扩展 crate
  ├── core-plugins/ plugin/ skills/
  ├── model-provider/ models-manager/ backend-client/ responses-api-proxy/
  └── thread-store/ agent-graph-store/ history/ state/
sdk/                python / typescript SDK
docs/               文档
```

## 6. Real Entry Point

**[F]** 真实入口由源码与构建配置确认（非 README 推断）：

1. **npm 层**：[codex-cli/bin/codex.js](../../sources/codex/codex-cli/bin/codex.js) — `@openai/codex` 的 `bin`，负责下载/定位 `codex` 二进制并 `exec`。
2. **Rust CLI 层**：[codex-rs/cli/src/main.rs](../../sources/codex/codex-rs/cli/src/main.rs) — Clap 命令解析，通过 `codex_arg0::arg0_dispatch_or_else` 按 argv[0] 分发到 TUI / `exec` / `mcp` / `app` / `doctor` 等子命令。
3. **核心库层**：[codex-rs/core/src/lib.rs](../../sources/codex/codex-rs/core/src/lib.rs) — `codex_core`，导出 `ThreadManager` / `CodexThread` / `ModelClient` 等核心类型。

## 7. Verification Method

本研究**仅做静态源码分析**：

- 未 `cargo build` / `bazel build` / `go mod download` 等价物。
- 未运行 `codex` 二进制。
- 未运行任何测试、未启动容器 / MCP / sandbox。
- 未访问外部网络（仅 `git clone` 公开仓库）。
- 未读取任何 Secret。

**所有 `[F]` 结论均可由源码路径直接确认；运行时行为标注 `[I]` / `[UNKNOWN]。**
