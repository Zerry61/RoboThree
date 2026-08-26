# DeepSeek Harness — Architecture

## 1. 总体架构：一切皆插件（Cordis）

DeepSeek Harness 没有 privileged core。整个产品由 Cordis 插件组成，通过一个共享 `Context` 组装。模型适配器、工具注册表、session 日志、agent 循环本身，都是可替换的插件。

- `[F]` `Context` 是一个 Proxy：普通属性读取走 service resolver（DI），`extend()` / `isolate()` / `intercept()` 创建 scoped 子 context 而不 mutate 父（[context.ts:42-146](../../sources/deepseek-harness/vendor/cordis/src/context.ts#L42-L146)）。
- `[F]` `Service` 基类在构造函数 `super(ctx, name)` 即注册 `ctx.<name>`，并随 owning fiber 卸载自动移除（[service.ts:42-59](../../sources/deepseek-harness/vendor/cordis/src/service.ts#L42-L59)）。
- `[F]` `RegistryService.plugin()` 归一化插件形态（function/class/`{apply}`）并启动 `Fiber`（[registry.ts:316-336](../../sources/deepseek-harness/vendor/cordis/src/registry.ts#L316-L336)）。
- `[F]` 插件声明依赖（`inject`）、提供服务（`provide`）、校验配置（`Config`，standard-schema）（[registry.ts:100-110](../../sources/deepseek-harness/vendor/cordis/src/registry.ts#L100-L110)）。

**注册即 effect、卸载即 unwind**：

- `[F]` `ctx.effect()` 注册 cleanup-aware effect，disposer 按注册逆序在 fiber unload 时运行（[fiber.ts:415-561](../../sources/deepseek-harness/vendor/cordis/src/fiber.ts#L415-L561)）。
- `[F]` `ctx.on()` 的 listener 也是 effect，随 fiber 卸载自动移除（[events.ts:288-302](../../sources/deepseek-harness/vendor/cordis/src/events.ts#L288-L302)）。

## 2. Profiles 与 Bundles（启动时组合）

一个运行的 `dsh` 是一棵在 boot 时从有序 patch layer 组成的插件树。

- `[F]` **profile** = 命名组合，存于 Harness home，列出它 stack 的 bundles、out-of-tree plugins、用户 `cordis.patch.yml`。`web` / `headless` 作为模板（[architecture.md](../../sources/deepseek-harness/docs/architecture.md)）。
- `[F]` **bundle** = Cordis config rows + code 的分发格式，`dsh.profile` / `dsh.bundle` 在各自 package.json 声明（docs/architecture.md）。
- `[F]` layer 应用顺序：bundle 顺序 → profile patch → home-level patch → `--patch` overlay（[profile-boot.ts:142-170](../../sources/deepseek-harness/apps/cli/src/profile-boot.ts#L142-L170)）。
- `[F]` `dsh-base` 是每 profile 第一层（model adapter / tools / persistence / sandbox / approval policy / settings / credentials / telemetry）；`dsh-web-app` 加浏览器应用；`dsh-headless` 加一次性 runner（docs/architecture.md）。

## 3. Core 包与 `ctx` key

| 包 | 拥有 | `ctx` key |
|---|---|---|
| core/session | append-only `SessionEvent` log + in-memory store | `ctx.sessions` |
| core/system-prompt | prompt-section + tool-schema 组装 | `ctx.systemPrompt` |
| core/tools | scoped tool registry + guarded 执行管线 | `ctx.tools` |
| core/agent | `Agent` 接口 + live registry + `agent/*` 事件 | `ctx.agents` |
| core/agent-loop | 默认驱动 `ReactLoopAgent` | `ctx.agentLoop` |
| core/scope | per-agent scoped-registration | 库（无 key） |
| llm/llm | message/stream 词汇 + adapter seam | `ctx.llm` |

## 4. 事件系统（扩展点）

`[F]` 事件是扩展点，三种域（[events.ts:32-86](../../sources/deepseek-harness/vendor/cordis/src/events.ts#L32-L86)、[docs/architecture.md](../../sources/deepseek-harness/docs/architecture.md)）：

| 分发模式 | 语义 | 用途 |
|---|---|---|
| `emit` | 同步触发，忽略返回值 | 通知（不可 veto） |
| `parallel` | 并发 await 全部 listener | 并行的观察者 |
| `serial` | 顺序 await，直到一个 bail | 有序中止 |
| `bail` | 同步触发，直到一个 bail | 同步中止 |
| `waterfall` | 围绕 `next()` 组合（around-middleware） | 可 veto / 可改写 |

- `[F]` waterfall listener **必须**调 `next()` 委托；不调即 veto 后续链（[events.ts:234-243](../../sources/deepseek-harness/vendor/cordis/src/events.ts#L234-L243)）。
- `[F]` 事件类型通过 declaration merging 扩展（`interface Events` / `interface SessionEventMap` / `interface ContentBlockMap` 等 merge-extensible map）。

三类 domain 事件（docs/architecture.md）：

- **Session events**：append-only log 里的 durable fact，经 `session/event` 广播。
- **Agent events**（`agent/*`）：携带 live `Agent`，观察/拦截 in-flight work。
- **Capability events**（`fs/*` / `tools/*` / `telemetry/*`）：给 seam 挂 policy/adapter，不 import loop。

## 5. Agent 运行时对象模型

`[F]` 四层（[agent-loop/agent.ts:64](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L64)）：

```text
ReactLoopAgent (implements Agent)
  ├─ inbox: Inbox            # 双队列 next-turn / next-step
  ├─ phase: Phase            # idle | maintenance | running
  ├─ scope: Scope            # per-agent scoped registration
  ├─ ctx: Context            # scope.ctx.extend({ agent: this })
  └─ dispatch: AgentEventDispatch  # 融合 agent→scope carrier
```

- `[F]` `ReactLoopAgent` 构造时 `createScope(loopCtx, this)` + `this.ctx = this.scope.ctx.extend({ agent: this })`，建立 per-agent 注册边界（[agent.ts:94-95](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L94-L95)）。
- `[F]` phase 机：`idle`（无活动）/ `maintenance`（runMaintenance 独占）/ `running`（含 AbortController + turn + step + wakeRequested）（[agent.ts:38-46](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L38-L46)）。
- `[F]` 入口方法：`send`（任意 target+wakeup）/ `followup`（next-turn）/ `steer`（next-step）/ `inject`（next-step 不 wake）/ `cancel` / `runMaintenance`（[agent.ts:113-162](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L113-L162)）。

## 6. Session Log（append-only 真相源）

- `[F]` `SessionEventMap` 是 merge-extensible append-only log：`turn/start`、`turn/end`、`step/start`、`step/end`、`user/message`、`assistant/chunk`、`assistant/message`、`tool/call`、`tool/result`、`todo/write`、`request/header`、`request/context`、`session/end-seed`（[types.ts:236-333](../../sources/deepseek-harness/packages/core/session/src/types.ts#L236-L333)）。
- `[F]` **surface** 三类型：`user/message` / `assistant/message` / `tool/result` 才携带 `surfaceOp` + `sourceEventSeqs`（[types.ts:343-388](../../sources/deepseek-harness/packages/core/session/src/types.ts#L343-L388)）。
- `[F]` `deriveMessages()` 从 surface 增量投影模型历史（缓存 derivedGeneration，[index.ts:726-747](../../sources/deepseek-harness/packages/core/session/src/index.ts#L726-L747)）。
- `[F]` **`ignorable`** 标记：读者遇未知 required 事件必须拒绝重建；`ignorable: true` 才可安全跳过（[types.ts:422](../../sources/deepseek-harness/packages/core/session/src/types.ts#L422)）。
- `[F]` **Model-visible ⟺ logged** 不变量：任何进模型请求的内容必须可从 log 重建（docs/architecture.md；[agent.ts:381-390](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L381-L390) 将 assistant/message 连同 chunk seqs 一起落 log）。
- `[F]` fork / resume / transcript / telemetry / persistence 全部从这条 log 派生（docs/architecture.md）。

## 7. Tool 系统（scoped registry + guarded 管线）

- `[F]` `ToolRuntime` 注册在 `ctx.tools`，`register(definition)` 校验 `output.schema`、保留 `run_code` 名、写入 `ScopedLayers`（[tools/index.ts:787-837](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L787-L837)、[tools/index.ts:1037-1062](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L1037-L1062)）。
- `[F]` `restrict(filter)` 对 global tools 做 per-scope allow/deny mask；`guard(guard)` 注册单调拒绝 guard（[tools/index.ts:1071-1116](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L1071-L1116)）。
- `[F]` `executionMode(exec)`：`isConcurrencySafe(args) === true` → `parallel`，否则 `exclusive`（[tools/index.ts:1276-1285](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L1276-L1285)）。
- `[F]` 三个工具 waterfall（scope-filtered）：`tools/pre-execute`（allow/deny/ask）→ `tools/execute`（timeout/retry/metrics 包装）→ `tools/post-execute`（accept/replace/enrich/block）（[tools/index.ts:152-175](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L152-L175)）。

## 8. Capability Seams（Definition/Provider/Consumer）

- `[F]` seam 三角色：Service Definition（接口）、Service Provider（实现）、Consumer（通常模型工具）（docs/architecture.md）。
- `[F]` `fs`/`subprocess` 共享同一 execution world：把 provider 指向 remote sandbox 时 Bash/PTY/LSP 一起迁移，无需 provider fork（docs/architecture.md）。
- `[F]` 六条核心 seam：`llm` / `fs` / `shell` / `subprocess` / `terminal` / `sandbox`（见 source-map §3 的类定义行号）。

## 9. Permission / Security（主报告段落）

> Level 2 强制检查。详细深挖见 [capability-seam-sandbox-approval-l3.md](capability-seam-sandbox-approval-l3.md)。此处只给主报告必需的总览。

### 9.1 沙箱（fail-closed）

- `[F]` `SandboxProvider.confine(argv, policy)` 包装 argv 使子进程受限执行，返回 wrapped argv + enforcement 完整度 + denial signatures + runner failure rules（[sandbox/index.ts:158-176](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L158-L176)）。
- `[F]` `SandboxMode` = `read-only`（默认 fail-safe）| `workspace-write` | `danger-full-access`（[sandbox/index.ts:29](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L29)）。
- `[F]` **fail-closed**：无法 enforce 请求模式时抛 `SandboxUnavailableError`（`SANDBOX_UNAVAILABLE`），拒绝 unconfined 运行；`silent unconfined passthrough is forbidden`（[sandbox/index.ts:124-144](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L124-L144)）。
- `[F]` 多后端：bubblewrap/Landlock（Linux）、sandbox-exec（macOS）、Windows ACL（`SandboxUnavailableError` 错误文案 + sandbox-local/profiles.ts）。

### 9.2 审批（fail-closed）

- `[F]` `ApprovalService`（`ctx.approval`）`approval/request` waterfall；`ApprovalPolicy` = `ask`（默认）| `never`（确定性拒绝）（[user-approval/index.ts:94-97](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L94-L97)）。
- `[F]` `ApprovalOutcome` = `allowed-once` | `rejected` | `cancelled` | `unavailable`；missing/throwing answerer → `unavailable`（fail-closed）；`allowed-once` 是唯一 grant（[user-approval/index.ts:82](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L82)、[user-approval/index.ts:304-344](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L304-L344)）。
- `[F]` `never` policy 在 dispatch 之前决定，`prepend` listener 无法绕过（[user-approval/index.ts:306-312](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L306-L312)）。
- `[F]` 审计对 `approval/asked` + `approval/decided` 必须 turn-enclosed（[user-approval/index.ts:257-276](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L257-L276)）。

### 9.3 三个整值旋钮

- `[F]` 权限域 = 三个 whole-value knob：`permission/preset` + `sandbox/mode` + `approval/policy`，折叠为 `permissions` 投影（[permission-presets/types.ts:34-44](../../sources/deepseek-harness/packages/interaction/permission-presets/src/types.ts#L34-L44)）。
- `[F]` 每个旋钮是 session 上的一个 log-only 事件，`effective = fold(events) ?? default`，靠重放恢复状态、无独立 config store（[session-mode.ts:52-58](../../sources/deepseek-harness/packages/sandbox/sandbox-policy/src/session-mode.ts#L52-L58)、[user-approval/index.ts:112-118](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L112-L118)）。

## 10. 部署边界

- `[F]` 本地单进程 host + Web UI（`dsh web`）或 headless 一次性 runner（`dsh headless`）。
- `[F]` 单 exe 构建：`python/sdk-runtime` 是 deploy root，closure 被 exe bundle，Python runtime 分发（pnpm-workspace.yaml）。
- `[F]` `e2b` 包是 remote sandbox POC（`fs-e2b` / `subprocess-e2b`），演示 seam 的 remote 替换。
- `[I]` 尚未看到 Gateway/Control Plane 独立部署形态（与 OpenClaw 的 daemon+channel 不同）；subagent 的 `subagent-{acp,claude-code,codex,dsh-sdk}` 表明它把“外部 agent 作为子 agent”当作 provider。

## 11. 架构级风险（概览，详见 open-questions）

1. `[I]` “一切皆插件”的 DI/Proxy 抽象是强约束但也是心智负担：`Context` proxy + `isolate`/`intercept` + scope 链组合复杂，插件作者需要理解 fiber 生命周期与 effect 语义才能写对。
2. `[I]` `SESSION_FORMAT_VERSION = 0` + “backends reject old formats” 意味着**无向后兼容**，尚未经过真实升级路径验证。
3. `[I]` 100% 单文件覆盖 + 大量 `invariant.ts` 意味着工程成本极高，可能只适用于 DeepSeek 这种投入级别。
4. `[I]` Landlock/bwrap/Seatbelt/Windows-ACL 多后端 sandbox 的实际隔离强度未经运行时验证。
