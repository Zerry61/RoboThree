# WFW-3 Desktop Product E2E / Stage Closure 详细实施方案

> Owner: Codex 5.6  
> Date: 2026-08-31  
> Status: `IMPLEMENTATION COMPLETE / USER ACCEPTED / WINDOWS REGRESSION DEFERRED / STAGE NOT CLOSED`  
> Upstream: `WFW-0 Revision 1.1 PASS/CLOSED`、`WFW-1 PASS/CLOSED`、`WFW-2 PASS/CLOSED`  
> Canonical capability: `tool.workspace.file.write_text`

## 0. 结论与控制口径

WFW-3 只关闭普通 Desktop 用户尚未完成的最后一段产品闭环：用户在 Workbench 中让通用机器人生成或修改
HTML、Markdown、JSON、CSS、TXT 等 UTF-8 文本文件后，能够看到真实 Tool activity、看到 durable Artifact、
在既有安全预览中打开成果，并在 Core restart 后继续看到同一结果。

WFW-3 不新增文本写入能力。写入、replace authority、Effect recovery 与 Artifact projection 已分别由 WFW-1/WFW-2
完成并关闭。本批不再建设 Registry、Policy、EffectCoordinator、Artifact、WorkspaceGrant 或文件平台。

```text
WFW-1: PASS/CLOSED — private writer
WFW-2: PASS/CLOSED — Core activation/recovery/artifact
WFW-3: IMPLEMENTATION COMPLETE — repair.1/repair.2 PASS/CLOSED; Windows regression deferred
WFW-H1: GATED — deferred hardening
```

本方案评审通过不等于编码授权。未经用户单独授权，不修改 Renderer、测试、脚本、版本或治理文档。

2026-08-31：独立文档复核 `PASS WITH RISKS` 后用户已授权编码。P2 编码前约束已吸收：Workbench 只显示
`activeTaskDetail.toolActivities` 中 exact `tool.workspace.file.write_text`，并按 `updatedAt/activityId` 稳定排序。
真实 Electron E2E 随后命中 §2.2 停手条件；精确事实见
[WFW-3 实施停手报告](./WFW-3-IMPLEMENTATION-STOP-REPORT.md)。

2026-08-31：repair.1 文档复核获用户接受和编码授权，Main 最小 routing 修复及 focused tests 已 PASS。恢复同一真实
Electron E2E 后，Replace authority 与 Renderer CSP 再次命中停手边界；精确事实见
[repair.1 恢复 E2E 停手报告](./WFW-3-REPAIR.1-RESUMED-E2E-STOP-REPORT.md)。

2026-08-31：repair.1 独立代码 QA P0～P3 全 0，用户已正式接受并关闭。剩余两项差异已形成
[repair.2 极小方案](./WFW-3-repair.2-DURABLE-REPLACE-AUTHORITY-AND-LOOPBACK-APV-CSP-DEVELOPMENT-PLAN.md)：
source Task readable Runtime Selection authority 与 exact loopback APV frame CSP/real-load proof。repair.2 当前仅待文档复核，
未获编码授权；父 WFW-3 与 Windows NTFS 门禁状态不变。

2026-08-31：repair.2 后续已完成编码、macOS 真实 Electron E2E、独立代码 QA 与用户接受，正式 `PASS/CLOSED`。
用户确认 WFW 当前产品开发工作结束，后续可进入其他 MVP 任务；Windows 11 本地 NTFS 项转入定向回归 backlog，不再阻塞
后续开发排期，但在真实执行前仍不把父 WFW-3 标记为 `PASS/CLOSED` 或 production ready。回归清单见
[WFW Windows 11 / NTFS 定向回归说明](./WFW-WINDOWS-NTFS-TARGETED-REGRESSION-NOTE.md)。

### 0.1 用户闭环

