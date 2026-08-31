# STRM-3 Sensitive Transport Production Activation / Unblock Audit 详细实施方案

> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-29  
> 负责人：Codex 5.6  
> 已关闭上游：STRM-0～STRM-2、DFI-4A.4.1 `PASS/CLOSED`  
> 直接下游：DFI-4A.4.2 已进入 docs-only 评审、编码仍 `GATED`；4A.4.3 与 Desktop Renderer Personal Model UI 继续 `GATED`  
> 配套威胁模型：[Sensitive Renderer↔Main Transport Threat Model](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-THREAT-MODEL.md)  
> 父计划：[DFI-4A.4 Revision 2](./DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md)

## 0. 结论先行

STRM-3 是 **Sensitive Transport 层的 production activation 与 unblock audit**，不是 Personal Model CRUD、
Credential Reveal、生产签名 Helper、Renderer 页面或正式安装包能力批。

本批只关闭 STRM-0 留下的 Electron MessagePort transport blocker：把 STRM-2 已完成但在正常 Desktop entry 中
仍为 disabled 的 Main/Preload internal transport foundation 切换到 code-owned production activation，并证明
真实 Electron、sandboxed Preload、Main、`CorePrivateSupervisor`、Core child 与 fd4/fd5 Broker 通道在
main-frame identity、navigation、restart、SIGKILL、late callback、泄漏和资源回收方面满足冻结威胁模型。

只有独立 QA PASS 且用户接受后，本批才允许输出：

```text
STRM3_SENSITIVE_TRANSPORT_PRODUCTION_CONFORMANT
transportDecision = SENSITIVE_TRANSPORT_READY
productionSensitiveTransportReady = true
transportBlockerClosed = true
```

上述 `SENSITIVE_TRANSPORT_READY` **只表示 transport primitive 已可供后续 DFI-4A.4.2 调用**。它必须同时附带：

```text
productionFeatureEnabled = false
productionBusinessHandlerReady = false
productionHelperAssetPresent = false
personalModelCrudReady = false
credentialRevealReady = false
rendererPersonalModelUiReady = false
enterpriseIdentityReady = false
adminV2Ready = false
tgmReady = false
knowledgeProviderReady = false
agentLifecycleReady = false
zeroCopyClaimed = false
```

因此本批关闭后，真实用户仍只能使用 DFI-4A.4.1 的只读 Personal Model Catalog。Create、Update、Delete、Reveal、
生产 Keychain side effect 和 Renderer Personal Model 页面都不可达。DFI-4A.4.2 仍需独立计划接受和编码授权；
STRM-3 通过不构成其自动解锁。

## 1. 当前工程事实

### 1.1 已关闭且必须复用

1. STRM-0 已选择唯一 active profile `personal-credential.route-a.structured-clone.v1`，并由用户显式接受
   structured-clone 内部副本不可枚举、不可可靠清零的残余风险；该接受不等于 zero-copy。
2. STRM-1 已交付 private Ticket、binary envelope、HMAC binding、Main/Preload adapter foundation、16 KiB
   Secret 上限、bounded registry、single-use 与 typed error。
3. STRM-2.1 已把 production Main controller 与 sandboxed Preload receiver 接入真实 entry，但两处
   `foundationEnabled` 当前仍为 `false`。
4. STRM-2.2 已完成 Main-issued frame authorization、mutation/reveal 方向隔离、Broker lease、terminal gate、
   late callback 清理和 fd4/fd5 directional closure。
5. STRM-2.3 repair.1 已完成真实 Electron/Core child/SIGKILL/S1～S8、57 个 fresh-process scenarios、
   80 次负向泄漏注入和 14 类真实资源证据；历史 Harness、报告与结论保持只读。
6. 正常 Desktop Main 已构造 `PersonalCredentialTransportProductionController`、`MessageChannelMain` 和
   `CorePrivateSupervisor.personalCredentialBroker` lease；Preload 已构造并启动 internal receiver。
7. `CorePrivateSupervisor` 已建立 fd3 lifecycle 与 fd4 request/fd5 response sensitive channel，并在 Core restart
   后更换 runtime/channel identity。
8. DFI-4A.4.1 已交付 standalone/enterprise management authority、Helper 固定包内 manifest/trust chain 和
   Personal Model Compatibility/List/Detail 只读链路；独立 QA 已由用户接受，正式 `PASS/CLOSED`。

### 1.2 当前必须关闭的缺口

