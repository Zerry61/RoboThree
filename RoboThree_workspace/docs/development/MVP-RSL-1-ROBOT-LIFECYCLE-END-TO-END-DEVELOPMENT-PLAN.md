# MVP-RSL-1 Robot Lifecycle End-to-End 详细实施方案

> 日期：2026-08-30  
> 状态：`REVISION 2 / PLAN PASS/CLOSED / CODING AUTHORIZED / IMPLEMENTATION IN PROGRESS`  
> 目标版本：`0.0.0-mvp.rsl.1`  
> 性质：面向 PRD 的前后端垂直产品批，不是 Agent Foundation、通用编排平台或治理扩建  
> 编码授权：无；本方案通过独立文档评审并获得用户单独授权前，不得编码

---

## Revision 1 聚焦精度收口

Revision 1 吸收独立文档复核的 3 项 P2 与 3 项 P3，不改变用户流程、Contract 数量、业务范围或估算：

1. Central migration 精确固定为 `U0012__agent_lifecycle_from_v0011.sql`，并要求同时证明 Central Flyway
   与 Core SQLite migration 是两个物理隔离的 counter；
2. 头像上传收缩为 JDK 原生可安全解码的 PNG/JPEG，不新增 WebP 依赖；增加文件、尺寸与像素上限；
3. 泄漏验证只检查目标 Token 与明确 canary，不执行或落盘完整 `env` 输出；
4. Agent Token 在 Desktop Main 从 `process.env` 一次性读取后立即删除原始环境字段；Main supervisor 仅以可清零
   `Buffer` 保存 private restart lease，每次 spawn 只构造临时 child env 并在 `fork` 返回后立即删除目标字段；Core
   Provider 读取后删除子进程环境字段并只保留 immutable in-memory lease；应用退出时 Main 必须 `fill(0)`；
5. Preload 明确只 additive 新增 7 个方法，既有 Desktop API 修改数、删除数均为 0；
6. `agent.general` 是 exact reserved ID，create/update/submit/approve 均 fail-closed 为
   `agentlifecycle.robot_id_reserved`。

7. Central schema v12 按同一 schema version 的完整 deployment set 落地：fresh baseline
   `B0012__agent_lifecycle.sql`、upgrade `U0012__agent_lifecycle_from_v0011.sql`、canonical manifest/sidecar 与
   对应 classpath resources；这不是两个 migration，Core SQLite migration 继续止 26。

以上精度项已由用户接受；RSL-1 已获得单独编码授权。

---

## 0. 结论与控制边界

### 0.1 本批只关闭一条真实用户链

本批必须让一个有创建权限的普通 Desktop 用户完成：

```text
创建个人机器人草稿
→ 保存形成 immutable draft revision
→ 用该 exact saved revision 发起真实测试 Task
→ 当前 revision 测试通过
→ 形成不可编辑 Agent Package 并提交
→ Admin 查看不可编辑审核版本并通过或拒绝
→ 通过后形成 immutable enterprise published revision
→ Desktop Robot Catalog 看见发布版本
→ 新 Task 锁定并真实消费该 exact Agent revision
→ Core 重启后 Task lock 与 published revision 不漂移
```

最高输出只能是：

```text
MVP_RSL1_ROBOT_LIFECYCLE_E2E_CONFORMANT
```

该输出不代表 production ready，也不代表 production identity、SSO、RBAC、Skill Lifecycle、TGM、
Knowledge Provider、Personal Model 或 Agent Lifecycle 通用平台 ready。

### 0.2 这是产品接口接通，不是继续造底座

现有以下能力必须直接复用：

- `AgentDefinitionRevisionV1Alpha2` 的 exact revision/digest 与四类 restriction；
- Runtime Selection、Entitlement、Capability Lock、Instruction Bundle Compiler；
- 真实 Model Gateway、Agent Loop、Task/Session/Message/Artifact 持久化与恢复；
- Desktop v1alpha2 Robot Catalog 查询与 Workbench Agent 选择；
- Admin Browser Security、Admin Adapter、Central PostgreSQL 与配置审计模式；
- VS1～VS3 已关闭的真实模型、Tool、Artifact、重启恢复路径。

本批不得另建第二套 Task、Agent Loop、Runtime Selection、Entitlement、审核引擎、测试报告系统或
Catalog。

