# AFE-6B Admin Browser / Visual / Accessibility Evidence Closure 详细方案

状态：REVISION 1 / DOCUMENT PLAN ONLY / CODING GATED  
日期：2026-08-27  
负责人：Codex 5.6  
范围：RoboThree Admin Console 只读管理后台的浏览器启动、视觉一致性、响应式、键盘与可访问性证据收口。  
当前动作：仅输出文档评审材料，不编码，不修改运行时代码、依赖、版本、CHANGELOG 或 DEVELOPMENT-LOG。
Revision 1 修订：吸收技术负责人 `PASS_WITH_REVISIONS` 的 2 个 P2 和 1 个 P3；收紧 happy-dom、CSS Contract 与 Node HTTP smoke 的证据边界，明确 authored source 与可重建门禁产物的范围区别。

## 0. 当前结论

AFE-6A 已完成 Admin Read-only Experience Closure，并由用户接受为 `PASS/CLOSED`。Admin Console 当前具备六模块只读页面、真实 development/test Adapter 接线、11 项页面状态、安全错误 fallback、Tool Prototype 创建/策略路由清理和基础组件测试。

AFE-6B 不新增业务功能。它的目标是把 AFE-6A 已有只读体验补成可持续复核的证据层：浏览器启动边界、路由可达性、视觉结构、响应式布局、键盘路径、ARIA 语义、敏感内容禁入和 production/integration bundle 隔离。

本批不能声明 production ready。production identity、SSO、production Admin HTTP、Browser Security、Admin Adapter、mutation、Tool activation、TGM、Knowledge Provider、AAPI-0.5、Desktop v2 consumption 继续 `GATED`。

## 1. 上游事实

| 事实 | 当前口径 | 证据路径 |
| --- | --- | --- |
| AFE-0 | Admin Vue 2.7、六项一级导航、安全基线、Adapter/Fixture 边界与 Design Token Contract 已冻结。 | `docs/development/frontend/AFE-0-ADMIN-FRONTEND-FOUNDATION-PLAN.md` |
| AFE-1.1 | Admin scaffold、route shell、permission shell、Vue 2/3 隔离已完成。 | `docs/development/frontend/AFE-1.1-ADMIN-CONSOLE-SCAFFOLD-ROUTE-SHELL-IMPLEMENTATION-REPORT.md` |
| AFE-2 | Admin 通用组件、状态、表格、表单、弹窗、抽屉、OperationGate、静态扫描基础已完成。 | `docs/development/frontend/AFE-2-ADMIN-COMMON-COMPONENTS-PAGE-STATE-FOUNDATION-PLAN.md` |
| AFE-6A | 六模块真实只读体验已收口，Tool Prototype 创建/策略路径已删除，独立 QA 已由用户接受关闭。 | `docs/development/frontend/AFE-6A-ADMIN-READ-ONLY-EXPERIENCE-CLOSURE-IMPLEMENTATION-REPORT.md`；`docs/development/qa/afe-6a-claude-qa.md` |
| AAPI-0.4 | development/test integration 使用 built Admin + loopback proxy + Central ephemeral port；production entry 仍为 `UnavailableAdminAdapter`。 | `docs/development/AAPI-0.4-BROWSER-SECURITY-ADMIN-ADAPTER-DEVELOPMENT-TEST-INTEGRATION-IMPLEMENTATION-REPORT.md` |
| Frontend Spec | Admin 采用六项一级导航；系统管理无空白概览；页面状态、权限、错误和敏感信息展示按全局体验规范执行。 | `docs/product/FRONTEND-EXPERIENCE-SPEC-v1.0.md` |

## 2. 目标

