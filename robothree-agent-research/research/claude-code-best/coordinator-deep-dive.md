# L3 Deep-Dive #1: Coordinator / Worker Multi-Agent Architecture

> 选定的 L3 机制 #1：本仓库的最显著创新。
> **Scope 边界**：DESIGN_ONLY——借鉴接口与算法，不复用任何代码字面。

## 0. 入口与索引

| 维度 | 值 |
| --- | --- |
| **源码位置** | `src/coordinator/` + `src/query/` |
| **已读文件** | `coordinatorMode.ts`（19,281B）, `workerAgent.ts`（2,982B）, `query/transitions.ts`（718B）, `query/config.ts`（1,808B）, `query/deps.ts`（1,445B）, `query/tokenBudget.ts`（2,320B）, `query/stopHooks.ts`（17,690B） |
| **引用的次级文件** | `src/coordinator/coordinatorMode.ts:8-15` import `@claude-code-best/builtin-tools/tools/{AgentTool, BashTool, FileEditTool, FileReadTool, SendMessageTool, SyntheticOutputTool, TaskStopTool, TeamCreateTool, TeamDeleteTool}/{constants,prompt,toolName}` |
| **HEAD** | `feb76f11bb794fb772e6882a418ab2409eb7823c` |

## 1. 多代理分层

### 1.1 触发链

```text
feature('COORDINATOR_MODE') true                           // Bun build-time gate
  AND process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'        // runtime env gate
    → isCoordinatorMode() === true
    → getCoordinatorUserContext(...) 注入 workerToolsContext
    → getCoordinatorSystemPrompt() 替换主 system prompt

matchSessionMode(sessionModeFromSession):
  if persisted session was coordinator:
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'    // 翻 env 开关
    return 'Entered coordinator mode to match resumed session.'
```

**关键设计点**：
- **三层 gate**：(a) Build-time DCE via `feature()`、(b) Runtime env、(c) Persisted session mode
- **Session-Resume 一致性**：自动反演 env 开关，让 persisted session 的 mode 与运行时保持同步（不依赖 CLI flag 重新输入）

### 1.2 Coordinator / Worker 角色边界

```text
┌─────────────────────────────────────────┐
│ Coordinator                             │
│ ── Tools:                               │
│   AGENT_TOOL_NAME (spawn worker)        │
│   SEND_MESSAGE_TOOL_NAME (continue)     │
│   TASK_STOP_TOOL_NAME (stop)            │
│   TEAM_CREATE / TEAM_DELETE (internal)  │
│   SYNTHETIC_OUTPUT_TOOL_NAME            │
│   subscribe_pr_activity (if available)  │
│ ── Skills:                              │
│   standard + /commit, /verify etc.      │
│     DELEGATE to workers (per prompt)    │
│ ── Workflow:                            │
│   1. Research (worker parallel)         │
│   2. Synthesis (coordinator)            │
│   3. Implementation (worker)            │
│   4. Verification (worker)              │
└─────────────────────────────────────────┘
            │ spawn worker
            ▼
┌─────────────────────────────────────────┐
│ Worker                                  │
│ ── Agent type: 'worker'                 │
│ ── Tools:                               │
│   ASYNC_AGENT_ALLOWED_TOOLS            │
│     MINUS                              │
│   {TeamCreate, TeamDelete,              │
│    SendMessage, SyntheticOutput}        │
│ ── MCP tools from connected MCP servers │
│ ── Skills (when CLAUDE_CODE_SIMPLE off) │
│ ── Scratchpad dir (when feature flag on)│
└─────────────────────────────────────────┘
```

**Worker 不能 spawn 自己**——`INTERNAL_ORCHESTRATION_TOOLS` 把 `SendMessage`/`Agent` 排除，确保单层 sub-agent 树，不会无限嵌套递归。

### 1.3 Worker 结果协议：`<task-notification>` XML

```xml
<task-notification>
<task-id>agent-a1b</task-id>
<status>completed | failed | killed</status>
<summary>Agent "{description}" completed</summary>
<result>{agent's final text response}</result>
<usage>
  <total_tokens>N</total_tokens>
  <tool_uses>N</tool_uses>
  <duration_ms>N</duration_ms>
</usage>
</task-notification>
```

