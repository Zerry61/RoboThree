# RoboThree Fit Analysis — claude-code-best/claude-code

> Stage D 输出。每个机制给出 5 类定性结论 + 理由 + 证据 + 适用边界 + 风险 + MVP 必要性。
> 默认不写 ADR（Skill § 14.3），仅在影响 RoboThree 模块边界/数据模型/安全模型/部署方式时建议。

## 元约束（License 触发表）

本研究仓库内所有架构结论的"再使用"等级为 **DESIGN_ONLY / LICENSE_RISK**（详见 [license-review.md](license-review.md)）。

含义：
- ✅ 可借鉴：接口设计、算法骨架、协议 schema、命名概念
- ❌ 不可照搬：内部代号（`tengu_*`、`CLAUDE_CODE_*`、`@anthropic/ink` 等）
- ⚠️ 部分借鉴：需 LEGAL_REVIEW_REQUIRED（如 `O_NOFOLLOW \| O_EXCL` 安全模式的具体行级借鉴）

## §1 Coordinator / Worker 多代理

### 1.1 Coordinator → Worker XML 协议（`<task-notification>`）

- **结论**：**ADOPT（设计模式）**
- **理由**：5 段 system prompt + 协议 schema 设计清晰，`<task-notification>` XML 把 worker 结果以 user-message 注入 coordinator 是优秀的人因设计。
- **证据**：`src/coordinator/coordinatorMode.ts:142-164`（system prompt 内 protocol schema）、`coordinatorMode.ts:111-369`（5 段 prompt）
- **适用边界**：RoboThree 多代理层（包括 worker agent 类型、coordinator orchestration 角色）
- **风险**：低。协议 schema 是 design pattern，借鉴无 IP 风险（schema 不是可版权的具体表达）。
- **MVP 是否需要**：**是**。RoboThree v0.1 plan 阶段即可采纳 5 段 prompt 作为骨架。
- **动作**：
  - [ ] RoboThree v0.1 `agents/coordinator/prompt.md` 借鉴 5 段骨架
  - [ ] RoboThree `<task-notification>` schema 定稿（建议改为 JSON 或 Protobuf）
  - [ ] 不要 import 仓库内任何文件作为"参考"——RoboThree 自家重写

### 1.2 `matchSessionMode` Resume 一致性

- **结论**：**ADOPT 直接**
- **理由**：简单的 env-反演函数，让 persisted session mode 与 runtime 同步。
- **证据**：`src/coordinator/coordinatorMode.ts:49-78`
- **适用边界**：RoboThree session resume 流程
- **风险**：低。函数仅 ~30 行，pattern 可借鉴。
- **MVP 是否需要**：**是**。Resume 是 RoboThree v0.1 必出能力。
- **动作**：
  - [ ] `robothree/session/matchMode.ts` 实现（≤40 行）

### 1.3 Worker Tools 过滤（INTERNAL_ORCHESTRATION_TOOLS 排除）

- **结论**：**ADOPT 直接**
- **理由**：防止 sub-agent 递归 spawn 的简单 set 过滤。
- **证据**：`src/coordinator/workerAgent.ts:24-39`、`src/coordinator/coordinatorMode.ts:29-34`
- **适用边界**：RoboThree 多代理层的 worker agent 工具白名单
- **风险**：低。
- **MVP 是否需要**：**是**。
- **动作**：
  - [ ] `robothree/agents/worker/allowedTools.ts` 定义 `INTERNAL_ORCHESTRATION_TOOLS` 常量
  - [ ] `robothree/agents/worker/filterTools.ts` 实现过滤函数

### 1.4 Coordinator Prompt "Never hand off understanding" 原则

- **结论**：**ADOPT 直接**（设计原则层）
- **理由**：防止 lazy delegation 是产品级原则，不是实现细节。
- **证据**：`src/coordinator/coordinatorMode.ts:255-260` "Always synthesize — your most important job"
- **适用边界**：RoboThree 多代理 prompt 设计准则
- **风险**：无。
- **MVP 是否需要**：**是**。

