# L3 深挖 — Capability Seams + Sandbox/Approval 安全边界

> 机制 3/3。回答：capability seam（Definition/Provider/Consumer）如何让 provider 整体替换，以及沙箱 + 审批如何 fail-closed。
> 全部结论 Confirmed by: source。

## 1. 一句话结论

`[F]` DeepSeek Harness 把每个能力（文件系统、shell、子进程、终端、沙箱、模型）建模为 **Service Definition（抽象 `Service` 子类）+ Provider（实现）+ Consumer（模型工具）** 三角色 seam。provider 是 `ctx.<name>` 上的单一服务，切换 provider 即整体替换该能力。安全靠两层 fail-closed：**沙箱**（`SandboxProvider.confine`，`read-only` 默认，无法 enforce 即拒绝）+ **审批**（`ApprovalService`，`ask`/`never`，`allowed-once` 唯一授权）。

## 2. Capability Seam 三角色

- `[F]` seam 定义：Service Definition（声明接口）、Service Provider（实现）、Consumer（通常模型工具）；一角色不完整，新增能力需三角色齐（docs/architecture.md）。
- `[F]` 六个核心 seam 都是 `abstract class … extends Service`，`super(ctx, '<name>')` 注册：

| Seam | Definition | `ctx` key | 证据 |
|---|---|---|---|
| LLM | `LlmRuntime` | `ctx.llm` | llm/index.ts:284 |
| Filesystem | `FileSystem` | `ctx.fs` | fs/index.ts:86 |
| Shell | `ShellExecutor` | `ctx.shell` | shell/index.ts:65 |
| Subprocess | `SubprocessRuntime` | `ctx.subprocess` | subprocess/index.ts:102 |
| Sandbox | `SandboxProvider` | `ctx.sandbox` | sandbox/index.ts:158 |
| Approval | `ApprovalService` | `ctx.approval` | user-approval/index.ts:192 |

