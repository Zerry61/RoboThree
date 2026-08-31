# R2D-P.3 Desktop Local v1alpha4 / Production Cutover / E2E 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-28  
> 负责人：Codex 5.6  
> 父计划：[DFI-5.4 方案 A 前置详细计划](./DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md) `PASS/CLOSED`  
> 上游：R2D conformance、LDA-1 / R2D-P.1、R2D-P.2 `PASS/CLOSED`  
> 并行批：PRA-3 `PASS/CLOSED`  
> 下游：DFI-5.4.1～5.4.3、TGM、Knowledge Provider、Agent Lifecycle、Admin v2 继续 `GATED`  
> 本批最高允许输出：`R2DP3_DESKTOP_V1ALPHA4_CUTOVER_CONFORMANT`

## 0. 结论先行

R2D-P.3 只完成一件事：让受控启用图中的 **Desktop 新 Task** 通过 additive Desktop Local v1alpha4，进入已经验收的
Runtime Selection v1alpha3、coordination v1alpha4、Task bundle 原子提交和 exact recovery 事实链。

它不是 Max 批次。v1alpha4 的 reasoning 必须是严格字面量 `{ requestedMode: "default" }`；不接受
`observedMaxSupport`，不投影 Max Preview，不安装 Provider release，也不出现 Max UI。

本批结束时：

1. v1alpha4 Contract、Core private route、Main IPC、sandboxed Preload API、Renderer adapter 与真实 Desktop E2E
   形成一条单线；
2. v1alpha4 Receipt 删除 `defaultModelId`，Renderer 不再把 Agent default 当模型 authority；
3. v1alpha4 negotiated 后任何失败都 typed fail-closed，不回退 v1alpha1/v1alpha2/v1alpha3；
4. production code-owned activation 默认仍为 `false`，不能由 env/CLI/Main/Renderer/Profile 打开；
5. legacy API 只服务 gate=false 与历史 Task，不成为 R2D 内部的第二条 Runtime Selection 分支；
6. 最高只声明 conformance，不声明 production ready，也不解锁 DFI-5.4.1。

## 1. 当前代码事实与真实缺口

### 1.1 已有且必须复用

1. `SubmitTurnCoordinator.submitV1Alpha3()` 已能在 R2D gate 开启时调用 R2D durable planner，并把事实写入
   coordination v1alpha4；
2. R2D-P.2 已提供唯一 production `TaskResourceEntitlementSource`、LDA subject proof、Acceptance Lease、真实
   Personal Model / Document Tool source 与 `createLocalDesktopR2DProductionComposition()`；
3. R2D-P.2 默认常量 `R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED=false`，bootstrap 仍使用
   `R2D3_CORE_DELTA_DEFAULT_ENABLED=false`；
4. Runtime Selection v1alpha3、coordination v1alpha4、SQLite/InMemory Task bundle 原子提交、恢复零 current-authority
   reread与 `task_committed` Provider 前 barrier 已关闭；
5. Desktop v1alpha2 Catalog 已形成稳定 `runtimeInstanceId / transportClientInstanceId / clientInstanceId` 边界；
6. Desktop v1alpha3 Contract 已有 reasoning union，但未进入 production Main/Preload/Renderer；历史文件不得原地改写；
7. 当前 Desktop Workbench 仍通过 v1alpha1 `submitTurn()`，并在 Renderer 用 `agent.defaultModelId` 选择模型；
8. 当前 Core facade/private HTTP、Main IPC 与 Preload 没有 SubmitTurn v1alpha4 exact route/API。

### 1.2 必须关闭的缺口

| 缺口 | 当前事实 | 本批关闭方式 |
| --- | --- | --- |
| Wire Contract | Desktop Local 最高 SubmitTurn Contract 为 v1alpha3 | additive v1alpha4，reasoning 仅 default |
| Receipt authority | v1alpha2/v1alpha3 summary 仍要求 `defaultModelId` | v1alpha4 删除该字段，只投影 resolved Model |
| Core ingress | facade/private HTTP 只接 legacy/v1alpha2 | exact v1alpha4 submit/status routes |
| Desktop bridge | Main/Preload 无 v1alpha4 | 独立 IPC channels + `robothreeDesktopV1Alpha4` |
| Renderer | Workbench 使用 v1alpha1 + Agent default | feature negotiation 后走 v1alpha4；未显式选模型则交 Core 决策 |
| Activation | R2D graph 默认 disabled | code-owned false；test-only composition 验证 complete graph |
| E2E | R2D lifecycle 已有 Core process harness，但无真实 Electron 链路 | Electron → sandboxed Preload → Main → Core child → SQLite → Loop |

