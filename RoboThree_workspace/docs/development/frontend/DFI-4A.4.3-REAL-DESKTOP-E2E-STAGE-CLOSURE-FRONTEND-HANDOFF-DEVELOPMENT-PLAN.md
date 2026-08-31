# DFI-4A.4.3 Real Desktop E2E / Stage Closure / Frontend Handoff 详细实施方案

> 状态：**DEFERRED BY MVP-VERTICAL-SLICE-1 / IMPLEMENTATION STOPPED**  
> 日期：2026-08-29  
> 负责人：Codex 5.6  
> 已关闭上游：DFI-4A.4.1、STRM-3、DFI-4A.4.2 `PASS/CLOSED`  
> 父计划：[DFI-4A.4 Revision 2](./DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md)  
> 下游：Renderer Personal Model UI、正式签名 Helper、Enterprise identity、Admin v2 继续 `GATED`  
> 当前授权：仅允许文档评审，不授权代码、Harness、Evidence、依赖、migration 或 lockfile 修改

> 2026-08-29 优先级更新：Personal Model closure 不再占用当前关键路径。当前唯一 P0 为
> [MVP-VERTICAL-SLICE-1](../MVP-VERTICAL-SLICE-1-REAL-TASK-END-TO-END-DEVELOPMENT-PLAN.md)，本方案保持停止；
> MVP-VS1 完成后是否恢复由用户另行决定。

## 0. 结论先行

DFI-4A.4.3 是 DFI-4A.4 Revision 2 的 **closure-only** 子批，不新增 Personal Model 产品能力，也不修改
Renderer 页面。DFI-4A.4.1 已交付 authority、Helper trust primitives 与只读接口；STRM-3 已关闭敏感传输
blocker；DFI-4A.4.2 已交付 additive v1alpha2 八方法、唯一 durable Coordinator/Recovery/Reveal 业务图及
A2 Secret 分流。当前剩余工作是：

1. 用真实 Electron/Main/Preload/Core/SQLite、真实编译 Helper 进程、临时 Keychain 和受控 TLS Provider，证明
   create → list/detail → 首次模型调用 → status → reveal → replace → delete 的跨进程闭环；
2. 用 named barrier + `SIGKILL` + 新 PID + 原 SQLite reopen，证明 response loss、Core/Desktop restart 与 durable
   Receipt/status recovery 不会重读 Renderer Secret、重复选择模型或伪报成功；
3. 把父方案 120 项 QA 账本全部推进到 `executed_at_dfi4a4_stage_closure`，同时验证 80 次泄漏负向注入、正常
   四通道 0 命中和真实资源归零；
4. 输出 Renderer 后续消费所需的 exact API、状态机、错误与安全边界交接文档，但不创建 Renderer consumer。

本批允许使用 **真实编译、真实子进程执行的 `test_isolated` Helper** 和隔离临时 Keychain 来证明工程
conformance；它不能冒充正式签名安装包资产。普通 Desktop production graph 仍必须诚实输出 Helper 缺失、
mutation/reveal unavailable。只有实现、开发者门禁、独立 QA 和用户接受全部完成后，最高允许输出：

```text
DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT
```

该 outcome 必须同时附带：

```text
productionSensitiveTransportReady = true
productionBusinessHandlerInstalled = true
productionBusinessHandlerReady = false
productionHelperAssetPresent = false
productionPersonalModelCrudReady = false
productionCredentialRevealReady = false
rendererPersonalModelUiReady = false
productionPackagingReady = false
enterpriseIdentityReady = false
adminV2Ready = false
tgmReady = false
knowledgeProviderReady = false
agentLifecycleReady = false
zeroCopyClaimed = false
structuredCloneInternalCopiesReliablyClearable = false
```

因此 DFI-4A.4.3/DFI-4A.4 的工程 Closure 不等于 Personal Model production ready，也不自动授权 Renderer UI、
Helper production signing/notarization、Enterprise、Admin、TGM、Knowledge Provider 或 Agent Lifecycle。

## 1. 当前事实与缺口

### 1.1 已关闭事实

