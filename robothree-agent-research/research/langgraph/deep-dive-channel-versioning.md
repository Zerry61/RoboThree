# L3 Deep-Dive #3 — Channel Versioning-Driven Scheduling

> 研究日期：2026-07-18
> Commit: `49ae27c2ae983cfb92091b0dea9f7bc37a716479`
> 机制选择理由：这是 Pregel Superstep 模型最精妙的设计——节点不被"重执行"，而是因为 channel 版本变化而触发。这是 LangGraph 实现"去重执行"和"长时间运行安全"的核心。

## 1. 为什么需要 Channel Versioning

### 1.1 问题：节点重复执行风险

考虑一个简单链式图：
```python
A → B → C
```

如果 A 写入 channel `x`，B 读取 `x` 写入 `y`，C 读取 `y` 写入 `z`。

朴素的 while loop 实现：

```python
while not_done:
    A()  # 总是执行
    B()  # 总是执行
    C()  # 总是执行
```

问题：
- A 完成后，下一次循环还是从 A 开始，即使 x 没变 → **重执行**
- 调试、幂等性、副本问题难处理
- 没有"事件驱动"语义

### 1.2 Pregel 的解法：每个节点订阅其触发的 channel

LangGraph 用 channel versioning 实现：
1. 每个节点声明它订阅的 channel（`triggers`）
2. 每个 channel 有一个**全局版本号**（每次 update +1）
3. 每个节点有 `versions_seen[node_name][channel_name]` = 该节点上次看到的版本
4. 调度算法只在 `current_version > seen_version` 时触发节点

这就是**事件驱动的图计算**。

## 2. 三大组件

### 2.1 channel_versions（全局版本表）

源码位置：`checkpoint.base.ChannelVersions = dict[str, str | int | float]`

数据结构：
```python
checkpoint["channel_versions"] = {
    "x": 5,   # channel "x" 当前版本是 5
    "y": 3,   # channel "y" 当前版本是 3
}
```

版本号生成：默认 `increment`（`_algo.py:227-229`）：
```python
def increment(current: int | None, channel: None) -> int:
    return current + 1 if current is not None else 1
```

自定义版本（如 SqliteSaver / PostgresSaver）通过 `BaseCheckpointSaver.get_next_version`。

### 2.2 versions_seen（节点级进度表）

```python
checkpoint["versions_seen"] = {
    "B": {"x": 4},  # B 节点上次看到 channel "x" 的版本是 4
    "C": {"y": 2},
    INTERRUPT: {"x": 5, "y": 3},  # 全局中断进度
}
```

**三种 seen 表**：
- `versions_seen[node_name]` — 节点级
- `versions_seen[INTERRUPT]` — 全局中断进度（`should_interrupt` 使用）
- `versions_seen[PUSH]` — Send 任务专用（暂未广泛使用）

### 2.3 trigger_to_nodes（反向索引）

构建于 `_loop.py.__init__`：
```python
trigger_to_nodes: Mapping[str, Sequence[str]]
# channel 名称 → 订阅该 channel 的节点列表
```

优化目的：`prepare_next_tasks`（`_algo.py:475-482`）用 `updated_channels` 直接查表，避免遍历全部节点：
```python
if updated_channels and trigger_to_nodes:
    triggered_nodes: set[str] = set()
    for channel in updated_channels:
        if node_ids := trigger_to_nodes.get(channel):
            triggered_nodes.update(node_ids)
    candidate_nodes = sorted(triggered_nodes)
```

## 3. 核心调度算法

### 3.1 `_triggers()` 函数（`_algo.py:1260-1277`）

```python
def _triggers(
    channels: Mapping[str, BaseChannel],
    versions: ChannelVersions,
    seen: ChannelVersions | None,
    null_version: V,
    proc: PregelNode,
) -> bool:
    if seen is None:
        # 首次运行：对任何可用 channel 都触发
        for chan in proc.triggers:
            if channels[chan].is_available():
                return True
    else:
        # 增量：对版本有新变化的 channel 触发
        for chan in proc.triggers:
            if channels[chan].is_available() and versions.get(chan, null_version) > seen.get(chan, null_version):
                return True
    return False
```

**关键设计**：
- `seen is None`（首次）→ 任一 trigger 可用 → 触发
- 否则 → 必须有版本增长
- 没有可用 channel → 不触发（避免空跑）

### 3.2 `apply_writes()` 中的 seen 更新（`_algo.py:261-269`）

