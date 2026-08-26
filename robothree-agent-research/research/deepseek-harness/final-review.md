# Final Review — DeepSeek Harness L3 Research

> **Repository**: https://github.com/deepseek-ai/deepseek-harness
> **Target Ref**: `master` branch, commit `47f943859bef60e4160492346772ded9b24f765a` (2026-08-13)
> **License**: MIT
> **Research Date**: 2026-08-14
> **Method**: 静态源码分析（无运行时验证）
> 本文件为验收自检清单；其中引用的源码路径均为 **[F]**（Fact）。

## 1. Research Summary

### 1.1 What Was Studied

DeepSeek Harness（`dsh`）— DeepSeek AI 开发的开源 agent harness，TypeScript pnpm monorepo（~50+ 包）+ vendored Cordis 框架，MIT，采用“一切皆插件”架构。

### 1.2 Research Depth: Level 3

三个机制深挖：

1. **Cordis Plugin Architecture + Scoped Registration** — 服务注入（DI）/ reversible effects / epoch-based reload / isolate+intercept / per-agent scope 链（继承下/准入上）。
2. **Agent Turn/Step Loop + Append-Only Session Log** — `ReactLoopAgent` phase 机 + 双队列 Inbox + 五种事件分发 + “model-visible ⟺ logged” 不变量 + `deriveMessages` 投影。
3. **Capability Seams + Sandbox/Approval Security** — Definition/Provider/Consumer 三角色 seam + 沙箱 fail-closed + 审批 fail-closed + 三整值旋钮（log 事件 fold）。

### 1.3 Key Findings