- DFI-4A.4.1：`PersonalModelManagementAuthorityV2`、Helper builder/manifest/trust chain、v1alpha1 read API；
- STRM-3：normal Main/Preload/Core sensitive transport activation 与 `SENSITIVE_TRANSPORT_READY`；
- DFI-4A.4.2：v1alpha2 八方法、八 IPC、八 Core route、唯一 Coordinator/Recovery/Reveal 业务图；
- A2：create/replace/reveal 走 STRM，reuse/delete 走 safe Core command + same Coordinator + zero Secret；
- DFI-5：Local Personal exact subject、Provider/Reasoning release、Task lock 与真实 TLS/SSE invocation 已关闭；
- migration 仍止 26；当前需求不需要表、索引、durable cursor 或第二套 Receipt；
- historical Evidence 内层 digest：
  - DFI-4A.4.1：`sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750`；
  - STRM-3：`sha256:f1a42004058f14ae3e1178dd2243d95a379874a62a11d4392784066bcff90722`；
  - DFI-4A.4.2：`sha256:f52e7a255374e70a920957ba7641f5643f73a39445946815e42d7261be87dc0e`；
  - DFI-5.4.3：`sha256:8293bf35a3f7d5b1f03c0e5f9b633f1e0abb2d2afe5932b4a51022e049fe36b0`。

### 1.2 当前真实缺口

| 缺口 | 当前事实 | DFI-4A.4.3 决策 |
| --- | --- | --- |
| production Helper | 正式签名 binary/manifest 不在安装资源中 | 不补 production 资产；normal graph 继续 unavailable |
| end-to-end closure | 分层测试存在，但缺完整 Personal Model 用户链真实进程证据 | 建立受控真实 Electron/Helper/Keychain/TLS E2E |
| crash/replay | Coordinator 有 durable 语义，缺产品链 named-window 聚合证明 | 真实 SIGKILL、新 PID、原 SQLite reopen |
| stage ledger | QA-061～100 已执行，其余 80 retained | item-level 执行父 120 项，不硬编码状态 |
| Renderer handoff | v1alpha2 API 已交付，页面仍无消费 | 只交付状态/错误/API handoff 文档，不改 Renderer |
| production readiness | Helper/UI/packaging 均 false | Closure outcome 与 production readiness 严格分层 |

### 1.3 版本与不可变基线

```text
Root/Core/Contracts/Desktop = 0.0.0-dfi.4a.4.2
Admin                       = 0.0.0-afe.6c
pnpm-lock.yaml sha256       = 5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31
migration max               = 26
production Helper asset     = false
Renderer v1alpha2 consumer  = 0
```

编码时建议 Root/Core/Desktop 推进到 `0.0.0-dfi.4a.4.3`，Contracts 保持
`0.0.0-dfi.4a.4.2`（本批不改 Contract source），Admin 保持 `0.0.0-afe.6c`。若审计工具不能表达该合法版本分层，
必须停手回评审，禁止为通过快照而改写 historical Harness/Evidence。

## 2. 冻结架构决策

### 2.1 G1：双证据拓扑，normal graph 与 controlled closure 分离

本批必须同时提供两套证据，缺一不可：

1. **normal production graph evidence**：从真实 Desktop normal entry 启动；由于正式 Helper 资产缺失，
   Compatibility 必须保持 `catalogAvailable=true`（authority 可读时）但 `mutationAvailable=false /
   revealAvailable=false / helperState=unavailable`；Provider/Keychain/Secret read 为 0；
2. **controlled closure graph evidence**：真实构建 Objective-C Helper、真实 `codesign` test-isolated 签名、真实 Helper
   child、隔离临时 Keychain、真实 Electron/Main/Preload/Core/SQLite 和受控 loopback TLS Provider。它只证明协议、
   lifecycle 和安全边界，不改变任何 production readiness 字段。

禁止用单进程 direct call、JSDOM、body mock、InMemory Keychain、Fixture response 或硬编码 Evidence 代替任一拓扑。

### 2.2 G2：真实用户链闭环

controlled closure 固定执行：

```text
Desktop compatibility
  -> create(apiKeyBytes)
  -> query durable Receipt
  -> list + detail exact projection
  -> SubmitTurn 锁定该 Personal Model
  -> 受控 TLS Provider 完成首次真实调用
  -> status/credential state 安全投影收敛
  -> reveal one-shot bytes（单 consumer、deadline、无 replay）
  -> replace_secret(newApiKeyBytes)
  -> 第二次受控 Provider 调用只接受新 Key
  -> delete（先证明 active/unknown usage fail-closed，再在无使用条件下提交）
  -> list/detail/query 确认 durable terminal truth
```

