# MVP-VERTICAL-SLICE-1 Revision 1 真实任务垂直闭环联合实施方案

> 状态：**REVISION 1 / PLAN REVIEW PASS/CLOSED；VS1.1～VS1.3 与 MVP-VS1 ENGINEERING CONFORMANCE PASS/CLOSED；DEMO READINESS PENDING**  
> 日期：2026-08-29  
> 负责人：Codex 5.6  
> 交付方式：Core / Central / Desktop Renderer 联合批次  
> 实际联合版本：`0.0.0-mvp.vs1.3`  
> 控制优先级：高于 DFI-4A.4.2 repair.1、DFI-4A.4.3、Admin v2、TGM、Knowledge Provider 与 Agent Lifecycle
> 讨论区评审：`DISC-20260829-001-mvp-vs1-cx`（`讨论区/20260829/001-mvp-vs1-cx.md`）

> 用户接受：2026-08-29。当前关闭结论仅为 `MVP_VERTICAL_SLICE_1_E2E_CONFORMANT`；由于联合 E2E 使用受控
> Gateway HTTP/SSE fixture，`MVP_VERTICAL_SLICE_1_USABLE` 与后天演示就绪仍需实际 Central + 真实模型冒烟、
> 三轮演示彩排和演示版本冻结。

### Revision 1 收敛说明

Revision 1 吸收客户端前端、Admin 前端、产品与测试/独立 QA 的共同结论，只修正会阻断真实 MVP 的边界：

1. 验收输入改为用户直接提供完整项目摘要，不再宣称读取工作空间资料；
2. 通用机器人保持唯一入口，Catalog 只新增 `agent.presentation`；
3. `SKILL.md` 提供紧凑合法的 `PresentationSpecV1` 示例，不放宽 Worker 校验；
4. internal-trial access token 只复用现有 Token Provider，不新建敏感传输体系；
5. 日常确定性门禁与显式 opt-in 真实 Provider E2E 分开；
6. Core 重启后的恢复、迟到响应丢弃与禁止重复提交语义写死；
7. Model/Agent/Tool/Workspace/Skill exact ref 冲突全部 typed fail-closed；
8. deployment Model 明确为非 Admin 管理，`apps/admin-console/**` authored source 零修改；
9. 实施报告按八项 DoD 逐项提供同一执行链证据，并进行小规模定向泄漏扫描。

本修订明确拒绝重新扩张为 64/80 次组合矩阵、八个新机器 outcome 字段、Admin handoff Schema、新 Contract、
跨版本 Evidence 标志、全部历史专项 Harness 强制复跑或三个内部检查点分别关闭。

## 0. 结论先行

当前 RoboThree 的架构方向没有根本错误，但研发完成标准已经从“用户能完成真实任务”偏移为“Contract、恢复、
安全证据和阶段门禁全部闭环”。Core、Contract、恢复链、Document Tool、成果 Projection 和 Desktop 页面已经具备
大量可复用实现，普通启动路径却仍没有可用 Model、Skill 和 Tool lock，所以用户无法稳定完成一次真实任务。

本方案建立唯一最高优先级：

> **让普通 Desktop 使用一个真实企业 OpenAI-compatible Model，在通用/专项 Agent 与显式本地 Skill 的约束下，
> 真实调用 `tool.document.pptx.write`，把 PPTX 显示在成果面板，并在应用重启后继续可见。**

本批采用垂直联合交付，不再把 Model、Agent、Skill、Tool、Renderer 和 E2E 分成多个底座关闭批。只进行一次计划评审、
一次联合编码、一次独立代码 QA 和一次用户接受。

本方案进入评审后，以下路线保持暂停/GATED：

- DFI-4A.4.2 repair.1 Public Mutation Identity v1alpha3；
- DFI-4A.4.3 Personal Model Closure；
- Personal Model Key 完整回显、正式 Helper signing/notarization；
- Admin mutation / production identity / SSO；
- TGM、Knowledge Provider、Agent/Skill 创建发布生命周期；
- Enterprise Max、DeepSeek、Multi-Agent、Memory 与 Effect Reconciliation 扩张；
- 没有首个真实消费者的新公共 Contract 版本。

## 1. 当前工程事实

### 1.1 可直接复用

