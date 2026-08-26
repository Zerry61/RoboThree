# DFE-6.0 Desktop Closure Plan Revision 1

> 状态：**DOCUMENT PLAN ONLY / REVISION 1 REVIEW PASS / DFE-6A PASS/CLOSED / DFE-6B PASS/CLOSED / Frontend Experience Foundation PASS/CLOSED**  
> 日期：2026-08-21  
> 负责人：Codex 5.6  
> 范围：Desktop Renderer 已实现页面、路由、组件、Mock/Prototype/GATED inventory 与关闭验收计划  
> 非目标：不编码、不删除 Mock、不接新接口、不修改 Main/Preload/Core/Contracts/Central/SQLite migration

## 1. 目标

DFE-6.0 只做 Desktop Frontend Closure 的文档盘点，冻结后续 DFE-6A/DFE-6B 编码前必须核对的事实清单：

- 所有路由、页面、组件中的 Mock / Prototype / GATED inventory；
- 每项 Mock 对应的真实 Adapter、Contract/Projection 依赖和删除门槛；
- 哪些页面已经可以按现有 Projection 收敛，哪些必须继续 GATED；
- 五个一级导航的最终视觉、键盘和窗口尺寸验收清单；
- Loading / Empty / Error / Disabled / Permission denied / Unavailable / Partial 状态覆盖；
- DFI-2B、DFI-3、DFI-4A.2～4A.4 对前端的依赖映射。

DFE-6.0 Revision 1 不是 DFE-6 编码授权。文档评审通过后，仍需用户单独授权才能进入
DFE-6A 或 DFE-6B 编码。

Revision 1 修正：

- 修正真实路由：当前没有 `#/tasks/:taskId` 独立生产路由，任务详情内嵌在 `#/tasks` 的
  `TasksListPage.vue`；
- 补充 Task Detail 右侧“工作空间文件”从固定占位到 DFI-1B `window.robothreeDesktopV1Alpha2`
  真实接口的替换门槛；DFE-6A 现已完成该替换；
- 明确 DFE-6 只能关闭 Frontend Experience Foundation，不关闭后端 DFI、TGM、个人模型、
  Knowledge Provider、Agent/Skill 真实创建或正式安装包；
- 将 `680 x 560` 标为非承诺诊断尺寸，不作为正式支持窗口尺寸；
- 将后续编码拆为 DFE-6A 与 DFE-6B；DFE-6A 已在 `0.0.0-dfe.6a` 实现、通过独立 QA 并由用户接受关闭；DFE-6B 已在 `0.0.0-dfe.6b` 实现、通过独立 QA 并由用户接受关闭。

## 2. 当前路线图与页面 inventory

