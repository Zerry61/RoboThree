# ADR-006：MVP 固定授权、Tool 风险与 Desktop 用户确认

> 状态：**ACCEPTED**  
> 提出日期：2026-07-19  
> 方案重构日期：2026-07-22  
> 接受日期：2026-07-22  
> 适用阶段：KAF-4 固定授权、用户确认、并发、可靠性与性能  
> 替代关系：原同编号 `PROPOSED` 的 Authorization/Risk/Data/Policy/Approval 五层草案从未被接受，本文件原位替代该草案。

## 1. 背景

RoboThree MVP 必须在 Model 或 Tool 调用前回答四个问题：

1. 当前用户是否有权使用目标 Model 或 Tool；
2. 本地资源是否位于用户明确授权的 FileGrant/WorkspaceGrant 范围内；
3. 本次操作是否需要 Desktop 用户确认；
4. 用户确认后，实际执行的目标、数据范围和 Action 是否仍与确认内容一致。

原 ADR-006 草案计划同时建设 Authorization、ActionRisk、DataClassification、PolicyDecision 和 Approval。该范围会把 MVP 推向通用企业 Policy 平台，并与已冻结的《RoboThree MVP 功能范围与开发基线 v1.0》冲突。MVP 只保留固定用户权限、Workspace 边界、Tool 风险和 Desktop 用户确认，不建设 Task/Run/Step/Tool Action 企业审批、Approver 角色、独立审批模块、完整 Policy 引擎或中央实时撤销系统。

Agent/Skill 发布审核属于企业能力发布治理，不属于运行时用户确认，也不纳入本 ADR。

## 2. 上游证据与采用方式

| 来源 | 固定 Commit | 借鉴 | RoboThree 调整 |
| --- | --- | --- | --- |
| grok-build | `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce` | `AccessKind → Decision`、Tool 分发前完成权限检查 | 采用确定性前置 Gate；不采用 yolo/auto/ask 多模式、classifier 决策或 Agent 自报风险 |
| OpenClaw | `deccdb5e57af6800d4f020ea2034166592a149ba` | 执行安全、allowlist、确认状态归一为纯决策；执行前拒绝 allowlist miss | 只借鉴纯决策与失败关闭；不采用多层 Tool Policy、任意 Shell allow-always 或大型 Plugin 权限矩阵 |
| LangGraph | `49ae27c2ae983cfb92091b0dea9f7bc37a716479` | 显式 Interrupt/Resume、waiting 状态和 Checkpoint 恢复 | 用户确认形成持久 `waiting(user_confirmation)`，不通过异常或 UI 回调阻塞 Core |
| RoboThree ADR-002 | `ACCEPTED` | FileGrant、WorkspaceGrant、真实路径越界防护和操作级权限 | 直接沿用，确认不能把越界请求变成合法请求 |
| RoboThree ADR-007 | `ACCEPTED` | Effect Intent-first、`prepared`/`dispatched` 与崩溃恢复 | 授权和必要确认位于 `prepared` 之前；`dispatched` 继续先持久化再调用 Backend |
| RoboThree ADR-008 | `ACCEPTED` | TaskCapabilityLock、锁定 Binding、可用性只收窄且不 fallback | 确认绑定精确能力修订；MVP 不建设中央实时撤销传输 |

采用类型均为 `DESIGN_ONLY`。RoboThree 按自身 Contract、TypeScript Core、Event/Persistence 和 Desktop 边界重写，不复制上游实现。

来源证据：

- [grok-build architecture](../../../robothree-agent-research/research/grok-build/architecture.md)；
- [grok-build RoboThree fit analysis](../../../robothree-agent-research/research/grok-build/robothree-fit-analysis.md)；
- [OpenClaw exec-policy.ts](../../../robothree-agent-research/sources/openclaw/src/node-host/exec-policy.ts)；
- [OpenClaw RoboThree fit analysis](../../../robothree-agent-research/research/openclaw/robothree-fit-analysis.md)。

## 3. 核心决策

### 3.1 MVP 只保留四个概念

#### Authorization

确定性判断用户是否有资格执行请求，包括：

- 用户是否具有目标 Model/Tool 的使用权限；
- Tool 是否分配给当前用户；
- TaskCapabilityLock 是否锁定精确且匹配的能力路径；
- FileGrant/WorkspaceGrant 是否覆盖请求资源；
- 请求的资源操作是否在 Grant 允许的操作集合内。

Authorization 不读取自然语言规则，不调用 LLM，不执行通用规则搜索。

