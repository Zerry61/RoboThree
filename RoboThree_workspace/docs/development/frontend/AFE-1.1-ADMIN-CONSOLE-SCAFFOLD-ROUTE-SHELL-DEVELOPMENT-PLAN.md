# AFE-1.1 Admin Console Scaffold / Route Shell 详细方案

状态：PASS/CLOSED  
日期：2026-08-24  
范围：正式 Admin Console 前端工程骨架、路由壳、设计 Token 基线、权限壳和最小测试门禁方案。  
当前动作：独立 QA 已由用户接受；`apps/admin-console-preflight/**` 已按授权清理并完成 lockfile、Admin、Desktop 与 root 门禁收口。真实 Adapter 和业务页面继续独立 GATED。  
上游依据：AFE-0 Revision 1 `PASS/CLOSED`；AFE-1.0 Revision 1.1 `PASS/CLOSED`；P0-A 输出 `P0A_PRIMARY_CONFORMANT`；P0-B 输出 `P0B_WORKSPACE_CONFORMANT` 并经独立复核通过。  
非结论：本批关闭不表示 Admin 业务页面、登录、权限事实、真实 Adapter 或后端 API 已完成。

## 0. 工作区状态校正

本文件最初形成于编码前，旧状态未随前端窗口实现同步。当前工作区已存在 `apps/admin-console/**`，
`README.md` 与 `CHANGELOG.md` 已将其记录为 `0.0.0-afe.1.1 / IMPLEMENTED / INDEPENDENT QA PENDING`。

因此冻结以下口径：

1. 现有实现已通过独立 QA 并由用户正式接受；
2. AFE-1.1 正式标记 `PASS/CLOSED`；
3. 若 QA 发现实现超出已评审范围，进入受控 repair，不得用后端批次顺手修改；
4. AAPI-0 只把现有 Admin 工程视为 workspace baseline，不修改、不依赖其未验收行为；
5. `apps/admin-console-preflight/**` 已在独占前端收口窗口清理；证据与门禁见
   [AFE-1.1 Preflight 清理与共享依赖收口报告](./AFE-1.1-PREFLIGHT-CLEANUP-REPORT.md)。

## 1. 本批目标

AFE-1.1 的目标是把已通过 preflight 的 Vue 2.7 技术矩阵转为正式 Admin Console 最小工程骨架，但只建设壳层和可验证基础能力，不实现业务页面闭环。

| 编号 | 目标 | 成功判定 |
| --- | --- | --- |
| G-01 | 创建正式 `apps/admin-console/**` 独立 package。 | 包名、目录、依赖、脚本、tsconfig、Vite、Vitest 均独立，不复用 Desktop Vue runtime。 |
| G-02 | 接入 Vue 2.7.16 + Router 3 + TypeScript strict + SFC typecheck。 | 正向 typecheck、负向 typecheck harness、build、unit/component/router/static scan 全部通过。 |
| G-03 | 建立 Admin Shell 与六项一级导航路由骨架。 | 模型、工具、机器人、技能、知识、系统管理均有可访问 skeleton；系统管理无独立概览页。 |
| G-04 | 建立权限壳与 route meta 边界。 | 菜单可见性、路由访问、页面内操作权限分离；权限 key 仍为 provisional，不冒充正式 Contract。 |
| G-05 | 建立设计 Token 和基础状态组件基线。 | Loading、Empty、Error、Disabled、Permission denied、Unavailable、Partial、Ready 通过组件/路由测试覆盖。 |
| G-06 | 明确 fixture/mock/adapter 边界。 | 默认 production path 不使用 fixture；Mock 页面持续标注 `prototype/gated`；不伪造保存、测试、发布或同步成功。 |
| G-07 | 保持 Desktop Vue 3 与 Admin Vue 2 隔离。 | `why vue`、dependency scan、root check 和 Desktop 回归通过。 |

## 2. 非目标

