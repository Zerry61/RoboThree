# DFI-5.4.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-28-1515-implementation-0.0.0-dfi.5.4.2` |
| 验收 | DFI-5.4.2 Desktop v1alpha5 Safe API / Restart Lease（Core 6 routes + Main 6 IPC + sandboxed Preload 6 methods + connection lease + binding registry + restart cleanup） |
| 日期 | 2026-08-28 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / **JDK 21 不可用**（`/usr/bin/java` 返回 `Unable to locate a Java Runtime`） |
| 开发版本 | Root / Core / Contracts / Desktop `0.0.0-dfi.5.4.2`；Admin `0.0.0-afe.6c` |
| 上游 | DFI-5.4 `PASS/CLOSED`；DFI-5.4.1 `INDEPENDENT_QA_PASS_WITH_P3_DOCUMENT_CORRECTIONS / PASS/CLOSED` |
| 验收基线 | [DFI-5.4.2 实施报告](../development/frontend/DFI-5.4.2-DESKTOP-SAFE-API-RESTART-LEASE-IMPLEMENTATION-REPORT.md) + [方案](../development/frontend/DFI-5.4.2-DESKTOP-SAFE-API-RESTART-LEASE-DEVELOPMENT-PLAN.md) 96 项 focused QA + [evidence](../../artifacts/dfi542/evidence.json) |

---

## 一、门禁复跑结果（独立串行执行，Node v24.13.0 + 无 JDK 21）

