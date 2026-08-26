# STRM-2.2 Broker Dispatch 与 Directional Closure 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED；IMPLEMENTATION PASS/CLOSED**  
> 日期：2026-08-23  
> 负责人：Codex 5.6  
> 上游：STRM-2 Plan `PASS/CLOSED`；STRM-2.1 `PASS/CLOSED`  
> 下游：STRM-2.3、STRM-3、EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM 均 `GATED`  
> 父计划：[STRM-2 Production Transport Wiring](./STRM-2-PRODUCTION-WIRING-DEVELOPMENT-PLAN.md)

## 1. 结论先行

STRM-2.2 只完成现有 Electron one-shot MessagePort 与现有 Main↔Core fd4/fd5
`PersonalCredentialBrokerClient` 之间的双向闭合：

```text
mutation
  future internal caller bytes
  -> Preload one-shot port
  -> Main exact session
  -> PersonalCredentialBrokerClient fd4/fd5
  -> strict transport terminal

reveal
  PersonalCredentialRevealDelivery / fd4/fd5
  -> Main exact session
  -> Preload one-shot port
  -> one consumer acknowledgement
```

本批不创建个人模型产品接口，不把测试 Broker 当成 production business handler，不解除 transport 或
enterprise identity blocker，也不进入 Renderer。production entry 继续保持：

```text
productionFeatureEnabled = false
productionSensitiveTransportReady = false
productionBusinessHandlerReady = false
transportBlockerClosed = false
```

STRM-2.1 已证明 sandboxed Preload 不能稳定依赖 `globalThis.crypto.subtle`。因此本批冻结一个独立的
**Main-issued frame authorization**：Preload 不自造 crypto，也不跳过 Secret frame 校验；Main 对 exact
Ticket/session/direction/body length 生成一次性非 Secret 授权，双方只接受与该授权逐字段相同的 frame。

STRM-2.2 最多输出：

```text
STRM22_BROKER_DIRECTIONAL_CLOSURE_CONFORMANT
```

不得输出：

```text
STRM2_PRODUCTION_WIRING_CONFORMANT
SENSITIVE_TRANSPORT_READY
PERSONAL_MODEL_CRUD_READY
PERSONAL_CREDENTIAL_REVEAL_READY
```

## 2. 当前代码事实

### 2.1 已存在并直接复用

| 代码事实 | 当前实现 | 本批用法 |
| --- | --- | --- |
| production controller 已装配 | `PersonalCredentialTransportProductionController`，默认 `foundationEnabled=false` | additive 扩展 dispatch state，不新增第二 controller |
| production Preload receiver 已装配 | `PersonalCredentialTransportPreloadReceiver`，默认关闭且无 `contextBridge` 业务 API | additive 增加 internal-only mutation/reveal seam |
| exact Ticket 与 Main Registry | `PersonalCredentialTransportMainAdapter` | 复用 runtime/client/command/model/config/request/window/frame/navigation 绑定 |
| strict binary envelope | `header + Uint8Array body`，最大 16 KiB | 不把 Secret 转 String/Base64/hex |
| Main frame digest | Main 已使用 Node `crypto` 计算 canonical non-secret frame digest | 作为 Main-issued authorization 的 frame material |
| fd4/fd5 Broker | `PersonalCredentialBrokerClient` | mutation/reveal 唯一 Main↔Core Secret 通道 |
| Broker channel identity | 每次 Core launch 新 `channelInstanceId` | dispatch lease 与 late callback gate 必须锁定该 identity |
| reveal delivery | `PersonalCredentialRevealDelivery` | 复用 single consumer、deadline、abort 和 byte cleanup |
| Core production Broker server | `PersonalCredentialBrokerServer` | 不改 binary framing |
| production Broker handler | `desktop-private-main.ts` 当前固定 `credential_store_unavailable` | 保持 typed unavailable，不用 Fake 绕过 |
| STRM-2.1 lifecycle | exact main frame、navigation epoch、ready/cancel、deadline、cleanup | 作为本批唯一 session lifecycle |
| DFI-4A.2 Broker tests | fd4/fd5、late response、channel restart、Secret cleanup 已有证据 | 回归而非重写 Broker |

### 2.2 必须关闭的代码缺口

