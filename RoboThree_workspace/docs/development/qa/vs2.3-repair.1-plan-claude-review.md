# MVP-VS2.3 repair.1 — Active Agent Loop Startup Recovery — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-0010-plan-vs2.3-repair.1` |
| 验收对象 | [MVP-VS2.3 repair.1 — Active Agent Loop Startup Recovery 聚焦方案](../MVP-VS2.3-REPAIR.1-ACTIVE-AGENT-LOOP-STARTUP-RECOVERY-PLAN.md)（仅文档级复核；不重做 Revision 1 全评审；编码仍 GATED） |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改方案、业务代码、Contract、依赖、migration、lockfile） |
| 上游 | VS2.1 / VS2.2 `PASS/CLOSED`；VS2.3 Revision 1 FOCUSED_DIFFERENCE_REVIEW_PASS（`0.0.0-mvp.vs2.3` 未建立；处于 `IMPLEMENTATION STOP`） |
| 开发者自检 | `CODEX PLAN REVIEW PASS — INDEPENDENT DOCUMENT REVIEW RECOMMENDED / CODING GATED`，P0=0/P1=0/P2=0/P3=1 |
| 当前状态 | `CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围（仅修复方案与 Revision 1 之间的差异）

不重做 Revision 1 全评审；只确认本 repair 方案相对 Revision 1 的**差异部分**：

1. P3.1（自检）：`DurableAgentLoopStarter.resume(taskId)` 存在但**没有 active-round recovery seed**，Step 1 必须先做 focused proof；若 durable facts 不能唯一给出 round/assistantMessageId/prior Tool Results，应按 §9 停手。
2. Revision 1 §3.1/§3.2 中"同 clientRequestId 第二次 accept"的措辞**已被本 repair 修正**为"一次 accept、两次 SSE subscription、同一 invocation"。需确认修正与既有 provider 代码一致。
3. 四个限定变更的代码事实（§1 表 7 行）是否真实存在。
4. 16 项 focused QA 是否连续唯一、无缺号。
5. 严格禁止新增 Contract/migration/依赖/状态机/恢复表/通用 Agent Lifecycle 或下游能力（与 Revision 1 一致，且更窄）。
6. `git diff --check` 是否通过。

### 1.2 方法

- 全文精读本 repair 方案（237 行，10 节）；
- 只读核对代码：`task-persistence.ts:317`、`durable-agent-loop-starter.ts:103/182`、`model-invocation-link-persistence.ts`、`durable-enterprise-model-provider.ts:141-405`、`agent-loop-coordinator.ts:66/96`、`enterprise-generation-recovery.ts:53`、`system-scheduler.ts`、`create-desktop-private-runtime.ts:539` 等；
- 程序化核对 16 项 QA 编号 + 实跑 `git diff --check`。

---

## 二、关键事实核对（与 Revision 1 的差异 + 自检 P3.1）

| 方案声明 | 代码字面 | 结果 |
|---|---|---|
| §1 表 L1: `TaskPersistence.listRecoveryCandidates()` 已存在 | `services/core/src/ports/task-persistence.ts:317` + `sqlite-task-persistence.ts:1420` + `in-memory-task-persistence.ts:1300` | ✅ |
| §1 表 L1: `listRecoveryCandidates()` 已存在且被 `EnterpriseGenerationRecoveryCoordinator` 使用 | `services/core/src/application/enterprise-generation-recovery.ts:81 / 282` | ✅ |
| §1 表 L2: `DurableTaskRuntime.snapshot()` 提供 active Run/Step | 既有 Runtime 持久化（VS1 harness 已用） | ✅ |
| §1 表 L3: `loadSubmitTurnBindingByTaskId()` 已持久化 SubmitTurn binding | `task-persistence.ts:277` + `sqlite-task-persistence.ts:775` + `in-memory-task-persistence.ts:746` | ✅ |
| §1 表 L4: `DurableAgentLoopStarter.resume(taskId)` 已存在 | `durable-agent-loop-starter.ts:103 / 182` —— `class DurableAgentLoopStarter implements AgentLoopStarter` + `async resume(taskId: string)` | ✅ |
| §1 表 L5: Tool Call batch/Tool Result 已 durable | `tool-call-batch-coordinator.ts:182 / 208`（recover 跳过 `result_committed`）+ `listRecoverableToolCallBatches` 端口在 `conversation-persistence.ts:190` | ✅ |
| §1 表 L6: ModelInvocationLink 含 round/assistantMessageId/invocationId/cursor | `model-invocation-link-persistence.ts:51` `ModelInvocationLink = LegacyModelInvocationLink \| ModelInvocationLinkV2`，含 `assistantMessageId`、`clientRequestId`、`outputStartedAt` 等 | ✅ |
| §1 表 L7: Provider 已在 `invocationId` 已存在时跳过 accept，status + SSE resume | `durable-enterprise-model-provider.ts:230/236/258/290/313/354-376` `outputStartedAt` 存在 → `ModelStreamResumeUnavailableError`；否则 status + SSE resume | ✅ |
| §1 表 L8: 当前 bootstrap 只启动 SubmitTurn recovery，需新增 bounded active-loop startup recovery | `create-desktop-private-runtime.ts:539 / 754 / 881 / 929` 已在多处构造 `SystemScheduler`（既可注入） | ✅ |
| **§6 + §10 P3.1**: `resume(taskId)` 当前没有 active-round recovery seed | `durable-agent-loop-starter.ts:182-203` 字面只读 binding 后委派给现有 starter，**没有从 durable priorToolResults/activeRound 重建 seed 的入参路径** | ✅ 自检属实 |
| §2 窗口（§2 6 项）：`outputStartedAt` 缺失即不进 unsafe auto-recovery | provider `:236` 显式校验 | ✅ |
| §3 seed 规则：`completedRoundCount === activeInvocation.round - 1` | 与 provider `stableUuid(taskId:runId:round)` 确定性 ID 一致 | ✅ |
| §5 不变量：accept 新增 = 0，SSE subscription 新增 = 1 | 与 `durable-enterprise-model-provider.ts` 仅在 `outputStartedAt === undefined && invocationId 已存在` 走 status + SSE resume 的实现一致 | ✅ |
| §9 停手条件 1-10 | 与方案正文一致，未与既有事实冲突 | ✅ |
| 16 项 focused QA 连续/唯一/无缺号 | 实测 QA-001..QA-016 共 16 个唯一 ID，连续无缺号 | ✅ |
| `git diff --check` 通过 | 实跑 exit 0 | ✅ |

**结论**：方案引用的代码事实**全部真实存在**，自检 P3.1（resume 缺 active-round recovery seed）**属实且被方案正视**。

---

## 三、与 Revision 1 的语义修正（重要）

本 repair 在 §1 末尾与 §3 / §5 / §7（Step 3）**修正了 Revision 1 中"同 clientRequestId 第二次 accept"的描述**：

- Revision 1 §3.1 step 6：原写"原 round-2 随 Core 退出而终止；新 Core 使用相同 `clientRequestId` 执行一次新的 `operation.accept(...)`"。
- 本 repair 修正：改为"**一次 accept、两次 SSE subscription、同一 invocation**" + "round-2 新 accept=0、同 invocation SSE subscription=1"。

**与代码一致性**：provider `durable-enterprise-model-provider.ts:201-258` 的真实语义是：原 invocation 已 `accept` 过且 `outputStartedAt === undefined`，恢复路径走 status 检查 + SSE 重订阅（`new ModelStreamResumeUnavailableError(link.outputStartedAt !== undefined)` 是反例），**不**调用 `operation.accept`。修订后的方案描述与代码实际行为一致。

**评估**：Revision 1 描述并不准确，本 repair 的修正**正确**——若严格按 Revision 1 的"同 clientRequestId 二次 accept"实施，会绕过 provider 既有 resume 路径并触发双倍 accept，与本批"复用同一 Gateway invocation，只重新订阅 SSE，不再次 accept"的修复目标矛盾。修复方案**主动承认并纠正** Revision 1 的措辞错误，符合"诚实边界"要求。

---

## 四、发现的问题

### 无 P0 / 无 P1

### P2-1 — Provider "SSE resume" 在当前代码库的实际可恢复程度尚未被 Step 1 proof 验证

- §5 写"Provider `accept` 新增调用数 = 0；SSE subscription 新增调用数 = 1"；
- provider 代码 `durable-enterprise-model-provider.ts:230/236` 在 `outputStartedAt !== undefined` 抛 `ModelStreamResumeUnavailableError`，仅当**未开始 output** 才可恢复；
- 但若原 Provider 在崩溃前已部分 flush 字节到本地缓存（即便 `outputStartedAt` 未写），SSE subscription 后能否精确还原消息级 event 顺序尚未在本方案中给出 focused proof；
- §10 P3.1 自检已识别"Step 1 证明要求"，但只约束了 active-round recovery seed 是否可唯一还原，未单独覆盖"SSE resume 不会丢/不会重放 byte"的细粒度证明。

**建议（不阻断）**：在 Step 1 增加一条 focused proof 明确：恢复后**总 Provider 输出字节数 == 原始预期字节数**且**无 duplicate event**；否则按 §9 停手 #3/#5 处理（无法唯一确定即停手）。方案 §9 停手条件已能覆盖，无需修改文档结构。

### P3-1 — Step 1 与 Step 2 的边界在 §7 文字略有重叠（精确性，不影响通过）

- §7 Step 1 "Recovery seed focused proof（0.25 日）" 与 Step 2 "Starter + startup wiring（0.25～0.5 日）" 在 wording 上 Step 1 同时提到 "证明 seed round/message/tool-result identity exact"，属于 Step 2 范畴的"构造 seed"步骤也在 Step 1 中提及；
- §10 P3.1 已显式标注这是 Step 1 的"先写负向 focused proof"前置要求，与方案正文一致；
- 不影响通过。

### P3-2 — §6 文件范围未列 `services/core/src/adapters/system-scheduler.ts`（精确性）

- §6 允许文件清单未含 `adapters/system-scheduler.ts`；但 §4 步骤 4 用 `SystemScheduler`，`create-desktop-private-runtime.ts:539/754/881/929` 已多处 import 同一类——本 repair **不修改** SystemScheduler 类本身，只**注入**一次 orchestration 调用；
- 建议（不阻断）：在 §6 允许范围显式加注"复用既有 `SystemScheduler` 类型，不修改 `adapters/system-scheduler.ts`"，消除审计时的不确定。

---

## 五、聚焦评审问题（仅针对本 repair 的差异部分）

1. **是否接受 P3.1 自检（resume 无 seed）作为 Step 1 的焦点证明前置？** —— ✅ 接受。Step 1 已明确"先写负向 focused proof"，失败即按 §9 停手 #3/#5。
2. **是否接受 Revision 1 "同 clientRequestId 二次 accept" 措辞被本 repair 修正为"一次 accept、两次 SSE subscription、同一 invocation"？** —— ✅ 接受且**建议采纳**。与 provider 真实实现一致；保留 Revision 1 的旧措辞会与代码冲突。
3. **是否接受 §4 startup recovery coordinator 与 §6 允许文件清单的耦合？** —— ✅ 接受。`create-desktop-private-runtime.ts` 已在 §6 列出，`SystemScheduler` 复用既有类型（见 P3-2）。
4. **是否接受 §8 16 项 focused QA 收缩范围？** —— ✅ 接受。16 项连续唯一、聚焦于 seed/不变量/回归。
5. **是否接受 §5 "accept 新增 = 0 / SSE subscription 新增 = 1" 的不变量？** —— ✅ 接受，但建议在 Step 1 增加"恢复后总 Provider 输出字节数 == 原始预期字节数" 断言（P2-1）。
6. **是否接受严格禁止新增 Contract/migration/依赖/状态机/恢复表/通用 Agent Lifecycle？** —— ✅ 接受。§6 禁止清单明确，§9 停手 #1/#2/#10 兜底。
7. **是否接受与既有 `EnterpriseGenerationRecoveryCoordinator`（`enterprise-generation-recovery.ts:53`）并行存在而非合并？** —— ✅ 接受。前者处理"提交侧恢复"，后者（本 repair）处理"active loop 启动侧恢复"，分工清晰，合并会扩大方案规模。

---

## 六、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 1，P3 = 2
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
```

