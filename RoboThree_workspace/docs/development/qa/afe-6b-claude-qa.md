# AFE-6B — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-1356-version-0.0.0-afe.6b` |
| 验收对象 | AFE-6B：Admin Console 浏览器启动 / 视觉结构 / 响应式 / 键盘与可访问性证据收口 |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21，harness:aapi0.4 需要） |
| 开发版本 | Admin `0.0.0-afe.6b`；Root `0.0.0-dfi.5.3.1`（不变）；Desktop/Core/Contracts 保持 |
| 上游 | AFE-6A PASS/CLOSED；AAPI-0.4 PASS/CLOSED；AFE-6B 方案 Revision 1 技术负责人 PASS_WITH_REVISIONS（P2-1/P2-2/P3-1） |
| 验收基线 | [AFE-6B 方案 Revision 1](docs/development/frontend/AFE-6B-ADMIN-BROWSER-VISUAL-ACCESSIBILITY-EVIDENCE-CLOSURE-PLAN.md) G-01~G-08 + §13 测试计划 + §14 收口窗口 |

> 注：仓库仅一个 initial commit（399b78a），工作区 dirty tree 为多个批次（AFE-6A / AAPI-0.4 / R2D* / DFI-5.3.1 / AFE-6B）累计未提交状态。AFE-6B 边界按「实施报告 §5 authored 文件清单 + 零漂移指标」独立判定，见 §二。

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

### 1.1 Admin package 门禁

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm --filter @robothree/admin-console typecheck` | **PASS**（vue-tsc --noEmit 0 error） |
| 2 | `pnpm --filter @robothree/admin-console typecheck:negative` | **PASS**，负向 fixture `BadProps.vue`、`BadTemplateAccess.vue`、`bad-route-meta.ts` 按 Type / missingField 失败，与实施报告一致 |
| 3 | `pnpm --filter @robothree/admin-console build` | **PASS**，82 modules（与报告逐字一致） |
| 4 | `pnpm --filter @robothree/admin-console build:integration` | **PASS**，181 modules（与报告逐字一致） |
| 5 | `pnpm --filter @robothree/admin-console test` | **PASS** 12 files / 46 tests（与报告逐字一致） |
| 6 | `pnpm --filter @robothree/admin-console scan:static` | **PASS**，sourceViolations 0 / bundleViolations 0 / productionBundleViolations 0 / positiveDetections 1 file 9 detections（leaky-values.ts）/ negativeFalsePositives 0 / pageTextViolations 0（与报告逐字一致） |
| 7 | `pnpm --filter @robothree/admin-console scan:deps` | **PASS**，Vue 2.7.16 / Router 3.6.5 / VTU 1.3.6 / plugin-vue2 2.3.4 隔离成立 |
| 8 | `pnpm --filter @robothree/admin-console smoke:dev` | **PASS**（Vite dev startup smoke passed；不声明页面真实渲染，口径正确） |

### 1.2 Workspace 回归门禁

| # | 门禁 | 结果 |
|---|---|---|
| 9 | `pnpm run harness:aapi0.4` | **PASS**，`outcome=AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT`；evidenceDigest `sha256:aa4348558bcd333ed1fa377be99da0f82a5bc940456db3762ebf340dbad02a71` 与报告/evidence.json 逐字一致；exactAdapterMethodCount=12、mutationMethodCount=0、productionAdminApiAdapterReachable=false |
| 10 | `pnpm --filter @robothree/desktop build` | **PASS** |
| 11 | `pnpm exec vitest run apps/desktop/tests` | **PASS** 58 files / 251 tests（与报告逐字一致） |
| 12 | `pnpm run check` | **PASS** 287 files / 1986 tests + 3 smoke（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true contractVersion=v1alpha1）+ Architecture boundary；146.81s |

### 1.3 零漂移与边界核验（独立判定）

| 指标 | 结果 |
|---|---|
| lockfile digest | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` 实测一致（shasum -a 256） |
| migration max | **26**（migrations.ts 24/25/26；migration 25 = `dfi_4a31_local_personal_invocation_timeout_facts`） |
| `packages/contracts/src` | 0 修改 |
| Admin version | `0.0.0-afe.6b`（与报告一致） |
| Admin dependencies | 未新增（vue 2.7.16 / vue-router 3.6.5 / happy-dom / VTU 1.3.6 / plugin-vue2 2.3.4，与报告一致） |
| authored 文件归属 | AFE-6B 12 个源/测试文件 mtime 全部集中于 13:37~13:41；`vite.config.mjs`（10:25，AAPI-0.4 integration mode）与 root `package.json`（12:51，DFI-5.3.1）经内容+mtime 判定属其他批次，非 AFE-6B 越界 |
| production bundle 隔离 | `grep -cE 'AdminApiAdapter|createAdminApiAdapter|/admin/v1alpha1' dist/assets/*.js` = 0 命中；harness `readBundle(dist)` 运行期校验同样通过 |

