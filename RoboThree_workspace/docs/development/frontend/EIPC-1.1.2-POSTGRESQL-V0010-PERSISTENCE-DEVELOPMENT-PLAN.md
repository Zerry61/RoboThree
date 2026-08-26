# EIPC-1.1.2 PostgreSQL v0010 + Persistence 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-23  
> 负责人：Codex 5.6  
> 上游：EIPC-0、EIPC-1.0、EIPC-1.1.1 `PASS/CLOSED`；EIPC-1/EIPC-1.1 计划 `PASS/CLOSED`  
> 当前 blocker：`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity composition blocker 继续成立

## 0. 一句话结论

EIPC-1.1.2 只把 EIPC-1.1.1 已冻结的 Enterprise Session Challenge Binding 与 Lease Issuance 变成
**可持久、可原子提交、可重启读取、可逐字段校验**的 Central 私有事实：新增 forward-only PostgreSQL
`v0010`、独立 Persistence Domain/Port、InMemory/MyBatis 双 Adapter、schema preflight 与恢复 Conformance。

本批不签发 bearer、不验证 Device Proof、不解析 opaque handle、不注册 HTTP endpoint、不启用 production
Session，也不接 Core/Desktop/Renderer。最高允许输出：

```text
EIPC112_POSTGRESQL_PERSISTENCE_CONFORMANT
```

同时必须保持：

```text
productionSessionEnabled = false
productionIdentityReady = false
identityCompositionBlockerClosed = false
downstreamCodingUnlocked = false
```

## 1. 上游状态与本批目标

### 1.1 已关闭的上游事实

- EIPC-0 已冻结 owner identity、session rebind、Runtime Active authority、offline 2/3 与 entitlement 语义；
- EIPC-1.0 已证明 Secure Enclave 平台原语可用，同时诚实保留真实企业集成授权 blocker；
- EIPC-1.1.1 已冻结独立 `enterprise-session.v1alpha1` canonical family、strict TS schema、EIPC-0 safe
  reference、六类 domain-separated digest、valid/invalid corpus 与 Java/TS conformance；
- EIPC-1.1.1 独立 QA 已由用户接受并正式 `PASS/CLOSED`，P0～P3 均为 0；
- legacy Enterprise Gateway v1alpha1/v1alpha2、EIPC-0 canonical bytes/digest 均已证明零漂移。

### 1.2 EIPC-1.1.2 交付目标

1. 将 Central schema target 从 `v0009` forward-only 提升到 `v0010`；
2. 新增 immutable `enterprise_session_challenge_binding`；
3. 新增 immutable `enterprise_session_lease_issuance`；
4. 冻结 Persistence 私有 record digest 与 load-time revalidation；
5. 提供聚合式 `EnterpriseSessionPersistence` Port；
6. 同一完整批次实现 InMemory 与 MyBatis/PostgreSQL 两个 production Adapter；
7. 证明 fresh B0010 与所有受支持 v0009 history 经 U0010 后结构完全一致；
8. 证明失败、并发、重启、篡改均 fail-closed，且 bearer/handle/proof/signature 不进入 durable store。

## 2. 当前代码事实与结构缺口

### 2.1 已存在并直接复用

- 当前 Central target schema 是 `v0009`；当前 manifest 为 `postgresql-v0009.json`；
- 当前 fresh/upgrade 为 `B0009__prompt_cache_planning.sql` 与
  `U0009__prompt_cache_planning_from_v0008.sql`；
- `SchemaManifestLoader` 当前固定读取 v0009 manifest，`CentralSchemaPreflight` 当前验证到 v0009；
- `SchemaTestInstaller` 已支持 legacy V1～V5 bridge、B/U v0006～v0009、事务内 script + ledger 提交；
- `Alignment2aSchemaConformance` 已用 structural snapshot 对比 fresh 与多条 upgrade history；
- Central 已有 `device_challenge`、`access_token_issuance`，但它们属于 legacy token profile；
- `InMemoryCentralPersistence` 同时实现现有 Repository 与 `CentralTransactionRunner`，用完整 Snapshot 回滚；
- MyBatis 使用 Domain → Entity → Mapper XML → Adapter 分层，并由 `CentralSchemaPreflight` 在 Ready 前失败关闭；
- EIPC-1.1.1 已提供 Session Challenge/Lease/Claims schema 与六类 canonical digest corpus；
- 当前 production 代码没有 v0010、Enterprise Session Persistence、Session Lease service、token codec 或
  production handle resolver。

### 2.2 编码前必须冻结的新增缺口

| 编号 | 缺口 | EIPC-1.1.2 冻结处理 |
| --- | --- | --- |
| G1 | 父计划两表草案未保存 handle resolver 的 source revision | Challenge Binding 增加 `identity_source_revision`；Challenge/Lease 两次 resolve 的漂移判断才有 durable 基准 |
| G2 | 父计划把 `device_revision` / `permission_revision` 写成 BIGINT，但 EIPC-1.1.1 canonical material 已冻结为 `sha256:` digest | 明确拆分 numeric `device_source_revision` 与 Wire `device_revision_digest`；permission 只保存 Wire `permission_revision_digest` |
| G3 | 原 issuance 草案缺 issuer/audience/trust source/managed/compliance 等事实 | 补齐 indexed facts，使 assertion revision、trust revision、assertion/trust/source decision digest 可从 durable row 重算 |
| G4 | 原草案只写 Repository，无法防止 Challenge 与 Binding、consume 与 issuance 半提交 | 使用聚合式 `EnterpriseSessionPersistence`；原子方法语义覆盖两组事实 |
| G5 | 当前 preflight 的 v0009 history 判断不能直接套到 v0010 | 新增 exact v0010 history validator，显式接受 B0009 或 U0009 及其完整祖先链，拒绝缺行/多行/未知 digest |
| G6 | 多个既有 Central 集成测试硬编码 `version = 9` | 在本批测试范围内改为 target=10 或从 manifest 读取；不得把 v0009 历史断言删除 |
| G7 | SQL README 仍描述 v0007 为 current target | 编码收口时同步为 v0010，但不改写历史 SQL/manifest |
| G8 | bearer response loss 不能靠 Persistence 重放 | Persistence 只保存 token digest 与 issuance，不保存/返回 bearer；业务 response-loss 语义留 EIPC-1.1.3 |

G1～G3 是对 Central 私有 persistence material 的补齐，不修改 EIPC-1.1.1 Wire Contract、六类 public digest
domain 或 canonical fixture。

## 3. 范围与非目标

### 3.1 本批允许实现

- `B0010` / `U0010` / v0010 manifest / sidecar；
- schema loader、preflight、test installer 与 schema conformance 的 target=10 additive 更新；
- Enterprise Session Persistence 私有 Domain、Port、Entity、Converter、Mapper XML、InMemory/MyBatis Adapter；
- Challenge Binding 与 Lease Issuance 的 immutable insert/load/for-update/atomic commit；
- production Java canonical persistence digest helper，且必须复用 EIPC-1.1.1 corpus做 conformance；
- focused Harness、PostgreSQL/Testcontainers、embedded/offline、完整 Central 门禁；
- 本批版本与治理文档收口。

### 3.2 本批明确不实现

- opaque `verifiedIdentityHandle` production resolver；
- Device Proof verification、Device Trust evaluator、Permission/Compatibility decision assembler；
- `EnterpriseSessionTokenCodec`、bearer encode/decode/sign/verify；
- handle-bound Challenge Application Service、Session Lease Application Service；
- Controller、HTTP route、security filter、common bearer authorizer；
- Core `EnterpriseAccessTokenProvider`、Local Credential Store、Device Signer、Runtime Active composition；
- Main/Preload/Renderer、Desktop Local sidecar、登录或个人模型 UI；
- EIPC-1.1.3、EIPC-1.2～1.3、EIPC-2～3、STRM-3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM。

## 4. Persistence Domain 与 digest 边界

### 4.1 两类 immutable domain fact

新增 Central-private domain：

```text
EnterpriseSessionChallengeBinding
  challengeId
  verifiedIdentityId
  claimsProfile
  identitySourceRevision
  currentClientInstanceId
  audience
  requiredPermissions
  deviceKeyId
  correlationId
  challengeBindingDigest
  recordDigest
  createdAt

