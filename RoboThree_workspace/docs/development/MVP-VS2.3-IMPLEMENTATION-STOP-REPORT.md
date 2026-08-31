# MVP-VS2.3 实施停手报告

> 日期：2026-08-30  
> 状态：**IMPLEMENTATION STOP / REVIEW REQUIRED / CODING PAUSED**  
> 触发条件：VS2.3 方案 §7 控制性预期与用户授权边界——真实 E2E 如需修改 Core/Main/Preload 生产逻辑，立即停手回评审

## 1. 已完成且仍在授权范围内的增量

- Task 页 pure projection 已把 exact workspace read Tool Activity 与 PPTX write Tool Activity 派生为“读取资料 / 生成成果”两段业务步骤；
- 业务状态覆盖空集合与 `preparing/running/waiting_confirmation/completed/failed/timed_out/cancelled/uncertain` 全部既有状态；
- PPTX write activity 完成但 durable Artifact 尚不可预览时不会提前显示“成功”；
- 非 VS2 Task 继续使用既有 generic step projection，不受本批影响；
- Renderer focused tests 已实跑 `2 files / 23 tests PASS`，Desktop TypeScript build 与本批 focused ESLint PASS；
- 新增唯一 VS2 Electron fixture/driver，使用 production Main/Preload/Renderer、真实 Core child、真实 SQLite、真实 DOCX 与受控 Gateway HTTP/SSE；
- Core/Main/Preload production source 本批改动数保持 0，Contract、migration、依赖与 lockfile 均未修改。

## 2. 真实 Electron E2E 暴露的阻塞事实

Workbench 真实点击“添加资料”后，附件没有进入 Renderer 列表，Main 返回：

```text
channel = robothree:workbench-attachment:v1alpha1:pick
code = contract.invalid
safeSummary = The Desktop request is invalid.
```

聚焦诊断确认首个 Zod issue 为：

```text
unrecognized_keys: workspaceGrantId
```

事实链如下：

1. `WorkbenchAttachmentPickerCommandSchema` 是 frozen `RegisterWorkspaceArtifactCommandSchema` 的 additive 扩展，合法增加 `workspaceGrantId`；
2. Main 在 `desktop-ipc-router.ts` 解析该扩展命令后，把整个 `command` 传给 `#registerWorkspaceArtifactFromPicker(...)`；
3. `#registerWorkspaceArtifactFromPicker(...)` 又把整个扩展命令作为 `command` 传给 `CorePrivateClient.registerWorkspaceArtifact(...)`；
4. Core client 按 frozen strict `RegisterWorkspaceArtifactCommandSchema.parse(input.command)` 收窄时，因多余的 `workspaceGrantId` fail-closed；
5. 同一问题也可能影响带 `workspaceGrantId` 与 `artifact` 的 validation 扩展命令。

对应代码事实：

- `apps/desktop/src/main/desktop-ipc-router.ts:205`～`:217`：解析 picker/validation 扩展命令；
- `apps/desktop/src/main/desktop-ipc-router.ts:399`～`:407`：未收窄即传给 Core client；
- `apps/desktop/src/main/core-private-client.ts:925`～`:930`：frozen base command strict parse 拒绝扩展字段。

这不是 E2E fixture、DOCX 内容或 Renderer 文案问题，而是真实用户附件入口在 Main production path 上的命令边界缺陷。

## 3. 为什么必须停手

最小正确修复必须修改 Main production logic：在进入 Core client 前，把 picker/validation 扩展命令显式投影为 frozen base
`RegisterWorkspaceArtifactCommand`，只保留 `contractVersion/type/commandId/correlationId/clientInstanceId`；
`workspaceGrantId` 与 `artifact` 只留在 Main 的 authority/identity 校验逻辑中。

该修复不需要新 Contract、migration、依赖、状态机或错误码，但仍属于用户明确禁止本批擅自修改的 Main production logic。
因此不能借“测试修复”名义直接落地，也不能用 fixture 绕过真实 Workbench picker。

## 4. 建议的最小聚焦修复

建议单独授权 `VS2.2 repair.1 — Workbench Attachment Command Narrowing`，范围严格限制为：

1. `apps/desktop/src/main/desktop-ipc-router.ts`：picker/validation 扩展命令到 frozen base command 的显式投影；
2. `apps/desktop/tests/desktop-ipc-router.test.ts`：同时覆盖 pick 与 validate，断言 Core client 收到的 command 不含
   `workspaceGrantId`/`artifact`；
3. 恢复运行同一 `scripts/run-mvp-vs2-electron.mjs`，不得新增另一套 E2E；
4. Contract、Core、Preload、Renderer API、migration、依赖、lockfile、状态机保持零修改。

