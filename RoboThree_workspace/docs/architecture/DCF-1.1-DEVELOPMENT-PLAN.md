# RoboThree DCF-1.1 Core Application 与持久协调开发计划

> 决策状态：**CONFIRMED_WITH_SPECIFIED_REVISIONS**  
> 编码状态：**DCF-1.1A～1.1C PASS/CLOSED；DCF-1.1 阶段 CLOSED**  
> 日期：2026-07-26  
> 适用阶段：Desktop Client Foundation 1.1  
> 建议版本：`0.0.0-dcf.1.1a`、`0.0.0-dcf.1.1b`、`0.0.0-dcf.1.1c`  
> 前置门槛：DCF-1.0 独立 QA `PASS/CLOSED`；ADR-002、ADR-008、ADR-010、ADR-011、ADR-012 `ACCEPTED`

## 1. 背景与当前事实

DCF-1.0 已冻结 Desktop Local Runtime `v1alpha1` 的 strict Command、Query、
Projection、Event 和 Error，但没有实现正式业务 Route、TaskRuntimeSelection
持久化或 SubmitTurnCoordinator。

Local Core 当前已经具备：

- KAF-5 `ConversationPersistence`、`SessionHead`、ConversationMessage 和
  InMemory/SQLite 实现；
- KAF-1～KAF-3 Task、TaskCapabilityLock、RegistrySnapshot 和恢复基础；
- KAF-4～KAF-5 Agent Loop、Context、用户确认和持久恢复机制；
- DCF-1.0 Desktop Local strict Contract 与 Conformance corpus。

因此 DCF-1.1 的任务不是重建 Conversation 或 Agent Kernel，而是把已经接受的
Desktop 业务语义接入现有 Core：

```text
WorkspaceGrant
→ Session / Conversation
→ Agent / Model 合法候选
→ TaskRuntimeSelection
→ TaskCapabilityLock
→ SubmitTurnRecord / Receipt
→ commit 后启动既有 Agent Loop
→ 重启恢复
```

## 2. 目标

DCF-1.1 完成后，Headless Local Core 应能：

1. 持久创建、查询、重命名和软删除 Session；
2. 通过显式授权的 WorkspaceGrant 表达本地目录边界；
3. 从受信 Agent/Model 来源生成面向 Desktop 的安全 Projection；
4. 按 ADR-011 确定性解析并持久化 TaskRuntimeSelection；
5. 在一个 Task 事务中创建 Task、Selection、CapabilityLocks 和
   userMessageId 绑定；
6. 按 ADR-012 幂等协调 Session Message 与 Task 两个领域事务；
7. 在提交完成后启动 Agent Loop，并在崩溃后无需 Desktop 重发即可恢复；
8. 通过真实 SQLite close/reopen 和 Headless Contract E2E。

本阶段继续使用受信 Fixture Agent/Model 和 Fake/Scripted 执行边界，不以真实
个人模型、企业模型、Electron Bridge 或 Vue 工作台为完成门槛。

## 3. 固定所有权与依赖边界

### 3.1 对象所有权

| 对象 | 所有者 | 约束 |
| --- | --- | --- |
| WorkspaceGrant | Local Core Application / Security | 只接受可信系统选择结果，不信任 Renderer 自报路径 |
| SessionHead、ConversationMessage、Compaction | Session/Conversation | 复用 KAF-5，不与 Task 共用 revision 或 Receipt |
| Session title、tombstone、Desktop revision | Session 领域持久元数据 | 不塞入 Compaction Command，不成为第二份 Message 事实 |
| AgentDefinitionRevision | Agent 领域受信 Repository | 不可变 revision；Fixture-first |
| ModelDefinition | Model 领域受信 Repository | 提供明确能力事实，不包含 Credential |
| TaskRuntimeSelection | Task 领域 | 每个 Task 恰好一条，创建后不可变 |
| TaskCapabilityLock | Task 执行路径 | 物化 Model/Tool Definition、Binding、Descriptor；不锁 Runtime Handle |
| SubmitTurnRecord / Receipt | Application Coordination | 只保存跨领域关联和推进事实，不复制正文、TaskState 或 Lock |
| DesktopDeliveryRecord | Application Projection | 面向 Desktop 的有界 durable 投递，不替代 Session/Task 事实 |