1. Core 已有 `DurableEnterpriseModelProvider` 与 `HttpEnterpriseModelGatewayClient`；
2. Central 已有 Model Gateway、OpenAI-compatible Provider Adapter、durable invocation 与 SSE/status/cancel 链；
3. `agent.general` 已有 code-owned stable ID/revision/digest 和产品确认的中文 exact material；
4. CPC Platform Prompt、Agent instruction、Skill instruction 的单一 System Message 编译链已存在；
5. Agent Loop、Tool call batch、Tool observation、Task/Conversation/Receipt/Recovery 已存在；
6. Document Worker 已提供六个真实 Tool：PDF text/table、XLSX read/write、DOCX read、PPTX write；
7. Tool execution 已经过 Task lock、Workspace、Authorization、Confirmation、Effect 与 Recovery；
8. Task Artifact Projection、成果列表、预览、打开位置和重启恢复页面已存在；
9. Desktop Workbench 已有 Agent/Model/Skill/Knowledge 选择状态和真实 SubmitTurn Adapter；
10. normal graph 已隔离 scripted fixture，真实链不可用时会 fail-closed。

### 1.2 当前真实断点

1. 普通 Desktop `liveModels=[]`，`RuntimeAdapterHandles` 未注册企业 Provider；
2. normal graph 默认 `FailClosedModelProvider`；
3. production registry/permission snapshot 的 Model、Skill、Tool、Knowledge 全为空；
4. `prepareToolLocks()` 当前拒绝任何非空 Tool candidate；
5. CPC Platform Prompt 默认关闭；
6. normal execution repository 只加载 `agent.general`，没有可切换的专项 Agent；
7. `LockedSkillInstructionResolver` 只有 Port，没有可信生产实现；产品仓没有可消费的 `SKILL.md`；
8. Admin 普通入口仍安装 `UnavailableAdminAdapter`，不适合作为本批 Model 配置前置；
9. production identity/SSO 未就绪，不能把本批描述成公开生产发行。

## 2. 唯一产品验收链

### 2.1 用户场景

内部试用用户选择一个工作空间，使用普通方式启动 Desktop，选择“演示文稿助手”和“演示文稿规划”本地 Skill，输入：

```text
请根据以下项目摘要生成一份 5 页的项目汇报 PPT，保存为 项目汇报.pptx。

项目摘要：<由受控 E2E 直接提供的完整、非敏感文本摘要>
```

系统必须：

1. 通过 Central 调用一个真实企业 OpenAI-compatible Model；
2. System Message 包含 Platform Prompt、专项 Agent exact rules 和所选 Skill exact body；
3. Model 返回真实 Tool Call；
4. Core 通过已锁定的 `tool.document.pptx.write` 调用 Document Worker；
5. 文件写入用户已授权 Workspace；
6. Tool Observation 回到 Agent Loop，任务完成；
7. Desktop 任务详情和成果面板显示 PPTX；
8. 重启 Desktop/Core 后，原任务、Tool 过程、结果摘要和 PPTX 成果仍然存在。

本批不宣称读取工作空间资料，也不新增文件读取 Tool。若后续必须验证“根据工作空间文件生成”，应在 VS2 通过受控
DOCX/PDF/XLSX read Tool 建立独立真实读取证据，不得把该能力混入本批。

### 2.2 Definition of Done

以下八项必须同时成立：

| # | 验收结果 |
| --- | --- |
| 1 | normal Desktop，不使用 demo/legacy/test fixture |
| 2 | 真实 Central + 真实 OpenAI-compatible 上游请求 |
| 3 | Workbench 未选择专项 Agent 时唯一映射 `agent.general`；选择 code-owned `agent.presentation` 后 instruction digest 和行为规则变化，Catalog 不出现第二个通用机器人入口 |
| 4 | 一个可信本地 Skill 被显式选择、锁定 revision/digest 并进入单一 System Message |
| 5 | `tool.document.pptx.write` 被 Model 真实调用，不是脚本硬编码 Tool Call |
| 6 | Workspace 中生成可打开的真实 PPTX |
| 7 | Tool 过程和 Artifact 在真实 Desktop 页面显示 |
| 8 | 应用重启后 Task/Conversation/Receipt/Artifact 恢复，文件仍存在 |

任一项不成立，本批不得输出 `MVP_VERTICAL_SLICE_1_USABLE`。

## 3. 范围与非范围

### 3.1 本批必须交付

