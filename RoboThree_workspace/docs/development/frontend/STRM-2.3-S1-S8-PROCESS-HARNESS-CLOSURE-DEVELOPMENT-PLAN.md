# STRM-2.3 S1～S8 Process Harness 与阶段收口详细实施方案

> 状态：**PASS/CLOSED — repair.1 INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-23  
> 负责人：Codex 5.6  
> 上游：STRM-2 Plan、STRM-2.1、STRM-2.2 均 `PASS/CLOSED`  
> 下游：STRM-3、EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM 均 `GATED`  
> 父计划：[STRM-2 Production Transport Wiring](./STRM-2-PRODUCTION-WIRING-DEVELOPMENT-PLAN.md)
> 实施报告：[STRM-2.3 S1～S8 Process Harness 与阶段收口](./STRM-2.3-S1-S8-PROCESS-HARNESS-CLOSURE-REPORT.md)
> Repair.1 报告：[进程退出与资源证据修复](./STRM-2.3-REPAIR.1-RESOURCE-EVIDENCE-REPORT.md)

## 1. 结论先行

STRM-2.3 是 STRM-2 的**进程级证据与阶段收口批**。它不新增个人模型产品能力，而是用真实
Electron Main、sandboxed Preload、真实 `CorePrivateSupervisor`、真实 Core child JSON lifecycle 与
fd4/fd5 binary Broker 通道，逐个制造并验证 S1～S8 命名窗口。

本批成功时唯一允许的能力结论是：

```text
STRM2_PRODUCTION_WIRING_CONFORMANT
```

并且必须同时固定：

```text
productionFeatureEnabled = false
productionSensitiveTransportReady = false
productionBusinessHandlerReady = false
transportBlockerClosed = false
rendererBusinessApiExposed = false
zeroCopyClaimed = false
```

本批不得输出 `SENSITIVE_TRANSPORT_READY`，不得关闭 Electron sensitive transport blocker，不得把
controlled Broker fixture、prepared command fixture 或 test-only barrier 解释为 production identity、
business handler、Credential CRUD/reveal 或 Renderer API 已就绪。

## 2. 当前代码事实与剩余缺口

### 2.1 已完成并直接复用

1. STRM-0 已用真实 Electron 43.2.0 证明 Route A structured-clone `Uint8Array` 双向可达，并保留
   “应用层可观察副本下界为 2、内部副本不可枚举且不可可靠清零”的已接受残余风险；
2. STRM-1 已冻结 private Ticket、binary envelope、Transport Registry、typed error 与 Main/Preload
   Adapter Foundation；
3. STRM-2.1 已实现 strict control、Main-derived window/frame/navigation identity、one-shot port 与
   lifecycle closure；
4. STRM-2.2 已实现 Main-issued frame authorization、mutation/reveal 双向 Broker dispatch、exact Broker
   lease、single-dispatch CAS、late callback gate 与 transport/business fact 分离；
5. `CorePrivateSupervisor` 生产配置继续使用 JSON lifecycle fd3，并已真实建立 fd4 request / fd5 response；
6. `PersonalCredentialBrokerClient` / `PersonalCredentialBrokerServer` 已具备 strict binary framing、
   channel/client identity、deadline、abort 与 byte cleanup；
7. DFI-4A.2 已独立证明 Operation Journal/Receipt/Keychain inspect 恢复与 owner reveal no-replay；
8. production Main/Preload entry 仍 `foundationEnabled=false`，无 public `ipcMain.handle`、无
   `contextBridge` personal model method、无 Renderer import。

### 2.2 本批必须关闭的证据缺口