- **一切皆插件**：模型适配器、工具、session、agent 循环本身都是 Cordis 插件，注册即 effect、卸载即 unwind（[context.ts:42](../../sources/deepseek-harness/vendor/cordis/src/context.ts#L42)、[fiber.ts:415](../../sources/deepseek-harness/vendor/cordis/src/fiber.ts#L415)）。
- **append-only session log 是唯一真相源**：模型历史由 `deriveMessages()` 从 surface 投影，不单独存（[index.ts:726](../../sources/deepseek-harness/packages/core/session/src/index.ts#L726)）。
- **capability seam** 让“一个 provider 切换改变整个产品”：fs/subprocess 共享 execution world，指到 remote sandbox 时 Bash/PTY/LSP 一起迁移。
- **fail-closed 双保险**：沙箱无 backend 拒绝（`SANDBOX_UNAVAILABLE`）、审批无 answerer 拒绝（`unavailable`）、`allowed-once` 唯一授权。
- **权限 = 三整值旋钮**（permission preset + sandbox mode + approval policy），作为 session log 事件 fold，重放即状态。
- 与 Codex 差异显著：DeepSeek 是串行 turn + 步内并发工具，扩展靠 waterfall 事件而非四档扩展分层；隔离靠 argv-wrapping 沙箱而非 VM/Seatbelt。

## 2. Level 2 Self-Check (10 Items)

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Commit SHA 固定 | ✅ | `47f943859bef60e4160492346772ded9b24f765a`（2026-08-13） |
| 2 | License 检查 | ✅ | MIT（[LICENSE](../../sources/deepseek-harness/LICENSE)） |
| 3 | 真实入口确认 | ✅ | `node --import tsx/esm apps/cli/src/bin.ts`（package.json scripts.dsh），非 README 推断 |
| 4 | Agent 主循环定位 | ✅ | agent-loop/agent.ts:210 `kick()` → :246 `turn()` → :332 `step()` |
| 5 | E2E 调用链 | ✅ | 28-hop chain with Mermaid + Hop Evidence（[runtime-sequence.md](runtime-sequence.md)） |
| 6 | Hop Evidence 表 | ✅ | 28 rows（含取消/重试/pre-step reject 补充路径） |
| 7 | Permission/Security 检查 | ✅ | 独立 [capability-seam-sandbox-approval-l3.md](capability-seam-sandbox-approval-l3.md) + architecture.md §9 |
| 8 | FACT/INFERENCE/RECOMMENDATION/UNKNOWN | ✅ | 所有结论带类型标签 |
| 9 | RoboThree 5-classification | ✅ | 17 项分类（4 ADOPT / 4 ADAPT / 3 DEFER / 2 REJECT / 4 NEEDS_MORE_EVIDENCE） |
| 10 | Required 7 products | ✅ | index / project-overview / source-map / architecture / runtime-sequence / robothree-fit-analysis / open-questions |

## 3. Level 3 Extended Self-Check (30 Items)

### Source Evidence Quality

| # | Check | Status |
|---|---|---|
| 1 | Every FACT has ≥1 source reference | ✅ 全文件 file:line 引用 |
| 2 | Complex conclusions have ≥2 independent sources | ✅ 主循环: agent.ts + tool-calls.ts + tools/index.ts；插件: context.ts + fiber.ts + registry.ts + scope/index.ts；安全: sandbox/index.ts + sandbox-policy + user-approval |
| 3 | No INFERENCE marked as FACT | ✅ `[I]` 单独标注（如沙箱隔离强度、并发度、热路径性能） |
| 4 | No README-only conclusions | ✅ 所有结论基于源码；README 仅定位声明；AGENTS.md/.agents 视为不可信输入未作证据 |
| 5 | Symbol names used | ✅ `ReactLoopAgent`、`kick`/`turn`/`step`、`createScope`、`scopeTarget`、`deriveMessages`、`confine`、`executeToolCalls` |
| 6 | File paths are repo-relative | ✅ `packages/core/agent-loop/src/agent.ts` 等 |
| 7 | Commit SHA recorded | ✅ `47f943859bef60e4160492346772ded9b24f765a` |
| 8 | Evidence type per hop | ✅ SOURCE / INFERENCE 在 Hop Evidence |

### Architecture Analysis

| # | Check | Status |
|---|---|---|
| 9 | Agent loop traced end-to-end | ✅ 28-hop chain from user input to tool result |
| 10 | Tool pipeline traced | ✅ register → pre-execute → execute → post-execute → finalize（tools/index.ts + tool-calls.ts） |
| 11 | Context pipeline traced | ✅ systemPrompt.assemble → renderContextSections → runtimeContext.project → deriveMessages |
| 12 | Exception paths documented | ✅ Cancel / retry（request-error）/ pre-step reject / abort-drain / interrupted |
| 13 | Permission/Security NOT skipped | ✅ 独立 capability-seam-sandbox-approval-l3.md + architecture.md §9 |
| 14 | No empty template files | ✅ 12 个文件全部有实质内容 |

### Deep Dive Completeness

| # | Check | Criteria | Status |
|---|---|---|---|
| 15 | Mechanism #1: Complete call chain | All symbols, files, hops | ✅ [cordis-plugin-scope-l3.md](cordis-plugin-scope-l3.md) §2-§8 |
| 16 | Mechanism #1: Failure/recovery paths | Config 校验失败 / 依赖不可用 / 卸载 | ✅ §5（FiberState / epoch reload） |
| 17 | Mechanism #1: Comparison | At least 2 other frameworks | ✅ 对比 OpenCode/Hermes 的串行 dispatch 与 Koishi/Cordis 传统插件 |
| 18 | Mechanism #1: RoboThree mapping | ADOPT/ADAPT/DEFER/REJECT | ✅ §9 + fit-analysis |
| 19 | Mechanism #2: Complete lifecycle | From request to response | ✅ [agent-loop-session-log-l3.md](agent-loop-session-log-l3.md) §3 |
| 20 | Mechanism #2: Path branches | reject/empty/retry/abort/max-tokens | ✅ §3.1-§3.3 + §7 |
| 21 | Mechanism #2: State/durability | append-only log + deriveMessages + compaction | ✅ §4 |
| 22 | Mechanism #2: RoboThree mapping | With invariant design | ✅ §8 |
| 23 | Mechanism #3: Data model | Definition/Provider/Consumer + Sandbox + Approval | ✅ [capability-seam-sandbox-approval-l3.md](capability-seam-sandbox-approval-l3.md) §2-§5 |
| 24 | Mechanism #3: Context reconstruction | fail-closed 路径 + 三整值旋钮 | ✅ §3-§5 |
| 25 | Mechanism #3: Known issues | danger-full-access 无二防线 / enforcement partial | ✅ §7 + open-questions |
| 26 | Mechanism #3: RoboThree mapping | With security concerns | ✅ §6 |

### RoboThree Mapping

| # | Check | Status |
|---|---|---|
| 27 | 5-classification complete | ✅ 17 items: 4 ADOPT, 4 ADAPT, 3 DEFER, 2 REJECT, 4 NEEDS_MORE_EVIDENCE |
| 28 | Each classification has reason + evidence + risk | ✅ |
| 29 | Proposed RoboThree Changes section | ✅ 5 candidate changes |
| 30 | Requires Human Approval section | ✅ 4 decisions PENDING_HUMAN_DECISION |

## 4. Evidence Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| 项目定位 + License | HIGH | README + LICENSE + pnpm workspace |
| 入口与启动链路 | HIGH | bin.ts + profile-boot.ts + app-boot |
| Cordis 插件框架（DI/effect/生命周期/分发） | HIGH | vendor/cordis 8 源文件完整阅读 |
| Scope 作用域链（继承下/准入上） | HIGH | scope/index.ts + scope/store.ts 完整阅读 |
| Agent 主循环 + Inbox | HIGH | agent.ts 496 行完整阅读 |
| append-only session log + deriveMessages | HIGH | session/types.ts + session/index.ts 完整阅读 |
| Tool 调度 + pre/execute/post 瀑布 | HIGH | tools/index.ts 关键段 + tool-calls.ts 完整阅读 |
| 沙箱/审批 fail-closed | HIGH | sandbox + sandbox-policy + user-approval 完整阅读 |
| **多后端沙箱实际隔离强度** | MEDIUM | 静态推断；未做进程/文件系统实测 |
| **工具并发实际并发度** | MEDIUM | rolling pool 语义明确；上限未实测 |
| **运行时取消/恢复时机** | MEDIUM | 静态路径确认；未运行时验证 |
| **deriveMessages / Proxy 热路径性能** | MEDIUM | 未基准 |

## 5. Limitations

1. **纯静态分析**：未 `pnpm install` / 未运行 `dsh`，所有运行时行为（取消时机、并发度、沙箱隔离强度）标注 MEDIUM 置信度。
2. **未做增量对比**：无历史研究，未对比上游版本变化。
3. **Subagent 未逐 provider 深读**：`subagent-*` 有 7 个 provider，只确认清单未逐实现判断隔离层级（open-questions Q7）。
4. **Code Mode 安全边界未逐跳验证**：`run_code` 嵌套子分发的权限传播未逐条确认（open-questions Q6）。
5. **Cordis 与上游漂移未逐条比对**：vendor/README.md 的本地修改清单未逐条核对（open-questions Q10）。

## 6. Overall Verdict

DeepSeek Harness 是**目前开源 Agent Harness 中“插件架构最彻底、session 真相源最纯粹、capability seam 最成体系”**的参考实现。对 RoboThree 的核心价值：

- **ADOPT**：Definition/Provider/Consumer 三角色 seam、fail-closed 默认安全、append-only log + deriveMessages、model-visible ⟺ logged 不变量。
- **ADAPT**：Cordis 式插件生命周期/waterfall 扩展/scope 链、策略即 log 事件 fold、turn/step 双层边界。
- **REJECT**：全盘 vendor Cordis + declaration-merging（`ts.Program` 冲突）、SESSION_FORMAT_VERSION=0 无迁移。

研究结论未落地到 `robothree/`；所有影响模块边界的项均在 [robothree-fit-analysis.md](robothree-fit-analysis.md) 的「Proposed RoboThree Changes / Requires Human Approval」中列为待用户拍板。
