# OpenClaw — Deployment Model

> 分析 Gateway Daemon 的部署形态、Node Host 设备架构、Pairing 机制、Mobile/Desktop 集成方式。
> 触发条件：本地与云端协作（Gateway + Remote Worker + Device Node）

## 1. 部署架构总览

```
                     ┌─────────────────────────────────────┐
                     │         Gateway Daemon               │
                     │    (macOS / Linux / Windows)        │
                     │         Port 18789                  │
                     │                                     │
                     │  ┌─────────────────────────────┐   │
                     │  │   HTTP + WebSocket Server   │   │
                     │  └─────────────────────────────┘   │
                     │                                     │
                     │  ┌─────────────────────────────┐   │
                     │  │   Node Host Manager          │   │
                     │  │   (src/node-host/)           │   │
                     │  └─────────────────────────────┘   │
                     └──────────┬──────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
    ┌─────────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
    │  Android Node  │  │  iOS Node   │  │ macOS/linux │
    │  (WebSocket +  │  │ (Bonjour +  │  │   (local)   │
    │   ACP Protocol) │  │  WebSocket) │  │             │
    └────────────────┘  └─────────────┘  └─────────────┘
```

## 2. Gateway Daemon（本地常驻进程）

### 2.1 部署方式

**[F]** Gateway 通过以下方式作为系统级守护进程运行：

| 平台 | 机制 | 命令 |
| --- | --- | --- |
| **macOS** | launchd (user service) | `openclaw onboard --install-daemon` |
| **Linux** | systemd (user service) | `openclaw onboard --install-daemon` |
| **Windows** | Windows Service | `openclaw onboard --install-daemon` |
| **Foreground** | 直接进程（调试） | `openclaw gateway --port 18789 --verbose` |

**[F]** Daemon 管理代码在 [`src/daemon/`](../../sources/openclaw/src/daemon/)，通过 `onboard` 命令安装。

### 2.2 Gateway 核心能力

