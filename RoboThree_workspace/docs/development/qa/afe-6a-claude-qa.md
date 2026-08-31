# AFE-6A — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-1302-version-0.0.0-afe.6a` |
| 验收对象 | AFE-6A：Admin Read-only Experience Closure（六模块只读体验收口 + Tool Prototype 清理） |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（`/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin/node`，与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21） |
| 开发版本 | Admin `0.0.0-afe.6a`；Root/Core `0.0.0-dfi.5.3.1`（DFI-5.3.1 仍 CODING PAUSED，root/core 已 pre-position）；Contracts `0.0.0-r2d.3.1`；Desktop 保持 |
| 上游 | AFE-1.1/AFE-2/AFE-3A 已 PASS/CLOSED；AAPI-0.4 已 PASS/CLOSED；AAPI-0 Foundation conformance PASS/CLOSED；DFI-5.3 PLAN REVIEW PASS/CLOSED + DFI-5.3.1 FOCUSED REVIEW PASS/USER_ACCEPTANCE_PENDING |
| 方案基线 | [AFE-6A Revision 1](docs/development/frontend/AFE-6A-ADMIN-READ-ONLY-EXPERIENCE-CLOSURE-PLAN.md) `DOCUMENT REVIEW PASS / CODING GATED` → 本次进入编码实现 |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm --filter @robothree/admin-console typecheck` | **PASS**（vue-tsc 0 error） |
| 2 | `pnpm --filter @robothree/admin-console typecheck:negative` | **PASS**（BadProps/BadTemplateAccess/bad-route-meta 三个 negative fixture 全部按 Type/missingField 失败，断言符合预期） |
| 3 | `pnpm --filter @robothree/admin-console build` | **PASS**（82 modules transformed，440ms） |
| 4 | `pnpm --filter @robothree/admin-console build:integration` | **PASS**（181 modules transformed，521ms） |
| 5 | `pnpm --filter @robothree/admin-console test` | **PASS** 11 files / 41 tests（1.25s） |
| 6 | `pnpm --filter @robothree/admin-console scan:static` | **PASS**（sourceViolations 0，positiveDetections 9 = leaky-values.ts fixture 命中，false positives 0，pageTextViolations 0） |
| 7 | `pnpm --filter @robothree/admin-console scan:deps` | **PASS**（Admin Vue 2.7.16 / Router 3.6.5 / plugin-vue2 2.3.4 隔离成立） |
| 8 | `pnpm --filter @robothree/admin-console smoke:dev` | **PASS**（Vite dev startup smoke passed） |
| 9 | `pnpm run harness:aapi0.4` | **PASS**；evidenceDigest `sha256:aa4348558bcd333ed1fa377be99da0f82a5bc940456db3762ebf340dbad02a71` **与 AAPI-0.4 实施报告逐字一致**；`outcome=AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT`；`exactAdapterMethodCount=12`；`mutationMethodCount=0`；`productionAdminApiAdapterReachable=false`；9 项 readiness 全 false；`integrationTopology=vite_build_node_loopback_proxy_central_ephemeral` |
| 10 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 287/287 files / 1986/1986 tests + 3 smoke**（EXIT=0；lint / Architecture boundary / build / 全 Vitest / core.ready / foundation-smoke / preload-smoke 全绿；160.66s） |
| 11 | `pnpm --filter @robothree/desktop build` | **PASS**（untracked 范围之外的命令，复跑以验证 Desktop 仍可 build） |
| 12 | `pnpm exec vitest run apps/desktop/tests` | **PASS** 58 files / 251 tests |

### 1.X 关于「pnpm run check 在 audit-dtp4 失败 2 个」的核查结果

用户自测声称 `pnpm run check` 停在外部 `scripts/audit-dtp4-packaging.test.mjs` 2 个失败、失败原因是「root/core 版本基线期望 `0.0.0-dfi.5.3.1`，不在 AFE-6A 范围内」，并称测试结果为「286 files PASS / 1 file failed」。

**独立核查发现此声明不成立**：

1. `scripts/audit-dtp4-packaging.test.mjs` 的 mtime 为 **Aug 27 12:57:10**（今日），内容已更新为期望 `0.0.0-dfi.5.3.1`；
2. 当前 root `package.json` 与 `services/core/package.json` 版本均为 **`0.0.0-dfi.5.3.1`**（与该测试期望一致）；
3. 实跑 `pnpm exec vitest run scripts/audit-dtp4-packaging.test.mjs`：**PASS 1 file / 2 tests**（EXIT=0）；
4. 实跑完整 `pnpm run check`：**287/287 files、1986/1986 tests、3 smoke**（EXIT=0）；
5. audit-dtp4 内部使用 `mkdtemp` 创建 fixture workspace、不读真实 workspace package.json，因此本次复跑确定可重现且与 AFE-6A 边界无关。

**结论**：`pnpm run check` 在本机复跑**全绿**，无 audit-dtp4 失败；用户自测结果与本机实际不符。已在 §三 P0/P1 段以 `INCONSISTENT_REPORTED_RESULT` 标记。

---

## 二、重点核查项

### 2.1 实现范围严格在 `apps/admin-console/**`

git status 实际变化（全部在 Admin 包内 + 已删除 8 个旧 Prototype 文件）：

| 类型 | 路径 |
|---|---|
| M | `apps/admin-console/package.json`（版本 `0.0.0-afe.6a`） |
| M | `apps/admin-console/src/adapters/{admin-adapter,fixture-admin-adapter,unavailable-admin-adapter}.ts` |
| M | `apps/admin-console/src/app/{route-meta,router,admin-runtime,integration-bootstrap}.ts` |
| M | `apps/admin-console/src/main.ts`、`src/styles/base.css`、`src/types/admin-ui.ts` |
| M | `apps/admin-console/src/presentation/page-state-presentation.ts`、`src/presentation/read-only-inventory.ts` |
| M | `apps/admin-console/src/pages/{models,robots,skills,tools,knowledge,system}/*Page.vue`（11 个页面，含 5 detail） |
| D | `apps/admin-console/src/components/tools/PrototypeGateNotice.vue` |
| D | `apps/admin-console/src/components/tools/TechnicalDetailsDisclosure.vue` |
| D | `apps/admin-console/src/fixtures/tool-pages.ts` |
| D | `apps/admin-console/src/pages/tools/{ToolApiCreatePage,ToolMcpCreatePage,ToolPolicyPage}.vue` |
| D | `apps/admin-console/src/presentation/tool-pages-presentation.ts` |
| D | `apps/admin-console/src/types/admin-tool-pages.ts` |
| M | `apps/admin-console/tests/{component,router,static,typecheck}/**` |
| ?? | `apps/admin-console/scripts/integration-loopback-server.{mjs,d.mts}`（AAPI-0.4 既有，未在本批新增） |
| ?? | `apps/admin-console/src/adapters/admin-api-{adapter,error}.ts`（AAPI-0.4 既有，未在本批新增） |

| 禁止范围 | 验证 |
|---|---|
| `packages/contracts/src/**` | ✅ **0 修改**（mtime Aug 24 22:24:07，git diff 无输出） |
| `services/core/**` | ✅ **0 AFE-6A 修改**（mtime Aug 25/Aug 26，git diff 全部为 R2D-3.3/R2D-4/AAPI-0.4 既往 uncommitted 改动） |
| `services/central-service/**` | ✅ **0 AFE-6A 修改**（同前） |
| `apps/desktop/**` | ✅ **0 修改** |
| `migration` | ✅ **仍止 26**（`services/core/src/adapters/sqlite/migrations.ts:1418` `id: 26, name: "dfi_5_reasoning_mode_experience_preference"`） |
| `pnpm-lock.yaml` | ✅ **digest 未变** `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` |
| root `package.json` / `pnpm-workspace.yaml` | ✅ **0 修改**（root/core 已 pre-position 为 `0.0.0-dfi.5.3.1`，但非本批动作） |
| `production SubmitTurn v1alpha3 / Desktop Max UI` | ✅ **仍 GATED** |

### 2.2 Tool Prototype 路由清理（O-01 决策落地）

`rg -n "/tools/new|/tools/:toolId/policy|tools\.new|ToolApiCreatePage|ToolMcpCreatePage|ToolPolicyPage|tool-pages" src tests` 在生产代码中**0 命中**；唯一 2 处命中位于 [tests/router/router.admin.ts:75-76](apps/admin-console/tests/router/router.admin.ts#L75) `forbiddenRoutes = ['/tools/new/api', '/tools/new/mcp', '/tools/:toolId/policy']` + `forbiddenNames = ['admin.tools.newApi', 'admin.tools.newMcp', 'admin.tools.policy']`，**明确为负向断言**。

[router.ts:45-264](apps/admin-console/src/app/router.ts#L45) 实存路径：`/login`、`/models`、`/models/:modelId`、`/tools`、`/tools/:toolId`、`/robots`、`/robots/:robotId`、`/skills`、`/skills/:skillId`、`/knowledge`、`/knowledge/:knowledgeId`、`/system`、`/system/users`、`/system/audit`、`/system/feedback`、`/permission-denied`、`*`。**0 个 Tool Prototype 路径**。

`ImplementationGate = 'prototype'` 字样仅出现在 [router.ts:245](apps/admin-console/src/app/router.ts#L245) `/system/feedback` 与 [route-meta.ts:4](apps/admin-console/src/app/route-meta.ts#L4) `'planned' | 'prototype' | 'shellImplemented'` 类型定义中，属元数据 gating 而非实际 Prototype 路由。

### 2.3 12 个精确只读 Adapter 方法（Contract 零变化）

[admin-adapter.ts:31-44](apps/admin-console/src/adapters/admin-adapter.ts#L31) 严格 12 方法：`getCurrentCapabilities` + 6 list + 5 detail；无 mutation；无 `getCapability`（遗留类型层）；与 AAPI-0.4 §2.2 实施报告逐字一致。harness:aapi0.4 evidence `exactAdapterMethodCount=12`/`mutationMethodCount=0`/`productionAdminApiAdapterReachable=false` 全部对齐。

### 2.4 production/Integration Adapter 隔离

- [main.ts:6,13](apps/admin-console/src/main.ts#L6) production 入口 `installAdminAdapter(createUnavailableAdminAdapter())`；
- [integration-main.ts:6,14](apps/admin-console/src/integration-main.ts#L6) integration 入口 `createAdminApiAdapter()`；
- [admin-runtime.ts:2,4](apps/admin-console/src/app/admin-runtime.ts#L2) 默认 adapter fallback 到 `createUnavailableAdminAdapter()`；
- `dist/` production 构建 0 命中 `AdminApiAdapter`（harness:aapi0.4 evidence `productionAdminApiAdapterReachable=false`）。

### 2.5 页面状态矩阵完整（AFE-6A §8 全部 11 项）

[page-state-presentation.ts](apps/admin-console/src/presentation/page-state-presentation.ts) 显式覆盖：`loading` / `empty` / `ready` / `unavailable` / `permissionDenied` / `notFound` / `stale` / `error` / `disabled` / `partial` / `gated` 11 项，每项含 title / message / tone / busy / role 五要素；使用 `assertNever` 做穷尽类型检查；AFE-6A §8 列表与详情共用统一映射。

[read-only-inventory.ts:186-195](apps/admin-console/src/presentation/read-only-inventory.ts#L186) 将 `permission_denied`/`not_found`/`stale_cursor`/`business_rule_unavailable`/`service_unavailable` 映射到对应 status，`keepRows: context === 'pagination'` 保证翻页失败保留已加载数据。

[tests/typecheck/presentation.admin.ts](apps/admin-console/tests/typecheck/presentation.admin.ts) 覆盖全部 capability states 与 page states，含 sensitive fields `presentSecretStatus` 测试。

### 2.6 分页安全（AFE-6A §9 全部 6 项）

[ReadOnlyInventoryPage.vue:52-115](apps/admin-console/src/components/inventory/ReadOnlyInventoryPage.vue#L52) 实测：

1. `nextCursor` 仅在 `ref<string>()` 内存中保存；`router` 路径查询参数不含 cursor（grep 验证 0 命中 `?cursor=`、`query.cursor=`）；
2. `loadMore` 函数 `[line 109-111]` 在 `nextCursor.value` undefined 或 `paginationLoading` 时**短路退出**（重复点击保护）；
3. `loadPage` `[line 80-105]` 翻页失败保留旧数据（仅在 `cursor === undefined` 时替换 `rows.value`，pagination 时 `rows.value = [...rows.value, ...mapped]`）；
4. 410 stale_cursor 在 `[line 96-99]` 触发 `nextCursor.value = undefined`（避免重发旧 cursor）+ `presentInventoryError` 映射为 `stale` 状态；
5. `paginationLoading` 状态正确切换 `[line 108, 111]`；
6. `partial` 状态 `[read-only-inventory.ts:189-191]` 不猜测缺失字段。

### 2.7 敏感字段禁入（AFE-6A §11 安全边界）

✅ `pages/` 与 `components/` 中**0 命中** `fetch(` / `XMLHttpRequest` ——页面不直接调用网络。

✅ `presentation/read-only-inventory.ts` 中 `Credential` / `API Key` / `Endpoint` / `Bearer` 0 命中裸值；仅出现 `presentCredentialStatus(value: AdminControlCredentialStatus | 'configured' | 'missing' | 'unavailable')` 返回 **'已配置' / '未配置' / '暂不可用'** 三态文案。

✅ Admin src 整目录**0 命中** `JSON.stringify(error` / `.stack` / `JSON.stringify(err` ——普通错误页面不展示原始异常、stack 或 raw response。

✅ Audit 列表页 `[SystemAuditPage.vue]` 不展示请求正文/响应正文/错误栈/Credential/Token/IP 原文/内部路径（grep 验证 0 命中 raw payload）。

### 2.8 测试身份 / 非生产环境提示保留（AFE-6A G-05）

[read-only-inventory.ts:73](apps/admin-console/src/presentation/read-only-inventory.ts#L73) `export const nonProductionNotice = '测试身份 / 非生产环境：当前页面只展示服务端允许的只读投影，不代表生产管理能力已就绪。'`

[ReadOnlyInventoryPage.vue:8](apps/admin-console/src/components/inventory/ReadOnlyInventoryPage.vue#L8) 与 [ReadOnlyInventoryDetail.vue:8](apps/admin-console/src/components/inventory/ReadOnlyInventoryDetail.vue#L8) 均显式 `<InlineNotice>{{ nonProductionNotice }}</InlineNotice>`。

[admin-adapter.ts:16-21](apps/admin-console/src/adapters/admin-adapter.ts#L16) `AdminCapabilitySet` 类型强制 `testIdentityUsed: true; productionIdentityReady: false` ——production 标识硬约束。

[admin-api-adapter.ts:88-119](apps/admin-console/src/adapters/admin-api-adapter.ts#L88) integration 入口三处 fail-closed：
- envelope.metadata 缺 `testIdentityUsed=true` → 拒绝；
- envelope.metadata `productionIdentityReady=true` → 拒绝（不接受 production 路径）；
- capabilitySet 强制重写 `testIdentityUsed: true, productionIdentityReady: false`。

### 2.9 11 个测试文件覆盖（与 AFE-6A §15 测试计划一致）

| 文件 | 覆盖 |
|---|---|
| `tests/accessibility/accessibility.admin.ts` | ARIA、focus、表格 caption、button name、aria-busy、keyboard |
| `tests/adapter/admin-api-adapter.admin.ts` | AdminApiAdapter 12 方法 strict Contract parsing |
| `tests/adapter/integration-bootstrap.admin.ts` | integration entry capability/productionIdentityReady 校验 |
| `tests/component/common-components.admin.ts` | 通用 Table/Field/State 组件 |
| `tests/component/inventory-read-only.admin.ts` | **六模块只读组件测试（AFE-6A 新增）** |
| `tests/component/shell.admin.ts` | 页面壳层 + 非生产提示 |
| `tests/component/tool-pages.admin.ts` | **Tool 只读错误状态测试（AFE-6A 新增）** |
| `tests/router/router.admin.ts` | **删除或隔离过时 Tool Prototype 路由；六模块 read-only 路由仍可达（AFE-6A 新增 forbiddenRoutes 负向断言）** |
| `tests/security/integration-loopback.admin.ts` | Browser Security headers + same-origin Fetch Metadata |
| `tests/static/static-scan.admin.ts` | source/page text positive injection + allowlist 反误报 |
| `tests/typecheck/presentation.admin.ts` | **presentation 敏感字段禁入测试（AFE-6A 新增）** |

实跑 41 tests PASS，无 `.skip/.only` 逃逸。

---

## 三、发现

### 3.1 P0 = 0

无。实施严格落在 `apps/admin-console/**`；未触碰 Adapter Contract（12 方法结构不变）、后端、Desktop 源码、Core、Central、Main、Preload、IPC、migration（仍止 26）、root package 或 lockfile（digest `5b15ae01…874f31` 不变）。

### 3.2 P1 = 0

无。harness:aapi0.4 evidenceDigest `sha256:aa434855…2a71` 与 AAPI-0.4 实施报告逐字一致；9 项 readiness 仍 false；AAPI-0.4 conformance 不回归。

### 3.3 P2 = 0

无。AAPI-0.4 readiness 9 项仍 false；AFE-6A §18 后续批次边界（mutation / Tool activation / TGM / Knowledge Provider / production identity / AAPI-0.5 / Desktop Renderer consumption / AFE-6B）继续保持 GATED/false，未在本批打开。

### 3.4 P3 = 1

**P3-1 — 用户自测结果与本机实际复跑不符（`INCONSISTENT_REPORTED_RESULT`）**

用户声称 `pnpm run check` 停在外部 `scripts/audit-dtp4-packaging.test.mjs` 2 个失败、失败原因是「root/core 版本基线期望 `0.0.0-dfi.5.3.1`，不在 AFE-6A 范围内」、测试为「286 files PASS / 1 file failed」。

**独立核查结论**：本机复跑与上述描述**不符**：

| 用户描述 | 实跑验证 |
|---|---|
| `pnpm run check` 停在 audit-dtp4 2 个失败 | 实跑 `pnpm run check` **EXIT=0**；`pnpm exec vitest run scripts/audit-dtp4-packaging.test.mjs` **PASS 1 file / 2 tests** |
| 失败原因：root/core 版本基线期望 `0.0.0-dfi.5.3.1` | 当前 root/core 版本**已经**是 `0.0.0-dfi.5.3.1`；audit-dtp4-packaging.test.mjs 也**已经**更新为期望该版本（mtime Aug 27 12:57:10）——预期/实际**一致**，故测试通过 |
| 286 files PASS / 1 file failed | 实跑 **287 files PASS / 0 file failed / 1986 tests PASS / 3 smoke** |

**对结论的影响**：本批 QA 结论基于**本机实际复跑**出具，因此 P0/P1/P2 维持 0；用户描述的不一致项不影响发布结论（实际就是 PASS），仅作为数据一致性观察项标记。

**风险（极低）**：用户与 Claude 之间存在执行环境差异（如端口冲突、Node 22 fallback 残留、网络抖动、vite 缓存），或自测时报错引用了过期记录。建议用户复核自测 shell 命令与时间戳，确认是否在 lockfile digest 升级前的快照上跑。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1
```

AFE-6A 完成 Admin Read-only Experience Closure：六模块（Model / Robot / Skill / Tool / Knowledge / Audit）只读列表 + 五模块（不含 Audit）详情统一收口到安全只读体验；11 个状态（loading / empty / ready / unavailable / permissionDenied / notFound / stale / error / disabled / partial / gated）安全映射；分页 cursor 仅内存保留，410 stale cursor 不泄漏；测试身份 / 非生产环境提示在 list + detail 双层 `<InlineNotice>` 显示；Tool Prototype 创建 / 策略入口（`/tools/new/api`、`/tools/new/mcp`、`/tools/:toolId/policy`）及相关 fixture/presentation/type/component 已删除（8 个文件）；11 个 test files / 41 tests PASS；presentation 敏感字段禁入测试 + Tool 只读错误状态测试新增覆盖；production 入口 `UnavailableAdminAdapter` 不变，`main.ts` 不 import `AdminApiAdapter`；harness:aapi0.4 evidenceDigest `sha256:aa434855…2a71` 与 AAPI-0.4 实施报告逐字一致，9 项 readiness 仍 false，AFE-6A §18 后续批次边界（mutation / TGM / Knowledge Provider / production identity / AAPI-0.5 / Desktop v2 consumption / AFE-6B）继续 GATED/false。

门禁独立复跑：Admin typecheck / typecheck:negative / build（82 modules）/ build:integration（181 modules）/ test（11 files / 41 tests）/ scan:static / scan:deps / smoke:dev 全 PASS；harness:aapi0.4 PASS 且 evidenceDigest 不漂移；完整 `pnpm run check` **287/287 files、1986/1986 tests、3 smoke、EXIT=0**（lint / Architecture boundary / 全 Vitest / core.ready / foundation-smoke / preload-smoke 全绿，160.66s）；migration 仍止 26；lockfile digest `sha256:5b15ae01…874f31` 不变；Contracts 0 修改。

**唯一观察项 P3-1**：用户自测描述的 audit-dtp4 2 失败与本机实际复跑结果不一致（用户报：286 PASS / 1 failed；实跑：287 PASS / 0 failed / EXIT=0），不影响本批发布结论，仅作为数据一致性观察项记录；建议用户复核自测 shell 与时间戳，确认是否在 lockfile digest 升级前的快照上跑。

**AFE-6A 可进入用户接受流程**；接受后 Admin Read-only Experience Closure 关闭，但 mutation / Tool activation / TGM / Knowledge Provider / production identity / AAPI-0.5 / Desktop v2 consumption / AFE-6B 继续 GATED/false，不自动解锁；DFI-5.3.1 仍为 `FOCUSED DIFFERENCE REVIEW PASS / USER_ACCEPTANCE_PENDING / CODING PAUSED`，与 AFE-6A 关闭互不影响。

— Claude Code（独立 QA，只读）