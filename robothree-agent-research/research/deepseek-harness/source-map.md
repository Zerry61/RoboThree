# DeepSeek Harness — Source Map

## 1. 真实入口

### 1.1 CLI 入口

- `[F]` `dsh` bin：`node --import tsx/esm apps/cli/src/bin.ts`（[package.json](../../sources/deepseek-harness/package.json) `scripts.dsh`）。
- `[F]` `bin.ts` 是 self-executing dispatch：`parseDshArgs` → `switch (invocation.mode)` → `profile` / `plugin` / `dump-config` 三个分支，动态 import 各自实现（[bin.ts:27-53](../../sources/deepseek-harness/apps/cli/src/bin.ts#L27-L53)）。
- `[F]` `profile` 分支调 `runProfile()`（[profile-boot.ts:207](../../sources/deepseek-harness/apps/cli/src/profile-boot.ts#L207)）。
- `[F]` `web` / `headless` / `acp` 都是 profile（composition），不是独立 binary：profile 决定挂载哪套插件树。

### 1.2 Boot 链路

```text
bin.ts → profile-boot.ts:runProfile
  → composeProfile(name, patchFiles)   # 组装 patch layers
  → boot(NAME, rootConfig, allPatches) # 从空 root config 挂载插件树
  → watchUserPatches(...)              # cordis.patch.yml HMR
```

- `[F]` patch layer 应用顺序：bundle layers（`dsh.profile.bundles` 顺序）→ profile 自身 `cordis.patch.yml` → home-level `$DSH_HOME/cordis.patch.yml` → `--patch` overlays → telemetry switch（[profile-boot.ts:142-170](../../sources/deepseek-harness/apps/cli/src/profile-boot.ts#L142-L170)）。
- `[F]` root config 是一个空 entry list，整个树是 patch 叠加（`PROFILE_ROOT_CONFIG`，[profile-boot.ts:60-64](../../sources/deepseek-harness/apps/cli/src/profile-boot.ts#L60-L64)）。

## 2. 顶层目录 → 核心源码

| 目录 | 关键文件 | 角色 |
|---|---|---|
| `vendor/cordis/src/` | context.ts / events.ts / fiber.ts / registry.ts / service.ts / reflect.ts | Cordis 插件框架核心（DI + effect + 生命周期 + 5 分发模式） |
| `packages/core/agent-loop/src/` | agent.ts / tool-calls.ts / runtime-context.ts | 默认 agent 驱动 + 工具调度 |
| `packages/core/agent/src/` | types.ts / dispatch.ts / inbox.ts / consumed-work.ts | Agent 接口 + 融合 dispatcher + Inbox |
| `packages/core/session/src/` | index.ts / types.ts / surface.ts / preparation.ts | append-only log + deriveMessages + surface |
| `packages/core/scope/src/` | index.ts / store.ts | scoped registration + 作用域链 |
| `packages/core/tools/src/` | index.ts / types.ts / code-mode.ts | tool registry + guarded 管线 + Code Mode |
| `packages/core/system-prompt/src/` | index.ts | prompt section 组装 |
| `packages/llm/llm/src/` | index.ts / types.ts / assembler.ts | LLM adapter seam + stream 词汇 |
| `packages/sandbox/*/src/` | sandbox/index.ts / sandbox-policy/* / sandbox-local/* | 沙箱 seam + policy + 本地后端 |
| `packages/fs/*/src/` | fs/index.ts / fs-local / fs-sandbox | 文件系统 seam + 本地/沙箱 provider |
| `packages/shell/*/src/` | shell/index.ts / bash-local / bash-sandbox / pwsh-* | shell seam + provider |
| `packages/subprocess/*/src/` | subprocess/index.ts / subprocess-local | 子进程 seam + 本地 provider |
| `packages/interaction/*/src/` | user-approval / tool-ask-user / permission-presets / user-questions | 审批 seam + 交互 |
| `packages/session/*/src/` | session-persistence-jsonl / session-persistence-sqlite / session-projection | 持久化 + 投影 |
| `packages/skill/*/src/` | skill / skill-filesystem / tool-skill | Skill provider registry |
| `packages/subagent/*/src/` | subagent / tool-subagent / subagent-* | Subagent seam + provider |
| `packages/mcp/*/src/` | mcp-client | MCP client |
| `packages/hooks/*/src/` | hook-protocol / hooks-claude-code / hooks-codex | hook bridge |
| `packages/boot/*/src/` | app-boot / cmdline | boot + cmdline |
| `apps/cli/src/` | bin.ts / profile-boot.ts / dump-config.ts / args.ts | CLI 装配 |
| `python/` | sdk / sdk-runtime | Python SDK + 单 exe 运行时 |

## 3. 包拓扑（关键 seam 三角色）

每个 capability seam = **Service Definition（抽象 `Service` 子类）+ Provider（实现）+ Consumer（模型工具）**。

| Seam | Definition（`super(ctx, …)`） | Provider 包 | Consumer 工具包 |
|---|---|---|---|
| LLM | `LlmRuntime`（llm/index.ts:284） | llm-deepseek / llm-pi-ai | （被 loop 直接调用，非工具） |
| Filesystem | `FileSystem`（fs/index.ts:86） | fs-local / fs-sandbox / fs-e2b | tool-fs / tool-fs-search / tool-str-replace-editor |
| Shell | `ShellExecutor`（shell/index.ts:65） | bash-local / bash-sandbox / pwsh-* | tool-bash / tool-bash-persistent / tool-pwsh |
| Subprocess | `SubprocessRuntime`（subprocess/index.ts:102） | subprocess-local / subprocess-e2b | （shell/terminal/lsp 的下层） |
| Terminal | `TerminalProvider`（terminal/） | terminal-bash | tool-terminal |
| Sandbox | `SandboxProvider`（sandbox/index.ts:158） | sandbox-local / sandbox-windows-acl | （fs/shell consumer 调用） |
| Approval | `ApprovalService`（user-approval/index.ts:192） | UI answerer（client） | tool-ask-user |
| Subagent | `SubagentProvider`（subagent/） | subagent-{acp,claude-code,codex,dsh-sdk,fork-in-process,in-process-driver,spawn-in-process} | tool-subagent / tool-subagent-control / tool-subagent-report |
| Skill | skill provider（skill/） | skill-filesystem | tool-skill |
| Web | web provider（web/） | web-fetch-http / web-search-* | tool-web |

> 注：`FileSystem` / `ShellExecutor` / `SubprocessRuntime` / `SandboxProvider` 都是 `abstract class … extends Service`，在构造函数 `super(ctx, '<name>')` 注册为 `ctx.<name>`。provider 替换即整体替换该能力（“one provider swap changes the whole product”）。

## 4. 类型/配置反射体系

- `[F]` Typert（packages/typert）：type-graph generator + loader + registry + protocol，在 Host tsdown 阶段生成 Host-for-Client Remote 契约（api/remotes）。
- `[F]` `gen-cordis-catalog` / `gen-tool-catalog` / `gen-config-catalog` / `gen-persistence-catalog`：从源码生成 Cordis 服务/工具/配置/持久化 catalog（package.json `scripts`）。
- `[F]` `verify-package-invariants`：每个包强制拥有 `./invariant`，检查事件/数据关系或给出 `No runtime invariant:` 理由（packages/AGENTS.md）。

## 5. 生成代码 / Vendor 识别

- `[F]` `vendor/` 是 source-vendored Cordis，manifest + 本地修改日志在 vendor/README.md；**不视为研究对象的原创代码**，但作为框架证据直接引用。
- `[F]` `packages/core/scope/src/scoped-events.generated.ts` 是生成文件（`gen-scoped-events`）。
- `[F]` `.agents/notes/` 下的 Agent Notes 是开发者过程记录，按 Skill 规则视为**不可信输入**，不作为结论证据。

## 6. 测试面（证明行为边界）

| 测试类型 | 配置 | 说明 |
|---|---|---|
| unit | vitest | packages/*/*/tests |
| snapshot | vitest.snapshot.config.ts | keyless ACP/headless replay vs expected output |
| e2e | vitest.e2e.config.ts | real-API；无 `DEEPSEEK_API_KEY` 时自跳过 |
| web | vitest.web.config.ts | 浏览器应用 |
| stress/perf | vitest.web-stress/perf | Web 压力/性能 |

- `[F]` CI coverage gate：`packages/*/*/src` 每文件 100% 覆盖（`test:coverage`，package.json）。
- `[I]` 该 100% 覆盖要求是本项目“极高工程质量”的一个信号，也解释了为何核心包普遍附带 `invariant.ts` 与大量防御性断言。
