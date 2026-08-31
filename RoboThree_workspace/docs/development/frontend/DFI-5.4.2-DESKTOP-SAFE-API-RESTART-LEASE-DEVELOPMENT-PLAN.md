# DFI-5.4.2 Desktop v1alpha5 Safe API / Restart Lease 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-28  
> 负责人：Codex 5.6  
> 父方案：[DFI-5.4 Desktop Max UI / Safe Preview / Production Cutover](./DFI-5.4-DESKTOP-MAX-UI-PRODUCTION-CUTOVER-DEVELOPMENT-PLAN.md)  
> 直接上游：[DFI-5.4.1 Max Core Contract / Durable Cutover](./DFI-5.4.1-MAX-CORE-CONTRACT-CUTOVER-DEVELOPMENT-PLAN.md)  
> 当前上游状态：DFI-5.4.1 `PASS/CLOSED`  
> 本批性质：Core private HTTP + Main IPC + sandboxed Preload Safe API + restart lease；不创建 Renderer Max UI  
> 下游：DFI-5.4.3、TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 public CRUD、Admin v2 consumption 继续 `GATED`

> Closure note（2026-08-28）：独立 QA 经 Node v24.13.0 聚焦环境校正后为
> `INDEPENDENT_QA_PASS`（P0=0/P1=0/P2=0/P3=0），用户已正式接受并关闭本批。此前 R2D-4
> 复跑异常属于 QA runtime/path 伪失败，不建立 repair 批次；Central 本批开发门禁在 JDK 21 环境完成
> 438/438 online/offline。该关闭不自动授权 DFI-5.4.3 编码。

## 0. 结论先行

DFI-5.4.2 只把 DFI-5.4.1 已冻结的 Max Core 能力安全送到 Desktop sandbox 边界，不负责页面交互，也不打开
production Max。完成本批后，Renderer 可以在下一批通过一个严格、冻结、默认不可用的 API namespace 接入；但
Compatibility 仍必须返回 `production_gate_disabled`，Workbench 不显示 Max，SubmitTurn Max 仍不可生产到达。

### 0.1 本方案对父方案 G4 的必要版本澄清

父方案早期把六方法 API 写为 `window.robothreeDesktopV1Alpha4`。该名称已被后续 R2D-P.3 正式占用，当前真实工程中：

```text
window.robothreeDesktopV1Alpha4
  getCompatibility
  submitTurn
  querySubmitTurn
```

它只承载 default-only R2D SubmitTurn，Contract 也不携带 reasoning preference。DFI-5.4.1 已把 Max request/receipt
冻结为 Desktop Local v1alpha5。因此本方案冻结：

```text
DFI-5.4.2 必须新建 window.robothreeDesktopV1Alpha5；
不得扩写 v1alpha4 request；
不得把 v1alpha5 body 伪装成 v1alpha4；
不得在 Main/Core 做 legacy Max 翻译分支。
```

本文件是父方案 §6 中 API version label 的 controlling clarification；父方案的安全、lease、六方法和无 Renderer UI
边界继续有效。

### 0.2 本批最高允许输出

```text
DFI542_DESKTOP_SAFE_API_CUTOVER_CONFORMANT
```

同时必须附带：

```text
productionDfi541ActivationEnabled=false
productionR2dActivationEnabled=false
productionCpcActivationEnabled=false
productionEnterpriseEntitlementReady=false
productionInstalledSubjectReleaseCount=0
productionMaxFeatureAvailable=false
rendererV1Alpha5ConsumerCount=0
desktopMaxUiReady=false
dfi543Unlocked=false
```

禁止输出 `PRODUCTION_READY`、`MAX_UI_READY` 或“Renderer 已接通”。

## 1. 进入条件与现有事实

### 1.1 编码进入条件

本方案可以先评审，但编码必须同时满足：

1. DFI-5.4.1 独立 QA 由用户正式接受并 `PASS/CLOSED`；
2. 本方案独立文档复核通过；
3. 用户单独授权 DFI-5.4.2 编码；
4. DFI-5.4.3 与其他下游继续 GATED。

