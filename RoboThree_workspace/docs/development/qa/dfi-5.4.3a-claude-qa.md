# DFI-5.4.3A — Claude Code 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-28-1856-implementation-0.0.0-dfi.5.4.3a` |
| 验收 | DFI-5.4.3A Local Personal Production Graph（16 项 exact graph + 唯一 production `Dfi541SubmitTurnHandler` + task-pinned release reconstruction + Personal/Invocation/Preference 三持久化 + `runtime_dependencies_unavailable` typed code） |
| 日期 | 2026-08-28 |
| 验收者 | Claude Code（独立代码 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12 (`/opt/homebrew/opt/openjdk@21`) |
| 开发版本 | Root / Core / Desktop `0.0.0-dfi.5.4.3a`；Contracts `0.0.0-dfi.5.4.2`（未修改 public schema）；Admin `0.0.0-afe.6c` |
| 上游 | DFI-5.4 / DFI-5.4.0 / DFI-5.4.1 / DFI-5.4.2 / R2D-P.1～P.3 / PRA-1～PRA-3 / R2D-4 / DFI-5.3.x 全部 `PASS/CLOSED` |
| 验收基线 | [DFI-5.4.3A 实施报告](../development/frontend/DFI-5.4.3A-LOCAL-PERSONAL-PRODUCTION-GRAPH-IMPLEMENTATION-REPORT.md) + [方案](../development/frontend/DFI-5.4.3A-LOCAL-PERSONAL-PRODUCTION-GRAPH-DEVELOPMENT-PLAN.md) 96 项 focused QA + [evidence](../../artifacts/dfi543a/evidence.json) |

---

## 一、门禁复跑结果（独立串行执行，Node 24.13.0 + JDK 21）

### 1.1 DFI-5.4.3A 专项 Harness

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `node scripts/run-dfi5.4.3a-harness.mjs` | **PASS 2 files / 9 tests**（1.65s）；evidenceDigest `sha256:321528d6af5ff7ed57ea26373f2061173e441d4df2f2bfa9457b856627a9a46a` 字面与实施报告 §4 / evidence.json 一致；独立 Node 重算 `sha256(JSON.stringify(sortJson(evidenceMaterial)))` 逐字符一致 ✅ |

### 1.2 DFI-5.4.3A semantic evidence 字段全部命中

| evidence 字段 | 实测值 | 校验方式 |
|---|---|---|
| `outcome` | `DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_CONFORMANT` | Harness 输出 |
| `qaMatrixCount` | 96 | Harness regex `QA-\d{3}` 字面去重 |
| `focusedTestFileCount` / `focusedTestCount` | 2 / 9 | `services/core/tests/dfi5.4.3a-{local-personal-production-graph,boundary}.test.ts` |
| `structuralProductionGraphEnabled` | true | Harness 字面 |
| `uniqueProductionSubmitHandlerCount` | 1 | Harness 字面（`Dfi543LocalPersonalSubmitTurnHandler` 字面 `implements Dfi541SubmitTurnHandler`） |
| `productionTaskResourceEntitlementSourceCount` | 1 | Harness 字面（R2D-P.2 production entitlement frozen） |
| `exactAdmittedPolicyCount` | 1 | Harness 字面（`provider-release-admitted-source.ts:22` OpenAI GPT-5.2 manifestId） |
| `productionPreinstalledUserReleaseCount` | 0 | Harness 字面（避免 bootstrap 预装用户 release） |
| `normalGraphFixtureFallback` | false | Harness 字面（normal graph 默认 `FailClosedModelProvider` 替代 `model.desktop-scripted`） |
| `productionCredentialRuntimeReady` | false | Harness 字面（`productionReady` getter 仅在 verified helper 时为 true） |
| `compatibilityReasonWithoutVerifiedHelper` | `runtime_dependencies_unavailable` | Harness 字面（v1alpha5 control.ts `MaxReasoningCoreFeatureV1Alpha5Schema.reasonCode` 已含此枚举值） |
| `migrationMax` | 26 | Harness 实算 `migrations.ts` id max = 26（独立 grep 末项 = 26） |
| `lockfileDigest` | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | Harness 实算 `pnpm-lock.yaml` sha256（独立重算一致） |
| `versions.root` / `core` / `desktop` | `0.0.0-dfi.5.4.3a` | 5 个 package.json 实测一致 |
| `versions.contracts` | `0.0.0-dfi.5.4.2` | 实测：DFI-5.4.3A 未 bump public schema ✅ |
| `versions.admin` | `0.0.0-afe.6c` | 实测：Admin 保持自身冻结版本 ✅ |
| `historicalEvidence.dfi541` | `sha256:165d1544…9735ed4` | 字面不变 |
| `historicalEvidence.dfi542` | `sha256:e0abc2a0…5a8d8` | 字面不变 |
| `historicalEvidence.r2dp2` | `sha256:796f268f…8abf` | 字面不变 |
| `historicalEvidence.r2dp3` | `sha256:7d85a493…678bb` | 字面不变 |
| `historicalEvidence.pra3` | `sha256:ef0fb7a5…21e2b` | 字面不变 |
| `historicalEvidence.dfi534` | `sha256:bf89b2fd…3a08` | 字面不变 |
| `enterpriseGatewayProductionRouteReady` / `deepSeekAdmitted` / `tgmReady` / `knowledgeProviderReady` / `agentLifecycleReady` / `adminV2Ready` | 6 项全 false | Harness 字面 |
| `evidenceDigest` | `sha256:321528d6af5ff7ed57ea26373f2061173e441d4df2f2bfa9457b856627a9a46a` | Harness `sha256(JSON.stringify(sortJson(evidenceMaterial)))`；独立重算逐字符一致 |

