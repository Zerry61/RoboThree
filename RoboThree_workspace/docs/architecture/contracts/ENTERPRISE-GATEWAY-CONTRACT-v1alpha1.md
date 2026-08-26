# Enterprise Gateway Contract v1alpha1

> 状态：**ACCEPTED**  
> 日期：2026-07-24  
> 接受日期：2026-07-24  
> 适用边界：Node.js Local Core ↔ Java Central Enterprise Service  
> 总体架构状态：`CONFIRMED`  
> 当前实施门槛：CGF-1.1～CGF-1.3、CGF-2.0、CGF-2A、CGF-2B
> `PASS/CLOSED`；ADR-015/017 `ACCEPTED`；ADR17-I1/I2/I3 与 ADR-017
> Implementation Gate `PASS/CLOSED`；CGF-2C 与 Enterprise Integration `GATED`  
> 规范方向：OpenAPI 3.1、JSON Schema、HTTPS/JSON、SSE
> 2026-07-24 一致性修订：企业 Credential 隔离、canonical source、Package 限额与非中断激活  
> 2026-07-24 身份子协议修订：OA Enterprise Identity、Managed Device Trust、Device Challenge/Proof；ADR-014 于 2026-07-25 `ACCEPTED`

## 1. 目的

本 Contract 定义 Local Core 获取企业配置、调用企业 Model/中央 Tool 和上传最小审计的跨语言边界。它不允许 Central Service 接管本地 Runtime Selection、Agent Loop、Workspace、Session/Task、UserConfirmation 或个人 Model Credential。

Java 与 TypeScript 共享 Schema、规范内容和 Conformance Fixture，不共享 Java DTO、TypeScript 源码类型或进程内对象。

## 2. Contract 领域

```text
Authentication Context
Compatibility
Configuration Snapshot / Package Materialization
Enterprise Model Gateway
Central Tool Gateway
Audit Ingest
```

不建设万能 `/execute`，Model 与 Tool 保持不同的请求、流式和副作用语义。

本文件冻结方向和核心语义；CGF-2.0 已在唯一 canonical OpenAPI/JSON Schema
中冻结 Model Invocation 的具体 GET/POST URL、字段和 provider-neutral
payload。Provider 私有 payload 继续只属于 Central Adapter。

## 3. Authentication Context

MVP 身份上下文至少证明：

```text
enterpriseId
userId
deviceId
clientInstanceId
tokenId
fixed permission
Desktop/Core version
Contract version
```

Central Service 不信任请求正文自行声明的 `enterpriseId/userId/deviceId`。
企业会话必须满足：

```text
OA Enterprise Identity
∩ Managed Device Trust
∩ RoboThree Permission
∩ Compatibility
→ Short-lived RoboThree Access Token
```

Local Core/Desktop 使用 `EnterpriseUserIdentityClient`、
`EnterpriseCredentialStore` 和不可导出私钥的 `EnterpriseDeviceSigner`；
Central 使用 `EnterpriseUserIdentityVerifier/OAIdentityAdapter`、
`EnterpriseDeviceTrustProvider` 和 `RoboThreeAccessTokenIssuer`。两侧 Port
不得合并为跨进程对象。

语言中立身份子协议只冻结 `verifiedIdentityId`、Device Challenge/Proof、可选
Device Enrollment 和短期 Access Token Claims。OA 用户名密码、Ticket、SDK、
Token Exchange、OIDC、PKCE 和浏览器 Callback 不进入本 Contract。
Enrollment Code 只允许作为可选 Manual Device Enrollment Adapter，不承担用户
身份认证。

客户端企业身份凭证由 ADR-014 的 `EnterpriseCredentialStore` 管理，与 ADR-013
的 `PersonalCredentialStore` 在 Port、namespace、reference、生命周期、错误和
审计上分离。设备私钥只能通过 `EnterpriseDeviceSigner.sign(challenge)` 使用，
不得解析或导出。

### 3.1 Local Access Token 多请求生命周期

一次配置同步包含一个 Snapshot 请求和零到多个 exact Package 请求。Local Core
通过独立的 `EnterpriseAccessTokenProvider` 获取短生命周期 Token lease；
`EnterpriseConfigurationClient` 不长期保存、刷新或持久化 Token。

该 Provider 是 ADR-014 Local 身份链的组合边界：

```text
EnterpriseUserIdentityClient
+ EnterpriseCredentialStore
+ EnterpriseDeviceSigner
→ Central RoboThreeAccessTokenIssuer
→ short-lived Token lease
```

它不把 Central `RoboThreeAccessTokenIssuer` 复制到本地。每次 HTTP 请求前必须
确认 Token 仍有效。Central 明确返回 `token_expired`/对应 401 时，Local 可以
执行一次内部配置控制的有界重新签发；恢复必须保持 enterprise/user/device/client
四因素 scope、`configuration.read` 权限和原 Snapshot/exact Package refs。

