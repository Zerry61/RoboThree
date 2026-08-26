# L3 Deep-Dive #2 — Interrupt + Resume Contract

> 研究日期：2026-07-18
> Commit: `49ae27c2ae983cfb92091b0dea9f7bc37a716479`
> 机制选择理由：Human-in-the-loop 是 LangGraph 相对其他 Agent 框架最差异化的能力。`Command(resume)` 是恢复入口，需要理解它如何被合并到 `_first()`，以及多个 interrupt 如何区分。

## 1. 三个层级的 Interrupt

LangGraph 的 Interrupt 机制分三个层级：

```
┌─────────────────────────────────────────────────────┐
│  Level 1 — 静态中断：interrupt_before/after 配置       │
│  Level 2 — 节点动态中断：interrupt(value) 函数         │
│  Level 3 — 多 Interrupt 区分：Interrupt.id 机制        │
└─────────────────────────────────────────────────────┘
```

### 1.1 Level 1 — `interrupt_before` / `interrupt_after`

通过 graph 编译时的 `interrupt_before` 和 `interrupt_after` 参数配置（`state.py:1164-1217`）：

```python
graph = StateGraph(State)
graph.add_node("approve", approve_fn)
graph.compile(
    interrupt_before=["approve"],  # 在 approve 节点前中断
    interrupt_after=[]            # 不在节点后中断
)
```

**中断检查位置**：`_loop.py:666-671` tick 阶段：
```python
if self.interrupt_before and should_interrupt(
    self.checkpoint, self.interrupt_before, self.tasks.values()
):
    self.status = "interrupt_before"
    raise GraphInterrupt()
```

和 `_loop.py:720-724` after_tick 阶段：
```python
if self.interrupt_after and should_interrupt(
    self.checkpoint, self.interrupt_after, self.tasks.values()
):
    self.status = "interrupt_after"
    raise GraphInterrupt()
```

`should_interrupt` 函数（`_algo.py:155-185`）的判定逻辑：
```python
def should_interrupt(checkpoint, interrupt_nodes, tasks):
    # 1. 计算 null_version (类型对齐)
    version_type = type(next(iter(checkpoint["channel_versions"].values()), None))
    null_version = version_type()
    # 2. seen 用于 "since last interrupt"
    seen = checkpoint["versions_seen"].get(INTERRUPT, {})
    # 3. 仅在 "上次中断后有任何更新" 时检查
    any_updates_since_prev_interrupt = any(
        version > seen.get(chan, null_version)
        for chan, version in checkpoint["channel_versions"].items()
    )
    # 4. 检查是否命中 interrupt 节点列表
    if any_updates_since_prev_interrupt:
        return [task for task in tasks if task.name in interrupt_nodes]
    else:
        return []
```

**关键洞察**：`should_interrupt` 只在"上次中断后有 channel 更新"时触发。这意味着如果已经中断过一次，且没有新输入，直接 `invoke(None, config)` 不会再次触发中断——这是 idempotent 设计。

### 1.2 Level 2 — 节点内 `interrupt(value)`

节点内部调用 `interrupt(value)` 抛出 `GraphInterrupt`。源码（`types.py:811`）：

```python
def interrupt(value: Any) -> Any:
    """Interrupt the graph with a resumable exception from within a node."""
    raise GraphInterrupt([Interrupt(value=value)])
```

**机制**：
1. 节点调用 `interrupt("请审批")` → 抛出 `GraphInterrupt([Interrupt(value="请审批")])`
2. `_suppress_interrupt`（`_loop.py:1317-1375`）捕获并保存：
   - 提取 `interrupt.args[0]` 作为待处理 interrupt 列表
   - 推送 `GraphInterruptEvent` 到 lifecycle
   - 发出 `updates`/`values` 流事件
3. 节点被存储在 checkpoint 中（`INTERRUPT` 写入到 pending_writes）
4. 下次 `invoke` 时检查并恢复