1. 不实现真实登录、SSO、Session Lease、CSRF token 获取或企业认证 API。
2. 不实现真实 Admin API Adapter、Central Controller、数据库 migration、Contract 或 Projection。
3. 不实现模型、工具、机器人、技能、知识或系统管理的业务 CRUD。
4. 不上传技能包，不测试 Tool，不保存 Credential，不连接 Knowledge Provider。
5. 不建设复杂页面组件、表格业务列、抽屉详情、弹窗表单或 E2E 业务流。
6. 不共享 Desktop `.vue` 组件、Router、Store、Vue runtime、Renderer、Preload、IPC 或 Main Process。
7. 不使用 LocalStorage、SessionStorage、IndexedDB 或前端数组伪装业务持久化。
8. 不把 `apps/admin-console-preflight/**` 直接改名为正式工程；正式 scaffold 必须新建干净目录并选择性迁移已验证的配置思想。

## 3. 文件允许与禁止范围

### 允许修改

| 路径 | 目的 |
| --- | --- |
| `apps/admin-console/**` | 新建正式 Admin Console 工程骨架。 |
| `apps/admin-console-preflight/**` | 编码授权后可在 QA 已接受的前提下清理；不得作为生产源码继续演化。 |
| `pnpm-lock.yaml` | 正式 package 依赖接入 workspace 必然更新。 |
| `pnpm-workspace.yaml` | 仅允许保留或调整 P0-B 已验证的 esbuild approval 与 Vue 2 compiler peer extension。 |
| `README.md`、`CHANGELOG.md`、`docs/development/DEVELOPMENT-LOG.md` | 仅在编码批次完成并按仓库规则收口时更新；方案评审阶段不更新为已实现。 |

### 禁止修改

| 路径 | 禁止原因 |
| --- | --- |
| `apps/desktop/**` | Desktop Vue 3 保持不变，只做回归验证。 |
| `services/core/**` | AFE-1.1 不接 Core。 |
| `services/central-service/**` | AFE-1.1 不接 Central API。 |
| `packages/contracts/**`、`contracts/**`、`docs/architecture/contracts/**` | 权限、Projection、API Contract 未在本批冻结。 |
| `apps/desktop/src/main/**`、`apps/desktop/src/preload/**`、Desktop IPC / Private Contract | Admin Browser 不依赖 Electron 边界。 |
| `migrations/**`、Central migration 目录 | 无数据库变更。 |
| 根 TypeScript、ESLint、Vite 配置 | 除非独立共享文件窗口批准，否则 Admin 使用 package-local 配置。 |

## 4. Preflight 到正式 scaffold 的处理

| 项 | 决策 |
| --- | --- |
| `apps/admin-console-preflight/**` | 独立 QA 已完成后，编码授权时建议清理；若技术负责人要求保留证据，则保留到 AFE-1.1 QA 后再清理。 |
| 正式目录 | 使用 `apps/admin-console/**`，不复用 disposable/preflight package name。 |
| 正式 package name | `@robothree/admin-console`。 |
| 版本 | 初始 `0.0.0-afe.1.1` 或按 root 版本策略由技术负责人确认；不使用 `0.0.0-p0a`。 |
| P0-B workspace config | `onlyBuiltDependencies: [esbuild]` 与 `packageExtensions.vue-template-compiler@2.7.16.peerDependencies.vue: 2.7.16` 建议正式保留，原因是 workspace 验证已证明它们是 Vue 2/3 隔离和可重复安装的必要配置。 |
| P0-B root Vitest 风险 | 正式 Admin 测试文件不使用 root 默认误收集命名；推荐 `*.admin.test.ts` 或 package-local include，并同时验证 root `vitest run` 不误用 Vue 3 配置。 |
| Fixture/scan scripts | 可以迁移设计思想，不照搬 disposable 文件名和演示业务数据；正式扫描脚本要使用 Admin 路径与正式 allowlist。 |

## 5. 精确依赖矩阵

AFE-1.1 直接采用 P0-A/P0-B 已验证 Primary matrix，禁止 fallback 和临场新增第三套版本。