- 一个 deployment-configured 企业 Model binding；
- Desktop normal bootstrap 中的企业 Gateway Client、Provider、Runtime Handle、Registry/Entitlement 接线；
- 受控内部试用身份与既有 Token Provider consumption；
- CPC Platform Prompt production consumption；
- `agent.general` 加一个 code-owned `agent.presentation` 专项 Agent；
- 一个最小可信本地 Skill 目录与 exact `SKILL.md` Resolver；
- Document Tool exact Registry/permission/Tool Policy/Task Lock；
- Workbench 的真实 Model/Agent/Skill availability；
- Tool activity、Task status、Artifact 面板的联合接线和错误展示；
- 一条真实 Electron → Core → Central → Model → Document Worker → Artifact → restart E2E；
- focused tests、联合实施报告、Evidence 和一次独立 QA。

### 3.2 明确不做

- Personal Model CRUD/Reveal/UI、v1alpha3 mutation identity；
- 企业 SSO、正式 RBAC、公开生产身份；
- Admin Model CRUD 或 production Admin Adapter；
- Agent/Skill 创建、编辑、测试、发布、审核；
- Skill 安装、下载、Registry、第三方代码执行；
- 完整 Skill Catalog；本批只支持一个受信目录中的显式本地 Skill；
- TGM、HTTP/MCP Tool 管理、Tool activation 管理后台；
- Knowledge Provider；
- Max、DeepSeek、Enterprise reasoning 扩张；
- HTML/Markdown 新 Tool；首条验收只以现有 PPTX Tool 为准；
- 新数据库 migration、通用规则引擎、第二套任务或 Tool 状态机；
- 为本批新建 96/120 项阶段账本、80 次泄漏矩阵或三轮 semantic replay。

## 4. G1：真实企业 Model 最小接线

### 4.1 拓扑

```text
Desktop Renderer
  -> frozen Preload / Main IPC
  -> Local Core Agent Loop
  -> DurableEnterpriseModelProvider
  -> HttpEnterpriseModelGatewayClient
  -> Central Model Gateway
  -> one OpenAI-compatible Provider endpoint
```

不得让 Renderer 直连 Central 或 Provider。Provider Key 只存在于 Central credential/configuration 边界，不进入 Desktop、
Task、日志、Evidence 或 Artifact。

### 4.2 受控内部试用身份

production SSO 不作为本批前置。本批允许一个显式 `internal_trial` deployment profile 提供：

- Central base URL；
- tenant/workspace/user 的固定试用 scope；
- 由既有 Token Provider 向 Core/Main 受控提供的、只含 `model.use` 的 Central access token；
- 一个固定 Model Definition/Binding/Adapter revision；
- 上下文窗口、Tool Calling、Streaming 等真实 capabilities。

该 Model 的管理来源固定为 `deployment/internal_trial`，不是 Admin-managed Model。它必须投影
`managedByAdmin=false`、`adminMutationReady=false` 或现有等价事实；Admin 最多在未来只读展示“部署配置 / 内部试用 /
不可在管理后台编辑”，本批不实现该页面。

限制：

1. Desktop 不得持有 Provider Key；
2. access token 不写 SQLite、Renderer state、URL、日志或 Evidence；
3. profile 只允许 development/internal-trial build；
4. production build 未配置真实 identity 时继续 fail-closed；
5. 若要给外部用户试用，必须另行补最小 production identity，不得把 internal-trial 宣称 production ready。
6. token 不得通过 Renderer、URL、命令行参数、Task payload、SQLite、Evidence 或 Artifact 传递；
7. 若现有 Token Provider 无法满足 Core/Main 受控消费、生命周期或清理要求，立即停手回评审，不新建 STRM、Keychain、
   Helper 或其他敏感传输体系。

### 4.3 Registry 与 Provider

同一个 Model exact ref 必须同时进入：

- `liveModels`；
- Agent resource registry snapshot；
- Workspace/authorization permission facts；
- Entitlement snapshot；
- Runtime Selection；
- Model Capability Lock；
- `RuntimeAdapterHandles`；
- durable Model Invocation Link。

禁止“Catalog 显示可用但 Provider 未注册”或“Provider 可调用但 Task lock 不是同一 revision”。

## 5. G2：Platform Prompt 与两类 Agent

### 5.1 Platform Prompt

