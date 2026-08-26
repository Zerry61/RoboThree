# RoboThree Desktop Frontend 正式开发计划

## 1. 文档状态

```text
阶段：DFE — Desktop Frontend Experience
状态：REVISION 1 ACCEPTED / DFE-0 PASS/CLOSED / DFE-1A PASS/CLOSED / DFE-1B PASS/CLOSED / DFE-2A PASS/CLOSED / DFE-2B PASS/CLOSED / DFE-3A PASS/CLOSED / DFE-3B PASS/CLOSED / DFE-4A PASS/CLOSED / DFE-4B PASS/CLOSED / DFE-5A.1 PASS/CLOSED / DFE-5B.1 PASS/CLOSED / DFE-5B.2 PASS/CLOSED / DFE-6.0 REVIEW PASS / DFE-6A PASS/CLOSED / DFE-6B PASS/CLOSED / DFE Frontend Experience Foundation PASS/CLOSED
日期：2026-08-21
范围：RoboThree Desktop Client Renderer 与必要的前端工程化
不包含：Admin Console、公共 Contract、Core/Central 业务语义、正式企业集成
```

本计划负责把已经确认的客户端产品基线和最新原型，落实为可持续维护的
Vue Desktop 前端工程。它不是新的产品设计，也不替代 PRD、Feature Spec、
Contract 或 ADR。

用户已接受 Revision 1 并单独授权 DFE-0。DFE-0 已完成 docs-only Living
Spec 和前端工程基线冻结，并经独立复核 `PASS（P0=0/P1=0/P2=0/P3=1）`；
唯一 P3（缺 DEVELOPMENT-LOG 条目）已补齐。DFE-1A 已完成开发者实现、独立 QA
和用户接受，正式 `PASS/CLOSED`。DFE-1B 已完成开发者实现、独立 QA 和用户接受，
正式 `PASS/CLOSED`；DFE-2A 已获用户单独授权并完成开发者实现，初轮独立 QA 为
`PASS（P0=0/P1=0/P2=1/P3=0）`，P2 repair 2 已通过独立复核并由用户接受，正式
`PASS/CLOSED`。DFE-2B 已获用户授权并完成开发者实现，独立 QA 为
`PASS（P0=0/P1=0/P2=0/P3=1）`，唯一 P3 作为 DFE-3A 设计系统 Modal 收口项处理，用户已授权进入
DFE-3A。DFE-3A 初轮独立 QA 因未授权 DFI workspace-browser Contract/Core 代码混入而失败（P1=2），
该 DFI 代码与测试已隔离，修复后 full check 回到 `176 files / 1203 tests PASS + 3 smoke`。
DFE-3A retest 已通过并获用户授权进入下一步，正式 `PASS/CLOSED`。DFE-3B 已获用户单独授权并完成
开发者实现，独立 QA 已通过并由用户授权进入 DFE-4A，正式 `PASS/CLOSED`。DFE-4A 已获用户单独授权并完成
开发者实现，独立 QA 已通过并由用户接受，正式 `PASS/CLOSED`。DFE-4B 已获用户单独授权并完成开发者实现，
初轮独立 QA 发现未授权 DFI-2A.2 后端持久化半成品混入；该 Port/Persistence/migration 残留已隔离，
复测 `PASS（P0=0/P1=0/P2=0/P3=0）`，并由用户正式接受关闭。用户随后授权 DFE-5.0 docs-only
冻结，用于明确设置、模型管理、知识中心和 P1 设置骨架的安全边界；DFE-5A.1、DFE-5B.1 与
DFE-5B.2 均已关闭。用户随后要求立即停止参与 DFI-4A.1，前端下一项只准备 DFE-6.0 Desktop
Closure Plan。DFE-6.0 Revision 1 为 docs-only inventory 批次，仍 `CODING GATED`；后续编码拆为
DFE-6A（现有接口真实数据收敛，优先接入 DFI-1B 工作空间文件树）与 DFE-6B（五导航视觉、键盘、状态矩阵和
remaining Mock inventory 最终收口）。DFE-6.0 Revision 1 已获复核 `PASS（P0=0/P1=0/P2=0/P3=2）`；
用户要求进入下一步，仅形成 DFE-6A 详细方案，不自动编码。每个后续编码批次仍需单独确认、
开发者自测、独立 QA 和用户体验验收；DFI-2～DFI-4 不因 DFE 推进自动解锁。

---

## 2. 事实来源与冲突规则

### 2.1 已核对事实源

| 优先级 | 事实源 | 当前状态 | 本计划的使用方式 |
| --- | --- | --- | --- |
| 1 | 已接受 Contract / ADR / 安全边界 | ACCEPTED | 决定状态所有权、IPC、文件、凭证和恢复边界 |
| 2 | `PRD-ROBOTHREE-MVP.md` v1.6 Final | FINAL | 决定 MVP 功能、术语、优先级和业务规则 |
| 3 | `FRONTEND-EXPERIENCE-SPEC-v1.0.md` | FINAL | 决定信息架构、通用状态、可访问性和全局交互 |
| 4 | `原型文件/客户端/index.html` | 当前最新确认原型 | 决定视觉、布局、密度、组件形态和页面细节 |
| 5 | `apps/desktop/src/renderer/**` | 已实现、需渐进迁移 | 复用真实数据接缝、Presentation 和安全能力 |
| 6 | 临时实现假设 | 非事实 | 只进入 Frontend Living Spec，不能静默固化 |

冲突时严格执行：

```text
Accepted Contract / ADR
> PRD
> 已确认模块 Feature Spec
> 全局体验 Spec
> 最新确认原型
> 临时实现假设
```

### 2.2 当前已识别差异

| 差异 | 处理结论 |
| --- | --- |
| 全局体验 Spec 固定五个一级导航，原型直接展示的主导航少于五个 | 按 PRD/Spec 实现“工作台 / 任务 / 智能中心 / 知识中心 / 设置”；复用原型的视觉和侧栏结构，不复制原型中的缺失导航 |
| 现有 Renderer 是深色渐变工作台，最新原型是浅色、中性、低干扰设计 | 最新原型为视觉事实源；现有深色样式只视为旧实现，不延续渐变、发光和营销式 Hero |
| 原型使用内联 Mock 与 DOM 脚本模拟成功 | 只提取交互意图，不复制 Mock 成功语义；正式工程区分 Mock Adapter 与 Core Adapter |
| 原型内部分 UI 仍出现 Agent/Model/Tool 等技术称呼 | 用户界面统一改为“机器人 / 模型 / 工具”等 PRD 术语；代码类型名继续使用技术名称 |
| 原型包含创建表单，但 Agent/Skill 真实创建、测试、固定包和发布仍有 Feature Spec 门槛 | 页面和 Mock 交互可以实现；真实保存、测试和发布接入继续 GATED |
| 当前 API 已有任务、确认、成果与预览接缝，但没有完整技能、工具、知识和个人模型 CRUD 接缝 | 有真实接缝的页面优先接真实 Projection；其余明确使用 Mock，不新增 IPC |

如果后续发现新的 PRD/Spec/原型冲突，只暂停受影响页面；不阻断其他无冲突批次。

---

## 3. 阶段目标

目标用户路径：

```text
启动 Desktop
→ 使用统一导航进入工作台
→ 选择项目空间、机器人、技能、模型和智能授权方式
→ 创建任务
→ 在任务列表和任务详情持续查看执行
→ 处理输入、确认、错误和恢复
→ 在右侧面板查看任务进程、工作空间文件和成果预览
→ 在智能中心浏览机器人、技能和工具
→ 在设置中管理模型
```

工程目标：

- 从单个超大 `main.ts` 迁移为明确的页面、组件、状态和 Adapter 边界；
- 从旧版页面级 CSS 迁移为从原型提取的语义化 Design Token；
- 保留现有 Desktop Main / Preload / Core 安全链路；
- 复用现有纯 Presentation 模块，不在 Vue 组件里重写业务状态解释；
- 允许 Mock 与真实 Projection 并行开发，但二者具有清晰、可测试的边界；
- 建立稳定的组件、键盘、状态、窗口尺寸和视觉验收基线。

---

## 4. 明确非目标

本阶段不做：

- 重新设计 RoboThree 视觉方向；
- Admin Console 页面开发；
- 修改公共 Contract、Desktop IPC 或 Core/Central 状态；
- 在 Renderer 建立 Task reducer、权限引擎或确认策略；
- 正式 Agent/Skill Package、发布审核或企业 SSO/RBAC；
- 真实 Personal Memory、Feedback 和 Knowledge Provider 接入；
- 前端直连文件系统、数据库、Shell、Provider 或 Central Service；
- 移动端布局、复杂多窗口、拖拽式工作流和运营 Dashboard；
- 为追求“高级感”增加渐变、玻璃拟态、夸张阴影或无意义动画。

---

