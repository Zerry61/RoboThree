# WFW-3 repair.2 实施报告

> 版本：`0.0.0-wfw.3-repair.2`  
> 日期：2026-08-31  
> 状态：`PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED`  
> 父批：`WFW-3 MACOS E2E PASS / WINDOWS NTFS GATE PENDING / NOT CLOSED`

## 1. 实施结论

repair.2 严格只修复两项已评审差异：

1. Replace authority 改由 source Task 的 durable readable Runtime Selection 提供 exact WorkspaceGrant；
2. packaged file Renderer 与 Main-owned tokenized IPv4 loopback APV iframe 获得双向最小 CSP 授权。

最高结论为：

```text
WFW3_REPAIR2_DURABLE_REPLACE_AND_LOOPBACK_PREVIEW_CONFORMANT
```

父 WFW-3 的 macOS 真实 Electron 链路已经恢复并通过，但 Windows 11 本地 NTFS 门禁尚未执行，因此父批不关闭。

## 2. Step B1 先行实测

在修改生产 CSP 前，使用 Electron 43 packaged `loadFile()` parent 与随机 IPv4 loopback child 验证：

```json
{
  "status": "PASS",
  "rendererFrameSrcAccepted": true,
  "apvFrameAncestorsFileAccepted": true,
  "realDocumentLoaded": true,
  "sandboxed": true,
  "noReferrer": true,
  "cspErrorCount": 0
}
```

因此无需扩大为 `http:`、`*`、移除 `frame-ancestors` 或改造 preview transport。

## 3. 代码差异

### 3.1 Durable authority

- source WFW Step 仍只保存模型可见 payload，不加入 `workspaceGrantId`；
- 对存在 exact WFW succeeded Step 与 relative path 的 source Task，读取
  `loadReadableTaskRuntimeSelection(sourceTaskId)`；
- selection 缺失/无 grant 以既有 `workspace_text.artifact_head_mismatch` fail-closed；
- grant 不同不进入候选；grant 相同后继续执行既有 Artifact projection、lifecycle、capability lock、terminal head 与
  `robothree.wfw-owned-artifact-proof.v1` proof 检查。

### 3.2 双向 CSP

- Renderer：只新增 `frame-src http://127.0.0.1:*`；
- APV response：只把 `frame-ancestors 'none'` 改为 `frame-ancestors file:`；
- `default/script/connect/img/media/font/style/object/base/form-action` 等 APV-1C 限制保持；
- iframe 的 `sandbox=""` 与 `referrerpolicy="no-referrer"` 保持。

### 3.3 E2E real-load proof

- 使用现有 WFW-3 Electron driver；
- 通过 Electron debugger 的 child iframe target 验证真实 document URL 与非敏感 sentinel，而非只查 iframe DOM；
- E2E 输出只记录 `htmlPreviewDocumentLoaded` 与 `previewDocumentLoadedAfterRestart` 布尔值；
- 显式 Workspace 场景真实点击侧栏“新建任务”，再选择 Workspace；驱动等待安全 display name，不读取或暴露真实路径。

## 4. 验证结果

| 门禁 | 结果 |
|---|---|
| repair.2 + WFW-2/Desktop focused regression | `13 files / 176 tests PASS` |
| authority focused | `1 file / 4 tests PASS` |
| Document Worker full | `26 files / 222 tests PASS` |
| Core/Desktop typecheck | PASS |
| focused ESLint | PASS |
| Desktop preload + renderer production build | PASS |
| DTP-4 packaging audit | PASS |
| DTP-4 audit self-test | `1 file / 2 tests PASS` |
| Core smoke | `core.ready` |
| `git diff --check` | PASS |
| macOS real Electron WFW-3 E2E | PASS |

真实 E2E 输出：

```text
status=PASS
outcome=WFW3_DESKTOP_TEXT_WRITE_E2E_CONFORMANT
defaultWorkspaceCreate=true
explicitWorkspaceCreate=true
htmlPreviewReady=true
htmlPreviewDocumentLoaded=true
markdownPreviewReady=true
replaceVerified=true
previousBackupVerified=true
artifactHeadCount=1
coreRestartedWithNewIdentity=true
previewReadyAfterRestart=true
previewDocumentLoadedAfterRestart=true
sandbox=true
contextIsolation=true
nodeIntegrationDisabled=true
```

## 5. 不漂移边界

- Root/Core/Desktop：`0.0.0-wfw.3-repair.2`；
- Document Worker：`0.0.0-wfw.2`；Contracts/Admin：`0.0.0-mvp.rsl.1`；
- lockfile SHA-256：`5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
- Core migration max：26；
- 无 public Contract、IPC、Preload API、migration、依赖、状态机、错误码或 Evidence schema 变化；
- 未把 task/root/path/grant/proof/token/HTML 正文投影到 Renderer-safe response、日志或 E2E 输出。

## 6. 独立 QA 与未关闭事项

- 独立 QA：`CODE_QA_PASS`，P0/P1/P2=0，P3=1（外部 blocker，不归因本批）；用户已正式接受并关闭 repair.2；
- Developer `13 files / 176 tests` 与独立 QA `13 files / 179 tests` 的差异来自 QA 超集，作为精度记录保留；
- 父 WFW-3 仍需真实 Windows 11 本地 NTFS create、replace、`.prev`、Artifact 与 Core restart 门禁；
- WFW-H1 强 CAS、父目录创建与完整平台矩阵继续 GATED。
