# ADR-017：Agent Tool-Call Batch Completion、Cancellation 与 Recovery

> 状态：**ACCEPTED**  
> 提出日期：2026-07-30  
> 接受日期：2026-07-30  
> 文档一致性复核：**PASS — 2026-07-31，P0=0 / P1=0 / P2=0 / P3=0**  
> 适用范围：Agent Loop、Conversation Persistence、Tool Recovery、用户确认、
> Task Retry、CGF-2C provider-neutral Tool Calling  
> 相关 ADR：[ADR-005](./005-agent-state-task-run-step.md)、
> [ADR-006](./006-permission-policy-data-approval.md)、
> [ADR-007](./007-event-checkpoint-side-effect-consistency.md)、
> [ADR-010](./010-session-context-compaction-and-memory-boundary.md)、
> [ADR-011](./011-task-runtime-selection.md)、
> [ADR-012](./012-submit-turn-coordination.md)  
> 上游来源：OpenWorker commit
> `f96ad4c8e6865f0aec519681a3717b6bcdd81546`，MIT，`DESIGN_ONLY`  
> 实施计划：[ADR-017 Implementation Plan](../architecture/ADR-017-IMPLEMENTATION-PLAN.md)  
> 编码状态：**IMPLEMENTED / ADR17-I1/I2/I3 与 Implementation Gate PASS/CLOSED；CGF-2C GATED**

## 1. 背景

一个 Model 回合可以返回多个 Tool Call。RoboThree 当前 Agent Loop 会先把该轮
Assistant Message 和整批 Tool Call 持久化，再按顺序执行。崩溃后，
`AgentToolRecoveryCoordinator` 可以查找没有对应 Tool Result 的调用并恢复。

这套设计保证了“执行前先有 durable intent”，但还需要区分三种不同原因：

1. 进程在可恢复调用完成前崩溃；
2. 用户主动取消 Task/Run；
3. 同批某个调用正在等待用户确认，后续调用尚未获得执行资格。

如果恢复路径只根据“是否存在 Tool Result”判断 pending，主动取消或确认阻塞的
调用可能被错误当作崩溃遗留并重新执行。对于包含外部副作用的 Tool，这会造成
用户已经取消后仍发生操作，也可能使 Provider Message 历史出现 Tool Call
没有匹配结果的孤儿记录。

OpenWorker 的 TurnEngine 在用户中止时会为该轮尚未执行的 Tool Call 生成明确
的 interrupted Tool Result，体现了有价值的 no-orphan completion 原则。但其
Python asyncio、低风险并行、权限模式和具体 Tool Message 实现不适合直接进入
RoboThree。

本 ADR 只吸收调用收敛不变量，使用 RoboThree 自有 Task、Run、Effect、
Confirmation、Conversation、RuntimeSelection 和 SQLite 事务模型重新实现。

## 2. 决策摘要

RoboThree 冻结以下不变量：

> 每个已经持久化的 Agent Tool Call，最终必须具有匹配的 Observation/Tool
> Result、明确的取消或拒绝结果，或者可解释且可恢复的 durable waiting
> disposition。不得永久停留为无法区分原因的 pending call。

同时：

- 用户主动取消与进程崩溃是不同事实；
- 尚未分发的调用在 Task/Run 取消后不得被普通恢复路径执行；
- 已经分发的调用继续遵守 ADR-007 的 Effect recovery 语义；
- 用户确认按同批原始顺序阻塞和恢复，不允许后续调用越过确认点；
- Retry 创建新 Run，不继承旧 Run 的 pending 调用，也不自动重放或复用旧
  Run 的成功调用；
- Kernel reducer、TaskStatus 和 Effect 状态集合保持不变。

## 3. Tool-Call Batch

### 3.1 批次身份与顺序

同一个 Assistant Message 中的 Tool Call 构成一个有序批次。批次顺序来自
Provider-neutral Assistant Message，并在首次持久化后不可变。

实现必须能根据稳定标识关联：

```text
sessionId
+ taskId
+ runId
+ assistantMessageId
+ toolCallId
+ actionId
```

具体内部表、字段和 Schema Version 由实施计划冻结，但不得只依赖
`toolCallId` 或当前 Session 的尾部消息推断跨 Run 所有权。