## 5. 前端技术栈与工程约束

### 5.1 保持的技术基线

| 领域 | 技术 | 约束 |
| --- | --- | --- |
| Desktop | Electron 43 | Main / Preload / Renderer 继续隔离 |
| UI | Vue 3.5 | Composition API，页面与组件不直接解释 Core 内部事实 |
| 语言 | TypeScript 5.9 strict | 禁止用 `any` 绕过 Projection 与 ViewModel 边界 |
| 构建 | Vite 8 | 继续使用 `base: "./"` 兼容 Electron 本地资源 |
| 测试 | Vitest 4 | 保留现有 Presentation、IPC、Preload、E2E 与安全测试 |
| 样式 | CSS Custom Properties | Token 是唯一基础视觉值来源 |

### 5.2 DFE-1 拟新增的最小前端依赖

以下依赖须在 DFE-1A 编码授权时一并接受和完成供应链检查：

| 依赖 | 用途 | 选择理由 |
| --- | --- | --- |
| `@vitejs/plugin-vue` | 正式 Vue SFC 构建 | 让页面和组件从 `h()` 大文件迁移为可维护 SFC |
| `vue-router` | 五个一级导航、列表/详情/创建路由 | 使用 Electron 兼容的 hash history，不依赖服务端 rewrite |
| `@vue/test-utils` | 组件行为测试 | 验证 props、事件、ARIA、焦点和状态，而非只测纯函数 |
| `happy-dom` | Vitest DOM 环境 | 首期优先测试速度和轻量边界；若发现明确 DOM 兼容缺口，另行评审，不能在批次内静默切换为 `jsdom` |

`vue@3.5` 已是现有依赖，不属于本轮新增供应链范围。DFE-1A 只新增上表四项，
并必须同步完成精确版本锁、frozen lockfile、offline install 和依赖许可证检查。

首期明确不引入：

- Pinia；
- Tailwind CSS；
- 第三方完整 UI Component Library；
- 动画库；
- 图表库；
- Markdown `innerHTML` 渲染库；
- 自动生成业务页面的模板框架。

状态首期使用明确的 composable/controller 和只读 app-level store。只有出现多个
页面共享、跨路由恢复且现有方式无法清晰维护的真实需求，才评审 Pinia。

### 5.3 图标与资源

- 首期复用原型中已确认的本地 SVG/图形语义；
- 通过统一 `R3Icon` 组件管理尺寸、辅助名称和状态；
- 不在不同页面自行引入另一套图标；
- 原型中的 Emoji 只能作为已确认占位，不扩展成新的 Emoji 视觉体系；
- 引入第三方图标库前必须先确认与原型的一致性和许可证。

---

## 6. 目标 Renderer 结构

```text
apps/desktop/src/renderer/
├── main.ts                         # 只负责 bootstrap
├── app/
│   ├── App.vue
│   ├── router.ts
│   └── renderer-context.ts
├── legacy/
│   └── LegacyWorkbench.ts          # DFE-1A 机械承接既有 h() Renderer
├── layouts/
│   ├── DesktopShell.vue
│   └── SettingsLayout.vue
├── pages/
│   ├── workbench/
│   ├── tasks/
│   ├── intelligence/
│   ├── knowledge/
│   └── settings/
├── components/
│   ├── ui/                         # 稳定基础组件
│   └── domain/                     # 任务、成果、机器人等业务组件
├── controllers/                    # 页面协调，不持有第二套业务事实
├── presentation/                   # 继续保留纯 ViewModel / 文案映射
├── data/
│   ├── desktop-core-adapter.ts     # 只调用 Preload 白名单 API
│   ├── mock-adapter.ts             # 明确的演示数据
│   └── data-source.ts              # 页面依赖的类型化接口
├── mocks/
│   ├── fixtures/
│   └── scenarios/
└── styles/
    ├── tokens.css
    ├── reset.css
    ├── typography.css
    ├── utilities.css
    └── states.css
```

迁移规则：

- DFE-1A 先把现有 `main.ts` 业务 Renderer 机械迁入 `LegacyWorkbench.ts`，再由
  `App.vue` 的 legacy route 挂载；这一动作不改页面结构、业务行为、Preload 调用、
  Snapshot/Event、Artifact 或 Confirmation 语义；
- `main.ts` 不再承载页面布局、弹窗、业务操作和 HTML 预览；
- 现有 `presentation/**` 先保留、测试保持，全新组件消费其输出；
- Desktop API 只能在 Adapter/controller 层使用，基础组件不得访问
  `window.robothreeDesktop`；
- Mock Adapter 与 Core Adapter 实现同一前端数据接口，但 Mock 不能生成业务
  Receipt、权限或持久化成功事实；
- Task 状态、确认、成果生命周期仍以 Core Projection 为唯一事实源。

---

## 7. Design System 基线

### 7.1 从最新原型提取的首批 Token

以下值作为 DFE-1A 的提取基线；编码时允许语义化命名，不允许页面直接散落
同类硬编码值：

```text
Background           #fafbfc
Surface              #ffffff
Surface Hover        #f3f4f7
Surface Active       #e9ebf0
Border               #e4e6ec
Border Strong        #d0d3dc
Primary              #4f6ef7
Primary Hover        #3d5ce5
Primary Subtle       #eef1fe
Text                 #1a1d2e
Text Secondary       #5f6478
Text Tertiary        #9498a8
Text Placeholder     #b8bcc9

Font                 system-ui / PingFang SC / Microsoft YaHei
Font Size            12 / 13 / 14 / 15 / 18 / 22 px
Line Height          1.5
Radius               6 / 8 / 12 / 20 px
Sidebar              264 px expanded / 68 px collapsed
Composer Max Width   760 px
Page Max Width       1080 px; narrow 960 px
Motion               150 ms; respects reduced motion
```

成功、警告、危险和信息色只用于消息、风险、确认和错误；普通状态标签统一为
中性灰，不能重新引入“绿色成功标签 / 红色失败标签”的全局状态体系。

### 7.2 首批基础组件

DFE-1 只建立已确定会复用的组件：

- `R3Button`；
- `R3IconButton`；
- `R3Input` / `R3Textarea` / `R3Select`；
- `R3Tabs`；
- `R3Card`；
- `R3Tag` / `R3StatusBadge`；
- `R3Modal`；
- `R3Tooltip`；
- `R3PageHeader`；
- `R3SearchField`；
- `R3EmptyState`；
- `R3InlineNotice`；
- `R3Skeleton`；
- `R3Spinner`。

在第二处稳定复用出现前，不提前建立万能 Table、Form Builder、Resource
Renderer 或 JSON Schema UI。

### 7.3 组件状态

每个交互组件至少覆盖：

```text
default / hover / active / focus-visible / disabled / loading / error
```

页面状态组件至少覆盖：

```text
Loading / Empty / Ready / Permission denied / Unavailable / Error
```

`Disabled / Stale / Partial` 按模块标记为实现或 `N/A`。

---

## 8. 数据来源与接入矩阵

| 模块 | 当前可用真实数据 | 首批允许 Mock | 真实接入门槛 |
| --- | --- | --- | --- |
| Core 状态 | RuntimeStatus Projection | 无 | 已有 Contract |
| 项目空间 | list/create/revoke WorkspaceGrant | 默认空间视觉样例 | Workspace 文件规则继续专项冻结；智能授权产品语义已由 `WORKSPACE-AUTHORIZATION-FEATURE-SPEC-v1.0.md` 冻结，真实字段和 Core 接入仍 GATED |
| 任务/会话 | list/create/open/rename/delete Session；Conversation Snapshot | 快捷任务样例 | 置顶和物理删除按专项 Spec |
| 机器人选择 | Agent Projection | 卡片内容补充字段 | 不得前端计算可运行性 |
| 模型选择 | Model Projection | 未配置状态 | 真实个人模型 CRUD 需 Model Experience Spec/ADR-013 接缝 |
| 任务执行 | submitTurn、Task list/detail/control、durable Event | 无 | 已有 DCF-1/2 Contract |
| 用户确认 | Confirmation Projection/Command | 风险示例只用于组件场景 | 确认范围由 Core 决定 |
| 成果 | Artifact catalog/lifecycle/preview/open/export | 文件列表样例 | 工作空间树和任务删除关系按专项 Spec |
| 机器人列表/详情 | 当前仅有限 Agent Projection | 允许 | 完整 Projection/Feature Spec |
| 技能 | 无完整 Renderer API | 允许 | Agent/Skill Feature Spec + 类型化 Projection |
| 工具目录 | 任务内已有 Tool Activity，资源目录 API 不完整 | 允许 | Tool catalog Projection，不新增万能 execute |
| 知识 | 无完整 Renderer API | 允许 | Knowledge Provider Feature Spec |
| 个人模型管理 | 无正式 Renderer CRUD | 允许无凭证 UI | Model Experience Feature Spec；Mock 不接收真实 Key |
| 个性化/记忆/反馈/身份 | 无正式真实链路 | 只允许明确 Prototype | 各自专项 PRD/Spec/ADR |