| 包 | 精确版本 | 说明 |
| --- | --- | --- |
| `vue` | `2.7.16` | Admin runtime；Vue 2 EOL 风险按 AFE-0 治理。 |
| `vue-router` | `3.6.5` | Vue 2 Router 3。 |
| `@vitejs/plugin-vue2` | `2.3.4` | 已验证；插件非积极维护，禁止随意升级。 |
| `@vue/test-utils` | `1.3.6` | Vue 2 component tests。 |
| `vite` | `6.4.3` | 不复用 Desktop Vite 8。 |
| `vitest` | `4.1.10` | 与 root 版本线一致，但 Admin 使用 package-local config。 |
| `typescript` | `5.9.3` | 与 root 当前实际版本一致。 |
| `vue-tsc` | `3.3.11` | 必须读取 `vueCompilerOptions.target: 2.7` 与 `strictTemplates: true`。 |
| `vue-template-compiler` | `2.7.16` | 通过 workspace package extension 绑定 Vue 2.7.16。 |
| `happy-dom` | `20.11.2` | Component test DOM env。 |
| `@types/node` | `24.13.3` | Node 24 类型。 |

所有依赖必须精确 pin，禁止 `^`、`~`。正式 package 不新增 Vue 2 停止维护插件，除非有单独维护状态、安全面和替代方案评审。

## 6. 正式目录规划

```text
apps/admin-console/
├── package.json
├── index.html
├── vite.config.mjs
├── vitest.config.mjs
├── tsconfig.json
├── tsconfig.negative.json
├── src/
│   ├── main.ts
│   ├── app/
│   │   ├── App.vue
│   │   ├── router.ts
│   │   ├── route-meta.ts
│   │   ├── navigation.ts
│   │   ├── permission-shell.ts
│   │   └── capability-projection.ts
│   ├── adapters/
│   │   ├── admin-adapter.ts
│   │   ├── unavailable-admin-adapter.ts
│   │   └── fixture-admin-adapter.ts
│   ├── components/
│   │   ├── layout/
│   │   ├── state/
│   │   └── ui/
│   ├── pages/
│   │   ├── models/
│   │   ├── tools/
│   │   ├── robots/
│   │   ├── skills/
│   │   ├── knowledge/
│   │   └── system/
│   ├── presentation/
│   ├── styles/
│   │   ├── tokens.css
│   │   └── base.css
│   ├── types/
│   └── fixtures/
├── tests/
│   ├── component/
│   ├── router/
│   ├── static/
│   ├── typecheck/
│   └── accessibility/
├── fixtures/
│   ├── type-errors/
│   └── static-scan/
└── scripts/
    ├── assert-negative-typecheck.mjs
    ├── dependency-isolation-scan.mjs
    ├── static-scan.mjs
    └── dev-startup-smoke.mjs
```

## 7. 路由范围

AFE-1.1 只实现页面骨架和状态壳，页面内容必须明确为“待接入 / 演示数据 / 权限不足 / 暂不可用”等安全状态，不展示业务成功。

| 一级导航 | 路由 | 页面状态 | 说明 |
| --- | --- | --- | --- |
| 模型管理 | `/models`、`/models/:modelId` | Unavailable / Gated / Permission denied | 不展示真实 Provider、API Key、Credential Reference 或保存成功。 |
| 工具管理 | `/tools`、`/tools/:toolId` | Unavailable / Gated / Permission denied | 不展示 Endpoint、Token、Credential、Runtime Handle；不提供测试成功。 |
| 机器人管理 | `/robots`、`/robots/:robotId` | Gated / Permission denied | 不创建机器人，不保存草稿。 |
| 技能管理 | `/skills`、`/skills/:skillId` | Gated / Permission denied | 不上传压缩包，不解析真实文件。 |
| 知识管理 | `/knowledge`、`/knowledge/:knowledgeId` | Unavailable / Gated / Permission denied | 不宣称真实检索、连接测试或同步成功。 |
| 系统管理 | `/system/users`、`/system/audit`、`/system/feedback` | Permission denied / Gated / Prototype | 无独立 `/system` 概览；`/system` redirect 到首个有权二级页。 |
| Not Found | `*` | Not Found | 不将 403 伪装成 404。 |

Router mode 默认 `hash`，直到 Central/Admin hosting 明确提供 server rewrite 后再评估 history mode。

## 8. Route Meta、权限与 Capability 边界

