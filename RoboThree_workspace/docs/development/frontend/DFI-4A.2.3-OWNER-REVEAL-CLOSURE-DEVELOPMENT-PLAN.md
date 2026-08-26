# DFI-4A.2.3 Owner Reveal 与 Credential Foundation Closure 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-21  
> 负责人：Codex 5.6  
> 上游：DFI-4A.0、DFI-4A.1、DFI-4A.2.1、DFI-4A.2.2 `PASS/CLOSED`  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 架构依据：ADR-013、ADR-013 Addendum A、DFI-4A Revision 1、DFI-4A.2 Plan  

本文件已通过双文档复核（P0～P3 均为 0），且以下四项门槛已由用户明确关闭：

1. 用户正式接受并关闭 DFI-4A.2.2；
2. ADR-013 Addendum A 通过文档复核并由用户明确改为 `ACCEPTED`；
3. 本方案文档复核 `PASS`；
4. 用户单独授权 DFI-4A.2.3 编码。

本次授权只允许实现本文件边界内的 Foundation；不得以此解锁 DFI-4A.3/4、Preload、Renderer 或
公共 Desktop API。

## 1. 批次目标

DFI-4A.2.3 只完成个人 Credential 的 owner-only Reveal Foundation，并用 Closure Harness 证明
DFI-4A.2 的 Sensitive Transport、Keychain、CRUD/Recovery 与 Reveal 安全边界闭环：

1. Core 每次 reveal 都重新验证 Runtime Active owner、Device Trust、entitlement、offline state、
   active Personal Model head、configuration revision 与 Credential binding；
2. Secret 只通过既有 fd4/fd5 binary frame 返回 Main 内部受控 consumer，不进入公共 Desktop API；
3. reveal 使用有界并发、频率限制、短 deadline、一次性命令和不可重放语义；
4. V1/V2、cancel、deadline、disconnect、late response 与 Core/Main restart 均失败关闭；
5. Secret 在 Core、Broker、Main consumer 的最短生命周期内清零，不产生 durable success Receipt；
6. DFI-4A.2 全矩阵回归后，只关闭 Credential Broker / Keychain / CRUD / Reveal **Foundation**。

本批不交付用户可见“查看 Key”页面，不代表个人模型已经可在 Agent Loop 中调用，也不代表正式
Electron 签名安装包、Provider、Task lock、公共 CRUD 或 Renderer 已上线。

## 2. 当前代码事实

### 2.1 已存在并直接复用

- private `personal-credential-broker.v1` 已包含 `commandType="reveal"`，response frame 可携带最多
  16 KiB raw Secret bytes；协议不从公共 Contract root 导出；
- Main `PersonalCredentialBrokerClient` 与 Core `PersonalCredentialBrokerServer` 已使用 fd4/fd5 双匿名
  pipe，保留 fd3 JSON lifecycle；response body、frame、late result 与 close 路径已有 Buffer cleanup；
- Core `PersonalCredentialStore.resolve(credentialRef)` 已返回最短生命周期 `Uint8Array`，真实 macOS
  Keychain Adapter、one-shot helper、trust check 与 production activation fail-closed 已在 DFI-4A.2.1
  建立；
- `PersonalModelOwnerAction` 已包含 `reveal`，严格 authority resolver 已冻结状态 2 允许、状态 3 拒绝；
- migration 23 已提供 owner namespace、immutable definition、active head、status history、operation 与
  Receipt；DFI-4A.2.2 已接通 CRUD/Recovery，但 Reveal 不需要新增 durable business fact；
- Broker client/server 已有 global inflight 上限、deadline、cancel、disconnect、channel/client identity 和
  Core restart 隔离。

### 2.2 尚不存在

- Core `PersonalModelCredentialRevealService`；
- active head / exact revision / execution definition / Credential binding 的 reveal 专项校验；
- `(owner, personalModel)` 单并发、每 60 秒最多 5 次与全局最多 4 次的 Core policy；
- reveal command 的一次性 tombstone；
- Main 内部受控 consumer 与 consumer completion 后的确定性清零；
- V1/V2、restart、late result 和全矩阵 Closure Harness；
- 公共 Desktop reveal Contract、`ipcMain.handle`、Preload sidecar 与 Renderer 局部展示组件。

