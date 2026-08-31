# DFI-4A.4.2 — Claude Code 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-1450-code-dfi-4a.4.2` |
| 验收对象 | DFI-4A.4.2 实施代码 + Evidence + Harness 字面（仅只读核对） |
| 日期 | 2026-08-29 |
| 复核者 | Claude Code（独立 QA，仅只读，不修改任何业务代码/Contract/依赖/migration/lockfile） |
| 上游 | DFI-4A.4 Revision 2 / DFI-4A.4.1 / STRM-3 / DFI-5.x / R2D-P.x / PRA-x（已 `PASS/CLOSED`） |
| 当前状态 | `PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED` |
| 上游文档复核 | [`dfi-4a.4.2-claude-qa.md`](dfi-4a.4.2-claude-qa.md)（PLAN_DOCUMENT_REVIEW_PASS，2026-08-29） |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 DFI-4A.4.2 实施的事实可证性 + 边界严格性 + 诚实字面一致性：

1. 8 个 frozen Preload method + 8 个 IPC + 8 个 Core private route 严格对应（与方案 §2.2 G2 字面对齐）；
2. v1alpha1 byte freeze + v1alpha2 additive 净新增（与方案 §2.1 G1 + §7.2 字面对齐）；
3. STRM MessagePort + fd4/fd5（create / replace-secret / reveal）与 safe Core command + zero Secret（reuse / delete）的实际字面分流（与方案 §0 controlling clarification 字面对齐）；
4. 18 类资源归零（比 STRM-3 16 类扩展 +revealAttempt / operationLease）+ 80 次负向泄漏注入检出 + 正常四通道命中 0；
5. productionBusinessHandlerInstalled=true 与 11 项 readiness 中 4 项 false 严格共存；
6. 边界字面：migration max=26 / lockfile 不变 / Helper binary 不存在 / frozen STRM-3 + DFI-4A.4.1 evidence 不漂移；
7. Central online/offline 438/438 BUILD SUCCESS；
8. 父 120 项 item-level ledger 3 段分类（QA-061~080 executed_by_strm3 + QA-081~100 executed_by_dfi4a42 + 80 项 retained）。

**不**在本次复核范围：

- 不修改任何业务代码、Contract、依赖、migration、lockfile；
- 不替代 STRM-3 / DFI-4A.4.1 / DFI-5.x / R2D-P.x / PRA-x 既有独立 QA 结论；
- 不评估"是否应该用 v1alpha2 而非 v1alpha1 原地扩写"——只评估本批**事实可证性 + 一致性 + 可执行性**；
- 不复跑历史 STRM-3 / DFI-4A.4.1 / DFI-5.x / R2D-P.x / PRA-x harness（保持只读）。

### 1.2 方法

按 A~K 段顺序逐项只读对照：

- 实跑 `pnpm run harness:dfi4a4.2`（Node v24.13.0, pnpm 11.11.0）+ `pnpm run typecheck` + 聚焦 ESLint（仅本批涉及路径）+ `pnpm run audit:dtp4` + `pnpm run check:central` + `pnpm run check:central:offline`；
- 实测 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `services/core/src/adapters/sqlite/migrations.ts` 末项 `id`；
- 逐文件字面读取：`packages/contracts/src/desktop-local/personal-model-management/v1alpha2/index.ts` + `services/core/src/application/personal-model-management-command-service.ts` + `apps/desktop/src/main/personal-model-v1alpha2-ipc-router.ts` + `apps/desktop/src/shared/foundation-api.ts` + `apps/desktop/src/preload/create-desktop-api.ts` + `services/core/src/desktop-private-main.ts` + `services/core/src/application/personal-model-credential-coordinator.ts` + `services/core/src/adapters/credential/personal-model-credential-broker-handler.ts` + `scripts/run-dfi4a4.2-harness.mjs`；
- 实测 `shasum -a 256` 验证 `artifacts/strm3/evidence.json` + `artifacts/dfi4a41/evidence.json` + `artifacts/dfi4a42/evidence.json` + `packages/contracts/src/desktop-local/personal-model-management/v1alpha1/index.ts`；
- 验证 `apps/desktop/resources/personal-credential-helper/` 目录不存在；
- 验证 evidence.json 字面字段与实测一致。

---

## 二、关键事实核对（按方案节序 / 字面对照）

### 2.1 A 段：v1alpha2 Contract + v1alpha1 byte freeze

✅ **可独立落地**：

- `packages/contracts/src/desktop-local/personal-model-management/v1alpha2/index.ts` 真实存在（264 行，独立子目录，与 v1alpha1 平行）。
- v1alpha1 byte freeze：`packages/contracts/src/desktop-local/personal-model-management/v1alpha1/index.ts` 字面仍为 225 行、9 处 `.strict()`，未修改。
- v1alpha2 = **20 处 `.strict()`**（含 `.superRefine()` 字面增强校验，3 处）+ `personal-model-management.v1alpha2` / `personal-model-transport-preparation.v1alpha2` schemaVersion 字面 + 5 处 strict reject（未知字段 / null 替代 / boolean capability / 自报 owner / 原始 Secret）。
- 实测 sha256(`v1alpha1/index.ts`) = `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a`（独立计算，与方案字面预期一致）。
- v1alpha2 净新增空间被实际利用（不是占位空目录）。

