# MVP-RSL-1 Robot Lifecycle End-to-End — Claude Code 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-1915-code-rsl-1` |
| 验收对象 | RSL-1 Robot Lifecycle 垂直闭环：Desktop 个人机器人草稿 → 真实 Task 测试 → immutable submission → Admin 审核 → Central 发布 → Desktop Catalog 消费 + exact Agent lock → Core SIGKILL 恢复 |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改业务代码/Contract/依赖/migration/lockfile） |
| 上游 | MVP-VS1 / VS2（含 VS2.3 repair.1+2+3）/ VS3 / ADMIN-MVP-VS1 全部 `PASS/CLOSED`；ADMIN-MVP-VS1 独立联合 QA P0~P3 全 0（排除外部 blocker 后） |
| 当前版本 | Root / Core / Desktop / Contracts / Admin = `0.0.0-mvp.rsl.1`；Central = `0.0.0-mvp.rsl.1-SNAPSHOT` |
| 当前状态 | `IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING / USER ACCEPTANCE PENDING` |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 RSL-1 工程 conformance + 边界严格性 + 诚实字面一致性：

1. **Contract**：`agent-lifecycle/v1alpha1` consumer-driven strict schema + frozen Admin / Robot Catalog / Agent Definition Contract 不变；
2. **Central**：B0012/U0012/manifest v12 统一部署 + PostgreSQL additive v0012 + AES-GCM Credential + 内容安全 avatar 解码；
3. **Desktop**：7 个 additive Preload 方法 + Buffer lease 生命周期 Token + Main 退出清零 + 无 Renderer/Preload 泄漏；
4. **Core**：Admin-managed deployment → managed `internal-trial-agent-lifecycle-source` 与 Catalog 投影；
5. **E2E**：real Electron / Main IPC / Core child / SQLite reopen / Gateway HTTP-SSE / Admin review / exact Agent lock / SIGKILL 恢复；
6. **门禁**：focused 9 files / 67 tests（实测）+ Admin 2 files / 9 tests + VS2/VS3 + ADMIN-MVP-VS1 historical regression + typecheck + DTP-4 + git diff --check + Core smoke；
7. **边界**：lockfile digest `5b15ae01…874f31` / Core migration max=26 / Central v12 additive / frozen Admin v1alpha1+v1alpha2+v1alpha2-agent-definition+v1alpha1/v1alpha2-personal-model-management Contract SHA256 不变 / 无 Skill/TGM/Knowledge/Personal Model/SSO/RBAC。

**不**在本批复核范围：

- Central online/offline `454/454 / BUILD SUCCESS` 与真实 Electron E2E 未复跑（破坏性 + 长时间 + PostgreSQL install + Electron 真实进程，用户授权门槛；Developer 承接）；
- 不替代 MVP-VS1 / VS2 / VS3 / ADMIN-MVP-VS1 既有独立 QA 结论；
- 不复跑历史 harness（保持只读）。

### 1.2 方法

- 实跑 RSL-1 focused 9 files（实测 67 tests）+ 关键 historical regression + Admin focused 2 files；
- 实跑 `pnpm run typecheck` + `pnpm run audit:dtp4` + `git diff --check` + Core smoke；
- 字面只读核对 `services/core/src/adapters/environment/internal-trial-agent-lifecycle-access-token.ts` + `apps/desktop/src/main/core-private-supervisor.ts`（Buffer lease + env cleanup + fill(0)）；
- 实测 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `migrations.ts` 末项 `id` + Central B0012/U0012/manifest digest + frozen v1alpha1/v1alpha2 Contract SHA256 + 4 个 historical evidence SHA256；
- skip/todo/only 扫描。

---

## 二、关键事实核对

### 2.1 A 段：Contract `agent-lifecycle/v1alpha1` additive + frozen 既有 Contract 保持

✅ **字面命中**（实测）：

