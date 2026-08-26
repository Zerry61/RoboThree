# LangGraph → RoboThree 适配分析

> 研究日期：2026-07-18
> 结论类型：ADOPT / ADAPT / DEFER / REJECT / NEEDS_MORE_EVIDENCE

## 0. 总览

| 设计模式 | 结论 | MVP 需要 | 风险等级 |
|----------|------|----------|----------|
| Durable State Machine (Superstep) | ADAPT | ✅ 是 | 中 |
| Checkpoint Contract | ADAPT | ✅ 是 | 低 |
| State Reducer (Channel) System | ADOPT | ✅ 是 | 低 |
| Interrupt Contract | ADAPT | ✅ 是 | 低 |
| Resume Contract | ADAPT | ✅ 是 | 低 |
| Event Stream Model | ADOPT | ✅ 是 | 低 |
| Graph Builder API | DEFER | ❌ 否 | 高 |
| Pregel 运行时全部 | DEFER | ❌ 否 | 高 |
| Send API (Parallel) | ADAPT | ⏸ 后期 | 中 |
| Subgraph 嵌套 | ADAPT | ⏸ 后期 | 中 |
| Durability Mode | ADOPT | ⏸ 优化 | 低 |
| Overwrite 语义 | ADOPT | ⏸ 后期 | 低 |

## 1. 逐模式分析

---

### 1.1 Durable State Machine (Superstep 模型) → ADAPT

**LangGraph 做法**：
- 使用 Pregel Superstep 替代 while loop
- 每个 Superstep = Plan(tick) → Execute(runner) → Update(after_tick + checkpoint)
- Step 边界 = Checkpoint 边界

**对 RoboThree 的建议**：
- [R] RoboThree **不应**使用固定 while loop 作为 Agent 主循环
- [R] 应采用 Superstep（Plan → Execute → Persist）模型
- [R] 每个 step 原子执行：决定下一步做什么 → 执行 → 保存状态
- [R] Step 边界同时是 Checkpoint 边界，保证暂停/恢复语义

**理由**：
- while loop 无法天然支持暂停/恢复，需要在循环内插入检查点
- Superstep 模型天然对齐"每个 step 后都可以安全中断"的语义
- 调度逻辑（prepare_next_tasks）与执行逻辑（runner）分离，更清晰

**适用边界**：
- 适用于 Tool Calling Agent（需要多轮推理）
- 适用于 Multi-Step Workflow（多个节点顺序执行）
- 不适用于 Real-Time Streaming Agent（需要 sub-step 粒度）

**风险**：
- Superstep 粒度如果太粗，中断点之间延迟大
- 需要设计合理的"一步"语义

---

### 1.2 Checkpoint Contract → ADAPT

**LangGraph 做法**：
```python
Checkpoint = {
    channel_values: dict[str, Any],    # 状态快照
    channel_versions: dict[str, V],    # 版本跟踪
    versions_seen: dict[str, dict],    # 节点已见版本
}
```

**对 RoboThree 的建议**：
- [R] RoboThree 的状态持久化应包含三个概念：**value snapshot**（当前值）、**versioning**（变更检测）、**seen markers**（进度跟踪）
- [R] 不需要照搬 `channel_versions`/`versions_seen`，但需要等价机制
- [R] 推荐设计：
  ```python
  # RoboThree 版 Checkpoint Contract
  TaskCheckpoint:
      task_id: str
      state: dict[str, Any]          # 当前 task state
      step: int                      # 当前步数
      node_progress: dict[str, int]  # 每个 node 已执行到的版本号
      pending_actions: list[Action]  # 待执行的 actions
  ```

**理由**：
- LangGraph 的版本机制太细粒度（per-channel），RoboThree 首次实现可以简化为 per-node 粒度
- `versions_seen` 的核心思想是"去重执行"——这对长时间 Agent 至关重要

**适用边界**：
- Task 级别的 checkpoint（对应 LangGraph 的 thread 级别）
- 不适用于细粒度 sub-task checkpoint（可后期扩展）

