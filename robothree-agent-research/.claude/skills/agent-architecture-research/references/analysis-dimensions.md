# Analysis Dimensions

> Agent 架构研究的标准维度清单、检查项、常见实现方式、常见误判。
> Skill 在 Level 2 / Level 3 必须对每个维度形成结构化结论。

---

## 0. 如何使用本文档

1. 每个维度都包含：**核心问题 / 必查项 / 常见实现 / 常见误判 / 写到哪个模板**。
2. 研究者按维度逐项打勾；遗漏项在 `open-questions.md` 显式登记。
3. "常见误判"列出的反模式是默认需要排除的假设；保留假设必须引用证据。

---

## 1. Project Positioning（项目定位）

**核心问题**

- 谁（产品 vs 框架 vs SDK vs Library）。
- 解决什么用户问题（不要复述 README）。
- 处于 "Agent" 谱系中的哪个位置（Coding / Computer Use / Multi-Agent / Skill / MCP / Memory / Gateway / Worker）。

**必查项**

- LICENSE 与对外公开的"声明能力"是否一致。
- 主要 commit history 的活跃方向（功能 / 重构 / 修安全）。

**常见实现**

- 单仓 CLI / TUI / Server。
- Monorepo with 多 package（core / cli / server / web）。
- npm/pnpm workspace + Turbo / Nx。

**常见误判**

- "Agent" 仅指聊天机器人包装。
- "Multi-Agent" 实际只是 Prompt 角色切换。

**写到** `templates/project-overview.md`。

---

## 2. Entry Points（程序入口）

**核心问题**

- 真实入口文件 / 函数 / Task / Command，而不是 `package.json` script。

**必查项**

- CLI：`bin/*`、`main` 字段、commander/yargs 入口。
- Server / Daemon：HTTP server、gRPC server、消息 consumer、scheduler driver。
- Desktop / TUI：Electron main、Textual app、Ink app。
- Background job：`worker.ts`、`runner.ts`、crontab。

**常见实现**

- `src/cli/index.ts`、`bin/<name>`、`src/main.ts`、`src/server.ts`。
- `cmd/<package>/main.go`。
- `python -m <package>`。

**常见误判**

- 把 `dist/index.js` 当作主循环入口（dist 是构建产物，不能作为唯一证据）。

**写到** `templates/source-map.md` 的 Entry Points 节。

---

## 3. Agent Runtime / Agent 主循环

**核心问题**

- 主循环实体：函数 / 类 / Task / Workflow / Actor。
- 推进机制：while loop / recursive / Event Loop / State Machine / Task Queue。
- 退出条件、轮次上限、超时、中断。
- 是否存在隐藏的二次模型调用（planning / summarizing / routing / judging / reranking）。
- 是否存在后台 Agent Loop。

**必查项**

- 循环开始位置（`while`、`for`、`whileTrue`、`live()`）。
- 终止判定（`if finish_reason`、`if tool_calls.length === 0`、`if stop_reason`）。
- 中断处理（cancellation token / AbortSignal）。
- 重试策略（次数 / 退避 / 兜底模型）。

**常见实现**

```text
loop:
    model_response = call_model(context)
    if no_tool_calls: break
    for tool_call in model_response.tool_calls:
        result = await run_tool(tool_call)
        append_tool_result(context, result)
    if step >= max_steps: break
```

- LangGraph: `StateGraph` / `addNode`。
- CrewAI: `Crew.kickoff`。
- AutoGen: `RoutedAgent.on_messages`。

**常见误判**

- 仅看 `run()` 不看 state update / persistence。
- 把 streaming 当作"主循环"证据（streaming 只是 IO，主循环是控制流）。

**写到** `templates/architecture.md` + `templates/runtime-sequence.md`。

---

## 4. Model Layer（模型适配层）

**核心问题**

