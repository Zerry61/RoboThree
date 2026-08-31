# DFI-4A.4 Desktop 安全接口、Preload Sidecar 与联合 E2E 详细实施方案

> 2026-08-28 控制性说明：本文件保留为已接受的历史计划。DFI-5/R2D-P/PRA 与 Local Desktop production graph
> 完成后，当前实施口径由 [DFI-4A.4 Revision 2](./DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md)
> 控制；Revision 2 仍处于 `DOCUMENT REVIEW PENDING / CODING GATED`，不构成编码授权。

> 状态：**PLAN REVIEW PASS/CLOSED；4A.4.0 PASS/CLOSED；THREE BLOCKER DOCUMENTS PASS/CLOSED；EIPC-0 / STRM-0～STRM-2 PASS/CLOSED；EIPC-1 PLAN PASS/CLOSED；EIPC-1.1.3.2 IMPLEMENTED / INDEPENDENT QA PENDING**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 上游：DFI-4A.0～4A.3 `PASS/CLOSED`；ADR-013 Addendum A `ACCEPTED`  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 架构依据：ADR-011、ADR-013、ADR-013 Addendum A、ADR-015、ADR-017、CGF-1.3、ARH-1～3、DFI-1B、DFI-2A、DFI-4A Revision 1

本文件已通过文档评审并由用户接受。DFI-4A.4.0 Preflight 已完成复核并由用户正式接受为
`PASS/CLOSED`；它正确确认 `BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION` 与
`BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER` 两项事实成立。Identity composition 修复方案与 sensitive
transport Revision 1/Threat Model 已通过复核并由用户接受。EIPC-0 已完成 authority semantics 冻结、
独立 QA 与用户接受；它不宣称 `IDENTITY_COMPOSITION_READY`。STRM-0 已完成路线 A Decision Spike、独立 QA 与用户接受，
输出 `ROUTE_A_ACCEPTABLE`；STRM-1 已完成 Contract/Adapter Foundation；STRM-2.1～2.3 与 repair.1 已完成
production-disabled wiring、S1～S8 进程 Harness、独立 QA 与用户接受，STRM-2 已正式关闭；它们均不宣称
`SENSITIVE_TRANSPORT_READY`。EIPC-1 计划已关闭，EIPC-1.1.3.2 已完成授权实现并等待独立 QA；STRM-3、EIPC-1.1.3.3、EIPC-1.2～EIPC-3 与
4A.4.1～4A.4.3 继续 GATED，不得以 Fake authority、普通 JSON Secret payload 或未经证明的 Electron
transfer 语义绕过。

## 1. 阶段目标

DFI-4A.4 将已完成的个人模型 Domain/Persistence、Credential Broker/Keychain/Reveal、Provider/Usage、
统一选模、精确 Task Lock 和 Agent Loop 恢复能力，接入真实 Desktop 跨进程边界。完成后：

1. Renderer 只能看到个人模型安全摘要、权限、偏好和 typed Receipt；
2. 新增/更换 API Key 与 reveal 使用独立敏感 Sidecar，不进入普通 JSON IPC、Core private HTTP、日志或持久层；
3. create/update/delete/reveal 复用既有两阶段 Coordinator、fd4/fd5 Broker 和 Keychain，不复制业务状态机；
4. v1alpha2 SubmitTurn 可以显式选择个人模型并形成标准 exact Task lock；
5. 用户默认模型 mutation 是独立、显式、可重放的事实，不从 `requestedModelId` 静默推断；
6. 企业模型与个人模型共享一个任务选择体验，但 Credential、Provider、错误域和恢复事实继续隔离；
7. Core/Desktop restart、权限收窄、Keychain locked、并发 mutation/reveal、执行中删除阻断和 uncertain
   都以持久事实或有界运行时状态收敛；
8. 后续前端 DFE 集成批次可以删除个人模型 GATED UI，但 DFI-4A.4 本身不修改 Renderer 页面。

本批关闭的是 **Desktop Personal Model Interface Foundation**，不是正式安装包、Apple notarization、
Enterprise Integration、DFI-2B 智能授权、DFI-3、TGM 或个人模型运营平台。

## 2. 当前代码事实

### 2.1 已存在且直接复用

