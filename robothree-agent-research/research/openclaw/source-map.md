# OpenClaw — Source Map

## 1. Core Runtime（`src/` — 114 模块）

### 1.1 Gateway Daemon（`src/gateway/`）

| 文件/目录 | 作用 |
| --- | --- |
| [`server.impl.ts`](../../sources/openclaw/src/gateway/server.impl.ts) (~2,416 lines) | **Gateway 服务器的核心实现**：HTTP/WS 启动、配置加载、插件引导、Cron 调度、健康检查、Auth 设置、TLS、重启追踪 |
| [`server.ts`](../../sources/openclaw/src/gateway/server.ts:1-43) | `startGatewayServer()` 公开 API，延迟加载 server.impl |
| [`boot.ts`](../../sources/openclaw/src/gateway/boot.ts:1-120) | BOOT.md 执行器：Gateway 启动时在 workspace 中运行 BOOT.md |
| [`call.ts`](../../sources/openclaw/src/gateway/call.ts) | Gateway 调用处理 |
| [`client.ts`](../../sources/openclaw/src/gateway/client.ts) | Gateway 客户端（CLI/TUI 连接） |
| [`auth.ts`](../../sources/openclaw/src/gateway/auth.ts) | Gateway 认证/授权 |
| [`server-methods/`](../../sources/openclaw/src/gateway/server-methods/) | JSON-RPC 方法实现（~100+ 个 RPC 方法） |
| [`methods/`](../../sources/openclaw/src/gateway/methods/) | 方法注册表与描述符 |

### 1.2 Channels（`src/channels/`）

| 文件/目录 | 作用 |
| --- | --- |
| [`registry.ts`](../../sources/openclaw/src/channels/registry.ts:1-64) | Channel 注册表 facade，不加载实现 |
| [`plugins/types.core.ts`](../../sources/openclaw/src/channels/plugins/types.core.ts:1-875) | **Channel Plugin 核心类型**：`ChannelMeta`, `ChannelSetupInput`, `ChannelAgentTool`, `ChannelMessageToolSchema` 等 |
| [`plugins/`](../../sources/openclaw/src/channels/plugins/) | Channel Plugin 注册表实现 |
| [`session.ts`](../../sources/openclaw/src/channels/session.ts) | Channel Session 管理 |
| [`message/`](../../sources/openclaw/src/channels/message/) | 消息规范化 |
| [`transport/`](../../sources/openclaw/src/channels/transport/) | 传输层 |
| [`allowlists/`](../../sources/openclaw/src/channels/allowlists/) | 白名单匹配 |
| [`inbound-event/`](../../sources/openclaw/src/channels/inbound-event/) | 入站事件类型 |
| [`status/`](../../sources/openclaw/src/channels/status/) | Channel 状态管理 |

### 1.3 Agent Runtime（`src/agents/` — ~1,199 文件）

| 文件/目录 | 作用 |
| --- | --- |
| `agent-run.ts` | Agent 运行主循环实现 |
| `agent-scope.ts` | Agent 作用域（workspace、工具策略） |
| `tool-policy.ts` | 工具策略匹配 |
| `model-selection.ts` | 模型选择逻辑 |
| `identity.ts` | Agent 身份解析 |
| `workspace.ts` | Agent workspace 管理 |
| `bash-process-registry.ts` | Bash 进程注册表（活跃 session 追踪） |
| `acp-spawn.ts` | ACP 子进程生成 |
| `embedded-agent-runner/` | 嵌入式 Agent Runner |
| `agent-run-terminal-outcome.ts` | Agent 运行终端结果归一化 |
| `runtime/` | Agent Runtime 索引 |
| `tools/` | Agent 内置工具 |

### 1.4 Auto-Reply Pipeline（`src/auto-reply/`）

| 文件 | 行数 | 作用 |
| --- | --- | --- |
| [`dispatch.ts`](../../sources/openclaw/src/auto-reply/dispatch.ts) | ~746 | **消息分发编排**：hook 组合、foreground delivery fencing |
| [`reply/get-reply.ts`](../../sources/openclaw/src/auto-reply/reply/get-reply.ts) | ~1,085 | **主 Auto-Reply 管道**：上下文准备、命令运行、Agent 调度 |
| [`reply/dispatch-from-config.ts`](../../sources/openclaw/src/auto-reply/reply/dispatch-from-config.ts) | ~2,937 | 从 final config/context 到 delivery payloads 的主分发管道 |
| [`reply.runtime.ts`](../../sources/openclaw/src/auto-reply/reply.runtime.ts:1-3) | Runtime barrel：`getReplyFromConfig` |

### 1.5 Plugin System（`src/plugins/`）