| 层 | 职责 | 禁止 |
| --- | --- | --- |
| `implementationGate` | 静态描述页面是否已实现：`planned` / `prototype` / `shellImplemented`。 | 不表达后端能力 Ready。 |
| `CapabilityProjection` | 运行时能力状态：`ready` / `unavailable` / `gated` / `partial`。AFE-1.1 默认由 unavailable adapter 返回安全状态。 | 不由 route meta、用户名、菜单或单条数据推断。 |
| provisional permission alias | 临时权限别名，仅用于壳层测试和菜单/路由行为。 | 不写入 Contract，不宣称正式权限字符串。 |
| 菜单可见性 | 根据未来权限 projection 决定是否展示入口。 | 不等于路由可访问性。 |
| 路由访问 | Guard 基于权限 projection 输出允许、Permission denied 或登录壳。 | 不根据菜单隐藏绕过。 |
| 页面内操作 | 操作按钮可见/可用由 operation permission projection 决定。 | 不用 route read 权限代替操作权限。 |

AFE-1.1 若未接真实权限 Projection，默认只允许 fixture/test 场景注入权限事实；production 默认显示 Unavailable 或 Permission denied，不伪造管理员全权。

## 9. Adapter / Fixture / Mock 边界

| 类型 | 允许使用 | 禁止 |
| --- | --- | --- |
| `AdminAdapter` interface | 页面获取业务数据的唯一入口。 | 页面中直接 `fetch`、直接调用 HTTP client 或散落 mock 数组。 |
| `UnavailableAdminAdapter` | production 默认占位，返回 typed unavailable/gated state。 | 返回 fake list 冒充真实数据。 |
| `FixtureAdminAdapter` | 测试、视觉验收和显式 `prototype/gated` 场景。 | 混入 production 默认运行路径。 |
| Mock 页面 | 必须持续标注“演示数据 / 待接入”或 QA `prototype/gated` 标记。 | 创建成功、保存成功、发布成功、安装成功、测试成功、同步成功等虚假业务结果。 |
| 真实 API Adapter | AFE-1.1 不实现。 | 使用未冻结 Contract 或 Central endpoint。 |

## 10. 页面状态矩阵

| 状态 | 壳层表现 | 测试要求 |
| --- | --- | --- |
| Loading | Skeleton / busy 区域，保留导航和标题。 | `aria-busy`、焦点不丢失。 |
| Empty | 无数据但能力已可用时的空态；AFE-1.1 默认不使用真实 Empty。 | 不把 Gated/Unavailable 写成 Empty。 |
| Ready | 仅用于壳层 ready，例如导航和静态 layout ready。 | 不表示业务数据 ready。 |
| Unavailable | 后端能力、真实 Projection 或认证未接入。 | 默认 adapter 必须可返回。 |
| Permission denied | 身份有效但权限不足。 | 403 与 401 分流语义可测。 |
| Error | safe summary + correlation id。 | 不 stringify 原始异常，不展示 stack。 |
| Disabled | 操作可见但不可用，原因必须安全明确。 | 不允许触发假成功。 |
| Partial | 部分能力可见但关键操作缺失。 | 必须说明待接入边界。 |

## 11. 安全与敏感信息边界

1. Browser JS 不持久化真实 Secret、Token、Credential、API Key 或签名材料。
2. API Key、Token、Credential、签名材料不得进入 URL、Router state、LocalStorage、日志、错误信息、测试快照或 QA evidence。
3. 企业 Credential 永不回显；状态只展示 `configured` / `missing` / `unavailable` 等枚举。
4. 普通错误页只展示 safe summary，不 `JSON.stringify(error)`，不展示 stack、headers、Cookie、请求体或内部绝对路径。
5. 禁止 `innerHTML`、`v-html`、`eval`、动态 Function。
6. Fixture 只能使用固定 fake/sentinel 值；不得诱导用户输入真实 Secret。
7. 权限事实必须来自未来真实 Projection；AFE-1.1 壳层不得根据用户名、菜单或单条数据自行推断。
8. 审计页面骨架不得展示任务正文、Prompt、Tool payload、Credential Reference、CapabilityLock 或内部运行状态。

## 12. Design Token 与组件基线

AFE-1.1 只落地最小 token contract 和壳层组件，不做完整设计系统。

