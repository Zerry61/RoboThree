# Desktop Local Runtime Contract v1alpha1

> 状态：**ACCEPTED**  
> 日期：2026-07-24  
> 接受日期：2026-07-24  
> 适用边界：Electron Main ↔ Node.js Local Core；Renderer 仅通过 Preload 白名单间接使用  
> 总体架构状态：`CONFIRMED`  
> 当前实施门槛：DCF-1.0 已打开；DCF-1.1 须经 DCF-1.0 Schema/Threat Model/Conformance 无 P0/P1 后解锁  
> 2026-07-24 一致性修订：durable 优先级、cursor reset、投影保留、Session tombstone 与 heartbeat
> 2026-07-25 后续兼容说明：企业配置 typed Projection/Event 不静默修改本
> strict Schema，改由 `v1alpha2` 明确 revision 和 feature negotiation 承载

## 1. 目的

本 Contract 定义 Desktop 用户语义与 Local Core 事实源之间的稳定边界。它不暴露 Core 的 reducer、持久化和 Effect 实现，也不允许 Desktop 通过低层接口自行拼装 Task/Run/Step。

```text
Vue Renderer
→ context-isolated Preload allowlist
→ Electron Main
→ private localhost HTTP + SSE
→ Local Core Application
```

## 2. 责任边界

### Desktop 提交

- Session/Task 用户命令；
- Agent、Model、Skill、Knowledge 和 Workspace 选择意图；
- 用户补充输入；
- UserConfirmation 决定；
- Artifact 打开/预览意图；
- 个人 Model 的非敏感描述和受控 Credential 输入。

### Local Core 返回

- Session/Conversation/Task 用户 Projection；
- 当前可用 Agent 和 Model Projection；
- resolved Runtime Selection 摘要；
- Assistant streaming；
- Tool activity 业务摘要；
- UserConfirmation Request；
- Artifact 元数据；
- 企业同步与 Runtime Activation 状态；
- 类型化错误和恢复建议。

Desktop 不计算权限、风险、最终 Model、Tool Binding 或 Prompt。

## 3. 传输与本地安全

普通业务传输方向：

- 只绑定 loopback；
- 使用随机端口；
- 每次 Desktop/Core 启动使用短期随机令牌；
- 令牌优先经继承 IPC、匿名管道或其他不暴露于命令行参数的受控通道交付；
- Core 停止后令牌失效；
- 验证 Host/Origin、请求内容类型和请求大小；
- 日志对 Authorization、令牌、路径和敏感字段脱敏；
- Renderer 不持有原始 Local Core Client 或启动令牌；
- SSE 使用有界 subscriber、慢消费者隔离和断开清理。
- SSE heartbeat 默认 15 秒；它是可配置 transport keepalive，不是领域 Event，
  不持久化，也不推进 durable cursor。

这些措施用于降低本地攻击面，不宣称绝对阻止同一 OS 用户下已被攻陷或具备调试权限的恶意进程。

个人 Model Secret 不进入普通 HTTP/SSE。其受控传递遵守 ADR-013；ADR-013 未接受前不冻结 Credential 命令语义。

## 4. Contract 分层

### Control

- readiness；
- compatibility；
- runtime status；
- graceful shutdown；
- pending runtime activation 状态；
- 安全、脱敏的基础诊断摘要。

### Command

用户语义方向包括：

```text
createSession
renameSession
deleteSession                  # tombstone/软删除；非物理删除
submitTurn
cancelTask
retryTask
continueTask
provideTaskInput
decideUserConfirmation
createWorkspaceGrant
revokeWorkspaceGrant
savePersonalModel            # ADR-013 接受后
testPersonalModel            # ADR-013 接受后
createPersonalAgentDraft
savePersonalAgentRevision
```

这些名称是语义边界，不冻结 URL、HTTP method 或 DTO 字段。

`deleteSession` 是唯一正式语义，不再并列 `archiveSession`。存在非终态 Task 时
返回 typed error `session_has_active_task`；用户必须先完成/取消 Task 或处理
等待状态。MVP 不实现物理清理、完整回收站或保留策略 UI。