Mock 展示必须使用开发场景标识；接入真实 Adapter 后删除对应 Mock，不能在同一
页面中无标识地混合真假数据。

Mock 构建规则：

- Mock Adapter 只允许服务 test、development scenario 或明确标记的 Prototype/GATED 页面；
- 已接真实 Projection 的正式页面禁止把 Mock 当作失败 fallback；
- 生产构建可以保留 Prototype/GATED 页面壳，但不得展示“保存成功 / 发布成功 / 测试成功”
  等虚假业务结果；
- DFE-6 必须输出 remaining mock inventory，逐项说明保留原因和真实接入门槛。

---

## 9. 开发批次

### DFE-0：前端基线与 Living Spec

状态：`PASS/CLOSED`。

交付：

- 建立 `FRONTEND-LIVING-SPEC.md`；
- 建立页面/路由地图；
- 建立组件、状态、Mock/Projection 映射表；
- 建立 `RoboThreeDesktopApiV1Alpha1 → Adapter → 页面` 反向消费矩阵；
- 建立原型视觉差异清单和截图验收清单；
- 冻结 DFE-1 的依赖清单、目录结构和边界测试；
- 冻结 `LegacyWorkbench` 机械迁移步骤与“不改业务行为”断言；
- 冻结 DFE-1A 允许修改的依赖、lockfile、Vite、tsconfig 和 `.vue` 类型文件清单；
- 冻结 Renderer 目录级安全扫描、Design System dev-only route 和生产 Mock 规则；
- 不修改生产 Renderer。

实现结果：

- 已建立 `docs/development/frontend/FRONTEND-LIVING-SPEC.md`；
- 已冻结页面/路由地图、API 反向矩阵、Mock inventory、Legacy Wrapper 迁移方案、
  DFE-1A 依赖窗口、SFC 类型配置、目录级安全扫描规则和视觉截图基线；
- DFE-0 未修改生产 Renderer、依赖、lockfile、Contract、IPC、Core 或 Central；
- DFE-1A 已完成实现并进入 `READY_FOR_INDEPENDENT_QA`。

退出门槛：

- PRD/Spec/原型/Contract 的已知差异均有处置；
- 所有 P0 页面明确真实、Mock 或 GATED；
- 五项 DFE-1A 前置（Legacy Wrapper、依赖窗口、SFC 类型、目录级边界测试、
  dev-only Design System）均达到可编码粒度；
- 无未处理 P0/P1 产品阻断；
- DFE-1A 获得用户单独授权。

### DFE-1A：SFC、路由、Token 与基础组件

状态：`INDEPENDENT QA PASS / USER ACCEPTED / PASS_CLOSED`。

交付：

- 引入并锁定最小依赖；
- 建立 SFC 与 hash router；
- 将既有 Renderer 机械迁入 `LegacyWorkbench.ts`，`main.ts` 收敛为 bootstrap；
- `tsconfig.renderer.json` 显式纳入 `.vue`，增加受控 `*.vue` 类型声明；
- 实现 Token、reset、typography 和基础状态样式；
- 实现首批基础组件；
- 建立 Design System 展示路由，只能在 `import.meta.env.DEV` 或显式 test fixture
  注册；生产 router table 不得包含该入口或 bulk mock fixture；
- 将原来只扫描 `main.ts` 的 Renderer boundary tests 迁移为
  `src/renderer/**/*.{ts,vue}` 目录级扫描，并对白名单 Adapter/controller 做精确约束；
- 保持现有正式业务入口和安全测试通过。

DFE-1A 独占的允许修改窗口：

```text
apps/desktop/src/renderer/**
apps/desktop/tests/**
apps/desktop/package.json
apps/desktop/vite.config.mjs
apps/desktop/tsconfig.renderer.json
pnpm-lock.yaml
docs/development/frontend/**
```

不得借该窗口修改 Main、Preload、IPC、公共 Contract 或 Core/Central。

不包含：任何业务页面重写、IPC 变化或真实数据接入扩张。

实现结果：

- `main.ts` 已收敛为 Vue bootstrap，既有工作台业务逻辑机械迁入
  `legacy/LegacyWorkbench.ts`；
- 引入 `vue-router`、`@vitejs/plugin-vue`、`@vue/test-utils` 和 `happy-dom`，
  并完成 lockfile 离线 frozen install 复核；
- 建立 hash router，生产路由仅包含 Legacy workbench，`/__design-system` 仅在 dev
  或显式 test fixture 中注入；
- 建立 token/reset/typography/utilities/states 样式分层和首批 `R3*` 基础组件；
- 新增目录级 Renderer boundary tests、router tests、SFC foundation tests；
- 保持 Main、Preload、IPC、Contracts、Core、Central 与业务页面语义不变。

独立 QA 与关闭结论：

- Claude Code 只读独立 QA 结论：`INDEPENDENT_QA_PASS`
  （P0=0 / P1=0 / P2=1 / P3=2）；
- 用户已接受并确认 DFE-1A 通过，DFE-1A 正式 `PASS/CLOSED`；
- P2-1：首批 R3\* 组件尚未被真实 `.vue` mount 测试覆盖。DFE-1B 编码前必须补齐
  Desktop 包内可执行 `.vue` mount 测试路径，并至少覆盖 props、事件、disabled/loading/error/
  focus 或键盘行为；
- P3-1：`main.ts` 历史 architecture marker 注释应在 DFE-1B 迁移收口后清理；
- P3-2：Desktop 版本口径建议从 DFE-1B 起建立独立版本治理。

退出门槛：

- Token 与最新原型一致；
- 基础组件覆盖键盘、焦点、禁用、Loading 和错误；
- 旧 Presentation 测试全部通过；
- 目录级 boundary tests 证明只有受控 Adapter/controller 能访问 Preload API，基础组件、
  页面展示组件、styles 和 mocks 不得访问；
- production build 证明 Design System 路由不可访问且不携带 bulk mock fixture；
- Renderer 不引入 Node/Electron/网络能力；
- 用户完成 Design System 视觉验收。

### DFE-1B：Desktop Shell 与五个一级导航骨架

状态：`INDEPENDENT QA PASS / USER ACCEPTED / PASS_CLOSED`。

交付：

- 左侧栏展开/收起；
- 工作台、任务、智能中心、知识中心、设置五个一级入口；
- 当前选中、键盘导航、Tooltip、用户入口；
- 页面容器、标题、滚动和 1180×760 / 900×600 适配；
- 页面切换不影响正在运行任务；
- 通用 Loading/Empty/Permission/Unavailable/Error 页面。

数据：应用壳使用真实 Runtime 状态；业务页面先使用明确 Mock 骨架。

实现结果：

- 已关闭 DFE-1A QA P2-1，新增可真实 mount `.vue` 组件的测试路径；
- 已关闭 DFE-1A QA P3-1/P3-2：移除 `main.ts` 历史 marker，并建立 Desktop
  `0.0.0-dfe.1b` 版本口径；
- 已实现 Desktop Shell、五个一级导航、侧栏展开/收起、当前选中、Tooltip、用户入口、
  页面容器、标题、滚动和通用状态 skeleton；
- 旧工作台进入 `/workbench`，通过 `KeepAlive` 保持页面切换不重建旧工作台实例；
- `/tasks`、`/intelligence`、`/knowledge`、`/settings` 为明确 skeleton，不新增真实业务接入；
- 生产 dist 不包含 `DesignSystemGallery` chunk，dev-only route 仍只用于开发/测试。

独立 QA 与关闭结论：

- Claude Code 只读独立 QA 结论：`INDEPENDENT_QA_PASS`
  （P0=0 / P1=0 / P2=0 / P3=2）；
- 用户已接受并确认 DFE-1B 通过，DFE-1B 正式 `PASS/CLOSED`；
- P3-1：`R3Tooltip` 未纳入真 mount 测试；P3-2：router 测试注入分支残留于生产 bundle
  （无害死代码，不含组件）；
- 两项 P3 不阻断 DFE-1B 关闭，可在 DFE-2A 前置小步或后续前端治理窗口收口。

### DFE-2A：工作台与任务创建体验

状态：`INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED`。

交付：

- 原型中的新任务工作台和快捷任务入口；
- Composer、附件展示、机器人/技能/模型/项目空间选择器；
- 智能授权三模式只读说明，明确“待接入”和“当前不改变任务执行”，不得提供无真实语义的可点击选择器；
- 选择摘要、禁用原因和提交反馈；
- 工作台最近任务、最近成果与项目空间摘要；
- submitTurn 继续调用现有高层 API，不拆解内部步骤。

数据：Workspace、Session、Agent、Model、submitTurn 优先接真实；快捷任务、
技能目录和尚无 Projection 的内容使用 Mock。

