# MVP-VS2.3 repair.3 — Tool-generated Artifact Preview Authority 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-30  
> 版本：Root/Core `0.0.0-mvp.vs2.3`  
> 方案：[repair.3 极小实施方案](./MVP-VS2.3-REPAIR.3-TOOL-GENERATED-ARTIFACT-PREVIEW-AUTHORITY-PLAN.md)

## 1. 结论

repair.3 已解除父 VS2.3 的最后一个真实 Electron E2E 阻塞。最高开发者结论为：

```text
MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT
```

独立 QA 已确认 P0～P3 全 0，用户随后接受并进入下一步。该结论不代表 production ready，也不解锁 Personal
Model、Admin mutation、TGM、Knowledge Provider 或 Agent Lifecycle。

## 2. 根因与最小修复

真实 Tool-generated Artifact 的 action payload 不要求携带 `workspaceGrantId`。Core 重启后，
`DesktopTaskProjectionService.#workspaceGrantIdForArtifactMatch` 因此需要从 Task locked Runtime Selection 恢复
Workspace authority，但原实现调用 `loadTaskRuntimeSelection()`，只能解析 legacy selection；VS2 真实 Task 使用
v1alpha4 readable selection，strict parse 失败后最终被既有安全错误映射为 `task.not_found`。

本批只做一处生产语义修复：

- 将上述 authority 读取切换为既有 `loadReadableTaskRuntimeSelection()`；
- authority 仍只来自该 Task 的 locked selection 与持久化 active WorkspaceGrant；
- 未增加 current Workspace、Renderer state、绝对路径或 fixture fallback；
- Main、Preload、Renderer production source 均零修改。

注意：当前工作区中 Task projection 的 summary 路径此前已使用 readable loader；该既有改动不属于 repair.3 的新增
生产接缝。repair.3 的唯一新增生产改动是 Artifact source authority 调用点。

## 3. 聚焦测试

新增 regression 构造真实等价事实：

- succeeded Tool Observation 不携带 `workspaceGrantId`；
- Task 持久化 strict v1alpha4 Runtime Selection；
- legacy loader 被设为一旦调用即失败；
- readable loader 返回 exact locked `workspaceGrantId`；
- source result 精确返回既有 taskId、relativePath 与 workspaceGrantId。

验证结果：

- 单点 focused：`1 file / 12 tests PASS`；
- VS2.3 recovery + Task projection + Desktop preview focused：`8 files / 105 tests PASS`；
- Core/Desktop typecheck：PASS；
- focused ESLint：PASS。

## 4. 真实 Electron E2E

复用原命令：

```text
CI=true pnpm run e2e:mvp-vs2
```

结果为 `PASS`，关键事实：

- real Electron Main/Renderer/Main IPC/Core child/SQLite reopen/Document Worker/Gateway HTTP-SSE 全部为 true；
- Core SIGKILL 后使用新 PID 与原 SQLite 恢复；
- round-1=1、round-2 accept=1、round-2 SSE subscription=2、round-3=1、Gateway total=3；
- read Tool=1、write Tool=1、PPTX Artifact=1；
- “读取资料 / 生成成果”两段业务步骤可见；
- `pptxPreviewReady=true`、PPTX 文件存在且大小为 45553 bytes；
- sandbox/contextIsolation/nodeIntegrationDisabled 均为 true。

Electron 控制台出现 iframe 对预览 URL 的 CSP 导航警告，但 E2E 的正式 preview session/iframe ready 断言通过，
未造成产品链路失败；该警告不被描述为新的产品能力或 readiness。

## 5. 边界门禁

- `CI=true pnpm run audit:dtp4`：PASS；
- `git diff --check`：PASS；
- lockfile digest：`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
- migration max：26；
- Contracts、依赖、lockfile、Gateway wire、Desktop API、Main/Preload/Renderer production routing 均未修改；
- Root/Core 与 DTP-4 版本审计同步为 `0.0.0-mvp.vs2.3`；Desktop 保留并行前端版本
  `0.0.0-dfe.run.1.repair.2`，Contracts/Admin 保持冻结版本。

## 6. QA 交接

独立 QA 应聚焦确认：

1. 根因是否确为 legacy-only loader 无法读取 v1alpha4 selection；
2. repair.3 是否仅修改 Artifact source authority 的单一 production 调用点；
3. v1alpha4 regression 是否保证 readable loader 被调用且 legacy loader 为零调用；
4. 同一真实 Electron E2E 是否复跑得到 `pptxPreviewReady=true` 与上述精确计数；
5. Contract/migration/依赖/lockfile及下游 GATED 边界是否不漂移。

独立 QA 已完成并经用户接受：repair.3、父 VS2.3 与 MVP-VS2 正式 `PASS/CLOSED`。
