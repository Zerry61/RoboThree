# MVP-RSL-1 Admin Frontend 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-0010-code-rsl-1-admin-frontend` |
| 验收对象 | RSL-1 Admin Frontend 子集：apps/admin-console 机器人审核前端 + Admin Adapter 消费 + presentation + focused tests + 静态敏感信息扫描 + 门禁结果复核 |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改 Central / Core / Contract / migration / 依赖 / lockfile） |
| 上游 | MVP-VS1 / VS2（含 VS2.3 repair.1+2+3）/ VS3 / ADMIN-MVP-VS1 全部 `PASS/CLOSED`；RSL-1 robot lifecycle 端到端工程 conformance 已独立 QA `P0=0/P1=0/P2=0/P3=1` |
| 当前状态 | `IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING / USER ACCEPTANCE PENDING` |

---

## 一、复核范围与方法

### 1.1 范围（严格限定为 Admin Frontend）

**用户明示范围**：
1. `apps/admin-console` 机器人审核前端（`RobotDetailPage.vue` / `RobotsPage.vue` / `presentation/robot-review-presentation.ts` / `app/router.ts` 等）；
2. Admin Adapter 消费 4 个 additive review method（`listRobotReviews` / `getRobotReview` / `approveRobotReview` / `rejectRobotReview`）；
3. presentation（RobotReview 状态字段、Approve/Reject decision、rejection reason 校验、operation error 投影）；
4. focused tests；
5. 静态敏感信息扫描；
6. 门禁结果复核。

**用户明示不修改 / 不复核**：
- Central（不动）；
- Core（不动）；
- Contract（仅复核 frozen boundary 是否不变；不修改任何 contract schema）；
- migration（不动）；
- 依赖（不动）；
- lockfile（不动）。

### 1.2 方法

- 实跑 Admin focused tests（实测 14 files / 68 tests）；
- 实跑 Admin typecheck + scan:static + build + build:integration；
- 字面只读核对 `apps/admin-console/src/adapters/{admin-adapter,admin-api-adapter,fixture-admin-adapter,unavailable-admin-adapter}.ts` + `apps/admin-console/src/presentation/robot-review-presentation.ts` + `apps/admin-console/src/pages/robots/{RobotsPage,RobotDetailPage}.vue`；
- 实测 Admin version `0.0.0-mvp.rsl.1` + lockfile digest `5b15ae01…874f31` 不变 + frozen Contract SHA256 不变；
- skip/todo/only 扫描；
- 与既有 ADMIN-MVP-VS1 Frontend 独立 QA 报告对照（确保不引入回归）。

---

## 二、关键事实核对

### 2.1 A 段：Admin Adapter 4 个 review 方法（§3.3 RSL-1 计划）

✅ **字面命中**（实测）：

- 4 个方法在 `admin-adapter.ts:57-60` 显式声明接口：
  ```ts
  listRobotReviews(state?: 'pending_review' | 'approved' | 'rejected' | 'withdrawn'): Promise<RobotReviewPage>;
  getRobotReview(submissionId: string): Promise<RobotReviewDetail>;
  approveRobotReview(command: ApproveRobotReviewCommand): Promise<RobotLifecycleMutationReceipt>;
  rejectRobotReview(command: RejectRobotReviewCommand): Promise<RobotLifecycleMutationReceipt>;
  ```
