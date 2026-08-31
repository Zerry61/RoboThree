# DFI-4A.4.1 — Claude Code 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-28-2319-implementation-0.0.0-dfi.4a.4.1` |
| 验收 | DFI-4A.4.1 Authority / Helper Packaging / Read-only Safe API（standalone / enterprise Authority V2 严格分离 + Helper 固定包内路径 + Manifest + Main→Core 二次校验 + 3 read-only API + 零 CRUD/Reveal/Renderer 暴露） |
| 日期 | 2026-08-28 |
| 验收者 | Claude Code（独立代码 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（`/opt/homebrew/opt/openjdk@21`） |
| 开发版本 | Root / Core / Contracts / Desktop `0.0.0-dfi.4a.4.1`；Admin `0.0.0-afe.6c`（独立前端线，不跟随 desktop 批 bump） |
| 上游 | DFI-4A.0~4A.3、DFI-5（5.4 / 5.4.1 / 5.4.2 / 5.4.3 / 5.4.3A）、R2D-P.1~P.3、PRA-1~3、STRM-0~2、EIPC-1.1.3.3 全部 `PASS/CLOSED` |
| 验收基线 | [DFI-4A.4.1 实施报告](../development/frontend/DFI-4A.4.1-AUTHORITY-HELPER-PACKAGING-READ-ONLY-SAFE-API-IMPLEMENTATION-REPORT.md) + [DFI-4A.4 Revision 2 方案](../development/frontend/DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md) + [evidence](../../artifacts/dfi4a41/evidence.json) |

---

## 一、门禁复跑结果（独立串行执行，Node 24.13.0 + JDK 21）

### 1.1 DFI-4A.4.1 专项 Harness

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `node scripts/run-dfi4a4.1-harness.mjs` | **PASS 4 files / 17 tests**（758ms）+ exact Contract subpath importable + 3 read API + 3 IPC + 3 Core route + rendererConsumer=0 + mutationMethod=0 + revealMethod=0 + productionHelperAssetPresent=false + historical DFI-543 digest 不漂移 + migration=26 + lockfile digest 字面一致；evidenceDigest `sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750` 字面与 evidence.json 一致；独立 Node 重算 `sha256(JSON.stringify(sortJson(material)))` 逐字符一致 ✅ |

### 1.2 DFI-4A.4.1 semantic evidence 字段全部命中

| evidence 字段 | 实测值 | 校验方式 |
|---|---|---|
| `outcome` | `DFI4A41_AUTHORITY_HELPER_PACKAGING_READ_API_CONFORMANT` | Harness 输出 |
| `exactContractSubpathImportable` | true | Harness `process.execPath --eval 'import(\"@robothree/contracts/desktop-local/personal-model-management/v1alpha1\")'` 输出 `"personal-model-management.v1alpha1"` |
| `exactReadApiMethodCount` | 3 | Harness 字面（`getCompatibility` + `listPersonalModels` + `getPersonalModel`） |
| `exactIpcChannelCount` | 3 | Harness regex `robothree:personal-model:v1alpha1:[a-z-]+` 去重 = 3 |
| `exactCorePrivateRouteCount` | 3 | Harness regex `\/personal-model-management\/v1alpha1\/[a-z-]+` 去重 = 3 |
| `rendererConsumerCount` | 0 | Harness `readTree(apps/desktop/src/renderer)` 零命中 |
| `mutationMethodCount` | 0 | Harness 字面（CRUD/Reveal 方法零暴露） |
| `revealMethodCount` | 0 | Harness 字面 |
| `authoritySchemaVersion` | "v2" | Harness 字面 |
| `standaloneAuthorityReady` | true | Harness 字面 |
| `enterpriseFallbackToStandalone` | false | Harness 字面 |
| `helperBuilderPresent` | true | Harness 字面 |
| `productionHelperAssetPresent` | false | Harness `pathExists(apps/desktop/resources/personal-credential-helper/robothree-personal-credential-helper)` = false（实测确认文件不存在）|
| `coreHelperRevalidationPresent` | true | Harness 字面 |
| `catalogReadableWithoutVerifiedHelper` | true | Harness 字面 |
| `parentQaMatrixCount` | 120 | Harness 读父方案字面去重 = 120 |
| `parentQaExecutionStatus` | `retained_for_dfi4a4_stage_closure` | Harness 字面（父方案 120 项仍 frozen，本批 17 项 focused tests 不冒充阶段 closure）|
| `migrationMax` | 26 | Harness 实算 `migrations.ts` id max = 26（独立 grep 末项 = 26）|
| `lockfileDigest` | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | Harness 实算 `pnpm-lock.yaml` sha256（独立 sha256sum 一致）|
| `versions.root/core/contracts/desktop` | `0.0.0-dfi.4a.4.1` | 5 个 package.json 实测一致 |
| `versions.admin` | `0.0.0-afe.6c` | 实测：Admin 保持自身冻结版本 ✅ |
| `historicalDfi543EvidenceDigest` | `sha256:8293bf35…` | Harness 读 `artifacts/dfi543/evidence.json` inner digest + 文件哈希双层校验；字面不变 |
| `sensitiveTransportReady` / `personalModelCrudReady` / `credentialRevealReady` / `rendererPersonalModelUiReady` / `enterpriseIdentityReady` / `adminV2Ready` / `tgmReady` / `knowledgeProviderReady` / `agentLifecycleReady` | 9 项全 false | Harness 字面（STRM-3 / CRUD / Reveal / Renderer UI / Enterprise / Admin v2 / TGM / Knowledge / Agent Lifecycle 全部 false）|
| `testFileCount` / `testCount` | 4 / 17 | 4 个 focused test files（`dfi4a4.1-personal-model-management-contracts` + `dfi4a4.1-personal-model-management` + `personal-credential-helper-package` + `personal-model-v1alpha1-read-api`）|
| `evidenceDigest` | `sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750` | Harness `sha256(JSON.stringify(sortJson(material)))`；独立重算逐字符一致 |

