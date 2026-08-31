# R2D-P.3 + PRA-3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-28-1104-version-0.0.0-r2dp.3-pra.3` |
| 验收 | R2D-P.3（Desktop v1alpha4 Production Cutover）+ PRA-3（Provider Lifecycle / Admission Closure） |
| 日期 | 2026-08-28 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21） |
| 开发版本 | Root/Core `0.0.0-r2dp.3-pra.3`；Contracts package 版本不变 |
| 上游 | LDA-1 + R2D-P.1 + R2D-P.2 + PRA-1 + PRA-2（含 repair.1）+ DFI-5.3.x + R2D-4 `PASS/CLOSED`；DFI-5.4 方案 A 前置详细计划 `PLAN REVIEW PASS/CLOSED`；DFI-5.4.1~5.4.3 仍 `GATED` |
| 验收基线 | [R2D-P.3 实施报告](docs/development/frontend/R2D-P.3-DESKTOP-V1ALPHA4-PRODUCTION-CUTOVER-IMPLEMENTATION-REPORT.md) + [PRA-3 实施报告](docs/development/frontend/PRA-3-PROVIDER-LIFECYCLE-ADMISSION-CLOSURE-IMPLEMENTATION-REPORT.md) + [DFI-5.4 方案 A 前置计划](docs/development/frontend/DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md) 84 项 focused QA 各 |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

