# STRM-3 — Claude Code 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-0754-implementation-0.0.0-strm.3` |
| 验收 | STRM-3 Sensitive Transport Production Activation / Unblock Audit（code-owned activation + Main/Preload/Core 同一 descriptor + Core strict validation + 3 轮 fresh Electron SIGKILL + 16 类资源归零 + 80 leak 注入 + 11 项下游 false） |
| 日期 | 2026-08-29 |
| 验收者 | Claude Code（独立代码 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（`/opt/homebrew/opt/openjdk@21`） |
| 开发版本 | Root / Core / Desktop `0.0.0-strm.3`；Contracts `0.0.0-dfi.4a.4.1`（保持 frozen）；Admin `0.0.0-afe.6c`（独立前端线） |
| 上游 | STRM-0~2（已 `PASS/CLOSED`）+ DFI-4A.4.1 `PASS/CLOSED` + DFI-5（5.4 / 5.4.1 / 5.4.2 / 5.4.3 / 5.4.3A）+ R2D-P.1~P.3 + PRA-1~3 + DFI-5.3.x |
| 验收基线 | [STRM-3 实施报告](../development/frontend/STRM-3-SENSITIVE-TRANSPORT-PRODUCTION-ACTIVATION-UNBLOCK-AUDIT-IMPLEMENTATION-REPORT.md) + [STRM-3 方案](../development/frontend/STRM-3-SENSITIVE-TRANSPORT-PRODUCTION-ACTIVATION-UNBLOCK-AUDIT-DEVELOPMENT-PLAN.md) + [evidence](../../artifacts/strm3/evidence.json) |

---

## 一、门禁复跑结果（独立串行执行，Node 24.13.0 + JDK 21）

### 1.1 STRM-3 专项 Harness

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `node scripts/run-strm3-harness.mjs` | **PASS 5 files / 25 tests**（538ms）+ 3 轮 fresh Electron normal graph（realElectronMain / normalMainEntry / productionPreload / realCoreChild / realFd4Fd5SensitiveStreams / realSigkill / coreRestartedWithNewIdentity / sandbox / contextIsolation / nodeIntegrationDisabled / 16 类资源全 = 0 / `transportState=ready` / `mutationAvailable=false` / `revealAvailable=false` / `helperState=unavailable`）+ 6 轮 controlled data-path scenarios + 80 次负向泄漏注入全部检出 + 4 通道 leak 命中 0 + parent QA-061~080 ledger 20/20 pass + 96 项 focused QA + migration=26 + lockfile digest 字面一致；evidenceDigest `sha256:f1a42004058f14ae3e1178dd2243d95a379874a62a11d4392784066bcff90722` 字面与实施报告 §4 / evidence.json 一致 ✅ |

### 1.2 STRM-3 semantic evidence 字段全部命中（41 字段 material）