| 编号 | 当前缺口 | STRM-2.2 决策 |
| --- | --- | --- |
| G1 | controller session 只有 `port_bound/ready` | 扩展为 frame authorization、dispatch、delivery、terminal 单一状态机 |
| G2 | controller 对任何数据只按 control 解析 | 严格区分 control、frame-authorization request、Secret envelope |
| G3 | Preload `sendMutation()/consumeReveal()` 依赖 WebCrypto | 改为 Main-issued exact frame authorization，不在 Preload 自造 crypto |
| G4 | 无 Main→Broker command mapping | 冻结逐字段映射，`transportRequestId` 只由 Broker client 每次尝试生成 |
| G5 | 无当前 Broker lease 锁定 | 新增 Main-private lease provider，锁定 Core runtime/channel/dispatch ordinal |
| G6 | 无 late Broker callback gate | callback 必须匹配 exact session、lease、navigation epoch、dispatch ordinal |
| G7 | reveal 没有 port consumer/ack 闭环 | 增加 Main-private reveal port consumer，ack 只回送 Main 预签发 control |
| G8 | `terminal_ack` 尚未按方向使用 | mutation 为 Main→Preload；reveal 成功为 Preload→Main，反向使用失败关闭 |
| G9 | Broker mutation pending 可合并 waiter | controller 禁止第二次 dispatch，不依赖 Broker coalescing 证明 exactly-once |
| G10 | production handler 仍 unavailable | 明确保留，成功路径只在标记为 test-only 的 controlled Broker 中验证 |

### 2.3 不属于本批的缺口

- Runtime Active Enterprise Identity production composition；
- `personal_model.configure` production entitlement；
- verified Keychain helper production packaging；
- public safe prepare/status API；
- public Desktop v1alpha2 personal model feature；
- Renderer API Key 输入、个人模型 CRUD/reveal UI；
- STRM-2.3 S1～S8 真实进程崩溃矩阵；
- STRM-3 transport unblock audit；
- production Core business handler composition。

这些缺口存在时，production feature 必须继续关闭；本批不能用环境变量、Fixture、固定 owner 或测试
helper 将其伪装为 ready。

## 3. 范围与不变量

### 3.1 本批交付

1. private Main-issued frame authorization Contract；
2. mutation Preload→Main→Broker→terminal；
3. reveal Broker→Main→Preload→ack；
4. exact Broker lease、deadline/abort 与 late callback gate；
5. transport terminal 与 durable Receipt/用户查看事实分离；
6. success/failure/cancel/timeout/navigation/Core restart 的 byte/resource cleanup；
7. test-only controlled Broker directional Harness；
8. production unavailable、feature disabled、blocker retained 的静态和运行时断言。

### 3.2 不变量

1. Secret 只存在于有界 `Uint8Array`/Buffer、MessagePort structured clone 与 fd4/fd5 binary frame；
2. Secret 不进入 Ticket、frame authorization、control、digest、日志、Evidence、URL、argv、env、文件、
   SQLite、普通 IPC、Core HTTP、Event、Audit 或 telemetry；
3. `frameDigest` 继续只证明 canonical non-secret frame material，不是 Secret hash；
4. Preload 不依赖 WebCrypto、不实现自研 hash/HMAC、不跳过 exact frame 校验；
5. Main-issued authorization 一次生成、一次消费、不可重放、不可更改 body length；
6. Main 从真实 Electron event/session 派生 identity，不接受 Preload/Renderer 自报 window/frame/navigation；
7. mutation 只有一个 Secret frame、一个 Broker dispatch、一个 transport terminal；
8. reveal 只有一个 Broker resolve、一个 Secret frame、一个 consumer、一个 acknowledgement；
9. mutation transport `completed` 不等于保存成功，业务成功只能由 Core durable Receipt/status 证明；
10. reveal transport `completed` 不等于用户已看到、复制或记住 Secret；
11. mutation 不因 uncertain 自动重发 Secret；reveal 永不自动重放；
12. Core restart 后不把旧 Broker callback 投影给新 session，也不把新 Broker client接到旧 session；
13. production Broker handler unavailable 时 typed fail-closed，不 fallback；
14. structured clone 内部副本不可枚举、不可可靠清零的残余风险保持既有接受口径；
15. 不新增第二套 Broker、Reveal Delivery、Operation Journal、Receipt 或个人模型状态机。

## 4. Main-issued Frame Authorization

### 4.1 为什么不能直接复用现状

当前 Preload adapter 会通过 `globalThis.crypto.subtle.digest()` 计算 frame digest；STRM-2.1 的真实
sandboxed Preload 已证明该能力不能作为稳定 production 前提。可接受的修复不能是：

- 跳过 frame digest；
- 信任 Preload 自报 `frameDigest`；
- 在 Preload 手写 SHA/HMAC；
- 把 Secret 编码为 String/Base64/hex 交给 Main；
- 退化到普通 `ipcRenderer.invoke/send`；
- 运行时自动 fallback 到其他 transport。

### 4.2 Contract 结构

在既有 private subpath additive 增加 strict、非 Secret Contract：