**注入机制**：以 **user-role message** 注入 Coordinator 的 message stream（关键差异化设计）。

**协议语义**：
- `<result>` 和 `<usage>` 可选
- `<summary>` 可为 `"failed: {error}"` 或 `"was stopped"`
- `<task-id>` 用于后续 `SEND_MESSAGE({to:"agent-a1b", ...})` 继续 worker

**Critical observation**：Worker 结果包成 user message 而非 tool result，让 Coordinator 自然能 read context，并让用户看到"worker 报告"的语义。这是协议的人因设计。

### 1.4 Coordinator System Prompt（5 段）

`getCoordinatorSystemPrompt()`（`coordinatorMode.ts:111-369`）定义完整协议：

| 段 | 行范围 | 主题 |
| --- | --- | --- |
| 1 | `116-126` | **Role**："orchestrates software engineering tasks across multiple workers" — Help the user achieve their goal, direct workers to research/implement/verify, synthesize results |
| 2 | `128-164` | **Tools**：spawn/continue/stop workflow + Result format = `<task-notification>` |
| 3 | `192-199` | **Workers**：当用 `subagent_type:'worker'` 时，worker 自主执行 research/implementation/verification |
| 4 | `200-249` | **Task Workflow**：Research (parallel) → Synthesis (you) → Implementation (worker) → Verification (worker)；并附 concurrency、verification rigor、failure handling、stopping workers |
| 5 | `251-336` | **Writing Worker Prompts**："Always synthesize — your most important job" + Continue vs Spawn by context overlap + Add purpose statement + Good/Bad examples |

**最著名的一段**（`coordinatorMode.ts:255-260`）：

> **Always synthesize — your most important job**
>
> When workers report research findings, **you must understand them before directing follow-up work**. Read the findings. Identify the approach. Then write a prompt that proves you understood by including specific file paths, line numbers, and exactly what to change.
>
> Never write "based on your findings" or "based on the research." These phrases delegate understanding to the worker instead of doing it yourself. **You never hand off understanding to another worker.**

这是"防止 lazy delegation" 的设计原则——Coordinator 收到 worker 报告后必须读懂，再写 prompt。

### 1.5 Worker System Prompt（简洁）

`getCoordinatorAgents()` 返回的 `WORKER_AGENT` 的 `getSystemPrompt: () => '...'`（`workerAgent.ts:48-58`）：

```
You are a worker agent spawned by a coordinator. Your job is to complete the
task described in the prompt thoroughly and report back with a concise summary
of what you did and what you found.

Guidelines:
- Complete the task fully — don't leave it half-done, but don't gold-plate either.
- Use tools proactively: read files, search code, run commands, edit files.
- Be thorough in research: check multiple locations, consider different naming conventions.
- For implementation: make targeted changes, run tests to verify, commit if appropriate.
- Report back with actionable findings — the coordinator will synthesize your results.
- If you encounter errors, investigate and attempt to fix them before reporting failure.
- NEVER create documentation files unless explicitly instructed.
```

**Critical observation**：
- "NEVER create documentation files unless explicitly instructed" — 防止 worker 堆砌无关 .md 文件（典型 AI 助手过度作为）
- "don't gold-plate either" — explicit anti-overengineering
- "Report back with actionable findings" — 强调 output useful for synthesis

## 2. Query Loop（Mechanism 1 子机制）

### 2.1 `query()` AsyncGenerator 返回 `Terminal`

```text
src/query.ts:276 query(params: QueryParams): AsyncGenerator<…, Terminal>

On entry:
  1. Langfuse trace: own or inherit
  2. config snapshot (buildQueryConfig())
  3. deps (productionDeps() or override)
  4. queue metrics
  5. budget tracker

Loop:
  yield StreamEvent | Message | ...
  on Terminal: return Terminal
```

**Terminal 类型**（`src/query/transitions.ts:1-11`）：