**风险**：
- 版本号生成需要单调递增（LangGraph 用 `get_next_version` 回调）
- Checkpoint 序列化需要兼容（msgpack/json）

---

### 1.3 State Reducer (Channel) System → ADOPT

**LangGraph 做法**：
- `BaseChannel[Value, Update, Checkpoint]` 抽象
- 多态 channel 类型：LastValue / BinOp / Topic / Ephemeral
- 用户通过 `Annotated[type, reducer]` 声明合并策略

**对 RoboThree 的建议**：
- [R] **直接采用** Reducer 模式作为 RoboThree 的状态合并策略
- [R] 核心 Reducer 类型：
  - `replace` (对应 LastValue) — 默认，新值覆盖旧值
  - `append` (对应 operator.add) — 累积列表
  - `merge` — 深度合并 dict
  - `overwrite` — 同一步内完全替换（用于工具结果覆盖）
- [R] 在 Task State Schema 中声明每个字段的 reducer：
  ```python
  class TaskState:
      messages: Annotated[list[Message], append]
      current_plan: str                     # replace (default)
      tool_results: Annotated[dict, merge]
      pending_sends: Annotated[list[Send], append]
  ```

**理由**：
- 这是 LangGraph 最精妙且最独立的设计，不依赖 Pregel 其他部分
- Reducer 机制在并行分支合并、人工注入、工具结果写入等场景都至关重要
- 实现复杂度低，价值高

**适用边界**：
- 适用于所有 Task State 字段
- 不适用于 Session State（session 级状态通常不需要并行合并）

**风险**：
- Reducer 函数需要是纯函数（幂等性对重放很重要）
- 需要处理"同一字段多源写入"的约束（LangGraph 用 Overwrite 解决）

---

### 1.4 Interrupt Contract → ADAPT

**LangGraph 做法**：
```python
# 中断触发
raise GraphInterrupt()  # 或 interrupt_before/after 配置

# 中断状态保存
_suppress_interrupt() → checkpoint 持久化 → 不崩溃

# 恢复
graph.invoke(Command(resume={"approval": True}), config)
```

**对 RoboThree 的建议**：
- [R] RoboThree 的中断机制不应使用 Exception（LangGraph 是 Python 特有的）
- [R] 应采用**显式中断状态**：
  ```python
  # Task 进入 Paused 状态，而非抛异常
  task.status = TaskStatus.PAUSED
  task.pause_reason = PauseReason.NEEDS_HUMAN_APPROVAL
  task.pause_context = {"node": "approve", "question": "..."}
  save_checkpoint(task)
  return TaskResult(paused=True, ...)
  ```
- [R] 中断点配置支持：`interrupt_before` / `interrupt_after` 语义保留

**理由**：
- 异常机制耦合语言运行时，不适合多语言/多进程环境
- 显式状态更适合通过 API 查询中断任务
- 保持 `interrupt_before/after` 的声明式语义

**适用边界**：
- 适用于所有需要外部决策的场景（审批、确认、多步推理）
- 建议作为 Task 生命周期的一个标准状态

**风险**：
- 中断状态的序列化需要完整保存上下文
- 中断恢复的幂等性需要仔细设计

---

### 1.5 Resume Contract → ADAPT

**LangGraph 做法**：
```python
is_resuming = prior_checkpoint_exists and (
    input is None or input is Command or same run_id
)
# 恢复：跳过已完成的节点，重新执行中断的节点
```

**对 RoboThree 的建议**：
- [R] Resume 机制化为显式 API：
  ```python
  # 查询可恢复的任务
  GET /tasks?status=paused
  
  # 恢复任务，提供决策值
  POST /tasks/{task_id}/resume
  Body: {"resume_values": {"approval": true, "edit": "..."}}
  
  # 恢复逻辑
  task = load_from_checkpoint(task_id)
  task.inject_resume_values(resume_values)  # 写入对应 node 的输入
  task.status = TaskStatus.RUNNING
  execute_from_checkpoint(task)
  ```

**理由**：
- LangGraph 的自动恢复判断（`is_resuming`）过于隐式
- 显式 API 更适合分布式环境（多个 worker 都可以恢复任务）

