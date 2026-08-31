# DFI-4A.4 Revision 2 Local Personal Model CRUD / Credential Packaging / Desktop Safe Interface 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED / DFI-4A.4.1～4A.4.2 PASS/CLOSED / STRM-3 PASS/CLOSED / DFI-4A.4.2 repair.1 DOCUMENT REVIEW PENDING / DFI-4A.4.3 IMPLEMENTATION STOPPED**  
> 日期：2026-08-28  
> 负责人：Codex 5.6  
> 历史父方案：[DFI-4A.4 Desktop 安全接口、Preload Sidecar 与联合 E2E](./DFI-4A.4-DESKTOP-SAFE-INTERFACE-E2E-DEVELOPMENT-PLAN.md)  
> 产品依据：Model Experience Feature Spec Revision 4、PRD Revision 15、MVP 功能基线  
> 已关闭上游：DFI-4A.0～4A.3、DFI-5、R2D-P.1～P.3、PRA-1～PRA-3、STRM-0～STRM-2、EIPC-1.1.3.3  
> 明确下游：Desktop Renderer 个人模型管理消费批、正式安装包签名/公证、Enterprise Identity/Entitlement、Admin v2  
> 当前授权：DFI-4A.4.1、STRM-3、DFI-4A.4.2 已关闭；repair.1 仅允许文档评审；DFI-4A.4.3 因 public mutation identity 缺口停止；Renderer UI 继续 GATED

## 0. 结论先行

旧 DFI-4A.4 方案形成时，Desktop production graph、Local Desktop subject authority、R2D production
consumption、Provider release admission 和 Max UI 尚未完成；它因此把大量工作绑定到尚未闭合的 Enterprise
Identity 与敏感传输前置线。当前事实已经变化：DFI-5 全阶段已 `PASS/CLOSED`，Local Personal execution graph、
SQLite persistence、Keychain Store、task-pinned release、真实 Electron/Core/SQLite/TLS-SSE E2E 都已存在。

Revision 2 不重做这些能力，只关闭四个剩余缺口：

1. 冻结“本地独立模式”和“企业受管模式”两类个人模型管理 authority，禁止用 Local Task entitlement 冒充
   `personal_model.configure` 企业授权；
2. 把现有原生 Keychain Helper 变成可验证的包内资源：构建、manifest、签名事实、Main→Core boot descriptor、
   Core 二次校验和 fail-closed；
3. 建立 Personal Model list/detail、create/update/delete/reveal 的独立安全 Contract、Core/Main/Preload 接口，
   复用既有 Coordinator、Operation Journal、Receipt、Keychain 与 STRM transport，不建第二套状态机；
4. 用真实进程、真实 SQLite、临时 Keychain、真实 Helper、真实 Electron 和受控 TLS Provider 完成 closure，向后续
   Desktop Renderer 批交付稳定接口；本批仍不修改 Renderer 页面。

DFI-4A.4 Revision 2 关闭后，只能声明：

```text
DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT
```

它不等于 Apple notarization 完成、Enterprise entitlement ready、Admin 企业模型 CRUD ready、生产发布包 ready，
也不自动授权 Desktop Renderer 开放个人模型表单。

### 0.1 DFI-4A.4.1～4A.4.2 实施状态

DFI-4A.4.1 已按单独授权完成 Authority / Helper Packaging / Read-only Safe API：新增
`PersonalModelManagementAuthorityV2`、固定包内 Helper builder/manifest 解析、Personal Model management
v1alpha1 exact Contract，以及 Core private HTTP、Main IPC、sandboxed Preload 的三方法只读链路。生产签名 Helper
资产尚未生成，因此 `productionHelperAssetPresent=false`，Catalog 仍可安全读取，mutation/reveal 继续不可达。

专项 Harness 为 4 files / 17 tests，Evidence digest 为
`sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750`；独立 QA 结论
`PASS（P0=0 / P1=0 / P2=0 / P3=1）` 已由用户正式接受，DFI-4A.4.1 当前为 `PASS/CLOSED`。P3 仅为已收口的
文档精度记录；历史 DFI-5.4.3 Harness/Evidence 保持只读，前端并行 `settings-adapter.ts rootRealPath` 不归因
本批。STRM-3 独立代码 QA `P0～P3=0` 已由用户接受并正式 `PASS/CLOSED`，父 QA-061～080 已标记
`executed_by_strm3`。DFI-4A.4.2 已完成 v1alpha2 八方法、唯一 Coordinator/Recovery/Reveal business graph 与
A2 Secret 分流；独立代码 QA P0～P3 全 0 已由用户接受，当前 `PASS/CLOSED`。父 QA-081～100 已标记
`executed_by_dfi4a42`，其余 80 项继续 `retained_for_dfi4a4_stage_closure`。DFI-4A.4.3 详细方案已新增，当前仅
计划评审 `PASS/CLOSED`，但编码前发现 v1alpha2 public mutation identity 缺口并已停手；repair.1 additive
v1alpha3 方案当前 `DOCUMENT REVIEW PENDING / CODING GATED`。

