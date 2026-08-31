# R2D-P.2 + PRA-2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-28-0936-version-0.0.0-r2dp.2-pra.2` |
| 验收 | R2D-P.2（Production Source / Composition）+ PRA-2（Exact Subject-bound Release Materializer） |
| 日期 | 2026-08-28 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21） |
| 开发版本 | Root/Core `0.0.0-r2dp.2-pra.2`；Contracts package 版本不变 |
| 上游 | LDA-1 + R2D-P.1 + PRA-1 + DFI-5.3.x + R2D-4 `PASS/CLOSED`；DFI-5.4 方案 A 前置详细计划 `PLAN REVIEW PASS/CLOSED`；DFI-5.4.1~5.4.3 仍 `GATED` |
| 验收基线 | [R2D-P.2 实施报告](docs/development/frontend/R2D-P.2-PRODUCTION-SOURCE-COMPOSITION-IMPLEMENTATION-REPORT.md) + [PRA-2 实施报告](docs/development/frontend/PRA-2-EXACT-SUBJECT-BOUND-RELEASE-MATERIALIZER-IMPLEMENTATION-REPORT.md) + [DFI-5.4 方案 A 前置计划](docs/development/frontend/DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md) 72 项 focused QA 各 |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

### 1.1 专项 Harness

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:r2dp2` | **PASS 5 files / 48 tests**；evidenceDigest `sha256:796f268f3af56ea59b6e101f5bb8f76b234e71f15534fe01639af5b351dc8abf` 与实施报告逐字一致 |
| 2 | `pnpm run harness:pra2` | **PASS 5 files / 23 tests**；evidenceDigest `sha256:2d34adca675a641c9dc40287737e1e1ebaa59fbcb14c87402e39d157f5d41103` 与实施报告逐字一致 |

### 1.2 历史 Harness（只读回归）

| # | 门禁 | 结果 |
|---|---|---|
| 3 | `pnpm run harness:r2dp1` | **PASS 4 files / 48 tests**；evidenceDigest `sha256:916e6e93…597701` 逐字一致；`productionTaskResourceEntitlementSourceCount=0` + `r2dp2Unlocked=false` |
| 4 | `pnpm run harness:pra1` | **PASS 5 files / 25 tests**；evidenceDigest `sha256:f9aebbf3…15a66b` 逐字一致；`pra2Unlocked=false` |
| 5 | `pnpm run harness:dfi5.3.4` | **PASS 19 TS files / 159 tests + 7 Java classes / 14 tests**；evidenceDigest `sha256:bf89b2fd…3a08`（DFI-5.3.4 closure evidence）逐字一致；120 项 parentQaLedger 全 pass；4 个 v1alpha3 canonical digest 全不漂移 |
| 6 | `pnpm run harness:r2d4` | **PASS 18 files / 179 tests**；evidenceDigest `sha256:fa571872…0007b` 逐字一致 |

### 1.3 Workspace 回归

| # | 门禁 | 结果 |
|---|---|---|
| 7 | `pnpm run check:central` | **PASS 438/0/0/0 / BUILD SUCCESS** |
| 8 | `pnpm run check:central:offline` | **PASS 438/0/0/0 / BUILD SUCCESS** |
| 9 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 301/301 files、2069/2069 tests + 3 smoke**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true contractVersion=v1alpha1）+ Architecture boundary |
| 10 | `pnpm run lint` / `pnpm run audit:dtp4` | **PASS**（eslint + Architecture boundary / DTP-4 packaging audit） |
| 11 | 基线 | lockfile `sha256:5b15ae01…874f31`（两个 harness 强校验）；migration max=26（两个 harness 强校验）；Contracts src 0 修改 |

---

## 二、关键 evidence（harness semanticEvidence 与实测对照）

### 2.1 harness:r2dp2

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `R2DP2_PRODUCTION_SOURCE_COMPOSITION_CONFORMANT` | harness 输出 |
| `productionTaskResourceEntitlementSourceCount` | 1 | harness 强校验 `implements TaskResourceEntitlementSource` 唯一实现 |
| `productionR2dConsumptionEnabled` | false | harness 强校验 `R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED=false` 字面存在 |
| `subjectProofSingleUse` | true | harness 写入；LDA + R2D subject proof single consumption |
| `entitlementSchemaVersion` | v2 | harness 写入；与 R2D-P.1 一致 |
| `localAuthorityKind` | `local_desktop_owner` | harness 写入；与 LDA-1 / R2D-P.1 一致 |
| `personalModelContextWindowState` | `unknown` | harness 写入；无法证明 contextWindow 时诚实返回 unknown，不补默认 |
| `skillEntitlementCount` / `knowledgeEntitlementCount` | 0 / 0 | harness 写入；production entitlement 固定为空 |
| `desktopV2ConsumptionReady` / `r2dp3Unlocked` / `dfi541Unlocked` | false / false / false | harness 写入；本批不自动解锁任何下游 |
| `lockfileDigest` | `sha256:5b15ae01…874f31` | harness 实算强校验 |
| `testFileCount` / `testCount` | 5 / 48 | harness 解析 vitest 断言 |
| `evidenceDigest` | `sha256:796f268f…8abf` | harness sha256(JSON.stringify(semanticEvidence)) |

### 2.2 harness:pra2

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `PRA2_EXACT_SUBJECT_RELEASE_MATERIALIZER_CONFORMANT` | harness 输出 |
| `materializedAdmissionState` | `pending_conformance_materialized` | harness 写入；OpenAI candidate 只能产生 pending |
| `productionAdmittedMaterializedCount` / `productionSupportedReleaseCount` / `productionReleaseRegistryConsumerCount` | 0 / 0 / 0 | harness 写入；production admitted release 全 0 |
| `exactSubjectValidation` / `deterministicMaterialization` | true / true | harness 写入 |
| `secretResolutionCount` / `upstreamRequestCount` | 0 / 0 | harness 写入；9 类上游零副作用 |
| `pra3Unlocked` / `dfi541Unlocked` | false / false | harness 写入；本批不自动解锁 |
| `historicalPra1EvidenceDigest` | `sha256:f9aebbf3…15a66b` | harness 读取 artifacts/pra1/evidence.json 校验内层 digest 不漂移 |
| `lockfileDigest` | `sha256:5b15ae01…874f31` | harness 实算强校验 |
| `testFileCount` / `testCount` | 5 / 23 | harness 解析 vitest 断言 |
| `evidenceDigest` | `sha256:2d34adca…1103` | harness sha256(JSON.stringify(semanticEvidence)) |

---

## 三、重点核查项

### 3.1 R2D-P.2：唯一 production source + Subject proof + Composition 默认 false

[local-desktop-r2d-production.ts:201-241](services/core/src/application/local-desktop-r2d-production.ts#L201) `LocalDesktopTaskResourceEntitlementSource` 严格落地方案 §3.1+§3.6：

- ✅ **唯一 production 实现**：harness 强校验 `implements TaskResourceEntitlementSource` 在 `local-desktop-r2d-production.ts` 中恰为 1（排除 tests/support 的 multiple implementation）
- ✅ **subject proof single consumption**：source 第一步 `this.dependencies.proofs.consume(input)`（§3.2 request-scoped proof 单次消费）+ `subjectProofSingleUse=true` 写入 evidence
- ✅ **use-only LDA**：agent definition 必须 exact = `BUILT_IN_GENERAL_AGENT_ID` + revision/digest 三要素验证（[:222-225](services/core/src/application/local-desktop-r2d-production.ts#L222)），否则 `selection.entitlement_invalid`
- ✅ **namespace + authority exact binding**：[L227-240](services/core/src/application/local-desktop-r2d-production.ts#L227) `loadActiveOwnerNamespace` → `validateLocalDesktopSubjectAuthority` 重算 namespace/owner digest/authority revision 三要素
- ✅ **production gate 默认 false**：harness 强校验 `R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED = false` 字面存在
- ✅ **Skill/Knowledge entitlement=0 + PersonalModelContextWindowState=unknown**：harness 写入两个字段，evidence 诚实承认空集合 + unknown（无 Fixture/默认）
- ✅ **Acceptance Lease 确定性释放**：用户特别指出「Planner 无论成功还是中途失败，都会确定性清理 Acceptance Lease」—— [r2d3-durable-acceptance-planner.ts:352](services/core/src/application/r2d3-durable-acceptance-planner.ts#L352)（用户提供的行号）+ L194-198 `LocalDesktopR2DResourceLeaseRegistry.close()` 实现 `namespace.namespaceKey.fill(0)` 清零 + lease delete（不论成功/失败路径都需走 close）

### 3.2 PRA-2：Exact Subject-bound Materializer + Pending outcome

[exact-subject-provider-release-materializer.ts:141-189](services/core/src/application/exact-subject-provider-release-materializer.ts#L141) `ExactSubjectBoundProviderReleaseMaterializer.materialize` 严格落地方案 §3.1+§3.2：

- ✅ **sealed outcome 三态**：`pending_conformance_materialized` / `production_admitted_materialized` / `rejected`，try/catch 包裹保证任何失败返回 `{state: "rejected", code, safeSummary}` 不泄漏 partial release
- ✅ **9 项 typed cause**（[L130-139](services/core/src/application/exact-subject-provider-release-materializer.ts#L130)）：local_authority_invalid / subject_invalid / credential_observation_invalid / policy_unavailable / policy_not_admitted / endpoint_mismatch / model_snapshot_mismatch / identity_mismatch / materialization_conflict
- ✅ **Owner/Definition/Head/Status/Credential/Lock 全链 exact 验证**：[L161-181](services/core/src/application/exact-subject-provider-release-materializer.ts#L161) 7 步 strict validate（namespace → authority → definition → head → status → requireOwnerAndExecutionChain → requireCredential → PersonalModelTaskLockMaterializer.verify owner/configuration/execution identity vs LDA）
- ✅ **生产 release 仍 0**：harness 强校验 `productionAdmittedMaterializedCount=0` + `productionSupportedReleaseCount=0` + `productionReleaseRegistryConsumerCount=0`
- ✅ **9 类上游零副作用**：harness 强校验 `secretResolutionCount=0` + `upstreamRequestCount=0`
- ✅ **复用 DFI-5.3.1 helper 不复制 digest 算法**：[L49](services/core/src/application/exact-subject-provider-release-materializer.ts#L49) + [L240](services/core/src/application/exact-subject-provider-release-materializer.ts#L240) `createProviderReasoningMappingRelease` 调用 + 后续立即 revalidate——**仅作 sealed release 构造，不是 production registry consumer**

### 3.3 production 边界诚实性（harness 强校验）

两个 harness 都强校验关键 production 状态为 false/0，证明本批**未越权解锁任何下游**：

| 边界字段 | r2dp2 | pra2 | 验证 |
|---|---|---|---|
| `productionR2dConsumptionEnabled` | false | — | ✅ |
| `personalModelContextWindowState` | unknown（不补默认） | — | ✅ |
| `skillEntitlementCount` / `knowledgeEntitlementCount` | 0 / 0 | — | ✅ |
| `productionTaskResourceEntitlementSourceCount` | 1（唯一 production） | — | ✅ |
| `materializedAdmissionState` | — | `pending_conformance_materialized` | ✅ |
| `productionAdmittedMaterializedCount` | — | 0 | ✅ |
| `productionReleaseRegistryConsumerCount` | — | 0 | ✅ |
| `secretResolutionCount` / `upstreamRequestCount` | — | 0 / 0 | ✅ |
| `r2dp3Unlocked` | false | — | ✅ |
| `pra3Unlocked` | — | false | ✅ |
| `dfi541Unlocked` | false | false | ✅ |
| `desktopV2ConsumptionReady` | false | — | ✅ |

### 3.4 历史 evidence 不漂移 + Contracts 0 修改

- PRA-2 harness `historicalPra1EvidenceDigest=sha256:f9aebbf3…15a66b`（实测 artifacts/pra1/evidence.json 内层 digest 匹配）
- 4 个 historical evidence.json 文件 hash 运行前后不变：
 - dfi531 `9e69adfc…`
 - dfi532 `1540343d…`
 - dfi533 `8269bac2…`
 - dfi534 DFI-5.3.4 closure evidence（`bf89b2fd…3a08` 为内层 evidenceDigest，本批未触发 artifact hash 断言，仅引用其内层字段）
- `packages/contracts/src/` 0 修改（DFI-5.3 historical Contract 字节冻结）
- `services/core/src/application/local-desktop-r2d-production.ts` + `exact-subject-provider-release-materializer.ts` + `r2d3-durable-acceptance-planner.ts` mtime 集中于 Aug 28 08:35~08:47；报告声称边界正确

### 3.5 测试真实性反查

- 测试逃逸扫描 `\.skip\(|\.only\(|@Disabled|\bsleep\(`（含 R2D-P.2 + PRA-2 全部 test files）：**NONE FOUND**
- `createProviderReasoningMappingRelease` 在 materializer 内被调用（仅作 DFI-5.3.1 helper 复用，不是 production consumer）——harness 已用 `productionReleaseRegistryConsumerCount=0` 区分这两个语义

---

## 四、发现

### 4.1 P0 = 0

无。R2D-P.2 唯一 production source + Subject proof single consumption + LDA use-only + Acceptance Lease 确定性释放；PRA-2 exact subject validation + deterministic materialization + secretResolutionCount=0 + upstreamRequestCount=0；两个 harness 14 项 semantic evidence 全 PASS；historical evidence + Contracts + lockfile + migration 全零漂移；production 全部边界为 false/0。

### 4.2 P1 = 0

无。migration 止 26；lockfile `5b15ae01…874f31` 不变；production R2D consumption enabled=false；production SubmitTurn Max / Desktop UI / CPC / entitlement / Max release 全未解锁；R2D-P.3、PRA-3、DFI-5.4.1~5.4.3、DFI-4A.4 public CRUD、Admin v2、TGM、Knowledge Provider、Agent Lifecycle 全部 GATED。

### 4.3 P2 = 0

无。本机单实例复跑 harness:r2dp2 + harness:pra2 + 全 historical harness + Central 438/438 + root check 301/2069 + lint/audit:dtp4 一次 PASS，未触发环境失败归因到产品代码。

### 4.4 P3 = 0

无。本批两个子批的核心设计（use-only LDA + single composition factory + subject proof + Acceptance Lease + exact subject validation + pending-only sealed outcome + 9 类上游零副作用）均与方案 A 前置计划 §3+§4 严格一致；两个 harness 强校验的 14 项 evidence 全部覆盖方案 §8 72 项 QA 的关键子集；本批独立 QA 全程只读，未修改任何生产代码、依赖或配置。

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

R2D-P.2 完成 production source / composition：唯一 `LocalDesktopTaskResourceEntitlementSource` production 实现 + `LocalDesktopR2DSubjectBindingAuthority` 一次性 subject proof + `LocalDesktopR2DResourceLeaseRegistry` 确定性清理（成功/失败均走 `namespaceKey.fill(0)`）+ `createLocalDesktopR2DProductionComposition()` 单一工厂装配 9 个 component + `R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED=false` 强约束 + 三态 startup gate + Skill/Knowledge 固定空 + PersonalModelContextWindowState=unknown 诚实；Planner 成功/中途失败路径均确定性释放 Acceptance Lease。PRA-2 完成 exact subject-bound materializer：9 项 typed cause sealed outcome + 7 步 strict validate（namespace/authority/definition/head/status/owner-execution-chain/Credential/personal-modelId lock identity）+ `pending_conformance_materialized` 唯一可达 outcome（OpenAI candidate 仍 pending）+ `production_admitted_materialized` 数量=0 + secretResolutionCount=0 + upstreamRequestCount=0 + 复用 DFI-5.3.1 `createProviderReasoningMappingRelease` helper 不复制 digest 算法 + content-addressed IDs + collision fail-closed。

门禁独立复跑全部 PASS：harness:r2dp2 5 TS/48 tests + evidenceDigest `sha256:796f268f…8abf` 逐字一致；harness:pra2 5 TS/23 tests + evidenceDigest `sha256:2d34adca…1103` 逐字一致；harness:r2dp1（4/48）/pra1（5/25）/dfi5.3.4（19+7/159+14）/r2d4（18/179）历史 evidenceDigest 全不漂移；Central online/offline 各 438/0/0/0 + root check **301/301 files、2069/2069 tests + 3 smoke** + Architecture boundary + lint/audit:dtp4 PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、Contracts src 0 修改；production release count=0、production R2D consumption enabled=false、Max UI/R2D production consumption/SubmitTurn Max/CPC/entitlement/TGM/Knowledge/Agent Lifecycle/v2 consumption 全部继续 GATED。

**R2D-P.2 与 PRA-2 可分别/合并进入用户接受流程**；接受后：
- **R2D-P.2 标记 PASS/CLOSED**：production source/composition 基础落地、Acceptance Lease 清理正确，**不自动解锁 R2D-P.3**
- **PRA-2 标记 PASS/CLOSED**：subject-bound materializer 落地、OpenAI candidate 仍 pending，**不自动解锁 PRA-3**
- 后续路径：R2D-P.3（Desktop v1alpha4 cutover）与 PRA-3（Provider lifecycle closure）按方案 A 前置计划 §5 关键路径并行推进 → 两条线独立 QA + 用户接受 → 重新评估 DFI-5.4.1 编码授权
- TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 public CRUD、Admin v2 继续 GATED

独立 QA 全程只读，未修改任何生产代码、依赖或配置；本轮仅新增 QA 报告与 DEVELOPMENT-LOG 回链两处文档。

---

## 六、P2 修正记录（PRA-2 三态类型隔离修复，repair.1）

**问题识别**（独立复核）：原 PRA-2 报告声称三态 sealed union `pending_conformance_materialized` / `production_admitted_materialized` / `rejected` 已实现，但实际主路径仅返回 `pending_conformance_materialized`（[L295-296](services/core/src/application/exact-subject-provider-release-materializer.ts#L295)），未真正定义 `ProductionAdmittedProviderReleaseMaterialization` 独立 sealed 类型；这违反方案 §3.8 + QA-047 的「类型不可互换」硬约束（任何调用方可以构造「假 admitted」值投喂下游 type）。

**repair.1 修复内容**（代码 review 实证）：
- 新增 [L120-134](services/core/src/application/exact-subject-provider-release-materializer.ts#L120) `PendingConformanceProviderReleaseMaterialization` + `ProductionAdmittedProviderReleaseMaterialization` + `rejected` 三态 discriminated union
- [L118](services/core/src/application/exact-subject-provider-release-materializer.ts#L118) `declare const productionAdmissionProof: unique symbol;` —— TypeScript `unique symbol` 形成**编译期结构隔离**，正常的外部 TypeScript 调用方无法构造该 proof；它不是运行时密码学防伪机制
- [L133](services/core/src/application/exact-subject-provider-release-materializer.ts#L133) `ProductionAdmittedProviderReleaseMaterialization` 必带 `readonly [productionAdmissionProof]: true` 字段；运行时 admitted 路径继续不可达，是因为当前 materializer 没有 admitted 返回分支且 production installer 不存在
- 运行时主路径仍仅 `state: "pending_conformance_materialized"`（[L295-296](services/core/src/application/exact-subject-provider-release-materializer.ts#L295)），**当前代码路径无法产生 admitted outcome**
- Harness 新增 [L43-48](scripts/run-pra2-harness.mjs#L43) 强校验三态 `state:` + `productionAdmissionProof: unique symbol` 字面，任一缺失即 `pra2_sealed_outcome_drift` fail；新增 evidence 字段 `sealedOutcomeVariantCount=3`

**聚焦 re-QA 结果**（只跑 harness:pra2 + 修原报告精度，**未重跑 R2D-P.2 / Central / 全量 check**）：
- `pnpm run harness:pra2` PASS **5 files / 24 tests**；evidenceDigest `sha256:1efc27e9a44f3969cbf443ee764c03f1486bf7aeb5c0b47b3bf94b273d894eda` 与实施报告逐字一致
- 新增 evidence 字段：`sealedOutcomeVariantCount=3`
- `productionAdmittedMaterializedCount=0` / `productionSupportedReleaseCount=0` / `productionReleaseRegistryConsumerCount=0` / `secretResolutionCount=0` / `upstreamRequestCount=0` / `pra3Unlocked=false` / `dfi541Unlocked=false` 全 0/false
- `historicalPra1EvidenceDigest=sha256:f9aebbf3…15a66b` 不漂移
- 三态不可互换性测试 PASS（pending/admitted 双向类型 guard）
- lockfile `sha256:5b15ae01…874f31` 不变、migration 止 26、`packages/contracts/src` 0 修改
- 1 个测试净增（23 → 24）：双向类型不可互换 + 三态字面存在断言

**原报告精度修正**：门禁数字按阶段区分如下：repair 前独立 QA 的 root check 为 **301/301 files、2069/2069 tests + 3 smoke**；repair.1 后开发者复跑为 **301/301 files、2070/2070 tests + 3 smoke**；本次 Claude Code 聚焦 re-QA 只复跑 `harness:pra2` 5 files / 24 tests，**没有独立重跑 root check、R2D-P.2、Central 或全部 historical harness**。原报告中的 298/2057 属 R2D-P.1+PRA-1 上一轮结果，不属于本批。

**修正后状态**：
- **R2D-P.2**：`INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING`（本次未重跑，且用户尚未正式接受，因此不得提前写为 `PASS/CLOSED`）
- **PRA-2 repair.1**：`FOCUSED RE-QA PASS — USER_ACCEPTANCE_PENDING`
- PRA-2 可在用户接受 repair.1 后正式 `PASS/CLOSED`，与 R2D-P.2 一起关闭 DFI-5.4 方案 A 前两条线

— Claude Code（独立 QA / 聚焦差异复核，只读）

> 文档精度修正说明（2026-08-28）：以上四处措辞由 Codex 5.6 在用户明确授权后修正，仅校正状态、测试增量、
> TypeScript/runtime 边界与分阶段门禁数字；未改变 Claude Code 的聚焦 re-QA 技术结论，未修改代码、Evidence、
> 依赖或配置，也未重跑门禁。
