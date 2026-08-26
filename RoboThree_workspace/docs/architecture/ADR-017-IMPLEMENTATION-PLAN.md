# ADR-017 Implementation Plan

> 状态：**PASS/CLOSED — ADR17-I1/I2/I3 全部通过独立 QA 与用户接受**  
> 日期：2026-08-02  
> 对应决策：[ADR-017](../adr/017-agent-tool-call-batch-completion-cancellation-and-recovery.md)  
> 用户确认：2026-08-03 接受 ADR17-I3 独立 QA，Implementation Gate 三批全部正式关闭  
> 后续门槛：CGF-2C.1 仍需方案确认和用户单独授权；Enterprise Integration 继续 `GATED`  
> 非阶段编号：本计划不是 `CGF-2C.0`，而是 `CGF-2C.1` 的前置实施门槛

## 1. 目标

实现 ADR-017 已接受的 no-orphan Tool Call 不变量，使同一个 Assistant Message
中已经持久化的每个 Tool Call 最终都能解释为：

1. 已产生匹配 Tool Result；
2. 分发前已取消或拒绝；
3. 正在等待精确用户确认；
4. 被同批前序确认点阻塞；
5. 已进入 ADR-007 Effect 生命周期并可恢复。

用户取消、用户拒绝、等待确认和进程崩溃必须是不同的 durable 事实。实现不得
修改 Kernel reducer、公共 TaskStatus 或 Effect 状态集合。

## 2. 已有事实与当前缺口

### 2.1 直接复用

- `AgentLoopCoordinator` 已先持久化 Assistant Message，再按原顺序执行
  Tool Call；
- `DurableAgentConversationWriter` 已持久化 Provider-neutral Assistant/Tool
  Message；
- `ToolExecutionService`、Effect、Receipt 与 Observation 已实现 durable
  side-effect 语义；
- `UserConfirmationCoordinator` 已实现精确确认、幂等决定和实时收窄检查；
- Retry 新 Run、迟到 Observation 拒绝、SQLite close/reopen 和单写者语义已
  在 KAF/DCF 阶段关闭。

### 2.2 必须补齐

- 当前 pending 判定主要依赖“Assistant Tool Call 是否已有 Tool Result”；
- 未持久区分主动取消、确认阻塞和真实 crash 遗留；
- 一批调用中间等待确认时，后续调用没有独立 durable blocked disposition；
- Assistant batch、Tool Effect 和 Tool Result 属于不同 Application/Persistence
  提交点，必须冻结崩溃窗口与恢复规则；
- Retry 新 Run 与旧 Run pending batch 的隔离需要进入统一 Conformance。

## 3. 所有权与分层

```text
Agent Loop Application
├── ToolCallBatchCoordinator
├── ToolCallBatchRecoveryCoordinator
└── ProviderNeutralToolResultConverter

Conversation Persistence
├── Assistant Message
├── Tool Call Batch
├── Tool Call Disposition
└── Tool Result Message

Task Runtime / Effect Persistence
├── Action
├── EffectAttempt
├── Receipt
└── Observation
```

约束：

- Batch/disposition 是 Conversation Application 内部事实；
- Effect/Receipt/Observation 继续归 Task Runtime；
- Desktop 只获得既有 Task/Confirmation/Activity 安全 Projection；
- 不把 disposition、Effect、Receipt、CapabilityLock 或 Tool 参数加入 Desktop
  Contract；
- Kernel 不导入 Conversation、SQLite、HTTP、Electron 或恢复协调器。

## 4. 内部持久模型

### 4.1 ToolCallBatchRecord

至少物化：

```text
batchId
sessionId
taskId
runId
assistantMessageId
assistantMessageSequence
batchDigest
callCount
createdAt
```

`batchDigest` 必须由不可变的 Assistant Message 身份、Run 所有权和有序 Tool
Call 身份计算。不同顺序产生不同 digest。

### 4.2 ToolCallDispositionRecord

每个 Tool Call 至少绑定：

```text
batchId
toolCallId
actionId
ordinal
disposition
revision
updatedAt
```

内部 disposition 固定为：

```text
ready_to_dispatch
waiting_user_confirmation
blocked_by_prior_confirmation
effect_linked
result_committed
cancelled_before_dispatch
denied_before_dispatch
```

说明：