| ID | 当前事实 | STRM-3 决策 |
| --- | --- | --- |
| G1 | Main controller 与 Preload receiver 在 normal entry 都传入 `foundationEnabled: false` | 使用单一 code-owned activation revision，在正常 entry 中启用 internal foundation；禁止 env/argv/Renderer 开关 |
| G2 | controller/receiver snapshot 将 ready/blocker 字段写死为 false | 改为从严格 activation state 派生；`productionFeatureEnabled` 和 business handler 仍固定 false |
| G3 | Core Personal Model Compatibility 的 `transportProductionReady` 仍固定 false | 只接受 Main→Core boot 的 content-free exact activation descriptor；缺失/漂移返回 unavailable，不猜测 ready |
| G4 | Core child production Broker handler仍固定返回 `credential_store_unavailable` | 本批保持不变；真实业务 handler 由 DFI-4A.4.2 接线，不能用 Fixture 冒充 |
| G5 | production Helper binary/签名资产不存在 | 本批不生成、不签名、不宣称 Helper ready；transport verdict 与 Helper verdict 分层 |
| G6 | STRM-2 只证明 disabled wiring，没有当前 normal graph 的 activation audit | 新建 STRM-3 current-state Harness，历史 Harness/Evidence只读，不修改旧期望值适配合法演进 |
| G7 | 无 current activation 下的真实 Electron restart/navigation/SIGKILL证据 | 使用正常安全窗口参数、真实 sandboxed Preload、真实 Supervisor/Core child/fd4/fd5做聚焦 lifecycle matrix |
| G8 | 无 STRM-3 closure evidence 与 DFI-4A.4 父账本回链 | 输出独立 Evidence；只推进父 QA-061～080 的 transport owner ledger，父 120 项仍保留至 DFI-4A.4.3 closure |

### 1.3 当前基线

```text
Root/Core/Contracts version          = 0.0.0-dfi.4a.4.1
Desktop version                      = 0.0.0-dfe.run.1（并行前端批当前值）
Admin version                        = 0.0.0-afe.6c
pnpm-lock.yaml sha256                = 5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31
migration max                        = 26
DFI-4A.4.1 evidenceDigest            = sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750
production Helper asset              = absent
production Broker business handler  = unavailable
Renderer Personal Model consumer    = 0
```

Desktop 正在并行进行前端体验批；STRM-3 编码窗口必须先确认该批版本已冻结，并只触碰 Main/Preload/Shared 与明确
列出的测试文件。不得回退、覆盖或重新解释前端工作区改动。版本推进策略在 STRM-3 编码授权后按当时最新合法
Desktop 版本确定，不在本 docs-only 方案中提前改写 package version。

## 2. 范围与非目标

### 2.1 本批交付

1. 单一 code-owned sensitive transport activation revision 与 strict runtime state；
2. normal Desktop Main/Preload internal foundation activation；
3. Main→Core content-free activation descriptor 与 Core exact validation；
4. DFI-4A.4.1 Compatibility 中 `transportState=ready` 的可信来源；
5. normal graph 不暴露 mutation/reveal API 的静态与运行时证明；
6. real Electron/Core child/fd4/fd5 activation audit；
7. identity、navigation、Core restart、Renderer crash、Main close、profile drift 与 SIGKILL 窗口；
8. 80 次负向泄漏注入、正常四通道零命中、真实资源归零；
9. STRM-3 focused Evidence、实施报告和 DFI-4A.4 父账本 owner 回链。

### 2.2 明确不做

- 不新增 create/update/delete/reveal/query business method、Core HTTP route、Main IPC channel 或 Preload API；
- 不把 Secret 放进 `ipcRenderer.invoke/send`、Core private HTTP、JSON、argv、env、SQLite、文件或 URL；
- 不接 production Personal Model Coordinator/Reveal Service 到 Broker；
- 不生成 production signed Helper asset，不改 signing/notarization/DMG/auto-update；
- 不修改 `apps/desktop/src/renderer/**` 或 Renderer Personal Model UI；
- 不修改 Admin、Central、Document Worker、TGM、Knowledge Provider、Agent Lifecycle；
- 不新增 migration 27，不修改 migration 1～26；
- 不新增第三方依赖，不修改 lockfile；
- 不增加第二个 transport profile、runtime fallback、utility process 或 native transport；
- 不修改 STRM-0～2.3 historical Harness/报告/evidence 以适配当前状态；
- 不输出 Personal Model、Helper、Enterprise、Renderer 或 release production-ready 声明。

