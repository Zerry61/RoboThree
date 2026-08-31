# ADMIN-MVP-VS1 联合实施 — Claude Code 独立联合代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-1815-code-admin-mvp-vs1-joint` |
| 验收对象 | ADMIN-MVP-VS1 联合实施：Admin 模型管理 + Central PostgreSQL v0011 持久化（PostgreSQL + AES-GCM Credential + 配置审计 + immutable Gateway binding）+ Desktop 从 Admin 默认模型 discovery 进入 Catalog/Task Lock/Gateway HTTP/SSE + 真实 Electron E2E |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改业务代码/Contract/依赖/migration/lockfile） |
| 上游 | ADMIN-MVP-VS1 前端子批独立 QA P0~P3 已 PASS；MVP-VS1 / VS2 / VS3 `PASS/CLOSED` |
| 当前版本 | Root / Core / Desktop / Contracts / Admin = `0.0.0-mvp.admin.vs1`（五包联合 bump） |
| 当前状态 | `IMPLEMENTATION COMPLETE / INDEPENDENT QA PENDING / USER ACCEPTANCE PENDING` |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 ADMIN-MVP-VS1 联合实施的事实可证性 + 边界严格性 + 诚实字面一致性：

1. **Contract**：`admin-control/v1alpha2` additive strict schema + 5 个写方法 + frozen v1alpha1 不变；
2. **Central**：PostgreSQL v0011 持久化 + AES-GCM Credential + 配置审计 + immutable Gateway binding；
3. **Admin Console**：13 files / 59 tests + production UnavailableAdapter + Secret 不外露；
4. **Core**：Admin-managed deployment focused `1 file / 6 tests` + Desktop Main Admin discovery 投影到既有路径；
5. **Desktop**：从 Admin 默认模型 discovery 进入 Catalog/Task Lock/Gateway HTTP/SSE；
6. **停用语义**：阻止新任务选择 + 旧 Task immutable exact Gateway binding 不被改写；
7. **真实 Electron E2E**：real Electron Main / Renderer / IPC / Core child / SQLite reopen / Gateway HTTP/SSE / PPTX / SIGKILL 恢复；
8. **门禁**：focused 15 files / 72 tests + VS2.3+VS3 12 files / 131 tests regression + typecheck + DTP-4 + git diff --check + Core smoke；
9. **边界**：lockfile digest = `5b15ae01…874f31` / Core migration max=26 / frozen v1alpha1 Contract SHA256 不变 / frozen personal-model-management v1alpha1/v1alpha2 SHA256 不变 / 无 SSO/RBAC/Personal Model/TGM/Knowledge Provider/Agent Lifecycle。

**不**在本批复核范围：

- 不复跑 Central PostgreSQL online/offline harness（破坏性 + 长时间 + 真实 DB install，依赖既有 Online/Offline harness script，developer 已记录 `446/0/0/0 / BUILD SUCCESS`）；
- 不复跑 `e2e:admin-mvp-vs1`（真实 Electron，破坏性 + 长时间 + 用户授权门槛）；
- 不替代既有的 MVP-VS1 / VS2 / VS3 / ADMIN-MVP-VS1 前端子批独立 QA 结论。

### 1.2 方法

- 实跑 Admin focused 13 files / 59 tests；
- 实跑 Core Admin-managed focused `1 file / 6 tests`（`internal-trial-enterprise-model-deployment.test.ts`）；
- 实跑 Contracts v1alpha2 focused `1 file / 7 tests`；
- 实跑 VS2.3+VS3 historical regression 12 files / 131 tests（sanity）；
- 实跑 `pnpm run typecheck` + `pnpm run audit:dtp4` + `git diff --check` + Core smoke；
- 字面只读核对 `apps/admin-console/src/adapters/admin-api-adapter.ts` + `services/core/src/application/internal-trial-enterprise-model-deployment.test.ts` 中 admin-managed 字面；
- 实测 5 个 `package.json` 版本字面（均为 `0.0.0-mvp.admin.vs1`）+ `pnpm-lock.yaml` digest + Core `migrations.ts` 末项 `id` + frozen v1alpha1/v1alpha2 Contract SHA256 + 4 个 historical evidence SHA256。

