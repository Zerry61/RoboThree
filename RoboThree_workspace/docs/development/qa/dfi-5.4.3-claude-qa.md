# DFI-5.4.3 — Claude Code 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-28-2036-implementation-0.0.0-dfi.5.4.3` |
| 验收 | DFI-5.4.3 Renderer Max UI / Safe Preview / Real Desktop E2E / Stage Closure（Renderer Max 选择 + Safe Preview + Preference CAS + SubmitTurn uncertain 恢复 + Task Reasoning 只读投影 + Local Personal exact subject Max 链 + 真实 Electron E2E + SIGKILL/recovery + 父方案 108 项 ledger + focused 120 项 + 80 leak + 资源归零） |
| 日期 | 2026-08-28 |
| 验收者 | Claude Code（独立代码 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（`/opt/homebrew/opt/openjdk@21`） |
| 开发版本 | Root / Core / Contracts / Desktop `0.0.0-dfi.5.4.3`；Admin `0.0.0-afe.6c`（独立前端线，不跟随 desktop 批 bump） |
| 上游 | DFI-5.4 / DFI-5.4.0 / DFI-5.4.1 / DFI-5.4.2 / DFI-5.4.3A / R2D-P.1～P.3 / PRA-1～PRA-3 / R2D-4 / DFI-5.3.x 全部 `PASS/CLOSED` |
| 验收基线 | [DFI-5.4.3 实施报告](../development/frontend/DFI-5.4.3-RENDERER-MAX-UI-REAL-DESKTOP-E2E-STAGE-CLOSURE-IMPLEMENTATION-REPORT.md) + [方案](../development/frontend/DFI-5.4.3-RENDERER-MAX-UI-REAL-DESKTOP-E2E-STAGE-CLOSURE-DEVELOPMENT-PLAN.md) + [evidence](../../artifacts/dfi543/evidence.json) |

---

## 一、门禁复跑结果（独立串行执行，Node 24.13.0 + JDK 21）