```text
PersonalCredentialTransportFrameAuthorizationRequest
  protocolVersion
  transportProfileRevision
  commandId
  correlationId
  direction = mutation_to_main
  frameType = mutation_secret
  bodyLength

PersonalCredentialTransportFrameAuthorization
  schemaVersion = personal-credential-transport-frame-authorization.v1
  authorizationId
  protocolVersion
  transportProfileRevision
  commandId
  correlationId
  direction = mutation_to_main | reveal_to_preload
  frameType = mutation_secret | reveal_secret
  bodyLength
  frameDigest
  ticketDigest
  expiresAt
  authorizationDigest
  revealCompletedAck?   // reveal only，Main 预签发
  revealUncertainAck?   // reveal only，Main 预签发
```

`authorizationDigest` 使用 Main-private 256-bit random key 和独立 domain：

```text
robothree.personal-credential-transport.frame-authorization.v1\n
```

HMAC material 必须按固定字段顺序 canonicalize，至少绑定：

```text
authorizationId
ticketDigest
runtimeInstanceId
clientInstanceId
commandId
correlationId
direction
frameType
bodyLength
frameDigest
webContentsId
mainFrameRoutingId
navigationEpoch
expiresAt
```

禁止把 Secret、Secret hash/shape、Credential Reference、owner、Endpoint、helper path、Broker
`transportRequestId` 放入授权或 digest。

### 4.3 Mutation 授权握手

1. Preload internal caller 持有 `Uint8Array`，先只发送 non-secret authorization request；
2. Main 仅在 exact session=`ready`、operation=create/update、bodyLength=1..16384、未签发过授权时处理；
3. Main 计算 canonical frame header/digest，生成一次性 authorization 并在 session 内保存；
4. Main 将 authorization 回送同一 one-shot capability port；
5. Preload 必须原样使用授权中的 exact header 发送一个 Secret envelope；
6. Main 重算 HMAC，并逐字段匹配 session 内保存的 authorization；
7. envelope header、direction、body length 任一不匹配都先清零 body，再失败关闭；
8. authorization 在 Main 接受 frame 前原子标记 consumed，第二个 frame 一律 replay/duplicate reject。

authorization request 本身不携带 Secret，也不授予跨 session 权力；来自 foreign port、错误 state 或
过期 Ticket 的 request 不生成授权。

### 4.4 Reveal 授权与 acknowledgement

Main 从 Broker 得到 reveal bytes 后才知道 exact body length，因此：

1. Main 为 `reveal_to_preload` 生成 frame authorization；
2. Main 同时生成与 exact command/correlation/ticket 绑定的 `completed` 与 `uncertain` ack control；
3. Main 在同一有序 port 上先发送 authorization，再发送 reveal envelope；
4. Preload 只接受紧邻且逐字段匹配该 authorization 的一个 reveal envelope；
5. consumer 成功后回送 Main 预签发的 completed ack；consumer throw/本地 deadline 只回送预签发的
   uncertain ack；
6. Main 对 ack 重新计算 control digest并校验 exact state；
7. port close/navigation/crash/ack lost 不猜测 consumer 结果，terminal=`uncertain`；
8. Preload 不自行签发 ack，也不能把 mutation authorization 用作 reveal authorization。

Preload 不能独立重算 HMAC，但授权和 envelope 都只能由 exact one-shot capability port 的 Main 端发送；
Preload 做 strict schema、exact equality、single-use 和 direction 校验。安全结论必须诚实表述为
“Main-issued capability proof + exact port ordering”，不能写成“Preload cryptographically verified”。

### 4.5 生命周期

- 每个 session 同时最多一个未消费 authorization；
- expiry 取 Ticket expiry、prepared deadline 和当前 transport deadline 的最小值；
- authorization 只在 runtime memory，不能持久化；
- navigation、renderer gone、Core restart、Main shutdown、port close、cancel、timeout 时立即失效；
- registry 上限沿用 256，active session 上限沿用 4；
- terminal 后保留不含 Secret 的 command tombstone 10 分钟，authorization material不进入 tombstone；
- Main close 时清零 frame authorization HMAC key。

## 5. Broker Lease 与 Stable Mapping

### 5.1 Main-private lease provider

新增最小 Main-private interface：

```text
PersonalCredentialBrokerLeaseProvider.current()
  -> unavailable
  | {
      runtimeInstanceId
      brokerChannelInstanceId
      clientInstanceId
      client: PersonalCredentialBrokerClient
    }
```

production implementation 只读取 `CorePrivateSupervisor` 当前 ready Broker；不缓存跨 Core restart 的
client，不把 fd4/fd5 stream 暴露给 controller。若 Core 未 ready、Broker getter 抛错或 channel 已关闭，
返回 typed unavailable。

### 5.2 Dispatch identity

每次 dispatch 在 session 内锁定：

