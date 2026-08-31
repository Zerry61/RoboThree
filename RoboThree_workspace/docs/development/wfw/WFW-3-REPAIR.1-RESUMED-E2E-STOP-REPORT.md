# WFW-3 repair.1 — 恢复真实 Electron E2E 停手报告

## 1. 状态

```text
REPAIR.1 PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED
PARENT WFW-3 IMPLEMENTATION PAUSED
WINDOWS_NTFS_GATE_PENDING
```

repair.1 自身已完成。父 E2E 按授权恢复后命中两项不属于 repair.1 的生产边界。

## 2. 阻塞 A — durable Replace Artifact head authority

实测失败：

```text
workspace_text.artifact_head_mismatch
```

真实运行在同一 Session 中存在两个 Task 和一个成功 WFW create Observation。已创建文件摘要为：

```text
sha256:adce094cf9d864c1b5f205c00eb12b35af130d9aaf7716d0491c203586dbbc91
```

它与模型提交的 `expectedPreviousSha256` 完全一致，因此不是 stale content 或 fixture digest 错误。

失败链：

1. `buildWorkspaceTextToolExecution` 从当前 Task readable Runtime Selection 私有取得 active `workspaceGrantId`；
2. `deriveWorkspaceTextArtifactProof` 扫描同一 durable Session 的历史 Task；
3. 它使用 `step.action.payload.workspaceGrantId` 过滤成功历史 WFW Step；
4. `ensureDocumentToolStep` 有意只持久化模型可见 WFW 参数；私有 grant 后续才加入 execution Action，不存在于 durable Step；
5. 合法 create Observation 因而被排除，head 集合为空，Replace fail-closed。

正确修复方向：从每个 source Task 的 durable readable Runtime Selection 取得其 exact WorkspaceGrant authority，与当前
exact grant 和 relative path 比较，同时保留 ambiguity/deletion/capability-lock 全部检查。不得把私有 grant 复制进
模型可见 Action，不得弱化 ownership proof，也不得增加 public 字段。

该修复需要 Core production code，触发 repair.1 停手条件 #1。

## 3. 阻塞 B — Renderer CSP 阻止 APV iframe

Chromium 实测：

```text
ERR_BLOCKED_BY_CSP
```

repair.1 已成功创建既有 tokenized loopback APV preview URL，但 Renderer document CSP 没有 `frame-src`，其
`default-src 'self'` 拒绝随机 loopback HTTP origin。仅找到 iframe DOM 节点不能证明预览内容已加载。

正确修复方向：只为 existing Main-owned loopback APV iframe 增加最小显式 CSP 授权，同时保持 `sandbox=""`、
`referrerpolicy="no-referrer"`、APV-1C 自身 `default-src 'none'` / `script-src 'none'` / `connect-src 'none'`、
tokenized route、TTL 与 cleanup。focused real-load assertion 必须证明 inert HTML 实际渲染，而非只证明 DOM 节点存在。

该项改变 Renderer security boundary，编码前需要聚焦评审。

## 4. 未变化边界

- 无 public Contract、IPC、Preload method、migration、依赖、lockfile 或新状态机；
- 无 Renderer 直读、`file://`、`v-html` 或 fixture success；
- 不弱化 Workspace containment、stable read、Artifact ownership 或 replace proof；
- 不声明 Windows：真实 Windows 11 local NTFS create/replace/`.prev`/Artifact/Core restart 仍 pending；
- 不输出 WFW-3/WFW v1 closure outcome。

## 5. 建议下一步

已输出一个极小、明确只有两项差异的
[WFW-3 repair.2 方案](./WFW-3-repair.2-DURABLE-REPLACE-AUTHORITY-AND-LOOPBACK-APV-CSP-DEVELOPMENT-PLAN.md)：

1. Core durable WFW source-Task WorkspaceGrant authority 修正；
2. Renderer loopback APV iframe CSP 授权与真实 iframe-load proof。

方案需独立文档评审与用户单独授权；在此之前父 WFW-3 保持 paused，repair.2 不自动编码。