### 0.3 首批明确收缩

RSL-1 优先关闭“Desktop 个人草稿 → Admin 审核 → 企业发布 → Desktop 消费”。以下 PRD 项仍属于机器人产品线，
但不阻塞本批首个垂直闭环，必须另立紧随其后的增量计划：

- Admin 从空白创建、编辑和测试企业机器人草稿；
- 已发布机器人派生新草稿后的完整更新发布体验；
- 已发布机器人的普通下架操作；
- Skill 创建、包上传、安装、测试、审核和发布。

不允许为覆盖上述后续能力而在 RSL-1 预建通用 API、空页面或无消费者 Contract。

---

## 1. 权威需求与当前事实

### 1.1 PRD 冻结语义

RSL-1 必须遵守：

1. 保存草稿只要求名称；简介、行为与规则可以暂缺并提示“发布前补充”；
2. 测试和提交发布要求名称、简介、行为与规则完整；
3. 测试只运行已保存的 exact revision，未保存修改不能沿用旧测试结果；
4. 模型限制开启但没有实际可用模型时，禁止测试、发布和开始任务；
5. Skill、Tool、Knowledge 限制开启且允许列表为空，表示明确禁用该类资源，不是表单错误；
6. restriction 关闭时保留草稿选择但不生效，再次开启时恢复；
7. 头像和标签只属于展示信息，不进入 Agent 指令正文或 instruction digest；
8. 提交对象是完整、固定、不可编辑的 Agent Package；
9. 测试过程与测试结果不进入发布包，不建设测试报告查询系统或自动评分；
10. 用户提交版本由 Admin 通过或拒绝，拒绝必须有原因；通过后才成为企业可用 Agent；
11. 发布后新任务锁定 exact revision；停用或依赖失效不能静默替换或扩大权限；
12. Core 内置 `agent.general` 不可编辑，不进入普通机器人发布和管理流程。

### 1.2 已有可复用事实

- Desktop 已有真实 Robot Catalog list/detail 与 Workbench selection；
- `IntelligenceCreationPage.vue` 已有头像、名称、标签、简介、行为与规则及四类 restriction 原型，但保存、测试、
  发布仍禁用；
- Admin 已有 Robot list/detail 只读 Adapter 和页面，但没有 Robot mutation/review 方法；
- Core 已有 managed `AgentDefinitionRevisionV1Alpha2`、四类 restriction schema、instruction digest、Task lock 和
  恢复链；
- Central 已有 internal-trial Admin Model 写链、PostgreSQL revision/current-pointer、command receipt、审计和
  exact expected revision 模式，可复用实现形态但不可复制成 generic dispatcher；
- 目前没有 Agent Lifecycle source of truth、草稿 revision、测试绑定、审核 submission 或 published release 写链。

### 1.3 必须诚实保留的限制

- production identity/SSO/RBAC 仍未实现；RSL-1 只允许 internal-trial exact actor；
- Skill Lifecycle 尚未实现，因此个人/local Skill 可以用于创建者测试，但不能自动成为企业发布引用；
- Knowledge Provider 仍 GATED，非空 Knowledge allowlist 不能伪造可发布；
- 只有当前真实可发现、可引用且带 exact revision 的 Model/Tool/企业资源才能进入发布包；
- 没有真实资源时页面必须显示不可用原因，不能用 Fixture 或静态选项冒充。

---

## 2. 用户、业务对象与状态

### 2.1 参与者

| 参与者 | 本批动作 | 身份边界 |
| --- | --- | --- |
| Desktop 创建者 | 创建、编辑、保存、测试、提交、撤回、查看审核结果 | internal-trial creator subject；不能自报 creator ID |
| Admin 审核者 | 查看审核队列和不可编辑包、通过、拒绝 | 复用 Admin internal-trial Principal；不能修改提交包 |
| Core | 安全 BFF、exact revision 测试执行、发布 Catalog/Runtime 消费 | 不成为草稿 source of truth |
| Central | 草稿、revision、test fact、submission、published release 的唯一 source of truth | PostgreSQL durable authority |
| Desktop 普通用户 | 从 Catalog 选择 published robot 并创建真实 Task | 只能消费可见且 runnable 的 published revision |

### 2.2 单一生命周期语义

