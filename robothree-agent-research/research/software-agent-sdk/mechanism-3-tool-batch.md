# 机制深挖 #3: Action / Observation + Tool 批处理

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`
> 选择理由：这是 RoboThree Agent ↔ Worker 通信协议的核心设计
> Confirmed by: source (静态源码分析)

## 1. 数据模型

### 1.1 Schema 基类（OpenHands 内部 Pydantic 包装）

```python
class Schema(DiscriminatedUnionMixin):
    """所有 Action/Observation 的基类"""
    # model_json_schema 重写以过滤内部字段
    # 默认 example 设为 [] 避免泄露
```

证据：[schema.py](openhands-sdk/openhands/sdk/tool/schema.py)

### 1.2 Action 基类

```python
class Action(Schema):
    """工具输入 — 总是来自 LLM"""
    pass
```

特性：
- Pydantic 模型，自动 JSON Schema 生成
- 字段包括 LLM 应该提供的输入

### 1.3 Observation 基类

```python
class Observation(Schema):
    """工具输出 — 总是来自工具执行"""
    pass
```

### 1.4 JSON Schema 过滤

`Schema.model_json_schema` 重写以排除内部字段：

```python
# 内部字段（不出现在 LLM 的 tool schema 中）：
- thought: list[TextContent]      # agent 的思考，不在 Action 自身 schema
- security_risk: SecurityRisk     # 安全风险评估
- summary: str                     # 简短摘要
```

**关键洞察**：Action 的 Pydantic 模型用于**两个目的**：
1. 验证 LLM 输出的 JSON
2. 生成 LLM 看到的 tool schema（必须过滤内部字段）

证据：[tool.py](openhands-sdk/openhands/sdk/tool/tool.py)

## 2. ActionEvent — 工具调用的传输单元

### 2.1 字段定义

```python
class ActionEvent(LLMConvertibleEvent):
    source: SourceType = "agent"
    thought: Sequence[TextContent]            # Agent 的内部思考
    reasoning_content: str | None             # 推理模型输出
    thinking_blocks: list[ThinkingBlock]      # Anthropic 思维块
    responses_reasoning_item: ReasoningItemModel | None  # OpenAI Responses API
    
    action: Action | None                     # 已解析的 Action（None 表示非可执行）
    tool_name: str                            # 工具名
    tool_call_id: ToolCallID                  # LLM 分配的 ID
    tool_call: MessageToolCall                # 原始 LLM 调用（含 security_risk）
    
    llm_response_id: EventID                  # 用于配对 multi-tool batches
    
    security_risk: SecurityRisk               # LLM 自评风险
    critic_result: CriticResult | None         # 可选 Critic 评估
    summary: str | None                       # LLM 提供的简短摘要
```

证据：[event/llm_convertible/action.py](openhands-sdk/openhands/sdk/event/llm_convertible/action.py)

### 2.2 关键区分：`tool_call` vs `action`

```python
# tool_call: 原始 LLM 输出，可能含 security_risk 字段
tool_call = MessageToolCall(
    id="...",
    name="terminal",
    arguments='{"command": "ls", "security_risk": "LOW"}'
)

# action: 解析后的 Pydantic Action，不含 security_risk
action = ExecuteBashAction(command="ls")
```

**为何要分开？**：
- `tool_call` 用于回放到 LLM 历史（必须包含 security_risk 以匹配 LLM 视角）
- `action` 用于执行工具（已剥离 security_risk）

### 2.3 多 Action 合并

```python
# 当 LLM 一次响应返回多个工具调用
batch_events: list[ActionEvent] = [event1, event2, event3]
assert all(e.llm_response_id == same)  # 必须同一 LLM 响应

# 合并为单条 assistant message
msg = Message(
    role="assistant",
    content=events[0].thought,             # 仅第一个有 thought
    tool_calls=[e.tool_call for e in events],
    reasoning_content=events[0].reasoning_content,  # 共享
    thinking_blocks=events[0].thinking_blocks,
)
```

证据：[event/base.py:173-193](openhands-sdk/openhands/sdk/event/base.py#L173-L193)

## 3. ToolDefinition — 工具的运行时形态

### 3.1 核心字段

```python
class ToolDefinition(DiscriminatedUnionMixin, ABC):
    name: str
    annotations: ToolAnnotations              # MCP 风格的元数据
    action_type: type[Action]                # 工具输入 Pydantic 类型
    observation_type: type[Observation]      # 工具输出 Pydantic 类型
    executor: ToolExecutor | None            # 执行器（可空表示 disabled）
