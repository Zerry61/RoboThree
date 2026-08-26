# EIPC-1.0 Production Input / Contract Preflight Report

> 状态：**INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-23  
> 负责人：Codex 5.6  
> 开发版本：`0.0.0-eipc.1.0`  
> 唯一结论：`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`

## 1. 结论

EIPC-1.0 已完成文档冻结与 Production Input / Contract / macOS Signer Spike。Preflight 正确证明：

- 独立 Enterprise Session Wire family、Session Lease endpoint、claims profile 与 macOS signer profile 已冻结；
- macOS Secure Enclave P-256 ECDSA SHA-256 原语可用，private key 不可导出，public key 可导出，签名成功；
- 当前仓库仍没有获授权的公司 OA verified identity bootstrap、MDM Device Trust 输入、真实 enterprise
  identity credential 或 production codesign/entitlement/packaging；
- production session、Central Session Lease、Local Credential Adapter 与 Runtime composition 均未实现；
- `productionIdentityReady=false`、identity composition blocker 保持打开，下游编码未解锁。

因此，本批不能输出 `EIPC1_PRODUCTION_INPUTS_FROZEN`、`EIPC1_ENTERPRISE_INTEGRATION_ADAPTER_READY`
或 `IDENTITY_COMPOSITION_READY`。当前唯一诚实结果是：

```text
BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION
```

## 2. 冻结的输入与 Contract 边界

| 项目 | 冻结结果 |
| --- | --- |
| Wire family | `enterprise-session.v1alpha1`，不改写 Gateway v1alpha1/v1alpha2 或 EIPC non-secret family |
| Session Lease | POST `/enterprise-session/v1alpha1/session-leases` |
| claims profile | `eipc.session-token.v1`，不把新 permission 塞入旧 claims enum |
| Request authority | 只接 opaque verified identity handle、current client、audience、permission、device proof、correlation |
| Atomic response | bearer、expiry、Session Assertion、Device Trust、Compatibility 与 source decision 必须同决策形成 |
| Signer profile | `macos_secure_enclave_p256_ecdsa_sha256_v1` |
| Secret 边界 | bearer/private key/key handle/signature/challenge 不进入日志、Evidence 或 non-secret Contract |

完整冻结内容见
[EIPC-1.0 Production Input / Contract Preflight](./EIPC-1.0-PRODUCTION-INPUT-CONTRACT-PREFLIGHT.md)。

## 3. 真实代码事实

Preflight 对当前代码进行只读核查，得到：

- Desktop production composition 仍有 fixed `activeUserId`；
- Core 存在 `EnterpriseAccessTokenProvider` Port，但不存在 production implementation；
- 旧 Access Token claims 不支持 `personal_model.configure`；
- 旧 Token response 不含同决策 Session Assertion 或 Device Trust Decision；
- 独立 Enterprise Session production Contract 尚未实现。

这些事实解释了 blocker，禁止使用固定用户、OS user、Main/Renderer 参数、数据库单行或测试身份补洞。

## 4. macOS Secure Enclave Spike

正式 Preflight 在非沙箱 macOS 环境连续运行 3 次，结果稳定：

| 断言 | 结果 |
| --- | --- |
| `signerStatus` | `pass` |
| private key external representation | 不可取得 |
| public key external representation | 可取得 |
| ECDSA SHA-256 signing | 成功 |
| persistent key | 未创建 |
| private key material emitted | false |

沙箱内相同 Spike 在 key creation 阶段返回 Security.framework error `-26276`。这属于运行环境限制，不被
改写为平台原语失败；正式证据必须来自非沙箱运行。Spike 使用临时非持久 key，不输出 key handle、private
material、signature bytes 或 challenge。

## 5. 正式 Evidence

`CI=true pnpm run preflight:eipc1.0` 输出：

```text
status=PASS
outcome=BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION
signerStatus=pass
signerProbeRunCount=3
privateKeyExportable=false
productionSessionImplemented=false
centralSessionLeaseImplemented=false
localCredentialAdapterImplemented=false
runtimeCompositionImplemented=false
productionIdentityReady=false
identityCompositionBlockerClosed=false
downstreamCodingUnlocked=false
sensitiveOutputMatchCount=0
temporaryArtifactsRemoved=true
evidenceDigest=sha256:c7d60b431011162ccad3b013a50123e5fc57ba606df2bcf2db34a58d23ffabc8
```

Node evidence tests：5/5；Preflight 生成 raw/Base64/URL-encoded/hex 四种 canary 编码并验证其有界形态，
正式输出敏感形状命中为 0。本批未证明四通道负向注入均可检出；完整检出能力由 EIPC-1.3 Closure Harness
负责，不能用本批证据替代。

## 6. 开发者门禁

门禁按串行方式执行：

| 门禁 | 结果 |
| --- | --- |
| `CI=true pnpm run preflight:eipc1.0`（非沙箱） | PASS，结果与 §5 一致 |
| `CI=true pnpm run lint` | PASS，Architecture boundary checks passed |
| `CI=true VITEST_MAX_WORKERS=1 pnpm run check` | PASS，239 files / 1587 tests + 3 smoke |
| `CI=true pnpm run check:central` | PASS，307/0/0/0 / BUILD SUCCESS |
| `CI=true pnpm run check:central:offline` | PASS，307/0/0/0 / BUILD SUCCESS |

过程记录：首次 Central online 全量运行有 2 个既有 `Cgf2b32` 时序失败；失败类单独复跑通过，随后从零
重跑 Central online 307/0/0/0 全绿。本批未修改 Central 生产或测试代码，该事件不改变 EIPC-1.0 结论。

根版本变化触发依赖状态恢复；`CI=true pnpm install --frozen-lockfile` 复用本机 300 个包、下载 0，
`pnpm-lock.yaml` 未改变。

## 7. 修改与禁止范围

本批仅新增/修改：

- EIPC-1.0 文档、报告与治理状态；
- `scripts/run-eipc1.0-preflight.mjs`；
- `scripts/eipc1.0-preflight-evidence-check.mjs`；
- `scripts/eipc1.0-macos-signer-spike.m`；
- 根版本与 `preflight:eipc1.0` 脚本。

本批未修改生产 Contract、Central、Core、Main、Preload、Renderer、migration、第三方依赖或 lockfile；未实现
production session、Session Lease、Credential Adapter、Runtime composition、个人模型 Desktop API 或 UI。

## 8. 下一门禁

EIPC-1.0 已通过独立 QA 并由用户正式接受关闭，但不能自动进入 EIPC-1.1 编码。以下继续 `GATED`：

- EIPC-1.1～EIPC-1.3、EIPC-2～EIPC-3；
- STRM-3；
- DFI-4A.4.1～DFI-4A.4.3；
- DFI-2B、DFI-3、TGM。

只有真实企业集成输入与安全授权被提供，并经新的文档评审和用户授权，才能继续生产实现。

## 9. 独立 QA 收口

独立 QA 结论为 `PASS`（P0=0、P1=0、P2=0、P3=2）。两个非阻断项按以下方式后置：

- P3-1：EIPC-1.1 必须以真实源扫描或 production dependency graph 证明 production
  `EnterpriseAccessTokenProvider`/Session Adapter 是否存在，不得继续硬编码 `false`；
- P3-2：本报告已撤回“负向注入均被检出”的过度声明；四通道、多编码、真实失败注入归 EIPC-1.3。

用户已正式接受该结论，EIPC-1.0 `PASS/CLOSED`；identity composition blocker 继续保持打开。
