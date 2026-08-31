# AFE-6B Admin Browser / Visual / Accessibility Evidence Closure 实施报告

状态：PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED  
日期：2026-08-27  
负责人：Codex 5.6  
范围：`apps/admin-console/**`

## 1. 交付范围

AFE-6B 完成 Admin Console 只读管理后台的证据层收口：浏览器启动、hash-mode integration loopback、路由/组件 DOM、导航与键盘可达属性、ARIA 当前态、响应式 CSS Contract、bundle 敏感扫描和 AAPI-0.4 不回归。

本批不新增业务能力：不新增 mutation，不恢复 Tool Prototype 创建/策略路由，不修改 Adapter Contract，不直接接后端，不引入真实浏览器自动化或新依赖。

## 2. 实现摘要

- `apps/admin-console/package.json` 版本更新为 `0.0.0-afe.6b`，未新增依赖。
- `NavLink.vue` 输出当前路由的 `aria-current="page"`，一级导航和系统二级导航共享该语义。
- `AdminButton.vue` 增加显式 `label` prop，用于图形/状态按钮的可读名称，不依赖 Vue 2 attr 透传推断。
- `ReadOnlyInventoryPage.vue` 给详情入口和分页按钮补可读名称；`ReadOnlyInventoryDetail.vue` 增加返回列表入口。
- `base.css` 收紧响应式 contract：全局和 shell 不固定超 viewport 最小宽度，表格使用局部横向滚动，长文本声明换行，skip link 在 reduced motion 下取消 transition。
- `static-scan.mjs` 扩展到 build 后 `dist/**` 与 `dist-integration/**`：bundle 扫描敏感值，production bundle 额外禁止 `AdminApiAdapter`、`createAdminApiAdapter` 和 `/admin/v1alpha1`。
- 新增/扩展 accessibility、integration loopback、static scan、CSS contract 测试，明确只证明 DOM/CSS/HTTP contract，不宣称真实浏览器像素布局或原生 Tab 序列。
- AFE-6B 方案已采纳 P3-1 术语修订：将 `SPA fallback` 改为 `index HTML 入口（hash-mode SPA）与静态资源`，并说明 hash-mode 深链无需服务端 fallback。

## 3. 安全边界

- production entry 继续不暴露 `AdminApiAdapter`；integration entry 继续由 AAPI-0.4 控制。
- 页面组件仍不直接调用 `fetch` 或 `XMLHttpRequest`。
- source/page text/bundle scan 均不允许真实或疑似 Secret、Token、Bearer、Credential Reference、Endpoint、内部路径、raw error、stack 或未接入业务成功文案进入展示面。
- 生成 bundle 中 Vue/Vite 自带的 runtime 字符串不作为应用源代码 unsafe DOM/direct fetch 证据；unsafe DOM/direct fetch 禁入仍在 source scan 中执行。
- AAPI-0.4 evidenceDigest 保持 `sha256:aa4348558bcd333ed1fa377be99da0f82a5bc940456db3762ebf340dbad02a71`，12 个 exact Adapter methods、mutation 0、production Admin API Adapter false、9 项 readiness false 均不漂移。

## 4. 验证结果

### 4.1 Admin package 门禁

- `pnpm --filter @robothree/admin-console typecheck`：PASS。
- `pnpm --filter @robothree/admin-console typecheck:negative`：PASS，负向 fixture `BadProps.vue`、`BadTemplateAccess.vue`、`bad-route-meta.ts` 按 Type / missingField 失败。
- `pnpm --filter @robothree/admin-console build`：PASS，82 modules。
- `pnpm --filter @robothree/admin-console build:integration`：PASS，181 modules。
- `pnpm --filter @robothree/admin-console test`：PASS，12 files / 46 tests。沙箱下 loopback test 会因 `listen EPERM` 失败，已用非沙箱复跑通过。
- `pnpm --filter @robothree/admin-console scan:static`：PASS，sourceViolations 0，bundleViolations 0，productionBundleViolations 0，positiveDetections 1 file / 9 detections，negativeFalsePositives 0，pageTextViolations 0。
- `pnpm --filter @robothree/admin-console scan:deps`：PASS，Vue 2.7.16 / Router 3.6.5 / VTU 1.3.6 / plugin-vue2 2.3.4 隔离成立。
- `pnpm --filter @robothree/admin-console smoke:dev`：PASS，Node HTTP 首页可达且端口释放；不声明页面真实渲染。

### 4.2 Workspace 回归门禁

- `pnpm run harness:aapi0.4`：PASS。当前 shell 默认无 `JAVA_HOME` 时会提示无法定位 Java Runtime；已使用 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 复跑通过。
- `pnpm --filter @robothree/desktop build`：PASS。
- `pnpm exec vitest run apps/desktop/tests`：PASS，58 files / 251 tests。沙箱下本地 loopback/Core 子进程测试会失败，已用非沙箱复跑通过。
- `pnpm run check`：PASS，287 files / 1986 tests + 3 smoke + Architecture boundary。

## 5. 文件边界

AFE-6B authored source/test changes：

- `apps/admin-console/package.json`
- `apps/admin-console/scripts/static-scan.mjs`
- `apps/admin-console/scripts/static-scan.mjs.d.ts`
- `apps/admin-console/src/components/layout/NavLink.vue`
- `apps/admin-console/src/components/ui/AdminButton.vue`
- `apps/admin-console/src/components/inventory/ReadOnlyInventoryPage.vue`
- `apps/admin-console/src/components/inventory/ReadOnlyInventoryDetail.vue`
- `apps/admin-console/src/styles/base.css`
- `apps/admin-console/tests/accessibility/accessibility.admin.ts`
- `apps/admin-console/tests/security/integration-loopback.admin.ts`
- `apps/admin-console/tests/static/static-scan.admin.ts`
- `apps/admin-console/tests/static/visual-css-contract.admin.ts`

已授权文档产物：

- `docs/development/frontend/AFE-6B-ADMIN-BROWSER-VISUAL-ACCESSIBILITY-EVIDENCE-CLOSURE-PLAN.md`
- `docs/development/frontend/AFE-6B-ADMIN-BROWSER-VISUAL-ACCESSIBILITY-EVIDENCE-CLOSURE-IMPLEMENTATION-REPORT.md`

未修改 Adapter Contract、后端、Desktop、Core、Central、Main、Preload、IPC、migration、root package 或 lockfile。`pnpm-lock.yaml` digest 保持 `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

`dist/**`、`dist-integration/**` 与 `artifacts/aapi04/evidence.json` 为门禁可重建输出；AAPI-0.4 evidence 内容与既有 digest 一致。

## 6. P 级结论

- P0=0
- P1=0
- P2=0
- P3=1

Claude Code 独立 QA 发现唯一非阻断 P3：`scan:static` 作为独立命令在缺少 `dist/**` 或
`dist-integration/**` 时会空跑 bundle 扫描并通过。canonical 门禁路径先 build，不影响本批关闭；建议
AFE-6C 增加 bundle 文件计数或缺失失败。

用户已接受并关闭 AFE-6B；Admin Browser / Visual / Accessibility Evidence Closure 正式 `PASS/CLOSED`。

## 7. 后续边界

以下能力继续 `GATED`，不因 AFE-6B 实现自动解锁：

- mutation
- Tool activation
- TGM
- Knowledge Provider
- production identity
- AAPI-0.5
- Desktop v2 consumption
- AFE-6C 或真实浏览器截图/axe 自动化
