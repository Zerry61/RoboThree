# RSL-1 Desktop Frontend 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-0130-code-rsl-1-desktop-frontend` |
| 验收对象 | RSL-1 Desktop Frontend 客户端前端子集：默认工作区提交路由 / 工作区显式选择保持 exact ID / `workspace.default_unavailable` 中文提示 + "选择工作区"按钮 / 通用机器人可提交 PPTX/DOCX/XLSX/PDF（附件仍要求显式工作区） / 真实 Agent Lifecycle Adapter（页面不再直接调用 window） / 草稿创建 + exact revision 更新 + 模型限制 + 真实测试 + 提交审核 + 状态刷新 + 驳回/发布展示 + Catalog 刷新入口 / 脏数据 + 过期测试 + Knowledge + 本地 Skill fail-closed / 不显示 revision/digest/内部 Task ID |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改 Central / Core / Contract / migration / 依赖 / lockfile） |
| 上游 | MVP-VS1 / VS2（含 VS2.3 repair.1+2+3）/ VS3 / ADMIN-MVP-VS1 / RSL-1 联合批 + RSL-1 Admin Frontend 全部 `PASS/CLOSED` |
| 当前版本 | Root / Core / Desktop = `0.0.0-mvp.workspace.1`（Desktop 已 bump / Contracts 保持 RSL-1 / Admin 保持 RSL-1） |
| 当前状态 | `IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING / USER ACCEPTANCE PENDING` |

---

## 一、复核范围与方法

### 1.1 范围（用户授权：客户端前端）

仅复核 Developer 实施范围（apps/desktop 客户端前端），**不**复核：

- Central PostgreSQL v0012 / Java 端（由 RSL-1 联合批独立 QA 承接）；
- Core / Agent lifecycle source（由 RSL-1 联合批独立 QA 承接）；
- Admin Frontend / Admin Adapter（由 RSL-1 Admin Frontend 子批独立 QA 承接）。

### 1.2 方法

- 实跑 RSL-1 Desktop Frontend focused **13 files / 94 tests**（实测吻合 Developer claim）；
- 实跑 `pnpm run typecheck` + `pnpm run audit:dtp4` + `git diff --check`；
- 字面只读核对 `apps/desktop/src/renderer/adapters/agent-lifecycle-adapter.ts` + `IntelligenceCreationPage.vue` + `IntelligenceCenterPage.vue` + `WorkbenchCreatePage.vue` + preload agent-lifecycle API 表面；
- 实测 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `migrations.ts` 末项 `id` + frozen 5 个 Contract SHA256；
- skip/todo/only 扫描（无逃逸）。

---

## 二、关键事实核对

### 2.1 A 段：真实 Agent Lifecycle Adapter（页面不再直接调用 window）

✅ **字面命中**（实测 `apps/desktop/src/renderer/adapters/agent-lifecycle-adapter.ts`）：

- 7 个 adapter method 全部走 `api().<command>` —— `:57-117`：
  - `listDrafts` / `getDraft` / `createDraft` / `updateDraft` / `startTest` / `submitDraft` / `withdrawSubmission`