## 1. 当前代码事实

### 1.1 已经完成，必须直接复用

- migration 23/24 已承载 Personal Model namespace、immutable definition/head/status、preference、Operation Journal、
  durable Receipt、invocation 与 Usage；migration 当前最大 id 为 26；
- `SqlitePersonalModelPersistence`、`SqliteLocalPersonalModelInvocationPersistence` 已进入普通 Desktop Core graph；
- `MacOsKeychainPersonalCredentialStore` 已实现 store/replace/inspect/resolve/delete、uncertain reconciliation 和
  helper process timeout；
- `verifyPersonalCredentialHelperDescriptor()` 已有 containment、no-symlink、owner/mode、SHA-256、codesign
  designated requirement 和 Team Identifier 校验；
- 原生 `robothree-personal-credential-helper.m`、Personal Credential Broker、Reveal Service、CRUD Coordinator、
  operation gate 与恢复逻辑已经存在；
- STRM-0～STRM-2 已交付 sensitive transport Contract、Preload adapter、Main production-disabled wiring 与真实进程
  Harness；历史 Evidence 只读；
- R2D-P.1～P.3 已交付 `local_desktop_owner`、Entitlement v2、production source 与 Desktop v1alpha4 cutover；
- DFI-5.4.3A/5.4.3 已把 Personal Model execution、Credential resolve、Provider mapping、Max UI 与 Task reasoning
  summary 接入普通 Desktop production composition；
- DFI-5.4.3 real E2E 已证明 test-isolated Helper + 临时 Keychain + Local Personal exact subject 能完成真实调用与
  Core `SIGKILL` 恢复；
- `PersonalModelSafeSummaryV1Alpha2Schema` 已存在，Renderer Settings 仍明确显示个人模型管理 GATED。

### 1.2 当前仍缺失

| 缺口 | 代码事实 | Revision 2 决策 |
| --- | --- | --- |
| 管理 authority | R2D Local lease 明确 `mayConfigure/mayRevealSecret/mayDelete=false`；现有 `PersonalModelOwnerAuthority` 只接受 enterprise identity | 新建独立 management authority union；Task entitlement 不得复用为 CRUD 授权 |
| standalone 与 enterprise 边界 | production enterprise identity/entitlement 仍 false | standalone local 只能由 code-owned deployment composition 启用；enterprise-managed 模式继续 fail-closed |
| Helper packaging | production runtime 只在 DFI-5.4.3 test harness 收到 descriptor；Desktop package 无 Helper manifest/资源装配 | build-time 生成不可变 manifest，Main 从安装资源解析，Core 二次验证；Renderer/env/argv 不得给路径 |
| Public safe interface | v1alpha2 只有 Personal safe summary schema，没有 list/detail/CRUD/reveal route、IPC 或 frozen Preload API | 新建独立 exact package subpath 和独立 API namespace，不原地扩写已关闭的 v1alpha2/v1alpha5 |
| Sensitive exposure | STRM-3 transport foundation 已实现但产品调用仍关闭 | 独立 QA 与用户接受前不关闭 transport blocker；CRUD/reveal 仍需 Helper、业务 handler 与后续独立授权 |
| Renderer | Settings 页面仍是 GATED | DFI 只交付 Adapter Contract；后续 Desktop 前端批单独授权，不在本批混入 UI |
| Formal package | 当前只有 build，无正式 installer/notarization 基线 | 本批验证 app bundle 资源布局和签名输入；DMG/notarization/release pipeline 独立处理 |

### 1.3 基线

```text
Root/Core/Contracts version         = 0.0.0-dfi.4a.4.1
Desktop version                     = 0.0.0-dfe.run.1（并行前端批当前值）
Admin version                       = 0.0.0-afe.6c
pnpm-lock.yaml sha256               = 5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31
migration max                       = 26
production enterprise entitlement  = false
STRM-3                              = PASS/CLOSED / SENSITIVE_TRANSPORT_READY
Desktop personal model Renderer UI = GATED
```

## 2. 冻结设计

