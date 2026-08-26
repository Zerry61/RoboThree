# STRM-2.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-23-0840-version-strm.2.2` |
| 验收对象 | STRM-2.2：Broker Dispatch 与 Directional Closure |
| 日期 | 2026-08-23 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root / Contracts / Desktop `0.0.0-strm.2.2`；Core/Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:strm2.2` | **PASS**：**8 files / 53 tests** + 真实 Electron **4 scenarios**（production_disabled / mutation_completed / reveal_completed / broker_rejected）；`outcome=STRM22_BROKER_DIRECTIONAL_CLOSURE_CONFORMANT`；`mutationExecuteCount=1`、`revealExecuteCount=1`；四项 production 状态 false |
| 2 | `CI=true pnpm run check`（完整） | **PASS 236 files / 1572 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 307/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | 首跑 1 偶发失败，从零复跑 **PASS 307/0/0/0 / BUILD SUCCESS**（见 §三） |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | Frame Authorization Contract strict | ✅ [authorization.ts](packages/contracts/src/desktop-private/personal-credential-transport-v1/authorization.ts) request 固定 `direction=mutation_to_main`、`bodyLength=1..16KiB`；material 绑定 ticketDigest/runtime/client/command/correlation/webContents/frame/navigation/direction/frameType/bodyLength/frameDigest/expiry；superRefine 强制 direction↔frameType 一致、mutation 禁带 reveal ack、reveal 必带 completed+uncertain ack |
| 2 | digest 不含 Secret 派生 | ✅ `frameDigest` = sha256(canonical frame material)，material 仅 protocol/profile/command/correlation/frameType/bodyLength，**不含 body/Secret**；`authorizationDigest` = HMAC(frameAuthKey, 独立 domain + canonical material) |
| 3 | 独立 HMAC domain + 32 字节 key | ✅ `FRAME_AUTHORIZATION_HMAC_DOMAIN` 与 Ticket HMAC domain 分离；`#frameAuthorizationKey` 校验 32 字节、controller/adapter close 时 `fill(0)` |
| 4 | mutation 授权握手 | ✅ Preload `submitMutationSecret` 先只发 non-secret request（复制 body、清零 caller original）；Main `#handleAuthorizationRequest` 仅 `ready` + create/update + 未签发时签发；`sendAuthorizedMutation` 用 Main 签发的 exact `frameHeader`，bodyLength 不匹配拒绝 |
| 5 | reveal 授权 + 预签发 ack | ✅ Main `#revealPortConsumer` 先 `createControl` completed/uncertain ack 再 `createFrameAuthorization`（带两 ack digest）；`consumeAuthorizedReveal` 逐字段校验 envelope header 与 authorization.frameHeader；consumer 成功回 completed ack、throw 回 uncertain ack |
| 6 | Preload 不依赖 WebCrypto | ✅ production 路径 `sendAuthorizedMutation`/`consumeAuthorizedReveal` 只用 exact equality + schema + direction + single-use，**不调 `crypto.subtle`**；`#assertAuthorization` 不重算 HMAC（诚实边界，见 §四 P3-1） |
| 7 | Broker lease 锁 runtime/channel/client | ✅ `#bindBrokerLease` 校验 `runtimeInstanceId`/`clientInstanceId`/`channelInstanceId` 三者与 preparedCommand 和 `client.channelInstanceId` 精确一致，否则 `process_lost` |
| 8 | executeCount=1（不依赖 coalescing） | ✅ session 状态机单向推进，dispatch 前设 `dispatchOrdinal=1`；测试显式断言 `executeCount=1`（directional-closure 测试「does not reuse Broker coalescing」） |
| 9 | late callback gate | ✅ `#isCurrentDispatch` 校验 session 存活 + dispatchOrdinal + channelInstanceId + navigationEpoch + abort 未发生；不满足则 `result.secret?.fill(0)` + `lateCallbackCount++`，不投影 |
| 10 | 方向规则 | ✅ mutation terminal = Main→Preload；reveal 成功 ack = Preload→Main（`#handleControl` 校验 state=`reveal_frame_sent` + ack digest）；reveal Broker 失败 = Main→Preload（`#settle(..., !revealAcknowledged)`） |
| 11 | transport completed ≠ Receipt/用户查看 | ✅ `mapBrokerHeader` completed→terminal completed，controller 不生成业务 Receipt；reveal completed 必须已收到 consumer ack（`#dispatchReveal` 里 `completed && !hasAck → rejected`） |
| 12 | byte cleanup | ✅ mutation accepted body 在 `execute()` 同步复制后 `finally` 清零；reveal envelope `finally` 清零；`#closeSession` abort + 清 authorization/lease + reject pending ack |
| 13 | broker-client/supervisor 接缝最小 | ✅ broker-client 仅加 `channelInstanceId` getter + 同步复制 body（`Uint8Array.from`，支撑清零契约）+ `transportRequestId` 新建 + 内部 channelInstanceId late gate；supervisor 仅加 `personalCredentialBroker` getter + channelInstanceId 传参；未改 Core 业务逻辑 |
| 14 | production 持续关闭 | ✅ Main/Preload entry `foundationEnabled=false`、无 public `ipcMain.handle`/`contextBridge`、Broker handler typed unavailable；harness evidence `productionBusinessHandlerReady=false`、`controlledBroker=true` |
| 15 | 测试断言真实性 | ✅ 反查无 `.skip`/`.only`/`todo`/`xit`、无空断言/恒真断言；8 个 directional 用例覆盖 HMAC tamper、单 dispatch、单 consumer、lease mismatch、coalescing 不证明 exactly-once、late result 清零、consumer 失败 uncertain、production disabled |
| 16 | 边界零漂移 | ✅ 改动 = desktop-private Contract + Main（index/controller/transport/broker-client/supervisor）+ Preload（receiver/transport）+ tests/Harness；未改 Core/Central/Document Worker/Renderer/migration；`pnpm-lock.yaml` 保持 Aug 16；migrations 最大 id 仍 24 |

