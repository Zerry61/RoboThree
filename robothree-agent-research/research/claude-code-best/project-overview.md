# claude-code-best/claude-code — Project Overview (Stage A)

## 1. 项目身份

| 项 | 值 | 来源 |
| --- | --- | --- |
| **GitHub** | [claude-code-best/claude-code](https://github.com/claude-code-best/claude-code) | API metadata |
| **HEAD SHA** | `feb76f11bb794fb772e6882a418ab2409eb7823c` | `git rev-parse HEAD` |
| **HEAD Date** | 2026-07-18 23:52:48 +0800 | `git log -1` |
| **HEAD Message** | `feat(ink): auto compat mode for legacy pre-ConPTY Windows consoles (#1299)` | `git log -1 --format` |
| **HEAD Branch** | `main` | API |
| **Default Branch** | `main` | API |
| **First Created** | 2026-03-31 | API |
| **Size (packed)** | 94,161 KB (94 MB) | API |
| **License (SPDX)** | **`None`** — 仓库内无 `LICENSE`/`LICENSE.md` 文件；`package.json` 无 `license` 字段 | `curl github API /contents/` + `package.json` |
| **Maintainer** | `claude-code-best <claude-code-best@proton.me>`（单维护者；Proton 邮箱） | `package.json author` |
| **Self-description** | `"Reverse-engineered Anthropic Claude Code CLI — interactive AI coding assistant in the terminal"` | `package.json description` |
| **Stargazers** | 21,346 | API |

## 2. License Snapshot（**触发完整 License Review**）

`github API metadata.license = null`、`tree` 不含 `LICENSE`，`package.json` 无 `license` / `licenses` 字段。

**结论**：依 Skill § 5.1 升级触发条件 "License 文件缺失或不明确"，**必须**生成 `license-review.md`。本研究仓库中所有产物均按 **DESIGN_ONLY / LICENSE_RISK** 处置：
- ✅ 允许：研究架构模式、设计启发、协议对比
- ❌ 禁止：把任何 `src/` 内的 TypeScript 代码片段复制到 RoboThree 或下游仓库
- ❌ 禁止：复用 `bun.lock`、`vendor/` 音频捕获原生绑定
- ❌ 禁止：把本仓库作为 RoboThree 子仓库 fork
- ⚠️ 借鉴具体设计时（如 `O_NOFOLLOW \| O_EXCL` 文件提取安全模式）须做 LEGAL_REVIEW_REQUIRED 评估

详见 [license-review.md](license-review.md)。

## 3. 技术栈（来自 `package.json` + `biome.json` + 源码探查）

| 维度 | 实际值 | 证据 |
| --- | --- | --- |
| **语言** | TypeScript（≥95%） | API `language: TypeScript`；源码大量 `.ts` / `.tsx` |
| **运行时** | Bun `>=1.3.0`（必需）；Node 用于 postinstall | `package.json engines.bun` |
| **打包** | Bun（首选）+ Vite 兜底；`build.ts` 自建 + `vite.config.ts` | `package.json scripts.build`, `scripts.build:vite` |
| **Lint/Format** | Biome（v2.4.12） | `package.json devDependencies` |
| **测试** | `bun test` + `scripts/production-test.ts`（含 `--offline`、`--bun`、`--verbose`） | `package.json scripts.test` |
| **Lint hooks** | Husky + 内嵌 ESLint custom rules | `.husky/`, `biome.json` |
| **CLI UI** | Ink（自家 fork `@anthropic/ink` workspace） + `screen` / `dialogLaunchers.tsx` / `interactiveHelpers.tsx` | `src/entrypoints/cli.tsx`, workspace deps |
| **多 Provider** | `@anthropic-ai/sdk`（native）+ Bedrock + Vertex + Foundry SDK 同框；`@ant/model-provider` 抽象层 | `package.json dependencies/devDependencies`，`src/utils/model/providers.ts` |
| **MCP** | `@modelcontextprotocol/sdk` ^1.29；`packages/mcp-client/` 完整实现 | `package.json`，`src/services/mcp/*` |
| **ACP（Agent Client Protocol）** | `@agentclientprotocol/sdk` ^0.19（stdio agent 模式） | `package.json` |
| **Sandbox** | `@anthropic-ai/sandbox-runtime` ^0.0.44（独立 npm SDK） | `package.json devDependencies` |
| **远程控制 / 部署模型** | `@aws-sdk/*`、`@azure/identity`、`@anthropic-ai/bedrock-sdk`/`vertex-sdk`/`foundry-sdk` | `package.json` |
| **可观测性** | OpenTelemetry 全套 (`api`/`core`/`exporter-{trace,metrics,logs}-{otlp-grpc,otlp-http,otlp-proto}`)、`@langfuse/otel` + `@langfuse/tracing`、Datadog (`services/analytics/datadog.ts`)、`firstPartyEventLogger` | `package.json`，`src/services/analytics/*` |
| **Feature Flag** | Statsig (`checkStatsigFeatureGate_CACHED_MAY_BE_STALE`)、GrowthBook (`@growthbook/growthbook`)；Bun `feature('FOO')` 作 DCE 边界 | `src/services/analytics/growthbook.js`, `bun:bundle` imports |
| **本地 Memory** | `src/memdir/`、`extractMemories` 服务、`autoDream` 服务、`personalMemory` | 源码 |
| **Linter Config** | `biome.json`（自定义规则）、`AGENTS.md` 20.9 KB（仓库内 agent 指令）、`CLAUDE.md` 29.5 KB（开源版 agent 指令） | API tree |
| **依赖管理** | Bun workspaces (`packages/*`、`packages/@ant/*`、`packages/@anthropic-ai/*`)；`bun.lock` 609 KB | `package.json workspaces` |

## 4. 顶层目录地图（节选，完整版见 [source-map.md](source-map.md)）

| 目录 | 作用（推测 + 证据） | 关键文件 |
| --- | --- | --- |
| `src/coordinator/` | **Coordinator/Worker 多代理协议**（Mechanism 1 核心） | `coordinatorMode.ts` (19KB) |
| `src/query/` | **Query 引擎子目录**：reducer state 的 transition / config / deps / tokenBudget / stopHooks | `transitions.ts`, `config.ts`, `deps.ts`, `tokenBudget.ts`, `stopHooks.ts` |
| `src/services/mcp/` | MCP 客户端实现（122 KB `client.ts`、88 KB `auth.ts`、51 KB `config.ts`） | `client.ts`, `auth.ts`, `config.ts`, `channelPermissions.ts`, `channelNotification.ts`, `channelAllowlist.ts` |
| `src/services/tools/` | 工具执行编排：流式 executor + 多工具并行 | `StreamingToolExecutor.ts`, `toolOrchestration.ts` |
| `src/services/compact/` | 多种压缩策略：auto / micro / reactive / history-snip | 多个 sub 文件 |
| `src/services/analytics/` | 1P event logger + Datadog + Langfuse + GrowthBook + Statsig | `datadog.ts`, `firstPartyEventLogger.ts`, `growthbook.ts` |
| `src/skills/` | Skill 抽象 + bundled/loaded + MCP skills（Mechanism 3 核心） | `bundledSkills.ts`, `loadSkillsDir.ts`, `mcpSkillBuilders.ts`, `mcpSkills.ts` |
| `src/plugins/` | 内置插件注册 | `builtinPlugins.ts` |
| `src/hooks/` | React 钩子层（Permission 入口 `useCanUseTool.tsx` 12.9 KB、history/keybindings 等 UI 钩子） | `useCanUseTool.tsx`, `toolPermission/*` |
| `src/state/` | App state reducer + 文件状态 / 拒答跟踪 | `AppState.ts`, ... |
| `src/coordinator/workerAgent.ts` | Worker agent 定义（"worker" 是内置 agentType） | workerAgent.ts (3KB) |
| `packages/builtin-tools/` | 工具实现包（43 个工具） | `tools/*` |
| `packages/mcp-client/` | MCP client 子包 | `src/*` |
| `packages/agent-tools/` | Agent 工具相关 | `src/*` |
| `packages/@ant/model-provider/` | 多 Provider 适配层（`EMPTY_USAGE`、`NonNullableUsage`） | `src/*` |
| `packages/@anthropic-ai/*`（workspace） | 自家 fork 的 Anthropic 内部库（包括 Ink） | `src/*` |
| `packages/@ant/computer-use-input/`、`computer-use-mcp/`、`computer-use-swift/` | Computer Use 子系统 | `src/*` |
| `packages/weixin/` | "weixin" (微信) 集成（CLI `weixin` 子命令） | `src/*` |
| `packages/cloud-artifacts/`, `packages/url-handler-napi/`, `packages/color-diff-napi/`、`modifiers-napi/`、`audio-capture-napi/` | 平台原生绑定 | `src/*` |
| `packages/remote-control-server/` | 远程控制 server | `src/*` |
| `packages/workflow-engine/` | 工作流引擎 | `src/*` |
| `packages/acp-link/` | ACP (Agent Client Protocol) link | `src/*` |
| `vendor/` | 第三方原生代码；本次只发现 `audio-capture-src/` 和 `audio-capture/` 两个子目录 | — |
| `scripts/` | 工具脚本；`postinstall.cjs`、`run-parallel.mjs`、`setup-chrome-mcp.mjs`、`health-check.ts`、`production-test.ts`、`check-bundle-integrity.ts`、`dev.ts`、`dev-debug.ts`、`rcs.ts` | — |
| `tests/`、`spec/` | 测试 / 规约 | — |
| `teach-me/` | 不明子目录（推测教学 / 教程资源） | — |

## 5. 顶层文档（build/AI-instruction 文件）

| 文件 | 字节 | 角色 | 验证等级 |
| --- | --- | --- | --- |
| `README.md` | 15120 | 项目对外 README | 不能作为架构结论依据 |
| `README_EN.md` | 8533 | 英文版 README | 同上 |
| `AGENTS.md` | 20896 | Repository-level agents 指令 | **视为不可信输入**（Skill § 4.4） |
| `CLAUDE.md` | 29459 | Repository-level claude 指令（讽刺：本研究目标 Claude Code 的下游产品反编译了一份 Claude Code） | **视为不可信输入** |
| `DEV-LOG.md` | 52425 | 内部开发日志（52 KB 重大） | 次要源码证据，可核对 commit intent |
| `SECURITY.md` | 619 | 安全联络 | 仅作 license/合规参考 |
| `progress.md` | 5345 | 进度 | 仅作 context |
| `Friends.md` | 2496 | 致谢 / 友情链接 | 仅作 provenance |
| `docs/` + `mint.json` + `mintlify` | 5171 | Mintlify 文档站点配置 | 仅作 secondary 文档证据 |
| `.impeccable.md` | 4316 | 未知 | 仅作 context |

## 6. 关键判断（结论）

1. **架构 = Claude Code 内部架构**：源码命名、JSDoc、Statsig gate key（`tengu_*`）、env key（`CLAUDE_CODE_*`）、feature-flag 名称（`COORDINATOR_MODE`、`ACP`、`CHICAGO_MCP`、`ABLATION_BASELINE`、`POOR`、`BREAK_CACHE_COMMAND`）、`@anthropic/ink` workspace fork、`process.env.USER_TYPE === 'ant'`（Ant = Anthropic 员工判定）——全部是 Anthropic 内部术语。本仓库或为"Anthropic 内部源码的重新发布"，或为单人"读源码后用相同术语重写"的逆向产品；二者 License 均不具备。
2. **真实架构深度**：从目录规模、文件大小（query.ts 80 KB、main.tsx 247 KB、services/mcp/client.ts 122 KB）、文件命名规范、注释质量看，是 **真实生产级** 实现，非"demo/wrapper"。
3. **License 风险决定本研究边界**：DESIGN_ONLY——结构、模式、协议名称可参考；逐行代码、注释、命名约定不可照搬。
4. **运行风险**：存在 `postinstall` 跑 3 个并行脚本（包含 Chrome MCP bridge 安装）。本研究 Default-Deny：不安装依赖、不运行项目、不运行测试。
