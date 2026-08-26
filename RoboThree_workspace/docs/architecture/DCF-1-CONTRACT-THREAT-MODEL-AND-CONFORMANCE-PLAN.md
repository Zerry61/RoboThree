# RoboThree DCF-1 Contract、威胁模型与 Conformance 方案

> 状态：**CONFIRMED_WITH_SPECIFIED_REVISIONS**  
> 日期：2026-07-24  
> 适用批次：Desktop Client Foundation 1  
> 前置事实：DCF-0、CGF-0、Java Toolchain 均 `CLOSED`  
> 语义基线：Desktop Local Runtime Contract `v1alpha1 ACCEPTED`、ADR-002、ADR-006、ADR-010、ADR-011、ADR-012  
> 编码状态：**DCF-1.0～1.2 PASS/CLOSED；DCF-1.3 PLAN PROPOSED / CODING GATED**

## 1. 本方案要解决什么

DCF-0 已验证 Electron Main、Preload、Renderer 和 Local Core 子进程的安全边界，
但当前只有明确标记为 Fixture 的状态接口。DCF-1 需要建立第一套正式 Desktop
业务 Contract，让用户可以完成：

```text
选择 Workspace
→ 创建/打开 Session
→ 查看可运行 Agent 与合法 Model
→ 提交一个 Turn
→ 使用 Scripted/Fake Model 获得流式回答
→ 断线或重启后恢复 Session、Message 和 Task 摘要
```

DCF-1 的核心不是做完整 UI，而是冻结并验证：

- Desktop Main ↔ Local Core 的字段级 Contract；
- `submitTurn` 与 Session/Task 双领域协调；
- Snapshot + Durable Event + Ephemeral Delta 的恢复语义；
- 私有 localhost HTTP/SSE 的真实威胁模型；
- Renderer/Preload/Main/Core 的 Conformance。

## 2. DCF-1 范围

### 2.1 本批包含

- Control/Compatibility 正式 Contract；
- WorkspaceGrant 的创建、查询和撤销；
- Session 的创建、查询、重命名和删除；
- Conversation Snapshot 与持久 Message Projection；
- Agent/Model 最小 Projection；
- Skill/Tool/Knowledge 只读摘要；
- `TaskSelectionRequest`、`submitTurn` 和 `SubmitTurnReceipt`；
- `TaskRuntimeSelection` 与 Model/Tool Capability Lock 的持久化；
- Scripted/Fake Model streaming；
- 最小 Task Summary；
- Durable Event Cursor、SSE 重连和最终 Message 收敛；
- Desktop 重启、Local Core 重启和崩溃恢复；
- 最小工作台 UI。

### 2.2 本批不包含

- 真实企业 Model 或个人 Model；
- API Key、OS Keychain 或 Credential Broker；
- 完整 Task 详情、Tool Activity 和 UserConfirmation UI；
- Artifact 预览；
- Agent 草稿编辑器；
- 真实 Skill Reader；
- Knowledge 查询执行；
- 企业配置同步与 Runtime Activation 实现；
- Agent/Skill 发布审核；
- Admin Console；
- Multi-Agent/Subagent、长期 Memory 或自动模型路由。

DCF-1 可以用 materialized Fake Skill/Knowledge 验证 Runtime Selection，但不得扫描
真实 `.claude/skills` 或把 Skill 当成 Tool。

## 3. Contract 分层

建议在 `packages/contracts` 新建正式 Desktop 领域：

```text
desktop-local/v1alpha1
├── control
├── workspace
├── session
├── catalog
├── submit-turn
├── task-projection
├── event
└── error
```

这些类型供 Electron Main 和 Local Core 共享。Renderer 不获得原始 HTTP/SSE
Client，只通过 Preload 暴露的业务级 API 使用经过裁剪的 Projection。

### 3.1 所有请求的公共 Envelope

最低语义：

```text
contractVersion
commandId 或 queryId
correlationId
clientInstanceId
payload
```

规则：

- Command 必须携带调用者稳定 `commandId`；
- `submitTurn` 还必须携带稳定 `clientTurnId`；
- 同 ID、同 digest 幂等回放；
- 同 ID、不同 digest 返回 typed conflict；
- 不用客户端时间决定幂等、顺序或权限；
- 任何 Secret、启动令牌和 Runtime Handle 都不得进入业务 Envelope。

### 3.2 Control

最低对象：