- 这是内部 Application/Persistence 枚举，不是公共 TaskStatus 或 EffectStatus；
- `effect_linked` 不复制 completed/failed/cancelled/timed_out/uncertain；这些事实
  仍由 Effect/Observation 所有；
- `result_committed` 只表示匹配 Tool Result 已与 disposition 原子写入；
- 终态记录不可就地改写为另一个终态；
- 所有转换使用 expected revision/CAS；重复同 digest 幂等，不同 digest 冲突。

### 4.3 派生批次状态

不新增独立公共 BatchStatus。批次状态由有序 disposition 和关联 Effect/Result
派生：

- 遇到 `waiting_user_confirmation`，后续调用只能是
  `blocked_by_prior_confirmation`；
- 存在未收敛 `effect_linked` 时，不得开始下一次 Model Request；
- 所有调用均拥有匹配结果或显式取消/拒绝结果后，才允许把完整 Provider Message
  送入下一轮 Model。

## 5. SQLite 与双事务协调

### 5.1 Transaction A：Conversation batch intent

以下事实必须在同一个 SQLite 写事务内原子提交：

```text
Assistant Message
+ ToolCallBatchRecord
+ 每个 Tool Call 的初始 disposition
```

任一写入失败时，三类事实全部不对恢复路径可见。禁止先提交 Assistant Message，
再逐条 best-effort 创建 disposition。

### 5.2 Transaction B：Task Action/Effect

Action、EffectAttempt、Receipt、Observation 继续使用 ADR-007/KAF-2 已关闭的
Task Runtime 原子事务。Conversation Adapter 与 Task Adapter 虽然在 Alpha 中
使用同一个 SQLite 文件，但使用独立连接和 Port，因此本计划不宣称跨 Adapter
原子事务。

正确顺序：

```text
Transaction A 提交 batch intent
→ 校验当前 disposition 仍可分发
→ Task Runtime 持久化 Action/Effect
→ 以稳定 actionId/effectAttemptId 关联 disposition
→ 调用 Backend
```

不得先把 disposition 标记为已分发，再创建 durable Effect。

### 5.3 Transaction C：Tool Result completion

匹配的 Tool Result Message 与 `result_committed` disposition 必须在同一个
Conversation 写事务内提交。重复相同 Tool Result digest 幂等，不同结果冲突。

### 5.4 命名崩溃窗口

| 窗口 | 可见事实 | 恢复规则 |
| --- | --- | --- |
| A 提交前 | 无 batch | 不恢复、不执行 |
| A 提交后、B 前 | `ready_to_dispatch` | 当前 Run 有效且未取消时可取得单 owner |
| B 提交后、关联回写前 | 已有 Effect，disposition 未关联 | 按 actionId/effectAttemptId 重新关联，禁止创建第二 Effect |
| Backend 可能执行、Observation 前 | `DISPATCHED` Effect | 只按 ADR-007 recovery mode 恢复；不盲目重试 |
| Observation 后、C 前 | Task 已有终态 Observation | 从稳定关联生成一次 Tool Result；唯一键/CAS 防重复 |
| C 提交后 | `result_committed` | 不再执行，不再恢复 |

不存在通用跨 Port exactly-once。正确性来自 intent-first、稳定身份、唯一约束、
CAS、幂等与 evidence-based recovery。

## 6. Application Port 方向

允许对内部 Conversation Persistence Port 增加类型化语义方法，例如：

```text
appendAssistantBatch(...)
loadToolCallBatch(...)
listRecoverableToolCallBatches(...)
transitionToolCallDisposition(...)
appendToolResultAndCompleteDisposition(...)
```

具体方法签名在 ADR17-I1 编码前冻结。禁止：

- 万能 `execute`/CRUD Port；
- 由 Renderer 或 Provider Adapter 写 disposition；
- 用完整 Session 扫描替代 Task/Run/Batch 精确索引；
- 仅凭 `toolCallId` 跨 Run 判断所有权。

## 7. 批次计划

### 7.1 ADR17-I1：Batch Contract、Persistence 与原子 intent

交付：

- 内部 Batch/Disposition schema 与 strict validation；
- 下一个可用 SQLite migration；
- InMemory/SQLite 两套 Adapter；
- Transaction A/C 原子提交；
- digest、revision、唯一约束、幂等/conflict；
- 旧 Conversation 数据读取兼容；
- Kernel、Desktop、Central 和公共 Enterprise Contract 保持不变。