```python
# update seen versions
for task in tasks:
    checkpoint["versions_seen"].setdefault(task.name, {}).update(
        {
            chan: checkpoint["channel_versions"][chan]
            for chan in task.triggers
            if chan in checkpoint["channel_versions"]
        }
    )
```

**语义**：执行完一组任务后，把每个任务看到的所有 trigger channel 的当前版本记录到 `seen[task.name]`。这是"消费"语义——**节点看到这些版本后，下次再有相同的版本不会再触发它**。

### 3.3 完整的 step 流程

```text
[Step N 开始]
   1. from_checkpoint() 重建 channels 和 seen 表
   2. apply_writes(Step N-1 的任务) 
        → 更新 channels.values
        → channel_versions 递增
        → versions_seen[step_N-1_task.name][step_N-1_task.triggers] 更新
   3. prepare_next_tasks()
        → 遍历 candidate_nodes
        → 对每个 node 调用 _triggers()
        → 如果 _triggers 返回 True → 生成 task
   4. runner.tick(tasks)
        → 并发执行
        → 更新 task.writes (ChannelWrite 写入)
   5. put_writes() → 持久化
   6. _put_checkpoint() → 快照
   ↓
[Step N+1 开始]
   ...
```

### 3.4 `null_version` 的作用（`_algo.py:1252-1257`）

```python
def checkpoint_null_version(checkpoint: Checkpoint) -> V | None:
    for version in checkpoint["channel_versions"].values():
        return type(version)()  # 创建"空"版本（如 int() = 0）
    return None
```

**为什么需要类型化的 null_version**：
- `versions.get(chan, null_version)` 比较时必须有可比的值
- `int()` = 0，`float()` = 0.0，`str()` = ""
- 类型正确性避免 float vs int 比较错误

## 4. 异常路径下的处理

### 4.1 节点抛异常

`_reapply_writes_to_succeeded_nodes`（`_loop.py:736-749`）跳过错误通道：

```python
def _reapply_writes_to_succeeded_nodes(self, tasks):
    for tid, k, v in self.checkpoint_pending_writes:
        if k in (ERROR, ERROR_SOURCE_NODE, INTERRUPT, RESUME):
            continue  # 跳过控制信号
        if task := tasks.get(tid):
            task.writes.append((k, v))
```

失败的节点重新执行（`task.writes` 为空 → runner 选中），成功的节点 `task.writes` 不空 → runner 跳过。

### 4.2 Error Handler 任务（`_loop.py:751-816`）

`_resume_error_handlers_if_applicable`：
1. 扫描 checkpoint_pending_writes 中的 `ERROR_SOURCE_NODE` 标记
2. 对每个失败的 task，写入 `(ERROR, error)` 让其 `task.writes` 非空 → runner 跳过
3. 创建 handler task（`task.writes` 空）→ runner 选中执行

### 4.3 INTERRUPT 后的 seen 推进（`_loop.py:947-951`）

```python
if is_resuming:
    self.checkpoint["versions_seen"].setdefault(INTERRUPT, {})
    for k in self.channels:
        if k in self.checkpoint["channel_versions"]:
            version = self.checkpoint["channel_versions"][k]
            self.checkpoint["versions_seen"][INTERRUPT][k] = version
```

**为什么需要**：
- `should_interrupt` 用 `seen.get(chan, null_version)` 对比
- 恢复时如果不同步推进，`should_interrupt` 会重复触发

## 5. PUSH 任务（Send）的特殊处理

Send 任务通过 TASKS 通道触发（`channels/topic.py:Topic`），不是通过 channel version。

`prepare_next_tasks`（`_algo.py:441-466`）处理：

```python
tasks_channel = cast(Topic[Send] | None, channels.get(TASKS))
if tasks_channel and tasks_channel.is_available():
    for idx, _ in enumerate(tasks_channel.get()):
        if task := prepare_single_task(
            (PUSH, idx),
            ...,
        ):
            tasks.append(task)
```

**PUSH 与 PULL 的本质区别**：
- PULL：基于 channel version 增量触发（事件驱动）
- PUSH：基于"上游节点刚刚 PUSH 了一个 Send"触发（命令式）

并行分支（Map-Reduce）的语义：
```python
def router(state):
    return [Send("worker", {"item": i}) for i in state["items"]]

# 同一个 superstep 中：
# 1. router 写入 5 个 Send 到 TASKS 通道
# 2. apply_writes 触发
# 3. prepare_next_tasks 从 TASKS 读出 5 个 PUSH 任务
# 4. 5 个 worker 节点并发执行
# 5. 所有 worker 的结果通过各自的 reducer 合并
```