- Desktop Local `v1alpha2` 已有 compatibility negotiation、strict error envelope、additive feature 和
  `window.robothreeDesktopV1Alpha2` sidecar；`v1alpha1` 必须保持不变；
- `PersonalModelSafeSummaryV1Alpha2Schema` 已包含安全的 provider/model/display/status/credential state
  投影，不含 Secret、Credential Reference、owner digest 或完整 Endpoint；
- migration 23 已提供 owner namespace、immutable definition/head/status history、preference、Operation
  Journal 和 durable Receipt；migration 24 已提供 local invocation/Usage facts；
- `PersonalModelCredentialCoordinator` 已提供 safe `prepare()` 与 sensitive `executePrepared()`；
- `PersonalModelCredentialRevealService` 已提供 owner/revision 复核、单并发、限频、deadline 和一次性 tombstone；
- Main ↔ Core 已有 fd4/fd5 binary Broker，JSON lifecycle IPC 保持独立；
- Main 已有 `PersonalCredentialBrokerClient` 和 `PersonalCredentialRevealDelivery`；
- Personal Provider、Composite Catalog/Resolver、Task lock、Agent Loop/Compaction/Recovery 已通过 DFI-4A.3；
- v1alpha2 SubmitTurn Contract/Coordinator 已支持 `requestedModelId` 与智能授权选择，但尚未穿透
  Core private HTTP、Main 和 Preload v1alpha2 sidecar；
- DFE-5A.1 个人模型区仍明确 GATED，没有真实 CRUD、Key 输入、reveal 或默认偏好操作。

### 2.2 当前未接通，必须诚实修复

| 编号 | 当前代码事实 | DFI-4A.4 影响 |
| --- | --- | --- |
| G1 | `create-desktop-private-runtime.ts` 尚未实例化 personal persistence、Keychain、Coordinator、Composite Catalog/Resolver 或 startup recovery，仍使用固定 `activeUserId` 与企业模型 Fixture | 不能把既有单元组件误称为 Desktop production activation |
| G2 | `desktop-private-main.ts` 的 sensitive Broker handler 固定返回 `credential_store_unavailable` | CRUD/reveal 目前在真实 Desktop 必然失败 |
| G3 | Core boot message 没有 verified helper descriptor；`MacOsKeychainPersonalCredentialStore` 无 descriptor 时按设计失败关闭 | 必须冻结包内 helper manifest、路径和签名事实如何进入 Core，不能接收 Renderer 路径 |
| G4 | v1alpha2 feature enum/API/HTTP/Main/Preload 只有 workspace browser/reveal 等既有能力 | 个人模型 safe/sensitive interface 尚不存在 |
| G5 | `PersonalCredentialRevealDelivery` 有单 consumer，但尚未绑定真实 `webContentsId`/main frame/navigation 生命周期 | reveal 不能直接开放给 Renderer |
| G6 | Settings 页面仍经 v1alpha1 `listModels()` 读取企业/平台摘要；当前 Desktop catalog composition 不会返回真实 personal rows | DFI-4A.4 必须提供独立 personal catalog Projection，DFE 后续再合并展示 |
| G7 | `requestedModelId` 只证明当前 Task 选择；`PreferenceMutationIntent` 明确要求独立 safe command | 不能因为用户选一次模型就静默写默认偏好 |
| G8 | 当前 production Desktop composition 没有可验证的 Runtime Active personal owner authority provider | DFI-4A.4.0 必须先证明权威来源；不得用固定用户、OS 用户或 Main/Renderer 自报代替 |
| G9 | migration 23/24 已能表达管理、偏好、调用与恢复事实 | 默认禁止 migration 25；若无法实现，停止编码回文档评审 |

### 2.3 对旧工期的二次修正

主计划原估算 5～8 日只覆盖了“接口胶水”，没有计入 G1～G8 的 production composition、敏感
MessagePort、v1alpha2 SubmitTurn 与真实 restart E2E，因此曾修订为 21～34 日。4A.4.0 进一步证明：
identity composition 需要 Enterprise Integration production foundation，sensitive transport 也必须重新
选型。原 21～34 日现已 **失效，不再作为承诺或排期依据**。

当前仅冻结两个 blocker 前置方案的独立估算：Identity **17～28 日**，路线 A Transport **15～25 日**；
两者不应机械相加为最终工期，DFI-4A.4.1～4A.4.3 必须在两个 Unblock Audit 后基于选定实现重新估算。
所有估算均不含独立 QA、返工、真实 OA/MDM、Apple 正式签名/公证和用户现场验收。

