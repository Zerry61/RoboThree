# ADR-015：Enterprise Model Invocation 与 Development Provider 边界

> 状态：**ACCEPTED**  
> 提出日期：2026-07-28  
> 重新对齐日期：2026-07-30  
> 评审修订日期：2026-07-30  
> 接受日期：2026-07-30  
> 适用范围：CGF-2 Model Gateway Foundation、Local Core 企业 Model Adapter、
> Development Profile 的真实 DeepSeek 验证，以及后续企业 MaaS Adapter  
> 前置决策：ADR-006、ADR-008、ADR-009、ADR-010、ADR-011、ADR-014、
> ADR-016、Alignment-1/2A/2B `PASS/CLOSED`、Enterprise Gateway Contract
> v1alpha1、MVP 功能范围与开发基线 v1.0  
> 编码状态：**CGF-2.0、CGF-2A.1 PASS/CLOSED；ADR-015 补充修订 A
> ACCEPTED；CGF-2 Plan 补充对齐修订 REVIEW_PASS / USER_CONFIRMATION_PENDING；
> CGF-2A.2、2A.3、2B、2C 继续 GATED**  
> 已接受补充：[ADR-015 补充修订 A：厂商直连、自定义中转站与 Model
> Endpoint Binding](./015a-direct-provider-and-custom-relay-addendum.md)

## 1. 背景

RoboThree 已经具备 provider-neutral `ModelRequest`、类型化 `ModelProvider`、
Context Pipeline、Agent Loop、TaskRuntimeSelection、TaskCapabilityLock、
企业配置、身份/设备/权限 Foundation，以及 Desktop Streaming 和恢复能力，
但真实模型仍由 Fake/Scripted Provider 提供。

原 CGF-2 计划把真实企业身份、设备信任、企业 RBAC、生产 Secret Store、企业
MaaS 和 Model Gateway 同时接入。该路径会让基础模型体验依赖企业 IT、OA、
MDM、网络、证书、权限和 MaaS 多方协调，无法尽早验证真实 Streaming、错误、
取消、持久消息和用户体验。

用户决定先使用隔离测试企业身份和真实 DeepSeek 模型建立 Model Experience
Foundation，把真实 OA/SSO、正式 Device Trust、企业 RBAC 映射、企业 Secret
Store 和企业 MaaS Adapter 后置。本 ADR 冻结该分层，同时禁止测试 Adapter
演变成生产绕过路径。

## 2. 决策概览

CGF-2 Foundation 使用同一条真实进程边界：

```text
Desktop
→ Local Core Agent Loop
→ HttpEnterpriseModelProvider
→ Enterprise Model Gateway Contract
→ Java Central Service
→ Anthropic-compatible / OpenAI-compatible Provider Adapter
→ Development DeepSeek Provider Profile
→ DeepSeek API
```

Development Profile 组合：

```text
Test Enterprise Identity
∩ Test Device Trust
∩ Fixed RoboThree Permission
∩ Compatibility
→ Short-lived RoboThree Access Token
→ Central Model Gateway
→ Development Credential Source
→ DeepSeek Provider
```

企业试点替换为：

```text
OA Enterprise Identity
∩ Managed Device Trust
∩ Enterprise Permission Mapping
∩ Compatibility
→ Short-lived RoboThree Access Token
→ Central Model Gateway
→ Enterprise Secret Store
→ Enterprise MaaS Provider Adapter
```

Local Core、Agent Loop、Task/Context、Desktop 和语言中立 Gateway Contract
不得因 Adapter 替换而重写。

## 3. 核心决策

### 3.1 Foundation 完成不等于企业生产就绪

CGF-2 Foundation 可以在 Development Profile 下以真实 DeepSeek 完成工程和
用户体验验收，但只能声明：

```text
MODEL_GATEWAY_FOUNDATION_PASS
ENTERPRISE_PILOT_NOT_READY
```

以下生产集成独立后置：