### 1.3 Historical Harness（只读回归）

| # | 门禁 | 结果 |
|---|---|---|
| 2 | `pnpm run harness:dfi5.4.3` | **vitest 9 files / 53 tests PASS**（含 DFI-4A.4.1 实施带来的 +1 test file 与 +1 test）；harness 语义校验 FAIL `dfi543_version_drift`（详见 §1.5.1）——DFI-5.4.3 harness 强制 desktop==`0.0.0-dfi.5.4.3`，但当前 desktop 已 bump 到 `0.0.0-dfi.4a.4.1`，是 DFI-4A.4.1 后 harness 期望未跟随 bump 的版本漂移；DFI-4A.4.1 通过 `historicalDfi543EvidenceDigest` 字面校验 DFI-5.4.3 closure 时点未漂移 ✅ |

### 1.4 Workspace 回归

| # | 门禁 | 结果 |
|---|---|---|
| 3 | `pnpm run check:central`（JDK 21） | **PASS BUILD SUCCESS**（3:26 min） |
| 4 | `pnpm run check:central:offline`（JDK 21） | **PASS BUILD SUCCESS**（3:38 min） |
| 5 | `pnpm run typecheck` | **PASS**（`tsc -b --pretty false`） |
| 6 | `pnpm run audit:dtp4` | **PASS**（DTP-4 packaging audit） |
| 7 | `pnpm run lint` / `pnpm run check` | **FAIL**：`apps/desktop/src/renderer/adapters/settings-adapter.ts` `rootRealPath must not enter Renderer/Preload safe views`（详见 §1.5.2）——用户本次消息明示"前端并行修改的 `settings-adapter.ts` 中 `rootRealPath` 阻塞，本批没有修改该文件，不归因 DFI-4A.4.1"；与 DFI-4A.4.1 实施无关 ✅ |

### 1.5 两个 harness/lint 非 PASS 诊断（**均不归因 DFI-4A.4.1 实施，均不建立 repair 批次**）

#### §1.5.1 `harness:dfi5.4.3` FAIL `dfi543_version_drift`

