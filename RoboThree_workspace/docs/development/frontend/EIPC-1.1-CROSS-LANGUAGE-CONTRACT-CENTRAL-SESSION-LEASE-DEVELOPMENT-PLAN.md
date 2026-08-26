# EIPC-1.1 Cross-language Contract + Central Session Lease 详细实施方案

> 状态：**EIPC-1.1.1～EIPC-1.1.3.3 PASS/CLOSED；EIPC-1.1 DORMANT FOUNDATION**  
> 日期：2026-08-23  
> 负责人：Codex 5.6  
> 上游：EIPC-0、EIPC-1.0 `PASS/CLOSED`；EIPC-1 总体计划 `PASS/CLOSED`  
> 当前 blocker：`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 继续成立

## 0. 结论边界

EIPC-1.1 只建立跨语言 Enterprise Session Contract、Central Session Lease 决策/Persistence/HTTP Foundation，
不实现真实 OA/SSO bootstrap、production identity-handle resolver、Local Credential Store、macOS Device
Signer、Core Token Provider、Runtime Active composition、Desktop API 或登录 UI。

本批最高允许输出为：

```text
EIPC11_SESSION_LEASE_FOUNDATION_CONFORMANT
```

同时必须保持：

```text
productionSessionEnabled = false
productionIdentityReady = false
identityCompositionBlockerClosed = false
downstreamCodingUnlocked = false
```

不得输出 `EIPC1_ENTERPRISE_INTEGRATION_ADAPTER_READY` 或 `IDENTITY_COMPOSITION_READY`。EIPC-1.1 的
Contract 与 Central Foundation 完成，不代表真实企业身份输入已经存在。

## 1. 目标与范围

EIPC-1.1 交付以下五项 Foundation：

1. 新建独立 `enterprise-session.v1alpha1` canonical Contract family；
2. 提供 opaque verified-identity-handle 绑定的 Device Challenge 与 Session Lease 两个 operation；
3. 由 Central 在同一事务中形成 Token claims、EIPC-0 Session Assertion、Device Trust Decision 与
   source decision；
4. 通过 forward-only PostgreSQL `v0010` 保存非明文 bearer 的精确 issuance 事实；
5. 让旧 Gateway bearer 与新 Session bearer 可以在内部统一授权，同时保持旧 Gateway
   v1alpha1/v1alpha2 Contract、fixture、digest 与 legacy claims profile 字节零漂移。

本批不解决企业集成授权缺口。生产依赖缺失时，Controller/Session branch 必须保持 disabled，不得用 Fake
resolver、Fake token codec 或固定 identity 启用 production endpoint。

## 2. 当前代码事实与新增缺口

### 2.1 已存在并直接复用

- canonical Enterprise Gateway `v1alpha1` 已定义 verified identity、Device Challenge/Proof、legacy Token、
  Configuration 与 Model Gateway；`v1alpha2` 只承载已接受的 additive Model Invocation sidecar；
- EIPC-0 `eipc.v1alpha1` 已冻结 non-secret Session Assertion、Device Trust Decision、owner/session scope、
  `personal_model.configure`、offline 2/3 与 canonical digest；
- `RoboThreeAccessTokenService` 已有 identity/device/permission/compatibility 重检、challenge consumption、
  issuance persistence 与 `CentralTransactionRunner`；
- `access_token_issuance` 只保存 token digest，不保存 bearer；
- InMemory/MyBatis 双 Persistence、Schema manifest/sidecar/preflight 与 fresh/upgrade Harness 已存在；
- Central 当前 target schema 是 `v0009`，B/U/manifest/SHA-256 sidecar 齐全；
- `EnterpriseBearerTokenFilter` 只提取 Authorization header，不解析或记录 bearer；
- EIPC-1.0 已证明 Secure Enclave 平台原语可用，但真实 OA/MDM/codesign/identity credential 未授权。

### 2.2 必须在 EIPC-1.1 解决的结构缺口

| 编号 | 当前事实 | EIPC-1.1 处理 |
| --- | --- | --- |
| G1 | legacy `/v1alpha1/device-challenges` 只接受内部 `verifiedIdentityId` | 新 family 增加 handle-bound challenge operation；禁止把 UUID 暴露给 Local |
| G2 | legacy `/v1alpha1/token` response 只有 bearer/expiry | 新 Session Lease response 原子返回 assertion/trust/compatibility/source decision |
| G3 | legacy `AccessTokenClaims` 不允许 `personal_model.configure` | 新建 `eipc.session-token.v1` claims type；禁止扩大 legacy enum |
| G4 | `RoboThreeAccessTokenValidator` 只返回 legacy claims | 新增 common authorizer + 两个严格 validator branch，不按未验证 payload 猜 profile |
| G5 | legacy issuance row 无 assertion/trust/source-decision 事实 | forward-only Central `v0010` 新增独立 immutable issuance 结构 |
| G6 | 当前 token 在事务外先编码，再在事务内重检 | 新 Lease 必须在一个 transaction closure 内锁定、组装、签发、consume、persist |
| G7 | EIPC-0 canonical files不能被新 Wire family复制后漂移 | JSON Schema/TS/Java 引用 EIPC-0 safe semantics并做 digest/fixture conformance |
| G8 | EIPC-1.0 production Adapter 存在性字段为硬编码 `false` | EIPC-1.1 Architecture test 使用真实 source/dependency graph 扫描，缺失即 fail |
| G9 | production handle resolver 与 Session token codec 未授权 | 只定义 Port 与 test adapter；production activation 保持 false |

G1 是本轮代码复核新增发现：若不新增 handle-bound challenge，Local 无法在不获取内部 UUID 的情况下生成
Session Lease 所需 Device Proof。该 operation 是对新 family 的必要补充，不修改 EIPC-1.0 已冻结的
Session Lease endpoint。

## 3. Contract family 与路由

### 3.1 独立 canonical family

新增：

```text
contracts/enterprise-session/v1alpha1/
  README.md
  openapi.yaml
  CANONICAL-DIGESTS.sha256
  schemas/common.schema.json
  schemas/device-challenge.schema.json
  schemas/session-lease.schema.json
  schemas/session-token-claims.schema.json
  schemas/error.schema.json
  fixtures/manifest.json
  fixtures/valid/**
  fixtures/invalid/**
```

同时在 `packages/contracts/src/enterprise-session/v1alpha1.ts` 提供 strict Zod schema，并显式复用 EIPC-0
的 `EnterpriseSessionAssertionV1Alpha1Schema` 与 `EnterpriseDeviceTrustDecisionV1Alpha1Schema`，不得复制一套
宽松的 assertion/trust 语义。

### 3.2 HTTP surface

只新增：

```text
POST /enterprise-session/v1alpha1/device-challenges
POST /enterprise-session/v1alpha1/session-leases
```

不修改或 alias：

```text
/v1alpha1/device-challenges
/v1alpha1/token
/v1alpha1/configuration
/v1alpha[12]/model-invocations/**
```

两个新 endpoint 都返回 `Cache-Control: no-store`。Session Lease response 不得进入 access log body、trace
attribute、metrics label 或 error evidence。

### 3.3 handle-bound Challenge request

strict request 字段固定为：

```text
kind = enterprise_session_device_challenge_request
schemaVersion = enterprise-session.v1alpha1
verifiedIdentityHandle
currentClientInstanceId
audience = robothree.enterprise-gateway
requiredPermissions[]
deviceKeyId
correlationId
```

约束：

- `verifiedIdentityHandle` 为 32～512 字节 base64url-compatible opaque value；Wire/Core/Central 不解析其内容；
- handle 不进入日志、Evidence、durable row 或 error；Central 只经 `VerifiedIdentityHandleResolver` 解析；
- `requiredPermissions` 使用 EIPC-0 七值 enum，1～32、唯一、ASCII 升序，且必须包含
  `configuration.read`；它只是请求约束，不是 entitlement 自报；
- `currentClientInstanceId` 与 `correlationId` 是 UUID；
- `deviceKeyId` 是公开设备 key identity，不是 Keychain handle/private key reference；
- 禁止 enterpriseId/userId/deviceId、verifiedIdentityId、permission grant、Device Trust decision、private
  key、bearer、Credential Reference 或 endpoint。

Challenge response 固定为：

```text
kind = enterprise_session_device_challenge
schemaVersion = enterprise-session.v1alpha1
challengeId
nonce
issuedAt
expiresAt
audience
currentClientInstanceId
allowedAlgorithms[]
challengeDigest
```

`challengeDigest` 使用 `sha256:<64 lowercase hex>`；Challenge purpose 在 Central 内部固定为
`enterprise_session_lease`。

### 3.4 Session Lease request

strict request 字段固定为：

```text
kind = enterprise_session_lease_request
schemaVersion = enterprise-session.v1alpha1
verifiedIdentityHandle
currentClientInstanceId
audience = robothree.enterprise-gateway
requiredPermissions[]
deviceProof
correlationId
```

`verifiedIdentityHandle/currentClientInstanceId/audience/requiredPermissions/correlationId` 必须与 Challenge
binding 精确一致。`deviceProof` 复用 ADR-014 的 challengeId/deviceKeyId/algorithm/signature/signedAt 语义；
signature 只在请求内存与 cryptographic verifier 中存在，不进入 response、log、Evidence 或 durable row。

### 3.5 Session Lease response

strict response 字段固定为：

```text
kind = enterprise_session_lease_result
schemaVersion = enterprise-session.v1alpha1
claimsProfile = eipc.session-token.v1
tokenType = Bearer
accessToken
expiresAt
sessionAssertion
deviceTrustDecision
compatibilityRevision
sourceDecisionDigest
```

跨字段不变量：

- `expiresAt === sessionAssertion.expiresAt`；
- assertion audience/scope.client/permissions 与 locked request 一致；
- Device Trust owner 与 assertion 的 enterprise/user/device 完全一致；
- response 不含 tokenId、verifiedIdentityId/handle、challenge、proof、signature、credential、private key、
  permission row 或 compatibility document；
- bearer 只在 response bytes 与未来 Core runtime lease 中存在，不进入 Central response object 的
  `toString()`、日志或 durable JSON。

### 3.6 新 claims profile

`eipc.session-token.v1` claims 固定为：

```text
claimsProfile
issuer
audience
enterpriseId
userId
deviceId
clientInstanceId
tokenId
issuedAt
expiresAt
permissions[]
sessionAssertionDigest
deviceTrustDecisionDigest
compatibilityRevision
sourceDecisionDigest
```

它是独立类型，不给 legacy `AccessTokenClaims.ALLOWED_PERMISSIONS` 或 canonical
`access-token-claims.schema.json` 添加 `personal_model.configure`。新/旧 token 必须由完整 cryptographic
verification 与 durable issuance lookup 分别验证，禁止只读取未验证 payload 的 discriminator 后直接授权。

## 4. Canonical digest 与 revision 公式

统一规则：UTF-8、NFC string、键按 Unicode code point 排序、array 顺序保留、禁止 undefined/NaN、时间使用
UTC RFC3339 millisecond、Wire digest 使用 `sha256:<64 lowercase hex>`。每类使用独立 domain separator。

### 4.1 Challenge

```text
challengeBindingDigest = sha256(
  "robothree.enterprise-session.challenge-binding.v1\n" +
  canonicalJson({
    schemaVersion, claimsProfile, verifiedIdentityId, currentClientInstanceId,
    audience, requiredPermissions, deviceKeyId, correlationId, challengeId,
    nonce, issuedAt, expiresAt
  })
)
```

`verifiedIdentityId` 只存在 Central 内部 digest material，不投影 Wire。handle 与 handle digest均不进入
durable record。

### 4.2 Session Assertion

```text
assertionRevision = sha256(
  "robothree.enterprise-session.assertion-revision.v1\n" +
  canonicalJson({
    claimsProfile, audience, scope, permissions, identityDigest,
    deviceRevision, permissionRevision, compatibilityRevision
  })
)

assertionDigest = sha256(
  "robothree.enterprise-session.assertion.v1\n" +
  canonicalJson(sessionAssertion without assertionDigest)
)
```

`assertionRevision` 表示来源版本；相同来源可跨 renewal 保持不变。`assertionDigest` 包含 issued/expires，标识
精确 Lease assertion。

### 4.3 Device Trust

```text
decisionRevision = sha256(
  "robothree.enterprise-session.device-trust-revision.v1\n" +
  canonicalJson({
    ownerIdentity, deviceRevision, trustSource, managedStatus, complianceStatus
  })
)

decisionDigest = sha256(
  "robothree.enterprise-session.device-trust.v1\n" +
  canonicalJson(deviceTrustDecision without decisionDigest)
)
```

### 4.4 Source decision

```text
sourceDecisionDigest = sha256(
  "robothree.enterprise-session.source-decision.v1\n" +
  canonicalJson({
    claimsProfile, sessionAssertionDigest, deviceTrustDecisionDigest,
    compatibilityRevision, currentClientInstanceId, requiredPermissions,
    issuedAt, expiresAt
  })
)
```

该 digest 明确排除 accessToken、tokenDigest、verifiedIdentityHandle/handle digest、proof/signature/signature
digest、private key、Credential Reference 与 wall-clock response serialization。

### 4.5 Durable record digest

Central-private `recordDigest` 使用 raw lowercase SHA-256，绑定 `v0010` indexed columns、assertion/trust JSON、
source decision、token digest 与 challenge binding。它不投影 Wire/Evidence，只用于 load/preflight tamper
检测。

## 5. Central Application 与 Port 边界

### 5.1 新增 Port

```text
VerifiedIdentityHandleResolver
  resolveForChallenge(opaqueHandle)
  resolveForLeaseForUpdate(opaqueHandle)

EnterpriseSessionTokenCodec
  encode(EnterpriseSessionTokenClaims, TokenSigningKeyHandle)
  decodeAndVerify(compactToken, TokenVerificationKeyHandle)

EnterpriseSessionLeasePersistence
  commitChallengeBinding(...)
  loadChallengeBindingForUpdate(...)
  commitLeaseOutcome(...)
  loadLeaseByTokenId(...)
```

EIPC-1.1 只交付 Port、Application、InMemory/MyBatis Adapter 与 test-only deterministic adapter。
production handle resolver、production token codec/bootstrap、Local Credential/Signer 属 EIPC-1.2/真实企业集成，
本批不得用 Fake 标记 ready。

### 5.2 Handle authority

- Controller/Main/Renderer/OS user/固定 userId/数据库只有一行均不是 authority；
- resolver 只能返回内部 verifiedIdentityId 与 source revision，不返回 owner tuple给请求方；
- handle resolution 后仍必须由 repository 锁行重检 active identity；resolver 结果不是最终授权；
- Challenge 与 Lease 两次 resolve 必须指向同一 verifiedIdentityId/source revision，否则
  `enterprise_identity_handle_drift` 失败关闭且不 consume challenge。

### 5.3 Common bearer authorization

保留 legacy `RoboThreeAccessTokenValidator` 的 wire/profile 语义，新增：

```text
EnterpriseBearerPrincipal
EnterpriseBearerAuthorizer
LegacyBearerAuthorizerAdapter
EnterpriseSessionTokenValidator
CompositeEnterpriseBearerAuthorizer
```

Composite 对 legacy/new branch 各自执行完整 signature + issuance validation；恰好一个成功才返回 common
principal。零成功返回 `access_token_invalid`；两个成功返回 `access_token_profile_ambiguous`。禁止依据未验证
payload、header、长度或 permission 值选择授权分支。

`ConfigurationReadService` 与 Model Invocation authorizer 改依赖 common Port，但 legacy token 的 issuer、
audience、permission、expiry、issuance 与 error 语义必须保持不变。Session branch 未 production-enabled 时，
production composition 只安装 legacy branch。

## 6. Central `v0010` forward-only Persistence

> EIPC-1.1.2 编码权威方案已拆为
> [`EIPC-1.1.2 PostgreSQL v0010 + Persistence 详细实施方案`](./EIPC-1.1.2-POSTGRESQL-V0010-PERSISTENCE-DEVELOPMENT-PLAN.md)。
> 下列 §6.2～§6.4 保留为父计划初始草案；涉及 `identity_source_revision`、numeric source revision 与 Wire
> revision digest 拆分、issuer/audience/trust indexed facts、聚合 Port、exact v0009 history 的细节，以
> EIPC-1.1.2 详细方案为准。该方案已完成实现、独立 QA 与用户接受，现为 `PASS/CLOSED`。

当前 target 是 `v0009`。EIPC-1.1 预留且只能使用 `v0010`；若编码前 `v0010` 被其他已授权批次占用，必须
停止并回文档评审，禁止静默改号。

### 6.1 Schema 文件

```text
deploy/sql/postgresql/baseline/B0010__enterprise_session_lease.sql
deploy/sql/postgresql/upgrade/U0010__enterprise_session_lease_from_v0009.sql
deploy/sql/postgresql/manifest/postgresql-v0010.json
deploy/sql/postgresql/manifest/postgresql-v0010.json.sha256
```

- B0010 是完整 fresh baseline（包含 v0009 全部既有结构 + 本批两表）；
- U0010 只接受 exact v0009 history；
- v0001～v0009 所有 SQL/manifest/sidecar 字节与 digest 不改写；
- manifest target=10，entry path 仅 `fresh` / `v0009_upgrade`；
- installer、ledger、preflight、fresh/upgrade/legacy bridge 测试同步升级。

### 6.2 `enterprise_session_challenge_binding`

```text
challenge_id UUID PRIMARY KEY FK device_challenge
claims_profile VARCHAR(64) CHECK = eipc.session-token.v1
required_permissions TEXT[] NOT NULL
correlation_id UUID NOT NULL UNIQUE
binding_digest CHAR(64) NOT NULL
record_digest CHAR(64) NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

约束 required permissions 非空/有界/唯一/含 `configuration.read`；application 额外校验 ASCII 排序与 enum。
表中不保存 verifiedIdentityHandle、handle digest、signature、proof、bearer 或 Secret。

### 6.3 `enterprise_session_lease_issuance`

```text
token_id UUID PRIMARY KEY
token_digest CHAR(64) NOT NULL UNIQUE
claims_profile VARCHAR(64) CHECK = eipc.session-token.v1
enterprise_id VARCHAR(160) NOT NULL
user_id VARCHAR(160) NOT NULL
device_id VARCHAR(160) NOT NULL FK enterprise_device
client_instance_id VARCHAR(160) NOT NULL
permissions TEXT[] NOT NULL
identity_digest CHAR(64) NOT NULL
device_revision BIGINT NOT NULL
permission_revision BIGINT NOT NULL
compatibility_revision BIGINT NOT NULL
issued_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
challenge_id UUID NOT NULL UNIQUE FK enterprise_session_challenge_binding
session_assertion_revision VARCHAR(71) NOT NULL
session_assertion_digest VARCHAR(71) NOT NULL
session_assertion_json TEXT NOT NULL
device_trust_decision_revision VARCHAR(71) NOT NULL
device_trust_decision_digest VARCHAR(71) NOT NULL
device_trust_decision_json TEXT NOT NULL
source_decision_digest VARCHAR(71) NOT NULL
request_digest CHAR(64) NOT NULL
record_digest CHAR(64) NOT NULL
```

所有 raw digest 用 `^[a-f0-9]{64}$`；Wire digest 用 `^sha256:[a-f0-9]{64}$`；expiry、revision、array、FK、
JSON byte-size 设置 CHECK。load 时逐字段重建 JSON、重算所有 digest、验证 indexed columns 与 JSON 一致，
任何漂移 `persistence.enterprise_session_lease_corrupt` 失败关闭。

### 6.4 双 Adapter 完整交付纪律

Persistence Port、InMemory、MyBatis/XML/entity/converter、v0010、preflight 与 conformance 必须在 EIPC-1.1.2
同一完整批次交付；禁止只改 Port 或只实现一个 Adapter形成半切换。

## 7. 同事务 Session Lease 决策

`EnterpriseSessionLeaseService.issue()` 的 authoritative path 固定为一个
`CentralTransactionRunner.required()` closure：

1. strict validate request 与 body byte limit；
2. 读取并锁定 challenge + challenge binding，验证未消费/未过期/purpose；
3. 解析 opaque handle，锁定 verified identity，验证与 challenge identity/source revision一致；
4. 锁定 device，重做 Device Trust，并验证 device revision/key/proof context；
5. cryptographically verify Device Proof；
6. 锁定 permission rows，要求 requested subset 全部真实 enabled，且包含 `configuration.read`；
7. 在 transaction 内取得 compatibility decision；
8. 由单一 `EnterpriseSessionLeaseDecisionAssembler` 生成 assertion/trust/revisions/digests/token claims；
9. 在 transaction 内调用 token codec 生成 bearer，只在局部变量保留；
10. consume challenge，原子插入 immutable lease issuance；
11. transaction 返回完整 response material；Controller 只做 strict mapping，不追加或重算任何事实。

禁止沿用 legacy “事务外先签 token、事务内重检、事务后拼 assertion/trust”的顺序。任一步失败整笔 rollback；
已生成但未 commit 的 bearer不得返回或持久化。

## 8. Recovery 与并发窗口

| 窗口 | 发生点 | 恢复语义 |
| --- | --- | --- |
| L1 | handle resolve 前 | 无 challenge/lease，可重新开始 |
| L2 | challenge + binding commit 后 response lost | challenge自然过期；客户端不可猜 challengeId |
| L3 | proof verify 后 transaction commit 前 | rollback，challenge仍 pending，零 issuance |
| L4 | bearer encode 后 commit 前 | rollback；bearer不返回、不落盘 |
| L5 | challenge consume + issuance commit 后 response lost | 不 replay bearer；旧 challenge 已消费，新 challenge创建新 Lease |
| L6 | 同 challenge 并发 | exactly one commit；loser typed replay/conflict |
| L7 | permission/device/identity/compatibility drift | commit 前失败关闭，challenge不消费 |
| L8 | MyBatis commit failure | challenge binding/consume/issuance 原子 rollback |
| L9 | Central restart | durable issuance 可校验，但不能重建或返回 bearer |
| L10 | token validation 时 row/digest drift | fail-closed，不 fallback legacy branch |

EIPC-1.1 不建立 durable bearer journal，也不提供“按 tokenId 重新下载 token”的接口。Response loss 的代价是
重新 challenge/issue，不能为了 exactly-once response 保存明文 bearer。

## 9. Production activation 与 blocker

新增 feature property 默认 `false`。只有以下 production Bean 全部存在且显式启用时，Session endpoints 才能
注册：

- production `VerifiedIdentityHandleResolver`；
- production `EnterpriseSessionTokenCodec` 与受控 signing key handle；
- MyBatis v0010 Persistence + schema preflight；
-真实 Device Trust/Proof/Permission/Compatibility dependencies。

EIPC-1.1 不提供前两项 production implementation，因此正式构建必须继续：

```text
productionSessionEnabled=false
productionIdentityReady=false
```

Architecture test 必须真实扫描 `services/core/src/adapters/**` 与 production dependency graph，证明 EIPC-1.0
P3-1 所述 production Adapter 仍缺失；禁止 evidence 直接硬编码 `false`。

## 10. 实施拆分与工期

### EIPC-1.1.1：Canonical Contract + Cross-language Conformance（3～5 日）

- canonical family、OpenAPI、schema、fixtures、manifest/digests；
- TS strict Zod 与 EIPC-0 schema composition；
- Java validator family allowlist与 family-qualified safe semantic refs；
- legacy Gateway/EIPC-0 byte-digest 零漂移；
- 不改 Central production service/schema。

### EIPC-1.1.2：PostgreSQL v0010 + Persistence（7～11 日）

- B0010/U0010/manifest/sidecar/preflight；
- Challenge Binding + Lease Issuance；
- Persistence Port + InMemory/MyBatis 双实现、digest revalidation；
- 不注册 HTTP endpoint、不签发 bearer。

### EIPC-1.1.3：Central Decision / Validator / HTTP Foundation（25～40 日）

编码权威方案见
[`EIPC-1.1.3 Central Decision / Validator / HTTP Foundation`](./EIPC-1.1.3-CENTRAL-DECISION-VALIDATOR-HTTP-FOUNDATION-DEVELOPMENT-PLAN.md)。

- Handle-bound Challenge service；
- same-transaction Session Lease service/assembler；
- new claims/codec Port/session validator/common authorizer；
- conditionally disabled Controller 与 L1～L10 Harness；
- production activation仍 false。

每个子批必须独立 QA、用户接受并单独授权。EIPC-1.1 新估算为
**35～56 个集中工程日**。EIPC-1 总估算修正为 **49～79 日**，不含真实 OA/MDM、安全审批、
EIPC-1.2/1.3 独立 QA返工或现场联调。

## 11. 允许与禁止文件范围

### 11.1 子批获授权后允许

- `contracts/enterprise-session/v1alpha1/**`；
- `packages/contracts/src/enterprise-session/**` 与对应 tests；
- `services/central-service/src/main/java/**/authentication/**` additive session 模块；
- `services/central-service/src/main/java/**/persistence/**` 对应 Port/Adapter/preflight；
- `services/central-service/deploy/sql/postgresql/**` 的唯一 v0010；
- Central/Contract tests、Harness、Evidence；
- 每个子批的版本与治理文档收口。

### 11.2 明确禁止

- 修改 `contracts/enterprise-gateway/v1alpha1/**`、`v1alpha2/**` 或其 canonical digest；
- 修改 `contracts/enterprise-identity-composition/v1alpha1/**` 已冻结字节；
- 给 legacy `AccessTokenClaims`/schema enum 添加 `personal_model.configure`；
- 修改 v0001～v0009 SQL/manifest/sidecar；
- production OA/SSO/MDM bootstrap、production handle resolver、Local Credential/Signer/Token Provider；
- Core Runtime Active composition、EIPC-2/EIPC-3；
- Main/Preload/Renderer、Desktop API、登录 UI、个人模型 UI；
- STRM-3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM；
- bearer/identity handle/signature/private key 写入 SQLite/PostgreSQL JSON、普通文件、env、argv、日志、
  trace、metrics 或 Evidence；
- 新依赖或 `pnpm-lock.yaml` 修改，除非重新文档评审并获用户授权。

发现必须修改禁止范围时立即停止，回文档评审；不得先写半成品再补授权。

## 12. QA 验收矩阵（84 项）

### 12.1 Contract / Wire（1～18）

1. Challenge request strict；
2. Challenge response strict；
3. Lease request strict；
4. Lease response strict；
5. Session token claims strict；
6. error schema strict；
7. handle byte/pattern bound；
8. request 禁 owner/verifiedIdentityId 自报；
9. request 禁 permission grant/trust decision自报；
10. request 禁 private key/Credential/bearer；
11. requiredPermissions 唯一/排序/有界；
12. requiredPermissions 必含 configuration.read；
13. audience 固定；
14. challenge/lease exact binding；
15. response expiry/assertion一致；
16. assertion/trust owner一致；
17. EIPC-0 safe semantics 直接复用；
18. OpenAPI 只有两个 POST operation且 no-store。

### 12.2 Digest / Identity（19～32）

19. challenge binding digest重算；
20. assertionRevision 重算；
21. assertionDigest重算；
22. trust revision重算；
23. trust digest重算；
24. sourceDecisionDigest重算；
25. recordDigest重算；
26. NFC/canonical key order；
27. array order保留；
28. Wire/raw digest格式分离；
29. handle不进 durable/evidence；
30. signature及其 hash不进 source digest；
31. token/tokenDigest不进 Wire source digest；
32. handle resolve drift失败关闭。

### 12.3 v0010 / Persistence（33～52）

33. B0010 fresh；
34. U0010 exact v0009 upgrade；
35. v0001～v0009 bytes/digests零漂移；
36. manifest canonical；
37. sidecar exact；
38. ledger target=10；
39. newer/unknown history fail-closed；
40. Challenge Binding constraints；
41. Lease Issuance constraints；
42. challenge FK/unique；
43. token digest unique；
44. expiry/revision CHECK；
45. JSON byte limit；
46. indexed/JSON一致；
47. InMemory/MyBatis conformance；
48. Port + 双 Adapter无半切换；
49. commit rollback原子；
50. duplicate challenge conflict；
51. corrupt row fail-closed；
52. bearer明文零持久化。

### 12.4 Decision / Recovery（53～66）

53. L1 无副作用；
54. L2 challenge自然过期；
55. L3 proof 后 rollback；
56. L4 encoded bearer不外发；
57. L5 response loss不 replay；
58. L6 exactly one winner；
59. L7 identity drift；
60. L7 device/trust drift；
61. L7 permission drift；
62. L7 compatibility drift；
63. L8 MyBatis commit rollback；
64. L9 restart不重建 bearer；
65. L10 corrupt validation fail-closed；
66. transaction 后禁止补拼 assertion/trust。

### 12.5 Dual Profile / Regression（67～76）

67. legacy token仍通过；
68. legacy claims unknown personal permission仍拒绝；
69. session token通过新 branch；
70. session token `personal_model.configure` 真实校验；
71. 零 branch失败；
72. 双 branch ambiguous失败；
73. 不按未验证 payload路由；
74. ConfigurationRead legacy回归；
75. Model Gateway v1alpha1/v1alpha2 回归；
76. legacy canonical corpus/digest零漂移。

### 12.6 Security / Boundary / Gates（77～84）

77. production handle resolver真实扫描而非硬编码；
78. Fake依赖不进 production graph；
79. feature默认 disabled；
80. response/log/trace/metrics敏感扫描 0；
81. 本批不声称完整多编码负向扫描（留 EIPC-1.3）；
82. no Core/Main/Preload/Renderer drift；
83. no dependency/lockfile drift；
84. Workspace、Central online、Central offline 串行全绿。

## 13. 验证命令与证据

子批编码后至少串行运行：

```text
CI=true pnpm run harness:eipc1.1
CI=true pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

EIPC-1.1.1/1.1.2 可有各自 focused Harness；EIPC-1.1.3 最终 Harness 必须聚合三批真实事实。正式 Harness
不得与 Central 门禁并行，不得用 retry覆盖首次失败。

Evidence 只允许输出 counts、typed status、canonical digest、schema version、resource count；禁止 bearer、
handle、owner tuple、proof/signature、tokenId、challenge nonce 或内部路径。

## 14. 文档评审问题

1. 是否接受新 family 必须增加 handle-bound Device Challenge operation；
2. 是否接受新 `eipc.session-token.v1` profile 与 legacy claims 完全分离；
3. 是否接受 common authorizer内部接缝，但不改 legacy Wire/schema；
4. 是否接受 forward-only Central `v0010` 两表设计；
5. 是否接受 assertion/trust/source decision 的 canonical公式；
6. 是否接受 same-transaction encode/consume/persist，禁止事务后拼事实；
7. 是否接受 response loss 重新 issue、不持久化 bearer；
8. 是否接受 production handle resolver/token codec 缺失时 endpoint默认 disabled；
9. 是否接受 EIPC-1.1 拆为 1.1.1～1.1.3 串行独立门禁；
10. 是否存在新的 P0～P3 或必须先补 ADR 的事实。

## 15. 当前门禁

```text
EIPC-0                  PASS/CLOSED
EIPC-1 Plan             PASS/CLOSED
EIPC-1.0                PASS/CLOSED
EIPC-1.1 Plan           PASS/CLOSED
EIPC-1.1.1              PASS/CLOSED
EIPC-1.1.2              PASS/CLOSED
EIPC-1.1.3 Plan         PASS/CLOSED
EIPC-1.1.3.1            PASS/CLOSED
EIPC-1.1.3.2            PASS/CLOSED
EIPC-1.1.3.3 Plan       PASS/CLOSED
EIPC-1.1.3.3 Code       PASS/CLOSED / DORMANT FOUNDATION
EIPC-1.2～EIPC-1.3      DEFERRED / OUT OF CURRENT RELEASE
EIPC-2～EIPC-3          DEFERRED / OUT OF CURRENT RELEASE
STRM-3                  GATED
DFI-4A.4.1～4A.4.3      GATED
DFI-2B / DFI-3          GATED
TGM                     GATED
```

EIPC-1.1 计划评审已经用户接受并正式关闭。EIPC-1.1.1 已完成 canonical Contract、TS/Java cross-language
conformance、legacy bytes/digest 零漂移证明与 focused Harness，独立 QA 已由用户接受并正式关闭；它没有
创建 `v0010`、Central production Decision/Validator/HTTP、Core production Adapter 或 Desktop 接口。
EIPC-1.1.2 已完成实现、独立 QA 与用户接受并正式关闭；EIPC-1.1.3 计划评审已由用户接受并关闭。
EIPC-1.1.3.1 已完成 Decision Domain / Ports / Canonical Material 实现、独立 QA 与用户接受并正式关闭；
EIPC-1.1.3.2 已完成实现、独立 QA 与用户接受并正式关闭；EIPC-1.1.3.3 已完成方案评审、用户授权、实现与
开发者门禁，当前只进入独立 QA，不自动关闭 EIPC-1.1 或解锁 EIPC-1.2～1.3。
