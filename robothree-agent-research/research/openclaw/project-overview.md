# OpenClaw — Project Overview

## 1. 项目定位

**OpenClaw** 是一个开源的、自托管的个人 AI 助手平台。它不是在某个特定 Chat UI 里回答问题，而是**以本地常驻守护进程（Gateway Daemon）为中心，统一接入 20+ 消息渠道（WhatsApp、Telegram、Slack、Discord、iMessage、Signal、WeChat、QQ 等），通过可插拔的 Plugin/Channel/Provider/Skill 生态，让 AI Agent 在任何设备、任何平台上都能接收指令和执行操作**。

### 一句话定位
> Personal AI Assistant Gateway Daemon — any OS, any platform, the lobster way.

### 核心价值
- **多渠道路由**：一次配置，所有消息渠道统一由 AI Agent 处理。
- **本地优先**：Gateway 以 launchd/systemd 服务运行在用户设备上，不依赖云端。
- **插件生态**：161 extension 目录，覆盖 Channel / Provider / Tool / Memory 全部可扩展点。
- **多设备控制**：Android/iOS/macOS/Linux App 作为 Node 连接 Gateway，实现远程执行。

## 2. 技术栈

| 维度 | 技术 |
| --- | --- |
| **语言** | TypeScript（strict mode） |
| **运行时** | Node.js >= 22.22.3 \|\| >= 24.15.0 \|\| >= 25.9.0（推荐 Node 24） |
| **包管理** | pnpm workspace monorepo |
| **构建** | tsdown（自研构建工具） |
| **测试** | Vitest（colocated `*.test.ts`） |
| **数据库** | SQLite（通过 Kysely ORM） |
| **HTTP 框架** | Express 5.x |
| **WebSocket** | 原生 Node.js + 自研 JSON-RPC 协议 |
| **进程管理** | launchd (macOS) / systemd (Linux) / Windows Service |
| **CLI 框架** | Commander |
| **Schema 校验** | Zod + TypeBox |
| **格式化** | oxfmt |
| **Lint** | oxlint |

## 3. 仓库规模

| 指标 | 数值 |
| --- | --- |
| 总文件数 | ~26,661 |
| `src/` 模块数 | 114 |
| `extensions/` 目录数 | 161（121+ npm 包） |
| `packages/` 内部包数 | 25 |
| `skills/` 技能目录数 | 54 |
| `apps/` 应用数 | 10（Android / iOS / macOS / Linux / shared） |
| `scripts/` 脚本数 | 542 |
| `test/` 测试目录数 | 70 |
| `docs/` 文档目录数 | 52 |
| 核心 Gateway 实现 | `src/gateway/server.impl.ts` ~2,416 行 |
| Agent 运行时文件数 | ~1,199 |
| 总依赖数（root package.json） | 63 |

## 4. License

```
MIT License
Copyright (c) 2026 OpenClaw Foundation
```

**许可证初查结论**：
- 类型：MIT（宽松许可）
- 复用等级：`ATTRIBUTION_REQUIRED`（保留版权声明即可复用）
- 第三方代码：记录在 `THIRD_PARTY_NOTICES.md`
- 风险：MIT 许可证无商业使用限制，对 RoboThree 安全。
- 是否需要升级为完整 `license-review.md`：**否**（MIT 单一许可，无 Copyleft 风险）。

## 5. 真实入口

| 入口 | 文件 | 说明 |
| --- | --- | --- |
| **CLI Launcher** | [`openclaw.mjs`](../../sources/openclaw/openclaw.mjs) | Node 版本检查 → compile cache → 转发到 `dist/entry.js` |
| **CLI Entry** | [`src/entry.ts`](../../sources/openclaw/src/entry.ts:1-227) | 解析 argv → 应用 profile → `runMainOrRootHelp()` |
| **Package Entry** | [`src/index.ts`](../../sources/openclaw/src/index.ts:1-135) | 库导出 + CLI main 入口 |
| **CLI Dispatcher** | [`src/cli/run-main.ts`](../../sources/openclaw/src/cli/run-main.ts:1-80) | Commander 程序注册 → 路由到具体命令 |
| **Gateway Daemon** | [`src/gateway/server.impl.ts`](../../sources/openclaw/src/gateway/server.impl.ts:1-2416) | HTTP/WS 服务器启动、插件引导、配置加载 |
| **Gateway Server API** | [`src/gateway/server.ts`](../../sources/openclaw/src/gateway/server.ts:1-43) | `startGatewayServer()` 延迟加载 server.impl |

### 主要 CLI 命令

```
openclaw gateway           # 启动 Gateway Daemon（核心命令）
openclaw onboard           # 交互式设置向导
openclaw configure         # 配置管理
openclaw doctor            # 诊断与修复
openclaw plugins           # 插件管理
openclaw models            # 模型目录
openclaw sessions          # 会话管理
openclaw tasks             # 后台任务
openclaw nodes             # 设备节点管理
openclaw secrets           # 密钥管理
```

## 6. 顶层目录地图

| 目录 | 作用 |
| --- | --- |
| `src/` | **核心运行时**（114 模块）：Gateway / Agent / Channel / Plugin / Auto-Reply / Routing / Sessions / Cron / Memory / Skills / Node-Host / Pairing / MCP / Hooks / Tools |
| `extensions/` | **插件扩展**（161 目录，121+ 包）：Channel 适配器、Provider、Memory、Tool、Browser、Voice 等 |
| `packages/` | **内部共享包**（25 包）：SDK、Protocol、AI Core、LLM Core、Media Core、Memory Host SDK、Plugin SDK 等 |
| `skills/` | **技能定义**（54 目录）：文件系统驱动的 Agent Skill |
| `apps/` | **客户端应用**：Android、iOS、macOS、Linux |
| `ui/` | **Web UI 组件** |
| `scripts/` | **构建/测试/部署脚本**（542 文件） |
| `test/` | **测试目录**（70 子目录） |
| `docs/` | **文档**（52 目录） |
| `config/` | **CI/构建配置** |
| `security/` | **安全策略与审计** |
| `qa/` | **QA 场景定义**（YAML） |
| `deploy/` | **部署配置** |
| `examples/` | **使用示例** |
| `patches/` | **依赖补丁** |

## 7. 关键依赖

| 依赖 | 用途 |
| --- | --- |
| `@anthropic-ai/sdk` | Anthropic/Claude 模型 API |
| `@google/genai` | Google Gemini 模型 API |
| `@mistralai/mistralai` | Mistral 模型 API |
| `@modelcontextprotocol/sdk` | MCP 协议支持 |
| `@agentclientprotocol/sdk` | ACP（Agent Client Protocol） |
| `express` 5.x | HTTP 服务器 |
| `commander` | CLI 框架 |
| `grammy` | Telegram Bot 框架 |
| `croner` | Cron 解析 |
| `zod` | Schema 校验 |
| `chokidar` | 文件监控 |
| `execa` | 子进程管理 |
| `@lydell/node-pty` | 伪终端（PTY） |
| `@homebridge/ciao` | Bonjour/mDNS 服务发现 |

## 8. 历史研究状态

- 首次研究，无历史基线。
- 旧 Commit：N/A（首次研究）。
