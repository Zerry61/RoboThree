# AFE-0 Admin Frontend Foundation 详细实施方案

状态：DOCUMENT PLAN ONLY / CODING GATED  
修订：Revision 1，吸收 `PASS_WITH_REVISIONS` 评审意见。  
范围：Admin Console 前端基础方案、工程门禁、边界冻结  
当前动作：仅输出文档评审材料，不创建 Admin production 工程，不修改依赖、版本、日志状态或任何运行时代码。  
后续顺序：Claude Code 过程文档评审 -> 技术负责人确认 AFE-0 大节点 -> 后续编码另行授权。Claude Code 复核通过不自动触发 AFE-1 编码。

## 1. 基线阅读与事实核查表

| 类别 | 当前正式来源 | 已核查事实 | AFE-0 采用口径 |
| --- | --- | --- | --- |
| PRD | `docs/product/PRD-ROBOTHREE-MVP.md` | PRD v1.6 Final；Admin Console 一级导航已收敛为六项：模型管理、工具管理、机器人管理、技能管理、知识管理、系统管理。 | 六项一级导航是当前 Admin IA 的唯一冻结口径。 |
| Frontend Spec | `docs/product/FRONTEND-EXPERIENCE-SPEC-v1.0.md` | Admin 采用左侧模块导航、顶部标题/用户区、主内容、全局反馈层；系统管理无空白概览页；状态矩阵覆盖 Loading、Empty、Ready、Permission denied、Unavailable、Error，并按需覆盖 Disabled、Partial。 | AFE-1 起复用该布局和状态语义，不自行新增运营看板或额外一级入口。 |
| MVP baseline | `docs/product/ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md` | Admin P0 覆盖模型、工具、机器人、技能、知识条件项、系统管理；反馈管理为 P1/Prototype。 | 分批计划以 P0 优先，P1 页面只保留 gated 骨架和明确标识。 |
| Tool spec | `docs/product/TOOL-MANAGEMENT-FEATURE-SPEC-v1.0.md` | Tool Management 真实接入依赖 TGM；HTTP/MCP 不能伪造保存、测试、启用、同步成功；Fixture 仅用于测试、视觉验收和明确 Prototype 场景。 | AFE-3 工具页默认通过 Adapter 读取 Projection；TGM 未接入时禁用或显示待接入，不做假成功。 |
| Admin prototype | `/Users/changzhengyi/Desktop/RoboThree/原型文件/管理端/admin.html` | 原型已使用六项一级导航，并将用户与权限、审计日志、反馈管理归入系统管理；同时存在本地数组、模拟保存、模拟测试、模拟删除和 Toast 成功。 | 原型仅作为视觉、信息结构和交互参考；其中本地持久化与假成功行为不得进入生产路径。 |
| ADR | `docs/adr/*.md` | Renderer/Browser 不直接访问 FS、数据库、Credential、系统命令；高权限行为通过受控边界；Admin 不承接 Desktop runtime 人工确认页；审计与错误不得泄漏 Secret、Prompt、Credential、内部句柄。 | Admin 前端只能通过未来真实 Projection 和 Adapter 获取事实，不自行推断权限、风险和最终决策。 |
| Contract | `docs/architecture/contracts/*.md`、`contracts/**/README.md`、`packages/contracts/README.md` | Enterprise Gateway、Enterprise Session、EIPC、Desktop Local Runtime 均要求 Secret、Token、Credential、签名材料和内部句柄不进入前端展示、日志和测试快照。 | Admin 类型只允许使用框架无关 Contract/Projection；禁止把 Credential 或 Token 值映射成展示数据。 |
| Desktop frontend | `apps/desktop/src/renderer/**`、`apps/desktop/tests/**` | Desktop 当前为 Vue 3.5、Vite、Vue Router、Vitest、Vue Test Utils；已有 Token、UI 组件、presentation、adapter、page state 测试模式。 | Desktop 保持 Vue 3 不变；Admin 独立使用 Vue 2.7.16，不共享 Vue runtime、Router、Store 或 `.vue` 组件。 |
| Current status docs | `README.md`、`CHANGELOG.md`、`docs/development/DEVELOPMENT-LOG.md` | Desktop 前端基础体验已完成收口；EIPC、DFI、TGM、Knowledge Provider、个人模型 Credential 链路仍有 gated 项；根版本不应在本批变化。 | AFE-0 只写方案，不更新版本和日志为已落地状态。 |

## 2. 文档与原型冲突清单

| 编号 | 冲突或不一致 | 正式口径 | AFE-0 处理 |
| --- | --- | --- | --- |
| C-01 | Admin 原型中存在本地数组写入、模拟保存、模拟测试、模拟删除和成功 Toast。 | Product/Tool spec 禁止未接真实后端时伪造创建、保存、测试、启用、安装、同步等业务结果。 | 生产方案禁止复制该行为；后续页面操作必须禁用、隐藏或明确显示待接入。 |
| C-02 | 原型中知识管理存在 provider endpoint、apiKey mask、lastTest 成功、文档数等演示数据。 | Knowledge Provider 未接入时只能显示条件项、Unavailable 或明确 gated 数据，不得暗示真实检索、测试或同步成功。 | 知识页只通过 Adapter 获取事实；Fixture 仅测试/视觉/Prototype 路径可用，并持续标注。 |
| C-03 | 原型 Tool/Knowledge 部分可展示 endpoint、credential mask 等配置细节。 | Secret、Credential、Token、API Key、内部路径和审计敏感数据不得进入普通展示、日志或快照；企业 Credential 永不回显。 | 详情页只展示安全摘要和 `configured` / `missing` / `unavailable` 等枚举状态，禁止展示任何真实 Credential Reference 字符串或其 mask。 |
| C-04 | 原型为单文件 HTML、内联样式与行为混合。 | Admin 工程必须独立目录、分层组件、Adapter、Projection、Fixture、测试门禁。 | 原型不作为代码迁移来源，仅作为布局和文案核对来源。 |
| C-05 | Frontend Spec 说明生产用户界面不应暴露内部 Prototype 字样；本批指令要求 Mock 页面持续标注 `prototype/gated`。 | 用户界面不暴露内部术语；工程与 QA 需要可检测 gated 标识。 | 页面可用中文展示“演示数据 / 待接入”；路由 meta、测试 id、QA evidence 使用 `prototype/gated` 标识。 |

