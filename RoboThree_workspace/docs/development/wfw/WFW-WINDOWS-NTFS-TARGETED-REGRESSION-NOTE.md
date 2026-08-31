# WFW Windows 11 / NTFS 定向回归说明

> Owner: Codex 5.6  
> Date: 2026-08-31  
> Status: `DEFERRED WINDOWS REGRESSION / NOT EXECUTED`  
> Capability: `tool.workspace.file.write_text`  
> Related stage: `WFW-3 MACOS E2E PASS / WINDOWS NTFS GATE PENDING / NOT CLOSED`

## 1. 记录目的

WFW-1、WFW-2、WFW-3 repair.1 与 repair.2 已完成 macOS 侧实现、聚焦验证和真实 Electron E2E。当前暂不继续安排
Windows 门禁，待后续 Windows 客户端回归窗口统一执行。

本说明用于固定届时必须针对性验证的 Windows 文件系统和进程恢复语义。它不是 Windows PASS 证据，也不代表当前已经
支持或承诺所有 Windows 文件系统环境。

## 2. 当前结论

```text
macOS real Electron WFW E2E: PASS
Windows 11 local NTFS regression: NOT EXECUTED
WFW-3 repair.2: PASS/CLOSED
Parent WFW-3: NOT CLOSED
Production-ready claim: NOT ALLOWED
```

在 Windows 回归完成前，不得把 Wine、Mock、Linux container、macOS 文件系统或共享目录结果等同于本门禁。

## 3. 合格测试环境

满足以下任一形态：

- 真实 Windows 11 设备；
- Windows 11 虚拟机；
- 受控 Windows 11 自托管 runner。

共同约束：

- 测试 Workspace 和临时用户目录必须位于 Windows 本机 NTFS 卷；
- 不使用 macOS shared folder、SMB/NFS、OneDrive 同步目录、FAT/exFAT、junction 或网络盘；
- 使用项目声明的 Node 24.13.0 与 pnpm 11.11.0；
- 从 Windows 环境重新安装平台对应依赖，必须使用 frozen lockfile，不修改 `pnpm-lock.yaml`；
- Electron Main、production Preload、Renderer、真实 Core child、Document Worker child 与 SQLite 必须全部参与。

## 4. 执行前 tests-only 适配

当前 macOS WFW-3 E2E 驱动通过 `/bin/ps` 发现 Core child，并以 `SIGKILL` 构造真实重启窗口。Windows 回归前只允许进行
tests-only 跨平台适配：

1. Windows 下取得真实 Core child PID；
2. 使用 Windows 支持的强制终止方式制造同等 Core crash；
3. 等待原 PID 退出，并验证新 Core PID / runtime identity；
4. 继续 reopen 原 SQLite 文件，而不是创建新数据库；
5. macOS 现有路径和断言保持不变。

该适配不得修改 Core、Document Worker、Main/Preload/Renderer 产品逻辑，不得新增公开 Contract、IPC、migration、依赖、
状态机、错误码或 Evidence schema。若 Windows 实跑要求修改生产代码，必须另行停手、分析和评审。

## 5. 必测主链

### WNTFS-01 — Create

- 未显式选择 Workspace 时，在隔离默认 Workspace 创建 `index.html`；
- 验证 exact UTF-8 bytes、无 BOM、文件存在且大小/摘要与 Tool Result 一致；
- 验证生成唯一 terminal Artifact，HTML preview 可真实加载。

### WNTFS-02 — Owned replace

- 在同一 durable Session 中修改 WFW 自己创建的 `index.html`；
- source Task readable Runtime Selection 的 exact WorkspaceGrant 必须匹配；
- exact prior SHA-256 必须匹配；
- 非 WFW 文件、不同 grant、不同路径、缺失/歧义 head 必须继续 fail-closed。

### WNTFS-03 — `.prev`

- replace 成功后，目标文件为新内容；
- 同级 `index.html.prev` 为旧内容；
- 只保留一层 `.prev`；
- `.prev` 不生成第二个用户 Artifact。

### WNTFS-04 — NTFS publication semantics

- 验证同目录临时文件发布、no-clobber create 与 replace rename 在 NTFS 上行为正确；
- 验证没有残留临时文件、部分文件或错误目标；
- 验证打开句柄或杀进程后不存在无法清理的文件锁残留。

### WNTFS-05 — Core restart / SQLite reopen

- 在 create/replace 链完成后强制终止真实 Core child；
- 验证原 PID 已退出，新 PID/runtime identity 已建立；
- 使用原 SQLite 文件恢复 Task、Result、Artifact 和 WFW ownership head；
- 验证 durable Result、Tool activity 和 Artifact 均不重复。

### WNTFS-06 — Explicit Workspace isolation

- 显式选择本地 NTFS Workspace 后创建 `notes.md`；
- 文件只能出现在显式 Workspace，不能回落默认目录；
- Renderer 和测试结果不得输出真实根路径、grant、proof、token 或文件正文。

### WNTFS-07 — Cleanup

- Electron 退出后无残留 Core/Document Worker/Electron 进程；
- 无残留 BrowserWindow、WebContents、IPC handler、preview server、监听端口、timer、SQLite handle 或临时目录；
- APV tokenized preview session 按既有 TTL/close 规则清理。

## 6. 最小负向回归

- 路径穿越、绝对路径、UNC、URL、隐藏路径和 `.prev` 目标继续拒绝；
- symlink、hard-link 与非 regular file 继续拒绝；
- prior digest 不匹配继续 fail-closed；
- 非 WFW Artifact 不允许 replace；
- 外部编辑器最终 digest-check/rename 竞争窗口仍只承诺 best-effort stale-write protection，不升级为完整 CAS；
- FAT/exFAT、网络盘、OneDrive、junction、长路径和完整共享锁矩阵继续属于 WFW-H1，不因本回归自动纳入。

## 7. 通过证据

Windows 回归报告至少记录以下 content-free 字段：

```text
status=PASS
platform=win32
windowsVersion=Windows 11
filesystem=NTFS
realElectronMain=true
productionPreload=true
realCoreChild=true
realDocumentWorkerChild=true
createVerified=true
replaceVerified=true
previousBackupVerified=true
artifactHeadCount=1
htmlPreviewDocumentLoaded=true
coreRestartedWithNewIdentity=true
sqliteReopenVerified=true
duplicateResultCount=0
duplicateArtifactCount=0
resourceCleanupVerified=true
```

不得记录绝对路径、用户 home、文件正文、preview token、WorkspaceGrant、proof、Credential、环境变量或内部堆栈。

## 8. 判定规则

- 全部 WNTFS-01～07 与最小负向回归通过，才可提出关闭父 WFW-3；
- 测试驱动问题只能 tests-only 修复后重跑；
- 产品代码问题必须建立独立停手结论，不能降低断言、换 Mock 或删除 Windows 门禁；
- Windows 回归通过不自动声明 production ready，也不扩展到 WFW-H1 文件系统矩阵。

## 9. 后续触发时点

在以下任一时点恢复本说明：

- Windows 客户端首次打包或发布候选回归；
- Windows 11 VM/设备/runner 可用；
- Windows 用户现场发现 create、replace、`.prev`、文件锁或 Core restart 问题。

恢复时直接以本说明作为定向回归清单，不重新扩大 WFW 产品范围。