| 路由 | 页面 | 当前数据形态 | Mock / Prototype / GATED 点 | DFE-6.0 判定 |
| --- | --- | --- | --- | --- |
| `#/workbench` | `WorkbenchCreatePage.vue` | 真实 `listWorkspaceGrants/listSessions/listAgents/listModels/listTasks/listArtifacts/submitTurn` | 智能授权三模式为只读待接入说明；Knowledge 选择无真实 Provider 语义；模板化引导文案非业务事实 | 可真实收敛，但授权模式真实接入继续 GATED |
| `#/tasks` | `TasksListPage.vue` | 真实 `listSessions/listTasks/openSession/renameSession/deleteSession/controlTask` | 置顶为本地视图内 Set；物理删除/审计语义不由前端宣称 | 可真实收敛；本地置顶需保留说明或等待持久化 Spec |
| `#/tasks` 内嵌任务详情 | `TasksListPage.vue` + selected task detail state | 真实 `conversation_snapshot/task_detail/controlTask/artifact_*`，DFE-6A 已接 DFI-1B 工作空间文件 sidecar | Artifact lifecycle/source delete 依赖已接 APV/DWO/MAR 事实；文件内容读取/编辑、文件级打开继续 GATED | 已可真实收敛；DFE-6B 只做视觉、状态和回归收口 |
| `#/intelligence` | `IntelligenceCenterPage.vue` | `listAgents/listModels` 真实；skills/tools 由 adapter 静态 Mock | Skill catalog、Tool catalog、创建入口和工具 lifecycle 不是完整 Projection；`artifact.preview` 仅应用能力 | 必须继续 GATED，直到 Agent/Skill/TGM Projection 接入 |
| `#/intelligence/robots/:robotId` | `IntelligenceCenterPage.vue` | 由已加载 agent/model 和 route param 投影 | 我创建的机器人、头像、发布、运行统计缺真实 Projection | 部分真实；个人/创建能力继续 GATED |
| `#/intelligence/skills/:skillId` | `IntelligenceCenterPage.vue` | 静态 Mock skills | 技能详情、运行测试、提交发布、已安装/本地/我创建的均非真实业务事实 | 必须继续 GATED |
| `#/intelligence/tools/:toolId` | `IntelligenceCenterPage.vue` | 静态 tool list | Document Tool 状态为手工静态列表；HTTP API/MCP/code tool 管理未接 TGM | 必须继续 GATED 到 TGM |
| `#/intelligence/create-robot` | `IntelligenceCreationPage.vue` | 本地 draft Prototype | 无保存、发布、测试、真实头像上传持久化；本地预览不代表保存成功 | 必须继续 GATED |
| `#/intelligence/create-skill` | `IntelligenceCreationPage.vue` | 本地 draft Prototype | 无真实保存、运行测试、提交发布；对话页不触发真实创建 Skill | 必须继续 GATED |
| `#/knowledge` | `KnowledgeCenterPage.vue` | 生产默认 `GatedKnowledgeAdapter` 返回零条目；Fixture 仅测试/dev | 无 Provider、索引、检索、同步、权限事实；Fixture 必须标记示例数据 | 必须继续 GATED |
| `#/knowledge/:knowledgeId` | `KnowledgeDetailPage.vue` | 生产默认 gated/not found；Fixture 仅测试/dev | sample results 不代表真实检索；未知 id 不回显 | 必须继续 GATED |
| `#/settings` | router redirect | 重定向 `/settings/models` | 无页面业务 | 可收敛为稳定路由行为 |
| `#/settings/models` | `SettingsModelPage.vue` | 真实 `listModels` 粗粒度模型 Projection | personal model CRUD、Key、默认模型、八状态细分仅 fixture/model 函数；无测试连接 | 企业/平台只读可收敛；个人模型继续 GATED |
| `#/settings/personalization` | `SettingsCapabilityGatePage.vue` | `static_product_copy` | 无真实偏好持久化、预览、任务行为注入 | 必须继续 GATED |
| `#/settings/memory` | `SettingsCapabilityGatePage.vue` | `static_product_copy` | 无 Memory Store read/write；不展示假记忆 | 必须继续 GATED |
| `#/settings/feedback` | `SettingsCapabilityGatePage.vue` | `static_product_copy` | 无反馈提交、附件、处理状态 | 必须继续 GATED |
| `#/settings/identity` | `SettingsCapabilityGatePage.vue` | `static_product_copy` | 无 SSO/RBAC/会话凭据/权限 Projection | 必须继续 GATED |
| `#/legacy` | `LegacyWorkbench.ts` | 旧真实 UI wrapper | 临时迁移兜底，不进入最终导航 | DFE-6 应判断是否保留为隐藏维护入口或删除 |
| `#/__design-system` | `DesignSystemGallery.vue` | dev/test only fixtures | 生产路由不得包含 | 仅保留开发验收用途 |

## 3. Mock / Prototype / GATED inventory