```text
dispatchOrdinal = 1                 // 首期每 session 唯一
brokerRuntimeInstanceId
brokerChannelInstanceId
brokerClientInstanceId
commandId
requestDigest
navigationEpoch
deadlineAt
```

Broker callback 只有同时满足以下条件才可投影：

1. session 仍存在且未 terminal；
2. dispatchOrdinal 仍为 1；
3. commandId/requestDigest 匹配；
4. captured Broker channel 与 session lease 匹配；
5. window/frame/navigation identity 未变化；
6. AbortSignal 未收敛为 cancel/process lost；
7. callback 是 terminal gate 的 winner。

否则只清零 result bytes并计 safe late-callback count，不改变 outcome。

### 5.3 Prepared command → Broker command 映射

| Broker 字段 | 唯一来源 | 规则 |
| --- | --- | --- |
| `commandId` | prepared command | 原样锁定 |
| `commandType` | `operationType` | create→create，update→update，reveal→reveal |
| `personalModelId` | prepared command | 原样锁定 |
| `expectedConfigurationRevision` | prepared command | 三类命令均精确传入 |
| `expectedExecutionDefinitionDigest` | prepared command | reveal 必填；mutation 禁止 |
| `commandRequestDigest` | prepared `requestDigest` | 不重算业务 intent，不含 Secret |
| `deadlineAt` | prepared command | 不延长；取 session 有效 deadline |
| `secret` | accepted mutation envelope | create/update 必须；reveal 禁止 |
| `transportRequestId` | Broker client | 每次网络/pipe 尝试新建，不进入稳定 command identity |

禁止由 Main 补 owner、credentialRef、Endpoint、helper 或 policy；这些事实属于 Core Coordinator。

## 6. Mutation Directional Closure

### 6.1 固定顺序

```text
ready
 -> mutation_authorization_requested
 -> mutation_authorization_issued
 -> mutation_frame_received
 -> broker_lease_bound
 -> broker_dispatched
 -> broker_settled
 -> terminal_sent
 -> closed
```

具体步骤：

1. Preload internal-only `submitMutationSecret(commandId, bytes)` 检查 exact session、create/update 和
   single-use；production 无公开 caller；
2. 完成 §4.3 authorization 握手；
3. Main 接受并校验 Secret envelope；
4. Main 在 authorization consumed 后、Broker execute 前创建 session-scoped `AbortController`；
5. 获取当前 Broker lease并锁定 channel；
6. 构造 exact Broker command，只把 envelope body 交给 `execute()`；
7. `execute()` 已复制所需 request body 后，Main 在 `finally` 清零 accepted envelope body；
8. Broker result 映射为 strict transport terminal；
9. Main 发送 terminal control 后关闭 session；
10. 即使 terminal=`completed`，也不生成业务 Receipt、不向 UI声称保存成功。

### 6.2 Mutation failure 语义

| 窗口 | 结果 |
| --- | --- |
| authorization 前取消 | cancelled；零 Secret frame、零 Broker |
| Secret post 后 Main 未接收 | uncertain；future safe layer 只能查 durable status，不自动重发 |
| Main 接收后 Broker dispatch 前失败 | accepted body 清零；prepared fact保留，不猜测 Keychain |
| Broker dispatch 后 fd5 前失败 | Broker/Coordinator 自己按 Journal/inspect 恢复；transport uncertain |
| Broker completed 后 terminal 丢失 | transport uncertain；future safe status 查询 durable Receipt |
| Core restart | 旧 Broker client close；旧 session不改接新 client，不自动重发 Secret |

### 6.3 不依赖 Broker pending coalescing

现有 Broker client 对相同 mutation command/digest 的 pending 调用可能合并 resolver。STRM-2.2 controller
必须在调用 Broker 之前用 session CAS 阻止第二次 dispatch；测试必须断言 `executeCount=1`。Broker 的
coalescing 是其内部兼容行为，不是 Renderer↔Main exactly-once 证明。

## 7. Reveal Directional Closure

### 7.1 固定顺序

```text
ready
 -> broker_lease_bound
 -> broker_dispatched
 -> reveal_bytes_received
 -> reveal_authorization_issued
 -> reveal_frame_sent
 -> reveal_ack_received
 -> closed
```

具体步骤：

1. reveal session ready 后立即获取当前 Broker lease；
2. 用 exact prepared material 构造 reveal command；
3. 通过 `PersonalCredentialRevealDelivery` 执行 Broker resolve + single consumer deadline；
4. Main-private `PersonalCredentialTransportRevealPortConsumer` 为 working bytes 创建 §4.4 authorization；
5. authorization 与 envelope按序发送 exact port；post 后清零 Main 可控 envelope body；
6. Preload internal-only consumer消费 body；无 consumer 时失败关闭，不把 bytes排队等待未来 consumer；
7. consumer 结束后只回送 Main 预签发 ack；
8. Main 校验 ack、收敛 delivery Promise和 transport terminal；
9. Reveal Delivery `finally` 清零 working copy；
10. session 保留 no-replay tombstone，但不写 durable success Receipt。

