# ADR-010：Session、Context Assembly、Compaction 与 Memory 边界

> 状态：**ACCEPTED**  
> 提出日期：2026-07-22  
> 修订日期：2026-07-23  
> 接受日期：2026-07-23  
> 接受依据：KAF-4.3 独立 QA `PASS`；第二轮 Claude Code 文档评审 `PASS`（P0/P1/P2/P3 均为 0）；用户明确批准  
> 适用阶段：KAF-5 Headless Agent Framework

## 1. 背景

RoboThree 已经具备 Task/Run/Step、Action/Observation、Event/Checkpoint、Command/Effect 幂等、崩溃恢复、Capability Registry、TaskCapabilityLock 和类型化 Model/Tool Port，但仍缺少从持久 Session 与任务事实生成模型输入的完整链路。

现有 `TaskRunState` 是任务执行状态，不是对话 Transcript；现有 `ModelRequest` 是最小 Provider 请求，不负责组合 Agent、Skill、Tool、会话、Knowledge 或 Workspace。KAF-5 若直接通过测试代码拼接 ModelRequest，只能验证 Adapter，不能证明通用 Agent Framework。

本 ADR 冻结 Session、Context、Compaction 和长期 Memory 的所有权、版本及事务边界。它不改变 KAF-4 的固定授权、用户确认、并发和可靠性范围，自 2026-07-23 接受后约束 KAF-5 及后续相关实现。

## 2. 上游证据与采用方式

| 来源 | 固定版本 | 借鉴 | RoboThree 调整 |
| --- | --- | --- | --- |
| Hermes Agent | `3d9be2789552a495c7adf30148e867e7614a4bdc` | 持久消息与 API-time 注入分离；Memory/Knowledge 不污染原始消息；静态/动态上下文 | 不采用 Python God Object、具体 Prompt 或自主 Memory 写入 |
| OpenHands Software Agent SDK | `4fe565663af2b4f1130a6e0dac7566b002bfe9b4` | Static/Dynamic Context、Event 到模型消息转换、Condensation 与增量 View | 不采用 Conversation God Object；不等溢出后才压缩 |
| Pi Agent | npm `v0.80.7` / commit `c9715af` | `transformContext → convertToLlm`、Turn Snapshot、append-only Compaction Entry | 不采用 JSONL Session Store；增加 pre-call 与 mid-turn budget guard |
| OpenClaw | `deccdb5e57af6800d4f020ea2034166592a149ba` | Session/Transcript/Root/Active Memory 分层与 Provider 化 | 只作为未来长期 Memory 参考，不进入 KAF-5 完整实现 |
| LangGraph | `49ae27c2ae983cfb92091b0dea9f7bc37a716479` | Checkpoint、Replay、持久等待与 Conformance | 只复用恢复原则，不引入 Graph Runtime |

全部采用 `DESIGN_ONLY` 重写。无许可证的 Claude Code 逆向研究只能作为设计线索，不作为源码来源。

## 3. 核心决策候选

### 3.1 六类对象分离

```text
ConversationMessage   # 用户与助手的持久交互事实
TaskExecutionState    # Task/Run/Step/Action/Observation 执行事实
ContextSource         # Agent/Skill/Tool/Knowledge/Workspace 来源
TurnContextSnapshot   # 本轮来源、revision、digest 与顺序
ModelRequest          # Provider 临时输入
CompactionRecord      # 一段历史的不可变摘要和来源范围
```

长期跨 Session Memory 是独立的第七个领域，KAF-5 不实现。不得把 Conversation 全部塞入 `TaskRunState`，不得把临时注入写回原始消息，也不得把 Knowledge 结果伪装成长期 Memory。

### 3.2 Session 与 Task 所有权

- Session 管理用户交互、多轮连续性和 Conversation 顺序；
- Task 管理一个可执行目标及其 Run/Step/Action/Observation；
- 一个 Session 可以关联多个 Task，Task 可以引用 `sessionId`；
- Tool Action/Observation 继续以现有 Runtime/Event 为事实来源，Conversation 只保存必要引用或模型可见投影；
- Session 与 Task 不共享 head、revision、receipt、event sequence 或 checkpoint 所有权；
- Session 与 Task 可以复用底层 Command、Receipt、Event、Outbox 和 Persistence 基础设施，但复用基础设施不得合并两者的状态机、序列空间或事实所有权。

### 3.3 Context Pipeline

```text
Stage 0 Turn Snapshot
→ 冻结本轮已选择且已授权的 Agent、Model、Skill Context、Tool、Task/Conversation 投影与来源 revision/digest

Stage 1 Budget Policy
→ 在读取完整历史、大文件或大结果之前预估预算

Stage 2 Context Assembly
→ static segments + dynamic segments + recent conversation + task projection

Stage 3 Token Measurement/Reduction
→ 以目标模型策略测量；超限时只对允许缩减的派生内容执行有界 reduction/compaction

Stage 4 Model Conversion
→ internal rich messages → provider-neutral ModelRequest → ModelProvider
```