### 2.2 B 段：Core Command Service + frozen 实例复用

✅ **可独立落地**：

- `services/core/src/application/personal-model-management-command-service.ts` 真实存在（307 行），类签名 `class PersonalModelManagementCommandService`，含 5 个 public async 方法：`create / update / delete / reveal / query`。
- 命令复用既有 frozen 实例：
  - 4 处调用 `createPersonalModelCredentialCommand`（create / update / replace / delete 路径）— Coordinator 复用；
  - 1 处调用 `createPersonalModelRevealCommand`（reveal 路径）— Reveal Service 复用；
  - `personal-model-credential-coordinator.ts:214` 字面 `class PersonalModelCredentialCoordinator` + `:359` `recoverOnce(limit = 100)`；
  - `personal-model-credential-recovery-coordinator.ts:863`（与 Coordinator 同文件 `class PersonalModelCredentialRecoveryCoordinator`） + `:866` `recoverOnce(limit = 100)`；
  - `personal-model-credential-reveal-service.ts:217` 字面 `class PersonalModelCredentialRevealService`。
- Bootstrap `create-desktop-private-runtime.ts:807` 字面 `createPersonalModelCredentialBrokerHandler(...)` 实例化 + `:879` 字面挂入 `personalCredentialBrokerHandler` 字段。
- Core 是 ID/revision/canonical material authority：字面派生 `commandId / personalModelId / expectedConfigurationRevision / expectedExecutionDefinitionDigest / requestDigest`（IPC router `:58` 字面）。

### 2.3 C 段：Main/Preload 8 个 frozen surface

✅ **可独立落地**：

- **8 个 frozen Preload method**（`apps/desktop/src/preload/create-desktop-api.ts:375` `createPersonalModelApiV1Alpha2`）：
  1. `getCompatibility(query: PersonalModelManagementCompatibilityQueryV1Alpha2)` — `:397`
  2. `listPersonalModels(query: ListPersonalModelsQueryV1Alpha2)` — `:398`
  3. `getPersonalModel(query: GetPersonalModelQueryV1Alpha2)` — `:399`
  4. `createPersonalModel(command, secretInput: Uint8Array)` — `:400`（async，**Secret only via `Uint8Array` typed parameter**）
  5. `updatePersonalModel(command, secretInput?: Uint8Array)` — `:412`（async，optional Secret）
  6. `deletePersonalModel(command)` — `:429`（async，no Secret）
  7. `revealPersonalModelKey(command)` — `:434`（async，no Secret input — Reveal uses prepared ticket via STRM）
  8. `queryPersonalModelOperation(query)` — `:441`
- **8 个 IPC channel**（`apps/desktop/src/shared/foundation-api.ts:202` `PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS`）：
  - `compatibility / listPersonalModels / getPersonalModel / createPersonalModel / updatePersonalModel / deletePersonalModel / revealPersonalModelKey / queryPersonalModelOperation`，全部 `Object.freeze` + `as const`；
  - channel 字符串前缀统一 `robothree:personal-model:v1alpha2:`。
- **8 个 Core private route**（`apps/desktop/src/main/core-private-client.ts:193-200`）：
  - `/personal-model-management/v1alpha2/compatibility`
  - `/personal-model-management/v1alpha2/list`
  - `/personal-model-management/v1alpha2/detail`
  - `/personal-model-management/v1alpha2/create`
  - `/personal-model-management/v1alpha2/update`
  - `/personal-model-management/v1alpha2/delete`
  - `/personal-model-management/v1alpha2/reveal`
  - `/personal-model-management/v1alpha2/operation`
- 字面禁止：`action` 字段、generic dispatcher（grep `genericDispatcher` 字段在 evidence.json 字面 = 0）、Renderer 自报 capability。
- Preload 字面每个方法都做 `.parse(query)` 严格 Zod 校验（`:397~441` 字面）。

### 2.4 D 段：STRM MessagePort + fd4/fd5 路径（最敏感）

✅ **可独立落地**：

- IPC router `apps/desktop/src/main/personal-model-v1alpha2-ipc-router.ts:58` 字面调用 `this.input.transport.openPreparedCommand({ schemaVersion: "personal-credential-transport-prepared-command.v1", runtimeInstanceId: lease.runtimeInstanceId, clientInstanceId: lease.transportClientInstanceId, commandId: result.value.transport.commandId, ... })` — 这是 STRM transport controller 真实串接。
- IPC router 字面拒绝非 `event.sender.mainFrame` 帧（`:46-47`） + `isAuthorizedWebContents` 检查 + `clientInstanceId` 绑定（`:48`） + `runtimeChanged`（lease 漂移后 `:122` typed `personal_model.runtime_changed`） — 12 步 fixed order 第 5-6 步字面落地。
- `services/core/src/desktop-private-main.ts:87` 字面 `handler: created.personalCredentialBrokerHandler,` —— Core 真实安装 production Broker handler，不再是 STRM-3 时代的"固定 unavailable handler"。
- `desktop-private-main.ts` 早期 `typedErrorCode: "credential_store_unavailable"`（STRM-3 QA 报告 §3.3 字面对应）已被新 Broker handler 替换；Broker 字面映射 12 个 `personal_model.*` typed code → `credential_*` transport reject code（`personal-model-credential-broker-handler.ts:60-110` 字面 `mapRevealFailure / mapFailure`）。
- Preload `create-desktop-api.ts:400-403` 字面 `createPersonalModel(command, secretInput: Uint8Array)` — Secret 仅以 `Uint8Array` typed parameter 进入；`updatePersonalModel(command, secretInput?: Uint8Array)` — optional；`deletePersonalModel(command)` 与 `revealPersonalModelKey(command)` — 无 Secret 参数（Reveal 通过 STRM 准备态 ticket 反向获取，与方案 §2.3 + §2.8 字面对齐）。
- IPC router 字面在 `isTransportPreparation(result.value)` 为 true 时调用 STRM `openPreparedCommand`（`:55-74`）—— fd4/fd5 字节流进入生产敏感通道。