刷新失败、scope 漂移、用户或设备禁用、权限撤销或明确 authorization denied
必须终止同步。已下载内容只能停留在 unsealed candidate，不能 seal 或 Storage
Activation。seal 和 Storage Activation 前必须再次确认存在有效且同 scope 的
企业会话。

Access Token、OA material、Device Proof 和 Token lease 不进入
MaterializedEnterpriseConfiguration、SQLite、日志、错误、Fixture 或 Desktop
Contract。

## 4. Compatibility

Compatibility 语义至少返回：

- Central Service 版本；
- 支持的 Contract 范围；
- 最低 Desktop/Core 版本；
- 可用 feature；
- 维护/不可用状态；
- Configuration Snapshot 兼容范围。

未知破坏性 Contract 版本失败关闭。Local Core 不因兼容失败使用未验证新配置。

## 5. Configuration Snapshot

第一版只支持完整 Snapshot，不做增量 patch、实时撤销或运行中推送替换。

Snapshot 至少表达：

```text
snapshotId / revision / digest
minimum compatible Desktop/Core versions
Model Descriptors
Tool Descriptors
Agent immutable package references
Agent defaultModel / allowModelOverride / requiredModelCapabilities
Skill immutable package references
Knowledge Descriptors
fixed user permissions
Gateway endpoint descriptors
generatedAt
```

Snapshot 不包含：

- 企业 Credential 明文；
- 企业 credentialRef；
- 个人 Model/Skill Secret；
- Session/Task/Prompt/文件正文；
- Runtime Handle、PID、Connection Instance；
- 当前 Adapter health 结果。

Agent、Skill、Knowledge 继续是独立产品对象；Capability Registry 继续只管理 Model 和 Tool。

下发给 Local Core 的 Model/Tool Descriptor 只能包含 ID、revision/digest、
capabilities、`credentialAvailable`、可选 `unavailableReason`、Gateway endpoint
和权限/配置状态。Central Service 根据身份 claims、resolved model/tool ID 与
configuration revision 在服务端解析企业 Credential Binding；该 reference 不
属于客户端 Contract。

## 5.1 Canonical Contract 与 Package 边界

跨语言唯一事实源是仓库根级：

```text
contracts/enterprise-gateway/v1alpha1/
├── openapi.yaml
├── schemas/
├── fixtures/valid/
├── fixtures/invalid/
└── canonical digest rules
```

`packages/contracts` 中的 TypeScript 类型只是实现/消费层，必须通过该根级
Schema/Fixture Conformance，不得形成第二套可编辑 canonical source。

Agent/Skill 第一版使用 strict JSON `PackageDocument`，不使用 ZIP/TAR。Alpha
默认限额为：单文件 `utf8Content` 512 KiB、单 PackageDocument 4 MiB、最多 256
个文件、relativePath 最多 512 UTF-8 bytes、单次完整物化 64 MiB。默认值可配置
且可观测，但必须有不可绕过的绝对安全上限。

## 6. MaterializedEnterpriseConfiguration

`MaterializedEnterpriseConfiguration` 是：

- Enterprise Gateway Contract 的技术激活单位；
- CGF-1 的退出门槛；
- 本地离线可读配置的完整集合；
- Configuration Storage Activation 的唯一合格输入。

至少包括：

```text
validated Configuration Snapshot
validated Agent Packages
validated Skill Packages
Model Descriptors
Tool Descriptors
Knowledge Descriptors
fixed user permissions
all revisions and digests
compatibility information
```

激活条件：

1. Schema 合法；
2. Snapshot digest 正确；
3. Package digest 正确；
4. 引用完整；
5. 强依赖全部物化；
6. Package revision 一致；
7. Desktop/Core/Contract 版本兼容。

任一失败时保留上一有效配置，不形成半激活状态。

### 6.1 exact Package read

`v1alpha1` 增加向后兼容的 exact Package read operation，供 Local Core 完成
Snapshot 强依赖闭包。canonical URL/parameter 在 CGF-1.2A OpenAPI 变更中冻结，
核心语义为：

- 复用有效 Access Token 和 `configuration.read`；
- 请求绑定已下载 Snapshot 的 ID/revision；
- 只读取 Snapshot 引用的 `packageId/kind/revision/digest`；
- 不提供 latest、list、search、upload、update 或 delete；
- Central 验证 Package 引用属于调用者被授权的 Snapshot；
- 响应继续使用 `package-document.schema.json`；
- ETag 从 package digest 稳定派生；
- kind/revision/digest 不一致或 Snapshot membership 不成立时失败关闭；
- 配置更新期间仍允许原 Snapshot 按 exact revision 完成一致物化。