## 2. 范围与明确不做

### 2.1 本批允许

- `packages/contracts/src/desktop-local/v1alpha4/**` 与 exact package/root export；
- Core facade/private HTTP 的 v1alpha4 submit/status exact route；
- R2D-P.2 composition 在 Desktop bootstrap 的默认关闭接缝；
- Main IPC、Preload API、Renderer Workbench adapter/model 的 v1alpha4 单线消费；
- compatibility projection、真实 Electron/Core/SQLite E2E、Harness/Evidence；
- 必要的 test-only composition factory，且 production build/graph 不可达。

### 2.2 本批禁止

- 不改 Desktop v1alpha1～v1alpha3、Runtime Selection v1～v3、coordination v1～v4 的既有 schema/digest；
- 不接 Max Preview/Preference，不接受 `requestedMode="max"`，不创建 v1alpha5；
- 不安装 PRA release，不改 Provider mapping、timeout、Usage 或 Tool continuation；
- 不打开 public Personal Model CRUD/Reveal、TGM、Knowledge Provider、Agent Lifecycle、Admin v2；
- 不新增 migration、依赖或通用 IPC dispatcher；
- 不允许 env/CLI/Renderer/Main/Profile 控制 R2D production gate；
- 不把 JSDOM、直接调 facade、单进程 fake Core 冒充真实 Desktop E2E。

## 3. 冻结架构决策

### 3.1 G1：Desktop Local v1alpha4 strict Contract

新增 `desktop-local/v1alpha4`，只包含本批所需的 additive API：

```text
CompatibilityV1Alpha4
SubmitTurnCommandV1Alpha4
SubmitTurnReceiptV1Alpha4
SubmitTurnStatusQueryV1Alpha4
DesktopErrorEnvelopeV1Alpha4
```

`SubmitTurnCommandV1Alpha4`：

- command/session/user input/selection 字段沿用 v1alpha2 的业务语义；
- `reasoningPreference` 只能是 strict `{ requestedMode: "default" }`；
- 不允许 `observedMaxSupport`、support revision、Profile/Strategy/mapping ref；
- `requestedModelId` 仍为 optional：缺失表示由 Core exact preference + stable ordinal 决策，不表示 Agent default；
- Contract version 必须精确为 `v1alpha4`，unknown/损坏版本不得 fallback。

`RuntimeSelectionSummaryV1Alpha4`：

- 包含 exact Agent revision、resolved Model revision、active Skills、allowed Tools、Knowledge、Workspace、Authorization
  与 execution selection safe summary；
- **不得包含 `defaultModelId`、ReasoningModeLock ID/digest、Entitlement/Decision digest 或 raw internal binding**；
- 可以保留已有的 content-free `runtimeSelectionId` 与 selection digest 作为 protocol integrity fact，但 Renderer 默认
  不展示；
- receipt `status=accepted|replayed|rejected` 的约束与历史一致。

`DesktopErrorEnvelopeV1Alpha4` 必须 additive 定义并固定 `contractVersion="v1alpha4"`，字段语义可逐字段复用
V1Alpha2 的 code/category/safeSummary/retryable/correlationId，但不得直接返回 contractVersion 为 v1alpha2 的
Envelope，也不得把旧 schema 原地扩成 version union。

### 3.2 G2：单一 v1alpha4 → R2D internal normalizer

Core 只允许一个 normalizer 把 v1alpha4 default-only command 转为 R2D planner 当前可消费的内部 command view。

规则：

1. normalizer 是字段级显式投影，禁止 object spread 把未来字段静默带入；
2. normalized reasoning 恒为 `{requestedMode:"default"}`，不能读取 Preview/Profile；
3. request digest 对 canonical normalized material 计算，并与 command/clientTurn identity 共同进入既有 idempotency；
4. accepted 后 recovery 只读 coordination v1alpha4 durable exact plan，不再次 normalize 或读取 current authority；
5. public receipt 由 persisted R2D bundle 单一 projector 生成 v1alpha4 summary；不得先构造 legacy receipt 再删字段；
6. projector 必须从 `resolvedModelLock` 取模型，不得从 Agent/default/Renderer request 反推。

