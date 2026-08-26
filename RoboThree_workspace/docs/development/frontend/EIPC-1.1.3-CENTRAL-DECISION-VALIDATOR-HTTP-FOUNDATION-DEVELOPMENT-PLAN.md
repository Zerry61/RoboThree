# EIPC-1.1.3 Central Decision / Validator / HTTP Foundation 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED；EIPC-1.1.3.1～EIPC-1.1.3.3 PASS/CLOSED；DORMANT FOUNDATION**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 上游：EIPC-1.1.1、EIPC-1.1.2 `PASS/CLOSED`；EIPC-1.1 计划 `PASS/CLOSED`  
> 当前 blocker：`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity composition blocker 继续成立

## 0. 结论边界

EIPC-1.1.3 不是“补两个 HTTP Controller”的胶水批次。它负责把 EIPC-1.1.1 已冻结的
`enterprise-session.v1alpha1` Wire Contract 与 EIPC-1.1.2 已交付的 PostgreSQL v0010 Persistence，接成一条
可校验、可事务回滚、可保持 legacy 行为的 Central Foundation：

```text
handle-bound Challenge
  -> locked Central decision
  -> same-transaction Session Lease encode / consume / persist
  -> strict Session Token validation
  -> legacy/session common authorization
  -> conditionally disabled HTTP foundation