| 区域 | 当前文件 | Mock 类型 | 真实依赖 | 删除或替换门槛 |
| --- | --- | --- | --- | --- |
| 工作台授权三模式说明 | `pages/workbench/workbench-model.ts` | GATED product copy | `WORKSPACE-AUTHORIZATION-FEATURE-SPEC-v1.0.md` 后续 Contract/Core `requestedMode` 接入 | Contract 字段、Core 授权策略和 Projection 均验收后，替换为真实选择与 resolved mode 展示 |
| 工作台 Knowledge selection | `WorkbenchCreatePage.vue` / `workbench-model.ts` | 选择字段存在但无真实 Knowledge Provider | Knowledge Provider Feature Spec + Core selection semantics | 真实 Knowledge projection 接入后再允许展示可用知识源选择 |
| 任务列表置顶 | `TasksListPage.vue` / `task-list-model.ts` | 本地视图状态 | Task/session preference persistence Spec | 有持久化 Projection 前继续标注“本次视图置顶” |
| Task Detail 工作空间文件 | `TasksListPage.vue` 右侧 `workspace` tab | DFE-6A 已通过 DFI-1B `window.robothreeDesktopV1Alpha2.getCompatibility/listWorkspaceEntries/openTaskWorkspaceLocation` 展示 Renderer-safe 文件元数据 | 文件内容读取/编辑、文件级打开、路径展示继续禁止 | DFE-6B 只保留回归：feature missing、stale cursor、symlink、Reveal taskId-only 和敏感字段零泄漏 |
| Intelligence skill catalog | `adapters/intelligence-adapter.ts` | 静态 Mock skills | Agent/Skill catalog Projection、install/local/my-created 字段 | Projection 覆盖列表、详情、安装状态和创建来源后删除 mockSkills |
| Intelligence tool catalog | `adapters/intelligence-adapter.ts` | 静态 Mock tools | TGM Tool catalog Projection；Document Tool Registry projection | 真实 Tool catalog 能表达 modelCallable/risk/lifecycle 后删除 mockTools |
| Robot create | `IntelligenceCreationPage.vue` / `intelligence-creation-model.ts` | 本地 draft Prototype | Agent creation Feature Spec + Contract/Core persistence | 保存、发布、头像上传持久化全链路验收后替换 |
| Skill create/detail | `IntelligenceCreationPage.vue` / `intelligence-creation-model.ts` | 本地 draft Prototype | Skill package Feature Spec + runner/test/publish Projection | 运行测试、提交发布、draft revision 真实事实接入后替换 |
| Knowledge center | `adapters/knowledge-adapter.ts` / `knowledge-model.ts` | Gated default + Fixture dev/test | Knowledge Provider Feature Spec、Provider status/query result Projection | 生产 Adapter 可返回真实 configured state 后，fixture 仅留测试 |
| Settings personal model | `SettingsModelPage.vue` / `settings-model-management-model.ts` | GATED personal model copy + detailed status fixture | DFI-4A.2～4A.4 Personal Model/Credential backend + projection | 真实 CRUD、Credential safety、default/effective model Projection 验收后替换 |
| Settings P1 pages | `settings-section-model.ts` | `static_product_copy` gated pages | Personalization/Memory/Feedback/Identity Feature Specs | 对应真实 Adapter/Projection 接入后逐页替换 |
| Design system gallery | `DesignSystemGallery.vue` | Dev fixtures | 无生产依赖 | 必须继续只在 DEV/test route 存在 |
| Legacy wrapper | `LegacyWorkbench.ts` | 迁移兜底，不是业务 Mock | 新 Vue 页面功能完整覆盖 | DFE-6B 编码评审决定隐藏、保留或删除 |

## 4. 可真实收敛与继续 GATED 判定

### 4.1 已可真实收敛

- Desktop shell、五个一级导航、路由、焦点和响应式布局；
- Workbench 的 workspace、session、agent、model、recent task、recent artifact 数据加载；
- Workbench 的 submit turn 基础链路，但不包括真实授权模式选择；
- Tasks list、Task detail、Conversation snapshot、Task control、User confirmation；
- Artifact preview/open/export/lifecycle 的现有 APV/DWO/MAR 路径；
- DFI-1B 已通过 QA 的 Workspace Browser / Reveal v1alpha2 sidecar 已由 DFE-6A 消费，用于替换
  Task Detail 工作空间文件固定占位；
- Settings model 页里的企业/平台 `listModels` 只读展示。

### 4.2 必须继续 GATED

