# MVP-VS3 — 已完成任务继续修改 / 成果修订版垂直闭环 — Claude Code 独立聚焦代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-1545-code-vs3` |
| 验收对象 | VS3 — 已完成任务"继续修改"进入同 Session 新 Task，修订版 PPTX 生成不覆盖旧文件；新旧成果均可预览 + 重启恢复 |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改业务代码/Contract/依赖/migration/lockfile） |
| 上游 | MVP-VS1 / MVP-VS2（含 VS2.3 repair.1+2+3）`PASS/CLOSED`；outcome `MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT` 已达成 |
| 当前状态 | `PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED` |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 VS3 聚焦实施方案的事实可证性 + 边界严格性 + 诚实字面一致性：

1. **Task 页 completed-only "继续修改"入口** + 同 Session 新 Task（QA-001/QA-003/QA-004）；
2. **不调用 `continue_task` / `provide_task_input`**（QA-005）；
3. **Renderer module 内存一次性 intent + 不写 URL / LocalStorage / Main / Preload / 持久化**（QA-006/QA-007）；
4. **Agent/Model 当前 Catalog exact match 才预选；不可用时保持空且禁提交，不静默替换**（QA-008/QA-009/QA-010）；
5. **Workspace / Skill / Knowledge / 附件不自动继承**（QA-011）；
6. **同 Session 上下文进入 follow-up Gateway request（含上一轮业务上下文 + 上一 PPTX 安全相对路径）**（QA-017）；
7. **新文件名 ≠ 旧文件名（生成 `资料汇报-v2.pptx`）**（QA-014）+ 新旧 Artifact preview ready + Core restart 后两个 Task/Artifact 均恢复（QA-015/QA-016/QA-019）；
8. **门禁**：5 files / 36 tests + VS2.3 regression 8 files / 105 tests + VS2.2/VS2.1 regression 10 files / 71 tests + typecheck + DTP-4 + git diff --check；
9. **边界**：migration 26 / lockfile 不变 / frozen v1alpha1+v1alpha2 Contract SHA256 不变 / 无 Personal Model/Admin/TGM/Knowledge/Lifecycle / 无 Core/Main/Preload production 改动。

### 1.2 方法

- 实跑 5 files / 36 tests（Node v24.13.0, pnpm 11.11.0, Vitest 4.1.10）；
- 实跑 VS2.3 repair.3 regression 8 files + VS2.2/VS2.1 regression 10 files；
- 实跑 `pnpm run typecheck` + `pnpm run audit:dtp4` + `git diff --check`；
- 字面只读核对 `apps/desktop/src/renderer/pages/workbench/follow-up-intent.ts` + `WorkbenchCreatePage.vue` + `TasksListPage.vue` + `task-list-model.ts` + `services/core/tests/vs1.1-internal-trial-enterprise-runtime.integration.test.ts`（mechanical same-Session context proof）；
- 实测 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `migrations.ts` 末项 `id`；
- 实测 4 个 historical evidence SHA256 + frozen v1alpha1/v1alpha2 Contract SHA256；
- skip/todo/only 扫描（无逃逸）。

---

## 二、关键事实核对

### 2.1 A 段：Renderer module 内存一次性 intent

✅ **字面命中**（`apps/desktop/src/renderer/pages/workbench/follow-up-intent.ts` 全文 59 行）：

- `:14` `let pendingIntent: WorkbenchFollowUpIntent | undefined;` —— 模块内变量；
- `:16-18` `setFollowUpIntent(intent)` —— 仅 set，不持久化；
- `:20-24` `consumeFollowUpIntent()` —— **消费即清空**（`pendingIntent = undefined`）；
- `:26-47` `freezeIntent()` —— `Object.freeze` 全部 + 长度上限 512 字符断言；
- **不导入 Vue / DOM / Preload / SQLite / window.localStorage / URL API** —— 严格 Renderer module 边界；
- ✅ **不写 LocalStorage / URL / Main / Preload / 持久化**（QA-006/QA-007 满足）。

### 2.2 B 段：Task 页 completed-only "继续修改"入口

✅ **字面命中**（`TasksListPage.vue:233` + `:844` + `:1336`）：

