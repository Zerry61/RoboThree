# AFE-6A Admin Read-only Experience Closure 详细方案

状态：PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED  
日期：2026-08-27  
负责人：Codex 5.6  
范围：RoboThree Admin Console 六模块真实只读数据展示体验收口。  
当前动作：AFE-6A 已完成实现、独立 QA 与用户接受；本文件作为已冻结方案与收口边界记录。  
Revision 1 修订：吸收 Claude Code 文档评审 R-1 到 R-6，补齐上游证据路径、当前页面实际路径、Prototype 路由 grep 前置、浏览器 Evidence 口径、lockfile digest 约束和 AAPI-0.4 回归自检。
关闭记录：用户于 2026-08-27 接受 Claude Code 独立 QA 结论，Admin Read-only Experience Closure 正式 `PASS/CLOSED`；mutation、Tool activation、TGM、Knowledge Provider、production identity、AAPI-0.5、Desktop v2 consumption、AFE-6B 继续 `GATED`。

## 0. 当前结论

AFE-6A 应替代原计划中直接推进 AFE-3B / AFE-3C Prototype 页面建设的顺序。

原因是当前代码事实已经变化：AAPI-0.4 已完成 Admin development/test read integration，六个模块已经具备真实 Adapter 与基础页面接线。继续沿用旧 AFE-3B / AFE-3C 的 Prototype 假设，会让前端在真实只读链路已经存在的情况下继续扩展演示壳，风险高于收益。

本批目标不是新增业务能力，而是把现有六模块只读页面收敛到可验收的管理后台体验：字段层级、状态语义、分页、详情、错误处理、可访问性、响应式、真实浏览器 E2E 和 Prototype/Fixture 依赖清理。

## 1. 上游事实

| 事实 | 当前口径 | 证据路径 |
| --- | --- | --- |
| AFE-1.1 | Admin Vue 2.7 工程、路由壳、权限壳、设计 Token 基线已完成。 | `docs/development/frontend/AFE-1.1-ADMIN-CONSOLE-SCAFFOLD-ROUTE-SHELL-DEVELOPMENT-PLAN.md`；`docs/development/frontend/AFE-1.1-ADMIN-CONSOLE-SCAFFOLD-ROUTE-SHELL-IMPLEMENTATION-REPORT.md` |
| AFE-2 | 通用 Table、Field、State、Modal、Drawer、OperationGate 等组件已完成。 | `docs/development/frontend/AFE-2-ADMIN-COMMON-COMPONENTS-PAGE-STATE-FOUNDATION-PLAN.md` |
| AFE-3A | Tool Prototype 页面已被用户接受并关闭，但其部分 Prototype 路由和 Fixture 在 AAPI-0.4 后需要重新评估。 | `docs/development/frontend/AFE-3A-ADMIN-TOOL-PAGES-FOUNDATION-IMPLEMENTATION-REPORT.md` |
| AAPI-0.4 | 六模块 real Adapter 与基础 read-only pages 已接入 development/test integration。 | `docs/development/AAPI-0.4-BROWSER-SECURITY-ADMIN-ADAPTER-DEVELOPMENT-TEST-INTEGRATION-PLAN.md`；`docs/development/AAPI-0.4-BROWSER-SECURITY-ADMIN-ADAPTER-DEVELOPMENT-TEST-INTEGRATION-IMPLEMENTATION-REPORT.md`；`docs/development/qa/aapi-0.4-claude-qa.md` |
| Production 默认路径 | 仍使用 `UnavailableAdminAdapter`，不得把 development/test integration 当作 production ready。 | `docs/development/AAPI-0.4-BROWSER-SECURITY-ADMIN-ADAPTER-DEVELOPMENT-TEST-INTEGRATION-IMPLEMENTATION-REPORT.md` |
| Production readiness | production identity、SSO、Admin Read HTTP、Browser security、Admin Adapter、mutation 均继续 GATED。 | `docs/development/qa/aapi-0.4-claude-qa.md` |

## 2. 目标