### 1.3 Level 3 — 多 Interrupt 区分机制

当一个节点有多个 `interrupt()` 调用，或者多个节点同时中断时，如何区分？

**Interrupt ID 机制**（`types.py:530-578`）：

```python
@final
@dataclass(init=False, slots=True)
class Interrupt:
    value: Any
    id: str  # 用于定位具体的 interrupt

    def __init__(self, value, id=_DEFAULT_INTERRUPT_ID, **deprecated_kwargs):
        self.value = value
        if ... deprecated kwargs:  # 旧 ns 兼容
            self.id = xxh3_128_hexdigest("|".join(ns).encode())
        else:
            self.id = id

    @classmethod
    def from_ns(cls, value, ns):
        return cls(value=value, id=xxh3_128_hexdigest(ns.encode()))
```

**关键**：`interrupt_id` 是 `ns`（节点 namespace）的 xxh3_128 哈希。这天然处理了子图嵌套：

```python
# 主图节点 A 触发 interrupt → id = hash("main")
# 子图节点 A 触发 interrupt → id = hash("main:subgraph_0:A")
# 自动区分同一节点名在不同 namespace 下的 interrupt
```

## 2. Resume 流程（Command → pending_write → 节点）

### 2.1 Command 注入点：`_first()` 的 Resume 处理（`_loop.py:902-931`）

用户调用：
```python
graph.invoke(Command(resume={"approval": True}), config)
```

`_first()` 中的处理流程：

```python
# H1 — 检测 Command
input_is_command = isinstance(self.input, Command)

# H2 — 获取 resume 值
if (resume := cast(Command, self.input).resume) is not None:
    if not self.checkpointer:
        raise RuntimeError("Cannot use Command(resume=...) without checkpointer")

    # H3 — 检查 resume 是 map 还是 single value
    if resume_is_map := (
        isinstance(resume, dict)
        and all(is_xxh3_128_hexdigest(k) for k in resume)
    ):
        self.config[CONF][CONFIG_KEY_RESUME_MAP] = resume
    else:
        # H4 — 如果有多个 pending interrupt，必须指定 interrupt_id
        if len(self._pending_interrupts()) > 1:
            raise RuntimeError(
                "When there are multiple pending interrupts, you must specify the interrupt id when resuming."
            )

# H5 — map_command 将 Command 转为 (task_id, channel, value) 写入
writes: defaultdict[str, list[tuple[str, Any]]] = defaultdict(list)
for tid, c, v in map_command(cmd=cast(Command, self.input)):
    if not (c == RESUME and resume_is_map):
        writes[tid].append((c, v))

# H6 — 通过 put_writes 写入 checkpoint
for tid, ws in writes.items():
    self.put_writes(tid, ws)
```

`map_command`（`_io.py:56-78`）将 Command 转为 pending writes：
```python
def map_command(cmd: Command) -> Iterator[tuple[str, str, Any]]:
    if cmd.goto:
        for send in cmd.goto:
            if isinstance(send, Send):
                yield (NULL_TASK_ID, TASKS, send)
            else:
                yield (NULL_TASK_ID, f"branch:to:{send}", START)
    if cmd.resume is not None:
        # RESUME 写入 NULL_TASK_ID（全局）或 task-specific
        yield (NULL_TASK_ID, RESUME, cmd.resume)
    if cmd.update:
        for k, v in cmd._update_as_tuples():
            yield (NULL_TASK_ID, k, v)
```

### 2.2 Resume 值如何被节点读取

`_scratchpad`（`_algo.py:1280-1346`）处理：

```python
def _scratchpad(parent_scratchpad, pending_writes, task_id, namespace_hash,
                 resume_map, step, stop):
    # 1. 查找全局 resume value (NULL_TASK_ID + RESUME 通道)
    null_resume_write = ...
    # 2. 查找本 task 的 resume value (task_id + RESUME 通道)
    task_resume_write = ...
    # 3. 查找 resume_map 中 namespace-specific value
    if resume_map and namespace_hash in resume_map:
        task_resume_write.append(resume_map[namespace_hash])
```

