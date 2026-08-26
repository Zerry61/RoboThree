# RoboThree KAF-5 开发计划：Conversation、Context、Compaction 与 Headless Agent Framework

> 状态：**CLOSED — KAF-5.0～5.3 独立 QA 全部 PASS**  
> 日期：2026-07-22  
> 修订日期：2026-07-23  
> 确认日期：2026-07-23  
> 编码门槛：已满足——KAF-4.3 独立 QA `PASS`、第二轮文档评审 P0/P1/P2/P3 均为 0、用户已批准 [ADR-010](../adr/010-session-context-compaction-and-memory-boundary.md) 转为 `ACCEPTED`  
> 关闭日期：2026-07-23  
> 阶段结论：KAF-5.3 独立 QA 实际重跑统一 Harness 与完整门禁，P0/P1/P2/P3 均为 0；KAF-5 已关闭，允许进入 Desktop Client 与 Central Service Gateway 基础的并行规划

## 1. 目标

KAF-5 在 KAF-0～KAF-4 的状态、持久化、Capability、Tool Adapter、授权、并发和可靠性基础上，建立真正的无 UI Agent 闭环：

```text
Session/Conversation + Task projection + locked capabilities
→ bounded Context Assembly
→ Fake Model streaming
→ assistant response or Tool Action
→ Authorization/UserConfirmation
→ Effect/Tool/Observation
→ next-turn Context
→ completion/recovery
```

Harness 只用于测试，不发展为产品 CLI。KAF-5 不接真实 Model Provider、Desktop、Central Service、Knowledge 平台或真实 Skill Runtime，也不实现跨 Session 长期 Memory、用户画像、向量记忆、自动偏好提取或 Agent 自主学习。

## 2. 冻结前边界

本计划已经完成以下唯一状态流并转为 `CONFIRMED`：

```text
KAF-4.3 独立 QA PASS
→ ADR-010/KAF-5 第二轮文档评审无 P0、无未关闭 P2
→ 用户再次明确批准
→ ADR-010: PROPOSED → ACCEPTED
→ KAF-5 Plan: DRAFT → CONFIRMED
→ 允许进入 0.0.0-kaf.5.0a
```

上述门槛已于 2026-07-23 满足。用户此前对架构方向或修订方案的确认没有自动触发状态转换；本次状态变化依据用户在第二轮评审 `PASS` 后给出的明确批准。

候选边界：

1. 采用 ADR-010 的六类对象分离；
2. 采用方案 B，不重写 KAF-4 已冻结的 `v1alpha2` Contract 引用，包括 KAF-0～KAF-3 中随 KAF-4.1 升级到 `v1alpha2` 的部分；保留既有 `v1alpha1 → v1alpha2` 读取/升级回归；
3. Compaction 使用 Session 级双事务，不复用 Task Receipt/Checkpoint 或 Tool EffectAttempt；
4. `SelectedSkillContext` 只作为 Core 内部不可变类型和测试 Fixture，不属于公共 Contract；KAF-5.2 只消费已物化值，不实现真实 Skill Runtime；
5. TaskStatus 不增加 Context 内部阶段；
6. Context 固定使用 `Turn Snapshot → Budget Policy → Context Assembly → Token Measurement/Reduction → Model Conversion`，Tool/Knowledge/Workspace 结果加入后重新执行预算检查；
7. 原始 Conversation 和 Task Event 不因压缩被删除或覆盖；
8. Compaction Summary 不是 Task 状态或执行结果的事实源；
9. 每批独立 QA `PASS` 后才能进入下一批。

## 3. `0.0.0-kaf.5.0`：Context Contract 与 Persistence Spine

预计：**3～4 个工作日**。正式开发版本仍为 `0.0.0-kaf.5.0`，内部使用两个顺序检查点，不创建 `5.0a/5.0b` 包版本。

### 3.1 5.0a Contract Checkpoint

交付候选：

