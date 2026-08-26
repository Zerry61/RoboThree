# Architecture — OpenCode

> **Target Ref**: commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
> **Method**: 静态源码分析（无运行时验证）

## 1. 总体架构

OpenCode 是单进程单二进制 Go 应用，整体结构如下：

```
┌────────────────────────────────────────────────────────┐
│ main.go → cmd.Execute()                                │
├────────────────────────────────────────────────────────┤
│ cmd/root.go (Cobra root)                               │
│ ┌──────────────────┐  ┌──────────────────────────────┐ │
│ │ Non-interactive  │  │ Interactive (Bubble Tea TUI) │ │
│ │ App.RunNon-      │  │ tui.New(app)                 │ │
│ │ Interactive()    │  │                              │ │
│ └──────────────────┘  └──────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│ internal/app — App container (services + LSP clients)  │
│ ┌──────────┬───────────┬──────────┬─────────────────┐  │
│ │ session  │ message   │ history  │ permission      │  │
│ │ service  │ service   │ service  │ service         │  │
│ ├──────────┴───────────┴──────────┴─────────────────┤  │
│ │ coderAgent (agent.Service)                       │  │
│ ├──────────────────────────────────────────────────┤  │
│ │ LSP clients (map[string]*lsp.Client)             │  │
│ └──────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────┤
│ internal/llm/agent — Agent Runtime + Tool Dispatch     │
│ ┌────────────────┬─────────────────┬───────────────┐  │
│ │ process-       │ streamAnd-      │ process-      │  │
│ │ Generation     │ HandleEvents    │ Event         │  │
│ └────────────────┴─────────────────┴───────────────┘  │
├────────────────────────────────────────────────────────┤
│ internal/llm/provider — Provider 抽象 + 8+ 实现         │
│ ┌────────┬─────────┬────────┬─────────┬─────────────┐  │
│ │Anthropic│ OpenAI │ Gemini │ Bedrock │ Copilot ... │  │
│ └────────┴─────────┴────────┴─────────┴─────────────┘  │
├────────────────────────────────────────────────────────┤
│ internal/llm/tools — Built-in ToolSet                  │
│ Bash / Edit / Fetch / Glob / Grep / LS / Sourcegraph / │
│ View / Patch / Write / Agent / MCP / LSP diagnostics   │
├────────────────────────────────────────────────────────┤
│ internal/db — SQLite + Goose migrations + sqlc         │
└────────────────────────────────────────────────────────┘
```

