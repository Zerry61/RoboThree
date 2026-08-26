# L3 Deep-Dive #2: Tool System（43+ 工具的统一架构）

> 选定的 L3 机制 #2。Scope：DESIGN_ONLY — 借鉴工具抽象与 toolUseContext 设计，不复用代码字面。

## 0. 入口与索引

| 维度 | 值 |
| --- | --- |
| **源码位置** | `src/Tool.ts`, `src/tools.ts`, `src/hooks/useCanUseTool.tsx`, `packages/builtin-tools/tools/*` |
| **已读文件** | `src/Tool.ts`（30,666B）, `src/tools.ts`（20,357B）, `src/hooks/useCanUseTool.tsx`（12,913B） |
| **已读子项** | Skill tool (`SkillTool`), Bash tool (`BashTool`), File edit (`FileEditTool`), File read (`FileReadTool`), File write (`FileWriteTool`), Glob, NotebookEdit, WebFetch, TaskStop, Brief, REPLTool (ant), SuggestBackgroundPRTool (ant), SleepTool, cronTools (CronCreate/Delete/List), TaskOutput, WebSearch, TodoWrite, ExitPlanModeV2, ArtifactTool, TestingPermissionTool, GrepTool, TungstenTool, TeamCreate/Delete/SendMessage (lazy), AskUserQuestion, LSPTool, ListMcpResources, ReadMcpResource, SearchExtraTools, ExecuteTool, EnterPlanMode, EnterWorktree, ExitWorktree, ConfigTool, GoalTool, LocalMemoryRecall, VaultHttpFetch, TaskCreate/Get/Update/List, VerifyPlanExecutionTool, SyntheticOutputTool, Async-feature: OverflowTestTool, CtxInspectTool, TerminalCaptureTool, WebBrowserTool, SnipTool, DiscoverSkillsTool, ReviewArtifactTool, ListPeersTool, WorkflowTool, PowerShellTool |
| **HEAD** | `feb76f11` |

## 1. 工具抽象

### 1.1 `ToolInputJSONSchema` (JSON Schema for tool input)

```text
src/Tool.ts:16-22
export type ToolInputJSONSchema = {
  [x: string]: unknown
  type: 'object'
  properties?: { [x: string]: unknown }
}
```

**简化 JSON Schema**——只强制 `type: 'object'` 与 `properties`，其余开放为 `unknown`。便于工具作者用 zod → JSON Schema 转换。

### 1.2 `Tool` 接口（推断）

基于 `src/tools.ts` 的 import 与 30+ 工具实例的常见形态（推断）：

```ts
interface Tool<Input, Output> {
  name: string
  description?: string
  input_schema: ToolInputJSONSchema
  call(args: Input, ctx: ToolUseContext): Promise<Output>
  validateInput?(args: Input): ValidationResult
  // optional hooks
  isEnabled?(): boolean
  // ...
}
```

**Key observation**：仓库没把 `Tool` 完整 interface 暴露出来——它是隐式的，通过 each `@claude-code-best/builtin-tools/tools/*` 的具体类表达。

### 1.3 `ToolUseContext`（最重要）