### 2.3 必须修正的既有 transport 行为

当前 `PersonalCredentialBrokerClient` 对相同 `commandId` 的 inflight 请求会合并 resolver；该行为适用于
mutation 幂等等待，但不适用于 Reveal。若直接复用，单个 Secret response 可能被复制给多个 consumer。

DFI-4A.2.3 必须冻结以下差异：

1. reveal command 不合并 pending waiter；相同 command 的第二个请求在 resolve 前返回
   `credential_transport_busy` 或 conflict；
2. reveal 成功后只保存不含 Secret 的 runtime tombstone，原 command 永久不可在该 channel/runtime
   registry 内重放；
3. reveal 失败也不得自动重放；用户必须以新手势生成新 `commandId`；
4. mutation 的既有 idempotent wait/replay 语义保持不变；
5. Main、Core 两侧都执行一次性 command 检查，不能只依赖单侧内存状态。

## 3. 冻结架构

```text
Future DFI-4A.4 safe Desktop command（本批不实现）
  → Main internal reveal request
  → PersonalCredentialBrokerClient（fd4 request）
  → PersonalCredentialBrokerServer
  → PersonalModelCredentialRevealService
       ├─ Runtime Active owner authority
       ├─ active Personal Model head / immutable definition
       ├─ exact credential binding validation
       └─ PersonalCredentialStore.resolve(ref)
  → fd5 response raw bytes
  → Main bounded internal consumer（测试实现）
  → completion 后全链路 Buffer cleanup
```

### 3.1 职责边界

- **Core Reveal Service**：唯一业务决策者，解析 owner authority、active head、definition 与 Credential
  binding，执行 rate/concurrency/deadline policy，调用 `resolve()`；
- **Core Broker Server**：strict transport、identity correlation、Buffer 生命周期，不解释产品权限；
- **Main Broker Client**：channel/client/command correlation、transport deadline、一次性 delivery 和 late
  response 丢弃，不读取 owner、Credential Reference 或 Keychain metadata；
- **Main Internal Consumer**：只证明单一受控 consumer 可在 callback 生命周期内读取 bytes，完成后清零；
- **Renderer/Preload**：本批完全不接入；隐藏、导航、unmount 与页面局部引用清理留给 DFI-4A.4/后续
  DFE 真实 UI 批次。

### 3.2 禁止第二套事实源

- 不新增 reveal 表、migration 24、durable success Receipt、Event 或 Audit Secret fact；
- 不把 reveal status 写入 Personal Model status history；Key 查看成功不等于模型可用或 Provider 调用成功；
- 不持久化 rate-limit registry、command tombstone、Secret digest 或 consumer result；
- owner、head、revision 与 credentialRef 必须从既有 SQLite 权威事实加载，不能由 Main/Renderer 自报。

## 4. Reveal Command 与 Digest

### 4.1 Core 内部 safe material

```text
schemaVersion = personal-model-reveal.v1
commandId
commandType = reveal
personalModelId
expectedConfigurationRevision
expectedExecutionDefinitionDigest
```

`requestDigest` 固定为：

```text
sha256(canonicalJson({
  domain: "robothree.personal-model.credential-reveal.v1",
  schemaVersion: "v1alpha1",
  material: <上述字段，固定顺序与 NFC/canonical JSON 规则>
}))
```

明确排除：Secret、Secret hash/shape、credentialRef、ownerScopeDigest、enterprise/user/device raw identity、
clientInstanceId、channelInstanceId、transportRequestId、deadlineAt、webContentsId 与 consumer identity。

### 4.2 Main header 与 Core 重算