```ts
type Terminal =
  | { reason: 'completed' }
  | { reason: 'blocking_limit' }
  | { reason: 'image_error' }
  | { reason: 'model_error'; error?: unknown }
  | { reason: 'aborted_streaming' }
  | { reason: 'aborted_tools' }
  | { reason: 'prompt_too_long' }
  | { reason: 'stop_hook_prevented' }
  | { reason: 'hook_stopped' }
  | { reason: 'max_turns'; turnCount: number }
```

**Continue 类型**（`src/query/transitions.ts:13-21`）：

```ts
type Continue =
  | { reason: 'collapse_drain_retry'; committed: number }
  | { reason: 'reactive_compact_retry' }
  | { reason: 'max_output_tokens_escalate' }
  | { reason: 'max_output_tokens_recovery'; attempt: number }
  | { reason: 'stop_hook_blocking' }
  | { reason: 'token_budget_continuation' }
  | { reason: 'next_turn' }
```

**结构洞察**：
- **Terminal ∪ Continue 是 disjoint union**——`query()` 的 AsyncGenerator 内部 state machine 的语义底盘
- 每个 Terminal reason 是 **可恢复性分类**：
  - `completed` / `max_turns` → 正常退出
  - `aborted_streaming` / `aborted_tools` → 用户驱动 cancel
  - `model_error` → provider 失败，可向上层 reporter
  - `stop_hook_prevented` / `hook_stopped` → hook 拦截，user 可重发
  - `prompt_too_long` → 调用方需先 compact
- **Continue 不是返回，而是过渡**——async generator `yield return Continue 不合法`，所以 `Continue` 是 embed 进 `QueryParams` 内部 state 的 `transition: Continue | undefined` 字段（`src/query.ts:273`）

### 2.2 Reducer Pattern（State + Event + Config）

```text
src/query.ts:261-274
type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<...> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: Continue | undefined
}
```

**Reducer 三段式**：
- `State`（mutable per-iteration）
- `QueryConfig`（immutable per-query）
- `QueryDeps`（DI for testing）

**config.ts 自陈**：
> "Intentionally excludes feature() gates — those are tree-shaking boundaries and must stay inline at the guarded blocks for dead-code elimination."

——config 是 pure data，gates 是 code-level separator。

**deps.ts 自陈**：
> "I/O dependencies for query(). Passing a `deps` override into QueryParams lets tests inject fakes directly instead of spyOn-per-module — the most common mocks (callModel, autocompact) are each spied in 6-8 test files today with module-import-and-spy boilerplate. Scope is intentionally narrow (4 deps) to prove the pattern. Followup PRs can add runTools, handleStopHooks, logEvent, queue ops, etc."

——后续 PR 会扩展 deps，是 reducer 抽象的预期演化。

### 2.3 `queryLoop` 内部分层（推断）

基于 import 拓扑与已知 `handleStopHooks`/`StreamingToolExecutor`/`runTools` 用法：

```text
query(params)
└── yield* queryLoop(...)       // 内部 queryLoop 函数
    └── for each turn:
        ├─ H_AC — autocompact
        ├─ H_M — callModel(deps)
        ├─ H_TU — extract tool_use blocks
        ├─ H_PT — canUseTool per tool
        ├─ H_TE — StreamingToolExecutor.run OR runTools
        ├─ H_SH — handleStopHooks (preventContinuation gate)
        ├─ H_TB — checkTokenBudget (continue gate)
        ├─ H_CT — write back to State
        └─ H_Y — yield StreamEvent | Message
```

**Critical observation**：我没有完整读过整个 `queryLoop`（80KB 文件），但**从 import 拓扑 + handleStopHooks 签名 + query/transitions.ts 设计**足以推断其结构。

## 3. Token Budget + Diminishing Returns

```text
src/query/tokenBudget.ts
COMPLETION_THRESHOLD = 0.9
DIMINISHING_THRESHOLD = 500

checkTokenBudget(tracker, agentId, budget, globalTurnTokens):
  if (agentId || budget === null || budget <= 0):
    return stop                              // ← sub-agent 不续跑
  if not (3rd continuation AND delta<500 AND last<500)
     and turnTokens < budget*0.9:
       return continue                        // ← 还可继续
  if (diminishing OR continuationCount>0):
       return stop with completionEvent
```