- Workspace/智能授权三模式真实策略；
- Agent/Skill 创建、保存、发布、测试、安装、本地目录和“我创建的”真实事实；
- Tool 管理、HTTP API/MCP/code tool、tool lifecycle 与健康状态；
- Knowledge Provider、真实检索、索引、同步、权限和引用格式；
- Personal Model CRUD、Credential Store、Key reveal、默认模型、有效模型和八状态真实 Projection；
- Personalization、Personal Memory、Feedback、Identity / SSO / RBAC；
- DFI-2B、DFI-3、DFI-4A.2～4A.4 尚未交付的后端能力。

## 5. 状态覆盖盘点

| 页面组 | Loading | Empty | Error | Disabled | Permission denied | Unavailable | Partial | DFE-6 盘点要求 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Workbench | 已有 loading/busy | 无 workspace/no catalog | adapter error | submit disabled reasons | 依赖 workspace/model/agent projection | unavailable model | recent data 可为空 | 验证文案不把 disabled 当 failure |
| Tasks list | load pending | no tasks / filtered | adapter error | delete/cancel disabled | 无独立权限态 | API unavailable -> error | sessions/tasks 部分为空 | 保持任务术语，不回退“会话” |
| Task detail | detail/snapshot loading | no artifacts/messages | control/preview errors | unavailable controls | confirmation/action projection | artifact unavailable | artifact preview partial | 验证 preview/lifecycle 状态不泄漏路径 |
| Intelligence | catalog loading | filtered/empty | adapter error | create buttons gated | fixture-only | fixture-only | fixture-only | 真实 agents 与 mock skills/tools 可区分 |
| Knowledge | gated default no loading in prod | fixture empty only | fixture error only | no real actions | fixture only | fixture only | fixture only | 生产默认不得展示搜索/详情/fixture |
| Settings models | model list loading | no model | adapter error | personal actions disabled | fixture detailed status only | coarse unavailableReason | not supported | name 不伪装 provider model id |
| Settings gated pages | no real loading | static page no data | not applicable | all business actions disabled | not real | capability gated | not real | runtimeStatus 与 capabilityState 分开 |

## 6. 五个一级导航最终验收清单

DFE-6B 编码前，视觉验收必须覆盖以下窗口尺寸：

- `1180 x 760`：默认桌面窗口，正式验收尺寸；
- `900 x 600`：紧凑桌面窗口，正式验收尺寸；
- `680 x 560`：非承诺诊断尺寸，只用于发现窄窗口布局退化；不作为 MVP 支持窗口承诺。

| 一级导航 | 最终视觉 | 键盘与焦点 | 窗口尺寸验收 |
| --- | --- | --- | --- |
| 工作台 | Composer、selection、recent 区块密度一致；GATED 授权说明持续可见 | Tab 顺序：nav -> composer -> selectors -> submit -> recent | 900 宽不横向滚动；680 仅诊断 selection 是否可换行 |
| 任务 | 列表、筛选、详情区域层级清楚；本地置顶标识不冒充持久化 | 列表项可键盘打开；危险操作有明确确认 | 1180 下列表/详情平衡；900 下操作按钮不溢出 |
| 智能中心 | 机器人/技能/工具分区一致；Mock/GATED 标识可见但不使用内部术语污染用户文案 | 分区切换、卡片、详情返回可键盘访问 | 900 下卡片单列或双列稳定；680 仅诊断横向滚动风险 |
| 知识中心 | 生产默认未配置/GATED；Fixture 场景与真实空态可区分 | 搜索仅在 Fixture 场景出现且有 accessible label | 默认 gated 页面在三尺寸下不出现空白或假列表 |
| 设置 | 二级 RouterLink 导航一致；模型页与四个 gated 页共享布局 | `aria-current=page`，焦点环可见；禁用原因持续可见 | 900 下二级导航可换行；680 仅诊断单列不 sticky 风险 |

## 7. DFI 依赖映射