| 层 | 本批允许 |
| --- | --- |
| `styles/tokens.css` | surface/text/border/action/semantic、typography、spacing、radius、shadow、focus、z-index、motion、breakpoint、table density token。 |
| `styles/base.css` | 管理端基础布局、字体、focus ring、reduced motion、body reset。 |
| Layout components | `AdminShell`、`SidebarNav`、`TopBar`、`SystemSubNav`。 |
| State components | `PageState`、`InlineNotice`、`SkeletonBlock`、`PermissionDenied`、`UnavailableState`、`SafeErrorState`。 |
| UI components | 最小 Button、Badge、TableShell、InputShell 仅服务壳层和测试。 |

所有复杂展示判断进入 `presentation/**` 纯函数，不导入 Vue、DOM、Preload、IPC 或 Adapter 实例。

## 13. 登录壳与安全响应边界

AFE-1.1 可以建立登录壳占位和 401/403 状态分流，但不得实现真实认证。

| 项 | 决策 |
| --- | --- |
| 401 | 显示会话未建立/登录待接入壳，不保存 bearer。 |
| 403 | 显示 Permission denied。 |
| Session | Browser JS 不持有 bearer；真实方案等待服务端 HttpOnly Session/CSRF 设计。 |
| CSRF | 不实现 mutation；所有未来 mutation 必须经过 CSRF 设计评审。 |
| CSP / frame-ancestors | AFE-1.1 不配置生产响应头，但静态扫描禁止 inline script 依赖和 unsafe DOM。 |

## 14. 测试门禁

### Package 门禁

| 命令 | 目标 |
| --- | --- |
| `CI=true pnpm --filter @robothree/admin-console typecheck` | 正向 TS strict + Vue 2.7 SFC typecheck。 |
| `CI=true pnpm --filter @robothree/admin-console typecheck:negative` | 负向 fixture 必须失败并观察到预期 `.vue`/`.ts` 文件和诊断。 |
| `CI=true pnpm --filter @robothree/admin-console build` | Vite production build。 |
| `CI=true pnpm --filter @robothree/admin-console test` | Unit / component / router / state tests。 |
| `CI=true pnpm --filter @robothree/admin-console smoke:dev` | 固定 loopback port dev startup + release。 |
| `CI=true pnpm --filter @robothree/admin-console scan:static` | 敏感值、unsafe DOM、fixture production path、Desktop import 扫描。 |
| `CI=true pnpm --filter @robothree/admin-console scan:deps` | Vue 2/3 隔离与精确版本解析。 |

### Workspace 门禁

| 命令 | 目标 |
| --- | --- |
| `CI=true pnpm install --frozen-lockfile` | lockfile 可复现。 |
| `CI=true pnpm --filter @robothree/desktop build` | Desktop Vue 3 回归。 |
| `CI=true pnpm exec vitest run apps/desktop/tests` | Desktop focused tests 回归。 |
| `CI=true pnpm --filter @robothree/admin-console why vue` | Admin 只解析 Vue 2.7.16。 |
| `CI=true pnpm --filter @robothree/desktop why vue` | Desktop 只解析 Vue 3.5.40。 |
| `CI=true pnpm run check` | Root lint/build/test/smoke 全门禁。 |

## 15. 最小测试覆盖

| 测试域 | 必须覆盖 |
| --- | --- |
| Router | 六项一级导航、系统管理 redirect、三个系统二级页、Not Found、父子导航选中、hash mode。 |
| Permission shell | 菜单隐藏、路由 Permission denied、页面内操作 disabled 三者分离。 |
| Page state | Loading、Unavailable、Permission denied、Error、Disabled、Partial、Ready；Empty 仅在明确 ready data source 场景覆盖。 |
| Presentation | 状态 label/tone/icon 穷尽检查；新增状态未处理时 TypeScript 编译失败。 |
| Adapter boundary | 页面只通过 `AdminAdapter`，production 默认 unavailable，不直接 fetch。 |
| Sensitive scan | 正向注入能检出 bearer/API key/private key/stack/内部路径；反向 allowlist 不误报产品文案和 fake sentinel。 |
| Accessibility | 主导航 landmark、当前页标识、skip link、focus ring、按钮 aria-label、状态区域 `role`。 |
| Visual smoke | 1024x720、1280x800、1440x900 截图检查可选；若未引入 Playwright，本批至少用 component DOM 断言布局结构和文本不重叠的基础约束。 |

