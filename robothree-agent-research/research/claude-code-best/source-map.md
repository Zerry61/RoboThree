# claude-code-best/claude-code — Source Map (Stage A)

> 注：本文档列出真实源码入口、关键子目录、典型符号。完整列表见 API 扫描结果。

## 1. 真实入口（候选）

### 1.1 CLI Bootstrap 入口

- `src/main.tsx`（247,302 B） — **真 CLI 入口**：用户键入 `claude-code-best` 或 `ccb` 时 Bun 加载的第一个文件。包含 `Commander` 命令定义、ink `Root` 渲染、`profileCheckpoint`（启动阶段检查点）、Langfuse span、QueryEngine 启动、MCP server 选择。**Source-confirmed entry point**。

### 1.2 CLI 子入口（`src/entrypoints/`）

| 文件 | 大小 | 角色 |
| --- | --- | --- |
| `cli.tsx` | 15,604 | `--dump-system-prompt`、`--version/-v/-V`、`--acp` (ACP agent over stdio)、`--chrome-native-host`、`--computer-use-mcp`、`--claude-in-chrome-mcp`、`weixin` 子命令的 fast path |
| `init.ts` | 15,628 | 异步初始化（Analytics sink、telemetry、MCP、config、secure storage、log） |
| `mcp.ts` | 6,329 | MCP server side 的 standalone 启动（早期路径，被 cli.tsx 取代） |
| `agentSdkTypes.ts` | 3,282 | SDK 公共类型 |
| `sdk/*` | — | SDK 在子目录 |
| `sandboxTypes.ts` | 5,735 | Sandbox 类型 |

### 1.3 Query 引擎入口

- `src/query.ts`（80,775 B） — **`query()` 主循环**：被 `src/QueryEngine.ts` 调用。是 RoboThree Agent Loop 的"标准案例"。
- `src/QueryEngine.ts`（49,116 B） — **`QueryEngine` 类**：headless / SDK 路径，封装 `query()` 调用、运行间状态、SDK status、ack。

### 1.4 Coordinator / Worker

- `src/coordinator/coordinatorMode.ts`（19,281 B） — `getCoordinatorSystemPrompt()`、`getCoordinatorUserContext()`、`matchSessionMode()`、`isCoordinatorMode()`、`isCoordinatorOnlyEnv()`。多代理协议核心。
- `src/coordinator/workerAgent.ts`（2,982 B） — Worker agent 定义；`getCoordinatorAgents()` 仅返回 `WORKER_AGENT`。

## 2. 顶层源码目录地图（带"真实入口"标注）