- 是否存在统一 `ModelAdapter` 接口。
- Provider 注册方式（factory / registry / DI）。
- Chat / Responses / Completion / Custom 协议如何统一。
- Tool Calling Schema 转换、Streaming 统一、Retry / Backoff / Fallback。
- 主模型、规划模型、总结模型、审核模型、嵌入模型、路由模型是否分开。
- 本地模型 / OpenAI-compatible API / 多模型支持。
- Token Usage 记录与 Cost 计算。

**必查项**

- Provider 实现目录（`providers/`、`adapters/`、`llm/`）。
- 统一接口（`generate()`、`stream()`、`invoke()`）。
- 多模型路由（Router / Pool）。
- 不支持 Tool Calling 的模型如何 fallback。

**常见实现**

- `BaseChatModel` (LangChain)。
- ChatCompletion / AnthropicMessages / Gemini 多个 Provider 抽象。
- "Router" Provider 选主备。

**常见误判**

- 仅暴露 `openai.completion()` 调用，不算模型层。
- Provider 切换支持是指配置文件支持，运行时是否真切换需要 trace。

**写到** `templates/model-system.md`。

---

## 5. Context Layer（Context Assembly）

**核心问题**

- System Prompt 来源与优先级。
- Skill / Tool / MCP Tool 描述如何注入。
- Memory / 文件 / 搜索结果如何注入。
- Token Budget 分配、Context Window 估算。
- 压缩 / 摘要 / Truncation 触发条件。
- 是否区分短期上下文与长期记忆。
- 是否存在 Prompt Cache、向量检索、重复静态内容浪费。
- Tool Result 是否作为不可信输入处理。

**必查项**

- `systemPrompt` 构造器（`buildSystemPrompt(messages, env)`）。
- 优先级合并：用户 > 项目 > 仓库 > 系统。
- Token 估算（tiktoken / 估算函数）。
- Compress / Trim / Summarize 函数。

**常见实现**

- LangChain `SystemMessagePromptTemplate`。
- "ContextBuilder" / `PromptComposer` / `MessageBuilder`。
- 各种 `Trimmer` / `Compactor`。

**常见误判**

- "支持 Memory" 仅指传入 `memory` 变量；未验证是否真的写入 / 读取。
- "Prompt Cache" 仅是文档术语，没有 cache key 与命中验证。

**写到** `templates/context-system.md`。

---

## 6. Tool Layer（Tool Runtime）

**核心问题**

- Tool 接口 / Schema（JSON Schema / Zod / Pydantic）。
- Registry 发现 / 注册机制（`@tool` 装饰器、`ToolRegistry.register()`）。
- Dispatch 执行、参数校验、返回值标准化、错误格式。
- 超时、取消、并发、重试、幂等、Result 截断、大结果存储、二进制结果、Streaming Result。
- Remote Tool、MCP Tool、内置 Tool、Skill Tool、Plugin Tool 关系。
- Tool 权限、生命周期、日志、Trace、Cost、Name Collision、Version、Dependency。

**必查项**

- `ToolRegistry` / `ToolDispatcher` 类。
- 错误如何变成 Model 可见的 `tool_result`（结构 vs 字符串）。
- 大结果存储（artifact / file / cache）。
- Tool approval。

**常见实现**

```python
class Tool(Protocol):
    name: str
    description: str
    schema: dict
    def run(self, args, ctx) -> ToolResult: ...
```

- MCP `tools/list`、`tools/call`。
- LangChain `@tool` 装饰器。

**常见误判**

- 所有 Tool 都是"内置"——不代表有扩展机制。
- "支持 MCP" 仅是几个 wrapper 函数，没有完整 host 流程。

**写到** `templates/tool-system.md`。

---

## 7. Session / Runtime State / Memory

**核心问题（严格三分类）**

