# RoboThree Tool 接入与管理 Feature Spec

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | RoboThree Tool 接入与管理 Feature Spec |
| 文档版本 | v1.0 Revision 5 |
| 更新日期 | 2026-08-22 |
| 文档状态 | **PRODUCT SEMANTICS FROZEN / TGM IMPLEMENTATION GATED** |
| 用户决策 | 代码 Tool 由 RoboThree 官方或企业研发在 Admin Console 之外完成开发、测试和可信发布，发布后自动登记到企业 Tool 列表；“新增 Tool”只提供连接 API 与连接 MCP 服务。API Tool P0 支持单条 cURL 快速导入；MCP P0 只连接已经部署的远程 MCP 服务，按“验证并发现 → 选择 Tool → 设置范围并保存草稿”接入，认证支持“无需认证 / 访问令牌（Bearer Token） / API Key”，不向管理员提供本地 Command/Arguments、依赖安装或任意代码执行 |
| 适用范围 | Admin Console Tool 列表、详情、配置、新增、编辑、测试、启停、授权和状态；Desktop Tool 安全投影；Central Tool Catalog/Gateway 产品边界 |
| 上位文档 | `PRD-ROBOTHREE-MVP.md`、`ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md`、`FRONTEND-EXPERIENCE-SPEC-v1.0.md` |
| 现有架构约束 | `CapabilityDefinition → CapabilityBinding → AdapterDescriptor → TaskCapabilityLock → Authorization / Effect / Recovery` 是唯一 Tool 运行底座 |
| 不直接定义 | 最终公共 Contract 文件名、数据库表、migration 编号、IPC channel、Central 类名、MCP 首个 Transport 和具体开发版本 |

---

## 2. 背景与产品结论

RoboThree 已经拥有真实的内置代码 Tool。当前 Document Worker 对外注册的 PDF、XLSX、DOCX
能力已经具备正式 `CapabilityDefinition`、`CapabilityBinding`、`AdapterDescriptor`、风险事实和
受控进程外执行路径。当前缺口不是“如何执行一段代码”，而是如何让这些已交付的 Tool 进入
可信 Catalog，并由企业管理员完成启用、授权、状态和审计治理。

产品结论固定如下：

1. Agent 只感知统一的 Tool；代码工具、HTTP API、MCP 是接入和实现来源，不是三套 Tool 体系；
2. 代码工具的实现必须先由 RoboThree 官方发布流程，或企业开发/运维的受控发布流程完成交付、可信 Manifest 登记和 Runtime 可用性声明；
3. 官方和企业代码工具完成可信发布后自动登记到企业 Tool 列表，默认处于“待启用”或“当前环境不可用”；Admin Console 不再提供代码工具候选选择和添加流程；
4. 管理员不能通过 Admin Console 上传、粘贴、编写、替换、编辑或直接执行任意 Python、Node、Shell 等代码，也不能自行声明新的可信代码实现；
5. 代码工具的 capabilityId、说明、Schema、风险事实、package/revision/digest、Binding/Adapter、Runtime、执行位置和兼容范围均来自可信发布物；管理员只查看业务说明和风险，配置允许范围、更严格确认和启停；
6. HTTP API 与 P0 MCP Tool 是中央远程 Tool，企业 Endpoint 和连接密钥始终留在 Central；MVP 不将密钥建设为管理员可浏览、命名或复用的独立资源；
7. MCP Server 是连接与发现来源，发现并选中的能力分别注册为普通 RoboThree Tool；Admin P0 不提供“远程/本地 MCP”选择，也不接受 `Command`、`Arguments`、环境变量、本地目录或依赖安装配置；
8. Tool 的技术定义、执行 Binding、Connection、Credential、企业 Policy、验证结果和健康观测分离；
9. HTTP/MCP 的保存、测试通过、启用、运行健康和当前用户可用是不同事实；代码工具使用发布验证和系统自动环境检查，不要求管理员再次运行测试；
10. 普通停用通过新的配置/Registry generation 影响新任务，不静默改写运行中任务的精确锁定；
11. 接真实配置、测试或启用链路前，必须完成 TGM 系列 Contract/Core/Central 方案和独立编码授权。

---

## 3. 核心概念与统一模型

### 3.1 Tool

Tool 是 Agent 可以请求的唯一原子执行能力。一个可被模型调用的 Tool 至少具有：

- 稳定 `toolId / capabilityId`；
- 官方技术名称和说明；
- 输入 Schema 与可选输出 Schema；
- 只读提示和官方风险事实；
- 精确 Definition revision；
- 精确 Binding 和 AdapterDescriptor revision；
- 执行位置、取消、超时、恢复和并发边界；
- 企业 Policy revision；
- 当前任务中的精确锁定事实。

### 3.2 接入来源与执行位置

| 接入来源 | 产品名称 | 创建方式 | 执行位置 | Credential 域 |
| --- | --- | --- | --- | --- |
| 可信代码包 | 代码工具 | 官方或企业研发完成可信发布后自动登记 | 由可信 Manifest 声明的客户端预装 Worker、受控本地进程或已支持企业 Runtime | 无 Credential或对应 Runtime 的受控凭证域 |
| 管理员配置 | HTTP API Tool | Admin 新增单个受控 HTTP Operation | Central Tool Gateway | Central Secret Store |
| MCP Server 发现 | MCP Tool | Admin 建立连接、发现并选择注册 | Central MCP/Tool Gateway | Central Secret Store |

“客户端预装/受控 Runtime/中央远程”描述执行位置；“代码工具/HTTP API/MCP”描述接入来源。代码工具内部再区分“官方内置”和“企业可信包”交付来源，两个维度不得混写。

### 3.3 不可变技术事实与企业策略

