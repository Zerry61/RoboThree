# Cumora — 项目概述

> 提交固定：`d10283dc06e08996f844518b87da30baf5dcecc1`（2026-08-30）
> License：MIT
> 版本：`0.9.1`（`package.json`）

## 一句话定位

Cumora 是**"以 chat 为核心的跨平台 AI 团队协作工具"**——把 AI Agent 视为与人类同等的一等公民（同一 roster / 同一 DM / 同一 Kanban / 同一 Calendar / 同一 Documents），既支持 Cumora Cloud 托管（per-agent K8s pod），也支持 BYOA（Bring Your Own Agent）让用户的本地 Claude Code / Codex / Grok Build / Cursor Agent / OpenCode / pi CLI 作为 agent brain。

## License Snapshot

| 项 | 值 |
| --- | --- |
| 主 License | **MIT**（`LICENSE`，Copyright (c) 2026 yetone） |
| 第三方嵌入代码 | 无（除 `node_modules`） |
| 商用限制 | 无 |
| Copyleft 风险 | 无 |
| SaaS / 服务端分发限制 | 无 |

**结论**：与 RoboThree 完全兼容；可作为 ADAPT / DESIGN_ONLY 来源；不需升级为 `license-review.md`。

## 项目定位（"四视角"）

| 视角 | 描述 |
| --- | --- |
| **产品** | 跨平台（PWA + Electron + iOS + Android via Capacitor + Web）AI 团队聊天工具 |
| **运行时** | Stateless Node.js API + WebSocket + Postgres（source of truth）+ Redis（pub/sub + presence）；Cloud agents 跑在 per-agent K8s pods（orchestrated by server via `kubectl`）；BYOA agents 跑在用户的本地机器 |
| **Agent 模型** | OpenAI Responses API 多 hop tool-calling 循环（Cloud）+ 本地 CLI subprocess（BYOA） |
| **协作** | Mailbox-driven（不是 server-side classifier）+ 7 层防御（per-agent pin → semaphore → pacer → debounce → cooldown → preflight → atomic dup）+ 5 条 shape-level GLANCE_YIELD_RULES |

## 技术栈

### 前端

- **React 18 + Vite + TypeScript + Tailwind**（renderer `src/`，桌面/移动/Web/Admin 共用）
- **Yjs + Tiptap**（协同文档）
- **Zustand**（本地状态）
- **Framer Motion**（动画）
- **Capacitor 8.x**（iOS / Android 壳，`io.cumora.app`）
- **Electron 33 + electron-updater**（桌面端，自动更新走 `yetone/cumora-releases`）

### 后端

- **Node.js + Express 5 + ws**（`server/src/`）
- **Postgres**（pg pool + Drizzle ORM）+ **Redis**（ioredis，pub/sub + presence + seen-cursor + worklog）
- **OpenAI Responses API**（通过 sub2api gateway，可换不同 provider account）
- **Drizzle ORM** + 手写 `server/src/db/schema.ts`
- **node:test** + 集成测试 runner（`server/run-integration-tests.mjs`）

### 平台原生

- **Cloudflare Workers**：`workers/email-gate`（Cloudflare Email Routing → cumora inbound）+ `workers/r2-gate`（R2 signed CDN）
- **Go FUSE driver**（`agent-fuse/`）：把 agent workspace mount 进 cloud pod
- **K8s manifests**（`server/k8s/`）+ `kubectl` driven pod orchestration（`agents/runtime/orchestrator.ts`）

### BYOA 客户端

- **`cumora` npm package**（`agent-cli/src/cli.ts`）：发布给用户跑 `npx cumora agent computer` 的 daemon
- **持久化 CLI session**（Claude Code / Codex / OpenCode / pi 的本地 subprocess，不是 cold-spawn）

## 关键概念术语

| 术语 | 含义 |
| --- | --- |
| **Company** | 租户隔离边界（每个 team 一个 company_id） |
| **Conversation** | 一个 chat thread（direct / group）；包含 inbox / 待办 / 投票 / 日历事件 |
| **Participant** | `kind = 'human' \| 'agent'`，一等公民 |
| **Agent / Persona** | 一个 AI agent 拥有一个 persona（name / role / model / avatar） |
| **Wake** | Scheduler 推给某个 agent 的"你的 inbox 有新东西"事件 |
| **Run** | 一个 wake 触发的 turn；`agent_runs` 表里一行 |
| **Hop** | 一次 model hop + 一次 tool batch；`MAX_HOPS=200` |
| **Fingerprint** | inbox 内容的稳定 hash（按 message id 排序），用来 dedupe（同一 inbox 不重复 LLM） |
| **Tenant worklog** | `cumora:worklog:tenant:<company_id>` Redis ZSET，每个 agent 当前在干啥 |
| **Cerebellum** | 小模型（haiku / gpt-5.4-mini），在 big brain 之前做 triage gate |
| **Big brain** | 大模型（gpt-5 / opus / etc.），实际执行 turn |
| **Hold token** | Redis 上的 token（seq-bound），agent 收到 HELD 后才能用 `--send-anyway` |
| **Seen cursor** | Redis `cumora:seen:<agentId>:<convoId>`，单调 SET，10-min TTL |
| **BYOA** | Bring Your Own Agent；用户用本地 CLI 跑 agent brain |
| **Cloud pod** | Cumora 托管的 per-agent K8s pod（一个 pod = 一个 agent） |
| **GLANCE_YIELD_RULES** | 5 条 shape-level 提示，cloud ↔ BYOA 共享 |
| **Steer** | agent busy 时收到新消息 → 注入到下一次 hop 而非排队 |
| **Climate** | 每 agent 对每个 participant 的 affinity/trust 数值（[-1, 1]） |