- **Session**：ID、生命周期、并发、隔离、多端同步、所属用户/项目/Workspace、锁。
- **Runtime State**：当前任务 / 计划 / 步骤 / Tool Call / 文件 / 权限 / 模型 / Token / Subagent / Pending Action / Stream / Retry / Error / Checkpoint / Cancellation。
- **Memory**：Working / Episodic / Semantic / User / Project / Skill / Vector / Structured / Summary / Cross-session。写入策略、读取策略、遗忘、修正、隐私、Scope、Namespace、冲突、版本、TTL、嵌入、排序、注入、Approval。

**必查项**

- Session 存储（SQLite / JSONL / Postgres / Redis）。
- Runtime State 是否独立于 Session。
- Memory 分层是宣传还是落地代码。

**常见误判**

- 把 `messages` 历史当成 Memory。
- 把 Memory 当成 Session。
- 把"向量数据库引用"当成"长期记忆"，未验证写入路径。

**写到** `templates/session-state-memory.md`。

---

## 8. Skill / Plugin / Hook / MCP

**核心问题（严格四分类）**

| 维度 | 文件 / 声明 | 加载机制 | 触发 | 隔离 | 权限 |
| --- | --- | --- | --- | --- | --- |
| **Skill** | `SKILL.md` / Manifest | Discovery + load | 模型触发 / 命令触发 | 通常 prompt 层 | 由 Skill 自身声明 |
| **Plugin** | Plugin Manifest | Install + enable | 启动加载 | 进程 / ABI 边界 | 显式权限字段 |
| **Hook** | 回调 / 监听器 | 注册表 | 生命周期触发 | 同步 / 异步 | 是否可阻断 |
| **MCP** | MCP Server | stdio / http / ws | Tool 描述 | Server 进程 | Tool Approval |

**必查项**

- Skill Manifest schema。
- Plugin install / uninstall / enable / disable / version / dependency。
- Hook 类型（preToolUse / postToolUse / UserPromptSubmit / Stop）、同步 vs 异步、能否改输入 / 输出、能否阻断、异常处理。
- MCP：Client/Server、Transport、Reconnect、Timeout、Tool 冲突、多 Server 管理、Server Trust、Tool Approval。

**常见实现**

- Anthropic `SKILL.md`、OpenAI `tools`、`plugin.json`、Claude Code `settings.json hooks`。
- MCP: `@modelcontextprotocol/sdk`。

**常见误判**

- 把 SKILL.md 当成 Plugin。
- 把 Hook 描述当成 Plugin。
- "支持 MCP" 仅是 import 一个包，未实际跑 `tools/list`。

**写到** `templates/skill-plugin-mcp.md`。

---

## 9. Subagent / Worker / Multi-Agent

**核心问题**

- Subagent 真正类型：独立进程 / 线程 / Task / 对象 / Prompt Role / Workflow Node / Background Job / Remote Agent。
- 是否独立 Session、Context、Tool Set、权限。
- 是否可并行、可递归、是否有深度 / 预算限制。
- 是否共享 Memory、文件系统、Workspace。
- 是否支持聚合、Hand-off、取消、恢复。
- 死循环、重复执行、权限放大、上下文泄漏风险。

**必查项**

- Subagent 类型枚举代码。
- 深度限制 / 预算限制代码。
- 权限继承代码。

**常见误判**

- "Multi-Agent" 仅是 `subagent_type: "general"` + 同一进程同一 Session。
- "Subagent 独立" 仅指 Prompt 拼装，未隔离权限。

**写到** `templates/subagent-system.md`。

---

## 10. Permission System（权限系统）

**核心问题**

- 是否 deny-by-default。
- 拦截点是在 Tool dispatcher、Runtime、UI 提示？
- Allowlist / Denylist / 路径 / 命令 / 网络目标策略。
- Workspace boundary、Path Traversal、Symlink、Command Injection 防御。
- Secret / Env / Token 存储（keychain、envfs、加密文件）。
- Subagent / Background Task 权限继承。
- 审计日志 / Approval Record。
- Remote Worker / Browser / Desktop / Clipboard / Screenshot / Local Network 限制。