本批不是“一张万能状态表”，而是四个互相关联、各自单一职责的事实：

```text
RobotDraft          editable current pointer
RobotDraftRevision  immutable saved material
RobotTestFact       current saved revision 的 content-free test result
RobotSubmission     immutable review package
RobotRelease        immutable enterprise published revision
```

状态固定为：

- Draft：`editable`；
- Test：`untested | running | passed | failed | stale`；
- Submission：`pending_review | approved | rejected | withdrawn`；
- Release：本批只创建 `published`，普通下架留到后续增量。

约束：

- 每次成功保存都创建新的 immutable draft revision，并原子推进 current pointer；
- revision 改变后旧 test fact 显示为 `stale`，不能提交；
- 同一 robot 同时最多一个 `pending_review` submission；
- pending submission 保持 immutable；创建者若继续编辑，只产生更新的 draft revision，不改写待审包；
- 审核通过必须原子写入 `approved` 与一个 immutable release；
- 审核拒绝必须保存安全、非敏感的 rejection reason；
- published release 永不被后续草稿原地覆盖。

### 2.3 Agent Package 最小固定内容

提交包必须包含：

- `robotId`、`draftRevision`、`packageRevision`、`packageDigest`；
- 创建者受控 subject 引用、来源 `personal_draft`；
- 名称、简介、行为与规则；
- 头像安全引用、标签；
- 四类 restriction 的开关状态、实际生效列表及 exact resource revision；
- 由现有 compiler 生成的 exact `AgentDefinitionRevisionV1Alpha2`；
- 所需权限摘要、发布范围、语义版本和变更说明；
- `createdAt`、`submittedAt`。

禁止进入包：

- 测试输入、测试输出、测试报告、模型思考过程；
- Credential、Bearer、Endpoint Secret、环境变量；
- Workspace 真实绝对路径、Task 正文、用户文件正文；
- PID、端口、SQLite 路径、临时目录或其他基础设施事实。

---

## 3. Contract 与接口方案

### 3.1 一个 consumer-driven additive Contract

新增唯一 package subpath：

```text
@robothree/contracts/agent-lifecycle/v1alpha1
```

它只承载 RSL-1 真实消费者需要的 strict schema：

- draft create/update/list/detail；
- test start/status；
- submission create/withdraw/status；
- Admin review list/detail/approve/reject；
- published release safe projection；
- typed safe error 与 command receipt。

不得修改 frozen：

- `admin-control/v1alpha1`；
- `admin-control/v1alpha2`；
- `desktop-local/v1alpha2` Robot Catalog；
- `runtime-selection/agent-definition/v1alpha2`。

不得创建 generic `dispatchAgentCommand(type, payload)`；每个跨边界操作必须有 exact method 和 exact schema。

### 3.2 Desktop safe API

Preload 暴露冻结对象 `window.robothreeRobotLifecycleV1Alpha1`，仅包含：

```text
listMyRobotDrafts
getMyRobotDraft
createRobotDraft
updateRobotDraft
startRobotDraftTest
submitRobotDraft
withdrawRobotSubmission
```

这 7 个方法全部为 additive 新增；既有 Preload/Desktop API method 修改数必须为 0、删除数必须为 0。Preload
构建产物和类型声明必须同步生成，不能只改 Renderer ambient type 或测试 Fixture。

Main/Core private routes一一对应。Renderer 不接触 Central URL、Bearer、creator subject、数据库 revision material、
Workspace 绝对路径或 raw Agent Definition。

### 3.3 Admin Adapter

`AdminAdapter` additive 增加：

```text
listRobotReviews
getRobotReview
approveRobotReview
rejectRobotReview
```

页面不得直接 `fetch`。真实 Adapter 继续只在受控 integration/internal-trial entry 安装，production identity 未就绪时
保持 unavailable/fail-closed。

### 3.4 Internal-trial actor token

Desktop creator 写链不得复用仅允许 `model.use` 的 VS1 Token，也不得扩大其冻结 permissions。新增独立、一次性环境输入：

```text
ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN
```

要求：