### 3.2 依赖方向

```text
Desktop Local Contract
        ↓
Application Services / Coordinators
        ↓
typed Ports
        ↓
InMemory / SQLite / Fake Adapters
```

Kernel reducer 不得导入：

- Desktop Local Contract transport；
- Session/Workspace SQLite Adapter；
- SubmitTurnCoordinator；
- Agent/Model Repository；
- DesktopDeliveryRecord；
- Electron、HTTP 或 SSE。

Renderer、Electron Main 和 Central Service 不参与本批 Runtime Selection 或
SubmitTurn 业务判断。

### 3.3 复用现有 Conversation，不建立第二套对话系统

DCF-1.1A 复用现有 `ConversationPersistence`、`SessionHead` 和
ConversationMessage 表。

Desktop 需要的 title、tombstone 和展示 revision 属于 Session 领域的新增持久
元数据。它们必须：

- 通过类型化 Session Application Port 管理；
- 以 sessionId 引用现有 SessionHead；
- 使用 expected revision 和幂等 commandId；
- 不修改 Conversation Message sequence；
- 不扩大现有 Compaction Command/Receipt 语义；
- 不把软删除实现为数据库级 cascade 或物理删除。

具体内部类型名在 DCF-1.1A 编码评审时确定，不进入新的公共跨进程 Contract；
Desktop Local `v1alpha1` 继续是用户侧事实源。

## 4. DCF-1.1A：Workspace、Session 与 Conversation 基础

### 4.1 交付范围

- WorkspaceGrant Application Service；
- 受信 `WorkspaceSelectionResolver` 或等价内部 Port；
- Workspace realpath、路径分段、真实子目录和 symlink 越界校验；
- WorkspaceGrant 创建、查询、列出和撤销；
- Session create/load/list/rename/delete；
- delete 只写 tombstone，不物理删除；
- Session 元数据与现有 SessionHead 的关联；
- ConversationSnapshot 和 Message Projection；
- InMemory 与 SQLite 类型化 Adapter；
- forward-only migration、schema preflight 和 close/reopen；
- strict Command/Query/Projection 与 typed error；
- Adapter 共用 Conformance。

### 4.2 Workspace 安全边界

Renderer 只能提交 Electron Main 产生的一次性或短期 `selectionHandle`。Local Core
通过受信 Port 解析为真实目录并持久化规范化授权事实。

不得：

- 把 Renderer 自报绝对路径视为授权；
- 把 selectionHandle 当成可长期复用 Credential；
- 允许 `..`、symlink、reparse point 或大小写/Unicode 归一化造成越界；
- 因创建 WorkspaceGrant 自动获得程序执行、外发或高风险写权限。

普通已授权目录内的文件创建和修改继续遵守 ADR-002/ADR-006，不因此增加重复确认。

### 4.3 简化崩溃恢复 Harness

按 Claude Code 文档评审意见，DCF-1.1A 不等待 1.1C 才验证事务边界。至少覆盖：

1. SessionHead 已创建、Session 元数据响应前崩溃；
2. Session 元数据已提交、响应返回前崩溃；
3. rename 已提交、响应返回前崩溃；
4. tombstone 已提交、响应返回前崩溃；
5. WorkspaceGrant 创建或撤销提交后响应丢失；
6. 相同 commandId/digest 幂等回放和不同 digest conflict。

恢复必须基于持久事实和 commandId，不依赖 Desktop 生成第二个逻辑命令。

### 4.4 退出门槛

- InMemory/SQLite 运行相同 Conformance；
- Workspace 越界和伪造 selectionHandle 失败关闭；
- Session/Message 幂等、expected revision 和 tombstone 语义稳定；
- close/reopen 后 Snapshot、Message 顺序和 Session metadata 不漂移；
- 简化崩溃 Harness 全部通过；
- KAF-5 Conversation/Compaction 回归不受影响；
- 不提前创建 TaskRuntimeSelection、SubmitTurnCoordinator 或 Electron UI。

