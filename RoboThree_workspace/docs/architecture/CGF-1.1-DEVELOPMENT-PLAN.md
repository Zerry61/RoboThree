# RoboThree CGF-1.1 开发计划

> 状态：**CLOSED — CGF-1.1；CGF-1.2 CONFIRMED_WITH_SPECIFIED_REVISIONS；CGF-1.2A AUTHORIZED**  
> 日期：2026-07-25  
> 阶段：Central Java Identity 与 Configuration Read Service  
> 前置门槛：`0.0.0-cgf.1.0-repair.1` 独立 QA `PASS`；ADR-014 `ACCEPTED`；KN-030 `CONFIRMED`  
> 预计工程量：**11～16 个集中工程工作日**，不含独立 QA、返工、真实 OA/MDM 和公司 IT 等待  
> 用户确认：2026-07-25 接受 §14 五项冻结建议；CGF-1.1C 独立 QA `PASS` 后明确解锁 CGF-1.1D  

## 1. 阶段目标

CGF-1.1 只建立第一条可测试、可恢复、可替换的 Central 企业身份与配置读取链：

```text
Fake OA verified identity
→ issue Device Challenge
→ verify Device Proof
→ evaluate Managed Device Trust
→ check fixed RoboThree Permission
→ check Compatibility
→ issue short-lived RoboThree Access Token
→ read immutable Configuration Snapshot
```

本阶段必须证明：

1. 用户身份只来自受信 `OAIdentityAdapter` 结果；
2. 设备身份来自登记公钥、Challenge 签名、未撤销记录和当前合规结果；
3. Challenge 只能成功消费一次；
4. 用户/设备/权限/Compatibility 任一失败时不签发 Token；
5. Access Token 只允许访问其 claims 和固定权限覆盖的企业资源；
6. Configuration Snapshot 是不可变、带 revision/digest/ETag 的读模型；
7. 数据库迁移、事务失败、进程重启和重复请求不会放宽安全边界。

## 2. 本阶段交付与非目标

### 2.1 交付

- PostgreSQL 16；
- Flyway migration；
- Testcontainers 集成测试；
- Fake `OAIdentityAdapter`；
- `EnterpriseUserIdentityVerifier`；
- 短期 verified identity context；
- Device Challenge 生成、持久化和单次消费；
- `DeviceProofVerifier`；
- `EnterpriseDeviceTrustProvider`；
- Fake/Test Device Signer，仅用于测试；
- 可选 Manual Device Enrollment；
- 固定 Permission Repository；
- `RoboThreeAccessTokenIssuer`；
- Central `EnterpriseSecretStore` Port 与 Fake；
- Compatibility 读服务；
- Configuration Snapshot/Package Repository；
- 受 Access Token 保护的 Configuration Snapshot 读服务；
- ETag / `If-None-Match`；
- trusted seed 工具；
- Java integration、重启、并发和安全测试。

### 2.2 非目标

- 真实 OA SDK、Ticket、Token Exchange 或账号密码 API；
- OA 登录 HTTP canonical Contract；
- 真实 MDM、Conditional Access 或公司终端系统；
- 真实企业证书信任链；
- Windows CNG/TPM、macOS Secure Enclave、PKCS#11 生产 Signer；
- 正式 Vault/KMS/HSM；
- Admin Console 或通用配置写 API；
- 运行时企业审批、复杂 RBAC 或 Policy Engine；
- 实时 push revoke；
- Model Gateway、Central Tool Gateway 或 MCP；
- Local Core 配置物化和 Runtime Activation；
- 纯本地个人模式；
- 离线企业 Agent/Skill 执行。

## 3. 上游借鉴与自主边界

| 来源 | 本阶段借鉴 | 采用方式 | 不照搬 |
| --- | --- | --- | --- |
| OpenClaw | Gateway 与 Runtime 分离、compatibility fail-closed、Credential 不下发客户端 | `DESIGN_ONLY` | 不采用 Pairing/Channel 身份作为企业用户或设备事实 |
| Open WebUI | Provider Gateway 与 UI/Local Runtime 责任分离 | `DESIGN_ONLY` | 不采用其用户、Provider Secret 或配置表结构 |
| RoboThree KAF-2 | Migration preflight、显式事务、幂等、失败关闭、双 Adapter Conformance | 内部复用既有工程原则 | 不把 Node/SQLite 实现复制进 Java/PostgreSQL |
| ADR-014 / AR-024 | OA Identity、Device Trust、Signer、Challenge/Proof 与离线边界 | `OWN` | 不从通用开源 Agent 复制企业身份或密码学实现 |

