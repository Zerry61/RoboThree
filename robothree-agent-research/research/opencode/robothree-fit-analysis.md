# RoboThree Fit Analysis — OpenCode

> **Target Ref**: commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
> **Method**: 静态源码分析
> **Default**: 仅作为 RoboThree 候选变更建议，未自动落地
>
> 结论类型：[F] = Fact（源码直接证据）；[I] = Inference（多源码推断）；[R] = Recommendation（对 RoboThree 的建议）；[UNKNOWN] = 当前证据不足

## 1. 5-Class Summary

| Classification | Count |
|---|---|
| ADOPT（直接采纳） | 4 |
| ADAPT（借鉴并适配） | 6 |
| DEFER（推迟） | 4 |
| REJECT（不采纳） | 5 |
| NEEDS_MORE_EVIDENCE | 3 |

## 2. 详细分类

### 2.1 ADOPT

#### ADOPT-1. SQLite + Goose + sqlc 三栈组合

- **机制**：OpenCode 用 SQLite 存 sessions / messages / files；Goose 管 schema 迁移；sqlc 自动生成类型安全 query 代码。
- **证据**：
  - [internal/db/connect.go](../../sources/opencode/internal/db/connect.go)：PRAGMA WAL + cache_size + synchronous NORMAL。
  - [internal/db/migrations/](../../sources/opencode/internal/db/migrations/)：时间戳命名 + Up/Down SQL。
  - [internal/db/sql/](../../sources/opencode/internal/db/sql/)：原始 SQL。
  - [internal/db/connect.go:43-58](../../sources/opencode/internal/db/connect.go#L43-L58)：启用 foreign_keys。
- **理由**：单一二进制部署、零运维、足够支撑单用户 Agent 的会话与文件历史。
- **风险**：迁移脚本需严格执行顺序；高并发写需小心锁竞争。
- **MVP 需要**：是。

#### ADOPT-2. Provider 抽象 + 事件流

- **机制**：`Provider` interface 用 `<-chan ProviderEvent` 流式返回；event 类型统一（10 种）。
- **证据**：
  - [internal/llm/provider/provider.go:53-59](../../sources/opencode/internal/llm/provider/provider.go#L53-L59)：`Provider` interface。
  - [internal/llm/provider/provider.go:13-28](../../sources/opencode/internal/llm/provider/provider.go#L13-L28)：EventType 常量。
  - [internal/llm/provider/anthropic.go](../../sources/opencode/internal/llm/provider/anthropic.go)、[openai.go](../../sources/opencode/internal/llm/provider/openai.go)：转 event channel。
- **理由**：把 streaming 模型统一成 event 后，Agent loop、UI 渲染、token accounting 都不需要按 provider 区分。
- **风险**：Channel buffer 满会丢事件；目前 buffer 64，TUI 层加 100 buffer 防护。
- **MVP 需要**：是（Agent loop 直接消费 event channel）。

#### ADOPT-3. Tool Call 串行执行

- **机制**：单轮内 tool call 严格按 message 顺序串行执行；permission deny 取消后续同批 tool calls。
- **证据**：
  - [internal/llm/agent/agent.go:352-420](../../sources/opencode/internal/llm/agent/agent.go#L352-L420)：`for i, toolCall := range toolCalls`。
  - [internal/llm/agent/agent.go:396-411](../../sources/opencode/internal/llm/agent/agent.go#L396-L411)：permission deny 后续标记。
- **理由**：简化心智模型；无并发写冲突；与"同批 tool calls 共享权限上下文"语义匹配。
- **风险**：性能受限（一个慢 tool 阻塞同批）；但 Agent 工具多数是 IO 类，串行可接受。
- **MVP 需要**：是（保持与 OpenCode 一致）。

#### ADOPT-4. Tool Set 分级（Coder vs Task）

- **机制**：Coder agent 拥有完整工具；Task agent 只拥有只读搜索工具。
- **证据**：
  - [internal/llm/agent/tools.go:14-41](../../sources/opencode/internal/llm/agent/tools.go#L14-L41)：CoderAgentTools。
  - [internal/llm/agent/tools.go:43-51](../../sources/opencode/internal/llm/agent/tools.go#L43-L51)：TaskAgentTools。
- **理由**：子 agent 限制工具集是 LLM 调用层面最便宜的"隔离"手段；不需要 OS-level 沙箱。
- **风险**：不能阻止"用 read 工具推断 write 路径"的 prompt injection。
- **MVP 需要**：是。

### 2.2 ADAPT

#### ADAPT-1. App 容器 + Service 拆分

- **OpenCode 机制**：`App` struct 持有 5 个 Service + LSP clients。
- **RoboThree 适配**：保留 Service 拆分思路，但增加 `RoboThree.Service` interface 抽象，避免单 struct 难测试。
- **证据**：[internal/app/app.go:25-40](../../sources/opencode/internal/app/app.go#L25-L40)。
- **风险**：Service interface 的粒度需要斟酌；过细增加样板代码。

#### ADAPT-2. Pubsub Broker + TUI 包装层

- **OpenCode 机制**：两层 channel + nonblocking publish + TUI 包装层 buffer 100 + 2s timeout。
- **RoboThree 适配**：保留两级 broker，但**Permission channel 必须加 timeout + context select**（OpenCode 静态发现的问题）。
- **证据**：[internal/pubsub/broker.go](../../sources/opencode/internal/pubsub/broker.go)、[cmd/root.go:233-280](../../sources/opencode/cmd/root.go#L233-L280)。
- **风险**：OpenCode 现有实现可能在 headless 场景永久阻塞；RoboThree 必须修复。

#### ADAPT-3. 95% Context Window 触发 Auto Compact

- **OpenCode 机制**：每次 response 完成后检查 token；达到 95% 触发 summary。
- **RoboThree 适配**：保留阈值触发，但**summary 实现改为真实创建新 session + 摘要消息**（修复 OpenCode doc-vs-code 不一致）；或显式文档"in-place summary marker"作为设计选择。
- **证据**：[internal/tui/tui.go:335-341](../../sources/opencode/internal/tui/tui.go#L335-L341)、[internal/llm/agent/agent.go:535-704](../../sources/opencode/internal/llm/agent/agent.go#L535-L704)。
- **风险**：95% 阈值偏激进，可能在 summarization 完成前下一轮已经 token 超限。

#### ADAPT-4. Subagent 同步等待 + parent cost 累计

- **OpenCode 机制**：父 agent 通过 `agent` tool 创建 Task agent，同步等待；cost 累加到 parent。
- **RoboThree 适配**：保留同步等待（实现简单、确定性强）；但**加入独立 sessionID + 独立 token quota**，避免子 agent 跑飞影响父。
- **证据**：[internal/llm/agent/agent-tool.go:43-97](../../sources/opencode/internal/llm/agent/agent-tool.go#L43-L97)。
- **风险**：同进程无独立权限域；这是 OpenCode 简化带来的代价。

#### ADAPT-5. Project Context Files 注入

- **OpenCode 机制**：`sync.Once` 一次性加载 CLAUDE.md / opencode.md / .cursorrules 等。
- **RoboThree 适配**：保留**目录感知**的 context files 注入；但**改为可热重载**（OpenCode 一次缓存整个进程，working dir 切换时会复用旧 context）。
- **证据**：[internal/llm/prompt/prompt.go:46-58](../../sources/opencode/internal/llm/prompt/prompt.go#L46-L58)、[internal/config/config.go:82-119](../../sources/opencode/internal/config/config.go#L82-L119)。
- **风险**：Context 文件无大小 / token 预算，无敏感内容过滤——RoboThree MVP 必须补全。

#### ADAPT-6. MCP Tool 动态发现

- **OpenCode 机制**：启动时 `GetMcpTools` 一次发现；结果缓存到全局 `mcpTools []BaseTool`；每次 tool call **重新建立 client + Initialize + Close**。
- **RoboThree 适配**：保留启动时发现；但**复用 client 实例**（持久连接），避免 stdio 启动开销。
- **证据**：[internal/llm/agent/mcp-tools.go:169-201](../../sources/opencode/internal/llm/agent/mcp-tools.go#L169-L201)、[mcp-tools.go:86-129](../../sources/opencode/internal/llm/agent/mcp-tools.go#L86-L129)。
- **风险**：高延迟 MCP server 会显著拖慢 tool call。

### 2.3 DEFER

#### DEFER-1. Multiple Provider Adapter 全套

- OpenCode 实现了 11+ provider；RoboThree MVP 只需 Anthropic + OpenAI-compat（覆盖大部分模型市场），其余延后。

#### DEFER-2. Bash 命令黑名单

- OpenCode 维护了一份手工 blacklist（[bash.go:41-45](../../sources/opencode/internal/llm/tools/bash.go#L41-L45)）+ safe-readonly whitelist。
- RoboThree MVP 可以采用 policy file 简单实现，不立即做精细 deny list。

#### DEFER-3. Auto Compact 摘要 prompt 调优

- OpenCode 的 summarization prompt 简单（[agent.go:590](../../sources/opencode/internal/llm/agent/agent.go#L590)）。
- RoboThree MVP 简单抄 prompt 即可；后续可针对 context 丢失问题调优。

#### DEFER-4. Non-Interactive JSON 输出

- OpenCode 支持 text / json 输出格式（[app.go:100-161](../../sources/opencode/internal/app/app.go#L100-L161)）。
- RoboThree MVP 只需 text 输出，JSON 留到 IDE / SDK 集成阶段。

### 2.4 REJECT

#### REJECT-1. Persistent Shell

- **OpenCode 机制**：进程级 singleton shell，env 跨调用持久化。
- **理由拒绝**：持久状态 + `eval` 执行模型生成的命令 = 等价于无沙箱 shell。
- **RoboThree 替代**：每次 bash 调用 fork 新进程 + `seccomp`/`bubblewrap` profile；或仅允许 allowlist 命令 + 显式 cwd reset。
- **证据**：[internal/llm/tools/shell/shell.go:42-130](../../sources/opencode/internal/llm/tools/shell/shell.go#L42-L130)。

#### REJECT-2. Non-Interactive Auto-Approve All

- **OpenCode 机制**：`opencode -p "..."` 自动批准该 session 所有权限（[app.go:129](../../sources/opencode/internal/app/app.go#L129)）。
- **理由拒绝**：CI/脚本场景下的便利性 vs 风险失衡；模型生成的 bash 命令可破坏生产环境。
- **RoboThree 替代**：非交互模式必须显式指定 allowlist（如 `--allow-write=./src/**`），或要求 ENV 变量 `ROBOTHREE_ALLOW_ALL=true`。
- **证据**：[internal/permission/permission.go:74-76](../../sources/opencode/internal/permission/permission.go#L74-L76)。

#### REJECT-3. 无 Timeout 的 Permission Channel

- **OpenCode 机制**：`resp := <-respCh` 无超时（[permission.go:106](../../sources/opencode/internal/permission/permission.go#L106)）。
- **理由拒绝**：headless / 测试 / 崩溃恢复场景会永久阻塞 tool。
- **RoboThree 替代**：Permission request 必须支持 timeout + context cancel；超时默认 deny。
- **证据**：[permission.go:106](../../sources/opencode/internal/permission/permission.go#L106)。

#### REJECT-4. Command Denylist-only 安全边界

- **OpenCode 机制**：唯一边界是命令黑名单 + path permission。
- **理由拒绝**：denylist 容易被 shell 语法 / 包装命令 / 别名绕过；不是纵深防御。
- **RoboThree 替代**：必须至少加两层——OS-level sandbox（seccomp/bubblewrap/macOS sandbox-exec）+ application-level permission。

#### REJECT-5. Path Permission 字符串前缀判断

- **OpenCode 机制**：`strings.HasPrefix(filePath, rootDir)` 决定 permission path（[write.go:166](../../sources/opencode/internal/llm/tools/write.go#L166)）。
- **理由拒绝**：相邻前缀路径（如 `/workspace/project2` 被字符串判断为位于 `/workspace/project`）会**错误授予**。
- **RoboThree 替代**：用 `filepath.Rel` + 显式 path allowlist + 符号链接检查（`O_NOFOLLOW`）。
- **证据**：[internal/llm/tools/write.go:164-168](../../sources/opencode/internal/llm/tools/write.go#L164-L168)。

### 2.5 NEEDS_MORE_EVIDENCE

#### NEEDS-1. ImageURL Part 反序列化 bug

- **机制**：在 `unmarshallParts()` 的 `imageURLType` 分支未 append `part`。
- **静态发现**：源码层面看起来有 bug；需运行项目或读 unit test 确认是否实际丢 part。
- **How to Close**：git clone + 单元测试，或写一个最小重现 case。

#### NEEDS-2. Tool call 并发 vs 串行选择的依据

- **静态发现**：OpenCode 选择串行；其他框架（Claude Code、Aider）有混合并行。
- **证据缺口**：OpenCode 是否有 benchmark 表明串行更优？
- **How to Close**：阅读 README/CHANGELOG 历史 commit，或对比 Hermes Agent / Claude Code。

#### NEEDS-3. Provider retry 8 次的最大延迟

- **静态发现**：retry count 已知，**backoff 策略**未深读。
- **How to Close**：阅读 [provider/anthropic.go](../../sources/opencode/internal/llm/provider/anthropic.go) 的 retry loop。

## 3. Proposed RoboThree Changes

> 列出会影响 RoboThree 模块边界 / 技术栈 / 数据模型 / 安全模型 / 部署形态的候选变更。
> **仅作为提议，未自动落地。**

| # | 候选变更 | 影响的 RoboThree 维度 | 来源 |
|---|---|---|---|
| C1 | Agent loop 复用 OpenCode 的 stream → tool → next round 循环 | Runtime / Agent 核心 | ADOPT-3 |
| C2 | Provider 抽象统一 10 种 event 类型 | Runtime / Provider 抽象 | ADOPT-2 |
| C3 | SQLite + Goose + sqlc 三栈 | 数据持久化 | ADOPT-1 |
| C4 | Tool Set 分级（Coder 全套 / Task 只读） | Tool Runtime | ADOPT-4 |
| C5 | Permission 必须加 timeout + context cancel | Security | REJECT-3 |
| C6 | Path permission 改用 `filepath.Rel` + 显式 allowlist | Security | REJECT-5 |
| C7 | Bash 必须 fork 新进程 + sandbox | Security | REJECT-1, REJECT-4 |
| C8 | Subagent 保留同步等待 + parent cost 累计 | Subagent | ADAPT-4 |
| C9 | MCP 客户端复用，避免每次重建 | MCP | ADAPT-6 |
| C10 | Context Files 注入改为可热重载 | Context | ADAPT-5 |
| C11 | Auto Compact 95% 阈值保留，但摘要改为真实新 session | Context | ADAPT-3 |
| C12 | 非交互模式禁止 auto-approve all | Security / CLI | REJECT-2 |

## 4. Requires Human Approval

> 列出需要用户拍板才能推进 RoboThree 正式架构决策的项。
> 默认状态：`PENDING_HUMAN_DECISION`。

| # | 决策项 | 选项 | 默认建议 | 状态 |
|---|---|---|---|---|
| H1 | 是否采纳 OpenCode 的 SQLite + Goose 持久化方案？ | ADOPT / 评估 Postgres / 评估其他 | ADOPT（C1） | PENDING_HUMAN_DECISION |
| H2 | Agent loop tool call 串行 vs 并行？ | 串行（OpenCode）/ 混合（Claude Code）/ 并行（Pi） | 串行 MVP，并行 Phase 2 | PENDING_HUMAN_DECISION |
| H3 | Bash tool sandbox 实现？ | macOS sandbox-exec / bubblewrap / docker / 不实现 | bubblewrap（Linux 优先）+ macOS sandbox-exec | PENDING_HUMAN_DECISION |
| H4 | Permission channel timeout 默认值？ | 5s / 30s / 5min / 永不超时 | 30s（参考 Hermes Agent） | PENDING_HUMAN_DECISION |
| H5 | Auto Compact 阈值？ | 95%（OpenCode）/ 80%（保守）/ 90% | 90%（折中） | PENDING_HUMAN_DECISION |
| H6 | 非交互模式是否完全禁止 auto-approve？ | 禁止 / 显式 flag | 禁止 + `--allow-read-only` 显式 flag | PENDING_HUMAN_DECISION |
| H7 | Subagent 是否支持独立 permission 域？ | 支持 / 继承父 session | 继承父 session MVP，独立 Phase 2 | PENDING_HUMAN_DECISION |
| H8 | Provider retry 策略？ | 8 次指数退避（OpenCode）/ 3 次 / 关闭 | 3 次 + 显式 logging | PENDING_HUMAN_DECISION |

## 5. License & Reuse Boundary

- **License**：MIT（[LICENSE](../../sources/opencode/LICENSE)），允许复制设计模式 / 接口设计 / 复用消息 schema。
- **不建议复用**：
  - Persistent Shell 实现（[shell.go](../../sources/opencode/internal/llm/tools/shell/shell.go)）—— REJECT。
  - Non-interactive AutoApprove 实现（[app.go:129](../../sources/opencode/internal/app/app.go#L129)）—— REJECT。
- **DESIGN_ONLY**：
  - Provider 抽象设计（[provider.go](../../sources/opencode/internal/llm/provider/provider.go)）。
  - Agent loop 整体结构（[agent.go](../../sources/opencode/internal/llm/agent/agent.go)）。
  - SQLite schema（[migrations/*.sql](../../sources/opencode/internal/db/migrations/)）。
- **不可直接复制**：message parts 的 unmarshall 逻辑（潜在 bug）、permission service 实现（缺 timeout）。