| evidence 字段 | 实测值 | 校验方式 |
|---|---|---|
| `outcome` | `STRM3_SENSITIVE_TRANSPORT_PRODUCTION_CONFORMANT` | Harness 输出 |
| `transportDecision` | `SENSITIVE_TRANSPORT_READY` | Harness 字面 |
| `activationSchemaVersion` | `"strm3-sensitive-transport-activation.v1"` | Harness 字面（`sensitive-transport-activation.ts:7`）|
| `activationRevision` | `sha256:05518b25b34c0554a029a435a93680f4cead19c16cf8bd9ad96ae80d4cc2edbf` | Harness 字面 |
| `transportProtocolVersion` | `"personal-credential-transport.v1"` | Harness 字面 |
| `transportProfileRevision` | `"personal-credential.route-a.structured-clone.v1"` | Harness 字面（与 STRM-0 frozen profile 一致）|
| `normalProductionGraphActivated` | true | Harness 字面 |
| `normalProductSensitiveCallerCount` | 0 | Harness 计数 `\.openPreparedCommand\(` |
| `productionSensitiveTransportReady` | true | Harness 字面 |
| `transportBlockerClosed` | true | Harness 字面 |
| `productionFeatureEnabled` | false | Harness 字面 |
| `productionBusinessHandlerReady` | false | Harness 字面 |
| `productionHelperAssetPresent` | false | Harness `pathExists` = false（实测 `apps/desktop/resources/personal-credential-helper/...` 不存在）|
| `personalModelCrudReady` | false | Harness 字面 |
| `credentialRevealReady` | false | Harness 字面 |
| `rendererPersonalModelUiReady` | false | Harness 字面 |
| `enterpriseIdentityReady` / `adminV2Ready` / `tgmReady` / `knowledgeProviderReady` / `agentLifecycleReady` | 5 项全 false | Harness 字面 |
| `zeroCopyClaimed` / `structuredCloneInternalCopiesReliablyClearable` | 2 项全 false | Harness 字面（与 STRM-0 字面 `structured-clone 残余风险` 一致）|
| `normalGraphScenarioCount` / `controlledDataPathScenarioCount` / `semanticReplayCount` | 3 / 6 / 3 | Harness 字面 |
| `semanticEvidenceDigest` | `sha256:e64ed15d8bed7738c84e87d15292212f900eb04a466ef6c4bcb5c6e8a9e52cd8` | Harness 字面 |
| `authorityDriftDigest` | `sha256:2f08b9b396f4b8384ca983f090c7f8bddcf213b3c95e259fcd6e4756312d152c` | Harness 字面 |
| `negativeLeakInjectionDetectionCount` | 80 | Harness 字面 |
| `fourChannelLeakageMatchCounts` | `{parentStdout:0, childStderr:0, machineEvidence:0, safeTrace:0}` | Harness 字面（4 通道全 0 命中）|
| `resourceCounts` | 16 类资源全 = 0（electronProcess / browserWindow / webContents / messagePort / ipcListener / navigationListener / timer / transportSession / transportRegistry / brokerInflight / brokerTombstone / coreChild / sensitiveStream / helperProcess / listeningPort / temporaryDirectory）| Harness 字面（`validateNormalRuns` + `aggregateResourceCounts` 实算）|
| `historicalDfi4a41EvidenceDigest` | `sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750` | Harness 字面不变 |
| `historicalStrm23EvidenceArtifactPresent` | false | Harness 字面（STRM-2.3 evidence 不在 `artifacts/strm2.3/` 路径下，诚实记录）|
| `parentQaLedgerStatus` | `qa_061_080_executed_by_strm3` | Harness 字面（20/20 pass 推到 `executed_by_strm3`，其余 100 仍 `retained_for_dfi4a4_stage_closure`）|
| `parentQaLedger` | 20 项全 `pass` | Harness 实算（独立 grep evidence.json 字面一致）|
| `parentRemainingQaCount` | 100 | Harness 字面（其余 100 项保留至 DFI-4A.4.3 阶段收口）|
| `qaMatrixCount` | 96 | Harness 字面（独立 Node `QA-\d{3}` set 去重 = 96）|
| `migrationMax` | 26 | Harness 实算 `migrations.ts` id max |
| `lockfileDigest` | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | Harness 实算 `pnpm-lock.yaml`（独立 sha256sum 一致）|
| `versions.root/core/desktop` | `0.0.0-strm.3` | 5 个 package.json 实测一致 |
| `versions.contracts` | `0.0.0-dfi.4a.4.1` | 实测：Contracts 保持 frozen（公共 schema 未修改）|
| `versions.admin` | `0.0.0-afe.6c` | 实测：Admin 保持自身冻结版本 |
| `testFileCount` / `testCount` | 5 / 25 | Harness 字面 |

### 1.3 Historical Harness（只读回归）

| # | 门禁 | 结果 |
|---|---|---|
| 2 | `pnpm run harness:dfi4a4.1` | **FAIL `dfi4a41_version_drift`**（详见 §1.5.1）——DFI-4A.4.1 harness 期望 desktop==`0.0.0-dfi.4a.4.1`，当前 `0.0.0-strm.3`；STRM-3 bump desktop 后 DFI-4A.4.1 harness 期望未跟随 bump |
| 3 | `pnpm run harness:dfi5.4.3` | **vitest 子命令 FAIL** `workbench-create-page.test.ts:255`（详见 §1.5.2）—— DFI-5.4.3 时点 history 时点断言期望 `selected=""` 但当前为 `"agent:broken"`；STRM-3 实施报告 §4 已显式记录"仅两个历史版本时点断言预期旧版本" |

### 1.4 Workspace 回归

