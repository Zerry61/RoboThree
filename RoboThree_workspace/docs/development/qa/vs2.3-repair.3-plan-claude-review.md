# MVP-VS2.3 repair.3 — Tool-generated Artifact Preview Authority — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-1410-plan-vs2.3-repair.3` |
| 验收对象 | [MVP-VS2.3 repair.3 — Tool-generated Artifact Preview Authority 极小方案](../MVP-VS2.3-REPAIR.3-TOOL-GENERATED-ARTIFACT-PREVIEW-AUTHORITY-PLAN.md)（仅文档级复核；不重做 repair.1/repair.2/Revision 1 全评审；编码仍 GATED） |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改方案、业务代码、Contract、依赖、migration、lockfile） |
| 上游 | VS2.1 / VS2.2 `PASS/CLOSED`；VS2.3 repair.2 `PASS/CLOSED`（代码 QA 已确认 P0~P3 全 0）；父 VS2.3 因 PPTX preview `vs2_pptx_preview_not_ready` / `task.not_found` 仍处于 `IMPLEMENTATION STOP` |
| 开发者自检 | `DOCUMENT REVIEW PENDING / CODING GATED`，自报 QA-001~QA-016 连续唯一、`git diff --check` PASS |
| 当前状态 | `CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围（仅本 repair.3 与父 PPTX preview 阻塞的差异）

不重做 repair.1/repair.2/Revision 1 全评审；只确认本 repair.3 相对父停手的差异：

1. 是否先证明失败层（Core source authority / private parser / Main PPTX routing）再定最小接缝；
2. 是否只修改命中失败层的单一最小文件集合；
3. authority 是否只来自 Task locked Runtime Selection + persisted active WorkspaceGrant；
4. 是否不新增 Contract / Desktop API / migration / 依赖 / durable fact / 状态机 / 错误码；
5. 是否复用同一真实 Electron E2E、不建立新 Harness / Evidence schema；
6. 16 项 focused QA 是否连续唯一、`git diff --check` 是否通过；
7. 12 项强制停手条件是否与本批边界自洽。

### 1.2 方法

- 全文精读方案（175 行，9 节）；
- 只读核对代码：`desktop-task-projection-service.ts` (`resolveArtifactFileSource` + `#workspaceGrantIdForArtifactMatch` + `#findArtifact`)、`desktop-application-facade.ts` (mapError)、`desktop-ipc-router.ts` (`#startArtifactHtmlPreview` + `#startPptxHtmlPreview`)、`desktop-error-presentation.ts`；
- 程序化核对 16 项 QA 编号 + 实跑 `git diff --check`；
- 核对 PPTX preview 失败链实际落点（哪些层字面持有失败信号）。

---

## 二、关键事实核对（聚焦方案引用的事实）

### Q1：父 PPTX preview 失败链的实际落点

**答：✅ 完整还原，与方案 §1 字面对齐。**

