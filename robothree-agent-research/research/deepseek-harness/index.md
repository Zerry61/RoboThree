# DeepSeek Harness — Research Index

## Project Identity

| Field | Value |
|---|---|
| **Repository** | https://github.com/deepseek-ai/deepseek-harness |
| **Study Target** | branch `master`, commit `47f943859bef60e4160492346772ded9b24f765a` (2026-08-13) |
| **License** | MIT ([LICENSE](../../sources/deepseek-harness/LICENSE)) |
| **Language** | TypeScript（pnpm monorepo，ESM）+ Python SDK + native Landlock runner |
| **Version** | `0.1.0-rc.5`（developer preview，未发布 tag） |
| **Research Depth** | Level 3 — Three-Mechanism Deep Dive |
| **Research Method** | 静态源码分析（Static source analysis only，未运行项目） |

## Research Status

| Stage | Status | Date |
|---|---|---|
| Stage A: Project Identification | ✅ Complete | 2026-08-14 |
| Stage B: Core Runtime Trace | ✅ Complete | 2026-08-14 |
| Stage C1: L3 Deep Dive — Cordis Plugin Architecture + Scoped Registration | ✅ Complete | 2026-08-14 |
| Stage C2: L3 Deep Dive — Agent Loop + Append-Only Session Log | ✅ Complete | 2026-08-14 |
| Stage C3: L3 Deep Dive — Capability Seams + Sandbox/Approval Security | ✅ Complete | 2026-08-14 |
| Stage D: RoboThree Mapping | ✅ Complete | 2026-08-14 |
| Final Review | ✅ Complete | 2026-08-14 |

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
| [cordis-plugin-scope-l3.md](cordis-plugin-scope-l3.md) | Cordis 插件架构 + Scoped Registration | “一切皆插件”是本项目最独特的贡献；服务注入/effects/scope 链是 RoboThree 插件/Skill/Hook 框架的直接样板 |
| [agent-loop-session-log-l3.md](agent-loop-session-log-l3.md) | Agent Turn/Step Loop + Append-Only Session Log | 事件瀑布（waterfall/serial/emit）+ “model-visible ⟺ logged” 不变量是核心运行/状态机制 |
| [capability-seam-sandbox-approval-l3.md](capability-seam-sandbox-approval-l3.md) | Capability Seams + Sandbox/Approval 安全边界 | Service Definition/Provider/Consumer 三角色 + 沙箱 fail-closed + 审批 fail-closed 直接服务 RoboThree「安全单独建模」 |

### Advanced

| File | Description |
|---|---|
| [final-review.md](final-review.md) | Level 3 30-item full self-check |
| [LICENSE-NOTES.md](LICENSE-NOTES.md) | License 登记 + 复用分类 |

## L3 Mechanism Selection Rationale

Level 3 的「专项深挖」不是 Level 2 的全量展开。基于 Stage A/B 的源码识别，三个机制最能代表 DeepSeek Harness 的架构贡献 / 风险点：

1. **Cordis Plugin Architecture + Scoped Registration** — “everything is a plugin, no privileged core”。DeepSeek Harness 把整个产品（模型适配器、工具注册表、session 日志、agent 循环本身）都建成 Cordis 插件，靠 `ctx.effect()` / `ctx.on()` / `Service` 注入 / `isolate`/`intercept` / per-agent `createScope` 作用域链组装。这是 RoboThree 插件/Skill/Hook 框架最值得对齐的参考实现。

2. **Agent Turn/Step Loop + Append-Only Session Log** — `ReactLoopAgent` 的 phase 机（idle/maintenance/running）、`Inbox` 双队列（next-turn/next-step）、五种事件分发模式（emit/parallel/serial/bail/waterfall）、以及“model-visible ⟺ logged”的 append-only session log（`deriveMessages()` 从 surface 投影历史）。这是与 OpenCode/Codex 串行 Agent 最显著的结构性差异。

3. **Capability Seams + Sandbox/Approval Security** — 三角色 seam（Service Definition/Provider/Consumer）让“一个 provider 切换改变整个产品”；沙箱 fail-closed（`SandboxProvider.confine`，`read-only` 默认）；审批 fail-closed（`ApprovalService`，`allowed-once` 是唯一授权）；三个整值旋钮（permission preset + sandbox mode + approval policy）作为 session 事件落日志、靠 fold 重放。