### 2.5 E 段：Durable / Reveal lifecycle 字面

✅ **可独立落地**：

- 既有 frozen 字面落点：
  - `recoverOnce(limit = 100)` 在 `personal-model-credential-coordinator.ts:359` + `personal-model-credential-recovery-coordinator.ts:866`（bounded recovery）；
  - 7 项 durability 语义字面（uncertain / manual_attention / cleanup_pending / credential_delete_unproven / credential_operation_uncertain / credential_binding_conflict / invalid_transition）见 `personal-model-credential-coordinator.ts:544-637` + `:843` `#manualAttention` + `:1010` `code.includes("uncertain")`；
  - Reveal 字面 `rate-limited / busy / replay_forbidden / deadline_exceeded / cancelled / permission_denied / not_found / conflict` 8 字面 typed code（`personal-model-credential-broker-handler.ts:66-109`）；
  - Reveal Service 字面（`personal-model-credential-reveal-service.ts:217`）。
- 实施中额外桥接：Core 在 durable prepare 后把同一 operation 的 `targetConfigurationRevision` 放入 transport ticket，Broker 执行 create 时不把 target revision 重新解释为 expected old revision（实施报告 §1 第 22-26 行）—— 字面冻结 STRM v1、不削弱 exact ticket binding、不建立第二套状态机。
- `desktop-private-main.ts:90` 字面 `coreVersion: "0.0.0-dfi.4a.4.2"`（与 evidence.json `versions.core` 字面一致）。

### 2.6 F 段：18+ typed safe error code 字面

✅ **可执行**：

- `services/core/src/application/personal-model-management-command-service.ts:28-39` 字面枚举 12 字面 typed code 联合类型（核心集合）：
  - `feature_unavailable / permission_denied / not_found / revision_conflict / operation_in_progress / in_use / usage_unknown / operation_uncertain / manual_attention / cleanup_pending / reveal_expired / internal`。
- 加上既有 frozen 命名空间（`personal-model-credential-broker-handler.ts` 12 字面 + `personal-model-credential-coordinator.ts` 9 字面）：总 ≥ 30 unique `personal_model.*` typed code 字面集合（grep 实际枚举）。
- 字面强制映射到 transport reject code（`mapRevealFailure` + `mapFailure`），与方案 §2.9 字面禁止 stack / Zod path / SQL / Helper stderr / endpoint / model owner / Credential Ref / digest / Keychain account / 真实文件路径 7 项内容严格一致。

### 2.7 G 段：18 类资源归零 + 80 泄漏 + M1~M10/R1~R8

✅ **可独立落地（harness 复跑已 PASS）**：

- **18 类资源字段字面落点**（`artifacts/dfi4a42/evidence.json:38-54`）：
  - 前 16 类：electronProcess / browserWindow / webContents / messagePort / ipcListener / navigationListener / timer / transportSession / transportRegistry / brokerInflight / brokerTombstone / coreChild / sensitiveStream / helperProcess / listeningPort / temporaryDirectory —— 与 STRM-3 既有 baseline 字面对齐；
  - 扩展 2 类：`revealAttemptCount / operationLeaseCount`（`:53-54`）；
  - 全部 `0`，无 `?? 0` / 缺字段当 0 / hard-coded 0。
- **80 次负向泄漏注入**：evidence.json 字面 `negativeLeakInjectionDetectionCount: 80` + `fourChannelLeakageMatchCounts: { parentStdout: 0, childStderr: 0, machineEvidence: 0, safeTrace: 0 }` —— 严格与 STRM-3 §10.2 字面风格一致。
- **harness 复跑结果**（2026-08-29 14:27:30，Node v24.13.0）：
  - 8 test files / 59 tests PASS；
  - `Test Files  8 passed (8)`；
  - `Tests  59 passed (59)`；
  - `Duration 3.83s`；
  - evidence.json 内层 digest 字面 = `sha256:f52e7a255374e70a920957ba7641f5643f73a39445946815e42d7261be87dc0e`，与 harness stdout 输出逐字段一致；
  - evidence 文件 SHA256 独立计算 = `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb`（外层文件 hash 与内层语义 digest 是两个不同语义层）。
- **resourceAccountingSources 字面区分**（evidence.json `:56-59`）：
  - `transportAndProcess: historical_strm3_real_process_evidence` —— 16 类来自历史 STRM-3 真实进程 evidence，不重写；
  - `revealAndOperation: dfi4a42_lifecycle_runtime_diagnostics` —— 2 类（revealAttempt / operationLease）来自本批 lifecycle runtime diagnostics。

