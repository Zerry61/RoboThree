# Cumora — 未解决项 + How to Close

> 提交固定：`d10283dc06e08996f844518b87da30baf5dcecc1`

## 1. 静态分析未确认项

### Q1. Server-side freshness preflight 的精确代码路径

**问题**：[agents/cli.ts cmdReply](../../sources/cumora/server/src/agents/cli.ts) 的 freshness preflight + atomic verbatim-dup 的具体行号和分支。

**现状**：[architecture.md § 3 Layer 5 + 5b](./architecture.md#3-coordination7-层防御) 已基于 docs/COORDINATION.md § 5 / 5b 描述；具体 cli.ts 行号未逐行 read。

**影响**：RoboThree 适配精度。

**How to Close**：Read [server/src/agents/cli.ts](../../sources/cumora/server/src/agents/cli.ts) cmdReply 函数（约 200-300 行预计）；定位：
- seen-cursor GET + 检查
- in-tx verbatim-dup SELECT + ROLLBACK
- `--send-anyway` bypass check
- `--send-anyway` token consumption

---

### Q2. Seen-cursor Redis Lua 脚本（保证原子 SET）

**问题**：[agents/seen-boundary.ts](../../sources/cumora/server/src/agents/seen-boundary.ts) 中 `recordSeen` / `consumeHold` / `clearHold` 是否用 Lua 脚本保证原子性？

**现状**：docs/COORDINATION.md § 5 提到 "Lua keeps the monotonic update race-free" 但未直接 read seen-boundary.ts 确认。

**影响**：RoboThree 借鉴 seen-cursor 时的实现细节。

**How to Close**：Read [agents/seen-boundary.ts:273](../../sources/cumora/server/src/agents/seen-boundary.ts) 完整 273 行；定位 Lua 脚本 + 错误处理（fail-open 策略）。

---

### Q3. Schedule 启动 + 关闭路径

**问题**：[agents/scheduler.ts](../../sources/cumora/server/src/agents/scheduler.ts) 的具体订阅路径（Redis pub/sub vs LIST BLPOP）和关闭路径（如何 drain in-flight turns）。

**现状**：[server/src/index.ts:253-257](../../sources/cumora/server/src/index.ts#L253-L257) 知道 startScheduler() 调用；scheduler.ts 内部细节未 read。

**影响**：RoboThree 借鉴 mailbox 模型时需要知道 in-flight turn 处理 + graceful shutdown。

**How to Close**：Read [agents/scheduler.ts](../../sources/cumora/server/src/agents/scheduler.ts) 完整 948 行；定位 subscribe + per-agent queue + drain + shutdown。

---

### Q4. Agent Runtime Client 接口的完整 method 列表

**问题**：[agents/runtime/client.ts:389](../../sources/cumora/server/src/agents/runtime/client.ts) 28 个 method 是否全部已覆盖？

**现状**：[architecture.md § 5](./architecture.md#5-agentruntimeclient-抽象phase-3-seam) 列了主要 method 但可能漏掉几个（context-system 旁路相关）。

**影响**：RoboThree 借鉴 runtime client interface 的完整性。

**How to Close**：Read [agents/runtime/client.ts:389](../../sources/cumora/server/src/agents/runtime/client.ts) 完整 389 行；与 inproc-client.ts / http-client.ts 交叉对比。

---

### Q5. K8s pod orchestration 完整流程

**问题**：[agents/runtime/orchestrator.ts:1257](../../sources/cumora/server/src/agents/runtime/orchestrator.ts) 的 ensurePod / scale-down / failure handling / FUSE mount 完整 1257 行未 read。

**现状**：仅读了高层入口 + GC 定时器。

**影响**：RoboThree 是否采纳 K8s per-agent pod 模型需要更详细信息（默认 REJECT，但需要明示）。

**How to Close**：Read [agents/runtime/orchestrator.ts](../../sources/cumora/server/src/agents/runtime/orchestrator.ts) 完整 1257 行；如果 REJECT 决定稳定，可不必 read。

---

### Q6. BYOA engine 的持久化 session 实现

**问题**：[agents/computer/engine.ts:4042](../../sources/cumora/server/src/agents/computer/engine.ts) 持久化 Claude Code / Codex / OpenCode / pi CLI session 的具体 SDK 调用。

**现状**：未 read。

**影响**：RoboThree 不直接借鉴 BYOA（默认 cloud brain），但 BYOA 的 "persistent session vs cold spawn" 设计选择有启示。

**How to Close**：Read [agents/computer/engine.ts](../../sources/cumora/server/src/agents/computer/engine.ts) 第 1-500 行（intro + 持久化 session 入口）。

---

## 2. cumora 自承未知 / 未评估项

### Q7. Climate（affinity/trust）真实有效性

**问题**：[agents/climate.ts](../../sources/cumora/server/src/agents/climate.ts) 与 [turn.ts:228-233](../../sources/cumora/server/src/agents/turn.ts#L228-L233) 渲染但 cumora 未公开 benchmark 验证。

**现状**：仅在 prompt 里显示；无明确实证 climate 数值是否真的影响 agent 行为。

**影响**：RoboThree 决定是否纳入 climate。

**How to Close**：
- 看 cumora benchmarks/games/ 中是否有 climate-related test
- A/B 测试：with vs without climate 注入，看 agent reply tone 是否有差异

---

### Q8. Auto-compaction LLM-summary vs hard truncation 成本 trade-off

**问题**：[agents/turn-compaction.ts:376](../../sources/cumora/server/src/agents/turn-compaction.ts) 用 LLM 总结 dropped items，但 LLM summary 本身要 cost。

**现状**：cumora 已选 LLM summary；但未公开每 turn 的额外 cost（用 cheaper model + 10s timeout 兜底）。

**影响**：RoboThree L2+ 决定。

**How to Close**：实测；或在 cumora's llm_calls_rollup admin panel 看 `purpose='compaction'` 的 token 用量分布。

---

### Q9. Triage fail-open vs fail-closed 边界的方向感知

**问题**：[agents/triage-core.ts:497](../../sources/cumora/server/src/agents/triage-core.ts) 用 direction-aware fail mode：human in unread → fail-open；pure agent-only → fail-closed。

**现状**：源代码已确认。

**影响**：RoboThree 借鉴时是否同样方向感知。

**How to Close**：RoboThree 自己评估 multi-agent 场景中是否同样需要方向感知。

---

### Q10. 7 层防御中哪些是"必需"哪些是"加固"

**问题**：[docs/COORDINATION.md § 5](../../sources/cumora/docs/COORDINATION.md) 列 7 层防御 + 子层 (a/b/c/d/e)，共 ~12 个机制。

**现状**：cumora 自承 "loop floor 删过 2 次又加回"——某些层是反例的修复（ad-hoc 累积），不是必需。

**影响**：RoboThree MVP 不应盲目搬全部 12 层；应评估必需 vs 加固。

**How to Close**：
- 读 cumora 内部 commit log 看每个 layer 的 introduction commit + revert commit
- 对 RoboThree 自己的 multi-agent 场景做 threat model 评估

---

## 3. RoboThree 内部决策（用户拍板）

### H1-H10：见 [robothree-fit-analysis.md § Requires Human Approval](./robothree-fit-analysis.md#requires-human-approval)

| # | 议题 | 状态 |
| --- | --- | --- |
| H1 | mailbox model 是否引入 v1.1 | PENDING_HUMAN_DECISION |
| H2 | sub2api 风格 per-tenant gateway | PENDING_HUMAN_DECISION |
| H3 | K8s per-agent pod | PENDING_HUMAN_DECISION（默认 REJECT） |
| H4 | BYOA computer | PENDING_HUMAN_DECISION |
| H5 | Real email | PENDING_HUMAN_DECISION（默认 REJECT） |
| H6 | Climate（affinity/trust） | PENDING_HUMAN_DECISION |
| H7 | Auto-compaction LLM-summary vs hard truncation | PENDING_HUMAN_DECISION |
| H8 | GLANCE_YIELD_RULES RoboThree 措辞 | PENDING_HUMAN_DECISION |
| H9 | Skills（AgentSkills spec） | PENDING_HUMAN_DECISION |
| H10 | Memory-scope 默认值 | PENDING_HUMAN_DECISION |

## 4. 进一步研究建议（如果 RoboThree 决定采纳）

### L3 专项候选

1. **mailbox + seen-cursor + atomic dup + hold-token**：cumora 最核心 4 个机制
2. **GLANCE_YIELD_RULES + small-brain triage gate**：brain-level 协调
3. **LLM-summarized auto-compaction**：context 系统

每个 L3 专项 ~1 周工作量 + RoboThree 适配原型 + ADR 候选。

### 跨项目比较

若 RoboThree 决定采纳 mailbox 模型，可与以下项目对比：
- [research/openclaw/](./openclaw/)：BYOA + 多 Agent 协调
- [research/hermes-agent/](./hermes-agent/)：3 层拦截（Scope → Plugin → Guardrail）
- [research/codex/](./codex/)：四层粒度（Thread → Turn → Sampling → Tool）

## 5. Reference

- [architecture.md](./architecture.md)
- [runtime-sequence.md](./runtime-sequence.md)
- [subagent-system.md](./subagent-system.md)
- [robothree-fit-analysis.md](./robothree-fit-analysis.md)
- [docs/COORDINATION.md](../../sources/cumora/docs/COORDINATION.md)
