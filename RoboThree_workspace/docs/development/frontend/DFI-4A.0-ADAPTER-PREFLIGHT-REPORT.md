# DFI-4A.0 架构增补与 Adapter Preflight 报告

> 状态：**REPAIR.1 USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-20  
> 负责人：Codex 5.6  
> 开发版本：`0.0.0-dfi.4a.0-repair.1`  
> 适用范围：macOS Personal Credential、Main/Core sensitive transport、Custom Endpoint transport

## 1. 结论

DFI-4A.0 初版独立 QA 发现 `P1=2 / P2=2 / P3=1`。repair.1 已在不修改生产
Main/Core/Contract 的边界内补齐证据，并通过开发者串行门禁、Claude Code 独立 QA 与 Central
online/offline 补跑：

| 领域 | repair.1 开发者证据 | 当前结论 |
| --- | --- | --- |
| macOS Keychain | 隔离临时 Keychain 的完整正向/负向/崩溃/modern SecItem 生命周期 | QA PASS |
| Main/Core sensitive channel | 生产 JSON 配置 faithful negative probe + 独立 advanced candidate fixture | 现有 JSON channel 不适用；生产方案继续 GATED |
| Endpoint | 一次性 CA/cert + node:https + DNS pinning + SNI/Host/remoteAddress | QA PASS |
| Leak scan | 4 编码 × 4 非授权通道 + 16 项负向自测 | QA PASS |
| 产品能力 | 无 CRUD、Provider、Renderer、reveal、migration | 继续 GATED |

以上已通过独立 QA 与用户接受，DFI-4A.0-repair.1 和 DFI-4A.0 正式关闭。

## 2. 干净基线与越界隔离

- 并发窗口写入的脚本/文档先保存 SHA-256 后隔离；
- 并发生成的 QA 报告不视为独立 QA；
- 并发生成的旧 DFI-4A.1 方案不视为已授权交付；repair.1 关闭时形成的正式 Revision 2 当时仍需
  独立差异复核和编码授权；该历史状态现已由 Revision 3.3 取代；
- 生产 `apps/desktop/src/main/core-private-supervisor.ts` 保持原有
  `serialization: "json"`，未被 repair.1 修改；
- 当前 DFI-4A.1 Revision 3.3 已通过文档差异复核并获用户明确编码授权；DFI-4A.2～4A.4、DFI-2B、
  DFI-3、DFE-6 继续 `GATED`。

隔离目录位于系统临时目录，仅用于恢复与审计，不参与产品构建。

## 3. macOS Keychain Preflight

### 3.1 正向与锁定生命周期

每次执行使用唯一临时目录、随机 Keychain 名称、随机密码、随机 service/account 和测试 Secret：

1. create；
2. store；
3. resolve；
4. replace；
5. resolve；
6. lock；
7. locked resolve → typed `locked`；
8. unlock；
9. delete；
10. resolve → typed `not_found`；
11. 临时 Keychain 删除。

额外连续执行 5 轮普通生命周期，所有 helper 进程、item 与临时资源收口。

### 3.2 完整负向矩阵

| 场景 | 确定性触发 | 结果 |
| --- | --- | --- |
| locked | 锁定临时 Keychain 后 resolve | `locked` |
| access_denied | 错误密码解锁 | `access_denied` |
| not_found | 删除后 resolve | `not_found` |
| corrupted | Security.framework 操作真实非 Keychain 文件 | `corrupted` |
| cancelled | parent 在 helper 确定性 barrier 后终止 broker command | `cancelled`，item count=0 |
| duplicate | 同 service/account 重复 store | typed conflict |

`cancelled` 证明 broker 生命周期，不冒充系统弹窗的 `errSecUserCanceled`；`corrupted`
来自真实 Security.framework 失败事实，不伪造 OSStatus。

### 3.3 崩溃恢复

- `before_keychain_mutation`：连续 5 轮在 mutation 前收到 barrier 后 `SIGKILL`，新 helper
  确认 item 不存在；
- `after_keychain_mutation_before_response`：连续 5 轮 mutation 已发生但响应前 `SIGKILL`，
  新 helper按真实 Keychain 事实 resolve，再幂等删除；
- 每个 failpoint session token 不复用，未知/失配 token 失败关闭。