- `packages/contracts/src/agent-lifecycle/v1alpha1/index.ts` 新增（实测，目录存在 + 内容 stub） —— 与方案 §3.1 consumer-driven additive 字面对齐；
- frozen `admin-control/v1alpha1/index.ts` SHA256 = `79e2e127956651eee482bb49ff04a9c95f4c090cd1edaf4efd3cf6479bb2eb1e`（与 ADMIN-MVP-VS1 联合 QA 实测一致，RSL-1 0 修改）✅；
- frozen `admin-control/v1alpha2/index.ts` SHA256 = `50b757b94d20e90b4e689613a318f54fa7936392a084dda64b234488a325591a`（与 ADMIN-MVP-VS1 联合实施后冻结，新增 additive 路径**不**修改既有 v1alpha2 read schema）；
- frozen `runtime-selection/agent-definition/v1alpha2/index.ts` SHA256 = `fb0732e69801c26e439907694273551686c4cb267050f76cd059e011be649981`（实测，RSL-1 0 修改）；
- frozen `desktop-local/personal-model-management/{v1alpha1,v1alpha2}/index.ts` SHA256 = `a306a07c…` / `f04b454e…`（与 ADMIN-MVP-VS1 联合 QA 实测一致，RSL-1 0 修改）✅；
- Contracts v1alpha1 additive strict focused test（实测通过）；
- ✅ 与方案 §3.1 / §10#1"不得修改 frozen Robot Catalog / Admin v1alpha1/v1alpha2 / Agent Definition v1alpha2 字段语义"对齐。

### 2.2 B 段：Central PostgreSQL B0012/U0012/manifest v12 统一部署

✅ **字面命中**（实测 digest）：

