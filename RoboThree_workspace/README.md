# RoboThree

RoboThree 产品工程 Monorepo。

RoboThree 的当前定位是：

> 一个本地优先、企业统一治理、支持 MaaS、MCP、Skill、Knowledge 和可扩展 Tool 的通用 Agent 工作台与运行平台。

本目录用于承载 RoboThree 的正式产品文档、架构决策、协议和后续实现。开源 Agent 的源码镜像、分析报告和跨项目研究位于相邻的 `robothree-agent-research/`，研究结论经过评审后才进入本产品工程。

## 当前阶段

产品 Revision 2 的后端增量已按
[R2D-0 Product Revision 2 Core Delta 详细实施总方案](./docs/development/R2D-0-PRODUCT-REVISION-2-CORE-DELTA-DEVELOPMENT-PLAN.md)：
把 Dynamic Request Facts、四类 Agent 资源限制、首次 `SubmitTurn` 原子锁定、Runtime Selection v1alpha3 与
code-owned `agent.general` 拆成 R2D-1～R2D-4 四个串行子批。R2D-3 Revision 1 复用现有 durable
coordination，将 `task_committed` 冻结为 Provider 前 barrier，不再新建跨 Repository 聚合事务；R2D-3
修正为 6～10 日、R2D-4 为 1～2 日，R2D 总估算修正为 13～22 个集中工程日。R2D-0 计划评审已
`PASS/CLOSED`；`0.0.0-r2d.1` 已完成 Core-controlled Dynamic Request Facts、唯一 request-scoped System
Message、Context Receipt evidence 与 main/compaction/Local Personal durable link exact recovery。专项 10 files /
93 tests、非沙箱 root check 268 files / 1818 tests + 3 smoke、packaging audit 与 frozen install 全绿；独立 QA
已补跑 Central 并由用户正式接受，R2D-1 当前 `PASS/CLOSED`。新增
[R2D-2 Agent Definition v1alpha2 与四类资源限制 Contract 详细实施方案](./docs/development/R2D-2-AGENT-RESOURCE-RESTRICTION-CONTRACT-DEVELOPMENT-PLAN.md)，
冻结 private subpath、四类 `unrestricted | allowlist`、portable exact refs、独立 v2 digest、v1 compatibility
interpreter 与 84 项 QA。`0.0.0-r2d.2` 已完成实现：v1 Skill/Knowledge 显式投影移除 `materializedRef`、
exact built subpath 真实可导入、production consumer count=0；`harness:r2d2` 7 files / 72 tests、root check
271 files / 1846 tests + 3 smoke、Central online/offline 404/404 与全部边界门禁通过；独立 QA 已由用户
正式接受，R2D-2 当前为 `PASS/CLOSED`。新增
[R2D-3 Runtime Selection / Entitlement / Atomic Acceptance 详细方案](./docs/development/R2D-3-RUNTIME-SELECTION-ENTITLEMENT-ATOMIC-ACCEPTANCE-DEVELOPMENT-PLAN.md)，
冻结可信 entitlement snapshot、单一 Planner、Runtime Selection v1alpha3、coordination v1alpha4、code-owned
`agent.general` 与首次 SubmitTurn durable acceptance；Revision 1 计划评审已 `PASS/CLOSED`。
`0.0.0-r2d.3.1` 已完成 content-free Entitlement Snapshot / Agent Resource Decision strict schemas、独立 digest
domains、Runtime Selection v1alpha3 与 coordination v1alpha4 exact private subpaths、single-dispatch helpers 及
legacy zero-drift conformance；`harness:r2d3.1` 8 files / 91 tests、root check 275 files / 1897 tests + 3 smoke、
Central online/offline 404/404、packaging audit 与 frozen offline install 全绿。production consumer / Entitlement
Source / R2D route 均保持 0/false；独立 QA 已通过并由用户正式接受，R2D-3.1 当前为 `PASS/CLOSED`。新增
[R2D-3.2 `agent.general` Exact Material 编码前置聚焦确认](./docs/development/R2D-3.2-AGENT-GENERAL-EXACT-MATERIAL-PREFLIGHT-CONFIRMATION.md)，
以产品 Core Prompt Revision 2 为唯一来源冻结 `agent.general` 的 stable ID、v1alpha2 schema、
`system_builtin`、中文 name/identity/goal/instructions、四类 unrestricted、固定 release epoch 与预计算 digest；
当前为 `FOCUSED CONFIRMATION PENDING / CODING GATED`，未修改生产代码。R2D-3.2～R2D-4 继续 GATED。migration
仍止 26，production CPC
activation 与 enterprise entitlement 继续 false。Desktop Workbench 的 Skill/Knowledge/Model
空集合与 Agent 切换 P1 Repair 由前端独立窗口处理，不纳入 R2D 文档批。DFI-5.3、AAPI-0.3～0.4、TGM、
Knowledge Provider、Memory、Effect Reconciliation、Agent lifecycle 与 Desktop/Admin v2 consumption
继续 `GATED`。

DFI-5.0 Max Reasoning Mode 详细实施方案已通过独立文档复核并由用户接受，计划评审正式
`PASS/CLOSED`。`0.0.0-dfi.5.1` 已完成 safe Preview / Projection、独立 Experience Preference、
migration 26 三张 STRICT 表、owner 独立 HMAC namespace、CAS 与 durable Receipt；Preview 只投影
`supported | unsupported | unknown`、exact support revision、安全原因及 `default | max` 偏好，不暴露
Provider raw mapping、thinking budget、owner digest 或 Credential。DFI-5.1 focused + migration regression
`8 files / 36 tests`、build、lint 与 Architecture boundary 已通过；完整 root check 最终从零复跑
`251 files / 1678 tests + 3 smoke PASS`；独立 QA 已补跑 Central online/offline `404/404 PASS`，P0～P3
全 0，并由用户正式接受关闭。细节见
[DFI-5.1 实施报告](./docs/development/frontend/DFI-5.1-REASONING-EXPERIENCE-FOUNDATION-IMPLEMENTATION-REPORT.md)。
DFI-5.1 当前为 `PASS/CLOSED`。新增
[DFI-5.2 Task Reasoning Lock 详细方案](./docs/development/frontend/DFI-5.2-TASK-REASONING-LOCK-DEVELOPMENT-PLAN.md)，
冻结 SubmitTurn v1alpha3、ReasoningModeLock、TaskRuntimeSelection/ModelRequest/Compaction Binding v1alpha2、
coordination v1alpha3 与全生命周期恢复；Revision 1 计划评审已 `PASS/CLOSED`。`0.0.0-dfi.5.2.1` 已完成
ReasoningModeLock、TaskRuntimeSelection v1alpha2、Desktop SubmitTurn v1alpha3 与 coordination v1alpha3
canonical Contract / private subpath / conformance；完整 root check `254 files / 1699 tests + 3 smoke PASS`，
Central online/offline `404/404 PASS`，独立 QA P0～P3 全 0，并由用户正式接受为 `PASS/CLOSED`。新增
[DFI-5.2.2 Planner / Stale CAS / Task Bundle 详细方案](./docs/development/frontend/DFI-5.2.2-REASONING-PLANNER-TASK-BUNDLE-DEVELOPMENT-PLAN.md)，
冻结单一 Planner、提交瞬间 stale 真值表、task-locked Profile subject、TaskRuntimeSelection v1alpha2
原子物化、InMemory/SQLite readable union 与 S1～S7/C1～C7 恢复并发边界；计划评审已
`PASS/CLOSED`。`0.0.0-dfi.5.2.2` 已完成单一 Planner、default 零 Profile load、max 单次 strict load、
stale/unavailable 零 durable 副作用、reasoning-aware Task bundle 原子提交以及 accepted-plan exact
recovery。focused 回归 `12 files / 100 tests`、完整 root check `255 files / 1710 tests + 3 smoke`、
Central online/offline `404/404`、frozen offline install、lint、Architecture boundary 与 `audit:dtp4` 全绿；
独立 QA P0～P3 全 0，用户已正式接受，DFI-5.2.2 当前为 `PASS/CLOSED`。新增
[DFI-5.2.3 ModelRequest / Compaction Binding v1alpha2 与 Lifecycle Harness 详细方案](./docs/development/frontend/DFI-5.2.3-MODEL-REQUEST-COMPACTION-LIFECYCLE-DEVELOPMENT-PLAN.md)，
冻结 private ModelRequest v1alpha2、request/Context receipt 原子 finalizer、单一 reasoning materializer、
Compaction Binding v1alpha2、production Provider 零上游请求失败关闭与真实 Core child/SQLite reopen 生命周期
Harness；计划评审已 `PASS/CLOSED`。`0.0.0-dfi.5.2.3` 已完成 Core-private ModelRequest v1alpha2、
request/Context receipt 原子 finalizer、main/Tool/continuation/Compaction 共用 reasoning materializer、
Compaction Binding v1alpha2、readable executable bundle、Provider 零上游副作用 typed fail-closed，以及真实
Core child + SQLite reopen + SIGKILL 生命周期 Harness。Focused `11 files / 111 tests`、完整 root check
`258 files / 1723 tests + 3 smoke`、Central online/offline `404/404`、lint 与 Architecture boundary 已通过；
独立 QA P0～P3 全 0，用户已正式接受，DFI-5.2.3 与 DFI-5.2 阶段整体均为 `PASS/CLOSED`。新增
[DFI-5.3 Provider Mapping 详细方案](./docs/development/frontend/DFI-5.3-PROVIDER-MAPPING-DEVELOPMENT-PLAN.md)，
冻结 safe control plane 与 Provider-private mapping plane、Strategy digest 对 exact raw mapping 的不可逆承诺、
Enterprise Gateway v1alpha3、Enterprise OpenAI-compatible / Anthropic-compatible / Local Personal 三类 typed
映射、body-level 参数省略、原 Task lock 与 durable deadline 复用以及真实受控 HTTP/TLS Provider fixture；
计划评审已 `PASS/CLOSED`，编码仍 `GATED`。正常顺序为 CPC-1～CPC-3 整体关闭、AAPI-0.3～0.4 完成或用户明确
调整优先级后，再单独授权 DFI-5.3.1。production SubmitTurn v1alpha3 与 Desktop Max UI 仍不可达；
DFI-5.4、AAPI-0.3～0.4、TGM、Knowledge Provider 继续 `GATED`。Core Prompt/Context Feature Spec Revision 1
保持独立技术修订线，不并入 DFI-5.3。

Core Prompt/Context 产品语义已形成
[CPC-0 Core Prompt / Context Assembly 详细实施总方案 Revision 1.1](./docs/development/CPC-0-CORE-PROMPT-CONTEXT-ASSEMBLY-DEVELOPMENT-PLAN.md)：
复用现有 TaskRuntimeSelection、SubmitTurn bundle、Context Pipeline、ModelRequest 与 Agent Loop，冻结
Platform/Task Boundary/Agent/Skill 四层 source、确定性 Binding 派生、单一 canonical System Message、预算/Receipt/
restart 一致性，以及 Skill/Reference/Dynamic 的可插拔扩展接缝；收敛为 CPC-1～CPC-3、60 项 QA、10～16 个集中
工程日，不新增 migration、不改 Provider-private DFI-5 mapping。Revision 1.1 聚焦差异复核已由用户接受，CPC-0
计划评审正式 `PASS/CLOSED`。`0.0.0-cpc.1` 已实现 immutable Platform Prompt、确定性
TaskInstructionBinding、safe Task Boundary、exact Agent/Skill 接缝、单一 canonical System Message compiler 与预算
预检；focused 4 files / 51 tests、完整 root check 260 files / 1751 tests + 3 smoke、Central online/offline
404/404 与全部边界门禁已通过；独立 QA P0～P2 全 0、P3=2 均非阻断，并已由用户正式接受，CPC-1 当前为
`PASS/CLOSED`。新增
[CPC-2 Runtime Integration 详细实施方案](./docs/development/CPC-2-RUNTIME-INTEGRATION-DEVELOPMENT-PLAN.md)，
冻结 legacy/CPC durable mode、单次 typed runtime materialization、Context Pipeline bundle 专用输入、Receipt/
provenance、Agent Loop/Tool/Compaction/restart 复用与 Provider body-level 回归；独立文档复核为
`PASS（P0=0、P1=0、P2=0、P3=2，均非阻断）`，用户已正式接受并授权编码。`0.0.0-cpc.2` 已完成 exact
legacy/CPC/unknown runtime decision、CPC-1 单次 typed parse 收口、locked bundle Context 接线、content-free
Receipt/provenance 与 terminal replay 后/Provider 前的 Agent Loop 单次物化；production 继续默认 disabled，带 Skill
Task 在无 production resolver 时 typed fail。Focused `8 files / 73 tests`、非沙箱 root check
`262 files / 1771 tests + 3 smoke`、frozen offline install 与 `audit:dtp4` 已通过；独立 QA 使用 JDK 21 补跑
Central online/offline，均 404/404 PASS。用户已正式接受，CPC-2 当前为 `PASS/CLOSED`。新增
[CPC-3 Lifecycle / Eval Closure 详细方案](./docs/development/CPC-3-LIFECYCLE-EVAL-CLOSURE-DEVELOPMENT-PLAN.md)，
冻结真实 Core child/SQLite reopen、50-round Tool/Compaction、三轮 semantic replay、conflict/injection corpus、
泄漏扫描和资源归零；计划评审已 `PASS/CLOSED`，`0.0.0-cpc.3` 已实现并通过开发者门禁：
focused 9 files / 68 tests、非沙箱 root check 266 files / 1794 tests + 3 smoke、Central online/offline
404/404、frozen offline install 全绿。独立 QA 发现真实进程 fixture 的 bundle digest 来源与 production
不一致；`0.0.0-cpc.3-repair.1` 已改为 exact `bundle.binding.bundleDigest`，packaging audit、完整 root check
266 files / 1794 tests + 3 smoke 与 frozen offline install 均已复跑通过；独立 re-QA P0～P3 全 0且已由用户
正式接受。repair.1、CPC-3 与 CPC 全线均为 `PASS/CLOSED`，production activation 继续 disabled。
Knowledge Provider、Memory、Effect Reconciliation、Desktop/Admin、TGM 未解锁。详见
[CPC-1 实施报告](./docs/development/CPC-1-INSTRUCTION-FOUNDATION-IMPLEMENTATION-REPORT.md) 与
[CPC-2 实施报告](./docs/development/CPC-2-RUNTIME-INTEGRATION-IMPLEMENTATION-REPORT.md)。

Desktop `0.0.0-dfe.7a` 的 v1alpha2 Robot / Tool Catalog Renderer 消费已由用户单独接受并正式
`PASS/CLOSED`；原 Core drift 已作为独立 CPC-2 批次完成授权与 QA，不再污染 DFE-7A。Skill Catalog、Tool 管理、
Agent/Skill 创建与发布仍未解锁。

PTX-0 PPTX Write Contract / Dependency / Resource Freeze 已 `PASS/CLOSED`；`0.0.0-ptx.1` 完成
PTX-1 Private ResourceResolver + PPTX Writer。当前 `0.0.0-ptx.2` 已完成 PTX-2 Tool Activation：
Core Registry 正式新增 `tool.document.pptx.write`，模型可见 schema 只暴露 workspace-relative target 与
`PresentationSpecV1`，Core 负责 WorkspaceGrant create 授权、`routine_file` 风险事实、私有 `v1alpha2`
requestDigest、Artifact projection 和 unsupported text preview。PTX-2 repair 已将 PPTX 模型可见 schema
收敛为 compact schema，并关闭既有 Document Tool E2E 的 `context.current_turn_too_large` 回归；完整
root check 现为 251 files / 1678 tests + 3 smoke PASS。PTX-2 已通过独立 QA 复测并由用户接受，
正式 `PASS/CLOSED`。`0.0.0-ptx.3` 已实现并通过 PTX-3 Desktop Product E2E 独立 QA：Desktop scripted
model 可触发真实 `tool.document.pptx.write`，链路覆盖 submitTurn、AgentBridge、Core Registry、Document
Worker、PPTX 文件生成、Artifact projection 与 assistant final。当前 `0.0.0-ptx.4` 已实现 PTX-4 PPTX
Visual Preview：Desktop Main 以 bounded OOXML parser 生成 sandboxed local HTML/SVG slide preview，Task
Detail 将 PPTX artifact 路由到视觉预览；该预览为安全基线预览，不声明 PowerPoint 像素级渲染。PTX-4
独立 QA 已在非沙箱环境复跑通过，跨窗口 `audit:dtp4` Core 版本基线已同步到 DFI-5.2.2 当前真实版本；
用户已正式接受并关闭 PTX-4，PTX-0～PTX-4 当前为 `PASS/CLOSED`。

