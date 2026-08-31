# WFW-3 实施停手报告

## 结论

```text
IMPLEMENTATION PAUSED / FOCUSED REPAIR REVIEW REQUIRED
Renderer implementation: PASS
macOS real Electron path: REACHED HTML PREVIEW ROUTING
Production scope expansion: NOT PERFORMED
```

WFW-3 已完成 Renderer 业务投影、安全预览消费和 focused tests，但真实 Electron E2E 证明现有 Main HTML preview
routing 无法消费 Task-generated WFW HTML Artifact。继续完成闭环必须修改
`apps/desktop/src/main/desktop-ipc-router.ts` 的生产路由，触发 WFW-3 方案 §2.2 停手条件。

本轮没有修改 Core、Main、Preload、Document Worker 或 Contract 生产代码，也没有用 Renderer 直读、fixture 假成功、
`v-html`、`file://` 或 IPC 绕过掩盖缺口。

## 已完成且验证通过

### Renderer

- Workbench 只消费 `activeTaskDetail.toolActivities`，并 exact 匹配
  `operationType === "tool.workspace.file.write_text"`；
- activity 按 `updatedAt`、`activityId` 稳定排序，覆盖既有八态与无路径安全文案；
- 成果面板按 Artifact `kind` 路由：HTML 使用既有 sandbox preview，Markdown/Text 使用既有 inert blocks，其他类型继续
  `openArtifactLocation`；
- HTML iframe 保持 empty sandbox、`referrerpolicy="no-referrer"`，Markdown/Text 不使用动态 HTML 注入；
- 切换 Artifact、关闭成果面板、路由切换与组件卸载均关闭 preview session。

### 聚焦门禁

```text
WFW-3 Renderer focused: 2 files / 43 tests PASS
Desktop typecheck: PASS
Root build (TypeScript + Preload + Renderer): PASS
Focused ESLint: 0 errors
git diff --check: PASS
```

## 真实 Electron 精确失败链

受控 macOS Electron 路径已证明：

1. real Electron Main、production Preload、real Core child 与 real Document Worker child 启动；
2. 未显式选择 Workspace，Main 通过既有 default Workspace provider 绑定隔离目录；
3. Gateway request 已 exact 锁定 `tool.workspace.file.write_text`；
4. 模型 Tool Call 成功，Task 完成，`index.html` 在 default Workspace 以 exact UTF-8 内容真实落盘；
5. Task detail 投影出 `kind=html` 的 WFW Artifact，Workbench 显示“文件已生成”；
6. 用户点击“打开”，Renderer 正确调用既有 `startArtifactHtmlPreview`；
7. Main `#startWorkspaceHtmlPreview` 对 `source.value.taskId !== undefined` 直接返回 `undefined`；
8. PPTX preview 分支不匹配 `.html`；
9. fallback Core text preview 无文件正文可用，最终安全错误归一为 `task.not_found`；
10. Renderer 诚实显示“成果预览暂时不可用”，没有伪造成功。

实测最终安全诊断：

```text
wfw3_html_preview_html_error_task_not_found
```

## 根因边界

现有 Main 路由把 Workspace HTML preview 限定为 manual Workspace Artifact：

```text
resolveArtifactFileSource(...) succeeds
AND source.value.taskId === undefined
```

WFW-2 Artifact 是合法 Task-generated Workspace Artifact，必然携带 `taskId`。Core 已能从 durable Task、Artifact、
Runtime Selection 与 active WorkspaceGrant 解析受控文件来源；缺口只在 Main preview routing 将该合法来源排除。

## 未完成项

- owned replace、`.prev`、Core SIGKILL/reopen、显式 Workspace no-fallback 尚未继续执行，因为主 E2E 在首个 HTML preview
  阻塞后按方案停手；
- uncertain 真实呈现与资源归零只能在同一 E2E 恢复后继续验证；
- Windows 11 本地 NTFS 门禁尚未执行，仍为 `WINDOWS_NTFS_GATE_PENDING`；
- 不输出 `WFW3_DESKTOP_TEXT_WRITE_E2E_CONFORMANT`，WFW-3 不得标记 `PASS/CLOSED`。

## 下一步

先评审并单独授权
[WFW-3 repair.1](./WFW-3-repair.1-TASK-GENERATED-WORKSPACE-HTML-PREVIEW-AUTHORITY-DEVELOPMENT-PLAN.md)。
repair 只允许收窄修改 Main 现有 HTML preview source-authority routing 及 focused tests；通过后恢复同一 WFW-3 E2E，
不得建立第二套 preview、Artifact 或文件读取系统。