Package URL 必须来自受信 Central origin，不允许客户端跟随任意跨 origin
redirect。ETag 不能替代正文 Schema、字节上限和 digest 校验。

## 7. 两层激活

### EnterpriseConfigurationActivationStatus

`MaterializedEnterpriseConfiguration` 保持不可变，不包含独立可变的
`pending_runtime_activation` 布尔字段。Local Core 配置持久化领域保存
Storage active pointer、可选 Runtime active revision、最近同步时间和安全错误
code，由 Application 层派生：

```text
uninitialized
current
pending_restart
activation_failed
```

CGF-1.2 只产生前三种；`activation_failed` 由 CGF-1.3 Runtime Activation
记录。兼容接口若仍需 `pendingRuntimeActivation`，只能按
`activationState == pending_restart` 派生。

Activation Status 不进入 Kernel reducer、TaskRuntimeSelection、
TaskCapabilityLock 或企业 Configuration Snapshot。

### Configuration Storage Activation

表示 MaterializedEnterpriseConfiguration 已成为本地最近成功配置。Storage
active pointer 与 Runtime active revision 不一致时，Application 派生
`activationState=pending_restart`；旧接口中的 `pending_runtime_activation`
只是该状态的兼容 Projection。它不修改当前进程中冻结的 RegistrySnapshot。

### Runtime Registry Activation

表示 Local Core 受控重启或 ADR-008 明确允许的 rebuild 后：

- 从最近成功配置构建 Model/Tool Registry 输入；
- 生成并冻结新的 RegistrySnapshot/registryRevision；
- 新 Task 使用新 Registry；
- 当前 Task 继续使用原 TaskRuntimeSelection 和 TaskCapabilityLock。

Runtime Activation 默认在下一次正常启动时发生。只有 Core 空闲且不存在非终态
Task 时，用户才可明确选择“立即重启并应用”。存在 running、waiting input 或
waiting confirmation 等 Task 时，不得自动强制重启；保持
`activationState=pending_restart`，当前 Task 继续使用旧 Lock。

禁止：

- 运行中热替换 Binding；
- 修改当前 RegistrySnapshot；
- 多代 Registry 热并存；
- 静默替换正在执行的 Model/Tool；
- 把 Agent/Skill/Knowledge 放入 Capability Registry。
- 配置同步完成后直接杀死 Core 或中断活动/等待确认的 Task。

## 8. Enterprise Model Gateway

Local Core 负责选择并锁定实际 Model；Central Gateway 负责：

- 验证身份和固定权限；
- 验证 resolved Model ID/revision 和配置来源；
- 解析中央 Credential；
- 调用指定 Provider；
- 归一化流式事件、状态和错误；
- 保存最小 Invocation 状态和审计。

Central Gateway 不：

- 评分、排序或自动选择 Model；
- 根据 Prompt 改路由；
- 成本优化；
- Provider 失败后静默换模型；
- 把企业 Credential 返回 Local Core。

### Invocation 标识

```text
invocationId
    Central 逻辑 Model 调用

clientRequestId
    Local Core 提供的接受幂等 ID

requestId
    单次网络传输尝试
```

幂等承诺：

- 相同 clientRequestId + requestDigest 不重复创建 Invocation；
- 相同 ID、不同 digest 返回 conflict；
- 最终状态可查询；
- 已缓存事件可按不透明 cursor 重放；
- 未缓存 token delta 不承诺永久重放。

公共 Invocation 状态固定为：

```text
accepted
running
completed
failed
cancelled
timed_out
uncertain
```

`unknown` 只允许描述 Provider Adapter 内部“尚未获得可信证据”的判断过程，
不是第二个公共状态。Provider 已明确接收/执行但结果无法确认时，公共状态收敛
为 `uncertain`；`failed` 与 `timed_out` 只用于可信确定结果。

事件分为：

- durable lifecycle/usage：带独立 durable sequence 与 opaque cursor；
- ephemeral started/text/tool-call delta：只带 stream sequence，不承诺重放。

Provider 私有 chunk、完整 Prompt、完整输出和 token delta 不进入 durable
Event。重连必须先查询 Invocation status，再使用 opaque cursor 续接可用的
durable facts。

Recovery coordination 是 Central 内部 Contract：

- lease 使用数据库时间；
- acquire/renew/takeover 使用 fencing epoch；
- durable commit 必须同时校验当前 epoch、status revision 和 next sequence；
- lease 到期只允许 owner takeover，不直接修改公共 Invocation 状态；
- lease TTL、Provider request deadline、stream idle 与 recovery query
  deadline 是四类独立计时语义。

不承诺：