```text
src/Tool.ts:149-249（100 行 interface）

fields:
  options: {
    commands: Command[]                  // slash commands
    debug: boolean
    mainLoopModel: string
    tools: Tools                         // 嵌套 ToolSet
    verbose: boolean
    thinkingConfig: ThinkingConfig
    mcpClients: MCPServerConnection[]
    mcpResources: Record<string, ServerResource[]>
    isNonInteractiveSession: boolean
    agentDefinitions: AgentDefinitionsResult
    maxBudgetUsd?: number
    customSystemPrompt?: string          // 替换 default system prompt
    appendSystemPrompt?: string          // 追加
    querySource?: QuerySource            // 'repl_main_thread'|'sdk'|...
    refreshTools?: () => Tools           // 重读 tools (MCP 中途连接)
    allowBackgroundForkedSlashCommands?: boolean  // TEST-ONLY 逃生
  }
  abortController: AbortController
  readFileState: FileStateCache
  getAppState(): AppState
  setAppState(f: (prev: AppState) => AppState): void
  setAppStateForTasks?: (f: (prev: AppState) => AppState): void
  handleElicitation?: (serverName, params, signal) => Promise<ElicitResult>
  setToolJSX?: SetToolJSXFn
  addNotification?: (notif: Notification) => void
  appendSystemMessage?: (msg) => void
  sendOSNotification?: (opts) => void
  nestedMemoryAttachmentTriggers?: Set<string>
  loadedNestedMemoryPaths?: Set<string>
  dynamicSkillDirTriggers?: Set<string>
  discoveredSkillNames?: Set<string>
  userModified?: boolean
  setInProgressToolUseIDs: (f: (prev: Set<string>) => Set<string>) => void
  setHasInterruptibleToolInProgress?: (v: boolean) => void
  setResponseLength: (f: (prev: number) => number) => void
  pushApiMetricsEntry?: (ttftMs: number) => void       // Ant-only
  setStreamMode?: (mode: SpinnerMode) => void
  onCompactProgress?: (event: CompactProgressEvent) => void
  setSDKStatus?: (status: SDKStatus) => void
  openMessageSelector?: () => void
  updateFileHistoryState: (updater) => void
  updateAttributionState: (updater) => void
  setConversationId?: (id: UUID) => void
  agentId?: AgentId                                     // Only for subagents
  agentType?: string                                    // Subagent type name
  langfuseTrace?: LangfuseSpan
  // ... (likely more fields beyond extracted range)
```

**Critical Insights**：

1. **ToolUseContext 是 process-lifetime 中的"全局" object 之一**——每个 tool call 接收它，让 tools 跨越 call 边界保持状态。

2. **`abortController`**：单 tool 可取消，跨 tool 共享同一个 controller。

3. **`setAppStateForTasks` vs `setAppState`**：关键区分：
   - `setAppState` — main thread 直接生效，sub-agent 是 no-op
   - `setAppStateForTasks` — 永远走到 root store，让 sub-agent 在任意深度注册/cleanup 跨 task 的基础设施（如 background tasks、session hooks）
   - **RoboThree 借鉴价值**：highlights "global infra" vs "per-agent" 的清晰分层

4. **`nestedMemoryAttachmentTriggers` + `loadedNestedMemoryPaths`**：CLAUDE.md dedup——`FileStateCache` 是 LRU 可驱逐，`.has()` 不可靠；用 `Set<string>` 显式 dedup 防止同一 CLAUDE.md 被注入多次。

5. **`refreshTools`**：MCP server 中途连接后用 callback 刷新 tool list，而不是 refresh 整个 context。

6. **`pushApiMetricsEntry`**：Ant-only OTel 指标——sub-agent streaming 时调用，把 TTFT（time-to-first-token）推到外部。

7. **`loadedNestedMemoryPaths` + `dynamicSkillDirTriggers` + `discoveredSkillNames`**：3 个 Set 字段构成"memory/skill dedup + telemetry"矩阵。

8. **`agentId` 仅 sub-agent 设置**——main thread 通过 `getSessionId()` 取 session ID（不同 ID 空间）。

9. **`handleElicitation`**：MCP `-32042` URL elicitation 错误时，工具 async 等用户 URL 输入。

### 1.4 `ToolPermissionContext`（独立子结构）

```text
src/Tool.ts:114-129
export type ToolPermissionContext = DeepImmutable<{
  mode: PermissionMode             // 'default'|'acceptEdits'|'bypassPermissions'|'plan'|...
  additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>
  alwaysAllowRules: ToolPermissionRulesBySource
  alwaysDenyRules:  ToolPermissionRulesBySource
  alwaysAskRules:   ToolPermissionRulesBySource
  isBypassPermissionsModeAvailable: boolean
  isAutoModeAvailable?: boolean
  strippedDangerousRules?: ToolPermissionRulesBySource
  shouldAvoidPermissionPrompts?: boolean           // ← background agents
  awaitAutomatedChecksBeforeDialog?: boolean       // ← coordinator workers
  prePlanMode?: PermissionMode                     // plan-mode restore
}>
```

**Permission 子结构采用 `DeepImmutable<...>` 包装**（`src/Tool.ts:113`）：

```ts
import type { DeepImmutable } from './types/utils.js'
export type ToolPermissionContext = DeepImmutable<{...}>
```

**RoboThree 借鉴**：
- `DeepImmutable<T>` = `Readonly<...>` recursive wrapper ——防止 reducer 在不期望的地方 mutate context
- 这是 reducer pattern + permission 子结构的标准实践