| 层 | 主要内容 | 管理员是否可直接编辑 |
| --- | --- | --- |
| ToolDefinitionRevision | capabilityId、官方名称/说明、Schema、只读提示、风险事实、source、revision | 否；代码工具来自可信 Manifest，HTTP/MCP 新建时通过受控流程生成，启用后只能产生新 revision |
| ToolBindingRevision | 精确 Definition、AdapterDescriptor、configurationRef | 否；由系统生成 |
| AdapterDescriptorRevision | 运行边界、协议、实现引用、恢复模式、并发上限 | 否 |
| ToolConnectionRevision | HTTP base URL 或 MCP Server 连接事实 | 仅有权限管理员通过受控表单编辑 |
| CredentialReference | Central Secret Store 中的不透明引用 | 前端不展示引用值；Credential 明文保存后不回显 |
| EnterpriseToolPolicyRevision | enabled、允许范围和更严格的确认要求 | 是，但只能收窄能力 |
| ToolValidationFact | HTTP/MCP 最近验证对象、revision、结果、时间和安全摘要；代码工具为发布验证事实 | 系统产生；代码工具不提供管理员测试入口 |
| ToolHealthObservation | 最近运行健康和错误分类 | 系统产生，只读 |

### 3.4 企业策略只能收窄

管理员可以停用 Tool、缩小用户/部门/机器人范围，或在官方要求之上增加更严格的确认。

管理员不能：

- 降低或删除官方风险事实；
- 绕过 WorkspaceGrant、固定权限、智能授权或用户确认；
- 修改代码工具的技术 ID、模型可见官方说明、Schema、Binding、Adapter、package 或 Runtime 声明；
- 用展示别名改变模型调用名称；
- 把不可用 Tool 静默替换成其他 Tool；
- 通过 Policy 扩大 Tool 官方声明的能力边界。

---

## 4. MVP 范围

### 4.1 P0

- 一个统一 Tool 管理列表与详情；
- 当前 5 个 Document Tool 的可信 Catalog 和内置代码 Tool 管理闭环；
- 官方内置与企业可信代码实现的统一可信发布、自动登记和企业治理闭环；
- 代码工具的企业启用、授权范围、发布验证和自动环境可用性投影；
- HTTP API Tool 的新增、编辑、测试、启用、停用和授权；
- HTTP API Tool 支持手动填写或粘贴单条 cURL，解析后回填同一份连接与参数表单；
- 已部署远程 MCP Server 的连接验证、Tool 发现、选择注册、Schema 变更复核、启用和停用；
- Connection、Credential、Policy、Validation、Health 的分层；
- Tool 被机器人引用时的依赖提示和失败关闭；
- 普通停用对新任务生效、运行中任务保持精确锁定；
- Desktop 只读 Tool Catalog 安全投影；
- Mock/GATED 与真实状态的明确区分；
- 管理操作和 Tool 执行的最小安全审计。

### 4.2 P1

- OpenAPI 批量导入；
- HTTP `PUT`、`PATCH`、`DELETE` 等更多 Method 的通用接入；
- Shell/CLI Tool；
- 浏览器和电脑自动化 Tool；
- 独立 Credential 管理菜单；
- 更完整设备管理、版本覆盖、趋势健康和诊断；
- Tool 使用次数、成本、延迟、SLA 和用量分析；
- 管理员可见的安全事件紧急撤销入口。

### 4.3 明确不做

- Admin Console 上传、粘贴、创建或分发任意本地可执行代码；
- 在线代码编辑器、依赖安装器或通用沙箱创建器；
- 代码工具候选库选择、手动安装、管理员保存草稿或管理员运行测试；
- 独立 MCP 一级菜单、MCP Marketplace 或第二套 MCP 运行时；
- Admin Console 中的“本地 MCP”类型、`Command/Arguments`、`npx`/Shell 命令、工作目录、环境变量或依赖安装表单；未来如支持本地 MCP，必须走可信发布与受控 Runtime 部署，不复用本远程连接表单；
- MCP Resource/Prompt 伪装为 Tool；
- Tool 自动采购、自动安装或跨企业目录智能搜索；
- Tool 不可用时自动换用其他未声明 Tool；
- 管理员代替用户确认本机风险动作；
- 通用复杂发布审批、回滚平台和策略编排器；
- 在本 Spec 中直接启动 TGM、DFI、DFE 或其他编码批次。

---

## 5. 用户、权限与入口

### 5.1 角色

| 角色 | 能力 |
| --- | --- |
| 企业管理员 | 查看全部企业 Tool；连接 HTTP API/MCP；配置企业 Tool Policy；对 HTTP/MCP 运行验证；启停和分配范围；查看安全摘要和依赖 |
| 只读管理员/审计人员 | 查看配置、revision、状态、依赖和审计摘要，不修改或测试 |
| 普通用户 | 只在 Desktop 浏览当前可见 Tool，不进入 Admin 配置，不查看 Endpoint、Credential 或内部 Adapter |
| Agent/Core | 只使用当前任务精确锁定且通过权限、Policy、兼容性和健康校验的 Tool |

### 5.2 页面入口

- Admin Console 一级模块继续使用“工具管理”；
- 不增加“代码 Tool”“HTTP”“MCP Server”三个一级菜单；
- 列表通过接入来源和执行位置筛选代码工具、HTTP API、MCP 三类 Tool；代码工具可继续查看官方内置/企业可信包来源；
- Desktop 智能中心仍使用“工具”Tab，不提供申请、安装或新增入口。

---

## 6. Admin Tool 列表与详情

### 6.1 列表结构

Admin Tool 列表固定使用表格。首屏按管理员任务聚合为 6 列，避免把底层事实平铺成 12 个同权字段：

| 字段 | 说明 |
| --- | --- |
| Tool | Tool 标题 + 技术名称；无企业标题覆盖时使用官方标题 |
| 接入方式 | 接入来源 + 执行位置，分别标注，不混成一个概念 |
| 状态 | 配置、验证、健康、生效四组状态的摘要；四组事实仍须可区分 |
| 治理 | 风险摘要 + 使用范围 |
| 更新时间 | 最近 Policy 或技术 revision 更新时间 |
| 操作 | 查看、配置、启用/停用；HTTP/MCP 另提供测试；按来源和状态控制 |

默认按“最近更新时间倒序”展示。搜索和接入来源筛选常驻；执行位置、配置/验证/健康/生效状态、
风险和使用范围收进“更多筛选”。列表不展示 Endpoint、Credential Reference、设备绝对路径或内部实例信息。

### 6.2 主要操作

