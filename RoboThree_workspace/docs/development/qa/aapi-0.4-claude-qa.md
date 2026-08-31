# AAPI-0.4 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-1116-version-0.0.0-aapi.0.4` |
| 验收对象 | AAPI-0.4：Browser Security / Admin Adapter / Development-Test Integration（含代理拓扑 P2 修订落地） |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（`/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin/node`，与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21）/ Docker 29.6.2 |
| 开发版本 | Root / Admin Console `0.0.0-aapi.0.4`；Contracts 保持 `0.0.0-r2d.3.1`；Core/Desktop/Central/Document Worker 版本不变 |
| 上游 | R2D-0~R2D-4 + AAPI-0/AAPI-0.1~AAPI-0.3 全部 PASS/CLOSED；本批由用户单独授权 |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21 + Docker）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `export PATH=…/v24.13.0/bin:…/openjdk@21/bin:$PATH JAVA_HOME=… CI=true pnpm run harness:aapi0.4` | **PASS 10 files / 37 tests**；`outcome=AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT`、`exactAdapterMethodCount=12`、`mutationMethodCount=0`、`productionAdminApiAdapterReachable=false`、`productionIdentityReady=false`、`productionAdminReadHttpReady=false`、`browserSecurityProductionReady=false`、`adminMutationReady=false`、`tgmReady=false`、`knowledgeProviderReady=false`、`agentLifecycleReady=false`、`integrationTopology=vite_build_node_loopback_proxy_central_ephemeral`、`evidenceDigest=sha256:aa4348558bcd333ed1fa377be99da0f82a5bc940456db3762ebf340dbad02a71` 与实施报告逐字一致 |
| 2 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 284 / 284 files / 1961 / 1961 tests + 3 smoke**（`core.ready` / `foundation-smoke ready fixtureOnly=true` / `preload-smoke ready sandbox=true contractVersion=v1alpha1`）；145.99s |
| 3 | `... CI=true pnpm run check:central` | **PASS 424 / 0 / 0 / 0 / BUILD SUCCESS**（与 AAPI-0.3 同基线，无 Central regression） |
| 4 | `... CI=true pnpm run check:central:offline` | **PASS 424 / 0 / 0 / 0 / BUILD SUCCESS** |
| 5 | `CI=true pnpm run lint` | **PASS**（eslint + Architecture boundary checks passed） |
| 6 | `CI=true pnpm run audit:dtp4` | **PASS**（DTP-4 packaging audit passed） |
| 7 | `shasum -a 256 pnpm-lock.yaml` | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` **已变更**（与实施报告 §6 "after"逐字一致；预期变化 — Admin 新增 `@robothree/contracts: workspace:*` importer，pnpm 标准重算，无新 registry package） |
| 8 | 边界 | migration 最大 id=26；Root/Admin `0.0.0-aapi.0.4`、Contracts `0.0.0-r2d.3.1` |

> 注：本轮 Central online/offline 均一次通过（无 tracing exporter timeout / 端口冲突环境偶发）。

---

## 二、重点核查项

### 2.1 代理拓扑 P2 修订（用户提出的精度项）

✅ 实施报告 §1 / 证据 `integrationTopology=vite_build_node_loopback_proxy_central_ephemeral` 与聚焦差异复核 P2 一致：

```
Vite integration build
  → Node loopback static/proxy child (127.0.0.1:41731)
  → Central ephemeral port
```

而非"Vite development proxy"。[integration-loopback-server.mjs:6-7](apps/admin-console/scripts/integration-loopback-server.mjs#L6) `ADMIN_INTEGRATION_HOST='127.0.0.1'` + `ADMIN_INTEGRATION_PORT=41731`；[integration-loopback-server.mjs:39-42](apps/admin-console/scripts/integration-loopback-server.mjs#L39) `central` origin 验证 loopback HTTP；static dist 由 Vite build 产物提供；Browser 仅见 `http://127.0.0.1:41731`。**Vite HMR / dev style injection 不作为 CSP 证据**。

### 2.2 12 个精确只读 Adapter 方法