### 1.3 Historical Harness（只读回归）

| # | 门禁 | 结果 |
|---|---|---|
| 2 | `pnpm run harness:dfi5.4.1` | **PASS 5 files / 37 tests**；evidenceDigest `sha256:165d1544…9735ed4` 逐字一致；19 项语义字段全不变 ✅ |
| 3 | `pnpm run harness:dfi5.4.2` | **不重跑**（详见 §1.5.1）—— DFI-5.4.2 harness 是 DFI-5.4.2 时点快照，含 3 个硬编码期望（`contracts===root`、`desktop===root`、`rendererV1Alpha5ConsumerCount===0`），均被后续合法演进打破（contracts 停 `0.0.0-dfi.5.4.2`、DFI-5.4.3 已实现 renderer v1alpha5 adapter）；DFI-5.4.3A 正确校验方式是通过 `historicalEvidence.dfi542` digest 不漂移（DFI-5.4.3A harness 已做），不重新跑 `harness:dfi5.4.2` |
| 4 | `pnpm run harness:r2dp3` | **PASS 8 files / 22 tests**；evidenceDigest `sha256:7d85a493…678bb` 逐字一致；realElectronMain / productionPreloadApiV1Alpha4 / realMainIpc / realCoreChild / realSqliteFile = true；sandbox / contextIsolation / nodeIntegrationDisabled = true ✅ |
| 5 | `pnpm run harness:r2dp2` | **PASS 5 files / 48 tests**；evidenceDigest `sha256:796f268f…8abf` 逐字一致；productionR2dConsumptionEnabled=false / subjectProofSingleUse=true / localAuthorityKind=local_desktop_owner / r2dp3Unlocked=false / dfi541Unlocked=false ✅ |
| 6 | `pnpm run harness:pra3` | **PASS 6 files / 22 tests**；evidenceDigest `sha256:ef0fb7a5…21e2b` 逐字一致；codeOwnedAdmittedPolicyCount=1 / productionMaterializerCanAdmitExactSubject=true / productionBootstrapInstalledSubjectReleaseCount=0 / productionSubmitTurnMaxReachable=false / desktopMaxUiReady=false ✅ |
| 7 | `pnpm run harness:dfi5.3.4` | **PASS 19 TS files / 159 tests + 7 Java classes / 14 tests**（with JDK 21）；evidenceDigest `sha256:bf89b2fd…3a08` 逐字一致；parentQaMatrixCount=120 / 父方案 120 项 ledger 全部 pass / `localPersonalPathConformant=true` / `enterpriseOpenAiPathConformant=true` / `enterpriseAnthropicPathConformant=true` ✅ |
| 8 | `pnpm run harness:r2d4` | **vitest 18 files / 179 tests PASS；harness 语义校验 FAIL**（详见 §1.5.2）—— 显式 Node v24.13.0 后 `enableDefensive` 环境伪失败已解决（vitest tests 全 PASS）；剩余 `productionEntitlementImplementationCount !== 0` 是 R2D-P.2 之后 harness 期望值未同步的合法演进事实，与 DFI-5.4.3A 实施无因果 |