`accept_push`（`_loop.py:550-587`）允许在 `commit` 阶段插入 PUSH：
```python
def accept_push(self, task, write_idx, call=None) -> PregelExecutableTask | None:
    if pushed := cast(..., prepare_single_task(
        (PUSH, task.path, write_idx, task.id, call),
        ...,
        for_execution=True,
    )):
        self.tasks[pushed.id] = pushed
```

## 6. UntrackedValue 与 EphemeralValue

### 6.1 UntrackedValue

不参与 versioning 的 channel（`channels/untracked_value.py`）：
- 写时不递增版本
- 不会触发订阅者

用途：
- 内部的临时状态
- 不应影响调度

证据：`_loop.py:439-453` put_writes 跳过 UntrackedValue 的写入持久化：
```python
if any(isinstance(channel, UntrackedValue) for channel in self.channels.values()):
    writes_to_save = [
        ... for c, v in writes_to_save if not isinstance(self.specs.get(c), UntrackedValue)
    ]
```

### 6.2 EphemeralValue

只在本 superstep 存在（`channels/ephemeral_value.py`）：
- 每次 apply_writes 后清空
- 用于 START 节点的输入

证据：`channels/ephemeral_value.py` 实现。

## 7. 对 RoboThree 的核心启示

### 7.1 强烈推荐：Node Progress Tracking

不要照搬 LangGraph 的 `channel_versions`/`versions_seen` 全套机制。简化为：

```python
# RoboThree 推荐的版本机制
@dataclass
class NodeExecution:
    node_name: str
    last_input_version: int  # 该节点处理的最大输入版本
    last_executed_at: datetime

@dataclass
class TaskCheckpoint:
    task_id: str
    step: int
    state: TaskState              # 当前 task state
    node_progress: dict[str, NodeExecution]  # 每个节点的进度
    pending_actions: list[Action]

# 调度决策
def should_trigger_node(node: NodeSpec, progress: NodeExecution, current_state: TaskState) -> bool:
    if progress is None:  # 首次运行
        return any(input_key in current_state and current_state[input_key] is not None
                   for input_key in node.input_keys)
    
    # 增量触发：只比对当前 state 版本
    return current_state.version > progress.last_input_version
```

### 7.2 核心价值：去重执行保证

```python
# 场景：Tool Calling Agent Loop
# Tool A 失败后 retry 时，由于 state 没变，verification_node 不应重复执行
# LangGraph 方式：verification_node.versions_seen[tool_result] 没有增长 → 不触发
# RoboThree 方式：node_progress[verification_node].last_input_version == current_state.version → 不触发
```

**好处**：
- Crash recovery 时不会重复执行昂贵的节点
- Time travel 回退到历史后只重放必要的步骤
- 调试可以无副作用地"调过"已完成节点

### 7.3 PUSH/PULL 双模式

RoboThree 推荐：

```python
# PULL — 主流：节点订阅 state 字段
class NodeSpec:
    triggers: list[str]  # 该 node 监听的 state 字段列表

def schedule(state, nodes, progress):
    next_nodes = []
    for node in nodes:
        if should_trigger(node, state, progress):
            next_nodes.append(node)
    return next_nodes

# PUSH — 高级：父节点显式 fan-out
@dataclass
class FanOutRequest:
    node_name: str
    items: list[Any]  # 将对每个 item 创建一个任务

# 合并到 TaskState 中
state.pending_fanouts.append(FanOutRequest(...))
```

### 7.4 设计决策清单

1. **版本号生成策略**：
   - 选项 A：单调递增 int（简单）
   - 选项 B：Lamport timestamp（多 worker 友好）
   - 选项 C：Checkpoint id 衍生（避免全局锁）
   - RoboThree MVP 推荐：选项 A

2. **UntrackedValue 必要性**：
   - RoboThree MVP 可以省略（增加复杂度）
   - 引入情景：保存"独立计算结果"时

3. **PUSH 支持时机**：
   - MVP：只支持 PULL（线性 agent flow）
   - 后续：增加 FanOut API 触发 PUSH

4. **Error handler 自动调度**：
   - RoboThree 推荐：把 ErrorHandler 视为另一个 NodeSpec，trigger 是"上一节点 error"
   - 不需要单独的版本机制

### 7.5 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 版本号溢出 | 长时间运行 int 溢出（不可能，2^63 量级） | 改用 Lamport 时钟或 uuid7 |
| 多 Worker 版本冲突 | 同一 channel 并发递增 | 单 writer 策略 + 分布式锁 |
| Seen 表过时 | 重启后 seen 与 channel 不匹配 | 强制重建 seen（langgraph 是隐式做的） |
| PUSH 反压 | TASKS 通道无限增长 | 限制 fan-out 数量 |