Admin Console 前端 AFE-1.1 已完成正式 Scaffold / Route Shell 编码：新增独立
`apps/admin-console/**` Vue 2.7.16 package，建立六项一级导航、系统管理三个二级路由、权限壳、状态矩阵、
Design Token 基线、Unavailable 默认 Adapter、正负向 SFC typecheck、package-local tests、static/deps scan
与 dev startup smoke。独立 QA 已通过并由用户接受，AFE-1.1 正式 `PASS/CLOSED`；未接真实登录、Admin API、
Contract、Central/Core、Credential、TGM 或 Knowledge Provider。`apps/admin-console-preflight/**` 已按授权清理，
lockfile 已标准重算并完成 frozen install。Desktop Vue 3 与 Admin Vue 2 隔离已验证，root check
240 files / 1603 tests + 3 smoke 通过。当前 `0.0.0-afe.3a` 已完成 AFE-3A Tool pages foundation：
工具管理页、Tool 详情、连接 API 壳、连接 MCP 壳和策略壳均已落地为 Prototype/GATED 页面；所有真实创建、
保存、验证、启停和策略操作仍禁用，Admin package gates、Desktop 回归与 root check
255 files / 1710 tests + 3 smoke 已通过。Claude Code 最终独立 QA 为 PASS（P0～P3 全 0），用户已接受并关闭
AFE-3A；AFE-3B/AFE-3C、
AAPI-0.3～0.4、AdminAdapter/AFE consumption、TGM、Knowledge Provider 与 production identity 继续 `GATED`。

DFI-3A Robot / Tool Catalog Revision 1 与跨消费面对齐基线 v1 已通过文档评审；
`0.0.0-dfi.3a.1` 已完成 Desktop Local `v1alpha2` additive Robot/Tool Catalog Contract、Local Core
只读 Projection / Query、HMAC opaque cursor、完整 Registry/revision 失败关闭，以及 Robot/Tool identity、
exact revision、限制三态、readOnly/risk 的 cross-consumer canonical fixture。开发者专项 5 files / 35 tests、
Workspace 242 files / 1613 tests + 3 smoke、Central online/offline 391/391 全绿；当前为
`PASS/CLOSED`。用户已确认 cross-consumer alignment v1 并授权 AAPI-0.1；`0.0.0-aapi.0.1` 已完成
`admin-control.v1alpha1` TS-only Contract package：strict envelope、safe error、opaque cursor、CAS/Receipt
shape、Capability/Model/Robot/Skill/Tool/Knowledge/System Projection schema、Admin-side Robot/Tool
cross-consumer fixture 与 `@robothree/contracts/admin-control/v1alpha1` export。开发者 focused 3 files /
16 tests、contracts build、frozen install、lint 与 Architecture boundary 已通过；当前为
`PASS/CLOSED`。独立 QA 最终结论 PASS（P0=0、P1=0、P2=0、P3=1；P3 为 subpath export 自动测试覆盖提醒，
已在 AAPI-0.2 中补自动断言）并由用户接受关闭。本批未建 Central Java mirror、HTTP runtime、AdminAdapter 或业务页面。
`0.0.0-aapi.0.2` 已完成 Test-only Admin Principal / Capability Projection：新增 Central-private
Admin Control domain/application/configuration，development/test profile 固定 test-only 管理员 Principal，
服务端 Capability Projection 强制 `testIdentityUsed=true` / `productionIdentityReady=false`，production
graph 不装配 test-only provider 且出现 Admin principal provider 时在 HTTP ready 前失败关闭；同时补充
`@robothree/contracts/admin-control/v1alpha1` subpath export 自动测试。开发者 focused 为 contracts
1 file / 7 tests、Central 3 classes / 13 tests，Central online/offline 各 404 tests PASS，root check
243 files / 1620 tests + 3 smoke PASS；独立 QA 已通过并由用户接受，当前为 `PASS/CLOSED`。
本批未接 HTTP runtime、AdminAdapter、真实 RBAC、production identity、Admin 前端、Desktop、Core、Main、
Preload、IPC、migration 或 lockfile。`0.0.0-dfi.3a.2` 已完成 Main / Preload Catalog 接线与阶段收口：
新增 `robot_tool_catalog` feature、四条 Core private Catalog route、四个 Main IPC channel、四个
sandboxed Preload API、runtime connection lease、caller binding 与 process E2E。开发者门禁为
DFI-3A.2 harness 6 files / 28 tests PASS，Desktop tests 58 / 233 PASS，root check 244 / 1630 tests
+ 3 smoke PASS，Central online/offline 各 404 tests PASS，lockfile digest 保持不变；当前为
`PASS/CLOSED`，DFI-3A 阶段整体 `PASS/CLOSED`。独立 QA 为 PASS（P0=0、P1=0、P2=0、P3=1，不阻断）
并已由用户接受。AAPI-0.3～0.4、Renderer/AFE 消费、
AdminAdapter、TGM、Knowledge Provider、production identity 与 Max/DFI-5 继续 `GATED`。