### 1.4 Workspace 回归

| # | 门禁 | 结果 |
|---|---|---|
| 9 | `pnpm run check:central`（JDK 21） | **PASS BUILD SUCCESS**（3:33 min；与 DFI-5.4.3A 实施报告 §6 第10行声明 "Central online 仅 436/438" 的 CGF-2B3.2 双节点 timing 偶发本次复跑未触发，属于偶发问题） |
| 10 | `pnpm run check:central:offline`（JDK 21） | **PASS BUILD SUCCESS**（3:29 min） |
| 11 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true + sidecarContractVersion=v1alpha2 + hasRuntimeStatus/DesktopEvents/RobotCatalog/ToolCatalog/WorkspaceBrowser/WorkspaceReveal + Architecture boundary；actual exit code = 0） |
| 12 | `pnpm run lint` / `pnpm run typecheck` / `pnpm run audit:dtp4` | **PASS**（eslint + Architecture boundary / tsc -b / DTP-4 packaging audit） |
| 13 | 基线 | lockfile `sha256:5b15ae01…874f31`（DFI-5.4.3A harness 读取并写入 evidence）；migration max=26（DFI-5.4.3A harness 实算） |

### 1.5 两个历史 harness 非 PASS 诊断（**均不归因 DFI-5.4.3A 实施，均不建立 repair 批次**）

#### §1.5.1 `harness:dfi5.4.2` 不重跑（DFI-5.4.2 时点快照 harness）

- **结论**：`harness:dfi5.4.2` 是 DFI-5.4.2 时点快照 harness，其硬编码期望反映了 DFI-5.4.2 闭锁时点的事实，**不重跑**。
- **3 个硬编码期望均已因后续合法演进而不再成立**：
  1. `versions.contracts !== versions.root`（`scripts/run-dfi5.4.2-harness.mjs:49`）：当前 contracts 停 `0.0.0-dfi.5.4.2`、root 已 `0.0.0-dfi.5.4.3a`——contracts 不随 desktop 批 bump 是方案 §15.1 字面允许的合法策略（public schema 未修改）；
  2. `versions.desktop !== versions.root`（`:50`）：当前 desktop 已 `0.0.0-dfi.5.4.3a`；
  3. `rendererV1Alpha5ConsumerCount !== 0`（`:57`）：DFI-5.4.3 partial 已实现 `apps/desktop/src/renderer/adapters/reasoning-mode-adapter.ts` + `apps/desktop/src/renderer/adapters/workbench-adapter.ts` + `apps/desktop/src/renderer/pages/workbench/WorkbenchCreatePage.vue`，3 个文件合法引用 v1alpha5。
- **正确校验方式**：DFI-5.4.3A **只**校验 DFI-5.4.2 historical evidence digest 未漂移——DFI-5.4.3A harness 的 `historicalEvidence.dfi542` 字段已读 `artifacts/dfi542/evidence.json` 内层 digest = `sha256:e0abc2a0…5a8d8` 并断言不漂移 ✅；由 DFI-5.4.3A 自身 harness 验证当前边界（`normalGraphFixtureFallback=false`、`productionCredentialRuntimeReady=false`、`compatibilityReasonWithoutVerifiedHelper=runtime_dependencies_unavailable` 等 23 字段）。
- **撤销原建议**：**不再建议** bump `run-dfi5.4.2-harness.mjs` 版本字面——该 harness 还有 `contracts===root` 与 `renderer consumer=0` 两个时点快照断言，简单 bump 版本字面无法使其合法通过，且会破坏"历史 harness 语义只读"原则。DFI-5.4.2 Evidence 与历史 harness 语义保持只读、不覆盖。