门槛：智能授权最终是新任务 Composer 中真实生效的任务级选择。DFE-2A 只接受未接入状态的诚实展示；真实选择器必须按
`WORKSPACE-AUTHORIZATION-FEATURE-SPEC-v1.0.md` 另行完成版本化 Contract、Core 策略、持久化恢复、端到端验证和用户编码授权，
不得被 DFE-2B 顺手吸收。DFE-2A 用户接受前，只读说明卡的名称和顺序也必须同步为“手动复核/智能确认/任务内授权”，
不再使用会与 WorkspaceGrant 混淆的“工作区授权”。Workspace 文件规则缺失只停对应真实接入，不阻塞工作台其他视觉和真实数据能力。

### DFE-2B：任务列表与任务管理

状态：`INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED`。

交付：

- 用户侧统一“任务”列表，不再并列显示“会话”；
- 搜索、状态筛选、固定排序；
- 置顶、取消置顶、重命名、删除交互；
- 删除状态门槛、确认文案和失败保持；
- Loading/Empty/Stale/Permission/Unavailable/Error。

数据：列表、打开、重命名、停止和删除复用现有 Session/Task 高层 API；置顶在专项
Feature Spec 和真实 Contract 接缝具备前只做“本次视图置顶”的本地标记，不宣传为真实持久化。

### DFE-3A：任务详情与持续交互

状态：`PASS/CLOSED`。

交付：

- 对话区、持久消息和 Streaming；
- 用户输入、等待输入和继续任务；
- 用户确认卡片；
- cancel/retry/continue/provide input；
- 用户语言 Task 状态；
- `uncertain` 映射为“需要人工处理”；
- 任务进程中的步骤和工具活动摘要。

数据：复用现有真实 Projection、Command、Snapshot 和 durable cursor；不建立第二
套 reducer，不展示 Agent/Model/Runtime 等普通用户技术术语。

### DFE-3B：右侧面板、工作空间文件与成果预览

状态：`PASS/CLOSED`。

交付：

- “概览 / 工作空间文件”固定视图；
- “产物 / 任务进程”独立折叠；
- 多文件标签、活动标签、关闭与恢复；
- Markdown 安全结构化渲染；
- 既有 HTML sandbox 预览；
- 二进制/编码不支持的固定页面内提示；
- 打开本地文件夹、软件窗口内全屏、收起/展开；
- 面板状态、滚动和焦点保持。

数据：成果和预览使用现有真实 API；工作空间嵌套文件树在缺少受控 Projection 时
使用 Mock，不允许 Renderer 读取目录。

### DFE-4A：智能中心浏览与详情

状态：`INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED`。

交付：

- 机器人：全部 / 我创建的；
- 技能：技能广场 / 已安装 / 本地目录 / 我创建的；
- 工具：无子分类；
- 三个列表独立搜索、筛选和状态；
- 与原型一致的卡片、空态和详情；
- 同名资源来源区分；
- 不在机器人卡片显示状态标签；
- 技能不显示旧分类标签；
- 工具风险与状态使用中性标签。

数据：首批主要使用 Mock Adapter；真实 Catalog Projection 存在后按模块替换。

### DFE-4B：机器人与技能创建助手

状态：`INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED`。

交付候选：

- 已新增创建机器人页面，支持默认/预设/上传头像、本地预览、上传头像移除恢复默认、基础字段和四类能力开关；
- 已新增创建技能页面，支持三字段表单、字段级校验、技能创建对话本地预览、失败提示和重试动作；
- 创建技能对话页不展示“运行测试”或“提交发布”；“我创建的”技能详情只显示禁用测试/发布入口；
- 真实保存、测试、提交、审核、目录写入和成功语义继续等待后续 Feature Spec 与后端批次。

编码前硬门槛：Agent/Skill Feature Spec 必须冻结字段、草稿 revision、测试结果、
固定能力包和发布状态。Feature Spec 未完成时，只允许做静态页面结构、通用状态和
明确 GATED 的演示跳转；不得实现字段校验、草稿状态机、保存、测试、提交或审核成功语义。

### DFE-5.0：设置与知识中心冻结（docs-only）

状态：`PRODUCT SEMANTICS FROZEN / DOCUMENT REVIEW PENDING`。

范围：

- 冻结 DFE-5A / DFE-5B 的页面范围、Mock/真实边界、禁用态文案、Credential 安全红线、
  允许修改文件范围和 QA 矩阵；
- 新增 `MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md`，冻结模型来源、个人模型字段、无测试连接、
  用户默认/当前有效模型、机器人约束、状态、删除与个人 Key 查看产品语义；
- 不修改 Renderer、Main、Preload、Contracts、Core、Central、Document Worker、SQLite migration、
  Port/Persistence、IPC Contract、依赖、lockfile 或开发版本；
- 不修改已接受 ADR-013；保存后查看完整个人 Key 所需反向敏感通道继续作为架构增补和真实编码门槛。

已确认结论与剩余缺口：

- `MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` 已冻结产品语义，个人模型不提供测试连接；
- ADR-013 已冻结 PersonalCredentialStore、一次采集和受控 Broker，但尚未定义已保存 Secret 返回所有者 Renderer 的反向读取；
- Personal Model CRUD、用户默认偏好、机器人约束、状态、删除阻断、Provider Adapter 与受控 Credential 通道尚无已授权真实实施批次；
- 因此 DFE-5A 真实添加、查看、保存、默认和删除仍需后端详细方案、架构增补、文档复核和用户单独授权。

Credential 安全红线：

1. Mock 阶段严禁接收真实 API Key。输入框必须是占位、假 Key 或禁用说明，不能诱导用户粘贴真实密钥；
2. 真实接入后 Key 默认遮罩；个人模型所有者可以按专项 Spec 主动查看自己的已保存 Key，隐藏或离开页面后必须清除 Renderer 明文；企业 Credential 永不进入 Desktop；
3. Renderer 只在输入、保存提交或所有者主动查看期间短暂处理明文；Key 不得进入全局/持久状态、日志、Trace、QA evidence、fixture、测试快照、错误对象或持久化 artifact；
4. 应用不检测、不阻止、不审计系统截图或外部录屏；官方测试、Fixture、QA evidence 和演示截图只使用假 Key；
5. Key 的存储、加密、解析和删除必须等待 ADR-013 对应真实接缝；保存后查看还必须等待 ADR-013 增补的反向敏感通道；DFE 不得自行实现 OS Keychain、加密、本地文件保存或 SQLite 存储；
6. DFE-5A Mock UI 可以展示“已配置 / 待接入 / 需要管理员启用”等状态，但不得把本地假动作包装成保存、查看、默认或删除成功。

DFE/DFI 边界纪律：

- DFE-5.0 与 DFE-5A 不修改 `services/core/**`、`packages/contracts/**`、SQLite migration、
  Port/Persistence、Credential Store、Keychain、IPC Contract 或后端业务语义；
- 如设置页面需要新的 Credential、模型 Registry、企业 Identity 或 Knowledge Provider 能力，必须停下报告阻断，
  等 DFI 或对应专项单独授权；
- 前端批次可以复用既有高层 API 和 Projection，但不得新增传输字段或绕过 Preload 白名单。

DFE-5A 编码前硬门槛：

- `MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` 通过独立文档复核；
- Personal Model/Credential 后端详细方案冻结并明确 Central、Core、Main/Preload、Renderer、PersonalCredentialStore 分工；
- 新增/替换 Key 的受控输入链路冻结；如交付保存后查看，ADR-013 反向读取增补同时冻结；
- 若上述门槛未满足，DFE-5A 只能实现静态页面结构、只读企业模型状态、明确 GATED 的个人模型卡片和通用错误/不可用状态。

DFE-5B 编码前硬门槛：

- Knowledge Provider、Personal Memory、Feedback、Identity/SSO/RBAC 任一真实接入都必须有对应 Feature Spec
  或已接受 Contract；
- Spec 未冻结时只允许 Prototype / GATED 页面，不展示真实检索成功、真实写入成功、真实反馈提交成功或企业身份绑定成功。

DFE-5.0 QA 矩阵：

- 文档边界：仅修改前端计划、Living Spec、DEVELOPMENT-LOG、README/产品索引或 CHANGELOG；
- 静态扫描：生产源码不得新增 Credential、API Key、Keychain、model-save、knowledge-provider、memory-write、
  feedback-submit、identity-bind 等真实接入标识；
- Renderer 边界：不得新增 `window.robothreeDesktop` API 调用、IPC route、Preload 白名单或系统能力；
- Credential 泄漏边界：文档和后续测试必须覆盖日志、Trace、QA evidence、fixture、error、state dump
  不含真实 Key；官方截图只使用假 Key，不建设系统截图检测；