#### ToolRiskFacts

描述经过 Schema 校验的具体 Action 所具有的确定性风险事实：

```text
routine_file
destructive_file
protected_resource
local_execution
external_send
unknown
```

风险事实由受信 Tool Definition、平台固定下限和确定性 Action inspector 产生。Agent/LLM 不能自行声明低风险；企业配置可以增加风险事实，不能降低平台下限。缺少 inspector、风险信息无法解析或事实与 Action 不一致时失败关闭。

#### UserConfirmation

只表示当前 Desktop 用户对一个精确 Action 或一个 Task 外部发送范围的知情确认。它不是企业审批、管理员批准、合规流程或多级审核，管理员不能通过后台代替用户确认本机操作。

#### Availability

Credential、Adapter health、disabled/unavailable 属于能力可用性，不属于 Authorization。可用性失败返回类型化 unavailable，用户确认不能绕过；availability 只能拒绝当前锁定 Binding，不能自动切换实现。

### 3.2 固定三态决策

授权求值只返回：

```text
ALLOW
DENY(reasonCode)
REQUIRE_USER_CONFIRMATION(request)
```

优先级固定为：

```text
DENY > REQUIRE_USER_CONFIRMATION > ALLOW
```

用户确认只能满足 `REQUIRE_USER_CONFIRMATION`，不能覆盖用户或 Tool 权限缺失、Workspace 越界、操作未授权、Schema 非法、TaskCapabilityLock/revision 不匹配、Credential/Adapter 不可用或未知风险。

AuthorizationEvaluator 对相同规范化输入必须产生相同结果。它不持有 I/O、系统时钟、随机源或 UI 回调。

### 3.3 固定风险矩阵

| 操作 | MVP 决策 |
| --- | --- |
| 授权范围内读取普通文件 | `ALLOW` |
| 授权范围内创建普通文件 | `ALLOW`，在任务结果中记录 |
| 授权范围内修改普通文件 | `ALLOW`，展示变更摘要 |
| 删除、批量覆盖或修改受保护文件 | 精确单 Action 用户确认 |
| 执行本地程序 | 精确单 Action 用户确认 |
| 调用外部 Model、中央远程 Tool 或服务并发送数据 | 按 Task、真实目标和数据范围确认 |
| 超出 FileGrant/WorkspaceGrant | `DENY`，确认不能越权 |
| Tool 风险缺失、冲突或不可解析 | `DENY`，失败关闭 |

WorkspaceGrant 只表示可以访问或处理资源，不自动授予 `send_external`。模型调用、远程 Tool 和服务调用的数据出站范围必须单独确认。

### 3.4 两种确认范围

#### SingleActionConfirmation

用于删除、批量覆盖、受保护文件修改和本地程序执行，至少绑定：

```text
taskId
runId
stepId
actionId
actionDigest
toolCapabilityRevision
bindingRevision
adapterDescriptorRevision
```

只允许执行完全相同的 Action。Action ID、参数、资源真实路径、命令、Tool revision 或 Binding/Descriptor revision 变化后必须重新确认。恢复同一个 Step/Effect 时可以继续使用；Retry 创建新 Run 后不继承。

#### TaskExternalScopeConfirmation

用于 Model、中央远程 Tool 和其他外部服务，至少绑定：

```text
taskId
externalTarget
dataScopeDigest
capabilityRevision
bindingRevision
adapterDescriptorRevision
```

规则：

1. 同一 Task、同一规范化真实目标和完全相同的数据范围可以复用；
2. 目标变化、数据范围扩大或改变、能力路径 revision 变化时重新确认；
3. 不跨 Task 复用；
4. 应用重启后仍可恢复；
5. Task 进入终态后结束；
6. MVP 只做精确匹配，不做子集推导、智能范围合并或自动扩大；
7. 不建设通用过期、撤销、继承和策略优先级。

`externalTarget` 使用规范化基础设施身份，不信任展示名称。`dataScopeDigest` 基于资源引用、字段/附件范围和发送类别的规范描述计算，不保存文件正文、Prompt 正文或 Secret。用户可以明确确认一个较大范围，但 WorkspaceGrant 本身不能被静默当作外发范围。

### 3.5 执行顺序

