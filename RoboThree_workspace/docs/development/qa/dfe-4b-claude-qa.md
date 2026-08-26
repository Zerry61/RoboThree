# DFE-4B — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-18-0949-version-dfe-4b` |
| 验收对象 | DFE-4B：机器人与技能创建助手（本地草稿流程，静态/GATED） |
| 日期 | 2026-08-18 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / Electron 43 / Vite 8 / Vue 3.5 |
| 开发版本 | Desktop `0.0.0-dfe.4b`；Core/Contracts `0.0.0-dfi.2a.1`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **FAIL**：TypeScript 编译错误（`create-desktop-private-runtime.ts` 多处 `TS2740`） |

失败原因：`SqliteTaskPersistence` 缺少 `TaskPersistence` 接口新增的 6 个方法：

```text
commitAuthorizationAwareSubmitTurnTaskBundle
loadAuthorizationAwareSubmitTurnTaskBundle
loadTaskAuthorizationSelection
loadTaskExecutionSelectionIdentity
loadTaskAuthorizationMaterializationSnapshot
commitTaskAuthorizationMaterialization
```

---

## 二、发现

### P1 = 2（阻断关闭）

**P1-1：DFI-2A.2 未授权就改了 `TaskPersistence` Port 与 `InMemoryTaskPersistence`，留下半成品边界漂移。**

- `services/core/src/ports/task-persistence.ts`（mtime Aug 18 09:46）已新增上述 6 个
  authorization-aware 方法，这正是 **DFI-2A.2 方案 §6（Persistence Port）的内容**；
- 但 DFI-2A.2 当前状态为「PLAN REVIEW ONLY / CODING GATED」，DEVELOPMENT-LOG 明确
  「DFI-2A.2 只进入详细方案评审」，**用户未授权任何 DFI-2A.2 编码**；
- `InMemoryTaskPersistence` 已实现这 6 个方法，而 `SqliteTaskPersistence` 完全未实现（6 方法全部
  0 命中）——这是未授权的半成品，导致编译断裂。

**P1-2：全量门禁 `check` 编译失败，与 Codex 声称「190 files / 1265 tests + 3 smoke PASS」不符。**

- 独立复跑得到 `TS2740: Type 'SqliteTaskPersistence' is missing the following properties...`，
  编译在 `create-desktop-private-runtime.ts` 组装根失败；
- 说明 Codex 声称「全过」时，这些 DFI-2A.2 半成品 Port 改动尚未引入，或未在完整干净环境复跑。

### P0 = 0，P2 = 0，P3 = 0

---

## 三、DFE-4B 本身实现的核查（与上述 P1 分开评价）

DFE-4B 的前端创建页实现本身是达标的：

- ✅ 新增 `#/intelligence/create-robot` / `#/intelligence/create-skill`，创建页无 `submitTurn` /
  `createRobot` / `saveRobot` / `publishSkill` / `保存成功` / `发布成功` 调用；
- ✅ 测试/发布入口全部 `disabled`（表单页「保存并测试/提交发布」、技能详情「运行测试/提交发布」），
  创建技能对话页（本地预览）不展示测试/发布入口；
- ✅ `intelligence-creation-model.ts` 为纯逻辑（头像、四类能力开关、表单校验、技能对话构造、
  草稿测试结果 stale 失效）；
- ✅ 创建页明确「本地草稿预览，真实保存/测试/发布等待 Feature Spec」，不伪装真实任务/保存成功；
- ✅ `window.robothreeDesktop` 未新增触点（仍仅 4 处既有 adapter + legacy）。

---

## 四、结论

```text
INDEPENDENT_QA_FAIL — 阻断关闭
P0 = 0，P1 = 2，P2 = 0，P3 = 0
```

DFE-4B 前端创建页实现本身达标，但**全量门禁编译失败**，失败根因是 **DFI-2A.2 未授权就修改了
`TaskPersistence` Port 与 `InMemoryTaskPersistence`、而 `SqliteTaskPersistence` 未实现**，留下半成品
边界漂移。这与 DFE-3A 时期「DFI-1 未授权抢跑」属同一模式。

**处置建议**：

1. 回退/隔离未授权的 DFI-2A.2 Port 与 InMemory 改动（`task-persistence.ts` 6 方法、
   `task-authorization-selection-record.ts`、InMemory 相关实现），使 Core 回到 `0.0.0-dfi.2a.1`
   干净状态；
2. 修复后复跑 `CI=true pnpm run check`，确认回到 190 files / 1265 tests + 3 smoke 全绿；
3. DFE-4B 只有在「干净无 DFI-2A.2 半成品 + check 全绿」前提下才能重新进入独立 QA；
4. DFI-2A.2 的 Port/Persistence 编码，待用户单独授权 DFI-2A.2 后走正式流程，并完整实现
   InMemory + SQLite 两个 Adapter。

**DFE-4B 不关闭，DFE-5～DFE-6 与 DFI-2～DFI-4 保持 GATED。**

— Claude Code（独立 QA，只读）

---

## 附：DFE-4B P1 Repair 复测（RUN_ID `2026-08-18-1119`，`-retest-1`）

### 复测结果

| # | 核查项 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 190 files / 1265 tests + 3 smoke（独立复跑全绿，无 TS2740） |
| 2 | `task-persistence.ts` 回退 | **零命中**（authorization-aware 方法已移除，Port 干净） |
| 3 | migration 编号 | ✅ 最大 `21`（未升 22） |
| 4 | 未授权文件删除 | ✅ `legacy-task-authorization-selection-materializer.ts` / `task-authorization-selection-record.ts` / `dfi-2a2` conformance test 均已删除 |
| 5 | DFI-2A.2 残留全局扫描 | **零命中**（services/core/src+tests、packages/contracts/src+tests） |

### 复测结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING（复测）
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

上一轮 P1-1（DFI-2A.2 未授权 Port/InMemory 半成品）与 P1-2（check 编译失败）均已关闭：未授权
persistence 方法回退、半成品实现清理、migration 保持 21、未授权文件删除、全局扫描零命中，
`check` 独立复跑回到 190/1265 + 3 smoke 全绿。DFE-4B 前端创建页（上轮已核实：无 submitTurn、测试/发布
禁用、纯逻辑、本地草稿预览）保持不变。

**DFE-4B 可进入用户接受流程。DFE-5～DFE-6 与 DFI-2～DFI-4 保持 GATED。**

— Claude Code（独立 QA，只读）
