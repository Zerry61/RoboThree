# DFI-2A.3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-18-2049-version-dfi-2a.3` |
| 验收对象 | DFI-2A.3：Authorization-aware SubmitTurn 编排、恢复与 Readiness Cutover |
| 日期 | 2026-08-18 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version` 声明）/ pnpm 11.11.0 / JDK 21.0.12（Homebrew openjdk@21）/ Docker 29.6.2（Testcontainers） |
| 开发版本 | Core/Contracts `0.0.0-dfi.2a.3`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Desktop `0.0.0-dfe.4b`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行）

> 首次独立复跑时 shell 默认 Node 为 **v22.22.1**（非 `.node-version` 声明的 24.13.0），
> `node:sqlite` 的 `DatabaseSync.enableDefensive` 在 Node 22 不存在，导致 185 个测试失败。
> 已确认根因为**环境漂移**而非产品缺陷：切回 Node 24.13.0 + JDK 21 后重跑，vitest 全绿。

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check`（vitest 部分） | **PASS 191 files / 1286 tests**（Node 24.13.0 重跑） |
| 2 | `CI=true pnpm run check`（smoke 部分） | core smoke PASS；desktop foundation smoke PASS；**preload smoke FAIL**（见 §三，非本批范围） |
| 3 | `CI=true pnpm run check:central` | **PASS 302/0/0/0（BUILD SUCCESS）** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 302/0/0/0（BUILD SUCCESS）** |

DFI-2A.3 focused（含 `submit-turn-coordinator.integration.test.ts` A1~A7）已含于 vitest 191 files 全绿。

---

## 二、重点核查项（DFI-2A.3 方案交付 + 边界零漂移）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | v1alpha1/v1alpha2 双版本编排 | ✅ `submit()` 走 `SubmitTurnCommandSchema`，`submitV1Alpha2()` 走 `SubmitTurnCommandV1Alpha2Schema`，各自保留 strict wire command；`requestDigest = sha256CanonicalJson(JsonValueSchema.parse(command))` 精确覆盖整个 wire 请求；新提交统一写严格 v1alpha2 record 且显式记录 `transportContractVersion` |
| 2 | Authorization Plan 在副作用前锁定 | ✅ `#submit` 先 `#prepareSelection` → `#resolveAuthorization` 构造含 `authorizationPlan` 的 v1alpha2 record → `prepareAccepted`（CAS 落库）→ 之后才在 `#progress` 做 Message append / Task bundle 提交；`superRefine` 锁死 `authorizationPlan.requestedMode === selectionRequest.authorizationPreference.requestedMode` |
| 3 | authorization-aware bundle 原子提交 | ✅ `message_appended` 状态经 `#tasks.commitAuthorizationAwareSubmitTurnTaskBundle` 同事务提交 Runtime/Authorization/Execution facts，再 transition 到 `task_committed` |
| 4 | 历史 v1alpha1 record 的 CAS normalization | ✅ `#normalizeLegacyRecoverableRecord` 只处理 `accepted/message_appended/task_committed`（排除 completed/failed_terminal）；用 fixed MVP Policy（legacy）构造 replacement，`transportContractVersion:"v1alpha1"`；`normalizedSelectionRequestFromLegacy` 只 additive 补 `authorizationPreference`，不重选 Agent/Model/Skill/Knowledge/Workspace |
| 5 | `validatePersistedAuthorizationPlan()` 无 I/O | ✅ 只重算并校验 selection/execution digest 与 identity（taskId/runtimeSelectionId/plannedSelectionDigest/authorizationPlan 各 digest 一致），不读当前 Policy、不写 Persistence、不执行 normalization；恢复路径不得用它重新选择模式 |
| 6 | 双版本 Receipt/Query 投影 | ✅ `acceptedReceipt`/`rejectedReceipt` 按 `schemaVersion + transportContractVersion === v1alpha2` 分支产出 v1alpha2 Receipt（含 `resolvedAuthorization` 与 `executionSelectionDigest`）；v1alpha1 Receipt 走 `PersistedSubmitTurnReceiptSchema` 不变 |
| 7 | startup 顺序 | ✅ `persistence adapters start` → `authorizationPolicy.loadSnapshot + legacyAuthorizationMaterializer.materialize`（失败 throw → runtimeStatus failed）→ `recovery.recoverOnce + recovery.start` → `server.start` → `ready` |
| 8 | A1~A7 崩溃恢复 | ✅ 测试真实断言：A1 注入 `after_plan_before_accept` 后断言 record/Message/Task 全空（无副作用）再重跑；A2~A7 用 `mkdtemp` SQLite close/reopen 实际恢复，逐场景断言 `report.failures === []`、replay receipt、bundle `resolvedMode: task_scoped`、delivery 长度 1、`loop.startedCount() === 1`（幂等 Loop start） |
| 9 | 边界零漂移 | ✅ 今日改动仅限 `packages/contracts/submit-turn-coordination/v1alpha2.ts` 与 `services/core/**`（coordinator/persistence/adapters/bootstrap/facade）；`apps/desktop/src`、`services/central-service`、`services/document-worker` 源码零改动；migration 最大编号仍为 **22**（未新增 23）；未改 HTTP route / Main / Preload / Renderer / AuthorizationEvaluator / Confirmation / Kernel |