- exact audience = `enterprise-agent-lifecycle`；
- exact permission = `["agent.manage"]`；
- Desktop Main 从 `process.env` 一次性读取后立即删除目标字段，只以可清零 `Buffer` 保存 private restart lease；
- 每次 Core spawn 只临时构造 child env，`fork` 返回后立即删除目标字段；应用退出时 Main 将 lease `fill(0)`；
- Core Provider 从 `process.env` 读取后立即执行目标字段删除，再验证 token 并只保留 immutable in-memory lease；
- 只在 Desktop Main supervisor 与 Core 私有内存持有，不续签；
- 缺失、过期、issuer/audience/permission 不符全部 fail-closed；
- 不进入 Renderer、Preload payload、IPC、SQLite、日志、Evidence 或 Artifact。

这只关闭 internal-trial MVP，不宣称 production identity/RBAC ready。

---

## 4. Central 持久化与业务服务

### 4.1 PostgreSQL additive migration

Central schema v12 只服务 RSL-1，并必须按仓库既有部署规范形成同一版本集合：

- fresh baseline：`B0012__agent_lifecycle.sql`；
- v0011 upgrade：`U0012__agent_lifecycle_from_v0011.sql`；
- canonical `postgresql-v0012.json` manifest、SHA-256 sidecar 与对应 classpath resources。

该集合共同表达一个 Central schema version 0012，不得误记为两个 migration。新增表只包括：

- `robot_draft`：当前 pointer、creator subject、当前状态；
- `robot_draft_revision`：immutable JSON material + record digest；
- `robot_test_fact`：revision-bound content-free result；
- `robot_submission`：immutable package、review state、review reason；
- `robot_release`：immutable published package 与 Agent Definition；
- `robot_avatar_asset`：可选、受限的头像二进制及 digest。

不得新增 Core/Desktop migration，不创建通用 package registry、workflow engine 或 blob platform。

迁移门禁必须同时给出两套物理 counter：

- Central PostgreSQL `flyway_schema_history` 最新成功 version 为 `0012`，script 为
  `U0012__agent_lifecycle_from_v0011.sql`；
- Core SQLite migration registry 末项仍为 `id = 26`；
- 两者分别来自 Central PostgreSQL/Flyway 与 Core SQLite registry，不共享表、文件或计数器。

### 4.2 command 纪律

所有写命令必须具有：

- client-generated `commandId` 与 `correlationId`；
- expected current revision；
- command digest 与 idempotent receipt；
- 单事务写 revision、current pointer、audit；
- revision conflict typed fail，不静默覆盖；
- 服务重启后相同 commandId 返回同一 receipt。

### 4.3 头像

本批支持 PRD 要求的系统默认、平台预设与用户上传：

- 系统/预设头像只保存稳定 asset ID；
- 上传只接受 PNG/JPEG，最大 2 MiB；RSL-1 不支持 WebP、GIF 或 SVG；
- Central 使用 JDK `ImageIO` 的实际 reader 识别格式，先读取尺寸再完整解码；不信任扩展名或浏览器 MIME；
- 宽、高分别不得超过 1024 px，总像素不得超过 1,048,576；reader 缺失、尺寸越界、解码为空、截断或格式/内容
  不一致全部拒绝；
- 服务端计算 digest，返回 opaque asset reference；
- SVG、脚本、绝对路径、data URL 和原始本地路径均拒绝；
- 上传失败保留之前已保存头像；
- 头像变化创建 draft revision，但不改变 instruction digest。

focused tests 必须使用真实最小有效 PNG/JPEG 与截断、伪文件头、超尺寸、格式不一致样本；不得用“伪造文件头被识别”
冒充真实解码成功。若 JDK `ImageIO` 无法在零新增依赖下完成以上校验，编码必须停手回评审。

### 4.4 审计

复用 Admin 审计展示模式，记录：

- draft create/update；
- test started/completed（仅状态和 revision）；
- submission created/withdrawn；
- review approved/rejected；
- release published。

审计不得包含行为与规则正文、测试正文、Workspace 路径、用户文件或 Secret。

泄漏测试不得执行、打印或落盘完整 `env`。只允许：

- 在 Main 与 Core 进程内分别断言目标变量是否存在，输出 content-free boolean；
- 对目标 Token 和专用 canary 扫描 `parentStdout`、`childStderr`、Central audit safe payload、Task/Artifact
  projection 四类明确通道；
- 对行为正文、测试正文与 Workspace 路径使用专用 canary，四通道命中数必须为 0。

---

