# Final Review — OpenCode L3 Research

> **Repository**: https://github.com/opencode-ai/opencode
> **Target Ref**: `main` branch, commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb` (2025-09-18, archived)
> **License**: MIT
> **Research Date**: 2026-08-11
> **Method**: 静态源码分析（无运行时验证）

## 1. Research Summary

### 1.1 What Was Studied

OpenCode（[opencode-ai/opencode](https://github.com/opencode-ai/opencode)）— 一个 Go 写的终端 AI coding assistant，commit `73ee493` 是归档前的最后公开版本。已迁移到 Charm 团队的 Crush。

### 1.2 Research Depth: Level 3

三个机制深挖：

1. **Agent Loop + Serial Tool Dispatch + Cancellation** — `processGeneration` / `streamAndHandleEvents` / `processEvent` 的完整调用链；Cancel via `sync.Map` + `context.CancelFunc`。
2. **Permission + Persistent Shell Security Boundary** — 唯一安全边界；非交互模式自动批准；持久 shell 共享 env/cwd。
3. **Session / Context / Auto-Compact** — SQLite 消息 parts + summary marker + 95% 触发；TUI 文案与实现不一致。

### 1.3 Key Findings

- OpenCode 的 Agent loop 是 **stream → event-driven DB write → serial tool dispatch → next round** 的清晰模式，可被 RoboThree 直接借鉴。
- 工具调用**严格串行**，permission deny 取消同批后续 tool calls——这是 OpenCode 与 Claude Code / Hermes / Pi 的关键差异。
- Provider 抽象统一 10 种 event type，channel 流式返回，简化了 Agent runtime 与 UI 解耦。
- **安全性是 OpenCode 的最薄弱环节**：无 OS sandbox、无网络沙箱、无 timeout 的 permission channel、persistent shell 单例、非交互 auto-approve。
- Auto Compact 是 **in-place summary marker**（不是 README/TUI 声称的"create new session"），doc-vs-code 不一致。
- Message Parts 序列化可能存在 image URL 丢失 bug（静态发现）。
- SQLite + Goose + sqlc 三栈组合对单用户 Agent 足够；schema 设计清晰。
- 95% 阈值偏激进；summarize 期间 IsSessionBusy 不返回 true，存在并发风险。

## 2. Level 2 Self-Check (10 Items)

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Commit SHA 固定 | ✅ | `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`（2025-09-18） |
| 2 | License 检查 | ✅ | MIT（[LICENSE](../../sources/opencode/LICENSE) Copyright (c) 2025 Kujtim Hoxha） |
| 3 | 真实入口确认 | ✅ | main.go:8-14 → cmd/root.go:24-184，非 README 推断 |
| 4 | Agent 主循环定位 | ✅ | agent.go:233-311 `processGeneration` + agent.go:322-438 `streamAndHandleEvents` |
| 5 | E2E 调用链 | ✅ | 42-hop chain with Mermaid + Hop Evidence（[runtime-sequence.md](runtime-sequence.md)） |
| 6 | Hop Evidence 表 | ✅ | 42 rows（含 subagent / compact / fetch 等补充路径） |
| 7 | Permission/Security 检查 | ✅ | [permission-persistent-shell-l3.md](permission-persistent-shell-l3.md) 独立报告 |
| 8 | FACT/INFERENCE/RECOMMENDATION/UNKNOWN | ✅ | 所有结论带类型标签 |
| 9 | RoboThree 5-classification | ✅ | 22 项分类（4 ADOPT / 6 ADAPT / 4 DEFER / 5 REJECT / 3 NEEDS_MORE_EVIDENCE） |
| 10 | Required 7 products | ✅ | index / project-overview / source-map / architecture / runtime-sequence / robothree-fit-analysis / open-questions |

## 3. Level 3 Extended Self-Check (30 Items)

### Source Evidence Quality

| # | Check | Status |
|---|---|---|
| 1 | Every FACT has ≥1 source reference | ✅ |
| 2 | Complex conclusions have ≥2 independent sources | ✅ Agent loop: agent.go + agent-tool.go + tui.go；Permission: permission.go + bash.go + write.go |
| 3 | No INFERENCE marked as FACT | ✅ |
| 4 | No README-only conclusions | ✅ 所有结论基于源码；README 仅用于归档状态声明 |
| 5 | Symbol names used | ✅ `processGeneration`、`streamAndHandleEvents`、`processEvent`、`GetPersistentShell`、`TrackUsage` |
| 6 | File paths are repo-relative | ✅ `internal/llm/agent/agent.go` 等 |
| 7 | Commit SHA recorded | ✅ `73ee493265acf15fcd8caab2bc8cd3bd375b63cb` |
| 8 | Evidence type per hop | ✅ SOURCE / INFERENCE in Hop Evidence |

### Architecture Analysis

| # | Check | Status |
|---|---|---|
| 9 | Agent loop traced end-to-end | ✅ 42-hop chain from user input to final response |
| 10 | Tool pipeline traced | ✅ Define → Register → Dispatch → Execute → Persist |
| 11 | Context pipeline traced | ✅ List history → truncate summary → create user message → stream → next round |
| 12 | Exception paths documented | ✅ Cancel / permission deny / provider error / tool not found / shell panic |
| 13 | Permission/Security NOT skipped | ✅ 独立 [permission-persistent-shell-l3.md](permission-persistent-shell-l3.md) + 主报告 §9-§10 |
| 14 | No empty template files | ✅ 11 个文件全部有实质内容 |

### Deep Dive Completeness

| # | Check | Criteria | Status |
|---|---|---|---|
| 15 | Mechanism #1: Complete call chain | All symbols, files, hops | ✅ [agent-loop-tool-dispatch-l3.md](agent-loop-tool-dispatch-l3.md) §2-§3 |
| 16 | Mechanism #1: Failure/recovery paths | Cancel, error, retry | ✅ §4-§5 |
| 17 | Mechanism #1: Comparison | At least 2 other frameworks | ✅ §7 对比 Claude Code / Hermes / Pi |
| 18 | Mechanism #1: RoboThree mapping | ADOPT/ADAPT/DEFER/REJECT | ✅ §8 |
| 19 | Mechanism #2: Complete lifecycle | From request to response | ✅ [permission-persistent-shell-l3.md](permission-persistent-shell-l3.md) §2 |
| 20 | Mechanism #2: Path branches | AutoApprove / SessionPermission / Dialog | ✅ §2.2-§2.5 |
| 21 | Mechanism #2: Security patterns | Allowlist / Denylist / Persistent shell | ✅ §3-§4 |
| 22 | Mechanism #2: RoboThree mapping | With security concerns | ✅ §8 |
| 23 | Mechanism #3: Data model | Full schema with examples | ✅ [session-context-autocompact-l3.md](session-context-autocompact-l3.md) §2-§3 |
| 24 | Mechanism #3: Context reconstruction | Algorithm-level detail | ✅ §4 processGeneration 流程 |
| 25 | Mechanism #3: Known issues | Doc-vs-code discrepancy, imageURL bug | ✅ §6.3 + §3.3 |
| 26 | Mechanism #3: RoboThree mapping | With fixes for known bugs | ✅ §11 |

### RoboThree Mapping

| # | Check | Status |
|---|---|---|
| 27 | 5-classification complete | ✅ 22 items: 4 ADOPT, 6 ADAPT, 4 DEFER, 5 REJECT, 3 NEEDS_MORE_EVIDENCE |
| 28 | Each classification has reason + evidence + risk | ✅ |
| 29 | Proposed RoboThree Changes section | ✅ 12 candidate changes |
| 30 | Requires Human Approval section | ✅ 8 decisions PENDING_HUMAN_DECISION |

## 4. Evidence Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| 项目定位 + License | HIGH | README + LICENSE + GitHub API + tarball |
| 入口与启动链路 | HIGH | main.go + cmd/root.go 直接确认 |
| Agent 主循环 | HIGH | agent.go 完整阅读 + 三段函数交叉验证 |
| Provider 抽象 | HIGH | provider.go + anthropic.go + openai.go 三角验证 |
| Tool Runtime | HIGH | tools.go + bash.go + shell.go + write.go 阅读 |
| Permission 机制 | HIGH | permission.go + bash.go + write.go + mcp-tools.go 阅读 |
| Auto Compact 流程 | HIGH | agent.go:535-704 + tui.go:306-341 阅读 |
| **运行时取消行为** | MEDIUM | 静态代码路径确认；未运行时验证 cancel 时机 |
| **持久 shell 实际行为** | MEDIUM | 静态推断；未做 fuzz / 进程树验证 |
| **summarize 期间并发** | MEDIUM | 静态发现 IsSessionBusy 不含 summarize key；未运行时验证 |
| **message parts 反序列化** | MEDIUM | 静态发现 imageURL 丢失嫌疑；未跑测试 |
| **security 边界强度** | MEDIUM | 静态分析确认薄弱点；未做渗透测试 |
| Token 累加 / Cost 计算精度 | MEDIUM | 静态公式明确；未 long-running 测试 |

## 5. Limitations

### 5.1 仓库归档

**[F]** README 顶部明确归档（[README.md:1-5](../../sources/opencode/README.md#L1-L5)）。

- 分析基于 commit `73ee493` (2025-09-18)，是最后公开版本。
- 项目迁移到 Crush（Charm 团队）；后续设计演进**不在本研究范围**。
- 用户明确要求研究 OpenCode 归档版本，故 Crush 视为后续项目。

### 5.2 无运行时验证

本研究**仅做静态源码分析**：

- 没有 `go mod download`。
- 没有 `go test` / `go build`。
- 没有运行 opencode。
- 没有启动 MCP / LSP server。
- 没有访问外部网络（仅 tarball 下载）。
- 没有读取任何 Secret。

**Impact**：运行时行为（cancel 时机、permission timeout 风险、persistent shell 进程树、summarize 并发）只能标注 `[I] / [UNKNOWN]`。

**Mitigation**：跨多个独立文件交叉验证；所有 [F] 结论都能由源码路径直接确认；[I] 明确标注为推断。

### 5.3 单版本点

分析目标 commit `73ee493` (2025-09-18)。

- OpenCode 本身已停止演进。
- Crush 可能修复了部分问题，但本研究不覆盖 Crush。

### 5.4 网络环境限制

- `git clone` 失败（git port 443 timeout）。
- 改用 GitHub API + tarball 下载。
- 浅克隆 / 完整 tarball 对静态分析足够。
- 但无法 `git log` / `git blame` 验证历史 commit。

## 6. Research Quality Assessment

| Dimension | Score | Notes |
|---|---|---|
| **Completeness** | 92/100 | 7 required + 3 conditional + final-review 全部完成；源码逐行阅读 |
| **Evidence Quality** | 88/100 | 每个 FACT 有 ≥1 source；复杂结论多源交叉；但无运行时验证 |
| **RoboThree Relevance** | 95/100 | 22 项 actionable 分类 + 12 候选变更 + 8 决策项 |
| **Actionability** | 90/100 | 明确"ADOPT"和"REJECT"边界；安全弱点具体到代码行号 |
| **Reproducibility** | 85/100 | tarball + 固定 SHA 完整可重放；其他研究者可重复 |

## 7. Notable Findings for RoboThree

### 7.1 强烈推荐的 ADOPT

| # | 机制 | 来源文件 |
|---|---|---|
| 1 | SQLite + Goose + sqlc 三栈 | [internal/db/connect.go](../../sources/opencode/internal/db/connect.go)、[migrations](../../sources/opencode/internal/db/migrations/) |
| 2 | Provider 抽象统一 10 种 event | [internal/llm/provider/provider.go](../../sources/opencode/internal/llm/provider/provider.go) |
| 3 | Tool Call 严格串行 + Permission Deny 级联取消同批 | [internal/llm/agent/agent.go:352-420](../../sources/opencode/internal/llm/agent/agent.go#L352-L420) |
| 4 | 每个 event 写 DB（DB-of-truth） | [internal/llm/agent/agent.go:445-492](../../sources/opencode/internal/llm/agent/agent.go#L445-L492) |

### 7.2 强烈建议 REJECT（安全风险）

| # | 机制 | 风险 | 来源文件 |
|---|---|---|---|
| 1 | Persistent Shell 单例 | 等价于无沙箱 | [internal/llm/tools/shell/shell.go](../../sources/opencode/internal/llm/tools/shell/shell.go) |
| 2 | Non-Interactive AutoApprove all | CI 场景便利性 vs 风险失衡 | [internal/app/app.go:129](../../sources/opencode/internal/app/app.go#L129) |
| 3 | Permission channel 无 timeout | 永久阻塞风险 | [internal/permission/permission.go:106](../../sources/opencode/internal/permission/permission.go#L106) |
| 4 | Command Denylist 字符串前缀 | 容易被绕过 | [internal/llm/tools/bash.go:246-263](../../sources/opencode/internal/llm/tools/bash.go#L246-L263) |
| 5 | Path Permission 字符串前缀 | 误判授权 | [internal/llm/tools/write.go:166](../../sources/opencode/internal/llm/tools/write.go#L166) |

### 7.3 文档/实现不一致

| # | 项目 | 文档/UI | 实现 | 状态 |
|---|---|---|---|---|
| 1 | Auto Compact | README / TUI 文案："Create new session" | 在原 session 设置 SummaryMessageID | NEEDS_HUMAN_DECISION |

## 8. Next Steps

### 8.1 RoboThree Decision Gates

1. 用户审阅 [robothree-fit-analysis.md](robothree-fit-analysis.md) 中 12 个候选变更（C1-C12）。
2. 用户拍板 [robothree-fit-analysis.md](robothree-fit-analysis.md) §4 中 8 个 PENDING_HUMAN_DECISION 项（H1-H8）。
3. 用户批准后：将 ADOPT 决策转化为 ADR 或正式架构文档（**仅在用户明确授权时**）。
4. 用户批准后：基于 ADOPT 的机制开始 RoboThree Phase 1 实施。

### 8.2 验证后续问题（如有资源）

1. `git clone https://github.com/opencode-ai/opencode`（如网络允许）→ 验证行号。
2. `go test ./internal/message/...` 验证 imageURL Part bug 是否真存在。
3. `go test -race ./internal/permission/...` 验证 data race。
4. 对比 Crush 仓库看哪些问题被修复。

### 8.3 范围声明

**本研究是 RoboThree Agent Architecture Intelligence Base 的 L3 级别专项调研**，不替代：

- RoboThree 产品设计文档。
- RoboThree ADR。
- RoboThree 正式架构决策。

所有结论仅在用户明确批准"将研究结论提升为正式架构决策"后，才会被搬入正式仓库或 ADR。