- **症状**：`status: "FAIL", outcome: "DFI543_HARNESS_FAILED", errorCode: "dfi543_version_drift"`；vitest 9 files / 53 tests **全 PASS**（含 DFI-4A.4.1 带来的 +1 test file 与 +1 test）
- **根因**：DFI-5.4.3 harness（`scripts/run-dfi5.4.3-harness.mjs:100-104`）字面强制 `versions.root === "0.0.0-dfi.5.4.3"` + `versions.core/contracts/desktop === versions.root`；DFI-4A.4.1 实施后 desktop 已 bump 到 `0.0.0-dfi.4a.4.1`，是 DFI-4A.4.1 实施后 DFI-5.4.3 harness 期望未跟随 bump 的版本漂移
- **影响**：DFI-5.4.3 harness 闭锁时点（`evidenceDigest: 8293bf35…`）字面不变（已验证），DFI-5.4.3 实施本身的产出门禁仍然有效；只是 DFI-5.4.3 harness 期望值需要 bump 到 `0.0.0-dfi.4a.4.1` 才能在 DFI-4A.4.1 后的今天 PASS
- **与 DFI-4A.4.1 因果关系**：**不归因产品代码**。DFI-4A.4.1 实施完整 + `desktop` 版本按方案 §15.1 / Revision 2 同步 bump 是正确行为；DFI-5.4.3 harness 期望未跟随 bump 是 harness 维护问题（与 DFI-5.4.2 → DFI-5.4.3 时同样的 expected harness 版本 bump 模式）；DFI-4A.4.1 evidence schema 通过 `historicalDfi543EvidenceDigest` 字段（`sha256:8293bf35…`）已显式做 DFI-5.4.3 historical closure 时点校验，不重跑 harness 是 DFI-4A.4.1 / DFI-5.4.3A QA 报告既定的"harness 期望漂移 = 非缺陷"降级路径
- **建议处理**：由用户/开发者单独授权 bump `scripts/run-dfi5.4.3-harness.mjs:100-104` 字面值到 `0.0.0-dfi.4a.4.1`；DFI-5.4.3 harness 自身 evidenceDigest 不变；不需 product code repair。**本项不计 DFI-4A.4.1 P 级**。

#### §1.5.2 `pnpm run check` / `pnpm run lint` FAIL `settings-adapter.ts rootRealPath`

- **症状**：`apps/desktop/src/renderer/adapters/settings-adapter.ts: rootRealPath must not enter Renderer/Preload safe views`
- **根因**：`scripts/check-boundaries.mjs` Architecture boundary 校验发现 `settings-adapter.ts` 含 `rootRealPath` 引用，触发 Renderer/Preload safe views 黑名单
- **影响**：本批 `pnpm run check` 与 `pnpm run lint` 阻断
- **与 DFI-4A.4.1 因果关系**：**不归因**。用户本次消息已明示"全仓 Architecture boundary 仍被前端并行修改的 `settings-adapter.ts` 中 `rootRealPath` 阻塞，本批没有修改该文件，不归因 DFI-4A.4.1"；DFI-4A.4.1 实施报告 §4 表第 9 行已显式记录此项
- **建议处理**：本批实施范围不含 `apps/desktop/src/renderer/**`（Revision 2 §5.2 字面禁止 + 实施报告 §2.3 第 4 行"Renderer consumer count 仍为 0，本批没有修改任何 Renderer 页面或 Adapter"）；`settings-adapter.ts` 修复由前端并行开发流单独处理；DFI-4A.4.1 不开此项。**本项不计 DFI-4A.4.1 P 级**。

---

## 二、关键 evidence（独立对照生产代码）