### Query

- Session/Conversation Snapshot；
- Task Snapshot；
- Confirmation；
- Artifact；
- WorkspaceGrant；
- Agent、Model、Skill、Tool、Knowledge Projection；
- 企业配置同步状态；
- Configuration Storage/Runtime Registry Activation 状态；
- Core 运行状态。

### Event

- Assistant streaming；
- Task 状态；
- Tool activity；
- Confirmation requested/decided；
- Artifact created/updated；
- recovery；
- enterprise sync/activation；
- runtime notice。

## 5. submitTurn

`submitTurn` 是 Desktop 创建用户回合和任务的唯一高层入口。Desktop 不自行调用：

```text
appendMessage
→ createTask
→ createRun
```

Desktop 只提交 `TaskSelectionRequest` 意图，例如：

```text
session
clientTurnId / submitTurnCommandId
agentId
requestedModelId?
selectedSkillIds[]
selectedKnowledgeIds[]
workspaceGrantId?
user input
```

Local Core 按 ADR-012：

```text
idempotent Session user message
→ immutable TaskRuntimeSelection
→ Model/Tool TaskCapabilityLocks
→ Task initialization
→ SubmitTurnReceipt
→ after-commit Agent Loop start
```

返回的运行摘要至少让 Desktop 理解：

```text
Agent ID / Revision
Agent defaultModel
Task requestedModel
resolved Model
Active Skills
Allowed/Locked Tools
Knowledge
Workspace
Enterprise Config Revision（可选；纯个人/本地运行且尚无企业配置时缺省）
Runtime Selection ID / Digest
```

Desktop 不得把 Enterprise Config Revision 缺省解释为同步失败或运行失败；企业同步状态应通过独立 Projection 表达。

`submitTurn` 架构语义已随 ADR-011/012 接受；正式 Schema、Route、持久化和恢复实现仍按 DCF-1 及对应 Core 批次建立 Conformance 后解锁。

## 6. Agent 与 Model Projection

Agent Projection 应表达：

- 名称、身份和目标；
- immutable revision；
- defaultModel；
- allowModelOverride；
- 当前用户可显式选择的合法 Model；
- requiredModelCapabilities；
- Skill/Tool/Knowledge 摘要；
- 当前是否可运行；
- 不可运行的类型化原因。

合法候选由 Local Core `ModelEligibilityEvaluator` 计算，Renderer 不自行求交集。

三种 Model 默认值：

| 概念 | Projection/Command 语义 |
| --- | --- |
| Agent defaultModel | AgentDefinitionRevision 的固定属性 |
| User personal defaultModel | 开放式任务的用户偏好 |
| Task requestedModelId | submitTurn 对单个 Task 的显式覆盖 |

defaultModel 不可用但允许覆盖时，Core 返回候选和“需要用户明确选择”，不得自动选择其他 Model。

## 7. Desktop Task Projection

Desktop 使用用户语言状态，不暴露底层 Task/Run/Step 协议：

```text
准备中
排队中
执行中
等待输入
等待确认
正在恢复
成功
失败
已取消
已超时
需要人工处理
```

“排队中”是根据 admission/reliability 事实形成的 UI Projection，不新增 durable TaskStatus。

`uncertain` 必须投影为“需要人工处理”，不能显示为普通失败或成功。

## 8. Durable Event Cursor

Contract 使用不透明 `durableCursor`，不把 Session event sequence、Task event sequence 或 Outbox sequence 合成一个领域序列。

事件分为：

### Durable

- Task 状态和终态；
- UserConfirmation；
- Tool activity 结果摘要；
- Artifact；
- recovery；
- Configuration sync/activation；
- Runtime notice 中需要恢复的事实。

### Ephemeral

- Assistant token delta；
- 临时进度；
- 可合并 UI activity delta。

重连：

```text
读取最新 Session/Task Snapshot
→ 使用 durableCursor 补 durable Event
→ 不补历史 token delta
→ 以持久 Assistant Message 收敛最终正文
```

