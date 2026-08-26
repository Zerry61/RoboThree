# Source Map — OpenCode

> **Target Ref**: commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
> **Method**: 静态源码分析（无运行时验证）

## 1. 顶层结构

| Path | 角色 | 状态 |
|---|---|---|
| [main.go](../../sources/opencode/main.go) | 程序入口，调用 `cmd.Execute()` | 14 行 |
| [cmd/root.go](../../sources/opencode/cmd/root.go) | Cobra 根命令；交互 / 非交互分发；TUI 订阅 | 309 行 |
| [go.mod](../../sources/opencode/go.mod) | Go module 定义（`github.com/opencode-ai/opencode`） | 33 行 |
| [go.sum](../../sources/opencode/go.sum) | 依赖锁定 | — |
| [README.md](../../sources/opencode/README.md) | 项目说明（含归档声明） | ~90 行 |
| [LICENSE](../../sources/opencode/LICENSE) | MIT 许可证 | 20 行 |
| [opencode-schema.json](../../sources/opencode/opencode-schema.json) | OpenAPI Schema（用于非交互模式输出） | — |
| [sqlc.yaml](../../sources/opencode/sqlc.yaml) | sqlc 配置 | — |
| [install](../../sources/opencode/install) | 安装脚本 | — |
| [scripts/](../../sources/opencode/scripts/) | 辅助脚本 | — |

## 2. internal/ 目录地图

```
internal/
├── app/                     # App 容器 + 非交互 Run
│   ├── app.go               # App struct + New() + RunNonInteractive() + Shutdown()
│   └── ...
├── config/                  # Viper 配置
│   ├── config.go            # Config struct + Load() + Get()
│   └── ...
├── db/                      # SQLite + Goose + sqlc
│   ├── connect.go           # Connect() + 启用 PRAGMAs
│   ├── migrations/          # Goose 迁移
│   │   ├── 20250424200609_initial.sql
│   │   ├── 20250515105448_add_summary_message_id.sql
│   │   └── ...
│   ├── sql/                 # 原始 SQL
│   │   ├── sessions.sql
│   │   ├── messages.sql
│   │   └── files.sql
│   └── sqlc-generated/      # sqlc 自动生成（未单独展开）
├── diff/                    # 文件 diff 工具
├── fileutil/                # 文件工具
├── format/                  # 输出格式化（text / json / spinner）
├── history/                 # 文件历史 Service（每次 write/edit 保存版本）
├── llm/
│   ├── agent/               # Agent Runtime + Tool Dispatch
│   │   ├── agent.go         # Service + processGeneration + streamAndHandleEvents + Summarize
│   │   ├── tools.go         # CoderAgentTools / TaskAgentTools
│   │   ├── agent-tool.go    # Subagent (agent tool)
│   │   └── mcp-tools.go     # MCP 工具动态加载
│   ├── provider/            # Provider 抽象 + 实现
│   │   ├── provider.go      # Provider interface + baseProvider + cleanMessages
│   │   ├── anthropic.go     # Anthropic Claude 实现
│   │   ├── openai.go        # OpenAI Chat Completion 实现
│   │   ├── gemini.go        # Google Gemini 实现
│   │   ├── bedrock.go       # AWS Bedrock 实现
│   │   ├── copilot.go       # GitHub Copilot 实现
│   │   └── ...
│   ├── models/              # 模型元数据 + SupportedModels
│   ├── prompt/              # System prompt 拼接
│   │   ├── prompt.go        # GetAgentPrompt + getContextFromPaths
│   │   ├── coder.go         # CoderPrompt
│   │   ├── task.go          # TaskPrompt
│   │   ├── title.go         # TitlePrompt
│   │   └── summarizer.go    # SummarizerPrompt
│   └── tools/               # Built-in tools
│       ├── tools.go         # BaseTool interface + ContextKey
│       ├── bash.go          # Bash tool（allowlist / denylist / persistent shell）
│       ├── edit.go          # Edit tool（unique old_string + mtime check）
│       ├── fetch.go         # HTTP fetch tool
│       ├── glob.go          # 文件 glob
│       ├── grep.go          # 内容 grep
│       ├── ls.go            # 目录列表
│       ├── sourcegraph.go   # Sourcegraph 查询
│       ├── view.go          # 文件查看
│       ├── patch.go         # 批量 patch
│       ├── write.go         # 文件写入
│       └── shell/           # PersistentShell
│           └── shell.go     # 持久化 shell singleton
├── logging/                 # 结构化日志 + RecoverPanic
├── lsp/                     # LSP 客户端
│   └── ...
├── message/                 # Message Service
│   └── message.go           # ContentPart 类型 + Create/Update/Get/List
├── permission/              # Permission Service
│   └── permission.go        # Request/Grant/Deny + AutoApproveSession
├── pubsub/                  # 事件 broker
│   └── broker.go            # generic Broker[T]
├── session/                 # Session Service
│   └── session.go           # Session struct + Create/Get/List/Save
├── tui/                     # Bubble Tea TUI
│   ├── tui.go               # tui.Model + Init + Update + 事件订阅
│   ├── page/chat.go         # 聊天页面 + 取消 + send
│   ├── components/chat/     # editor, list, message
│   └── ...
└── version/                 # 版本号
```