| 文件/目录 | 作用 |
| --- | --- |
| [`loader.ts`](../../sources/openclaw/src/plugins/loader.ts) | Plugin 加载器入口 |
| [`registry.ts`](../../sources/openclaw/src/plugins/registry.ts) | Plugin 注册表入口 |
| [`runtime.ts`](../../sources/openclaw/src/plugins/runtime.ts) | Plugin 运行时 |
| [`manifest.ts`](../../sources/openclaw/src/plugins/manifest.ts) | Plugin Manifest 解析 |
| [`install.ts`](../../sources/openclaw/src/plugins/install.ts) | Plugin 安装 |
| [`hooks.ts`](../../sources/openclaw/src/plugins/hooks.ts) | Plugin Hook 系统 |
| [`commands.ts`](../../sources/openclaw/src/plugins/commands.ts) | Plugin 命令注册 |
| [`bundled-dir.ts`](../../sources/openclaw/src/plugins/bundled-dir.ts) | 内置 Plugin 目录 |
| [`bundled-sources.ts`](../../sources/openclaw/src/plugins/bundled-sources.ts) | 内置 Plugin 来源 |
| [`clawhub.ts`](../../sources/openclaw/src/plugins/clawhub.ts) | ClawHub 市场集成 |
| `runtime/` | Plugin Runtime 子模块 |

### 1.6 Routing（`src/routing/`）

| 文件 | 作用 |
| --- | --- |
| [`session-key.ts`](../../sources/openclaw/src/routing/session-key.ts) | **SessionKey 生成与连续性**：`channel:account:conversation` 三段式 |
| [`resolve-route.ts`](../../sources/openclaw/src/routing/resolve-route.ts) | 路由解析 |
| [`bindings.ts`](../../sources/openclaw/src/routing/bindings.ts) | 会话绑定 |
| [`channel-route-targets.ts`](../../sources/openclaw/src/routing/channel-route-targets.ts) | 渠道路由目标 |

### 1.7 Sessions（`src/sessions/`）

| 文件 | 作用 |
| --- | --- |
| [`session-id.ts`](../../sources/openclaw/src/sessions/session-id.ts) | Session ID 生成 |
| [`session-lifecycle-admission.ts`](../../sources/openclaw/src/sessions/session-lifecycle-admission.ts) | Session 生命周期准入 |
| [`conversation-turns.ts`](../../sources/openclaw/src/sessions/conversation-turns.ts) | 对话轮次管理 |
| [`transcript-events.ts`](../../sources/openclaw/src/sessions/transcript-events.ts) | Session 转录事件 |
| [`user-turn-transcript.ts`](../../sources/openclaw/src/sessions/user-turn-transcript.ts) | 用户轮次转录 |

### 1.8 Memory（`src/memory/`）

| 文件 | 作用 |
| --- | --- |
| [`root-memory-files.ts`](../../sources/openclaw/src/memory/root-memory-files.ts) | Memory 文件管理 |

### 1.9 Background Tasks / Cron（`src/cron/`）

| 文件 | 作用 |
| --- | --- |
| [`service.ts`](../../sources/openclaw/src/cron/service.ts) | **Cron Service 主实现**：SQLite 存储，job 调度 |
| [`store.ts`](../../sources/openclaw/src/cron/store.ts) | Cron Job 数据存储 |
| [`schedule.ts`](../../sources/openclaw/src/cron/schedule.ts) | 调度逻辑 |
| [`delivery.ts`](../../sources/openclaw/src/cron/delivery.ts) | 任务分发 |
| [`isolated-agent.ts`](../../sources/openclaw/src/cron/isolated-agent.ts) | 隔离 Agent 执行 |
| [`session-reaper.ts`](../../sources/openclaw/src/cron/session-reaper.ts) | Session 清理 |

### 1.10 Node Host / Device（`src/node-host/`）

| 文件 | 作用 |
| --- | --- |
| [`client.ts`](../../sources/openclaw/src/node-host/client.ts) | Node 客户端连接 |
| [`runtime.ts`](../../sources/openclaw/src/node-host/runtime.ts) | Node 运行时 |
| [`invoke.ts`](../../sources/openclaw/src/node-host/invoke.ts) | 远程调用执行 |
| [`worker.ts`](../../sources/openclaw/src/node-host/worker.ts) | Node Worker 管理 |
| [`runner.ts`](../../sources/openclaw/src/node-host/runner.ts) | 命令执行 Runner |
| [`mcp.ts`](../../sources/openclaw/src/node-host/mcp.ts) | Node MCP 桥接 |
| [`skills.ts`](../../sources/openclaw/src/node-host/skills.ts) | Node 技能管理 |
| [`invoke-agent-cli-claude.ts`](../../sources/openclaw/src/node-host/invoke-agent-cli-claude.ts) | 通过 Claude CLI 在 Node 上执行 |