```text
Validated Model Request / Tool Action
→ validate TaskCapabilityLock
→ fixed user and capability authorization
→ FileGrant / WorkspaceGrant real-path and operation check
→ trusted ToolRiskFacts
→ local capability availability check
→ exact UserConfirmation lookup
    ├─ no confirmation required: continue
    ├─ matching confirmation: continue
    ├─ confirmation required: persist request + waiting
    └─ deny/unavailable: stop
→ after confirmation, recompute authorization, action digest and scope
→ Effect PREPARED（Tool side effect only）
→ before dispatch, recheck local Grant and capability availability
→ persist Effect DISPATCHED
→ Backend
→ typed Observation
```

固定不变量：

1. 必要用户确认完成前不得创建 `prepared` Effect；
2. 确认等待后必须重新计算，不信任等待前的内存结果；
3. `dispatched` 必须继续先持久化，再调用 Backend；
4. 分发前本地 Grant 或能力可用性已经收窄时，不调用 Backend；
5. 不在热路径调用中央 Policy 服务；企业服务不可用时使用最近一次成功同步且本地可运行的配置；
6. MVP 不建设中央推送式实时撤销。已经加载到 Local Core 的新配置或用户主动移除的本地 Grant，只影响尚未分发的后续操作；
7. 可用性变化不能更换 Task 锁定的 Binding。

Model 调用不是 Tool Action，不创建 Tool Effect；未来 ModelInvocationService 必须在调用 ModelProvider 前使用相同的外部目标与数据范围确认语义，并形成类型化调用记录。

### 3.6 持久 waiting 与用户决定

现有 Runtime 的：

```text
WaitReason = approval
```

在 KAF-4.1 的破坏性 Alpha Contract 演进中改为：

```text
WaitReason = user_confirmation
```

KAF-4.1 必须同步升级 Contract Version，并为已持久的 `v1alpha1` waiting checkpoint 提供明确 upgrader/migration 或失败关闭验证，不能静默误读。

确认流程：

```text
running
→ waiting(user_confirmation)
→ confirmed → revalidate → running → prepare Effect
→ rejected  → typed user_rejected Observation
```

- ConfirmationRequest 与用户决定均持久化并产生版本化 Event；
- Desktop 只提交版本化决定，不直接修改 TaskState；
- 用户拒绝不创建 Effect、不形成 Backend failure，也不算系统故障；
- 拒绝形成引用原 Action 的类型化 `user_rejected` Observation，允许 Agent 重新规划；
- 同一 Task/Run/Step 内完全相同且已拒绝的 Action 不重复弹窗，除非用户显式重试或 Action/范围改变；
- Headless/无 Desktop 时保持 `waiting(user_confirmation)`，不得隐式允许。

### 3.7 数据、凭证与审计

Contract/Event 可以保存稳定 ID、精确 revision、Action/范围 digest、规范化资源/目标引用、用户可读摘要、reason code、用户决定和时间。

不得保存 API Key/Token/Credential 明文、文件正文、完整 Prompt、大块外发内容、Runtime Handle、PID、连接实例或未经验证的目标展示字符串。

允许、拒绝、确认请求、确认结果和分发前失效必须形成可关联 Event。Effect metadata 只保存 Authorization/Confirmation 的稳定引用或 digest，不复制敏感输入。

## 4. 模块边界

| 模块 | 职责 |
| --- | --- |
| Contracts | AuthorizationDecision、ToolRiskFacts、UserConfirmationRequest/Scope/Decision |
| Kernel | 纯 Task/Run/Step waiting/resume 和 Action/Observation 状态，不访问 UI、SQLite 或配置 |
| Application | AuthorizationEvaluator 输入装配、UserConfirmationCoordinator、确认后重检和 Tool 执行编排 |
| Persistence | 确认请求、决定、Event、Checkpoint 与恢复的语义化原子接口 |
| Desktop | 展示目标、数据范围和风险，提交用户决定 |
| Worker/Backend | 只执行已经授权的请求，不自行弹窗、扩大范围或改变权限 |
| Central Service | 下发用户权限、Tool 分配和风险元数据，不参与 Task 运行时审批 |
| Admin Console | 不提供 Task/Run/Step/Tool Action 审批页面 |

Core 不依赖 Electron。KAF-4 先通过 Fake/Headless 决定入口验证，Desktop 在 KAF-5 独立 QA `PASS` 后接入真实确认界面。

