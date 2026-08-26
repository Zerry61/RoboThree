# DFI-4A.0 repair.1 详细修复方案

> 状态：**USER ACCEPTED / PASS/CLOSED**  
> 计划版本：Revision 1  
> 日期：2026-08-20  
> 负责人：Codex 5.6  
> 上游：[DFI-4A Plan](./DFI-4A-PERSONAL-MODEL-CREDENTIAL-DEVELOPMENT-PLAN.md)  
> 失败依据：DFI-4A.0 独立 QA `P0=0 / P1=2 / P2=2 / P3=1`

## 1. 目标与退出条件

本批只修复 DFI-4A.0 Preflight 的五项证据缺口，不实现任何 Personal Model 产品能力。

退出必须同时满足：

1. Keychain 负向矩阵、异常退出恢复和资源归零由真实进程与真实 macOS Keychain 证明；
2. 敏感 IPC 不再声明现有 inherited channel 可用；repair.1 以真实 `CorePrivateSupervisor` 源码配置
   和 faithful json IPC probe 证明当前生产 `serialization: "json"` 不能保留敏感 Buffer，并冻结后续必须
   选择独立敏感通道或显式改造 supervisor serialization；
3. Endpoint 通过受控本地 TLS 服务证明 HTTPS、SNI/Host、证书校验、DNS pinning、连接后地址复核与
   redirect 拒绝；
4. 唯一 canary 的 raw、Base64、URL-encoded 形态在四类非授权输出通道中命中数为 0；
5. modern `SecItem*` 自动化测试不再静默写入用户默认 Keychain，或必须由显式资源授权门禁隔离；
6. focused preflight、lint 和 Workspace check 通过；Central online/offline 若当前 shell 缺 JDK 21，
   必须如实记录为未复跑，不得冒充通过；
7. Claude Code 独立 QA PASS；
8. 用户明确接受独立 QA 结论后，repair.1 与 DFI-4A.0 才可关闭；当前已满足。

DFI-4A.0 的关闭不自动授权 DFI-4A.1。

## 2. 独立 QA 发现

| 编号 | 级别 | 缺口 | repair.1 结论 |
| --- | --- | --- | --- |
| P1-1 | P1 | Keychain 未真实触发 access denied、corrupted、cancelled、异常退出恢复 | repair.1 已以受控真实输入/进程分别触发 `access_denied`、`corrupted`、broker `cancelled` 与 mutation 前后异常退出恢复 |
| P1-2 | P1 | IPC fixture 未证明生产 inherited channel 可承载敏感 Buffer | repair.1 必须撤回复用现有 IPC 的过度结论，并用 faithful JSON probe 证明现有通道不适用；候选 advanced 协议仅做独立可行性验证 |
| P2-1 | P2 | 实际网络证明是 HTTP loopback，不是 HTTPS | 必须改为受控 TLS |
| P2-2 | P2 | 泄漏扫描只扫最终 Evidence 的固定正则 | 必须使用唯一 canary + 多编码 + 多通道 |
| P3-1 | P3 | modern `SecItem*` canary 默认进入登录 Keychain | 自动化默认不再写用户默认 Keychain |

## 3. 范围

### 3.1 允许修改

- `scripts/run-dfi4a0-preflight.mjs`；
- `scripts/dfi4a0-keychain-helper.m`；
- `scripts/dfi4a0-sensitive-child-fixture.mjs`；
- 本计划、ADR-013 Addendum、Threat Model、Preflight Report 与治理状态文档；
- 必要的测试证书生成配置，但证书、私钥和 Secret 只存在于运行时临时目录。

### 3.2 禁止修改

- `apps/desktop/src/main/**`、`apps/desktop/src/preload/**`、Renderer 生产源码；
- `services/core/src/**`、公共 Contracts、Central、Document Worker；
- production `CorePrivateSupervisor` 默认 serialization；
- migration 23/24、Personal Model Domain/Persistence/CRUD/Provider Runtime；
- 真实 reveal、Credential Store、PersonalModelRuntimeRegistry；
- 第三方依赖和 `pnpm-lock.yaml`；
- DFI-4A.1～4A.4、DFI-2B、DFI-3、DFE-6、TGM 编码。

如果真实 supervisor 证明必须修改生产 Main/Core 才能成立，repair.1 必须停止并回到文档评审，不得静默
扩大范围。

## 4. Keychain 修复方案

### 4.1 正向矩阵

保留并加强真实 `store / resolve / replace / delete / not_found`，每次使用唯一 service/account 和随机
canary。所有操作通过预编译 Objective-C Security.framework helper 的匿名 pipe 完成，Secret 不进入
argv、env、临时文件或 shell。

### 4.2 负向矩阵

