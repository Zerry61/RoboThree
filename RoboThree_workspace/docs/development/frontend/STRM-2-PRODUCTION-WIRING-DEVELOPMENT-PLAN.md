# STRM-2 Production Transport Wiring 详细实施方案

> 状态：**STRM-2 PASS/CLOSED — STRM-2.1～2.3 INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-23  
> 负责人：Codex 5.6  
> 上游：STRM-0、STRM-1 `PASS/CLOSED`  
> 适用路线：`personal-credential.route-a.structured-clone.v1`  
> 配套方案：[Sensitive Renderer↔Main Transport Revision 1](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-REVISION-1.md)  
> 配套威胁模型：[Sensitive Renderer↔Main Transport Threat Model](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-THREAT-MODEL.md)

## 1. 结论先行

STRM-2 的目标是把 STRM-1 已冻结的私有 Transport Profile、Ticket、Binary Envelope、Registry 和
Main/Preload Adapter 接入真实 Electron/Main/Core process lifecycle，并接到现有 Main↔Core fd4/fd5
`PersonalCredentialBrokerClient`，完成可验证的双向 transport wiring。

本批不是个人模型 CRUD/reveal 产品功能批，也不负责解除两个既有 blocker：

```text
BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION
BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER
```

其中第二个 blocker 的名称保留为治理标识；STRM-0 已证明路线 A 可接受，STRM-1 已冻结 Foundation，但只有
未来 STRM-3 的真实 Unblock Audit、独立 QA 和用户接受，才可以输出 `SENSITIVE_TRANSPORT_READY` 并关闭它。

当前 Core production composition 还不能提供可信 owner authority、真实 Personal Model Coordinator/Reveal
handler 和 verified helper activation。因此 STRM-2 必须采用以下收口方式：

1. production Main/Preload 真实装配 transport wiring；
2. production activation 默认且实际保持 disabled；
3. 不注册个人模型 CRUD/reveal 公共 IPC，不向 Renderer 暴露业务 API；
4. 通过显式 test-only composition 证明 Electron↔Main↔fd4/fd5 双向链路；
5. production Core Broker handler 未 ready 时继续 typed fail-closed，不能用 Fake authority 或测试 helper
   把 feature 标记 ready；
6. EIPC-3 与未来 DFI-4A.4.1/4A.4.2 分别完成 identity/business composition 后，才能消费本批 wiring；
7. STRM-2 结束仍不关闭 transport blocker，不自动进入 STRM-3 或 DFI 编码。

## 2. 当前代码事实

### 2.1 已存在并直接复用

| 代码事实 | 当前实现 | STRM-2 用法 |
| --- | --- | --- |
| Route A private Contract | `desktop-private/personal-credential-transport-v1` | 不另建协议体系，只 additive 补 control terminal schema |
| Main transport adapter | `PersonalCredentialTransportMainAdapter` | 复用 Ticket/HMAC/Registry/identity/frame guard |
| Preload transport adapter | `PersonalCredentialTransportPreloadAdapter` | 复用 mutation encode、reveal consume 与本地 byte cleanup |
| Main↔Core binary Broker | `PersonalCredentialBrokerClient` + fd4/fd5 | mutation dispatch 与 reveal resolve 的唯一 Core 敏感通道 |
| Core Broker server | `PersonalCredentialBrokerServer` | 继续使用现有 binary framing，不改 JSON lifecycle IPC |
| Core handler adapter | `createPersonalModelCredentialBrokerHandler()` | 未来 production Coordinator composition 的唯一 handler，不复制业务判断 |
| Reveal delivery | `PersonalCredentialRevealDelivery` | 复用 deadline、single consumer、result cleanup |
| Core supervisor | `CorePrivateSupervisor.personalCredentialBroker` | 只在 Core ready 且 channel 存在时提供 Broker；restart 时旧 client 已关闭 |
| Electron Route A 证据 | STRM-0 14 runs / 12 scenarios | 作为回归基线，不重新宣称 zero-copy |

### 2.2 当前缺口

