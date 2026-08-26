# OpenClaw — Architecture Overview

## 1. 架构全景

OpenClaw 的架构是 **Hub-and-Spoke（中心-辐条）模型**，以 Gateway Daemon 为中央控制平面，通过可插拔的 Channel Plugin 连接所有消息渠道。

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Gateway Daemon                               │
│                      (port 18789, Node.js)                           │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │   HTTP    │  │ WebSocket│  │  Admin   │  │  OpenAI-         │   │
│  │  Server   │  │ JSON-RPC │  │   HTTP   │  │  Compatible API  │   │
│  │(Express)  │  │  Server  │  │  Routes  │  │  /v1/chat/...   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Auto-Reply Pipeline                         │   │
│  │  get-reply.ts → dispatch-from-config.ts → dispatch.ts        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐   │
│  │  Agent Runtime   │  │  Channel Registry│  │  Plugin Loader │   │
│  │  (model → tools) │  │  (20+ channels)  │  │ (161 extensions)│   │
│  └──────────────────┘  └──────────────────┘  └────────────────┘   │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Cron    │  │  Memory  │  │  Pairing │  │  Node Host       │   │
│  │ Service  │  │  System  │  │  System  │  │  (Remote Devices) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  SQLite State DB  │  Agent DBs  │  Credential Store  │  Logs  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
         ▲              ▲              ▲              ▲
         │              │              │              │
    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
    │Telegram │    │WhatsApp │    │ Discord │    │  ...    │
    │ Plugin  │    │ Plugin  │    │ Plugin  │    │ Plugin  │
    └─────────┘    └─────────┘    └─────────┘    └─────────┘
```

## 2. 核心模块

### 2.1 Gateway Daemon（`src/gateway/server.impl.ts`）

**Gateway 是 OpenClaw 的中枢神经系统**。它是一个长期运行的 Node.js 进程，负责：

1. **数据库管理**：启动时进行 SQLite Schema Preflight（[`src/gateway/server.impl.ts:572-619`](../../sources/openclaw/src/gateway/server.impl.ts#L572-L619)）
2. **配置加载**：从 `~/.openclaw/openclaw.json` 读取配置（[`src/gateway/server.impl.ts:648-659`](../../sources/openclaw/src/gateway/server.impl.ts#L648-L659)）
3. **Plugin Bootstrap**：加载所有扩展插件、解析 Manifest、注册 Channel/Provider/Tool（[`src/gateway/server.impl.ts:645`](../../sources/openclaw/src/gateway/server.impl.ts#L645)）
4. **HTTP Server**：Express 5.x 服务，提供 REST API 和 WebSocket（port 18789）
5. **JSON-RPC API**：Gateway 方法注册表，100+ RPC 方法（`src/gateway/methods/`）
6. **Cron Service**：SQLite 支持的定时任务调度（`src/cron/service.ts`）
7. **健康检查**：`/health`, `/healthz`, `/ready`, `/readyz` 端点

**[F]** Gateway 启动序列（源码证据）：
```
openclaw.mjs → dist/entry.js → src/cli/run-main.ts → 
Commander 路由到 gateway 子命令 →
src/gateway/server.impl.ts:startGatewayServer(port=18789) →
  1. preflightOpenClawDatabaseSchemas()
  2. bootstrapGatewayNetworkRuntime()
  3. loadGatewayStartupConfigSnapshot() → openclaw.json
  4. Plugin Bootstrap (extensions/)
  5. Channel Autostart (monitoring/polling)
  6. Express HTTP Server start
  7. Cron Service start
  8. BOOT.md execution
```

### 2.2 Channel Adapter（`src/channels/` + `extensions/<channel>/`）

Channel 是消息渠道的抽象层。每个 Channel Plugin 实现一个标准接口：

```typescript
// extensions/telegram/src/channel.ts:1-80
export const telegramPlugin: ChannelPlugin<ResolvedTelegramAccount> = 
  createChatChannelPlugin<ResolvedTelegramAccount>({
    pairing: { idLabel, normalizeAllowEntry },
    outbound: telegramOutboundAdapter,
    threading: { scopedAccountReplyToMode },
    base: { ... }
  });
