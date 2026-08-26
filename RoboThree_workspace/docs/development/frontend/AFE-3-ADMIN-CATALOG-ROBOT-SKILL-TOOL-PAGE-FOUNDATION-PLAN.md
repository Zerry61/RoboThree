# AFE-3 Admin Catalog / Robot / Skill / Tool Page Foundation 详细方案

状态：DOCUMENT PLAN ONLY / CODING GATED  
日期：2026-08-25  
负责人：Codex 5.6  
范围：RoboThree Admin Console 的工具管理、机器人管理、技能管理页面基础方案；复用 AFE-2 通用组件和页面状态基础。  
当前动作：仅输出文档评审材料，不编码，不修改运行时代码、依赖、版本、CHANGELOG 或 DEVELOPMENT-LOG。  
上游依据：AFE-0 / AFE-1.0 / AFE-1.1 / AFE-2 均 `PASS/CLOSED`；当前 workspace root check 基线已恢复可信且全绿；AAPI-0.3～0.4、TGM、Knowledge Provider、production identity 继续 GATED。

## 1. 目标

AFE-3 的目标是在正式 Admin 工程和 AFE-2 通用组件基础上，建设工具管理、机器人管理和技能管理的页面基础，使后续真实 Adapter / Projection 接入前，页面结构、状态、权限、敏感边界和测试门禁先稳定下来。

本批不实现真实业务闭环。页面可展示明确标注的 Prototype/GATED fixture 和 `unavailable` / `partial` / `disabled` / `permissionDenied` 状态，但不得伪造保存、测试、启用、停用、上传、解析、发布、安装、发现、同步或检索成功。

| 编号 | 目标 | 成功判定 |
| --- | --- | --- |
| G-01 | 工具管理统一列表和详情基础。 | 六列聚合表格、代码/HTTP/MCP 三来源展示、详情分区和 GATED 操作，均不展示 Endpoint、Credential、Runtime Handle。 |
| G-02 | Tool 新增入口和 GATED 创建壳。 | “新增 Tool”只提供“连接 API”和“连接 MCP 服务”；代码 Tool 不可新增；HTTP 两步和 MCP 三步页面可达但真实提交禁用。 |
| G-03 | 机器人管理列表、详情、创建/编辑壳。 | 四项限制开关默认关闭；开启后才显示选择入口；关闭文案为“未设置机器人级限制”。 |
| G-04 | 技能管理列表、详情、上传/编辑壳。 | 只保留“上传技能包”入口；展示格式/200 MB/解析结果只读边界；不读取或执行真实包。 |
| G-05 | Catalog 选择与展示基础。 | 资源选择、多选、空允许列表警告和不可用资源摘要为纯前端 presentation，数据只能来自 Adapter/Fixture。 |
| G-06 | Adapter / Fixture / Mock 边界。 | production 默认仍走 `UnavailableAdminAdapter`；Fixture 只在测试/视觉/显式 prototype 路径使用。 |
| G-07 | 安全、可访问性和 Vue 2/3 隔离门禁。 | Admin package gates、Desktop Vue 3 回归、root check 全部作为编码后硬门禁。 |

## 2. 非目标

