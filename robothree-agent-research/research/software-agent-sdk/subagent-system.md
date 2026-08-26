# subagent-system.md — Subagent 与多 Agent 系统

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 1. Subagent 委托模式

### 1.1 DelegateTool

当 Agent 需要委托工作时，使用 `DelegateTool`：

1. 父 Agent 调用 `delegate` 工具，提供任务描述
2. 创建一个子 `LocalConversation`（通过 `fork()` 从父 Conversation 派生）
3. 子 Agent 在隔离的工作区中执行
4. 结果返回给父 Agent

证据 — [delegate/impl.py](openhands-tools/openhands/tools/delegate/impl.py)

### 1.2 Fork 隔离机制

`LocalConversation.fork()` 创建事件历史的深拷贝：
- 拷贝 `path_to_root(from_event_id)` 的事件子集
- 新 Conversation ID
- 独立的持久化目录
- 可选的 metrics 重置
- Agent 深拷贝（通过 JSON 往返避免线程锁问题）

证据 — [local_conversation.py:660-795](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L660-L795)

## 2. Agent 注册系统

### 2.1 注册表

全局 Agent 工厂注册表：

```python
register_agent(name: str, factory: Callable[[], AgentBase]) → None
get_agent_factory(name: str) → Callable[[], AgentBase]
register_agent_if_absent(name, factory) → None  # 不覆盖已有
```

证据 — [subagent/registry.py](openhands-sdk/openhands/sdk/subagent/registry.py)

### 2.2 Agent 定义

```python
class AgentDefinition:
    name: str
    description: str
    level: AgentDefinitionLevel  # "project" | "user" | "plugin"
    source_path: Path            # Markdown 定义文件路径
    agent_class: str             # Agent 类名
    tools: list[str]             # 工具列表
    llm_profile: str | None      # LLM 配置
    system_prompt: str           # 系统提示
```

证据 — [subagent/schema.py](openhands-sdk/openhands/sdk/subagent/schema.py)

### 2.3 Agent 发现

多级 Agent 发现，优先级从高到低：

1. 程序化注册（`register_agent()`）
2. Plugin Agents（Plugin 加载时注册）
3. 项目级文件 Agents（`<project>/.agents/agents/*.md`, `<project>/.openhands/agents/*.md`）
4. 用户级文件 Agents（`~/.agents/agents/*.md`, `~/.openhands/agents/*.md`）

证据 — [local_conversation.py:1306-1323](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L1306-L1323)

## 3. 多 Agent 通信模式

### 3.1 通过 Event Stream 通信

- 父 Agent 的 `MessageEvent` 可设置 `sender` 字段标识来源 Agent
- 子 Agent 结果通过 `ObservationEvent` 返回
- `delegate` 工具调用结果包含子 Agent 的完整输出

### 3.2 提示缓存共享

- 子 Conversation 通过 `prompt_cache_key` 共享父 Conversation 的 prompt cache shard
- 减少子 Agent 的重复 prompt 构建成本

证据 — [local_conversation.py:1410-1413](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L1410-L1413)

## 4. ACP Agent（外部 Agent 集成）

`ACPAgent` 允许集成外部 Agent 进程（通过 ACP 协议）：
- ACP 服务器管理自己的工具集
- OpenHands 不注入工具
- ACP Agent 管理自己的上下文窗口（不支持 OpenHands Condenser）
- 支持运行时模型切换（`session/set_model`）

证据 — [acp_agent.py](openhands-sdk/openhands/sdk/agent/acp_agent.py)

关键能力标志：

| 属性 | OpenHands Agent | ACP Agent |
| --- | --- | --- |
| `supports_openhands_tools` | true | false |
| `supports_openhands_mcp` | true | false |
| `supports_condenser` | true | false |
| `agent_kind` | "openhands" | "acp" |

证据 — [base.py:846-876](openhands-sdk/openhands/sdk/agent/base.py#L846-L876)

## 5. 多 Agent 边界与安全

- 子 Conversation 创建独立的 EventLog 和持久化目录
- 父 Agent 的密钥和 MCP 配置**不自动**传递给子 Agent（需要显式配置）
- Agent 定义的 `tools` 列表决定子 Agent 的能力边界
- 没有跨 Agent 的权限继承模型 [I]

## 6. RoboThree 启示

| 机制 | 评价 |
| --- | --- |
| Fork-based 子会话 | 优雅的隔离方案，复制事件历史后独立运行 |
| Agent 注册系统 | 多级发现 + 文件定义格式（Markdown）值得借鉴 |
| ACP 协议集成 | 外部 Agent 的能力标志设计很好（support_* 属性） |
| 限制 | 缺少跨 Agent 的消息路由、权限继承、超时编排 |
