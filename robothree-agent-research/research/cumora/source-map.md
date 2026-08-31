# Cumora — 源码地图

> 提交固定：`d10283dc06e08996f844518b87da30baf5dcecc1`
> 重点：**真实入口**（不依赖 README）；用一句话标注每个文件的角色

## 顶层目录地图

```
cumora/                            Root monorepo
├── src/                           React renderer (desktop/mobile/web/admin 共用)
├── server/                        Node.js API + Agent runtime
├── agent-cli/                     `cumora` npm package (BYOA daemon)
├── agent-fuse/                    Go FUSE driver (mount agent_workspace into cloud pod)
├── workers/                       Cloudflare Workers (email-gate, r2-gate)
├── electron/                      Electron 壳
├── ios/                           iOS Capacitor 壳
├── android/                       Android Capacitor 壳
├── benchmarks/                    Real-LLM multi-agent coordination benchmarks
├── docs/                          7 篇深度文档（COORDINATION.md 重要）
├── build/                         Icon + entitlements
├── scripts/                       guard-big-brain / guard-llm-tracked / etc.
├── website/                       cumora.ai marketing site (Cloudflare Pages)
└── package.json                   Root workspace
```

## 真实入口（从 package.json / 构建配置）

| 入口 | 文件 | 来源 |
| --- | --- | --- |
| **Server entry** | `server/src/index.ts` | `package.json:scripts.server:dev` = `tsx watch server/src/index.ts` |
| **CLI / Desktop entry** | `electron/main.cjs` | `package.json:main` = `electron/main.cjs` |
| **BYOA daemon** | `agent-cli/src/cli.ts` | `package.json:bin.cumora` = `./bin/cumora`（exec → `agent-cli`） |
| **Capacitor config** | `capacitor.config.ts` | iOS/Android 壳 |
| **Web SPA entry** | `index.html` | Vite root |
| **Worker: email-gate** | `workers/email-gate/` | Cloudflare Pages deploy |
| **Worker: r2-gate** | `workers/r2-gate/` | Cloudflare Pages deploy |

## 服务端核心（`server/src/`）

### 启动与全局

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `server/src/index.ts` | 408 | Server entry；boot 序列（schema → seed → start scheduler / scanner / idle / pod GC / cluster monitor / email retry / db GC / shipping maintenance） |
| `server/src/env.ts` | - | env 校验（zod-like） |
| `server/src/seed.ts` | - | 空 DB seed 6 agents + 3 humans + 9 conversations |
| `server/src/redis.ts` | - | Redis 单例（ioredis） |
| `server/src/db/pool.ts`, `db/schema.ts`, `db/migrate.ts` | - | Postgres + Drizzle |
| `server/src/llm.ts` | 186 | LLM client 工厂（per-tenant OpenAI / sub2api） |
| `server/src/concurrency.ts` | - | 并发原语 |
| `server/src/metrics.ts`, `alerting.ts`, `alert.ts` | - | Observability |
| `server/src/status.ts` | - | BUSY_STATUS_HEARTBEAT_MS 常量 |
| `server/src/storage.ts`, `storage-keys.ts` | - | Local / R2 适配 |

### HTTP / WS

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `server/src/api/router.ts` | - | `/api/*` 全部路由 |
| `server/src/api/admin-router.ts` | - | `/api/admin/*` |
| `server/src/api/shipping-router.ts` | - | Shipping features API |
| `server/src/api/inbound-email.ts` | - | Cloudflare Email Worker → cumora webhook |
| `server/src/ws.ts` | - | WebSocket 路由（presence / typing / documents） |
| `server/src/auth.ts`, `oauth.ts`, `apple.ts`, `auth-errors.ts` | - | 鉴权 |

### Agent Runtime 核心（`server/src/agents/`）

