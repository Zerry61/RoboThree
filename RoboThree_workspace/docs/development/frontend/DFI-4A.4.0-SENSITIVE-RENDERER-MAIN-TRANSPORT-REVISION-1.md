# Sensitive Renderer↔Main Transport Revision 1 详细替代方案

> 状态：**DOCUMENT PLAN PASS/CLOSED；STRM-0～STRM-2 PASS/CLOSED；STRM-3 GATED**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 来源：DFI-4A.4.0 `PASS/CLOSED`；`BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER` 已确认成立  
> 配套威胁模型：[Sensitive Renderer↔Main Transport Threat Model](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-THREAT-MODEL.md)

## 1. 结论先行

DFI-4A.4 原计划的“一次性 MessagePort + transferable ArrayBuffer 到 Main”已被真实 Electron 43.2.0
Spike 否定：Preload sender 的 ArrayBuffer 虽已 detach，byte frame 未抵达 `MessagePortMain`，Main API 的
transfer list 也只承诺 `MessagePortMain[]`。

Revision 1 不把未经证明的替代路线写成生产实现，而是冻结三条候选路线、明确选择门槛，并只允许先执行
一个独立 Transport Decision Spike。当前推荐顺序：

1. **路线 A（首选验证）**：one-shot MessagePort + bounded structured-clone `Uint8Array`；
2. **路线 B**：隔离 sensitive consumer（sandboxed hidden renderer / utility boundary）接收可转移 bytes，
   再通过既有 Main↔Core fd4/fd5 binary Broker；
3. **路线 C**：新的 one-shot native/binary child transport，绕开 Renderer→Main byte clone。

路线 A 仅在进程级 Harness 证明完整交付、身份绑定、资源收口和泄漏边界后才能选用。它必须诚实承认
structured clone 可能产生无法可靠清零的 Electron/Chromium 内部副本，不能宣称 zero-copy 或所有副本已清零。
若路线 A 不满足门槛，必须回文档评审选择 B 或 C；禁止运行时自动 fallback。

## 2. 已证实事实与被撤回假设

### 2.1 已证实

- sandboxed Preload ↔ Main 的 MessagePort 双向控制握手可用；
- Main 可以从真实 IPC event 派生 exact `webContentsId` 与 main frame；
- Preload 对 transferable ArrayBuffer 的 sender-side detach 成立；
- Electron Main 的 transfer list 只承诺 `MessagePortMain[]`；
- Main ↔ Core fd4/fd5 binary Broker、one-shot Keychain helper、CRUD/Reveal Coordinator 已通过既有 QA。

### 2.2 明确撤回

- 撤回“Preload transferable ArrayBuffer ownership 可以直接转移到 Main”的设计结论；
- 撤回“sender detached 等于 Main 已收到 Secret”的证据解释；
- 撤回“Main 转移后无副本”的 zero-copy/可清零承诺；
- DFI-4A.4 主计划中相关文字由本 Revision 1 取代。

## 3. 不变量

1. Secret 不进入普通 `ipcRenderer.invoke/send` JSON payload、Core HTTP、Contract、SQLite、日志、
   Event、Audit、telemetry、snapshot、URL、argv、env、临时文件或剪贴板；
2. 不使用 Base64、hex、JSON String 或对象字段字符串化 Secret；
3. Main 只承担 process/frame identity guardian 与有界路由，不复制 CRUD/Reveal 业务状态机；
4. Core 的 safe `prepare()` 必须先完成，只有持久 prepared operation 才允许 sensitive mutation；
5. 每个 sensitive command 使用独立一次性 transport，不复用、不 fan-out、不广播、不合并 waiter；
6. Secret frame 绑定 exact runtime/client/command/correlation/webContents/main-frame/navigation epoch/request digest；
7. subframe、foreign webContents、stale navigation、stale runtime、重复或晚到 frame 全部失败关闭；
8. 本地可控 `Uint8Array`/Buffer 在职责结束后 `fill(0)`；不得据此声称 Electron/Chromium 内部副本可清零；
9. reveal 无 durable success Receipt，不自动 replay；mutation 只从 Core Operation Journal/Receipt 判断结果；
10. transport unavailable 时不宣布 mutation/reveal feature；safe catalog 可独立协商；
11. 不在运行时在 A/B/C 路线间自动降级；部署只启用一个已验证、版本锁定的 transport profile；
12. DFI-4A.4.1～4A.4.3 在 Transport Decision Audit 通过前继续 GATED。

## 4. 安全 envelope

### 4.1 Safe control plane

普通、无 Secret 的准备/状态命令继续走 versioned safe IPC/HTTP：