本批在 `internal_trial` graph 启用现有 CPC instruction runtime，继续使用单一 System Message。不得创建第二条高权威消息，
不得把 Dynamic Facts、Agent、Skill 分开发成多个 System Message。

### 5.2 Agent

保留现有 `agent.general` 作为提交时的 code-owned 默认 Agent，但继续使用 Workbench 的“未选择专项机器人”作为唯一通用
机器人入口。Catalog 只新增一个 code-owned 专项 Agent，不再返回第二个可见的 `agent.general` 行：

```text
agentDefinitionId = agent.presentation
name = 演示文稿助手
managementClass = system_builtin
modelRestriction = 当前唯一企业 Model allowlist
skillRestriction = 演示文稿规划 Skill allowlist
toolRestriction = tool.document.pptx.write allowlist
knowledgeRestriction = unrestricted（本批实际选择为空）
```

专项 Agent 规则只约束演示文稿任务、内容结构、事实诚实性和 PPTX 输出；不得伪装用户可编辑 Agent Lifecycle。

若 Model capability 不支持 Tool Calling，或 Model capability、专项 Agent Tool allowlist、Workspace authorization 与 Tool
Registry exact ref 任一不一致，`agent.presentation` 必须投影为 typed unavailable，不得静默降级成纯文本 Agent。

### 5.3 真实行为差异证明

同一用户输入分别使用 `agent.general` 与 `agent.presentation` 时，必须证明：

- locked Agent ID/revision 不同；
- instruction bundle digest 不同；
- 专项 Agent 的 Skill/Tool 可选范围被收窄；
- Task 创建后不可静默切换 Agent 或 Model。

## 6. G3：最小本地 Skill Runtime

### 6.1 支持范围

只支持用户或部署配置明确授权的一个可信本地目录：

```text
<trusted-skill-root>/presentation-planning/SKILL.md
```

本批不安装 Skill、不执行 Skill 目录中的代码、不解析任意插件。`SKILL.md` 仅作为 advisory instruction body。

“演示文稿规划” `SKILL.md` 必须包含一个紧凑、合法、可复制的 `PresentationSpecV1` 示例，以及本批允许字段、页数和
元素约束。默认只使用 `robothree.default` 与受控文本、表格、图表、形状元素；不扩大远程图片链，不把完整 PPTX Schema
塞进 Tool Catalog，不在 Core 放宽 Document Worker 私有严格解析，也不建立自动修复框架。

### 6.2 稳定身份

- `skillId`：由受控目录清单或固定 manifest 提供，不从任意文件内容猜测；
- `revision/contentDigest`：对规范化后的 exact `SKILL.md` bytes 计算；
- `materializedRef`：Core-private，必须指向受信 root 内 realpath；
- Task 首次接受时锁定 exact ref；
- retry/restart 按 exact ref 重读并校验，不读取 current/latest fallback；
- 文件被修改或删除时，旧 Task typed unavailable，不静默使用新版本。
- Workbench 返回的 available Skill ref、用户提交的 selected ref 与 Task 锁定的 ref 必须同源且 `revision/contentDigest`
  完全一致，否则 typed unavailable；不得把另一目录的 `materializedRef` 绑定到用户所选 Skill。

### 6.3 前端语义

Workbench 只展示后端真实返回的一个可用 Skill。Skill 必须由用户显式勾选；用户清空后保持空集合，不默认恢复。
使用现有 SubmitTurn/Runtime Selection durable 事实验证后续提交不携带旧 Skill ref，不为此新增 `listTasks/getTask` 字段或
公共 Contract。

## 7. G4：Document Tool 与成果链

### 7.1 Tool Registry/Entitlement/Lock

把现有 Document Tool records 投影到 production registry，但本批专项 Agent 只允许
`tool.document.pptx.write`。Tool permission、risk、WorkspaceGrant 和 Task Capability Lock 继续复用现有实现。

`prepareToolLocks()` 必须为决策中的 exact Tool refs 构造真实 `TaskCapabilityLock`，不得继续用“非空即 unavailable”的
占位逻辑，也不得跳过 Authorization/Confirmation/Effect/Recovery。

Tool context ref、Agent 显式 Tool restriction、Model capability、Workspace authorization 和最终
`TaskCapabilityLock` 必须 exact 一致；任一冲突均 typed fail-closed。Core 不放宽 schema、不追加未授权 Tool，也不硬编码
Tool Call。