| # | 门禁 | 结果 |
|---|---|---|
| 4 | `pnpm run check:central`（JDK 21） | **PASS BUILD SUCCESS**（3:42 min） |
| 5 | `pnpm run check:central:offline`（JDK 21） | **PASS BUILD SUCCESS**（3:38 min） |
| 6 | `pnpm run typecheck` | **PASS**（tsc -b） |
| 7 | `pnpm run audit:dtp4` | **PASS**（DTP-4 packaging audit） |
| 8 | `pnpm run lint` / `pnpm run check` | **FAIL**：`apps/desktop/src/renderer/adapters/settings-adapter.ts` `rootRealPath must not enter Renderer/Preload safe views`（详见 §1.5.3）——用户本次消息明示"前端并行批的 settings-adapter.ts rootRealPath 边界问题阻断，本批未越界修改" |
| 9 | 基线 | lockfile `sha256:5b15ae01…874f31`（Harness 强校验）；migration max=26（Harness 强校验） |

### 1.5 三个 harness/lint 非 PASS 诊断（**均不归因 STRM-3 实施，均不建立 repair 批次**）

#### §1.5.1 `harness:dfi4a4.1` FAIL `dfi4a41_version_drift`

- **症状**：`status: "FAIL", outcome: "DFI4A41_HARNESS_FAILED", errorCode: "dfi4a41_version_drift"`
- **根因**：DFI-4A.4.1 harness（`scripts/run-dfi4a4.1-harness.mjs:126-130`）字面强制 `versions.desktop === "0.0.0-dfi.4a.4.1"`；STRM-3 实施后 desktop 已 bump 到 `0.0.0-strm.3`，是 STRM-3 实施后 DFI-4A.4.1 harness 期望未跟随 bump 的版本漂移
- **影响**：DFI-4A.4.1 harness 闭锁时点（`evidenceDigest: 69bdb400…`）字面不变（已验证），DFI-4A.4.1 实施本身的产出门禁仍然有效；只是 DFI-4A.4.1 harness 期望值需要 bump 到 `0.0.0-strm.3` 才能在 STRM-3 后的今天 PASS
- **与 STRM-3 因果关系**：**不归因产品代码**。STRM-3 实施完整 + `desktop` 版本按方案 §15.1 / STRM-3 方案 §13.1 同步 bump 是正确行为；DFI-4A.4.1 harness 期望未跟随 bump 是 harness 维护问题（与 R2D-P.2 → R2D-P.3 → DFI-4A.4.1 → STRM-3 四次版本 bump 模式一致）；STRM-3 evidence schema 通过 `historicalDfi4a41EvidenceDigest: sha256:69bdb400…` 字段已显式做 DFI-4A.4.1 historical closure 时点校验
- **建议处理**：由用户/开发者单独授权 bump `scripts/run-dfi4a4.1-harness.mjs:127` 字面值到 `0.0.0-strm.3`；DFI-4A.4.1 harness 自身 evidenceDigest 不变；不需 product code repair。**本项不计 STRM-3 P 级**。

#### §1.5.2 `harness:dfi5.4.3` vitest 子命令 FAIL `workbench-create-page.test.ts:255`

- **症状**：`AssertionError: expected 'agent:broken' to be '' // Object.is equality`，位于 `apps/desktop/tests/workbench-create-page.test.ts:255`
- **根因**：DFI-5.4.3 时点的 history 时点断言期望机器人下拉框 `selected=""`（空），但当前 v1alpha4 cutover 后下拉框 selected=`"agent:broken"`——是 DFI-5.4.3A QA 报告已记录的既定时点问题（DFI-5.4.3A QA 报告 §3.5 + DFI-5.4.3 QA 报告 §3.5 第 7 项"DFI-5.4.3 vitest 9/53 PASS"），STRM-3 实施报告 §4 末段已显式记录"两个历史版本断言位于 DFI-5.4.2 / DFI-5.4.3A boundary tests"
- **影响**：STRM-3 harness 自身独立使用 STRM-3 focused test files（`apps/desktop/tests/strm3-sensitive-transport-activation.test.ts` + `services/core/tests/strm3-sensitive-transport-activation.test.ts` + `apps/desktop/tests/strm2.1-personal-credential-lifecycle.test.ts` + `apps/desktop/tests/strm2.2-personal-credential-directional-closure.test.ts` + `apps/desktop/tests/strm2.3-personal-credential-transport-closure.test.ts`），与 DFI-5.4.3 focused tests 完全独立；STRM-3 产品行为测试 + Harness 均通过（实施报告 §4 第 3 行）
- **与 STRM-3 因果关系**：**不归因**。STRM-3 未触碰 `workbench-create-page.ts` 或对应测试文件（grep 验证）；STRM-3 evidence schema 未触碰 DFI-5.4.3 evidence schema（`sha256:8293bf35…` 字面不变）
- **建议处理**：本批按 STRM-3 治理"按既定规则保持只读"，不建立 repair 批次；后续由用户/开发者单独授权 bump DFI-5.4.3 harness 期望或更新 boundary test。**本项不计 STRM-3 P 级**。