```text
prepare mutation/reveal
  -> Core validates authority/head/revision/material
  -> durable Transaction A or runtime reveal admission
  -> returns opaque sensitiveTransportTicket
```

Ticket 只绑定：

```text
schemaVersion
transportProfileRevision
runtimeInstanceId
clientInstanceId
commandId
correlationId
operationType
personalModelId
expectedConfigurationRevision
requestDigest
webContentsId
mainFrameRoutingId
navigationEpoch
expiresAt
ticketDigest
```

Ticket 不包含 Secret、credentialRef、owner digest、bearer、完整 Endpoint 或 helper path。Main 不信任
Renderer 自报的 webContents/frame/navigation 身份，而是从真实 event 与本地 registry 绑定。

### 4.2 Sensitive data plane

Sensitive frame 使用 strict binary envelope，header 与 body 分离：

```text
header: protocol/revision/command/correlation/type/bodyLength/frameDigest
body: Uint8Array Secret bytes
```

- body length 首期 `1..16384` bytes；delete/control frame body length 必须为 0；
- mutation/reveal 只允许单 body frame + 单 terminal acknowledgement；
- 不支持流式拼接、partial body、压缩、Content-Type 推断或多 Secret；
- header 不含 credentialRef、owner identity、Endpoint 或 Secret-derived hash；
- frame digest 只证明 transport envelope 与 non-secret identity，不以 Secret hash 建第二套 durable binding；
- Secret 与 prepared operation 的重绑冲突继续由 Keychain `inspect()` 和既有 Coordinator 判定。

## 5. 三条候选路线

### 5.1 路线 A：one-shot MessagePort + structured-clone Uint8Array

流程：

1. Main 建立 `MessageChannelMain`，仅向已验证 main frame 发送一个 port；
2. Preload 通过 port 发送 bounded `Uint8Array`，**不使用 transfer list**；
3. Main 验证 message 类型、typed-array brand、byteLength、ticket identity、single-frame state；
4. Main 将收到的本地 bytes 立即交给现有 `PersonalCredentialBrokerClient`；
5. Main 在 Broker settle/timeout/cancel 后清零可控 view 并关闭 port；
6. reveal 反向使用相同 one-shot structured clone，Main local view 在 post 后清零；Preload consumer
   读取后清零自身 bytes。

优点：改动最小，复用已证明的 MessagePort 控制身份与 fd4/fd5 Broker。  
限制：至少存在一次 structured clone；Electron/Chromium 内部副本生命周期不可验证、不可可靠清零；
Reveal UI 最终创建短生命周期 JS String 时也无法可靠清零。该剩余风险必须由威胁模型与用户接受。

路线 A 的选用门槛：当前 Electron 版本上的真实进程级 Harness 必须证明双向 byte delivery、严格身份绑定、
copy count 的可观测下界、所有应用层可控 buffer 清理、导航/崩溃/超时/late frame 终态以及四通道泄漏扫描。

### 5.2 路线 B：隔离 sensitive consumer

流程候选：

- Main 创建固定、隐藏、sandboxed、无 Node/preload capability 的 dedicated sensitive consumer；
- 业务 Renderer 只发 safe intent；一次性 port 将 Secret bytes 转移到该隔离边界；
- consumer 使用经过版本锁定的最小 native bridge 或 MessagePort 控制协议，将 bytes 交给 Main↔Core fd4/fd5；
- consumer 无 UI、无导航、无网络、无文件、无持久化、无 DevTools、无业务状态。

优点：可把敏感 bytes 与大型业务 Renderer 隔离，并可能保留 transfer ownership。  
风险：新增进程/renderer 攻击面、打包与生命周期复杂度，若 bridge 最终仍 structured-clone 到 Main 则没有
实质收益。必须证明不复制业务状态机、不扩大 Preload API、不形成第二个 Credential owner。

### 5.3 路线 C：one-shot native/binary child transport

流程候选：

- Preload 只通过固定 native binding/isolated child 的 one-shot handle 提交 bytes；
- binary child 与 Main/Core 通过匿名 pipe/OS handle 传输，不经普通 Electron JSON IPC；
- 身份/authorization 仍由 safe control plane + Main exact frame guardian 决定；
- child 不读取 Keychain、不做业务判断，只转发一个有界 frame 后退出。

优点：可以获得更明确的 binary ownership/lifecycle。  
风险：原生构建、签名、公证、平台兼容和供应链成本最高；可能与现有 Keychain helper 职责混淆。
除非 A/B 均不满足安全门槛，不建议首期采用。

## 6. 路线决策规则