- 禁用态边界：添加、查看、保存、设为默认、删除、检索测试、记忆写入、反馈提交、身份绑定等入口在未接入前必须
  disabled 或明确标注待接入；
- 门禁：docs-only 批次不要求 full check，但需完成静态文件范围核查；进入 DFE-5A 编码后恢复 focused、lint、
  offline install 和完整 `pnpm run check`。

### DFE-5A：设置 — 模型管理

交付：

- 企业模型只读列表；
- 个人模型添加、编辑、更换/查看 Key、删除和设为用户默认的完整 UI（仅在专项 Spec、后端方案与受控
  Credential 链路冻结后允许）；
- 不提供个人模型测试连接；保存后进入“未验证”，由真实调用更新状态；
- 个人模型分别采集 Provider 模型标识与显示名称：模型标识精确提交给 Provider，显示名称默认等于模型标识并用于界面；
- 网络失败保留最近失败警告但允许再次选择并真实重试；认证失败、协议不兼容和模型不存在在修正配置前禁用；
- 企业模型为空但存在可用个人模型时要求用户明确选择；只有两类模型均不可用时阻止新任务；
- 用户默认模型与机器人临时有效模型分离，取消机器人后恢复默认；任务首次提交后锁定模型；
- Key 默认遮罩；所有者真实查看必须等待 ADR-013 增补，真实 Key 输入链路未冻结前不得出现可输入真实 Key 的控件；
- Disabled、Permission denied、Unavailable、Error；
- 企业模型与个人模型在选择器中统一使用，凭证域和调用路径保持分离。

真实接入前硬门槛：Model Experience Feature Spec 文档复核、Personal Model/Credential 后端方案、受控 Credential 输入链路，以及查看能力所需 ADR-013 增补。
真实链路未冻结时只允许静态页面结构、只读/Mock 状态、通用状态和明确 GATED 文案；不得实现真实查看、
设为默认、删除或保存成功语义。Mock 阶段不得要求、接收、存储或记录真实 API Key，测试和演示只使用假 Key。

DFE-5A 不自动启动 DFI-2B。个人模型后端建议作为 DFI-4A 或等价独立批次规划；DFI-2B 的智能授权风险矩阵与 Confirmation 恢复继续单独评审和授权。

### DFE-5B：知识中心与 P1 设置骨架

交付：

- 知识中心列表、详情和检索测试的 P0 Conditional 页面；
- 个性化、个人记忆、问题反馈和身份信息的 Prototype 页面；
- Prototype/未接入状态明确；
- 个人记忆首期只做查看和修改页面，不自动写入、不接 Memory Store。

真实接入按各专项 Feature Spec 单独授权，不随本批自动解锁。

#### DFE-5B.1：知识中心基础体验（PASS/CLOSED）

目标：

- 将 `#/knowledge` 从通用 skeleton 切换为知识中心基础体验；
- 新增 `#/knowledge/:knowledgeId` 详情页；
- 生产默认只展示未配置/GATED 状态，不展示虚构知识源列表；Fixture 只用于测试和开发视觉场景；
- 不接入真实 Knowledge Provider、检索 API、
  Contract、IPC、Preload、Core、Central 或 SQLite；
- 持续提示“知识库真实检索能力待接入”，避免用户把 Fixture 误解为真实索引、同步或检索结果。

页面与路由：

- `#/knowledge`：`KnowledgeCenterPage.vue`，生产默认展示 Unconfigured/Gated 未配置状态；
  Fixture 模式下才展示知识源示例列表、搜索框、本地过滤、Loading/Empty/Ready/Unavailable/
  Permission denied/Error/Partial 状态；
- `#/knowledge/:knowledgeId`：`KnowledgeDetailPage.vue`，展示已匹配 Fixture 的基础信息、
  示例结果卡片和 GATED 提示；生产默认或未匹配 id 时不展示详情入口和示例结果；
- `productionRouteNames` 保留 `knowledge`，新增 `knowledgeDetail`；
- `knowledgeId` 只允许匹配 Fixture 中预定义的安全 id；未匹配时进入 Not found，不把 route param
  回显为知识源名称，不触发动态读取、Provider 请求或路径解析；
- 左侧一级导航继续使用现有 `primaryNavigationItems`，不新增一级导航。

组件与模块：

- 复用 `R3PageHeader`、`R3Card`、`R3SearchField`、`R3InlineNotice`、`R3EmptyState`、
  `R3Skeleton`、`R3Tag`、`R3Button`、`R3Spinner`；
- 状态标签优先使用 `R3Tag tone="neutral"`；错误、不可用和权限不足使用 `R3InlineNotice`
  搭配文字说明，不只依赖颜色；
- 新增 `pages/knowledge/KnowledgeCenterPage.vue`；
- 新增 `pages/knowledge/KnowledgeDetailPage.vue`；
- 新增 `pages/knowledge/knowledge-model.ts`，只包含纯函数：Fixture 过滤、状态投影、详情查找、
  空态原因和示例结果展示模型；
- 新增 `adapters/knowledge-adapter.ts`，但命名语义冻结为 Knowledge 页面接口和两个明确实现：
  `GatedKnowledgeAdapter` 是生产默认，只返回 `unconfigured/gated` 状态和零知识条目；`FixtureKnowledgeAdapter`
  仅用于测试、开发视觉场景和 Story-like fixtures；
- `GatedKnowledgeAdapter` 和 `FixtureKnowledgeAdapter` 都不得调用 `window.robothreeDesktop`，不得导入
  Preload/API/IPC，不读取真实文件、Provider、LocalStorage、sessionStorage 或 indexedDB；
- 正式页面不得在生产默认、加载失败或错误 fallback 中使用 Fixture 数据冒充业务数据；
- 只有状态映射和文案明显增长时，才可新增 `presentation/knowledge-presentation.ts`，且必须保持纯展示函数，
  不导入 Vue、DOM、Preload 或业务 Adapter。

Adapter 与 Prototype/GATED 数据规范：

- `KnowledgeAdapter` 是页面接口，不是 Provider 接口；当前没有真实 Knowledge Provider Projection；
- `GatedKnowledgeAdapter` 是生产默认：返回 `state: "unconfigured_gated"`、`dataOrigin: "system"`、
  `capabilityState: "gated"` 和空知识源列表，文案说明“企业知识能力尚未配置/接入”；
- `FixtureKnowledgeAdapter` 只能在测试、开发视觉场景或显式 Fake Adapter 注入中使用；
- 每个 Fixture 知识源必须包含 `dataOrigin: "prototype"` 和 `capabilityState: "gated"`；
- 每个 Fixture 示例结果也必须继承或显式携带 Prototype/GATED 来源；
- 页面必须持续展示“示例数据 / 真实检索待接入”说明；
- 允许展示：知识源名称、简介、来源类型标签、非敏感可见范围摘要、示例更新时间、待接入/不可用/
  权限不足等 Fixture 状态、示例结果标题和安全定位摘要；
- 禁止展示或模拟：上传成功、同步成功、索引完成、删除、授权配置、真实检索成功、Provider Endpoint、
  凭证、Token、Credential、CapabilityLock、原始文档正文、原始 Observation、Chunk payload、
  embedding/vector、indexJob/syncJob、本地真实路径或未脱敏路径；
- Unavailable、Permission denied、Partial 只能由 Fixture、Fake Adapter 或组件测试提供；当前没有真实
  Knowledge Provider Projection，因此生产页面不得暗示这些状态来自真实权限、真实 Provider 或真实索引。
- 生产默认 Unconfigured/Gated 状态不得展示搜索框、详情入口、知识源列表或示例结果卡片。

搜索与示例结果边界：

- 搜索框只在 Fixture 模式出现，只对本地 Fixture 做字符串过滤；
- 过滤字段限制为安全展示字段：名称、简介、来源标签、示例结果标题；
- 列表 placeholder 使用“搜索知识源示例”，详情 placeholder 使用“过滤示例结果卡片”；
- 页面固定提示“当前搜索仅过滤示例数据，不代表真实知识检索”；
- 示例区域统一称为“检索结果样例”或“示例结果卡片”；
- 禁止出现“命中、召回、引用成功、已检索、同步完成、索引完成”等真实成功语义；
- 不发起 Provider 请求，不记录搜索词到持久状态、日志、埋点或测试快照中的敏感场景。

状态矩阵：