- 真实 OA/SSO 或公司身份 Adapter；
- 正式 MDM、设备证书或设备合规；
- 企业 RBAC/用户组到 RoboThree 固定权限的映射；
- Vault/KMS/公司 Secret Store；
- 企业 MaaS；
- 生产 TLS、企业 CA、代理、网络白名单和部署；
- 正式 Admin 配置与企业试点验收。

后置企业集成不允许修改 Foundation 的 Invocation 语义，只能提供新的受信
Adapter 和部署配置。

### 3.2 测试账号是 Adapter Fixture，不是生产账号体系

Development Profile 可以 seed 一个测试企业上下文：

```text
enterpriseId = enterprise.test
userId       = user.demo
deviceId     = device.demo
permissions  = configuration.read, model.use
```

约束：

1. 只在显式 `development-model-gateway` 或 test profile 启用；
2. 复用 ADR-014 的 Fake/Test Identity、Device Proof、Trust 和短期 Token 链，
   不在 Controller、Core 或 Renderer 中硬编码“跳过认证”；
3. Token 继续绑定 enterprise/user/device/client/token 和权限；
4. Production Profile 检测到 Test Identity、Test Device 或 Development
   Credential Source 时启动失败；
5. 不建设注册、密码、找回密码、组织树、角色管理或账号管理页面；
6. 测试记录不能进入企业生产数据库或 Configuration Snapshot。

### 3.3 双协议 Provider 兼容与第一真实 DeepSeek Profile

Central 必须同时建立 Anthropic-compatible 与 OpenAI-compatible 两个独立
Provider Adapter。两者共用 provider-neutral Application Port 和 Conformance
Corpus，但分别维护 Wire DTO、SSE parser、finish reason、usage、Tool Call
fragment 和错误映射，禁止合并为带大量厂商条件分支的万能 Adapter。

首个真实开发 Provider 使用可配置 DeepSeek Profile，但不把 DeepSeek 的具体
URL、Model ID、API 版本或私有字段写入长期通用 Contract。部署配置决定当前
Profile 使用 Anthropic-compatible 或 OpenAI-compatible；运行期不得自动猜测
协议，也不得在失败后静默切换协议。

Central 内部受信配置至少区分：

```text
providerKind
endpointReference
modelId
credentialReference
protocolProfile
timeoutPolicy
capabilityFlags
```

Local Core 只看到企业 Model Descriptor、精确 revision 和 Gateway 路由，不
看到 Provider Endpoint、credentialReference 或 API Key。实际 DeepSeek
Model ID 和能力由部署配置与真实 Conformance 决定，不在本 ADR 硬编码。

CGF-2 Foundation 必须验证：

- Anthropic-compatible Stub Conformance；
- OpenAI-compatible Stub Conformance；
- 文本 Streaming；
- usage；
- timeout；
- cancel；
- finish reason；
- Provider 错误归一化；
- 最终 Assistant Message 持久收敛。

Tool Calling 必须完成 provider-neutral Contract 和双协议 Stub Conformance；
真实 DeepSeek Tool Calling 不作为文本 Model Gateway Foundation 的强制关闭
门槛。只有所选模型明确声明且真实 Conformance 通过时才能启用，不允许 Adapter
伪造支持。

Foundation 只要求至少一个已配置协议完成真实 Provider Conformance；另一协议
可以通过严格 Stub Conformance 证明实现边界，但必须显式标记
`realProviderConformance=false`。第二协议与企业实际 MaaS Endpoint 的真实
联调属于后置 Enterprise Integration 门槛，不属于 CGF-2 Foundation 关闭
条件，也不得仅凭 Stub 结果宣称真实 Provider 已兼容。

### 3.4 Model Invocation 使用独立持久事实

Model 调用不是 Tool Action，不创建 Tool `EffectAttempt`、Receipt 或
Observation。Central 建立独立 `ModelInvocation`：

```text
invocationId       # Central 逻辑调用
clientRequestId    # Local Core 接受幂等 ID
requestId          # 单次 HTTP 传输尝试
requestDigest      # provider-neutral 请求的 canonical digest
modelId/revision   # Task 已锁定 Model
configurationRevision
identityScope      # 来自有效 Token，不信任正文
status
createdAt/startedAt/endedAt
usage?
safeErrorCode?
lastDurableEventSequence
durableEventStreamDigest?
```