#### Agent Loop & Tool

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| **`server/src/agents/turn.ts`** | **3,547** | **⭐⭐⭐ runAgentTurn 主体**：mailbox → triage → context → LLM hop loop → bash → compaction → 完成判定 |
| `server/src/agents/tools.ts` | 294 | Tool 执行（server-side 增强版，加 tool_calls 日志 + DB-touching tDm/tPullGroup/tReact/tPalette） |
| `server/src/agents/tools-shared.ts` | 595 | Tool 定义（TOOL_DEFS_RESPONSES：`bash` + `set_turn_status` + NATIVE_TOOL_DEFS）+ tBash + tSetTurnStatus |
| `server/src/agents/turn-stream.ts` | 228 | OpenAI Responses 流状态机 |
| `server/src/agents/turn-compaction.ts` | 376 | LLM-summarized auto-compaction（compactHistoryWithSummary + estimateTokens） |
| `server/src/agents/turn-wake.ts` | 83 | classifyWake + renderBriefedManualWakeContext |

#### Coordination & Mailbox

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `server/src/agents/scheduler.ts` | 948 | **Mailbox scheduler**：CH_MESSAGE_NEW → 每个 agent member 发 wake（per-agent serial, coalesce burst） |
| `server/src/agents/seen-boundary.ts` | 273 | Redis seen-cursor（`cumora:seen:<agentId>:<convoId>`）+ hold token（seq-bound） |
| `server/src/agents/cli.ts` | - | `cumora reply` / `cumora glance` 等子命令的服务端实现（含 freshness preflight + atomic verbatim-dup） |
| `server/src/agents/glance-protocol.ts` | 20 | **GLANCE_YIELD_RULES** 常量（5 条 shape-level），cloud ↔ BYOA 共享 |
| `server/src/agents/inbox-triage.ts` | 188 | Cloud 端 triage（classifyInboxTriage + gateSyntheticWake） |
| `server/src/agents/triage-core.ts` | 497 | Triage 核心（pure dependency-free）：buildTriageRequest + parseTriage + finalizeTriage + loop-cap 守护 |
| `server/src/agents/membership.ts` | 154 | Conversation membership（lastHumanIdx 计算） |
| `server/src/agents/agenda.ts` | - | Stalled conversation pipeline + 分类 + claim |
| `server/src/agents/private_chat.ts` | 140 | DM 私聊路由 |
| `server/src/agents/thinking-convos.ts` | 17 | typing 状态 |

#### Mid-turn Steering & Compact

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `server/src/agents/steer.ts` | 454 | 中途 steer drain（canDrainSteer / drainSteer / registerActiveToolBatch / recordSteerBytes / SUMMARIZE_THRESHOLD） |
| `server/src/agents/auto-relay.ts` | 48 | Assistant text → reply auto-relay |

#### Memory & Persona & Climate

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `server/src/agents/personas.ts` | 349 | Persona 加载 + buildSystemPrompt |
| `server/src/agents/memory-scope.ts` | 299 | Memory 写入/过滤契约（global + project scope），cloud ↔ BYOA 共享 |
| `server/src/agents/memory-write.ts` | 92 | Memory INSERT |
| `server/src/agents/embeddings.ts` | - | pgvector embeddings（OpenAI text-embedding-3） |
| `server/src/agents/climate.ts` | - | affinity/trust 数值 |
| `server/src/agents/agent-voice.ts` | - | Agent 声音/personality（已退役，但代码还在） |

#### Skills

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `server/src/agents/skills.ts` | 257 | **AgentSkills spec 实现**：parseSkillMd / validateSkillName / searchSkillHub / fetchSkillManifest / installSkillFromManifest / loadSkillsIndex |
| `server/src/agents/tools-shared.ts:NATIVE_TOOL_DEFS` | - | native-tools 来源 |

#### Scan / Idle / Scheduler 后台

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `server/src/agents/scanner.ts` | 209 | Generic background scan（per-agent `background.scan` capability） |
| `server/src/agents/scanner_helper.ts` | 149 | Scanner 工具 |
| `server/src/agents/idle.ts` | - | Idle scheduler（agents 自发 init） |
| `server/src/agents/kanban-wake.ts` | 108 | Kanban @-mention wakes |