| 编号 | 当前缺口 | STRM-2.3 关闭方式 |
| --- | --- | --- |
| G1 | STRM-2.2 Electron fixture 使用进程内 `ControlledBroker`，没有穿过真实 `CorePrivateSupervisor` 与 fd4/fd5 | 用真实 Supervisor 启动受控 Core child，JSON lifecycle 与 fd4/fd5 均走生产接缝 |
| G2 | 只有 4 个方向闭合场景，没有 S1～S8 全矩阵 | Parent 在命名 barrier 后制造真实 close/crash/SIGKILL/restart |
| G3 | S4～S7 缺少确定性窗口证明 | 增加默认 no-op、仅构造注入的 safe barrier/diagnostics seam，禁止轮询猜测 |
| G4 | 当前 resource snapshot 只覆盖单进程局部资源 | Parent 聚合 Electron/Main/Preload/Core/Broker 的命名资源，并在每场景 shutdown 后断言归零 |
| G5 | STRM-0 泄漏扫描不是 STRM-2.2 完整跨进程链的直接证据 | 对本批四个逻辑通道执行五类 marker × 四种编码扫描与负向注入 |
| G6 | crash 失败时缺少稳定、可复核的 failure artifact | Parent 原子写 allowlist `failure.json`，崩溃进程不得拥有最终证据唯一副本 |
| G7 | Preload 遗留 WebCrypto helper 仍可被未来误用 | 标记 `@deprecated` 并增加 production dependency graph/调用点静态断言；不改变已冻结 STRM-1 回归语义 |
| G8 | Broker `rejected` 使用 `unavailable` typed code | private Contract additive 增加精确 `personal_credential_transport_rejected` 并锁定映射；不扩公共 Contract |

G7/G8 是 STRM-2.2 独立 QA 的两个非阻断 P3。本批将其作为收口验收项，不另立 repair，也不得借此
扩张为公共错误体系或删除仍被已冻结回归直接消费的 private API。

## 3. 本批范围

### 3.1 交付范围

- S1～S8 mutation/reveal 命名窗口的真实进程 Harness；
- Parent/Electron/Core child 的确定性 barrier handshake 与 fail-fast 诊断；
- 真实 `CorePrivateSupervisor` + JSON lifecycle + fd4/fd5 Broker 接缝；
- controlled Core Broker handler，仅用于 transport proof；
- exact terminal/recovery classification、single-winner、late cleanup；
- 四通道、五类 marker、raw/Base64/URL-percent/hex 扫描；
- 全资源归零、semantic evidence digest、三轮确定性 replay；
- STRM-2.2 两个 P3 的最小 private closure；
- STRM-0/1/2.1/2.2 与 DFI-4A.2 Broker/Reveal 回归；
- STRM-2 阶段实施报告、QA evidence allowlist 与治理状态收口。

### 3.2 明确不做

- 不实现 EIPC production identity adapter/composition；
- 不用 fixed user、Fake authority、单行数据库推断或 Renderer 参数绕过 identity blocker；
- 不把 controlled Broker fixture 接入 production dependency graph；
- 不实现真实 Personal Model CRUD/reveal public API、safe HTTP 或 Desktop sidecar；
- 不修改 Renderer 页面，不接收真实 API Key；
- 不实现 helper production packaging/codesign activation；
- 不新增 migration 25，不改写 migration 1～24；
- 不新增第二套 Coordinator、Receipt、Reveal、Broker Registry 或恢复状态机；
- 不实现 EIPC-1～3、STRM-3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3 或 TGM；
- 不宣称 zero-copy、Chromium 内部副本可清零、通用 exactly-once 或用户已看见 reveal Secret。

## 4. 冻结不变量

1. 只允许 Route A；不存在运行时 A/B/C fallback；
2. Secret 只通过 one-shot MessagePort structured-clone `Uint8Array` 与 fd4/fd5 binary Broker；
3. Secret 不进入普通 IPC、Core HTTP、JSON lifecycle、SQLite、日志、Event、Audit、telemetry、argv、env、
   URL、临时文件、剪贴板、异常字符串或 failure artifact；