## 5. DCF-1.1B：Agent/Model Selection 与 Capability Lock

### 5.1 交付范围

- AgentDefinitionRevision 受信 Fixture Repository；
- ModelDefinition 受信 Fixture Repository；
- `ModelEligibilityEvaluator`；
- Agent/Model Projection；
- `defaultModelId` 与 `allowModelOverride`；
- `requestedModelId` 合法候选校验；
- TaskRuntimeSelection Contract/Validation/Persistence；
- Model 与 Tool TaskCapabilityLock；
- Skill、Knowledge、Workspace 精确 revision/digest/reference；
- selection digest；
- InMemory/SQLite 共用 Conformance；
- close/reopen 恢复。

### 5.2 确定性解析

模型解析固定遵守 ADR-011：

```text
没有 requestedModelId
→ 只尝试 Agent defaultModel

有 requestedModelId
→ Agent 必须允许 override
→ requested Model 必须属于当前合法候选

defaultModel 不合法且没有明确合法选择
→ 不启动 Task
```

`ModelEligibilityEvaluator` 只计算权限、启用、Credential 可用性、可调用性和
必要能力的交集：

- 不评分；
- 不排序“最佳模型”；
- 不按 health 自动换 Binding；
- 不静默 fallback；
- 不根据名称推断能力。

### 5.3 锁定时机

- Model TaskCapabilityLock 必须在 Task 启动前创建；
- 所有准备暴露给 Model 的 Tool Schema 必须在第一次 Model 调用前锁定；
- TaskRuntimeSelection 只引用 Lock ID 和 digest，不复制完整 Lock；
- Skill 和 Knowledge 不进入 Capability Registry，按 materialized
  revision/digest/reference 锁定；
- Workspace 只锁 WorkspaceGrant ID，每次真实文件操作仍重新检查实际路径边界。

配置、Fixture、health 或 Credential 后续变化不得改写已经创建的 Selection。

### 5.4 退出门槛

- 默认模型、合法覆盖、禁止覆盖、默认不可用和无合法候选均有 Conformance；
- 相同输入与相同 Registry revision 得到稳定 selection digest；
- Agent/Model/Tool/Skill/Knowledge/Workspace 任一引用漂移均失败关闭；
- 配置变化不改变已锁 Task；
- close/reopen 后 Selection 与 Locks 可恢复；
- Projection 不向 Desktop 暴露 Binding、AdapterDescriptor、RegistrySnapshot、
  Credential 或 Runtime Handle。

## 6. DCF-1.1C：SubmitTurn 持久协调与 Headless E2E

### 6.1 交付范围

- SubmitTurnCoordinator；
- SubmitTurnRecord 与 SubmitTurnReceipt；
- stable `submitTurnCommandId`、`clientTurnId` 和 `requestDigest`；
- 幂等追加用户 ConversationMessage；
- Task + TaskRuntimeSelection + CapabilityLocks + userMessageId 原子 Task 事务；
- 面向该原子提交的语义化 Task Persistence 方法，不暴露通用事务对象；
- DesktopDeliveryRecord 最小 durable 投影；
- commit 后 Agent Loop starter；
- 可注入 Scheduler 和有界 Recovery 扫描；
- 最小 Headless Command/Query Adapter；
- ADR-012 六个崩溃与重试场景。

### 6.2 固定处理顺序

```text
validate commandId / clientTurnId / requestDigest
→ persist or replay SubmitTurnRecord(accepted)
→ idempotently append user Message
→ update Record(message_appended)
→ atomically commit Task + Selection + Locks + userMessageId
→ update Record(task_committed)
→ commit SubmitTurnReceipt(completed)
→ after commit start Agent Loop
```

Session Message 与 Task Bundle 继续是两个领域事务。不得用一个跨领域 SQLite
事务、XA 或通用 Saga 抹平所有权。