**两个开关**：

| 开关 | 触发 |
| --- | --- |
| `diminishing returns` | 第三次 continue 后两次 delta < 500 tokens |
| `90% threshold` | turn tokens ≥ 90% budget 触发 stop |

**`agentId` 优先 stop**：
- **只有 root agent**（无 agentId）能享受 budget continuation
- sub-agent 没有 budget continuation，由 parent 控制
- Root 与 sub-agent 责任分层：sub-agent 任务简单粗暴 → stop；root agent 智能调度 → continue

**为什么 500 tokens**：低于 500 tokens 时基本上只是 "request metadata + micro 回复"，continue 没意义。

**RoboThree 借鉴**：
- 90% 阈值直接借鉴
- Diminishing threshold (500) 是工程经验值，RoboThree 需自定（建议 1K-2K tokens）
- `agentId` 优先级 check 是非常好的设计

## 4. Hook Orchestration

### 4.1 三段式 Hook Lifecycle

```text
Stop → TaskCompleted → TeammateIdle
  ↑          ↑               ↑
  main    teammate only   teammate only
```

每个 hook event 支持：
- `yield progress messages`（工具 use id 跟踪）
- `blockingError`（累积到 `hookErrors[]`）
- `preventContinuation: true`（→ `hook_stopped_continuation` attachment）
- 抛 abort（abortController.signal.aborted → 立刻退出）

### 4.2 Stop Hook 内部流程（`handleStopHooks` 详情）

```text
src/query/stopHooks.ts:62-485 (486 行)

phase 0: 前置 bookkeeping
├─ saveCacheSafeParams     // only repl_main_thread | sdk
├─ job classifier (TEMPLATES + CLAUDE_JOB_DIR)
│     └─ 60秒 timeout race
├─ executePromptSuggestion    (fire-and-forget if non-bareMode)
├─ executeExtractMemories     (fire-and-forget if EXTRACT_MEMORIES + extract mode)
└─ executeAutoDream           (fire-and-forget if no agentId)

phase 1: executeStopHooks（并行）
└─ for await of result.message:
    ├─ progress messages → count hook, extract command + promptText
    ├─ attachment with 'Stop' | 'SubagentStop' hookEvent:
    │   ├─ hook_non_blocking_error → hookErrors.push
    │   ├─ hook_error_during_execution → hookErrors.push
    │   └─ hook_success → check stdout/stderr hasOutput
    ├─ per-hook durationMs match
    └─ if result.blockingError: UserMessage isMeta:true + yield
    └─ if result.preventContinuation: hook_stopped_continuation attachment

phase 2: if isTeammate():
    ├─ listTasks(taskListId)
    ├─ for each in_progress task owned by this teammate:
    │   └─ executeTaskCompletedHooks(taskId, ...) → loop similar to Stop
    └─ executeTeammateIdleHooks(teammateName, teamName, permissionMode)

return { blockingErrors, preventContinuation }
```

### 4.3 关键设计点

1. **`isMeta:true` UserMessage**（`stopHooks.ts:273`）：hook error message 标 `isMeta: true` 不显示给 UI，但显示给 model 是 hidden。这意味着 **error 自动注入下次 model context 但不污染 UI**

2. **`durationMs` per hook**（`stopHooks.ts:255-265`）：并行执行时按 `command + 第一个未 assigned durationMs` 匹配——简单但有效

3. **`hook_stopped_continuation` attachment**（`stopHooks.ts:284-292`）：钩子拒绝 continuation 时不直接 stop，而是创建 attachment 让 UI 知道"为什么 stop"

4. **60s race on job classifier**（`stopHooks.ts:124-128`）：用 `setTimeout().unref()` 防 block exit