```text
CompatibilityQuery
CompatibilityProjection
RuntimeStatusProjection
GracefulShutdownCommand
```

Compatibility 至少返回：

```text
coreVersion
supportedContractRange
selectedContractVersion
features[]
runtimeInstanceId
pendingRuntimeActivation
```

`runtimeInstanceId` 只标识当前 Core 启动实例，用于防止把旧 SSE 与新进程混淆，
不是 PID、端口或 Runtime Handle。

### 3.3 Workspace

最低对象：

```text
CreateWorkspaceGrantCommand
RevokeWorkspaceGrantCommand
WorkspaceGrantProjection
WorkspaceGrantSummary
```

Projection 只返回用户可理解信息：

```text
workspaceGrantId
displayName
rootDisplayPath
accessMode
status
createdAt
revokedAt?
```

规则：

- 真实路径由 Electron Main 的系统目录选择器产生，Renderer 不手写任意路径；
- Local Core 按 ADR-002 解析 realpath、符号链接和越界；
- `rootDisplayPath` 用于 UI 展示，不成为文件授权事实；
- 撤销只影响后续访问，不篡改已完成 Task 事实；
- DCF-1 只建立 Workspace 边界，不读取整个目录进入 Prompt。

### 3.4 Session 与 Conversation

最低对象：

```text
CreateSessionCommand
RenameSessionCommand
DeleteSessionCommand
SessionSummary
ConversationSnapshot
MessageProjection
```

`ConversationSnapshot` 至少包含：

```text
sessionId
sessionRevision
messages[]
activeTaskSummaries[]
latestDurableCursor
hasMoreBefore
```

Message Projection 只表达用户可见内容、角色、创建时间、状态和必要关联，不暴露
Compaction Record、Context Snapshot、Prompt Segment、Tool 原始大结果或模型私有
推理过程。

正式命令保留 `DeleteSessionCommand`，但其唯一语义是写入
**tombstone/软删除**，不是立即物理删除，也不同时建立 `archiveSession`。
存在非终态 Task 时必须拒绝并返回 typed error
`session_has_active_task`。用户需要先完成或取消 Task，或处理等待状态。
DCF-1 不实现物理清理、完整回收站或数据保留策略 UI。

### 3.5 Catalog Projection

DCF-1 只需要最小只读查询：

```text
AgentProjection
ModelProjection
SkillSummary
ToolSummary
KnowledgeSummary
```

AgentProjection 至少表达：

```text
agentId / revision
name / identity / goal
defaultModelId
allowModelOverride
eligibleModels[]
requiredModelCapabilities
skill/tool/knowledge summaries
runnable
unavailableReason?
```

`eligibleModels` 只能由 Local Core 的 `ModelEligibilityEvaluator` 计算。Desktop
不得自行求交集、打分或自动选择替代 Model。

### 3.6 submitTurn

最低语义：

```text
SubmitTurnCommand
├── submitTurnCommandId
├── clientTurnId
├── sessionId
├── userInput
└── selectionRequest
    ├── agentId
    ├── requestedModelId?
    ├── selectedSkillIds[]
    ├── selectedKnowledgeIds[]
    └── workspaceGrantId?
```

`SubmitTurnReceipt` 至少返回：

```text
submitTurnCommandId
clientTurnId
userMessageId
taskId
runtimeSelectionId
status
runtimeSelectionSummary
acceptedAt
```

`runtimeSelectionSummary` 只返回用户可理解的 Agent/Model/Skill/Tool/Knowledge/
Workspace 锁定摘要，不返回 TaskCapabilityLock、Binding、AdapterDescriptor 或
RegistrySnapshot 完整内容。

固定处理链继续遵守 ADR-012：

```text
persist SubmitTurnRecord
→ idempotent user Message
→ Task + TaskRuntimeSelection + CapabilityLocks
→ SubmitTurnReceipt
→ commit
→ start Agent Loop
```

### 3.7 最小 Task Projection

DCF-1 只提供：

```text
taskId
sessionId
userMessageId
displayStatus
createdAt
updatedAt
resolvedAgent
resolvedModel
failureSummary?
```

`displayStatus` 是 Desktop Projection，不新增 durable TaskStatus。完整 Task 详情、
Tool Activity、确认卡片和 `uncertain` 人工处理交互在 DCF-2 完成。

## 4. Event 与 Streaming

