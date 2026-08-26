# EIPC-0 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-22-1935-version-eipc.0` |
| 验收对象 | EIPC-0：Enterprise Identity Authority Semantics Foundation |
| 日期 | 2026-08-22 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root `0.0.0-eipc.0`；Core/Desktop/Contracts `0.0.0-dfi.4a.3.3`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:eipc0` | **PASS**：Node 5 files / 40 tests + Java 1 conformance class；`outcome=AUTHORITY_SEMANTICS_FROZEN`；`productionIdentityReady=false`；`identityCompositionBlockerClosed=false`；敏感命中 0 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 229 files / 1522 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **FAIL**（见下：既有 Alignment2b2 双节点测试 Testcontainers 资源竞争，非 EIPC-0 缺陷） |
| 4 | EIPC-0 Java conformance 单独复跑 | **PASS 5 tests / 0 failures**（`EnterpriseIdentityCompositionContractConformanceTest`，Central 307 = 302 + 5 的来源） |
| 5 | Alignment2b2 双节点测试单独复跑 | **PASS 2 tests / BUILD SUCCESS**（全量跑时因资源竞争偶发失败） |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 唯一结论 AUTHORITY_SEMANTICS_FROZEN | ✅ Harness 明确输出 `AUTHORITY_SEMANTICS_FROZEN` + `productionIdentityReady:false` + `identityCompositionBlockerClosed:false`，不宣称 READY、不关闭 blocker |
| 2 | OwnerIdentity 排除 clientInstanceId | ✅ [enterprise-identity-authority-semantics.ts](services/core/src/application/enterprise-identity-authority-semantics.ts) `OwnerIdentity = enterpriseId + userId + deviceId`（104-106 行），排除 clientInstanceId |
| 3 | activation vs current client 分离 | ✅ 测试断言「keeps activation and current client instances separate during explicit rebind」；current client mismatch → `enterprise_identity.scope_mismatch` 失败关闭 |
| 4 | 显式 compatible / incompatible | ✅ `compatibilityState === "compatible"`（75 行）；测试断言「requires an explicit compatible Runtime Active fact」+ incompatible 拒绝 |
| 5 | CGF-1.3 状态 2/3 | ✅ `projectEnterpriseOfflineState` + `mayUseActiveFacts`（online 或 service_temporarily_unavailable 且 locallyExecutableCapabilitiesMayContinue）；测试覆盖 state 2 允许/无本地能力不 grant/state 3 拒绝/recovered update 不静默应用 |
| 6 | token + policy 双重 entitlement | ✅ 测试断言「requires both token permission and activated policy entitlement」 |
| 7 | scope drift / tamper 失败关闭 | ✅ 测试断言 Runtime Active owner drift、Device Trust drift、tampered session/trust facts 均失败关闭 |
| 8 | 三端 conformance | ✅ TS Contract + Core semantics + Java conformance（5 tests）三端一致 |
| 9 | Core-private boundary | ✅ 新增 `RuntimeActiveEnterpriseSessionAuthorityProvider` Port（只冻结语义，无 production implementation）；Main/Preload/Renderer 不导入；migration 24 仍最新、不新增 25；诚实指出 Gateway permission enum 不含 `personal_model.configure`（EIPC-1 前置） |
| 10 | 边界零漂移 | ✅ 改动 = `packages/contracts/enterprise-identity-composition/**` + `services/core/application+ports` + `services/central-service/src/test/java`（test-only conformance）+ tests；未改 Main/Preload/Renderer/Central 生产代码/migration 1-24；`pnpm-lock.yaml` 保持 Aug 16 |
| 11 | 测试断言真实性 | ✅ 反查无空断言/`it.skip`；13 个 semantics 测试覆盖 online/state2/state3/recovered/rebind/entitlement/compatible/drift/tamper 全场景 |

---

## 三、Central online 失败的说明（非 EIPC-0 缺陷）

`check:central` 全量跑时 `Alignment2b2DualNodeFoundationIntegrationTest.closesFailureRecoveryAndResourceMatrixAcrossDualJvms` 失败，错误 `schema installation could not acquire a database transaction`。

- 该测试 mtime **Aug 14**（ARH-2.2 既有双节点集群测试），**不是 EIPC-0 引入**（EIPC-0 只加 `EnterpriseIdentityCompositionContractConformanceTest`，mtime Aug 22）；
- 该测试**单独复跑 PASS**（2 tests / BUILD SUCCESS），说明是**全量跑时的 Testcontainers 资源竞争**（双节点测试需多个 JVM + Postgres 容器并发，schema 安装事务获取超时），非稳定代码缺陷；
- EIPC-0 的 Java conformance（5 tests）**单独复跑 PASS**，是 Central 307 = 302 + 5 的增量来源。

结论：Central 全量跑的偶发失败是既有测试的环境/资源问题，不构成 EIPC-0 的 P 级缺陷，但如实记录。

---

## 四、发现

### EIPC-0 本批范围：P0 = 0，P1 = 0，P2 = 0，P3 = 0

（Central 全量跑 Alignment2b2 资源竞争偶发失败，为既有测试环境问题，非本批缺陷。）

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

EIPC-0 正确完成 Enterprise Identity Authority Semantics Foundation：冻结 `eipc.v1alpha1` Contract 与
authority semantics（OwnerIdentity 排除 clientInstanceId、activation/current client 分离、显式 compatible、
CGF-1.3 状态 2/3、token+policy 双重 entitlement、scope drift/tamper 失败关闭）；TS + Core + Java 三端
canonical conformance；唯一结论 `AUTHORITY_SEMANTICS_FROZEN`，**不宣称 IDENTITY_COMPOSITION_READY、
不关闭 blocker**（production composition 仍保留固定 activeUserId）。Harness 独立复跑 PASS（Node 5/40 +
Java conformance + 敏感命中 0）、完整 check 229/1522 + 3 smoke 全绿。Central 全量跑 Alignment2b2 双节点
测试因 Testcontainers 资源竞争偶发失败（单独跑 PASS），为既有测试环境问题，非本批缺陷。边界零漂移：
未改 Main/Preload/Renderer/Central 生产代码/migration 1-24，`pnpm-lock.yaml` 保持 Aug 16。

**EIPC-0 可进入用户接受流程。接受后单独授权 STRM-0；EIPC-1～EIPC-3、DFI-4A.4.1～4A.4.3、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
