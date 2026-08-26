# RoboThree CGF-2C Development Plan

> 阶段：`CGF-2C — Real User Model Invocation, Confirmation and Joint Recovery`  
> 状态：**CONFIRMED；CGF-2C.1 PASS/CLOSED；CGF-2C.2/2C.3 GATED；
> ADR-017 IMPLEMENTATION GATE
> PASS/CLOSED**  
> 日期：2026-08-02  
> 前置状态：CGF-2.0、CGF-2A、CGF-2B `PASS/CLOSED`  
> 硬前置：[ADR-017 Implementation Plan](./ADR-017-IMPLEMENTATION-PLAN.md) 全部实现、
> Conformance、独立 QA 和用户接受  
> 用户确认：2026-08-02 接受修订版复核结论并确认本计划  
> CGF-2C.1 具体方案：[CGF-2C.1 Development Plan](./CGF-2C.1-DEVELOPMENT-PLAN.md)  
> 后续门槛：ADR17-I1/I2/I3 已全部关闭；CGF-2C.1 Revision 1 已通过 Claude
> Code `P0～P3=0` 复核并由用户正式接受、单独授权编码  
> Enterprise Integration：继续 `GATED`

## 1. 阶段目标

把 CGF-2B 已关闭的 Java Central Model Gateway 与 Local Core、Desktop 接通，
形成第一条真实用户模型链路：

```text
Desktop submitTurn
→ Local Core Runtime Selection / Context Assembly
→ ModelInvocationAdmission
→ exact Desktop user confirmation
→ Enterprise Access Token
→ Central durable Model Invocation
→ direct provider or public custom relay
→ SSE text/tool-call/terminal
→ Local Core Agent Loop
→ durable Assistant Message
→ Desktop Snapshot convergence
```

阶段关闭只允许声明：

```text
MODEL_GATEWAY_FOUNDATION_PASS / CLOSED
ENTERPRISE_INTEGRATION GATED
ENTERPRISE_PILOT_NOT_READY
```

CGF-2C 是真实模型链路打通，不是业务场景上线，也不是企业生产集成完成。

## 2. 已有基础与新增接缝

### 2.1 直接复用

- CGF-2A：Model Invocation、PostgreSQL v0007、durable event、lease/fencing、
  cancel/timeout 和 evidence-based recovery；
- CGF-2B：Anthropic/OpenAI-compatible Adapter、Credential Transport、Endpoint
  Policy、厂商直连、自定义中转站、双 JVM Recovery 和资源关闭；
- DCF-1.3：Desktop/Core lifecycle、SSE reconnect、slow consumer 和资源清理；
- DCF-2：Task/Tool Activity、用户确认、Task Control、Snapshot/cursor 与人工处理；
- ADR-010/011/012：Context Assembly、Runtime Selection、submitTurn 原子协调；
- `EnterpriseAccessTokenProvider` 和 CGF-1 Identity/Configuration Foundation；
- ADR-017：Tool Call Batch no-orphan、取消/确认/恢复语义。

### 2.2 本阶段新增

1. Local Core `ModelInvocationAdmission`；
2. Local Core `HttpEnterpriseModelProvider`；
3. Model 外发专用 Confirmation Scope；
4. Central SSE 到 Core ModelProvider Event 的类型化投影；
5. Provider-neutral Tool Calling 与通过 ADR-017 的 Agent Loop 接通；
6. Desktop 外发确认和真实 Streaming；
7. ephemeral delta 到 durable Assistant Message 的最终收敛；
8. Java/Node/Electron/PostgreSQL 联合恢复 Harness；
9. 最小 Model Audit Outbox 联合验证。

## 3. 产品与 PRD 边界

### 3.1 不依赖完整业务 PRD

CGF-2C.1 是通用 Core/Gateway 技术能力，不依赖招投标、合同审查或其他业务
场景。五个业务场景、业务 Agent 配置和 Tool Pack 集成都不是 C.1/C.2/C.3 的
进入条件。

