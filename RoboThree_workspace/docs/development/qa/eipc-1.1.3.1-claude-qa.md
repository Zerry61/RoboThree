# EIPC-1.1.3.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-24-1030-version-eipc.1.1.3.1` |
| 验收对象 | EIPC-1.1.3.1：Decision Domain / Ports / Canonical Material |
| 日期 | 2026-08-24 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root `0.0.0-eipc.1.1.3.1`；Contracts/Desktop/Core/Document Worker/Central 版本不变 |
| 上游 | EIPC-0、EIPC-1.0、EIPC-1.1.1、EIPC-1.1.2 `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:eipc1.1.3.1` | **PASS**：5 Java classes / 36 tests；`outcome=EIPC1131_DECISION_DOMAIN_CONFORMANT`；`sourceDigestDomainCount=3`、`canonicalContractDriftCount=0`、`legacyContractDriftCount=0`、三个 production implementation count 均 0、`testAdaptersProductionReachable=false`、敏感命中 0 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 240 files / 1603 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | 首跑 1 偶发 Error，从零复跑 **PASS 351/0/0/0 / BUILD SUCCESS**（见 §三） |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 351/0/0/0 / BUILD SUCCESS** |

Harness evidence digest 与报告一致：`sha256:f48b133c…b270`。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | Opaque handle strict | ✅ [OpaqueVerifiedIdentityHandle.java](services/central-service/src/main/java/com/robothree/central/authentication/domain/OpaqueVerifiedIdentityHandle.java) record + `^[A-Za-z0-9_-]{32,512}$` base64url；`toString()` 脱敏 |
| 2 | sealed 判别联合 | ✅ [EnterpriseBearerAuthorizationResult.java](services/central-service/src/main/java/com/robothree/central/authentication/domain/EnterpriseBearerAuthorizationResult.java) `sealed interface permits Success/Invalid/Expired/Unavailable`，Expired 带 `verifiedClaimsProfile`、Unavailable 带 `typedSafeCode` |
| 3 | 三 digest domain | ✅ [EnterpriseSessionDecisionDigests.java](services/central-service/src/main/java/com/robothree/central/authentication/domain/EnterpriseSessionDecisionDigests.java) device-source-revision / permission-source-revision / lease-request 独立 domain separator |
| 4 | permission digest 覆盖全集 | ✅ `permissionRevisionDigest` 强制 `required.equals(ordered)`（请求权限集 == 持久化事实集），覆盖每个 permission 的 enabled/sourceRevision/updatedAt + owner 精确一致 + UTC millisecond，非空/≤32/唯一/七值枚举 |
| 5 | compatibility 非负十进制 | ✅ `compatibilityRevision(long)` = `Long.toString(revision(...))`，`revision()` 非负校验，不伪装 digest |
| 6 | lease request digest 排除敏感 | ✅ 覆盖 schemaVersion/claimsProfile/challengeId/bindingDigest/client/audience/requiredPermissions/deviceKeyId/correlationId，**不含 handle/proof/signature/bearer/tokenId**，rawDigest（64 hex） |
| 7 | 复用 canonical helper | ✅ 复用 `EnterpriseSessionPersistenceDigests.wireDigest/rawDigest/timestamp`，未复制 canonical JSON 算法 |
| 8 | 生产实现数 0（真实 source graph） | ✅ harness [run-eipc1131-harness.mjs](scripts/run-eipc1131-harness.mjs) 扫描 `src/main/java` 的 `implements VerifiedIdentityHandleResolver/EnterpriseSessionTokenCodec/EnterpriseBearerAuthorizer`，三个 count 均 0；test-only deterministic resolver/codec 在 `src/test/.../support/` 且 `testAdaptersProductionReachable=false` |
| 9 | 测试断言真实性 | ✅ 反查无 `@Disabled`/`@Ignore`；5 test class 覆盖 DecisionDomain/Digests/Ports/Boundary/ContractConformance |
| 10 | 边界零漂移 | ✅ 改动 = Central `authentication` domain/port + Central test（含 support test adapter）+ harness；未改 Core/Desktop/Renderer/Wire Contract/deploy（无 v0011）；`pnpm-lock.yaml` 保持 Aug 16 |

---

## 三、Central online 首跑偶发失败说明（非 EIPC-1.1.3.1 缺陷）

`check:central` 首跑 `Tests run: 351, Failures: 0, Errors: 1`，从零完整复跑 **351/0/0/0 / BUILD SUCCESS**。

- 本批未改 Central 生产代码（仅新增 authentication domain/port + test），该 Error 不可能由本批引入；
- 失败模式与既往 STRM/EIPC 各批记录的 Testcontainers 集成测试资源竞争/时序偶发一致；
- 复跑通过证明为偶发，非稳定缺陷。如实记录，不构成 EIPC-1.1.3.1 的 P 级缺陷。

---

## 四、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

EIPC-1.1.3.1 正确完成 Decision Domain / Ports / Canonical Material：strict `OpaqueVerifiedIdentityHandle`
（base64url 32~512 + 脱敏 toString）、`EnterpriseSessionTokenClaims`（固定 profile + issuer/audience/identity/
time/permission/Wire digest 校验）、sealed `EnterpriseBearerAuthorizationResult`（success/invalid/expired/
unavailable 判别联合）；三独立 digest domain（device source revision / permission source revision / lease
request），permission digest 强制精确覆盖请求权限全集（含 enabled/sourceRevision/updatedAt），compatibility
非负十进制，lease request digest 排除 handle/proof/signature/bearer/tokenId；Resolver/TokenCodec/Authorizer 三
Port 私有，signing/verification handle 隔离；test-only deterministic adapter 仅 test source set，harness 真实
source graph 扫描证明 production 三实现数均 0。门禁独立复跑全绿（harness 5 Java classes / 36 tests、check
240/1603 + 3 smoke、Central online 复跑 351/351、offline 351/351）。边界零漂移：仅改 Central domain/port/test
+ harness，未改 Core/Desktop/Renderer/Wire Contract/deploy（无 v0011），`pnpm-lock.yaml` 保持 Aug 16。

**EIPC-1.1.3.1 可进入用户接受流程；接受后 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与
identity composition blocker 仍保持打开。EIPC-1.1.3.2（Transactional Challenge / Session Lease）仍需单独方案/
差异复核并获用户明确编码授权；EIPC-1.1.3.3、EIPC-1.2～1.3、EIPC-2～3、STRM-3、DFI-4A.4.1～4A.4.3、
DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
