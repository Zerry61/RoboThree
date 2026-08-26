# deployment-model.md — 部署模型

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 1. 部署架构

```
┌──────────────────────────────────────────────────────────┐
│                     Client SDK                            │
│  Conversation(agent, workspace=LocalWorkspace)            │
│  → LocalConversation: 本地执行                            │
│                                                           │
│  Conversation(agent, workspace=RemoteWorkspace)            │
│  → RemoteConversation: WebSocket 连接 Agent Server        │
└──────────────┬───────────────────────────────────────────┘
               │ WebSocket (wss://)
┌──────────────▼───────────────────────────────────────────┐
│                  Agent Server                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │ REST API     │  │ WebSocket     │  │ OpenAI API     │   │
│  │ (CRUD)       │  │ (Event Stream)│  │ (兼容)         │   │
│  └─────────────┘  └──────────────┘  └────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │              ConversationService                    │   │
│  │  create/run/resume/delete/webhook/lease             │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │              EventService (PubSub)                  │   │
│  │  subscribe/publish/broadcast                        │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## 2. Agent Server 细节

### 2.1 FastAPI 应用结构

Agent Server 是 FastAPI 应用，通过 `create_app()` 工厂构建：

```python
api = create_app(config)  # 包含所有路由
```

路由注册：
- `/api/conversations/*` — CRUD
- `/api/events/*` — Server-Sent Events 流
- `/api/files/*` / `/api/git/*` — 文件/版本控制操作
- `/api/tools/*` / `/api/bash/*` — 工具/终端访问
- `/api/skills/*` / `/api/plugins/*` / `/api/hooks/*` — 扩展管理
- `/api/llm/*` / `/api/profiles/*` — LLM 管理
- `/api/workspaces/*` — Workspace 文件访问（Cookie/Header 双认证）
- `/api/mcp/*` — MCP 管理
- `/api/settings/*` — 设置
- `/api/sub-agents/*` — Subagent 管理
- `/api/auth/*` — Cookie 认证生成
- `/api/init` — 延迟初始化（X-Init-API-Key 认证）
- `/openai/*` — OpenAI 兼容 API（OpenAI API Key 认证）
- WebSocket `ws://.../ws` — 实时事件流

证据 — [api.py:318-380](openhands-agent-server/openhands/agent_server/api.py#L318-L380)

### 2.2 双认证模式

| 路由组 | 认证方式 |
| --- | --- |
| `/api/*` | `X-Session-API-Key` Header（防止 CSRF） |
| `/api/workspaces/*` | `X-Session-API-Key` Header **或** Workspace Session Cookie |
| `/api/init` | `X-Init-API-Key` Header（初始配置） |
| `/openai/*` | OpenAI API Key |
| WebSocket | `X-Session-API-Key` |

Workspace 路由同时接受 Cookie 是因为 `<iframe>` / `<img>` 嵌入无法附加自定义 Header。[F]

### 2.3 延迟初始化模式

`deferred_init` 模式下：
1. Server 启动但不加载 ConversationService
2. 等待 `POST /api/init` 传入运行时配置（LLM 密钥等）
3. 初始化完成后标记 ready
4. 在此之前所有 `/api/*` 路由返回 503

适用于 warm-pool 部署场景。[F]

证据 — [api.py:216-231](openhands-agent-server/openhands/agent_server/api.py#L216-L231)

### 2.4 Conversation 生命周期

```
POST /api/conversations     → 创建会话
POST /.../send_message      → 发送消息
POST /.../run               → 启动 Agent（异步后台）
WebSocket /ws               → 实时事件流订阅
GET  /.../events            → SSE 事件流
POST /.../interrupt         → 中断运行中的 Agent
POST /.../pause             → 暂停
DELETE /...                 → 删除
```

### 2.5 会话租约

- `ConversationLease` 机制防止多个 Agent Server 实例同时操作同一会话
- 租约 TTL 默认可配（`DEFAULT_LEASE_TTL_SECONDS`）
- 自动续租（`LEASE_RENEW_INTERVAL_SECONDS`）

证据 — [conversation_lease.py](openhands-agent-server/openhands/agent_server/conversation_lease.py)

## 3. Workspace 隔离策略

### 3.1 Git Worktree 隔离

Agent Server 可为每个 Conversation 创建独立的 git worktree：

```
/tmp/conversation-worktrees/<conversation_id>/
  └── <repo_name>/    # git worktree
```

- 从 `origin/<default_branch>` 分支创建
- 自动 `git fetch origin` 获取最新
- 分支命名：`openhands/<conversation_id>`

证据 — [conversation_service.py:173-200](openhands-agent-server/openhands/agent_server/conversation_service.py#L173-L200)

### 3.2 Ephemeral Workspace

Docker 后端支持临时工作区：
- 为每个会话创建临时容器
- 会话结束后容器销毁
- 支持 volume 挂载持久化

## 4. RemoteConversation 客户端

`RemoteConversation` 通过 WebSocket 连接 Agent Server：
- 订阅事件流
- 发送消息通过 REST API
- 状态同步通过 `ConversationStateUpdateEvent`
- 断线重连机制

## 5. RoboThree 启示

| 方面 | 评价 | 建议 |
| --- | --- | --- |
| Local/Remote 统一接口 | `Conversation` 工厂根据 Workspace 类型自动切换 | ADOPT — 核心设计模式 |
| Workspace 抽象 | `BaseWorkspace` ABC + 5 种后端 | ADAPT — 接口设计可直接参考 |
| Git Worktree 隔离 | 每个会话独立分支，安全且可审计 | ADOPT — 对代码 Agent 特别有价值 |
| 延迟初始化 | warm-pool 部署的关键使能模式 | ADAPT — 适合 Cloud Worker |
| 会话租约 | 防止多实例并发操作 | ADAPT — 分布式 Worker 所需 |
| EventService PubSub | 内存级事件总线 | 需补充持久化消息队列 |