EnterpriseSessionLeaseIssuance
  tokenId
  tokenDigest
  claimsProfile
  issuer
  audience
  enterpriseId / userId / deviceId
  verifiedIdentityId / identitySourceRevision
  clientInstanceId
  permissions
  identityDigest
  deviceSourceRevision
  deviceRevisionDigest
  permissionRevisionDigest
  compatibilityRevision
  trustSource / managedStatus / complianceStatus
  issuedAt / expiresAt / trustEvaluatedAt
  challengeId / challengeBindingDigest
  sessionAssertionRevision / sessionAssertionDigest / sessionAssertionJson
  deviceTrustDecisionRevision / deviceTrustDecisionDigest / deviceTrustDecisionJson
  sourceDecisionDigest
  requestDigest
  recordDigest
```

所有集合构造后 defensive copy；所有时间统一 UTC millisecond；permissions 必须 1～32、ASCII 排序、唯一、
属于 EIPC-1.1.1 enum 且包含 `configuration.read`。

### 4.2 Digest 表示法必须分层

| 类型 | Java logical value | PostgreSQL | 说明 |
| --- | --- | --- | --- |
| Wire/public digest | `sha256:<64 lowercase hex>` | `VARCHAR(71)` | assertion/trust/source decision 与 device/permission revision digest |
| Central raw digest | `<64 lowercase hex>` | `CHAR(64)` | token digest、request digest、binding raw digest、record digest |
| source numeric revision | non-negative `long` | `BIGINT` | 仅 `device_source_revision`，不得冒充 public digest |
| opaque source revision | 1～160 chars | `VARCHAR(160)` | handle resolver source revision；不投影 Wire |

Converter 是 raw/prefixed 表示法的唯一转换边界。不得让同一字段有时带 `sha256:`、有时不带，也不得把
BIGINT 格式化后冒充 `deviceRevisionDigest`。

### 4.3 Record digest

新增两个 Central-private domain separator：

```text
robothree.enterprise-session.persistence.challenge-record.v1
robothree.enterprise-session.persistence.lease-record.v1
```

逻辑公式：

```text
recordDigest = rawSha256(
  domain + "\n" + canonicalJson(all durable logical fields except recordDigest)
)
```

- canonical JSON 继续使用 EIPC-1.1.1 的 UTF-8、NFC、键排序、array 顺序保留、UTC millisecond 规则；
- material 中 Wire digest 保留 `sha256:` 前缀，raw digest 保持 64 hex，禁止混写；
- Challenge record material 绑定 G1 新增的 `identitySourceRevision`；
- Lease record material绑定 issuer/audience、所有 indexed facts、两个 canonical JSON document 与 exact
  Challenge Binding identity；
- record digest 只做 corruption/tamper detection，不是授权 MAC，也不得投影 Wire/Evidence。

### 4.4 Load-time revalidation 层次

每次从 InMemory/MyBatis load 都必须：

1. 校验字段类型、长度、enum、时间、permissions 与 digest shape；
2. 验证 Challenge Binding 与关联 `device_challenge` 的 purpose、identity、client、audience、device key、
   issuedAt/createdAt 一致，且 `binding_digest === device_challenge.challenge_digest`；
3. strict parse `session_assertion_json` 与 `device_trust_decision_json`；
4. 验证 JSON 为 canonical bytes，且 JSON 字段与 indexed columns 逐字段一致；
5. 用 EIPC-1.1.1 公式重算 assertion revision/digest、trust revision/digest、source decision digest；
6. 重算 challenge/lease record digest；
7. 任一不一致返回 typed `persistence.enterprise_session_*_corrupt`，禁止返回 partial object。

Persistence 不用当前 mutable permission/device row“重写历史决定”。历史 source revision 由 issuance immutable
facts证明；EIPC-1.1.3 的新 Lease 决策仍必须重新锁定和读取当前 source facts。

## 5. PostgreSQL v0010

### 5.1 文件与版本占号

编码前再次确认 v0010 未被其他授权批次占用。只允许新增：

```text
deploy/sql/postgresql/baseline/B0010__enterprise_session_persistence.sql
deploy/sql/postgresql/upgrade/U0010__enterprise_session_persistence_from_v0009.sql
deploy/sql/postgresql/manifest/postgresql-v0010.json
deploy/sql/postgresql/manifest/postgresql-v0010.json.sha256
```

- B0010 是完整 fresh baseline，包含 B0009 全结构和 v0010 additive 结构；
- U0010 只对 exact v0009 target history 增加新 constraint/table/index；
- v0001～v0009 SQL、manifest、sidecar 与冻结 digest 全部 byte-for-byte 不变；
- manifest `targetSchemaVersion=10`，entry path 仅 `fresh` / `v0009_upgrade`；
- release version 固定为 EIPC-1.1.2 的开发版本；
- 若 v0010 已被占用，立即停止并回文档评审，禁止静默改为 v0011。

### 5.2 既有表 additive 约束

为数据库强制 Binding 与 Challenge 使用同一 identity，v0010 为 `device_challenge` 增加：

```sql
CONSTRAINT uq_device_challenge_identity_pair
  UNIQUE (challenge_id, verified_identity_id)