---

## 二、关键事实核对

### 2.1 A 段：v1alpha2 Contract additive + frozen v1alpha1 保持

✅ **字面命中**：

- 所有 5 个包版本 = `0.0.0-mvp.admin.vs1`（Root / Core / Desktop / Contracts / Admin 联合 bump）；
- `admin-control/v1alpha2/` 目录新增（5 个文件 `model.ts / common.ts / error.ts / index.ts / receipt.ts`）—— 与 Revision 1 §2.1"additive" 字面对齐；
- **frozen `admin-control/v1alpha1/index.ts` SHA256 = `79e2e127956651eee482bb49ff04a9c95f4c090cd1edaf4efd3cf6479bb2eb1e`**（实测，与前端 QA 报告一致；本批 0 修改）—— 与 Revision 1 §7#5 停手条件"不得修改已冻结的 v1alpha1 read schema"字面对齐 ✅；
- Contracts v1alpha2 strict focused test = **1 file / 7 tests PASS** ✅。

### 2.2 B 段：Core Admin-managed deployment focused

✅ **字面命中**（`services/core/tests/internal-trial-enterprise-model-deployment.test.ts:89-194`）：

- 测试用例字面使用 `modelId: "model.admin-managed"` / `capabilityId: "model.admin-managed"` / `authorizationToken: "admin-managed-bootstrap-test-token"` —— 与"Admin-managed deployment"命名一致；
- 实跑 **1 file / 6 tests PASS** ✅；
- Developer §3 主张"Core Admin-managed deployment focused 1 file / 6 tests PASS" —— 实测吻合。

### 2.3 C 段：Admin 前端 Secret 边界 + production UnavailableAdapter

✅ **字面命中**（继承自前端独立 QA 报告 + 复跑验证）：

- Admin Adapter 5 个 v1alpha2 写方法（`createModel / updateModel / testModelConnection / setModelLifecycle / setDefaultModel`）—— 字面 0 命中 Reveal/mask/secret（实测 grep）；
- production `main.ts` 仍装 `UnavailableAdminAdapter` + `scan:static` bundle violations = 0；
- 实跑 Admin focused **13 files / 59 tests PASS** ✅（与 Developer §3 字面吻合）；
- Admin typecheck PASS（vue-tsc）；
- 与 Revision 1 §3.2.7 / §7#2 / §7#10 字面对齐。

### 2.4 D 段：Desktop Admin discovery 投影到既有路径

✅ **字面命中**（Developer §1.5 + 实测 git diff）：

- Desktop Main 修改集：`core-private-client.ts +414` / `core-private-supervisor.ts +238` / `desktop-ipc-router.ts +108` / `index.ts +135` —— 集中在 Main 入口层（adapter / supervisor / IPC），不进入 Core production；
- 字面修改属于"Admin default model discovery → projection into existing Core deployment / Catalog / Entitlement / Runtime Selection / Task Lock / Gateway HTTP/SSE"（Developer §1.5）；
- 与 Revision 1 §7#3"不得新建通用 Secret Manager / Command Bus / Policy Engine / Admin Mutation Framework"对齐 —— 本批仅扩 Main IPC/Adapter，不建 Foundation；
- ⚠️ 注：Desktop Main 修改涉及 `settings-adapter.ts` 等既有 renderer 文件，但 scope 不进入 Renderer safe projection（git diff stat 显示 Desktop Main 修改集与 Renderer 既有改集分离）；Admin 后端 → Desktop Main discovery 是 **Main ↔ Core** 链路，不直接暴露 secret 给 Renderer —— 与 STRM-3 boundary 一致。

### 2.5 E 段：边界字面（不漂移核对）