4. Main 只派生 transport identity并路由 bytes，不成为 owner、Credential 或业务 Receipt 事实源；
5. mutation transport completed 不能替代 durable Operation Journal/Receipt；
6. reveal transport completed 只证明 single consumer acknowledgement，不证明用户已看见且不允许 replay；
7. S4～S7 不以 `commandId`、Broker coalescing 或 transportRequestId 伪装 exactly-once；
8. 每个 session 最多一个 Ticket、一个 port、一个 Secret frame、一次 Broker dispatch、一个 terminal winner；
9. runtime/channel/client/navigation/profile/dispatch ordinal 任一漂移，旧 session 必须失效；
10. barrier payload 只允许 window name、direction、safe identity digest、count、status；禁止 Secret 与业务材料；
11. Harness 未观察到命名 barrier 时必须 fail-fast，禁止延长轮询、自动重试或把相邻窗口当目标窗口；
12. 每个场景必须启动 fresh Electron process；涉及 Core restart 的场景必须产生新 PID、runtime 与 channel；
13. production entry 不得注入 barrier、controlled handler 或 test helper；
14. STRM-2.3 成功仍保持 production 与 blocker 四项状态为 false。

## 5. 真实进程拓扑

```text
Node Parent Orchestrator
  ├─ async spawn Electron process
  │    ├─ Electron Main
  │    │    ├─ PersonalCredentialTransportProductionController
  │    │    └─ real CorePrivateSupervisor
  │    │          └─ real Core child process
  │    │               ├─ fd3 JSON boot/ready/shutdown
  │    │               ├─ fd4 binary Broker request
  │    │               └─ fd5 binary Broker response
  │    └─ hidden BrowserWindow
  │         └─ sandboxed Preload + fixture page
  └─ allowlisted machine evidence / safe trace / failure.json
```

要求：

- Electron 必须由 Parent 使用异步 `spawn`，不得用单进程 unit test 代替；
- Electron 内必须实例化真实 `CorePrivateSupervisor`；允许通过既有 `entryPath`/`spawnChild` 测试依赖
  启动受控 Core child并保留 child handle，但不得复制一个“假 Supervisor”；
- 受控 Core child 必须同时走真实 fd3 JSON lifecycle 与 fd4/fd5 framing；handler 可以受控返回
  completed/rejected/held/crashed，但不得标为 production business handler；
- Parent 与 Electron 使用独立 safe NDJSON control channel做 barrier handshake；最终 machine evidence 由
  Parent汇总，不能只存在于即将被 SIGKILL 的进程内存；
- SIGKILL 必须发生在 Parent 收到 exact barrier 后；普通 `throw`、Promise reject 或直接调用 cleanup
  不能冒充进程死亡。

## 6. Deterministic Barrier 与诊断接缝

### 6.1 Barrier protocol

```text
BarrierReached
  scenarioId
  window = S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8
  direction = mutation | reveal
  phase
  safeIdentityDigest
  resourceCounts

ParentDecision
  scenarioId
  action = continue | close_port | navigate | crash_renderer |
           sigkill_core | sigkill_electron | close_main | restart_core
```

`scenarioId` 与 digest 只绑定 semantic seed，不使用 PID、端口、墙钟、Secret 或路径。stale/mismatch decision
必须 `barrier_identity_mismatch` 失败关闭；每个 barrier 一次性，不允许跨 scenario 复用。

### 6.2 测试接缝约束

- Controller 可新增构造注入的 `SensitiveTransportProcessDiagnostics`，production 默认 `Noop`；
- diagnostics 只发命名 phase/count，不读 body、不接 owner/credentialRef/Endpoint；
- S4 可使用只在 Harness 注入的 port-start gate，让 Preload 已 post、Main port 尚未 start，从机制上证明
  “posted but not received”，不得用 sleep 推断；
- S2 可用注入的 channel factory在 Ticket 创建后、bind 前触发同步 barrier；
- S5 在 envelope 已接受但 `brokerLeaseProvider.current()`/dispatch 尚未发生时触发；
- S6 由 Core child在 fd4 request 完整解析后、fd5 response 前触发；
- S7 在 Main post terminal/reveal frame 后、Preload terminal/ack 尚未 settle 时触发；
- 接缝不得由环境变量在 production entry 开启，也不得进入公共 Contract。

## 7. S1～S8 精确矩阵