## 3. 冻结语义：Transport Ready 不等于 Feature Ready

### 3.1 四层事实面

```text
Layer 1 — Transport primitive
  Main/Preload internal foundation、profile、MessagePort、identity、fd4/fd5、cleanup

Layer 2 — Business handler
  PersonalModelCredentialCoordinator / RevealService / durable Journal / Receipt

Layer 3 — Credential runtime
  verified production Helper、Keychain、authority、exact prepared command

Layer 4 — Product surface
  Core safe prepare/status、Main/Preload API、Renderer form/reveal UI
```

STRM-3 只允许 Layer 1 为 ready。Layer 2～4 在本批全部保持 unavailable/GATED。任何 Evidence、Compatibility 或
日志都不得把 `transportState=ready` 翻译为“可以保存 API Key”“可以查看 Key”或“个人模型已可管理”。

### 3.2 两个不同的 gate

```text
transportActivationEnabled = true
productionFeatureEnabled   = false
```

- `transportActivationEnabled=true` 表示 internal receiver/controller 可以接受未来 Core-prepared exact command；
- `productionFeatureEnabled=false` 表示当前无任何 product caller 可以 prepare/open/submit/reveal；
- normal Renderer 不能观察、覆盖或触发第一个 gate；
- 第二个 gate 只能在 DFI-4A.4.2 以后由 authority + Helper + business handler + transport 的全条件决定。

## 4. G1：单一 Code-owned Activation Authority

新增一个 Main/Preload 可共同读取、Renderer 不可导入的 private activation source。它至少冻结：

```text
schemaVersion = strm3-sensitive-transport-activation.v1
transportProtocolVersion
transportProfileRevision
activationRevision
activationState = production_active
runtimeFallbackEnabled = false
zeroCopyClaimed = false
structuredCloneInternalCopiesReliablyClearable = false
```

要求：

1. `activationRevision` 由上述 content-free canonical material 计算，禁止墙钟、PID、路径、nonce 或 Secret；
2. Main controller 与 Preload receiver 必须读取同一 source，不得复制两份 boolean 真值；
3. Renderer、LocalStorage、env、argv、query string、feature flag server 均不能改变 production state；
4. test 可以显式构造 disabled/mismatch variant，但 test variant 不得进入 normal entry；
5. unknown schema/profile/revision 必须 typed unavailable，禁止回退 STRM-1 legacy path；
6. activation source 不包含 Credential、owner、Endpoint、Helper path 或 Personal Model identity。

## 5. G2：Normal Main / Preload Production Wiring

### 5.1 Main

normal `apps/desktop/src/main/index.ts` 使用 code-owned activation source 构造唯一
`PersonalCredentialTransportProductionController`：

- `foundationEnabled=true` 只来自 exact activation source；
- 仍使用现有 `MessageChannelMain`；
- 仍从当前 `CorePrivateSupervisor` 获取 runtime/channel/client exact Broker lease；
- 仍只挂在 exact main window `webContents`；
- 仍不注册任何 mutation/reveal public IPC；
- `before-quit`、window close、Core loss 时关闭 session、port、timer 和 listener；
- snapshot 允许 `productionSensitiveTransportReady=true / transportBlockerClosed=true`，但
  `productionFeatureEnabled=false / productionBusinessHandlerReady=false` 必须保持字面或封闭状态。

### 5.2 Preload

normal `apps/desktop/src/preload/index.ts` 使用同一 activation source 构造唯一 internal receiver：

- receiver 可监听固定 private port-offer channel；
- 不通过 `contextBridge` 暴露 `submitMutationSecret`、`cancel` 或 reveal consumer；
- 当前没有 business consumer 时，reveal 必须失败关闭并清理 bytes；
- mutation 没有 internal caller 时不可被 main world 触发；
- unload 时必须关闭 receiver；
- snapshot 可声明 transport ready/blocker closed，但 feature 仍 false。

### 5.3 不新增 Product API

本批前后必须满足：

```text
Personal Model Preload method count = 3
Personal Model Main IPC count       = 3
Personal Model Core route count     = 3
mutation method count               = 0
reveal method count                 = 0
Renderer consumer count             = 0
```

任何为了测试 active transport 而向 `window.robothreePersonalModelV1Alpha1` 增加敏感方法的方案立即停手。

## 6. G3：Main→Core Content-free Activation Descriptor