### 1.5 `query(): AsyncGenerator<…, Terminal>` + `Terminal ∪ Continue`

- **结论**：**ADOPT 直接**
- **理由**：Reducer state machine 的标准 AsyncGenerator 形态。`Terminal` disjoint union 把"为什么退出"分类清楚。
- **证据**：`src/query.ts:276`（query signature）、`src/query/transitions.ts:1-21`（Terminal ∪ Continue）
- **适用边界**：RoboThree Agent Runtime 层
- **风险**：低。
- **MVP 是否需要**：**是**。
- **动作**：
  - [ ] RoboThree `runtime/types.ts` 定义 `Terminal` disjoint union
  - [ ] RoboThree `runtime/query.ts` 是 `AsyncGenerator<TurnEvent, Terminal>`

### 1.6 `QueryConfig` immutable snapshot + `QueryDeps` DI

- **结论**：**ADOPT 直接**
- **理由**：Reducer 三段式（State, Config, Deps）的标准范式，scope narrow to 4 deps "to prove the pattern"。
- **证据**：`src/query/config.ts:15-46`、`src/query/deps.ts:21-40`
- **适用边界**：RoboThree Agent Runtime
- **风险**：低。
- **MVP 是否需要**：**是**。
- **动作**：
  - [ ] `robothree/runtime/config.ts` `QueryConfig` type（immutable snapshot）
  - [ ] `robothree/runtime/deps.ts` `QueryDeps` type（DI override）

### 1.7 Token Budget Diminishing Returns

- **结论**：**ADAPT**（90% 阈值 + agentId 优先 stop 直接借鉴；500 tokens threshold 经验值需自定）
- **理由**：2 阈值（90% budget + 3 次后 delta < threshold）逻辑清晰。`agentId` 优先 stop 是责任分层设计。
- **证据**：`src/query/tokenBudget.ts:45-93`、`COMPLETION_THRESHOLD=0.9`、`DIMINISHING_THRESHOLD=500`
- **适用边界**：RoboThree budget 控制
- **风险**：低。
- **MVP 是否需要**：**是**（先简单 90% 阈值，diminishing 在 v0.2+ 加）。
- **动作**：
  - [ ] `robothree/budget/check.ts` 借鉴 90% 阈值
  - [ ] RoboThree v0.2+ 加 diminishing（threshold 自定 1K-2K tokens）

### 1.8 Hook 三段式 Stop → TaskCompleted → TeammateIdle

- **结论**：**ADAPT 严重**
- **理由**：teammate 视角的三段结构。RoboThree sub-agent 层级简化需自选。建议 v0.1 仅 `Stop`，v0.2+ 加 `TaskCompleted/TeammateIdle`。
- **证据**：`src/query/stopHooks.ts:62-485`
- **适用边界**：RoboThree hook lifecycle
- **风险**：中。3 段 lifecycle 是设计选择，非简单借用——多 agent 时是否适用 RoboThree 需仔细设计。
- **MVP 是否需要**：**部分**（MVP 仅 `Stop`，v0.2 加 teammate 子模块）
- **动作**：
  - [ ] v0.1 `robothree/hooks/stop.ts`
  - [ ] v0.2 评估 sub-agent 引入后是否需要 TaskCompleted/TeammateIdle

### 1.9 `isMeta: true` hidden user-message

- **结论**：**ADOPT 直接**
- **理由**：flag 字段级 pattern，简单清晰。
- **证据**：`src/query/stopHooks.ts:270-275`
- **适用边界**：RoboThree message tagging
- **风险**：无。
- **MVP 是否需要**：**是**。

### 1.10 `hook_stopped_continuation` attachment

- **结论**：**ADAPT**
- **理由**：attachment pattern 是设计选择。RoboThree 可简化或采用 attachment + stopReason 双向表达。
- **证据**：`src/query/stopHooks.ts:284-292`
- **适用边界**：RoboThree hook output schema
- **风险**：低。
- **MVP 是否需要**：**是**。