- 页面主操作统一为“新增 Tool”；
- 点击后只提供“连接 API”和“连接 MCP 服务”两种新增方式；
- 代码工具由可信发布流程自动登记，不出现在新增菜单，不提供候选选择、安装、保存草稿或测试入口；
- 当前后端批次未接通时，“新增 Tool”可以进入明确标注的 Prototype/GATED 流程；保存、测试、启用和删除等真实提交动作必须禁用或仅说明待接入边界，不得产生 Mock 成功或修改本地业务状态。

### 6.3 详情页

详情至少包含：

1. Tool 标题、技术名称、来源和执行位置；
2. 官方说明、能力边界和输入输出摘要；
3. 官方风险事实与企业附加限制；
4. 技术 revision、Binding/实现安全摘要和兼容范围；
5. 企业启用与授权范围；
6. 配置、验证、健康和生效四组状态；
7. 最近安全错误摘要；
8. 被机器人或固定能力包引用的依赖摘要；
9. 当前允许的配置和启停操作；只有 HTTP/MCP 展示测试操作。

普通用户和 Admin Renderer 均不得看到 Credential Reference 原值、Secret、内部 Runtime Handle、
绝对路径、完整堆栈或未脱敏响应正文。

---

## 7. 代码工具管理

### 7.1 当前事实与同一类型

当前正式代码工具包含：

- `tool.document.pdf.extract_text`；
- `tool.document.pdf.extract_tables`；
- `tool.document.xlsx.read`；
- `tool.document.docx.read`；
- `tool.document.xlsx.write`。

这些 Tool 由官方 Document Tool package、精确 revision、Document Worker Adapter 和受控
child-process 协议实现。它们与后续企业可信包提供的代码工具属于同一产品类型，差异只在交付来源和执行 Runtime，
不形成第二套资源模型。

### 7.2 可信来源、发布与自动登记

代码实现只能通过以下受控来源进入可信 Catalog：

1. RoboThree 官方发布流程签名并随产品或可信代码包交付；
2. 企业开发/运维在 Admin Console 之外完成代码开发、构建、依赖锁定、安全检查和受控发布，再向 Central 登记可信 Manifest。

Admin Console 不是代码包上传、构建、依赖安装或发布平台。可信发布完成后的固定链路：

```text
正式代码、测试和受控发布完成
→ 生成受信 Code Tool Manifest
→ 官方或企业可信实现自动登记为企业 Tool
→ Runtime 上报已安装 package/revision 与 readiness
→ 系统自动检查当前运行环境并投影“待启用”或“当前环境不可用”
→ 管理员配置 Enterprise Policy 并显式启用
→ 新配置进入受控 Registry generation
→ 新任务锁定有效 revision
```

Runtime 只能证明安装和 readiness，不能上传、覆盖或声明新的可信 ToolDefinition。

### 7.3 管理流程

```text
研发完成代码工具开发、测试与可信发布
→ 系统自动登记到企业 Tool 列表
→ 系统自动检查 package、Runtime 和客户端兼容性
→ 管理员查看业务说明、风险和当前环境状态
→ 管理员配置允许范围和更严格确认
→ 管理员显式启用
```

- 同一 capabilityId/revision 或相同可信实现必须幂等登记，不产生重复 Tool；
- Runtime 未覆盖、版本不兼容或 Manifest 无效时自动标记“当前环境不可用”，禁止启用并展示原因；
- Schema 必须来自可信 Manifest，系统不得通过运行任意源码来猜测 Schema。

### 7.4 系统自动带出与管理员可配置字段

系统从可信 Manifest 自动带出并只读展示：

- capabilityId、官方技术名称、官方说明和 input/output Schema；
- 官方风险事实和 readOnlyHint；
- packageId、package revision/digest；
- Binding、AdapterDescriptor、Runtime、执行位置和恢复模式；
- 官方兼容版本范围和当前 Runtime 覆盖。

管理员可以配置：

- 企业是否启用；
- 允许使用的企业/部门/用户/机器人范围；
- 比官方策略更严格的确认要求。

管理员不能修改工具标题、官方说明、兼容版本、技术定义或发布事实；如需调整，应由研发产生新的可信发布版本。

### 7.5 详情、策略与删除

- 官方内置和企业可信包代码工具使用同一套独立“代码工具详情/策略页”，不得路由到 HTTP 编辑表单；
- 页面默认突出能力说明、风险、当前环境状态、企业启用、允许范围和更严格确认；Binding、Adapter、digest、Runtime 等收进默认折叠的“技术详情”；
- 官方内置 Tool 不提供删除；
- 企业代码工具也不由管理员删除；不再需要的实现由研发发布流程下架，Admin 只提供停用；
- 任何代码工具均不提供上传代码、替换实现、编辑 Schema 或修改可信 Manifest 的入口。

### 7.6 发布验证与自动环境检查

代码工具不提供管理员“运行测试”入口。有效性依据包括：

1. 发布前功能测试、安全检查和兼容测试通过；
2. 可信 Manifest/package digest 有效；
3. Runtime Handle 与 AdapterDescriptor revision 精确匹配；
4. Core、Desktop、Worker 和协议版本兼容；
5. 部署后系统自动 readiness/smoke 检查通过。

自动环境检查不要求管理员提供测试文件或参数。缺少 Runtime 覆盖时应显示“运行环境未覆盖”或“版本不兼容”，不能将 Catalog 中存在误写为当前可执行。

---

## 8. HTTP API Tool 新增与编辑

### 8.1 MVP 边界

- 通过 Central Tool Gateway 执行；
- P0 支持手动配置单个 HTTP Operation，也支持粘贴单条 cURL 快速生成同一个 Operation 草稿；两种方式进入同一字段、校验、测试和启用链路；
- P0 支持 `GET` 和 `POST`，数据读取或副作用不能仅按 Method 推断，仍以风险事实和实际能力边界为准；
- OpenAPI/Swagger 文本、文件、URL、批量 Operation 选择和更多 Method 后置到 P1；
- cURL 解析只读取文本并生成候选配置，不执行命令、不发起 API 请求、不自动保存、不自动测试或启用；
- Method、URL、参数位置、认证类型等技术事实必须由确定性解析器产生，P0 不使用模型猜测或补写请求配置；
- Desktop/Core 不接收企业 Endpoint、Credential 或原始远程响应。

### 8.2 创建流程

