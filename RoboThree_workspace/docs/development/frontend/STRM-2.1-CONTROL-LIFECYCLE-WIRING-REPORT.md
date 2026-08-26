# STRM-2.1 Control Contract 与 Electron Lifecycle Wiring 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-23  
> 版本：Root / Contracts / Desktop `0.0.0-strm.2.1`  
> 负责人：Codex 5.6

## 1. 结论

STRM-2.1 已实现 private control Contract、Main production lifecycle controller、Preload internal receiver、
Main-derived navigation epoch、one-shot `MessageChannelMain` session 与真实 Electron 生命周期 Harness。

本批只证明 Control/Lifecycle Foundation 可接入 production entry，并明确保持：

```text
productionFeatureEnabled=false
productionSensitiveTransportReady=false
productionBusinessHandlerReady=false
transportBlockerClosed=false
brokerDirectionalClosureImplemented=false
rendererBusinessApiExposed=false
```

因此本批不关闭 STRM-2，不开放个人模型 CRUD/reveal，不接 Broker directional closure，不进入
STRM-2.2/2.3，也不把 transport lifecycle terminal 当作业务 Receipt。

## 2. 实现范围

### 2.1 Private control Contract

- 在既有 `desktop-private/personal-credential-transport-v1` additive 增加 strict control material/message；
- control 类型固定为 `ready | terminal_ack | cancel`；terminal 固定为
  `completed | rejected | cancelled | timed_out | uncertain`；
- terminal 与 typed error 采用严格组合校验，completed 禁止 error，其他 terminal 必须使用对应 typed code；
- Port Offer 只携带 Ticket 与 Main 预计算的 exact-ticket-bound ready/cancel control，不携带 owner、
  Credential Reference、Endpoint、Secret、业务 Receipt 或内部异常；
- prepared command 是 Main-private composition seam，不从 Renderer 直接创建。

### 2.2 Main production controller

- production `main/index.ts` 装配 `PersonalCredentialTransportProductionController`，默认
  `foundationEnabled=false`；
- 从真实 Electron event 派生 exact `webContentsId/mainFrameRoutingId`，维护 monotonic navigation epoch；
- 只允许已登记、存活的 exact main frame 打开 prepared command；
- 每个 command 创建一个 one-shot `MessageChannelMain` session，绑定 Ticket、deadline、navigation 和
  runtime/client/command/request identity；
- main-frame navigation、in-page navigation、renderer crash、webContents destroy、deadline 与 shutdown
  都执行有界失效和资源清理；
- 拒绝 nested port、malformed/duplicate/foreign control，并清零可控 byte body；
- 未实现 mutation/reveal Broker dispatch，也未读取 owner、entitlement、Credential 或 helper descriptor。

### 2.3 Preload internal receiver

- production `preload/index.ts` 装配 receiver，默认 `foundationEnabled=false`；
- receiver 仅订阅 private port channel，不通过 `contextBridge` 暴露业务 API；
- 严格要求单一 port、单一 command session、5 秒 Ticket deadline、256 项 registry 上限和 10 分钟
  tombstone；
- ready/cancel 只使用 Main 已签发且与 Ticket 精确绑定的 control；
- duplicate/replay/malformed/nested-port/close/deadline 均失败关闭并清理 port/timer/session。

## 3. 编码期事实与决策

真实 sandboxed Electron Preload 验证表明，当前运行环境不能把 `globalThis.crypto.subtle` 作为稳定可用
能力。STRM-2.1 没有因此引入自研密码算法、普通 JSON IPC、Base64/hex 或弱化 digest 校验，而是采用：

1. Main 使用 Node `crypto` 预计算不含 Secret 的 ready/cancel control digest；
2. control 与 exact Ticket 的 command/correlation/profile 绑定后随 Port Offer 发送；
3. Preload 只在 one-shot capability port 上回送对应 control；
4. Main 对回送 control 重新计算 digest 并使用 constant-time comparison 校验。

该方案只适用于 non-secret lifecycle control。STRM-2.2 不得假设 sandbox Preload WebCrypto 可用；
mutation/reveal frame digest 必须沿用经过评审的 Main-issued non-secret proof，或另行提交替代设计，禁止在
编码时静默新增自研 crypto 或弱化 Secret frame 校验。

## 4. 边界

- 修改范围：private Contract subpath、Desktop Main/Preload private lifecycle foundation、专项 tests/Harness、
  production entry 的 disabled wiring、版本与治理文档；
- 未修改 Core、Central、Document Worker、Renderer、公共 Desktop Contract、migration 1～24、依赖或
  `pnpm-lock.yaml`；
- 未注册 `ipcMain.handle` 业务接口，未新增 `contextBridge` API，未创建 Fake owner、Fake Coordinator、
  Fake Broker success 或 production-ready claim；
- STRM-2.2、STRM-2.3、STRM-3、EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B/3 与 TGM 继续 GATED。

## 5. 开发者验证

- `CI=true pnpm run harness:strm2.1`：PASS；private Contract/lifecycle **4 files / 31 tests**；
  真实 Electron **5 scenarios**（production disabled、ready/cancel、hash navigation、renderer crash、
  foreign window）；STRM-0 Route A **14-run** 回归；敏感命中 0；八类资源归零；
- `CI=true pnpm run lint`：PASS，Architecture boundary checks passed；
- 受限沙箱首次 Workspace 运行因 `listen EPERM 127.0.0.1` 与 isolated Keychain 权限失败，未计入通过；
  在非沙箱从零串行复跑 `CI=true VITEST_MAX_WORKERS=1 pnpm run check`：PASS，
  **234 files / 1558 tests + 3 smoke**；
- JDK 21 Central online：PASS，**307/0/0/0 / BUILD SUCCESS**；
- Central offline 首跑出现既有 `Cgf2a3DualNodeModelRecoveryIntegrationTest` 子进程退出时序错误；
  从零完整复跑后 PASS，**307/0/0/0 / BUILD SUCCESS**；首次失败记录保留，不将复跑解释为本批修复了
  Central 时序问题。

## 6. 独立 QA 与用户接受

- Claude Code 独立 QA 串行复跑 Harness、Workspace、Central online/offline 全绿，结论
  `INDEPENDENT_QA_PASS`（P0=0、P1=0、P2=0、P3=0）；
- 用户已于 2026-08-23 正式接受独立 QA 结论，STRM-2.1 `PASS/CLOSED`；
- STRM-2.2 仅进入独立详细方案评审，未由本批自动获得编码授权。