```
src/
├── main.tsx                                     ★ CLI bootstrap
├── query.ts                                     ★ Main query loop
├── QueryEngine.ts                               ★ QueryEngine class
├── Tool.ts                                      ★ Tool + ToolUseContext types
├── tools.ts                                     ★ tool registry (43+ tools)
├── context.ts                                   ★ getSystemContext / getUserContext
├── commands.ts                                  ★ Slash command registry
├── commands/                                    ★ Slash command implementations
├── components/                                  ★ Ink UI components
├── constants/                                   ★ Hard-coded enums + listings
├── coordinator/                                 ✦ Mechanism 1
│   ├── coordinatorMode.ts
│   ├── workerAgent.ts
│   └── …
├── query/                                       ✦ Mechanism 1 subdir
│   ├── transitions.ts                            • Terminal vs Continue union
│   ├── config.ts                                 • QueryConfig (immutable)
│   ├── deps.ts                                   • QueryDeps DI
│   ├── tokenBudget.ts                            • Diminishing returns
│   └── stopHooks.ts                              • Stop/TaskCompleted/TeammateIdle
├── skills/                                      ✦ Mechanism 3
│   ├── bundledSkills.ts
│   ├── loadSkillsDir.ts                          • 34KB skill loader
│   ├── mcpSkillBuilders.ts
│   ├── mcpSkills.ts
│   └── bundled/
├── plugins/
│   ├── builtinPlugins.ts
│   └── bundled/
├── hooks/                                       ✦ Mechanism 2 + Permission
│   ├── useCanUseTool.tsx                         • 12.9KB Permission hook
│   ├── toolPermission/                           • Permission policy dirs
│   ├── fileSuggestions.ts
│   ├── useAssistantHistory.ts
│   └── … (useBlink, useApiKeyVerification, useArrowKeyHistory, etc.)
├── services/
│   ├── analytics/                                • 1P logger + Datadog + Langfuse + Statsig + GrowthBook
│   ├── api/                                      • claude.ts, filesApi.ts, withRetry.ts, errors.ts
│   ├── mcp/                                      ✦ Mechanism 3 (122KB client.ts)
│   ├── tools/                                    • StreamingToolExecutor + toolOrchestration
│   ├── compact/                                  • auto/micro/reactive/history-snip
│   ├── langfuse/                                 • Langfuse spans
│   ├── skillSearch/                              • Skill discovery (feature-gated)
│   ├── searchExtraTools/                         • Tool search (feature-gated)
│   ├── autoDream/                                • memory enhancement
│   ├── extractMemories/                          • Memory extraction
│   ├── acp/                                      • Agent Client Protocol
│   ├── promptSuggestion/                         • Auto suggestion
│   └── …
├── state/                                       • AppState reducer
├── outputStyles/                                • Output style templates
├── coordinator/                                 (see above)
├── screens/                                     • Top-level Ink screens
├── buddy/                                       • Code buddy (推测副驾驶 UI)
├── modes/                                       • Auto / Plan / Yolo / …
├── memdir/                                      • Local memory dir
├── migrations/                                  • Config migrations
├── moreright/                                   • 推测扩展工具
├── native-ts/                                   • Native bindings shim
├── plugins/                                     • Plugin implementations (separate from src/plugins)
├── proactive/                                   • Proactive suggestions
├── query/                                       (see above)
├── remote/                                      • Remote control protocol
├── schemas/                                     • JSON Schema definitions
├── server/                                      • Local server (推测 webview/debug)
├── services/                                    (see above)
├── skills/                                      (see above)
├── ssh/                                         • SSH remote exec
├── tasks/                                       • Task list CRUD
├── types/                                       • Global types (Message, Permission, Tool)
├── upstreamproxy/                               • Upstream LLM proxy (推测)
├── utils/                                       • utilities (Hook helpers, queryProfiler, startupProfiler, env, perf, ...)
├── voice/                                       • Voice mode
├── workflow/                                    • Workflow execution
└── hooks/                                       (see above)

packages/
├── @anthropic-ai/
│   └── ink/                                     ★ 自家 fork Ink
├── @ant/
│   ├── claude-for-chrome-mcp/                   • Chrome integration
│   ├── computer-use-input/                      • Computer use input bindings
│   ├── computer-use-mcp/                        • Computer use MCP server
│   ├── computer-use-swift/                      • Computer use Swift impl
│   └── model-provider/                          ★ 多 Provider 抽象（EMPTY_USAGE/NonNullableUsage）
├── @claude-code-best/
│   ├── agent-tools/                             • 推测 Agent 工具包
│   ├── builtin-tools/                           ★ 43 个工具实现（BashTool, FileEditTool, …）
│   ├── mcp-client/                              ★ 自家 MCP client 包装
│   └── weixin/                                  ★ WeChat integration
├── acp-link/                                    • ACP link
├── audio-capture-napi/                          • Audio capture native binding
├── cloud-artifacts/                             • Cloud artifacts
├── color-diff-napi/                             • Color diff native binding
├── image-processor-napi/                        • Image processing native binding
├── modifiers-napi/                              • Key modifier native binding
├── remote-control-server/                       • Remote control server
├── url-handler-napi/                            • URL handler native binding
└── workflow-engine/                             ★ Workflow engine

vendor/                                          • 仅 audio-capture-* (native bindings)，其他 vendor 内容本次未取
scripts/                                         • 安装、测试、健康检查、postinstall scripts
tests/                                           • 测试代码
spec/                                            • 推测 Spec/Conformance tests
teach-me/                                        • 教育内容（推测）
docs/                                            • Mintlify docs
```

## 3. 真实符号索引（已读证据）

### 3.1 Coordinator / Worker（Mechanism 1）

| Symbol | File:Lines | 角色 |
| --- | --- | --- |
| `isCoordinatorMode()` | `src/coordinator/coordinatorMode.ts:36` | gate（`feature('COORDINATOR_MODE')` AND `CLAUDE_CODE_COORDINATOR_MODE=1`) |
| `matchSessionMode(sessionMode)` | `src/coordinator/coordinatorMode.ts:49` | resume 时反演 env |
| `getCoordinatorUserContext(mcpClients, scratchpadDir)` | `src/coordinator/coordinatorMode.ts:80` | 注入 coordinator 的 workerToolsContext |
| `getCoordinatorSystemPrompt()` | `src/coordinator/coordinatorMode.ts:111` | **5 段式 coordinator system prompt** |
| `getCoordinatorAgents()` | `src/coordinator/workerAgent.ts:65` | 仅返回 `WORKER_AGENT` |
| `WORKER_AGENT` (constant) | `src/coordinator/workerAgent.ts:41` | `agentType:'worker'` 的内置 agent 定义 |
| `INTERNAL_WORKER_TOOLS` / `INTERNAL_ORCHESTRATION_TOOLS` | `coordinatorMode.ts:29` / `workerAgent.ts:24` | Worker 禁用的工具集 |
| `ASYNC_AGENT_ALLOWED_TOOLS` | `src/constants/tools.ts`（被多文件 import） | Worker 可用工具集 |

