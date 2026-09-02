# WTE-1 Workspace Text Read / Continuous Edit Implementation Report

> 状态：`IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT CODE QA PASS / USER ACCEPTANCE PENDING / WINDOWS NTFS GATE PENDING`
> 版本：`0.0.0-mvp.wte.1`  
> 待验收 outcome：`WTE1_WORKSPACE_TEXT_READ_CONTINUOUS_EDIT_E2E_CONFORMANT`

## 1. 实施结果

WTE-1 已完成 Desktop MVP 的工作区文本读取与连续编辑生产接线。用户明确选择 Workspace 并点名 `notes.md` 后，真实 Electron 链路会调用 `read_text`，将磁盘完整内容作为 exact Tool Result 发送到下一轮模型请求，再通过 WFW `replace_existing` 完成 SHA-256 校验、原子替换、`.prev`、Artifact 与 Markdown preview。Core 被 `SIGKILL` 后，新 runtime 可从 SQLite 恢复 Task/Artifact 并重新预览。

## 2. 生产改动

### 2.1 Document Worker

- 新增 `text-file-read.ts` 与 `TEXT_FILE_READ_CAPABILITY_ID`；
- 256 KiB hard limit、strict UTF-8、NUL 拒绝；
- containment、realpath、symlink、hard-link、普通文件与路径深度校验；
- read 前后 stable stat，最多一次内部重读；
- 协议/router/index 接入，读写继续共享一个 Worker child 与 single-flight。

### 2.2 Core

- 新增 read capability definition/binding/descriptor，复用现有 Registry 与 Document Worker backend；
- 将 read/write 同时纳入 internal-trial general Agent entitlement/tool locks；
- 从 durable Task step/observation 派生 private Edit Read Proof；
- replace 必须匹配当前 user turn 的 exact read SHA-256，冲突后必须产生更新的 read；
- 同一路径累计第二个 `content_changed` 时立即终止当前 Attempt；
- exact read Tool Result 可按 64 KiB 字符块传输，Context reducer 无分隔符重组，防止正文被插入换行；
- `WorkspaceTextRoundOutputMaterialResolver` 把当前 exact read 内容接到 CTX-MVP-1 material-aware max output admission；
- Platform instruction 明确 read-before-write、首次冲突 reread、不得复用旧正文。

### 2.3 Desktop

- Workbench 附件 allowlist 增加 Markdown、Text、HTML/CSS/JS/TS/JSON/YAML/XML/CSV 及常见代码文本类型；
- UI 只显示安全文件名、media type、relative path 与 read/write activity；
- 第二次冲突显示四个动作，不暴露 digest/root/grant/proof/Tool Result 正文；
- Task-generated Markdown/Text preview 复用 existing Core source authority 和 Main bounded stable read；
- 未新增 IPC 或 Preload API。

### 2.4 真实 E2E

新增 `scripts/run-wte1-electron.mjs`，复用 VS2/WFW 的单一真实 Electron driver。受控 Gateway 使用 exact 400K context/262144 output capability，仅作为工程 E2E，不冒充公网 Provider 校准。

实测结果：

```json
{
  "status": "PASS",
  "outcome": "WTE1_WORKSPACE_TEXT_READ_CONTINUOUS_EDIT_E2E_CONFORMANT",
  "realElectronMain": true,
  "productionPreload": true,
  "realRendererWorkbench": true,
  "realMainIpc": true,
  "realCoreChild": true,
  "exactReadResultInModelRequest": true,
  "textReadActivityCount": 1,
  "textWriteActivityCount": 1,
  "replacementVerified": true,
  "previousBackupVerified": true,
  "logicalArtifactHeadCount": 1,
  "markdownPreviewReady": true,
  "previewReadyAfterRestart": true,
  "coreRestartedWithNewIdentity": true,
  "sigkillObserved": true,
  "gatewayRequestCount": 3,
  "sandbox": true,
  "contextIsolation": true,
  "nodeIntegrationDisabled": true
}
```

## 3. 冲突语义

- 第一次 exact `workspace.file.content_changed`：failed Tool step 被持久化，但 Run/Task 保持 running，模型可重新读取一次；
- 更新后的 read proof 才能用于第二次 replace；
- 第二次 conflict：Task 立即进入 failed，系统不再多跑一轮模型；
- Workbench 的“基于最新版本重新处理”会创建新 Task/Attempt；
- `uncertain` 与普通 Tool failure 保持既有 terminal/manual-attention 语义，不自动重写。

## 4. 安全与诚实边界

- Agent 自行发现而用户未点名的路径当前直接 `workspace.file.policy_denied`；没有用不可靠的 confirmation resume 冒充已确认；
- file content 只进入 trusted Worker/Core、durable conversation 与 locked Model request；
- Renderer/Main-safe response/Artifact metadata/普通日志不承载原文、绝对路径、WorkspaceGrant 或 proof；
- 没有新 Contract、migration、依赖、状态枚举、Evidence schema 或 lockfile 变化；
- 多文件操作复用既有逐 Tool effect，不宣称原子事务；
- 不支持非 UTF-8、分片编辑、Patch/Diff、文件监听或三方 Merge。

## 5. 版本与不漂移

- Root/Core/Desktop/Document Worker：`0.0.0-mvp.wte.1`；
- Contracts/Admin：保持 `0.0.0-mvp.rsl.2`；
- Central schema：保持 v13；
- Core migration max：保持 26；
- `pnpm-lock.yaml` SHA-256：`5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

## 6. 验证

- Document Worker full：`27 files / 244 tests PASS`；
- WTE/CTX/Core/Desktop focused 与 integration：`9 files / 116 tests PASS`；
- Document Tool/WFW/Renderer boundary regression：`5 files / 47 tests PASS`；
- 128 KiB-class exact read→replace、first rebase、Task/SQLite recovery regression：PASS；
- real macOS Electron E2E：PASS；
- Core/Desktop/Document Worker typecheck、root build、DTP-4 audit/self-test、Core smoke、focused ESLint、`git diff --check`：PASS。

## 7. 未完成门禁

- `INDEPENDENT_CODE_QA_PASS`；
- `USER_ACCEPTANCE_PENDING`；
- `WTE1_WINDOWS_NTFS_E2E_PENDING`；
- `REAL_PROVIDER_CALIBRATION_PENDING`。

其中 Windows 回归统一记录在 [`wfw/WFW-WINDOWS-NTFS-TARGETED-REGRESSION-NOTE.md`](./wfw/WFW-WINDOWS-NTFS-TARGETED-REGRESSION-NOTE.md)，不另建 WTE-1 重复待办。`REAL_PROVIDER_CALIBRATION_PENDING` 属 CTX/Provider 独立 P3，不阻塞 WTE-1 子批关闭判定。

因此本报告不声明 WTE-1 `PASS/CLOSED`，也不声明 production ready。