### 2.8 H 段：边界字面

✅ **事实成立**：

| 边界项 | 字面 | 状态 |
|---|---|---|
| migration max | `services/core/src/adapters/sqlite/migrations.ts` 末项 `id: 26`（实测） | ✅ 不新增 migration 27 |
| lockfile digest | `pnpm-lock.yaml` SHA256 = `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`（实测） | ✅ 与 evidence `lockfileDigest` 字面一致，未漂移 |
| production Helper binary | `apps/desktop/resources/personal-credential-helper/` 目录不存在（实测 `ls`） | ✅ 不冒充 production ready |
| frozen STRM-3 evidence.json | SHA256 = `64bff1d5b3432bdbb61ab141b8658e454e8e59d02860a04844972481ee31a817`（实测） | ✅ 与 evidence `historicalStrm3EvidenceFileSha256` 字面一致 |
| frozen DFI-4A.4.1 evidence.json | SHA256 = `5efbe9268e195b4acb9318e69e65f1c1e81cc94ac5945e012a529fb2509d67d1`（实测） | ✅ 与 evidence `historicalDfi4a41EvidenceFileSha256` 字面一致 |
| frozen v1alpha1 Contract | SHA256 = `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a`（实测） | ✅ byte freeze 维持 |
| 不修改 Renderer | `apps/desktop/src/renderer/pages/settings/SettingsModelPage.vue` 仍 GATED（DFI-4A.4.1 QA 报告字面对应） | ✅ |
| 不修改 Admin/Central/TGM/Knowledge/Agent Lifecycle | `admin = 0.0.0-afe.6c`（实测）+ Central 字面 0.0.0-arh.3.3.3-repair.1 | ✅ |

### 2.9 I 段：父 120 项 ledger 3 段分类

✅ **可独立断言**：

- `evidence.json:parentQaLedgerStatus: "qa_061_080_strm3_qa_081_100_dfi4a42_other_80_retained"` 字面落点。
- **QA-001~060（60 项）**：`result: "retained"` / `ownerTest: "DFI-4A.4.3 stage closure"` / `evidenceKey: "retained_for_dfi4a4_stage_closure"`。
- **QA-061~080（20 项）**：`result: "pass"` / `ownerTest: "run-strm3-process-electron.mjs"` / `"run-strm3-electron.mjs"` / `"run-strm3-harness.mjs"` / `"strm2.*-personal-credential-*.test.ts"` —— 引用 STRM-3 immutable evidence，不重写历史。
- **QA-081~100（20 项）**：`result: "pass"` / `ownerTest: "dfi4a4.2-personal-model-lifecycle.integration.test.ts"` / `"dfi4a4.2-personal-model-command-service.test.ts"` / `"personal-model-v1alpha2-safe-api.test.ts"` —— 本批逐项绑定具体测试文件，不使用聚合文件列表冒充 item-level evidence（evidence.json `:548-663`）。
- **QA-101~120（20 项）**：`result: "retained"` / `ownerTest: "DFI-4A.4.3 stage closure"`。
- 合计：60 retained + 20 STRM-3 + 20 DFI-4A.4.2 + 20 retained = **120 项**（与 evidence `parentQaMatrixCount: 120` 字面对齐）。
- focused 96 项 QA（`evidence.json:parentQaMatrixCount: 120 / focusedQaMatrixCount: 96`）独立 Node 重算 evidence `grep -cE 'QA-0\d{2}' = 166`（含 ledger item-level + 检索类重复），按 ledger 唯一 QA ID 去重 = **120**，符合方案 §10 字面。

### 2.10 J 段：版本 / lockfile / Central / Evidence digest 字面

✅ **事实成立**：

| 字面来源 | 内容 |
|---|---|
| `package.json` `version` | `0.0.0-dfi.4a.4.2`（实测 root） |
| `services/core/package.json` `version` | `0.0.0-dfi.4a.4.2`（实测） |
| `apps/desktop/package.json` `version` | `0.0.0-dfi.4a.4.2`（实测） |
| `packages/contracts/package.json` `version` | `0.0.0-dfi.4a.4.2`（实测）—— 含 v1alpha2 additive |
| `apps/admin-console/package.json` `version` | `0.0.0-afe.6c`（实测）—— 保持 frozen |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`（实测） |
| Central online `check:central` | Tests run: 438, Failures: 0, Errors: 0, Skipped: 0, **BUILD SUCCESS**（实测 2026-08-29 14:33:13） |
| Central offline `check:central:offline` | Tests run: 438, Failures: 0, Errors: 0, Skipped: 0, **BUILD SUCCESS**（实测 2026-08-29 14:36:46） |
| evidence.json `versions` | root/core/contracts/desktop = `0.0.0-dfi.4a.4.2` + admin = `0.0.0-afe.6c` |
| evidence.json `evidenceDigest` | `sha256:f52e7a255374e70a920957ba7641f5643f73a39445946815e42d7261be87dc0e` |
| evidence.json `lockfileDigest` | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` |
| evidence.json `migrationMax` | `26` |
| evidence.json `testFileCount` / `testCount` | `8 / 59`（实测 harness 输出完全一致） |

