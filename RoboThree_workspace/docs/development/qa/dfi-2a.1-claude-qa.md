# DFI-2A.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-17-2102-version-dfi-2a.1` |
| 验收对象 | DFI-2A.1：授权模式 strict Contract、固定 Policy、纯 Selection Resolver、组合 identity digest |
| 日期 | 2026-08-17 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / JDK 21.0.12 / Docker 29.6.2（Testcontainers） |
| 开发版本 | Core/Contracts `0.0.0-dfi.2a.1`；Desktop `0.0.0-dfi.1b`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 188 files / 1256 tests + 3 smoke（独立复跑） |
| 2 | `CI=true pnpm run check:central` | **PASS** 302/0/0/0（BUILD SUCCESS） |
| 3 | `CI=true pnpm run check:central:offline` | **PASS** 302/0/0/0（BUILD SUCCESS） |

DFI-2A.1 focused（2 files / 18 tests）已含于 check。

---

## 二、重点核查项（DFI-2A 方案 §5 / §6.1 交付 + 边界）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | strict 三模式 Contract | ✅ `TaskAuthorizationModeSchema = manual_review / smart_confirm / task_scoped`，`AuthorizationPreferenceV1Alpha2Schema` 强制 `schemaVersion + requestedMode` 且 `.strict()` |
| 2 | 不允许静默降级 | ✅ `ResolvedTaskAuthorizationV1Alpha2Schema` / `TaskAuthorizationSelectionSchema` 均 `superRefine` 强制 `requestedMode === resolvedMode` |
| 3 | legacy 诚实性 | ✅ `TaskAuthorizationSelectionService.#resolveMode`：legacy 走 `policy.legacyDefaultMode` + `source=legacy_default`；explicit 走 strict preference + `source=user_selected`，不伪造 user_selected |
| 4 | 纯 Resolver 无 I/O | ✅ `TaskAuthorizationSelectionService.resolve` 为同步纯函数，无 port/async/IO/文案/风险判断 |
| 5 | authorizationSelectionDigest | ✅ `sha256CanonicalJson(material 不含 digest)`，material 含 taskId/runtimeSelectionId/requested/resolved mode/policyRevision/source/createdAt |
| 6 | executionSelectionDigest 组合 identity | ✅ `sha256(canonical-json({schemaVersion, taskId, runtimeSelectionId, runtimeSelectionDigest, authorizationSelectionDigest}))`，与方案 §4.6 公式一致 |
| 7 | 防篡改自校验 | ✅ `hasValidTaskAuthorizationSelection` / `hasValidTaskExecutionSelectionIdentity` / `hasValidTaskAuthorizationModePolicySnapshot` 均重算 digest 比对 |
| 8 | Policy snapshot 约束 | ✅ `legacyDefaultMode` 必须在 `supportedModes` 中、`supportedModes` 去重 + canonical order、`policyRevision` 自校验 |
| 9 | v1alpha1 零漂移 | ✅ 未改 `TaskSelectionRequestSchema v1alpha1` / `SubmitTurnCommand v1alpha1` / request digest / `TaskRuntimeSelection.selectionDigest` / `TaskSubmitTurnBinding.bundleDigest` |
| 10 | 无超前实现 | ✅ 未进 migration 22、Persistence/Backfill、SubmitTurnCoordinator、HTTP/Main/Preload/Renderer、AuthorizationEvaluator 风险矩阵 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-2A.1 正确实现授权模式 Contract 与纯解析基础：strict 三模式 Contract、legacy 默认诚实标记
（`smart_confirm / legacy_default`，不伪造 user_selected）、纯函数 Selection Resolver、独立
`authorizationSelectionDigest` 与组合 `executionSelectionDigest`、Policy snapshot 自校验、v1alpha1 零
漂移、无 migration/Coordinator/Desktop 超前实现。三项门禁独立串行复跑通过。

**DFI-2A.1 可进入用户接受流程。DFI-2A.2、DFI-2A.3、DFI-2B、DFI-3、DFI-4 保持 GATED。**

— Claude Code（独立 QA，只读）