```

不修改既有列、PK、消费语义或 legacy token path。

### 5.3 `enterprise_session_challenge_binding`

冻结列：

```text
challenge_id                 UUID PRIMARY KEY
verified_identity_id         UUID NOT NULL
claims_profile               VARCHAR(64) NOT NULL
identity_source_revision     VARCHAR(160) NOT NULL
current_client_instance_id   UUID NOT NULL
audience                     VARCHAR(256) NOT NULL
required_permissions         TEXT[] NOT NULL
device_key_id                VARCHAR(160) NOT NULL
correlation_id               UUID NOT NULL
binding_digest               CHAR(64) NOT NULL
record_digest                CHAR(64) NOT NULL
created_at                   TIMESTAMPTZ NOT NULL
```

约束：

- composite FK `(challenge_id, verified_identity_id)` → `device_challenge` exact identity pair；
- named unique `uq_enterprise_session_challenge_correlation (correlation_id)`；
- named unique `uq_enterprise_session_challenge_binding_digest (binding_digest)`；
- named unique `uq_enterprise_session_challenge_binding_identity
  (challenge_id, binding_digest, verified_identity_id, identity_source_revision)` 供 Lease exact FK；
- `claims_profile = 'eipc.session-token.v1'`；
- `audience = 'robothree.enterprise-gateway'`；
- raw digest 为 64 lowercase hex；
- `identity_source_revision`、`device_key_id` 长度 1～160；
- permissions cardinality 1～32、无 NULL、属于冻结 enum、包含 `configuration.read`；
- permissions ASCII sorted/unique 由 Domain/Converter/record digest 验证，不能依赖 PostgreSQL array 比较猜测；
- 表中禁止 verified identity handle、handle digest、proof、signature、bearer、Credential Reference。

非约束索引：

```text
ix_enterprise_session_challenge_identity_created
```

### 5.4 `enterprise_session_lease_issuance`

冻结列：

```text
token_id                           UUID PRIMARY KEY
token_digest                       CHAR(64) NOT NULL
claims_profile                     VARCHAR(64) NOT NULL
issuer                             VARCHAR(160) NOT NULL
audience                           VARCHAR(256) NOT NULL
enterprise_id                      VARCHAR(160) NOT NULL
user_id                            VARCHAR(160) NOT NULL
device_id                          VARCHAR(160) NOT NULL
verified_identity_id               UUID NOT NULL
identity_source_revision           VARCHAR(160) NOT NULL
client_instance_id                 UUID NOT NULL
permissions                        TEXT[] NOT NULL
identity_digest                    CHAR(64) NOT NULL
device_source_revision             BIGINT NOT NULL
device_revision_digest             VARCHAR(71) NOT NULL
permission_revision_digest         VARCHAR(71) NOT NULL
compatibility_revision             VARCHAR(160) NOT NULL
trust_source                       VARCHAR(80) NOT NULL
managed_status                     VARCHAR(32) NOT NULL
compliance_status                  VARCHAR(32) NOT NULL
issued_at                          TIMESTAMPTZ NOT NULL
expires_at                         TIMESTAMPTZ NOT NULL
trust_evaluated_at                 TIMESTAMPTZ NOT NULL
challenge_id                       UUID NOT NULL
challenge_binding_digest           CHAR(64) NOT NULL
session_assertion_revision         VARCHAR(71) NOT NULL
session_assertion_digest           VARCHAR(71) NOT NULL
session_assertion_json             TEXT NOT NULL
device_trust_decision_revision     VARCHAR(71) NOT NULL
device_trust_decision_digest       VARCHAR(71) NOT NULL
device_trust_decision_json         TEXT NOT NULL
source_decision_digest             VARCHAR(71) NOT NULL
request_digest                     CHAR(64) NOT NULL
record_digest                      CHAR(64) NOT NULL
```

约束：

- composite FK `(challenge_id, challenge_binding_digest, verified_identity_id,
  identity_source_revision)` → exact Challenge Binding；
- `verified_identity_id` FK → `enterprise_verified_identity`；`device_id` FK → `enterprise_device`；
- named unique `uq_enterprise_session_token_digest (token_digest)` 与
  `uq_enterprise_session_challenge_issuance (challenge_id)`；
- claims profile/audience 为冻结常量；issuer/owner/source revision 长度有界；
- `device_source_revision >= 0`；managed/compliance 只允许既有冻结值；
- expiry > issued；trust evaluated ≤ issued；
- Wire digest 为 `^sha256:[a-f0-9]{64}$`，raw digest 为 `^[a-f0-9]{64}$`；
- permissions 与 Challenge Binding exact equality由 aggregate commit + load validator保证；
- JSON 必须 object、每份 UTF-8 bytes ≤ 32 KiB；canonical byte equality 与跨字段一致由 Converter验证；
- 不保存 bearer、handle、proof、signature、private key、Credential Reference、Authorization header 或
  Provider response。

非约束索引：

```text
ix_enterprise_session_lease_subject_expiry
ix_enterprise_session_lease_source_decision
```

### 5.5 v0010 manifest 与 exact history

`SchemaManifestLoader` 改为读取 v0010；`CentralSchemaPreflight` 必须接受且只接受：

```text
fresh B0010:                         {10}
B0009 → U0010:                       {9,10}
B0008 → U0009 → U0010:               {8,9,10}
B0007 → U0008 → U0009 → U0010:       {7,8,9,10}
B0006 → U0007 → U0008 → U0009 → U0010: {6,7,8,9,10}
legacy V1～V5 → U0006～U0010:         {1,2,3,4,5,6,7,8,9,10}
```

每一历史行的 script name、digest、release version 必须精确匹配。缺一行、多一行、未来行、unknown B/U、
digest drift、release drift 均 fail-closed。不得把旧 `validateV0009UpgradeHistory()` 简单套用后忽略 v0010；
应提取可验证 exact ancestor chain 的显式逻辑。

## 6. 聚合式 Persistence Port

### 6.1 新 Port

新增独立 Port，不扩大 legacy `AccessTokenIssuanceRepository`：

```text
EnterpriseSessionPersistence
  commitChallengeOutcome(DeviceChallenge, EnterpriseSessionChallengeBinding)
  loadChallengeById(challengeId)
  loadChallengeByCorrelationId(correlationId)
  loadChallengeForUpdate(challengeId)
  commitLeaseOutcome(EnterpriseSessionLeaseCommit)
  loadLeaseByTokenId(tokenId)
