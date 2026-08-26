# DeepSeek Harness — Open Questions

> UNKNOWN 项 + How to Close。按严重度排序。

## 1. 沙箱真实隔离强度（HIGH）

- **问题**：`SandboxProvider.confine` 是 argv-wrapping 的 process confinement（同 kernel/filesystem），非 VM 级。`enforcement: 'full'|'partial'` 暴露了“backend 无法治理全部 promise 文件效果”的边界。多后端（Landlock/Seatbelt/bwrap/Windows-ACL）的实际隔离强度未经运行时验证。
- **证据缺口**：仅静态推断（[sandbox/index.ts:59-116](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L59-L116)）。
- **How to Close**：Linux（bubblewrap/Landlock）、macOS（sandbox-exec）、Windows（ACL）各跑 denied 文件效果实测；验证 `enforcement: partial` 时哪些效果不可治理。

## 2. SESSION_FORMAT_VERSION=0 的迁移路径（HIGH）

- **问题**：`SESSION_FORMAT_VERSION = 0`，`no compatibility is implied, incompatible logs are rejected, and no migration is provided`。DeepSeek 自称有 upgrade-step 链机制，但仅见于 `.agents/notes`（不可信输入，非权威源码）。
- **证据缺口**：没有找到已落地的迁移代码路径（`repair.ts` / `preparation.ts` 存在但作用未完全确认）。
- **How to Close**：阅读 `session/src/repair.ts` + `session/src/preparation.ts` 判断是否有真实迁移/修复链；或等 DeepSeek 首个 tag 后跟踪其升级。

## 3. 工具并发实际并发度与取消时序（MEDIUM）

- **问题**：`runGroup` 的 bounded rolling pool（`maxParallelToolCalls`）+ abort drain 语义静态明确，但实际并发上限、abort 与 tool body 的 race 时序未实测。
- **证据缺口**：`[I]` 推断；`Promise.race(inFlight.values())` + `commitReady` 的正确性靠源码推导。
- **How to Close**：运行时埋点 + 取消压力测试；观察 `TOOL_ABORTED_BEFORE_DISPATCH` 合成结果是否与真实 body quiescence 一致。

## 4. `deriveMessages` 增量投影性能（MEDIUM）

- **问题**：`deriveMessages()` 用 `derivedGeneration` + `derivedNodes` 增量缓存，但大 session（长对话 + 大量 chunk）下 surface 数组切片与内存投影的复杂度未基准。
- **证据缺口**：未运行时基准（[index.ts:726-747](../../sources/deepseek-harness/packages/core/session/src/index.ts#L726-L747)）。
- **How to Close**：大 session 回放基准；对比 full re-derive vs incremental 的内存/时间曲线。

## 5. Cordis reflect（Proxy 拦截）热路径性能（MEDIUM）

- **问题**：每个 `ctx.<name>` 读取都走 Proxy service resolver；agent 热路径（`loopCtx.llm.stream` / `ctx.tools.executionMode` 等）频繁跨 service。Proxy 开销未基准。
- **证据缺口**：未运行时基准（[context.ts:74](../../sources/deepseek-harness/vendor/cordis/src/context.ts#L74) `new Proxy`）。
- **How to Close**：dispatch/service-read 吞吐基准，判断 Proxy 层是否成为瓶颈。

## 6. Code Mode 子分发的安全边界（MEDIUM）

- **问题**：Code Mode（`run_code`）把工具调用桥接为子分发（`tool/code-dispatch-*`），`mode: 'code'` 下模型只能直呼 `run_code`。嵌套子分发绕过 collapse 的路径（`parent` token 置位）是否完整安全未完全确认。
- **证据缺口**：`collapses()` 只 deny 无 parent 的 model-direct 调用（[tools/index.ts:1324-1326](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L1324-L1326)）；嵌套层级的权限传播未逐一验证。
- **How to Close**：追踪 `createRunCodeTool` → `requireCodeRuntime` → 子分发完整链，确认每个子调用仍走 pre-execute/guard。

## 7. Subagent 隔离是否真实进程级（LOW-MEDIUM）

- **问题**：`subagent-*` 有 `fork-in-process` / `in-process-driver` / `spawn-in-process` / `acp` 等 provider。哪些是真进程隔离、哪些是 in-process 共享状态，未逐一确认。
- **证据缺口**：只确认了 provider 清单（[packages/subagent/](../../sources/deepseek-harness/packages/subagent/)），未读各 provider 实现。
- **How to Close**：逐一读 subagent provider 实现，判断 session/权限/状态是否真隔离（对齐 SKILL「Multi-Agent 隔离」验证清单）。

## 8. `danger-full-access` 无二次防线（LOW）

- **问题**：`danger-full-access` 完全绕过沙箱，靠 config schema + 显式 opt-in 约束，但无第二道运行时防线（如二次确认）。
- **证据缺口**：config 层确认，运行时未验证。
- **How to Close**：确认是否有 approval/escalation 与 `danger-full-access` 联动（`escalation.ts` 存在，未深读）。

## 9. 多用户/多租户隔离（UNKNOWN）

- **问题**：本项目是本地单进程 host，未见 Gateway/Control Plane 多用户隔离形态。`identity`（anonymous-user-id）+ `SessionHeader` 有 origin/delegationDepth，但多用户数据/权限隔离未建模。
- **How to Close**：确认是否存在多用户 server 形态；若无，则 RoboThree 多用户隔离需从 OpenClaw/Daytona 等对照补全。

## 10. 与 Cordis 上游的漂移（LOW）

- **问题**：vendored Cordis 是 `@deepseek-ai/cordis@4.0.1`（source-vendored + 本地修改），与上游 cordiverse/cordis 存在漂移。若 RoboThree 想直接复用 Cordis，需判断用上游还是 DeepSeek 版本。
- **证据缺口**：vendor/README.md 有 manifest 但未逐条比对本地修改。
- **How to Close**：读 vendor/README.md「Local modifications」清单，与上游 cordiverse/cordis 比对。
