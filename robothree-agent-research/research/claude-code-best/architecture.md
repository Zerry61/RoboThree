# claude-code-best/claude-code — Architecture Overview

> 本文档含 **Permission / Security** 主段落（Skill § 5.3 强制 — Level 2 必须检查，可写在主报告或独立文档）。本仓库选择写在主报告 `architecture.md`。

## 0. 顶层架构（一句话）

> **Bun + Ink + React CLI 进程内**一个 **`QueryEngine` 实例**，每个 turn 调用 `query()` AsyncGenerator，沿 `Terminal ∪ Continue` state machine 推进；可选 **Coordinator mode** 把同一个进程内的一个 session 升级成 `worker` subagent 的多代理协调者；**Permission** 由 `useCanUseTool.tsx` + `ToolPermissionContext` 在工具调用前阻塞式拦截；**MCP** 走 in-process 客户端 + transport/permission/notification 三件套；**Skill** 抽象统一 bundled + loaded（disk）+ mcp（远程）三源。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  CLI Process (Bun + Ink + React)                         │
│                                                                          │
│  ┌────────────┐    ┌────────────────┐    ┌──────────────────────────┐  │
│  │ main.tsx   │ →  │ QueryEngine    │ →  │  query() AsyncGenerator  │  │
│  │ (bootstrap │    │ (1 per conv.)  │    │  src/query.ts            │  │
│  │  ink Root) │    │ src/QueryEngine│    │                          │  │
│  └────────────┘    └────────────────┘    └────────┬─────────────────┘  │
│       │                                            │                     │
│       │                          canUseTool         │                     │
│       │                                            ▼                     │
│       │                            ┌──────────────────────────┐         │
│       │                            │  Tool Registry (43+)     │         │
│       │                            │  src/tools.ts            │         │
│       │                            └────────┬─────────────────┘         │
│       │                                     │                            │
│       ▼                                     ▼                            │
│  ┌───────────────────────────────────────────────────────────┐         │
│  │           Permission 闸门 (useCanUseTool.tsx)              │         │
│  │  ToolPermissionContext:                                   │         │
│  │   - mode, alwaysAllow/alwaysDeny/alwaysAsk                 │         │
│  │   - shouldAvoidPermissionPrompts (background agents)      │         │
│  │   - awaitAutomatedChecksBeforeDialog (coordinator workers)│         │
│  └───────────────────────────┬───────────────────────────────┘         │
│                              ▼                                          │
│                   ┌────────────────────────┐                          │
│                   │ StreamingToolExecutor  │                          │
│                   │ + runTools orchestration│                          │
│                   └────────┬───────────────┘                          │
│                            ▼                                            │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ MCP Services Layer                                             │    │
│  │  • InProcessTransport / SdkControlTransport                    │    │
│  │  • MCPConnectionManager + client.ts (122KB) + auth.ts (88KB)   │    │
│  │  • channelPermissions / channelAllowlist / channelNotification │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Skill System                                                    │    │
│  │  • bundledSkills (registry) — bundledSkills.ts                  │    │
│  │  • loadSkillsDir (file-based, 34KB)                             │    │
│  │  • mcpSkillBuilders + mcpSkills (remote MCP skills)             │    │
│  │  • Each skill = Command { type:'prompt', allowedTools, hooks }  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Plugin System (parallel to Skill) — src/plugins + pluginLoader  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Coordinator / Worker (optional, feature-gated)                  │    │
│  │  • getCoordinatorSystemPrompt() — 5-section protocol            │    │
│  │  • getCoordinatorAgents() → [WORKER_AGENT]                      │    │
│  │  • Worker tools = ASYNC_AGENT_ALLOWED_TOOLS - internal          │    │
│  │  • <task-notification> XML protocol                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Hooks (Stop / TaskCompleted / TeammateIdle / PostSampling)      │    │
│  │  src/utils/hooks.ts + src/query/stopHooks.ts                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ State + Storage                                                │    │
│  │  • AppState reducer (src/state/AppState.ts)                     │    │
│  │  • Session storage (src/utils/sessionStorage.ts)                │    │
│  │  • File history (src/utils/fileHistory.ts)                      │    │
│  │  • memdir (local memory dir) + extractMemories + autoDream      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Observability                                                  │    │
│  │  • OpenTelemetry (api/core/exporters) — feature-gated strings   │    │
│  │  • Langfuse spans (services/langfuse)                           │    │
│  │  • Datadog + 1P event logger (services/analytics/)              │    │
│  │  • Statsig + GrowthBook (gates — NOT DCE, runtime)              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Model Provider Abstraction (@ant/model-provider workspace)      │    │
│  │  • Anthropic native / Bedrock / Vertex / Foundry                │    │
│  │  • EMPTY_USAGE, NonNullableUsage unified                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1. Entry Points