## 5. Core 真实测试与发布消费

### 5.1 draft test 必须复用真实 Task pipeline

`startRobotDraftTest` 的行为固定为：

1. 从 Central 读取 exact saved draft revision；
2. 校验必填字段、当前 actor、restriction 与当前资源可用性；
3. 用现有 compiler 生成/验证 exact `AgentDefinitionRevisionV1Alpha2`；
4. 原子创建真实 Session、Task、Runtime Selection 与 Agent lock；
5. 进入既有 Agent Loop、Model Gateway、Tool 与 Artifact 路径；
6. Desktop 跳转到现有 Workbench/Task 体验，不建立第二个测试 Runner；
7. Task terminal 后仅把 `passed/failed + draftRevision + taskId + testedAt` 回写 Central；
8. 草稿再次保存后旧 test fact 自动显示 stale。

测试 Task 可以在 Desktop Task 列表中标明“机器人测试”，但仍是同一 Task 状态机。禁止 fixture response、独立聊天框、
临时表单内容直送模型或只调用 LLM 不建 Task。

### 5.2 resource restriction

- restriction `unrestricted` 继续受 actor、企业、Workspace、Task、Entitlement 约束；
- restriction `allowlist` 使用 exact refs，空数组表示明确禁止；
- Model 非空 allowlist 必须与当前合法 Model 有交集，否则 test/submit fail；
- Tool 只接受当前真实 Tool Catalog 中可引用的 exact revision；
- personal/local Skill 可以用于创建者测试，但 RSL-2 前不能进入企业发布包；
- Knowledge Provider 未就绪时非空 Knowledge allowlist 阻止提交，不伪造 resource；
- 发布后资源失效时，新 Task 沿既有 fail-closed 规则处理，不自动换资源。

### 5.3 published robot source

新增一个 Central-backed managed Agent source，向现有 Core composition 提供已发布 release：

- 只返回 `published`、当前 actor 可见且完整校验通过的 exact Agent Definition；
- 与 `agent.general`、现有 code-owned Agent 合并时按 ID/revision 严格去重；
- `agent.general` 是 exact reserved ID；create、update、submit、approve 任一入口收到该 ID 都必须 fail-closed 为
  `agentlifecycle.robot_id_reserved`，不允许 skip、重命名或覆盖；
- Robot Catalog 继续使用现有 v1alpha2 projection；
- Workbench 继续用现有 Agent selection，不新增第二个机器人选择器；
- 首次 SubmitTurn 被接受时继续由既有 Runtime Selection/Task Lock 原子锁定 exact revision；
- Core 重启后从 durable Task facts 恢复，不追随 Catalog 最新版本。

---

## 6. Desktop 与 Admin 前端

### 6.1 Desktop

只把已有原型接到真实 lifecycle Adapter：

- “我创建的”显示真实个人草稿，不用 Mock/LocalStorage；
- 创建页保存名称即可，缺简介/规则显示“发布前补充”；
- 未保存修改显示明确 dirty 状态；
- restriction 开关关闭保留选择，开启空列表显示“明确不允许”；
- Model restriction 无合法候选时禁用测试/提交并显示具体原因；
- 保存成功后进入草稿详情；
- 草稿详情显示 current revision、test state、submission/review state；
- “运行测试”先保存或要求用户保存，只运行 exact current revision；
- “提交发布”显示固定包摘要和空 restriction 语义；
- rejected 显示安全原因并允许继续编辑、保存新 revision、重测、重提；
- published robot 在 Catalog 与 Workbench 出现。

不得用页面内临时成功状态冒充后端 receipt，不得在 LocalStorage 建草稿 source of truth。

### 6.2 Admin

本批只新增用户提交审核：

- Robot 页面增加“发布审核”入口与 pending 数量；
- 审核列表支持 pending/approved/rejected/withdrawn 筛选；
- 详情展示不可编辑的名称、简介、行为与规则、四类 restriction 实际生效结果、exact refs、范围、版本和变更说明；
- 页面不展示测试输入/输出，不建设测试报告页；
- 通过前重新校验 package digest 与资源可引用性；
- 拒绝必须填写 1～1000 字安全原因；
- revision conflict 后重读，不静默覆盖；
- approve/reject 后返回 command receipt 并刷新真实状态。

