# DFE-1A — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-16-1920-version-dfe-1a` |
| 验收对象 | DFE-1A：Desktop Renderer SFC 基座、Hash Router、Design Token 与首批基础组件 |
| 日期 | 2026-08-16 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / Electron 43 / Vite 8 / Vue 3.5 |
| 开发版本 | 不升 package 版本；Root/Core `0.0.0-arh.3.3.3-repair.1`；Desktop `0.0.0-pdt.3`（DEVELOPMENT-LOG 已记录该决策） |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 168 files / 1181 tests + 3 smoke（独立复跑） |
| 2 | `pnpm install --frozen-lockfile --offline` | **PASS**（"Already up to date"，无网络下载需求，依赖已锁定） |
| 3 | Desktop focused（3 files / 12 tests） | **PASS**（含于 check：boundary 6 + router 2 + design-system 4 = 12） |

---

## 二、重点核查项（DFE-1A exit checklist 与上轮 P2/P3 吸收）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | `main.ts` 收敛为薄 bootstrap | ✅ 18 行，仅 `createApp(App).use(router).mount("#app")`，无 `window.robothreeDesktop`、无 `h(`、无 `defineComponent(` |
| 2 | 旧业务工作台迁入 Legacy Wrapper | ✅ `legacy/LegacyWorkbench.ts` = 1667 行（原 main.ts 1669 行机械迁移），保留全部 Presentation/API 调用/用户流程 |
| 3 | `window.robothreeDesktop` 只在 Legacy Wrapper | ✅ 目录级扫描确认 `desktopApiFiles == ["legacy/LegacyWorkbench.ts"]`（boundary test L98-104） |
| 4 | 依赖窗口只新增 4 个 | ✅ `vue-router` / `@vitejs/plugin-vue` / `@vue/test-utils` / `happy-dom`；无 Pinia / Tailwind / UI library / 动画库 |
| 5 | 目录级安全扫描（上轮 P2-A） | ✅ `renderer-workbench-boundary.test.ts` 递归扫描 `renderer/**/*.{ts,vue}`，禁止 `ipcRenderer/child_process/node:fs/fetch/eval/innerHTML/document.write` 及敏感字段，并约束 Desktop API 仅 Legacy |
| 6 | Design System dev-only（上轮 P2-4） | ✅ `createRoboThreeRoutes` 仅 `includeDesignSystem ?? import.meta.env.DEV` 时注入；生产路由只含 `/` + `/legacy`（router test 断言） |
| 7 | SFC `.vue` 类型（上轮 P3-C） | ✅ `vue-shim.d.ts` + `tsconfig.renderer.json` 纳入 `.vue` |
| 8 | Legacy Wrapper 迁移方案（上轮 P2-1） | ✅ 机械迁移步骤落地，boundary test 验证 Legacy 保留业务行为且不含 `createApp(` |
| 9 | happy-dom 取舍记录（上轮 P3-B） | ✅ DEVELOPMENT-LOG / Plan 记录"首期优先测试速度和轻量边界，不能静默切换 jsdom" |

---

## 三、发现

### P2 = 1（非阻断，需在 DFE-1B 前解决）

**P2-1：首批 R3\* 基础组件未被真 mount 测试，只有静态源码扫描。**

根因即用户已知的残余——Root Vitest 未配置 `.vue` transform，组件测试无法真 mount `.vue` 文件。
`design-system-components.test.ts` 的 `mount` 只测了一个临时 `defineComponent` 的 `Probe`（验证
test-utils + happy-dom 环境接通），对 16 个 R3\* 组件本身只做静态扫描（含 `<template>`、
`<script setup lang="ts">`、`var(--r3-`、无 forbidden 字段）。

影响：Living Spec §10 acceptance「Component test fixture imports at least one `.vue` component」
**未达成**；R3\* 组件的 props 传递、事件 emit、键盘/焦点/disabled/loading/error 状态**无运行时验证**。
DFE-1A 作为工程骨架可接受，但 DFE-1B 用这些组件搭建 Shell 前，必须补齐组件真 mount 测试（在 Desktop
包内配置 `@vitejs/plugin-vue` 的 Vitest transform，而非继续静态扫描），否则组件行为回归无法拦截。

### P3 = 2

**P3-1：`main.ts` 内塞了"测试专用 marker 注释"（L12-15），与 boundary test L44 形成脆弱耦合。**

marker 注释硬编码历史 API 名称（`createWorkspaceGrantFromPicker`、`submitTurn` 等），boundary test
L44 正向断言该死字符串存在。它是"历史 API 墓碑"，标记迁移可追溯性，但属于测试-源码耦合：任何人
删掉该注释都会误伤 boundary test。真正防线是 L45-47（main.ts 不含 `window.robothreeDesktop`/`h(`/
`defineComponent(`）与 L98-104（目录级扫描 API 归属）。Codex 在 DEVELOPMENT-LOG「边界说明」已承认
"main.ts 仅保留历史 marker 注释"，故为有记录的过渡方案。建议 DFE-1B 真正迁移完成、旧断言删除后，
一并移除该 marker 注释与 L44 断言。

**P3-2：Desktop package 版本未升（仍 `0.0.0-pdt.3`）。**

DFE-1A 修改了 `apps/desktop/package.json`（新增依赖）但未升版本。DEVELOPMENT-LOG 已在「已知残余
风险」明确记录"Desktop package 版本未升版，以避免扩大本批治理范围"，故定性为**有记录的决策**而非
治理遗漏。但 Desktop 版本长期停在 `0.0.0-pdt.3` 而 Root/Core 已到 `0.0.0-arh.3.3.3-repair.1`，版本
体系跨包不一致会在后续 DFE-1B/2 真正交付桌面能力时造成追溯困难，建议在 DFE-1B 起对 Desktop 建立
独立版本演进口径。

> 注：上一轮 DFE-0 复核的 P3-1（DFE-0 未登记 DEVELOPMENT-LOG）已在本批补齐——`DEVELOPMENT-LOG.md`
> 现已含 `## DFE-0` 条目（状态 PASS/CLOSED），故本报告不再重复该 P3。

### P0 = 0，P1 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 1（组件未真 mount 测试），P3 = 2
```

DFE-1A 正确完成 SFC 工程基座：`main.ts` 收敛为薄 bootstrap、旧工作台机械迁入 Legacy Wrapper、
`window.robothreeDesktop` 收敛至 Legacy 唯一使用点、目录级安全扫描（.ts+.vue）落地、生产路由不含
dev-only Design System、依赖窗口严格限于 4 项、`.vue` 类型纳入 TS 边界。`CI=true pnpm run check`
168 files / 1181 tests + 3 smoke 独立复跑通过，offline frozen install 通过，无生产边界漂移
（Main/Preload/IPC/Contracts/Core/Central 零改动）。

**DFE-1A 可进入用户接受流程。DFE-1B 保持 GATED。** 建议 DFE-1B 授权前，Codex 就 P2-1 给出"组件
真 mount 测试"的落地批次（在 Desktop 包内配置 `.vue` Vitest transform，而非继续静态扫描）。

— Claude Code（独立 QA，只读）