每次 Model 调用前都重新检查预算；Tool、Knowledge 或 Workspace 结果加入 Snapshot 后必须重新执行 Budget Policy、Context Assembly 和 Token Measurement/Reduction，不能沿用加入前的预算结论。只有已选择、已授权、版本兼容且属于当前 TurnContextSnapshot 的内容可以进入 Context。ContextAssembler 只消费已经选择、校验和有界化的 Skill Context，不负责扫描或读取 Skill 目录。

### 3.4 Static 与 Dynamic Context

Static 包含系统模板、Agent Definition、锁定 Tool Schema、已物化稳定 Skill Context 和输出约束。Dynamic 包含用户消息、最近历史、Task Projection、Observation、Knowledge/Workspace 片段、Compaction Summary 和易变信息。

Static/Dynamic 是稳定性、注意力和缓存边界，不是两套持久化系统。未选择的 Agent、Skill、Tool、Knowledge 或 Workspace 内容不得进入 Context。

### 3.5 Tool Schema 可见范围

模型只能看到用户/Agent 候选范围内且由 TaskCapabilityLock 锁定的 Tool Definition 投影。Binding、AdapterDescriptor、Runtime Handle、PID、凭证和 health 不进入模型上下文。Tool Schema 在逻辑上属于每次模型调用；Provider 是否利用缓存由 Adapter 决定。

### 3.6 Token Budget

```text
availableInputTokens
= modelContextWindow - reservedOutputTokens - safetyMarginTokens
```

Alpha 可用 `availableInputTokens × 0.8` 作为可配置默认压缩阈值，但不得按总窗口硬编码。TokenEstimator 是模型相关策略；未知时保守估算。大 Tool Result、Knowledge 结果或文件正文持久为 Artifact/来源记录，模型只收到 bounded preview、digest 与引用。

### 3.7 Compaction Record 与源历史不可变

MVP 中的 `ConversationMessage` 是 append-only 事实。Compaction 不删除、覆盖或就地改写原始消息，只追加不可变派生记录：

```text
CompactionRecord
├── compactionId / compactionJobId / sessionId
├── sourceStartSequence / sourceEndSequence / sourceDigest
├── baseActiveCompactionId?
├── summary / summarySchemaVersion
├── summarizerModelRef / summarizerPromptRevision
├── estimatedTokensBefore / estimatedTokensAfter
└── createdAt
```

Context 使用最新有效 Summary 加 `sourceEndSequence` 之后的原始消息。摘要文本不要求跨调用完全确定，但一旦提交便不可变；提交失败不得替换当前 Context View。

Compaction Summary 只用于有界 Context View，不是 Task 状态、Action/Observation、执行结果或外部副作用的事实来源。任何执行判断必须回到对应 Task、Event、Observation、Receipt 或持久化事实，不得仅凭 Summary 推导已执行、已成功或已授权。

### 3.8 Session Command/Receipt 与 Compaction 双事务

Compaction 属于 Session 派生状态，不改变 Task revision，不生成 Task Checkpoint，也不复用面向 Tool 外部副作用的 `EffectAttempt`。它建立类型化的 `SessionCommand`、`SessionCommandReceipt`、`SessionEvent`、`SessionHead`、`CompactionJob` 与 `CompactionRecord`，复用 ADR-007 的 `commandId + canonical digest`、原子提交、Outbox 和 Conformance 原则。

Alpha 由唯一 `CompactionCoordinator` 类型协调，但数据库正确性不得依赖进程内单实例。每个 Session 同时最多一个 `pending` Job，该不变量必须由数据库约束保证，例如 SQLite partial unique index：

```sql
CREATE UNIQUE INDEX ... ON CompactionJob(sessionId) WHERE status = 'pending';
```

应用层预检查只用于尽早返回，不能替代事务内重检或数据库唯一约束。SessionHead 分离：

```text
messageSequence       # 消息追加顺序
sessionEventSequence  # Session 事件顺序
contextRevision       # 活跃 Context/Compaction 视图版本
activeCompactionId?
```

`CompactionJob` 必须锁定 `sourceStartSequence`、`sourceEndSequence`、`sourceDigest`、`baseActiveCompactionId` 和 `baseContextRevision`。第一笔事务固定为：

```text
request_compaction

BEGIN IMMEDIATE
  re-read SessionHead and locked source range
  validate source range/digest, baseActiveCompactionId and baseContextRevision
  insert CompactionJob(pending)
  append context.compaction_requested SessionEvent
  insert accepted SessionCommandReceipt
  insert Outbox
COMMIT
```