Admin 从空白创建企业机器人不在本批，不得以隐藏按钮、Fixture 或本地状态伪装完成。

---

## 7. 分步实施顺序

### Step 1 — Contract 与状态证明（0.5～1 日）

- 冻结 `agent-lifecycle/v1alpha1` strict schema；
- 固定 package material、instruction digest domain、展示字段排除规则；
- 固定 state transition、command idempotency 与 typed errors；
- 先用 focused tests 证明 avatar/tag 不改变 instruction digest、restriction 改变会改变 digest。
- 确认 Central 使用 `U0012__agent_lifecycle_from_v0011.sql`、Core SQLite migration 仍止 26，并证明两套 counter
  物理隔离；
- 用 JDK `ImageIO` 的真实有效/无效 PNG/JPEG 样本证明零新增依赖的内容、尺寸与像素校验；
- 固定 `agent.general` reserved ID 与 `agentlifecycle.robot_id_reserved`；
- 列出 Preload additive 新增 7 个方法，既有 method 修改数和删除数均为 0。

### Step 2 — Central source of truth（1.5～2.5 日）

- `B0012` / `U0012` / v0012 manifest 同版本部署集合、store、domain service、creator/reviewer exact HTTP endpoints；
- test fact、submission、approve/reject、published release 与安全 audit；
- internal-trial exact actor authorization；
- PostgreSQL restart/replay/idempotency tests。

### Step 3 — Core BFF、真实测试和 managed Agent source（1.5～2.5 日）

- Agent lifecycle token provider；
- Main spawn 后删除父进程目标变量与临时 child-env 字段，Core Provider 读取后删除子进程目标变量；
- Core private exact routes/client；
- saved revision → existing Task pipeline；
- terminal Task → content-free test fact；
- published release → existing Catalog/Runtime Selection/Task Lock。

### Step 4 — Desktop + Admin UI（1.5～2 日，可并行）

- Desktop creator flow 和 focused tests；
- Admin review flow 和 focused tests；
- 不修改无关设置、Personal Model、Tool/Knowledge 页面。

### Step 5 — 联合真实 E2E 与收口（1～1.5 日）

- 真实 Central + PostgreSQL；
- 真实 Electron Main/Preload/Core/Renderer；
- 真实 Admin integration build + Node loopback proxy；
- 一个真实 Model，完成 draft test 与 published robot 新 Task；
- Core/Central restart 后 exact lock/release 不漂移。

集中估算：6～9 个工程日。任何超出本方案的基础设施需求不得在本批顺手扩建。

---

## 8. Focused QA 矩阵（40 项）

### 8.1 Contract 与 revision（QA-001～QA-008）

1. `QA-001`：新增 subpath 可精确 import，所有 object schema strict；
2. `QA-002`：frozen Admin/Desktop/Agent Definition Contract byte/hash 不变；Central Flyway 到 0012 且 Core
   SQLite migration 仍止 26；
3. `QA-003`：保存只有名称时成功，空名称失败；
4. `QA-004`：测试/提交缺简介或行为与规则失败；
5. `QA-005`：头像/标签变化不改变 instruction digest；
6. `QA-006`：行为与规则或 restriction 变化改变 instruction digest；
7. `QA-007`：关闭 restriction 保留选择但 material 生效为 unrestricted；
8. `QA-008`：开启空 allowlist exact 表达禁止，不被解释为 unrestricted。

### 8.2 Central lifecycle（QA-009～QA-016）

9. `QA-009`：create/update 原子写 immutable revision + current pointer；
10. `QA-010`：expected revision conflict fail-closed；
11. `QA-011`：相同 commandId replay 返回同一 receipt；
12. `QA-012`：新 revision 使旧 test fact stale；
13. `QA-013`：submission immutable 且同 robot 最多一个 pending；
14. `QA-014`：withdraw 后不可 approve/reject；
15. `QA-015`：reject 必须有原因，approve 原子创建 release；
16. `QA-016`：Central/PostgreSQL 重启后 draft/submission/release 一致。

### 8.3 真实测试与运行时（QA-017～QA-024）