DFI-4A.4.1 的 Compatibility 由 Core 生成，因此 Core 不能仅凭“代码大概已接线”把
`transportProductionReady` 写成 true。STRM-3 增加 strict、content-free boot descriptor：

```text
schemaVersion
transportProtocolVersion
transportProfileRevision
activationRevision
activationState
runtimeFallbackEnabled
zeroCopyClaimed
```

固定顺序：

1. Main 从 code-owned source 创建 descriptor；
2. 通过现有 trusted Core boot IPC 交给 Core child；
3. `desktop-private-main.ts` strict parse，一次 schema dispatch；
4. Core bootstrap 重新计算/比对 exact activation revision；
5. exact match 时 `transportProductionReady()` 才能返回 true；
6. 缺失、unknown、duplicate、profile drift 或 digest mismatch 一律返回 unavailable 或启动期 typed fail-closed；
7. 不因 fd4/fd5 文件描述符存在就单独推导 ready；
8. descriptor 不进入 Renderer、public Contract、日志、Receipt、SQLite 或 Evidence 正文。

Compatibility 允许得到：

```text
catalogAvailable = true
transportState = ready
mutationAvailable = false
revealAvailable = false
helperState = unavailable
```

这是合法且必须覆盖的状态组合。

## 7. G4：Broker 与 Business Handler 隔离

STRM-3 不修改 Core child 当前的 production Broker handler：

```text
handler -> rejected(credential_store_unavailable)
productionBusinessHandlerReady = false
```

原因是 Transport Audit 只验证 Secret bytes 的有界、定向、身份绑定传递，不拥有 Personal Model durable prepare、
authority、Keychain operation、Receipt 或 Reveal admission。后续 DFI-4A.4.2 必须复用既有
`createPersonalModelCredentialBrokerHandler()`，不能把 STRM-3 的 audit fixture 变成 production handler。

测试成功路径可使用明确标记为 `test_only_controlled_broker` 的 Core child fixture，但必须同时证明：

- fixture 不被 normal `desktop-private-main.ts` import；
- production handler readiness 仍 false；
- test Secret 使用固定 canary，绝不使用真实用户 Key；
- controlled Broker 只证明 transport，不生成业务 Receipt 或“保存成功”；
- production normal graph 对 sensitive operation 仍无 caller，调用计数为 0。

## 8. G5：Identity、Lease 与 Lifecycle

### 8.1 Identity authority

- `webContentsId`、main-frame routing identity 与 navigation epoch 只由 Main 从真实 Electron event 派生；
- Renderer 不能提交这些字段；subframe、foreign webContents、destroyed frame 全拒绝；
- runtime/client/channel identity 来自当前 `CorePrivateSupervisor` lease；
- Core restart 后旧 lease、ticket、port、authorization 与 callback 全失效；
- profile/activation revision drift 时不尝试 legacy fallback。

### 8.2 窗口矩阵

复用 STRM-2 的 S1～S8 语义，并新增 STRM-3 activation 观察：

| 窗口 | 触发点 | 必须结果 |
| --- | --- | --- |
| A1 | activation descriptor 缺失 | transport unavailable，Catalog仍可读，零port/零Broker |
| A2 | activation/profile/revision drift | typed fail-closed，无 fallback |
| A3 | normal Main active、Preload未完成启动 | 无 product caller；不得伪报 mutation/reveal available |
| A4 | main-frame navigation | 旧 session/ticket/port 全失效 |
| A5 | Renderer crash / webContents destroyed | listener、port、timer、session归零 |
| A6 | Core SIGKILL / Supervisor restart | 新 runtime/channel identity；旧 callback只cleanup |
| A7 | Main close / app quit | Core child、sensitive stream、port、timer归零 |
| A8 | late Broker/port callback | 单一 terminal不改写，late count来自真实 snapshot |

S1～S8 historical meaning保持不变。STRM-3 不把 mutation 的外部 side effect 说成 exactly-once；本批 normal graph
无业务 handler，测试受控 dispatch 只证明 transport。Reveal 仍是 no replay。

## 9. G6：真实 Process / Unblock Audit

### 9.1 两类证据必须同时存在

**Normal production graph evidence**：

- 真实 Electron binary；
- normal Main entry、normal sandboxed Preload、`contextIsolation=true`、`nodeIntegration=false`；
- code-owned activation 为 active；
- Core child、fd3 lifecycle、fd4/fd5 sensitive streams真实创建；
- DFI-4A.4.1 read-only API 可协商 `transportState=ready`；
- mutation/reveal public method、IPC、route、Renderer caller全部为 0。