| 方案声明 | 代码字面 | 结果 |
|---|---|---|
| Renderer 通过 `window.robothreeDesktop.startArtifactHtmlPreview(...)` 调用 Main | [create-desktop-api.ts:616-617](apps/desktop/src/preload/create-desktop-api.ts#L616-L617) `invoke(DESKTOP_IPC_CHANNELS.artifactHtmlPreview, ...)`；[desktop-ipc-router.ts:229-230](apps/desktop/src/main/desktop-ipc-router.ts#L229-L230) `case DESKTOP_IPC_CHANNELS.artifactHtmlPreview` | ✅ |
| Main `#startArtifactHtmlPreview` 优先尝试 PPTX | [desktop-ipc-router.ts:439-455](apps/desktop/src/main/desktop-ipc-router.ts#L439-L455) `startWorkspaceHtmlPreview → startPptxHtmlPreview → previewArtifact(mode: "markdown")` **三级回退** | ✅ |
| `#startPptxHtmlPreview` 先 `resolveArtifactFileSource` | [desktop-ipc-router.ts:484-491](apps/desktop/src/main/desktop-ipc-router.ts#L484-L491) | ✅ |
| Core `DesktopTaskProjectionService.resolveArtifactFileSource` 只允许从 Task Tool Observation 或 manual Artifact 找 | [desktop-task-projection-service.ts:967-1010](services/core/src/application/desktop-task-projection-service.ts#L967-L1010) `#findArtifact` 扫描 session + tasks + step.observation.outcome === "succeeded" | ✅ |
| `workspaceGrantId` 从 Tool action payload 或 Runtime Selection 读取 | [desktop-task-projection-service.ts:1113-1124](services/core/src/application/desktop-task-projection-service.ts#L1113-L1124) `#workspaceGrantIdForArtifactMatch` 优先 match.workspaceGrantId → payload.workspaceGrantId → `loadTaskRuntimeSelection(match.internalTaskId)?.workspaceGrantId` | ✅ |
| 当前返回 `task.not_found` | Core 返回 `desktop.artifact_not_found` 或 `desktop.artifact_unavailable` → [desktop-application-facade.ts:2180](services/core/src/application/desktop-application-facade.ts#L2180) `mapErrorCode("desktop.artifact_not_found") || mapErrorCode("desktop.artifact_unavailable")` 全部归一化为 `"task.not_found"` → [desktop-error-presentation.ts:22](apps/desktop/src/renderer/presentation/desktop-error-presentation.ts#L22) safeSummary "任务不存在或已关闭，请刷新任务列表。" | ✅（链路真实存在） |
| `safe_failure_task_not_found` 实为 Renderer 看到的 `task.not_found` safe summary 文案 | 字符字面 "safe_failure_task_not_found" 在仓库代码/文档中无字面匹配；应是停手报告对 Renderer 文案前缀的描述性表述，**不存在独立的错误码** | ⚠️ 见 P2-1 |

**评估**：父停手报告指出的失败点（"既有 safe API 返回 `task.not_found`"）与代码字面完全对齐：Core `resolveArtifactFileSource` 在 restart 后要么找不到 Artifact，要么找不到 workspace authority，要么 grant 非 active；任一情况都被 `mapErrorCode` 归一化为 `task.not_found`，**Renderer 看到的实际就是该错误码**。

### Q2：方案是否先证明失败层再定最小接缝

**答：✅ 严格 Step 1 决策树结构。**

- §3 步骤 1-6 用 focused test 构造与真实 E2E 等价的 durable facts，分别断言 6 维（Artifact ID 唯一 / internalTaskId 与 Desktop taskId 转换 / Runtime Selection workspaceGrantId / relativePath / 六字段 exact / Core vs Main routing）；
- §3 决策分支 4 条：
  1. Core restart 后 source authority 丢失 → 只修复 `#workspaceGrantIdForArtifactMatch`；
  2. Core 返回正确但 private parser 拒绝 → 只修复 `core-private-client` parser；
  3. Main 收到 typed failure 错误 fallback → 只修复 PPTX routing；
  4. 必须新增 durable fact / API / migration → **立即停手，RED**。
- §2.1 明确"实际编码只能选择上述最小命中集合，不能四处同时改动"——这一约束与停手 #10（"修复必须同时改 Core source authority 和 Main routing，但无法证明两处均为必要最小改动"）自洽。

### Q3：authority 是否只来自 Task locked Runtime Selection + persisted active WorkspaceGrant

**答：✅ 与代码字面对齐。**

- `#workspaceGrantIdForArtifactMatch` 优先级：① match 自身 workspaceGrantId → ② Tool action payload.workspaceGrantId → ③ `loadTaskRuntimeSelection(internalTaskId).workspaceGrantId`；
- §4.1 字面 "source authority 只能来自该 Task 已锁定的 `workspaceGrantId` 与持久化 active WorkspaceGrant"——与代码字面 `loadTaskRuntimeSelection` + `loadWorkspaceGrant(workspaceGrantId) && grant.status === "active"` 完全一致；
- §2.2 禁止 "current Workspace、Renderer 选择、绝对路径或 fixture 当作 authority fallback" —— 与现有代码无 fallback（无 current Workspace authority 兜底）。

### Q4：是否不新增 Contract / API / migration / 依赖 / durable fact / 状态机 / 错误码

**答：✅ 严格自洽。**

- §2.2 禁止清单 9 项 + §7 停手条件 12 项互锁；
- 修复范围限制在 §2.1 4 个生产文件 + focused tests + 同一 E2E script + 治理文档；
- §7 停手 #1-#3 + #5/#6/#7/#8 兜底"必须新增 Contract/migration/durable fact/error code/dependency 时立即停手"；
- "不修改 Gateway、Provider、Agent Loop、Tool dispatch 或 deadline recovery"（§7#7）—— 与 repair.2 边界对齐。

### Q5：是否复用同一真实 Electron E2E，不建立新 Harness / Evidence schema

**答：✅。**

- §0 + §5 "复用同一真实 Electron E2E"；
- §5 列举 9 项必验事实，全部在父 VS2.3 既有 E2E（[run-mvp-vs2-electron.mjs](scripts/run-mvp-vs2-electron.mjs)）断言范围内；
- 不建立新 Harness 或 Evidence schema——与父 VS2.3 计划 §11 Evidence 字段（已含 `gatewayRequestCount / roundOneRequestCount / roundTwoRequestCount` 等）兼容。

### Q6：16 项 QA + git diff --check

**答：✅。**

- QA-001..QA-016 恰好 16 个唯一 ID、连续无缺号（程序化核对）；
- 实跑 `git diff --check` exit 0；
- 16 项 QA 覆盖：Artifact ID 不漂移 / Desktop vs internal taskId / Runtime Selection workspaceGrantId / revoked/missing grant fail-closed / non-succeeded observation fail-closed / relativePath fail-closed / Core 六字段 exact / private parser 一致 / PPTX 不进 markdown fallback / typed failure 不被改写 / contained-file + source drift 校验 / Renderer 无 rootRealPath / E2E 计数不漂移 / iframe ready / gate 全 PASS / 边界不漂移。
- 与父 VS2.3 计划（24 项 focused QA）相比收缩聚焦在 PPTX preview 单一链路上。

### Q7：12 项强制停手条件

**答：✅ 与本批边界严格自洽。**

- #1-#3 兜底"不得新增 Contract / migration / current Workspace authority fallback"；
- #4-#8 兜底"不得放宽 source identity / sandbox / 跨组件修改 / 新增依赖 / 通用预览框架"；
- #9 与父 VS2.3 互锁（E2E 重复 accept/Tool/Artifact/Assistant 即停手）；
- #10 关键约束"修复必须同时改 Core source authority 和 Main routing 但无法证明两处均为必要最小改动"——与方案 §2.1 "只能选择最小命中集合，不能四处同时改动" 字面互锁；
- #11 兜底"不得泄漏 rootRealPath / Token / 附件内容到 Renderer / 日志 / Evidence"；
- #12 兜底"不得为通过测试新增 production barrier / sleep / retry"。

---

## 三、发现的问题

### 无 P0 / 无 P1

### P2-1 — "safe_failure_task_not_found" 字面与代码不对应（精确性）

- 父停手报告 §2 + 方案未引用具体代码命名，但使用了"`safe_failure_task_not_found`"字面；
- 全仓库代码/文档搜索（排除 node_modules）无此字符串字面匹配；
- 实际链路：Core 返回 `desktop.artifact_not_found` / `desktop.artifact_unavailable` → `mapErrorCode` 归一化为 `task.not_found` → Renderer `desktop-error-presentation.ts:22` safeSummary `"任务不存在或已关闭，请刷新任务列表。"`；
- 评估：父停手报告与本方案的 `safe_failure_task_not_found` 应为对 Renderer 文案前缀的**口语化描述**（"safe failure summary for task.not_found"），而非正式错误码；
- 不影响通过：方案 §4.7 "不更改 `task.not_found` 等冻结公开错误集合" + §7#8 "不新增错误码" 已显式锁定；
- 建议（不阻断）：实施报告里把"safe_failure_task_not_found"映射为正式 `task.not_found` + safe summary 字面，避免后续 QA 评审误判。

### P3-1 — §4.7 "不更改 `task.not_found` 等冻结公开错误集合" 与本批"只修复命中层"的关系需澄清（精确性）

- 现有 `desktop.artifact_not_found` / `desktop.artifact_unavailable` → `task.not_found` 的归一化映射位于 [desktop-application-facade.ts:2180](services/core/src/application/desktop-application-facade.ts#L2180)；
- 方案 §4.7 说"不更改 `task.not_found` 等冻结公开错误集合"——若实际根因命中 Core source authority 丢失，修复后应返回成功而非归一化为 `task.not_found`，**`task.not_found` 仍是失败时的正确公开错误**；
- 字面"不更改"正确指"不修改该错误码本身的字符串与映射"——而不是"不修复返回该错误的根因"；
- 不影响通过，但 Step 1 实施前应在 commit message 备注澄清。

### P3-2 — §5 "iframe `HTML 成果预览` ready" 与既有 `safe_failure_task_not_found` 资源清理的边界（精确性）

- 方案 §5 要求 "iframe ready" + "preview session、Electron/Core/临时目录等既有资源清理完成"；
- 既有 `desktop-ipc-router.ts:1065+` 已有 preview session 清理逻辑（未在本批方案中显式复核）；
- 不影响通过：资源清理属于既有代码边界，方案只新增"完成后清理"作为 E2E 验证项。

---

## 四、聚焦评审问题（针对本 repair.3 的差异部分）

1. **是否接受 repair.3 只修复 Tool-generated PPTX 在 restart 后的既有 source authority/preview routing？** —— ✅ 接受。父停手已锁定阻塞点，本批范围严格匹配。
2. **是否接受 Step 1 先定层，再只修改命中的最小文件集合？** —— ✅ 接受且**建议采纳**。决策树结构清晰，与停手 #10 互锁。
3. **是否接受 authority 只能来自 Task locked Runtime Selection + persisted active WorkspaceGrant？** —— ✅ 接受。与 `#workspaceGrantIdForArtifactMatch` + `loadTaskRuntimeSelection` + `loadWorkspaceGrant(status === "active")` 字面对齐。
4. **是否接受不新增 durable fact、Contract、API、migration、依赖或错误码？** —— ✅ 接受。§2.2 + §7 互锁。
5. **是否接受 Core typed failure 不得由 Main fallback 吞掉或改写？** —— ✅ 接受。§4.6 missing/revoked/deleted/unsafe/drift 全 fail-closed；QA-010 对应。
6. **是否接受继续复用同一真实 Electron E2E，不建立新 Harness/Evidence schema？** —— ✅ 接受。
7. **是否确认本批通过只关闭 VS2.3 当前 preview blocker，不代表 production ready 或下游解锁？** —— ✅ 接受。§0 末尾明文。

---

## 五、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 1，P3 = 2
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
```

**与开发者自检的差异**：开发者自检未给出 P 级；严格复核发现 **1 项 P2**（"safe_failure_task_not_found" 字面与代码不对应）+ **2 项 P3**（§4.7 与"只修复根因"边界澄清 + §5 资源清理边界）。**无 P0 / 无 P1**，全部 P2/P3 均为"实施精确性"层面（方案意图明确、QA 已覆盖），**不阻断授权**。

**对编码授权的条件**：用户接受本复核 + 接受 §8 Q1-Q7 + 接受 P2-1/P3-1 在实施报告/Step 1 commit message 中以备注形式澄清后，**可单独授权编码**。

**本复核未触发任何 RED**。

---

## 六、与既有的 RoboThree 评审规则对齐

- 仅复核本次 repair.3 方案的差异部分，不重做 repair.1 / repair.2 / Revision 1 全评审（按用户指示）；
- 因 `0.0.0-mvp.vs2.3` 仍未建立（处于 `IMPLEMENTATION STOP`，父停手待修复后重建），本复核报告**不**回链到 DEVELOPMENT-LOG（与 Revision 1 / repair.1 / repair.2 评审一致的处理）；
- 报告落盘到 `docs/development/qa/vs2.3-repair.3-plan-claude-review.md`，遵循 `<version-or-scope>-claude-review.md` 命名规范；
- 严格保持只读，未修改任何文件。

— Claude Code（独立文档复核，只读）