```

本批最高允许输出：

```text
EIPC113_SESSION_HTTP_FOUNDATION_CONFORMANT
```

并必须同时保持：

```text
productionSessionEnabled = false
productionIdentityReady = false
identityCompositionBlockerClosed = false
downstreamCodingUnlocked = false
```

不得输出 `EIPC1_ENTERPRISE_INTEGRATION_ADAPTER_READY`、`IDENTITY_COMPOSITION_READY`，也不得注册一个依赖
Fake handle resolver、Fake token codec、固定 userId 或测试 signing key 的 production endpoint。

## 1. 当前代码事实

### 1.1 已存在并直接复用

- EIPC-1.1.1 已冻结两个 POST operation、strict request/response、`eipc.session-token.v1` claims、typed error、
  六类 canonical digest 与 TS/Java conformance；本批不得修改其 canonical bytes 或 digest；
- EIPC-1.1.2 已交付 Central v0010、immutable Challenge Binding / Lease Issuance、聚合式
  `EnterpriseSessionPersistence`、InMemory/MyBatis 双 Adapter 与 load-time strict revalidation；
- `CentralTransactionRunner.required()` 在生产使用 Spring `PROPAGATION_REQUIRED`，Persistence 内层调用可加入
  Application 外层事务；
- `VerifiedIdentityRepository.findByIdForUpdate()`、`EnterpriseDeviceRepository.findByIdForUpdate()`、
  `EnterprisePermissionRepository`、`CompatibilityEvaluator`、`DeviceProofVerifier` 与既有 security policy 可复用；
- `EnterpriseBearerTokenFilter` 当前只提取 bearer，不 decode、不记录；该职责继续保持；
- `ConfigurationReadService` 与 `RoboThreeModelInvocationAccessAuthorizer` 当前直接依赖 legacy
  `RoboThreeAccessTokenValidator`；本批通过 common authorizer 接缝实现 additive dual profile，不复制授权规则；
- legacy `RoboThreeAccessTokenService` 目前在事务外 encode、事务内重检和提交。它是历史路径，本批不改写其
  wire、claims、issuance 或时序，只为新 Session Lease 建立独立的原子路径。

### 1.2 本批必须解决的缺口

| 编号 | 当前事实 | EIPC-1.1.3 冻结处理 |
| --- | --- | --- |
| G1 | 尚无 production `VerifiedIdentityHandleResolver` | 只定义严格 Port 与 test adapter；production implementation 留 EIPC-1.2 |
| G2 | 尚无 `EnterpriseSessionTokenCodec` production signer/validator | 只定义 Port、claims 与 test codec；production implementation 留 EIPC-1.2 |
| G3 | 尚无 handle-bound Challenge Application service | 新增独立 service，handle 不落盘、不进入日志 |
| G4 | 尚无同事务 Session Lease decision | encode、challenge consume、issuance insert 必须在同一 transaction closure |
| G5 | assertion/trust/source decision 目前只有 persistence material | 新增 Central-private assembler，复用一份 canonical material/digest 实现 |
| G6 | legacy/session token 没有 common authorizer | 新增两个完整 validator branch，恰好一个成功才授权 |
| G7 | HTTP Foundation 尚不存在 | 条件注册；默认关闭；production 依赖缺失时请求启用必须启动失败 |
| G8 | numeric source revision 与 Wire digest 容易混写 | 明确四层表示和两个 Central-private source digest 公式 |
| G9 | legacy expired 等错误语义可能被 composite 抹平 | 只依据已完成 cryptographic verification 的 branch result 保留 typed expiry |
| G10 | EIPC-1.1.2 没有保存 bearer/handle/proof | 本批保持该边界，不新增 bearer journal 或 replay API |

## 2. 子批拆分与门禁

EIPC-1.1.3 拆成三个必须串行、独立 QA、独立用户接受的子批。本文评审通过不自动授权任何子批编码。

### EIPC-1.1.3.1：Decision Domain / Ports / Canonical Material（4～6 日）

> 实现状态：**PASS/CLOSED**。实施证据见
> [EIPC-1.1.3.1 实施报告](./EIPC-1.1.3.1-DECISION-DOMAIN-PORTS-CANONICAL-MATERIAL-REPORT.md)。

- Central-private strict Session claims、Assertion material、Trust material、Source Decision material；
- `VerifiedIdentityHandleResolver`、`EnterpriseSessionTokenCodec`、`EnterpriseBearerAuthorizer` Port；
- source revision/digest、request digest、claims digest 的唯一 canonical 实现；
- deterministic test-only resolver/codec，不进入 production dependency graph；
- 不注册 HTTP、不签发 production bearer、不修改现有 consumer。

最高输出：

```text
EIPC1131_DECISION_DOMAIN_CONFORMANT
```

### EIPC-1.1.3.2：Transactional Challenge / Session Lease（11～18 日）

> 编码权威方案见
> [EIPC-1.1.3.2 Transactional Challenge / Session Lease 详细方案](./EIPC-1.1.3.2-TRANSACTIONAL-CHALLENGE-SESSION-LEASE-DEVELOPMENT-PLAN.md)。
> 实现与独立 QA 已由用户接受，状态为 **PASS/CLOSED**。

- handle-bound Challenge service；
- same-transaction Session Lease service + assembler；
- proof、identity、device、permission、compatibility 的锁定与重检；
- Challenge consume + immutable Lease issuance 的聚合原子提交；
- C1～C7、L1～L11 并发、崩溃与 response-loss Harness；
- 不注册 production HTTP、不改 legacy consumers。

最高输出：

```text
EIPC1132_TRANSACTIONAL_SESSION_LEASE_CONFORMANT
```

### EIPC-1.1.3.3：Validator / Common Authorizer / Conditional HTTP（10～16 日）

> 编码权威方案候选见
> [EIPC-1.1.3.3 Validator / Common Authorizer / Conditional HTTP 详细方案](./EIPC-1.1.3.3-VALIDATOR-COMMON-AUTHORIZER-CONDITIONAL-HTTP-DEVELOPMENT-PLAN.md)。
> 方案评审、实现、独立 QA 与用户接受均已完成，当前为 **PASS/CLOSED / DORMANT FOUNDATION**。
> 实施证据见
> [EIPC-1.1.3.3 实施报告](./EIPC-1.1.3.3-VALIDATOR-COMMON-AUTHORIZER-CONDITIONAL-HTTP-IMPLEMENTATION-REPORT.md)。

- strict Session Token validator；
- legacy/session common authorizer 与“恰好一个成功”规则；
- Configuration/Model Gateway consumer additive 接缝；
- 两个 conditional HTTP Controller、body limit、no-store 与 safe error mapper；
- production activation gate、architecture scan、全量 regression/Harness。

详细拆解后本子批估算修正为 **10～16 日**，替代早期 5～8 日估算。

最高输出：

```text
EIPC113_SESSION_HTTP_FOUNDATION_CONFORMANT
```

EIPC-1.1.3 新估算为 **25～40 个集中工程日**，替代父计划旧 5～8 日。EIPC-1.1 合计修正为
**35～56 日**；EIPC-1 总估算修正为 **49～79 日**。不含独立 QA、返工、真实 OA/MDM/
Secure Enclave signing adapter、EIPC-1.2/1.3 或现场联调。

## 3. Decision Domain 与私有 Port

### 3.1 Verified Identity handle authority

新增 Central-private Port：

```text
VerifiedIdentityHandleResolver
  resolveForChallenge(opaqueHandle)
  resolveForLeaseForUpdate(opaqueHandle, expectedIdentitySourceRevision)