身份、设备信任、签名和 Token 安全不能以开源 Agent 的登录/Pairing 代码作为可信
事实来源。Agent 项目只提供 Gateway 分层参考；安全语义以 ADR-014、标准密码学
格式和公司正式 OA/设备系统为准。

## 4. 模块与依赖方向

Central Service 保持模块化 Java 单体，不拆微服务。

```text
authentication
├── domain
│   ├── VerifiedEnterpriseIdentity
│   ├── DeviceChallenge
│   ├── DeviceRegistration
│   ├── DeviceTrustDecision
│   └── AccessTokenClaims
├── application
│   ├── VerifyEnterpriseIdentityService
│   ├── IssueDeviceChallengeService
│   ├── EnrollDeviceService
│   ├── IssueAccessTokenService
│   └── ValidateAccessTokenService
├── port
│   ├── OAIdentityAdapter
│   ├── EnterpriseDeviceTrustProvider
│   ├── DeviceProofVerifier
│   ├── RoboThreeAccessTokenCodec
│   ├── EnterpriseSecretStore
│   └── typed repositories
└── adapter
    ├── fake
    ├── jdbc
    ├── crypto
    └── http

configuration
├── domain
│   ├── ImmutableConfigurationSnapshot
│   └── ImmutablePackageDocument
├── application
│   └── ReadEnterpriseConfigurationService
├── port
│   ├── ConfigurationSnapshotRepository
│   └── PackageDocumentRepository
└── adapter
    ├── jdbc
    ├── seed
    └── http

persistence
├── Flyway
├── transaction support
└── schema preflight
```

依赖规则：

```text
HTTP / JDBC / Fake / Crypto Adapter
              ↓
Application Service
              ↓
Domain + typed Port
```

禁止：

- Domain/Application 依赖 Spring MVC、JDBC、Flyway、Testcontainers；
- `authentication` 读取本地 Workspace、Task、Prompt 或 Personal Credential；
- `configuration` 绕过 Access Token 验证；
- 建立万能 `Repository<T>`、万能 `IdentityProvider` 或万能 `execute`；
- 将 OA Adapter DTO 提升为 canonical Enterprise Gateway DTO。

## 5. 数据模型与 Flyway 边界

CGF-1.1 使用显式 SQL 和 Spring JDBC，不采用 JPA/Hibernate。原因是身份和
Challenge 事务需要可见的条件更新、行锁、唯一约束和受影响行数，不能依赖隐藏的
ORM flush、lazy load 或 entity lifecycle。

计划 migration：

### V1 — Verified Identity 与固定权限

```text
enterprise_verified_identity
├── verified_identity_id
├── enterprise_id
├── user_id
├── provider
├── provider_subject_digest
├── identity_digest
├── issued_at
├── expires_at
└── disabled_at

enterprise_user_permission
├── enterprise_id
├── user_id
├── permission
├── enabled
├── revision
└── updated_at
```

禁止保存 OA 用户名密码、Ticket、Refresh Credential 或 OA 原始响应。

### V2 — Device Registration、Enrollment 与 Challenge

```text
enterprise_device
├── device_id
├── enterprise_id
├── device_key_id
├── public_key_format
├── public_key_encoded
├── public_key_digest
├── algorithm
├── trust_source
├── managed_status
├── compliance_status
├── revision
├── registered_at
├── revoked_at
└── disabled_at

device_enrollment_grant
├── enrollment_grant_id
├── code_digest
├── enterprise_id
├── authorized_user_id
├── issued_at
├── expires_at
├── consumed_at
└── disabled_at

device_challenge
├── challenge_id
├── purpose
├── verified_identity_id
├── client_instance_id
├── expected_device_key_id
├── expected_public_key_digest
├── nonce
├── audience
├── allowed_algorithms
├── challenge_digest
├── issued_at
├── expires_at
├── consumed_at
└── consumed_by
```