**适用边界**：
- Task 级别的暂停/恢复
- 不适用于 sub-step 级别的恢复（除非实现 sub-task checkpoint）

**风险**：
- 需要保证 resume 接口的幂等性
- 并发恢复同一任务需要分布式锁

---

### 1.6 Event Stream Model → ADOPT

**LangGraph 做法**：
```python
StreamChunk = tuple[namespace, mode, payload]
# modes: values, updates, debug, messages, custom
```

**对 RoboThree 的建议**：
- [R] **直接采用** `(namespace, mode, payload)` 三元组作为事件流基础
- [R] RoboThree 的 Stream Modes：
  - `state` — 每次 step 后的完整 task state
  - `delta` — 每次 step 的状态增量
  - `node` — 节点级别事件（start/end/error）
  - `tool_call` — 工具调用事件（含 approval）
  - `token` — LLM token 级流
  - `log` — 内部日志/调试
- [R] namespace 用于区分 sub-task / sub-agent 事件

**理由**：
- 三元组模型简洁、易于扩展
- 通过 mode 过滤让消费者只关注需要的事件
- namespace 天然支持嵌套（sub-task 事件嵌入主事件流）

**适用边界**：
- 所有需要实时反馈的 Agent 执行
- SSE/WebSocket 传输

**风险**：
- 需要定义清晰的 schema 让消费者解析
- 大数据 payload 需要考虑压缩/分片

---

### 1.7 Graph Builder API → DEFER

**LangGraph 做法**：
```python
graph = StateGraph(State)
graph.add_node("A", node_a)
graph.add_edge("A", "B")
graph.add_conditional_edges("B", router, {"X": "C", "Y": "D"})
app = graph.compile()
```

**对 RoboThree 的建议**：
- [R] **MVP 阶段不需要** Graph Builder DSL
- [R] RoboThree 的首批 Agent 使用固定的执行模式（如 Tool Calling Loop），不需要用户自定义图结构
- [R] 当需要支持可配置 Workflow 时再引入，届时可以参考 LangGraph 的 Builder → Compile 模式

**理由**：
- Graph Builder 是 LangGraph 最复杂、对用户暴露最多的层
- RoboThree 目前需要的是稳定的执行引擎，不是灵活的工作流定义
- 过度设计导致 MVP 交付延迟

**适用边界**：
- 后期支持"可配置 Agent Workflow"时引入
- 可作为高级功能而非核心 API

---

### 1.8 Send API (Parallel Branch) → ADAPT

**LangGraph 做法**：
```python
def router(state):
    return [Send("process", {"item": i}) for i in state["items"]]
# 所有 Send 在同一个 superstep 并发执行
```

**对 RoboThree 的建议**：
- [R] 采用简化的 Fan-out 模型：
  ```python
  # 声明式并行
  task.fan_out(
      items=state.items,
      node="process_item",
      max_concurrency=5
  )
  # 所有结果自动合并（通过 reducer）
  ```
- [R] 并行节点的结果合并使用 Reducer 系统（同 1.3）

**理由**：
- Send API 的 PUSH 任务模型高度依赖 Pregel 的 task_path 系统
- RoboThree 可以用更直接的 fan-out 模式实现等价效果
- 最大并发数限制是生产必需的

**适用边界**：
- 批量处理场景（处理多个文件、评估多个方案）
- 不适用于有顺序依赖的并行

**风险**：
- Reducer 合并需要处理乱序到达
- 需要合理的超时和错误传播策略

---

### 1.9 Durability Mode → ADOPT

**LangGraph 做法**：
```python
# durability="async" — 每个 superstep 后异步写
# durability="exit"  — 只在整个 run 结束时写
```

**对 RoboThree 的建议**：
- [R] **直接采用**两种 durability 模式：
  - `step` — 每个 step 后持久化（安全，生产默认）
  - `exit` — 仅在正常完成或中断时持久化（高性能，内部任务）
- [R] 对用户暴露为 `TaskConfig.durability` 选项

**理由**：
- 双模式设计简单实用，无需重新发明
- "exit" 模式对短任务性能优化显著