## 8. 证据强度

- [F] `_triggers` 函数实现：`_algo.py:1260-1277`
- [F] `apply_writes` 的 seen 更新：`_algo.py:261-269`
- [F] `version_seen` 数据结构：`checkpoint/base/__init__.py:115-120`
- [F] `increment` 默认版本号：`_algo.py:227-229`
- [F] `null_version` 类型生成：`_algo.py:1248-1257`
- [F] `_reapply_writes_to_succeeded_nodes`：`_loop.py:736-749`
- [F] `_resume_error_handlers_if_applicable`：`_loop.py:751-816`
- [F] `should_interrupt` 用 versions_seen：`_algo.py:163`
- [F] `trigger_to_nodes` 反向索引：`_algo.py:475-482`
- [I] UntrackedValue 不被持久化 → 基于 `_loop.py:439-453` 推断
- [R] RoboThree 适配建议基于实证模式提取

## 9. Hop Evidence 表（本深挖的核心跳）

| Hop | From → To | File | Symbol | Lines | Evidence Type | Confidence |
|-----|-----------|------|--------|-------|---------------|------------|
| H1 | checkpoint → channels 重建 | `pregel/_loop.py` | `channels_from_checkpoint()` | 1692-1697 | SOURCE | HIGH |
| H2 | channels → apply_writes | `pregel/_algo.py` | `apply_writes()` | 232-345 | SOURCE | HIGH |
| H2a | seen 更新 | `pregel/_algo.py` | `versions_seen.setdefault(task.name, {}).update(...)` | 263-269 | SOURCE | HIGH |
| H3 | apply_writes → version 递增 | `pregel/_algo.py` | `get_next_version(max(versions), None)` | 275-282 | SOURCE | HIGH |
| H4 | prepare_next_tasks → triggers | `pregel/_algo.py` | `if _triggers(...):` | 606-612 | SOURCE | HIGH |
| H5 | _triggers 比较 | `pregel/_algo.py` | `versions.get(chan, null_version) > seen.get(chan, null_version)` | 1273-1275 | SOURCE | HIGH |
| H6 | runner.tick 并发执行 | `pregel/_runner.py` | `PregelRunner.tick()` | — | SOURCE | HIGH |
| H7 | commit → put_writes | `pregel/_loop.py` | `self.commit(...)` → 写入 writes | 415-508 | SOURCE | HIGH |
| H8 | Error handler 调度 | `pregel/_loop.py` | `_resume_error_handlers_if_applicable()` | 751-816 | SOURCE | HIGH |
| H9 | should_interrupt 用 seen | `pregel/_algo.py` | `seen = checkpoint["versions_seen"].get(INTERRUPT, {})` | 163 | SOURCE | HIGH |
| H10 | Resume 推进 INTERRUPT seen | `pregel/_loop.py` | `self.checkpoint["versions_seen"].setdefault(INTERRUPT, {})` | 947-951 | SOURCE | HIGH |
| H11 | PUSH 任务准备 | `pregel/_algo.py` | `for idx, _ in enumerate(tasks_channel.get())` | 442-465 | SOURCE | HIGH |
| H12 | UntrackedValue 跳过 | `pregel/_loop.py` | `if not isinstance(self.specs.get(c), UntrackedValue):` | 439-453 | SOURCE | HIGH |

## 10. 重要延伸：与 Checkpoint 深挖的连接

Channel versioning 与 Checkpoint 持久化是相互作用的：

1. **`_put_checkpoint` 时 `channel_versions` 进入 snapshot**：Checkpoint 中的 `channel_versions` 是恢复时的起点
2. **`apply_writes` 中递增 `channel_versions`**：每次写入递增但需与 task.name+triggers 同步记录 seen
3. **`_pending_interrupts` 中 seen 是过滤条件**：不仅影响调度，也影响中断恢复逻辑

RoboThree 设计时需要把"版本号机制"与"checkpoint 机制"统一建模，而不是割裂设计。

## 11. 待 RoboThree 决策点

1. **版本生成器选型**：单调 int / Lamport / UUID7 之一？
2. **是否引入 PUSH 模型**：MVP 是否仅 PULL？还是 MVP + FanOut 触发？
3. **Trigger 声明方式**：声明在 NodeSpec 还是从 type hints 推导？
4. **错误处理语义**：失败任务 + ErrorHandler 还是重试？
5. **版本号持久化**：checkpoint 内 vs 外部存储？