修复独立聚焦验证通过并由用户接受后，才恢复 VS2.3 剩余真实 Electron recovery/E2E 收口；不得把该缺陷降级为 fixture 边界。

## 5. VS2.2 repair.1 实施与验证结果

用户已单独授权 `VS2.2 repair.1 — Workbench Attachment Command Narrowing`。实现严格限制在：

- `apps/desktop/src/main/desktop-ipc-router.ts`：picker/validation 扩展命令显式投影为 frozen base command；
- `apps/desktop/tests/desktop-ipc-router.test.ts`：同时断言 pick 与 validate 传给 Core client 的 `command` 仅含
  `contractVersion/type/commandId/correlationId/clientInstanceId`。

聚焦验证结果：

- `apps/desktop/tests/desktop-ipc-router.test.ts`：`1 file / 20 tests PASS`；
- Desktop `tsc -b`：PASS；
- repair 两文件 focused ESLint：PASS；
- `git diff --check`：PASS。

Contract、Core、Preload、Renderer API、migration、依赖、lockfile 与状态机均未因 repair.1 修改。原
`workspaceGrantId` strict parse 阻塞已关闭，VS2.3 随后按用户授权恢复同一真实 Electron E2E。

## 6. 恢复 E2E 后发现的第二个边界阻塞

repair.1 后，真实 Workbench 已能完成“添加资料”，但点击“提交任务”仍停在 Renderer 内，最终显示既有通用安全提示：

```text
任务资源暂时不可用，请稍后重试。
```

test-only IPC trace 证明：点击提交后 Main 未收到组件预期发出的
`robothree:workbench-attachment:v1alpha1:validate`。调用在跨 contextBridge/Preload 之前同步失败，因此不是
Core、Main router、Gateway 或恢复逻辑错误。

当前代码事实链：

1. `WorkbenchCreatePage.vue` 使用 Vue `ref<ArtifactCatalogItemProjection[]>([])` 保存附件；
2. Vue 会把写入该 ref 的对象转为深层 reactive Proxy；
3. `submitTask(...)` 把该 reactive attachment 直接交给 sandboxed Preload API；
4. Electron contextBridge 要求参数可 structured-clone，Vue Proxy 不属于可克隆值；
5. 因此 validation IPC 尚未到达 Main，页面进入 generic catch。

该问题需要修改 Workbench Renderer production boundary，不属于已授权 repair.1 的 Main/router tests 范围，也不属于
VS2.3 当前获准的 Task 页 pure projection 范围。按范围纪律再次停手。

## 7. 建议的第二个最小聚焦修复

建议单独授权 `VS2.2 repair.2 — Renderer Attachment Plain Snapshot`，只允许：

1. `apps/desktop/src/renderer/adapters/workbench-adapter.ts`：在调用
   `validateWorkbenchAttachment(...)` 前，用既有 frozen Artifact schema 把 reactive attachment 投影为 plain strict
   snapshot；
2. `apps/desktop/tests/workbench-adapter.test.ts`：使用真实 Vue reactive attachment，断言传给 Desktop API 的 artifact
   可 structured-clone、字段不增不减；
3. 恢复同一 `scripts/run-mvp-vs2-electron.mjs`，不得新建 E2E；
4. 不修改 Workbench 页面、Contract、Core、Main、Preload、migration、依赖、lockfile、状态机或错误码。

该修复只关闭 Renderer→Preload 传输形状问题，不新增接口或产品能力。完成 focused 验证后再恢复 VS2.3 剩余真实
Electron recovery/E2E。

## 8. VS2.2 repair.2 实施与验证结果

用户已单独授权 `VS2.2 repair.2 — Renderer Attachment Plain Snapshot`。实现严格限制在：

- `apps/desktop/src/renderer/adapters/workbench-adapter.ts`：用既有 frozen
  `ArtifactCatalogItemProjectionSchema` 将 Vue reactive attachment 解析为 plain strict snapshot，再进入 validation IPC；
- `apps/desktop/tests/workbench-adapter.test.ts`：使用真实 `reactive(...)` 输入，断言投影结果不是 Vue Proxy、可被
  `structuredClone(...)`，并且字段与原始 frozen projection 完全一致。

聚焦验证结果：

- `workbench-adapter.test.ts` + `desktop-ipc-router.test.ts`：`2 files / 26 tests PASS`；
- Desktop `tsc -b`：PASS；
- repair focused ESLint：PASS；
- `git diff --check`：PASS。

