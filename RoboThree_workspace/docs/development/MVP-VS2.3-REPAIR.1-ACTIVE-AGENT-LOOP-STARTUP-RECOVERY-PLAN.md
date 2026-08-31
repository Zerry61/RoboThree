# MVP-VS2.3 repair.1 — Active Agent Loop Startup Recovery 聚焦实施方案

> 状态：**IMPLEMENTED / DEADLINE BLOCKER RESOLVED / PARENT E2E PAUSED**  
> 日期：2026-08-30  
> 上游：VS2.1、VS2.2 `PASS/CLOSED`；VS2.2 repair.1/repair.2 focused implementation complete；VS2.3 `IMPLEMENTATION STOP`  
> 预计投入：0.5～1 个集中工程日  
> 触发事实：[VS2.3 实施停手报告](./MVP-VS2.3-IMPLEMENTATION-STOP-REPORT.md)
> 本轮停手：[VS2.3 repair.1 deadline authority 停手报告](./MVP-VS2.3-REPAIR.1-DEADLINE-AUTHORITY-IMPLEMENTATION-STOP-REPORT.md)
> 当前父批停手：[PPTX 预览来源停手报告](./MVP-VS2.3-PPTX-PREVIEW-AUTHORITY-IMPLEMENTATION-STOP-REPORT.md)

## 0. 决策摘要

本 repair 只补一个已经被真实 Electron E2E 证明缺失的生产接缝：Core 新进程启动后，从**已有 durable
Task/Run/Step/round** 重新进入现有 `DurableAgentLoopStarter`，复用已落盘的 Model invocation 与 Tool Result，继续同一
Agent Loop。

它不是新 Foundation，也不新增 Task 状态机、恢复表、公开 Contract 或产品能力。实现必须满足：

1. 只扫描既有 `TaskPersistence.listRecoveryCandidates()`；
2. 只自动恢复 `running`、存在 active `model.generate` Step、存在 exact SubmitTurn binding 的 Task；
3. `created` 继续由既有 `SubmitTurnRecoveryCoordinator` 负责；`waiting` 继续等待用户/外部依赖，启动时不得自动推进；
4. recovery seed 只由原 SQLite 中的 Task checkpoint、SubmitTurn bundle、Conversation Tool Call batch/Tool Result 和
   incomplete Model invocation link 构造；
5. 不读取 current Agent、Model、Skill、Tool、Workspace 或 Preference authority；只允许读取 Task 已锁定的 exact revision；
6. 已完成 read Tool 不重新 dispatch，已提交 Artifact/Assistant Message 不重复创建；
7. round-2 已 durable accept 时，复用同一 `invocationId`/`assistantMessageId`/`clientRequestId` 并重新订阅 SSE；不得再次
   `accept(...)`；
8. 无法证明唯一恢复身份时 fail-closed，不创建新 Task、Run、Step、invocation 或替代 Provider 请求。

最高只允许恢复 VS2.3 的既有 outcome：

```text
MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT
```

不得输出 production ready、通用 Agent Lifecycle ready 或任一下游 ready。

## 1. 已确认的代码事实

| 事实 | 当前落点 | repair 用法 |
|---|---|---|
| Task 恢复候选已存在 | `TaskPersistence.listRecoveryCandidates()` | 不新增扫描表或索引 |
| active Run/Step 已在 Task checkpoint | `DurableTaskRuntime.snapshot()` | 只恢复 active `model.generate` |
| SubmitTurn exact binding 已持久化 | `loadSubmitTurnBindingByTaskId()` / executable bundle | 重建 starter 输入，不重选资源 |
| 现有 starter 已有手动 `resume(taskId)` | `DurableAgentLoopStarter.resume()` | 收敛为 startup 与 Task control 共用入口 |
| Tool Call batch/Tool Result 已 durable | Conversation persistence + `ToolCallBatchCoordinator` | 重建 prior tool results、禁止重复 dispatch |
| Model invocation link 含 round/assistantMessageId/invocationId/cursor | `ModelInvocationLinkPersistence` | 固定当前 round 与 Provider 身份 |
| Provider 已支持已有 link 分支 | `DurableEnterpriseModelProvider.stream()` | invocationId 存在时跳过 accept，status + SSE resume |
| 当前 bootstrap 只启动 SubmitTurn recovery | `create-desktop-private-runtime.ts` | 增加一次 bounded active-loop startup recovery |

