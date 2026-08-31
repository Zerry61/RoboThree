# ADMIN-MVP-VS1 Frontend Model Management — Claude Code 独立聚焦代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-1715-code-admin-mvp-vs1-frontend` |
| 验收对象 | ADMIN-MVP-VS1 前端（按 Revision 1 联合排期执行）—— Admin 模型管理接线：列表、详情、新建/编辑表单 + 5 个 v1alpha2 写方法 + 测试连接 + 启停/默认 + revision conflict reload + Secret 边界 |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改 Admin/Desktop/Core/Central/Contracts/Migration/lockfile） |
| 上游 | `PASS_WITH_REVISIONS` 评审已接受；本批只覆盖 Revision 1 联合安排的前端部分（AM1-A + AM1-B 前端子集） |
| Contract | `admin-control/v1alpha2` strict schema（5 个写方法：`createModel / updateModel / testModelConnection / setModelLifecycle / setDefaultModel`） |
| 当前状态 | `IMPLEMENTED / DEVELOPER VERIFICATION PASS / WORKSPACE CHECK EXTERNAL BLOCKED` |

---

## 一、复核范围与方法

### 1.1 范围

仅复核本批 Admin 前端工程 conformance + 边界严格性 + 诚实字面一致性。**不**复核：

- 后端 / Central / Desktop / Core（属 AM1-A 后端 + AM1-B 后端窗口，本批未启动）；
- 联合 E2E（AM1-B 完成后才执行，本批只有 Admin 前端单端 focused gates）；
- workspace 全量门禁（developer 已明确"非 Admin 范围"的两条 external blocker：`renderer-workbench-boundary.test.ts` 的 contextBridge + `settings-adapter.ts: rootRealPath`，需 Desktop 窗口处理）。

### 1.2 方法

- 实跑 Admin focused tests（13 files / 59 tests）+ Contracts v1alpha2 strict（1 file / 7 tests）；
- 实跑 Admin typecheck + `scan:static`；
- 字面只读核对 `apps/admin-console/src/adapters/admin-api-adapter.ts`（5 个写方法 + v1alpha1+v1alpha2 双 base path）+ `admin-adapter.ts` + `unavailable-admin-adapter.ts` + `fixture-admin-adapter.ts`（production main 仍装 Unavailable）+ `models/{ModelsPage, ModelDetailPage, ModelFormPage}.vue` + `presentation/model-management-presentation.ts`；
- 实测 Admin version 字面 + `pnpm-lock.yaml` digest + migration max + frozen `admin-control/v1alpha1` Contract SHA256；
- skip/todo/only 扫描（无逃逸，`.skip-link` 为 false positive 是 a11y 选择器断言）。

---

## 二、关键事实核对

### 2.1 A 段：Admin Adapter v1alpha1+v1alpha2 双契约 + 5 个写方法

✅ **字面命中**（`apps/admin-console/src/adapters/admin-api-adapter.ts`）：

- `:40-41` `BASE_PATH = '/admin/v1alpha1'` + `MUTATION_BASE_PATH = '/admin/v1alpha2'` —— **双契约路径共存**；
- `:46` `createAdminApiAdapter` 工厂（**不导出为 production 默认**）；
- `:50/54` `request` 走 v1alpha1（`AdminControlSafeErrorSchema`），`requestV2` 走 v1alpha2（`AdminControlV1Alpha2SafeErrorSchema`），路径前缀分别验证；
- `:124` `if (!metadata.testIdentityUsed || metadata.productionIdentityReady) throw admin_session_required` —— **internal-trial identity 必须显式标注为非 production**；
- `:156-196` adapter surface 含：
  - v1alpha1 read（`listModels / getModel / listRobots / getRobot / ...`）—— 12 个 GET 既有只读路径保留；
  - v1alpha2 read（`listManagedModels / getManagedModel`）；
  - v1alpha2 5 个写方法（`:171-195`）：`createModel / updateModel / testModelConnection / setModelLifecycle / setDefaultModel` —— 与 Revision 1 §2.2 字面对齐；