1. 用户以普通方式启动 Desktop；
2. 用户不选择工作区时，提交“生成一个 HTML 页面”；Main 使用既有 `~/.robothree` 默认工作区授权；
3. 用户选择显式工作区时，后续写入只落到该 exact WorkspaceGrant，不回落默认目录；
4. `agent.general` 真实选择 `tool.workspace.file.write_text`；
5. Workbench 显示“正在创建文件 / 创建成功”等业务语言，不显示 capability、digest、root 或内部 proof；
6. 成果面板出现真实 HTML/Markdown/Text Artifact；
7. HTML 通过既有 APV-1C 沙箱预览，Markdown/Text 通过既有安全文本预览；
8. 在同一 Session 中要求修改由 WFW 创建的文件，Core 从 durable Artifact 推导 replace authority；
9. 新内容成为当前文件，`.prev` 保存 exact 旧内容，但 `.prev` 不成为第二个 Artifact；
10. Core restart 后 Tool Result、Artifact 与预览仍存在且不重复；
11. post-publication ambiguous 状态显示“需要人工处理”，不自动重复写入；
12. macOS 真实 Electron 与 Windows 本地 NTFS 最小门禁均通过后，WFW v1 才可关闭。

### 0.2 本批最高结论

本批最高只能输出：

```text
WFW3_DESKTOP_TEXT_WRITE_E2E_CONFORMANT
```

它不代表 production ready、完整文件平台、强 CAS、断电级 durability、网络盘/OneDrive/FAT/exFAT ready，
也不自动解锁 WFW-H1 或其他产品线。

## 1. 已核实事实基础

### 1.1 WFW-2 已关闭的能力

- `tool.workspace.file.write_text` 已进入 exact Registry/binding/`query_then_retry` descriptor；
- `agent.general` internal-trial entitlement 已精确包含 WFW，`agent.presentation` 仍为原四项 Document Tool；
- existing Document handle 与 WFW handle 共用一个 Document Worker child/PID/single-flight；
- create 使用 active WorkspaceGrant；replace 只接受同 Session 唯一 terminal WFW Artifact head；
- `safe_retry → not_found`、`recovered_success → stable Observation`、`unknown → uncertain` 已接既有 EffectCoordinator；
- 成功 Observation 已投影为 html/markdown/text Artifact；`.prev` 不投影第二 Artifact；
- WFW-2 独立 QA/re-QA 已由用户接受并 `PASS/CLOSED`。

### 1.2 Desktop 已存在的真实接缝

- `DefaultWorkspaceGrantProvider` 在 Main 内创建 `~/.robothree`，使用 `0700`、`realpath`、active/read-write grant，
  real path 不进入 Preload/Renderer；
- `desktop-v1alpha5-ipc-router` 在 SubmitTurn 未携带 workspaceGrantId 时调用 default provider；显式选择时保留 exact grant；
- frozen Desktop v1alpha1 API 已有 `previewArtifact`、`startArtifactHtmlPreview`、`closeArtifactPreview`、
  `openArtifactLocation` 与 `exportArtifact`；
- `DesktopTasksAdapter` 已消费上述方法，不需要新增 Preload API；
- `presentArtifactPreview` 已将 Markdown/文本投影为 inert blocks，并过滤 raw HTML、URL 与 event handler；
- `HtmlPreviewSandbox`/APV-1C 已提供隔离 HTML preview URL；
- Task 页已有完整 Artifact 文本/Markdown/HTML preview state，可作为行为参考；
- Workbench 成果面板当前已有 Artifact 列表，但“打开”只调用 `openArtifactLocation`，尚未在当前页面展示 preview；
- Workbench 当前未呈现 `activeTaskDetail.toolActivities`，需要最小业务投影；
- Tool activity 已有全状态 presentation：preparing、waiting_confirmation、running、completed、failed、cancelled、
  timed_out、uncertain/manual_attention。

### 1.3 冻结边界