**适用边界**：
- `step` 用于生产、长任务、需要可恢复性
- `exit` 用于内部子任务、短任务

---

### 1.10 Overwrite 语义 → ADOPT

**LangGraph 做法**：
```python
# 同一步内多个节点写入同一 BinOp 字段时
# 一个节点可以用 Overwrite 完全替换，其他节点的写入被忽略
{"messages": Overwrite([msg1])}  # 替换全部
{"messages": [msg2]}             # 被忽略（同一步已有 Overwrite）
```

**对 RoboThree 的建议**：
- [R] **直接采用** Overwrite 语义处理工具结果替换场景
- [R] 作为 Reducer 系统（1.3）的一个特化机制

**理由**：
- 解决"工具结果应该完全替换之前的部分输出"这类常见问题
- 实现简单（检查更新值是否带 overwrite 标记）

---

## 2. 综合架构建议

### RoboThree Task Execution Model（基于 LangGraph 模式提取）

```
┌──────────────────────────────────────────────┐
│              Task Runner                      │
│                                              │
│  while not task.is_terminal():               │
│    step = task.plan_next_step()              │  ← Superstep.Plan
│    results = execute_step(step)              │  ← Superstep.Execute
│    task.apply_results(results) # with reducers│  ← Superstep.Update
│    task.save_checkpoint()                    │  ← Checkpoint
│    emit_stream_events(results)               │  ← Event Stream
│                                              │
│  task.save_final_checkpoint()                │
└──────────────────────────────────────────────┘
```

### Task State Schema（推荐）

```python
class TaskState:
    # 消息历史（reducer: append）
    messages: Annotated[list[Message], append]
    # 当前步骤（reducer: replace）
    current_step: int
    # 节点进度（reducer: merge）
    node_progress: Annotated[dict[str, int], merge]
    # 待处理分支（reducer: append）
    pending_actions: Annotated[list[Action], append]
    # 中断上下文（reducer: replace）
    pause_context: PauseContext | None
    # 工具结果（reducer: merge）
    tool_results: Annotated[dict[str, Any], merge]
```

### Checkpoint 存储（推荐）

```python
class TaskCheckpoint:
    task_id: str
    state: TaskState          # 序列化的 TaskState
    step: int                 # 当前步号
    created_at: datetime
    parent_checkpoint_id: str | None
    metadata: dict            # run_id, source 等

# 存储后端
# MVP: SQLite (单机)
# 生产: Postgres (多 worker)
```

## 3. Proposed RoboThree Changes

> 以下变更仅作为提议，未自动落地。

1. **Agent 主循环**：用 Superstep 模型替代 while loop
   - 每个 step 三个原子阶段：Plan → Execute → Update
   - Step 边界也是 Checkpoint 边界
   
2. **状态系统**：引入 Reducer 机制
   - 每个状态字段声明合并策略
   - 支持 replace / append / merge / overwrite

3. **Checkpoint 系统**：建立 TaskCheckpoint 数据结构
   - 包含 state snapshot + step + node_progress
   - 支持 SQLite/Postgres 后端

4. **中断恢复**：将 Paused 作为 Task 生命周期状态
   - 中断时保存 checkpoint 而非抛异常
   - 通过显式 API 注入恢复值

5. **事件流**：采用 (namespace, mode, payload) 三元组
   - 支持 state / delta / node / tool_call / token / log 模式

## 4. Requires Human Approval

> 以下需要用户拍板才能推进 RoboThree 正式架构决策。默认状态：`PENDING_HUMAN_DECISION`。

1. **Agent Loop 设计** — 确认 Superstep 模型 vs 传统 while loop？
2. **Checkpoint 粒度** — 确认 Step 级别 checkpoint，还是需要更细粒度的 Sub-step checkpoint？
3. **Reducer 声明方式** — Python 用 `Annotated` 还是显式注册表？
4. **Graph Builder 优先级** — MVP 是否需要可配置工作流？建议 DEFER
5. **Durability 默认值** — 默认 `step`（安全）还是允许用户选择？