### 2.1 G1：管理 Authority 与 Task Entitlement 分离

新增 Core-private readable union：

```text
PersonalModelManagementAuthorityV2
  ├─ standalone_local_owner
  └─ runtime_active_enterprise_identity
```

共同字段只含 authority kind、owner namespace revision/digest、policy revision、operation permissions 和
authority revision；不含 namespace key、user token、device proof、credential reference 或企业 session material。

`standalone_local_owner` 仅在 code-owned `standalone_local` deployment composition 可构造：

- 使用现有 Personal Model owner namespace + Local Desktop HMAC authority；
- `productionLocalAuthorityReady=true`、`productionEnterpriseIdentityReady=false`、`testIdentityUsed=false`；
- policy 明确为 `local_personal_model_management`，不是 `personal_model.configure` 企业 entitlement；
- 允许本机 owner create/update/use/reveal/delete；不产生企业用户、组织或管理员授权事实；
- 一旦 deployment composition 为 enterprise-managed，禁止 fallback 到 standalone authority。

`runtime_active_enterprise_identity` 继续复用 EIPC 权威事实和 `personal_model.configure` entitlement；在 EIPC-2～3
未关闭前保持 unavailable。不得用 fixed UUID、OS 用户名、Renderer/Main 参数或“数据库只有一个 namespace”冒充。

现有 R2D `ownerAuthority()` 的三个管理 permission 必须继续为 false；任务资源 entitlement 只证明 Task 使用资格，
不能证明配置、Reveal 或删除权限。

### 2.2 G2：Helper Packaging 与 Trust Chain

Helper 固定放在 app bundle 的受控 Resources 子目录，构建时生成 manifest：

```text
schemaVersion
helperRelativePath
protocolVersion
sha256
designatedRequirement
teamIdentifier
buildRevision
```

约束：

1. manifest 与 Helper 都是构建产物，不从 Renderer、用户配置、env、argv 或数据库读取路径；
2. Helper 必须先编译、签名，再计算最终 SHA-256；任何签名后再改写都会导致 digest mismatch；
3. Main 从 `process.resourcesPath` 下固定相对路径解析 manifest，拒绝 absolute/`..`/symlink；
4. Main 只把 descriptor 作为 Core boot input；Core 继续执行现有 containment、regular-file、owner/mode、digest、
   designated requirement、Team Identifier 二次验证；
5. unsigned/dev build 可以启动，但 mutation/reveal feature 必须 unavailable；不得用 test-isolated activation 冒充；
6. production signing material 缺失时构建或 feature fail-closed，不把 ad-hoc 签名宣称 production verified；
7. 正式 DMG、notarization、auto-update 与发布凭证管理不属于本批，但未来流水线必须复用同一 manifest 规则。

若当前仓库没有可复用的 app bundle packaging 基线，本批只允许增加最小、无第三方依赖的 Helper asset builder 和
bundle-layout conformance；不得顺手引入 Electron Builder/Forge 或修改 lockfile，必须停手另做 packaging 评审。

### 2.3 G3：独立 Public Contract 与 Namespace

不扩写冻结的 Desktop Local v1alpha1～v1alpha5。DFI-4A.4.1 已用下列 exact package subpath 关闭三方法只读链路：

```text
@robothree/contracts/desktop-local/personal-model-management/v1alpha1
```

Preload 只暴露：

```text
window.robothreePersonalModelV1Alpha1
  getCompatibility()
  listPersonalModels(query)
  getPersonalModel(query)
```

DFI-4A.4.2 必须 byte-freeze 上述 v1alpha1，并用 additive v1alpha2 承载完整八方法：

```text
@robothree/contracts/desktop-local/personal-model-management/v1alpha2

window.robothreePersonalModelV1Alpha2
  getCompatibility()
  listPersonalModels(query)
  getPersonalModel(query)
  createPersonalModel(command, apiKey)
  updatePersonalModel(command, apiKey?)
  deletePersonalModel(command)
  revealPersonalModelKey(command) -> Uint8Array
  queryPersonalModelOperation(query)
```

前 3 项和 delete/query 是 safe control plane；create/update/reveal 进入同一个 frozen v1alpha2 对象，但 Preload 内部必须走
STRM sensitive binary transport，禁止 `ipcRenderer.invoke` 携带 Secret。Contract 只定义 safe header、command
identity、metadata 和 safe result；API Key bytes 永远不进入公共 Zod schema。

Compatibility 至少独立表达：