### 4.1 单一 Desktop Event Stream

推荐 Electron Main 与 Local Core 之间维持**一个受认证的 SSE 连接**，由事件
Envelope 按 Session/Task/Message 关联，不为每个 Task 新建独立连接。

原因：

- 降低连接、重连和资源清理复杂度；
- 便于统一背压和慢消费者处理；
- Desktop 可以同时展示多个 Task；
- 不把 Task Event sequence 误当成 HTTP 连接顺序。

### 4.2 Durable 与 Ephemeral 分离

```text
DesktopEventEnvelope
├── eventId
├── deliveryKind       # durable | ephemeral
├── durableCursor?     # durable only
├── runtimeInstanceId
├── correlation refs
└── typed payload
```

Durable：

- Session/Message 最终事实；
- Task 状态和终态摘要；
- SubmitTurn 恢复结果；
- 需要重启后继续显示的 Runtime Notice。

Ephemeral：

- Assistant token delta；
- 可合并进度；
- 临时 activity。

统一 Stream 使用 critical-first 投递：

- durable/critical event 的优先级高于可合并的 ephemeral delta；
- subscriber buffer 满时，优先合并或淘汰 token/progress delta；
- durable event 不得因 ephemeral buffer 已满而静默丢弃；
- 如果连接已无法承载 durable event，则断开连接，并要求 Desktop 通过
  Snapshot + durable cursor 恢复。

该行为与 KAF-4 `BoundedEventStream` 的 critical-first 原则一致。

### 4.3 Durable Cursor 与保留边界

建立 Application 层 `DesktopDeliveryRecord`：

- 是面向 Desktop 的投递投影，不替代 Session/Task 事实；
- 持有 opaque cursor 与来源 event identity；
- 至少一次投递；
- Desktop 按 eventId 去重；
- cursor 可跨 Core 重启继续；
- 不把 Session sequence、Task sequence 或 Outbox sequence 合并成新领域事实；
- 使用有界数量/时间窗口保留，并具备受控清理和投影代次；
- 具体保留值是可观测的 Alpha 配置，不是长期产品 SLA。

重连顺序：

```text
fetch latest Snapshot
→ reconnect with last durableCursor
→ replay durable delivery records
→ ignore historical token delta
→ converge on persisted assistant Message
```

当 cursor 未知、超过保留窗口、属于不可恢复的旧投影代次，或投影已完成受控
清理时，返回 typed 结果 `replay_reset_required`。Desktop 必须丢弃旧 cursor，
重新取得最新 Snapshot，并从 Snapshot 返回的新 cursor 继续订阅；不得尝试恢复
历史 token delta。

### 4.4 大型持久内容

Durable Event 只携带 ID、状态、revision、安全摘要和 Query 引用。完整 Assistant
Message、大型 Tool Result、Conversation 历史和后续 Artifact 内容必须通过
Snapshot/Query 获取，不依赖单个 SSE Event 传输大块持久正文。

### 4.5 Heartbeat

SSE heartbeat 默认 15 秒，属于可配置的 Alpha transport 约束。Heartbeat 不是
领域 Event，不写入 `DesktopDeliveryRecord`，不推进 `durableCursor`，也不进入
Session/Task 事实。

## 5. localhost 威胁模型

### 5.1 保护资产

- 启动令牌；
- WorkspaceGrant 和本地路径；
- 用户输入、Conversation 和 Task 摘要；
- Runtime Selection；
- Local Core 命令权限；
- SSE 内容；
- 后续可能出现的 Artifact 元数据。

### 5.2 威胁主体

- 同一机器上的其他普通进程；
- 被恶意网页内容影响的 Renderer；
- 过期 Desktop/Core 实例；
- 重放或篡改本地请求的程序；
- 发送超大请求或不消费 SSE 的慢客户端；
- 诱导用户授权越界目录的 UI；
- 具备当前 OS 用户调试权限的恶意程序。

本方案降低本地攻击面，但不宣称抵抗已经完全控制当前 OS 用户账户的攻击者。

### 5.3 必须实施的缓解措施

