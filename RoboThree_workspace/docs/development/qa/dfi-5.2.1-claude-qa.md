# DFI-5.2.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-1530-version-dfi.5.2.1` |
| 验收对象 | DFI-5.2.1：Reasoning Lock Contract / Conformance |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Contracts/Core `0.0.0-dfi.5.2.1`；Root 保持 `0.0.0-ptx.3` |
| 上游 | DFI-5.2 Revision 1 复核 PASS + 用户授权 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-5.2.1 focused（contracts + domain） | **PASS**（2 files / 19 tests 直接命中 + 完整 check 覆盖全部） |
| 2 | `CI=true pnpm run check`（root） | **PASS 254 files / 1699 tests + 3 smoke + Architecture boundary** |
| 3 | `CI=true pnpm run check:central`（**补跑**） | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline`（**补跑**） | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 5 | 边界：lockfile / migration | 仍 `c47641ac…` 未变；migration 最大 id=26 无 27 |

注：报告声明「开发者环境无 JDK 21，Central 未复跑」——我的环境 JDK 21.0.12 可用，已补跑 Central
online/offline 404/404 全绿（DFI-5.2.1 未改 Central，结果符合预期）。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 四种严格 variant | ✅ [lock.ts](packages/contracts/src/reasoning-mode/lock.ts) `z.discriminatedUnion("resolution")` 四 variant：default 禁 observed/Profile/Strategy；fallback 禁 Profile/Strategy/timeout；仅 `max_applied` 带 profileRef+strategyRef |
| 2 | Profile ref 强约束 | ✅ `profileRevision === profileDigest` superRefine——「revision 与 digest 必须标识同一 immutable material」 |
| 3 | Runtime Selection v1alpha2 exact binding | ✅ `reasoningModeLock.taskId === selection.taskId`；`modelLockRef === resolvedModelLock` exact ID/digest；reasoning lock ID 不混入 capability lock IDs（第 90 行拒绝） |
| 4 | SubmitTurn v1alpha3 union | ✅ `reasoningPreference` discriminated union：default 无 observed、max 必带 support+revision |
| 5 | coordination v1alpha3 durable plan | ✅ `reasoningPlan.reasoningModeLock.taskId` 对齐；`plannedRuntimeSelectionDigest === plannedSelectionDigest`；`modelLockRef` 在 capabilityLockIds、reasoning lock ID 不在其中 |
| 6 | 旧版本零漂移 | ✅ 根入口 `TaskRuntimeSelectionSchema` 仍只接受 v1alpha1；v1alpha1/v1alpha2 coordination 保留 |
| 7 | 私有 subpath 不可达 | ✅ `runtime-selection/v1alpha2`、`submit-turn-coordination/v1alpha3`、`reasoning-mode/lock` 在 Desktop/Admin/根入口零导入（Architecture boundary） |
| 8 | 未越界 | ✅ 未改 migration 1~26、未加 migration 27；未接 Planner/Provider/Desktop UI/生产 route |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.2.1 正确完成 Reasoning Lock Contract / Conformance：ReasoningModeLock 四 variant strict
discriminated union（仅 max_applied 携带 Profile/Strategy/timeout ref，Profile revision==digest 强约束）；
Runtime Selection v1alpha2 精确绑定 Task + Model lock + Reasoning lock（且 reasoning lock ID 不混入
capability lock IDs）；SubmitTurn v1alpha3 default|max strict union；coordination v1alpha3 durable
reasoning plan 校验 planned digest 三方一致。根入口 v1alpha1 零漂移，v1alpha2/v1alpha3 全走 Core-private
subpath，Desktop/Admin 不可达。门禁独立复跑全绿（完整 check 254/1699 + 3 smoke、Central online/offline
**补跑 404/404**）。边界零漂移：migration 仍止 26、lockfile 未变。

**DFI-5.2.1 可进入用户接受流程；接受后 DFI-5.2.2（Planner + stale 真值表 + Task bundle）、DFI-5.2.3
（ModelRequest/Compaction Binding v1alpha2 + lifecycle Harness）、DFI-5.3~5.4、AAPI-0.3~0.4、TGM、
Knowledge Provider 继续 GATED，需用户单独授权。**

— Claude Code（独立 QA，只读）