**Controlled transport data-path evidence**：

- 真实 Electron/Main/sandboxed Preload；
- 真实 `CorePrivateSupervisor` 与 fresh Core child；
- 生产 controller/receiver/Broker client/server 类；
- test-only prepared command 与 controlled handler；
- mutation/reveal各完成三轮 fresh process；
- navigation、Renderer crash、Core SIGKILL、Main close与late callback场景。

两类证据缺一不可。不能用 normal graph 的静态 import 冒充 bytes path，也不能用 fixture success 冒充 production
business handler 或 product API 已 ready。

### 9.2 进程纪律

- 使用真实 child process、真实 PID、真实 SIGKILL 与新 PID；
- 不用单进程 `throw` 冒充 crash；
- 不用删除数据库或重建目录冒充 reopen；
- 不用 sleep 猜窗口，使用 named barrier；
- 不自动 retry 掩盖失败；
- PID、端口、临时路径和墙钟只用于 parent diagnostics，不进入 semantic digest 或 safe evidence。

## 10. G7：Secret、泄漏与资源证据

### 10.1 Secret 生命周期

必须继续保持：

- mutation：caller bytes、Preload working copy、MessagePort event body、Main envelope、Broker request copy在各自
  responsibility 结束时 `fill(0)`；
- reveal：Broker response、Main working copy、Preload consumer copy在成功/失败/timeout/navigation后清零；
- Chromium serializer、JS String、OS crash dump和swap不可枚举，不宣称清零；
- 不把 Secret 派生 hash 当持久 evidence。

### 10.2 四通道与 80 次负向注入

四通道：

```text
parentStdout
childStderr
machineEvidence
safeTrace
```

五类 marker：canary、credential、Endpoint、body、absolute path；四种编码：raw、Base64、URL percent、hex。
必须执行 `4 × 5 × 4 = 80` 次负向注入，每次精确检出一次；正常四通道总命中必须为 0。scanner 失败消息不得
回显 marker。

### 10.3 真实资源归零

最终 Evidence 至少从真实诊断或 OS 句柄派生以下 16 类资源：

```text
electronProcessCount
browserWindowCount
webContentsCount
messagePortCount
ipcListenerCount
navigationListenerCount
timerCount
transportSessionCount
transportRegistryCount
brokerInflightCount
brokerTombstoneCount
coreChildProcessCount
sensitiveStreamCount
helperProcessCount
listeningPortCount
temporaryDirectoryCount
```

每项必须是非负安全整数；缺字段、`?? 0`、固定 JSON 0、parent 盲信 child 或只看 process exit code 均不接受。
SIGKILL 场景需同时使用 exact barrier snapshot 与 parent OS process observation。

## 11. G8：Evidence 与诚实 Closure

STRM-3 Evidence 至少包含：

```text
status
outcome
transportDecision
activationSchemaVersion
activationRevision
transportProtocolVersion
transportProfileRevision
normalProductionGraphActivated
normalProductSensitiveCallerCount
productionSensitiveTransportReady
transportBlockerClosed
productionFeatureEnabled
productionBusinessHandlerReady
productionHelperAssetPresent
personalModelCrudReady
credentialRevealReady
rendererPersonalModelUiReady
zeroCopyClaimed
normalGraphScenarioCount
controlledDataPathScenarioCount
semanticReplayCount
semanticEvidenceDigest
negativeLeakInjectionDetectionCount
fourChannelLeakageMatchCounts
resourceCounts
historicalDfi4a41EvidenceDigest
parentQaLedgerStatus
migrationMax
lockfileDigest
versions
evidenceDigest
```

规则：

1. Evidence 只含 allowlisted status/count/digest/revision，不含 Secret、Endpoint、Credential ref、owner、路径、PID、
   port、stack 或 Zod path；
2. STRM-2.3 report/repair report/Harness 与 DFI-4A.4.1 Evidence 均保持只读；历史 STRM-2.3
   没有 `artifacts/strm2.3/evidence.json`，不得虚构该路径，历史依据以报告、repair 报告及 Harness 为准；
3. 历史 STRM-2 snapshot 中的 false 是历史时点事实，不因 STRM-3 合法演进而改写；
4. DFI-4A.4 父 120 项只把 QA-061～080 标为 `executed_by_strm3`，其余项目仍
   `retained_for_dfi4a4_stage_closure`；