- Conversation/Context/Compaction/Model 独立版本常量和 unknown-version fail-closed；
- Conversation 持久化 Envelope、SessionHead、SessionCommand/Receipt/Event；provider-neutral rich message 内容留在 KAF-5.1；
- CompactionJob、CompactionRecord；
- messageSequence、sessionEventSequence、contextRevision 与 activeCompactionId；
- source range/digest、baseActiveCompactionId、baseContextRevision 和 canonical digest；
- strict、JSON-safe、Secret/Handle/PID 拒绝；
- 方案 B 回归：KAF-4 `v1alpha2` Runtime/Persistence/Capability/Authorization 不重写。

5.0a 必须逐项满足以下可判定检查清单，任一失败都禁止进入 5.0b：

- [x] 四个新领域分别声明 `v1alpha1`，不存在借用 KAF-4 版本常量的隐式耦合；
- [x] 所有新增公共 Zod Schema 使用 strict 语义，合法/非法 `parse` 或 `safeParse` 用例齐全；
- [x] 未知领域版本、未知枚举、额外字段和不完整 discriminated union 失败关闭；
- [x] 所有持久化及跨边界值均为 JSON-safe，拒绝函数、循环引用和非数据运行时对象；
- [x] 公共 Contract 不含 Credential/Secret、正文型敏感字段、PID、文件/数据库句柄、Provider SDK 对象或 Runtime Handle；
- [x] Command canonical serialization 和 digest 在字段顺序变化、重复计算和 close/reopen 后保持稳定；
- [x] Session/Message/Task/Action/Observation/Compaction 引用的存在性、领域归属和 sequence 范围规则明确；
- [x] `SelectedSkillContext` 未从 `packages/contracts` 导出，也未成为 Persistence 或跨进程 Contract；
- [x] `pnpm run typecheck`、架构 boundary check 和相关 package build 零错误；
- [x] KAF-0～KAF-4 `v1alpha2` Contract 及现有 `v1alpha1 → v1alpha2` 读取/升级测试全量回归通过。

5.0a 证据必须在对应开发记录中列出 Contract 测试文件、命令、结果和边界检查结果；“Schema 已定义”不能替代上述通过标准。

### 3.2 5.0b Persistence Spine Checkpoint

交付候选：

- 语义化 ConversationPersistence Port；
- InMemory 参考实现和 Conformance Suite；
- 实际 SQLite migration：SessionHead、ConversationMessage、SessionEvent、SessionCommandReceipt、CompactionJob、CompactionRecord 及关联 Outbox 字段/关系；
- 主键、外键、sequence/digest 查询索引，以及数据库级 `one-pending-job-per-session` partial unique index；
- request/commit/fail/stale Compaction 事务输入；
- Session Command Receipt 幂等与冲突；
- 两笔事务都在 `BEGIN IMMEDIATE` 后重读并验证；
- 第二事务基于 `activeCompactionId + contextRevision` compare-and-set，且只接受恰好一行更新；
- 新消息并发追加、stale baseActiveCompactionId/baseContextRevision 和并发结果提交；
- pending Job recovery 查询；
- SQLite schema preflight，对较新、损坏、不完整或无法安全迁移的 Schema 失败关闭；
- InMemory/SQLite 共用 Conformance；
- 双事务命名崩溃点、故障注入和 close/reopen 恢复。

Migration 已按实施时的下一个连续编号落为 migration 5；该编号来自 migration 4 的实际后继，不是计划阶段预占。5.0b 交付的是可运行 Migration、Persistence Adapter、Schema Preflight 和 Conformance，不接受仅有表结构设计稿作为完成证据。

5.0b 测试映射：