```text
catalogAvailable
mutationAvailable
revealAvailable
authorityKind
helperState
transportState
productionIdentityReady
testIdentityUsed
reasonCode?
runtimeInstanceId
```

`catalogAvailable` 可以在 Keychain 临时 unavailable 时为 true；mutation/reveal 只有 management authority、verified
production Helper、STRM-3 与 Core Coordinator 全部 ready 才能为 true。

### 2.4 G4：Safe Projection 与输入材料

列表/详情复用 `PersonalModelSafeSummaryV1Alpha2` 的安全字段语义，但新 Contract 必须显式投影：

- `canConfigure/canUse/canReveal/canDelete` 与 safe reason；
- `queryRevision`、opaque cursor、`nextCursor`，limit 1～100；
- preference 是否引用该模型的 safe boolean；
- status、credential masked state、createdAt/updatedAt。

不得投影：完整 Endpoint、credentialRef/binding、owner digest、namespace key、Provider raw error/body、Helper path、
request/record/receipt digest、Task lock 或 execution handle。

Renderer 只提交 provider、custom endpoint（仅 custom）、providerModelId、displayName、expected revision 和 commandId。
PersonalModelId、canonical Endpoint、Provider Profile、capability、configuration/execution revision、credentialRef 与全部
digest 由 Core 生成。Preset Provider 不接受 endpoint override；custom 首期只使用既有保守能力，不允许用户输入
Tool/Reasoning/Context Window 等能力事实。

### 2.5 G5：复用唯一 CRUD / Reveal 状态机

Create/Update/Delete 固定流程：

```text
Main frame + runtime lease validate
  -> Core safe prepare（Transaction A / durable intent）
  -> Preload/Main STRM binary bytes
  -> fd4/fd5 Broker
  -> PersonalModelCredentialCoordinator.executePrepared()
  -> Keychain observation
  -> Transaction B / durable Receipt
  -> safe status query
  -> Renderer safe outcome
```

- 同 commandId + 同 material 重放同一 Receipt；不同 material typed conflict；
- metadata-only update 不要求新 Key；Provider/Endpoint/protocol 变化或显式 replace 必须新 Key；是否需要 Key 由 Core 决定；
- delete 先重检执行中 Task、usage unknown、revision、preference 与 operation lease；
- `manual_attention`、`cleanup_pending`、`uncertain` 不得投影为保存/删除成功；
- restart 后只从 Operation Journal/Receipt 恢复，不重发 Renderer Secret，不从 transport callback 猜成功；
- 不增加“测试连接”；保存后初始 `unverified`，首次真实调用更新状态。

Reveal 固定为 owner 主动、单模型单并发、限频、有 deadline、无自动 replay：

- 每次重检 authority/head/revision/credential binding；
- bytes 只送 exact webContents/main frame/runtime lease；navigation/reload/close 立即终止；
- 不创建“用户已看到 Key”的 durable success Receipt；
- 不复制、不广播、不自动写剪贴板；
- Renderer 短生命周期 String 无法可靠清零，必须诚实记录残余风险，只允许局部组件、TTL、hide/unmount 清空 DOM
  与引用，不进入 store、snapshot、telemetry 或错误。

### 2.6 G6：Runtime Change 与资源上限

- stable `clientInstanceId` 只由 Main 绑定；transport identity 与 Renderer client identity 分离；
- Core restart/runtimeInstanceId 变化后，旧 sensitive ticket、MessagePort、command session 全部失效；
- list/detail 可以重新协商；mutation/reveal 只能查询 durable status或由用户显式重新发起，不能复用旧 bytes；
- 每 webContents、全局 inflight、ticket、port、helper child、timer、reveal waiter 都必须有硬上限；
- window close、navigation、render-process-gone、Core exit、timeout、cancel 后资源真实归零。

### 2.7 G7：Renderer 与 Admin 边界

DFI-4A.4 不修改 `apps/desktop/src/renderer/**`。后续 Desktop 前端消费批只能：

- 删除个人模型 GATED 占位；
- 接入 Settings list/detail/add/edit/delete/reveal；
- 不提供测试连接；
- 非敏感字段失败时保留表单；API Key 不进入全局状态；
- Workbench 继续消费 Core/R2D 返回的统一模型候选，不在 Renderer 合并 entitlement 或选择排序。

Admin Console 不接收个人 API Key，也不获得个人模型 CRUD/Reveal。管理员只能在后续独立业务线管理企业模型和
“是否允许个人配置模型”的企业策略；本批不修改 Admin。

## 3. 接口与错误语义

### 3.1 Typed safe error

至少冻结：