```

`EnterpriseSessionChallengeBundle` 必须同时包含 exact legacy `DeviceChallenge` 与 Binding；只有一侧存在时返回
typed corruption，不返回 Optional partial。

`EnterpriseSessionLeaseCommit` 只包含：

```text
expectedChallengeRecordDigest
expectedBindingDigest
consumedAt
consumedBy = enterprise_session_lease
requestDigest
issuance
```

它不接受 bearer、handle、proof、signature、token signing key 或 HTTP request object。

### 6.2 原子语义

- `commitChallengeOutcome`：Challenge + Binding 同一 transaction；两者都不存在时插入，两者 exact same 时
  幂等返回；必须要求 purpose=`enterprise_session_lease`、client/audience/device key/time 与 binding exact、
  binding digest等于 challenge digest，任何 partial/exact identity drift typed conflict；
- `commitLeaseOutcome`：在锁定 Challenge/Binding 后验证 expected digest，消费 Challenge并插入 immutable
  Lease；同时验证 Lease owner 与 referenced identity、device enterprise、Binding identity/source/client/
  audience/permissions 完全一致，任一步失败整体 rollback；
- same challenge exactly one Lease；same token ID/digest exact row可幂等 load，但不得借此重建 bearer；
- 不允许 Application 顺序调用 legacy Challenge Repository + Lease Repository 模拟聚合提交；
- EIPC-1.1.3 必须在同一 `CentralTransactionRunner.required()` decision closure 内使用 for-update load 与
  aggregate commit。

### 6.3 typed persistence errors

本批冻结私有错误码：

```text
persistence.enterprise_session_challenge_missing
persistence.enterprise_session_challenge_conflict
persistence.enterprise_session_challenge_corrupt
persistence.enterprise_session_binding_missing
persistence.enterprise_session_binding_conflict
persistence.enterprise_session_binding_corrupt
persistence.enterprise_session_lease_missing
persistence.enterprise_session_lease_conflict
persistence.enterprise_session_lease_corrupt
persistence.enterprise_session_partial_commit
```

这些错误不进入 public Error Contract；EIPC-1.1.3 负责映射用户可见 typed error，禁止泄漏表名、SQL、JSON、
identity/source material 或 stack。

## 7. Adapter 设计

### 7.1 InMemory Adapter

`InMemoryCentralPersistence` 同一批新增：

- challenge binding map；
- correlation、binding digest secondary indexes；
- lease issuance map；
- token digest、challenge issuance secondary indexes；
- 所有新 map/index 进入 transaction Snapshot/restore；
- aggregate method 采用 validate-all-before-mutate 或 `required()` rollback；
- load 与 MyBatis 共用同一个 strict validator，不能因“内存数据可信”跳过 digest校验。

### 7.2 MyBatis Adapter

新增独立：

```text
EnterpriseSessionChallengeBindingEntity
EnterpriseSessionLeaseIssuanceEntity
EnterpriseSessionEntityConverter
EnterpriseSessionPersistenceMapper
EnterpriseSessionMapper.xml
MyBatisEnterpriseSessionPersistence
```

- Mapper XML 所有列显式列出，不用 `SELECT *`；
- array 使用既有 `PostgresTextArrayTypeHandler`；
- timestamps 显式 UTC `OffsetDateTime` 转换；
- insert 使用 immutable `ON CONFLICT DO NOTHING`，0 row 时必须 load + exact compare，不能静默成功；
- for-update query 同时锁定 `device_challenge`、Binding，且固定锁顺序 Challenge → Binding → Lease；
- Adapter 通过 `CentralTransactionRunner.required()` 保证 aggregate write 原子；嵌套到 EIPC-1.1.3 外层
  REQUIRED transaction 时必须加入同一 transaction；
- config 一次性注册 Port + MyBatis Adapter，不能先改 Port 再留下 production Bean 缺失。

### 7.3 双 Adapter 一致性

同一 `EnterpriseSessionPersistenceConformance` 必须对：

```text
InMemoryCentralPersistence
MyBatisEnterpriseSessionPersistence + PostgreSQL
```

运行完全相同的 insert/load/idempotency/conflict/corruption/transaction/restart matrix。禁止为 InMemory 减少
约束、用测试分支跳过 canonical JSON 或把 MyBatis 特有失败当成功。

## 8. Migration、事务与恢复窗口

| 窗口 | 触发点 | 必须断言 |
| --- | --- | --- |
| M1 | B0010/U0010 script 执行后、ledger 前失败 | schema + ledger 同 transaction rollback，target 不存在 |
| M2 | ledger insert 后、commit 前失败 | 与 M1 相同，无半安装 |
| M3 | exact v0010 已安装后重复 install | `ALREADY_INSTALLED`，结构/digest 不变 |
| M4 | v0009 history 缺行/多行/digest drift | fail-closed，不执行 U0010 |
| P1 | Challenge 写入后、Binding 写入前失败 | 两者均不存在 |
| P2 | Challenge + Binding commit 后 response lost | durable pair exact 可读，不生成 Lease/bearer |
| P3 | 同 correlation 并发创建相同 material | exactly one row，另一方 exact-idempotent |
| P4 | 同 correlation/different digest | typed conflict，原事实不变 |
| P5 | Challenge consume 后、Lease insert 前失败 | consume rollback，Lease 不存在 |
| P6 | Lease insert 后、transaction commit 前失败 | consume + Lease 全 rollback |
| P7 | Lease commit 后 response lost | issuance可校验但无 bearer；不得提供 bearer replay API |
| P8 | 同 challenge 并发 Lease | exactly one commit；loser conflict/replay typed classification |
| P9 | Central restart / new MyBatis context | Challenge/Lease exact恢复，record digest一致 |
| P10 | indexed column/JSON/array/digest tamper | load/preflight fail-closed，不 fallback legacy token |
| P11 | InMemory outer transaction named failure | 新 map/index 全部 rollback，无 secondary index残留 |
| P12 | MyBatis commit failure | 两表/Challenge consumption/ledger atomic，不留 partial row |

本批 Harness 不签发 bearer，因此 P7 只证明“durable issuance 不包含 bearer且不能重建 response”，不宣称业务
response-loss 已闭环；完整 L1～L10 由 EIPC-1.1.3 负责。

## 9. Schema preflight 与启动顺序

Central production 顺序保持：

```text
DataSource
  → manifest v0010 load + sidecar/digest/canonical JSON
  → schema ledger exact-history validation
  → table/column/constraint/index preflight
  → MyBatis Persistence Bean ready
  → 其他 production service