**与开发者自检的差异**：开发者自检 P2=0/P3=1；严格复核发现 1 项 P2（SSE resume 字节级证明尚未被 Step 1 单独约束）+ 2 项 P3（Step 1/Step 2 边界轻微重叠 + §6 文件清单未列 `adapters/system-scheduler.ts`）。**无 P0 / 无 P1**，且 1 项 P2 完全可被现有 §9 停手条件覆盖（Step 1 失败即停手），不阻断授权。

**对编码授权的条件**：用户接受本复核 + 接受 §10 P3.1 自检 + 接受 Revision 1 措辞修正后，**可单独授权编码**；授权后建议 Step 1 增加"恢复后总 Provider 输出字节数 == 原始预期字节数"断言（针对 P2-1）；§6 文件清单加注"复用 `SystemScheduler`，不修改 `adapters/system-scheduler.ts`"（针对 P3-2，作为实施报告的 commit message 备注即可）。

**本复核未触发任何 RED**。

---

## 七、与既有的 RoboThree 评审规则对齐

- 仅复核本次 repair 方案的差异部分，不重做 Revision 1 全评审（按用户指示）；
- 因 `0.0.0-mvp.vs2.3` 尚未建立，本复核报告**不**回链到 DEVELOPMENT-LOG（与 Revision 1 评审一致的处理）；
- 报告落盘到 `docs/development/qa/vs2.3-repair.1-plan-claude-review.md`，遵循 `<version-or-scope>-claude-review.md` 命名规范；
- 严格保持只读，未修改任何文件。

— Claude Code（独立文档复核，只读）