保存不得自动发 Provider 测试请求；首次 Provider 请求只能由显式 SubmitTurn 触发。测试 Provider 只监听 loopback，
使用固定假 Key，不访问公网、不产生付费调用。Secret 不得从 Renderer 或 Evidence 读回用于重试。

### 2.3 G3：崩溃窗口与恢复语义

至少覆盖七个 named barrier：

| 窗口 | Named barrier | 恢复要求 |
| --- | --- | --- |
| C1 | `operation_prepared_before_sensitive_body` | operation 可查询；Helper/Keychain 0；不重读 Secret |
| C2 | `sensitive_body_accepted_before_helper_request` | 旧 port/runtime 失效；必须由新用户命令继续 |
| C3 | `helper_result_observed_before_durable_commit` | exact reconciliation；不猜成功、不自动重放 bytes |
| C4 | `create_committed_before_response_delivery` | 同 command/material 重放同 Receipt；模型只创建一次 |
| C5 | `provider_response_committed_before_status_projection` | 原 SQLite reopen；Invocation/Task/Model identity 不变 |
| C6 | `reveal_resolved_before_preload_delivery` | Secret 不持久化、不 replay；旧 command tombstone |
| C7 | `replace_or_delete_committed_before_response_delivery` | exact Receipt replay；旧 Key/模型清理状态诚实 |

每个窗口必须使用真实 child PID、OS `SIGKILL`、确认进程退出、新 PID 与原 SQLite 文件 reopen。Watchdog 仅防挂起，
不得用 `sleep` 猜窗口、`throw` 冒充进程崩溃或删除重建数据库冒充 reopen。

### 2.4 G4：权威事实与 semantic replay

连续三轮 fresh process 使用同一受控输入，semantic digest 必须一致；下列权威字段必须进入 digest，不能为追求一致
而删除：owner/authority identity、personalModelId、configuration/execution revision、credential binding identity、
operation/receipt identity、Task/Model lock、Provider request semantic identity、status/recovery outcome。PID、端口、临时
路径、wall clock、nonce 只作为 process noise 排除。

任一 authority、Helper manifest、API Key、Endpoint/Profile、Provider response 或 command material 漂移，必须使
semantic digest 改变或 typed fail-closed。

### 2.5 G5：Secret 与敏感信息归零

泄漏扫描沿用并扩展 STRM-3/DFI-4A.4.2 scanner：

- 4 通道：parent stdout、child stderr、machine Evidence、safe failure；
- 5 canary：API Key、Credential Reference/Keychain account、完整 Endpoint、Helper/SQLite 真实路径、operation/receipt
  private digest；
- 4 编码：plain、base64、hex、URL encoded；
- 共 80 次负向注入，每次必须精确检出；正常四通道命中均为 0。

Evidence 只能包含 content-free counts、状态、版本、hash 和 opaque test identities。禁止 Secret、完整 Endpoint、
Credential Reference、owner digest、Helper/SQLite/Keychain 路径、stack、Zod path、Provider body 或系统用户名。

### 2.6 G6：真实资源核算

最终至少核算以下 22 类资源，全部必须来自 child/runtime diagnostics 的非负安全整数：

```text
electronProcess / browserWindow / webContents / ipcHandler / navigationListener
messagePort / sensitiveStream / transportSession / transportRegistry
brokerInflight / brokerTombstone / coreChild / helperProcess / sqliteHandle
keychainTestNamespace / tlsServer / listeningPort / providerInflight
revealAttempt / operationLease / timer / temporaryDirectory
```

禁止 `?? 0`、硬编码 0、字段缺失当 0、parent 盲信 child 或只统计父进程资源。

### 2.7 G7：父 120 项 Stage Closure 账本

- 从 DFI-4A.4.2 Evidence 读取 QA-061～100 的已执行事实并校验 historical digest/hash 不漂移；
- QA-001～060、QA-101～120 必须在本批 item-level 执行；historical pass 可以作为某项 owner evidence，但不能用
  “历史 Harness 已通过”一行替代 80 项账本；