17. `QA-017`：test 只接受 saved exact revision；
18. `QA-018`：未保存修改不进入模型请求；
19. `QA-019`：test 创建真实 Session/Task/Runtime Selection；
20. `QA-020`：test 使用 exact Agent Definition 与现有 Model Gateway；
21. `QA-021`：Model restriction 无合法交集阻止 test/submit；
22. `QA-022`：local Skill 可测试但 RSL-2 前不得进入 enterprise package；
23. `QA-023`：Knowledge 非空引用在 Provider GATED 时阻止 submit；
24. `QA-024`：Task terminal 只回写 content-free test fact，不上传测试正文。

### 8.4 Desktop/Admin 用户体验（QA-025～QA-032）

25. `QA-025`：“我创建的”来自真实 Adapter，Mock/LocalStorage 命中 0；
26. `QA-026`：dirty、saving、saved、stale test 状态可区分；
27. `QA-027`：restriction 关闭/开启/空允许列表文案符合 PRD；
28. `QA-028`：真实 PNG/JPEG 解码成功；截断、伪头、超尺寸、格式不一致失败；失败保留原头像且不暴露本地路径；
29. `QA-029`：Admin review detail 完全只读且 package digest 可校验；
30. `QA-030`：Admin approve/reject 只经 Adapter exact method，不页面 fetch；
31. `QA-031`：rejected 原因回到 Desktop，修改后新 revision 可重测重提；
32. `QA-032`：production identity 未就绪时 mutation fail-closed，不伪造成功。

### 8.5 发布消费、恢复与边界（QA-033～QA-040）

33. `QA-033`：approved release 出现在现有 Robot Catalog；`agent.general` 在 create/update/submit/approve
    全部返回 reserved-ID typed error；
34. `QA-034`：published robot 可在 Workbench 选中并提交真实新 Task；
35. `QA-035`：Task lock exact agent revision/package digest；
36. `QA-036`：发布新 revision 不改写既有运行中/已完成 Task lock；
37. `QA-037`：Core 重启后 Task 继续使用原 exact revision；
38. `QA-038`：Central 重启后 Catalog release 不漂移；
39. `QA-039`：Main/Core 目标 Token 环境字段均为 absent；Token/Secret/行为正文/测试正文/Workspace 路径专用
    canary 在四类明确通道命中 0，且测试不输出完整环境；
40. `QA-040`：Skill Lifecycle、TGM、Knowledge Provider、Personal Model、SSO/RBAC 和 Admin direct-create
    readiness 全 false/GATED。

---

## 9. 联合 E2E 验收脚本

唯一主场景：

1. 启动真实 PostgreSQL Central、Admin integration build、Desktop Electron/Core；
2. Desktop 创建“合同审阅助手”，先只填名称并保存 revision 1；
3. 补齐简介、行为与规则，设置 Model allowlist 和已有只读 Tool，保存 revision 2；
4. 确认 revision 1 的 test state 为 stale；
5. 对 revision 2 发起真实 Task 测试，真实 Model 返回结果并形成 passed test fact；
6. 提交 revision 2，Central 固定 immutable Agent Package；
7. Admin 打开审核详情，确认不能编辑，执行 approve；
8. Desktop 刷新 Catalog，看见 enterprise published robot；
9. Workbench 选择该 robot 并提交真实任务，Task lock 记录 exact published revision；
10. SIGKILL Core，重启并恢复 Task，仍使用原 exact revision；
11. Central 重启后 Robot Catalog 和 review/release 状态一致；
12. 分别确认 Main/Core 目标 Token 环境字段 absent；扫描四类明确通道，确认 Token、Secret、行为正文、测试正文
    和 Workspace 路径专用 canary 命中 0；不得执行或保存完整 `env` 输出。

附加负向场景：

- 模型 restriction 开启但 empty/unavailable 时 test/submit 都失败；
- 修改 draft 后旧测试不能提交；
- pending submission 被撤回后 Admin approve 失败；
- Admin reject 空原因失败；
- duplicate commandId 不产生第二个 revision/release；
- local Skill / unavailable Knowledge 不能混入 enterprise package。

---

## 10. 停手条件

出现任一情况立即停手回文档评审：