### 7.2 Consumer 边界

本批只允许构造器注入的 Main/Preload private test consumer seam；production entry 没有业务 consumer，且
feature disabled。禁止：

- `contextBridge.exposeInMainWorld()` 新增 reveal API；
- broadcast/fan-out 给多个 webContents；
- pending reveal 合并 waiter；
- 把 Secret 放入 Vue store、全局变量、clipboard 或 Evidence；
- consumer 缺失时缓存 Secret等待 later registration；
- ack lost 后自动再次 resolve Keychain。

### 7.3 Reveal failure 语义

| 窗口 | 结果 |
| --- | --- |
| Broker reject/cancel/timeout | Main 发送 safe terminal，不创建 reveal frame |
| Broker completed 但 bytes 缺失 | invalid response，rejected/uncertain，绝不发送空 Secret |
| bytes 到 Main、authorization 前失败 | bytes清零，uncertain/no replay |
| authorization 后、frame post 前失败 | bytes清零，authorization失效，uncertain/no replay |
| frame post 后、consumer ack 前失败 | uncertain/no replay |
| consumer throw | 回送预签发 uncertain ack，所有 application-owned bytes清零 |
| navigation/renderer crash | port关闭，uncertain/no replay |
| Core restart | 旧 Broker result不能进入新 session；reveal tombstone继续阻止自动 replay |

## 8. 单一状态机与 Direction Rule

### 8.1 Main session state

```text
port_bound
  -> ready
  -> mutation_authorization_issued
  -> mutation_frame_received
  -> broker_dispatched
  -> broker_settled
  -> terminal_sent
  -> closed

ready
  -> broker_dispatched                 // reveal
  -> reveal_authorization_issued
  -> reveal_frame_sent
  -> reveal_acknowledged
  -> closed

任意非终态
  -> rejected | cancelled | timed_out | uncertain
  -> closed
```

状态推进必须经同一 session terminal gate；Broker callback、port message、abort、timer、navigation、renderer
gone、Core restart 与 shutdown 竞争时只有一个 winner。

### 8.2 Preload session state

```text
mutation: ready -> authorization_requested -> authorization_received
          -> frame_sent -> terminal_received -> closed

reveal:   ready -> authorization_received -> frame_received
          -> consumer_settled -> ack_sent -> closed
```

### 8.3 `terminal_ack` 方向冻结

| operation | 合法方向 | 含义 |
| --- | --- | --- |
| create/update | Main→Preload | Broker transport 已收敛；completed 仍需查业务 Receipt |
| reveal（Broker failure） | Main→Preload | 没有 Secret delivery |
| reveal（frame delivered） | Preload→Main | consumer完成或不确定；不证明用户已看见 |

任何相反方向、错误 state、错误 command/correlation 或重复 control 都失败关闭。Preload 发出的 reveal ack
必须是 Main 在对应 frame authorization 中预签发的 exact control。

## 9. Terminal、Receipt 与 Product Truth

### 9.1 Mutation

```text
transport completed
  = Broker response已安全收敛
  != Keychain mutation业务成功对用户可见
  != durable Receipt已被调用方读取
```

本批没有 public safe status API，因此不得产生“保存成功/更新成功”产品文案或 public projection。未来
DFI-4A.4.2 必须通过 Core safe status/Receipt 查询决定 UI 事实。

### 9.2 Reveal

```text
transport completed
  = 单一 Preload consumer已完成
  != 用户已查看
  != 用户已复制
  != durable success Receipt
```

Reveal 继续遵循 ADR-013 Addendum A：不生成 durable success Receipt，不自动重放，不广播。

### 9.3 Typed mapping

| Broker/transport事实 | transport terminal | safe code |
| --- | --- | --- |
| Broker completed | completed | 无 error；mutation仍查 Receipt |
| Broker rejected | rejected | 映射到允许的 private transport rejection code，不透传内部栈 |
| Broker cancelled | cancelled | `personal_credential_transport_cancelled` |
| Broker timed_out | timed_out 或 uncertain | dispatch 前 timed_out；dispatch 后保守 uncertain |
| Broker uncertain/disconnect | uncertain | `personal_credential_transport_uncertain` |
| stale Broker lease/channel | uncertain | `personal_credential_transport_process_lost` |
| invalid authorization/frame | rejected | `personal_credential_transport_invalid_frame` |
| navigation invalidation | uncertain | `personal_credential_transport_navigation_invalidated` |