### 3.4 modern SecItem 隔离

`SecItemAdd / SecItemCopyMatching / SecItemUpdate / SecItemDelete` 全部通过
`kSecUseKeychain` 或 `kSecMatchSearchList` 明确绑定临时 Keychain，完成 store/resolve/replace/
resolve/delete/not-found。自动化没有写入默认登录 Keychain。

生产签名 helper 的 ACL、entitlement、升级与卸载行为仍属于 DFI-4A.2 的独立 E2E 门槛；这不否定
repair.1 对 API 与隔离路径的 preflight 证明。

## 4. Main/Core Sensitive Channel

生产 `CorePrivateSupervisor` 当前使用 `serialization: "json"`。faithful JSON fixture 证明敏感
Buffer 不能保持 Buffer 语义，因此 repair.1 撤回“现有 inherited channel 可直接复用”的初版结论。

独立 `serialization: "advanced"` fixture 只证明候选协议的：

- 5 轮 completion/cancel/deadline；
- malformed/unknown/duplicate 请求拒绝；
- cancel 后 late result 不产生第二终态；
- 旧 child 退出后新 child 不继承旧请求；
- child/stdio/request registry 收口。

该 fixture 不等于生产 Supervisor 集成。DFI-4A.2+ 真实 Credential 路径必须另立方案选择独立敏感 helper/channel，或
显式改造 production supervisor serialization 并完整回归 boot/shutdown/既有消息。repair.1 不修改
生产 Main/Core。

## 5. Endpoint / TLS / SSRF

受控测试传输使用一次性 CA、服务端私钥/CSR/证书和 `node:https`：

- URL 只允许 HTTPS；
- 拒绝 userinfo/query/fragment；
- 不跟随 redirect；
- 自定义 lookup 只返回预校验地址；
- TLS 使用预期 SNI；
- Host header 保持 canonical host；
- 连接后复核 `remoteAddress`；
- 错误 CA/证书拒绝；
- hostname mismatch 拒绝；
- IPv4/IPv6 loopback、link-local、multicast、metadata、私网与 mixed DNS 拒绝。

测试证书、私钥与临时文件只存在于运行时临时目录，结束后删除。

## 6. 泄漏扫描

唯一随机 run canary 派生 raw、Base64、URL-encoded、hex 和 Secret-shape pattern，分别扫描：

1. parent stdout；
2. diagnostic stderr；
3. evidence JSON；
4. test trace。

每个通道独立报告 `matchCount`。负向自测向每个通道分别注入四种编码，共 16 项，确认 scanner
能够失败；正式执行四通道命中均为 0。Evidence 仅记录 status/count/digest/resource metrics/typed code，
不记录 Secret、Endpoint、完整路径或用户正文。

## 7. 串行开发者门禁

- `node --check scripts/run-dfi4a0-preflight.mjs`：PASS；
- Objective-C Security.framework helper 编译：PASS；
- 非沙箱 `CI=true pnpm run preflight:dfi4a0`：PASS；
- `CI=true pnpm run lint`：PASS，Architecture boundary PASS；
- `CI=true pnpm run check`：PASS，201 files / 1318 tests + 3 smoke；
- `CI=true pnpm run check:central`：PASS，302/0/0/0；
- `CI=true pnpm run check:central:offline`：PASS，302/0/0/0。

正式 Harness 与 Central 门禁严格串行执行。Claude Code 独立 QA 与用户接受均已完成。

## 8. 边界与残余风险

- 没有修改生产 Main、Preload、Renderer、Core、Contracts、Central、Document Worker；
- 没有 migration 23/24、Personal Model CRUD、真实 Provider、Runtime Registry、Desktop API 或 reveal；
- 没有第三方依赖或 lockfile 变化；
- Node/Electron 不能保证所有 Secret 内存副本立即擦除，只能减少复制和生命周期；
- 已攻陷操作系统、高权限进程内恶意代码与系统截图不在 MVP 防护范围；
- Windows Credential Adapter 仍需 Windows 分发前独立验证；
- 企业代理、NAT64 或私网 Endpoint 例外若未来需要，必须另立 policy revision；
- DFI-4A.0 已在独立 QA PASS 与用户明确接受后正式关闭。