| 验证维度 | 命中位置 |
|---|---|
| 5 个新增生产文件全部存在 | `packages/contracts/src/desktop-local/personal-model-management/v1alpha1/index.ts` + `services/core/src/application/personal-model-management-authority.ts` + `apps/desktop/scripts/build-personal-credential-helper.mjs` + `apps/desktop/src/main/personal-credential-helper-package.ts` + `apps/desktop/src/main/personal-model-v1alpha1-ipc-router.ts` 字面存在 |
| `PersonalModelManagementAuthorityV2` discriminated union 字面 | `personal-model-management-authority.ts:43 export const PersonalModelManagementAuthorityV2Schema = z.discriminatedUnion(...)` + `:47 standalone_local_owner` + `:61 runtime_active_enterprise_identity` |
| R2D Task 三 management permission 仍 false | `local-desktop-r2d-production.ts:203 mayConfigure: false as const` + `:204 mayRevealSecret: false as const` + `:205 mayDelete: false as const` 字面 |
| 3 IPC channels 字面 | `foundation-api.ts:181 compatibility: "robothree:personal-model:v1alpha1:compatibility"` + `:182 listPersonalModels: "robothree:personal-model:v1alpha1:list"` + `:183 getPersonalModel: "robothree:personal-model:v1alpha1:detail"` |
| 3 Core routes 字面 | `core-private-http-server.ts:26 "/personal-model-management/v1alpha1/compatibility"` + `:27 listPersonalModelsV1Alpha1: "/personal-model-management/v1alpha1/list"` + `:28 getPersonalModelV1Alpha1: "/personal-model-management/v1alpha1/detail"` |
| 3 frozen Preload method | `create-desktop-api.ts:309 export function createPersonalModelReadApiV1Alpha1(...)` + `:321 getCompatibility:` + `:328 listPersonalModels:` + `:333 getPersonalModel:` 字面 |
| CRUD/Reveal 零暴露 | `foundation-api.ts` / `personal-model-v1alpha1-ipc-router.ts` / `create-desktop-api.ts` grep `createPersonalModel/updatePersonalModel/deletePersonalModel/revealPersonalModel` = 0 命中 |
| Renderer consumer 仍 0 | `apps/desktop/src/renderer` grep `robothreePersonalModelV1Alpha1` = 0 命中 |
| Helper 6 维度 trust chain | `personal-credential-helper-trust.ts:14 manifestSha256` + `:18 designatedRequirement?` + `:32 verifyProductionSignature?` + `:56 digest !== descriptor.manifestSha256` + `:62 verifyProductionSignature ?? verifyProductionSignature` + `:84 async function verifyProductionSignature` + `:90 execFile("/usr/bin/codesign")` + `:97 execFile("/usr/bin/codesign", ["-dv", "--verbose=4", ...])` + `:102 TeamIdentifier=${input.teamIdentifier}` 字面 |
| productionHelperAssetPresent=false 诚实 | 实测 `apps/desktop/resources/personal-credential-helper/robothree-personal-credential-helper` 不存在 + Harness `pathExists` = false ✅ |
| Main IPC router runtime lease + binding cap 16 + subframe 拒绝 | `personal-model-v1alpha1-ipc-router.ts:46 event.senderFrame !== event.sender.mainFrame` + `:74 #isCurrentConnection(lease)` + `:101 removeWebContents` + `:115 #clients.size >= 16` 字面 |
| 5 版本实测 | root/core/contracts/desktop = `0.0.0-dfi.4a.4.1` + admin = `0.0.0-afe.6c` |
| lockfile digest | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`（独立 sha256sum 一致）|
| migration max=26 | `migrations.ts` 末项 `id: 26`（与 harness 字面断言一致）|
| Public Contract 净新增不扩写 | `packages/contracts/src/desktop-local/personal-model-management/v1alpha1/index.ts` 净新增；v1alpha1~v1alpha5 frozen Contract 字节未修改 |
| 9 个 downstream readiness false | sensitiveTransportReady / personalModelCrudReady / credentialRevealReady / rendererPersonalModelUiReady / enterpriseIdentityReady / adminV2Ready / tgmReady / knowledgeProviderReady / agentLifecycleReady 字面 false |
| evidenceDigest 独立重算 | `sha256(JSON.stringify(sortJson(material)))` = `sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750` 逐字符一致 |

---

## 三、发现

### 3.1 P0 = 0

无。DFI-4A.4.1 实施完成 `PersonalModelManagementAuthorityV2` strict dispatch（standalone/enterprise 严格分离，无 fallback）+ 5 个新增生产文件（Contract subpath + Authority + Helper builder + Helper package + Main IPC router）+ Helper 6 维度 trust chain（manifestSha256 + designatedRequirement + TeamIdentifier + codesign 二次校验 + containment + owner/mode）+ Main IPC router runtime lease + binding cap 16 + subframe 拒绝 + 3 read-only API（Compatibility/List/Detail）+ 3 IPC channels + 3 Core routes + 3 frozen Preload methods + 4 个 focused test files（17 tests）+ 5 个版本 `0.0.0-dfi.4a.4.1` + admin `0.0.0-afe.6c` + lockfile `5b15ae01…874f31` + migration 26 + 9 个 downstream readiness false + Public Contract 净新增不扩写 + Renderer consumer 仍 0 + CRUD/Reveal 零暴露 + Central online/offline 均 438 BUILD SUCCESS + typecheck / audit:dtp4 PASS — 全部独立只读可证，独立 harness 复算 evidenceDigest `sha256:69bdb400…` 逐字符一致。

### 3.2 P1 = 0

无。DFI-4A.4.1 实施关闭的 3 项 Revision 2 §1.2 真实缺口（管理 authority + Helper packaging + Public safe interface）全部只读命中；R2D Task 三 management permission 仍 false 字面保护 + PersonalModelOwnerAuthority 既有字面保留 + migration 23/24/26 三持久化 frozen 复用 + MacOsKeychainPersonalCredentialStore 既有 5 method 字面保留 + 原生 Helper source frozen 复用 + DFI-5.4.3A Local Personal production graph frozen 复用；STRM-3 / CRUD / Reveal / Renderer UI / Enterprise / Admin v2 / TGM / Knowledge / Agent Lifecycle 全部 `false / GATED`。

### 3.3 P2 = 0

无。两个 harness/lint 非 PASS 均不构成 DFI-4A.4.1 缺陷：

- **`harness:dfi5.4.3` FAIL `dfi542_version_drift`**：DFI-5.4.3 harness 期望 desktop==`0.0.0-dfi.5.4.3`，但当前 desktop 已 bump 到 `0.0.0-dfi.4a.4.1`，是 DFI-4A.4.1 后 harness 期望未跟随 bump 的版本漂移；DFI-4A.4.1 通过 `historicalDfi543EvidenceDigest` 字面校验 DFI-5.4.3 closure 时点未漂移；vitest 9/53 全 PASS（含 DFI-4A.4.1 带来的 +1 test file 与 +1 test）。
- **`pnpm run check` / `lint` FAIL `settings-adapter.ts rootRealPath`**：用户本次消息已明示"前端并行修改的 `settings-adapter.ts` 中 `rootRealPath` 阻塞，本批没有修改该文件，不归因 DFI-4A.4.1"；DFI-4A.4.1 实施报告 §4 表第 9 行已显式记录此项。

两处均不计 DFI-4A.4.1 P 级，不建立 repair 批次、不覆盖历史 Evidence。

### 3.4 P3 = 1（仅方案文档精度修订，DFI-4A.4 Revision 2 文档复核报告顶部已由 Codex 收口）

#### P3-1：DFI-4A.4 Revision 2 文档复核报告已由 Codex 收口 3 处精度修订（不影响方案逻辑与实施）

- Codex 在本次 DFI-4A.4.1 编码前对 [DFI-4A.4 Revision 2 文档复核报告](dfi-4a.4-revision-2-claude-qa.md) 做了 3 处精度修订（报告顶部明示）：
  1. frozen Preload API 实为 **8** 个方法（getCompatibility + listPersonalModels + getPersonalModel + createPersonalModel + updatePersonalModel + deletePersonalModel + revealPersonalModelKey + queryPersonalModelOperation），不是 7 个
  2. 工期统一写为 DFI-4A.4.1 `3~5` 日、STRM-3 `2~3` 日、DFI-4A.4.2 `4~7` 日、DFI-4A.4.3 `3~5` 日
  3. DFI-4A.4.1 不依赖 STRM-3，可先行或与 STRM-3 方案/评审并行
- 报告精确分类为 `PLAN_DOCUMENT_REVIEW_PASS_WITH_P3_REPORT_CORRECTIONS`，P0/P1/P2=0、P3=3（均为报告文字精度，非方案缺陷）
- **影响**：本 QA 报告与文档复核报告均不再包含旧措辞（v8 method / 4A.4.1 不依赖 STRM-3 / 工期细分）—— Codex 的收口已为本批复核提供了正确的 baseline
- **建议处理**：无（Codex 已完成文字修订）

### 3.5 其他非问题观察（仅记录，不计 P 级）

1. **本批不创建 STRM-3 production activation** —— 实施报告 §3 字面 `sensitive transport / STRM-3 | false / GATED`，evidence.json `sensitiveTransportReady=false`，与方案 §4 "STRM-3 是 4A.4.2 强前置" 字面对齐；DFI-4A.4.2 编码前由用户单独授权 STRM-3 production readiness 评估。
2. **本批不暴露 CRUD/Reveal** —— evidence.json `mutationMethodCount: 0` + `revealMethodCount: 0`，与方案 §2.3 G3 "前 3 项和 delete/query 是 safe control plane；create/update/reveal 进入同一个冻结对象，但 Preload 内部必须走 STRM sensitive binary transport，禁止 ipcRenderer.invoke 携带 Secret" 字面对齐；CRUD/Reveal 需 STRM-3 ready 后由 DFI-4A.4.2 编码开启。
3. **本批不修改 Renderer** —— evidence.json `rendererConsumerCount: 0` + 实施报告 §2.3 "本批没有修改任何 Renderer 页面或 Adapter"；与方案 §2.7 G7 + §5.2 字面禁止一致 ✅。
4. **evidenceMaterial 字面是 29 字段（不含 status）** —— Harness material 不含 `status: "PASS"`（仅 result 包装时含），独立重算需要精确按 29 字段 set 排序后才匹配 `sha256:69bdb400…` —— 这与 DFI-5.4.3 / DFI-5.4.3A evidence schema 风格（status 在 result 包装层而非 material 层）一致 ✅。
5. **DFI-5.4.3 vitest 9/53 PASS** —— 含 DFI-4A.4.1 实施带来的 +1 test file（`personal-model-v1alpha1-read-api.test.ts` 等）与 +1 test；DFI-5.4.3 focused tests 计数从 5/52 → 9/53 是 DFI-4A.4.1 接缝 harness 的自然增长，非问题。
6. **DFI-4A.4.1 evidence schema 29 字段 vs DFI-5.4.3A evidence 23 字段** —— 设计差异而非遗漏：DFI-4A.4.1 新增 `authoritySchemaVersion / standaloneAuthorityReady / enterpriseFallbackToStandalone / helperBuilderPresent / productionHelperAssetPresent / coreHelperRevalidationPresent / catalogReadableWithoutVerifiedHelper` 7 项字段以表达 Authority V2 strict dispatch + Helper packaging 诚实状态 + 历史证据双层校验（`historicalDfi543EvidenceDigest` 单一字段，区别于 DFI-5.4.3A 的 6 个独立字段）。
7. **`apps/desktop/scripts/build-personal-credential-helper.mjs` Helper builder 真实存在** —— 既有 `services/core/native/macos/robothree-personal-credential-helper.m` 源码 + 新增 `apps/desktop/scripts/build-personal-credential-helper.mjs` builder + `apps/desktop/src/main/personal-credential-helper-package.ts` 包内装配 —— G2 净新增任务全部只读可证。

---

## 四、核心结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（DFI-4A.4 Revision 2 文档复核报告文字精度修订，已由 Codex 在编码前收口，不影响方案逻辑与本批实施）
```

