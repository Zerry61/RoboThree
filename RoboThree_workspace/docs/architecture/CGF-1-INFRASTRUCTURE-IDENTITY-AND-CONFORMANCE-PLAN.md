# RoboThree CGF-1 基础设施、身份与跨语言 Conformance 方案

> 状态：**CONFIRMED_WITH_SPECIFIED_REVISIONS**  
> 日期：2026-07-24  
> 适用批次：Central Gateway Foundation 1  
> 前置事实：CGF-0、Java Toolchain `CLOSED`  
> 语义基线：Enterprise Gateway Contract `v1alpha1 ACCEPTED`、ADR-008、ADR-009、ADR-011  
> 编码状态：**CGF-1.1 CLOSED；CGF-1.2 CONFIRMED_WITH_SPECIFIED_REVISIONS；CGF-1.2A AUTHORIZED**

## 1. 本方案要解决什么

CGF-0 已证明 Java 21/Spring Boot 模块化单体、跨语言 Fixture 和真实 HTTP Server
可构建运行。CGF-1 需要建立第一条正式企业配置链：

```text
Local Core 获得可信企业身份
→ 获取 Compatibility
→ 下载完整 Configuration Snapshot
→ 下载并校验 Agent/Skill Package
→ 形成 MaterializedEnterpriseConfiguration
→ Configuration Storage Activation
→ 派生 activationState=pending_restart
→ 受控 Core 重启
→ 新 RegistrySnapshot 只供新 Task 使用
```

本批不调用真实 Model/Tool。重点是身份、配置、持久化、物化、两层激活和跨语言
Conformance。

## 2. CGF-1 范围

### 2.1 本批包含

- Java Central Service 正式 Compatibility API；
- OA Enterprise Identity、Managed Device Trust 与可选 Device Enrollment；
- Device Challenge/Proof 与不可导出 Device Signer 边界；
- 短期 Access Token；
- 固定用户权限；
- 完整 Configuration Snapshot；
- Agent/Skill 不可变 Package；
- Model/Tool/Knowledge Descriptor；
- PostgreSQL persistence；
- Flyway migration；
- Java/TypeScript 共享 OpenAPI 3.1、JSON Schema 和 Fixture；
- Local Core Enterprise Configuration Client；
- 候选下载、校验、物化、Storage Activation；
- 上一有效配置保留；
- 派生的 `EnterpriseConfigurationActivationStatus`；
- 受控 Core 重启后的 Runtime Registry Activation；
- 中断、重试、ETag 和离线恢复。

### 2.2 本批不包含

- 真实企业 Model Provider 调用；
- Central Tool/MCP 执行；
- 完整 Admin Console；
- Agent/Skill 发布审核写入 API；
- 真实 OA Adapter、真实 MDM/设备证书和生产 Device Signer；
- 正式组织树、复杂 RBAC；
- Policy Engine、实时撤销和配置 push；
- Audit Ingest；
- 多租户 SaaS 隔离；
- 微服务拆分；
- Redis、Kafka、消息队列或分布式缓存；
- 自动模型路由；
- 运行期 Registry 热替换或多代 Registry 并存。

CGF-1 配置由可信 seed/测试发布工具准备；不借本批建设 Admin 写端。

## 3. 推荐基础设施基线

| 项目 | 推荐 | 说明 |
| --- | --- | --- |
| Java | 21 | 已由 `.java-version`、Wrapper、Enforcer 冻结 |
| Spring Boot | 3.5.16 | 延续 CGF-0，批次内不漂移 |
| Build | Maven Wrapper 3.9.16 | 开发机与 CI 同入口 |
| Database | PostgreSQL 16 | 保守企业基线；若公司有统一版本，以公司基线替换 |
| Migration | Flyway | forward-only migration，启动 preflight |
| Integration Test | Testcontainers PostgreSQL | 不用 H2 替代 PostgreSQL 语义 |
| HTTP Contract | OpenAPI 3.1 | HTTP surface 事实源 |
| Document Contract | JSON Schema 2020-12 | Snapshot/Package/Error 事实源 |
| Streaming | 本批不使用 SSE | Model/Tool streaming 留到 CGF-2/3 |
| Secret Store | 类型化 Port + Fake/Test Adapter | 真实企业 Adapter 在确认公司基础设施后接入 |