### 3.3 G3：三个 exact API，不扩宽旧入口

v1alpha4 只开放：

```text
getCompatibility()
submitTurn(command)
querySubmitTurn(query)
```

调用链：

```text
Renderer Workbench Adapter
  -> window.robothreeDesktopV1Alpha4
  -> exact v1alpha4 IPC channel
  -> Main exact schema parse
  -> Core private exact HTTP route
  -> DesktopApplicationFacade v1alpha4
  -> SubmitTurnCoordinator R2D path
```

禁止：generic `invoke(method, body)`、在 v1/v2 API 上追加 union、Main 重投影业务语义、Preload 返回未 parse 的 Core
body。

### 3.4 G4：Compatibility、gate 与不回退规则

Compatibility 至少投影：

- `contractVersion="v1alpha4"`；
- `runtimeInstanceId`、`transportClientInstanceId`；
- feature `r2d_submit_turn_default` 的 `available | unavailable`；
- content-free safe reason code。

真值表：

| production code-owned gate | graph | Desktop 行为 |
| --- | --- | --- |
| false | 不构造 R2D consumer | feature absent/unavailable；既有 legacy Workbench 保持原行为 |
| true | dependency 缺失/重复 | Core HTTP ready 前 fail-fast |
| test-only enabled | complete | v1alpha4 可达，用于真实集成/E2E |

Renderer 一旦在同一 runtime lease 协商到 v1alpha4 available，该次提交不得因 typed error 回退 legacy。Core restart /
runtimeInstanceId 变化必须重新协商；旧 runtime 的晚到响应返回 `runtime_changed`，不得投影为成功。

### 3.5 G5：Production composition 接线

bootstrap 只增加显式、code-owned、默认 false 的 composition 决策：

```text
R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED = false
R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED = false
R2D3_CORE_DELTA_DEFAULT_ENABLED = false
```

三者必须由单一 release decision 校验为一致；禁止三个独立开关。test-only E2E 可以显式注入 complete dependencies，
但测试入口不能进入 production main bundle/CLI/env/Profile。

### 3.6 G6：Renderer 模型选择与页面语义

v1alpha4 Workbench 路径：

1. 用户明确选择模型时提交 `requestedModelId`；
2. 用户没有明确选择时省略该字段，由 Core preference + entitlement ordinal 决策；
3. 不读取 `agent.defaultModelId`，不把 Catalog 顺序当 Core ordinal；
4. receipt 返回后展示 `resolvedModel`；
5. selected Skill/Knowledge 仍为显式选择；空数组保持明确为空，不自动恢复；
6. Core 返回 model/skill/knowledge unavailable 时展示固定中文安全摘要，不自动切 Agent/Model；
7. v1alpha4 路径不出现 Max、reasoning、Profile、digest 或“已启用最高推理”文案。

legacy v1alpha1 Workbench 可以继续保留历史逻辑，但不得被 v1alpha4 adapter/import；boundary test 必须证明两条入口
通过 contract version 和 feature lease 完全分开。

### 3.7 G7：Receipt 与 query exact replay

- submit response 与 status query 必须由同一 v1alpha4 projector 输出；
- response loss 后 query 返回同一 command/task/runtime/Agent/resolved Model identity；
- submit 与 query 每次 dispatch 都必须捕获同一份 Main→Core connection lease。请求执行期间
  `runtimeInstanceId`、`transportClientInstanceId` 或 Core client identity 任一变化时，该次旧 lease 的 submit/query
  响应统一返回 `runtime_changed`，即使旧 Core 已产生成功结果也不得把晚到响应投影为当前 runtime 的成功；
- Core restart 后，Renderer 必须先对新 runtime 重新完成 compatibility 协商；协商成功后，允许以同一
  `submitTurnCommandId` 在**新 current lease** 上重新发起 status query，并从原 SQLite durable Receipt 恢复历史结果。
  这属于合法 idempotent recovery，不是接受旧 runtime 晚到响应；
- `replayed` 不重新创建 Message/Task/Delivery，不重启 Agent Loop；
- old v1/v2/v3 receipt 由原 parser 读取，不被 v1alpha4 parser“试错接收”；
- corrupt v1alpha4 durable record typed fail-closed，不 fallback v1alpha3；
- `defaultModelId` 在 v1alpha4 Contract、Core projector、Main、Preload、Renderer、Evidence 中命中数必须为 0。

### 3.8 G8：真实 Desktop E2E