```text
选择 HTTP API
→ 第一步：填写工具标题、工具名称和用途说明
→ 第二步：选择“粘贴 cURL 快速导入”或“手动填写”
→ 解析并回填/手动填写 API 访问地址、认证、请求方式、参数和使用范围
→ 管理员检查并保存草稿
→ 在详情页使用安全测试参数执行最小测试
→ 测试通过
→ 管理员显式启用
→ 生成并应用新 Registry generation
```

当前 Admin 原型按“基础配置 → 连接配置”两步组织。cURL 导入不是第三条创建路径，也不新增独立解析页；
它是第二步顶部的快捷填写能力。解析成功后收起原始文本并展开已回填的现有字段，管理员可以继续修改。
技术名称默认按受控规则生成并校验企业内唯一；JSON Schema、完整映射、超时和重试等低频技术项由系统生成或默认折叠。
保存创建流程只形成草稿，测试和启用统一在详情页完成。

### 8.3 cURL 快速导入与解析

#### 8.3.1 入口与结果

- 第二步“连接配置”顶部展示“快速导入 API 配置（推荐）”，包含 cURL 文本框和“解析并填入”按钮；下方现有手动表单始终可用；
- P0 每次只解析一条独立 cURL 请求；多条命令、OpenAPI/Swagger、Postman/Apifox、HAR、GraphQL、SOAP 和 gRPC 不在本期；
- 解析成功后回填请求方式、完整 API 访问地址、认证类型、Query/Path/Header/JSON Body 参数、Content-Type 和示例值；
- 完整 API 访问地址在业务表单中作为一个字段展示；系统在内部受控生成 Connection Base URL 与 Relative Path，不要求普通管理员手工拆分；
- 导入只减少填写工作，不改变草稿、测试、启用和 revision 规则；解析成功不得显示成“连接成功”或“Tool 已创建”。

#### 8.3.2 参数转换规则

- 解析出的业务参数直接进入现有可增删参数卡片，包含参数名称、API 字段名、位置、数据类型、值来源、是否必填、说明和示例值；
- URL Query、Path 占位符和 JSON Body 字段默认作为“调用时提供”；具体示例值只进入“示例值”，不得默认固化为每次请求的固定值；
- `Content-Type`、API 版本等协议型 Header 默认作为内部固定配置，不要求 Agent 每次提供；其他 Header 必须明确是调用时提供、固定值还是 Credential；
- 无法确定业务名称、必填性或数据类型时标记“需要确认”，不得静默猜测；管理员解决全部阻断项后才能保存草稿；
- 重新导入会覆盖第二步尚未保存的解析结果，执行前必须提示影响；第一步业务信息不得被 cURL 覆盖。

#### 8.3.3 连接密钥与安全

- 识别 `Authorization`、API Key、Cookie、Basic Auth 等敏感值时，只显示认证类型和掩码，不把真实值写入普通参数、草稿正文、浏览器持久存储、日志、埋点、审计或 QA evidence；
- cURL 只回填认证类型，不把解析出的 Secret 自动写入普通字段或持久草稿；管理员在当前 Connection 的访问密钥输入框中直接填写或重新确认 Token/API Key；
- 原始 cURL 不发送给模型，不作为 Prompt、工具描述或训练数据；完成解析、取消导入或离开未保存页面后不再保留原始文本；
- 解析器禁止执行 Shell。包含管道、重定向、命令替换、环境变量展开、本地文件引用、二进制或 multipart 文件上传等内容时，必须停止并逐项提示改为手动配置，不能忽略后继续；
- GATED 原型只可解析不含真实 Secret/生产 Endpoint 的演示数据，解析动作不得联网、写入 Catalog 或伪造保存成功。

#### 8.3.4 失败与部分解析

- 空内容、非 cURL、缺少 URL、引号不闭合或语法不支持时，在文本框附近展示具体错误并保留输入；
- 部分字段可识别时可以展示已解析内容，但必须列出未识别项和影响，禁止静默丢弃；
- 解析失败不清空原有手动表单，用户可以修改后重试或直接继续手动填写；
- 同一请求中检测到不受 P0 支持的 Method 时，不生成可保存的 P0 草稿，并提示当前仅支持 GET/POST。

### 8.4 字段

| 分组 | 字段 | 规则 |
| --- | --- | --- |
| 基础信息 | Tool 标题 | 必填，面向用户的业务标题 |
| 基础信息 | 技术名称 | 必填、企业内唯一；首次启用后不可原地修改 |
| 基础信息 | 描述与能力边界 | 必填，说明可以做什么、不能做什么 |
| Connection | API 访问地址 | 必填，管理员填写完整请求 URL；系统内部受控拆分 Base URL 与 Relative Path，不下发 Desktop |
| Connection | 访问密钥 | 按认证方式显示；管理员直接填写 Token 或 API Key，保存后只显示掩码。MVP 不建设独立、可复用的 Credential 库或选择器 |
| Operation | Method | P0 为 GET/POST |
| Operation | 参数映射 | Path/Query/Header/Body 到 Tool input Schema 的显式映射 |
| Operation | 超时 | 使用受控范围和默认值 |
| Operation | 重试 | 仅在满足幂等和恢复策略时允许；禁止前端自行开启危险重试 |
| Schema | 输入/输出 Schema | 结构化编辑并校验；禁止任意脚本转换 |
| Response | 返回映射 | 从受控响应中生成有界 Tool result |
| 治理 | 风险事实 | 描述读取、写入、外发、删除或其他影响；启用后修改产生新 revision |
| 治理 | 使用范围 | 企业/部门/用户/机器人范围 |

### 8.5 编辑规则

- 修改 Base URL、Credential、Method、Path、参数映射、Schema、响应映射或风险事实后，原测试结果失效；
- 仅修改界面展示标题和补充说明不改变技术验证状态；
- 已启用 Tool 的技术字段修改形成新草稿 revision，不直接覆盖当前有效 revision；
- 并发编辑或 stale revision 必须拒绝覆盖并要求刷新；
- 保存成功只表示草稿已保存，不表示测试通过、已启用或当前健康。

---

## 9. MCP Tool 新增与编辑

### 9.1 产品模型