### 3.2 每调用收敛

每个持久调用只允许收敛到以下语义之一：

1. 已产生匹配的 Tool Result/Observation；
2. `cancelled_before_dispatch`；
3. 用户明确拒绝导致的 typed denied/cancelled result；
4. 等待精确 UserConfirmation 的 durable waiting；
5. 已进入现有 Effect 状态机，由其最终产生 completed、failed、cancelled、
   timed_out 或 uncertain Observation。

这里的 disposition 属于 Agent Loop/Conversation Application 语义，不增加
公共 TaskStatus，也不增加 ADR-007 Effect 状态。

### 3.3 Provider Message 完整性

任何进入下一次 Model Request 的 Assistant Tool Call 都必须具有 Provider
协议可接受的匹配 Tool Result，或者该 Turn 仍处于 durable waiting、尚未进入
下一次 Model Request。

禁止：

- 把没有 Result 的 Tool Call 发送回 Provider；
- 用空字符串伪装成功；
- 把取消伪装为确定失败；
- 把 `uncertain` 伪装为已取消或已完成；
- 删除已经持久化的 Tool Call 来隐藏未收敛事实。

## 4. Cancellation

### 4.1 未分发调用

Task/Run 已接受用户取消后：

- 当前批次尚未分发的调用收敛为 `cancelled_before_dispatch`；
- 不创建 Tool Effect；
- 不调用 Backend；
- 不进入普通 crash recovery；
- 必须形成有界、不包含 Tool 参数或敏感结果的 typed result/audit fact。

### 4.2 已分发调用

已经 `DISPATCHED` 的调用不由本 ADR 发明新状态，继续复用 ADR-007：

- Backend 能可信确认取消时，收敛为 cancelled Observation；
- Backend 返回确定失败时，收敛为 failed；
- 无法确认外部副作用是否发生时，收敛为 uncertain；
- 不支持幂等或状态查询时不得盲目重试。

### 4.3 取消传播

Desktop 继续只提交高层 `cancelTask`。Task Runtime 接受取消事实后，
Application 层传播 AbortSignal，并对未分发调用执行本 ADR 的批次收敛。

Renderer、Electron Main 和 Provider Adapter 不得自行推断剩余调用状态。

## 5. User Confirmation 与批次顺序

一批调用中的某个调用需要确认时：

1. 之前已完成调用的 Observation 保持不可变；
2. 当前调用锁定原始 Task/Run/Step/Action、参数 digest、Tool revision、
   Binding/Descriptor revision 和 ConfirmationRequest；
3. 后续调用保持 durable blocked，不得被 dispatch 或 crash recovery 越过；
4. 用户允许后，重新执行 ADR-006 的实时收窄检查，再从当前精确调用继续；
5. 用户拒绝或取消后，当前调用及后续未分发调用形成明确结果；
6. Desktop/Core 重启后仍恢复同一确认点和同一批次顺序。

确认不授权：

- 同批后续不同 Action；
- Retry 后的新 Run；
- 参数、真实路径、Tool revision 或 Binding 漂移后的调用；
- 新增的外部目标或扩大后的数据范围。

## 6. Crash Recovery

Recovery 只有在以下条件全部满足时才可执行 Tool Call：

- Task 与 Run 仍属于可恢复状态；
- 调用属于当前精确 Run；
- 不存在已接受的用户取消事实；
- 调用不是等待确认或被同批前序确认阻塞；
- 没有匹配终态 Result/Observation；
- CapabilityLock、TaskRuntimeSelection 和必要 Registry revision 仍可解析；
- 调用符合现有 Effect recovery mode 与实时收窄规则。

恢复必须保持：

- 原 Tool Call、Action、Effect Attempt 与幂等身份的既有生命周期；
- 同一调用恢复使用原稳定 idempotencyKey，传输尝试使用新的 requestId；
- 旧 Run 的迟到 Observation 不能改变新 Run；
- 无法可信判断外部结果时进入 uncertain，而不是创建第二次副作用。

## 7. Retry 新 Run

ADR-005 的规则保持：Retry 总是创建新 Run，旧 Run 不变。

新 Run：