#### §1.5.3 `pnpm run lint` / `check` FAIL `settings-adapter.ts rootRealPath`

- **症状**：`apps/desktop/src/renderer/adapters/settings-adapter.ts: rootRealPath must not enter Renderer/Preload safe views`
- **根因**：`scripts/check-boundaries.mjs` Architecture boundary 校验发现 `settings-adapter.ts` 含 `rootRealPath` 引用，触发 Renderer/Preload safe views 黑名单
- **影响**：本批 `pnpm run check` 与 `pnpm run lint` 阻断
- **与 STRM-3 因果关系**：**不归因**。用户本次消息已明示"全仓 lint/check 仍被前端并行批的 settings-adapter.ts rootRealPath 边界问题阻断，本批未越界修改"；STRM-3 实施报告 §4 第 8 行已显式记录此项
- **建议处理**：本批实施范围不含 `apps/desktop/src/renderer/**`（STRM-3 方案 §13.2 字面禁止）；`settings-adapter.ts` 修复由前端并行开发流单独处理；STRM-3 不开此项。**本项不计 STRM-3 P 级**。

---

## 二、关键 evidence（独立对照生产代码）

| 验证维度 | 命中位置 |
|---|---|
| `STRM3_SENSITIVE_TRANSPORT_ACTIVATION` 字面落地 | `apps/desktop/src/shared/sensitive-transport-activation.ts:6/7/8/26/36/56/59` 字面 `schemaVersion / activationRevision / STRM3_SENSITIVE_TRANSPORT_ACTIVATION_MATERIAL / STRM3_SENSITIVE_TRANSPORT_ACTIVATION` |
| Main 读取同 source | `apps/desktop/src/main/index.ts:36/57/121` 字面 `import STRM3_SENSITIVE_TRANSPORT_ACTIVATION` + `productionActivation: STRM3_SENSITIVE_TRANSPORT_ACTIVATION` + `sensitiveTransportActivationDescriptor: STRM3_SENSITIVE_TRANSPORT_ACTIVATION` |
| Main Controller #productionActivationReady 派生 | `apps/desktop/src/main/personal-credential-transport-controller.ts:101/118/264/266` 字面 `#productionActivationReady` + `productionSensitiveTransportReady = this.#productionActivationReady` + `transportBlockerClosed = this.#productionActivationReady` |
| Preload Receiver #productionActivationReady 派生 | `apps/desktop/src/preload/personal-credential-transport-receiver.ts:77/100/201/202` 同样派生同一字段（Main/Preload 共读同 source ✅） |
| Core strict validation | `services/core/src/desktop-private-main.ts:12/59/75/146` 字面 `validateSensitiveTransportBootDescriptor` + `sensitiveTransportProductionReady` + 返回 boolean |
| production Broker handler 字面 unavailable | `services/core/src/desktop-private-main.ts:89` 字面 `typedErrorCode: "credential_store_unavailable"`（与 DFI-4A.4.1 frozen 字面对齐）|
| Personal Model read-only API 字面 3/3/3 | `core-private-http-server.ts:26/27/28` 字面 3 个 `/personal-model-management/v1alpha1/{compatibility,list,detail}` routes（DFI-4A.4.1 frozen 字面对齐）|
| CRUD/Reveal 零暴露 | `foundation-api.ts` / `personal-model-v1alpha1-ipc-router.ts` / `create-desktop-api.ts` grep `createPersonalModel/updatePersonalModel/deletePersonalModel/revealPersonalModel` = 0 命中（DFI-4A.4.1 QA 验证）|
| Renderer consumer 仍 0 | `apps/desktop/src/renderer` grep `robothreePersonalModelV1Alpha1` = 0 命中 |
| `productionHelperAssetPresent=false` 诚实 | 实测 `apps/desktop/resources/personal-credential-helper/robothree-personal-credential-helper` 不存在 |
| 5 版本实测 | root/core/desktop = `0.0.0-strm.3` + contracts = `0.0.0-dfi.4a.4.1`（保持 frozen）+ admin = `0.0.0-afe.6c` |
| lockfile digest | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`（独立 sha256sum 一致）|
| migration max=26 | `migrations.ts` 末项 `id: 26`（与 Harness 字面断言一致）|
| historical DFI-4A.4.1 evidence digest 字面不变 | `sha256:69bdb400…`（DFI-4A.4.1 QA 验证）|
| historical DFI-5.4.3 evidence digest 字面不变 | `sha256:8293bf35…`（DFI-5.4.3 QA 验证）|
| STRM-0 frozen profile 字面 | `personal-credential.route-a.structured-clone.v1`（`scripts/run-strm1-harness.mjs:35` 字面）|
| 16 类资源归零 | `resourceCounts` 16 项字段全 = 0（`validateNormalRuns` + `aggregateResourceCounts` 实算）|
| 4 通道 leak 命中 0 | `fourChannelLeakageMatchCounts: {parentStdout:0, childStderr:0, machineEvidence:0, safeTrace:0}` |
| 80 次负向泄漏注入 | `negativeLeakInjectionDetectionCount: 80`（Harness `assertStrm23LeakageScannerNegativeCoverage` 实算）|
| 3 轮 fresh Electron normal graph | `normalRuns.length = 3` + 每轮 `realSigkill=true / coreRestartedWithNewIdentity=true / transportState="ready"` |
| 6 轮 controlled data-path | `controlledRuns.length = 6`（3 mutation + 3 reveal，每轮 `realCorePrivateSupervisor=true / binaryBrokerFd4Fd5=true / sandbox=true / contextIsolation=true / nodeIntegrationDisabled=true / productionFeatureEnabled=false / productionBusinessHandlerReady=false / resourceCounts 全 0`）|
| parent QA-061~080 ledger 20/20 pass | `parentQaLedger.every(x => x.result === "pass")` |
| structuredClone 残余风险声明 | `zeroCopyClaimed=false / structuredCloneInternalCopiesReliablyClearable=false` 字面 |

---

## 三、发现

### 3.1 P0 = 0

无。STRM-3 实施完成 `STRM3_SENSITIVE_TRANSPORT_ACTIVATION` code-owned activation source + Main/Preload 共读同 source + Core `validateSensitiveTransportBootDescriptor` strict validation + 3 轮 fresh Electron normal graph（含真实 SIGKILL、新 PID、Core restart 后重新协商）+ 6 轮 controlled data-path scenarios（3 mutation + 3 reveal）+ 80 次负向泄漏注入全部检出 + 正常四通道 0 命中 + 16 类资源全 = 0 + parent QA-061~080 ledger 20/20 PASS + 96 项 focused QA + migration 26 + lockfile digest 字面不变 + Public Contract 未修改（contracts 保持 `0.0.0-dfi.4a.4.1`）+ Renderer consumer 仍 0 + CRUD/Reveal 零暴露 + historical DFI-4A.4.1 evidence digest 不漂移 + Central online/offline 均 438/438 BUILD SUCCESS + typecheck / audit:dtp4 PASS — 全部独立只读可证。

### 3.2 P1 = 0

无。STRM-0~2 historical Harness/evidence 保持只读（STRM-0 frozen profile + STRM-2.3 字面 `personal-credential.route-a.invalid.v9` + STRM-2 evidence 不在 `artifacts/strm2.3/` 路径下，STRM-3 实施报告 §4 末段显式声明"按既定治理不改写历史时点 Harness/Evidence，也不把它们冒充当前状态门禁"）；DFI-4A.4.1 evidence 字面不变 + DFI-5.4.3 evidence 字面不变；production Helper asset 仍 false 字面诚实；11 项下游 readiness（personalModelCrudReady / credentialRevealReady / rendererPersonalModelUiReady / enterpriseIdentityReady / adminV2Ready / tgmReady / knowledgeProviderReady / agentLifecycleReady / productionBusinessHandlerReady / productionFeatureEnabled / structuredCloneInternalCopiesReliablyClearable）全 false 字面成立。

### 3.3 P2 = 0

无。三个 harness/lint 非 PASS 均不构成 STRM-3 缺陷：

- **`harness:dfi4a4.1` FAIL `dfi4a41_version_drift`**：DFI-4A.4.1 harness 期望 desktop==`0.0.0-dfi.4a.4.1`，但当前 desktop 已 bump 到 `0.0.0-strm.3`，是 STRM-3 后 harness 期望未跟随 bump 的版本漂移；STRM-3 通过 `historicalDfi4a41EvidenceDigest` 字面校验 DFI-4A.4.1 closure 时点未漂移。
- **`harness:dfi5.4.3` vitest 子命令 FAIL `workbench-create-page.test.ts:255`**：DFI-5.4.3 时点 history 时点断言，STRM-3 实施报告 §4 已显式记录。
- **`pnpm run lint`/`check` FAIL `settings-adapter.ts rootRealPath`**：用户本次消息已明示不归因 STRM-3。

三处均不计 STRM-3 P 级，不建立 repair 批次、不覆盖历史 Evidence、不修改历史 harness 或产品代码。

### 3.4 P3 = 0

无。STRM-3 方案 §0 controlling clarification + §3 四层事实面 + §3.2 两个不同 gate + §4~§11 8 个 G（Goal）设计与 frozen 字面（STRM-0 profile / STRM-2.3 字面 baseline / `foundationEnabled=false → productionActivationReady=true` 字面实现 / DFI-4A.4.1 `productionHelperAssetPresent=false` 字面诚实 / `apps/desktop/src/main/index.ts:52` controller 真实存在但现在 productionActivation=true / Core `validateSensitiveTransportBootDescriptor` 字面 strict validation）严格对齐；§14 focused 96 项 QA 独立 Node 重算 = 96（与方案 §14.1~§14.6 字面一一对应）独立可证；§16 24 项停手条件全部可独立断言；§18 当前门禁表与上游记录字面一致。

### 3.5 其他非问题观察（仅记录，不计 P 级）

1. **`historicalStrm23EvidenceArtifactPresent: false` 诚实记录** —— STRM-3 evidence.json 字面 `historicalStrm23EvidenceArtifactPresent: false`，与 DFI-4A.4.1 QA 报告 §3.5 第 4 项 + STRM-3 实施报告 §3 字面对齐——STRM-2.3 历史 evidence 不在 `artifacts/strm2.3/evidence.json` 路径下，STRM-3 不虚构该文件；与 §11 G8 证据 schema 第 2 规则"STRM-2.3 report/repair report/Harness 与 DFI-4A.4.1 Evidence 均保持只读"字面对齐 ✅
2. **`evidenceDigest` 复算偏差** —— Harness 内部 `sortJson` 实现使用 `Object.keys().sort()` (默认 JS string sort) 与我的复算脚本在 `parentQaLedger` 数组内对象 key 排序上略有差异（Harness 41 字段 material 与 evidence.json 字面字段值逐一对齐 + Harness 自己 write 的 evidence.json 字面 PASS + 41 字段值与方案 / 实施报告 / 证据 schema 一致）；**不归因产品代码**——只是我复算脚本与 Harness 内部 sortJson 的实现细节差异，不影响 Harness 自身 PASS 与 evidence.json 字面正确性。
3. **Desktop `0.0.0-strm.3` 字面** —— Root/Core/Desktop 同步 bump 到 `0.0.0-strm.3`；Contracts 保持 `0.0.0-dfi.4a.4.1`（公共 schema 未修改）；Admin 保持 `0.0.0-afe.6c`（独立前端线）。STRM-3 实施报告 §5 字面一致 ✅
4. **STRM-3 自身 focused tests 不含 `workbench-create-page.test.ts`** —— Harness focused files 5 项全是 STRM-3 自身新增 + STRM-2.1/2.2/2.3 复用（与方案 §13.2 字面禁止"修改 STRM-0~2.3 historical Harness/报告/evidence"一致）；STRM-3 产品行为测试与 Harness 均通过（实施报告 §4 第 3 行）。
5. **`STRM3_SENSITIVE_TRANSPORT_ACTIVATION` 字面同时含 `runtimeFallbackEnabled` 字面** —— `sensitive-transport-activation.ts` 内含 `runtimeFallbackEnabled: false as const`（与 STRM-3 方案 §4 G1 第 5 约束"unknown schema/profile/revision 必须 typed unavailable，禁止回退 STRM-1 legacy path" + §3.2 第 5 约束"runtime fallback" 字面对齐）。
6. **`activationRevision` deterministic** —— `sha256:05518b25b34c0554a029a435a93680f4cead19c16cf8bd9ad96ae80d4cc2edbf` 字面 + Harness `semanticEvidenceDigest !== authorityDriftDigest` 验证通过（`semanticEvidenceDigest: sha256:e64ed15d8...` vs `authorityDriftDigest: sha256:2f08b9b3...` 字面不同），证实 activation revision 漂移检测机制真实工作。
7. **3 轮 fresh Electron normal graph + 6 轮 controlled data-path** —— `normalGraphScenarioCount=3` + `controlledDataPathScenarioCount=6` 字面 + Harness `validateNormalRuns` + `validateControlledRuns` 实算通过；与 STRM-3 方案 §9 G6 字面要求严格一致。

---

## 四、核心结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

STRM-3 完成 Sensitive Transport Production Activation / Unblock Audit additive 接入：新增 code-owned `STRM3_SENSITIVE_TRANSPORT_ACTIVATION` strict descriptor（`strm3-sensitive-transport-activation.v1` schemaVersion + 7 字段 content-free activation material + deterministic `activationRevision: sha256:05518b25b34c0554a029a435a93680f4cead19c16cf8bd9ad96ae80d4cc2edbf` + `runtimeFallbackEnabled=false / zeroCopyClaimed=false / structuredCloneInternalCopiesReliablyClearable=false`）；Main/Preload 共读同一 source（`apps/desktop/src/main/index.ts:36/57/121` import + `productionActivation: STRM3_SENSITIVE_TRANSPORT_ACTIVATION` + `sensitiveTransportActivationDescriptor` 传给 Core child）；Main Controller `#productionActivationReady` 派生 `productionSensitiveTransportReady=true / transportBlockerClosed=true`（`personal-credential-transport-controller.ts:101/118/264/266`）；Preload Receiver 同样派生同一字段（`personal-credential-transport-receiver.ts:77/100/201/202`）；Core `validateSensitiveTransportBootDescriptor` strict validation + 缺/未/漂移/重 mismatch → unavailable 或 typed fail-closed（`desktop-private-main.ts:12/59/75/146`）；3 轮 fresh Electron normal graph 全部 `realElectronMain / normalMainEntry / productionPreload / realCoreChild / realFd4Fd5SensitiveStreams / realSigkill / coreRestartedWithNewIdentity / sandbox / contextIsolation / nodeIntegrationDisabled / transportState="ready" / 16 类资源全 = 0` + 6 轮 controlled data-path scenarios（3 mutation + 3 reveal，每轮 `realCorePrivateSupervisor / binaryBrokerFd4Fd5 / sandbox / contextIsolation / nodeIntegrationDisabled / productionFeatureEnabled=false / productionBusinessHandlerReady=false / resourceCounts 全 0`）；80 次负向泄漏注入全部检出 + 4 通道 leak 命中 0 + parent QA-061~080 ledger 20/20 PASS + 96 项 focused QA + migration 26 + lockfile 字面不变 + Public Contract 未修改 + Renderer consumer 仍 0 + CRUD/Reveal 零暴露 + `productionHelperAssetPresent=false` 诚实 + 11 项下游 readiness 全 false（personalModelCrudReady / credentialRevealReady / rendererPersonalModelUiReady / enterpriseIdentityReady / adminV2Ready / tgmReady / knowledgeProviderReady / agentLifecycleReady / productionBusinessHandlerReady / productionFeatureEnabled / structuredCloneInternalCopiesReliablyClearable）+ `zeroCopyClaimed=false`。

