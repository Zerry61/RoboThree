# RoboThree MVP 功能范围与开发基线 v1.0

> 文档状态：**BASELINE / CONFIRMED**  
> 基线版本：**v1.0**  
> 冻结日期：2026-07-22  
> 一致性修订：2026-07-24，Agent defaultModel、Task requestedModel、企业 Agent 派生草稿与 Desktop/Central Foundation 边界  
> 一致性修订：2026-07-27，企业离线四状态、用户确认应用配置与 Runtime Activation 边界  
> 一致性修订：2026-08-19，Model Experience Revision 1：用户默认模型与机器人临时有效模型、个人模型无测试连接、模型标识/显示名称、网络失败重试、企业模型为空及 Credential 查看产品语义  
> 一致性修订：2026-08-20，Tool 接入与管理：内置代码 Tool 可信 Catalog/Policy 闭环、HTTP API 与 MCP 中央远程接入、Connection/Credential/验证/健康分层及普通停用语义  
> 一致性修订：2026-08-20，Tool 管理 Revision 1：新增可信代码工具第三类入口，冻结官方/企业可信包来源、自动技术事实与 Admin 非代码发布边界；列表改为 6 个聚合列，HTTP/MCP 创建压缩为 3 步  
> 一致性修订：2026-08-21，Tool 管理 Revision 2：代码 Tool 改为研发可信发布后自动登记，管理员不添加、安装、保存草稿、测试或删除；新增入口只保留连接 API 与连接 MCP 服务  
> 一致性修订：2026-08-24，Model Experience Revision 3：新任务增加全局 `Max` 推理开关；关闭沿用模型默认行为，开启时优先由受控 Adapter 映射最强受支持模式；不支持、能力变化或映射失败时按默认模式继续且不阻断核心任务，并优先复用既有偏好、任务选择与模型锁能力  
> 一致性修订：2026-08-21，Agent/Skill 管理：Admin 机器人创建与 Desktop 统一使用四项默认关闭的限制开关，开启后才选择允许资源；Admin 新增技能改为上传压缩包，客户端安装固定为校验后解压到受控 Skill 目录  
> 一致性修订：2026-08-21，Agent/Skill 旧口径清理：删除旧 Instructions/输入输出表单和轻量 Skill 编辑器描述，统一为机器人限制开关、对话式创建技能、技能包上传安装及分类审核流程  
> 一致性修订：2026-08-22，API Tool 快速导入：HTTP 创建对齐当前两步原型，P0 增加单条 cURL 确定性解析并回填现有表单；OpenAPI/Swagger 批量导入保持 P1，导入不执行、不联网、不自动保存、测试或启用  
> 一致性修订：2026-08-22，MCP Tool 简化接入：Admin P0 只连接已部署的远程 MCP 服务，不提供本地 Command/Arguments；按验证发现、选择 Tool、设置范围并保存草稿三步接入，Tool 策略与服务连接分开编辑  
> 一致性修订：2026-08-22，MCP Tool 认证：P0 增加 API Key，并将 Bearer Token 表述为“访问令牌（Bearer Token）”；管理员在当前连接中直接填写 Token/API Key，不建设独立 Credential 库或选择器；API Key 默认使用 `X-API-Key` Header，特殊 Header 名称进入高级配置  
> 一致性修订：2026-08-24，Admin Console 信息架构：一级导航收敛为模型、工具、机器人、技能、知识和系统管理六项；用户与权限、审计日志和反馈管理归入系统管理二级导航，系统管理不新增独立概览页  
> 一致性修订：2026-08-24，Admin Skill 上传编辑：技能包解析通过后进入技能信息编辑页，可修改标题、描述、版本号和使用范围；技能名称、`SKILL.md`、文件清单、包摘要和校验结果保持解析只读，保存草稿不改写原始技能包  
> 一致性修订：2026-08-24，Admin Skill 包格式与大小：支持 `.zip`、`.rar`、`.tar.gz`、`.tgz`，单个上传包上限为 200 MB；包内任意目录存在且只存在一个可识别的 `SKILL.md` 即可，并以其所在目录作为逻辑根目录；未找到、检测到多个、文件已找到但读取或解析失败时分别准确反馈  
> 一致性修订：2026-08-24，Admin Skill 版本来源：`SKILL.md` 中的版本声明为可选包内信息，缺失、无法识别或不符合企业发布版本格式均不阻止上传解析；企业发布版本在编辑页填写，并在保存草稿前校验格式、唯一性和递增关系  
> 一致性修订：2026-08-25，Core Prompt 与上下文组装：Platform/Task Boundary/Agent/Skill 分别使用 `hard / hard / role / advisory`，动态资料统一为 `reference`；冻结机器人切换、任务级 Assembly revision/digest、Tool 可信 outcome、`uncertain` 暂停、多 Skill 确定性顺序、上下文预算和 Provider 适配边界  
> 一致性修订：2026-08-25，Core Prompt Revision 1：稳定 Instruction Bundle 与每轮 Dynamic Request Facts 分离；补齐 Task Instruction Binding、Context Receipt、单一 Bundle Compiler、Agent 一次编译、Skill 主正文预算、Knowledge replay、`uncertain` reconciliation 和分层测试矩阵  
> 一致性修订：2026-08-26，机器人与上下文 Revision 2：Core 接受首次 `SubmitTurn` 时原子锁定默认/已选机器人、模型及 Runtime Selection；默认通用机器人改为 Core 内置稳定 Agent revision；机器人模型限制采用“关闭=用户全部合法模型、开启=已选模型交集”；切换机器人取消不兼容 Skill/Knowledge 且不自动恢复；动态请求事实固定包含当前时间、应用语言和系统时区；个性化自定义指令不进入 MVP 生产上下文  
> 适用范围：RoboThree MVP 产品范围、阶段边界、功能设计、开发计划与验收  
> 来源：经用户确认的 `MVP 功能点-v0.5.md`  
> 产品原则：Desktop Client 与 Agent Core 优先，Central Enterprise Service 中投入，Admin Console 保持最小可用  
> 基线关系：本文件是 MVP 功能范围与开发优先级的最新正式基线；与旧产品文档冲突时，以本文件的 MVP 范围、P0/P1 和验收定义为准。底层一致性、恢复和运行时实现细节继续由已接受 ADR 定义。

---

## 1. 基线说明

### 1.1 冻结结论

经多轮范围收敛，`MVP 功能点-v0.5.md` 正式提升为本 v1.0 基线。本文全部 P0、P1、非范围、流程和验收条目均约束后续功能设计与开发计划；任何实质变更必须通过新的关键节点记录，并在需要时建立或替代 ADR。

MVP 重点变为：

```text
易用的桌面客户端
+ 稳定、开放的 Agent Core
+ 最小企业能力配置与发布审核
```

### 1.2 本基线关键冻结点

1. Central Enterprise Service 从低投入调整为中投入；
2. 外部调用按任务、目标和数据范围确认，同一范围内不重复弹窗；
3. Agent/Skill 发布审核只接收完整、固定、不可编辑的能力包，不建设测试报告系统；
4. 限定 Core 对 Agent、Skill、Tool 和 Knowledge 的自动选择边界；
5. 本地 Skill 的发现、读取和解析由 Skill Runtime 负责，不建模为 Tool；
6. Model/Tool 调用量统计和审计导出后置到 P1。

---

## 2. 产品定位与 MVP 目标

### 2.1 产品定位

RoboThree 是面向企业员工的桌面优先 AI 工作台。

它以通用 Agent 执行能力为核心，连接本地 Workspace、企业模型、Tool、Skill、Agent 和 Knowledge，让用户通过自然语言完成真实工作，并在必要操作前获得清晰的知情确认。

RoboThree MVP：

- 不绑定单一业务场景；
- 不是单纯的聊天客户端；
- 不是完整的低代码工作流平台；
- 不是完整企业治理平台；
- 不以后台功能数量作为成功标准。

### 2.2 MVP 产品目标

MVP 必须跑通以下通用闭环：

```text
用户描述任务
→ 选择 Workspace、Agent 或 Skill（均可选）
→ Core 使用模型理解目标
→ 调用有权使用的 Tool 和 Knowledge
→ 涉及风险操作时请求用户确认
→ 生成可查看、可继续修改的成果
→ 保存任务历史与基础审计
```

### 2.3 投入优先级

| 产品层 | 投入优先级 | MVP 目标 |
| --- | --- | --- |
| Desktop Client | 高 | 完成员工从任务创建到成果交付的完整体验 |
| RoboThree Core | 最高 | 建立稳定、可扩展的通用 Agent 运行能力 |
| Local Worker / Tool Adapter | 高 | 执行真实本地文件和进程外能力 |
| Admin Console | 低 | 完成最小配置、权限、发布审核和审计 |
| Central Enterprise Service | 中 | 承担企业 Model/Tool Gateway、中央凭证、配置下发、发布审核和基础审计 |

---

## 3. 已确认的 MVP 原则

### 3.1 开放任务优先

- 默认入口是开放式任务；
- 用户不必先理解或选择 Agent；
- 用户可以显式选择 Agent 或 Skill；
- Core 只能在默认 Agent、用户显式选择、Agent/Skill 固定依赖和管理员开放的通用 Tool 范围内进行确定性编排；
- Core 不包含招投标、合同审查等行业专用分支。

### 3.2 能力模型

产品对用户展示五类独立对象：

```text
Agent
Skill
Tool
Model
Knowledge
```

其中：

- Agent：定义任务身份、职责、默认能力和行为边界；
- Skill：针对一类任务的可复用做法和上下文包；
- Tool：Agent 可以调用的唯一原子执行能力；
- Model：提供语言理解、推理和内容生成；
- Knowledge：提供可引用、可追溯的企业知识来源。

Agent 可以通过“模型”限制开关限定允许范围：关闭时可使用当前用户全部合法模型，开启时只能使用已选模型与用户合法模型的交集。Local Core 负责确定性过滤并在接受首次 `SubmitTurn` 时锁定实际 Model，不自动选择“最佳模型”，也不在任务创建后静默切换。

MCP、HTTP API、本地程序和内置实现都是 Tool 的实现来源，不是与 Tool 并列的产品能力类型。

Desktop 中的“能力”只是一组独立页面的导航容器，不定义共同字段、共同生命周期或统一资源模型。Agent、Skill、Tool、Model、Knowledge 按各自产品语义独立展示和管理。

### 3.3 最小治理

第一版只保留：

- 固定用户权限；
- Workspace 授权边界；
- Tool 风险等级；
- Desktop 用户确认；
- Agent/Skill 企业发布审核；
- 基础审计。

第一版不建设通用规则编辑器、动态条件组合、运行时企业审批或多级审批流程。

### 3.4 扩展安全

- 只支持官方、企业内部可信扩展和用户明确选择的本地 Skill；
- 本地 Skill 可以被读取和使用，但不能因此绕过 Tool 权限和 Workspace 边界；
- 未经审核的第三方代码不能在 Core 进程中直接加载；
- 脚本或本地程序必须通过受控 Tool 或隔离 Worker 执行。

---

## 4. 用户与权限

### 4.1 用户类型

MVP 不建设复杂角色体系，只保留少量权限组合。

| 用户类型 | 可以做什么 |
| --- | --- |
| 普通用户 | 创建任务、授权 Workspace、选择和使用已授权能力、确认本人发起的风险操作、查看成果 |
| Agent/Skill 创建者 | 在普通用户能力基础上创建、测试个人草稿并提交企业发布审核 |
| 个人模型用户 | 在普通用户能力基础上添加和使用自己的 Model 连接 |
| 管理员 | 配置 Model、Tool、用户权限、可选 Knowledge，并审核 Agent/Skill 发布 |

基础审计查看权限可以作为管理员权限中的独立开关，不单独建设审计角色体系。

### 4.2 MVP 权限项

管理员只需配置少量固定权限：

- 是否可以使用某个 Model；
- 是否可以添加和使用个人 Model；
- 是否可以使用某个 Tool；
- 是否可以使用企业 Agent；
- 是否可以使用企业 Skill；
- 是否可以使用 Knowledge；
- 是否可以创建 Agent/Skill 草稿；
- 是否可以提交 Agent/Skill 发布审核；
- 是否可以进入 Admin Console；
- 是否可以查看基础审计。

