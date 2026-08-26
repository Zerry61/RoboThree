# 机制深挖 #1: Conversation 工厂与 Worker 抽象

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`
> 选择理由：这是 RoboThree "Local Worker / Cloud Worker 统一接口" 需求的核心匹配点
> Confirmed by: source (静态源码分析)

## 1. 设计目标

OpenHands 的设计目标：**用同一份 `Conversation` API 同时支持本地执行和远端执行**，让用户代码无需关心 Agent 运行在哪里。

## 2. 路由机制：`Conversation.__new__()` 工厂

### 2.1 入口实现

`Conversation` 不是普通类 — 它**没有 `__init__`**，只重写 `__new__`：

```python
class Conversation:
    @overload
    def __new__(cls, *, workspace: str | Path | LocalWorkspace, ...) -> "LocalConversation": ...
    
    @overload
    def __new__(cls, *, workspace: RemoteWorkspace, ...) -> "RemoteConversation": ...
    
    def __new__(cls, *, workspace, ...) -> BaseConversation:
        if isinstance(workspace, RemoteWorkspace):
            return RemoteConversation(...)
        return LocalConversation(...)
```

证据：[conversation.py:34-235](openhands-sdk/openhands/sdk/conversation/conversation.py#L34-L235)

### 2.2 关键设计点

| 设计点 | 价值 |
| --- | --- |
| `__new__` 而非 `__init__` | 真实返回不同类型的对象，避免继承层级的深度组合 |
| `isinstance(workspace, RemoteWorkspace)` 触发切换 | 与类型系统自动对齐 — 用户传入的类型决定执行后端 |
| Overload 类型提示 | IDE/mypy 能根据 workspace 类型推断返回类型 |
| 共用 `BaseConversation` 协议 | API 一致性 — `send_message`, `run`, `pause` 在两个类上完全对齐 |

## 3. BaseWorkspace ABC — 5 个抽象方法

```python
class BaseWorkspace(ABC):
    working_dir: str                              # 必须的工作目录
    def execute_command(self, command, cwd, timeout) -> CommandResult: ...
    def file_upload(self, src, dst) -> FileOperationResult: ...
    def file_download(self, src, dst) -> FileOperationResult: ...
    def git_changes(self, path) -> list[GitChange]: ...
    def git_diff(self, path) -> GitDiff: ...
    def pause(self): ...    # 可选 — Local noop; Container 实现
    def resume(self): ...   # 可选
```

证据：[base.py:23-182](openhands-sdk/openhands/sdk/workspace/base.py#L23-L182)

### 3.1 设计哲学

- **最小公倍数**：5 个核心操作覆盖了 Agent 所需的全部工作区能力
- **可扩展性**：通过继承 `BaseWorkspace` 即可新增后端类型
- **关键 insight**：`pause/resume` 不是 ABC 抽象方法 — 因为 LocalWorkspace 不支持。这种**渐进式抽象**比一次性强制所有后端实现所有方法更灵活

### 3.2 5 种后端实现对比

| Workspace | 命令执行 | 文件传输 | Git 操作 | 隔离级别 |
| --- | --- | --- | --- | --- |
| **LocalWorkspace** | `subprocess.run` | `shutil.copy2` | `subprocess` git CLI | 无 |
| **DockerWorkspace** | docker exec | docker cp | git CLI in container | 容器 |
| **ApptainerWorkspace** | apptainer exec | apptainer copy | git CLI in container | 容器 |
| **CloudWorkspace** | cloud API | cloud API | cloud API | VM |
| **RemoteWorkspace** | Agent Server REST + 轮询 | multipart upload | REST | API 边界 |

证据：[workspace/local.py](openhands-sdk/openhands/sdk/workspace/local.py), [workspace/remote/base.py](openhands-sdk/openhands/sdk/workspace/remote/base.py), [workspace/docker/workspace.py](openhands-workspace/openhands/workspace/docker/workspace.py)

## 4. RemoteWorkspace 实现深挖

### 4.1 Generator-based 流式协议

`RemoteWorkspaceMixin` 用 **Python Generator** 实现流式 HTTP 协议：

```python
def _execute_command_generator(self, command, cwd, timeout):
    # Step 1: 启动命令
    response = yield {"method": "POST", "url": "/api/bash/start_bash_command", ...}
    command_id = response.json()["id"]
    
    # Step 2: 轮询增量事件
    while time.time() - start_time < timeout:
        response = yield {"method": "GET", "url": "/api/bash/bash_events/search", ...}
        for event in response.json()["items"]:
            if event.get("stdout"):
                stdout_parts.append(event["stdout"])
            if event.get("exit_code") is not None:
                exit_code = event["exit_code"]
                break
        time.sleep(0.1)
