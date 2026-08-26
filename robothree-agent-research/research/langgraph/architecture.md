# LangGraph — 架构总览

> Commit: `49ae27c2ae983cfb92091b0dea9f7bc37a716479`
> 核心运行时：Pregel 引擎（基于 Google Pregel 论文的图计算模型）

## 1. 总体架构模型

LangGraph 的架构由四层组成：

```
┌─────────────────────────────────────────┐
│        StateGraph (Builder API)          │  ← 用户构建层
│   add_node / add_edge / add_conditional  │
├─────────────────────────────────────────┤
│        Pregel (Compiled Graph)           │  ← 编译层
│   invoke() / stream() / astream()       │
├─────────────────────────────────────────┤
│        PregelLoop (Runtime Engine)       │  ← 运行时核心
│   tick() / after_tick() / _first()      │
│   _put_checkpoint() / _suppress_interrupt│
├─────────────────────────────────────────┤
│        Channels + Checkpoint             │  ← 状态持久化层
│   LastValue / BinOp / Topic / Delta      │
│   BaseCheckpointSaver / Serde           │
└─────────────────────────────────────────┘
```

**关键设计**：Builder → Compile → Loop。用户构建 `StateGraph`，编译为 `CompiledStateGraph`（实质是一个特化的 `Pregel`），每次 `invoke()` 创建一个 `PregelLoop` 实例执行。

## 2. Pregel 执行模型（核心创新）

### 2.1 Superstep 模型

LangGraph 不采用传统的 `while loop`。它使用 **Pregel 的 Superstep（超步）模型**：

```
每个 Superstep 包含三个阶段：
1. Plan  — tick(): prepare_next_tasks() 确定本步要执行的节点
2. Execute — Runner: 并发执行所有就绪节点
3. Update — after_tick(): apply_writes() 应用写入 → _put_checkpoint() 持久化
```

证据：
- `pregel/_loop.py:599-681` — `tick()` 方法
- `pregel/_loop.py:683-727` — `after_tick()` 方法
- `pregel/_algo.py` — `prepare_next_tasks()` 函数

### 2.2 执行循环流程

```python
# 伪代码（对应源码结构）
loop = PregelLoop(input, config, checkpointer, ...)
with loop:                           # __enter__: load checkpoint
    # _first(): 处理输入 / 恢复
    while loop.tick():               # Plan phase
        runner.tick(loop.tasks)      # Execute phase (并发)
        loop.after_tick()            # Update phase (checkpoint)
# __exit__: _suppress_interrupt()
```

源码对应：
- `pregel/main.py` — `Pregel.stream()` 中的 while 循环调用 `loop.tick()`
- `_loop.py:599` — `tick()`: 返回 True/False 控制继续
- `_loop.py:683` — `after_tick()`: 写入应用 + checkpoint 保存
- `_loop.py:1710` — `__enter__`: 从 checkpointer 加载状态
- `_loop.py:1712` — `__exit__`: 调用 `_suppress_interrupt()`

### 2.3 Node/Edge/Conditional Edge 抽象

**Node**（`graph/_node.py`）：
- 函数签名：`State → Partial<State>` 或 `State → Command`
- 编译后包装为 `PregelNode`（`_read.py`），包含 triggers（触发通道）、channels（输入通道）、writers（写入器）
- Node 通过 `branch:to:{node_name}` 通道触发

**Edge**（`graph/state.py:915`）：
- `add_edge("A", "B")` → A 的 writer 写入 `branch:to:B` 通道
- `add_edge(["A","B"], "C")` → 创建 `NamedBarrierValue` 通道，等待 A 和 B 都完成

**Conditional Edge**（`graph/state.py:969`）：
- `add_conditional_edges("A", router_fn, path_map)` → 路由函数执行后写入对应 `branch:to:X` 通道
- 支持动态路由到 END（终止）

**关键**：边不是数据流！边是**控制流**——决定下一个要触发的节点。数据通过 State 通道共享。

证据：
- `graph/state.py:1537-1561` — `attach_edge()` 实现
- `graph/state.py:1563-1610` — `attach_branch()` 实现
- `pregel/_read.py:28` — `PregelNode` 类的 triggers/channels/writers 属性

## 3. State Reducer 系统

### 3.1 Channel 抽象

所有 State 字段都是 `BaseChannel[Value, Update, Checkpoint]` 的实例：

```python
class BaseChannel(Generic[Value, Update, Checkpoint], ABC):
    def get(self) -> Value: ...       # 读取当前值
    def update(self, values: Sequence[Update]) -> bool: ...  # 应用更新
    def checkpoint(self) -> Checkpoint: ...  # 序列化
    def from_checkpoint(self, checkpoint: Checkpoint) -> Self: ...  # 反序列化
```