| 后端批次 | 可能影响的前端区域 | 前端等待内容 | 当前处理 |
| --- | --- | --- | --- |
| DFI-1B | Task Detail 右侧工作空间文件树与打开工作空间位置 | 已 PASS/CLOSED 的 v1alpha2 sidecar：`getCompatibility`、`listWorkspaceEntries`、`openTaskWorkspaceLocation`；features `task_workspace_browser/task_workspace_reveal` | DFE-6A 已消费；DFE-6B 只做回归，确保 `listWorkspaceEntries` 只允许 Renderer 提交 `taskId/parentEntryId?/cursor?/limit?`，`openTaskWorkspaceLocation` 只允许 Renderer 提交 `taskId` 和固定命令元数据；不得提交路径或 workspaceGrantId |
| DFI-2B | Workbench 授权模式、Task submission、workspace/authority 投影 | 是否新增或暴露 authorization requested/resolved mode、workspace browser/authority 状态 | DFE-6.0 只列依赖；不新增字段、不改 submit payload |
| DFI-3 | Task/Agent loop、恢复、authorization-aware observation | Task detail 是否新增恢复/授权状态、confirmation 文案或 task step 状态 | 等后端 Projection 冻结后再做页面接入 |
| DFI-4A.2 | Personal Credential Broker / Keychain lifecycle | Settings personal model 的真实 Credential 创建、保存、错误与安全摘要 | 当前 Personal Model 区保持 GATED，无真实 Key 输入 |
| DFI-4A.3 | Provider adapter / model invocation validation | 八种模型状态、网络失败重试、模型不存在、协议不兼容等真实来源 | 当前八状态只在 ViewModel fixture/test，不进真实列表 |
| DFI-4A.4 | Default/effective personal model projection and recovery | 用户默认模型、机器人临时有效模型、Key reveal/删除后恢复状态 | 当前不提供设默认、查看 Key、删除或保存成功 |

DFI-4A.1 Revision 3.2 由后端负责人接管；DFE-6.0 不继续修订 DFI-4A.1 文档，也不参与后端 Domain、Contract、migration、Persistence 或恢复方案。

## 8. 后续编码拆分

### 8.1 DFE-6A：现有接口真实数据收敛（PASS/CLOSED）

DFE-6A 只允许使用已经通过 QA 并已存在的接口做真实数据收敛，不等待 DFI-2B、DFI-3 或 DFI-4A
全部完成。

优先范围：

- 在 Task Detail 右侧面板接入 DFI-1B v1alpha2 Workspace Browser；
- 删除固定工作空间文件占位；
- Adapter 增加 v1alpha2 sidecar 包装和 feature negotiation，但不新增 Contract、IPC、Main、Preload 或 Core；
- UI 只展示 Renderer-safe 文件元数据；
- Reveal 只调用 `openTaskWorkspaceLocation(command)`，不展示或传递路径；
- 失败关闭到 typed safe summary；feature unavailable 时显示 GATED/Unavailable，不 fallback 到占位假文件列表。

DFE-6A 不做：

- 视觉最终收口；
- 五导航全量键盘矩阵；
- remaining Mock inventory 最终删除；
- DFI-2B/DFI-3/DFI-4A 接口预接；
- Knowledge Provider、Personal Model、TGM、Agent/Skill 创建接入。

### 8.2 DFE-6B：Frontend Experience Foundation 最终收口（PASS/CLOSED）

正式方案：[DFE-6B Frontend Foundation Closeout Plan](./DFE-6B-FRONTEND-FOUNDATION-CLOSEOUT-PLAN.md)。

DFE-6B 在 DFE-6A 后执行，目标是关闭 Frontend Experience Foundation，而不是关闭所有业务后端能力。

范围：

- 五个一级导航的最终视觉、键盘、焦点、ARIA 和窗口尺寸验收；
- Loading / Empty / Error / Disabled / Permission denied / Unavailable / Partial 状态矩阵补齐；
- remaining Mock / Prototype / GATED inventory 最终确认；
- 删除已被真实接口替换的 Mock，保留必须继续 GATED 的壳；
- 判断 `LegacyWorkbench.ts` 删除、隐藏或保留维护入口；
- 完成 Frontend Living Spec 最终状态更新和截图基线。

DFE-6B 关闭后只能声明：

```text
Frontend Experience Foundation PASS/CLOSED
```

不得声明以下能力完成：

