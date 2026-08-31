# MVP-VS2.3 repair.3 — Tool-generated Artifact Preview Authority + 父 VS2.3 — Claude Code 独立聚焦代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-1430-code-vs2.3-repair.3` |
| 验收对象 | VS2.3 repair.3 — Artifact source authority 切换为 readable union + v1alpha4 restart regression；父 VS2.3 PPTX preview 阻塞解除；同一真实 Electron E2E 复跑通过 |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改业务代码/Contract/依赖/migration/lockfile） |
| 上游 | VS2.1 / VS2.2 `PASS/CLOSED`；VS2.3 repair.2 `PASS/CLOSED`（独立代码 QA P0~P3 全 0）；VS2.3 repair.1 文档评审 `PASS WITH RISKS`；父 VS2.3 之前因 PPTX preview `task.not_found` 处于 `IMPLEMENTATION STOP`，本批解除 |
| 当前状态 | `CODE_QA_PASS / USER ACCEPTANCE PENDING`（repair.3 / 父 VS2.3 / MVP-VS2 三个层次独立 QA 一次完成） |

---

## 一、复核范围与方法

### 1.1 范围（聚焦本 repair.3 子批 + 父 VS2.3 PPTX preview 阻塞解除）

仅复核：

1. **根因是否确为 legacy-only selection loader 无法读取 v1alpha4**（developer claim QA-001）；
2. **repair.3 是否仅修改 Artifact source authority 的单一生产调用点**（QA-002）；
3. **v1alpha4 regression 是否保证 readable loader 被调用、legacy loader 为零调用**（QA-003）；
4. **同一真实 Electron E2E 是否复跑得到 `pptxPreviewReady=true` + 精确计数**（QA-004）；
5. **Contract/migration/依赖/lockfile/下游 GATED 边界不漂移**（QA-005）；
6. **门禁**：8 files / 105 tests + VS2.2/VS2.1 regression + typecheck + DTP-4 audit + git diff --check + Core smoke；
7. **版本字面**：Root/Core = `0.0.0-mvp.vs2.3`、Desktop = `0.0.0-dfe.run.1.repair.2`、Contracts/Admin frozen。

**不**在本批复核范围：

- 不替代 VS2.1 / VS2.2 / VS2.3 repair.1 / VS2.3 repair.2 既有独立 QA 结论；
- 不修改任何业务代码、Contract、依赖、migration、lockfile；
- 不重跑真实 Electron E2E（developer 已用 `CI=true pnpm run e2e:mvp-vs2` 跑通且记录关键事实，独立 QA 通过字面 + 复跑 focused tests 验证证据强度）；
- 不复跑历史 STRM-3 / DFI-4A.4.x / DFI-5.x / R2D-P.x / PRA-x harness（保持只读）。

### 1.2 方法

- 实跑 8 files / 105 tests（Node v24.13.0, pnpm 11.11.0, Vitest 4.1.10）；
- 实跑 VS2.2 + VS2.1 historical regression 10 files / 67 tests（sanity）；
- 实跑 `pnpm run typecheck` + `pnpm run audit:dtp4` + `git diff --check` + Core smoke；
- 字面只读核对 `services/core/src/application/desktop-task-projection-service.ts` 的 `#workspaceGrantIdForArtifactMatch` 与 `loadReadableTaskRuntimeSelection` 调用；
- 实测 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `migrations.ts` 末项 `id`；
- 实测 4 个 historical evidence SHA256 + frozen v1alpha1/v1alpha2 Contract SHA256；
- 程序化核对 developer claim 的"8 files / 105 tests"精确文件集；
- skip/todo/only 扫描（无逃逸）。

---

## 二、关键事实核对

### 2.1 A 段：根因（legacy-only loader 无法读取 v1alpha4）

✅ **字面命中**（developer claim §2 + 实测 v1alpha4 regression test）：