证据：`channels/base.py:19-121`

### 3.2 Channel 类型与 Reducer 行为

| Channel | Reducer 行为 | 场景 |
|---------|-------------|------|
| **LastValue** | 每次覆盖，只接受一个更新 | 默认行为（无 Annotation） |
| **BinaryOperatorAggregate** | `operator(a, b)` 累积 | `Annotated[list, operator.add]` |
| **Topic** | PubSub 累积列表（可配置非累积） | Send API 的 TASKS 通道 |
| **EphemeralValue** | 瞬态，不持久化到 checkpoint | 内部路由信号 |
| **NamedBarrierValue** | 等待指定集合全部到达 | 多对一边的同步屏障 |
| **DeltaChannel** | 增量追加，稀疏快照 | 大消息列表优化 |
| **UntrackedValue** | 不跟踪版本 | 非版本化状态 |

证据：
- `channels/last_value.py:20-79` — LastValue
- `channels/binop.py:65-156` — BinaryOperatorAggregate（支持 Overwrite 语义）
- `channels/topic.py:23-95` — Topic（accumulate 参数控制）
- `channels/ephemeral_value.py` — EphemeralValue
- `channels/named_barrier_value.py` — NamedBarrierValue
- `channels/delta.py` — DeltaChannel

### 3.3 State Schema 声明

```python
from typing_extensions import TypedDict, Annotated
import operator

class State(TypedDict):
    messages: Annotated[list, operator.add]    # → BinaryOperatorAggregate
    score: int                                  # → LastValue (默认)
    tasks: Annotated[list, Topic]              # → Topic (显式 Channel)
```

解析逻辑：
- `graph/state.py:1835-1859` — `_get_channel()` 分发逻辑
- `graph/state.py:1862-1887` — `_is_field_channel()` 检测 `Annotated[type, BaseChannel]`
- `graph/state.py:1890-1908` — `_is_field_binop()` 检测 `Annotated[type, callable]` → BinaryOperatorAggregate
- 无 Annotation → 回退到 `LastValue`

### 3.4 Overwrite 语义（关键设计）

BinOp 通道支持同一步内**覆盖**整个值，而不是累积：

```python
from langgraph.types import Overwrite

# 同一步内：
# write_a: {"messages": Overwrite([msg1])}  # 覆盖全部
# write_b: {"messages": [msg2]}            # 被忽略（因为 a 先覆盖了）
# write_c: {"messages": Overwrite([msg3])} # 报错（只能有一个 Overwrite）
```

源码：`channels/binop.py:31-51` `_get_overwrite()` + `channels/binop.py:130-141` update 逻辑

## 4. Checkpoint 系统

### 4.1 数据结构

```python
class Checkpoint(TypedDict):       # checkpoint/base/__init__.py:92
    v: int                         # 格式版本
    id: str                        # 唯一 + 单调递增 ID (uuid6)
    ts: str                        # ISO 8601 时间戳
    channel_values: dict[str, Any] # 通道值的完整快照
    channel_versions: dict[str, str|int|float]  # 每个通道的版本号
    versions_seen: dict[str, dict[str, ...]]    # 各节点已见版本
    updated_channels: list[str] | None          # 本步更新的通道
```

### 4.2 Checkpoint 触发时机

`_put_checkpoint()` 在每个 superstep 的三个时间点被调用：

| 时间点 | source 值 | 触发 |
|--------|-----------|------|
| 输入处理 | `"input"` | `_first()` → `_put_checkpoint({"source": "input"})` |
| 每次 Superstep 后 | `"loop"` | `after_tick()` → `_put_checkpoint({"source": "loop"})` |
| Time Travel fork | `"fork"` | `_first()` → `_put_checkpoint({"source": "fork"})` |
| 退出时 | 复用 metadata | `_suppress_interrupt()` → `_put_checkpoint(self.checkpoint_metadata)` |

证据：`_loop.py:1081-1219` `_put_checkpoint()`

### 4.3 Checkpoint 存储后端

| 后端 | 文件 | 特性 |
|------|------|------|
| MemorySaver | `checkpoint/memory/__init__.py` | 内存字典，开发调试 |
| SqliteSaver | `checkpoint-sqlite/...` | 单机持久化，WAL 模式 |
| PostgresSaver | `checkpoint-postgres/...` | 生产级，连接池 |

所有后端实现 `BaseCheckpointSaver` 接口：
- `get_tuple(config)` — 获取最新 checkpoint
- `put(config, checkpoint, metadata, new_versions)` — 保存 checkpoint
- `put_writes(config, writes, task_id)` — 保存中间写入
- `get_next_version(current, channel)` — 版本号生成