### 7.2 Model Tool Context

Model 请求必须包含锁定 Tool 的真实 name/description/input schema；Tool Call 必须由真实 Model response 产生。
测试不得预先写死 `tool.document.pptx.write` Call 来冒充模型调用。

### 7.3 Artifact

PPTX 成功 Observation 必须被现有 Artifact Projection 识别，并进入 Task Detail/Artifact Catalog。Renderer 不扫描文件系统，
不根据 Tool 文本自行推导 Artifact。

## 8. G5：Desktop 前端联合交付

### 8.1 客户端前端任务

1. Model/Agent/Skill 选择只消费真实 Projection；
2. 无真实 Model 时显示明确不可用，不使用 Mock/fixture fallback；
3. 两个 Agent 可切换，并正确清理不兼容的 Skill/Model；
4. Skill 只显式选择，清空后不恢复；
5. 提交后展示真实 Task 状态、Model 运行、Tool Call、Tool Result；
6. PPTX 出现在成果面板，可打开所在位置；
7. Core 重启时清除 ephemeral streaming delta 并展示“正在恢复”；建立新 `runtimeInstanceId` 后重载 durable Snapshot /
   Task Detail，丢弃旧 runtime 的迟到响应，不自动重复 `submitTurn`；最终 Task、Tool activity、Artifact 与 durable cursor
   收敛；
8. 错误只展示 typed safe summary，不暴露 token、Endpoint、digest、Schema path 或本机绝对路径。

### 8.2 Admin 前端任务

Admin 不进入本批运行关键路径。本批只需要：

- 把 deployment-configured Model 明确记录为 `deployment/internal_trial`、`managedByAdmin=false`；
- 保持普通入口 `UnavailableAdminAdapter` 的诚实边界；
- 不新增临时 Model CRUD、Mock success 或生产入口绕过；
- `productionIdentityReady=false`、`adminModelManagementReady=false`，不新增 Admin session/SSO/cookie/CSRF/RBAC；
- 不建立完整 handoff Schema；未来 Admin 接管时再通过独立 AAPI/AFE 方案处理。

## 9. G6：测试与验收收敛

### 9.1 必须测试

1. Model bootstrap/Registry/Entitlement/Lock exact integration；
2. CPC + general/presentation Agent + Skill single System Message；
3. Skill explicit-select/clear/stale revision；
4. PPTX Tool candidate/lock/context/call/observation/artifact integration；
5. normal Desktop 无配置时 fail-closed；
6. 一个确定性的 Central 协议/集成 fixture，进入日常 root `check`，覆盖组合逻辑、typed failure 与不可用路径；
7. 一个显式 opt-in 的 internal-trial live Provider Harness，只从受控运行环境读取 Secret，不作为普通 root `check` 隐式前置；
8. 一个真实 Electron vertical E2E；
9. E2E 中完成一次 Core restart/SQLite reopen 后 Task/Artifact 恢复；
10. 同一 task/correlation 串联 Central 请求、真实 Model response、真实 Tool Call、Worker Observation 与 Artifact；Evidence
    只记录 digest、安全摘要和状态，不记录 Prompt/Provider 原文；
11. focused lint/typecheck；
12. root `check` 与 Central online/offline 基线。

live Provider Harness 失败不得回退到 scripted Provider、预制 Tool Call 或 fixture success 后宣称通过。Central 基线失败也
不得用本批 Provider mock 覆盖；必须聚焦归因，只修当前真实链中有因果关系的问题。

### 9.2 不再默认要求

- 每个子接缝独立 96 项 QA；
- 所有历史 Harness 都复跑；
- 三轮 fresh-process semantic replay；
- 80 次编码泄漏负向矩阵；
- 七个以上 SIGKILL named barrier；
- 新 Stage Closure / Conformance Platform。

只有当本批修改 Secret transport、Keychain、Helper 或新的敏感持久化时，才恢复相应安全矩阵。本批企业 Provider Key 留在
Central 既有边界，Desktop 只新增最小 access-token consumption，因此只进行小规模、非笛卡尔积的定向泄漏测试：使用固定
假 Token、假 Endpoint 与假 Provider 原始输出，分别证明它们不出现在 parent stdout、child stderr、machine Evidence 与
typed safe error；正常真实 E2E 的对应通道命中为 0。Artifact 只检查其内容不被错误复制到日志/Evidence，不把用户产物本身
当作 Secret，也不恢复 64/80 次编码组合矩阵。