- 不继承旧 Run 的 pending、blocked 或 cancelled Tool Call；
- 不自动 dispatch 旧 Run 已成功或失败的 Tool Call；
- 不根据 `sideEffectFree` 单一字段自动复用旧结果；
- 不根据“非幂等”结论自动重新执行外部副作用；
- 可以把旧 Run 的有界历史事实纳入新的 Context，但必须重新规划并创建新的
  Action/Effect。

如果新 Run 决定再次执行相同逻辑操作：

- 使用新的 Run/Step/Action/EffectAttempt 身份；
- 重新经过 CapabilityLock、权限、确认和实时状态检查；
- 业务级去重继续使用类型化 idempotencyKey 与 ADR-007 recovery mode；
- 旧结果不确定时必须先查询、确认或进入 manual reconciliation。

未来是否复用只读结果、缓存查询或声明 Tool 执行并行性，属于独立
`ToolExecutionSemantics` 决策，不在本 ADR 中实现。

## 8. 并发与执行顺序

MVP 默认串行执行同批 Tool Call。

本 ADR 不采用 OpenWorker 的“低风险等于可并行”规则。`ToolRiskFacts` 继续只
负责授权和用户确认；安全风险低不能证明：

- 无顺序依赖；
- 无共享资源冲突；
- 不受连接池或 rate limit 限制；
- 取消和部分成功可以安全收敛。

未来若建设并行 Tool，必须另立决策，候选语义包括 `sideEffectFree`、
`parallelSafe`、`orderingKey`、`resourceConflictScope` 和
`maxConcurrency`。未知或未声明时必须串行。

## 9. 分层与修改边界

实施允许修改：

```text
Application Agent Loop
Conversation Persistence Port/Adapter
Tool Call Recovery
Provider-neutral Tool Result conversion
InMemory/SQLite Conformance
CGF-2C 联合 Harness
```

实施不得修改：

```text
Kernel reducer
TaskStatus 集合
Effect 状态集合
ADR-006 ToolRiskFacts
Desktop 自有 reducer
Central Model Invocation 七状态
```

如果实现需要公共 Contract additive 字段，必须先形成最小 Contract/Fixture/
Conformance 修订，不得把内部 disposition、Effect、Receipt、CapabilityLock 或
原始 Tool 参数暴露给 Desktop。

## 10. CGF-2 与 DCF 阶段门槛

ADR-017 的设计可以在 CGF-2B 期间与双协议 Provider 工作并行收口，但其实现、
Conformance 和独立 QA 是 CGF-2C.1 的硬前置：

```text
ADR-017 ACCEPTED
AND Agent Tool-Call Batch 实现完成
AND InMemory/SQLite Conformance PASS
AND Claude Code 独立 QA P0/P1=0
AND 用户接受
→ CGF-2C.1
```

设计并行不代表门槛取消。CGF-2A.2、CGF-2A.3 和 CGF-2B 不因本 ADR 返工或
自动解锁。

DCF-3 的客户端预装本地 Tool E2E 同样必须使用通过本 ADR 的 Agent Loop，不得
使用只适用于单 Tool Call 的旁路恢复逻辑。

## 11. 验证矩阵

实施计划和独立 QA 至少覆盖：

1. 一批 N 个调用，在第一个调用分发前取消；
2. 第一个调用执行期间取消，后续调用均未分发；
3. 已分发调用取消成功；
4. 已分发调用结果不确定并进入 uncertain；
5. 中间调用等待确认，Desktop/Core close/reopen 后恢复同一确认；
6. 确认允许后按原顺序继续；
7. 确认拒绝或取消后，当前及后续调用明确收敛；
8. 崩溃发生在 Assistant batch commit 后、第一个 Tool dispatch 前；
9. 崩溃发生在 Tool Effect commit 后、Result Message commit 前；
10. 旧 Run 迟到 Observation 被拒绝；
11. Retry 新 Run 不继承旧 Run pending call，也不自动重放旧成功调用；
12. Provider Message 中所有 Tool Call/Result 一一匹配；
13. 相同取消/确认命令幂等重放，不同 digest 冲突；
14. InMemory 与 SQLite 使用同一 Conformance；
15. SQLite close/reopen 和并发恢复只产生一个 owner；
16. 报告不包含 Tool 参数、Tool Result 正文、Prompt、Credential、Token 或
    完整本地路径。

