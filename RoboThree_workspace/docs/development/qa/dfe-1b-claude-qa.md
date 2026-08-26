# DFE-1B — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-16-1948-version-dfe-1b` |
| 验收对象 | DFE-1B：Desktop Shell、五个一级导航骨架、侧栏展开/收起、KeepAlive、通用状态 skeleton |
| 日期 | 2026-08-16 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / Electron 43 / Vite 8 / Vue 3.5 |
| 开发版本 | Desktop `0.0.0-dfe.1b`（已升版）；Root/Core `0.0.0-arh.3.3.3-repair.1`；Contracts/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 169 files / 1185 tests + 3 smoke（独立复跑） |
| 2 | `CI=true pnpm --filter @robothree/desktop build` | **PASS**（生产 build 101 modules） |
| 3 | 生产 dist 不含 DesignSystemGallery | **PASS**（无独立 chunk；组件特征在 bundle 中 0 命中） |

---

## 二、重点核查项（DFE-1A 遗留 P2/P3 关闭 + DFE-1B 交付）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | DFE-1A P2-1 关闭（组件真 mount） | ✅ `design-system-components.test.ts` 从静态扫描升级为运行时 `mount`，真 mount 15 个 R3\* 组件，验证 props/`aria-busy`/`disabled`/`setValue`/`emitted("update:modelValue")`/modal close 事件 |
| 2 | DFE-1A P3-1 关闭（marker 注释移除） | ✅ `main.ts` 14 行，`marker` 注释与业务 API 断言已删除；boundary test 的 `expect(marker)` 断言移除，改查 `LegacyWorkbench.ts` |
| 3 | DFE-1A P3-2 关闭（版本升版） | ✅ Desktop `0.0.0-pdt.3` → `0.0.0-dfe.1b` |
| 4 | 五个一级导航 | ✅ `workbench / tasks / intelligence / knowledge / settings` 五个 `productionRouteNames`，`/` 与 `/legacy` 重定向到 `/workbench` |
| 5 | 旧工作台迁 `/workbench` + KeepAlive | ✅ `App.vue` 用 `<KeepAlive include="RoboThreeWorkbench">` 包裹 RouterView，页面切换不重建旧工作台 |
| 6 | `/tasks` 等是纯 skeleton | ✅ `ShellPlaceholderPage.vue` 只展示通用状态（PageHeader/Card/InlineNotice/Skeleton/EmptyState），`eyebrow="DFE-1B skeleton"`，无 `window.robothreeDesktop`、无真实数据接入 |
| 7 | 生产 dist 不含 dev-only DesignSystemGallery | ✅ 生产 build 无 DesignSystemGallery 独立 chunk；组件特征（`设计系统`/`R3Button` 等）在 bundle 中 0 命中，仅残留 router 测试注入分支的死代码（详见 P3-2） |
| 8 | 边界无漂移 | ✅ Main/Preload/IPC/Contracts/Core/Central 零改动；`window.robothreeDesktop` 仍仅 `legacy/LegacyWorkbench.ts` |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0

### P3 = 2

**P3-1：`R3Tooltip` 未纳入真 mount 测试。**

`components/ui` 有 17 个 `.vue`，但 `design-system-components.test.ts` 的 import 列表与 `baseComponents`
数组只覆盖 16 个，缺 `R3Tooltip`。其余 16 个组件（含结构性/反馈类）均已真 mount 验证。Tooltip 因
portal/悬浮的测试特殊性可能是刻意推迟，但未在文档中说明。建议 DFE-2A 前补齐 R3Tooltip 的 mount 或
显式声明其测试策略（如交由 Shell 集成测试覆盖）。

**P3-2：router 的测试注入分支残留在生产 bundle（无害死代码）。**

生产 `index-*.js` 中仍含 `path:`/__design-system`` 字符串，来自 `createRoboThreeRoutes` 的
`else if (includeDesignSystem && options.designSystemComponent !== undefined)` 测试 fixture 分支。
该分支**不包含** DesignSystemGallery 组件（组件动态 import 已被 tree-shaking 干净），且生产运行时
`includeDesignSystem=false` 永不执行。属可接受的无害死代码，可在后续 router 收口时用条件编译或
显式剥离测试 hook 进一步消除。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 2
```

DFE-1B 正确关闭 DFE-1A 遗留的全部 P2/P3（组件真 mount、marker 移除、版本升版），完成 Desktop Shell
与五个一级导航骨架：`main.ts` 保持薄 bootstrap、旧工作台迁 `/workbench` 并由 KeepAlive 保持、其余四
导航为明确 skeleton（无真实业务接入）、生产构建不含 dev-only DesignSystemGallery 组件。
`CI=true pnpm run check` 169 files / 1185 tests + 3 smoke 独立复跑通过，生产 build 通过，无生产边界
漂移。

**DFE-1B 可进入用户接受流程。DFE-2A 保持 GATED。** 两个 P3 均为非阻断的小遗漏/死代码，可在 DFE-2A
前顺带处理，不构成接受阻断。

— Claude Code（独立 QA，只读）