### 1.11 Pairing（`src/pairing/`）

| 文件 | 作用 |
| --- | --- |
| [`pairing-challenge.ts`](../../sources/openclaw/src/pairing/pairing-challenge.ts) | **配对挑战-应答机制** |
| [`pairing-store.ts`](../../sources/openclaw/src/pairing/pairing-store.ts) | 配对状态存储 |
| [`pairing-store-sqlite.ts`](../../sources/openclaw/src/pairing/pairing-store-sqlite.ts) | SQLite 配对存储 |
| [`setup-code.ts`](../../sources/openclaw/src/pairing/setup-code.ts) | 设置码生成/验证 |

### 1.12 Skills（`src/skills/` + `skills/` 根目录）

| 文件/目录 | 作用 |
| --- | --- |
| [`skills/runtime/`](../../sources/openclaw/src/skills/) | Skill 运行时 |
| [`skills/` (root, 54 dirs)](../../sources/openclaw/skills/) | **文件系统驱动的 Skill 定义** |
| BOOT.md（per-workspace）| Gateway 启动时执行的启动检查 |

### 1.13 MCP（`src/mcp/`）

| 文件 | 作用 |
| --- | --- |
| [`channel-server.ts`](../../sources/openclaw/src/mcp/channel-server.ts) | MCP Channel Server |
| [`channel-bridge.ts`](../../sources/openclaw/src/mcp/channel-bridge.ts) | MCP Channel 桥接 |
| [`openclaw-tools-serve.ts`](../../sources/openclaw/src/mcp/openclaw-tools-serve.ts) | MCP Tools Server |
| [`plugin-tools-serve.ts`](../../sources/openclaw/src/mcp/plugin-tools-serve.ts) | Plugin MCP Tools Server |

### 1.14 Hooks（`src/hooks/`）

| 文件 | 作用 |
| --- | --- |
| [`hooks.ts`](../../sources/openclaw/src/hooks/hooks.ts) | Hook 入口 |
| [`loader.ts`](../../sources/openclaw/src/hooks/loader.ts) | Hook 加载器 |
| [`internal-hooks.ts`](../../sources/openclaw/src/hooks/internal-hooks.ts) | 内部 Hook 类型 |
| [`message-hooks.ts`](../../sources/openclaw/src/hooks/message-hooks.ts) | 消息 Hook |
| [`plugin-hooks.ts`](../../sources/openclaw/src/hooks/plugin-hooks.ts) | Plugin Hook 集成 |

### 1.15 Worker（`src/worker/`）

| 文件 | 作用 |
| --- | --- |
| [`worker.runtime.ts`](../../sources/openclaw/src/worker/worker.runtime.ts) | Worker 运行时 |
| [`embedded-agent.runtime.ts`](../../sources/openclaw/src/worker/embedded-agent.runtime.ts) | 嵌入式 Agent Worker |
| [`worker-connection.ts`](../../sources/openclaw/src/worker/worker-connection.ts) | Worker 连接管理 |
| [`worker-rpc-clients.ts`](../../sources/openclaw/src/worker/worker-rpc-clients.ts) | Worker RPC 客户端 |

### 1.16 Provider Runtime（`src/provider-runtime/`）

LLM Provider 抽象层，统一管理 Anthropic/OpenAI/Google/Mistral 等多 Provider。

### 1.17 Fleet（`src/fleet/`）

多实例 fleet 管理：备份、容器、健康检查、服务管理。

### 1.18 Other Key Modules

| 目录 | 作用 |
| --- | --- |
| `src/config/` | 配置系统（`openclaw.json`） |
| `src/llm/` | LLM 调用抽象 |
| `src/context-engine/` | Context 组装引擎 |
| `src/secrets/` | 凭据管理 |
| `src/security/` | 安全策略 |
| `src/infra/` | 基础设施（网络、进程管理） |
| `src/logging/` | 日志系统 |
| `src/daemon/` | 守护进程管理（launchd/systemd） |
| `src/cli/` | CLI 命令实现 |
| `src/tui/` | Terminal UI |
| `src/interactive/` | 交互式消息 payload |
| `src/acp/` | Agent Client Protocol 实现 |
| `src/bindings/` | 会话绑定记录 |
| `src/bootstrap/` | 启动引导 |
| `src/commands/` | 命令定义（`/reset`, `/new` 等） |
| `src/library.ts` | 公开库 API |

## 2. Extensions（`extensions/` — 161 目录）

### 2.1 Channel Adapters（消息渠道）

