# EIPC-1.0 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-23-1740-version-eipc.1.0` |
| 验收对象 | EIPC-1.0：Production Input / Contract Preflight（docs + Spike） |
| 日期 | 2026-08-23 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / macOS Secure Enclave（非沙箱）/ Docker |
| 开发版本 | Root `0.0.0-eipc.1.0`；生产子包版本不变 |
| 唯一结论 | `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run preflight:eipc1.0`（**非沙箱**） | **PASS**：`outcome=BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`；signer `pass` 3/3、`privateKeyExportable=false`、`persistentKeyCreated=false`；Node evidence 5/5；敏感命中 0；临时 artifacts 清理；`evidenceDigest=sha256:c7d60b43…abc8` 与报告一致 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 239 files / 1587 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 307/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 307/0/0/0 / BUILD SUCCESS** |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 唯一结论诚实 fail-closed | ✅ `outcome` 恒为 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`；`productionIdentityReady=false`/`identityCompositionBlockerClosed=false`/`downstreamCodingUnlocked=false` 全 false；不输出 `EIPC1_PRODUCTION_INPUTS_FROZEN`/`EIPC1_ENTERPRISE_INTEGRATION_ADAPTER_READY`/`IDENTITY_COMPOSITION_READY` |
| 2 | Wire/语义分层 | ✅ `enterprise-session.v1alpha1` 独立 family + POST session-leases + `eipc.session-token.v1`，不改写 Gateway v1alpha1/v1alpha2 或 EIPC non-secret family |
| 3 | macOS Secure Enclave Spike | ✅ [eipc1.0-macos-signer-spike.m](scripts/eipc1.0-macos-signer-spike.m) `kSecAttrTokenIDSecureEnclave` + `ECSECPrimeRandom` 256 + `kSecAttrIsPermanent:NO`；`SecKeyCopyExternalRepresentation(privateKey)` 实测不可导出（退出码 3 若可导出）；`SecKeyCopyPublicKey`+public representation 可导出；`SecKeyCreateSignature` X9.62 SHA-256 成功；emit 无 key handle/private material/signature |
| 4 | Spike 非沙箱必要性 | ✅ 沙箱内 Security.framework `-26276`（key creation 被拒），非沙箱 `pass`；开发/QA 均以非沙箱为正式证据，不把沙箱限制改写成平台原语失败 |
| 5 | 代码事实核实 | ✅ [run-eipc1.0-preflight.mjs](scripts/run-eipc1.0-preflight.mjs) `inspectSourceFacts` 实读 4 个源文件断言：fixed `activeUserId` 仍在、`EnterpriseAccessTokenProvider` 为 interface Port、旧 `AccessTokenClaims` 无 `personal_model.configure`、旧 token schema 有 `accessToken`/`expiresAt` 无 assertion/trust/sourceDecisionDigest |
| 6 | 敏感输出扫描 | ✅ `forbiddenSensitiveShapes`（Bearer token / PEM PRIVATE KEY / handle 赋值）扫描 node 输出 + sourceFacts + signer JSON，`sensitiveOutputMatchCount===0` |
| 7 | evidence 测试真实性 | ✅ [eipc1.0-preflight-evidence-check.mjs](scripts/eipc1.0-preflight-evidence-check.mjs) 5 测试均实读 preflight 文档断言冻结内容，无 skip/空断言 |
| 8 | 边界零漂移 | ✅ 仅改 root 版本 + `package.json`（preflight 脚本）+ 3 个 scripts + EIPC-1.0 文档/治理记录；未改生产 Contract/Core/Central/Main/Preload/Renderer/migration；`pnpm-lock.yaml` 保持 Aug 16；migrations 最大 id 仍 24 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 2（均不阻断）

#### P3-1：`productionAccessTokenProviderImplementationPresent` 为硬编码断言

[run-eipc1.0-preflight.mjs:124](scripts/run-eipc1.0-preflight.mjs#L124) 的 `inspectSourceFacts` 只验证
`tokenPort` 含 `export interface EnterpriseAccessTokenProvider`（Port 存在），返回对象里的
`productionAccessTokenProviderImplementationPresent: false` 是**直接硬编码**，未通过「全仓 grep 无 production
adapter implementation」自动验证。事实本身正确（独立 QA 已确认 `EnterpriseAccessTokenProvider` 仅在
ports/application/http client 出现，无 production adapter），但 Preflight 脚本的证据自动化程度不足。建议
后续把该字段改为真实源扫描（如断言 `services/core/src/adapters/**` 无该 Provider 实现）。

#### P3-2：`proveLeakScanner` 弱化 + 报告 §5 表述 over-claim

[run-eipc1.0-preflight.mjs:177-189](scripts/run-eipc1.0-preflight.mjs#L177) 的 `proveLeakScanner` 只生成
canary 的 4 种编码并断言 `length >= 16`，**未把编码注入到输出通道验证 scanner 真能检出**；而报告 §5 称
「泄漏 scanner 四种负向编码注入均被检出」。完整的负向注入验证是 EIPC-1.3 Closure Harness 的责任，本批
为 docs + Spike 可接受，但报告 §5 的「均被检出」表述与实际实现（仅生成 4 编码）不符，建议修正表述为
「生成 4 种编码 canary，负向检出能力由 EIPC-1.3 完整验证」。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 2（均不阻断）
```

EIPC-1.0 正确完成 Production Input / Contract Preflight：冻结 `enterprise-session.v1alpha1` Wire family、
Session Lease endpoint、`eipc.session-token.v1` claims profile 与 `macos_secure_enclave_p256_ecdsa_sha256_v1`
signer profile；macOS Secure Enclave Spike 非沙箱连续 3 次证明 private key 不可导出、public key 可导出、
ECDSA SHA-256 签名成功、无 persistent key、无 private material 输出；代码事实核实（fixed activeUserId 仍在、
无 production AccessToken Provider、旧 claims 无 `personal_model.configure`、旧 token response 无同决策
assertion/trust）；生产输入授权缺口（OA/MDM/codesign/identity credential）诚实投影为
`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`，`productionIdentityReady=false`。门禁独立复跑全绿
（preflight 非沙箱 3/3 signer + check 239/1587 + 3 smoke + Central online/offline 307/307）。边界零漂移：
仅改 root 版本/scripts/文档，未改生产 Contract/Core/Central/Main/Preload/Renderer/migration，`pnpm-lock.yaml`
保持 Aug 16。两处 P3（Preflight 证据自动化程度 + 泄漏扫描表述）见 §三，均不阻断。

**EIPC-1.0 可进入用户接受流程；接受后 identity composition blocker 仍保持打开、唯一结论仍为
`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`。EIPC-1.1（Cross-language Contract + Central Session
Lease）仍需单独方案/差异复核并获用户明确编码授权；EIPC-1.2～1.3、EIPC-2～3、STRM-3、DFI-4A.4.1～4A.4.3、
DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
