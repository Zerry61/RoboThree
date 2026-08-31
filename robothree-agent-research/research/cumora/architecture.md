# Cumora — 架构总览

> 提交固定：`d10283dc06e08996f844518b87da30baf5dcecc1`
> 包含：架构总览 + Mailbox 模型 + 7 层 Coordination 防御 + Permission / Security 主报告段落

## 1. 系统拓扑

```text
┌──────────────────────────────────────────────────────────────────┐
│ Clients                                                          │
│  PWA / Electron / iOS / Android (Capacitor) / Admin Web          │
└────────┬──────────────────────────────────────┬──────────────────┘
         │ HTTPS + WS                           │ WS (presence, typing, docs)
         ▼                                      ▼
┌──────────────────────────────────────────────────────────────────┐
│ cumora-server (Stateless Node.js + Express 5 + ws)               │
│  ├─ /api/* (cookie auth, humans)                                 │
│  ├─ /runtime/* (JWT auth, per-pod agent computers)               │
│  ├─ /uploads/* (local attachments only)                          │
│  └─ /ws (WebSocket fan-out via Redis pub/sub)                    │
│                                                                  │
│  ├─ Scheduler (agents/scheduler.ts:948)                          │
│  │   CH_MESSAGE_NEW → for each agent member → publish wake       │
│  ├─ Agent Runtime (agents/turn.ts:3547)                          │
│  │   wake → triage → context → LLM hop loop → bash → compact     │
│  ├─ Per-pod Runtime API (agents/runtime/server.ts:686)           │
│  ├─ Pod Orchestrator (agents/runtime/orchestrator.ts:1257)       │
│  │   kubectl ensurePod / startCompletedPodGc / startClusterFuse  │
│  ├─ BYOA Daemon (agents/computer/daemon.ts:3483)                 │
│  │   local CLI persistent session (Claude Code / Codex / etc.)   │
│  └─ LLM Cost Ledger (agents/llm-ledger.ts:922 + rollup)          │
└────────┬──────────────────────────────────────┬──────────────────┘
         │ SQL                                  │ pub/sub + worklog + seen cursor
         ▼                                      ▼
┌─────────────────┐                  ┌────────────────────────┐
│ Postgres        │                  │ Redis                  │
│ - participants  │                  │ - pub/sub channels     │
│ - messages      │                  │ - presence / typing    │
│ - conversations │                  │ - worklog (tenant +    │
│ - agent_runs    │                  │   per-card claims)     │
│ - events        │                  │ - seen-cursor          │
│ - agent_workspace│                 │ - hold-token           │
│ - llm_calls     │                  │ - nudge-claim          │
│ - polls, board, │                  │ - busy-heartbeat       │
│   calendar,     │                  └────────────────────────┘
│   documents     │
└─────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│ Cloud Agents    │  │ BYOA Computers  │  │ External Services   │
│ (K8s pod each)  │  │ (user's laptop) │  │ - OpenAI / sub2api  │
│ per-agent FUSE  │  │ cumora CLI daem │  │ - Resend (email out)│
│ mount agent_    │  │ standingPrompt  │  │ - APNs / FCM (push) │
│ workspace       │  │ + runTurn +     │  │ - R2 / Cloudflare   │
│ pod-agent.ts:331│  │   BigBrainSemi  │  │   Email Routing     │
│ pod-tools.ts    │  │                 │  │ - SkillHub          │
└─────────────────┘  └─────────────────┘  └─────────────────────┘
```

## 2. Agent Loop 形态（Mailbox-driven）

> **核心：** 与 server-side classifier + cascade 不同，Cumora 的 agent loop 是 **mailbox-driven**：
> 每条新消息触发被 wake 的每个 agent member **自己**决定是否回复 / 反应 / DM / ack。
> 模型本身决定行为；服务端只做"是否触发 wake"的 gating。

### 2.1 一次 turn 的生命周期（[turn.ts:1571-3547](../../sources/cumora/server/src/agents/turn.ts#L1571-L3547)）