```

证据：[tool/tool.py:65-303](openhands-sdk/openhands/sdk/tool/tool.py)

### 3.2 MCP 风格的 ToolAnnotations

```python
class ToolAnnotations(BaseModel):
    title: str | None
    readOnlyHint: bool = False           # 是否只读
    destructiveHint: bool = True         # 是否破坏性
    idempotentHint: bool = False         # 幂等性
    openWorldHint: bool = True           # 是否与外部世界交互
```

**作用**：让 LLM 在调用工具时理解其语义特性（如 destructive tools 需更谨慎）。

### 3.3 ToolExecutor 协议

```python
class ToolExecutor(ABC):
    @abstractmethod
    def __call__(
        self,
        action: ActionT,
        conversation: "LocalConversation | None" = None,
    ) -> ObservationT: ...
    
    def close(self) -> None:
        """清理资源（关闭连接、终止进程）"""
    
    def interrupt(self) -> None:
        """协作式中断（向运行中工具发信号）"""
```

**关键洞察**：
- `executor.__call__(action, conversation)` — executor 接收 conversation 上下文，便于访问共享状态（workspace, secret registry）
- `interrupt()` 与 `close()` 分离 — 中断后**线程继续运行**到自然结束，但发送了 abort 信号（如 Ctrl+C）

证据：[tool/tool.py:133-178](openhands-sdk/openhands/sdk/tool/tool.py#L133-L178)

## 4. ParallelToolExecutor — 并行批处理

### 4.1 核心数据结构

```python
class ParallelToolExecutor:
    def __init__(self, max_workers=1, lock_manager=None):
        self._max_workers = max_workers
        self._lock_manager = lock_manager or ResourceLockManager()
```

证据：[agent/parallel_executor.py:40-56](openhands-sdk/openhands/sdk/agent/parallel_executor.py#L40-L56)

### 4.2 同步批执行

```python
def execute_batch(self, action_events, tool_runner, tools=None, cancel_token=None):
    if not action_events:
        return []
    
    # 单 action 或 max_workers=1 → 顺序执行
    if len(action_events) == 1 or self._max_workers == 1:
        return [self._run_safe(action, tool_runner, ...) for action in action_events]
    
    # 多 action + max_workers>1 → ThreadPoolExecutor 并发
    with ThreadPoolExecutor(max_workers=self._max_workers) as executor:
        futures = [executor.submit(self._run_safe, ...) for action in action_events]
    return [future.result() for future in futures]
```

### 4.3 异步批执行

```python
async def aexecute_batch(self, action_events, tool_runner, tools=None, cancel_token=None):
    if len(action_events) == 1 or self._max_workers == 1:
        return [await self._arun_safe(action, ...) for action in action_events]
    
    # 用专用 ThreadPoolExecutor 避免争用 asyncio 默认池
    with ThreadPoolExecutor(max_workers=self._max_workers, thread_name_prefix="aexecute_batch") as pool:
        return list(await asyncio.gather(*[
            self._arun_safe(action, ..., pool) for action in action_events
        ]))
```

**关键洞察**：异步路径使用**专用 ThreadPoolExecutor**，避免其他 `run_in_executor` 用户争用 asyncio 默认小池。

### 4.4 CancellationToken 协作式取消

```python
@staticmethod
def _cancelled_error(action):
    return [AgentErrorEvent(
        error="Tool call cancelled by interrupt.",
        tool_name=action.tool_name,
        tool_call_id=action.tool_call_id,
    )]

def _run_safe(self, action, tool_runner, tool=None, cancel_token=None):
    if cancel_token is not None and cancel_token.is_cancelled:
        return self._cancelled_error(action)
    # ... 真正执行 ...
```

证据：[parallel_executor.py:212-281](openhands-sdk/openhands/sdk/agent/parallel_executor.py#L212-L281)

**取消流程**：
1. `Conversation.interrupt()` 设置 cancel token
2. `_run_safe` 在工具执行前检查 token → 返回 synthetic error
3. 已开始的工具继续运行到自然结束（interrupt 信号让它们快速退出）
4. 异步路径额外调用 `tool.executor.interrupt()` 让异步工具也立即停止

### 4.5 CancellationToken 设计

```python
class CancellationToken:
    """线程安全取消标志 — 不是 asyncio 原语（需同时用于事件循环线程和工作线程）"""
    __slots__ = ("_event",)
    
    def __init__(self):
        self._event = threading.Event()
    
    def cancel(self):
        self._event.set()  # 幂等
    
    @property
    def is_cancelled(self):
        return self._event.is_set()