Desktop Frontend Experience 已进入工程化迁移：DFE-0（Frontend Living Spec 与页面/API/Mock/Legacy
边界冻结）已 `PASS/CLOSED`；DFE-1A 已完成 SFC、hash router、Design Token、基础组件、
Legacy Wrapper 和目录级 Renderer 安全扫描，并经独立 QA 与用户接受正式 `PASS/CLOSED`。
`0.0.0-dfe.1b` 已完成 Desktop Shell、五个一级导航、真实 `.vue` mount 组件测试路径、
Legacy workbench `/workbench` 接入和通用状态 skeleton，当前
已经独立 QA 与用户接受正式 `PASS/CLOSED`。`0.0.0-dfe.2a` 已完成新工作台与任务创建体验；
授权模式误导性选择器的 P2 repair 2 已通过独立复核并由用户接受，DFE-2A 正式
`PASS/CLOSED`。智能授权最终真实语义已由专项 Feature Spec 冻结，跨 Contract/Core/Desktop
接入仍需单独授权。`0.0.0-dfe.2b` 已实现任务列表与任务管理：`#/tasks` 接入真实
Session/Task 高层 API，提供搜索、状态筛选、固定排序、打开、重命名、停止、删除和本次视图置顶；
独立 QA 已通过并由用户授权进入下一批，DFE-2B 正式 `PASS/CLOSED`。`0.0.0-dfe.3a`
已实现任务详情与持续交互：`#/tasks` 增加任务详情区，展示持久对话、流式回复、状态指导、
步骤、工具活动、用户确认卡片，并复用现有 Task Control 高层 API 完成停止、重试、继续、补充输入和确认决策；
初轮独立 QA 发现未授权 DFI workspace-browser Contract/Core 代码混入并阻断关闭；该 DFI 代码与测试已隔离，
修复后完整门禁回到 `176 files / 1203 tests PASS + 3 smoke`；独立 QA retest 已通过并由用户接受，
DFE-3A 正式 `PASS/CLOSED`。`0.0.0-dfe.3b` 已实现任务详情右侧面板：提供“概览 / 工作空间文件”
固定视图、成果活动标签、Text/Markdown 安全预览、既有 HTML sandbox 预览、打开本地文件夹、
导出、固定/隐藏、软件内全屏和收起/展开。成果与预览使用现有真实 Artifact API；DFE-3B 阶段工作空间文件树仍为固定占位，
后续 `0.0.0-dfe.6a` 已消费 DFI-1B sidecar 替换该占位。DFE-3B 已通过独立 QA 并由用户授权进入
下一批，正式 `PASS/CLOSED`。`0.0.0-dfe.4a` 已实现智能中心浏览与详情：`#/intelligence`
接入机器人、技能和工具三类列表，新增三类详情路由，数据层仅复用既有 `listAgents` / `listModels`
高层 API，技能和工具继续使用明确 Mock inventory 等待真实 Catalog Projection。机器人卡片不显示状态标签，
技能不显示旧分类标签，工具风险与生命周期使用中性标签；DFE-4A 已通过独立 QA 并由用户接受，正式
`PASS/CLOSED`。`0.0.0-dfe.4b` 已实现智能中心创建机器人与创建技能前端模块：新增
`#/intelligence/create-robot` 和 `#/intelligence/create-skill`，机器人创建支持默认/预设/上传头像、
基础字段和四类能力开关，技能创建支持三字段表单、字段校验、创建对话本地预览和失败重试状态。
真实保存、测试、发布、目录写入、Agent/Skill Feature Spec 语义和 Catalog Projection 继续
`GATED`；DFE-4B 已通过独立 QA 复测并由用户正式接受关闭；DFE-5～DFE-6 与 DFI-2/3/4 编码批次继续
`GATED`。DFE-5.0 docs-only 已冻结设置、模型管理、知识中心和 P1 设置骨架的安全边界，并新增
`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` 已修订至 Revision 3，除企业/个人模型来源、Provider 模型标识与显示名称、个人模型无测试连接、
网络失败真实重试、企业模型为空时的个人模型显式选择、用户默认模型与机器人临时有效模型、删除和个人 Key 查看外，新增全局 `Max` 增强偏好：关闭不发送额外推理参数，开启时优先使用已验证的最强模式，不能安全启用时按默认模式继续且不阻断核心任务；优先复用既有偏好、任务选择与模型锁能力。Mock 阶段严禁接收真实 API Key；真实 Credential
存储/使用必须等待 ADR-013 对应接缝和独立 DFI 批次，保存后查看还需 ADR-013 反向敏感通道增补；应用不建设
系统截图检测。`0.0.0-dfe.5a.1` 已实现设置模型管理基础体验：`#/settings` 重定向到
`#/settings/models`，页面通过现有 `listModels` Projection 展示只读模型列表，将 `official`
明确标为平台基线模型；个人模型管理区域保持“待接入”，不接收 API Key，不伪造保存、删除、设为默认或测试连接成功。
用户已正式接受并关闭 DFE-5A.1。`0.0.0-dfe.5b.1` 已实现知识中心基础体验：`#/knowledge`
从 skeleton 切换为真实前端页面，并新增 `#/knowledge/:knowledgeId` 详情路由；生产默认使用
`GatedKnowledgeAdapter`，只展示企业知识能力尚未配置/真实检索待接入，不展示 Fixture 知识源、
搜索框、详情入口或示例结果卡片。Fixture 知识源仅用于显式测试/开发注入，持续标注
`prototype/gated`；本批不接真实 Knowledge Provider、Contract、IPC、Core/Central 状态、存储或依赖。
独立 QA focused、build、lint、audit 与完整 Workspace 门禁均通过，P0～P3=0；用户已正式接受并关闭
DFE-5B.1。真实个人模型 Credential、默认模型持久化、Key 查看、后端状态和真实 Knowledge 检索仍需独立 DFI
批次。DFI-4A 个人模型与 Credential Foundation Revision 1 已确认；DFI-4A.0 初版独立 QA 发现
`P1=2 / P2=2 / P3=1`；repair.1 已通过开发者串行门禁、Claude Code 独立 QA 与 Central online/offline
补跑，用户已正式接受，DFI-4A.0-repair.1 与 DFI-4A.0 正式 `PASS/CLOSED`。权限与 owner authority 复用 Runtime Active 企业事实和既有离线状态 2/3，不新增离线租约
或失联阈值；所有者查看个人 Key 已是产品决策，ADR-013 Addendum 只冻结安全实现。repair.1 已用临时
macOS Keychain 验证 store/resolve/replace/delete、lock/unlock、`access_denied`、受控 `corrupted`、
broker `cancelled`、mutation 前后异常退出恢复、modern `SecItem*` 隔离生命周期和普通生命周期，并用
真实 `node:https` 证明 Endpoint/DNS pinning、TLS SNI/Host、证书校验和 remoteAddress 复核；多编码泄漏扫描为 0。
同时撤回初版过度结论：当前生产 `CorePrivateSupervisor` 的 `json` IPC 不能保留敏感 Buffer，
DFI-4A.2+ 真实 Credential 路径必须选择独立敏感通道或显式改造 supervisor serialization。ADR-013
Addendum A 已由用户正式 `ACCEPTED`，并作为 DFI-4A.2.3 owner reveal 的安全实现依据。并发窗口生成的
旧 DFI-4A.1 方案已隔离，不属于已授权交付；DFI-4A.1 Revision 3.3 已完成范围内实现：Desktop Local
`v1alpha2` additive safe Contract、个人模型 Domain、owner namespace、七表 migration 23、不可变配置历史、
current head、append-only status history、Operation Journal、durable Receipt、opaque Credential Reference、
Credential `inspect()` strict discriminated union、Endpoint canonicalization、聚合式 InMemory/SQLite
Persistence 与 Fake Credential Store/Runtime Registry representation 均已落地。开发者门禁与独立 QA
已通过并由用户正式接受，DFI-4A.1 已 `PASS/CLOSED`；真实 Keychain、Provider、Desktop CRUD、
Task lock 与 Agent Loop 继续逐批门禁。DFI-4A.2 Credential Broker / Keychain / CRUD 详细计划已经复核
并确认：保留既有 JSON lifecycle IPC，敏感通道使用 fd4/fd5 双匿名 binary pipe，拆分 4A.2.1～2.3
独立门禁；`0.0.0-dfi.4a.2.1` 已完成 fd4/fd5 敏感二进制通道、one-shot macOS Keychain
Adapter、helper 信任校验与生产失败关闭，开发者门禁和独立 QA 均通过并由用户正式接受，现已
`PASS/CLOSED`。`0.0.0-dfi.4a.2.2` 已实现 CRUD Coordinator / Durable Recovery Foundation：safe prepare
与敏感 execute 分轨，Operation Journal、Keychain observation CAS、aggregate Transaction B、SQLite reopen、
manual attention 和 conservative cleanup 已接通；独立 QA 已通过并由用户接受，DFI-4A.2.2 正式
`PASS/CLOSED`。`0.0.0-dfi.4a.2.3` 已实现 owner-only Reveal Foundation、一次性 command tombstone、
有界并发/频率/deadline、Main 私有单一 consumer、全链路 Buffer cleanup 与真实子进程/SQLite/Keychain
Closure Harness；开发者门禁为 **6 files / 31 tests**、Workspace **217 files / 1444 tests + 3 smoke**、
Central online/offline **302/0/0/0**；独立 QA 复跑为 **6 files / 53 tests**，P0～P3 均为 0，
用户已正式接受并关闭 DFI-4A.2.3 与 DFI-4A.2 整体。DFI-4A.3 计划评审已经正式关闭；
`0.0.0-dfi.4a.3.1` 已实现 Core-private OpenAI-compatible HTTPS/SSE Provider、版本化 Provider Profile、
local personal invocation/Usage Foundation 与 forward-only migration 24，开发者门禁为 Harness
**6 files / 30 tests**、Workspace **220 files / 1458 tests + 3 smoke**、Central online/offline
**302/0/0/0**；Claude Code 独立复跑为 Harness **6 files / 48 tests**、Workspace
**220 files / 1458 tests + 3 smoke**、Central online/offline **302/0/0/0**，P0～P3 均为 0；用户已
正式接受并关闭 DFI-4A.3.1。后续真实 Provider 验证发现部分 OpenAI-compatible 服务在内容帧返回
`usage: null`；`0.0.0-dfi.4a.3.1-repair.1` 已修正 SSE Usage 投影，使 `null` 与字段缺失都表示“本帧无
Usage”，同时保持非空非法 Usage 失败关闭、最终真实 Usage 正常投影且不伪造 0。MiniMax 缺少 `[DONE]`
属于独立终止兼容问题，本修复未放宽 canonical terminal 规则。`0.0.0-dfi.4a.3.1-repair.2` 已完成
Provider Timeout Repair：30 秒 connect、90 秒 first progress、300 秒 stream idle 与 15 分钟默认
overall 由唯一版本化 Policy 驱动；migration 25 保存 exact Invocation Timeout Fact，重启不延长 deadline，
本地 timeout 不再被 late `ECONNRESET` 误报成 network failure。专项 **8 files / 53 tests**、Workspace
**245 files / 1643 tests + 3 smoke**、Central online/offline **404/404** 全绿；独立 QA 在共享工作区
复跑为 **247 files / 1652 tests + 3 smoke**，P0=0、P1=0、P2=0、P3=1，用户已正式接受，当前为
`PASS/CLOSED`。P3 `ELECTRON_RUN_AS_NODE` 环境限制不阻断关闭。`0.0.0-dfi.4a.3.2` 已实现企业/个人统一候选与确定性选模、
personal `model.*` 校验、unknown context window 失败关闭、标准 `TaskCapabilityLock` 物化、
Task bundle 共享 `registryRevision`、authenticated `pmcfg1` configuration ref、lock-bound
Composite Provider Resolver 及 Task-backed deletion/Credential usage guard。开发者 Harness
**6 files / 69 tests**、Workspace **223 files / 1475 tests + 3 smoke**、Central online/offline
**302/0/0/0** 全绿；Claude Code 独立复跑同样全绿、P0～P3=0，用户已正式接受并关闭 DFI-4A.3.2。
`0.0.0-dfi.4a.3.3` 已实现 Agent Loop / Compaction / Recovery 闭环：新增统一异步 Task-locked
Provider Resolver、personal execution authority、migration 24 durable wrapper、replay-first 与有界
startup recovery classification；main 和 initial/rolling compaction 复用同一 exact lock，不建立第二套
Loop 或 Summary。I1～I5 已通过真实子进程 `SIGKILL` + SQLite reopen 专项验证，50-round Tool Loop
继续覆盖首次与滚动压缩；开发者专项 **16 files / 88 tests**、Workspace **226 files / 1496 tests + 3 smoke**、
Central online/offline **302/0/0/0** 均已串行通过；Claude Code 独立复跑 Harness **8 files / 46 tests**、
Workspace **226 files / 1496 tests + 3 smoke**、Central online/offline **302/0/0/0** 全绿，P0～P3=0。
用户已正式接受并关闭 DFI-4A.3.3 与 DFI-4A.3 整体。DFI-4A.4 计划评审已正式关闭；
`0.0.0-dfi.4a.4.0` Production Composition Preflight 已完成且未修改生产源码，用户已接受其复核结论并
正式标记 `PASS/CLOSED`。该关闭只表示 Preflight 正确阻断，不表示下列 blocker 已关闭。真实核查得到
`BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION_AND_ELECTRON_MESSAGEPORT_TRANSFER`：当前 production
composition 无可信 Runtime Active enterprise/user/device/entitlement 组合；Electron 43.2.0 的 sandboxed
Preload↔Main MessagePort 双向控制握手成立，但 transferable ArrayBuffer 只在 sender detach、未抵达 Main。
Helper trust primitives 已有，但 production packaging/descriptor/broker handler 仍缺失；migration 23/24
足够，不需要 migration 25。Enterprise Identity Production Composition 修复方案与 Sensitive
Renderer↔Main Transport Revision 1/Threat Model 已通过复核并由用户接受。`0.0.0-eipc.0` 已完成 EIPC-0：
冻结独立 `eipc.v1alpha1` 非 Secret Contract、owner/activation/current transport 身份、session rebind、
显式 Compatibility、CGF-1.3 offline 状态 2/3、canonical digest 与 TS/Java Conformance；唯一结论为
`AUTHORITY_SEMANTICS_FROZEN`，不宣称 `IDENTITY_COMPOSITION_READY`，production identity blocker 仍成立；
独立 QA 已通过并由用户正式接受，EIPC-0 已 `PASS/CLOSED`。`0.0.0-strm.0` 已完成 STRM-0 路线 A
Decision Spike：真实 Electron 43.2.0 进程证明 structured-clone `Uint8Array` mutation/reveal 双向交付、
Main 派生 exact window/frame identity、12 场景失败关闭、四通道泄漏为 0 与八类资源归零，输出
`ROUTE_A_ACCEPTABLE`；同时明确应用层可观察副本下界为 2、内部副本不可可靠清零，不宣称 zero-copy 或
`SENSITIVE_TRANSPORT_READY`；独立 QA 已由用户接受并正式 `PASS/CLOSED`。EIPC-1 Enterprise Integration
Production Adapter 详细方案已通过评审并由用户接受。`0.0.0-eipc.1.0` 已完成 docs + Spike Preflight：
冻结独立 Enterprise Session Wire family、Session Lease endpoint、claims profile 与 macOS Secure Enclave
signer profile；非沙箱 signer 连续三次通过，但真实 OA/MDM、identity credential 和 production signing
授权仍缺失，因此保持 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`；独立 QA 已通过并由用户
正式接受，EIPC-1.0 已 `PASS/CLOSED`，但该关闭不表示 production identity ready。EIPC-1.1 计划评审已
`PASS/CLOSED`；`0.0.0-eipc.1.1.1` 已完成独立 `enterprise-session.v1alpha1` canonical family、strict TS
schema、Java/TS cross-language conformance、六类 canonical digest 与 legacy Contract 字节零漂移证明；
独立 QA P0～P3 全 0 并由用户正式接受，EIPC-1.1.1 已 `PASS/CLOSED`。`0.0.0-eipc.1.1.2` 已完成
PostgreSQL v0010、Enterprise Session Persistence Domain/Port、InMemory/MyBatis 双 Adapter 与严格恢复验证；
独立 QA P0～P3 全 0 并由用户正式接受，EIPC-1.1.2 已 `PASS/CLOSED`。EIPC-1.1.3 Central Decision /
Validator / HTTP Foundation 计划评审已 `PASS/CLOSED`；`0.0.0-eipc.1.1.3.1` 已实现 Central-private strict
Session claims、opaque verified identity handle、legacy/session authorization result、三个独立 canonical digest
domain，以及 resolver/token codec/common authorizer Port 与 test-only deterministic adapter。开发者 Harness
**5 classes / 36 tests**、Workspace **240 files / 1603 tests + 3 smoke**、Central online/offline
**351/0/0/0** 均已严格串行通过；独立 QA P0～P3 全 0 并由用户正式接受，EIPC-1.1.3.1 已
`PASS/CLOSED`。`0.0.0-eipc.1.1.3.2` 已实现 Transactional Challenge / Session Lease：requested
permission exact lock、Challenge correlation exact replay/conflict、单一 Decision Assembler、事务内 bearer
encode、Challenge consume + Lease issuance 原子提交与 response loss 不重放 bearer 均已落地。
专项 Harness **4 classes / 40 tests**、Workspace **240 files / 1603 tests + 3 smoke**、Central
online/offline **363/0/0/0** 均已严格串行通过；独立 QA P0～P3 全 0 并由用户正式接受，
EIPC-1.1.3.2 已 `PASS/CLOSED`。EIPC-1.1.3.3 已实现 strict Session Validator、legacy/session Common
Authorizer、consumer cutover 与默认关闭的 Conditional HTTP Foundation；开发者 Harness **8 classes / 33 tests**、
Workspace **240 files / 1603 tests + 3 smoke**、Central online/offline **391/0/0/0** 全绿；独立 QA P0～P3=0
并由用户正式接受，EIPC-1.1.3.3 与 EIPC-1.1 Foundation 已 `PASS/CLOSED`。该关闭只保留默认关闭的 dormant
foundation，不表示真实 SSO 或 production identity ready。EIPC-1.2～1.3、EIPC-2～3 已改为
`DEFERRED / OUT OF CURRENT RELEASE`，两个 identity blocker 保持打开。模拟账号只可用于 test profile，
且必须明确 `testIdentityUsed=true`、`productionIdentityReady=false`。
`0.0.0-strm.1` 已实现
STRM-1 私有 Transport Contract / Adapter Foundation：冻结单一 Route A profile、HMAC Ticket、strict
`Uint8Array` envelope、typed errors、Main Registry 与未注册的 Main/Preload Adapter。production feature
默认 disabled，未接 CRUD/reveal UI、Broker 或公共 API，transport blocker 继续成立；独立 QA 已由用户接受，
STRM-1 正式 `PASS/CLOSED`。STRM-2 Production Transport Wiring 计划评审已 `PASS/CLOSED`，明确只关闭
Electron/Main/Preload/fd4/fd5 transport wiring，不用 Fake owner 绕过 production Core handler/identity 缺口，
不开放 Renderer API，也不关闭 transport blocker。`0.0.0-strm.2.1` 已实现 private Control Contract、
Main production lifecycle controller、Preload internal receiver、navigation epoch 与 one-shot MessagePort；
production feature/business handler 继续 disabled/unavailable，未接 Broker 或 Renderer API。开发者专项、
Workspace 与 Central online/offline 门禁全绿，独立 QA 已通过并由用户正式接受，STRM-2.1
`PASS/CLOSED`。`0.0.0-strm.2.2` 已实现 Broker Dispatch 与 Directional Closure：针对 sandboxed Preload
无稳定 WebCrypto 的代码事实落地 Main-issued one-shot frame authorization、exact Broker lease、
mutation/reveal方向闭合和transport/Receipt事实分离；开发者Harness、Workspace与Central online/offline
已全绿，独立QA已通过并由用户正式接受，STRM-2.2现已`PASS/CLOSED`。production feature/business
handler仍关闭且blocker未解除。`0.0.0-strm.2.3` 已完成真实 Electron/Main/sandboxed Preload/
`CorePrivateSupervisor`/Core child/fd4-fd5 的 S1～S8 Process Harness：三轮共 57 个 fresh process 场景、
semantic digest 一致、四通道泄漏 0、80 次负向注入生效、14 类资源归零，输出仅为
`STRM2_PRODUCTION_WIRING_CONFORMANT`。首轮独立 QA 的资源证据 P2 与 late cleanup P3 已由
`0.0.0-strm.2.3-repair.1` 修复，复验 P0～P3 全 0 并由用户正式接受；repair.1、STRM-2.3、STRM-2
已依次 `PASS/CLOSED`。transport blocker 仍打开，不输出 `SENSITIVE_TRANSPORT_READY`；STRM-3、
DFI-4A.4.1～DFI-4A.4.3、DFI-2B、DFI-3B 与 TGM 继续 `GATED`。EIPC-1.2～EIPC-3 已移出当前版本；
DFI-3A 与 AAPI-0 只进入详细方案评审，尚未编码。
`0.0.0-dfe.5b.2` 已实现设置二级导航与 GATED 页面骨架：`#/settings` 下新增
`personalization`、`memory`、`feedback`、`identity` 四条可达路由，模型页也改用同一
RouterLink 设置导航；四个新页面只展示静态产品文案与 `capabilityState=gated`，不保存、不提交、
不展示假记忆、不声明登录或反馈成功。该批只能关闭 DFE-5B.2，不能关闭 DFE-5B 整体，也不宣布
个性化、个人记忆、反馈或身份功能完成；用户已正式接受并关闭 DFE-5B.2。`0.0.0-dfe.6a`
已实现 Task Detail 工作空间文件真实数据收敛：右侧“工作空间文件”面板通过 Renderer-only adapter
消费 DFI-1B v1alpha2 `getCompatibility/listWorkspaceEntries/openTaskWorkspaceLocation`，删除固定文件名占位；
`listWorkspaceEntries` 只提交 `taskId/parentEntryId?/cursor?/limit?`，Reveal 只提交 `taskId`，并覆盖
Core restart 协商、task 切换清理、late response 丢弃、cursor 分页、stale cursor 一次刷新、symlink
永不导航和 feature 缺失 Unavailable。DFE-6A 已通过独立 QA 并由用户接受，正式 `PASS/CLOSED`。
DFE-6B 已在 `0.0.0-dfe.6b` 实现 Frontend Experience Foundation 最终收口，独立 QA PASS 并由用户接受关闭；
Desktop Frontend Experience Foundation 正式 `PASS/CLOSED`：将五导航视觉/键盘/状态矩阵、remaining
Mock/Prototype/GATED inventory、Legacy 隐藏维护入口决策和 Renderer-only 边界固化为测试；
不关闭后端 DFI、TGM、Knowledge Provider、Personal Model/Credential、Agent/Skill 创建或正式安装包。DFI-2B/DFI-3
继续单独授权。DFI-1A、DFI-1B 均已通过独立 QA、用户接受并正式 `PASS/CLOSED`。

Tool 接入与管理产品语义已由 `TOOL-MANAGEMENT-FEATURE-SPEC-v1.0.md` 冻结：当前 5 个
Document Tool 作为首批真实内置代码 Tool，后续通过可信 Manifest/Central Catalog 和 Enterprise
Policy 纳入管理。Revision 4 进一步确认：官方或企业代码 Tool 完成研发测试和可信发布后自动登记，
Admin 不再添加、安装、保存代码草稿、运行测试或删除代码 Tool，只配置允许范围、确认策略和启停；
“新增 Tool”只保留连接 API 与连接 MCP 服务。HTTP P0 支持单条 cURL 快速导入；MCP P0 只连接已部署
的远程服务，不提供本地 Command/Arguments，按验证发现、选择 Tool、设置范围并保存独立草稿接入，
Tool 策略与服务连接分开编辑。企业 Connection/Credential、Validation、Health 和
生效状态继续分层，普通停用只影响新 generation/新任务，运行中任务保持 exact lock。建议后续建立
TGM-0～TGM-5，当前 Tool Catalog/Policy、HTTP/MCP Gateway、管理端真实配置、测试和启用仍全部
`GATED`；TGM-0 暂不评审，需先补详细方案文件，本次产品文档冻结不自动授权编码。

Desktop P0 Interface Completion 已由用户确认正式计划并关闭 DFI-0。`0.0.0-dfi.1a` 已完成
Workspace Browser 的 `v1alpha2` strict Contract、Core authority 解析、HMAC entry/cursor proof、
固定可见性策略和 Node 单层安全目录 Adapter；查询只接受当前 Task ID，并绑定已持久
`TaskRuntimeSelection` 的 WorkspaceGrant 与 selection digest。symlink 只展示不跟随，完整路径、
Credential 和 Runtime Handle 不进入 Projection。开发者专项、完整 Workspace 与 Central
online/offline 门禁及 Claude Code 独立 QA 已通过，用户已正式接受并关闭 DFI-1A。
`0.0.0-dfi.1b` 已完成 Workspace Browser 跨进程接入：Desktop Local `v1alpha2` additive
sidecar、Core private HTTP、Main/Preload strict 白名单和 `wra1` reveal authority 已形成完整链路。
Renderer 只提交 Task authority 与 opaque proof，完整路径只在 Core→Main 私有边界短暂出现；Main
在 OS 打开前复核目录身份，5 秒未收敛进入不可自动重试的 uncertain。开发者专项、Workspace 与
Central online/offline 门禁与 Claude Code 独立 QA 已通过，用户已正式接受并关闭 DFI-1B；
Renderer 页面仍未接入，Mock 未删除。DFI-2A 正式计划已通过评审；`0.0.0-dfi.2a.1` 已完成
智能授权 `v1alpha2` Contract、固定 MVP Policy Port/Fake 与纯 Selection Resolver，历史任务和
v1alpha1 请求固定规范化为 `smart_confirm / legacy_default`。本批未接 migration、Persistence、
SubmitTurn 生产协调链、HTTP/Main/Preload/Renderer 或具体风险动作矩阵；独立 QA P0～P3=0，用户已
正式接受并关闭 DFI-2A.1。`0.0.0-dfi.2a.2` 已完成 migration 22、并行 Persistence API、
InMemory/SQLite 双实现与 legacy materialization，且没有产生 SubmitTurnCoordinator/readiness
半切换；Workspace **191 files / 1275 tests + 3 smoke**、Central online/offline **302/0/0/0**
均通过独立 QA，用户已正式接受并关闭 DFI-2A.2。`0.0.0-dfi.2a.3` 已完成双版本
SubmitTurn coordination、exact wire digest、authorization-aware Task bundle 单路径 cutover、
legacy recoverable record CAS normalization、版本匹配 Receipt/Query Projection，以及 public ready
前的 legacy authorization materialization。开发者专项 **5 files / 55 tests**、Workspace
**191 files / 1286 tests + 3 smoke**、Central online/offline **302/0/0/0** 均串行通过；独立 QA
P0～P3=0，用户已正式接受，DFI-2A.3 与 DFI-2A 整体 `PASS/CLOSED`；DFI-2B、DFI-3 和
DFI-4 继续 `GATED`。