不得持久化：

- API Key、Bearer Token 或 credential value；
- 完整 Prompt、用户正文和系统 Prompt；
- 完整 Model 输出或 token delta；
- Workspace、Skill、Knowledge 或 Tool Result 正文；
- Runtime Handle、HTTP Client 或 Provider SDK 对象。

Local Core 继续负责 Session、Conversation、Task 和最终 Assistant Message；
Central Invocation 不是第二套 Conversation。

### 3.5 Invocation 状态

对外状态统一为：

```text
accepted
running
completed
failed
cancelled
timed_out
uncertain
```

语义：

- `accepted`：Central 已持久接受逻辑 Invocation；
- `running`：已持久记录向 Provider 分发决定，不表示 Provider 一定收到；
- `completed`：收到并验证可信终态；
- `failed`：可信的确定失败；
- `cancelled`：取消已明确收敛；
- `timed_out`：本次等待超时且未收到成功终态；
- `uncertain`：无法确认 Provider 是否收到、执行、计费或完成。

`unknown` 不作为第二个公共状态。Provider 内部不确定结果统一映射为
`uncertain`。不得把网络异常直接伪造成 `failed`。

### 3.6 接受幂等与恢复边界

Gateway 只承诺接受幂等：

1. 相同 `clientRequestId + requestDigest` 返回同一 `invocationId`；
2. 相同 `clientRequestId`、不同 digest 返回 conflict；
3. `accepted` 必须先持久化，再进入 Provider 调用；
4. `running` 必须先持久化，再发送 Provider 请求；
5. Provider 调用不声明幂等；
6. 网络断开后先查询原 Invocation，不盲目创建新 Invocation；
7. Central 在 `running` 崩溃且 Provider 不支持查询时恢复为 `uncertain`；
8. 用户显式重试创建新的 Invocation，不复用旧 `clientRequestId`；
9. 不自动切换 Model、Binding、Provider 或个人 Model；
10. 当前 Task 继续使用原 TaskRuntimeSelection 和 CapabilityLock。

Model 生成通常没有企业业务副作用，但可能产生计费、输出重复和审计事实，因此
仍禁止自动重调。

### 3.7 Streaming 与 cursor

Gateway 使用 SSE 输出统一事件 Envelope：

```text
invocationId
eventId
eventClass          # durable | ephemeral
durableSequence?    # 仅 durable event
streamSequence?     # 当前瞬时 stream
eventType
eventPayload
eventDigest
durableCursor?
occurredAt
```

标准事件投影到现有 Model Protocol：

```text
started
text_delta
tool_call
usage
completed
failed
```

规则：

- Provider 私有 chunk 不直接传给 Local Core；
- fragmented Tool Call 必须在 Central Adapter 内校验并组装后再发
  provider-neutral `tool_call`；
- cursor 不透明，不与 Task Event sequence 混用；
- durable event sequence 与 ephemeral stream sequence 分离；
- accepted、dispatch decision、usage、terminal、cancel、timeout 和 uncertain
  进入 PostgreSQL Durable Event；
- token delta 只做有界临时缓存，不进入 Durable Event，不承诺跨节点或永久
  重放；
- Local Core 重连先查询 Invocation 状态，再从可用 cursor 续接；
- delta 丢失时不得拼接不完整最终消息；
- Central Invocation outcome 与 Local delivery outcome 分离：Provider 结果未知
  才进入 `uncertain`；Central 已可信完成但 Local 缺少完整输出时，Invocation
  保持 `completed`，Local Task 以 typed `model_stream_resume_unavailable`
  进入人工处理；
- Local Core 不持久化残缺 Assistant Message，重试必须由用户显式创建新
  Invocation；
- Central 不持久保存完整输出以换取无限重放。

### 3.8 跨节点 lease、claim 与 fencing

Model Invocation 的恢复协调必须持久化在 PostgreSQL：