### 1.11 `feature('COORDINATOR_MODE')` Bun DCE

- **结论**：**DEFER**
- **理由**：Bun 专属能力。RoboThree 不用 Bun 时需选替代：编译时 `#ifdef` / `import.meta.env` / post-build replace。
- **证据**：`src/coordinator/coordinatorMode.ts:1` `import { feature } from 'bun:bundle'`
- **适用边界**：RoboThree build-time feature gating
- **风险**：低（无需立刻实现）。
- **MVP 是否需要**：**否**（DEFER 到 build pipeline 设计阶段）

### 1.12 Anthropic 内部代号（`tengu_*`、`CLAUDE_CODE_*`）

- **结论**：**REJECT**
- **理由**：商标 / 内部代号权属不清。
- **证据**：多处 `tengu_*`、`CLAUDE_CODE_*`、Anthropic 内部命名约定
- **适用边界**：禁止 RoboThree 使用任何 Claude Code 内部代号。
- **风险**：高（IP 风险）
- **MVP 是否需要**：—（避免）

---

## §2 Tool Runtime

### 2.1 `ToolUseContext` 单 context 设计

- **结论**：**ADOPT 设计骨架**
- **理由**：30+ fields 全部在一个 context，让 tool 跨 call 共享。但 RoboThree 需根据自家工具集简化（无需 `langfuseTrace`、`sendOSNotification` 等）。
- **证据**：`src/Tool.ts:149-249`
- **适用边界**：RoboThree Tool 调用上下文（推荐保留核心 fields：`options`、`abortController`、`setAppState`、`setAppStateForTasks`、`agentId`、`agentType`）
- **风险**：低。
- **MVP 是否需要**：**是**。
- **动作**：
  - [ ] `robothree/tools/UseContext.ts` 30+ fields（按 RoboThree 需求裁减）

### 2.2 `ToolPermissionContext` `DeepImmutable<...>` 包装

- **结论**：**ADOPT 直接**
- **理由**：TypeScript 标准 immutability pattern。许可门槛低。
- **证据**：`src/Tool.ts:113` `DeepImmutable<...>` 包装，`src/Tool.ts:114-129` Permission 子结构
- **适用边界**：RoboThree Permission 系统
- **风险**：无。
- **MVP 是否需要**：**是**。
- **动作**：
  - [ ] `robothree/permissions/context.ts` `DeepImmutable<T>` wrapper + 子结构

### 2.3 `getEmptyToolPermissionContext()` 默认 `mode:'default'` (default-ask)

- **结论**：**ADOPT 直接**
- **理由**：default-ask 是 safer than default-allow。default-deny 必须显式 bypassPermissions。
- **证据**：`src/Tool.ts:131-139`
- **适用边界**：RoboThree 默认 permission policy
- **风险**：低。
- **MVP 是否需要**：**是**。
- **动作**：
  - [ ] RoboThree 默认 mode = `'default'`（default-ask）
  - [ ] bypass 仍为 opt-in（不默认开启）

### 2.4 `shouldAvoidPermissionPrompts` (background agents)

- **结论**：**ADOPT 直接**
- **理由**：background agents 无法 show UI，必须 force-deny ambiguous。
- **证据**：`src/Tool.ts:124` `shouldAvoidPermissionPrompts?: boolean`
- **适用边界**：RoboThree 后台任务 / daemon workers
- **风险**：低。
- **MVP 是否需要**：**是**（若有 background jobs）。

### 2.5 `awaitAutomatedChecksBeforeDialog` (coordinator workers)

- **结论**：**ADOPT 直接**
- **理由**：coordinator workers 先跑 hooks classifier 再 UI prompt。
- **证据**：`src/Tool.ts:126`
- **适用边界**：RoboThree coordinator worker
- **风险**：低。
- **MVP 是否需要**：**是**（多代理 v0.1+）。

### 2.6 `prePlanMode?: PermissionMode` mode 切换栈式语义