| 条件 | 结论 |
| --- | --- |
| A 的真实 Harness 全部通过，且用户接受不可清零内部副本这一剩余风险 | 冻结 A 的 transport profile revision |
| A 无法稳定双向交付、身份绑定或资源收口 | A FAIL，回文档评审 B |
| B 只是把 structured clone 移到另一处、没有减少暴露面 | B 拒绝 |
| B 能证明隔离收益且不复制业务状态 | 可冻结 B，需独立打包/安全评审 |
| A/B 均失败 | 评审 C；不得临时改用 JSON/Base64/file |
| 任一路线证据不足 | 保留 `BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER` |

生产构建只包含一个 active transport profile。Profile 变化必须升级 revision 并重新跑全部 Harness；旧
runtime ticket 不得跨 profile 重放。

## 7. 生命周期与失败窗口

### 7.1 状态机

```text
created -> port_bound -> ready -> frame_received -> broker_dispatched
        -> terminal_delivered -> closed

任意非终态 -> cancelled | timed_out | navigation_invalidated | process_lost
```

每个 command 只允许一个 terminal；terminal 后 frame、ack、broker callback 均丢弃并记录安全计数。

### 7.2 命名窗口

| 窗口 | 故障位置 | 语义 |
| --- | --- | --- |
| S1 | safe prepare 前 | 零 sensitive ticket、零 Secret delivery |
| S2 | ticket 已发、port 未绑定 | ticket 到期，prepared mutation 按既有恢复分类 |
| S3 | port ready、Secret 未发送 | close/cancel；不得猜测用户输入 |
| S4 | Preload send 后、Main receive 前 | transport uncertain；mutation 查询 Journal，reveal 不重放 |
| S5 | Main receive 后、Broker dispatch 前 | 清零 Main local view；mutation按 prepared 恢复，reveal uncertain |
| S6 | Broker dispatch 后、terminal 前 | 复用 Coordinator/Reveal V1/V2 与 Keychain inspect，不从 IPC 猜测 |
| S7 | terminal send 后、Renderer receive 前 | mutation查询 durable Receipt；reveal不重放且返回 uncertain |
| S8 | navigation/close/Core restart/transport profile change | 失效全部旧 port/ticket/consumer，late frame 拒绝 |

## 8. Identity、并发与限额

- exact identity：`runtimeInstanceId/clientInstanceId/commandId/correlationId/webContentsId/
  mainFrameRoutingId/navigationEpoch/requestDigest/transportProfileRevision`；
- Renderer 不提供 `webContentsId/mainFrameRoutingId/navigationEpoch`；
- 同 command 第二次 port bind 拒绝；同 owner/model sensitive operation 单并发；全局 `<=4`；
- registry `<=256`，ticket TTL `5s`，terminal tombstone `10min`；
- reveal 继续沿用每 60 秒最多 5 次；mutation deadline 与 Keychain helper deadline 使用既有冻结值；
- oversize、wrong brand、SharedArrayBuffer、detached/zero-length、duplicate、partial、multi-frame 全拒绝；
- 不接收 arbitrary transferable、File/Blob/ReadableStream/MessagePort nesting。

## 9. Feature 与兼容性

- `personal_model_catalog` 与敏感 transport 解耦；只读 catalog 可单独 ready；
- `personal_model_mutation` / `personal_credential_reveal` 只有 transport profile、identity composition、
  helper descriptor、Broker 和 Coordinator 全部 ready 时才宣布；
- compatibility 只返回 profile revision 与 feature availability，不暴露 transport 内部实现；
- 旧客户端不见新 feature；不改 v1alpha1；
- transport unavailable 返回 typed `personal_credential_transport_unavailable`，不退化到普通 IPC。

## 10. 实施批次

### STRM-0：Transport Decision Spike（3～5 日）

- 只实现受控 Electron Harness，比较 A，必要时验证 B 的最小可行性；
- 不接生产 CRUD/reveal，不修改公开 Preload API；
- 输出真实 byte delivery、copy/lifetime、身份、失败窗口、泄漏与资源证据；
- 给出 `ROUTE_A_ACCEPTABLE` / `ROUTE_B_REVIEW_REQUIRED` / `TRANSPORT_REMAINS_BLOCKED`。

### STRM-1：选定路线 Contract/Adapter Foundation（4～7 日）

- 冻结 transport profile、ticket、binary envelope、registry、typed errors；
- 接入 Main/Preload 私有 adapter，但 production feature 默认 disabled；
- 独立 conformance，不接个人 CRUD/reveal UI。

### STRM-2：Mutation/Reveal production wiring（5～8 日）

- 接既有 safe prepare、fd4/fd5 Broker、Coordinator、Reveal Delivery；
- 完成 S1～S8、navigation/restart/timeout/late callback；
- 仍不修改 Renderer 页面。