| 不变量或故障 | 必须实现的自动化测试 |
| --- | --- |
| 每 Session 最多一个 pending Job | 两个并发 `request_compaction`；InMemory 语义一致，SQLite 由 partial unique index 最终保证 |
| 第一事务无 TOCTOU | 在应用预检查后并发改变 Session，再确认事务内重读拒绝陈旧请求 |
| 前缀摘要允许新消息追加 | 锁定 `sourceEndSequence` 后追加消息，合法 Compaction 仍可提交且新消息保留在 raw tail |
| 锁定范围不可变 | source range/digest 或 base revision 不匹配时失败关闭 |
| 第二事务防覆盖 | 两个结果竞争提交，只有一个 compare-and-set 成功，另一个收敛为 stale |
| Receipt 幂等与冲突 | 同 ID/同 digest 回放原 Receipt；同 ID/不同 digest 返回 typed conflict |
| 第一事务后崩溃 | SQLite close/reopen 后找回 pending Job，并按同一 Job 恢复、重试或终止 |
| 摘要结果取得后、第二事务前崩溃 | 不重复创建 Job；以稳定 compactionJobId 和新 modelRequestId 恢复提交或显式终止 |
| 第二事务后响应前崩溃 | 重试返回已提交 Receipt，不重复 Record/Event/Outbox |
| Schema 生命周期 | fresh database、当前 Schema 升级、重复启动、较新/损坏/不完整 Schema 失败关闭 |
| Adapter 一致性 | 相同 Persistence Conformance Suite 参数化运行于 InMemory 和 SQLite |

5.0b 实现与独立 QA 状态：上述 11 项测试映射均已有自动化证据；41 个测试文件、342 项测试，独立 QA `PASS`，KAF-5.0 已关闭。

### 3.3 KAF-5.0 非目标

- ContextAssembler、TokenEstimator、摘要模型调用；
- Agent Loop、Tool Schema 注入；
- Skill Reader、Knowledge、Workspace 文件读取；
- Desktop、真实 Model Provider 或新增 MCP 实现。

### 3.4 KAF-5.0 退出门槛

1. ADR-010 为 `ACCEPTED`、本计划为 `CONFIRMED`，实现与 ADR-010 §3.8/§3.9 一致；
2. 5.0a 十项检查全部有自动化证据，未跳过 Contract Checkpoint；
3. KAF-4 `v1alpha2` 数据及既有 `v1alpha1 → v1alpha2` 读取/升级保持可用；
4. 新领域版本独立，未知版本和非法公共数据失败关闭；
5. Session 与 Task 所有权、revision、receipt、event sequence 和 checkpoint 不混用；
6. 实际 SQLite migration、schema preflight、数据库 pending 唯一约束完成；
7. 两笔事务内重检、第二事务 compare-and-set、幂等、并发和恢复通过 InMemory/SQLite Conformance；
8. 不跨 Model 调用持有 SQLite 事务；
9. Kernel 无 ConversationPersistence/Compaction 依赖；
10. 完整回归和独立 QA `PASS`。

## 4. `0.0.0-kaf.5.1`：Conversation 与 Turn Foundation

预计：**4～5 个工作日**。

交付候选：

- Session/Conversation Message 持久化；
- 用户/助手结构化内容与 Task/Action/Observation 稳定引用；
- Session 与 Task 关联查询；
- TurnContextSnapshot 与精确来源 revision/digest；
- Model Protocol 的 provider-neutral rich message、assistant tool call 和 tool result；
- InMemory/SQLite 同一 Conformance；
- close/reopen、message sequence、重复 ID、不同 digest、损坏/较新 schema 测试；
- 对话和 Task 执行事实的确定投影顺序。

KAF-5.1 不注入 Tool Schema，不生成具体 Provider SDK 请求，也不依赖 Tool Registry、真实 Model Provider、Context 压缩或 UI。Tool Action/Observation 的执行事实仍来自既有 Task/Event，ConversationMessage 只保存稳定引用或模型可见投影。

最小 Alpha 正确性基线：