### 3.1 为什么暂不引入 Redis/Kafka

CGF-1 是配置读链和身份 Bootstrap：

- Snapshot 是完整不可变文档；
- 访问规模可由单体 + PostgreSQL 支撑；
- 不需要异步工作流；
- 不做实时 push/revoke；
- 引入消息设施只会增加一致性和部署面。

未来只有出现明确吞吐、异步审计或跨实例协调需求时再单独决策。

## 4. OA Identity、Managed Device Trust 与 Token

### 4.1 固定成立条件

```text
OA Enterprise Identity
∩ Managed Device Trust
∩ RoboThree Permission
∩ Compatibility
→ Short-lived RoboThree Access Token
```

RoboThree 不使用系统浏览器、OIDC、PKCE 或浏览器 Callback。OA 集成优先采用
官方 SDK、Ticket 或 Token Exchange，账号密码 API 只能作为次选 Adapter，且
不得自行设计密码加密算法。

### 4.2 六个所有者

```text
Local Core / Desktop
├── EnterpriseUserIdentityClient
├── EnterpriseCredentialStore
└── EnterpriseDeviceSigner

Central Service
├── EnterpriseUserIdentityVerifier
│   └── OAIdentityAdapter
├── EnterpriseDeviceTrustProvider
└── RoboThreeAccessTokenIssuer
```

Local 与 Central 的职责不能合并成跨进程“大 Port”。OA 的用户名密码、Ticket、
SDK 或 Token Exchange Wire Protocol 不进入长期 canonical Contract。

### 4.3 Renderer 和 Device Signer

Renderer 只能瞬时采集 OA 登录材料，不持久化、不缓存、不记录。Renderer 不得
获得 Access Token、OA Ticket、Refresh/Device/Client Credential 或设备私钥。

Local Core 建立：

```text
EnterpriseDeviceSigner
├── getDeviceKeyId
├── getPublicKey
└── sign(deviceChallenge)
```

禁止 `getPrivateKey/resolvePrivateKey/exportPrivateKey`。设备私钥优先存放在
Windows CNG/TPM、macOS Keychain + Secure Enclave、企业证书容器/PKCS#11 或
其他不可导出平台 Provider 中。CGF-1.1 只需要 Fake/Test Signer，不以真实 OS
Adapter 为完成门槛。

### 4.4 Device Challenge/Proof

Central 生成短期、单次、密码学安全随机 Challenge，并绑定 verified identity、
purpose、audience 和 `clientInstanceId`。Local Signer 只返回：

```text
challengeId
deviceKeyId
algorithm
signature
signedAt
```

Central 必须验证登记公钥、Challenge 签名、未撤销设备记录和当前合规结果，并在
成功后原子消费 Challenge。过期、重复、签名非法或上下文不匹配均失败关闭。

### 4.5 可选 Manual Device Enrollment

只有 OA/终端系统不能可靠判断设备时才启用：

```text
已验证 OA 用户
→ IT 单次短期 Device Enrollment Code
→ 设备生成不可导出密钥
→ Challenge/Proof
→ Central 登记公钥和可信 deviceId
```

Enrollment Code 不承担用户身份认证，也不能绕过 OA。Compatibility 使用
`enterprise_identity`、`managed_device_trust` 和
`manual_device_enrollment`，不使用 `enterprise_sso`。

### 4.6 Central 信任和传输边界

Central 不信任请求正文自报的 `enterpriseId/userId/deviceId`。短期 Token 至少
绑定 enterprise/user/device/client/token、权限和 Contract 版本。非 test
profile 必须使用 HTTPS；Access Token 只进入 Authorization Header；身份、
Challenge、Enrollment 和 Token 接口使用有界请求、rate limit 和安全审计摘要。