| 场景 | 真实触发方式 | 期望 |
| --- | --- | --- |
| locked | 锁定隔离 Keychain 后 resolve | `locked`，不返回 Secret |
| access_denied | 使用错误密码解锁隔离 Keychain | `access_denied`，不与 locked 合并断言 |
| not_found | 删除后再次 resolve | `not_found` |
| corrupted | 创建非 Keychain 随机文件并要求 Security.framework 打开 | 稳定 `corrupted` |
| cancelled | parent 在 helper 确定性 barrier 后终止 broker command | broker `cancelled`，item count=0 |

repair.1 已以确定性方式真实触发 `access_denied`、`corrupted`、broker `cancelled` 与异常退出恢复。
broker cancellation 不冒充系统 UI 的 `errSecUserCanceled`；`corrupted` 来自真实 Security.framework
失败事实，不伪造 OSStatus。

### 4.3 异常退出与恢复

新增仅用于 Preflight helper 的命名 failpoint：

- `before_keychain_mutation`；
- `after_keychain_mutation_before_response`。

failpoint 只能由 runner 生成的不可预测 session token 启用，不进入生产 helper 设计。Parent 在收到确定性
barrier 后 `SIGKILL` helper，随后启动新 helper：

- mutation 前崩溃：item 不存在；
- mutation 后响应丢失：按 service/account 查询真实事实，再幂等删除；
- 不创建第二个 item；
- 不用 timeout 猜测 barrier；
- 5 个完整 lifecycle 后 helper PID、临时目录、Keychain item、临时 Keychain 文件全部归零。

### 4.4 modern SecItem 隔离

自动化默认使用隔离临时 Keychain，并在 `SecItem*` query 中显式绑定该测试 Keychain。若当前 macOS
Security.framework 不支持该组合：

1. 自动化结果必须 `RESOURCE_GATED`，不能静默转写默认 Keychain；
2. 只有设置显式的 `ROBOTHREE_DFI4A0_ALLOW_DEFAULT_KEYCHAIN_CANARY=1` 才可运行默认 Keychain canary；
3. 默认 Keychain canary 使用固定测试 namespace + 唯一随机 account；
4. 执行前检查不存在同 ID item，执行后 delete + not_found + namespace residue count=0；
5. Evidence 只记录 count/status/digest，不记录 service/account/Secret。

独立 QA 关闭门槛优先采用隔离 Keychain；默认登录 Keychain 路径不作为无人值守自动化默认行为。

## 5. Main/Core sensitive channel 修复方案

### 5.1 生产事实与 JSON 负向证明

repair.1 不修改生产 `CorePrivateSupervisor`，也不把独立 fixture 冒充生产 Supervisor。实施时必须：

```text
读取并静态锁定真实 apps/desktop/src/main/core-private-supervisor.ts
  -> 确认当前生产 fork serialization: "json"
  -> 以相同 json serialization fork 受控 credential fixture
  -> 发送 Buffer-shaped credential request
  -> fixture strict validator 返回 invalid_request
  -> 发送 desktop.core.shutdown discriminator
  -> credential validator 仍拒绝为 invalid_request，证明 discriminator 未串线
```

该 probe 是对现有 JSON serialization 的 faithful 负向证明，不声明调用了真实 Supervisor 实例，也不声明
生产 credential handler 已存在。

### 5.2 候选 advanced 协议验证

独立 advanced fixture 保留 5 轮 completion/cancel/deadline、duplicate/late/wrong id、restart 隔离与资源归零，
仅用来证明候选 private protocol 的语义可行。它不接入生产 `CorePrivateSupervisor`，不与 boot/shutdown
共享生产 channel，也不作为生产集成证据。

### 5.3 结论边界

报告禁止再写“生产 Main/Core 敏感通道已接通”或“复用现有 inherited IPC 已可行”。允许的结论是：

> 当前生产 JSON supervisor 不满足敏感 Buffer 传递；DFI-4A.2+ 真实 Credential 路径必须新增独立敏感通道/helper channel，
> 或另立明确授权的生产改造批次修改 supervisor serialization，并以真实生产 supervisor 回归 boot、
> readiness、shutdown、crash 和 credential lifecycle。

因此 §5 与 Step 3 不再提出“真实 Supervisor + injected advanced child”组合：在禁止修改生产 serialization
的前提下，这个组合会造成含义混淆。repair.1 的交付是“现有路径不适用”的负向证据和后续架构决策，
不是把敏感 IPC 接进生产。

## 6. HTTPS、TLS 与 DNS pinning 证明

### 6.1 受控 TLS 服务

runner 在临时目录生成一次性 CA/服务端证书和私钥，SAN 固定为 `spike.invalid`；启动
`node:https.createServer` 并只监听随机 loopback 端口。测试客户端：

