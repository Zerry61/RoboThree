# 机制深挖 #2: Event Sourcing 与 ConversationState

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`
> 选择理由：Event Sourcing 是整个系统的状态基础，RoboThree 的可审计/可重放需求需要这种架构
> Confirmed by: source (静态源码分析)

## 1. 核心抽象：Event + EventLog + View

```
EventLog (物理存储：磁盘文件)
    ↓ path_to_root(leaf)
View (逻辑投影：分支的根到叶)
    ↓ events_to_messages
Message[] (LLM 发送格式)
```

## 2. Event 树形结构

### 2.1 Event 基础字段

```python
class Event(DiscriminatedUnionMixin, ABC):
    id: EventID                    # UUID，唯一标识
    timestamp: str                 # ISO 格式时间戳
    source: SourceType             # "agent" | "user" | "environment"
    parent_id: EventID | None      # 父事件 — 形成树
```

证据：[event/base.py:20-49](openhands-sdk/openhands/sdk/event/base.py#L20-L49)

### 2.2 关键约束：`parent_id != ROOT_PARENT_ID`

```python
@field_validator("id")
def _reject_reserved_id(cls, v):
    if v == ROOT_PARENT_ID:
        raise ValueError(f"Event id may not equal reserved sentinel {v!r}")
    return v
```

**设计意图**：`ROOT_PARENT_ID` 是"显式空父"哨兵。如果某事件的 id 等于它，子事件看起来会"无父"，破坏树结构。

### 2.3 父子关系解析：`_effective_parent_id`

```python
def _effective_parent_id(self, idx, event):
    if event.parent_id == ROOT_PARENT_ID:
        return None            # 显式根（feature 创建的根 at idx > 0）
    if event.parent_id is not None:
        return event.parent_id # 显式（新事件）
    if idx == 0:
        return None            # 真正的根
    return self.get_id(idx - 1) # 旧版线性链（向后兼容）
```

证据：[event_store.py:91-104](openhands-sdk/openhands/sdk/conversation/event_store.py#L91-L104)

**核心 insight**：旧版本事件没有 `parent_id` 字段。`_effective_parent_id` 让树形结构在旧事件上**退化为线性链** — 不需要磁盘改写即可升级现有会话。

## 3. EventLog 物理存储

### 3.1 文件结构

```
<persistence_dir>/<conversation_id>/
├── base_state.json        # ConversationState 配置
├── events/                # 每个事件一个文件
│   ├── .eventlog.lock     # 文件锁（写入互斥）
│   ├── <event-uuid>.json  # 单个事件
│   └── ...
├── metrics.json           # Token 用量
└── ...
```

### 3.2 FileStore 抽象

`FileStore` 是底层 IO 抽象，让 EventLog 不直接依赖文件系统：

```python
class FileStore(ABC):
    def write(path, content): ...
    def read(path) -> str: ...
    def list(path) -> list[str]: ...
    def delete(path): ...
    def exists(path) -> bool: ...
```

**实现**：
- `LocalFileStore` — 直接文件系统
- `InMemoryFileStore` — 测试用内存实现
- **可扩展**：`S3FileStore` / `OSSFileStore` 可以无侵入替换

### 3.3 EventLog 性能优化

```python
class EventLog:
    def __init__(self, fs, dir_path):
        self._id_to_idx: dict[EventID, int] = {}      # 内存索引
        self._idx_to_id: dict[int, EventID] = {}
        self._event_cache: dict[int, Event] = {}      # LRU 缓存
        self._length = self._scan_and_build_index()    # 启动时扫描建索引
```

**关键洞察**：EventLog 启动时**扫描目录构建内存索引**，但事件内容是惰性加载（`_event_cache`）。这样支持 30k+ 事件的会话而不耗尽内存。

### 3.4 文件锁

```python
LOCK_FILE_NAME = ".eventlog.lock"
LOCK_TIMEOUT_SECONDS = 30
```

使用 `flock()` 风格的 advisory lock。但**警告**：

> Note: For LocalFileStore, file locking via flock() does NOT work reliably on NFS mounts or network filesystems. Users deploying with shared storage should use alternative coordination mechanisms.

证据：[event_store.py:21-23](openhands-sdk/openhands/sdk/conversation/event_store.py#L21-L23)

## 4. ConversationState.view — 增量缓存视图

### 4.1 为什么需要 view

`Agent.step()` 每次都需要 LLM 消息列表。如果每次都重新计算：
- O(n) 遍历事件
- 转换每条事件为 Message
- 检查一致性

**增量缓存**：维护 `_view_branch_leaf` 记录 view 对应的 leaf，新事件只追加 tail。

```python
@property
def view(self) -> View:
    with self._view_lock:
        leaf = self._resolve_active_leaf()
        if leaf == self._view_branch_leaf:
            return self._view  # 无变化，直接返回
        
        # Fast path: 线性 append → 只 replay tail
        try:
            tail = []
            cur_id = leaf
            while cur_id != self._view_branch_leaf:
                idx = self._events.get_index(cur_id)
                tail.append(self._events[idx])
                cur_id = self._events._effective_parent_id(idx, ...)
            for evt in reversed(tail):
                self._view.append_event(evt)
            self._view_branch_leaf = leaf
            return self._view
        except Exception:
            # 退化为全量重建
            self._view = View.from_events(self._events.path_to_root(leaf))
            self._view_branch_leaf = leaf
            return self._view