用户或设备禁用后不得签发新 Token；已签发短期 Token 自然过期；MVP 不做实时
push revoke。

### 4.7 ADR-014 门槛

ADR-014 已在身份 Schema/Fixture 的 TypeScript/Java Conformance 和独立 QA
无 P0/P1 后由用户明确接受。CGF-1.1 已解除门槛。

## 5. Credential 与 Secret Store 边界

客户端企业身份凭证使用 ADR-014 的 `EnterpriseCredentialStore`，个人 Model
凭证继续使用 ADR-013 的 `PersonalCredentialStore`。Central Service 自身的
签名 Key 与企业 Provider Secret 使用另一条服务端 Port：

```text
EnterpriseSecretStore
├── resolveSigningKeyRef
├── resolveCredentialRef
└── health
```

但本批只允许：

- 单元/Conformance 使用 Fake；
- 本地开发使用明确 test profile；
- 数据库只保存 opaque secret reference；
- 企业 credentialRef 只存在于 Central 内部绑定，不进入 Configuration Snapshot
  或下发给 Local Core 的 Model/Tool Descriptor；
- Java DTO、日志、错误、Fixture、Audit 不出现真实 Secret。

真实 Vault/KMS/公司 Secret 平台 Adapter 必须在企业试点或 CGF-2 真实 Model
Gateway 前确认。不得用环境变量 Adapter 冒充生产 Secret Store。

因此 CGF-1 可以用 Fake 完成 Contract、身份状态机和物化链的工程验收，但没有
生产 Secret Store Adapter 时不得标记为“可用于企业生产部署”。

PostgreSQL datasource Credential 属于部署基础设施 Secret，不进入
Enterprise Gateway Contract。生产部署必须通过公司受控 Secret 注入机制提供；
本地 Testcontainers 使用隔离测试凭证。

## 6. 跨语言 Contract 事实源

正式采用仓库根级语言中立目录：

```text
contracts/enterprise-gateway/v1alpha1/
├── openapi.yaml
├── schemas/
│   ├── access-token-claims.schema.json
│   ├── compatibility.schema.json
│   ├── device-challenge.schema.json
│   ├── enrollment.schema.json
│   ├── token.schema.json
│   ├── configuration-snapshot.schema.json
│   ├── package-document.schema.json
│   ├── descriptor.schema.json
│   └── error.schema.json
└── fixtures/
    ├── valid/
    └── invalid/
```

规则：

- 该目录中的 OpenAPI/JSON Schema/Fixture/canonical digest 规则是唯一跨语言
  canonical source；
- Java DTO 和 TypeScript 类型各自实现；
- 不共享 Java/TS 源码 DTO；
- `packages/contracts` 中的 TypeScript 类型只是实现/消费层，必须通过根级
  Schema/Fixture Conformance，不得独立演进；
- 若其他位置存在正式 Schema，开始 CGF-1.0 时必须迁移或明确唯一 canonical
  路径，不得保留两套可编辑事实源；
- 本批不强制代码生成，避免 Generator 成为第二事实源；
- Java/TS 必须对相同 valid/invalid Fixture 给出相同结果；
- Schema 文件本身纳入 canonical digest；
- unknown version/enum/extra field 在 Alpha 失败关闭。

## 7. 正式 Contract 领域

### 7.1 Compatibility

最低语义：

```text
centralVersion
supportedContractRange
minimumDesktopVersion
minimumCoreVersion
features[]
maintenanceStatus
configurationSchemaRange
```

Local Core 必须在获取配置前完成兼容性选择。未知破坏性版本不下载、不激活。

### 7.2 Identity、Device Challenge/Proof、可选 Enrollment 与 Token

最低语义：

```text
verifiedIdentityId              # OA Adapter 验证后产生的短期 opaque context
IssueDeviceChallengeRequest
DeviceChallenge
DeviceProof
EnrollDeviceRequest             # 仅 Manual Enrollment
EnrollDeviceResult
IssueAccessTokenRequest
TokenResult
AccessTokenClaims
```