退出：独立 QA PASS、用户接受后才可授权 ADR17-I2。

### 7.2 ADR17-I2：Agent Loop、取消、确认与恢复

交付：

- 串行 Batch Dispatcher；
- 取消前分发收敛；
- 等待确认和后续 blocked 顺序；
- allow/reject 后继续或收敛；
- Effect 关联与双事务 reconciliation；
- Retry 新 Run 隔离；
- Provider Message 完整性验证；
- 已分发调用继续复用 ADR-007。

退出：独立 QA PASS、用户接受后才可授权 ADR17-I3。

### 7.3 ADR17-I3：统一 Conformance 与 Recovery Harness

独立实际执行 ADR-017 §11 全矩阵，至少覆盖：

1. 第一调用前取消；
2. 第一调用执行期间取消，后续未分发；
3. 已分发调用取消成功；
4. 已分发调用进入 uncertain；
5. 中间调用等待确认后 Desktop/Core close/reopen；
6. allow 后保持原顺序；
7. reject 后当前与后续调用明确收敛；
8. Transaction A 提交前/中故障，验证无半批事实；
9. A 后 B 前崩溃；
10. B 后 disposition 关联前崩溃；
11. Effect commit 后 Result commit 前崩溃；
12. 旧 Run 迟到 Observation；
13. Retry 新 Run 不继承或重放旧调用；
14. Tool Call/Result 一一匹配；
15. 相同命令幂等、不同 digest 冲突；
16. InMemory/SQLite 同一 Conformance；
17. SQLite close/reopen 和并发恢复单 owner；
18. 报告敏感内容扫描为 0。

退出：Claude Code 独立 QA `P0/P1=0`、用户明确接受，随后 CGF-2C.1 仍需
用户单独授权。

## 8. 非目标

- 不实现并行 Tool Call；
- 不新增 Inbox/Message Bus；
- 不修改 ToolRiskFacts；
- 不建设 Tool Result 跨 Retry 自动复用；
- 不实现 CGF-2C Model Gateway、Desktop Model Confirmation 或真实用户外发；
- 不修改 Central Model Invocation 七状态；
- 不复制 OpenWorker Python/asyncio/Prompt/DTO/测试源码。

## 9. 上游与复用边界

| 来源 | 采用 | 不采用 |
| --- | --- | --- |
| OpenWorker `f96ad4c...` | `ADAPT` no-orphan completion、interrupt/crash 分流 | Python asyncio、低风险并行、Inbox、权限模式 |
| RoboThree ADR-007 | Effect/Receipt/Observation、recovery mode、uncertain | 不扩展 Effect 状态 |
| RoboThree DCF-2 | 用户确认、取消、Retry、Desktop Projection | 不把 Desktop 变成状态事实源 |
| RoboThree KAF-5 | Conversation 与 Agent Loop | 不保留“无 Result 即一律 pending”的旧推断 |

上游保持 `DESIGN_ONLY`，不得复制研究仓源码进入产品仓库。

## 10. 工期与门槛

| 批次 | 集中工程工作量 |
| --- | ---: |
| ADR17-I1 | 2～3 天 |
| ADR17-I2 | 1～2 天 |
| ADR17-I3 | 1 天 |
| 合计 | 4～6 天 |

不包含独立 QA、返工和人工等待。

当前状态：

```text
ADR-017：ACCEPTED / IMPLEMENTED / IMPLEMENTATION GATE CLOSED
ADR-017 Implementation Plan：PASS/CLOSED
ADR17-I1：PASS/CLOSED
ADR17-I2：PASS/CLOSED
ADR17-I3：PASS/CLOSED
CGF-2C.1/2/3：GATED
Enterprise Integration：GATED
```

## 11. 文档评审重点

1. Transaction A/C 原子边界与 Transaction B reconciliation 是否充分；
2. disposition 是否保持内部事实且不复制 Effect terminal；
3. 同 SQLite 文件、独立 Adapter/Connection 的表述是否符合代码事实；
4. 旧 Conversation 数据兼容与 migration 是否遗漏；
5. Retry、确认、取消和 crash 是否覆盖全部 no-orphan 分支；
6. 是否出现对 Kernel、Desktop、Central 或公共 Contract 的越界修改。