### 9.3 唯一关闭结果

通过后只允许：

```text
outcome = MVP_VERTICAL_SLICE_1_USABLE
internalTrialReady = true
publicProductionReady = false
productionIdentityReady = false
personalModelReady = false
adminModelManagementReady = false
tgmReady = false
knowledgeProviderReady = false
agentLifecycleReady = false
```

实施报告必须按 §2.2 的 DoD 1～8 逐项列出：`DoD 编号 → 运行级证据 → task/correlation → PASS/FAIL`。这是报告内的
证据索引，不新增八个机器布尔字段、不新增 Evidence Schema 或关闭框架。任何一项缺少真实证据，唯一 outcome 不得输出。

## 10. 分批顺序、并行与工期

### VS1.1：真实 Model 组合（2～3 日）

- Backend：deployment profile、Token Provider、Gateway Client、Provider/Runtime Handle、Model Registry/Entitlement/Lock；
- Desktop：Model availability/error Projection；
- Test：真实 Central/OpenAI-compatible 受控集成。

退出条件：普通 Desktop 能完成一次真实纯文本回复，重启后 Task/Conversation 存在，且相关确定性门禁与 Central
online/offline 基线没有被 mock 绕过。

### VS1.2：Agent / Skill / Tool（2～3 日）

- Backend：CPC、`agent.presentation`、Skill Resolver、Tool Registry/permission/lock/context；
- Desktop：Agent/Skill 真实选择和 Tool activity；
- Test：System Message、行为差异、Skill exact lock、真实 Model Tool Call。

退出条件：真实 Model 调用 PPTX Tool 并生成文件，payload 通过 Document Worker 私有严格解析；不得通过 Core 放宽校验、
scripted Provider 或硬编码 Tool Call 达成。

### VS1.3：成果与真实 Desktop E2E（2～3 日）

- Backend/Desktop：Artifact 接线、恢复错误与边界修正；
- Desktop：成果面板、打开位置、重启恢复体验；
- Test：真实 Electron → Central → Provider → Tool → Artifact → restart E2E。

退出条件：§2 八项全部通过。

合计 **6～9 个集中工程日**，不含外部 Provider/凭证审批等待和独立 QA 排队。三个步骤在同一开发批内连续推进，
中间不分别做用户关闭，不因为局部失败自动扩张为新 Foundation。

## 11. 角色交付与评审责任

| 角色 | 开发责任 | 本轮文档评审重点 |
| --- | --- | --- |
| 后端/Core/Central | Model graph、CPC、Agent、Skill、Tool lock、E2E fixture | 是否可复用现有 Provider/Gateway/Tool/Artifact，是否仍有隐藏 blocker |
| 客户端前端 | 真实 availability、选择、Task/Tool/Artifact/恢复体验 | 现有页面和 Adapter 是否足够，最小新增接口是什么 |
| Admin 前端 | 本批不编码，仅评审未来接管配置的兼容性 | deployment config 是否会造成未来 Admin 返工，哪些字段应记录但不实现 |
| 产品 | 冻结单一用户场景、专项 Agent 与 Skill exact 内容 | 八项 DoD 是否足以作为短期 P0，哪些原 P0 转入 P0.5/中期 |
| 测试/独立 QA | 联合验收设计、真实 E2E、边界与回归 | 测试是否证明真实 Model/Tool/Artifact，而非 fixture success |

## 12. 文件与变更边界

编码授权后优先允许：

- `services/core/src/bootstrap/**` 与必要 application/adapters/ports；
- `services/central-service/**` 中最小 internal-trial configuration/fixture；
- `apps/desktop/src/renderer/**`；只有当前真实消费者存在精确缺口时，才允许修改既有 Main/Preload 接线，不新增公共 API；
- 一个受信本地 Skill fixture/resource；
- focused tests、一个 vertical E2E、实施报告和 Evidence；
- 必要的 deployment example configuration（不含真实 Secret）。

默认禁止：