结论：正式产品文档之间在六项一级导航上没有发现阻断冲突；原型与正式文档之间存在多处“模拟成功”和“演示敏感配置”冲突。因此 AFE-0 维持文档评审态，后续编码不得直接按原型行为复制。

## 3. 技术栈冻结方向与版本兼容矩阵

Admin Console 采用独立前端技术栈，基于公司团队能力、内部组件生态、交付和维护体系选择 Vue 2.7.16。Desktop 当前 Vue 3.5 工程保持不变，不为统一技术栈而降级。

| 层 | AFE-0 冻结方向 | 候选精确版本 | 兼容性要求 | AFE-1 前置门禁 |
| --- | --- | --- | --- | --- |
| Node | 继承 monorepo Node 24 基线 | `24.13.0` CI 基线，`>=24 <25` engine | 与 pnpm、Vite、Vitest、ESLint 兼容 | 运行 dependency preflight。 |
| pnpm | 继承 root 包管理器 | `11.11.0` | 与 workspace、lockfile 策略一致 | 不改 root package 和 lockfile，除非进入共享文件收口窗口。 |
| Vue | Admin runtime | `2.7.16` | 精确锁定，禁止 `^`、`~` | 验证 Vite、TS、测试、SFC 编译。 |
| Vue Router | Vue 2 路由 | `3.6.5` | 支持 route meta、beforeEach、hash/history mode | 验证权限守卫和 Not Found 行为。 |
| Vite | Admin 构建工具 | `5.4.21` 候选 | 不复用 Desktop Vite 8；优先选择与 Vue 2 plugin 已验证的版本 | 若与 Node 24 或 plugin 不兼容，停止并回到文档评审。 |
| Vue plugin | Vue 2 SFC 编译 | `@vitejs/plugin-vue2@2.3.3` 候选 | 必须支持 Vue 2.7 SFC、TS、CSS 处理；该插件已停止积极维护，纳入 EOL 风险治理。 | AFE-1 只做最小 SFC 编译证明。 |
| TypeScript | strict 类型检查 | `5.9.3` | 与 root 当前实际版本一致；所有 `.ts` strict | SFC 类型检查策略验证后冻结。 |
| Vitest | 单元/组件测试 | `2.1.9` 候选 | 与 Vite 5、happy-dom、VTU Vue 2 兼容 | 若需使用 root Vitest 4，必须先证明与 Vue 2 plugin 兼容。 |
| Vue Test Utils | Vue 2 组件测试 | `@vue/test-utils@1.3.6` | 仅用于 Admin；不得混用 Desktop VTU v2 | 最小组件、router、slot、event 测试通过。 |
| DOM env | 测试 DOM | `happy-dom@20.11.2` 候选 | 尽量与 root 当前实际版本一致 | 若 Vitest 2 不兼容，选择精确可用版本并记录原因。 |
| ESLint | 静态检查 | `eslint@9.39.5`、`typescript-eslint@8.64.0`、`@eslint/js@9.39.5` | 优先复用 root lint 基线和规则精神 | Vue 2 SFC lint 规则需单独验证。 |
| Prettier | 格式化 | `prettier@3.6.2` 候选 | 当前 root 未冻结 Prettier；Admin 引入需共享文件窗口 | AFE-1 仅在技术负责人批准后写入。 |
| Browser | 企业管理端临时验证下限 | Chrome/Edge 122+，Safari 17+；Firefox ESR 作为兼容观察项 | Admin viewport 下限 `1024x720`；移动端非 P0；该版本组只作为 AFE-1 preflight 下限，不作为长期安全基线。 | 正式支持策略采用企业批准版本或 current/N-2，经客户环境确认后冻结。 |

所有 Admin package 依赖必须使用精确版本字符串，禁止 `^`、`~` 静默漂移。`workspace:*` 仅可用于框架无关共享包，例如 Contract 类型包；不得借此共享 Vue runtime 或组件。

## 4. Vue 2.7.16 EOL 风险与治理

1. Vue 2 已停止官方维护，Admin 选择 Vue 2.7.16 是组织交付体系选择，不代表技术风险消失。
2. 公司需明确 Vue 2 运行时、编译链、测试链的内部维护责任；安全补丁、兼容补丁和扩展支持必须有负责人和升级窗口。
3. AFE-1 前必须完成依赖兼容矩阵验证；任何核心依赖不兼容都应停止页面编码。
4. 核心依赖精确锁定，禁止 caret、tilde 和隐式 minor 漂移；lockfile 变化必须进入共享文件收口窗口。
5. 支持浏览器基线以现代企业浏览器为准，不承诺 IE 或老旧 WebView；AFE-0 中的 Chrome/Edge 122+、Safari 17+ 只是临时验证下限，长期策略应采用企业批准版本或 current/N-2。
6. 每次依赖升级必须走漏洞扫描、变更评审、回归测试和 QA evidence；不得在功能批次中顺手升级。
7. 禁止随意引入停止维护的 Vue 2 插件；`@vitejs/plugin-vue2` 作为核心构建链例外进入固定矩阵和 preflight，其他新增插件必须证明维护状态、bundle 影响、安全面和 Vue 2.7 兼容性。
8. 未来迁移 Vue 3 的退出条件：内部组件生态完成迁移、Admin 路由与组件边界稳定、Vue 2 安全维护成本超过可接受阈值、业务页面有足够组件测试和视觉基线。
9. 本批不建设 Vue 2/Vue 3 双栈兼容层，不做跨端组件适配器。
10. 优先评估 Vue 2.7 内置 Composition API 与 `<script setup>`，但只有在 TypeScript、Vite、SFC 编译和 Vitest 组件测试全部验证后才可冻结为编码规范；否则使用 Vue 2.7 稳定 Options API + 严格 `.ts` 业务模块。