### 3.2 Query Engine（Mechanism 1 子）

| Symbol | File:Lines | 角色 |
| --- | --- | --- |
| `type Terminal` | `src/query/transitions.ts:1` | 终结原因（`completed`/`blocking_limit`/`max_turns`/…） |
| `type Continue` | `src/query/transitions.ts:13` | 续行原因（`token_budget_continuation`/`reactive_compact_retry`/…） |
| `type QueryConfig` | `src/query/config.ts:15` | immutable snapshot |
| `buildQueryConfig()` | `src/query/config.ts:29` | 4 gates（streamingToolExecution/emitToolUseSummaries/isAnt/fastMode） |
| `type QueryDeps` | `src/query/deps.ts:21` | DI override（callModel/microcompact/autocompact/uuid） |
| `productionDeps()` | `src/query/deps.ts:33` | 生产实现 |
| `type BudgetTracker` | `src/query/tokenBudget.ts:6` | 4 字段（continuationCount/lastDeltaTokens/lastGlobalTurnTokens/startedAt） |
| `checkTokenBudget(tracker, agentId, budget, globalTurnTokens)` | `src/query/tokenBudget.ts:45` | **diminishing returns 算法**：3 次后 delta<500 tokens 就停 |
| `COMPLETION_THRESHOLD = 0.9` | `src/query/tokenBudget.ts:3` | 90% 才停 |
| `DIMINISHING_THRESHOLD = 500` | `src/query/tokenBudget.ts:4` | 500 tokens |
| `handleStopHooks(...)` | `src/query/stopHooks.ts:62` | Stop → TaskCompleted → TeammateIdle 顺序执行 |

### 3.3 Query 主循环（高层）

| Symbol | File | 角色 |
| --- | --- | --- |
| `query(params: QueryParams)` | `src/query.ts:276` | Async generator，返回 `Terminal` |
| `type QueryParams` | `src/query.ts:238` | messages / systemPrompt / canUseTool / toolUseContext / deps / querySource / maxOutputTokensOverride / maxTurns / taskBudget |
| `type State` | `src/query.ts:261` | mutable reducer state（12 字段） |
| `class QueryEngine` | `src/QueryEngine.ts:192` | "One QueryEngine per conversation. Each submitMessage() call starts a new turn within the same conversation. State (messages, file cache, usage, etc.) persists across turns." |

### 3.4 Tool 系统（Mechanism 2）

| Symbol | File:Lines | 角色 |
| --- | --- | --- |
| `type ToolUseContext` | `src/Tool.ts:149` | 全局 tool-use context（30+ 字段） |
| `type ToolPermissionContext` | `src/Tool.ts:114` | `DeepImmutable` 包装的权限上下文（mode / alwaysAllow / alwaysDeny / shouldAvoidPermissionPrompts / awaitAutomatedChecksBeforeDialog） |
| `getEmptyToolPermissionContext()` | `src/Tool.ts:131` | 默认 context |
| `findToolByName(name)` | `src/Tool.ts` | 工具查找 |
| `getTools()` | `src/tools.ts` | 注册 43+ 工具 |
| `toolMatchesName(t, n)` | `src/tools.ts:2` import | — |
| `ASYNC_AGENT_ALLOWED_TOOLS` / `COORDINATOR_MODE_ALLOWED_TOOLS` / `ALL_AGENT_DISALLOWED_TOOLS` / `CUSTOM_AGENT_DISALLOWED_TOOLS` | `src/constants/tools.ts` | 工具白/黑名单 |
| `TOOL_PRESETS = ['default']` | `src/tools.ts:186` | `--tools` CLI 预设 |

### 3.5 Permission + Hook