若现有 private error enum不能无损表达 Broker safe code，只允许 additive 增加有界 private code；禁止把
Broker内部错误字符串、Keychain错误或 stack 透传给 Preload。

## 10. Cancel、Deadline、Restart 与 Late Callback

### 10.1 Abort 传播

- 每个 dispatch 一个 `AbortController`；
- cancel、deadline、navigation、renderer gone、Core process lost、Main shutdown 统一 abort；
- abort 后不再发送新 frame/ack；
- Broker callback若已在途，只可进入 late cleanup；
- terminal gate先收敛，随后清 timer/listener/port/session/authorization/lease。

### 10.2 Core restart

- `CorePrivateSupervisor` 每次 launch 生成新 Broker `channelInstanceId`；
- controller dispatch 时捕获 lease，不长期缓存 getter结果；
- 旧 client close 返回 uncertain，旧 session不能切换到新 client；
- 新 client只服务新 prepared command/session；
- 旧 channel的 late result bytes必须清零；
- 本批不恢复 MessagePort session，也不自动重建 Ticket。

### 10.3 Main/Renderer lifecycle

- navigation epoch变化先 invalidate authorization和 session，再关闭 port；
- renderer gone/destroyed/window close 与 deadline竞争走同一 terminal gate；
- Main restart 后 HMAC keys、Ticket、authorization、port/session全部失效；
- mutation 只能由未来 safe layer查询 durable status；
- reveal 永远 no replay。

## 11. Secret Cleanup 与资源诊断

### 11.1 Application-owned byte cleanup

至少覆盖：

1. Preload internal caller交入的 mutation bytes；
2. Preload envelope body；
3. Main MessagePort event body；
4. Main accepted mutation body；
5. Broker client request copy/frame；
6. Broker client response body；
7. Reveal Delivery working copy；
8. Main reveal envelope body；
9. Preload reveal envelope body；
10. test-only controlled Broker body；
11. late/unmatched callback body；
12. Main frame authorization HMAC key（controller close）。

每一项都必须覆盖 success、throw、cancel、deadline、navigation、Core restart 与 Main shutdown。不得声称
Chromium structured-clone内部副本、JS String、OS crash dump 或 swap 可由本批可靠清零。

### 11.2 Resource snapshot

新增/扩展 runtime-only诊断，最终必须归零：

```text
windowCount
messagePortCount
ipcListenerCount
navigationListenerCount
timerCount
transportSessionCount
transportRegistryCount
frameAuthorizationCount
brokerLeaseCount
brokerInflightCount
brokerCompletedCount
brokerRevealTombstoneCount
abortControllerCount
lateCallbackCount
revealConsumerCount
openSensitiveStreamCount
```

Evidence 只记录 count、digest、status、duration、typed code；不记录 PID、端口、路径、owner、Credential
Reference、Endpoint、Secret正文或 Secret shape。

### 11.3 泄漏扫描

- parent stdout、child stderr、machine evidence、safe trace 四通道分别计数；
- canary、credential、endpoint、body、path 五类 marker；
- raw、Base64、URL percent、hex 四种形态；
- 每通道/形态均有负向注入，证明 scanner 真能失败；
- scanner失败信息不得回显 marker本身。

## 12. Production Activation 与 Test-only Composition

### 12.1 Production

本批可以将 directional controller代码接入现有 production lifecycle，但必须同时满足：

- `foundationEnabled=false`；
- 无 public `ipcMain.handle` 可达 `openPreparedCommand`；
- 无 `contextBridge` personal model API；
- production Core Broker handler仍为 typed unavailable；
- `productionBusinessHandlerReady=false`；
- `productionFeatureEnabled=false`；
- `productionSensitiveTransportReady=false`；
- `transportBlockerClosed=false`。

### 12.2 Test-only controlled Broker

成功路径只允许显式 test-only composition：

- 不使用真实用户 Key；
- 使用随机 canary bytes；
- controlled Broker提供 completed/rejected/cancelled/timed_out/uncertain、late callback、channel restart；
- evidence固定 `controlledBroker=true` 与 `productionBusinessHandlerReady=false`；
- Fixture不能被 production entry import；
- 静态扫描断言测试 handler、Fake authority、test helper不进入 production依赖图。

## 13. 实施步骤

### Step 1：Private frame authorization Contract（1～1.5 日）

- strict request/authorization schema；
- canonical material、HMAC domain与逐字段 helper；
- reveal预签发 ack controls；
- 方向、state、bodyLength、expiry与extra-field negative matrix；
- Contract root不公开导出，只保留 desktop-private subpath。

### Step 2：Main/Preload authorization state（1～1.5 日）