```

**[F]** Channel Plugin 核心接口定义在 [`src/channels/plugins/types.core.ts:29-100`](../../sources/openclaw/src/channels/plugins/types.core.ts#L29-L100)：

| 接口元素 | 作用 |
| --- | --- |
| `ChannelExposure` | 渠道暴露级别（configured/setup/docs） |
| `ChannelAgentTool` | Channel 注册的 Agent 工具 |
| `ChannelMessageToolDiscovery` | Message Tool 的 Schema 贡献（跨渠道统一发送接口） |
| `ChannelSetupInput` | CLI/Onboarding/Setup 的通用设置输入 |
| `ChannelMessageActionDiscoveryContext` | Action 发现上下文 |
| `ChannelOutboundTargetMode` | 出站目标模式（explicit/implicit/heartbeat） |

**[F]** 每个 Channel Plugin 通过 `openclaw/plugin-sdk` 提供以下能力：
- **`pairing`**：用户身份识别与白名单
- **`outbound`**：消息发送适配器
- **`threading`**：线程/话题绑定策略
- **`status`**：渠道健康状态
- **`setup`**：渠道配置向导
- **`directory`**：群组/联系人目录
- **`actions`**：渠道原生操作（如 Reaction、Button）

### 2.3 Session Routing（`src/routing/`）

**[F]** Session Key 是三段式结构（[`src/routing/session-key.ts`](../../sources/openclaw/src/routing/session-key.ts)）：

```
格式: channel:accountId:conversationId
示例: telegram:mybot:chat_12345
      whatsapp:+8613800138000:group_abc@g.us
      discord:bot123:channel_789