- Root/Core/Document Worker 当前为 `0.0.0-wfw.2`；
- Desktop 当前为 `0.0.0-mvp.rsl.1-repair.1`；
- Contracts/Admin 当前为 `0.0.0-mvp.rsl.1`；
- Core migration max = 26；
- lockfile digest = `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
- public Contract、WFW-1/WFW-2 code/QA/Evidence 与 historical Evidence 全部只读。

## 2. 范围

### 2.1 允许修改

```text
apps/desktop/src/renderer/presentation/**
apps/desktop/src/renderer/pages/workbench/**
apps/desktop/tests/**
scripts/run-wfw3-*.mjs
package.json / apps/desktop/package.json（仅获编码授权后的版本和命令）
docs/development/wfw/**
README.md
CHANGELOG.md
docs/development/DEVELOPMENT-LOG.md
docs/development/qa/**（仅独立 QA 写入）
```

允许为测试复用现有 VS2/VS3 Electron fixture/driver 结构，但 WFW-3 只保留一个 WFW driver，不复制第二套 E2E 框架。

### 2.2 预期生产改动为 0 的层

```text
services/core/src/**
services/document-worker/src/**
apps/desktop/src/main/**
apps/desktop/src/preload/**
packages/contracts/src/**
services/central-service/**
```

若真实 E2E 证明必须修改上述任一生产层，立即停手，记录 exact failure chain，另行输出聚焦 repair 方案；不得以
fixture、Renderer 假成功、直读文件、绕过 IPC 或修改 frozen Contract 方式继续。

### 2.3 明确禁止

- 不新增 Contract、IPC channel、Preload method、Core route、migration、依赖或 lockfile 变化；
- 不新增 `file.read/file.edit/file.delete`、目录 Tool、通用文件管理器或第二套 Artifact 系统；
- 不允许 Renderer/Main 直接写目标文件；Renderer 不导入 `fs/path/child_process`；
- 不新增 WFW 专用持久化、状态机、revision store、Evidence schema、96/120 项关闭账本；
- 不自动创建父目录，不扩大 hidden file、symlink、hard-link 或 replace 范围；
- 不把 `.prev` 暴露为第二个 Artifact；
- 不把 root、绝对路径、grantId、proof、request/effect/idempotency digest、stack、temp/backup path 投影到 DOM；
- 不宣称解决外部编辑器在最终 digest-check/rename 窗口内的全部竞争；
- 不进入 Personal Model、Admin mutation、TGM、Knowledge Provider、Agent Lifecycle、SSO/RBAC 或 WFW-H1。

## 3. G1 — Workbench Tool Activity 业务投影

### 3.1 数据来源

只消费 `activeTaskDetail.toolActivities` 的 frozen safe projection，不读取 Action payload、Observation payload 或私有 effect。
筛选条件必须是：

```text
activity.operationType === "tool.workspace.file.write_text"
```

Renderer 不通过名称猜测、不读取 capability registry、不扩展 public schema。

### 3.2 用户语言

增加 pure presentation helper，把既有 safe status 与 WFW operation 映射为：

| 状态 | 用户可见文案 |
| --- | --- |
| preparing | 正在准备文件 |
| waiting_confirmation | 等待确认 |
| running | 正在写入文件 |
| completed + create | 文件已创建 |
| completed + replace | 文件已更新 |
| failed | 文件生成失败 |
| cancelled | 已取消文件生成 |
| timed_out | 文件生成超时 |
| uncertain/manual_attention | 写入结果需要确认 |

若 safe projection 无法区分 create/replace，统一显示“文件已生成”，不得为文案新增 Core 字段。目标只显示 safe relative path；
若没有 safe path，则显示“工作区文件”。

### 3.3 显示位置

Workbench 当前对话区域增加一个最小“文件处理”业务步骤区，或复用既有 Tool activity 列表样式。不得新建 WFW 专用
Results 页面。列表按 `updatedAt/activityId` 稳定排序，同一 activity 只显示一次。

uncertain 必须优先于 completed 文案；不能因 Artifact 已出现而把 uncertain 隐藏为成功。

## 4. G2 — 成果面板与安全预览

### 4.1 成果卡

继续消费 `activeTaskDetail.artifacts`，只显示 lifecycle 未 deleted/sourceDeleted 的 Artifact。WFW Artifact 复用既有：

- `kind=html` → “HTML”；
- `kind=markdown` → “Markdown”；
- `kind=text` → “文本”。

卡片显示 displayName、kind、safe relativePath/状态；不显示 capability ID 或 digest。Artifact 数量来自 durable projection，
不得由 Renderer 自增。

### 4.2 打开行为

WorkBench 的“打开”改为类型驱动：

- HTML：调用既有 `startArtifactHtmlPreview({ artifactId })`；
- Markdown：调用既有 `previewArtifact({ artifactId, mode: "markdown" })`；
- Text/JSON/CSS：调用既有 `previewArtifact({ artifactId, mode: "text" })`；
- 其他既有 Artifact：保持现有 `openArtifactLocation({ artifactId })` 行为，避免扩大本批。

不得根据文件内容、绝对路径或扩展名在 Renderer 自行读取。类型只来自 frozen Artifact projection。

### 4.3 Preview UI

Workbench 复用 `presentArtifactPreview` 和 Task 页已验证的 state model，提供 loading/ready/error 三态：

- Markdown/Text 在 Renderer 中只渲染 inert text blocks；禁止 `v-html/innerHTML`；
- HTML 只在 APV-1C 返回的 loopback preview URL 中打开 sandboxed iframe；
- 切换 Artifact 或关闭结果面板时调用 `closeArtifactPreview`，不泄漏 preview session；
- preview error 只使用既有 safe error presentation，不显示路径、stack 或原始响应；
- missing/deleted/too_large/blocked/unsupported 全部 fail-closed。

## 5. G3 — Default 与显式 Workspace 行为

### 5.1 默认 Workspace

未选择工作区时沿用 Main 的 `DefaultWorkspaceGrantProvider`：

```text
home/.robothree
displayName = RoboThree 默认工作区
accessMode = read_write
```

Renderer 只能显示“RoboThree 默认工作区”，不得显示 `~/.robothree`、home 或 real path。E2E 使用隔离 HOME，不写用户真实目录。

### 5.2 显式 Workspace

选择一个临时受控工作区后，SubmitTurn 必须携带该 exact grant，文件只写入所选目录；不得同时写入默认目录。测试通过
既有 Workspace UI/Main picker fixture 或已验证 app-level driver 完成，不自动化 macOS/Windows 原生对话框，不宣称 OS 级点击。

### 5.3 Replace

同一 Session 第二次请求必须由模型在当前上下文持有新文本，Core 从 durable WFW Artifact 推导 authority；Renderer 不提交
Artifact ID、proof 或摘要。replace 后：

- target = exact 新内容；
- `target.prev` = exact 旧内容；
- Artifact 仍为同一 logical path 的唯一 terminal head；
- `.prev` Artifact count = 0；
- 非 WFW/跨 Session/过期来源继续 fail-closed，不通过确认降级覆盖。

## 6. G4 — Recovery 与安全失败

### 6.1 Core restart

真实 E2E 在写入完成但 Desktop 尚未完成结果刷新时，对 Core child 执行一次真实 `SIGKILL`：

- Electron/Main/Renderer 保持运行；
- 新 Core PID + 新 runtimeInstanceId；
- reopen 同一 SQLite；
- 同一 Tool Result/Artifact 恢复且无重复；
- preview 重新打开成功；
- 不重复发起已完成写入。

### 6.2 Ambiguous post-publication

仅在受控 Document Worker/E2E fixture 使用 WFW-1 已冻结 fault point 构造 ambiguous post-publication：

- durable effect 最终为 uncertain/manual attention；
- Workbench 显示“写入结果需要确认”；
- 不自动 retry、不伪造 Artifact、不显示目标内容或私有诊断；
- fault seam 不得进入生产 Renderer/Main/Preload/Core。

### 6.3 Safe errors

至少覆盖：路径不允许、文件已存在、旧摘要不匹配、结果不确定、preview 不可用。Renderer 只映射既有 safe error/status；
若现有 safe projection 无法区分，显示统一安全提示，不新增 Core error code。

## 7. G5 — 真实 Electron E2E

### 7.1 Driver 定义

沿用 VS1/VS2 已验证方式：以真实 Electron binary 启动 production Main/Preload/Renderer，通过
`webContents.executeJavaScript` app-level driver 触发真实 Vue handler、Main IPC 和 SubmitTurn。它不是 OS 级合成输入，
不宣称自动化原生文件选择对话框。

启动命令必须显式清除 `ELECTRON_RUN_AS_NODE`。所有目录、SQLite、HOME、Gateway fixture 均位于临时目录并在结束后归零。

### 7.2 macOS 主场景

一个 `scripts/run-wfw3-electron.mjs` 串行完成：

1. fresh Electron 启动，sandbox/contextIsolation true、nodeIntegration false；
2. 不选择工作区，提交生成 `index.html`；
3. Gateway 返回 WFW Tool Call，真实 Document Worker 写入隔离 `HOME/.robothree/index.html`；
4. Workbench 显示 WFW activity completed 和一个 HTML Artifact；
5. 点击成果，APV-1C preview ready，script/network/navigation/Node 全禁；
6. 同 Session 请求更新 `index.html`；
7. 验证 target/new、`.prev`/old、Artifact terminal head=1、`.prev` Artifact=0；
8. Core `SIGKILL`，等待新 PID/runtime identity，reopen 同一 SQLite；
9. 同一 Artifact/Tool Result 恢复且 count 不增，preview 再次 ready；
10. 新 Session 选择显式临时 Workspace，创建 `notes.md`，确认默认目录零新增；
11. 构造一次 ambiguous fault，WorkBench 显示人工确认且不重复写；
12. 关闭 Electron，检查进程、窗口、webContents、IPC、Core child、Worker child、preview server、port、timer、
    temp directory 全归零。

E2E 只输出 content-free JSON 摘要，不建立 `artifacts/wfw3/evidence.json` 或新的 Evidence schema。

### 7.3 关键结果字段

```text
status=PASS
outcome=WFW3_DESKTOP_TEXT_WRITE_E2E_CONFORMANT
realElectronMain=true
productionPreload=true
realRendererWorkbench=true
realMainIpc=true
realCoreChild=true
realDocumentWorkerChild=true
defaultWorkspaceCreate=true
explicitWorkspaceCreate=true
htmlPreviewReady=true
markdownPreviewReady=true
replaceVerified=true
previousBackupVerified=true
artifactHeadCount=1
previousArtifactCount=0
coreRestartedWithNewIdentity=true
durableReplayDuplicateCount=0
uncertainPresented=true
sandbox=true
contextIsolation=true
nodeIntegrationDisabled=true
```

不输出文件正文、token、绝对路径、grantId、digest、proof、PID 以外的环境内容或用户 home。

## 8. G6 — Windows 本地 NTFS 最小门禁

WFW v1 closure 前必须在真实 Windows Desktop 硬件或受控 Windows runner 上执行同一产品链的最小 smoke。要求：

- Windows 11 + 本地 NTFS；
- 使用隔离临时用户目录和临时 Workspace；
- production Electron Main/Preload/Renderer + real Core/Document Worker；
- create `index.html`；
- owned replace；
- exact `.prev`；
- Artifact 展示与 HTML preview；
- Core process restart + 原 SQLite reopen；
- durable result/Artifact 不重复；
- cleanup 无残留进程、句柄、端口或临时目录。

本门禁不覆盖 FAT/exFAT、网络盘、OneDrive、junction、长路径、文件共享锁或完整 Windows matrix；这些继续属于 WFW-H1。
若当前没有 Windows runner，WFW-3 可完成 macOS implementation/QA，但不得 `PASS/CLOSED`，状态必须诚实保持
`WINDOWS_NTFS_GATE_PENDING`。

## 9. 安全与泄漏边界

### 9.1 静态扫描

Renderer WFW 修改不得新增：

```text
node:fs
node:path
child_process
ipcRenderer
innerHTML
v-html
workspaceRoot
rootRealPath
workspaceGrantId
requestDigest
effectAttemptId
idempotencyKey
ownedArtifactProof
accessToken
secret
stack
```

测试/driver 可持有临时路径，但不得投影到 Renderer DOM、日志或 E2E JSON。

### 9.2 HTML preview

必须沿用 APV-1C：CSP 禁止 script/default network，sandbox 禁止 Node、top navigation、downloads 和 opener；关闭 preview 后
session/token/port 不再可用。禁止 data URL、`srcdoc`、raw HTML 注入或直接读取 Artifact 文件绕过 Main。

### 9.3 资源归零

真实 E2E 至少检查：electronProcess、browserWindow、webContents、ipcHandler、coreChild、documentWorkerChild、
htmlPreviewServer、listeningPort、timer、temporaryDirectory 全部为 0。

## 10. 实施顺序

### Step 1 — focused proof（0.1 日）

1. 用现有 projection fixture 构造 WFW completed/uncertain 与 html/markdown/text Artifact；
2. 证明现有 TasksAdapter preview 接口可直接复用；
3. 证明默认 Workspace 与显式 Workspace submit routing 已存在；
4. 证明 Core/Main/Preload 无需生产改动；若任一不成立立即停手。

### Step 2 — pure presentation（0.1～0.2 日）

1. 增加 WFW activity 业务映射 pure helper；
2. 增加成果类型驱动的 preview decision pure helper；
3. 覆盖全状态、无路径、safe fallback 与零私有字段。

### Step 3 — Workbench 最小接线（0.2～0.3 日）

1. 显示 WFW Tool activity；
2. 成果按钮调用 existing preview API；
3. 增加 loading/ready/error/close；
4. 保持其他 Artifact 原行为。

### Step 4 — real Electron（0.2～0.3 日）

1. 复用 VS2 fixture，新增单一 WFW3 driver；
2. default + explicit Workspace；
3. create + replace + `.prev`；
4. Core SIGKILL/reopen；
5. ambiguous + cleanup。

### Step 5 — Windows gate + closure（0.2～0.5 日，取决于 runner）

1. 在真实 Windows 本地 NTFS 复跑最小 smoke；
2. 独立 QA；
3. 用户接受后才关闭 WFW-3 与 WFW v1。

预计实现 0.6～1.3 个集中工程日；Windows runner 排队时间不计入编码工时。

## 11. Focused QA（24 项）

### 11.1 Tool activity（QA-001～QA-006）

- QA-001 只识别 exact WFW operationType；
- QA-002 preparing/running/completed 业务文案；
- QA-003 failed/cancelled/timed_out 业务文案；
- QA-004 uncertain/manual_attention 优先；
- QA-005 safe relative path 或“工作区文件”fallback；
- QA-006 零 capability/digest/root/grant/proof 泄漏。

### 11.2 Artifact/preview（QA-007～QA-012）

- QA-007 html/markdown/text kind 映射；
- QA-008 HTML 只走 `startArtifactHtmlPreview`；
- QA-009 Markdown 只走 markdown preview；
- QA-010 Text/JSON/CSS 只走 text preview；
- QA-011 其他 Artifact 保持 open location；
- QA-012 close/switch/unmount 清理 preview。

### 11.3 Workspace/recovery（QA-013～QA-018）

- QA-013 未选择时 default Workspace；
- QA-014 显式 Workspace 不回落 default；
- QA-015 replace target/new + `.prev`/old；
- QA-016 Artifact head=1 + `.prev` Artifact=0；
- QA-017 Core restart 新 identity + duplicate=0；
- QA-018 ambiguous 显示人工确认且零 retry。

### 11.4 Boundary/E2E（QA-019～QA-024）

- QA-019 real Electron/Main/Preload/Renderer/Core/Worker；
- QA-020 sandbox/contextIsolation/nodeIntegration；
- QA-021 APV-1C script/network/navigation/Node 禁止；
- QA-022 10 类资源归零；
- QA-023 public Contract/migration/依赖/lockfile 零漂移；
- QA-024 Windows 11 本地 NTFS 最小门禁。

QA ID 必须恰为 24 个、连续唯一；不得扩为平台关闭账本。

## 12. 门禁

编码后必须串行执行：

```text
Node 24.13.0
pnpm 11.11.0
WFW-3 focused Renderer tests
WFW-2 focused 4 files / 85 tests
WFW-2 combined regression 7 files / 101 tests
Document Worker full 26 files / 222 tests
Core/Desktop typecheck
Desktop build
focused ESLint
pnpm run audit:dtp4
git diff --check
real macOS Electron WFW-3 E2E
real Windows local-NTFS WFW-3 smoke
```

全仓 lint 既有 Admin generated JS blocker 与 Desktop workspace 历史 blocker 必须单独记录，不得归因 WFW-3，也不得用它们
掩盖 WFW-3 focused 失败。

## 13. 停手条件（18 项）

1. 需要新增或修改 public Contract；
2. 需要新增 IPC/Preload/Core route；
3. 需要新增 migration、依赖或 lockfile；
4. 需要修改 WFW-1/WFW-2 恢复/authority 语义；
5. 需要 Core/Main/Preload/Document Worker production 改动；
6. 需要 Renderer 直接读取或写入文件；
7. 需要把 root/grant/proof/digest 投影给 Renderer；
8. 需要 WFW 专用状态机、持久化或 Artifact 系统；
9. 需要为 preview 注入 raw HTML/data URL/srcdoc；
10. default Workspace 会写入非隔离用户真实目录的测试；
11. explicit Workspace 会同时写 default Workspace；
12. replace 需要前端猜测 Artifact ID/proof；
13. ambiguous 状态必须自动 retry 才能完成；
14. `.prev` 必须成为第二 Artifact；
15. 需要自动创建父目录或覆盖任意非 WFW 文件；
16. 需要宣称完整 CAS/外部编辑器竞争已解决；
17. 需要解锁 WFW-H1 或其他下游；
18. Windows 本地 NTFS 未执行却要求关闭 WFW v1。

任何一项触发即停止编码并回到文档评审，不得临场扩权。

## 14. 版本与文档策略

编码获授权后目标版本：

- Root/Desktop：`0.0.0-wfw.3`；
- Core/Document Worker：保持 `0.0.0-wfw.2`（预期生产零修改）；
- Contracts/Admin：保持 `0.0.0-mvp.rsl.1`；
- lockfile 不变；migration 仍止 26。

若实际需要改变上述策略，必须先停手。完成实现后追加实施报告与 Development Log；独立 QA 报告由独立验收者写入，
不创建新的 product Evidence artifact。

## 15. 独立文档评审问题

1. 是否确认 WFW-3 只做 Desktop consumer/E2E，不新增文件能力？
2. 是否确认 Core/Main/Preload/Document Worker production 改动预期为 0，发现需要即停手？
3. 是否确认未选择工作区走既有 `~/.robothree`，Renderer 永不看到真实路径？
4. 是否确认显式 Workspace 必须覆盖并阻止 default fallback？
5. 是否确认 Workbench 复用既有 TasksAdapter/APV preview，不新增 API？
6. 是否确认 replace proof 继续完全由 Core 推导，Renderer 不提交 Artifact ID/proof？
7. 是否确认一个 macOS real Electron driver + 一个 Windows local-NTFS gate 足够 WFW v1 closure？
8. 是否确认没有 Windows NTFS 实跑时只能保持 `WINDOWS_NTFS_GATE_PENDING`？
9. 是否确认 focused QA 只保留 24 项，不建 Evidence schema/96/120 账本？
10. 是否确认 WFW-H1 与其他下游继续 GATED？

## 16. 下一步

1. Claude Code 对本方案做独立只读文档复核；
2. 用户接受文档复核结论；
3. 用户单独授权 WFW-3 编码；
4. 实现和开发门禁；
5. macOS + Windows NTFS 独立 QA；
6. 用户接受后，分别关闭 WFW-3 与 WFW v1；WFW-H1 仍不自动解锁。