### 1.2 已存在且必须复用

1. Desktop Local v1alpha5 request/receipt/error/compatibility/reasoning schemas；
2. ReasoningModeLock v1alpha2、Runtime Selection v1alpha4、coordination v1alpha5 与 durable envelopes；
3. DFI-5.4.1 Planner、exact admission、InMemory/SQLite atomic bundle 与 default-false composition；
4. CPC、R2D-P、PRA 与 DFI-5.3 已关闭的 durable/release/mapping 事实；
5. Core private loopback HTTP 的 exact Host/Origin/Bearer 校验与 bounded JSON reader；
6. `CorePrivateSupervisor.connectionLease()` 的 client/runtime/transport 三元 lease；
7. R2D-P.3 v1alpha4 Main router、Preload API 与真实 Electron/Core/SQLite Harness 原语；
8. ReasoningModePreviewService、ReasoningModePreferenceService、migration 26 preference persistence；
9. root check 当前 313 files / 2122 tests + 3 smoke，Central 当前 438/438；
10. migration max 26，lockfile digest
    `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

### 1.3 当前真实缺口

- Core facade/HTTP 没有 v1alpha5 六条 route；
- `desktop-application-facade` 没有 production-facing
  `compatibilityV1Alpha5 / submitTurnV1Alpha5 / querySubmitTurnV1Alpha5` method；Coordinator 内部对
  coordination v1alpha5 schema 的 additive import 已由 DFI-5.4.1 落地，本批不得把该 import 误报为 production 接线；
- Preview/Preference 未进入 Desktop private composition；
- v1alpha5 只有 preference get query，没有对应 safe projection schema；
- Main/Core client 没有 v1alpha5 route mapping；
- Preload 没有 `window.robothreeDesktopV1Alpha5`；
- v1alpha4 router 的存在不能证明 v1alpha5 lease 与 lifecycle 已关闭；
- 5.4.1 historical Harness 的“Desktop v1alpha5 consumer=0”是当时事实，不能冒充 5.4.2 验收。

## 2. 范围与非目标

### 2.1 本批范围

1. additive 补齐 v1alpha5 safe preference projection；
2. Core v1alpha5 facade 与六条 exact private HTTP routes；
3. DFI-5.4.1 Planner/durable acceptance 到现有 coordinator/persistence 的唯一接缝；
4. Main CorePrivateClient v1alpha5 strict client；
5. Main v1alpha5 IPC router、client binding registry 与 restart lease；
6. sandboxed Preload frozen v1alpha5 API；
7. route/IPC/preload/lease/lifecycle focused Harness 与 Evidence。

### 2.2 明确非目标

- 不实现 Renderer Adapter、Workbench Max switch、状态文案或可访问性 UI；
- 不把 production gate 改为 true；
- 不安装 production subject release；
- 不修改 Provider mapping、raw body、timeout、Usage、Tool round 或 Compaction 语义；
- 不新增 migration 27、依赖或 lockfile 变化；
- 不修改 Central、Admin、Document Worker、TGM、Knowledge Provider 或 Agent Lifecycle；
- 不修改 Desktop v1alpha1/v1alpha2/v1alpha4 的 request、response、channel 或 namespace；
- 不用 Mock、Fixture、LocalStorage 或 Renderer 自报事实冒充 production ready。

## 3. G1：Desktop v1alpha5 Safe Contract completion

### 3.1 独立 namespace

新增且只新增：

```text
window.robothreeDesktopV1Alpha5
  getCompatibility
  previewReasoningMode
  getReasoningModePreference
  updateReasoningModePreference
  submitTurn
  getSubmitTurnStatus