## 3. 不变量

1. `v1alpha1` schema、digest、channel 与行为零改写；所有新能力只进入 `v1alpha2` additive surface；
2. Renderer/Main 不成为个人模型业务 owner；Core 重新校验 authority、revision、head、status、credential binding；
3. enterpriseId/userId/deviceId/entitlement/offline state 只来自 Runtime Active 权威事实，不接受 Renderer、
   Preload、Main 或普通 HTTP 请求自报；
4. 状态 2 允许同 owner 使用/配置/reveal，状态 3 禁使用/配置/reveal但允许删除；不新增离线租约或失联阈值；
5. Secret 不进入普通 `ipcRenderer.invoke` payload、Core private HTTP、Contract safe Projection、SQLite、
   Event、Audit、日志、错误、Evidence、URL、argv、env 或临时文件；
6. Main/Preload 不读取企业 Credential，企业 Credential 永不通过任何 personal sidecar；
7. create/update/delete 只调用既有 Coordinator；Main 不复制 request digest、credential mutation、
   recovery 或 Transaction A/B 判定；
8. reveal 不创建 durable success Receipt、不自动重放、不 fan-out、不广播、不写剪贴板；
9. 个人模型失败不 fallback 企业模型，企业失败也不 fallback 个人 Key；
10. `requestedModelId` 永不单独证明用户默认偏好 mutation；
11. 已接受 Task 的 `TaskCapabilityLock` 不因列表刷新、偏好、编辑、删除或权限变化而漂移；
12. migration 23/24、Conversation Message、Task lock、Provider Usage 各自保持单一事实源；
13. Desktop feature 只有在对应 production composition 真实 ready 时才宣布，缺失依赖必须从
    compatibility 中移除并返回 typed unavailable；
14. 不新增第二套 Personal Model list、CRUD、reveal 或 preference 状态机。

## 4. 接口分层

### 4.1 普通安全 v1alpha2 sidecar

`window.robothreeDesktopV1Alpha2` 只新增不含 Secret 的接口：

- `listPersonalModels(query)`；
- `loadModelPreference(query)`；
- `setModelPreference(command)` / `clearModelPreference(command)`；
- `submitTurnV1Alpha2(command)` / `querySubmitTurnV1Alpha2(query)`；
- 个人模型 mutation 的 safe preparation/status 只供 Main 内部 Core client 使用，不直接暴露 Renderer。

新增 feature 建议穷尽为：

```text
personal_model_catalog
personal_model_mutation
personal_model_preference
personal_credential_reveal
submit_turn_v1alpha2
```

`personal_model_catalog` 可在 Keychain 暂时不可用时保持只读并投影真实 unavailable；mutation/reveal
只有 owner authority、Broker、verified helper 和 Core service 均 ready 时才宣布。

### 4.2 专用敏感 Preload Sidecar（旧 transport 假设已被 Revision 1 取代）

新增独立冻结对象 `window.robothreePersonalModelV1Alpha2`，只包含：

```text
createPersonalModel(input, apiKey)
updatePersonalModel(input, apiKey?)
deletePersonalModel(input)
revealPersonalModelKey(input) -> Uint8Array
```

约束：

- API Key 在 Renderer 主世界不可避免先是 JS String；组件必须在 submit/close/unmount/navigation 后清空
  本地引用，且不得放进全局 store、URL、DOM attribute、telemetry 或 snapshot；
- Preload 立即做长度/类型校验并编码为 `Uint8Array`，后续不创建 Secret String；
- Preload ↔ Main 的具体敏感传输由
  [Sensitive Renderer↔Main Transport Revision 1](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-REVISION-1.md)
  冻结；原“一次性 MessagePort + transferable ArrayBuffer 到 Main”假设已撤回，当前不得编码；
- Main 从真实 IPC event 派生 `webContentsId`、main frame 与 origin，不接受 Renderer 传这些身份；
- 每次 command 绑定 runtimeInstanceId、clientInstanceId、commandId、correlationId、webContentsId、
  main frame 与 request digest；navigation、reload、window close、Core restart 或 port close 都取消并清理；