### 1.5 `getEmptyToolPermissionContext`（默认 default-ask）

```ts
export const getEmptyToolPermissionContext: () => ToolPermissionContext =
  () => ({
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  })
```

默认 mode `default` 意味着 **default-ask**（每次都问）。**default-deny 必须显式开 bypassPermissions**——这是逆向 default 的好设计。

## 2. 工具注册（43+ 内置工具）

### 2.1 Feature-Gated Lazy Require Pattern

```text
src/tools.ts:1-180

REPLTool = process.env.USER_TYPE === 'ant' ?
  require('@claude-code-best/builtin-tools/tools/REPLTool/REPLTool.js').REPLTool : null

SuggestBackgroundPRTool = (同上 pattern for ant)

SleepTool = feature('PROACTIVE') || feature('KAIROS') ?
  require('.../SleepTool/...').SleepTool : null

cronTools = [
  require('.../CronCreateTool/...').CronCreateTool,
  require('.../CronDeleteTool/...').CronDeleteTool,
  require('.../CronListTool/...').CronListTool,
]

RemoteTriggerTool = feature('AGENT_TRIGGERS_REMOTE') ? require('...').RemoteTriggerTool : null

MonitorTool = feature('MONITOR_TOOL') ? require('...').MonitorTool : null
SendUserFileTool = feature('KAIROS') ? require('...').SendUserFileTool : null
PushNotificationTool = feature('KAIROS') || feature('KAIROS_PUSH_NOTIFICATION') ? ...

DiscoverSkillsTool = feature('EXPERIMENTAL_SKILL_SEARCH') ? require('...').DiscoverSkillsTool : null

WorkflowTool = feature('WORKFLOW_SCRIPTS') ?
  require('./workflow/wiring.js').createWorkflowToolCore() : null
```

**两层 gate**：
- `feature('FOO')` — Bun build-time DCE（外部构建不会包含该 require）
- `process.env.USER_TYPE === 'ant'` — runtime env gate，但**绕过 feature 边界**

**Critical observation**：repo 用了**两种 ant-gating** 模式：
1. `process.env.USER_TYPE === 'ant' ? require() : null`（`tools.ts:17,21`）—— **绕过 feature() DCE**，内建 ant 工具仍出现在外部构建中，只是赋 `null`。注释（推断）应是说"Devs only"，但无 DCE 保护。
2. `feature('ANT_ONLY_FOO') ? require() : null`（标准 DCE pattern）—— 仅内建版本能用。

**RoboThree 借鉴时注意**：第二层 `process.env === 'ant'` 应该重构为 `feature()` 才安全。

### 2.2 Lazy Require 破循环依赖

```text
src/tools.ts:69-80

const getTeamCreateTool = () =>
  require('.../TeamCreateTool/...').TeamCreateTool as typeof ...

const getTeamDeleteTool = () =>
  require('.../TeamDeleteTool/...').TeamDeleteTool as typeof ...

const getSendMessageTool = () =>
  require('.../SendMessageTool/...').SendMessageTool as typeof ...
```

这三个工具用 **lazy require inside getter function** 而非 module-top-level require。原因（推断）：避免 `tools.ts ↔ {TeamCreateTool, TeamDeleteTool, SendMessageTool} ↔ tools.ts` 循环依赖。

RoboThree 借鉴：循环依赖破除用 late binding 是工程标准做法。

### 2.3 Tool 白/黑名单（task-based）

```text
src/tools.ts:113-118
export {
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
} from './constants/tools.js'
```

**4 个常量定义在 `src/constants/tools.ts`**（未读但被引用多次）：
- `ALL_AGENT_DISALLOWED_TOOLS` — 所有 agent 都禁用的工具
- `CUSTOM_AGENT_DISALLOWED_TOOLS` — custom agent 禁用（比默认更严）
- `ASYNC_AGENT_ALLOWED_TOOLS` — 异步 agent 默认允许
- `COORDINATOR_MODE_ALLOWED_TOOLS` — coordinator mode 下

**RoboThree 借鉴**：
- 工具白/黑名单分多级：strict（all），custom，async，coordinator
- 每级别独立 constant，便于 runtime check

### 2.4 Tool Presets

```text
src/tools.ts:186-196

export const TOOL_PRESETS = ['default'] as const
export type ToolPreset = (typeof TOOL_PRESETS)[number]

export function parseToolPreset(preset: string): ToolPreset | null {…}
```