| 威胁 | 缓解 |
| --- | --- |
| 端口扫描与未授权调用 | 仅绑定 `127.0.0.1` 随机端口；每次启动随机 token |
| token 泄漏 | 只经受控 child IPC 交付；不进入 argv、URL、Renderer、日志 |
| 恶意网页跨域 | Renderer `connect-src 'none'`；禁用 CORS；Main 作为唯一 Client |
| 伪造 Host/Origin | 严格 Host；Origin 存在时只接受明确允许值，否则拒绝 |
| 旧进程重放 | token 与 runtimeInstanceId 绑定，Core 停止即失效 |
| Command 重放 | commandId + canonical request digest 幂等/冲突 |
| 超大输入 | JSON body、SSE frame、错误详情和批量查询都有硬上限 |
| 慢 SSE Client | 复用 KAF-4 有界 subscriber；先合并/淘汰 delta，durable 无法承载时断开并恢复 |
| Workspace 越界 | 系统目录选择器 + realpath + symlink/子路径重检 |
| 错误泄密 | typed error + 安全摘要；路径、正文和 token 脱敏 |
| Core 冒充 | Main 校验 child IPC readiness、fixture/formal schema 和实例 nonce |

### 5.4 推荐 Alpha 限额

以下是可观测、可配置的 Alpha 默认值和安全保护上限，不进入产品 SLA：

```text
普通 JSON Command 上限：1 MiB
单个 SSE Event 上限：256 KiB
单个 token delta 上限：64 KiB
错误安全详情上限：16 KiB
SSE heartbeat：15 秒
重连退避：250 ms 起，最大 10 秒，带抖动
```

业务文件不得通过 `submitTurn` 整体上传；通过 WorkspaceGrant 和 Artifact 引用处理。
配置调整不得取消绝对安全上限，也不得破坏 strict Schema、digest、内存有界、
慢消费者隔离、路径安全或 Secret 禁入规则。

## 6. Schema 与兼容策略

DCF-1 Alpha 推荐：

1. 所有 Command、Query、Projection、Event、Error 使用 strict、JSON-safe Schema；
2. 未知顶层字段、未知 enum 和 digest 不匹配失败关闭；
3. Compatibility 握手先选择双方共同支持的精确 Contract 版本；
4. 同一版本不静默增加破坏性必填字段；
5. 需要前向扩展时提升 Contract revision 并增加 Conformance Fixture；
6. HTTP route/method 可以在 Schema 评审中确定，但业务语义不得绕开高层命令；
7. 不把 Fixture Schema 升级为正式 Schema；正式对象重新命名并重新验证。

## 7. Conformance 套件

### 7.1 Schema Conformance

- valid/invalid Command、Projection、Event、Error；
- unknown version/enum/extra field；
- canonical digest；
- JSON round-trip；
- Secret、PID、Runtime Handle、完整 Prompt 禁入；
- Main/Core 对相同 Fixture 得到相同接受/拒绝结果。

### 7.2 submitTurn Conformance

- 同 commandId/digest 幂等；
- 同 commandId/不同 digest conflict；
- user Message 后崩溃；
- Task committed 后崩溃；
- Receipt 后 Loop 未启动；
- Desktop 超时重试；
- Model/Tool/Skill/Knowledge/Workspace 校验失败；
- 非终态 Task 存在时 `deleteSession` 返回 `session_has_active_task`；
- 重启后不重复 Message、Task、Selection 或 Lock。

### 7.3 Streaming/Recovery Conformance

- token delta 顺序和最终 Message；
- SSE 中断后 Snapshot-first；
- durable cursor replay；
- `replay_reset_required` 的四类失效原因与 Snapshot-first 收敛；
- duplicate durable event 去重；
- 不重放历史 delta；
- 慢消费者下 ephemeral 先合并/淘汰、durable 无法承载时断开；
- 有界 `DesktopDeliveryRecord` 清理与 cursor 失效；
- 大型 durable 内容只通过 Query/Snapshot 获取；
- heartbeat 不持久、不推进 cursor；
- Core restart/runtimeInstanceId 变化；
- Desktop restart；
- completed Assistant Message 最终收敛。

### 7.4 Security Conformance

- 无 token 返回 401；
- 错误 token、旧 token、错误 Host/Origin；
- oversized body/frame；
- Renderer 直接 fetch/WebSocket/EventSource 架构失败；
- Preload 非白名单 channel 架构失败；
- Workspace symlink/realpath 越界；
- 日志与错误脱敏。

## 8. 建议开发批次

### DCF-1.0：正式 Contract Pack

