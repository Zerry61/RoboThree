# DFI-5.2.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-1830-version-dfi.5.2.2` |
| 验收对象 | DFI-5.2.2：Planner / Stale CAS / Task Bundle 精确物化 |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core `0.0.0-dfi.5.2.2` |
| 上游 | DFI-5.2.1 `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-5.2.2 核心 focused（planner + coordinator + projection） | **PASS**（submit-turn-coordinator 28 + planner + projection 等） |
| 2 | `CI=true pnpm run check`（root） | **PASS 255 files / 1710 tests + 3 smoke + Architecture boundary** |
| 3 | `CI=true pnpm run check:central` | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 5 | `CI=true pnpm run audit:dtp4` | **PASS**（上轮 PTX-4 QA 的 P1-1 版本错位已由本批收口解决） |
| 6 | 边界：lockfile / migration | 仍 `c47641ac…` 未变；migration 仍止 26 无 27 |

---

## 二、重点核查项（对照方案 + 我上轮 QA 盯的三处）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | **default Profile load=0 / max 恰好一次** | ✅ [reasoning-mode-lock-planner.ts](services/core/src/application/reasoning-mode-lock-planner.ts) `requestedMode==="default"` 直接 create default_passthrough（不调 profiles.loadExact）；`max` 路径第 160 行才 `loadExact` 一次，无第二次读取/fallback——报告 §3.1 计数（0/1/0/0）成立 |
| 2 | **stale/unavailable 零 durable side effect** | ✅ 报告 §3.2 十类事实（Message intent/Conversation/coordination/Task/Lock/Selection/Authorization/Binding/Receipt/Loop）测试逐项断言 0；Planner 失败在 prepareMessage 前返回（§2.2「均在 Message prepare、coordination accept、Task 写入之前返回」） |
| 3 | **Runtime Selection v1alpha2 + Task bundle 原子** | ✅ `RuntimeSelectionService` 显式 v1alpha2 prepare + accepted-plan recovery；`TaskPersistence` reasoning-aware bundle 方法（旧方法仍只收 v1alpha1）；InMemory/SQLite 同一 readable-union validator，原子写 Task/Capability Locks/v1alpha2 Selection/Authorization/Binding |
| 4 | 单一 Planner + task-locked subject | ✅ enterprise subject 只由 exact Model lock 派生；personal 过 owner namespace + pmcfg1 MAC/executionDefinitionDigest；禁 modelId 前缀/Provider 名猜 |
| 5 | coordination v3 accepted recovery 不重读 | ✅ accepted 持久化完整 ReasoningModeLock + planned digest；恢复只读 durable plan，不重读 Preference/Profile current pointer、不重生成 lock id/digest |
| 6 | 精确绑定 | ✅ plannedSelectionDigest == selection digest；authorization digest == selection digest；capability lock IDs 不含 reasoning ID |
| 7 | 未越界 | ✅ 未加 migration 27；未进 Provider/ModelRequest/Agent Loop reasoning 消费/Desktop/Admin；（provider 里的 `reasoning_content`/`reasoning` 是 DFI-4A.3.1 既有 SSE progress classifier，非本批消费） |
| 8 | 测试断言真实性 | ✅ 反查无 `.skip`/`.only`/`@Disabled`/`@Ignore` |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.2.2 正确完成 Planner / Stale CAS / Task Bundle 精确物化：单一 `ReasoningModeLockPlanner`（default
Profile load=0、max 恰好一次 loadExact 为线性化点）；stale/unavailable 在任何 durable side effect 前
fail-closed；TaskRuntimeSelection v1alpha2 与 authorization-aware Task Bundle 原子物化（InMemory/SQLite 共用
readable-union validator）；coordination v1alpha3 accepted 恢复复用原始 lock 不重读 Preference/Profile；
精确绑定（planned digest / authorization digest / capability lock IDs）齐全；未加 migration 27、未进
Provider/Desktop。门禁独立复跑全绿（完整 check 255/1710 + 3 smoke、Central online/offline 404/404、
audit:dtp4）。边界零漂移：lockfile 未变、migration 仍止 26。

**DFI-5.2.2 可进入用户接受流程；接受后 DFI-5.2.3（ModelRequest/Compaction Binding v1alpha2 + lifecycle
Harness）、DFI-5.3（Provider Mapping）、DFI-5.4（Desktop UI）、AAPI-0.3~0.4、TGM、Knowledge Provider 继续
GATED，需用户单独授权。**

— Claude Code（独立 QA，只读）