```

命名与 Contract version 必须逐项一致。v1alpha4 继续只有既有三个方法；不得给 v1alpha4 增加 reasoning 字段或别名。

### 3.2 补齐 preference safe projection

在 `@robothree/contracts/desktop-local/v1alpha5` exact subpath additive 新增：

```text
ReasoningModePreferenceProjectionV1Alpha5
  contractVersion = v1alpha5
  requestedMode = default | max
  preferenceRevision?
  preferencePersistence = available | unavailable
  testIdentityUsed
  productionIdentityReady
```

交叉约束：

- `available` 必须带 exact non-negative revision；
- `unavailable` 必须投影 `requestedMode=default`、无 revision；
- `testIdentityUsed=true` 与 `productionIdentityReady=true` 互斥；
- 不含 owner identity、HMAC、Profile、Strategy、mapping、Credential 或 raw reason；
- 不修改既有 v1alpha5 schema 字段，不从 Contracts 根入口导出。

这是 DFI-5.4.2 API response contract 的 additive completion，不改 DFI-5.4.1 durable digest material。

### 3.3 strict safe result

Main 与 Preload 统一使用：

```text
RendererSafeResultV1Alpha5<T>
  { ok: true, value: T }
  | { ok: false, error: DesktopErrorEnvelopeV1Alpha5 }
```

禁止额外字段、unknown success payload、stack、Zod path、transport token 或 internal cause 穿透。

## 4. G2：六条 exact Core private HTTP routes

### 4.1 Route inventory

```text
POST /v1alpha5/control/compatibility
POST /v1alpha5/reasoning/preview
POST /v1alpha5/reasoning/preference/get
POST /v1alpha5/reasoning/preference/update
POST /v1alpha5/turns/submit
POST /v1alpha5/turns/status
```

禁止 generic dispatcher、动态 method name、GET mutation 或 v1alpha4 alias。

### 4.2 HTTP boundary

- 继续要求 exact loopback Host、`robothree://desktop-main` Origin 与 private Bearer；
- Compatibility/Preview/Preference/Status request 上限 16 KiB；SubmitTurn request 上限 160 KiB；
- 非 Submit response 上限 64 KiB；Submit/Status response 上限 256 KiB；
- Content-Type 必须为 JSON；redirect 不允许；未知 route 返回固定 safe error；
- request abort 在 durable commit 前终止只读/未提交工作；commit 后不得声称取消成功，调用方以原 commandId 查询；
- HTTP 层只 strict parse/dispatch/map，不重算 Preview、resolution、Receipt 或 persistence winner。

### 4.3 Gate 三态

| composition | Compatibility | 业务 routes | production 声明 |
| --- | --- | --- | --- |
| code-owned false | feature unavailable / `production_gate_disabled` | typed `contract.feature_unavailable`，下游调用 0 | 默认生产状态 |
| enabled + incomplete test graph | construction/start fail-fast | 不监听 | 禁止半装配 |
| test-only complete graph | feature available | 六 route 可验证 | 只用于 Harness |

production bootstrap 在本批结束时仍只能得到第一行。不得用 env、CLI、Renderer、Admin 或 Preference 打开 gate。

## 5. G3：Core application integration

### 5.1 Preview

- `PreviewReasoningModeQueryV1Alpha5` strict parse；
- effective Model 必须来自 Core 已锁定的 selection authority，不信任 Renderer model metadata；
- exact Profile load 恰好一次；无 Profile 为 `unknown`；
- preference owner 不可信时返回 `preferencePersistence=unavailable`，不得使用 test owner 冒充 production；
- response 只含 safe support/revision/reason，不含 Profile material。

### 5.2 Preference get/update

- 为既有 ReasoningModePreferenceService 增加只读 `get` 接缝或独立同域 Query Service；owner resolution 只保留一个实现；
- get 不写库，owner unavailable 返回 safe default projection；
- update 复用 migration 26 CAS + durable Receipt；commandId 同 material exact replay，不同 material conflict；
- response loss 不自动 retry；原 commandId 再次调用返回同一 durable winner；
- Preference 失败不改变本次 SubmitTurn command 中显式 reasoning preference。

### 5.3 SubmitTurn v1alpha5