| 编号 | 目标 | 成功判定 |
| --- | --- | --- |
| G-01 | Admin route evidence 固化。 | 六项一级导航、系统管理三项二级入口、五类详情路由、permission denied、not found 的稳定 route inventory 有自动测试。 |
| G-02 | 浏览器启动证据补强。 | production build、integration build、dev startup smoke、integration loopback server startup/teardown 均有确定性命令和资源释放断言。 |
| G-03 | 视觉结构证据补强。 | Shell、导航、标题区、列表、详情、状态、分页、系统二级导航的 DOM structure / class / token 使用有组件级 evidence；不宣称像素级截图，除非评审单独授权浏览器工具。 |
| G-04 | 响应式 CSS Contract 证据补强。 | 1180x760、900x600、680x560 三个尺寸只验证 media query、关键 class/token、overflow policy、表格局部滚动声明、固定 `min-width` 禁入和长文本换行规则；不宣称已证明真实浏览器无重叠、无实际横滚或无遮挡。 |
| G-05 | 键盘与焦点 DOM 证据补强。 | skip link、一级导航、系统二级导航、表格行/详情链接、分页按钮、返回链接、禁用按钮原因的 DOM 顺序、可聚焦属性、可读名称、`aria-current` 与程序化 `.focus()` 有组件测试；不宣称真实浏览器原生 Tab 序列或 focus ring 视觉已验证。 |
| G-06 | ARIA 与状态公告收口。 | `main`、`nav`、page heading、table caption、status region、busy/error/permission 状态角色与可读名称有测试。 |
| G-07 | 安全与敏感禁入扫描扩展。 | source、page text、serialized component output、integration bundle 中无真实或疑似 Secret/Token/Credential/Endpoint/内部路径/raw error。 |
| G-08 | AAPI-0.4 不回归。 | `harness:aapi0.4` evidenceDigest 不漂移；12 exact Adapter methods、mutation 0、readiness false 保持。 |

## 3. 非目标

