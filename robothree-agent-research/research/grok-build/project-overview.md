# grok-build — Project Overview

## 元信息

| 属性 | 值 |
| --- | --- |
| 项目名称 | grok-build (CLI binary: `grok`) |
| 仓库 | `xai-org/grok-build` (GitHub 公开镜像) |
| 组织 | SpaceXAI |
| 分析 Commit | `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce` |
| 源码来源 | SpaceXAI monorepo → 定期同步到此公开仓库 |
| 语言 | Rust (rust-toolchain.toml 锁定工具链版本) |
| 构建系统 | Cargo workspace (~80+ crates) |
| 主要二进制产物 | `xai-grok-pager` (对外安装后 symlink 为 `grok`) |
| 分析日期 | 2026-07-18 |

## 项目定位

`grok-build` 是 SpaceXAI 的**终端 AI 编码 Agent**。它作为全屏 TUI 运行，理解代码库、编辑文件、执行 Shell 命令、搜索网络、管理长时间任务——支持交互式、脚本/CI headless 模式和通过 ACP（Agent Client Protocol）嵌入 IDE。

核心能力：Coding Agent + Computer Use Agent + Multi-Agent（Subagent）。

## License Snapshot

| 属性 | 值 |
| --- | --- |
| 第一方代码许可证 | Apache License 2.0 |
| SPDX | Apache-2.0 |
| LICENSE 文件 | 仓库根目录 `LICENSE` |
| 第三方代码 | openai/codex 工具实现（port）、sst/opencode 工具实现（port）——见 `THIRD_PARTY_NOTICES` 和 `crates/codegen/xai-grok-tools/THIRD_PARTY_NOTICES.md` |
| Vendored 代码 | Mermaid 图表栈 (`third_party/`)，见 `third_party/NOTICE` |
| 复用风险评估 | 第一方代码为 Apache 2.0（宽松）；codex/opencode port 部分需单独审查原许可证。不建议直接复制 vendored 代码。 |
| 复用等级 | `DESIGN_ONLY` — 参考架构模式与接口设计，不直接复用代码 |

## 技术栈

| 纬度 | 技术 |
| --- | --- |
| 语言 | Rust |
| 异步运行时 | Tokio (multi-thread, enable_all) |
| TUI 框架 | ratatui (自维护 fork: `xai-ratatui-*`) |
| HTTP 客户端 | reqwest (通过 `xai-grok-http`) |
| LLM 协议 | OpenAI-compatible API (OaiCompatClient) |
| 序列化 | serde / serde_json |
| MCP 集成 | rmcp (MCP client/server) |
| 数据库 | SQLite (通过 `xai-sqlite-journal`) |
| 进程管理 | PTY (通过 `ptyctl`) |
| 内存分配器 | jemalloc (可选 feature) |
| 构建依赖 | protoc (via DotSlash) |

## 运行模式

共 5 种运行模式，以 CLI subcommand 区分：

| 模式 | CLI 参数 | 核心调度函数 | 说明 |
| --- | --- | --- | --- |
| TUI | `grok` (无参数) | `xai_grok_pager::app::run()` | 全屏交互 |
| Headless | `grok -p "..."` | `xai_grok_pager::headless::run_single_turn()` | 单轮 prompt → 输出 |
| Agent Stdio | `grok agent stdio` | `run_stdio_agent()` | ACP JSON-RPC stdin/stdout |
| Agent Leader | `grok agent leader` | `run_leader()` | 常驻后台进程，多客户端共享 |
| Agent Serve | `grok agent serve` | `run_agent_server()` | WebSocket 服务端 |
| Headless (–leader) | `grok -p "..." --leader` | `connect_or_spawn()` → leader relay | headless 通过 leader 执行 |

[F] 来源: `crates/codegen/xai-grok-pager-bin/src/main.rs:1294-1387` — `run_agent_command()` 中 `AgentCmd` match 分支。

## 项目规模

- **Crate 总数**: ~80+ (含 common/build/prod 辅助)
- **核心 Agent Crate**: ~20
- **代码总行数**: 未精确统计（Cargo.lock + workspace 元数据不计入；估算核心 crates >200K LoC）
- **测试**: 各 crate 有独立 `tests/` 目录和 `#[cfg(test)] mod tests`

## 顶层目录

| 路径 | 内容 |
| --- | --- |
| `crates/codegen/` | 主代码 crate (~60+) |
| `crates/build/` | 构建辅助 crate (proto 生成) |
| `crates/common/` | 共享 leaf crate |
| `bin/` | DotSlash 工具 (protoc) |
| `third_party/` | Vendored Mermaid |
| `.cargo/` | Cargo config |
| `Cargo.toml` | 生成的 workspace root（只读） |
| `SOURCE_REV` | 完整 monorepo commit SHA |

## 已知限制

1. 外部贡献不接受 (CONTRIBUTING.md)。
2. Root Cargo.toml 是生成的，不可编辑。
3. Windows 构建是 best-effort，未从此仓库测试。
4. 从 monorepo 同步而来，可能缺少某些内部工具链。