5. 最高 outcome 不得包含 `PERSONAL_MODEL_READY`、`PRODUCTION_READY`、`HELPER_READY`、`RENDERER_READY` 或
   `ENTERPRISE_READY`。

## 12. 实施拆分与工期

### Step 1：Activation Authority 与分层 Readiness（0.5～1 日）

- code-owned activation source；
- Main/Preload normal entry 激活；
- controller/receiver snapshot 分层；
- Core boot descriptor与Compatibility exact validation；
- public API method/channel/route count保持不变。

### Step 2：Normal Graph / Controlled Data Path Audit（1～1.5 日）

- production-like Electron build；
- normal graph activation + zero product caller；
- controlled mutation/reveal三轮；
- A1～A8、Core SIGKILL、navigation、renderer crash、Main close；
- deterministic barrier与semantic summary。

### Step 3：Leakage / Resource / Closure（0.5 日）

- 80次负向注入；
- 16类真实资源归零；
- DFI-4A.4 QA-061～080 owner ledger；
- Harness、Evidence、实施报告、版本与治理回链；
- 独立QA前不标记`PASS/CLOSED`。

合计 **2～3 个集中工程日**，与 DFI-4A.4 Revision 2 父计划一致；不含独立 QA、返工、生产 Developer ID
签名资产、DFI-4A.4.2 或 Renderer UI。

## 13. 允许与禁止修改范围

### 13.1 获得单独编码授权后允许

- `apps/desktop/src/main/personal-credential-transport*.ts`；
- `apps/desktop/src/preload/personal-credential-transport*.ts`；
- normal Main/Preload entry 的最小 activation 接线；
- `apps/desktop/src/shared/**` 中仅限 content-free private activation source；
- `apps/desktop/src/main/core-private-supervisor.ts` 的 content-free boot descriptor接线；
- `services/core/src/desktop-private-main.ts`、bootstrap与Personal Model read service的exact descriptor验证；
- STRM-3 focused tests、独立 process fixture、Harness、Evidence、实施报告；
- 必要的版本、README、CHANGELOG、DEVELOPMENT-LOG。

### 13.2 明确禁止

- `apps/desktop/src/renderer/**`；
- Personal Model public Contract扩写或create/update/delete/reveal API；
- production business handler、Coordinator/Reveal语义、Keychain写入或Helper signing资产；
- STRM-0～2.3 historical Harness/报告/evidence修改；
- DFI-4A.4.1 Evidence重写；
- Central/Admin/Document Worker/TGM/Knowledge/Agent Lifecycle；
- migration、依赖、lockfile；
- env/argv/Renderer开关、runtime fallback、第二transport profile；
- 公网、真实用户Key、付费Provider调用。

## 14. Focused QA 矩阵（96 项）

### 14.1 Activation / Contract Boundary（QA-001～QA-016）

1. QA-001 STRM-0～2与DFI-4A.4.1状态均PASS/CLOSED；
2. QA-002 single active transport profile不变；
3. QA-003 code-owned activation schema strict；
4. QA-004 activation revision deterministic；
5. QA-005 byte drift改变revision；
6. QA-006 unknown schema拒绝；
7. QA-007 profile mismatch拒绝；
8. QA-008 duplicate activation source拒绝；
9. QA-009 runtime fallback固定false；
10. QA-010 zeroCopyClaimed固定false；
11. QA-011 structured-clone内部副本不可可靠清零声明保留；
12. QA-012 env无法开启或关闭production activation；
13. QA-013 argv无法开启或关闭production activation；
14. QA-014 Renderer无法导入private activation source；
15. QA-015 public Contract root零扩宽；
16. QA-016 migration/依赖/lockfile零漂移。

### 14.2 Normal Production Graph（QA-017～QA-032）

17. QA-017 normal Main controller foundation active；
18. QA-018 normal Preload receiver foundation active；
19. QA-019 Main/Preload使用同一activation revision；
20. QA-020 normal graph只有一个controller；
21. QA-021 normal graph只有一个receiver；
22. QA-022 normal BrowserWindow sandbox=true；
23. QA-023 contextIsolation=true；
24. QA-024 nodeIntegration=false；
25. QA-025 Main固定MessageChannelMain；
26. QA-026 Preload固定private offer channel；
27. QA-027 Core fd4/fd5真实建立；
28. QA-028 Main→Core descriptor strict parse；
29. QA-029 Core重算activation revision；
30. QA-030 Compatibility transportState=ready；
31. QA-031 mutationAvailable/revealAvailable仍false；
32. QA-032 catalogAvailable不依赖Helper或business handler。