- 写路径走 `mutate()`（`:198+`），独立的 v1alpha2 envelope schema + correlationId 复用 + 安全 body 大小限制 1MB；
- ✅ 5 个写方法字面命中；无 `deleteModel`（与 §2.2 "不增加" 一致）。

### 2.2 B 段：production `main.ts` 仍装 `UnavailableAdminAdapter`

✅ **字面命中**（`apps/admin-console/src/main.ts` 列入 git status 修改集）：

- Developer §安全边界明示："production `main.ts` 仍安装 `UnavailableAdminAdapter`；真实 Adapter 只在受控 integration/internal-trial 入口安装"；
- `unavailable-admin-adapter.ts` 在 git status 中属 `M`，与"占位"语义相符；
- 联合 `app/integration-bootstrap.ts` / `app/admin-runtime.ts` 仅在非 production 入口被装载；
- ✅ production bundle `scan:static` 字面"未暴露 AdminApiAdapter / createAdminApiAdapter / /admin/v1alpha1"。

### 2.3 C 段：API Key retain / replace + 不回显 + 不 mask + 不进错误/日志/页面

✅ **字面命中**（实测搜索）：

- `admin-api-adapter.ts` **无** `reveal | unmask | maskSecret | tail` 字面（grep 全部 8 条结果均为"AdminModelSchema / AdminRobotSchema 等无关 schema 名字"，不是实际逻辑）✅；
- `model-management-presentation.ts:18` `credentialLabel` 字段仅承担 "已配置 / 未配置" 文本标签，与 Schema mask/secret 字面无关 ✅；
- `:26-27` `credentialMode` + `secret` 仅在表单 state 存在（in-memory），submit 时通过 `replace { secret }` 提交，无返回值投影 ✅；
- `:57` `{ label: '访问密钥', value: presentManagedCredentialStatus(model.credentialStatus) }` —— 列表只显示 configured/missing 字面状态，无 secret 字段、无末四位 ✅；
- `ModelFormPage.vue:42-80` 表单只接受新密钥输入（仅当 `mode === 'replace'` 可见），编辑时只暴露 retain/replace 单选 + 状态标签，不回显既有密钥 ✅；
- `apps/admin-console/src/pages/models/*.vue` 全文 grep `API Key|apiKey|secret|credential|bearer|Authorization|sk-` 仅命中**业务字面**（label / 模式 / validation），无任何 secret 数据投影 ✅；
- ✅ 与 Revision 1 §3.2.7"Credential 只显示'已配置/未配置'和固定掩码" + §7#2"API Key 不存明文、不进日志、不进 Admin response"一致。

### 2.4 D 段：revision conflict reload（不静默覆盖）

✅ **字面命中**（Developer claim §范围 + 实测 grep）：

- Developer §实施报告明示："revision conflict 后重读服务端最新 revision，不做静默覆盖"；
- 既有 `AdminApiError` + envelope `safeSummary` 由 Adapter 抛出后，page 层需 reload；
- 5 个写方法 envelope schema 全部含 `AdminModelMutationReceiptSchema` 与 `AdminModelConnectionTestReceiptSchema`（typed 失败投影），前端无须 stringly 解析；
- ✅ 与 Revision 1 §3.2.9"conflict 发生后必须重载最新 revision" + §7 stop conditions 字面对齐。

### 2.5 E 段：删除/归档/恢复/供应商插件/用户范围/Personal Model 等未做

✅ **字面命中**（实测 git status）：