```text
leaseOwner
leaseEpoch
leaseExpiresAt
nextRecoveryAt
recoveryAttempt
```

约束：

1. lease 使用数据库时间，不信任节点本地时间；
2. acquire/renew/takeover 使用显式 SQL 和 expected epoch CAS；
3. lease 只协调恢复所有权，不改变公共 Invocation 状态；
4. 新 owner 接管时递增 fencing epoch；
5. 旧 owner 的迟到 event、terminal 或 cancel commit 必须因 epoch 不匹配被
   拒绝；
6. 任意节点可以处理 status、cancel、SSE reconnect 和到期 lease 接管；
7. 不依赖 sticky session，不把 PID、线程或连接对象写入 Contract；
8. Provider 不可查询且 dispatch 结果未知时，接管后只能收敛为 uncertain，
   不得盲目重调。

#### 3.8.1 Lease 与 Invocation 时间策略分离

`leaseExpiresAt` 只表示恢复协调所有权何时可以被其他节点接管，不是
`running → uncertain` 的业务超时阈值。实现必须把以下时间语义分开：

```text
leaseTtl
providerRequestDeadline
providerStreamIdleTimeout
recoveryQueryDeadline
```

规则：

1. `leaseTtl` 使用数据库时间并允许当前 owner 有界续租；它只触发 takeover，
   不直接修改公共 Invocation 状态；
2. `providerRequestDeadline` 约束一次 Provider 调用的最长等待时间；
3. `providerStreamIdleTimeout` 约束已建立流在没有合法事件时的最长静默时间；
4. `recoveryQueryDeadline` 只适用于 Provider 明确支持状态查询的恢复路径；
5. `running → uncertain` 是基于证据的恢复决策，不是“运行超过固定时长”的
   定时迁移：只有 dispatch 可能已经到达 Provider、结果无法可信查询且不能
   安全重试时才进入 `uncertain`；
6. 请求在 dispatch 前确定超时，或 Provider 明确返回可信 timeout 终态时，
   才收敛为 `timed_out`；dispatch 后结果未知时不得用 `timed_out` 掩盖
   `uncertain`；
7. 上述策略必须是受限、版本化配置，并进入 CGF-2.0 Contract/Fixture；
   具体生产数值不得由 Controller、节点本地默认值或 Provider Adapter 私自
   决定。

### 3.9 Access Token 与权限复用

Local Core 复用 ADR-014/CGF-1 已有 `EnterpriseAccessTokenProvider`：

```text
audience = enterprise-model-gateway
requiredPermission = model.use
```

不新建第二套 Model Token Provider。Central 必须：

- 验证 Token signature、issuer、audience、expiry 和 issuance fact；
- 从 Token 获取 enterprise/user/device/client scope；
- 要求 `model.use`；
- 校验 Model 属于同一 enterprise/configuration scope；
- 校验 Model ID、revision、runtime-active generation 和请求 digest；
- 不信任正文自报身份；
- 不把 Access Token 传给上游 Provider。

### 3.10 Credential 边界

Production 使用独立的 Central Provider Credential Port：

```text
EnterpriseModelCredentialResolver
→ resolve opaque credentialReference
→ return short-lived in-memory provider authorization material
```

它不与 Local `EnterpriseCredentialStore` 或 `PersonalCredentialStore` 合并。

Development Profile 可以使用显式
`DevelopmentModelCredentialSource` 从进程启动环境解析 DeepSeek Key，但必须：

1. 只在 Development/Test Profile 注册；
2. 不把环境变量 Adapter 描述成生产 Secret Store；
3. Secret 不进入数据库、Contract、Fixture、Snapshot、日志、错误或 QA 报告；
4. credentialReference 只存在 Central 内部受信绑定；
5. Production Profile 发现该 Adapter 时启动失败；
6. 企业试点前必须替换为 Vault/KMS/公司 Secret Store Adapter。

### 3.11 Model 外发确认

ADR-006 对 Model 调用继续生效。调用真实外部 Provider 前，Local Core 必须形成
类型化 Model Invocation Admission：

