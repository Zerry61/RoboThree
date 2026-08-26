# OpenClaw — Open Questions

> 未解决问题及 How to Close 建议。
>
> 研究 Commit: `deccdb5e57af6800d4f020ea2034166592a149ba`

## 1. 架构层面

| # | 问题 | 状态 | How to Close | 优先级 |
| --- | --- | --- | --- | --- |
| Q1 | **Embedded Agent Runner 的并发模型是什么？** 多个 Agent 同时运行时的队列、锁和资源管理策略？ | UNKNOWN | 深入分析 `src/agents/embedded-agent-runner/` 的并发控制代码，追踪 `ACTIVE_EMBEDDED_RUNS` Map 的使用 | P1 |
| Q2 | **大规模 Plugin 加载的性能开销是多少？** 100+ Plugin 场景下冷启动耗时？ | UNKNOWN | 在测试环境中安装 50+ Plugin 并记录 `startGatewayServer()` 各阶段的耗时 | P2 |
| Q3 | **WebSocket 连接断线后的恢复机制？** 断线期间的消息如何缓存和重放？ | UNKNOWN | 分析 `src/worker/worker-connection.ts` 的重连逻辑和 `src/infra/restart-handoff.ts` 的状态恢复 | P1 |
| Q4 | **Node Host 的安全边界是什么？** 远程设备可以执行哪些命令？权限如何限制？ | PARTIAL | 已分析 `src/node-host/invoke-types.ts` 和 `src/node-host/exec-policy.ts`，但需要更深入分析实际执行时的安全拦截点 | P1 |
| Q5 | **Session 数据规模如何？** 长期使用后 SQLite DB 的大小和查询性能？ | UNKNOWN | 需要长期运行测试或分析生产环境数据 | P2 |

## 2. 实现层面

| # | 问题 | 状态 | How to Close | 优先级 |
| --- | --- | --- | --- | --- |
| Q6 | **Channel 健康监控的具体实现？** Channel 不可用时的降级策略？ | PARTIAL | 已定位 `src/cron/heartbeat-policy.ts` 和 `src/gateway/channel-health-monitor.ts`，但未追踪完整的降级路径 | P2 |
| Q7 | **Tool Call Repair 的有效性？** 什么类型的 LLM 错误可以被修复？修复成功率？ | UNKNOWN | 阅读 `packages/tool-call-repair/` 源码并分析单元测试覆盖的错误类型 | P3 |
| Q8 | **Config Hot Reload 的实现细节？** 哪些配置变更可以热加载？哪些需要重启？ | PARTIAL | 已定位 `src/config/io.ts` 和 `src/gateway/config-reload-plan.ts`，但未枚举完整的热加载配置项列表 | P2 |
| Q9 | **Provider 的 Fallback 路由逻辑？** 主模型不可用时的切换策略？ | UNKNOWN | 分析 `src/provider-runtime/` 和 `src/plugins/provider-hook-runtime.ts` | P1 |
| Q10 | **Memory 的语义搜索精度？** Embedding 模型在用户个人记忆场景的表现？ | UNKNOWN | 需要真实数据测试，超出纯源码分析范围 | P3 |

## 3. 兼容性 & 生态

| # | 问题 | 状态 | How to Close | 优先级 |
| --- | --- | --- | --- | --- |
| Q11 | **OpenClaw 的 Plugin API 稳定性承诺？** 是否有语义版本控制策略？ | UNKNOWN | 查阅 `docs/plugins/sdk-overview.md` 和 SDK 的 CHANGELOG | P2 |
| Q12 | **ClawHub 市场的 Plugin 审核机制？** 安全性审核的深度？ | UNKNOWN | 分析 `src/plugins/install-security-scan.ts` 和 `src/plugins/clawhub.ts` | P3 |
| Q13 | **OpenClaw 与 Claude Code / Codex 的协作模式？** 作为 Host 如何与已安装的 Coding Agent 互操作？ | PARTIAL | 已定位 `extensions/codex/` 和 `src/infra/restart.js` 中的 Codex 集成，但完整的交互协议未分析 | P2 |