1. 不接真实 Admin API、Central HTTP Controller、AAPI-0.3～0.4、TGM、Knowledge Provider、Credential Store 或 production identity。
2. 不修改 Contract、Core、Central、Desktop、Electron Main、Preload、IPC、Document Worker、migration 或 root workspace 配置。
3. 不新增依赖，不修改 root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`。
4. 不实现真实 CRUD，不写 LocalStorage / SessionStorage / IndexedDB，不用前端数组伪装业务持久化。
5. 不让管理员上传、粘贴、编写、安装或执行任意代码工具。
6. 不在工具页接收真实 Endpoint、Token、API Key、访问令牌、生产 cURL 或 Credential。
7. 不在技能页读取真实压缩包、解压、解析 `SKILL.md`、执行脚本、保存草稿或发布。
8. 不把机器人创建、技能上传或 Tool 连接的 Prototype 流程宣传为真实业务能力。
9. 不改模型管理、知识管理、系统管理业务页面；如需共享组件，仅限 `apps/admin-console/**` 内的通用 UI/presentation。

## 3. 当前代码事实

| 类别 | 当前事实 | AFE-3 采用口径 |
| --- | --- | --- |
| Admin 工程 | `apps/admin-console/**` 已为正式 Vue 2.7 工程。 | 不重新 scaffold，不改技术栈。 |
| AFE-2 组件 | 已有 `AdminTable`、`TableToolbar`、`TablePagination`、`FieldShell`、`TextInput`、`SelectShell`、`SecretStatus`、`OperationGate`、`ModalShell`、`DrawerShell` 等。 | 页面必须优先复用这些组件，不另造表格/表单/弹窗基础。 |
| 当前页面 | `/tools`、`/tools/:toolId`、`/robots`、`/robots/:robotId`、`/skills`、`/skills/:skillId` 仍是 `PageScaffold` 壳。 | AFE-3 才允许在这些页面放入列表/详情/创建壳。 |
| 当前路由 | AFE-1.1 仅有 list/detail；AFE-0 建议过 `/tools/new/api`、`/tools/new/mcp`、`/robots/new`、`/skills/new/upload` 等。 | AFE-3 可规划新增这些路由，但 coding 仍需单独授权。 |
| Adapter | 默认 `UnavailableAdminAdapter`，Fixture 不进入 production 默认路径。 | AFE-3 页面仍通过 Adapter 或明确 fixture 输入，不直接 `fetch`。 |
| 权限 | 菜单、路由、操作三层分离。 | AFE-3 只能消费 operation decision，不新增权限事实来源。 |

## 4. 文件允许与禁止范围

### 文档评审阶段

当前只允许新增本方案文件。不得修改代码、测试、依赖、版本、CHANGELOG 或 DEVELOPMENT-LOG。

### 若后续获得编码授权

| 允许路径 | 用途 |
| --- | --- |
| `apps/admin-console/src/pages/tools/**` | Tool 列表、详情、连接 API、连接 MCP 服务、策略/连接壳。 |
| `apps/admin-console/src/pages/robots/**` | 机器人列表、详情、创建、编辑、审核壳。 |
| `apps/admin-console/src/pages/skills/**` | 技能列表、详情、上传、编辑、审核壳。 |
| `apps/admin-console/src/components/**` | 页面级 domain shell、resource picker、限制开关、只读摘要组件。 |
| `apps/admin-console/src/presentation/**` | 纯展示 mapping、页面 view model、状态/文案/tone/ARIA 数据。 |
| `apps/admin-console/src/types/**` | Admin UI-only 或 prototype fixture 类型，不冒充 Contract。 |
| `apps/admin-console/src/fixtures/**`、`apps/admin-console/fixtures/**` | 明确 fake/sentinel 的 Prototype/GATED 数据与测试 fixture。 |
| `apps/admin-console/tests/**` | 页面、路由、component、presentation、static、accessibility 测试。 |
| `apps/admin-console/scripts/static-scan.mjs` | 仅在新增敏感规则时调整。 |

| 禁止路径 | 原因 |
| --- | --- |
| `apps/desktop/**` | Desktop 客户端前端不归本批。 |
| `services/core/**`、`services/central-service/**` | AFE-3 不接后端。 |
| `packages/contracts/**`、`contracts/**`、`docs/architecture/contracts/**` | 本批不冻结新 Contract。 |
| `apps/desktop/src/main/**`、`apps/desktop/src/preload/**`、Desktop IPC / Private Contract | Admin Browser 不依赖 Electron。 |
| `services/document-worker/**` | PTX / Document Worker 不在本批。 |
| `migrations/**`、Central migration 目录 | 无数据库变更。 |
| root `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` | 不新增依赖或 workspace 配置。 |
| `README.md`、`CHANGELOG.md`、`docs/development/DEVELOPMENT-LOG.md` | 仅编码完成并 QA 后按收口窗口更新；方案阶段不改。 |

## 5. 页面与路由范围

AFE-3 仍使用六项一级导航，不新增一级入口。系统管理不受本批影响。

| 模块 | 路由 | 本批页面意图 | 状态 |
| --- | --- | --- | --- |
| 工具管理 | `/tools` | 统一 Tool 表格列表；三来源聚合展示；新增入口 GATED。 | P0 / Prototype-GATED |
| 工具管理 | `/tools/:toolId` | Tool 详情，只读摘要、治理摘要、技术详情折叠、操作 disabled。 | P0 / Prototype-GATED |
| 工具管理 | `/tools/new/api` | HTTP API 两步创建壳，cURL 快速导入仅演示解析状态，不接真实 Endpoint。 | GATED |
| 工具管理 | `/tools/new/mcp` | MCP 三步创建壳，真实验证/发现禁用；可有“查看演示结果”固定 Fixture。 | GATED |
| 工具管理 | `/tools/:toolId/policy` | 策略壳：范围和确认策略只读/disabled，不保存。 | GATED |
| 机器人管理 | `/robots` | 机器人表格列表，搜索/筛选/分页 shell。 | P0 / Prototype-GATED |
| 机器人管理 | `/robots/new` | 创建机器人壳，基础信息 + 四项限制开关。 | P0 / Prototype-GATED |
| 机器人管理 | `/robots/:robotId` | 机器人详情，能力摘要、草稿/发布信息、安全状态。 | P0 / Prototype-GATED |
| 机器人管理 | `/robots/:robotId/edit` | 编辑壳；已发布机器人进入新草稿语义，真实保存 disabled。 | GATED |
| 机器人管理 | `/robots/:robotId/review` | 审核壳；不发布、不拒绝、不写状态。 | GATED |
| 技能管理 | `/skills` | 技能表格列表，主操作“上传技能包”。 | P0 / Prototype-GATED |
| 技能管理 | `/skills/new/upload` | 上传/解析壳，显示格式和大小，不读取真实包。 | GATED |
| 技能管理 | `/skills/:skillId` | 技能详情，展示信息与解析结果只读区。 | P0 / Prototype-GATED |
| 技能管理 | `/skills/:skillId/edit` | 编辑技能信息壳，只允许展示字段结构，保存 disabled。 | GATED |
| 技能管理 | `/skills/:skillId/review` | 审核壳，不测试、不发布、不固定 revision。 | GATED |

如编码授权只允许更小范围，可优先实现 list/detail，再单独授权 create/edit/review 壳。

## 6. Prototype/GATED 数据边界

| 数据类别 | 允许 | 禁止 |
| --- | --- | --- |
| Tool fixture | 固定 fake Tool，如 `fake_tool_document_pdf`；三来源、状态、风险、范围摘要均明确 `prototype/gated`。 | 真实 Endpoint、Credential Reference、Runtime Handle、内部 Adapter path、真实 schema digest。 |
| HTTP API fixture | 非生产域名、无真实 Secret 的示例 cURL；解析结果只能留在内存组件状态或测试 fixture。 | 接收/保存真实 Endpoint、Token、API Key、Cookie、Basic Auth。 |
| MCP fixture | 固定 discovery 演示结果，可显示读取/写入/删除/外发风险摘要。 | 真实连接、真实发现、远程请求、本地 Command/Arguments。 |
| Robot fixture | 固定 fake 机器人、草稿/发布摘要、四项限制开关演示。 | Prompt/System Prompt、真实用户/部门、真实模型/Tool/Knowledge 权限事实。 |
| Skill fixture | 固定 fake 技能包解析结果、文件清单摘要、`SKILL.md` 只读片段。 | 读取真实压缩包、展示真实本地路径、执行脚本、保存草稿或发布成功。 |

所有 fixture 页面必须持续展示“演示数据 / 待接入”或可被 QA 检测的 `prototype/gated` 标识。production 默认路径仍应返回 Unavailable/Gated。

## 7. Tool 管理页面方案

### 7.1 统一列表

Tool 列表固定 6 列：

| 列 | 内容 | 安全边界 |
| --- | --- | --- |
| Tool | 标题 + 技术名称。 | 技术名可展示；不得展示 internal binding path。 |
| 接入方式 | 接入来源 + 执行位置。 | 来源和执行位置分开，不混成一个“类型”。 |
| 状态 | 配置、验证、健康、生效四组摘要。 | 不压缩成“正常”；未知时显示待接入或暂不可用。 |
| 治理 | 风险摘要 + 使用范围。 | 风险来自 fixture/projection，不允许管理员手写扩大能力。 |
| 更新时间 | policy 或技术 revision 更新时间。 | Prototype 使用固定假时间。 |
| 操作 | 查看、配置、启停、测试入口。 | 真实操作 disabled；代码 Tool 不展示管理员测试。 |

搜索只按页面内 fixture 过滤时必须标注“演示筛选”，不得宣传为真实 Catalog 查询。执行位置、四组状态、风险和使用范围可进入 `DrawerShell` 的“更多筛选”壳，但不持久化筛选。

### 7.2 新增 Tool

主操作“新增 Tool”只提供：

```text
连接 API
连接 MCP 服务
```

不得提供“代码工具”“上传代码”“从 GitHub 安装”“本地 MCP”“Command/Arguments”“依赖安装”入口。代码工具只能作为可信发布后自动登记的列表项出现。

### 7.3 HTTP API 两步壳

| 步骤 | 展示 | 禁止 |
| --- | --- | --- |
| 基础配置 | 工具标题、工具名称、工具描述、能力边界。 | 保存草稿、唯一性真实校验。 |
| 连接配置 | API 访问地址、认证类型、GET/POST、参数、使用范围、cURL 快速导入卡片。 | 真实 Endpoint/Secret 输入、联网解析、保存、测试、启用。 |

cURL 演示只允许固定 fake 示例；“解析并填入”只能产生本地表单演示状态，不产生 Toast 成功，不写浏览器持久化，不宣称已连接、已保存、已测试或已启用。

### 7.4 MCP 三步壳

| 步骤 | 展示 | 禁止 |
| --- | --- | --- |
| 验证并发现工具 | 服务名称、远程服务地址、认证方式；真实验证按钮 disabled。 | 本地 Command/Arguments、真实 Token/API Key、真实网络连接。 |
| 选择 Tool | 搜索、选择全部只读工具、取消选择、风险摘要。 | 无差别全选、Schema diff 伪装真实发现。 |
| 设置范围并保存草稿 | 所有人/指定范围、额外确认策略、风险只读汇总。 | 保存成功、发布、启用、手写风险、自由文本用户名。 |

演示 discovery 只能通过“查看演示结果”载入固定 `prototype/gated` fixture。

### 7.5 详情与策略

Tool 详情默认展示管理员决策字段：名称、说明、来源、执行位置、风险、范围、启用/验证/健康/生效摘要。Binding、AdapterDescriptor、digest、Server identity、Schema digest、内部 revision 放入默认折叠“技术详情”，且只读。

代码 Tool 不显示测试、保存草稿、删除企业登记。HTTP/MCP 的测试、启停、保存都显示 disabled/gated，且说明真实 TGM 未接入。

## 8. 机器人管理页面方案

### 8.1 列表

机器人管理使用表格，展示名称、来源/创建人、简介、范围/草稿摘要、更新时间、操作。根据 Frontend Spec，机器人列表、卡片和选择项不展示状态标签；不可用、维护中或草稿等事实通过操作禁用、原因说明、详情信息表达。

### 8.2 创建/编辑壳

基础字段沿用产品业务名称：

- 头像；
- 名称；
- 标签；
- 简介；
- 行为与规则；
- 发布范围；
- 草稿版本。

不得使用“一句话说明”“Instructions/System Prompt”“关联技能”“关联工具”等旧主字段名称。

### 8.3 四项限制开关

固定四行：

```text
默认模型
技能
工具
知识
```

默认均关闭并收起。关闭表示“未设置机器人级限制”，不表示“无”或“禁止全部”。开启后才显示添加入口和搜索多选壳；开启且没有选择时显示“该机器人将不能使用任何此类资源”的就近提示。关闭后可保留草稿选择但不生效，再次开启恢复。

资源选择只展示已发布/已启用/当前可引用的安全摘要 fixture；不得显示 Prompt、Credential、Endpoint、内部路径或 raw policy key。

### 8.4 详情、编辑与审核

已发布机器人进入编辑时创建新草稿语义，不直接修改当前发布版本。AFE-3 只展示页面结构和 disabled 操作，不保存、不测试、不发布、不审核通过或拒绝。

## 9. 技能管理页面方案

### 9.1 列表

技能列表使用表格，主操作只保留“上传技能包”。不得同时提供“创建企业技能”空白编辑器或“导入技能包”并列入口。

### 9.2 上传壳

上传页展示：

- 支持格式：`.zip`、`.rar`、`.tar.gz`、`.tgz`；
- 单包上限：200 MB；
- 主操作文案：“选择技能包”；
- 解析通过后的下一步文案：“下一步：编辑技能信息”。

AFE-3 不读取真实包、不解压、不解析 `SKILL.md`、不执行脚本、不保存草稿。文件选择控件可 disabled，或只接受固定 fake fixture 路径文本；不得诱导管理员选择真实技能包。

### 9.3 解析结果只读区

只读区规划展示：

- 技能名称；
- `SKILL.md` 摘要或 Markdown 预览；
- 压缩包名称；
- 包内版本声明；
- 文件清单摘要；
- 完整性摘要；
- 校验结果。

未声明包内版本显示“未声明”，不得作为校验失败。文件清单默认隐藏 `__MACOSX`、`.DS_Store`、`._*`、`PaxHeader` 等工具元数据；安全校验说明仍保留。

错误文案必须区分：

```text
包内未找到 SKILL.md
检测到多个 SKILL.md，当前只支持单技能包
已找到 SKILL.md，但读取失败
已找到 SKILL.md，但 Markdown 解析失败
```

### 9.4 编辑与审核壳

编辑页允许展示字段结构：技能标题、技能描述、企业发布版本、使用范围。技能名称、`SKILL.md` 正文、文件清单和校验事实只读。保存草稿、测试、发布和固定 revision 均 disabled/gated，不显示成功状态。

已发布技能不原地编辑；新版本通过“上传新版本”重新进入上传、解析和编辑流程。

## 10. Catalog 选择与限制组件

AFE-3 可以建设通用 domain shell，供机器人限制开关、Tool/Skill/Knowledge 选择、MCP discovery 多选复用：

| 组件 | 职责 | 边界 |
| --- | --- | --- |
| `ResourceLimitToggle` | 关闭/开启/空允许列表警告/已选摘要。 | 不自行持久化或推断权限。 |
| `ResourcePickerDrawer` | 搜索、多选、移除、不可用原因。 | 只接收 safe fixture/projection；不 fetch。 |
| `CatalogSummaryTable` | 统一列表 safe rows。 | 不承载真实查询或分页 cursor。 |
| `TechnicalDetailsDisclosure` | 折叠展示只读技术摘要。 | 不展示 Secret、Credential Reference、内部路径。 |
| `PrototypeGateNotice` | 页面持续标注演示/待接入。 | 不替代真实状态。 |

这些组件仍属于 `apps/admin-console/**`，不共享给 Desktop。

## 11. Adapter / Fixture / Mock 边界

| 类型 | AFE-3 允许 | 禁止 |
| --- | --- | --- |
| `AdminAdapter` | 规划扩展 list/detail/gated action 的接口形状，但编码时仍可保持 unavailable 默认。 | 真实 HTTP、Central endpoint、直接 fetch。 |
| `UnavailableAdminAdapter` | production 默认返回 unavailable/gated。 | 返回 fake rows 冒充真实业务。 |
| `FixtureAdminAdapter` | 测试、视觉、显式 prototype 页面。 | 生产默认 import。 |
| Prototype data | 固定 fake/sentinel，带 `prototype/gated`。 | 混入真实企业、真实 Secret、真实 Endpoint、真实本地路径。 |
| Page-local state | 仅用于非敏感 UI 展开/收起、当前步骤、演示筛选。 | 保存业务事实、Credential、原始 cURL、上传文件、发现结果。 |

页面必须通过 Adapter 或明确 fixture 输入获取业务展示数据。组件不得直接调用 Adapter；组件只接收 presentation props。

## 12. 页面状态矩阵

| 状态 | Tool | Robot | Skill |
| --- | --- | --- | --- |
| Loading | 表格 skeleton；新增入口 disabled。 | 表格 skeleton；创建入口 disabled。 | 表格 skeleton；上传入口 disabled。 |
| Empty | 仅真实 ready 且无记录时使用；Prototype 不冒充。 | 无机器人时说明待真实接入。 | 无技能时说明待真实接入。 |
| Ready | 只表示页面结构或 prototype fixture ready。 | 只表示壳层 ready。 | 只表示壳层 ready。 |
| Unavailable | TGM/AAPI 未接入；真实操作 disabled。 | Projection 未接入。 | 上传/解析服务未接入。 |
| Permission denied | 路由可访问但操作无权限时页面持久说明。 | 创建/审核操作禁用。 | 上传/审核操作禁用。 |
| Error | safe summary + correlation id；不展示 raw error。 | 同左。 | 同左。 |
| Disabled | 保存、测试、启停、上传、发布等动作 disabled/gated。 | 保存/测试/发布 disabled。 | 上传/保存/测试/发布 disabled。 |
| Partial | 可看 fixture 或只读摘要，关键操作待接入。 | 四项限制 UI 可演示，保存待接入。 | 解析结果 UI 可演示，真实解析待接入。 |

## 13. 敏感信息边界

AFE-3 必须继续拒绝以下内容进入页面 DOM、presentation output、fixture 默认路径、测试快照、URL、Router state、日志或错误：

- Token、Bearer Token、API Key、访问令牌、Private Key、Secret、签名材料；
- Credential value、Credential Reference 字符串、mask、last4、copy/reveal 材料；
- 真实 Endpoint、生产 cURL、Cookie、Basic Auth、headers、request body、完整响应；
- Runtime Handle、Adapter path、Binding internal path、内部绝对路径、stack trace；
- Prompt、System Prompt、Tool payload、raw observation、CapabilityLock、audit sensitive detail；
- 真实本地文件路径、真实技能压缩包内容、包内脚本执行结果；
- 浏览器自报身份、OS user、LocalStorage / SessionStorage / IndexedDB 中的业务事实。

允许展示：

- 中文产品术语“凭据”“访问令牌”“API Key”“权限”等；
- 类型名或测试名里的 `Credential` / `Token`，不含真实或疑似真实值；
- `configured` / `missing` / `unavailable` 等枚举；
- 固定 fake/sentinel，如 `fake_tool_alpha`、`fake_robot_alpha`、`fake_skill_alpha`。

## 14. 可访问性与交互验收

| 项 | 要求 |
| --- | --- |
| 列表 | 表格 caption、column header、loading busy、empty note。 |
| 筛选 | 搜索输入 label，更多筛选 Drawer 标题和关闭按钮。 |
| 多选 | checkbox label、已选摘要、移除按钮 aria-label。 |
| 步骤 | HTTP/MCP/Skill 上传步骤有当前步骤标识，不依赖颜色。 |
| 禁用操作 | button disabled + 安全原因，不只降低透明度。 |
| Dialog/Drawer | 使用 AFE-2 shell，Esc/关闭/标题关联。 |
| 技术详情 | disclosure 标题清楚，默认折叠但键盘可访问。 |
| 文案 | 不用 Toast-only 表达阻断；错误、权限、待接入使用持久页面信息。 |

## 15. 测试计划

### Admin package 门禁

| 命令 | 目标 |
| --- | --- |
| `CI=true pnpm --filter @robothree/admin-console typecheck` | TS strict + Vue 2.7 SFC typecheck。 |
| `CI=true pnpm --filter @robothree/admin-console typecheck:negative` | 负向 fixture 仍有效。 |
| `CI=true pnpm --filter @robothree/admin-console build` | Vite production build。 |
| `CI=true pnpm --filter @robothree/admin-console test` | 页面、component、presentation、router、a11y、static tests。 |
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

如本地 sandbox 因 loopback、Keychain、Electron 或 pnpm store 权限失败，必须标记为 NOT RUN / ENV BLOCKED，并在真实权限环境补跑；不得把 NOT RUN 记为 PASS。

## 16. 最小测试覆盖

| 测试域 | 必须覆盖 |
| --- | --- |
| Router | 新增路由可达；父导航选中；无权限进入 Permission denied；系统管理不受影响。 |
| Tool list | 六列聚合、三来源、四组状态可区分、Endpoint/Credential/Runtime 不出现。 |
| Tool create | 新增菜单只有连接 API / 连接 MCP；代码 Tool 无新增入口。 |
| HTTP shell | 两步、cURL 演示解析不等于保存/测试/启用；真实 Secret/Endpoint 禁止。 |
| MCP shell | 三步、远程 MCP-only、真实验证 disabled、查看演示结果标注 `prototype/gated`。 |
| Robot pages | 四项限制开关默认关闭；开启显示选择入口；空允许列表警告；关闭文案正确。 |
| Skill pages | 上传入口唯一；格式/200 MB；解析结果只读；错误文案四类区分；不读取真实包。 |
| Operation gate | 保存/测试/启停/上传/发布/审核均 disabled/gated，点击不产生成功。 |
| Presentation | source/status/tone/label 穷尽；新增状态未处理时 TS 编译失败。 |
| Adapter boundary | 页面无 direct fetch；Fixture 不进 production 默认路径。 |
| Sensitive scan | 正向检出 Endpoint/Token/API Key/CredentialRef/path/stack/raw cURL；反向产品术语不误报。 |
| Accessibility | 表格、步骤、Drawer/Dialog、多选、禁用原因、技术详情 keyboard/ARIA。 |

## 17. 实施顺序建议

若后续获授权编码，建议按以下顺序执行：

1. 记录当前 Admin / Desktop / root 可信基线。
2. 新增 AFE-3 page/domain presentation 类型与 safe fixture。
3. 扩展 router：按授权范围新增 Tool / Robot / Skill 二级路由。
4. 实现 Tool 列表与详情壳，锁定新增菜单边界。
5. 实现 HTTP API 两步和 MCP 三步 GATED 壳。
6. 实现 Robot 列表、详情、创建/编辑壳和四项限制开关。
7. 实现 Skill 列表、上传、详情、编辑壳和解析结果只读区。
8. 补组件、路由、presentation、static、a11y 测试。
9. 运行 Admin package gates。
10. 运行 Desktop Vue 隔离、Desktop build/tests 和 root check。
11. 完成实施报告；编码收口窗口再更新版本/CHANGELOG/DEVELOPMENT-LOG。

## 18. 工期估算

| 阶段 | 估算 |
| --- | --- |
| Presentation/types/fixtures/router | 1～1.5 天 |
| Tool list/detail/API/MCP shells | 2～3 天 |
| Robot list/detail/create/edit shells | 1.5～2 天 |
| Skill list/upload/detail/edit shells | 1.5～2 天 |
| Static/a11y/component/router tests | 1.5～2 天 |
| Workspace gates/report/QA 修订 | 0.5～1 天 |
| 合计 | 7.5～11.5 天 |

可选拆分：若希望风险更低，可将 AFE-3 拆成 AFE-3A Tool pages、AFE-3B Robot pages、AFE-3C Skill pages。拆分后每批仍必须保持 no real API / no fake success。

## 19. 后续分批关系

| 后续批次 | 与 AFE-3 的关系 |
| --- | --- |
| AFE-4 模型、知识、企业配置和发布治理 | 可复用 AFE-3 的 Catalog summary、Resource picker 和 GATED 操作边界。 |
| AFE-5 系统管理、用户权限、审计和反馈 | 可复用表格、详情、权限、审计安全摘要组件。 |
| AFE-6 真实 Adapter/E2E/视觉安全收口 | 在 AFE-3 页面结构基础上接真实 Projection，并删除或隔离对应 mock。 |
| AAPI-0.3～0.4 | 提供真实 Admin API 和 Browser security 后，AFE 页面才能进入真实 Adapter 接入。 |
| TGM 系列 | Tool 保存、测试、启停、验证、发现、健康和策略生效的真实来源。 |
| Knowledge Provider | 不被 AFE-3 解锁。 |

AFE-3 不自动解锁 AFE-4～AFE-6、AAPI-0.3～0.4、TGM、Knowledge Provider 或 production identity。

## 20. 未解决问题与评审点

| 编号 | 问题 | 当前建议 |
| --- | --- | --- |
| O-01 | AFE-3 是否一次覆盖 Tool / Robot / Skill，还是拆成 3A/3B/3C？ | 建议评审时决定；一次做需 7.5～11.5 天，拆分更易 QA。 |
| O-02 | 是否允许新增 `/tools/new/api`、`/tools/new/mcp`、`/robots/new`、`/skills/new/upload` 等路由？ | 建议允许，但全部 GATED，不接真实提交。 |
| O-03 | 是否允许页面内固定 Prototype fixture？ | 仅测试/视觉/显式 prototype 页面允许；production 默认仍 unavailable。 |
| O-04 | 是否实现 cURL 演示解析？ | 仅允许固定 fake cURL 的确定性解析演示；不接收真实 Secret/Endpoint，不持久化原文。 |
| O-05 | 是否实现真实文件选择？ | 否。技能上传页只做壳，不读取真实包。 |
| O-06 | 是否更新版本和日志？ | 方案阶段不更新；编码完成并 QA 后按收口窗口处理。 |

## 21. P0～P3 自检

| 等级 | 数量 | 说明 |
| --- | --- | --- |
| P0 | 0 | 未发现阻断方案评审的产品或安全冲突。 |
| P1 | 0 | 未触碰后端、Desktop、Contract、真实认证、依赖或 lockfile。 |
| P2 | 0 | Tool/Robot/Skill 页面均有 GATED 边界、敏感信息边界和测试门禁。 |
| P3 | 0 | 是否拆分 AFE-3 作为评审决策，不作为缺陷。 |

## 22. 评审结论请求

请求 Claude Code 和技术负责人评审：

1. 是否接受 AFE-3 只建设 Admin Tool / Robot / Skill 页面基础和 GATED 创建/编辑壳，不做真实业务 CRUD。
2. 是否接受新增 Tool/Robot/Skill 二级路由，但全部保持 no real API / no fake success。
3. 是否接受 AFE-3 可以一次做完，或建议拆成 AFE-3A / 3B / 3C。
4. 是否接受编码范围继续严格限定在 `apps/admin-console/**`，并以 Admin package gates、Desktop Vue 3 隔离和 root check 作为硬门禁。

本文件不构成编码授权。只有文档评审通过且用户明确授权后，才可进入 AFE-3 实施。