```text
personal_model.contract_invalid
personal_model.feature_unavailable
personal_model.runtime_changed
personal_model.permission_denied
personal_model.not_found
personal_model.revision_conflict
personal_model.cursor_stale
personal_model.credential_required
personal_model.credential_store_unavailable
personal_model.transport_unavailable
personal_model.operation_in_progress
personal_model.in_use
personal_model.usage_unknown
personal_model.rate_limited
personal_model.operation_uncertain
personal_model.manual_attention
personal_model.cleanup_pending
personal_model.reveal_expired
```

Renderer 只获得 code、固定 safe summary、retryability 和允许的下一步；Zod path、stack、OSStatus、完整 Endpoint、
Credential/owner/digest/helper path 不得进入错误。

### 3.2 页面状态交接

后续 Renderer 必须能区分：Loading、Empty、Catalog available but mutation unavailable、Permission denied、
Helper unavailable、Transport unavailable、Runtime changed、Conflict、Operation pending、Manual attention、
Cleanup pending、Reveal expired 和 Safe error。不得把其中任何状态降级为 Mock 列表或“保存成功”。

## 4. 分批顺序

### DFI-4A.4.1 Revision 2：Authority / Helper Packaging / Read-only Safe API（PASS/CLOSED）

- `PersonalModelManagementAuthorityV2` 与 standalone/enterprise exact dispatch；
- Helper asset builder、manifest schema、bundle layout、Main descriptor、Core二次校验；
- personal-model-management v1alpha1 compatibility/list/detail Contract；
- Core projection、private HTTP、Main IPC、Preload read-only API；
- unsigned/missing Helper 仍允许 catalog safe read，但 mutation/reveal unavailable；
- 不开放 Secret、不修改 Renderer。

### STRM-3：Sensitive Transport Unblock Audit（PASS/CLOSED）

- 基于已关闭 STRM-2 做 production activation、真实 webContents/main-frame/navigation binding 与 closure；
- 输出 `SENSITIVE_TRANSPORT_READY` 才允许 DFI-4A.4.2 接入 create/update/reveal；
- 独立代码 QA 与用户接受已完成，当前只确认 `SENSITIVE_TRANSPORT_READY`，不代表 Personal Model ready。
- 详细方案：[STRM-3 Sensitive Transport Production Activation / Unblock Audit](./STRM-3-SENSITIVE-TRANSPORT-PRODUCTION-ACTIVATION-UNBLOCK-AUDIT-DEVELOPMENT-PLAN.md)。

### DFI-4A.4.2 Revision 2：CRUD / Reveal / Durable Recovery（PASS/CLOSED）

- safe prepare/status + STRM bytes + fd4/fd5 Broker +既有 Coordinator/Reveal Service；
- create/update/delete/reveal/query exact Main/Preload interface；
- conflict、uncertain、manual attention、cleanup pending 与 restart recovery；
- 临时真实 Keychain、Helper crash/cancel/late response、资源归零；
- 不修改 Renderer。
- 详细方案：[DFI-4A.4.2 Personal Model CRUD / Credential Reveal / Durable Recovery](./DFI-4A.4.2-PERSONAL-MODEL-CRUD-CREDENTIAL-REVEAL-DURABLE-RECOVERY-DEVELOPMENT-PLAN.md)；实现、独立 QA 与用户接受均已完成，当前 `PASS/CLOSED`。

### DFI-4A.4.3 Revision 2：Real Desktop E2E / Closure / Frontend Handoff（3～5 日）

- 真实 Electron/Main/Preload/Core/SQLite/Helper/临时 Keychain；
- create → list/detail →真实 Provider 首次调用→status update→reveal→replace→delete；
- Core SIGKILL、Desktop restart、原 SQLite reopen、Receipt/status recovery；
- 受控 TLS Provider，不使用公网或真实用户 Key；
- 80 次泄漏注入、四通道正常命中 0、资源计数真实归零；
- 形成后续 Desktop Renderer Adapter/UI 精确交接。
- 详细方案：[DFI-4A.4.3 Real Desktop E2E / Stage Closure / Frontend Handoff](./DFI-4A.4.3-REAL-DESKTOP-E2E-STAGE-CLOSURE-FRONTEND-HANDOFF-DEVELOPMENT-PLAN.md)；当前仅文档评审，编码 GATED。

DFI-4A.4 自身预计 **10～17 个集中工程日**；关键路径含 STRM-3 为 **12～20 日**。不包含独立 QA、返工、
正式 Developer ID 采购、notarization、DMG/auto-update 或后续 Renderer UI 批。