- 复用现有 `accepted → message_appended → task_committed → completed` 状态机；
- 调用 DFI-5.4.1 Planner 只发生在首次 acceptance；
- Task、locks、Runtime Selection v1alpha4、Authorization、ReasoningModeLock v1alpha2、Instruction Binding、
  admission/resolution evidence 同一 Task bundle transaction；
- accepted 后 recovery 只读 durable exact plan，不读取 current Preference/Profile/release；
- fallback 仍是同 command/Task/Message，不创建第二次 SubmitTurn；
- query 只读取原 Receipt，terminal replay 不重新 Preview/plan/map/provider；
- Main、HTTP、Preload 都不得复制 resolution 真值表。

### 5.4 Error mapping

固定 safe mapping 至少覆盖：

```text
contract.invalid
contract.unsupported_version
contract.feature_unavailable
reasoning.runtime_changed
reasoning.client_mismatch
runtime.request_aborted
reasoning_mode.preference_unavailable
reasoning_mode.preference_conflict
reasoning_profile_unavailable
reasoning_lock_integrity_invalid
reasoning_protocol_unavailable
reasoning_admission_integrity_invalid
submit_turn.not_found
submit_turn.invalid_selection
```

未知 internal error 只能投影固定 `internal` safe summary；不得把 error.message、stack、Zod issues 或 private code 原样发送。

## 6. G4：Main IPC 与 Core client

### 6.1 六个 exact IPC channels

```text
robothree:v1alpha5:compatibility
robothree:v1alpha5:preview-reasoning-mode
robothree:v1alpha5:get-reasoning-mode-preference
robothree:v1alpha5:update-reasoning-mode-preference
robothree:v1alpha5:submit-turn
robothree:v1alpha5:get-submit-turn-status
```

Main 只做 strict Contract mapping、lease、binding、safe error forwarding。禁止 generic `invoke(method, body)`。

### 6.2 Runtime lease

每次调用顺序固定：

1. strict parse Renderer request；
2. 读取当前 webContents/client binding；
3. 捕获单一 `{client, runtimeInstanceId, transportClientInstanceId}` lease；
4. 验证 client 已在该 runtime 成功 Compatibility；
5. 使用该 lease 发起恰好一次 Core call；
6. response strict parse；
7. 返回前 `isCurrentConnectionLease(lease)`；
8. 若漂移，丢弃业务结果并返回 `reasoning.runtime_changed`。

步骤 3～7 之间不得再次 `resolveConnection()`；不得把旧 compatibility 与新 runtime 的业务调用拼接。

### 6.3 Client binding registry

- Renderer `clientInstanceId` 必须是原始 UUID；禁止 `renderer:prefix:*`；
- Renderer client ID 与 Main↔Core transport ID 分层，不要求相等，也不据“不相等”判断 owner；
- 同一 webContents 只能绑定一个 client；同一 client 不得跨 webContents 重用；
- registry 最大 16，超限 fail-closed，不 LRU 驱逐；
- navigation generation 变化、render-process-gone、destroyed、router clear 时删除 binding 与 inflight AbortController；
- Core restart 后旧 negotiation 无效，必须重新 Compatibility；不自动 replay Preference/SubmitTurn command。

### 6.4 CorePrivateClient

- 六个方法分别 strict parse request、safe result 与 response；
- 每个方法只允许调用对应 exact route；
- 不暴露 authorization token、base URL 或 transport identity；
- Preview/Preference timeout 采用有界 UI transport deadline，不修改 Provider invocation durable deadline；
- SubmitTurn transport timeout 不等于 Task timeout，超时后只能用原 commandId 查询 status。

## 7. G5：sandboxed Preload API

### 7.1 Frozen allowlist API

`createDesktopApiV1Alpha5()` 返回 `Object.freeze` 的六方法对象；每个方法：

1. 在 Preload 侧 strict parse input；
2. 调用唯一 exact IPC channel；
3. strict parse `{ok,value}|{ok,error}`；
4. 返回 safe typed result。