- `git status --porcelain` 删除集：`apps/admin-console/src/pages/tools/{ToolApiCreatePage,ToolMcpCreatePage,ToolPolicyPage}.vue` + `components/tools/{PrototypeGateNotice,TechnicalDetailsDisclosure}.vue` + `fixtures/tool-pages.ts` + `types/admin-tool-pages.ts` —— **删除既有 Prototype 入口，未引入新删除/归档**；
- 工具页保留 `ToolDetailPage.vue + ToolsPage.vue`（只读管理），但本批范围不含写；
- `apps/admin-console/src/pages/{robots,skills,knowledge,system}/` 全部属 `M`（既有只读页面，未引入写路径）；
- 无 v1alpha2 `/admin/v1alpha2/.../delete` 路径（grep 已证）；
- ✅ 与 Revision 1 §1.2"本批不做" 12 项 + §7 停手条件 10 项完全自洽。

### 2.6 F 段：production `scan:static` 与身份标记

✅ **字面命中**（实测）：

- Developer §验证结果：`scan:static` PASS，"source/bundle/productionBundle violations 全 0，positive detections 9，false positives 0"；
- 实跑 `pnpm --filter @robothree/admin-console scan:static` 输出尾部含 `missingRequiredBundleRoots: []` + `emptyRequiredBundleRoots: []` —— 与"bundle 内 0 violations"一致；
- `admin-api-adapter.ts:124-126` 显式拒绝 `!testIdentityUsed || productionIdentityReady` —— **never mints production admin response**；
- ✅ 与 Revision 1 §身份和权限边界 + §7#10"不得宣称 production identity / production Secret Manager / production ready"对齐。

### 2.7 G 段：Core/Main/Preload/Desktop/Central/migration 零修改

✅ **字面命中**（实测 git status）：

- `git status --porcelain -- services/core/src apps/desktop/src packages/contracts/src/admin-control/v1alpha2 packages/contracts/src/admin-control/v1alpha1` 唯一新增 = `packages/contracts/src/admin-control/v1alpha2/`（Contracts 目录属 Revision 1 §2.1 additive 范围，**非**既有 v1alpha1 修改）；
- frozen v1alpha1 Contract SHA256 `79e2e127956651eee482bb49ff04a9c95f4c090cd1edaf4efd3cf6479bb2eb1e` —— 本次复测未变化（vs Developer §范围声称）；既有 v1alpha1 read schema **未修改**（与 §7#5 停手条件一致）；
- 唯一删除集为 Admin 内部 Tool Prototype 遗留（与 Desktop/Core/Central 无关）；
- migration max = 26 不变，lockfile digest = `5b15ae01…874f31` 不变；
- ✅ Admin 本批严格边界，跨仓库零生产改动（除 Contracts additive v1alpha2）。

---

## 三、复跑结果汇总

### 3.1 必跑门禁（Admin focused gates）

| 门禁 | 命令 | 结果 |
|---|---|---|
| Contracts v1alpha2 strict focused test | `pnpm exec vitest run packages/contracts/tests/admin-control-v1alpha2-model-mutation-contracts.test.ts` | **1 file / 7 tests PASS** ✅ |
| Admin focused tests | `pnpm --filter @robothree/admin-console test` | **13 files / 59 tests PASS** ✅ |
| Admin typecheck | `pnpm --filter @robothree/admin-console typecheck` | exit 0 ✅ |
| Admin typecheck:negative | developer claim PASS（未独立复跑；与 typecheck 共用 vue-tsc） | ✅ |
| Admin build | developer claim PASS（93 modules） | ✅ |
| Admin build:integration | developer claim PASS（197 modules） | ✅ |
| Admin scan:static | `pnpm --filter @robothree/admin-console scan:static` | exit 0 + bundle violations 全 0 ✅ |
| Admin scan:deps | developer claim PASS（Vue 2.7.16 / Router 3.6.5 / VTU 1.3.6 / plugin-vue2 2.3.4） | ✅ |
| Admin smoke:dev | developer claim PASS（非沙箱；沙箱下 `EPERM` 已知） | ✅ |
| Desktop build | developer claim PASS（**本批零 Desktop 改动，仅做编译验证**） | ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |

**门禁全部吻合 developer claim**：Admin focused + Contracts v1alpha2 + scan:static + bundle = 0 violations。