> 历史说明：本表是 STRM-2 总计划评审时的代码快照。后续 STRM-2.1 已关闭 G1～G5 中的 production
> Main/Preload disabled wiring、navigation epoch、lifecycle state 与 strict non-secret control 基础；当前
> 可编码缺口以 [STRM-2.2 详细方案 §2](./STRM-2.2-BROKER-DISPATCH-DIRECTIONAL-CLOSURE-DEVELOPMENT-PLAN.md#2-当前代码事实)
> 的实时复核为准。G6～G8 仍是明确跨批依赖。

| 编号 | 代码事实 | 影响 |
| --- | --- | --- |
| G1 | production `main/index.ts` 未导入 transport adapter | 无真实 Main lifecycle/controller |
| G2 | production `preload/index.ts` 未导入 transport adapter | 无真实 one-shot port receiver |
| G3 | 无 Main-derived navigation epoch tracker | hash navigation、reload、renderer crash 后旧 Ticket 无统一失效源 |
| G4 | STRM-1 状态只到 `created/port_bound/frame_received` | 未表达 ready、Broker dispatch、terminal delivery 与 close |
| G5 | private Contract 没有 strict safe terminal control message | peer 无法区分 rejected/cancelled/timed_out/uncertain，且不能错误地把 transport completed 当业务 Receipt |
| G6 | production `desktop-private-main.ts` Broker handler固定返回 `credential_store_unavailable` | fd4/fd5 可用，但真实 CRUD/reveal success 仍不可达 |
| G7 | `create-desktop-private-runtime.ts` 仍固定 `activeUserId`，未组合个人模型 Persistence/Coordinator/Reveal | 不能在 STRM-2 内静默启用业务成功路径 |
| G8 | v1alpha2 feature enum/API 没有 personal mutation/reveal | 本批不能对 Renderer 宣布 feature |
| G9 | 无 transport↔Broker stable command mapping 与 late callback gate | crash/timeout 后可能误把旧 Broker callback 投影给新 session |
| G10 | 无真实 production entry 资源诊断 | 无法证明 port/listener/timer/session 在 navigation/restart 后归零 |

上述 G6～G8 是明确的跨批依赖，不是 STRM-2 可以用测试实现绕过的缺陷。

## 3. 父计划范围校正与依赖关系

Revision 1 曾把 STRM-2 概括为“接 safe prepare、fd4/fd5 Broker、Coordinator、Reveal Delivery”。代码核查后
必须把“接入”拆成 transport wiring 与 business composition 两层：

```text
STRM-2 owns
  Electron port lifecycle
  Main-derived frame/navigation identity
  Ticket/session/control terminal
  transport -> existing Broker client dispatch
  Broker callback -> exact transport session delivery
  crash/timeout/late callback cleanup

EIPC / DFI owns
  Runtime Active enterprise owner authority
  safe personal-model prepare/status API
  production Coordinator/Reveal handler composition
  verified helper readiness
  public Desktop sidecar and Renderer business call
  personal-model feature negotiation
```

因此 STRM-2 可以在 identity blocker 尚未关闭时实现和验证，但 production activation 必须保持 false。禁止：

- 为了跑通成功路径，在 production root 注入 Fake authority、固定 owner 或 test helper；
- 让 Main 自行构造 Personal Model prepared operation；
- 让 Renderer 直接传 `webContentsId/mainFrameRoutingId/navigationEpoch`；
- 把 Core 固定拒绝改成无 authority 的成功 handler；
- 把 Harness 的受控 prepared fact 解释为 production safe prepare 已完成。

## 4. 不变量

1. 继续只使用 Route A，一个 production build 不包含运行时 A/B/C fallback；
2. structured clone 内部副本不可枚举、不可可靠清零的残余风险保持用户已接受口径，不宣称 zero-copy；
3. Secret 只通过 one-shot MessagePort structured-clone `Uint8Array` 和 fd4/fd5 binary Broker；
4. Secret 不进入普通 `ipcRenderer.invoke/send` 参数、Core HTTP、JSON lifecycle IPC、SQLite、日志、
   Event、Audit、telemetry、argv、env、URL、临时文件或剪贴板；
5. Main 从真实 Electron event 派生 exact webContents/main frame/navigation identity；
6. Main 是 identity guardian 和 byte router，不成为 owner、Credential 或业务 Receipt 事实源；
7. 未提供 Core-prepared non-secret command 时，不签发 Ticket、不创建 port、不 dispatch Broker；
8. mutation 的最终业务事实只来自 Core Operation Journal/Receipt；transport completed 不能替代 Receipt；
9. reveal 不生成 durable success Receipt，不自动 replay，不合并 pending consumer；
10. 每个 command 一个 port session、一个 Secret frame、一个 terminal；late frame/callback 全部拒绝并清零；
11. runtime/client/profile/navigation 任一变化都失效旧 Ticket 和 port；
12. production activation、feature projection、Renderer API 在本批持续关闭；
13. STRM-3 之前不能输出 `SENSITIVE_TRANSPORT_READY` 或关闭 transport blocker；
14. 不新增第二套 Personal Model Coordinator、Reveal Service、Broker Registry 或业务状态机。

## 5. 目标架构

```text
future safe personal command router (DFI-4A.4.2, not STRM-2)
  -> Core safe prepare/status
  -> immutable PreparedSensitiveCommand (non-secret)
  -> PersonalCredentialTransportProductionController
       -> Main-derived exact IpcMain event identity
       -> STRM-1 HMAC Ticket + Registry
       -> MessageChannelMain one-shot port
       -> production Preload internal receiver
       -> Route A Uint8Array envelope
       -> PersonalCredentialBrokerClient (fd4 request / fd5 response)
       -> Core Broker server
       -> production handler (currently unavailable until EIPC/DFI composition)
  <- strict transport terminal / reveal envelope
```

STRM-2 不实现图中第一行的 public/safe router，也不实现最后一层 production handler 的业务依赖。它提供
中间的可组合、真实 process wiring，并用 test-only controlled Core Broker 验证成功与失败路径。

## 6. Private Control Contract

### 6.1 保持既有 Ticket 与 Secret Envelope

既有 Ticket 字段不删除、不重命名、不扩大为 owner/business material。`expectedExecutionDefinitionDigest`
等未来 Broker 所需但不应发送给 Preload 的事实，保存在 Main-private immutable session record，来源只能是
Core safe prepared result；它通过同一 `commandId/requestDigest` 与 Ticket 关联，不进入 Secret frame。

### 6.2 新增 strict control message

建议在同一 private subpath additive 冻结：

```text
PersonalCredentialTransportControlMessage
  protocolVersion
  transportProfileRevision
  commandId
  correlationId
  controlType = ready | terminal_ack | cancel
  terminal? = completed | rejected | cancelled | timed_out | uncertain
  typedErrorCode?
  controlDigest
```

规则：

- `ready` 和 `cancel` 不携带 terminal；
- `terminal_ack` 必须携带 terminal；只有 rejected/cancelled/timed_out/uncertain 允许对应 typed error；
- control body 永远为空，不允许任意附加字段；
- control digest 只绑定 non-secret transport identity，不是 business Receipt digest；
- mutation `completed` 只表示 Broker response 已安全收敛，调用方仍必须查询 durable status；
- reveal `completed` 只表示 Preload 的单一 consumer 已 resolve，不证明用户已看见或记住 Secret；
- control message 不含 owner、Credential Reference、Endpoint、helper、Secret-derived hash 或内部栈。

### 6.3 Prepared session material

Main-private `PreparedSensitiveTransportCommand` 至少包含：

```text
runtimeInstanceId
clientInstanceId
commandId
correlationId
operationType = create | update | reveal
personalModelId
expectedConfigurationRevision
expectedExecutionDefinitionDigest?  // reveal only / Main-private
requestDigest
deadlineAt
```

它不属于 Renderer Contract。STRM-2 Harness 可以由受控 fixture 创建；production 只能由未来 DFI safe router
从 Core 结果物化，不能从 Renderer input 直接 parse 成“prepared”。

Delete 不携带 Renderer Secret，不创建 MessagePort transport session；其 safe prepare/zero-body Broker execute
继续属于 DFI-4A.4.2，不纳入 STRM-2 Route A mutation frame。

## 7. Main Production Wiring

### 7.1 Production Controller

新增 `PersonalCredentialTransportProductionController`，职责仅包括：

- 接收内部 `PreparedSensitiveTransportCommand` 与真实 `IpcMainEvent/IpcMainInvokeEvent`；
- 校验 sender 存活、`senderFrame !== null`、`senderFrame === sender.mainFrame`；
- 从 event 派生已冻结的 `webContentsId/mainFrameRoutingId`，从 tracker 获取 monotonic navigation epoch；
  `senderFrame === sender.mainFrame` 作为 exact main-frame 进程边界校验，不把未进入既有 Ticket material
  的临时进程标识另造为 authority；
- 调 STRM-1 adapter 创建 Ticket、绑定 one-shot port；
- 用 `MessageChannelMain` 将单一 port 只发送给 exact main frame；
- 接收 mutation frame并交给现有 `PersonalCredentialBrokerClient`；
- 接收 Broker reveal bytes，经 `PersonalCredentialRevealDelivery` 送入 exact port consumer；
- 映射 Broker terminal、清零 application-owned bytes、关闭 port/session；
- 对 navigation、renderer gone、Core restart、Main shutdown 执行统一 invalidate。

Controller 不读取或推导 owner、entitlement、credentialRef、完整 Endpoint、helper descriptor，不调用 Keychain，
不生成业务 Receipt。

### 7.2 Navigation Epoch Tracker

每个 `webContentsId` 维护 runtime-only monotonic epoch：

- 主窗口创建后初始化为 1；
- main-frame `will-navigate` 先 invalidate 当前 sessions；
- `did-navigate` 与 `did-navigate-in-page`（包括 hash route）推进 epoch；
- subframe navigation 不创建 authority；
- `render-process-gone`、`destroyed`、window close 清理该 webContents 的全部 sessions；
- epoch 不持久化，Main restart 后旧 Ticket 因 HMAC/runtime identity 一并失效；
- 不接受 Renderer 提供、回显或覆盖 epoch。

事件存在重复触发时，允许 epoch 多推进，但禁止回退。Ticket 只要求 exact current epoch，不要求墙钟稳定。

### 7.3 Port Session

- 每个 command 新建一个 `MessageChannelMain`；
- 只 transfer `port2`，Secret bytes 不进入 transfer list；
- `port1` 在 listener 安装后 `start()`；
- 收到且只收到一个 `ready` 后才允许方向对应的数据；
- wrong port、nested port、额外 transfer、multi-frame、late frame 全拒绝；
- close/error/deadline 均进入单一 terminal gate；
- 结束时移除 listener、清 timer、关闭两端可控 port、释放 adapter model gate；
- 不把 port 保存到全局调试对象、window property、Event 或 Evidence。

## 8. Preload Production Wiring

### 8.1 Internal Receiver

production `preload/index.ts` 可以实例化 internal receiver，但不得在本批通过 `contextBridge` 暴露个人模型
业务方法。Receiver：

- 只监听一个固定 private port-offer channel；
- 要求 exactly one DOM `MessagePort`，拒绝普通对象伪装；
- 校验 Ticket/profile/command/correlation；
- 回发 strict `ready`；
- 维护最多 256 个一次性 command tombstone；
- 接收 reveal 时只调用未来显式注册的单 consumer；未注册 consumer 时失败关闭；
- mutation bytes 只能由未来 DFI sidecar 调用 internal method 交入；本批不提供 main-world API；
- navigation、unload、port close、deadline 时清理 byte view、listener、timer 和 session。

### 8.2 不提前暴露

本批禁止新增：

- `window.robothreePersonalModel`、`window.robothreeCredential` 或其他 main-world API；
- 个人模型 API Key 输入、展示、复制、保存、删除或 reveal UI；
- 普通 `ipcRenderer.invoke/send` 携带 Secret；
- Renderer import desktop-private Contract；
- LocalStorage/SessionStorage/IndexedDB 缓存 Secret 或 transport session。

## 9. Broker Dispatch 与 Core 边界

### 9.1 Mutation

Main 接收并验证 `mutation_secret` 后：

1. 取得 session record 中的 Core-prepared command；
2. 用 exact commandId/model/revision/requestDigest/deadline 构造既有 Broker command；
3. `secret` 只引用/复制到现有 Broker client 所需的最短生命周期；
4. `PersonalCredentialBrokerClient.execute()` settle 后立刻清零 Main local envelope body；
5. completed/rejected/cancelled/timed_out/uncertain 映射为 strict transport terminal；
6. 即使 Broker completed，也不生成“保存成功”业务 Receipt；future safe status 必须查询 Core durable fact；
7. Broker unavailable/stub handler 返回 typed unavailable，不 fallback。

### 9.2 Reveal

Main 在 port ready 后才允许调用 reveal Broker：

1. 通过 session record 构造 exact reveal command；
2. `PersonalCredentialRevealDelivery` 从 Broker 得到 bytes；
3. STRM-1 Main adapter 创建 `reveal_secret` envelope；
4. port structured-clone 到 Preload；Main 可控 body 在 post 后清零；
5. Preload single consumer 完成后回 `terminal_ack`；
6. Main 收到 exact ack 后收敛 transport terminal；
7. port close/navigation/deadline/ack lost 一律 uncertain，不自动重新 resolve Keychain。

### 9.3 Production Core handler

STRM-2 不在 production runtime 中创建 Fake Personal Model owner/coordinator。`desktop-private-main.ts` 只允许：

- 若未来 runtime composition 提供真实 `createPersonalModelCredentialBrokerHandler()`，使用该 handler；
- 当前缺失时继续固定 typed unavailable；
- readiness 不得因 fd4/fd5 存在就宣称 business handler ready；
- STRM-2 Harness 使用显式 test-only controlled handler，证据标记
  `productionBusinessHandlerReady=false`。

## 10. 状态机与单一终态

Main transport session 冻结为：

```text
created
  -> port_bound
  -> ready
  -> frame_received          // mutation
  -> broker_dispatched       // mutation/reveal
  -> broker_settled
  -> terminal_sent
  -> terminal_acknowledged
  -> closed

任意非终态
  -> rejected | cancelled | timed_out | uncertain
  -> closed
```

规则：

- reveal 可从 `ready -> broker_dispatched`，不要求先有 Renderer frame；
- mutation 必须 `ready -> frame_received -> broker_dispatched`；
- 同 session 只有一个 terminal winner；
- Broker callback、port event、timer、abort、navigation 用同一 CAS/terminal gate 收敛；
- terminal 后所有 callback 只做 cleanup + safe count，不改变 outcome；
- transport state 是 runtime-only，不是业务持久事实；
- Main crash 后不恢复 port session；mutation查 durable Journal/Receipt，reveal保持 no replay。

## 11. S1～S8 命名窗口

| 窗口 | Mutation | Reveal | 恢复与断言 |
| --- | --- | --- | --- |
| S1 | safe prepare 前失败 | reveal admission 前失败 | 零 Ticket、零 port、零 Broker、零 Secret delivery |
| S2 | prepared/Ticket 后，port bind 前 | admission/Ticket 后，port bind 前 | 5 秒 expiry；mutation保留 durable prepared，reveal不 resolve |
| S3 | port ready，Secret 未发送 | port ready，Broker 未 dispatch | close/cancel；mutation不得猜测输入，reveal不得 resolve |
| S4 | Preload post 后，Main receive 前 | 不适用的数据反向窗口 | transport uncertain；mutation只查 durable status，不自动重发 Secret |
| S5 | Main receive 后，Broker dispatch 前 | Broker bytes 已到 Main、port post 前 | 本地 bytes 清零；mutation保留 prepared，reveal uncertain/no replay |
| S6 | Broker dispatch 后，result 前 | Broker resolve 后，result/port delivery 前 | 复用 Coordinator/Reveal 与 Keychain inspect；不从 transport 猜测 |
| S7 | terminal/reveal post 后，peer ack 前 | 同 | mutation查 Receipt；reveal uncertain/no replay；late ack 不改写 |
| S8 | navigation/renderer gone/Core restart/Main close/profile change | 同 | 旧 Ticket/port/session 全失效；late bytes 清零，资源归零 |

S4～S7 不能用“commandId 幂等”伪装 exactly-once。Mutation 的外部 Keychain side effect 仍由已有
Operation Journal/inspect 恢复；Reveal 不具备重放语义。

## 12. Activation 与 Feature 语义

### 12.1 STRM-2 activation snapshot

新增 Main-private、非 Renderer 可见的 readiness snapshot：

```text
transportProfileMatched
mainWiringInstalled
preloadWiringInstalled
brokerChannelReady
productionBusinessHandlerReady
identityCompositionReady
verifiedHelperReady
transportUnblockAuditAccepted
```

只有全部为 true 才允许 future DFI sidecar 宣布 sensitive feature。STRM-2 结束时至少后三项仍为 false，因此：

```text
productionFeatureEnabled = false
productionSensitiveTransportReady = false
transportBlockerClosed = false
```

不得用环境变量、测试 flag、demo mode 或 Renderer 参数将 production snapshot 改为 true。

### 12.2 Compatibility

STRM-2 不向 `DesktopFeatureV1Alpha2` 增加 personal mutation/reveal feature，不改公共 Preload API。只有未来
DFI-4A.4.2 在 EIPC-3、STRM-3 与 helper/business composition 条件均满足后，才能 additive 协商对应 feature。

## 13. Typed Outcome 映射

| 来源 | Transport terminal | 业务解释 |
| --- | --- | --- |
| invalid ticket/profile/identity/frame | rejected | 安全失败，不重试弱通道 |
| busy/duplicate | rejected | 当前操作冲突，不合并 waiter |
| ticket expired / pre-dispatch deadline | timed_out | 未 dispatch 时可由 future safe UI重新 prepare |
| navigation/process/port lost | uncertain | mutation查 durable status；reveal不重放 |
| Broker rejected | rejected | 只返回 safe typed code，不透传内部栈 |
| Broker cancelled | cancelled | 单一 terminal |
| Broker timed_out/uncertain | uncertain | 不伪装失败或成功 |
| Broker mutation completed | completed | 仍需 Core durable status/Receipt 确认业务结果 |
| Preload reveal consumer ack | completed | 仅 transport delivery，不证明用户已看见 Secret |

错误/evidence 禁止包含 Secret、Credential Reference、owner tuple/digest、完整 Endpoint、helper path、PID、port、
绝对路径或 provider body。

## 14. 内存、泄漏与资源

### 14.1 Byte cleanup

必须在 success/throw/cancel/timeout/navigation/process loss 的 `finally` 中清理：

1. Renderer future caller-owned bytes（由未来 DFI/DFE 负责，STRM-2 只冻结接缝）；
2. Preload sender/receiver application copy；
3. MessagePort event body 的可控 typed array；
4. Main accepted envelope body；
5. Broker client request/response copy；
6. reveal delivery working copy；
7. controlled Core Broker handler body。

不声称 Chromium serializer、JS String、OS crash dump 或 swap 可被本批清零。

### 14.2 Resource diagnostics

Harness Evidence 至少报告并最终归零：

```text
windowCount
messagePortCount
ipcListenerCount
navigationListenerCount
timerCount
transportSessionCount
transportRegistryCount
brokerInflightCount
brokerCompletedCount
brokerRevealTombstoneCount
childProcessCount
helperProcessCount
openSensitiveStreamCount
```

Evidence 只允许 count/digest/status/duration/typed error，不写 PID、端口、路径或正文。

### 14.3 泄漏扫描

四通道分别扫描 parent stdout、child stderr、machine evidence、safe trace；五类 marker 为 canary、credential、
Endpoint、body、path；至少覆盖 raw/Base64/URL percent/hex。负向注入必须证明每通道 scanner 真能失败，且
失败信息不能回显 marker。

## 15. 实施拆分

### STRM-2.1：Control Contract 与 Electron Lifecycle Wiring（3～5 日）

> 实施状态：**PASS/CLOSED**。本状态只覆盖
> Control/Lifecycle Foundation，不关闭 STRM-2、transport blocker 或 production feature。

- additive private control terminal schema；
- Main production controller、navigation epoch、one-shot MessageChannelMain；
- Preload internal receiver 与 session/tombstone；
- production entry 装配但 activation false、无 contextBridge business API；
- 单元/组件/真实 Electron identity/navigation/crash conformance。

### STRM-2.2：Broker Dispatch 与 Directional Closure（5～8 日）

> 实施状态：**PASS/CLOSED**。详细方案：
> [STRM-2.2 Broker Dispatch 与 Directional Closure](./STRM-2.2-BROKER-DISPATCH-DIRECTIONAL-CLOSURE-DEVELOPMENT-PLAN.md)。

- mutation Main→existing Broker client；
- reveal existing Broker/RevealDelivery→Main→Preload→ack；
- exact command mapping、deadline/abort/late callback gate；
- production Core handler 缺失保持 unavailable；
- test-only controlled Core Broker 验证成功路径，不把 fixture 标成 production ready。

### STRM-2.3：S1～S8 Process Harness 与收口（5～8 日）

> 当前状态：**IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING**。详细方案：
> [STRM-2.3 S1～S8 Process Harness 与阶段收口](./STRM-2.3-S1-S8-PROCESS-HARNESS-CLOSURE-DEVELOPMENT-PLAN.md)。

- 真实 Electron Main/Preload + Core child fd4/fd5；
- S1～S8、navigation、renderer crash、Core restart、Main close；
- mutation/reveal 双向、资源归零、四通道多编码泄漏扫描；
- 输出 `STRM2_PRODUCTION_WIRING_CONFORMANT`，同时固定：
  `productionSensitiveTransportReady=false / transportBlockerClosed=false /
  productionBusinessHandlerReady=false`；
- 不输出 `SENSITIVE_TRANSPORT_READY`。

每个子批均需独立 QA、用户接受和单独编码授权；STRM-2.2 详细方案评审通过也不自动授权编码。

总估算修正为：**13～21 个集中工程日**，不含独立 QA、返工、EIPC、DFI safe API/business composition、真实
helper packaging 或 STRM-3 Unblock Audit。父计划原 5～8 日估算因真实 lifecycle、Broker closure 与
process-level S1～S8 证据不足而失效；原 STRM-2.2 `3～5 日` 估算未计入真实 sandboxed Preload
WebCrypto 缺口及 Main-issued frame authorization，已由详细方案修正为 `5～8 日`。

## 16. 允许与禁止修改范围

### 16.1 子批获授权后允许

- `packages/contracts/src/desktop-private/personal-credential-transport-v1/**`；
- `apps/desktop/src/main/personal-credential-transport*.ts`；
- `apps/desktop/src/preload/personal-credential-transport*.ts`；
- 必要的 production Main/Preload entry **仅做 internal wiring 装配**；
- `apps/desktop/src/main/core-private-supervisor.ts` 的 private lifecycle hook/既有 Broker接缝；
- `services/core/src/desktop-private-main.ts` 的 typed unavailable/optional real handler接缝，但不得创建 Fake owner；
- STRM-2 专项 tests/Harness/fixtures/evidence；
- 版本、CHANGELOG、DEVELOPMENT-LOG、README 与正式报告（编码批收口窗口）。

### 16.2 明确禁止

- Renderer 页面与 `apps/desktop/src/renderer/**`；
- public `window.*` personal CRUD/reveal API；
- public Desktop v1alpha1、个人模型 safe v1alpha2 API/HTTP；
- Runtime Active identity production adapter/composition（EIPC-1～3）；
- Personal Model Persistence/Coordinator/Reveal/Provider/Task lock/Agent Loop 业务逻辑改写；
- Keychain helper production packaging、签名、公证或 installer；
- migration 1～24 改写或新增 migration 25；
- Central、Document Worker、DFI-2B、DFI-3、TGM；
- 新依赖、native binding、utility process、A/B/C fallback；
- Secret 经 JSON/Base64/hex/HTTP/argv/env/file/clipboard；
- 修改 `pnpm-lock.yaml`，除非未来方案评审和用户授权明确批准依赖变化。

## 17. QA 验收矩阵（88 项）

### 17.1 Contract 与 profile（1～14）

1. 单一 Route A profile；
2. structuredCloneUsed=true；
3. zeroCopyClaimed=false；
4. internal copies not reliably clearable；
5. runtime fallback=false；
6. strict ready control；
7. strict terminal control；
8. strict cancel control；
9. terminal/error 组合矩阵；
10. control extra field reject；
11. control digest tamper reject；
12. Ticket schema不扩 owner/Secret；
13. Envelope schema不扩 business fact；
14. profile revision mismatch fail-closed。

### 17.2 Main/Preload identity 与 wiring（15～32）

15. production Main internal wiring installed；
16. production Preload internal receiver installed；
17. production default disabled；
18. no public contextBridge method；
19. no Renderer import；
20. exact webContents；
21. exact main frame；
22. subframe reject；
23. foreign window reject；
24. webContentsId/mainFrameRoutingId 由 event 派生；
25. navigation epoch monotonic；
26. hash navigation invalidates；
27. reload invalidates；
28. renderer gone invalidates；
29. destroyed invalidates；
30. duplicate port reject；
31. nested/extra port reject；
32. one session/one frame/one terminal。

### 17.3 Broker direction 与 terminal（33～49）

33. mutation Route A→Main；
34. mutation Main→fd4；
35. mutation fd5 terminal→Main；
36. reveal Main→fd4 request；
37. reveal fd5 bytes→Main；
38. reveal Main→Route A→Preload；
39. reveal Preload consumer ack；
40. Renderer cannot inject reveal bytes；
41. Main cannot request mutation bytes for reveal；
42. prepared command required before Ticket；
43. wrong command/correlation reject；
44. wrong config/execution revision reject；
45. wrong request digest reject；
46. late Broker callback isolated；
47. transport completed != durable Receipt；
48. reveal completed != user-viewed fact；
49. production handler absent = typed unavailable。

### 17.4 S1～S8 与失败（50～66）

50. S1 mutation；51. S1 reveal；52. S2；53. S3 mutation；54. S3 reveal；55. S4；56. S5 mutation；
57. S5 reveal；58. S6 mutation；59. S6 reveal；60. S7 mutation；61. S7 reveal；62. S8 navigation；
63. S8 Core restart；64. S8 Main close；65. deadline/cancel single winner；66. no automatic replay/fallback。

### 17.5 Security、资源与 regression（67～88）

67. Uint8Array only；
68. 0/max/max+1；
69. SharedArrayBuffer/detached reject；
70. no Base64/hex/String Secret；
71. no ordinary invoke/send Secret；
72. no HTTP/SQLite/log/Event/Audit Secret；
73. Preload sender cleanup；
74. Preload receiver cleanup；
75. Main envelope cleanup；
76. Broker request/response cleanup；
77. reveal delivery cleanup；
78. four-channel raw scan；
79. four-channel Base64 scan；
80. four-channel URL/hex scan；
81. negative scanner injection；
82. all named resources zero；
83. STRM-0 regression；
84. STRM-1 conformance regression；
85. DFI-4A.2 Broker/Reveal regression；
86. public Contract/Renderer/EIPC boundary；
87. Workspace full check；
88. Central online/offline serial gates。

## 18. 退出条件

STRM-2 只有同时满足以下条件才可关闭：

1. STRM-2.1～2.3 均完成开发者门禁、独立 QA 与用户接受；
2. 真实 Electron production-path wiring 与 fd4/fd5 process path 均被 Harness 证明；
3. S1～S8、direction、identity、navigation/restart 与资源/泄漏断言全绿；
4. production feature 仍默认 disabled；
5. production Business handler/identity/helper 缺失被诚实投影为 unavailable；
6. transport blocker 仍保留；
7. 未进入 Renderer、public personal API、EIPC、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3 或 TGM。

允许的 STRM-2 最终输出仅为：

```text
STRM2_PRODUCTION_WIRING_CONFORMANT
```

禁止输出：

```text
SENSITIVE_TRANSPORT_READY
PERSONAL_MODEL_CRUD_READY
PERSONAL_CREDENTIAL_REVEAL_READY
```

## 19. 文档评审问题

1. 是否接受 STRM-2 只关闭 transport wiring，不关闭 Core business composition？
2. production Main/Preload entry 内部装配但无 public sidecar，是否正确避免提前进入 DFI-4A.4.2？
3. `PreparedSensitiveTransportCommand` 是否应保持 Main-private，由未来 safe Core结果物化？
4. `expectedExecutionDefinitionDigest` 留在 Main-private session record、通过 requestDigest/command identity 关联，
   是否比扩张 Preload Ticket 更小且安全？
5. Delete 不使用 Route A Secret transport、留给 DFI safe+Broker 路径是否正确？
6. Navigation epoch 是否应覆盖 hash navigation、reload、renderer gone 与 destroyed？
7. mutation/reveal terminal 是否清楚地区分 transport delivery 与 durable/user-viewed business fact？
8. 当前 production Core handler继续 unavailable，test-only controlled handler 只证明 transport，是否足够诚实？
9. STRM-2.1～2.3 拆分与修正后的 11～18 日估算是否可执行？
10. 88 项 QA 是否覆盖 S1～S8、方向、identity、资源和跨批边界？
11. 是否存在需要用户重新决策的 P0/P1 或新的公共 Contract/migration 需求？

## 20. 当前门禁

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

STRM-2.1～2.3 独立 QA 均已 PASS 并由用户正式接受，STRM-2 阶段整体正式 `PASS/CLOSED`。transport
blocker 仍打开，不输出 `SENSITIVE_TRANSPORT_READY`；STRM-3 及其他下游继续 `GATED`，不由本批自动解锁。