| 页面 | 状态 | 展示 | 禁止事项 |
| --- | --- | --- | --- |
| `#/knowledge` | Unconfigured/Gated | 生产默认；“企业知识能力尚未配置/接入”说明 + 真实检索待接入提示 | 不展示搜索框、详情入口、知识源列表或示例结果卡片 |
| `#/knowledge` | Loading | 骨架屏 + 真实检索待接入提示 | 不触发真实请求 |
| `#/knowledge` | Empty | 仅 Fixture 场景；示例集合为空 | 不提供上传/新建入口，不作为生产默认 |
| `#/knowledge` | Ready | 仅 Fixture 场景；Prototype/GATED 列表和本地过滤 | 不显示真实检索成功，不作为生产默认 |
| `#/knowledge` | Unavailable | 仅 Fixture/Fake 场景；不可用说明和影响范围 | 不解释为真实 Provider 状态，不作为生产默认 |
| `#/knowledge` | Permission denied | Fixture 权限不足提示 | 不展示被拒绝数据 |
| `#/knowledge` | Error | 固定安全错误摘要 | 不展示 stack、Provider 响应体或 `JSON.stringify(error)` |
| `#/knowledge` | Partial | 可展示部分 + 局部 GATED 提示 | 不暗示部分真实索引成功 |
| `#/knowledge/:knowledgeId` | Unconfigured/Gated | 生产默认；知识能力未配置，返回列表 | 不展示搜索框、详情字段或示例结果卡片 |
| `#/knowledge/:knowledgeId` | Loading | 详情骨架屏 | 不触发真实请求 |
| `#/knowledge/:knowledgeId` | Not found | 找不到该示例知识源，返回列表 | 不回显未匹配 id 为标题 |
| `#/knowledge/:knowledgeId` | Ready | 基础信息 + 示例结果卡片 | 不显示真实检索成功 |
| `#/knowledge/:knowledgeId` | Unavailable | 真实检索待接入 | 不展示真实 Provider 状态 |
| `#/knowledge/:knowledgeId` | Permission denied | 权限不足提示 | 不展示详情字段 |
| `#/knowledge/:knowledgeId` | Error | 固定安全错误摘要 | 不展示内部对象 |
| `#/knowledge/:knowledgeId` | Partial | 基础信息可见，示例结果不可用 | 不暗示部分真实检索成功 |

安全与敏感信息检查：

- Renderer DOM、状态输出、Fixture、测试快照和错误 fallback 不得包含：
  `Token`、`Credential`、`CapabilityLock`、`API Key`、`requestDigest`、`workspaceRoot`、
  `rootRealPath`、`selectedPath`、`providerEndpoint`、`rawChunk`、`observation`、`payload`、
  `embedding`、`vector`、`indexJob`、`syncJob`；
- 未知错误只展示固定用户语言，例如“知识中心暂不可用，请稍后重试。”；
- 不使用 `JSON.stringify(error)`，不展示异常栈、内部字段、Provider 响应体或路径；
- 禁止新增 `fetch`、`ipcRenderer`、`contextBridge`、`window.robothreeDesktop` 调用、LocalStorage、
  sessionStorage、indexedDB 或自造业务持久化。

测试与验收：

- `knowledge-model.test.ts`：Gated 默认状态、Fixture 过滤、详情查找、Empty/Ready/Partial、Not found、
  安全 id、敏感字段禁入；
- `knowledge-adapter.test.ts`：生产默认 `GatedKnowledgeAdapter` 返回零知识条目和
  `unconfigured/gated` 状态；`FixtureKnowledgeAdapter` 只返回 `dataOrigin=prototype` /
  `capabilityState=gated` 数据；两者均不读取 Preload/Desktop API；
- `knowledge-center-page.test.ts`：Loading、Empty、Ready、Unavailable、Permission denied、Error、Partial；
  新增生产默认 Unconfigured/Gated：零知识条目、只展示未接入说明、不展示搜索框、详情入口或示例结果；
  搜索只过滤本地 Fixture；不出现真实检索成功文案；
- `knowledge-detail-page.test.ts`：详情骨架、示例结果卡片、Not found、Permission denied、安全错误摘要、
  route param 不回显、生产默认不展示详情字段、敏感字段不进入 DOM；
- `renderer-router.test.ts`：`/knowledge`、`/knowledge/:knowledgeId`、`knowledgeDetail` route name、
  `navKey=knowledge`；
- `renderer-workbench-boundary.test.ts` 或等价边界测试：允许 `adapters/knowledge-adapter.ts`，
  但断言它不调用 `window.robothreeDesktop`；
- 编码完成后至少执行：
  `CI=true pnpm --filter @robothree/desktop build`、
  `CI=true pnpm exec vitest run apps/desktop/tests`、
  `CI=true pnpm run lint`、
  `CI=true pnpm run audit:dtp4`、
  `CI=true pnpm run check`；
- 完整 `check` 如在普通工具沙箱遇到既有 `listen EPERM 127.0.0.1`，按既有流程在允许 loopback
  的环境复跑同一命令，并记录两次结果。

视觉与可访问性：

- 复用现有 DFE 页面风格，不新建视觉体系，不新增全局样式；
- 页面 scoped CSS 使用现有 token；
- Desktop 宽屏可使用列表 + 详情摘要布局；小屏降为单列；
- 状态标签使用中性标签，不只用颜色表达状态；
- 不做上传、同步、索引、授权或删除入口按钮；
- 页面有明确 `aria-label`，搜索框必须有可靠可访问名称；当前 `R3SearchField` 只有 placeholder，
  placeholder 不能替代可访问名称。编码时必须二选一：
  1. 为 `R3SearchField` 增加 `accessibleLabel` 或 `ariaLabel` prop，并补公共组件回归测试；
  2. 使用可见 label，并通过组件正式支持的 id/label 关联输入框；
  该修改属于允许的 Renderer 公共组件改动，必须在 DFE-5B.1 实现清单和测试中明确记录；
- 列表项使用 link/button 并支持键盘访问；
- 当前选中项使用文字或结构表达，不只依赖颜色；
- Loading、Error、Permission denied 使用页面内反馈，不只用 Toast；
- 焦点顺序：标题 → 搜索 → 列表 → 详情/返回。

工程收口窗口：

- 前端编码窗口只修改 `apps/desktop/src/renderer/**` 与 `apps/desktop/tests/**`；
- 前端代码和测试冻结后，由 Codex 5.6 进入独占共享文件收口窗口，更新 Desktop 版本、
  `CHANGELOG.md`、`DEVELOPMENT-LOG.md`、`README.md` 和必要 audit 版本基线；
- 完成共享文件收口并通过开发者门禁后，才提交 Claude Code 独立 QA；
- 不得长期以“只改 Renderer/tests”作为最终交付状态。

仍未定义、阻塞真实接入的事项：

- 首个企业 Knowledge Provider 类型、接口和权限模型；
- 真实检索 API、引用格式、定位字段和 Provider 状态 Projection；
- Provider 未配置、会话失效、权限不足的真实状态来源；
- 检索结果 Partial 的业务语义；
- Admin Knowledge 管理与 Desktop Knowledge 展示的数据边界；
- 上传、同步、索引、删除、授权配置的产品流程；
- Knowledge 与 Task/Agent/Skill/Workspace 授权的真实组合规则。

工期估算：2～2.5 个集中工程日，不含独立 QA、返工和用户现场验收。

关闭状态：独立 QA 已串行通过 focused、Desktop build、lint、audit 与完整 Workspace 门禁，P0～P3=0；
用户已于 2026-08-20 正式接受并关闭 DFE-5B.1。真实 Knowledge Provider、检索、同步、索引与后端状态
仍需独立 Feature Spec/DFI 批次，不因前端基础体验关闭而解锁。

### DFE-6：真实数据收敛与 Desktop 关闭验收

#### DFE-6.0：Desktop Closure Plan Revision 1（DOCUMENT REVIEW PENDING / CODING GATED）

正式方案：[DFE-6.0 Desktop Closure Plan](./DFE-6.0-DESKTOP-CLOSURE-PLAN.md)。

DFE-6.0 Revision 1 只做文档盘点，不删除 Mock、不接新接口、不修改 Main/Preload/Core/Contracts/Central/SQLite
migration，也不进入 DFE-6A/6B 编码。盘点范围：

- 所有路由、页面、组件中的 Mock / Prototype / GATED inventory；
- 每项 Mock 的真实 Adapter、Contract/Projection 依赖和删除门槛；
- 哪些页面已可真实收敛，哪些必须继续 GATED；
- 五个一级导航的最终视觉、键盘和窗口尺寸验收清单；
- Loading / Empty / Error / Disabled / Permission denied / Unavailable / Partial 状态覆盖；
- DFI-1B、DFI-2B、DFI-3、DFI-4A.2～4A.4 对前端的依赖映射。

Revision 1 明确当前真实路由事实：任务详情不是 `#/tasks/:taskId` 独立路由，而是在
`#/tasks` 的 `TasksListPage.vue` 内选中任务后展示。Revision 1 当时识别右侧“工作空间文件”为固定占位；
DFI-1B Workspace Browser / Reveal 已 `PASS/CLOSED`，因此 DFE-6A 可以先消费
`window.robothreeDesktopV1Alpha2.getCompatibility/listWorkspaceEntries/openTaskWorkspaceLocation`
替换该占位；当前 DFE-6A 已实现、独立 QA PASS 并由用户接受关闭。