设备私钥、Keychain Handle 和本地 Provider Reference 禁止进入数据库。

### V3 — Token Issuance

```text
access_token_issuance
├── token_id
├── token_digest
├── enterprise_id
├── user_id
├── device_id
├── client_instance_id
├── permissions
├── identity_digest
├── device_revision
├── permission_revision
├── issued_at
├── expires_at
└── challenge_id
```

数据库只保存 Token digest、claims 和审计所需元数据，不保存可直接使用的
Bearer Token 明文。

### V4 — Immutable Configuration

```text
enterprise_configuration_snapshot
├── snapshot_id
├── revision
├── digest
├── schema_version
├── document_json
├── etag
├── active
├── generated_at
└── inserted_at

enterprise_package_document
├── package_id
├── kind
├── revision
├── digest
├── document_json
└── inserted_at
```

Snapshot/Package 以 `(id, revision, digest)` 唯一，不允许就地更新内容。同一
revision 不同 digest 必须 conflict。CGF-1.1 不提供通用写 API，只允许测试
Fixture 和 trusted seed 工具写入。

## 6. 时间与安全默认值

建议 Alpha 默认值：

| 对象 | 默认值 | 不可超过 |
| --- | --- | --- |
| Verified Identity Context | 5 分钟 | 10 分钟 |
| Device Challenge | 60 秒 | 120 秒 |
| Manual Enrollment Grant | 10 分钟 | 30 分钟 |
| RoboThree Access Token | 15 分钟 | 30 分钟 |
| 允许时钟偏差 | 30 秒 | 60 秒 |

所有安全时间使用服务端 `Clock`。测试必须使用 Fake Clock，不使用真实 sleep。
配置若超过绝对上限，服务启动失败关闭。

## 7. Device Challenge 签名字节

CGF-1.1 编码前必须冻结跨语言签名字节，否则不同平台 Signer 会产生不可互验的
签名。

建议规范：

```text
UTF-8(
  "ROBOTHREE_DEVICE_PROOF_V1\n"
  + canonicalJson(DeviceChallenge)
)
```

其中：

- `canonicalJson` 复用 Enterprise Gateway `CANONICAL-DIGEST.md` 的逐键排序规则；
- 只签完整 `DeviceChallenge`，不签调用方重新拼接的部分字段；
- 服务端根据持久 Challenge 重建签名字节，不信任客户端回传 Challenge；
- `challengeId`、nonce、audience、clientInstanceId、issuedAt、expiresAt 和
  allowedAlgorithms 全部进入签名；
- `purpose` 和 verified identity 绑定保存在服务端 Challenge 行和 digest 中；
- Alpha 执行算法只开放 `ES256`；
- Alpha Manual Enrollment 只执行 `spki_der_base64`；
- `x509_certificate_pem` 保留为 Contract 可表达格式，但在真实证书 Trust Adapter
  完成前运行时失败关闭；
- `signedAt` 只作校验辅助，Challenge 是否有效始终以服务端时间和状态为准。

不自行设计椭圆曲线、哈希或签名算法。生产实现使用标准 JCA/经过依赖审查的
JOSE 库及平台 Signer。

## 8. 四条事务链

### 8.1 创建 Challenge

```text
validate verified identity
→ validate purpose/clientInstance/device binding
→ generate cryptographic nonce
→ build canonical challenge
→ insert issued challenge
→ commit
→ return challenge
```

只有 commit 成功后才返回 Challenge。

### 8.2 Manual Device Enrollment

```text
load challenge + identity + enrollment grant
→ verify proof outside transaction
→ begin transaction
→ lock challenge and grant
→ recheck identity current/not-disabled
→ recheck grant active/unexpired/unconsumed
→ recheck challenge expiry/context/digest/algorithm/public-key binding
→ reject revoked/disabled existing device or key registration
→ atomically consume challenge and grant
→ insert immutable device public-key registration
→ commit
→ return device enrollment result
```

同一 `challengeId + requestDigest` 重复提交返回同一 enrollment result；同一
challengeId 不同 digest 返回 conflict。并发只有一个写入者成功。