- reveal 只能走最终经评审和进程级 Harness 证明的单一 sensitive transport profile；应用层可控
  byte holder 负责 `fill(0)`，但不得宣称 Electron/Chromium/JS 内部副本可可靠清零；普通 API 永不返回 Secret；
- DFE 后续真正显示 reveal 值时不可避免产生短生命周期 JavaScript String；方案不得宣称该 String 可可靠
  清零，只允许组件局部、单实例、短 TTL 展示，并在 hide/timeout/close/unmount/navigation 时释放引用、
  清空 DOM text，不进入全局 store、缓存、剪贴板、telemetry、snapshot 或错误；
- 同一 command 不合并 reveal waiter；重复/late/stale/mismatched frame 失败关闭。

### 4.3 Core private HTTP

仅 Main 可通过 tokenized loopback HTTP 使用以下安全路由：

```text
POST /v1alpha2/personal-models/list
POST /v1alpha2/personal-models/mutations/prepare
POST /v1alpha2/personal-models/mutations/status
POST /v1alpha2/personal-models/preference/load
POST /v1alpha2/personal-models/preference/commit
POST /v1alpha2/turns/submit
POST /v1alpha2/turns/status
```

这些路由不接收 Secret。Mutation 的 sensitive execute 继续只走 fd4/fd5 Broker。

### 4.4 Personal Model safe Projection

复用 `PersonalModelSafeSummaryV1Alpha2`，列表页再增加：

- `queryRevision`、opaque `nextCursor`、page limit `1..100`；
- safe permission projection：`canConfigure/canUse/canReveal/canDelete` 与 typed reason；
- optional safe preference projection：source、modelId、personal configuration revision、preference revision；
- 任何完整 Endpoint 只留 Core 私有，Renderer 只见 `endpointDisplayHost` + `endpointIdentityDigest`；
- 不投影 credentialRef、credential binding、owner/namespace digest、Runtime Handle、Provider response、
  access token、device trust material 或 helper path。

### 4.5 用户可编辑材料由 Core 物化

Renderer 只提交产品字段：provider、custom endpoint（仅 custom）、provider model id、display name 与
API Key presence。以下技术事实由 Core 生成或锁定：

- personalModelId；
- protocol=`openai_compatible`；
- Provider Profile/Adapter revision；
- preset Endpoint；
- conservative capabilities；
- canonical Endpoint/digest；
- configuration/execution revision；
- credentialRef、credential mutation mode、binding digest；
- request/record/receipt digest。

Preset Provider 不接受 Renderer 覆盖 Endpoint；custom 首期使用保守 text/streaming capability，除非后续
产品 Spec 单独开放高级能力。displayName-only 更新复用已有 Credential；Provider/Endpoint/protocol 边界
变化或用户明确更换 Key 时必须提交新 Key，是否需要 Key 由 Core 计算，不信任 Renderer boolean。

## 5. 生产组合与启动顺序

### 5.1 DFI-4A.4.0 必须先回答的权威来源

必须新增或确认一个 Core-private `RuntimeActivePersonalModelOwnerAuthorityContextProvider`，从现有已验证的：

- Enterprise Access Token/session validity；
- Device Trust；
- Runtime Active enterprise/user/device scope；
- `personal_model.configure` entitlement 与 revision；
- CGF-1.3 offline state；

派生 owner context。禁止使用当前固定 `activeUserId`、`process.getuid()`、Main 参数、Renderer 参数或
“数据库只有一行”推断 owner。若现有 production composition 尚无这些事实的可信读取端口，4A.4.0
必须结论为 `BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION`，4A.4.1～4A.4.3 不得编码；不得以 Fake
authority 将功能标记 ready。

### 5.2 Helper descriptor

- production descriptor 只来自固定包内 manifest：canonical helper path、manifest SHA-256、protocol、
  designated requirement、Team Identifier；
- Main 可以把不含 Secret 的 descriptor 随 boot message 传给 Core，Core 必须再次执行 containment、
  regular-file/no-symlink/owner/mode/digest/codesign/team 校验；
- test helper 只允许显式 Harness composition + 临时 Keychain，不能通过生产环境变量静默启用；
- 正式 installer/notarization 不在 DFI-4A.4 关闭范围，但生产 build 无 verified descriptor 时
  mutation/reveal 必须 fail-closed 且 feature 不宣布。

