# OpenClaw — Subagent System & Worker

> 分析 Multi-Agent、Subagent、Worker、ACP 协议的实现。
> 触发条件：存在真实多 Agent（独立 Session / ToolSet / 权限）

## 1. Subagent Architecture

### 1.1 Subagent 概念

**[F]** OpenClaw 支持 Subagent（子代理）架构（[`src/agents/subagent-registry.ts`](../../sources/openclaw/src/agents/subagent-registry.ts)）：

- **主 Agent**（Main Agent）：处理用户对话的主代理
- **Subagent**（Subagent）：主 Agent 通过工具调用生成的子代理
- **Subagent Registry**：运行时注册表，管理所有活跃 Subagent

### 1.2 Subagent 注册

**[F]** Subagent Registry 函数（[`src/agents/subagent-registry.ts:1758-1788`](../../sources/openclaw/src/agents/subagent-registry.ts#L1758-L1788)）：

```typescript
export function registerSubagentRun(params: RegisterSubagentRunParams) { ... }
export function markSubagentRunTerminated(params: { ... }) { ... }
export function listSubagentRunsForController(controllerSessionKey: string) { ... }
export function replaceSubagentRunAfterSteer(params: { ... }) { ... }
```

### 1.3 Subagent Capabilities

**[F]** Subagent 能力管理（[`src/agents/subagent-capabilities.ts`](../../sources/openclaw/src/agents/subagent-capabilities.ts)）：

- `isSubagentEnvelopeSession()`：判断一个 Session 是否是 Subagent
- `resolveSubagentCapabilityStore()`：解析 Subagent 的能力集
- Subagent 的工具权限可以独立于主 Agent

### 1.4 Subagent 生命周期

**[F]** Subagent 生命周期关键节点：

1. **Spawn**（[`src/agents/acp-spawn.ts`](../../sources/openclaw/src/agents/acp-spawn.ts)）：通过 ACP 协议创建
2. **Run Generation**（[`src/agents/subagent-run-generation.ts`](../../sources/openclaw/src/agents/subagent-run-generation.ts)）：运行代数管理
3. **Timeout**（[`src/agents/subagent-run-timeout.ts`](../../sources/openclaw/src/agents/subagent-run-timeout.ts)）：超时控制
4. **Liveness**（[`src/agents/subagent-run-liveness.ts`](../../sources/openclaw/src/agents/subagent-run-liveness.ts)）：存活检测
5. **Termination**：标记终止并从 Registry 移除
6. **Reconciliation**（[`src/agents/subagent-session-reconciliation.ts`](../../sources/openclaw/src/agents/subagent-session-reconciliation.ts)）：孤儿进程回收

### 1.5 ACP (Agent Client Protocol)

**[F]** ACP 协议支持（[`src/acp/`](../../sources/openclaw/src/acp/) + `packages/acp-core/`）：

- `@agentclientprotocol/sdk` 1.1.0
- ACP 用于 Subagent 与主 Agent 之间的通信
- `acp-spawn-parent-stream.ts`：父 Agent ↔ Subagent 流式通信

## 2. Worker System

### 2.1 Worker 架构

**[F]** Worker 系统（[`src/worker/`](../../sources/openclaw/src/worker/)）：

| 文件 | 作用 |
| --- | --- |
| `worker.runtime.ts` | Worker 运行时入口 |
| `embedded-agent.runtime.ts` | 嵌入式 Agent Worker |
| `worker-connection.ts` | Worker 连接管理 |
| `worker-connection-frames.ts` | Worker 消息帧协议 |
| `worker-connection-admission.ts` | Worker 连接准入 |
| `worker-rpc-clients.ts` | Worker RPC 客户端 |

### 2.2 Worker 类型

**[F]** Worker 系统的几种模式：

1. **Embedded Worker**（[`src/worker/embedded-agent.runtime.ts`](../../sources/openclaw/src/worker/embedded-agent.runtime.ts)）：同一进程内的 Agent worker
2. **Inference Worker**（[`src/worker/inference-stream.runtime.ts`](../../sources/openclaw/src/worker/inference-stream.runtime.ts)）：模型推理流式 Worker
3. **Live Worker**（[`src/worker/embedded-agent-live.runtime.ts`](../../sources/openclaw/src/worker/embedded-agent-live.runtime.ts)）：实时 Agent Worker
4. **Transcript Worker**（[`src/worker/embedded-agent-transcript.runtime.ts`](../../sources/openclaw/src/worker/embedded-agent-transcript.runtime.ts)）：转录处理 Worker

### 2.3 Worker Connection Protocol

**[F]** Worker 之间的通信通过自定义帧协议（[`src/worker/worker-connection-frames.ts`](../../sources/openclaw/src/worker/worker-connection-frames.ts)），支持：

- RPC 调用（[`src/worker/worker-rpc-clients.ts`](../../sources/openclaw/src/worker/worker-rpc-clients.ts)）
- 流式推理（[`src/worker/worker-rpc-inference-client.ts`](../../sources/openclaw/src/worker/worker-rpc-inference-client.ts)）
- 实时事件（[`src/worker/worker-rpc-live-event-client.ts`](../../sources/openclaw/src/worker/worker-rpc-live-event-client.ts)）
- 转录同步（[`src/worker/worker-rpc-transcript-client.ts`](../../sources/openclaw/src/worker/worker-rpc-transcript-client.ts)）

## 3. Fleet Management

**[F]** Fleet 系统（[`src/fleet/`](../../sources/openclaw/src/fleet/)）：

- **Registry**（[`src/fleet/registry.ts`](../../sources/openclaw/src/fleet/registry.ts)）：Fleet 注册表
- **Containers**（[`src/fleet/containers.runtime.ts`](../../sources/openclaw/src/fleet/containers.runtime.ts)）：容器管理
- **Backup**（[`src/fleet/backup.runtime.ts`](../../sources/openclaw/src/fleet/backup.runtime.ts)）：备份管理
- **Doctor**（[`src/fleet/doctor.runtime.ts`](../../sources/openclaw/src/fleet/doctor.runtime.ts)）：诊断工具
- **Service**（[`src/fleet/service.runtime.ts`](../../sources/openclaw/src/fleet/service.runtime.ts)）：服务管理

**[I]** Fleet 系统面向多实例部署场景（如多台机器运行 OpenClaw），对单用户 MVP 不是必需。

## 4. 与 RoboThree 的相关性

| 机制 | RoboThree 映射方向 | 理由 |
| --- | --- | --- |
| **Subagent 独立 Session** | **ADAPT** | Subagent 用独立 Session + 受限 ToolSet 是好的隔离模式 |
| **Subagent Registry** | **ADAPT** | 运行时注册表管理 Subagent 生命周期 |
| **ACP 协议** | **DEFER** | Agent 间通信协议标准化很重要，但非 MVP 必需 |
| **Worker 帧协议** | **REJECT** | 自定义协议增加复杂性，前期用 WebSocket + JSON 足够 |
| **Fleet Management** | **DEFER** | 多实例 Fleet 管理是规模化后的事 |
| **Subagent Timeout** | **ADOPT** | 子任务超时控制是生产必需的 |