#### Model Policy & Cost

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `server/src/agents/model-policy.ts` | 68 | enforceModelPolicy + realTaskModel + supportModel（big brain / small brain / compaction / verifier 分级） |
| `server/src/agents/llm-ledger.ts` | 922 | **recordLlmCall**：每个 hop 一行 llm_calls 行（purpose: agent-turn / compaction / completion-verify / steer-summary） |
| `server/src/agents/cost.ts` | - | TokenUsage + addUsage + EMPTY_USAGE + usageFromOpenAI |
| `server/src/agents/llm-rollup.ts` | 152 | llm_calls_rollup 预聚合（advisory-locked） |
| `server/src/agents/observability.ts` | 691 | agent_runs / events 表写入 + AgentRunStatus |

#### 辅助 / Text / 安全

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `server/src/agents/turn-wake.ts` | 83 | Wake 分类 |
| `server/src/agents/routing.ts` | 126 | Routing（@all / @mention 路由） |
| `server/src/agents/text-safety.ts` | 17 | Text 安全 |
| `server/src/agents/image-fetcher.ts` | 479 | materializeImage（HEAD probe + base64 data URL，避开 OpenAI 拒收 502） |
| `server/src/agents/skype-emoticons.ts` | 24 | Skype 表情 |
| `server/src/agents/board-columns.ts` | - | Kanban columns |
| `server/src/agents/cli-identity.ts`, `cli-parse.ts`, `cli-result.ts` | - | CLI 子命令辅助 |

