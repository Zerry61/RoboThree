# Open Questions — OpenCode

> **Target Ref**: commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
> **Method**: 静态源码分析（部分结论需要运行时验证）

## 1. 静态源码发现的疑点

### 1.1 imageURL Part 反序列化疑似丢 part

- **位置**：[internal/message/message.go](../../sources/opencode/internal/message/message.go) `unmarshallParts()` 的 `imageURLType` 分支。
- **静态观察**：构造 `ImageURLContent` 后未 append 到 `parts` slice。
- **影响**：从数据库读回时 image URL part 可能丢失；多模态交互会失效。
- **置信度**：MEDIUM（静态分析；需测试验证）。
- **How to Close**：
  - 选项 A：git clone + `go test ./internal/message/...` 跑单元测试。
  - 选项 B：阅读 `unmarshallParts` 完整源码，确认是否在 else 分支处理。
  - 选项 C：写一个最小化重现 case，构造含 image_url 的 message，DB write → DB read，对比。

### 1.2 Permission Channel 无 timeout

- **位置**：[internal/permission/permission.go:106](../../sources/opencode/internal/permission/permission.go#L106) `resp := <-respCh`。
- **静态观察**：注释说"Wait for the response with a timeout"，实际无 timeout / context select。
- **影响**：TUI 未响应或测试场景永久阻塞 tool 执行。
- **置信度**：HIGH（源码明确）。
- **How to Close**：
  - 选项 A：阅读 git blame 看是否被误改。
  - 选项 B：对比同期版本（https://github.com/sst/opencode）是否有修复。

### 1.3 Auto Compact 不创建新 session（doc-vs-code 差异）

- **位置**：
  - 实现：[internal/llm/agent/agent.go:673](../../sources/opencode/internal/llm/agent/agent.go#L673) `oldSession.SummaryMessageID = msg.ID`。
  - 文案：[agent.go:636](../../sources/opencode/internal/llm/agent/agent.go#L636) `Progress: "Creating new session..."`。
  - README 也声明 "compact creates a new session"。
- **静态观察**：文案/文档/实现三者不一致。
- **置信度**：HIGH（源码明确）。
- **How to Close**：
  - 选项 A：阅读 git blame，确认是 design choice 还是 bug。
  - 选项 B：与作者（@Kujtim Hoxha）在 GitHub issue 确认意图。

### 1.4 Context 文件无 token 预算

- **位置**：[internal/llm/prompt/prompt.go:131-137](../../sources/opencode/internal/llm/prompt/prompt.go#L131-L137)。
- **静态观察**：`processFile` 直接 `os.ReadFile` + 拼接，无大小限制、无截断、无 token 预算。
- **影响**：超大 context 文件会撑爆 system prompt。
- **置信度**：HIGH。
- **How to Close**：阅读相关 issue / PR，看是否已有软上限。

### 1.5 Context Files 并行加载顺序未定义

- **位置**：[internal/llm/prompt/prompt.go:60-129](../../sources/opencode/internal/llm/prompt/prompt.go#L60-L129) `processContextPaths`。
- **静态观察**：多 path goroutine + channel，输出顺序由 channel 接收顺序决定，可能每次启动顺序不同。
- **影响**：对模型而言 context 顺序变化可能造成非确定性。
- **置信度**：MEDIUM。
- **How to Close**：运行 2 次同样配置 + 同样 working dir，比较生成的 system prompt。

### 1.6 sync.Once 全局缓存 working dir content

- **位置**：[internal/llm/prompt/prompt.go:42-58](../../sources/opencode/internal/llm/prompt/prompt.go#L42-L58)。
- **静态观察**：`onceContext.Do` 进程级只执行一次；working dir 切换时仍复用旧内容。
- **影响**：RoboThree 如果借鉴，必须改为 per-session 缓存。
- **置信度**：HIGH（源码明确）。
- **How to Close**：对照 [internal/config/config.go](../../sources/opencode/internal/config/config.go) 看 working dir 是否允许热切换。

### 1.7 sessionPermissions / autoApproveSessions 无锁

- **位置**：[internal/permission/permission.go:44-50](../../sources/opencode/internal/permission/permission.go#L44-L50)。
- **静态观察**：`sessionPermissions []PermissionRequest` 与 `autoApproveSessions []string` 多 goroutine 并发 append 无 mutex。
- **影响**：data race；`-race` 检测会报错。
- **置信度**：HIGH。
- **How to Close**：阅读所有调用方确认是否真的并发；或 `go test -race ./internal/permission/...`。

### 1.8 Path Permission 字符串前缀判断

- **位置**：[internal/llm/tools/write.go:166](../../sources/opencode/internal/llm/tools/write.go#L166)。
- **静态观察**：`strings.HasPrefix(filePath, rootDir)` 不是真正的目录包含关系。
- **影响**：相邻前缀路径误判授权。
- **置信度**：HIGH（源码明确）。
- **How to Close**：写 PoC 验证 `/workspace/project2` 在 `rootDir=/workspace/project` 下被错误批准。

### 1.9 PersistentShell killChildren 只处理直接子进程

- **位置**：[internal/llm/tools/shell/shell.go:246-269](../../sources/opencode/internal/llm/tools/shell/shell.go#L246-L269)。
- **静态观察**：`pgrep -P <shell pid>`，只 SIGTERM 直接子进程。
- **影响**：孙子进程成为孤儿；timeout / cancel 后留下 zombie。
- **置信度**：HIGH。
- **How to Close**：运行 `bash -c "sleep 60 & exec sleep 60"` 然后 timeout，观察子进程树。

### 1.10 MCP tool 每次执行重建 client

- **位置**：[internal/llm/agent/mcp-tools.go:86-129](../../sources/opencode/internal/llm/agent/mcp-tools.go#L86-L129)。
- **静态观察**：每次 tool call 都 `NewStdioMCPClient` + `Initialize` + `Close`。
- **影响**：stdio MCP（如 filesystem / git）启动开销每次重复；高延迟 MCP server 体验差。
- **置信度**：HIGH。
- **How to Close**：对比同期 Claude Code / Cursor MCP 实现。

## 2. 运行时行为缺失证据

### 2.1 ProcessGeneration token 累加准确性

- TrackUsage 用 cache tokens / input / output / cache_read 计算 cost（[agent.go:494-514](../../sources/opencode/internal/llm/agent/agent.go#L494-L514)）。
- 实际在 Anthropic Claude 4.x 上的 cache hit / cache miss 是否与计费对齐？**未运行时验证**。

### 2.2 Auto Compact 触发时是否覆盖 in-flight tool

- 95% 触发 summary 时，如果当时正在执行 tool call，会发生什么？需 runtime 验证 cancel 顺序。

### 2.3 Provider retry 的 backoff 策略

- retry count = 8（[provider.go:15](../../sources/opencode/internal/llm/provider/provider.go#L15)），但具体 backoff 间隔未深读。

### 2.4 Pubsub 事件丢失率

- TUI 包装层 100 buffer + 2s timeout，但 AgentEvent 流在快速响应场景下是否会丢？
- 需 long-running 测试 + 计数比对。

### 2.5 Task Agent subagent 是否继承 parent 权限

- [agent-tool.go](../../sources/opencode/internal/llm/agent/agent-tool.go) 创建 Task agent 时传入的是 `permission.Service`（共享）；但 Task agent 没有 write/edit 工具，所以无需触发 permission。
- 静态上安全；运行时如果未来加 Task write 工具会立即引入 risk。

## 3. 设计决策未明确

### 3.1 为何 Tool Call 串行

- [agent.go:352-420](../../sources/opencode/internal/llm/agent/agent.go#L352-L420) 串行 for 循环，无并发批处理。
- README / 注释未解释；推测是"避免并发写冲突"或"简化心智模型"。
- 真实原因待考。

### 3.2 为何 Task agent Tool Set 限制为只读

- [tools.go:43-51](../../sources/opencode/internal/llm/agent/tools.go#L43-L51) TaskAgentTools 只含 Glob / Grep / LS / Sourcegraph / View。
- 描述里也说 "the agent can not use Bash, Replace, Edit, so can not modify files"。
- 这是明确的安全设计，但**未通过 OS-level 强制**。

### 3.3 是否计划 Multi-Agent 后台任务

- README 没看到 cron / scheduled task。
- 仅有 Task agent 作为 foreground subagent。

### 3.4 95% 阈值依据

- [tui.go:339](../../sources/opencode/internal/tui/tui.go#L339) `tokens >= contextWindow * 0.95`。
- 未解释为何 95%；多数 LLM 推荐 80-90%。

## 4. 仓库归档后的不确定性

### 4.1 项目迁移到 Crush

- README 顶部（[README.md:1-5](../../sources/opencode/README.md#L1-L5)）声明归档。
- 当前分析基于 commit `73ee493` (2025-09-18)，是最后公开版本。
- Crush 演进后的设计**不在本研究范围**。

### 4.2 Crush 是否修复了上述静态发现

- 无法验证；Crush 仓库当前不在 `sources/`。
- 用户明确要求研究 OpenCode 归档版本，故 Crush 视为后续项目。

## 5. 如何关闭问题

| Question | 最小验证成本 | 建议执行顺序 |
|---|---|---|
| Q1.1 (imageURL bug) | 单元测试 | 后续 clone + 跑测试 |
| Q1.2 (permission timeout) | git blame + 对比分支 | 低成本 |
| Q1.3 (compact doc-vs-code) | git blame / 问作者 | 中等成本 |
| Q1.4 (context file token 预算) | 阅读 issue tracker | 低成本 |
| Q1.5 (context file 并行顺序) | runtime 验证 | 需运行环境 |
| Q1.6 (sync.Once 全局缓存) | 阅读 working dir 热切换支持 | 静态分析即可 |
| Q1.7 (无锁 race) | `go test -race` | 后续跑测试 |
| Q1.8 (path prefix 误判) | 写 PoC | 静态分析即可 |
| Q1.9 (killChildren) | runtime 验证 | 需运行环境 |
| Q1.10 (MCP client 重建) | 对比 Claude Code MCP | 静态对比 |
| Q2.x (运行时) | runtime 测试 | 需明确授权 |

## 6. 当前研究范围声明

**本次研究是静态源码分析**，不包含：

- 实际运行 opencode / opencode -p "..."。
- 实际跑 `go test` / `go build`。
- 实际启动 MCP / LSP server。
- 实际访问模型 API。

因此所有运行时行为只能标注 `[I]` / `[UNKNOWN]`，不能声称已"完成运行时验证"。