### 5.3 Core startup 顺序

```text
migration 1..24 / schema preflight
  -> Runtime Active identity + offline/entitlement snapshot
  -> PersonalModelPersistence + LocalInvocationPersistence
  -> verified Keychain helper + Credential Store
  -> CRUD/Reveal Coordinator recovery（不盲发 Secret）
  -> local invocation recovery classification（不盲发 Provider）
  -> Composite Catalog / Selection / Task-lock Resolver
  -> DurableAgentLoopStarter / Compaction
  -> Core private HTTP + sensitive Broker
  -> compatibility features ready
```

任何前置失败不得在 HTTP ready 后后台静默补齐，也不得宣布对应 feature。

## 6. Command 与恢复语义

### 6.1 Create/Update/Delete

1. Renderer 调用专用 Sidecar；Preload 建立一次性 port；
2. Main 验证 main frame、window、runtime instance、feature 和 bounded input；
3. Main 通过 safe HTTP 调 Core materializer + `prepare()`，Transaction A 先持久；
4. prepare 成功后 Main 才把 Secret bytes/empty body 交给 fd4/fd5 Broker；
5. Core Broker handler 调 `executePrepared()`，完成 Keychain observation 与 Transaction B；
6. Main 通过 safe mutation status 查询取得 durable Receipt/Summary，向 Renderer 返回 safe outcome；
7. timeout/disconnect 时按 Operation Journal/Receipt 查询，不从 transport 结果猜测成功；
8. `manual_attention/cleanup_pending/uncertain` 必须如实投影，不伪装“保存成功/删除成功”。

同 commandId + 同 material 重放同一结果；同 commandId + 不同 material typed conflict。Core restart
使 sensitive transport session 失效，但不会丢 durable intent/Receipt；新 Main/Core 只按既有恢复规则继续。

### 6.2 Reveal

1. Renderer 只提交 modelId + expected configuration/execution revision；
2. Main 绑定真实 webContents/main frame/runtime/client/command；
3. Core 每次重检 owner、entitlement、offline state、head/revision/credential binding；
4. Broker resolve 后通过已评审、版本锁定的 sensitive transport profile 送回同一 Preload consumer；
5. navigation/close/cancel/deadline/V1/V2 只返回 typed terminal，永不自动重放；
6. Main/Preload 不缓存、不广播、不写 clipboard；Renderer UI 默认掩码且没有复制按钮；
7. reveal tombstone 不成为用户已看到 Secret 的 durable 证明。

### 6.3 Preference 与 Task selection

- `set/clear preference` 是单独 safe command，使用 migration 23 `commitPreferenceOutcome()`；
- Contract 必须显式携带 mutation intent；不得从 `requestedModelId` 推断；
- v1alpha2 SubmitTurn 可 additive 增加 `modelPreferenceMutation`，旧客户端缺失时等价 `none`；
- 当前 Task selection 先按 requested model 形成 exact lock；preference mutation 使用从
  submitTurnCommandId 稳定派生的 command identity 幂等提交；
- preference 失败不回滚或改写已提交 Task lock，Receipt 必须返回 typed partial outcome；
- 机器人临时 effective model 不写 user preference；取消机器人后按统一规则重新解析；
- 企业为空且只有可用个人模型时返回 `personal_model.explicit_selection_required`，不自动挑一个；
- 删除当前 preference 后保留 cleared preference fact，并按统一企业-first/explicit-personal 规则处理新任务。

## 7. 分批实施

### DFI-4A.4.0：Production Composition Preflight（3～5 日）

只验证并冻结：

- Runtime Active owner authority 的真实来源和 offline 2/3 映射；
- signed helper manifest/boot descriptor/production fail-closed；
- current Desktop private runtime 装配缺口清单和启动顺序；
- v1alpha2 safe/sensitive channel namespace 与 one-shot MessagePort Spike；
- v1alpha2 SubmitTurn/preference additive Contract 兼容性；
- migration 23/24 是否足够；
- 若必须进入 Enterprise Integration、formal installer 或 migration 25，立即回文档评审。

4A.4.0 不开放 Renderer API、不接真实 UI、不写生产 CRUD 成功路径。

Preflight 实际结论见
[DFI-4A.4.0 Production Composition Preflight 报告](./DFI-4A.4.0-PRODUCTION-COMPOSITION-PREFLIGHT-REPORT.md)：

