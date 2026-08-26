# OpenClaw → RoboThree Fit Analysis

> 对研究识别的关键机制给出 ADOPT / ADAPT / DEFER / REJECT / NEEDS_MORE_EVIDENCE 五分类结论。
>
> Commit: `deccdb5e57af6800d4f020ea2034166592a149ba`
> 分析日期: 2026-07-18（L2）→ 2026-07-18（L3 增量验收）
> L3 验证状态：**3 个 L3 专项深挖已对关键 ADAPT 决策进行代码级验证**

## 1. 综合评估

OpenClaw 是与 RoboThree **最相关**的开源项目之一。它的架构直接回答了 RoboThree 的几个核心问题：

1. **如何在本地运行一个常驻 Agent 进程？** — Gateway Daemon
2. **如何统一接入 WhatsApp/Telegram/Discord 等多渠道？** — Channel Plugin 架构
3. **如何让手机远程控制电脑上的 Agent？** — Node Host + Pairing
4. **如何扩展 Agent 的能力？** — Plugin + Skill 生态
5. **如何管理后台任务？** — Cron Service + SQLite

**整体结论：ADAPT**
—— OpenClaw 的架构模式高度适用于 RoboThree，无需从零设计，但需要针对 RoboThree 的具体需求做适配（如简化 Channel 接口、调整 Pairing 机制等）。

## 2. 五分类结论

### ADOPT（直接采纳）

