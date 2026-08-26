# EIPC-1.1.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-23-1956-version-eipc.1.1.1` |
| 验收对象 | EIPC-1.1.1：Canonical Contract + Cross-language Conformance |
| 日期 | 2026-08-23 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root / Contracts `0.0.0-eipc.1.1.1`；其他生产子包版本不变 |
| 上游 | EIPC-0、EIPC-1.0、EIPC-1.1 Plan `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:eipc1.1.1` | **PASS**：TS 2 files / 24 tests + Java 3 conformance classes；`outcome=EIPC111_CONTRACT_CROSS_LANGUAGE_CONFORMANT`；6 类 digest 匹配、legacy drift 0、敏感命中 0；`blocker=BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 保持 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 240 files / 1603 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 316/0/0/0 / BUILD SUCCESS**（307→316，新增 9 个 Java conformance 测试） |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 316/0/0/0 / BUILD SUCCESS** |

首次 harness 复跑因 JDK 21 未在 PATH 而 Java 阶段失败（Node 24 测试已过）；显式设置 `JAVA_HOME` + PATH 后
从零全绿。此为环境前置，非产品缺陷。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | canonical Contract 完整 | ✅ [contracts/enterprise-session/v1alpha1/](contracts/enterprise-session/v1alpha1/) 含 README/openapi/CANONICAL-DIGESTS/5 类 schema/valid+invalid fixture/manifest/digest-materials |
| 2 | TS 严格复用 EIPC-0 语义 | ✅ [v1alpha1.ts](packages/contracts/src/enterprise-session/v1alpha1.ts) import `EnterpriseSessionAssertionV1Alpha1Schema`/`EnterpriseDeviceTrustDecisionV1Alpha1Schema`/`EnterpriseOwnerIdentityV1Alpha1Schema` 等，不复制宽松语义 |
| 3 | Session Lease Result 跨字段不变量 | ✅ superRefine 强制 `expiresAt===assertion.expiresAt`、assertion `validity==="valid"`、trust `decision==="trusted"`、scope 与 trust owner 的 enterprise/user/device 三者一致 |
| 4 | 6 类 canonical digest | ✅ 6 个独立 domain（challenge-binding/assertion-revision/assertion/device-trust-revision/device-trust/source-decision）；`canonicalEnterpriseSessionJson` 做 NFC normalize + 键 Unicode code point 排序 + array 顺序保留 + 重复键抛错 |
| 5 | 跨语言 digest 精确匹配 | ✅ 测试读 `fixtures/conformance/digest-materials.json` 对 6 类逐一重算 canonical+digest 与 fixture 的 `canonicalJson`/`sha256` 精确比对 |
| 6 | legacy 零漂移 | ✅ 测试 sha256 对比 Gateway v1alpha1 openapi.yaml+manifest.json 与 EIPC-0 authority-semantics.schema.json+manifest.json 的冻结 digest，精确一致 |
| 7 | source graph 扫描（EIPC-1.0 P3-1 修复） | ✅ [eipc1.1.1-enterprise-session-contracts.test.ts:233-247](packages/contracts/tests/eipc1.1.1-enterprise-session-contracts.test.ts#L233) 真实递归扫描 `services/core/src/adapters/**` + `apps/desktop/src/main/**` 的 .ts，regex 匹配 `implements/satisfies/const : EnterpriseAccessTokenProvider`，断言结果 `[]`——不再硬编码 `false` |
| 8 | source-decision 无敏感 | ✅ 测试断言 sourceDecision canonicalJson 不含 accessToken/tokenDigest/verifiedIdentityHandle/signature/credentialRef |
| 9 | typed error strict | ✅ 15 个 typed code；error schema strict 拒额外字段（verifiedIdentityHandle/stack） |
| 10 | harness 敏感输出扫描 | ✅ 5 个 forbidden fixture 值（Base64 编码 handle/signature、credentialReference、示例路径）扫描 Node+Java 输出，命中 0 |
| 11 | 测试断言真实性 | ✅ 反查无 `.skip`/`.only`/`todo`；16 个 TS 测试均实读 fixture/源码断言，无空断言 |
| 12 | 边界零漂移 | ✅ 改动 = canonical Contract + Contracts TS export + Central **test**（conformance + validator）+ harness + 治理文档；未改 Central production service/Core/Main/Preload/Renderer/migration；`pnpm-lock.yaml` 保持 Aug 16；migration 仍 v0009、**无 v0010 抢跑** |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

EIPC-1.0 的两个 P3 均在本批正确修复：
- P3-1（production Adapter 存在性硬编码 false）→ 真实 source graph 递归扫描；
- P3-2（泄漏扫描 over-claim）→ harness 以 5 个真实 forbidden fixture 值扫描，且方案 §12.6 QA 81 明确
  「完整多编码负向扫描留 EIPC-1.3」，不再 over-claim。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

EIPC-1.1.1 正确完成 Canonical Contract 与 Cross-language Conformance：新增独立 `enterprise-session.v1alpha1`
family（opaque-handle Device Challenge + Session Lease + 隔离 `eipc.session-token.v1` claims + typed errors），
TS strict Zod 严格复用 EIPC-0 语义、6 类 domain-separated SHA-256 digest、NFC canonical JSON；TS/Java 跨语言
conformance 共同验证 corpus、六类 digest、跨文档 identity/expiry、sensitive exclusion 与旧 Gateway/EIPC-0
canonical bytes/digest 零漂移；Architecture test 真实扫描 Core source graph 证明 production
`EnterpriseAccessTokenProvider` 仍缺失（修复 EIPC-1.0 P3-1）。门禁独立复跑全绿（harness 2/24 + 3 Java
conformance、check 240/1603 + 3 smoke、Central online/offline 316/316）。边界零漂移：仅改 canonical Contract
+ Contracts TS + Central test + harness，未改生产代码/migration（仍 v0009 无 v0010）/依赖，`pnpm-lock.yaml`
保持 Aug 16。

**EIPC-1.1.1 可进入用户接受流程；接受后 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity
composition blocker 仍保持打开。EIPC-1.1.2（PostgreSQL v0010 + Persistence）仍需单独方案/差异复核并获用户
明确编码授权；EIPC-1.1.3、EIPC-1.2～1.3、EIPC-2～3、STRM-3、DFI-4A.4.1～4A.4.3、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