ResolvedVerifiedIdentityHandle
  verifiedIdentityId
  identitySourceRevision
```

规则：

- handle 只在 HTTP request 的有界 byte/string 与 resolver 局部内存存在；禁止落入 Challenge Binding、Lease
  Issuance、log、trace、metrics、exception message 或 Evidence；
- Controller/Main/Renderer/OS user、固定 userId、“数据库只有一行”均不是 authority；
- Challenge 与 Lease 的两次 resolve 必须得到同一 `verifiedIdentityId + identitySourceRevision`；任一漂移返回
  `enterprise_identity_handle_drift`；
- test adapter 必须位于 test source set，production source/dependency graph 静态扫描必须证明其不可达；
- production resolver 不在本批实现。没有 production resolver 时 feature 必须保持 disabled。

### 3.2 Session Token claims 与 Codec Port

新增独立于 legacy `RoboThreeAccessTokenCodec` 的 Port：

```text
EnterpriseSessionTokenCodec
  encode(EnterpriseSessionTokenClaims, SessionSigningKeyHandle) -> compact bearer
  decodeAndVerify(compact bearer, expectedIssuer, expectedAudience) -> verified claims
```

约束：

- `claimsProfile` 必须精确等于 `eipc.session-token.v1`；
- encode/decode 不接受 legacy claims，不扩展 legacy permission enum；
- signing key 只能用 opaque handle；Port 不提供 `getPrivateKey/export`；
- compact bearer 只在 transaction 局部变量、HTTP response bytes 和 validator request 局部变量存在；
- test codec 只允许 test source set，必须显式 `testIdentityUsed=true` 且永远不能令
  `productionIdentityReady=true`；
- production codec 与受控 signing key 留 EIPC-1.2，本批 feature 默认 disabled。

### 3.3 Common authorization Port

```text
EnterpriseBearerPrincipal
  claimsProfile
  enterpriseId / userId / deviceId / clientInstanceId
  tokenId
  permissions[]
  issuedAt / expiresAt

EnterpriseBearerAuthorizer
  authorize(bearer, requiredPermission, now)
