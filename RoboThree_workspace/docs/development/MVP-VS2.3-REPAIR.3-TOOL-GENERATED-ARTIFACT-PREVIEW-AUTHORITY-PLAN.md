# MVP-VS2.3 repair.3 — Tool-generated Artifact Preview Authority 极小实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-30  
> 上游：VS2.1、VS2.2、VS2.3 repair.2 `PASS/CLOSED`；父 VS2.3 `IMPLEMENTATION STOP`  
> 预计投入：0.25～0.5 个集中工程日  
> 触发事实：[PPTX Preview Source Authority 停手报告](./MVP-VS2.3-PPTX-PREVIEW-AUTHORITY-IMPLEMENTATION-STOP-REPORT.md)

## 0. 决策摘要

repair.3 只修复一个已经由同一真实 Electron E2E 证明的 MVP 阻塞：Core 重启后，已完成 Task 的
Tool-generated PPTX Artifact 在既有 HTML preview 链中返回 `task.not_found`。

本批不预设缺陷位于 Core 或 Main。编码 Step 1 必须先使用现有接口和测试证明失败层，然后只修改命中的单一接缝：

```text
Task durable Tool Observation
→ existing Artifact projection
→ exact locked WorkspaceGrant authority
→ Core resolveArtifactFileSource
→ Main contained-file validation
→ existing PPTX renderer
→ existing HtmlPreviewSandbox
```

最高输出仍只能是父 VS2.3 既有 outcome：

```text
MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT
```

不得建立新的 Artifact 平台、恢复状态机、Contract 或产品能力。

## 1. 已确认事实

1. Task 在 Core SIGKILL、新 Core、SQLite 原库 reopen 后为 `completed`；
2. round-1/round-2/round-3、DOCX read、PPTX write 均已完成且无重复；
3. Task Detail 能读取同一 PPTX Artifact，Artifact ID 合法、文件真实存在且非空；
4. Renderer 已通过既有 `window.robothreeDesktop.startArtifactHtmlPreview(...)` 调用 Main；
5. Main `#startPptxHtmlPreview` 先调用既有 `resolveArtifactFileSource({ artifactId })`；
6. Core `DesktopTaskProjectionService.resolveArtifactFileSource` 只允许从 Task Tool Observation 或 manual Artifact
   找到 Artifact，并从 Tool action payload 或 exact Task Runtime Selection 取得 `workspaceGrantId`；
7. 重启后 Workspace authority 列表仍有一个 active authority；
8. 当前 safe result 为 `task.not_found`，iframe 未创建；
9. `task.not_found` 可能是 Core `desktop.artifact_not_found/unavailable` 的既有映射，也可能是 Main source failure
   后落入通用 preview fallback 的结果，现阶段不得臆测根因。

## 2. 范围

### 2.1 允许修改（只有命中失败层时才允许）

- `services/core/src/application/desktop-task-projection-service.ts`：仅 exact Tool Artifact → locked WorkspaceGrant
  source authority 解析；
- `services/core/src/application/desktop-application-facade.ts`：仅现有 private source result 的 exact 投影；
- `apps/desktop/src/main/core-private-client.ts`：仅既有 Artifact source private parser 与真实返回值一致性；
- `apps/desktop/src/main/desktop-ipc-router.ts`：仅 PPTX source result 的 exact routing，禁止通用 fallback 吞掉 typed failure；
- 对应 focused tests；
- 同一 `scripts/run-mvp-vs2-electron.mjs`；
- 实施报告与治理文档。

实际编码只能选择上述最小命中集合，不能四处同时改动。

### 2.2 明确禁止