不得暴露 `ipcRenderer`、channel 字符串、Core token、runtime lease、transport client ID、Profile 或 mapping。

### 7.2 Renderer 边界

本批只允许 global type declaration 和 contextBridge exposure；`apps/desktop/src/renderer/**` 不得导入或调用
v1alpha5。DFI-5.4.3 才创建 Adapter/UI。

## 8. Historical Evidence 与版本迁移纪律

DFI-5.4.1 的 historical Evidence/Harness 保持只读、不覆盖。其 `Desktop v1alpha5 consumer count=0` 是 5.4.1
关闭时点事实，DFI-5.4.2 正是有意改变该时点边界，因此：

- 不修改旧 test/harness/evidence 伪造继续为 0；
- 不把旧 `harness:dfi5.4.1` 的 post-transition 失败误报为回归；
- 新 Harness 逐项继承 5.4.1 的 Contract/durable/admission assertions，并把 interface transition 记在
  DFI-5.4.2 自己的 Evidence；
- 仍校验 `artifacts/dfi541/evidence.json` 文件与内层 evidenceDigest 未被覆盖；
- R2D-P.3 v1alpha4 historical Contract/API 必须逐字节零漂移；
- DFI-5.3.4/PRA-3/R2D-4 等不受时点边界影响的 historical Harness 继续复跑。

禁止为了追求“全部历史 Harness 仍绿”而改写旧 Evidence、偷偷使用 v1alpha4 或跳过 v1alpha5 interface transition。

## 9. 生命周期与确定性窗口

| 窗口 | 必须结果 |
| --- | --- |
| Compatibility 后 Core restart | binding 失效；业务调用 `reasoning.runtime_changed`；重新协商后恢复 |
| Preview inflight 时 restart | 旧结果丢弃，不落 Renderer；Profile/Preference 不被二次读取 |
| Preference commit 前 navigation | abort，durable write=0 |
| Preference commit 后 response loss | 原 commandId 返回 exact Receipt；revision 不重复增加 |
| Submit accepted 前 request abort | 未 durable 时零 Task/Message/Receipt |
| accepted 后 response loss | 单 command/Task/Message；status query 返回 durable winner |
| task_committed 后 Core restart | 同 lock、selection、deadline、Receipt |
| terminal replay | Preview/Profile/admission/Provider/Usage 新增调用均 0 |

使用 named deterministic barrier；禁止 sleep、自动 retry、单进程 throw 冒充 restart 或删除 SQLite 冒充 reopen。

## 10. 安全与泄漏边界

Renderer、IPC、HTTP safe response、日志、stdout/stderr、Evidence、failure JSON 均不得出现：

- `reasoning_effort`、`thinking`、`budget_tokens` 或 raw mapping/Profile/Strategy material；
- Credential、Authorization、Cookie、Endpoint、Core private URL/token；
- transportClientInstanceId（Compatibility safe projection 除外）、owner HMAC key/material；
- reasoning/thinking private output、signature、stack、Zod path；
- Workspace real path、requestDigest、selection digest 等非 UI 必需内部事实。

泄漏扫描器必须继承 DFI-5.4.1 已验收的 5 个关键词
`reasoning_effort | budget_tokens | authorization: | cookie: | credentialReference`，并扩展覆盖
`thinking | requestDigest | selectionDigest | signature | stack | Zod path | workspace real path |
transportClientInstanceId`。继承项与扩展项组成同一个 scanner/allowlist authority，不得分别维护后只执行其中一组。

泄漏验证使用上述统一 scanner 完成 5 canary × 4 encoding × 4 channel = 80 次负向注入；每次精确检出，正常四通道
命中 0。Compatibility projection 中 Contract 明确允许的 `transportClientInstanceId` 必须走结构化字段级 allowlist，
不得放宽对其他 response/log/evidence channel 的扫描。

## 11. 文件边界

### 11.1 允许修改