```

- **连续性保证**：同一用户的同一会话始终路由到同一个 Session，保证对话上下文不丢失
- **跨渠道隔离**：不同 Channel 的 Session Key 不可混用
- **Account 级别路由**：同一 Channel 的不同 Account（如多 Bot）独立路由

**[F]** Route 解析入口（[`src/routing/resolve-route.ts`](../../sources/openclaw/src/routing/resolve-route.ts)）：根据 `ChannelId + AccountId + TargetId` 三元组解析出 `SessionKey`。

### 2.4 Device / Node（`src/node-host/`）

**[F]** OpenClaw 支持多设备 Node 架构：

- **Gateway**（电脑端）：中央控制平面
- **Node**（手机/平板/其他电脑）：通过 WebSocket 连接到 Gateway
- **Node Host**（[`src/node-host/client.ts`](../../sources/openclaw/src/node-host/client.ts)）：Node 客户端实现
- **Node Invoke**（[`src/node-host/invoke.ts`](../../sources/openclaw/src/node-host/invoke.ts)）：Gateway 向 Node 发起远程调用

支持的 Node 类型：
- **Android**：通过 WebSocket + ACP 协议连接，支持执行 Shell 命令、文件操作、App 控制（[`src/gateway/android-node.capabilities.*.ts`](../../sources/openclaw/src/gateway/)）
- **iOS/macOS**：通过 Bonjour/mDNS 发现（[`extensions/bonjour/`](../../sources/openclaw/extensions/bonjour/)）
- **Linux**：通过 systemd 服务连接

### 2.5 Pairing（`src/pairing/`）

**[F]** Pairing 机制用于身份识别和授权（[`src/pairing/pairing-challenge.ts`](../../sources/openclaw/src/pairing/pairing-challenge.ts)）：

1. **Setup Code 生成**：Gateway 生成一次性设置码（[`src/pairing/setup-code.ts`](../../sources/openclaw/src/pairing/setup-code.ts)）
2. **挑战-应答**：Node 发送配对请求 → Gateway 挑战 → Node 应答
3. **持久化存储**：配对状态存入 SQLite（[`src/pairing/pairing-store-sqlite.ts`](../../sources/openclaw/src/pairing/pairing-store-sqlite.ts)）
4. **白名单管理**：每个 Channel Plugin 通过 `pairing.normalizeAllowEntry` 管理白名单

### 2.6 Skills（`skills/` + `src/skills/`）

**[F]** Skill 系统是文件系统驱动的：

- **54 个 Skill 目录**在 `skills/` 根目录下
- 每个 Skill 包含 Markdown 指令文件，Agent 在合适的时机加载
- **BOOT.md**：Gateway 启动时执行的启动检查（[`src/gateway/boot.ts`](../../sources/openclaw/src/gateway/boot.ts)）
- **Skill Filter**：Agent 可以根据 Skill Filter 选择性地加载技能（[`src/auto-reply/reply/skill-filter.ts`](../../sources/openclaw/src/auto-reply/reply/)）
- **Remote Skills**：Node 上的技能运行在远程设备（[`src/skills/runtime/remote.ts`](../../sources/openclaw/src/skills/runtime/remote.ts)）

### 2.7 Plugins（`src/plugins/` + `extensions/`）

**[F]** Plugin 系统是 OpenClaw 最核心的扩展机制：

- **Plugin Manifest**（[`src/plugins/manifest.ts`](../../sources/openclaw/src/plugins/manifest.ts)）：定义 Plugin 的 ID、版本、依赖、能力
- **Plugin Loader**（[`src/plugins/loader.ts`](../../sources/openclaw/src/plugins/loader.ts)）：负责发现、验证、加载 Plugin
- **Plugin Registry**（[`src/plugins/registry.ts`](../../sources/openclaw/src/plugins/registry.ts)）：运行时注册表，维护所有已激活 Plugin
- **Plugin SDK**（`packages/plugin-sdk/`）：公开给第三方开发者的 API
- **ClawHub**（[`src/plugins/clawhub.ts`](../../sources/openclaw/src/plugins/clawhub.ts)）：官方 Plugin 市场集成

**Plugin 类型**（通过 `extensions/` 目录体现）：
- **Channel Plugins**（30+）：消息渠道适配器
- **Provider Plugins**（20+）：LLM 提供商
- **Tool Plugins**：工具扩展（Browser, Canvas, Voice 等）
- **Memory Plugins**：记忆提供者
- **Infra Plugins**：诊断、监控

### 2.8 Memory（`src/memory/` + `extensions/active-memory/`）

**[F]** Memory 系统支持跨会话持久化记忆：

- **Root Memory Files**（[`src/memory/root-memory-files.ts`](../../sources/openclaw/src/memory/root-memory-files.ts)）：全局记忆文件管理
- **Active Memory**（`extensions/active-memory/`）：主动记忆扩展
- **Embedding Providers**（[`src/plugins/memory-embedding-providers.ts`](../../sources/openclaw/src/plugins/memory-embedding-providers.ts)）：向量嵌入提供者
- **Memory State**（[`src/plugins/memory-state.ts`](../../sources/openclaw/src/plugins/memory-state.ts)）：记忆状态管理

### 2.9 Background Tasks（`src/cron/`）

**[F]** Background Tasks 基于 Cron Service：

- **Cron Service**（[`src/cron/service.ts`](../../sources/openclaw/src/cron/service.ts)）：定时任务调度核心，SQLite 持久化
- **Job Store**（[`src/cron/store.ts`](../../sources/openclaw/src/cron/store.ts)）：任务数据存储
- **Isolated Agent**（[`src/cron/isolated-agent.ts`](../../sources/openclaw/src/cron/isolated-agent.ts)）：隔离的 Agent 执行环境
- **Session Reaper**（[`src/cron/session-reaper.ts`](../../sources/openclaw/src/cron/session-reaper.ts)）：过期会话清理
- **Heartbeat Policy**（[`src/cron/heartbeat-policy.ts`](../../sources/openclaw/src/cron/heartbeat-policy.ts)）：心跳监控策略

### 2.10 Mobile/Desktop Integration

**[F]** 多平台客户端通过以下方式集成：

| 平台 | 路径 | 连接方式 |
| --- | --- | --- |
| **Android** | [`apps/android/`](../../sources/openclaw/apps/android/) | WebSocket + ACP 协议 |
| **iOS** | [`apps/ios/`](../../sources/openclaw/apps/ios/) | Bonjour/mDNS + WebSocket |
| **macOS** | [`apps/macos/`](../../sources/openclaw/apps/macos/) | 本地进程 + WebSocket |
| **Linux** | [`apps/linux/`](../../sources/openclaw/apps/linux/) | 本地进程 + WebSocket |

**手机远程控制电脑 Agent**的流程：
1. 手机 App 作为 Node 通过 Pairing 连接到 Gateway
2. Gateway 的 Node Host 模块管理连接（[`src/node-host/client.ts`](../../sources/openclaw/src/node-host/client.ts)）
3. 用户通过手机发送消息 → Channel Plugin 接收 → Gateway 路由 → Agent 处理
4. Agent 可通过 Node Host 在电脑上执行操作（Shell/文件/应用控制）
5. 结果通过 Channel 回复到手机

## 3. 跨模块交互模型

```
Inbound Message Flow:
Channel Plugin (poll/webhook) 
  → normalize → MsgContext
  → auto-reply pipeline (getReplyFromConfig)
  → command detection (/reset, /new)
  → agent runtime (model → tools)
  → dispatchFromConfig
  → Channel Plugin (send)
  → User receives reply