| 入口 | 文件 | 职责 |
| --- | --- | --- |
| `claude-code-best` / `ccb` CLI | `src/main.tsx` | Commander + Ink 渲染 + REPL 启动 |
| One-shot `-p` or SDK | `src/QueryEngine.ts` `QueryEngine.submitMessage()` | headless 路径，无 Ink |
| ACP stdio agent | `src/entrypoints/cli.tsx` `--acp` fast path → `runAcpAgent()` | 把 CLI 包成 ACP server over stdio |
| MCP server (`--claude-in-chrome-mcp`) | `src/entrypoints/cli.tsx` → `runClaudeInChromeMcpServer()` | CLI 当 MCP server |
| Computer Use MCP (`--computer-use-mcp`) | `src/entrypoints/cli.tsx` → `runComputerUseMcpServer()` | 同上，CU 专属 |
| `weixin` 子命令 | `src/entrypoints/cli.tsx` → `handleWeixinCli()` | 微信集成（feature 之一） |
| `--version/-v/-V` | `src/entrypoints/cli.tsx` 早期 fast path | 0 模块加载直接打版本号 |

## 2. Query Loop 真实形态（高层）

```text
query(params) → AsyncGenerator<…, Terminal>
│
├── on entry:
│   ├── 1. Langfuse: own trace or inherit from sub-agent context
│   ├── 2. autocompute QueryConfig (immutable snapshot)
│   ├── 3. productionDeps() (DI for tests)
│   ├── 4. Init QueueMetrics, autonomyy queue, message queue
│   └── 5. createBudgetTracker()
│
├── loop iteration:
│   ├── 1. tool discovery: getTools() → Options.tools
│   ├── 2. guard: shouldAvoidPermissionPrompts / awaitAutomatedChecks
│   ├── 3. autocompact if needed → microcompact
│   ├── 4. callModel(params.deps.callModel) → AssistantMessage
│   ├── 5. parse tool_use blocks → ToolUseBlock[]
│   ├── 6. Permission check via canUseTool (useCanUseTool.tsx)
│   ├── 7. StreamingToolExecutor.run / runTools(toolUseContext)
│   │   ├── state write (append assistant + tool_result to messages)
│   │   └── yield ToolUseSummaryMessage
│   ├── 8. ExecuteStopHooks (Stop → TaskCompleted → TeammateIdle)
│   │   ├── collect blockingErrors, hookErrors, hookInfos
│   │   └── handle preventContinuation
│   ├── 9. checkTokenBudget(BudgetTracker, agentId, …) → Continue | Stop
│   └── 10. yield to outer caller
│
├── on Terminal:
│   └── flushLangfuse() → close trace
└── return Terminal
```