### 3.2 CGF-2C.2 的硬前置

Desktop 可见体验开始编码前，用户必须确认一份聚焦的 Model Experience PRD
和 UX 状态矩阵，至少冻结：

- 外发确认卡片的信息层级；
- 外发目标、模型、数据类别和范围摘要文案；
- 允许、拒绝、取消和恢复操作；
- connecting/generating/reconnecting/unavailable/manual-attention/terminal 状态；
- ephemeral Streaming 与持久消息替换行为；
- `manual_attention` 的用户可见原因、处理责任、可执行动作以及 Retry、取消、
  导出诊断边界；
- 可访问性和敏感信息禁止展示规则。

PM 可以提出样板文案，技术负责人校验安全语义，前端负责人按确认稿实现，用户
拥有最终产品与 UX 决策权。禁止由代码默认生成未经确认的产品文案。C.1 不冻结
24/72 小时等运营 SLA；企业支持响应和升级时限后置到 Enterprise Integration
或独立运营决策。

五个业务场景、场景 Agent 配置和 Tool Pack 优先级可以并行规划，但不作为
CGF-2C.2 的技术进入条件；C.2 只冻结通用 Model Experience。

## 4. Model 外发确认最小 Contract 方向

### 4.1 当前 P1 缺口

现有 `TaskExternalConfirmationScope` 强制包含 `toolCapabilityRevision`，属于
Tool 外部发送确认，不能用于 Model Invocation。CGF-2C 禁止伪造 Tool revision
承载 Model 确认。

### 4.2 Additive scope

在 `ConfirmationScope` 增加内部/Local Contract 分支：

```text
task_model_external_scope
```

最小语义字段：

```text
schemaVersion
type = task_model_external_scope
taskId
runtimeSelectionDigest
modelCapabilityRevision
bindingRevision
adapterDescriptorRevision
externalTarget
dataCategories
dataScopeDigest
```

约束：

- `runtimeSelectionDigest` 绑定 Task 已锁定的 Agent/Model/Skill/Tool/Knowledge/
  Workspace 组合，但不暴露 Runtime Handle、PID 或 Credential；
- Model/Binding/Descriptor revision 必须与 Task 锁定事实一致；
- `dataCategories` 使用 Enterprise Gateway 已冻结的七项枚举；
- `dataScopeDigest` 绑定允许外发的授权范围清单，而不是本轮 Prompt/正文 digest；
  范围清单至少包含类别集合、锁定 Skill/Knowledge/Tool revision、WorkspaceGrant
  边界引用和 externalTarget，但不保存正文或完整本地路径；
- 整个 scope 继续生成 `scopeDigest`，Confirmation Decision 精确引用该 digest；
- 同 Task、同 externalTarget、同 revision、同 categories、同授权范围
  `dataScopeDigest` 才能复用；同一范围内的新 user text 或 Conversation Message
  不视为范围扩大。新增类别、新 Workspace/Knowledge/Skill 来源或既有边界扩大
  必须重新确认。

### 4.3 七类数据

严格复用 Enterprise Gateway canonical 枚举：

```text
user_text
platform_agent_instructions
tool_schema
workspace_content
skill_content
knowledge_content
tool_result
```

Conversation 历史按其原始来源归入上述类别，不新增第八类
`conversation_context`。未知来源、未知类别或无法确定 scope 的数据默认禁止外发。

### 4.4 兼容和投影

- 保持 `single_action` 与现有 `task_external_scope` 语义不变；
- 新分支使用当前 Local Contract `v1alpha2` 的 additive schema/fixture/
  conformance 修订，不修改 Enterprise Gateway 已冻结的
  `userConfirmedAdmission` 字段；
- Desktop Projection 只增加安全的模型外发摘要，不包含 RuntimeSelection、
  CapabilityLock、revision digest、Prompt、Token 或 Credential；