- 继续复用 private broker v1 header，不增加 owner digest、credentialRef 或 Endpoint；
- Main 只提交 command/model/expected revision/request digest/deadline 与零长度 body；
- Core 从 active head 加载 exact definition，取得 `executionDefinitionDigest` 后重算 request digest；
- `expectedConfigurationRevision` 必须等于当前 active head；tombstoned、delete_pending、旧 revision、digest
  mismatch 均在 `resolve()` 前失败关闭；
- definition 的 opaque credentialRef 只在 Core 内部传给 `PersonalCredentialStore.resolve()`。

### 4.3 Secret presence

- reveal request body 必须为 0；
- completed reveal response body 必须大于 0 且不超过 16 KiB；
- 非 completed response body 必须为 0；
- 空 Key 不作为合法个人 Credential；若 Keychain 返回空 bytes，映射 typed corrupted/internal，不回空字符串。

## 5. Owner、Revision 与 Credential Binding

每次 reveal 按以下顺序执行，任何一步失败都不得调用 `resolve()`：

1. 加载并校验 active owner namespace 的 `namespace_key_check_digest`；
2. 从 Runtime Active authority context 获取 enterprise/user/device/entitlement/offline state；
3. 以 `action="reveal"` 调用严格 owner authority resolver；
4. 加载 owner-scoped active Personal Model head；
5. 要求 `selection_state="active"`，禁止 `delete_pending/tombstoned`；
6. 校验 expected configuration revision 与 active head；
7. 加载 immutable definition 并重算 record/configuration/execution/binding digest；
8. 校验 credentialRef 存在且 binding 指向该 exact definition；
9. 重算 reveal request digest；
10. 进入 bounded registry，最后调用 `resolve()`。

权限规则沿用既有 CGF-1.3：

- online 与状态 2（企业暂不可达但 Token/Trust/scope/entitlement/Compatibility 仍有效）允许；
- 状态 3禁止 reveal；Central 不可达本身不等于权限失效；
- `personal_model.configure` 不成立时拒绝；
- 企业 Credential、official/enterprise model 或其他 owner 的 personal model 永不进入 resolve。

## 6. 一次性、并发、限流与 Deadline

### 6.1 Core `PersonalModelRevealAttemptRegistry`

- key：内部 `(ownerIdentity, personalModelId)`；不得输出 raw key；
- 同 key 同时最多 1 个 reveal；全局最多 4 个；
- 同 key 滑动 60 秒窗口最多 5 次；尝试在 authority/revision 校验通过、调用 resolve 前计数；
- registry 最多 256 个 key，idle TTL 10 分钟；达到容量时失败关闭，不驱逐活跃项；
- 使用注入 Clock/monotonic timer，测试不依赖真实 `setTimeout` 竞态；
- registry 只保存时间、状态与 command identity，不保存 Secret、credentialRef 或业务正文；
- Core restart 后 registry 清空，但旧 channel/client command 已失效；用户仍需新手势和新 command。

### 6.2 Command tombstone

- pending reveal command 不允许第二个 waiter；
- terminal 后写入不含 Secret的 runtime tombstone：commandId、requestDigest、safe status、expiresAt；
- same command/same digest 也返回 `personal_model.reveal_replay_forbidden`，不返回上次 Secret；
- same command/different digest 返回 conflict；
- tombstone TTL 10 分钟、最多 256 项；channel/runtime restart 后旧 command 因 identity 失效，不能作为
  retry authority；
- tombstone 不是 durable Receipt，也不能用于证明用户看到了 Secret。

### 6.3 Deadline 与取消

- Core 业务 deadline：从开始校验起最多 5 秒，并与 request deadline 取更早者；
- Main transport deadline：未来 DFI-4A.4 最多 7 秒，本批 Harness 也按该上限验证；
- cancel/deadline/disconnect 只能产生一个 terminal；
- Keychain resolve 已开始后发生 timeout/disconnect，late bytes 必须清零并丢弃；
- timeout 不返回空值、不宣称未读取、不自动重试，使用 typed unavailable/uncertain；
- V2 无法证明 Main consumer 是否已观察时，必须采用“不可自动重放”的保守语义。

## 7. Main Internal Consumer 与 Buffer 生命周期