Manual Enrollment 正在建立新设备的 trust，因此不能假装存在一个可重检的
“当前新设备 trust decision”。事务内必须重检的是 verified identity、
Enrollment Grant、Challenge 和现有设备/Key 冲突状态。如果同一
`deviceKeyId/publicKeyDigest` 已对应 revoked 或 disabled 设备，不得通过
Enrollment 静默复活；必须走未来独立的管理员重新授权流程。

### 8.3 Token Issuance

```text
load challenge + identity + device + permission snapshot
→ verify proof and build candidate claims/token outside transaction
→ begin transaction
→ lock challenge
→ recheck challenge/identity/device/permission/compatibility revisions
→ atomically consume challenge + insert token issuance digest/claims
→ commit
→ return Bearer Token
```

Token 候选在 commit 前不得返回。事务失败时丢弃候选 Token。

如果 commit 成功但 HTTP 响应丢失，客户端不得重发相同 Device Proof 并盲目期待
新 Token；应重新获取 Challenge 并发起新的 Token 流。旧 Token 最多自然存活
15 分钟，但客户端没有获得其明文。本阶段不新增 Token issuance status API，
也不保存可重放的 Token 明文。

### 8.4 Configuration Read

```text
validate token signature / issuer / audience / expiry
→ require configuration.read
→ resolve active immutable snapshot
→ verify stored revision/digest/etag invariant
→ If-None-Match match: 304
→ otherwise return exact canonical snapshot + ETag
```

MVP 不做实时撤销。已签发 Token 在有效期内自然过期；禁用用户或设备只阻止新
Token。Configuration Read 不重新实现第二套 Device Trust 决策。

## 9. Token 与 Secret 边界

建立：

```text
RoboThreeAccessTokenCodec
├── encode(AccessTokenClaims, SigningKeyHandle)
└── decodeAndVerify(token, VerificationKeyHandle)

EnterpriseSecretStore
├── resolveTokenSigningKeyHandle
└── resolveTokenVerificationKeyHandle
```

CGF-1.1 使用 Fake/Test Secret Store 和测试专用密钥。Token 使用标准 compact
JWS 表达，但具体 JOSE Library 版本在实现时经过许可证和依赖审查后冻结，不把
Library DTO 暴露到 Domain、HTTP Contract 或数据库。

禁止：

- 自行设计 Token 加密或签名算法；
- 把签名密钥写入 `application.yaml`、Fixture、Git、日志或数据库；
- 保存 Bearer Token 明文；
- 把 Central `EnterpriseSecretStore` 与 Local
  `EnterpriseCredentialStore` 合并；
- 把 Token 放入 URL、query string 或错误详情。

## 10. HTTP 范围

CGF-1.1 只实现已经存在的 canonical HTTP 语义：

```text
GET  /v1alpha1/compatibility
POST /v1alpha1/device-challenges
POST /v1alpha1/device-enrollment   # manual_device_enrollment enabled 时
POST /v1alpha1/token
GET  /v1alpha1/configuration      # Bearer Token
```

规则：

- 建立启动时冻结的 `EnterpriseFeatureSet`，它只来自 Central 受信配置和已注册
  Adapter，不接受客户端请求正文声明，也不支持运行时管理热切换；
- 只有 Manual Device Enrollment Adapter 已注册且受信配置启用时，
  Compatibility 才发布 `manual_device_enrollment`；
- 当 `manual_device_enrollment` 未启用时，enrollment 请求返回 typed
  feature-unavailable 错误，不消费 Code/Challenge，也不创建任何设备记录；
- `managed_device_trust` 表示企业会话需要受管设备信任，不等于 Manual
  Enrollment 已启用；
- OA Fake Adapter 只通过 Application Harness 测试，不新增 OA Login HTTP
  canonical route；
- `/foundation/*` 继续明确标记 `fixtureOnly`，不得与正式 `/v1alpha1/*`
  Projection 共用类型；
- 正式响应不得带 `X-RoboThree-Fixture: true`；
- 所有 request/response 通过 canonical Schema 验证；
- 未知字段、enum、Contract version 和 content type 失败关闭；
- 错误使用统一 Enterprise Error Envelope；
- OA 登录材料、Token、Proof signature 不进入访问日志；
- 本阶段不增加 Package Download HTTP Route；Package Repository 只为
  Configuration 引用完整性和后续 CGF-1.2 做准备。

