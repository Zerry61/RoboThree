# EIPC-1 Enterprise Integration Production Adapter 详细实施方案

> 状态：**EIPC-1.1 FOUNDATION PASS/CLOSED / DORMANT；EIPC-1.2～EIPC-1.3 DEFERRED / OUT OF CURRENT RELEASE**  
> 日期：2026-08-23  
> 负责人：Codex 5.6  
> 上游：EIPC-0 `PASS/CLOSED`；`AUTHORITY_SEMANTICS_FROZEN`  
> 后续门槛：EIPC-2、EIPC-3 同步 `DEFERRED / OUT OF CURRENT RELEASE`；真实 SSO 恢复前不得编码

本方案定义 EIPC-1 的生产身份集成 Adapter、版本化跨语言 Contract、企业 Credential/Device Signer
边界及验证方式。计划评审已经用户接受；EIPC-1.0 docs + Spike Preflight 已完成独立 QA、用户接受并正式
`PASS/CLOSED`，其结论仍为 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`。EIPC-1.1 计划评审
已经用户接受并关闭；EIPC-1.1.1 Canonical Contract 与 Cross-language Conformance 的独立 QA 已由用户
接受并正式关闭。EIPC-1.1.2 PostgreSQL v0010 + Persistence 已完成实现、独立 QA 与用户接受并正式关闭；
EIPC-1.1.3 计划与 1.1.3.1～1.1.3.3 已完成实现、独立 QA 与用户接受并正式关闭。EIPC-1.1 作为默认关闭的
dormant foundation 保留；Local Credential Adapter、真实 SSO、Runtime identity composition、Main、Preload
与 Renderer 身份接线未进入编码。按 2026-08-24 用户决策，EIPC-1.2～EIPC-1.3 不再属于当前版本。

EIPC-1 的最高允许输出是：

```text
EIPC1_ENTERPRISE_INTEGRATION_ADAPTER_READY
```

如果缺少真实企业身份输入、受控 Credential bootstrap、目标平台 Device Signer 或必要安全授权，必须输出：

```text
BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION
```

两种输出都不能宣称 `IDENTITY_COMPOSITION_READY`。该结论只能由 EIPC-3 给出。

## 1. 阶段目标

EIPC-0 已冻结 owner、activation、current transport 三类身份，Session rebind、offline 2/3、token permission
与 activated policy 双重 entitlement，以及 authority snapshot 的 canonical 语义。EIPC-1 不重复这些算法，
而是补齐它们尚缺的真实来源：

1. 以版本化语言中立 Contract 取得同一次 Token issuance 对应的可信 Session Assertion 与 Device Trust Decision；
2. 实现 Core-private `EnterpriseAccessTokenProvider` production adapter；
3. 冻结并实现 `EnterpriseCredentialStore` 与 `EnterpriseDeviceSigner` 的目标平台边界；
4. 保证 bearer、identity credential、device key handle、签名原文不进入普通业务状态；
5. 让 EIPC-2 可以组合 Runtime Active authority，而不是继续依赖 fixed/Fake owner；
6. 在真实企业系统或安全输入未获授权时明确阻断，不以测试身份冒充 production ready。

EIPC-1 不是登录 UI、个人模型 UI、SSO 产品上线或 Runtime authority composition 批次。

## 2. 当前代码事实

### 2.1 已存在且直接复用

- `eipc.v1alpha1` strict Contract 已定义 Session Assertion、Device Trust Decision、Runtime Active Source、
  Session Binding 与 Authority Snapshot；
- `materializeEnterpriseAuthoritySnapshot()` 已冻结 scope、digest、offline 2/3 与 entitlement 交集；
- Core 已有 `EnterpriseAccessTokenProvider` Port、`EnterpriseConfigurationTokenSession` 及 HTTP configuration/
  model gateway consumers；
- Central 已有 Verified Identity、Device Challenge/Proof、Device Trust、Permission、Compatibility、Token
  issuance、Token validation 与 PostgreSQL persistence foundation；
- Central Token issuance 已在一个事务中重检 identity、device、permission、compatibility，消费 challenge
  并写入 issuance；
- Enterprise Gateway `v1alpha1` 已有 Token、Access Token Claims、Challenge/Proof、Enrollment 与 typed error
  Schema/Fixture；
- CGF-1.3 已冻结四种离线状态，不需要 EIPC-1 新增离线租约、设备失联阈值或实时撤销。

### 2.2 实际缺口

| 编号 | 当前事实 | 影响 |
| --- | --- | --- |
| A1 | Core 只有 `EnterpriseAccessTokenProvider` Port，没有 production adapter | 无法建立可信 current session |
| A2 | Local 没有 production `EnterpriseCredentialStore` | 无法安全持有 verified identity/refresh/client/device handle |
| A3 | Local 没有 production `EnterpriseDeviceSigner` | 无法完成真实 Device Challenge proof |
| A4 | Central `AccessTokenClaims` permission 白名单没有 `personal_model.configure` | 不能满足 EIPC-0 的 token permission 交集 |
| A5 | `/v1alpha1/token` 只返回 bearer 与 `expiresAt` | Local 不能从响应安全构造 scope、permissions、assertion revision 或 trust decision |
| A6 | 现有 Token Contract 没有把同一次 issuance 的 Session Assertion 与 Device Trust Decision 作为版本化结果返回 | Core 若解析/猜测 bearer claims 会越过可信边界 |
| A7 | 现有 Enterprise Gateway `v1alpha2` 明确只版本化 Model Invocation cache sidecar，不版本化 identity | 禁止把 EIPC 字段静默塞进既有 `v1alpha2` |
| A8 | Desktop production root 仍没有真实企业 identity credential/bootstrap 输入 | 即使 Adapter 写完也不能自动宣称 production ready |
| A9 | 当前测试只使用 Fake Device Signer/Fake identity | 可以做 conformance，不能关闭生产授权缺口 |

因此，原父计划对 EIPC-1 的 `6～10 日` 估算不足，不能继续沿用。

## 3. 关键架构决策

### 3.1 不改写既有 Enterprise Gateway v1alpha1/v1alpha2

以下既有版本保持原样：

- Enterprise Gateway `v1alpha1` Token/Claims/Configuration/Model Gateway；
- Enterprise Gateway `v1alpha2` Model Invocation cache sidecar；
- Desktop Local `v1alpha1/v1alpha2`；
- EIPC-0 已发布 canonical Fixture 与 digest。

EIPC-0 的 `enterprise-identity-composition/v1alpha1` 继续保持 strict、非 Secret、零改写。EIPC-1 另建
`enterprise-session/v1alpha1` Wire Contract，由 Enterprise Gateway host 承载，但不与 Gateway
`v1alpha1/v1alpha2` 或 EIPC semantic schema 共用版本号。这样既满足“additive Gateway identity protocol
revision”，又不会把 bearer 塞进非 Secret EIPC family，或把 `personal_model.configure` 塞进旧 Claims enum。

### 3.2 Session Lease 必须是同一次 Central 决策的原子结果

建议新增版本化操作：

```text
POST /enterprise-session/v1alpha1/session-leases
```

请求只包含：

```text
kind = enterprise_session_lease_request
schemaVersion = enterprise-session.v1alpha1
verifiedIdentityHandle
currentClientInstanceId
audience
requiredPermissions[]
deviceProof
correlationId
```

约束：

- `verifiedIdentityHandle` 是受控 opaque handle，不是 enterpriseId/userId 自报；
- request 不接收 enterpriseId、userId、deviceId、entitlement、trust decision 或 compatibility decision；
- `requiredPermissions` 首期穷尽并固定上限；
- `deviceProof` 复用 ADR-014 Challenge/Proof，不含私钥、Keychain handle 或 provider object；
- Secret 不进入 URL、query、日志、Evidence 或 durable business fact。

成功响应由同一次 Central transaction 形成：

```text
kind = enterprise_session_lease_result
schemaVersion = enterprise-session.v1alpha1
tokenType = Bearer
accessToken                    // sensitive, response-only
expiresAt
sessionAssertion              // EIPC-0 strict non-secret fact
deviceTrustDecision           // EIPC-0 strict non-secret fact
compatibilityRevision
sourceDecisionDigest
```

Central 必须在提交前再次锁定并重检 identity、device、permission、compatibility；Token issuance、
Session Assertion、Device Trust Decision 的 owner tuple、client、revision 与 source decision 必须一致。
不能先签发 token，再从非锁定表拼一个“看起来一致”的 assertion。

### 3.3 EIPC Session Token 与旧 Token Claims 分离

EIPC-1 不修改旧 `v1alpha1` permission enum。新 Session Lease 使用 EIPC 自有 signed claims profile：

```text
claimsProfile = eipc.session-token.v1
permissions includes personal_model.configure
```

规则：

- Central token validator 只 additive 接受该 profile；旧 Gateway `v1alpha1` token 行为不变；
- `personal_model.configure` 只在 Central permission 与当前 activated policy 均允许时进入 assertion；
- 旧客户端不会收到无法解析的新 enum；
- `tokenId` 只存在于 Central issuance 与 Core runtime lease，不进入 EIPC binding/snapshot、日志或 Evidence；
- EIPC-1 不用 token payload 本地 decode 代替签名验证或 Central source fact；
- 不允许把 assertion digest、token digest 或 bearer hash伪装成 tokenId。

### 3.4 Local Port 分层

```text
EnterpriseVerifiedIdentityCredentialProvider
  loadCurrentHandle()