## 5. 修改边界

### 5.1 子批授权后允许

- frozen `personal-model-management/v1alpha1` 的 byte-drift tests，以及 additive
  `packages/contracts/src/desktop-local/personal-model-management/v1alpha2/**` 与 exact export/tests；
- `services/core/src/application|ports|adapters|bootstrap|desktop-private-main.ts` 中 Personal Model/Credential 增量；
- `apps/desktop/src/shared|main|preload/**` 与对应 tests；
- 原生 Helper build/manifest/bundle-layout scripts、受控 E2E、Harness、Evidence；
- 每批必要的版本、README、CHANGELOG、DEVELOPMENT-LOG 和实施报告。

### 5.2 明确禁止

- `apps/desktop/src/renderer/**`；
- `apps/admin-console/**`、Central、Document Worker、TGM、Knowledge Provider、Agent Lifecycle；
- 改写 Desktop Local v1alpha1～v1alpha5 或 historical Evidence/Harness；
- migration 27、修改 migration 1～26；
- 新第三方依赖或 lockfile 变化；
- Renderer/Main/env/argv 提供 Helper path、authority 或 Credential Reference；
- Secret 进入普通 JSON IPC、Core private HTTP、SQLite、日志、错误、Trace、Evidence、URL、文件或剪贴板；
- 以 test-isolated Helper、ad-hoc signature、Fixture identity 或 LocalStorage 冒充 production ready；
- 个人模型测试连接、自动 fallback 企业模型、自动选择第一个个人模型；
- Enterprise/DeepSeek Max、企业模型 CRUD、Admin mutation 或正式 notarization。

## 6. QA 矩阵（120 项）

### 6.1 Contract / Projection（QA-001～QA-020）

1. QA-001 exact package subpath build 后可真实 import；
2. QA-002 Desktop v1alpha1～v1alpha5 source/hash 零漂移；
3. QA-003 compatibility strict schema；
4. QA-004 list input strict schema；
5. QA-005 detail input strict schema；
6. QA-006 create safe header strict schema；
7. QA-007 update safe header strict schema；
8. QA-008 delete safe command strict schema；
9. QA-009 reveal safe header strict schema；
10. QA-010 operation query strict schema；
11. QA-011 limit 1/100 接受；
12. QA-012 limit 0/101 拒绝；
13. QA-013 cursor 只透传 nextCursor；
14. QA-014 queryRevision drift typed stale；
15. QA-015 safe summary 不含完整 Endpoint；
16. QA-016 safe summary 不含 credentialRef/binding；
17. QA-017 safe summary 不含 owner/namespace digest；
18. QA-018 safe summary 不含 request/receipt/task digest；
19. QA-019 unknown/extra fields 全拒绝；
20. QA-020 public contract 不出现 Secret body schema。

### 6.2 Authority / Packaging（QA-021～QA-040）

21. QA-021 standalone authority 只在 standalone composition 可构造；
22. QA-022 enterprise-managed 不 fallback standalone；
23. QA-023 R2D task entitlement 三个 management permission 仍 false；
24. QA-024 local authority 不伪造 enterprise entitlement；
25. QA-025 test authority 不进入 production；
26. QA-026 fixed UUID/OS user/Main/Renderer authority 拒绝；
27. QA-027 namespace HMAC integrity mismatch 拒绝；
28. QA-028 policy revision drift 拒绝；
29. QA-029 Helper relative path 固定；
30. QA-030 absolute/`..`/symlink path 拒绝；
31. QA-031 Helper non-file/writable owner mode 拒绝；
32. QA-032 manifest protocol mismatch 拒绝；
33. QA-033 SHA-256 mismatch 拒绝；
34. QA-034 designated requirement mismatch 拒绝；
35. QA-035 Team Identifier mismatch 拒绝；
36. QA-036 签名后 byte flip 必拒绝；
37. QA-037 unsigned build mutation/reveal unavailable；
38. QA-038 Main descriptor 不能覆盖 Core验证；
39. QA-039 Renderer/env/argv helper path 零命中；
40. QA-040 无新增 packaging dependency/lockfile drift。

### 6.3 Safe API / Runtime Lease（QA-041～QA-060）