- `[F]` `LlmRuntime.registerAdapter(providers, adapter)` 返回 disposer；`stream()` / `prepareCall()` / `listProviders()` / `listModels()` 是 adapter seam 的运行时面（[llm/index.ts:338](../../sources/deepseek-harness/packages/llm/llm/src/index.ts#L338)、[llm/index.ts:913](../../sources/deepseek-harness/packages/llm/llm/src/index.ts#L913)）。

### 2.1 “一个 provider 切换改变整个产品”

- `[F]` `fs` 与 `subprocess` 共享同一 execution world：把 provider 指向 remote sandbox 时 Bash/PTY/LSP 一起迁移，无需 provider fork（docs/architecture.md）。
- `[F]` e2b 包是 concrete 证明：`fs-e2b` / `subprocess-e2b` 把文件系统和子进程 provider 替换为 E2B remote sandbox，而 shell/terminal/lsp consumer 无需改（[packages/e2b/](../../sources/deepseek-harness/packages/e2b/)）。
- `[F]` subagent 同样作为 provider：`subagent-{acp,claude-code,codex,dsh-sdk,fork-in-process,in-process-driver,spawn-in-process}` 在单一 `SubagentProvider` 接口后（[packages/subagent/](../../sources/deepseek-harness/packages/subagent/)）。

## 3. Sandbox：fail-closed 进程约束

### 3.1 接口与模式

- `[F]` `SandboxProvider.confine(argv, policy)` 返回 wrapped argv（runner + profile + separator + 原 argv）+ `enforcement`（full/partial）+ `denialSignatures` + `runnerFailureRules`（[sandbox/index.ts:158-176](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L158-L176)）。
- `[F]` `SandboxMode`：`read-only`（只允许 `/dev/null` 等必需 sink）| `workspace-write`（还允许 workspace + backend 临时区）| `danger-full-access`（绕过）（[sandbox/index.ts:29](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L29)）。
- `[F]` `SandboxPolicy` 是 **per-call** 文件效果策略（mode + workspaceRoot + sessionId），非固定在 provider 上：两个 consumer 可同一时刻不同 policy 约束（[sandbox/index.ts:61-72](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L61-L72)）。

### 3.2 fail-closed 语义

- `[F]` `confine` 必须返回 enforcing argv 或 fail-closed；**silent unconfined passthrough is forbidden**（[sandbox/index.ts:152-157](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L152-L157)）。
- `[F]` 无可用 backend 时抛 `SandboxUnavailableError`（code `SANDBOX_UNAVAILABLE`），拒绝 unconfined 运行（[sandbox/index.ts:124-144](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L124-L144)）。
- `[F]` 多后端：bubblewrap/Landlock（Linux）、sandbox-exec（macOS）、Windows ACL restricted-token runner（错误文案 [sandbox/index.ts:134-139](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L134-L139)）。

### 3.3 Policy 解析与 session 覆盖

- `[F]` `SandboxPolicyService.resolve()`：显式 mode > session `sandbox/mode` fold > deployment default；workspaceRoot = session cwd（[sandbox-policy/index.ts:135-142](../../sources/deepseek-harness/packages/sandbox/sandbox-policy/src/index.ts#L135-L142)）。
- `[F]` 默认 mode = `read-only`（fail-safe），想 workspace-writable 需显式 opt-in（[sandbox-policy/index.ts:67-75](../../sources/deepseek-harness/packages/sandbox/sandbox-policy/src/index.ts#L67-L75)）。
- `[F]` session 覆盖是 `sandbox/mode` log-only 事件，`effectiveSandboxMode = fold(events) ?? default`，重放即状态（[session-mode.ts:52-58](../../sources/deepseek-harness/packages/sandbox/sandbox-policy/src/session-mode.ts#L52-L58)）。

## 4. Approval：fail-closed 审批

### 4.1 策略与结果

- `[F]` `ApprovalPolicy`：`ask`（默认，委托 answerer，无 answerer 时 fail-closed `unavailable`）| `never`（确定性拒绝，CI/unattended 立场）（[user-approval/index.ts:88-97](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L88-L97)）。
- `[F]` `ApprovalOutcome`：`allowed-once` | `rejected` | `cancelled` | `unavailable`；**`allowed-once` 是唯一 grant**，grant 只适用于被请求的 action（[user-approval/index.ts:82](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L82)）。

### 4.2 fail-closed 路径

- `[F]` `decide()`：signal aborted → `cancelled`；`never` policy 在 dispatch **之前**决定 → `rejected`；answerer 缺失/抛出 → `unavailable`；rogue 非词汇返回值归一化 `unavailable`（[user-approval/index.ts:304-344](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L304-L344)）。
- `[F]` `never` 在服务自身 request 路径决定，`prepend:true` listener 无法覆盖此承诺（[user-approval/index.ts:306-312](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L306-L312)）。
- `[F]` `approval/request` 是 scope-filtered waterfall，answerer 通过 `next()` 委托，返回 outcome 即 claim（[user-approval/index.ts:22-32](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L22-L32)）。

### 4.3 审计（append-only 成对）

- `[F]` `approval/asked` + `approval/decided`（同 `id`）成对落 session log，log-only 审计（[user-approval/index.ts:34-58](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L34-L58)）。
- `[F]` 必须 turn-enclosed：`request()` 无 open turn 时抛错，因为 turn 是 durable log 的 commit/replay 边界，turn 间裸事件在 reload 时被当作 crash tail 丢弃（[user-approval/index.ts:120-134](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L120-L134)、[user-approval/index.ts:257-276](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L257-L276)）。
- `[F]` session policy 覆盖 `approval/policy` 事件，`effectiveApprovalPolicy = fold(events) ?? default`（[user-approval/index.ts:112-118](../../sources/deepseek-harness/packages/interaction/user-approval/src/index.ts#L112-L118)）。

## 5. 三个整值旋钮（权限模型）

- `[F]` 权限域 = 三个 whole-value knob：`permission/preset` + `sandbox/mode` + `approval/policy`，折叠为 `permissions` 投影（[permission-presets/types.ts:34-44](../../sources/deepseek-harness/packages/interaction/permission-presets/src/types.ts#L34-L44)）。
- `[F]` 每个旋钮是 session 上的 log-only 事件，`effective = fold(events) ?? default`，重放即状态、无独立 config store、两 session 互不可见（[session-mode.ts:1-18](../../sources/deepseek-harness/packages/sandbox/sandbox-policy/src/session-mode.ts#L1-L18)）。
- `[F]` 模型通过 system prompt 的 runtime-context 快照感知策略（`renderPolicyContext` 生成 model-facing policy 语句）（[sandbox-policy/index.ts:37-52](../../sources/deepseek-harness/packages/sandbox/sandbox-policy/src/index.ts#L37-L52)）。

> `[I]` 这是“策略即 log 事件”的漂亮设计：权限状态不是独立 config store，而是 session log 里可重放的 fold。它统一了“运行时切换 → 重启恢复 → 子 session 继承（delegation source）”三个需求。

## 6. 对 RoboThree 的直接启示

1. `[R]` **Definition/Provider/Consumer 三角色 seam** 是 RoboThree 模块边界的最佳组织范式：每个能力三件套，provider 可替换（本地沙箱 / remote sandbox / 外部 agent），consumer 无感。
2. `[R]` **fail-closed 是默认，不是选项**：沙箱无 backend 拒绝而非降级、审批无 answerer 拒绝而非放行。RoboThree 的 Security 模型应默认 deny。
3. `[R]` **`allowed-once` 唯一授权 + 成对审计**（asked/decided 落 log）是 RoboThree 权限审计可对齐的做法。
4. `[R]` **“策略即 log 事件 + fold 重放”** 用 append-only log 替代独立 config store，统一了运行时切换/重启恢复/继承，是 RoboThree 可复用的 session-state 模式。
5. `[R]` **denialSignatures / runnerFailureRules 分后端方言**：区分“runner 失败（命令没跑）”和“denial（约束生效并拦截）”，避免跨后端 union 误判。

## 7. 风险 / 局限

- `[I]` 沙箱是 **process-confinement via argv wrapping**（同 kernel/filesystem），不是 VM 级隔离；`enforcement: 'full'|'partial'` 显式暴露了“backend 无法治理全部 promise 文件效果”的边界。
- `[I]` Landlock/Seatbelt/bwrap/Windows-ACL 多后端实际隔离强度未经运行时验证（静态推断）。
- `[I]` `danger-full-access` 存在且可配置，误配会完全绕过；靠 config schema + 显式 opt-in 约束，但无二次防线。
- `[UNKNOWN]` `SandboxPolicy` 的 per-call 模型（同进程两 consumer 不同 policy）在极端并发下的正确性未实测。