本 repair 还修正文档事实：VS2.3 Revision 1 所写“相同 clientRequestId 新 accept”不符合当前 Provider 实现。正确语义是
**一次 accept、两次 SSE subscription、同一 invocation**。

## 2. 精确适用窗口

仅处理以下 Task：

```text
Task.status = running
activeRun.status = running
activeStep.status = running
activeStep.action.kind = model.generate
exact SubmitTurn binding = present
terminal assistant message for this Task = absent
```

当前 VS2.3 窗口进一步要求：

- round-1 Assistant Tool Call batch 与 DOCX Tool Result 已 `result_committed`；
- round-2 Model invocation link 已创建，且 `messageCommittedAt` 缺失；
- `outputStartedAt` 缺失，表示没有不可安全重放的部分输出；
- link 的 task/run/step/action、Runtime Selection digest 与 active checkpoint exact match；
- 同一 active scope 恰好一个 incomplete main invocation link。

以下情况不自动恢复：

- `created`：交给 SubmitTurn recovery；
- `waiting`：保留用户确认或外部依赖语义；
- `completed/failed/cancelled`：terminal no-op；
- 已有 terminal Assistant Message：只做既有 message-commit reconciliation，不重新运行；
- `outputStartedAt` 已存在：沿用 `model_stream_resume_unavailable` fail-closed 语义；
- 缺 binding/bundle、多个 incomplete link、Task/link identity 漂移：记录 typed internal failure result，不猜测恢复。

## 3. G1 — Exact Recovery Seed

为现有 `AgentLoopCoordinator.run(...)` 增加一个**内部可选** recovery seed；正常首次运行不传入，行为与测试必须零漂移。

```text
completedRoundCount
activeRound
activeAssistantMessageId
priorToolResults
```

构造规则：

1. 从 Task active Run/Step 得到 exact runId/stepId/actionId；
2. 从 session durable message range 和 Tool Call batch evidence 读取该 Task 的历史 Assistant Tool Call；
3. 只有 disposition 全为 `result_committed` 的 batch 才能贡献 prior Tool Result；
4. Tool Result 必须与 batch callId/taskId/runId 一一匹配，按 durable ordinal 排序；
5. `completedRoundCount` 必须等于 active invocation `round - 1`；
6. active round 的 Assistant Message ID 必须使用 invocation link 中已冻结的 `assistantMessageId`；
7. 后续新 round 才允许调用现有 IdGenerator 产生新 Assistant Message ID；
8. seed 进入 loop 前再次 strict validate，任何缺失、重复或错序均 fail-closed。

`AgentLoopCoordinator` 只做两项 additive 行为：

- `rounds` 从 `completedRoundCount` 开始，确保恢复请求继续使用 round-2，而不是错误重放 round-1；
- `toolResults` 从 exact durable `priorToolResults` 开始，确保 context 与 Tool loop 上限均包含已完成 read Tool。

不得添加 recovery 专用 Agent Loop 实现。

## 4. G2 — Startup Recovery Coordinator

新增一个范围明确的 `ActiveAgentLoopStartupRecoveryCoordinator`，它不是状态机，只是一次性 orchestration：

1. persistence 与 frozen authorization materialization 完成；
2. 先运行既有 `SubmitTurnRecoveryCoordinator.recoverOnce()`；
3. Core private server 启动并进入 `runtimeState=ready`；
4. 通过 `SystemScheduler` 在 ready 后异步执行一次 active-loop `recoverOnce()`，不得阻塞 Core ready；
5. 按 taskId 稳定排序读取 candidates；
6. 对符合 §2 的 Task，先调用既有 `ToolCallBatchCoordinator.recover({taskId})`；已 `result_committed` 的 read batch必须
   no-op；