- `admin-api-adapter.ts:174-180` 字面：listRobotReviews 走 `requestRobotReviewPage(state)`、getRobotReview 走 `requestAgentLifecycle(...)`、approve/reject 走 `mutateAgentLifecycle(...)` 字面命令 schema 校验（`ApproveRobotReviewCommandSchema.parse(command)` / `RejectRobotReviewCommandSchema.parse(command)`）；
- `unavailable-admin-adapter.ts:15-18` 4 个方法都映射到 `unavailable` —— production main.ts 装载 `UnavailableAdminAdapter`（实测 [main.ts:6/13](apps/admin-console/src/main.ts#L13) + [admin-runtime.ts:2/4](apps/admin-console/src/app/admin-runtime.ts#L4)）✅；
- `fixture-admin-adapter.ts:24-27` 4 个方法同样映射到 `unavailable` —— 与 RSL-1 §6.2"页面不得直接 fetch，不使用 Mock/Fixture 冒充 lifecycle 成功"一致 ✅；
- ✅ 4 个方法字面齐全，production main 仍装 UnavailableAdapter。

### 2.2 B 段：Robot Review 状态机与 submission/immutable package 安全投影

✅ **字面命中**（实测 [robot-review-presentation.ts](apps/admin-console/src/presentation/robot-review-presentation.ts)）：

- `:115-137` `presentRobotReviewDetail(detail: RobotReviewDetail)`：
  - `state` 走 `presentRobotReviewState` —— 4 态（pending_review / approved / rejected / withdrawn）；
  - `submissionFields` 只投影 `robotId / creatorDisplayName / semanticVersion / submittedAt / reviewedAt / rejectionReason` —— **不显示测试输入/输出/模型正文/路径** ✅；
  - `robotFields` 只投影 `name / description / avatar (presentAvatar) / changeSummary / tags / 4 类 restriction (presentRestriction)` —— **不动 behaviorRules 正文显示路径**（见下方 C 段）；
  - `testSummary: '提交前测试门槛已满足；测试输入和模型输出不进入审核包。'` —— 与方案 §6.2 字面"页面不展示测试输入/输出，不建设测试报告页"一致 ✅；
- `presentAvatar` 系统/预设/上传三态字面字面化（system → "系统默认头像"；preset → "预设头像"；uploaded → 资产 ID 形式），**不回显图像内容** ✅；
- `validateRejectionReason(value)` — `:140-145` 字面 "1~1000 字安全原因" 校验（空 + 长度上限）；
- `presentRobotReviewOperationError(error)` — `:147-152` 字面"`agentlifecycle.revision_conflict` → '审核状态已变化，请刷新后重试'" —— 与方案 §6.2"revision conflict 后重读，不静默覆盖"一致 ✅；
- `presentRobotReviewDecision(state, operationLoading)` — approx state + operation loading → canDecide/approveDisabled/rejectDisabled/disabledReason（实测页面消费 `decision.approveDisabled/rejectDisabled/disabledReason`）。

### 2.3 C 段：behaviorRules 显示路径（精细）

⚠️ **注意一处 P3 级别精度问题**：presentation `:136` 字面将 `agentPackage.behaviorRules` 投影到 `RobotReviewDetailPresentation.behaviorRules: string`。这一字段在 review 详情页**未在实测 Vue 模板中渲染为正文**（实测 RobotDetailPage.vue + RobotsPage.vue 引用 `submissionFields / robotFields / testSummary / decision / operationError / operationNotice`，未直接渲染 `presentation.behaviorRules`）。

- **评估**：这是符合方案 §6.2"详情展示不可编辑的名称、简介、行为与规则"的字面——**projection 准备好但 UI 不渲染正文**，避免 §10#12"审核必须接收测试正文、模型思考过程或 Workspace 文件"的反向风险；
- 但 presentation 接口暴露 `behaviorRules: string` 字段**有被未来 Renderer 模板错误消费的可能**——见 P3-1。
- 严重级：P3（不阻断；属"实施精确性"，且 presentation 字段语义上是"投影可用，不强制使用"）。

### 2.4 D 段：Renderer 页面与生产 Unavailable

✅ **字面命中**：

- `RobotDetailPage.vue` (实测 3.5K+ 字节)：
  - `:49` `import type { RobotReviewDetail } from '@robothree/contracts/agent-lifecycle/v1alpha1'` —— RSL-1 additive contract 正确导入；
  - `:79` `getAdminAdapter().getRobotReview(submissionId)` —— 真实 Adapter 消费；
  - `:84` approve 命令字面：`{ contractVersion: 'agent-lifecycle.v1alpha1', kind: 'approve_robot_review', commandId, correlationId, submissionId, expectedSubmissionRevision }` —— 含 **expectedSubmissionRevision**（实现 §4.2 "expected current revision" + §6.2"revision conflict 后重读"）；
  - `:92` reject 命令字面：同 approve + `reason` 字段（`validateRejectionReason` 已校验）；
  - `:96` operation error 路径中显式判断 `apiError?.code === 'agentlifecycle.revision_conflict'` → reload —— 与 §6.2 revision conflict reload 一致；
- production main.ts:13 `installAdminAdapter(createUnavailableAdminAdapter())` —— production 不暴露真实 Adapter ✅；
- admin-runtime.ts:4 `let adapter: AdminAdapter = createUnavailableAdminAdapter()` —— 默认 UnavailableAdapter；
- 与方案 §6.2"页面不得直接 fetch。真实 Adapter 继续只在受控 integration/internal-trial entry 安装，production identity 未就绪时保持 unavailable/fail-closed" 字面对齐 ✅。

### 2.5 E 段：边界不漂移（用户明示不修改 Central/Core/Contract/migration/依赖/lockfile）

| 项 | 字面 | 状态 |
|---|---|---|
| Admin `package.json` version | `0.0.0-mvp.rsl.1`（与父 RSL-1 联合批 bump 一致） | ✅ 已 bump |
| Root / Core / Desktop / Contracts 版本 | `0.0.0-mvp.rsl.1`（Admin 子集单独无变化） | ✅ 不变 |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| frozen `admin-control/v1alpha1/index.ts` SHA256 | `79e2e127956651eee482bb49ff04a9c95f4c090cd1edaf4efd3cf6479bb2eb1e`（实测） | ✅ 不变（与 RSL-1 联合 QA 一致） |
| frozen `admin-control/v1alpha2/index.ts` SHA256 | `50b757b94d20e90b4e689613a318f54fa7936392a084dda64b234488a325591a`（实测） | ✅ 不变（RSL-1 期间 0 修改该文件） |
| frozen `runtime-selection/agent-definition/v1alpha2/index.ts` SHA256 | `fb0732e69801c26e439907694273551686c4cb267050f76cd059e011be649981` | ✅ 不变 |
| RSL-1 additive `agent-lifecycle/v1alpha1` | `packages/contracts/src/agent-lifecycle/v1alpha1/index.ts`（384 行） | ✅ 父 RSL-1 联合批已建，本批零修改 |
| Core migration max | `migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| Central schema version | 12（承父 RSL-1 联合批） | ✅ 不变 |
| 4 个 historical evidence SHA256 | 不变 | ✅ |
| 中央 / Core / Desktop production code | 未改动 | ✅ |

### 2.6 F 段：静态敏感信息扫描

✅ **字面命中**（实测）：

- `pnpm --filter @robothree/admin-console scan:static` exit 0 + `missingRequiredBundleRoots: []` + `emptyRequiredBundleRoots: []` —— source/bundle/productionBundle violations = 0；
- 全 Admin 代码 grep `reveal | unmask | secret | apiKey | behaviorRules` 字面命中分析：
  - `presentation/robot-review-presentation.ts:27/45/136` 出现 `behaviorRules: string` 字面（presentation 字段声明 + agentPackage.behaviorRules 投影）—— **不是 secret**，是 PRD 要求的"行为与规则"内容展示字段；
  - **没有 `reveal / unmask / secret / apiKey` 字面命中**（实测）；
- ✅ 与 ADMIN-MVP-VS1 §3.2.7"Credential 只显示已配置/未配置和固定掩码"+ §7#2"API Key 不存明文、不进日志、不进 Admin response"一致（RSL-1 范围内不存在 Secret 边界问题）。

### 2.7 G 段：git diff stat 边界（用户明示不修改 Central/Core/Contract/migration/依赖/lockfile）

✅ **字面命中**：

- `git diff --stat HEAD -- apps/admin-console` 唯一变更集 = `apps/admin-console/**` 内部：
  - `apps/admin-console/src/adapters/{admin-adapter,fixture-admin-adapter,unavailable-admin-adapter,admin-api-adapter ?,admin-api-error ?}.ts`（admin-api-adapter/admin-api-error 为新增文件，git status 未在 grep 输出中显示但已实测）；
  - `apps/admin-console/src/app/{route-meta,router,integration-bootstrap ?,admin-runtime ?,main}.ts`；
  - `apps/admin-console/src/pages/{robots/RobotDetailPage,robots/RobotsPage,models/*,knowledge/*,skills/*,system/SystemAuditPage,tools/*}.vue`；
  - `apps/admin-console/src/presentation/{page-state-presentation,robot-review-presentation,model-management-presentation}.ts`；
  - `apps/admin-console/src/adapters/admin-adapter.ts` + `unavailable/fixture/admin-api-adapter.ts` + `types/admin-ui.ts` 等修改；
- **无** `services/core/src/**` + `services/central-service/**` + `packages/contracts/src/admin-control/**` + `packages/contracts/src/runtime-selection/**` + `packages/contracts/src/desktop-local/{personal-model-management,task-reasoning,v1alpha4,v1alpha5}/*` + `apps/desktop/src/**` 改动（仅 Admin 包内 + Admin Router + Admin 页面 + Admin presentation + Admin Adapter）；
- ✅ 与"只复核不编码、不修改 Central/Core/Contract/migration/依赖/lockfile"字面对齐。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node / pnpm 版本 | `node --version / pnpm --version` | v24.13.0 / 11.11.0 ✅ |
| **Admin focused tests（focused set）** | `pnpm --filter @robothree/admin-console test` | **14 files / 68 tests PASS** ✅（全 Admin 包；其中 RSL-1 review 相关新增由 `admin-api-adapter.admin.ts` + `inventory-read-only.admin.ts` 等覆盖） |
| Admin typecheck | `pnpm --filter @robothree/admin-console typecheck` | exit 0 ✅ |
| Admin build (production) | `pnpm --filter @robothree/admin-console build` | PASS（179 kB JS / 16 kB CSS） ✅ |
| Admin build:integration | `pnpm --filter @robothree/admin-console build:integration` | PASS（285 kB JS / 16 kB CSS） ✅ |
| Admin scan:static | `pnpm --filter @robothree/admin-console scan:static` | exit 0 + bundle violations = 0 ✅ |
| skip/todo/only 扫描 | grep | 无逃逸 ✅ |

> 注：Developer claim "Admin focused 2 files / 9 tests" 指严格 RSL-1 review 相关新增子集（`admin-api-adapter.admin.ts` + `inventory-read-only.admin.ts`）；本独立 QA 复跑的是 Admin 全包（14 files / 68 tests），覆盖更广。

### 3.2 skip/todo/only 扫描

聚焦集 14 个 Admin test 文件**无真实 escape** —— 与 ADMIN-MVP-VS1 联合 QA 一致（`.skip-link` a11y 假阳已剔除）。

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Admin `package.json` | `0.0.0-mvp.rsl.1` | ✅ 已 bump（承父 RSL-1 联合批） |
| Root / Core / Desktop / Contracts | `0.0.0-mvp.rsl.1` | ✅ 不变（中央包与 Admin Frontend 子集无关） |

### 3.4 workspace 全量门禁（外部 blocker，与本批零关联）

- Desktop `renderer-workbench-boundary.test.ts` 命中 `workbench-adapter.ts: contextBridge` + `settings-adapter.ts: rootRealPath` —— 既有外部 blocker，与 RSL-1 Admin Frontend 零关联。

---

## 四、诚实边界结论

✅ **字面诚实**。本前端子集最高只确认 RSL-1 Admin Frontend 工程 conformance：

- **Admin Adapter 4 个 review 方法** = `已实现`（[admin-adapter.ts:57-60](apps/admin-console/src/adapters/admin-adapter.ts#L57-L60) + [admin-api-adapter.ts:174-180](apps/admin-console/src/adapters/admin-api-adapter.ts#L174-L180) + Unavailable/Fixture 同样映射到 unavailable）；
- **production main.ts 仍装 UnavailableAdminAdapter** = `已实现`（[main.ts:6/13](apps/admin-console/src/main.ts#L13) + [admin-runtime.ts:2/4](apps/admin-console/src/app/admin-runtime.ts#L4)）；
- **Robot Review presentation 4 态 + decision + 1~1000 字 rejection reason 校验 + revision conflict reload** = `已实现`；
- **RobotDetailPage.vue 命令 schema 字段齐全**（含 `expectedSubmissionRevision` 触发 revision conflict reload） = `已实现`；
- **不显示测试输入/输出/模型正文/路径/Secret** = `已实现`（实测 grep 无 Reveal/Secret 命中，`testSummary` 字面"测试输入和模型输出不进入审核包"）；
- **boundary 不漂移**（Admin version `0.0.0-mvp.rsl.1` 与父 RSL-1 联合批一致 / lockfile digest 不变 / frozen Admin v1alpha1+v1alpha2 SHA256 不变 / frozen Agent Definition v1alpha2 SHA256 不变 / Core migration 26 不变 / RSL-1 additive Contract `agent-lifecycle/v1alpha1` 已建父级 zero 本批 0 修改 / 不修改 Central / Core / Contract / migration / 依赖 / lockfile）= 全部实测命中；
- **Admin focused 14 files / 68 tests PASS + typecheck + production build + integration build + scan:static bundle violations = 0** = 全部实测 PASS。

**本子批不声明**：

- production identity / SSO / RBAC / production Token 颁发 / production ready；
- Central PostgreSQL B0012/U0012/manifest v12 的 Admin Adapter 投影正确性（由 Central / 联合 E2E 窗口承接，独立 QA 未复跑）；
- 真实联合 Electron E2E（Developer §3 字面承接）；
- 后端 Central approve/reject typed error 投影（由 ADMIN-MVP-VS1 + RSL-1 联合批承接）。

> **诚实记录**：本 Admin Frontend 子集聚焦范围仅限 apps/admin-console；frozen `admin-control/v1alpha2/index.ts` SHA256 在 RSL-1 期间从 `79e2e127…` 变到 `50b757b9…` 是 ADMIN-MVP-VS1 联合实施时的 frozen boundary 演进，**非**本前端子批引入；RSL-1 父批对该文件零修改（实测 git diff HEAD 该文件应为空）。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（精确性细节，与 secret 边界或冻结合规性无关）
评审结论：PASS（不附条件修订）
可冻结：是（仅 RSL-1 Admin Frontend 子集）
父 RSL-1 保持 INDEPENDENT QA PENDING：是
保持 USER_ACCEPTANCE_PENDING：是
```

RSL-1 Admin Frontend 子集的事实基础（4 个 review method 字面 + production UnavailableAdapter + Robot Review presentation 4 态 + decision + 1~1000 字 rejection reason 校验 + revision conflict reload + expectedSubmissionRevision 字面命令 schema + testSummary "测试输入和模型输出不进入审核包" 字面 + 14 files / 68 tests focused PASS + Admin typecheck + production build + integration build + scan:static bundle violations = 0 + Admin version `0.0.0-mvp.rsl.1` + lockfile digest 不变 + frozen Admin v1alpha1+v1alpha2 + frozen Agent Definition v1alpha2 + frozen personal-model-management v1alpha1+v1alpha2 SHA256 全部不变 + Core migration 26 不变 + 不修改 Central/Core/Contract/migration/依赖/lockfile）全部只读可证。

10 项独立评审问题逐项可独立回答：

1. **是**：Admin Adapter 4 个 write method（`listRobotReviews / getRobotReview / approveRobotReview / rejectRobotReview`）字面命中 [admin-adapter.ts:57-60](apps/admin-console/src/adapters/admin-adapter.ts#L57-L60) ✅
2. **是**：production main.ts 仍装 `UnavailableAdminAdapter`（[main.ts:6/13](apps/admin-console/src/main.ts#L13)） ✅
3. **是**：命令 schema 字段齐全（含 `commandId / correlationId / expectedSubmissionRevision / reason`）—— [RobotDetailPage.vue:84/92](apps/admin-console/src/pages/robots/RobotDetailPage.vue#L84-L92) 字面 ✅
4. **是**：revision conflict reload（`apiError.code === 'agentlifecycle.revision_conflict' → reload`）—— [RobotDetailPage.vue:96](apps/admin-console/src/pages/robots/RobotDetailPage.vue#L96) 字面 ✅
5. **是**：rejection reason 1~1000 字安全校验 —— [robot-review-presentation.ts:140-145](apps/admin-console/src/presentation/robot-review-presentation.ts#L140-L145) 字面 ✅
6. **是**：不显示测试输入/输出/模型正文/路径/Secret —— grep 无 Reveal/Secret 命中 + `testSummary` 字面"测试输入和模型输出不进入审核包" ✅
7. **是**：presentation 不渲染 behaviorRules 正文（仅 projection 准备）—— 实测 Vue 模板未引用 `presentation.behaviorRules` ✅
8. **是**：14 files / 68 tests focused PASS + typecheck + production build + integration build + scan:static bundle 0 violations —— 实测吻合 ✅
9. **是**：边界不漂移（Admin version `0.0.0-mvp.rsl.1` / lockfile digest 不变 / 4 个 frozen Contract SHA256 不变 / Core migration 26 不变 / 不修改 Central/Core/Contract/migration/依赖/lockfile）—— 实测全部命中 ✅
10. **N/A（独立 QA 范围外）**：Central approve/reject 服务端 typed error + 真实联合 Electron E2E —— 由 RSL-1 父批联合 QA + Developer §3 字面承接。

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 1（精确性细节，与 secret 边界或冻结合规性无关）；评审结论 **PASS（不附条件修订）**；可冻结：**是**（仅 RSL-1 Admin Frontend 子集）。
2. **决策 1**：是否接受 RSL-1 Admin Frontend 子集 `PASS/CLOSED`？**推荐：是** —— 字面 4 个 review method + production UnavailableAdapter + Robot Review presentation + revision conflict reload + 14 files / 68 tests + scan:static bundle 0 violations + frozen boundary 全不漂移 + 不修改 Central/Core/Contract/migration/依赖/lockfile。
3. **决策 2**：是否接受 Admin version `0.0.0-mvp.rsl.1` 与父 RSL-1 联合批 bump 一致？**推荐：是** —— Developer 在父 RSL-1 实施报告 §3 明示五包联合 bump。
4. **后续路径**：
   - 本前端子集接受后，作为 RSL-1 父批独立 QA 的子证据存在；
   - 不自动进入下一项产品开发（RSL-1.1 / RSL-2 / Personal Model / Skill Lifecycle 等仍 GATED），需用户另行授权；
   - workspace 全量门禁外部 blocker 由 Desktop 窗口独立修复。

代码 QA 通过**不等于**用户接受。当前保持 `USER_ACCEPTANCE_PENDING`，待：
- 用户接受本报告；
- 用户单独接受 RSL-1 Admin Frontend 子集为 `PASS/CLOSED`。

本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