```

实现分层：

- `LegacyBearerAuthorizerAdapter` 完整调用既有 legacy validator 与 issuance 校验；
- `EnterpriseSessionTokenValidator` 完整校验 Session signature、claims、v0010 issuance、record/digest、expiry；
- `CompositeEnterpriseBearerAuthorizer` 不读未验证 JWT header/payload 来选择 branch；
- 两个 branch 都必须完成自己的 cryptographic + durable validation，再由 composite 判断；
- consumer 只接收 common principal，不接收 raw claims、assertion/trust JSON 或 handle。

### 3.4 Composite 的唯一成功与 error 规则

branch result 是 strict discriminated union：

```text
success(principal)
invalid
expired(verifiedProfile)
unavailable(typedSafeCode)
```

组合规则：

1. 恰好一个 `success`：返回该 principal；
2. 两个 `success`：`access_token_profile_ambiguous`，绝不猜一个；
3. 零 `success`，且恰好一个 branch 已完成签名/issuance 验证后判定 expired、另一个是 invalid：保留
   `access_token_expired`，避免 legacy 语义漂移；
4. 零 `success` 且无上述已验证 expiry：`access_token_invalid`；
5. branch `unavailable` 不得被另一个 invalid 掩盖为成功或 fallback；production session branch 未启用时它根本不
   安装，而不是返回一个伪 invalid；
6. permission 在 common principal 上统一检查，缺失返回 `permission_denied`。

## 4. Canonical material 与 digest

统一使用 UTF-8、NFC、canonical JSON、键按 Unicode code point 排序、array 顺序保留、UTC RFC3339
millisecond。Wire digest 使用 `sha256:<64 lowercase hex>`；PostgreSQL raw digest 使用 64 lowercase hex；
numeric source revision 使用 `BIGINT`；opaque handle/revision 不得冒充 digest。

### 4.1 Device source revision digest

```text
deviceRevisionDigest = sha256(
  "robothree.enterprise-session.device-source-revision.v1\n" +
  canonicalJson({
    enterpriseId, deviceId, deviceKeyId, publicKeyDigest,
    trustSource, managedStatus, complianceStatus,
    deviceSourceRevision
  })
)
```

`deviceSourceRevision` 精确来自 locked `EnterpriseDevice.revision()`；digest 不代替 numeric optimistic lock。

### 4.2 Permission source revision digest

```text
permissionRevisionDigest = sha256(
  "robothree.enterprise-session.permission-source-revision.v1\n" +
  canonicalJson({
    enterpriseId, userId,
    permissions: [{ permission, enabled, sourceRevision, updatedAt }]
  })
)
```

permission rows 按 permission ASCII 升序。digest 必须覆盖本次请求全集及 `configuration.read`；不得只覆盖最终
granted enum，从而遗漏被拒或 drift 的源事实。

### 4.3 Compatibility revision

当前 `CompatibilityEvaluator.CompatibilityDecision.revision()` 是 locked numeric revision。EIPC-1.1.3 首期
映射固定为其十进制 ASCII：

```text
compatibilityRevision = Long.toString(lockedDecision.revision())
```

不得把 numeric revision 伪装成 digest，也不得建立第二套 Compatibility state。若上游 revision 类型变化，必须
回 Contract/Architecture 评审，不在 Adapter 内静默转换。

### 4.4 Lease request digest

```text
leaseRequestDigest = rawSha256(
  "robothree.enterprise-session.lease-request.v1\n" +
  canonicalJson({
    schemaVersion, claimsProfile, challengeId, challengeBindingDigest,
    currentClientInstanceId, audience, requiredPermissions,
    deviceKeyId, correlationId
  })
)
```

明确排除 opaque handle、proof/signature、bearer、tokenDigest、tokenId、private key、Credential Reference。
Challenge 单次消费与 binding digest 提供业务幂等边界；禁止为“证明输入相同”持久化 proof 或 signature hash。

### 4.5 单一 assembler

新增 `EnterpriseSessionDecisionAssembler`，只接受已锁定、已校验的完整 material，同时生成：

- `EnterpriseSessionAssertion` canonical JSON / revision / digest；
- `EnterpriseDeviceTrustDecision` canonical JSON / revision / digest；
- `sourceDecisionDigest`；
- `EnterpriseSessionTokenClaims`；
- `EnterpriseSessionLeaseIssuance` 与 HTTP safe response material。

Assembler 与 EIPC-1.1.2 load validator 必须共用同一 canonical material/digest helper。禁止 Service、Persistence、
Controller 各自拼 JSON 或各自重算一套公式。

## 5. Handle-bound Challenge 决策

### 5.1 固定执行顺序

Challenge service 在一个 `CentralTransactionRunner.required()` closure 内：

1. strict validate request、size、audience、permission set、correlation；
2. resolve opaque handle，得到 verified identity id + source revision；
3. `findByIdForUpdate` 锁 identity，校验 active/enterprise/user/source revision；
4. 以公开 `deviceKeyId` lookup device，再以 `deviceId` for-update 锁定并复核 key/enterprise/owner；
5. 重检 managed/compliant 与真实 Device Trust source；
6. 锁定并验证 requested permissions；token permission 不由 request 自报；
7. 锁定 compatibility，必须 compatible；
8. 生成有界 nonce/challenge、binding 与所有 canonical digest；
9. `commitChallengeOutcome(challenge, binding)` 原子提交；
10. transaction 返回 safe challenge response material；Controller 只 strict mapping。

两次 device lookup 后必须比较 `deviceId/deviceKeyId/revision`，防止非锁定 lookup 与 locked row 不一致。Challenge
阶段的 permission/trust/compatibility 只用于早期失败；Lease 阶段必须全部重新锁定，不能复用旧决定。

### 5.2 Challenge 并发与 recovery（C1～C7）

| 窗口 | 发生点 | 结果 |
| --- | --- | --- |
| C1 | handle resolve 前 | 零 durable fact，可重试 |
| C2 | handle resolve 后、identity lock 前 | 零 durable fact；source drift 失败关闭 |
| C3 | identity/device lock 后、commit 前 | transaction rollback，零 challenge/binding |
| C4 | challenge/binding commit 后 response lost | challenge 可按原 binding 使用到 expiry；不得返回或猜新 nonce |
| C5 | 同 correlation 同 digest 并发 | 一个 canonical challenge；另一个 typed replay/conflict，不创建第二 binding |
| C6 | 同 correlation 不同 digest | `enterprise_session_conflict` |
| C7 | Central restart | 从 v0010 load + strict revalidation；corrupt row fail-closed |

## 6. Same-transaction Session Lease

### 6.1 固定 11 步

以下 11 步必须全部位于同一个 `CentralTransactionRunner.required()` closure：

1. strict validate request/body；局部读取 handle/proof/signature；
2. `loadChallengeForUpdate()` 锁 Challenge + Binding，校验 pending/expiry/digest；
3. resolve handle，再锁 identity，验证 verifiedIdentityId、identitySourceRevision、active owner tuple；
4. 锁 device，重检 key、owner、source revision、managed/compliant/trust；
5. 用 locked public key 验证 proof，精确绑定 challenge/client/audience/device/correlation；
6. 锁 permission rows，验证 requested subset 与 `configuration.read`；
7. 锁 compatibility decision，必须 compatible；
8. assembler 一次性生成 assertion/trust/source decision/claims/issuance；
9. `EnterpriseSessionTokenCodec.encode()` 在 transaction 内生成 bearer，只保留局部变量；
10. `commitLeaseOutcome()` 原子 consume challenge + insert immutable issuance；
11. transaction 返回 response material；Controller 只做 strict mapping，不追加、不重选、不重算。

`now` 在 closure 内只采样一次；issuer/audience/token TTL/skew 复用现有 `AccessTokenSecurityPolicy` 的单一配置
来源，新 claims profile 不建立第二套 TTL 时钟。

### 6.2 禁止的半事务实现

禁止：

- 事务外先 encode，再进事务重检；
- 事务内写 issuance，事务后拼 assertion/trust；
- proof 成功后先 consume challenge，再单独写 issuance；
- commit 失败后返回已经 encode 的 bearer；
- response loss 后按 tokenId/binding 找回或重放 bearer；
- nested Repository 顺序写模拟 `EnterpriseSessionPersistence.commitLeaseOutcome()`；
- retry transaction 时复用上一次未提交的 bearer bytes。

### 6.3 Lease / recovery 窗口（L1～L11）

| 窗口 | 发生点 | 恢复语义 |
| --- | --- | --- |
| L1 | request validate/handle resolve 前 | 零副作用 |
| L2 | Challenge lock 后、identity lock 前 | rollback；challenge pending |
| L3 | proof verify 后、assembler 前 | rollback；challenge pending |
| L4 | assembler 后、encode 前 | rollback；零 bearer/issuance |
| L5 | bearer encode 后、commit 前 | rollback；bearer清除局部引用，不外发、不落盘 |
| L6 | consume + issuance commit 后 response lost | 不 replay bearer；新 challenge 重新 issue |
| L7 | 同 challenge 并发 | exactly one commit；loser replay/conflict |
| L8 | identity/device/permission/compatibility drift | commit 前失败关闭；challenge不消费 |
| L9 | DB commit failure | challenge consume/issuance整体 rollback |
| L10 | Central restart | issuance 可验证，但不能重建/下载 bearer |
| L11 | transaction callback 被框架重入/重试 | 每次 fresh encode；只允许一次 durable winner，未提交 bearer均不可见 |

## 7. Session Token Validator

### 7.1 验证顺序

`EnterpriseSessionTokenValidator` 固定执行：

1. bearer size/shape 上限；
2. codec 完整 signature、issuer、audience、profile 验证；
3. strict claims validation、时间和 permission enum；
4. `loadLeaseByTokenId()`；不存在即 invalid；
5. token raw digest 与 durable `token_digest` timing-safe equality；
6. claims 与 issuance indexed facts 逐字段一致；
7. v0010 load validator 重算 assertion/trust/source-decision/record digest；
8. identity/client/device/permission/compatibility revision 精确一致；
9. expiry 只在前述验证成立后投影为 verified-profile expired；
10. 返回 common principal，不返回 raw token/assertion/trust JSON。

### 7.2 Validation / recovery（V1～V8）

| 窗口 | 结果 |
| --- | --- |
| V1 malformed/oversized bearer | invalid，decode 前拒绝 |
| V2 bad signature/issuer/audience/profile | invalid |
| V3 valid signature、issuance missing | invalid，不 fallback |
| V4 token digest mismatch | invalid/tamper |
| V5 claims/issuance mismatch | invalid/tamper |
| V6 row/canonical digest corrupt | invalid/tamper |
| V7 verified token expired | typed `access_token_expired` |
| V8 validator dependency unavailable | typed unavailable，不能降级 legacy |

## 8. Common Authorizer 消费接缝

本批只把 Central 内部 consumer 从具体 legacy validator 改为 `EnterpriseBearerAuthorizer`：

- `ConfigurationReadService`；
- `RoboThreeModelInvocationAccessAuthorizer`；
- 后续同类受保护 endpoint 由 architecture test 枚举，禁止遗漏后形成双重策略。

约束：

- `EnterpriseBearerTokenFilter` 继续只提取，不 decode、不缓存、不记录 bearer；
- legacy-only production composition 的行为和 error 必须字节/语义回归一致；
- session branch 默认不安装，因此本批完成后现有生产只走 legacy branch；
- 不改 Gateway v1alpha1/v1alpha2 request/response、cache semantics 或 permission 规则；
- `personal_model.configure` 只在 verified Session principal 中出现，不进入 legacy claims。

## 9. Conditional HTTP Foundation

### 9.1 路由与 body limit

只实现 EIPC-1.1.1 已冻结的：

```text
POST /enterprise-session/v1alpha1/device-challenges
POST /enterprise-session/v1alpha1/session-leases
```

固定上限：

- Challenge request JSON：16 KiB；
- Lease request JSON：32 KiB（包含有界 proof/signature）；
- Challenge response JSON：32 KiB；
- Lease response JSON：64 KiB；
- Content-Type 必须为 JSON；成功与失败均 `Cache-Control: no-store`；
- 禁 request/response body access log、trace attribute、metrics label、exception echo。

### 9.2 Controller 职责

Controller 只做：

- body byte limit 与 strict Wire parse；
- 调用 Application service；
- strict response projection；
- typed safe error + HTTP status mapping；
- no-store header。

Controller 不做 handle resolve、permission/trust/compatibility 决策、digest、token encode、transaction、retry 或
错误 fallback。

### 9.3 Typed error mapping

只使用已冻结 error enum。至少冻结：

- invalid/drift handle：401/409；
- challenge expired/replayed：409；
- bad proof/device mismatch：401；
- not managed/not compliant/permission denied/compatibility incompatible：403；
- session unavailable：503，`retryable=false` 除非明确无副作用且 Contract 已允许；
- internal：500，固定用户语言摘要，不回显内部异常、SQL、handle、proof、token 或 owner tuple。

错误 Evidence 只允许 typed code、operation、计数、safe correlation digest；禁止 raw correlationId、handle、
challenge nonce、signature、bearer、tokenId 或本地/数据库路径。

## 10. Production activation 与 blocker

新增独立 feature property，默认 `false`：

```text
robothree.enterprise-session.enabled=false
```

状态机只有三种：

1. property=false：Session Controller/validator branch 不注册；legacy 正常 ready；
2. property=true 但任一 production dependency 缺失：启动在 HTTP ready 前 fail-closed，不得静默只少一个 endpoint；
3. property=true 且 resolver、codec/signing key、v0010、trust/proof/permission/compatibility 全部是 production
   dependency：该状态留 EIPC-1.2/1.3 证明，本批不能宣称。

本批完成后，production resolver 与 codec 仍缺失，因此必须保持：

```text
productionSessionEnabled=false
productionIdentityReady=false
identityCompositionBlockerClosed=false
downstreamCodingUnlocked=false
```

Architecture test 必须：

- 扫描 production source/dependency graph，证明 test resolver/codec/Fake signing key 不可达；
- 证明默认 application context 无两个 Session endpoint；
- 证明显式 enabled 但依赖缺失时启动失败，而不是用 Fake 自动补齐；
- 证明没有 fixed activeUserId、OS user 或“单行数据库”作为 resolver fallback；
- 证明 EIPC-1.2～1.3、EIPC-2～3、Desktop/Renderer 没有被本批解锁。

## 11. Security 与敏感信息边界

### 11.1 允许进入 durable store

- v0010 已定义的 Challenge/Binding/Lease indexed facts；
- token raw digest；
- canonical assertion/trust/source-decision JSON 与 digest；
- request digest、record digest、timestamps、typed status。

### 11.2 禁止进入 durable/log/evidence

- bearer 明文、opaque verified identity handle；
- proof/signature 或其 hash；
- private key、signing key material、Credential Reference；
- challenge nonce、tokenId、owner tuple 的原值；
- HTTP body、Authorization header；
- exception stack、SQL bind values、未脱敏内部路径。

### 11.3 有界内存与清理

- bearer、handle、proof/signature 只在最小局部生命周期持有；
- Java `String` 不宣称可可靠清零；设计目标是避免复制、禁止 `toString()`/日志/缓存、及时释放引用；
- byte[]/char[] 若由本批直接持有，finally `fill(0)`；不得声称 JVM/HTTP 容器内部副本可枚举或可靠清零；
- response loss 不通过 durable bearer journal 修复；安全边界优先于无感重放。

本批只做正常路径与固定 marker 的安全扫描，不冒充 EIPC-1.3 的四通道 × 多编码完整泄漏矩阵。

## 12. 允许与禁止文件范围

### 12.1 子批获单独授权后允许

- `services/central-service/src/main/java/**/authentication/**` additive Session Domain/Application/Port；
- `services/central-service/src/main/java/**/shared/**` common authorizer 接缝；
- `ConfigurationReadService` 与 `RoboThreeModelInvocationAccessAuthorizer` 的最小依赖倒置；
- Central conditional HTTP/controller/configuration；
- Central InMemory/MyBatis/transaction conformance tests（不新增 schema）；
- `scripts/**` focused Harness/Evidence；
- tests、版本和治理文档（仅对应获授权子批收口）。

### 12.2 明确禁止

- 修改 `contracts/enterprise-session/v1alpha1/**` canonical bytes/digest；
- 修改 Gateway v1alpha1/v1alpha2 或 EIPC-0 canonical Contract；
- migration v0001～v0010、创建 v0011；
- production OA/SSO/MDM、production handle resolver、production Session token codec/signing key；
- Local Credential Store、Device Signer、Core Token Provider、Runtime composition；
- Main/Preload/Renderer、Desktop API、登录 UI、个人模型 UI；
- EIPC-1.2～1.3、EIPC-2～3、STRM-3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM；
- bearer replay/download/refresh journal；
- 新依赖、根配置或 `pnpm-lock.yaml`，除非停手回文档评审并获用户授权。

若实现发现必须修改禁止范围，立即停止并回文档评审；不得先改 Port/半个 Adapter 或留编译失败的半切换。

## 13. QA 验收矩阵（108 项）

### 13.1 Decision Domain / Digest（1～18）

1. Session claims strict；2. common principal strict；3. handle result strict；4. branch result discriminated union；
5. unknown field拒绝；6. permission唯一/排序；7. `configuration.read` 必含；8. profile固定；9. issuer/audience固定；
10. owner/client exact；11. device source digest；12. permission source digest；13. compatibility decimal mapping；
14. lease request digest；15. NFC；16. canonical key order；17. Wire/raw/numeric/opaque分离；18. sensitive exclusion。

### 13.2 Handle-bound Challenge（19～34）

19. handle不解析；20. resolver test-only；21. resolve drift；22. identity inactive；23. identity owner mismatch；
24. device lookup+for-update exact；25. device key drift；26. not managed；27. not compliant；28. permission denied；
29. compatibility incompatible；30. challenge/binding原子；31. C1/C2；32. C3/C4；33. C5/C6；34. C7 corrupt reload。

### 13.3 Transactional Lease（35～56）

35. 11步同 transaction；36. single now；37. challenge exact lock；38. handle second resolve；39. identity source exact；
40. device revision exact；41. proof exact；42. permissions re-lock；43. compatibility re-lock；44. assembler单一实现；
45. encode位于 closure；46. consume+issuance聚合；47. L1/L2；48. L3/L4；49. L5 bytes不外发；50. L6 no replay；
51. L7 exactly one；52. L8四类 drift；53. L9 rollback；54. L10 restart；55. L11 fresh encode；56. no bearer journal。

### 13.4 Validator / Composite（57～76）

57. malformed bound；58. bad signature；59. wrong issuer；60. wrong audience；61. wrong profile；62. issuance missing；
63. token digest timing-safe；64. claims/indexed exact；65. canonical reload；66. verified expiry；67. dependency unavailable；
68. legacy success；69. session success；70. exactly one success；71. double success ambiguous；72. zero success invalid；
73. verified legacy expired preserved；74. no unverified payload routing；75. permission on principal；76. session disabled branch absent。

### 13.5 HTTP / Activation（77～92）

77. only two POST routes；78. challenge 16KiB；79. lease 32KiB；80. response bounds；81. JSON only；82. no-store success；
83. no-store error；84. strict request mapping；85. strict response mapping；86. typed status mapping；87. safe internal error；
88. default endpoints absent；89. enabled+missing dependency startup fail；90. Fake graph不可达；91. production flags四项false；
92. blocker保持打开。

### 13.6 Regression / Security / Gates（93～108）

93. legacy token Contract零漂移；94. legacy claims enum零漂移；95. legacy issuance零漂移；96. legacy expiry语义；
97. ConfigurationRead legacy回归；98. Model Gateway v1alpha1回归；99. Model Gateway v1alpha2回归；
100. bearer不落盘；101. handle不落盘；102. proof/signature不落盘；103. log/trace/metrics敏感0；
104. EIPC-1.3完整泄漏矩阵未被冒充；105. no v0011/migration drift；106. no Core/Desktop/Renderer drift；
107. no dependency/lockfile drift；108. focused、Workspace、Central online/offline严格串行全绿。

## 14. 验证命令与 Evidence

每个获授权子批至少串行执行：

```text
CI=true pnpm run harness:eipc1.1.3
CI=true pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

前两个子批可新增 focused command；EIPC-1.1.3.3 必须聚合三个子批的真实结果。正式 Harness 与 Central
online/offline 不并行，不以自动 retry 覆盖首次失败。

Evidence 只允许：outcome、test/count、schema version、legacy drift count、typed error count、resource count、
canonical evidence digest、四个 false flag。禁止 bearer、handle、proof/signature、tokenId、challenge nonce、
owner tuple、PID/端口/墙钟/路径进入 semantic digest。

## 15. 文档评审问题

1. 是否接受 EIPC-1.1.3 拆为 1.1.3.1～1.1.3.3 串行独立门禁；
2. 是否接受 source revision 两个 Central-private digest 公式及 compatibility decimal mapping；
3. 是否接受 Session bearer encode 必须位于同一 DB transaction closure；
4. 是否接受 response loss 后不 replay bearer、重新 challenge/issue；
5. 是否接受 common authorizer“两个 branch 完整验证、恰好一个成功”；
6. 是否接受 verified-profile expiry 才能保留 `access_token_expired`；
7. 是否接受 filter 仍 extract-only、consumer 改依赖 common authorizer；
8. 是否接受 default disabled，显式 enabled 但依赖不足时启动失败；
9. 是否接受本批不新增 v0011、不修改 canonical Contract、不实现 production resolver/codec；
10. 是否存在 P0～P3 或必须新增 ADR 的问题。

## 16. 当前门禁

```text
EIPC-0                         PASS/CLOSED
EIPC-1 Plan                    PASS/CLOSED
EIPC-1.0                       PASS/CLOSED
EIPC-1.1 Plan                  PASS/CLOSED
EIPC-1.1.1                     PASS/CLOSED
EIPC-1.1.2                     PASS/CLOSED
EIPC-1.1.3 Plan                PASS/CLOSED
EIPC-1.1.3.1                   PASS/CLOSED
EIPC-1.1.3.2                   PASS/CLOSED
EIPC-1.1.3.3                   PASS/CLOSED / DORMANT FOUNDATION
EIPC-1.2～EIPC-1.3             DEFERRED / OUT OF CURRENT RELEASE
EIPC-2～EIPC-3                 DEFERRED / OUT OF CURRENT RELEASE
STRM-3                         GATED
DFI-4A.4.1～DFI-4A.4.3         GATED
DFI-2B / DFI-3                 GATED
TGM                            GATED
```

EIPC-1.1.3 计划及 1.1.3.1～1.1.3.3 已完成实现、独立 QA 与用户接受并正式关闭。该阶段作为默认关闭的
dormant foundation 保留；不得以其关闭解除任何 identity blocker。EIPC-1.2～EIPC-3 已移出当前版本，
后续若恢复必须重新确认真实 SSO/企业身份输入、范围和编码授权。