| 窗口 | Mutation 触发点 | Reveal 触发点 | 强制动作 | 恢复分类与断言 |
| --- | --- | --- | --- | --- |
| S1 | safe prepare 调用前 | reveal admission 调用前 | 结束场景 | 零 Ticket/port/Broker/Secret；零 durable success |
| S2 | prepared + Ticket 后、port bind 前 | admission + Ticket 后、port bind 前 | SIGKILL Electron | Ticket 过期；mutation只保留既有 prepared fact；reveal未 resolve |
| S3 | port ready、Secret未发送 | port ready、Broker未 dispatch | close port / SIGKILL Electron | mutation不得猜测输入；reveal不得 resolve；零 Broker execute |
| S4 | Preload post + sender清零、Main port未start/未receive | N/A | SIGKILL Electron | `uncertain`；只允许future safe status查 durable fact，不自动重发 Secret |
| S5 | Main已接受frame、Broker dispatch前 | Broker bytes已到Main、port post前 | SIGKILL Electron | 所有本地可控bytes清零；mutation保留prepared；reveal uncertain/no replay |
| S6 | fd4 request已被Core child接受、fd5 result前 | Broker resolve request已接受、result前 | SIGKILL Core child | mutation标记business reconciliation required；reveal uncertain/no replay；旧lease失效 |
| S7 | Broker terminal已post、Preload未settle | reveal frame已post、ack前 | SIGKILL Electron | mutation必须查 durable Receipt；reveal uncertain/no replay；late ack不得改写 |
| S8 | navigation/renderer gone/Core restart/Main close/profile change | 同 | 对应真实事件 | 旧Ticket/port/session失效；late bytes清零；新runtime/channel不得接旧callback |

补充约束：

- S4 对 reveal 不制造虚假“反向对应窗口”；reveal 的等价风险由 S5/S7 覆盖；
- S6 mutation 只证明 transport 已 dispatch和需要 durable reconciliation，不宣称通用 exactly-once；
- S7 mutation 不以 terminal post 证明业务提交；业务成功只能来自既有 durable status/Receipt；
- 每个命名窗口必须同时输出 `barrierReachedCount=1`、目标动作 count=1 和非目标 dispatch/delivery count；
- 若目标 barrier 未到达、进程提前退出或相邻 barrier先到，场景立即失败并保留 allowlisted failure evidence。

## 8. 恢复与单一事实源

| 事实 | 权威来源 | Transport Harness 可声明 | 禁止声明 |
| --- | --- | --- | --- |
| mutation prepared | DFI Operation Journal | `durable_prepared_preserved` | Secret仍可恢复 |
| mutation terminal business outcome | durable Operation/Receipt/status query | `business_reconciliation_required` 或精确 durable replay | transport terminal即业务成功 |
| reveal delivery | runtime-only single consumer ack | `transport_delivery_acknowledged` | 用户已阅读/可重放 |
| reveal crash/timeout | runtime tombstone + no replay | `reveal_uncertain_no_replay` | 自动重新resolve Keychain |
| Broker request | fd4/fd5 logical identity | attempt/dispatch count | Provider/Keychain exactly-once |
| late callback | exact runtime/channel/navigation/ordinal gate | cleanup count | 新session继承旧结果 |

Main/Electron crash 后不恢复 MessagePort session。mutation 由未来 safe layer查询既有 durable fact；reveal 永远
不自动 replay。本批没有 safe public API，因此 Harness 只验证 transport recovery contract和既有 DFI 回归，
不为缺失的产品层查询伪造接口。

## 9. 两个 P3 收口

### 9.1 遗留 WebCrypto helper

- `sendMutation`、`consumeReveal`、`createEnvelope`、`assertEnvelope`、`sha256Digest` 保持 private；
- 若 STRM-1 回归仍直接消费，则加 `@deprecated` 与迁移说明，不强行删除；
- production receiver/controller只能调用 authorized variants；
- 增加静态依赖图断言：production entry、receiver、controller 对 legacy helper 零调用；
- 不把 Preload描述为 cryptographically verified。