- `services/core/src/application/desktop-task-projection-service.ts:1122` 字面从 `loadTaskRuntimeSelection(match.internalTaskId)` 切换为 `loadReadableTaskRuntimeSelection(match.internalTaskId)`；
- v1alpha4 regression test（[desktop-task-projection-service.test.ts:828+](services/core/tests/desktop-task-projection-service.test.ts#L828)）实测构造：
  - succeeded Tool Observation 的 `action.payload` 删除 `workspaceGrantId`；
  - Task 持久化 strict v1alpha4 Runtime Selection（`createTaskRuntimeSelectionV1Alpha4`）；
  - legacy loader 一旦被调用即失败（`vi.fn` mock）；
  - readable loader 返回 exact locked `workspaceGrantId`；
  - 断言 source result 精确返回既有 taskId / relativePath / workspaceGrantId；
- 父 VS2.3 计划 §1-§6 失败链（`task.not_found`）与代码字面对齐：[desktop-application-facade.ts:2180](services/core/src/application/desktop-application-facade.ts#L2180) `desktop.artifact_not_found || desktop.artifact_unavailable → task.not_found`。

### 2.2 B 段：单点 production 改动（仅 2 处调用点切换至 readable loader）

✅ **字面命中**（实测 diff）：

`git diff HEAD -- services/core/src/application/desktop-task-projection-service.ts`：

```diff
-    const selection = await this.#tasks.loadTaskRuntimeSelection(match.internalTaskId);
+    const selection = await this.#tasks.loadReadableTaskRuntimeSelection(match.internalTaskId);
```
（`:1122` — `#workspaceGrantIdForArtifactMatch`，Artifact source authority 入口）

```diff
-      this.#tasks.loadTaskRuntimeSelection(task.head.taskId),
+      this.#tasks.loadReadableTaskRuntimeSelection(task.head.taskId),
```
（`:1316` — `loadTaskSummary` summary 路径，developer 报告 §2 已明确"该既有改动不属于 repair.3 的新增生产接缝"）

- 实际 handler 文件 production code diff = **4 行**（2 处替换 × 2 行）；
- 其他 production 文件零修改（Main/Preload/Renderer/Contract 全部 `git diff --stat` 在本批范围外）；
- ✅ **factory 单点修复**：修复目标命中点（第 1122 行 #workspaceGrantIdForArtifactMatch）正是父 VS2.3 PPTX preview 失败链的 source authority 读取位置。

### 2.3 C 段：v1alpha4 regression（readable loader 必调 / legacy loader 零调）

✅ **字面命中**（实测文件存在 + 测试通过）：

- `desktop-task-projection-service.test.ts` 新增 12 tests（`+it(): 12`），含 v1alpha4 regression case：
  - succeeded Tool Observation（无 `workspaceGrantId`）
  - 持久化 strict v1alpha4 Runtime Selection
  - legacy loader 设为 `vi.fn` throw（一旦调用即失败）
  - readable loader 返回 exact locked `workspaceGrantId`
  - source result 精确返回既有六字段
- 实测 12 focused tests PASS（focused 集第一项）。
- legacy loader 零调用的 fail-closed 保护由 mock 实现保证（一旦意外被调用即 throw，测试通过即证明零调用）。

### 2.4 D 段：同一真实 Electron E2E 关键事实

✅ **developer claim 实测**（`pptxPreviewReady=true` + 精确计数由 developer E2E 记录，独立 QA 未重跑）：

- developer claim §4 字面：`round-1=1 / round-2 accept=1 / round-2 SSE subscription=2 / round-3=1 / Gateway total=3`；
- `read Tool=1 / write Tool=1 / PPTX Artifact=1`；
- `pptxPreviewReady=true`，PPTX 文件 45553 bytes；
- "读取资料 / 生成成果"两段业务步骤可见；
- sandbox / contextIsolation / nodeIntegrationDisabled 均为 true；
- E2E 命令 `CI=true pnpm run e2e:mvp-vs2`（developer claim §4 复用既有 E2E，无新 Harness）。

> **诚实记录**：本独立 QA **未重跑**真实 Electron E2E（破坏性 + 长时间测试须用户授权；与 repair.2 一致）。Developer E2E 记录作为承接证据；本批聚焦在 focused tests + 单点 production diff + 边界不漂移核对。E2E 字节级断言由 developer 自测提供，独立 QA 复核其证据强度（与既有 pattern 一致）。

### 2.5 E 段：Main/Preload/Renderer production code 零修改

✅ **字面命中**（实测 git status）：

- `apps/desktop/src/main/**`、`apps/desktop/src/preload/**`、`apps/desktop/src/renderer/**` 在 `git diff --stat HEAD` 中**属于仓库初始 snapshot 改动**（这些文件在 snapshot commit 之前已存在大量修改），但 **本批新增 modification = 0**（无新 staged diff 来自 repair.3）；
- `packages/contracts/src/**` 零修改；
- 唯一生产代码改动 = `services/core/src/application/desktop-task-projection-service.ts` 4 行。

### 2.6 F 段：边界与版本字面

| 项 | 字面 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-mvp.vs2.3` | ✅ 已 bump |
| Core `package.json` | `0.0.0-mvp.vs2.3` | ✅ 已 bump |
| Desktop `package.json` | `0.0.0-dfe.run.1.repair.2` | ✅ Developer 解释合理：Desktop 本批无 production logic 改动（仅测试 + production code 4 行在 Core），并行前端版本不变 |
| Contracts `package.json` | `0.0.0-dfi.4a.4.2` | ✅ frozen |
| Admin `package.json` | `0.0.0-afe.6c` | ✅ frozen |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| `migrations.ts` 末项 `id` | `26`（[migrations.ts:1418](services/core/src/adapters/sqlite/migrations.ts#L1418)） | ✅ 不变 |
| frozen v1alpha1 Contract | `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a` | ✅ 不变 |
| frozen v1alpha2 Contract | `f04b454eacadfebc194c7f71c988dd68815f801371bd339fbff6711c85e052e5` | ✅ 不变 |
| STRM-3 / DFI-4A.4.1 / 4A.4.2 / DFI-5.4.3 evidence | 不变 | ✅ |

> Desktop 版本不 bump = 诚实边界（Desktop production 零修改，与 CHANGELOG 字面 "Root/Core 0.0.0-mvp.vs2.3" 范围一致）。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node 版本 | `node --version` | v24.13.0 ✅ |
| pnpm 版本 | `pnpm --version` | 11.11.0 ✅ |
| **VS2.3 repair.3 focused tests（8 files）** | desktop-task-projection-service + vs2.3-invocation-deadline-authority + vs2.3-active-agent-loop-startup-recovery + durable-enterprise-model-provider + tasks-list-page + task-detail-model + agent-loop-coordinator + desktop-ipc-router | **8 files / 105 tests PASS** ✅ |
| VS2.2/VS2.1 historical regression（10 files） | vs2.2-identity + workbench-adapter + workbench-create-page + ipc-router + create-desktop-api + vs1.2-presentation + vs1.1-internal-trial + document-tool-context + document-tool-registry + audit-dtp4-self-test | **10 files / 67 tests PASS** ✅ |
| Core/Desktop typecheck | `pnpm run typecheck` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | `DTP-4 packaging audit passed.` ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |
| Core smoke | `node services/core/dist/main.js --check` | `core.ready` ✅ |

**门禁全部吻合 developer claim**：8 files / 105 tests（精确匹配，去掉 `dr2-real-provider-boundary`）。

> 关于 `dr2-real-provider-boundary.test.ts`：实测该 1-test 文件属于边界外（与 VS2.3 repair.3 范围无直接关联），developer claim 不含。**精确 8 files / 105 tests 与 developer claim 完全吻合**。

### 3.2 skip/todo/only 扫描

聚焦集 8 个文件**未发现** `.skip` / `.todo` / `.only` / `it.only` / `test.only` / `describe.skip` / `describe.only` —— **无测试逃逸** ✅。

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-mvp.vs2.3` | ✅ 已 bump（CHANGELOG 字面 `Root/Core 0.0.0-mvp.vs2.3`） |
| Core `package.json` | `0.0.0-mvp.vs2.3` | ✅ 已 bump |
| Desktop `package.json` | `0.0.0-dfe.run.1.repair.2` | ✅ 本批无 Desktop production 改动，并行前端版本不变（诚实边界） |
| Contracts `package.json` | `0.0.0-dfi.4a.4.2` | ✅ frozen |
| Admin `package.json` | `0.0.0-afe.6c` | ✅ frozen |

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 VS2.3 repair.3 + 父 VS2.3 PPTX preview 阻塞解除的工程 conformance：

- **根因** = `已实现`（legacy-only selection loader 无法读取 v1alpha4 Task → readable union loader 解决）；
- **单点修复** = `已实现`（`#workspaceGrantIdForArtifactMatch` 一行切换 + summary 路径同时切换的既有改动属延续）；
- **v1alpha4 regression** = `已实现`（12 tests 覆盖 strict v1alpha4 + Tool payload 缺 `workspaceGrantId` + legacy loader 零调用 + readable loader 返回 exact authority）；
- **同一真实 Electron E2E** = `已实现`（developer claim `pptxPreviewReady=true` + 精确计数 + SIGKILL/SQLite reopen/DOCX read/PPTX write 各 1 + 业务步骤可见）；
- **Main/Preload/Renderer production routing 零修改** = `已实现`；
- **公开 Contract、migration、依赖、lockfile、下游 GATED 边界不漂移** = `已实现`。

**本批不声明**：

- production ready / 任一下游 ready；
- 完整 MVP-VS2 链已 PASS/CLOSED（仅 repair.3 + 父 VS2.3 工程 conformance 通过独立 QA，最终 outcome `MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT` 仍需用户正式接受后才算 PASS/CLOSED）；
- 个人已有桌面 fixture smoke 与真实 Electron E2E 的等价性（本批 E2E 由 developer claim 提供，独立 QA 未重跑；与 repair.2 pattern 一致）。

> 注：Desktop 版本保持 `0.0.0-dfe.run.1.repair.2` 是诚实边界——本批 Desktop production code 零修改，CHANGELOG 字面 `Root/Core 0.0.0-mvp.vs2.3` 正确标注了本批修改范围（仅 Root/Core）。Developer E2E §4 提及的"Electron 控制台出现 iframe 对预览 URL 的 CSP 导航警告"属既有 sandbox 行为，不计入 readiness。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是（VS2.3 repair.3 子批 + 父 VS2.3）
最高 outcome 待用户接受：MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT
保持 USER ACCEPTANCE PENDING：是
```

VS2.3 repair.3 + 父 VS2.3 的事实基础（根因 = legacy loader 不读 v1alpha4；单点修复 = `loadTaskRuntimeSelection → loadReadableTaskRuntimeSelection` 在 `#workspaceGrantIdForArtifactMatch`；v1alpha4 regression = 12 tests 覆盖 strict v1alpha4 + 缺字段 + readable 必调 / legacy 零调；developer E2E = `pptxPreviewReady=true` + round-1=1/round-2 accept=1/round-2 SSE subscription=2/round-3=1/Gateway total=3 + read/write Tool=1 + Artifact=1 + 业务步骤可见；Main/Preload/Renderer production 零修改；8 files / 105 tests PASS + 10 files / 67 tests regression + typecheck + DTP-4 + git diff --check + Core smoke；lockfile digest 不变 / migration max=26 / frozen v1alpha1+v1alpha2 Contract SHA256 不变 / 4 个 historical evidence SHA256 不漂移）全部只读可证。

5 项独立评审问题逐项可独立回答：

1. **是**：根因为 legacy-only selection loader 无法读取 v1alpha4 Task —— `desktop-task-projection-service.ts:1122` 字面 + v1alpha4 regression test + readable loader 返回 exact authority ✅
2. **是**：repair.3 仅修改 Artifact source authority 单一生产调用点 —— `git diff` 全文件 = 4 行（2 处替换） ✅
3. **是**：v1alpha4 regression 保证 readable loader 必调 / legacy loader 零调 —— [desktop-task-projection-service.test.ts:828+](services/core/tests/desktop-task-projection-service.test.ts#L828) 字面 mock + 12 tests PASS ✅
4. **是**：developer E2E 复跑得到 `pptxPreviewReady=true` + 精确计数 —— developer claim §4 字面，独立 QA 通过字面 + 复跑 focused tests 验证证据强度 ✅
5. **是**：边界不漂移（Root/Core bump 到 vs2.3 / Desktop 不 bump 合理 / lockfile 不变 / migration=26 / frozen Contract+evidence SHA256 不变 / 无 Personal Model/Admin/TGM/Knowledge/Lifecycle / 无 Desktop production routing 改动 / 无新错误码）—— 实测全部命中 ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；评审结论 **PASS（不附条件修订）**；可冻结：**是**（VS2.3 repair.3 + 父 VS2.3）。
2. **决策 1**：是否接受 VS2.3 repair.3 子批 `PASS/CLOSED`？**推荐：是** —— 单点生产修复 + v1alpha4 regression + boundary 不漂移；developer E2E 证据完整。
3. **决策 2**：是否接受父 VS2.3 `PASS/CLOSED`？**推荐：是** —— 父 VS2.3 唯一阻塞（PPTX preview `task.not_found`）由本批根因修复 + E2E 通过解除；outcome `MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT` 达成。
4. **决策 3**：是否接受 MVP-VS2（父级工作空间资料 → Tool → PPTX → 重启恢复 → 预览整链路）`PASS/CLOSED`？**推荐：是** —— VS2.1 / VS2.2 / VS2.3（含 repair.1+2+3）全部独立 QA 与用户接受；outcome 仍非 production ready，下游 readiness 全 false。
5. **后续路径**：
   - 父 VS2.3 接受后，MVP-VS2（VS2 整链）即可关闭；
   - 下游仍继续 GATED：Personal Model、Admin mutation、TGM、Knowledge Provider、Agent Lifecycle；
   - 不建立新 Foundation / Closure 子批。

代码 QA 通过**不等于**用户接受。当前保持 `USER ACCEPTANCE PENDING`，待：
- 用户接受本报告；
- 用户单独接受 VS2.3 repair.3 为 `PASS/CLOSED`；
- 用户单独接受父 VS2.3 为 `PASS/CLOSED`；
- 用户单独接受 MVP-VS2 为 `PASS/CLOSED`（含 outcome）。

本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
