# WTE-1 Workspace Text Read / Continuous Edit Development Plan

> 状态：`IMPLEMENTATION COMPLETE / DEVELOPER VERIFICATION PASS / INDEPENDENT CODE QA PASS / USER ACCEPTANCE PENDING / WINDOWS NTFS GATE PENDING`
> 版本：`0.0.0-mvp.wte.1`  
> 上游：WFW-1/WFW-2、WFW-3 macOS 产品链、CTX-MVP-1  
> 最高待验收 outcome：`WTE1_WORKSPACE_TEXT_READ_CONTINUOUS_EDIT_E2E_CONFORMANT`

## 0. 产品目标

只关闭一条 MVP 业务链：

```text
用户在当前 Workspace 明确选择或点名 UTF-8 文本文件
→ Core 锁定 read_text/write_text 能力和 Workspace authority
→ Document Worker 读取磁盘最新完整内容
→ 模型基于 exact Tool Result 生成完整替换内容
→ WFW 校验 read proof 与 expectedPreviousSha256
→ 原子替换并保留单层 .prev
→ 更新同一逻辑 Artifact 并安全预览
→ 后续用户指令重新读取磁盘最新版后继续编辑
```

本批不建设编辑器、Patch/Diff、文件监听、三方 Merge、通用文件平台或新的任务状态机。

## 1. 范围

### 1.1 本批实现

- Agent-visible `tool.workspace.file.read_text`；
- 复用同一个 Document Worker child，读写使用独立 capability/binding/handle；
- 256 KiB UTF-8 硬上限，超限不截断；
- Workspace containment、普通文件、单 hard-link、symlink/隐藏路径拒绝；
- read 前后 stat 稳定性校验，最多一次内部重读；
- Core 私有 Read Proof，绑定 Task、当前 user turn、Action/Observation、WorkspaceGrant、路径与 SHA-256；
- replace 继续复用 WFW `write_text`、`.prev`、EffectCoordinator、Artifact；
- 首次 `content_changed` 自动重新读取并重做一次；第二次冲突立即停止当前 Attempt；
- Workbench 文本附件选择、read/write 安全进度、第二次冲突四个处理入口；
- Markdown/Text/HTML 复用现有安全预览；
- CTX-MVP-1 exact material/output admission 接线；
- 一个真实 macOS Electron read→replace→preview→Core SIGKILL/reopen E2E。

### 1.2 明确不做

- 新公共 Contract、IPC、Preload 方法或数据库 migration；
- 新依赖、lockfile 变化或第二个 Document Worker；
- 非 UTF-8、二进制、大文件分片、Patch、Diff、Undo、rename/delete；
- 多文件原子事务；
- 自动切换未锁定模型；
- Renderer 读取文件、计算摘要或接收 root/grant/proof/正文；
- Agent 自行发现的既有文件自动写入。

## 2. 冻结语义

### 2.1 Read Tool

模型输入仅为：

```ts
{ relativePath: string }
```

成功结果为：

```ts
{
  relativePath: string;
  content: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
}
```

`content` 只进入受控 Tool Result/模型上下文和既有 durable conversation storage，不进入 Renderer、普通日志、审计或 Artifact metadata。

### 2.2 路径与文件安全

读取拒绝绝对路径、URL、反斜杠、NUL、空段、`.`、`..`、隐藏路径、symlink/junction、非普通文件与多 hard-link 文件。读取前后 `dev/ino/size/mtime/ctime/nlink` 必须一致；第二次仍不稳定返回 `workspace.file.changed_during_read`。

### 2.3 Context / Output

- 当前 user turn 的 exact `read_text` Tool Result 按 durable `toolCallId/capabilityId/taskId/actionId` 识别；
- split Tool Result 必须无分隔符重组，保持正文逐字符一致；
- WTE full replacement 按 path、prior digest、JSON escaping、Tool wrapper、全文与 25%/至少 1024 token headroom 计算输出需求；
- 超过 locked Model `maxOutputTokens` 时 Provider 前返回 `workspace.file.output_capacity_insufficient`；
- 不生成、执行或修复截断 Tool Call。

