# Cumora → RoboThree 适配分析

> 提交固定：`d10283dc06e08996f844518b87da30baf5dcecc1`
> RoboThree 上下文：通用底座 + 开放集成（[memory: robothree-product-positioning](../index.md)）；管理后台用 Java，Agent Runtime 用 Node.js（[memory: admin-console-java-decision](../index.md)）；基线 v1.0 已发布（[memory: robothree-baseline-v1.0](../index.md)）
> **核心结论**：**ADAPT**——7 层防御 + GLANCE_YIELD_RULES 5 条 + 5b/5d 是 cumora 最值得 RoboThree 借鉴的机制

## 总评

Cumora 的核心创新不在单 Agent Loop（turn.ts 是工具调用循环 + bash + set_turn_status + compaction，结构上和 Hermes Agent / Pi Agent / OpenCode 都类似），而在**多 Agent Coordination**（mailbox + 7 层防御 + GLANCE_YIELD_RULES 5 条 + hold-token-gated override）。

RoboThree 是"通用底座 + 开放集成"——支持多 Agent 是基线 v1.0 已经定的方向（[memory: robothree-baseline-v1.0](../index.md)）。Cumora 的协调层是这个方向的**最佳工程范例**：每一层防御对应一个真实事故，每个 anti-pattern 都来自 production。

## ADOPT（直接借鉴）

### A1. Mailbox 模型 取代 server-side classifier/cascade

**理由**：scheduler 只决定 "who to wake"；reply 决策完全在 agent 的 LLM 内（每 agent 独立 LLM call）。这是去中心化决策的工程化——与 RoboThree "通用底座 + 开放集成" 哲学一致。