```

证据：[conversation/cancellation.py](openhands-sdk/openhands/sdk/conversation/cancellation.py)

**关键洞察**：**有意不**用 `asyncio.Event`，因为它必须同时供 event-loop 线程和 thread-pool 工作线程使用。`threading.Event` 是跨线程兼容的。

## 5. ResourceLockManager — 资源级锁

### 5.1 锁键语义

```python
DEFAULT_TIMEOUTS = {
    "file": 30.0,
    "terminal": 300.0,
    "browser": 300.0,
    "mcp": 300.0,
    "tool": 60.0,
}
```

锁键格式 `<prefix>:<resource>`，前缀决定默认超时：
- `file:/path/to/file.py` — 文件锁
- `terminal:<session_id>` — 终端会话锁
- `browser:<session_id>` — 浏览器会话锁

证据：[resource_lock_manager.py:21-28](openhands-sdk/openhands/sdk/conversation/resource_lock_manager.py#L21-L28)

### 5.2 排序获取防死锁

```python
@contextmanager
def lock(self, *resource_keys):
    sorted_keys = sorted(set(resource_keys))   # 排序避免循环等待
    acquired = []
    try:
        for key in sorted_keys:
            timeout = self._get_timeout(key)
            if not self._get_lock(key).acquire(timeout=timeout):
                # 回滚本次 refcount 增量
                ...
                raise ResourceLockTimeout(...)
            acquired.append(key)
        yield
    finally:
        for key in reversed(acquired):
            self._release_lock(key)
```

**关键设计**：多键获取按**字典序排序** — 避免 A 持有 file1 等 file2，B 持有 file2 等 file1 的循环等待。

### 5.3 DeclaredResources 声明式资源

```python
@dataclass(frozen=True, slots=True)
class DeclaredResources:
    keys: tuple[str, ...]
    declared: bool
```

| declared | keys | 行为 |
| --- | --- | --- |
| False | - | 工具未声明 → 默认 `tool:<name>` 互斥锁（保守策略） |
| True | `()` | 工具明确声明"无共享资源" → 完全无锁 |
| True | `("file:/a.py",)` | 工具声明具体资源 → 锁这些资源 |

**核心洞察**：`declared=False` 与 `declared=True, keys=()` 的区别很重要。前者是"我没考虑"，后者是"我考虑了，确实安全"。Tool 必须**显式声明**才能完全跳过锁。

证据：[tool/tool.py:100-127](openhands-sdk/openhands/sdk/tool/tool.py#L100-L127)

## 6. _ActionBatch 完整生命周期

### 6.1 准备阶段

```python
class _ActionBatch:
    @classmethod
    def prepare(cls, action_events, state, executor, tool_runner, tools, cancel_token):
        # 1. Finish 截断
        action_events, has_finish = cls._truncate_at_finish(action_events)
        
        # 2. 分区（被 Hook 阻塞的 Action）
        blocked_reasons = {}
        executable = []
        for ae in action_events:
            reason = state.pop_blocked_action(ae.id)
            if reason is not None:
                blocked_reasons[ae.id] = reason
            else:
                executable.append(ae)
        
        # 3. 并行执行
        executed_results = executor.execute_batch(
            executable, tool_runner, tools, cancel_token
        )
        results_by_id = dict(zip([ae.id for ae in executable], executed_results))
        
        return cls(action_events, has_finish, blocked_reasons, results_by_id)
```

证据：[agent/agent.py:227-258](openhands-sdk/openhands/sdk/agent/agent.py#L227-L258)

### 6.2 Finish 截断

```python
@staticmethod
def _truncate_at_finish(action_events):
    finish_idx = next((i for i, ae in enumerate(action_events)
                       if ae.tool_name == FinishTool.name), None)
    if finish_idx is None:
        return action_events, False
    
    discarded = action_events[finish_idx + 1:]
    if discarded:
        logger.warning(f"Discarding {len(discarded)} tool call(s) after FinishTool: ...")
    return action_events[:finish_idx + 1], True
```

**为何截断？**：LLM 偶尔会在 Finish 之后多调几个工具。截断 + 日志警告避免这些多余执行。

### 6.3 事件发射阶段

```python
def emit(self, on_event):
    """按原始顺序发射所有事件"""
    for ae in self.action_events:
        reason = self.blocked_reasons.get(ae.id)
        if reason is not None:
            logger.info(f"Action '{ae.tool_name}' blocked by hook: {reason}")
            on_event(UserRejectObservation(
                action_id=ae.id,
                tool_name=ae.tool_name,
                tool_call_id=ae.tool_call_id,
                rejection_reason=reason,
                rejection_source="hook",
            ))
        else:
            for event in self.results_by_id[ae.id]:
                on_event(event)