repair.2 后，同一真实 Workbench E2E 已能完成附件选择、validation、durable Artifact registration 和任务提交。该
Renderer→Preload structured-clone 阻塞已关闭。

## 9. E2E fixture 收敛出的真实文件与驱动语义

恢复同一 E2E 后，先后关闭了两个仅属于受控 fixture/driver 的问题，均未修改产品运行时代码：

1. 初版 DOCX 使用 `/usr/bin/zip -r`，会写入以 `/` 结尾的目录 entry；Document Worker 按既有安全规则拒绝这类不安全
   ZIP member。fixture 改为显式列出 OOXML 文件，并补齐最小 styles/numbering part 与 content type 后，真实
   `tool.document.docx.read` 成功进入第二轮 Gateway invocation；
2. Workbench 的 `submitTask()` 会等待 Agent Loop 结束；旧 driver 在 Renderer 内等待“任务已提交”后才准备放行第二轮，
   形成测试驱动自锁。driver 现改为真实点击后立即返回外层，由外层从 SQLite/Core query 读取已持久 Task 身份，再驱动
   crash/recovery。

此外，代码事实纠正了 Revision 1 文档关于 Gateway 计数的推断：

- `DurableEnterpriseModelProvider` 在 durable link 已有 `invocationId` 时不会再次 `accept(...)`；
- 正确的 transport 语义应是 round-2 `accept count = 1`，恢复调用若被重新启动则对同一 invocation 进行第二次 SSE
  subscription；
- 因此“round-2 accept count = 2 / 同 clientRequestId 新 accept”不是当前生产代码事实，不应为了满足文档而修改实现。

E2E fixture 已按真实语义分别统计 accept 与 SSE subscription，没有建立第二个 invocation，也没有改写生产 Provider。

## 10. 当前决定性停手条件：缺少活跃 Agent Loop 的启动级恢复入口

在以下真实窗口执行后：

1. round-1 完成真实 DOCX read；
2. round-2 Gateway invocation 已 durable accept；
3. 首次 round-2 SSE subscription 建立，但尚未返回任何 output event；
4. 对真实 Core child 执行 `SIGKILL`；
5. Supervisor 启动新 PID 并 reopen 原 SQLite；

新 Core 能正常达到 `runtimeState=ready`，但不会发起第二次 round-2 SSE subscription。

代码事实说明这不是 fixture 计数问题：

- `SubmitTurnRecoveryCoordinator` 只扫描 SubmitTurn coordination 的 recoverable record；已经写入 `loopStartedAt` 的
  completed SubmitTurn 不再是候选；
- `TaskRecoveryCoordinator` 只恢复 durable Effect attempt，不负责重新启动中断的 Agent Loop；
- `DurableEnterpriseModelProvider` 具备“调用方再次进入 stream 后复用既有 invocation 并继续 SSE”的能力，但当前 Desktop
  bootstrap 没有一个启动级 coordinator 重新进入该 task/run/round；
- 所以在 round-2 尚无 durable output 时杀掉 Core，恢复链缺少合法的 Agent Loop re-entry point。

满足原 VS2.3“在该窗口崩溃后继续生成 PPTX”的要求，最小也必须新增或修改 Core production recovery composition。这直接
触发用户授权中的硬停手条件：

> 若真实 E2E 发现必须修改 Core/Main/Preload 生产逻辑，立即停手回评审。

因此当前状态为：

- VS2.2 repair.1：实现与 focused 验证完成；
- VS2.2 repair.2：实现与 focused 验证完成；
- VS2.3 Renderer Task 业务步骤：实现与 focused 验证完成；
- VS2.3 真实 Electron E2E：已证明真实附件读取和 round-2 durable accept，停在 Core crash 后 Agent Loop re-entry 缺口；
- VS2.3：继续保持 `IMPLEMENTATION STOP / REVIEW REQUIRED / CODING PAUSED`，不得宣称 E2E PASS/CLOSED。

建议下一步仅输出一个 MVP 聚焦 repair 方案，范围是“已有 task/run/round 的启动级 Agent Loop 恢复入口”，先证明不会建立第二套
Task 状态机、不会重读当前 authority、不会重复已完成 Tool/Artifact，再由用户单独评审和授权。不得通过取消 SIGKILL、移动
barrier、伪造完成结果或把 fixture 改成自动重提任务来绕过缺口。

聚焦 repair 方案已输出，当前仍待独立文档复核与用户单独编码授权：

- [MVP-VS2.3 repair.1 — Active Agent Loop Startup Recovery 聚焦实施方案](./MVP-VS2.3-REPAIR.1-ACTIVE-AGENT-LOOP-STARTUP-RECOVERY-PLAN.md)