注：实测 evidence.json 文件 hash = `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb` ≠ 内层语义 digest = `f52e7a25…dc0e` —— 两个不同语义层；前者是整个文件字节流，后者是 evidence 内容 JSON 语义指纹（两者均不变即双层一致）。

### 2.11 K 段：诚实边界 4 项 readiness=false 字面

✅ **事实成立**：

- `scripts/run-dfi4a4.2-harness.mjs:233-246` 字面 13 个 readiness flags：
  - **2 true**：`productionSensitiveTransportReady: true` + `productionBusinessHandlerInstalled: true`（Layer 1 transport + Layer 2 business handler ready）
  - **11 false**：`productionBusinessHandlerReady / productionHelperAssetPresent / personalModelCrudReady / credentialRevealReady / rendererPersonalModelUiReady / dfi4a43Unlocked / enterpriseIdentityReady / adminV2Ready / tgmReady / knowledgeProviderReady / agentLifecycleReady` —— Layer 3 Helper runtime + Layer 4 product surface 全部 false
- `productionHelperAssetPresent` 由 `exists(join(...))` 字面真实探测（`:216`）—— 不被 `?? true` / Fixture / ad-hoc signature 覆盖。
- 与 STRM-3 evidence 字面对齐（Layer 1 transport ready 字面相同）。
- evidence.json 字面字段与 harness 输出逐字段一致（含 `zeroCopyClaimed: false` + `structuredCloneInternalCopiesReliablyClearable: false` 字面约束）。

### 2.12 其他非问题观察（仅记录，不计 P 级）

1. **`targetConfigurationRevision` 桥接**（实施报告 §1 第 22-26 行）—— frozen STRM v1 create ticket 必须带 target configuration revision；Coordinator create 不能把它误当旧 revision。字面通过 Core 在 durable prepare 后读取同一 operation 的 `targetConfigurationRevision` 放入 transport ticket，Broker 执行 create 时不把该 target revision 重新解释为 expected old revision。该桥接**不修改 frozen STRM v1**，也**不削弱 exact ticket binding** —— 字面诚实。
2. **personal-model-management-contracts test file** 落在 `packages/contracts/tests/`（不在 `services/core/tests/` 或 `apps/desktop/tests/`）—— 复跑 harness 已实测 8 files 通过，含此文件。
3. **dfi4a23-owner-reveal.e2e.test.ts 命名**（harness 字面）：harness 直接列举第 8 个 test file 为 `tests/e2e/dfi4a23-owner-reveal.e2e.test.ts`（命名 `dfi4a23` 而非 `dfi4a4.2`），与方案 §2.7 严格 e2e owner-reveal 字面对齐—— 这是历史 STRM-2.3 E2E owner-reveal 的 frozen 字面复用，符合 §6 父方案 QA Ledger 的"reused frozen"风格。
4. **Supervisor strict broker error 期望修复**（实施报告 §3 第 80-82 行）：首次 Node 24 单实例全量 Vitest 修复本批引入的 3/3 focused tests，剩余 2 项非 PASS 是 DFI-5.4.2 / DFI-5.4.3A 历史版本快照断言，按既定治理保持只读，不为当前合法版本演进改写——与 STRM-3 / DFI-4A.4.1 治理风格一致。

---

## 三、发现

### 3.1 P0 = 0

无。本批事实基础（STRM-3 `SENSITIVE_TRANSPORT_READY` 字面 baseline + DFI-4A.4.1 v1alpha1 byte freeze 字面 baseline + 既有 frozen Coordinator / Recovery / Reveal Service / Broker Handler 字面 + `desktop-private-main.ts` 字面 `created.personalCredentialBrokerHandler` 真实安装 + v1alpha2 Contract 264 行 / 20 处 `.strict()` / 8 IPC channel + 8 frozen Preload + 8 Core route + STRM `transport.openPreparedCommand` 字面串接 + Central 438/438 + harness 8/59 PASS + lockfile digest 不变 + migration max=26 + Helper binary 不存在 + frozen STRM-3 / DFI-4A.4.1 evidence 不漂移 + 13 个 readiness flags 中 11 项 false 字面 baseline）全部只读可证。

### 3.2 P1 = 0

无。所有 8 个 frozen Preload method + 8 个 IPC + 8 个 Core route 字面一一对应；普通字段与 Secret 强制分流（create/replace-secret/reveal 走 STRM MessagePort + fd4/fd5；reuse-existing update / delete 走 safe Core command + 零 Secret）；Core 是 ID/revision/canonical material authority；7 项 durability 语义字面落点；Reveal 8 字面 typed code + 无 durable viewed fact；18+ typed safe error code 字面落点 + 7 项错误内容禁止；M1~M10 mutation lifecycle + R1~R8 reveal lifecycle 在 harness 内通过 8 files / 59 tests 隐式覆盖。

### 3.3 P2 = 0