- controller/receiver状态扩展；
- mutation authorization request/issue/consume；
- reveal authorization+envelope ordered delivery；
- Preload去除对 Secret frame WebCrypto的 production依赖；
- duplicate/mismatch/late frame cleanup。

### Step 3：Broker lease 与 mutation closure（1～1.5 日）

- current lease provider；
- prepared→Broker exact mapping；
- AbortController、deadline、channel/restart/late callback gate；
- transport terminal，不生成业务 Receipt；
- Broker executeCount=1。

### Step 4：Reveal port consumer 与 directional ack（1～1.5 日）

- 复用 `PersonalCredentialRevealDelivery`；
- Main reveal port consumer；
- Preload single consumer与预签发 ack；
- ack lost/navigation/Core restart no replay；
- 七层以上 byte cleanup。

### Step 5：Harness、回归与收口（1～2 日）

- Contract/Main/Preload/Broker directional focused tests；
- Electron direction scenarios；
- controlled Broker success/failure/late/restart；
- STRM-0/1/2.1 与 DFI-4A.2 Broker/Reveal regression；
- production disabled/handler unavailable/static boundary；
- full Workspace + Central online/offline 串行门禁。

集中工程日估算：**5～8 日**，不含独立 QA、返工和 STRM-2.3。父计划原 STRM-2.2 `3～5 日`
未计入 STRM-2.1 实测发现的 sandbox Preload WebCrypto 缺口；由本详细方案诚实修正。STRM-2 总估算相应由
`9～15 日` 调整为 **11～18 日**。

## 14. 允许与禁止修改范围

### 14.1 获得单独编码授权后允许

- `packages/contracts/src/desktop-private/personal-credential-transport-v1/**`；
- `apps/desktop/src/main/personal-credential-transport*.ts`；
- `apps/desktop/src/preload/personal-credential-transport*.ts`；
- `apps/desktop/src/main/core-private-supervisor.ts` 的只读 Broker lifecycle/lease接缝；
- production Main/Preload entry仅做 disabled internal wiring；
- STRM-2.2 tests/Harness/fixtures/evidence；
- 编码批收口时的版本、README、CHANGELOG、DEVELOPMENT-LOG与实施报告。

### 14.2 明确禁止

- `apps/desktop/src/renderer/**`；
- public Desktop v1alpha1/v1alpha2 personal model API；
- public `ipcMain.handle` / `contextBridge` CRUD/reveal方法；
- `services/core` production business handler、Coordinator、Reveal、Persistence、Provider、Agent Loop改写；
- Fake owner/Fake entitlement/fixed user进入 production；
- EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM；
- STRM-2.3/STRM-3；
- migration 1～24改写或新增 migration 25；
- Central、Document Worker；
- 新依赖、native binding、utility process、runtime fallback；
- Secret String/Base64/hex/普通 IPC/HTTP/文件/argv/env/clipboard；
- `pnpm-lock.yaml` 修改。

若实现发现必须修改上述禁止范围，STRM-2.2 必须停止并回文档评审，不能边编码边扩大授权。

## 15. QA 验收矩阵（84 项）

### 15.1 Contract 与 authorization（1～20）

1. strict mutation authorization request；
2. request只允许 mutation方向；
3. bodyLength 0 reject；
4. bodyLength max accept；
5. bodyLength max+1 reject；
6. strict frame authorization；
7. authorization extra field reject；
8. authorizationId UUID；
9. exact ticketDigest绑定；
10. exact runtime/client绑定；
11. exact command/correlation绑定；
12. exact webContents/frame/navigation绑定；
13. exact direction/frameType绑定；
14. exact bodyLength/frameDigest绑定；
15. independent HMAC domain；
16. HMAC tamper reject；
17. expired authorization reject；
18. single-use authorization；
19. authorization无 Secret/Secret hash/credentialRef/owner/Endpoint；
20. private subpath only。

### 15.2 Mutation direction（21～38）

21. ready前 request reject；
22. reveal session request mutation authorization reject；
23. second authorization request reject；
24. foreign port request reject；
25. authorization header exact reuse；
26. header bodyLength mismatch reject并清零；
27. wrong direction/frameType reject；
28. second Secret frame reject；
29. detached/SharedArrayBuffer/wrong brand reject；
30. prepared→Broker逐字段映射；
31. Broker `transportRequestId` 新建且不进稳定 identity；
32. Broker executeCount=1；
33. accepted Main body finally清零；
34. completed映射transport terminal；
35. rejected/cancelled/timed_out/uncertain映射；
36. completed不生成业务 Receipt；
37. Broker unavailable不 fallback；
38. mutation uncertain不自动重发。

### 15.3 Reveal direction（39～55）