### 7.1 Consumer Port

本批新增 Main 私有 `PersonalCredentialRevealConsumer`，只用于受控 E2E：

```text
consume(commandIdentity, secretBytes, signal) -> completed | cancelled | timed_out | uncertain
```

- 不注册 `ipcMain.handle`，不接受 webContents 或 Renderer 输入；
- 一次调用只有一个 consumer，不广播、不 fan-out、不事件发布；
- consumer 不得保留传入 Buffer；callback settle 后由 owner 清零；
- 测试 consumer 只断言长度、随机 canary digest 的安全派生和生命周期，不输出 Secret；
- future DFI-4A.4 必须另行加入 exact webContentsId/sender frame/session 绑定，本批结果不能替代该门槛。

### 7.2 清零所有权

每次 reveal 至少覆盖：

1. Keychain helper response buffer；
2. `PersonalCredentialStore.resolve()` result；
3. Core service working copy；
4. Broker server response body 与 encoded frame；
5. Broker client decoded body与 delivery copy；
6. consumer callback working copy；
7. cancel/deadline/disconnect/late-result/error 分支。

不得宣称 JavaScript String 可可靠清零，因此生产路径与测试 consumer 都禁止把 Secret 转成 String、
Base64、hex 或 JSON。测试比较使用随机 bytes、长度与 constant-time byte comparison，比较后立即清零。

## 8. V1/V2 与终态语义

| 窗口 | 已发生事实 | 允许的收敛 |
| --- | --- | --- |
| V1：authority/revision 校验后、resolve 前崩溃 | 无 Secret 外发、无 durable success | 新用户手势可生成新 command；旧 command 不重放 |
| V2a：resolve 返回后、Core 写 fd5 前崩溃 | Secret 仅死亡 Core 内存 | 丢弃；返回 unavailable/uncertain；新手势重试 |
| V2b：fd5 写出后、Main 收到前断连 | 是否到达不可证明 | 丢弃；不自动重放 |
| V2c：Main 收到后、consumer completion 前崩溃 | 用户是否观察不可证明 | 丢弃；不自动重放 |
| V2d：consumer 完成但 ack 丢失 | 无 durable success Receipt | 不以旧 command replay；用户新手势重试 |

本批不宣称 Reveal exactly-once，也不宣称“用户只看过一次”。承诺仅为：RoboThree 不自动重放、
不广播、不持久化 Secret，并对每次新的用户手势重新授权。

## 9. 错误映射

Core 内部最少保留：

```text
personal_model.reveal_unavailable
personal_model.reveal_rate_limited
personal_model.reveal_busy
personal_model.reveal_replay_forbidden
personal_model.permission_denied
personal_model.not_found
personal_model.conflict
personal_model.deadline_exceeded
personal_model.cancelled
personal_model.credential_unavailable
personal_model.credential_operation_uncertain
```

private broker 只投影既有 typed transport/store code；不把 owner/revision/credentialRef/Keychain account 或
原始 OSStatus 放入错误消息。Renderer 用户文案留给 DFI-4A.4/DFE，不在 Core 拼接。

## 10. DFI-4A.2 Closure Harness

### 10.1 拓扑

- 真实 Main `PersonalCredentialBrokerClient`；
- 真实 Core child + fd4/fd5 broker server；
- 真实隔离临时 macOS Keychain + one-shot helper；
- SQLite migration 23 + `SqlitePersonalModelPersistence`；
- 受控 Runtime Active owner authority；
- 受控 Main internal consumer；
- Parent process 注入 V1/V2 barrier、cancel、deadline、disconnect 与 restart。

### 10.2 Closure 声明边界

Harness 通过后可以声明：

- DFI-4A.2 Credential Broker / Keychain / CRUD / Recovery / Owner Reveal Foundation 闭环；
- Secret binary path、owner authority、一次性 reveal、资源归零与泄漏扫描已被自动化证明。

不得声明：