## 3. 真实入口

### 3.1 程序入口

**[F]** [main.go:8-14](../../sources/opencode/main.go#L8-L14)：

```go
func main() {
    defer logging.RecoverPanic("main", func() {
        logging.ErrorPersist("Application terminated due to unhandled panic")
    })
    cmd.Execute()
}
```

`RecoverPanic` 在 panic 时输出结构化日志；`cmd.Execute()` 是 Cobra 入口。

### 3.2 Cobra 根命令

**[F]** [cmd/root.go:24-184](../../sources/opencode/cmd/root.go#L24-L184)：

- `Use: "opencode"`。
- Flags：`--debug / -d`、`--cwd / -c`、`--prompt / -p`、`--output-format / -f`、`--quiet / -q`、`--version / -v`、`--help / -h`。
- `RunE` 启动顺序：
  1. 解析 flags（[cmd/root.go:60-66](../../sources/opencode/cmd/root.go#L60-L66)）。
  2. 验证 `--output-format`（[cmd/root.go:68-70](../../sources/opencode/cmd/root.go#L68-L70)）。
  3. `os.Chdir(cwd)`（[cmd/root.go:72-77](../../sources/opencode/cmd/root.go#L72-L77)）。
  4. `config.Load(cwd, debug)`（[cmd/root.go:85](../../sources/opencode/cmd/root.go#L85)）。
  5. `db.Connect()` → 启用 SQLite + Goose migrations（[cmd/root.go:91](../../sources/opencode/cmd/root.go#L91)）。
  6. `context.WithCancel`（[cmd/root.go:97](../../sources/opencode/cmd/root.go#L97)）。
  7. `app.New(ctx, conn)`（[cmd/root.go:100](../../sources/opencode/cmd/root.go#L100)）。
  8. `defer app.Shutdown()`（[cmd/root.go:106](../../sources/opencode/cmd/root.go#L106)）。
  9. 异步 `initMCPTools(ctx, app)`（[cmd/root.go:109](../../sources/opencode/cmd/root.go#L109)）。
  10. 分发：非交互 → `app.RunNonInteractive`；交互 → Bubble Tea TUI（[cmd/root.go:111-122](../../sources/opencode/cmd/root.go#L111-L122)）。

### 3.3 TUI 事件订阅

**[F]** [cmd/root.go:249-282](../../sources/opencode/cmd/root.go#L249-L282) `setupSubscriptions`：

- 5 个订阅源：logging / sessions / messages / permissions / coderAgent。
- 每个订阅通过 `setupSubscriber` 转 `tea.Msg`。
- `outputCh` buffer size 100；发送超 2 秒丢弃 + 日志 "message dropped due to slow consumer"（[cmd/root.go:233-240](../../sources/opencode/cmd/root.go#L233-L240)）。
- `cleanupFunc`：cancel → 等待 WaitGroup（最多 5 秒）→ 关闭 channel（[cmd/root.go:261-280](../../sources/opencode/cmd/root.go#L261-L280)）。

### 3.4 MCP 启动

**[F]** [cmd/root.go:195-207](../../sources/opencode/cmd/root.go#L195-L207) `initMCPTools`：

- 30 秒 timeout context。
- 后台 goroutine 调用 `agent.GetMcpTools(ctxWithTimeout, app.Permissions)`。
- `RecoverPanic("MCP-goroutine", nil)` 兜底。

## 4. App 容器

**[F]** [internal/app/app.go:25-40](../../sources/opencode/internal/app/app.go#L25-L40) `App` struct：

```go
type App struct {
    Sessions     session.Service
    Messages     message.Service
    History      history.Service
    Permissions  permission.Service
    CoderAgent   agent.Service
    LSPClients   map[string]*lsp.Client
    clientsMutex         sync.RWMutex
    watcherCancelFuncs   []context.CancelFunc
    cancelFuncsMutex     sync.Mutex
    watcherWG            sync.WaitGroup
}
```

**[F]** [internal/app/app.go:42-81](../../sources/opencode/internal/app/app.go#L42-L81) `New()`：

- `db.New(conn)` 构造 sqlc 查询对象。
- `session.NewService(q)` / `message.NewService(q)` / `history.NewService(q, conn)`。
- `permission.NewPermissionService()` 创建 permission broker。
- `go app.initLSPClients(ctx)` 异步初始化 LSP。
- `agent.NewAgent(config.AgentCoder, ...)` 创建 coder agent。
- `agent.CoderAgentTools(...)` 注入工具集。

## 5. Agent Runtime

**[F]** [internal/llm/agent/agent.go:48-57](../../sources/opencode/internal/llm/agent/agent.go#L48-L57) `Service` interface：

```go
type Service interface {
    pubsub.Suscriber[AgentEvent]
    Model() models.Model
    Run(ctx context.Context, sessionID string, content string, attachments ...message.Attachment) (<-chan AgentEvent, error)
    Cancel(sessionID string)
    IsSessionBusy(sessionID string) bool
    IsBusy() bool
    Update(agentName config.AgentName, modelID models.ModelID) (models.Model, error)
    Summarize(ctx context.Context, sessionID string) error
}
```

## 6. Provider 抽象

**[F]** [internal/llm/provider/provider.go:12-57](../../sources/opencode/internal/llm/provider/provider.go#L12-L57)：

事件类型：

| Event Type | 来源 |
|---|---|
| `EventContentStart` | 流开始 |
| `EventToolUseStart` | tool call 开始 |
| `EventToolUseDelta` | tool call 增量（当前未处理，见注释） |
| `EventToolUseStop` | tool call 结束 |
| `EventContentDelta` | 内容增量 |
| `EventThinkingDelta` | 思考增量 |
| `EventContentStop` | 流结束 |
| `EventComplete` | 完成（含 usage / finish reason） |
| `EventError` | 错误 |
| `EventWarning` | 警告 |

`Provider` interface：

```go
type Provider interface {
    SendMessages(ctx context.Context, messages []message.Message, tools []tools.BaseTool) (*ProviderResponse, error)
    StreamResponse(ctx context.Context, messages []message.Message, tools []tools.BaseTool) <-chan ProviderEvent
    Model() models.Model
}
```

## 7. Tool Runtime

**[F]** [internal/llm/tools/tools.go](../../sources/opencode/internal/llm/tools/tools.go)：

```go
type BaseTool interface {
    Info() ToolInfo
    Run(ctx context.Context, params ToolCall) (ToolResponse, error)
}
```

ContextKey：

- `tools.SessionIDContextKey`
- `tools.MessageIDContextKey`

Coder agent tool list（[internal/llm/agent/tools.go:13-50](../../sources/opencode/internal/llm/agent/tools.go#L13-L50)）：

- Bash / Edit / Fetch / Glob / Grep / LS / Sourcegraph / View / Patch / Write / Agent / MCP 动态工具 / LSP diagnostics（当 LSP 已就绪）。

Task agent tool list：

- Glob / Grep / LS / Sourcegraph / View（只读搜索）。

## 8. Permission

**[F]** [internal/permission/permission.go:44-50](../../sources/opencode/internal/permission/permission.go#L44-L50)：

```go
type permissionService struct {
    *pubsub.Broker[PermissionRequest]
    sessionPermissions  []PermissionRequest
    pendingRequests     sync.Map
    autoApproveSessions []string
}
```

`pendingRequests` 是 `sync.Map[permissionID, chan bool]`；tool 阻塞等待 `<-respCh`。

## 9. Session / Message

**[F]** [internal/session/session.go:11-33](../../sources/opencode/internal/session/session.go#L11-L33) `Session`：

- ID / ParentSessionID / Title / MessageCount / PromptTokens / CompletionTokens / SummaryMessageID / Cost / CreatedAt / UpdatedAt。

**[F]** [internal/message/message.go:162-280](../../sources/opencode/internal/message/message.go#L162-L280) `ContentPart` 类型标签：

| Type tag | Go struct |
|---|---|
| `reasoning` | `ReasoningContent` |
| `text` | `TextContent` |
| `image_url` | `ImageURLContent` |
| `binary` | `BinaryContent` |
| `tool_call` | `ToolCall` |
| `tool_result` | `ToolResult` |
| `finish` | `Finish` |

## 10. 数据库

**[F]** [internal/db/connect.go:1-66](../../sources/opencode/internal/db/connect.go#L1-L66)：

- `dataDir` 创建权限 `0o700`。
- DB path：`<dataDir>/opencode.db`。
- 启用：`foreign_keys`、`journal_mode=WAL`、`page_size=4096`、`cache_size`、`synchronous=NORMAL`。
- Goose 自动运行 migrations。

**[F]** [internal/db/migrations/20250424200609_initial.sql](../../sources/opencode/internal/db/migrations/20250424200609_initial.sql)：

- `sessions` 表：MessageCount / PromptTokens / CompletionTokens / Cost / SummaryMessageID / CreatedAt / UpdatedAt。
- `messages` 表：role / parts JSON / model / finished_at。
- `files` 表：session_id / path / content / version。
- 外键级联删除。
- trigger 维护 `MessageCount` 与 `UpdatedAt`。

**[F]** [internal/db/migrations/20250515105448_add_summary_message_id.sql](../../sources/opencode/internal/db/migrations/20250515105448_add_summary_message_id.sql)：

- 为 `sessions` 添加 `summary_message_id TEXT` 列。

## 11. 关键测试

**[UNKNOWN]** 本次研究未发现 `*_test.go` 文件包含目标路径；在 `sources/opencode/` 中也未单独覆盖测试目录。本次静态分析未将测试代码纳入证据。