1. 不新增 mutation、创建、编辑、保存、删除、发布、安装、同步、测试连接、索引或授权。
2. 不修改 Adapter Contract、Contract schema、AAPI-0.4 backend、Central、Core、Desktop、Main、Preload、IPC 或 migration。
3. 不新增依赖，不修改 root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`。
4. 不接 production identity、SSO、production Admin HTTP、production Browser Security 或 production Admin Adapter。
5. 不把 Node HTTP smoke 宣称为完整真实浏览器自动化。
6. 不引入 Playwright、Cypress、Puppeteer、axe-core、图标库、UI 库、视觉回归 SaaS 或 Vue 2 停维护插件。
7. 不用 LocalStorage、SessionStorage、IndexedDB 或前端数组模拟业务持久化。
8. 不恢复 AFE-3A 已删除的 Tool Prototype 创建/策略页面。

## 4. 文件范围

### 文档评审阶段

当前只允许新增或修订本方案文件。

### 后续编码若获授权

| 允许路径 | 用途 |
| --- | --- |
| `apps/admin-console/src/components/**` | 仅补可访问性属性、稳定 class/test hooks、布局语义和只读展示小修。 |
| `apps/admin-console/src/pages/**` | 仅补页面标题、状态 region、可读名称、无业务含义的结构调整。 |
| `apps/admin-console/src/presentation/**` | 纯展示 evidence helpers、可访问性 label、视觉状态矩阵。 |
| `apps/admin-console/src/styles/**` | 响应式、focus ring、表格局部滚动、长文本换行和 reduced-motion 小修。 |
| `apps/admin-console/src/app/**` | 只允许 route inventory / navigation evidence 的纯函数或测试辅助导出，不改权限事实。 |
| `apps/admin-console/tests/**` | component、router、accessibility、static、security、integration evidence 测试。 |
| `apps/admin-console/scripts/**` | 仅扩展现有 dev/integration smoke、static scan、deps scan；不得引入新依赖。 |
| `apps/admin-console/package.json` | 仅收口编码时更新 Admin package 版本，不新增依赖或脚本外部依赖。 |

AFE-6B authored source changes 严格限制在 `apps/admin-console/**`。既有门禁产生的 `dist/**`、`dist-integration/**` 和 `artifacts/aapi04/evidence.json` 属可重建输出，不构成跨范围源码修改；收口时按既有规则清理，或在实施报告中确认字节零漂移和生成原因。

| 禁止路径 | 原因 |
| --- | --- |
| `packages/contracts/**` | AFE-6B 不修改 Contract 或 schema。 |
| `services/core/**`、`services/central-service/**` | 不接后端，不调整 Projection 来源。 |
| `apps/desktop/**` | Desktop 客户端不归本批。 |
| `apps/desktop/src/main/**`、`apps/desktop/src/preload/**` | Admin Browser 不依赖 Electron runtime。 |
| root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` | 不新增依赖或 workspace 配置。 |
| migration | 不新增数据库事实。 |
| `README.md`、`CHANGELOG.md`、`docs/development/DEVELOPMENT-LOG.md` | 仅实现、QA、用户接受后的收口窗口更新。 |

## 5. 页面与路由范围

| 区域 | 路由 | AFE-6B 处理 |
| --- | --- | --- |
| 模型管理 | `/models`、`/models/:modelId` | 只读列表/详情视觉、ARIA、键盘和状态 evidence。 |
| 工具管理 | `/tools`、`/tools/:toolId` | 只读列表/详情 evidence；确认 `/tools/new/api`、`/tools/new/mcp`、`/tools/:toolId/policy` 继续不存在。 |
| 机器人管理 | `/robots`、`/robots/:robotId` | 只读列表/详情 evidence；限制三态文案不回退。 |
| 技能管理 | `/skills`、`/skills/:skillId` | 只读列表/详情 evidence；不恢复上传/解析入口。 |
| 知识管理 | `/knowledge`、`/knowledge/:knowledgeId` | 只读列表/详情 evidence；继续说明真实检索能力待接入。 |
| 系统管理 | `/system/users`、`/system/audit`、`/system/feedback` | 用户与权限/审计只读 evidence；反馈管理保持 prototype/gated，不做成功提交。 |
| 登录/错误 | `/login`、`/permission-denied`、`*` | 登录待接入、权限不足、Not Found 的可访问状态 evidence。 |

系统管理 `/system` 继续只做重定向到首个可访问二级页面，不建设空白概览页。

## 6. Evidence 类型与边界

| Evidence | 本批允许 | 禁止宣称 |
| --- | --- | --- |
| Build evidence | production build、integration build。 | 不代表 production Adapter ready。 |
| Dev startup evidence | 固定 loopback 地址与端口，Node HTTP 请求确认首页 HTML 可达，停止后确认端口释放。 | 不代表真实浏览器页面渲染、像素截图或原生导航。 |
| Integration loopback evidence | built Admin + Node loopback server 的 HTTP smoke，证明 index HTML 入口（hash-mode SPA）与静态资源、安全头、进程启动和端口释放。 | 不证明 Vue Router 已在浏览器中执行，也不代表生产安全头由真实网关提供。Router 为 hash mode，深链无需服务端 fallback；服务端只需提供 `/` 的入口 HTML 和静态资源。 |
| Router/component DOM evidence | Vue Router/component tests 证明 route 解析、组件挂载、页面 DOM、landmark、role、label、disabled reason。 | 不代表真实 CSS 布局、绘制、无重叠或所有浏览器一致渲染。 |
| Keyboard DOM evidence | happy-dom + Vue Test Utils 验证 DOM 顺序、链接/按钮可聚焦属性、skip target、`aria-current`、可读名称和程序化 `.focus()`。 | 不宣称真实浏览器原生 Tab 序列或 focus ring 视觉已验证。 |
| Visual structure evidence | DOM/class/token/CSS Contract guard，验证 media query、overflow policy、换行规则和禁用固定超宽 `min-width`。 | 不做像素级视觉回归基线，不宣称已经证明实际无横滚、无遮挡或无重叠。 |
| Static scan evidence | source/page text/bundle text 敏感项、unsafe DOM、direct fetch、Prototype route 禁入。 | 不替代后端日志或服务端 DAST。 |

若评审要求真正浏览器截图、像素差异、键盘 Tab 序列或 axe 规则，本批必须先修订方案并进入单独依赖/工具授权窗口；不得在 AFE-6B 编码时临场新增 Playwright/Cypress/Puppeteer/axe-core。

## 7. 视觉与响应式矩阵

| Viewport | 口径 | 本批验证内容 |
| --- | --- | --- |
| 1180x760 | P0 支持尺寸 | 验证对应 CSS Contract：基础布局 class、主内容容器、表格局部滚动容器、换行规则和无超 viewport 固定 `min-width`。 |
| 900x600 | P0 支持尺寸 | 验证紧凑布局 media query、导航/内容区域 class、表格局部滚动声明和按钮/状态标签换行规则。 |
| 680x560 | 诊断尺寸 | 验证窄屏降级 CSS Contract、局部滚动声明和关键状态 DOM 仍存在；不作为真实布局支持承诺。 |

实现规则：

1. `html`、`body`、`.admin-shell` 不得固定超出 viewport 的最小宽度。
2. 表格横向溢出只能出现在表格容器，不得让全页面横滚。
3. 长模型名、工具名、知识库名、错误摘要必须换行，不覆盖操作按钮。
4. 状态颜色不能是唯一信号，必须同时有文字或 icon label。
5. Loading skeleton 不得改变表格列宽或页面主结构。
6. `prefers-reduced-motion` 下不依赖动画传达状态。

上述规则在 AFE-6B 中以 CSS Contract、DOM 结构、class/token 和静态扫描方式验证。由于当前 Admin 测试环境为 happy-dom，本批不得把这些测试结果表述为真实浏览器绘制层面的“不重叠”“无实际横滚”或“内容没有遮挡”证据。

## 8. 键盘与焦点矩阵

| 区域 | 必测路径 |
| --- | --- |
| Shell | skip link 指向 `#admin-main`；主内容具备可聚焦属性；一级导航 DOM 顺序稳定。 |
| System sub nav | 系统管理二级导航有 `aria-current` 或等价当前态；隐藏项不进入 DOM 导航集合。 |
| List pages | 表格行的详情入口为可聚焦链接或按钮；分页按钮有可读名称和禁用原因。 |
| Detail pages | 返回列表入口具备可聚焦属性；详情分组 heading 顺序稳定。 |
| State pages | permission denied、not found、unavailable、stale、error 状态有可读标题和安全行动入口。 |
| Disabled/Gated controls | 禁用状态必须有可见原因，不只依赖 tooltip。 |

本批不新增高风险确认弹窗，也不改变已存在 Modal/Drawer 交互。

键盘测试只证明 DOM 顺序、可聚焦元素属性、skip link target、`aria-current`、disabled reason、可读名称和程序化 `.focus()` 行为成立。它不宣称已经覆盖真实浏览器原生 Tab 序列、焦点环绘制或平台辅助技术全量行为。

## 9. ARIA 与语义要求

| 元素 | 要求 |
| --- | --- |
| 应用 Shell | `nav` 有明确中文 `aria-label`；当前页面 heading 唯一且与 route meta 对齐。 |
| 主内容 | `main#admin-main` 稳定存在，skip link 可达。 |
| 表格 | `caption` 或等价 label；列标题可读；空态不渲染成空表格成功。 |
| 状态提示 | Loading 使用 `aria-busy`；错误/权限/不可用使用安全 `role`，不暴露 raw error。 |
| 非生产提示 | 列表与详情持续出现，文案不暗示 production ready。 |
| 图标/装饰 | 若有装饰元素应 `aria-hidden`；图标按钮必须有 `aria-label`。 |

## 10. 安全与敏感内容检查

AFE-6B 必须扩展或保持扫描，证明以下内容不进入 source、page text、serialized DOM、integration/prod bundle：

- API key、Token、Bearer、Cookie、Session secret；
- Credential value、Credential Reference、mask、last4、copy/reveal 文案；
- Provider Endpoint、内部 URL、loopback target override；
- `/Users/...`、workspace root、内部文件路径；
- requestDigest、CapabilityLock、HMAC proof、cursor material；
- raw error object、stack trace、raw HTTP response、raw Audit payload；
- Prompt、Tool payload、Observation、embedding/vector/chunk content；
- 未接入业务的“创建成功 / 保存成功 / 发布成功 / 安装成功 / 测试成功 / 同步成功 / 索引成功”。

允许项：

- 产品说明中的中文“凭证”“令牌”“权限”“待接入”；
- 类型名、测试名和固定 fake/sentinel allowlist；
- 明确标注为 static scan positive fixture 的泄漏样例。

## 11. Adapter / Fixture / Mock 边界

| 项 | AFE-6B 规则 |
| --- | --- |
| Production entry | 继续使用 `UnavailableAdminAdapter`，不得 import `AdminApiAdapter`。 |
| Integration entry | 继续使用 AAPI-0.4 的 `AdminApiAdapter`，不得新增 method 或 mutation。 |
| Fixture | 仅测试或明确 visual scenario 可用；production 默认路径不得 import。 |
| 页面 | 只通过 installed Admin Adapter 读取数据；页面组件不得直接 `fetch`。 |
| Evidence fixture | 若新增 visual/state fixture，必须位于 tests 或明确 fixture 目录，不能进入 production default path。 |
| Error fallback | 只展示 safe summary 或固定文案；未知错误不得 stringify。 |

## 12. AAPI-0.4 回归门禁

AFE-6B 编码完成后必须复跑 `pnpm run harness:aapi0.4`，并在实施报告中确认：

1. `evidenceDigest` 与 AAPI-0.4 实施报告保持一致，除非方案修订明确授权 evidence version 变化；
2. `exactAdapterMethodCount=12`；
3. `mutationMethodCount=0`；
4. `productionAdminApiAdapterReachable=false`；
5. readiness false 集合不因 AFE-6B 变化而漂移；
6. production/integration bundle 隔离仍成立。

## 13. 测试计划

### 13.1 Admin package 门禁

| 命令 | 预期 |
| --- | --- |
| `pnpm --filter @robothree/admin-console typecheck` | PASS |
| `pnpm --filter @robothree/admin-console typecheck:negative` | PASS，负向 fixture 非恒真 |
| `pnpm --filter @robothree/admin-console build` | PASS |
| `pnpm --filter @robothree/admin-console build:integration` | PASS |
| `pnpm --filter @robothree/admin-console test` | PASS |
| `pnpm --filter @robothree/admin-console scan:static` | PASS，正反向注入均有效 |
| `pnpm --filter @robothree/admin-console scan:deps` | PASS，Vue 2/3 隔离不漂移 |
| `pnpm --filter @robothree/admin-console smoke:dev` | PASS，Node HTTP 首页可达且端口释放；不声明页面真实渲染 |

### 13.2 Workspace 回归门禁

| 命令 | 预期 |
| --- | --- |
| `pnpm run harness:aapi0.4` | PASS，digest/readiness 不漂移 |
| `pnpm --filter @robothree/desktop build` | PASS，仅证明未破坏 workspace；不表示 Desktop 前端由本批负责 |
| `pnpm exec vitest run apps/desktop/tests` | PASS 或环境失败如实 NOT RUN；不吸收 Desktop 修复 |
| `pnpm run check` | PASS；若外部并行窗口阻塞，必须隔离归因并等待基线恢复后复跑 |

### 13.3 最小新增测试

1. Route inventory：所有 Admin route name/path/meta 稳定；Tool Prototype forbidden routes 继续缺席。
2. Navigation a11y：一级导航、系统二级导航、`aria-current`、skip link、main target。
3. Read-only list a11y：六模块表格 caption、列标题、详情入口可读名称。
4. Detail a11y：五模块详情 heading 层级、返回入口、非生产提示。
5. State a11y：11 项页面状态的 role、title、safe message、action label。
6. Responsive guard：1180/900/680 三尺寸的关键 class 与 overflow policy。
7. Static scan：新增 serialized DOM/page text/bundle text 扫描，覆盖 forbidden success 和敏感形态。
8. Router/component tests：证明核心 route 解析、组件挂载和页面 DOM 可识别。
9. Integration HTTP smoke：built integration server 证明 index HTML 入口（hash-mode SPA）与静态资源、安全头、进程启动和端口释放；Router 为 hash mode，深链无需服务端 fallback；不宣称业务页面已被浏览器渲染。
10. Production/integration boundary：production bundle 0 命中 AdminApiAdapter、`/admin/v1alpha1`、mutation verbs。
11. Reduced motion/focus token：focus ring 与 reduced motion CSS 规则存在且未被页面覆盖。

## 14. 版本与文档收口

编码若获授权并通过开发者门禁：

1. Admin package 版本建议升级为 `0.0.0-afe.6b`。
2. 新增 AFE-6B 实施报告，记录实际变更、门禁、P0～P3、文件边界和后续 GATED 项。
3. 独立 QA 通过且用户接受后，才更新 `README.md`、`CHANGELOG.md`、`docs/development/DEVELOPMENT-LOG.md` 为 `PASS/CLOSED`。
4. 不修改 root version，除非技术负责人单独授权共享版本收口窗口。

## 15. 工期估算

| 子项 | 估算 |
| --- | --- |
| Route / navigation evidence | 0.5～1 天 |
| A11y / keyboard component evidence | 1～1.5 天 |
| Responsive / visual structure guards | 1～1.5 天 |
| Static scan 与 integration smoke 扩展 | 1～1.5 天 |
| 门禁、报告与 QA 修订 | 0.5～1 天 |

总估算：4～6.5 个集中工程日。

## 16. 未解决问题

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| O-01 | AFE-6B 是否必须包含真实浏览器截图/像素级视觉证据？ | 默认否。不新增依赖时只做 existing smoke + DOM/structure evidence；若必须截图，单独授权浏览器测试工具。 |
| O-02 | 是否允许引入 axe-core 或 Playwright？ | 默认否。需要依赖/lockfile 独占窗口和安全评审。 |
| O-03 | AFE-6B 是否关闭 production Browser Security？ | 否。AAPI-0.4 仍是 development/test integration，production Browser Security 继续 false。 |
| O-04 | 是否把反馈管理从 prototype 提升为 read-only ready？ | 否。反馈管理仍为 P1 / Prototype，除非有真实后端 Projection 与权限事实。 |
| O-05 | 是否删除 FixtureAdminAdapter？ | 否。本批可扫描 production 默认路径不引用；测试和 visual scenario 仍可保留。 |

## 17. P0～P3 自检

| 等级 | 当前自检 |
| --- | --- |
| P0 | 0。方案不授权编码，不修改运行时代码、依赖或 Contract。 |
| P1 | 0。未声明 production ready，不解锁 mutation/TGM/Knowledge Provider/identity。 |
| P2 | 0。测试与安全边界可判定；浏览器证据能力边界已明确。 |
| P3 | 0。未发现需要先修的小项；真实浏览器截图是否需要作为 O-01 交评审决定。 |

## 18. 评审问题

请 Claude Code / 技术负责人评审以下结论：

1. 是否接受 AFE-6B 定位为 evidence closure，而非新增页面能力。
2. 是否接受“不新增依赖时不宣称像素级真实浏览器自动化”的证据口径。
3. 是否接受编码范围严格限制在 `apps/admin-console/**`，仅收口文档窗口可更新治理文档。
4. 是否接受 AAPI-0.4 evidenceDigest/readiness 不漂移作为硬门禁。
5. 是否接受 AFE-6B 关闭后 mutation、Tool activation、TGM、Knowledge Provider、production identity、AAPI-0.5、Desktop v2 consumption 继续 GATED。
