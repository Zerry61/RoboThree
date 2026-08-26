# Sensitive Renderer↔Main Transport Threat Model

> 状态：**DOCUMENT REVIEW PASS/CLOSED；STRM-0～STRM-2 PASS/CLOSED；STRM-3 GATED**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 适用方案：[Sensitive Renderer↔Main Transport Revision 1](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-REVISION-1.md)  
> 保护对象：个人模型 API Key mutation bytes 与 owner-only reveal bytes

## 1. 安全目标

1. Secret 只交付给发起命令的 exact main frame 和已准备的 Core operation；
2. compromised renderer 不能扩大 authority、选择 credentialRef、重绑 operation 或窃取另一窗口 reveal；
3. Main 不成为 Credential 业务事实源，只做 process/frame binding 与有界 byte routing；
4. crash、timeout、navigation、duplicate、late callback 不制造第二次 mutation/reveal 或假成功；
5. 应用层可控 bytes 尽快清零，且诚实披露 Electron/Chromium/JS 内部副本不可可靠清零；
6. Secret 不落 durable store，不进入普通 IPC/HTTP/日志/诊断/证据；
7. transport 证据不足时功能 fail-closed，而不是降级到更弱通道。

## 2. 资产

- 用户刚输入的个人 API Key bytes；
- Keychain 中解析出的 reveal bytes；
- sensitive transport ticket 与 command identity；
- exact webContents/main-frame/navigation binding；
- prepared Operation Journal 与 reveal admission；
- runtime/client/profile revision；
- helper/Broker/Core 之间的 fd4/fd5 binary channel；
- 不含 Secret 的 terminal outcome 与资源/泄漏证据。

## 3. 信任边界

```text
Renderer main world (不可信业务输入/XSS 风险)
  -> context-isolated Preload (最小校验与编码)
  -> Electron MessagePort / selected sensitive transport
  -> Main identity guardian (受信任但不拥有业务事实)
  -> fd4/fd5 Broker client
  -> Core Broker server + Coordinator/Reveal service (业务 authority)
  -> one-shot signed Keychain helper
  -> macOS Keychain
```

### 3.1 信任假设

- Electron、Chromium、操作系统、签名后的应用二进制与 Keychain 属于 TCB；
- Main/Core 被完全攻陷时，进程内 Secret 无法由本方案继续保密，该情形不宣称可防；
- Renderer 可能被 XSS、恶意页面状态或错误组件控制，因此其 identity/authority 字段均不可信；
- Preload 代码受签名应用控制，但必须按最小 API 与 context isolation 设计；
- 用户主动输入/查看 Key 是产品已接受行为，UI 中短生命周期 JS String 不可可靠清零。

### 3.2 非目标

- 防御内核、Electron/Chromium 0-day、root 用户或已注入 Main/Core 的恶意代码；
- 宣称所有内存副本可被枚举或可靠清零；
- 通过 transport 自身决定 owner、entitlement、head/revision 或 Credential binding；
- 企业 Credential reveal；
- 屏幕录制、相机、恶意键盘驱动或系统级剪贴板监听。

## 4. 攻击面与缓解