```text
Validated ModelRequest
→ TaskCapabilityLock / RuntimeSelection 校验
→ fixed user permission
→ externalTarget 规范化
→ dataScopeDigest 计算
→ exact UserConfirmation
→ confirmation 后重新校验 Model/Scope/Availability
→ 创建 ModelInvocation
→ Central Gateway
```

确认范围按 Task、目标和数据类别精确绑定：

```text
user_text
platform_agent_instructions
tool_schema
workspace_content
skill_content
knowledge_content
tool_result
```

`dataScopeDigest` 只保存类别、资源引用、范围和 digest，不保存正文。目标变化、
新增数据类别、范围扩大、Model/Binding revision 变化时必须重新确认。
WorkspaceGrant 不能自动等同于外发授权。

CGF-2B 只允许 Central Harness 使用固定 synthetic 非敏感 Prompt，不接入
Desktop 用户输入。真实用户文本和 Platform/Agent instructions 必须等
CGF-2C 的类型化确认完成后才能外发；Workspace、Skill、Knowledge、
Tool Schema 和业务 Tool Result 在对应数据类别确认未实现前全部禁止进入
Provider 请求。

CGF-2B 的安全验收不得只依赖人工检查。Harness 必须为 synthetic 输入和输出
注入本批唯一 canary，并自动扫描应用日志、捕获的 Trace Export、测试输出和
QA evidence；canary、Prompt、输出正文及其可逆编码必须为零命中。报告只允许
记录 count、digest、status、duration 和 typed error code。

### 3.12 Audit 与隐私

最小 Model Invocation Audit 只记录：

```text
invocationId
enterprise/user/device scope
modelId/revision
requestDigest
status
duration
input/output token count
safe error code
configuration revision
timestamps
```

不记录完整 Prompt、输出、Tool 参数/结果、文件正文、Credential 或 Token。
Audit 失败不反向修改已经持久完成的 Local Task，但必须通过有界 Outbox 重试。

### 3.13 Production fail-closed

以下任一条件在 Production Profile 出现时，Model Gateway 必须拒绝启动或调用：

- Test Enterprise Identity；
- Test Device Trust；
- seeded `enterprise.test` 账号；
- DevelopmentModelCredentialSource；
- fixture Model Descriptor；
- HTTP 非 loopback 明文 Provider Endpoint；
- 未知 Provider protocol/capability；
- credentialReference 缺失或解析失败；
- Model revision/configuration generation 不匹配。

禁止通过环境变量、启动参数或 UI 开关把 Production 临时降级为 Development
Profile。

### 3.14 ADR-016 Java 工程边界

CGF-2 实现必须遵守已经关闭的 Alignment 基线：

- MyBatis-Plus 只进入 Persistence Adapter；
- accepted/running/terminal、event sequence、lease、fencing 和幂等使用显式
  Mapper SQL；
- Schema 使用下一个可用版本化 SQL、manifest、digest 和只读 Preflight；
- 不引入 Flyway，不在应用启动时执行 migration；
- 业务 HTTP 只使用 GET/POST；
- Controller 只调用 Application Facade，不写事务、权限、状态或 Provider
  分支；
- Global Exception Handler 输出安全 typed Error Envelope；
- HTTP、Application、JDBC、Provider 与 SSE 传播 W3C Trace Context，但
  Span/日志禁止记录 Prompt、输出、Token 或 Credential；
- 服务保持无状态，任意节点可 status、cancel、reconnect 和 recovery。

## 4. Contract 影响

CGF-2.0 需要对 `contracts/enterprise-gateway/v1alpha1` 做 additive 扩展，至少
新增：

- Model Invocation accept request/response；
- Invocation status；
- cancel；
- SSE Event Envelope；
- durable event sequence/cursor 与 ephemeral stream sequence；
- Invocation state enum；
- recovery lease/fencing 语义；
- typed error；
- Anthropic-compatible、OpenAI-compatible 与 DeepSeek Profile 只作为内部
  Adapter Fixture/Configuration，不进入通用 Wire Contract；
- `enterprise_model_gateway` compatibility feature；
- valid/invalid TS/Java Conformance Fixture。