#### §1.5.2 `harness:r2d4` 聚焦复跑（显式 Node v24.13.0）—— 环境伪失败已解决 + 剩余合法演进事实

**聚焦复跑结果（显式 Node v24.13.0 PATH）**：

| 层 | Node 版本 | 证据 |
|---|---|---|
| 父进程 node | **v24.13.0** | `node --version` |
| pnpm | 11.11.0 | `pnpm --version` |
| pnpm exec node | **v24.13.0** | `pnpm exec node --version` |
| Vitest worker node | **v24.13.0**（继承 PATH） | `node:sqlite` 的 `enableDefensive` 在 v24.13.0 下 = `function`；在默认 PATH 的 v22.22.1 下 = `undefined` |

- **根因一（环境伪失败，已解决）**：`enableDefensive` 是 `node:sqlite` 在 Node v24 才引入的 `DatabaseSync` 方法；本机默认 PATH 的 node 是 **v22.22.1**（`enableDefensive` = `undefined`），项目 `.node-version` 要求 **v24.13.0**（`enableDefensive` = `function`）。显式设置 v24.13.0 PATH 后完整复跑 `harness:r2d4`，**vitest 18 files / 179 tests 全 PASS**（不再有 `enableDefensive is not a function` 错误）——环境伪失败已解决 ✅。
- **根因二（合法演进事实，非环境、非 DFI-5.4.3A）**：vitest tests 全 PASS 后，harness 语义校验 `validateFocusedEvidence` 仍 FAIL `r2d4_focused_evidence_invalid`——精确定位到 `scripts/run-r2d4-harness.mjs:158` 硬编码 `boundary.productionEntitlementImplementationCount !== 0`；而 `r2d4-boundary.test.ts:57` 写 `productionEntitlementImplementationCount = implementations.length`（当前 = 1，因 R2D-P.2 后 `local-desktop-r2d-production.ts implements TaskResourceEntitlementSource`）；该字段在 R2D-4 闭锁时点为 0，R2D-P.2 后合法演进为 1，r2d4 harness 期望值未同步。
- **与 DFI-5.4.3A 因果关系**：**不归因**。DFI-5.4.3A 实施未新增 `TaskResourceEntitlementSource` 实现（当前仍只有 `local-desktop-r2d-production.ts` 一个），未修改 `run-r2d4-harness.mjs` 或 `r2d4-boundary.test.ts`，未触碰 R2D-4 evidence schema（`fa571872…0007b` 文件不变）。
- **建议处理**：R2D-4 closure 时点的 harness 闭锁由 DFI-5.3.x 时代 `PASS/CLOSED` + evidenceDigest `fa571872…0007b` 字面不变承担；DFI-5.4.3A 不开此项、不建立 repair 批次、不覆盖历史 Evidence；后续若需重新复跑 `harness:r2d4`，由用户单独授权同步 r2d4 harness 的时点快照期望后再复跑。

---

## 二、关键 evidence（独立对照生产代码）