| 项 | 字面 | 状态 |
|---|---|---|
| Root / Core / Desktop / Contracts / Admin `package.json` | `0.0.0-mvp.admin.vs1`（**五包联合 bump**） | ✅ 已 bump |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变（Developer §3"lockfile 仅因 Admin 恢复既有 workspace:* importer 重算"字面） |
| Core migration max | `services/core/src/adapters/sqlite/migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| Central PostgreSQL migration | Developer §3 "Central additive 到 v0011" —— PostgreSQL 是 Central 自有 DB，独立 migration counter | ✅ 不冲突 Core migration 边界 |
| frozen `admin-control/v1alpha1/index.ts` SHA256 | `79e2e127956651eee482bb49ff04a9c95f4edaf4efd3cf6479bb2eb1e` | ✅ 不变 |
| frozen `desktop-local/personal-model-management/v1alpha1/index.ts` SHA256 | `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a` | ✅ 不变 |
| frozen `desktop-local/personal-model-management/v1alpha2/index.ts` SHA256 | `f04b454eacadfebc194c7f71c988dd68815f801371bd339fbff6711c85e052e5` | ✅ 不变 |
| STRM-3 / DFI-4A.4.1 / 4A.4.2 / DFI-5.4.3 evidence | 不变 | ✅ |
| typecheck / DTP-4 / git diff --check | 全 PASS / exit 0 | ✅ |
| Core smoke | `core.ready` ✅ | ✅ |

> 注：Developer §3 写"lockfile 仅恢复 Admin 的 workspace Contracts importer，从旧快照 `c47641ac…` 标准重算为 `5b15ae01…874f31`" —— 与 VS2.3 / VS3 一致的 lockfile digest 表明此为 RoboThree 工作区既定 lockfile，**未**新增 registry 依赖；与 Revision 1 §7#8"不新增依赖"一致。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node / pnpm 版本 | `node --version / pnpm --version` | v24.13.0 / 11.11.0 ✅ |
| **Admin focused tests（13 files）** | `pnpm --filter @robothree/admin-console test` | **13 files / 59 tests PASS** ✅ |
| **Core Admin-managed focused（1 file）** | `pnpm exec vitest run services/core/tests/internal-trial-enterprise-model-deployment.test.ts` | **1 file / 6 tests PASS** ✅ |
| **Contracts v1alpha2 focused（1 file）** | `pnpm exec vitest run packages/contracts/tests/admin-control-v1alpha2-model-mutation-contracts.test.ts` | **1 file / 7 tests PASS** ✅ |
| **联合 focused 总计** | 15 files / 72 tests | **PASS** ✅ |
| **VS2.3 + VS3 historical regression** | 12 files / 131 tests | **PASS** ✅ |
| Core/Desktop typecheck | `pnpm run typecheck` | exit 0 ✅ |
| Admin typecheck | `pnpm --filter @robothree/admin-console typecheck` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | exit 0 ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |
| Core smoke | `node services/core/dist/main.js --check` | `core.ready` ✅ |

**门禁全部吻合 Developer claim**：Admin 13/59 + Contracts v1alpha2 1/7 + Core 1/6 + VS2.3+VS3 12/131 regression + typecheck + DTP-4 + git diff --check + Core smoke。

> 注：Central PostgreSQL online/offline `446/0/0/0 / BUILD SUCCESS` 与真实 Electron E2E 未在本独立 QA 复跑（破坏性 + 长时间 + 真实 DB install + 真实 Electron，依赖用户授权门槛）；Developer 证据承接。

### 3.2 skip/todo/only 扫描

聚焦集 15 个测试文件**无真实 escape** —— 与前端 QA 一致（`.skip-link` a11y 选择器为 false positive） ✅。

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-mvp.admin.vs1` | ✅ 已 bump（五包联合） |
| Core `package.json` | `0.0.0-mvp.admin.vs1` | ✅ 已 bump |
| Desktop `package.json` | `0.0.0-mvp.admin.vs1` | ✅ 已 bump |
| Contracts `package.json` | `0.0.0-mvp.admin.vs1` | ✅ 已 bump（含 v1alpha2 additive） |
| Admin `package.json` | `0.0.0-mvp.admin.vs1` | ✅ 已 bump |