## 3. 连续编辑与冲突

每条新的用户编辑指令必须产生新的 `read_text`。Read Proof 由既有 durable Task facts 派生，不新增表或状态枚举。

第一次冲突：

```text
read A → write expected A → disk B → content_changed
→ Task 保持 running
→ read B
→ 基于 B 重做当前指令
→ write expected B
```

第二次冲突：

```text
write expected B → disk C → content_changed
→ 当前 Task/Attempt 立即失败
→ 不再自动调用模型或写入
→ Workbench 提供“基于最新版本重新处理 / 另存为新文件 / 打开文件 / 取消本次修改”
```

`uncertain/manual_attention` 永远不进入自动 Rebase。

## 4. MVP 授权收缩

用户明确点名路径或通过 Workbench 选择文件时，当前 Task 可在 existing Workspace/Policy/Capability Lock 下读取并修改。

当前版本不复用存在恢复缺口的 confirmation path。Agent 自行发现、用户没有点名的路径统一以 `workspace.file.policy_denied` fail-closed；后续如要支持“发现后确认”，必须单独修复并验证 confirmation resume，不能在 WTE-1 内猜测授权。

## 5. Artifact 与 Desktop

- 写入成功仍由 WFW 投影 Artifact；
- 同一 `workspaceGrantId + relativePath` 只显示一个 terminal logical head；
- `.prev` 不单独展示为 Artifact；
- Workbench 只消费 displayName/mediaType/relativePath 和安全状态摘要；
- Task-generated Markdown/Text preview 使用既有 Core source authority + Main bounded stable read；
- HTML 使用既有 APV-1C tokenized loopback sandbox，不使用 `innerHTML`/`v-html`。

## 6. 验证门禁

### 6.1 Focused

- Document Worker read/write/protocol/router/full suite；
- Core registry/read proof/output material/context reconstruction/task reducer；
- 64/128 KiB-class loopback read→replace；
- 首次冲突自动 Rebase、第二次冲突立即停止；
- Desktop picker/projection/presentation/preview/four actions；
- WFW/VS2/CTX regression；
- typecheck、build、focused lint、DTP-4、Core smoke、`git diff --check`。

### 6.2 真实 E2E

macOS packaged Electron 必须证明：真实 Renderer/Main/Preload/Core/Document Worker、explicit Workspace、exact read result 进入第二轮请求、replace、`.prev`、单一 Artifact head、Markdown preview、Core SIGKILL、新 runtime identity、SQLite reopen 与重启后预览。

Windows 11 本地 NTFS 的 read/edit/conflict/`.prev`/Artifact/restart 仍是关闭条件；不得用模拟文件系统冒充通过。

Windows 定向回归不另建第二份清单，统一并入 [`wfw/WFW-WINDOWS-NTFS-TARGETED-REGRESSION-NOTE.md`](./wfw/WFW-WINDOWS-NTFS-TARGETED-REGRESSION-NOTE.md) 的 `WNTFS-WTE-01`～`WNTFS-WTE-06`。

## 7. 停手条件

发现必须新增公共 Contract、migration、依赖、Renderer 文件权限、第二套状态机、文件监听/Patch/Merge、跨 Workspace 访问、把 grant/proof/正文投影到不可信表面，或必须绕过 WFW/EffectCoordinator 时，立即停手回评审。

## 8. 关闭边界

实现完成与 developer verification 不等于 `PASS/CLOSED`。只有独立代码 QA、用户接受以及真实 Windows NTFS WTE 回归完成后，才可关闭 WTE-1。真实公网 400K Provider usage calibration 单独保持 `REAL_PROVIDER_CALIBRATION_PENDING`，不得用 controlled Gateway fixture 冒充。