41. QA-041 catalog可用与mutation/reveal可用独立表达；
42. QA-042 Helper unavailable时catalog仍可诚实读取；
43. QA-043 permission denied不返回空列表冒充；
44. QA-044 list稳定排序由Core提供；
45. QA-045 detail not found typed safe；
46. QA-046 preset endpoint override拒绝；
47. QA-047 custom endpoint canonicalization复用既有实现；
48. QA-048 personalModelId由Core生成；
49. QA-049 capability/Profile/digest由Core物化；
50. QA-050 stable clientInstanceId由Main绑定；
51. QA-051 transport client identity与Renderer identity分离；
52. QA-052 runtimeInstanceId变化返回typed runtime_changed；
53. QA-053 lease revalidation发生在每次操作前；
54. QA-054 subframe调用拒绝；
55. QA-055 foreign webContents调用拒绝；
56. QA-056 navigation后旧lease拒绝；
57. QA-057 render-process-gone清理；
58. QA-058 window destroyed清理；
59. QA-059 API方法数和channel数精确；
60. QA-060 generic dispatcher零命中。

### 6.4 Sensitive Transport（QA-061～QA-080）

61. QA-061 create Secret不走普通invoke；
62. QA-062 update Secret不走普通invoke；
63. QA-063 reveal bytes不走Core HTTP；
64. QA-064 STRM-3未ready时三项操作不可达；
65. QA-065 Preload输入长度上限；
66. QA-066 Main ticket上限；
67. QA-067 per-webContents inflight上限；
68. QA-068 global inflight上限；
69. QA-069 exact frame authorization；
70. QA-070 stale ticket拒绝；
71. QA-071 duplicate ticket拒绝；
72. QA-072 late body拒绝；
73. QA-073 cancel单终态；
74. QA-074 deadline单终态；
75. QA-075 Core restart旧port失效；
76. QA-076 navigation/close清理bytes引用；
77. QA-077 helper stdin/stdout frame严格；
78. QA-078 helper stderr非空失败关闭；
79. QA-079 reveal exact consumer且不fan-out；
80. QA-080 clipboard/cache/broadcast零调用。

### 6.5 CRUD / Reveal / Recovery（QA-081～QA-100）

81. QA-081 create prepare先于Keychain；
82. QA-082 create成功初始unverified；
83. QA-083 save不触发测试连接；
84. QA-084 metadata update复用旧Credential；
85. QA-085 endpoint/provider变化强制新Key；
86. QA-086 replace exact revision；
87. QA-087 delete执行中Task阻断；
88. QA-088 delete usage unknown阻断；
89. QA-089 delete preference按Core规则收敛；
90. QA-090 committed Receipt幂等重放；
91. QA-091 command material冲突拒绝；
92. QA-092 uncertain不伪装成功；
93. QA-093 manual_attention不伪装成功；
94. QA-094 cleanup_pending不伪装成功；
95. QA-095 recovery不重发Renderer Secret；
96. QA-096 reveal每次重检owner/revision/binding；
97. QA-097 reveal限频与单并发；
98. QA-098 reveal expired无自动replay；
99. QA-099 reveal无durable“用户已看到”事实；
100. QA-100 企业Credential/个人Credential零交叉。

### 6.6 Real E2E / Leakage / Boundaries（QA-101～QA-120）

101. QA-101 真实Electron Main/Preload安全配置；
102. QA-102 真实Core child新PID；
103. QA-103 真实SQLite原文件reopen；
104. QA-104 真实Helper child和临时Keychain；
105. QA-105 受控TLS Provider真实请求；
106. QA-106 create→调用→status链；
107. QA-107 reveal→replace→delete链；
108. QA-108 SIGKILL named barrier恢复；
109. QA-109 response loss查询同command；
110. QA-110 三轮fresh process semantic digest一致；
111. QA-111 authority/manifest byte drift改变digest或typed fail；
112. QA-112 5 canary×4编码×4通道=80次全部检出；
113. QA-113 正常response/log/evidence/failure四通道命中0；
114. QA-114 Secret/Endpoint/path/credentialRef不进Evidence；
115. QA-115 BrowserWindow/webContents/IPC/ticket/port/helper/timer/request归零；
116. QA-116 migration max=26；
117. QA-117 lockfile digest不漂移；
118. QA-118 DFI-5 historical Evidence不漂移；
119. QA-119 Renderer/Admin/Central/TGM/Knowledge零越界；
120. QA-120 outcome只为conformant且readiness边界逐项false。

## 7. 正式门禁

每个子批有独立 Harness；最终至少串行执行：

```bash
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
CI=true pnpm run harness:dfi4a4
CI=true pnpm run harness:dfi5.4.3
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run lint
CI=true pnpm run typecheck
CI=true pnpm run audit:dtp4
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central:offline
```

还必须验证：

