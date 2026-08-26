# Deep Dive 3: Session / Context Pipeline / Auto-Compact

> L3 Mechanism #3 | commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
> Method: 静态源码分析（无运行时验证）

## 1. Executive Summary

OpenCode 的 Session / Context / Auto-Compact 系统是它 context window 治理的全部能力。核心机制：

1. **SQLite 持久化**：sessions / messages / files 三张表 + Goose migrations。
2. **Message Parts 序列化**：role + JSON(parts) 存储；ContentPart 用 type tag 区分 reasoning / text / image / binary / tool_call / tool_result / finish。
3. **Context Assembly**：每次 Run 从 SQLite 读历史 → 截断到 SummaryMessageID → 追加新 user message → 调 Provider。
4. **Project Context Files**：`sync.Once` 一次性加载 CLAUDE.md / opencode.md / .cursorrules 等，注入 system prompt。
5. **Auto Compact**：95% context window 阈值触发 summarizer Provider；写 summary message + 设置 `SummaryMessageID`；下一轮从 summary 截断。
6. **Subagent Session**：parent_session_id 关联 + 独立 cost 累计。

这一组合的关键限制：

- **同步阻塞**：`sync.Once` 全局缓存 + `sync.WaitGroup` file loading。
- **无并发 / 多 session 隔离**：process-level cache 跨 session 复用。
- **Doc-vs-Code 不一致**：TUI 文案与 README 都说"compact creates a new session"，但实现是 in-place summary marker。

## 2. Session 数据模型

### 2.1 Session Struct