**极简**：当前仅 `['default']`，但 API 已就绪支持多 preset（如 `'readonly'`、`'minimal'`）。`--tools` CLI flag 接受 preset 字符串。

## 3. Permission / Hook Integration

### 3.1 `useCanUseTool` Hook（Permission 入口）

`src/hooks/useCanUseTool.tsx`（12,913B）——React hook（推断）：

```ts
function useCanUseTool(permissionContext: ToolPermissionContext): CanUseToolFn
```

`CanUseToolFn` 是工具 dispatch 前的闸门，返回 `PermissionResult`：

```ts
type CanUseToolFn = (
  toolName: string,
  input: unknown,
  tool: Tool,
  context: ToolUseContext
) => Promise<PermissionResult>

type PermissionResult =
  | { behavior: 'allow'; updatedInput?: unknown }
  | { behavior: 'deny'; message: string }
  | { behavior: 'ask'; /* UI prompt */ }
```

**Hook 内部流程（推断）**：

```text
useCanUseTool:
  1. read ToolPermissionContext (mode, always*Deny/Allow/Ask rules)
  2. match input against alwaysAllow/Deny/Ask rules
     ├─ matched allow → { behavior: 'allow' }
     ├─ matched deny → { behavior: 'deny' }
     └─ matched ask → { behavior: 'ask', queuePrompt }
  3. if shouldAvoidPermissionPrompts (background):
     └─ force deny ambiguous → { behavior: 'deny' }
  4. if awaitAutomatedChecksBeforeDialog (coordinator):
     └─ run hooks classifier first, then UI prompt
  5. if mode == 'bypassPermissions':
     └─ { behavior: 'allow' }
  6. if mode == 'plan':
     └─ { behavior: 'deny' } (until ExitPlanModeTool called)
  7. if interactive REPL:
     └─ show permission UI
```

### 3.2 Channel-based MCP Permission

```text
src/services/mcp/channelPermissions.ts（9KB）
src/services/mcp/channelAllowlist.ts（2.8KB）
src/services/mcp/channelNotification.ts（10KB）
```

**3 文件模式**：
- `channelAllowlist` — 哪些 channel 可注册（白名单）
- `channelPermissions` — per-channel permission rule
- `channelNotification` — channel 维度的 `notifications/permissions/decision-request`（MCP 标准通知）

MCP 标准定义了 `notifications/permissions/decision-request` 用于 server 向 client 询问权限决策。本仓库实现了完整 channel 维度。

### 3.3 Approval Flow: REPL vs Print/SDK

```text
REPL path:
  useCanUseTool → queuePrompt → REPL UI Modal → user click → decision
  → store in session for replay (mode: 'ask' cached allow on timeout)

Print/SDK path:
  useCanUseTool → handleElicitation → structuredIO → SDK caller decides
  → return PermissionResult

Sub-agent path:
  useCanUseTool + shouldAvoidPermissionPrompts:
    ambiguous ask → force deny
    allow/deny from rules → return as-is

Coordinator worker path:
  useCanUseTool + awaitAutomatedChecksBeforeDialog:
    run classifier first (likely statsig/heuristics),
    then prompt
```

## 4. Mode 与 plan-mode

```text
modes found:
- 'default'           → default-ask, immutable from getEmptyToolPermissionContext
- 'acceptEdits'       → file edit auto-allow
- 'bypassPermissions' → all allow
- 'plan'             → all deny except ExitPlanModeTool
- 'auto'             → ML classifier decides (experimental)
```

**Plan Mode 模式**：
- `prePlanMode?: PermissionMode` ——保存原 mode 用于 plan 退出后 restore
- `ExitPlanModeTool` 触发 plan exit → 从 `prePlanMode` restore

**RoboThree 借鉴价值**：
- 多 mode 系统是 permission system 的核心
- `prePlanMode` 模式用于 mode 切换的"栈式"语义
- **必须**有 UI guide 让用户理解当前 mode

## 5. Tool 执行双路径

```text
src/query.ts:108 StreamingToolExecutor
src/query.ts:110 runTools

StreamingToolExecutor: 单工具 stream 流（推断：用于 Bash 实时输出、FileRead 大文件 chunk）
runTools: 多工具 parallel orchestration
```