- `packages/contracts/src/desktop-local/v1alpha5/reasoning-mode.ts` 与 exact v1alpha5 index/type；
- `services/core/src/application/desktop-application-facade.ts`；
- `services/core/src/application/submit-turn-coordinator.ts` 及 DFI-5.4.1 单一接缝；
- `services/core/src/application/reasoning-mode-*-service.ts`；
- `services/core/src/adapters/http/core-private-http-server.ts`；
- `services/core/src/bootstrap/create-desktop-private-runtime.ts` 的 default-false composition；
- `apps/desktop/src/main/core-private-client.ts`、新 v1alpha5 router 与 Main registration；
- `apps/desktop/src/preload/**`、`apps/desktop/src/shared/**` 的 v1alpha5 safe API；
- 对应 tests、Harness、Evidence、版本和治理文档。

### 11.2 禁止修改

- `apps/desktop/src/renderer/**`；
- Desktop v1alpha1/v1alpha2/v1alpha4 Contract 与已有 API；
- Provider Adapter/body mapping、Central production、Admin、Document Worker；
- migration、依赖、`pnpm-lock.yaml`；
- TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 public CRUD、Admin v2；
- production activation/release count。

若实现必须突破任一禁止项，立即停手回评审。

### 11.3 编码版本同步策略

DFI-5.4.2 获得单独编码授权后，因 Root/Core/Contracts/Desktop 都会产生本批有效变更，四者统一推进至：

```text
0.0.0-dfi.5.4.2
```

`apps/admin-console` 不在本批范围，继续保持 `0.0.0-afe.6c`，不得仅为“看起来一致”而改版。版本同步不构成新增
依赖，也不得改变 `pnpm-lock.yaml`；若标准 package version 更新导致 lockfile digest 变化，必须停手核查并回评审，
不得把变化直接归为预期。

## 12. QA 矩阵（96 项）

### 12.1 Contract 与版本（QA-001～QA-016）

1. QA-001 v1alpha5 preference projection available strict valid；
2. QA-002 unavailable 只允许 default；
3. QA-003 available 必带 revision；
4. QA-004 test identity 与 production ready 互斥；
5. QA-005 projection raw owner/material count=0；
6. QA-006 v1alpha5 exact subpath build 后真实 import；
7. QA-007 Contracts root export 零漂移；
8. QA-008 v1alpha4 control hash；
9. QA-009 v1alpha4 submit hash；
10. QA-010 v1alpha4 API method count=3；
11. QA-011 v1alpha5 API method count=6；
12. QA-012 v1alpha5 request 不被 v1alpha4 parser 接受；
13. QA-013 v1alpha4 request 不被 v1alpha5 parser 接受；
14. QA-014 safe result success extra field拒绝；
15. QA-015 safe result error extra field拒绝；
16. QA-016 public private mapping leak=0。

### 12.2 Core routes 与 service（QA-017～QA-036）

17. QA-017 六条 v1alpha5 route exact；
18. QA-018 route count=6；
19. QA-019 mutation/generic dispatcher count=0；
20. QA-020 Host invalid拒绝；
21. QA-021 Origin invalid拒绝；
22. QA-022 Bearer invalid拒绝；
23. QA-023 16 KiB request boundary；
24. QA-024 160 KiB Submit boundary；
25. QA-025 response size boundary；
26. QA-026 gate=false compatibility unavailable；
27. QA-027 gate=false business downstream count=0；
28. QA-028 enabled incomplete fail-fast；
29. QA-029 test complete graph available；
30. QA-030 Preview exact model authority；
31. QA-031 Preview Profile load恰1；
32. QA-032 preference get unavailable safe default；
33. QA-033 preference update CAS single winner；
34. QA-034 update exact replay；
35. QA-035 same command different material conflict；
36. QA-036 typed safe error exhaustiveness。

### 12.3 SubmitTurn durable integration（QA-037～QA-052）