| 验证维度 | 命中位置 |
|---|---|
| 16 项 exact graph flag | `services/core/src/application/dfi543a-local-personal-production-graph.ts:3` `DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_ENABLED = true as const` |
| 唯一 production handler | `dfi543a-local-personal-submit-turn-handler.ts:36-37` `export class Dfi543LocalPersonalSubmitTurnHandler implements Dfi541SubmitTurnHandler` + bootstrap `:617` `new Dfi543LocalPersonalSubmitTurnHandler({...})` |
| Exact admission input source | `dfi543a-local-personal-release.ts:105` `export class LocalPersonalDfi541AdmissionInputSource` + bootstrap `:399` `new LocalPersonalDfi541AdmissionInputSource({...})` |
| Task-pinned release reconstructor | `dfi543a-local-personal-release.ts:181` `export class TaskPinnedReasoningReleaseResolver` + `:198` `public async reconstructForExecution(input)` + bootstrap `:470` `new TaskPinnedReasoningReleaseResolver({...})` |
| `reconstructForExecution` materialized release | `dfi543a-local-personal-release.ts:235` `const materialized = this.#materializer.reconstructForExecution({...})` |
| `exact-subject-provider-release-materializer.ts:255` `public reconstructForExecution(...)` | 字面存在 |
| Personal/Invocation/Preference 三 SQLite adapter bootstrap 接缝 | `create-desktop-private-runtime.ts:43/45/47/246/250/255` `SqlitePersonalModelPersistence` + `SqliteLocalPersonalModelInvocationPersistence` + `SqliteDesktopReasoningModePreferencePersistence` |
| `runtime_dependencies_unavailable` typed code (v1alpha5 control.ts enum) | `packages/contracts/src/desktop-local/v1alpha5/control.ts:23` `MaxReasoningCoreFeatureV1Alpha5Schema.reasonCode` 字面 |
| `runtime_dependencies_unavailable` typed code (v1alpha4 control.ts enum) | `packages/contracts/src/desktop-local/v1alpha4/control.ts:26` 字面 |
| `runtime_dependencies_unavailable` Core facade 字面返回 | `services/core/src/application/desktop-application-facade.ts:510` 字面 |
| `runtime_dependencies_unavailable` Core throw 字面 | `create-desktop-private-runtime.ts:710` `throw new Error("reasoning.runtime_dependencies_unavailable")` + `task-locked-model-provider-resolution.ts:118` `throw new Error("provider_release.runtime_dependencies_unavailable")` |
| `runtime_dependencies_unavailable` Renderer projection | `apps/desktop/src/renderer/adapters/reasoning-mode-adapter.ts:17/57/63` 字面 reasonCode + unavailable state |
| normal graph 默认 Provider = `FailClosedModelProvider` | `create-desktop-private-runtime.ts:87/388` `: new FailClosedModelProvider()` 替代 `model.desktop-scripted` |
| Scripted fixture 仅在显式 `legacy_test` 注册 | `create-desktop-private-runtime.ts:213` `demoMode?: "dcf2c" | "legacy_test"` + `:216/217` 字面判断 |
| `agent.general` 唯一 production Agent | `services/core/src/application/built-in-general-agent-source.ts` frozen code-owned v1alpha2 exact material |
| `LocalDesktopSubjectAuthorityV1` frozen 三 production flag | DFI-5.4.1/5.4.2 frozen 字面 |
| R2D-P.2 production entitlement | `local-desktop-r2d-production.ts:75` `R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED = false as const` |
| PRA-3 OpenAI GPT-5.2 code-owned admitted policy | `provider-release-admitted-source.ts:22` `manifestId: "provider-release.manifest.openai-gpt-5-2-2025-12-11"` 字面 |
| DFI-5.4.1 frozen composition helper | `dfi541-max-core-cutover.ts:6-7` 字面 `false/0` |
| DFI-5.4.2 frozen six routes/IPC/Preload | `core-private-http-server.ts:25-30` + `foundation-api.ts:154-159` + `RoboThreeDesktopApiV1Alpha5` 6 methods |
| DFI-5.3 `ReleasePinnedReasoningMappingRegistry` frozen | `release-pinned-reasoning-mapping-registry.ts:24` |
| 5 版本实测 | root/core/desktop = `0.0.0-dfi.5.4.3a` + contracts = `0.0.0-dfi.5.4.2` + admin = `0.0.0-afe.6c` |
| lockfile digest | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`（独立 sha256sum 一致） |
| migration max=26 | `migrations.ts` 末项 `id: 26`（与 harness 字面断言一致） |
| Public Contract 未修改 | `git diff --stat HEAD -- 'packages/contracts/src/desktop-local/v1alpha{4,5}/*'` = 0 行（contracts 版本保持 `0.0.0-dfi.5.4.2`） |
| downstream GATED 未触碰 | 6 个 readiness flag（enterpriseGatewayProductionRouteReady / deepSeekAdmitted / tgmReady / knowledgeProviderReady / agentLifecycleReady / adminV2Ready）字面 false |
| evidenceDigest 独立重算 | `sha256(JSON.stringify(sortJson(evidenceMaterial)))` = `sha256:321528d6af5ff7ed57ea26373f2061173e441d4df2f2bfa9457b856627a9a46a` 逐字符一致 |

---

## 三、发现

### 3.1 P0 = 0

无。DFI-5.4.3A 实施完成 16 项 exact graph + 唯一 production `Dfi543LocalPersonalSubmitTurnHandler` + `LocalPersonalDfi541AdmissionInputSource` + `TaskPinnedReasoningReleaseResolver.reconstructForExecution()` + Personal/Invocation/Preference 三 SQLite adapter 真实接入 bootstrap + normal graph 默认 `FailClosedModelProvider`（无 scripted fallback）+ `runtime_dependencies_unavailable` typed code 全链路落地 + migration 26 不变 + lockfile digest 不变 + public Contract 不修改 + 6 个 downstream readiness false + 6 个 historical evidence digest 不漂移 + 中央离线/在线 438/438 BUILD SUCCESS + root check 318+ smoke + lint / typecheck / audit:dtp4 PASS — 全部独立只读可证，独立 harness 复算 evidenceDigest `sha256:321528d6af5ff7ed57ea26373f2061173e441d4df2f2bfa9457b856627a9a46a` 逐字符一致。

### 3.2 P1 = 0

无。DFI-5.4.1 / R2D-P.2 / R2D-P.3 / PRA-3 / DFI-5.3.4 historical harness 全部 PASS + evidenceDigest 逐字一致；migration 仍止 26；lockfile `5b15ae01…874f31` 不变；DFI-5.4.3 父批仍 paused（既定时点）；DFI-4A.4 CRUD/Reveal / Admin v2 / Enterprise Gateway / DeepSeek / TGM / Knowledge Provider / Agent Lifecycle 继续 `GATED`。

### 3.3 P2 = 0

无。两个历史 harness 的非 PASS 均不构成 DFI-5.4.3A 缺陷：

- **`harness:dfi5.4.2`**：DFI-5.4.2 时点快照 harness 的 3 个硬编码期望（contracts===root、desktop===root、renderer consumer=0）均被后续合法演进打破；DFI-5.4.3A 正确通过 `historicalEvidence.dfi542` digest 不漂移（`sha256:e0abc2a0…5a8d8`）校验历史闭锁时点，由自身 harness 验证当前边界，不重跑时点快照 harness。
- **`harness:r2d4`**：显式 Node v24.13.0 后 vitest 18/179 全 PASS（`enableDefensive` 环境伪失败已解决）；剩余 `productionEntitlementImplementationCount !== 0` 是 R2D-P.2 之后 harness 期望值未同步的合法演进事实（R2D-4 闭锁时点为 0，R2D-P.2 后 `local-desktop-r2d-production.ts implements TaskResourceEntitlementSource` 合法演进为 1），非 DFI-5.4.3A 引入、非环境问题。

两处均不计 DFI-5.4.3A P 级，不建立 repair 批次、不覆盖历史 Evidence。

### 3.4 P3 = 1（**实施报告自我声明的环境 P3，本次复跑未复现**）

#### P3-1：DFI-5.4.3A 实施报告 §6 第10行声明 "Central online 仅 436/438；CGF-2B3.2 两个已知双节点 timing 偶发" 在本次独立 QA 复跑中未复现

- 实施报告 §6 表第10行文字："Central online（JDK 21） | **436 / 438；CGF-2B3.2 两个已知双节点 timing 偶发，非本批代码路径**"
- 本次独立 QA 复跑结果（with JDK 21 / `/opt/homebrew/opt/openjdk@21`）：
  - `pnpm run check:central`（online）= **PASS BUILD SUCCESS**（3:33 min）
  - `pnpm run check:central:offline` = **PASS BUILD SUCCESS**（3:29 min）
- **偏差性质**：本次独立 QA 复跑 Central online/offline 均通过，与实施报告声明的 online 436/438 不一致；属于偶发问题（CGF-2B3.2 双节点 timing 已知偶发），非稳定回归
- **建议处理**：记录为已观察偶发，与实施报告 §6 字面对齐；不影响 DFI-5.4.3A 实施、QA、evidence 结论
- **不归因产品代码**：DFI-5.4.3A 实施报告 §6 已声明"DFI-5.4.3A 未修改 Central Java source graph"；本次复跑 Central 438/438 BUILD SUCCESS 字面证据证实

### 3.5 其他非问题观察（仅记录，不计 P 级）

1. **DFI-5.4.3 父批仍 paused**——实施报告 §7 声明"DFI-5.4.3父批仍需在本子批独立 QA和用户接受后恢复，完成真实 Desktop E2E 与 DFI-5阶段 closure"——DFI-5.4.3A 关闭**不**自动解锁 DFI-5.4.3 父批或 DFI-5 全线 ✅。
2. **`runtime_dependencies_unavailable` 字符串在 v1alpha5 control.ts 是 DFI-5.4.1 frozen 时定义**——DFI-5.4.3A 实施期内只是把 Core facade 的真实失败原因映射到这个已有 typed code，没有修改 public Contract；`packages/contracts/src/desktop-local/v1alpha5/control.ts` 与 v1alpha4 control.ts 字面一致。
3. **2 个测试文件 + 2 files / 9 tests**——DFI-5.4.3A harness focused test set 较小（仅覆盖 16 项 exact graph 关键不变量 + boundary），与 DFI-5.4.2 harness 的 21 tests + DFI-5.4.1 harness 的 37 tests 相比，**reflect 真实场景**：DFI-5.4.3A 是单一产品收口批而非新增功能维度，2 files / 9 tests 与 16 graph items + 9 typed code 接入点对应；不构成"覆盖不足"。
4. **`productionCredentialRuntimeReady: false`**——这是诚实事实；用户真实使用当前仍会看到 `runtime_dependencies_unavailable`，直到 DFI-4A.4 helper packaging 完成；DFI-5.4.3A 不伪造 ready ✅。
5. **`scripts/run-dfi5.4.3a-harness.mjs` 字面差异**——与 DFI-5.4.1 / DFI-5.4.2 harness 风格略有差异：DFI-5.4.3A harness 不强制 lockfile digest 等于固定期望值（只读取并写入 evidence），不强制 `productionMaxFeatureAvailable` 字面；evidence schema 23 字段（DFI-5.4.1/5.4.2 是 27/24 字段）；是设计差异而非遗漏。

---

## 四、核心结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（实施报告自声明 Central online 偶发，本次复跑未复现）
```