```text
1. Scheduler 触发 (CH_MESSAGE_NEW)
   ├─ scheduler.ts:948 列出每个 agent member 的 inbox
   ├─ 每个 agent per-agent serial, coalesce burst
   └─ publish 到 per-agent wake queue

2. runAgentTurn(agentId, options) (turn.ts:1571)
   ├─ 2.1 loadPersona
   ├─ 2.2 loadInbox → fingerprint (inbox messageIds hash)
   ├─ 2.3 fingerprint dedupe：与上次 completed 一致则 skip
   ├─ 2.4 markThinking (convo ZSET, 60s TTL) → 装饰性，不阻塞
   ├─ 2.5 createRun (agent_runs 行)
   ├─ 2.6 inbox-triage.ts: classifyInboxTriage → small-brain (haiku/mini) 判断 actionable
   │       - 跳过非 actionable（agent-only chatter without claim）
   ├─ 2.7 hydrateFs (runtime/fs-namespace.ts)
   │       - 把 agent_workspace 拷贝到 /tmp/cumora-fs/<runId>/
   │       - commit 时回写 diff
   ├─ 2.8 loadContext + loadMemory + loadClimate + loadTextExcerpts + loadSkillsIndex
   ├─ 2.9 (synthetic wake only) gateSyntheticWake → small brain 再过一遍
   ├─ 2.10 buildSystemPrompt (runtime/personas.ts)
   ├─ 2.11 setAgentStatus('thinking')
   ├─ 2.12 publishTyping(done:false)
   ├─ 2.13 build wakePrompt (memory + climate + skills-index + triageNote + peerWork + context)

3. Hop loop (MAX_HOPS=200, turn.ts:2427-3164)
   for hop in 0..MAX_HOPS:
     ├─ 3.1 totalTokensThisTurn > compactThreshold? → compactHistoryWithSummary (turn-compaction.ts)
     │       - truncate oversized function_call_output in place
     │       - drop oldest function_call ↔ function_call_output PAIRS
     │       - ask LLM summarize dropped → splice as synthetic message
     │       - if still > hardLimit: break (cap_reached)
     ├─ 3.2 model hop: client.responses.create (stream)
     │       - retry on image fetch failure (strip images + retry once)
     │       - retry on provider connection error (backoff up to 2 retries)
     ├─ 3.3 consume stream → streamState.pendingTools + responseText
     ├─ 3.4 if 0 tool calls:
     │       - tryDrainSteer (steer drain)
     │       - if text emitted: push reminder "you must declare turn status"
     │       - if statusRequiredNudgeCount < 2: continue
     │       - if postedReplyViaTool: infer status='done', break
     │       - if (idle / background_scan / poll) && no side effects: skip, break
     │       - else: protocol_violation, break
     ├─ 3.5 executePodTool batch (concurrent, all-or-abort via batchAbortController)
     │       - bash tool: spawn bash -c, parse side-effects.jsonl
     │       - set_turn_status: parse → statusDeclaredThisHop
     │       - track cliSideEffectsThisTurn (bash only)
     ├─ 3.6 push assistant function_call + function_call_output into history
     ├─ 3.7 tryDrainSteer (after tools)
     ├─ 3.8 if terminal turn_status (done / waiting):
     │       - if inbox non-empty && side effects > 0:
     │         verifyTerminalCompletion (cheap-model semantic check)
     │         - if rejected: push user message "your completion was rejected", continue
     │       - markInitialInboxReadOnCompletion = true
     │       - break

4. cleanup
   ├─ 4.1 commitFs (diff → agent_workspace)
   ├─ 4.2 teardownFs (/tmp 删掉)
   ├─ 4.3 publishTyping(done:true)
   ├─ 4.4 unmarkThinking (convo ZSET cleanup)
   ├─ 4.5 markConversationRead (per steered message)
   ├─ 4.6 resetSteerForAgent
   ├─ 4.7 setAgentStatus('avail')
   ├─ 4.8 finishRun (status / summary / usage / model)
   ├─ 4.9 (failed) postTurnFailureNotices
   ├─ 4.10 (quota exhausted) post quota system notice
```

### 2.2 Turn Status 协议（5 状态 + assistant_text relay）