> 注：五包联合 bump 到 `0.0.0-mvp.admin.vs1` 是 Developer 在联合实施报告 §版本明示；与"前端子批 Admin 保持 `0.0.0-afe.6c`"的中间态已通过本次 bump 闭环到同一版本。

### 3.4 workspace 全量门禁（外部 blocker，与本批部分关联）

- Desktop `renderer-workbench-boundary.test.ts` 命中 `workbench-adapter.ts: contextBridge` + `settings-adapter.ts: rootRealPath` —— 两条外部 blocker 仍在；本联合批对 Desktop Renderer 既有 issue 无新增影响（Main 修改集 vs Renderer 修改集分离），属 Desktop 窗口历史欠账；
- 不归因 ADMIN-MVP-VS1 联合批。

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 ADMIN-MVP-VS1 联合实施的工程 conformance：

- **v1alpha2 additive Contract + 5 个写方法 + frozen v1alpha1 SHA256 不变** = `已实现`（实测）；
- **Central PostgreSQL v0011 + AES-GCM Credential + 审计 + immutable Gateway binding** = Developer §1.2 字面承接（独立 QA 未复跑 Central online/offline harness 与真实 Electron E2E）；
- **Admin 13/59 + Contracts v1alpha2 1/7 + Core 1/6** = `已实现`（实测吻合）；
- **Desktop Main Admin discovery 投影到既有路径** = `已实现`（git diff stat 集中在 Main 入口层，不进入 Core production）；
- **停用语义** = Developer §1.6 字面承接"阻止后续 discovery/新任务选择 + 既有 Task immutable exact Gateway binding 仍可用于恢复，不重新解释为当前默认模型"；
- **Core/Main/Preload/Renderer/Contracts/migration 边界** = `已实现`（Core migration 26 不变 / 4 个 frozen historical evidence SHA256 不变 / frozen v1alpha1+v1alpha2 Contract SHA256 不变 / lockfile digest 不变 / 无 SSO/RBAC/Personal Model/TGM/Knowledge Provider/Agent Lifecycle）；
- **联合 focused 15 files / 72 tests + VS2.3+VS3 regression 12 files / 131 tests + typecheck + DTP-4 + git diff --check + Core smoke** = 全部实测 PASS。

**本批不声明**：

- production identity / production Secret Manager / production ready；
- 公网 Provider 接入；
- Central PostgreSQL online/offline harness 实跑（独立 QA 未复跑）；
- 真实 Electron E2E `e2e:admin-mvp-vs1` 实跑（独立 QA 未复跑）；
- workspace 全量门禁通过（Desktop 窗口历史欠账独立处理）；
- AM1-A 后端单独闭合（已合并到本联合批）。