DFI-5.4.3A 完成 Local Personal Production Graph additive 接入：16 项 exact graph（`SqlitePersonalModelPersistence` + `SqliteLocalPersonalModelInvocationPersistence` + `SqliteDesktopReasoningModePreferencePersistence` + `PersonalCredentialStore` + Local Desktop subject authority + R2D-P.2 production entitlement + PRA-3 admitted policy source + immutable conformance manifest + exact subject admission input source + exact subject-bound materializer + task-pinned release reconstructor + release-pinned mapping registry + ReasoningModeLockPlannerV1Alpha2 + **唯一** `Dfi543LocalPersonalSubmitTurnHandler` + task-locked Local Personal Provider resolver + Preview/Preference/v1alpha5 API/Task Reasoning projection）→ `LocalPersonalDfi541AdmissionInputSource` 8 步首次接受顺序（exact owner / config identity / immutable definition / head+status / Credential observation metadata-only / Personal Model provider profile / PRA-3 policy/manifest / materializer / admission evidence & lock refs）→ `TaskPinnedReasoningReleaseResolver.reconstructForExecution()` 只用 durable lock/definition/policy/manifest 重算 release，禁止读取 current head/preference/profile pointer；normal graph 默认 `FailClosedModelProvider` 替代 `model.desktop-scripted`；scripted Agent/Model 仅在显式 `legacy_test` mode 注册；production bootstrap 不预装用户 release，release 只在 exact Personal Model subject 首次 SubmitTurn 即时物化；缺 verified Credential helper 或合法 Personal Model 时，Max Compatibility 诚实返回 `runtime_dependencies_unavailable`（v1alpha5 control.ts reasonCode enum 已含此字面值，DFI-5.4.1 frozen 时定义）。