- production identity composition 无可信 `EnterpriseAccessTokenProvider` 实现和 Runtime Active
  enterprise/user/device/entitlement 组合，触发 `BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION`；
- Electron 43.2.0 sandboxed Preload↔Main 双向 MessagePort 控制握手成立，但 transferable
  `ArrayBuffer` 只在 sender detach、未抵达 Main，触发 `BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER`；
- helper trust primitives 已有，但 production packaging/descriptor/broker handler 尚未完成；
- migration 23/24 足够，不新增 migration 25；v1alpha2 additive surface 可行但未实现。

### DFI-4A.4.1：Production Composition + Safe v1alpha2 Interface（6～9 日）

- 装配 authority/persistence/Coordinator/Provider/Resolver/recovery；
- 新增 personal catalog/preference/submit-turn safe Contract、Core service/HTTP、Main client/router、Preload API；
- feature negotiation 与 production readiness fail-closed；
- 列表 cursor/queryRevision、typed errors、preference durable Receipt；
- 不传 Secret，不开放 sensitive mutation/reveal。

### DFI-4A.4.2：Sensitive Sidecar + CRUD/Reveal（原估算 6～10 日，待 transport 决策重估）

- 采用 Revision 1 最终选定且经 STRM Harness 证明的单一 sensitive transport profile；
- safe prepare + fd4/fd5 execute + durable status 查询；
- create/update/delete/reveal 全链；
- navigation/restart/deadline/cancel/late response/duplicate request 资源收口；
- 真实临时 macOS Keychain 与 test-isolated signed/helper E2E；
- 不修改 Renderer 页面。

### DFI-4A.4.3：Selection/Restart/Closure E2E + DFE Handoff（6～10 日）

- v1alpha2 SubmitTurn personal selection + exact lock + Agent Loop；
- preference mutation partial outcome；
- 企业为空/个人显式选择、机器人约束、删除默认、权限收窄；
- Desktop/Core restart、Keychain locked、并发 edit/delete/reveal、执行中删除阻断；
- 受控 TLS Provider、真实 Keychain、资源归零、四通道泄漏扫描；
- 交付 DFE Adapter/Mock 删除门槛与接口交接文档；Renderer 仍不修改。

## 8. 允许与禁止修改范围

### 8.1 子批授权后允许

- `packages/contracts/src/desktop-local/v1alpha2/**` 与对应 tests；
- `services/core/src/application|ports|adapters|bootstrap|desktop-private-main.ts` 与对应 tests；
- `apps/desktop/src/shared|main|preload/**` 与对应 tests；
- `tests/e2e/**`、受控 Helper/Harness、必要 package scripts；
- 每个完成批次的版本、CHANGELOG、DEVELOPMENT-LOG、README 状态收口。

### 8.2 明确禁止

- `apps/desktop/src/renderer/**`；
- Desktop Local `v1alpha1`；
- migration 1～24 改写或 migration 25；
- Central、Document Worker、Knowledge、Memory、DFI-2B、DFI-3、TGM；
- 个人模型测试连接、自动 fallback、Prompt Cache 显式启用；
- LocalStorage/SessionStorage/IndexedDB/SQLite Secret、Base64 Secret、argv/env/file Secret；
- 新第三方依赖和 `pnpm-lock.yaml`，除非另行文档评审与用户授权；
- formal installer/notarization 的完成声明。

## 9. QA 矩阵

### 9.1 Contract 与 safe Projection（1～18）

1. v1alpha1 canonical digest/schema/channel 零漂移；
2. v1alpha2 五项 feature 独立协商；
3. unsupported feature typed fail-closed；
4. list limit 1/100/101；
5. opaque cursor + queryRevision；
6. active set 漂移返回 stale cursor；
7. Personal safe summary 八状态 strict matrix；
8. credential state strict matrix；
9. full Endpoint 只在 Core private；
10. safe projection 无 credentialRef；
11. safe projection 无 owner/namespace digest；
12. safe projection 无 token/device trust material；
13. permission projection 来自 Core authority；
14. preset endpoint 不接受 Renderer override；
15. custom endpoint 复用 canonicalizer；
16. provider/model/display name 不混字段；
17. personalModelId 由 Core 生成；
18. unknown/extra fields strict reject。