OA 用户名密码、Ticket、SDK/Token Exchange 字段不进入 canonical Contract。
`DeviceProof` 不包含私钥、Keychain Handle 或 Provider 对象。Token Request
只携带 verified identity handle、`clientInstanceId` 和 Device Proof，不允许
客户端正文自报企业、用户或设备身份。Enrollment Code 只授权设备注册。

### 7.3 Configuration Snapshot

最低语义：

```text
snapshotId
revision
schemaVersion
digest
minimumCompatibleVersions
models[]
tools[]
agents[]
skills[]
knowledge[]
fixedPermissions[]
gatewayEndpoints
generatedAt
```

每个引用必须包含 exact revision 与 digest。Snapshot：

- 不可变；
- 完整，不做增量 patch；
- 使用 canonical JSON + SHA-256；
- 支持 ETag/If-None-Match；
- 不包含 Credential 明文或企业 credentialRef、health、Session/Task/Prompt 或
  本地路径。

### 7.4 Agent/Skill Package

CGF-1 推荐**不使用 ZIP/TAR**，避免第一版引入压缩炸弹、路径穿越和 symlink。

使用 strict `PackageDocument`：

```text
packageId
kind                 # agent | skill
revision
manifest
files[]
  relativePath
  mediaType
  utf8Content
  contentDigest
packageDigest
createdAt
```

规则：

- relativePath 必须规范化，禁止绝对路径、`..`、空段和符号链接；
- Agent/Skill 都是文本/JSON/Markdown 小包；
- Package 不包含可执行二进制；
- Skill 中声明的执行动作仍必须通过 Tool；
- Package immutable，revision/digest 冲突失败关闭；
- 每个 `utf8Content` 的 Alpha 默认上限为 512 KiB，并同时受不可绕过的绝对
  安全上限约束。

### 7.5 Descriptor

下发 Local Core 的 Model/Tool/Knowledge Descriptor 只保存：

- ID/revision/digest；
- 类型化能力元数据；
- Gateway/Adapter 静态引用；
- `credentialAvailable` 与可选的 `unavailableReason`；
- 启用与固定权限元数据。

不保存 Runtime Handle、PID、连接实例、Secret、企业 credentialRef 或瞬时
health。企业 Credential Binding 由 Central Service 根据 `enterpriseId`、
`userId`、`clientInstanceId`、resolved model/tool ID 和 configuration revision
在服务端解析，属于 Central 内部实现。

## 8. 推荐数据模型

PostgreSQL 采用关系元数据 + immutable JSONB 文档，不建设 EAV。

建议表：

```text
enterprise_identity
enterprise_user
client_instance
verified_identity_context
enterprise_device
device_public_key
device_challenge
device_enrollment_code_hash
configuration_snapshot
package_document
model_descriptor
tool_descriptor
knowledge_descriptor
user_permission
flyway_schema_history   # Flyway owns migration truth
```

原则：

- Device Enrollment Code 只保存强哈希，不保存明文；
- Device Challenge 短期、单次、上下文绑定，并在成功验证时原子消费；
- Central 只保存设备公钥/Key ID，不接触设备私钥或 Keychain Handle；
- Access Token 签名 key 只在 Secret Store；
- Snapshot/Package 发布后不可 UPDATE，只能新 revision；
- revision + digest 唯一；
- published Snapshot 只能引用已存在且 digest 匹配的 Package/Descriptor；
- 删除使用禁用/保留策略，不破坏已下发 revision 的可验证性；
- CGF-1 不存 Session、Task、Prompt、本地文件或完整模型输出。

### 8.1 Package 存储建议

首期 Package 作为有界 JSONB 文档保存在 PostgreSQL，原因：

- Agent/Skill 包是小型文本集合；
- 避免提前引入对象存储；
- 可以和引用完整性、revision/digest 一起事务发布；
- 企业试点部署简单。

当单包或总规模超过限制时，再引入 `PackageStore`/对象存储，不静默改变现有
Package digest 语义。

## 9. 推荐限额