门禁独立复跑：DFI-5.4.3A harness 2/9 + evidenceDigest `sha256:321528d6af5ff7ed57ea26373f2061173e441d4df2f2bfa9457b856627a9a46a` 字面一致（独立 Node 重算逐字符一致）；DFI-5.4.1（37 tests + evidence `165d1544…9735ed4`）+ R2D-P.2（48 tests + evidence `796f268f…8abf`）+ R2D-P.3（22 tests + 真实 Electron Main/IPC/Core/SQLite + sandbox + contextIsolation + nodeIntegrationDisabled + evidence `7d85a493…678bb`）+ PRA-3（22 tests + codeOwnedAdmittedPolicyCount=1 + productionSubmitTurnMaxReachable=false + evidence `ef0fb7a5…21e2b`）+ DFI-5.3.4（19 TS files / 159 tests + 7 Java / 14 + parentQaMatrixCount=120 + 父方案 120 项 ledger 全部 pass + localPersonalPathConformant + enterpriseOpenAi/AnthropicPathConformant + evidence `bf89b2fd…3a08`）5 个 historical harness PASS + 6 个 historical evidence digest 字面不变；`harness:dfi5.4.2` 不重跑（DFI-5.4.2 时点快照，3 个硬编码期望被合法演进打破，DFI-5.4.3A 通过 `historicalEvidence.dfi542` digest 不漂移校验）；`harness:r2d4` 显式 v24.13.0 后 vitest 18/179 全 PASS（`enableDefensive` 环境伪失败已解决，剩余 `productionEntitlementImplementationCount` 为 R2D-P.2 后 harness 期望未同步的合法演进事实）；两处均不计 DFI-5.4.3A P 级；Central online/offline（JDK 21）均 438/438 BUILD SUCCESS（本次复跑实施报告 §6 自声明的 Central online 偶发未复现）；`pnpm run check` core.ready + 3 smoke + Architecture boundary actual exit code = 0；lint / typecheck / audit:dtp4 PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、5 版本 root/core/desktop=`0.0.0-dfi.5.4.3a` + contracts=`0.0.0-dfi.5.4.2`（public schema 未修改）+ admin=`0.0.0-afe.6c` 字面一致；6 个 downstream readiness false 字面（enterpriseGatewayProductionRouteReady/deepSeekAdmitted/tgmReady/knowledgeProviderReady/agentLifecycleReady/adminV2Ready）；6 个 historical evidence digest 字面不变；evidenceDigest 独立重算逐字符一致。