## 12. 采用、后置与拒绝

| OpenWorker 候选 | RoboThree 决策 | 边界 |
| --- | --- | --- |
| no-orphan Tool Call completion | `ADAPT` | 使用 RoboThree durable Task/Conversation/Effect 重写 |
| interrupt 与 crash recovery 分离 | `ADAPT` | 本 ADR |
| 低风险 Tool 并行 | `DEFER` | 等独立 ToolExecutionSemantics |
| Inbox/HITL 状态机 | `DEFER` | 未来只考虑 Attention Projection |
| 多模式 Permission | `REJECT`（MVP） | ADR-006 保持 |
| Python asyncio/Tauri/aisuite | `REJECT` | 保持 TypeScript/Java/Electron |
| JSON 关键状态 | `REJECT` | 使用 SQLite/PostgreSQL durable facts |

## 13. 备选方案

### 13.1 保持现有“无 Tool Result 即 pending”

`REJECT`。无法区分用户取消、确认阻塞和真实崩溃，存在恢复误执行风险。

### 13.2 取消时删除 Assistant Tool Call

`REJECT`。删除 durable intent 会破坏审计、Provider Message 历史和恢复证据。

### 13.3 取消时把全部调用标记为 failed

`REJECT`。取消不是确定失败；已经分发且结果未知时必须是 uncertain。

### 13.4 直接复制 OpenWorker TurnEngine

`REJECT`。技术栈、状态模型、权限模式、并行策略和持久化模型不兼容。

### 13.5 立即建设通用并行 Tool Scheduler

`DEFER`。MVP 优先保证串行调用的安全、幂等和恢复正确性。

## 14. 影响

### 正面影响

- 用户取消后未执行 Tool 不会因重启误执行；
- Provider Tool Call/Result 消息完整；
- Crash Recovery 与 User Cancellation 有确定边界；
- 批次确认、Retry 和迟到结果可以使用统一 Conformance；
- 不破坏既有 Kernel、Effect 和 DCF-2 投资。

### 代价

- Conversation Persistence 需要表达调用 disposition 或等价 durable fact；
- Agent Loop 与 Tool Recovery 必须以 Task/Run/Batch 所有权联合判断；
- CGF-2C 前增加一项实现和独立 QA 门槛；
- 具体 Schema、双事务和故障窗口仍需实施计划冻结。

## 15. 来源与证据边界

### 上游事实

- OpenWorker commit：
  `f96ad4c8e6865f0aec519681a3717b6bcdd81546`；
- License：MIT；
- `coworker/engine.py` 在中断后为剩余 Tool Call 写入 interrupted Tool
  Result，并将低风险调用并行、其他调用串行；
- `coworker/skills/base.py` 使用 Skill catalog 与正文按需加载。

### 研究限制

- 当前 OpenWorker 研究为静态分析；
- 未安装依赖或运行其完整测试；
- 研究目录尚缺独立 `LICENSE-NOTES.md`；
- 因此只能作为 `DESIGN_ONLY`，不得复制源码进产品仓库。

### RoboThree 推断

RoboThree 当前整批持久 Tool Call、取消提前返回和“无 Result 即 pending”的恢复
组合可能把主动取消或确认阻塞误判为 crash recovery。该风险由 RoboThree 现有
代码路径与上游 no-orphan 设计交叉推导，并不是 OpenWorker 对 RoboThree 的
直接结论。

## 16. 当前门槛

```text
ADR-017：ACCEPTED / DOCUMENT CONSISTENCY REVIEW PASS / IMPLEMENTED / IMPLEMENTATION GATE CLOSED
ADR-017 Implementation Plan：PASS/CLOSED
ADR17-I1：PASS/CLOSED
ADR17-I2：PASS/CLOSED
ADR17-I3：PASS/CLOSED
CGF-2B：PASS/CLOSED
CGF-2C.1/2/3：GATED
Enterprise Integration：GATED
```

ADR17-I1/I2/I3 均已通过独立 QA 并由用户正式接受关闭，ADR-017 Implementation
Gate 已满足并正式关闭。该关闭只满足 CGF-2C.1 的技术前置，不构成编码授权；
CGF-2C.1 仍须完成下一阶段方案确认并取得用户明确授权。