### Per-pod Runtime（`server/src/agents/runtime/`）

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| **`server/src/agents/runtime/client.ts`** | **389** | **⭐⭐ AgentRuntimeClient 接口**（pure abstract）：loadInbox / loadContext / loadMemory / loadClimate / loadSkillsIndex / buildSystemPrompt / recordBusyHeartbeat / markThinking / publishTyping / recordEvent / createRun / finishRun / postSystemNotice / getConversationCompanyId / loadFaces / markConversationRead / heartbeatStatus / setStatus / unmarkThinking / clearBusyHeartbeat / peekWorklog |
| **`server/src/agents/runtime/inproc-client.ts`** | **1,101** | **⭐⭐ In-process 实现**：turn.ts 直接调用 inproc 函数（无 HTTP），Phase 3 切 http 客户端不改 turn.ts |
| `server/src/agents/runtime/http-client.ts` | 485 | HTTP 实现（pod ↔ server，per-pod JWT 鉴权） |
| `server/src/agents/runtime/server.ts` | 686 | `/runtime/*` 路由（pod JWT 鉴权 + /thinking/mark/unmark + /agenda） |
| `server/src/agents/runtime/orchestrator.ts` | **1,257** | K8s pod lifecycle（ensurePod / startClusterFuseMonitor / startCompletedPodGc / startChromeProfilePvcGc） |
| `server/src/agents/runtime/pod-agent.ts` | 331 | Cloud pod 的 runAgentTurn 入口（通过 server.ts 调） |
| `server/src/agents/runtime/pod-tools.ts` | 104 | Pod 端 tool 执行（薄封装 + set_turn_status） |
| `server/src/agents/runtime/native-tools.ts` | 173 | set_turn_status 实现（独立 tool 定义，不进 bash） |
| `server/src/agents/runtime/fs-namespace.ts` | 114 | **Per-turn FS namespace**：hydrate / commit / teardown |
| `server/src/agents/runtime/fs-endpoints.ts` | 203 | `/runtime/fs/*` 路由（HTTP-based FS access for pod） |
| `server/src/agents/runtime/jwt.ts` | 83 | Per-pod JWT（/runtime/*） |
| `server/src/agents/runtime/wake-bus.ts` | 285 | SSE wake bus（per-pod wake delivery） |
| `server/src/agents/runtime/wake-options.ts` | 200 | Wake options 解析 |
| `server/src/agents/runtime/probe.ts`, `probe-wake.ts` | - | Probe |
| `server/src/agents/runtime/select.ts` | 31 | runtime = inproc-client（Phase 3 切 http） |
| `server/src/agents/runtime/byoa-source.ts` | 21 | BYOA 源 |
| `server/src/agents/runtime/cli-argv.ts` | 43 | CLI argv 解析 |
| `server/src/agents/runtime/sse-parse.ts` | 66 | SSE 解析 |
| `server/src/agents/runtime/pod-agent-exit.ts` | 40 | Pod 退出 |

### BYOA Computer Daemon（`server/src/agents/computer/`）

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| **`server/src/agents/computer/daemon.ts`** | **3,483** | **⭐⭐ BYOA daemon**：standingPrompt / chatDelta / agendaDelta / runTurn / BigBrainSemaphore / AdaptivePacer / WakeDebounce |
| **`server/src/agents/computer/engine.ts`** | **4,042** | **⭐⭐ BYOA engine**：持久化 CLI session（Claude Code / Codex / OpenCode / pi）的 SDK 适配 |
| `server/src/agents/computer/registry.ts` | 749 | `listAgentsForComputer`（per-engine `CUMORA_DEFAULT_*_MODEL` fallback）+ sweepOfflineComputers |
| `server/src/agents/computer/cli-version.ts` | 262 | CLI 版本检查 |

### Background Workers（其他 `server/src/`）

| 文件 | 角色 |
| --- | --- |
| `server/src/calendar.ts` | Calendar dispatcher（每分钟 scan 过期事件 → post 进 conversation → wake agent） |
| `server/src/polls.ts` | Polls（投票）+ startPollExpirationSweeper |
| `server/src/email.ts` | Outbound email（Resend） |
| `server/src/email-retry.ts` | Email retry loop（SKIP LOCKED） |
| `server/src/email-gc.ts` | Email-attachment GC |
| `server/src/invitation-email.ts` | 邀请邮件 |
| `server/src/documents/rooms.ts` | Yjs CRDT rooms |
| `server/src/local-attachment-files.ts` | 本地附件 |
| `server/src/db-gc.ts` | DB GC |
| `server/src/onboardCompany.ts` | 公司 onboarding |
| `server/src/admin.ts`, `seedAdmins` | Admin 提升 |
| `server/src/e2e-approve-waitlist.ts` | Waitlist 审批 |
| `server/src/shipping-maintenance.ts` | Shipping features 维护 |
| `server/src/personal-workspace.ts` | 个人 workspace |
| `server/src/og.ts` | Open Graph |
| `server/src/novita.ts` | Novita provider |
| `server/src/fcm.ts` | FCM（Android push） |
| `server/src/push.ts` | APNs / FCM |
| `server/src/storage-keys.ts` | 存储 key helpers |
| `server/src/cli-bin.ts`, `migrate-bin.ts` | CLI binaries |

## 前端核心（`src/`）

```
src/
├── api/                          # API 客户端
├── components/                   # 共享组件
├── data/                         # 数据 hooks
├── desktop/, mobile/, web/, admin/  # 各端 shell
├── lib/                          # 工具
├── locales/                      # i18n
├── stores/                       # Zustand stores
└── styles/                       # Tailwind
```

## BYOA Agent CLI（`agent-cli/`）

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| **`agent-cli/src/cli.ts`** | - | `cumora` CLI 命令（`cumora reply` / `cumora glance` / `cumora inbox` / `cumora memory note` / `cumora skills create` 等） |

> **关键**：cumora daemon（`agents/computer/daemon.ts`）和 cumora CLI（`agent-cli/src/cli.ts`）是两套不同的代码：daemon 跑在 cumora server 进程里（代表多个用户的 agent 跑在 server 上），CLI 是用户本地跑的、cumora 二进制（agent 的 world actions 走它）。

## Cloudflare Workers（`workers/`）

| 目录 | 角色 |
| --- | --- |
| `workers/email-gate/` | 收 Cloudflare Email Routing 的 webhook → POST 到 `/webhooks/email` |
| `workers/r2-gate/` | R2 签名 CDN 入口 |

## 关键测试

| 路径 | 覆盖 |
| --- | --- |
| `server/src/__tests__/**/*.test.ts` | unit（node:test） |
| `workers/**/*.test.ts` | Worker tests |
| `server/src/__integration__/` | 集成测试（需本地 Postgres + Redis） |
| `server/run-integration-tests.mjs` | 集成 runner |
| `scripts/guard-big-brain.mjs` | CI 守卫：big brain 仅 agent-turn 用 |
| `scripts/guard-llm-tracked.mjs` | CI 守卫：每个 LLM call 必须 recordLlmCall |

## 重点关注入口（避免 README-only）

1. **Server bootstrap**：[`server/src/index.ts:38-407`](../../sources/cumora/server/src/index.ts#L38-L407)
2. **Agent Turn 主循环**：[`server/src/agents/turn.ts:1571-3547`](../../sources/cumora/server/src/agents/turn.ts#L1571-L3547)（runAgentTurn 函数）
3. **Tool Definitions**：[`server/src/agents/tools-shared.ts:77-313`](../../sources/cumora/server/src/agents/tools-shared.ts#L77-L313)（bash + set_turn_status + NATIVE_TOOL_DEFS）
4. **GLANCE_YIELD_RULES**：[`server/src/agents/glance-protocol.ts:20`](../../sources/cumora/server/src/agents/glance-protocol.ts#L20)（5 条 shape-level）
5. **Mailbox scheduler 触发**：[`server/src/index.ts:253-257`](../../sources/cumora/server/src/index.ts#L253-L257) + [`server/src/agents/scheduler.ts`](../../sources/cumora/server/src/agents/scheduler.ts)
6. **Triage core（pure）**：[`server/src/agents/triage-core.ts:176-195`](../../sources/cumora/server/src/agents/triage-core.ts#L176-L195)（buildTriageInstructions）
7. **Compaction**：[`server/src/agents/turn-compaction.ts`](../../sources/cumora/server/src/agents/turn-compaction.ts) + [`turn.ts:2459-2503`](../../sources/cumora/server/src/agents/turn.ts#L2459-L2503)
8. **Steer**：[`server/src/agents/steer.ts`](../../sources/cumora/server/src/agents/steer.ts) + [`turn.ts:2353-2423`](../../sources/cumora/server/src/agents/turn.ts#L2353-L2423)
9. **FS Namespace**：[`server/src/agents/runtime/fs-namespace.ts`](../../sources/cumora/server/src/agents/runtime/fs-namespace.ts) + [`turn.ts:1933` + `:3427-3457`](../../sources/cumora/server/src/agents/turn.ts#L3427-L3457)
10. **Skills spec**：[`server/src/agents/skills.ts`](../../sources/cumora/server/src/agents/skills.ts)
11. **Coordination 防御层（7 层）**：[`docs/COORDINATION.md`](../../sources/cumora/docs/COORDINATION.md) § 5
12. **BYOA daemon（核心机制）**：[`server/src/agents/computer/daemon.ts`](../../sources/cumora/server/src/agents/computer/daemon.ts) + `engine.ts` + `registry.ts`

## 范围说明

- **未深入**：`src/`（前端）/ `documents/`（Yjs CRDT）/ `electron/`（壳）/ `ios/`, `android/`（壳）/ `benchmarks/`（实验性）/ `website/`（营销页）
- **重点**：server-side Agent runtime（turn / scheduler / coordination / tools / runtime / computer）
- **优先级**：本文档聚焦 RoboThree 直接相关的层；前端、壳、Workers 不展开