MCP Server 是 Connection 和 discovery source，不是 Agent 最终调用的对象。Admin 不建设独立 MCP
一级菜单，但 Central 必须保存受控 MCP Connection revision、CredentialRef 和 discovery snapshot。

P0 只连接已经部署并可由 Central MCP Gateway 访问的远程 MCP Server。管理员添加的是一个远程服务连接，
不是逐个手工创建 MCP Tool；请求地址、Method、输入输出 Schema 等技术事实由 MCP discovery 提供。
页面不出现“远程 MCP / 本地 MCP”类型选择。`Command`、`Arguments`、工作目录、环境变量、`npx`、
本地文件夹授权和依赖安装属于可信运行时交付，不是普通管理员配置项。

### 9.2 创建流程

```text
选择“连接 MCP 服务”
→ 第一步：填写远程服务名称、地址和认证，执行“验证并发现工具”
→ 第二步：查看发现结果并选择需要接入的远端 Tool
→ 第三步：设置共同使用范围和更严格确认，保存为多个独立 Tool 草稿
→ 在详情页执行允许的最小测试
→ 管理员分别显式启用
```

第一步默认只展示管理员需要准备的服务名称、MCP 服务地址、认证方式和访问密钥。P0 产品选项为：

- “无需认证”：不展示访问密钥输入框；
- “访问令牌（Bearer Token）”：展示“访问令牌”密码输入框，由管理员直接填写，系统使用 `Authorization: Bearer <token>` 调用远程 MCP 服务；
- “API Key”：展示“API Key”密码输入框，由管理员直接填写，系统默认使用 `X-API-Key` Header 发送。普通管理员不填写 Header；仅当目标服务明确使用其他安全 Header 名称时，才在默认折叠的“高级配置”中修改，并由系统校验合法 Header 名称。API Key 不允许放入 URL Query。

MVP 不建设独立 Credential 管理页面、凭证命名、凭证下拉选择或跨连接复用能力。访问令牌/API Key 随当前 Connection revision 受控保存；保存后只显示掩码，编辑时只能保留原值或输入新值替换，不能回显完整 Secret。OAuth 完整授权流程和其他认证方式保持 P1。认证方式改变时清空当前尚未保存的密钥输入，避免把旧密钥误用到新认证方式。
主按钮使用“验证并发现工具”，依次完成连接可达性、MCP 协议识别和 Tool discovery；连接或协议失败时停留
在第一步，并就近显示“服务无法访问 / 认证失败 / MCP 协议不兼容”等可执行原因。

MVP 实际 Transport 以 TGM-0 冻结并已实现的远程 Transport 为准。前端不得提供后端尚不支持的 Transport，
也不得自行将 HTTP API 表单伪装为 MCP discovery。

Server identity、稳定 capabilityId 和 Schema digest 由系统根据已验证连接与 discovery 结果生成，
不是管理员输入字段；Binding、Adapter、identity 等技术事实默认收进“技术详情”。

### 9.3 发现与选择

首次 discovery 页面以业务信息为主：

- 顶部展示服务名称、发现 Tool 数量、搜索、“选择全部只读工具”和“取消选择”；不提供可能批量勾选写入/删除能力的无差别“全选”；
- 每个结果展示中文显示名称、灰色小字技术名称、用途说明和“读取/写入/删除/外发”等风险摘要；状态标签使用中性灰；
- 读取 Tool 可默认选中；写入、删除和外发 Tool 默认不选，必须由管理员主动勾选；
- 首次创建不要求逐个重写 Endpoint、Method、Schema、参数映射或技术名称，也不要求逐个手写显示名称和描述；系统优先使用远端 title/description，管理员可在生成草稿后从 Tool 详情补充业务名称和说明；
- MCP Resource 和 Prompt 不出现在 Tool 选择列表。

管理员进入第三步后统一设置使用范围：默认“所有人”，选择“指定范围”后使用部门/用户搜索多选器，
不使用自由文本输入姓名。确认策略只允许“遵循工具默认规则”或“所有已选 Tool 额外要求调用前确认”；
管理员不能把官方要求确认的写入、删除或外发 Tool 降级为自动执行。

风险摘要由系统根据已选 Tool 自动生成并只读展示，例如“5 个读取、2 个写入、1 个删除”；管理员不手写风险事实。
末页主操作固定为“保存为工具草稿”，成功结果说明生成了多少个独立草稿；不得使用“发布”或宣称已经加入可用 Registry。

### 9.4 发现事实与稳定 ID

- discovery snapshot 记录已验证 Server identity、remote tool name、description、Schema digest 和发现时间；
- 本地稳定身份由受控 connection identity、已验证 Server identity 和 remote tool name 派生；
- 相同身份和相同 Schema digest 重复发现时保持幂等；
- 相同身份但 Schema digest 变化时进入“Schema 已变化，待复核”，生成新 Definition revision；
- remote tool name 变化视为新 Tool，旧 Tool 进入不可用/tombstone，不猜测重命名关系；
- 远端 Tool 消失时保留历史 Definition 和引用，不物理删除；
- MCP Resource/Prompt 不注册为 Tool，分别遵循 Knowledge/Skill 边界。

### 9.5 编辑 MCP Tool

从统一 Tool 列表进入某个 MCP Tool 详情后，管理员只可编辑：

- 用户可见标题和补充用途说明；
- 使用范围；
- 在默认风险规则之上增加的确认要求；
- 启用或停用。

原始 remote tool name、Schema、输入输出参数、MCP 服务地址、Credential、Server identity、Binding 和
Adapter 均不可在单个 Tool 编辑页修改。详情页展示“来源 MCP 服务”，点击后进入该 Tool 所属的连接详情；
这不是新的一级 MCP 管理模块。

### 9.6 编辑连接与重新发现

- MCP 服务连接详情展示服务名称、地址、认证方式、访问密钥状态、最近验证结果、最近发现时间和已登记 Tool 数量；提供“编辑连接 / 重新验证 / 重新发现工具”；
- 修改 Server Connection 或访问密钥形成新连接草稿 revision，历史连接测试和 discovery snapshot 对该新 revision 失效；不得直接覆盖当前有效连接并伪装立即生效；
- 管理员必须重新测试连接并重新发现；
- P0 不自动同步远端新增 Tool；由管理员显式执行“重新发现工具”；
- 重新发现页面用业务语言展示新增、能力变化和已移除数量；Schema digest 等差异默认折叠到技术详情；
- Schema 变化、Tool 移除或风险事实变化必须显式复核；
- 重新发现不自动启用新 revision，也不静默覆盖机器人引用；
- 管理员不能手工编辑或伪造远端发现的原始 Schema；允许配置用户可见标题、补充说明和更严格的企业策略。

