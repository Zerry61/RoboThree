# DFE-3A — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-16-2139-version-dfe-3a` |
| 验收对象 | DFE-3A：任务详情与持续交互（持久对话、流式回复、状态指导、步骤、工具活动、确认卡片） |
| 日期 | 2026-08-16 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / Electron 43 / Vite 8 / Vue 3.5 |
| 开发版本 | Desktop `0.0.0-dfe.3a`；Root/Core `0.0.0-arh.3.3.3-repair.1`；Contracts `0.0.0-mar.1.0`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **FAIL**：177 files / 1207 tests，**1 file / 2 tests 失败** |

失败文件：`packages/contracts/tests/desktop-local-v1alpha2-workspace-browser-contracts.test.ts`（2 个测试）。

---

## 二、失败根因

```text
× accepts task-authorized lazy listing without path authority fields
  ZodError: taskId 不匹配 /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/（DesktopResourceIdSchema）
× requires cursor presence to match the truncated projection
  AssertionError: expected false to be true（projection 的 taskId 同样用了 UUID 格式被拒）
```

两个失败同源：**测试 fixture 的 `taskId` 用了 UUID 格式
（`019fa000-0000-7000-8000-000000000004`），而 `DesktopResourceIdSchema` 要求 `[a-z]` 开头的
资源 ID 格式（如 `task.xxx` / `workspace.grant-1`）。测试写错了 taskId fixture。

---

## 三、发现

### P1 = 2（阻断关闭）

**P1-1：DFI-1（Workspace Browser）的 v1alpha2 Contract 代码在未授权、未登记状态下混入本批。**

- `packages/contracts/src/desktop-local/v1alpha2/workspace-browser.ts`（mtime 21:31）、
  `packages/contracts/src/desktop-local/v1alpha2/common.ts`（21:29）、`index.ts`（21:29）新增了
  Workspace Browser 的 Contract Schema；
- 对应的 `desktop-local-v1alpha2-workspace-browser-contracts.test.ts`（mtime 21:37）也一并写入；
- 但 DFI 计划当前状态为「DFI-0 Revision 1 差异复核刚 PASS / DFI-1A～DFI-4 全部 GATED」，
  用户**未授权任何 DFI 编码批次**；
- `DEVELOPMENT-LOG.md` 中 **无任何 workspace-browser / DFI 相关条目**——这是未声明、未登记的
  边界漂移，直接违反了 DFI 计划 §13「未经用户明确授权，不进入任何 DFI 编码批次」。

**P1-2：全量门禁 `check` 失败，且与 Codex 声称的「176 files / 1203 tests 全过」不符。**

- Codex 自述 176/1203 全过，但独立复跑得到 177/1207（多出 workspace-browser 测试的 1 file /
  4 tests），其中 2 tests 失败；
- 失败根因为测试 fixture 的 `taskId` 格式错误（见第二节）；
- 说明 Codex 在声称「全过」之后又追加了 workspace-browser Contract 与测试，且该追加内容带病
  未过门禁。

### P0 = 0，P2 = 0，P3 = 0

---

## 四、DFE-3A 本身实现的核查（与上述 P1 分开评价）

DFE-3A 的任务详情实现本身是达标的：

- ✅ `task-detail-model.ts` 纯逻辑，复用 `presentDurableMessage` / `presentStreamingAssistant` /
  `presentTaskStatus` / `presentToolActivity` / `presentUserConfirmation` / `canShowConfirmationDecisionActions`；
- ✅ `tasks-adapter.ts` 复用现有高层 API（`loadConversationSnapshot` / `loadTaskDetail` /
  `controlTask` 五命令 / `onDesktopEvent`），无新增 IPC；
- ✅ 确认卡片只作用于 `confirmationId` + `requestDigest`，`decideUserConfirmation` 不构造权限语义；
- ✅ DFE-2B P3 收口：新任务页的重命名/停止/删除/补充输入/确认改用 `R3Modal`/`R3Input`/`R3Textarea`
  （`window.confirm`/`prompt` 仅残留在尚未迁移的 `legacy/LegacyWorkbench.ts`，符合预期）；
- ✅ 状态指导复用 `presentTaskStatus`（`manual_attention` → “需要人工处理”）；
- ✅ `window.robothreeDesktop` 仍仅 3 处（tasks/workbench adapter + legacy）。

---

## 五、结论

```text
INDEPENDENT_QA_FAIL — 阻断关闭
P0 = 0，P1 = 2，P2 = 0，P3 = 0
```

DFE-3A 的前端任务详情实现本身质量达标，但**全量门禁失败**（2 个 Contract 测试失败），且失败来自
**未授权、未登记的 DFI-1 Workspace Browser Contract 代码混入本批**。这是边界漂移 + 门禁失败的双重
P1。

**处置建议**：

1. 将 `workspace-browser.ts` 及其测试从当前工作区回退或隔离，使其不进入 DFE-3A 验收范围——
   因为 DFI-1 尚未获用户授权，任何 DFI 编码都不应存在；
2. 修复后重新串行复跑 `CI=true pnpm run check`，确认回到 176 files / 1203 tests + 3 smoke 全绿；
3. DFE-3A 只有在「干净无 DFI 混入 + check 全绿」的前提下才能重新进入独立 QA；
4. DFI-1A 的 Workspace Browser Contract 编码，待用户单独授权 DFI 后再走正式流程，并登记
   DEVELOPMENT-LOG。

**DFE-3A 不关闭，DFE-3B～DFE-6 保持 GATED，DFI 全部编码批次保持 GATED。**

— Claude Code（独立 QA，只读）

---

## 附：DFE-3A P1 Repair 复测（RUN_ID `2026-08-16-2157`，`-retest-1`）

### 复测结果

| # | 核查项 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 176 files / 1203 tests + 3 smoke（独立复跑全绿） |
| 2 | workspace-browser 残留扫描 | **零命中**：`packages/contracts/src` / `tests` / `services/core/src` 及 `dist` 中 `workspace-browser` / `list_workspace_entries` 均无残留 |
| 3 | DFI 导出移除 | ✅ `Contracts/Core` 无 DFI workspace-browser 导出 |
| 4 | 状态 | ✅ DEVELOPMENT-LOG 已记录 P1 repair，DFE-3A = `P1_REPAIRED / READY_FOR_INDEPENDENT_QA_RETEST` |

### 复测结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING（复测）
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

上一轮 P1-1（未授权 DFI workspace-browser 代码混入）与 P1-2（check 失败 2 tests）均已关闭：
未授权代码/测试/fixture/dist 隔离干净，`check` 独立复跑回到 176/1203 + 3 smoke 全绿。DFE-3A 前端
任务详情实现（上轮已核实：纯逻辑、复用高层 API、确认只作用于 confirmationId+requestDigest、R3Modal
收口）保持不变。

**DFE-3A 可进入用户接受流程。DFE-3B～DFE-6 与 DFI 全部编码批次保持 GATED。**

— Claude Code（独立 QA，只读）