- Helper manifest、binary、signature、app resource location 和 boot descriptor 是同一 build 的事实；
- 历史 DFI-4A/STRM/DFI-5 Evidence 只读；合法演进不通过改写旧 Harness 快照证明；
- 无公网、无真实用户 Key、无付费调用；测试使用明确假 Key 和临时 Keychain；
- parent/child 资源计数来自真实 diagnostics，禁止硬编码0、`?? 0` 或缺失字段当0。

## 8. 停手条件

出现以下任一情况立即停止编码并回评审：

1. 需要把 R2D Task entitlement 当作 CRUD/reveal authority；
2. enterprise-managed 模式必须 fallback standalone 才能运行；
3. 需要 fixed UUID、OS user、Renderer/Main 自报身份；
4. 必须修改 frozen Desktop v1alpha1～v1alpha5；
5. 必须新增 migration 27 或改写1～26；
6. 必须新增第三方 packaging/crypto/Keychain 依赖或改变lockfile；
7. Helper无法固定在app resource containment内；
8. production verification只能依赖ad-hoc/test signature；
9. Helper path必须来自env/argv/Renderer/数据库；
10. STRM-3未输出ready但create/update/reveal需要先开放；
11. Secret必须进入普通IPC/HTTP/SQLite/日志/Evidence；
12. Reveal必须自动replay或广播给多个consumer；
13. 需要复制CRUD/Reveal Coordinator或Operation Journal；
14. 必须用测试连接证明保存成功；
15. 删除只能靠前端缓存判断执行中Task；
16. 必须自动选择或fallback个人/企业模型；
17. 必须修改Renderer才能证明DFI后端接口成立；
18. 必须进入Admin/TGM/Knowledge/Agent Lifecycle/Central写路径；
19. 真实E2E只能靠JSDOM/direct method/body mock冒充；
20. 无法真实统计资源或敏感信息归零；
21. 需要覆盖historical Evidence/Harness；
22. root/Central失败无法在单实例正确环境中解释和复现；
23. package Helper需要正式notarization才能完成本批conformance；
24. 输出production ready、Enterprise ready或Renderer UI ready才可关闭本批。

## 9. 当前门禁与评审问题

```text
DFI-4A.0～DFI-4A.3                    PASS/CLOSED
DFI-4A.4 historical plan / 4A.4.0    PASS/CLOSED
DFI-5                                PASS/CLOSED
R2D-P.1～P.3 / PRA-1～P.3             PASS/CLOSED
STRM-0～STRM-2                        PASS/CLOSED
STRM-3                               PASS/CLOSED / SENSITIVE_TRANSPORT_READY
DFI-4A.4 Revision 2                  PLAN REVIEW PASS/CLOSED
DFI-4A.4.1 Revision 2                PASS/CLOSED
DFI-4A.4.2 Revision 2                PASS/CLOSED
DFI-4A.4.2 repair.1                  DOCUMENT REVIEW PENDING / CODING GATED
DFI-4A.4.3 Revision 2                PLAN REVIEW PASS/CLOSED / IMPLEMENTATION STOPPED
Desktop Renderer personal model UI  GATED
Enterprise identity/entitlement      false / deferred
Admin v2 / TGM / Knowledge / Agent Lifecycle GATED
```

请独立评审重点回答：

1. 是否接受 Revision 2 取代旧计划当前实施口径，但不改写旧计划历史结论？
2. 是否接受 standalone local management authority 与 enterprise entitlement 分离，且 enterprise-managed 不fallback？
3. 是否接受 R2D Task entitlement 的 management permissions 永远不能作为 CRUD/reveal 授权？
4. 是否接受独立 Personal Model management package/API namespace，而不扩写v1alpha1～v1alpha5？
5. 是否接受 Helper先签名再digest、Main解析固定资源、Core二次验证的链？
6. 是否接受无正式签名时应用可启动但 mutation/reveal unavailable？
7. 是否接受 STRM-3 是4A.4.2强前置，4A.4.1可先独立关闭？
8. 是否接受CRUD/Reveal完全复用既有Coordinator/Broker/Receipt，不建第二套状态机？
9. 是否接受保存不测试连接，初始状态为unverified？
10. 是否接受DFI批不改Renderer，UI另行评审授权？
11. 是否接受10～17日DFI工期、含STRM-3关键路径12～20日？
12. 是否确认本批关闭不等于installer/notarization、Enterprise、Admin或production ready？

评审输出必须包含：`PASS / PASS_WITH_REVISIONS / RED`、P0～P3、是否可冻结、是否保持 Coding Gated。
