# EIPC-1.0 Production Input / Contract Preflight

> 状态：**INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-23  
> 负责人：Codex 5.6  
> 开发版本：`0.0.0-eipc.1.0`  
> 范围：docs + Spike only；不实现 production session

## 1. 唯一结论边界

EIPC-1.0 只冻结 EIPC Session Lease 的输入、Wire family、macOS signer profile 与企业授权缺口。本批不实现
production Session Lease、Central transaction、Local Credential Adapter、Token Provider 或 Runtime composition。

当前真实企业集成授权尚不存在，因此本批预期且唯一允许的当前结论是：

```text
BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION
```

该结论表示 Preflight 正确失败关闭，不表示 EIPC-1 或 identity composition 失败。当前必须明确投影
`productionIdentityReady = false`，不得输出 `IDENTITY_COMPOSITION_READY`，个人模型 Desktop 接口也不可用。

## 2. Enterprise Session Wire 输入冻结

### 2.1 独立版本空间与 endpoint

- Contract family：`enterprise-session.v1alpha1`；
- HTTP operation：POST `/enterprise-session/v1alpha1/session-leases`；
- claimsProfile = `eipc.session-token.v1`；
- host 可以复用 Enterprise Gateway 部署边界，但不得改写 Enterprise Gateway `v1alpha1/v1alpha2`；
- 不把 bearer 放入 `enterprise-identity-composition/v1alpha1` non-secret semantic family。

### 2.2 Request material

请求 strict 且只允许：

```text
kind
schemaVersion
verifiedIdentityHandle
currentClientInstanceId
audience
requiredPermissions[]
deviceProof
correlationId
```

请求禁止 `enterpriseId/userId/deviceId`、entitlement、Device Trust decision 或 Compatibility decision 自报。
`verifiedIdentityHandle` 是受控 opaque handle；`deviceProof` 只包含既有 ADR-014 public proof material，禁止
private key、device key handle、identity credential、bearer 或 Secret-derived digest。

### 2.3 Atomic response material

成功响应必须由未来 EIPC-1.1 的同一次 Central transaction 决策形成：

```text
kind
schemaVersion
tokenType = Bearer
accessToken
expiresAt
sessionAssertion
deviceTrustDecision
compatibilityRevision
sourceDecisionDigest
```

Bearer 只存在于 response bytes 与 Core runtime lease，不持久化、不进入日志/Evidence，也不得进入 EIPC-0 non-secret Contract。
Session Assertion、Device Trust Decision、owner tuple、current client、revision 和 `sourceDecisionDigest` 必须来自
同一锁定决策；禁止先签 Token 再拼 non-secret facts。

## 3. macOS signer profile 冻结

首个目标 profile 固定为：

```text
macos_secure_enclave_p256_ecdsa_sha256_v1
```

- key type：Secure Enclave `ECSECPrimeRandom` 256 bit；
- signing：ECDSA X9.62 SHA-256；
- Device private key 只允许 `sign(challenge)`，`getPrivateKey/resolvePrivateKey/exportPrivateKey` 永久禁止；
- Spike 只创建非持久临时 key，验证 public key 可导出、private key external representation 不可取得、签名可完成；
- 不输出 key handle、private material、signature bytes 或原始 challenge；
- Secure Enclave/profile/entitlement/codesign 任一不能成立时，保持 blocker，不得自动退化为磁盘 PEM、SQLite key、环境变量或 Fake signer；
- 受控 Keychain private key fallback 需要重新进入文档评审，本批不选择。

## 4. Production input authorization register

| 输入 | 当前状态 | 本批结论 |
| --- | --- | --- |
| 公司 OA verified identity bootstrap | `not_authorized` | 无真实 provider/credential，不得模拟 production |
| MDM/企业 Device Trust 输入 | `not_authorized` | 仅有既有 Fake/Test conformance |
| production codesign/entitlement/packaging | `not_authorized` | Spike 可验证平台原语，不能代表发布授权 |
| 真实 enterprise identity credential | `not_provided` | 不从 env、Main、Renderer、OS user 或固定 userId 猜测 |
| 模拟账号 | `not_used_by_eipc_1_0` | 未来测试使用时必须同时投影 production false |

真实 bootstrap 流程必须由未来获得授权的企业集成提供：受控 OA/SSO 输入生成 opaque verified identity handle，
受控 Device enrollment/MDM 输入提供 Device Trust source，logout 只清理企业 identity/session material，不删除个人
模型 Key。EIPC-1.0 不自研 OIDC/PKCE/browser callback，也不把账号密码或 OA token 引入仓库。

## 5. Preflight 证据与退出条件

`pnpm run preflight:eipc1.0` 必须核实：

1. 既有 production composition 仍有 fixed `activeUserId`；
2. Core 只有 `EnterpriseAccessTokenProvider` Port，没有 production implementation；
3. 旧 Gateway claims 不支持 `personal_model.configure`；
4. 旧 token response 没有同决策 Session Assertion/Device Trust Decision；
5. macOS signer Spike 连续三次给出稳定的 `pass` 或 `unavailable`；
6. `pass` 时 private key 不可导出、public key 可导出、签名成功且不创建 persistent key；
7. Evidence 不出现 bearer/private key/handle 形状；
8. 最终输出 production/session/composition/downstream ready 全为 false。

只有公司 OA/MDM/production signing 与 bootstrap 输入获得独立授权，才可以在后续重新评审
`EIPC1_PRODUCTION_INPUTS_FROZEN`。当前保持
`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`。

## 6. 明确未实现与门禁

- EIPC-1.1～EIPC-1.3：继续 `GATED`；
- EIPC-2～EIPC-3：继续 `GATED`；
- STRM-3：继续 `GATED`；
- DFI-4A.4.1～DFI-4A.4.3：继续 `GATED`；
- DFI-2B：继续 `GATED`；
- DFI-3：继续 `GATED`；
- TGM：继续 `GATED`；
- Main/Preload/Renderer/login UI/public IPC：未修改；
- production Contract/Central/Core Adapter/migration/依赖/lockfile：未修改。

## 7. 开发者证据

正式非沙箱 Preflight 已连续验证 macOS Secure Enclave signer 三次，并完成 Workspace、Central online/offline
串行门禁。完整结果、环境说明与边界清单见
[EIPC-1.0 Production Input / Contract Preflight Report](./EIPC-1.0-PRODUCTION-INPUT-CONTRACT-PREFLIGHT-REPORT.md)。

本批当前结果保持 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`；独立 QA 与用户接受不改变
blocker，也不自动授权 EIPC-1.1。独立 QA 的 P3-1（production Adapter 自动发现）归入 EIPC-1.1；P3-2
完整四通道多编码负向检出矩阵归入 EIPC-1.3。