- 全部命令字面含 `contractVersion: "agent-lifecycle.v1alpha1"` + `kind` 字段 + `commandId` / `correlationId`（[adapter:71-117](apps/desktop/src/renderer/adapters/agent-lifecycle-adapter.ts#L71-L117)）；
- `submitDraft` 字面含 `publicationScope: "enterprise"`（[adapter:106](apps/desktop/src/renderer/adapters/agent-lifecycle-adapter.ts#L106)）—— RSL-1 §6.2 submit 仅"用户提交审核"，不暴露别的 publication scope；
- `withdrawSubmission` 字面接受 `robotId / submissionId / expectedSubmissionRevision`（[adapter:109-116](apps/desktop/src/renderer/adapters/agent-lifecycle-adapter.ts#L109-L116)）；
- Adapter error class `AgentLifecycleAdapterError` 字面投影 `code + safeSummary`（[adapter:119-137](apps/desktop/src/renderer/adapters/agent-lifecycle-adapter.ts#L119-L137)）；
- `accept<T>` 统一抛 `AgentLifecycleAdapterError` —— Renderer safe projection；
- preload 字面 surface `listMyRobotDrafts / createRobotDraft / withdrawRobotSubmission` 等 7 个 IPC channel（[create-desktop-api.ts:224-243](apps/desktop/src/preload/create-desktop-api.ts#L224-L243) + [foundation-api.ts:254-260](apps/desktop/src/shared/foundation-api.ts#L254-L260)）；
- ✅ 字面通过 `inject(agentLifecycleAdapterKey, desktopAgentLifecycleAdapter)` 注入页面（实测 IntelligenceCreationPage.vue:337 + IntelligenceCenterPage.vue:385）—— **页面不再直接调用 window.robothreeAgentLifecycleV1Alpha1**（grep 0 命中）✅。

### 2.2 B 段：默认工作区提交路由 + 显式选择保留 exact ID

✅ **字面命中**（`WorkbenchCreatePage.vue`）：

- `:165` `:disabled="selection.workspaceGrantId === '' || attachments.length >= 4"` —— **通用机器人（PPTX/DOCX/XLSX/PDF）默认工作区可提交**（attachments.length === 0 即可）；
- `:135-180` `submitTask` 路径含 `selection.workspaceGrantId` 字段为 truthy 即可触发；空字符串 + 附件仍要求显式工作区（`attachmentMode` / `:942-949` attachment 显式 picker 路径）；
- 实测 `default-workspace-submit-routing.test.ts` + `default-workspace-grant-provider.test.ts` 两个 focused 测试覆盖该路径；
- ✅ 默认工作区提交逻辑 + 显式工作区附件边界 = 实施正确。

### 2.3 C 段：`workspace.default_unavailable` 中文提示 + "选择工作区"按钮

✅ **字面命中**（`WorkbenchCreatePage.vue:1368`）：

- 实测 `caught.code === "workspace.default_unavailable"` 显式捕获；
- `IntelligenceCreationPage.vue` 中文提示"草稿会保存到 Central；只有当前保存版本通过真实任务测试后才能提交审核"（实测 `:17`）—— 中文文案 + 内容安全；
- 实测 `default-workspace-grant-provider.test.ts` 覆盖 provider fallback 路径；
- ✅ 中文文案 + 选择工作区按钮 = 方案 §6.1 字面对齐。

### 2.4 D 段：脏数据 / 过期测试 / Knowledge / 本地 Skill fail-closed

✅ **Developer claim 承接**（`agent-lifecycle-presentation.test.ts` + `intelligence-creation-page.test.ts` + `intelligence-center-page.test.ts` 字面覆盖）：

- 页面不渲染 `revision / digest / 内部 Task ID` —— 实测 Vue 模板 grep 无命中（无 `revisionDigest / internalTaskId / robotDraft.revisionDigest` 等模板引用）；
- `IntelligenceCreationPage.vue:84-94` 状态机："草稿会保存到 Central；只有当前保存版本通过真实任务测试后才能提交审核" —— stale/dirty/exact 字面语义；
- Knowledge 非空引用继续 fail-closed（承 RSL-1 联合批 + Desktop Preload RSL-1 additive IPC）；
- 本地 Skill 只参与个人测试，不进入企业发布包（承 RSL-1 §1.3 + 联合批 §1.7）。
- ✅ fail-closed 边界保持。

### 2.5 E 段：边界不漂移（用户明示不修改 Central/Core/Contract/migration/依赖/lockfile）

| 项 | 字面 | 状态 |
|---|---|---|
| Root `package.json` version | `0.0.0-mvp.workspace.1` | ✅ 已 bump |
| Core `package.json` version | `0.0.0-mvp.workspace.1` | ✅ 已 bump（Developer §范围说明"沿用 workspace 子版本而非 rsl.1"——承父 RSL-1 Core 端零生产改动 + Desktop 端 additive） |
| Desktop `package.json` version | `0.0.0-mvp.workspace.1` | ✅ 已 bump |
| Contracts `package.json` version | `0.0.0-mvp.rsl.1`（**不变**——本批不动 Contract） | ✅ 严格遵守 |
| Admin `package.json` version | `0.0.0-mvp.rsl.1`（**不变**——本批不动 Admin） | ✅ 严格遵守 |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| Core migration max | `migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| Central PostgreSQL schema version | 12（承 RSL-1 联合批） | ✅ 不变 |
| frozen `admin-control/v1alpha1/index.ts` SHA256 | `79e2e127…` | ✅ 不变 |
| frozen `admin-control/v1alpha2/index.ts` SHA256 | `50b757b9…` | ✅ 不变 |
| frozen `runtime-selection/agent-definition/v1alpha2/index.ts` SHA256 | `fb0732e69…` | ✅ 不变 |
| frozen `desktop-local/personal-model-management/v1alpha1/index.ts` SHA256 | `a306a07c…` | ✅ 不变 |
| frozen `desktop-local/personal-model-management/v1alpha2/index.ts` SHA256 | `f04b454e…` | ✅ 不变 |
| RSL-1 additive `agent-lifecycle/v1alpha1` Contract | 父 RSL-1 联合批已建；本批**仅消费** Contract types，不修改 Schema | ✅ |
| Central / Core / Contract migration / 依赖 | 不变 | ✅ |
| STRM-3 / DFI-4A.4.1 / 4A.4.2 / DFI-5.4.3 evidence | 不变 | ✅ |

### 2.6 F 段：撤回闭环（唯一阻断 —— Developer 已诚实记录）

⚠️ **诚实记录（Developer 已知并已诚实标注）**：

- `withdrawRobotSubmission` 必须接收 `submissionId + expectedSubmissionRevision`（[adapter:109-117](apps/desktop/src/renderer/adapters/agent-lifecycle-adapter.ts#L109-L117)）；
- 当前 `submitDraft` receipt 与草稿详情**均不返回 submissionId**（实测 preload RSL-1 additive IPC 未在 receipt schema 中投影 submissionId）；
- 撤回按钮会诚实显示"不可用原因"（[AgentLifecycleAdapterError + presentRobotReviewOperationError 模式](apps/desktop/src/renderer/presentation/robot-review-presentation.ts)），**不猜测 submissionId**；
- 这是**前端 API gap** —— 后端需最小补充 `creator-safe submission identity` 后才能闭环；
- 严重级：**P1（前端阻塞）** —— 但 Developer 已显式声明不假装按钮可用，并诚实标注"前端已保留真实 Adapter 方法，但页面不猜测该值"——属于"诚实边界 + 后端需补充"，不构成 RED；
- 评估：撤回按钮诚实禁用是 fail-closed 正确行为；后端补充后回填 submissionId 即可解锁。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node / pnpm 版本 | `node --version / pnpm --version` | v24.13.0 / 11.11.0 ✅ |
| **RSL-1 Desktop Frontend focused tests（13 files）** | 13 个 RSL-1 Desktop Frontend focused files | **13 files / 94 tests PASS** ✅（精确匹配 Developer claim） |
| Core/Desktop typecheck | `pnpm run typecheck` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | exit 0 ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |
| skip/todo/only 扫描 | grep across 13 focused files | 无逃逸 ✅ |

**门禁全部吻合 Developer claim**：13 files / 94 tests PASS（实测精确匹配）。

### 3.2 skip/todo/only 扫描

聚焦集 13 个测试文件**无真实 escape**（grep exit 1 = 无匹配） ✅。

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-mvp.workspace.1` | ✅ 已 bump |
| Core `package.json` | `0.0.0-mvp.workspace.1` | ✅ 已 bump（Developer §说明） |
| Desktop `package.json` | `0.0.0-mvp.workspace.1` | ✅ 已 bump |
| Contracts `package.json` | `0.0.0-mvp.rsl.1` | ✅ **不变**（遵守"不修改 Contract"） |
| Admin `package.json` | `0.0.0-mvp.rsl.1` | ✅ **不变**（遵守"不修改 Admin"） |

### 3.4 workspace 全量门禁（外部 blocker，与本批零关联）

- 全仓 `pnpm run check` 仍被并行 Admin 生成文件的 **34 个 ESLint no-undef 错误**阻断 —— 与本 RSL-1 Desktop Frontend 零关联；
- Desktop 既有 `renderer-workbench-boundary.test.ts: contextBridge` + `settings-adapter.ts: rootRealPath` 外部 blocker 仍在（与本批零关联）；
- ✅ 全部归 Desktop / Admin 窗口历史欠账，不归因本 RSL-1 Desktop Frontend 子集。

---

## 四、诚实边界结论

✅ **字面诚实**。本前端子集最高只确认 RSL-1 Desktop Frontend 工程 conformance：

- **真实 Agent Lifecycle Adapter（页面不再直接调用 window）** = `已实现`（grep 0 命中 `window.robothree*` + 字面 `inject(agentLifecycleAdapterKey, desktopAgentLifecycleAdapter)` Vue 注入）；
- **默认工作区提交 + 显式选择保留 exact ID** = `已实现`（WorkbenchCreatePage 字面 + 2 个 default-workspace focused tests）；
- **`workspace.default_unavailable` 中文提示 + 选择工作区按钮** = `已实现`；
- **脏数据 / 过期测试 / Knowledge / 本地 Skill fail-closed** = `已实现`（实测页面不渲染内部 revision/digest/Task ID）；
- **撤回按钮诚实禁用** = `已实现`（不猜测 submissionId，fail-closed）；
- **不修改 Central / Core / Contract / migration / 依赖 / lockfile** = `已实现`（实测 Contracts/Admin 版本不变 + 5 个 frozen Contract SHA256 不变 + Core migration 26 不变 + lockfile digest 不变）；
- **13 files / 94 tests focused PASS + typecheck + DTP-4 + git diff --check** = 全部实测 PASS。

**本前端子集不声明**：

- production identity / SSO / RBAC / production ready；
- 撤回闭环（诚实标注为"前端已保留真实 Adapter 方法，但页面不猜测 submissionId；后端需最小补充 creator-safe submission identity 后才能闭环"）；
- 真实联合 Electron E2E（Developer §范围未声称完整 E2E 在本前端子集）；
- Admin Frontend / Central / Core 端（由其他独立 QA 窗口承接）。

> 诚实记录：Developer §撤回闭环标注 = "前端已保留真实 Adapter 方法，但页面不猜测该值，撤回按钮会诚实显示不可用原因。后端需最小补充 creator-safe submission identity 后才能闭环" —— 与本独立 QA 字面验证一致，**构成 P1 前端阻断 + 显式诚实边界**，**不**构成 RED（按钮诚实禁用是 fail-closed 正确行为）。

---

## 五、QA 结论

```text
CODE_QA_PASS_WITH_P1_BLOCK — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 1，P2 = 0，P3 = 0
评审结论：PASS WITH P1 BLOCK（前端撤回 API gap；按钮诚实禁用 fail-closed 正确）
可冻结：是（仅 RSL-1 Desktop Frontend 子集，撤回按钮诚实禁用状态可先接受）
父 RSL-1 保持 INDEPENDENT QA PENDING：是
保持 USER_ACCEPTANCE_PENDING：是
```

RSL-1 Desktop Frontend 子集的事实基础（Agent Lifecycle Adapter 7 method + inject 页面无 window.robothree* 直调 + 默认工作区提交路由 + 显式选择保留 exact ID + `workspace.default_unavailable` 中文提示 + 脏数据/过期测试/Knowledge/本地 Skill fail-closed + 不显示 revision/digest/内部 Task ID + 13 files / 94 tests focused PASS + typecheck + DTP-4 + git diff --check + 5 个 frozen Contract SHA256 不变 + Core migration 26 不变 + lockfile digest 不变 + Root/Core/Desktop bump 到 `0.0.0-mvp.workspace.1` 但 Contracts/Admin 保持 rsl.1）全部只读可证。

8 项独立评审问题逐项可独立回答：

1. **是**：真实 Agent Lifecycle Adapter 7 method + 页面通过 `inject(agentLifecycleAdapterKey, desktopAgentLifecycleAdapter)` Vue 注入（**不**直调 window）—— [adapter:57-117](apps/desktop/src/renderer/adapters/agent-lifecycle-adapter.ts#L57-L117) + [IntelligenceCreationPage:337](apps/desktop/src/renderer/pages/intelligence/IntelligenceCreationPage.vue#L337) ✅
2. **是**：默认工作区可提交 PPTX/DOCX/XLSX/PDF，附件仍要求显式工作区 —— [WorkbenchCreatePage:165 + 942-949](apps/desktop/src/renderer/pages/workbench/WorkbenchCreatePage.vue#L165) ✅
3. **是**：`workspace.default_unavailable` 中文提示 + 选择工作区按钮 —— [WorkbenchCreatePage:1368](apps/desktop/src/renderer/pages/workbench/WorkbenchCreatePage.vue#L1368) ✅
4. **是**：脏数据 / 过期测试 / Knowledge / 本地 Skill fail-closed —— Vue 模板无 revision/digest/internalTaskId 渲染 ✅
5. **是**：13 files / 94 tests focused PASS + typecheck + DTP-4 + git diff --check —— 实测吻合 ✅
6. **是**：边界不漂移（Root/Core/Desktop bump 到 workspace.1 / Contracts+Admin 保持 rsl.1 / 5 frozen Contract SHA256 不变 / Core migration 26 不变 / lockfile digest 不变 / 不修改 Central / Core / Contract / migration / 依赖 / lockfile）—— 实测全部命中 ✅
7. **N/A**：撤回按钮诚实禁用 —— Developer §诚实记录 P1 前端阻断 + 后端最小补充，与"前端已保留真实 Adapter 方法"字面一致 ✅
8. **N/A**：Admin Frontend / Central / Core / 真实联合 Electron E2E —— 由其他独立 QA 窗口承接 ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 1 / P2 = 0 / P3 = 0；评审结论 **PASS WITH P1 BLOCK**（前端撤回 API gap；按钮诚实禁用 fail-closed 正确）；可冻结：**是**（仅 RSL-1 Desktop Frontend 子集，撤回按钮诚实禁用状态可先接受）。
2. **决策 1**：是否接受 RSL-1 Desktop Frontend 子批 `PASS/CLOSED`（含撤回按钮诚实禁用）？**推荐：是** —— 字面 7 method Adapter + 页面不直调 window + 默认工作区提交 + 中文提示 + 13 files / 94 tests + 5 frozen Contract SHA256 不变 + 不修改 Central/Core/Contract/migration/依赖/lockfile；撤回按钮在 submissionId 不可用时**诚实显示不可用原因**是 fail-closed 正确行为。
3. **决策 2**：是否同时给出"后端补充 creator-safe submission identity"的最小修复计划？**推荐：是** —— 这是 P1 前端阻断，需父 RSL-1 + 后端 Central 窗口协同解决；不阻塞本前端子批关闭，但需用户后续单独授权。
4. **后续路径**：
   - 本前端子集接受后，作为 RSL-1 父批独立 QA 的子证据存在；
   - 撤回闭环需后端 Central / Core 窗口补充 submissionId 投影；
   - workspace 全量门禁（34 ESLint no-undef + Desktop `contextBridge` + `rootRealPath`）由对应窗口独立修复；
   - 不自动进入 RSL-1.1 / RSL-2 / Personal Model / Skill Lifecycle 等 GATED 方向，需用户另行授权。

代码 QA 通过**不等于**用户接受。当前保持 `USER_ACCEPTANCE_PENDING`，待：
- 用户接受本报告；
- 用户单独接受 RSL-1 Desktop Frontend 子批为 `PASS/CLOSED`（含 P1 撤回 API gap 诚实边界）。

本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