37. QA-037 v1alpha5 coordinator single entry；
38. QA-038 Planner first accept恰1；
39. QA-039 accepted recovery authority reads=0；
40. QA-040 Task bundle atomic；
41. QA-041 default Profile/admission load=0；
42. QA-042 max admitted exact load；
43. QA-043 only two fallback causes；
44. QA-044 other eight causes fail-closed；
45. QA-045 fallback single command；
46. QA-046 fallback single Task/Message；
47. QA-047 response loss exact Receipt；
48. QA-048 query not found typed；
49. QA-049 terminal replay planner=0；
50. QA-050 terminal replay Provider/Usage=0；
51. QA-051 retry same durable deadline；
52. QA-052 historical v1alpha4 coordinator zero drift。

### 12.4 Main/Core client/lease（QA-053～QA-072）

53. QA-053 六 IPC channels exact；
54. QA-054 channel count=6；
55. QA-055 CorePrivateClient six exact methods；
56. QA-056 Main request strict parse；
57. QA-057 Main response strict parse；
58. QA-058 raw renderer UUID；
59. QA-059 transport ID 独立；
60. QA-060 binding same webContents stable；
61. QA-061 cross-webContents reuse rejected；
62. QA-062 binding cap 16 fail-closed；
63. QA-063 no LRU eviction；
64. QA-064 single lease capture；
65. QA-065 no re-resolve between dispatch/revalidation；
66. QA-066 return current revalidation；
67. QA-067 Core restart runtime_changed；
68. QA-068 old compatibility cannot authorize new runtime；
69. QA-069 re-negotiation restores binding；
70. QA-070 navigation cleanup；
71. QA-071 render-process-gone cleanup；
72. QA-072 destroyed/clear cleanup。

### 12.5 Preload 与 Renderer boundary（QA-073～QA-084）

73. QA-073 Preload API Object.freeze；
74. QA-074 six method allowlist；
75. QA-075 input strict parse；
76. QA-076 output strict parse；
77. QA-077 ipcRenderer 不暴露；
78. QA-078 channel string 不暴露；
79. QA-079 Core token/URL 不暴露；
80. QA-080 v1alpha1 namespace 零漂移；
81. QA-081 v1alpha2 namespace 零漂移；
82. QA-082 v1alpha4 namespace 零漂移；
83. QA-083 Renderer v1alpha5 consumer count=0；
84. QA-084 Desktop Max UI count=0。

### 12.6 Lifecycle、泄漏与 closure（QA-085～QA-096）

85. QA-085 Preview restart named barrier；
86. QA-086 Preference precommit abort write=0；
87. QA-087 Preference postcommit response loss exact winner；
88. QA-088 Submit preaccept abort side effect=0；
89. QA-089 Submit postaccept response loss single winner；
90. QA-090 SQLite reopen same lock/selection/deadline；
91. QA-091 80 negative leak injections detected；
92. QA-092 normal four-channel leak count=0；
93. QA-093 real diagnostic resource counts nonnegative；
94. QA-094 DFI-5.4.1 evidence file/digest immutable；
95. QA-095 readiness false list exact；
96. QA-096 outcome only DFI542 conformance。

所有编号必须连续唯一。禁止 `.skip`、`.only`、`@Disabled`、sleep、自动 retry、硬编码资源 0、`?? 0` 或 Fake
拓扑宣称 production。

## 13. Harness 与门禁

### 13.1 Focused Harness

新增 `harness:dfi5.4.2`，至少覆盖：

- Contract/preference projection；
- Core route/facade/service；
- SubmitTurn v1alpha5 durable integration；
- Main router/CorePrivateClient lease；
- Preload frozen API；
- boundary/lifecycle/evidence。

### 13.2 必跑门禁