---

## 三、Central offline 首跑偶发失败说明（非 STRM-2.2 缺陷）

`check:central:offline` 首跑 `Tests run: 307, Failures: 1`，从零完整复跑 **307/0/0/0 / BUILD SUCCESS**。

- STRM-2.2 未修改 Central/Core（边界零漂移已确认），故该失败不可能由本批引入；
- 失败模式与上一批 STRM-2.1 记录的 `Cgf2a3` 同类（Testcontainers 集成测试多 JVM/多 Postgres 容器的
  资源竞争/时序偶发），属既有测试环境问题；
- 复跑通过证明为偶发，非稳定缺陷。如实记录，不构成 STRM-2.2 的 P 级缺陷。

---

## 四、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 2

#### P3-1：Preload 遗留 WebCrypto 方法未清理（技术债，非缺陷）

[personal-credential-transport.ts](apps/desktop/src/preload/personal-credential-transport.ts) 中
`sendMutation`/`consumeReveal`/`createEnvelope`/`assertEnvelope`/`sha256Digest` 是 STRM-1 遗留方法，仍
import/依赖 `globalThis.crypto.subtle`。production 路径（receiver 的 `sendAuthorizedMutation`/
`consumeAuthorizedReveal`）**不调用**这些方法，因此 production 运行时已不依赖 WebCrypto——方案 §4.1
「去除 production 依赖」的目标已达成。但遗留方法保留为 STRM-1 回归测试服务，且无 `@deprecated`
标注，存在未来误用（在 production 里调 `sendMutation` 而非 `sendAuthorizedMutation`）重新引入
WebCrypto 依赖的风险。建议后续收口（STRM-3 或专项清理）时删除或加 `@deprecated` 标注。

#### P3-2：Broker rejected 映射为 `unavailable` 语义不精确

[personal-credential-transport-controller.ts:791-794](apps/desktop/src/main/personal-credential-transport-controller.ts#L791)
`mapBrokerHeader` 将 `Broker rejected` 映射为 `terminal=rejected`（正确）+ `typedErrorCode=personal_credential_transport_unavailable`。
`unavailable` 语义是「服务未就绪」，而 `rejected` 语义是「操作被拒绝」，两者是不同的业务事实。方案
§9.3 明确允许「若现有 private error enum 不能无损表达 Broker safe code，允许 additive 增加有界 private
code」，本批选择了保守复用 `unavailable` 而非 additive。影响面小（terminal 字段准确、真实原因由 Core
durable status 查询），但 future safe layer 无法仅凭 typedErrorCode 区分「拒绝」与「未就绪」。建议后续
additive 一个精确的 `rejected` private code。

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 2（均不阻断）
```

STRM-2.2 正确完成 Broker Dispatch 与 Directional Closure：Main-issued HMAC frame authorization 精确绑定
Ticket/runtime/client/command/correlation/window/frame/navigation/direction/bodyLength/frameDigest/expiry，
`frameDigest`/`authorizationDigest` 均不含 Secret 派生信息，独立 HMAC domain + 32 字节 key；mutation 走
Preload→Main→fd4/fd5 Broker→terminal 单向闭环，reveal 走 Broker/RevealDelivery→Main→Preload single consumer
→Main 预签发 ack；Broker lease 锁定 runtime/channel/client/dispatch ordinal，`#isCurrentDispatch` late callback
gate 只清零不投影，session CAS 保证 `executeCount=1` 不依赖 Broker coalescing；方向规则严格（mutation
Main→Preload、reveal 成功 Preload→Main、reveal 失败 Main→Preload）；transport completed 与 durable Receipt/
用户查看严格分离。Harness 独立复跑 PASS（8 files / 53 tests + 4 Electron scenarios + executeCount=1 + 四项
production 状态 false）、完整 check 236/1572 + 3 smoke、Central online 307/307、offline 复跑 307/307 全绿。
边界零漂移：仅改 desktop-private Contract + Main/Preload + broker-client/supervisor lease 接缝 + tests/Harness，
未改 Core/Central/Document Worker/Renderer/migration，`pnpm-lock.yaml` 保持 Aug 16。两处 P3 均不阻断，见 §四。

**STRM-2.2 可进入用户接受流程；接受后 STRM-2.3（S1～S8 Process Harness 与收口）仍需单独提交方案/差异复核
并获得用户明确编码授权，不由本批自动解锁。STRM-3、EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