### 9.2 精确 rejected typed code

- private error enum additive 增加 `personal_credential_transport_rejected`；
- Broker status `rejected` 映射为 terminal=`rejected` + exact private code；
- `unavailable` 只保留给 foundation/handler/service未就绪；
- 不透传 Broker内部错误、Keychain错误、owner事实或stack；
- 不修改 public Desktop Contract、业务 Receipt schema 或 migration。

## 10. Evidence、稳定性与失败留证

### 10.1 Semantic seed

固定：scenario/window/direction、command/correlation的脚本身份、decision sequence、transport profile、
controlled Broker outcome。排除：PID、端口、墙钟、临时路径、request transport nonce与进程调度。

完整 S1～S8 矩阵必须以同一 semantic seed 从零串行执行 **3 轮**；每轮 semantic evidence digest一致。
禁止通过自动重试把失败轮覆盖成成功。

### 10.2 Failure artifact

Parent 在临时证据目录原子写 `failure.json`，至少包含：scenario、window、direction、lastBarrier、
expectedAction、observedSafeStatus、typedErrorCode、resource counts、duration、semantic digest。禁止包含 PID、
端口、绝对路径、Secret、Credential Reference、owner、Endpoint或正文。失败 artifact 必须经同一泄漏扫描。

### 10.3 最终 Evidence allowlist

```text
status
outcome
namedCrashWindows
scenarioRunCount
semanticReplayCount
semanticEvidenceDigest
mutationDispatchCount
revealDispatchCount
lateCleanupCount
durableReconciliationRequiredCount
revealNoReplayCount
fourChannelLeakageMatchCounts
negativeLeakInjectionDetectionCount
resourceCounts
typedErrorCodes
productionFeatureEnabled
productionSensitiveTransportReady
productionBusinessHandlerReady
transportBlockerClosed
rendererBusinessApiExposed
zeroCopyClaimed
durationMs
```

## 11. 泄漏扫描与资源归零

### 11.1 四个逻辑通道

1. `parentStdout`；
2. `childStderr`，内部仍分别计 Electron/Main 与 Core child，不因合并掩盖来源；
3. `machineEvidence`；
4. `safeTrace`。

### 11.2 Marker 与编码

五类 marker：canary、credential shape、Endpoint、body、absolute path。每类扫描 raw、Base64、URL percent、
hex。至少执行 `4 channels × 5 markers × 4 encodings = 80` 次负向注入，证明 scanner 能失败且错误消息
不回显 marker。

### 11.3 命名资源

每个场景完成与整个 Harness退出前均必须为 0：

```text
windowCount
messagePortCount
ipcListenerCount
navigationListenerCount
timerCount
transportSessionCount
transportRegistryCount
frameAuthorizationCount
brokerInflightCount
brokerCompletedCount
brokerRevealTombstoneCount
childProcessCount
helperProcessCount
openSensitiveStreamCount
```

资源数必须来自真实诊断 Adapter/进程句柄，不得硬编码 0。进程提前退出也必须由 Parent 收集并验证。

## 12. 实施步骤

### Step 1：P3 与 Evidence Foundation（1～1.5 日）

- private rejected code；
- legacy WebCrypto `@deprecated`/production不可达断言；
- Evidence schema、semantic digest、scanner、resource diagnostics；
- Parent async process runner 与 failure artifact。

### Step 2：真实 Core child 与 barrier handshake（1.5～2.5 日）

- 真实 Supervisor + JSON lifecycle + fd4/fd5；
- controlled Core child Broker handler；
- exact one-shot barrier protocol；
- early-exit、stale barrier、mismatch、deadline fail-fast。

### Step 3：S1～S8 Process Matrix（2～3 日）

- mutation/reveal命名窗口；
- SIGKILL、navigation、renderer crash、Core restart、Main close、profile drift；
- durable reconciliation/no-replay/late cleanup；
- 三轮 semantic replay与资源归零。

### Step 4：回归与阶段收口（0.5～1 日）