后续编码拆分：

- DFE-6A：只使用现有已验收接口做真实数据收敛，优先接入任务详情工作空间文件树并删除固定占位；
- DFE-6B：五导航视觉、键盘、状态矩阵和 remaining Mock inventory 最终收口。

DFE-6A 已在 `0.0.0-dfe.6a` 实现、通过独立 QA 并由用户接受关闭；DFE-6B 已在
`0.0.0-dfe.6b` 实现、独立 QA PASS 并由用户接受关闭。

#### DFE-6A：Workspace Files Real Data Convergence（PASS/CLOSED）

正式方案：[DFE-6A Workspace Files Real Data Convergence Plan](./DFE-6A-WORKSPACE-FILES-REAL-DATA-CONVERGENCE-PLAN.md)。

DFE-6A 只消费 DFI-1B 已验收 v1alpha2 sidecar，不新增 Contract、IPC、Main、Preload、Core 或
SQLite migration。编码前必须冻结：

- v1alpha2 Adapter 与 InjectionKey，页面不直接调用 `window.robothreeDesktopV1Alpha2`；
- Compatibility negotiation；Core restart 后 `runtimeInstanceId` 变化必须重新协商；
- selected task 切换时清理旧目录状态、cursor、breadcrumb 和迟到响应；
- 根目录加载、单层惰性目录导航、breadcrumb、cursor 分页；
- stale cursor 后从当前目录第一页安全刷新；
- file/directory/symlink 展示与导航规则，symlink 永不导航；
- `openTaskWorkspaceLocation` 只能打开 Task 锁定工作空间位置，不能接收 `entryId`；
- feature 缺失时显示真实 Unavailable，不恢复固定假文件；
- Renderer 不接收或展示完整路径、WorkspaceGrant authority、Credential。

`0.0.0-dfe.6a` 已实现 DFE-6A，独立 QA PASS 且用户已接受关闭；DFE-6B 已在
`0.0.0-dfe.6b` 实现，独立 QA PASS 且用户已接受关闭。

#### DFE-6B：Frontend Foundation Closeout（PASS/CLOSED）

正式方案：[DFE-6B Frontend Foundation Closeout Plan](./DFE-6B-FRONTEND-FOUNDATION-CLOSEOUT-PLAN.md)。

DFE-6B 只关闭 Frontend Experience Foundation，不关闭后端 DFI、TGM、Knowledge Provider、
Personal Model/Credential、Agent/Skill 真实创建或正式安装包。编码前必须冻结：

- 五个一级导航的最终视觉、键盘、焦点、ARIA 和窗口尺寸验收；
- Loading / Empty / Error / Disabled / Permission denied / Unavailable / Partial 状态矩阵；
- remaining Mock / Prototype / GATED inventory 的保留、删除和替换门槛；
- 已由 DFE-6A 替换的 Task Detail 工作空间文件固定占位回归；
- `LegacyWorkbench.ts` 的隐藏、保留或删除决策；
- Renderer-only 编码范围、focused tests、静态边界扫描和共享文件收口窗口。

DFI-4A.1 Revision 3.2 保持 `DOCUMENT REVIEW PENDING / CODING GATED`，不宣称评审通过；
Revision 3.3 由 Codex 5.6/后端负责人接管。前端不再修改后端 Domain、Contract、migration、
Persistence 或恢复方案。

交付：

- 逐模块删除已替换 Mock；
- 真实 Adapter 的错误、权限、不可用、Stale 和 Partial 收敛；
- Desktop 重启、Core 重启、SSE reconnect 和任务不中断回归；
- 视觉一致性、键盘、焦点、WCAG 2.2 AA 与窗口尺寸验收；
- 现场演示和 Frontend Living Spec 最终更新。

DFE-6 只关闭 Frontend Experience Foundation，不关闭 DFI、TGM、Personal Model/Credential、
Knowledge Provider、Agent/Skill 创建或正式安装包。DFE-6 不自动解锁缺失 Feature Spec 的真实能力；未接入模块可以明确保留为
Prototype/Gated，但不得伪装为完成。

### DFE-7A：Robot / Tool Catalog Renderer Consumption（0.0.0-dfe.7a PASS/CLOSED）

正式方案：[DFE-7A Robot / Tool Catalog Renderer Consumption Plan](./DFE-7A-ROBOT-TOOL-CATALOG-RENDERER-CONSUMPTION-PLAN.md)。

DFE-7A 只消费既有 v1alpha2 Robot / Tool Catalog Renderer API，把智能中心 Robot/Tool 从旧投影与 Mock
目录收敛到真实只读 Catalog。后端、Main、Preload 与 Contract 已具备：

```text
getCompatibility
listRobotCatalog / getRobotCatalog
listToolCatalog / getToolCatalog
feature: robot_tool_catalog
```

Revision 1 关闭文档评审提出的 7 个 P2：

- Adapter 从一次性 `loadIntelligenceCatalog()` 改为 `negotiateCatalog/listRobots/getRobot/listTools/getTool`；
- `clientInstanceId/queryId/correlationId` 使用 Contract 要求的 UUID，不再使用带前缀字符串；
- Robot list 只展示 Summary 可证明字段，默认模型、eligible resources 与数量只在详情展示；
- Tool list 删除 `modelCallable/lifecycleLabel/模型可调用工具` 等 Contract 不存在的旧语义；
- 分页、搜索和统计改为“已加载”语义，不伪装 total count 或服务端搜索；
- Robot list、Tool list、Robot/Tool detail、Skill gated 与 pagination 拆分独立状态，并用 request epoch 丢弃迟到响应；
- Skill tab 生产收敛为纯 GATED 状态，不展示具体 Mock Skill 条目；
- 冻结 source、restriction、availability、unavailableReason、riskSummary、readOnly 和 catalog error 的穷尽安全文案映射。

Revision 1.1 关闭条件复核提出的 2 个 P2 与 2 个 P3：

- `riskSummary` 明确冻结全部六个 `ToolRiskFactKindSchema` 值：`routine_file`、`destructive_file`、
  `protected_resource`、`local_execution`、`external_send`、`unknown`；
- `inputShape=structured_object`、`outputShape=structured_object|unspecified` 与真实 catalog error code
  全部进入穷尽映射；
- 补充 `runtime.request_aborted` 映射为请求取消或被较新页面状态取代，Renderer 丢弃结果且不展示为用户错误；
- `catalog.runtime_changed` 固定为清空 Robot/Tool list、detail、cursor、queryRevision、pagination 和 in-flight epoch，
  显示 persistent notice，只有用户点击刷新才重新协商并加载；
- 删除“我创建的机器人”子 Tab/filter，不保留 disabled 入口；
- 精确说明 runtime lease 权威校验由 Main 接线完成，Renderer 只消费 `catalog.runtime_changed`，不得从响应自行推断；
- 编码门禁补充 offline frozen install 与 `pnpm-lock.yaml` digest 前后对比。

DFE-7A 继续禁止 Tool 管理、启停、配置、测试、删除、Agent/Skill 真实创建、TGM、Knowledge Provider、
Personal Model/Credential、Main/Preload/Core/Contract 修改和 lockfile 修改。Revision 1.1 独立差异复核已
`PASS（P0=0、P1=0、P2=0、P3=2，均非阻断）`；两个 P3 的 docs-only 收口已补入正式 DFE-7A 方案，原复核
计数保持如实记录。

用户已正式授权 DFE-7A 编码。`0.0.0-dfe.7a` 已实现 Renderer 消费批：Intelligence Center 通过
v1alpha2 Robot / Tool Catalog Adapter 读取真实 Summary / Detail，Skill tab 保持纯 GATED，旧 Mock/旧投影字段已删除。
独立复核确认 DFE-7A Renderer 本体 focused 门禁通过；同一工作区的 Core drift 后续已作为独立 CPC-2 批次
完成授权、实现、独立 QA 与用户接受，不再污染 DFE-7A。用户已单独接受 DFE-7A 并正式标记为
`PASS/CLOSED`。Skill Catalog、Tool 管理、Agent/Skill 创建及所有未实现后端能力仍保持 GATED。

---

## 10. 每批开发前模板

每个批次开始前必须先提交：

```text
页面/模块范围：
复用组件：
新增组件：
真实数据来源：
Mock 数据范围：
依赖 Contract/Projection：
PRD/Spec 未定义项：
修改文件边界：
本批明确不做：
```

出现以下任一情况，暂停受影响模块并请求确认：

- 需要新增或修改公共 Contract / IPC；
- 原型与 PRD/Spec 在业务操作上冲突；
- 需要前端推导权限、风险或 Task 状态；
- 需要展示完整路径、Credential 或内部错误；
- 需要把 Mock 成功写成真实业务成功；
- 需要改变已确认页面结构、交互或术语。