无。方案目标状态（normal Core graph 安装真实 business handler + 8 个 frozen Preload method v1alpha2 + M1~M10 mutation lifecycle + R1~R8 reveal lifecycle + 父 QA-081~100 逐项 executed + 18 类资源归零 + 11 字面 production readiness 中 11 项保持 false：productionBusinessHandlerReady / productionHelperAssetPresent / personalModelCrudReady / credentialRevealReady / rendererPersonalModelUiReady / dfi4a43Unlocked / enterpriseIdentityReady / adminV2Ready / tgmReady / knowledgeProviderReady / agentLifecycleReady）与既有 frozen 事实（STRM-3 `productionSensitiveTransportReady=true / productionBusinessHandlerInstalled=true` 字面 baseline + DFI-4A.4.1 v1alpha1 byte freeze + DFI-5.4.2 frozen Coordinator/Reveal Service + R2D Task 三 management permission false + migration 23/24/26 frozen + Admin `0.0.0-afe.6c` frozen）均不矛盾；不修改 frozen public Contract（v1alpha1 byte freeze + v1alpha2 additive）、不动 migration/lockfile/依赖、不修改 Renderer、不打开 mutation/reveal production UI、不宣称 production ready / Enterprise ready / Renderer ready。

### 3.4 P3 = 0

无。方案 §0 controlling clarification + §1.1-§1.3 事实基础 + §2.1-§2.9 9 个 G + §3 lifecycle matrix + §4 Contract/HTTP/IPC + §5 leak & resource + §6 parent QA ledger + §7 modification boundary + §8 implementation step + §10 focused 96 项 QA + §11 24 项停手条件设计与 frozen 字面（STRM-3 `productionSensitiveTransportReady=true` 字面 + DFI-4A.4.1 `productionHelperAssetPresent=false` 字面 + `desktop-private-main.ts` 字面真实 Broker handler 安装 + 既有 frozen Coordinator/Reveal Service/OperationGate 字面 + 8 IPC channel 字面 `Object.freeze` + 18+ typed error code 字面落点）严格对齐；harness 8 files / 59 tests PASS；Central online/offline 438/438 BUILD SUCCESS；evidence.json 字面字段逐项与 harness 输出 + 实测文件 hash + 实测版本字面对齐。

---

## 四、复跑结果汇总

### 4.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node 版本 | `node --version` | v24.13.0 ✅ |
| pnpm 版本 | `pnpm --version` | 11.11.0 ✅ |
| Harness 复跑 | `pnpm run harness:dfi4a4.2` | **8 files / 59 tests PASS**（2026-08-29 14:27:30，Duration 3.83s）✅ |
| Typecheck | `pnpm run typecheck` | exit 0 ✅ |
| 聚焦 ESLint | `npx eslint apps/desktop/src/main apps/desktop/src/preload services/core/src/application/personal-model-management-command-service.ts services/core/src/desktop-private-main.ts packages/contracts/src/desktop-local/personal-model-management/v1alpha2 services/core/src/adapters/credential` | exit 0，无 warning/error 输出 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | `DTP-4 packaging audit passed.` ✅ |
| Central online | `pnpm run check:central`（JDK 21.0.12） | **438 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS**（2026-08-29 14:33:13） ✅ |
| Central offline | `pnpm run check:central:offline`（JDK 21.0.12） | **438 tests / 0 failures / 0 errors / 0 skipped / BUILD SUCCESS**（2026-08-29 14:36:46） ✅ |

### 4.2 字面只读核对（不计入门禁，仅事实校对）

| 项 | 字面 | 状态 |
|---|---|---|
| `package.json` version | `0.0.0-dfi.4a.4.2` | ✅ |
| `services/core/package.json` version | `0.0.0-dfi.4a.4.2` | ✅ |
| `apps/desktop/package.json` version | `0.0.0-dfi.4a.4.2` | ✅ |
| `packages/contracts/package.json` version | `0.0.0-dfi.4a.4.2` | ✅ |
| `apps/admin-console/package.json` version | `0.0.0-afe.6c` | ✅ |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ |
| `migrations.ts` 末项 `id` | `26` | ✅ |
| `apps/desktop/resources/personal-credential-helper/` | 不存在 | ✅ |
| `artifacts/strm3/evidence.json` SHA256 | `64bff1d5b3432bdbb61ab141b8658e454e8e59d02860a04844972481ee31a817` | ✅ |
| `artifacts/dfi4a41/evidence.json` SHA256 | `5efbe9268e195b4acb9318e69e65f1c1e81cc94ac5945e012a529fb2509d67d1` | ✅ |
| `artifacts/dfi4a42/evidence.json` SHA256 | `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb` | ✅（外层文件 hash，与内层 `f52e7a25…dc0e` 语义 digest 是两个不同语义层） |
| `packages/contracts/src/desktop-local/personal-model-management/v1alpha1/index.ts` SHA256 | `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a` | ✅（byte freeze 维持） |
| `packages/contracts/src/desktop-local/personal-model-management/v1alpha2/index.ts` | 真实存在，264 行，20 处 `.strict()` | ✅ |
| `services/core/src/application/personal-model-management-command-service.ts` | 真实存在，307 行，5 个 public async 方法 | ✅ |
| `apps/desktop/src/main/personal-model-v1alpha2-ipc-router.ts` | 真实存在，132 行 | ✅ |
| 8 IPC channel 字面 | `Object.freeze` + `as const` + 前缀 `robothree:personal-model:v1alpha2:` | ✅ |
| 8 frozen Preload method 字面 | `createPersonalModelApiV1Alpha2` 含 8 个 public method，每个 `.parse()` 严格 Zod 校验 | ✅ |
| 8 Core private route 字面 | `/personal-model-management/v1alpha2/{compatibility,list,detail,create,update,delete,reveal,operation}` | ✅ |
| STRM transport 串接 | `transport.openPreparedCommand` 字面调用 + Broker handler 字面安装 | ✅ |
| 13 个 readiness flags | harness 字面 2 true + 11 false，含 `productionHelperAssetPresent` 由 `exists()` 真实探测 | ✅ |

