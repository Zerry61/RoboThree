# DFI-2A.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-18-1448-version-dfi-2a.2` |
| 验收对象 | DFI-2A.2：migration 22、授权选择持久化、InMemory/SQLite 双实现、legacy materialization |
| 日期 | 2026-08-18 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / JDK 21.0.12 / Docker 29.6.2（Testcontainers） |
| 开发版本 | Core `0.0.0-dfi.2a.2`；Contracts `0.0.0-dfi.2a.1`；Desktop `0.0.0-dfe.4b`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 191 files / 1275 tests + 3 smoke（独立复跑，无 TS2740） |
| 2 | `CI=true pnpm run check:central` | **PASS** 302/0/0/0（BUILD SUCCESS） |
| 3 | `CI=true pnpm run check:central:offline` | **PASS** 302/0/0/0（BUILD SUCCESS） |

DFI-2A.2 focused（2 files / 17 tests）已含于 check。

---

## 二、重点核查项（DFI-2A.2 方案交付 + 无半切换 + 两项 P3）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | Port + 两个生产 Adapter 无半切换 | ✅ `SqliteTaskPersistence` 与 `InMemoryTaskPersistence` **均实现全部 6 个** authorization-aware 方法（逐一 grep 确认 ≥1 命中，无上次"Sqlite 全 0"的半切换） |
| 2 | migration 22 | ✅ `id: 22, name: dfi_2a_task_authorization_selections`，`task_authorization_selections` 表含 task_id PK/FK、runtime_selection_id UNIQUE/FK、双 mode CHECK、source CHECK、authorization/execution digest UNIQUE、`CHECK(requested_mode=resolved_mode)`、`STRICT` 与 policy 索引；migration 1～21 未改写 |
| 3 | 两项 P3 落实 | ✅ indexed columns 精确取自 canonical `selection`/`executionIdentity`（不从重复输入推断）；materialization snapshot 返回完整 `TaskRuntimeSelection` material |
| 4 | 确定性 legacy materialization | ✅ `LegacyTaskAuthorizationSelectionMaterializer` 只用固定 `MVP_TASK_AUTHORIZATION_MODE_POLICY`，`createdAt = runtimeSelection.createdAt`（非启动墙钟），`coverageDigest` CAS，缺失 row 用 DFI-2A.1 纯 Resolver 生成 `smart_confirm/legacy_default` |
| 5 | 三 digest 独立证明 | ✅ `bundleDigest`（旧 bundle）/ `authorizationSelectionDigest` / `executionSelectionDigest` 各自独立，同 base bundle 但授权/execution digest 不同返回 typed conflict |
| 6 | 边界零漂移 | ✅ 未改 `packages/contracts/**`、`SubmitTurnCoordinator`、Desktop readiness、HTTP/Main/Preload/Renderer、Kernel、Central、Document Worker、依赖/lockfile；旧 bundle API 与 v1alpha1 digest 不变 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-2A.2 正确完成授权选择持久化基础：migration 22 严格表结构、Port + Sqlite/InMemory 双 Adapter 完整
实现（无半切换）、两项 P3 落实（indexed columns 来源锁定 + 完整 snapshot）、确定性 legacy
materialization（固定 MVP policy + RuntimeSelection.createdAt + coverageDigest CAS）、三 digest 独立
证明、边界零漂移。三项门禁独立串行复跑通过。上一轮"Sqlite 半成品导致编译失败"的问题已彻底解决。

**DFI-2A.2 可进入用户接受流程。DFI-2A.3、DFI-2B、DFI-3、DFI-4 保持 GATED。**

— Claude Code（独立 QA，只读）