EnterpriseCredentialStore
  store / replace / resolve / delete

EnterpriseDeviceSigner
  getDeviceKeyId / getPublicKey / sign(challenge)

EnterpriseSessionLeaseClient
  issue / renew / validateCompatibility

ProductionEnterpriseAccessTokenProvider
  acquire / renew / assertCurrentSession
```

- Identity Credential、Credential Store、Device Signer、Central Client 不合并成一个“大 Adapter”；
- `ProductionEnterpriseAccessTokenProvider` 只做有界编排与 runtime lease，不持久化 bearer；
- EIPC-2 才消费 Session Assertion/Device Trust/Runtime Active source 形成 authority snapshot；
- Main/Renderer 不获得上述 Port，也不传 owner/permission/trust 输入。

### 3.5 Enterprise Credential 与 Personal Credential 强隔离

`EnterpriseCredentialStore` 必须与 ADR-013 Personal Store 分离：

- 独立 namespace、opaque ref prefix、HMAC/domain、helper operation type；
- 不共用 personal credentialRef；
- 不允许 `resolve` 返回 device private key；
- device key handle 只能交给 `EnterpriseDeviceSigner`；
- 至少区分 `not_found/unavailable/access_denied/corrupted/disabled/internal`；
- logout 删除企业身份 credential/session material，不删除个人模型 Key；
- 个人模型删除也不能删除企业 identity/device credential。

Adapter 可以复用同一 OS Keychain 基础设施，但不能复用业务 namespace 或 reference codec。

### 3.6 目标平台 Device Signer

EIPC-1 首个生产目标按当前开发平台验证 macOS：

- 优先 Secure Enclave；硬件/算法不支持时只能回文档评审选择受控 Keychain private key profile；
- private key 不可导出，不提供 `getPrivateKey/resolvePrivateKey/exportPrivateKey`；
- challenge、purpose、audience、client、issued/expiry 必须在签名前复核；
- argv、env、临时文件、普通 JSON IPC 不携带 private material 或签名输入 Secret；
- codesign/team/entitlement/helper 路径的 production packaging 事实必须单独记录；
- Windows CNG/TPM、Linux PKCS#11 不在本批实现，后续各自 Adapter 评审。

如果 Secure Enclave/Keychain signer、codesign 或企业 credential bootstrap 无法在当前授权范围内实现，
EIPC-1 必须保留 blocker，不能退化为磁盘 PEM、SQLite key、环境变量或 Fake signer。

## 4. Session 生命周期

### 4.1 acquire

```text
load opaque verified identity handle
  -> load device key handle
  -> request exact Central challenge
  -> EnterpriseDeviceSigner.sign(challenge)
  -> issue EIPC Session Lease
  -> strict parse token + Session Assertion + Device Trust Decision
  -> verify owner/client/revision/digest/time/audience/permission consistency
  -> keep bearer only in runtime lease
