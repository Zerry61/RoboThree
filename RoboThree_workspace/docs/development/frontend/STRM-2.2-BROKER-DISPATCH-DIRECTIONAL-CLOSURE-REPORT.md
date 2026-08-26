# STRM-2.2 Broker Dispatch 与 Directional Closure 实施报告

> 日期：2026-08-23  
> 版本：`0.0.0-strm.2.2`  
> 状态：**PASS/CLOSED**

## 1. 交付结论

STRM-2.2 已把现有 one-shot Electron MessagePort 与现有 Main↔Core fd4/fd5
`PersonalCredentialBrokerClient` 做成受控的双向闭环：

- mutation：Preload internal seam → Main-issued authorization → exact MessagePort frame → Broker → terminal；
- reveal：Broker/`PersonalCredentialRevealDelivery` → Main-issued authorization → exact MessagePort frame →
  单一 Preload consumer → Main 预签发 acknowledgement；
- 每个 session 只允许一次 Broker dispatch，Broker pending coalescing 不作为 exactly-once 证明；
- callback 必须匹配 runtime、channel、client、navigation epoch 与 dispatch ordinal，否则只做 late cleanup；
- transport `completed` 不生成 durable business Receipt，也不证明用户已经看见 reveal Secret。

本批最高只输出 `STRM22_BROKER_DIRECTIONAL_CLOSURE_CONFORMANT`。production feature、business handler、
sensitive transport ready 与 blocker 状态全部保持关闭/未解除。

## 2. 实现

### 2.1 Private Frame Authorization

- 新增 strict private request/authorization Contract；
- authorization 绑定 Ticket、runtime/client、command/correlation、window/frame/navigation、方向、长度、
  frame digest 与 expiry；
- 使用 Main-private 256-bit key 与独立 HMAC domain；
- digest 只覆盖 non-secret material，不包含 Secret、Secret hash、Credential Reference、owner 或 Endpoint；
- reveal 的 completed/uncertain acknowledgement 由 Main 预签发，Preload 不自造 crypto。

### 2.2 Directional Controller

- 扩展单一 Main/Preload session state machine；
- 新增 Main-private current Broker lease provider，读取 `CorePrivateSupervisor` 当前 ready runtime/channel/client；
- mutation accepted body 在 Broker client 同步复制后立即清零，不保留到 operation terminal；
- reveal completed 必须已经经过单 consumer acknowledgement，缺失/空 Secret 不得投影 completed；
- navigation、port close、cancel、deadline、Core restart、Main shutdown 共用 terminal/cleanup gate；
- 旧 lease 或旧 navigation 的 late result 不投影新 session。

### 2.3 Production Boundary

- production Main/Preload entry 只装配 private internal wiring且 `foundationEnabled=false`；
- 未新增 public `ipcMain.handle`、`contextBridge` 个人模型 API 或 Renderer import；
- production Core Broker handler仍保持 typed unavailable；
- 未修改 Core业务 Coordinator、migration 1～24、Central、Document Worker、依赖或 lockfile。

## 3. Harness 与证据

`harness:strm2.2`：

- 8 个 focused files / 53 tests；
- 真实 Electron 4 个进程场景：`production_disabled`、`mutation_completed`、`reveal_completed`、
  `broker_rejected`；
- controlled Broker mutation/reveal `executeCount=1`；
- STRM-2.1（含 STRM-0 14-run scanner/resource evidence）回归通过；
- DFI-4A.2 sensitive Broker 与 owner reveal 回归通过；
- 输出 `STRM22_BROKER_DIRECTIONAL_CLOSURE_CONFORMANT`，同时固定 production 四项状态为 false。

## 4. 开发者门禁

严格串行结果：

| 门禁 | 结果 |
| --- | --- |
| `harness:strm2.2` | PASS：8 files / 53 tests + Electron 4 scenarios |
| `check` | PASS：236 files / 1572 tests + 3 smoke |
| Central online | PASS：307/0/0/0 / BUILD SUCCESS |
| Central offline | PASS：307/0/0/0 / BUILD SUCCESS |

受限沙箱内首次完整 Workspace 尝试因 loopback bind 与隔离 macOS Keychain 权限被系统拒绝；在非沙箱环境
从零重跑后全绿。Central 首次调用仅因 shell 未设置 JDK 21 而在构建前停止，显式使用项目既定 JDK
21.0.12 后 online/offline 均全绿。两项均为环境前置，不是代码失败。

## 5. 当前门禁

- STRM-2.2：独立 QA `PASS（P0=0 / P1=0 / P2=0 / P3=2）`，两个 P3 均不阻断；用户已正式接受并关闭；
- STRM-2.3、STRM-3、EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM：继续 `GATED`；
- 本批不构成 production personal model CRUD/reveal ready，也不关闭 transport blocker。

STRM-2.3 详细方案后续已形成并进入文档评审；该计划不自动获得编码授权。