| 编号 | 目标 | 成功判定 |
| --- | --- | --- |
| G-01 | 六模块真实只读展示体验收口。 | Model、Robot、Skill、Tool、Knowledge、Audit 使用真实 Adapter 投影数据，中文字段和信息层级清晰。 |
| G-02 | 页面状态矩阵完整。 | loading、ready、empty、partial、gated、unavailable、permission denied、404、410、503、unknown error 都有安全展示。 |
| G-03 | 分页体验收口。 | cursor 不进入 URL/DOM；加载更多、加载中、stale cursor、部分结果均可被测试覆盖。 |
| G-04 | 详情页体验收口。 | 五个可详情模块明确处理 ready、403、404、410、503、unknown error；Audit 不伪造详情页。 |
| G-05 | 保留测试身份和非生产环境提示。 | 页面持续展示 test identity / non-production 语义，不暗示 production 管理能力已就绪。 |
| G-06 | 清理不再需要的 Prototype/Fixture 依赖。 | Tool Prototype 创建/策略页面依赖被删除或隔离为明确 GATED；production 默认路径不引用 Fixture。 |
| G-07 | 可访问性、响应式和视觉一致性。 | 键盘、ARIA、焦点、表格密度、移动布局、状态提示、对比度均有测试或 QA Evidence。 |
| G-08 | Adapter 边界保持。 | 页面不直接 `fetch`；不修改 Adapter Contract；不新增后端接口假设。 |

## 3. 非目标