```

任何一步失败都不产生 current session。

### 4.2 renew

- 单 operation 最多一次 renew，继续复用 `EnterpriseConfigurationTokenSession` 的有界语义；
- renew 必须重新 challenge/proof、Device Trust、permission 与 compatibility；
- expected owner tuple/current client/audience 必须精确一致；
- scope drift、trust invalid、permission missing、compatibility mismatch 直接失败关闭；
- previous token 自然过期，不把 refresh 解释为实时撤销协议。

### 4.3 assertCurrentSession

- 校验 runtime lease 未过期、required permission 存在、scope 精确一致；
- 校验 Session Assertion 与 Device Trust Decision digest；
- Central 可达时允许主动重新验证；
- Central 暂不可达时只返回“已有本地事实仍可供 EIPC-2 判断”，不自行宣布 offline state 2；
- 已知过期/invalid/trust invalid/scope drift 时必须失败，不能把网络错误覆盖它们；
- 不新增 durable Session cache、离线租约、失联阈值或后台无限续期。

### 4.4 restart/logout

- Core restart 后 bearer runtime lease 清空；
- 若受控 Credential/Signer 可以重新建立 session，则重新走 challenge/issue，不恢复旧 bearer；
- 无法重新建立时保持状态 3，不从 SQLite owner row、日志或 Runtime Activation 猜测 session；
- logout 清理 current enterprise identity credential/session reference 和 runtime lease；
- Device enrollment/server-side revoke 是独立动作，不因 logout 删除审计或设备历史。

## 5. Production readiness 与 blocker

EIPC-1 的 readiness snapshot 至少包含：

```text
contractConformant
centralSessionLeaseEndpointReady
verifiedIdentityCredentialProviderReady
enterpriseCredentialStoreReady
deviceSignerReady
tokenProviderReady
productionIdentityInputAuthorized
testOnlyIdentityActive
```

只有前七项真实成立且 `testOnlyIdentityActive=false` 才能输出：

```text
EIPC1_ENTERPRISE_INTEGRATION_ADAPTER_READY
```

下列任一成立必须输出 blocker：

- 只有 Fake OA/verified identity；
- 只有 Fake Device Signer；
- identity handle 来自 env/Renderer/Main/OS user；
- bearer 或 key 写入 SQLite/普通文件；
- Central 只返回 token、没有同决策 assertion/trust facts；
- `personal_model.configure` 仅来自客户端请求或本地 policy；
- production codesign/helper/Keychain boundary 未验证；
- 真实企业集成尚未获产品/安全授权。

开发/验收可以使用明确标记的模拟账号与受控 Central test profile，但所有 Evidence 必须同时声明：

```text
testIdentityUsed = true
productionIdentityReady = false
```

模拟账号可用于客户端和 E2E 测试，不能关闭 production blocker。

## 6. Typed errors

### 6.1 Local Adapter

```text
enterprise_identity.credential_unavailable
enterprise_identity.credential_not_found
enterprise_identity.credential_access_denied
enterprise_identity.device_signer_unavailable
enterprise_identity.device_key_not_found
enterprise_identity.challenge_invalid
enterprise_identity.challenge_expired
enterprise_identity.session_issue_rejected
enterprise_identity.session_expired
enterprise_identity.session_scope_changed
enterprise_identity.permission_missing
enterprise_identity.compatibility_unavailable
enterprise_identity.central_temporarily_unavailable
enterprise_identity.contract_mismatch
enterprise_identity.source_fact_mismatch
enterprise_identity.internal
```

### 6.2 Central mapping

Central 继续使用稳定 category + code；不得把以下不同事实合并成一个“登录失败”：

- identity disabled；
- device not managed/not compliant/access denied；
- challenge expired/replayed/signature invalid/context mismatch；
- permission denied；
- compatibility mismatch；
- rate limit/timeout/service unavailable。

错误、日志、Audit 和 Evidence 不得包含 bearer、token id、verified identity handle、device key handle、
signature、原始 proof、OA material、owner raw tuple、完整 endpoint 或内部栈。

## 7. 原子性与崩溃窗口

| 窗口 | 发生点 | 恢复语义 |
| --- | --- | --- |
| E1 | identity handle 读取前 | 无 session、无 challenge、可重新开始 |
| E2 | challenge issued 后、sign 前 | challenge 自然过期；不伪造 proof |
| E3 | sign 后、Central receive 前 | signature 只在当前请求内；可用新 challenge 重新开始 |
| E4 | Central 验证后、事务提交前 | transaction rollback，无 token issuance |
| E5 | Central commit 后、response lost | challenge 已消费；Local 不猜成功，使用新 challenge 建新 session |
| E6 | Local 收到 response、strict validate 前 | bytes/lease 清理，不安装 session |
| E7 | session 安装后、caller response 前 | 同 runtime operation 幂等返回同 lease；不重复 issue |
| E8 | renew 新 session 安装前 | 旧 session 在有效期内仍只按旧 lease；新结果不部分覆盖 |
| E9 | logout/owner switch 与 inflight issue 并发 | epoch/CAS 拒绝 late result并清理 bearer |
| E10 | Core crash | runtime lease 丢失；重启重新建立或状态 3 |

EIPC-1 不建立 durable token journal。Central issuance row/challenge consumption 是服务端事实，Local bearer
是 runtime-only；不能为了“恢复成功响应”持久化 bearer 或 token id。

## 8. 分批实施

### EIPC-1.0：Production Input / Contract Preflight（2～4 日）

- 冻结 EIPC Session Lease HTTP Schema、claims profile 与 endpoint；
- 选择首个 macOS signer profile并验证不可导出边界；
- 核实企业 verified identity credential 的真实来源、bootstrap 与退出流程；
- 核实是否已有公司 OA/MDM/签名授权；
- 输出 `EIPC1_PRODUCTION_INPUTS_FROZEN` 或
  `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`；
- docs + Spike only，不实现 production session。

### EIPC-1.1：Cross-language Contract + Central Session Lease（30～48 日）

详细方案见
[`EIPC-1.1 Cross-language Contract + Central Session Lease`](./EIPC-1.1-CROSS-LANGUAGE-CONTRACT-CENTRAL-SESSION-LEASE-DEVELOPMENT-PLAN.md)。
其中 EIPC-1.1.2 的编码权威方案见
[`EIPC-1.1.2 PostgreSQL v0010 + Persistence`](./EIPC-1.1.2-POSTGRESQL-V0010-PERSISTENCE-DEVELOPMENT-PLAN.md)。
EIPC-1.1.3 的编码权威方案见
[`EIPC-1.1.3 Central Decision / Validator / HTTP Foundation`](./EIPC-1.1.3-CENTRAL-DECISION-VALIDATOR-HTTP-FOUNDATION-DEVELOPMENT-PLAN.md)。

- 新增独立 `enterprise-session.v1alpha1` Wire Schema/OpenAPI/Fixture/manifest/canonical digest；
- 新增 handle-bound `/enterprise-session/v1alpha1/device-challenges`，避免客户端携带 Central 内部
  `verifiedIdentityId`，并新增 `/enterprise-session/v1alpha1/session-leases`；
- 新增与旧 claims enum 完全隔离的 `eipc.session-token.v1` profile，并以共同
  `EnterpriseBearerPrincipal` / `EnterpriseBearerAuthorizer` 接缝兼容旧 token consumer；
- 新增 forward-only Central `v0010`，原子保存 challenge binding、Session Assertion、Device Trust
  Decision、source decision 与 issuance facts；禁止改写 v0001～v0009；
- Central 同一 transaction 中锁定 identity/device/permission、验证 challenge/proof/trust/compatibility、
  组装并签发 bearer、消费 challenge、提交 issuance；禁止先签 token 再补 assertion/trust facts；
- 分为 EIPC-1.1.1 Contract/Conformance、EIPC-1.1.2 v0010/Persistence、EIPC-1.1.3 Decision/Validator/HTTP，
  每个子批均需独立 QA、用户接受和单独编码授权；
- 不实现 Local Credential/Signer、Runtime composition、Main/Preload/Renderer，不宣称 Adapter ready 或
  关闭 identity composition blocker。

### EIPC-1.2：Local Credential / Signer / Token Provider（8～13 日）

- 实现 Enterprise Credential Store 与 opaque reference codec；
- 实现首个 macOS Enterprise Device Signer；
- 实现 strict HTTPS Session Lease client与 `ProductionEnterpriseAccessTokenProvider`；
- bearer runtime-only、有界 renew、owner/client/audience/permission/digest 校验；
- production inputs 不可用时 fail-closed，test profile 明确隔离；
- 不接 Runtime Active authority composition。

### EIPC-1.3：Adapter Closure Harness（4～6 日）

- 真实 Central process + PostgreSQL + Local Core Adapter + 临时 Keychain/Signer；
- E1～E10、restart/logout/owner switch、Central online/offline；
- 旧 token/config/model gateway 回归；
- 四通道多编码泄漏扫描与资源归零；
- 输出 `EIPC1_ENTERPRISE_INTEGRATION_ADAPTER_READY` 或保留 blocker；
- 独立 QA + 用户接受后，EIPC-2 才能提交详细方案与编码授权。

新估算：**44～71 个集中工程日**，不含公司 OA/MDM 联调、企业安全审批、独立 QA、返工、Windows/Linux
Signer、登录 UI 或现场验收。原 `6～10 日` 估算失效。

## 9. 修改边界

### 9.1 子批授权后允许

- `contracts/enterprise-session/v1alpha1/**`；
- `packages/contracts/src/enterprise-session/**` 与 tests；EIPC-0 semantic package 只读复用；
- `services/central-service/src/main/**/authentication/**` 的 additive EIPC service/adapter；
- `services/core/src/application|ports|adapters/**` 的 Enterprise Integration 模块；
- 独立 native macOS enterprise signer/helper 目录；
- 对应 tests/Harness/Evidence；
- 每个完成批次的版本与治理文档收口。

### 9.2 明确禁止

- 改写 Enterprise Gateway `v1alpha1/v1alpha2` 既有 Schema/Fixture/digest；
- 修改 Desktop Local `v1alpha1/v1alpha2`；
- `apps/desktop/src/renderer/**`、登录 UI、个人模型 UI；
- Main/Preload public identity API或把 owner/permission/trust 作为可信输入；
- EIPC-2 Runtime Active composition、EIPC-3 Unblock Audit；
- STRM-3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM；
- migration 25、配置过期策略、离线租约、设备失联阈值、实时撤销；
- OIDC/PKCE/浏览器 Callback、厂商 OA wire 的无依据自研；
- SQLite/普通文件/env/argv 保存 bearer、identity credential 或 device private key；
- 新依赖或 `pnpm-lock.yaml` 修改，除非子批方案单独评审并获授权。

发现必须修改禁止范围时必须停止编码并回文档评审，不能“顺手补齐”。

## 10. QA 验收矩阵（72 项）

### 10.1 Contract / Version（1～14）

1. EIPC Session Lease request strict；
2. response strict；
3. request 禁 enterprise/user/device 自报；
4. device proof 禁 private material；
5. assertion strict；
6. trust decision strict；
7. source decision digest重算；
8. owner tuple一致；
9. current client一致；
10. audience一致；
11. permission唯一且有界；
12. `personal_model.configure` 只存在于新 profile；
13. Gateway v1alpha1 digest 零漂移；
14. Gateway v1alpha2 digest 零漂移。

### 10.2 Central Atomic Decision（15～28）

15. identity valid；16. identity disabled；17. device trusted；18. device not managed；
19. device not compliant；20. device denied；21. challenge expiry；22. challenge replay；
23. signature invalid；24. context mismatch；25. permission missing；26. compatibility mismatch；
27. transaction rollback无 issuance；28. commit 后 assertion/trust/token source一致。

### 10.3 Credential / Signer（29～42）

29. Enterprise/Personal namespace隔离；30. opaque ref不可互换；31. store；32. replace；33. resolve；
34. delete；35. not_found；36. access_denied；37. corrupted；38. unavailable；39. private key无导出API；
40. exact challenge sign；41. signer wrong purpose拒绝；42. logout清理企业credential且不删个人Key。

### 10.4 Local Token Provider（43～56）

43. acquire；44. same operation幂等；45. renew最多一次；46. scope drift；47. client drift；48. audience drift；
49. permission missing；50. assertion digest tamper；51. trust digest tamper；52. expired session；
53. Central unavailable不覆盖已知invalid；54. bearer runtime-only；55. Core restart不恢复旧bearer；
56. late owner-switch result拒绝。

### 10.5 Recovery / Security（57～72）

57～66. E1～E10；67. 四通道五类 marker；68. raw/Base64/URL/hex 负向注入；
69. logs/errors/evidence敏感命中0；70. challenge/client/http/keychain/helper资源归零；
71. test identity明确投影 production false；72. EIPC-2/3、Desktop、Personal Model、TGM 无超前实现。

正式门禁必须串行执行，使用 Node `24.13.0` 与 JDK 21。Central online/offline、真实临时 macOS Keychain
和进程 Harness 不能并行争抢资源。测试不得使用真实用户 OA Credential、真实企业 Key 或付费外部服务。

## 11. 文档评审问题

1. A1～A9 是否与当前代码一致；
2. 是否接受独立 Enterprise Session Wire Contract，而不是改写 Gateway v1alpha1/v1alpha2 或把 bearer
   放入非 Secret EIPC semantic family；
3. Session Assertion/Device Trust/Token 是否必须来自同一次 Central 原子 decision；
4. 是否接受 `eipc.session-token.v1` claims profile 隔离 `personal_model.configure`；
5. Enterprise Credential Store 与 Personal Store 的 namespace/Port/ref 是否足够隔离；
6. 首个 signer 以 macOS 为目标、其他平台后置是否合理；
7. 真实企业输入未授权时输出 blocker、测试账号不冒充 production 是否正确；
8. E1～E10 是否覆盖 Token/Signer/Session 恢复窗口；
9. EIPC-1.0～1.3 是否应逐批独立 QA 与用户接受；
10. EIPC-1.1.3.2 详细方案将总工期修正为 `44～71 日`，是否比旧 `6～10 日` 诚实；
11. 是否存在需要独立 ADR、企业安全审批或产品决策的新增事实；
12. 给出 `PASS / PASS_WITH_REVISIONS / FAIL` 与 P0～P3 发现。

## 12. 当前门禁

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
EIPC-1.1.3.3            PASS/CLOSED / DORMANT FOUNDATION
EIPC-1.2～EIPC-1.3      DEFERRED / OUT OF CURRENT RELEASE
EIPC-2～EIPC-3          DEFERRED / OUT OF CURRENT RELEASE

STRM-0～STRM-2          PASS/CLOSED
STRM-3                  GATED
DFI-4A.4.1～4A.4.3      GATED
DFI-2B / DFI-3          GATED
TGM                     GATED
```

EIPC-1.0 已完成 docs + Spike、独立 QA 和用户接受，正式 `PASS/CLOSED`；该关闭不等于 production identity
ready，`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity composition blocker 均继续
保持打开。EIPC-1.1 与 EIPC-1.1.3 计划评审、EIPC-1.1.1～EIPC-1.1.3.3 的实现、独立 QA 和用户接受均已
关闭；整条 EIPC-1.1 作为默认关闭的 dormant foundation 保留。EIPC-1.2～EIPC-3 已移出当前版本，任何
production session activation 编码仍未获授权。
