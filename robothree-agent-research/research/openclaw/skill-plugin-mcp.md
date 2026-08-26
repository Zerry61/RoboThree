# OpenClaw — Skill / Plugin / MCP System

> 分析 Plugin 生态、Skill 系统、Channel 适配器架构、Hook 系统、MCP 集成。
> 触发条件：存在 Skill / Plugin / Hook / MCP 四类中任一类。

## 1. Plugin System

### 1.1 架构概述

**[F]** OpenClaw 的 Plugin 系统是整个平台最核心的扩展机制，161 extension 目录覆盖所有扩展点。

### 1.2 Plugin Manifest

**[F]** Plugin 通过 `openclaw.plugin.json` Manifest 文件声明其能力（[`src/plugins/manifest.ts:27`](../../sources/openclaw/src/plugins/manifest.ts#L27)）：

```typescript
export const PLUGIN_MANIFEST_FILENAME = "openclaw.plugin.json";
```

Manifest 包含的声明（[`src/plugins/manifest.ts:49-79`](../../sources/openclaw/src/plugins/manifest.ts#L49-L79)）：

| 声明项 | 作用 |
| --- | --- |
| `channelConfig` | Channel 配置 Schema + UI Hints |
| `modelSupport` | Model ID 前缀/模式匹配 |
| `modelCatalog` | 模型目录（pricing, context windows） |
| `providerConfig` | Provider 配置（auth modes, endpoints） |
| `commands` | CLI 命令注册 |
| `hooks` | Hook 事件声明 |
| `tools` | Agent 工具声明 |
| `skills` | Skill 声明 |
| `capabilities` | 平台能力声明 |

### 1.3 Plugin 生命周期

**[F]** Plugin 加载流程（[`src/plugins/loader.ts`](../../sources/openclaw/src/plugins/loader.ts)）：

```
Discovery → 
  Manifest Validation → 
    Config Contract Matching → 
      Registration (Channel / Provider / Tool / Hook / Skill) → 
        Activation (optional, deferred loading)
```

**[F]** Plugin 类型判断（[`src/plugins/plugin-kind.types.ts`](../../sources/openclaw/src/plugins/plugin-kind.types.ts)）：

- **Channel**：消息渠道插件（Telegram, WhatsApp, Discord...）
- **Provider**：LLM 提供商插件（Anthropic, OpenAI, Google...）
- **Memory**：记忆系统插件（Active Memory, Embedding...）
- **Tool**：工具扩展插件（Browser, Canvas, Voice...）
- **Infra**：基础设施插件（Diagnostics, Bonjour...）

### 1.4 Plugin SDK

**[F]** 第三方开发者通过 `packages/plugin-sdk/` 开发插件：

- **Channel Contract**（`src/plugin-sdk/channel-contract.ts`）：Channel Plugin 必须实现的接口
- **Core API**（`src/plugin-sdk/core.ts`）：核心 API 导出
- **Runtime API**：如 `lazy-runtime`, `string-coerce-runtime`, `status-helpers` 等

**[I]** Channel Plugin 的 `createChatChannelPlugin()` 工厂模式体现了良好的扩展接口设计——每个 Channel 只需声明其配对方式、出站适配器、线程策略，Core 负责所有通用逻辑。

### 1.5 Plugin Install & ClawHub

**[F]** Plugin 安装机制（[`src/plugins/install.ts`](../../sources/openclaw/src/plugins/install.ts)）：

- **npm 安装**（[`src/plugins/install-npm.ts`](../../sources/openclaw/src/plugins/install-npm.ts)）：从 npm registry 安装
- **Git 安装**（[`src/plugins/git-install.ts`](../../sources/openclaw/src/plugins/git-install.ts)）：从 Git 仓库安装
- **ClawHub**（[`src/plugins/clawhub.ts`](../../sources/openclaw/src/plugins/clawhub.ts)）：官方 Plugin 市场
- **安全扫描**（[`src/plugins/install-security-scan.ts`](../../sources/openclaw/src/plugins/install-security-scan.ts)）：安装前安全审计

## 2. Skill System

### 2.1 架构概述

**[F]** Skill 是文件系统驱动的能力扩展：

- **54 个 Skill 目录**在 `skills/`
- 每个 Skill 是 Markdown 指令文件
- Agent 根据上下文自动选择合适的 Skill
- Skill 通过 `SkillFilter` 控制加载（[`src/auto-reply/reply/skill-filter.ts`](../../sources/openclaw/src/auto-reply/reply/)）

### 2.2 BOOT.md 机制

**[F]** BOOT.md 是 workspace 级别的启动检查（[`src/gateway/boot.ts:44-68`](../../sources/openclaw/src/gateway/boot.ts#L44-L68)）：

```
You are running a boot check. Follow BOOT.md instructions exactly.
BOOT.md:
<content>
If BOOT.md asks you to send a message, use the message tool.
After sending, reply with ONLY: __SILENT__
If nothing needs attention, reply with ONLY: __SILENT__
```

**[I]** BOOT.md 是一种 **Agent-as-Boot-Check** 模式——用 AI Agent 执行启动健康检查，灵活但依赖 LLM。

### 2.3 Remote Skills

**[F]** 远程 Skill 执行（[`src/skills/runtime/remote.ts`](../../sources/openclaw/src/skills/runtime/remote.ts)）：允许 Skill 在远程 Node 上运行，通过 `recordRemoteNodeInfo` 记录远程节点信息。

## 3. Channel Adapter Architecture

### 3.1 Channel 作为第一等 Plugin

**[F]** Channel Plugin 的核心接口由 `createChatChannelPlugin()` 定义，每个 Channel 提供：

| 能力 | 接口元素 | 示例（Telegram） |
| --- | --- | --- |
| **用户识别** | `pairing.idLabel` + `pairing.normalizeAllowEntry` | `telegramSenderId` |
| **消息发送** | `outbound` 适配器 | `createTelegramOutboundAdapter` |
| **线程管理** | `threading` 策略 | `scopedAccountReplyToMode` |
| **状态报告** | `status` 摘要 | Bot token 健康检查 |
| **设置向导** | `setup` 适配器 | Token 输入 → 配置生成 |
| **群组策略** | `groupPolicy` | 群组内需要 @提及 |
| **Approval 原生化** | `approvalCapability` | 原生按钮确认 |
| **目录服务** | `directory` adapter | 群组/联系人列表 |

### 3.2 Channel 消息流

**[F]** Channel Plugin 的消息生命周期：

1. **入站**：Webhook 或 Polling 接收 → 解析为标准化 `MsgContext`
2. **路由**：Gateway 根据 `SessionKey` 路由到正确的 Agent
3. **出站**：Agent 回复 → `outbound` 适配器发送 → 消息平台接收

### 3.3 Channel Registry

**[F]** Channel Registry 是轻量级静态注册表（[`src/channels/registry.ts:26-31`](../../sources/openclaw/src/channels/registry.ts#L26-L31)）：

```typescript
export function listRegisteredChannelPluginIds(): ChannelId[] {
  return listRegisteredChannelPluginEntries().flatMap((entry) => {
    const id = normalizeOptionalString(entry.plugin.id);
    return id ? [id as ChannelId] : [];
  });
}
```

**[F]** 严格的热路径约束：`listRegisteredChannelPluginIds()` 不加载 Channel 实现，只返回 ID 列表。

## 4. Hook System

**[F]** Hook 系统提供声明式事件监听（[`src/plugins/hooks.ts`](../../sources/openclaw/src/plugins/hooks.ts) + [`src/hooks/`](../../sources/openclaw/src/hooks/)）：

| Hook 类型 | 触发时机 |
| --- | --- |
| `before_agent_start` | Agent 开始运行前 |
| `before_agent_reply` | Agent 生成回复前 |
| `before_agent_finalize` | Agent 完成前 |
| `before_tool_call` | 工具调用执行前 |
| `after_tool_call` | 工具调用完成后 |
| `compaction_timeout` | 上下文压缩超时 |
| `channel_pairing_requested` | 新用户配对请求 |
| `inbound_message` | 入站消息接收 |
| `reply_dispatch` | 回复分发前 |

**[F]** 全局 Hook Runner（[`src/plugins/hook-runner-global.ts`](../../sources/openclaw/src/plugins/hook-runner-global.ts)）管理所有注册的 Hook。

## 5. MCP Integration

**[F]** OpenClaw 的 MCP 支持（[`src/mcp/`](../../sources/openclaw/src/mcp/)）：

- **MCP Channel Server**（[`src/mcp/channel-server.ts`](../../sources/openclaw/src/mcp/channel-server.ts)）：将 MCP 工具暴露为 Channel 工具
- **MCP Channel Bridge**（[`src/mcp/channel-bridge.ts`](../../sources/openclaw/src/mcp/channel-bridge.ts)）：Channel ↔ MCP 协议桥接
- **Plugin MCP Tools**（[`src/mcp/plugin-tools-serve.ts`](../../sources/openclaw/src/mcp/plugin-tools-serve.ts)）：Plugin 通过 MCP 暴露工具
- **OpenClaw Tools Serve**（[`src/mcp/openclaw-tools-serve.ts`](../../sources/openclaw/src/mcp/openclaw-tools-serve.ts)）：将 OpenClaw 工具暴露为 MCP 服务
- **Tools Stdio Server**（[`src/mcp/tools-stdio-server.ts`](../../sources/openclaw/src/mcp/tools-stdio-server.ts)）：Stdio 传输的 MCP 服务器
- **MCP Client**：通过 `@modelcontextprotocol/sdk` 1.29.0

**[I]** OpenClaw 主要作为 MCP Host——它整合外部 MCP 工具并在 Agent 上下文中暴露它们。同时它也可以作为 MCP Server 对外暴露自身工具。

## 6. 与 RoboThree 的相关性

| 机制 | RoboThree 映射方向 | 理由 |
| --- | --- | --- |
| **Plugin Manifest 声明式注册** | **ADOPT** | Manifest 驱动的能力声明是优秀的设计模式 |
| **Channel 作为 Plugin** | **ADAPT** | Channel 统一接口 `createChatChannelPlugin()` 可直接借鉴 |
| **文件系统 Skill** | **ADAPT** | 简易但有效的 Skill 系统，适合 MVP |
| **Hook 系统** | **ADAPT** | 声明式 Hook 适合扩展生命周期 |
| **MCP Host/Server 双模式** | **ADOPT** | MCP 是 Agent 互操作的标准协议 |
| **Plugin SDK 独立包** | **ADAPT** | 分离 SDK 包供第三方开发 |
| **BOOT.md 机制** | **DEFER** | 用 Agent 做启动检查有新意但非 MVP 必需 |
| **ClawHub 市场** | **DEFER** | Plugin 市场是生态成熟后才需要的 |