### 1.1 DFI-5.4.3 专项 Harness

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:dfi5.4.3` | **PASS 9 files / 52 tests + 3 fresh Electron E2E**（含 3 SIGKILL 真实进程 + SQLite 原文件 reopen + 重放）；evidenceDigest `sha256:8293bf35a3f7d5b1f03c0e5f9b633f1e0abb2d2afe5932b4a51022e049fe36b0` 字面与实施报告 §4 / evidence.json 一致；独立 Node 重算 `sha256(JSON.stringify(sortJson(material)))` 逐字符一致 ✅ |

### 1.2 DFI-5.4.3 semantic evidence 字段全部命中

| evidence 字段 | 实测值 | 校验方式 |
|---|---|---|
| `outcome` | `DFI5_MAX_REASONING_MODE_CONFORMANT` | Harness 输出 |
| `focusedQaMatrixCount` | 120 | Harness regex `QA-\d{3}` 字面去重（独立 Node 复算 = 120） |
| `parentQaMatrixCount` | 108 | Harness 读父方案 `DFI-5.4-...-PLAN.md` 字面去重（独立 Node 复算 = 108） |
| `parentQaLedgerStatus` | `executed_at_dfi54_stage_closure` | Harness 字面 |
| `parentQaLedger` | 108 项全部 `pass`（18 dfi541 + 6 pra3 + 12 dfi534 + 3 dfi541 maxCoreGate + 18 r2dp3 + 18 dfi542 desktopSafeApi + 18 current rendererFocused + 20 current realElectronLifecycle） | Harness 字面；独立 grep 验证全部 `pass` |
| `focusedQaLedger` | 120 项（QA-001~QA-100 = focused-vitest，QA-101~QA-120 = real-electron-e2e） | Harness 字面 |
| `focusedTestFileCount` / `focusedTestCount` | 9 / 52 | 9 个 focused test files（`dfi5.4.3-task-reasoning-contracts` + `dfi5.4.1-durable-cutover` + `dfi5.4.3-local-reasoning-runtime` + `dfi5.4.3-task-reasoning-projection` + `dfi5.4.3a-local-personal-production-graph` + `desktop-v1alpha5-ipc-router` + `reasoning-mode-adapter` + `workbench-create-page` + `tasks-list-page`） |
| `realElectronE2EPass` | true | Harness 字面（3 轮 fresh Electron + SIGKILL + SQLite reopen + 重放全部 PASS） |
| `semanticReplayCount` / `uniqueSemanticReplayDigestCount` | 3 / 1 | Harness 字面（3 轮 fresh-process replay 产生同一 semantic digest） |
| `semanticReplayDigest` | `sha256:4676f278ed27b9c914c6859d6429719da7b8337e5fb32415572981e23d6ad47a` | Harness 字面 |
| `realSigkillCount` / `namedCrashBarrierCount` | 3 / 1 | Harness 字面（`namedCrashBarrier = "provider_response_committed_before_task_summary_read"`） |
| `rendererV1Alpha5ConsumerCount` | 3 | Harness 字面（`reasoning-mode-adapter.ts` + `workbench-adapter.ts` + `WorkbenchCreatePage.vue`） |
| `taskReasoningProjectionReady` | true | Harness 字面 |
| `productionLocalSubjectPathAvailable` | true | Harness 字面 |
| `negativeLeakInjectionDetectionCount` | 80 | 5 canary × 4 encoding × 4 channel = 80（独立 Node `proveLeakScanner` 重算 = 80） |
| `normalFourChannelLeakCount` | 0 | Harness 字面 |
| `resourceCounts` | 9 类资源全 = 0（electronProcess / browserWindow / webContents / ipcHandler / coreChild / tlsServer / listeningPort / temporaryDirectory / keychain） | Harness 字面 |
| `historicalEvidence.dfi541` | `sha256:165d1544…9735ed4` + fileSha256 | Harness 双层校验；字面不变 |
| `historicalEvidence.dfi542` | `sha256:e0abc2a0…5a8d8` + fileSha256 | 字面不变 |
| `historicalEvidence.dfi534` | `sha256:bf89b2fd…3a08` + fileSha256 | 字面不变 |
| `historicalEvidence.r2dp3` | `sha256:7d85a493…678bb` + fileSha256 | 字面不变 |
| `historicalEvidence.pra3` | `sha256:ef0fb7a5…21e2b` + fileSha256 | 字面不变 |
| `historicalEvidence.r2d4` | `sha256:fa571872…0007b` + fileSha256 | 字面不变（DFI-5.4.3 harness 强制 r2d4 校验，区别于 DFI-5.4.1/5.4.2 harness） |
| `migrationMax` | 26 | Harness 实算 `migrations.ts` id max = 26（独立 grep 末项 = 26） |
| `lockfileDigest` | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | Harness 实算 `pnpm-lock.yaml` sha256（独立 sha256sum 一致） |
| `versions.root` / `core` / `contracts` / `desktop` | `0.0.0-dfi.5.4.3` | 5 个 package.json 实测一致 |
| `versions.admin` | `0.0.0-afe.6c` | 实测：Admin 保持自身冻结版本 ✅ |
| `enterpriseGatewayProductionRouteReady` / `enterpriseMaxReleaseReady` / `deepSeekAdmitted` / `tgmReady` / `knowledgeProviderReady` / `agentLifecycleReady` / `publicCrudReady` / `adminV2Ready` | 8 项全 false | Harness 字面 |
| `evidenceDigest` | `sha256:8293bf35a3f7d5b1f03c0e5f9b633f1e0abb2d2afe5932b4a51022e049fe36b0` | Harness `sha256(JSON.stringify(sortJson(material)))`；独立重算逐字符一致 |

### 1.3 Historical Harness（只读回归）

| # | 门禁 | 结果 |
|---|---|---|
| 2 | `pnpm run harness:dfi5.4.1` | **PASS 5 files / 37 tests**；evidenceDigest `sha256:165d1544…9735ed4` 逐字一致；19 项语义字段全不变 ✅ |
| 3 | `pnpm run harness:r2dp3` | **PASS 8 files / 22 tests**；evidenceDigest `sha256:7d85a493…678bb` 逐字一致；realElectronMain / productionPreloadApiV1Alpha4 / realMainIpc / realCoreChild / realSqliteFile = true；sandbox / contextIsolation / nodeIntegrationDisabled = true ✅ |
| 4 | `pnpm run harness:pra3` | **PASS 6 files / 22 tests**；evidenceDigest `sha256:ef0fb7a5…21e2b` 逐字一致；codeOwnedAdmittedPolicyCount=1 / productionMaterializerCanAdmitExactSubject=true / productionSubmitTurnMaxReachable=false / desktopMaxUiReady=false ✅ |
| 5 | `pnpm run harness:dfi5.3.4` | **PASS 19 TS files / 159 tests + 7 Java classes / 14 tests**（with JDK 21）；evidenceDigest `sha256:bf89b2fd…3a08` 逐字一致；parentQaMatrixCount=120 / 父方案 120 项 ledger 全部 pass / localPersonalPathConformant + enterpriseOpenAi/AnthropicPathConformant = true ✅ |
| 6 | `pnpm run harness:dfi5.4.2` | **不重跑**（详见 §1.5.1）—— DFI-5.4.2 时点快照 harness，含 3 个硬编码期望（`contracts===root`、`desktop===root`、`rendererV1Alpha5ConsumerCount===0`），均被后续合法演进打破；DFI-5.4.3 正确通过 `historicalEvidence.dfi542` digest 不漂移校验（DFI-5.4.3 harness 已做） |
| 7 | `pnpm run harness:r2d4` | **vitest 18/179 全 PASS；harness 语义校验 FAIL**（详见 §1.5.2）—— 显式 Node v24.13.0 后 `enableDefensive` 环境伪失败已解决；剩余 `productionEntitlementImplementationCount !== 0` 是 R2D-P.2 之后 harness 期望未同步的合法演进事实（DFI-5.4.3A QA 报告已记录为 P2=0 既定记录） |

### 1.4 Workspace 回归

| # | 门禁 | 结果 |
|---|---|---|
| 8 | `pnpm run check:central`（JDK 21） | **PASS BUILD SUCCESS**（3:36 min） |
| 9 | `pnpm run check:central:offline`（JDK 21） | **PASS 438/0/0/0 + BUILD SUCCESS**（首次复跑出现 MojoFailureException 残留，重跑后 PASS；与实施报告 §5 表第 7-8 行 + DFI-5.4.3A QA 报告 §1.5 中央偶发记录一致） |
| 10 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true sidecarContractVersion=v1alpha2 + hasRuntimeStatus/DesktopEvents/RobotCatalog/ToolCatalog/WorkspaceBrowser/WorkspaceReveal + Architecture boundary；actual exit code = 0） |
| 11 | `pnpm run lint` / `pnpm run typecheck` / `pnpm run audit:dtp4` | **PASS**（eslint + Architecture boundary / tsc -b / DTP-4 packaging audit） |
| 12 | 基线 | lockfile `sha256:5b15ae01…874f31`（DFI-5.4.3 harness 强校验）；migration max=26（DFI-5.4.3 harness 强校验） |

### 1.5 两个历史 harness 非 PASS 诊断（**均不归因 DFI-5.4.3 实施，均不建立 repair 批次**）

#### §1.5.1 `harness:dfi5.4.2` 不重跑（DFI-5.4.2 时点快照 harness）

- **结论**：`harness:dfi5.4.2` 是 DFI-5.4.2 时点快照 harness，其硬编码期望反映了 DFI-5.4.2 闭锁时点的事实，**不重跑**。
- **3 个硬编码期望均已因后续合法演进而不再成立**：
  1. `versions.contracts !== versions.root`（`scripts/run-dfi5.4.2-harness.mjs:49`）：当前 contracts 停 `0.0.0-dfi.5.4.2`、root 已 `0.0.0-dfi.5.4.3`——contracts 不随 desktop 批 bump 是 DFI-5.4.2 文档复核报告 §3.4 P3-3 字面允许的合法策略（public schema 未修改）；
  2. `versions.desktop !== versions.root`（`:50`）：当前 desktop 已 `0.0.0-dfi.5.4.3`；
  3. `rendererV1Alpha5ConsumerCount !== 0`（`:57`）：DFI-5.4.3 已实现 3 个 renderer v1alpha5 引用文件（`reasoning-mode-adapter.ts` + `workbench-adapter.ts` + `WorkbenchCreatePage.vue`）。
- **正确校验方式**：DFI-5.4.3 **只**校验 DFI-5.4.2 historical evidence digest 未漂移——DFI-5.4.3 harness 的 `historicalEvidence.dfi542` 字段已读 `artifacts/dfi542/evidence.json` 内层 digest = `sha256:e0abc2a0…5a8d8` 并断言不漂移 ✅；由 DFI-5.4.3 自身 harness 验证当前边界（`rendererV1Alpha5ConsumerCount=3` 字面断言 + 9 类资源归零 + 6 个 downstream readiness false 字面断言）。
- **不归因产品代码**：与 DFI-5.4.3A QA 报告 §1.5.1 既定记录一致。

#### §1.5.2 `harness:r2d4` 聚焦复跑（显式 Node v24.13.0）—— 环境伪失败已解决 + 剩余合法演进事实

**聚焦复跑结果（显式 Node v24.13.0 PATH）**：

| 层 | Node 版本 | 证据 |
|---|---|---|
| 父进程 node | **v24.13.0** | `node --version` |
| pnpm | 11.11.0 | `pnpm --version` |
| pnpm exec node | **v24.13.0** | `pnpm exec node --version` |
| Vitest worker node | **v24.13.0**（继承 PATH） | `node:sqlite` 的 `enableDefensive` 在 v24.13.0 下 = `function`；在默认 PATH 的 v22.22.1 下 = `undefined` |

- **根因一（环境伪失败，已解决）**：`enableDefensive` 是 `node:sqlite` 在 Node v24 才引入的 `DatabaseSync` 方法；本机默认 PATH 的 node 是 **v22.22.1**（`enableDefensive` = `undefined`），项目 `.node-version` 要求 **v24.13.0**（`enableDefensive` = `function`）。显式设置 v24.13.0 PATH 后完整复跑 `harness:r2d4`，**vitest 18 files / 179 tests 全 PASS**（不再有 `enableDefensive is not a function` 错误）——环境伪失败已解决 ✅。
- **根因二（合法演进事实，非环境、非 DFI-5.4.3）**：vitest tests 全 PASS 后，harness 语义校验 `validateFocusedEvidence` 仍 FAIL `r2d4_focused_evidence_invalid`——精确定位到 `scripts/run-r2d4-harness.mjs:158` 硬编码 `boundary.productionEntitlementImplementationCount !== 0`；而 `r2d4-boundary.test.ts:57` 写 `productionEntitlementImplementationCount = implementations.length`（当前 = 1，因 R2D-P.2 后 `local-desktop-r2d-production.ts implements TaskResourceEntitlementSource`）；该字段在 R2D-4 闭锁时点为 0，R2D-P.2 后合法演进为 1，r2d4 harness 期望值未同步。
- **与 DFI-5.4.3 因果关系**：**不归因**。DFI-5.4.3 实施未新增 `TaskResourceEntitlementSource` 实现（当前仍只有 `local-desktop-r2d-production.ts` 一个），未修改 `run-r2d4-harness.mjs` 或 `r2d4-boundary.test.ts`，未触碰 R2D-4 evidence schema（`fa571872…0007b` 文件不变）。
- **DFI-5.4.3A QA 报告 §1.5.2 既定记录**：与前几批 QA 同类已准确降级为非缺陷，不建立 repair 批次、不覆盖历史 Evidence。

---

## 二、关键 evidence（独立对照生产代码）

| 验证维度 | 命中位置 |
|---|---|
| 6 个 DFI-5.4.3 实施关闭的跨层问题：① Renderer client 与 transport ID 分层 ② code-owned Platform Prompt ③ Task bundle readable DFI541 envelope ④ v1alpha4 不被 legacy authorization 误判 ⑤ recovery 识别 DFI541 envelope ⑥ Desktop projection + Reasoning projection 共存 | 实施报告 §2 + 实施代码 `platform-prompt-source.ts:127/138` + `r2d3-durable-acceptance-planner.ts:105/119/131/132/181/263/369` + `task-reasoning-request-materializer.ts` + `desktop-application-facade.ts:510` 字面 |
| Renderer Max 选择 + Preview latest-wins | `apps/desktop/src/renderer/adapters/reasoning-mode-adapter.ts:34/94/107/115/242/243` `#previewGeneration = 0` / `++this.#previewGeneration` / `stale = generation !== this.#previewGeneration` / `observedMaxSupport + observedMaxSupportRevision` 字面 |
| Task Reasoning read model namespace | `packages/contracts/src/desktop-local/task-reasoning/v1alpha1/index.ts` + 1 IPC channel `robothree:task-reasoning:v1alpha1:get`（`foundation-api.ts:168`）+ 1 frozen Preload method `getTaskReasoningMode`（`create-desktop-api.ts:257-259`）|
| Local Personal exact subject Max 链接入 normal graph | `create-desktop-private-runtime.ts:113/220/229/641` `Dfi543LocalPersonalSubmitTurnHandler` + `demoMode?: "dcf2c" | "legacy_test"` + `legacyTestMode = input.demoMode === "legacy_test"` + `? new Dfi543LocalPersonalSubmitTurnHandler({...})` 字面 |
| normal graph 默认 `FailClosedModelProvider`（无 scripted fallback） | `create-desktop-private-runtime.ts:93/404` `: new FailClosedModelProvider()` 字面 |
| 9 个 focused test files | `packages/contracts/tests/dfi5.4.3-task-reasoning-contracts.test.ts` + `services/core/tests/dfi5.4.1-durable-cutover.test.ts` + `dfi5.4.3-local-reasoning-runtime.test.ts` + `dfi5.4.3-task-reasoning-projection.test.ts` + `dfi5.4.3a-local-personal-production-graph.test.ts` + `apps/desktop/tests/desktop-v1alpha5-ipc-router.test.ts` + `reasoning-mode-adapter.test.ts` + `workbench-create-page.test.ts` + `tasks-list-page.test.ts` 全部存在 |
| Renderer v1alpha5 consumer = 3 | `apps/desktop/src/renderer/adapters/reasoning-mode-adapter.ts` + `apps/desktop/src/renderer/adapters/workbench-adapter.ts` + `apps/desktop/src/renderer/pages/workbench/WorkbenchCreatePage.vue` 字面 |
| 真实 Electron E2E 拓扑 | `scripts/run-dfi5.4.3-electron.mjs` 字面 + `namedCrashBarrier = "provider_response_committed_before_task_summary_read"`（`:126`）+ `sigkillObserved: true`（`:162`） |
| 3 轮 SIGKILL + SQLite 原文件 reopen + 重放 | Harness 强校验 + 实施报告 §3 字面 |
| 父方案 108 项 ledger + focused 120 项 | evidence.json 字面（独立 grep 108 全 pass + 120 全生成） |
| 80 leak 注入 + 0 正常四通道命中 | `proveLeakScanner()` 5 canary × 4 encoding × 4 channel = 80（独立 Node 重算 = 80） |
| 9 类资源归零 | evidence.json `resourceCounts` 9 项全 = 0 |
| 6 个 historical evidence digest 双层校验（inner digest + file sha256） | Harness `verifyHistoricalEvidence` + `verifyHistoricalEvidence` 字符串字面（独立 grep evidence.json 字面一致） |
| DFI-5.4.1 frozen composition helper | `dfi541-max-core-cutover.ts:6-7` 字面 `false/0` |
| DFI-5.4.2 frozen six routes/IPC/Preload | `core-private-http-server.ts:25-30` + `foundation-api.ts:154-159` + `RoboThreeDesktopApiV1Alpha5` 6 methods |
| DFI-5.4.3A frozen Local Personal production graph + FailClosedModelProvider | `dfi543a-local-personal-{production-graph,release,submit-turn-handler}.ts` + `fail-closed-model-provider.ts` 全部存在 |
| DFI-5.3 `ReleasePinnedReasoningMappingRegistry` frozen | `release-pinned-reasoning-mapping-registry.ts:24` |
| 5 版本实测 | root/core/contracts/desktop = `0.0.0-dfi.5.4.3` + admin = `0.0.0-afe.6c` |
| lockfile digest | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`（独立 sha256sum 一致） |
| migration max=26 | `migrations.ts` 末项 `id: 26`（与 harness 字面断言一致） |
| 8 个 downstream readiness false 字面 | enterpriseGatewayProductionRouteReady / enterpriseMaxReleaseReady / deepSeekAdmitted / tgmReady / knowledgeProviderReady / agentLifecycleReady / publicCrudReady / adminV2Ready 全部 false |
| Public Contract 未修改 | `git diff --stat HEAD -- 'packages/contracts/src/desktop-local/v1alpha{4,5}/*'` = 0 行（contracts 仍 `0.0.0-dfi.5.4.3`） |
| evidenceDigest 独立重算 | `sha256(JSON.stringify(sortJson(material)))` = `sha256:8293bf35a3f7d5b1f03c0e5f9b633f1e0abb2d2afe5932b4a51022e049fe36b0` 逐字符一致 |

---

## 三、发现

### 3.1 P0 = 0

无。DFI-5.4.3 实施完成 6 个跨层问题关闭（实施报告 §2）+ Renderer Max 选择 + Safe Preview latest-wins + Preference CAS + SubmitTurn uncertain 恢复 + Task Reasoning 只读投影 + Local Personal exact subject Max 链 + 3 轮 fresh Electron E2E + 3 SIGKILL + SQLite 原文件 reopen + 重放 + 父方案 108 项 ledger 全 pass + focused 120 项 QA + 80 leak 注入 + 9 类资源归零 + migration 26 + lockfile digest 不变 + public Contract 不修改 + 6 个 historical evidence digest 双层不漂移 + 8 个 downstream readiness false + Central online/offline 438/438 BUILD SUCCESS + root check 318+ smoke + lint / typecheck / audit:dtp4 PASS — 全部独立只读可证，独立 harness 复算 evidenceDigest `sha256:8293bf35a3f7d5b1f03c0e5f9b633f1e0abb2d2afe5932b4a51022e049fe36b0` 逐字符一致。

### 3.2 P1 = 0

无。DFI-5.4.1 / R2D-P.3 / PRA-3 / DFI-5.3.4 historical harness 全部 PASS + evidenceDigest 逐字一致；migration 仍止 26；lockfile `5b15ae01…874f31` 不变；DFI-4A.4 public CRUD/Reveal / TGM / Knowledge Provider / Agent Lifecycle / Admin v2 / Enterprise Gateway / DeepSeek 继续 `GATED`。

### 3.3 P2 = 0

无。两个历史 harness 的非 PASS 均不构成 DFI-5.4.3 缺陷：

- **`harness:dfi5.4.2`**：DFI-5.4.2 时点快照 harness 的 3 个硬编码期望（contracts===root、desktop===root、renderer consumer=0）均被后续合法演进打破；DFI-5.4.3 正确通过 `historicalEvidence.dfi542` digest 不漂移（`sha256:e0abc2a0…5a8d8`）校验历史闭锁时点，由自身 harness 验证当前边界（`rendererV1Alpha5ConsumerCount=3` + 9 类资源归零 + 6 个 downstream readiness false），不重跑时点快照 harness。
- **`harness:r2d4`**：显式 Node v24.13.0 后 vitest 18/179 全 PASS（`enableDefensive` 环境伪失败已解决）；剩余 `productionEntitlementImplementationCount !== 0` 是 R2D-P.2 之后 harness 期望值未同步的合法演进事实（R2D-4 闭锁时点为 0，R2D-P.2 后 `local-desktop-r2d-production.ts implements TaskResourceEntitlementSource` 合法演进为 1），非 DFI-5.4.3 引入、非环境问题。

两处均不计 DFI-5.4.3 P 级，不建立 repair 批次、不覆盖历史 Evidence。

### 3.4 P3 = 0

无。DFI-5.4.3 实施与方案 §0 controlling clarification + §11 父方案 ledger + §12 focused 120 项 + §10 leak scanner + §16 22 项停手条件全部只读可证；本次独立 QA 复跑无额外精度偏差。

### 3.5 其他非问题观察（仅记录，不计 P 级）

1. **`centralEvidence` 与 `processEvidence` 真实双节点** —— DFI-5.3.4 harness evidence.json 含 `centralEvidence.scenarios`（2 个 restart scenarios with `providerRequestCount=1`）+ `processEvidence.scenarios`（6 个 crash scenarios across 3 provider paths）；本次独立 QA 复跑 PASS 与 DFI-5.3.4 时点一致。
2. **DFI-5.4.3 `centralEvidence` 与 `processEvidence` 字面** —— DFI-5.4.3 evidence.json 不含这两个字段（DFI-5.4.3 自身只断言 `realTlsSseProvider=true` + `realSigkillCount=3` + 9 类资源归零，不复制 DFI-5.3.4 的 scenario 级证据）；是设计差异而非遗漏。
3. **3 个 renderer v1alpha5 consumer 是 DFI-5.4.3 的字面增长** —— DFI-5.4.2 时 renderer v1alpha5 consumer = 0（时点快照），DFI-5.4.3 后 = 3（reasoning-mode-adapter + workbench-adapter + WorkbenchCreatePage）；这正是 DFI-5.4.2 harness 字面 `rendererV1Alpha5ConsumerCount !== 0` 漂移的合法演进事实，与 P2-1 同源。
4. **`harness:dfi5.4.2` 与 `harness:r2d4` 同源预期漂移已在 DFI-5.4.3A QA 报告中正式裁决为非缺陷（P2=0）** —— 本次 DFI-5.4.3 复跑再次确认该非缺陷结论适用，不需重复裁决。
5. **首次 `check:central:offline` 出现 MojoFailureException 残留，重跑后 PASS 438/0/0/0** —— 与 DFI-5.4.3A QA 报告 §3.4 P3-1 + 实施报告 §5 表第 7 行"CGF-2B3.2 双节点 timing 偶发"同类偶发，重跑后稳定 PASS 438/438。

---

## 四、核心结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.4.3 完成 Renderer Max UI / Safe Preview / Real Desktop E2E / Stage Closure additive 接入：Workbench 通过 `reasoning-mode-adapter` 协商 v1alpha5 Compatibility（`#previewGeneration` latest-wins discipline）+ 读取 Safe Preview（含 `observedMaxSupport + observedMaxSupportRevision`）+ durable Preference CAS 保存（success 才推进 persisted revision，conflict/unavailable 不回滚，uncertain 仅允许同 commandId 显式重放）+ Submit response loss 复用同一 command identity（不自动创建第二个 Task）+ Task 详情通过独立 `task-reasoning/v1alpha1` namespace（1 个 IPC channel `robothree:task-reasoning:v1alpha1:get` + 1 个 frozen Preload method `getTaskReasoningMode`）显示 final Receipt 的 `Max` / fallback 安全摘要；Local Personal exact subject Max 链 `LocalPersonalDfi541AdmissionInputSource` 8 步首次接受 + `TaskPinnedReasoningReleaseResolver.reconstructForExecution()` 只读 durable lock/definition/policy/manifest 重算 release + `Dfi543LocalPersonalSubmitTurnHandler` 唯一 production handler + normal graph 默认 `FailClosedModelProvider`（无 scripted fallback）+ scripted Agent/Model 仅在显式 `legacy_test` mode 注册；3 轮 fresh Electron E2E 通过 sandboxed Preload / contextIsolation / nodeIntegration=false / real Core child / SQLite 原文件 reopen / isolated macOS Keychain / controlled TLS/SSE OpenAI-compatible Provider 完整链路；3 次真实 SIGKILL 后新 PID + Supervisor reopen 原 SQLite + Renderer 重开 Task 后仍显示"推理模式 / Max"；3 轮 semantic digest 唯一、进程身份不同；80 次负向泄漏注入全部检出，正常四通道命中 0；Electron/Core/TLS/BrowserWindow/webContents/IPC handler/Keychain/temp directory 9 类资源归零；父方案 108 项 ledger 全部 pass（18 dfi541 maxCoreContract + 6 pra3 + 12 dfi534 providerMappingClosure + 3 dfi541 maxCoreGate + 18 r2dp3 durableDesktopCutover + 18 dfi542 desktopSafeApi + 18 current rendererFocused + 20 current realElectronLifecycle）。