---

## 10. 测试与验证

本章的管理员测试只适用于 HTTP API 与 MCP Tool。代码工具遵循 7.6 的发布验证和自动环境检查，不显示管理员测试按钮。

### 10.1 测试和保存分离

- 保存草稿不执行网络或 Tool 调用；
- 测试不自动保存、发布或启用；
- 测试必须绑定精确草稿、Connection、Credential、Schema 和 Policy revision；
- 任一相关 revision 变化后，测试结果标记为失效；
- 测试结果至少区分通过、认证失败、网络失败、协议不兼容、Schema/响应不匹配、超时、取消和服务错误。

### 10.2 有副作用 Tool

测试不得默认对生产数据执行真实写入、删除或外部发送。

- 只读且无副作用 Tool 可以使用管理员提供的有界测试参数；
- 有副作用 Tool 必须使用专用测试环境、Provider 明确支持的 dry-run/sandbox、或管理员明确确认的安全测试对象；
- 没有安全测试方式时允许保存草稿，但不能以伪造测试结果启用；启用门槛必须由 TGM-0 明确替代验证方案；
- 测试本身进入审计并继续受权限、数据范围和风险规则约束；
- 测试失败保留非敏感表单内容，不泄露 Secret 或原始敏感响应。

### 10.3 测试结果展示

页面展示：测试对象、测试 revision、结果、耗时、时间、脱敏请求摘要、脱敏响应摘要和可执行建议。

页面不展示：API Key、Authorization Header、Cookie、Credential Reference 原值、完整任务正文、
完整生产响应、内部堆栈、设备绝对路径和 Runtime Handle。

---

## 11. 状态模型

### 11.1 四组状态

| 状态组 | 状态 | 含义 |
| --- | --- | --- |
| 配置 | 待配置 / 已配置 / 已启用 / 已停用 / 配置异常 | 管理配置生命周期 |
| 验证 | HTTP/MCP：未测试 / 测试中 / 通过 / 失败 / 配置变更需重测；代码工具：发布验证通过 / 发布验证失效 | 精确 revision 的验证结果或发布验证事实 |
| 健康 | 未知 / 健康 / 降级 / 不可用 | 最近运行观测，不等于持续 SLA |
| 生效 | 未下发 / 待应用 / 运行时已生效 / 客户端不兼容 | Policy/Registry generation 是否进入运行时 |

“已启用”不等于“验证通过”“当前健康”或“当前用户有权限”。界面应分组展示，不能压缩成一个状态标签。

### 11.2 有效可用性

有效 Tool 至少是以下事实的交集：

```text
受信 ToolDefinition
∩ 精确 Binding 与 AdapterDescriptor
∩ Enterprise Policy enabled
∩ 当前用户/机器人允许范围
∩ 运行实现已安装或 Central Gateway 可达
∩ 客户端与协议兼容
∩ 必要 Credential 可用
∩ 当前 Runtime health 允许
∩ Task 已锁定精确 revision
```

Renderer 不自行计算最终有效性，只展示 Core/Central 提供的安全 Projection 和禁用原因。

---

## 12. 启用、停用、撤销、更新与删除

### 12.1 启用

- HTTP/MCP 只有满足当前验证门槛后才可启用；
- 代码 Tool 必须具有可信发布验证、有效 Manifest、兼容性和 Runtime readiness，不要求管理员手动测试；
- 启用形成新的 Enterprise Policy revision 和 Registry/configuration generation；
- HTTP/MCP 保存或测试通过不自动启用；代码 Tool 发布或自动环境检查通过也不自动启用；
- 应用失败时保留上一个已生效 generation，不伪装成功。

### 12.2 普通停用

- 普通停用是 P0 Admin 操作；
- 停用进入新 generation，只影响使用新 generation 创建的新任务；
- 运行中任务保持创建时锁定的 Definition、Binding、Adapter 和 Policy 事实；
- 新任务发现机器人引用已停用 Tool 时显示“能力配置不完整”并失败关闭；
- 不删除机器人引用、不自动替换 Tool，也不静默退化为无 Tool 机器人。

### 12.3 紧急撤销

紧急撤销与普通停用是不同安全语义。只有明确的实时 `revoked` 事实才允许收窄运行中任务的后续
Tool 调用，并必须显式命名、审计、失败关闭。

MVP Admin Console 不建设通用紧急撤销入口；如安全实现需要受控后台操作，必须经过 TGM-0 Threat
Model、独立开发计划和用户授权。不得用普通“停用”按钮伪装紧急撤销。

### 12.4 更新与机器人引用

- Tool 技术字段更新生成新 revision；
- 已发布机器人继续引用旧 exact revision，直到产生并发布新的机器人 revision或执行受控兼容升级；
- 旧 revision 不可用或客户端不兼容时显示依赖不可用，不静默绑定最新版；
- 管理端详情展示引用依赖和受影响范围摘要；
- Tool Policy 收窄后，新任务按新 Policy 校验，机器人固定引用不能绕过。

### 12.5 删除

- 官方内置代码 Tool 不提供删除；
- 代码 Tool 不提供管理员删除；可信实现下架由研发发布流程处理，企业管理员只能停用；
- 已启用、已发布或被机器人/历史任务引用的 HTTP/MCP revision 不物理删除，只能停用或逻辑下架；
- 仅从未启用、未被引用的 HTTP/MCP 企业草稿允许删除企业登记；
- 删除前展示对象、不可恢复范围和依赖检查；
- 状态或 revision 在确认期间变化时拒绝删除并要求刷新；
- Credential 删除必须与 Connection/Tool 删除协调，失败时不得产生仍显示成功的半状态。

---

## 13. Runtime、授权与恢复

