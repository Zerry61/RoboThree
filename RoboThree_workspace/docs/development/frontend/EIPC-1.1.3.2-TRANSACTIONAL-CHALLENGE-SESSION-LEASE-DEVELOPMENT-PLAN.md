# EIPC-1.1.3.2 Transactional Challenge / Session Lease 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED；IMPLEMENTED / INDEPENDENT QA PENDING**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 上游：EIPC-0、EIPC-1.0、EIPC-1.1.1、EIPC-1.1.2、EIPC-1.1.3.1 `PASS/CLOSED`  
> blocker：`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity composition blocker 继续打开

## 0. 结论与本轮门禁

本文件冻结 EIPC-1.1.3.2 的实现边界、事务时序、并发/恢复语义与 QA。用户已明确授权本批编码，
实现与开发者门禁已完成，现等待独立 QA；Contract canonical bytes、migration v0001～v0010、Central
production composition、HTTP、Core 与 Desktop 均未越界。

本批未来获单独编码授权后的最高输出只能是：

```text
EIPC1132_TRANSACTIONAL_SESSION_LEASE_CONFORMANT
```

且必须同时保持：

```text
productionSessionEnabled = false
productionIdentityReady = false
identityCompositionBlockerClosed = false
downstreamCodingUnlocked = false
```

它证明的是：在 test-only resolver/codec/signing handle 下，handle-bound Challenge 与 Session Lease 的
Central Application/Persistence 事务语义成立。它不证明真实企业身份输入、production signer、Session HTTP、
Runtime composition 或个人模型接口 ready。

## 1. 目标与非目标

### 1.1 目标

1. 实现 Central-private `IssueEnterpriseSessionChallengeService`；
2. 实现 Central-private `IssueEnterpriseSessionLeaseService`；
3. Challenge 在单一 transaction closure 中锁定 identity/device/requested permissions/compatibility，并原子提交
   `DeviceChallenge + EnterpriseSessionChallengeBinding`；
4. Lease 在单一 transaction closure 中完成 Challenge lock、handle 二次解析、identity/device/permission 重检、
   proof 验证、canonical decision material、bearer encode、Challenge consume 与 immutable Lease issuance；
5. 新增唯一的 `EnterpriseSessionDecisionAssembler`，复用 v0010 canonical/digest helper；
6. 补齐 requested-permission exact lock、Session signing handle authority 与 correlation 并发收敛接缝；
7. 用 InMemory/MyBatis 同一 conformance 与真实 PostgreSQL transaction Harness 证明 C1～C7、L1～L11。

### 1.2 明确非目标

- 不实现 EIPC-1.1.3.3 Validator/Common Authorizer/HTTP；
- 不注册 `/enterprise-session/v1alpha1/**` production Controller；
- 不实现 production `VerifiedIdentityHandleResolver`、`EnterpriseSessionTokenCodec` 或 signing key provider；
- 不实现 OA/SSO/MDM、Local Credential Store、Device Signer、Core Token Provider、Runtime Active composition；
- 不修改 `contracts/enterprise-session/v1alpha1/**` canonical bytes；
- 不新增 v0011，不改 v0001～v0010；
- 不修改 Main/Preload/Renderer、Desktop API 或个人模型 UI；
- 不实现 bearer refresh、download、replay 或 durable bearer journal；
- 不关闭两个 identity blocker，不输出 `IDENTITY_COMPOSITION_READY`。

## 2. 当前代码事实与必须关闭的缺口

### 2.1 已存在并直接复用

1. `CentralTransactionRunner.required()` 已存在；Spring 实现为 `PROPAGATION_REQUIRED`，InMemory 实现具备
   snapshot/rollback；
2. v0010 已提供 `EnterpriseSessionPersistence` 聚合 Port、Challenge/Binding 与 Lease Issuance durable facts；
3. MyBatis/InMemory 的 `commitChallengeOutcome()` 与 `commitLeaseOutcome()` 已实现聚合原子提交和 load-time
   strict revalidation；
4. `VerifiedIdentityRepository.findVerifiedIdentityByIdForUpdate()`、
   `EnterpriseDeviceRepository.findByIdForUpdate()`、`DeviceProofVerifier`、`EnterpriseDeviceTrustProvider`、
   `CompatibilityEvaluator` 已存在；
5. EIPC-1.1.3.1 已冻结 strict handle、Session claims、decision digest、resolver/token codec Port；
6. `EnterpriseSessionPersistenceDigests` 与 `EnterpriseSessionPersistenceValidator` 已是 v0010 canonical 事实和
   load validator 的唯一基线；
7. `FrozenCompatibilityEvaluator` 是可信 startup snapshot，不是数据库行；因此本批不得伪称对 compatibility
   加数据库锁，只能在 transaction closure 内取得并绑定其 revision。

### 2.2 编码前冻结的结构缺口

| 编号 | 当前事实 | 冻结解法 |
| --- | --- | --- |
| G1 | `EnterprisePermissionRepository` 只有全部 enabled 查询；不能证明 requested set 中的 disabled/missing fact | additive `findRequestedForUpdate(enterpriseId,userId,orderedPermissions)`；单次有序 `FOR UPDATE` 查询，返回存在的 enabled/disabled rows；缺行或 disabled 均 typed deny |
| G2 | legacy `RoboThreeAccessTokenService` 在 transaction 外 encode bearer | 新 Session service 禁止复用该时序；`tokenCodec.encode()` 必须位于外层 `CentralTransactionRunner.required()` closure 内 |
| G3 | Session signing handle 没有 Central-private authority Port | additive `EnterpriseSessionSigningKeyHandleProvider.requireCurrent()`；只返回 opaque/redacted handle；production implementation 保持 0，test-only deterministic provider 不得进入 production graph |
| G4 | Challenge correlation 并发只能依赖 unique constraint | Application 先按 correlation 读取并做 exact intent 比对；并发 insert loser 在 transaction 失败后只允许 strict reload 同一 correlation，exact match 返回同一个 persisted challenge，不同 material typed conflict |
| G5 | 没有 Session Decision Assembler | 新增单一 assembler，分 `prepareDecision()` 与 `finalizeIssuance(tokenDigest)` 两阶段，但共享一个 immutable prepared material，禁止 Service/Persistence 各拼一套 JSON |
| G6 | production resolver/codec/signer 缺失 | 保持缺失；focused Harness 只注入 test source adapter，architecture scan 必须证明 production implementation count 仍为 0 |
| G7 | compatibility 不是数据库 row | 在 transaction 内读取 frozen snapshot revision；不得新增假 `FOR UPDATE`、不得把 client 自报 revision 当权威 |
| G8 | Challenge safe replay 语义未展开 | 同 correlation + 同 resolved identity/source revision + 同 normalized intent，只返回原 persisted challenge；永不生成第二 nonce；不同 intent 返回 `enterprise_session_conflict` |
| G9 | Java `String` bearer/proof 不可可靠清零 | 不复制、不日志、不缓存、不持久化；byte/char array 若由本批直接持有则 finally 清零；文档不宣称 JVM 内部副本可清零 |

### 2.3 G1 的 Port 与 Adapter 原子边界

新增：

```java
List<EnterpriseUserPermission> findRequestedForUpdate(
    String enterpriseId,
    String userId,
    List<String> orderedPermissions);
```

约束：

- `orderedPermissions` 必须非空、唯一、ASCII 排序、≤32，且包含 `configuration.read`；
- MyBatis 必须使用一次有界 `permission IN (...) ORDER BY permission FOR UPDATE`，禁止 N 次逐行查询造成锁顺序漂移；
- 返回存在的 enabled/disabled rows，不得预先过滤 disabled；
- Application 要求返回 permission 名称与请求集合完全一致，缺行即 `permission_denied`；
- 任一 row `enabled=false` 即 `permission_denied`；
- 只有完整且全部 enabled 的 rows 才可进入 `permissionRevisionDigest()`；
- Port + mapper + MyBatis + InMemory + 两者 conformance 必须同一完整交付，不留半切换。

编码实现注记：仓库既有 `CentralAlignment2aArchitectureTest` 禁止 MyBatis 动态 `<foreach>`。
因此生产 Mapper 使用单次静态 PostgreSQL
`permission = ANY(text[]) ORDER BY permission FOR UPDATE`，并通过既有 `PostgresTextArrayTypeHandler`
传入已校验的有序唯一权限集。该实现与本节冻结的“单次有界 `IN (...)`”语义等价，
不改变锁顺序、disabled/missing 事实可见性或 fail-closed 语义。

## 3. Application Contract 与 authority 边界

### 3.1 Challenge command/result

Central-private command 严格镜像已冻结 Wire request：

```text
opaqueHandle
currentClientInstanceId
audience
orderedRequiredPermissions
deviceKeyId
correlationId
```

结果只包含已冻结 Challenge response 的 safe material：

```text
challengeId
nonce
issuedAt / expiresAt
audience
currentClientInstanceId
allowedAlgorithms
challengeDigest
```

command/result 均为 Application-private；本批不创建 HTTP DTO 或 Controller mapping。

### 3.2 Lease command/result

Lease command 严格镜像已冻结 Wire request：

```text
opaqueHandle
currentClientInstanceId
audience
orderedRequiredPermissions
DeviceProof(challengeId/deviceKeyId/algorithm/signature/signedAt)
correlationId
```

结果包含一次性局部 response material：

```text
accessToken
expiresAt
sessionAssertion
deviceTrustDecision
compatibilityRevision
sourceDecisionDigest
```

`accessToken` 不进入 command digest、durable facts、exception、log、metrics、Evidence 或 `toString()`。

### 3.3 权威来源

- handle 只交给 `VerifiedIdentityHandleResolver`，Application 不解析其 payload；
- Challenge 与 Lease 均以 resolver 返回的 `verifiedIdentityId + identitySourceRevision` 为第一层 authority；
- Lease 必须将二次 resolve 结果与 persisted Binding 精确比较；
- identity owner tuple 来自 locked `VerifiedEnterpriseIdentity`；
- device owner/key/revision 来自 lookup 后再 `findByIdForUpdate()` 的 locked row；
- permission 来自 G1 exact locked rows；
- compatibility 来自 frozen production snapshot，不接受请求自报；
- signing handle 来自 `EnterpriseSessionSigningKeyHandleProvider`，不得由 Controller/request/env 临时拼接。

## 4. Handle-bound Challenge 固定时序

### 4.1 单一 transaction closure

以下步骤必须位于一个外层 `CentralTransactionRunner.required()` closure：

1. 单次采样 `now`（UTC millisecond），strict validate command/audience/permission/correlation；
2. resolve opaque handle；handle 不进入 log/digest/durable；
3. 按 correlation 读取 existing bundle；若存在，按 §4.2 做 exact replay/conflict；
4. `findVerifiedIdentityByIdForUpdate()`，校验 active、expiry 与 resolved identity/source revision；
5. `findByKeyId(enterpriseId, deviceKeyId)`，随后 `findByIdForUpdate(deviceId)`；比较 deviceId/key/revision/
   publicKeyDigest/enterprise owner，任一漂移 fail-closed；
6. `requireTrusted(lockedDevice, now)`，校验 managed/compliant；
7. G1 `findRequestedForUpdate()`，要求 requested rows 完整且全部 enabled；
8. `compatibility.requireCompatible(currentClientInstanceId)`，绑定 frozen revision；
9. 生成 256-bit nonce、fresh challengeId、固定 `ES256`、bounded expiry；
10. 生成 `DeviceChallenge + EnterpriseSessionChallengeBinding`，复用 v0010 digest helper；
11. `commitChallengeOutcome()` 原子提交；
12. 从 committed bundle 投影 safe result，transaction 返回。

Challenge TTL 复用现有 `AuthenticationSecurityPolicy.challengeTtl()`；audience 必须同时匹配 frozen Contract
与可信 policy。TTL、issuer/audience 不建立第二套配置时钟。

### 4.2 correlation exact replay

existing bundle 只在以下全部相同时可重放原 persisted safe Challenge：

- resolved verifiedIdentityId；
- identitySourceRevision；
- currentClientInstanceId；
- audience；
- orderedRequiredPermissions；
- deviceKeyId；
- correlationId；
- claimsProfile/purpose；
- bundle strict validator 与 record digest 均通过；
- Challenge 仍 pending 且未过期。

exact replay 返回原 challengeId/nonce/timestamps/digest，不生成新 entropy。已消费、已过期、corrupt 或 material
不同均不返回 nonce，使用 typed replay/expired/conflict。

并发 unique conflict 的 loser 不得自动重跑整段业务。允许在原 transaction 已确定 rollback 后，做一次 strict
reload；exact match 按上述语义返回，否则 typed conflict。禁止 sleep、轮询或自动 retry 掩盖竞争。

## 5. Transactional Session Lease 固定时序

### 5.1 单一 transaction closure 的 13 步

以下步骤必须全部位于同一个外层 `CentralTransactionRunner.required()` closure：

1. 单次采样 `now`（UTC millisecond），strict validate command/size/profile/audience/permission/proof；
2. `loadChallengeForUpdate(challengeId)` 锁完整 bundle，执行 strict load validator；
3. 校验 purpose、pending、expiry、client/audience/permission/device/correlation 与 proof context；
4. `resolveForLeaseForUpdate(handle, binding.identitySourceRevision)`；
5. `findVerifiedIdentityByIdForUpdate()`，精确校验 id/source revision/active/owner/identity digest；
6. device key lookup 后 `findByIdForUpdate()`，精确校验 owner/key/public key/revision/managed/compliant；
7. 用 locked public key 调用 `DeviceProofVerifier`，绑定 challenge/client/audience/device/correlation；
8. G1 exact lock requested permission rows，要求完整、全部 enabled，并计算 permission revision digest；
9. `requireTrusted(lockedDevice, now)`；取得 frozen compatibility decision，并绑定 canonical decimal revision；
10. 生成 fresh tokenId；Assembler `prepareDecision()` 一次性生成 assertion/trust/source-decision/claims material；
11. 从 signing handle provider 取得 opaque handle，在 transaction 内调用 `tokenCodec.encode()`；校验 bearer
    shape/size，计算 raw token digest；
12. Assembler `finalizeIssuance()` 只向同一 prepared material补 token digest/record digest；调用
    `commitLeaseOutcome()` 原子 consume Challenge + insert immutable issuance；
13. 只有 commit 成功后 transaction 才返回局部 response material；Controller mapping 留 1.1.3.3。

### 5.2 Token encode 与 transaction 边界

- `tokenCodec.encode()` 必须在 `required()` callback 中被调用，source/architecture test 要扫描调用点；
- encode 之前不创建可外发 bearer；commit 之前不把 bearer赋给 callback 外对象；
- encode/commit 任一异常，transaction rollback，方法不得返回 token；
- `CentralTransactionRunner` 本批不新增 retry；若未来 runner 引入重入，每次 callback 必须 fresh tokenId、fresh
  encode，禁止复用上次未提交 bearer；
- signing handle 仅为 opaque reference，不进入 issuance/request digest/log/evidence；
- 本批 test-only codec/provider 必须处于 test source set，production graph count 保持 0。

### 5.3 Decision Assembler 两阶段但单一事实源

`EnterpriseSessionDecisionAssembler` 允许两个方法，只为解决 token digest 在 encode 后才存在的时序：

```text
prepareDecision(locked full material) -> PreparedDecision
finalizeIssuance(PreparedDecision, tokenDigest) -> LeaseOutcome
```

约束：

- `PreparedDecision` immutable，包含所有已锁定 identity/device/permission/trust/compatibility/binding/request facts；
- `prepareDecision()` 生成 canonical assertion JSON/revision/digest、trust JSON/revision/digest、
  sourceDecisionDigest 与 `EnterpriseSessionTokenClaims`；
- `finalizeIssuance()` 不重新查询、不重新选择、不重算不同业务 material，只追加 tokenDigest 与 lease recordDigest；
- assembler 与 v0010 load validator 共用 `EnterpriseSessionPersistenceDigests`；
- Service/Persistence/test fixture 禁止手写第二套 canonical JSON；
- constructed issuance 必须在 commit 前通过同一个 `EnterpriseSessionPersistenceValidator.validateLease()`。

## 6. Request digest、Secret 与 Receipt 语义

### 6.1 Lease request digest

继续使用 `EnterpriseSessionDecisionDigests.leaseRequestDigest()`，只绑定：

```text
schemaVersion / claimsProfile / challengeId / challengeBindingDigest /
currentClientInstanceId / audience / orderedRequiredPermissions /
deviceKeyId / correlationId
```

明确排除：opaque handle、proof/signature、proof hash、bearer、token digest、tokenId、signing handle。

proof 是当次认证证据，必须真实验证，但不是 durable business intent；禁止通过持久化 proof hash“增强幂等”。

### 6.2 durable 与非 durable

允许 durable：v0010 已定义 Challenge/Binding/Lease facts、token raw digest、canonical assertion/trust/source
decision、request/record digest、timestamps。

禁止 durable：bearer、opaque handle、proof/signature 或其 hash、signing/verification handle、private key、HTTP body。

### 6.3 response loss

- Challenge response loss：同 correlation exact replay 可返回原 persisted Challenge，不生成第二 nonce；
- Lease response loss：durable issuance 只能证明曾成功签发，不能恢复 bearer；原 Challenge 已消费；必须新建
  correlation、新 Challenge、新 Lease；
- 不提供按 tokenId/challengeId 下载或重放 bearer 的 API；
- 不以 `tokenDigest` 反推或验证用户是否收到 bearer。

## 7. 并发与恢复窗口

### 7.1 Challenge C1～C7

| 窗口 | 触发点 | 预期 |
| --- | --- | --- |
| C1 | validate/handle resolve 前 | 零 durable fact，可显式重试 |
| C2 | handle resolve 后、identity lock 前 | rollback；source drift fail-closed |
| C3 | identity/device/permission 决策后、commit 前 | rollback；零 Challenge/Binding |
| C4 | commit 后 response lost | exact correlation replay 返回原 persisted Challenge；不生成新 nonce |
| C5 | 同 correlation 同 intent 并发 | exactly one durable bundle；loser 一次 strict reload 后得到同一 bundle |
| C6 | 同 correlation 不同 intent | typed `enterprise_session_conflict`，不泄漏原 nonce |
| C7 | Central restart/corrupt row | strict reload；完整可读，partial/tamper fail-closed |

### 7.2 Lease L1～L11

| 窗口 | 触发点 | 预期 |
| --- | --- | --- |
| L1 | validate/handle resolve 前 | 零副作用 |
| L2 | Challenge lock 后、identity lock 前 | rollback；Challenge pending |
| L3 | proof verify 后、assembler 前 | rollback；Challenge pending |
| L4 | prepareDecision 后、encode 前 | rollback；零 bearer/issuance |
| L5 | encode 后、commit 前 | rollback；bearer 不外发、不落盘 |
| L6 | consume+issuance commit 后 response lost | 不 replay bearer；新 Challenge 重新 issue |
| L7 | 同 Challenge 并发 | exactly one commit；loser replay/conflict |
| L8 | identity/device/permission/compatibility drift | commit 前 fail-closed；Challenge 不消费 |
| L9 | DB commit failure | consume 与 issuance 整体 rollback |
| L10 | Central restart | issuance strict 可验证；bearer不可恢复/下载 |
| L11 | transaction callback 重入 | 每次 fresh tokenId/encode；只有一个 durable winner |

### 7.3 锁顺序

统一锁顺序：

```text
Challenge + Binding
→ VerifiedIdentity
→ EnterpriseDevice
→ requested Permission rows (ASCII order)
→ immutable Compatibility snapshot read
→ aggregate Challenge/Lease commit
```

Challenge 创建没有 existing Challenge lock 时，从 VerifiedIdentity 开始。任何 Adapter/Service 不得反向获取
Permission 后再锁 identity/device。MyBatis 与 InMemory conformance 必须验证同序。

## 8. 实施步骤（未来获权后）

### Step 1：Locked source 与 assembler foundation（3～5 日）

- G1 exact permission lock Port/Mapper/InMemory/MyBatis 同批交付；
- G3 signing handle provider Port + test-only provider；
- strict internal command/result；
- `EnterpriseSessionDecisionAssembler` prepare/finalize；
- canonical/conformance focused tests。

### Step 2：Handle-bound Challenge（3～5 日）

- Challenge service 与 transaction closure；
- correlation exact replay/conflict；
- C1～C7 failpoint 与 InMemory/MyBatis/PostgreSQL conformance；
- restart/corrupt bundle 验证。

### Step 3：Transactional Lease 与 closure Harness（5～8 日）

- 13 步 Lease transaction；
- proof、drift、encode-inside-closure、aggregate commit；
- L1～L11、response loss/no replay、fresh encode；
- focused Harness/Evidence 与完整门禁。

合计估算：**11～18 个集中工程日**，不含独立 QA、返工和用户验收。该估算替代父计划原 6～10 日；增加量
来自代码事实复核后确认的 exact permission locking 双 Adapter、signing handle authority、correlation 并发收敛
与真实 transaction recovery Harness，不是功能范围扩张。

用户已在计划评审 `PASS/CLOSED` 后单独授权 EIPC-1.1.3.2 编码，Step 1～3 已按冻结边界完成。该授权不延伸到
EIPC-1.1.3.3 或任何下游批次。

## 9. 文件边界

### 9.1 获单独编码授权后允许

- `services/central-service/src/main/java/**/authentication/application/**` additive Session service/assembler；
- `services/central-service/src/main/java/**/authentication/port/**` G1/G3 additive Port；
- `AuthenticationPersistenceMapper`、`AuthenticationMapper.xml` 的 exact requested permission lock；
- `MyBatisAuthenticationPersistence` 与 `InMemoryCentralPersistence` 对应完整 Adapter；
- Central test source 的 deterministic resolver/codec/signing provider；
- Central tests、`scripts/**` focused Harness/Evidence；
- 对应版本与治理文档（只在编码批收口时）。

### 9.2 明确禁止

- `contracts/enterprise-session/v1alpha1/**`；
- v0001～v0010、v0011 或任何新 migration；
- legacy Gateway Contract/claims/endpoint；
- EIPC-1.1.3.3 Validator/Common Authorizer/HTTP；
- production resolver/codec/signing adapter 或真实 enterprise secret；
- EIPC-1.2～1.3、EIPC-2～3、STRM-3；
- Core/Main/Preload/Renderer/Desktop API；
- DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM；
- 新依赖、根配置、`pnpm-lock.yaml`。

若实现发现必须修改禁止范围，立即停止并回文档评审；不得先改 Port、单个 Adapter 或 migration 留下半切换。

## 10. QA 验收矩阵（96 项）

### 10.1 Locked source / Ports（1～16）

1. requested permissions strict；2. ASCII order；3. duplicate拒绝；4. configuration.read必含；5. ≤32；
6. single bounded SQL；7. `FOR UPDATE`；8. disabled row返回；9. missing row可检测；10. owner exact；
11. InMemory/MyBatis同矩阵；12. lock order；13. signing handle脱敏；14. test provider仅test source；
15. production provider count 0；16. Port/Adapters无半切换。

### 10.2 Assembler / Digest（17～32）

17. prepare immutable；18. finalize只补 token fact；19. assertion canonical；20. trust canonical；
21. source decision；22. claims exact；23. permission revision含 enabled/sourceRevision/updatedAt；
24. device revision；25. compatibility decimal；26. request digest exact；27. handle排除；28. proof/signature排除；
29. signing handle排除；30. token digest raw；31. record digest重算；32. load validator共用。

### 10.3 Challenge（33～52）

33. strict command；34. single now；35. handle不解析；36. identity lock；37. source revision exact；
38. device lookup+lock；39. device drift；40. trust/managed/compliant；41. exact permission lock；
42. compatibility snapshot；43. 256-bit nonce；44. ES256 fixed；45. bounded TTL；46. aggregate commit；
47. exact replay same nonce；48. different intent conflict/no nonce；49. C1/C2；50. C3/C4；51. C5/C6；52. C7。

### 10.4 Transactional Lease（53～78）

53. 13 steps same closure；54. single now；55. bundle strict lock；56. pending/expiry；57. second resolve；
58. identity exact；59. device exact；60. proof exact；61. permission relock；62. trust relock；
63. compatibility revision；64. fresh tokenId；65. signing handle authority；66. encode inside closure；
67. bearer bound；68. aggregate consume+insert；69. L1/L2；70. L3/L4；71. L5 no exposure；72. L6 no replay；
73. L7 exactly one；74. L8 drift；75. L9 rollback；76. L10 restart；77. L11 fresh encode；78. no bearer journal。

### 10.5 Security / Recovery / Evidence（79～90）

79. bearer不落盘；80. handle不落盘；81. proof/signature不落盘；82. sensitive不进 exception；
83. sensitive不进 log/trace/metrics；84. challenge nonce不进 Evidence；85. owner/tokenId不进 Evidence；
86. InMemory rollback；87. PostgreSQL rollback；88. restart strict reload；89. corrupt row fail-closed；
90. 本批不冒充 EIPC-1.3 完整泄漏矩阵。

### 10.6 Regression / Gates（91～96）

91. frozen Contract digest零漂移；92. v0001～v0010零漂移且无v0011；93. legacy token回归；
94. no HTTP/Core/Desktop/Renderer drift；95. no dependency/lockfile drift；
96. focused、lint、Workspace、Central online/offline严格串行全绿。

## 11. 验证命令与 Evidence

未来编码后至少严格串行执行：

```text
CI=true pnpm run harness:eipc1.1.3.2
CI=true pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

不得并行 Central online/offline，不以自动 retry 覆盖首次失败。若发生既有环境偶发，报告必须保留首次事实，
从零复跑并说明因果边界。

Evidence 只允许 outcome、test/count、transaction/recovery typed count、schema version、canonical drift count、
production implementation count、sensitive match count、resource count、evidence digest 与四个 false flag。

禁止 bearer、handle、proof/signature、nonce、tokenId、owner tuple、SQL bind、PID/端口/墙钟/路径进入 Evidence
或 semantic digest。

## 12. 文档评审问题

1. 是否接受 G1 requested-permission exact lock，并要求 Port + MyBatis + InMemory 同批交付；
2. 是否接受 Challenge 同 correlation/same intent 返回原 persisted Challenge、不同 intent typed conflict；
3. 是否接受新增 Central-private signing handle provider，但 production implementation 继续为 0；
4. 是否接受 assembler prepare/finalize 两阶段只是 token digest 时序需要，仍为单一 canonical 事实源；
5. 是否接受 bearer encode 必须位于同一 DB transaction closure；
6. 是否接受 Lease response loss 后永不 replay bearer，只能 fresh Challenge/Lease；
7. 是否接受 compatibility 是 frozen snapshot revision，不伪称数据库 lock；
8. 是否接受本批不注册 HTTP、不实现 Validator/Common Authorizer；
9. 是否接受估算由 6～10 日修正为 11～18 日；
10. 是否存在 P0～P3 或必须回到公共 Contract/ADR 的问题。

## 13. 当前状态

```text
EIPC-0                         PASS/CLOSED
EIPC-1 Plan                    PASS/CLOSED
EIPC-1.0                       PASS/CLOSED
EIPC-1.1 Plan                  PASS/CLOSED
EIPC-1.1.1                     PASS/CLOSED
EIPC-1.1.2                     PASS/CLOSED
EIPC-1.1.3 Plan                PASS/CLOSED
EIPC-1.1.3.1                   PASS/CLOSED
EIPC-1.1.3.2                   IMPLEMENTED / INDEPENDENT QA PENDING
EIPC-1.1.3.3                   GATED
EIPC-1.2～EIPC-1.3             GATED
EIPC-2～EIPC-3                 GATED
STRM-3                         GATED
DFI-4A.4.1～DFI-4A.4.3         GATED
DFI-2B / DFI-3                 GATED
TGM                            GATED
```

两个 identity blocker 继续打开。EIPC-1.1.3.2 已按用户明确授权完成实现和开发者自测，当前只能进入独立 QA；
独立 QA 与用户接受前不得标记 `PASS/CLOSED`，不得自动进入 EIPC-1.1.3.3。
