# DFI-4A.0 Personal Credential Threat Model

> 状态：**REPAIR.1 USER ACCEPTED / PASS/CLOSED；当前 DFI-4A.1 REVISION 3.3 CODING AUTHORIZED / IN PROGRESS；DFI-4A.2+ GATED**  
> 日期：2026-08-20  
> 范围：个人模型 Credential、敏感 IPC、macOS Keychain helper、自定义 Endpoint  
> 非范围：生产 CRUD、Renderer 接入、Provider Runtime、migration 23/24

## 1. 保护资产

- 个人模型 API Key 明文；
- opaque credential reference 与个人模型 revision 的绑定；
- 当前 owner、Device Trust、entitlement 和 client/window authority；
- 自定义 Endpoint 的 canonical identity；
- Task 已锁定模型 revision 和执行选择；
- Reveal 命令的单次性、关联性和结果归属。

## 2. 信任边界

```text
Untrusted UI input
  → Renderer local component
  → context-isolated Preload
  → Electron Main fixed IPC
  → Main/Core private sensitive channel (DFI-4A.2+ must choose dedicated channel or supervisor serialization change)
  → Local Core Application policy
  → signed native helper anonymous pipe
  → macOS Keychain

Local Core Provider
  → endpoint policy + DNS validation/pinning
  → external HTTPS Provider
```

Renderer 输入、Endpoint、Provider response、DNS response、late IPC response 和本地文件替换均按不可信处理。

## 3. 威胁与控制

| 威胁 | 控制 | 失败语义 |
| --- | --- | --- |
| Renderer 自报 owner/权限 | Core 只消费 Runtime Active identity、Device Trust 与 entitlement | `permission_denied` |
| 普通 HTTP/SSE 泄漏 Secret | Secret 只走 Electron fixed IPC、DFI-4A.2+ 明确选择的敏感通道与匿名 helper pipe | 架构测试失败 |
| argv/env/shell history 泄漏 | helper 无 Secret 参数/环境变量；stdin 单请求 | 启动拒绝/QA 失败 |
| Main/Preload 广播 reveal | 绑定 webContents、clientInstanceId、commandId；单请求返回 | `owner_mismatch` / stale |
| IPC 重放/串线 | strict discriminator、request digest、expected revision、deadline、bounded registry | conflict/expired |
| cancel/deadline 后 late Secret | 单终态 gate；late response 丢弃并清零 Buffer | typed cancelled/deadline |
| JS 内存残留 | 缩短生命周期、避免复制、可控 Buffer 清零；不虚假宣称 String 可可靠擦除 | 最小暴露窗口 |
| Keychain locked/拒绝/损坏 | Security.framework typed mapping，禁止 UI prompt 和降级存储；repair.1 已证明 locked/access_denied/corrupted/broker cancelled | typed fail-closed |
| helper 被替换 | 固定包内路径、签名/Team ID/hash 校验、非 shell 启动 | Desktop/Core fail-closed |
| SQLite 与 Keychain 不一致 | durable operation journal + deterministic ref + 两事务恢复 | typed recovery/manual attention |
| SSRF/metadata 访问 | https only；拒 userinfo/query/fragment/redirect；全 DNS answer policy | `endpoint_rejected` |
| DNS rebinding | 每 attempt 解析、校验全部 A/AAAA、固定 lookup、TLS SNI/Host 保持原 hostname、remoteAddress 复核 | connection aborted |
| 混合公私网 DNS | 任一 answer 命中 denylist 则整次拒绝 | `endpoint_rejected` |
| Provider body/stack 泄漏 | strict parser、safeSummary、响应与日志上限 | typed provider error |
| 模型失败静默换模 | exact Task revision lock；个人/企业 authority 分离 | fail-closed |

## 4. Endpoint Deny Policy

生产 transport 必须拒绝：unspecified、loopback、RFC1918、carrier-grade NAT、link-local、benchmark、
multicast、reserved、IPv6 unique-local/link-local/multicast，以及 IPv4-mapped IPv6 对应的受限地址。
常见 metadata 地址包含在上述范围中；不得只维护单个 metadata IP 黑名单。

解析结果必须全部验证；不能“从多个 answer 中挑一个公网地址”绕开混合解析。HTTP 3xx 不自动跟随，
Provider 请求固定 connect/read/overall deadline、header/body/event/delta/total-bytes 上限。

## 5. 残余风险与后续门槛

- DFI-4A.0 repair.1 使用隔离临时 Keychain 验证 store/resolve/replace/delete、lock/unlock、
  wrong-password `access_denied`、受控 `corrupted`、broker `cancelled`、异常退出恢复和资源收口；
- DFI-4A.0 repair.1 不写入默认登录 Keychain，并已验证 modern
  `SecItemAdd/CopyMatching/Update/Delete`；生产 helper 签名身份、ACL 与安装包生命周期仍需在
  DFI-4A.2 已签名包 E2E 再证明；
- DFI-4A.0 repair.1 已证明当前生产 supervisor 的 `json` IPC 不能保留敏感 Buffer；后续必须选择
  独立敏感通道或显式改造 supervisor serialization；
- Node/Electron 中不可保证所有 Secret 内存副本立即擦除，只能减少复制与生命周期；
- 系统截图、进程内高权限恶意代码、已攻陷操作系统不在 MVP 防护范围；
- Windows Credential Adapter 未验证，Windows 分发前单独门禁；
- 自定义 Endpoint 的代理环境、IPv6/NAT64 和企业网络例外若未来需要，必须另立 policy revision，不能临时放宽；
- Reveal 仍需 DFI-4A.2 独立 QA 与用户单独授权，当前不可用于产品。