现有 Configuration Snapshot、Package、Descriptor、identity、device、token、
revision/digest、ETag 和 Runtime Activation Schema 不得改写。

## 5. 非目标

本 ADR 不建设：

- 多 Provider 自动路由；
- 成本优化或模型评分；
- Provider 失败后自动换模；
- Provider 失败后自动切换 Anthropic/OpenAI 协议；
- 完整 RBAC、组织树或角色管理后台；
- 真实 OA/SSO、MDM 或设备证书；
- 企业 MaaS Adapter；
- 生产 Secret Store；
- 个人 Model；
- Prompt 缓存产品平台；
- 图像、音频、Batch 或 Responses API；
- 完整调用量/成本报表；
- 永久 token delta replay；
- 复杂 Policy Engine。

本 ADR 也不以任何具体业务场景优先级为前置条件。招投标、合同审查、HTML
预览或其他场景由 Agent、Skill、Tool、Knowledge 组合形成；它们可以并行进行
产品规划，但不得反向改变或阻塞通用 Model Gateway Foundation。HTML Fake
Provider 演示属于独立 Desktop 产品批次，不是 CGF-2 的交付物或进入门槛。

## 6. 影响与风险

正向影响：

- 在不等待企业 IT 的情况下验证真实 Model Gateway 和用户体验；
- Development/Production 通过 Adapter 与 profile 分离；
- DeepSeek 不进入 Core 业务逻辑；
- 后续企业 MaaS 复用同一 Invocation Contract；
- 保持 Credential、身份和数据外发边界。

主要风险：

1. Development Adapter 被误部署到生产；
2. Provider SSE 或 Tool Calling 与 Anthropic/OpenAI-compatible 细节不一致；
3. 网络断开产生计费和结果不确定；
4. Prompt/输出被 HTTP 日志或异常栈泄漏；
5. 外发范围确认不完整时发送 Workspace/Skill/Knowledge；
6. 跨语言 Contract 漂移；
7. 真实 DeepSeek 能力、限流和错误语义与 Stub 不一致。

对应缓解：

- profile 启动 fail-closed；
- 双协议 Stub Conformance、真实 Provider Conformance 和 bounded parser；
- accepted/running 先持久化、断线先查询；
- PostgreSQL Durable Event、lease、fencing epoch 和真实双 JVM Harness；
- 日志脱敏和动态 Secret 扫描；
- Model Invocation Admission；
- 共享 Schema/Fixture；
- 真实 API 冒烟不由 Stub 替代。

## 7. 接受前必须确认

1. CGF-2 Foundation 可以使用 Test Identity/Device/Permission，但 Production
   必须失败关闭；
2. Central 同时提供 Anthropic-compatible 与 OpenAI-compatible Adapter，
   首个真实 Provider 使用可配置 DeepSeek Profile；
3. DeepSeek API Key 只允许进入 Development Credential Source，企业试点前
   必须替换 Secret Store；
4. Model Invocation/Durable Event/lease 的权威事实进入 PostgreSQL，双节点
   recovery/fencing 是 CGF-2A 硬门槛；
5. 基础体验先完成文本 Streaming，真实 Tool Calling 不作为 Foundation 强制
   关闭门槛；
6. ADR-006 Model 外发确认是任何真实用户内容外发的前置，不以页面提示代替；
7. CGF-2 Foundation 完成不代表企业生产就绪；
8. OA/SSO、正式 Device Trust、RBAC、企业 MaaS 和企业 Secret Store 进入
   后续 Enterprise Integration 阶段。

Claude Code 修订版复核确认 6 项 P2、3 项 P3 全部关闭，
`P0/P1/P2/P3=0`。用户于 2026-07-30 正式接受本 ADR，并另行明确授权
CGF-2.0；CGF-2.0 独立 QA 通过并由用户正式接受关闭后，用户继续授权进入
CGF-2A。本轮按计划内部门槛仅实现 CGF-2A.1；CGF-2A.2、2A.3、2B 与 2C
仍须独立 QA、用户接受和明确授权。