```

**关键**：保持**原始顺序**发射 — 即便工具是并行执行的，事件流仍是线性的。

### 6.4 完成阶段

```python
def finalize(self, on_event, check_iterative_refinement, mark_finished):
    if not self.has_finish or self.action_events[-1].id in self.blocked_reasons:
        return
    
    should_continue, followup = check_iterative_refinement(self.action_events[-1])
    if should_continue and followup:
        # 注入用户消息让 Agent 继续
        on_event(MessageEvent(
            source="user",
            llm_message=Message(role="user", content=[TextContent(text=followup)]),
        ))
    else:
        mark_finished()
```

**iterative refinement** 模式：Agent 调用 Finish 后，系统可以注入反馈让 Agent 再来一轮（如"请改进摘要"）。

## 7. 失败模式分类

| 场景 | 处理 | 证据 |
| --- | --- | --- |
| Tool 不存在 | `_emit_tool_error()` → AgentErrorEvent | agent.py:1197-1208 |
| 参数验证失败 | Pydantic ValidationError → AgentErrorEvent | agent.py:1230-1264 |
| Finish 截断 | 丢弃后续 + 警告日志 | agent.py:200-225 |
| Hook 拒绝 | blocked_actions 跟踪 + UserRejectObservation | agent.py:300-317 |
| 用户消息拒绝 | blocked_messages + 直接 FINISHED | agent.py:633-643 |
| 工具抛 ValueError | AgentErrorEvent + Agent 自我纠正 | agent.py:1333-1343 |
| 工具抛其他 Exception | AgentErrorEvent + 详细日志 | parallel_executor.py:269-280 |
| 工具取消 | 合成 AgentErrorEvent（"Tool call cancelled"） | parallel_executor.py:212-220 |
| 锁超时 | ResourceLockTimeout | resource_lock_manager.py:110-112 |
| 致命工具异常 | AgentErrorEvent 继续；不中断批处理 | parallel_executor.py:269-280 |

## 8. RoboThree 适配

### 8.1 ADOPT

1. **Action/Observation 双模式** — 强类型工具协议
2. **tool_call 与 action 分离** — 保留 LLM 原始视角的 security_risk
3. **多 Action 合并为单 message** — 节省 tokens，符合 LLM API 协议
4. **ResourceLockManager 排序获取** — 防死锁
5. **DeclaredResources 三态语义** — 让工具显式声明安全性
6. **_ActionBatch 生命周期** — 截断 + 分区 + 并行 + 顺序发射
7. **CancellationToken 跨线程** — 同时支持 event loop 和 thread pool

### 8.2 ADAPT

1. **Thought/Reasoning 字段** — 当前可能太细，RoboThree 可抽象为 `reasoning: Any`
2. **本地 flock 文件锁** — 分布式场景需替换为 Redis/etcd
3. **Default timeouts** — 30s 文件锁可能太短，RoboThree 应可配置

### 8.3 REJECT

1. **tool_call 中保留 security_risk** — 这是 LLM 自评风险的一部分，RoboThree 应改为服务端分析
2. **默认 max_workers=1** — OpenHands 默认保守，RoboThree 默认应 >1（多数工具可并行）

## 9. 验证证据

| 主张 | 文件 | Symbol | 行 |
| --- | --- | --- | --- |
| ActionEvent 字段 | event/llm_convertible/action.py | `ActionEvent` | 24-89 |
| 多 Action 合并 | event/base.py | `_combine_action_events` | 173-193 |
| ToolDefinition | tool/tool.py | `ToolDefinition` | 197-... |
| ToolAnnotations | tool/tool.py | `ToolAnnotations` | 65-98 |
| ToolExecutor 协议 | tool/tool.py | `ToolExecutor` | 133-178 |
| 同步批处理 | agent/parallel_executor.py | `execute_batch` | 56-102 |
| 异步批处理 | agent/parallel_executor.py | `aexecute_batch` | 104-160 |
| 资源锁 | conversation/resource_lock_manager.py | `ResourceLockManager.lock` | 84-118 |
| DeclaredResources | tool/tool.py | `DeclaredResources` | 100-127 |
| 取消流程 | agent/parallel_executor.py | `_cancelled_error` | 212-220 |
| CancellationToken | conversation/cancellation.py | `CancellationToken` | 21-44 |
| _ActionBatch | agent/agent.py | `_ActionBatch` | 183-351 |
| Finish 截断 | agent/agent.py | `_truncate_at_finish` | 200-225 |