```text
Configuration Snapshot：最大 2 MiB
单个 PackageDocument：最大 4 MiB
单个 Package file utf8Content：最大 512 KiB
单 Snapshot 引用 Package：最大 128 个
单次完整物化总量：最大 64 MiB
Package files：最大 256 个
relativePath：最大 512 UTF-8 bytes
普通 JSON 请求：最大 1 MiB
错误安全详情：最大 16 KiB
```

所有限制均是可观测、可配置的 Alpha 默认值和安全保护上限，不是 SLA 或永久
产品承诺；必须同时具有不可绕过的绝对上限。配置调整不得破坏 Schema、digest、
内存有界、路径安全或 Secret 禁入规则。

## 10. Local Core 物化与两层激活

### 10.1 Core 组件

```text
EnterpriseConfigurationClient
CandidateConfigurationStore
PackageMaterializer
ConfigurationValidator
ConfigurationActivationCoordinator
```

它们位于 Local Core Application/Adapter，不进入 Kernel reducer。

### 10.2 固定流程

```text
authenticate
→ compatibility
→ GET latest snapshot with ETag
→ validate schema + snapshot digest
→ download exact packages
→ validate package schema/path/digest
→ validate all references
→ stage complete candidate
→ atomic Configuration Storage Activation
→ preserve previous active configuration
→ derive activationState=pending_restart
→ next normal Core start by default
→ build/finalize RegistrySnapshot
→ Runtime Registry Activation
```

Storage Activation 不能修改当前 RegistrySnapshot。Runtime Activation 默认在
下一次正常启动时发生。仅当 Core 空闲且没有非终态 Task 时，用户才可以明确选择
“立即重启并应用”；存在 running、waiting input 或 waiting confirmation 等非终态
Task 时不得自动强制重启，`activationState=pending_restart`，当前 Task 继续使用旧
`TaskCapabilityLock`。`pending_runtime_activation` 仅作为兼容 Projection。

受控重启失败时：

- 保留新的最近成功配置；
- 旧进程/旧 Task 继续使用旧 Lock；
- 新 Runtime 未 ready 时不得宣称激活成功；
- 可以回退启动上一有效配置，但必须产生明确诊断，不静默混合两版内容。

禁止在配置同步后直接杀死 Core、中断活动或等待确认的 Task、热替换当前
RegistrySnapshot，或静默改变已启动 Task 的 Model/Tool。

### 10.3 崩溃矩阵

必须覆盖：

- Snapshot 下载一半；
- Snapshot 已下载、Package 未完整；
- 全部物化、激活事务前；
- active pointer 更新后、响应前；
- pending runtime activation 后 Core 崩溃；
- 有非终态 Task 时保持 pending 且不重启；
- Core 空闲时用户明确选择立即应用；
- 新 Registry 构建失败；
- ETag 304；
- Central 离线；
- 新 Snapshot 非法但上一配置有效；
- revision 相同但 digest 冲突。

任何场景都只能得到“旧配置完整有效”或“新配置完整有效”，不能半激活。

## 11. Conformance 套件

### 11.1 Schema

- Java/TS valid Fixture；
- Java/TS invalid Fixture；
- extra field/unknown enum/version；
- canonical digest；
- Package relativePath；
- 单文件 512 KiB、PackageDocument 4 MiB、完整物化 64 MiB 边界；
- Snapshot/Descriptor 企业 credentialRef 禁入；
- Secret/Runtime Handle 禁入；
- OpenAPI response 与 JSON Schema 一致。

### 11.2 Authentication

- Fake OA Adapter 形成 verified identity context，客户端不能伪造 claims；
- Device Enrollment Code 仅在 Manual Adapter 中单次使用；
- Challenge 过期、重复、错误 purpose/audience/context；
- Device Proof 签名非法、算法不允许、公钥不匹配；
- 设备 not managed/not compliant/access denied/revoked；
- token 过期、claims/device/client mismatch；
- 请求正文伪造 enterpriseId/userId/deviceId；
- clientInstanceId mismatch；
- Device Private Key/Keychain Handle/Provider Reference 不进入 Contract；
- `EnterpriseCredentialStore` 与 `PersonalCredentialStore` namespace/ref/lifecycle
  不混用；