7. 构造 exact recovery seed，调用现有 normal `DurableAgentLoopStarter` 的聚焦 resume 入口；
8. Core stop/restart 时 cancel scheduler 与 active run，禁止旧进程后台继续；
9. 同一 Core instance 内同一 taskId 只能进入一次，复用 starter mailbox/activeRuns 防并发；
10. coordinator 只返回 content-free report（scanned/resumed/skipped/conflicted 数量与 safe code），不得输出路径、Tool Result、
    Provider body、Token 或正文。

不建立轮询守护服务；本 repair 只在每次 Core start 后执行一次。后续用户确认仍走现有 Task control resume。

## 5. G3 — Provider 与 Authority 不变量

恢复后的 round-2 必须：

- `ModelInvocationLinkPersistence.loadRound(taskId, runId, 2)` 命中原 link；
- `assistantMessageId`、`modelRequestId/digest`、`confirmationId/scopeDigest`、`clientRequestId`、`invocationId`、
  `durableCursor` 全部不变；
- Provider `accept` 新增调用数 = 0；SSE subscription 新增调用数 = 1；
- Dynamic Facts 与 context receipt 从 durable link/bundle 读取或 exact replay，current authority read 新增数 = 0；
- round-1 read Tool dispatch 新增数 = 0；
- round-2 恢复请求仍含 exact durable DOCX observation；
- 最终 PPTX write、Artifact、terminal Assistant Message 各恰为 1。

若现有 Context Pipeline 无法在不重读 current authority 的情况下重建与 link 相同的 request digest，立即停手，不得通过忽略
digest、删除权威字段或重新 accept 绕过。

## 6. 文件范围

允许的生产代码上限：

- `services/core/src/application/active-agent-loop-startup-recovery.ts`（单一 bounded coordinator）；
- `services/core/src/application/durable-agent-loop-starter.ts`（exact seed 构造与 resume）；
- `services/core/src/application/agent-loop-coordinator.ts`（optional recovery seed）；
- `services/core/src/bootstrap/create-desktop-private-runtime.ts`（ready 后一次性 wiring）；
- 复用既有 `SystemScheduler` 类型；不得修改 `services/core/src/adapters/system-scheduler.ts`；
- 必要的 Core focused tests；
- 既有 `scripts/run-mvp-vs2-electron.mjs` 与 VS2.3 实施/停手文档。

禁止：

- 修改 `packages/contracts/src/**`、Main、Preload、Renderer production API；
- 新增 migration、表、索引、依赖、lockfile 变化；
- 新增 Task/Run/Step/Effect/Tool 状态或第二套 recovery state；
- 修改 Gateway/Central、Provider wire contract 或重新 accept 策略；
- 修改 historical Harness/Evidence；
- 扩展 Personal Model、Admin mutation、TGM、Knowledge Provider、Agent Lifecycle；
- 新建通用恢复平台、通用 Scheduler framework 或阶段 Closure 账本。

## 7. 实施顺序

### Step 1 — Recovery seed focused proof（0.25 日）

- 用 SQLite 构造 round-1 Tool Result 已提交、round-2 link 已 accept/未 output 的真实状态；
- 只在 focused test 中证明 durable facts 足以唯一推导 seed round/message/tool-result identity；本步骤不接 production
  startup wiring；
- 受控 SSE 第一次 subscription 在零 output byte 时中断；第二次 subscription 返回 canonical event bytes，断言恢复后
  Provider 总输出字节数等于 canonical 预期、event 顺序一致且无 duplicate/truncation；
- 先写负向：缺失、重复、output-started、digest/active-step 漂移全部 fail-closed。

### Step 2 — Starter + startup wiring（0.25～0.5 日）

- 把 Step 1 已证明唯一的 seed 构造接入现有 Agent Loop；不在本步骤重新定义 seed 规则；
- ready 后一次性 coordinator；
- stop/cancel/mailbox 纪律；
- normal first-run、Task control confirmation resume 回归不变。