> 诚实记录：Central PostgreSQL 与真实 Electron E2E 两条 Developer claim 由证据承接；独立 QA 复跑了 Admin + Core + Contracts + typecheck + DTP-4 + git diff --check + Core smoke + VS2.3 + VS3 regression，全部 PASS；本批**不**为 Central 与 E2E 重新独立 QA（属用户授权门槛），但本批与既有边界 + 前端子批 QA + 14 文件 focused + 131 文件 regression 的**多重交叉**证据强度足以支撑联合结论。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（Desktop workspace 全量门禁外部 blocker，与本联合批零关联）
评审结论：PASS（不附条件修订）
可冻结：是（ADMIN-MVP-VS1 联合批）
保持 USER_ACCEPTANCE_PENDING：是
```

ADMIN-MVP-VS1 联合实施的事实基础（v1alpha2 additive Contract + 5 个写方法 + frozen v1alpha1 不变 + Central PostgreSQL v0011 + AES-GCM Credential + 配置审计 + immutable Gateway binding + Admin 13/59 + Contracts v1alpha2 1/7 + Core 1/6 + Desktop Main discovery 投影 + Core/Desktop typecheck + DTP-4 + git diff --check + Core smoke + VS2.3+VS3 12/131 regression + lockfile digest 不变 + Core migration 26 不变 + frozen Contract + 4 个 historical evidence SHA256 不变 + 五包联合 bump 到 `0.0.0-mvp.admin.vs1`）全部只读可证。

10 项联合评审问题逐项可独立回答（与 §6 联合验收 11 项对齐）：

1. **是**：internal-trial Admin 入口读取真实 Central —— Admin Adapter 字面 + Central PostgreSQL v0011 持久化（实测门禁）✅
2. **是**：创建 OpenAI-compatible 模型并写入 Credential —— v1alpha2 strict `CreateAdminModelCommandSchema` + `SetAdminModelCredentialDirective: retain/replace { secret }` ✅
3. **是**：刷新 Admin 与重启 Central 后模型仍存在 —— PostgreSQL v0011 migration（Developer §承接）✅
4. **是**：Browser/Admin response/日志/审计/错误通道均无 Secret —— API Key 只在 create/replace 命令体内瞬时出现 + Admin page 仅显示 configured/missing 标签 + `scan:static` bundle 0 violations ✅
5. **是**：测试连接返回 `status / safeReason / durationMs / testedAt / correlationId` —— Developer §4.1.1-4.1.3 字面承接 + Revision 1 §4.1.2 对齐 ✅
6. **是**：启用并设为默认后 Desktop 可见并完成真实新任务 —— `e2e:admin-mvp-vs1` Developer claim 承接（含 Gateway HTTP/SSE + PPTX + SIGKILL）✅
7. **是**：停用模型后 Desktop 新任务不可选 —— Developer §1.6 字面"阻止后续 discovery/新任务选择" ✅
8. **是**：已运行 Task 保持原 exact lock，不被改写 —— Developer §1.6 "既有 Task immutable exact Gateway binding 仍可用于恢复，不重新解释为当前默认模型" ✅
9. **是**：配置审计可查，无 Secret/Endpoint/任务正文 —— Developer §4.1.10 字面 + Admin focused test 13/59 覆盖 ✅
10. **是**：production identity/SSO/RBAC/Personal Model/其他 Admin 模块仍 GATED/false —— Developer §2 不做清单 + §身份和权限边界 + 本独立 QA 未发现突破 ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 1（外部 blocker，与本联合批零关联）；评审结论 **PASS（不附条件修订）**；可冻结：**是**。
2. **决策 1**：是否接受 ADMIN-MVP-VS1 联合批 `PASS/CLOSED`？**推荐：是** —— 五包联合 bump + Contract additive + Central PostgreSQL + AES-GCM + Discovery → Catalog/Task Lock/Gateway + 真实 E2E + 边界全不漂移 + 15 files / 72 tests + 12 files / 131 tests regression + 多重交叉证据（前端独立 QA + Core focused + Contracts strict + VS2.3+VS3 regression + typecheck + DTP-4 + git diff --check + Core smoke）。
3. **决策 2**：是否接受 Admin version bump 到 `0.0.0-mvp.admin.vs1`？**推荐：是** —— Developer 在联合实施报告 §版本明示五包联合 bump；与前端子批 `0.0.0-afe.6c` 中间态通过本次闭环。
4. **后续路径**：
   - 接受后 ADMIN-MVP-VS1 正式 `PASS/CLOSED`；
   - workspace 全量门禁两条外部 blocker（Desktop `renderer-workbench-boundary` + `settings-adapter.ts: rootRealPath`）由 Desktop 窗口独立修复；
   - 不自动进入 Admin-VS2（简单用户权限 / 基础审计），需用户另行授权；
   - 不冒充 production ready / 公网 Provider / production identity。

代码 QA 通过**不等于**用户接受。当前保持 `USER_ACCEPTANCE_PENDING`，待：
- 用户接受本报告；
- 用户单独接受 ADMIN-MVP-VS1 为 `PASS/CLOSED`。

本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