MVP 不建设部门继承、条件权限、资源标签表达式和复杂 RBAC 策略编辑器。

---

## 5. 产品组成

```text
Desktop Client
├── 工作台
├── 任务
├── 成果
├── 能力
└── 设置
        ↓
RoboThree Core
├── 对话与任务
├── Agent 执行
├── 上下文管理
├── Model 调用
├── Skill 使用
├── Tool 调用
├── Knowledge 使用
├── Workspace 与用户确认
└── 成果、历史与恢复
        ↓
Tool / Worker / 企业服务

Admin Console
├── Model
├── Tool
├── Agent/Skill 发布审核
├── Knowledge（可选）
└── 系统管理
    ├── 用户与权限
    ├── 审计日志（基础审计）
    └── 反馈管理（P1 / Prototype）
```

“能力”只是 Desktop 的导航容器。容器内分别提供 Agent、Skill、Tool、Model 和 Knowledge 页面，不提供统一资源列表、统一创建入口或跨类型通用生命周期。

### 5.1 Central Enterprise Service MVP

Central Enterprise Service 是 MVP 的中投入模块，不只是 Admin Console 的简单配置数据库。

P0 职责包括：

- 企业 Model Gateway：代理企业 Model 调用并保护中央凭证；
- Central Tool Gateway：代理中央远程 Tool 调用并处理中央凭证；
- 企业 Model、Tool、Agent、Skill、Knowledge 配置存储与下发；
- 最近有效配置同步和客户端兼容校验；
- 少量用户权限；
- Agent/Skill 固定能力包接收、审核和发布；
- 基础审计接收与查询；
- Admin Console 所需管理 API。

P0 不要求拆成多个微服务，也不建设复杂调度、成本平台、测试报告系统和运营分析，但 Gateway、凭证与配置同步必须按真实链路开发和验收。

---

## 6. Desktop Client MVP

### 6.1 主导航

```text
工作台
任务
成果
能力
设置
```

MVP 不建设独立消息中心。任务完成、失败、需要输入或需要确认的信息在工作台、任务列表和任务详情中直接展示。

### 6.2 工作台

#### 目标

让用户从“我要完成什么”开始，而不是先选择技术组件。

#### 功能

- 自然语言输入任务目标；
- 支持附加本地文件；
- 支持选择或切换 Workspace；
- 默认创建开放式任务；
- 可选选择 Agent 或 Skill；
- 使用企业默认 Model，也可以从已授权企业 Model 或个人 Model 中选择；
- 在模型选择附近提供一个全局 `Max` 开关；关闭沿用模型默认行为，开启时优先请求当前模型已验证支持的最强推理模式；不能安全启用时按默认模式继续，不阻断任务；
- 展示最近任务和最近成果；
- 展示常用 Agent 和 Skill；
- 输入不足时向用户请求补充信息；
- 提交前展示当前 Workspace、Model 和可能使用的外部能力摘要。

#### 异常处理

- 无可用 Model：提示联系管理员或切换到其他已授权 Model；
- Workspace 不可访问：提示重新选择或授权；
- 所需 Tool 不可用：明确说明缺失能力；
- 企业服务暂时不可用但企业会话仍有效：提示仅允许当前已 Runtime Active 且
  完全本地可运行的企业能力继续；
- 企业会话失效：企业能力暂停，不把本地缓存误报为仍可授权执行。

### 6.3 对话与任务

- 支持创建、重命名和删除本地会话；
- 支持多轮对话和连续修改同一成果；
- 将普通问答与需要持续执行的任务区分展示；
- 支持流式输出、停止和重试；
- 应用重启后可以恢复会话、任务状态和成果关联；
- 用户可以查看本次任务使用的 Model、Agent、Skill、Tool、Knowledge 和 Workspace；
- 用户可以取消任务、补充输入、继续任务或从失败处重新执行；
- 失败时展示用户可理解的原因和下一步建议。

### 6.4 任务列表

- 展示任务目标摘要、状态、更新时间和主要成果；
- 支持按状态、时间和关键词筛选；
- 突出显示等待用户输入或确认的任务；
- 状态使用用户语言：准备中、执行中、等待输入、等待确认、成功、失败、已取消、已超时、需要人工处理；
- 不在普通界面展示底层执行协议和基础设施字段。

### 6.5 任务详情

任务详情展示：

```text
用户目标
→ 当前计划摘要
→ 正在执行的工作
→ 使用的 Agent / Skill / Tool / Knowledge / Model
→ 访问或修改的文件
→ 用户确认记录
→ 结果与成果
```

具体功能：

- 展示当前正在做什么；
- 展示为什么需要某个 Tool 或文件权限；
- 展示已完成和未完成的工作；
- 展示开始时间、结束时间和耗时；
- 展示 Tool 返回的业务结果或错误摘要；
- 展示 Knowledge 引用来源；
- 展示生成或修改的文件；
- 不展示模型私有思维过程；
- 不展示进程、连接和底层持久化细节。

### 6.6 Workspace 与本地文件

#### 功能

- 用户通过系统目录选择器授权 Workspace；
- 显示授权目录和允许的操作范围；
- 支持最小读取、创建和修改；
- 用户可以撤销本地 Workspace 授权；
- 展示任务访问和修改过的文件；
- 防止通过相对路径、符号链接、重解析点或路径大小写差异越界；
- 不默认访问 Workspace 外的文件；
- 不因获得 Workspace 权限而自动获得程序执行或网络发送能力。

#### 文件操作确认

固定确认规则建议为：

| 操作 | 默认处理 |
| --- | --- |
| 在已授权范围内读取普通文件 | 不重复确认 |
| 在已授权范围内创建普通文件 | 不逐次确认，在任务详情中记录 |
| 在已授权范围内修改普通文件 | 不逐次确认，在任务详情中展示变更摘要 |
| 删除、批量覆盖或修改受保护文件 | 每次明确确认 |
| 执行本地程序 | 每次明确确认 |
| 将内容发送到外部 Model、Tool 或服务 | 按任务、目标和数据范围确认；范围未扩大时不重复确认 |

管理员不能通过后台代替用户确认本机操作。

### 6.7 本地 Skill

#### 兼容目录

第一版只兼容 RoboThree Skill 和 Claude Skill。

项目级目录：

```text
<Workspace>/.claude/skills/<skill-name>/SKILL.md
<Workspace>/.robothree/skills/<skill-name>/
```

用户级目录：

```text
~/.claude/skills/<skill-name>/SKILL.md
~/.robothree/skills/<skill-name>/
```