- 不修改 `packages/contracts/src/**` 或 Desktop public/Preload API；
- 不新增 migration、表、列、索引、durable fact 或第二套 Artifact 状态；
- 不新增依赖，不修改 lockfile；
- 不修改 Gateway wire、Model/Agent/Skill/Tool 协议或执行语义；
- 不把 current Workspace、Renderer 选择、绝对路径或 fixture 当作 authority fallback；
- 不把 Tool Artifact 重新注册成 manual Artifact；
- 不绕过 contained-file identity、SHA-256/size、扩展名或 sandbox 校验；
- 不新增错误码、通用预览平台、诊断框架或 Evidence schema；
- 不修改 repair.2 deadline/SSE recovery 语义；
- Personal Model、Admin mutation、TGM、Knowledge Provider、Agent Lifecycle 继续 GATED。

## 3. Step 1 — 先证明失败层

使用 focused test 构造与真实 E2E 等价的 durable facts，并分别断言 Core restart 前后：

1. exact Artifact ID 能从 succeeded PPTX Tool Observation 唯一重建；
2. `internalTaskId` 与 Desktop `taskId` 不混用；
3. Task Runtime Selection 中的 `workspaceGrantId` 与 durable active WorkspaceGrant exact match；
4. `relativePath` 来自 Tool Observation，保持安全工作空间相对路径；
5. Core private source result 只含既有六字段，不包含新 authority 或真实路径泄漏到 Renderer；
6. Main 收到 Core success 时进入 PPTX route；Core typed failure 时原样 fail-closed，不落入 markdown fallback。

判定分支：

- 若 Core restart 后 source authority 丢失：只修复 `#workspaceGrantIdForArtifactMatch` 对既有 locked selection 的读取；
- 若 Core 返回正确而 private parser 拒绝：只修复 parser 与既有六字段的精确一致性；
- 若 Main 收到 typed failure 后错误 fallback：只修复 PPTX routing，使 typed failure 保持 fail-closed；
- 若必须新增 durable fact、API 字段、migration 或 current Workspace fallback：立即停手，方案 RED，不编码。

## 4. Step 2 — 最小修复规则

无论命中哪一层，都必须满足：

1. source authority 只能来自该 Task 已锁定的 `workspaceGrantId` 与持久化 active WorkspaceGrant；
2. Artifact 必须属于该 Task 的 succeeded Tool Observation，且 source/observation identity exact match；
3. Core restart 前后返回的 artifactId/taskId/relativePath/workspaceGrantId 语义一致；
4. 文件读取仍由 Main 在 workspace root 内做 contained-file 校验；Renderer 永远不获得 `rootRealPath`；
5. `.pptx` 才进入既有 PPTX HTML renderer；其他类型保持现状；
6. missing/revoked WorkspaceGrant、deleted Artifact、unsafe path、source drift 全部继续 typed fail-closed；
7. 不更改 `task.not_found` 等冻结公开错误集合，只纠正错误发生层或路由；
8. 不新增 retry、sleep、current-state fallback 或测试专用生产分支。

## 5. Step 3 — 同一真实 Electron E2E

修复后只恢复同一 VS2 E2E，必须同时证明：

- 一次 round-2 accept、两次 SSE subscription、同一 invocation；
- Core SIGKILL、新 PID、SQLite 原库 reopen；
- read/write Tool 各一次，round-3 一次；
- Task completed、Assistant/Artifact 各一份；
- “读取资料 / 生成成果”两段业务步骤可见；
- 用户通过现有 Task 页按钮启动 PPTX HTML preview；
- iframe `HTML 成果预览` ready；
- Renderer/日志/错误/E2E 输出不含 rootRealPath、Token 或附件内容；
- E2E 完成后 preview session、Electron/Core/临时目录等既有资源清理完成。

## 6. Focused QA（16 项）