```bash
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
CI=true VITEST_MAX_WORKERS=1 pnpm run harness:dfi5.4.2
CI=true pnpm --filter @robothree/desktop build
CI=true pnpm run typecheck
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

历史 `artifacts/dfi541/evidence.json` 只读校验；不得让新 Harness 覆盖旧 Evidence。

编码后的版本门禁必须逐项断言 Root/Core/Contracts/Desktop 均为 `0.0.0-dfi.5.4.2`，Admin 仍为
`0.0.0-afe.6c`；不得使用“所有 workspace package 同版”作为错误验收条件。

## 14. 实施步骤与工期

| Step | 内容 | 估算 |
| --- | --- | --- |
| 1 | v1alpha5 preference projection + Core service/facade/六 route | 1～1.5 日 |
| 2 | SubmitTurn v1alpha5 coordinator/durable integration + gate | 1～1.5 日 |
| 3 | Main CorePrivateClient/router/binding/restart lease | 1～1.5 日 |
| 4 | Preload API + focused/lifecycle Harness +全量门禁/报告 | 1～1.5 日 |

合计 **4～6 个集中工程日**。父方案原估 3～5 日偏紧，新增 1 日来自已确认的 v1alpha4 namespace 占用、
preference get projection 缺口与 post-transition historical evidence 分层。该修正不包含 Renderer UI 或真实 Provider E2E。

## 15. 停手条件

出现任一情况立即停止编码并回评审：

1. 必须修改 Desktop v1alpha4 request/API 才能完成 Max；
2. 必须把 v1alpha5 body 伪装成 v1alpha4；
3. 必须新增 migration 27、依赖或修改 lockfile；
4. 必须修改 Renderer 才能证明本批；
5. 必须打开 production DFI/R2D/CPC/enterprise gate；
6. 必须安装 production subject release；
7. 现有 Task transaction 无法原子承载 v1alpha5 bundle；
8. Preference get 必须暴露 owner/HMAC/private material；
9. Main 不能在一次调用内保持单一 connection lease；
10. navigation/destroyed 无法确定性清理 binding；
11. command response loss 只能靠自动 retry；
12. Core route 必须信任 Renderer support/Profile/mapping；
13. typed error 只能通过暴露 internal error.message 实现；
14. 必须修改 Provider raw mapping/body/timeout；
15. 必须修改 Central/Admin/TGM/Knowledge/Agent Lifecycle；
16. 需要覆盖 DFI-5.4.1 historical Evidence 才能通过；
17. root/Central 失败来自并发窗口且无法安全隔离；
18. 发现 DFI-5.4.3 Renderer/UI 代码提前混入。

## 16. 当前状态与评审问题

```text
DFI-5.4.0                         PASS/CLOSED
Scheme A prerequisite            PASS/CLOSED
DFI-5.4.1                        PASS/CLOSED
DFI-5.4.2                        PASS/CLOSED
DFI-5.4.3                        DOCUMENT REVIEW PENDING / CODING GATED
production DFI/R2D/CPC           false
production enterprise entitlement false
production installed release     0
Renderer v1alpha5 consumer        0
Desktop Max UI                    false
```

以下独立评审问题已经完成并由用户接受；本批现已关闭：

1. 是否接受 v1alpha4 已被 R2D-P.3 占用，Max 必须使用独立 v1alpha5 namespace？
2. 是否接受 additive 补齐 preference safe projection，且不改变 durable digest material？
3. 是否接受六条 exact v1alpha5 HTTP routes 与六个 exact IPC channels？
4. 是否接受 route/API 已安装但 production feature 仍 unavailable 的三态 gate？
5. 是否接受 Compatibility negotiation 与业务调用通过 Main binding 锁定同一 runtime generation？
6. 是否接受 response loss 只用原 commandId 查询，不自动 replay command？
7. 是否接受本批不创建 Renderer consumer/UI？
8. 是否接受 5.4.1 Evidence 只读，但其“consumer=0”时点断言由 5.4.2 新 Evidence 显式推进？
9. 是否接受 Preview/Preference transport timeout 不改变 durable Provider deadline？
10. 是否接受 96 项矩阵、4～6 日估算与上述停手条件？

用户已正式接受本计划并单独授权编码；实现、Harness、Evidence 与开发者门禁现已完成。独立 QA 与用户接受前，
DFI-5.4.2 不得标记 `PASS/CLOSED`，也不得自动解锁 DFI-5.4.3。