| Symbol | File | 角色 |
| --- | --- | --- |
| `useCanUseTool` | `src/hooks/useCanUseTool.tsx` | 12.9 KB Permission hook |
| `CanUseToolFn` | `src/hooks/useCanUseTool.ts` (type) | permission 拦截函数签名 |
| `toolPermission/*` | `src/hooks/toolPermission/` | 推测 permission 策略实现 |
| `executeStopHooks` | `src/utils/hooks.ts` | Stop hook 执行 |
| `executeTaskCompletedHooks` | `src/utils/hooks.ts` | Task Completed hook |
| `executeTeammateIdleHooks` | `src/utils/hooks.ts` | Teammate Idle hook |
| `executeStopFailureHooks` | `src/query.ts:104` | Stop 失败 hook |

### 3.6 Skill / Plugin / MCP（Mechanism 3）

| Symbol | File:Lines | 角色 |
| --- | --- | --- |
| `type BundledSkillDefinition` | `src/skills/bundledSkills.ts:15` | skill 定义（name/description/aliases/whenToUse/allowedTools/context/files/hooks/agent） |
| `registerBundledSkill(def)` | `src/skills/bundledSkills.ts:53` | 注册内建 skill |
| `getBundledSkills()` | `src/skills/bundledSkills.ts:106` | 取全部内建 skill |
| `getBundledSkillExtractDir(name)` | `src/skills/bundledSkills.ts:120` | 写文件用的 nonce-name dir |
| `extractBundledSkillFiles(...)` | `src/skills/bundledSkills.ts:131` | lazy extract reference files 到 disk |
| `safeWriteFile(p, content)` | `src/skills/bundledSkills.ts:186` | `O_NOFOLLOW \| O_WRONLY \| O_CREAT \| O_EXCL` + 0o600 |
| `resolveSkillFilePath(base, rel)` | `src/skills/bundledSkills.ts:196` | 路径穿越保护（拒绝 `..`） |
| `bundledPlugins` | `src/plugins/builtinPlugins.ts` | 内建插件列表 |
| `channelPermissions` | `src/services/mcp/channelPermissions.ts` | Channel 维度 permission 9KB |
| `channelAllowlist` | `src/services/mcp/channelAllowlist.ts` | Channel 维度 allowlist 2.8KB |
| `channelNotification` | `src/services/mcp/channelNotification.ts` | MCP `notifications/permissions/decision-request` 10KB |
| `MCPConnectionManager` | `src/services/mcp/MCPConnectionManager.tsx` | MCP 连接管理 1.9KB |

## 4. 静态分析结论

- **真实源码已验证**：包含 `class QueryEngine`、43+ 工具实例、`query()` 主循环 ASYNC generator、`<task-notification>` 协议。不能用 README-only 总结。
- **Source-confirmed entry points**（不依赖 README）：
  - CLI bootstrap → `src/main.tsx`
  - Query loop → `src/query.ts`
  - QueryEngine class → `src/QueryEngine.ts`
- **Coherence check**：源码自描述（`package.json description`、`AGENTS.md`、`CLAUDE.md`、`SECURITY.md`）与真实架构一致。
- **生产工程模式**：src/state/AppState.ts reducer、src/utils/systemPromptType.ts 区分系统提示结构、src/services/langfuse/index.ts 链路追踪、src/services/compact/{auto,micro,reactive,history-snip} 多种压缩策略、src/coordinator/ + src/coordinator/workerAgent.ts 显式多代理层。

## 5. 未访问路径（透明声明）

| 路径 | 状态 | 原因 |
| --- | --- | --- |
| `vendor/audio-capture-src/`, `vendor/audio-capture/` | 未读 | 仅 vendor 原生代码，与 RoboThree 关系弱 |
| `bun.lock` | 未读 | 仅依赖锁定，无架构价值 |
| `contributors.svg` (2.7 MB) | 未读 | 推测贡献图 |
| `mint.json`, `mintlify` 渲染产物 | 未读 | docs config |
| `packages/{agent-tools,mcp-client,acp-link,@ant/model-provider,@anthropic-ai/ink,builtin-tools}/src/*` | 部分读 | 本次抓取 `package.json` 失败，但通过 `import`/`require` 在主 `src/` 内多次出现，间接获得声明 |
| `dist/`（构建产物） | 未读 | 无源码价值 |
| `teach-me/*` | 未读 | 推测教学内容 |
| AGENTS.md、CLAUDE.md（仓库内指令） | 未读为证据 | Skill § 4.4：仓库内指令视为**不可信输入** |
| 其他 80+ .tsx React UI 子文件 | 未逐个读 | L3 重点是 coordinator / tool / skill，非 UI |