## 11. 开发批次

### CGF-1.1A — PostgreSQL/Flyway 与 typed Port

建议版本：`0.0.0-cgf.1.1a`  
工程量：3～4 天

交付：

- PostgreSQL、Flyway、Spring JDBC、Testcontainers 依赖；
- V1～V4 migration；
- migration preflight；
- 显式 transaction boundary；
- typed Repository Port 和 JDBC Adapter；
- Fake Clock、Fake OA、Fake Secret Store、Fake Device Signer；
- Repository InMemory/Test Fake 与 PostgreSQL Conformance；
- trusted seed 最小入口；
- 禁止 JPA/Hibernate、Secret/Token 明文和第二套 canonical DTO 的架构门禁。

退出门槛：

- 空库 migrate、已有库 reopen、重复 migrate 均通过；
- 较新 schema、缺表、缺索引和损坏 migration 失败关闭；
- Repository Fake/PostgreSQL 同一 Conformance；
- 同 revision 不同 digest conflict；
- Testcontainers 每测试隔离，无共享脏数据库；
- 独立 QA 无 P0/P1 后进入 1.1B。

A 批历史检查点处置（KN-034；历史门槛见 KN-032/KN-033）：

```text
CGF-1.1A：PASS
P3-CGF-DOCKER-001：CLOSED
CGF-1.1B：READY_FOR_INDEPENDENT_QA
CGF-1.1C：GATED
```

独立 QA 已通过完整 Node/Desktop、Java online/offline、InMemory Conformance 和
PostgreSQL 16 Embedded 真实数据库路径。用户决定保留的 Docker 门槛已于
2026-07-25 补齐：在线/离线两轮均为 22 tests / 0 failures / 0 skipped，
`PostgreSqlCentralPersistenceIntegrationTest` 通过真实
`postgres:16-alpine` 执行。用户随后明确解锁 1.1B；1.1B 已完成开发者自测，
须经独立 QA 无 P0/P1 且用户接受后才可进入 1.1C。

### CGF-1.1B — Identity、Challenge、Proof 与 Device Trust

建议版本：`0.0.0-cgf.1.1b`  
工程量：4～5 天

交付：

- Fake OA → verified identity context；
- Issue Device Challenge；
- ES256 DeviceProofVerifier；
- Device Trust Provider；
- Manual Enrollment Adapter；
- Challenge/Enrollment 并发事务；
- 七个 device/challenge typed error；
- 正式 challenge/enrollment HTTP route；
- 重启、过期、重放、撤销、签名非法和上下文漂移测试。

退出门槛：

- OA 原始材料持久化扫描为 0；
- Challenge 100 并发消费只有一个成功；
- enrollment 同 digest 幂等，不同 digest conflict；
- deviceKeyId 不能替代签名验证；
- revoked/not-managed/not-compliant 全部失败关闭；
- close/reopen 后未消费 Challenge 仍可验证，已消费 Challenge 不能复活；
- 独立 QA 无 P0/P1 后进入 1.1C。

B 批历史检查点：

```text
CGF-1.1B：PASS / CLOSED
CGF-1.1C：AUTHORIZED
CGF-1.1D：GATED
```

开发者自测已完成：Node/Desktop 56 files / 404 tests；Central online/offline
各 34 tests / 0 failures / 0 errors / 0 skipped；Testcontainers
`postgres:16-alpine` 与 PostgreSQL 16 Embedded 均实际执行。此结论不替代
Claude Code 独立 QA，也不自动解锁 1.1C。

### CGF-1.1C — Token Issuer、Permission 与 Configuration Read

建议版本：`0.0.0-cgf.1.1c`  
工程量：3～4 天

交付：

- 固定 Permission Repository；
- Compatibility evaluator；
- JWS Token Codec Port 与 Fake/Test Secret Store Adapter；
- Token Issuer；
- Token validation；
- Configuration Snapshot Repository；
- ETag / `If-None-Match`；
- protected configuration HTTP route；
- trusted seed 的 Snapshot/Package 引用完整性校验。

退出门槛：