| Extension | 作用 |
| --- | --- |
| `telegram` | Telegram Bot |
| `whatsapp` | WhatsApp (Baileys) |
| `discord` | Discord Bot |
| `slack` | Slack Bot |
| `signal` | Signal |
| `imessage` | iMessage (macOS) |
| `googlechat` | Google Chat |
| `msteams` | Microsoft Teams |
| `matrix` | Matrix |
| `line` | LINE |
| `irc` | IRC |
| `webchat` | Web Chat (内置) |
| + WeChat, QQ, Zalo, Feishu, Nostr, Twitch, Tlon, Synology Chat, Mattermost, Nextcloud Talk |

### 2.2 Providers（LLM 提供商）

| Extension | 作用 |
| --- | --- |
| `anthropic` | Anthropic Claude |
| `openai` | OpenAI GPT |
| `google` | Google Gemini |
| `mistral` | Mistral AI |
| `deepseek` | DeepSeek |
| `cohere` | Cohere |
| `cerebras` | Cerebras |
| `groq` | Groq |
| `amazon-bedrock` | AWS Bedrock |
| `copilot-proxy` | GitHub Copilot |
| `cloudflare-ai-gateway` | Cloudflare AI Gateway |
| `codex` | OpenAI Codex CLI |

### 2.3 Other Extensions

| 类别 | Extensions |
| --- | --- |
| **Browser** | `browser`（Playwright 浏览器自动化） |
| **Voice** | `azure-speech`, `deepgram`, `elevenlabs` |
| **Memory** | `active-memory` |
| **Device** | `device-pair`（设备配对）, `bonjour`（服务发现） |
| **Tools** | `canvas`, `diffs`, `document-extract`, `brave` |
| **Infra** | `diagnostics-otel`, `diagnostics-prometheus` |

## 3. Internal Packages（`packages/` — 25 包）

| Package | 作用 |
| --- | --- |
| `gateway-protocol` | Gateway JSON-RPC 协议定义 |
| `gateway-client` | Gateway WebSocket 客户端 |
| `agent-core` | Agent 核心抽象 |
| `llm-core` | LLM 调用核心 |
| `ai` | AI 高层抽象 |
| `plugin-sdk` | Plugin 开发 SDK |
| `plugin-package-contract` | Plugin 包契约 |
| `acp-core` | Agent Client Protocol 核心 |
| `sdk` | 公开 SDK |
| `markdown-core` | Markdown 处理 |
| `media-core` | 媒体处理 |
| `normalization-core` | 字符串/数据规范化 |
| `memory-host-sdk` | Memory Host SDK |
| `model-catalog-core` | 模型目录核心 |
| `net-policy` | 网络策略 |
| `terminal-core` | 终端核心 |
| `speech-core` | 语音核心 |
| `tool-call-repair` | Tool Call 修复 |
| `web-content-core` | Web 内容提取 |
| `retry` | 重试策略 |
| `workboard-contract` | Workboard 契约 |

## 4. Apps（`apps/` — 10 个应用）

| App | 平台 | Key Modules |
| --- | --- | --- |
| `android/` | Android | Gradle, Kotlin, Jetpack Compose |
| `ios/` | iOS | SwiftUI (Observation framework) |
| `macos/` | macOS | SwiftUI Menu Bar App |
| `macos-mlx-tts/` | macOS | MLX Text-to-Speech |
| `linux/` | Linux | Tauri/Electron |
| `shared/` | Cross-platform | Shared code |
| `swabble/` | Cross-platform | Swabble tool |

## 5. Skills Directory（`skills/` — 54 目录）

文件系统驱动的技能定义，每个 Skill 是一个目录，包含 .md 指令文件。示例 Skill：`agent-transcript`, `autoreview`, `channel-message-flows`, `claw-score` 等。

## 6. 关键配置文件

| 文件 | 作用 |
| --- | --- |
| `openclaw.json` (in `~/.openclaw/`) | 主配置文件 |
| `BOOT.md` (per workspace) | 启动检查指令 |
| `auth-profiles.json` | Agent 认证配置 |
| `openclaw.sqlite` | 全局运行时状态（SQLite） |
| `openclaw-agent.sqlite` | Per-agent 状态 |
| `openclaw.mjs` | CLI Launcher 入口 |
| `package.json` | 版本 `2026.7.2` |
| `tsdown.config.ts` | 构建配置 |

## 7. 测试架构

| 目录 | 作用 |
| --- | --- |
| `src/**/*.test.ts` | 单元/集成测试（colocated） |
| `src/**/*.e2e.test.ts` | E2E 测试 |
| `test/` | 70 个子目录的测试辅助 |
| `qa/scenarios/` | YAML QA 场景定义 |
| `extensions/**/` | 每个 extension 包含自己的测试 |