| ID | 威胁 | 影响 | 必须缓解 | 剩余风险 |
| --- | --- | --- | --- | --- |
| T1 | Renderer 伪造 webContents/frame | 跨窗口读取/写入 Secret | Main 从真实 event 派生 identity；main-frame only | Main 被攻陷不在防护范围 |
| T2 | subframe 发起敏感命令 | 恶意 iframe 获取能力 | subframe hard reject；不接受 origin 自报 | Chromium frame identity 依赖 TCB |
| T3 | navigation 后复用旧 port/ticket | 新页面继承旧 authority | navigationEpoch + port close + tombstone | crash 窗口保留 uncertain |
| T4 | command/request digest 替换 | Secret 绑定到另一 operation | exact ticket、single use、Core prepared operation 重验 | 无 |
| T5 | credentialRef 注入 | 覆盖/读取其他 Credential | Secret frame不含 ref；Core 从 durable operation/head解析 | 无 |
| T6 | replay/duplicate frame | 重复 Keychain mutation/reveal | one-shot state machine、command tombstone、duplicate reject | mutation transport I/O 仍按既有恢复分类 |
| T7 | pending waiter 合并/fan-out | 一个 Secret 发给多个 consumer | 每 command 单 port、reveal busy、不合并、不广播 | 无 |
| T8 | oversized/partial/malformed frame | DoS/解析混乱/残留 bytes | 16KiB 上限、single frame、strict brand/length/header | 有界内存占用 |
| T9 | JSON/Base64/错误格式回退 | Secret 被字符串化/日志化 | 禁止普通 IPC/HTTP/argv/env/file；静态扫描 | 新代码需持续守门 |
| T10 | structured clone 内部副本 | Secret 残留在不可控内存 | 有界 payload、短生命周期、应用层清零、无缓存 | **接受前必须显式承认不可可靠清零** |
| T11 | UI JS String | Reveal/Input Secret 无法清零 | 局部组件、单实例、短 TTL、hide/unmount/navigation 释放 | JS runtime 内部副本不可控 |
| T12 | log/error/telemetry/snapshot | 持久泄漏 | allowlist evidence、固定错误、四通道多编码 scanner | OS crash dump 需部署策略另管 |
| T13 | timeout 后用户重试 | 重复 mutation/reveal | mutation查 Journal/Receipt；reveal no replay + uncertain | I/O 已发生但响应丢失时用户看不到 Key |
| T14 | late Broker callback | 覆盖新终态/重发 Secret | terminal gate + identity check + local bytes cleanup | 无 |
| T15 | Main/Core/Renderer crash | bytes/port/resource 泄漏 | process teardown、TTL、startup registry empty、durable recovery | OS/VM memory 回收不可验证清零 |
| T16 | port substitution/theft | foreign consumer 收到 Secret | port 与 ticket/exact frame/runtime/profile 绑定 | Electron TCB |
| T17 | transport profile downgrade | 切到弱通道 | 单 active profile、version lock、无 runtime fallback | 运维误配置由签名配置治理 |
| T18 | helper 替换 | Secret 送入恶意 binary | canonical containment/no-symlink/owner/mode/digest/codesign/team | 正式 packaging 尚是独立门槛 |
| T19 | Keychain locked/unavailable | 误判成功/重复写 | typed unavailable + inspect/recovery，不猜测 | 用户需解锁后重试/恢复 |
| T20 | DevTools/extension 注入 | Renderer Secret 可见 | production DevTools/extension policy、局部 UI state | 用户输入所在 renderer 本身可见 Secret |
| T21 | clipboard | Secret 长期留存 | 产品无复制按钮，代码禁止自动 clipboard write | 用户手工系统行为非本方案控制 |
| T22 | network exfiltration from Renderer | 输入 Key 被恶意页面外发 | CSP/无任意 fetch、Preload最小API、renderer安全扫描 | Renderer 完全攻陷时输入阶段风险仍存在 |
| T23 | safe prepare 与 data frame 竞态 | 未授权 Secret 进入 Broker | prepared ticket first；Broker not_prepared fail-before-Keychain | Secret可能短暂到达Main内存但不进入Keychain |
| T24 | owner/session 收窄竞态 | 权限撤销后继续 reveal | Core execute/reveal 前重新校验 authority/head/revision | 已完成展示无法撤回 |

## 5. 数据最小化

### 5.1 Sensitive frame 允许

- protocol/profile revision；
- commandId/correlationId；
- operation type；
- bounded body length；
- Secret bytes；
- transport-local terminal status。

### 5.2 Sensitive frame 禁止

- enterpriseId/userId/deviceId/owner digest；
- credentialRef/credential binding；
- bearer/refresh token/Device Trust proof；
- personal model full Endpoint；
- helper path、workspace path、PID、port；
- Prompt、Conversation、Provider response；
- Secret-derived persistent hash/checksum。

## 6. 内存生命周期

### 6.1 Mutation

```text
UI local String
  -> Preload TextEncoder local Uint8Array
  -> selected transport copy/transfer
  -> Main local Uint8Array
  -> fd4 request Buffer
  -> Core request body
  -> helper stdin/body
  -> Keychain API
```