## 16. 清理与交付顺序

建议 AFE-1.1 若获编码授权，按以下顺序执行：

1. 记录当前 digests：root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`apps/desktop/package.json`。
2. 新建 `apps/admin-console/**` 干净工程骨架。
3. 接入精确依赖和 package-local Vite/Vitest/tsconfig。
4. 建立 route meta、navigation、permission shell、unavailable adapter、page states。
5. 建立 tokens/base styles 和最小 layout/state/ui components。
6. 建立正向/负向 typecheck、static scan、dependency scan、dev startup smoke。
7. 运行 package 门禁。
8. 运行 Desktop focused 回归。
9. 运行 root `pnpm run check`。
10. 在 QA 授权后清理 `apps/admin-console-preflight/**`；如清理，重新生成 lockfile 并 frozen install。
11. 完成后按仓库规则更新 CHANGELOG / DEVELOPMENT-LOG / 版本状态，并提交实施报告。

若技术负责人要求先保留 preflight 证据，则第 10 步延后，但报告必须明确 preflight 与正式工程双目录并存是临时 QA 状态。

## 17. 工期估算

| 阶段 | 估算 |
| --- | --- |
| Scaffold + config + dependency install | 0.5～1 天 |
| Route shell + permission shell + state components | 1～1.5 天 |
| Token/base styles + accessibility polish | 0.5～1 天 |
| Tests + static/deps scan + dev smoke | 1～1.5 天 |
| Workspace gates + report + QA 修订 | 0.5～1 天 |
| 合计 | 3.5～6 天 |

## 18. 未解决问题与需评审决策

| 编号 | 问题 | 当前建议 |
| --- | --- | --- |
| O-01 | `apps/admin-console-preflight/**` 是立即清理还是保留到 AFE-1.1 QA 后清理？ | 编码授权时一并给出清理窗口；默认保留到 AFE-1.1 QA 通过后清理。 |
| O-02 | `pnpm-workspace.yaml` 中 esbuild approval 与 Vue 2 compiler peer extension 是否正式保留？ | 正式保留，除非技术负责人要求每次 scaffold 后重新证明替代方案。 |
| O-03 | Admin package version 是否与 root development version 同步为 `0.0.0-afe.1.1`？ | 建议同步逻辑批次，但版本更新只在编码完成收口时执行。 |
| O-04 | 视觉截图门禁是否本批必须引入 Playwright？ | 不建议 AFE-1.1 引入新工具；先使用 component DOM/a11y/static tests，视觉基线可在 AFE-2 或 UX 稳定后引入。 |
| O-05 | 真实登录壳是否需要接 Central HTTP 401/403？ | AFE-1.1 不接真实 HTTP；仅保留状态接口和测试 fixture。 |
| O-06 | 权限 alias 命名是否要进入 Contract？ | 不进入。直到 Contract 冻结前保持 provisional。 |

## 19. P0～P3 自检

| 等级 | 数量 | 说明 |
| --- | --- | --- |
| P0 | 0 | 未发现会阻断方案评审的冲突。 |
| P1 | 0 | 未发现会影响安全边界或 Vue 2/3 隔离的高风险设计。 |
| P2 | 0 | 需要评审的事项已列入 O-01～O-06，不作为本方案缺陷。 |
| P3 | 0 | 暂无低风险延期项。 |

## 20. 评审结论请求

请求 Claude Code 和技术负责人评审：

1. 是否接受 AFE-1.1 只创建正式 scaffold、route shell、permission shell、state/token 基线，不实现业务 CRUD。
2. 是否授权编码时创建 `apps/admin-console/**` 并更新 `pnpm-lock.yaml`。
3. 是否正式保留 P0-B 证明必要的 `pnpm-workspace.yaml` esbuild approval 与 Vue 2 compiler peer extension。
4. 是否在 AFE-1.1 QA 通过后清理 `apps/admin-console-preflight/**`。

只有上述评审通过且用户明确编码授权后，才可进入 AFE-1.1 实施。