- 公共 Desktop CRUD/reveal 已上线；
- Renderer 可以真实查看 Key；
- 正式安装包签名/notarization/ACL 已完成；
- 个人模型 Provider、Task lock、Agent Loop 或生产调用已接通；
- Windows/Linux Credential Adapter 已实现。

## 11. 修改边界

### 11.1 编码授权后允许

- `packages/contracts/src/desktop-private/personal-credential-broker-v1/**`（仅 additive/internal）；
- `services/core/src/application/**`、`ports/**`、`adapters/credential/**`、必要 bootstrap 组合与测试；
- `apps/desktop/src/main/personal-credential-broker-client.ts`、Main 私有 consumer/harness 与测试；
- DFI-4A.2 Closure Harness 脚本、隔离测试资源；
- 批次完成后的 Root/Core/Desktop 必要开发版本、CHANGELOG、DEVELOPMENT-LOG、README 状态收口。

### 11.2 禁止

- `apps/desktop/src/preload/**`、`apps/desktop/src/renderer/**`、public `ipcMain.handle`；
- Desktop Local 公共 CRUD/reveal Contract；
- Central、Document Worker、企业 Credential、Provider Adapter、TaskRuntimeSelection、Agent Loop、
  Compaction、CapabilityLock；
- migration 1～23 改写、migration 24、第三方依赖、`pnpm-lock.yaml`；
- 默认登录 Keychain 自动化写入、真实用户 Key、Secret Fixture/Snapshot；
- durable reveal success Receipt、Secret Audit/Event/Trace；
- DFI-4A.3、DFI-4A.4、DFI-2B、DFI-3 或 TGM 超前实现。

## 12. QA 验收矩阵（58 项）

### 12.1 Command、Owner 与 Binding（1～12）

1. strict reveal command 拒绝 unknown field；
2. canonical request digest 稳定；
3. digest 不含 Secret/ref/owner/client/channel/transport/deadline；
4. Core 从 durable definition 重算 digest；
5. Runtime Active owner authority 每次重新解析；
6. 状态 2允许、状态 3拒绝；
7. entitlement 不成立在 resolve 前拒绝；
8. enterprise/official model 永不 reveal；
9. delete_pending/tombstoned 拒绝；
10. stale configuration revision 拒绝；
11. execution definition/binding/record digest tamper 失败关闭；
12. credentialRef 不进入 Main header/result/evidence。

### 12.2 一次性、并发与限流（13～23）

13. pending reveal 不合并第二 consumer；
14. same command/same digest 成功后禁止 replay；
15. same command/different digest conflict；
16. mutation 既有 replay 语义不变；
17. 同 owner/model 单并发；
18. 不同 owner/model 最多全局 4 并发；
19. 第 6 次/60 秒 rate limited；
20. 窗口到期后新 command 可进入；
21. registry 256 上限与 TTL；
22. deterministic Clock，不依赖真实 timer race；
23. tombstone/registry 不保存 Secret/ref/raw owner identity。

### 12.3 Transport、V1/V2 与 Cleanup（24～39）

24. reveal request body 固定 0；
25. completed response 必须携带非空 bounded bytes；
26. 非 completed response body 固定 0；
27. 空 Credential 返回 corrupted/internal；
28. V1 resolve 调用数为 0；
29. V2a Core 内存 bytes 清零；
30. V2b disconnect 不 replay；
31. V2c consumer 未完成不伪装 success；
32. V2d ack 丢失不以旧 command replay；
33. cancel 单 terminal；
34. Core deadline 5 秒，Main deadline 不超过 7 秒；
35. late result 丢弃并清零；
36. Core restart 旧 channel/command 失效；
37. Main restart 旧 inflight/consumer 清零；
38. 单一 consumer，不广播/fan-out；
39. helper/Core/server/frame/client/consumer 七层 cleanup。

### 12.4 Closure、安全与边界（40～58）