5. **`shouldAvoidPermissionPrompts` and `awaitAutomatedChecksBeforeDialog`**（`Tool.ts:124-126`）：
   - `shouldAvoidPermissionPrompts?: boolean` — background agents（不能 show UI）
   - `awaitAutomatedChecksBeforeDialog?: boolean` — coordinator workers（先跑 hooks 再显示 dialog）

6. **Ant-only feature flags**（`stopHooks.ts:175-184`）：
   - Computer Use MCP 清理只在主线程跑（`!toolUseContext.agentId`）
   - sub-agent 跳过，因为 CU lock 是 process-wide module-level variable

### 4.4 为什么 TaskCompleted 和 TeammateIdle 只在 Teammate 跑

- `Stop` 是 main turn 终止
- `TaskCompleted` 是 "我正在做某个 Task 做完了" — 只有 teammate 有 multi-task
- `TeammateIdle` 是 "我现在没事干请给我任务" — 只对 teammate

这等价于 Anthropic 多代理协议中的 task lifecycle。RoboThree 借鉴：sub-agent（如果存在）需要独立 hooks 三件套。

## 5. 协议关键 XML / Protocol 模式（RoboThree 借鉴清单）

> 这一节列出 RoboThree 多代理层可借鉴的具体协议 schema（不复制代码字面）。

### 5.1 `<task-notification>` worker 报告协议

```xml
<task-notification>
<task-id>{agentId}</task-id>
<status>completed | failed | killed</status>
<summary>{description}</summary>
<result>{final text}</result>          <!-- optional -->
<usage>
  <total_tokens>N</total_tokens>
  <tool_uses>N</tool_uses>
  <duration_ms>N</duration_ms>
</usage>
</task-notification>
```

**RoboThree 借鉴**：
- 可改为 JSON 或 Protobuf（XML 不是必须）
- 字段名即可借鉴：`task_id`、`status`、`summary`、`result`、`usage.{total_tokens,tool_uses,duration_ms}`
- 设计原则：worker 结果以 user-message 注入（不是 tool-result），让 coordinator 自然合成

### 5.2 Tool Name Constants（RoboThree 应直接采纳）

```typescript
// packages/builtin-tools/tools/BashTool/toolName.ts
export const BASH_TOOL_NAME = 'Bash'    // not hardcoded anywhere else
```

**RoboThree 借鉴**：
- 每个 tool name 一个常量 export
- 在 `constants/tools.ts` 维护 `ALL_TOOL_NAMES`、`ASYNC_AGENT_ALLOWED_TOOLS`、`COORDINATOR_MODE_ALLOWED_TOOLS`、`ALL_AGENT_DISALLOWED_TOOLS`

### 5.3 Worker Tools Filter Pattern

```typescript
const INTERNAL_ORCHESTRATION_TOOLS = new Set([
  TEAM_CREATE, TEAM_DELETE, SEND_MESSAGE, SYNTHETIC_OUTPUT
])

const workerTools = ASYNC_AGENT_ALLOWED_TOOLS
  .filter(name => !INTERNAL_ORCHESTRATION_TOOLS.has(name))
```

**借鉴**：RoboThree 多代理层应维护 `workerTools = ALL_TOOLS - INTERNAL_ORCHESTRATION_TOOLS`

### 5.4 Coordinator MatchSessionMode（resume 一致性）

```typescript
matchSessionMode(sessionMode: 'coordinator'|'normal'|undefined):
  if (!sessionMode) return undefined
  if (sessionIsCoordinator && !currentIsCoordinator) {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'  // 翻 env
    logEvent('tengu_coordinator_mode_switched', ...)
    return 'Entered coordinator mode to match resumed session.'
  }
```

**RoboThree 借鉴**：session-resume 时反演 mode 设置，保持 persisted session 与 runtime 一致，不需要用户重新输入 CLI flag。

## 6. Hop Evidence（query loop 整体）

> 已经包含在 runtime-sequence.md § 4。这里只补充 Coordinator 特有跳。