ARH-0 Agent Runtime Harness 优化计划已正式 `PASS/CLOSED`。`0.0.0-arh.1`
已完成 ARH-1 Provider Stream Conformance：Core 在唯一 Model stream 消费点执行顺序验证，
拒绝重复 started、terminal 后事件、无 terminal 自然结束、空白 delta、Tool Call identity
重复/漂移及 usage 重复/回退；terminal 只在上游流自然结束后提交，因此非法 Provider 流
不能制造 completed Assistant Message。Anthropic-compatible 与 OpenAI-compatible Adapter
已补齐等价负向覆盖，既有企业模型断流恢复异常仍交由 Durable Runtime 处理。开发者自测
及 Claude Code 独立 QA均已通过，用户已正式接受，ARH-1 `PASS/CLOSED`。
`0.0.0-arh.2.1` 已完成 ARH-2.1 Atomic Planning 与 Compacted Context View：共享
Conversation 原子组规划器保证 Tool Call Batch、确认因果轮次和 Result 不被拆分；首次与滚动
Compaction 只选择旧完整前缀；active Summary 作为低权限派生 conversation context 与 raw
tail 组合且不伪造持久 Message；Core SQLite migration 18 将私有
`CompactionExecutionBinding` 与 Job 第一事务原子写入，精确锁定 Task Model、Binding、Adapter
与 Registry revision，但不保存 Endpoint、Credential、Token、Prompt 或正文。ARH-2.1 专项
7 files / 70 tests、完整 Workspace 153 files / 1056 tests 与三项 smoke 已通过开发者自测和
Claude Code 独立 QA，`P0～P3=0`；用户已正式接受并关闭 ARH-2.1。`0.0.0-arh.2.2`
已完成生产自动压缩编排：唯一 `ContextPreparationCoordinator` 复用 Context assessment，按
80% 触发线选择旧完整前缀，经 purpose-bound admission 与精确 ExecutionBinding 调用锁定
Model，提交 Summary 后 reload 并只重新预算一次；migration 19 将摘要 invocation identity、
cursor、output-started 与 summary committed 事实同主 Assistant link 分离。active Summary 的
外发类别从 immutable source range 重建，历史 assistant 必须满足 exact Model/Binding/Adapter/
Registry provenance；ARH-1 stream validator、无 Tool 摘要、有界输出和 typed hard-budget
错误均已接入。开发者专项、完整 Workspace 及 Central 在线/离线门禁和 Claude Code 独立 QA
均已通过，用户已正式接受并关闭 ARH-2.2。`0.0.0-arh.2.3` 已完成恢复关闭 Harness：七个
命名崩溃窗口通过真实 Core child、受控 Provider 与 SQLite reopen 验证；同一 50-round 场景
已通过真实 `DurableAgentLoopStarter`、Process Model/Tool、durable Effect/Tool Batch 运行，
完成首次与 rolling Compaction。开发者专项 17 files / 115 tests、52/52 场景、完整 Workspace
160 files / 1087 tests + 3 smoke 以及 Central online/offline 215 tests 均通过；当前等待 Claude
Code 独立 QA 的生产功能结论为 PASS；其发现的 W6 flaky 已进入
`0.0.0-arh.2.3-repair.1`。repair.1 将两个 Owner 的 SQLite 启动与并发恢复阶段分离，使用独立
确定性 ID 序列并补齐提前退出诊断；W6 连续 10/10、专项 115/115、完整 Workspace
1087/1087 与 Central online/offline 已通过独立 QA，`P0～P3=0`。用户已正式接受并关闭
repair.1、ARH-2.3 及 ARH-2 整体。ARH-3 Revision 3 已通过差异复核并由用户接受，ARH-3.0
正式关闭。`0.0.0-arh.3.1` 已实现 Durable Usage Facts 与 Retry Dedupe：Central PostgreSQL
v0008 以 attempt/fencing identity 持久化企业 Provider Usage Fact，并将 terminal winner 的
Fact、durable Event、Audit Outbox 与 terminal 状态原子提交；stale owner 只能追加
`superseded_confirmed` 事实，不能覆盖 winner。Core migration 20 保存不含正文和凭据的安全
Invocation Usage Projection，并从 invocation-level projection 确定性重建 Session 汇总；主调用
与 Compaction 调用共用相同规则。`UsageAuthority=central_enterprise|local_personal` 已冻结，
个人路径首期仅提供 Core-private Port/Fake，不接真实个人 Provider、凭据或权威表。ARH-3.1
开发者专项 4 files / 24 tests、完整 Workspace 162 files / 1099 tests + 3 smoke、Central
online/offline 各 223 tests 均通过；Claude Code 已完成独立 QA，结论 `P0～P3=0`，用户已
正式接受并关闭 ARH-3.1。ARH-3.2 Revision 1 已通过差异复核并由用户确认；
`0.0.0-arh.3.2.1` 已实现 Contract 与 exact Session Scope Foundation：Enterprise Gateway
新增严格、版本锁定的 v1alpha2 Model Invocation 四路由与 `cacheContext` sidecar，v1alpha1
保持不变；Core migration 21 持久化 HMAC namespace 与 invocation-side cache context，主调用和
Compaction 调用均按 C1/C2 顺序恢复且不持久化原始 Session。Central 只冻结 v1alpha2 thin HTTP/
application seam，未提供生产 Bean，因此 Cache Plan、v0009 和 Provider cache 字段不会提前启用。
开发者专项 4 files / 60 tests、完整 Workspace 163 files / 1132 tests + 3 smoke、Central
online/offline 各 233 tests 均通过；Claude Code 独立 QA 已复跑同一门禁且 `P0～P3=0`，用户已
正式接受并关闭 ARH-3.2.1。`0.0.0-arh.3.2.2` 已实现 Central Durable Prompt Cache Planner：
PostgreSQL v0009 持久化 immutable Cache Context/Plan，Profile、Compatibility、静态来源版本锁与
最终前缀通过四层 digest 确定性规划；Transaction A/B、C3～C7 和双 JVM takeover 已由专项
Harness 证明；该批本身未投影 Provider cache 字段。Claude Code 已独立串行复跑专项 **9 classes / 66
tests**、完整 Workspace **163 files / 1132 tests + 3 smoke**、Central online/offline，结论
`P0～P3=0`；用户已正式接受并关闭 ARH-3.2.2。`0.0.0-arh.3.2.3` 已完成 Provider Cache
Projection Closure：immutable Plan 在 dispatch 前解析为 typed Projection，Anthropic-compatible
投影 reviewed provider-default ephemeral marker，OpenAI-compatible 区分 automatic-observed 与
explicit opaque key；static digest 与 wire body 共用 canonical material，Usage 仍以 Provider 返回
事实为准。专项 **10 classes / 93 tests**、Central online/offline 各 **297 tests**、Workspace
**163 files / 1132 tests + 3 smoke** 全部通过。Claude Code 独立 QA 已确认核心链路通过，用户已
正式接受并关闭 ARH-3.2.3 与 ARH-3.2；两个
既有 Central 测试的偶发时序问题以 `CTR-P3-001` 独立跟踪，不属于产品缺陷，也不自动进入
ARH-3.3。ARH-3.3 Multi-Session Evidence Harness 详细方案已通过评审并由用户确认；
`0.0.0-arh.3.3.1` 已完成 Multi-Session Topology Foundation：两个 Core child、两份独立 SQLite、
双 Central JVM共享 PostgreSQL、受控 Provider、A1/A2/B1 三 Session 与企业/个人 authority
隔离已形成统一 Evidence。专项 **12/12**、Workspace **164 files / 1139 tests + 3 smoke**、
Central online/offline 各 **299 tests** 均通过开发者门禁；Claude Code 独立 QA 也已复跑通过，
用户已正式接受并关闭 ARH-3.3.1。ARH-3.3.2 Recovery、Usage 与 Compaction Matrix 详细方案
已通过评审并获用户授权；编码前核查发现 Assistant/Compaction `usage_recorded` 原路径先推进
durable cursor、再写 Core Usage Projection，存在崩溃后永久缺失本地 Projection 的 P1。
`0.0.0-arh.3.3.2-preflight-repair.1` 已将两条路径调整为 Projection-before-cursor，并补齐
Projection 前、Projection 后 cursor 前的崩溃重放与 Assistant SQLite reopen 测试；Claude Code
独立 QA 已串行复跑专项 **15 tests**、Workspace **164 files / 1143 tests** 与 Central
online/offline **299/0/0/0**，`P0～P3=0`。用户已正式接受并关闭 repair.1，ARH-3.3.2 主
Harness 曾恢复开发。真实 Central 接缝随后暴露新的 P1：Central terminal 与 Usage 同事务提交，
但 Core 在 terminal status 下于 durable Event 回放前退出，使 M3/M4 未消费 Usage 无法收敛。
`0.0.0-arh.3.3.2-preflight-repair.2` 已获用户授权并完成实现：Core 先查询 terminal status，
再从持久 cursor 有界补偿 durable Usage/terminal facts；Usage 仍按 Projection-before-cursor 幂等
收敛，且补偿后不重建 ephemeral output、不伪造 Assistant Message 或 Summary。专项 **27 tests**、
Workspace **164 files / 1155 tests + 3 smoke** 及 Central online/offline **299/0/0/0** 均已
通过开发者门禁。Claude Code 独立 QA 已复跑专项 **27 tests**、Workspace **164 files / 1155
tests**、Central online/offline **299/0/0/0**，`P0～P3=0`；用户已正式接受并关闭 repair.2，
ARH-3.3.2 主 Harness 恢复开发。`0.0.0-arh.3.3.2` 现已完成统一恢复矩阵：M1～M8、三类
Model invocation、五类 cache 状态、双 JVM/PostgreSQL fencing 与 Core SQLite/Compaction reopen
已由同一专项入口串行验证；专项 **52/52 场景**、Core **79 tests**、Central **27 tests**、
Workspace **164 files / 1155 tests + 3 smoke**、Central online/offline **299/0/0/0** 全绿，
资源与敏感扫描均为 0。Claude Code 独立 QA 已实际复跑相同门禁并确认 `P0～P3=0`，用户已
正式接受并关闭 ARH-3.3.2。ARH-3.3.3 Unified Closure Evidence 详细方案已完成 Revision 1：
用户接受 30 分钟/5 lifecycle 门槛，并补真实资源诊断、逐 cycle 量化、52→36 场景映射和 52 项
QA；Claude Code 差异复核已 `PASS（P0=0 / P1=0 / P2=0 / P3=2）`，两项文档 P3 已修正，
用户已接受并授权编码。`0.0.0-arh.3.3.3` 已按冻结方案修正 Unified Closure Harness：三轮完整
M1～M8 semantic replay 与后续轻量长稳 cycle 分离，长稳不再每 cycle 重放 Central 全矩阵；
Node 24.13.0 fail-fast、失败安全留证、OS 分配 Relay 端口和 status-first 测试恢复均已落地。
开发者正式门禁完成 **3 轮完整语义重放 + 85 个轻量长稳 cycle（总计 88 lifecycle cycles）**，
长稳计时超过 30 分钟、52/52 场景、semantic/stability digest 分别稳定，敏感扫描与八类资源
余量均为 0。三个实施期失败运行的安全 `failure.json` 均被保留，没有以补跑覆盖失败事实。
该原批随后进入独立 QA，并在第 26 个轻量 cycle 暴露 failpoint 等待时序 P1；
`CTR-P3-001` 仍是独立维护项，未被本批吸收。
Claude Code 随后的正式独立 QA 在第 26 个轻量 cycle 复现 failpoint 等待时序 P1，用户接受
FAIL 并授权 `0.0.0-arh.3.3.3-repair.1`。repair.1 已将 test-only failpoint 改为 exact
`sessionId` + 单次 latch handshake，补齐四通道/五类 marker 泄漏扫描，同时保持 takeover、
lease/fencing 与生产语义不变。开发者正式门禁现已完成三轮完整 replay、**52/52 场景**、
**86 个轻量长稳 cycle（合计 89 lifecycle cycles）**；四通道命中和八类资源余量均为 0，
Workspace **166 files / 1176 tests + 3 smoke**、Central online/offline **302/0/0/0** 全绿。
Claude Code 已在 Node 24.13.0、Java 21 与 Docker 环境下严格串行从零复跑 repair.1：三轮
semantic replay、**92 个轻量长稳 cycle（36.6 分钟）**、精确 takeover **10/10**、Workspace
**166 files / 1176 tests + 3 smoke**、Central online/offline **302/0/0/0** 全部通过，四通道
泄漏和八类资源余量均为 0。用户已正式接受，repair.1、ARH-3.3.3、ARH-3.3 与 ARH-3 依次
`PASS/CLOSED`。后续正式 Harness 与 Central 门禁必须串行执行。

Document Tool 全栈（DTP + DWE + APV + DWO）已整体 `PASS/CLOSED`。MAR-0 → MAR-1B
已整体 `PASS/CLOSED`；`0.0.0-mar.1b` 已完成 MAR-1B bounded workspace-file
preview：手动登记的 text/markdown artifact 可由 Desktop Main 有界稳定读取并投影预览，
HTML artifact 只通过 APV-1C loopback sandbox + deny-by-default CSP 渲染；Renderer 仍不接触
路径、root 或文件 digest。APV-3C 已 docs-only 关闭并保留状态矩阵作为参考；
PDT-0/PDT-1/PDT-2/PDT-3 已正式关闭；`0.0.0-pdt.3` 已完成
`tool.document.pdf.extract_tables` Desktop Product E2E：明确表格提取请求可经 Desktop
IPC、Core、AgentBridge、Document Worker 回到 assistant bounded table summary；Artifact
metadata 将表格结果作为 PDF/document artifact 投影，不泄漏 workspace path 或 raw table JSON。
PDT-4 packaging/hardening closeout 已完成自测，等待独立 QA；本批不新增 package 版本或功能面；PDF 表格
OCR/扫描件、XLSX 导出、人工校正 UI 和 bulk extraction 不在 P0；
PDF/XLSX/DOCX parser preview、Document Worker 接入、
bulk registration、drag/drop path、overwrite 扩展、OS Sandbox 与 formal installer 继续
`GATED`。