## 5. Desktop Vue 3 与 Admin Vue 2.7 隔离边界表

| 项 | Desktop | Admin | 共享策略 |
| --- | --- | --- | --- |
| Vue runtime | Vue 3.5，保持现状 | Vue 2.7.16，独立 runtime | 不共享 runtime，不互相 import。 |
| `.vue` 组件 | `apps/desktop/src/renderer/components/**` | 未来 `apps/admin-console/src/components/**` | 不共享 `.vue` 组件。 |
| Router | Desktop Router 现状 | Vue Router 3 | 不共享 router、route record、guard 实现。 |
| Store/状态 | Desktop Vue 状态流 | Admin 独立状态壳 | 不共享 store 或响应式对象。 |
| Design token | Desktop 已有 `tokens.css` | Admin 可规划同名语义 token | 仅共享 token 命名、色彩语义、间距规范；共享文件需单独窗口。 |
| 图标 | Desktop 当前图标规范 | Admin 复用图标命名与语义 | 可共享静态图标规范，不共享 Vue wrapper。 |
| 静态资产 | Desktop assets | Admin assets | 可共享资产规格和命名，不共享运行时代码。 |
| 产品术语 | 全端统一 | 全端统一 | 可共享词表、状态 label、术语规范。 |
| TypeScript 类型 | Contract/Projection | Contract/Projection | 只共享框架无关纯 TS 类型。 |
| 测试工具 | Vue 3 VTU v2 | Vue 2 VTU v1 | 不混用测试 utils。 |

## 6. Admin 独立工程目录规划

后续获得编码授权后，Admin 工程建议位于：

```text
RoboThree_workspace/apps/admin-console/
├── package.json
├── index.html
├── vite.config.mjs
├── vitest.config.mjs
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── src/
│   ├── main.ts
│   ├── app/
│   │   ├── App.vue
│   │   ├── router.ts
│   │   ├── navigation.ts
│   │   ├── permissions.ts
│   │   └── app-shell.ts
│   ├── adapters/
│   │   ├── admin-adapter.ts
│   │   ├── admin-api-adapter.ts
│   │   └── fixture-admin-adapter.ts
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   └── domain/
│   ├── pages/
│   │   ├── models/
│   │   ├── tools/
│   │   ├── robots/
│   │   ├── skills/
│   │   ├── knowledge/
│   │   └── system/
│   ├── presentation/
│   ├── styles/
│   ├── types/
│   └── fixtures/
└── tests/
    ├── unit/
    ├── component/
    ├── router/
    ├── accessibility/
    ├── static/
    ├── visual/
    └── e2e/
```

AFE-0 不创建该目录。AFE-1 若需要新增 package、lockfile 或 root workspace 相关变更，必须先进入独占共享文件收口窗口。

## 7. 构建、环境配置与部署边界

| 事项 | 冻结方案 |
| --- | --- |
| 构建产物 | Admin 为独立 SPA 构建产物，不打包进 Desktop renderer。 |
| 运行时边界 | Admin Browser 运行时只通过 Admin Adapter 调用未来 Central/Admin API；不访问 Desktop Preload、Electron IPC、Local Core 私有 API。 |
| 环境变量 | 仅允许非敏感 public 配置，例如 API base URL 的环境标识；Secret、Token、Credential、签名材料禁止进入 env、bundle、source map。 |
| 路由模式 | AFE-1 默认先以 Vue Router 3 hash mode 做静态部署安全验证；若 Central Admin hosting 明确提供 server rewrite，再切换 history mode。 |
| 部署 | AFE-0 不定义生产部署流水线；后续部署边界需由 Central 服务方式、认证入口和企业网关共同确认。 |
| Source map | 内部环境可开，生产需评估是否暴露路径和实现细节；错误上报不得携带 Secret、Token、Credential、内部路径或 stack 原文。 |
| Fixture bundle | Fixture/Fake Adapter 不能进入 production 默认路径；生产构建应通过静态扫描和 bundler alias 阻断。 |

## 8. 浏览器管理端安全基线

| 安全边界 | 冻结原则 |
| --- | --- |
| Session | 浏览器 JS 不持有 bearer token；生产认证优先使用服务端设置的 HttpOnly、Secure、SameSite Cookie 或等价不可被 JS 读取的会话机制。 |
| CSRF | 所有 mutation 请求必须有 CSRF 防护；可采用 SameSite Cookie + 服务端 CSRF token/双提交 Cookie/自定义防伪头等经安全评审的组合。 |
| 401/403 | 401 表示未登录或会话失效，进入登录壳或会话恢复；403 表示身份有效但权限不足，显示 Permission denied；前端不得把 403 伪装成 404。 |
| CSP | 生产由响应头提供 Content-Security-Policy；默认禁止不受控脚本源，禁止 inline script 依赖，按需使用 nonce/hash；生产 source map 暴露需单独审批。 |
| 点击劫持 | 生产响应头必须配置 `frame-ancestors` 或等价策略；Admin 默认不允许被第三方页面嵌入。 |
| XSS | 禁止 `innerHTML`、`v-html`、`eval`、动态 Function 和未审计 HTML 注入；富文本或审计摘要只能渲染经过白名单净化后的安全文本。 |
| URL | URL、query、hash、Router state 不得携带 Token、API Key、Credential、签名材料、内部路径或审计敏感字段。 |
| Logging | 前端日志和错误上报只记录 safe summary、correlation id 和非敏感状态；不记录原始 response、stack、headers、Cookie 或请求体。 |
| Headers | 生产需由服务端提供 `X-Content-Type-Options: nosniff`、合理 Referrer-Policy、CSP 和 frame policy；前端不得依赖 meta tag 代替服务端安全头。 |