### 14.3 Product Surface / Business Isolation（QA-033～QA-048）

33. QA-033 Personal Model Preload方法数仍3；
34. QA-034 Personal Model IPC channel数仍3；
35. QA-035 Personal Model Core route数仍3；
36. QA-036 create method count=0；
37. QA-037 update method count=0；
38. QA-038 delete method count=0；
39. QA-039 reveal method count=0；
40. QA-040 Renderer consumer count=0；
41. QA-041 public invoke不携带Secret；
42. QA-042 Core HTTP不携带Secret；
43. QA-043 production business handler仍typed unavailable；
44. QA-044 productionBusinessHandlerReady=false；
45. QA-045 productionFeatureEnabled=false；
46. QA-046 productionHelperAssetPresent=false；
47. QA-047 audit fixture不进production graph；
48. QA-048 controlled transport completion不生成业务Receipt或保存成功。

### 14.4 Identity / Lifecycle / Crash（QA-049～QA-064）

49. QA-049 webContents identity由Main派生；
50. QA-050 main-frame routing identity由Main派生；
51. QA-051 navigation epoch由Main派生且单调；
52. QA-052 subframe拒绝；
53. QA-053 foreign webContents拒绝；
54. QA-054 destroyed frame拒绝；
55. QA-055 stale ticket拒绝；
56. QA-056 duplicate frame单winner；
57. QA-057 navigation使旧session失效；
58. QA-058 renderer crash清理；
59. QA-059 Core SIGKILL真实发生；
60. QA-060 Core restart得到新PID/runtime/channel；
61. QA-061 旧Broker lease callback只cleanup；
62. QA-062 Main close清理；
63. QA-063 profile drift无fallback；
64. QA-064 A1～A8每个named barrier恰好一次。

### 14.5 Data Path / Memory / Leakage（QA-065～QA-080）

65. QA-065 mutation exact authorization先于body；
66. QA-066 reveal exact authorization先于delivery；
67. QA-067 mutation只向Main；
68. QA-068 reveal只向Preload exact consumer；
69. QA-069 body长度1接受；
70. QA-070 body长度16384接受；
71. QA-071 body长度0拒绝；
72. QA-072 body长度16385拒绝；
73. QA-073 wrong brand拒绝；
74. QA-074 nested port拒绝；
75. QA-075 application-owned mutation copies清零；
76. QA-076 application-owned reveal copies清零；
77. QA-077 timeout/cancel/navigation finally清零；
78. QA-078 80次负向泄漏注入全部检出；
79. QA-079 正常四通道敏感命中0；
80. QA-080 scanner错误不回显marker。

### 14.6 Resource / Evidence / Closure（QA-081～QA-096）

81. QA-081 mutation三轮fresh process semantic digest一致；
82. QA-082 reveal三轮fresh process semantic digest一致；
83. QA-083 semantic digest保留profile/activation/direction/window权威字段；
84. QA-084 semantic digest排除PID/port/path/wall-clock/nonce；
85. QA-085 authority字段漂移改变digest或typed fail-closed；
86. QA-086 16类resourceCounts字段齐全；
87. QA-087 16类resourceCounts来自真实diagnostics；
88. QA-088 SIGKILL使用barrier snapshot+OS observation；
89. QA-089 lateCallbackCount缺失即失败；
90. QA-090 所有资源最终为0；
91. QA-091 historical STRM-2.3材料只读；
92. QA-092 DFI-4A.4.1 evidence digest不漂移；
93. QA-093 DFI-4A.4 QA-061～080 ledger逐项pass；
94. QA-094 父其余100项仍retained；
95. QA-095 outcome精确为STRM3 conformant + SENSITIVE_TRANSPORT_READY；
96. QA-096 11项downstream readiness false与zeroCopyClaimed=false齐全。

## 15. 开发者门禁

编码后至少严格串行执行：

```bash
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
CI=true pnpm run harness:strm3
CI=true pnpm run harness:dfi4a4.1
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run lint
CI=true pnpm run typecheck
CI=true pnpm run audit:dtp4
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central:offline
```

