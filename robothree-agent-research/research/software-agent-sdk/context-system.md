# context-system.md — Context 系统

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 1. Context 架构

### 1.1 三层 Context 模型

```
Static System Prompt  →  跨会话可缓存（prompt caching）
Dynamic Context       →  每次对话可能变化（Secrets / Skills / Datetime）
Per-Turn Context      →  事件流驱动（Event → LLM Message 转换）
```

### 1.2 Static vs Dynamic 分离

`Agent.init_state()` 将系统提示分为静态和动态两部分：

```python
event = SystemPromptEvent(
    source="agent",
    system_prompt=TextContent(text=self.static_system_message),  # 静态 → 可缓存
    tools=list(self.tools_map.values()),
    dynamic_context=TextContent(text=dynamic_context) if dynamic_context else None,
)
```

目的：**跨会话 Prompt Caching**。静态部分在所有使用相同 Agent 配置的会话间共享缓存。[F]

证据 — [agent.py:502-522](openhands-sdk/openhands/sdk/agent/agent.py#L502-L522)

### 1.3 Dynamic Context 构建

`Agent.get_dynamic_context()` 从以下来源收集动态内容：
1. 密钥名称和描述（来自 `SecretRegistry`）
2. AgentContext 中的 Skills 信息
3. 当前日期时间
4. 仓库/工作区信息

证据 — [agent.py:524-547](openhands-sdk/openhands/sdk/agent/agent.py#L524-L547)

## 2. Prompt 模板系统

### 2.1 Registry-based 提示组装

内置 prompt 从 Typed Section Registry 组装：
- 每个 Section 有自己的输出逻辑（static tier + dynamic tier）
- Preset（`DEFAULT` / `PLANNING`）决定哪些 Section 被包含
- Custom security policy 可替换默认安全策略 Section

证据 — [base.py:318-348](openhands-sdk/openhands/sdk/agent/base.py#L318-L348)

### 2.2 Jinja2 Escape Hatch

对于自定义 Agent 子类或自定义 prompt 文件：
- `system_prompt_filename` 指定 Jinja2 模板文件
- `system_prompt` 直接提供完整 prompt 文本（覆盖模板）
- `system_prompt_kwargs` 传递模板参数

证据 — [base.py:186-221](openhands-sdk/openhands/sdk/agent/base.py#L186-L221)

## 3. Condensation（上下文压缩）

### 3.1 LLMSummarizingCondenser

当 LLM 上下文窗口超限时自动触发：

1. `LLMContextWindowExceedError` 触发
2. 生成 `CondensationRequest` 事件
3. Condenser 取出历史事件的子集
4. 用 dedicated LLM 生成摘要
5. 将摘要替换被压缩的历史事件
6. 继续 Agent 执行

证据 — [agent.py:759-772](openhands-sdk/openhands/sdk/agent/agent.py#L759-L772)

### 3.2 Condenser 接口

```python
class CondenserBase(ABC):
    def condense(self, events, llm) -> list[Event]: ...
    def handles_condensation_requests(self) -> bool: ...
```

### 3.3 增量缓存视图

`ConversationState.view` 维护 LLM 消息的增量缓存：
- 事件追加时增量更新
- `rebuild_view()` 在 condensation 后全量重建
- 避免每次 step 都遍历全量事件转换为 LLM 消息

证据 — [state.py](openhands-sdk/openhands/sdk/conversation/state.py) 中的 `view` 属性

## 4. Prompt Caching 策略

### 4.1 跨会话缓存

- `LLMCallContext.prompt_cache_key` 决定缓存分片
- 默认使用 Conversation ID
- 子会话可设置 `prompt_cache_key` 为父会话 ID 共享缓存

### 4.2 Tool Schema 缓存

工具定义 (`tools=list(self.tools_map.values())`) 作为静态系统提示的一部分：
- 同一 Agent 配置的所有会话共享工具 schema 的 prompt cache
- 工具变更时缓存失效

## 5. 事件到 LLM 消息转换

`LLMConvertibleEvent.events_to_messages()` 将事件流转换为 LLM 消息：
- ActionEvent 合并为单条 assistant 消息（平行 tool_calls）
- MessageEvent 转换为 user/assistant 消息
- ObservationEvent 转换为 tool 消息
- 连续 user 消息合并（coalesce）

证据 — [event/base.py:108-155](openhands-sdk/openhands/sdk/event/base.py#L108-L155)

## 6. 上下文大小管理

| 机制 | 方式 |
| --- | --- |
| 增量缓存 | `state.view` 增量更新 |
| Condensation | 窗口超限时自动压缩 |
| 静态/动态分离 | 静态部分跨会话缓存 |
| System prompt 分块 | Static → cache_marker ON; Dynamic → no cache |
| 工具 schema 内联 | 作为 system prompt 静态部分 |

## 7. RoboThree 启示

| 方面 | 评价 |
| --- | --- |
| Static/Dynamic 分离 | 优秀的 prompt caching 优化策略 |
| Condensation | 自动化上下文压缩，对长时间 Agent 运行必要 |
| Section Registry | 模块化 prompt 组装，比整块模板更灵活 |
| 增量缓存视图 | 避免每次循环重算，性能关键 |