必须启动：

```text
Electron main process
  -> sandboxed preload/contextBridge
  -> Renderer page
  -> Main IPC
  -> real Core child/new runtime instance
  -> real SQLite file
  -> R2D planner/bundle/coordination
  -> controlled Agent Loop provider boundary
```

至少覆盖：

1. 首次 default-only submit；
2. explicit Model 与 omitted Model 两条路径；
3. response loss 后 status query；
4. `accepted`、`message_appended`、`task_committed` 三个 named barrier SIGKILL/restart；
5. restart 后新 PID、原 SQLite reopen、八类 authority read 增量为 0；
6. terminal replay Provider/Loop/Usage 增量为 0；
7. runtimeInstanceId 变化后 Renderer 重新协商；
8. gate=false 的 production build 不暴露可用 v1alpha4 feature。

barrier 必须为 deterministic test seam，禁止 sleep 猜窗口、自动 retry、单进程 throw 冒充 SIGKILL。

### 3.9 G9：敏感信息与资源归零

四通道 stdout/stderr/evidence/failure summary 扫描：namespace key、owner digest、Credential ref/Secret、Endpoint、
selection/lock raw JSON、Zod path、stack。至少 5 canary × raw/url/base64/hex × 4 通道 = 80 次负向注入，正常命中 0。

真实诊断必须归零：Electron child、Core child、fixture process、SQLite handles、IPC listeners、event subscriptions、
sockets、timers、AbortController、acceptance lease、namespace key copy、workspace handles。禁止 `?? 0`、缺失字段当 0
或 parent 盲信 child。

### 3.10 G10：诚实 Closure

最高输出：

```text
R2DP3_DESKTOP_V1ALPHA4_CUTOVER_CONFORMANT
productionR2dActivationEnabled=false
productionMaxPreviewReady=false
productionSubmitTurnMaxReachable=false
desktopMaxUiReady=false
providerReleaseAdmissionReady=false（除非 PRA-3 已独立关闭；即使为 true 也不改变本批结论）
tgmReady=false
knowledgeProviderReady=false
agentLifecycleReady=false
adminV2Ready=false
```

不得输出 `PRODUCTION_READY`、`DFI5_READY` 或 `MAX_READY`。

## 4. 生命周期与 cutover 窗口

### 4.1 首次接受窗口 D1～D8

| 窗口 | 必须证明 |
| --- | --- |
| D1 compatibility 后、submit 前 runtime 变化 | 旧 lease 拒绝，零 Core submit |
| D2 command accepted 前失败 | Message/Task/Receipt/Loop 全 0 |
| D3 accepted 后崩溃 | durable exact plan恢复，不重读 authority |
| D4 message_appended 后崩溃 | Message 恰 1，继续原 plan |
| D5 task bundle transaction 中失败 | 整包回滚，无 partial locks/selection |
| D6 task_committed 后崩溃 | bundle exact，Provider 前 barrier成立 |
| D7 completed response 丢失 | query 得同一 receipt，Loop 不重启 |
| D8 terminal replay | Provider/Usage/Loop 增量全 0 |

### 4.2 版本窗口 V1～V8

1. v1/v2/v3 historical command/receipt 仍由原 parser 读取；
2. v1alpha4 unknown extra field拒绝；
3. v1alpha4 `requestedMode=max` 拒绝；
4. v1alpha4 receipt含 `defaultModelId` 拒绝；
5. corrupt v1alpha4 不 fallback；
6. v1alpha4 request不进入 legacy selection；
7. v1alpha4 accepted record只走 coordination v1alpha4；
8. 未来 v1alpha5 不得通过当前 readable union提前接入。

## 5. 实施步骤与工期

### Step 1：Contract / Core exact ingress（1～2 日）

- v1alpha4 schemas、exports、frozen historical hashes；
- normalizer/projector、facade/private route、query replay；
- defaultModelId 零命中与 single-dispatch conformance。

### Step 2：Main / Preload / Renderer cutover（1～2 日）

- exact IPC/API/compatibility；
- runtime lease/restart 协商；
- Workbench explicit/omitted Model 与 safe error presentation。

### Step 3：真实 Electron lifecycle / Evidence（2～3 日）

- real Electron/Core/SQLite topology；
- named barriers、SIGKILL/reopen、response loss/query；
- leak/resource/boundary/historical regressions。