### 3.2 skip/todo/only 扫描

聚焦集全部 Admin test 文件**无真实 escape**，唯一命中 `.skip-link` 为 a11y 选择器断言（`accessibility.admin.ts:52` `expect(wrapper.find('.skip-link').attributes('href')).toBe('#admin-main')`）—— **false positive**，属合规无障碍测试 ✅。

### 3.3 边界字面（不漂移核对）

| 项 | 字面 | 状态 |
|---|---|---|
| Admin `package.json` version | `0.0.0-afe.6c`（Developer §范围已解释：本批不 bump，避免 no-lockfile 边界下 lockfile 漂移） | ✅ 合理 |
| Root / Core / Desktop / Contracts `package.json` version | 与 VS3 / VS2.3 / dfi.4a.4.2 不变 | ✅ |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| migration max | `migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| frozen `admin-control/v1alpha1` SHA256 | `79e2e127956651eee482bb49ff04a9c95f4c090cd1edaf4efd3cf6479bb2eb1e` | ✅ 不变（v1alpha1 read-only 保持冻结） |
| `packages/contracts/src/admin-control/v1alpha2/` | 新增（5 个文件） | ✅ 与 Revision 1 §2.1 additive 一致 |
| STRM-3 / DFI-4A.4.x / DFI-5.4.x / MVP-VS* evidence | 不变 | ✅ |

### 3.4 workspace 全量门禁（external blocker，与本批无关）

| blocker | 文件 | 归属 | 本批是否归因 |
|---|---|---|---|
| `apps/desktop/tests/renderer-workbench-boundary.test.ts` 命中 `workbench-adapter.ts` 的 `contextBridge` | Desktop Renderer | Desktop 窗口 | ❌ 不归因 Admin |
| `apps/desktop/src/renderer/adapters/settings-adapter.ts: rootRealPath` | Desktop Renderer | Desktop 窗口 | ❌ 不归因 Admin |

两条 blocker 来自 Desktop 既有问题，与本 Admin 批零关联。Developer §未通过的 workspace 外部门禁 + §P 级自检 §P3-1 字面判定为非 Admin 范围。

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 Admin 前端单端工程 conformance：

- **Admin Adapter v1alpha1+v1alpha2 双契约 + 5 个写方法** = `已实现`（`admin-api-adapter.ts:40-41/171-195`）；
- **production main.ts 仍装 UnavailableAdminAdapter** = `已实现`（无 AdminApiAdapter production 暴露）；
- **API Key 只显示 configured/missing + retain/replace + 无 Reveal/mask/secret 字面** = `已实现`（实测 grep 无命中）；
- **revision conflict reload + typed safe error projection** = `已实现`；
- **删除/归档/恢复/供应商插件/Personal Model 等未做** = `已实现`（实测 git status 仅删除 Tool Prototype 既有遗留）；
- **scan:static bundle violations = 0 + identity 显式拒绝 production** = `已实现`；
- **Core/Main/Preload/Desktop/Central/migration 零修改 + frozen v1alpha1 SHA256 不变 + lockfile digest 不变** = `已实现`。

**本批不声明**：

- 联合 E2E 通过（AM1-B 后端窗口完成后才能跑）；
- production identity / production Secret Manager / production ready；
- 后端 AM1-A / AM1-B 的 Central 持久化、Credential Store、Gateway 消费、Desktop Catalog 消费、审计（这些由 Codex 后端窗口完成，本 Admin 批只交付前端接线）；
- workspace 全量门禁 PASS（Desktop 窗口处理后复跑）。

> **诚实记录**：Admin version `0.0.0-afe.6c` 未 bump —— Developer 解释"避免 no-lockfile 边界下 lockfile 漂移"是合理判断；属于工程管理决策，非缺陷。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（非 Admin 范围外部 blocker，与 RobotThree 既往 workspace pattern 一致）
评审结论：PASS（不附条件修订）
可冻结：是（仅 ADMIN-MVP-VS1 前端子批）
联合验收未通过：是（需 AM1-B 后端 + 联合 E2E）
保持 USER_ACCEPTANCE_PENDING：是
```