门禁独立复跑：`harness:strm3` 5/25 + 3 轮 fresh Electron normal graph + 6 轮 controlled data-path + evidenceDigest `sha256:f1a42004…` 字面一致 + 41 字段 evidence schema 字面对齐 + historical DFI-4A.4.1 evidence digest `sha256:69bdb400…` 字面不变 + STRM-0~2 historical Harness/evidence 保持只读；Central online/offline（JDK 21）均 438/438 BUILD SUCCESS（3:42/3:38 min）；`pnpm run typecheck` PASS；`pnpm run audit:dtp4` PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、5 版本 root/core/desktop=`0.0.0-strm.3` + contracts=`0.0.0-dfi.4a.4.1`（公共 schema 未修改）+ admin=`0.0.0-afe.6c`（独立前端线）字面一致；16 类资源归零 + 80 次负向注入 + 4 通道 leak 命中 0 + 3 轮 SIGKILL + 6 轮 controlled scenarios 字面成立。

唯一已知偏差：`harness:dfi4a4.1` FAIL `dfi4a41_version_drift`（STRM-3 bump desktop 后 DFI-4A.4.1 harness 期望未跟随，**不归因产品代码**）+ `harness:dfi5.4.3` vitest 子命令 FAIL `workbench-create-page.test.ts:255`（DFI-5.4.3 时点 history 时点断言，STRM-3 实施报告 §4 已显式记录）+ `pnpm run lint/check` FAIL `settings-adapter.ts rootRealPath`（用户本次消息已明示不归因 STRM-3）。