**关键调用链**：见 [runtime-sequence.md §Hop Evidence](runtime-sequence.md#hop-evidence) 与 Mermaid 图。

## 3. Coordinator / Worker 多代理架构

> 详见 [coordinator-deep-dive.md](coordinator-deep-dive.md)。此处为摘要。

- **触发**：`feature('COORDINATOR_MODE')` AND `process.env.CLAUDE_CODE_COORDINATOR_MODE` 显式开启（默认关闭）
- **角色分化**：Coordinator 持有 `AGENT_TOOL_NAME` + `SEND_MESSAGE_TOOL_NAME` + `TASK_STOP_TOOL_NAME`，Worker 只持有标准工具集（`ASYNC_AGENT_ALLOWED_TOOLS` − internal orchestration tools）
- **协议**：Worker 结果以 `<task-notification>` XML 形式注入 Coordinator 用户消息流
- **System Prompt**：`getCoordinatorSystemPrompt()` 是 5 段完整定义：① 角色（"orchestrates software engineering tasks across multiple workers"）② 工具（spawn/continue/stop）③ Worker 结果格式 ④ Task Workflow（Research/Synthesis/Implementation/Verification 四阶段）⑤ Worker Prompt Writing（"Always synthesize — your most important job"）
- **Worker 配置**：`WORKER_AGENT` 是单一内置 agentType `worker`，完整工具列表 = filter(`ASYNC_AGENT_ALLOWED_TOOLS`, !INTERNAL_ORCHESTRATION_TOOLS)
- **协议示例**（在 prompt 中）：Worker 结果形如 `<task-notification><task-id>agent-a1b</task-id><status>completed</status>...`

## 4. Tool Runtime（Mechanism 2 摘要）

> 详见 [tool-system-deep-dive.md](tool-system-deep-dive.md)。

**Tool 类型**：
- `ToolInputJSONSchema`（`src/Tool.ts:16`）— 标准 JSON Schema for tool input
- `Tool`（interface）— 每个工具实例暴露 `name`、`input_schema`、`call(args, context)`、`validateInput()`、`description`、`allowedTools?`、`isEnabled()?`
- 43+ 内置工具在 `src/tools.ts` 通过 `getTools()` 注册

**ToolUseContext**（`src/Tool.ts:149`）— 每个工具调用携带的 30+ 字段 context：
- `options` 子结构（commands/debug/mainLoopModel/tools/mcpClients/mcpResources/agentDefinitions/maxBudgetUsd/customSystemPrompt/appendSystemPrompt/querySource/refreshTools/allowBackgroundForkedSlashCommands）
- `abortController: AbortController`（单次 tool 调用可取消）
- `getAppState()`, `setAppState(f)`（reducer 触达）
- `setAppStateForTasks(f)`（永远触达 root store，与 sub-agent 隔离的"基础设施"）
- `setToolJSX(fn)`（REPL-specific UI）
- `handleElicitation(serverName, params, signal)`（MCP `-32042` URL elicitation）
- `agentId?: AgentId`、`agentType?: string`（仅 sub-agent 设置）
- `nestedMemoryAttachmentTriggers: Set<string>`、`loadedNestedMemoryPaths: Set<string>`（CLAUDE.md dedup）
- `setInProgressToolUseIDs`、`setHasInterruptibleToolInProgress`、`setResponseLength`
- `pushApiMetricsEntry?`（Ant 内部指标）
- `langfuseTrace?: LangfuseSpan`（per-Query span 透传）
- `updateFileHistoryState`、`updateAttributionState`

**特征**：
1. **常量化**：每个工具名都是常量 export（`BASH_TOOL_NAME`、`FILE_EDIT_TOOL_NAME`、...），不再以字符串字面量出现
2. **Tool 白/黑名单**：`ASYNC_AGENT_ALLOWED_TOOLS`、`COORDINATOR_MODE_ALLOWED_TOOLS`、`ALL_AGENT_DISALLOWED_TOOLS`、`CUSTOM_AGENT_DISALLOWED_TOOLS` 抽离到 `src/constants/tools.ts`
3. **Feature-gated require pattern**：用 Bun 的 `feature('FOO')` + `require()` 做 DCE（dead code elimination），外部构建不会包含被标记为内部特性的模块
4. **Lazy require 破循环依赖**：`getTeamCreateTool`、`getTeamDeleteTool`、`getSendMessageTool`、`getPowerShellTool` 用 lazy require 引入，避免 circular dependency
5. **TOOL_PRESETS**：`['default']`，可拓展，支持 `--tools` CLI flag

## 5. Skill 系统（Mechanism 3 摘要）

> 详见 [skill-plugin-mcp-deep-dive.md](skill-plugin-mcp-deep-dive.md)。

**统一抽象**：`BundledSkillDefinition = { name, description, aliases, whenToUse, argumentHint, allowedTools, model, disableModelInvocation, userInvocable, hooks, context: 'inline'|'fork', agent, files: Record<string,string>, getPromptForCommand }`

**三类来源**：
1. **Bundled** — `bundledSkills.ts` 进程内 registry，`registerBundledSkill()` 注册
2. **Loaded from disk** — `loadSkillsDir.ts`（34KB），扫描 `.claude/skills/`、`<cwd>/.claude/skills/` 等
3. **MCP-sourced** — `mcpSkillBuilders.ts` + `mcpSkills.ts`，把 MCP server 的 `resources/read` 或 `tools/list` 包装成 Skill

**安全提取**（重要设计）：
- per-process nonce dir（`getBundledSkillsRoot()` 含 nonce）
- `0o700` dir mode、`0o600` file mode（即使 umask=0 也仅 owner 可写）
- `O_NOFOLLOW | O_WRONLY | O_CREAT | O_EXCL` flags（防 symlink 攻击）
- `resolveSkillFilePath()` 拒绝 `..` / 绝对路径（防 path traversal）
- 不 unlink+retry on EEXIST（`unlink()` 跟随 symlink，加剧攻击面）

## 6. Plugin + MCP 生态（Mechanism 3 摘要）

**Plugin System**：
- `src/plugins/builtinPlugins.ts`（5KB）注册内建插件
- `src/utils/plugins/pluginLoader.ts`（被 `QueryEngine.ts` import: `loadAllPluginsCacheOnly`）
- 推断包含子包内的 custom plugins（推测）

**MCP 系统**：
- `src/services/mcp/client.ts`（122KB）— 主客户端实现
- `src/services/mcp/auth.ts`（88KB）— OAuth / Token 认证
- `src/services/mcp/config.ts`（51KB）— MCP server 配置 / 注册
- Transport：InProcess（同进程）+ SdkControlTransport（推测 SDK 控制桥）
- 权限：
  - `channelPermissions.ts`（9KB）— 频道（用户/项目/会话）维度权限
  - `channelAllowlist.ts`（2.8KB）— 允许的 channel 列表
  - `channelNotification.ts`（10KB）— MCP `notifications/permissions/decision-request`
- 协议：MCP `tools/list`、`tools/call`、`resources/list`、`resources/read`、`-32042` elicitations

## 7. Hook Lifecycle

详见 `coordinator-deep-dive.md` § Hook Orchestration。摘要：

| Hook 触发点 | 文件 | 行为 |
| --- | --- | --- |
| `Stop` | `src/query/stopHooks.ts:62` `handleStopHooks()` | main turn 终止前 |
| `TaskCompleted` | `src/query/stopHooks.ts:347` (via `executeTaskCompletedHooks`) | Teammate 视角 |
| `TeammateIdle` | `src/query/stopHooks.ts:415` (via `executeTeammateIdleHooks`) | Teammate 视角 |
| `PreCompact` / `PostCompact` / `SessionStart` | 推测在 `src/utils/hooks.ts` | Compact 时机 |
| `PostSampling` | `src/query.ts:103` (`executePostSamplingHooks`) | 每样本后 |
| `StopFailure` | `src/query.ts:104` (`executeStopFailureHooks`) | Stop 失败 |
| `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `PreCompact`, `PostCompact`, `SessionStart`, `SessionEnd` | 推测在 Claude Code 官方 hooks 协议 | 标准 hooks |

每个 hook event 可：
- `yield progress messages`（UI 进度显示，hit `stopHookToolUseID`）
- 累计 `durationMs`（per-hook 计时）
- 返回 `blockingError`（累积进 `hookErrors[]`）
- 抛 `preventContinuation`（`hook_stopped_continuation` attachment）
- 抛 abort（abortController.signal.aborted → 立即终止）

## 8. Permission & Security 主报告

### 8.1 进程模型

- **单进程**（Bun 进程内多 agent 通过 conversation 隔离）——没有 sandbox 进程级隔离的硬证据，但有 `@anthropic-ai/sandbox-runtime` 作为 devDependency 表示外部工具可能在 sandbox 内执行
- **In-process transport**：MCP 同进程 server 通过 `InProcessTransport` 直连（推测给 RouterTool、CRS 等内部 server 用）

### 8.2 Permission Decision 路径

```text
Model emits tool_use block
  → runTools / StreamingToolExecutor
  → canUseTool(args, tool, context)
      ├─ ToolPermissionContext
      │   ├─ mode: 'default'|'acceptEdits'|'bypassPermissions'|'plan'|...
      │   ├─ alwaysAllowRules / alwaysDenyRules / alwaysAskRules
      │   ├─ additionalWorkingDirectories (Map)
      │   ├─ isAutoModeAvailable?
      │   ├─ shouldAvoidPermissionPrompts? ← background agents: yes
      │   ├─ awaitAutomatedChecksBeforeDialog? ← coordinator workers: yes
      │   └─ prePlanMode? (for restore)
      ├─ useCanUseTool.tsx (UI hook for REPL)
      ├─ ChannelPermissionRequestNotification (MCP notification)
      └─ returns: PermissionResult { behavior: 'allow'|'deny'|'ask', updatedInput? }
  → Tool runs (or denies)
```

`ToolPermissionContext` 是 `DeepImmutable<...>`（`src/Tool.ts:114`），pure-data reducer 友好的设计。

### 8.3 Risk Surfaces（直接证据）

| 风险面 | 证据 | 行号 |
| --- | --- | --- |
| **`postinstall` 自动运行任意 npm 包** | `package.json scripts.postinstall: "node scripts/run-parallel.mjs scripts/postinstall.cjs scripts/setup-chrome-mcp.mjs"` | 多次 |
| **运行时动态 require()**（Bun DCE，但 runtime 仍 dynamic） | `tools.ts` 全文 30+ `require()` | — |
| **Bash Tool 子进程**（未深入查看 BashTool 实现） | `BashTool` import in `tools.ts` line 5 | — |
| **File Edit 写盘** | `FileEditTool` import line 7 | — |
| **Postinstall 安装 Chrome MCP bridge** | `scripts/setup-chrome-mcp.mjs` | — |
| **Datadog**（可能传 PII） | `services/analytics/datadog.ts` | — |
| **1P event logger**（自有分析 sink） | `services/analytics/firstPartyEventLogger.ts` | — |
| **MCP server 注册**（用户可能引入恶意 MCP server） | `packages/mcp-client/` | — |
| **Skill 文件写到 disk**（虽受 0o700/`O_NOFOLLOW`/`O_EXCL` 保护） | `bundledSkills.ts:186` `safeWriteFile` | — |
| **Symlink 攻击面**：bypass on POSIX by `chmod` race? | `safeWriteFile` 使用 `O_NOFOLLOW` 但仅在 final component | 需深入 |

### 8.4 反模式

- **Ant-only feature**：代码中有大量 `feature('ANT_…')` blocks，被 Bun DCE 消除；但**禁止在生产构建中以 process.env 判定加载**（会导致内部 feature 泄露）。已多次出现 `process.env.USER_TYPE === 'ant'` 直接判定（见 `tools.ts:17-25`），这是绕过 `feature()` 的反模式 —— 即"动态 require + process.env"是 default built 的代码路径无法消除，只能在 build-time 替换。
- **`firstPartyEventLogger` + `datadog`**：双 sink，分析面很大，可能误传 prompt 内容。**DevLog 风险**。
- **Langfuse 全链路 trace**：可能包含 prompt + tool_calls，建议 RoboThree 限制可观测粒度。

### 8.5 Security 维度结论（对 RoboThree）

| 维度 | 本仓库结论 | RoboThree 借鉴要点 |
| --- | --- | --- |
| Default Permission Mode | `getEmptyToolPermissionContext` 返回 `mode:'default'`（**default-ask**） | **ADOPT default-ask as default** |
| 工具白名单（sub-agent） | `ASYNC_AGENT_ALLOWED_TOOLS` 显式列举 | RoboThree sub-agent 工具白名单应显式 |
| Skip permission for background | `shouldAvoidPermissionPrompts?: boolean` | RoboThree 后台任务应自动 deny ambiguous |
| Plan Mode | `prePlanMode?: PermissionMode`（model-initiated） | 支持 mode ↔ plan mode 切换 |
| `additionalWorkingDirectories: Map` | 多根安全目录 | 支持多 working dir / container |
| `awaitAutomatedChecksBeforeDialog` | coordinator worker 先跑 hooks 再显示 prompt | RoboThree 多代理层加 hook pre-gate |

## 9. 多 Provider 抽象

`@ant/model-provider`（workspace 包）抽象：
- `EMPTY_USAGE: NonNullableUsage`（每次调用前 reset）
- `NonNullableUsage`（强制覆盖 Anthropic SDK 的可选字段）
- Bedrock (`@aws-sdk/*`) + Vertex (`@anthropic-ai/vertex-sdk`) + Foundry (`@anthropic-ai/foundry-sdk`) **同进程可选**
- Provider 选择：`getAPIProvider()`、`getMainLoopModel()`、`parseUserSpecifiedModel()`

## 10. Process 与部署边界

| 部署形态 | 触发 | 关键 env / 包 |
| --- | --- | --- |
| **Local REPL** | `claude-code-best` | `src/main.tsx` Ink REPL |
| **One-shot `-p`** | `claude-code-best -p "<prompt>"` | `QueryEngine` headless |
| **CCR (Claude Code Remote)** | `CLAUDE_CODE_REMOTE=true` | `--max-old-space-size=8192`，hook `getGitStatus` 跳过 |
| **ACP stdio agent** | `--acp` | `@agentclientprotocol/sdk` |
| **MCP server** | `--claude-in-chrome-mcp` / `--computer-use-mcp` | `services/mcp/client.ts` |
| **WeChat（微信）integration** | `weixin` 子命令 | `packages/weixin/` + `handleWeixinCli()` |
| **Chrome MCP bridge（side-load）** | postinstall | `scripts/setup-chrome-mcp.mjs` |
| **Compute Sandbox** | devDependency | `@anthropic-ai/sandbox-runtime` |

## 11. Observability & Reliability

- **OpenTelemetry**：完整 api/core/exporter 全套，可 export 到 OTLP gRPC/HTTP/Prometheus
- **Langfuse**：`@langfuse/otel` + `@langfuse/tracing`，per-Query span
- **Datadog**：`services/analytics/datadog.ts`
- **1P event logger**：`firstPartyEventLogger.ts`（"first party" = 自家产品日志）
- **Statsig**：`checkStatsigFeatureGate_CACHED_MAY_BE_STALE` 用于 feature flag（**不是 DCE 边界，是 runtime gate**）
- **GrowthBook**：`@growthbook/growthbook` 用于 A/B 测试
- **headlessProfiler / queryProfiler / startupProfiler**：3 个 profiler 覆盖不同生命周期（启动、query 步、headless 模式）
- **Cache 警告**：`shouldShowCacheWarning`、`isCacheWarningEnabled` — Anthropic prompt cache 配额耗尽提示
- **诊断日志**：`logForDiagnosticsNoPII` 显式标注 "no PII"
- **错误恢复**：`withRetry.ts`、`categorizeRetryableAPIError`、`FallbackTriggeredError`

## 12. 关键洞察（对 RoboThree）

1. **CLAUDE.md 不是设计**：本仓库文件命名、命名空间、env key 都用了 Anthropic 内部代号，直接复用会让 RoboThree 显得"借用"。需要重命名。
2. **`QueryEngine` 设计为可重用**：注释明确说"can be used by both the headless/SDK path and (in a future phase) the REPL"——这正是 RoboThree 想要的"headless + interactive 双形态"。
3. **`feature('FOO')` DCE pattern** 是 Bun 专属能力，RoboThree 不依赖 Bun 时需用别的手段（编译时 `#ifdef` 或 `import.meta.env`）。可借鉴 **概念**（feature flag 不仅 DCE 也参与 gateway）。

## 13. 总结：架构 3 大独特模式

| 模式 | 关键证据 | 直接用途 |
| --- | --- | --- |
| **Coordinator → Worker XML 协议** | `coordinatorMode.ts:111-370` `getCoordinatorSystemPrompt()` | RoboThree 多代理层 |
| **Tool-as-Command 抽象** | `bundledSkills.ts:15-100` + `Tool.ts:149` `ToolUseContext` | 统一 file-based / bundled / MCP-sourced skill |
| **Skill 文件提取安全（O_NOFOLLOW）** | `bundledSkills.ts:176-186` | plugin / skill 文件写入 |
