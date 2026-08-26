# Final Review — Codex CLI L3 Research

> **Repository**: https://github.com/openai/codex
> **Target Ref**: `main` branch, commit `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7` (2026-08-13)
> **License**: Apache-2.0
> **Research Date**: 2026-08-13
> **Method**: 静态源码分析（无运行时验证）
> 本文件为验收自检清单；其中引用的源码路径均为 **[F]**（Fact）。

## 1. Research Summary

### 1.1 What Was Studied

Codex CLI（[openai/codex](https://github.com/openai/codex)）— OpenAI 官方开源的本地 Coding Agent，Rust workspace ~117 crates，Apache-2.0。

### 1.2 Research Depth: Level 3

三个机制深挖：

1. **Agent Turn Loop + Concurrent Tool Dispatch + Cancellation** — `run_turn` / `run_sampling_request` / `try_run_sampling_request` 三层循环；`FuturesOrdered` + RwLock 并行门；分级取消。
2. **Sandbox + Exec Policy (Approval) Security Boundary** — `AskForApproval` 四模式 + `render_decision_for_unmatched_command` 决策矩阵 + 多后端沙箱 + 升级流。
3. **Extension / Plugin / Skills / MCP** — 进程内 Extension（12 contributor）/ Plugin（marketplace）/ Skill（SKILL.md）/ 双向 MCP。

### 1.3 Key Findings

- Codex 用 **Thread→Turn→Sampling→Tool 四层粒度**表达运行时，是最清晰的分层骨架之一。
- 工具执行**并发**：RwLock 门让「可并发工具」共享读锁、「串行工具」独占写锁，比 OpenCode 全串行精细。
- 安全是**三层 defense-in-depth**（决策/隔离/升级），而非单点 gate，是 Coding Agent 里最完整的。
- 扩展有**四条并行机制**，按「隔离成本×集成深度」分层，而非单一接口。
- 分级取消（立即 kill / 优雅清理）避免持久 shell 留孤儿进程。
- `AskForApproval::Never` + 无沙箱直接 Allow 是激进配置，违反 default-deny。
- 沙箱命名有轻微不一致（`LinuxSeccomp` 实际用 Landlock/Bwrap）。

## 2. Level 2 Self-Check (10 Items)

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Commit SHA 固定 | ✅ | `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7`（2026-08-13） |
| 2 | License 检查 | ✅ | Apache-2.0（[LICENSE](../../sources/codex/LICENSE)） |
| 3 | 真实入口确认 | ✅ | codex-cli/bin/codex.js → cli/main.rs → core/lib.rs，非 README 推断 |
| 4 | Agent 主循环定位 | ✅ | turn.rs:153 `run_turn` + turn.rs:1325 `run_sampling_request` |
| 5 | E2E 调用链 | ✅ | 21-hop chain with Mermaid + Hop Evidence（[runtime-sequence.md](runtime-sequence.md)） |
| 6 | Hop Evidence 表 | ✅ | 21 rows（含取消/重试/压缩补充路径） |
| 7 | Permission/Security 检查 | ✅ | [sandbox-execpolicy-l3.md](sandbox-execpolicy-l3.md) 独立报告 |
| 8 | FACT/INFERENCE/RECOMMENDATION/UNKNOWN | ✅ | 所有结论带类型标签 |
| 9 | RoboThree 5-classification | ✅ | 22 项分类（6 ADOPT / 11 ADAPT / 3 DEFER / 1 REJECT / 1 NEEDS_MORE_EVIDENCE） |
| 10 | Required 7 products | ✅ | index / project-overview / source-map / architecture / runtime-sequence / robothree-fit-analysis / open-questions |

## 3. Level 3 Extended Self-Check (30 Items)

### Source Evidence Quality

| # | Check | Status |
|---|---|---|
| 1 | Every FACT has ≥1 source reference | ✅ |
| 2 | Complex conclusions have ≥2 independent sources | ✅ 主循环: turn.rs + tasks/regular.rs + stream_events_utils.rs；安全: exec_policy.rs + protocol.rs + sandboxing |
| 3 | No INFERENCE marked as FACT | ✅ |
| 4 | No README-only conclusions | ✅ 所有结论基于源码；README 仅用于定位声明 |
| 5 | Symbol names used | ✅ `run_turn`、`run_sampling_request`、`try_run_sampling_request`、`handle_tool_call_with_source`、`render_decision_for_unmatched_command` |
| 6 | File paths are repo-relative | ✅ `codex-rs/core/src/session/turn.rs` 等 |
| 7 | Commit SHA recorded | ✅ `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7` |
| 8 | Evidence type per hop | ✅ SOURCE / INFERENCE in Hop Evidence |

### Architecture Analysis

| # | Check | Status |
|---|---|---|
| 9 | Agent loop traced end-to-end | ✅ 21-hop chain from user input to final response |
| 10 | Tool pipeline traced | ✅ Define → Register → Dispatch → Execute → Persist |
| 11 | Context pipeline traced | ✅ clone_history.for_prompt → build_prompt → stream → compact |
| 12 | Exception paths documented | ✅ Cancel / retry / context-exceeded / rate-limit / tool fatal |
| 13 | Permission/Security NOT skipped | ✅ 独立 [sandbox-execpolicy-l3.md](sandbox-execpolicy-l3.md) + architecture.md §6 |
| 14 | No empty template files | ✅ 11 个文件全部有实质内容 |

### Deep Dive Completeness

| # | Check | Criteria | Status |
|---|---|---|---|
| 15 | Mechanism #1: Complete call chain | All symbols, files, hops | ✅ [agent-turn-concurrent-tool-l3.md](agent-turn-concurrent-tool-l3.md) §2-§4 |
| 16 | Mechanism #1: Failure/recovery paths | Cancel, error, retry | ✅ §4-§5 |
| 17 | Mechanism #1: Comparison | At least 2 other frameworks | ✅ §7 对比 OpenCode / Hermes / Pi |
| 18 | Mechanism #1: RoboThree mapping | ADOPT/ADAPT/DEFER/REJECT | ✅ §8 |
| 19 | Mechanism #2: Complete lifecycle | From request to response | ✅ [sandbox-execpolicy-l3.md](sandbox-execpolicy-l3.md) §5 |
| 20 | Mechanism #2: Path branches | Allow/Prompt/Forbid + Escalation | ✅ §2.2-§4 |
| 21 | Mechanism #2: Security patterns | 决策矩阵 / 多后端沙箱 / 升级流 | ✅ §2-§4 |
| 22 | Mechanism #2: RoboThree mapping | With security concerns | ✅ §8 |
| 23 | Mechanism #3: Data model | Extension/Plugin/Skill/MCP 四机制 | ✅ [extension-plugin-skills-mcp-l3.md](extension-plugin-skills-mcp-l3.md) §2-§5 |
| 24 | Mechanism #3: Context reconstruction | 四机制选择矩阵 | ✅ §6 |
| 25 | Mechanism #3: Known issues | 命名偏差 / Never 风险 | ✅ §6 (sandbox) + open-questions |
| 26 | Mechanism #3: RoboThree mapping | With fixes | ✅ §8 |

### RoboThree Mapping

| # | Check | Status |
|---|---|---|
| 27 | 5-classification complete | ✅ 22 items: 6 ADOPT, 11 ADAPT, 3 DEFER, 1 REJECT, 1 NEEDS_MORE_EVIDENCE |
| 28 | Each classification has reason + evidence + risk | ✅ |
| 29 | Proposed RoboThree Changes section | ✅ 8 candidate changes |
| 30 | Requires Human Approval section | ✅ 6 decisions PENDING_HUMAN_DECISION |

## 4. Evidence Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| 项目定位 + License | HIGH | README + LICENSE + Cargo workspace |
| 入口与启动链路 | HIGH | codex-cli/bin/codex.js + cli/main.rs + core/lib.rs |
| Agent 主循环 | HIGH | turn.rs 完整阅读 + tasks/regular.rs |
| 并发工具调度 | HIGH | parallel.rs 完整阅读 + 测试 |
| Provider/事件流抽象 | HIGH | client.rs + turn.rs 事件 match |
| 安全三层模型 | HIGH | exec_policy.rs + sandboxing + protocol/approvals.rs |
| 扩展四机制 | HIGH | ext/ + core-plugins + skills + mcp 目录确认 |
| **运行时取消时机** | MEDIUM | 静态代码路径确认；未运行时验证 cancel 时机 |
| **沙箱实际隔离强度** | MEDIUM | 静态推断；未做进程/文件系统实测 |
| **并发实际并发度** | MEDIUM | FuturesOrdered 语义明确；上限未实测 |
| **`Never` 模式真实风险** | MEDIUM | 静态推断；未验证是否有模型侧兜底 |

## 5. Limitations

1. **纯静态分析**：未运行 codex，所有运行时行为（取消时机、并发度、沙箱隔离强度）标注 MEDIUM 置信度。
2. **未做增量对比**：无历史研究，未对比上游版本变化。
3. **启发式未深挖**：`codex_shell_command` 的「危险/安全命令」启发式未逐条展开（与 RoboThree 需重实现的部分留作 open-questions Q9）。
4. **`Never` 模式兜底**：未读 `safety.rs` / `guardian` 扩展是否有模型输出过滤（open-questions Q11）。

## 6. Overall Verdict

Codex CLI 是**目前开源 Coding Agent 中安全模型最完整、扩展体系最丰富、运行时分层最清晰**的参考实现。对 RoboThree 的核心价值：

- **ADOPT**：四层粒度、分级取消、三层安全模型、四档扩展分层、Skill 隐式/显式区分。
- **ADAPT**：并发工具 RwLock 门、决策矩阵、事件流抽象、多后端沙箱。
- **REJECT**：`Never` + 无沙箱直接 Allow（违反 default-deny）。

研究结论未落地到 `robothree/`；所有影响模块边界的项均在 [robothree-fit-analysis.md](robothree-fit-analysis.md) 的「Proposed RoboThree Changes / Requires Human Approval」中列为待用户拍板。