- 用户或设备 disabled 时不得签发新 Token；
- Clock 注入和边界时刻。

### 11.3 PostgreSQL

- Testcontainers 真 PostgreSQL；
- Flyway fresh migration；
- close/reopen；
- immutable revision；
- digest conflict；
- 引用完整性；
- 较新未知 schema fail closed；
- migration 不重复。

### 11.4 Materialization/Activation

- Memory/SQLite Core Adapter 相同 Conformance；
- 上一有效配置；
- ETag；
- 十个命名故障点；
- Storage/Runtime Activation 分离；
- non-terminal Task 存在时不得自动重启或中断；
- 当前 Task Lock 不变；
- 新 Task 使用新 registryRevision；
- Central 离线不切换企业 Model/Tool。

## 12. 建议开发批次

### CGF-1.0：ADR 与跨语言 Contract Pack

- ADR-014 Enterprise OA Identity、Managed Device Trust 与 Client Credential；
- 唯一 canonical root 的 OpenAPI/JSON Schema；
- valid/invalid Fixture；
- Java/TS Conformance；
- PostgreSQL/Secret Store 基线确认。

退出门槛：ADR-014 `ACCEPTED`，Schema/Conformance 评审无 P0/P1，
PostgreSQL/Secret Store 基线确认，canonical Contract source 唯一确定；本批
不实现业务 Route。

#### 实现检查点：0.0.0-cgf.1.0

初始检查点已通过独立 QA：

- ADR-014 `PROPOSED`；
- 唯一根级 `contracts/enterprise-gateway/v1alpha1/`；
- OpenAPI 3.1、七份 JSON Schema 2020-12、canonical digest 规则；
- 14 个共享 valid/invalid Fixture；
- TypeScript canonical Schema/Fixture Conformance；
- Java 独立 Schema subset consumer 与同 corpus Conformance 测试；
- 企业 credentialRef 禁入与 Package UTF-8/文档/物化限额门禁。

用户已接受 DCF-1.0/CGF-1.0 独立 QA：两者均 `PASS`、P0/P1/P2/P3 为 0。
随后用户替换企业身份子链，因此另建
`0.0.0-cgf.1.0-repair.1`，只修订 ADR-014、Device Challenge/Proof、可选
Enrollment、Token Claims 和 Fixture，不修改配置主体。该 repair 完成
TypeScript/Java Conformance 和独立 QA 前，CGF-1.1 继续 `GATED`。

#### 身份 repair 开发者自测：0.0.0-cgf.1.0-repair.1

- canonical Schema 从七份扩展为九份，新增 Device Challenge/Proof 与
  Access Token Claims；
- Fixture corpus 从 14 个扩展为 34 个（20 valid / 14 invalid）；
- OpenAPI request/response 精确引用对应 `$defs` 分支，避免一个联合根 Schema
  同时接受请求和响应；
- TypeScript 专项 10 tests、Node/Desktop 全量 56 files / 417 tests `PASS`；
- OpenJDK 21.0.12、Java/Javac 工具链检查 `PASS`；
- Maven 在线与离线双门禁均 `BUILD SUCCESS`，每轮 12 tests，其中 Enterprise
  Contract Conformance 7 tests；
- ADR-014 已为 `ACCEPTED`；repair 独立 QA `PASS`，P0/P1/P2/P3 均为 0；
  CGF-1.1 已解锁。

### CGF-1.1：Java Identity 与配置读服务

详细分批、事务和验收矩阵见
[CGF-1.1 开发计划](./CGF-1.1-DEVELOPMENT-PLAN.md)。1.1A～1.1D 均已完成
独立 QA 并正式 `PASS/CLOSED`，CGF-1.1 已关闭。

