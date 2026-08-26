# ADR-005：Agent 状态与 Task/Run/Step 所有权

> 状态：**ACCEPTED**  
> 提出日期：2026-07-19  
> 接受日期：2026-07-20  
> 一致性修订：2026-07-22，`approval` 等待原因按 ADR-006 进入 `user_confirmation` 演进  
> 适用阶段：KAF-1 Runtime Kernel

## 1. 背景

RoboThree 需要同时支持对话、后台任务、审批、取消、超时、失败重试和后续恢复。若 Agent、Session、Tool、Worker 和 UI 共享并直接修改运行对象，将产生双写、历史覆盖、跨 Run 串扰和不可审计状态。

本 ADR 只冻结 KAF-1 所需的纯内存运行时语义。Event、Checkpoint、Outbox 和副作用一致性由 ADR-007/KAF-2 决定；固定授权与 Desktop 用户确认由 ADR-006/KAF-4 决定。

## 2. 上游证据与采用方式

| 来源 | 固定 Commit | 借鉴 | RoboThree 调整 |
| --- | --- | --- | --- |
| OpenHands Software Agent SDK | `4fe565663af2b4f1130a6e0dac7566b002bfe9b4` | 显式执行状态、Action/Observation、每次 Run 新建取消信号、终态不被后续异常覆盖 | 拆分 Session/Task/Run/Step，不把 Agent、Workspace、Secrets 和运行状态放入 Conversation God Object |
| Grok Build | `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce` | ChatStateActor 通过 mailbox 单点修改状态 | TypeScript 中采用每 Task 串行 Promise mailbox；不照搬 Rust、`RefCell/Mutex` 混合状态或 ACP SessionActor |
| LangGraph | `49ae27c2ae983cfb92091b0dea9f7bc37a716479` | 显式 Command、Step 边界、Interrupt/Resume、Checkpoint 前状态收敛 | KAF-1 只采用纯状态转换和显式 waiting/resume；不引入 Pregel、Graph Builder、Channel Reducer 或持久化实现 |

采用类型均为 `DESIGN_ONLY`。RoboThree 代码按自身 Contract 重写，不复制上游源码。

## 3. 决策

### 3.1 Definition 与运行状态分离

`AgentDefinitionRef` 只锁定 Agent Definition 的 ID 和版本。运行期可变状态只存在于 `TaskRunState`。

运行中不得把 Agent Definition 静默替换为其他版本；需要不同定义时创建新的 Task。

### 3.2 对象关系与所有权

```text
Session（可选交互容器）
└── Task（稳定用户意图）
    └── Run（一次执行尝试）
        └── Step（一次 Action → Observation 边界）
            └── ExecutionPlanRevisionRef
```

- Task 可以绑定一个 Session，也可以作为无 Session 的开放式或后台任务存在；
- Session 归档不自动取消仍在运行的 Task；
- 同一 Task 同一时间最多有一个非终态 Run；
- 同一 Run 同一时间最多有一个非终态 Step；
- Task Runtime 是 Task/Run/Step 的唯一写入者；
- UI、Orchestrator、Tool Runtime 和 Worker 只能提交版本化 Command 或 Observation。

### 3.3 状态枚举

Task 状态：

```text
created → running ↔ waiting
                    ├→ completed
                    ├→ failed
                    ├→ cancelled
                    └→ timed_out
```

Run 状态：

```text
running ↔ waiting
          ├→ succeeded
          ├→ failed
          ├→ cancelled
          └→ timed_out
```

Step 状态：

```text
running ↔ waiting
          ├→ succeeded
          ├→ failed
          ├→ cancelled
          └→ timed_out
```

`completed/succeeded/failed/cancelled/timed_out` 是终态，终态对象不得重新打开或原地覆盖。

### 3.4 Command 与 Transition

KAF-1 冻结以下最小 Command：

- `start_run`；
- `start_step`；
- `wait_step`；
- `resume_step`；
- `record_observation`；
- `complete_run`；
- `fail_run`；
- `cancel_task`；
- `expire_deadline`；
- `retry_run`。

每个 Command 必须包含 `commandId`、`taskId` 和 `issuedAt`。创建 Run/Step 的 Command 必须由调用方提供新 ID，使 reducer 在相同输入下产生相同结果。