- `packages/contracts/src/**` 新版本；
- migration 27；
- 新依赖和 lockfile 变化；
- Personal Model、TGM、Knowledge、Agent Lifecycle 代码；
- `apps/admin-console/src/**` authored source 修改；Admin 只运行 AFE-6C/AAPI-0.4 既有回归，Adapter 仍为 12 个只读方法、
  mutation method count 仍为 0；
- 修改历史 Harness/Evidence 以适应当前演进；
- 把内部试用 Token、Provider Key 或真实 Endpoint 提交到仓库。

若现有 Contract 无法承载垂直闭环，必须先证明缺口确实被当前真实消费者触发，并只做最小 additive 修订；不得以“未来可能需要”
为理由新增版本。

## 13. 停手条件

出现以下任一情况立即停手回评审：

1. 需要把 Provider Key 放进 Desktop；
2. 需要 Renderer 直连 Central/Provider、读取文件系统或数据库；
3. 真实 Model binding 无法通过既有 Model lock 表达；
4. Tool 必须绕过现有 Authorization/Workspace/Effect/Recovery 才能运行；
5. Skill 需要执行第三方代码或越出受信 root；
6. 要新增第二套 Task、Tool 或 Artifact 状态机；
7. 要新增 migration、依赖或公共 Contract 版本，但没有当前真实消费者的精确证据；
8. 为了通过 E2E 使用 scripted Model、硬编码 Tool Call 或 Mock success；
9. internal-trial 身份被描述为 production identity；
10. 前端需要在本地推导 Agent/Model/Skill/Tool 可用性；
11. 生成的文件没有进入 durable Artifact Projection；
12. 测试计划再次扩张为与用户闭环无关的阶段 Closure 工程。
13. 既有 Token Provider 无法在不建设新敏感传输体系的情况下完成 Core/Main 受控消费；
14. `apps/admin-console/**`、Admin production identity、mutation 或 production Adapter 被要求进入本批。

## 14. 独立评审问题

### 客户端前端

1. 现有 Workbench、Task、Tool activity、Artifact 页面能否在不重做 UI 的情况下完成 §2？
2. 真实 Model/Agent/Skill availability 最少缺哪些字段或 Adapter 方法？
3. Agent 切换、Skill 清空、Core restart 是否还有阻塞性状态问题？

### Admin 前端

4. 固定 deployment Model 作为 internal trial 是否会破坏未来 Admin Model 管理语义？
5. 哪些未来管理字段应记录为 handoff，但明确不应进入本批？

### 产品

6. 是否接受 §2 为短期唯一 P0，并将 Personal Model/Admin/TGM/Knowledge/发布生命周期转入 P0.5/中期？
7. 是否接受首个专项 Agent 为 code-owned“演示文稿助手”、首个 Skill 为“演示文稿规划”？
8. 是否接受本批只以 PPTX 为成果闭环，不新增 HTML/Markdown Tool？

### 测试/独立 QA

9. §9 的测试规模是否足以证明真实链，而不退化为 fixture success？
10. internal-trial token、Endpoint、Provider 输出和 Artifact 的定向泄漏测试是否完整？
11. 一个真实 Electron E2E 加一次 Core restart 是否足以作为本批恢复验收？

### 所有评审者

12. 是否存在必须在本批解决的 P0/P1 blocker？
13. 是否同意计划评审通过后一次性授权 VS1.1～VS1.3 联合编码，不再逐接缝关闭？
14. 请明确输出 `PASS / PASS_WITH_REVISIONS / RED`、P0～P3、必须修改章节和是否建议编码。

## 15. 当前门禁

本方案已完成联合评审并获得 VS1.1～VS1.3 一次性联合编码授权。VS1.1 前后端子项均已独立 QA 并由用户接受；
VS1.2 已完成 CPC、`agent.presentation`、可信本地 Skill、PPTX Tool exact lock 与模型 Tool Call 的开发者验证；
当前直接进入 VS1.3，不再逐接缝重新规划、评审或关闭。联合编码期间继续强制：

- 只创建 §3.1 当前真实客户端消费者要求的 Model/Skill/Agent/Tool 最小接线；
- internal-trial profile 只服务受控 MVP 试用，不升级为公开 production identity；
- 不修改 Contract、依赖、migration 或 lockfile；
- 不恢复 DFI-4A.4.2 repair.1 / DFI-4A.4.3；
- 不自动解锁 Admin、TGM、Knowledge、Agent Lifecycle 或其他下游。