- 每项记录 `qaId / ownerTest / topology / evidenceKey / result`；最终 120 项全部为
  `executed_at_dfi4a4_stage_closure`；
- focused QA 另设 96 项，不能冒充父 120 项。

### 2.8 G8：Frontend Handoff 只交接口与状态，不改页面

交接文档必须冻结：

1. `window.robothreePersonalModelV1Alpha2` 八方法签名、输入所有权与 Secret byte clearing 责任；
2. Loading、Empty、read-only available、Helper unavailable、Transport unavailable、Permission denied、Runtime
   changed、Conflict、Operation pending、Manual attention、Cleanup pending、Reveal expired、Safe error 的 UI 状态表；
3. create/update/delete/reveal 的 action prerequisite、按钮禁用原因与 refresh/query 策略；
4. `runtime_changed` 后重新 Compatibility negotiation，不静默重试 mutation/reveal；
5. reveal bytes 只能进入当前用户动作的单 consumer，不进 Store、LocalStorage、日志、Toast 或剪贴板；
6. production Helper/UI 未 ready 时只能展示真实 unavailable，禁止 Mock/Fixture/LocalStorage 成功态。

本批允许新增 docs-only handoff 和 Adapter contract tests，但 `apps/desktop/src/renderer/**` consumer count 必须保持 0。

### 2.9 G9：诚实 Closure

DFI-4A.4.3 关闭后只允许：

```text
outcome = DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT
parentQaMatrixCount = 120
parentQaLedgerStatus = executed_at_dfi4a4_stage_closure
frontendHandoffEvidenceComplete = true
```

不得输出 `PRODUCTION_READY`、`PERSONAL_MODEL_CRUD_READY`、`HELPER_READY`、`RENDERER_UI_READY`、
`ENTERPRISE_READY`。production readiness 必须保持 §0 的 false 集合。

## 3. 生命周期验收矩阵

### 3.1 Normal graph（N1～N6）

| 场景 | 预期 |
| --- | --- |
| N1 normal Desktop 启动 | catalog 可按 authority 读取；mutation/reveal false |
| N2 Helper 目录缺失 | typed unavailable；Core/Desktop 不退出 |
| N3 forged env/argv/path | 不改变 Helper/authority/feature state |
| N4 create/reveal 请求 | Provider/Helper/Keychain/STRM bytes 计数均 0 |
| N5 restart | unavailable 原因稳定，不生成 Fixture asset |
| N6 evidence | production false 与 controlled E2E pass 同时存在 |

### 3.2 Controlled full path（E1～E10）

| 场景 | 预期 |
| --- | --- |
| E1 compatibility | test identity 明示，不能与 production identity 同时 ready；且必须在 Helper manifest、Helper binary、Keychain namespace 或 SQLite file 至少一项与 production identity 可区分 |
| E2 create | Core-generated ID/revision，Secret 只走 STRM/Helper |
| E3 list/detail | masked credential state，无 private material |
| E4 first SubmitTurn | exact model lock，受控 TLS Provider 恰一次 |
| E5 provider result | durable Task/Invocation/Model identity 可恢复 |
| E6 reveal | 一次性、单 consumer、deadline、无 durable viewed fact |
| E7 replace | expected revision exact，新 Key 生效，旧 Key 不再使用 |
| E8 active/unknown delete | fail-closed，不 fallback 前端缓存 |
| E9 terminal delete | durable Receipt，Keychain/模型状态一致 |
| E10 response loss | query 同 command 得 exact terminal truth |

### 3.3 Crash/restart（C1～C7）

严格按 §2.3 七个 named barrier 执行；每项至少记录 first PID、exit observation、second PID、SQLite file identity、
authority read count、Secret reread count、Helper request count、Provider request count与 terminal semantic digest。

## 4. 文件范围

### 4.1 编码授权后允许

- `tests/e2e/**` 中 DFI-4A.4.3 real process fixtures/tests；
- `scripts/run-dfi4a4.3-*.mjs`、聚合 `run-dfi4a4-harness.mjs`；
- `artifacts/dfi4a43/**`、`artifacts/dfi4a4/**`；
- `apps/desktop/scripts/**` 的受控 Helper build/E2E 装配，不提交 production binary；
- 必要的 test-only child/diagnostics；若确需 production diagnostic seam，只允许 content-free count/state、默认 no-op、
  不改变控制流/持久化/网络/错误分类；