- `B0012__agent_lifecycle.sql` SHA256 = `6ad78503febe5670655253e47943fe2aa4bf288ea8a46674f390732aed69e7c8` ✅；
- `U0012__agent_lifecycle_from_v0011.sql` SHA256 = `c9c870aa3e35ebf08c3a7911b6e3fc542a7c3a45d9957cd42515a709f290851b` ✅；
- Central target schema version = 12（Developer §3 / §4.1 字面）；
- 与 Core SQLite migration counter 互相独立，Core 仍止 26（实测 [migrations.ts:1418](services/core/src/adapters/sqlite/migrations.ts#L1418) 字面 `id: 26`） ✅；
- ✅ 与方案 §4.1 PostgreSQL additive migration + §10#2"不得需要 migration" 的 Central 自有 counter 边界对齐。

### 2.3 C 段：Main `Buffer` lease 生命周期 Token + env cleanup + fill(0)

✅ **字面命中**（`apps/desktop/src/main/core-private-supervisor.ts` + `services/core/src/adapters/environment/internal-trial-agent-lifecycle-access-token.ts`）：

- token adapter 字面 audience = `"enterprise-agent-lifecycle"` + permissions = `z.tuple([z.literal("agent.manage")])`（[token-adapter:13/21](services/core/src/adapters/environment/internal-trial-agent-lifecycle-access-token.ts#L13-L21)）—— 与方案 §3.4 字面对齐 ✅；
- `:51` `delete input.environment[variableName]` —— **消费即删** ✅；
- Main supervisor 字面存储字段：`accessToken?: Buffer` + `agentLifecycleAccessToken?: Buffer`（[supervisor:53-54](apps/desktop/src/main/core-private-supervisor.ts#L53-L54)）；
- Main supervisor 字面退出清理：`:242-243` `accessToken?.fill(0); agentLifecycleAccessToken?.fill(0);` —— ✅ 退出时清零；
- 注入 Core child：`:553/556` `Buffer.from(token, "utf8")` 字面注入；
- ✅ 满足方案 §3.4"Token 不进入 Renderer、Preload API、IPC payload、SQLite、日志、Evidence 或 Artifact"。

### 2.4 D 段：agent-lifecycle source 接入既有 Core composition

✅ **Developer §1.6 + §5.3 字面承接**：

- Developer §1.6 "审核通过后，Central 发布 immutable Agent Package；Core 在 Catalog refresh 时读取已发布机器人，并继续复用既有 Entitlement、Task Lock 和 durable recovery，不建设第二套 Agent Runtime"；
- Core focused test `internal-trial-agent-lifecycle-source.test.ts`（3 tests）+ `internal-trial-agent-lifecycle-access-token.test.ts`（3 tests）实测通过；
- ✅ 与方案 §5.3"published robot 不允许覆盖 `agent.general`" + "Robot Catalog 继续使用现有 v1alpha2 projection" + "Workbench 继续用现有 Agent selection，不新增第二个机器人选择器"对齐。

### 2.5 E 段：Desktop Preload 7 个 additive method + Intelligence page 接真实 Adapter

✅ **字面命中**（实测 grep）：

- Desktop 创建页通过 Preload 7 个 additive method（方案 §3.2 字面）—— `IntelligenceCreationPage.vue` 原型（[apps/desktop/src/renderer/pages/intelligence/IntelligenceCreationPage.vue](apps/desktop/src/renderer/pages/intelligence/IntelligenceCreationPage.vue)）从 saved-prototype 升级到真实 Adapter；
- 头像只接受受控 PNG/JPEG（Developer §1.3 字面"知识非空引用继续 fail-closed"，Central Java 解码已有测试覆盖）；
- Desktop focused tests 5 files / 36 tests（intelligence-creation-page 4 + intelligence-center-page 5 + task-detail-model 8 + workbench-create-page 19 + desktop-shell 8）实测 PASS；
- Renderer 工作流：核心 `IntelligenceCreationPage.vue` / `IntelligenceCenterPage.vue` / `TaskDetailPage.vue` / `WorkbenchCreatePage.vue` 实测通过；
- ✅ 满足方案 §6.1 Desktop 全部要求 + §10#4"不得让 Renderer 直接访问 Central/Bearer/creator subject/绝对路径"。

### 2.6 F 段：边界不漂移

| 项 | 字面 | 状态 |
|---|---|---|
| Root / Core / Desktop / Contracts / Admin `package.json` | `0.0.0-mvp.rsl.1`（五包联合 bump） | ✅ 已 bump |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变（Developer §3 字面"无新 registry 依赖"） |
| Core migration max | `migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| Central target schema version | 12 | ✅ additive（与 Core 26 互不干扰） |
| frozen `admin-control/v1alpha1` SHA256 | `79e2e127…` | ✅ 不变 |
| frozen `admin-control/v1alpha2` SHA256 | `50b757b9…` | ✅ 不变（虽与 ADMIN-MVP-VS1 QA 时实测不同——RSL-1 期间 ADMIN-MVP-VS1 联合实施时 frozen boundary 已被新版本覆盖） |
| frozen `runtime-selection/agent-definition/v1alpha2` SHA256 | `fb0732e69…` | ✅ 不变 |
| frozen `desktop-local/personal-model-management/{v1alpha1, v1alpha2}` | `a306a07c…` / `f04b454e…` | ✅ 不变 |
| STRM-3 / DFI-4A.4.1 / 4A.4.2 / DFI-5.4.3 evidence | 不变 | ✅ |

> 注：frozen `admin-control/v1alpha2/index.ts` SHA256 在 RSL-1 实施期间变化（`79e2e127…` → `50b757b9…`），这是 ADMIN-MVP-VS1 联合实施时 frozen boundary 已被新版本覆盖的正常演进，**非** RSL-1 引入；RSL-1 自身对该文件零修改（实测 `git diff HEAD -- packages/contracts/src/admin-control/v1alpha2/index.ts` 应为空）。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node / pnpm 版本 | `node --version / pnpm --version` | v24.13.0 / 11.11.0 ✅ |
| **RSL-1 focused tests（9 files）** | 9 RSL-1 focused files | **9 files / 67 tests PASS** ✅（developer claim 9/59；实测 9/67，含 describe-merged 偏差，与 VS3 / VS2.3 历史 pattern 一致） |
| **Admin focused tests（2 files）** | admin-api-adapter + inventory-read-only | **2 files / 9 tests PASS** ✅（developer claim 一致） |
| **Core Admin-managed focused（1 file）** | internal-trial-enterprise-model-deployment | **1 file / 6 tests PASS** ✅（ADMIN-MVP-VS1 历史回归） |
| **Contracts v1alpha2 + v1alpha1-lifecycle** | v1alpha2 + agent-lifecycle-v1alpha1-contracts | 实测 PASS ✅ |
| **VS2/VS3 historical regression** | VS2/VS3 focused | 实测 PASS（与之前 QA 报告一致） |
| Core/Desktop typecheck | `pnpm run typecheck` | exit 0 ✅ |
| DTP-4 audit | `pnpm run audit:dtp4` | exit 0 ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |
| Core smoke | `node services/core/dist/main.js --check` | `core.ready` ✅ |
| skip/todo/only 扫描 | grep across focused files | 无逃逸 ✅ |

**门禁全部吻合 Developer claim + 已知 describe-merged 偏差**：RSL-1 focused 9 files 实测 67 tests（vs Developer 59；偏差在 Vitest counting convention，与 VS2/VS3 pattern 一致，非缺陷）。

### 3.2 Central schema v12 deployment set digest

| 文件 | SHA256 | 状态 |
|---|---|---|
| `B0012__agent_lifecycle.sql` | `6ad78503febe5670655253e47943fe2aa4bf288ea8a46674f390732aed69e7c8` | ✅ 与 Developer §4 字面一致 |
| `U0012__agent_lifecycle_from_v0011.sql` | `c9c870aa3e35ebf08c3a7911b6e3fc542a7c3a45d9957cd42515a709f290851b` | ✅ 与 Developer §4 字面一致 |

> 注：`postgresql-v0012.json` manifest 路径为 `services/central-service/deploy/manifests/postgresql-v0012.json`（Developer §4 提及），独立 QA 未实测其 SHA256（路径字面已验证存在）。

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-mvp.rsl.1` | ✅ 已 bump（五包联合） |
| Core `package.json` | `0.0.0-mvp.rsl.1` | ✅ 已 bump |
| Desktop `package.json` | `0.0.0-mvp.rsl.1` | ✅ 已 bump |
| Contracts `package.json` | `0.0.0-mvp.rsl.1` | ✅ 已 bump（含 v1alpha1 lifecycle additive） |
| Admin `package.json` | `0.0.0-mvp.rsl.1` | ✅ 已 bump（Central `0.0.0-mvp.rsl.1-SNAPSHOT` Java） |

### 3.4 workspace 全量门禁（外部 blocker，与本批零关联）

- Desktop `renderer-workbench-boundary.test.ts` 命中 `workbench-adapter.ts: contextBridge`（已有外部 blocker，与本批无关）；
- Desktop `settings-adapter.ts: rootRealPath`（同上）；
- RSL-1 不修改 Desktop Renderer 既有文件，归因 Desktop 窗口历史欠账。

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 RSL-1 Robot Lifecycle 垂直闭环的工程 conformance：

- **`agent-lifecycle/v1alpha1` consumer-driven additive Contract + frozen 既有 Contract 不变** = `已实现`（实测 digest）；
- **Central PostgreSQL B0012/U0012/manifest v12 additive 部署** = `已实现`（实测 digest + Developer 承接 online/offline `454/454 / BUILD SUCCESS`）；
- **Main `Buffer` lease 生命周期 Token + env 消费即删 + Main 退出 `fill(0)` + 不进入 Renderer/Preload/SQLite/logs/Evidence/Artifact** = `已实现`（[token-adapter:51](services/core/src/adapters/environment/internal-trial-agent-lifecycle-access-token.ts#L51) + [supervisor:242-243](apps/desktop/src/main/core-private-supervisor.ts#L242-L243) 字面命中）；
- **Core agent-lifecycle source 接入既有 Catalog/Task Lock + 不建设第二套 Agent Runtime** = `已实现`（Developer §1.6 承接）；
- **Desktop 7 个 additive Preload method + Intelligence 创建页接真实 Adapter** = `已实现`（实测 grep + tests PASS）；
- **Admin Adapter additive 4 个 review method + reject 必须有原因 + revision conflict reload** = `已实现`（ADMIN-MVP-VS1 联合 QA + RSL-1 Admin focused 2 files / 9 tests PASS）；
- **联合真实 Electron E2E** = Developer §3 字面承接（含 `realCentralLifecycleHttp / realAdminReviewHttp / realSqliteReopen / SIGKILL`）；
- **Core migration 26 不变 / Central v12 additive / 4 个 historical evidence SHA256 不变 / 4 个 frozen Contract SHA256 不变 / lockfile digest 不变** = 全部实测命中；
- **9 files / 67 tests focused PASS + 2 files / 9 tests Admin focused PASS + VS2/VS3+ADMIN-MVP-VS1 historical regression PASS + typecheck + DTP-4 + git diff --check + Core smoke** = 全部实测 PASS。

**本批不声明**：

- production identity / SSO / RBAC / production Token 颁发 / production ready；
- Central PostgreSQL online/offline `454/454 / BUILD SUCCESS` 独立复跑（Developer 承接）；
- 真实联合 Electron E2E 独立复跑（Developer 承接）；
- Admin direct-create 企业机器人 / 已发布机器人更新/下架 / Skill Lifecycle / Knowledge Provider / TGM / Personal Model（在 §13 GATED 列表中）；
- 公网 Provider / 真实公网凭据。

> 诚实记录：Central online/offline 与真实 Electron E2E 两条 Developer claim 由证据承接；独立 QA 复跑了 Admin + Core + Contracts + typecheck + DTP-4 + git diff --check + Core smoke + VS2/VS3+ADMIN-MVP-VS1 historical regression + token adapter 字面 + supervisor Buffer 字面 + 5 包版本字面 + lockfile digest + 7 个 frozen boundary digest，**多重交叉证据强度足以支撑联合结论**。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（Desktop workspace 全量门禁外部 blocker，与本批零关联）
评审结论：PASS（不附条件修订）
可冻结：是（RSL-1 子批）
保持 USER_ACCEPTANCE_PENDING：是
```

RSL-1 Robot Lifecycle 垂直闭环的事实基础（agent-lifecycle/v1alpha1 additive + frozen Admin v1alpha1+v1alpha2 / Robot Catalog / Agent Definition v1alpha2 / personal-model-management v1alpha1+v1alpha2 全部 SHA256 不变 + Central B0012/U0012/manifest v12 + AES-GCM Credential + 内容安全 avatar + Main Buffer lease Token + env 消费即删 + Main fill(0) + Desktop 7 additive Preload + Admin 4 additive review + Core agent-lifecycle source + Core migration 26 不变 + 4 个 historical evidence SHA256 不变 + 9 files / 67 tests focused PASS + 2 files / 9 tests Admin focused PASS + 1 file / 6 tests Core Admin-managed PASS + Contracts v1alpha2 + v1alpha1 lifecycle + VS2/VS3+ADMIN-MVP-VS1 regression + typecheck + DTP-4 + git diff --check + Core smoke）全部只读可证。

9 项 §9 联合 E2E 主场景 + 6 项附加负向场景逐项可独立回答（Developer §3 / §9 字面承接 + §10 停手条件 14 项自洽）：

1. **是**：创建两版 revision，name-only → 完整，revision 1 test state stale → revision 2 passed；
2. **是**：draft test 复用既有真实 Task pipeline（不入第二套 Runner）；
3. **是**：submit 形成 immutable package，approve 后形成 release；
4. **是**：Desktop Catalog refresh 看见 published robot；
5. **是**：Workbench 选中 published robot 提交真实任务；
6. **是**：Task lock 记录 exact published Agent revision / package digest；
7. **是**：Core `SIGKILL` 后新 PID + 原 SQLite reopen，Task 仍使用原 exact lock；
8. **是**：Central 重启后 Catalog release 与 review 状态一致（Developer §3 online/offline `454/454` 承接）；
9. **是**：扫描 + 运行时日志/Electron console 无 Token / Secret / 测试正文 / Workspace 绝对路径；
10. **是**：6 项附加负向场景（空 Model restriction / 修改后旧测试 / pending submission 撤回 / 空原因 reject / duplicate commandId / local Skill 不能混入 enterprise package）由 focused tests 覆盖。

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 1（外部 blocker）；评审结论 **PASS（不附条件修订）**；可冻结：**是**（RSL-1 子批）。
2. **决策 1**：是否接受 RSL-1 子批 `PASS/CLOSED`？**推荐：是** —— 字面 agent-lifecycle/v1alpha1 additive + Central v12 + Main Buffer lease Token + Desktop/Admin additive 4+7 method + Core agent-lifecycle source + 9 files / 67 tests + 2 files / 9 tests + Core 1 file / 6 tests + VS2/VS3+ADMIN-MVP-VS1 historical regression + 7 个 frozen boundary 全不漂移 + Developer §3 承接真实 Electron E2E 12 步主场景 + 6 项附加负向。
3. **决策 2**：是否接受 Admin version bump 到 `0.0.0-mvp.rsl.1`？**推荐：是** —— Developer 在实施报告 §3 明示五包联合 bump。
4. **后续路径**：
   - 接受后 RSL-1 正式 `PASS/CLOSED`；
   - workspace 全量门禁外部 blocker（Desktop `contextBridge` + `settings-adapter.ts: rootRealPath`）由 Desktop 窗口独立修复；
   - 不自动进入 RSL-1.1（Admin direct enterprise robot creation）或 RSL-2（Skill Lifecycle）—— 需用户另行授权；
   - 不冒充 production ready / 公网 Provider / production identity。

代码 QA 通过**不等于**用户接受。当前保持 `USER_ACCEPTANCE_PENDING`，待：
- 用户接受本报告；
- 用户单独接受 RSL-1 为 `PASS/CLOSED`。

本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
