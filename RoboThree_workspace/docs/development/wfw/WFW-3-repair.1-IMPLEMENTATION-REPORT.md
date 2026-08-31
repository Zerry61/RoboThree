# WFW-3 repair.1 — Task-generated Workspace HTML Preview Authority 实施报告

## 1. 结论

```text
PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED
WFW3_REPAIR1_TASK_GENERATED_HTML_PREVIEW_AUTHORITY_CONFORMANT
PARENT WFW-3 PAUSED
```

## 2. 生产改动

唯一生产改动位于 `apps/desktop/src/main/desktop-ipc-router.ts`：

- `#startWorkspaceHtmlPreview` 不再仅因 Core-authorized source 含 `taskId` 而拒绝；
- `resolveArtifactFileSource(artifactId)` 成功仍是必要条件；
- 继续复用 HTML allowlist、realpath containment、stable file identity/read、size limit 与 `HtmlPreviewSandbox`；
- `taskId`、workspace root、grant identity、authority path 与 HTML 正文不进入 Renderer-safe response。

repair.1 未修改 Core、Preload、Renderer production API、Document Worker、Contract、migration、依赖或 lockfile。

## 3. 聚焦验证

```text
Desktop preview focused: 4 files / 67 tests PASS
Desktop typecheck: PASS
Desktop preload/renderer build: PASS
git diff --check: PASS
pnpm-lock.yaml SHA-256: 5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31
```

focused proof 覆盖 Task-generated HTML 成功、manual Workspace HTML 回归、PPTX/non-HTML routing、source-authority
失败、路径 containment/file identity、sandbox 输出及私有 authority 不泄露。

## 4. 恢复父 E2E 的结果

同一真实 Electron WFW-3 driver 已恢复，证明：

- real Electron Main/Renderer/Core/Document Worker；
- default Workspace 真实创建 `index.html`；
- 文件字节与 WFW Artifact 投影真实存在；
- Main 已能为 Task-generated HTML 创建既有 APV preview session。

随后发现两个独立阻塞：

1. Replace 以 `workspace_text.artifact_head_mismatch` 失败，因为 WFW-2 authority 用
   `step.action.payload.workspaceGrantId` 过滤历史 durable Step，而 durable Step 有意只保留模型可见参数，不持久化该私有字段。
2. Chromium 以 `ERR_BLOCKED_BY_CSP` 阻止 APV iframe，因为 Renderer document CSP 未授权 tokenized loopback preview origin。

两项分别要求 Core 和 Renderer security-policy 改动，故未扩大 repair.1。Windows NTFS 尚未执行。

## 5. 版本与边界

- Root/Desktop：`0.0.0-wfw.3`；
- Core/Document Worker：`0.0.0-wfw.2`；
- Contracts/Admin：`0.0.0-mvp.rsl.1`；
- Core migration 仍止 26；
- 无依赖或 lockfile 变化；
- WFW-H1 与无关下游继续 GATED。

## 6. 独立 QA 与用户接受

Claude Code 独立聚焦代码 QA 实跑 repair.1 focused `4 files / 67 tests PASS`，并交叉确证 Replace authority 与 Renderer
CSP 两条剩余阻塞链；结论 `CODE_QA_PASS`，P0/P1/P2/P3 均为 0。用户已正式接受并关闭 repair.1。该关闭不改变父
WFW-3 `PAUSED` 或 Windows NTFS `PENDING` 状态。