```

证据：[remote_workspace_mixin.py:67-200](openhands-sdk/openhands/sdk/workspace/remote/remote_workspace_mixin.py#L67-L200)

**关键设计**：
- Generator 把"启动 → 轮询"两步协议封装为单一 `execute_command` 方法
- 客户端用 `_execute(generator)` 推进 generator，每次 yield 一个 HTTP 请求 dict
- 增量 ID 跟踪避免重复事件 (`seen_event_ids`)
- `order__gt=last_order` 是增量拉取的关键 — **服务端事件流需要严格递增 order 字段**

### 4.2 异步变体

`AsyncRemoteWorkspace` 提供完全相同的接口但用 `httpx.AsyncClient`：

```python
async def aexecute_command(self, command, cwd, timeout):
    async with self.client.stream("POST", ...) as response:
        # 流式处理
        ...
```

证据：[remote/async_remote_workspace.py](openhands-sdk/openhands/sdk/workspace/remote/async_remote_workspace.py)

### 4.3 重试与超时

- `tenacity.retry` 包装 5xx 错误和 ConnectError、TimeoutException
- HTTP read timeout 默认 600 秒（10 分钟）— 适配 LLM 调用
- 每次 HTTP 请求的 timeout 比业务 timeout 多 5 秒缓冲

## 5. RemoteConversation 客户端深挖

### 5.1 WebSocket 事件流

```python
class WebSocketCallbackClient:
    ws_url = f"wss://{host}/sockets/events/{conversation_id}?session_api_key=..."
    
    async def _client_loop(self):
        delay = 1.0
        while not self._stop.is_set():
            try:
                async with websockets.connect(ws_url) as ws:
                    async for message in ws:
                        event = Event.model_validate(json.loads(message))
                        # 首个 ConversationStateUpdateEvent 标记 connection_ready
                        self.callback(event)
            except ConnectionClosed as exc:
                if close_code in {4001, 4004}:
                    break  # 致命错误，不再重试
                await self._sleep_before_retry(delay)
                delay = min(delay * 2, 30.0)  # 指数退避，最大 30s
```

证据：[remote_conversation.py:126-280](openhands-sdk/openhands/sdk/conversation/impl/remote_conversation.py#L126-L280)

**关键设计点**：
- 致命错误 close code (`4001`, `4004`) 不重试，避免无限循环
- 指数退避（1s → 2s → 4s → ... → 30s）防止重连风暴
- `wait_until_ready()` 等待首个 `ConversationStateUpdateEvent`，表示订阅完成

### 5.2 RemoteEventsList — 远程事件列表

```python
class RemoteEventsList(EventsListBase):
    """惰性事件列表，首次访问时拉取已有事件，之后依赖 WebSocket 增量"""
    
    def __init__(self, client, conversation_id):
        self._client = client
        self._conversation_id = conversation_id
        self._cached_events = []
        self._cached_event_ids = set()
        self._lock = threading.RLock()
    
    def __getitem__(self, idx):
        # 首次访问触发 paginated GET
        if not self._loaded:
            self._load_from_server()
        return self._cached_events[idx]
```

证据：[remote_conversation.py:282-...](openhands-sdk/openhands/sdk/conversation/impl/remote_conversation.py#L282)

**复用洞察**：`RemoteEventsList` 实现了与本地 `EventLog` 完全相同的接口（继承 `EventsListBase`），让 `ConversationState.view` 缓存机制可以无缝工作。

## 6. Agent Server 的会话管理

### 6.1 ConversationService 责任

```python
class ConversationService:
    # 核心职责（来自源码）
    - 创建会话 (POST /api/conversations)
    - 启动 Agent 运行
    - 持久化会话状态到磁盘
    - WebSocket 事件流 (subscribe/publish)
    - Webhook 通知 (run completion)
    - 会话租约 (防止多实例并发)
    - Git Worktree 隔离
    - 资源清理（定时器 + on_close）