```

证据：[state.py:336-381](openhands-sdk/openhands/sdk/conversation/state.py#L336-L381)

**性能特征**：
- **缓存命中**：O(1)
- **线性 append**：O(k) — k 是新增事件数
- **分支切换**：O(n) — 全量重建
- **冷启动**：O(n) — 首次构建

### 4.2 View.from_events 强制属性检查

冷启动和分支切换时，view 重新构建时会执行**属性强制**：
- 合并连续 user 消息
- 校验 message/tool_call 配对
- 移除不可 LLM 化的辅助事件

## 5. Tree Operations

### 5.1 fork() — 复制事件历史到新会话

```python
def fork(self, conversation_id=None, agent=None, from_event_id=None):
    fork_id = conversation_id or uuid.uuid4()
    
    with self._state:
        if from_event_id is not None and from_event_id not in self._state.events:
            raise ValueError(f"Unknown from_event_id: {from_event_id}")
        
        # 分支切片（from_event_id 模式）
        if from_event_id is not None:
            source_events = self._state.events.path_to_root(from_event_id)
            fork_leaf = from_event_id
        else:
            # 全量 fork
            source_events = list(self._state.events)
            fork_leaf = self._state.leaf_event_id
        
        # 复制到新 Conversation
        fork_conv = LocalConversation(agent=fork_agent, ...)
        for event in source_events:
            fork_conv._state.events.append(_copy_event_for_fork(event))
        fork_conv._state.leaf_event_id = fork_leaf
        fork_conv._state.rebuild_view()
```

证据：[local_conversation.py:660-795](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L660-L795)

**关键洞察**：
- `_copy_event_for_fork` 使用 JSON 序列化往返，**剥离运行时字段**（如 executor）
- `from_event_id` 参数允许分支切片（只复制 path_to_root 链）
- 完整 fork 保留原始 HEAD，分支切片重置 HEAD 到 `from_event_id`

### 5.2 navigate_to() — 移动 HEAD 不创建 fork

```python
def navigate_to(self, event_id):
    with self._state:
        if event_id is not None and event_id not in self._state.events:
            raise ValueError(f"Unknown event_id: {event_id}")
        self._state.leaf_event_id = event_id
        self._state.head_is_empty = event_id is None
        self._state.rebuild_view()
```

证据：[local_conversation.py:797-820](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L797-L820)

**与 fork 的区别**：
- `fork` → 创建新 Conversation（独立 ID、目录、状态）
- `navigate_to` → 移动 HEAD 后，**继续 append 创建兄弟分支**

### 5.3 旧版兼容：线性链 vs 树

`_resolve_active_leaf()` 智能处理 `leaf_event_id=None`：

```python
def _resolve_active_leaf(self):
    if self.leaf_event_id is not None:
        return self.leaf_event_id
    if self.head_is_empty:
        return None  # 显式空
    if len(self._events) == 0:
        return None
    
    # 回退到线性末尾（跳过非树 artifact）
    artifacts = (ConversationStateUpdateEvent, ConversationErrorEvent)
    for i in range(len(self._events) - 1, -1, -1):
        if not isinstance(self._events[i], artifacts):
            return self._events.get_id(i)
    return None
```

证据：[state.py:263-293](openhands-sdk/openhands/sdk/conversation/state.py#L263-L293)

**优雅的演进**：新字段 + 旧会话 = 无需迁移的树形识别。

## 6. Event 类型体系

### 6.1 LLMConvertibleEvent 子类

```python
class LLMConvertibleEvent(Event):
    """可转换为 LLM 消息的事件"""
    @abstractmethod
    def to_llm_message(self) -> Message: ...
```

子类：
- `MessageEvent` — user/assistant 消息
- `ActionEvent` — 工具调用（含 `action`, `tool_call`, `thought`, `security_risk`, `summary`）
- `ObservationEvent` — 工具结果
- `SystemPromptEvent` — 系统提示（首次）

### 6.2 控制事件（非 LLMConvertible）

- `CondensationEvent` — 上下文压缩摘要
- `ConversationErrorEvent` — 运行错误
- `ConversationStateUpdateEvent` — 状态同步（不是树节点）
- `UserRejectObservation` — Hook 拒绝

**关键区分**：`ConversationStateUpdateEvent` 在事件循环中**不前进 HEAD**，因为它是同步 artifact 而非用户/Agent 的真实事件。

## 7. 事件合并优化

### 7.1 连续 user 消息合并

```python
def _can_merge_user_messages(previous, current):
    return _is_plain_user_message(previous) and _is_plain_user_message(current)