Windows 上的用户级目录以用户主目录为根，例如 `%USERPROFILE%\.claude\skills\`；RoboThree 也可以将自身用户 Skill 保存到应用数据目录，但产品中统一显示为“用户级 RoboThree Skill”。

项目级 Skill 随 Workspace 生效；用户级 Skill 对当前操作系统用户可见。项目级 Claude Skill 由 WorkspaceGrant 覆盖；首次使用用户级 Claude Skill 时，用户需要明确授权 `~/.claude/skills/` 目录。用户级 RoboThree Skill 位于应用管理目录内，不需要额外业务目录授权。

#### 选择方式

- 系统可以发现候选 Skill，但不会自动启用；
- 用户必须手动选择本次任务或当前 Workspace 要使用的 Skill；
- 用户可以查看 Skill 名称、说明、来源目录和需要的 Tool；
- 项目级 Skill 和用户级 Skill 使用明确来源标签；
- 同名 Skill 不静默覆盖，用户需要选择具体来源；
- 用户可以取消选择或更换 Skill；
- 未被用户选择的本地 Skill 不参与任务上下文和执行。

#### 兼容原则

- 不强制导入到 RoboThree 私有目录；
- 不强制复制原始文件；
- 不强制转换为统一 Manifest；
- 不修改 `.claude` 来源文件；
- 通过来源兼容层读取可识别内容；
- 无法理解的字段保留原文件，不做错误猜测；
- Skill 引用 Workspace 外资源时，必须重新获得明确授权；
- Skill 要求执行脚本、程序或外部调用时，仍然通过 Tool 和用户确认检查。

#### 企业技能包安装

- 企业技能由管理员上传包含 `SKILL.md` 的压缩包，完成解析、技能信息编辑、草稿保存、测试、固定版本和发布后，才进入客户端技能广场；
- 用户点击安装后，客户端下载固定发布包并校验身份、版本和完整性，再安全解压到 RoboThree 受控的用户级或明确选择的项目级 Skill 目录；
- 只有完整解压并原子切换成功后才记录为已安装；路径穿越、绝对路径、不受支持的符号链接、完整性失败或写入失败均须清理暂存与半安装目录；
- 安装只下载、校验和解压文件，不执行包内脚本、不运行安装命令、不自动安装语言或系统依赖；依赖要求由 `SKILL.md` 声明并在后续运行时通过受控 Tool、Runtime 和授权处理；
- 不覆盖 `.claude` 来源目录；同名不同版本不得静默覆盖，卸载只删除本机安装副本，不删除 Central 的已发布包。

#### 本地可见范围

- 项目级本地 Skill 默认只在当前 Workspace 可见；
- 用户级本地 Skill默认只对当前操作系统用户可见；
- 本地 Skill 不自动成为企业 Skill；
- 用户可以基于本地 Skill 创建个人草稿；
- 只有提交并通过发布审核后，才可以作为企业共享 Skill。

### 6.8 “能力”导航容器

“能力”本身不对应统一资源对象，只负责进入以下五个独立页面：

```text
Agent
Skill
Tool
Model
Knowledge
```

#### Agent

- 查看可用 Agent 的名称、职责和适用任务；
- 选择 Agent 创建任务；
- 查看 Agent 是否限制模型使用、限制范围和当前用户的合法候选 Model；
- 查看 Agent 使用的主要 Skill 和 Tool 摘要；
- 有创建权限的用户可以创建、编辑和测试个人 Agent 草稿；
- 企业已发布 Agent 版本只读；有权限创建者可以基于发布版本派生个人草稿；
- 草稿形成完整固定能力包后可以提交企业发布审核；
- 被拒绝后可以根据审核意见修改并重新提交。

#### Skill

- 分开展示企业 Skill、个人 Skill 和当前 Workspace 本地 Skill；
- 详情主要展示技能标题、技术名称、描述和行为与规则；已安装 Skill 可以继续查看技能目录和 `SKILL.md`，输入输出、Tool/Knowledge 与环境依赖要求以包内声明为准，不要求用户在详情页重复维护；
- 手动选择本地 Skill；
- 有创建权限的用户可以创建、编辑和测试个人 Skill 草稿；
- 个人草稿可以提交企业发布审核；
- Claude Skill 可以直接供个人使用，也可以由用户明确发起“提交为企业 Skill”，此时生成独立企业发布草稿，不改写原 Claude Skill。

#### Tool

- 查看当前用户可使用的 Tool；
- 区分“客户端预装”和“中央远程”来源标签；
- 展示用途、输入类型、是否涉及文件、程序或外部服务；
- 展示风险等级和是否需要用户确认；
- 不展示底层实现来源、连接密钥和运行实例。

#### Model

- 查看允许使用的 Model；
- 区分“企业 Model”和“个人 Model”；
- 查看模型提供方、用途和基础能力说明；
- 选择个人默认 Model；
- 普通用户不能填写或查看企业 API Key；
- 有个人模型权限的用户可以添加、编辑、使用和删除个人 Model；MVP 不提供个人模型测试连接，保存后以“未验证”开始并由真实调用结果更新状态。

#### Knowledge

- 查看允许使用的 Knowledge 来源；
- 查看来源说明和可查询范围；
- Knowledge 未启用时不显示空模块或配置入口。

### 6.9 Agent/Skill 创建、测试与固定包提交

MVP 提供轻量 Agent 创建表单、对话式 Skill 创建助手和草稿详情测试入口，不建设拖拽式可视化编排画布或通用能力包编辑器。

#### Agent 创建

创建者填写头像、名称、标签、简介和行为与规则。创建页不再单独设置 Instructions、输入要求、输出要求和风险说明；“简介”用于列表和选择器展示，“行为与规则”承载工作方式、响应原则和约束。

模型、Skill、Tool 和 Knowledge 使用四项限制开关，默认关闭并收起：

- 关闭表示不设置 Agent 级限制，不等于禁止使用该类资源；
- 开启后才显示搜索、多选或添加入口，并形成 Agent 级允许列表；
- 开启但未选择任何项表示不允许使用该类资源；
- 关闭后保留草稿选择但不生效，再次开启恢复；
- 运行时仍受用户、企业、Workspace、Task 和上游权限共同约束，Agent 配置不能扩大权限。

模型限制关闭时，Agent 可使用当前用户全部合法模型；开启时只能使用已选模型与用户合法模型的交集。模型选择按后台返回的稳定顺序展示，当前实现可沿用后台配置/添加时间顺序，前端不提供独立排序。

保存 Agent 草稿只要求名称；简介和行为与规则可暂缺并在页面提示发布前补充。运行测试和提交发布必须同时具备名称、简介、行为与规则；模型限制开启但没有实际可用模型时禁止测试和发布。Skill、Tool 或 Knowledge 的空允许列表表示明确禁用该类资源，不作为表单错误；运行测试仍按测试任务的实际能力需求判断。测试只针对已保存 revision；未保存修改不得沿用旧测试结果。头像和标签属于展示信息，不进入 Agent 指令正文或指令 digest。

Desktop 保存个人 Agent 草稿；Admin 创建企业 Agent 草稿时使用同一字段和限制语义，并额外配置发布范围。已发布版本不可直接覆盖，修改时生成新草稿版本。

#### Skill 创建

Desktop 创建 Skill 固定为两个阶段：

1. 创建者只填写技能名称、描述和技能主要功能三个必填字段；
2. 系统创建任务/会话，调用内置“技能创建助手”，把三个字段整理为首条可见消息，并在受控 Workspace 中生成 `SKILL.md` 以及按需生成的 `references/`、`scripts/`。

Tool、Knowledge、输入输出、环境依赖、Workspace、程序执行和外部发送要求不作为独立表单项，由创建助手写入 `SKILL.md`，实际运行继续服从 Tool、Workspace 和用户授权规则。创建对话页不提供测试和发布操作；有效草稿进入“我创建的”，测试和提交发布从 Skill 草稿详情发起。

Admin 不从空白表单创建 Skill，只接收包内任意目录存在且只存在一个可识别 `SKILL.md` 的 `.zip`、`.rar`、`.tar.gz` 或 `.tgz` 技能包并形成企业草稿；系统以该文件所在目录作为技能包逻辑根目录，单个上传包不得超过 200 MB；修改技能内容时重新上传新包版本。

#### 测试

- 草稿默认只对创建者可见；
- Agent 和个人 Skill 从草稿详情发起测试；Admin 上传的企业 Skill 草稿使用独立测试入口；
- 创建者或管理员使用自己的权限和测试 Workspace 运行测试；
- 测试页面展示输入、输出、使用的 Model、Tool、Skill、Knowledge、文件变化和用户确认；
- 测试失败可以修改草稿并再次运行；
- 测试结果必须绑定当前草稿 revision；草稿变化后，旧结果不得继续作为当前版本的有效结果；
- 测试用于创建者自测，不形成企业审核用测试报告；
- MVP 不保存通用测试报告、不提供自动质量评分，也不建设测试报告查询系统。

#### 提交

- 提交对象必须是完整、固定的 Agent Package 或 Skill Package；
- 提交时形成不可编辑的审核版本；
- Agent Package 必须包含基础信息、行为与规则、四类限制开关的实际生效结果、固定资源引用及 revision、所需权限、版本和变更说明；
- Skill Package 必须包含经过校验的固定压缩包、可识别 `SKILL.md`、包内实际文件、依赖与权限声明、企业目录发布版本和完整性摘要；企业发布版本不要求写入 `SKILL.md`，输入输出、Tool/Knowledge、环境和风险要求由 `SKILL.md` 表达，不要求用户在提交页重复填写；
- 依赖的 Agent、Skill、Tool、Model 和 Knowledge 必须使用明确引用，不能在审核后动态补齐；
- 缺文件、缺依赖、引用不明确或仍在编辑中的草稿不能提交；
- 测试过程和测试结果不进入发布包；
- 审核期间创建者可以撤回；
- 被拒绝后基于原草稿修改并重新提交；
- 已发布 Agent/Skill 的修改必须由有权限创建者派生个人草稿，在 Desktop 编辑和本地测试后重新提交；不直接覆盖已发布内容；
- Admin Console 提供企业 Agent 草稿配置和企业 Skill 包上传，但不承担通用能力包编辑器；发布审核只处理完整、固定、不可编辑的审核版本。

### 6.10 用户确认

用户确认是 MVP 唯一的运行时人工决策机制。

确认界面必须展示：

- 当前任务目标；
- 要使用的 Tool；
- 操作类型；
- 文件、目录、程序或外部目标；
- 参数或数据摘要；
- 可能产生的影响；
- 本次确认适用的任务、外部目标和数据范围；
- 本次允许还是取消。

确认规则：

- 确认只对当前用户发起的操作有效；
- 确认绑定当前任务、外部目标和数据范围；
- 同一任务中再次调用同一目标，且发送数据未超出已确认范围时，不重复弹窗；
- 外部目标变化、数据范围扩大或进入新任务时，需要重新确认；
- 用户可以在任务结束前撤销尚未执行的外部调用授权；
- 用户拒绝后任务停止当前操作并给出可选替代方案；
- 用户可以取消正在等待确认的任务；
- MVP 不支持转交管理员、多人会签或后台代批。

外部调用确认不是完整 Policy 或授权规则系统。MVP 只保存本任务所需的最小确认范围，不提供跨任务永久放行、复杂条件和管理员代用户确认。

### 6.11 成果

- 展示任务生成的成果文件和结构化结果；
- 支持按任务、类型和时间筛选；
- 支持查看、打开本地位置和继续修改；
- 展示成果来源任务、生成时间和版本；
- 支持受控的本机 HTML 预览；
- 区分任务工作文件、正式成果和临时预览；
- 删除成果记录时不默认删除用户 Workspace 原文件。

### 6.12 设置

- 当前用户信息；
- 默认 Model；
- 个人 Model 管理入口（仅有权限用户可见）；
- Workspace 授权管理；
- 简单显示 Local Core 和企业服务是否可连接；
- 显示最近一次企业配置同步时间；
- 区分企业在线、企业服务暂时不可用、企业会话失效、企业恢复等待应用四种状态；
- 版本信息、更新入口和基础诊断摘要；
- 凭证和敏感信息不进入诊断信息。

MVP 不建设进程级健康监控、设备运行时拓扑和复杂诊断面板。

### 6.13 个人 Model

#### 使用条件

- 管理员必须为用户开启“添加个人 Model”权限；
- 个人 Model 只对创建者可见；
- 用户可以将企业 Model 或个人 Model 设置为自己的默认 Model；
- 管理员可以关闭用户新增个人 Model 的权限，但不能查看用户 API Key 明文。

#### 添加与管理

- 用户填写 Provider 类型、Endpoint、API Key、模型标识和显示名称；模型标识是提交给 Provider 的精确 Model ID，显示名称默认等于模型标识并用于界面展示；
- 首期可以只支持 OpenAI-compatible Provider；
- 保存前不发起 Provider 网络请求，保存后状态为“未验证”，由首次真实任务调用更新状态；
- 保存后 API Key 只显示掩码；
- 支持编辑连接信息、更换 API Key、停用和删除；
- 添加时明确提示模型调用会将任务上下文发送到该 Provider。

#### 本地凭证链路

```text
Desktop 凭证输入界面
→ 通过受控 IPC 交给 Local Core
→ 保存到操作系统安全凭证存储
→ Desktop 只保留 Model 描述和凭证状态
```

API Key 不进入 Renderer 持久化、任务记录、日志、审计、企业配置同步和成果文件。

#### 个人 Model 调用链路

```text
Desktop 创建任务并选择个人 Model
→ Local Core 读取本地 Model 描述
→ 从操作系统安全凭证存储获取 API Key
→ Local Core 直接调用个人 Model Provider
→ 流式结果返回 Desktop
```

企业服务不代理个人 Model 调用，也不接收个人 API Key。基础审计只记录个人 Model 的显示名称、Provider 类型、调用时间、用量和结果，不记录 API Key 和完整任务正文。

---

## 7. RoboThree Core MVP

Core 只承载通用 Agent 运行能力，不包含具体行业场景逻辑。

### 7.1 对话与任务管理

- 保存会话、消息、任务状态和成果关系；
- 支持多轮上下文；
- 支持停止、取消、失败重试和应用重启恢复；
- 向客户端提供用户可理解的任务进度；
- 保留必要历史，避免无限加载完整会话；
- 错误分为可重试、需要用户输入、需要用户确认和需要人工处理。

### 7.2 Agent 执行

- 支持 Core 内置、不可编辑、具有稳定 ID/revision/digest 的默认通用 Agent；该 Agent 不作为普通企业机器人由管理员管理；
- 支持用户显式选择企业 Agent 或个人 Agent 草稿；
- 每个 Agent 使用不可变 Agent Definition revision，并通过模型限制开关表达是否收窄合法候选；
- 用户可以在当前 Agent 允许范围与自身合法模型的交集中为待创建任务选择 Model；
- 根据用户目标生成最小执行计划；
- 在当前用户权限和可用能力范围内执行；
- 根据 Tool 结果继续、补充信息或结束任务；
- 不建设 Multi-Agent、Subagent、任意复杂 DAG 和通用工作流编辑器。

### 7.3 Core 能力选择边界

Core 可以在明确候选范围内完成任务编排，但不建设跨企业能力的搜索、评分、推荐和智能路由平台。

#### Agent

- 优先使用用户显式选择的 Agent；
- 用户未选择时使用 RoboThree Core 内置的默认通用 Agent；它具有稳定 ID/revision/digest，不可编辑，也不进入普通企业机器人管理列表；
- Core 不扫描、比较或评分全部 Agent 来自动选择“最佳 Agent”；
- Core 接受首次 `SubmitTurn` 时，原子创建 Task、Task Instruction Binding 与 Runtime Selection，并在第一次模型调用之前锁定当前 Agent revision；此后即使模型网络失败也不允许在原任务内切换 Agent。

#### Model

- 不选择 Agent 时，优先使用当前有效的 User personal defaultModel；没有有效偏好时使用后台顺序中的第一个可用企业 Model；
- Agent 模型限制关闭时，候选为当前用户全部合法可用 Model；限制开启时，候选为 Agent 已选 Model 与用户合法可用 Model 的交集；
- 选择 Agent 时，用户默认模型在候选范围内则继续使用；不在范围内则按 Core/后台返回的稳定顺序选择第一个可用 Model 作为当前 Task 的临时有效模型；当前实现可沿用后台配置/添加时间顺序，前端不得自行重排；
- Agent 临时有效模型不覆盖 User personal defaultModel；取消 Agent 后恢复用户默认模型；
- 用户显式选择时，由独立 ModelEligibilityEvaluator 根据权限、启用、Credential/可用性、Agent 限制和必要能力做确定性过滤；
- Agent 没有任何可用 Model 时拒绝 Task 创建，不扩大范围或静默选择其他 Model；
- Core 不评分或自动选择“最佳 Model”，只消费后台稳定顺序完成确定性回退；
- Core 接受首次 `SubmitTurn` 并原子创建 Task 与 Runtime Selection 时锁定实际 Model，发生在第一次模型调用之前；此后不因用户偏好、失败、配置同步或 Central 断线静默切换。

#### Skill

- 本地 Skill 必须由用户手动选择；
- 企业或个人 Skill 可以由用户显式选择，或由当前 Agent 的固定依赖引用；
- Core 不在全部 Skill 中做语义搜索、评分和自动安装；
- 未进入当前 Agent/任务候选范围的 Skill 不加入上下文。

待创建任务切换 Agent 时，已经选择但不再满足新 Agent 限制的 Skill 必须立即取消选择并说明原因；切回原 Agent 或取消 Agent 时不自动恢复这些 Skill，用户需要重新选择。

#### Tool

- Tool 候选只来自当前 Agent/Skill 固定依赖，以及管理员明确开放的通用 Tool 列表；
- Model 可以在这份有限列表内依据 Tool 说明选择调用；
- Core 不跨企业 Tool 目录进行搜索、评分、采购或自动接入；
- Tool 不可用时明确失败或请求用户调整，不静默更换未声明实现。

#### Knowledge

- Knowledge 由用户显式选择，或由当前 Agent/Skill 固定引用；
- 可以在已选 Knowledge 内执行检索和排序；
- Core 不比较全部 Knowledge Provider 后自动选择数据源；
- 未授权或未引用的 Knowledge 不参与任务。

待创建任务切换 Agent 时，已经选择但不再满足新 Agent 限制的 Knowledge 必须立即取消选择并说明原因；切回原 Agent 或取消 Agent 时不自动恢复这些 Knowledge。

### 7.4 上下文管理

- 使用分层 Instruction Bundle 组合 Platform `hard`、Task Boundary `hard`、Agent `role` 和当前任务真正启用的 Skill `advisory`；
- Instruction Bundle 只包含 Task-stable 指令；Core 原子形成 Task Instruction Binding。每次模型调用固定形成独立 Dynamic Request Facts，至少包含可信当前时间、应用当前语言和操作系统时区；它与动态 Reference 使用独立 receipt，不进入稳定 bundle digest；
- 用户当前要求决定本次具体目标，并可在不违反 `hard/role` 时覆盖 Skill 的建议步骤；
- Knowledge、Memory、文件、网页、Skill references、Compaction Summary 和 Tool Payload 使用 `reference` 语义，不得覆盖指令层或授予权限；
- 首次提交前切换 Agent 只替换 Agent 层，并取消不兼容的 Skill/Knowledge 选择；Core 接受首次 `SubmitTurn` 时原子创建 Task 和 Runtime Selection，并在第一次模型调用前锁定 Platform Prompt、Instruction Assembly、Agent、Skill、Tool、Model、Knowledge、Workspace 和授权配置的准确 revision 或等价不可变事实，不静默升级或替换；
- 相同锁定来源按 `priority → locked ordinal → sourceId tie-breaker` 形成确定性 Bundle 和 digest；同优先级 Skill 顺序只用于复现，不形成业务优先级；
- Agent 名称、简介、目标和行为规则只在保存、发布或物化时编译一次并形成不可变 revision，模型调用和历史任务恢复不从当前字段重新生成；
- 个人 Agent/Skill 草稿由创建者显式选择后可以运行和测试，内容分别进入 `role/advisory`，不能扩大 Core 提供的能力范围；
- 按需读取 Workspace 文件，不一次性加载整个目录；
- 支持搜索、摘要和必要引用；
- 组合 Knowledge 查询结果并保留来源；
- 按来源控制发送给 Model 的上下文大小；Platform、Task Boundary、Agent 和全部已锁定 Skill 主正文不被静默截断，超预算先裁剪动态 Reference、压缩历史和缩短旧 Tool Result 预览；提交前发现 Skill 主正文合计超限时要求减少 Skill 或显式换模，仍无法适配时明确失败，不自动换模；
- 不把未选择的本地 Skill 自动加入上下文；
- 不把不必要的敏感文件发送给外部 Model 或 Tool；
- Tool 执行结论只使用 Core 已提交的结构化 outcome；Tool Payload 文字不能覆盖状态，Effect `uncertain` 暂停普通 Agent Loop 并进入结果核对；
- Effect `uncertain` 的任务所有者可确认已成功、确认未发生或失败、继续等待；处理形成独立幂等 reconciliation Fact，不改写原 attempt、不重复 dispatch，并支持重启恢复与并发 single-winner；
- 同一 Model Invocation 的重试或恢复复用原 Knowledge retrieval receipt；新 Invocation 才重新检索，原 chunk 缺失时失败或等待，不用当前内容替换；
- Core 内单一 Bundle Compiler 使用固定可转义 wrapper；Provider Adapter 可以保留多个 System Message 或按同一 wrapper 合并，不使用 Developer Role，Reference 永不转成 System；MVP 不建设独立大型 Provider Compiler，也不并入 Max Mapping。
- 当前个性化设置中的“自定义指令”仅可作为 Prototype 展示，不进入 MVP 生产 Instruction Bundle、System Message 或模型上下文；未来若接入，必须由独立 Feature Spec 冻结为单独的 User Preference `advisory` 层，不得拼入 Agent 行为与规则或扩大权限。

### 7.5 Model 使用

- 同时支持企业 Model 和有权限用户添加的个人 Model；
- 支持用户选择个人默认 Model；
- 区分 Agent defaultModel、User personal defaultModel 和只影响单 Task 的 requestedModelId；
- 支持流式输出、停止、超时和错误提示；
- 记录使用的 Model、调用时间和结果状态；
- Model 不可用时提示用户选择其他已授权 Model；
- 不建设复杂的自动模型评分、成本路由和智能切换。
- 新任务只提供 `default/max` 两种推理意图：关闭时不额外发送推理强度参数，开启时优先由受控 Adapter 映射当前模型最强受支持模式；
- `Max` 是增强偏好，不是任务硬约束。全局初始偏好与当前任务结果分离；换模在提交前重算，不支持、提交时能力变化或映射失败时使用模型默认行为并明确说明，任务创建后重试、后续轮次和重启复用已记录结果；
- 优先复用既有模型偏好、应用设置、Task Runtime Selection、模型锁和 Adapter Descriptor，不把独立偏好系统、独立锁体系或一次适配所有模型作为 MVP 前置条件。

企业 Model 调用链路：

```text
管理员在 Admin Console 配置企业 Model 和 API Key
→ Central Enterprise Service 将 API Key 保存到中央安全凭证存储
→ Local Core 只同步 Model 描述、权限和企业 Model Gateway 地址
→ Local Core 通过企业 Model Gateway 发起调用
→ Gateway 使用中央凭证调用企业 MaaS / Model Provider
→ 结果流返回 Local Core 和 Desktop
```

企业 API Key 不下发客户端。MVP 不支持客户端使用长期企业 API Key 直接调用 Provider。

个人 Model 调用链路：

```text
有权限用户在 Desktop 添加个人 Model 和 API Key
→ Local Core 将 API Key 保存到操作系统安全凭证存储
→ Local Core 从本机直接调用个人 Model Provider
→ 结果流返回 Desktop
```

个人 API Key 不上传企业服务。企业和个人 Model 共享同一任务使用体验，但凭证域、网络调用路径和故障范围保持隔离。

### 7.6 Agent 管理能力

- 读取系统内置、企业发布和个人草稿 Agent；
- 校验 Agent 对 Skill、Tool、Model 和 Knowledge 的引用；
- 个人 Agent 默认只对创建者可见；
- 企业 Agent 必须经过发布审核；
- 支持保存草稿、运行测试、提交审核、查看审核结果和基于意见重新提交；
- 保存草稿只要求名称；测试和提交审核要求名称、简介、行为与规则完整；模型限制开启但无实际可用模型时拒绝测试和提交，Skill/Tool/Knowledge 空允许列表按“明确禁用该类资源”处理；测试只认已保存草稿 revision；
- 已发布 Agent 的修改形成新草稿，测试和审核通过后再发布；
- 企业已发布 Agent 在 Desktop 中只读；有权限创建者可以派生个人草稿；Admin Console 可以创建或编辑企业 Agent 草稿，但不原地修改已发布 revision；
- 运行中任务不会因为 Agent 后续修改而静默改变；
- MVP 不提供可视化 Agent 编排画布。

### 7.7 Skill 使用能力

- 支持系统内置、企业发布、个人草稿和用户手动选择的本地 Skill；
- Skill Runtime 负责本地 Skill 的目录发现、来源识别、文件读取、结构解析和引用资源装配；
- 在已授权 Skill 目录内读取 Skill 定义和随附资源属于 Skill Runtime 内部行为，不创建 Tool 调用；
- Skill Runtime 读取 Skill 不触发 Tool 风险确认，但仍必须遵守 WorkspaceGrant 或用户级 Skill 目录授权；
- 兼容项目级和用户级 `.claude/skills/`、`.robothree/skills/` 目录；
- 不要求所有本地 Skill 统一格式；
- 不自动导入、复制或转换本地 Skill；
- 读取可识别的说明、模板、引用资源和 Tool 需求；
- 无法兼容的 Skill 给出明确提示，不静默忽略关键内容；
- 本地 Skill 只能访问已经授权的 Workspace 内容；
- Skill 引发的执行动作必须通过 Tool；
- 支持个人 Skill 草稿的编辑、测试、提交审核和重新提交；
- Claude Skill 申请企业共享时创建独立企业草稿，不修改来源文件；
- 运行中任务不会因 Skill 文件变化而静默改变执行依据。

### 7.8 Tool 使用能力

Tool 是 Core 唯一的原子执行能力。

MVP 按执行位置区分两类 Tool：

| 类型 | 配置与凭证 | 执行位置 | MVP 来源 |
| --- | --- | --- | --- |
| 代码 Tool | 由官方或企业受控流程发布可信代码包；需要凭证时使用对应 Runtime 的受控凭证域 | 可信 Manifest 声明的 Local Worker、受控本地进程或当前支持的企业 Runtime | 官方内置 Tool（含当前 Document Tool）和企业可信包 Tool |
| 中央远程 Tool | 管理员在 Admin Console 配置；凭证保存在中央服务 | Central Tool Gateway | HTTP API、MCP Tool |

代码 Tool：

- 由 RoboThree 官方发布流程，或企业开发/运维在 Admin Console 之外的受控流程完成开发、构建、安全检查、签名和发布；
- 从正式 Registry records 生成受信 Code Tool Manifest，并由 Central Catalog 获取发布事实；
- Runtime 只上报已安装可信 package/revision、兼容性和 readiness，不能上传、覆盖或伪造 ToolDefinition；
- 可信发布完成后代码 Tool 自动登记到企业列表；Admin Console 只配置允许范围、更严格确认和启停，不提供候选选择、安装、测试、删除，也不允许上传、编写、构建或分发任意代码；
- 当前 `pdf.extract_text`、`pdf.extract_tables`、`xlsx.read`、`docx.read`、`xlsx.write` 等 Document Tool 即属于该类型；
- 企业配置可以决定是否启用、哪些用户/部门/机器人可见和可用，以及更严格的确认限制；
- 技术 ID、模型可见官方说明、Schema、官方风险事实、Binding 和 AdapterDescriptor 对管理员只读；
- 企业服务暂时不可用但企业会话仍有效时，已经 Runtime Active、权限事实可复核
  且依赖完全本地可用的客户端预装 Tool 可以继续；企业会话失效后，受企业权限
  管理的本地 Tool 暂停。

中央远程 Tool：

- HTTP API 由管理员配置受控 Connection、GET/POST Operation、参数/响应映射、Schema、风险和用户权限；
- MCP 由管理员配置 Server Connection，测试后发现远端 Tool，并选择一个或多个分别注册为普通 RoboThree Tool；
- MCP Server 是连接与发现来源，不是 Agent 最终调用的资源类型；
- Local Core 不获得中央 Tool 长期凭证明文；
- 企业 Endpoint、Credential 和原始远程响应不进入 Desktop、TaskCapabilityLock 或普通安全 Projection；
- 调用统一通过 Central Tool Gateway；
- 企业服务或远程 Tool 不可用时显示不可用，不伪装成本地 Tool；
- MCP 只作为中央远程 Tool 的实现来源之一。若未来支持本地 MCP，必须作为官方预装本地 Tool 的受控实现，不开放任意代码加载。

Tool 技术定义、执行 Binding、Connection、Credential、Enterprise Policy、Validation 和 Health
保持分离。企业 Policy 只能停用或收窄使用范围、兼容范围和确认规则，不能降低官方风险、修改
官方 Schema/Binding 或绕过 Workspace、固定权限和用户确认。

Core 对所有 Tool 采用一致的用户能力语义：

- 有明确名称和用途；
- 有可校验的输入和输出；
- 有固定用户权限；
- 有风险等级；
- 有超时和取消行为；
- 有失败提示；
- 有基础审计；
- 涉及风险操作时请求 Desktop 用户确认。

MVP 不向 Agent 暴露一套独立 MCP 能力，也不建设独立 MCP 运行模块或 MCP Marketplace。

### 7.9 Knowledge 使用能力

- Knowledge 与 Model、Tool 分开管理；
- 支持查询一个可选的企业 Knowledge Provider；
- 建议首个 Provider 为企业 Wiki；
- 查询结果保留标题、来源链接和必要定位信息；
- 空结果、权限不足和连接失败需要明确反馈；
- Knowledge 未配置时不影响本地 Workspace 和 Tool 任务；
- 企业 MaaS 向量知识库作为后续 Provider 接入。

### 7.10 Workspace 安全

- 默认只访问应用自身目录；
- 用户明确授权后才能访问业务 Workspace；
- 所有文件操作校验真实路径；
- 只向执行组件提供本次任务需要的目录和操作范围；
- 读取、写入、删除、程序执行和外部发送分开处理；
- 越界操作直接拒绝并向用户说明原因；
- 本地 Skill 不能扩大 Workspace 权限。
- WorkspaceGrant 明确包含普通文件的 read、create、modify 权限时，范围内普通创建和修改不重复确认；
- 删除、批量覆盖、受保护文件、程序执行和外部发送仍单独确认。

### 7.11 固定权限与风险检查

MVP 使用简单、确定的检查顺序：

```text
用户是否有权使用该 Agent / Skill / Tool / Model / Knowledge
→ Workspace 是否覆盖目标文件或目录
→ Tool 风险等级是否要求用户确认
→ 用户是否确认
→ 执行
```

固定结果只有：允许、拒绝、等待用户确认。

在已授权 Workspace 中，普通文件 read/create/modify 默认属于低风险操作并直接允许；风险确认主要用于删除、批量覆盖、受保护文件、程序执行、外部发送和 Tool 明确标记的高风险动作。

MVP 不建设：

- 通用 Policy 规则语言；
- 动态条件组合；
- 数据分类策略平台；
- 后台运行时审批；
- Policy 过期处理；
- 实时撤销和复杂降级模式。

### 7.12 成果与预览

- 保存成果的类型、位置、来源任务和版本；
- 支持文件成果和结构化成果；
- 支持受控的本机 HTML 预览；
- 预览只能访问指定成果目录；
- 用户继续修改时保留可理解的版本关系；
- 成果默认保存在本地，是否上传企业服务后续决定。

### 7.13 任务可靠性

产品层验收要求：

- 应用重启后能够恢复会话和任务状态；
- 已完成工作不会因简单重试被重复破坏；
- 无法判断外部操作结果时，任务进入“需要人工处理”；
- 用户取消和超时可以传递到受控 Tool；
- 失败原因、可重试性和下一步建议对用户可见；
- 历史任务不会因后续配置变化而被静默改写。

具体实现协议由架构文档和 ADR 定义，不在产品功能文档展开。

### 7.14 企业配置同步与本地回退

- Local Core 只有在完整 Snapshot、全部强依赖 Package、Descriptor、权限、revision/digest 和兼容性校验通过后，才保存为最近一次成功配置；
- 最近成功配置的技术激活单位是 MaterializedEnterpriseConfiguration，不是只有远程引用的元数据列表；
- Configuration Storage Activation 只表示配置已成为本地最近成功版本，不表示当前冻结 RegistrySnapshot 已切换；
- Alpha 在 Local Core 受控重启并构建新 RegistrySnapshot 后才发生 Runtime Registry Activation，新 Task 才使用新配置；
- 当前 Task 继续使用已锁定运行组合和 TaskCapabilityLock；
- 企业在线且 Enterprise Access Token、Device Trust、权限和兼容性有效时，企业能力正常使用；
- 企业服务暂时不可用但企业会话仍有效时，只允许当前已经 Runtime Active 且满足
  `LocalExecutableEnterpriseCapability` 的企业能力继续；
- `LocalExecutableEnterpriseCapability` 必须同时满足：runtimeActive generation、
  Package 已密封、Package digest 有效、所需依赖可用、引用的 Model/Tool 可用；
- 上述判断只能来自 `enterprise-configuration.sqlite` 的持久事实，不得依赖
  内存、UI 或未持久化的上次运行缓存；
- 企业会话失效、设备不可信、权限失效或兼容性失败时，企业能力暂停，不进入新的
  Runtime Registry、Prompt 或新 Task；缓存配置只用于保留、校验、恢复诊断和审计；
- 个人 Model、客户端预装且不依赖失效企业授权的本地 Tool、个人/本地 Skill
  可以在各自依赖可用时继续运行，但不能因此获得企业配置或权限；
- 需要企业 Model Gateway、Central Tool Gateway 或其他不可用远程依赖的能力显示不可用；
- Core 通过 SSE reconnect 或 periodic polling 自动检测 Central 恢复，并复核
  Access Token 与 Device Trust，但恢复检测不等于自动同步或自动激活；
- Central 恢复并发现配置更新后，Desktop 显示“发现企业配置更新，是否同步并
  应用？”；只有用户确认后才执行下载、Storage Activation、Controlled Restart
  和 Runtime Activation；
- 禁止 Central 恢复后后台静默下载配置、Storage Activation、Runtime Activation
  或重启 Core；
- 客户端显示最近同步时间，并严格区分“企业在线”“企业服务暂时不可用但本地
  能力可继续”“企业会话失效”“企业恢复等待应用”；
- 客户端显示 `pending_runtime_activation`，需要受控重启时明确提示；
- 不运行中热替换 Binding、不修改冻结 RegistrySnapshot、不静默改变当前 Task 的 Model 或 Tool；
- MVP 不建设配置过期、离线租约、受限模式、实时撤销、Policy Engine、自动个人
  Model fallback、自动 Binding 切换、自动破坏性 GC 或复杂 RBAC；
- 本地缓存不能包含 API Key 明文或其他可直接泄露的凭证。

### 7.15 基础审计

记录：

- 哪个用户创建了任务；
- 使用了哪个 Agent、Skill、Tool、Model 或 Knowledge；
- 访问或修改了哪些文件；
- 用户是否完成风险确认；
- 任务最终成功、失败、取消或需要人工处理；
- 生成了哪些成果；
- 管理员修改了哪些配置；
- Agent/Skill 发布审核结果。

MVP 审计不保存或展示完整任务正文，不保存 API Key、凭证明文和不必要的敏感内容。

---

## 8. Admin Console MVP

### 8.1 管理端范围

Admin P0 只建设：

```text
Model
Tool
Agent / Skill 发布审核
Knowledge（可选）
系统管理
├── 用户与权限
└── 审计日志（基础审计）
```

反馈管理作为系统管理下的 P1 / Prototype 二级页面，不计入 Admin P0 闭环。系统管理不建设独立概览页，默认进入当前管理员有权访问的第一个子页面；无审计权限时不展示“审计日志”入口。

不建设独立审批、统一能力管理、独立 MCP、任务治理、设备运行时、资源成本和复杂健康监控模块。

### 8.2 Model 管理

#### 功能

- 新增和编辑模型提供方、Endpoint、Model ID 和显示名称；
- 管理员直接在模型页面填写 API Key；
- 系统负责安全保存 API Key，并在保存后只显示掩码；
- API Key 保存在中央安全凭证存储，只由企业 Model Gateway 在调用时使用；
- 设置企业默认 Model；
- 设置哪些用户可以使用；
- 设置哪些用户可以在 Desktop 添加个人 Model；
- 启用或停用 Model；
- 测试连接；
- 查看最近一次连接结果。

#### 明确边界

- 管理员不填写 Credential Reference；
- 普通用户不能查看或导出 API Key；
- 管理员不能通过 Admin Console 查看个人 Model API Key；
- API Key 不出现在日志、审计和客户端配置中；
- MVP 不建设成本分析、模型评测和复杂路由。

### 8.3 Tool 管理

#### 功能

- 使用统一表格展示代码工具、HTTP API、MCP 三种接入来源，并分开展示客户端预装/受控 Runtime/中央远程执行位置；
- 首屏使用 Tool、接入方式、状态、治理、更新时间、操作 6 个聚合列；分开展示配置、验证、健康和生效状态，不使用一个“正常”覆盖多个事实；
- 名称搜索和接入来源筛选常驻，执行位置、状态、风险和使用范围进入“更多筛选”；
- 官方或企业代码 Tool 须由研发在 Admin Console 之外完成开发、功能与安全测试、受控发布和可信 Manifest 登记，发布成功后自动进入企业 Tool 列表；
- “新增 Tool”只提供连接 API 与连接 MCP 服务；代码 Tool 不提供候选选择、添加、安装、保存草稿、管理员测试或删除；
- 代码 Tool 自动带出技术 ID、官方说明、Schema、风险、package/revision/digest、Binding/Adapter、Runtime、执行位置和兼容范围，系统自动检查当前运行环境；管理员只配置允许范围、更严格确认和启停；
- 代码工具使用独立详情/策略页，技术事实只读并默认折叠；Admin 不提供任意代码上传、编写、构建、依赖安装、替换实现、Schema 编辑或兼容范围修改；
- HTTP API P0 支持手动填写或粘贴单条 cURL 创建一个 GET/POST Operation，按“基础配置 → 连接配置”2 步保存草稿；cURL 解析结果回填同一份 API 地址、认证、Method、参数和使用范围表单；
- cURL 解析只读取单条请求，不执行 Shell、不联网、不自动保存/测试/启用，不依赖模型猜测关键请求事实；示例值不自动固化，敏感值只识别认证类型并显示掩码，Token/API Key 由管理员在当前 Connection 表单直接填写；OpenAPI/Swagger 批量导入保持 P1；
- MCP P0 只连接已部署的远程服务，按“验证并发现工具 → 选择 Tool → 设置范围并保存草稿”3 步保存一个或多个独立企业 Tool 草稿；Server identity、稳定 ID 和 Schema 由系统生成；
- MCP P0 认证支持“无需认证 / 访问令牌（Bearer Token） / API Key”；需要认证时由管理员在当前连接表单直接填写 Token/API Key，不建设独立 Credential 库或选择器；API Key 默认通过 `X-API-Key` Header 发送，特殊 Header 名称放入高级配置且须校验，禁止通过 URL Query 传递 API Key；
- MCP 首次发现提供搜索和“选择全部只读工具”，读取能力可默认选中，写入/删除/外发能力默认不选；第三步使用结构化部门/用户范围并只允许增加确认，不要求管理员编辑 Endpoint、Method、Schema、参数或风险摘要；
- HTTP/MCP 密钥由管理员在当前 Connection 表单直接填写并随连接受控保存；MVP 不建设可复用 Credential 对象、凭证名称、凭证选择器或独立管理页面，保存后不回显明文；
- HTTP/MCP 的保存草稿、测试和启用分开；创建页只保存草稿，测试和启用在详情页完成；有副作用 Tool 不默认对生产数据执行真实测试；代码 Tool 使用发布验证和系统自动环境检查，不要求管理员再次测试；
- 普通停用进入新的配置/Registry generation，只影响新任务；运行中任务保持创建时精确锁定；
- 被机器人引用的 Tool 停用或不兼容时，新任务失败关闭，不删除引用、不自动换 Tool或静默降级；
- 代码 Tool 不提供管理员删除，可信实现下架由研发发布流程处理；仅从未启用且未被引用的 HTTP/MCP 草稿允许删除企业登记。

#### 明确边界

- 不建设独立 MCP 菜单和资源类型；
- MCP Server 只作为 Tool 创建流程中的 Connection/discovery source，不建设独立 Server 产品模块；
- P0 不提供本地 MCP、Command/Arguments、环境变量、工作目录、`npx` 或依赖安装；本地 MCP 未来只能通过可信发布和受控 Runtime 部署后登记；
- 不建设 Tool Marketplace；
- 不允许通过 Admin Console 上传、编写、构建、安装依赖或分发任意可执行代码；
- 不建设复杂版本发布和通用撤销生命周期；
- 普通 Tool 停用在新的配置/Registry generation 成功应用后对新任务生效，不实时改写运行中 Task lock；
- 实时紧急撤销与普通停用分离，MVP Admin 不提供通用入口；若安全后台需要该能力，必须经过独立 Threat Model、开发计划和用户授权；
- 真实 Tool 管理按 `TOOL-MANAGEMENT-FEATURE-SPEC-v1.0.md` 和 TGM-0～TGM-5 分批接入；未接通页面保持 GATED，不接收真实代码包、Endpoint 或 Secret，不通过 Renderer 状态伪造新增、测试、启停或删除成功。

### 8.4 Agent/Skill 管理与发布审核

#### Agent 创建与编辑

- Desktop 和 Admin 创建/编辑 Agent 均使用模型、Skill、Tool、Knowledge 四项限制开关，默认关闭并收起；
- 关闭表示不设置 Agent 级限制，开启后才显示搜索、多选或添加入口并建立允许列表；开启且未选任何项表示禁止使用该类资源，必须明确提示；
- 模型限制关闭时可使用目标用户全部合法模型；开启时只能使用已选模型与目标用户合法模型的交集。候选模型按后台稳定顺序展示，当前实现可沿用配置/添加时间顺序，前端不提供排序；
- Admin 不默认铺开全部 Skill、Tool 或 Knowledge 复选框；选择器只展示当前企业已发布、已启用、未撤销且允许引用的资源，并在同名时展示来源或版本；
- 关闭开关保留草稿选择但不生效，再次开启恢复；发布时固定实际生效的允许列表和资源 revision；
- 发布前所选资源已不可用时阻止测试或发布；发布后资源被停用或撤销时，新任务失败关闭，不扩大范围、不静默替换。
- 保存草稿只要求名称；测试和发布要求名称、简介、行为与规则完整。测试只针对已保存 revision；头像和标签不进入 Agent 指令正文或指令 digest。

#### Skill 上传、发布与安装

- Admin 新增 Skill 只通过上传 `.zip`、`.rar`、`.tar.gz` 或 `.tgz` 压缩包开始，单个上传包上限为 200 MB，不提供在线从空白表单编写目录或文件的 P0 编辑器；
- 压缩包内任意目录必须存在且只能存在一个可识别的 `SKILL.md`，不要求位于压缩包最外层；系统以该文件所在目录作为逻辑根目录，并从该目录识别技能文件；扫描不到、检测到多个、已经找到唯一文件但读取、解压或解析失败时必须分别反馈准确原因；
- Central 在隔离暂存区检查文件类型、大小、解压后总量、路径穿越、绝对路径、符号链接、同名冲突和包完整性，解析过程中不执行脚本；
- 解析和安全校验通过后进入技能信息编辑页；Admin 可修改技能标题、技能描述、企业发布版本和使用范围。`SKILL.md` 的版本声明不是上传必填项：存在且能识别为有效版本时可辅助回填，不存在、无法识别或格式不规范时版本输入框保持为空，不阻止进入编辑页。企业发布版本在保存草稿前必须符合 `主版本.次版本.修订号`，已有技能的新版本不得重复或低于当前发布版本；草稿是独立状态，不修改版本号文本或自动追加 `-draft`；
- 技能名称、`SKILL.md` 正文、包内原始描述、可选的包内版本声明、文件清单、完整性摘要和校验结果保持只读；包内未声明版本时显示“未声明”，不得计入校验失败或警告；编辑目录展示信息不改写压缩包，也不改变技能运行行为；修改行为、Markdown、脚本或其他包内文件时必须重新上传；
- 面向管理员的文件清单默认隐藏 `__MACOSX`、`.DS_Store`、`._*`、`PaxHeader` 等系统元数据，但 Central 仍必须检查这些条目，隐藏不等于忽略安全校验；
- 解析完成、技能信息编辑、草稿保存、测试通过、固定 revision、发布成功和客户端已安装是相互独立的事实，不能互相冒充；
- 发布后客户端安装同一固定包，完成校验和安全解压后才进入“已安装”。

#### 发布审核

- 分别筛选 Agent 审核和 Skill 审核；
- 查看用户提交的不可编辑审核版本；
- Agent 审核查看名称、简介、行为与规则、四类限制开关的实际生效结果、固定资源引用、发布范围和版本；
- Skill 审核查看技能标题、技术名称、描述、行为与规则、固定技能包、依赖与权限声明、版本和完整性摘要；
- 校验能力包文件完整、依赖明确、版本固定且提交后未变化；
- 检查引用的 Tool、Model 和 Knowledge 是否存在且允许企业使用；
- 检查是否要求 Workspace、程序执行或外部发送；
- 支持通过或拒绝发布；
- 通过后成为企业可用 Agent 或 Skill；
- 拒绝时填写原因；
- 创建者撤回后停止审核；
- 被拒绝内容回到创建者草稿区，修改后重新生成完整固定能力包并提交；
- 已发布内容更新时必须提交新版本并重新审核；
- 已发布内容可以下架，但不建设统一撤销状态机；
- 本地 Skill 不需要审核即可供当前用户在当前 Workspace 使用；
- 本地 Skill 只有在申请企业共享时才进入审核；
- Claude Skill 提交企业共享时审核独立企业草稿，原 `.claude` 文件保持不变。

MVP 不建设审核测试报告、完整 Agent/Skill 可视化工作室、自动评测平台和多级审核流。

### 8.5 用户权限

本功能位于 Admin Console“系统管理 → 用户与权限”，不作为独立一级菜单。

- 查看内部测试用户；
- 为用户分配 Model、Tool、Agent、Skill 和 Knowledge 使用权限；
- 配置用户是否可以添加和使用个人 Model；
- 配置是否允许创建和提交 Agent/Skill；
- 配置是否允许进入 Admin Console；
- 配置是否允许查看基础审计；
- MVP 可以使用简单用户列表和权限勾选，不建设组织部门和复杂角色继承；
- 正式 SSO 和企业组织同步后置。

### 8.6 Knowledge 管理（可选）

- 配置一个企业 Knowledge Provider；
- 建议首个接入企业 Wiki；
- 管理员填写链接、API Key 和必要查询参数；
- 系统安全保存 API Key，界面只显示掩码；
- 设置允许用户；
- 测试连接和查询；
- 查看最近错误；
- 未确定真实数据源时可以不启用本模块。

MVP 不建设文档上传平台、OCR、切片、向量化、重排配置和知识质量运营平台。

### 8.7 基础审计

本功能位于 Admin Console“系统管理 → 审计日志”，不作为独立一级菜单；只有具有基础审计查看权限的管理员可以看到入口。

- 按用户、时间、对象类型和结果查询；
- 查看 Model、Tool、Agent、Skill、Knowledge、文件访问、用户确认和成果事件；
- 查看管理员配置变更；
- 查看 Agent/Skill 发布审核记录；
- 展示任务 ID 和目标类型等必要元数据；
- 不提供任务正文查看入口；
- 不记录 API Key 和凭证明文；
- P0 只支持页面查询，不提供审计导出。

### 8.8 管理端简化项

第一版明确不做：

- 独立审批模块；
- 运行时企业审批；
- 专门审批角色；
- 统一能力管理页面；
- 独立 MCP 模块；
- 任务治理和任务正文查看；
- 设备与 Runtime 管理；
- 复杂健康监控；
- 成本和预算管理；
- 多级组织、正式 SSO 和完整 RBAC；
- 通用撤销、灰度发布和复杂生命周期；
- 运营分析大盘。

---

## 9. 核心产品流程

### 9.1 开放式任务

```text
用户输入目标
→ 选择 Workspace 和可选 Agent / Skill
→ Core 使用已授权 Model 理解任务
→ 检查固定用户权限
→ 读取必要 Workspace / Knowledge
→ 调用 Tool
→ 风险操作请求 Desktop 用户确认
→ 生成成果
→ 用户查看并继续修改
```

### 9.2 本地 Skill 使用

```text
用户授权 Workspace
→ 系统发现项目级或用户级 .claude / .robothree 候选 Skill
→ 用户手动选择
→ 系统读取可兼容内容，不导入或改写原文件
→ 检查所需 Tool 和 Workspace 范围
→ 执行任务
→ 保存成果和基础审计
```

### 9.3 Tool 执行位置

```text
代码 Tool
→ 官方内置实现随 Desktop/可信代码包安装；其他实现先完成受控发布和可信登记
→ 系统自动登记到企业 Tool 列表并检查 Runtime/客户端兼容性
→ 管理员配置允许范围、更严格确认和启停
→ 由 Manifest 声明的受控 Runtime 执行
→ 使用 WorkspaceGrant 和本地凭证
→ 企业服务暂时不可用但企业会话仍有效时，仅在 Runtime Active、权限和本地依赖
  均可由持久事实复核时继续