- **结论**：**ADOPT 直接**
- **理由**：plan-mode 切换保留原 mode，退出时 restore。
- **证据**：`src/Tool.ts:128`
- **适用边界**：RoboThree 多 mode 切换（plan / autonomous / task）
- **风险**：无。
- **MVP 是否需要**：**是**（plan mode 是 v0.1 推荐功能）。

### 2.7 `additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>`

- **结论**：**ADOPT 设计概念**
- **理由**：多 working dir 安全边界。
- **证据**：`src/Tool.ts:116`
- **适用边界**：RoboThree 安全隔离
- **风险**：低。
- **MVP 是否需要**：**部分**（v0.2+ 加多 dir）

### 2.8 Tool 名常量化

- **结论**：**ADOPT 直接**
- **理由**：工程卫生措施。
- **证据**：`packages/builtin-tools/tools/BashTool/toolName.ts` `BASH_TOOL_NAME`，`@claude-code-best/builtin-tools/tools/{FileEditTool/FileReadTool/...}/{constants,prompt}`
- **适用边界**：RoboThree 所有 tool 命名
- **风险**：无。
- **MVP 是否需要**：**是**。

### 2.9 `TOOL_PRESETS` 工具预设

- **结论**：**ADAPT**
- **理由**：当前仅 `['default']`，但 API 已就绪。RoboThree 应加上 `'readonly'`、`'minimal'` 等预设。
- **证据**：`src/tools.ts:186-196`
- **适用边界**：RoboThree `--tools` CLI flag
- **风险**：低。
- **MVP 是否需要**：**部分**（v0.2+）。

### 2.10 Tool 白/黑名单分级（4 个常量）

- **结论**：**ADOPT 直接**
- **理由**：4 等级（`ALL_AGENT_DISALLOWED_TOOLS`、`CUSTOM_AGENT_DISALLOWED_TOOLS`、`ASYNC_AGENT_ALLOWED_TOOLS`、`COORDINATOR_MODE_ALLOWED_TOOLS`）是 permission 灵活性的基础。
- **证据**：`src/tools.ts:113-118` import
- **适用边界**：RoboThree 工具权限系统
- **风险**：低。
- **MVP 是否需要**：**是**。

### 2.11 `SyntheticOutputTool` 抽 structured output

- **结论**：**ADOPT 设计概念**
- **理由**：SDK 消费方需要结构化输出。
- **证据**：`packages/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js`
- **适用边界**：RoboThree SDK 接口
- **风险**：低。
- **MVP 是否需要**：**是**（若 RoboThree 提供 SDK）。

### 2.12 `EnterPlanModeTool` + `ExitPlanModeV2Tool`

- **结论**：**ADAPT**
- **理由**：plan-mode 模型自驱动是 good UX。RoboThree 是否采用看产品定位。
- **证据**：`packages/builtin-tools/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js`
- **适用边界**：RoboThree plan mode
- **风险**：低。
- **MVP 是否需要**：**是**（v0.1 推荐）。

### 2.13 `process.env.USER_TYPE === 'ant'` 模式

- **结论**：**REJECT**
- **理由**：绕过 `feature()` DCE，反模式。
- **证据**：`src/tools.ts:17-25`
- **适用边界**：RoboThree 无对应物，禁止出现。
- **风险**：中（RoboThree 应明确禁止任何环境变量绕过 build gate）。
- **MVP 是否需要**：—（避免）

### 2.14 MCP channel-based permission

- **结论**：**ADAPT 严重**
- **理由**：channel 概念借鉴（user/project/session 维度）。具体实现需按 MCP 标准。
- **证据**：`src/services/mcp/channelPermissions.ts`、`channelAllowlist.ts`、`channelNotification.ts`
- **适用边界**：RoboThree MCP 集成
- **风险**：中。
- **MVP 是否需要**：**否**（v0.2+ MCP 集成时）。

### 2.15 `StreamingToolExecutor` vs `runTools`