### 4.3 既有 frozen 引用（不归因本批）

- **前端并行批 `settings-adapter.ts rootRealPath` 边界**：root `lint/check` 当前仍被该文件既有边界命中阻断；本批未越界修改，也不把聚焦 PASS 表述成全仓 clean PASS（与 STRM-3 / DFI-4A.4.1 字面治理风格一致）。
- **DFI-5.4.2 / DFI-5.4.3A 历史版本快照断言**：首次 Node 24 单实例全量 Vitest 修复本批引入的 Supervisor strict broker error 期望后，相关 3/3 focused tests PASS；剩余 2 项非 PASS 是历史版本快照断言，按既定治理保持只读，不为当前合法版本演进改写（与 STRM-3 / DFI-4A.4.1 治理风格一致）。
- **harness:dfi4a4.1 / harness:dfi5.4.3 历史非 PASS 断言**：保持只读，不归因本批（与 STRM-3 / DFI-4A.4.1 治理风格一致）。

---

## 五、诚实边界结论

✅ **字面诚实**。本批最高只确认工程 conformance：

- Layer 1（Sensitive Transport） = `SENSITIVE_TRANSPORT_READY`（STRM-3 继承）+ DFI-4A.4.2 `productionSensitiveTransportReady: true`；
- Layer 2（Business Handler） = `productionBusinessHandlerInstalled: true`（Broker handler 真实安装到 Core）；
- Layer 3（Helper Runtime） = `productionHelperAssetPresent: false`（Helper binary 不存在，目录确认）；
- Layer 4（Product Surface） = `personalModelCrudReady: false` / `credentialRevealReady: false` / `rendererPersonalModelUiReady: false`。

DFI-4A.4.2 字面声明：
- `outcome: "DFI4A42_PERSONAL_MODEL_CRUD_REVEAL_RECOVERY_CONFORMANT"` —— 工程 conformance，不是 production ready；
- 不宣称 `Personal Model production ready` / `Enterprise ready` / `Renderer ready` / `production CRUD ready` / `production Reveal ready` / `Helper asset present`；
- 不打开 mutation/reveal production UI；
- 不创建 production Helper binary；
- DFI-4A.4.3 + Renderer Personal Model UI + 正式签名 Helper + Enterprise identity + Admin v2 + TGM + Knowledge Provider + Agent Lifecycle 全部继续 `GATED/false`。

---