---

## 11. 测试与验收策略

### 11.1 自动化分层

| 层级 | 目标 |
| --- | --- |
| Pure presentation | 文案、状态、fallback、脱敏、穷尽映射 |
| Component | props、事件、键盘、焦点、ARIA、状态展示 |
| Page | Loading/Empty/Ready/Denied/Unavailable/Error、Mock/真实 Adapter |
| Renderer boundary | 无 fs/child_process/net/db/任意 IPC；无敏感字段 |
| Desktop integration | Main/Preload/Core、Snapshot、Event、预览和恢复 |
| Visual review | 与原型在默认和最小窗口下逐页比对 |

### 11.2 每批基础命令

```bash
source ~/.nvm/nvm.sh
nvm use 24.13.0
cd /Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace
pnpm --filter @robothree/desktop build
pnpm exec vitest run apps/desktop/tests
pnpm run check
```

涉及 Central 的真实联合链路时，再串行运行：

```bash
pnpm run check:central
pnpm run check:central:offline
```

禁止并行运行会共享 Surefire 报告目录的 Central online/offline 门禁。

### 11.3 视觉验收

每个页面至少检查：

- 1180×760 默认窗口；
- 900×600 最小窗口；
- 侧栏展开/收起；
- 正常、空、加载、错误和无权限；
- 键盘 Tab 顺序和 `focus-visible`；
- 长中文、长文件名和同名资源；
- 不出现无来源渐变、阴影、营销 Hero 或 Dashboard 布局；
- 与最新原型截图并排核对。

截图证据采用固定命名：

```text
DFE-<batch>-1180x760-<page>-<state>.png
DFE-<batch>-900x600-<page>-<state>.png
```

例如 `DFE-1B-1180x760-shell-ready.png` 和
`DFE-2A-900x600-workbench-empty.png`。

首期不以像素级截图测试替代人工视觉确认。若后续页面数量和回归成本证明有
必要，再单独评审 Playwright/Electron 视觉基线，不在 DFE-1 偷增依赖。

### 11.4 安全验收

DFE-1A 起，自动扫描 `apps/desktop/src/renderer/**/*.{ts,vue}` 和测试输出；
不再以 `main.ts` 单文件断言代替目录级边界检查。只有明确白名单的
`data/desktop-core-adapter.ts` 或 controller 接缝可访问 Preload API；基础组件、页面展示
组件、styles 和 mocks 禁止访问。扫描禁止出现：

- `fs`、`child_process`、数据库和任意网络 Client；
- API Key、Token、Credential Reference；
- Runtime Handle、PID、SQLite 行和内部栈；
- 未脱敏绝对路径；
- Model private thinking；
- Artifact 原始敏感 payload；
- 未经安全处理的 `innerHTML`。

---

## 12. Frontend Living Spec

建议建立：

```text
docs/development/frontend/FRONTEND-LIVING-SPEC.md
```

每轮必须维护：

- 页面与路由；
- 组件与 Token；
- 页面状态矩阵；
- Mock 字段与 Projection/API 映射；
- 已确认产品规则；
- 临时设计假设；
- 待产品确认；
- 真实接入阻断；
- 视觉演示结论；
- 已替换和待删除 Mock。

Living Spec 不是新的 PRD。涉及业务规则、权限、持久化和 Contract 的结论必须
升级到相应正式文档，不能只在 Living Spec 中冻结。

---

## 13. 并行开发边界

前端可以与当前 Core/Central/Harness 工作并行，但必须遵守：

- 前端默认只修改 `apps/desktop/src/renderer/**`、`apps/desktop/tests/**` 和
  `docs/development/frontend/**`；
- Main、Preload、Contract、根依赖、版本、CHANGELOG 和 DEVELOPMENT-LOG 属于共享
  收口窗口，不允许多个开发窗口同时修改；
- 需要新增依赖时，由一个明确 Owner 完成 `package.json` 与 lockfile 修改；
- 同一批次和同一页面树只允许一个主前端 Owner 写入；其他 Agent 可以做文档评审、
  独立 QA 或无文件重叠的专项，不能按页面随意拆出多套组件和 Token；
- 全量 `pnpm run check` 失败时区分本批回归与工作区其他进行中批次，不隐瞒失败；
- 未提交/未关闭的其他批次文件不得被前端重写、格式化或清理。

---

## 14. 工期估算

以下为集中工程工作量，不是日历承诺，也不含产品等待、独立 QA 和返工：

| 阶段 | 估算 |
| --- | --- |
| DFE-0 | 1～2 天 |
| DFE-1A / 1B | 6～10 天 |
| DFE-2A / 2B | 8～13 天 |
| DFE-3A / 3B | 10～16 天 |
| DFE-4A | 4～7 天 |
| DFE-4B | 5～9 天，且依赖 Feature Spec |
| DFE-5A / 5B | 7～12 天，真实接入另计 |
| DFE-6 | 5～9 天 |

合计约 **46～78 个集中工程工作日**。建议使用一个主前端 Owner 保持设计一致性，
测试和独立 QA 可以并行；不建议多人同时各自实现一套基础组件或同一页面。

独立 QA、用户现场体验和返工不计入上述工程量。项目排期应按每个编码批次额外预留
约 0.5～1 个工作日的 QA/体验窗口；这仍不是日历交付承诺。

---

## 15. 阶段关闭条件

DFE 只有同时满足以下条件才能关闭：

- 五个一级导航与页面归属符合 PRD/Spec；
- 视觉、组件、状态和术语与最新确认原型属于同一设计系统；
- P0 页面均有完整状态，不存在无反馈白屏；
- 真实数据与 Mock 能被明确区分；
- 现有真实 Task、Confirmation、Artifact 和恢复链路无回归；
- Renderer 不持有系统能力、敏感信息或第二套业务状态；
- 默认和最小窗口通过键盘、焦点和视觉验收；
- `pnpm run check` 全绿；
- 对应真实模块的 Feature Spec 门槛没有被绕过；
- Frontend Living Spec 已更新；
- 独立 QA PASS；
- 用户完成关键页面现场体验并接受。

---

## 16. 文档评审后的最终裁决

### 16.1 接受并纳入 Revision 1

- Legacy Wrapper 渐进迁移，不在 DFE-1A 重写业务页；
- DFE-1A 独占依赖/构建配置窗口及 SFC 类型检查；
- Renderer 安全测试升级为目录级扫描，并作为 DFE-1A 退出硬门槛；
- Design System route 开发态隔离及生产构建排除证明；
- Mock 在生产构建中的明确形态和 DFE-6 inventory；
- Agent/Skill Feature Spec 未冻结前只做静态/GATED 页面；Model Experience 产品语义已经冻结，但 Personal Model/Credential 后端、ADR-013 回显增补和编码授权未完成前仍不得实现真实业务成功；
- API 反向矩阵、固定截图命名和 QA/体验窗口。

### 16.2 不采纳为 DFE 硬门槛

- “五个业务场景”不作为 DFE-0、DFE-1 或既有 Task 闭环的启动前置。若后续需要真实
  业务文案/Fixture，只暂停相应页面内容，不暂停整个 DFE-2/3；
- ARH-3 关闭、真实 Provider SOP 和 Cache 启用 SOP 不作为前端工程基座或现有
  Projection 页面开发前置，只影响对应真实联合接入和最终 DFE-6 验收；
- 不在本计划冻结 5.4/5.5/5.6 的固定页面分工。执行时按单批授权指定一个主 Owner，
  避免并行写同一组件、Token 和页面树；
- 不接受未经用户确认的 5～6 个月或具体月份日历承诺。

### 16.3 阶段状态

```text
DFE 总体计划：REVISION 1 ACCEPTED
DFE-0：PASS/CLOSED，docs-only
DFE-1A：PASS/CLOSED
DFE-1B：PASS/CLOSED
DFE-2A：PASS/CLOSED
DFE-2B：PASS/CLOSED
DFE-3A：PASS/CLOSED
DFE-3B：PASS/CLOSED
DFE-4A：PASS/CLOSED
DFE-4B：INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED
DFE-5.0：REVISION 1 PRODUCT DECISIONS ACCEPTED / DOCUMENT REVIEW PENDING，docs-only
DFE-5A～DFE-6：继续 GATED
```

## 17. 建议的下一步

```text
1. 对本计划做文档评审
2. Revision 1 关闭评审提出的工程与安全修订
3. 用户接受 DFE 总体方案
4. 单独授权 DFE-0
5. DFE-0 冻结 Living Spec、Legacy Wrapper、依赖窗口、安全测试和第一批页面范围
6. DFE-0 独立文档复核 PASS 并由用户接受
7. 单独授权 DFE-1A
```

在 DFE-1A 之前不开始页面代码迁移，不修改公共 Contract、IPC、Core/Central，
也不自动把任何 Prototype 能力升级为真实产品能力。