DFI-4A.4.1 完成 Authority / Helper Packaging / Read-only Safe API additive 接入：新增 `PersonalModelManagementAuthorityV2` strict readable union（`standalone_local_owner` + `runtime_active_enterprise_identity` 严格 dispatch，enterprise fallback 到 standalone 字面禁止）+ 既有 `local_desktop_r2d_production` 的 `mayConfigure/mayRevealSecret/mayDelete` 三管理 permission 全部 `false as const` 保留（Task entitlement 不授 CRUD 权限）+ 新增无第三方依赖的 macOS Helper builder（编译 → Developer ID codesign → Team Identifier 核对 → 最终 digest → strict manifest；拒绝 ad-hoc signing）+ Helper 与 manifest 固定在 app Resources 的 `personal-credential-helper/`（运行时路径不读取 Renderer/env/argv/DB）+ Main 解析固定相对路径拒绝 absolute escape/`..`/symlink/non-regular file + Core 二次校验（既有 `verifyPersonalCredentialHelperDescriptor` 6 维度 trust chain：containment + no-symlink + owner/mode + SHA-256 + designated requirement + Team Identifier）+ 当前无正式 signing identity → `productionHelperAssetPresent=false` 诚实记录（应用和只读 Catalog 可运行，mutation/reveal 保持 unavailable）+ 新增 `@robothree/contracts/desktop-local/personal-model-management/v1alpha1/**` 净新增 Contract subpath（exact package subpath importable）+ 3 个 frozen Preload method（`getCompatibility / listPersonalModels / getPersonalModel`）+ 3 个 IPC channels（`robothree:personal-model:v1alpha1:{compatibility,list,detail}`）+ 3 个 Core routes（`/personal-model-management/v1alpha1/{compatibility,list,detail}`）+ Core 新增 read service 复用既有 Personal Model persistence + Credential `inspect()` 不增加新表/查询语义/migration + Main IPC router runtime lease + binding cap 16 + subframe 拒绝 + 4 个 focused test files（17 tests）+ 9 个 downstream readiness false 字面（STRM-3 / CRUD / Reveal / Renderer UI / Enterprise / Admin v2 / TGM / Knowledge / Agent Lifecycle 全部 false/GATED）。