- 模型只看到当前 Task 已锁定且允许使用的 Tool Schema；
- 后台配置变化不热替换运行中 TaskCapabilityLock；
- 普通停用只改变后续 generation；
- 紧急撤销如未来实现，只阻止撤销后尚未开始的后续调用，不伪造已经发生的外部结果；
- Tool 风险事实进入统一 AuthorizationEvaluator，不建立管理端私有确认逻辑；
- 企业 Policy 只能增加限制，不能让任何智能授权模式绕过官方风险；
- Tool 超时、取消、失败和结果不确定继续使用现有 Effect/Receipt/Recovery 语义；
- 重放、恢复和重启不得切换 Tool revision、Connection revision 或 Credential identity；
- 中央远程 Tool 不可用时明确失败或请求用户调整，不回退成本地 Tool。

---

## 14. Credential、安全与审计

### 14.1 连接密钥

- MVP 不建设独立 Credential 管理页面、可复用凭证对象、凭证名称或凭证选择器；
- 管理员在 HTTP/MCP Connection 表单中直接填写当前连接所需的 API Key 或 Token；密钥随该连接受控保存，不允许跨连接复用或在列表中浏览；
- 保存后只显示“已配置”或掩码，不提供完整 Secret 查看；
- 内部如何安全保存和引用密钥由 TGM 技术方案冻结，不形成管理员需要理解或填写的产品字段；Secret 不下发 Local Core、Renderer 或 TaskCapabilityLock；
- Secret 不进入 URL、普通 Contract、日志、Trace、错误、Fixture、埋点、审计正文或 QA evidence；
- Connection 密钥更换以及 Tool 删除/停用必须使用明确 revision 和协调结果。

### 14.2 Endpoint 与响应

- Desktop 普通用户不接收企业 Endpoint；
- Admin 仅在有权限编辑流程中查看必要连接字段；
- 列表、审计和错误摘要不展示带敏感 Query 的完整 URL；
- Gateway 必须对 Endpoint、TLS、重定向、DNS/网络范围、响应大小、超时和取消执行受控校验；
- 原始远程响应必须经过有界映射和脱敏后才能进入 Tool Result、日志或页面。

### 14.3 最小审计

至少记录：

- 管理员对 HTTP/MCP Connection、Tool/Policy 的新增、修改、测试、启用、停用和删除结果，以及代码 Tool 的 Policy 和启停结果；
- 操作者、目标资源、旧/新 revision、安全字段差异摘要、时间和结果；
- Tool 执行的 Tool ID/revision、任务、结果类别、耗时和确认事实摘要；
- 普通停用与紧急撤销必须使用不同事件类型。

审计不得保存 Secret、完整请求/响应、任务正文、文件正文或完整 Tool 参数。

---

## 15. Mock、Prototype 与真实接入

### 15.1 允许

- 使用明确 Fixture 展示三类来源的列表、详情、筛选和四组状态；
- 使用明确 Fixture 展示可信发布后自动登记的代码工具、发布验证和自动环境状态；
- 演示 HTTP/MCP 条件表单、字段校验、未保存提醒和错误态；
- 使用明确标注“演示结果 / Mock”的固定 MCP discovery Fixture 演示选择和治理流程；真实“验证并发现工具”继续禁用，不把演示数据表述为连接成功；
- 演示代码工具的只读技术事实、企业治理字段与禁用操作；
- 所有 Fixture 持续标注 `Prototype / Gated`。

### 15.2 禁止

- Mock 新增、保存、测试、启用、停用、删除或同步成功；
- Mock 代码实现发布或登记成功，或提供真实代码包上传、源码编辑、依赖安装入口；
- 接收真实 API Key、Token、Cookie 或生产 Endpoint；
- 用前端计时器产生健康、验证或生效状态；
- 用 LocalStorage/Renderer state 伪装 Enterprise Policy；
- 让 Mock Tool 混入真实 Catalog 而无法区分；
- 在 Connection/Credential Contract 未完成前提供可提交真实 Secret 的表单；
- MCP discovery 未接入时展示可选择的伪造远端 Tool 并声称真实发现；演示 Fixture 必须与真实按钮、状态和 Catalog 隔离。

### 15.3 真实数据映射

| 页面事实 | 真实所有者 |
| --- | --- |
| Tool 技术定义与 revision | 可信 Catalog / Registry Projection |
| 代码 package、可信发布与 Runtime 覆盖 | Code Tool Manifest + Trusted Catalog + Runtime Attestation Projection |
| Enterprise Policy | Central Tool Governance |
| HTTP/MCP Connection | Central Tool Connection Domain |
| 连接密钥状态 | Central Tool Connection Domain 的“未填写/已配置/需替换”安全摘要 |
| Validation | Central Validation Fact Projection |
| Health | Gateway/Runtime Health Projection |
| Task 可用性 | Core Runtime Selection / Capability Resolver |

---

## 16. 开发依赖与建议批次

本 Feature Spec 不授权编码。建议建立独立 TGM 系列：

| 批次 | 目标 | 页面边界 |
| --- | --- | --- |
| TGM-0 | Threat Model、Contract、状态、停用/撤销、stable ID、测试安全冻结 | 只允许文档和 Prototype/GATED |
| TGM-1 | Code Tool Manifest、可信发布 Catalog、自动企业登记、Runtime attestation、发布验证和真实只读 Projection | 可接真实代码工具列表与详情，不提供新增或测试 |
| TGM-2 | 代码工具 Enterprise Policy、Registry generation、授权、普通停用和依赖失败关闭 | 可接真实代码工具策略配置与启停 |
| TGM-3 | HTTP cURL Parser、Connection/Credential/Operation/Validation/Gateway | 可接 HTTP 导入、手动新增、编辑、测试和启停 |
| TGM-4 | MCP Connection/discovery/stable ID/schema diff/review | 可接 MCP 连接、发现、注册和启停 |
| TGM-5 | 三来源统一管理收口、多节点/恢复/泄漏/兼容性 Harness | 完成统一验收与 Mock 清理 |

前端不必等到 TGM-5 才开始真实接入，但每个页面只能使用对应 TGM 批次已经提供的真实 Contract/Projection。

---

## 17. 验收标准

### 17.1 产品与前端