40. 真实隔离 Keychain store→reveal bytes 一致；
41. replace 后只 reveal 新 ref；
42. delete_pending/delete 后 reveal 拒绝；
43. Keychain locked/access_denied/corrupted/not_found typed 映射；
44. DFI-4A.2.1 sensitive transport 全量回归；
45. DFI-4A.2.2 CRUD/recovery 全量回归；
46. C1～C4/U1～U3/D1～D3/V1～V2 命名矩阵全通过；
47. SQLite close/reopen + Core/Main restart；
48. helper/pipe/inflight/registry/timer/consumer/child 资源归零；
49. 唯一随机 canary raw 形态四通道扫描；
50. Base64/URL-encoded/hex/Secret-shape 四通道扫描；
51. scanner 负向注入能真实失败且不回显 marker；
52. stdout/stderr/evidence/test trace 独立 matchCount=0；
53. SQLite/Receipt/Event/Audit/HTTP/JSON IPC/Fixture/Snapshot 0 Secret；
54. 无 durable reveal success fact；
55. Preload/Renderer/public Contract 0 reveal 新接口；
56. migration 1～23 digest 不变且无 migration 24；
57. dependencies/root config/`pnpm-lock.yaml` 不变；
58. Workspace check + Central online/offline 串行通过，无 DFI-4A.3/4 超前实现。

## 13. 开发与验证步骤

1. **Step 1：Core pure service 与 registry**  
   实现 command/digest、owner/head/binding 校验、deterministic rate/concurrency registry、一次性 tombstone；
2. **Step 2：private broker 与 consumer**  
   接通 handler resolve、Main 单 consumer、reveal duplicate 禁止、deadline/cancel/late cleanup；
3. **Step 3：V1/V2 Closure Harness**  
   真实 Core child、SQLite、隔离 Keychain、Main broker、consumer 与命名 barrier；
4. **Step 4：安全与回归收口**  
   四通道多编码泄漏扫描、资源归零、DFI-4A.2.1/2.2 回归、Workspace 与 Central 串行门禁。

编码后至少串行执行：

