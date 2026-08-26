# Codex CLI — Research Index

## Project Identity

| Field | Value |
|---|---|
| **Repository** | https://github.com/openai/codex |
| **Study Target** | branch `main`, commit `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7` (2026-08-13) |
| **License** | Apache-2.0 ([LICENSE](../../sources/codex/LICENSE)) |
| **Language** | Rust（workspace ~117 crates）+ TypeScript/Python SDK |
| **Research Depth** | Level 3 — Three-Mechanism Deep Dive |
| **Research Method** | 静态源码分析（Static source analysis only，未运行项目） |

## Research Status

| Stage | Status | Date |
|---|---|---|
| Stage A: Project Identification | ✅ Complete | 2026-08-13 |
| Stage B: Core Runtime Trace | ✅ Complete | 2026-08-13 |
| Stage C1: L3 Deep Dive — Agent Turn Loop + Concurrent Tool Dispatch | ✅ Complete | 2026-08-13 |
| Stage C2: L3 Deep Dive — Sandbox + Exec Policy (Approval) | ✅ Complete | 2026-08-13 |
| Stage C3: L3 Deep Dive — Extension / Plugin / Skills / MCP | ✅ Complete | 2026-08-13 |
| Stage D: RoboThree Mapping | ✅ Complete | 2026-08-13 |
| Final Review | ✅ Complete | 2026-08-13 |

## Research Outputs

### Required (7)

| File | Description |
|---|---|
| [index.md](index.md) | This file |
| [project-overview.md](project-overview.md) | Project positioning, tech stack, license snapshot |
| [source-map.md](source-map.md) | Directory map, entry points, crate topology |
| [architecture.md](architecture.md) | Architecture overview (含 Permission / Security 主报告段落) |
| [runtime-sequence.md](runtime-sequence.md) | End-to-end call chain with Mermaid + Hop Evidence |
| [robothree-fit-analysis.md](robothree-fit-analysis.md) | ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE |
| [open-questions.md](open-questions.md) | Unresolved items with How to Close |

### Conditional — Level 3 Deep Dives (3)

| File | Mechanism | Trigger |
|---|---|---|
| [agent-turn-concurrent-tool-l3.md](agent-turn-concurrent-tool-l3.md) | Agent Turn Loop + Concurrent Tool Dispatch + Cancellation | 主循环是核心机制；RwLock 并行门 + 分级取消影响所有层 |
| [sandbox-execpolicy-l3.md](sandbox-execpolicy-l3.md) | Sandbox + Exec Policy (Approval) 安全边界 | Codex 最独特的贡献：真 OS 沙箱 + 三层安全模型 |
| [extension-plugin-skills-mcp-l3.md](extension-plugin-skills-mcp-l3.md) | Extension / Plugin / Skills / MCP 扩展体系 | OpenAI 参考实现，四条并行扩展机制 |

### Advanced

| File | Description |
|---|---|
| [final-review.md](final-review.md) | Level 3 30-item full self-check |
| [LICENSE-NOTES.md](LICENSE-NOTES.md) | License 登记 + 复用分类 |

## L3 Mechanism Selection Rationale

Level 3 的「专项深挖」不是 Level 2 的全量展开。基于 Stage A/B 的源码识别，三个机制被认为最能代表 Codex 的架构贡献 / 风险点：

1. **Agent Turn Loop + Concurrent Tool Dispatch + Cancellation** — 三层循环（turn/sampling/event）+ `FuturesOrdered` 并发 + RwLock 并行门 + 分级取消，是 Codex 与串行 Agent（OpenCode/Hermes）最显著的差异。

2. **Sandbox + Exec Policy (Approval) Security Boundary** — Codex 是少有的**真 OS 沙箱**（Seatbelt/Landlock/Bwrap/RestrictedToken）+ 三层安全模型（决策/隔离/升级）的 Coding Agent，直接服务 RoboThree「Security 单独建模」。

3. **Extension / Plugin / Skills / MCP** — OpenAI 参考实现中扩展性最强的部分：四条并行机制（进程内 Extension / marketplace Plugin / 声明式 Skill / 双向 MCP），是 RoboThree Skill/Plugin/MCP 三块的对照样板。

## Key Architectural Conclusion (Summary)

Codex CLI 是一个 **Rust workspace（~117 crates）** 组成的本地 Coding Agent，Apache-2.0，整体特征：

1. **四层运行时对象模型**：`ThreadManager` → `CodexThread` → `Session` → `run_turn`（[thread_manager.rs:216](../../sources/codex/codex-rs/core/src/thread_manager.rs#L216)）。
2. **三层主循环**：`run_turn`（turn 级）→ `run_sampling_request`（重试）→ `try_run_sampling_request`（事件流）（[turn.rs:153](../../sources/codex/codex-rs/core/src/session/turn.rs#L153) / [turn.rs:1325](../../sources/codex/codex-rs/core/src/session/turn.rs#L1325) / [turn.rs:2154](../../sources/codex/codex-rs/core/src/session/turn.rs#L2154)）。
3. **并发工具调度**：`FuturesOrdered` + RwLock 并行门（read=并发 / write=串行）+ 分级取消（立即/优雅）（[parallel.rs:92](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L92)）。
4. **三层安全模型**：exec_policy 决策（allow/prompt/forbid）→ 沙箱隔离（多后端）→ 运行时升级（Escalation/Amendment）（[exec_policy.rs:726](../../sources/codex/codex-rs/core/src/exec_policy.rs#L726)、[sandboxing/src/manager.rs:267](../../sources/codex/codex-rs/sandboxing/src/manager.rs#L267)）。
5. **四条扩展机制**：进程内 Extension（12 种 contributor trait）/ Plugin（marketplace）/ Skill（SKILL.md）/ MCP（双向，Client+Server）。

## Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| 项目定位 + License | HIGH | README + LICENSE + Cargo workspace |
| 入口与启动链路 | HIGH | codex-cli/bin/codex.js + cli/main.rs + core/lib.rs |
| 四层运行时模型 | HIGH | lib.rs + thread_manager.rs + codex_thread.rs + turn.rs |
| Agent 主循环 | HIGH | run_turn / run_sampling_request / try_run_sampling_request 完整阅读 |
| 并发工具调度（RwLock 门） | HIGH | parallel.rs 完整阅读 + 测试 |
| 安全三层模型 | HIGH | exec_policy.rs + sandboxing + protocol/approvals.rs |
| 扩展四机制 | HIGH | ext/ + core-plugins + skills + mcp 目录确认 |
| 运行时取消时机 | MEDIUM | 静态路径确认；未运行时验证 |
| 沙箱实际隔离强度 | MEDIUM | 静态推断；未做进程/文件系统实测 |
| 并发实际并发度 | MEDIUM | FuturesOrdered 语义明确；上限未实测 |

## Verification Method

本研究仅做静态源码分析：

- 未 `cargo build` / `bazel build`。
- 未运行 `codex` 二进制。
- 未运行测试、未启动容器 / MCP / sandbox。
- 未访问外部网络（仅 `git clone`）。
- 未读取任何 Secret。

**所有 `[F]` 结论必须能由源码路径直接确认；运行时行为只能标注 `[I]` / `[UNKNOWN]。**