上述安全基线不等待真实认证接口完成。AFE-1 只能实现壳和测试桩，不得在 Browser 内临时保存真实 bearer 或 Secret。

## 9. TypeScript strict 与 Vue SFC 类型检查

1. `tsconfig` 必须启用 strict，并禁止隐式 any、未使用危险逃逸和宽泛 unknown 直传展示层。
2. Adapter、Projection、permission、presentation、route meta、状态矩阵必须放在 `.ts` 模块中接受严格类型检查。
3. Vue SFC 只允许薄模板和事件绑定；复杂展示判断进入纯 presentation 函数。
4. Vue 2.7 `<script setup lang="ts">` 作为优先评估项，不在 AFE-0 冻结为默认写法。
5. AFE-1 需要完成最小 SFC 类型检查证明：基础组件、路由页面、slot、props、emits、computed、watch、test mount 全部通过。
6. 若 `vue-tsc` 或等价工具无法稳定覆盖 Vue 2.7 SFC，则必须在文档中记录限制，并把业务逻辑和类型约束前移到 `.ts` 层；页面编码继续 gated，直到替代检查方案明确。

## 10. 组件与样式分层

| 层 | 目标 | 示例 | 限制 |
| --- | --- | --- | --- |
| Design Token | 提供框架无关的颜色、字体、间距、阴影、状态语义。 | `--r3-color-text-primary`、`--r3-space-4`、`--r3-status-warning-bg` | 不包含业务逻辑，不依赖 Vue。 |
| Base UI | 最小可复用控件。 | Button、Input、Select、Table、Modal、Drawer、Tabs、Tooltip、Badge、Skeleton、EmptyState、InlineNotice | 不知道业务权限、Adapter、API。 |
| Domain Component | 业务对象展示片段。 | ModelStatusBadge、ToolRiskSummary、PermissionGate、AuditSafeSummary | 只接收 Projection/Presentation 数据，不直接 fetch。 |
| Page Component | 路由页面与布局组装。 | ModelListPage、ToolListPage、SystemUsersPage | 不持久化业务事实，不伪造成功。 |
| Presentation | 纯展示决策。 | status label、tone、empty copy、safe error summary | 纯函数，不导入 Vue、DOM、Preload、IPC。 |
| Adapter | 数据入口。 | AdminApiAdapter、FixtureAdminAdapter | 页面只能调用 Adapter，不散落 HTTP client。 |

## 11. 最小 Design Token Contract

AFE-1 可以微调具体色值，但不得改变 Token 层级和必备项。页面批次不得临场发明局部 token 或硬编码状态样式。

| Token 组 | 必备项 | 冻结语义 |
| --- | --- | --- |
| Surface | `surface.base`、`surface.subtle`、`surface.raised`、`surface.overlay`、`surface.inverse` | 页面背景、表格区域、浮层、遮罩和反色区域分离。 |
| Text | `text.primary`、`text.secondary`、`text.muted`、`text.inverse`、`text.danger` | 信息层级清晰；危险文本只用于真实风险或破坏性操作。 |
| Border | `border.default`、`border.subtle`、`border.strong`、`border.focus`、`border.danger` | 表格、表单、卡片、焦点和错误边框不混用。 |
| Action | `action.primary`、`action.primaryHover`、`action.secondary`、`action.disabled`、`action.danger` | 主操作、次操作、禁用、危险操作保持稳定。 |
| Semantic | `semantic.info`、`semantic.success`、`semantic.warning`、`semantic.danger`、`semantic.neutral` | 状态徽标和提示使用语义 token，不直接使用品牌色。 |
| Typography | `font.family.sans`、`font.size.12/14/16/20/24`、`lineHeight.tight/default/relaxed`、`font.weight.regular/medium/semibold` | 管理端默认 14px 正文；表格可用 12/14；标题不使用 viewport 缩放。 |
| Spacing | `space.0/1/2/3/4/5/6/8/10/12`，以 4px 为基线 | 表格、表单、栅格、弹窗、抽屉共用同一间距尺度。 |
| Radius | `radius.none`、`radius.2`、`radius.4`、`radius.6`、`radius.8`、`radius.round` | 卡片和输入默认不超过 8px；圆形仅用于头像、圆点或图标容器。 |
| Shadow | `shadow.none`、`shadow.popover`、`shadow.modal`、`shadow.drawer` | 只用于浮层层级，不做装饰阴影。 |
| Focus | `focus.ringColor`、`focus.ringWidth`、`focus.ringOffset` | 所有可交互控件必须有可见焦点环。 |
| Z-index | `z.dropdown`、`z.sticky`、`z.drawer`、`z.modal`、`z.toast`、`z.tooltip` | 浮层顺序固定，避免页面批次互相覆盖。 |
| Motion | `motion.duration.fast/default/slow`、`motion.easing.standard`、`motion.reduced` | 动效只用于状态反馈；支持 `prefers-reduced-motion`，关键功能不依赖动画。 |
| Breakpoint | `bp.adminMin=1024px`、`bp.desktop=1280px`、`bp.wide=1440px` | Admin P0 下限 1024x720；低于下限显示受限提示或降级布局。 |
| Table density | `table.rowHeight.compact/default`、`table.cellPaddingX/Y`、`table.headerHeight` | 列表页密度可扫读，hover/selection/loading 不改变行高。 |