### 1.1 DFI-5.4.2 专项 Harness

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:dfi5.4.2` | **PASS 5 files / 21 tests**；evidenceDigest `sha256:e0abc2a0…5a8d8` 字面与实施报告 §5 / evidence.json 一致 |

### 1.2 DFI-5.4.2 semantic evidence 字段全部命中

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `DFI542_DESKTOP_SAFE_API_CUTOVER_CONFORMANT` | Harness 输出 |
| `qaMatrixCount` | 96 | Harness regex `QA-\d{3}` 字面去重 |
| `exactCoreRouteCount` | 6 | Harness regex `\/v1alpha5\/[a-z\/-]+` 去重 = 6（独立 node 重算：6） |
| `exactIpcChannelCount` | 6 | Harness regex `robothree:v1alpha5:[a-z\-]+` 去重 = 6（独立 node 重算：6） |
| `exactApiMethodCount` | 6 | `RoboThreeDesktopApiV1Alpha5` interface 6 方法字面命中 |
| `preferenceProjectionReady` | true | `ReasoningModePreferenceProjectionV1Alpha5Schema` 已落地 |
| `runtimeLeaseRevalidation` | true | `desktop-v1alpha5-ipc-router.ts` `isCurrentConnection(lease)` revalidation |
| `negativeLeakInjectionDetectionCount` | 80 | 5 canary × 4 encoding × 4 channel = 80；独立 node 重算 = 80 |
| `normalFourChannelLeakCount` | 0 | Harness 字面 |
| `productionDfi541ActivationEnabled` | false | harness + `DFI541_MAX_CORE_DEFAULT_ENABLED = false` 字面 |
| `productionR2dActivationEnabled` | false | harness + `R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED = false` 字面 |
| `productionCpcActivationEnabled` | false | harness 字面 |
| `productionEnterpriseEntitlementReady` | false | harness 字面 |
| `productionInstalledSubjectReleaseCount` | 0 | harness 字面 + `DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT = 0` |
| `productionMaxFeatureAvailable` | false | harness 字面 |
| `rendererV1Alpha5ConsumerCount` | 0 | Harness grep `robothreeDesktopV1Alpha5\|desktop-local\/v1alpha5` 全仓 Renderer = 0（独立 walk 重算 = 0） |
| `desktopMaxUiReady` | false | harness 字面 |
| `dfi543Unlocked` | false | harness 字面 |
| `historicalDfi541EvidenceDigest` | `sha256:165d1544…9735ed4` | Harness 读 inner `evidenceDigest` 字段断言；独立 JSON.parse = 字面一致 |
| `migrationMax` | 26 | Harness 实算 `migrations.ts` id max = 26（独立 grep 末项 = 26） |
| `lockfileDigest` | `sha256:5b15ae01…874f31` | Harness 实算 `pnpm-lock.yaml` sha256（独立重算一致） |
| `versions.root` | `0.0.0-dfi.5.4.2` | 5 package.json 实测一致 |
| `versions.core` | `0.0.0-dfi.5.4.2` | 同上 |
| `versions.contracts` | `0.0.0-dfi.5.4.2` | 同上 |
| `versions.desktop` | `0.0.0-dfi.5.4.2` | 同上 |
| `versions.admin` | `0.0.0-afe.6c` | 同上（**未跟随** dfi.5.4.2 bump，与文档复核 P3-3 一致） |
| `evidenceDigest` | `sha256:e0abc2a01e1192e59be9afc91fe0b701909bc794d86f82f8ef2504ecb685a8d8` | Harness `sha256(JSON.stringify(semanticEvidence))`；独立重算逐字符一致 |

### 1.3 Historical Harness（只读回归）

| # | 门禁 | 结果 |
|---|---|---|
| 2 | `pnpm run harness:dfi5.4.1` | **PASS 5 files / 37 tests**；evidenceDigest `sha256:165d1544…9735ed4` 逐字一致；19 项语义字段全不变 |
| 3 | `pnpm run harness:r2dp3` | **PASS 8 files / 22 tests**；evidenceDigest `sha256:7d85a493…678bb` 逐字一致；realElectronMain / productionPreloadApiV1Alpha4 / realMainIpc / realCoreChild / realSqliteFile = true；sandbox / contextIsolation / nodeIntegrationDisabled = true |
| 4 | `pnpm run harness:pra3` | **PASS 6 files / 22 tests**；evidenceDigest `sha256:ef0fb7a5…21e2b` 逐字一致；`productionSubmitTurnMaxReachable=false / desktopMaxUiReady=false` |
| 5 | `pnpm run harness:r2d4` | **本次独立 sandbox 未复跑到位**：用户固定 Node v24.13.0 后聚焦复跑 18 files / 179 tests PASS，`submit-turn-coordinator.integration.test.ts` 31/31 PASS，`enableDefensive / setAuthorizer` 均为原生函数，确认此前 failure 为 QA runtime / path 伪失败，不建立 repair 批次 |

### 1.4 Workspace 回归

| # | 门禁 | 结果 |
|---|---|---|
| 6 | `pnpm run check:central` | **本次独立环境未复跑**：本次 sandbox 无 JDK 21，按独立 QA 验收模式 §2 第 11/13 条不自动安装依赖；本批 Central online/offline 438/438 BUILD SUCCESS 由开发门禁在 JDK 21 环境完成（实施报告 §4 表第 7/8 行），引用为权威证据 |
| 7 | `pnpm run check:central:offline` | 同 #6，引用开发门禁证据（438/438 BUILD SUCCESS） |
| 8 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 318 files / 2143 tests + 3 smoke**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true sidecarContractVersion=v1alpha2 + hasRuntimeStatus/DesktopEvents/RobotCatalog/ToolCatalog/WorkspaceBrowser/WorkspaceReveal）+ Architecture boundary；actual exit code = 0（0 失败 test file） |
| 9 | `pnpm run lint` / `pnpm run typecheck` / `pnpm run audit:dtp4` | **PASS**（eslint + Architecture boundary / tsc -b / DTP-4 packaging audit） |
| 10 | 基线 | lockfile `sha256:5b15ae01…874f31`（harness 强校验）；migration max=26（harness 强校验） |

### 1.5 用户聚焦复核结论

用户固定 Node v24.13.0 后独立聚焦复跑：

- `services/core/tests/submit-turn-coordinator.integration.test.ts`：**31/31 PASS**；
- R2D-4 完整 focused 集合：**18 files / 179 tests PASS**；
- `enableDefensive` / `setAuthorizer` 在 Node v24.13.0 下均为原生函数（`DatabaseSync.prototype.enableDefensive` / `DatabaseSync.prototype.setAuthorizer`）；
- 使用临时 Evidence 路径复跑，**未覆盖** 历史 R2D-4 `artifacts/r2d4/evidence.json`。

结论：本批 §1.3 第 5 行 `harness:r2d4` 在本次独立 sandbox 复跑中触发的 `database.enableDefensive is not a function` **为 QA runtime / path 伪失败**（与 DFI-5.4.2 实施无因果），不建立 repair 批次。原 §3.3 P2-1 撤销为 P2 = 0；R2D-4 closure 时点的 harness 闭锁由历史 `PASS/CLOSED` + evidenceDigest `fa571872…0007b` 字面不变承担。

---

## 二、关键 evidence（只读对照）

| 验证维度 | 命中位置 |
|---|---|
| 6 v1alpha5 Core routes | `services/core/src/adapters/http/core-private-http-server.ts:25-30`（独立 set 化 = 6 routes） |
| 6 v1alpha5 IPC channels | `apps/desktop/src/shared/foundation-api.ts:154-159`（独立 set 化 = 6 channels） |
| `RoboThreeDesktopApiV1Alpha5` 6 方法 | `apps/desktop/src/shared/foundation-api.ts:208-225`（`getCompatibility / previewReasoningMode / getReasoningModePreference / updateReasoningModePreference / submitTurn / getSubmitTurnStatus`） |
| `createDesktopApiV1Alpha5` factory + contextBridge | `apps/desktop/src/preload/create-desktop-api.ts:193` + `apps/desktop/src/preload/index.ts:67,70,77` |
| Renderer v1alpha5 consumer = 0 | 全仓 walk `apps/desktop/src/renderer/**` grep `robothreeDesktopV1Alpha5\|desktop-local/v1alpha5` = 0 |
| `ReasoningModePreferenceProjectionV1Alpha5Schema` | `packages/contracts/src/desktop-local/v1alpha5/reasoning-mode.ts:47-94`（含 `preferenceRevision / preferencePersistence / testIdentityUsed / productionIdentityReady` + `available<->revision` 互斥 + `testIdentityUsed && productionIdentityReady` 互斥 + Zod superRefine） |
| 6 facade v1alpha5 methods | `services/core/src/application/desktop-application-facade.ts:430/459/483/508/1195/1328`（`compatibilityV1Alpha5 / previewReasoningModeV1Alpha5 / getReasoningModePreferenceV1Alpha5 / updateReasoningModePreferenceV1Alpha5 / submitTurnV1Alpha5 / querySubmitTurnV1Alpha5`） |
| Compat 返回 `production_gate_disabled` | `desktop-application-facade.ts:419-425, 450-454` |
| `submitTurnV1Alpha5` 走 CorePrivateClient | `apps/desktop/src/main/desktop-v1alpha5-ipc-router.ts:155` `lease.client.submitTurnV1Alpha5(input)` |
| Binding cap 16 fail-closed | `desktop-v1alpha5-ipc-router.ts:117` `if (this.#clients.size >= 16) return false` |
| Lease revalidation + runtime_changed | `desktop-v1alpha5-ipc-router.ts:55,80-87`（`#resolveConnection()` + `isCurrentConnection(lease)` + `reasoning.runtime_changed` typed envelope） |
| `negotiatedRuntimeInstanceId` 业务调用校验 | `desktop-v1alpha5-ipc-router.ts:60-68`（Core restart 后业务调用立即 typed `reasoning.runtime_changed`） |
| Lifecycle cleanup | `apps/desktop/src/main/index.ts:262-264`（`did-start-navigation` / `render-process-gone` / `destroyed` 三个 webContents 钩子 → `v1alpha5Router.removeWebContents(webContents.id)`） |
| `connectionLease()` 三元 lease | `apps/desktop/src/main/core-private-supervisor.ts:123-128`（`{client, runtimeInstanceId, transportClientInstanceId}` —— DFI-5.4.1 已 frozen） |
| Core #authorized exact Host/Origin/Bearer | `core-private-http-server.ts:282-287`（DFI-5.4.1 已 frozen） |
| production gate 字面 false/0 | `dfi541-max-core-cutover.ts:6-7` + `desktop-v1alpha4-cutover.ts:6` |
| PRA 10 typed cause 不漂移 | `exact-subject-provider-release-materializer.ts:167-177`（2 fallback + 8 fail-closed） |
| DFI-5.4.1 leak regex 0命中 v1alpha5 Contract | grep `reasoning_effort\|budget_tokens\|authorization\s*:\|cookie\s*:\|credentialReference` 在 `desktop-local/v1alpha5/*.ts` = 0 行 |
| migration 26 = preference persistence | `services/core/src/adapters/sqlite/migrations.ts:1418-1451`（`dfi_5_reasoning_mode_experience_preference` + `desktop_experience_owner_scope_namespaces` + `desktop_reasoning_mode_preferences`） |
| v1alpha4 Contract frozen（git diff 零改动） | `git diff --stat HEAD -- packages/contracts/src/desktop-local/v1alpha4/* apps/desktop/src/main/desktop-v1alpha4-ipc-router.ts` = 0 行；仅 `create-desktop-api.ts` 与 `foundation-api.ts` additive +248 行 |

---

## 三、发现

### 3.1 P0 = 0

无。DFI-5.4.2 实施 6 routes / 6 IPC / 6 preload methods / preference projection / lease revalidation / binding cap 16 / runtime_changed typed / lifecycle cleanup / production gates false / Renderer consumer = 0 / Max UI = false / installed release = 0 / migration 26 不变 / lockfile digest 不变 / DFI-5.4.1 evidence digest 不漂移 / v1alpha4 Contract frozen / PRA 10 cause 不漂移 / root check 318/2143 + 3 smoke + Architecture boundary PASS / lint / typecheck / audit:dtp4 PASS — 全部独立只读可证，独立 harness 复算 evidenceDigest `sha256:e0abc2a0…5a8d8` 逐字符一致。

### 3.2 P1 = 0

无。DFI-5.4.1 `R2DP3` 3 个 historical harness (`dfi5.4.1` / `r2dp3` / `pra3`) 全部 PASS，evidenceDigest 与历史闭锁时点逐字一致；migration 仍止 26；lockfile `5b15ae01…874f31` 不变；DFI-5.4.3 与其他下游（DFI-5.4.3 / TGM / Knowledge Provider / Agent Lifecycle / DFI-4A.4 public CRUD / Admin v2）继续 `GATED`。

### 3.3 P2 = 0

无。§1.5 用户聚焦复核确认本次 sandbox 中 `harness:r2d4` 触发的 `database.enableDefensive is not a function` 为 QA runtime / path 伪失败，不归因 DFI-5.4.2；用户固定 Node v24.13.0 后 R2D-4 focused 18 files / 179 tests 全部通过，不形成 product code 缺陷。

### 3.4 P3 = 0

无。`apps/admin-console` 保持 `0.0.0-afe.6c` 是已冻结的版本策略（与 DFI-5.4.2 独立文档复核 P3-3 一致），不构成 DFI-5.4.2 偏差；Central 本批不构成产品阻塞，开发门禁在 JDK 21 环境已通过 online/offline 438/438（实施报告 §4 表第 7/8 行）。

### 3.5 其他非问题观察（仅记录，不计 P 级）

1. **3 个新增 evidence schema 字段**（`productionMaxFeatureAvailable / rendererV1Alpha5ConsumerCount / dfi543Unlocked`）按方案 §0.2 / §16 设计新增，DFI-5.4.2 harness 强校验通过。
2. **DFI-5.4.1 evidence 文件与内层 digest 双层不漂移**——Harness 在 focused tests 通过后再次读 `artifacts/dfi541/evidence.json` 内层 `evidenceDigest` 字段断言 + 前后文件 sha256 比对（before/after 不变）✅。
3. **evidenceDigest 重算独立可证**——独立 Node 重算 `sha256(JSON.stringify(semanticEvidence))` = `sha256:e0abc2a01e1192e59be9afc91fe0b701909bc794d86f82f8ef2504ecb685a8d8` 逐字符一致 ✅。
4. **Central 引用开发门禁**：本次独立 sandbox 未复跑 Central（无 JDK 21），引用开发门禁在 JDK 21 环境完成的 online/offline 438/438 BUILD SUCCESS 证据（实施报告 §4 表第 7/8 行）；evidence.json 未触及 Central 结果字段。

---

## 四、核心结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.4.2 完成 Desktop v1alpha5 Safe API / Restart Lease additive 接入：6 条 exact Core private HTTP route（`compatibilityV1Alpha5 / previewReasoningModeV1Alpha5 / getReasoningModePreferenceV1Alpha5 / updateReasoningModePreferenceV1Alpha5 / submitTurnV1Alpha5 / querySubmitTurnV1Alpha5`）→ 6 个 exact IPC channel（`robothree:v1alpha5:{compatibility,preview-reasoning-mode,get-reasoning-mode-preference,update-reasoning-mode-preference,submit-turn,get-submit-turn-status}`）→ frozen `window.robothreeDesktopV1Alpha5` 6 方法 API（`getCompatibility / previewReasoningMode / getReasoningModePreference / updateReasoningModePreference / submitTurn / getSubmitTurnStatus`）；Main 用 Renderer 原始 UUID 绑定 webContents（`#clients.size >= 16 → fail-closed`）、跨窗口复用拒绝（`reasoning.client_mismatch`）、`did-start-navigation` / `render-process-gone` / `destroyed` 三个 lifecycle 钩子确定性清理 binding；业务调用捕获单一 `CorePrivateConnectionLease` 三元（`{client, runtimeInstanceId, transportClientInstanceId}`）并在 dispatch 后 `isCurrentConnection(lease)` revalidation，Core 重启后旧协商只能得到 typed `reasoning.runtime_changed`；v1alpha5 preference safe projection（`available<->revision` 互斥 + `testIdentityUsed && productionIdentityReady` 互斥 + Zod superRefine）补齐 `ReasoningModePreferenceProjectionV1Alpha5`；`compatibilityV1Alpha5` 在 disabled graph 时返回 `production_gate_disabled`，所有业务调用 fail-closed。

门禁独立复跑：harness:dfi5.4.2 5/21 + evidenceDigest `sha256:e0abc2a0…5a8d8` 逐字一致；harness:dfi5.4.1（37 tests + evidence `165d1544…9735ed4`）+ harness:r2dp3（22 tests + 真实 Electron Main/IPC/Core/SQLite + sandbox + contextIsolation + nodeIntegrationDisabled + evidence `7d85a493…678bb`）+ harness:pra3（22 tests + evidence `ef0fb7a5…21e2b`）3 个 historical harness PASS + evidence 不漂移；harness:r2d4 18 files / 179 tests PASS（用户固定 Node v24.13.0 聚焦复跑确认，原本次 sandbox 触发为 QA runtime / path 伪失败，不归因 DFI-5.4.2）；Central online/offline 438/438 BUILD SUCCESS（开发门禁在 JDK 21 环境完成，本次独立 sandbox 未复跑 Central，引用为权威证据）；`pnpm run check` 318/2143 + 3 smoke + Architecture boundary actual exit code = 0；lint / typecheck / audit:dtp4 PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、6 v1alpha5 Contract grep `reasoning_effort\|budget_tokens\|authorization:\|cookie:\|credentialReference` = 0 命中（DFI-5.4.1 leak regex 继承）；production gates / R2D / CPC / enterprise entitlement / DFI-5.4.1 / DFI-5.4.2 / Desktop Max UI / installed release 8 项全部 false/0；historical DFI-5.4.1 evidence digest 不漂移；evidenceDigest 重算逐字符一致。

唯一已知偏差：`apps/admin-console` 保持 `0.0.0-afe.6c`（已冻结版本策略，不构成 DFI-5.4.2 偏差），其他零项已保留。

---

## 五、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；原 §1.3 第 5 行 `harness:r2d4` 在本次 sandbox 中的 failure 经用户固定 Node v24.13.0 聚焦复跑确认（18 files / 179 tests PASS + `submit-turn-coordinator.integration.test.ts` 31/31 PASS）为 QA runtime / path 伪失败，不归因 DFI-5.4.2，不建立 repair 批次；`apps/admin-console` 保持 `0.0.0-afe.6c` 为既有冻结版本策略，不构成 P3；Central 本次 sandbox 未复跑，仅引用开发门禁在 JDK 21 环境完成的 438/438 BUILD SUCCESS 证据。
2. **DFI-5.4.2 正式接受**：本报告即可由用户正式接受并 `PASS/CLOSED`。
3. **后续路径**：DFI-5.4.2 接受后**不自动解锁 DFI-5.4.3**；期间 DFI-5.4.3、TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 public CRUD、Admin v2 继续 `GATED`。
4. **若 DFI-5.4.2 PASS/CLOSED**：用户单独规划、评审、授权 DFI-5.4.3（Renderer Max UI + 真实 E2E + DFI-5 阶段 closure）。

本轮聚焦文字修正未修改源码、Contract、Evidence、migration 或 lockfile；仅落盘本 QA 报告修订供用户决策。

— Claude Code（独立 QA，只读）