项目当前已完成 KAF-0～KAF-5。DCF-1.0、DCF-1.1、DCF-1.2A 和 DCF-1.2B
均已通过独立 QA 并关闭。`0.0.0-dcf.1.2c` 已把 Scripted Model 的 token
delta 投影为可丢弃的临时 Desktop Event，并以持久 `message_committed`、
Snapshot-first 重连、durable cursor、四分支 replay reset、运行代切换清理和
有界投递窗口完成最终收敛；真实 Main/Core/SQLite 子进程 E2E 已验证在首个
delta 后断线仍可恢复最终 Assistant Message。独立 QA 85 files / 534 tests、
P0～P3=0 已由用户接受，DCF-1.2C 与 DCF-1.2 阶段正式关闭。
CGF-1.1 和 CGF-1.2 已关闭。用户已确认先 DCF-1.3、后 CGF-1.3 的顺序。
`0.0.0-dcf.1.3a` 已完成六态 Core lifecycle、最多一次自动 restart、
failed 后失败关闭、受控 restart、运行代/令牌/临时选择失效和 SQLite 持久事实
恢复；完整门禁 86 files / 543 tests 和独立 QA 已由用户接受，DCF-1.3A
正式关闭。
`0.0.0-dcf.1.3b` 已完成 SSE backpressure、30 秒 slow-consumer、
ephemeral/heartbeat 有界降级、资源回收指标、dedupeSet 指标和压力矩阵；
完整门禁 87 files / 554 tests 与独立 QA 已由用户接受，DCF-1.3B 正式关闭。
`0.0.0-dcf.1.3c` 已完成长稳 Harness；开发者实际 30/60 分钟运行、机器安全
报告和完整 88 files / 555 tests 门禁均通过；Claude Code 独立 QA 再次实际
执行 30/60 分钟 Harness，27 项范围全部覆盖且 P0～P3=0。该结论已由用户接受，
DCF-1.3C 与 DCF-1.3 阶段正式关闭。CGF-1.3 继续 `GATED`，不因 DCF-1.3
关闭而自动解锁。企业离线四状态和 CGF-1.3 A/B/C 方案已经用户确认并完成
P1/P2 文档修订。`0.0.0-cgf.1.3a` 已从精确 Storage Active generation
确定性构建并冻结企业 Model/Tool Registry，独立投影 Agent/Skill/Knowledge
引用，并完成五项 `LocalExecutableEnterpriseCapability` 判定；InMemory 与
SQLite Conformance、失败关闭和 KAF-3 Registry 回归均已通过独立 QA，
P0～P3=0 且已由用户接受，CGF-1.3A 正式关闭。`0.0.0-cgf.1.3b` 已完成
Activation Intent、受控重启 Port、精确 startup target、internal readiness、
runtimeActive 原子提交、崩溃重放和受限旧 generation 回退；InMemory/SQLite
共用 Conformance、九个故障点和完整 91 files / 594 tests 均通过开发者自测及
Claude Code 独立 QA，P0～P3=0；该结论已由用户接受，CGF-1.3B 正式关闭并
授权进入 CGF-1.3C。`0.0.0-cgf.1.3c` 已完成新旧 Task generation 引用
隔离、双 SQLite 固定顺序恢复、只阻止删除的 GC blocker、企业离线四状态
Projection 和阶段恢复 Harness；完整 Node 门禁 93 files / 600 tests、
专项 3 files / 15 tests、Central 在线/离线各 53 tests 均通过开发者自测。
Claude Code 已独立重跑全部门禁，14/14 范围覆盖且 P0～P3=0；用户已正式
接受，CGF-1.3C 与 CGF-1.3 阶段均 `PASS/CLOSED`。DCF-2 已确认为
`CONFIRMED_WITH_SPECIFIED_REVISIONS`。`0.0.0-dcf.2.0` 已通过独立 QA 并由
用户接受关闭。`0.0.0-dcf.2.1` 已完成 DCF-2A 的 Task list/detail、Run/Step、
Tool Activity、durable Event 与 Desktop Task 状态面板；Scripted Agent Loop
已接入 durable Task 状态机，SQLite restart 后可从事实源恢复，专项 6 files /
47 tests、完整 95 files / 615 tests 通过；独立 QA P0～P3=0 已由用户接受，
DCF-2A 正式关闭。`0.0.0-dcf.2.2` 已完成 DCF-2B：Desktop 用户确认卡片、
allow/reject、cancel/retry/continue/provide input、确认绑定与过期/重放拒绝、
实时状态再校验、SQLite V12 以及等待确认的持久恢复均已接入现有
Application/Adapter 链路；独立 QA 96 files / 620 tests、P0～P3=0 已由用户
接受，DCF-2B 正式关闭。`0.0.0-dcf.2.3` 已完成 DCF-2C：覆盖 running、
waiting_input、waiting_user_confirmation、cancel、retry 与迟到 Observation
隔离的 SQLite close/reopen 恢复矩阵，Desktop/Core restart、SSE reconnect、
durable cursor、慢消费者和资源回收统一 Harness，以及等待输入、等待确认、
恢复中和人工处理的用户指引。完整 98 files / 630 tests、DCF-2C Harness
4 files / 18 tests 均通过开发者自测；Claude Code 已独立重跑 98/630 与
Harness 4/18，P0～P3=0，技术 QA 结论已由用户接受。随后
`0.0.0-dcf.2.3-demo.1` 新增完全隔离的现场体验入口，以独立数据目录、固定
Demo Agent/Model 和真实进程外 Echo Tool 验证等待确认、重启恢复、允许执行及
结果去重；完整门禁 99 files / 631 tests、Harness 5/19 通过。用户于
2026-07-28 连续两次完成现场演示，确认 Task、Confirmation、重启恢复、真实
Tool Activity 和持久结果均正常。DCF-2C 与 DCF-2 正式关闭；CGF-2 继续
`GATED`。ADR-016 已正式接受，Alignment-1 开发计划已确认。
`0.0.0-cja.1a` 已完成受限 Lombok、GET/POST Java Source Guard、Thin
Controller、Bearer Security Filter、统一 `GlobalExceptionHandler`、安全
Error Envelope 及并发隔离测试；Central online/offline 均为 66 tests、
0 failures、0 skipped，Testcontainers PostgreSQL 16 与 Embedded PostgreSQL
均实际执行；独立 QA P0～P3=0 已由用户接受，Alignment-1A 正式关闭。
`0.0.0-cja.1b` 已完成 W3C Trace Context、`X-RoboThree-Trace-Id`、
HTTP/Application/JDBC 安全 Span、默认关闭的可选 OTLP Exporter、typed
errorCode Tag、48 路并发隔离和敏感信息防泄漏验证；Central online/offline
均为 77 tests、0 failures、0 skipped，PostgreSQL 双实现实际执行。
Claude Code 独立 QA P0～P3=0 已由用户接受，Alignment-1B 与 Alignment-1
正式 `PASS/CLOSED`。Alignment-2A 开发计划的 8 项 P2 和 3 项 P3 已经
Claude 复核全部关闭并由用户正式确认。`0.0.0-cja.2a.1` 独立 QA 已由
用户接受并正式 `PASS/CLOSED`。`0.0.0-cja.2a.2` 已完成 Authentication /
Configuration MyBatis-Plus 业务 Persistence Adapter、显式 Mapper XML、
Domain Converter、PostgreSQL TypeHandler 与 Spring Transaction Runner；
新旧 Adapter 共用 Persistence、Recovery、Concurrency Conformance，真实
PostgreSQL 已验证 SqlSession 与 Spring Transaction 共用同一 Connection，
32 路 Token issuance、20 路 Enrollment replay 均通过；独立 QA
online/offline 各 98 tests、P0～P3=0 已由用户接受，Alignment-2A.2 正式
关闭。`0.0.0-cja.2a.3` 已完成生产 Persistence 切换：只保留
MyBatis-Plus Adapter，删除旧 JDBC Persistence、Flyway 依赖和自动
Migration 路径；正式 Spring 装配在 DataSource 存在时执行只读 Schema
Preflight，结构漂移失败关闭。Central online/offline 各 96 tests 全通过，
PostgreSQL 双实现均实际执行；Claude Code 独立 QA P0～P3=0 已由用户接受，
Alignment-2A.3 与 Alignment-2A 正式 `PASS/CLOSED`。Alignment-2B 正式
方案已完成修订版复核并由用户确认；`0.0.0-cja.2b.1` 独立 QA 已由用户
接受并正式关闭。`0.0.0-cja.2b.2` 已完成双 JVM、独立端口/连接池、共享
PostgreSQL 的 Foundation 正确性 Harness，覆盖跨节点 Challenge/Token/
Configuration/Package、并发单消费、ETag 304、Permission revision、节点
退出与纯 PostgreSQL 重启恢复，独立 QA 已由用户接受并正式关闭。
`0.0.0-cja.2b.3` 已补齐 commit 前/后崩溃、Challenge 消费中断、数据库
中断恢复、双节点 Schema 漂移失败关闭和重复启停资源归零矩阵，开发者全量
自测及 Claude Code 独立 QA 均通过并由用户正式接受；Alignment-2B.3 与
Alignment-2B 整体 `PASS/CLOSED`。Claude Code 对重新对齐的 ADR-015 与
CGF-2 Plan 完成复核，P0～P3=0；用户已正式接受 ADR-015、确认计划并授权
进入 CGF-2.0。`0.0.0-cgf.2.0` 已完成 additive Enterprise Model
Invocation accept/status/cancel/SSE、公共七状态、durable/ephemeral
双通道、固定 audience/permission、server-owned recovery policy、
lease/fencing 内部协调 Contract、Anthropic/OpenAI 双协议 Stub Fixture、
TS/Java 共用 Conformance 与安全威胁模型；独立 QA 124/0/0/0、P0～P3=0
已由用户接受，CGF-2.0 正式关闭。`0.0.0-cgf.2a.1` 已按下一个可用
PostgreSQL v0007 建立 Model Invocation、Durable Event、Recovery Lease 与
Audit Outbox 的 Schema/manifest/preflight，并完成 InMemory 与
MyBatis-Plus 显式 SQL 的共用持久化 Conformance；独立 QA online/offline
各 134/0/0/0、工作区 107/685、P0～P3=0 已由用户接受，CGF-2A.1 正式
关闭。ADR-015 补充修订 A 经 Claude Code 首轮评审提出的两项 P2、两项 P3
已全部修订；修订版复核 P0～P3=0 后已由用户正式接受。CGF-2 开发计划已按
厂商直连、自定义中转站、不可变 Binding revision 和协议正交边界修订，且
Claude Code 复核 P0～P3=0。`0.0.0-cgf.2a.2` 已实现 Application Runtime、
版本化 Development Binding Resolver、实时收窄检查、Fake Provider、
Durable Event/Outbox、cancel/timeout、数据库时间 lease/fencing 及三类
evidence-based recovery；独立 QA 148/0/0/0、工作区 107/685、
P0～P3=0 已由用户接受，CGF-2A.2 正式关闭。当前
`0.0.0-cgf.2a.3` 已使用两个独立 Java PID、双随机端口、独立 Hikari Pool
和共享 PostgreSQL 16 完成 crash takeover、stale fencing、跨节点 durable
SSE reconnect、取消竞争、数据库中断、Schema 漂移与资源归零矩阵；Claude
Code 独立 QA 再次实际执行 Central 在线/离线各 153/0/0/0、工作区
107/685，P0～P3=0。用户已正式接受，CGF-2A.3 与 CGF-2A 整体
`PASS/CLOSED`。`0.0.0-cgf.2b.1` 已完成 provider-neutral 瞬态请求与
有界 Stream Sink、Credential 授权 HTTP Transport、严格 Endpoint/redirect/
Header/UTF-8/timeout/cancel 边界，以及相互独立的 Anthropic-compatible 与
OpenAI-compatible Stub Adapter；两协议归一为一致的 text、Tool fragment、
usage 和 terminal Projection。Central 在线/离线各 167 tests 及工作区完整
门禁通过；不调用真实 Provider、不使用真实 Key、不修改公共 Contract、v0007
或 Runtime Bridge。Claude Code 独立 QA 为 167/0/0/0 x2、工作区 107/685、
P0～P3=0，用户已正式接受，CGF-2B.1 `PASS/CLOSED`。当前
`0.0.0-cgf.2b.2` 已把 CGF-2A 持久 Invocation Runtime 与 B.1 双协议安全
Adapter 通过类型化 Request Source、Provider-backed Backend、严格 Adapter
Registry 和 live Ephemeral Publisher 接通；固定 synthetic request 已在
Anthropic/OpenAI 两套 loopback Stub 上收敛为同一 durable Result。自动化
真实 Provider Harness 已建立受控环境变量、唯一 canary 扫描、deltaCount
证据以及 invalid credential、cancel、deadline 验证入口；无资源时明确返回
`RESOURCE_GATED`。Central 在线/离线各 180 tests、工作区 107 files /
685 tests 均通过开发者自测和 Claude Code 无真实 Provider 独立 QA，
P0～P3=0；该部分已由用户正式接受。随后
`0.0.0-cgf.2b.2-repair.1` 使用获准的受限真实 Anthropic-compatible Provider
完成联网 Harness：83 个 text delta、非法凭证 `failed`、取消 `cancelled`、
Deadline `timed_out`，Key/canary 泄漏扫描为 0；Adapter 同时补齐
`thinking_delta` / `signature_delta` 的校验但不投影私有推理或签名。临时 Key
文件已删除。repair.1 独立 QA 随后发现 OpenAI-compatible blank `content`
会构造非法 `TextDelta`，结论为 `FAIL — P1`。`0.0.0-cgf.2b.2-repair.2`
已将空字符串和纯空白 Provider 帧安全忽略，并补齐明确 Conformance 回归；
Central online/offline 各 182 tests、工作区 107/685 与三项 smoke 全部通过。
Claude Code 已独立重跑相同门禁和真实 OpenAI-compatible Provider Harness：
293 个 delta、非法凭证 `failed`、取消 `cancelled`、Deadline `timed_out`、
Key/canary 泄漏 0，临时 Key 已删除，P0/P1/P2=0。用户正式接受 repair.2
独立 QA，repair.2 与 CGF-2B.2 均已 `PASS/CLOSED`。CGF-2B.3、CGF-2C
此前保持 `GATED`。CGF-2B.3 修订计划经 Claude Code 复核 `P0～P3=0` 后已由
用户确认，并明确授权进入 B.3.1。当前 `0.0.0-cgf.2b.3.1` 已让既有
Provider-backed Backend 显式支持 `CUSTOM_RELAY`，将 Central 内部锁定的
`upstreamModelId` 映射到 Anthropic/OpenAI-compatible Wire `model`，同时保留
RoboThree `modelId`、公共 Contract 和 durable facts 不变；版本化 Relay Test
Binding、独立 Endpoint Policy、null/空/空白/缺失 content 回归及 opt-in 真实
Relay Harness 已实现。随后 `0.0.0-cgf.2b.3.1-repair.1` 修复真实公网
Custom Relay 实跑发现的受控 Credential 环境命名阻断，以及 OpenAI-compatible
逐帧单调 usage 被误判为重复的问题；Adapter 只投影一次最终 Usage，计数回退
仍失败关闭。硅基流动公网 Harness 获得 167 个 delta，Streaming、非法凭证、
取消、Deadline 与动态泄漏扫描全部通过；Central online/offline 各 191 tests、
Workspace 107/685 均通过。Claude Code 独立 QA 再次实际执行 Central 191 x2、
Workspace 107/685、真实公网 Relay 四场景与泄漏扫描，`P0～P3=0`；用户已正式
接受 repair.1。该结果以 `PUBLIC_CUSTOM_RELAY_CONFORMANCE_PASS` 关闭
CGF-2B.3.1 Foundation，不替代企业内网 Relay 验收；企业内网路由、CA/代理、
CAS/RBAC、企业 Credential/审计与生产 Secret Store 后移至 Enterprise
Integration。用户随后确认 B.3.2 修订计划并授权编码；当前
`0.0.0-cgf.2b.3.2` 已以两个独立 Central JVM、共享 PostgreSQL 16 和一个
进程外受控 Relay 跑通 F1～F10 Provider-backed Recovery 矩阵，Central
online/offline 各 195 tests、Workspace 107/685 与三项 smoke 全部通过。
Claude Code 独立 QA 已实际重跑 F1～F10 和完整门禁，结论 `P0～P3=0`；用户
正式接受后 B.3.2 `PASS/CLOSED`。当前
`0.0.0-cgf.2b.3.3-repair.1` 已完成安全、流式协议、五轮 Central A/B 与 Relay
生命周期及资源归零收口；负向测试发现并修复 encoded route 越过请求前校验的
P1，公共 Contract、v0007 与生产 HTTP Surface 保持不变。统一 closure Harness
及 Central online/offline 各 202 tests 已通过开发者门禁。Claude Code 已独立
重跑全部门禁，`P0～P3=0`；用户正式接受后 repair.1、B.3.3、B.3 与 B 已依序
`PASS/CLOSED`。随后形成 ADR-017 Implementation 与 CGF-2C 两份正式
开发计划：前者冻结 Tool Call Batch intent、disposition 和 Effect 双事务恢复
边界，后者冻结 Model 外发专用 Confirmation Scope、Local Core Admission/HTTP
Provider、Desktop Streaming 与联合恢复范围。两份计划的修订版复核
`P0～P3=0` 已由用户接受并确认。当前 `0.0.0-adr17.i1` 已实现内部 strict
Batch/Disposition schema、SQLite migration 13、InMemory/SQLite 两套 Adapter、
Assistant Message + Batch + 初始 disposition 的 Transaction A，以及 Tool Result
+ `result_committed` 的 Transaction C；digest、CAS、唯一约束、并发幂等、三个
命名故障点、旧 Conversation 升级及 close/reopen 均已通过自测。完整 Node 门禁
109 files / 711 tests、三项 smoke 和独立 QA `P0～P3=0` 已由用户接受，ADR17-I1
正式 `PASS/CLOSED`。`0.0.0-adr17.i2` 已新增精确 Task/Run/Batch 串行
Dispatcher，以 durable waiting/blocked/cancelled/denied disposition 区分确认、
取消与 crash recovery；Effect 在 `PREPARED` 后、Backend dispatch 前完成精确
关联，关联失败不会调用 Backend，Retry 新 Run 不继承旧 Run pending batch，下一
Model Request 前强制 Tool Call/Result 一一匹配。专项 7 files / 84 tests 通过；
独立 QA P0～P3=0 已由用户接受，ADR17-I2 正式 `PASS/CLOSED`。当前
`0.0.0-adr17.i3` 已建立 ADR-017 §11 的统一 18 场景 Recovery Matrix，实际
重跑 10 个证据文件，并补齐首调用执行中取消、A 后 B 前恢复和 SQLite 重启后
并发 recovery 单 owner；统一 Harness 10 files / 130 tests、敏感内容扫描 0，
完整门禁 111 files / 743 tests 与三项 smoke 全部通过。Claude Code 独立 QA
实际重跑相同门禁，18/18 场景、泄漏扫描 0 且 P0～P3=0；用户已正式接受，
ADR17-I3 与 ADR-017 Implementation Gate 三批全部 `PASS/CLOSED`。
	`0.0.0-cgf.2c.1` 已完成 Model 专用外发确认、按 Task 精确 Provider 解析、
	Core↔Central durable Invocation Link、正式 HTTP/SSE Surface 与输出连续性失败
	关闭；专项 Harness 11 Node files / 79 tests、8 Java classes、30 项矩阵映射及
	泄漏扫描 0，Node 完整门禁 116 files / 757 tests 与三项 smoke、Central
	online/offline 各 214 tests 全部通过。Claude Code 独立 QA `P0～P3=0` 已由
	用户正式接受，CGF-2C.1 `PASS/CLOSED`；CGF-2C.2 等待用户提供需求并确认
	Model Experience PRD/UX，CGF-2C.2、CGF-2C.3 与 Enterprise Integration
	继续 `GATED`。
	`0.0.0-dtp.0-repair.2` 已收口独立 Document Worker 的文件安全与运行时底座：
	生产源码删除诊断输入面，Worker-private 协议改为必填 top-level `deadlineAt`
	唯一执行 Deadline，新增 `worker_busy` 单并发拒绝语义，Path Guard 改为
		`realpath` containment，magic 探测改为有界头部读取，OOXML Stub 失败关闭。
	Document Worker 专项 13 files / 117 tests、根 Node 完整门禁 129 files /
	874 tests 和三项 smoke 已通过开发者自测及 Claude Code 独立 QA，最终
	`P0～P3=0`；用户已正式接受，DTP-0-repair.2 与 DTP-0 `PASS/CLOSED`。
	`0.0.0-dtp.1a` 已完成 DTP-1A PDF `extract_text`：在 DTP-1.0
	受控读取与 parser execution boundary 上接入 `pdfjs-dist@6.2.108`，只实现
	`tool.document.pdf.extract_text` 的只读文本抽取，输出页文本、页数、旋转、空页
	标记和 `pageNumber` locator；不实现坐标、表格、图片、OCR、XLSX、DOCX 或 Core
	Adapter。Canvas optional 依赖通过 `ignoredOptionalDependencies` 忽略，干净安装后
	`@napi-rs/canvas` 不存在且不可解析；`pdfjs-dist` package asset 保留本地 CMap 与
	standard fonts，不进行运行时下载。Document Worker 18 files / 142 tests、lint、
	Architecture boundary、完整 Workspace 134 files / 899 tests 和三项 smoke 已通过
	Codex 5.6 自测及 Claude Code 独立 QA，最终 `P0～P3=0`；用户已正式接受，
	DTP-1A `PASS/CLOSED`。当前 `0.0.0-dtp.1b` 已完成 DTP-1B XLSX `read` 开发自测：
	通过 SheetJS CE 官方冻结 tarball `xlsx-0.20.3.tgz` 接入
	`tool.document.xlsx.read`，在 SheetJS 前新增 OOXML/ZIP central-directory/package
	preflight，拒绝 zip slip、duplicate/conflicting entry、encrypted entry、macro/embedding/
	ActiveX、external relationship、压缩比预算和缺失关键 part；输出 sheet/row/cell、
	visibility、usedRange、dateSystem、formula expression、UTC date serial 与 locator。
	公式只返回表达式和缓存值，不执行公式；不实现 DOCX、Core Adapter、正式 Tool
	Registry、默认 Agent 或产品 UI。Document Worker 19 files / 147 tests、lint、
	Architecture boundary、offline install、完整 Workspace 135 files / 904 tests 和
	三项 smoke 已通过 Codex 5.6 自测及 Claude Code 独立 QA，最终 `P0～P3=0`；
	用户已正式接受，DTP-1B `PASS/CLOSED`。DTP-1C.0 DOCX Parser Decision Spike
	已由 Claude Code 独立 QA 复跑通过并经用户关闭，决策为
	`REJECT_MAMMOTH_AND_PROPOSE_CONTROLLED_OOXML_PARSER`。当前
	`0.0.0-dtp.1c.1` 已按该决策实现 DTP-1C.1 DOCX `read`：不使用 Mammoth 作为生产
	parser，不新增生产 ZIP/DOCX/XML parser 依赖，复用 DTP-1B central-directory/package
	preflight 思路，只读取白名单 WordprocessingML XML part，并由 RoboThree 自有 mapper
	输出 heading/paragraph/list_item/table、row/cell、merged cells、section/block/table/cell
	locator 与 `metadata.sectionCount`。Document Worker 21 files / 156 tests、lint、
	Architecture boundary、offline install、完整 Workspace 137 files / 913 tests 和三项
	smoke 已通过 Codex 5.6 自测及 Claude Code 独立 QA，最终 `P0～P3=0`；用户已正式
	接受，DTP-1C.1 与 DTP-1 整体 `PASS/CLOSED`。DTP-2～DTP-4 继续 `GATED`，DTP-1
	整体关闭不自动解锁 DTP-2。`0.0.0-dtp.2.0` 已完成 DTP-2.0 Core Document
	Tool Adapter Foundation：Core 新增 `DocumentWorkerToolBackend`，以固定 child process
	调用独立 Document Worker，复用现有 ToolExecution/Effect/Admission/Recovery 链路；
	不注册正式 Tool Registry，不让默认 Agent 可见，不改 Context、Artifact、Desktop、
	Central、Contracts 或正式 ADR。Codex 5.6 自测已通过 Document Worker/Core build、
	Document Worker 21 files / 156 tests、Core focused 1 file / 7 tests、Core tool 回归
	3 files / 28 tests、lint + Architecture boundary、offline frozen install、完整
	Workspace 138 files / 920 tests 与三项 smoke；Claude Code 独立 QA 已复跑六项门禁，
	结论 `P0～P3=0`。用户已正式接受并关闭 DTP-2.0。当前 `0.0.0-dtp.2a`
	已完成 DTP-2A Formal Document Tool Registry Registration：Core 冻结三项正式
	Document Tool definition、binding、共享 Document Worker child-process descriptor、
	per-capability input schema 与 output schema，但未接入默认 Agent、Context、Artifact
	或 Desktop UI。Codex 5.6 自测通过 focused 2 files / 12 tests、Core tool 回归
	4 files / 33 tests、Document Worker 21 files / 156 tests、完整 Workspace
	139 files / 925 tests 与三项 smoke；Claude Code 独立 QA 已复跑 focused
	2 files / 16 tests、Document Worker 21 files / 156 tests、Core tool 回归
	4 files / 33 tests、完整 Workspace 139 files / 925 tests 与三项 smoke，
	结论 `P0～P3=0`。用户继续下一步开发，DTP-2A 视为正式关闭。当前
	`0.0.0-dtp.2b` 已完成 DTP-2B Agent / Context / Artifact Semantics：Core
	新增 Document Tool context helper，RuntimeSelection 已选且锁、registry、definition/
	binding/descriptor revision 与 lockDigest 全匹配时才生成文档 Tool candidate；
	Agent loop 请求构建已接入该 helper，非文档工具路径保持不变；Document Tool result
	进入模型消息时只保留 4 KiB bounded preview、metadata count/truncated/resultDigest，
	完整结果继续由既有 artifact/digest 机制引用。Codex 5.6 自测通过 focused/regression
	5 files / 42 tests、Core tool 回归 5 files / 37 tests、Document Worker
	21 files / 156 tests、完整 Workspace 140 files / 929 tests 与三项 smoke。
	Claude Code 独立 QA 已复跑六项门禁，结论 `P0～P3=0`，建议 DTP-2B 关闭。
	用户已正式授权关闭 DTP-2B 并授权 DTP-3A。当前 `0.0.0-dtp.3a` 已完成
	DTP-3A Desktop Document Tool Minimal Product Slice：默认 Desktop runtime 注册三项
	Document Tools，`agent.general` 可见并可锁定 PDF/XLSX/DOCX；Renderer composer
	展示文档工具状态，并在未选择工作目录时禁用发送；SubmitTurn receipt 精确返回三项
	allowedTools 与 workspaceGrantId。Codex 5.6 自测通过 Core/Desktop build、focused
	4 files / 20 tests、Document Worker 21 files / 156 tests、Core tool 回归
	5 files / 37 tests、完整 Workspace 140 files / 930 tests 与三项 smoke。
	Claude Code 独立 QA 已复跑 Core/Desktop/DW build、focused 4 files / 20 tests、
	DW tests 21 files / 156 tests、Core tool 回归 5 files / 37 tests、lint +
	offline install、完整 Workspace 140 files / 930 tests 与三项 smoke，结论
	`P0～P3=0`；用户已正式接受并关闭 DTP-3A。DTP-4 继续 `GATED`。
	随后用户授权 DTP-3B。当前 `0.0.0-dtp.3b` 已完成 Desktop Document Tool
	Interactive Productization：normal Desktop runtime 接通真实 Document Worker Tool
	执行链路；本地 scripted provider 可从 `sample.pdf` 这类明确相对路径生成 Document
	Tool call，Tool result 回到 conversation 后再生成最终 assistant 文本；workspaceRoot
	只在 Core 执行期由 workspace grant 补全，不进入 Desktop projection。Codex 5.6
	自测通过 DTP-3B focused 3 files / 4 tests、核心回归 12 files / 66 tests、
	Document Worker 21 files / 156 tests、Core tool 回归 6 files / 39 tests、
	Desktop tests 19 files / 77 tests、完整 Workspace 142 files / 933 tests 与三项
	smoke。Claude Code 独立 QA 已复跑 Core/Desktop/DW build、DTP-3B focused
	3 files / 4 tests、核心回归 12 files / 66 tests、DW tests 21 files / 156 tests、
	Core tool 回归 6 files / 39 tests、Desktop tests 19 files / 77 tests、lint +
	offline install、完整 Workspace 142 files / 933 tests 与三项 smoke，结论
	`P0～P3=0`；用户已正式接受并关闭 DTP-3B。随后用户授权 DTP-4。当前
	`0.0.0-dtp.4` 已完成 Document Tool packaging/hardening 收口：Document Worker
	入口做 development/packaged resources 候选解析、`realpath` 与 JS module 校验；
	Document Worker/Core child process 使用最小 env，Core child 固定 `execArgv: []`，
	Desktop 停止流程补齐 IPC shutdown → SIGTERM → SIGKILL；新增 `audit:dtp4` 检查
	版本边界、root `tsconfig.json` 四引用、SheetJS CDN integrity、Document Worker dist
	与 parser 体积、canvas 0 实体。Codex 5.6 自测通过 build、lint、DTP-4 focused
	3 files / 17 tests、Document Worker 21 files / 156 tests、Core tool 回归 5 files /
	29 tests、`audit:dtp4`、完整 Workspace 143 files / 938 tests 与三项 smoke。
	Claude Code 独立 QA 已复跑 build、DTP-4 focused 3 files / 17 tests、DW tests
	21 files / 156 tests、Core tool 回归 5 files / 29 tests、lint + `audit:dtp4`、
	完整 Workspace 143 files / 938 tests 与三项 smoke，结论 `P0～P3=0`。开发者
	本机 offline install 残余问题在独立 QA 中未复现：Node 24.13 与 Node 22.22 下
	offline frozen install 均 PASS，`pdfjs-dist` 实体已就位。Claude Code 建议 DTP-4
	关闭，并建议 Document Tool Pack（DTP-0 → DTP-4）整体关闭；用户已正式接受
	DTP-4 复核验收结论，DTP-4 与 Document Tool Pack（DTP-0 → DTP-4）整体
	`PASS/CLOSED`。后续新增格式、写入能力、OS Sandbox 和正式安装包继续独立
	`GATED`。当前 DWE-1 已正式 `PASS/CLOSED`，DWE-2 已完成 XLSX Write Core
	Registration / Effect Integration：Core 正式注册 `tool.document.xlsx.write`，
	model-visible schema 只暴露相对路径、workbook 和 options，write 授权使用
	WorkspaceGrant `create` operation + `routine_file`，执行前由 Core hydrate
	Worker-private `workspaceRoot`，并计算 `requestDigest` 绑定 logical workbook digest；
	Observation/assistant preview 只输出相对路径、digest、大小和计数摘要。Claude Code
	独立 QA 已复跑完整门禁并给出 `PASS（P0=0 / P1=0）`；用户已正式接受并关闭
	DWE-2。DWE-2 关闭时 APV-0、APV-1、overwrite、OS Sandbox 仍为 `GATED`。
	当前 `0.0.0-dwe.3` 已完成 DWE-3：Desktop scripted model 在明确创建语义下可发起
	`tool.document.xlsx.write`，新增真实 Desktop IPC → Core → Document Worker → XLSX
	创建 → Tool Result → final assistant 的 E2E；覆盖 Core close/reopen 后完成态恢复、
	`target_exists` 不覆盖原文件、公式样字符串纯文本 readback，以及 DOCX read Desktop
	回归。Claude Code 独立 QA 已复跑完整门禁并给出 `PASS（P0=0 / P1=0 / P2=0 / P3=0）`；
	用户已正式接受并关闭 DWE-3，DWE 系列（DWE-0 → DWE-3）整体 `PASS/CLOSED`。
	当前 APV-0 已完成 Artifact Preview 开发计划冻结：确认 Artifact Preview 是
	Desktop/Application 能力而不是 model-visible Tool，冻结私有 artifact index /
	preview request / preview result schema 草案、WorkspaceGrant + `realpath`
	权限边界、Renderer 泄漏边界、Markdown sanitizer 边界、HTML local sandbox 边界、
	APV-1.0/1A/1B/1C 分批路线和 QA 矩阵。APV-0 仅修改文档，不写生产预览代码，
	不修改公共 Contracts、Tool Registry、依赖、lockfile 或根 `tsconfig.json`。
	APV-0 独立复核 `PASS（P0=0 / P1=0 / P2=0 / P3=2）`，两项 P3 已在 APV-1.0
	编码前修订并由本批收口。当前 `0.0.0-apv.1.0` 已完成 Artifact Projection
	Foundation：Core Application-private projection 从 durable Task checkpoint 的成功
	Document Tool Observation 生成 artifact index，不新增 IPC route、不修改公共
	Contracts、不注册 `artifact.preview` Tool、不改 Desktop UI 或 Document Worker。新增
	测试覆盖 sessionId 仅为投影上下文、artifactId 不随 session 改变、conversation card /
	artifact panel / task detail 三类未来 surface 复用同一 artifact ref、非文档/失败
	Observation 忽略、危险 relativePath blocked 且不投影被拒路径、metadata 有界。Codex
	5.6 自测通过 build、APV focused 2 files / 11 tests、Core 全量 77 files / 571
	tests、Document Worker 22 files / 168 tests、Desktop 19 files / 78 tests、lint +
	Architecture boundary、offline frozen install、`audit:dtp4` 和完整 Workspace
	146 files / 963 tests + 三项 smoke。Claude Code 独立 QA PASS 后用户正式关闭
	APV-1.0。当前 `0.0.0-apv.1a` 已完成 APV-1A Desktop Artifact Panel
	（metadata-only）：`TaskDetailProjection` 新增 bounded `artifacts`，Core
	`loadTaskDetail` 复用 APV-1.0 projection，Desktop Renderer 展示只读 artifact
	metadata panel；不新增 IPC route、不注册 `artifact.preview`、不打开文件、不实现
	Markdown/Text preview 或 HTML sandbox。当前 `0.0.0-apv.1b` 已实现 APV-1B
	Markdown/Text Preview：Desktop Local `v1alpha1` 新增 bounded artifact preview
	query/result，Core 从 durable successful Document Tool Observation 生成预览，
	Desktop private HTTP/Main IPC/Preload/Renderer 新增 `previewArtifact`，Renderer
	以受限 text block 渲染 Markdown，不使用 `innerHTML`、iframe、webview、preview
	server、文件打开、导航或外部 fetch。当前 `0.0.0-apv.1c` 已实现 APV-1C HTML
	Preview Sandbox：Desktop Local `v1alpha1` 新增 HTML preview session query/close
	command/result，Main-private sandbox server 只绑定 `127.0.0.1` 随机端口和单一 token
	URL，固定 deny-by-default CSP，Renderer 只用空 sandbox iframe + no-referrer 展示；
	不注册 `artifact.preview` Tool，不实现 APV-2 文件打开、生命周期动作、overwrite 或
	OS Sandbox。Claude Code 独立 QA PASS 后用户正式关闭 APV-1C。当前 `0.0.0-apv.2`
	已实现 APV-2 Artifact File Lifecycle Extension：Desktop artifact card 支持
	pin/unpin、dismiss/restore、open location 和 export copy；Renderer/Preload 只传
	`artifactId` 与状态位，Core 私有解析 durable Artifact fact + active WorkspaceGrant，
	Main 侧 realpath containment 后执行打开位置或 no-clobber export。本批不删除源文件、
	不实现 manual artifact registration、overwrite、OS Sandbox、formal installer 或
	`artifact.preview` Tool。Claude Code 独立 QA PASS 后用户正式关闭 APV-2，APV
	系列（APV-0 → APV-2）整体 `PASS/CLOSED`。APV-3.0 Source Delete /
		Deletion Record 计划已通过文档评审并关闭；APV-3A 已正式关闭。当前
		`0.0.0-apv.3b` 已实现 APV-3B source file delete to OS Trash：Renderer
		必须输入 `DELETE <displayName>`，Core 私有解析 durable Artifact fact + active
		WorkspaceGrant，Main 侧 realpath/lstat/stat 守卫后仅调用 `shell.trashItem`。平台
		Trash 不支持、symlink/hardlink、postcondition 不确定均失败关闭且不 commit；不提供永久
			`unlink` 回退，不实现 APV-3C/manual registration/overwrite/OS Sandbox/formal installer。
			当前 DWO-0 XLSX 覆盖写入计划冻结已 `PASS/CLOSED`：接受 advisory lock +
			digest/CAS best-effort 作为 DWO-1 基线，平台特定 atomic compare-and-replace
			helper 后续 hardening 单独评估。当前 `0.0.0-dwo.1` 已实现 DWO-1 Document
			Worker 私有 overwrite foundation：`create_new` 默认兼容，`overwrite_existing`
			必须带私有 `overwrite.confirmedOldSha256`，执行 same-directory lock、旧 digest
			预检、发布前 re-stat/re-hash、atomic `rename` 和 readback 校验；Claude Code
			独立 QA 已 PASS。当前 `0.0.0-dwo.2` 已实现 DWO-2 Core 授权接入：
			`tool.document.xlsx.write` 模型 schema 增加 `mode=create_new|overwrite_existing`，
			Registry 声明 routine/destructive 两类风险，Core 按本次 mode 动态选择风险 facts；
			`create_new` 继续 create + routine 且不需要确认，`overwrite_existing` 走
			modify + destructive，确认 scope 通过私有 action payload 绑定旧文件 SHA-256、
			新 workbook requestDigest、workspaceGrantId、actionId 与 idempotencyKey，确认前不
			派发 Worker，确认后才向 Document Worker v1alpha2 私有协议发送 overwrite。当前
			`0.0.0-dwo.3` 已实现 DWO-3 Desktop overwrite 产品闭环：明确覆盖意图才发送
			`mode=overwrite_existing`，确认卡片显示 destructive/no-undo 文案，Desktop 确认后
			恢复 pending ToolCallBatch 并执行真实 Worker overwrite；确认请求后目标 drift 会使用首次
			确认材料失败关闭，不覆盖漂移文件。
			当前 MAR-0 Manual Artifact Registration 计划已完成 docs-only 冻结：manual
			registration 定义为 Desktop/Application 能力而非 Tool，P0 仅登记已授权 Workspace
			内一个既有普通文件为 metadata-only Artifact；Renderer 不传路径，Desktop Main
			拥有 picker 与文件守卫，Core 拥有 durable registration 与 projection。MAR-0/1.0/1A
			已关闭，MAR-1B 已实现 bounded workspace-file preview 并等待独立 QA；后续
			APV-3C、bulk registration、drag/drop path、OS Sandbox 与 formal installer 继续
			等待单独评审与编码授权。