### Step 3 — 恢复同一 VS2 E2E（0.25 日）

- 不新建 E2E；
- 固定 round-1 accept=1、round-2 accept=1、round-2 SSE subscription=2、round-3 accept=1；
- 真实 SIGKILL、新 PID、原 SQLite、read=1、write=1、PPTX Artifact=1；
- Task 页与 preview 完成后再输出 VS2.3 outcome。

## 8. Focused QA（16 项）

1. QA-001：只扫描既有 recovery candidates，稳定按 taskId 排序；
2. QA-002：只自动恢复 running + active model.generate；
3. QA-003：created/waiting/terminal 均不被自动推进；
4. QA-004：SubmitTurn binding/bundle/Task active scope exact match；
5. QA-005：round-1 result_committed Tool Result 一一重建且顺序稳定；
6. QA-006：completedRoundCount=1、activeRound=2；
7. QA-007：active assistantMessageId 复用原 link；
8. QA-008：多个/漂移/缺失 link fail-closed；
9. QA-009：outputStartedAt 存在时不做不安全自动恢复；
10. QA-010：normal first-run 与既有 Task control resume 行为不漂移；
11. QA-011：Core ready 不被长 SSE 阻塞，stop 时 recovery 被取消；
12. QA-012：current Agent/Model/Skill/Tool/Workspace/Preference authority read 新增数均为 0；
13. QA-013：round-2 新 accept=0、同 invocation SSE subscription=1，恢复输出与 canonical SSE bytes 完全一致且无重复；
14. QA-014：read Tool 不重复、write Tool/Artifact/terminal Assistant 各 1；
15. QA-015：同一真实 Electron E2E 经 SIGKILL、新 PID、原 SQLite 后 PASS；
16. QA-016：Contract/migration/依赖/lockfile/下游 GATED 状态不漂移。

## 9. 停手条件

出现任一项立即停手回评审：

1. 需要新 Contract、migration、表、索引或依赖；
2. 需要重新读取 current selection/authority；
3. 无法从 durable facts 唯一确定 active round 或 Assistant Message ID；
4. 需要忽略 request/link digest 才能恢复；
5. 需要第二次 Gateway accept 或创建新 invocation；
6. 已完成 read Tool、Artifact 或 Assistant Message 出现重复；
7. waiting/terminal Task 被自动推进；
8. Core ready 被 Provider SSE 阻塞；
9. 必须修改 Main/Preload/Renderer API；
10. repair 开始扩展成通用 Agent Lifecycle 或恢复平台。

## 10. Codex 文档评审结论

**PASS WITH RISKS — Claude Code 聚焦独立文档复核已完成；当前仍待用户接受并保持 CODING GATED。**

- P0 = 0；
- P1 = 0；
- 独立复核原始结论：P2 = 1、P3 = 2，均为非阻断 proof/文字精度项；
- 本 Revision 1 已直接吸收：SSE byte-exact/no-duplicate proof、Step 1/Step 2 分界，以及复用但不修改
  `SystemScheduler` 的文件边界；
- `DurableAgentLoopStarter.resume(taskId)` 当前虽已存在，但没有 active-round recovery seed。编码时仍必须先完成 Step 1
  proof；若 durable facts 不能唯一给出 round、assistantMessageId 与 prior Tool Results，应按 §9 停手，而不是扩大范围。

评审判断：方案直接服务 MVP 的真实“资料 → Tool → PPTX → 重启恢复”链路；没有新增用户不可见的平台能力。生产改动被限制在
现有 Agent Loop 的 exact re-entry 与一次性 startup orchestration，范围与已暴露缺口相称。

独立复核报告：[vs2.3-repair.1-plan-claude-review.md](./qa/vs2.3-repair.1-plan-claude-review.md)。

用户接受本方案与上述聚焦修订并单独授权前，不得修改 Core production recovery logic，也不得恢复 VS2.3 编码。