- 使用 `node:https.request`；
- trust 仅包含本次临时 CA；
- `servername=spike.invalid`；
- `Host=spike.invalid`；
- custom lookup 只返回已验证并固定的 loopback 测试地址；
- loopback 仅由显式 `testMode` 放行，生产 policy 仍拒绝；
- socket connect 后断言 `remoteAddress` 等于 pinned address；
- 302 返回不跟随；
- 错误证书、错误 hostname、混合 DNS、地址不匹配全部失败关闭。

证书和私钥不得提交仓库，运行结束必须删除临时目录。

### 6.2 生产边界

Preflight 只证明 transport primitive 可行，不实现 Provider 请求，不发送真实 Authorization header，不声明
Personal Model Provider 已上线。

## 7. 泄漏扫描

### 7.1 唯一 Canary

每次运行生成可枚举的唯一 canary bytes，并派生：

- raw UTF-8；
- Base64；
- URL-encoded；
- hex（额外加强项）。

### 7.2 通道定义

必须分别扫描：

1. parent harness stdout；
2. parent/child/helper stderr 与 safe error summary；
3. Evidence JSON/文件；
4. 测试日志、Trace capture 与失败诊断。

授权的匿名 credential pipe 和 advanced Buffer payload 是受控 Secret transport，不冒充诊断通道；测试应
证明 canary 只在预期 payload 中出现、不会被复制到上述四类输出。最终 Evidence 输出每个通道的独立
`matchCount=0`，不能只给单一总数。

负向测试必须主动把 raw/Base64/URL-encoded canary 分别注入每个扫描器，证明扫描器能失败；失败消息只
报告 channel/encoding/count，不回显 canary。

## 8. Evidence allowlist

只允许记录：

- status；
- scenario count；
- lifecycle count；
- duration；
- resource count；
- typed error code；
- SHA-256 digest；
- dependency/license/transport identifier。

禁止记录：Secret、service/account、默认 Keychain item identity、完整临时路径、PID、Endpoint query、
Authorization、child payload、用户数据或异常栈。

## 9. 实施步骤

### Step 1：状态与测试底座

- 将 DFI-4A.0 状态同步为 `INDEPENDENT_QA_FAIL / REPAIR.1 REQUIRED`；
- 冻结唯一 canary scanner、资源诊断和 Evidence allowlist；
- 增加 deterministic failpoint/barrier，不使用 sleep 猜测。

### Step 2：Keychain repair

- 补完整负向矩阵；
- 补异常退出/重启收敛；
- modern `SecItem*` 默认切换到隔离测试 Keychain；
- 5 轮资源归零。

### Step 3：Supervisor 与 TLS repair

- 读取真实 `CorePrivateSupervisor` 配置并运行 faithful JSON IPC 负向 probe；
- 用独立 advanced fixture 验证候选 credential 协议，不冒充生产 Supervisor 或同 channel 集成；
- 冻结“现有 JSON channel 不可直接复用，后续需独立敏感通道或另立生产改造批次”的结论；
- 使用临时 CA 和 HTTPS server 验证 TLS/pinning/redirect/address。

### Step 4：证据与回归

- 四通道多编码泄漏扫描；
- 更新 ADR、Threat Model 与 Preflight Report，清除过度声明；
- 严格串行运行全部门禁；
- 提交 Claude Code 独立 QA。

## 10. QA 验收矩阵

### 10.1 Keychain（15 项）

1. modern `SecItem*` store/resolve/replace/delete/not_found；
2. 隔离 Keychain locked 精确映射；
3. wrong-password access_denied 精确映射；
4. corrupted file 精确映射；
5. broker cancel 单终态；
6. cancel 后零 item；
7. before-mutation SIGKILL 后零 item；
8. after-mutation-before-response SIGKILL 后事实查询；
9. 响应丢失后幂等清理；
10. duplicate store typed conflict；
11. 5 轮 start/stop；
12. 5 轮 abnormal exit/reopen；
13. helper PID/timer/pipe 归零；
14. 临时 Keychain 文件归零；
15. 测试 namespace item residue=0。

### 10.2 Supervisor/IPC（10 项）

16. 真实 `CorePrivateSupervisor` 源码配置锁定为 `serialization: "json"`；
17. faithful JSON probe 不能保留敏感 Buffer，strict fixture 稳定拒绝；
18. JSON probe 不被误写为真实 Supervisor/生产 handler 证据；
19. advanced child credential roundtrip，仅声明候选协议可行；
20. credential / shutdown discriminator 互斥；
21. malformed/unknown field 拒绝；
22. duplicate/late/wrong id 拒绝；
23. completion/cancel/deadline 单终态；
24. restart 后旧 command 隔离；
25. advanced fixture 5 轮资源归零。

### 10.3 HTTPS/Endpoint（9 项）

