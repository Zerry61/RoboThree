# DFE-6A Workspace Files Real Data Convergence Plan

> 状态：**PASS/CLOSED**  
> 日期：2026-08-21  
> 负责人：Codex 5.6  
> 上游：DFE-6.0 Revision 1 review PASS；DFI-1B PASS/CLOSED  
> 范围：Desktop Renderer 只消费既有 v1alpha2 Workspace Browser / Reveal 接口，优先替换 Task Detail 工作空间文件固定占位  
> 非目标：不新增 Contract、IPC、Main、Preload、Core、SQLite migration；不接 DFI-2B/DFI-3/DFI-4A；不进入 DFE-6B

## 1. 目标

DFE-6A 只做“现有接口真实数据收敛”的第一步：在 `#/tasks` 内嵌 Task Detail 右侧面板中，把当前固定工作空间文件占位替换为 DFI-1B 已验收的真实 Workspace Browser / Reveal 数据。

用户结果：

```text
打开任务
→ 切到右侧“工作空间文件”
→ 前端协商 v1alpha2 workspace browser/reveal features
→ 加载该 Task 锁定 Workspace 的根目录
→ 惰性进入单层目录
→ 通过 breadcrumb 返回上层
→ 分页加载更多
→ 点击“打开工作空间位置”只打开 Task 锁定的 Workspace 根位置
```

本批不实现文件级打开、文件正文预览、文件编辑、上传、删除、拖拽或路径展示。

## 2. 修改范围

允许修改：

```text
apps/desktop/src/renderer/**
apps/desktop/tests/**
```

前端代码和测试冻结后，才允许进入一次独占共享文件收口窗口更新：

```text
apps/desktop/package.json
CHANGELOG.md
docs/development/DEVELOPMENT-LOG.md
docs/development/frontend/DESKTOP-FRONTEND-DEVELOPMENT-PLAN.md
docs/development/frontend/FRONTEND-LIVING-SPEC.md
```

禁止修改：

```text
apps/desktop/src/main/**
apps/desktop/src/preload/**
apps/desktop/src/shared/**
packages/**
services/**
pnpm-lock.yaml
package.json
tsconfig.json
SQLite migration
DFI-4A.1 / DFI-4A.2～4A.4
DFI-2B / DFI-3
TGM
```

## 3. 真实接口与输入边界

### 3.1 Sidecar

DFE-6A 只消费已存在的：

```ts
window.robothreeDesktopV1Alpha2
```

成员：

```ts
getCompatibility(query)
listWorkspaceEntries(query)
openTaskWorkspaceLocation(command)
```

页面不得直接调用 `window.robothreeDesktopV1Alpha2`；必须通过 Renderer Adapter 注入。

### 3.2 Feature negotiation

Feature 名称固定为：

```text
task_workspace_browser
task_workspace_reveal
```

Adapter 初始化或首次使用时调用 `getCompatibility`，必须检查：

- `selectedContractVersion === "v1alpha2"`；
- `features` 包含所需 feature；
- `runtimeInstanceId` 存在且与当前缓存一致；
- Core restart 后 `runtimeInstanceId` 变化时，丢弃旧 compatibility、旧目录 projection、旧 cursor 和旧 in-flight 响应，重新协商。

如果缺少 `task_workspace_browser`，工作空间文件树显示真实 `Unavailable`，不得恢复固定假文件列表。

如果缺少 `task_workspace_reveal`，目录树仍可展示；“打开工作空间位置”按钮禁用并显示持续可见原因。

### 3.3 listWorkspaceEntries Query

`listWorkspaceEntries` 只能发送：

```ts
{
  contractVersion: "v1alpha2",
  queryId,
  correlationId,
  clientInstanceId,
  type: "list_workspace_entries",
  taskId,
  parentEntryId?,
  cursor?,
  limit?
}
```

冻结：