## 12. 视觉与交互规范

| 类别 | AFE-0 冻结规范 |
| --- | --- |
| 字体 | 使用系统无衬线栈；中文优先清晰、紧凑、管理端可扫描。标题、表格、表单、状态文案层级固定，不用 viewport width 缩放字体。 |
| 颜色 | 采用中性管理端基调；语义色只用于危险、警告、成功、信息状态。避免单一紫蓝、深蓝、米棕等一色到底的主题。 |
| 间距 | 使用 4px 基线 token；表格和表单以密度、可扫读性优先，不做营销式大卡片布局。 |
| 状态 | Loading、Empty、Error、Disabled、Permission denied、Unavailable、Partial、Ready 均有统一组件和 copy 规则。 |
| 表格 | Admin 对模型、工具、机器人、技能、知识、用户、审计默认使用表格；固定列密度、分页、空态、错误态和权限态。 |
| 表单 | 标签、帮助文本、错误提示、只读字段、禁用字段分离；Secret 字段不回显，不进快照。 |
| 弹窗 | 只用于明确确认、短流程或不可中断任务；默认焦点、Esc、焦点回环和 aria 标题必测。 |
| 抽屉 | 用于详情补充、审计摘要、权限说明等非主流程信息；不承载复杂创建向导。 |
| 导航 | 六项一级导航；系统管理点击进入首个有权限二级页；无权限模块从菜单隐藏。 |
| 图标 | 使用熟悉符号表达操作，图标按钮必须有 tooltip 或 aria-label；不使用装饰性渐变球或无业务意义插画。 |

## 13. 模块、一级导航与二级路由映射表

| 业务模块 | 一级导航 | 二级路由/页面 | Route name 建议 | provisional 权限别名 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 模型管理 | 模型管理 | `/models` 列表、`/models/new` 创建、`/models/:modelId` 详情、`/models/:modelId/edit` 编辑 | `admin.models.list/detail/create/edit` | `model.read/create/update`，待 Contract 冻结 | P0；Credential 输入只交给未来安全 Adapter。 |
| 工具管理 | 工具管理 | `/tools` 统一列表、`/tools/:toolId` 详情、`/tools/:toolId/policy` 策略、`/tools/new/api` 连接 API、`/tools/new/mcp` 连接 MCP | `admin.tools.list/detail/policy/connectApi/connectMcp` | `tool.read/create/update/policy`，待 Contract 冻结 | P0/Gated；TGM 未接入时操作禁用或待接入。 |
| 机器人管理 | 机器人管理 | `/robots` 列表、`/robots/new` 创建、`/robots/:robotId` 详情、`/robots/:robotId/edit` 编辑、`/robots/:robotId/review` 审核 | `admin.robots.list/detail/create/edit/review` | `robot.read/create/update/review`，待 Contract 冻结 | P0；四个限制开关默认关闭。 |
| 技能管理 | 技能管理 | `/skills` 列表、`/skills/new/upload` 上传解析、`/skills/:skillId` 详情、`/skills/:skillId/edit` 编辑、`/skills/:skillId/review` 审核 | `admin.skills.list/detail/upload/edit/review` | `skill.read/upload/update/review`，待 Contract 冻结 | P0；包事实只读，文件和 digest 不做敏感泄漏。 |
| 知识管理 | 知识管理 | `/knowledge` 列表、`/knowledge/new` 创建、`/knowledge/:knowledgeId` 详情、`/knowledge/:knowledgeId/edit` 编辑 | `admin.knowledge.list/detail/create/edit` | `knowledge.read/create/update`，待 Contract 冻结 | P0 Conditional；Provider 未接入显示 Unavailable/gated。 |
| 用户与权限 | 系统管理 | `/system/users`、`/system/users/:userId`、权限编辑子页 | `admin.system.users.list/detail/edit` | `system.user.read/update`、`permission.read/update`，待 Contract 冻结 | P0；权限事实来自 Projection，不由菜单推断。 |
| 审计日志 | 系统管理 | `/system/audit`、`/system/audit/:auditId` | `admin.system.audit.list/detail` | `audit.read`，待 Contract 冻结 | P0；不展示完整任务正文、Credential、Token、stack。 |
| 反馈管理 | 系统管理 | `/system/feedback`、`/system/feedback/:feedbackId` | `admin.system.feedback.list/detail` | `feedback.read/update`，待 Contract 冻结 | P1/Prototype；只处理用户反馈，不做通知发布。 |

系统管理不建设 `/system` 空白概览页。`/system` 路由仅根据真实权限 Projection 重定向到首个可访问二级页；若没有二级权限，显示 Permission denied 或 no-permission 页面。

## 14. 路由命名、权限元数据与 Not Found

Route meta 最小结构：

```ts
type ImplementationGate = 'planned' | 'prototype' | 'pageImplemented';
type ProvisionalPermissionAlias = string & { readonly __provisionalPermissionAlias: unique symbol };

type AdminRouteMeta = Readonly<{
  module: 'models' | 'tools' | 'robots' | 'skills' | 'knowledge' | 'system';
  navKey: string;
  systemSubKey?: 'users' | 'audit' | 'feedback';
  implementationGate: ImplementationGate;
  provisionalPermissionAlias?: ProvisionalPermissionAlias;
  operationAlias?: ProvisionalPermissionAlias;
  sensitiveSurface?: boolean;
}>;
```