### STRM-3：Unblock Audit（3～5 日）

- 真实 Electron process Harness、临时 Keychain、双向 mutation/reveal、资源归零、泄漏扫描；
- 输出 `SENSITIVE_TRANSPORT_READY` 或保留 blocker；
- 独立 QA + 用户接受后才允许 DFI-4A.4.2 重新申请编码授权。

估算合计：路线 A 为 **15～25 个集中工程日**；若转 B/C，必须重新估算，不沿用该数字。

## 11. QA 验收矩阵（60 项）

### 11.1 Delivery 与 identity（1～18）

1. current Electron 双向 byte delivery；
2. mutation Renderer→Main→Core；
3. reveal Core→Main→Preload；
4. exact webContents；
5. exact main frame；
6. subframe reject；
7. foreign window reject；
8. stale navigation reject；
9. stale runtime reject；
10. stale client reject；
11. wrong command reject；
12. wrong correlation reject；
13. wrong request digest reject；
14. wrong profile revision reject；
15. duplicate port reject；
16. duplicate frame reject；
17. late frame reject；
18. no fan-out/broadcast/merge。

### 11.2 Frame 与边界（19～31）

19. Uint8Array only；
20. SharedArrayBuffer reject；
21. Blob/File/Stream reject；
22. 0/1/max/max+1 length；
23. delete body zero；
24. partial frame reject；
25. multi-frame reject；
26. malformed header reject；
27. no Secret hash durable；
28. no Base64/hex/string conversion；
29. no ordinary invoke/send payload；
30. no HTTP/argv/env/file/persistence；
31. single active transport profile。

### 11.3 Lifecycle 与恢复（32～46）

32. S1；33. S2；34. S3；35. S4；36. S5；37. S6；38. S7；39. S8；
40. renderer crash；41. preload teardown；42. Main crash；43. Core crash；44. port close；
45. deadline/cancel single terminal；46. late Broker callback isolation。

### 11.4 Memory、泄漏与资源（47～60）

47. sender controlled buffer cleanup；
48. receiver controlled buffer cleanup；
49. Broker request/response cleanup；
50. reveal consumer cleanup；
51. UI short-lived String limitation documented；
52. raw canary four channels；
53. Base64 canary four channels；
54. URL-encoded canary four channels；
55. credential/endpoint/body/path marker classes；
56. port/registry/timer/listener/request/child/helper zero；
57. negative leak injection proves scanner fails；
58. Evidence allowlist；
59. no production fallback；
60. Workspace + Central online/offline serial gates。

## 12. 允许与禁止修改范围

本方案通过后仍不自动编码。STRM 子批获单独授权后，可按方案修改受控 Harness、Desktop Main/Preload
private adapter、shared private Contract 与 tests。明确禁止：

- Renderer 页面、公共 v1alpha1、Core HTTP Secret、Central、Document Worker、migration 1～24/25；
- DFI-2B、DFI-3、TGM；
- JSON/Base64/hex/argv/env/file/clipboard Secret；
- 新原生依赖、utility process 或打包设置，除非选择 B/C 后另行文档评审和授权；
- 与 Enterprise Identity blocker 在同一个生产编码批次并行落地。

## 13. 文档评审问题

1. 撤回 transferable ArrayBuffer 到 Main 的旧结论是否完整；
2. A/B/C 三路线与选择门槛是否足够明确；
3. 是否同意优先验证 structured-clone Uint8Array，但诚实接受内部副本不可清零；
4. 不允许运行时 fallback 是否正确；
5. exact identity、one-shot、limits 与 S1～S8 是否完整；
6. safe control plane 与 sensitive data plane 是否保持分离；
7. mutation durable replay 与 reveal no-replay 是否正确；
8. Threat Model 是否覆盖 compromised renderer/navigation/memory/log/crash；
9. STRM-0～3、60 项 QA 与工期是否可执行；
10. 给出 PASS / PASS_WITH_REVISIONS / FAIL 和 P0～P3 发现。

## 14. 当前门禁

```text
DFI-4A.4.0                                  PASS/CLOSED
Sensitive Renderer-Main Transport Revision 1 PLAN REVIEW PASS/CLOSED
STRM-0                                      DEVELOPER QA PASS / INDEPENDENT QA PENDING
STRM-1                                      IMPLEMENTED / DEVELOPER QA PASS / INDEPENDENT QA PENDING
STRM-2～STRM-3                              GATED
DFI-4A.4.1～DFI-4A.4.3                     GATED
DFI-2B / DFI-3 / TGM                        GATED
```

只有 STRM-3 独立 QA PASS 并由用户接受后，`BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER` 才能正式关闭。