- identity/device/permission/compatibility 四项交集缺一不可；
- Token claims 精确绑定 enterprise/user/device/client/token；
- Token 明文不入库、不入日志；
- 过期、错误 issuer/audience/signature、缺 permission 全部拒绝；
- configuration ETag 稳定，304 不返回正文；
- Snapshot digest/reference 不一致失败关闭；
- 无有效 Token 不下发 Snapshot；
- 独立 QA 无 P0/P1 后进入 1.1D。

当前检查点：

```text
CGF-1.1C：PASS / CLOSED
CGF-1.1D：AUTHORIZED
```

开发者自测已完成：Node/Desktop 56 files / 404 tests；Central online/offline
各 48 tests / 0 failures / 0 errors / 0 skipped；Testcontainers
`postgres:16-alpine` 与 PostgreSQL 16 Embedded 均实际执行。Claude Code 独立
QA 复跑 12/12 建议范围并报告 P0/P1/P2/P3 全为 0；用户已接受该结论并明确
授权进入 1.1D。

### CGF-1.1D — 恢复矩阵与阶段关闭

建议版本：`0.0.0-cgf.1.1d`  
工程量：1～3 天

交付：

- Identity → Challenge → Proof → Token → Configuration 真实 PostgreSQL E2E；
- 命名故障点与 close/reopen；
- 并发、超时和有界资源测试；
- 在线/离线 Maven 双门禁；
- 日志/Fixture/数据库 Secret 扫描；
- 文档、Development Log、Upstream Register 和独立 QA 收口。

退出门槛：

- §12 全部矩阵通过；
- Node/Desktop 无回归；
- Java 在线与离线 `BUILD SUCCESS`；
- 无 P0/P1；
- 独立 QA `PASS` 后 CGF-1.1 关闭并允许进入 CGF-1.2。

当前检查点：

```text
CGF-1.1D：PASS / CLOSED
CGF-1.1：PASS / CLOSED
CGF-1.2：CONFIRMED_WITH_SPECIFIED_REVISIONS
CGF-1.2A：AUTHORIZED / NOT_STARTED
```

开发者自测已完成：Node/Desktop 56 files / 404 tests；Central online/offline
各 50 tests / 0 failures / 0 errors / 0 skipped；同一全链恢复矩阵已在
Testcontainers `postgres:16-alpine` 与 PostgreSQL 16 Embedded 实际执行。
Claude Code 独立 QA 已覆盖 14/14 建议范围并报告 P0/P1/P2/P3 全为 0；用户已
正式接受该结论并关闭 CGF-1.1。此结论不自动解锁 CGF-1.2。

## 12. 验收矩阵

| 类别 | 必测场景 | 预期 |
| --- | --- | --- |
| Migration | empty → latest | 一次成功 |
| Migration | latest reopen | 无重复 DDL/数据损坏 |
| Migration | newer schema | 启动失败关闭 |
| Migration | missing table/index/history | 启动失败关闭 |
| Identity | valid Fake OA result | 产生短期 verified identity |
| Identity | disabled user | 不产生 identity/token |
| Identity | self-declared enterprise/user | 忽略或拒绝 |
| Identity | OA secret persistence scan | 0 命中 |
| Challenge | nonce entropy/长度 | 满足安全下限 |
| Challenge | expiry boundary equal | 视为过期 |
| Challenge | wrong audience/client/purpose | `device_context_mismatch` |
| Challenge | parallel consume | 单写者 |
| Challenge | replay after restart | `device_challenge_replayed` |
| Proof | wrong key/signature/algorithm | 失败关闭 |
| Proof | deviceKeyId only | 不能建立 trust |
| Device | not managed/non-compliant/revoked | typed reject |
| Enrollment | code without OA identity | reject |
| Enrollment | same digest retry | same result |
| Enrollment | different digest retry | conflict |
| Enrollment | code/challenge double consume | 单写者 |
| Enrollment | identity disabled after proof verify | 事务内拒绝，不消费 Grant |
| Enrollment | existing key belongs to revoked device | 拒绝，不静默复活 |
| Enrollment | manual feature disabled | typed reject，无状态变化 |
| Token | four-factor intersection | 全部满足才签发 |
| Token | claims binding | 五个主体标识正确 |
| Token | expiry/issuer/audience/signature | 任一错误拒绝 |
| Token | response loss | 新 Challenge 重启流程 |
| Token | database/log scan | Bearer 明文 0 命中 |
| Configuration | valid token + permission | 返回 Snapshot + ETag |
| Configuration | missing permission | reject |
| Configuration | If-None-Match | 304，无正文 |
| Configuration | revision/digest drift | fail closed |
| Configuration | package ref missing | seed/读取失败关闭 |
| HTTP | unknown field/version/content type | strict reject |
| HTTP | `/foundation` 与 `/v1alpha1` | 类型和 header 不混用 |
| Recovery | crash before commit | 无可见部分状态 |
| Recovery | commit before response | 数据事实保留，按既定重启语义 |
| Regression | `pnpm run check` | 全量通过 |
| Regression | Central online/offline | 两轮 `BUILD SUCCESS` |