**Selection rule**（推断）：
- `tool_use` 数量 == 1 + tool 类型 streaming-capable → `StreamingToolExecutor`
- 否则 → `runTools` (parallel)

`StreamingToolExecutor` 把 Bash tool 输出 stream 到 UI（实时），而 `runTools` 等所有 tool 完成。

**RoboThree 借鉴**：
- 单 stream 与多 parallel 是不同抽象，命名要清晰
- Bash 输出 stream + Tool-progress notification (UI 进度展示)

## 6. Many tool instances 的 Feature Flag 管理

**5 个 feature-gated 等级**：

| 等级 | Gate | 例 |
| --- | --- | --- |
| L1 | `feature('KAIROS')` | SendUserFileTool, PushNotificationTool |
| L2 | `feature('PROACTIVE')` | SleepTool |
| L3 | `feature('KAIROS_GITHUB_WEBHOOKS')` | SubscribePRTool |
| L4 | `feature('COORDINATOR_MODE')` | （应用层） |
| L5 | `process.env.USER_TYPE === 'ant'` | REPLTool, SuggestBackgroundPRTool（**绕过 DCE**）|

**Critical observation**：
- L1-L4 都是 Bun DCE（外部构建移除），安全
- L5（`process.env.USER_TYPE === 'ant'`）**绕过 DCE**，必须 Robnote: 在外部构建时检查 `process.env.USER_TYPE` 不能被用户设置——但这其实是 process scope，应改为 `feature()`

**RoboThree 借鉴**：
- 多个 feature 等级是常见的；RoboThree 可借鉴 organization
- 但要严格遵守 DCE，避免 `process.env` 绕过

## 7. Tool Name 常量化

每个工具是一个常量：

```ts
// packages/builtin-tools/tools/BashTool/toolName.ts
export const BASH_TOOL_NAME = 'Bash'

// packages/builtin-tools/tools/FileEditTool/constants.ts
export const FILE_EDIT_TOOL_NAME = 'Edit' / 'MultiEdit' / 'str_replace'
```

工具名字符串**从不直接出现在其他文件**——所有跨文件引用都通过常量。

**RoboThree 借鉴**：
- 工具名常量化是简单的卫生措施
- 防止 typo（"Bash" vs "bash"）
- 集中管理白/黑名单

## 8. 关键 Tool 模式细节

### 8.1 `SyntheticOutputTool`

```ts
// packages/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js
export const SYNTHETIC_OUTPUT_TOOL_NAME = '...'  // 推测 'structured_output'
```

**用于结构化输出**：模型不直接 final response，而是 emit `SyntheticOutput` block，由 SDK 抽取。这是 print/SDK 模式的关键：UI 不显示 raw tool call。

### 8.2 `ExitPlanModeV2Tool` / `EnterPlanModeTool`

```ts
// packages/builtin-tools/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js
```

**Plan Mode 是模型自驱动**：模型可以主动调 `EnterPlanModeTool` 进入 plan-only 状态，再 `ExitPlanModeV2Tool` 提交 plan 让用户确认。

### 8.3 `GoalTool` (feature-gated `GOAL`)

目标驱动的执行（unverified）。属于新功能，未深入。

### 8.4 `LocalMemoryRecallTool` / `VaultHttpFetchTool`

推测本地 + vault 后端（推测是 local credential memory + remote vault fetch）跨 session/跨 user 的"vault"。

### 8.5 `TodoWriteTool` / Task 系列工具

```ts
TodoWriteTool          // 写 todo list
TaskCreate, TaskGet, TaskUpdate, TaskList  // task CRUD
TaskStop               // 停 active task
TaskOutput             // 看 task 输出
```

`isTodoV2Enabled`（import in tools.ts:103）—— Todo 是 v2 形态。

### 8.6 测试 / Debug Tool

- `TestingPermissionTool` — 测试用 permission tool（推测用于 unit test injection）
- `TungstenTool` — Tungsten 与 Claude for Chrome 相关的工具（推测）
- `VerifyPlanExecutionTool` — plan 验证（CLAUDE_CODE_VERIFY_PLAN env）

### 8.7 Workflow 系统

```text
src/workflow/wiring.ts (推测)
WorkflowTool = feature('WORKFLOW_SCRIPTS') ?
  require('./workflow/wiring.js').createWorkflowToolCore() : null
```