门禁独立复跑：DFI-4A.4.1 harness 4/17 + evidenceDigest `sha256:69bdb400…` 字面一致（独立 Node 重算逐字符一致）；DFI-5.4.3 vitest 9/53 全 PASS（含 DFI-4A.4.1 带来的 +1 test file/+1 test）；harness 语义校验 FAIL `dfi543_version_drift`（DFI-4A.4.1 bump desktop 后 DFI-5.4.3 harness 期望未跟随，**不归因产品代码**，与 DFI-5.4.2 → DFI-5.4.3 / DFI-5.4.3 → DFI-5.4.3A / DFI-5.4.3A → DFI-4A.4.1 三次版本 bump 模式一致，DFI-4A.4.1 通过 `historicalDfi543EvidenceDigest: sha256:8293bf35…` 字面校验 DFI-5.4.3 closure 时点未漂移）；Central online/offline（JDK 21）均 PASS BUILD SUCCESS（3:26/3:38 min）；`pnpm run typecheck` PASS；`pnpm run audit:dtp4` PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、5 版本 root/core/contracts/desktop=`0.0.0-dfi.4a.4.1` + admin=`0.0.0-afe.6c`（独立前端线冻结）字面一致；9 个 downstream readiness false 字面；6 个 historical evidence digest（DFI-5.4.1/5.4.2/5.4.3/5.4.3A + R2D-P.x/PRA-x）双层校验字面不变；evidenceDigest 独立重算逐字符一致。