def _is_plain_user_message(message):
    return (
        message.role == "user"
        and message.tool_calls is None
        and message.tool_call_id is None
        and message.name is None
    )
```

证据：[event/base.py:158-170](openhands-sdk/openhands/sdk/event/base.py#L158-L170)

**作用**：连续的纯 user 消息合并为一条 LLM turn，节省 tokens。

### 7.2 平行工具调用合并

```python
def _combine_action_events(events):
    """多个 ActionEvent 合并为单条 assistant message（多 tool_calls）"""
    if len(events) == 1:
        return events[0].to_llm_message()
    return Message(
        role="assistant",
        content=events[0].thought,  # 共享 thought 只在第一个
        tool_calls=[event.tool_call for event in events],
        ...
    )
```

证据：[event/base.py:173-193](openhands-sdk/openhands/sdk/event/base.py#L173-L193)

**作用**：LLM 在一次响应中返回多个工具调用（如"读 3 个文件"），合并为一条消息以符合 OpenAI/Anthropic 的 parallel function calling 格式。

## 8. 自动保存机制

### 8.1 字段变更追踪

```python
_dirty: bool = PrivateAttr(default=False)

def _save(self):
    if not self._autosave_enabled:
        return
    if not self._dirty:
        return
    # 写入 base_state.json
    ...
```

通过 `_dirty` 标记避免不必要的写入。

### 8.2 agent_state 模式

```python
agent_state: dict[str, Any] = Field(default_factory=dict, ...)
# 使用：
state.agent_state = {**state.agent_state, key: value}  # 触发 autosave
# 不是：
state.agent_state[key] = value  # 不触发 — 不会触发 Pydantic dirty 检测
```

**这是 Pydantic 的微妙行为**：必须重新赋值才能触发变更检测。

## 9. 自动持久化（`@property` view 触发）

`LocalConversation.__init__` 设置：

```python
self._on_event = self._tree_stamping(self._rules_injecting(base_callback))

# 默认 callback:
def _default_callback(e):
    self._state.append_event(e)
```

每次事件通过 `on_event` 流过，都自动调用 `append_event`，自动触发持久化。

## 10. 恢复（Resume）流程

### 10.1 本地 Resume

```python
ConversationState.create(
    id=desired_id,
    agent=agent,
    workspace=self.workspace,
    persistence_dir=self.get_persistence_dir(persistence_dir, desired_id),
    file_store=file_store,
)
```

**`ConversationState.create` vs `__init__`**：
- `create` 是 classmethod，从持久化目录加载现有状态
- `__init__` 是实例化新状态

### 10.2 远端 Resume

RemoteConversation 通过 WebSocket + REST 加载历史：
1. 调用 `GET /api/conversations/{id}` 获取 base_state
2. 验证并构造客户端 State
3. WebSocket 订阅增量更新

## 11. RoboThree 适配

### 11.1 ADOPT

1. **Event 树形结构 + parent_id** — 支持分支、回滚、并行尝试
2. **EventLog 内存索引 + 惰性内容加载** — 支持长会话
3. **view 增量缓存** — 性能关键
4. **向后兼容的 _effective_parent_id** — 不需要数据迁移的演进

### 11.2 ADAPT

1. **Event 持久化后端**：从文件 → SQLite（更好的查询能力）
2. **事件总线**：增加 Pub/Sub 接口（OpenHands 主要是文件 + 内存 PubSub）
3. **fork/navigate API**：增加权限检查和配额限制

### 11.3 REJECT

1. **本地 flock 锁** — 分布式场景需要分布式锁（Redis / etcd）
2. **Path BFS 索引重建** — 大规模会话启动慢，需要增量索引

## 12. 验证证据

| 主张 | 文件 | Symbol | 行 |
| --- | --- | --- | --- |
| Event 树 | event/base.py | `Event.parent_id` | 33-40 |
| 旧版兼容 | event_store.py | `_effective_parent_id` | 91-104 |
| 增量缓存 | state.py | `ConversationState.view` | 336-381 |
| Fork | local_conversation.py | `LocalConversation.fork` | 660-795 |
| Navigate | local_conversation.py | `LocalConversation.navigate_to` | 797-820 |
| Path to root | event_store.py | `path_to_root` | 106-126 |
| 消息合并 | event/base.py | `_combine_action_events` | 173-193 |
| 自动保存 | state.py | `_dirty`, `agent_state` | 212-220, 257 |
| 致命锁警告 | event_store.py | `LOCK_FILE_NAME` | 22-23 |