- DFI-2B、DFI-3、DFI-4A.2～4A.4；
- Personal Model/Credential 全链路；
- Knowledge Provider / 真实检索；
- Agent/Skill 创建、测试、发布；
- TGM Tool 管理；
- OS Sandbox；
- formal installer / production package。

## 9. 安全与边界扫描

DFE-6A/DFE-6B 编码前后必须保留以下扫描要求：

- Renderer 不新增 `fs`、`child_process`、`net`、`tls`、`http`、`https`、`sqlite`、任意 shell 或任意 IPC；
- 不新增 Main、Preload、Core、Contracts、Central、Document Worker、SQLite migration；
- 生产页面不得使用 `localStorage` 或本地数组冒充业务持久化；
- Mock failure 不得 fallback 为未标记的成功数据；
- 禁止真实 Key、Credential Reference、Secret、workspace root、root real path、provider endpoint、raw chunk、request digest 进入 DOM、日志、测试快照或 visual evidence；
- 允许产品文案出现 “API Key / Token / Credential / 权限 / 身份” 等词，但禁止真实敏感值形态；
- 不使用 `innerHTML`、`v-html`、`eval`、`new Function`、`iframe` 非 APV sandbox 用途、`fetch` 直连 Provider。

## 10. DFE-6.0 文件边界

DFE-6.0 允许修改：

- `docs/development/frontend/DFE-6.0-DESKTOP-CLOSURE-PLAN.md`
- `docs/development/frontend/DESKTOP-FRONTEND-DEVELOPMENT-PLAN.md`
- `docs/development/frontend/FRONTEND-LIVING-SPEC.md`
- `docs/development/DEVELOPMENT-LOG.md`

DFE-6.0 禁止修改：

- `apps/**`
- `services/**`
- `packages/**`
- `pnpm-lock.yaml`
- `package.json`
- `tsconfig.json`
- Main / Preload / IPC / Core / Contracts / Central / SQLite migration
- DFI-4A.1 Revision 3.3 或任何后端方案实现

## 11. DFE-6A/DFE-6B 编码授权前验收问题

1. 上述 inventory 是否完整覆盖当前生产路由和 dev-only route？
2. 哪些 Mock 可在 DFE-6 删除，哪些必须保留为 GATED 壳？
3. `LegacyWorkbench.ts` 是否在 DFE-6 删除、隐藏还是保留为维护入口？
4. Tool catalog 是否等待 TGM，还是只保留 Document Tool 静态展示？
5. Knowledge 生产默认是否继续只显示 Unconfigured/Gated？
6. Settings P1 四页是否继续只保留 `static_product_copy`？
7. DFE-6A 是否只消费 DFI-1B 已通过 QA 的 v1alpha2 sidecar，并删除 Task Detail 固定文件占位？
8. DFI-2B、DFI-3、DFI-4A.2～4A.4 是否已有前端可消费 Projection？
9. DFE-6A/6B 编码是否仍只限 Renderer/tests + 独占共享文件收口？

## 12. 工期估算

DFE-6.0 Revision 1 为文档盘点：0.5～1 个集中工程日。

后续 DFE-6A/6B 编码若获授权，建议按 4～7 个集中工程日拆分：

- DFE-6A：1.5～2.5 天，接入 DFI-1B 工作空间文件树、删除固定占位、补 focused tests；
- DFE-6B：2.5～4.5 天，五导航视觉/键盘/状态矩阵/remaining Mock inventory 最终收口；
- 共享文件收口、build/check/lint 和截图基线包含在各自批次末尾。

上述估算不包含后端 DFI 接入、独立 QA、返工和用户现场验收。

## 13. 当前结论

DFE-6.0 Revision 1 只形成 Desktop Closure Plan 和 Mock/Prototype/GATED inventory。

```text
DFE-6.0: DOCUMENT PLAN ONLY / REVISION 1 REVIEW PASS
DFE-6A: PASS/CLOSED
DFE-6B: PASS/CLOSED
DFE-6: PASS/CLOSED
DFI-2B / DFI-3 / DFI-4A.2～4A.4: GATED
TGM-1+: GATED
```

DFE-6B 已实现、独立 QA PASS 并由用户接受关闭。后端 DFI 编码仍需用户单独授权。