- **结论**：**ADOPT 设计概念**
- **理由**：单 tool stream vs 多 tool parallel 是好的 dual mode 设计。
- **证据**：`src/query.ts:108` (StreamingToolExecutor)、`src/query.ts:110` (runTools)
- **适用边界**：RoboThree Tool Runtime
- **风险**：低。
- **MVP 是否需要**：**是**。
- **动作**：
  - [ ] `robothree/tools/executor.ts` 单 stream 抽象
  - [ ] `robothree/tools/orchestration.ts` 多 parallel 抽象

---

## §3 Skill / Plugin / MCP 生态

### 3.1 `Command = Skill` 统一抽象

- **结论**：**ADOPT 设计**（bundled / loaded / mcp 三源一抽象）
- **理由**：`BundledSkillDefinition` 用 14 个 fields cover file-based / bundled / mcp-sourced 三类 skill 来源。
- **证据**：`src/skills/bundledSkills.ts:15-41`
- **适用边界**：RoboThree Skill 层
- **风险**：低。
- **MVP 是否需要**：**是**。

### 3.2 Skill 文件提取安全（5 道防线）

- **结论**：**ADOPT 设计骨架**（需 LEGAL_REVIEW_REQUIRED）
- **理由**：per-process nonce / 0o700-0o600 mode / `O_NOFOLLOW|O_EXCL` / path traversal reject / no unlink+retry。
- **证据**：`src/skills/bundledSkills.ts:131-206`
- **适用边界**：RoboThree plugin / skill 缓存写文件
- **风险**：中。安全模式借鉴建议附 "inspired by" 注释。
- **MVP 是否需要**：**是**。
- **动作**：
  - [ ] RoboThree Legal 工单：借鉴 5 道防线安全 pattern
  - [ ] 在借鉴处加 `// inspired by Claude Code security model` 注释

### 3.3 `context: 'inline' | 'fork'` skill 上下文控制

- **结论**：**ADOPT 直接**
- **理由**：inline vs fork 是 skill 隔离的基础。
- **证据**：`src/skills/bundledSkills.ts:27`
- **适用边界**：RoboThree skill execution context
- **风险**：无。
- **MVP 是否需要**：**是**。

### 3.4 `agent?: string` 在 skill 中

- **结论**：**ADOPT 设计**
- **理由**：让 skill 选择 agent type。
- **证据**：`src/skills/bundledSkills.ts:28`
- **适用边界**：RoboThree skill-execution 链路
- **风险**：无。
- **MVP 是否需要**：**是**。

### 3.5 `disableModelInvocation` 防止 skill 自我递归

- **结论**：**ADOPT 直接**
- **理由**：skill 安全必须项。
- **证据**：`src/skills/bundledSkills.ts:23`
- **适用边界**：RoboThree skill flags
- **风险**：无。
- **MVP 是否需要**：**是**。

### 3.6 `hooks?: HooksSettings` skill 级别 hook

- **结论**：**ADOPT 直接**
- **理由**：skill 自带 hook。
- **证据**：`src/skills/bundledSkills.ts:26`
- **适用边界**：RoboThree skill 生命周期
- **风险**：无。
- **MVP 是否需要**：**是**。

### 3.7 MCP 标准实现（client, auth, transport, elicitation, envExpansion）

- **结论**：**ADAPT 严重**（必须按 MCP 标准；具体实现需自写）
- **理由**：MCP 标准是事实标准。88KB auth.ts 暗示 OAuth 2.0+ complexity。
- **证据**：`src/services/mcp/*.ts` 共 ~310KB
- **适用边界**：RoboThree MCP Host
- **风险**：中。MCP 实现复杂，必须按官方 SDK。
- **MVP 是否需要**：**部分**（v0.2+ MCP 集成）。

### 3.8 MCP InProcessTransport（internal servers）

- **结论**：**ADOPT 设计概念**
- **理由**：同进程 MCP 给内部 server 用。
- **证据**：`src/services/mcp/InProcessTransport.ts`
- **适用边界**：RoboThree internal MCP servers
- **风险**：低。
- **MVP 是否需要**：**否**。

### 3.9 MCP `elicitationHandler` -32042