```

证据：[conversation_service.py](openhands-agent-server/openhands/agent_server/conversation_service.py)

### 6.2 双认证模式

| 路由 | 认证 |
| --- | --- |
| `/api/conversations/*` | `X-Session-API-Key` Header |
| `/api/workspaces/*` | Header **或** Cookie（支持 `<iframe>` 嵌入） |
| `/api/init` | `X-Init-API-Key`（启动配置） |
| `/openai/*` | OpenAI API Key |

**关键 insight**：Workspace 路由支持 Cookie 是因为浏览器 `<iframe src>` / `<img src>` 无法附加自定义 Header — 这种设计支持前端嵌入式 UI 直接展示工作区文件。

### 6.3 延迟初始化（warm-pool）

```python
# deferred_init = True 时
async def api_lifespan(api: FastAPI):
    init_service = InitService(api, base_config=config)
    api.state.init_service = init_service
    mark_initialization_complete()  # /ready 返回 200
    
    yield  # 等待 POST /api/init 注入 LLM 密钥
    
    finally:
        await init_service.teardown()
```

证据：[api.py:216-231](openhands-agent-server/openhands/agent_server/api.py#L216-L231)

**价值**：
- Server 容器**预先启动**但**不加载 LLM 密钥** — 避免冷启动延迟
- 用户会话到达时**通过 HTTP 注入**密钥 → 会话服务启动 → Agent 运行
- 适合 Cloud Auto-scaling 场景

## 7. State 同步（Resume 机制）

### 7.1 本地 State 持久化

`ConversationState` 通过 `FileStore` 持久化：
- `base_state.json` — 配置（agent, workspace, secrets...）
- `events/` 目录 — 每个事件一个文件（按 EVENT_FILE_PATTERN）
- `metrics.json` — Token 用量和成本

### 7.2 远端 Resume

RemoteConversation 的 resume：
1. 从 Agent Server 加载 `base_state.json`
2. 重建 `ConversationState` (validate 类型)
3. 通过 WebSocket 订阅事件流
4. 客户端从首次 GET 拉取历史事件
5. WebSocket 接管增量更新

**挑战**：客户端 SDK 必须与 Server 端的 `Event` Schema 严格一致（同一 Pydantic 模型）。Schema 版本不一致会导致 resume 失败。

## 8. 失败模式

### 8.1 Agent Kind 不匹配

```python
def _agent_kind_mismatch_message(conversation_id):
    return (
        f"Conversation {conversation_id} was started with a different agent kind. "
        f"Attach with a matching agent type."
    )
```

证据：[remote_conversation.py:70-75](openhands-sdk/openhands/sdk/conversation/impl/remote_conversation.py#L70-L75)

OpenHands 的 Agent 类型有 `"openhands"` 和 `"acp"` 两种，Resume 时必须用相同类型 — 防止意外的能力丢失。

### 8.2 WebSocket 致命错误

`FATAL_WS_CLOSE_CODES = {4001, 4004}` — Server 用特定 close code 表示"不要再重试"。客户端识别后停止重连，避免无效循环。

### 8.3 LookupSecret 延迟解析

服务端注入的密钥在 Agent Server 端存储，客户端用 `LookupSecret(url, headers)` 占位 — **原始密钥永远不离开服务端**。

证据：[remote/base.py:433-485](openhands-sdk/openhands/sdk/workspace/remote/base.py#L433-L485)

## 9. RoboThree 适配结论

### 9.1 直接借鉴（ADOPT）

1. **`Conversation.__new__()` 工厂模式** — 类型驱动的执行后端选择
2. **BaseWorkspace 5 方法 ABC** — 覆盖最小工作区需求
3. **Generator-based 流式协议** — 优雅封装 start-then-poll 模式
4. **WebSocket + 重连退避** — 生产级事件流客户端
5. **延迟初始化 (deferred_init)** — 必备的 Cloud Auto-scaling 模式

### 9.2 改造（ADAPT）

1. **Workspace 抽象**：增加 `stream_command` / `stream_diff` / 增量文件同步接口
2. **State 同步**：增加 RoboThree 自己的 SDK/Server Schema 兼容层（OpenHands 的 Schema 必须严格匹配，这是个隐患）
3. **错误恢复**：扩展致命错误代码以区分可恢复 vs 不可恢复

### 9.3 拒绝（REJECT）

1. **LookupSecret 仅针对 Agent Server** — RoboThree 应支持更通用的密钥委托协议（OIDC-style token exchange）

## 10. 验证证据

| 主张 | 证据文件 | Symbol | 行 |
| --- | --- | --- | --- |
| 工厂模式 | conversation.py | `Conversation.__new__` | 122-235 |
| ABC 抽象 | base.py | `BaseWorkspace` | 23-182 |
| Generator 协议 | remote_workspace_mixin.py | `_execute_command_generator` | 67-200 |
| WS 重连退避 | remote_conversation.py | `WebSocketCallbackClient._client_loop` | 201-263 |
| 致命错误码 | remote_conversation.py | `FATAL_WS_CLOSE_CODES` | 67 |
| 延迟初始化 | api.py | `api_lifespan` | 127-272 |
| Cookie 认证 | api.py | `_add_api_routes` | 367-378 |
| LookupSecret | remote/base.py | `get_secrets` | 433-485 |