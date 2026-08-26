# OpenClaw — Session, State & Memory

> 分析 Session 路由、SessionKey 体系、运行时状态管理、跨会话 Memory。
> 触发条件：存在真实长期记忆（跨会话 / Vector / 命名空间）

## 1. Session System

### 1.1 SessionKey 三段式路由

**[F]** SessionKey 格式：`channel:account:conversation`（[`src/routing/session-key.ts`](../../sources/openclaw/src/routing/session-key.ts)）：

```
telegram:mybot:chat_12345        → Telegram Bot private chat
whatsapp:+8613800138000:group@g.us → WhatsApp group
discord:bot123:channel_789       → Discord channel
cron:main:daily_report           → Cron scheduled task
agent:default:boot               → Agent boot session
```

### 1.2 Session 生命周期

**[F]** Session 管理模块（[`src/sessions/`](../../sources/openclaw/src/sessions/)）：

| 阶段 | 文件 | 说明 |
| --- | --- | --- |
| **创建** | `session-id.ts` | Session ID 生成 |
| **准入** | `session-lifecycle-admission.ts` | Session 生命周期准入控制 |
| **类型** | `classify-session-kind.ts` | Session 类型分类 |
| **轮次** | `conversation-turns.ts` | 对话轮次管理 |
| **转录** | `transcript-events.ts` | Session 转录事件流 |
| **输入** | `input-provenance.ts` | 输入来源追踪 |
| **发送策略** | `send-policy.ts` | 消息发送策略 |
| **模型覆盖** | `model-overrides.ts` | 会话级模型重写 |

### 1.3 Session 持久化

**[F]** Session 状态存储方式：

- **Session Entry**：`loadSessionEntry()` / `updateSessionEntry()` / `saveSessionStore()`（[`src/config/sessions/session-accessor.ts`](../../sources/openclaw/src/config/sessions/session-accessor.ts)）
- **SQLite Session Marker**：`sqliteSessionFileMarkerMatchesSession()`（[`src/config/sessions/sqlite-marker.ts`](../../sources/openclaw/src/config/sessions/sqlite-marker.ts)）

**[I]** Session 的持久化采用渐进式迁移策略：历史使用 JSON 文件存储，新版本通过 `openclaw doctor --fix` 迁移到 SQLite。

### 1.4 Conversation Binding

**[F]** Conversation Binding 机制（[`src/plugins/conversation-binding.ts`](../../sources/openclaw/src/plugins/conversation-binding.ts)）：

- **Binding Record**（[`src/bindings/records.ts`](../../sources/openclaw/src/bindings/records.ts)）：绑定会话 Key 到具体 Channel 对话
- **Touch Record**：每次消息交换时更新绑定时间戳
- **Plugin Owned Binding**：Plugin 可以声明自己管理的绑定

### 1.5 Session Routing

**[F]** Route 解析（[`src/routing/resolve-route.ts`](../../sources/openclaw/src/routing/resolve-route.ts)）：

```
Inbound (channel_id, account_id, target_id) →
  Resolve SessionKey →
    Lookup or Create Session →
      Route to Agent
```

**[F]** Channel Route Targets（[`src/routing/channel-route-targets.ts`](../../sources/openclaw/src/routing/channel-route-targets.ts)）：多渠道路由到目标的映射。

## 2. Memory System

### 2.1 Architecture

**[F]** Memory 系统支持跨会话持久化记忆：

- **Root Memory Files**（[`src/memory/root-memory-files.ts`](../../sources/openclaw/src/memory/root-memory-files.ts)）：全局记忆文件管理
- **Active Memory**（`extensions/active-memory/`）：主动记忆扩展
- **Memory State**（[`src/plugins/memory-state.ts`](../../sources/openclaw/src/plugins/memory-state.ts)）：记忆状态管理

### 2.2 Embedding Providers

**[F]** 向量嵌入提供者（[`src/plugins/memory-embedding-providers.ts`](../../sources/openclaw/src/plugins/memory-embedding-providers.ts)）：

- OpenCLaw 的 Memory 支持通过 Embedding Provider 实现语义搜索
- Embedding Provider 作为 Plugin 注册（[`src/plugins/memory-embedding-provider-runtime.ts`](../../sources/openclaw/src/plugins/memory-embedding-provider-runtime.ts)）
- OpenAI Compatible 嵌入提供者（[`src/plugins/openai-compatible-embedding-provider.ts`](../../sources/openclaw/src/plugins/openai-compatible-embedding-provider.ts)）

### 2.3 Memory Host SDK

**[F]** Memory Host SDK（`packages/memory-host-sdk/`）：提供 Memory 主机端 API，供 Plugin 开发者使用。

**[I]** Memory 系统设计采用 Plugin 化方式——不同的 Memory 后端（File/Vector/DB）作为不同的 Plugin 注册。Core 本身只提供 Root Memory Files 这一基础能力，语义搜索、向量存储等高级功能由 Active Memory 扩展提供。

### 2.4 Memory in Context

**[F]** 记忆注入 Agent 上下文的方式：

1. **Root Memory**：全局记忆文件在 Context 组装时自动注入
2. **Active Memory**：通过 `memory.search()` 类型的工具调用检索
3. **Session Memory**：通过 Conversation History（transcript）维护

### 2.5 State Management

**[F]** 运行时状态管理：

- **Global State**（[`src/global-state.ts`](../../sources/openclaw/src/global-state.ts)）：进程级全局状态
- **Plugin State**（[`src/plugins/runtime-state.ts`](../../sources/openclaw/src/plugins/runtime-state.ts)）：Plugin 运行时状态
- **Runtime Workspace State**（[`src/plugins/runtime-workspace-state.ts`](../../sources/openclaw/src/plugins/runtime-workspace-state.ts)）：Workspace 级状态
- **Channel State**（[`src/plugins/runtime-channel-state.ts`](../../sources/openclaw/src/plugins/runtime-channel-state.ts)）：Channel 运行时状态

## 3. 与 RoboThree 的相关性

| 机制 | RoboThree 映射方向 | 理由 |
| --- | --- | --- |
| **SessionKey 三段式路由** | **ADOPT** | `source:identity:scope` 的路由模型可直接复用 |
| **Conversation Binding** | **ADAPT** | 绑定机制适合多渠道路由场景 |
| **SQLite 状态持久化** | **ADOPT** | 本地优先 + SQLite 是最简部署方案 |
| **Memory Plugin 化** | **ADAPT** | Memory 后端作为 Plugin 是灵活的扩展模式 |
| **Embedding Provider 可插拔** | **ADAPT** | Provider 模式可适用于多种嵌入服务 |
| **Session Lifecycle** | **ADAPT** | 完整的创建-准入-运行-终止生命周期值得借鉴 |
| **JSON→SQLite 渐进迁移** | **ADOPT** | Doctor-based 迁移模式避免双写复杂性 |
