# OpenClaw — Tool System & Background Tasks

> 分析 Agent Tool Runtime、Cron 后台任务系统、Tool Policy、工具安全模型。
> 触发条件：Tool Runtime 复杂 + 存在队列/恢复/Checkpoint

## 1. Tool System

### 1.1 工具类型

**[F]** 工具类型定义（[`src/tools/types.ts`](../../sources/openclaw/src/tools/types.ts)）：

Agent 可用的工具覆盖：

| 工具类别 | 示例 | 实现位置 |
| --- | --- | --- |
| **消息** | `message` (send to any channel) | `src/channels/plugins/types.core.ts:70-79` |
| **Shell** | `system.run` (sandboxed exec) | `src/node-host/invoke-system-run.ts` |
| **浏览器** | `browser` (Playwright) | `extensions/browser/` |
| **文件** | `file.*` (read/write/list) | `src/node-host/invoke-file-commands.ts` |
| **记忆** | `memory.search` (semantic recall) | `extensions/active-memory/` |
| **Web** | `web.search`, `web.fetch` | `src/web-search/`, `src/web-fetch/` |
| **Canvas** | `canvas.*` (image gen/edit) | `extensions/canvas/` |
| **设备** | `device.*` (app control) | `src/node-host/invoke-device-apps.ts` |
| **MCP** | External MCP tools | `src/mcp/channel-tools.ts` |
| **AskUser** | `ask_user` (human approval) | `src/agents/tools/ask-user-tool.ts` |

### 1.2 Tool Policy

**[F]** 工具策略控制（[`src/agents/tool-policy.ts`](../../sources/openclaw/src/agents/tool-policy.ts)）：

- **Policy Match**（[`src/agents/tool-policy-match.ts`](../../sources/openclaw/src/agents/tool-policy-match.ts)）：`isToolAllowedByPolicies()` 检查
- **Group Policy**（[`src/agents/agent-tools.policy.ts`](../../sources/openclaw/src/agents/agent-tools.policy.ts)）：群组会话可能需要更严格的工具限制
- **Subagent Policy**：子 Agent 的工具权限可以独立于主 Agent
- **Also Allow**：`mergeAlsoAllowPolicy()` 合并允许的工具列表

**[F]** Tool Profile Policy（[`src/agents/tool-policy.ts:mergeAlsoAllowPolicy`](../../sources/openclaw/src/agents/tool-policy.ts)）：不同 session 可以有不同 tool 策略。

### 1.3 Tool Call Repair

**[F]** Tool Call Repair（`packages/tool-call-repair/`）：当 LLM 生成的 tool_call 参数不符合 Schema 时，自动修复。

### 1.4 Tool Result Middleware

**[F]** Tool Result Middleware（[`src/plugins/agent-tool-result-middleware.ts`](../../sources/openclaw/src/plugins/agent-tool-result-middleware.ts)）：Plugin 可以注册中间件来处理工具执行结果。

## 2. Background Tasks (Cron System)

### 2.1 Cron Service 架构

**[F]** Cron Service 是 SQLite 支持的定时任务系统（[`src/cron/service.ts`](../../sources/openclaw/src/cron/service.ts)）：

```typescript
export class CronService implements CronServiceContract {
  async start() { /* start scheduler */ }
  stop() { /* stop scheduler */ }
  pauseScheduling() { /* pause */ }
  async add(job: CronJobCreate, options?: CronAddOptions): Promise<CronJob> { ... }
  async update(id: string, patch: CronJobPatch): Promise<CronJob> { ... }
  async remove(id: string): Promise<void> { ... }
  async list(options?: CronListPageOptions): Promise<CronJob[]> { ... }
  async wake(ids: string[], mode?: CronWakeMode): Promise<void> { ... }
}
```

### 2.2 Job 类型

**[F]** Cron Job 分类：

| Job 类型 | 说明 |
| --- | --- |
| **Scheduled** | 按 Cron 表达式定期执行 |
| **One-shot** | 一次性执行 |
| **Heartbeat** | 心跳监控，检查渠道健康 |
| **Isolated Agent** | 独立的 Agent 执行（专用 session） |

### 2.3 Job 存储

**[F]** Job 数据存储在 SQLite（[`src/cron/store.ts`](../../sources/openclaw/src/cron/store.ts)）：

- **持久化 Schema**：Job ID、schedule、状态、上次运行时间、下次运行时间
- **Job Session Bindings**（[`src/cron/job-session-bindings.ts`](../../sources/openclaw/src/cron/job-session-bindings.ts)）：Job 与 Session 的绑定关系
- **Session Reaper**（[`src/cron/session-reaper.ts`](../../sources/openclaw/src/cron/session-reaper.ts)）：清理过期 Session 的后台任务

### 2.4 Isolated Agent（隔离执行）

**[F]** Cron Job 通过 Isolated Agent 执行（[`src/cron/isolated-agent.ts`](../../sources/openclaw/src/cron/isolated-agent.ts)）：

- **独立 Auth Profile**：Isolated Agent 可以有自己的认证配置
- **独立 Session**：不与用户的普通对话 Session 混淆
- **Delivery Awareness**：知道自己的输出应该发送到哪个 Channel

### 2.5 调度与容错

**[F]** Cron 调度特性：

- **Stagger**（[`src/cron/stagger.ts`](../../sources/openclaw/src/cron/stagger.ts)）：避免多个 Job 同时触发
- **Heartbeat Policy**（[`src/cron/heartbeat-policy.ts`](../../sources/openclaw/src/cron/heartbeat-policy.ts)）：心跳超时检测
- **Retry Hint**（[`src/cron/retry-hint.ts`](../../sources/openclaw/src/cron/retry-hint.ts)）：失败重试策略建议
- **Restart Catchup**：重启后补运行错过的 Job（["service.restart-catchup.test.ts"](../../sources/openclaw/src/cron/service.restart-catchup.test.ts)）

## 3. 与 RoboThree 的相关性

| 机制 | RoboThree 映射方向 | 理由 |
| --- | --- | --- |
| **Tool Policy 分层** | **ADOPT** | Group/Subagent/Global 三层策略模型值得采纳 |
| **Cron Service + SQLite** | **ADAPT** | 后台任务需要定时调度能力 |
| **Isolated Agent for Cron** | **ADAPT** | 后台任务用独立 Session 执行避免污染用户对话 |
| **Heartbeat 监控** | **DEFER** | Channel 健康监控非 MVP 必需 |
| **Session Reaper** | **ADAPT** | 自动清理过期 Session 是好的运维实践 |
| **Tool Call Repair** | **DEFER** | LLM 已足够可靠时修复层增加复杂性 |
| **Tool Result Middleware** | **ADAPT** | Plugin 可注册中间件处理工具结果 |
