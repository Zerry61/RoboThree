# OpenClaw — Research Index

> 研究深度：**Level 3** — L2 核心架构 + 3 个 L3 专项深挖（Channel Runtime / Pairing Security / Background Tasks）
> 研究时间：2026-07-18（L2）→ 2026-07-18（L3）
> 固定 Commit：`deccdb5e57af6800d4f020ea2034166592a149ba`
> 仓库地址：https://github.com/openclaw/openclaw

## 研究状态

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| Stage A：项目识别 | ✅ 完成 | index / project-overview / source-map |
| Stage B：核心运行路径 | ✅ 完成 | architecture / runtime-sequence |
| Stage C（L2）：按需深入 | ✅ 触发 | 见下方 Conditional 文件表 |
| Stage D（L2）：RoboThree 映射 | ✅ 完成 | robothree-fit-analysis / open-questions |
| **L3 Phase A：Channel Runtime 深挖** | ✅ 完成 | [channel-runtime-l3.md](./channel-runtime-l3.md) |
| **L3 Phase B：Pairing Security 深挖** | ✅ 完成 | [pairing-security-l3.md](./pairing-security-l3.md) |
| **L3 Phase C：Background Tasks 深挖** | ✅ 完成 | [background-tasks-l3.md](./background-tasks-l3.md) |
| **L3 验收 final-review** | ✅ 完成 | [final-review.md](./final-review.md) |

## 产物清单

### Required（7 张）

| 文件 | 状态 |
| --- | --- |
| [index.md](./index.md) | ✅ |
| [project-overview.md](./project-overview.md) | ✅ |
| [source-map.md](./source-map.md) | ✅ |
| [architecture.md](./architecture.md) | ✅ |
| [runtime-sequence.md](./runtime-sequence.md) | ✅ |
| [robothree-fit-analysis.md](./robothree-fit-analysis.md) | ✅ |
| [open-questions.md](./open-questions.md) | ✅ |

### Conditional（命中 § 5.3 触发条件）

| 文件 | 触发条件 | 状态 |
| --- | --- | --- |
| [deployment-model.md](./deployment-model.md) | 本地与云端协作（Gateway + Remote Worker） | ✅ |
| [skill-plugin-mcp.md](./skill-plugin-mcp.md) | Skill / Plugin / Hook / MCP | ✅ |
| [session-state-memory.md](./session-state-memory.md) | 长期 Memory + Session | ✅ |
| [tool-system.md](./tool-system.md) | Tool Runtime 复杂 | ✅ |
| [subagent-system.md](./subagent-system.md) | 真实 Multi-Agent | ✅ |
| [permission-system.md](./permission-system.md) | Exec / File / Network | ✅ |

### L3 Conditional（升级为 Required）

| 文件 | 深挖维度 | 状态 |
| --- | --- | --- |
| [channel-runtime-l3.md](./channel-runtime-l3.md) | Channel Adapter 真实运行时（四阶段协议） | ✅ |
| [pairing-security-l3.md](./pairing-security-l3.md) | Pairing Challenge + Device Bootstrap + Profile | ✅ |
| [background-tasks-l3.md](./background-tasks-l3.md) | Cron 重启恢复 + Reservation + Quarantine | ✅ |
| [final-review.md](./final-review.md) | L3 验收（30 项自检） | ✅ |

## 核心发现摘要

1. **Gateway Daemon 是最核心的架构创新**：本地常驻进程作为所有 Channel 的 Hub，WebSocket + HTTP 双协议，port 18789。
2. **Channel Plugin 架构完整**：20+ 消息渠道通过统一 `ChannelPlugin` 接口接入，每种渠道独立 extension 包，Core 完全不感知具体渠道逻辑。
3. **Plugin 生态丰富**：161 extension 目录，121+ 包，覆盖 Channel / Provider / Tool / Memory 等全部能力。
4. **Session Routing 基于 SessionKey 体系**：`channel:account:conversation` 三段式 SessionKey 实现持久路由。
5. **多设备 Node 架构**：Android/iOS/macOS/Linux 作为 Node 连接 Gateway，支持远程执行（`node-host/`），Pairing 机制通过挑战-应答完成。
6. **Background Tasks 基于 Cron + SQLite**：完整的 cron job 系统，支持声明式调度、Heartbeat 监控、isolated agent 执行。
7. **Skill 系统通过文件系统驱动**：`skills/` 目录下 54 个 Skill，BOOT.md 机制，workspace 级技能。

## 执行原则（从 CLAUDE.md）

- 所有结论必须有源码证据（文件路径 + Symbol + 行号）
- 三级标记 [F] / [I] / [R]
- 拒绝 README-only
- License 初查已完成：MIT