- 固定 Fixture 至少包含 3 个 User Turn、3 个 Assistant Turn、1 组 assistant tool call/tool result 和 2 个关联 Task；
- 同一 Fixture 连续投影 10 次，消息顺序和 digest 必须一致；
- InMemory 与 SQLite 产生相同投影；SQLite close/reopen 后 message sequence、引用和 digest 不变；
- 原始 ConversationMessage 只能 append，任何 update/delete 原消息的 Persistence 操作都不进入 Port；
- 损坏引用、跨 Session 引用、重复 ID/不同 digest 和较新 Schema 必须失败关闭。

退出门槛：上述 Fixture、Conformance、close/reopen 和确定性检查全部通过，并经独立 QA `PASS`。

实现与独立 QA 状态：固定 Fixture、10 次确定投影、InMemory/SQLite 一致性、migration 6、close/reopen、append-only 和损坏引用失败关闭均已有自动化证据；44 个测试文件、357 项测试，独立 QA `PASS`，KAF-5.2 已解锁。

## 5. `0.0.0-kaf.5.2`：纯 Context Assembly 与 Token Budget

预计：**4～6 个工作日**。

交付候选：

- `TurnSnapshotBuilder → ContextBudgetPolicy → ContextAssembler → TokenMeasurement/Reduction → ModelMessageConverter` 独立流水线；
- 内部 Rich AgentMessage、provider-neutral ModelRequest 和 ModelMessageConverter；
- Static/Dynamic Segment；
- 只从已授权、已注册、版本兼容且被 TaskCapabilityLock 锁定的能力注入 Tool Schema；
- Core 内部 `SelectedSkillContext` 类型与 Fixture 的包含/排除/revision/digest/Snapshot 归属/预算测试；
- TokenEstimator Port + Fake/保守估算；
- pre-call 与 mid-turn budget guard；
- 大 Tool Result → Artifact/reference + bounded preview；
- Context Assembly Receipt/source digest；
- 相同 Snapshot 的确定 Segment 顺序和 digest。

职责边界：

- KAF-5.1 只定义 provider-neutral rich message/tool call/tool result；
- KAF-5.2 才负责 Tool Schema 注入、Context 到版本化 provider-neutral ModelRequest 的转换，并以 Fake ModelProvider Fixture 验证 Provider-facing Conversion；
- 具体厂商 payload、缓存字段和 SDK 对象仍属于未来真实 Provider Adapter，不进入 Core Contract。

只有已选择、已授权且属于当前 TurnContextSnapshot 的来源可以进入 Context。Tool、Knowledge 或 Workspace 结果加入后必须重新经过 Budget Policy、Assembly 和 Token Measurement/Reduction；不得只对原预算做差量假设。

明确不包含真实 `.claude/skills`/`.robothree/skills` Reader、目录扫描、Skill 冲突/导入、真实 Knowledge、向量数据库、真实 Workspace 文件读取或真实 Model Provider。

最小 Alpha 正确性基线使用固定测试参数，不构成产品默认值或 SLA：

```text
modelContextWindow    = 8192 tokens
reservedOutputTokens  = 1024 tokens
safetyMarginTokens    = 512 tokens
compactionThreshold   = availableInputTokens × 0.8
maxPreviewBytes       = 4096 bytes
```

- 对可用输入预算、压缩阈值和 preview 上限执行 `N-1 / N / N+1` 边界测试；
- 至少注入一个 128 KiB Tool Result，验证只保留不超过 4096 bytes 的 preview、digest 和引用；
- Tool/Knowledge 结果加入前后分别记录预算证据，加入后的 ModelRequest 仍不得超过 `availableInputTokens`；
- 未选择、未授权、未锁定、版本不兼容、revision/digest 不匹配或不属于当前 Snapshot 的来源全部排除；
- 相同 Snapshot 连续组装 10 次，Segment 顺序、source digest 和 ModelRequest digest 一致；
- `SelectedSkillContext` 不从公共 Contract 导出，测试期间不读取真实 Skill 文件系统。

退出门槛：上述边界值、重新预算、来源排除、Tool Schema 锁定和确定性检查全部通过，并经独立 QA `PASS`。