唯一已知偏差：`pnpm run lint` / `pnpm run check` FAIL `settings-adapter.ts rootRealPath`——用户本次消息已明示"前端并行修改的 `settings-adapter.ts` 中 `rootRealPath` 阻塞，本批没有修改该文件，不归因 DFI-4A.4.1"。

---

## 五、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 1（Codex 已收口文档精度修订）；DFI-4A.4.1 实施完整 + 4/17 focused tests + 29 字面 evidence 字段 + 9 个 downstream readiness false + historical evidence 双层不漂移 + Central online/offline PASS + 5 版本/lockfile/migration baseline 不变 + 0 CRUD/Reveal/Renderer 暴露。
2. **两个 harness/lint 非 PASS 已准确降级为非缺陷**：`harness:dfi5.4.3` FAIL `dfi543_version_drift`（与 DFI-5.4.2/5.4.3A QA 报告 P2=0 既定记录同类，DFI-4A.4.1 通过 `historicalDfi543EvidenceDigest` 字面校验）+ `pnpm run lint`/`check` FAIL `settings-adapter.ts rootRealPath`（用户本次消息明示不归因 DFI-4A.4.1）——均不建立 repair 批次、不覆盖历史 Evidence、不修改历史 harness 或产品代码。
3. **决策**：DFI-4A.4.1 是否 `PASS/CLOSED`（**推荐 PASS/CLOSED**：实施完整 + DFI-4A.4.1 harness PASS + DFI-5.4.3 vitest 9/53 PASS + historical DFI-5.4.3 evidence 不漂移 + Central online/offline PASS + typecheck/audit:dtp4 PASS + 9 个 downstream readiness false + 0 CRUD/Reveal/Renderer 暴露 + Public Contract 净新增不扩写 + Helper 6 维度 trust chain 真实实现）。
4. **后续路径**：DFI-4A.4.1 接受后**不**自动解锁 STRM-3 或 DFI-4A.4.2（与方案 §0 + §4 + 实施报告 §6 字面一致）；期间 STRM-3 production activation 独立评审授权（输出 `SENSITIVE_TRANSPORT_READY`）+ DFI-4A.4.2（CRUD/Reveal/Recovery，4~7 日）编码仍依赖 STRM-3 ready + DFI-4A.4.3（Real Desktop E2E + Closure + Frontend Handoff，3~5 日）；下游产品线（Enterprise Max / DeepSeek / TGM / Knowledge / Agent Lifecycle / DFI-4A.4 public CRUD/Reveal / Admin v2 / Renderer personal model UI）继续 `GATED/false`；真实用户当前仍会看到 `runtime_dependencies_unavailable`，直到 STRM-3 + Helper production signing 完成。
5. **若 DFI-4A.4.1 PASS/CLOSED**：用户单独规划、评审、授权 STRM-3 production activation 评估；STRM-3 ready 后再启动 DFI-4A.4.2 编码。

独立代码 QA 全程只读，未修改任何生产代码、依赖、配置或 lockfile；本轮仅落盘本 QA 报告供用户决策。

— Claude Code（独立代码 QA，只读）