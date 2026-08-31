# Cumora — 项目研究索引

> **Agent Architecture Intelligence Base** · RoboThree 跨项目研究之一
>
> 本目录记录对 [`yetone/cumora`](https://github.com/yetone/cumora) 的源码级研究。Cumora 是跨平台 AI 团队聊天工具，让 AI Agent 与人类在同一个对话/DM/Kanban/日历 中作为一等公民共存。

## 项目元信息

| 项 | 值 |
| --- | --- |
| 项目名 | cumora |
| 仓库 | https://github.com/yetone/cumora |
| Commit SHA（固定） | `d10283dc06e08996f844518b87da30baf5dcecc1` |
| 日期 | 2026-08-30 |
| 研究深度 | **Level 2**（默认：7 张 Required 产物 + RoboFive 分类） |
| License | MIT（与 RoboThree 完全兼容） |
| 项目版本 | `0.9.1`（`package.json`） |
| 推荐方向 | **ADAPT**（见 `robothree-fit-analysis.md`） |

## 必读文档

| 文档 | 作用 |
| --- | --- |
| [project-overview.md](./project-overview.md) | 项目定位、技术栈、License 初查、关键术语 |
| [source-map.md](./source-map.md) | 顶层目录地图 + 真实入口（Server / Daemon / Engine / Cloud Pod） |
| [architecture.md](./architecture.md) | 架构总览（含 Permission / Security 主报告段落） |
| [runtime-sequence.md](./runtime-sequence.md) | 一次完整 turn 的真实调用链 + Mermaid + Hop Evidence |
| [robothree-fit-analysis.md](./robothree-fit-analysis.md) | ADOPT / ADAPT / DEFER / REJECT / NEEDS_MORE_EVIDENCE |
| [open-questions.md](./open-questions.md) | 未解决项 + How to Close |

## 核心结论速览

> 一句话：Cumora 是"以 chat 为核心的多 Agent 协作平台"，把 Agent Loop、Coordination、Memory、Skill、FUSE-mounted Workspace 拆成清晰的层，对 RoboThree 的多 Agent / 协作 / 安全边界有直接借鉴价值。

- **Mailbox 模型**取代 server-side classifier/cascade：每条消息触发被 wake 的 agent 自己决定 reply / react / dm / ack（`server/src/index.ts:257` `startScheduler()` + `agents/scheduler.ts:948` + `agents/turn.ts:3547`）。
- **7 层防御（COOR § 5）**：per-agent model pin → BigBrain semaphore → AdaptivePacer → wake debounce → per-agent RL cooldown → server freshness preflight → atomic verbatim-dup。每一层都对应一个真实事故（详见 `docs/COORDINATION.md`）。
- **GLANCE_YIELD_RULES** 是"5 条 shape-level 提示" + **服务端串行化** 双层防护；server-side 的 `cumora reply` 用 Redis `seen` cursor + transaction 内 verbatim-dup + `--send-anyway` hold-token 三件套把 race 关掉。
- **AgentRuntimeClient 抽象**（inproc / http）让"Cloud Pod" 与 "BYOA Daemon" 在 Phase 3 互换：turn.ts 只依赖 `runtime` 接口，不知道底层是 in-process 函数还是 HTTP/JSON。
- **Per-turn FS Namespace**（`runtime/fs-namespace.ts`）：agent 每次 turn 拿到一份 `agent_workspace` 的镜像副本到 `/tmp/cumora-fs/<runId>/`，turn 结束 commit diff 回去；避免并发 turn 互相覆盖。
- **Mid-turn Steering**：agent busy 时新消息 → 注入到下一次 hop 的 input，**draft assistant text 一起带过去**（"you were about to send X, then this arrived"），避免模型重导。
- **Tool 系统 = bash + set_turn_status**：所有"世界动作"都是 `bash("cumora <subcmd>")`，`set_turn_status` 是唯一的 protocol 工具（5 种 status + assistant_text relay）。
- **Skills（AgentSkills spec 兼容）**：per-agent 安装在 `agent_workspace/skills/<name>/SKILL.md`，progressive disclosure（只把 name+description 放进 wake prompt）。

## 关键机制清单

| 机制 | 来源 | RoboThree 适配 |
| --- | --- | --- |
| Mailbox wake（多 Agent 触发模式） | `agents/scheduler.ts:948`, `agents/turn.ts:3547` | ADAPT |
| BigBrain semaphore + AdaptivePacer | `agents/computer/daemon.ts:3483` | ADOPT |
| Server-side freshness preflight + atomic dup | `agents/cli.ts`, `agents/seen-boundary.ts:273` | ADOPT |
| GLANCE_YIELD_RULES 5 条 shape-level | `agents/glance-protocol.ts:20` | ADOPT（换 RoboThree 自己的措辞） |
| Small-brain triage gate + deterministic fallback | `agents/triage-core.ts:497`, `agents/inbox-triage.ts:188` | ADOPT |
| AgentRuntimeClient abstraction | `agents/runtime/client.ts:389`, `inproc-client.ts:1101`, `http-client.ts:485` | ADOPT |
| Per-turn FS Namespace (hydrate/commit/teardown) | `agents/runtime/fs-namespace.ts:114`, `fs-endpoints.ts:203` | ADAPT |
| LLM-summarized auto-compaction | `agents/turn-compaction.ts:376`, `agents/turn.ts:2459` | ADOPT |
| Mid-turn steering w/ draft carry-through | `agents/steer.ts:454`, `agents/turn.ts:2353` | ADAPT |
| set_turn_status 协议（5 status + relay） | `agents/tools-shared.ts:47`, `agents/tools.ts:294` | ADOPT |
| Skills（AgentSkills spec） | `agents/skills.ts:257`, `agents/runtime/native-tools.ts:173` | DEFER（已有 claude-code-best 参照） |
| Memory（pgvector + project-scope） | `agents/memory-scope.ts:299`, `agents/embeddings.ts` | ADAPT |
| Climate（affinity/trust） | `agents/turn.ts:228-233` | NEEDS_MORE_EVIDENCE（语义未明） |
| Kanban + Polls + Calendar + Docs | `agents/board-columns.ts`, `polls.ts`, `calendar.ts`, `documents/` | DEFER（场景特定） |
| Real email（Resend + Cloudflare Email Worker） | `email.ts`, `workers/email-gate/` | REJECT（产品范围外） |
| BYOA computer daemon（persistent CLI session） | `agents/computer/daemon.ts:3483`, `engine.ts:4042`, `registry.ts:749` | ADAPT（与 RoboThree Agent Runtime 边界） |
| K8s per-agent pods + Go FUSE driver | `agents/runtime/orchestrator.ts:1257`, `agent-fuse/` | REJECT（场景特定） |
| Yjs collaborative documents | `documents/`, `src/lib/yjs*` | DEFER（场景特定） |

## 调研边界

- ✅ Stage A（仓库识别 + License + 顶层地图）
- ✅ Stage B（核心运行路径：Mailbox → turn.ts → LLM → bash → server-side preflight）
- ✅ Stage D（RoboThree 映射）
- ⏸ Stage C Conditional：Permission/Security 已写入 `architecture.md`（mailbox scheduler 的 `--send-anyway` 治理 + K8s pod 隔离 + FUSE 命名空间已覆盖），其余 Conditional（model-system / context-system / subagent-system 等）按 § 5.3 触发条件判断，仅在主报告无法承载时拆出。

## 引用约定

- 仓库：cumora@`d10283d`
- 行号对固定 Commit SHA 有效（行号可能因后续提交偏移）
- 源码引用使用仓库相对路径 + 行号（如 `server/src/agents/turn.ts:3547` 表示文件末尾附近）