- docs-only Frontend Handoff、实施报告及治理状态同步；
- Root/Core/Desktop 必要版本同步。

### 4.2 明确禁止

- `apps/desktop/src/renderer/**`；
- frozen personal-model-management v1alpha1/v1alpha2 Contract source；
- migration 27、改写 migration 1～26、新依赖或 lockfile 变化；
- production Helper binary、Developer ID 私钥、证书、真实用户 API Key、notarization ticket 入仓；
- Admin/Central/TGM/Knowledge Provider/Agent Lifecycle/Enterprise/DeepSeek 开发；
- 修改 Provider 业务语义、DFI-5 Task/Reasoning/Release Contract；
- 改写 historical Harness/Evidence 来适配当前合法演进；
- Mock/Fixture/LocalStorage 成功态或公网/付费 Provider 调用。

## 5. 实施步骤与工期

1. **Step 1：Closure corpus 与 diagnostics（0.5～1 日）**  
   冻结 normal/controlled 双拓扑、七个 named barrier、22 类资源 schema、semantic summary 与 leak scanner。
2. **Step 2：真实 Electron/Helper/Keychain/TLS E2E（1～2 日）**  
   完成 create→invoke→reveal→replace→delete 主链和 response loss/restart 场景。
3. **Step 3：Stage ledger / Harness / Evidence（0.75～1.25 日）**  
   执行父 120 项、focused 96 项、80 次泄漏注入、三轮 semantic replay 与历史 Evidence 双层校验。
4. **Step 4：Frontend Handoff 与报告（0.5～0.75 日）**  
   输出 exact API/状态/错误/安全交接，更新实施报告与治理文档。

合计 **3～5 个集中工程日**，不含独立 QA、正式 Helper signing/notarization、Renderer UI 实施与返工。

## 6. Focused QA 矩阵（96 项）

### 6.1 Boundary / topology（QA-001～QA-016）

1. QA-001 DFI-4A.4.1/STRM-3/4A.4.2 historical inner digest 不漂移；
2. QA-002 historical Evidence file hash 不漂移；
3. QA-003 v1alpha1 source hash 不漂移；
4. QA-004 v1alpha2 source hash 不漂移；
5. QA-005 exact subpath build 后仍可 import；
6. QA-006 Renderer v1alpha2 consumer count=0；
7. QA-007 Admin/Central/Document Worker consumer count=0；
8. QA-008 migration max=26；
9. QA-009 lockfile digest 不漂移；
10. QA-010 normal entry 为真实 Electron Main；
11. QA-011 production Preload sandbox/contextIsolation；
12. QA-012 nodeIntegration disabled；
13. QA-013 normal/controlled topology 显式分离；
14. QA-014 controlled identity 不冒充 production identity；
15. QA-015 production Helper asset 真实探测 false；
16. QA-016 production readiness false 集合完整。

### 6.2 Normal graph honesty（QA-017～QA-032）

17. QA-017 catalog authority 可用时 safe read；
18. QA-018 Helper 缺失 mutation false；
19. QA-019 Helper 缺失 reveal false；
20. QA-020 Helper 缺失 application 可启动；
21. QA-021 create typed unavailable；
22. QA-022 replace typed unavailable；
23. QA-023 reveal typed unavailable；
24. QA-024 normal graph Helper process=0；
25. QA-025 normal graph Keychain read=0；
26. QA-026 normal graph Provider request=0；
27. QA-027 env 不改变 Helper path；
28. QA-028 argv 不改变 Helper path；
29. QA-029 Renderer 不提供 authority；
30. QA-030 Renderer 不提供 Credential Reference；
31. QA-031 restart 后 unavailable 原因稳定；
32. QA-032 normal graph 不创建测试资产。

### 6.3 Controlled user path（QA-033～QA-052）