- Renderer 只提交 `confirmationId + requestDigest + decision`，不得自行计算
  dataScopeDigest 或权限交集；
- 如果复核认为 additive union 对现有 reader 不兼容，必须在 CGF-2C.1 编码前
  升级 Local Contract version，不得静默放宽 parser。

### 4.5 最小 Fixture

至少覆盖：

- valid exact Model external scope；
- 缺 Runtime Selection digest；
- Model/Binding/Descriptor revision 缺失或漂移；
- data category 重复、未知或为空；
- dataScopeDigest/scopeDigest/confirmationDigest 不匹配；
- Task mismatch；
- 同一授权范围内正文变化仍可复用确认，但 requestDigest 必须随实际请求变化；
- 新增数据类别或扩大 Workspace/Knowledge/Skill 来源必须重新确认；
- 同 scope 幂等确认；
- 同 confirmationId 不同 digest 冲突；
- 旧 Tool confirmation 不回归；
- Desktop Projection 敏感字段 0 命中。

## 5. ModelInvocationAdmission

### 5.1 顺序

```text
Validated ModelRequest
→ load exact TaskRuntimeSelection / CapabilityLock
→ derive externalTarget + dataCategories + dataScopeDigest
→ find exact confirmed task_model_external_scope
→ revalidate user/session/device/permission/model availability
→ acquire Enterprise Access Token
→ create or recover exact Model Invocation
```

### 5.2 必须失败关闭

- Task、Run、Model、Binding、Descriptor 或 Registry revision 漂移；
- 用户、设备、企业会话或 `model.use` 权限无效；
- Model disabled/revoked/unhealthy/credential unavailable；
- 未确认 Workspace/Skill/Knowledge/Tool Result；
- data category 未知或 dataScopeDigest 无法稳定计算；
- external target 与已确认目标不同；
- Central 不可用且不存在可查询的既有 Invocation；
- 试图静默切换个人 Model、其他企业 Model、Binding 或协议。

### 5.3 确认复用

首期确认按 Task、目标、Model revision 与数据范围生效。相同 Task 内精确 scope
未变化时不得每轮重复弹窗。以下任一变化必须重新确认：

- resolved Model 或 revision；
- Connection Mode、Binding 或 Adapter Descriptor revision；
- external target；
- data categories；
- dataScopeDigest。

`dataScopeDigest` 是授权范围 digest，Central `requestDigest` 才绑定单次实际
ModelRequest。禁止把完整 Prompt digest 当作确认复用键，否则每轮新消息都会
造成重复弹窗。

WorkspaceGrant 只授权本地读取，不等于允许内容外发。

## 6. HttpEnterpriseModelProvider

### 6.1 职责

- 实现 Core `ModelProvider` 类型化 Port；
- 复用 `EnterpriseAccessTokenProvider`；
- 调用 Central accept/status/cancel/SSE；
- 把 Central text/tool-call/terminal 投影为 provider-neutral Model Event；
- 传播 AbortSignal、deadline、correlation/trace context；
- 保持 clientRequestId/invocationId/requestId 生命周期；
- 不持久化 Prompt、Provider 私有帧、Token、Endpoint 或 Credential。

### 6.2 SSE 与恢复

- durable event 使用不透明 cursor 续接；
- ephemeral text/tool fragment 不持久化、不历史重放；
- reconnect 先查询 Snapshot/status，再恢复 durable cursor；
- 不把缺失 delta 拼接为完整结果；
- 最终 Assistant Message 只来自已经收敛的 Invocation terminal/result；
- 网络错误不得直接创建第二个 Invocation。

### 6.3 Access Token 最多续签一次

```text
401 / token expiry
→ 最多自动续签一次
→ 成功：继续同一 Invocation
→ 失败：停止自动重试
```

如果 Invocation 尚未 accepted：