✅ [admin-adapter.ts:31-44](apps/admin-console/src/adapters/admin-adapter.ts#L31) `AdminAdapter` 12 方法：`getCurrentCapabilities` + 6 个 list（Models/Robots/Skills/Tools/Knowledge/AuditEvents）+ 5 个 detail（Model/Robot/Skill/Tool/Knowledge），无 `getCapability`、无 mutation、无 generic `request(method, path, body)`。evidence `exactAdapterMethodCount=12`、`mutationMethodCount=0`。

### 2.3 production build 强制 UnavailableAdminAdapter + integration 隔离

✅ production `main.ts` **不** import `AdminApiAdapter`（grep 0 命中）；仅 `integration-main.ts:4` import。production `dist/` 同样 0 命中 `AdminApiAdapter`（grep 0 命中）。`UnavailaleAdminAdapter` 仍由 production `main.ts` 工厂创建。`AdminAdapter` 接口移除 `getCapability`（用户提到"修正遗留 getCapability()"——已落地，类型层不再有该方法）。

### 2.4 strict Contract schema 解析 + workspace `@robothree/contracts/admin-control/v1alpha1`

✅ [admin-api-adapter.ts:1-15](apps/admin-console/src/adapters/admin-api-adapter.ts#L1) 14 个 schema import：`AdminAuditEventPageSchema` / `AdminControlCapabilityProjectionSchema` / `AdminControlEnvelopeMetadataSchema` / `AdminControlSafeErrorSchema` / 6 个 Module Page + 5 个 Module Detail。success/error/304 全部 strict parse；unknown field fail-closed（`AdminModelDetailSchema.parse(cached.data)`）。

### 2.5 Browser Security headers + 严格 Origin/Fetch Metadata + no-store + 无 CORS

✅ [integration-loopback-server.mjs:8-16](apps/admin-console/scripts/integration-loopback-server.mjs#L8) `ADMIN_SECURITY_HEADERS` 含 CSP/`frame-ancestors 'none'`/`nosniff`/`no-referrer`/`Permissions-Policy`/`no-store`；[line 19-24](apps/admin-console/scripts/integration-loopback-server.mjs#L19) `allowedRequestHeaders` 仅 5 个（accept / if-none-match / 三个 `X-RoboThree-*`），**自动剥离 Authorization/Cookie/Cookie/Origin** 等敏感头转发给 Central；[line 43-48](apps/admin-console/scripts/integration-loopback-server.mjs#L43) `validBrowserMetadata` 强制 `origin === undefined || origin === ADMIN_INTEGRATION_ORIGIN` + `Sec-Fetch-Site === undefined || === 'same-origin'`；[line 38](apps/admin-console/scripts/integration-loopback-server.mjs#L38) 非 GET/HEAD 返 405；CORS header 不发送。

### 2.6 Browser 零 Bearer/身份自报 + 严格 transport

✅ [admin-api-adapter.ts:50-65](apps/admin-console/src/adapters/admin-api-adapter.ts#L50) request 头仅 `Accept` + `X-RoboThree-Contract-Version` + `X-RoboThree-Query-Id` + `X-RoboThree-Correlation-Id` +（可选）`If-None-Match`；**无 Authorization / Cookie / identity / capability / userId**。`credentials: 'same-origin'` + `redirect: 'error'` + `cache: 'no-store'` + `AbortController` 30s deadline。

### 2.7 Tool/Knowledge 真实 gated/unavailable + Prototype 移除

✅ `prototypeToolRows` 在 [ToolsPage.vue](apps/admin-console/src/pages/tools/ToolsPage.vue) + [ToolDetailPage.vue](apps/admin-console/src/pages/tools/ToolDetailPage.vue) + [component-tool-pages.admin.ts](apps/admin-console/tests/component/tool-pages.admin.ts) 全部 grep 0 命中（实施前 3 处 import）——**Production read page Fixture import count = 0 实质成立**。

### 2.8 六模块页面真实消费 Projection（缺事实 partial/unavailable/gated）

✅ 全部 6 个 list + 5 个 detail Vue 页面在 git status M 列表（含 [ModelsPage](apps/admin-console/src/pages/models/ModelsPage.vue) / [RobotsPage](apps/admin-console/src/pages/robots/RobotsPage.vue) / [SkillsPage](apps/admin-console/src/pages/skills/SkillsPage.vue) / [ToolsPage](apps/admin-console/src/pages/tools/ToolsPage.vue) / [KnowledgePage](apps/admin-console/src/pages/knowledge/KnowledgePage.vue) / [SystemAuditPage](apps/admin-console/src/pages/system/SystemAuditPage.vue) + 5 个 Detail）。六模块走同一 strict schema 路径；Tool/Knowledge 缺 authority → `unavailable` / `gated`，不补默认值。

### 2.9 capability → menu/route 单一显式映射

✅ [admin-api-adapter.ts](apps/admin-console/src/adapters/admin-api-adapter.ts) 严格 12 方法无额外 `request`；capability bootstrap → `permissionProjectionFromCapabilities` 仅映射六类 read capability（实施报告 §2 声明）；write/feedback/export 即使出现在 test set 也保持 GATED。

### 2.10 真实 Central + Vite integration build + loopback proxy E2E

✅ `AdminBrowserIntegrationE2E.java` 存在（grep `services/central-service/src/test/java/com/robothree/central/admincontrol/adapter/http/AdminBrowserIntegrationE2E.java`）；harness 包含 Spring Boot Central ephemeral port 启动 + loopback proxy child + Admin build 静态页面 through 同源代理读 capability API；evidence 含 `testIdentityUsed=true` + 8 项 readiness false。

### 2.11 lockfile 标准重算 + unique 变化约束

✅ before `c47641ac…f815a07` → after `5b15ae01…4f31`，**仅** Admin 新增 `@robothree/contracts: workspace:*` importer 导致；本机复跑 `grep` 与 CI 复跑 digest 完全一致；migration 26 未变。

### 2.12 文件边界

| 允许 | 实际 |
|---|---|
| `apps/admin-console/src/adapters/**` | ✅ admin-adapter.ts / fixture-admin-adapter.ts / unavailable-admin-adapter.ts（修正遗留 getCapability）+ admin-api-adapter.ts / admin-api-error.ts 新增 |
| `apps/admin-console/src/app/**` / `pages/**` / `styles/**` | ✅ route-meta.ts / main.ts（保持 Unavailable）+ 12 个 page 文件 |
| `apps/admin-console/scripts/**` / `integration.html` | ✅ integration-loopback-server.mjs/.d.mts + run-aapi04-harness.mjs |
| `apps/admin-console/tests/**` / `vite.config.mjs` / `package.json` | ✅ adapter/ + security/ + component/ + static/ + vite.config + package.json |

| 禁止 | 核对 |
|---|---|
| `packages/contracts/src/**` | ✅ 无 contracts 修改 |
| Desktop、Core、Main、Preload、IPC、Document Worker、EIPC production | ✅ 无变更（git status 仅 admin-console 包内 + run-aapi04-harness.mjs） |
| Central Configuration/Model Gateway/Audit 既有写路径 / 新增 Repository query | ✅ services/central-service/src/main 无写入路径变更；仅 1 个新 test 文件（E2E） |
| migration | ✅ 仍止 26 |
| 外部 npm/Maven dependency | ✅ lockfile only workspace 重写，无新 registry package |
| production SSO/session/TGM/Knowledge/Agent Lifecycle/DFI-5.3 | ✅ 全部 readiness false |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

无发现。本批代理拓扑 P2（用户提出的文档精度项）已通过实施落地修正；本机复跑 Central online/offline 均一次通过；harness:aapi0.4 evidenceDigest 与实施报告逐字一致；lockfile digest 变化符合预期且唯一原因明确。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

AAPI-0.4 完成 development/test read integration 闭环：12 个精确只读 Admin Adapter 方法（含 `getCurrentCapabilities` + 6 list + 5 detail），mutation=0、`productionAdminApiAdapterReachable=false`；`AdminAdapter` 接口移除遗留 `getCapability`，类型层精确 12 方法；production `main.ts` 不 import `AdminApiAdapter`（仅 `integration-main.ts` import），production `dist/` 同样 0 命中；strict schema 全部从 `@robothree/contracts/admin-control/v1alpha1` workspace 包导入，success/error/304 strict parse，unknown field fail-closed；Node loopback server 绑 `127.0.0.1:41731`，仅代理 `/admin/v1alpha1/**`，`allowedRequestHeaders` 仅 5 个（自动剥离 Authorization/Cookie），`validBrowserMetadata` 强制 exact Origin + same-origin Fetch Metadata，非 GET/HEAD 返 405，静态 + API + error 响应统一设置 CSP/`frame-ancestors 'none'`/`nosniff`/`no-referrer`/`Permissions-Policy`/`no-store`，不发送 CORS header；Browser request 仅 `Accept` + `X-RoboThree-Contract-Version` + `X-RoboThree-Query-Id` + `X-RoboThree-Correlation-Id` +（可选）`If-None-Match`，零 Bearer/Cookie/identity/capability/userId，`credentials: 'same-origin'` + `redirect: 'error'` + `cache: 'no-store'` + 30s `AbortController`；Tool/Knowledge authority 缺失时 `gated/unavailable`（不补默认），`prototypeToolRows` 从 3 处 import 全部移除；真实 Central ephemeral port + Vite integration build + loopback proxy child 完整 topology 通过 `AdminBrowserIntegrationE2E` 验证；lockfile `c47641ac…f815a07` → `5b15ae01…4f31`（仅 Admin 新增 `@robothree/contracts: workspace:*` importer，pnpm 标准重算，无新 registry package），migration 26 未变，Contracts 0 改动。

门禁独立复跑：harness:aapi0.4 10/37 + evidenceDigest `sha256:aa434855…2a71` 与实施报告逐字一致 + 9 项 readiness 全 false（含 `productionAdminApiAdapterReachable=false` / `browserSecurityProductionReady=false` / `adminMutationReady=false` 等）；完整 check 284/284 files、1961/1961 tests、3 smoke；Central online/offline 均 424/0/0/0/BUILD SUCCESS；lint / Architecture boundary / audit:dtp4 全 PASS；lockfile digest 已变（与实施报告 §6 after 逐字一致）；migration 止 26；Root/Admin `0.0.0-aapi.0.4`、Contracts `0.0.0-r2d.3.1`。

**AAPI-0.4 可进入用户接受流程；接受后 AAPI-0 Foundation conformance 关闭（AAPI-0.1~0.4 全部 PASS/CLOSED），但 production identity/SSO、production Admin Read HTTP、production Browser Security、production Admin Adapter、mutation、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption 仍全部 GATED/false，不自动解锁；DFI-5.3、TGM、Knowledge Provider、Agent Lifecycle、Desktop/Admin v2 consumption 继续单独审批。**

— Claude Code（独立 QA，只读）