→ 企业会话失效时，受企业权限管理的本地 Tool 暂停

中央远程 Tool
→ 管理员在 Tool 页面配置 HTTP API，或通过 MCP 连接发现并注册 Tool
→ 凭证保存在中央服务
→ Local Core 通过 Central Tool Gateway 调用
→ 远程结果返回 Desktop
```

用户和 Agent 都只感知 Tool。产品页面显示执行位置标签，但不把 MCP 作为独立能力类型。

### 9.4 企业 Model 与个人 Model

```text
企业 Model
管理员配置并保存中央凭证
→ Local Core 同步企业 Model 描述
→ 通过企业 Model Gateway 调用

个人 Model
有权限用户在 Desktop 配置并保存本地凭证
→ Local Core 从操作系统安全存储取凭证
→ 直接调用个人 Provider
```

两条链路不交换 API Key，不互相回退，也不静默切换。

两条链路共享同一个 `Max` 用户入口，但由各自受控 Model Adapter 解释；Renderer 和管理员不填写 Provider 参数、档位或预算。当前模型不支持、能力变化或映射失败时不发送无效参数，按模型默认行为继续任务，并在提交区或任务反馈中明确说明。

### 9.5 Agent/Skill 企业发布

```text
Agent：填写头像、名称、标签、简介和行为与规则
→ 按需开启模型、Skill、Tool、Knowledge 限制并选择允许资源
→ 保存个人 Agent 草稿