静态 route meta 只能表达页面工程状态，不能表达后端能力或权限权威事实。`implementationGate` 表示页面是否已有壳、Prototype 或页面实现；它不得被解释为业务能力 Ready。

运行时能力必须来自真实 Adapter 提供的 Capability Projection：

```ts
type CapabilityProjection = Readonly<{
  capabilityKey: string;
  state: 'ready' | 'unavailable' | 'gated' | 'partial';
  safeReason?: string;
}>;
```

权限 key 在 Contract 冻结前均为 provisional alias，只能用于方案、测试桩和 UI 骨架命名；不得作为正式字符串常量写入共享 Contract 或后端协议。

路由守卫只做三类判断：

1. 登录壳是否具备未来身份 Projection。
2. route access 是否由真实权限 Projection 允许。
3. Capability Projection 是否表明后端能力可用；非 ready 页面显示对应状态，不继续执行业务操作。

Not Found 行为：

1. 未匹配路由显示统一 Not Found 页面，不暴露内部 route table。
2. 已知路由但无权限显示 Permission denied，不伪装成 Not Found。
3. 已知路由但后端能力未接入显示 Unavailable 或 gated 状态。
4. 未知对象 ID 由 Adapter 返回安全错误摘要，不 stringify 原始异常。

## 15. 登录壳、权限壳与操作权限边界

| 边界 | 定义 | 禁止事项 |
| --- | --- | --- |
| 登录壳 | 只承载身份加载、登录态缺失、会话失效和当前用户安全摘要。 | 不接收真实 Token，不把 Token 放入 Router state、URL、LocalStorage。 |
| 权限壳 | 根据未来权限 Projection 计算菜单、路由访问和页面状态。 | 不根据用户名、菜单是否可见、单条数据字段自行推断权限。 |
| 菜单可见性 | 用户无模块 read 权限时隐藏一级或二级菜单。 | 不用 disabled 菜单暗示有权限但不可用。 |
| 路由访问 | 直接输入 URL 时再次校验 route access。 | 不依赖菜单隐藏作为安全控制。 |
| 页面操作权限 | 每个按钮、表单提交、危险动作基于 operation permission 单独判断。 | 不因页面可读就默认允许编辑、启用、删除、测试。 |
| Gated 功能 | 未接后端或 Contract 未冻结时显示待接入/演示状态。 | 不做本地数组持久化或模拟业务成功。 |

## 16. Adapter、Projection、Fixture、Mock 与真实 API 边界

| 项 | 允许 | 禁止 |
| --- | --- | --- |
| Page | 调用 Adapter 方法、渲染 Presentation 输出。 | 直接 `fetch`、散落 HTTP client、读取 Token、Credential、内部路径。 |
| Adapter | 封装真实 API、错误归一化、Projection 映射。 | 返回原始异常、stack、Secret、未脱敏审计原文。 |
| Projection | 作为 UI 业务事实来源，字段需来自 Contract 或正式后端 Projection。 | 前端凭用户名、菜单、单条记录自行拼装权限事实。 |
| Fixture | 用于测试、视觉验收、明确 Prototype/gated 场景；只使用假值。 | 混入 production 默认 bundle 或默认运行路径。 |
| Mock 页面 | 持续标注 `prototype/gated`，用户文案使用“演示数据 / 待接入”。 | 宣传为真实知识检索、真实连接、真实测试或真实保存。 |
| 真实 API | 通过 `AdminApiAdapter` 单入口接入，错误输出为 safe summary。 | 操作失败后静默 fallback 到 Fixture。 |
| 持久化 | 真实业务持久化只来自后端。 | 使用 LocalStorage、SessionStorage、IndexedDB 或前端数组伪装业务持久化。 |

## 17. 页面状态矩阵

| 状态 | 触发条件 | 页面行为 | 操作行为 | 测试要求 |
| --- | --- | --- | --- | --- |
| Loading | 身份、权限、列表、详情或 Projection 加载中。 | Skeleton 或 Spinner；保留布局稳定尺寸。 | 禁用提交与危险操作。 | 验证 aria busy、布局不跳动。 |
| Empty | 请求成功但无可展示记录。 | EmptyState 展示安全说明和允许的下一步。 | 若 create 权限且后端 ready，可显示创建入口；否则隐藏或禁用。 | 验证文案不暗示不存在的业务结果。 |
| Ready | Projection 完整可用，且 Capability Projection 为 ready。 | 显示列表/详情/表单。 | 只显示当前权限允许且运行时能力 ready 的操作。 | 验证菜单、路由、按钮权限分离。 |
| Unavailable | 后端能力、Provider、TGM、Credential 链路未接。 | 显示待接入原因和安全说明。 | 禁用或隐藏真实操作。 | 验证不触发 Adapter mutation。 |
| Permission denied | 身份有效但权限 Projection 不允许。 | 显示无权限页面，不泄漏对象细节。 | 全部业务操作不可用。 | 直接访问 URL 与菜单隐藏都覆盖。 |
| Error | Adapter 返回安全错误摘要。 | 展示 safe summary、retryable 建议。 | 按错误类型允许重试，不允许继续危险操作。 | 验证不 stringify error、不展示 stack。 |
| Disabled | 权限允许但状态、配置或 feature gate 不允许操作。 | 控件禁用并给出简短原因。 | 禁用 submit/test/enable/delete 等。 | 验证 disabled reason 和 aria-disabled。 |
| Partial | 列表或详情部分字段不可用。 | 显示可用数据和局部提示。 | 只允许不依赖缺失字段的安全操作。 | 验证缺失摘要不被猜测。 |