26. HTTPS + 临时 CA 成功；
27. SNI/hostname 正确；
28. Host header 正确；
29. pinned lookup 生效；
30. remoteAddress 二次复核；
31. 错误证书拒绝；
32. 错误 hostname 拒绝；
33. mixed DNS/私网/metadata 拒绝；
34. redirect 不跟随。

### 10.4 泄漏、资源与边界（10 项）

35. raw canary 四通道 0；
36. Base64 canary 四通道 0；
37. URL-encoded canary 四通道 0；
38. scanner 负向注入可检出且不回显；
39. Evidence allowlist；
40. Secret 不进入 argv/env/temp file；
41. 无默认 Keychain 静默写入；
42. 无新依赖、lockfile 不变；
43. Main/Preload/Core/Contracts/Central/Renderer 生产源码零修改；
44. DFI-4A.1～4A.4/DFI-2B/DFI-3/DFE-6 无超前。

## 11. 正式门禁

必须使用 Node.js 24.13.0、JDK 21、Docker，且严格串行：

```bash
node --check scripts/run-dfi4a0-preflight.mjs
xcrun clang -fobjc-arc -Wno-deprecated-declarations scripts/dfi4a0-keychain-helper.m -framework Foundation -framework Security -o /tmp/robothree-dfi4a0-helper-check
CI=true pnpm run preflight:dfi4a0
CI=true pnpm run lint
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

Keychain Preflight 必须非沙箱实际执行。任何 `RESOURCE_GATED`、skip、历史报告或静态扫描均不能替代
repair.1 的正式退出门禁。当前执行环境无 JDK 21 时，Central online/offline 必须记录为未复跑，不得冒充 PASS。

## 12. 工作量

| 工作 | 集中工程日 |
| --- | ---: |
| Keychain 负向/崩溃/隔离 | 1.5～2.5 |
| JSON 负向证明与候选 advanced 协议 | 1～2 |
| HTTPS/TLS pinning | 1～1.5 |
| Canary scan/Evidence/文档 | 0.5～1 |
| 合计 | **4～7** |

不含独立 QA、等待、外部环境故障和 P0/P1 二次返工。

## 13. 文档复核问题

请评审者确认：

1. 五项 QA 发现是否均被一一关闭；
2. repair.1 撤回复用现有 inherited IPC 结论，并要求后续独立敏感通道或显式 supervisor 改造，是否足够收口；
3. broker cancellation 与 OS `errSecUserCanceled` 的所有权区分是否准确；
4. modern `SecItem*` 自动化默认使用隔离 Keychain，默认登录 Keychain 改为显式 resource gate 是否正确；
5. 临时 CA/HTTPS/SNI/Host/remoteAddress 是否形成完整 transport proof；
6. 授权 Secret transport 与诊断输出通道的区分是否避免伪造“零泄漏”；
7. 44 项 QA 与 4～7 天是否可执行；
8. 是否存在新的 P0/P1、生产边界漂移或需要用户重新决策的事项。

### 13.1 Revision 1 复核结论

Claude Code 文档评审：`PASS / P0=0 / P1=0 / P2=0 / P3=3`。三项 P3 已在本 Revision 吸收：

1. 全文恢复为计划态，不使用“已实现 / Developer PASS”措辞；
2. `cancelled` / `corrupted` 保持 repair.1 必测；触发所有权分别冻结为受控 broker 生命周期与
   受控损坏文件输入，不依赖 headless 系统弹窗；
3. 删除“真实 Supervisor + injected advanced child”的混合表述，冻结 JSON 负向证明与候选 advanced
   协议验证的证据边界。

## 14. 门禁状态（repair.1 关闭时的历史快照）

```text
DFI-4A Plan             CONFIRMED
DFI-4A.0                REPAIR.1 USER ACCEPTED / PASS/CLOSED
DFI-4A.0 repair.1       USER ACCEPTED / PASS/CLOSED
DFI-4A.1                REVISION 2 / DOCUMENT REVIEW PENDING / CODING GATED
DFI-4A.2～DFI-4A.4      GATED
DFI-2B / DFI-3          GATED
DFE-6                   GATED
TGM-0                   DETAILED PLAN FILE REQUIRED BEFORE REVIEW
TGM-1+                  GATED
```

repair.1 已通过全部开发者串行门禁、Claude Code 独立 QA、Central online/offline 补跑与用户接受；
DFI-4A.0 正式关闭。
DFI-4A.1 Revision 2 已在本批关闭后另行形成，但仍需差异复核和用户明确编码授权。

> 当前状态回链（2026-08-21）：DFI-4A.1 已演进为
> `REVISION 3.3 / DOCUMENT REVIEW PASS / CODING AUTHORIZED / IN PROGRESS`；以上代码块仅保留 repair.1 关闭时的历史事实，
> 不代表当前方案版本或授权状态。