Skill：填写技能名称、描述和主要功能
→ 进入技能创建助手会话并生成 SKILL.md / references / scripts
→ 有效草稿进入“我创建的”

共同流程：从草稿详情使用个人权限和测试 Workspace 运行测试
→ 根据测试结果修改草稿并使旧测试结果失效
→ Agent 固定行为规则、实际生效限制和资源 revision；Skill 固定经过校验的技能压缩包
→ 提交不可编辑能力包
→ 管理员按 Agent / Skill 分类检查完整性、固定引用、依赖、权限、风险和版本
→ 通过：发布为企业 Agent / Skill
→ 拒绝：返回原因，创建者修改后重新生成能力包并提交
→ 已发布内容更新：有权限创建者在 Desktop 派生个人草稿并重新走完整流程

管理员直接新增企业 Skill：上传包含 SKILL.md 的压缩包
→ 系统安全校验并解析技能名称、Markdown、包内描述、可选的包内版本声明和文件清单；未声明版本不报错
→ 进入编辑页修改技能标题、技能描述、发布版本号和使用范围
→ 保存企业技能草稿；原始技能名称、SKILL.md 和压缩包保持不变
→ 测试、固定“技能包摘要 + 技能信息 + 使用范围”revision 并显式发布
```

### 9.6 企业服务不可用

```text
客户端无法连接企业服务
├─ 企业会话仍有效
│  → 仅允许当前已 Runtime Active 且完全本地可运行的企业能力继续
│  → 企业 Model 和中央远程 Tool 显示不可用
└─ 企业会话已失效
   → 企业能力暂停，不进入 Registry、Prompt 或新 Task

