# Deep Dive 1: Agent Loop + Serial Tool Dispatch + Cancellation

> L3 Mechanism #1 | commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
> Method: 静态源码分析（无运行时验证）

## 1. Executive Summary

OpenCode 的 Agent 主循环位于 [internal/llm/agent/agent.go](../../sources/opencode/internal/llm/agent/agent.go)，是整个 Runtime 的心脏。它的设计特征：

1. **三段式循环**：`Run() → processGeneration() → streamAndHandleEvents()`。
2. **串行 Tool Dispatch**：单轮内所有 tool calls 严格按 message 顺序串行执行，permission deny 会取消后续同批 tool calls。
3. **每个 event 写 DB**：streaming 期间每个 delta、tool start / finish 都触发一次 `messages.Update`。
4. **取消基于 `sync.Map` + `context.CancelFunc`**：TUI 按 Esc → `agent.Cancel(sessionID)` → 从 map 删除并调用 cancel → Provider goroutine ctx check 返回 → 提前 finish + 返回 `ErrRequestCancelled`。
5. **completion = end_turn | tool_use**：只有 `finish_reason == tool_use` 且有 tool results 才继续下一轮；其余情况返回 final response。

这套机制是 OpenCode 与大多数 Agent Framework 最大的差异点，也是 RoboThree 借鉴的核心。

## 2. 完整调用链

### 2.1 入口与并发模型

```text
TUI/Chat.SendMsg
  └─ page/chat.sendMessage()                     [chat.go:154-175]
      └─ app.CoderAgent.Run(ctx, sessionID, content)
          └─ agent.Run: spawn goroutine
              └─ processGeneration(ctx, ...)
                  └─ streamAndHandleEvents(...)  ← 主循环
                      └─ provider.StreamResponse(...) ← 阻塞消费 event channel
                      └─ for toolCall := range toolCalls  ← 串行
                          └─ tool.Run(ctx, ...)
                              └─ permissions.Request(...)  ← 阻塞（无 timeout）
                                  └─ TUI dialog → Grant/Deny → respCh
```

### 2.2 processGeneration 详细逻辑

