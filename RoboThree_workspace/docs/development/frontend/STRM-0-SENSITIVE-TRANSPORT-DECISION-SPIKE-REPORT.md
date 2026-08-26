# STRM-0 Sensitive Transport Decision Spike 报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 开发版本：Root `0.0.0-strm.0`  
> 方案依据：[Sensitive Renderer↔Main Transport Revision 1](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-REVISION-1.md)  
> 威胁模型：[Sensitive Renderer↔Main Transport Threat Model](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-THREAT-MODEL.md)

> 后续状态注记（2026-08-22）：STRM-0 关闭后，用户已单独授权并完成 STRM-1 Foundation 开发者门禁；
> 本报告第 5、7 节保留的是 STRM-0 批次关闭时的范围与后续门禁，不代表 STRM-1 当前仍未实施。

## 1. 结论

STRM-0 的唯一路线决策输出为：

```text
ROUTE_A_ACCEPTABLE
```

该结论只表示 Electron 43.2.0 当前基线上的路线 A——one-shot MessagePort + bounded
structured-clone `Uint8Array`——满足进入 STRM-1 Contract/Adapter Foundation 评审的技术门槛。

本批明确不输出 `SENSITIVE_TRANSPORT_READY`，不关闭
`BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER`，不宣布个人模型 mutation/reveal feature ready。Transport
blocker 只能由未来 STRM-3 Unblock Audit 的独立 QA 和用户接受关闭。

STRM-0 已由 Claude Code 独立 QA 确认 P0～P3 全 0，并由用户于 2026-08-22 正式接受关闭。用户同时
显式接受 structured-clone 内部副本不可枚举、不可可靠清零的残余风险，但不将其解释为 zero-copy 或
production ready。

## 2. 路线 A 的真实证据

### 2.1 双向交付与副本事实

- 真实 sandboxed Preload → `MessagePortMain` structured-clone `Uint8Array` 交付成立；
- 真实 Main → sandboxed Preload structured-clone `Uint8Array` 反向交付成立；
- mutation 与 reveal 均完成三轮 fresh Electron process 重放；
- 发送端 post 后原 typed array 未 detach 且内容仍存在，接收端同时得到独立 typed array，因此应用层可观察
  副本下界为 **2**；
- 发送端与接收端各自持有的 typed array 均在职责结束后 `fill(0)`；
- Electron/Chromium structured-clone 内部副本不可枚举、不可可靠清零；本批明确
  `zeroCopyClaimed=false`、`structuredCloneInternalCopiesReliablyClearable=false`。

因此路线 A 的安全主张是“有界交付 + 最小暴露 + 可控对象清零”，不是 zero-copy，也不是全内存清零证明。

### 2.2 Identity 与失败关闭

受控 Harness 的 identity 只由 Main 从真实 IPC event 派生 `webContentsId` 与 main-frame routing identity，
不接受 Renderer 自报。矩阵真实覆盖：

- foreign window ready 被拒绝且不取得 port；
- wrong command identity 在消费前拒绝；
- duplicate frame 单 winner、第二帧拒绝；
- wrong brand、zero length、max length、max+1 length；
- navigation invalidation、Renderer crash、port close、deadline；
- terminal 后不重放 Secret，不启用 A/B/C runtime fallback。

STRM-0 不是生产 registry，因此未在本批实现完整 S1～S8 production state machine；这些仍属于 STRM-1～3。

### 2.3 泄漏与资源

- 四通道：parent stdout、child stderr、machine evidence、safe trace；
- 五类 marker：canary、credential、provider endpoint、content body、absolute path；
- 四种形态：raw、Base64、逐字节 URL percent encoding、hex；
- **80 次负向注入全部被 scanner 捕获**；真实 Harness 四通道 match count 全 0；
- 每个 Electron 场景结束时 window/port/timer/ipc listener/request/registry/child/helper 八类资源均为 0。

## 3. 场景矩阵

```text
roundtrip x3
foreign_window
wrong_identity
duplicate
wrong_brand
zero_length
max_length
oversize
navigation_invalidated
renderer_crash
port_close
deadline
```

共 **14 次真实 Electron 子进程运行 / 12 个唯一场景 / 3 次 roundtrip 重放**。

## 4. 交付范围

- `scripts/run-strm0-harness.mjs`：父 Harness、独立 Electron 场景编排和最终决策证据；
- `scripts/run-strm0-route-a-electron.mjs`：隐藏 Main 进程 fixture；
- `scripts/strm0-route-a-preload.cjs`：sandboxed Preload fixture；
- `scripts/strm0-evidence.mjs` 与测试：严格 evidence、四通道 scanner、负向注入和边界扫描；
- root `harness:strm0` 命令与本报告/治理状态。

## 5. 明确未实现

- production Main/Preload sensitive adapter 或公开 Preload API；
- Renderer 页面、API Key 输入、个人模型 CRUD/reveal UI；
- safe ticket Contract、production registry、S1～S8 完整状态机；
- fd4/fd5 Broker、Keychain、Coordinator 或 Reveal production wiring；
- A/B/C runtime fallback；
- EIPC-1～EIPC-3、STRM-1～STRM-3、DFI-4A.4.1～4A.4.3；
- migration、依赖、Central/Document Worker 生产代码。

## 6. 开发者验证

- 环境：Node `24.13.0`、pnpm `11.11.0`、Electron `43.2.0`、JDK `21`；正式门禁严格串行；
- `CI=true pnpm run harness:strm0`：PASS（evidence tests **1 file / 5 tests**；真实 Electron
  **14 runs / 12 scenarios / 3 roundtrip replays**；四通道敏感命中 0；80 次负向注入命中；八类资源归零）；
- `CI=true pnpm run lint`：PASS，Architecture boundary checks passed；
- `CI=true VITEST_MAX_WORKERS=1 pnpm run check`：PASS（**230 files / 1527 tests + 3 smoke**）；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central`：
  PASS（**307/0/0/0 / BUILD SUCCESS**）；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central:offline`：
  PASS（**307/0/0/0 / BUILD SUCCESS**）。

根版本切换触发 pnpm workspace 依赖校验；受限网络首次安装被中止，随后使用
`pnpm install --frozen-lockfile` 恢复既有本地依赖，`downloaded 0`，`pnpm-lock.yaml` 未修改。

## 7. 下一道门禁

1. 交 Claude Code 做只读独立 QA；
2. 只有独立 QA PASS 且用户接受后，STRM-0 才能正式 `PASS/CLOSED`；
3. STRM-1～STRM-3、EIPC-1～EIPC-3 与 DFI-4A.4.1～4A.4.3 继续 GATED；
4. STRM-0 被接受后，是否进入 STRM-1 仍需用户单独授权。