完成状态：Task source 已锁定 TaskCapabilityLock revision/digest；纯 Context Pipeline、Core 内部 `SelectedSkillContext`、保守 Fake TokenEstimator、Static/Dynamic Segment、provider-neutral ModelRequest、Context Assembly Receipt、4096-byte Tool Result preview/artifact reference、pre-call/mid-turn 全量重新预算和完整 turn reduction 均已有自动化证据。专项为 4 个测试文件、27 项测试；全量基线为 46 个测试文件、373 项测试，独立 QA `PASS`。

## 6. `0.0.0-kaf.5.3`：Compaction、最小 Agent Loop 与 Headless 验收

预计：**7～10 个工作日**，包含原单列的集成、缓冲、全量回归和独立 QA 前收口工作。

完成状态：**PASS**。Claude Code 在 Node.js 24.13.0 环境实际重跑统一 `harness:kaf53`（7 files / 75 tests）与完整 `check`（48 files / 394 tests），固定链、确认崩溃恢复、Compaction stale/三崩溃点、长 Tool Loop、Context/恢复性能和真实 ToolExecutionService bridge 全部通过，P0/P1/P2/P3 均为 0。

交付候选：

- CompactionCoordinator 与双事务真实编排；
- Fake Summarizer、Token before/after 和不可变 CompactionRecord；
- pending/failed/stale/completed recovery；
- latest valid Summary + raw tail 重建；
- 最小 AgentLoopCoordinator；
- Model stream → assistant/tool call → Authorization/Confirmation → Effect/Observation → next Model；
- Headless Test Harness 与一致 Event Timeline；
- 长上下文、长 Tool Loop、取消、timeout、崩溃、重启和并发 Compaction 故障矩阵；
- KAF-5 全阶段集成、InMemory/SQLite Conformance、全量回归、已知限制和独立 QA 证据收口。

固定验收链：

```text
1. Fake Model → Streaming → Completed
2. Model → Tool Action → Observation → next Model → Completed
3. High-risk Action → WaitingForUserConfirmation → Resume
4. Persist Intent → Crash → Restart → Recover
5. Context over budget → durable Compaction → raw tail → Continue
6. Tool loop grows context → mid-turn guard prevents overflow
```

最小 Alpha 正确性、恢复与性能基线：

| 类别 | 有限 Alpha 门槛 |
| --- | --- |
| Headless 正确性 | 六条固定链全部通过；涉及持久化的链分别运行 InMemory 和 SQLite；每条链至少重复 5 次且 durable Timeline digest 一致 |
| Compaction 并发 | 两个 request 竞争和两个 result 竞争各执行至少 10 轮；每轮至多一个 pending、至多一个 CAS 提交成功 |
| Recovery | 覆盖第一事务提交后、摘要结果取得后但第二事务前、第二事务提交后响应前 3 个命名崩溃点；SQLite 每点至少 close/reopen 10 次 |
| 长 Tool Loop | 固定 50 个 Tool round Fixture；每次结果加入后重新预算，在超过输入预算前触发 Reduction/Compaction 或明确失败关闭 |
| Context 性能 | 固定 500 条消息、32 个 Context Segment、16 个锁定 Tool Schema；复用现有 PerformanceHarness，5 次 warm-up + 20 次测量，纯组装/测量/转换路径 p95 不超过 500 ms |
| 恢复性能 | 1 个有效 Summary + 500 条 raw tail 的 SQLite close/reopen 重建在 2 秒测试上限内完成 |

性能数值只是在 Node.js 24.13.0 项目基线环境中防止明显无界或灾难性退化的 Alpha 工程门槛，不是正式 SLA、运营指标、跨硬件承诺或新性能平台。若 CI 环境差异导致阈值不可复现，必须在 KAF-5.3 开发前以文档评审方式调整，不得在实现中静默放宽。

KAF-5.3 退出门槛：