- **结论**：**ADOPT 直接**（按 MCP 标准）
- **理由**：MCP 标准要求实现 elicitations。
- **证据**：`src/services/mcp/elicitationHandler.ts`
- **适用边界**：RoboThree MCP Host
- **风险**：低。
- **MVP 是否需要**：**否**（v0.2+）。

### 3.10 MCP envExpansion（env var 展开 in config）

- **结论**：**ADOPT 直接**
- **理由**：简单功能。
- **证据**：`src/services/mcp/envExpansion.ts`
- **适用边界**：RoboThree MCP config loader
- **风险**：无。
- **MVP 是否需要**：**否**（v0.2+）。

### 3.11 MCP-sourced Skill 桥接（`mcpSkillBuilders`）

- **结论**：**ADOPT 设计**
- **理由**：MCP → Skill 包装是好设计。
- **证据**：`src/skills/mcpSkillBuilders.ts`、`src/skills/mcpSkills.ts`
- **适用边界**：RoboThree MCP integration
- **风险**：低。
- **MVP 是否需要**：**否**（v0.2+）。

### 3.12 `@ant/model-provider` 多 Provider 抽象

- **结论**：**ADOPT 设计概念**
- **理由**：RoboThree 至少有 openai / anthropic / 国产 LLM 三家。
- **证据**：`@ant/model-provider` workspace `EMPTY_USAGE`、`NonNullableUsage`
- **适用边界**：RoboThree Provider 层
- **风险**：低。
- **MVP 是否需要**：**是**（v0.1+）。
- **动作**：
  - [ ] `robothree/providers/types.ts` 多 Provider interface
  - [ ] `NonNullableUsage<T>` 类型

### 3.13 Plugin system 完整接口

- **结论**：**NEEDS_MORE_EVIDENCE**（未深挖 `pluginLoader.ts`）
- **理由**：本次未深入研究 plugin loader。
- **证据**：—
- **适用边界**：— 待补
- **风险**：—
- **MVP 是否需要**：— 待补
- **需补**：read `src/utils/plugins/pluginLoader.ts`、`src/plugins/builtinPlugins.ts` 全文。

### 3.14 Computer-Use MCP / Chicago

- **结论**：**REJECT**（attack surface 过大）
- **理由**：控制 mouse/keyboard 模拟用户操作是巨大 attack surface。RoboThree 不实现 Computer Use 类 MCP server。
- **证据**：`packages/@ant/computer-use-{mcp,input,swift}/`
- **适用边界**：RoboThree 不实现
- **风险**：高
- **MVP 是否需要**：—（避免）

---

## §4 其他可借鉴元素

### 4.1 `queryCheckpoint` + `headlessProfilerCheckpoint` + `startupProfilerCheckpoint`

- **结论**：**ADAPT**
- **理由**：3 个 profiler 覆盖不同生命周期。RoboThree 可借鉴 startup profiler + query profiler。
- **证据**：`src/utils/{queryProfiler,headlessProfiler,startupProfiler}.ts`
- **适用边界**：RoboThree 启动 / Query 监控
- **风险**：低。
- **MVP 是否需要**：**是**（startup profiler）。

### 4.2 Langfuse / OpenTelemetry 全链路 trace

- **结论**：**ADAPT 严重**（no PII / opt-in）
- **理由**：可观测性强但 PII 风险高。
- **证据**：`src/services/langfuse/index.ts` per-Query trace
- **适用边界**：RoboThree observability
- **风险**：高（PII 风险）
- **MVP 是否需要**：**否**（v0.2+）

### 4.3 `claude list` `state.json` + Job Classifier

- **结论**：**NEEDS_MORE_EVIDENCE**（feature-gated `TEMPLATES` + `CLAUDE_JOB_DIR`）
- **理由**：背景作业分类系统未深挖。
- **证据**：`src/query/stopHooks.ts:97-129`、`src/jobs/classifier.js`（gated）
- **适用边界**：—
- **MVP 是否需要**：—

### 4.4 包内 `cli.tsx` 早期 fast-path（version/dump-system-prompt）