唯一约束冲突必须映射为确定的 typed conflict/已有 pending 结果，不得静默创建第二个 Job。只有第一笔事务提交后才能调用摘要模型。模型调用不在数据库事务中；`compactionJobId` 稳定，每次传输使用新 `modelRequestId`。生成期间允许在 `sourceEndSequence` 之后追加新消息，但不得修改锁定范围或静默把新消息并入摘要。

第二笔事务中的所有有效性和并发验证也必须在 `BEGIN IMMEDIATE` 之后完成，包括：Job 仍为 `pending`、source range/digest 未变、摘要和 Token 元数据合法、当前 `activeCompactionId` 与 `contextRevision` 仍等于 Job 锁定的 base。成功路径固定为：

```text
BEGIN IMMEDIATE
  re-read CompactionJob, SessionHead and locked source range
  validate pending/range/digest/summary/token metadata
  insert immutable CompactionRecord (uncommitted)
  compare-and-set SessionHead
    WHERE activeCompactionId = baseActiveCompactionId
      AND contextRevision = baseContextRevision
    SET activeCompactionId = compactionId,
        contextRevision = baseContextRevision + 1
  require exactly one updated row
  update CompactionJob(completed)
  append context.compaction_committed SessionEvent
  insert accepted SessionCommandReceipt
  insert Outbox
COMMIT
```

上述写入必须原子提交；若 compare-and-set 影响行数不是 1，成功事务整体不得提交 `CompactionRecord`。随后通过独立、幂等的 Session 终止事务把 Job 标为 `stale`，追加 Event/Receipt/Outbox，且不得改变 `activeCompactionId` 或 `contextRevision`。摘要生成或验证失败同样只通过幂等终止事务更新 Job/Event/Receipt/Outbox。

同 ID/同 digest 返回已有 Receipt；同 ID/不同 digest 冲突。第一笔事务后崩溃时 Recovery 查询找回 `pending` Job：未取得摘要结果时允许以同一 Job 重试模型传输，已有可验证结果时允许重试第二事务，已经失效时显式收敛为 `stale`/`failed`。第二笔事务提交后响应前崩溃时通过 Receipt 回放。并发结果只有第一个合法 compare-and-set 成功，旧 base 对应 Job 不能覆盖新视图。不得跨 Model 调用持有 SQLite 事务。

### 3.9 Contract 与领域 Schema Version

采用方案 B：KAF-5 不重写 KAF-4 已冻结的 `v1alpha2` Contract 引用，包括 KAF-0～KAF-3 中随 KAF-4.1 升级到 `v1alpha2` 的 Runtime/Persistence/Capability 部分及 KAF-4 Authorization。KAF-5 新领域分别从自己的版本开始：

```text
ConversationSchemaVersion = v1alpha1
ContextSchemaVersion      = v1alpha1
CompactionSchemaVersion   = v1alpha1
ModelProtocolVersion      = v1alpha1
```

以后只升级发生破坏性变化的领域。SQLite migration ID、跨边界 API/Envelope 版本与领域 Schema Version 相互独立。未知领域版本失败关闭。现有 `v1alpha1 → v1alpha2` 显式读取/升级回归必须保留；未来若统一改造 KAF-0～KAF-4 的旧版本引用，必须另行评审，不借 KAF-5.0 扩大迁移范围。

### 3.10 Prompt Cache

Core 只表达 Static Segment digest、Dynamic 边界和可选 provider-neutral hint；Provider Adapter 映射厂商机制。静态 digest 建议由 Model route、System Template、Agent revision、已物化 Skill revision 和锁定 Tool Schema digest 组成，不包含 Task ID 或动态数据。不把厂商 TTL 字段冻结为公共 Contract。

### 3.11 TaskStatus 不扩张

不向 TaskStatus 增加 `context_compressing`、`knowledge_querying` 或 `awaiting_model`。这些是 Application 层 Turn/Context 阶段；只有用户输入、用户确认或真实外部依赖才进入 Task waiting。

### 3.12 KAF-5 Memory 范围

KAF-5 只实现 Session 内消息、最近历史、Compaction Summary、必要 Task/来源引用。跨 Session 用户画像、自动偏好提取、Agent 自主写 Memory、全量向量化、自动学习或修改 Skill 全部后置，并需要独立 ADR 处理命名空间、来源、有效期、冲突、删除和敏感信息。

### 3.13 Skill Context 与 Skill Runtime 边界

KAF-5.2 只接受已物化、已选择、已授权、版本化且有界的 `SelectedSkillContext`。它是 Core 内部不可变类型和测试 Fixture，不属于 `packages/contracts`，也不是跨进程、持久化或外部输入 Contract。它只用于验证包含、排除、revision/digest、Snapshot 归属和预算；不得触发文件系统读取。