## 13. 架构与安全门禁

自动门禁至少检查：

1. `authentication.domain/application` 不导入 Spring MVC/JDBC；
2. 不存在 JPA/Hibernate 依赖或 `@Entity`；
3. 正式 Java DTO 只消费 canonical Schema，不形成第二套可编辑 Schema；
4. OA username/password/Ticket 字段不进入 canonical DTO、Entity、日志；
5. 不存在 `getPrivateKey/resolvePrivateKey/exportPrivateKey`；
6. Token/Secret 不进入 `application.yaml`、Fixture、数据库明文字段；
7. `/v1alpha1/configuration` 必须受 Token + `configuration.read` 保护；
8. `/foundation/*` 保持 `fixtureOnly` 和 `Cache-Control: no-store`；
9. CGF-1.1 不导入 Model/MCP/Tool Provider SDK；
10. 不创建 Admin 写端或通用配置 CRUD；
11. Flyway migration 只归 Central Service 所有；
12. 所有安全 TTL 均有绝对上限。
13. `EnterpriseFeatureSet` 只来自受信启动配置和 Adapter 注册，客户端不能扩大
    `manual_device_enrollment`。

## 14. 开始编码前的五项冻结建议

用户已于 2026-07-25 一次确认以下五项，避免 1.1A/1.1B 编码中途改 Contract：

1. 接受 1.1A～1.1D 四检查点和逐批独立 QA；
2. 接受 §6 的 Alpha TTL 默认值与绝对上限；
3. 接受
   `ROBOTHREE_DEVICE_PROOF_V1\n + canonicalJson(DeviceChallenge)` 作为签名字节；
4. 接受 Alpha 只执行 `ES256 + spki_der_base64`，证书格式先失败关闭；
5. 接受 Token 响应丢失后重新获取 Challenge，不保存或重放 Bearer Token 明文。

五项已经全部接受，本计划为 `CONFIRMED`，第一开发批进入 CGF-1.1A。后续若需
改变这些边界，必须通过新的架构决策明确替代，不得在 migration 或身份代码中
静默漂移。

## 15. 阶段完成定义

只有以下条件全部满足，CGF-1.1 才关闭：

```text
1.1A PASS
∩ 1.1B PASS
∩ 1.1C PASS
∩ 1.1D PASS
∩ Java/PostgreSQL E2E PASS
∩ online/offline Maven PASS
∩ Node/Desktop regression PASS
∩ independent QA no P0/P1
```

CGF-1.1 完成不代表企业身份可以试点上线。企业试点仍需真实 OA Adapter、真实
Managed Device Trust Adapter、至少一个生产 OS Device Signer、正式 Secret
Store、部署和安全测试。

关闭结论（2026-07-25）：

```text
1.1A PASS
∩ 1.1B PASS
∩ 1.1C PASS
∩ 1.1D PASS
∩ Java/PostgreSQL E2E PASS
∩ online/offline Maven PASS
∩ Node/Desktop regression PASS
∩ independent QA P0/P1/P2/P3 = 0
∩ user acceptance
→ CGF-1.1 PASS / CLOSED
```

后续状态：用户已在 KN-040 接受 CGF-1.2 指定修订并授权 1.2A。该授权不改变
CGF-1.1 的历史验收事实；1.2B/1.2C 继续受逐批独立 QA 门槛约束。