Central 恢复
→ Core 通过 SSE reconnect / periodic polling 自动检测
→ 复核 Access Token 和 Device Trust
→ Desktop 显示“发现企业配置更新，是否同步并应用？”
→ 用户确认
→ 下载并校验配置
→ Storage Activation
→ Controlled Core Restart
→ Runtime Activation
```

恢复检测不自动下载或激活配置。个人 Model、客户端预装且不依赖失效企业授权的
本地 Tool 和个人/本地 Skill 按本机依赖继续工作。MVP 不引入配置过期判断、
离线租约、受限运行模式、实时撤销或 Policy Engine。

---

## 10. 系统接入范围

| 对象 | MVP | 后续 |
| --- | --- | --- |
| Model | 一个真实企业 Model；有权限用户可添加个人 OpenAI-compatible Model | 更多 Provider、评测和智能路由 |
| Workspace | 用户明确授权的本地目录 | 企业文件系统、多设备同步 |
| Agent | 系统内置、企业发布、个人草稿 | 可视化编排和高级评测 |
| Skill | 企业、个人，以及手选的项目级/用户级 `.claude/skills/`、`.robothree/skills/` | 更多 Claude Skill 兼容和高级 Hook |
| Tool | 官方内置/企业可信代码 Tool 可信发布后自动登记；HTTP GET/POST Tool；MCP 发现并注册 Tool | OpenAPI、更多 Method、Shell/CLI、Browser/Computer、更多 Tool Pack；任意代码上传/在线构建持续不属于 Admin Console |
| MCP | 仅作为 Tool 的 Connection/discovery source 和实现来源 | 更多 Transport、连接治理和 Marketplace |
| Knowledge | 可选的一个企业 Wiki Provider | MaaS 向量知识库和质量平台 |
| Identity | 内测本地身份或 Mock Identity | 企业 SSO、组织和完整 RBAC |

---

## 11. 数据与安全边界

### 11.1 本地数据

默认保存在本地：

- 会话和任务历史；
- Workspace 授权信息；
- 本地 Skill 选择；
- 个人 Model 描述和本地凭证状态；
- 本地成果及其索引；
- 最近一次成功同步的非敏感企业配置；
- 必要运行日志。

### 11.2 企业数据

企业服务第一版只需要保存：

- Model 和 Tool 配置；
- Agent/Skill 发布内容和审核结果；
- 少量用户权限；
- 可选 Knowledge 配置；
- 基础审计元数据。

企业服务不保存个人 Model API Key。

MVP 不上传或展示完整任务正文。

### 11.3 凭证

#### 企业凭证

- 管理员在 Admin Console 的 Model、中央远程 Tool 或 Knowledge 对应配置表单中直接填写 API Key/Token；MVP 不建设独立企业 Credential 库；
- Central Enterprise Service 将凭证保存到中央安全凭证存储；
- 客户端只接收对象描述、权限和 Gateway 地址，不接收企业 API Key；
- 企业 Model 和中央远程 Tool 由中央 Gateway 使用企业凭证调用；
- 保存后 Admin Console 只显示掩码。

#### 个人 Model 凭证

- 有权限用户在 Desktop 添加个人 Model 时填写 API Key；
- Local Core 将凭证保存到操作系统安全凭证存储；
- 企业服务不接收、代理、备份或显示个人 API Key；
- 个人 Model 由 Local Core 直接调用 Provider；
- Desktop 保存后默认显示掩码；个人模型所有者可主动查看自己的完整 Key，离开页面后恢复隐藏；实现前必须以 ADR-013 增补冻结受控反向敏感通道；
- MVP 不检测或阻止操作系统截图/录屏；Renderer 仅在输入、保存或所有者主动查看期间短暂处理明文，且不得持久化或写入日志、埋点、错误和 QA 证据。

#### 共同要求

- 产品界面不要求用户填写内部凭证引用字段；
- 凭证不进入任务记录、日志、审计和成果文件；
- 企业配置本地缓存不包含企业明文密钥；
- 个人 Model 配置同步不包含个人明文密钥。

### 11.4 文件和外部发送

- Workspace 外文件默认不可访问；
- 外部发送必须显示目标和数据摘要并由用户确认；
- Tool 和 Skill 不能自行扩大文件权限；
- 删除、程序执行和外部发送必须单独判断；
- Renderer 不直接访问文件系统和系统命令。

---

## 12. 非功能要求

### 12.1 可靠性

- 应用重启后恢复会话、任务和成果关系；
- 企业服务暂时不可用不应阻断本地可运行任务；
- Tool 失败、超时和取消有明确结果；
- 无法确认外部操作结果时不自动重复危险操作；
- 配置同步失败不覆盖最近一次可用配置；
- 本地 Skill 读取失败不破坏原文件。

### 12.2 性能建议目标

| 指标 | MVP 建议目标 |
| --- | --- |
| Desktop 冷启动 | 5 秒内进入可交互状态 |
| 本地任务状态更新 | 500ms 内反映到 UI |
| Model 首字响应 | Provider 正常时 5 秒内 |
| 用户取消传播 | P95 1 秒内到达受控 Tool |
| 本地 Skill 候选扫描 | 常规 Workspace 下 2 秒内完成首批结果 |
| 企业配置读取 | 本地缓存 500ms 内可用 |
| 重启恢复 | 10 秒内识别未完成任务状态 |

具体数值在接入真实企业网络、Model 和 Tool 后重新测量。

### 12.3 安全

- 跨进程和跨服务输入必须校验；
- 文件真实路径必须校验；
- 除个人模型 Key 在输入、保存或所有者主动查看期间由敏感组件短暂处理外，API Key 和敏感凭证不得进入 Renderer；任何 Key 均不得进入 Renderer 持久状态、日志或普通 ViewModel；
- 风险 Tool 必须经过 Desktop 用户确认；
- 本地 Skill 不获得隐式脚本执行和网络权限；
- 未经审核代码不进入 Core 进程；
- 审计不包含任务正文和凭证明文。

### 12.4 可维护性

- Core 不出现具体行业场景判断；
- Agent、Skill、Tool、Model、Knowledge 保持清晰边界；
- MCP 兼容逻辑不能扩散为第二套 Tool 模型；
- 本地 Skill 来源兼容通过独立适配边界实现；
- Desktop、Core、Worker 和企业服务保持逻辑隔离；
- 每个开发批次包含自动化测试、架构边界检查和独立 QA。

---

## 13. MVP 验收标准

### 13.1 Desktop 验收

- 用户可以创建开放式任务并连续追问；
- Agent 显示允许的 Model 范围；用户可以在 Task 首次提交前选择 Core 返回的合法候选 Model；
- Agent 模型限制关闭时允许当前用户全部合法 Model，开启时只允许所选 Model 与用户合法 Model 的交集；候选按后台稳定顺序展示；
- 无 Agent 约束时的显式选择更新 User personal defaultModel；Agent 约束产生的临时有效模型只写入当前 Task requestedModelId，不修改 Agent 配置或 User personal defaultModel；
- 切换 Agent 会取消不兼容的已选 Skill 和 Knowledge；切回或取消 Agent 时不自动恢复，用户可重新选择；
- 用户可以授权本地 Workspace；
- 用户可以从项目级或用户级 `.claude/skills/`、`.robothree/skills/` 候选中手动选择本地 Skill；
- 系统不复制、不转换、不改写被选择的本地 Skill；
- 用户可以选择已授权企业 Model；
- 有权限用户可以添加、编辑、使用和删除个人 Model；个人模型分别填写 Provider 模型标识和显示名称，不提供测试连接，保存后以“未验证”开始；网络失败保留警告但允许再次真实调用；企业模型为空时允许用户明确选择可用个人模型；
- 新任务输入框提供单一 `Max` 开关；关闭不附加推理强度参数，开启时优先映射当前模型最强受支持模式；换模重算，不支持、能力变化或映射失败时按默认模式继续并明确提示，任务创建后记录结果并可在重试、后续轮次和重启中保持；
- 个人 Model API Key 只保存在本机操作系统安全凭证存储；
- 用户可以创建和测试个人 Agent/Skill 草稿并提交审核；
- Agent 草稿只需名称即可保存；测试和提交审核要求名称、简介、行为与规则完整，并只针对已保存 revision；
- 已授权 Workspace 内普通文件创建和修改不逐次确认；
- 外部调用按任务、目标和数据范围确认；同一任务且范围未变化时不重复弹窗；
- 风险文件或 Tool 操作在 Desktop 请求用户确认；
- 用户可以查看任务进度、文件变化和成果；
- 用户可以取消、补充输入和重试；
- 没有独立消息中心和企业审批入口；
- Renderer 不能直接读取文件、数据库和凭证。

### 13.2 Core 验收

- 开放式目标能够形成可执行任务；
- Platform、Task Boundary、Agent 和 Selected Skill 分别以 `hard / hard / role / advisory` 进入确定性 Instruction Bundle，动态资料只以 `reference` 进入上下文；
- 相同锁定来源和 Assembly revision 生成相同顺序与 bundle digest；Dynamic Request Facts 与 Reference receipts 不进入稳定 digest；多 Skill 的 ordinal 只保证复现，不产生隐式权限；
- Task Instruction Binding 与 Bundle 原子物化；每轮 Context receipt 可证明稳定 Bundle、固定包含当前时间/应用语言/系统时区的 Dynamic Request Facts，以及 Reference/retrieval receipts；
- Agent 业务字段只编译一次形成不可变 revision，历史任务不按当前字段重编译；
- 默认通用 Agent 是 Core 内置、不可编辑、具有稳定 ID/revision/digest 的真实 Agent revision，不进入普通企业机器人管理；
- 首次提交前切换 Agent 不残留旧 Agent 内容或不兼容 Skill/Knowledge；Core 接受首次 `SubmitTurn` 时原子创建 Task 与 Runtime Selection，并在第一次模型调用前锁定 Agent revision，网络或模型失败不允许原任务换 Agent；
- 用户当前明确要求可以在不违反 `hard/role` 时覆盖 Skill 建议，Skill 声明不能授予 Tool、Knowledge、Workspace 或模型权限；
- 个人 Agent/Skill 草稿由本人显式选择后可以进入 `role/advisory`，但不执行秘密模板替换、不自动执行 Skill 脚本、不扩大能力范围；
- Tool Result 以 Core 结构化 outcome 为唯一执行结论；Effect `uncertain` 不伪造普通 Tool Result，暂停 Agent Loop；核对三动作形成独立、幂等、single-winner 事实并从原暂停点恢复，任何路径不重发原副作用；
- 上下文超预算不静默截断 Platform、Task Boundary、Agent 或任何已锁定 Skill 主正文，不自动更换模型；
- 同一 Model Invocation 恢复复用原 retrieval receipt，缺失或漂移时不使用当前 Knowledge 替换；
- 单一 Bundle Compiler 支持多 System 与单 System canonical wrapper 合并、保留标记转义和 Reference 隔离，MVP 不使用 Developer Role；
- 验收分别包含确定性 Conformance、Provider Body Fixtures、固定行为 Eval 和进程/并发恢复矩阵；行为 Eval 不替代 Core 权限和 Effect 安全证明；
- Local Core 负责 Runtime Selection；机器人模型限制关闭时使用用户全部合法候选，开启时使用机器人已选与用户合法候选的交集，并按后台稳定顺序确定回退，不评分“最佳模型”；
- Core 接受首次 `SubmitTurn` 后实际 Model 和运行组合不可变，配置同步、health、断线或首次调用失败不得触发静默切换；
- Task 启动后 `Max` 请求状态和实际解析结果不能按最新全局偏好重算；该事实优先随既有 Task Runtime Selection、模型锁或等价任务记录恢复，不强制新增独立锁体系；
- ModelEligibilityEvaluator 只做确定性过滤，不复用 CapabilityResolver，不评分、不排序；
- Agent、Skill、Tool、Model、Knowledge 可以按各自语义被使用；
- 个性化“自定义指令”不进入 MVP 生产上下文；未来接入需独立冻结 User Preference `advisory` 层；
- Agent 只来自用户显式选择或默认 Agent，不进行全局 Agent 评分选择；
- Skill 只来自用户选择或当前 Agent 固定引用；
- Tool 只从当前 Agent/Skill 固定依赖和已开放通用 Tool 列表中选择；
- Knowledge 只来自用户选择或当前 Agent/Skill 固定引用；
- Core 不建设跨 Agent、Skill、Tool、Knowledge 的通用搜索评分和智能路由；
- Tool 是唯一原子执行能力；
- MCP Tool 通过普通 Tool 路径执行；
- 企业 Model 通过企业 Model Gateway 使用中央凭证调用；
- 个人 Model 由 Local Core 使用本地凭证直接调用；
- 两类 Model 不交换凭证、不互相静默回退；
- 中央远程 Tool 与客户端预装本地 Tool 使用不同执行位置和凭证域；
- 本地 Skill 只在用户选择后进入任务；
- 本地 Skill 由 Skill Runtime 发现、读取和解析，不为了读取 Skill 创建 Tool 调用；
- 本地 Skill 不能越过 Workspace 边界；
- 固定权限、Tool 风险和用户确认链路有效；
- 外部目标或数据范围变化时必须重新确认，确认不能跨任务复用；
- 应用重启后可以恢复任务状态；
- 无法确认外部结果时进入需要人工处理；
- 企业服务暂时不可用但企业会话仍有效时，只使用已 Runtime Active 且完全本地
  可运行的企业能力；企业会话失效时企业能力暂停；
- 产品界面不暴露底层一致性和持久化协议。

### 13.3 Admin 验收

- 管理员可以在 Model 页面填写 API Key、测试连接并设置默认 Model；
- 管理员可以授权指定用户添加个人 Model，但不能查看个人 API Key；
- 界面不要求管理员填写 Credential Reference；
- 管理员可以在同一列表区分代码工具、HTTP API、MCP 和对应执行位置；列表使用 6 个聚合列且四组状态仍可区分；
- 管理员可以治理可信发布后自动进入企业列表的官方/企业代码 Tool；系统自动带出只读技术事实并检查当前环境，Admin 不提供添加、安装、草稿、测试、删除或任意代码上传、编辑、构建和依赖安装；
- 管理员只能通过“连接 API”和“连接 MCP 服务”新增 Tool；HTTP 使用两步创建并支持单条 cURL 快速导入，MCP 保持 3 步；两者都只保存草稿，测试与启用在详情页完成；
- cURL 解析回填现有表单，错误和未识别项明确展示；不得执行、联网、静默丢字段或把解析成功冒充连接/保存/测试/启用成功；
- MCP 只连接远程服务，写入/删除/外发 Tool 必须主动选择；使用范围通过结构化选择器配置，风险摘要系统生成，保存后仍须分别测试和显式启用；
- MCP 认证可选择无需认证、访问令牌（Bearer Token）或 API Key；API Key 默认使用 `X-API-Key`，普通管理员无需填写 Header，特殊 Header 名称仅在高级配置中修改；
- MCP Tool 策略和服务连接分开编辑；从 Tool 来源进入连接详情后才能修改地址/访问密钥、重新验证和手动重新发现，新发现或变化不得自动启用或覆盖引用；
- Tool 的配置、验证、健康和生效状态分离；HTTP/MCP 保存、测试和启用互不冒充，代码 Tool 使用发布验证和自动环境检查；
- 企业 Tool 密钥随对应 Connection 受控保存，不提供独立凭证管理或跨连接复用；界面不要求填写内部引用，保存后不回显明文；
- 普通停用只影响使用新 generation 的新任务；运行中任务保持锁定，被引用 Tool 不可用时新任务失败关闭且不静默换 Tool；
- Admin Console 中不存在独立 MCP 模块；
- 管理员创建/编辑 Agent 时，模型、Skill、Tool、Knowledge 使用默认关闭的限制开关，只有开启后才能选择允许资源；模型限制关闭表示目标用户全部合法模型，开启表示已选模型与用户合法模型的交集；关闭、有限允许列表和禁止使用三种语义可明确区分；
- Agent 草稿只需名称即可保存；测试和发布要求名称、简介、行为与规则完整，并只针对已保存 revision；
- 管理员新增 Skill 只上传 `.zip`、`.rar`、`.tar.gz` 或 `.tgz` 压缩包，单包不超过 200 MB；包内任意目录存在且只存在一个可识别的 `SKILL.md` 即通过结构校验，系统以其所在目录作为逻辑根目录；不在线编写技能目录；`SKILL.md` 未声明版本或版本无法识别不计入校验失败；解析通过后进入编辑页，可修改技能标题、技能描述、企业发布版本和使用范围，技能名称、`SKILL.md` 和包事实保持只读；未找到、检测到多个、已找到但读取或解析失败时分别准确反馈；
- 解析、编辑、草稿保存、测试、固定 revision、发布和客户端安装状态分离，编辑展示信息不改写原始技能包；
- 用户安装企业 Skill 时，客户端校验发布包并解压到受控 Skill 目录，不执行脚本、不自动安装环境依赖，失败不留下半安装目录；
- 管理员只审核完整、固定、不可编辑的 Agent/Skill 能力包；
- 发布审核不接收测试报告，也不建设测试报告查询系统；
- 管理员可以配置少量用户权限；
- 可以选择性接入一个企业 Wiki Knowledge Provider；
- 基础审计不展示完整任务正文；
- Admin Console 中不存在独立运行时审批模块、复杂健康监控和通用能力页面。

### 13.4 端到端验收任务

验收载体不形成场景专用 Core：

1. 用户打开并授权一个包含本地 Skill 的 Workspace；
2. 系统发现项目级 `.claude/skills/` 或 `.robothree/skills/` 下的候选 Skill；
3. 用户手动选择一个 Skill；
4. 用户通过自然语言提出文件或 HTML 生成任务；
5. Core 使用管理员配置的企业 Model，或由有权限用户选择个人 Model；
6. Skill 调用客户端预装本地文件 Tool；
7. 普通文件创建和修改直接执行，删除或外部发送触发 Desktop 用户确认；
8. Tool 生成成果并支持本机预览；
9. 应用重启后任务和成果仍可查看；
10. 断开企业服务后，Desktop 能区分企业会话是否仍有效；只有已 Runtime Active
    且完全本地可运行的企业能力可以继续，企业会话失效时企业能力暂停；
11. Admin Console 可以看到必要审计元数据，但不能查看任务正文。

Agent/Skill 发布闭环另行验收：创建草稿、个人自测、生成完整固定能力包、提交审核、管理员检查完整性/依赖/权限/风险、通过或拒绝、拒绝后修改重提、发布后创建新版本并重新审核。审核端不接收和展示测试报告。

---

## 14. 版本边界

### 14.1 MVP P0

#### Desktop

- 工作台和开放式任务；
- 对话、任务列表和任务详情；
- 企业 Model 选择和有权限用户个人 Model 管理；
- 新任务全局 `Max` 推理开关；
- Workspace 授权；
- 本地 Skill 发现与手动选择；
- “能力”导航容器下 Agent、Skill、Tool、Model、Knowledge 分开展示；
- Agent/Skill 创建、测试和提交审核；
- Desktop 用户确认；
- 成果、历史和最小设置。

#### Core

- 对话、任务和 Agent 执行；
- Agent Definition revision、Task 级 Runtime Selection 和显式模型覆盖；
- 上下文管理；
- Agent、Skill、Tool、Model、Knowledge 使用；
- RoboThree Skill 与 Claude Skill 的项目级、用户级兼容；
- 企业 Model 与个人 Model 双调用链路；
- 客户端预装本地 Tool 与中央远程 Tool；
- Agent/Skill 草稿、测试和发布衔接；
- Workspace 安全；
- 固定权限和 Tool 风险检查；
- 用户确认；
- 成果、恢复、配置缓存和基础审计。

#### Admin

- Model；
- Tool；
- Agent/Skill 发布审核；
- 一个可选 Knowledge Provider；
- 系统管理：个人 Model 权限、少量用户权限和基础审计。

#### Central Enterprise Service（中投入）

- 企业 Model Gateway；
- Central Tool Gateway；
- 中央安全凭证存储接入；
- 企业配置存储、下发和最近有效版本；
- Agent/Skill 固定能力包接收、审核与发布；
- 少量用户权限；
- 基础审计接收与查询；
- Admin Console 管理 API。

### 14.2 P1

- 正式 SSO、组织和完整 RBAC；
- Agent/Skill 可视化工作室；
- Task Template；
- 更多 Claude Skill 格式兼容；
- MaaS 向量 Knowledge；
- 更多 Tool Pack；
- OpenAPI/Swagger 文本、文件、URL和批量 Operation 导入，HTTP 更多 Method、Shell/CLI、浏览器和电脑自动化 Tool；
- Scheduled Task；
- Remote Worker 和服务器沙箱；
- 设备管理；
- 成本和用量分析；
- Model/Tool 调用量统计；
- 系统管理下的反馈管理，包括反馈列表、详情和回复 Prototype；不包含企业公告、通知模板或消息渠道配置；
- 审计、诊断日志和成果包导出；
- 更完整的审计查询和保留策略。

### 14.3 明确不在 MVP

- 运行时企业审批；
- 专门审批角色和独立审批模块；
- 完整 Policy 平台；
- Policy 过期和受限模式；
- 面向管理员的通用实时紧急撤销机制；
- 独立 MCP 能力模块和 Marketplace；
- 自动导入、转换或统一所有本地 Skill；
- 统一能力用户界面；
- 任务正文查看；
- 独立消息中心；
- 复杂健康监控；
- 通用撤销和复杂发布生命周期；
- Multi-Agent / Subagent；
- 任意复杂 DAG 和 Workflow Builder；
- 多租户 SaaS；
- 个人模型批量导入、多 Provider 治理等完整 BYOK 平台；
- 复杂运营、成本和合规报表。

---

## 15. 待后续确认项

以下事项不阻塞 KAF-4，但应在相应功能进入开发前确认：

1. Claude Skill 首期兼容的最低文件形式和不兼容时的用户提示；
2. 用户级 RoboThree Skill 在 Windows 和 macOS 的最终物理存储位置；
3. Tool 风险等级和 Desktop 用户确认的最终固定映射；
4. 首个真实企业 Model Gateway、Provider 和流式接口；
5. Tool 的首个真实 MCP Transport；
6. 企业 Wiki 的 API、认证方式和引用格式；
7. 中央远程 Tool Gateway 的认证方式；
8. Agent/Skill 发布后的下架体验；
9. 审计元数据的保留期限；
10. Windows 内部分发、签名和更新方式。

这些事项应通过具体功能方案或架构决策逐项冻结，不需要在本产品功能文档中提前展开底层实现。

---

## 16. MVP 最终成功判定

RoboThree MVP 成功的最低标准是：

> Central Enterprise Service 能够可靠代理企业 Model 和中央远程 Tool，保护中央凭证并下发配置；管理员能够管理客户端预装本地 Tool、分配少量使用权限，并只对完整固定的 Agent/Skill 能力包进行发布审核。有权限员工能够添加个人 Model，在 Desktop 中授权 Workspace，手动选择项目级或用户级 Claude/RoboThree Skill 并创建开放式任务。Agent Core 只在已确认候选范围内选择 Agent、Skill、Tool 和 Knowledge，不演化为全局智能路由平台；本地 Skill 由 Skill Runtime 直接读取。普通文件创建和修改不被反复打断，外部调用按任务、目标和数据范围一次确认；成果可查看和继续修改，任务可在应用重启后恢复。企业服务暂时不可用但企业会话仍有效时，只有当前已 Runtime Active 且完全本地可运行的企业能力继续；企业会话失效时企业能力暂停，Central 恢复后由用户确认是否同步并应用新配置。

只要这一闭环稳定成立，MVP 就已经具备继续扩展 Tool Pack、企业 Knowledge、Agent/Skill 工作室和企业治理能力的基础。