**[F]** 入口：[main.go:8-14](../../sources/opencode/main.go#L8-L14) → [cmd/root.go:24-184](../../sources/opencode/cmd/root.go#L24-L184)。

## 2. 进程模型

**[F]** OpenCode 是单进程多 goroutine：

- `cmd.Execute()` 启动顺序：[cmd/root.go:60-122](../../sources/opencode/cmd/root.go#L60-L122)。
- 5 个订阅 goroutine：[cmd/root.go:255-259](../../sources/opencode/cmd/root.go#L255-L259)。
- TUI message handler goroutine：[cmd/root.go:131-153](../../sources/opencode/cmd/root.go#L131-L153)。
- MCP discovery goroutine：[cmd/root.go:195-207](../../sources/opencode/cmd/root.go#L195-L207)。
- LSP init goroutine：[internal/app/app.go:60](../../sources/opencode/internal/app/app.go#L60)。
- 每个 agent `Run()` 启动一个 processGeneration goroutine：[internal/llm/agent/agent.go:210-229](../../sources/opencode/internal/llm/agent/agent.go#L210-L229)。
- 每个 Persistent Shell 启动 processCommands + cmd.Wait goroutine：[internal/llm/tools/shell/shell.go:109-127](../../sources/opencode/internal/llm/tools/shell/shell.go#L109-L127)。

**[I]** 由于共享 `sync.Map`、`sync.RWMutex` 与 channel 缓冲，进程内事件流是异步且可能丢消息的（见 § 8）。

## 3. 服务拆分（App 内部）

**[F]** [internal/app/app.go:25-40](../../sources/opencode/internal/app/app.go#L25-L40) `App` struct：

| Service | 类型 | 职责 |
|---|---|---|
| `Sessions` | `session.Service` | Session CRUD、Task Session、Token/Cost 累计 |
| `Messages` | `message.Service` | Message CRUD、Parts 序列化 |
| `History` | `history.Service` | 文件历史版本（按 session） |
| `Permissions` | `permission.Service` | Permission 请求/响应/持久化 |
| `CoderAgent` | `agent.Service` | Agent Runtime、Provider 调度、Tool Dispatch |
| `LSPClients` | `map[string]*lsp.Client` | 异步初始化的 LSP 客户端 |

**[I]** App 持有 LSP clients 与 watcher cancel funcs，用于 Shutdown 时清理 goroutine。

## 4. Agent 主循环

详细调用链见 [runtime-sequence.md](runtime-sequence.md) 与 [agent-loop-tool-dispatch-l3.md](agent-loop-tool-dispatch-l3.md)。摘要：

**[F]** [internal/llm/agent/agent.go:233-311](../../sources/opencode/internal/llm/agent/agent.go#L233-L311) `processGeneration`：

1. `messages.List(ctx, sessionID)` 读已有历史。
2. 历史为空时异步 `generateTitle`（[agent.go:240-250](../../sources/opencode/internal/llm/agent/agent.go#L240-L250)）。
3. `sessions.Get(ctx, sessionID)` 拿 session。
4. 如果 `SummaryMessageID != ""`：截断历史到 summary，并把 summary message role 改为 `message.User`（[agent.go:255-267](../../sources/opencode/internal/llm/agent/agent.go#L255-L267)）。
5. `createUserMessage` 写新 user 消息。
6. 循环 `streamAndHandleEvents`：
   - 每次迭代先检查 `ctx.Done()`。
   - `provider.StreamResponse` 返回 channel，逐 event `processEvent`。
   - 结束后串行执行 tool calls；permission deny 时取消后续 tool calls 并标记 `FinishReasonPermissionDenied`。
   - 如果 finish reason 是 `tool_use` 且有 tool results，把 assistant + tool message 加进 `msgHistory`，继续下一轮。
   - 否则返回 `AgentEventTypeResponse`。

**[I]** 关键设计：tool call 在单轮内**串行**执行，不并发批处理；permission deny 会**取消同批剩余 tool calls**而非整轮。

## 5. Provider 抽象

**[F]** [internal/llm/provider/provider.go:53-59](../../sources/opencode/internal/llm/provider/provider.go#L53-L59)：

```go
type Provider interface {
    SendMessages(ctx context.Context, messages []message.Message, tools []tools.BaseTool) (*ProviderResponse, error)
    StreamResponse(ctx context.Context, messages []message.Message, tools []tools.BaseTool) <-chan ProviderEvent
    Model() models.Model
}
```

**[F]** 9 个 Provider 实现（[provider.go:86-167](../../sources/opencode/internal/llm/provider/provider.go#L86-L167)）：

| Provider | 实现路径 | 备注 |
|---|---|---|
| Anthropic | `anthropic.go` | 真实流式；支持 ephemeral cache control；429/529 重试最多 8 次 |
| OpenAI | `openai.go` | Chat Completion 流式；429/500 重试最多 8 次 |
| Google Gemini | `gemini.go` | — |
| AWS Bedrock | `bedrock.go` | — |
| GitHub Copilot | `copilot.go` | — |
| Azure OpenAI | — | 通过 OpenAI client + 特定 base URL |
| Groq | — | OpenAI client + Groq base URL |
| OpenRouter | — | OpenAI client + OpenRouter base URL + Referer headers |
| xAI | — | OpenAI client + xAI base URL |
| Vertex AI | — | — |
| 本地 OpenAI-compatible | — | `LOCAL_ENDPOINT` 环境变量 |

**[I]** 所有非 OpenAI/Anthropic 协议的 provider 都通过 OpenAI 客户端 + 自定义 base URL 实现；这是常见的"模型市场聚合"做法，但放弃了各家原生 SDK 的优化（如 Anthropic prompt caching 的精确控制）。

## 6. Context Assembly

**[F]** [internal/llm/prompt/prompt.go:15-39](../../sources/opencode/internal/llm/prompt/prompt.go#L15-L39) `GetAgentPrompt`：

- Coder / Task agent 在 base prompt 后追加 project-specific context。
- Title / Summarizer agent 不追加。

**[F]** [internal/llm/prompt/prompt.go:46-58](../../sources/opencode/internal/llm/prompt/prompt.go#L46-L58) `getContextFromPaths`：

- `sync.Once` 保证进程内只加载一次。
- 默认路径（[internal/config/config.go:82-119](../../sources/opencode/internal/config/config.go#L82-L119)）：
  - `.github/copilot-instructions.md`
  - `.cursorrules`
  - `.cursor/rules/`
  - `CLAUDE.md`
  - `CLAUDE.local.md`
  - `opencode.md`
  - 大小写变体。

**[I]** **关键推断**：

- 没有文件大小限制 / token 预算 / 敏感内容过滤（[prompt.go:131-137](../../sources/opencode/internal/llm/prompt/prompt.go#L131-L137) 直接 `os.ReadFile` + 拼接）。
- 多个 path 并行 goroutine 处理，但**没有显式排序**，输出顺序取决于 channel 接收顺序（[prompt.go:118-128](../../sources/opencode/internal/llm/prompt/prompt.go#L118-L128)）。
- `sync.Once` 是**进程级缓存**：第一次加载 working dir 的内容后，整进程复用；如果运行中切换 cwd，会复用旧 context。
- 这三条均属于源码推断，需在 [open-questions.md](open-questions.md) 记录。

## 7. Session / Message / Persistence

### 7.1 数据模型

**[F]** 三张核心表（[internal/db/migrations/20250424200609_initial.sql](../../sources/opencode/internal/db/migrations/20250424200609_initial.sql)）：

- `sessions`：消息计数、token、cost、summary marker。
- `messages`：role、parts JSON、model、finished_at。
- `files`：session_id、path、content、version。
- 外键级联删除。
- trigger 维护 `MessageCount` 与 `UpdatedAt`。

**[F]** [internal/db/migrations/20250515105448_add_summary_message_id.sql](../../sources/opencode/internal/db/migrations/20250515105448_add_summary_message_id.sql#L1-L8)：

```sql
ALTER TABLE sessions ADD COLUMN summary_message_id TEXT;
```

### 7.2 Message Parts

**[F]** [internal/message/message.go:162-280](../../sources/opencode/internal/message/message.go#L162-L280) ContentPart 类型标签：

| type tag | Go struct |
|---|---|
| `reasoning` | `ReasoningContent{Reasoning string}` |
| `text` | `TextContent{Text string}` |
| `image_url` | `ImageURLContent{ImageURL message.ImageURL}` |
| `binary` | `BinaryContent{Path, MIMEType, Data}` |
| `tool_call` | `ToolCall{ID, Name, Input, Finished}` |
| `tool_result` | `ToolResult{ToolCallID, Content, Metadata, IsError}` |
| `finish` | `Finish{Reason, Time}` |

**[F]** Parts 持久化为带 type tag 的 JSON（[message.go:56-159](../../sources/opencode/internal/message/message.go#L56-L159)）。

**[I]** **静态发现的潜在 bug**（[message.go](../../sources/opencode/internal/message/message.go)）：

- 在 `unmarshallParts()` 的 `imageURLType` 分支中，代码反序列化 `ImageURLContent` 但**没有把 `part` append 到 `parts`**，导致 image URL part 从数据库读回时丢失。
- 这是静态源码发现，未通过测试验证。在 [open-questions.md](open-questions.md) 标记为 NEEDS_RUNTIME_VERIFY。

## 8. Pubsub / Event Delivery

**[F]** [internal/pubsub/broker.go](../../sources/opencode/internal/pubsub/broker.go) `Broker[T]`：

- 每个 subscriber channel buffer size 64。
- `Publish()` 使用 non-blocking send：subscriber 满时直接 default 分支丢弃事件。

**[F]** [cmd/root.go:233-240](../../sources/opencode/cmd/root.go#L233-L240) TUI 包装：

- subscriber 输出到 `outputCh`（buffer 100）。
- 发送超过 2 秒记录 `"message dropped due to slow consumer"`。
- ctx cancel 时停止。

**[I]** **可靠性风险**：

- 流式 message updates、permission events 或 session updates 在消费者过慢时可能丢失。
- TUI 层额外保护（日志 + timeout 仍会继续），但**业务层无重试**。
- Permission request 的 channel 是 `chan bool, 1` 缓冲 + sync.Map（[permission.go:98-108](../../sources/opencode/internal/permission/permission.go#L98-L108)），如果 TUI 未及时响应会**永久阻塞 tool 执行**。

## 9. Permission System（主报告段落）

详细见 [permission-persistent-shell-l3.md](permission-persistent-shell-l3.md)。本节给出主报告所需结论。

### 9.1 数据结构

**[F]** [internal/permission/permission.go:25-33](../../sources/opencode/internal/permission/permission.go#L25-L33) `PermissionRequest`：

- ID / SessionID / ToolName / Description / Action / Params / Path。

**[F]** [internal/permission/permission.go:44-50](../../sources/opencode/internal/permission/permission.go#L44-L50) `permissionService`：

- `sessionPermissions []PermissionRequest`（持久化授权，进程内）。
- `pendingRequests sync.Map`（待响应请求）。
- `autoApproveSessions []string`（非交互模式自动批准）。

### 9.2 Request 流程

**[F]** [internal/permission/permission.go:74-108](../../sources/opencode/internal/permission/permission.go#L74-L108)：

1. 若 session 在 `autoApproveSessions` → 直接返回 true（**完全绕过权限检查**）。
2. 计算 directory（`filepath.Dir(opts.Path)`，若 `.` 则取 `config.WorkingDirectory()`）。
3. 在 `sessionPermissions` 中查找匹配 (ToolName, Action, SessionID, Path) → 命中返回 true。
4. 否则生成 UUID，存 `pendingRequests`，发布 pubsub event。
5. **阻塞等待 `<-respCh`**（无 timeout，无 context select）。
6. Grant / GrantPersistant / Deny 写入 `respCh` 后返回。

### 9.3 静态发现的弱点

**[I]** 源码层面的可疑实现：

1. **"Wait for the response with a timeout"** 注释与实现不一致（[permission.go:105](../../sources/opencode/internal/permission/permission.go#L105)）；实际**没有 timeout 或 context select**。如果 TUI 未响应会永久阻塞。
2. `sessionPermissions` 与 `autoApproveSessions` 没有锁保护，多 goroutine 并发 append 不安全。
3. 没有 OS sandbox、容器隔离或网络沙箱；唯一边界是 command allowlist 与 path permission。
4. 非交互模式（`--prompt`）会**自动批准所有权限**（[app.go:129](../../sources/opencode/internal/app/app.go#L129) 调用 `AutoApproveSession(sess.ID)`）。
5. 进程重启后 `sessionPermissions` 全部丢失；持久化授权只在本进程内有效。
6. `permissionPath` 使用字符串前缀判断（[write.go:166](../../sources/opencode/internal/llm/tools/write.go#L166) `strings.HasPrefix(filePath, rootDir)`），不是基于 `filepath.Rel` 的目录包含关系，可能误判相邻前缀路径。

## 10. Persistent Shell（主报告段落）

详细见 [permission-persistent-shell-l3.md](permission-persistent-shell-l3.md)。

**[F]** [internal/llm/tools/shell/shell.go:42-58](../../sources/opencode/internal/llm/tools/shell/shell.go#L42-L58) `GetPersistentShell`：

- 进程级 singleton（`sync.Once`）。
- shell path 来自 config / `$SHELL` / `/bin/bash`。
- 默认 args `["-l"]`。

**[F]** [shell.go:61-130](../../sources/opencode/internal/llm/tools/shell/shell.go#L61-L130) `newPersistentShell`：

- `cmd.Dir = cwd`（working dir）。
- `cmd.Env = append(os.Environ(), "GIT_EDITOR=true")`。
- 启动 `processCommands` 与 `cmd.Wait` 两个 goroutine。

**[F]** [shell.go:139-244](../../sources/opencode/internal/llm/tools/shell/shell.go#L139-L244) `execCommand`：

- 通过 stdin 写入 `eval <command> > stdout 2> stderr` 包成 heredoc 形式。
- 每 10ms 轮询 status 文件。
- ctx cancel 或 timeout 触发 `killChildren()`。
- 输出从临时文件读取。

**[F]** [shell.go:246-269](../../sources/opencode/internal/llm/tools/shell/shell.go#L246-L269) `killChildren`：

- `pgrep -P <shell pid>` 找直接子进程。
- 发送 SIGTERM。
- 不递归清理孙子进程。

**[I]** **安全/可靠性观察**：

- 持久化 shell 共享 cwd / env / 命令历史（state 跨调用持久）。
- `eval` 执行模型生成的命令，等价于无沙箱执行任意 shell 命令。
- 命令黑名单只检查 `strings.Fields(command)[0]`（[bash.go:246-251](../../sources/opencode/internal/llm/tools/bash.go#L246-L251)），可被 shell 语法、包装命令或别名绕过。
- `killChildren` 只杀直接子进程；孙子进程成为孤儿。
- `cmd.Env = append(os.Environ(), ...)` 继承全部环境变量，可能包含 Secret。

## 11. Tool Runtime

**[F]** [internal/llm/tools/tools.go](../../sources/opencode/internal/llm/tools/tools.go)：

```go
type BaseTool interface {
    Info() ToolInfo
    Run(ctx context.Context, params ToolCall) (ToolResponse, error)
}
```

**[F]** Coder agent tool list（[internal/llm/agent/tools.go:14-41](../../sources/opencode/internal/llm/agent/tools.go#L14-L41)）：

- Bash / Edit / Fetch / Glob / Grep / LS / Sourcegraph / View / Patch / Write / Agent / MCP tools（动态）/ LSP diagnostics（运行时条件加入）。

**[F]** Task agent tool list（[tools.go:43-51](../../sources/opencode/internal/llm/agent/tools.go#L43-L51)）：

- Glob / Grep / LS / Sourcegraph / View（只读）。

**[I]** MCP tool 没有持久 lifecycle：每次 tool 执行都 `client.NewStdioMCPClient` / `client.NewSSEMCPClient`，调用 `Initialize` + `ListTools`，执行 `CallTool`，最后 `Close`（[mcp-tools.go:86-129](../../sources/opencode/internal/llm/agent/mcp-tools.go#L86-L129)）。高延迟的 stdio 启动会重复发生。

**[F]** MCP discovery 在应用启动时一次性执行（[cmd/root.go:195-207](../../sources/opencode/cmd/root.go#L195-L207) + [mcp-tools.go:169-201](../../sources/opencode/internal/llm/agent/mcp-tools.go#L169-L201)），结果缓存到全局 `mcpTools []tools.BaseTool`；运行时不会刷新。

## 12. Subagent（Agent Tool）

**[F]** [internal/llm/agent/agent-tool.go:43-97](../../sources/opencode/internal/llm/agent/agent-tool.go#L43-L97) `agentTool.Run`：

1. 从 context 取 sessionID/messageID。
2. `agent.NewAgent(config.AgentTask, ...)` 创建 Task agent。
3. `sessions.CreateTaskSession(ctx, call.ID, sessionID, "New Agent Session")` 创建子 session，ID = tool call ID。
4. `agent.Run(ctx, session.ID, params.Prompt)` 同步等待。
5. 将子 session cost 累加到 parent session。
6. 返回子 agent 的最终文本。

**[I]** **多 Agent 性质**：

- **同进程**：Task agent 仍在 opencode 进程内运行。
- **独立 session 数据**：子 session 与父 session 分开持久化。
- **受限 ToolSet**：Task agent 只能用只读搜索工具。
- **同步等待**：`agent.Run()` 返回 channel，父 agent 阻塞直到子 agent 完成。
- **无独立权限域**：Task agent 继承父 session 的 permission service。

## 13. Auto Compact / Summarization

**[F]** [internal/llm/agent/agent.go:535-704](../../sources/opencode/internal/llm/agent/agent.go#L535-L704) `Summarize`：

1. 检查 summarizerProvider；session 不忙。
2. 派生 `summarizeCtx`，存入 `activeRequests[sessionID+"-summarize"]`。
3. 读全部 messages，加 summarization prompt。
4. `summarizerProvider.SendMessages` 非流式生成摘要。
5. 创建 Assistant summary message。
6. `oldSession.SummaryMessageID = msg.ID` 设置原 session 的 summary marker。
7. 重置 `PromptTokens = 0`，累加 summary cost。
8. 发布 progress + 完成事件。

**[F]** TUI 触发（[internal/tui/tui.go:306-341](../../sources/opencode/internal/tui/tui.go#L306-L341)）：

- `startCompactSessionMsg` → `app.CoderAgent.Summarize(ctx, sessionID)`。
- 收到 `AgentEventTypeResponse` 完成事件：
  - 读模型 `ContextWindow`。
  - 计算 `CompletionTokens + PromptTokens`。
  - 达到 `contextWindow * 0.95` 且 `config.Get().AutoCompact` 为真 → 触发 summary。

**[I]** **文档/实现不一致**：

- TUI 文案写"Creating new session..."（[agent.go:636](../../sources/opencode/internal/llm/agent/agent.go#L636) `Progress: "Creating new session..."`）。
- 但实际代码用 `oldSession.ID` 创建 summary message，标记 `oldSession.SummaryMessageID = msg.ID`，**没有创建新 session**。
- README 同样宣称 "compact creates a new session"。
- 这是必须在 [open-questions.md](open-questions.md) 中明确记录的 doc-vs-code discrepancy。

## 14. 配置与模型

**[F]** [internal/config/config.go:82-119](../../sources/opencode/internal/config/config.go#L82-L119)：

- Data / WorkingDir / MCPServers / Providers / LSP / Agents / ContextPaths / TUI / Shell / AutoCompact。

**[F]** [internal/llm/models/models.go:9-22](../../sources/opencode/internal/llm/models/models.go#L9-L22) `Model`：

- ID / Name / Provider / APIModel / CostPer1MIn / CostPer1MOut / CacheCosts / ContextWindow / DefaultMaxTokens / CanReason / SupportsAttachments。

## 15. 部署形态

**[F]** OpenCode 是**本地终端应用**，无服务端组件：

- 数据目录：`<config.DataDir>/opencode.db`，权限 `0o700`。
- 无 server / daemon / cloud sync。
- 无 remote worker。
- 单用户单进程。

## 16. 观察者与可靠性

- 流式事件通过 `pubsub.Broker[AgentEvent]` 与 `pubsub.Broker[PermissionRequest]` 传递（[internal/pubsub/broker.go](../../sources/opencode/internal/pubsub/broker.go)）。
- TUI 包装层 buffer 100 + 2s timeout（[cmd/root.go:233-280](../../sources/opencode/cmd/root.go#L233-L280)）。
- Permission request 使用 sync.Map + buffered channel（[permission.go:98-108](../../sources/opencode/internal/permission/permission.go#L98-L108)），**无 timeout**——TUI 不响应会**永久阻塞 tool**。
- Retry：Anthropic / OpenAI provider 支持 429/500/529 重试，最多 8 次（[provider/anthropic.go](../../sources/opencode/internal/llm/provider/anthropic.go), [provider/openai.go](../../sources/opencode/internal/llm/provider/openai.go)）。
- 没有 DLQ、没有 checkpoint；agent loop 是 forward-only。

## 17. 安全边界总览

**[F]** **唯一的真实安全边界**：

1. Bash command denylist：`curl / wget / nc / telnet / lynx / w3m / links / httpie / xh / http-prompt / chrome / firefox / safari / axel / aria2c / curlie / alias`（[bash.go:41-45](../../sources/opencode/internal/llm/tools/bash.go#L41-L45)）。
2. Bash safe-readonly whitelist：`ls / echo / pwd / date / ...` 开头（[bash.go:47-55](../../sources/opencode/internal/llm/tools/bash.go#L47-L55)）。
3. File write permission：每次 write / edit / patch 都请求用户授权（除非 non-interactive auto-approve）。
4. File read / write mtime check：必须先 read 才能 write / edit（[write.go:127-130](../../sources/opencode/internal/llm/tools/write.go#L127-L130)）。
5. MCP tool execute 之前同样请求 permission（[mcp-tools.go:92-104](../../sources/opencode/internal/llm/agent/mcp-tools.go#L92-L104)）。
6. Network fetch 只允许 http/https（[fetch.go:99-203](../../sources/opencode/internal/llm/tools/fetch.go#L99-L203)），最大 5MB。

**[I]** **没有的安全边界**：

1. 没有 OS sandbox / container / chroot。
2. 没有网络沙箱；fetch tool 默认就允许。
3. 没有 syscall filter / seccomp / AppArmor。
4. 没有磁盘配额 / 资源限额。
5. 没有 secret 扫描；环境变量原样继承到 shell。
6. 没有 audit log；Tool execution 只写入 DB，不单独打 audit。
7. 非交互模式自动批准所有权限（[app.go:129](../../sources/opencode/internal/app/app.go#L129)）。

详细安全分析见 [permission-persistent-shell-l3.md](permission-persistent-shell-l3.md)。