# DFE-2A — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-16-2018-version-dfe-2a` |
| 验收对象 | DFE-2A：工作台与任务创建体验（新任务 Composer、选择器、智能授权 UI、提交） |
| 日期 | 2026-08-16 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / Electron 43 / Vite 8 / Vue 3.5 |
| 开发版本 | Desktop `0.0.0-dfe.2a`；Root/Core `0.0.0-arh.3.3.3-repair.1`；Contracts `0.0.0-mar.1.0`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 172 files / 1191 tests + 3 smoke（独立复跑，较 DFE-1B +3 files / +6 tests） |
| 2 | `CI=true pnpm --filter @robothree/desktop build` | **PASS**（生产 build，`/workbench` 切新 SFC，`/legacy` 保留回退） |

---

## 二、重点核查项（DFE-1B 遗留 P3 关闭 + DFE-2A 交付与边界）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | DFE-1B P3-1 关闭（R3Tooltip） | ✅ `R3Tooltip` 已纳入 UI barrel、`baseComponents` 数组与真实 `mount` 测试（test L26/L48/L130） |
| 2 | DFE-1B P3-2 关闭（router 测试分支） | ✅ `designSystemComponent` 注入分支已移除，design-system 仅保留 `import.meta.env.DEV` 下的动态 import |
| 3 | `window.robothreeDesktop` 归属 | ✅ 仅 `legacy/LegacyWorkbench.ts` 与 `adapters/workbench-adapter.ts` 两处，目录级扫描确认 |
| 4 | 无新增 IPC / 不拆内部步骤 | ✅ adapter 仅包装现有高层 API：`listWorkspaceGrants/listSessions/listAgents/listModels/listTasks/listArtifacts/createSession/openSession/createWorkspaceGrantFromPicker/submitTurn` |
| 5 | `submitTurn` selectionRequest 字段真实 | ✅ `selectedKnowledgeIds` 等在 `packages/contracts/.../submit-turn.ts` 真实存在（`z.array(DesktopResourceIdSchema).max(64)`），非前端自造 |
| 6 | 纯逻辑分层 | ✅ `workbench-model.ts` 为无副作用纯逻辑（归一化、禁用原因、模型 fallback 链、技能归一化） |
| 7 | 页面安全边界 | ✅ `WorkbenchCreatePage.vue` 无 `window.robothreeDesktop`/`ipcRenderer`/`node:fs`/`fetch`/`innerHTML`/敏感 payload，仅 `shortId` 的 `id.slice(-12)` 展示 |
| 8 | 版本升版 | ✅ Desktop `0.0.0-dfe.2a` |

---

## 三、发现

### P0 = 0，P1 = 0

### P2 = 1（非阻断，需产品确认）

**P2-1：智能授权「三模式」是可交互选择器，但 `authorizationMode` 不进入 `submitTurn`，用户选择无真实效果，且无「说明性 / 未接入」标注。**

- 现象：`workbench-model.ts` 定义 `WorkbenchAuthorizationMode`（`ask_each_time / workspace_scoped / manual_review`），
  `WorkbenchCreatePage.vue` 渲染为三个可点击 button（带 `aria-pressed` 与选中态）；但
  `submitTask()`（L348-358）**不把 `authorizationMode` 传给 `submitTurn`**，且
  `packages/contracts/.../submit-turn.ts` 的 `TaskSelectionRequest` **不含 `authorizationMode` 字段**（已核实）。
- 影响：用户选择「手动复核」或「智能确认」后，提交时该选择被静默丢弃，不改变任何真实执行行为；
  UI 又未标注「该授权方式为说明性展示，真实授权语义待 Feature Spec 冻结后接入」。
- 定性：计划 §DFE-2A 写的是「智能授权三模式**说明**」，且 §8 明确「Mock 与真实 Projection 清晰分层」。
  当前实现把「说明性」做成了「可交互但无后端语义」的选择器，属于「把未接入的能力伪装成可配置」，
  会误导用户以为授权模式是真实生效的产品能力。真实授权语义目前仅由
  `workspace.accessMode`（`read / read_write`）+ `workspaceGrantId` 承载。
- 建议：二选一——
  1. UI 明确降级为说明性展示（三模式带「未接入/说明性」标识，禁用选择或仅展示文案）；
  2. 若产品要求三模式真实生效，则需先冻结智能授权 Feature Spec，并在 Contract 的
     `TaskSelectionRequest` 增加受控的 authorization 字段后，再由 Core 消费——在此之前不得静默丢弃。

### P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 1（智能授权三模式无后端语义且未标注说明性），P3 = 0
```

DFE-2A 正确完成工作台与任务创建体验：关闭 DFE-1B 遗留 P3、`workbench-adapter` 作为唯一新 API 触点
包装现有高层 API、`workbench-model` 保持纯逻辑、`submitTurn` 仍走高层语义不拆内部步骤、页面无敏感
字段与越界、版本升到 `0.0.0-dfe.2a`。`CI=true pnpm run check` 172 files / 1191 tests + 3 smoke 独立
复跑通过，无生产边界漂移。

**DFE-2A 可进入用户接受流程，但建议先就 P2-1（三模式授权的产品定位）做一次决策**：是降级为说明性
展示，还是等待智能授权 Feature Spec 冻结后真实接入。DFE-2B 保持 GATED。

— Claude Code（独立 QA，只读）