合法 Command 生成不可变的新 `TaskRunState` 和 `TaskTransition`；非法转换返回类型化 `RuntimeError`，不部分修改状态。

### 3.5 Action、Observation 与 Step

- Step 以 Action 开始；
- Action 只携带稳定 ID、命名空间类型和 JSON 兼容 payload，不在 KAF-1 固化 Tool/MCP/Model 供应商结构；
- Observation 必须引用同一 Action；
- Observation outcome 为 `succeeded/failed/cancelled/timed_out`；
- 非成功 Observation 必须携带类型化 RuntimeError；
- Step 成功后 Run 仍可开始下一 Step；失败、取消或超时 Observation 使 Step、Run 和 Task 一次性收敛到对应终态。

### 3.6 Retry

Retry 总是创建新的 Run：

- 新 Run 使用新的 `runId` 和递增 `attempt`；
- `retryOfRunId` 指向被重试的终态 Run；
- 旧 Run 及其 Step 永不修改；
- 只允许从 `failed/cancelled/timed_out` Run 重试；
- 已成功 Run 不使用 Retry，重新执行完整成功任务应创建新 Task。

### 3.7 Cancellation

`cancel_task` 对当前活动 Step、Run 和 Task 同步收敛为 `cancelled`。KAF-1 只定义状态语义；KAF-3 的 `ToolExecutionBackend`（由 ADR-008 收窄命名）/Worker 必须把该状态转换为实际 `AbortSignal` 或 Worker cancel 命令。

终态 Task 不接受新的取消命令，返回稳定的非法转换错误。

### 3.8 Deadline

- Task、Run 和 Step 均可声明 Deadline；
- 生效 Deadline 是三层中最早的时间；
- 到期判断使用调用方提交的 `issuedAt`，避免 reducer 读取系统时钟；
- 任意 Command 到达时先检查 Deadline；已到期则不执行原 Command，而是将活动 Step、Run 和 Task 收敛为 `timed_out`；
- 调度器可发送 `expire_deadline` 主动触发到期检查；
- Deadline 与时间相等即视为到期。

### 3.9 单写入者与并发

`InMemoryTaskRuntime` 为每个 Task 维护串行 mailbox：

- 并发提交按 `dispatch()` 到达顺序串行执行；
- reducer 本身保持同步、无 I/O；
- 不在 Kernel 内访问数据库、模型、文件系统或系统时钟；
- 不同 Task 使用独立 Runtime，可并发运行；
- KAF-2 将同样的 Transition 语义映射到事务、Event 与 Checkpoint。

## 4. 关键不变量

1. Task ID 与 Agent Definition Ref 创建后不可变；
2. 一个 Task 最多一个活动 Run；
3. 一个 Run 最多一个活动 Step；
4. Run attempt 严格递增；
5. Step sequence 在 Run 内严格递增；
6. Observation.actionId 必须匹配 Step.action.actionId；
7. 终态 Run/Step 不再变化；
8. 非法 Command 不增加 state revision；
9. 每次成功状态变更 revision 恰好增加 1；
10. 旧 Run 的迟到 Observation 不得影响重试后的新 Run。

## 5. 不采用

- Agent God Object 保存全部可变状态；
- Session、Agent、Tool 或 Worker 直接修改 Task 对象；
- Retry 覆盖或重新打开原 Run；
- Kernel 内部读取 `Date.now()` 或生成随机 ID；
- 用 Exception 表示正常的 waiting/interrupt；
- KAF-1 引入完整 DAG/Pregel Runtime、Event Store 或数据库锁。

## 6. 后果

正面后果：状态转换可确定性测试；并发写入可排序；Retry 和迟到结果不会破坏历史；后续 Event/Checkpoint 可以直接记录 Command 与 Transition。

代价：调用方必须提供 ID 和时间；不同 Task 的跨任务事务暂不支持；实际 Worker 取消、恢复和幂等仍需后续阶段完成。

## 7. KAF-1 验收门槛

- 非法状态转换稳定拒绝且不改变 revision；
- 并发 Command 不产生双写；
- Retry 创建新 Run 且旧 Run 不变；
- Cancel/Deadline 能让活动 Step、Run、Task 一致收敛；
- 迟到 Observation 不影响新 Run；
- reducer 和 Runtime Kernel 不依赖 Adapter、数据库、Electron、Model SDK 或系统时钟。