## 18. 敏感信息边界与检查清单

| 敏感项 | Admin 展示 | URL/Router | 存储 | 日志/错误 | 测试快照 |
| --- | --- | --- | --- | --- | --- |
| Secret | 禁止 | 禁止 | 禁止 | 禁止 | 禁止 |
| Credential | 禁止真实值；企业 Credential 永不回显 | 禁止 | 禁止 | 禁止 | 禁止 |
| Token | 禁止 | 禁止 | 禁止 | 禁止 | 禁止 |
| API Key | 禁止真实值和可还原 mask 派生 | 禁止 | 禁止 | 禁止 | 禁止 |
| 签名材料 | 禁止 | 禁止 | 禁止 | 禁止 | 禁止 |
| 内部路径 | 普通页面禁止 | 禁止 | 禁止 | 错误摘要禁止 | 快照禁止 |
| 错误 stack | 普通页面禁止 | 禁止 | 禁止 | 只可内部受控采集且脱敏 | 禁止 |
| 审计数据 | 只展示安全摘要 | 禁止敏感字段 | 不前端持久化 | 不记录原文 | 只用假值 |
| Prompt/任务全文 | 普通 Admin 不展示完整原文 | 禁止 | 禁止 | 禁止 | 禁止 |

安全策略：

1. Renderer/Browser 不持久化真实 Secret。
2. API Key、Token、Credential、签名材料不得进入 URL、Router state、LocalStorage、日志、错误信息、测试快照或 QA Evidence。
3. 企业 Credential 永不回显。
4. 普通错误页面不得 stringify 原始异常或展示 stack。
5. 权限状态不得由前端根据用户名、菜单或单条数据自行推断。
6. 所有权限事实必须来自未来真实 Projection。
7. Fixture 中只能使用明确假值，例如 `fixture-api-key-do-not-use`；不得诱导用户输入真实 Secret。
8. Admin UI 文案不得要求用户在未接安全链路前输入真实 Secret。

## 19. 文件允许/禁止范围

AFE-0 当前允许：

| 路径 | 操作 |
| --- | --- |
| `docs/development/frontend/AFE-0-ADMIN-FRONTEND-FOUNDATION-PLAN.md` | 新增独立详细方案文件。 |

AFE-0 当前禁止：

| 路径或类型 | 禁止操作 |
| --- | --- |
| `apps/admin-console/**` | 禁止创建 production 工程。 |
| root `package.json` | 禁止修改。 |
| `pnpm-lock.yaml` | 禁止修改。 |
| root TypeScript/Vite/ESLint 配置 | 禁止修改。 |
| `apps/desktop/**` | 禁止修改 Desktop。 |
| `apps/desktop/src/main/**`、`apps/desktop/src/preload/**`、Desktop IPC、Desktop Private Contract | 禁止修改。 |
| `services/core/**`、`services/central-service/**` | 禁止修改 Core 和 Central。 |
| `contracts/**`、`packages/contracts/**` | 禁止修改 Contract。 |
| 数据库 migration | 禁止修改。 |
| 版本、CHANGELOG、DEVELOPMENT-LOG | 禁止写为已落地状态。 |
| 依赖 | 禁止新增。 |

后续编码若获准，Admin 工程必须拥有独立目录、独立 package 和清晰文件所有权。涉及 root workspace、lockfile 或共享治理文档时，必须进入独占共享文件收口窗口。

## 20. 测试、视觉与可访问性门禁

| 门禁 | 覆盖范围 | 后续命令建议 |
| --- | --- | --- |
| Unit | presentation、permission、adapter mapping、state matrix、safe error。 | `pnpm --filter @robothree/admin-console test:unit` |
| Component | Base UI、Domain Component、Page shell、状态组件。 | `pnpm --filter @robothree/admin-console test:component` |
| Router | 六项一级导航、系统管理二级路由、权限守卫、Not Found。 | `pnpm --filter @robothree/admin-console test:router` |
| Accessibility | 键盘导航、焦点管理、aria-label、aria-disabled、modal focus trap、table header。 | `pnpm --filter @robothree/admin-console test:a11y` |
| Visual | 1024x720、1366x768、1440x900、窄宽度降级；表格、表单、弹窗、抽屉、状态页。 | Playwright screenshot 或等价视觉基线，需 AFE-1 工具确认。 |
| Static Scan | 禁止真实或疑似真实 Secret/Token/Credential/API Key/stack/路径进入 fixture、snapshot、presentation、bundle；Fixture 仅允许显式 fake/sentinel 值并通过 allowlist 校验；禁止 production import fixture；检查禁止 `innerHTML`、`v-html`、`eval` 和动态 Function。 | `pnpm --filter @robothree/admin-console test:static` |
| E2E | 登录壳、权限壳、路由、列表、详情、禁用操作、gated 页面。 | `pnpm --filter @robothree/admin-console test:e2e` |
| Build | Vite build、SFC compile、TS strict。 | `pnpm --filter @robothree/admin-console build` |
| Root gate | 与 monorepo 边界、架构脚本、共享文件一致性。 | `pnpm run check`，只在共享窗口运行和记录。 |

AFE-1 最小验收需先证明：Vue 2.7 + Vite + TS strict + VTU v1 + router guard + static secret scan 的最小闭环可运行。

## 21. 后续 AFE 分批计划、依赖与工期估算