| Hop | 描述 | File | Lines |
| --- | --- | --- | --- |
| C-H1 | User → REPL | `src/main.tsx` | — |
| C-H2 | isCoordinatorMode gate | `src/coordinator/coordinatorMode.ts` | `36-41` |
| C-H3 | getCoordinatorUserContext | `src/coordinator/coordinatorMode.ts` | `80-109` |
| C-H4 | getCoordinatorSystemPrompt | `src/coordinator/coordinatorMode.ts` | `111-369` |
| C-H5 | Worker AgentTool dispatch | `builtin-tools/tools/AgentTool/AgentTool.js` | (interp) |
| C-H6 | WORKER_AGENT lookup | `src/coordinator/workerAgent.ts` | `41-67` |
| C-H7 | Worker tool filter | `src/coordinator/workerAgent.ts` | `24-39` |
| C-H8 | QueryEngine spawn worker | `src/QueryEngine.ts` | — |
| C-H9 | Worker `<task-notification>` emit | `src/coordinator/coordinatorMode.ts` (system prompt contract) | `142-164` |
| C-H10 | matchSessionMode (resume) | `src/coordinator/coordinatorMode.ts` | `49-78` |

## 7. 对 RoboThree 的结论（5 类）

| 模式 | 类别 | 理由 |
| --- | --- | --- |
| **Coordinator / Worker 5 段 System Prompt** | **ADOPT（设计模式）** | 5 段分工清晰，Worker 不能 spawn，protocol 完整 |
| **`ASYNC_AGENT_ALLOWED_TOOLS` 白名单** | **ADOPT 直接** | 简单集合，借鉴模式无需法律复核 |
| **`<task-notification>` XML 协议** | **ADAPT 严重** | XML → JSON/Protobuf；schema 借鉴；不以 user-message 而以 tool-result 形式 vs 选择需 RoboThree 自己拍 |
| **`matchSessionMode` resume 一致性** | **ADOPT 直接** | 模式简单清晰，1 function 即可 |
| **Coordinator 拒绝 lazy delegation 原则**（"Always synthesize"） | **ADOPT 直接** | 文化层面，RoboThree 也需明确 |
| **`query(): AsyncGenerator<…, Terminal>`** | **ADOPT 直接** | 用 TypeScript / Rust async stream 借鉴 |
| **`Terminal` ∪ `Continue` disjoint union** | **ADOPT 直接** | 是 Reducer 的语义底盘 |
| **`QueryConfig` immutable snapshot + `QueryDeps` DI** | **ADOPT 直接** | 这是 reducer 标准模式，借鉴无需 license 复核 |
| **Token Budget Diminishing Returns** | **ADAPT** | 90% + 500 tokens threshold 是经验值，RoboThree 需自定 |
| **Hook 三段式 Stop → TaskCompleted → TeammateIdle** | **ADAPT 严重** | RoboThree 简化 1-2 段即可；agent 层级多则完整 3 段 |
| **`isMeta:true` hidden user-message** | **ADOPT 直接** | isMeta 是个 bool flag，借鉴简单 |
| **`hook_stopped_continuation` attachment** | **ADAPT** | 改为 RoboThree 自家 attachment protocol |
| **`feature('COORDINATOR_MODE')` DCE pattern** | **DEFER** | Bun 专属能力，RoboThree 不用 Bun 时需替换实现（如 `#ifdef`/compile-time 替换）|
| **`tengu_*` Statsig gate keys / 内部命名** | **REJECT** | Anthropic 内部代号 |
| **`CLAUDE_CODE_*` env key 命名** | **REJECT** | 商标权属风险 |
| **`getCoordinatorSystemPrompt()` 5 段 50+ examples 注释** | **REJECT 复制**；**ADOPT 设计骨架** | 注释本身的措辞不能复用，但设计骨架可借鉴 |

## 8. Overall Win

✅ **协议 + state machine + DI pattern + reducer** —— 4 个独立维度都 ADOPT/ADAPT 严重。
❌ **5 段 prompt 的具体 examples** — REJECT 复制（措辞属创造性表达）。
⚠️ **`feature()` 边界** — DEFER（Bun 专属）。

详见 [robothree-fit-analysis.md §Coordinator](robothree-fit-analysis.md#1-coordinator--worker-多代理)。