门禁独立复跑：DFI-5.4.3 harness 9/52 + 3 轮 fresh Electron E2E + evidenceDigest `sha256:8293bf35a3f7d5b1f03c0e5f9b633f1e0abb2d2afe5932b4a51022e049fe36b0` 字面一致（独立 Node 重算逐字符一致）；DFI-5.4.1（37 tests + evidence `165d1544…9735ed4`）+ R2D-P.3（22 tests + 真实 Electron Main/IPC/Core/SQLite + sandbox + contextIsolation + nodeIntegrationDisabled + evidence `7d85a493…678bb`）+ PRA-3（22 tests + codeOwnedAdmittedPolicyCount=1 + productionSubmitTurnMaxReachable=false + evidence `ef0fb7a5…21e2b`）+ DFI-5.3.4（19 TS files / 159 tests + 7 Java / 14 + parentQaMatrixCount=120 + 父方案 120 项 ledger 全部 pass + localPersonalPathConformant + enterpriseOpenAi/AnthropicPathConformant + evidence `bf89b2fd…3a08`）4 个 historical harness PASS + 6 个 historical evidence digest 字面不变；`harness:dfi5.4.2` 不重跑（DFI-5.4.2 时点快照，3 个硬编码期望被合法演进打破，DFI-5.4.3 通过 `historicalEvidence.dfi542` digest 不漂移校验）；`harness:r2d4` 显式 v24.13.0 后 vitest 18/179 全 PASS（`enableDefensive` 环境伪失败已解决，剩余 `productionEntitlementImplementationCount` 为 R2D-P.2 后 harness 期望未同步的合法演进事实）；两处均不计 DFI-5.4.3 P 级；Central online/offline（JDK 21）均 438/438 BUILD SUCCESS（首次 offline 复跑出现 MojoFailureException 残留，重跑后稳定 PASS）；`pnpm run check` core.ready + 3 smoke + Architecture boundary actual exit code = 0；lint / typecheck / audit:dtp4 PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、5 版本 root/core/contracts/desktop=`0.0.0-dfi.5.4.3` + admin=`0.0.0-afe.6c`（独立前端线冻结）字面一致；8 个 downstream readiness false 字面（enterpriseGatewayProductionRouteReady/enterpriseMaxReleaseReady/deepSeekAdmitted/tgmReady/knowledgeProviderReady/agentLifecycleReady/publicCrudReady/adminV2Ready）；6 个 historical evidence digest 字面不变；evidenceDigest 独立重算逐字符一致。