- 根目录加载：只发送 `taskId` 和 `limit`；
- 进入目录：发送 `taskId + parentEntryId + limit`；
- 分页：发送 `taskId + parentEntryId? + cursor + limit`；
- `parentEntryId` 必须来自上一轮 `WorkspaceDirectoryProjection.entries[].entryId`；
- `cursor` 必须来自上一轮 `nextCursor`；
- Renderer 不制造、解析或持久化 `entryId/cursor`；
- Renderer 不发送 `workspaceGrantId`、路径、root、relativePath、glob、sort、filter 或 denylist。

### 3.4 openTaskWorkspaceLocation Command

`openTaskWorkspaceLocation` 只能发送：

```ts
{
  contractVersion: "v1alpha2",
  commandId,
  correlationId,
  clientInstanceId,
  type: "open_task_workspace_location",
  taskId
}
```

冻结：

- Reveal 只能打开 Task 锁定的 Workspace 位置；
- 不接收 `entryId`；
- 不打开文件级条目；
- 不打开当前 breadcrumb 目录；
- 不传 path、workspaceGrantId、root、relativePath 或 selection handle；
- 同一个按钮只表达“在系统文件管理器中打开当前任务工作空间位置”。

## 4. Adapter 与注入边界

新增或扩展 Renderer adapter：

```text
apps/desktop/src/renderer/adapters/task-workspace-adapter.ts
```

建议接口：

```ts
type TaskWorkspaceAdapter = {
  getWorkspaceCapability(): Promise<TaskWorkspaceCapability>;
  listWorkspaceEntries(input: {
    taskId: string;
    parentEntryId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<WorkspaceDirectoryProjection>;
  openTaskWorkspaceLocation(input: {
    taskId: string;
  }): Promise<TaskWorkspaceOpenReceipt>;
};
```

注入方式：

- 定义 `taskWorkspaceAdapterKey: InjectionKey<TaskWorkspaceAdapter>`；
- 默认 adapter 包装 `window.robothreeDesktopV1Alpha2`；
- 测试通过 Fake Adapter 注入；
- `TasksListPage.vue` 不直接访问 `window`；
- v1alpha1 `TasksAdapter` 不扩张 v1alpha2 方法，避免混淆。

## 5. ViewModel 与状态模型

新增纯逻辑模块：

```text
apps/desktop/src/renderer/pages/tasks/task-workspace-model.ts
```

建议状态：

```ts
type TaskWorkspacePanelState =
  | "idle"
  | "negotiating"
  | "loading"
  | "ready"
  | "empty"
  | "permission_denied"
  | "unavailable"
  | "error"
  | "partial";
```

目录状态至少包含：

- `taskId`；
- `runtimeInstanceId`；
- `parentEntryId?`；
- `breadcrumbDisplayNames`；
- `entries`；
- `nextCursor?`；
- `truncated`；
- `snapshotDigest`；
- `loadingMore`；
- `safeMessage`。

Renderer 只展示：

- `displayName`；
- `kind`；
- `navigable`；
- `sizeBytes?`；
- `modifiedAt?`；
- `unavailableReason?` 的安全文案。

Renderer 禁止展示：

- 完整路径；
- Workspace root；
- WorkspaceGrant authority；
- HMAC proof 内部结构；
- Credential；
- Core error 原文；
- shell/open result 原文。

## 6. Task 切换与 late response

当 `selectedTaskId` 变化时：

- 清理旧目录 projection；
- 清理旧 breadcrumb、cursor、error、loadingMore；
- 关闭旧 in-flight response 的写入通道；
- 新请求生成新的 local request sequence；
- 迟到响应如果 `taskId` 或 request sequence 不匹配，必须丢弃；
- 旧 task 的 `entryId/cursor` 不得复用到新 task；
- `runtimeInstanceId` 变化时，所有 task workspace 状态失效并重新协商。

DFE-6A 不需要实现 AbortController 传到底层 IPC；但必须做到 late response 不污染当前 UI。

## 7. 目录导航与分页

### 7.1 根目录

进入 workspace tab 或切换任务后：

```text
ensure compatibility
→ listWorkspaceEntries(taskId, limit)
→ render projection
```