## 当前开发版本

| 项目 | 当前值 |
| --- | --- |
| 开发版本 | Root：**`0.0.0-eipc.1.1.3.2`**；Contracts：**`0.0.0-eipc.1.1.1`**；Desktop：**`0.0.0-strm.2.3`**；Core：**`0.0.0-eipc.0`**；Document Worker：`0.0.0-pdt.2`；Central：**`0.0.0-arh.3.3.3-repair.1-SNAPSHOT`** |
| Contract Version | Enterprise Identity Composition：`eipc.v1alpha1 AUTHORITY_SEMANTICS_FROZEN`；Desktop Local：`v1alpha1 ACCEPTED`、企业配置状态 `v1alpha2 IMPLEMENTED/QA_PASS`；Enterprise Gateway：`v1alpha1` additive exact Package Read + Model Invocation/Recovery，Model Invocation `v1alpha2` Contract/Conformance Foundation 已实现但 production identity activation 继续 GATED；KAF-4：`v1alpha2`；Conversation/Context/Compaction/Model Protocol：各自 `v1alpha1` |
| 产品与架构基线 | 产品与架构基线 `v1.0`；MVP 功能范围与开发基线 `v1.0` |
| 当前状态 | DFI-4A.0～4A.4.0、EIPC-0、STRM-0～STRM-2、EIPC-1.0/EIPC-1.1.1～EIPC-1.1.3.3 `PASS/CLOSED`；EIPC-1.1 作为默认关闭的 dormant foundation 保留；EIPC-1.2～1.3、EIPC-2～3 为 `DEFERRED / OUT OF CURRENT RELEASE`；当前结论仍为 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`，不宣称 production identity ready；DFI-3A 与 AAPI-0 已进入详细方案文档评审、编码仍 GATED；STRM-3、4A.4.1～4A.4.3、DFI-2B、DFI-3B、TGM、Knowledge Provider 继续独立门禁。ADR-013 Addendum A `ACCEPTED`；DFI-2A 整体、ARH-0～ARH-3 整体保持 `PASS/CLOSED`；`CTR-P3-001` 独立跟踪 |
| 最新开发记录 | [Development Log：EIPC dormant foundation 收口与 MVP 接口优先级调整](./docs/development/DEVELOPMENT-LOG.md) |
| Node/Desktop 完整自测 | `pnpm install --frozen-lockfile && pnpm run clean && pnpm run check` |
| Central 完整自测 | Java 21 环境执行 `pnpm run check:central`，或统一执行 `pnpm run check:foundation` |
| CGF-1.2C 跨语言 E2E | Java 21 环境执行 `pnpm run check:cgf12c:e2e` |
| CGF-1.3C 恢复 Harness | Node 24 环境执行 `pnpm run harness:cgf13c` |
| ADR17-I1 Batch Persistence Harness | Node 24 环境执行 `pnpm run harness:adr17i1`；覆盖内存/SQLite 同一 Conformance、Transaction A/C、迁移和旧 Conversation 回归 |
| ADR17-I2 Batch Runtime Harness | Node 24 环境执行 `pnpm run harness:adr17i2`；覆盖串行分发、取消、确认 allow/reject、Effect 重联、Retry Run 隔离、Provider Message 完整性与 SQLite 恢复 |
| ADR17-I3 Unified Recovery Harness | Node 24 环境执行 `pnpm run harness:adr17i3`；实际重跑 ADR-017 §11 的 18 项取消、确认、事务、Effect、Retry、Provider History、双 Adapter、SQLite 并发恢复与敏感内容扫描矩阵 |
| ARH-1 Provider Stream Conformance | Node 24 环境执行 `pnpm run harness:arh1`；覆盖 Provider stream 顺序、Tool Call/usage identity、取消迟到事件、非法流不得制造 completed Assistant Message，并配合 Central online/offline 门禁验证双协议 Adapter |
| ARH-2.2 Production Compaction Orchestration | Node 24 环境执行 `pnpm run harness:arh2.2`；覆盖 Context assessment、purpose-bound admission、Compaction provenance、专用 invocation link、Model-backed summarizer、SQLite migration 19 与精确恢复绑定 |
| ARH-2.3 Recovery Closure Harness | Node 24 环境执行 `pnpm run harness:arh2.3`；真实执行 W1～W7、首次/rolling Compaction、50-round Durable Tool Loop、三次 semantic seed、资源归零和四通道泄漏扫描 |
| ARH-3.2.1 Contract/Session Scope Foundation | Node 24 / Java 21 环境串行执行 `pnpm run harness:arh3.2.1`、`pnpm run check`、`pnpm run check:central`、`pnpm run check:central:offline`；覆盖 v1alpha2 跨语言 Contract、Core migration 21、exact Session opaque scope、C1/C2 恢复与 activation fail-closed |
| ARH-3.2.2 Durable Cache Planner | Node 24 / Java 21 环境串行执行 `pnpm run harness:arh3.2.2`（9 classes / 66 tests）、`pnpm run check`（163 files / 1132 tests + 3 smoke）、Central online/offline（各 275 tests）；覆盖 v0009、四层 cache identity、Transaction A/B、C3～C7 与双 JVM takeover，且 Provider projection 保持 disabled |
| ARH-3.2.3 Provider Cache Projection Closure | Node 24 / Java 21 环境串行执行 `pnpm run harness:arh3.2.3`（10 classes / 93 tests）、`pnpm run check`（163 files / 1132 tests + 3 smoke）、Central online/offline（各 297 tests）；覆盖 typed projection、双协议 canonical wire、C8～C10、durable Usage、拒绝/取消/deadline、泄漏与资源归零 |
| EIPC-0 Authority Semantics Foundation | Node 24 / Java 21 环境串行执行 `pnpm run harness:eipc0`（Node 5 files / 40 tests + Java 1 class）、`pnpm run check`（229 files / 1522 tests + 3 smoke）、Central online/offline（各 307 tests）；唯一结论为 `AUTHORITY_SEMANTICS_FROZEN`，`productionIdentityReady=false` |
| STRM-0 Sensitive Transport Decision Spike | Node 24 / Electron 43 环境串行执行 `pnpm run harness:strm0`；覆盖 14 次真实 Electron 进程、12 个唯一场景、3 次双向 roundtrip、四通道 80 次负向泄漏注入和八类资源归零；输出 `ROUTE_A_ACCEPTABLE`，但 `productionSensitiveTransportReady=false`、blocker 保留 |
| CGF-2C.1 Model Foundation Harness | Node 24 / Java 21 环境执行 `pnpm run harness:cgf2c1`；覆盖 Model 外发确认、provenance、L1/L2/L3、HTTP/SSE、Headless durable Assistant Message、ADR-017 Tool Call 链与泄漏扫描 |
| CGF-2B.2 真实厂商直连 Harness | Node 24 / Java 21 环境执行 `pnpm run check:cgf2b2:direct-provider`；无获准资源时返回 `RESOURCE_GATED` |
| CGF-2B.3.1 Custom Relay Harness | Node 24 / Java 21 环境执行 `pnpm run check:cgf2b3:custom-relay`；公网中转站证据与企业内网 Relay 验收分开记录，无获准资源时返回 `RESOURCE_GATED` 且零网络调用 |
| CGF-2B.3.2 双 JVM Relay Recovery Harness | Node 24 / Java 21 / Docker 环境执行 `pnpm run check:cgf2b3:dual-node-relay`；只访问测试专用 loopback Relay，不需要真实 Key、外网或调用费用 |
| CGF-2B.3.3 安全与资源关闭 Harness | Node 24 / Java 21 / Docker 环境执行 `pnpm run check:cgf2b3:closure`；实际重跑 F1～F10、双协议负向矩阵、五轮 Central/Relay 生命周期及泄漏扫描，并强制真实 Provider 保持 `RESOURCE_GATED` |
| DCF-2C 恢复 Harness | Node 24 环境执行 `pnpm run harness:dcf2c` |
| DCF-2C 隔离用户演示 | Node 24 环境执行 `pnpm run demo:dcf2c`，步骤见[用户现场体验指南](./docs/development/DCF-2C-USER-DEMO-GUIDE.md) |

每一批有效代码开发都必须升级开发版本并追加开发日志；`CHANGELOG` 只保留高层摘要，不替代逐批验证记录。

已经确认的方向包括：

- 采用能力平台化设计，但研发以最小通用垂直任务链路推进，避免过早建设大型平台；
- 业务场景和具体软件能力不进入 RoboThree Core；
- 标准场景由 Agent、Skill、Tool 和 Knowledge 声明式组合，Task Template 后置到 P1；
- Tool 是唯一原子执行能力类型，MCP 是 Tool 的实现来源之一，不与 Tool 并列；
- 开放任务只在用户选择、默认 Agent、Agent 固定依赖和管理员开放的通用 Tool/Knowledge 边界内选择，不建设全局能力搜索、评分或智能路由平台；
- 第一版定义开放且版本化的 Contract，但只支持官方和企业内部可信扩展；
- 可执行扩展不在 Core 中未经审核地热加载，优先在独立 Worker、Sandbox、MCP Server 或远程服务中运行；
- MVP 只建设固定用户权限、Workspace 边界、Tool 风险和 Desktop 用户确认，不建设完整 Policy 系统或运行时企业审批；
- 普通已授权文件创建和修改不重复确认，外部调用按任务、目标与数据范围确认，范围变化时重新确认；
- Agent/Skill 以完整、固定、不可变能力包提交发布审核，不建设独立测试报告系统；
- Central Enterprise Service 与 Admin API 后端沿用公司 Java 技术栈并按中等投入规划，本地 Agent Runtime / Local Core 继续采用 Node.js；两侧通过版本化、语言无关 Contract 通信。
- 每个 Agent 必须有 defaultModel；`allowModelOverride` 只允许用户为单个 Task 显式选择其他合法 Model，Local Core 负责校验和锁定，Central Gateway 不参与自动选模；
- 企业配置的 Storage Activation 与 Runtime Registry Activation 分离；当前冻结 RegistrySnapshot 不因同步热替换。

完整阶段共识见 [RoboThree 关键节点记录](./docs/architecture/KEY-NODES.md)。

## 目录

- `apps/desktop`：Electron 桌面客户端。
- `services/core`：通用 Agent Runtime 与本地 API；不承载具体业务场景。
- `packages/contracts`：Core、Desktop、Worker、企业控制面和扩展共同依赖的版本化协议与共享类型。
- `contracts/enterprise-gateway`：Enterprise Gateway 跨语言唯一 canonical OpenAPI/JSON Schema/Fixture。
- `docs/product`：产品定位、范围、用户流程和验收标准。
- `docs/architecture`：关键节点、系统架构、模块边界、运行时流程和安全模型。
- `docs/development`：每批代码的开发版本、自测证据、已知缺口和独立 QA 报告。
- `docs/adr`：重要、长期且难以回退的技术决策。
- `scripts`：开发和构建脚本。
- `tests/e2e`：跨模块端到端测试。

当前只建立最小 Monorepo 边界；新应用、服务和公共包只在真实需求出现并经过确认后创建。

## 工程清理与源码交付

日常开发目录允许保留已安装依赖；交付给其他研发人员时，不应直接压缩当前
`RoboThree_workspace`。使用以下两个受限入口：

```bash
# 删除固定、可重建的 TypeScript/Electron 构建物、tsbuildinfo 和 Central target
pnpm run clean