细化估算：**4～7 个集中工程日**，替代父计划 3～5 日粗估。增加量来自真实 Electron 进程 E2E 与版本/租约
cutover 证据，不代表新增产品功能。

## 6. 文件边界

### 6.1 允许

- `packages/contracts/src/desktop-local/v1alpha4/**`、必要 exact exports/tests；
- `services/core/src/application/desktop-application-facade.ts`、`submit-turn-coordinator.ts` 的 additive v1alpha4入口；
- `services/core/src/adapters/http/**`、`bootstrap/create-desktop-private-runtime.ts` 的最小默认关闭接缝；
- `apps/desktop/src/main/**`、`preload/**`、`shared/**`、`renderer/**`；
- 对应 tests、fixture、Harness、Evidence、docs、package scripts。

### 6.2 禁止

- Provider/Central/Admin/Document Worker production code；
- PRA/DFI-5.3 historical source/evidence；
- migration、依赖、lockfile；
- DFI-5.4.1～5.4.3、TGM、Knowledge Provider、Agent Lifecycle。

## 7. QA 矩阵（84 项）

### 7.1 Contract / version（QA-001～QA-014）

1. QA-001：v1alpha4 exact subpath/build产物可导入。
2. QA-002：v1/v2/v3 source hash零漂移。
3. QA-003：v1alpha4 command strict拒绝额外字段。
4. QA-004：reasoning只接受default literal。
5. QA-005：max/observed support字段拒绝。
6. QA-006：requestedModelId optional语义成立。
7. QA-007：receipt不含defaultModelId。
8. QA-008：receipt resolved Model来自exact lock。
9. QA-009：accepted/replayed要求summary。
10. QA-010：rejected不得伪造summary。
11. QA-011：status query版本精确。
12. QA-012：unknown version fail-closed。
13. QA-013：损坏v1alpha4不fallback。
14. QA-014：root export不把历史schema改成union。

### 7.2 Core / persistence（QA-015～QA-028）

15. QA-015：v1alpha4 normalizer只有一处。
16. QA-016：normalizer显式字段投影、无spread。
17. QA-017：default不读Preview/Profile。
18. QA-018：request digest确定且绑定command/clientTurn。
19. QA-019：首次authority规定次数恰好一次。
20. QA-020：accepted后八类current authority读取增量0。
21. QA-021：Task bundle同transaction提交。
22. QA-022：task_committed前Provider/Link/Loop全0。
23. QA-023：response loss不重复Message/Task/Delivery。
24. QA-024：query与submit共用单一projector。
25. QA-025：replay receipt identity一致。
26. QA-026：terminal replay Provider/Usage/Loop增量0。
27. QA-027：corrupt record typed fail。
28. QA-028：legacy records单次版本dispatch。

### 7.3 Main / Preload / Renderer（QA-029～QA-042）

29. QA-029：只有三个v1alpha4 exact API。
30. QA-030：无generic dispatcher。
31. QA-031：Main入口前strict parse。
32. QA-032：Preload响应strict parse。
33. QA-033：sandbox/contextIsolation保持开启。
34. QA-034：Renderer无ipcRenderer。
35. QA-035：compatibility绑定runtime/transport lease；submit/query执行期间lease变化均返回runtime_changed。
36. QA-036：稳定clientInstanceId不跨窗口冒充。
37. QA-037：runtime变化后必须重新协商，新lease可用同一command ID恢复查询durable Receipt。
38. QA-038：旧lease晚到submit/query响应均返回runtime_changed，不冒充新runtime成功。
39. QA-039：协商v1alpha4后失败不回legacy。
40. QA-040：v1alpha4路径不读agent.defaultModelId。
41. QA-041：省略model由Core决定。
42. QA-042：页面不出现Max/internal digest文案。

### 7.4 Gate / lifecycle（QA-043～QA-056）

43. QA-043：production code-owned gate默认false。
44. QA-044：env/CLI/Main/Renderer不能打开gate。
45. QA-045：true+依赖缺失在HTTP ready前fail-fast。
46. QA-046：test-only complete graph可达。
47. QA-047：production bundle不含test composition入口。
48. QA-048：D1 runtime race零submit。
49. QA-049：D2 pre-accept零durable。
50. QA-050：D3 accepted恢复原plan。
51. QA-051：D4 Message恰1。
52. QA-052：D5 transaction失败全回滚。
53. QA-053：D6 task_committed barrier成立。
54. QA-054：D7 response loss query成功。
55. QA-055：D8 terminal replay零调用。
56. QA-056：新PID+原SQLite reopen。