1. 六条链及上述正确性、并发、恢复、性能门槛全部有自动化证据；
2. InMemory/SQLite Conformance 和 KAF-0～KAF-5 全量回归通过；
3. Event、Receipt、Outbox、CompactionRecord 和 durable Timeline 一致；
4. 无跨 Model 调用数据库事务，无未关闭资源或无界 Tool Loop；
5. Kernel 不依赖 UI、具体业务场景、真实 Skill Runtime、真实 Model Provider、Desktop 或 Central Service；
6. 已知限制有界记录，独立 QA 无 P0、无阻断问题并为 `PASS`。

补充关闭门槛（2026-07-23 用户确认）：

1. `waiting_user_confirmation` 必须进入统一 Headless Harness，至少覆盖等待事实已持久化后进程退出、SQLite close/reopen、确认决定和原 Tool Action 恢复；
2. Compaction 必须包含旧摘要结果延迟到达的显式 stale 场景，证明旧 base 结果不能覆盖新的 active Compaction/Context revision；
3. 独立 QA 必须重新运行完整 Harness；durable Timeline digest 只用于比较重复执行结果，不得替代实际执行、崩溃注入、close/reopen 或状态断言。

## 7. KAF-5 之后

KAF-5 全阶段独立 QA `PASS` 后才并行：

```text
A. Desktop Client / KA-0 Chat
B. Central Service Gateway 基础
```

真实 Skill Runtime 在 KAF-5 PASS 后、Desktop Chat 完整验收前单独规划；Gateway 稳定后建设精简 Admin Console；Core/Desktop/Central 基础稳定后接入 Agent/Skill 发布闭环。

## 8. 工期

单一主开发流、边界稳定、Node 24.13.0 可用时：

| 批次 | 工程量 |
| --- | --- |
| KAF-5.0 | 3～4 个工作日 |
| KAF-5.1 | 4～5 个工作日 |
| KAF-5.2 | 4～6 个工作日 |
| KAF-5.3（含集成、缓冲、全量回归和 QA 前收口） | 7～10 个工作日 |
| 合计 | **18～25 个工作日** |

不包含等待用户确认、独立 QA 等待、重大 P0 返工、真实 Skill Runtime、真实 Model、Desktop 或 Central Service。工作日是工程量估算，不代表后台连续执行固定 8 小时。

## 9. 第二轮文档评审结论

Claude Code 第二轮只读文档评审已完成，未修改产品代码，并逐项验证：

1. P2-1：两笔事务是否都在锁内验证，数据库 pending 唯一约束、第二事务 CAS 和三类恢复路径是否闭合；
2. P2-2：5.0a 十项 Contract Checkpoint 是否逐项可判定，且失败会阻止 5.0b；
3. P2-3：5.0b 是否明确交付实际 Migration、Schema Preflight、两种 Adapter Conformance 和故障测试；
4. P2-4：ADR `PROPOSED → ACCEPTED`、计划 `DRAFT → CONFIRMED` 的状态流是否唯一且未被本次修订提前改变；
5. P2-5：Integration/Buffer 是否全部并入 KAF-5.3 并具有退出门槛；
6. P3-1：KAF-0～3 随 KAF-4.1 升级到 `v1alpha2` 的历史措辞是否准确；
7. P3-2：`SelectedSkillContext` 是否只为 Core 内部类型和 Fixture；
8. P3-3：KAF-5.1 provider-neutral Message 与 KAF-5.2 Tool Schema/Model Conversion 是否无职责重叠；
9. P3-4：Alpha 正确性、恢复和性能基线是否有限、可判定且未扩张为 SLA 或性能平台；
10. 是否仍存在 P0 或未关闭 P2，或引入长期 Memory、真实 Skill Runtime、真实 Model Provider、Desktop、Central Service、Knowledge 平台等越界内容。

第二轮结论为 `PASS`：P0/P1/P2/P3 均为 0，原 5 个 P2 和 4 个 P3 全部 `CLOSED`，无新问题；讨论记录为 `DISC-20260723-145409-codex`。用户已在该结论后明确批准，ADR-010 与本计划的状态转换完成。