`PregelScratchpad` 提供 `get_null_resume(consume)` 让节点读到对应值。

### 2.3 多 Interrupt 区分的关键：namespace hash

当 `resume` 是 dict 且所有 key 都是 xxh3_128 哈希（如 `{"abc123def456...": value, ...}`），视为 resume_map：
```python
resume_is_map = (
    isinstance(resume, dict)
    and all(is_xxh3_128_hexdigest(k) for k in resume)
)
```

每个 key 对应一个 specific interrupt id（某 namespace 的 xxh3_128 hash）。

`_scratchpad` 用 `namespace_hash`（task_checkpoint_ns 的 hash）作为 key 查找。这意味着：

```python
# 主图 approve 节点 → namespace_hash = hash("approve")
# 子图 approve 节点 → namespace_hash = hash("main:subgraph_0:approve")

# 提供：
graph.invoke(Command(resume={
    "hash_main_approve": "approve_main",
    "hash_subgraph_approve": "approve_sub",
}), config)
```

## 3. Idempotency 设计

### 3.1 is_resuming 判断（`_loop.py:861-871`）

```python
configurable = self.config.get(CONF, {})
input_is_command = isinstance(self.input, Command)
is_resuming = bool(self.checkpoint["channel_versions"]) and bool(
    configurable.get(
        CONFIG_KEY_RESUMING,
        self.input is None
        or input_is_command
        or (
            not self.is_nested
            and self.config.get("metadata", {}).get("run_id")
            == self.checkpoint_metadata.get("run_id", MISSING)
        ),
    )
)
```

四条触发恢复路径：
1. `CONFIG_KEY_RESUMING` 配置（子图传播）
2. `input is None` — 同一 thread 重新 invoke 不传 input
3. `input is Command` — 主动通过 Command 注入
4. `run_id` 相同 — 同一 run 重连（如流式订阅重连）

### 3.2 `is_time_traveling` 区分（`_loop.py:878-900`）

```python
is_time_traveling = self.is_replaying and (
    (self.is_nested and CONFIG_KEY_CHECKPOINT_NS in CONFIG_KEY_CHECKPOINT_MAP)
    or not (
        (input_is_command and cast(Command, self.input).resume is not None)
        or configurable.get(CONFIG_KEY_RESUMING, False)
    )
)
```

Time-traveling 与 Resuming 的关键区分：**是否要从 fork 创建新分支**。

- Resume（恢复）：在原分支上继续，从断点继续执行
- Time-travel（时间旅行）：回退到历史 checkpoint，丢弃 RESUME writes，创建 fork 分支

### 3.3 Interrupt 的"写入"语义

中断的 `INTERRUPT` 标记是作为一种 **pending_write** 写入 checkpoint 的：

```python
# _loop.py:415-435 put_writes 处理
if any(isinstance(channel, UntrackedValue) for channel in self.channels.values()):
    writes_to_save = [
        ... for c, v in writes_to_save if not isinstance(self.specs.get(c), UntrackedValue)
    ]
```

INTERRUPT 不是 UntrackedValue，所以会持久化到 checkpoint。下次 invoke 时，pending_writes 包含 `(task_id, "interrupt", [Interrupt(...)])`。

`_pending_interrupts()`（`_loop.py:818-846`）扫描 pending_writes，识别"待恢复"的 interrupt：

```python
def _pending_interrupts(self) -> set[str]:
    pending_interrupts: dict[str, str] = {}
    pending_resumes: set[str] = set()

    for task_id, write_type, value in self.checkpoint_pending_writes:
        if write_type == INTERRUPT:
            pending_interrupts[task_id] = value[0].id
        elif write_type == RESUME:
            pending_resumes.add(task_id)

    resumed_interrupt_ids = {
        pending_interrupts[task_id] for task_id in pending_resumes if task_id in pending_interrupts
    }
    # 只保留未恢复的 interrupt
    return {
        interrupt_id for interrupt_id in pending_interrupts.values()
        if interrupt_id not in resumed_interrupt_ids
    }
```