### 6.3 六个强制恢复场景

| 场景 | 恢复结果 |
| --- | --- |
| 用户 Message 已写入、Task 未创建 | 从 `message_appended` 继续同一 Task 事务 |
| Task 已创建、Receipt 未完成 | 读取既有 Selection/Locks，完成同一 Receipt |
| Receipt 已完成、Agent Loop 未启动 | Recovery 扫描启动同一 Task |
| Desktop 超时后重复提交 | 相同 commandId/digest 回放当前事实 |
| 相同 commandId、相同 digest | 返回相同稳定 ID |
| 相同 commandId、不同 digest | typed conflict，不改变已有状态 |

六个场景均必须执行真实 SQLite close/reopen，并验证不重复 Message、Task、
Selection、Lock、Receipt、Event 或 Loop start。

### 6.4 失败语义

`failed_terminal` 只用于可信确定、继续重试不会改变结果的失败，例如：

- Session 已 tombstone；
- Agent revision 不存在；
- 没有合法 Model；
- WorkspaceGrant 已撤销；
- revision/digest 明确冲突。

SQLite 暂时忙、进程崩溃、Task commit 结果尚未确认或 Loop starter 暂时失败不得
写成 `failed_terminal`。恢复扫描必须使用有界退避和稳定 ID。

### 6.5 退出门槛

- Headless Desktop Contract E2E 通过；
- ADR-012 六个场景全部 close/reopen 通过；
- terminal validation failure 与可恢复基础设施失败严格区分；
- Recovery 不依赖 Desktop 重发；
- Kernel、Contracts、Application、Adapter 边界检查通过；
- Node 24 完整门禁通过；
- Claude Code 独立 QA 无 P0/P1，用户接受后 DCF-1.1 才关闭。

## 7. 非目标

DCF-1.1 不实现：

- Electron Main HTTP/SSE Client、Preload 或 Vue 工作台；
- token streaming、slow consumer 和完整 cursor retention 矩阵；
- 真实个人或企业 Model Provider；
- 真实 Skill Runtime；
- Tool Activity、用户确认和 Artifact UI；
- Enterprise Runtime Registry Activation；
- 长期 Memory、Subagent、Policy Engine、自动模型路由或通用工作流引擎。

上述 Desktop Bridge 和最小工作台属于 DCF-1.2。

## 8. 采用理由与替代方案

### 8.1 采用理由

- 最大化复用 KAF-5 Conversation 和现有 Task Runtime；
- 保持 Session/Task 领域所有权和恢复证据清晰；
- 先完成 Headless 业务语义，避免在 Renderer 中补偿 Core 缺口；
- 分批验证持久边界，降低 1.1C 才发现 Session 事务问题的风险；
- 继续坚持显式选择和不可变锁定，不发展成智能路由平台。

### 8.2 未采用方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 重建第二套 Conversation/Session Store | REJECT | 与 KAF-5 事实重复并导致双写 |
| Session 与 Task 合并为单一领域事务 | REJECT | 违反 ADR-010/ADR-012 所有权 |
| 先做 Electron UI，再补 Core 业务语义 | REJECT | 会把恢复和权限判断推入客户端 |
| defaultModel 不可用时自动选其他模型 | REJECT | 违反 ADR-011 |
| 把 Skill/Knowledge 加入 Capability Registry | REJECT | 违反 ADR-008/ADR-011 |
| 本批直接接真实 Model | DEFER | DCF-1.1 先证明持久协调；真实企业 Model 属于 CGF-2 |

## 9. 上游借鉴与可追溯性