**[F]** [internal/llm/agent/agent.go:233-311](../../sources/opencode/internal/llm/agent/agent.go#L233-L311)：

```go
func (a *agent) processGeneration(ctx context.Context, sessionID, content string, attachmentParts []message.ContentPart) AgentEvent {
    cfg := config.Get()
    msgs, err := a.messages.List(ctx, sessionID)                      // 1. 读历史
    if err != nil { return a.err(...) }
    if len(msgs) == 0 {
        go func() { /* generateTitle */ }()                          // 2. 首次异步生成标题
    }
    session, err := a.sessions.Get(ctx, sessionID)                    // 3. 拿 session
    if err != nil { return a.err(...) }
    if session.SummaryMessageID != "" {
        // 4. 截断到 summary message，并把其 role 改为 User
        summaryMsgInex := -1
        for i, msg := range msgs {
            if msg.ID == session.SummaryMessageID { summaryMsgInex = i; break }
        }
        if summaryMsgInex != -1 {
            msgs = msgs[summaryMsgInex:]
            msgs[0].Role = message.User
        }
    }
    userMsg, err := a.createUserMessage(ctx, sessionID, content, attachmentParts) // 5. 写新 user message
    msgHistory := append(msgs, userMsg)
    for {
        select {
        case <-ctx.Done():
            return a.err(ctx.Err())                                  // 6. ctx cancel 早退
        default:
        }
        agentMessage, toolResults, err := a.streamAndHandleEvents(ctx, sessionID, msgHistory)
        if err != nil {
            if errors.Is(err, context.Canceled) {
                agentMessage.AddFinish(message.FinishReasonCanceled)
                a.messages.Update(context.Background(), agentMessage)
                return a.err(ErrRequestCancelled)
            }
            return a.err(fmt.Errorf("failed to process events: %w", err))
        }
        if (agentMessage.FinishReason() == message.FinishReasonToolUse) && toolResults != nil {
            // 7. tool_use + 有 tool results → 继续下一轮
            msgHistory = append(msgHistory, agentMessage, *toolResults)
            continue
        }
        return AgentEvent{Type: AgentEventTypeResponse, Message: agentMessage, Done: true}  // 8. 终止
    }
}
```

### 2.3 streamAndHandleEvents 详细逻辑

**[F]** [internal/llm/agent/agent.go:322-438](../../sources/opencode/internal/llm/agent/agent.go#L322-L438)：

```go
func (a *agent) streamAndHandleEvents(ctx, sessionID, msgHistory) (message.Message, *message.Message, error) {
    ctx = context.WithValue(ctx, tools.SessionIDContextKey, sessionID)
    eventChan := a.provider.StreamResponse(ctx, msgHistory, a.tools)
    assistantMsg, err := a.messages.Create(ctx, sessionID, message.CreateMessageParams{
        Role:  message.Assistant,
        Parts: []message.ContentPart{},
        Model: a.provider.Model().ID,
    })
    ctx = context.WithValue(ctx, tools.MessageIDContextKey, assistantMsg.ID)

    for event := range eventChan {
        if processErr := a.processEvent(ctx, sessionID, &assistantMsg, event); processErr != nil {
            a.finishMessage(ctx, &assistantMsg, message.FinishReasonCanceled)
            return assistantMsg, nil, processErr
        }
        if ctx.Err() != nil {
            a.finishMessage(context.Background(), &assistantMsg, message.FinishReasonCanceled)
            return assistantMsg, nil, ctx.Err()
        }
    }

    toolResults := make([]message.ToolResult, len(assistantMsg.ToolCalls()))
    toolCalls := assistantMsg.ToolCalls()
    for i, toolCall := range toolCalls {
        select {
        case <-ctx.Done():
            a.finishMessage(context.Background(), &assistantMsg, message.FinishReasonCanceled)
            for j := i; j < len(toolCalls); j++ {
                toolResults[j] = message.ToolResult{ToolCallID: toolCalls[j].ID, Content: "Tool execution canceled by user", IsError: true}
            }
            goto out
        default:
        }
        var tool tools.BaseTool
        for _, availableTool := range a.tools {
            if availableTool.Info().Name == toolCall.Name {
                tool = availableTool
                break
            }
        }
        if tool == nil {
            toolResults[i] = message.ToolResult{ToolCallID: toolCall.ID, Content: fmt.Sprintf("Tool not found: %s", toolCall.Name), IsError: true}
            continue
        }
        toolResult, toolErr := tool.Run(ctx, tools.ToolCall{ID: toolCall.ID, Name: toolCall.Name, Input: toolCall.Input})
        if toolErr != nil {
            if errors.Is(toolErr, permission.ErrorPermissionDenied) {
                toolResults[i] = message.ToolResult{ToolCallID: toolCall.ID, Content: "Permission denied", IsError: true}
                for j := i + 1; j < len(toolCalls); j++ {
                    toolResults[j] = message.ToolResult{ToolCallID: toolCalls[j].ID, Content: "Tool execution canceled by user", IsError: true}
                }
                a.finishMessage(ctx, &assistantMsg, message.FinishReasonPermissionDenied)
                break
            }
        }
        toolResults[i] = message.ToolResult{ToolCallID: toolCall.ID, Content: toolResult.Content, Metadata: toolResult.Metadata, IsError: toolResult.IsError}
    }
out:
    if len(toolResults) == 0 {
        return assistantMsg, nil, nil
    }
    parts := make([]message.ContentPart, 0)
    for _, tr := range toolResults { parts = append(parts, tr) }
    msg, err := a.messages.Create(context.Background(), assistantMsg.SessionID, message.CreateMessageParams{
        Role:  message.Tool,
        Parts: parts,
    })
    return assistantMsg, &msg, err
}
```

### 2.4 processEvent 详细逻辑

**[F]** [internal/llm/agent/agent.go:445-492](../../sources/opencode/internal/llm/agent/agent.go#L445-L492)：

```go
func (a *agent) processEvent(ctx, sessionID, assistantMsg, event) error {
    select {
    case <-ctx.Done(): return ctx.Err()
    default:
    }
    switch event.Type {
    case provider.EventThinkingDelta:
        assistantMsg.AppendReasoningContent(event.Content)
        return a.messages.Update(ctx, *assistantMsg)
    case provider.EventContentDelta:
        assistantMsg.AppendContent(event.Content)
        return a.messages.Update(ctx, *assistantMsg)
    case provider.EventToolUseStart:
        assistantMsg.AddToolCall(*event.ToolCall)
        return a.messages.Update(ctx, *assistantMsg)
    case provider.EventToolUseStop:
        assistantMsg.FinishToolCall(event.ToolCall.ID)
        return a.messages.Update(ctx, *assistantMsg)
    case provider.EventError:
        if errors.Is(event.Error, context.Canceled) { return context.Canceled }
        logging.ErrorPersist(event.Error.Error())
        return event.Error
    case provider.EventComplete:
        assistantMsg.SetToolCalls(event.Response.ToolCalls)
        assistantMsg.AddFinish(event.Response.FinishReason)
        if err := a.messages.Update(ctx, *assistantMsg); err != nil { return err }
        return a.TrackUsage(ctx, sessionID, a.provider.Model(), event.Response.Usage)
    }
    return nil
}
```

## 3. 串行 Tool Dispatch 的设计语义

### 3.1 为什么串行

**[I]** **OpenCode 自身没有显式解释**，但可以从源码看出设计取舍：

- 同一批次 tool calls 共享**同一权限上下文**（permission service）；串行让"deny 后取消后续"语义清晰。
- Tool 大多数是文件 / Shell / HTTP 类 IO 操作，**写冲突概率高**（write 后 edit 同一文件、edit 后 bash 引用）。
- 简化 mental model："message order = execution order"。
- 与 Anthropic SDK 默认行为一致。

### 3.2 串行的代价

**[I]** 一个慢 tool（bash timeout 10min、fetch timeout 120s）阻塞同批所有后续 tool。

**[F]** **当前实现不支持混合并行+串行**——同批要么全部串行（OpenCode 选择），要么全部并行（Pi Agent 选择），不可混合。

### 3.3 Permission Deny 的级联取消

**[F]** [agent.go:396-411](../../sources/opencode/internal/llm/agent/agent.go#L396-L411)：

```go
if errors.Is(toolErr, permission.ErrorPermissionDenied) {
    toolResults[i] = message.ToolResult{ToolCallID: toolCall.ID, Content: "Permission denied", IsError: true}
    for j := i + 1; j < len(toolCalls); j++ {
        toolResults[j] = message.ToolResult{ToolCallID: toolCalls[j].ID, Content: "Tool execution canceled by user", IsError: true}
    }
    a.finishMessage(ctx, &assistantMsg, message.FinishReasonPermissionDenied)
    break  // 跳出 for 循环
}
```

**[I]** 模型下一轮仍会看到"denied" + "canceled" 的 tool results；finish reason 是 `permission_denied`，可能促使模型改换工具或询问用户。

## 4. Cancellation 路径

### 4.1 入口

**[F]** [internal/tui/page/chat.go:102-119](../../sources/opencode/internal/tui/page/chat.go#L102-L119)：

```go
case tea.KeyMsg:
    if msg.String() == "esc" {
        if p.session.ID != "" {
            p.app.CoderAgent.Cancel(p.session.ID)
        }
    }
```

### 4.2 取消实现

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

### 4.3 取消传播链

```text
TUI Esc
  → agent.Cancel(sessionID)
    → activeRequests.LoadAndDelete(sessionID) → context.CancelFunc()
      → cancel()                                            // genCtx 被取消
        → provider.StreamResponse channel 关闭（client 端取消）
        → for event := range eventChan: 下一次 ctx check 返回 ctx.Err
          → processEvent 第一次 ctx.Err() 时返回 ctx.Err
          → streamAndHandleEvents 返回 (assistantMsg, nil, ctx.Err())
        → processGeneration 收到 ctx.Err()，finishMessage + 返回 ErrRequestCancelled
          → Run() goroutine: activeRequests.Delete + cancel() + Publish + close events
```

**[F]** 关键代码：

| 步骤 | 位置 | 代码 |
|---|---|---|
| cancel() 触发 ctx | [agent.go:117-133](../../sources/opencode/internal/llm/agent/agent.go#L117-L133) | `cancel()` |
| stream ctx check | [agent.go:344-347](../../sources/opencode/internal/llm/agent/agent.go#L344-L347) | `if ctx.Err() != nil { ... }` |
| tool loop ctx check | [agent.go:353-364](../../sources/opencode/internal/llm/agent/agent.go#L353-L364) | `select { case <-ctx.Done(): ...; goto out }` |
| processGen ctx check | [agent.go:277-283](../../sources/opencode/internal/llm/agent/agent.go#L277-L283) | `select { case <-ctx.Done(): ... }` |
| TrackUsage 也在 ctx 内 | [agent.go:494-514](../../sources/opencode/internal/llm/agent/agent.go#L494-L514) | `a.TrackUsage(ctx, ...)` |
| FinishMessage 切换 context | [agent.go:440-443](../../sources/opencode/internal/llm/agent/agent.go#L440-L443) | `finishMessage(ctx, ...)` 接受 ctx |

**[I]** **关键观察**：

- `processEvent` 中的 `messages.Update(ctx, ...)` 共享 genCtx；如果 DB write 慢，cancel 后仍在写入。OpenCode 选择 `a.finishMessage(context.Background(), ...)`（[agent.go:345](../../sources/opencode/internal/llm/agent/agent.go#L345)）保证 cancel 后还能写完 finish reason。
- 但 `processGeneration` 的 cancel 路径（[agent.go:286-289](../../sources/opencode/internal/llm/agent/agent.go#L286-L289)）使用的是 `context.Background()`，绕过了 cancel。

### 4.4 Cancel 不能跨 Run

**[I]** 取消只取消当前 session 的 Run() / Summarize()：

- 若同时启动多个 session，每个独立取消。
- 同一 session 内**只有一个 Run() / Summarize() 可用**（`ErrSessionBusy`），所以取消粒度足够。

### 4.5 取消后状态

**[F]** 取消后：

1. assistantMsg 写入 DB，finish reason = `canceled` 或 `permission_denied`。
2. 没有 tool results 时不创建 tool message。
3. Run() goroutine Publish `AgentEventTypeError` + 关闭 events channel。
4. TUI 收到事件后渲染"取消"提示。

**[I]** **Cancel 不回滚 DB**：已经写入的 streaming deltas / tool calls 不会撤销。

## 5. Failure Paths

### 5.1 Provider Error

**[F]** `provider.EventError` → processEvent 返回 error → streamAndHandleEvents 返回 error → processGeneration 检查 `context.Canceled` 决定 finish reason / error。

**[F]** Anthropic / OpenAI provider 实现 retry（最多 8 次），所以"普通网络错误"会被吞掉；超过 8 次才返回 EventError。

### 5.2 Tool Not Found

**[F]** [agent.go:382-389](../../sources/opencode/internal/llm/agent/agent.go#L382-L389)：

```go
if tool == nil {
    toolResults[i] = message.ToolResult{ToolCallID: toolCall.ID, Content: fmt.Sprintf("Tool not found: %s", toolCall.Name), IsError: true}
    continue
}
```

**[I]** 模型下一轮会看到"Tool not found"，可能改用别的工具。

### 5.3 JSON Unmarshal Error

**[F]** 多个 tool 在 `Run` 内部：`json.Unmarshal([]byte(call.Input), &params)` 失败时返回 `NewTextErrorResponse` 但 `error = nil`（[bash.go:233](../../sources/opencode/internal/llm/tools/bash.go#L233), [write.go:103](../../sources/opencode/internal/llm/tools/write.go#L103)）。

**[I]** 这是一个**设计选择**：参数错误是 ToolResult content（model 可见），不是 Go error（取消级联链不会触发）。

### 5.4 Permission Timeout（永久阻塞）

**[I]** **静态发现的高风险路径**：

- [permission.go:106](../../sources/opencode/internal/permission/permission.go#L106) `resp := <-respCh` 无 timeout。
- 如果 TUI 进程崩溃 / 关闭，tool 永久阻塞直到 genCtx 被取消（用户按 Esc 或重启）。
- 没有 watchdog goroutine 清理 stale pendingRequests。

### 5.5 Panic Recovery

**[F]** [agent.go:212-214](../../sources/opencode/internal/llm/agent/agent.go#L212-L214)：

```go
defer logging.RecoverPanic("agent.Run", func() {
    events <- a.err(fmt.Errorf("panic while running the agent"))
})
```

**[F]** [cmd/root.go:212-219](../../sources/opencode/cmd/root.go#L212-L219) setupSubscriber 也有 `defer logging.RecoverPanic(...)`。

**[I]** 全局 panic recovery 是"防止 UI 崩溃"的安全网，但 panic 后状态可能不一致（assistant message 已部分写入）。

## 6. 设计取舍

### 6.1 每个 event 写 DB

**[F]** `processEvent` 每个 case 都调用 `a.messages.Update(ctx, *assistantMsg)`。

**[I]** **取舍**：

- 优点：DB 是真理之源；UI 任意时刻刷新都能从 DB 重建。
- 缺点：streaming 期间高频 DB write 拖累延迟。

### 6.2 同步等待 Provider Stream

**[F]** `for event := range eventChan { ... }` 阻塞消费。

**[I]** 优点：实现简单，事件顺序天然确定。缺点：无法并发处理多 session 的 stream。

### 6.3 Tool Call 串行

**[F]** 严格 for 循环，不并发。

**[I]** 优点：消除写冲突；简化权限语义；与 Anthropic SDK 默认一致。缺点：性能受限。

### 6.4 sessionPermissions 内存存储

**[F]** `sessionPermissions []PermissionRequest` 仅进程内（[permission.go:47](../../sources/opencode/internal/permission/permission.go#L47)）。

**[I]** 进程重启后所有"grant for session"丢失。简单但破坏用户预期。

## 7. 与其他框架的对比

| Aspect | OpenCode | Claude Code | Hermes Agent | Pi Agent |
|---|---|---|---|---|
| Agent Loop 抽象 | `processGeneration` 内嵌 | state machine | promise-based | `agentLoop` 异步生成器 |
| Tool Dispatch | 严格串行 | 混合（serial+parallel） | 并发批处理 | 3 种 dispatch strategy |
| Cancellation | `sync.Map` + `CancelFunc` | session-based | registry cancel | AbortSignal |
| 每个 event 写 DB | ✅ | ❌ | ✅（SQLite） | ❌ |
| Permission 级联取消 | 同批取消后续 | 不支持级联 | 不支持级联 | bail / waterfall |
| Stream 错误恢复 | retry 8 次 | retry 3 次 | retry 3 次 | retry state machine |

**[I]** OpenCode 在**每次 event 写 DB**和**串行 tool dispatch**两点上与其他主流框架形成对比。

## 8. RoboThree 适配建议

### 8.1 ADOPT

| 机制 | 适配方案 |
|---|---|
| Agent Loop 整体结构 | RoboThree Runtime Phase 1 直接采纳 streamAndHandleEvents 模式 |
| Tool Dispatch 串行 | MVP 采纳（与 Anthropic SDK 默认对齐） |
| Cancel via sync.Map + context.CancelFunc | 采纳；RoboThree 改成 typed registry 增加可测试性 |
| 每个 event 写 DB | 采纳；作为 DB-of-truth 设计哲学 |
| Permission Deny 级联取消同批 | 采纳 |

### 8.2 ADAPT

| 机制 | 适配方案 |
|---|---|
| 串行 → Phase 2 混合并行 | Phase 2 引入 `executionMode: "sequential" / "parallel"` 字段 |
| sync.Once 全局 context | 改为 per-session cache |
| 8 次 retry | 改为 3 次 + 显式 logging |

### 8.3 REJECT

| 机制 | 理由 |
|---|---|
| 无 timeout permission channel | RoboThree 必须加 timeout + context select |
| Persistent Shell 单例 | 不复刻，改用 fork 新进程 |
| Non-Interactive AutoApprove all | 不复刻，必须显式 flag |

### 8.4 NEEDS_MORE_EVIDENCE

| 机制 | 缺失证据 |
|---|---|
| Tool 串行的实际性能影响 | 无 benchmark |
| Permission Deny 后模型行为 | 无 agent eval |
| Cancel 后 DB 写一致性 | 无运行时验证 |

## 9. 引用完整列表

| 路径 | 用途 |
|---|---|
| [internal/llm/agent/agent.go](../../sources/opencode/internal/llm/agent/agent.go) | Service + Run + processGeneration + streamAndHandleEvents + processEvent + TrackUsage + Summarize |
| [internal/llm/agent/agent-tool.go](../../sources/opencode/internal/llm/agent/agent-tool.go) | subagent 同步等待 + parent cost 累计 |
| [internal/llm/provider/provider.go](../../sources/opencode/internal/llm/provider/provider.go) | Provider 抽象 + event channel |
| [internal/llm/provider/anthropic.go](../../sources/opencode/internal/llm/provider/anthropic.go) | Anthropic stream + retry |
| [internal/llm/provider/openai.go](../../sources/opencode/internal/llm/provider/openai.go) | OpenAI stream + retry |
| [internal/llm/tools/tools.go](../../sources/opencode/internal/llm/tools/tools.go) | BaseTool interface |
| [internal/permission/permission.go](../../sources/opencode/internal/permission/permission.go) | Permission Request/Grant/Deny |
| [internal/tui/page/chat.go](../../sources/opencode/internal/tui/page/chat.go) | TUI Esc cancel |
| [internal/tui/tui.go](../../sources/opencode/internal/tui/tui.go) | 95% trigger + permission dialog |
| [cmd/root.go](../../sources/opencode/cmd/root.go) | Cobra + TUI 订阅 |
| [internal/app/app.go](../../sources/opencode/internal/app/app.go) | App 容器 + 非交互 |