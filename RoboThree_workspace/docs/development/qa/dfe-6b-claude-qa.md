# DFE-6B — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-21-1423-version-dfe-6b` |
| 验收对象 | DFE-6B：Frontend Experience Foundation 收口 |
| 日期 | 2026-08-21 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 |
| 开发版本 | Desktop `0.0.0-dfe.6b`；Core/Contracts `0.0.0-dfi.4a.1`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFE-6B focused（closeout/desktop-shell/boundary/task-workspace 回归 4 个测试文件） | **PASS 4 files / 17 tests**（覆盖开发者 4/16） |
| 2 | `CI=true pnpm --filter @robothree/desktop build` | **PASS** |
| 3 | `CI=true pnpm run lint`（eslint + Architecture boundary） | **PASS**，`Architecture boundary checks passed` |
| 4 | `CI=true pnpm run check`（完整） | **PASS 208 files / 1382 tests + 3 smoke 全绿** |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 五导航固化 | ✅ [frontend-closeout-presentation.ts](apps/desktop/src/renderer/presentation/frontend-closeout-presentation.ts) `frontendCloseoutAreas` 覆盖 workbench/tasks/intelligence/knowledge/settings 五个一级导航，每项含 routePath/currentDataMode/closesFoundation/remainingGate；测试断言与 `primaryNavigationItems` 一一对应且不重复 |
| 2 | 七状态矩阵 | ✅ `frontendCloseoutStates`（loading/empty/error/disabled/permission_denied/unavailable/partial）；测试断言每 area `missingStatesForArea` 为空 |
| 3 | remaining Mock inventory | ✅ 11 项，每项含 productionShape（real/gated_copy/prototype_marked/fixture_test_only/hidden_maintenance）+ removalGate + mustRemainGated；`tasks.workspaceFiles` 标 `real`（DFE-6A 已替换占位）、`knowledge.fixtureSources` 标 `fixture_test_only`、`legacy.workbench` 标 `hidden_maintenance` |
| 4 | Legacy 去留决策 | ✅ `legacyWorkbenchCloseoutDecision = hidden_maintenance_route`（`/legacy` 保留为隐藏维护路由，不在主导航显示）；测试断言 `primaryNavigationItems` 不含 `legacy` |
| 5 | DesktopShell 可访问性 | ✅ [DesktopShell.vue](apps/desktop/src/renderer/components/shell/DesktopShell.vue) `aside aria-label="主导航"` + `main aria-label="主内容" tabindex="-1"` + 导航 `:aria-current="page"` + `.nav-item:focus-visible` 焦点环 |
| 6 | 静态扫描 | ✅ Renderer 禁用模式零命中（localStorage/sessionStorage/indexedDB/innerHTML/v-html/ipcRenderer/node:* 均未出现） |
| 7 | 测试断言真实性 | ✅ 反查无空断言/恒真断言/`it.skip`；覆盖五导航唯一、七状态全矩阵、11 项 inventory 顺序 + gated 过滤、Legacy hidden 决策 |
| 8 | 边界零漂移 | ✅ 本批只改 `apps/desktop/src/renderer/presentation/**` + `components/shell/DesktopShell.vue` + tests + 版本号；未改 Main/Preload/IPC/Contracts/Core/Central/Document Worker/migration；未改根 tsconfig/lockfile |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFE-6B 正确完成 Frontend Experience Foundation 收口：把五导航、七状态矩阵、remaining Mock/GATED
inventory 和 LegacyWorkbench 去留决策固化为可测试数据（`frontend-closeout-presentation.ts`），
`DesktopShell` 补齐主导航/主内容 aria label、`aria-current` 与 focus-visible 焦点环。四项门禁独立串行
复跑全绿（focused 4/17、build、lint+boundary、完整 check 208/1382 + 3 smoke）。边界零漂移：未改
Main/Preload/IPC/Contracts/Core/Central/Document Worker/migration/根配置/lockfile；Renderer 禁用模式
扫描零命中。

**DFE-6B 可进入用户接受流程；接受后关闭 DFE-6B / DFE Frontend Experience Foundation。DFI-2B、DFI-3、DFI-4A.2～4A.4、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