## 5. 被拒绝或后置的方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 完整 Policy Engine 和规则 DSL | `DEFER` | MVP 没有足够真实规则，不建设通用治理平台 |
| DataClassification 体系 | `DEFER` | 首期只需明确外发数据范围；分类、继承和目的地规则后置 |
| Task/Run/Step/Tool Action 企业审批 | `REJECT for MVP` | 与 Desktop 用户确认混淆并扩大 Admin/Central 范围 |
| Approver 角色和独立审批模块 | `REJECT for MVP` | 已被产品功能基线删除 |
| 管理员代替用户确认本机操作 | `REJECT` | 破坏用户对本机文件、程序执行和数据外发的知情权 |
| yolo/bypass-all | `REJECT` | 一个模式即可绕过全部安全边界 |
| Agent/LLM 自报风险 | `REJECT` | 不可信输入不能降低权限门槛 |
| 用户确认覆盖 Workspace 越界 | `REJECT` | Confirmation 不是 Grant，也不是权限提升 |
| 中央实时撤销推送和 Policy 过期模式 | `DEFER` | MVP 使用最近有效配置，不建设实时治理系统 |
| 确认范围子集推导或智能合并 | `REJECT for MVP` | 容易静默扩大数据范围，精确匹配更可审计 |
| Agent/Skill 发布审核进入运行时确认 | `REJECT` | 发布治理与 Task 运行时是不同边界 |

## 6. 影响与风险

### 正面影响

- 普通授权文件创建和修改不会被逐次弹窗打断；
- 删除、程序执行和数据外发仍有确定、可恢复的安全 Gate；
- Core 保持 UI 无关，Desktop、Headless Harness 和未来客户端使用同一 Contract；
- 没有通用 Policy DSL、远程审批依赖和动态规则优先级；
- Confirmation 与 Effect、TaskCapabilityLock 和持久 Event 能形成完整证据链。

### 成本与控制

| 成本/风险 | 控制 |
| --- | --- |
| Action inspector 可能漏报风险 | 平台固定风险下限、受信 Tool 注册校验、unknown 失败关闭和覆盖测试 |
| 外部数据范围难以规范化 | Alpha 采用精确资源引用和 digest，不做模糊/子集推导 |
| 等待期间 Action 漂移 | 确认后重算 Action digest、目标、范围、权限和可用性 |
| 用户拒绝后 Agent 重复请求 | exact rejected Action 去重，只有显式重试或范围变化才允许再次请求 |
| Contract `approval` 重命名破坏旧数据 | 升级 Contract Version，提供 upgrader/migration 和 close/reopen 测试 |
| 企业服务离线导致权限信息不新鲜 | 明示使用最近成功同步配置；不宣称实时撤销，审计记录配置 revision |

## 7. 验收门槛

1. 相同规范化输入产生相同 AuthorizationDecision；
2. 授权范围内普通文件 read/create/modify 不请求确认；
3. Workspace 越界、操作权限缺失和未知风险稳定拒绝；
4. 删除、批量覆盖、受保护资源和程序执行绑定精确 Action 确认；
5. 相同 Task/真实目标/数据范围的外部调用不重复确认；
6. 目标、数据范围或锁定 revision 改变后必须重新确认；
7. 用户确认前不存在 Effect Attempt；
8. 用户拒绝产生 typed `user_rejected` Observation，且 Backend 未被调用；
9. 确认后、`prepared` 前和 `dispatched` 前的重检不能被绕过；
10. SQLite close/reopen 后恢复 waiting request、confirmed scope 和 rejected exact Action；
11. Headless 模式保持 waiting，不隐式允许；
12. Secret、正文、Runtime Handle 和 PID 不进入 Confirmation Contract/Event；
13. `approval → user_confirmation` 的 Contract/持久数据演进有自动化验证；
14. KAF-0～KAF-3 的 Contract、Kernel、Persistence、Effect、Registry 和 Process Echo 全量回归通过；
15. 独立 QA `PASS` 后才可关闭 KAF-4.1。

## 8. 适用边界与后续演进

本 ADR 只冻结 MVP 本地 Core 的固定授权与 Desktop 用户确认。未来若真实企业客户需要 DataClassification、目的地规则、企业运行时审批或实时撤销，必须建立新的 ADR，并保持：

- 新治理层不能绕过 FileGrant/WorkspaceGrant 和平台风险下限；
- 远程治理失败不能静默扩大能力；
- Approval 与 UserConfirmation 使用不同 Contract、角色和 UI；
- 任何新 Policy 都位于 Effect `prepared` 之前，并遵守 ADR-007 的持久化与不确定性语义；
- 已锁定 Binding 不因 Policy 或 health 自动 fallback。

KAF-4 的分批实现、性能目标和独立 QA 范围见 [KAF-4 开发计划](../architecture/KAF-4-DEVELOPMENT-PLAN.md)。