KAF-5 不实现 `.claude/skills`、`.robothree/skills` 的真实扫描、冲突、路径安全或文件读取。真实 Skill Runtime 在 KAF-5 PASS 后、Desktop Chat 完整验收前单独规划并定义自己的信任和 Contract 边界。

## 4. 依赖边界候选

```text
Contracts
  Conversation / Context references / Compaction / Model protocol
        ↑
Kernel
  继续只负责纯 Task 状态转换
        ↑
Application
  TurnSnapshotBuilder / BudgetPlanner / ContextAssembler
  ModelMessageConverter / CompactionCoordinator / AgentLoopCoordinator
        ↑
Typed Ports
  ConversationPersistence / TokenEstimator / ModelProvider
        ↑
Adapters
  InMemory / SQLite / Fake Tokenizer / Fake Model
```

拒绝万能 `ContextProvider.getAnything()`。Skill、Knowledge 和 Workspace 保持独立类型化边界；KAF-5 不实现真实 Skill Reader。

## 5. 被拒绝或后置的方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 持久消息与 API-time 注入分离 | `ADOPT` | 避免临时数据污染事实历史 |
| Static/Dynamic 分层 | `ADOPT` | 支持注意力边界和缓存稳定性 |
| Pi 两阶段 Pipeline/Compaction Entry | `ADAPT` | 迁移到 SQLite/Event，并增加前置和 mid-turn guard |
| 复用 Task Receipt/Checkpoint 表示 Compaction | `REJECT` | Compaction 是 Session 派生状态，不改变 Task |
| 复用 Tool EffectAttempt 表示 Compaction | `REJECT` | 不应混淆摘要生成与真实外部副作用 |
| KAF-5.0 重写全部旧 schemaVersion | `REJECT` | 采用新增领域独立版本的方案 B |
| KAF-5.2 实现真实 Skill Reader | `DEFER` | 避免把文件发现、安全和冲突拖入 Context Pipeline |
| KAF-5 建完整长期 Memory | `DEFER` | 需要独立产品、安全和数据治理决策 |

## 6. 验收门槛候选

1. Session Message 和 TaskRunState 明确分离；
2. KAF-4 冻结的 `v1alpha2` 数据及既有 `v1alpha1 → v1alpha2` 读取/升级路径不因新领域重写；
3. 未知领域版本失败关闭；
4. messageSequence、sessionEventSequence、contextRevision 独立；
5. Compaction 不修改 Task revision 或 Task Checkpoint；
6. 双事务不跨 Model 调用持有数据库事务；
7. 两笔事务的验证都在 `BEGIN IMMEDIATE` 内完成；
8. `one-pending-job-per-session` 由数据库唯一约束保证；
9. 第二事务以 `activeCompactionId + contextRevision` compare-and-set 提交，影响行数不为 1 时不得提交 Record 或覆盖当前视图；
10. pending Job 可恢复，提交后响应前可通过 Receipt 回放；
11. 新消息追加不使合法的前缀摘要失效；
12. 并发/stale Compaction 不能覆盖新视图；
13. 原始 ConversationMessage 不删除、不覆盖，Summary 不作为 Task/执行结果事实源；
14. 相同 Turn Snapshot 产生相同 Segment 顺序和 digest；
15. 未选择、未授权、版本不兼容或不属于当前 Snapshot 的 Skill、Tool、Knowledge 和 Workspace 内容不进入 Context；
16. Tool/Knowledge/Workspace 结果加入后重新执行预算、组装和测量/缩减；
17. 超预算在每次 Model 调用前被发现；
18. Tool Schema 只来自锁定集合；
19. `SelectedSkillContext` 保持 Core 内部类型和 Fixture，不从公共 Contract 导出；
20. Kernel 不依赖 ContextAssembler、ModelProvider 或 ConversationPersistence；
21. Fake Model → Tool → Observation → 下一轮 Model 的上下文顺序正确；
22. KAF-0～KAF-4 全量回归通过。

## 7. 接受记录

1. KAF-4.3 已完成独立 QA `PASS`，38 个测试文件、304 项测试、边界和 Core smoke 全部通过，KAF-4 关闭；
2. Claude Code 第二轮只读文档评审结论为 `PASS`，P0/P1/P2/P3 均为 0，原 5 个 P2 和 4 个 P3 全部关闭；
3. 用户于 2026-07-23 明确批准本 ADR；
4. 本 ADR 已从 `PROPOSED` 转为 `ACCEPTED`，KAF-5 开发计划同步从 `DRAFT` 转为 `CONFIRMED`；
5. `0.0.0-kaf.5.0` 入口已经打开，但仍须按 5.0a Contract Checkpoint → 5.0b Persistence Spine 的顺序实施和独立 QA，不得跳批。