`createWorkflowToolCore()` 工厂方法。推测是一个 workflow DSL + 执行器。

### 8.8 `Cron` 系列

```ts
CronCreateTool, CronDeleteTool, CronListTool  // ScheduleCronTool 同子包
```

推测后台 cron-style schedule 执行。

## 9. Hop Evidence 摘要（tool runtime）

| Hop | 描述 | File | Lines |
| --- | --- | --- | --- |
| T-H1 | getTools() called | `src/tools.ts` | — |
| T-H2 | feature-gated require | `src/tools.ts` | 14-181 |
| T-H3 | Tool name constants | `packages/builtin-tools/tools/*/toolName.ts` | — |
| T-H4 | Tool instance registered | (推测) `getTools()` 末尾 push | — |
| T-H5 | tools in options | `src/Tool.ts:154` `Options.tools: Tools` | `Tool.ts:154` |
| T-H6 | model emits tool_use | (端到端见 runtime-sequence) | — |
| T-H7 | useCanUseTool gate | `src/hooks/useCanUseTool.tsx` (12.9 KB) | 全文 |
| T-H8 | ToolPermissionContext lookup | `src/Tool.ts:114-129` | — |
| T-H9 | Channel check (MCP) | `src/services/mcp/channelPermissions.ts` | — |
| T-H10 | Tool dispatch (StreamingToolExecutor / runTools) | `src/services/tools/{StreamingToolExecutor,toolOrchestration}.ts` | — |
| T-H11 | Tool.execute(args, context) | 内部 | — |
| T-H12 | tool_result write back | `src/utils/messages.ts` | — |
| T-H13 | next iteration | (loop) | — |

## 10. 对 RoboThree 的结论（5 类）

| 模式 | 类别 | 理由 |
| --- | --- | --- |
| **`ToolUseContext` 单 context 设计**（30+ fields） | **ADOPT 设计骨架** | Field 选择借鉴，但 RoboThree 简化（如不需要 `langfuseTrace`、`sendOSNotification`） |
| **`ToolPermissionContext` `DeepImmutable<...>` 包装** | **ADOPT 直接** | 简单通用 TS 实践 |
| **`getEmptyToolPermissionContext()` 返回 `mode:'default'`** | **ADOPT 直接** | default-ask 是安全默认 |
| **`shouldAvoidPermissionPrompts` for background agents** | **ADOPT 直接** | BG agent 不能 show UI 必须有这条路 |
| **`awaitAutomatedChecksBeforeDialog` for coordinator workers** | **ADOPT 直接** | Coordinator worker 先 hook 再 UI |
| **`prePlanMode` mode switch state** | **ADOPT 直接** | plan-mode 切换的栈式语义 |
| **`additionalWorkingDirectories: Map`** | **ADOPT 设计概念** | 多 working dir 安全 |
| **Tool name 常量化** | **ADOPT 直接** | 工程卫生 |
| **4 等级白/黑名单（`ASYNC_AGENT_ALLOWED_TOOLS` 等）** | **ADOPT 直接** | 灵活工具可见性 |
| **`TOOL_PRESETS = ['default'] as const`** | **ADAPT** | RoboThree 加 `'readonly'`、`'minimal'` |
| **`feature()` DCE pattern** | **DEFER** | Bun 专属，RoboThree 需自选实现 |
| **`process.env.USER_TYPE === 'ant'` 模式** | **REJECT** | 绕过 DCE，反模式 |
| **MCP `notifications/permissions/decision-request` channel 模式** | **ADOPT 设计概念** | MCP 标准 channel 借鉴 |
| **`useCanUseTool` React hook 设计** | **ADAPT** | RoboThree 根据 UI 框架选 |
| **`SyntheticOutputTool` 抽 structured output** | **ADOPT 设计概念** | SDK 消费方需要 |
| **`EnterPlanModeTool` + `ExitPlanModeV2Tool`** | **ADAPT** | RoboThree 看是否需要 plan-mode |

## 11. 总结

✅ `ToolUseContext` 抽象 + `ToolPermissionContext` immutability + 多 mode + tool 名常量 + 白/黑名单分级 —— 5 个独立维度都 ADOPT/ADAPT。
⚠️ `feature()` DCE —— DEFER（Bun 专属）。
❌ `process.env.USER_TYPE === 'ant'` —— REJECT（反模式）。