33. QA-033 真实 Helper binary 编译；
34. QA-034 test-isolated signature 验证；
35. QA-035 Helper manifest/digest/descriptor 同一 build；
36. QA-036 临时 Keychain namespace 隔离；
37. QA-037 create ID 由 Core 生成；
38. QA-038 create Secret 只走 STRM；
39. QA-039 create durable Receipt；
40. QA-040 list/detail masked projection；
41. QA-041 save 不自动测试连接；
42. QA-042 SubmitTurn exact Personal Model lock；
43. QA-043 受控 TLS Provider 首次请求恰一次；
44. QA-044 Provider 使用新建 Key；
45. QA-045 status 投影收敛；
46. QA-046 reveal 单 consumer；
47. QA-047 reveal 无 replay；
48. QA-048 replace exact revision；
49. QA-049 replace 后旧 Key 不使用；
50. QA-050 active task delete fail-closed；
51. QA-051 usage unknown delete fail-closed；
52. QA-052 terminal delete durable 收敛。

### 6.4 Crash / replay（QA-053～QA-072）

53. QA-053 C1 named barrier + SIGKILL；
54. QA-054 C2 named barrier + old port rejection；
55. QA-055 C3 exact Keychain reconciliation；
56. QA-056 C4 create Receipt replay；
57. QA-057 C5 Task/Invocation identity 不变；
58. QA-058 C6 reveal tombstone/no replay；
59. QA-059 C7 replace Receipt replay；
60. QA-060 C7 delete Receipt replay；
61. QA-061 每次真实 OS 进程退出；
62. QA-062 每次恢复 PID 不同；
63. QA-063 原 SQLite file identity 不变；
64. QA-064 restart 不重读 Renderer Secret；
65. QA-065 restart 不重新选择模型；
66. QA-066 response loss query exact command；
67. QA-067 material conflict typed fail；
68. QA-068 uncertain 不伪报成功；
69. QA-069 manual attention 不伪报成功；
70. QA-070 cleanup pending 不伪报删除完成；
71. QA-071 三轮 fresh process semantic digest 唯一；
72. QA-072 authority/material drift 改 digest 或 fail-closed。

### 6.5 Leakage / resources（QA-073～QA-088）

73. QA-073 5 canary 完整；
74. QA-074 4 encoding 完整；
75. QA-075 4 channel 完整；
76. QA-076 80 次负向注入全部检出；
77. QA-077 parent stdout 正常命中0；
78. QA-078 child stderr 正常命中0；
79. QA-079 machine Evidence 正常命中0；
80. QA-080 safe failure 正常命中0；
81. QA-081 Evidence 无 Secret；
82. QA-082 Evidence 无完整 Endpoint；
83. QA-083 Evidence 无 Credential Reference/owner digest；
84. QA-084 Evidence 无真实路径/系统用户名；
85. QA-085 22 类资源字段齐全；
86. QA-086 资源字段均为非负安全整数；
87. QA-087 资源最终全0；
88. QA-088 禁止硬编码0/`?? 0`/缺失当0。

### 6.6 Ledger / handoff / honesty（QA-089～QA-096）

89. QA-089 父 120 项连续唯一；
90. QA-090 父 120 项 item-level owner/evidence 完整；
91. QA-091 父 ledger 全部 executed/pass；
92. QA-092 focused 96 项连续唯一；
93. QA-093 Frontend Handoff 八方法签名完整；
94. QA-094 Frontend Handoff 状态/错误/Secret 责任完整；
95. QA-095 outcome 仅为 DFI4A4 conformant；
96. QA-096 production/downstream readiness false 集合完整。

## 7. 正式门禁

编码完成后至少串行执行：

```bash
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
CI=true pnpm run harness:dfi4a4.3
CI=true pnpm run harness:dfi4a4
CI=true pnpm run harness:dfi4a4.2
CI=true pnpm run harness:strm3
CI=true pnpm run harness:dfi5.4.3
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run lint
CI=true pnpm run typecheck
CI=true pnpm run audit:dtp4
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central:offline
```

Historical Harness 若因合法版本/consumer 演进失效，应以 immutable historical Evidence digest/hash + 当前 Harness
证明，不得改写旧 Harness 快照。所有环境失败必须在 Node 24.13.0、JDK 21、单实例和真实进程权限下聚焦复验，
不得自动 retry 掩盖稳定回归。

## 8. 停手条件

出现任一情况立即停止编码并回评审：