- 不创建 Invocation；
- Task 进入可恢复的 external dependency waiting；
- Desktop Projection 展示 `enterprise_unavailable` guidance。

如果 Invocation 已 accepted/running：

- 保留原 Invocation；
- 不切换 Model，不创建第二 Invocation；
- 会话恢复后 status-first；
- 无法查询时保持可解释 waiting，不伪造 failed/completed/uncertain。

`enterprise_unavailable` 是 Desktop Presentation/typed guidance，不新增公共
TaskStatus。用户恢复企业会话后通过既有 continue/retry 入口继续，不做无限后台
重试。

## 7. Provider-neutral Tool Calling

- Central 两套 Wire Adapter 继续各自解析 Tool fragment；
- Local Core 只接收 provider-neutral Tool Call；
- Tool Call 必须进入通过 ADR-017 的批次持久化、确认和恢复链路；
- Stub Provider Tool Calling Conformance 是 CGF-2C Foundation 强制门槛；
- 真实 Provider Tool Calling 仅在目标 Model Descriptor 明确支持且真实验证通过
  后启用；
- 不支持或语义不稳定时 Descriptor 声明 `supportsToolCalling=false`；
- 禁止 Local Core、Central 或 Adapter 伪造 Tool Call；
- 真实 DeepSeek Tool Calling 不是文本 Model Gateway Foundation 关闭的强制
  条件，未通过时不得宣称真实 DeepSeek Tool Loop 已完成。

## 8. 分批计划

### 8.1 CGF-2C.1：Core Adapter、Admission 与 Contract

具体实施边界、事务窗口、Central HTTP/SSE 所有权和 QA 矩阵见
[CGF-2C.1 Development Plan](./CGF-2C.1-DEVELOPMENT-PLAN.md)。该详细计划当前为
`ACCEPTED / IMPLEMENTATION IN PROGRESS`。首轮评审提出的执行
owner/被动订阅关系、SSE 网络抖动恢复和 Core SSE 字段级严格消费规则已经补入，
同时已按既有 Contract 校正 canonical event 类型和 ADR-015 错误码。

交付：

- `task_model_external_scope` additive Contract/Fixture/Conformance；
- `ModelInvocationAdmission`；
- `HttpEnterpriseModelProvider`；
- accept/status/cancel/SSE 与 token-once renewal；
- direct provider/custom relay 两种已锁定 Binding 的同一 Core 路径；
- Stub text/tool-call Conformance；
- InMemory/SQLite admission/confirmation replay；
- 不修改 Kernel reducer、Central v0007 或 Provider production Adapter。

CGF-2C.1 不依赖完整 PRD/UX，可以在 CGF-2C.2 PRD 准备期间先行，但必须在
ADR-017 Implementation Gate 关闭、计划复核、用户明确授权后才可编码。

退出：独立 QA PASS、用户接受后才可关闭 C.1 和授权 C.2。

### 8.2 CGF-2C.2：Desktop Confirmation、Streaming 与 Message 收敛

交付：

- Model Experience PRD/UX 已由用户确认；
- 模型外发确认卡片；
- connecting/generating/reconnecting/cancelled/timed_out/
  enterprise_unavailable/manual_attention/completed/failed；
- ephemeral Assistant text；
- durable Assistant Message 替换；
- cancel、拒绝、企业会话恢复和可操作错误指引；
- Renderer 只消费 Projection/delta，不建立第二 reducer；
- 现场体验：确认、Streaming、取消、重启恢复和持久消息。

退出：自动化独立 QA + 用户现场体验均 PASS 后才可关闭 C.2 和授权 C.3。

### 8.3 CGF-2C.3：Java/Node/Electron Joint Recovery

链路：

```text
Electron Desktop
→ Node Local Core
→ two independent Java Central JVMs
→ shared PostgreSQL 16
→ controlled Provider/Relay
```

至少覆盖：