---

## 二、重点核查项

### 2.1 导航 aria-current 与可读名称（方案 G-05 / G-06）

- [NavLink.vue:22-24](apps/admin-console/src/components/layout/NavLink.vue#L22) `ariaCurrentAttrs` 仅在 `$route.path === this.to` 时输出 `{ 'aria-current': 'page' }`，否则空对象——精确当前态，无恒真污染；
- [ReadOnlyInventoryPage.vue:21](apps/admin-console/src/components/inventory/ReadOnlyInventoryPage.vue#L21) 详情入口 `:aria-label="\`查看${row.title}详情\`"`；[:34-35](apps/admin-console/src/components/inventory/ReadOnlyInventoryPage.vue#L34) 分页按钮 `:label="paginationLoading ? '正在加载下一页' : '加载下一页'"`；
- [ReadOnlyInventoryDetail.vue:7](apps/admin-console/src/components/inventory/ReadOnlyInventoryDetail.vue#L7) 返回入口 `返回{{ copy.title }}`（href=`#/models` 等，hash-mode 下为有效深链）；
- [AdminButton.vue:46](apps/admin-console/src/components/ui/AdminButton.vue#L46) `ariaLabelAttrs` 仅当 `label !== undefined` 时设 `aria-label`，不依赖 Vue 2 attr 透传推断，实现与方案一致。

### 2.2 CSS Contract（方案 G-04 / §7 实现规则）

[base.css](apps/admin-console/src/styles/base.css) 实测：

- 规则 1：`html,body{min-width:0}`（L5-7）+ `.admin-shell{min-width:0}`（L45-50）——无超 viewport 固定最小宽度；`visual-css-contract` 同时断言不回落 `var(--r3-admin-bp-admin-min)`（token 实测存在 = 1024px，tokens.css:72，断言非恒真）；
- 规则 2：`.admin-table{max-width:100%;overflow-x:auto}`（L334-341）+ `@media(max-width:1040px)` 内 `table{min-width:720px}`（L620-622）——横向溢出收敛在表格容器；
- 规则 3：th/td `.inventory-detail` 等 `overflow-wrap:anywhere`（L361/L173/L82 等）——长文本换行；
- 规则 6：`@media(prefers-reduced-motion:reduce){.skip-link{transition:none}}`（L629-633）——reduced motion 不依赖动画传达状态。

### 2.3 浏览器启动 / hash-mode 证据（方案 G-02 / P3-1 术语修订）

- [integration-loopback-server.mjs:77-89](apps/admin-console/scripts/integration-loopback-server.mjs#L77) `serveStatic` 仅 `/` 提供 `integration.html`，未知路径 404，**无 history-mode SPA fallback**——P3-1 术语修订（hash-mode 深链无需服务端 fallback）落地正确；
- [integration-loopback.admin.ts:38](apps/admin-console/tests/security/integration-loopback.admin.ts#L38) 断言 `/models` 深链 404（实证 hash-mode 非 fallback）；
- 安全头 `ADMIN_SECURITY_HEADERS`（CSP/X-Content-Type-Options/Referrer-Policy/Permissions-Policy/Cache-Control no-store）逐头断言；同源校验（Origin/Sec-Fetch-Site）与跨源 403、POST 405、proxy 不转发 Authorization/Cookie（upstream 内断言 `toBeUndefined`）均真实覆盖。

### 2.4 Static scan 扩展（方案 G-07）

[static-scan.mjs](apps/admin-console/scripts/static-scan.mjs) 实测：

- `bundleRoots=['dist','dist-integration']`（L7），`productionBundleFiles` 用 `` `${sep}dist${sep}` `` 精确过滤（`dist-integration` 不误命中，L136）；
- `forbiddenProductionBundlePatterns` = AdminApiAdapter / createAdminApiAdapter / `/admin/v1alpha1`（L49-53）；
- production dist bundle 直接 grep = 0 命中（独立复核）；与 harness `readBundle(dist)` 运行期校验（含 `X-RoboThree-Contract-Version`）互补；
- 正反向注入均有效：positiveDetections 1 file / 9 detections，negativeFalsePositives 0，pageTextViolations 0。

### 2.5 测试真实性反查

- 12 个 test 文件中 `.skip`/`.only`/`@Disabled` 扫描：2 处命中均为 `skip-link` **CSS class**（非 `it.skip`/`.only`）——无逃逸；
- `setTimeout` 仅用于 `flushAsync`（Vue Test Utils 标准 `setTimeout(resolve,0)` 微任务刷新，5 处）——无 sleep 逃逸；
- `visual-css-contract.admin.ts` 断言全部为真实模式匹配（非空断言）；`not.toMatch(var(--r3-admin-bp-admin-min))` 因 token 存在而有意义，非恒真；
- `accessibility.admin.ts` 程序化 `.focus()` 断言 `document.activeElement`（真实 DOM 焦点），`integration-loopback.admin.ts` 起真实 HTTP server + upstream mock 断言敏感头不转发。

---

## 三、发现

### 3.1 P0 = 0

无。全部 Admin 门禁、Workspace 回归门禁独立复跑 PASS；lockfile/migration/Contract/依赖/版本零漂移；production bundle 禁入项 0 命中；12 个 authored 文件全部局限 `apps/admin-console/**`。

### 3.2 P1 = 0

无。未新增依赖、未动 root package/lockfile/workspace 配置；未修改 Adapter Contract、后端、Desktop、Core、Central、Main、Preload、IPC、migration；AAPI-0.4 evidenceDigest 不漂移；mutation/TGM/Knowledge Provider/identity/AAPI-0.5/Desktop v2/AFE-6C 继续 GATED。

### 3.3 P2 = 0

无。integration 与 production bundle 隔离成立（181 vs 82 modules，harness 运行期 + 静态扫描双校验）；`vite.config.mjs`（AAPI-0.4）与 root package.json（DFI-5.3.1）经内容 + mtime 判定非 AFE-6B 越界。

### 3.4 P3 = 1

**P3-1 — `scan:static` 在 dist/dist-integration 缺失时静默通过（bundle 扫描空跑窗口）**

- **位置**：[static-scan.mjs:69-82](apps/admin-console/scripts/static-scan.mjs#L69) `listExistingFiles` 对 `ENOENT` 返回 `[]`，`:130` bundleRoots 空目录 → bundleScans/productionBundleScans 均为空，`:162-175` CLI exit 条件只看 violations/positive/negative/pageText，**不检查 bundle 是否真的扫到文件**；
- **复现**（实证）：临时 `mv dist dist__qa_bak` 后重跑，`bundleViolations:0 / productionBundleViolations:0` 仍 exit 0；恢复后正常；
- **影响**：作为独立命令 `pnpm scan:static` 在未先 build 的工作区会「假通过」——bundle 层敏感扫描实际未执行却报 PASS。**canonical 门禁路径（harness:aapi0.4 先 build 再校验）不受影响**，本机复跑 dist 存在，结果真实；
- **建议**（不阻断）：`scan:static` CLI 段对 dist/dist-integration 缺失时明确失败或输出 bundle 文件计数（如 `bundleScannedFileCount`），避免空跑假绿；可在下一批次（AFE-6C）作为 P3 修订。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1
```

AFE-6B 完成 Admin Console 只读管理后台的证据层收口：导航 `aria-current`（NavLink 精确 path 匹配）、详情入口/分页/返回入口可读名称（`查看…详情` / `加载下一页` / `返回…`）、CSS Contract（html/body/admin-shell `min-width:0`、表格局部滚动、长文本 `overflow-wrap:anywhere`、reduced-motion 关闭 skip-link transition）、static-scan 扩展到 `dist/**` 与 `dist-integration/**` 并新增 production bundle 禁入项（AdminApiAdapter/createAdminApiAdapter//admin/v1alpha1），全部独立复核与实施报告一致。P3-1 术语修订（hash-mode index HTML，无 SPA fallback）在代码（serveStatic 仅 `/`）与测试（深链 404 断言）双落地。

门禁独立复跑全部 PASS：Admin typecheck/negative/build（82）/build:integration（181）/test（12 files/46 tests）/scan:static/scan:deps/smoke:dev；harness:aapi0.4 evidenceDigest `sha256:aa434855…02a71` 逐字一致；desktop build + 58 files/251 tests；全仓 check 287/1986 + 3 smoke + Architecture boundary。lockfile `5b15ae01…874f31`、migration 止 26、`packages/contracts/src` 0 修改、Admin version `0.0.0-afe.6b`、依赖零新增均核实。12 个 authored 文件局限 `apps/admin-console/**`，无越界写入。

**AFE-6B 可进入用户接受流程**；接受后标记 PASS/CLOSED 并更新 README/CHANGELOG/DEVELOPMENT-LOG。mutation、Tool activation、TGM、Knowledge Provider、production identity、AAPI-0.5、Desktop v2 consumption、AFE-6C 继续 GATED，不自动解锁。

**P3-1（scan:static 在 dist 缺失时静默通过）**仅作健壮性观察，不阻断接受；建议在 AFE-6C 窗口补 bundle 扫描文件计数或缺失失败。

— Claude Code（独立 QA，只读）