- **结论**：**ADOPT 直接**
- **理由**：`if (args[0] === '--version') { console.log(MACRO.VERSION); return; }` 零模块加载直接返回。
- **证据**：`src/entrypoints/cli.tsx:54-58`
- **适用边界**：RoboThree CLI fast-path
- **风险**：低。
- **MVP 是否需要**：**是**。

### 4.5 `MACRO` build-time injection

- **结论**：**ADOPT 设计概念**
- **理由**：build-time 设 `MACRO.VERSION`、`MACRO.BUILD_TIME` 等常量，runtime 不依赖 config 文件。
- **证据**：`src/entrypoints/cli.tsx:6-14`
- **适用边界**：RoboThree build pipeline
- **风险**：低。
- **MVP 是否需要**：**部分**（v0.2+ build）。

---

## §5 跨机制整合建议（RoboThree 落地方案）

### 5.1 RoboThree Agent Runtime v0.1 模块边界（基于本研究）

```text
robothree/
├── runtime/
│   ├── query.ts                ← ADOPT 1.5/1.6 (AsyncGenerator<…,Terminal>)
│   ├── config.ts               ← ADOPT 1.6 (immutable QueryConfig)
│   ├── deps.ts                 ← ADOPT 1.6 (QueryDeps DI)
│   └── transitions.ts          ← ADOPT 1.5 (Terminal ∪ Continue union)
├── tools/
│   ├── UseContext.ts           ← ADOPT 2.1 (单 context)
│   ├── executor.ts             ← ADOPT 2.15 (single stream)
│   ├── orchestration.ts        ← ADOPT 2.15 (multi parallel)
│   ├── permissions/
│   │   ├── context.ts          ← ADOPT 2.2 (DeepImmutable)
│   │   ├── defaults.ts         ← ADOPT 2.3 (mode='default')
│   │   └── bgFlag.ts           ← ADOPT 2.4 (shouldAvoidPermissionPrompts)
│   ├── constants.ts            ← ADOPT 2.8 (tool names)
│   └── presets.ts              ← ADAPT 2.9
├── agents/
│   ├── coordinator/
│   │   ├── prompt.md           ← ADOPT 1.1 (5 段骨架)
│   │   ├── workers.ts          ← ADOPT 1.3 (filter internal)
│   │   └── protocol.ts         ← ADOPT 1.1 (task-notification schema)
│   ├── worker/
│   │   ├── allowedTools.ts     ← ADOPT 1.3
│   │   └── filterTools.ts      ← ADOPT 1.3
│   └── matchMode.ts            ← ADOPT 1.2
├── budget/
│   └── check.ts                ← ADOPT 1.7 (90% + agentId priority)
├── hooks/
│   ├── stop.ts                 ← ADAPT 1.8 (v0.1)
│   └── taskCompleted.ts        ← ADAPT 1.8 (v0.2)
├── messages/
│   ├── isMeta.ts               ← ADOPT 1.9
│   └── attachments.ts          ← ADAPT 1.10
├── skills/
│   ├── types.ts                ← ADOPT 3.1 (BundledSkillDefinition)
│   ├── safeFile.ts             ← ADOPT 3.2 (5 道防线, LEGAL_REVIEW_REQUIRED)
│   ├── loader-disk.ts          ← ADOPT 3.1
│   ├── loader-mcp.ts           ← ADAPT 3.11
│   └── register.ts             ← ADOPT 3.1
├── plugins/
│   └── loader.ts               ← NEEDS_MORE_EVIDENCE（待补）
├── providers/
│   ├── types.ts                ← ADOPT 3.12
│   ├── anthropic.ts
│   ├── openai.ts
│   └── usage.ts                ← ADOPT 3.12 (NonNullableUsage)
├── budget/
│   └── check.ts                ← ADOPT 1.7
└── hooks/
    └── isMeta.ts               ← ADOPT 1.9
```

### 5.2 `Proposed RoboThree Changes` 候选清单

> 列出会影响 RoboThree 模块边界 / 技术栈 / 数据模型 / 安全模型 / 部署形态的候选变更。**仅作为提议，未自动落地。**