**核心逻辑**：INTERRUPT 与 RESUME 是按 task_id 配对的。恢复 = 写入 RESUME → 未配对的 INTERRUPT 视为仍待人工介入。

### 3.4 状态机：生命周期

```
[Init] → invoke(input, config)
  ↓
[Running] → tick() → execute → after_tick
  ↓
[Paused(Interrupt)]  ← ┌─ should_interrupt 触发
  │                    └─ node.interrupt() 触发
  │
  ├── checkpoint 已持久化（含 INTERRUPT 写入）
  ├── pending_interrupts 中仍存在
  └── GraphBubbleUp 抑制到调用方
  ↓
用户决策
  ↓
[Resuming] → invoke(Command(resume=...), config)
  │        │
  │        ├─ _first() 写入 RESUME 通道
  │        └─ versions_seen[INTERRUPT] 更新
  ↓
[Running again] → tick() → 跳过已处理的 INTERRUPT → 节点从 RESUME 读回值 → 继续
  ↓
[Completed]
```

## 4. Is_resuming 期间的特殊处理（`_loop.py:946-951`）

恢复时要把 `versions_seen[INTERRUPT]` 推进：

```python
if is_resuming:
    self.checkpoint["versions_seen"].setdefault(INTERRUPT, {})
    for k in self.channels:
        if k in self.checkpoint["channel_versions"]:
            version = self.checkpoint["channel_versions"][k]
            self.checkpoint["versions_seen"][INTERRUPT][k] = version
    # ...
```

**为什么需要**：
- `should_interrupt` 用 `versions_seen[INTERRUPT]` 判断"自上次中断以来是否更新"
- 恢复时推进它，表示"已中断过，这些 channel 已处理过中断判定"
- 下次 `tick()` 中的 `should_interrupt` 检查会发现无新更新，不再触发

## 5. 对 RoboThree 的核心启示

### 5.1 强烈推荐：Interrupt + Resume 的三层设计

```python
# RoboThree 推荐（替代 LangGraph 异常机制）：

@dataclass
class TaskInterrupt:
    interrupt_id: str  # 自动用 namespace hash
    node_name: str
    value: Any         # 给客户端显示的内容
    waiting_for: str   # "approval" | "input" | "edit" | ...

# Task 状态机集成：
class TaskStatus:
    PAUSED = "paused"  # 显式状态，而非异常

class TaskCheckpoint:
    pending_interrupts: list[TaskInterrupt]  # 在 checkpoint 中持久化

# Resume API：
POST /tasks/{task_id}/resume
Body: {
    "resumes": [
        {"interrupt_id": "abc123...", "value": "approved"},
    ]
}
# 服务端把这些注入到对应 node 的输入
```

### 5.2 关键设计决策

1. **不在 LangGraph 的 channel 系统里实现 pause/resume**：
   - LangGraph 的 channel 版本号主要用于调度，不是为了 pause
   - RoboThree 的 pause 应作为 Task 的一等公民状态机
   - PauseContext 单独持久化

2. **Idempotency 是必须的**：
   - 重复 resume 不应该触发副作用
   - "已 resume 过的 interrupt" 应被识别并 no-op
   - RoboThree 建议：用 `interrupt_id + resume_count` 去重

3. **Resume 时不应重复执行已完成节点**：
   - LangGraph 用 `channel_versions` + `versions_seen` 自动去重
   - RoboThree 推荐：用 `node_progress[step][node_name] = last_version`

4. **多 Interrupt 区分**：
   - RoboThree 推荐用稳定 hash（task_path + offset）生成 interrupt_id
   - 提供 `resume_map: dict[id, value]` 形式