39. ready前不 dispatch reveal；
40. reveal Broker command exact mapping；
41. reveal禁止mutation Secret；
42. completed response必须有非空 Secret；
43. Main authorization先于envelope；
44. Preload exact authorization匹配；
45. Preload不能注入 reveal bytes；
46. single consumer；
47. missing consumer fail-closed且不缓存；
48. pending reveal不合并；
49. completed ack使用Main预签发control；
50. uncertain ack使用Main预签发control；
51. wrong-direction ack reject；
52. ack lost→uncertain；
53. consumer throw→uncertain；
54. reveal completed不生成durable success Receipt；
55. reveal no replay。

### 15.4 Lease、race 与 lifecycle（56～70）

56. current Broker lease only；
57. exact channelInstanceId lock；
58. Core restart invalidates old lease；
59. new client不接旧session；
60. late old callback清零不投影；
61. cancel vs callback single winner；
62. deadline vs callback single winner；
63. navigation vs callback single winner；
64. renderer gone vs callback single winner；
65. Main close aborts all dispatch；
66. authorization失效先于port close；
67. mutation terminal方向正确；
68. reveal terminal/ack方向正确；
69. duplicate control/frame terminal不改写；
70. session/authorization/lease/timer/abort资源归零。

### 15.5 Security、boundary 与 regression（71～84）

71. production foundation disabled；
72. production business handler unavailable；
73. no public `ipcMain.handle`；
74. no public `contextBridge` personal API；
75. Renderer不导入private Contract；
76. no Preload WebCrypto requirement for Secret frame；
77. no custom Preload crypto；
78. no Secret String/Base64/hex/HTTP/SQLite/log/Event/Audit；
79. four-channel multi-encoding leak scan 0；
80. negative scanner injection；
81. STRM-0/1/2.1 regression；
82. DFI-4A.2 Broker/Reveal regression；
83. Workspace full check；
84. Central online/offline serial gates。

## 16. 退出条件

STRM-2.2 只有同时满足以下条件才可进入用户接受流程：

1. 84 项 QA全部通过；
2. mutation/reveal方向在 controlled Broker中真实闭合；
3. Secret frame不依赖sandbox Preload WebCrypto且没有弱化校验；
4. Broker lease/restart/late callback gate被测试证明；
5. transport terminal与durable Receipt/用户查看事实严格分离；
6. production handler仍 unavailable、feature仍 disabled、blocker仍成立；
7. 未进入Renderer/public API/EIPC/DFI业务composition/STRM-2.3；
8. Workspace、Central online/offline严格串行全绿；
9. 独立 QA PASS且用户接受前不标记 `PASS/CLOSED`。

通过后仍只允许进入 STRM-2.3 方案评审，不自动编码。

## 17. 文档评审问题

1. 是否接受 Main-issued one-shot frame authorization 作为 sandbox Preload 无稳定 WebCrypto时的最小正确
   方案，而不是在 Preload自造crypto或弱化Secret frame校验？
2. `frameDigest`继续只覆盖non-secret frame material、另用Main-private HMAC授权exact frame，是否正确避免
   Secret-derived digest泄漏？
3. mutation是否必须先取得authorization再发送唯一Secret frame？
4. reveal authorization与ack controls由Main预签发、Preload只做exact equality/single-use，是否正确？
5. 是否接受Preload不被描述为“cryptographically verified”，而只依赖Main-issued proof + exact capability
   port ordering的诚实边界？
6. Broker lease是否必须绑定runtime/channel/dispatch ordinal且Core restart后不接新client？
7. 是否同意controller不能依赖Broker pending coalescing证明exactly-once？
8. mutation transport completed后仍必须由future safe status查询durable Receipt，是否正确？
9. reveal completed只证明single consumer settle、不证明用户已看见，是否正确？
10. production handler unavailable与feature disabled是否必须贯穿本批全部Harness/Evidence？
11. STRM-2.2从3～5日调整为5～8日、STRM-2总估算调整为11～18日是否可接受？
12. 84项QA与禁止范围是否足够支持独立编码授权？

## 18. 当前门禁

```text
STRM-2.1          PASS/CLOSED
STRM-2.2          PASS/CLOSED
STRM-2.3          DOCUMENT REVIEW PENDING / CODING GATED
STRM-3            GATED
EIPC-1～EIPC-3    GATED
DFI-4A.4.1～4A.4.3 GATED
DFI-2B / DFI-3    GATED
TGM               GATED
```

STRM-2.2 独立 QA 已 `PASS（P0=0 / P1=0 / P2=0 / P3=2）`，两个 P3 均不阻断；用户已正式接受并关闭。
STRM-2.3 只进入详细方案评审，不自动获得编码授权。
