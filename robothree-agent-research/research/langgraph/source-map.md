# LangGraph — 源码地图

> Commit: `49ae27c2ae983cfb92091b0dea9f7bc37a716479`

## 1. 核心运行时文件索引

### 1.1 Pregel 引擎（最核心）

```
libs/langgraph/langgraph/pregel/
├── _loop.py          # PregelLoop — 核心运行时循环（tick/after_tick/checkpoint）
├── _runner.py        # PregelRunner — 节点异步执行器（Future 管理）
├── _algo.py          # 图算法 — prepare_next_tasks / apply_writes / should_interrupt
├── _checkpoint.py    # checkpoint 创建/恢复/复制工具函数
├── _read.py          # ChannelRead — 状态读取器
├── _write.py         # ChannelWrite — 状态写入器
├── _io.py            # I/O 映射（map_input / map_output / map_command）
├── _executor.py      # BackgroundExecutor — 线程/协程池
├── _config.py        # 运行时配置处理
├── _retry.py         # 重试逻辑
├── _validate.py      # 图验证
├── _utils.py         # 工具函数
├── _log.py           # 日志
├── main.py           # Pregel 基类 — CompiledStateGraph 的 invoke/stream/astream
├── protocol.py       # PregelProtocol / StreamProtocol
├── remote.py         # 远程图执行
└── types.py          # 类型重导出 → langgraph.types
```

### 1.2 Channels（State Reducer 系统）

```
libs/langgraph/langgraph/channels/
├── base.py            # BaseChannel[Value, Update, Checkpoint] 抽象
├── last_value.py      # LastValue — 覆盖式（默认行为）
├── binop.py           # BinaryOperatorAggregate — 自定义 Reducer（operator.add 等）
├── topic.py           # Topic — PubSub 累积通道（Send API 的 TASKS）
├── delta.py           # DeltaChannel — 增量通道（稀疏快照）
├── any_value.py       # AnyValue — 任意值通道
├── ephemeral_value.py # EphemeralValue — 瞬态通道（不持久化到 checkpoint）
├── named_barrier_value.py # NamedBarrierValue — 多入一边屏障
├── untracked_value.py # UntrackedValue — 不跟踪版本
└── __init__.py
```

### 1.3 Checkpoint 基础库

```
libs/checkpoint/langgraph/checkpoint/
├── base/
│   ├── __init__.py    # Checkpoint TypedDict + BaseCheckpointSaver 抽象
│   └── id.py          # uuid6 生成
├── memory/
│   └── __init__.py    # InMemorySaver
├── serde/
│   ├── base.py        # SerializerProtocol
│   ├── jsonplus.py    # JsonPlusSerializer
│   ├── _msgpack.py    # msgpack 序列化
│   ├── encrypted.py   # 加密序列化
│   └── types.py       # ChannelProtocol / ERROR/INTERRUPT/RESUME 哨兵
├── cache/
│   ├── base/
│   │   └── __init__.py # BaseCache
│   └── memory/
│       └── __init__.py # InMemoryCache
└── store/
    ├── base/
    │   └── __init__.py # BaseStore (长期记忆)
    └── memory/
        └── __init__.py # InMemoryStore
```

### 1.4 Graph Builder

```
libs/langgraph/langgraph/graph/
├── state.py    # StateGraph + CompiledStateGraph
├── _node.py    # StateNode / StateNodeSpec
├── _branch.py  # BranchSpec
├── message.py  # MessageGraph (messages 特化)
└── ui.py       # 可视化（Mermaid 生成）
```

### 1.5 Streaming

```
libs/langgraph/langgraph/stream/
├── _types.py          # 流类型定义
├── run_stream.py      # 运行流
├── stream_channel.py  # 流通道
├── _convert.py        # 流转换
├── _mux.py            # 多路复用
└── transformers.py    # StreamTransformer
```

### 1.6 Managed Values（托管值）

```
libs/langgraph/langgraph/managed/
├── base.py         # ManagedValueSpec / ManagedValueMapping
└── is_last_step.py # IsLastStepManager
```

### 1.7 Func API（函数式 API）

```
libs/langgraph/langgraph/func/
└── __init__.py    # entrypoint / task / interrupt
```

## 2. 存储后端

```
libs/checkpoint-sqlite/langgraph/checkpoint/sqlite/
├── __init__.py    # SqliteSaver
├── aio.py         # AsyncSqliteSaver
└── utils.py

libs/checkpoint-postgres/langgraph/checkpoint/postgres/
├── __init__.py    # PostgresSaver
├── aio.py         # AsyncPostgresSaver
└── base.py        # BasePostgresSaver
```

## 3. 关键类型定义

### 3.1 Checkpoint 数据结构

`libs/checkpoint/langgraph/checkpoint/base/__init__.py:92`:
```python
class Checkpoint(TypedDict):
    v: int                           # 格式版本
    id: str                          # 唯一单调递增 ID
    ts: str                          # ISO 8601 时间戳
    channel_values: dict[str, Any]   # 通道快照值
    channel_versions: ChannelVersions# 通道版本
    versions_seen: dict[str, ChannelVersions]  # 各节点已见版本
    updated_channels: list[str] | None  # 本 checkpoint 更新的通道
```

### 3.2 PregelExecutableTask

`libs/langgraph/langgraph/types.py`:
```python
class PregelExecutableTask(NamedTuple):
    id: str
    name: str
    path: tuple
    input: Any
    config: RunnableConfig
    writes: list[tuple[str, Any]]
    triggers: list[str]
    call: Call | None
    cache_key: CacheKey | None
```

### 3.3 BaseChannel

`libs/langgraph/langgraph/channels/base.py:19`:
```python
class BaseChannel(Generic[Value, Update, Checkpoint], ABC):
    def get(self) -> Value: ...
    def update(self, values: Sequence[Update]) -> bool: ...
    def checkpoint(self) -> Checkpoint: ...
    def from_checkpoint(self, checkpoint: Checkpoint) -> Self: ...
    def consume(self) -> bool: ...
    def finish(self) -> bool: ...
```

## 4. 真实入口点

| 入口 | 文件:Symbol | 调用方式 |
|------|-------------|----------|
| `graph.invoke(input)` | `pregel/main.py:Pregel.invoke()` | 同步执行 |
| `graph.ainvoke(input)` | `pregel/main.py:Pregel.ainvoke()` | 异步执行 |
| `graph.stream(input)` | `pregel/main.py:Pregel.stream()` | 流式执行 |
| `graph.astream(input)` | `pregel/main.py:Pregel.astream()` | 异步流式执行 |

所有入口最终都创建 `SyncPregelLoop` / `AsyncPregelLoop` 并进入 `tick()` + `after_tick()` 的 superstep 循环。