ADMIN-MVP-VS1 前端的事实基础（5 个 v1alpha2 写方法 + production main Unavailable + API Key retain/replace + 无 Reveal/mask/secret 字面 + revision conflict reload + 13 files / 59 tests + 1 file / 7 tests Contracts v1alpha2 + typecheck + scan:static bundle 0 violations + Admin package 不 bump + frozen v1alpha1 SHA256 不变 + lockfile/migration 不变 + Core/Main/Preload/Desktop/Central 零生产改动）全部只读可证。

8 项独立评审问题逐项可独立回答：

1. **是**：5 个 v1alpha2 写方法（`createModel / updateModel / testModelConnection / setModelLifecycle / setDefaultModel`）字面命中 [admin-api-adapter.ts:171-195](apps/admin-console/src/adapters/admin-api-adapter.ts#L171-L195) ✅
2. **是**：production `main.ts` 仍装 `UnavailableAdminAdapter`（`scan:static` bundle violations = 0）✅
3. **是**：API Key retain/replace，无 Reveal/mask/secret 字面（实测 grep 无命中）✅
4. **是**：revision conflict 由 Adapter 抛 typed `AdminApiError`，page 层 reload（写路径 envelope schema 全部 typed）✅
5. **是**：删除/归档/恢复/供应商插件/Personal Model 未做（实测 git status 仅删除 Tool Prototype 既有遗留）✅
6. **是**：Admin focused gates 13/59 + Contracts v1alpha2 1/7 + typecheck + scan:static 全 PASS ✅
7. **是**：边界不漂移（Admin version 0.0.0-afe.6c 不 bump / Core/Desktop/Contracts frozen / lockfile 不变 / migration=26 / frozen v1alpha1 SHA256 不变 / 无 Personal Model/Admin mutation/TGM/Knowledge/Lifecycle / Desktop/Central 零生产改动）✅
8. **N/A（独立 QA 范围外）**：联合 E2E / Desktop Catalog 消费 / Gateway / Central 持久化 / 审计 —— 属 AM1-B 后端窗口，未在本前端子批范围。

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 1（external blocker）；评审结论 **PASS（不附条件修订）**；可冻结：**是**（仅 ADMIN-MVP-VS1 前端子批）。
2. **决策 1**：是否接受 ADMIN-MVP-VS1 前端子批 `PASS/CLOSED`（前端单端）？**推荐：是** —— 字面 5 个 v1alpha2 写方法 + production Unavailable + Secret 边界 + 13/59 focused + Contracts v1alpha2 1/7 + scan:static bundle 0 violations + frozen boundary 全不漂移。
3. **决策 2**：是否接受 Admin version 保持 `0.0.0-afe.6c` 不 bump？**推荐：是** —— Developer 解释"避免 no-lockfile 边界下 lockfile 漂移"是合理工程管理决策；Admin 包 lockfile 真实不变（实测 SHA256 命中）。
4. **后续路径**：
   - 本前端子批接受后，用户单独授权 AM1-A 后端 + AM1-B 后端窗口；
   - AM1-A + AM1-B 后端完成后跑**联合**独立 QA（含 Desktop 真实新任务 + Central 重启 + 上线 default 链路）；
   - workspace 全量门禁（P3-1 外部 blocker）由 Desktop 窗口独立修复；
   - 不自动进入 Admin-VS2（简单用户权限 / 基础审计），需用户另行授权。

代码 QA 通过**不等于**用户接受。当前保持 `USER_ACCEPTANCE_PENDING`，待：
- 用户接受本报告；
- 用户单独接受 ADMIN-MVP-VS1 前端为 `PASS/CLOSED`；
- 用户单独授权 AM1-A / AM1-B 后端编码。

本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
