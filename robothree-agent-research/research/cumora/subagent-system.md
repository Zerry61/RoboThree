# Cumora — Multi-Agent 协调（Conditional L2）

> 提交固定：`d10283dc06e08996f844518b87da30baf5dcecc1`
> 触发 § 5.3：存在真实多 Agent（独立 Session / ToolSet / 权限——BYOA daemon 各自跑自己的 local CLI；cloud K8s pod 每个 agent 一个）
> 这是 cumora 最大特色之一，对 RoboThree 多 Agent 场景直接相关，故独立成文。
> Permission / Security 已在 [architecture.md § 4](./architecture.md#4-permission--security-主报告) 覆盖，本文档不重复。

## 1. 多 Agent 形态总览

Cumora 的多 Agent 分两层：

### 1.1 进程级隔离

| 类型 | 进程模型 | Trust Boundary |
| --- | --- | --- |
| **Cloud Agent** | 1 K8s pod = 1 agent（orchestrator.ts:1257） | pod boundary + per-pod JWT（runtime/jwt.ts:83） |
| **BYOA Agent** | 1 user's machine = N agents（`agents/computer/daemon.ts:3483`） | user's machine = BYOA trust boundary |

> **同台机器多 Agent 隔离**：BYOA daemon 通过 `BigBrainSemaphore` + `AdaptivePacer` + per-agent `engineBackoffUntil` 软隔离；不靠进程，靠排队和 backpressure。

### 1.2 Session 隔离

| 维度 | Cloud Agent | BYOA Agent |
| --- | --- | --- |
| **Inbox** | per-agent `last_read_at` 游标（Postgres `conversation_reads`） | 同左 |
| **Memory** | per-agent `agent_workspace/memory/*` | 同左 |
| **Workspace** | per-turn FS namespace（hydrate / commit / teardown） | 同左（但 BYOA 不走 FUSE） |
| **State** | per-agent `agent_runs` 行 + `events` 流 | 同左 |
| **CLI** | cloud pod 内 `cumora` binary | BYOA user's local `cumora` binary（同一 npm package） |
| **Model** | per-agent persona.model 或 global `OPENAI_MODEL` | per-agent persona.model 或 BYOA daemon `CUMORA_DEFAULT_*_MODEL` |

### 1.3 ToolSet

> 所有 agent 共享同一 toolset：`bash` + `set_turn_status`（protocol）+ native（仅 set_turn_status）。没有 per-agent tool 限定——权限通过 prompt + 服务端 preflight（不是 tool blacklist）。

## 2. Mailbox Scheduler（[agents/scheduler.ts:948](../../sources/cumora/server/src/agents/scheduler.ts)）

### 2.1 触发路径

```text
message INSERT (DB) → CH_MESSAGE_NEW publish (Redis)
   ↓
scheduler subscribes
   ↓
For each conv member (filter humans, dedupe agent authors):
   ├─ publish wake to per-agent wake queue
   ├─ per-agent serial (one at a time)
   └─ coalesce burst (debounce 2.5s in BYOA)
   ↓
runAgentTurn(agentId) start
```

> **核心：** scheduler 不决定 "who replies, how, what to say"——只决定 "who to wake"。reply 决策完全在 agent 的 `runAgentTurn` 内（小模型 triage + 大模型 decision）。

### 2.2 启动入口

[server/src/index.ts:253-257](../../sources/cumora/server/src/index.ts#L253-L257)：

```ts
// Mailbox scheduler: subscribes to CH_MESSAGE_NEW and runs an agent turn for
// every conversation member who isn't the author. Replaces the old
// server-side classifier/cascade — every agent decides for itself via its
// own LLM call whether to reply / react / dm / ack.
startScheduler()
```

> **设计选择**：明确拒绝 server-side classifier + cascade（详见 § 6 anti-patterns）。Cumora 把"是否回复"的决策权 100% 交给 agent 的 LLM（每 agent 独立 LLM call）。

### 2.3 触发类型

```ts
type Trigger = 'message.new' | 'idle' | 'manual' | 'background_scan' | 'poll.updated'
```

| Trigger | 用途 |
| --- | --- |
| `message.new` | 新消息触发（默认） |
| `idle` | Idle scheduler 触发（默认 15min），agent 自发 init |
| `manual` | 用户手动 wake（带 brief） |
| `background_scan` | Scanner 发现事件触发（per-agent `background.scan` capability） |
| `poll.updated` | Poll 投票 / 关闭触发（仅 poll 作者） |

## 3. 7 层防御（COOR § 5）—— 已覆盖在 [architecture.md § 3](./architecture.md#3-coordination7-层防御)，本节列出 RoboThree 对齐建议

| # | 防御层 | 适用 RoboThree 维度 |
| --- | --- | --- |
| 1 | Per-agent model pin（deploy env） | ADAPT |
| 2 | Per-computer BigBrain semaphore | ADOPT |
| 3 | Deterministic spawn spacing | ADOPT（防止 provider RL 撞墙） |
| 3a | Per-triage semaphore | ADOPT（同 3 共生） |
| 3b | AdaptivePacer | ADOPT（chat-turn + agenda-turn 同时接入） |
| 3c | Wake debounce + coalescing + steering | ADOPT（BYOA 必选） |
| 4 | Per-agent RL cooldown + notice suppression | ADOPT |
| 5 | Server-side freshness preflight（seen-cursor） | ADOPT |
| 5b | Atomic in-tx verbatim-dup HOLD | ADOPT |
| 5c | Stall pipeline + deterministic fallback + decline cap | ADAPT |
| 5d | Hold-token-gated `--send-anyway` / `--force` | ADOPT（**任何 override flag 必须 ack server-shown state**） |
| 5e | Recently-created dedup（doc / calendar） | DEFER（场景特定） |
| 6 | Small-brain triage gate（server + BYOA） | ADOPT（**pure dependency-free 模块**——BYOA 可复用） |
| 7 | GLANCE_YIELD_RULES（5 条 shape-level） | ADOPT（**shape-level 不要 scenarios**） |

> **RoboThree 重点**：5d（hold-token-gated override） + 5b（in-tx verbatim-dup） + 7（GLANCE_YIELD_RULES 5 条）是 cumora 最值得借鉴的 3 个机制。
>
> 7 条规则是 **1 行 string**——见 [glance-protocol.ts:20](../../sources/cumora/server/src/agents/glance-protocol.ts#L20)。**禁止**扩成 scenarios。

## 4. Coord 的 Anti-Patterns（[docs/COORDINATION.md § Anti-patterns](../../sources/cumora/docs/COORDINATION.md)）

> 原文 9 条 anti-patterns——**RoboThree 设计 coordination 时必须通读**：

1. **Don't cap one layer without the other**（big brain + triage 配对 cap）
2. **Don't accrete scenario examples in the prompt**（GLANCE_YIELD_RULES 保持 shape-level）
3. **Don't dump `AGENT_VOICE_RULES` into the BYOA standing prompt**
4. **Don't dump the CLI catalog into the standing prompt**（用 `cumora help` 发现）
5. **Don't write a "how to handle HELD" section**（HELD envelope 自带解释）
6. **Don't pile loop-prevention mechanisms when one already exists**（4 个机制够了）
7. **Don't write to `conversation_reads.last_read_at` as a side effect**（用 Redis）
8. **Don't add fetch calls without a timeout**（用 AbortController）
9. **Don't ship an override flag without a cost**（soft gates erode）

> RoboThree 应当在自己的设计文档中**原样引入**这一节。

## 5. Per-turn FS Namespace（多 Agent 文件隔离）

> 见 [runtime/fs-namespace.ts:114](../../sources/cumora/server/src/agents/runtime/fs-namespace.ts) + [turn.ts:1933, 3432-3457](../../sources/cumora/server/src/agents/turn.ts)

### 5.1 设计

- `agent_workspace`（Postgres 表）= 全局虚拟文件系统
- **每次 turn**：
  1. `hydrate`：拷贝 `agent_workspace` 当前 snapshot 到 `/tmp/cumora-fs/<runId>/`，记录 baseline
  2. agent 用 `cat IDENTITY.md` / `grep -r foo memory/` 等真实 shell 命令
  3. `commit`：turn 结束时算 diff（inserts / updates / deletes），写回 `agent_workspace`
  4. `teardown`：删 `/tmp/cumora-fs/<runId>/`

### 5.2 并发语义

- 两个 agent 同时 wake（不同的 runId）→ 各自 hydrate 一份，互不影响
- 同一 agent 同一时刻只一个 turn（busy lease）→ 不会 hydrate 冲突
- 同一 agent 跨 turn：A turn commit 后，B turn hydrate 时看到 A 的最新内容

### 5.3 不变量

- **commit ⟺ teardown**（finally block 强制）—— 即使 turn 失败也 commit 一次
- commit 失败 → `fs.commit_failed` event log + 警告（数据可能丢失但不抛）

### 5.4 RoboThree 适配

| 维度 | 建议 |
| --- | --- |
| Per-agent workspace | ADOPT（每个 agent 一个 workspace 表） |
| Per-turn copy | ADAPT（不需要 OS 镜像，**直接读 Postgres 表当文件系统**）——cumora 因为 BYOA + 本地 CLI 需要真实 fs |
| diff + commit | ADOPT（避免每写一行就 round-trip DB） |
| fs.commit_failed 不抛 | ADOPT（data loss 不应导致 turn failed） |

## 6. Subagent 形态差异（Cloud vs BYOA）

| 维度 | Cloud Agent（K8s pod） | BYOA Agent（用户本机） |
| --- | --- | --- |
| 模型 provider | OpenAI / sub2api（per-tenant） | BYOA 用户的 provider（Claude Code / Codex / OpenCode / pi CLI） |
| Brain | cumora turn.ts（Node.js） | BYOA 用户的 local CLI |
| Tool runtime | in-process（Node.js） | 用户的 local CLI subprocess |
| Memory / workspace | Postgres `agent_workspace` | BYOA user machine `~/.cumora/agents/<id>/` |
| Coordination | cloud-side seen-cursor + atomic dup | BYOA server-side preflight（agent 上传消息时） |
| Trust boundary | cumora-server + K8s pod | BYOA user machine |
| Provider keys | cumora 持有（per-tenant sub2api） | BYOA user 持有（never 离开本机） |

> **RoboThree 启示**：
> - 同一份 `GLANCE_YIELD_RULES` 同时服务 cloud 和 BYOA（**纯 string，无副作用**）
> - 同一份 `triage-core.ts` 同时服务 cloud（sub2api small model）和 BYOA（user's local CLI small model）—— **pure dependency-free 设计**
> - 同一份 `memory-scope.ts` 同时约束 cloud `loadMemory` 和 BYOA `memoryDigest`

## 7. 为什么 cumora 的多 Agent 工作得好

### 7.1 Server 端串行化 + 模型自适应

```text
agent A 和 B 同时 wake
  ↓
A 先到 server → fresh preflight → INSERT → publishSeen(A, A_seq)
  ↓
B 到 server → newer-than-baseline peer exists → HELD
  ↓
B's big brain 看到 HELD messages → 读 inbox → 自然 yield
```

> **关键**："agent 总能从 posted state 出发"——模型不靠 prompt 防御 race，server 真实拦截，模型自适应。

### 7.2 Opt-in multi-agent coordination

```ts
GLANCE_YIELD_RULES:
  1. HUMAN CAN ADDRESS ONE NAMED TEAMMATE WITHOUT @-ING THEM
  2. REPLY FROM THE REAL, POSTED STATE  ← 关键
  3. POST OPTIMISTICALLY; SERVER IS YOUR SAFETY NET  ← 关键
  4. DON'T REPEAT A PEER, STOP WHEN DONE
  5. DO NOT CLAIM A CHAT TURN OR GAME SLOT  ← 反 claim 滥用
```

> **核心思路**：
> - 模型**乐观** post（HOLD safety net）
> - 模型**不靠** claim 锁（避免抢锁思维）
> - 模型**不靠** scenario-specific 规则（避免 prompts 膨胀）
> - Server **强**串行化（freshness + atomic dup）
> - Override **必须** ack server-shown state（hold-token-gated）

### 7.3 Counter-example：cumora 已经踩过的坑

| 场景 | 坑 | 修复 |
| --- | --- | --- |
| 7 agents 同时 wake on "@all" | 大脑先到先 INSERT，小脑后到 HELD | freshness preflight + atomic dup |
| OpenAI rate limit | 130 RL hits in 17min on 7-agent broadcast | BigBrainSemaphore + AdaptivePacer |
| sub2api 100% 503 on triage | agenda safety net 静默失效 | deterministic fallback（narrow） |
| "0.9.1 baseline" 之后累积 prompt rules | 5/28 perfect → 7/8 chain | revert + 回到 baseline shape |
| `--send-anyway` preemptive bypass | 双重 deliverable 事件 | hold-token + seq-bound + 2min TTL |
| Memory 文件 cross-project bleed | "I used my slot" memory poison 后续游戏 | memory-scope.ts 严格区分 global + project |
| Absent teammate (Olivia 401) | "we can't finish the task" | "TEAM ADAPTS WHEN MEMBER ABSENT" principle |

## 8. RoboThree 多 Agent 设计的具体建议

### 8.1 推荐借鉴（ADOPT）

1. **Mailbox 模型**（[scheduler.ts:948](../../sources/cumora/server/src/agents/scheduler.ts)）—— RoboThree 当前架构若不是 mailbox，应评估迁移
2. **Server-side freshness preflight**（[seen-boundary.ts:273](../../sources/cumora/server/src/agents/seen-boundary.ts)）—— RoboThree Agent Runtime 应该有类似机制
3. **Atomic in-tx verbatim-dup** —— **不可 bypass**（不是 prompt 级防御）
4. **Hold-token-gated override**（seq-bound + 2min TTL）—— **任何 override flag 必须 ack server-shown state**
5. **GLANCE_YIELD_RULES 5 条** —— 用 RoboThree 自己的措辞；保持 shape-level；禁止扩 scenarios
6. **BigBrainSemaphore + AdaptivePacer** —— multi-agent 必有
7. **Per-agent RL cooldown + notice suppression** —— provider throttling 不应 leak 到 chat
8. **Per-turn FS namespace（commit 失败不抛）** —— 隔离 turn 文件操作

### 8.2 推荐改造（ADAPT）

1. **Small-brain triage gate**（[triage-core.ts:497](../../sources/cumora/server/src/agents/triage-core.ts)）—— 提取到 RoboThree Agent Runtime；pure dependency-free 让 BYOA 复用
2. **Auto-compaction（LLM-summarized）**（[turn-compaction.ts:376](../../sources/cumora/server/src/agents/turn-compaction.ts)）—— 提取到 Agent Loop；modelWindow-aware
3. **Mid-turn steering with draft carry-through**（[steer.ts:454](../../sources/cumora/server/src/agents/steer.ts)）—— 改造为 RoboThree Event Bus
4. **agent-fuse / per-pod mount** —— 不需要 FUSE（RoboThree 可以直接 DB access）；保留 hydrate/commit/teardown 模式
5. **AgentRuntimeClient abstraction**（[runtime/client.ts:389](../../sources/cumora/server/src/agents/runtime/client.ts)）—— 这是关键的 Phase 3 seam；RoboThree 跨域复用

### 8.3 推荐推迟 / 拒绝（DEFER / REJECT）

| 项 | 决策 | 理由 |
| --- | --- | --- |
| Real email（Resend + Cloudflare Email Routing） | REJECT | 产品范围外 |
| K8s per-agent pods + Go FUSE | REJECT | 场景特定（cumora 是 SaaS） |
| Mailbox scheduler 替代"由人类触发" | DEFER | RoboThree 当前若以人类触发为主，可不改 |
| agent_workspace 的 BYOA 同步（user's local fs） | DEFER | RoboThree 集中式 DB，无需双向同步 |

### 8.4 待证据（NEEDS_MORE_EVIDENCE）

| 项 | 需补证据 |
| --- | --- |
| Climate（affinity/trust） 真实有效性 | cumora 未公开 benchmark；只在 prompt 里显示，无明确实证 |
| 7 层防御的"必要 6 层" | cumora 删过 2 次 loop floor 又加回；RoboThree 是否同样需要待评估 |

## 9. 文件清单

| 文件 | 角色 |
| --- | --- |
| [`docs/COORDINATION.md`](../../sources/cumora/docs/COORDINATION.md) | 7 层防御 + 9 anti-patterns + 6/3 chain push narrative（必读） |
| [`server/src/agents/scheduler.ts`](../../sources/cumora/server/src/agents/scheduler.ts) | Mailbox scheduler |
| [`server/src/agents/turn.ts`](../../sources/cumora/server/src/agents/turn.ts) | runAgentTurn 主循环 |
| [`server/src/agents/triage-core.ts`](../../sources/cumora/server/src/agents/triage-core.ts) | Pure triage (dependency-free) |
| [`server/src/agents/inbox-triage.ts`](../../sources/cumora/server/src/agents/inbox-triage.ts) | Cloud triage 入口 |
| [`server/src/agents/glance-protocol.ts`](../../sources/cumora/server/src/agents/glance-protocol.ts) | GLANCE_YIELD_RULES 5 条 |
| [`server/src/agents/seen-boundary.ts`](../../sources/cumora/server/src/agents/seen-boundary.ts) | Seen-cursor + hold token |
| [`server/src/agents/steer.ts`](../../sources/cumora/server/src/agents/steer.ts) | Mid-turn steering |
| [`server/src/agents/cli.ts`](../../sources/cumora/server/src/agents/cli.ts) | cmdReply（freshness + atomic dup） |
| [`server/src/agents/agenda.ts`](../../sources/cumora/server/src/agents/agenda.ts) | Stall pipeline + fallback |
| [`server/src/agents/turn-compaction.ts`](../../sources/cumora/server/src/agents/turn-compaction.ts) | LLM-summarized auto-compaction |
| [`server/src/agents/runtime/fs-namespace.ts`](../../sources/cumora/server/src/agents/runtime/fs-namespace.ts) | Per-turn FS |
| [`server/src/agents/memory-scope.ts`](../../sources/changzhengyi/Desktop/RoboThree/robothree-agent-research/sources/cumora/server/src/agents/memory-scope.ts) | Memory scope contract (cloud ↔ BYOA 共享) |
| [`server/src/agents/computer/daemon.ts`](../../sources/cumora/server/src/agents/computer/daemon.ts) | BYOA daemon（BigBrainSemaphore + AdaptivePacer） |
| [`server/src/agents/computer/engine.ts`](../../sources/cumora/server/src/agents/computer/engine.ts) | BYOA engine（持久化 CLI session） |
