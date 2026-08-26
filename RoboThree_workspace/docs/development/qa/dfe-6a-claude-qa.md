# DFE-6A — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-21-1335-version-dfe-6a` |
| 验收对象 | DFE-6A：Workspace Files 真实数据收敛（消费 DFI-1B v1alpha2 sidecar） |
| 日期 | 2026-08-21 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 |
| 开发版本 | Desktop `0.0.0-dfe.6a`；Core/Contracts `0.0.0-dfi.4a.1`（并行编码中）；Central/Document Worker 不变 |

> 环境说明：`env -u ELECTRON_RUN_AS_NODE` 清除 QA shell 变量；Node 24.13.0。本次完整 check 无 loopback
> EPERM；提交时声明「check 失败来自 DFI-4A.1 lint」，但独立复跑时 DFI-4A.1 后端已修复 lint，完整 check 全绿。

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFE-6A focused（adapter/model/page/boundary 4 个测试文件） | **PASS 4 files / 21 tests** |
| 2 | `CI=true pnpm --filter @robothree/desktop build` | **PASS** |
| 3 | `CI=true pnpm exec eslint apps/desktop/src/renderer apps/desktop/tests` | **PASS**（无错误） |
| 4 | `CI=true node scripts/check-boundaries.mjs` | **PASS**，`Architecture boundary checks passed` |
| 5 | `CI=true pnpm run lint`（完整） | **PASS**（DFI-4A.1 lint 已修复） |
| 6 | `CI=true pnpm run check`（完整） | **PASS 207 files / 1378 tests + 3 smoke 全绿** |

---

## 二、重点核查项（方案 §3-§14 + 用户指定 QA 重点）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | adapter 不直连页面 | ✅ [task-workspace-adapter.ts](apps/desktop/src/renderer/adapters/task-workspace-adapter.ts) 经 `taskWorkspaceAdapterKey` InjectionKey 注入；`getDesktopApi()` 只在 adapter 内部访问 `window.robothreeDesktopV1Alpha2`，页面不直连 |
| 2 | listEntries/openLocation 输入严格分离 | ✅ `listEntries` 只发 `type + taskId + parentEntryId? + cursor? + limit?`（60-69 行）；`openTaskWorkspaceLocation` 只发 `type + taskId`（72-79 行）；测试断言 reveal 调用不含 entryId/cursor/workspaceGrantId/path |
| 3 | symlink 不导航 | ✅ `navigable = entry.kind === "directory" && entry.navigable`（model 59 行）；页面 `openWorkspaceDirectory` 首行 `if (!entry.navigable) return`（TasksListPage 1494 行） |
| 4 | late response 丢弃 | ✅ 每个 await 后 `isCurrentWorkspaceResponse(sequence, taskId)` 检查（1530/1557/1618/1630 行）；`workspaceRequestSequence` 计数（948 行）+ task 切换递增（1464 行） |
| 5 | stale cursor 一次刷新 | ✅ `workspace.browser_cursor_stale` 且 `!staleRefreshUsed` 才刷新，`staleRefreshUsed = true`（1542-1547 行），不无限重试 |
| 6 | runtimeInstanceId 变化重新协商 | ✅ negotiate 后检查 runtimeInstanceId 变化（1596-1597 行），变化则丢弃旧状态重新协商 |
| 7 | 固定占位文案删除 | ✅ 全 renderer grep「项目根目录 / 成果输出目录 / 最近引用文件 / 固定占位」零命中 |
| 8 | 敏感字段零泄漏 | ✅ `presentEntry` 只输出 displayName/kind/navigable/sizeBytes/modifiedAt/unavailableReason 安全文案；测试断言 view 不含 workspaceRoot/rootRealPath/authority/Credential；`unavailableReason` 映射固定文案（presentUnavailableReason） |
| 9 | breadcrumb 不从名称反推路径 | ✅ trail 数组用 parentEntryId stack（1470/1493-1515 行），不从 displayName 计算路径 |
| 10 | 边界零漂移 | ✅ 本批只改 `apps/desktop/src/renderer/**` + `apps/desktop/tests/**` + 收口文件；未改 Main/Preload/shared/packages/services；`pnpm-lock.yaml`/根 package.json/根 tsconfig.json 未改 |
| 11 | 测试断言真实性 | ✅ 反查无空断言/恒真断言/`it.skip`/被注释；覆盖 negotiate、输入分离、feature 缺失真实 Unavailable、symlink/file/directory 展示、typed error 映射 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFE-6A 正确完成 Workspace Files 真实数据收敛：Renderer-only v1alpha2 sidecar adapter（InjectionKey 注入、
页面不直连 window）；`listWorkspaceEntries` 与 `openTaskWorkspaceLocation` 输入严格分离（reveal 只 taskId、
不接收 entryId）；symlink 永不导航、breadcrumb 不从名称反推路径、late response 经 sequence+taskId 丢弃、
stale cursor 只刷新一次、runtimeInstanceId 变化重新协商、固定占位文案删除、敏感字段零泄漏。六项门禁独立
串行复跑全绿（focused 4/21、build、renderer eslint、boundary、完整 lint、完整 check 207/1378 + 3 smoke）。
提交时声明的「check 失败来自 DFI-4A.1 lint」在独立复跑时已修复，完整 check 全绿。

**DFE-6A 可进入用户接受流程。DFE-6B、DFI-2B/3/4A、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