**[F]** [internal/session/session.go:11-33](../../sources/opencode/internal/session/session.go#L11-L33)：

```go
type Session struct {
    ID                string
    ParentSessionID   string
    Title             string
    MessageCount      int64
    PromptTokens      int64
    CompletionTokens  int64
    SummaryMessageID  string
    Cost              float64
    CreatedAt         int64
    UpdatedAt         int64
}
```

### 2.2 Service 接口

**[F]** [internal/session/session.go:35-155](../../sources/opencode/internal/session/session.go#L35-L155)：

| 方法 | 用途 |
|---|---|
| `Create(ctx, title)` | 创建根 session |
| `CreateTitleSession(ctx, parentID, title)` | 创建 title 派生 session（实际未在 agent.go 中调用） |
| `CreateTaskSession(ctx, id, parentID, title)` | 创建 task 子 session，ID 直接用 tool call ID |
| `Get(ctx, id)` | 按 ID 查 |
| `List(ctx)` | 列**所有根 session**（`parent_session_id IS NULL`） |
| `Save(ctx, sess)` | 更新 title / tokens / summary_message_id / cost |
| `Delete(ctx, id)` | 删除（外键级联删 messages / files） |

**[F]** 普通 session ID 是 UUID（`uuid.New()`）；task session ID 是 tool call ID（直接复用，避免生成新 ID）。

### 2.3 数据库表

**[F]** [internal/db/migrations/20250424200609_initial.sql](../../sources/opencode/internal/db/migrations/20250424200609_initial.sql#L2-L97)：

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    parent_session_id TEXT,
    title TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    parts TEXT NOT NULL,    -- 带 type tag 的 JSON
    model TEXT,
    finished_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE files (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

**[F]** 配套 trigger：

- `messages_after_insert` 维护 `sessions.message_count`。
- `sessions_after_update` 维护 `sessions.updated_at`。

### 2.4 SummaryMessageID Migration

**[F]** [internal/db/migrations/20250515105448_add_summary_message_id.sql](../../sources/opencode/internal/db/migrations/20250515105448_add_summary_message_id.sql#L1-L8)：

```sql
ALTER TABLE sessions ADD COLUMN summary_message_id TEXT;
```

**[I]** 这一列专门为 summary 设计；其他字段在 initial migration 已有。

## 3. Message Parts

### 3.1 ContentPart 类型

**[F]** [internal/message/message.go:162-280](../../sources/opencode/internal/message/message.go#L162-L280)：

| type tag | Go struct | 字段 |
|---|---|---|
| `reasoning` | `ReasoningContent` | `Reasoning string` |
| `text` | `TextContent` | `Text string` |
| `image_url` | `ImageURLContent` | `ImageURL ImageURL{URL, Detail}` |
| `binary` | `BinaryContent` | `Path, MIMEType, Data string` |
| `tool_call` | `ToolCall` | `ID, Name, Input string, Finished bool` |
| `tool_result` | `ToolResult` | `ToolCallID, Content string, Metadata string, IsError bool` |
| `finish` | `Finish` | `Reason FinishReason, Time int64` |

### 3.2 Message Service

**[F]** [internal/message/message.go:15-29](../../sources/opencode/internal/message/message.go#L15-L29)：

```go
type CreateMessageParams struct {
    Role  message.MessageRole
    Parts []message.ContentPart
    Model models.ModelID
}
```

**[F]** [message.go:56-159](../../sources/opencode/internal/message/message.go#L56-L159)：

- `Create` 把 `[]ContentPart` 包成带 type tag 的 JSON：`{"type": "text", "data": "..."}`。
- 非 Assistant 消息在 Create 时**自动追加** `Finish{Reason: "stop"}`。
- `Update` 把 Parts 重新序列化。
- `finished_at` 根据 Finish part 设置。
- `List` 按 session 查 + 反序列化 ContentPart。

### 3.3 静态发现的 Bug

**[I]** 在 `unmarshallParts()` 的 `imageURLType` 分支中：

- 代码构造 `ImageURLContent` 并 `json.Unmarshal`。
- 但**没有把 `part` append 到 `parts` slice**。
- 结果：从 DB 读回时，image URL part 丢失。
- 影响：多模态交互（用户上传图片 → 模型看图 → 模型回图）可能失效。
- **置信度**：MEDIUM（静态发现；未通过测试验证）。
- **How to Close**：跑单元测试或写 PoC。

## 4. Context Assembly

### 4.1 流程

```
每次 Run(ctx, sessionID, content, attachments)
  1. messages.List(ctx, sessionID)             ← 读所有历史
  2. if len(msgs) == 0 { 异步 generateTitle }  ← 首次会话
  3. sessions.Get(ctx, sessionID)
  4. if SummaryMessageID != "":
       msgs = msgs[summaryIndex:]              ← 截断到 summary
       msgs[0].Role = User                     ← summary 当作 user
  5. createUserMessage(ctx, ...)               ← 写新 user message
  6. msgHistory = append(msgs, userMsg)
  7. while not done:
       streamAndHandleEvents(ctx, msgHistory)
       if tool_use + tool_results: continue
       else: return final response
```

**[F]** 关键代码：[internal/llm/agent/agent.go:233-311](../../sources/opencode/internal/llm/agent/agent.go#L233-L311)。

### 4.2 Summary 截断

**[F]** [agent.go:255-267](../../sources/opencode/internal/llm/agent/agent.go#L255-L267)：

```go
if session.SummaryMessageID != "" {
    summaryMsgInex := -1
    for i, msg := range msgs {
        if msg.ID == session.SummaryMessageID {
            summaryMsgInex = i
            break
        }
    }
    if summaryMsgInex != -1 {
        msgs = msgs[summaryMsgInex:]
        msgs[0].Role = message.User      // ← summary message role 改为 User
    }
}
```

**[I]** **设计语义**：

- 把 summary message 当作本轮第一个 User 消息。
- 后续历史从 summary 开始。
- 模型的视野中，"summary 之前"的历史**完全丢失**。
- 没有保留 recent messages + summary 的 hybrid 模式。

### 4.3 Provider 端 cleanMessages

**[F]** [internal/llm/provider/provider.go:170-179](../../sources/opencode/internal/llm/provider/provider.go#L170-L179)：

```go
func (p *baseProvider[C]) cleanMessages(messages []message.Message) (cleaned []message.Message) {
    for _, msg := range messages {
        if len(msg.Parts) == 0 { continue }   // 丢掉空 message
        cleaned = append(cleaned, msg)
    }
    return
}
```

**[I]** **关键过滤**：

- 丢弃没有任何 parts 的 message。
- 这避免了"空 user message"或"空 tool message"被发给 Provider。

### 4.4 attachments 处理

**[F]** [internal/llm/agent/agent.go:199-201](../../sources/opencode/internal/llm/agent/agent.go#L199-L201)：

```go
if !a.provider.Model().SupportsAttachments && attachments != nil {
    attachments = nil
}
```

**[F]** [agent.go:215-218](../../sources/opencode/internal/llm/agent/agent.go#L215-L218)：

```go
var attachmentParts []message.ContentPart
for _, attachment := range attachments {
    attachmentParts = append(attachmentParts, message.BinaryContent{Path: attachment.FilePath, MIMEType: attachment.MimeType, Data: attachment.Content})
}
```

**[I]** **Attachments 转 BinaryContent**：

- 用户上传的 attachments 被包装成 `BinaryContent` part，存入 user message。
- Provider 端再转成对应 provider 协议（Anthropic blocks、OpenAI image_url 等）。

## 5. Project Context Files

### 5.1 默认路径

**[F]** [internal/config/config.go:82-119](../../sources/opencode/internal/config/config.go#L82-L119)：

```text
.github/copilot-instructions.md
.cursorrules
.cursor/rules/
CLAUDE.md
CLAUDE.local.md
opencode.md
(大小写变体)
```

### 5.2 加载流程

**[F]** [internal/llm/prompt/prompt.go:15-39](../../sources/opencode/internal/llm/prompt/prompt.go#L15-L39)：

```go
func GetAgentPrompt(agentName config.AgentName, provider models.ModelProvider) string {
    basePrompt := ""
    switch agentName {
    case config.AgentCoder:        basePrompt = CoderPrompt(provider)
    case config.AgentTitle:        basePrompt = TitlePrompt(provider)
    case config.AgentTask:         basePrompt = TaskPrompt(provider)
    case config.AgentSummarizer:   basePrompt = SummarizerPrompt(provider)
    }

    if agentName == config.AgentCoder || agentName == config.AgentTask {
        contextContent := getContextFromPaths()
        if contextContent != "" {
            return fmt.Sprintf("%s\n\n# Project-Specific Context\n Make sure to follow the instructions in the context below\n%s", basePrompt, contextContent)
        }
    }
    return basePrompt
}
```

**[F]** [prompt.go:46-58](../../sources/opencode/internal/llm/prompt/prompt.go#L46-L58)：

```go
var (
    onceContext    sync.Once
    contextContent string
)

func getContextFromPaths() string {
    onceContext.Do(func() {
        cfg := config.Get()
        workDir := cfg.WorkingDir
        contextPaths := cfg.ContextPaths
        contextContent = processContextPaths(workDir, contextPaths)
    })
    return contextContent
}
```

**[F]** [prompt.go:60-129](../../sources/opencode/internal/llm/prompt/prompt.go#L60-L129)：

```go
func processContextPaths(workDir string, paths []string) string {
    var (
        wg       sync.WaitGroup
        resultCh = make(chan string)
    )

    processedFiles := make(map[string]bool)
    var processedMutex sync.Mutex

    for _, path := range paths {
        wg.Add(1)
        go func(p string) {
            defer wg.Done()
            if strings.HasSuffix(p, "/") {
                filepath.WalkDir(filepath.Join(workDir, p), func(path string, d os.DirEntry, err error) error {
                    if err != nil { return err }
                    if !d.IsDir() {
                        processedMutex.Lock()
                        lowerPath := strings.ToLower(path)
                        if !processedFiles[lowerPath] {
                            processedFiles[lowerPath] = true
                            processedMutex.Unlock()
                            if result := processFile(path); result != "" {
                                resultCh <- result
                            }
                        } else {
                            processedMutex.Unlock()
                        }
                    }
                    return nil
                })
            } else {
                fullPath := filepath.Join(workDir, p)
                processedMutex.Lock()
                lowerPath := strings.ToLower(fullPath)
                if !processedFiles[lowerPath] {
                    processedFiles[lowerPath] = true
                    processedMutex.Unlock()
                    result := processFile(fullPath)
                    if result != "" {
                        resultCh <- result
                    }
                } else {
                    processedMutex.Unlock()
                }
            }
        }(path)
    }

    go func() {
        wg.Wait()
        close(resultCh)
    }()

    results := make([]string, 0)
    for result := range resultCh {
        results = append(results, result)
    }
    return strings.Join(results, "\n")
}

func processFile(filePath string) string {
    content, err := os.ReadFile(filePath)
    if err != nil { return "" }
    return "# From:" + filePath + "\n" + string(content)
}
```

### 5.3 静态发现的弱点

**[I]** 1. **`sync.Once` 全局缓存**：

- 进程级只加载一次。
- 如果用户切换 `--cwd`，但进程内继续运行，`onceContext.Do` 不再触发。
- 工作dir 切换 → context 内容仍为旧 working dir。

**[I]** 2. **无 token / 大小预算**：

- `processFile` 直接 `os.ReadFile` + 拼接。
- 没有 `len(content) > N` 检查。
- 没有按 token 截断。
- 巨型 CLAUDE.md 会撑爆 system prompt。

**[I]** 3. **无敏感内容过滤**：

- 直接拼接。
- 如果 CLAUDE.md 含 Secret，会被发给模型。
- 实际模型可能将这些 Secret 复制到 tool call input（如 `git commit`）。

**[I]** 4. **并行加载顺序未定义**：

- 多个 path 并行 goroutine + channel 收集。
- channel 接收顺序由 goroutine 完成顺序决定。
- 不同启动可能产生不同 system prompt。
- 对模型而言，context 顺序变化可能造成行为差异。

**[I]** 5. **大小写不敏感去重**：

- `lowerPath := strings.ToLower(path)`。
- case-insensitive 去重，但 Linux 文件系统是 case-sensitive。
- 在 macOS / Windows 上可能有意外去重。

## 6. Auto Compact / Summarization

### 6.1 触发条件

**[F]** [internal/tui/tui.go:323-344](../../sources/opencode/internal/tui/tui.go#L323-L344)：

```go
case pubsub.Event[agent.AgentEvent]:
    payload := msg.Payload
    if payload.Error != nil {
        a.isCompacting = false
        return a, util.ReportError(payload.Error)
    }
    a.compactingMessage = payload.Progress
    if payload.Done && payload.Type == agent.AgentEventTypeSummarize {
        a.isCompacting = false
        return a, util.ReportInfo("Session summarization complete")
    } else if payload.Done && payload.Type == agent.AgentEventTypeResponse && a.selectedSession.ID != "" {
        model := a.app.CoderAgent.Model()
        contextWindow := model.ContextWindow
        tokens := a.selectedSession.CompletionTokens + a.selectedSession.PromptTokens
        if (tokens >= int64(float64(contextWindow)*0.95)) && config.Get().AutoCompact {
            return a, util.CmdHandler(startCompactSessionMsg{})
        }
    }
    return a, nil
```

**[F]** [tui.go:306-321](../../sources/opencode/internal/tui/tui.go#L306-L321)：

```go
case startCompactSessionMsg:
    a.isCompacting = true
    a.compactingMessage = "Starting summarization..."
    if a.selectedSession.ID == "" {
        a.isCompacting = false
        return a, util.ReportWarn("No active session to summarize")
    }
    return a, func() tea.Msg {
        ctx := context.Background()
        a.app.CoderAgent.Summarize(ctx, a.selectedSession.ID)
        return nil
    }
```

**[F]** **触发条件**：

- `AgentEventTypeResponse` 完成事件。
- `CompletionTokens + PromptTokens >= contextWindow * 0.95`。
- `config.Get().AutoCompact == true`。

### 6.2 Summarize 流程

**[F]** [internal/llm/agent/agent.go:535-704](../../sources/opencode/internal/llm/agent/agent.go#L535-L704)：

```go
func (a *agent) Summarize(ctx context.Context, sessionID string) error {
    if a.summarizeProvider == nil { return fmt.Errorf("summarize provider not available") }
    if a.IsSessionBusy(sessionID) { return ErrSessionBusy }

    summarizeCtx, cancel := context.WithCancel(ctx)
    a.activeRequests.Store(sessionID+"-summarize", cancel)

    go func() {
        defer a.activeRequests.Delete(sessionID + "-summarize")
        defer cancel()
        event := AgentEvent{Type: AgentEventTypeSummarize, Progress: "Starting summarization..."}
        a.Publish(pubsub.CreatedEvent, event)

        msgs, err := a.messages.List(summarizeCtx, sessionID)
        if err != nil {
            event = AgentEvent{Type: AgentEventTypeError, Error: fmt.Errorf("failed to list messages: %w", err), Done: true}
            a.Publish(pubsub.CreatedEvent, event); return
        }
        summarizeCtx = context.WithValue(summarizeCtx, tools.SessionIDContextKey, sessionID)

        if len(msgs) == 0 {
            event = AgentEvent{Type: AgentEventTypeError, Error: fmt.Errorf("no messages to summarize"), Done: true}
            a.Publish(pubsub.CreatedEvent, event); return
        }

        event = AgentEvent{Type: AgentEventTypeSummarize, Progress: "Analyzing conversation..."}
        a.Publish(pubsub.CreatedEvent, event)

        summarizePrompt := "Provide a detailed but concise summary of our conversation above. Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next."

        promptMsg := message.Message{Role: message.User, Parts: []message.ContentPart{message.TextContent{Text: summarizePrompt}}}
        msgsWithPrompt := append(msgs, promptMsg)

        event = AgentEvent{Type: AgentEventTypeSummarize, Progress: "Generating summary..."}
        a.Publish(pubsub.CreatedEvent, event)

        response, err := a.summarizeProvider.SendMessages(summarizeCtx, msgsWithPrompt, make([]tools.BaseTool, 0))
        if err != nil {
            event = AgentEvent{Type: AgentEventTypeError, Error: fmt.Errorf("failed to summarize: %w", err), Done: true}
            a.Publish(pubsub.CreatedEvent, event); return
        }

        summary := strings.TrimSpace(response.Content)
        if summary == "" {
            event = AgentEvent{Type: AgentEventTypeError, Error: fmt.Errorf("empty summary returned"), Done: true}
            a.Publish(pubsub.CreatedEvent, event); return
        }

        event = AgentEvent{Type: AgentEventTypeSummarize, Progress: "Creating new session..."}
        a.Publish(pubsub.CreatedEvent, event)
        oldSession, err := a.sessions.Get(summarizeCtx, sessionID)
        if err != nil { /* ... */ }

        // 重要：直接在 oldSession 上写 summary message + 设置 SummaryMessageID
        msg, err := a.messages.Create(summarizeCtx, oldSession.ID, message.CreateMessageParams{
            Role: message.Assistant,
            Parts: []message.ContentPart{
                message.TextContent{Text: summary},
                message.Finish{Reason: message.FinishReasonEndTurn, Time: time.Now().Unix()},
            },
            Model: a.summarizeProvider.Model().ID,
        })
        if err != nil { /* ... */ }

        oldSession.SummaryMessageID = msg.ID      // ← 关键
        oldSession.CompletionTokens = response.Usage.OutputTokens
        oldSession.PromptTokens = 0              // ← 重置
        model := a.summarizeProvider.Model()
        usage := response.Usage
        cost := model.CostPer1MInCached/1e6*float64(usage.CacheCreationTokens) +
            model.CostPer1MOutCached/1e6*float64(usage.CacheReadTokens) +
            model.CostPer1MIn/1e6*float64(usage.InputTokens) +
            model.CostPer1MOut/1e6*float64(usage.OutputTokens)
        oldSession.Cost += cost
        _, err = a.sessions.Save(summarizeCtx, oldSession)
        if err != nil { /* ... */ }

        event = AgentEvent{Type: AgentEventTypeSummarize, SessionID: oldSession.ID, Progress: "Summary complete", Done: true}
        a.Publish(pubsub.CreatedEvent, event)
    }()

    return nil
}
```

### 6.3 Doc-vs-Code 不一致

**[I]** **关键发现**：

- TUI 进度文案 "Creating new session..."（[agent.go:636](../../sources/opencode/internal/llm/agent/agent.go#L636)）。
- 但实际代码 `a.messages.Create(summarizeCtx, oldSession.ID, ...)` 在**原 session**（oldSession.ID）创建 summary message。
- 然后 `oldSession.SummaryMessageID = msg.ID`，更新原 session。
- **没有创建任何新 session**。
- README 同样声明 "compact creates a new session"，也是错误的。

**[I]** **后果**：

- 用户期望"compact 后是新 session，可以回看原 session"，但 OpenCode 实际是"原 session 标记 summary marker"。
- 历史摘要前的内容**仍存在**于 DB（不删除），但被 processGeneration 截断到 SummaryMessageID。
- 用户在 TUI 中仍然在原 session，看到的是 summary 后的上下文。

**[I]** **如何处理**：

- 这是 doc-vs-code 差异，必须在 [open-questions.md](open-questions.md) 中标记。
- RoboThree 借鉴时**必须明确选择**：in-place summary marker（OpenCode 当前实现）OR 真正新 session + 原 session 归档。

### 6.4 静态发现的弱点

**[I]** 1. **阈值偏激进**：

- 95% 触发，但生成 summary 本身要消耗 token。
- 在 summary 完成前，下一轮请求可能已经触发 Provider 4xx 错误。
- 没有"提前 5%"的安全裕量。

**[I]** 2. **Summarize 不支持 cancel 立即生效**：

- `activeRequests[sessionID+"-summarize"]` 存储 cancel，但**同步 goroutine** 内部仍按顺序执行。
- 用户按 Esc 取消 Run() 后，Summarize() 还在跑。
- 如果用户在 summary 完成前发新请求，新请求会因 `IsSessionBusy` 返回 `ErrSessionBusy`。

**[I]** 3. **Cost 累加可能丢失精度**：

```go
cost := model.CostPer1MInCached/1e6*float64(usage.CacheCreationTokens) +
    model.CostPer1MOutCached/1e6*float64(usage.CacheReadTokens) +
    model.CostPer1MIn/1e6*float64(usage.InputTokens) +
    model.CostPer1MOut/1e6*float64(usage.OutputTokens)
oldSession.Cost += cost
```

- 浮点累加，长期使用可能有精度漂移。
- 浮点 `float64` 不能精确表示所有 decimal。

**[I]** 4. **Summarize Prompt 简单**：

- "Provide a detailed but concise summary..." 是通用 prompt。
- 没有针对"tool call 结果""文件路径""代码片段"等差异化处理。
- 摘要可能丢失关键 code 上下文。

**[I]** 5. **Summary 不可回滚**：

- 一旦 `SummaryMessageID` 被设置，原始 history 永远被截断。
- 用户无法"uncompact"恢复原始 history。
- DB 中原始 history 仍存在，但 processGeneration 不再使用。

**[I]** 6. **Provider API key 复用**：

- summarizer Provider 复用 coder Provider 的 API key（[agent.go:706-758](../../sources/opencode/internal/llm/agent/agent.go#L706-L758) `createAgentProvider(config.AgentSummarizer)`）。
- 没有为 summarizer 提供独立 model（默认 config 中）。
- summarizer 与 coder 用同一模型 → "模型总结自己的对话"可能产生自我确认偏差。

## 7. 取消传播 vs Summary

**[F]** [internal/llm/agent/agent.go:117-133](../../sources/opencode/internal/llm/agent/agent.go#L117-L133)：

```go
func (a *agent) Cancel(sessionID string) {
    if cancelFunc, exists := a.activeRequests.LoadAndDelete(sessionID); exists {
        if cancel, ok := cancelFunc.(context.CancelFunc); ok {
            logging.InfoPersist(fmt.Sprintf("Request cancellation initiated for session: %s", sessionID))
            cancel()
        }
    }
    if cancelFunc, exists := a.activeRequests.LoadAndDelete(sessionID + "-summarize"); exists {
        if cancel, ok := cancelFunc.(context.CancelFunc); ok {
            logging.InfoPersist(fmt.Sprintf("Summarize cancellation initiated for session: %s", sessionID))
            cancel()
        }
    }
}
```

**[F]** **普通 Run** key 是 `sessionID`，**Summarize** key 是 `sessionID+"-summarize"`。

**[F]** `IsSessionBusy` 只检查普通 key（[agent.go:149-152](../../sources/opencode/internal/llm/agent/agent.go#L149-L152)）：

```go
func (a *agent) IsSessionBusy(sessionID string) bool {
    _, busy := a.activeRequests.Load(sessionID)
    return busy
}
```

**[I]** **关键不一致**：

- Summarize 进行时，session 不被 IsSessionBusy 视为 busy。
- 用户可以在 summary 期间**继续发新请求**——但这是反常的，因为 summary 期间该 session 数据仍在写入。
- 实际上新请求会因 `IsSessionBusy` 返回 false 而**并发运行**，与 summary 互相覆盖 DB。

**[I]** **RoboThree 借鉴时应修正**：

- Summarize 也算 busy。
- 或 Summarize 加写锁。

## 8. Token Accounting

### 8.1 TrackUsage

**[F]** [internal/llm/agent/agent.go:494-514](../../sources/opencode/internal/llm/agent/agent.go#L494-L514)：

```go
func (a *agent) TrackUsage(ctx context.Context, sessionID string, model models.Model, usage provider.TokenUsage) error {
    sess, err := a.sessions.Get(ctx, sessionID)
    if err != nil { return fmt.Errorf("failed to get session: %w", err) }

    cost := model.CostPer1MInCached/1e6*float64(usage.CacheCreationTokens) +
        model.CostPer1MOutCached/1e6*float64(usage.CacheReadTokens) +
        model.CostPer1MIn/1e6*float64(usage.InputTokens) +
        model.CostPer1MOut/1e6*float64(usage.OutputTokens)

    sess.Cost += cost
    sess.CompletionTokens = usage.OutputTokens + usage.CacheReadTokens
    sess.PromptTokens = usage.InputTokens + usage.CacheCreationTokens

    _, err = a.sessions.Save(ctx, sess)
    if err != nil { return fmt.Errorf("failed to save session: %w", err) }
    return nil
}
```

### 8.2 Session Save / Publish

**[F]** [internal/session/session.go:80-110](../../sources/opencode/internal/session/session.go#L80-L110)：

- `Save` 更新 title / tokens / summary_message_id / cost。
- 每次 Create / Update / Delete 都发布 pubsub event。

### 8.3 静态发现的弱点

**[I]** 1. **CompletionTokens + PromptTokens 公式**：

- `CompletionTokens = OutputTokens + CacheReadTokens`。
- `PromptTokens = InputTokens + CacheCreationTokens`。
- 这里 OpenCode 把 cache tokens **算入 prompt**，但 Anthropic 计费时 cache_read 通常**比 input 便宜**，OpenCode 简单累加可能**高估 cost**。
- 实际 cost 计算已经分开了 cache_read vs cache_creation，但 token 计数公式简单。

**[I]** 2. **95% 判断也用同一公式**：

- `tokens = CompletionTokens + PromptTokens`（[tui.go:338](../../sources/opencode/internal/tui/tui.go#L338)）。
- 把 Output + CacheRead + Input + CacheCreation 都加在一起。
- 这是"总 token 数"，可能**与 Provider 实际 context window 占用**不一致（cache_hit 不一定占 context）。

## 9. Provider 模型 + ContextWindow

**[F]** [internal/llm/models/models.go:9-22](../../sources/opencode/internal/llm/models/models.go#L9-L22)：

```go
type Model struct {
    ID                  models.ModelID
    Name                string
    Provider            models.ModelProvider
    APIModel            string
    CostPer1MIn         float64
    CostPer1MOut        float64
    CostPer1MInCached   float64
    CostPer1MOutCached  float64
    ContextWindow       int64
    DefaultMaxTokens    int64
    CanReason           bool
    SupportsAttachments bool
}
```

**[F]** [models.go:49-97](../../sources/opencode/internal/llm/models/models.go#L49-L97)：

- `SupportedModels` 合并 Anthropic / OpenAI / Gemini / Groq / Azure / OpenRouter / xAI / Vertex / Copilot 的静态模型表。

**[I]** **硬编码静态表**：

- 模型表是编译时常量。
- 新模型发布需发版才能支持。
- 没用动态 model discovery。

## 10. Subagent Session & Cost

**[F]** [internal/llm/agent/agent-tool.go:62-96](../../sources/opencode/internal/llm/agent/agent-tool.go#L62-L96)：

```go
session, err := b.sessions.CreateTaskSession(ctx, call.ID, sessionID, "New Agent Session")
done, err := agent.Run(ctx, session.ID, params.Prompt)
result := <-done
updatedSession, err := b.sessions.Get(ctx, session.ID)
parentSession, err := b.sessions.Get(ctx, sessionID)
parentSession.Cost += updatedSession.Cost
_, err = b.sessions.Save(ctx, parentSession)
```

**[I]** **Cost 累加**：

- 子 agent 的 cost 累加到父 session。
- 子 session 自身 cost 字段保留。
- 父 session 在 TUI 中显示的 cost 包含子 agent。

**[I]** **Parent Session ID 关联**：

- task session 的 `parent_session_id` 指向父 session。
- DB 层面支持，但 UI 没有"subagent sessions 树形视图"。

## 11. RoboThree Context 设计建议

### 11.1 ADOPT

| 机制 | 适配方案 |
|---|---|
| SQLite 三表 + Goose migrations | 直接采纳；保留 message_parts JSON 序列化 |
| ContentPart type-tag 序列化 | 直接采纳 |
| File mtime check before write | 直接采纳 |
| Project context files 注入 | 直接采纳；改为可热重载 |
| Token-based cost tracking | 采纳；改进 cache_read vs cache_creation 区分 |
| Subagent cost 累计到 parent | 直接采纳 |

### 11.2 ADAPT

| 机制 | 适配方案 |
|---|---|
| 95% 阈值 | 调整为 90%；或采用"提前 5%"安全裕量 |
| Summary marker 截断 | 显式选择 "in-place marker" 或 "new session + archive"；修复 doc-vs-code 不一致 |
| sync.Once 全局 cache | 改为 per-session cache；或 working dir switch 时 invalidate |
| Summarize 同时不算 busy | 改为 Summarize 也算 busy；或加写锁 |

### 11.3 DEFER

| 机制 | 理由 |
|---|---|
| 11+ Provider 全套 | MVP 只需 Anthropic + OpenAI-compat |
| Multi-Level title / summarizer / task provider | MVP 用单一 model |
| Recursive context loading (`./cursor/rules/`) | MVP 不支持递归 |

### 11.4 REJECT

| 机制 | 理由 |
|---|---|
| 无 token 预算的 context files | 必须加文件大小 / token 限制 |
| 无敏感内容过滤 | 必须加 Secret scanner |
| Float64 cost 累加 | 用 integer micro-cents 避免精度漂移 |
| Summary 不可回滚 | 提供 `uncompact` 命令恢复 |

### 11.5 NEEDS_MORE_EVIDENCE

| 机制 | 缺失证据 |
|---|---|
| ImageURL Part 序列化 bug | 需运行时验证 |
| 95% 阈值的合理性 | 需 agent eval |
| Summary marker 截断的 context loss 程度 | 需 benchmark |

## 12. 引用完整列表

| 路径 | 用途 |
|---|---|
| [internal/session/session.go](../../sources/opencode/internal/session/session.go) | Session struct + Service |
| [internal/message/message.go](../../sources/opencode/internal/message/message.go) | Message Service + ContentPart |
| [internal/db/migrations/20250424200609_initial.sql](../../sources/opencode/internal/db/migrations/20250424200609_initial.sql) | sessions / messages / files 表 |
| [internal/db/migrations/20250515105448_add_summary_message_id.sql](../../sources/opencode/internal/db/migrations/20250515105448_add_summary_message_id.sql) | summary_message_id 列 |
| [internal/db/sql/messages.sql](../../sources/opencode/internal/db/sql/messages.sql) | ListMessagesBySession |
| [internal/db/sql/sessions.sql](../../sources/opencode/internal/db/sql/sessions.sql) | ListSessions (root only) |
| [internal/db/connect.go](../../sources/opencode/internal/db/connect.go) | PRAGMAs + Goose |
| [internal/llm/agent/agent.go](../../sources/opencode/internal/llm/agent/agent.go) | processGeneration + Summarize + TrackUsage |
| [internal/llm/prompt/prompt.go](../../sources/opencode/internal/llm/prompt/prompt.go) | GetAgentPrompt + getContextFromPaths |
| [internal/llm/provider/provider.go](../../sources/opencode/internal/llm/provider/provider.go) | cleanMessages |
| [internal/llm/models/models.go](../../sources/opencode/internal/llm/models/models.go) | Model struct + SupportedModels |
| [internal/config/config.go](../../sources/opencode/internal/config/config.go) | Default ContextPaths |
| [internal/tui/tui.go](../../sources/opencode/internal/tui/tui.go) | 95% trigger |
| [internal/llm/agent/agent-tool.go](../../sources/opencode/internal/llm/agent/agent-tool.go) | Subagent cost accumulation |