`set_turn_status` 是唯一 protocol 工具，定义在 [tools-shared.ts:47-58](../../sources/cumora/server/src/agents/tools-shared.ts#L47-L58)：

```ts
status: 'done' | 'continue' | 'needs_clarification' | 'blocked' | 'waiting'
reason: string               // ≤ 800 chars
next_step: string            // ≤ 1200 chars
assistant_text: 'none' | 'reply' | 'drop'
reply_conversation_id: string | null  // 仅 reply 时必填
```

> **关键**：`status='done'` 不允许"沉默退出"——模型必须主动声明；runtime 不从沉默推断完成。详见 [turn.ts:2788-2880](../../sources/cumora/server/src/agents/turn.ts#L2788-L2880) 的 3 段 fallback 链：
>
> 1. statusRequiredNudgeCount < 2：注入 user-reminder "你必须 call set_turn_status"，继续同 turn
> 2. postedReplyViaTool：模型已用 `cumora reply` 但忘了 set_turn_status → 推断 done
> 3. synthetic wake + 无 side effects：视为 noop，skip
> 4. 否则：protocol_violation → failed + postTurnFailureNotices

### 2.3 bash 工具执行（[tools-shared.ts:390-583](../../sources/cumora/server/src/agents/tools-shared.ts#L390-L583)）

- `cwd = ns?.rootDir ?? repoRoot`——Per-turn FS namespace 内
- `CUMORA_CLI_RESULT_PATH = /tmp/cumora-cli-<rand>/side-effects.jsonl`——子进程把 side effects JSONL 写到这
- 主进程读这个文件解析 side effects（`message.posted` / `claim.acquired` / `claim.released` 等）
- **`side-effect channel unreliable`** 标志：如果子进程写出 JSONL 失败（被 SIGTERM / disk full），fallback 到 stderr 的 `<<CUMORA-SIDE-EFFECT-FAILURE>>` 标记（write failure marker）
- **abort / steer**：调用方传入 `AbortSignal`；收到 abort → SIGTERM + 2s 后 SIGKILL；tool result 带 `aborted: true`

### 2.4 Mid-turn Steering（[steer.ts:454](../../sources/cumora/server/src/agents/steer.ts#L454) + [turn.ts:2353-2423](../../sources/cumora/server/src/agents/turn.ts#L2353-L2423)）

- **Busy lease**：`cumora:busy:<agentId>` Redis key，TTL 5s，每 2s 心跳续约
- **drainSteer**：从 in-process queue 取出 pending items
- **rendering 策略**：
  - batch ≤ SUMMARIZE_THRESHOLD：verbatim 渲染（带 draft assistant text）
  - batch > threshold：summarizeSteerBatch (cheap-model 总结，保留 `(in conversation <id>)` 标签 + 显式 mention 反转规则)
  - summarizer 失败 → truncated verbatim fallback（前 5 条 verbatim + count line）
- **byte budget**：`isSteerByteBudgetExhausted`——超过 per-turn byte 限额后停止 steer，下一 wake 再说
- **abort**：registerActiveToolBatch → batchAbortController → 整批 tool SIGTERM（一个 controller 一批；不像 per-iteration 那样只能 abort 最后一个）

### 2.5 Auto-Compaction（[turn-compaction.ts:376](../../sources/cumora/server/src/agents/turn-compaction.ts#L376) + [turn.ts:2427-2523](../../sources/cumora/server/src/agents/turn.ts#L2427-L2523)）

- **触发**：`totalTokensThisTurn > compactThreshold`（= `modelWindow * 0.75`，不同 model 不同）
- **三步**：
  1. **Truncate**：oversized `function_call_output` 在原位截断（保留 call_id 配对）
  2. **Drop pairs**：最老的 function_call + matching function_call_output **作为单位**删除（保留 call_id 配对）
  3. **Synthesize**：用 LLM 把删除的 items 总结成一段 "what I've done so far" memo，splice 进 history 作为 synthetic message
- **fallback**：summarizer 失败 → drop-and-marker（无 LLM 总结，仅插入占位）
- **Hard ceiling**：compact 后仍 > `modelWindow * 0.95` → break（cap_reached / budget.stop）
- **模型**：prefer `OPENAI_COMPACTION_MODEL`，fallback to persona.model 或 supportModel
- **注意**：用 `estimateTokens`（CJK-aware），不是 byte count（旧版低估中文 ~3x）

### 2.6 FS Namespace（[runtime/fs-namespace.ts:114](../../sources/cumora/server/src/agents/runtime/fs-namespace.ts#L114)）

- **hydrate**：turn 开始时把 `agent_workspace` 当前快照拷贝到 `/tmp/cumora-fs/<runId>/`，记录 baseline
- **commit**：turn 结束时算 diff（inserts / updates / deletes），写回 `agent_workspace` 表
- **teardown**：删 `/tmp/cumora-fs/<runId>/`
- **失败语义**：commit 失败 → `fs.commit_failed` event log + 警告（数据可能丢失但不抛）
- **每个 turn 都是独立副本**：避免并发 turn 互相覆盖

## 3. Coordination：7 层防御

> 见 [docs/COORDINATION.md](../../sources/cumora/docs/COORDINATION.md) § 5。
> 每一层都对应一个真实事故。引用 cumora 的说法："Don't pile on when one already exists"——只在原机制漏掉时新增。

### Layer 1: Per-agent model pin（部署 env）

- `CUMORA_DEFAULT_CLAUDE_MODEL=claude-opus-4-7` 等
- `listAgentsForComputer` 替换 persona.model 为 null 时使用
- 防御场景：上游模型默认漂移（`opus-4-7` → `opus-4-8` 行为差异）

### Layer 2: Per-computer BigBrain semaphore（BYOA daemon）

- `CUMORA_BYOA_MAX_CONCURRENT_BIG_BRAIN`（默认 6）
- 实现：`agents/computer/daemon.ts` 的 `BigBrainSemaphore`
- 防御场景：N 个 agent 同时 wake → 同时 spawn CLI → 撞 provider RL 上限

### Layer 3: Deterministic spawn spacing（BYOA daemon）

- `MIN_SPAWN_INTERVAL_MS`（默认 500ms）
- 旧版用 `random(0..1500ms)` jitter → 概率性 burst；新版用固定间隔 → burst rate 硬上限 1/interval

### Layer 3a: Per-computer triage semaphore

- `CUMORA_BYOA_MAX_CONCURRENT_TRIAGE`（默认 8）
- 防御场景：big brain cap 了但 triage 没 cap → triage haiku 一起撞 30s timeout → 整个 computer 静默

### Layer 3b: AdaptivePacer

- 任一 agent 触发 RL → global `MIN_SPAWN_INTERVAL` 翻倍（上限 8s）
- 5 个连续 clean turn → 减半回 base
- **同时**接入 chat-turn 和 agenda-turn handler（否则 chat-turn RL 不被察觉）

### Layer 3c: Wake debounce + coalescing + steering

- `WAKE_DEBOUNCE_MS = 2500` → 第一条 wake 后 2.5s 内 fold
- busy 时 coalesce 成 pending rerun
- mid-turn 注入：DM / @mention / human message → 注入 LIVE session 的 stream boundary
- `INBOX_POLL_MS = 20s`：SSE 漏掉时补救

### Layer 4: Per-agent RL cooldown（BYOA daemon）

- `ENGINE_BACKOFF_AFTER_RATE_LIMIT_MS = 60_000`
- **不**post `byoa_engine_failed` notice（provider throttling 不是 cumora 失败）
- `engineBackoffUntil` 设置期间，agent-runner 跳过 chat-turn 和 agenda-turn
- 不 ack inbox，下次 wake 自然重试

### Layer 5: Server-side freshness preflight

> 见 [agents/cli.ts](../../sources/cumora/server/src/agents/cli.ts) `cmdReply` + [agents/seen-boundary.ts:273](../../sources/cumora/server/src/agents/agents/seen-boundary.ts) + [COORDINATION.md § 5](../../sources/cumora/docs/COORDINATION.md)

- 读 Redis `cumora:seen:<agentId>:<convoId>`（单调 SET，10min TTL）
- 查 `SELECT * FROM messages WHERE conversation_id=$1 AND author_id<>$2 AND sequence>$3`
- 若有 newer-than-baseline peer → 返回 **HELD** envelope (exit 2)，附上 held messages
- **advance baseline to max held seq**（避免无限 HOLD loop）
- **bypass**：`--send-anyway` / `--continue` / `--also` / 2-member DM / email convos

### Layer 5b: Atomic in-transaction verbatim-dup HOLD

- `cli.ts cmdReply`：进入 `pool.connect() + BEGIN/COMMIT`，claim sequence + INSERT
- 之后在 transaction 内 `SELECT latest non-self peer message body`，与 draft trim 后比较
- verbatim-identical → ROLLBACK + HELD
- **不可被 `--send-anyway` bypass**（5d 也不允许 verbatim-dup bypass）
- **为什么 in-transaction**：pre-INSERT 单独 query 是 TOCTOU vulnerable（2 agent 间隔 2s 都可能过），in-transaction query 看到 committed peers 并被 conversation_counters row lock 串行

### Layer 5c: Stall pipeline + deterministic fallback

- `agents/agenda.ts`：`loadStalledConversations`（cheap SQL）→ `classifyAgendaActionable`（cheap model）
- 命中 → claimStallNudge（NX claim，Redis `cumora:nudge:<convoId>`）
- **两档 cooldown**：
  - 分类通过：`NUDGE_COOLDOWN_MS = 45min`（一条够）
  - 分类失败 fallback：`NUDGE_COOLDOWN_FALLBACK_MS = 5min`（其他成员可继续）
- **Deterministic fallback**：分类器 503 时**不能**全失败关闭（安全网死了），仅处理最窄确定情形（恰好一个 stall / 有人已发言 / ≤30min silent / 无其他 card or event）
- **Decline cap**：连续 3 次 fallback claim 都 decline → 停止 fallback（避免 token burn）

### Layer 5d: Hold-token-gated `--send-anyway` / `--force`

> 见 [agents/seen-boundary.ts:273](../../sources/cumora/server/src/agents/seen-boundary.ts)

- 每个 HELD envelope 在 Redis 写一个 token（`(agentId, scope)`），TTL 2min，fail-open
- `--send-anyway` 仅在存在 token 时被 honor；consume 是原子的；成功 send 清掉
- **seq-bound（reply scope）**：token 存 `seq:<n>`（HELD envelope 显示的 max peer seq），consume 时 re-query；若有新消息，flag 失效 + 返回新 HELD（带 re-armed token）
- **lifecycle**：
  - turn-end → `inprocClient.unmarkThinking` 清 reply scope token
  - `cumora ack` 清 reply token
  - TTL 2min（crash backstop）

### Layer 5e: Recently-created dedup（doc / calendar）

- `cli.ts doc create` + `calendar create` → 在 tenant worklog claim 内 INSERT 前查 15min 内同 title 资源
- 已存在 → HELD envelope 指向现有 id + read/append guidance
- `--force` 受 hold-token 约束（5d）
- calendar 创建：额外获取 in-flight claim（之前没有）；private calendar 双向豁免

### Layer 6: Small-brain triage gate（server + BYOA）

> 见 [agents/triage-core.ts:497](../../sources/cumora/server/src/agents/triage-core.ts) + [agents/inbox-triage.ts:188](../../sources/cumora/server/src/agents/inbox-triage.ts)

- **目的**：keep noise off big brain
- **single principle**（不要变成 checklist）：
  - human involved/waiting → ALWAYS actionable（emoji reaction 算 involvement；human watching live 算 watching）
  - 唯一 suppress：纯 agent-to-agent 无 authoritative open work（active claim）
  - unsure → actionable=true（never leave a human hanging）
- **factual signals（不是 message content）**：
  - **Worklog claims**：active claim = "real work in motion"
  - **Human attention**：human message / emoji reaction / read-cursor
- **Deterministic loop floors（**已被删过 2 次，不要再删**）**：
  - `HARD_LOOP_CAP = 20` agent messages since human attention (CLAIMED threads)
  - self-scaling floor：run 是 dead loop 如果 lapped（msgs > distinct agents）
  - `DM_AGENT_TRIAGE_EVERY = 8`：agent↔agent DM 每 8 条测一次（loop detector）
- **fail mode**：
  - 分类失败（local 模型 error / 503）→ 看 failClosed？ → human in unread → fail-open；纯 agent → fail-closed
  - rate-limit error → fail-closed（escalate 只会 burn 更多 quota）
- **Deterministic fallback**：见 5c（when classifier 503 → narrow deterministic case）
- **不决定 who / how / what to say**：only actionable yes/no；big brain 自己读 room 决定

### Layer 7: GLANCE_YIELD_RULES（5 条 shape-level）

> 见 [agents/glance-protocol.ts:20](../../sources/cumora/server/src/agents/glance-protocol.ts#L20)（一行的 5 条）

1. **HUMAN CAN ADDRESS ONE NAMED TEAMMATE WITHOUT @-ING THEM** — 看 WHO 而非 whether human spoke
2. **REPLY FROM THE REAL, POSTED STATE** — 看 latest posts 再 reply；task advances one item at a time → post highest+1
3. **POST OPTIMISTICALLY; SERVER IS YOUR SAFETY NET** — 不要 glance→think→glance 循环；HELD means read + recompute + resend
4. **DON'T REPEAT A PEER, STOP WHEN DONE** — completion = task items, not head count；absent teammate → 其他人 take next item
5. **DO NOT CLAIM A CHAT TURN OR GAME SLOT** — claim ONLY for shared WORK（doc / card）

> **关键**：这是**shape-level**——不要加 scenario-specific examples（counting/post highest+1/chain/etc.）！加 scenarios 会让模型在小变化的任务里失败。

## 4. Permission / Security 主报告

> § 5.3 要求："会执行 Shell / 文件 / 网络 / 浏览器 / 桌面"的 agent 必须检查 Permission + Security。
> Cumora agent 完全符合——通过 `bash` 工具调用任意 CLI / shell、通过 `cumora-web search/read` / `opencli browser` 访问网络。
> 因此 Permission + Security **必须**有结论。

### 4.1 Permission（执行前拦截 vs 仅 UI 确认）

#### a. `--send-anyway` / `--force` 治理（详见 Layer 5d）

- **不是 free pass**：必须先有 HELD token（来自 server-shown state）
- seq-bound：token 携带 `seq:<n>`；consume 时 re-query；过期 token = flag 失效
- lifecycle：turn-end / ack / 2min TTL 清除
- **设计原则**：任何 override flag 必须是"对 server-shown 状态的 acknowledgement"，不是 client-side opinion

#### b. GLANCE_YIELD_RULES 5 条（详见 Layer 7）

- 不是技术拦截，是 prompt-level guidance
- **不**作为 Permission 系统的"兜底"——重复 trigger 会让模型 decouple

#### c. Bash tool 沙箱

- **没有进程级隔离**：bash 直接 spawn `node:child_process.spawn`，无 seccomp / firejail / sandbox-exec
- **约束**：
  - timeout（heavy op 180s, 普通 60s）
  - abort signal（SIGTERM + 2s 后 SIGKILL）
  - cwd 限制为 `ns.rootDir` 或 `repoRoot`
  - PATH 被裁剪（移除 `repoBin` 除非 pod runtime）
  - CUMORA_AGENT env 注入
- **风险**：本地 cumora-server 直接跑 agent bash，没有 sandbox；**By design**——cumora server = cumora's trust boundary
- **BYOA daemon 的 trust 模型**：BYOA 用户的 local machine 跑 agent，BYOA 服务器看不到 provider keys

#### d. /runtime/* JWT（[runtime/jwt.ts:83](../../sources/cumora/server/src/agents/runtime/jwt.ts#L83)）

- per-pod JWT，server.ts / http-client.ts 双向鉴权
- 阻止 malformed pods 调用 `/runtime/*` 路由

### 4.2 Security 风险面

| 风险面 | 现状 | 评估 |
| --- | --- | --- |
| **Prompt injection** | 来自 inbox / peer message / document content；模型用 `cumora reply` 输出时可能被影响 | server-side 没有内容审查；GLANCE_YIELD_RULES 部分缓解（不是技术拦截） |
| **Stored XSS via uploaded file** | `/uploads/*` 强制 `X-Content-Type-Options: nosniff`；非图像强制 `Content-Disposition: attachment` | ✅ 见 [server/src/index.ts:117-130](../../sources/cumora/server/src/index.ts#L117-L130) |
| **SPA shell HTML injection** | `dist/index.html` 用 `Cache-Control: no-cache, no-store, must-revalidate` | ✅ |
| **Email webhook HMAC** | `inbound-email.ts` 用 `req._body=true` 的 rawBody 验证 HMAC | ✅ |
| **OpenAI fetch 502 loop** | `materializeImage` 把外部 URL 转 base64 data URL（in-process HEAD probe + retry） | ✅ [image-fetcher.ts:479](../../sources/cumora/server/src/agents/image-fetcher.ts#L479) |
| **sub2api OAuth previous_response_id** | turn.ts **不**用 `previous_response_id`（sub2api OAuth 拒收），改用全 history 重发 | ✅ [turn.ts:2331-2334](../../sources/cumora/server/src/agents/turn.ts#L2331-L2334) |
| **CORS** | 仅 `CUMORA_CORS_ORIGINS` 设置时启用；`*` + disable credentials（auth 是 Bearer token 不是 cookie） | ✅ [server/src/index.ts:91-104](../../sources/cumora/server/src/index.ts#L91-L104) |
| **Attachment URL hijack** | trustedAttachmentSource 用 validated storage key 重新 mint URL；R2 reject redirects | ✅ [turn.ts:412-421](../../sources/cumora/server/src/agents/turn.ts#L412-L421) |
| **Quota leak** | quota exhausted → graceful skip + user-visible system notice（不抛、不卡 turn） | ✅ [turn.ts:3378-3411](../../sources/cumora/server/src/agents/turn.ts#L3378-L3411) |
| **Memory cross-project bleed** | memory-scope.ts 显式区分 global + project；cloud `loadMemory` 和 BYOA `memoryDigest` 共享 | ⚠️ 仍有 cross-pollution 风险（详细见 open-questions.md） |
| **Tool sandboxing** | bash 直接 spawn，**无** 进程级隔离 | ⚠️ **cumora-server 是 trust boundary**——BYOA + K8s pod 是边界 |
| **PII 风险（real email）** | cumora agent 拥有真实 email 账号（Resend 域名）；可对外发信 | ⚠️ 必须有 email-level approval（详见 cumora-docs/email.md） |
| **Computer takeover（BYOA）** | 用户 pair local CLI；BYOA server 看不到 provider keys | ✅ design tradeoff |

### 4.3 信任模型

```text
cumora-server = trust boundary（无沙箱）
├─ /api/* = humans (cookie auth)
├─ /runtime/* = per-pod JWT (cloud agents)
└─ /api/computer/* = BYOA daemon (per-computer JWT)
                 ↓
                 user's machine = BYOA trust boundary
                 ↓
                 local CLI (Claude Code / Codex / etc.) = agent brain
                 cumora CLI = world actions

Cloud K8s pods = 隔离单元（每个 agent 一个 pod）
  ├─ agent_workspace FUSE-mounted (Go FUSE driver)
  └─ bash spawn 在 pod 内（无 sandbox 但 pod boundary）
```

### 4.4 Security 防御层（详细 § 5）

| 防御层 | 实现 | 文档 |
| --- | --- | --- |
| Stored XSS | `X-Content-Type-Options: nosniff` + `Content-Disposition: attachment` | [server/src/index.ts:117-130](../../sources/cumora/server/src/index.ts#L117-L130) |
| Image fetch failure | HEAD probe + materialize base64 + strip-and-retry | [turn.ts:368-388](../../sources/cumora/server/src/agents/turn.ts#L368-L388) |
| CORS | 仅白名单 origin；`*` disable credentials | [server/src/index.ts:91-104](../../sources/cumora/server/src/index.ts#L91-L104) |
| Webhook HMAC | `req._body=true` rawBody 验证 | [server/src/api/inbound-email.ts](../../sources/cumora/server/src/api/inbound-email.ts) |
| Quota leak | graceful skip + user-visible notice | [turn.ts:3378-3411](../../sources/cumora/server/src/agents/turn.ts#L3378-L3411) |
| Per-pod isolation | K8s pod + FUSE-mounted workspace + per-pod JWT | [orchestrator.ts:1257](../../sources/cumora/server/src/agents/runtime/orchestrator.ts#L1257) + [jwt.ts:83](../../sources/cumora/server/src/agents/runtime/jwt.ts#L83) |
| Override flag abuse | Hold-token-gated + seq-bound + 2min TTL | [seen-boundary.ts:273](../../sources/cumora/server/src/agents/seen-boundary.ts) |
| Memory cross-pollution | memory-scope.ts contract（global + project） | [memory-scope.ts:299](../../sources/cumora/server/src/agents/memory-scope.ts#L299) |
| Burst / DDoS | `compression` for non-SSE; gzip ≥1kb | [server/src/index.ts:78-85](../../sources/cumora/server/src/index.ts#L78-L85) |
| Failure cascade | `unhandledRejection` / `uncaughtException` handler → notifyAlert（fire-and-forget） | [server/src/index.ts:394-402](../../sources/cumora/server/src/index.ts#L394-L402) |

## 5. AgentRuntimeClient 抽象（Phase 3 seam）

> 见 [agents/runtime/client.ts:389](../../sources/cumora/server/src/agents/runtime/client.ts#L389) + [inproc-client.ts:1101](../../sources/cumora/server/src/agents/runtime/inproc-client.ts#L1101) + [http-client.ts:485](../../sources/cumora/server/src/agents/runtime/http-client.ts#L485)

```ts
interface AgentRuntimeClient {
  loadInbox(agentId): Promise<InboxRow[]>
  loadContext(agentId, companyId, convoIds): Promise<ContextRow[]>
  loadMemory(agentId, query, limits, scope): Promise<MemoryRow[]>
  loadClimate(agentId): Promise<ClimateRow[]>
  loadSkillsIndex(agentId): Promise<SkillIndexEntry[]>
  loadFaces(companyId, participantIds): Promise<FaceRow[]>
  buildSystemPrompt(agentId): Promise<string | null>
  loadPersona(agentId): Promise<PersonaRow | null>

  // Mutation
  recordBusyHeartbeat(agentId, ttlSec): Promise<void>
  clearBusyHeartbeat(agentId): Promise<void>
  markThinking(agentId, convoIds, ttlSec): Promise<void>
  unmarkThinking(agentId, convoIds): Promise<void>
  peekWorklog(scopeKey): Promise<WorklogEntry[]>
  markConversationRead({ agentId, conversationId, upToMessageId }): Promise<void>
  setStatus(agentId, status): Promise<void>
  heartbeatStatus(agentId, status): Promise<void>
  publishTyping({ conversationId, agentId, done, companyId }): Promise<void>
  postSystemNotice({ conversationId, companyId, agentId, noticeKind, text, dedupeKey, dedupeTtlSec }): Promise<{posted: boolean}>
  getConversationCompanyId(conversationId): Promise<string | null>

  // Observability
  createRun(args): Promise<string>
  finishRun({ runId, status, summary, error, toolCallCount, tokenCount, model, usage }): Promise<void>
  recordEvent({ runId, agentId, companyId, kind, level, title, data, stage }): Promise<void>
}
```

### 设计目的

> turn.ts 只依赖 `runtime` 接口，不知道底层是 in-process 还是 HTTP/JSON。
> Phase 3：把 cloud agent 从 server 同进程移出到 K8s pod，只换 `runtime = new HttpRuntimeClient(podBaseUrl, jwt)`，turn.ts 一行不改。

### 与 RoboThree Agent Runtime 的对齐点

- **接口边界**：纯 abstract + 13 个 read + 12 个 mutation + 3 个 observability
- **Drain seam**：所有 IO 走 `runtime.*()`——turn.ts 自身 **不** import db/pool/redis
- **fail-open vs fail-closed** 取决于调用点（如 `markThinking` 失败仅装饰、`postSystemNotice` 失败仅记录 event）

## 6. Skills 系统（AgentSkills spec）

> 见 [agents/skills.ts:257](../../sources/cumora/server/src/agents/skills.ts#L257) + [agents/runtime/native-tools.ts:173](../../sources/cumora/server/src/agents/runtime/native-tools.ts#L173)

### 设计

- **存储**：`agent_workspace/skills/<name>/SKILL.md`（+ `scripts/`、`references/`、`assets/`）
- **Progressive disclosure**：wake prompt 只放 `name` + `description`（~100 tokens / skill）；模型 `cumora skills read <name>` 才拉完整 SKILL.md
- **Per-agent**：Iris 安装 skill ≠ Atlas 有
- **Spec 兼容**：https://agentskills.io/specification（frontmatter 解析 + name validation）

### Install 路径

- SkillHub search：`/search?q=<query>` → hit list
- SkillHub fetch：`/skills/<name>` → self-contained manifest（files: [{path, body}])
- 写 `agent_workspace` INSERT（per-file transaction-free）
- 拒绝 overwrite（同 name 已存在 → 报 "skill already installed"）

### 风险

- 无 manifest signature verification（任何 hub 都能被信任）——但走 operator-controlled `SKILLHUB_URL`，非任意来源
- path-traversal 校验（拒绝 absolute / `..` / 危险字符）
- file size cap（256KB / file）
- file count cap（100 files / skill）

## 7. Memory + Climate

### Memory（[memory-scope.ts:299](../../sources/cumora/server/src/agents/memory-scope.ts#L299) + [memory-write.ts:92](../../sources/cumora/server/src/agents/memory-write.ts#L92)）

- 表：`agent_workspace/memory/<scope>/<id>.md` + `MEMORY.md` index
- **Scope**：global + project-scoped（`memory/projects/<projectId>/`）
- **Write 契约**：cloud `loadMemory` + BYOA `memoryDigest` 共享 memory-scope.ts
- **Cross-group bleed 是 scoping bug 不是 wipe bug**——见 [COORDINATION.md § Cross-group bleed of work facts](../../sources/cumora/docs/COORDINATION.md)

### Climate（[turn.ts:228-233](../../sources/cumora/server/src/agents/turn.ts#L228-L233) + `agents/climate.ts`）

- Per-agent 对每个 participant 的 `affinity ∈ [-1, 1]` + `trust ∈ [-1, 1]`
- `last_note`: 文字描述最近的变化原因
- **写**：`cumora climate note <id> '<note>' --affinity n --trust n`
- **prompt 渲染**：bipolar `+0.42` / `-0.12` / `0.00`，对齐 inline
- 用途：让模型在 wake prompt 里看到自己 private 的人际关系

## 8. Observability / Cost

### llm_calls（[llm-ledger.ts:922](../../sources/cumora/server/src/agents/llm-ledger.ts#L922)）

- 每 LLM call 一行：
  - `purpose`: `agent-turn` | `compaction` | `completion-verify` | `steer-summary` | `triage`
  - `model`
  - `usage` (TokenUsage：prompt / completion / cached / reasoning)
  - `latencyMs`
  - `status`: `ok` | `rate_limited` | `timeout` | `failed`
  - `extras`: hop / retryKind / imageStripRetryUsed / itemsDropped / batchSize / hadDraft 等
  - `companyId`, `agentId`, `runId`
- 每个 hop 单独 row（cross-purpose breakdown for same turn）

### llm_calls_rollup（[llm-rollup.ts:152](../../sources/cumora/server/src/agents/llm-rollup.ts#L152)）

- 每小时预聚合（advisory-locked，多副本安全）
- admin Observability page 读 rollup（~30k hourly buckets, ~230ms）而非 llm_calls 全部（470k 行 × 6 scans × 5-25s）

### agent_runs / events（[observability.ts:691](../../sources/cumora/server/src/agents/observability.ts#L691)）

- agent_runs：每个 run 一行（status / summary / error / toolCallCount / tokenCount / model / usage）
- events：hop-by-hop 事件流（turn.started / context.loaded / model.request / model.response / tool.started / tool.finished / turn.steered / turn.compacted / turn.completed / ...）
- 用于：debug "why did the agent stop?" / 性能分析 / failure postmortem

## 9. Self-test（Level 2 § 12.2 10 项）

1. [x] Commit SHA 已固定（`d10283dc06e08996f844518b87da30baf5dcecc1`）
2. [x] License 初查完成（MIT，无需 license-review.md）
3. [x] 真实入口已确认（server entry + BYOA daemon + engine + pod agent）
4. [x] Agent 主循环已定位（turn.ts:1571-3547）
5. [x] 代表性端到端调用链已完成（见 runtime-sequence.md）
6. [x] 调用链有 Hop Evidence 表（见 runtime-sequence.md）
7. [x] Permission + Security 已检查（本节 § 4）
8. [x] 重要结论已标记 FACT / INFERENCE / RECOMMENDATION / UNKNOWN
9. [x] RoboFive 分类已完成（见 robothree-fit-analysis.md）
10. [x] Required 7 张产物已完成

## 10. Reference

- [`docs/COORDINATION.md`](../../sources/cumora/docs/COORDINATION.md) — 7 层防御 + Anti-patterns + 6/3 push narrative
- [`docs/BYOA.md`](../../sources/cumora/docs/BYOA.md) — Bring Your Own Agent
- [`docs/email.md`](../../sources/cumora/docs/email.md) — Real email（Resend + Cloudflare Email Routing）
- [`README.md`](../../sources/cumora/README.md) — 项目 README（仅用作入口识别）