### 7.2 单层惰性导航

点击 directory entry：

```text
entry.kind === "directory"
AND entry.navigable === true
→ listWorkspaceEntries(taskId, parentEntryId=entry.entryId, limit)
```

### 7.3 Breadcrumb

Breadcrumb 展示来自 `breadcrumbDisplayNames`，只作为用户定位文本。

DFE-6A 不从 breadcrumb 名称反推路径，不构造 parent path。若要返回上层，有两种允许实现：

- 保存当前 session 内已访问目录的 stack，返回时使用 stack 中的 previous `parentEntryId`；
- 或重新加载根目录。

不得从 display name 计算路径。

### 7.4 Cursor 分页

当 `truncated === true` 且 `nextCursor` 存在时显示“加载更多”。

分页请求：

```text
listWorkspaceEntries(taskId, same parentEntryId, cursor=nextCursor, limit)
```

返回 entries 追加到当前目录；如果返回 stale cursor typed error，则：

```text
清空当前 cursor
→ 用当前 parentEntryId 从第一页安全刷新
→ 显示“目录内容已变化，已刷新”
```

不得无限重试；同一次 stale cursor 只刷新一次。

## 8. Entry 展示规则

| kind | navigable | 展示 | 操作 |
| --- | --- | --- | --- |
| directory | true | 文件夹图标、名称、modifiedAt | 可进入 |
| file | false | 文件图标、名称、sizeBytes、modifiedAt | 不打开、不预览、不 reveal 文件 |
| symlink | false | 链接图标、名称、`unavailableReason` 安全文案 | 永不导航 |

规则：

- symlink 永不导航，即使 `displayName` 看起来像目录；
- `unavailableReason` 映射为固定用户文案，不原样展示未知内部错误；
- 文件条目不复用 Artifact preview，不读取文件内容；
- 目录为空显示 Empty；
- `truncated` 且无 `nextCursor` 不应出现；若出现按 `Partial/Error` 安全处理。

## 9. Reveal 行为

按钮文案建议：

```text
打开工作空间位置
```

行为：

```text
openTaskWorkspaceLocation(taskId)
```

成功：

- 显示 path-free success notice，例如“已请求系统文件管理器打开该任务的工作空间位置。”

失败：

- `contract.feature_unavailable`：显示 Unavailable，并禁用按钮；
- `workspace.reveal_outcome_uncertain`：显示“系统文件管理器响应不确定”，不自动重试；
- 其他 typed error：显示 safe summary；
- 不展示 path、root、shell 错误原文。

## 10. 页面状态矩阵

| 状态 | 触发 | UI | 禁止 |
| --- | --- | --- | --- |
| Loading | compatibility 或目录加载中 | skeleton / spinner + 安全文案 | 不显示旧 task 目录 |
| Empty | entries 为空 | “该目录暂无可展示条目” | 不恢复固定假文件 |
| Permission denied | typed permission/workspace selection invalid | 持续 notice + 禁用操作 | 不展示目录字段 |
| Unavailable | feature 缺失、Core 不支持、sidecar 不存在 | 真实不可用说明 | 不 fallback 到占位 |
| Error | typed error 或 adapter error | safe summary | 不 JSON.stringify(error) |
| Disabled | 无 selected task、任务详情未加载、reveal feature 缺失 | 禁用按钮 + 可见原因 | 不依赖 hover tooltip |
| Partial | entries 可展示但分页/刷新失败 | 保留已加载安全数据 + 局部错误 | 不自动循环重试 |

## 11. 视觉与可访问性

DFE-6A 只验收任务详情工作空间文件区域，不做五导航最终收口。

尺寸：

- `1180 x 760`：正式验收；
- `900 x 600`：正式验收；
- `680 x 560`：非承诺诊断尺寸，只检查是否出现严重横向滚动或重叠。

可访问性：