- 字段级 Schema；
- Threat Model；
- Compatibility/Error/Event Envelope；
- Fixture 与 negative corpus；
- Contract Conformance 与 localhost threat model 自动化；
- 不实现正式业务 Route；
- 不实现 TaskRuntimeSelection 持久化；
- 不实现 SubmitTurnCoordinator 状态机。

退出门槛：Schema、Threat Model、Conformance 评审无 P0/P1，Main/Core
Conformance 全绿，并继续符合 ADR-011/012。

#### 实现检查点：0.0.0-dcf.1.0

开发者检查点已交付：

- `packages/contracts/src/desktop-local/v1alpha1/` strict Zod Contract；
- Control、Workspace、Session、Catalog、SubmitTurn、Task Projection、
  Durable/Ephemeral Event、Error；
- valid/invalid Fixture corpus；
- Main/Core 对同一 corpus 的一致接受/拒绝；
- `replay_reset_required`、heartbeat 非 durable、Query 引用和 Secret/Runtime
  Handle 禁入门禁；
- Node 24.13.0 全量 56 files / 413 tests `PASS`。

状态：**INDEPENDENT QA PASS**。用户接受 DCF-1.0 为 `PASS`，P0/P1/P2/P3
均为 0；DCF-1.1 已解除门槛。

### DCF-1.1：Core Application 与持久协调

- WorkspaceGrant；
- Session Command/Query；
- AgentDefinitionRevision 与 Model Definition 的受信 Fixture Repository；
- ModelEligibilityEvaluator；
- Agent/Model Projection；
- TaskRuntimeSelection；
- SubmitTurnCoordinator；
- TaskCapabilityLock；
- DesktopDeliveryRecord；
- SQLite migration 与崩溃恢复。

退出门槛：Headless Contract E2E、六个 SubmitTurn 崩溃场景全部通过。

### DCF-1.2：Electron Bridge 与最小工作台

- Main HTTP/SSE Client；
- Preload 业务白名单；
- Workspace/Session/Agent/Model/Chat 最小 UI；
- Scripted/Fake Model streaming；
- Snapshot + cursor reconnect。

退出门槛：Renderer 无系统能力，真实 Desktop/Core 链路通过。

### DCF-1.3：重启与阶段验收

- Desktop/Core 分别重启；
- slow consumer、断线、重复事件；
- 资源释放；
- 30～60 分钟稳定运行；
- 完整 E2E Harness 和独立 QA。

## 9. 预计工程量

单一主开发流建议按 **8～12 个工作日**规划：

```text
DCF-1.0：2～3 天
DCF-1.1：3～4 天
DCF-1.2：2～3 天
DCF-1.3：以独立 DCF-1.3 开发计划的 6～9 个集中工程工作日为准
```

上述数字是单一主开发流的工程工作量估算，不包含独立 QA、架构复审、环境或公司
基础设施审批等待，也不等同于日历交付承诺。PM 日历计划应预留约 **1.5～2 倍**
窗口，用于 QA、返工、评审和环境风险。该项记为 `P2 — SCHEDULE RISK`，不阻塞
DCF-1.0，也不修改技术验收门槛。

估算不包含真实 Model、个人 Credential、真实 Skill Runtime、签名/公证和
Windows 分发。

DCF-1.3 原 1～2 天估算只覆盖最小重启验收。用户后续明确增加 SSE backpressure、
慢消费者、完整资源基线和 30～60 分钟长稳 Harness，因此由
[`DCF-1.3-DEVELOPMENT-PLAN.md`](./DCF-1.3-DEVELOPMENT-PLAN.md) 替代该旧估算。

## 10. 已确认决策与进入门槛

用户已确认：

1. 使用一个统一受认证 SSE Stream，而不是每 Task 一个连接；
2. 精确版本握手后采用 strict Schema，未知顶层字段/enum、非法 digest 和缺少
   必填字段均失败关闭；
3. `deleteSession` 只有 tombstone/软删除语义；
4. DCF-1 总体包含 `TaskRuntimeSelection`、`SubmitTurnCoordinator`、
   `TaskCapabilityLock`、`DesktopDeliveryRecord` 与 Session/Task 双领域恢复；
5. 接受 DCF-1.0～1.3、Alpha 限额与本文件的七项指定修订。

DCF-1.0 已完成独立 QA，正式 Contract 继续符合 ADR-011/012，DCF-1.1 已解锁。
DCF-1.1 不等待 CGF-1.1；本次 CGF identity repair 不修改 DCF Contract。