1. Desktop reconnect；
2. Local Core restart；
3. Central accept 前、accepted 后、running 后重启；
4. Central lease takeover 与 stale fencing；
5. SSE durable cursor 续接；
6. ephemeral delta 丢失后 Snapshot/message 收敛；
7. cancel/completed 竞争；
8. timeout/late Provider event；
9. Token 续签成功一次与续签失败；
10. permission/device/session invalid；
11. Model revision/config generation drift；
12. 用户拒绝外发；
13. scope 扩大后重新确认；
14. 多 Tool Call、等待确认、部分完成和崩溃恢复；
15. Audit Outbox 失败不反向改变 Task；
16. 最终 Conversation 不重复；
17. PID/port/connection/lease/subscriber/buffer/request/child 全部归零；
18. 日志、Trace、测试输出、QA evidence 四通道泄漏为 0。

真实 Provider 资源使用独立授权：新的受限 Development Key、固定 Endpoint/
Model、网络和调用费用。企业 CA、私网 Relay 和公司代理属于 Enterprise
Integration，不是 Foundation C.3 硬门槛。

退出：完整联合 Harness 独立 QA PASS、用户接受厂商直连与公共自定义中转站
基础体验，随后才可关闭 CGF-2 Foundation。

## 9. Desktop 状态与消息收敛

### 9.1 UI 状态不是第二状态机

Renderer 状态全部来自 Core Projection：

```text
connecting
generating
reconnecting
enterprise_unavailable
manual_attention
completed
failed
cancelled
timed_out
```

这些是产品展示状态，不改变 Kernel TaskStatus 或 Central Invocation 七状态。

### 9.2 收敛顺序

```text
ephemeral delta
→ Model terminal
→ Core durable Assistant Message
→ message_committed durable Event
→ Desktop Snapshot
→ replace ephemeral text with durable message
```

重连不补历史 delta；重启后只从 durable Message 恢复最终正文。相同
assistantMessageId/message digest 不重复追加。

## 10. 安全与数据边界

- Renderer 不获得 Enterprise Access Token、Credential、Endpoint Secret、完整
  Prompt、RuntimeSelectionSnapshot 或 CapabilityLock；
- Main/Preload 继续使用白名单 IPC，Renderer 不直连 Local Core/Central；
- Core 日志、Central 日志、Trace、测试和 QA evidence 不记录用户正文、模型
  输出、Tool 参数、Tool Result、Key、Token 或完整本地路径；
- report 只允许 count、digest、status、duration、resource metrics 和 typed
  error code；
- Provider redirect、per-request URL、未批准 Endpoint、静默 failover 继续失败
  关闭；
- Audit 失败不反向改变已完成 Task。

## 11. 非目标

- 真实 OA/CAS、MDM、企业 RBAC；
- 企业 MaaS 正式接入；
- 生产 Vault/KMS/Secret Store；
- 企业 CA、代理、私网 Relay Conformance；
- Admin Model 配置页面；
- 个人 Model；
- 自动模型路由、协议切换、Binding 切换或降级；
- 成本、配额与运营平台；
- 图像、音频、Batch、Responses API；
- 多 Agent/Subagent；
- Tool Call 并行；
- 五个业务场景、业务 Agent 配置或 Tool Pack 集成；
- 完整 Enterprise Integration。

## 12. 上游采用

| 来源 | 采用 | 不采用 |
| --- | --- | --- |
| OpenWorker | `ADAPT` no-orphan completion、cancel/crash 分流 | Python/asyncio、低风险并行、Inbox |
| Open WebUI | `ADAPT` typed streaming、ephemeral/durable UI 分层 | Svelte/Socket.IO/源码 |
| OpenClaw | `ADAPT` AbortSignal、bounded streaming、资源关闭 | Gateway/权限模型/源码 |
| RoboThree CGF-2A/B | durable Invocation、双协议 Adapter、恢复和安全 Transport | 不重复建设 Provider 平台 |