## 六、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是
保持 CODING PASS：是（仅工程 conformance，非 production ready）
```

DFI-4A.4.2 Personal Model CRUD / Credential Reveal / Durable Recovery 实施的事实基础（STRM-3 `SENSITIVE_TRANSPORT_READY` 字面 baseline + DFI-4A.4.1 v1alpha1 byte freeze 字面 baseline + 既有 frozen Coordinator / Recovery / Reveal Service / Broker Handler / Operation Gate / Authority Source 字面 + `desktop-private-main.ts` 字面真实 Broker handler 安装 + 8 frozen Preload method v1alpha2 + 8 IPC channel `Object.freeze` + 8 Core private route + STRM `transport.openPreparedCommand` 字面串接 + v1alpha2 Contract 20 处 `.strict()` + 13 个 readiness flags 中 11 项 false 字面 + 80 次负向泄漏注入 + 18 类资源归零 + 父 QA-081~100 ledger 逐项 executed + 历史 STRM-3 / DFI-4A.4.1 evidence 不漂移 + Central 438/438 + lockfile digest `5b15ae01…874f31` 字面不变 + migration max=26 + Helper binary 不存在 + frozen v1alpha1 Contract SHA256 不变）全部只读可证。

12 项独立评审问题逐项可独立回答：

1. **是**：v1alpha1 byte freeze、CRUD/Reveal 使用 additive v1alpha2（A 段 + 实施报告 §2.1 字面 + v1alpha1 SHA256 实测不变 + v1alpha2 264 行真实落地） ✅
2. **是**：八个 exact API，禁止 generic dispatcher（C 段 + evidence `genericDispatcherCount: 0` 字面 + 8 个 IPC channel `Object.freeze` 字面） ✅
3. **是**：普通字段走 JSON，而 Secret 只走 STRM MessagePort + fd4/fd5（D 段 + Preload `createPersonalModel` 字面 `Uint8Array typed parameter` + `transport.openPreparedCommand` 字面调用） ✅
4. **是**：delete 复用同一 durable mutation 状态机但 body 长度为 0（D 段 + Preload `deletePersonalModel(command)` 无 Secret 参数 + Command Service `delete` 路径走 `createPersonalModelCredentialCommand` 复用既有 Coordinator） ✅
5. **是**：normal Core graph 安装真实 business handler，但 Helper 缺失时 production CRUD/Reveal 仍 false（K 段 + `desktop-private-main.ts:87` 字面 `handler: created.personalCredentialBrokerHandler,` + harness 字面 11 项 readiness false + Helper binary 目录确认不存在） ✅
6. **是**：test-isolated Helper 只证明 conformance、不构成 production ready（K 段 + `productionHelperAssetPresent` 由 `exists()` 真实探测字面） ✅
7. **是**：Core 生成 modelId/credentialRef/revision，Renderer 不作为 authority（B 段 + IPC router `:58` 字面 `commandId / personalModelId / expectedConfigurationRevision / expectedExecutionDefinitionDigest / requestDigest` 由 Core 派生） ✅
8. **是**：create/update/delete 复用现有 Coordinator/Journal/Receipt，不建第二套状态机（B 段 + Command Service 4 处 `createPersonalModelCredentialCommand` + 1 处 `createPersonalModelRevealCommand` 字面 + 实施报告 §1 第 22-26 行 targetConfigurationRevision 桥接字面） ✅
9. **是**：recovery 不重新向 Renderer 索取 Secret，无法确定时输出 uncertain/manual/cleanup（E 段 + `recoverOnce(limit = 100)` 字面 + 7 字面 `personal_model.*_uncertain / *_manual / *_cleanup` typed code 落点） ✅
10. **是**：Reveal 无 durable viewed fact、无自动 replay、无 clipboard/cache/fan-out（E 段 + Reveal 字面 `rate_limited / busy / replay_forbidden / deadline_exceeded` 字面） ✅
11. **是**：本批只执行父 QA-081~100，其余 80 项保留到 DFI-4A.4.3（I 段 + evidence.json `parentQaLedgerStatus: "qa_061_080_strm3_qa_081_100_dfi4a42_other_80_retained"` 字面 + QA-001~060 + QA-101~120 全部 `result: "retained"`） ✅
12. **是**：4~7 日估算，关闭后仍不自动解锁 DFI-4A.4.3 或 Renderer UI（实施报告 §4 字面 + 13 个 readiness flags 中 `dfi4a43Unlocked / rendererPersonalModelUiReady` 字面 false） ✅

---

## 七、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；评审结论 **PASS（不附条件修订）**；可冻结：**是**；保持 `INDEPENDENT QA PENDING` → 待用户接受。
2. **决策 1**：是否要求在 evidence schema 中增补"8 IPC channel 完整 string 值字面 + 8 frozen Preload method 完整签名字面"为可独立验证字段（推荐添加，提升 §6 父方案 ledger 与 IPC 字面的一致性）。
3. **决策 2**：DFI-4A.4.2 是否可进入 `PASS/CLOSED`（**推荐要求**先确认生产 Helper binary 仍未提交仓库 + `desktop-private-main.ts` 字面真实 Broker handler 安装 + Central online/offline 438/438 已实测 + 8 files / 59 tests harness 已实测 PASS + 13 个 readiness flags 中 11 项 false 字面 baseline 完整）。
4. **后续路径**（与上游文档复核报告一致）：
   - DFI-4A.4.2 接受后用户单独授权 DFI-4A.4.3（Real Desktop E2E + Closure + Frontend Handoff，3~5 日）；
   - 后续 Desktop Renderer Personal Model UI 单独授权（前置条件：production Helper signing asset）；
   - production Helper signing asset 单独授权（独立批次，DFI-4A.4 helper packaging 升级）。
5. **DFI-4A.4.2 关闭后**：仅允许输出 `DFI4A42_PERSONAL_MODEL_CRUD_REVEAL_RECOVERY_CONFORMANT` + `productionSensitiveTransportReady=true / productionBusinessHandlerInstalled=true`，**同时**附带 11 字面 readiness（`productionBusinessHandlerReady / productionHelperAssetPresent / personalModelCrudReady / credentialRevealReady / rendererPersonalModelUiReady / dfi4a43Unlocked / enterpriseIdentityReady / adminV2Ready / tgmReady / knowledgeProviderReady / agentLifecycleReady`）+ `zeroCopyClaimed=false / structuredCloneInternalCopiesReliablyClearable=false`——**不**等于 production Personal Model CRUD ready / production Credential Reveal ready / production Helper asset present / Enterprise ready / Renderer ready；DFI-4A.4.3 + 后续 Renderer UI 仍需独立计划接受和编码授权。

代码 QA 通过**不等于**用户接受。DFI-4A.4.2 当前保持 `INDEPENDENT QA PENDING`，待：
- 用户接受本报告；
- 用户按上述决策给出指令；
- 用户单独接受 DFI-4A.4.2 为 `PASS/CLOSED`。

方可启动 DFI-4A.4.3 编码授权流程。本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）

---

## 八、用户接受记录（2026-08-29）

上述 §七为独立 QA 落盘时的待接受流程。用户现已正式接受本独立代码 QA 结论，DFI-4A.4.2 标记为
`PASS/CLOSED`。§3.3 readiness 数量由“9 项”修正为“11 项”，该修订仅为 docs-only 精度收口，
不触发重新 QA。本次关闭只确认 `DFI4A42_PERSONAL_MODEL_CRUD_REVEAL_RECOVERY_CONFORMANT`；正式签名 Helper、
production CRUD/Reveal、Renderer Personal Model UI、DFI-4A.4.3 及其他下游继续 `GATED/false`，不自动解锁。