Gateway Startup Flow:
openclaw gateway --port 18789
  → DB preflight (SQLite schema check)
  → config load (openclaw.json)
  → plugin bootstrap (extensions/)
  → channel autostart (start monitoring)
  → HTTP/WS server start
  → cron service start
  → BOOT.md run
  → ready for messages
```

## 4. Permission & Security（Level 2 必查）

**[F]** OpenClaw 的安全模型：

1. **Auth**（[`src/gateway/auth.ts`](../../sources/openclaw/src/gateway/auth.ts)）：Gateway 自身入站连接的认证，支持 Token/OAuth
2. **Gatekeeper**：对于管理性 Gateway 方法（如 `plugins.install`），要求在配置中显式启用
3. **Sandbox**：Agent 的 Bash 执行默认在 Docker 沙箱中（`extensions/browser/` 的 Playwright 也在沙箱中）
4. **Secrets**（[`src/secrets/runtime-state.ts`](../../sources/openclaw/src/secrets/runtime-state.ts)）：凭据管理，与配置分离
5. **Approval**：高风险操作（如远程 exec）需要用户批准
6. **Security Scan**（[`src/plugins/install-security-scan.ts`](../../sources/openclaw/src/plugins/install-security-scan.ts)）：Plugin 安装时的安全扫描

**[I]** Security 是 Plugin 级别的，不是全局统一沙箱——每个 Plugin 管理自己的安全边界。

## 5. 架构决策与权衡

| 决策 | 依据 | 影响 |
| --- | --- | --- |
| **Hub-and-Spoke** | 所有 Channel 汇聚到一个 Gateway | 单点故障风险，但简化了 Agent 逻辑 |
| **Channel 作为 Plugin** | Core 完全不知道具体渠道逻辑 | 渠道可独立开发/测试/升级 |
| **SQLite 而非 PostgreSQL** | 本地单用户场景不需要分布式 DB | 简化部署，但限制并发 |
| **文件系统 Skill** | Skill 就是 Markdown 文件 | 易于创建和分享，但无类型安全 |
| **Plugin 即 npm 包** | 复用 npm 生态的依赖管理 | 依赖体积大，但安装和版本管理成熟 |
| **Node 22+ 要求** | 使用 `node:sqlite` 原生绑定 | 环境要求高，但避免 native addon 编译问题 |