## 4. RoboThree 映射

| # | 问题 | 状态 | How to Close | 优先级 |
| --- | --- | --- | --- | --- |
| Q14 | **RoboThree 是否需要支持 OpenClaw 的全部 20+ Channel？** | PENDING_DECISION | 需要用户定义 MVP 渠道范围 | P1 |
| Q15 | **RoboThree 的设备安全模型应该比 OpenClaw 更严格吗？** | PENDING_DECISION | 需要用户定义安全策略（default-deny vs default-allow） | P1 |
| Q16 | **RoboThree 的 Plugin 分发是否复用 npm 生态？** | PENDING_DECISION | 评估 npm 分发的安全性和用户体验影响 | P2 |
| Q17 | **是否在 RoboThree 中采纳 OpenClaw 的 ACP 协议？** | NEEDS_MORE_EVIDENCE | 评估 ACP vs 原生 WebSocket JSON-RPC 的优劣 | P2 |

## 5. 方法论

| # | 问题 | 状态 | How to Close | 优先级 |
| --- | --- | --- | --- | --- |
| Q18 | **静态源码分析的完整性？** 是否遗漏了关键运行时路径？ | **ACCEPTED（已 L3 深挖部分缓解）** | 已通过 L3 对 Channel Runtime / Pairing Security / Background Tasks 3 个机制深度梳理；剩余 16 个 Open Questions 仍待 L3 深挖或运行时验证 | P2 |
| Q19 | **OpenClaw 版本 `2026.7.2` 是否有破坏性变更？** | UNKNOWN | 跟踪 `CHANGELOG.md` 和 Git tag 历史 | P3 |

## 6. L3 深挖已发现的新增 NEEDS_MORE_EVIDENCE

下述问题在 L3 深挖过程中浮现，但未达完整结论。优先级 P2-P3。

| # | 问题 | 来源 | How to Close |
| --- | --- | --- | --- |
| L3-Q1 | **`TELEGRAM_SPOOLED_DRAIN_START_LIMIT = 100` 在高 QPS 下的吞吐瓶颈** | [channel-runtime-l3.md §7](./channel-runtime-l3.md#7-与-robothree-的相关性) | 高 QPS 压测 |
| L3-Q2 | **claim-token fence 失败时的死锁风险** | 同上 | 重试场景运行时验证 |
| L3-Q3 | **其他渠道（Slack/Discord）的 durable-before-ack 实现是否一致** | 同上 | 对 `extensions/slack/src/monitor.ts` 做平行深挖 |
| L3-Q4 | **`runOpenClawStateWriteTransaction` 多进程并发安全性** | [pairing-security-l3.md §7](./pairing-security-l3.md#7-工程含义) | 重读 `src/state/openclaw-state-db.ts` 的并发模型 |
| L3-Q5 | **`serializeChannelPairingState` 的 schema 迁移路径** | 同上 | 看 `state/migrations/` 代码 |
| L3-Q6 | **`releaseStartupCatchupReservationsAfterFailure` 的 idempotency 细节** | [background-tasks-l3.md §7](./background-tasks-l3.md#7-工程含义) | 继续深挖 [service/timer.ts](../../sources/openclaw/src/cron/service/timer.ts) |
| L3-Q7 | **`locked()` 实际使用 Kysely 锁还是 DB-level lock** | 同上 | 读 `src/cron/service/locked.ts` |
| L3-Q8 | **Job JSON schema 演进路径如何 backfill** | 同上 | 重读 store/migration 代码 |

## 图例

- **UNKNOWN**：当前证据不足以回答
- **PARTIAL**：已有部分证据但不足以完整回答
- **ACCEPTED**：已知限制，当前可接受
- **PENDING_DECISION**：需要用户决策
- **NEEDS_MORE_EVIDENCE**：需要更多证据（建议升级到 Level 3）
- **P1**：阻塞性或高优先级问题
- **P2**：重要但不阻塞
- **P3**：探索性 / 后续优化