- STRM-0/1/2.1/2.2 与 DFI-4A.2回归；
- Workspace、Central online/offline严格串行；
- 实施报告与STRM-2阶段状态；
- 独立QA前不标记`PASS/CLOSED`。

集中工程日估算：**5～8 日**，不含独立 QA、返工、EIPC/STRM-3/DFI business composition。

## 13. 允许与禁止修改范围

### 13.1 获得编码授权后允许

- `packages/contracts/src/desktop-private/personal-credential-transport-v1/**`；
- `apps/desktop/src/main/personal-credential-transport*.ts`；
- `apps/desktop/src/preload/personal-credential-transport*.ts`；
- `apps/desktop/src/main/core-private-supervisor.ts` 的构造注入诊断/测试接缝；
- STRM-2.3 tests/Harness/fixtures/evidence；
- `package.json` 仅新增专项 Harness脚本；
- 编码批收口时的版本、README、CHANGELOG、DEVELOPMENT-LOG、正式报告。

### 13.2 禁止

- `apps/desktop/src/renderer/**`；
- public `ipcMain.handle`、public `contextBridge` personal API；
- `packages/contracts/src/desktop-local/**` 与任何公共 Contract；
- Core production business Coordinator、owner authority、Keychain handler、Provider、Task lock、Agent Loop；
- Central、Document Worker、migration 1～24或新增 migration 25；
- helper packaging/codesign activation；
- 第三方依赖与 `pnpm-lock.yaml`；
- 环境变量开启 production feature、runtime fallback、Fake owner/handler；
- STRM-3、EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM。

若实现发现必须修改上述禁止范围，STRM-2.3 必须停止并回到文档评审。

## 14. QA 矩阵（100 项）

### 14.1 Baseline 与 P3（1～12）

1. STRM-2.1/2.2状态为PASS/CLOSED；2. private Contract严格；3. rejected exact code；
4. unavailable与rejected分离；5. legacy WebCrypto标记deprecated；6. production legacy helper零调用；
7. authorized mutation仍不依赖WebCrypto；8. authorized reveal仍不依赖WebCrypto；9.无public export漂移；
10.无migration 25；11.无Renderer改动；12. lockfile不变。

### 14.2 Process topology 与 handshake（13～28）

13. Parent异步spawn；14.真实Electron Main；15.sandboxed Preload；16.contextIsolation=true；
17.nodeIntegration=false；18.真实CorePrivateSupervisor；19.fd3 JSON lifecycle；20.fd4 request；21.fd5 response；
22.controlled Core child不进production graph；23.barrier一次性；24.stale barrier拒绝；25.mismatch拒绝；
26.child early exit精确诊断；27.禁止sleep/轮询猜窗口；28.SIGKILL由exact barrier触发。

### 14.3 S1～S8（29～56）

29.S1 mutation；30.S1 reveal；31.S2 mutation；32.S2 reveal；33.S3 mutation；34.S3 reveal；
35.S4 mutation posted；36.S4 sender清零；37.S4 dispatch=0；38.S4不自动重发；39.S5 mutation；
40.S5 reveal；41.S5 Main可控bytes清零；42.S6 mutation；43.S6 reveal；44.S6真实Core SIGKILL；
45.S6旧lease失效；46.S7 mutation；47.S7 reveal；48.S7 late ack不改写；49.S8 hash navigation；
50.S8 reload；51.S8 renderer crash；52.S8 Core restart；53.S8 Main close；54.S8 profile change；
55.deadline/cancel single winner；56.no automatic replay/fallback。

### 14.4 Recovery 与事实边界（57～70）

57.mutation prepared保留；58.mutation business reconciliation required；59.transport terminal不替代Receipt；
60.reveal no replay；61.reveal不生成durable success；62.reveal ack不等于user viewed；63.executeCount=1；
64.Broker coalescing不作证明；65.late callback只cleanup；66.new runtime不接old callback；
67.old navigation不接late frame；68.I/O unknown保持uncertain；69.不声明exactly-once；70.typed error不含内部原因。