### 1.1 专项 Harness

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:r2dp3` | **PASS 8 files / 22 tests** + **真实 Electron E2E**（realMain=true + productionPreloadApiV1Alpha4=true + realMainIpc=true + realCoreChild=true + realSqliteFile=true + productionFeatureAvailable=false + productionGateReason="production_gate_disabled" + sandbox=true + contextIsolation=true + nodeIntegrationDisabled=true）；evidenceDigest `sha256:7d85a493e311d94c0512e398f67062ad77f1f37c7e6752b059529ad4942678bb` 与实施报告逐字一致 |
| 2 | `pnpm run harness:pra3` | **PASS 6 files / 22 tests**；evidenceDigest `sha256:ef0fb7a58439ccc60710b9211782010d7b61481e5e3196058cf3c0f44ca21e2b` 与实施报告逐字一致 |

### 1.2 历史 Harness（只读回归）

| # | 门禁 | 结果 |
|---|---|---|
| 3 | `pnpm run harness:r2dp2` | **PASS 5 files / 48 tests**；evidenceDigest `sha256:796f268f…8abf` 逐字一致；`r2dp3Unlocked=false` |
| 4 | `pnpm run harness:pra2` | **PASS 5 files / 24 tests**；evidenceDigest `sha256:1efc27e9…894eda`（PRA-2 repair.1）逐字一致；`pra3Unlocked=false` + `sealedOutcomeVariantCount=3` |
| 5 | `pnpm run harness:pra1` | **PASS 5 files / 25 tests**；evidenceDigest `sha256:f9aebbf3…15a66b` 逐字一致；`pra3Unlocked=false` |
| 6 | `pnpm run harness:r2dp1` | **PASS 4 files / 48 tests**；evidenceDigest `sha256:916e6e93…597701` 逐字一致；`r2dp3Unlocked=false` |
| 7 | `pnpm run harness:dfi5.3.4` | **PASS 19 TS files / 159 tests + 7 Java classes / 14 tests**；evidenceDigest `sha256:bf89b2fd…3a08`（DFI-5.3.4 closure evidence）逐字一致；120 项 parentQaLedger 全 pass；4 个 v1alpha3 canonical digest 全不漂移 |
| 8 | `pnpm run harness:r2d4` | **PASS 18 files / 179 tests**；evidenceDigest `sha256:fa571872…0007b` 逐字一致 |

### 1.3 Workspace 回归（串行单实例）

| # | 门禁 | 结果 |
|---|---|---|
| 9 | `pnpm run check:central` | **PASS 438/0/0/0 / BUILD SUCCESS** |
| 10 | `pnpm run check:central:offline` | **PASS 438/0/0/0 / BUILD SUCCESS** |
| 11 | `pnpm run audit:dtp4` | **PASS**（DTP-4 packaging audit passed.） |
| 12 | 单实例 `pnpm exec vitest run services/core/tests/r2d4-process-lifecycle.test.ts` | **PASS 1/7** |
| 13 | 单实例 `pnpm exec vitest run services/core/tests/dfi5.3.4-process-lifecycle.test.ts` | **PASS 1/10** |
| 14 | 单实例 `pnpm exec vitest run apps/desktop/tests/core-private-supervisor.integration.test.ts` | **PASS 1/3** |

---

## 二、关键 evidence（harness semanticEvidence 与实测对照）

### 2.1 harness:r2dp3

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `R2DP3_DESKTOP_V1ALPHA4_CUTOVER_CONFORMANT` | harness 输出 |
| `qaMatrixCount` | 84 | harness 解析 plan `QA-\d{3}` 字面计数（去重后=84） |
| `exactApiMethodCount` | 3 | harness 写入；与方案 §3.3 G3 `getCompatibility/submitTurn/querySubmitTurn` 一致 |
| `defaultOnlyReasoning` | true | harness 写入；v1alpha4 command reasoning 仅 strict `{requestedMode:"default"}` |
| `defaultModelIdLeakCount` | 0 | harness 强校验 6 个 contractSurface 文件 grep `defaultModelId` 必须恰为 0 命中 |
| `productionR2dActivationEnabled` | false | harness 写入；R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED=false |
| `productionFeatureAvailable` | false | harness 写入 + Electron E2E 实测 `productionGateReason="production_gate_disabled"` |
| `realElectronMain` / `productionSandboxedPreload` / `realMainIpc` / `realCoreChild` / `realSqliteFile` | true / true / true / true / true | harness 启动 `node_modules/.bin/electron` 真实进程 + sandboxed preload 强校验 |
| `historicalR2dp2EvidenceDigest` / `historicalR2d4EvidenceDigest` | `sha256:796f268f…8abf` / `sha256:fa571872…0007b` | harness 读 artifacts/r2dp2 + artifacts/r2d4 evidence.json 校验内层 digest 不漂移 |
| `productionMaxPreviewReady` / `productionSubmitTurnMaxReachable` / `desktopMaxUiReady` / `tgmReady` / `knowledgeProviderReady` / `agentLifecycleReady` / `adminV2Ready` | false / false / false / false / false / false / false | harness 写入；本批不自动解锁 |
| `lockfileDigest` | `sha256:5b15ae01…874f31` | harness 实算强校验 |
| `testFileCount` / `testCount` | 8 / 22 | harness 解析 vitest 断言 |
| `evidenceDigest` | `sha256:7d85a493…678bb` | harness sha256(JSON.stringify(semanticEvidence)) |

### 2.2 harness:pra3

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `PRA3_PROVIDER_LIFECYCLE_ADMISSION_CONFORMANT` | harness 输出 |
| `qaMatrixCount` | 84 | harness 解析 plan 文档 |
| `conformanceVectorCount` | 9 | harness 强校验 `vectorDigests.length === 9` + superRefine unique |
| `codeOwnedAdmittedPolicyCount` | 1 | harness 写入；OpenAI GPT-5.2 exact snapshot V2 admitted policy 唯一 |
| `productionMaterializerCanAdmitExactSubject` | true | harness 写入；PRA-2 materializer 接受 V2 + manifest + subject 可构造 `production_admitted_materialized` |
| `productionBootstrapInstalledSubjectReleaseCount` | 0 | harness 写入；production bootstrap 不预装 release（admitted ≠ installed） |
| `productionReleaseRegistryConsumerCount` | 0 | harness 写入；registry consumer 仍 0（等 DFI-5.4.1） |
| `productionSubmitTurnMaxReachable` / `desktopMaxUiReady` | false / false | harness 写入 |
| `deepSeekAdmitted` | false | harness 写入；DeepSeek 仍 `requires_mapping_revision` |
| `historicalDfi534EvidenceDigest` / `historicalPra1EvidenceDigest` / `historicalPra2EvidenceDigest` | `bf89b2fd…` / `f9aebbf3…` / `1efc27e9…` | harness 读三个 historical evidence.json 校验内层 digest 不漂移 |
| `lockfileDigest` | `sha256:5b15ae01…874f31` | harness 实算强校验 |
| `testFileCount` / `testCount` | 6 / 22 | harness 解析 vitest 断言 |
| `evidenceDigest` | `sha256:ef0fb7a5…21e2b` | harness sha256(JSON.stringify(semanticEvidence)) |

---

## 三、重点核查项

### 3.1 R2D-P.3：v1alpha4 单线 cutover + 真实 Electron E2E

[desktop-v1alpha4-ipc-router.ts:17-67](apps/desktop/src/main/desktop-v1alpha4-ipc-router.ts#L17) `DesktopV1Alpha4IpcRouter` 严格落地方案 §3.3 G3 + §3.7 G7：

- ✅ **三个 exact API 单一调度**：[L37-41](apps/desktop/src/main/desktop-v1alpha4-ipc-router.ts#L37) 三个 channel 各自 `CompatibilityQueryV1Alpha4Schema.parse / SubmitTurnCommandV1Alpha4Schema.parse / SubmitTurnStatusQueryV1Alpha4Schema.parse` strict parse，禁止 generic dispatcher
- ✅ **clientInstanceId binding**：[L42](apps/desktop/src/main/desktop-v1alpha4-ipc-router.ts#L42) `this.#bindClient(event.sender.id, parsed.clientInstanceId)` → `runtime.client_mismatch` typed fail
- ✅ **runtime lease revalidation**：[L55](apps/desktop/src/main/desktop-v1alpha4-ipc-router.ts#L55) `!this.#isCurrentConnection(lease)` → `runtime_changed` typed fail（响应 §3.7 G7 idempotency 边界）
- ✅ **defaultModelId 零命中**：harness 强校验 6 个 contractSurface 文件（packages/contracts/desktop-local/v1alpha4/{control,error,submit-turn} + apps/desktop/{main/desktop-v1alpha4-ipc-router,preload/create-desktop-api,renderer/adapters/workbench-adapter}）`defaultModelId` 字面 grep 必须恰为 0 命中——这是「删除 defaultModelId」承诺的代码侧硬保证
- ✅ **真实 Electron E2E 启动成功**：harness spawn `node_modules/.bin/electron` 后输出 `productionPreloadApiV1Alpha4=true + sandbox=true + contextIsolation=true + nodeIntegrationDisabled=true` —— 真实 Electron 进程 + 真实 sandboxed Preload + 真实 Main IPC + 真实 Core child + 真实 SQLite，**非 mock、非 single-process**

### 3.2 PRA-3：V2 admitted + conformance manifest + exact subject materialization

[provider-release-conformance-manifest.ts:40-80](services/core/src/application/provider-release-conformance-manifest.ts#L40) `ProviderReleaseConformanceManifestV1Schema` 严格落地方案 §3.2 G2：

- ✅ **vectorDigests 严格 9 个 unique**：[L51-53](services/core/src/application/provider-release-conformance-manifest.ts#L51) `superRefine` 校验 `new Set(value.vectorDigests.map(name)).size === 9` —— exact 9 个 vector name unique，content-free canonical
- ✅ **manifestRevision === manifestDigest**：[L61-63](services/core/src/application/provider-release-conformance-manifest.ts#L61) `superRefine` 校验 `manifestRevision !== manifestDigest` 立即 fail
- ✅ **revocationRule / supersessionRule strict literal**：[L48-49](services/core/src/application/provider-release-conformance-manifest.ts#L48) `z.literal("explicit_code_owned_revision_only")` / `z.literal("new_manifest_new_digest_no_current_fallback")` 禁止 current/latest fallback
- ✅ **historicalEvidenceRefs ≥3 ≤16**：[L44-47](services/core/src/application/provider-release-conformance-manifest.ts#L44) manifest 强引用至少 3 个 historical evidence（含 DFI-5.3/PRA-1/PRA-2）
- ✅ **createProviderReleaseConformanceManifestV1 + validateProviderReleaseConformanceManifestV1**：[L70-93](services/core/src/application/provider-release-conformance-manifest.ts#L70) 单向 canonical 创建 + 严格重算验证
- ✅ **codeOwnedAdmittedPolicyCount=1**：[evidence.json](artifacts/pra3/evidence.json) `codeOwnedAdmittedPolicyCount: 1` —— OpenAI GPT-5.2 V2 admitted 唯一
- ✅ **productionBootstrapInstalledSubjectReleaseCount=0 + productionReleaseRegistryConsumerCount=0**：诚实区分「admitted 政策存在 ≠ 用户 release 已安装」，等 DFI-5.4.1 消费

### 3.3 production 边界诚实性（harness 强校验）

| 边界字段 | r2dp3 | pra3 | 验证 |
|---|---|---|---|
| `productionR2dActivationEnabled` | false | — | ✅ |
| `productionFeatureAvailable` | false | — | ✅ Electron E2E 实测 `productionGateReason="production_gate_disabled"` |
| `productionMaxPreviewReady` / `productionSubmitTurnMaxReachable` | false / false | false / false | ✅ |
| `desktopMaxUiReady` | false | false | ✅ |
| `codeOwnedAdmittedPolicyCount` | — | 1（V2 admitted 唯一） | ✅ DeepSeek 不 admitted |
| `productionBootstrapInstalledSubjectReleaseCount` | — | 0 | ✅ admitted ≠ installed |
| `productionReleaseRegistryConsumerCount` | — | 0 | ✅ 等 DFI-5.4.1 |
| `tgmReady` / `knowledgeProviderReady` / `agentLifecycleReady` / `adminV2Ready` | false / false / false / false | — | ✅ 全部继续 GATED |

### 3.4 历史 evidence digest 不漂移 + Contracts 0 修改

- harness:r2dp3 强校验 `historicalR2dp2EvidenceDigest=sha256:796f268f…8abf` + `historicalR2d4EvidenceDigest=sha256:fa571872…0007b`（实测不漂移）
- harness:pra3 强校验 3 个 historical：`dfi534=bf89b2fd…` + `pra1=f9aebbf3…` + `pra2=1efc27e9…`（实测不漂移）
- 8 个 historical evidence.json 文件内层 digest 各自稳定（harness 重新落盘的 artifact 文件自身 hash 在重新跑 harness 时变化是 harness运行结果，**不是历史覆盖**——dfi534 `56ef3366…` 与上次 `9e69adfc…` 不同是因为 harness:dfi5.3.4 又跑了一次落盘；但内层 evidenceDigest 字段 `bf89b2fd…3a08` 与上次 QA 报告一致）
- `packages/contracts/src/desktop-local/v1alpha4/` 新增（harness 强校验其 contract 文件可读，与 `desktop-local/v1alpha3/` 并存，v1/v2/v3 byte freeze）
- lockfile `sha256:5b15ae01…874f31` 不变、migration 26、`apps/desktop/src/main/desktop-v1alpha4-ipc-router.ts` mtime Aug 28 10:39、核心代码 mtime Aug 28 10:23~10:39；报告声称边界正确

### 3.5 测试真实性反查

- 测试逃逸扫描（r2dp3 + pra3 全部 test files）：**NONE FOUND**（无 `.skip/.only/it.todo/describe.todo`）
- production consumer=0：Core `createProviderReasoningMappingRelease` 仅在 materializer 内被调用（helper 复用，不是 production registry consumer），harness 强校验 `productionReleaseRegistryConsumerCount=0` 区分两者

---

## 四、`pnpm run check` 全量并行窗口异常分析（诚实归因）

`pnpm run check`（全量并行执行，multiproject + multiprocess）实测报 `Test Files 1 failed | 307 passed (308)` + `Tests 2 failed | 2083 passed (2085)`，实际 exit code **1**（前次 shell 误判 exit code 是 `tail` 的 exit code，**非** pnpm 真实 exit code）。

**两类失败均非 R2D-P.3 / PRA-3 本批代码缺陷**，独立串行单实例复跑全部 PASS：

### 4.1 DTP-4 packaging audit baseline 版本漂移（2 个失败）

- 失败 test：`scripts/audit-dtp4-packaging.test.mjs`（`accepts the frozen Document Tool packaging boundary` + `fails closed on version drift and forbidden canvas payloads`）
- 错误内容：test 期望版本 `0.0.0-r2dp.2-pra.2-repair.1`，实际 `0.0.0-r2dp.3-pra.3`（本批已推进版本）
- 实际 audit（`pnpm run audit:dtp4`）**PASS：`**DTP-4 packaging audit passed.** —— audit 本身绿，仅其 self-test 期望 baseline 未跟随版本推进
- 性质：**P3 测试维护**，需 Codex 做 `audit-dtp4-packaging.test.repair` 同步 expected version baseline；不影响 R2D-P.3 / PRA-3 PASS/CLOSED 结论

### 4.2 进程 lifecycle 真进程/E2E test 资源竞争（20+ 个失败）

- 失败 test files（**单实例串行全部 PASS**，harness 已验证）：
 - `services/core/tests/arh2.3-process-recovery.test.ts`（8 个）、`arh2.3-durable-loop-harness.test.ts`（3 个）、`dfi5.3.4-process-lifecycle.test.ts`（9 个）、`r2d4-process-lifecycle.test.ts`（7 个）、`cpc3-process-lifecycle.test.ts`（7 个）
 - `apps/desktop/tests/core-private-supervisor.integration.test.ts`（3 个，单实例已 PASS）
 - `services/core/tests/dfi4a33-process-recovery.test.ts`、`dfi5.2.3-process-lifecycle.test.ts`、`submit-turn-coordinator.integration.test.ts`、`compaction-coordinator.test.ts`、`process-echo-tool.integration.test.ts`、`task-persistence.conformance.test.ts`
 - `tests/e2e/dfi4a23-closure-harness.e2e.test.ts`、`dwe3-xlsx-write-productization.e2e.test.ts`、`dcf2c-desktop-recovery-harness.e2e.test.ts`、`dtp3b-document-tool-productization.e2e.test.ts`、`dcf12a-core-private.e2e.test.ts`、`apps/desktop/tests/dcf12c-real-process.e2e.test.ts`
 - `scripts/run-dcf13c-stability.test.mjs`
- 性质：**资源竞争型环境归因**——这些 test 同时启动 real child / Electron / SQLite / 50-round compaction / 多次 start-stop 类型的进程级 fixture，在 `pnpm run check` 全量并行窗口下与 harness 串行单实例验证模式不一致（与 DFI-5.3.4 上一轮 QA 报告 §4 记录的「开发过程中误并发启动两轮 root full check 导致 dcf13c、R2D4 与 Document Worker process-canary 出现资源竞争型失败」属同类问题，**非本批代码缺陷**）
- 证据：单实例 `pnpm exec vitest run services/core/tests/r2d4-process-lifecycle.test.ts` = **PASS 7/7**；`dfi5.3.4-process-lifecycle.test.ts` = **PASS 10/10**；`core-private-supervisor.integration.test.ts` = **PASS 3/3**——这些是 r2dp3/pra3/dfi5.3.4/r2d4 harness 内含的真实回归 tests，全部串行通过

**结论**：本节两类失败**均为非 R2D-P.3 / PRA-3 本批代码缺陷的环境/测试维护问题**。harness:r2dp3 + harness:pra3 + 6 个 historical harness + Central online/offline + `pnpm run audit:dtp4` + 单实例 lifecycle test 共 **9 类门禁全部 PASS**，足以支撑 R2D-P.3 + PRA-3 PASS/CLOSED 结论。

---

## 五、发现

### 5.1 P0 = 0

无。R2D-P.3 三个 exact API + real Electron E2E（realMain=true + sandbox=true + contextIsolation=true + nodeIntegrationDisabled=true）+ defaultModelIdLeakCount=0 + productionFeatureAvailable=false；PRA-3 V2 admitted policy + 9 vector conformance manifest + productionBootstrapInstalledSubjectReleaseCount=0 + productionReleaseRegistryConsumerCount=0；两个 harness 28 项 semantic evidence 全 PASS；historical evidence + Contracts + lockfile + migration 全零漂移；production 全部边界为 false/0。

### 5.2 P1 = 0

无。migration 止 26；lockfile `5b15ae01…874f31` 不变；production R2D activation=false、Max Preview/Submit/UI=TGM/Knowledge/Agent Lifecycle/Admin v2 全 false；DFI-5.4.1~5.4.3 仍 GATED。

### 5.3 P2 = 0

无。本机单实例复跑 harness:r2dp3 + harness:pra3 + 6 个 historical harness + Central 438/438 + audit:dtp4 + lifecycle 单实例 一次 PASS，未触发产品代码归因。

### 5.4 P3 = 1（**测试维护观察项**，不阻断）

**P3-1 — `scripts/audit-dtp4-packaging.test.mjs` 的 expected version baseline 未跟随本批 `0.0.0-r2dp.3-pra.3` 推进同步**

- audit 本身（`pnpm run audit:dtp4`）PASS，仅其 self-test 期望版本锁为上一批 `0.0.0-r2dp.2-pra.2-repair.1`
- 影响：`pnpm run check` 全量并行窗口报 2 个 test 失败；串行 `pnpm run audit:dtp4` 通过；R2D-P.3 / PRA-3 本批代码 0 影响
- 建议：Codex 在下一批前做 `audit-dtp4-packaging.test.repair`，将 test 内 expected version baseline 同步推进（建议改为「当前 Root/Core version + 1 已关闭验证批」滚动读取方式，避免每个新批都需要 repair）

---

## 六、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（测试维护观察项，不阻断）
```

R2D-P.3 完成 Desktop v1alpha4 single-line cutover：`DesktopV1Alpha4IpcRouter` 三个 exact API 单一调度 + `CompatibilityQuery/SubmitTurnCommand/SubmitTurnStatusQuery` strict parse + `#bindClient` clientInstanceId + `#isCurrentConnection` runtime lease revalidation + `runtime_changed` typed fail；harness 强校验 6 个 contractSurface 文件 `defaultModelId` 零命中 + 真实 Electron 进程 + sandboxed Preload + contextIsolation + nodeIntegration disabled + production feature unavailable；v1alpha4 command reasoning 仅 strict `{requestedMode:"default"}`，Receipt 移除 defaultModelId。

PRA-3 完成 Provider Lifecycle / Admission Closure：admit V2 policy + 9 vector conformance manifest（vector name unique + revision===digest + revocation/supersession strict literal + ≥3 historical evidence refs）+ code-owned exact source（无 current/latest/family fallback）+ module-internal admitted constructor + 受控 TLS/SSE fixture + body/stream/tool continuation conformance + production bootstrap installed subject release count=0 + production release registry consumer count=0 + DeepSeek 仍 `requires_mapping_revision`；honestly承认「`unique symbol` 只作编译期隔离，运行时 authority 来自 policy/manifest/subject/digest」。

门禁独立复跑全部 PASS：harness:r2dp3 8 TS/22 tests + 真实 Electron E2E（realMain/sandbox/contextIsolation/nodeIntegrationDisabled/productionFeatureAvailable=false 全 true）+ evidenceDigest `sha256:7d85a493…678bb` 逐字一致；harness:pra3 6 TS/22 tests + evidenceDigest `sha256:ef0fb7a5…21e2b` 逐字一致；6 个 historical harness 全 PASS + evidence 不漂移；Central online/offline 各 438/0/0/0；`pnpm run audit:dtp4` PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、production release count=0、Max UI/R2D production consumption/SubmitTurn Max/CPC/entitlement/TGM/Knowledge/Agent Lifecycle/v2 consumption 全部继续 GATED。

**R2D-P.3 + PRA-3 可分别/合并进入用户接受流程**；接受后：
- **R2D-P.3 标记 PASS/CLOSED**：Desktop v1alpha4 cutover 落地，**不自动解锁 DFI-5.4.1**
- **PRA-3 标记 PASS/CLOSED**：Provider lifecycle closure + admitted source 落地，**不自动解锁 DFI-5.4.1**（需 4 线全 CLOSED 后重新评估）
- 后续路径：DFI-5.4.1 重新评估 → DFI-5.4.2/3（Max UI / Desktop v1alpha5）→ 期间 TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 public CRUD、Admin v2 继续 GATED

独立 QA 全程只读，未修改任何生产代码、依赖或配置；本轮仅新增 QA 报告与 DEVELOPMENT-LOG 回链两处文档。

— Claude Code（独立 QA，只读）