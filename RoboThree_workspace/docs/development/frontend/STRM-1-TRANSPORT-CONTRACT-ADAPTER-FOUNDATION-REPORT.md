# STRM-1 Transport Contract / Adapter Foundation 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 开发版本：Root / Contracts / Desktop `0.0.0-strm.1`  
> 上游：STRM-0 `PASS/CLOSED`，路线 A 残余风险已由用户显式接受  
> 方案依据：[Sensitive Renderer↔Main Transport Revision 1](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-REVISION-1.md)  
> 威胁模型：[Sensitive Renderer↔Main Transport Threat Model](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-THREAT-MODEL.md)

## 1. 结论

STRM-1 已实现并通过开发者门禁，输出：

```text
STRM1_CONTRACT_ADAPTER_FOUNDATION_CONFORMANT
```

该结论只表示选定路线 A 的私有 Contract、Ticket、Binary Envelope、Registry、typed errors 与
Main/Preload Adapter Foundation 已可供 STRM-2 评审使用。它不表示 production sensitive transport ready，
不关闭 `BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER`，不开放个人模型 CRUD/reveal UI，也不接 fd4/fd5 Broker。

## 2. 实现

### 2.1 私有 Contract

新增仅通过 private subpath 导出的
`@robothree/contracts/desktop-private/personal-credential-transport-v1`：

- 单一 active profile：`personal-credential.route-a.structured-clone.v1`；
- 明示 `structuredCloneUsed=true`、`zeroCopyClaimed=false`、内部副本不可可靠清零、无 runtime fallback、
  production feature 默认关闭；
- HMAC Ticket material 精确绑定 runtime/client/command/correlation/operation/model/configuration/request/
  webContents/main-frame/navigation/expiry；
- Ticket 不含 Secret、Credential Reference、owner identity、Endpoint 或 helper path；
- strict binary envelope 仅允许 `header + Uint8Array body`，Secret body 为 `1..16384` bytes，control body
  必须为 0；拒绝额外字段、错误 brand、SharedArrayBuffer、detached、空 Secret、长度不一致和超限；
- frame digest 只绑定 non-secret envelope identity，不包含 body、Secret hash 或第二套 Credential binding；
- 冻结 unavailable/profile/identity/expiry/busy/duplicate/replay/frame/navigation/process/deadline typed errors。

### 2.2 Main 私有 Foundation

新增未注册到 production Main entry 的 `PersonalCredentialTransportMainAdapter`：

- 默认 `foundationEnabled=false`，snapshot 固定
  `productionFeatureEnabled=false / transportBlockerClosed=false`；
- Main 私有 256-bit HMAC key 签发 Ticket，runtime restart/adapter close 后 key 清零、旧 Ticket 失效；
- Registry `<=256`、active `<=4`、Ticket TTL 5 秒、terminal tombstone 10 分钟；
- 同 model operation 单并发、reveal 每 60 秒最多 5 次，不合并 waiter、不允许第二次 port bind；
- bind 时重验 Main-derived exact identity，不接受 Renderer 自报窗口/frame/navigation；
- 方向严格分离：Main 只接收 create/update 的 `mutation_secret`，只生成 reveal 的
  `reveal_secret`，不允许 Renderer 向 Main 注入 reveal bytes；
- navigation、timeout、process close、duplicate、late/replay 全部失败关闭；
- `completed` 只有在一个 strict frame 已收敛后才能成立。

### 2.3 Preload 私有 Foundation

新增未导入 production Preload entry、未通过 `contextBridge` 暴露的
`PersonalCredentialTransportPreloadAdapter`：

- 默认 disabled；只接收 `Uint8Array`，不提供 String/Base64/hex API；
- mutation 使用 structured-clone message，无 transfer list；发送结束或失败均清零调用方交付的 typed
  array；
- reveal 只调用单一受控 consumer，完成/失败后清零接收端 application copy；
- command 一次性 tombstone 有界为 256 项/10 分钟，拒绝 duplicate/replay；
- 不注册 IPC channel、不调用 Broker、不触碰 Renderer 页面或业务状态机。

## 3. 安全与边界

- production Main `index.ts`、production Preload `index.ts` 与公共 Contract root 均不导入本 Foundation；
- Renderer boundary 扩展为禁止导入任意 `@robothree/contracts/desktop-private/*`；
- 未修改 Core、Central、Document Worker、Renderer、migration 1～24 或 `pnpm-lock.yaml`；
- 未接个人模型 safe prepare、CRUD、reveal delivery、fd4/fd5 Broker、Keychain、public Desktop API；
- 未新增依赖、utility process、native binding、runtime fallback 或第二种 transport profile；
- 用户接受的 structured-clone 内部副本不可枚举/不可可靠清零风险被保留，不被重新解释为 zero-copy。

## 4. 开发者验证

- `CI=true pnpm run harness:strm1`：PASS；private Contract/Main/Preload **2 files / 16 tests**；复跑
  STRM-0 真实 Electron **14 runs / 12 scenarios / 3 roundtrip**；四通道敏感命中 0；八类资源归零；
- Harness 最终 evidence：`productionSensitiveTransportReady=false`、
  `productionFeatureEnabledByDefault=false`、`electronMessagePortBlockerClosed=false`、
  `personalModelCrudWired=false`、`credentialRevealUiWired=false`、`runtimeFallbackEnabled=false`；
- 沙箱内 Electron 被 macOS 以 `SIGABRT` 阻止启动；相同代码在非沙箱真实 Electron 环境复跑通过，未修改
  场景或延长超时规避；
- `CI=true pnpm run lint`：PASS，Architecture boundary checks passed；
- `CI=true pnpm run check`：PASS（**232 files / 1543 tests + 3 smoke**）；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm --config.verify-deps-before-run=false run check:central`：
  PASS（**307/0/0/0 / BUILD SUCCESS**）；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm --config.verify-deps-before-run=false run check:central:offline`：
  PASS（**307/0/0/0 / BUILD SUCCESS**）；
- 首次 Central shell 未设置 `JAVA_HOME`，门禁在测试启动前失败；显式使用仓库要求的 JDK 21 后，online/offline
  均从零串行复跑通过，未把未启动的尝试计为产品或测试失败。

## 5. 下一门禁

- Claude Code 独立 QA 已 PASS（P0～P3 全 0），用户已于 2026-08-22 正式接受并关闭 STRM-1；
- 下一步只进入 [STRM-2 Production Wiring 详细方案](./STRM-2-PRODUCTION-WIRING-DEVELOPMENT-PLAN.md)
  文档评审，不自动编码；
- STRM-2/STRM-3、EIPC-1～EIPC-3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3 与 TGM 继续 GATED；
- STRM-2 必须单独输出 production wiring 详细方案并评审，不得由本批自动进入编码。