**必查项**

- 真实拦截点（grep `permission.check`、`require_approval`、`can_run`）。
- Allowlist 文件（`permissions.json`、`policy.toml`）。

**常见误判**

- "权限确认" = UI 弹窗，仅是 UI 层面。
- "Sandbox" = chroot，未限制网络与信号。

**写到** `templates/permission-system.md`。

---

## 11. Security Review（安全审查）

**核心问题（独立于权限）**

- Shell 执行、文件读写、Git 操作、网络访问、浏览器、桌面。
- Secret 访问、Env 变量、Token、SSH、Remote Execution、Container。
- Sandbox、Workspace Boundary、Path Traversal、Symlink。
- Command Injection、Prompt Injection、Tool Injection、MCP Server Trust。
- Malicious Repository、Dependency Installation、Package Script（pre/post）、Telemetry、Log Leak、Memory Leak、Cross-session Leak、Multi-user Isolation。
- MCP Server Trust、Tool Result 注入、Subagent 权限、Background Task、Auto Resume、Remote Worker。
- Browser Download、Clipboard、Screenshot、Desktop Input。
- Local Network、Cloud Metadata Service。

**必查项**

- Threat model 文件。
- 漏洞历史（issues、CVEs）。
- 已知 bypass（`git config --global`，`--upload-pack`，symlink）。

**写到** `templates/security-review.md` + `references/security-review.md`。

---

## 12. Persistence

**核心问题**

- 存储介质：SQLite / Postgres / Redis / 文件 / blob。
- 模式：JSONL / SQL / KV。
- 持久化时机：每 step / 每轮 / checkpoint / 仅终止。
- 加密、压缩、索引、查询、归档。
- 数据迁移路径。

**写到** `templates/architecture.md` Persistence 节。

---

## 13. Deployment / Runtime Boundary

**核心问题**

- Local / Desktop / CLI / Web / Server / VPS / Container / Serverless / Mobile / Browser / Hybrid。
- Agent Runtime、Tool、文件系统、Workspace 的归属。
- UI 与 Runtime 通信方式（IPC / HTTP / WebSocket / RPC）。
- 远程任务支持、离线支持、多设备、多用户、企业隔离。
- Gateway / Control Plane / Data Plane 边界。
- 队列、Scheduler、Daemon、Background Service。
- Worker 注册 / 认证 / 状态上报。
- 升级 / Crash Recovery / 任务恢复。

**写到** `templates/deployment-model.md`。

---

## 14. Observability / Reliability

**核心问题**

- 日志 / Trace / Metrics / Token Usage / Cost / Tool Timing / Model Latency / Queue Latency。
- Retry / Backoff / Timeout / Circuit Breaker / Checkpoint / Resume / Idempotency / DLQ。
- Error Classification、Partial Result、User Cancellation、Audit、Debug Mode、Replay、Event History、State Snapshot。
- Health Check / Heartbeat / Rate Limit / Resource Limit / Concurrency Limit / Budget / Token / Cost。

**写到** `templates/observability-reliability.md`。

---

## 15. License / Reuse Boundary

**核心问题**

- 根目录 + 子目录 + 子模块 + 第三方 + 生成代码 + Vendor + 模型 + 数据集 + 依赖许可证。
- 商业使用 / SaaS / Network Copyleft / Trademark / Patent。
- Attribution 要求、N类传染性。

**必查项**

- 多 LICENSE 文件（per-directory / per-package）。
- NOTICE、THIRD_PARTY_LICENSES。
- 依赖许可证审计（`license-checker`、`pip-licenses`）。

**写到** `templates/license-review.md` + `references/license-review.md`。

---

## 16. RoboThree 映射

**核心问题**

- 见 `references/robothree-evaluation.md`。

**写到** `templates/reusable-patterns.md` + `templates/risks-and-limitations.md` + `templates/robothree-fit-analysis.md` + `templates/open-questions.md`。