### 9.2 Production composition（19～32）

19. Runtime Active identity 不是 fixed/OS/Main/Renderer source；
20. offline state 2 允许；
21. offline state 3 禁 configure/use/reveal、允许 delete；
22. Central 暂不可达不等于权限失效；
23. entitlement revoked 收窄 feature；
24. verified helper descriptor fixed package path；
25. symlink/path/digest/signature/team mismatch 拒绝；
26. unsigned production build mutation/reveal feature 不宣布；
27. migration 23/24 startup 顺序；
28. CRUD recovery before feature ready；
29. invocation classification before feature ready；
30. broker handler 不再固定 unavailable；
31. Core version/runtimeInstanceId 正确；
32. no migration 25。

### 9.3 Sensitive Sidecar（33～55）

33. Secret 不走普通 invoke/HTTP；
34. selected one-shot sensitive transport profile 的双向 byte delivery；
35. subframe 拒绝；
36. foreign webContents 拒绝；
37. Renderer 自报 webContentsId 无效；
38. stale runtimeInstanceId 拒绝；
39. navigation/reload/close 取消；
40. Preload input size upper bound；
41. Main inflight/registry upper bound；
42. create Secret presence；
43. metadata update empty Secret；
44. upstream boundary update 强制新 Secret；
45. delete empty body；
46. reveal bytes 仅送达 exact consumer，且不宣称不可控副本可清零；
47. Sidecar reveal 只返回 bytes；显示层短生命周期 String 不持久、不进全局状态并按 TTL 清理；
48. reveal 不合并 waiter；
49. reveal replay forbidden；
50. rate limit/global concurrency；
51. deadline/cancel/late result 单终态；
52. Core restart 旧 port/command session 失效；
53. Renderer/Main/Core identity mismatch fail-closed；
54. seven-layer bytes cleanup；
55. no clipboard/log/cache/broadcast。

### 9.4 CRUD/Preference/Selection（56～78）

56. create prepare-before-Keychain；
57. update carry-forward + exact revision；
58. delete_pending 立即阻止新选择；
59. delete in-use/usage unknown 阻断；
60. committed Receipt replay；
61. manual_attention 诚实投影；
62. cleanup_pending 诚实投影；
63. uncertain 不伪装成功；
64. preference set/clear durable；
65. requestedModelId 不自动写 preference；
66. explicit mutation command 才写 preference；
67. preference conflict/replay；
68. Task accepted + preference failed typed partial；
69. enterprise-first；
70. personal explicit selection required；
71. explicit personal exact Task lock；
72. agent override forbidden；
73. robot temporary selection 不改 preference；
74. delete preferred model 后统一规则；
75. enterprise/personal failure no fallback；
76. context window unknown fail-closed；
77. existing Task lock survives edit/delete；
78. main/compaction exact personal revision。

### 9.5 Restart/E2E/Security（79～100）

79. Main restart + same Core facts；
80. Core crash + new runtimeInstanceId；
81. Desktop restart + list/preference一致；
82. Keychain locked/unlocked；
83. concurrent edit/delete；
84. concurrent mutation/reveal；
85. C1～C4/U1～U3/D1～D3；
86. V1/V2；
87. I1～I5；
88. real temporary macOS Keychain；
89. controlled TLS OpenAI-compatible Provider；
90. streaming/cancel/deadline；
91. Usage known/unknown；
92. 50-round Tool Loop + compaction regression；
93. two Core/two SQLite isolation；
94. four channels × five marker classes；
95. raw/Base64/URL-encoded canary scan；
96. connection/timer/subscription/request/port/child/helper 归零；
97. no real Key/Endpoint/body/path in Evidence；
98. Workspace full check；
99. Central online/offline serial；
100. Renderer/DFI-2B/DFI-3/TGM/no-test-connection boundary。

## 10. 正式门禁

每个子批需有独立 Harness；4A.4.3 最终至少串行执行：

```bash
CI=true pnpm run harness:dfi4a4
CI=true pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run check
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central:offline
```

- Node 必须是 `.node-version` 声明的 `24.13.0`；
- Harness、Workspace、Central 必须严格串行；
- 真实 Keychain 测试使用临时 Keychain，结束后清理；
- Provider 使用受控本地 TLS，不使用真实用户 Key、外网或付费调用；
- Evidence 只保留 count/digest/status/duration/resource/typed error，不保留 Secret、正文、完整 Endpoint、
  路径、PID、端口、owner identity 或 Credential Reference。