1. 不新增、修改或删除 Adapter Contract。
2. 不接 mutation，不实现创建、保存、发布、安装、同步、删除、测试连接、索引或授权。
3. 不修改 Central、Core、Desktop、Main、Preload、IPC、migration、Contracts 或 Document Worker。
4. 不新增依赖，不修改 root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`。
5. 不把 development/test integration 说成 production ready。
6. 不使用 LocalStorage、SessionStorage、IndexedDB 或前端数组伪装业务持久化。
7. 不展示真实 Secret、Credential Reference、Token、API Key、Endpoint、内部路径、错误栈或原始审计 payload。

## 4. 文件范围

### 文档评审阶段

当前只允许新增或修订本方案文件。

### 后续编码若获授权

| 允许路径 | 用途 |
| --- | --- |
| `apps/admin-console/src/components/inventory/**` | 六模块只读列表、详情、分页、状态组件收口。 |
| `apps/admin-console/src/components/state/**` | 页面状态展示补强，不改变安全边界。 |
| `apps/admin-console/src/components/ui/**` | 复用 AFE-2 基础组件的必要小修。 |
| `apps/admin-console/src/pages/**` | 六模块页面入口、旧 Prototype 路由清理。 |
| `apps/admin-console/src/presentation/**` | 纯展示 mapping、中文文案、状态 tone、字段分组。 |
| `apps/admin-console/src/app/router.ts` | 仅清理过时 Prototype 路由或调整 read-only 路由元数据。 |
| `apps/admin-console/src/styles/**` | 仅用于响应式、表格密度、焦点和只读页面布局补齐。 |
| `apps/admin-console/tests/**` | component、router、adapter error、accessibility、security、integration 测试。 |
| `apps/admin-console/scripts/**` | 仅在静态扫描或 E2E harness 需要补规则时修改。 |
| `apps/admin-console/package.json` | 仅编码收口时更新 Admin package 版本，不新增依赖。 |

| 禁止路径 | 原因 |
| --- | --- |
| `packages/contracts/**` | AFE-6A 不修改 Contract。 |
| `services/core/**`、`services/central-service/**` | 不接新后端，不调整 Projection 来源。 |
| `apps/desktop/**` | Desktop 客户端前端不归本批。 |
| `apps/desktop/src/main/**`、`apps/desktop/src/preload/**` | Admin Browser 不依赖 Electron runtime。 |
| root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` | 不新增依赖或 workspace 配置。 |
| `README.md`、`CHANGELOG.md`、`docs/development/DEVELOPMENT-LOG.md` | 仅实现、QA、用户接受后在收口窗口更新。 |

## 5. 当前代码差异收口

| 区域 | 当前事实 | AFE-6A 处理 |
| --- | --- | --- |
| 六模块列表/审计页面 | 当前实际入口为 `apps/admin-console/src/pages/models/ModelsPage.vue`、`apps/admin-console/src/pages/robots/RobotsPage.vue`、`apps/admin-console/src/pages/skills/SkillsPage.vue`、`apps/admin-console/src/pages/tools/ToolsPage.vue`、`apps/admin-console/src/pages/knowledge/KnowledgePage.vue`、`apps/admin-console/src/pages/system/SystemAuditPage.vue`。这些页面按模块消费 read-only Adapter 投影，不是旧的空壳页面。 | 保留现有按模块分文件的 list/audit 页面，扩展分页、状态、partial、403/410/503 展示和中文信息层级。 |
| 五模块详情页面 | 当前实际入口为 `apps/admin-console/src/pages/models/ModelDetailPage.vue`、`apps/admin-console/src/pages/robots/RobotDetailPage.vue`、`apps/admin-console/src/pages/skills/SkillDetailPage.vue`、`apps/admin-console/src/pages/tools/ToolDetailPage.vue`、`apps/admin-console/src/pages/knowledge/KnowledgeDetailPage.vue`。Audit 当前没有详情 Adapter，也不应伪造详情页。 | 保留五个详情页面；404 不映射为 empty；增加详情专用状态、分区字段和安全 fallback。 |
| 共享 inventory 组件 | `apps/admin-console/src/components/inventory/ReadOnlyInventoryPage.vue` 与 `ReadOnlyInventoryDetail.vue` 仍是当前六模块页面可复用的共享实现层，列表列为名称、摘要、状态，错误映射较粗。 | 可以继续复用或拆薄共享组件，但编码应以模块页面入口为准，不按共享组件文件名误删真实页面。 |
| `read-only-inventory.ts` | 文案仍偏技术，有 raw enum 和英文 Provider 标签。 | 扩展为中文业务 presentation，穷尽模块映射与状态映射。 |
| Tool Prototype files | AFE-3A 页面、Fixture、presentation、tests 仍存在。 | 若无产品继续保留理由，删除 create/policy Prototype 路由和依赖；只保留真实 read-only Tool 列表/详情。 |
| Production 默认 Adapter | `UnavailableAdminAdapter`。 | 保持不变。 |
| Integration Adapter | `AdminApiAdapter` 只在 development/test integration 使用。 | 保持不变；AFE-6A 只消费现有 read-only 方法。 |

## 6. 页面与路由范围

| 一级导航 | 路由 | AFE-6A 状态 |
| --- | --- | --- |
| 模型管理 | `/models`、`/models/:modelId` | 只读列表和详情优化。 |
| 机器人管理 | `/robots`、`/robots/:robotId` | 只读列表和详情优化；不恢复旧 Prototype 创建/编辑。 |
| 技能管理 | `/skills`、`/skills/:skillId` | 只读列表和详情优化；不上传、不解析包。 |
| 工具管理 | `/tools`、`/tools/:toolId` | 只读列表和详情优化；清理或隔离 `/tools/new/*` 和 `/tools/:toolId/policy`。 |
| 知识管理 | `/knowledge`、`/knowledge/:knowledgeId` | 只读列表和详情优化；持续说明真实知识检索能力未接入。 |
| 系统管理 | `/system/audit` | 审计只读列表优化；不新增审计详情。 |

不新增一级导航。系统管理仍不建设无业务意义的空白概览页。

## 7. 信息层级与中文文案

本批遵循管理后台密度：安静、紧凑、可扫描，优先表格和分区详情，不使用营销式 hero 或装饰性卡片。

### 7.1 Model

| 展示层级 | 字段 |
| --- | --- |
| 主信息 | 模型名称、供应方、用途摘要、状态。 |
| 运行摘要 | 上下文窗口、新任务默认、凭据状态。 |
| 安全边界 | Credential 只展示 `已配置 / 未配置 / 暂不可用`，不展示 reference 或 mask。 |

### 7.2 Robot

| 展示层级 | 字段 |
| --- | --- |
| 主信息 | 机器人名称、简介、来源、生命周期。 |
| 治理摘要 | 审核状态、策略状态、发布修订。 |
| 资源限制 | 默认模型、技能、工具、知识四类 restriction summary。 |

限制语义必须对齐 DFI-3A：未设置限制、限制为空、限制非空三者不能混淆。

### 7.3 Skill

| 展示层级 | 字段 |
| --- | --- |
| 主信息 | 技能名称、说明、生命周期。 |
| 包摘要 | 包校验状态、校验说明。 |
| 安全边界 | 不显示本地路径、包内脚本、真实文件列表或执行结果。 |

### 7.4 Tool

| 展示层级 | 字段 |
| --- | --- |
| 主信息 | 工具名称、说明、来源、只读性。 |
| 治理摘要 | 风险摘要、策略状态、连接状态、健康状态。 |
| 安全边界 | 不展示 Endpoint、Credential Reference、Binding、Adapter、Schema digest、Runtime Handle。 |

Tool 的 `readOnly=false` 只能展示为“可能产生变更”，不得出现“可执行成功”“测试通过”等文案。

### 7.5 Knowledge

| 展示层级 | 字段 |
| --- | --- |
| 主信息 | 知识库名称、安全摘要、状态。 |
| 检索摘要 | 检索状态、可用性说明。 |
| 安全边界 | 页面持续说明真实知识检索能力待接入或当前仅为服务端投影状态，不展示上传、同步、索引成功。 |

### 7.6 Audit

| 展示层级 | 字段 |
| --- | --- |
| 主信息 | 操作摘要、操作者摘要、时间、结果。 |
| 安全边界 | 不展示审计正文、请求体、响应体、错误栈、Credential、Token、IP 原文或内部路径。 |

Audit 本批只做列表，不新增详情页。

## 8. 页面状态矩阵

| 状态 | 入口来源 | 列表展示 | 详情展示 | 禁止事项 |
| --- | --- | --- | --- | --- |
| Loading | 初次加载或翻页 | 表格 skeleton、`aria-busy=true`。 | 详情 skeleton。 | 不显示假数据。 |
| Ready | 成功返回且有数据 | 表格和安全摘要。 | 分区详情。 | 不宣称 mutation 能力。 |
| Empty | 列表成功返回 0 条 | 空状态，说明当前没有可展示记录。 | 不适用于详情。 | 详情 404 不映射为 empty。 |
| Partial | Projection 明确 partial 或部分字段缺失。 | 显示可用记录和 partial notice。 | 显示可用字段和 partial notice。 | 不补猜缺失字段。 |
| Gated | 能力被 gated 或页面尚未接入真实能力。 | GATED notice + disabled 操作。 | GATED notice。 | 不用 Fixture 伪装 ready。 |
| Unavailable | `business_rule_unavailable` 或能力 unavailable。 | 安全说明，可重试时显示重试。 | 安全说明。 | 不 stringify 原始异常。 |
| Permission denied | 403。 | 权限不足页面状态。 | 权限不足页面状态。 | 不根据菜单隐藏推断权限。 |
| Not found | 404。 | 不适用于列表。 | 资源不存在或不可见。 | 不显示“暂无数据”。 |
| Gone / stale cursor | 410 `stale_cursor`。 | 提示列表状态已变化，提供重新加载第一页。 | 提示详情已过期，返回列表或重新打开。 | 不重用旧 cursor。 |
| Service unavailable | 503。 | 服务暂不可用，显示 correlationId。 | 服务暂不可用。 | 不展示 stack。 |
| Unknown error | unknown parse/network。 | 固定安全 fallback。 | 固定安全 fallback。 | 不 JSON.stringify(error)。 |

## 9. 分页与 cursor

1. 列表默认继续使用 Adapter `limit` 和 `nextCursor`。
2. `nextCursor` 只保存在组件内存，不进入 URL、DOM、日志、测试快照或可复制文本。
3. “加载更多”必须有 loading、disabled、错误恢复和重复点击保护。
4. 410 `stale_cursor` 必须清楚提示“列表状态已变化”，并提供重新加载第一页的路径。
5. 翻页失败不得清空已展示的已成功数据，除非重新加载第一页。
6. 如果服务端返回 partial 语义，列表保留可展示项并显示 partial notice，不猜测缺失字段。

## 10. Prototype / Fixture 清理

AFE-6A 编码前必须先核实现状，再执行清理策略。前置核查命令：

```bash
rg -n "/tools/new|tools\\.new|tools/:toolId/policy|tools\\.policy|ToolApiCreatePage|ToolMcpCreatePage|ToolPolicyPage|tool-pages" apps/admin-console/src apps/admin-console/tests
```

若命令证明 `/tools/new/api`、`/tools/new/mcp`、`/tools/:toolId/policy` 仍在 `apps/admin-console/src/app/router.ts` 或页面测试中存在，AFE-6A 应按本节执行删除或明确隔离。若已经不存在，不得再创建同类 Prototype 路由。

清理策略：

| 项 | 建议处理 | 原因 |
| --- | --- | --- |
| `/tools/new/api` | 删除路由和页面，或改为明确 404/GATED 不展示入口。 | 本批只做真实只读体验，不能继续强化未接 mutation 的创建壳。 |
| `/tools/new/mcp` | 删除路由和页面，或改为明确 404/GATED 不展示入口。 | TGM 和真实 MCP 管理继续 GATED。 |
| `/tools/:toolId/policy` | 删除路由和页面，或改为只读详情内的治理分区。 | 策略保存未接入，避免假配置入口。 |
| `tool-pages` Fixture / presentation | 若删除路由，应同步删除不再引用的 Fixture、类型和测试。 | 清除不再需要的 Prototype 依赖。 |
| `FixtureAdminAdapter` | 继续保留测试/视觉用途，但不得进入 production 默认路径。 | AFE-1.1/AFE-2 边界继续有效。 |

建议采用“删除 Tool 创建和策略 Prototype 路由”的更清晰方案。若产品仍希望保留演示入口，应单独输出 Prototype 留存理由，并在页面和测试中持续标注 `prototype/gated`。

## 11. 安全与敏感信息边界

1. 页面不直接 `fetch`，只能通过 `AdminAdapter` 获取数据。
2. Browser 不持久化真实 Secret；不使用 LocalStorage、SessionStorage、IndexedDB 保存业务事实。
3. Token、API Key、Credential、Credential Reference、Endpoint、Bearer、Cookie、签名材料不得进入 URL、Router state、日志、错误文案、测试快照或 DOM 文本。
4. 企业 Credential 永不回显；状态只展示 `已配置 / 未配置 / 暂不可用`。
5. 普通错误页面不得展示原始异常、stack、raw response、HTTP body 或 `JSON.stringify(error)`。
6. Audit 不展示请求正文、响应正文、Prompt、Observation、内部路径或安全审计原文。
7. 权限事实仍来自 capability / permission projection；页面不得根据用户名、菜单、路由或单条数据自行推断权限。
8. Static scan 需要覆盖 source 文本、页面文本、positive injection 和 allowlist 反误报。

## 12. 组件与 presentation 设计

| 层 | 计划 |
| --- | --- |
| Presentation | 扩展 `read-only-inventory.ts` 或拆分为 `read-only-inventory-presentation.ts`、`inventory-state-presentation.ts`；保持纯函数，不导入 Vue、DOM、Adapter、Preload、IPC。 |
| Inventory Page | 保持组件负责状态流和 Adapter 调用，渲染 presentation 输出。 |
| Inventory Detail | 增加字段分组、详情状态和安全 fallback。 |
| State Components | 复用 `PageState`、`InlineNotice`、`SafeErrorState`，必要时增加只读 `InventoryNotice`。 |
| UI Components | 复用 AFE-2 `AdminTable`、`TablePagination`、`AdminBadge`、`ReadonlyField`、`OperationGate`。 |

状态映射和模块映射必须使用 TypeScript 穷尽检查。新增模块、状态或错误码未处理时，应在 typecheck 或测试阶段暴露。

## 13. 响应式、键盘与 ARIA

1. 桌面端优先高密度表格，移动端允许摘要列表或列折叠，但不得出现固定横向滚动作为唯一可读方式。
2. 表格必须有 caption 或等价 accessible name。
3. 详情页必须有唯一主标题，字段分组有语义标题。
4. Loading 使用 `aria-busy`；错误和 partial notice 使用可读区域，不强制打断输入。
5. “加载更多”“重新加载”“返回列表”必须可键盘访问，焦点样式符合 Design Token。
6. 动画遵守 `prefers-reduced-motion`。
7. 非生产/测试身份提示不可被滚动或响应式布局遮挡。

## 14. 真实浏览器 E2E

AFE-6A 默认不新增浏览器自动化依赖。现有 Admin integration build 和 loopback harness 只提供 integration bundle、HTTP/路由代理和安全拓扑证据，不等价于 Playwright / Spectron / electron-playwright 这类真实浏览器自动化。

本批默认证据组合为：

1. `build:integration` 生成 integration bundle。
2. loopback server 代理 `/admin/v1alpha1/**` 到测试服务或 fixture server，提供 HTTP/路由证据。
3. Vitest + happy-dom 覆盖六模块列表、五模块详情、分页、403、404、410、503 和 non-production notice 的组件行为。
4. QA 使用现有可用的浏览器控制能力或人工方式打开 integration 页面，采集视觉、响应式、键盘路径和状态截图 Evidence。
5. 实施报告明确区分 CI 自动测试证据和人工/半自动浏览器 Evidence，不把 loopback harness 声称为全自动浏览器 E2E。

如果当前工程没有可自动化的真实浏览器 harness，编码前必须在评审中明确二选一：

| 选项 | 影响 |
| --- | --- |
| A. 复用现有 integration build、loopback server、component/happy-dom 测试和人工/半自动截图 Evidence。 | 不新增依赖；CI 覆盖组件行为，浏览器视觉证据由 QA Evidence 补足。 |
| B. 单独授权新增 Playwright 或等价浏览器测试依赖。 | 需要独占依赖窗口和 lockfile 变更，本批默认不允许。若未来选择 B，必须遵守 AAPI-0.4 §6 lockfile 标准重算约束：before/after digest 唯一原因只能是新增浏览器测试依赖；CI 与本机 digest 必须复跑一致；`harness:aapi0.4` 的 `evidenceDigest` 和 readiness 证据不得因 AFE-6A 变化而漂移。 |

本方案默认选择 A；不得在未授权下新增浏览器测试依赖。

## 15. 测试计划

| 测试域 | 覆盖 |
| --- | --- |
| Presentation | 六模块列表/详情字段、中文标签、状态 tone、敏感字段禁入、穷尽检查。 |
| Page State | loading、ready、empty、partial、gated、unavailable、permission denied、404、410、503、unknown。 |
| Pagination | 初次加载、加载更多、重复点击保护、失败保留旧数据、stale cursor reload。 |
| Detail | 五模块详情 ready、403、404、410、503；Audit 不生成详情。 |
| Router | 删除或隔离过时 Tool Prototype 路由；六模块 read-only 路由仍可达。 |
| Adapter Boundary | 页面不直接 `fetch`；Fixture 不进 production 默认路径。 |
| Security Scan | source/page text positive injection、allowlist 反误报、no stack/no JSON.stringify。 |
| Accessibility | 表格 caption、heading、button name、aria-busy、focus order、keyboard。 |
| Responsive | 关键断点下表格/详情不重叠，非生产提示可见。 |
| Browser E2E | integration bundle 下真实浏览器覆盖六模块和错误状态。 |

## 16. 验证命令

编码完成后至少执行：

```bash
pnpm --filter @robothree/admin-console typecheck
pnpm --filter @robothree/admin-console typecheck:negative
pnpm --filter @robothree/admin-console build
pnpm --filter @robothree/admin-console build:integration
pnpm --filter @robothree/admin-console test
pnpm --filter @robothree/admin-console scan:static
pnpm --filter @robothree/admin-console scan:deps
pnpm --filter @robothree/admin-console smoke:dev
pnpm run harness:aapi0.4
pnpm --filter @robothree/desktop build
pnpm exec vitest run apps/desktop/tests
pnpm run check
```

若真实浏览器 E2E 通过独立 harness 执行，应把命令和 Evidence 路径写入实施报告。任何命令因环境限制未运行，必须标记 `NOT RUN`，不得记为 PASS。

## 17. 工期估算

| 阶段 | 估算 |
| --- | --- |
| 差异审计和清理清单确认 | 0.5 天 |
| Presentation 与状态矩阵 | 1.0 - 1.5 天 |
| 列表、详情、分页、错误展示 | 1.5 - 2.0 天 |
| Tool Prototype 依赖清理 | 0.5 - 1.0 天 |
| 可访问性、响应式、视觉一致性 | 1.0 天 |
| Browser E2E 与静态扫描补齐 | 1.0 - 1.5 天 |
| 门禁、报告、收口 | 0.5 天 |

总计：5.5 - 8.0 天。

## 18. 后续批次边界

AFE-6A 完成后只关闭 Admin read-only experience closure，不自动解锁：

1. mutation / create / edit / delete / publish；
2. Tool activation、MCP discovery、TGM；
3. Knowledge Provider、上传、同步、索引、真实检索；
4. production identity、SSO、Admin production read HTTP、Browser security；
5. AAPI-0.5 或 Adapter Contract 扩展；
6. Desktop Renderer 消费；
7. AFE-6B 或视觉重设计。

AFE-6A 编码完成后必须复跑 `pnpm run harness:aapi0.4`，并在实施报告中确认：

1. `productionAdminApiAdapterReachable=false`；
2. production identity、SSO、Admin Read HTTP、Browser security、Admin Adapter、mutation、TGM、Knowledge Provider、agent lifecycle 等 readiness 仍为 false；
3. `pnpm-lock.yaml` digest 与 AAPI-0.4 §6 after digest 一致，除非 §14 选项 B 已获得显式独占依赖窗口授权；
4. `harness:aapi0.4` evidenceDigest 不因 AFE-6A 的页面体验改动而漂移。

## 19. 未解决问题

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| O-01 | AFE-3A Tool Prototype 创建/策略路由是否删除？ | 建议删除，因 AFE-6A 只做真实只读体验。若保留，必须继续标注 prototype/gated。 |
| O-02 | 真实浏览器 E2E 是否允许新增依赖？ | 本批默认不新增依赖，先复用现有 integration/浏览器能力；如需 Playwright 单独授权。 |
| O-03 | Production 默认 `UnavailableAdminAdapter` 是否保持？ | 保持。AAPI-0.4 未关闭 production readiness，不得切 production 默认路径。 |
| O-04 | Audit 是否需要详情页？ | 不做。当前 Adapter 只有 list，不发明 audit detail。 |
| O-05 | 410 文案是否需要产品确认？ | 建议采用安全通用文案：“列表状态已变化，请重新加载”。 |

## 20. P0-P3 自检

| 级别 | 自检 |
| --- | --- |
| P0 | 无。方案不触碰后端、Contract、mutation、Secret 或 production identity。 |
| P1 | 无。Adapter Contract 不变，production 默认路径不变。 |
| P2 | 无。Revision 1 已关闭当前代码事实路径、上游证据路径、lockfile digest 约束三项文档精度问题。 |
| P3 | O-01 / O-02 需评审确认；Revision 1 已补齐浏览器 Evidence 口径和 AAPI-0.4 回归自检。 |

## 21. 评审请求

请评审并确认：

1. 是否接受 AFE-6A 替代直接推进旧 AFE-3B / AFE-3C Prototype 顺序。
2. 是否同意删除 Tool 创建/策略 Prototype 路由和相关 Fixture 依赖。
3. 是否接受本批默认不新增浏览器 E2E 依赖，仅复用现有 integration/浏览器能力。
4. 是否确认 production 默认 `UnavailableAdminAdapter` 保持不变。
5. 是否授权后续编码严格限制在 `apps/admin-console/**`，并在实现后再进入版本、CHANGELOG、DEVELOPMENT-LOG 收口。