## 数字指标

| 指标 | 值 |
| --- | --- |
| 后端 TS 源码（`server/src/`） | 约 34k 行 |
| Agent loop 模块（`agents/turn.ts`） | **3,547 行** |
| BYOA daemon（`agents/computer/daemon.ts`） | 3,483 行 |
| BYOA engine（`agents/computer/engine.ts`） | 4,042 行 |
| Pod orchestration（`agents/runtime/orchestrator.ts`） | 1,257 行 |
| `agents/runtime/inproc-client.ts` | 1,101 行 |
| 前端 React 源码（`src/`） | 大型 monorepo，未具体计数 |
| K8s manifests | `server/k8s/` |
| Cloudflare Workers | 2 个（`email-gate`、`r2-gate`） |
| 文档章节 | 7 篇（BYOA / COORDINATION / email / I18N / SHIPPING / RELEASE / MOBILE_IOS / PUSH_NOTIFICATIONS） |
| 测试 | unit + integration（Postgres/Redis 依赖） |

## 仓库形态

```
cumora/
├── src/                          # React renderer (desktop/mobile/web/admin 共用)
├── server/src/                   # Node + Express + ws
│   ├── index.ts                  # server entry
│   ├── llm.ts                    # LLM client（OpenAI / sub2api）
│   ├── env.ts                    # env 校验（zod-like）
│   ├── api/router.ts             # /api/* routes
│   ├── agents/                   # ⭐ Agent runtime 核心
│   │   ├── turn.ts               # ⭐⭐⭐ 3547 行 Agent Loop
│   │   ├── scheduler.ts          # ⭐⭐ Mailbox scheduler
│   │   ├── tools.ts, tools-shared.ts
│   │   ├── inbox-triage.ts, triage-core.ts
│   │   ├── turn-compaction.ts    # ⭐⭐ LLM-summarized compaction
│   │   ├── steer.ts              # ⭐⭐ Mid-turn steering
│   │   ├── runtime/              # per-pod Runtime Client + FUSE
│   │   │   ├── client.ts, inproc-client.ts, http-client.ts
│   │   │   ├── server.ts         # /runtime/* HTTP API
│   │   │   ├── orchestrator.ts   # K8s pod lifecycle
│   │   │   ├── pod-agent.ts      # cloud pod 的 runAgentTurn 入口
│   │   │   ├── fs-namespace.ts   # per-turn FS
│   │   │   ├── native-tools.ts   # set_turn_status
│   │   │   ├── jwt.ts            # /runtime/* JWT
│   │   │   └── wake-bus.ts
│   │   └── computer/             # BYOA computer registry + daemon
│   │       ├── daemon.ts (3483 行)
│   │       ├── engine.ts (4042 行)
│   │       └── registry.ts
│   ├── db/                       # Drizzle schema + pool
│   ├── documents/                # Yjs CRDT rooms
│   └── redis.ts
├── agent-cli/src/cli.ts          # `npx cumora agent computer` 的 daemon
├── agent-fuse/                   # Go FUSE driver
├── workers/email-gate, r2-gate/  # Cloudflare Workers
├── electron/                     # Electron 壳
├── ios/, android/                # Capacitor 壳
├── benchmarks/                   # 真实 LLM 多 Agent 协作 benchmark
├── docs/                         # 7 篇深度文档（COORDINATION.md 重要）
├── build/                        # icon + entitlements
├── scripts/                      # biome / guard-big-brain / 等
└── package.json
```

## "防 ad-hoc" 的安全策略

Cumora 在 `docs/COORDINATION.md` 中显式记录 "**Anti-patterns we learned the hard way**"——这是一份"反推 design rationale"的实操记录，包含 9 个反模式（cap-one-layer-without-other / accrete scenario examples / dump voice rules / dump CLI catalog / pile loop-prevention / write conversation_reads side-effect / fetch without timeout / scenario-specific prompts / soft gates erode）。RoboThree 引用时应**原样借鉴这种"反例 + commit ID" 文档**。

## Skill / Subagent / ADR 状态（针对 RoboThree 工程）

- **Skill**（`agent-architecture-research`）：✅ 已使用，遵循四级研究流程
- **Subagent**：`source-mapper` / `runtime-tracer` / `security-reviewer` / `architecture-comparator` / `robothree-architect` 默认关闭，未拆分（项目大小适中，单 agent 已能覆盖）
- **ADR**：未生成（RoboThree 改动需用户批准；Stage D 的 5 分类结论见 `robothree-fit-analysis.md`）