- PostgreSQL/Flyway/Testcontainers；
- Fake OA Adapter 与 verified identity context；
- Device Challenge/Proof、Central Proof Verifier 与防重放状态；
- EnterpriseDeviceTrustProvider、RoboThreeAccessTokenIssuer；
- Fake/Test EnterpriseDeviceSigner；
- 可选 Manual Device Enrollment；
- Compatibility；
- Snapshot/Package/Descriptor Repository；
- ETag；
- trusted seed 工具；
- EnterpriseCredentialStore/EnterpriseSecretStore Port 与 Fake。

退出门槛：Java integration、身份和不可变配置全部通过。

### CGF-1.2：Local Core 配置物化

详细提案见
[CGF-1.2 开发计划](./CGF-1.2-DEVELOPMENT-PLAN.md)。该文件当前为
`CONFIRMED_WITH_SPECIFIED_REVISIONS`，用户已授权进入 1.2A；1.2B/1.2C
继续受前一批独立 QA `PASS` 门槛约束。

- EnterpriseConfigurationClient；
- Schema/digest/reference 校验；
- Package materialization；
- local candidate persistence；
- Storage Activation；
- previous active + offline。

退出门槛：跨语言 E2E 和崩溃矩阵通过。

### CGF-1.3：Runtime Activation 与阶段验收

- pending runtime activation；
- 受控 Core restart；
- 新 RegistrySnapshot；
- 当前 Task Lock 不变；
- 完整在线/离线/恢复 Harness；
- 独立 QA。

## 13. 预计工程量

单一主开发流建议按 **19～28 个集中工程工作日**规划：

```text
CGF-1.0 + identity repair：已实施并通过独立 QA
CGF-1.1：11～16 天
CGF-1.2：4～5 天
CGF-1.3：2～4 天
```

上述数字是单一主开发流的工程工作量估算，不包含独立 QA、架构复审、环境或公司
基础设施审批等待，也不等同于日历交付承诺。PM 日历计划应预留约 **1.5～2 倍**
窗口，用于 QA、返工、评审和环境风险。该项记为 `P2 — SCHEDULE RISK`，不阻塞
CGF-1.0，也不修改技术验收门槛。

估算不包含真实 OA、真实 MDM/设备证书、生产 OS Device Signer、真实企业
Model、真实 MCP、正式 Admin、生产 Vault/KMS 接入或企业基础设施审批等待。

## 14. 已确认决策与进入门槛

用户已确认：

1. PostgreSQL 16 + Flyway + Testcontainers 作为默认数据库基线；
2. OA Identity ∩ Managed Device Trust ∩ Permission ∩ Compatibility 后才签发
   短期 RoboThree Access Token；
3. Local 使用 EnterpriseUserIdentityClient、EnterpriseCredentialStore、
   EnterpriseDeviceSigner；Central 使用 EnterpriseUserIdentityVerifier、
   EnterpriseDeviceTrustProvider、RoboThreeAccessTokenIssuer；
4. Device Private Key 不可导出；跨服务只表达 challenge/proof；
5. Manual Enrollment 只作为可选设备授权 Adapter，不承担用户认证；
6. `EnterpriseCredentialStore` 与 `PersonalCredentialStore` 分离，本阶段只做
   Secret/Credential Port 与 Fake/Test Adapter；
7. Agent/Skill 使用有界 strict JSON `PackageDocument`，小包存 immutable JSONB；
8. `contracts/enterprise-gateway/v1alpha1/` 是唯一跨语言 canonical source；
9. 企业 credentialRef 不下发 Local Core；
10. 无有效企业会话时配置缓存保留但不激活、不进入 Runtime/Prompt；
11. Runtime Activation 不得中断非终态 Task；
12. CGF-1.1 工程工作量调整为 11～16 天。

DCF-1.1 已解锁。CGF-1.1 的 identity repair、ADR-014 `ACCEPTED`、Java/TS
Schema Conformance、独立 QA 无 P0/P1、PostgreSQL/Secret Store 基线和唯一
canonical source 门槛均已满足，现已解锁。CGF-1.0 不等待 DCF-1.1。
