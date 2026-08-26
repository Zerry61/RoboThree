# AFE-2 Admin Common Components & Page State Foundation 详细方案

状态：DOCUMENT PLAN ONLY / CODING GATED  
日期：2026-08-25  
负责人：Codex 5.6  
范围：RoboThree Admin Console 前端通用组件、页面状态、权限操作展示与测试门禁方案。  
当前动作：仅输出文档评审材料，不编码，不修改运行时代码、依赖、版本、CHANGELOG 或 DEVELOPMENT-LOG。  
上游依据：AFE-0 Revision 1 `PASS/CLOSED`；AFE-1.0 Revision 1.1 `PASS/CLOSED`；P0-A `P0A_PRIMARY_CONFORMANT`；P0-B `P0B_WORKSPACE_CONFORMANT`；AFE-1.1 `PASS/CLOSED`；`apps/admin-console/**` 已成为正式 Admin 前端工程。

## 1. 目标

AFE-2 的目标是在已完成的 Admin scaffold / route shell / permission shell 基础上，建设可复用的管理端通用组件与页面状态基础，为后续 Catalog、Agent、Skill、Tool、模型、知识和系统管理页面提供一致的前端结构。

本批仍不实现业务闭环。组件可以展示 `unavailable`、`gated`、`partial`、`permissionDenied`、`disabled` 等安全状态，但不得伪造创建、保存、发布、安装、测试、同步或检索成功。

| 编号 | 目标 | 成功判定 |
| --- | --- | --- |
| G-01 | 扩展状态组件基础。 | Loading / Empty / Error / Disabled / Permission denied / Unavailable / Partial / Ready 八态组件化，presentation 穷尽检查。 |
| G-02 | 建立通用列表与表格组件基础。 | 表格 header/body/empty/loading/error/disabled/pagination shell 可复用，状态不改变行高或布局。 |
| G-03 | 建立通用表单与字段组件基础。 | Field、Input、Select、Checkbox、ReadonlyField、SecretStatus 等只承载 UI 与安全状态，不保存真实业务数据。 |
| G-04 | 建立弹窗与抽屉 shell。 | Modal / Drawer 只提供无业务语义的基础交互、焦点管理和 aria 结构，不承载真实 destructive 操作。 |
| G-05 | 建立权限操作展示组件。 | 菜单可见性、路由访问、页面内操作权限继续分离；操作入口只接收明确 projection/presentation，不自行推断权限。 |
| G-06 | 扩展静态扫描与组件测试。 | 禁止 sensitive fields、unsafe DOM、direct fetch、Fixture production import；新增正反向扫描样例。 |
| G-07 | 保持 Vue 2/3 与工程边界隔离。 | Admin 只解析 Vue 2.7.16，Desktop 保持 Vue 3.5；root check 和 Desktop 回归不受影响。 |

## 2. 非目标