```

- schema 不完整、太新、history 不受支持、constraint/index/column 缺失时 HTTP Ready 前失败；
- 不允许 ready 后后台补 migration；Central 仍不在启动时执行 deployment SQL；
- production Session endpoint仍未注册，即使 v0010 存在也不能标记 Session ready。

## 10. 敏感信息与安全边界

### 10.1 durable allowlist

允许持久化：

- opaque-free owner IDs、client ID、token ID；
- token digest（raw SHA-256），不含 bearer；
- source revisions、permissions、assertion/trust canonical documents；
- challenge binding、request、record digest；
- issued/evaluated/expires timestamps。

禁止持久化、记录或投影：

- access token / bearer / Authorization header；
- verified identity handle 或 handle digest；
- Device Proof signature、signed bytes、nonce以外的私钥材料；
- private/signing key、Credential Reference；
- HTTP body、stack、SQL parameter dump；
- API Key、个人模型 Credential、Endpoint。

### 10.2 扫描边界

focused Harness 使用显式随机 canary，至少扫描 test stdout/stderr、Harness evidence 与 failure evidence；本批
只对 Persistence 写入/输出证明不含敏感 material，不冒充 EIPC-1.3 的完整四通道多编码生产泄漏矩阵。

## 11. 文件修改范围

### 11.1 编码获授权后允许

- `services/central-service/deploy/sql/postgresql/**`：只新增 v0010 并更新 current README；
- `services/central-service/src/main/java/com/robothree/central/authentication/**`：仅 persistence domain/port；
- `services/central-service/src/main/java/com/robothree/central/persistence/**`；
- `services/central-service/src/main/resources/mybatis/**`；
- `services/central-service/src/test/**` 与 focused Harness；
- root script/package script、版本与治理文档。

### 11.2 明确禁止

- 修改 EIPC-1.1.1 `contracts/enterprise-session/v1alpha1/**` canonical bytes/digest；
- 修改 Enterprise Gateway v1alpha1/v1alpha2 或 EIPC-0 canonical bytes/digest；
- 修改 v0001～v0009 SQL/manifest/sidecar；
- 新增/修改 HTTP Controller、Security Filter、Token Codec、Handle Resolver、Lease Decision Service；
- Core/Main/Preload/Renderer/Desktop API/Central model gateway/Document Worker；
- EIPC-1.1.3 或任何下游 GATED 批次；
- 新依赖、根 tsconfig、`pnpm-lock.yaml`；
- 用 Fake identity/token codec 启用 production session。

如果实现发现必须修改上述禁止范围，必须立即停止并回文档评审，不能“顺手补齐”。

## 12. 实施步骤

### Step 1：冻结 Domain、digest 与 Port

- 实现两个 immutable domain record、record digest helper、strict validator；
- 实现 aggregate Port 与 typed errors；
- 用 EIPC-1.1.1 digest corpus验证 production Java canonical helper；
- focused unit tests先通过，不改 schema。

### Step 2：实现 v0010

- 从 exact B0009 生成完整 B0010，再 additive 增加 constraint/tables/indexes；
- U0010 只添加同一结构；
- 生成 canonical v0010 manifest + sidecar；
- 更新 loader/preflight/test installer 和 exact history；
- 验证 v0001～v0009 SHA-256 零漂移。

### Step 3：双 Adapter 一次交付

- InMemory maps/indexes/snapshot；
- Entity/Converter/Mapper XML/MyBatis Adapter/production bean；
- 共同 Conformance、atomic commit 与 corruption tests；
- 任何一侧未完成时整批不得标记 implemented。

### Step 4：Harness 与治理收口

- 新增 `harness:eipc1.1.2`；
- 串行运行 focused、Workspace、Central online、Central offline；
- 检查 canonical history、敏感扫描、资源归零、禁止范围；
- 更新版本/CHANGELOG/DEVELOPMENT-LOG，状态只能到独立 QA pending。

## 13. QA 验收矩阵（90 项）

### A. v0010 / manifest / history（1～18）

1. v0010 编码前占号仍空；
2. B0010 fresh 安装成功；
3. B0009 → U0010 成功；
4. B0008 → U0009 → U0010 成功；
5. B0007 链到 U0010 成功；
6. B0006 链到 U0010 成功；
7. legacy V1～V5 bridge 到 U0010 成功；
8. 六条 entry history structural snapshot完全一致；
9. v0010 重复 install 返回 already installed；
10. script digest drift拒绝；
11. manifest sidecar drift拒绝；
12. manifest 非 canonical JSON拒绝；
13. history 缺 v0009拒绝；
14. history 多未知版本拒绝；
15. v0009 B/U digest不受支持拒绝；
16. M1 script 后失败完整 rollback；
17. M2 ledger 后失败完整 rollback；
18. v0001～v0009 SQL/manifest/sidecar bytes/digest零漂移。

### B. Domain / digest / strict load（19～32）

19. Challenge Binding strict valid material；
20. handle/source revision不允许空；
21. permissions非空、有界、排序、唯一、含 configuration.read；
22. unknown permission拒绝；
23. raw/Wire digest表示法不可混用；
24. device source numeric revision与device revision digest分离；
25. Challenge record digest确定性；
26. Lease record digest确定性；
27. NFC文本跨实现一致；
28. array顺序进入 digest；
29. assertion revision/digest重算一致；
30. trust revision/digest重算一致；
31. source decision digest重算一致；
32. canonical JSON/indexed columns drift拒绝。

### C. InMemory/MyBatis 同一 Conformance（33～48）

33. Challenge + Binding aggregate insert；
34. Challenge ID load；
35. correlation ID load；
36. for-update bundle无 partial；
37. exact Challenge retry幂等；
38. same ID different binding conflict；
39. same correlation different digest conflict；
40. Binding FK identity mismatch拒绝；
41. Lease aggregate commit；
42. token ID load；
43. token digest uniqueness；
44. challenge only one issuance；
45. exact Lease retry只返回同一 durable fact；
46. same token different record conflict；
47. missing Challenge/Binding typed error；
48. InMemory与MyBatis error code一致。

### D. Atomicity / concurrency / restart（49～62）

49. P1 Challenge后失败两边rollback；
50. P2 Challenge outcome response loss exact恢复；
51. P3 same correlation并发exactly one；
52. P4 correlation digest冲突不覆盖；
53. P5 consume后失败rollback；
54. P6 issuance insert后失败rollback；
55. P7 commit后response loss无bearer replay；
56. P8 same challenge并发exactly one Lease；
57. lock顺序固定无反向锁；
58. InMemory outer transaction rollback含secondary indexes；
59. MyBatis commit failure无partial row；
60. PostgreSQL连接关闭/新context重开exact恢复；
61. two Central instance读同一PostgreSQL一致；
62. stale expected binding digest fail-closed。

### E. Corruption / security / boundary（63～74）

63. binding indexed column tamper拒绝；
64. lease indexed column tamper拒绝；
65. assertion JSON非 canonical拒绝；
66. trust JSON非 canonical拒绝；
67. assertion/indexed owner drift拒绝；
68. trust owner/assertion scope drift拒绝；
69. expiry/issued/trust evaluated drift拒绝；
70. record digest drift拒绝；
71. durable rows无 bearer/Authorization header；
72. durable rows无 handle/handle digest/proof/signature；
73. logs/evidence无敏感 canary；
74. public Contract/HTTP/Desktop surface零新增。

### F. 回归与正式门禁（75～90）

75. legacy `access_token_issuance` schema/Repository行为不变；
76. legacy Device Challenge消费幂等回归；
77. EIPC-1.1.1 TS corpus回归；
78. EIPC-1.1.1 Java conformance回归；
79. 六类 canonical digest回归；
80. Gateway v1alpha1/v1alpha2/EIPC-0 bytes/digest零漂移；
81. production Session endpoint仍不存在；
82. production handle resolver/token codec仍不存在；
83. `productionSessionEnabled=false`；
84. `productionIdentityReady=false`；
85. `identityCompositionBlockerClosed=false`；
86. `downstreamCodingUnlocked=false`；
87. focused Harness 输出仅 `EIPC112_POSTGRESQL_PERSISTENCE_CONFORMANT`；
88. Workspace `check` + 3 smoke通过；
89. Central online串行通过；
90. Central offline串行通过且无网络下载。

## 14. 正式门禁与证据

编码后至少串行执行：

```bash
CI=true pnpm run harness:eipc1.1.2
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true JAVA_HOME=<JDK21> pnpm run check:central
CI=true JAVA_HOME=<JDK21> pnpm run check:central:offline
```

正式 Harness evidence 必须包含：

```text
outcome = EIPC112_POSTGRESQL_PERSISTENCE_CONFORMANT
targetSchemaVersion = 10
supportedEntryPathCount = 2
legacyContractDriftCount = 0
legacySchemaDriftCount = 0
productionSessionEnabled = false
productionIdentityReady = false
identityCompositionBlockerClosed = false
downstreamCodingUnlocked = false
sensitiveOutputMatchCount = 0
```

Central/Harness 必须串行，禁止与其他 Testcontainers 集成测试并行争抢资源。失败必须保存不含敏感 material
的 failure evidence，禁止用自动重试覆盖首次失败。

## 15. 工期估算

| 工作 | 集中工程日 |
| --- | ---: |
| Domain / digest / aggregate Port | 1～1.5 |
| B0010/U0010/manifest/preflight/history | 1.5～2.5 |
| InMemory/MyBatis 双 Adapter | 2～3 |
| Conformance/恢复/篡改/Harness | 1.5～2.5 |
| 门禁、文档与独立 QA 返工余量 | 1～1.5 |
| 合计 | **7～11** |

该估算替代父计划对 EIPC-1.1.2 的旧 `3～5 日`。本文件形成时的 EIPC-1.1 / EIPC-1 总估算为
`15～24 / 29～47 日`；该历史估算现已由 EIPC-1.1.3.2 详细方案修正为 `30～48 / 44～71 日`。本批不把
真实企业联调、安全审批、独立 QA 或返工计入集中工程日。

## 16. 文档评审问题

1. 是否接受 G1 `identity_source_revision` 必须 durable；
2. 是否接受 G2 将 numeric source revision 与 Wire revision digest显式拆分；
3. 是否接受 G3 补齐 issuer/audience/trust source/status，以支持 load-time digest重算；
4. 是否接受两表 schema、composite FK、immutable + record digest边界；
5. 是否接受聚合 Port，而不是顺序调用多个 Repository模拟原子提交；
6. 是否接受 B0010 完整 baseline + U0010 exact v0009 history；
7. 是否接受 v0001～v0009 byte-for-byte零漂移；
8. 是否接受 bearer/handle/proof/signature完全不进 persistence；
9. 是否接受 90 项 QA、7～11 日估算与 Central串行门禁；
10. 是否存在新的 P0～P3、需要 ADR 或必须返回 Contract评审的事实。

## 17. 当前门禁

```text
EIPC-0                  PASS/CLOSED
EIPC-1 Plan             PASS/CLOSED
EIPC-1.0                PASS/CLOSED
EIPC-1.1 Plan           PASS/CLOSED
EIPC-1.1.1              PASS/CLOSED
EIPC-1.1.2              PASS/CLOSED
EIPC-1.1.3 Plan         PASS/CLOSED
EIPC-1.1.3.1            PASS/CLOSED
EIPC-1.1.3.2            IMPLEMENTED / INDEPENDENT QA PENDING
EIPC-1.1.3.3            GATED
EIPC-1.2～EIPC-1.3      GATED
EIPC-2～EIPC-3          GATED
STRM-3                  GATED
DFI-4A.4.1～4A.4.3      GATED
DFI-2B / DFI-3          GATED
TGM                     GATED
```

用户已接受 EIPC-1.1.2 独立 QA 结论并正式关闭本批。实现已完整交付 v0010、Persistence Domain/Port、
InMemory/MyBatis 双 Adapter、load-time revalidation、schema/history conformance 与正式 Harness；EIPC-1.1.3
计划评审已关闭，1.1.3.1 已完成独立 QA、用户接受并正式关闭；1.1.3.2 已完成授权范围的实现与开发者门禁，
现等待独立 QA；1.1.3.3 继续 `GATED`。
两个 identity blocker 继续保持打开。