### 5.3 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Resume 注入到错误的 node | 决策值错配 | 用 namespace hash + 校验 pending_interrupts |
| 忘记推进 versions_seen | 重复 trigger 中断 | 强制在 resume 路径上推进 |
| Multi-worker race condition | 两个 worker 同时 resume | 分布式锁（DB-level 或 Redis） |
| Resume 接口幂等性 | 用户多次提交只生效一次 | interrupt_id + version 双重校验 |

## 6. 证据强度

- [F] `interrupt()` 函数实现：`types.py:811`（短函数，已读全文）
- [F] `Interrupt` ID 机制：`types.py:530-578`
- [F] `should_interrupt` 算法：`_algo.py:155-185`
- [F] `_first()` resume 处理：`_loop.py:860-931`
- [F] `_pending_interrupts` 配对逻辑：`_loop.py:818-846`
- [F] `_scratchpad` namespace hash 查找：`_algo.py:1280-1346`
- [F] `_suppress_interrupt` 异常处理：`_loop.py:1317-1378`
- [I] 推断：interrupt_before 不与 input 干扰 → 基于代码逻辑推断
- [R] RoboThree 推荐基于实证

## 7. Hop Evidence 表（本深挖的核心跳）

| Hop | From → To | File | Symbol | Lines | Evidence Type | Confidence |
|-----|-----------|------|--------|-------|---------------|------------|
| H1 | invoke → Command 处理 | `pregel/_loop.py` | `_first()` 入口 | 860-871 | SOURCE | HIGH |
| H2 | resume dict → resume_map | `pregel/_loop.py` | `resume_is_map = ...` | 910-913 | SOURCE | HIGH |
| H3 | Command → writes | `pregel/_io.py` | `map_command()` | 56-78 | SOURCE | HIGH |
| H4 | writes → put_writes | `pregel/_loop.py` | `for tid, ws in writes.items(): self.put_writes(...)` | 930-931 | SOURCE | HIGH |
| H5 | tick → should_interrupt | `pregel/_loop.py` | `should_interrupt(...)` in tick | 667-671 | SOURCE | HIGH |
| H6 | `should_interrupt` 计算 | `pregel/_algo.py` | `should_interrupt()` 函数 | 155-185 | SOURCE | HIGH |
| H7 | Interrupt 抛出 | `pregel/types.py` | `def interrupt(value)` | 811 | SOURCE | HIGH |
| H8 | GraphInterrupt 抑制 | `pregel/_loop.py` | `_suppress_interrupt()` | 1317-1375 | SOURCE | HIGH |
| H9 | scratchpad 注入 RESUME | `pregel/_algo.py` | `_scratchpad()` | 1280-1346 | SOURCE | HIGH |
| H10 | versions_seen 推进 | `pregel/_loop.py` | `self.checkpoint["versions_seen"].setdefault(INTERRUPT, {})` | 947-951 | SOURCE | HIGH |
| H11 | pending_interrupts 计算 | `pregel/_loop.py` | `_pending_interrupts()` | 818-846 | SOURCE | HIGH |
| H12 | multi-interrupt 校验 | `pregel/_loop.py` | `if len(self._pending_interrupts()) > 1:` | 916-920 | SOURCE | HIGH |

## 8. 待 RoboThree 决策点

1. **是否引入 Command 模式**：LangGraph 的 `Command(resume=...)` 与 `Command(goto=...)` 是组合的，RoboThree 是否采用？
2. **interrupt_id 生成策略**：
   - 选项 A：纯 namespace hash（推荐）
   - 选项 B：UUID（更通用，但需要外部映射）
3. **Resume API 设计**：一次性 resume_map vs 多次 invoke
4. **子图中断传播**：子图触发中断时主图如何表达？
5. **Drain vs Pause**：当前 Rocket "draining" 是否需要让位给"paused"？建议把 paused 视为一等公民，draining 为兼容模式。