所有外部来源继续保持研究登记中的 `DESIGN_ONLY`/`ADAPT` 边界，不复制研究仓
或第三方源码进入产品仓库。

## 13. 工期修订

| 工作包 | 集中工程工作量 |
| --- | ---: |
| ADR-017 Implementation Gate | 4～6 天 |
| CGF-2C.1 | 3～5 天 |
| CGF-2C.2 | 3～5 天 |
| CGF-2C.3 | 3～5 天 |
| 合计 | 13～21 天 |

ADR-017 Implementation Gate 的 `4～6` 天工作包已完成并正式关闭；当前剩余
集中工程工作量为 CGF-2C.1～2C.3 的 `9～15` 天。

相对原 5～8 天估算的增量来源：

- ADR-017 durable batch/disposition 与恢复门槛：4～6 天；
- Provider-neutral Tool Calling Stub 和真实能力门槛：约 2～3 天；
- Java/Node/Electron 联合恢复矩阵扩大：约 2～4 天；
- 与原 Core/Desktop 基础链路存在复用和重叠，因此总计按 13～21 天而不是机械
  相加。

不包含 PRD/UX 等待、真实 Provider 资源等待、独立 QA 和返工。工程工作日不是
日历承诺。

## 14. 进入与退出门槛

### 14.1 CGF-2C.1

```text
ADR-017 Implementation I1/I2/I3 PASS/CLOSED
AND CGF-2C Plan document review PASS
AND Model external confirmation Contract direction accepted
AND 用户明确授权 CGF-2C.1
```

### 14.2 CGF-2C.2

```text
CGF-2C.1 PASS/CLOSED
AND Model Experience PRD/UX confirmed by user
AND 用户明确授权 CGF-2C.2
```

业务场景优先级不是 C.2 硬门槛。

### 14.3 CGF-2C.3

```text
CGF-2C.2 PASS/CLOSED
AND controlled joint Harness resources ready
AND real Provider resource separately authorized
AND 用户明确授权 CGF-2C.3
```

### 14.4 CGF-2 Foundation 关闭

```text
CGF-2.0 / 2A / 2B / 2C independent QA PASS
AND ADR-017 implementation/conformance/QA/user acceptance PASS
AND Model external confirmation PASS
AND complete joint Harness PASS
AND 用户接受 direct provider + public custom relay basic experience
```

允许结论：

```text
CGF-2 MODEL_GATEWAY_FOUNDATION_PASS / CLOSED
ENTERPRISE_INTEGRATION GATED
ENTERPRISE_PILOT_NOT_READY
```

## 15. 当前状态

```text
CGF-2.0：PASS/CLOSED
CGF-2A：PASS/CLOSED
CGF-2B：PASS/CLOSED
ADR-017 Implementation Plan：PASS/CLOSED
ADR17-I1/I2/I3：PASS/CLOSED
CGF-2C Plan：CONFIRMED
CGF-2C.1：PASS/CLOSED
CGF-2C.2/2C.3：GATED
Enterprise Integration：GATED
```

本计划建立、评审或接受均不自动授权编码。每批必须独立 QA、用户接受并获得下
一批明确授权。

## 16. 文档评审重点

1. `task_model_external_scope` 是否是最小且不滥用 Tool revision 的 additive
   方向；
2. 七类数据和 Conversation 来源归类是否与 Enterprise canonical Contract
   一致；
3. Token-once renewal 后的 waiting/Projection 是否避免重复 Invocation；
4. C.1 不依赖 PRD、C.2 依赖通用 Model Experience PRD 的边界是否清晰；
5. Tool Calling Stub 强制、真实 Provider 可选是否保持 Foundation 可关闭；
6. 联合 Harness 是否覆盖 Desktop/Core/Central/PostgreSQL 全部 P0/P1 窗口；
7. 是否错误宣称生产就绪或把 Enterprise Integration 纳入本阶段；
8. 工期修订是否与实际工作量和既有复用相符。