1. **ADOPT** `query(): AsyncGenerator<…, Terminal>` —— Runtime 模块边界主要决定因素。
2. **ADOPT** `QueryConfig` + `QueryDeps` reducer 三段式 —— Runtime 数据模型核心。
3. **ADOPT** `BundledSkillDefinition` 统一 Skill 抽象 —— Skill 模块边界主要决定因素。
4. **ADOPT** `O_NOFOLLOW | O_EXCL` 安全写入模式 —— Plugin / Skill 文件系统层安全模型。
5. **ADOPT** `shouldAvoidPermissionPrompts` + `awaitAutomatedChecksBeforeDialog` —— Permission 模块 UX 分层。
6. **ADAPT** MCP channel-based permission —— MCP 集成阶段（v0.2+）影响 Permission 模块。
7. **ADAPT** Hook lifecycle 3 段（v0.2+）—— Agent Runtime hook 设计。
8. **ADAPT** 多 Provider 抽象 —— Provider 模块边界。
9. **DEFER** Bun `feature()` DCE —— Build pipeline 设计阶段考虑。
10. **REJECT** Anthropic 内部代号 + Computer-Use —— 不进入产品。

### 5.3 `Requires Human Approval`

> 需要用户拍板才能推进 RoboThree 正式架构决策的项。默认状态：`PENDING_HUMAN_DECISION`。

| 编号 | 项目 | 选项 | 默认 |
| --- | --- | --- | --- |
| HA-1 | `<task-notification>` 协议序列化格式 | JSON / XML / Protobuf | JSON（建议）|
| HA-2 | 是否实现 Multi-Agent（Coordinator/Worker） | YES / NO / DEFER v0.2+ | YES v0.1（建议）|
| HA-3 | `O_NOFOLLOW` 安全模式借鉴范围 | 全借鉴 / 仅描述 / 不借鉴 | 仅描述（建议）|
| HA-4 | 是否引入 Computer-Use 类 | NO / YES / 仅 sandbox 内 | NO（建议）|
| HA-5 | 是否把 anthropic SDK 作为 optional 依赖 | YES / NO | NO（避免依赖绑定）|
| HA-6 | Permission 默认模式 | `'default'` (default-ask) / `'acceptAll'` (default-allow) | `'default'`（建议）|
| HA-7 | 是否引入 MCP Host | YES v0.2+ / NO / DEFER | DEFER v0.2+|

**所有 HA 项默认 PENDING_HUMAN_DECISION**。不会自动落地任何架构决策。

### 5.4 落地的隐含承诺

本研究的输出是**纯研究仓库产物**（位于 `research/claude-code-best/`）。RoboThree 正式架构（位于 `robothree/`）只有在用户拍板 `HA-1..HA-7` 之后才能开始写入。

任何把本研究成果**写入 `robothree/`** 的动作必须经过 `promote-research-decision` Skill（CLAUDE.md 提到的"用户明确批准研究结论提升时"）。

## §6 总结（5 类结论数）

| 类别 | 数量 |
| --- | --- |
| **ADOPT 直接** | 19 |
| **ADOPT 设计骨架/概念** | 8 |
| **ADAPT 严重** | 7 |
| **ADAPT** | 5 |
| **DEFER** | 1 |
| **REJECT** | 3 |
| **NEEDS_MORE_EVIDENCE** | 2 |
| **总计机制数** | 45 |

**RoboThree v0.1 推荐 ADOPT 项目数**：19（直接）+ 部分 ADOPT 设计骨架 = 约 25-30 个机制点 → 这是 RoboThree v0.1 + v0.2 演进的核心借鉴清单。

---

## 决策记录（未自动落地）

> 任何"已采纳"或"已实现"动作在本研究仓库内不发生。所有结论仅作为 RoboThree 决策的输入。

- 没有 ADR 被创建（Skill § 14.3 默认不写）
- 没有 `robothree/` 下文件被修改
- 没有 RoboThree src 代码被改写