每层只能持有完成职责所需的最短时间。可控 `Uint8Array/Buffer` 在成功、失败、cancel、timeout、throw、
navigation 与 shutdown 的 `finally` 中清零。UI String 只释放引用，不声称物理清零。

### 6.2 Reveal

```text
Keychain API
  -> helper response bytes
  -> Core Broker response
  -> Main local Uint8Array
  -> selected transport
  -> Preload/Renderer local bytes
  -> short-lived UI String
```

Reveal 不进入 durable Receipt，不创建可重放 body。V1/V2 或 transport S4～S8 不能自动重新 resolve。

### 6.3 Structured-clone 特有披露

若最终选择路线 A：

- 至少存在发送端对象、序列化内部表示、接收端对象中的一个或多个内存副本；
- 应用只能清零它持有的 typed array，不能证明 Chromium serializer 内部副本被清零；
- 选择 A 是“最小暴露 + 有界生命周期”的工程取舍，不是 zero-copy 安全保证；
- 该剩余风险必须进入 ADR/用户接受记录，不能只留在测试注释。

## 7. Abuse case

1. 恶意 Renderer 用另一个 modelId 重放旧 ticket → Main/Core identity mismatch；
2. iframe 请求 reveal → subframe reject，Keychain resolve count=0；
3. 用户点击 reveal 后立即导航 → port invalidated，late bytes 丢弃并清零；
4. attacker 连续创建 1,000 个 ports → registry/global concurrency/rate limit fail-closed；
5. 构造 20MiB typed array → size reject before Broker；
6. 用 Base64 String 模拟 bytes → brand reject；
7. 同 command 并发发送两帧 → 首帧单 winner，第二帧 duplicate reject；
8. timeout 后重复 reveal → tombstone/replay forbidden；
9. timeout 后重试 mutation → 查询 Operation Journal/Receipt，不从 transport 猜测；
10. helper descriptor 被 symlink 替换 → Core trust check fail-closed；
11. owner entitlement 在 prepare 后收窄 → execute/reveal Core 重检拒绝；
12. transport profile revision 变化 → 旧 ticket/port 全失效。

## 8. 安全验收门槛

以下任一不成立，transport blocker 继续保留：

- exact main frame、navigation epoch、runtime/client/command/profile identity 全部可验证；
- 当前 Electron 版本 mutation/reveal bytes 双向可稳定交付；
- no ordinary JSON/HTTP/Base64/hex/argv/env/file/persistence；
- 应用层可控 buffers 的所有 terminal 分支均清零；
- S1～S8、crash/navigation/late callback 都有真实进程断言；
- 四通道 × raw/Base64/URL-encoded × credential/endpoint/body/path/canary 扫描为 0；
- scanner 负向注入能真实失败；
- port/timer/listener/request/registry/child/helper 归零；
- structured-clone 剩余风险已在 ADR/评审中显式接受；
- production 无 fallback，feature negotiation 失败关闭。

## 9. 待评审残余风险

| 风险 | 当前建议 |
| --- | --- |
| structured clone 内部副本不可清零 | 路线 A 仅在用户接受此残余风险后可用 |
| UI String 不可清零 | 保持局部、短 TTL、无缓存/clipboard/telemetry；属于已知平台限制 |
| Main/Core 完全攻陷 | 不在本 transport 可防范围；依赖签名、sandbox、供应链和 OS 防护 |
| crash dump / swap | 由生产部署与 OS hardening 另行治理，不伪装本批已关闭 |
| helper production packaging | 仍是 DFI-4A.4.2 独立前置门槛 |
| Renderer 输入阶段 XSS | 依赖 DFE/CSP/无任意网络与渲染安全；Transport 不扩大但不能消除 |

## 10. 当前门禁

本威胁模型只进入文档评审。未经 Revision 1 方案评审、路线 Spike、独立 QA 和用户接受，不得修改
生产 Main/Preload/Core，不得宣布 mutation/reveal ready，也不得解除 DFI-4A.4.1～4A.4.3 门禁。