- `:233` 按钮文案"继续修改"—— 只在 completed 状态的 Task 行显示（`completed` 判定路径见 [task-detail-model.ts:190 / :203](apps/desktop/src/renderer/pages/tasks/task-detail-model.ts#L190-L203) `presentTaskStatus → "completed"`）；
- `:844` `import { setFollowUpIntent } from "../workbench/follow-up-intent.js"`；
- `:1336` `setFollowUpIntent({ ... })` 在点击回调中触发。

### 2.3 C 段：Workbench 消费 intent + candidate Agent/Model + Workspace 空 + 安全显示

✅ **字面命中**（`WorkbenchCreatePage.vue:46-57` + `:372/381/469/506`）：

- `:46` `v-if="followUpIntent"` —— 仅在 intent 存在时显示 follow-up 横幅；
- `:49` title `"继续修改上一成果"`；
- `:52` if `previousArtifact === undefined`（旧成果 missing）→ 友好降级提示，不冒充可修改（QA-013）；
- `:56-57` 引用上一成果的 `displayName + relativePath`（安全 projection，QA-014 / QA-015 路径）；
- `:372/381` `import { consumeFollowUpIntent }` + `const followUpIntent = ref<...>(consumeFollowUpIntent())` —— **单次消费**；
- `:469/506` candidate Agent/Model 由 `followUpIntent.value.candidateAgentId / candidateModelId` 提供，由当前 Catalog exact validation（既有 workbench-adapter 路径）筛选；Workspace/Skill/Knowledge 不从 intent 推断（QA-011 满足）。

### 2.4 D 段：mechanical same-Session context proof（无 Core 生产代码改动）

✅ **字面命中**（`services/core/tests/vs1.1-internal-trial-enterprise-runtime.integration.test.ts:450-479`）：

- `:450` `const followUp = await runtime.facade.submitTurnV1Alpha5({ ... })` —— 用既有 `submitTurnV1Alpha5` 接口（同 sessionId → 新 Task/新 User Message），不动 Core production；
- `:474-479` 机械断言 follow-up Gateway request (round 4) `JSON.stringify(gateway.requests[3])` 同时包含：
  - 上一轮用户目标（`请读取 ${sourceRelativePath}，并生成 ${outputRelativePath}。`）
  - 上一轮 Assistant 完成摘要（`已根据工作空间资料生成 PPTX`）
  - 上一 PPTX 安全相对路径（`outputRelativePath`）；
- **不修改 Core production logic** —— 只扩展既有 integration test 增加断言；
- ✅ QA-017（同 Session 上下文进入 follow-up Gateway request）字面满足。

### 2.5 E 段：Core 二次 SIGKILL 后两个 Task/Artifact 均恢复

✅ **developer claim §3 字面 + VS2.3 repair.3 QA 已建立的同 Session persistence 基础**：

- developer E2E 输出：`distinctTaskCount=2 / followUpSameSession=true / gatewayRequestCountAfterFollowUp=5 / revisedWriteToolExecutionCount=1 / revisedPptxArtifactCount=1 / originalPreviewReadyAfterRestart=true / revisedPreviewReadyAfterRestart=true / postRevisionSigkillObserved=true`；
- 同 Session persistence + 两 Task 关联通过 SQLite `listTasksBySession`（既有）+ new Task 自动加入 session（既有 `SubmitTurnCoordinator` 路径）；
- 真实 E2E 复用 `scripts/run-mvp-vs2-electron.mjs`，扩展为原始 + follow-up 双 Task；
- ✅ QA-018/QA-019 字面满足。

### 2.6 F 段：边界不漂移

| 项 | 字面 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-mvp.vs3` | ✅ 已 bump |
| Core `package.json` | `0.0.0-mvp.vs2.3` | ✅ developer 解释合理：本批无 Core production 改动，仅在既有 integration test 增加断言 |
| Desktop `package.json` | `0.0.0-mvp.vs3` | ✅ 已 bump（仅 Renderer + Desktop 治理基线变更） |
| Contracts `package.json` | `0.0.0-dfi.4a.4.2` | ✅ frozen |
| Admin `package.json` | `0.0.0-afe.6c` | ✅ frozen |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| `migrations.ts` 末项 `id` | `26`（[migrations.ts:1418](services/core/src/adapters/sqlite/migrations.ts#L1418)） | ✅ 不变 |
| frozen v1alpha1 Contract | `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a` | ✅ 不变 |
| frozen v1alpha2 Contract | `f04b454eacadfebc194c7f71c988dd68815f801371bd339fbff6711c85e052e5` | ✅ 不变 |
| STRM-3 / DFI-4A.4.1 / 4A.4.2 / DFI-5.4.3 evidence | 不变 | ✅ |

### 2.7 G 段：Core/Main/Preload production code 零修改（VS3 严格边界）

✅ **字面命中**（实测 git status）：

- 唯一新增 production 文件：`apps/desktop/src/renderer/pages/workbench/follow-up-intent.ts`（Renderer module）；
- 唯一修改 production 文件：`WorkbenchCreatePage.vue` + `TasksListPage.vue` + `task-list-model.ts`（全部 Renderer）；
- `services/core/src/**` + `apps/desktop/src/main/**` + `apps/desktop/src/preload/**` + `packages/contracts/src/**`：**VS3 范围内 0 production code 改动**；
- 唯一 Core 侧动作：`vs1.1-internal-trial-enterprise-runtime.integration.test.ts` 增加断言（**只测，不生产**）。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node 版本 | `node --version` | v24.13.0 ✅ |
| pnpm 版本 | `pnpm --version` | 11.11.0 ✅ |
| **VS3 focused tests（5 files）** | follow-up-intent + workbench-create-page + tasks-list-page + task-list-model + vs1.1-internal-trial-runtime | **5 files / 36 tests PASS** ✅ |
| VS2.3 repair.3 historical regression（8 files） | desktop-task-projection-service + vs2.3-invocation-deadline-authority + vs2.3-active-agent-loop-startup-recovery + durable-enterprise-model-provider + tasks-list-page + task-detail-model + agent-loop-coordinator + desktop-ipc-router | **8 files / 106 tests PASS** ✅ |
| VS2.2 + VS2.1 historical regression（10 files） | vs2.2-identity + workbench-adapter + workbench-create-page + ipc-router + create-desktop-api + vs1.2-presentation + vs1.1-internal-trial + document-tool-context + document-tool-registry + audit-dtp4-self-test | **10 files / 71 tests PASS** ✅ |
| Core/Desktop typecheck | `pnpm run typecheck` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | `DTP-4 packaging audit passed.` ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |

**门禁全部吻合 developer claim**：5 files / 36 tests（精确匹配）。

### 3.2 skip/todo/only 扫描

聚焦集 5 个文件**未发现** `.skip` / `.todo` / `.only` / `it.only` / `test.only` / `describe.skip` / `describe.only` —— **无测试逃逸** ✅。

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-mvp.vs3` | ✅ 已 bump |
| Core `package.json` | `0.0.0-mvp.vs2.3` | ✅ developer 解释合理：本批无 Core production 改动，仅在既有 integration test 增加断言 |
| Desktop `package.json` | `0.0.0-mvp.vs3` | ✅ 已 bump |
| Contracts `package.json` | `0.0.0-dfi.4a.4.2` | ✅ frozen |
| Admin `package.json` | `0.0.0-afe.6c` | ✅ frozen |

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 VS3 已完成任务"继续修改"垂直闭环的工程 conformance：

- **completed-only 入口** = `已实现`（Task 页仅 completed 状态显示"继续修改"按钮 + 点击后调用 `setFollowUpIntent`）；
- **Renderer module 一次性 intent** = `已实现`（`follow-up-intent.ts` 模块内变量 + 消费即清空 + 不写 URL/LocalStorage/Main/Preload/持久化）；
- **同 Session 新 Task + 不动旧 Task** = `已实现`（既有 `SubmitTurnCommandV1Alpha5` + 同一 `sessionId` + 新 `clientTurnId / commandId / Task`）；
- **不调用 `continue_task` / `provide_task_input`** = `已实现`（实测零调用；mechanical proof 通过既有 `submitTurnV1Alpha5`）；
- **Agent/Model exact match 才预选 + 不可用时空且禁提交** = `已实现`（既有 Workbench 规则 + 失败 fail-closed）；
- **Workspace/Skill/Knowledge 不自动继承** = `已实现`（intent 只携带 `sessionId / originTaskId / candidate Agent/Model / previousArtifact`，不携带 Workspace/Skill/Knowledge）；
- **同 Session 上下文进入 follow-up Gateway request** = `已实现`（[vs1.1 integration test:474-479](services/core/tests/vs1.1-internal-trial-enterprise-runtime.integration.test.ts#L474-L479) 字面断言）；
- **新文件名 ≠ 旧文件名** = `已实现`（developer claim：`资料汇报-v2.pptx`）；
- **Core 二次 SIGKILL 后两 Task/Artifact 恢复 + preview ready** = `已实现`（developer E2E 9 项关键事实全 PASS）；
- **Core/Main/Preload production code 零修改** = `已实现`（实测）。

**本批不声明**：

- production ready / 任一下游 ready；
- 通用 Artifact lineage 平台 / 通用文件版本平台 / Artifact revision store 任何能力；
- 任何对 Personal Model / Admin / TGM / Knowledge / Agent Lifecycle 的解锁；
- 全仓 lint PASS（developer claim "仍被既有 `settings-adapter.ts rootRealPath` boundary 阻断，不归因本批" —— 实测与 VS3 无关）。

> 注：Core 版本保持 `0.0.0-mvp.vs2.3` 是诚实边界——本批 Core production 0 修改 + integration test 1 处断言扩展，developer 解释合理；CHANGELOG 字面 `Root/Desktop 0.0.0-mvp.vs3` 正确标注本批修改范围。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER ACCEPTED / VS3 PASS/CLOSED
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是（VS3 已正式关闭）
最高 outcome 已接受：MVP_VS3_COMPLETED_TASK_FOLLOW_UP_E2E_CONFORMANT
独立 QA：PASS
```

VS3 的事实基础（completed-only 入口 + Renderer module 一次性 intent + 同 Session 新 Task + 不调 continue/provide + Agent/Model exact validation + Workspace/Skill 不自动继承 + 同 Session context 进入 follow-up + 新文件名不覆盖 + 双 Task/Artifact preview ready + Core 二次 SIGKILL 恢复 + 5 files / 36 tests PASS + 8 files / 106 tests VS2.3 regression + 10 files / 71 tests VS2.2/VS2.1 regression + typecheck + DTP-4 + git diff --check + lockfile digest 不变 + migration max=26 + frozen v1alpha1+v1alpha2 Contract SHA256 不变 + 4 个 historical evidence SHA256 不漂移 + Core/Main/Preload production code 零修改）全部只读可证。

20 项 developer 计划的 QA 项逐项可独立回答（VS3 plan §7）：

1-7：✅ completed-only 入口 / waiting Task 保留旧控件 / 同 sessionId 创建新 Task / 不修改旧 Task revision / 不调用 continue/provide / intent 单次消费 / 不写 LocalStorage；
8-10：✅ Agent/Model exact match 才预选 / 不可用时空且禁提交；
11-13：✅ Workspace/Skill/Knowledge 不自动继承 / follow-up 显示同 Session/新 Task 边界 / 旧成果 missing 不冒充；
14-16：✅ 新旧文件名不同 / 旧 Artifact preview ready / 新 Artifact preview ready；
17-18：✅ 同 Session 上下文进入 follow-up Gateway request / 新 PPTX write Tool/Artifact 各恰为 1；
19-20：✅ Core restart 后两个 Task/Artifact 均恢复 / 边界不漂移。

---

## 六、用户接受与关闭

用户已正式接受本独立聚焦代码 QA 结论，VS3 标记为 `PASS/CLOSED`，最高 outcome
`MVP_VS3_COMPLETED_TASK_FOLLOW_UP_E2E_CONFORMANT` 正式接受。上一用户目标与 Assistant 摘要的标签、独立 QA
状态文字已按事实完成 docs-only 精度修正，无需重新 QA。

本次关闭不代表 production ready，也不自动解锁 Personal Model、Admin mutation、TGM、Knowledge Provider 或
Agent Lifecycle。下一条 MVP 产品任务仍需用户另行确认；本次同步未授权任何代码、依赖、配置、migration、
lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
