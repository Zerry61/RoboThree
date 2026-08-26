# Project Overview — OpenCode

> **Repository**: https://github.com/opencode-ai/opencode
> **Target Ref**: `main` branch, commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb` (archived)
> **Research Date**: 2026-08-11
> **Method**: 静态源码分析（无运行时验证）

## 1. What Is OpenCode?

OpenCode 是一个 **基于 Go 的终端 AI coding assistant**，提供：

- TUI 交互模式（Bubble Tea）+ 非交互 CLI 模式（Cobra）。
- 多模型 Provider 支持（Anthropic / OpenAI / Gemini / Bedrock / Copilot / Vertex / Azure / Groq / OpenRouter / xAI / 本地 OpenAI-compatible endpoint）。
- 会话持久化（SQLite + Goose migrations）。
- 工具执行（bash / edit / fetch / glob / grep / ls / sourcegraph / view / patch / write / agent / MCP 动态工具）。
- LSP 集成（外部 language server 提供诊断）。
- 文件变更追踪（每次 write/edit/patch 写入 files 表）。
- Auto Compact（95% context window 阈值触发 summarization）。

**[F]** README 顶部（[README.md:1-5](../../sources/opencode/README.md#L1-L5)）：

> "This repository has been archived ... Project moved to ..."

**[F]** 当前源码对应归档前的最后 commit `73ee493`（2025-09-18）。项目已迁移至 Charm 团队维护的 Crush。

## 2. License Snapshot

| Aspect | Detail |
|---|---|
| **Primary License** | MIT ([LICENSE:1-20](../../sources/opencode/LICENSE#L1-L20)) |
| **Copyright Holder** | Kujtim Hoxha (2025) |
| **Copyleft Risk** | NONE |
| **Commercial Use** | Allowed; preserve copyright + license notice |
| **RoboThree Implication** | DESIGN_ONLY — MIT 允许复制设计模式；不可逐行复制第三方代码 |

**[F]** LICENSE 文件完整 MIT 文本（[LICENSE](../../sources/opencode/LICENSE)），授权复制、修改、分发、再授权，要求保留版权与许可证声明，无担保。

**[F]** 主要直接依赖（[go.mod](../../sources/opencode/go.mod)）均为 MIT / BSD / Apache-2.0 兼容许可，未发现 GPL / AGPL / 商业限制依赖。

| Dependency | License | 用途 |
|---|---|---|
| `anthropic-sdk-go` | MIT | Anthropic 模型客户端 |
| `openai-go` | Apache-2.0 | OpenAI 模型客户端 |
| `mcp-go` | MIT | Model Context Protocol |
| `bubbletea` | MIT | TUI 框架 |
| `ncruces/go-strftime` | MIT | 时间格式化 |
| `ncruces/go-sqlite3` | MIT | SQLite 驱动 |
| `pressly/goose` | MIT | 数据库迁移 |
| `cobra` | Apache-2.0 | CLI 框架 |
| `viper` | MIT | 配置加载 |

## 3. Technology Stack

| Component | Language / Framework | Purpose |
|---|---|---|
| CLI 入口 | Go + Cobra | `cmd/root.go` 命令解析 |
| TUI | Go + Bubble Tea | 终端交互界面 |
| Config | Go + Viper | 配置加载、环境变量 |
| Database | SQLite + Goose + sqlc | 会话、消息、文件历史持久化 |
| Provider | 多家（Anthropic / OpenAI / Gemini / Bedrock / Copilot / Vertex / Azure / Groq / OpenRouter / xAI / 本地） | 模型调用抽象 |
| MCP | mcp-go (stdio / SSE) | Model Context Protocol 客户端 |
| LSP | 外部 language server (jsonrpc2) | 代码智能、诊断 |
| Permission | 自实现 pubsub/event | 工具执行前拦截 |

## 4. Monorepo Structure

OpenCode 不是 monorepo，是单 module：

```
opencode/
├── main.go                  # 程序入口
├── cmd/root.go              # Cobra 根命令
├── internal/
│   ├── app/                 # App 装配 + 非交互路径
│   ├── config/              # Viper 配置
│   ├── db/                  # SQLite + Goose migrations + sqlc
│   ├── diff/                # 文件 diff
│   ├── fileutil/            # 文件工具
│   ├── format/              # 输出格式化
│   ├── history/             # 文件历史 Service
│   ├── llm/                 # Agent / Provider / Tools / Models / Prompt
│   ├── logging/             # 日志
│   ├── lsp/                 # LSP 客户端
│   ├── message/             # 消息 Service
│   ├── permission/          # Permission Service
│   ├── pubsub/              # 事件 broker
│   ├── session/             # Session Service
│   ├── tui/                 # Bubble Tea TUI
│   └── version/             # 版本号
├── scripts/                 # 仓库脚本
├── install                  # 安装脚本
├── opencode-schema.json     # OpenAPI Schema
├── sqlc.yaml                # sqlc 配置
├── go.mod / go.sum
├── README.md
└── LICENSE
```

**[F]** 顶层结构经 `ls sources/opencode/` 与源码读取确认。

## 5. Key Entry Points

| Component | Entry File | Function / Symbol |
|---|---|---|
| 程序入口 | [main.go:8-14](../../sources/opencode/main.go#L8-L14) | `main()` → `cmd.Execute()` |
| Cobra 根 | [cmd/root.go:24-184](../../sources/opencode/cmd/root.go#L24-L184) | `rootCmd.RunE` |
| App 装配 | [internal/app/app.go:42-81](../../sources/opencode/internal/app/app.go#L42-L81) | `app.New()` |
| 非交互 | [internal/app/app.go:100-161](../../sources/opencode/internal/app/app.go#L100-L161) | `App.RunNonInteractive()` |
| Agent Run | [internal/llm/agent/agent.go:198-231](../../sources/opencode/internal/llm/agent/agent.go#L198-L231) | `agent.Run()` |
| Agent 主循环 | [internal/llm/agent/agent.go:233-311](../../sources/opencode/internal/llm/agent/agent.go#L233-L311) | `processGeneration()` |
| Stream 处理 | [internal/llm/agent/agent.go:322-438](../../sources/opencode/internal/llm/agent/agent.go#L322-L438) | `streamAndHandleEvents()` |
| Provider 抽象 | [internal/llm/provider/provider.go:12-57](../../sources/opencode/internal/llm/provider/provider.go#L12-L57) | `Provider` interface |
| Bash Tool | [internal/llm/tools/bash.go:206-327](../../sources/opencode/internal/llm/tools/bash.go#L206-L327) | `bashTool.Run()` |
| Permission | [internal/permission/permission.go:74-108](../../sources/opencode/internal/permission/permission.go#L74-L108) | `permissionService.Request()` |

## 6. Deployment Models

OpenCode 是 **本地终端应用**，无服务端：

- 单用户单进程。
- 数据目录：`<config.DataDir>/opencode.db`（[internal/db/connect.go:17-66](../../sources/opencode/internal/db/connect.go#L17-L66)），权限 `0o700`。
- 无 server 模式，无 remote worker，无 cloud 同步。

**[F]** README 与 `cmd/root.go` 均未提及 server / daemon 模式。所有运行路径都在用户本地进程内。

## 7. Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| 项目定位 / 技术栈 | HIGH | README + go.mod + 源码三角验证 |
| License | HIGH | LICENSE 文件直接读取 |
| 入口与启动链路 | HIGH | main.go + cmd/root.go 直接确认 |
| App 装配 | HIGH | internal/app/app.go 完整阅读 |
| Agent 主循环 | HIGH | agent.go 完整阅读 |
| Provider 抽象 | HIGH | provider.go + anthropic.go + openai.go 三角验证 |
| Tool Runtime | HIGH | tools.go + bash.go + shell.go + write.go 阅读 |
| Permission 机制 | HIGH | permission.go + bash.go + write.go 阅读 |
| **运行时行为（取消、重试、超时）** | MEDIUM | 静态代码路径确认；未运行时验证 |
| **安全边界强度** | MEDIUM | 静态分析确认薄弱点；未做 fuzz / 渗透测试 |
| Auto Compact 行为 | MEDIUM | 源码可见但 TUI 文案与实现不一致 |
| Message parts 持久化 | HIGH | message.go + migrations + sql 文件交叉验证 |

**Overall**：基于 README + GitHub API + tarball 源码 + 关键文件逐行阅读得出的静态结论；未运行项目、未跑测试、未做安全 fuzz。