---

## 五、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0。
2. **两个历史 harness 非 PASS 已准确降级为非缺陷**（与 DFI-5.4.3A QA 报告 P2=0 既定记录一致）：`harness:dfi5.4.2`（DFI-5.4.2 时点快照，3 个硬编码期望被合法演进打破，DFI-5.4.3 通过 `historicalEvidence.dfi542` digest 不漂移校验，不重跑）+ `harness:r2d4`（显式 v24.13.0 后 vitest 18/179 全 PASS，`enableDefensive` 环境伪失败已解决；剩余 `productionEntitlementImplementationCount` 为 R2D-P.2 后 harness 期望未同步的合法演进事实）——均不建立 repair 批次、不覆盖历史 Evidence、不修改历史 harness 或产品代码。
3. **决策**：DFI-5.4.3 是否 `PASS/CLOSED`（**推荐 PASS/CLOSED**：实施完整 + DFI-5.4.3 harness PASS + 4 个 historical harness PASS + Central online/offline PASS + root check PASS + 8 个 downstream readiness false + public Contract 未修改 + 6 个 historical evidence digest 不漂移）。
4. **后续路径**：DFI-5.4.3 接受后**自动解锁 DFI-5 阶段 closure**（DFI-5 父方案 108 项 ledger 已全部 pass），但**不**自动解锁 DFI-5.4 之后的下游产品线（Enterprise Gateway / Enterprise Max / DeepSeek / TGM / Knowledge Provider / Agent Lifecycle / DFI-4A.4 public CRUD/Reveal / Admin v2）继续 `GATED/false`；真实用户当前仍会看到 `runtime_dependencies_unavailable`，直到 DFI-4A.4 helper packaging 完成。
5. **DFI-5 阶段 closure**：DFI-5.4.3 `PASS/CLOSED` 标志着 DFI-5 阶段正式 closure；用户可单独规划后续产品线（按需）。

独立代码 QA 全程只读，未修改任何生产代码、依赖、配置或 lockfile；本轮仅落盘本 QA 报告供用户决策。

— Claude Code（独立代码 QA，只读）