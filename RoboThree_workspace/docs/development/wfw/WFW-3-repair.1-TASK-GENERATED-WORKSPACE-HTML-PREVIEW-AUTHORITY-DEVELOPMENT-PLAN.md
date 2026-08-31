# WFW-3 repair.1 — Task-generated Workspace HTML Preview Authority 聚焦方案

## 0. 状态与目标

```text
PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED
```

目标只有一个：让既有 Main HTML preview routing 接受由 Core 已验证来源的 Task-generated Workspace HTML Artifact，
从而恢复 WFW-3 同一真实 Electron E2E。

本 repair 不新增产品能力，不改变 WFW Writer、Artifact、WorkspaceGrant 或 preview sandbox 的所有权模型。

## 1. 已证事实

- WFW Task、Tool execution、文件真实落盘与 Artifact 投影均已成功；
- Artifact `kind=html`，Renderer 已正确选择既有 HTML preview API；
- `resolveArtifactFileSource(artifactId)` 是既有 Core 私有 source-authority 入口，会验证 durable Artifact、Task、
  Runtime Selection 与 active WorkspaceGrant，并只向 Main 返回受控 `rootRealPath + relativePath`；
- Main `#startWorkspaceHtmlPreview` 当前只接受 `taskId === undefined`，所以合法 WFW Task Artifact 被排除；
- 最终错误为既有 `task.not_found` 安全映射，不是文件未生成或 Renderer 选择错误。

## 2. 允许修改

```text
apps/desktop/src/main/desktop-ipc-router.ts
apps/desktop/tests/**（仅 preview authority focused tests）
scripts/run-wfw3-*.mjs
docs/development/wfw/**
README.md / CHANGELOG.md / docs/development/DEVELOPMENT-LOG.md
package.json / apps/desktop/package.json（仅 repair 通过后的版本/命令）
```

## 3. 禁止事项

- 不修改 Core、Preload、Renderer production、Document Worker、Contract、migration、依赖或 lockfile；
- 不新增 IPC channel、Preload method、Artifact 字段、WorkspaceGrant 字段或错误码；
- 不把 `taskId`、root、grantId、绝对路径、proof 或正文暴露给 Renderer；
- 不允许 Main 根据扩展名自行发明文件 authority；必须先取得 Core `resolveArtifactFileSource` 的成功结果；
- 不允许 Renderer 直读文件、`file://` preview、`v-html`、fixture preview 或 fallback 打开任意路径；
- 不改变 PPTX preview、manual Workspace Artifact preview 或 non-HTML Artifact 行为；
- 不进入 WFW-H1、目录创建、通用 file read/edit/delete 或其他产品线。

## 4. 最小实现

### Step 1 — focused proof

用现有 Main router focused fixture 固定四种来源：

1. manual Workspace HTML Artifact：保持成功；
2. Task-generated WFW HTML Artifact：Core source authority 成功时允许进入现有 contained-file + stable-read + APV-1C sandbox；
3. Task-generated non-HTML Artifact：不进入 Workspace HTML branch；
4. source authority 失败、inactive grant、路径逃逸、文件漂移：保持既有 safe failure，绝不降级。

### Step 2 — 单点路由修复

只调整 `#startWorkspaceHtmlPreview` 对 Core 已验证 source 的分类条件：

- 不再以 `taskId !== undefined` 作为一票否决；
- 先要求 `resolveArtifactFileSource` 成功；
- 继续复用 `resolvePreviewableContainedFile` 的 HTML allowlist、realpath containment、size/identity 检查；
- 继续复用 `readStableFilePreview` 与 existing `HtmlPreviewSandbox`；
- `taskId` 只用于区分来源事实，不进入 Renderer 返回值或日志。

不复制 preview pipeline，不增加 WFW 专用 branch；manual 与 Task-generated Workspace HTML 共用同一安全实现。

### Step 3 — 恢复原 WFW-3 E2E

复跑同一 driver，继续完成：default create → HTML preview → owned replace → `.prev` → Core SIGKILL/reopen →
preview → explicit Workspace create/no-fallback → Markdown preview → resource cleanup。

Windows NTFS 仍是 WFW-3 最终 closure 的独立必要门禁，不由 repair.1 伪造。

## 5. 聚焦 QA

至少验证：

1. Core source authority failure 仍 fail-closed；
2. Task-generated HTML 成功进入 sandbox；
3. taskId/root/grant/path/content 不进入 Renderer-safe response；
4. manual HTML preview 零回归；
5. PPTX/non-HTML routing 零回归；
6. empty sandbox、CSP、no-referrer 保持；
7. WFW-3 Renderer focused tests 保持 PASS；
8. `git diff --check`、Desktop typecheck/build、DTP-4 audit PASS；
9. Contract/migration/依赖/lockfile 零漂移；
10. 同一真实 Electron WFW-3 E2E 恢复到后续步骤。

## 6. 停手条件

出现任一情况立即停手：

1. 需要修改 Core source authority 或 public Contract；
2. 需要新增 Main/Preload API；
3. 无法只依赖 Core 已验证 source 就区分安全来源；
4. 必须把绝对路径、grantId、proof、正文或 task 私有 identity 送入 Renderer；
5. 必须绕过 contained-file、stable identity 或 sandbox 检查；
6. 修复会改变 PPTX/manual/non-HTML 既有语义；
7. 需要新增依赖、migration、状态机或第二套 Artifact/preview 系统。

## 7. 接受边界

repair.1 最高只允许声明：

```text
WFW3_REPAIR1_TASK_GENERATED_HTML_PREVIEW_AUTHORITY_CONFORMANT
```

它不单独关闭 WFW-3，也不等于 Windows NTFS gate、WFW v1 stage closure 或 production ready。repair.1 通过后只恢复
父 WFW-3 的同一 E2E 与剩余门禁。

## 8. 实施结果

用户接受独立文档复核、吸收 P2/P3 focused proof 约束并单独授权编码后，实施只移除了 Main 对 `taskId` 的一票否决；
Core `resolveArtifactFileSource` 成功仍是前置条件，contained-file、stable-read 与 APV-1C sandbox 全部继续复用。

focused tests 已覆盖 Task-generated HTML、manual HTML、PPTX/non-HTML routing、source failure、containment 与
Renderer-safe response。repair.1 最高结论为：

```text
WFW3_REPAIR1_TASK_GENERATED_HTML_PREVIEW_AUTHORITY_CONFORMANT
```

恢复父真实 Electron E2E 后又发现两项不属于 repair.1 的阻塞：WFW-2 replace head authority 错从模型可见 durable
Step payload 读取私有 `workspaceGrantId`；Renderer 顶层 CSP 阻止 loopback APV iframe。详见
[恢复 E2E 停手报告](./WFW-3-REPAIR.1-RESUMED-E2E-STOP-REPORT.md)。

独立聚焦代码 QA 结论为 `CODE_QA_PASS`，P0/P1/P2/P3 均为 0；用户已正式接受并关闭 repair.1。父 WFW-3 继续
`PAUSED`，Windows NTFS 门禁继续 `PENDING`。两项剩余差异已收敛为
[WFW-3 repair.2 极小方案](./WFW-3-repair.2-DURABLE-REPLACE-AUTHORITY-AND-LOOPBACK-APV-CSP-DEVELOPMENT-PLAN.md)，
当前仅进入独立文档复核，不自动编码。