历史 `harness:strm2.3` 只允许作为只读兼容观察，不能因当前合法 activation 从 false 变 true而修改其快照；
STRM-3 必须用自身 Harness 证明当前状态。并行前端若造成 root check 边界失败，需由对应 owner 先关闭或在报告中以
精确文件/因果证据隔离，不得自动 retry 或掩盖。

## 16. 停手条件

出现以下任一情况立即停止编码并回评审：

1. 必须新增 public mutation/reveal API 才能证明transport active；
2. 必须修改Renderer页面或Adapter；
3. 必须把controlled Broker接进production graph；
4. 必须生成业务Receipt或“保存成功”才能关闭transport；
5. 必须生成、ad-hoc签名或伪造production Helper；
6. 必须用env/argv/Renderer参数控制activation；
7. 必须添加第二transport profile或runtime fallback；
8. 必须把Secret放进普通IPC/HTTP/JSON/SQLite/文件/日志/Evidence；
9. 必须接受subframe、foreign webContents或Renderer自报identity；
10. 必须改写STRM-0～2.3 historical Harness/报告/evidence；
11. 必须改写DFI-4A.4.1 evidence；
12. 必须新增migration或第三方依赖/lockfile变化；
13. 必须进入Central/Admin/TGM/Knowledge/Agent Lifecycle；
14. 真实Electron只能用JSDOM/direct call替代；
15. crash只能用throw、删库或sleep猜窗口冒充；
16. 80次负向泄漏注入不能全部检出；
17. 正常四通道存在敏感命中；
18. 资源计数只能硬编码0、`?? 0`或缺字段当0；
19. transport ready必须依赖production Helper或business handler才能表达；
20. `transportState=ready`会使mutation/reveal自动变true；
21. structured-clone风险必须被解释成zero-copy才能关闭；
22. 需要公网、真实用户Key或付费Provider；
23. 并行前端改动与STRM文件发生无法安全分离的冲突；
24. 只能输出production ready、Personal Model ready或Renderer ready才能关闭本批。

## 17. 文档评审问题

请独立评审明确回答：

1. 是否接受 STRM-3 只关闭 Electron sensitive transport blocker，不关闭 Personal Model feature？
2. 是否接受 normal Main/Preload internal foundation启用，而product caller数仍为0？
3. 是否接受 `productionSensitiveTransportReady=true` 与 `productionFeatureEnabled=false` 同时成立？
4. 是否接受 Core 只从 Main boot 的content-free exact descriptor判断transport state？
5. 是否接受 production Broker business handler仍unavailable，成功数据路径只用test-only controlled handler？
6. 是否接受 Helper资产缺失不阻止transport verdict，但继续阻止mutation/reveal？
7. 是否接受historical STRM-2 false snapshot只读，不为当前合法演进改写？
8. 是否接受normal graph证据与controlled bytes-path证据必须同时存在？
9. 是否接受A1～A8、真实SIGKILL、新PID和fd4/fd5是必要证据？
10. 是否接受80次泄漏注入、16类资源真实归零和父QA-061～080逐项ledger？
11. 是否接受最高输出只为STRM3 conformant + SENSITIVE_TRANSPORT_READY，并附全部下游false？
12. 是否接受2～3个集中工程日估算以及编码前先等待独立文档复核和用户授权？

评审输出必须包含：`PASS / PASS_WITH_REVISIONS / RED`、P0～P3、是否可冻结、是否保持 Coding Gated。

## 18. 当前门禁

```text
STRM-0～STRM-2                       PASS/CLOSED
DFI-4A.4.1 Revision 2               PASS/CLOSED
STRM-3                               PASS/CLOSED / SENSITIVE_TRANSPORT_READY
DFI-4A.4.2 Revision 2                DOCUMENT REVIEW PENDING / CODING GATED
DFI-4A.4.3 Revision 2                GATED
Desktop Renderer Personal Model UI  GATED
production Helper asset             false
production Personal Model CRUD      false
production Credential Reveal        false
Enterprise identity/entitlement     false / deferred
Admin v2 / TGM / Knowledge / Agent Lifecycle GATED
```

独立代码 QA 结论 `PASS（P0=0 / P1=0 / P2=0 / P3=0）` 已由用户接受，STRM-3 正式 `PASS/CLOSED`。
本次关闭只确认 `STRM3_SENSITIVE_TRANSPORT_PRODUCTION_CONFORMANT / SENSITIVE_TRANSPORT_READY`，不代表
Personal Model production ready，也不自动解锁 DFI-4A.4.2～4A.4.3、Renderer Personal Model UI 或其他下游。