durable Event 至少一次投递；Desktop 必须按 event identity 去重。

投递优先级与背压规则：

- durable/critical event 优先于可合并 ephemeral delta；
- buffer 满时先合并或淘汰 token/progress delta；
- durable event 不得静默丢弃；
- 如果 durable event 已无法承载，Core 断开连接，Desktop 通过
  Snapshot + cursor 恢复。

`DesktopDeliveryRecord` 是有界 Application 投递投影，不是第二套无限 Event
Store。其保留数量/时间、清理条件和投影代次是可观测的 Alpha 配置，不合并
Session、Task、Outbox 的领域 sequence。

以下情况返回 typed 结果 `replay_reset_required`：

- cursor 未知；
- cursor 超过保留窗口；
- cursor 属于不可恢复的旧投影代次；
- delivery projection 已完成受控清理。

Desktop 收到后丢弃旧 cursor，重新读取最新 Snapshot，并从 Snapshot 返回的新
cursor 继续订阅；不重放历史 token delta。

单个 durable Event 只携带 ID、状态、revision、安全摘要和 Query 引用。完整
Assistant Message、大型 Tool Result、Conversation 历史和 Artifact 内容通过
Snapshot/Query 获取。

## 9. UserConfirmation

Desktop 只展示 Core 产生的版本化 Confirmation Request 并提交用户决定。Desktop 不能：

- 修改 ActionIntent；
- 扩大 scope；
- 直接写数据库；
- 把用户确认当作 WorkspaceGrant 或 Authorization；
- 代替 Core 完成确认后重检。

确认等待、重启恢复和 scope 语义继续遵守 ADR-006。

## 10. 错误与兼容性

错误至少区分：

```text
validation
compatibility
authorization
workspace_boundary
user_action_required
availability
timeout
cancelled
conflict
uncertain
internal
session_has_active_task
replay_reset_required
```

Renderer 不通过自然语言错误字符串判断业务状态。

启动握手必须返回：

- Desktop Contract 支持范围；
- Core 版本；
- 最低/最高兼容 Contract；
- 可用 feature；
- 是否有 pending runtime activation。

未知破坏性版本失败关闭；可选字段的前向兼容规则在 Contract 冻结时确定。

## 11. 禁止暴露

- Effect、Receipt、Outbox、Checkpoint；
- CompactionJob/Record 的基础设施细节；
- RegistrySnapshot、TaskCapabilityLock 完整内容；
- SQLite row、PID、Runtime Handle、Connection Instance；
- Provider SDK 对象；
- Credential/Secret；
- 完整系统 Prompt、模型私有思维过程；
- Central 企业凭证。

Desktop 可以看到用户可理解的运行摘要和引用，不看到内部执行对象。

## 12. Conformance 与状态

Contract 冻结后必须有：

- strict/JSON-safe Schema；
- unknown version/enum/extra field 失败关闭策略；
- Desktop Fixture 与 Core Fixture 一致；
- durable cursor、重复事件和重连测试；
- durable-first 慢消费者、cursor reset、投影清理和大型内容 Query 测试；
- heartbeat 不持久且不推进 cursor；
- active Task 下 Session tombstone 拒绝；
- submitTurn 幂等/冲突/崩溃恢复测试；
- UserConfirmation close/reopen；
- Renderer 边界检查；
- Secret/Runtime Handle 禁入检查。

DCF-0 只使用非正式 Fixture 验证传输、进程和构建边界，不生成正式业务 DTO。后续正式 DTO 必须以本 Contract 为语义基线，补齐 strict Schema、版本兼容和跨进程 Conformance 后才能进入 DCF-1+。

## 13. 后续实施事项

1. Contract 字段、URL、method、错误码和兼容矩阵 Conformance；
2. localhost HTTP/SSE 威胁模型和启动令牌实现验证；
3. 正式 Skill Runtime 输入 Projection；
4. DCF-1+ 每批独立 QA。