| 批次 | 目标 | 主要依赖 | 独立 QA 门禁 | 工期估算 |
| --- | --- | --- | --- | --- |
| AFE-0 | Frontend Foundation 方案与工程门禁。 | 当前 PRD、Spec、MVP baseline、Tool spec、ADR、Contract、原型。 | 文档评审、冲突清单、边界清单。 | 0.5-1 天。 |
| AFE-1 | 工程骨架、路由壳、设计 Token、权限壳。 | 技术负责人编码授权；共享文件窗口；依赖 preflight。 | Build、TS strict、router tests、shell a11y、static scan。 | 3-5 天。 |
| AFE-2 | 通用列表、表单、状态和权限组件。 | AFE-1 工程稳定；设计 token 基线。 | Unit、Component、a11y、visual baseline。 | 4-6 天。 |
| AFE-3 | 机器人、技能、工具管理页面。 | 机器人/技能 Projection；TGM 接口成熟度；Tool spec。 | 路由、页面状态、权限、gated 操作、安全快照。 | 6-10 天。 |
| AFE-4 | 模型、知识、企业配置和发布治理页面。 | Enterprise Gateway、Knowledge Provider、Credential 链路、发布治理 Contract。 | Secret scan、Unavailable/Partial、表单权限、Adapter tests。 | 6-10 天。 |
| AFE-5 | 系统管理、用户权限、审计和反馈页面。 | EIPC 权限 Projection、审计 Projection、反馈 Scope。 | 权限分层、审计脱敏、P1 Prototype 标识。 | 5-8 天。 |
| AFE-6 | 真实 Adapter 收敛、全路由 E2E、视觉与安全收口。 | 后端真实 API、Contract 冻结、QA 数据。 | 全量 E2E、visual、安全扫描、root gate。 | 5-8 天。 |

总估算：29-48 个专注工作日，不包含后端 Contract、TGM、Credential、Knowledge Provider 或企业部署阻塞等待时间。具体拆分必须服从 PRD 和真实后端接口成熟度，不得用前端 Fixture 假装后端已经完成。

## 22. 未解决问题与阻断项

| 编号 | 问题 | 阻断影响 | 处理要求 |
| --- | --- | --- | --- |
| B-01 | Vue 2.7.16 + Vite + `@vitejs/plugin-vue2` + TypeScript 5.9 + Vitest 的精确组合尚未完成本地 preflight。 | 阻断 AFE-1 页面编码。 | 先做最小工程验证，失败则回到评审态调整矩阵。 |
| B-02 | Vue 2.7 SFC 类型检查工具链未最终确认。 | 阻断 `<script setup>` 和复杂 SFC 类型策略。 | 先验证 `vue-tsc` 或等价方案；不稳定则采用 Options API + `.ts` 严格分层。 |
| B-03 | Central/Admin API、Permission Projection、Audit Projection 尚未全部冻结。 | 阻断真实 Adapter 和权限壳生产行为。 | 等 Contract/Projection 成熟；Fixture 仅测试和 Prototype。 |
| B-04 | TGM 尚未接入。 | 阻断 Tool 连接、保存、测试、启用等真实行为。 | 工具页面显示 gated/待接入，操作禁用或隐藏。 |
| B-05 | Knowledge Provider 未定义或未接入。 | 阻断真实知识管理、连接测试、检索结果。 | 知识页保持 P0 Conditional 状态。 |
| B-06 | Credential、Token、企业密钥链路仍需后端和治理确认。 | 阻断模型/工具/企业配置的真实 Secret 输入与保存。 | 未接入前不得诱导输入真实 Secret。 |
| B-07 | 原型存在模拟成功和敏感配置展示。 | 直接迁移会违反正式文档。 | 编码前必须按本方案过滤原型行为。 |
| B-08 | Admin 部署方式和 route rewrite 未冻结。 | 影响 router mode、刷新行为和 Not Found。 | AFE-1 默认 hash mode 预案，等 Central hosting 确认后再调整。 |
| B-09 | 企业认证和浏览器安全响应头尚未有真实接口与部署配置。 | 阻断生产登录壳、安全 mutation 和生产发布。 | AFE-1 只能做壳和测试桩；真实接口冻结前不得让 Browser 保存 bearer。 |

## 23. P0-P3 自检

| 级别 | 数量 | 项目 |
| --- | --- | --- |
| P0 | 0 | Revision 1 仍为文档方案，未触碰代码、依赖、版本、日志或运行时。 |
| P1 | 0 | 未发现文档级 P1；真实能力、权限、TGM、Knowledge Provider、Credential/Token、认证安全头仍列为后续工程阻断项。 |
| P2 | 0 | 已吸收评审中的四项 P2：浏览器安全基线、静态 meta 与运行时 Projection 拆分、准确文件路径、最小 Token Contract。 |
| P3 | 0 | 已吸收评审中的两项 P3：Credential Reference 展示收敛为枚举状态；浏览器版本改为临时验证下限并纳入企业支持策略。 |

## 24. Claude Code 过程文档评审请求

请 Claude Code 只做过程文档评审，不进入编码。重点复核：

1. 基线事实是否与 PRD v1.6 Final、Frontend Spec、MVP baseline、Tool spec、ADR、Contract 一致。
2. 六项一级导航与八个业务模块映射是否正确，系统管理是否未产生空白概览页。
3. Vue 2.7.16 EOL 风险、精确依赖矩阵、Desktop/Admin 隔离边界是否足够明确。
4. Adapter、Projection、Fixture、Mock 与真实 API 边界是否阻断假成功和前端伪持久化。
5. Secret、Credential、Token、API Key、内部路径、错误 stack、审计敏感数据检查清单是否完整。
6. AFE-1 到 AFE-6 的分批是否受真实后端接口成熟度约束，没有用 Fixture 替代业务事实。

Claude Code 复核通过后，仍需技术负责人确认 AFE-0 大节点并单独授权后续编码。