证据：`checkpoint/base/__init__.py:176` `BaseCheckpointSaver`

## 5. Interrupt / Resume / Human-in-the-Loop

### 5.1 中断机制

**触发方式**：
1. `interrupt_before=["node_name"]` — 在执行指定节点前中断
2. `interrupt_after=["node_name"]` — 在执行指定节点后中断
3. 节点内调用 `interrupt()` 函数 — 手动中断并等待人工输入

**中断流程**：
1. `tick()` 中 `should_interrupt()` 检查是否命中中断节点
2. 命中时设置 `self.status = "interrupt_before"/"interrupt_after"`
3. 抛出 `GraphInterrupt` 异常
4. `_suppress_interrupt()` 捕获异常，保存 checkpoint，抑制异常传播
5. 调用方收到 checkpoint 状态，可以获取中断信息

证据：
- `_loop.py:666-671` — interrupt_before 检查
- `_loop.py:719-724` — interrupt_after 检查
- `_loop.py:1317-1375` — `_suppress_interrupt()`

### 5.2 恢复机制

```python
# 第一次执行——遇到 interrupt
config = {"configurable": {"thread_id": "1"}}
graph.invoke({"input": "..."}, config)  # → GraphInterrupt at "approve" node

# 恢复——通过 Command(resume=...)
graph.invoke(Command(resume={"approval": True}), config)  # 继续执行
```

恢复的关键在 `_first()` 方法：
- `_loop.py:860-871` — 判断 `is_resuming`：input 为 None 或 Command 或相同 run_id
- `_loop.py:903-931` — 处理 `Command(resume=...)`：将 resume 值写入对应任务的 RESUME 通道
- `_loop.py:946-951` — 推进 `versions_seen[INTERRUPT]`，跳过已处理的 interrupt

### 5.3 人工决策作为节点输入

人工决策通过 `Command(resume=value)` 注入：
- `func/__init__.py` — `interrupt()` 函数返回人工提供的值
- resume 值被写入对应 task 的 RESUME 通道（`_loop.py:903-931`）
- 节点恢复执行时从 RESUME 读回人工决策值

## 6. Time Travel

### 6.1 从历史 Checkpoint 重放

```python
# 分支回退到历史 state
graph.update_state(config, values, as_node="some_node")  # → "fork" checkpoint

# 直接指定 checkpoint_id
config = {"configurable": {"thread_id": "1", "checkpoint_id": "abc123"}}
graph.invoke(None, config)  # 从指定 checkpoint 重放
```

关键逻辑在 `__enter__` + `_first()` 中：
- `_loop.py:1633-1637` — `__enter__` 中按 `checkpoint_id` 获取具体 checkpoint
- `_loop.py:878-895` — `is_time_traveling` 判断
- `_loop.py:896-899` — time travel 时清除旧的 RESUME 写入
- `_loop.py:958-971` — time travel 时创建 fork checkpoint（新分支）

### 6.2 State Fork/Branch

Fork checkpoint 的 source 为 `"fork"`，metadata source 也可以为 `"update"`：
- 不影响原分支的 checkpoint 链
- 新分支从 fork 点开始独立演进

## 7. Streaming

### 7.1 事件流系统

流式输出通过 `StreamProtocol` 回调实现：

```python
class StreamProtocol:
    modes: set[StreamMode]
    def __call__(self, value: StreamChunk) -> None: ...
# StreamChunk = tuple[namespace, mode, payload]
```

证据：`pregel/protocol.py`

### 7.2 Stream Modes

| Mode | 内容 | 触发位置 |
|------|------|----------|
| `values` | 每次 superstep 后的完整 State | `after_tick()` → `_emit("values", ...)` |
| `updates` | 每次 superstep 的增量更新 | `output_writes()` → `_emit("updates", ...)` |
| `debug` | 内部调试信息（checkpoints/tasks 重映射） | `_emit()` 内部 debug_remap |
| `messages` | LLM token 级流 | 外部 (LLM 调用层) |
| `custom` | 节点内自定义写入 | `StreamWriter` |

证据：`_loop.py:1380-1414` `_emit()`

## 8. Durable Execution

### 8.1 Durability 模式

`Durability` 类型有两种模式：

| 模式 | 行为 | 场景 |
|------|------|------|
| `"async"` (默认) | 每个 superstep 后异步写 checkpoint+writes | 常规持久化 |
| `"exit"` | 只在执行完成/中断时一次性写 checkpoint+writes | 高性能、减少 I/O |