## 11. DFE 接口交接门槛

只有 DFI-4A.4.3 独立 QA PASS 且用户接受后，才允许后续 DFE 批次：

- 将 Settings Adapter 从 v1alpha1 `listModels()` 切到企业安全摘要 + personal catalog 组合；
- 删除“个人模型管理待接入”GATED 卡片；
- 接入添加/编辑/删除/reveal/设为默认；
- 接入 Workbench 个人模型显式选择与 preference partial outcome；
- 实现 API Key 组件局部清理和 reveal 生命周期；
- 不改变本文件冻结的安全/业务语义。

DFI 完成不自动授权 DFE，也不允许 DFI 批次修改 Renderer。

## 12. 文档评审问题

1. G1～G9 是否与当前代码一致；
2. DFI-4A.4.0 是否必须先证明 Runtime Active authority 与 helper packaging；
3. authority 缺失时停止而不是使用 fixed user 是否正确；
4. v1alpha2 五个 feature 是否拆分得足够细；
5. safe sidecar 与 sensitive sidecar 是否正确分离；
6. Sensitive Transport Revision 1 的 A/B/C 路线、选择门槛和剩余内存风险是否可接受；
7. exact webContents/main-frame/navigation binding 是否完整；
8. Core materializer 是否正确避免 Renderer 操作 revision/digest/capability；
9. preset/custom Endpoint 与 capability 派生是否符合 Product Spec；
10. safe prepare + fd4/fd5 execute + safe status query 是否复用既有两阶段语义；
11. reveal 是否保持无 durable success、无 replay，且诚实区分 byte transport 与显示层短生命周期 String；
12. explicit preference command 与 SubmitTurn partial outcome 是否正确；
13. production composition 是否可在 migration 23/24 内完成；
14. signed installer/notarization 后置但 production feature fail-closed 是否诚实；
15. 4A.4.0～4A.4.3 拆分和 100 项原 QA 是否仍可复用，以及在两个 Unblock Audit 后重估剩余工期是否正确；
16. 是否出现必须进入 Enterprise Integration、DFI-2B、DFI-3、TGM 或修改 Renderer 的事实；
17. 给出 PASS / PASS_WITH_REVISIONS / FAIL 及 P0/P1/P2/P3 发现。

## 13. 当前门禁

```text
DFI-4A.0～4A.3   PASS/CLOSED
DFI-4A.4 Plan    PASS/CLOSED
DFI-4A.4.0       PASS/CLOSED
Identity Repair  PLAN REVIEW PASS/CLOSED
EIPC-0           PASS/CLOSED
EIPC-2～EIPC-3   GATED
Transport Rev 1  PLAN REVIEW PASS/CLOSED
STRM-0           PASS/CLOSED
STRM-1           PASS/CLOSED
STRM-2 Plan      PASS/CLOSED
STRM-2.1～2.3    PASS/CLOSED
STRM-3           GATED
EIPC-1 Plan      PASS/CLOSED
EIPC-1.0         PASS/CLOSED
EIPC-1.1 Plan    PASS/CLOSED
EIPC-1.1.1～1.1.3.1 PASS/CLOSED
EIPC-1.1.3.2     IMPLEMENTED / INDEPENDENT QA PENDING
EIPC-1.1.3.3     GATED
EIPC-1.2～1.3    GATED
DFI-4A.4.1       GATED
DFI-4A.4.2       GATED
DFI-4A.4.3       GATED

DFI-2B           GATED
DFI-3            GATED
TGM              GATED
```

详细阻断方案：

- [Enterprise Identity Production Composition 修复方案](./DFI-4A.4.0-ENTERPRISE-IDENTITY-PRODUCTION-COMPOSITION-REPAIR-PLAN.md)；
- [Sensitive Renderer↔Main Transport Revision 1](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-REVISION-1.md)；
- [Sensitive Transport Threat Model](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-THREAT-MODEL.md)。

两份方案当前只进入文档评审。两个阻断项完成各自实现、独立 QA 并由用户接受前，不得进入
DFI-4A.4.1～4A.4.3 编码。