### 14.5 Security 与资源（71～88）

71.Uint8Array only；72.0/max/max+1；73.SharedArrayBuffer拒绝；74.detached拒绝；75.no Base64 Secret；
76.no hex Secret；77.no ordinary IPC/HTTP/SQLite/log Secret；78.parent stdout扫描；79.child stderr扫描；
80.machine evidence扫描；81.safe trace扫描；82.raw负向注入；83.Base64负向注入；84.URL负向注入；
85.hex负向注入；86.failure.json扫描；87.14类资源真实归零；88.crash路径资源归零。

### 14.6 Determinism、回归与门禁（89～100）

89.完整矩阵三轮；90.semantic digest一致；91.seed排除PID/墙钟/端口/路径；92.失败不自动重试；
93.STRM-0回归；94.STRM-1回归；95.STRM-2.1回归；96.STRM-2.2回归；97.DFI-4A.2 Broker/Reveal回归；
98.Workspace完整check；99.Central online/offline严格串行；100.最终只输出允许的outcome与四项false。

## 15. 验证命令与执行纪律

编码后至少严格串行执行：

```bash
CI=true pnpm run harness:strm2.3
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

- 使用 `.node-version` 的 Node 24.13.0 与 JDK 21；
- Harness 与 Central不得并行，避免 Testcontainers/进程资源互相干扰；
- 任何完整矩阵失败都从零诊断，禁止自动重试覆盖；
- 独立 QA 必须重新执行正式 Harness，不接受开发者 evidence 代替。

## 16. 退出条件

STRM-2.3 只有同时满足以下条件才可进入用户接受：

1. 100项QA与S1～S8三轮真实进程矩阵全绿；
2. 真实Supervisor、JSON lifecycle与fd4/fd5均有直接证据；
3. 四通道多编码扫描命中为0且80次负向注入生效；
4. 每场景与最终14类资源归零；
5. 两个STRM-2.2 P3完成最小private收口；
6. production feature/business handler/ready/blocker状态保持false；
7. 未进入Renderer/public API/EIPC/DFI business composition/STRM-3；
8. Workspace与Central online/offline串行全绿；
9. 独立QA PASS并由用户接受后，才能关闭STRM-2.3与STRM-2阶段。

## 17. 文档评审问题

1. 是否接受STRM-2.3只证明transport wiring，不证明production business composition？
2. 真实Supervisor +受控Core child是否正确兼顾生产接缝与fixture边界？
3. test-only diagnostics/barrier是否足够窄，且production默认Noop/不可达？
4. S4使用deferred port-start gate是否比sleep/调度推断更确定？
5. S6是否诚实保留mutation durable reconciliation和reveal no-replay，而不宣称exactly-once？
6. failure.json allowlist与四通道扫描是否足够支持崩溃定位且不泄漏？
7. 两个P3是否应在本批最小收口而不另立repair？
8. 三轮semantic replay、100项QA与5～8日估算是否可执行？
9. 是否同意STRM-2关闭仍不关闭transport blocker、不输出SENSITIVE_TRANSPORT_READY？
10. 是否存在需要新增公共Contract、migration或产品决策的P0/P1？

## 18. 当前门禁

```text
STRM-0             PASS/CLOSED
STRM-1             PASS/CLOSED
STRM-2 Plan        PASS/CLOSED
STRM-2.1           PASS/CLOSED
STRM-2.2           PASS/CLOSED
STRM-2.3           PASS/CLOSED
STRM-3             GATED
EIPC-1～EIPC-3     GATED
DFI-4A.4.1～4A.4.3 GATED
DFI-2B / DFI-3     GATED
TGM                GATED
```

repair.1 独立 QA 已 PASS 并由用户正式接受，repair.1、STRM-2.3 与 STRM-2 已依次正式 `PASS/CLOSED`。
transport blocker 仍打开，不输出 `SENSITIVE_TRANSPORT_READY`；STRM-3 及其他下游继续 `GATED`，不得由
本批自动解锁。