1. 需要修改 personal-model-management v1alpha1/v1alpha2 Contract；
2. 需要进入 Renderer 页面才能证明后端闭环；
3. 需要提交 production Helper binary、证书或私钥；
4. 需要把 test-isolated Helper 表述为 production Helper；
5. 需要新增依赖、migration 27 或改变 lockfile；
6. 需要公网/真实用户 Key/付费 Provider；
7. 需要用 InMemory/Fixture Keychain 冒充真实 Keychain；
8. 需要用 direct method/JSDOM/body mock 冒充 Electron E2E；
9. 需要用 `throw` 冒充 SIGKILL；
10. 需要删除重建 SQLite 冒充 reopen；
11. 需要 `sleep` 猜 crash window；
12. 需要重读 Renderer Secret 做恢复；
13. 需要自动 replay reveal Secret；
14. 需要把 Secret 放进普通 IPC/HTTP/SQLite/日志/Evidence；
15. 需要复制 Coordinator/Receipt/Recovery 状态机；
16. 需要保存时自动测试 Provider；
17. 需要自动选择/fallback 个人或企业模型；
18. 需要改写 historical Harness/Evidence；
19. 无法 item-level 执行父 120 项；
20. 无法真实统计 22 类资源；
21. 正常图必须启用 mutation/reveal 才能通过；
22. DFI-4A.4 Closure 必须宣称 production ready；
23. 必须进入 Admin/Central/TGM/Knowledge/Agent Lifecycle/Enterprise；
24. root/Central 稳定失败无法在正确环境聚焦归因。

## 9. 评审问题

请独立评审回答：

1. 是否接受本批为 closure-only，不新增产品能力、不改 Renderer？
2. 是否接受 normal graph unavailable 与 controlled real-process E2E 双证据缺一不可？
3. 是否接受 test-isolated Helper 只证明工程 conformance，不改变 production Helper/readiness？
4. 是否接受 create→invoke→reveal→replace→delete 的真实闭环与保存不测试连接？
5. 是否接受七个 named crash barrier、真实 SIGKILL、新 PID 和原 SQLite reopen？
6. 是否接受 reveal crash 后不 replay Secret，必须新 command？
7. 是否接受三轮 semantic replay 保留全部权威 identity？
8. 是否接受 80 次泄漏注入与 22 类真实资源归零？
9. 是否接受父 120 项 item-level 全执行、focused 96 项不能替代父账本？
10. 是否接受 Frontend Handoff 只交 API/状态/错误/安全责任，不创建 Renderer consumer？
11. 是否接受 Root/Core/Desktop bump、Contracts/Admin 保持冻结的版本策略？
12. 是否接受最高仅输出 `DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT`，所有 production/downstream
    readiness 继续 false/GATED？
13. 是否接受 3～5 个集中工程日估算和编码仍需用户单独授权？

评审输出必须包含：`PASS / PASS_WITH_REVISIONS / RED`、P0～P3、是否可冻结、是否继续 Coding Gated。

## 10. 当前门禁

```text
DFI-4A.4 Revision 2                  PLAN REVIEW PASS/CLOSED
DFI-4A.4.1 Revision 2                PASS/CLOSED
STRM-3                               PASS/CLOSED / SENSITIVE_TRANSPORT_READY
DFI-4A.4.2 Revision 2                PASS/CLOSED
DFI-4A.4.3 Revision 2                PLAN REVIEW PASS/CLOSED / IMPLEMENTATION STOPPED
Desktop Renderer Personal Model UI  GATED
production Helper asset              false
production Business Handler ready    false
production Personal Model CRUD       false
production Credential Reveal         false
Enterprise identity/entitlement      false / deferred
Admin v2 / TGM / Knowledge / Agent Lifecycle GATED
```

用户已正式接受独立文档复核结论并单独授权 DFI-4A.4.3 编码。编码前 exact API 核对确认 v1alpha2
List/Detail 安全投影不提供 update/delete/reveal 命令必需的 `expectedExecutionDefinitionDigest`，已触发停手条件
#1/#15；详见[聚焦停手报告](./DFI-4A.4.3-PRE-CODE-PUBLIC-MUTATION-IDENTITY-STOP-REPORT.md)。在用户完成独立
Contract 修订裁决并恢复授权前，不创建 DFI-4A.4.3 code/test/fixture/Harness/Evidence。Desktop Renderer Personal
Model UI、正式签名 Helper 与其他下游仍保持 `GATED`。