# 不改动当前开发目录，生成源码归档和 SHA-256 校验文件
pnpm run package:source
```

`pnpm run clean` 不删除 `node_modules`、源码、正式文档、`docs/development/qa`
或 `qa-reports`。`pnpm run package:source` 默认输出到工作区外的
`../deliverables/`，归档中包含源码、测试、Contract、migration、Maven Wrapper、
锁文件、正式文档与正式 QA 报告；排除以下内容：

- `node_modules`、`dist`、`target`、`coverage` 等依赖与构建产物；
- 临时 `qa-reports`、日志、`*.tsbuildinfo` 和操作系统/编辑器元数据；
- `.env`、`.npmrc`、私钥/证书容器和运行时 SQLite/DB 文件；
- `.env.example` 作为无密钥配置示例保留。

每个归档内含 `SOURCE-MANIFEST.json`，逐文件记录字节数和 SHA-256；归档旁另有
同名 `.sha256` 文件。接收方解压后，应使用项目声明的 Node 24、pnpm 11 和
Java 21，执行 `pnpm install --frozen-lockfile` 重建本地依赖。需要自定义输出目录
时可执行：

```bash
pnpm run package:source -- --output-dir /absolute/path/outside/RoboThree_workspace
```

交付脚本拒绝把输出写入 `RoboThree_workspace` 内部，并拒绝打包任何未排除的
符号链接，避免递归归档或意外带出工作区外文件。当前阶段不迁移 pnpm virtual
store 或 Maven build directory，以保持现有开发和构建路径不变。

## 文档与决策入口

| 文档 | 用途 |
| --- | --- |
| [MVP 功能范围与开发基线 v1.0](./docs/product/ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md) | 已冻结的 MVP P0/P1 范围、客户端与管理端功能、阶段边界、开发优先级和验收结果 |
| [产品与架构基线 v1.0](./docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md) | 产品定位、核心概念、MVP 范围、场景边界与关键技术约束的基线文档 |
| [关键节点记录](./docs/architecture/KEY-NODES.md) | 按阶段记录已经确认、会约束后续设计和实现的共识 |
| [Architecture](./docs/architecture/README.md) | 系统架构、模块边界、运行时和安全文档入口 |
| [Product](./docs/product/README.md) | 产品目标、范围、用户流程和验收标准入口 |
| [ADR](./docs/adr/README.md) | 记录重要且难以回退的技术决策 |
| [研究借鉴映射](./docs/architecture/RESEARCH-ADOPTION-MAP.md) | 记录从各开源 Agent 采用、适配、后置或拒绝的架构模式 |
| [Kernel Alpha 方案](./docs/architecture/KERNEL-ALPHA-PLAN.md) | 通用内核开发范围、运行链路和验收门槛 |
| [KA-0 开发计划](./docs/architecture/KA-0-DEVELOPMENT-PLAN.md) | Framework First 阶段、代码边界、性能目标、扩展性与验收门槛 |
| [KAF-2 开发计划](./docs/architecture/KAF-2-DEVELOPMENT-PLAN.md) | Event、Persistence、幂等、Checkpoint、Outbox 与恢复的分批实现计划 |
| [KAF-3 开发计划](./docs/architecture/KAF-3-DEVELOPMENT-PLAN.md) | Capability、不可变 Registry、类型化 Adapter Port、Task Capability Lock 与进程外 Echo 验收计划 |
| [DCF-1.3 开发计划](./docs/architecture/DCF-1.3-DEVELOPMENT-PLAN.md) | Desktop/Core restart/recovery、SSE 背压、资源回收、运行代生命周期与长稳 Harness 的三批计划 |
| [KAF-4 开发计划](./docs/architecture/KAF-4-DEVELOPMENT-PLAN.md) | 固定授权、持久用户确认、有界并发、背压、重试、性能与可靠性的三批实现计划 |
| [ADR-010（ACCEPTED）](./docs/adr/010-session-context-compaction-and-memory-boundary.md) | 已冻结 Session、Context Assembly、Compaction 与长期 Memory 边界 |
| [KAF-5 开发计划（CLOSED）](./docs/architecture/KAF-5-DEVELOPMENT-PLAN.md) | Context/Compaction 与 Headless Agent Framework 冻结计划及阶段验收结论 |
| [Desktop/Central Foundation 架构收口基线](./docs/architecture/DESKTOP-CENTRAL-FOUNDATION-ARCHITECTURE-BASELINE.md) | KN-025 后四项方案状态、对象所有权、问题映射和解阻塞门槛 |
| [Desktop Client Foundation 计划](./docs/architecture/DESKTOP-CLIENT-FOUNDATION-DEVELOPMENT-PLAN.md) | DCF-0～DCF-3、安全桌面边界、Skill Runtime 和 E2E 门槛 |
| [DCF-1.2 开发计划（CONFIRMED_WITH_SPECIFIED_REVISIONS）](./docs/architecture/DCF-1.2-DEVELOPMENT-PLAN.md) | 正式 Core 私有 HTTP/SSE、Application Facade、Main Client、Preload 白名单、最小工作台与 streaming/reconnect 三批详细计划；1.2A 已解锁 |
| [DCF-2 开发计划（CONFIRMED_WITH_SPECIFIED_REVISIONS）](./docs/architecture/DCF-2-DEVELOPMENT-PLAN.md) | Task/Tool Activity Projection、用户确认、Task Control、恢复矩阵和 DCF-2.0/A/B/C 门槛；DCF-2B 已关闭，DCF-2C 技术 QA 已接受并等待用户现场体验 |
| [Central Gateway Foundation 计划](./docs/architecture/CENTRAL-GATEWAY-FOUNDATION-DEVELOPMENT-PLAN.md) | CGF-0～CGF-3、物化企业配置、Model/Tool Gateway 与离线门槛 |
| [DCF-1 Contract/Threat Model/Conformance（CONFIRMED_WITH_SPECIFIED_REVISIONS）](./docs/architecture/DCF-1-CONTRACT-THREAT-MODEL-AND-CONFORMANCE-PLAN.md) | DCF-1 正式 Contract、localhost 威胁模型、submitTurn、streaming/recovery 与四批门槛 |
| [CGF-1 Infrastructure/Identity/Conformance（CONFIRMED_WITH_SPECIFIED_REVISIONS）](./docs/architecture/CGF-1-INFRASTRUCTURE-IDENTITY-AND-CONFORMANCE-PLAN.md) | CGF-1 数据库、身份 Bootstrap、跨语言 Schema、配置物化/激活与四批门槛 |
| [CGF-1.1 开发计划（CLOSED）](./docs/architecture/CGF-1.1-DEVELOPMENT-PLAN.md) | PostgreSQL/Flyway、Identity、Challenge/Proof、Device Trust、Token、Configuration Read 和恢复矩阵四检查点均已独立 QA `PASS/CLOSED` |
| [CGF-1.2 开发计划（CLOSED）](./docs/architecture/CGF-1.2-DEVELOPMENT-PLAN.md) | exact Package read、Token 生命周期、Local Core 独立 SQLite 配置物化/Storage Activation、状态 Projection 与跨语言恢复矩阵；1.2A～1.2C 已全部关闭 |
| [Desktop Local Runtime Contract v1alpha2 Proposal](./docs/architecture/contracts/DESKTOP-LOCAL-RUNTIME-CONTRACT-v1alpha2-PROPOSAL.md) | 企业配置同步/激活 Projection、durable Event 和 v1alpha1 pending boolean 派生兼容规则 |
| [MVP 离线语义修订项 001](./docs/product/MVP-BASELINE-REVISION-ITEM-001-ENTERPRISE-OFFLINE-SEMANTICS.md) | 追踪旧缓存执行表述与 ADR-014 严格企业会话规则的文档一致性修订 |
| [ADR-014（ACCEPTED）](./docs/adr/014-enterprise-client-identity-and-credential-bootstrap.md) | OA 企业身份、Managed Device Trust、不可导出 Device Signer、短期 Token 与企业/个人 Credential 强隔离 |
| [ADR-016（ACCEPTED）](./docs/adr/016-central-java-engineering-baseline.md) | 公司 Central Java 目标基线、MyBatis-Plus/版本化 SQL/CAS/Tracing/Thin Controller/无状态集群边界，以及 Alignment-1/2 后重新对齐 CGF-2 的顺序 |
| [Central Java Alignment-1 开发计划（CLOSED）](./docs/architecture/CENTRAL-JAVA-ALIGNMENT-1-DEVELOPMENT-PLAN.md) | 低风险工程规范对齐，1A HTTP/Lombok/Exception/Controller 与 1B Tracing/Redaction/Regression 均已独立 QA 并由用户接受关闭 |
| [Central Java Alignment-2A 开发计划（REVISED）](./docs/architecture/CENTRAL-JAVA-ALIGNMENT-2A-DEVELOPMENT-PLAN.md) | MyBatis-Plus Adapter、版本化 SQL Script、Flyway V1～V5 Bridge、只读 Preflight 与生产持久化切换三批方案；已吸收 Claude 首轮 P2/P3，等待复核 |
| [Desktop Local Runtime Contract（ACCEPTED）](./docs/architecture/contracts/DESKTOP-LOCAL-RUNTIME-CONTRACT-v1alpha1.md) | Electron Main 与 Local Core 的本地命令、事件和安全边界 |
| [Enterprise Gateway Contract（ACCEPTED）](./docs/architecture/contracts/ENTERPRISE-GATEWAY-CONTRACT-v1alpha1.md) | Node Local Core 与 Java Central Service 的跨语言边界 |
| [上游借鉴登记表](./docs/architecture/UPSTREAM-ADOPTION-REGISTER.md) | 记录每个模块参考谁、借鉴什么、复用方式和不照搬原因 |
| [开发记录](./docs/development/DEVELOPMENT-LOG.md) | 按开发版本记录每批代码范围、上游来源、自测结果、缺口和 QA 状态 |
| [CHANGELOG](./CHANGELOG.md) | Codex、Claude Code 和人工开发者共享的重要改动摘要 |

### 关键节点与 ADR 的区别

- **关键节点**记录一个阶段已经形成的产品与架构共识，也可以列出尚未解决的问题；
- **ADR**记录一个具体、长期且难以回退的技术选择，包括上下文、备选方案和后果；
- 关键节点不会替代 ADR。关键节点确认的内容在进入具体技术选择时仍需按需建立 ADR。

关键节点按 `KN-NNN` 编号顺序追加。后续决策发生变化时保留历史，通过新的关键节点标记替代关系，不静默覆盖旧结论。

## 下一阶段

当前按 `Kernel Framework First，Chat Last` 推进：

1. KAF-0：工程与边界基线；
2. KAF-1：Runtime Kernel；
3. KAF-2：Event、Persistence 与恢复；
4. KAF-3：Capability 与 Adapter；
5. KAF-4：固定授权、用户确认、并发、可靠性与性能；
6. KAF-5：Headless Framework 验收；
7. KAF-5 独立 QA `PASS` 后并行建设 Desktop Client 与 Central Service Gateway；KN-026 已打开 DCF-0/CGF-0，后续正式业务功能按批次 Contract/Conformance 门槛逐步解锁；
8. Gateway 基础稳定后建设精简 Admin Console；
9. Core、Desktop、Central 基础稳定后接入 Agent/Skill 发布闭环。

KAF-5、DCF-0、CGF-0 与 Java Toolchain 均已关闭；DCF-1.0/CGF-1.0、
DCF-1.1A～1.1C、CGF-1.1 和 CGF-1.2 均已通过各自独立 QA 并关闭。
DCF-1.2A～1.2C、DCF-1.2、DCF-1.3A～1.3C 和 DCF-1.3 均已通过独立 QA
并由用户接受关闭。企业离线四状态修订和 CGF-1.3 方案已经确认，P1/P2 文档
门槛已经关闭。CGF-1.3A、CGF-1.3B 已通过独立 QA 并由用户接受关闭；
CGF-1.3C 已通过独立 QA并由用户接受；CGF-1.3 阶段正式关闭，下一阶段
继续 GATED。

## Codex 与 Claude Code 协作

工程根目录的 [`CHANGELOG.md`](./CHANGELOG.md) 是双方共用的高层改动摘要；[`DEVELOPMENT-LOG.md`](./docs/development/DEVELOPMENT-LOG.md) 是逐批代码与验证记录。两者都需要维护，Git 历史仍保留完整修改细节。

协作流程：

1. 开始任务前阅读 `CHANGELOG.md` 的 `Unreleased` 和最新开发版本记录。
2. 修改有效代码、Contract、依赖、构建、安全或测试基线时升级开发版本，并在 `DEVELOPMENT-LOG.md` 追加完整记录。
3. 完成一个逻辑改动并验证后，在交付前更新 `Unreleased` 的高层摘要。
4. Claude Code 独立 QA 保存到 `docs/development/qa/`，并回链对应开发版本，不覆盖原自测结果。
5. 正式发版时，将 `Unreleased` 内容归档到带日期的版本标题，并重新建立空的 `Unreleased` 分类。

根目录的 [`AGENTS.md`](./AGENTS.md) 和 [`CLAUDE.md`](./CLAUDE.md) 分别作为 Codex 与 Claude Code 的自动入口，把上述规则应用到后续开发任务。