```text
Node 24.13.0
focused DFI-4A.2.3 harness
CI=true pnpm run lint
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

Keychain、pipe、child process 与 loopback 必须在非沙箱真实环境执行；正式 Harness 与 Central 测试不得
并行。Evidence 只允许状态、typed code、计数、持续时间、资源指标和 digest。

## 14. 工期估算

| 工作 | 集中工程日 |
| --- | ---: |
| Core reveal service、digest、owner/binding validation | 1～1.5 |
| 一次性 registry、限流、deadline 与 broker 修正 | 1～1.5 |
| Main internal consumer、V1/V2 Closure Harness | 1～2 |
| 安全扫描、全量回归、文档收口 | 1～1.5 |
| 合计 | **4～6.5** |

不含 DFI-4A.4 public Desktop/Renderer 接入、正式 installer 签名/notarization、真实 Provider 或独立 QA 返工。

## 15. 文档评审问题

1. ADR-013 Addendum A 的 owner reveal 安全边界是否可正式接受；
2. Reveal pending 不合并 waiter、成功只留无 Secret tombstone、旧 command 永不 replay 是否正确；
3. Core 从 active head/definition 重算 digest 而不接收 owner/ref 是否关闭 authority spoofing；
4. exact Session/runtime-scoped rate limit、单 owner/model 并发和 global 4 是否足够有界；
5. V1/V2a～V2d 是否诚实处理“用户是否已观察不可证明”，且没有伪 exactly-once；
6. Main internal consumer 是否严格停在 DFI-4A.2.3，不抢跑 webContents/Preload/Renderer；
7. 58 项 QA 与 4～6.5 工程日是否可执行；
8. 是否存在 P0/P1、公共 Contract/Schema 变化或需要用户重新决定的产品范围。

## 16. 当前门禁

```text
DFI-4A.2.2                 PASS/CLOSED
ADR-013 Addendum A         ACCEPTED
DFI-4A.2.3 Plan            REVIEW PASS
DFI-4A.2.3                 PASS/CLOSED
DFI-4A.2                   PASS/CLOSED
DFI-4A.3～4A.4             GATED
DFI-2B / DFI-3 / TGM       GATED
```

用户已分别接受 DFI-4A.2.2、ADR-013 Addendum A 与本计划评审结论，并明确授权 DFI-4A.2.3；
DFI-4A.3、DFI-4A.4、DFI-2B、DFI-3 与 TGM 未因此解锁。

## 17. 实现与开发者验收收口

`0.0.0-dfi.4a.2.3` 已完成本方案授权范围内的实现，当前进入独立 QA，尚未标记
`PASS/CLOSED`：

- 新增 Core `PersonalModelCredentialRevealService` 与共享 owner/model operation gate；每次 reveal
  都重新验证 Runtime Active owner authority、active head、精确 configuration revision、execution
  definition digest 与 Credential binding；
- private broker 的 reveal command 禁止 pending 合并与成功重放，使用 runtime tombstone、单
  owner/model 并发、全局最多 4 个并发、60 秒最多 5 次和 5 秒 Core deadline；mutation 原有幂等语义不变；
- 新增 Main 私有单一 consumer delivery；Secret 只在 fd4/fd5 raw binary frame 与局部
  `Uint8Array` 生命周期内存在，handler、frame、client 和 consumer 均执行清零；
- Closure Harness 使用真实子进程、隔离 SQLite reopen 与临时 macOS Keychain，覆盖 V1、V2a～V2d、
  cancel、deadline、disconnect、late result、restart、不可重放和资源归零；
- 未新增 migration 24，未接 public IPC、Preload、Renderer、Provider、Task lock 或 Agent Loop；默认
  Desktop 生产组合仍保持 unavailable，等待 DFI-4A.4 的真实激活链路。

开发者串行门禁：

- `CI=true pnpm run harness:dfi4a2.3`：**6 files / 31 tests PASS**，覆盖 58 项验收矩阵；
- `CI=true pnpm run lint`：**PASS**，Architecture boundary checks passed；
- `CI=true pnpm run check`：**217 files / 1444 tests + 3 smoke PASS**；
- `CI=true pnpm run check:central`：**302/0/0/0 / BUILD SUCCESS**；
- `CI=true pnpm run check:central:offline`：**302/0/0/0 / BUILD SUCCESS**；
- `pnpm-lock.yaml` 未修改，mtime 保持 `2026-08-16 18:50:57`。

完整 Workspace 首轮曾出现一项既有 Document Worker SIGINT 时序失败；专项连续复跑两次均为
**5/5 PASS**，随后完整 Workspace 从零串行复跑全绿。该过程不作为 DFI-4A.2.3 产品缺陷，但保留为
独立 QA 的复核线索。

当前门禁更新为：

```text
DFI-4A.2.2                 PASS/CLOSED
ADR-013 Addendum A         ACCEPTED
DFI-4A.2.3                 PASS/CLOSED
DFI-4A.2                   PASS/CLOSED
DFI-4A.3～4A.4             GATED
DFI-2B / DFI-3 / TGM       GATED
```

## 18. 独立 QA 与用户接受

Claude Code 已在 Node 24.13.0、JDK 21 与 Docker 环境中严格串行独立复跑并给出
`INDEPENDENT_QA_PASS`，P0～P3 均为 0：

- Reveal/Coordinator/Command/Sensitive Transport/Keychain/Broker Harness：**6 files / 53 tests PASS**；
- Workspace：**217 files / 1444 tests + 3 smoke PASS**；
- Central online：**302/0/0/0 / BUILD SUCCESS**；
- Central offline：**302/0/0/0 / BUILD SUCCESS**；
- pending reveal 不合并、一次性 tombstone、单并发/限频/deadline、全量 owner/head/binding 重校验、
  状态 2/3、V1/V2 与全链路 Buffer cleanup 均通过；
- 未新增 migration 24，未进入 public IPC、Preload、Renderer、Provider、Task lock 或 Agent Loop。

用户已正式接受该独立 QA 结论，DFI-4A.2.3 与 DFI-4A.2 阶段整体正式 `PASS/CLOSED`。后续只允许先进行
DFI-4A.3 详细方案文档评审，不自动进入编码。