- Provider 调用幂等；
- 网络断开后安全重调 Provider；
- 完整 token stream 永久重放；
- 相同输入得到相同输出；
- 通用 exactly-once。

无法判断 Provider 是否已接收或执行时，Central 必须先进行受限状态查询和恢复
判定；证据仍不足时使用公共 `uncertain`。Local Core 不得盲目创建第二次
Invocation。

## 9. Central Tool Gateway

Local Core 继续按 ADR-007 持久化 Effect Intent、DISPATCHED 和恢复语义。跨边界标识分离：

```text
effectAttemptId
    Local Core 已持久化的 Tool Effect Attempt

idempotencyKey
    业务副作用幂等键，安全恢复时保持

requestId
    每次传输尝试使用新值

executionId
    Central Gateway 执行记录
```

状态至少区分：

```text
accepted
running
completed
failed
cancelled
timed_out
uncertain
```

`failed` 只表示可信确定失败。无法确认远端副作用是否发生时返回 `uncertain`。只有幂等或可查询 Backend 才允许按既有 recovery mode 重试，不能宣称通用 exactly-once。

第一条真实链路使用 Remote Echo/HTTP Tool；真实 MCP 在 Gateway 基础稳定后接入。

## 10. Audit Ingest

最小 Audit 使用：

- eventId 去重；
- at-least-once；
- 有界 batch；
- Local Core Outbox；
- typed accepted/rejected result。

Audit 失败不反向改变已经完成的本地 Task。

不得上传：

- 完整任务正文、Prompt 和 Model 完整输出；
- 本地文件正文；
- API Key、Token 和 Credential；
- Tool 大块结果；
- Runtime Handle、PID、连接对象。

## 11. 离线与不可用

```text
Central Service unavailable or no valid enterprise session
→ keep cached MaterializedEnterpriseConfiguration bytes
→ do not synchronize configuration
→ do not perform Storage/Runtime Activation
→ enterprise Agent/Skill do not enter Runtime Registry or Prompt
→ enterprise Model unavailable
→ central remote Tool unavailable
→ preserve historical Task/Event/Audit facts
```

企业 Model/Tool 不因 Central 断线被静默替换。离线企业 Agent/Skill 执行和纯
本地个人模式后置，不由本 Contract 或 CGF-1.1 建设。

MVP 不做配置过期强停、受限模式、实时权限撤销或自动 failover。

## 12. 错误语义

跨语言错误至少区分：

```text
validation
authentication
authorization
compatibility
availability
rate_limit
timeout
cancelled
conflict
unknown
uncertain
internal
```

错误包含稳定 code、retryable、可选 retry-after、request/correlation reference 和安全详情。不得返回 Credential、任务正文或 Provider 原始敏感响应。

## 13. Conformance

Contract 冻结后必须覆盖：

- OpenAPI/JSON Schema 与 TS/Java 同一 Fixture；
- strict/unknown version/enum/extra field；
- canonical digest；
- Snapshot 引用和 Package 物化；
- Package 单文件/总文档/完整物化边界；
- Snapshot/Descriptor 企业 credentialRef 禁入；
- 唯一根级 canonical source 与 TS/Java 同 Fixture；
- Enterprise/Personal Credential Port 隔离；
- OA Identity、Device Trust、Permission、Compatibility 四项交集；
- Device Challenge 短期、单次、上下文绑定和防重放；
- Device Proof 不包含私钥、Keychain Handle 或 Provider 对象；
- Access Token Claims 绑定 enterprise/user/device/client/token；
- device not managed/not compliant/access denied 与 challenge/proof typed error；
- Storage Activation/Runtime Activation 分离；
- 非终态 Task 下不自动重启、不热替换 Registry；
- Invocation 接受幂等、conflict、status query、有限 replay；
- Tool uncertain 和 idempotency；
- Audit 去重；
- Secret/Runtime Handle 禁入；
- Central 离线保留缓存但不激活、不进入 Runtime/Prompt。

CGF-0 只使用非正式 Fixture 验证构建和传输 Pipeline，不生成正式业务 DTO 或 migration。后续正式 DTO 必须以本 Contract 为语义基线，通过 OpenAPI/JSON Schema 与 TS/Java Conformance 后才能进入 CGF-1+。

## 14. 后续实施事项

1. 真实 OA Adapter、真实 Device Trust Adapter 与生产 Device Signer；
2. 公司 Java、数据库和 Secret Store 基线；
3. 首个真实 OpenAI-compatible 企业 Provider；
4. 正式错误码、URL、字段和兼容矩阵 Conformance；
5. Snapshot/Package 下载、缓存大小与清理策略；
6. Audit 元数据保留期限；
7. CGF-1+ 每批独立 QA。