## Key Architectural Conclusion (Summary)

DeepSeek Harness (`dsh`) 是一个由 DeepSeek AI 开发的**开源 agent harness**，MIT 许可，整体是一个 **pnpm monorepo（~50+ 包）+ vendored Cordis 框架**：

1. **一切皆插件**：模型适配器、工具注册表、session 日志、agent 循环本身都是 Cordis 插件，通过 `ctx.plugin()` / `ctx.effect()` 挂载，注册即 effect、卸载即 unwind（[context.ts:42](../../sources/deepseek-harness/vendor/cordis/src/context.ts#L42)、[registry.ts:316](../../sources/deepseek-harness/vendor/cordis/src/registry.ts#L316)）。
2. **四层运行时对象模型**：`Context`（Proxy DI）→ `Fiber`（插件生命周期）→ `ReactLoopAgent`（turn/step 驱动）→ `Session`（append-only log）（[agent.ts:64](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L64)）。
3. **agent 主循环**：`kick()` → `turn()` → `preStep()`（pre-step 瀑布）→ `step()`（llm.stream + executeToolCalls）→ `turn/end`（[agent.ts:210](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L210)、[agent.ts:246](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L246)、[agent.ts:332](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L332)）。
4. **append-only session log 是唯一真相源**：`SessionEventMap`（turn/step/user/assistant/tool 事件）+ `deriveMessages()` 投影历史 + “model-visible ⟺ logged” 运行时不变量（[types.ts:236](../../sources/deepseek-harness/packages/core/session/src/types.ts#L236)、[index.ts:726](../../sources/deepseek-harness/packages/core/session/src/index.ts#L726)）。
5. **三角色 capability seam**：`Service`（Definition）→ Provider（实现）→ Consumer（工具），`fs`/`shell`/`subprocess`/`terminal`/`sandbox`/`llm` 六条 seam，provider 切换整体替换（[fs/index.ts:86](../../sources/deepseek-harness/packages/fs/fs/src/index.ts#L86)、[sandbox/index.ts:158](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L158)）。
6. **安全三层**：`tools/pre-execute`（allow/deny/ask）→ 沙箱隔离（fail-closed）→ 审批（ask/never，fail-closed，`allowed-once` 唯一授权）（[tools/index.ts:152](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L152)、[user-approval/index.ts:192](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L192)）。

## Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| 项目定位 + License | HIGH | README + LICENSE + pnpm workspace |
| 入口与启动链路 | HIGH | bin.ts + profile-boot.ts + app-boot |
| Cordis 插件框架（DI/effect/生命周期/分发） | HIGH | vendor/cordis 8 个源文件完整阅读 |
| Scope 作用域链（继承下/准入上） | HIGH | scope/index.ts + scope/store.ts 完整阅读 |
| Agent 主循环 + Inbox | HIGH | agent.ts 496 行完整阅读 |
| append-only session log + deriveMessages | HIGH | session/types.ts + session/index.ts 完整阅读 |
| Tool 调度 + pre/execute/post 瀑布 | HIGH | tools/index.ts 关键段 + tool-calls.ts 完整阅读 |
| 沙箱/审批 fail-closed | HIGH | sandbox + sandbox-policy + user-approval 完整阅读 |
| 多后端沙箱实际隔离强度 | MEDIUM | 静态推断；未做进程/文件系统实测 |
| 并发工具实际并发度 | MEDIUM | FuturesOrdered/rolling pool 语义明确；上限未实测 |
| 运行时取消/恢复时机 | MEDIUM | 静态路径确认；未运行时验证 |

## Verification Method

本研究仅做静态源码分析：

- 未 `pnpm install` / `pnpm build`。
- 未运行 `dsh` 二进制、未运行测试、未启动 Web UI / 容器 / MCP / sandbox。
- 未访问外部网络（仅 `git clone`）。
- 未读取任何 Secret。

**所有 `[F]` 结论必须能由源码路径直接确认；运行时行为只能标注 `[I]` / `[UNKNOWN]。**