- workspace tab 有明确 label；
- 文件树使用 list/tree 语义之一，编码前选择一种并保持测试一致；
- directory entry 可键盘进入；
- file/symlink 不可导航时必须有可见原因或不可操作语义；
- breadcrumb 可键盘访问；
- “加载更多”和“打开工作空间位置”有稳定 accessible name；
- loading/error/unavailable 用页面内反馈，不只用 toast。

## 12. 测试计划

Focused tests：

- `task-workspace-adapter.test.ts`
  - 页面不直接调用 `window`；
  - compatibility feature negotiation；
  - Core restart / `runtimeInstanceId` 变化后重新协商；
  - `listWorkspaceEntries` 输入只含 query 字段；
  - `openTaskWorkspaceLocation` 输入只含 command 字段，不含 `entryId`。

- `task-workspace-model.test.ts`
  - root load；
  - directory navigation；
  - breadcrumb stack；
  - cursor pagination；
  - stale cursor 刷新一次；
  - symlink 永不导航；
  - unavailableReason 安全文案；
  - late response discard。

- `tasks-list-page.test.ts`
  - 右侧 workspace tab 不再显示固定占位；
  - feature unavailable 显示真实 Unavailable；
  - selected task 切换清理旧目录；
  - reveal 只传 taskId；
  - Loading / Empty / Permission denied / Unavailable / Error / Partial。

- `renderer-workbench-boundary.test.ts` 或新增 boundary test：
  - Renderer 不导入 `fs/net/http/tls/child_process/sqlite`；
  - DOM / serialized state 不含 `workspaceRoot/rootRealPath/selectedPath/workspaceGrantAuthority/credential/requestDigest`；
  - 不出现固定占位条目“项目根目录 / 成果输出目录 / 最近引用文件”。

验证命令：

```bash
pnpm --filter @robothree/desktop build
pnpm exec vitest run apps/desktop/tests/task-workspace-adapter.test.ts apps/desktop/tests/task-workspace-model.test.ts apps/desktop/tests/tasks-list-page.test.ts apps/desktop/tests/renderer-workbench-boundary.test.ts
pnpm run lint
pnpm run check
```

## 13. 视觉验收计划

使用 DFE-6A 的真实/fake adapter 场景截图：

- root loading；
- root empty；
- directory ready with file/directory/symlink；
- paginated directory；
- feature unavailable；
- permission denied；
- stale cursor refresh notice；
- reveal success / uncertain / unavailable。

尺寸：

- `1180 x 760`；
- `900 x 600`；
- `680 x 560` 诊断。

## 14. 安全扫描

编码后必须静态确认：

- `apps/desktop/src/renderer/**` 无新增 `fs`、`child_process`、`net`、`tls`、`http`、`https`、`sqlite`；
- 页面源码无 `rootRealPath`、`workspaceRoot`、`selectedPath`、`selectionHandle`、`authorityToken`、
  `credentialReference`、`secret` 值形态；
- `openTaskWorkspaceLocation` 调用点不传 `entryId`、`cursor`、`workspaceGrantId` 或 path；
- `listWorkspaceEntries` 调用点不传 path、root、workspaceGrantId；
- 固定占位文案从生产页面删除；
- Main/Preload/Core/Contracts/Central/SQLite migration 无改动。

## 15. 工期估算

DFE-6A 编码估算：1.5～2.5 个集中工程日。

- 0.25 天：Adapter 与 compatibility 设计落地；
- 0.5 天：ViewModel、目录导航、pagination、late response；
- 0.5 天：Task Detail 页面接入与占位删除；
- 0.25～0.5 天：focused tests、边界扫描；
- 0.25 天：视觉验收与共享文件收口。

不包含独立 QA、返工和用户现场验收。

## 16. 当前状态

```text
DFE-6.0: REVIEW PASS / USER DIRECTED NEXT STEP
DFE-6A: PASS/CLOSED
DFE-6B: PASS/CLOSED
DFI-2B / DFI-3 / DFI-4A: GATED
```

DFE-6A 编码、独立 QA 和用户接受均已完成；DFE-6B 也已实现、独立 QA PASS 并由用户接受关闭；不得自动进入任何 DFI/TGM 批次。