证据：`types.py` Durability 类型，`_loop.py:320` durability 字段

### 8.2 跨进程恢复

恢复依赖于：
1. `thread_id` 作为恢复键
2. `BaseCheckpointSaver.get_tuple(config)` 检索最新 checkpoint
3. `PregelLoop.__enter__` 从 checkpoint 重建 channels + managed values
4. `_first()` 判断 is_resuming，恢复执行位置

证据：`_loop.py:1629-1710` `__enter__`

## 9. Subgraph

### 9.1 Agent 嵌套

Subgraph 通过 `PregelScratchpad.subgraph_counter()` 自动递增计数器：

```python
# 用法：在节点中调用另一个编译图
def parent_node(state):
    result = child_graph.invoke(state["sub_input"])
    return {"output": result}
```

编译时，`CompiledStateGraph` 被识别为 `PregelProtocol` 子图。

证据：`_loop.py:325-340` scratchpad 计数逻辑
- 每次进入子图：`checkpoint_ns` 追加计数 → `parent:0`, `parent:0:1`

### 9.2 父子 State 传递

- 子图的 `input_keys` 从父 state 中提取
- 子图的 `output_keys` 写回父 state
- Checkpoint 通过 `checkpoint_ns` 隔离命名空间

## 10. Parallel Branch（Send API）

### 10.1 Send API

```python
def continue_to_jokes(state):
    return [Send("tell_joke", {"topic": t}) for t in state["topics"]]
```

每个 `Send` 对象表示一个并行分支任务，写入 TASKS 通道。

证据：`graph/state.py:1735-1761` `_control_branch()`

### 10.2 并行执行与合并

1. `Send` → 写入 TASKS 通道（Topic 类型）
2. `prepare_next_tasks()` 从 TASKS 读取所有 Send 并转换为 PUSH 任务
3. 所有并行分支在同一个 superstep 中并发执行
4. 状态通过各字段的 Reducer 合并（如 `operator.add` 合并 list）

证据：
- `_loop.py:550-587` `accept_push()` — 接受 PUSH 任务
- `_algo.py` prepare_next_tasks 中的 TASKS 处理

## 11. Permission / Security

### 11.1 当前安全边界

LangGraph **不在框架层提供** Sandbox/Permission 系统。安全依赖：
1. Python 进程级隔离（部署层面）
2. LangGraph Platform（商业产品）提供 auth/RBAC
3. 自定义工具实现中的安全检查

### 11.2 评估

- Permission 检查**不在** Pregel runtime 中
- Tool execution 没有统一的 Approval 钩子
- 这与其他 Coding Agent（如 Claude Code、Grok Build）有显著差异
- [F] `pregel/_runner.py` runner 直接执行 Call 对象，无 permission 拦截
- [I] LangGraph 将其定位为"编排框架"而非"安全 Agent 运行时"，有意不内置安全层
- [R] RoboThree 必须在 Tool Runtime 层添加独立的 Permission 检查，不能依赖 LangGraph 模式

## 12. 设计模式提取总结

从 LangGraph 提取的五个核心设计模式（对应 RoboThree 研究目标）：

### 12.1 Durable State Machine
- **模式**：Superstep 替代 while loop，每个 step 原子执行 Plan → Execute → Update
- **契约**：Step 边界 = Checkpoint 边界，不可分割
- **源码**：`_loop.py` tick + after_tick + _put_checkpoint

### 12.2 Checkpoint Contract
- **模式**：`{channel_values, channel_versions, versions_seen}` 三元组
- **契约**：channel_versions 驱动节点调度（节点只在其输入通道版本变更时执行）
- **源码**：`checkpoint/base/__init__.py:92` Checkpoint TypedDict

### 12.3 Interrupt Contract
- **模式**：GraphInterrupt 异常 + checkpoint 保存 → 调用方获取中断状态 → 外部决议 → Command(resume=...) 恢复
- **契约**：中断不丢失进度，恢复从断点继续
- **源码**：`_loop.py` GraphInterrupt + _suppress_interrupt

### 12.4 Resume Contract
- **模式**：`is_resuming = prior_checkpoint_exists AND (input is None OR input is Command OR same run_id)`
- **契约**：恢复时跳过已执行节点（version_seen 比较），只执行未完成的节点
- **源码**：`_loop.py:860-871` is_resuming 逻辑

### 12.5 Event Stream
- **模式**：`(namespace, mode, payload)` 三元组流
- **契约**：values（全量）/ updates（增量）/ debug（内部）/ messages（token）/ custom（自定义）五种模式
- **源码**：`_loop.py:1380` _emit + `pregel/protocol.py` StreamProtocol