1. QA-001：restart 前后 Tool-generated PPTX Artifact ID 唯一且不漂移；
2. QA-002：Desktop taskId 与 internalTaskId 精确转换，不双前缀、不混用；
3. QA-003：只读取 Task locked Runtime Selection 的 workspaceGrantId；
4. QA-004：WorkspaceGrant 缺失或 revoked 时 fail-closed；
5. QA-005：Tool Observation 非 succeeded 或 sourceId 不匹配时 fail-closed；
6. QA-006：relativePath 缺失/绝对/越界时 fail-closed；
7. QA-007：Core source result 六字段 exact，无新增字段；
8. QA-008：private parser success/failure 与 Core result 一致；
9. QA-009：PPTX success 进入既有 PPTX renderer，不进入 markdown fallback；
10. QA-010：typed source failure 不被 fallback 改写成另一失败；
11. QA-011：contained-file identity 与 source drift 校验保持；
12. QA-012：Renderer safe result 不含 rootRealPath；
13. QA-013：同一真实 Electron E2E 的 recovery/request/tool 计数不漂移；
14. QA-014：Task 页 PPTX iframe ready；
15. QA-015：focused tests、Core/Desktop typecheck、ESLint、DTP-4、diff-check PASS；
16. QA-016：Contract/migration/依赖/lockfile/下游 GATED 边界不漂移。

## 7. 停手条件

出现以下任一情况立即停手：

1. 需要新增或修改公开 Contract/Desktop API；
2. 需要 migration、新 durable field、表、列或索引；
3. 需要 current Workspace 或 Renderer 状态作为恢复 authority；
4. 无法唯一证明 Artifact 与 Task Tool Observation 的绑定；
5. 需要把 Tool Artifact 转成 manual Artifact；
6. 需要放宽 contained-file、source identity 或 sandbox 安全校验；
7. 需要修改 Gateway、Provider、Agent Loop、Tool dispatch 或 deadline recovery；
8. 需要新增依赖、通用预览框架、状态机或错误码；
9. 同一真实 E2E 出现重复 accept/Tool/Artifact/Assistant；
10. 修复必须同时改 Core source authority 和 Main routing，但无法证明两处均为必要最小改动；
11. 任一 rootRealPath、Token、附件内容进入 Renderer/日志/Evidence；
12. 为通过测试必须新增 production barrier、sleep 或 retry。

## 8. 评审问题

1. 是否接受 repair.3 只修复 Tool-generated PPTX 在 restart 后的既有 source authority/preview routing？
2. 是否接受 Step 1 先定层，再只修改命中的最小文件集合？
3. 是否接受 authority 只能来自 Task locked Runtime Selection + persisted active WorkspaceGrant？
4. 是否接受不新增 durable fact、Contract、API、migration、依赖或错误码？
5. 是否接受 Core typed failure 不得由 Main fallback 吞掉或改写？
6. 是否接受继续复用同一真实 Electron E2E，不建立新 Harness/Evidence schema？
7. 是否确认本批通过只关闭 VS2.3 当前 preview blocker，不代表 production ready 或下游解锁？

## 9. 实施状态

用户已接受聚焦方案并授权编码。Step 1 证明失败层唯一位于 Core source authority：Tool action payload 不含
`workspaceGrantId` 时，`DesktopTaskProjectionService` 使用 legacy-only Runtime Selection loader 读取真实
v1alpha4 selection，strict parse 失败后经既有错误映射表现为 `task.not_found`。

repair.3 只将该调用改为既有 readable union loader，未修改 Main、Preload、Renderer production code，也未新增
Contract、migration、依赖、状态机、错误码或 Evidence schema。同一真实 Electron E2E 已验证 Core SIGKILL、SQLite
reopen、read/write Tool、业务步骤与恢复后 PPTX HTML preview 全部通过。详见
[repair.3 实施报告](./MVP-VS2.3-REPAIR.3-TOOL-GENERATED-ARTIFACT-PREVIEW-AUTHORITY-IMPLEMENTATION-REPORT.md)。

独立 QA 已确认 `CODE_QA_PASS`、P0～P3 全 0；用户随后接受并进入下一步，repair.3 正式 `PASS/CLOSED`。
本次关闭不自动恢复任何下游。