### 7.5 Real Desktop E2E（QA-057～QA-070）

57. QA-057：真实Electron main进程。
58. QA-058：真实sandboxed Preload/contextBridge。
59. QA-059：真实Renderer页面触发提交。
60. QA-060：真实Main IPC。
61. QA-061：真实Core child。
62. QA-062：真实SQLite文件。
63. QA-063：explicit Model成功。
64. QA-064：omitted Model由Core stable选择。
65. QA-065：Skill/Knowledge空集合保持空。
66. QA-066：model unavailable不自动换Agent/Model。
67. QA-067：SIGKILL由OS验证退出。
68. QA-068：deterministic barrier禁sleep。
69. QA-069：三轮fresh process semantic digest一致。
70. QA-070：权威字段漂移改变digest或typed fail。

### 7.6 Security / governance（QA-071～QA-084）

71. QA-071：80次负向泄漏注入全检出。
72. QA-072：正常四通道命中0。
73. QA-073：真实资源计数全部0。
74. QA-074：缺失诊断字段不得当0。
75. QA-075：migration止26。
76. QA-076：lockfile digest不变。
77. QA-077：新增依赖0。
78. QA-078：R2D/DFI/CPC historical evidence不漂移。
79. QA-079：production Max Preview/Submit/UI均false。
80. QA-080：PRA release不得被本批安装。
81. QA-081：TGM/Knowledge/Agent Lifecycle/Admin v2继续false。
82. QA-082：root check/lint/audit通过。
83. QA-083：Central online/offline通过。
84. QA-084：outcome不宣称production ready。

## 8. 正式门禁

```text
Node 24.13.0 / pnpm 11.11.0 preflight
focused v1alpha4 Contract/Core/Main/Preload/Renderer tests
real Electron/Core/SQLite lifecycle E2E
harness:r2dp3
harness:r2dp2 / r2dp1 / r2d4 / dfi5.3.4 / dfi5.2.3 / cpc3
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
lockfile / migration / package export / consumer / leak scans
```

## 9. 停手条件

出现任一情况立即停止并回评审：

1. 必须原地修改 Desktop v1～v3、Runtime Selection v1～v3 或 coordination v1～v4；
2. 必须在v1alpha4保留/改名`defaultModelId`；
3. 必须允许 Max 才能完成 R2D cutover；
4. 必须建立 legacy Runtime Selection 分支；
5. 必须让Renderer解释entitlement/ordinal/digest；
6. 必须用env/CLI/Main/Renderer打开production gate；
7. production graph只能依赖scripted/test fixture；
8. 真实Electron E2E只能用JSDOM/direct facade冒充；
9. 必须新增migration、依赖或lockfile变化；
10. 必须改Provider/PRA/DFI-5.3 historical evidence；
11. 必须打开Personal Model CRUD、TGM、Knowledge、Agent Lifecycle或Admin v2；
12. root/Central失败来自并发窗口且无法安全归因。

## 10. 文档评审问题

1. 是否接受 v1alpha4 只承载 R2D/default reasoning，Max 留给 v1alpha5？
2. 是否接受 v1alpha4 Receipt 完全删除 `defaultModelId`？
3. 是否接受 omitted Model 由 Core preference + stable ordinal 决定，Renderer 不补默认？
4. 是否接受三个 exact API 与独立 IPC/Preload surface？
5. 是否接受协商 v1alpha4 后 typed failure 不回 legacy？
6. 是否接受 production activation 继续 code-owned false，只用 test-only complete graph验收？
7. 是否接受真实 Electron/Core/SQLite/SIGKILL 是关闭本批的必要证据？
8. 是否接受 84 项 QA 与 4～7 日细化估算？
9. 是否确认本批不解锁 DFI-5.4.1、PRA、TGM、Knowledge、Agent Lifecycle 或 Admin v2？

## 11. 当前状态

```text
R2D-P.1                              PASS/CLOSED
R2D-P.2                              PASS/CLOSED
R2D-P.3                              PASS/CLOSED
PRA-1                                PASS/CLOSED
PRA-2                                PASS/CLOSED（含 repair.1）
PRA-3                                PASS/CLOSED
DFI-5.4.1～5.4.3                     GATED
production R2D activation            false
production SubmitTurn Max            false
Desktop Max UI                        false
```