**证据**：[server/src/index.ts:253-257](../../sources/cumora/server/src/index.ts#L253-L257) 显式拒绝 server-side classifier/cascade；[scheduler.ts:948](../../sources/cumora/server/src/agents/scheduler.ts) 实现 mailbox

**适用边界**：RoboThree Agent Runtime 当前若以"人类触发"为主，可不改；若未来支持"agent 自发 init"，必须用 mailbox 模型

**风险**：mailbox 模型下所有 agent 都有机会读 inbox + 决策回复；可能增加 token 消耗（必须配合 small-brain triage gate，§ A2）

**MVP 需要**：✅ **必选**——RoboThree 多 Agent 协调基础

---

### A2. Small-brain triage gate（pure dependency-free）

**理由**：keep noise off big brain；pure 模块让 cloud 和 BYOA 复用同一份代码

**证据**：[agents/triage-core.ts:497](../../sources/cumora/server/src/agents/triage-core.ts) 是 pure（无 DB / env / LLM client import）；[agents/inbox-triage.ts:188](../../sources/cumora/server/src/agents/inbox-triage.ts) 是 cloud 端封装

**核心原则**：
- human involved/watching → ALWAYS actionable
- 唯一 suppress：纯 agent-to-agent 无 authoritative open work（active claim）
- unsure → actionable=true（never leave a human hanging）
- factual signals（Worklog claims / Human attention），不解析 message content

**适用边界**：所有 multi-agent 场景；BYOA + cloud 必选

**风险**：triage 错误（actionable=false 但实际应回复）会漏 reply；用 fail-open + heartbeat cap 兜底

**MVP 需要**：✅ **必选**

---

### A3. Server-side freshness preflight + atomic in-tx verbatim-dup HOLD

**理由**：race collision 的真正防御；**不是 prompt 级防御**，是 server 强串行化

**证据**：[agents/seen-boundary.ts:273](../../sources/cumora/server/src/agents/seen-boundary.ts) Redis seen-cursor；[agents/cli.ts](../../sources/cumora/server/src/agents/cli.ts) cmdReply 的 in-tx verbatim-dup

**核心机制**：
- Redis `cumora:seen:<agentId>:<convoId>` 单调 SET，10min TTL
- pre-INSERT check：if newer-than-baseline peer → HELD envelope + 附 held messages
- in-tx verbatim-dup：SELECT latest non-self peer body，**不可被 `--send-anyway` bypass**
- advance baseline to max held seq（避免无限 HOLD loop）

**适用边界**：所有 multi-agent write 路径

**风险**：Redis 单调 SET 是 best-effort（10min TTL）；in-tx check 是 transactional safety net

**MVP 需要**：✅ **必选**

---

### A4. Hold-token-gated `--send-anyway` / `--force`（seq-bound + 2min TTL）

**理由**：override flag 滥用是 coordination 的 silent killer；必须 ack server-shown state

**证据**：[docs/COORDINATION.md § 5d](../../sources/cumora/docs/COORDINATION.md) + [agents/seen-boundary.ts:273](../../sources/cumora/server/src/agents/seen-boundary.ts) recordHold/consumeHold/clearHold

**核心机制**：
- 每个 HELD envelope 在 Redis 写 token（`(agentId, scope)`），TTL 2min，**fail-open**（Redis 错误时 degrade 到 old behavior，不阻塞工作）
- `--send-anyway` 仅在存在 token 时被 honor
- **seq-bound**：token 存 `seq:<n>`（HELD envelope 显示的 max peer seq），consume 时 re-query；若有新消息，flag 失效
- lifecycle：turn-end / ack / 2min TTL 清除

**适用边界**：所有 override flag（RoboThree 应将 override flag 视为 "must ack server-shown state"）

**风险**：fail-open 在 Redis 故障时退化；但这是"阻塞工作 vs 安全性"的合理 trade

**MVP 需要**：✅ **必选**

---

### A5. GLANCE_YIELD_RULES 5 条（shape-level，不要 scenarios）

**理由**：coordination 的 brain-level 指令；保持最小 1 行字符串；禁止扩 scenarios

**证据**：[agents/glance-protocol.ts:20](../../sources/cumora/server/src/agents/glance-protocol.ts) 完整 5 条

**核心 5 条**（按 [docs/COORDINATION.md § 7](../../sources/cumora/docs/COORDINATION.md)）：
1. HUMAN CAN ADDRESS ONE NAMED TEAMMATE WITHOUT @-ING THEM
2. REPLY FROM THE REAL, POSTED STATE
3. POST OPTIMISTICALLY; SERVER IS YOUR SAFETY NET
4. DON'T REPEAT A PEER, STOP WHEN DONE
5. DO NOT CLAIM A CHAT TURN OR GAME SLOT

**适用边界**：所有 multi-agent prompt（cloud + BYOA 共享同一行 string）

**风险**：扩 scenarios 会让 prompt 膨胀 + 模型在小变化任务里失败（cumora 自己已踩）

**MVP 需要**：✅ **必选**

---

### A6. BigBrainSemaphore + AdaptivePacer

**理由**：N agents 同时 wake 时撞 provider RL 上限；必须 cap spawn rate

**证据**：[agents/computer/daemon.ts:3483](../../sources/cumora/server/src/agents/computer/daemon.ts) BigBrainSemaphore + AdaptivePacer；[docs/COORDINATION.md § 2, § 3, § 3b](../../sources/cumora/docs/COORDINATION.md)

**核心机制**：
- BigBrainSemaphore：per-computer big-brain turn cap（默认 6）
- AdaptivePacer：任何 agent RL → global MIN_SPAWN_INTERVAL 翻倍（上限 8s）；5 个 clean turn → 减半回 base
- **同时**接入 chat-turn + agenda-turn handler（否则 chat-turn RL 不被察觉）
- **与 triage semaphore 配对**（防 "cap big brain 不 cap triage" 反模式）

**适用边界**：所有 multi-agent 场景（cloud + BYOA）

**风险**：semaphore cap 太低会拖尾（7-agent broadcast queued 6 deep → 215-359s）；过高会撞 RL（130 hits in 17min）

**MVP 需要**：✅ **必选**

---

### A7. Per-agent RL cooldown + notice suppression

**理由**：provider throttling 不是 cumora 失败，不应 leak 到 chat

**证据**：[docs/COORDINATION.md § 4](../../sources/cumora/docs/COORDINATION.md) + [agents/computer/daemon.ts:3483](../../sources/cumora/server/src/agents/computer/daemon.ts)

**核心机制**：
- `ENGINE_BACKOFF_AFTER_RATE_LIMIT_MS = 60_000` per-agent cooldown
- **不**post `byoa_engine_failed` notice（避免 chat 噪声）
- 不 ack inbox，下一 wake 自然重试
- run row 标 `summary='rate-limited (deferred for retry)'` 留 audit

**适用边界**：所有 LLM provider 调用

**风险**：cooldown 过长会拖尾；需 per-provider 调优

**MVP 需要**：✅ **必选**

---

### A8. Mid-tool abort + batch-level controller

**理由**：用户 mid-turn steer → 长 bash 应被 abort；per-batch controller 让 abort 触发时整批 tool SIGTERM

**证据**：[agents/turn.ts:2913-2918](../../sources/cumora/server/src/agents/turn.ts#L2913-L2918) batchAbortController + [tools-shared.ts:486-507](../../sources/cumora/server/src/agents/tools-shared.ts#L486-L507) 两阶段 kill

**核心机制**：
- `batchAbortController` per-batch（not per-iteration）
- SIGTERM first，2s 后 SIGKILL（让 child flush buffer / clean up temp files）
- ToolResult 带 `aborted: true, abortReason: 'steer_interrupt'`
- turn.ts 据此走 steer drain 路径而非正常 retry

**适用边界**：所有 long-running tool（bash, browser, ffmpeg, yt-dlp）

**MVP 需要**：⚠️ **可选**——MVP 不一定需要 mid-tool abort；但 long-running tool 必须有 timeout

---

## ADAPT（改造借鉴）

### B1. LLM-summarized auto-compaction

**理由**：cumora 用 LLM 总结 dropped items 保留 semantic continuity；modelWindow-aware（不同 model 不同阈值）

**证据**：[agents/turn-compaction.ts:376](../../sources/cumora/server/src/agents/turn-compaction.ts) + [agents/turn.ts:2427-2523](../../sources/cumora/server/src/agents/turn.ts#L2427-L2523)

**RoboThree 改造**：
- RoboThree 当前若用 token-count 截断（类似 Pi Agent 的 95% auto-compact），可升级为 LLM-summarized
- 关键：summarize 保留 SPECIFIC data（paths / IDs / key strings），不是泛泛总结
- 触发阈值：`modelWindow * 0.75`；hard ceiling `modelWindow * 0.95`
- CJK-aware token estimate（cumora 修了 byte-count underestimate 3x 问题）

**适用边界**：所有长 turn agent

**MVP 需要**：⚠️ **可选**——MVP 不需要 LLM summarization（用 hard truncation）；L2+ 必选

---

### B2. Mid-turn steering with draft carry-through

**理由**：agent busy 时新消息 → 注入下一次 hop；**draft assistant text 一起带过去**避免 stateless boundary 丢失

**证据**：[agents/steer.ts:454](../../sources/cumora/server/src/agents/steer.ts) + [agents/turn.ts:2353-2423](../../sources/cumora/server/src/agents/turn.ts#L2353-L2423)

**RoboThree 改造**：
- RoboThree Agent Runtime 若有 event bus → 改造为 event-driven steer
- batch ≤ SUMMARIZE_THRESHOLD → verbatim；> threshold → cheap-model summarize；summarize 失败 → truncated verbatim
- byte budget 兜底（防止 steer 挤爆 context）
- render 时保留 `(in conversation <id>)` 标签——避免 cross-conv steer confusion

**适用边界**：所有 long-running turn（>30s）

**MVP 需要**：⚠️ **可选**

---

### B3. AgentRuntimeClient abstraction（inproc vs http）

**理由**：Phase 3 seam；turn.ts 只依赖 runtime interface，inproc/http 可互换

**证据**：[agents/runtime/client.ts:389](../../sources/cumora/server/src/agents/runtime/client.ts) + [inproc-client.ts:1101](../../sources/cumora/server/src/agents/runtime/inproc-client.ts) + [http-client.ts:485](../../sources/cumora/server/src/agents/runtime/http-client.ts) + [select.ts:31](../../sources/cumora/server/src/agents/runtime/select.ts)

**RoboThree 改造**：
- RoboThree Agent Runtime 当前若直接 import DB / Redis，可改造为 interface seam
- 13 read + 12 mutation + 3 observability = 28 个 method（接口稳定）
- 不变量：`turn.ts` 自身 **不** import DB / Redis

**适用边界**：所有 RoboThree Agent Runtime 演进路径

**MVP 需要**：⚠️ **可选**——MVP 可直接耦合；L2+ 必选

---

### B4. set_turn_status protocol（5 status + assistant_text relay）

**理由**：turn 退出必须 model 主动声明；runtime 不从沉默推断完成

**证据**：[agents/tools-shared.ts:47-58](../../sources/cumora/server/src/agents/tools-shared.ts#L47-L58) + [agents/turn.ts:2788-2880](../../sources/cumora/server/src/agents/turn.ts#L2788-L2880)

**5 status**：
- `done`：request handled / 正确选择 silence
- `continue`：only acknowledged / need more
- `needs_clarification`：next step 是问 concrete question
- `blocked`：cannot complete
- `waiting`：action taken, waiting for external response

**assistant_text**：`none` / `reply` / `drop`（plain assistant text 是 draft，仅 explicit relay 才 user-visible）

**RoboThree 改造**：
- 用 RoboThree 自己的措辞
- 5 status + assistant_text relay 是**最少必需**
- 不允许"沉默 = done"——必须显式声明

**MVP 需要**：✅ **必选**

---

### B5. Per-turn FS namespace（hydrate / commit / teardown）

**理由**：并发 turn 隔离 + diff commit 避免频繁 round-trip

**证据**：[agents/runtime/fs-namespace.ts:114](../../sources/cumora/server/src/agents/runtime/fs-namespace.ts) + [agents/turn.ts:1933, 3432-3457](../../sources/cumora/server/src/agents/turn.ts)

**RoboThree 改造**：
- 不需要真实 fs（cumora 因为 BYOA 需要）；RoboThree 可直接读 Postgres 当 fs
- 保留：hydrate/commit/teardown 模式 + diff 写回 + finally block 强制
- commit 失败 → `fs.commit_failed` event log（不抛、不丢失 turn 数据）

**适用边界**：所有 agent workspace 场景

**MVP 需要**：⚠️ **可选**

---

### B6. Memory scope（global + project）

**理由**：cross-group bleed of work facts 是 scoping bug 不是 wipe bug

**证据**：[agents/memory-scope.ts:299](../../sources/cumora/server/src/agents/memory-scope.ts) + [docs/COORDINATION.md § Cross-group bleed](../../sources/cumora/docs/COORDINATION.md)

**RoboThree 改造**：
- memory-scope.ts 是 pure module（dependency-free），cloud ↔ BYOA 共享
- 关键：pinned / identity / persona / skills / climate = global；conversation with no project = global only；project scope = global + project
- **不**做 guess-migration（不要把旧 notes 强行分 scope）

**适用边界**：所有 multi-tenant / multi-project agent

**MVP 需要**：⚠️ **可选**

---

### B7. Wake debounce + coalescing

**理由**：burst group messages 应 fold 成 single turn

**证据**：[docs/COORDINATION.md § 3c](../../sources/cumora/docs/COORDINATION.md) WAKE_DEBOUNCE_MS=2500

**RoboThree 改造**：
- 2.5s debounce + coalesce
- busy 时 coalesce 成 pending rerun
- inbox poll (20s) 兜底 SSE 漏掉
- RoboThree 若以"人类触发"为主可不做；multi-agent wake 必做

**适用边界**：所有 multi-agent

**MVP 需要**：⚠️ **可选**

---

### B8. Failure notice + cap + dedupe

**理由**：防御性：失败 notice 漏出会导致 cascade（200+ notices in seconds）

**证据**：[agents/turn.ts:1722-1822](../../sources/cumora/server/src/agents/turn.ts#L1722-L1822) postTurnFailureNotices + FAILURE_NOTICE_HOURLY_CAP=3

**RoboThree 改造**：
- 每 (agent, convo) rolling hour cap
- dedupe key filter system messages out
- `notice-cap:<key>` Redis incr + 1h TTL
- excess 走 observability event（不 leak chat）

**适用边界**：所有 agent failure 路径

**MVP 需要**：⚠️ **可选**

---

## DEFER（推迟）

| 项 | 理由 |
| --- | --- |
| Skills（AgentSkills spec） | RoboThree 已有 claude-code-best 参照；可观望 |
| Kanban + Polls + Calendar + Documents | 场景特定（chat-first 多 Agent）；RoboThree 不一定需要 |
| Stall pipeline + deterministic fallback + decline cap | 场景特定（持续对话中的 dormant agent）；MVP 不需要 |
| Agent voice / persona prompts | cumora 删过又加回；RoboThree 应保持 prompt minimal |
| Climate（affinity / trust） | 语义未明；可能仅 cumora 适用 |

## REJECT（拒绝）

| 项 | 理由 |
| --- | --- |
| Real email（Resend + Cloudflare Email Routing） | 产品范围外 |
| K8s per-agent pods + Go FUSE | 场景特定（cumora 是 SaaS）；RoboThree 不必效仿 |
| BYOA "持续 local CLI session" | cumora 因模型 quotas 限制；RoboThree 默认 cloud brain |
| Last-write-wins on race | cumora 用 seen-cursor + atomic dup；RoboThree 应效仿而不是 reject |
| "soft override flag" | cumora 已证 soft gates erode；必须 token-gated |
| Prompt-only coordination | cumora 多次证明 prompt alone 不足以防护；server 强拦截才是 |

## NEEDS_MORE_EVIDENCE

| 项 | 需补证据 |
| --- | --- |
| Climate（affinity / trust） 真实有效性 | cumora 未公开 benchmark；只在 prompt 里显示，无明证实证 |
| 7 层防御的"必要 6 层" | cumora 删过 2 次 loop floor 又加回；RoboThree 是否同样需要待评估 |
| Auto-compaction 用 LLM summary vs hard truncation | 取决于 context window 与 model cost trade；需 RoboThree 实际场景 benchmark |
| Mid-turn steering 的 byte budget 上限 | cumora 用 2-hop average；RoboThree 应实测 |
| Triage fail-open vs fail-closed 边界 | cumora 用 direction-aware（human in unread → fail-open, agent-only → fail-closed）；RoboThree 应同样方向感知 |

## Proposed RoboThree Changes

> 列出会影响 RoboThree 模块边界 / 技术栈 / 数据模型 / 安全模型 / 部署形态的候选变更。**仅作为提议，未自动落地。**

| # | 变更 | 优先级 | 影响 |
| --- | --- | --- | --- |
| 1 | RoboThree Agent Runtime 加 **mailbox model**（multi-agent 场景） | **必选** | 模块边界：Agent Runtime / Scheduler |
| 2 | RoboThree Agent Loop 加 **set_turn_status protocol**（5 status + assistant_text） | **必选** | Tool Runtime / Agent Loop |
| 3 | RoboThree Agent Runtime 加 **server-side freshness preflight + atomic dup** | **必选** | 安全模型 / DB schema |
| 4 | RoboThree 加 **hold-token-gated override**（seq-bound + TTL） | **必选** | 安全模型 / Redis |
| 5 | RoboThree Agent Loop 加 **GLANCE_YIELD_RULES 5 条**（用 RoboThree 措辞） | **必选** | Prompt / Agent Loop |
| 6 | RoboThree Agent Runtime 加 **small-brain triage gate**（pure module） | **必选** | Agent Loop / Cost |
| 7 | RoboThree Agent Runtime 加 **BigBrainSemaphore + AdaptivePacer** | **必选** | 多 Agent / Provider cost |
| 8 | RoboThree 加 **per-agent RL cooldown + notice suppression** | **必选** | Provider 调用 / Chat UX |
| 9 | RoboThree Agent Loop 加 **LLM-summarized auto-compaction**（modelWindow-aware） | L2+ | Context 系统 |
| 10 | RoboThree Agent Runtime 加 **mid-turn steering**（带 draft carry-through） | L2+ | Event Bus / Agent Loop |
| 11 | RoboThree Agent Runtime 抽 **AgentRuntimeClient interface**（Phase 3 seam） | L2+ | 模块边界 |
| 12 | RoboThree Agent Runtime 加 **per-turn FS namespace**（hydrate/commit/teardown） | L2+ | Workspace / Data Model |
| 13 | RoboThree 加 **memory-scope**（global + project，pure module） | L2+ | Memory 系统 |
| 14 | RoboThree Agent Loop 加 **wake debounce + coalescing** | L2+ | Scheduler |
| 15 | RoboThree Agent Loop 加 **failure notice + cap + dedupe** | L2+ | Observability |

## Requires Human Approval

> 列出需要用户拍板才能推进 RoboThree 正式架构决策的项。
> 默认状态：`PENDING_HUMAN_DECISION`。

| # | 议题 | 默认状态 | 备注 |
| --- | --- | --- | --- |
| H1 | 是否在 v1.1 引入 mailbox model（取代当前人类触发） | PENDING_HUMAN_DECISION | 取决于产品方向（是否做多 Agent） |
| H2 | 是否引入 sub2api 风格 per-tenant LLM gateway | PENDING_HUMAN_DECISION | 涉及商业模型 |
| H3 | 是否引入 K8s per-agent pod 模型 | PENDING_HUMAN_DECISION | 涉及基础设施成本 |
| H4 | 是否支持 BYOA computer 模型 | PENDING_HUMAN_DECISION | 涉及产品边界 |
| H5 | 是否引入 Real email 集成 | PENDING_HUMAN_DECISION | 产品范围外（默认 REJECT） |
| H6 | Climate（affinity/trust）是否纳入 v1.x | PENDING_HUMAN_DECISION | 语义未明 |
| H7 | Auto-compaction 用 LLM summary vs hard truncation | PENDING_HUMAN_DECISION | 取决于 context window 与 model cost trade |
| H8 | GLANCE_YIELD_RULES 的 RoboThree 措辞 | PENDING_HUMAN_DECISION | 需要 RoboThree 自己的 designer 审阅 |
| H9 | 是否引入 Skills（AgentSkills spec 兼容） | PENDING_HUMAN_DECISION | 已有 claude-code-best 参照 |
| H10 | Memory-scope 的 RoboThree 默认值（pinned / identity / etc.） | PENDING_HUMAN_DECISION | 需要 design 决策 |

## 调研边界声明

1. **不**修改 `robothree/`（任何架构文档 / ADR）——仅提议
2. **不**修改 RoboThree_workspace 任何文件
3. **不**生成 ADR（除非用户明确要求）——见 [SKILL § 14.3]
4. **不**重新跑 Level 3 deep dive——除非用户明确要求

## 进一步研究建议

若 RoboThree 决定采纳上述建议，按以下顺序：

1. **Level 3 专项 1**：mailbox + seen-cursor + atomic dup（**核心**）
2. **Level 3 专项 2**：GLANCE_YIELD_RULES + small-brain triage gate
3. **Level 3 专项 3**：LLM-summarized auto-compaction

每个专项 ~1 周工作量，含：
- RoboThree 现有架构适配分析
- 原型代码（不进入 RoboThree_workspace）
- ADR 候选

## Reference

- [architecture.md](./architecture.md)
- [runtime-sequence.md](./runtime-sequence.md)
- [subagent-system.md](./subagent-system.md)
- [open-questions.md](./open-questions.md)
- [docs/COORDINATION.md](../../sources/cumora/docs/COORDINATION.md)
- [docs/BYOA.md](../../sources/cumora/docs/BYOA.md)