---

## 三、发现

### 本批范围（DFI-2A.3 后端交付）

**P0 = 0，P1 = 0，P2 = 0，P3 = 0**

### 独立发现（跨批，非 DFI-2A.3 范围）

**P3-1（非本批）：Desktop preload smoke 在 electron 43.2 下稳定失败。**

- 现象：`CI=true pnpm run check` 的 `smoke:preload`（`electron dist/main/preload-smoke.js`）报
  `SyntaxError: The requested module 'electron' does not provide an export named 'BrowserWindow'`；
- 根因：`apps/desktop/src/main/preload-smoke.ts`（mtime Aug 17，属 **DFE 前端批次**）使用
  `import { app, BrowserWindow } from "electron"`，而 electron 43.2（Jul 24 已锁定安装，内嵌 Node v24.18.0）
  的 ESM main process 下 `electron` 模块**不提供命名导出**（最小复现：`import { app } from "electron"` 同样报错）；
- 归属判定：**非 DFI-2A.3 交付**——DFI-2A.3 声明并核实「未修改 Renderer/Main/Preload」，`apps/desktop/src`
  今日零改动；preload smoke 属 DFE 前端范围；
- 影响：导致 `check` 命令整体 exit 1（vitest 191/1286 与 core/foundation smoke 均已 PASS，仅 preload smoke 断尾）；
- 建议：由 **DFE 前端批次**单独跟踪（修复 `preload-smoke.ts` 的 electron ESM 导入方式，或锁定 electron 版本），
  不阻断 DFI-2A.3 后端验收。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
本批范围：P0 = 0，P1 = 0，P2 = 0，P3 = 0
独立发现（非本批）：P3-1 Desktop preload smoke 因 electron 43.2 ESM 命名导入失败，属 DFE 前端，建议单独跟踪
```

DFI-2A.3 正确完成 Authorization-aware SubmitTurn 编排与恢复：v1alpha1/v1alpha2 双版本编排（各自 strict wire
command + exact request digest + 显式 transportContractVersion）、Authorization Plan 在 Message/Task 副作用前锁定、
authorization-aware Task bundle 原子提交、历史 v1alpha1 record 的 CAS normalization（只 additive，不重选）、
`validatePersistedAuthorizationPlan()` 无 I/O 纯校验、双版本 Receipt/Query 投影、startup 顺序
（persistence → materialization → recovery → server → ready，materialization 失败关闭）、A1~A7 崩溃恢复
（SQLite close/reopen 实际恢复 + 真实断言）。边界零漂移：未改 Renderer/Main/Preload/HTTP/Kernel/Central/
Document Worker，migration 保持 22。

门禁独立串行复跑：vitest **191/1286**、Central online/offline 均 **302/0/0/0**。首次复跑暴露 Node 22 环境漂移
（`node:sqlite.enableDefensive` 缺失），已确认为环境问题并切回 Node 24.13.0 后全绿。

**DFI-2A.3 可进入用户接受流程。DFI-2B、DFI-3、DFI-4 保持 GATED。**

— Claude Code（独立 QA，只读）

---

## 附：P3-1 根因修正（2026-08-19）

§三 P3-1 将 preload smoke 失败归因于「electron 43.2 ESM 命名导入」，**该结论有误，特此修正**。

复核 DFE-4B-repair.1 期间定位到真正根因：**独立 QA 的 shell 环境存在 `ELECTRON_RUN_AS_NODE=1`**，
使 electron 二进制以纯 Node 模式运行（`electron --version` 输出 Node 版本 `v24.18.0`、
`process.type=undefined`、`require("electron")` 返回路径字符串而非 electron API）。这是 Claude Code
Bash 工具的环境变量，非项目环境，也非 electron 43.2 缺陷。

清除该变量后（`env -u ELECTRON_RUN_AS_NODE`）实测：

| 验证项 | 结果 |
|---|---|
| `electron --version` | `v43.2.0`（正确） |
| `smoke:preload` | **PASS**，返回 `{"status":"ready",...}` 完整 preload 投影 |
| `CI=true pnpm run check` | **PASS 191 files / 1286 tests + 3 smoke 全绿** |

修正后的结论：preload smoke 失败是 **QA 环境变量污染导致的误报**，不是 electron 43.2 缺陷，也不是
preload-smoke.ts 代码问题；前端 DFE-4B-repair.1 改用 default import 方向正确（无害的合理改进），但并非
修复一个真实 bug。