---

## 五、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 1（实施报告自声明 Central online 偶发，本次复跑未复现）。
2. **两个历史 harness 非 PASS 已准确降级为非缺陷**：`harness:dfi5.4.2`（DFI-5.4.2 时点快照，3 个硬编码期望被合法演进打破，DFI-5.4.3A 通过 `historicalEvidence.dfi542` digest 不漂移校验，不重跑）+ `harness:r2d4`（显式 v24.13.0 后 vitest 18/179 全 PASS，`enableDefensive` 环境伪失败已解决；剩余 `productionEntitlementImplementationCount` 为 R2D-P.2 后 harness 期望未同步的合法演进事实）——均不建立 repair 批次、不覆盖历史 Evidence、不修改历史 harness 或产品代码。
3. **决策 1**：DFI-5.4.3A 是否 `PASS/CLOSED`（推荐 PASS/CLOSED：实施完整 + DFI-5.4.3A harness PASS + 5 个历史 harness PASS + Central online/offline PASS + root check PASS + 8 production boundary false/0 + public Contract 未修改 + 6 个 downstream readiness false）。
4. **后续路径**：DFI-5.4.3A 接受后**不自动解锁 DFI-5.4.3 父批或 DFI-5 全线**；期间 DFI-5.4.3 父批仍 paused，DFI-4A.4 public CRUD/Reveal / TGM / Knowledge Provider / Agent Lifecycle / Admin v2 / Enterprise Gateway / DeepSeek 继续 `GATED`；真实用户当前仍会看到 `runtime_dependencies_unavailable`，直到 DFI-4A.4 helper packaging 完成。
5. **若 DFI-5.4.3A PASS/CLOSED**：用户单独规划、评审、授权 DFI-5.4.3 父批恢复（真实 Desktop E2E 与 DFI-5 阶段 closure）。

独立代码 QA 全程只读，未修改任何生产代码、依赖、配置或 lockfile；本轮仅落盘本 QA 报告供用户决策。

— Claude Code（独立代码 QA，只读）