| 来源 | 固定 Commit | 本计划采用 | 不照搬 |
| --- | --- | --- | --- |
| grok-build | `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce` | Session 单写者、Builder → Finalized 思路 | Rust Actor、ACP、JSONL Store |
| OpenClaw | `deccdb5e57af6800d4f020ea2034166592a149ba` | 类型化 Gateway、启动/恢复和进程边界 | Channel/Plugin 大矩阵、热加载 |
| Open WebUI | `ecd48e2f718220a6400ecf49eafd4867a38feb10` | UI Projection 与 Runtime 事实分离 | UI 组件和 Branding 相关实现 |
| LangGraph | `49ae27c2ae983cfb92091b0dea9f7bc37a716479` | Persistence Adapter Conformance、恢复测试 | Pregel、Graph Builder、Python 序列化 |
| RoboThree | ADR-011/012、KAF-2/KAF-5、AR-013/AR-022 | 双事务协调、Task Lock、close/reopen Harness | 不新增通用 Saga 或第二运行时 |

采用方式为 `DESIGN_ONLY + INTERNAL_REUSE`。本计划不复制第三方源码、Schema、
SQL、测试或 Prompt。实施后应在上游借鉴登记表新增对应实现登记。

证据入口：

- [RoboThree 上游借鉴登记表](./UPSTREAM-ADOPTION-REGISTER.md)；
- [grok-build 适配分析](../../../robothree-agent-research/research/grok-build/robothree-fit-analysis.md)；
- [OpenClaw 适配分析](../../../robothree-agent-research/research/openclaw/robothree-fit-analysis.md)；
- [Open WebUI 适配分析](../../../robothree-agent-research/research/open-webui/robothree-fit-analysis.md)；
- [Software Agent SDK / OpenHands 适配分析](../../../robothree-agent-research/research/software-agent-sdk/robothree-fit-analysis.md)；
- [LangGraph 适配分析](../../../robothree-agent-research/research/langgraph/robothree-fit-analysis.md)。

## 10. 验证计划

每个子批必须：

1. 升级独立开发版本；
2. 更新 Development Log 和 CHANGELOG；
3. 执行 Node 24 完整门禁；
4. 运行本批专项 Conformance、故障注入和真实 SQLite close/reopen；
5. 由 Claude Code 按独立 QA Skill 实际重跑，不以开发者结果代替；
6. 用户接受该批 `PASS/CLOSED` 后才解锁下一批。

DCF-1.1C 额外预留 1～2 个集中工程工作日，用于独立 QA 发现的恢复边界；该缓冲
不是跳过门槛的授权。

## 11. 工程量

```text
DCF-1.1A：2～3 个集中工程工作日
DCF-1.1B：2～3 个集中工程工作日
DCF-1.1C：3～4 个集中工程工作日
QA 风险缓冲：1～2 个集中工程工作日

基础实现合计：7～10 个集中工程工作日
含风险缓冲：8～12 个集中工程工作日
建议 PM 日历窗口：11～18 个日历工作日
```

一个集中工程工作日约等于一个工程师的 8 个正常工程小时，是分析、设计、编码、
开发者自测和文档的工作量单位，不表示 AI 连续运行 8 个墙钟小时。日历窗口还
包含顺序门槛、独立 QA 和常规返工，不包含公司外部审批或重大 P0 返工。

旧总计划中的 DCF-1.1 3～4 天没有充分计入双领域持久协调、六个崩溃场景、两套
Adapter Conformance 和逐批独立 QA，本计划以当前代码事实重新估算。

## 12. 当前门槛

用户已确认本计划方向及 Claude Code 文档评审提出的以下修订：

1. DCF-1.1A 提前加入 Session 写入、崩溃和恢复的简化 Harness；
2. DCF-1.1C 为独立 QA 发现的边界预留风险缓冲；
3. DCF-1.1 与 CGF-1.3 不同时扩张正式业务实现。

`0.0.0-dcf.1.1a` 已满足并执行以下进入条件：

```text
本文档最终复核无 P0/P1
∩ 用户明确授权进入 DCF-1.1A
```

阶段关闭事实：

```text
DCF-1.1C 独立 QA：74 files / 512 tests、专项 3 files / 17 tests PASS
∩ P0/P1/P2/P3 = 0
∩ 用户明确接受
→ DCF-1.1C PASS/CLOSED
→ DCF-1.1 阶段 CLOSED
```

CGF-1.3 继续 `GATED`，等待下一阶段方案确认和明确授权。
