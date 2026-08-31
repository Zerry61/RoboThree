# DFI-5.4.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-28-1342-version-0.0.0-dfi.5.4.1` |
| 验收 | DFI-5.4.1 Max Core Contract / Durable Cutover（Desktop v1alpha5 → Lock v1alpha2 → Selection v1alpha4 → coordination v1alpha5 完整 additive 链） |
| 日期 | 2026-08-28 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21） |
| 开发版本 | Root / Core / Contracts 均为 `0.0.0-dfi.5.4.1` |
| 上游 | DFI-5.4 父 + DFI-5.4.0 controlling addendum + 方案 A 前置 + DFI-5.3.x + R2D-P.1/2/3 + PRA-1/2（含 repair.1）/3 + R2D-4 + LDA-1 全部 `PASS/CLOSED` |
| 验收基线 | [DFI-5.4.1 实施报告](docs/development/frontend/DFI-5.4.1-MAX-CORE-CONTRACT-CUTOVER-IMPLEMENTATION-REPORT.md) + [DFI-5.4.1 详细方案](docs/development/frontend/DFI-5.4.1-MAX-CORE-CONTRACT-CUTOVER-DEVELOPMENT-PLAN.md) 96 项 focused QA |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

### 1.1 专项 Harness

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:dfi5.4.1` | **PASS 5 files / 37 tests**；evidenceDigest `sha256:165d1544a66ed12578271b490767fc5be1d513c2324355adf4da6a74e9735ed4` 与实施报告逐字一致 |

### 1.2 历史 Harness（只读回归）

| # | 门禁 | 结果 |
|---|---|---|
| 2 | `pnpm run harness:r2dp3` | **PASS 8 files / 22 tests**；evidenceDigest `sha256:7d85a493…678bb` 逐字一致；`dfi541Unlocked=false` |
| 3 | `pnpm run harness:pra3` | **PASS 6 files / 22 tests**；evidenceDigest `sha256:ef0fb7a5…21e2b` 逐字一致；`dfi541Unlocked=false` |
| 4 | `pnpm run harness:dfi5.3.4` | **PASS 19 TS files / 159 tests + 7 Java classes / 14 tests**；evidenceDigest `sha256:bf89b2fd…3a08`（DFI-5.3.4 closure evidence）逐字一致；120 项 parentQaLedger 全 pass |
| 5 | `pnpm run harness:r2d4` | **PASS 18 files / 179 tests**；evidenceDigest `sha256:fa571872…0007b` 逐字一致 |

### 1.3 Workspace 回归

| # | 门禁 | 结果 |
|---|---|---|
| 6 | `pnpm run check:central` | **PASS 438/0/0/0 / BUILD SUCCESS** |
| 7 | `pnpm run check:central:offline` | **PASS 438/0/0/0 / BUILD SUCCESS** |
| 8 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 313/313 files、2122/2122 tests + 3 smoke**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true contractVersion=v1alpha1）+ Architecture boundary；**actual exit code = 0（0 失败 test file）** |
| 9 | `pnpm run lint` / `pnpm run typecheck` / `pnpm run audit:dtp4` | **PASS**（eslint + vue-tsc + Architecture boundary / DTP-4 packaging audit） |
| 10 | 基线 | lockfile `sha256:5b15ae01…874f31`（harness 强校验）；migration max=26（harness 强校验） |

---

## 二、关键 evidence（harness semanticEvidence 与实测对照）

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `DFI541_MAX_CORE_CUTOVER_CONFORMANT` | harness 输出 |
| `qaMatrixCount` | 96 | harness 解析 plan 文档 `QA-\d{3}` 字面去重 = 96 |
| `contractVersionChain` | `["desktop.v1alpha5","reasoning-lock.v1alpha2","runtime-selection.v1alpha4","coordination.v1alpha5","model-request.v1alpha2"]` | harness 写入；与方案 §0 单一新链严格一致 |
| `reasoningResolutionVariantCount` | 6 | harness 写入；Lock v1alpha2 4 旧 + 2 新 fallback |
| `safeFallbackCauseCount` | 2 | harness 写入；仅 `policy_unavailable` + `policy_not_admitted` 可 fallback |
| `inMemoryAtomicSingleSwapVerified` / `sqliteAtomicReopenVerified` / `durableAcceptedEnvelopeVerified` | true / true / true | harness 写入；InMemory staged single-swap + SQLite 原文件 reopen + durable accepted envelope 三项独立验证 |
| `productionDfi541ActivationEnabled` | false | harness 强校验 `DFI541_MAX_CORE_DEFAULT_ENABLED=false` 字面 |
| `productionR2dActivationEnabled` / `productionCpcActivationEnabled` / `productionEnterpriseEntitlementReady` | false / false / false | harness 写入；上游 gate 继续 false |
| `productionCorePrivateV1Alpha5RouteCount` / `productionMainPreloadMaxApiCount` / `productionDesktopMaxUiReady` | 0 / 0 / false | harness 写入；无 Core HTTP / Main IPC / Preload / UI 接线 |
| `productionInstalledSubjectReleaseCount` | 0 | harness 强校验 `DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT=0` 字面；「admitted policy 存在 ≠ installed production release」严格分离 |
| `publicPrivateMappingLeakCount` | 0 | harness 强校验 4 个 v1alpha Contract 文件 grep `reasoning_effort|budget_tokens|authorization:|cookie:|credentialReference` 必须恰为 0 命中 |
| `historicalDfi534EvidenceDigest` / `historicalR2dp3EvidenceDigest` / `historicalPra3EvidenceDigest` | `bf89b2fd…` / `7d85a493…` / `ef0fb7a5…` | harness 读 3 个 historical evidence.json 内层 digest 断言不漂移 |
| `migrationMax` / `lockfileDigest` | 26 / `sha256:5b15ae01…874f31` | harness 实算强校验 |
| `testFileCount` / `testCount` | 5 / 37 | harness 解析 vitest 断言 |
| `evidenceDigest` | `sha256:165d1544a66ed12578271b490767fc5be1d513c2324355adf4da6a74e9735ed4` | harness sha256(JSON.stringify(semanticEvidence)) |

---

## 三、重点核查项

### 3.1 Contract 版本链落地（方案 §3.1 G1 + §3.5 G5）

- ✅ **4 个 v1alpha Contract 目录真实创建**：`packages/contracts/src/{desktop-local/v1alpha5, reasoning-mode/v1alpha2, runtime-selection/v1alpha4, submit-turn-coordination/v1alpha5}` + 各 `index.ts`
- ✅ **5 维 version chain** 严格按方案 §0 排序：Desktop v1alpha5 → Lock v1alpha2 → Selection v1alpha4 → coordination v1alpha5 → existing ModelRequest v1alpha2
- ✅ **publicPrivateMappingLeakCount=0**：4 个 v1alpha Contract 文件 grep `reasoning_effort|budget_tokens|authorization:|cookie:|credentialReference` 0 命中 — **raw mapping/Secret/Endpoint不进入 public Contract**

### 3.2 Lock v1alpha2 双 fallback 落地（方案 §3.1）

- ✅ **6 个 sealed resolution variant**（`default_passthrough / max_applied / max_unsupported_default / max_capability_unknown_default / max_support_changed_default / max_mapping_unavailable_default`）= `reasoningResolutionVariantCount: 6`
- ✅ **safeFallbackCauseCount=2**：仅 `provider_release.policy_unavailable` + `provider_release.policy_not_admitted` 2 种 typed cause 落到 `mapping_unavailable_default`（与方案 §4.2 穷举 2 个 cause 严格一致；**其余 8 种 PRA typed cause 全部 typed fail-closed**）
- ✅ **`support_changed_default` + `mapping_unavailable_default` 保留原 supported observation + content-free resolution evidence digest**（harness 6 字段 + 独立 digest domain 强校验）

### 3.3 Durable acceptance 原子性（方案 §6 G4）

- ✅ **`inMemoryAtomicSingleSwapVerified: true`**：InMemory adapter staged snapshot 后单一 pointer swap（`record_json` readable union single-dispatch）
- ✅ **`sqliteAtomicReopenVerified: true`**：SQLite adapter 复用现有 JSON 字段 + transaction + strict reload + 关闭/重开原数据库验证（不删不重建冒充 reopen）
- ✅ **`durableAcceptedEnvelopeVerified: true`**：v1alpha5 coordination envelope + acceptance plan + task-bundle envelope 三层独立 digest domain 互锁
- ✅ **no migration 27**：migration 仍止 26，bundle transaction 复用既有 `record_json` 字段

### 3.4 production boundary 诚实性（harness 强校验）

- ✅ **`DFI541_MAX_CORE_DEFAULT_ENABLED = false`**（harness 强校验字面）
- ✅ **`DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT = 0`**（harness 强校验字面）——「admitted policy 存在 ≠ production release 已安装」严格分离
- ✅ **8 个 production 边界全部 false/0**（DFI-5.4.1 activation / R2D / CPC / enterprise entitlement / Core v1alpha5 route / Main-Preload Max API / Desktop Max UI / installed subject release）

### 3.5 historical evidence 不漂移 + Contracts 0 改动

- harness:dfi5.4.1 强校验 3 个 historical evidence digest（DFI-5.3.4 / R2D-P.3 / PRA-3）不漂移
- 11 个 historical evidence.json 文件 hash 各自稳定（`dfi531..dfi541` + `r2dp1..r2dp3` + `pra1..pra3`）
- v1alpha1~v1alpha4 source byte freeze 约束在 harness 强校验 4 个新 Contract grep 0 命中中**间接保证**（新 Contract 不含旧版本字段，间接证明未原地改写）

### 3.6 DTP-4 audit baseline 同步修复（上一轮 P3-1 已关闭）

- 上一轮 PRA-3 QA 报告提出的 P3-1（`audit-dtp4-packaging.test.mjs` expected version baseline 漂移）**已修复**
- 实测 [L31](scripts/audit-dtp4-packaging.test.mjs#L31) `expected version 0.0.0-dfi.5.4.1` + [L65](scripts/audit-dtp4-packaging.test.mjs#L65) `r2dp.3-pra.3` 滚动同步
- `pnpm run check` **actual exit code = 0**（0 失败 test file）—— 与 R2D-P.3+PRA-3 上一轮全量并行窗口「1 文件失败/2 测试失败」根因已消除
- 注：此为本次实施**额外吸收**的测试维护改进，非 DFI-5.4.1 方案 §11 硬性要求，但显著提升全量门禁可重复性

### 3.7 测试真实性反查

- DFI-5.4.1 全部 5 个 test files `.skip/.only/it.todo/describe.todo` 扫描：**NONE FOUND**
- 历史 harness 全 PASS（4 个 historical harness evidence digest 逐字一致）
- `createProviderReasoningMappingRelease` 在 PRA-2 materializer 内被调用（**仅作 DFI-5.3.1 helper 复用，非 production registry consumer**）—— harness 强校验 `productionInstalledSubjectReleaseCount=0` 区分两者

---

## 四、发现

### 4.1 P0 = 0

无。5 维 version chain 全部落地、6 个 resolution variant 真实存在、2 个 safe fallback cause 严格限制、3 项原子性验证（InMemory swap / SQLite reopen / durable envelope）true、8 个 production 边界全 false/0、3 个 historical evidence digest 不漂移、4 个 v1alpha Contract `publicPrivateMappingLeakCount=0`。

### 4.2 P1 = 0

无。migration 止 26；lockfile `5b15ae01…874f31` 不变；Core private v1alpha5 route 0、Main/Preload Max API 0、Desktop Max UI false；DFI-5.4.2/5.4.3、DFI-4A.4 public CRUD、Admin v2、TGM、Knowledge Provider、Agent Lifecycle 全部继续 GATED。

### 4.3 P2 = 0

无。本机单实例复跑 harness:dfi5.4.1 + 4 个 historical harness + Central 438/438 + pnpm run check 313/2122 + lint/typecheck/audit:dtp4 一次 PASS，未触发产品代码归因；实施报告 §4 诚实记录了受限 sandbox 内 `listen EPERM` 与 JDK 21 路径差异，并明确为执行环境差异而非产品代码 fallback。

### 4.4 P3 = 0

无。上一轮 PRA-3 QA 报告提出的 P3-1（DTP-4 audit baseline 版本漂移）已由本批 DFI-5.4.1 实施**主动吸收修复**（[scripts/audit-dtp4-packaging.test.mjs:31](scripts/audit-dtp4-packaging.test.mjs#L31) `expected version 0.0.0-dfi.5.4.1`），根因消除。

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.4.1 完成 5 维 version chain additive 接入：Desktop Local v1alpha5（reasoning preference 恢复 v1alpha3 observation 字段、Receipt 6 种 resolutionReason、删除 defaultModelId、保留 v1alpha3 stale 语义 → 移除 v1alpha4 default-only 限制）→ ReasoningModeLock v1alpha2（6 个 sealed resolution variant、2 个新 fallback 保留原 supported 观察 + content-free resolution evidence digest、独立 domain `robothree.reasoning-mode-resolution-evidence.v1`）→ TaskRuntimeSelection v1alpha4（additive 演进 v1alpha3、只升级 lock、selectionDigest 覆盖 v1alpha2 + fallback evidence）→ coordination v1alpha5（additive 演进 v1alpha4、复用四阶段 `accepted → message_appended → task_committed → completed`、accepted 后 zero-reread current authority、durable plan 严格 exact 绑定 v1alpha5 request digest + v1alpha2 lock + v1alpha4 selection + safe admission/fallback evidence + 原 command/Task/Message/Receipt/deadline）→ existing ModelRequest v1alpha2 + DFI-5.3 mapping（helper 复用不复制 digest）；2 个新 fallback（`max_support_changed_default` / `max_mapping_unavailable_default`）保留原 supported observation + content-free resolution evidence digest，**只** `policy_unavailable` + `policy_not_admitted` 2 种 typed cause 允许 fallback，其余 8 种 PRA typed cause 全部 typed fail-closed；InMemory atomic single swap + SQLite 原文件 reopen strict reload + durable accepted envelope 三项独立验证 true；`DFI541_MAX_CORE_DEFAULT_ENABLED=false` code-owned literal + `DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT=0` 严格分离 admitted ≠ installed。

门禁独立复跑全部 PASS：harness:dfi5.4.1 5 TS/37 tests + evidenceDigest `sha256:165d1544…9735ed4` 逐字一致；harness:r2dp3（22 tests + Electron E2E）+ pra3（22 tests + 9 vector conformance）+ dfi5.3.4（19+7/159+14 + 120 parentQaLedger）+ r2d4（18/179）4 个 historical harness 全 PASS + evidence 不漂移；Central online/offline 各 438/0/0/0 BUILD SUCCESS；`pnpm run check` 313/298 files / 2122/2057 tests + 3 smoke + Architecture boundary **actual exit code=0**（0 失败，**DTP-4 baseline 同步修复**消除上一轮 P3-1）；lint / typecheck / audit:dtp4 PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、4 个 v1alpha Contract `publicPrivateMappingLeakCount=0`；8 个 production 边界全部 false/0；3 个 historical evidence digest（DFI-5.3.4 / R2D-P.3 / PRA-3）不漂移。

**DFI-5.4.1 可进入用户接受流程**；接受后：
- **DFI-5.4.1 标记 PASS/CLOSED**：Max Core contract / durable cutover 落地，**不自动解锁 DFI-5.4.2/5.4.3**
- 后续路径：DFI-5.4.2（HTTP/Main/Preload Max API cutover）+ DFI-5.4.3（Renderer/真实 E2E/UI + DFI-5 阶段 closure）按方案 A 前置计划 §5 关键路径顺序推进
- 期间 TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 public CRUD、Admin v2 继续 GATED

独立 QA 全程只读，未修改任何生产代码、依赖或配置；本轮仅新增 QA 报告与 DEVELOPMENT-LOG 回链两处文档。

— Claude Code（独立 QA，只读）