1. 必须修改 frozen Robot Catalog、Admin v1alpha1/v1alpha2 或 Agent Definition v1alpha2 字段语义；
2. 必须新增第二套 Task、Session、Agent Loop、Runtime Selection 或 Entitlement；
3. 必须建立通用 workflow/package registry/test report 平台；
4. 必须让 Renderer 直接访问 Central、Bearer、creator subject 或绝对路径；
5. 必须复用 `model.use` Token 承担 Agent mutation，或扩大其 frozen permissions；
6. 必须用 Fixture/LocalStorage/静态 Catalog 冒充 lifecycle 成功；
7. PNG/JPEG 头像无法用 JDK `ImageIO` 在零新增依赖下完成真实格式、尺寸、像素和完整解码校验；
8. 测试无法复用 existing Task pipeline，必须另建测试 Runner；
9. published release 无法投影到现有 Agent Definition/Robot Catalog；
10. 需要新增 Skill Lifecycle、TGM、Knowledge Provider、Personal Model 或 production identity；
11. 需要把 local Skill 静默当作 enterprise published Skill；
12. 审核必须接收测试正文、模型思考过程或 Workspace 文件；
13. 需要修改 historical Harness/Evidence 适配当前合法演进；
14. 联合 E2E 无法用真实 Central/PostgreSQL/Electron/Core 完成而准备改用 fixture 冒充。

---

## 11. 交付文件范围

允许：

- `packages/contracts/src/agent-lifecycle/v1alpha1/**` 及 exact export/package subpath；
- `services/central-service/src/**` 与 Central `U0012__agent_lifecycle_from_v0011.sql` migration；
- `services/core/src/**` 中 lifecycle BFF、test composition、managed Agent source 的最小命中文件；
- `apps/desktop/src/**` 中 lifecycle Main/Preload/Renderer 与 focused tests；
- `apps/admin-console/src/**` 中 review Adapter/pages 与 focused tests；
- 单一 RSL-1 联合 E2E driver/fixture；
- 本计划、实施报告、QA 报告、README/CHANGELOG/DEVELOPMENT-LOG 必要同步。

禁止：

- Skill/Tool/Knowledge/Personal Model 新能力；
- production SSO/RBAC/identity；
- 通用 Agent Studio、拖拽编排、自动评测、多级审批；
- 无真实消费者的 Contract 或 compatibility layer；
- 新 registry 依赖，除非出现无法用现有技术安全完成的明确阻塞并重新评审。

---

## 12. 评审问题

1. 是否接受 RSL-1 只先关闭 Desktop 个人机器人 → Admin 审核 → 企业发布 → Desktop 消费主链？
2. 是否接受 Central 作为 draft/revision/test fact/submission/release 唯一 source of truth，Core 不另存机器人草稿？
3. 是否接受新增一个 consumer-driven `agent-lifecycle/v1alpha1`，不改 frozen 既有 Contract？
4. 是否接受测试必须复用现有真实 Task pipeline，且只把 content-free result 写回 Central？
5. 是否接受提交/发布要求 current saved revision 测试通过，但测试过程和结果不进入 Agent Package？
6. 是否接受 RSL-2 前 local Skill 只可用于个人测试，不能进入 enterprise package；Knowledge 非空引用继续 fail-closed？
7. 是否接受新增独立 internal-trial `agent.manage` Token，而不扩大 `model.use` Token？
8. 是否接受 Admin 本批只做用户 submission 审核，Admin 从空白创建企业机器人另立紧随其后的增量？
9. 是否接受 Central v12 的 `B0012/U0012/manifest` 是一个 schema version deployment set，Core migration 继续止 26？
10. 是否接受 40 项 focused QA + 一个联合真实 E2E，不建立 96/120 项账本或新 Evidence schema？
11. 是否接受 6～9 个集中工程日估算？
12. 是否确认本方案评审通过不等于编码授权，必须再单独授权 RSL-1？

---

## 13. 关闭后的边界

RSL-1 关闭后，只能确认个人机器人创建、exact saved revision 测试、固定包审核、企业发布和 Desktop 新任务消费闭环。

仍保持 GATED：

```text
Admin direct enterprise robot creation/edit/test
published robot update/downlist
Skill Lifecycle
TGM
Knowledge Provider
Personal Model production readiness
production identity / SSO / RBAC
Agent Lifecycle generic platform
```

下一步优先进入 RSL-2 Skill Lifecycle；若产品先要求补齐 Admin direct enterprise robot creation，则先输出 RSL-1.1
极小增量方案，不能在 RSL-1 编码中顺手加入。