1. 不实现真实登录、SSO、Session Lease、CSRF token 获取或生产身份能力。
2. 不实现真实 Admin API Adapter、HTTP client、Central Controller、Contract、Projection 或 migration。
3. 不实现任何业务 CRUD：模型、工具、机器人、技能、知识、用户、权限、审计、反馈均保持 shell / gated / unavailable。
4. 不接 TGM、Knowledge Provider、Credential、API Key、Token、Tool test、Skill upload、Artifact 或 Workspace 授权。
5. 不修改路由信息架构，不新增第七或第八个一级导航。
6. 不改 Desktop 客户端前端、Electron Main、Preload、IPC、Core、Central、Document Worker、Contract 或数据库。
7. 不新增依赖，不修改 root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`。
8. 不引入 Playwright、图标库、状态管理库、表格库、表单库或 Vue 2 停止维护插件。

## 3. 当前代码事实

| 类别 | 当前事实 | AFE-2 采用口径 |
| --- | --- | --- |
| Admin package | `apps/admin-console/package.json` 为 `@robothree/admin-console@0.0.0-afe.1.1`。 | AFE-2 只在该工程内演进，不重新 scaffold。 |
| 技术栈 | Vue `2.7.16`、Vue Router `3.6.5`、Vite `6.4.3`、Vitest `4.1.10`、VTU `1.3.6`、vue-tsc `3.3.11`。 | 版本保持不变，禁止本批升级或新增依赖。 |
| 现有组件 | 已有 `AdminShell`、`TopBar`、`NavLink`、`SystemSubNav`、`PageState`、`InlineNotice`、`SafeErrorState`、`AdminButton`、`AdminBadge`、`InputShell`、`TableShell` 等最小壳。 | AFE-2 是扩展和规范化，不重写布局壳。 |
| 状态类型 | `AdminPageStatus = loading / empty / ready / unavailable / permissionDenied / error / disabled / partial`。 | 继续使用该八态，新增状态必须触发 TypeScript 穷尽检查。 |
| Presentation | 已有 `page-state-presentation.ts` 与 `safe-error-presentation.ts`。 | 新增展示逻辑继续放在纯 TS presentation 模块，不导入 Vue、DOM、Adapter、Preload 或 IPC。 |
| Adapter | production 默认 `UnavailableAdminAdapter`，`FixtureAdminAdapter` 不进入默认路径。 | 页面和组件不得直接 fetch，不得散落 mock 数组。 |
| 权限壳 | `visibleMenuAliases`、`routeAliases`、`operationAliases` 三层分离。 | AFE-2 只消费 operation-level 决策，不改变权限来源或 Contract。 |
| Design Token | 已有 surface/text/border/action/semantic/typography/spacing/radius/shadow/focus/z-index/motion/table token。 | 可补最小组件 token，但不得临场硬编码业务状态色。 |

## 4. 文件允许与禁止范围

### 文档评审阶段

当前只允许新增本方案文件。不得修改代码、测试、依赖、版本、CHANGELOG 或 DEVELOPMENT-LOG。

### 若后续获得编码授权

| 允许路径 | 用途 |
| --- | --- |
| `apps/admin-console/src/components/**` | 通用 state / ui / layout-shell 组件。 |
| `apps/admin-console/src/presentation/**` | 纯展示决策、状态文案、tone、ARIA 数据、组件 meta。 |
| `apps/admin-console/src/styles/**` | Admin component token 与基础样式，限现有设计系统范围内。 |
| `apps/admin-console/src/types/**` | 框架无关 UI presentation 类型。 |
| `apps/admin-console/src/fixtures/**`、`apps/admin-console/fixtures/**` | 测试、视觉、静态扫描 fixture，必须 fake/sentinel。 |
| `apps/admin-console/tests/**` | unit / component / accessibility / static / typecheck 测试。 |
| `apps/admin-console/scripts/static-scan.mjs` | 仅在敏感扫描规则需要扩展时修改。 |

| 禁止路径 | 原因 |
| --- | --- |
| `apps/desktop/**` | Desktop 客户端前端不是本批范围。 |
| `apps/desktop/src/main/**`、`apps/desktop/src/preload/**`、Desktop IPC / private contracts | Admin Browser 不依赖 Electron。 |
| `services/core/**`、`services/central-service/**` | AFE-2 不接后端、不接 HTTP runtime。 |
| `packages/contracts/**`、`contracts/**`、`docs/architecture/contracts/**` | 本批不冻结新 Contract。 |
| `services/document-worker/**` | PTX / Document Worker 不在本批。 |
| `migrations/**`、Central migration 目录 | 无数据库变更。 |
| root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` | 本批不新增依赖或 workspace 配置。 |
| `README.md`、`CHANGELOG.md`、`docs/development/DEVELOPMENT-LOG.md` | 仅编码完成后按收口窗口更新；方案评审阶段不改。 |

## 5. 组件分层

| 层 | AFE-2 规划 | 禁止 |
| --- | --- | --- |
| `components/state` | 页面状态、局部状态、错误、安全空态、权限不足、不可用、部分可用、禁用原因。 | 展示原始异常、stack、headers、Token、Credential、Prompt、Tool payload。 |
| `components/ui` | Button、Badge、Table、Toolbar、Pagination shell、Field、Input、Select、Checkbox、Modal、Drawer、Tooltip shell。 | 直接持有业务 Adapter、真实 HTTP、LocalStorage、业务数组持久化。 |
| `components/layout` | 仅必要补强，例如内容区 header/action slot、responsive guard。 | 改六项一级导航、重做 shell 布局。 |
| `presentation` | 组件 tone、label、ARIA role、button state、empty/error copy、operation disabled reason。 | 导入 Vue、DOM、Preload、IPC、Adapter 实例或真实 API。 |
| `types` | UI-only 类型，例如 `AdminActionState`、`AdminListState`、`SecretDisplayStatus`。 | 冒充 Contract、Projection 或后端 capability key。 |

## 6. 页面状态矩阵

| 状态 | 展示规则 | 交互规则 | 测试重点 |
| --- | --- | --- | --- |
| Loading | Skeleton 或 busy block；保留页面标题、导航和可识别结构。 | 不允许提交操作；`aria-busy=true`。 | 不改变表格行高，不丢焦点。 |
| Empty | 仅当数据源明确 Ready 且结果为空时展示。 | 可展示安全的引导按钮，但未接后端时按钮 disabled/gated。 | 不把 Unavailable/Gated 伪装成 Empty。 |
| Ready | 表示组件或页面壳 ready，不表示真实业务接入。 | 操作仍需 operation permission 和 capability。 | 文案必须避免“业务已成功接入”。 |
| Unavailable | 真实能力、Adapter、Projection 或认证未接入。 | 操作禁用或隐藏，说明“待接入”。 | 默认 adapter 可稳定返回。 |
| Permission denied | 身份有效但权限不足。 | 不展示可执行入口；可保留返回导航。 | 403 不伪装 404，菜单/路由/操作分离。 |
| Error | safe summary + optional correlation id。 | 可提供安全重试入口，未接 API 时 disabled。 | 不 stringify error，不展示 stack。 |
| Disabled | 操作存在但当前不可用。 | button disabled，必须有安全原因和 aria-disabled。 | 点击不会触发假成功。 |
| Partial | 有部分壳层或只读信息，但关键能力 gated。 | 写操作禁用；局部状态明确。 | 不宣传完整能力可用。 |

## 7. 通用列表与表格

AFE-2 建议把现有 `TableShell` 扩展为可复用的 table foundation，但仍不接业务数据源。

| 组件 | 规划职责 | 边界 |
| --- | --- | --- |
| `AdminTable` | table role、caption、columns、rows slot、loading/empty/error/partial state slot。 | 不内置排序、筛选、业务列定义或 HTTP。 |
| `TableToolbar` | 标题、计数摘要、搜索输入 slot、筛选 slot、右侧 action slot。 | 搜索只是 UI shell；不得宣称真实检索。 |
| `TableEmptyState` | Ready+empty 场景的安全空态。 | Gated/Unavailable 必须走对应组件。 |
| `TablePagination` | page/size/total 的只读展示与 disabled controls。 | 不伪造 cursor、offset 或后端分页成功。 |
| `TableRowStatus` | row-level badge / disabled reason。 | 不从 raw entity 推断风险、权限或 Credential。 |

表格密度必须使用现有 token：`--r3-admin-table-row-height-*`、`--r3-admin-table-cell-padding-*`、`--r3-admin-table-header-height`。hover、selected、loading、disabled 不得改变行高。

## 8. 表单与字段

AFE-2 只建设表单基础控件和安全展示状态，不建设真实提交。

| 组件 | 规划职责 | 安全边界 |
| --- | --- | --- |
| `FieldShell` | label、help、error、required marker、disabled reason、slot。 | error 只接 safe message。 |
| `TextInput` | value、placeholder、disabled、readonly、invalid、aria-describedby。 | 不用于输入真实 Secret。 |
| `SelectShell` | option list、disabled、placeholder。 | option 来自 fixture/test 或 safe projection；不直接 fetch。 |
| `CheckboxShell` | boolean 设置 UI。 | 不把勾选结果持久化到前端数组。 |
| `ReadonlyField` | 安全只读摘要。 | 禁止展示 Token、Credential Reference、内部路径、Endpoint。 |
| `SecretStatus` | `configured` / `missing` / `unavailable` 枚举状态。 | 禁止 mask、last4、reference id、copy/reveal。 |
| `FormSection` | 分组标题、说明、slot。 | 不做业务 validation schema。 |

本批不提供 submit 成功、save 成功、test 成功、publish 成功或 sync 成功状态。任何 action slot 默认 disabled/gated，除非未来真实 Adapter 与权限 Projection 已冻结。

## 9. 按钮、徽标、提示与操作权限

| 组件 | 规划职责 | 测试要求 |
| --- | --- | --- |
| `AdminButton` | variant、size、loading、disabled、aria-label、icon slot。 | disabled/loading 时不 emit action。 |
| `AdminBadge` | neutral/info/success/warning/danger tone。 | tone 穷尽检查，文本不溢出。 |
| `InlineNotice` | info/warning/danger/success 安全提示。 | danger 不用于普通 gated。 |
| `OperationGate` | 接收 `allowed`、`disabledReason`、slot，决定按钮区显示/禁用。 | 不根据用户名、菜单或 route meta 自行判断。 |
| `ActionSummary` | 显示操作是否待接入、无权限或暂不可用。 | 不显示 raw permission key 给普通用户。 |

权限规则保持 AFE-1.1 三层分离：

```text
menu visibility != route access != operation permission
```

AFE-2 可以提供 UI 组件来消费 operation decision，但不得引入新的权限事实来源。

## 10. 弹窗与抽屉

AFE-2 可以建设 Modal / Drawer 基础壳，用于后续页面承载详情、确认和帮助信息；本批不承载真实业务操作。

| 组件 | 必备行为 | 非目标 |
| --- | --- | --- |
| `ModalShell` | `role=dialog`、`aria-modal=true`、标题 id、关闭按钮、Esc 关闭、焦点回到触发点。 | 不做真实删除/保存确认。 |
| `ConfirmDialog` | title、message、confirm/cancel slot；confirm 可 disabled/gated。 | 不输出“已确认/已删除/已保存”。 |
| `DrawerShell` | `role=dialog`、标题、关闭、宽度 token、焦点管理。 | 不承载复杂创建向导。 |
| `TooltipShell` | hover/focus 可读提示或 aria-label 补充。 | 不依赖 tooltip 才能理解关键安全信息。 |

若 happy-dom 无法可靠验证完整焦点回环，本批至少测试 aria 结构、初始焦点、Esc 关闭和关闭后回焦。完整键盘/视觉 E2E 等 AFE-3 或视觉工具授权后再做。

## 11. Adapter / Fixture / Mock 边界

| 类型 | AFE-2 允许 | 禁止 |
| --- | --- | --- |
| `AdminAdapter` | 继续作为页面获取业务事实的唯一入口。 | 组件直接调用 Adapter 或 HTTP。 |
| `UnavailableAdminAdapter` | production 默认安全路径。 | 返回 fake business list。 |
| `FixtureAdminAdapter` | 测试、视觉验收、显式 prototype/gated 场景。 | production 默认 import。 |
| Component fixtures | 只用于 Story-like tests 和 visual DOM samples。 | 进入 production bundle 或默认运行路径。 |
| Static scan fixtures | 正向注入真实/疑似敏感样例，反向 allowlist fake/sentinel。 | 使用真实 Secret 或客户数据。 |

组件测试中可以传入 fake rows、fake labels、fake statuses，但必须使用明确 sentinel 值，例如 `fake_model_alpha`、`admintest_aapi02_fixed_sentinel`，不得使用真实组织、真实 API Key、真实 endpoint 或真实 Credential 名称。

## 12. 敏感信息边界

AFE-2 必须继续拒绝以下内容进入组件 props、presentation output、DOM 文本、测试快照、日志或 fixture 默认路径：

- Token、Bearer、API Key、Private Key、Secret、签名材料；
- Credential value、Credential Reference 字符串、mask、last4、copy/reveal 材料；
- Provider endpoint、内部 URL、内部绝对路径、stack trace、headers、Cookie、request body；
- Prompt、Tool payload、raw observation、CapabilityLock、audit sensitive detail；
- 未验证身份 claim、浏览器自报用户、OS user、LocalStorage / SessionStorage / IndexedDB 持久化事实。

允许展示：

- 产品文案中的“凭据”“密钥”“权限”等普通中文术语；
- 类型名或测试名中的 `Credential` / `Token`，前提是不包含真实或疑似真实值；
- 固定 fake/sentinel allowlist；
- `configured` / `missing` / `unavailable` 等枚举状态。

## 13. 可访问性与布局验收

| 项 | 要求 |
| --- | --- |
| Landmark | 保留 Admin Shell 的 navigation / main 语义。 |
| Focus | 所有 button/input/select/dialog close 控件有可见 focus ring。 |
| Keyboard | Modal / Drawer 支持 Esc；禁用按钮不可触发 action；基础 tab order 可预测。 |
| ARIA | Loading `aria-busy`；Error/Permission denied 使用 alert；Dialog 标题关联。 |
| Text fit | 按钮、徽标、表格 cell、状态卡文案不溢出；长词使用 wrapping 或 max-width。 |
| Motion | 遵守 `prefers-reduced-motion` token；关键状态不依赖动画。 |
| Responsive | Admin P0 下限 `1024x720`；低于下限仅保证可读降级，不做移动端产品化。 |

AFE-2 不强制引入截图工具；若不引入 Playwright，必须用 component DOM 和 CSS class/token 断言覆盖结构、ARIA 和关键文案。

## 14. 测试计划

### Admin package 门禁

| 命令 | 目标 |
| --- | --- |
| `CI=true pnpm --filter @robothree/admin-console typecheck` | TS strict + Vue 2.7 SFC typecheck。 |
| `CI=true pnpm --filter @robothree/admin-console typecheck:negative` | 负向 typecheck fixture 仍有效。 |
| `CI=true pnpm --filter @robothree/admin-console build` | Vite production build。 |
| `CI=true pnpm --filter @robothree/admin-console test` | component / presentation / accessibility / static tests。 |
| `CI=true pnpm --filter @robothree/admin-console scan:static` | sensitive scan、unsafe DOM、direct fetch、fixture production import。 |
| `CI=true pnpm --filter @robothree/admin-console scan:deps` | Vue 2 依赖解析隔离。 |
| `CI=true pnpm --filter @robothree/admin-console smoke:dev` | dev startup + port release。 |

### Workspace 回归

| 命令 | 目标 |
| --- | --- |
| `CI=true pnpm install --frozen-lockfile` | 证明未引入 lockfile 漂移。 |
| `CI=true pnpm --filter @robothree/admin-console why vue` | Admin 只解析 Vue 2.7.16。 |
| `CI=true pnpm --filter @robothree/desktop why vue` | Desktop 只解析 Vue 3.5.x。 |
| `CI=true pnpm --filter @robothree/desktop build` | Desktop 客户端前端回归。 |
| `CI=true pnpm exec vitest run apps/desktop/tests` | Desktop focused tests 回归。 |
| `CI=true pnpm run check` | root lint/build/test/smoke/architecture boundary。 |

若本地 sandbox 因 loopback、Keychain 或 Electron 权限失败，必须如实标记环境限制，并在真实权限环境补跑；不得把 NOT RUN 记为 PASS。

## 15. 最小测试覆盖

| 测试域 | 必须覆盖 |
| --- | --- |
| State presentation | 八种 `AdminPageStatus` 穷尽；新增状态未处理时 TypeScript 编译失败。 |
| State components | Loading/Empty/Ready/Unavailable/PermissionDenied/Error/Disabled/Partial 的 role、aria、文案和 tone。 |
| Table components | loading、empty、ready rows、partial、permission denied、disabled action、pagination disabled。 |
| Form components | label/help/error/disabled/readonly/invalid；SecretStatus 只展示枚举。 |
| Button/action | disabled/loading 不 emit；operation denied 显示 safe reason；不展示 raw permission key。 |
| Modal/Drawer | aria dialog、title 关联、Esc close、close button、回焦基础行为。 |
| Adapter boundary | 组件不 import Adapter；页面仍只通过 Adapter；无 direct fetch。 |
| Fixture boundary | Fixture 不进入 production 默认路径；static scan 可检出违规 import。 |
| Sensitive scan | 正向注入 Token/API Key/private key/stack/internal path/Credential ref 检出；反向 fake/sentinel 不误报。 |
| Accessibility | navigation/main 保留，focus ring、aria-busy、alert/dialog role、button label。 |

## 16. 实施顺序建议

若后续获授权编码，建议按以下顺序执行：

1. 记录当前 Admin、Desktop、root 关键门禁基线。
2. 定义 `types/**` 与 `presentation/**` 中的 UI-only 数据结构和穷尽 mapping。
3. 扩展 `components/state/**`，补齐状态组件行为测试。
4. 扩展 `components/ui/**` 的 Button、Badge、Table、Field/Input/Select/Checkbox、SecretStatus。
5. 增加 Modal / Drawer shell 与可访问性测试。
6. 补充 OperationGate / ActionSummary，锁定操作权限展示边界。
7. 扩展 static scan 规则和正反向 fixtures。
8. 运行 Admin package 门禁。
9. 运行 Desktop Vue 3 隔离和 root check。
10. 完成实施报告；仅在编码收口窗口更新版本/CHANGELOG/DEVELOPMENT-LOG。

## 17. 工期估算

| 阶段 | 估算 |
| --- | --- |
| Presentation/types/state 组件 | 0.5～1 天 |
| Table / form / action 组件 | 1～1.5 天 |
| Modal / Drawer / accessibility | 0.5～1 天 |
| Static scan / tests / QA 修订 | 1～1.5 天 |
| Workspace gates / report | 0.5～1 天 |
| 合计 | 3.5～6 天 |

## 18. 后续分批关系

| 后续批次 | AFE-2 关系 |
| --- | --- |
| AFE-3 Catalog / Agent / Skill / Tool 页面 | 消费 AFE-2 的 table/form/state/action foundation，但仍需真实 Adapter/Projection gating。 |
| AFE-4 模型、知识、企业配置和发布治理页面 | 复用表格、字段、SecretStatus、Unavailable/Partial 状态。 |
| AFE-5 系统管理、用户权限、审计和反馈 | 复用 Permission denied、Audit safe summary、Table、Drawer。 |
| AFE-6 真实 Adapter/E2E/视觉安全收口 | 在 AFE-2 组件基础上接真实 Projection 和更完整视觉门禁。 |

AFE-2 不自动解锁 AFE-3～AFE-6，也不解锁 AAPI-0.3～0.4、TGM、Knowledge Provider、production identity 或任何后端能力。

## 19. 未解决问题与评审点

| 编号 | 问题 | 当前建议 |
| --- | --- | --- |
| O-01 | 是否本批引入图标库？ | 否。不新增依赖；按钮保留 text/icon slot，具体图标等设计系统或依赖窗口再定。 |
| O-02 | 是否引入 Playwright 视觉截图？ | 否。本批用 component DOM / ARIA / static scan；视觉 E2E 留给 AFE-6 或单独工具授权。 |
| O-03 | Modal / Drawer 是否过早？ | 建议只建无业务语义 shell 和 a11y 基线，避免后续页面重复造壳。 |
| O-04 | 是否抽象复杂 DataGrid？ | 否。先做轻量 Table foundation，不引入排序/虚拟滚动/列配置系统。 |
| O-05 | 是否更新版本和日志？ | 方案阶段不更新；编码完成并 QA 后再按仓库规则收口。 |
| O-06 | 是否允许页面接 Fixture 展示更多样例？ | 仅测试、视觉和显式 prototype/gated；production 默认路径仍 unavailable。 |

## 20. P0～P3 自检

| 等级 | 数量 | 说明 |
| --- | --- | --- |
| P0 | 0 | 未发现阻断方案评审的安全或范围冲突。 |
| P1 | 0 | 未触碰后端、Desktop、Contract、依赖或真实认证。 |
| P2 | 0 | Adapter、Fixture、权限、敏感信息、Vue 2/3 隔离均有明确门禁。 |
| P3 | 0 | 图标库、Playwright、复杂 DataGrid 均列为后续评审，不作为本批缺陷。 |

## 21. 评审结论请求

请求 Claude Code 和技术负责人评审：

1. 是否接受 AFE-2 只建设 Admin 通用组件、页面状态、表格/表单/弹窗/抽屉 shell，不做业务 CRUD。
2. 是否接受本批不新增依赖、不改 lockfile、不引入图标库或 Playwright。
3. 是否接受 Modal / Drawer 仅作为无业务语义基础壳进入 AFE-2。
4. 是否接受后续编码范围严格限定在 `apps/admin-console/**`，并以 Admin package 门禁、Desktop Vue 3 隔离和 root check 作为硬门禁。

本文件不构成编码授权。只有文档评审通过且用户明确授权后，才可进入 AFE-2 实施。