- [ ] Tool 列表统一展示代码工具、HTTP API、MCP 三种来源，不建立三套资源体系；
- [ ] 列表使用 6 个聚合列；搜索和来源常驻，低频条件进入“更多筛选”，四组状态仍可区分；
- [ ] 新增入口只提供连接 API 与连接 MCP 服务；代码 Tool 可信发布后自动登记，不提供管理员添加、安装、草稿或测试；
- [ ] 代码工具技术事实来自可信发布物且只读，Admin 不提供任意代码上传、编辑、兼容范围修改或删除；
- [ ] 代码工具使用独立详情/策略页，不复用 HTTP 表单；管理员只能配置允许的企业 Policy；
- [ ] HTTP 与 MCP 使用不同条件表单，不再共用无法表达真实配置的通用表单；
- [ ] HTTP 创建为“基础配置 → 连接配置”2 步，MCP 创建保持 3 步；技术详情默认折叠，测试与启用在详情页完成；
- [ ] HTTP 第二步同时支持单条 cURL 快速导入和手动填写；解析结果回填同一表单，不建立第二套草稿或发布链路；
- [ ] cURL 解析不执行命令、不联网、不自动保存/测试/启用；敏感值只用于识别认证类型和显示掩码，管理员在当前 Connection 表单直接填写 Token/API Key；
- [ ] cURL 解析错误、部分解析和不支持项均就近展示，不静默丢弃字段或猜测关键请求事实；
- [ ] MCP P0 只连接远程服务，不展示本地 MCP、Command/Arguments、环境变量或依赖安装；
- [ ] MCP P0 提供“无需认证 / 访问令牌（Bearer Token） / API Key”三种认证方式；管理员在当前 Connection 表单直接填写 Token/API Key，不出现独立 Credential 库或凭证选择器；API Key 默认使用 `X-API-Key`，特殊 Header 名称只在高级配置中修改，且 Secret 不进入 URL Query；
- [ ] MCP 完成“验证并发现工具 → 选择 Tool → 设置范围并保存独立草稿”流程；读取能力可默认选中，写入/删除/外发能力必须主动选择；
- [ ] MCP 创建不要求管理员编辑 Endpoint、Method、Schema 或参数映射；第三步使用结构化范围选择，风险摘要由系统生成，管理员只能增加确认要求；
- [ ] MCP Tool 编辑和服务连接编辑分离；连接从 Tool 来源进入，不新增一级菜单，重新发现不自动启用或覆盖已有引用；
- [ ] 配置、验证、健康和生效四组状态分别展示；
- [ ] HTTP/MCP 的保存、测试和启用互不冒充；代码工具以发布验证和自动环境检查替代管理员测试；
- [ ] GATED 页面不接收真实 Secret，不伪造成功；
- [ ] 停用、删除、版本冲突和依赖不可用具有持久反馈和可执行下一步；
- [ ] 管理页面键盘可操作，状态不只依赖颜色，Admin 最小视口符合全局 Spec。

### 17.2 Contract、Core 与 Central

- [ ] 三类来源最终生成现有统一 Definition/Binding/Adapter/Lock，不创建第二套 Tool Runtime；
- [ ] 代码工具 Manifest 来自官方或企业受控可信发布物，Admin 和 Runtime 不能上传、覆盖或伪造定义；
- [ ] 可信代码发布资格、幂等自动登记和 Runtime 覆盖规则确定且失败关闭；
- [ ] Enterprise Policy 修改不重写官方 Definition，且只能收窄能力；
- [ ] HTTP/MCP Credential 始终留在 Central，不进入 Desktop、Task lock 或日志；
- [ ] Validation、Health、Enablement 和 Effective Eligibility 是独立事实；
- [ ] MCP stable ID、幂等发现、Schema drift、移除和 tombstone 行为确定；
- [ ] 普通停用只影响新 generation，新任务失败关闭，运行中任务保持 exact lock；
- [ ] 紧急撤销如果实现，使用独立事实、事件和授权门槛；
- [ ] Tool 更新和机器人引用不静默漂移；
- [ ] HTTP/MCP timeout、cancel、retry、uncertain 和 recovery 复用现有统一链路。

### 17.3 安全与端到端

- [ ] 5 个现有 Document Tool 通过可信 Manifest → Central Catalog → Enterprise Policy → Registry generation 形成真实闭环；
- [ ] 至少一个企业可信代码实现完成“可信发布 → 自动登记 → 自动环境检查 → 管理员配置范围并启用 → 真实任务调用”闭环；
- [ ] 至少一个 HTTP GET、一个 HTTP POST 和一个 MCP Tool 完成真实任务调用闭环；
- [ ] 有副作用测试不会默认修改生产数据；
- [ ] 被停用或不兼容的 Tool 使新任务类型化失败，不自动换 Tool；
- [ ] 运行中任务不因普通后台修改切换 revision；
- [ ] Renderer、日志、Trace、Fixture、埋点、审计和 QA evidence 的 Secret/Endpoint/正文泄漏扫描通过；
- [ ] 独立 QA 覆盖三来源同一 Runtime Conformance、配置激活、崩溃恢复和多节点一致性。

---

## 18. TGM-0 待冻结的技术项

以下事项不改变本 Spec 的产品语义，但必须在编码前由 TGM-0 明确：

1. 首个真实 MCP Transport、协议版本和认证方式；
2. Central Tool Gateway 的认证、网络范围和租户隔离；
3. Code Tool Manifest 的签名、发布、自动企业登记、幂等规则和 Runtime attestation Contract；
4. EnterpriseToolPolicy 的最终 Contract 名称、资源 ID 和 generation 激活映射；
5. HTTP/MCP Connection 与 Credential 的原子保存、更换和删除协调；
6. 有副作用 Tool 无安全测试环境时的替代验证门槛；
7. 实时 `revoked` 安全事实的最小内部 Contract；MVP Admin 不提供通用入口，产品入口保持 P1/GATED；
8. Tool Catalog、Validation 和 Health 的安全 Projection 字段与分页边界；
9. TGM migration 编号、与当前 Enterprise Configuration v1alpha1 的兼容迁移；
10. 代码工具重复判定、自动登记、发布下架与 Catalog package 生命周期的边界；
11. 三类 Tool 的独立 QA 和长稳 Harness 规模。