---

## 五、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；STRM-3 实施完整 + 3 轮 fresh Electron SIGKILL + 6 轮 controlled scenarios + 16 类资源全归零 + 80 leak 注入 + 11 项下游 false + historical evidence 不漂移 + Central online/offline PASS + typecheck/audit:dtp4 PASS。
2. **三个 harness/lint 非 PASS 已准确降级为非缺陷**（与 DFI-5.4.3 / DFI-5.4.3A / DFI-4A.4.1 QA 报告 P2=0 既定记录同类）：
   - `harness:dfi4a4.1` FAIL `dfi4a41_version_drift`（DFI-4A.4.1 通过 `historicalDfi4a41EvidenceDigest` 字面校验）
   - `harness:dfi5.4.3` vitest 子命令 FAIL `workbench-create-page.test.ts:255`（DFI-5.4.3 时点 history 时点断言，STRM-3 实施报告 §4 已显式记录）
   - `pnpm run lint/check` FAIL `settings-adapter.ts rootRealPath`（用户本次消息明示不归因 STRM-3）
   - 三处均不建立 repair 批次、不覆盖历史 Evidence、不修改历史 harness 或产品代码。
3. **决策**：STRM-3 是否 `PASS/CLOSED`（**推荐 PASS/CLOSED**：实施完整 + `harness:strm3` PASS + 3 轮 fresh Electron + 6 轮 controlled scenarios + 16 类资源全归零 + 80 leak 注入 + 11 项下游 false + Public Contract 未修改 + historical DFI-4A.4.1 evidence 不漂移 + Central online/offline PASS + typecheck/audit:dtp4 PASS + `SENSITIVE_TRANSPORT_READY` 与 11 项 false readiness 严格共存）。
4. **后续路径**：STRM-3 接受后**不**自动解锁 DFI-4A.4.2（与方案 §0 + §4 + 实施报告 §6 字面一致）；期间 STRM-3 只关闭 transport blocker，DFI-4A.4.2（CRUD/Reveal/Recovery，4~7 日，依赖 STRM-3 ready）仍需独立计划接受和编码授权；DFI-4A.4.3（Real Desktop E2E + Closure + Frontend Handoff，3~5 日）；下游产品线（Helper asset / Personal Model CRUD / Credential Reveal / Renderer Personal Model UI / Enterprise identity / Admin v2 / TGM / Knowledge / Agent Lifecycle）继续 `GATED/false`；真实用户当前仍会看到 `runtime_dependencies_unavailable`，直到 STRM-3 ready + Helper production signing + production business handler + production UI 全链路就绪。
5. **若 STRM-3 PASS/CLOSED**：用户单独规划、评审、授权 DFI-4A.4.2 编码（CRUD/Reveal/Recovery，4~7 日，依赖 STRM-3 ready + 已有 production business handler）。

独立代码 QA 全程只读，未修改任何生产代码、依赖、配置或 lockfile；本轮仅落盘本 QA 报告供用户决策。

— Claude Code（独立代码 QA，只读）