**[F]** Gateway 进程的核心职责（[`src/gateway/server.impl.ts:572-1200`](../../sources/openclaw/src/gateway/server.impl.ts#L572-L1200)）：

1. **HTTP API**：Express 5.x 服务器，提供 REST API + OpenAI 兼容 `/v1/chat/completions` 端点
2. **WebSocket JSON-RPC**：CLI/TUI/Node 客户端通过 WebSocket 连接，100+ RPC 方法
3. **Channel Management**：管理 20+ 渠道的自动启动、状态监控、健康检查
4. **Config Hot Reload**：配置变更检测与运行时重载
5. **Cron Scheduler**：SQLite 持久化的定时任务调度
6. **Health Probes**：`/health`, `/ready`, `/healthz`, `/readyz`
7. **Restart Handoff**：重启时会话恢复（[`src/infra/restart-handoff.ts`](../../sources/openclaw/src/infra/restart-handoff.ts)）

### 2.3 Gateway 配置管理

**[F]** 配置系统（`src/config/`）：

- **主配置**：`~/.openclaw/openclaw.json`（JSON5 兼容）
- **Secrets**：`~/.openclaw/credentials/`（凭据文件）
- **Auth Profiles**：`~/.openclaw/agents/<agentId>/agent/auth-profiles.json`
- **State DB**：`state/openclaw.sqlite`（全局状态）
- **Agent DB**：`agents/<agentId>/agent/openclaw-agent.sqlite`（per-agent 状态）

## 3. Node Host — 多设备节点架构

### 3.1 架构概述

**[F]** Node Host 是 Gateway 的多设备扩展机制（[`src/node-host/`](../../sources/openclaw/src/node-host/)）：

- **Gateway** 作为中央控制器
- **Node**（手机/平板/其他电脑）通过安全连接注册到 Gateway
- Gateway 可以向 Node 发起**远程调用**（Shell 命令、文件操作、应用控制）

### 3.2 Node 连接流程

**[F]** Node 连接生命周期（[`src/node-host/client.ts`](../../sources/openclaw/src/node-host/client.ts) + [`src/node-host/runtime.ts`](../../sources/openclaw/src/node-host/runtime.ts)）：

1. **发现**：Bonjour/mDNS（[`extensions/bonjour/`](../../sources/openclaw/extensions/bonjour/)）或手动配置
2. **Pairing**：Setup Code 挑战-应答（[`src/pairing/pairing-challenge.ts`](../../sources/openclaw/src/pairing/pairing-challenge.ts)）
3. **连接**：WebSocket 连接到 Gateway（[`src/node-host/client.ts`](../../sources/openclaw/src/node-host/client.ts)）
4. **注册**：Node 向 Gateway 注册其能力（Shell、文件、App Control）
5. **就绪**：Gateway 可以向 Node 发起调用

### 3.3 Node 远程调用

**[F]** 远程调用机制（[`src/node-host/invoke.ts`](../../sources/openclaw/src/node-host/invoke.ts)）：

- **Invoke Types**（[`src/node-host/invoke-types.ts`](../../sources/openclaw/src/node-host/invoke-types.ts)）：定义调用类型
- **System Run**（[`src/node-host/invoke-system-run.ts`](../../sources/openclaw/src/node-host/invoke-system-run.ts)）：Shell 命令执行
- **File Commands**（[`src/node-host/invoke-file-commands.ts`](../../sources/openclaw/src/node-host/invoke-file-commands.ts)）：文件操作
- **Device Apps**（[`src/node-host/invoke-device-apps.ts`](../../sources/openclaw/src/node-host/invoke-device-apps.ts)）：应用控制
- **Agent CLI**（[`src/node-host/invoke-agent-cli-claude.ts`](../../sources/openclaw/src/node-host/invoke-agent-cli-claude.ts)）：通过 Claude CLI 执行 Agent 任务
- **Skills**（[`src/node-host/skills.ts`](../../sources/openclaw/src/node-host/skills.ts)）：远程 Skill 执行
- **MCP**（[`src/node-host/mcp.ts`](../../sources/openclaw/src/node-host/mcp.ts)）：MCP 工具桥接

### 3.4 Node 能力声明

**[F]** Android Node 的能力配置（[`src/gateway/android-node.capabilities.*.ts`](../../sources/openclaw/src/gateway/)）：

- `capabilities.live.test.ts`：实时能力测试
- `capabilities.policy-config.test.ts`：能力策略配置
- `capabilities.policy-source.test.ts`：能力策略来源
- `capabilities.required-commands.test.ts`：必需命令检查

**[I]** 每个 Node 类型拥有不同的能力集：Android → Shell + App Control + File；macOS → Shell + 桌面自动化；iOS → 受限（通过 Bonjour 发现为主）。

## 4. Pairing — 设备配对与身份识别

### 4.1 Pairing Challenge

**[F]** Pairing 挑战-应答机制（[`src/pairing/pairing-challenge.ts:55-80`](../../sources/openclaw/src/pairing/pairing-challenge.ts#L55-L80)）：

```typescript
export async function issuePairingChallenge(params: PairingChallengeParams) {
  const { code, created } = await params.upsertPairingRequest({
    id: params.senderId,
    meta: params.meta,
  });
  if (!created) {
    return { created: false };
  }
  // Send pairing code to the requesting sender
  const replyText = params.buildReplyText?.({ code, senderIdLine }) 
    ?? buildPairingReply({ channel, idLine, code });
  await params.sendPairingReply(replyText);
}
```

### 4.2 Pairing Store

**[F]** Pairing 状态持久化到 SQLite（[`src/pairing/pairing-store-sqlite.ts`](../../sources/openclaw/src/pairing/pairing-store-sqlite.ts) + [`src/pairing/pairing-store.ts`](../../sources/openclaw/src/pairing/pairing-store.ts)）：

- **存储格式**：`(channel, accountId, senderId) → pairing_state`
- **生命周期**：创建 → 待确认 → 已确认 → 已过期
- **One-time code**：Setup Code 一次性使用（[`src/pairing/setup-code.ts`](../../sources/openclaw/src/pairing/setup-code.ts)）

### 4.3 Channel-Level Pairing

**[F]** 每个 Channel Plugin 通过 `pairing` 配置实现自己的白名单管理：

```typescript
// extensions/telegram/src/channel.ts
pairing: {
  idLabel: "telegramSenderId",
  normalizeAllowEntry: (entry) => normalizeWhatsAppAllowFromEntry(entry) ?? "",
}
```

**[I]** Pairing 本质上是双层系统：
1. **Channel Pairing**：消息渠道上的用户身份验证（"这个 Telegram 用户是谁"）
2. **Node Pairing**：设备节点的授权（"这台手机是否被授权连接"）

## 5. Mobile/Desktop Integration

### 5.1 客户端应用架构

| 平台 | 目录 | 技术栈 | 连接方式 |
| --- | --- | --- | --- |
| **Android** | [`apps/android/`](../../sources/openclaw/apps/android/) | Kotlin, Gradle, Jetpack Compose | WebSocket + ACP |
| **iOS** | [`apps/ios/`](../../sources/openclaw/apps/ios/) | SwiftUI (Observation framework) | Bonjour + WebSocket |
| **macOS** | [`apps/macos/`](../../sources/openclaw/apps/macos/) | SwiftUI Menu Bar App | 本地进程 + WebSocket |
| **Linux** | [`apps/linux/`](../../sources/openclaw/apps/linux/) | Tauri/Electron | 本地进程 + WebSocket |

### 5.2 手机远程控制电脑 Agent 流程

```
User on Phone → Channel Plugin (Telegram/WhatsApp) → Gateway → 
Agent processes request → Agent issues system.run on Node Host → 
Node executes on Computer → Result returned → Agent replies → 
User on Phone receives result
```

**[F]** 关键文件链路：
1. **手机消息** → Channel Plugin 入站（[`extensions/telegram/src/monitor.ts`](../../sources/openclaw/extensions/telegram/src/monitor.ts)）
2. **Gateway 路由** → Auto-Reply Pipeline
3. **Agent 工具调用** → `system.run` 工具（[`src/node-host/invoke-system-run.ts`](../../sources/openclaw/src/node-host/invoke-system-run.ts)）
4. **电脑执行** → Shell 命令、文件操作
5. **结果回传** → Agent 回复 → Channel 出站

### 5.3 Wake-on-LAN / 远程唤醒

**[F]** Gateway 支持 Node Wake 机制（[`src/gateway/server-methods/nodes-wake-state.ts`](../../sources/openclaw/src/gateway/server-methods/nodes-wake-state.ts)），允许 Gateway 唤醒休眠的 Node 设备。

## 6. 与 RoboThree 的相关性

| 机制 | RoboThree 映射方向 | 理由 |
| --- | --- | --- |
| Gateway Daemon 架构 | **ADAPT** | 本地常驻守护进程是 RoboThree 核心需求 |
| Node Host 多设备 | **ADAPT** | 手机控制电脑是明确的用户需求 |
| Pairing 挑战-应答 | **ADAPT** | 安全的设备配对是必要的安全模型 |
| Channel 白名单 | **ADAPT** | 用户身份识别需要渠道级别的验证 |
| Bonjour 服务发现 | **DEFER** | LAN 内自动发现非 MVP 必需 |
| Android/iOS 原生 App | **DEFER** | MVP 阶段可以先通过 Web 或现有消息渠道 |