| 机制 | 理由 | 证据 | 风险 | MVP 需要 |
| --- | --- | --- | --- | --- |
| **SessionKey 三段式路由** | `source:identity:scope` 模型简洁、可扩展，直接适用于 RoboThree 的多身份/多渠道场景 | [`src/routing/session-key.ts`](../../sources/openclaw/src/routing/session-key.ts) | 需要定义 RoboThree 的 source/identity/scope 枚举 | ✅ 是 |
| **Plugin Manifest 声明式注册** | Manifest 驱动的能力声明使 Plugin 可被发现、验证、安装，而无需运行代码 | [`src/plugins/manifest.ts:27`](../../sources/openclaw/src/plugins/manifest.ts#L27) | Manifest Schema 需要谨慎设计避免膨胀 | ✅ 是 |
| **SQLite 状态持久化** | 本地优先的 SQLite 存储是最简部署方案，无需额外数据库服务 | [`src/cron/store.ts`](../../sources/openclaw/src/cron/store.ts) | 并发写入需注意事务边界 | ✅ 是 |
| **Tool Policy 分层** | Group/Subagent/Global 三层策略清晰分离工具权限 | [`src/agents/tool-policy.ts`](../../sources/openclaw/src/agents/tool-policy.ts) | 策略评估链的性能开销 | ❌ MVP 后 |
| **MCP 协议支持** | MCP 是 Agent 工具互操作的标准协议，采纳可接入 MCP 生态 | [`src/mcp/channel-server.ts`](../../sources/openclaw/src/mcp/channel-server.ts) | MCP SDK 版本兼容性 | ✅ 是 |
| **Subagent Timeout 控制** | 子任务需要超时机制防止资源泄漏 | [`src/agents/subagent-run-timeout.ts`](../../sources/openclaw/src/agents/subagent-run-timeout.ts) | 超时值的选择需要调优 | ❌ MVP 后 |

### ADAPT（借鉴并适配）

| 机制 | 适配方案 | 理由 | 证据 | 风险 | MVP 需要 |
| --- | --- | --- | --- | --- | --- |
| **Gateway Daemon 架构** | 适配为 RoboThree Hub：简化 OpenClaw 的 20+ 渠道为 3-5 个核心渠道，保留本地常驻进程 + HTTP/WS 双协议 | OpenClaw 的 Hub-and-Spoke 模型完美匹配 RoboThree 的"多渠道统一接入"需求 | [`src/gateway/server.impl.ts:572-619`](../../sources/openclaw/src/gateway/server.impl.ts#L572-L619) | 单点故障（单进程），需考虑进程守护 | ✅ 是 |
| **Channel Plugin 接口** | 简化 `createChatChannelPlugin` 为更轻量的 Channel Adapter 接口，保留 `pairing` + `outbound` + `threading` 三个核心能力 | OpenClaw 的 Channel 接口经过 20+ 渠道验证，但 RoboThree 只需少数渠道 | [`src/channels/plugins/types.core.ts:29-100`](../../sources/openclaw/src/channels/plugins/types.core.ts#L29-L100) | 接口简化可能丢失灵活性 | ✅ 是 |
| **Node Host 多设备** | 适配为 RoboThree Device Bridge：保留 WebSocket 连接 + 远程调用，简化 Node 类型为 PC/Mobile | 手机控制电脑是明确的核心需求 | [`src/node-host/invoke.ts`](../../sources/openclaw/src/node-host/invoke.ts) | 安全性（远程执行的风险） | ✅ 是 |
| **Pairing 挑战-应答** | 适配为 RoboThree Identity Pairing：保留 Setup Code + 挑战-应答流程 | 设备/用户配对是安全基础 | [`src/pairing/pairing-challenge.ts:55-80`](../../sources/openclaw/src/pairing/pairing-challenge.ts#L55-L80) | 用户体验（配对流程不能太复杂） | ✅ 是 |
| **文件系统 Skill** | 适配为 RoboThree Skill：保留 Markdown 指令模式，增加 Skill 类型安全 | 文件系统 Skill 易于创建和分享 | [`skills/`](../../sources/openclaw/skills/) | 缺乏类型约束导致 Skill 质量不可控 | ❌ MVP 后 |
| **Hook 系统** | 适配生命周期 Hook 为 RoboThree 的扩展点 | 声明式 Hook 适合让 Plugin 介入 Agent 生命周期 | [`src/plugins/hooks.ts`](../../sources/openclaw/src/plugins/hooks.ts) | Hook 链过长影响性能 | ❌ MVP 后 |
| **Cron Service + SQLite** | 适配后台任务系统，简化 Cron 为基本定时 + 手动触发 | 后台任务是核心需求（定时报告、定期检查） | [`src/cron/service.ts`](../../sources/openclaw/src/cron/service.ts) | 任务堆积和并发控制 | ✅ 是 |
| **Plugin SDK 独立包** | 发布 `@robothree/plugin-sdk` 供第三方开发者 | SDK 分离是生态建设的基础 | `packages/plugin-sdk/` | SDK 版本管理 | ❌ MVP 后 |
| **Conversation Binding** | 适配 Session-Channel 绑定机制 | 确保同一对话始终路由到同一 Session | [`src/plugins/conversation-binding.ts`](../../sources/openclaw/src/plugins/conversation-binding.ts) | 绑定过期和失效处理 | ✅ 是 |
| **Memory Plugin 化** | 适配 Memory 后端 Plugin 化模式 | 不同的 Memory 策略（File/Vector/DB）作为不同 Plugin | [`src/plugins/memory-state.ts`](../../sources/openclaw/src/plugins/memory-state.ts) | Memory 跨 Plugin 的数据一致性 | ❌ MVP 后 |
| **Isolated Agent for Cron** | 适配后台任务隔离执行 | 定时任务用独立 Session，不污染用户对话 | [`src/cron/isolated-agent.ts`](../../sources/openclaw/src/cron/isolated-agent.ts) | 隔离 Agent 的认证配置 | ✅ 是 |
| **Subagent 独立 Session + 受限 ToolSet** | 适配子任务隔离执行模式 | 子代理的权限应该被限制 | [`src/agents/subagent-capabilities.ts`](../../sources/openclaw/src/agents/subagent-capabilities.ts) | 子代理与主代理的通信复杂性 | ❌ MVP 后 |
| **JSON→SQLite 渐进迁移** | 适配 Doctor-based 迁移模式 | 避免双写，降低迁移风险 | [`src/config/sessions/sqlite-marker.ts`](../../sources/openclaw/src/config/sessions/sqlite-marker.ts) | 迁移脚本需要充分测试 | ✅ 是 |

### DEFER（推迟）

| 机制 | 理由 | 风险 |
| --- | --- | --- |
| **20+ Channel 支持** | MVP 只需 3-5 个核心渠道 | 过早支持过多渠道分散资源 |
| **Bonjour/mDNS 服务发现** | LAN 内自动发现非 MVP 必需 | 网络配置复杂 |
| **Fleet Management** | 多实例管理是规模化后的事 | — |
| **ClawHub Plugin 市场** | 生态建设是产品成熟后的事 | — |
| **BOOT.md 机制** | Agent-as-Boot-Check 模式有新意但非 MVP 必需 | LLM 的不可靠性不适合系统检查 |
| **ACP (Agent Client Protocol)** | Agent 间通信协议的标准化重要但不是 MVP 阻塞项 | — |
| **Tool Call Repair** | LLM 已足够可靠时此层增加复杂性 | 修复逻辑可能引入新错误 |
| **Heartbeat 监控** | Channel 健康监控可后续迭代 | — |
| **Android/iOS 原生 App** | MVP 可以先通过 Web 或现有消息渠道 | 原生 App 开发成本高 |

### REJECT（不采纳）

| 机制 | 理由 |
| --- | --- |
| **Worker 自定义帧协议** | 自定义二进制协议增加复杂性，前期用 WebSocket + JSON 足够 |
| **npm 作为 Plugin 分发渠道** | 增加用户安装复杂度，RoboThree 可考虑更轻量的 Plugin 分发方式（如直接目录安装） |
| **Semgrep / oxlint / oxfmt 链条** | 可借鉴但不需要照搬整套工具链，用标准 ESLint + Prettier 简化 |

### NEEDS_MORE_EVIDENCE（证据不足）

| 机制 | 缺失证据 | How to Close |
| --- | --- | --- |
| **Embedded Agent Runner 的并发模型** | 未深入分析 `src/agents/embedded-agent-runner/` 的并发控制 | Runtime trace of concurrent agent runs |
| **大规模 Plugin 加载的性能影响** | 未进行 100+ Plugin 场景的性能测试 | Profile cold start with many plugins |
| **WebSocket 连接的高可用性** | 未分析断线重连和状态恢复 | Test connection drop + reconnect scenarios |

## 3. 核心架构建议

### 3.1 RoboThree 建议架构（基于 OpenClaw 的 ADAPT）

```
┌────────────────────────────────────────────┐
│            RoboThree Hub                   │
│        (本地常驻守护进程)                    │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │  Channel Adapter                     │ │
│  │  ┌─────────┐ ┌─────────┐ ┌───────┐  │ │
│  │  │ WhatsApp│ │ Telegram│ │WebChat│  │ │
│  │  └─────────┘ └─────────┘ └───────┘  │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Session  │ │  Agent   │ │  Plugin  │  │
│  │ Router   │ │ Runtime  │ │  Loader  │  │
│  │(Session- │ │ (Model→  │ │(Manifest │  │
│  │ Key路由) │ │  Tools)  │ │ Registry)│  │
│  └──────────┘ └──────────┘ └──────────┘  │
│                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Device  │ │  Memory  │ │   Cron   │  │
│  │  Bridge  │ │  System  │ │  Service │  │
│  └──────────┘ └──────────┘ └──────────┘  │
│                                            │
│  │     SQLite State DB       │            │
└────────────────────────────────────────────┘
```

### 3.2 MVP 优先级排序

**P0（必须有）**：
1. Gateway Daemon 常驻进程
2. Channel Adapter（WhatsApp + Telegram + WebChat）
3. SessionKey 路由
4. Agent Runtime（单 Agent，工具调用）
5. Device Bridge（手机控制电脑）

**P1（很快需要）**：
6. Pairing（用户配对和身份识别）
7. Cron Service（后台任务）
8. Plugin Manifest 注册
9. Memory 基础支持

**P2（后续迭代）**：
10. Plugin SDK
11. Skill 系统
12. Subagent 支持
13. MCP 集成

## 4. Proposed RoboThree Changes

> 以下候选变更可能影响 RoboThree 的模块边界、技术栈、数据模型、安全模型或部署形态。
> **仅作为提议，未自动落地。**

| 变更 | 影响模块 | 来源 |
| --- | --- | --- |
| 引入 `SessionKey` 三段式路由模型 | `routing/` | OpenClaw `src/routing/session-key.ts` |
| 引入 `ChannelPlugin` 统一接口 | `channels/` | OpenClaw `src/channels/plugins/types.core.ts` |
| 引入 `PluginManifest` 声明式注册 | `plugins/` | OpenClaw `src/plugins/manifest.ts` |
| 引入 `CronService` + SQLite 调度 | `tasks/` | OpenClaw `src/cron/service.ts` |
| 引入 `DeviceBridge` + Pairing | `devices/` | OpenClaw `src/node-host/` + `src/pairing/` |
| 采纳 SQLite 作为默认状态存储 | `state/` | OpenClaw 全项目约定 |

## 5. Requires Human Approval

> 以下决策需要用户拍板才能推进 RoboThree 正式架构。
> 默认状态：`PENDING_HUMAN_DECISION`

| 决策 | 选项 | 影响 | 状态 |
| --- | --- | --- | --- |
| **是否采纳 Hub-and-Spoke 架构** | Y/N | 决定整个系统的拓扑结构 | PENDING_HUMAN_DECISION |
| **是否以 TypeScript + Node.js 为主要技术栈** | Y/N | 与 OpenClaw 同栈可大幅降低学习成本 | PENDING_HUMAN_DECISION |
| **是否采纳 Plugin Manifest 格式** | Fork vs. Design new | Manifest 格式决定扩展生态的兼容性 | PENDING_HUMAN_DECISION |
| **Channel 接口是否对齐 OpenClaw** | Align vs. Simplify | 对齐可受益于 OpenClaw 的 Channel 生态 | PENDING_HUMAN_DECISION |
| **MVP 渠道优先级** | WhatsApp/Telegram/WebChat vs. other | 决定 Phase 1 的渠道投入 | PENDING_HUMAN_DECISION |
| **Device Bridge 安全模型** | Pairing-based vs. Certificate-based | 影响设备连接的安全性 | PENDING_HUMAN_DECISION |

---

## 6. L3 深挖验证摘要（2026-07-18 增补）

L3 三个专项深挖已对下述 ADAPT 决策进行了源码级验证，结论保持稳定且**优先级顺序已被进一步细化**：

| L2 ADAPT 决策 | L3 验证 | 优先级（被 L3 修正/强化） |
| --- | --- | --- |
| **Channel Adapter** | ✅ [channel-runtime-l3.md](./channel-runtime-l3.md) 确认 4 个核心不变量（durable-before-ack + adoption-time complete + claim-token fence + lane serialize） | P0（不变） |
| **Pairing 完整安全模型** | ✅ [pairing-security-l3.md](./pairing-security-l3.md) 确认双层结构（Channel + Device Bootstrap）+ Profile 权限 + wss-only 强制 | P0（不变） |
| **Background Tasks（简化版 Cron）** | ✅ [background-tasks-l3.md](./background-tasks-l3.md) 确认 SQLite-only + Partial Index + spin-loop 防护 + quarantine 的必要性 | P0（不变） |
| **L2 Gateway Daemon 架构** | L3 未深挖但仍适用 | P0（不变） |
| **L2 Node Host 多设备** | L3 列入 §B.7（Q4 partial）— 安全边界 deep-dive 推迟到下个 L3 周期 | P0 → Phase 1.5 |
| **L2 Plugin Manifest 注册** | L3 未深挖（仍归 ADAPT） | P1（不变） |
| **L2 Hook 系统** | L3 在 Pairing 文档顺带验证（2s timeout + fire-and-forget） | P1（不变） |
| **L2 Memory Plugin 化** | L3 未深挖 | P1 → Phase 1.5 |

### L3 新发现的内容（无需 L2 调整）

**A. Pairing 邀请码必须 rate-limit per sender**（[pairing-security-l3.md §7](./pairing-security-l3.md)）
- OpenClaw 对每个不识别的 sender 都生成 code——可能被滥用
- RoboThree MVP **应**内置 sender-level rate limiting（不在 OpenClaw 决策中，需要单独标注）

**B. Cron 启动期 AT 任务的 idempotency**（[background-tasks-l3.md §7](./background-tasks-l3.md)）
- `skipAtIfAlreadyRan: true` 防止 AT 任务重启时重复触发
- 这是 OpenClaw 已成熟的不变量——RoboThree 直接采纳

**C. Send 漏斗必须双通道等价降级**（[channel-runtime-l3.md §4](./channel-runtime-l3.md#4-出站漏斗durable--streaming-双通道)）
- durable funnel + streaming funnel 必须同步降级——这不是可选项
- MVP 简化：仅实现 durable funnel 也必须在文档中明确"等价降级"约束

### L3 后的 `NEEDS_MORE_EVIDENCE` 增量

见 [open-questions.md §6](./open-questions.md#6-l3-深挖已发现的新增-needs_more_evidence)，共 8 项 L3 新发现需待进一步证据。
