# DFI-4A.2 受控 Credential Broker、Keychain Adapter 与 CRUD 详细实施方案

> 状态：**DFI-4A.2 PASS/CLOSED；DFI-4A.2.1～2.3 PASS/CLOSED；ADR-013 Addendum A ACCEPTED**  
> 日期：2026-08-21  
> 负责人：Codex 5.6  
> 上游：DFI-4A.0、DFI-4A.1 `PASS/CLOSED`  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 架构依据：ADR-013、ADR-013 Addendum A、DFI-4A Revision 1、DFI-4A.0、DFI-4A.1 Revision 3.3  

本方案已经文档复核并由用户正式确认。DFI-4A.2.1、DFI-4A.2.2 已完成实现、独立 QA 和用户接受，正式
`PASS/CLOSED`。DFI-4A.2.3 Reveal/Closure 也已完成实现、独立 QA 与用户接受；DFI-4A.2 阶段整体
正式 `PASS/CLOSED`。DFI-4A.3 只进入详细方案文档评审，仍保持编码门禁。

## 1. 目标

DFI-4A.2 把 DFI-4A.1 已完成的 Domain、Operation Journal、Persistence 与 Fake Store 接到真实 macOS
Credential 基础设施，但仍不进入个人模型 Provider、任务选择或 Renderer 页面：

1. 建立不复用普通 HTTP、SSE 或 JSON IPC 的 Main ↔ Core 敏感通道；
2. 实现 Core-owned、one-shot native helper 形态的 macOS Keychain Adapter；
3. 实现 create / update / delete Application Coordinator 与启动恢复；
4. 在 ADR-013 Addendum A 被用户明确接受后，实现 owner-only reveal Foundation；
5. 证明 C1～C4、U1～U3、D1～D3、V1～V2 的恢复分类；
6. 证明 Secret 不进入 SQLite、普通 Contract、日志、Trace、argv、env、HTTP 或 Evidence；
7. 保持真实 Provider、Task lock、Desktop public CRUD 与 Renderer UI 继续 GATED。

本阶段完成后，只能声明 Credential Broker / Keychain / CRUD Foundation 已实现。生产用户可见能力仍需
DFI-4A.3 的 Provider/Task lock 和 DFI-4A.4 的 Desktop Safe Interface 联合验收。

## 2. 当前代码事实

### 2.1 已存在并直接复用

- DFI-4A.1 已实现 `PersonalCredentialStore` Port：
  `store(operationId, preallocatedRef, bytes)`、`replace(operationId, oldRef, newRef, bytes)`、
  `inspect(ref)`、`resolve(ref)`、`delete(operationId, ref)`；
- DFI-4A.1 已实现 256-bit `pmcr1.*` opaque reference allocator、strict `present / absent / unavailable`
  observation、binding/observation digest 与聚合 `PersonalModelPersistence`；
- migration 23 已提供 owner namespace、immutable definitions、heads、append-only status、preferences、
  operations、receipts 七表；
- create/update/delete 的 durable safe target material、`delete_pending` 与 Transaction A/B 已存在；
- DFI-4A.0 repair.1 已用隔离临时 Keychain 证明 Security.framework `SecItem*` 生命周期、错误映射、
  mutation 前后 crash、TLS/SSRF 与四通道泄漏扫描；
- `CorePrivateSupervisor` 目前通过 `fork(... serialization: "json")` 发送 boot/shutdown，Core 业务走
  loopback HTTP Bearer；该通道的生命周期和恢复逻辑已稳定。

### 2.2 尚不存在

- 生产 macOS Keychain Adapter、生产 native helper、helper trust verifier 与包内 helper manifest；
- 可保留原始 Secret bytes 的 Main ↔ Core 敏感通道；
- Personal Model create/update/delete/reveal Application Coordinator 与 startup recovery；
- Desktop public CRUD Contract、Preload、Renderer 页面和个人模型 Provider；
- 正式 Electron 打包、Developer ID 签名、notarization 与 helper 升级/卸载流水线。

### 2.3 代码事实带来的结论

1. **不改造既有 JSON IPC。** boot/shutdown/readiness 继续使用 `serialization: "json"`，避免把成熟生命
   周期通道升级为承载 Secret 的混合协议；
2. **不通过 Core private HTTP 传 Secret。** HTTP 继续只承载非敏感业务数据；
3. **新增双匿名二进制管道。** Main 启动 Core child 时额外建立 request/response 两条匿名 pipe；
4. **生产 helper activation 失败关闭。** 当前缺正式打包签名链，DFI-4A.2 可以实现 production-intent
   Adapter 与受控测试激活，但未通过签名安装包 E2E 前不得声明 production ready；
5. **不提前接 Renderer。** DFI-4A.2 的 Main Broker 只向后续 DFI-4A.4 提供内部 typed 接口，本批不注册
   `ipcMain.handle`、不改 Preload、不新增用户可调用 API。

## 3. 批次拆分与门禁

### 3.1 DFI-4A.2.1：Sensitive Transport + Keychain Adapter Foundation

交付：

- `desktop-private/personal-credential-broker-v1` 内部 transport header schema；
- Main ↔ Core 双匿名 pipe、binary frame codec、channel session handshake；
- Core → one-shot native helper pipe protocol；
- macOS `SecItemAdd / CopyMatching / Update / Delete` Adapter；
- helper path/digest/signature/regular-file/no-symlink trust check Port；
- 隔离临时 Keychain conformance、资源归零和泄漏扫描；
- production helper 缺失或 trust 不成立时 typed fail-closed。

不交付 CRUD Coordinator，不修改 migration，不接 public Desktop API。

### 3.2 DFI-4A.2.2：CRUD Coordinator + Durable Recovery

交付：

- create/update/delete command、owner authority、deadline/cancel/idempotency；
- Transaction A → Keychain → observation CAS → Transaction B 编排；
- startup pending-operation recovery；
- C1～C4、U1～U3、D1～D3；
- old Credential cleanup 与 delete guard 的保守 Port/Fake；
- Core restart、Main restart、helper crash 和 response loss E2E。

不交付 reveal，不接 Provider/Task lock/Renderer。

### 3.3 DFI-4A.2.3：Owner Reveal + Closure Harness

前置硬门槛：ADR-013 Addendum A 必须先由用户明确接受。

交付：

- owner-only reveal 内部命令；
- bounded rate/concurrency/deadline policy；
- V1/V2、disconnect/cancel/late response；
- Secret 生命周期与 Buffer cleanup；
- DFI-4A.2 全矩阵闭环。

Reveal 不建立 durable success receipt、不自动 replay；进程重启后必须由新的用户手势生成新 command。

每个编码批次均需独立 QA 和用户接受；复核或授权某一批不自动解锁下一批。

## 4. Main ↔ Core 敏感通道

### 4.1 拓扑决策

```text
Renderer（DFI-4A.2 不接入）
  │ future DFI-4A.4 context-isolated IPC
Electron Main / PersonalCredentialBrokerClient
  │ fd 4: request pipe，binary framed，Main → Core
  │ fd 5: response pipe，binary framed，Core → Main
Local Core child / PersonalCredentialBrokerServer
  │ anonymous stdin/stdout pipes，one-shot helper
signed Personal Credential Helper
  │ Security.framework SecItem API
macOS Keychain
```

- 现有 fd 3 Node IPC 只保留 `desktop.core.boot / ready / failed / shutdown`；
- `spawnCoreChild()` 增加两条额外 pipe，不把 `serialization` 改成 `advanced`；
- `desktop.core.boot` 只 additive 增加非敏感 `sensitiveChannelInstanceId` 和 helper safe descriptor；
- Core child 固定读取 request fd、写入 response fd；pipe 缺失或实例不匹配时只关闭个人 Credential 能力，
  不让企业模型和整个 Desktop 伪失败；
- Core restart 创建新的 channel instance；旧 pipe、旧 inflight 和旧 response 全部失效。

### 4.2 Internal transport schema

内部 subpath：`@robothree/contracts/desktop-private/personal-credential-broker-v1`。

- 不从 `@robothree/contracts` 根入口导出；
- Renderer/Preload architecture guard 禁止导入该 subpath；
- schema 只定义 bounded header 和 typed result，不包含 Secret body；
- raw Secret 使用独立 `Uint8Array` frame，不做 Base64/hex/JSON string；
- 该协议不是 Desktop Local 公共 Contract，不改变 `v1alpha1/v1alpha2` 产品语义。

请求 header 最少包含：

```text
protocolVersion
channelInstanceId
commandId
commandType: create | update | delete | reveal
transportRequestId
clientInstanceId
personalModelId
expectedConfigurationRevision?
commandRequestDigest
deadlineAt
secretByteLength
```

响应 header 最少包含：

```text
protocolVersion
channelInstanceId
commandId
transportRequestId
status: completed | rejected | cancelled | timed_out | uncertain
typedErrorCode?
secretByteLength
```

`ownerScopeDigest`、canonical Endpoint、credentialRef、Keychain account 与 Runtime Handle 不进入 Main header；
Core 必须从 Runtime Active owner authority 和 durable model facts 重新派生/加载。

### 4.3 Identity 分离

- `commandId + commandRequestDigest` 是稳定业务身份；`commandRequestDigest` 只覆盖 canonical safe command
  metadata，不含 Secret、channel instance、client instance、deadline 或 transport request id；
- Core 不信任 Main 传入的 digest，必须在 strict parse、Endpoint canonicalization 和 owner authority 校验后
  重算，再把它写入 owner-scoped durable operation；
- `transportRequestId` 每次 pipe 尝试新建，只用于 inflight correlation，不进入 Operation/Receipt；
- Main/Core 重启后的同 command replay 可以使用新 channel/client/transport identity，但必须保持相同业务
  command digest；
- Secret 不计算或持久化可离线比对的 digest；same command/same-or-different Secret 由 Keychain Adapter 在
  受控内存中 constant-time 比较并返回 replay 或 `credential_input_already_bound`。

### 4.4 Binary frame

固定 frame：

```text
4-byte big-endian header length
UTF-8 strict JSON header
4-byte big-endian body length
raw body bytes
```

- header 上限 16 KiB，Secret body 上限 16 KiB；metadata-only 命令 body 必须为 0；
- JSON 必须 strict parse；codec 在普通 `JSON.parse` 前检测并拒绝重复键，同时拒绝 unknown field 和非法 UTF-8；
- length 溢出、截断、拼包、乱序、unknown discriminator、body/header 长度不一致均关闭 channel；
- 同一 channel 最多 4 个并发请求，registry 最多 256 项、TTL 10 分钟；
- 每个 `(clientInstanceId, personalModelId)` 同时只允许一个 mutation；
- cancel、deadline、disconnect 只产生一个 terminal；late response 被丢弃且不得覆盖 terminal；
- 每个可控 Buffer 在 sender callback、receiver completion、cancel、deadline、disconnect 和异常分支清零；
- 不宣称 JavaScript String 可可靠清零，因此 Secret 不转换为 String。

## 5. macOS Keychain production-intent Adapter

### 5.1 Helper 形态

- Core 每个 Credential 操作启动一个 one-shot helper，不维护常驻通用 Secret daemon；
- helper 使用 Objective-C/C + Security.framework，不引入第三方 npm/native 依赖；
- 生产操作只允许 `store / replace / inspect / resolve / delete`，不提供任意 service/account/query；
- metadata 使用 bounded strict frame，Secret 使用独立 raw bytes；
- helper 不接受 Secret 的 argv/env/file path；
- stdout 仅作为 binary response pipe，stderr 默认关闭；失败只返回 typed code；
- helper 超时或退出后，Core 必须 `inspect()` durable target 再分类，不猜测 mutation 是否发生。

### 5.2 Keychain item layout

```text
class          generic password
service        com.robothree.personal-model.credential.v1（固定）
account        pmcr1.<256-bit random opaque ref>
valueData      Secret bytes
generic        versioned binding metadata（operationId / credentialRevision / bindingDigest）
synchronizable false
accessible     when-unlocked-this-device-only
```

- 不在 item metadata 写 enterpriseId、userId、deviceId、modelId、Endpoint、Provider 或显示名称；
- owner 绑定由 Core SQLite owner identity 与 definition 证明，helper 不自行判断业务 owner；
- `store` 重放时对已有 item 的 operation/ref/binding 和 incoming bytes 做 constant-time 比较；同命令不同
  bytes 返回 `credential_input_already_bound`；
- `replace` 创建新 ref，不覆盖或先删旧 ref；旧 ref 只有获得引用使用证明后才能 cleanup；
- `delete` 的 not-found 在已存在 durable delete intent 时可作为 absent 证明；
- `inspect` 永不返回 Secret；`resolve` 只返回最短生命周期的 bytes。

### 5.3 Helper trust

生产 activation 前必须同时成立：

1. helper 位于固定包内路径且 canonical containment 成立；
2. regular file、非 symlink，owner/mode 符合预期；
3. 文件 SHA-256 与随应用发布的 immutable manifest 相符；
4. macOS code signature 与 RoboThree designated requirement/Team ID 相符；
5. helper 协议版本与 Core 支持版本精确匹配；
6. helper 资源在启动和每次 spawn 前复核，不信任 Renderer/Main 传入的任意路径。

当前仓库没有正式 Electron 打包/签名链。因此：

- DFI-4A.2.1 自动化可编译测试 helper 并使用隔离临时 Keychain；
- production adapter 默认 activation 为 disabled/fail-closed，除非 verified helper descriptor 到位；
- 不得用 ad-hoc 签名测试结果冒充 Developer ID/notarized production ready；
- 正式签名安装包 E2E 是 DFI-4A.4 关闭门槛；失败必须回文档评审，不退化为 SQLite/普通文件。

### 5.4 错误映射

至少映射：

```text
credential_store_unavailable
credential_store_locked
credential_store_not_found
credential_store_access_denied
credential_store_corrupted
credential_store_cancelled
credential_store_conflict
credential_input_already_bound
credential_operation_uncertain
credential_store_internal
```

OSStatus、helper path、Keychain item、Secret、Endpoint 与原始系统错误不得进入普通错误详情。

## 6. CRUD Application Coordinator

### 6.1 Command ownership

`PersonalModelCredentialCoordinator` 是 create/update/delete 的唯一生产编排入口：

1. strict parse command 与 body size；
2. 从 Runtime Active facts 解析 `PersonalModelOwnerAuthority`；
3. 校验 entitlement、offline state、model/head expected revision 与 request digest；
4. create/update 在 Transaction A 前预分配新 credentialRef；
5. Transaction A 写 durable operation；delete 同事务把 head 置为 `delete_pending`；
6. 调用 Keychain Adapter；
7. `inspect()` 并将 strict observation CAS 到 operation；
8. 聚合 Transaction B 提交 definition/head/status/operation/receipt；
9. 返回安全 Receipt；
10. finally 清零 Secret bytes。

Coordinator 不把 Secret、canonical Endpoint、credentialRef、owner digest 或 helper metadata返回 Main。

### 6.2 Create

- create command 固定 provider/protocol/canonical Endpoint/providerModelId/displayName 与 Secret；
- 成功后 status 固定 `unverified`，不做“测试连接”；
- C2 重启且 ref absent 时没有 Secret 可恢复，转 `manual_attention`，不自动要求或猜测原 Secret；
- C3 matching present 时只执行 Transaction B；binding mismatch 失败关闭；
- C4 原样重放 durable Receipt，不二次 store。

### 6.3 Update

- display-name-only update 不需要 Secret，属于 DFI-4A.1 聚合事实路径，不进入敏感 pipe；
- Provider/Endpoint/model identifier/Key 变化创建新 immutable configuration revision；
- 更换 Key 必须新 ref，禁止原地覆盖；
- U1/U2 重启依据新 ref `inspect()` 分类；
- U3 保留新 revision，旧 ref cleanup 由 `PersonalCredentialReferenceUsage` 证明；
- DFI-4A.2 仅提供 conservative Port/Fake，production 无引用证明时保持
  `credential_cleanup_pending`，不得抢跑 DFI-4A.3 Task lock 集成。

### 6.4 Delete

- Transaction A 将 head 置为 `delete_pending`，从这一刻阻止新选择；
- 删除前必须通过 `PersonalModelDeletionGuard`；DFI-4A.2 仅提供 Port/Fake，production 未接 Task lock 时返回
  `personal_model.in_use_or_usage_unknown`，不得猜测安全；
- D2 只有 exact ref `absent` 才提交 tombstone + Receipt；unavailable/uncertain 进入 manual attention；
- D3 重放 durable Receipt，不再次删除；
- 状态 3 仍允许同 owner 删除，但不能 create/update/reveal。

### 6.5 Startup recovery

- runtime 启动顺序：Persistence/preflight → Keychain capability probe → bounded pending scan → recovery →
  business server ready；
- Credential Store unavailable 不使整个 Core/企业模型失效，但个人模型能力必须明确 unavailable；
- pending scan 按 owner + createdAt + commandId 稳定排序，每批最多 100；
- recovery 不读取 Renderer、不生成新 commandId/ref、不修改原 request digest；
- manual attention 是 durable terminal，不能后台静默重试；
- repeated startup/recovery 必须幂等收敛。

## 7. Reveal Foundation

### 7.1 前置决策

Model Experience Spec 已确定“所有者可主动查看个人 Key”。ADR-013 Addendum A 已完成文档复核并由
用户正式 `ACCEPTED`；DFI-4A.2.3 也已在该边界下完成独立 QA 与用户接受。该历史前置门禁没有被跳过。

### 7.2 语义

- reveal 每次重新校验 Runtime Active owner、Device Trust、entitlement、offline state、model revision；
- 只允许当前 owner 的 personal model；企业 Credential 永不进入该路径；
- 同一 `(owner, model)` 一次只允许一个 reveal；全局最多 4 个；每 owner/model 每 60 秒最多 5 次；
- Core deadline 5 秒，Main deadline 7 秒；超时/断连不返回空字符串伪装成功；
- V1 owner 校验后、resolve 前崩溃：无 Secret 外发，用户可用新 command 重新发起；
- V2 resolve 后、Main 交付前崩溃：Secret 丢弃，返回 unavailable/uncertain，不自动重放；
- reveal 只使用 runtime-scoped bounded registry，不写 durable success Receipt，不进入普通 Event/Audit；
- Evidence 只记录 attempt count、status、duration、typed code 与 digest，不记录 Secret。

### 7.3 与 DFI-4A.4 的边界

DFI-4A.2.3 只证明 Main 内部 broker 可以把 bytes 交给一个受控测试 consumer。真正的
`webContentsId` 绑定、Preload sidecar、Renderer 局部组件清理、隐藏/导航/unmount 与无复制按钮，属于
DFI-4A.4/后续 DFE 真实接入，不在本批伪造。

## 8. 恢复矩阵

| 窗口 | Durable fact | 外部事实 | 收敛 |
| --- | --- | --- | --- |
| C1 intent 前 | 无 operation | 无 | 新 command 可执行 |
| C2 intent 后/store 前 | intent + target ref | absent | manual_attention，不提交 model |
| C3 store 后/Transaction B 前 | intent/observation | matching present | 单次 Transaction B |
| C4 Transaction B 后/响应丢失 | committed receipt | 不读 | Receipt replay |
| U1 update intent 后/replace 前 | update intent/new ref | new absent | manual_attention，旧 revision 保留 |
| U2 new ref 已保存/revision 未提交 | matching present | new present | 提交新 revision |
| U3 revision 已提交/old cleanup 前 | cleanup_pending | old present/absent | 有 usage proof 才清理；否则保留 |
| D1 delete intent 后 | head delete_pending | target present | 禁新选择，继续 delete |
| D2 Keychain delete 后/tombstone 前 | delete intent | target absent | 提交 tombstone + Receipt |
| D3 tombstone 后/响应丢失 | committed receipt | 不读 | Receipt replay |
| V1 owner 校验后/resolve 前 | 无 durable success | 未返回 Secret | 新用户手势重试 |
| V2 resolve 后/Main 交付前 | 无 durable success | Secret 仅死亡进程内存 | 丢弃，不自动重放 |

本阶段明确不宣称 SQLite + Keychain exactly-once；依靠 durable intent、external inspect、binding proof、
聚合 Transaction B 与 conservative manual attention 达成可恢复的 at-most-one committed business outcome。

## 9. 修改边界

### 9.1 DFI-4A.2.1 允许

- `packages/contracts/src/desktop-private/**` 与 private subpath export；
- `apps/desktop/src/main/core-private-supervisor.ts`、Main 私有 Credential Broker/codec 与对应测试；
- `services/core/src/desktop-private-main.ts`、Core credential adapter/helper/codec 与测试；
- `services/core/native/macos/**`；
- 必要的 helper build/harness 脚本与测试资源；
- 批次结束后的版本、CHANGELOG、DEVELOPMENT-LOG、README 收口。

### 9.2 DFI-4A.2.2 允许

- `services/core/src/application/**`、`ports/**`、`bootstrap/**`、对应 memory/sqlite adapter/tests；
- Main 私有 broker 的内部调用接口和 E2E fixture；
- 不新增 migration 24；如发现 migration 23 不足，必须停止并回文档评审，禁止静默改写 migration 23。

### 9.3 DFI-4A.2.3 允许

- Core/Main 内部 reveal path、bounded registry、tests/harness；
- ADR-013 Addendum 状态收口，但仅在用户明确接受之后。

### 9.4 全阶段禁止

- `apps/desktop/src/preload/**`、`apps/desktop/src/renderer/**` 和 public `ipcMain.handle` CRUD；
- Desktop Local 公共个人模型 CRUD API、删除 DFE Mock/GATED 状态；
- Central、Document Worker、企业 Credential、Provider Adapter、TaskRuntimeSelection、Agent Loop、
  Compaction、CapabilityLock；
- migration 1～23 改写、migration 24、第三方依赖、`pnpm-lock.yaml`；
- 默认登录 Keychain 自动化写入、用户真实 API Key、Secret Fixture/Snapshot；
- `/usr/bin/security -w`、Secret argv/env/temp file、普通 HTTP/SSE/JSON IPC。

## 10. QA 验收矩阵

### 10.1 Sensitive transport（1～18）

1. 既有 JSON boot/ready/shutdown 字节和行为回归不变；
2. request/response 使用独立匿名 pipe，普通 IPC/HTTP 无 Secret；
3. channel instance 每次 Core launch 唯一，restart 后旧 frame 拒绝；
4. strict header 拒绝 unknown field/discriminator/version；
5. header/body length 上限、截断、溢出、拼包、乱序失败关闭；
6. metadata-only command 拒绝非零 body；
7. create/update 拒绝空 Secret 和超过 16 KiB Secret；
8. raw bytes 不转 Base64/hex/JSON String；
9. commandId same digest replay；same id different digest conflict；
10. wrong client instance/model/revision/channel session 拒绝；
11. per-model 单 mutation、global 4 concurrent、registry 256/TTL 10m；
12. cancel/deadline/disconnect 单 terminal；
13. late response 不覆盖 terminal；
14. sender/receiver/cancel/deadline/disconnect Buffer cleanup；
15. Core restart 清零旧 inflight/pipe/subscriber/buffer；
16. malformed frame 不回显原始 bytes；
17. Renderer/Preload 禁止导入 desktop-private subpath；
18. Core private HTTP access log/body 0 Secret 命中。

### 10.2 Keychain/helper（19～38）

19. helper fixed path containment、regular file、non-symlink；
20. manifest SHA-256 mismatch 失败关闭；
21. signature/designated requirement mismatch 失败关闭；
22. protocol version mismatch 失败关闭；
23. production descriptor 缺失时 personal Credential unavailable，Core 仍可 ready；
24. isolated Keychain store/inspect/resolve/delete；
25. replace 创建新 ref且旧 ref保留；
26. store/replace same operation + same bytes replay；
27. same operation/ref + different bytes → input_already_bound；
28. inspect strict present/absent/unavailable；
29. locked/not_found/access_denied/corrupted/cancelled/internal 映射；
30. helper before mutation crash；
31. helper after mutation before response crash；
32. helper deadline/forced termination 后通过 inspect 分类；
33. Keychain metadata 不含 owner/model/Endpoint/Provider/display name；
34. no synchronizable/iCloud；accessible policy 固定；
35. Secret 不进 argv/env/temp file/stderr；
36. 10 轮 helper lifecycle PID/pipe/temp/keychain resource 归零；
37. default login Keychain untouched；
38. ad-hoc test signature 不产生 production-ready claim。

### 10.3 CRUD/recovery（39～65）

39. create authority/entitlement/offline state；
40. create 成功状态固定 unverified、无测试连接；
41. create Transaction A 前预分配 ref；
42. create C1/C2/C3/C3-mismatch/C4；
43. update expected revision CAS；
44. display-only update 不走敏感 channel；
45. Key/Provider/Endpoint/model id update 产生新 immutable revision；
46. update U1/U2/U3；
47. U3 无 usage proof 不删除 old ref；
48. U3 Fake proof 后 old ref 幂等 cleanup；
49. delete Transaction A 原子进入 delete_pending；
50. delete_pending 立即阻止新选择；
51. delete guard in_use/unknown 均拒绝 mutation；
52. delete D1/D2/D3；
53. 状态 3 同 owner 可 delete，create/update 禁止；
54. wrong owner/revision/digest typed fail；
55. Transaction B 任一表冲突整体回滚；
56. response loss replay exact Receipt；
57. startup pending scan limit/order；
58. repeated startup recovery 幂等；
59. unavailable observation 不授权 Transaction B；
60. matching observation ref/operation/revision/binding 四项全校验；
61. manual_attention durable 且不后台静默重试；
62. SQLite close/reopen + real isolated Keychain 恢复；
63. Main crash/Core 继续与 Core crash/Main 清理；
64. no new command/ref/policy selection during recovery；
65. migration 23 与 DFI-4A.1 conformance 全量回归。

### 10.4 Reveal（66～77）

66. Addendum 未接受时 reveal_unavailable；
67. owner-only，企业 Credential 永不 reveal；
68. 状态 2 可 reveal，状态 3 拒绝；
69. expected model revision/ref binding 精确；
70. per-owner/model rate limit 与 concurrency；
71. V1 无 Secret 外发；
72. V2 不自动 replay；
73. cancel/deadline/disconnect 单 terminal；
74. late result 丢弃；
75. no durable success Receipt / no Secret audit；
76. 受控 consumer completion 后 Buffer cleanup；
77. Core/Main restart 后旧 reveal command 不可复用。

### 10.5 安全、资源与边界（78～92）

78. 随机 canary raw/Base64/URL-encoded/hex/Secret-shape；
79. parent stdout 独立扫描；
80. diagnostic stderr 独立扫描；
81. evidence JSON 独立扫描；
82. test trace 独立扫描；
83. 每通道负向注入证明 scanner 能失败；
84. SQLite/Contract Fixture/Snapshot/Receipt/Event/Audit/HTTP/IPC JSON 0 命中；
85. Credential Reference/canonical Endpoint/owner digest 不进 Main safe result；
86. helper/pipe/request/inflight/Buffer/resource count 全 0；
87. Main/Preload/Renderer/Central/Document Worker 边界扫描；
88. migration 1～23 byte/digest 不变；无 migration 24；
89. dependencies、root config、`pnpm-lock.yaml` 不变；
90. DFI-4A.1、DFI-2A、ARH、DFI-1 全量回归；
91. Workspace check + Central online/offline 严格串行；
92. 无 Provider、Task lock、Desktop public CRUD、Renderer UI 或 DFI-4A.3/4 超前实现。

## 11. 开发者门禁

每个子批至少串行执行：

```text
Node 24.13.0
focused DFI-4A.2 tests/harness
CI=true pnpm run lint
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

Keychain/pipe/child-process/loopback 测试需要非沙箱真实执行；正式 Harness 与 Central 测试不得并行。

Evidence allowlist：状态、typed code、计数、持续时间、资源指标和 digest。禁止 PID、Secret、完整
Endpoint、credentialRef、owner digest、完整路径、Provider body 或用户正文。

## 12. 工期估算

| 批次 | 集中工程日 |
| --- | ---: |
| DFI-4A.2.1 Sensitive Transport + Keychain Adapter | 5～8 |
| DFI-4A.2.2 CRUD + Recovery | 5～8 |
| DFI-4A.2.3 Reveal + Closure | 3～5 |
| 独立 QA/返工余量 | 3～6 |
| 合计（含本批独立 QA/返工余量） | 16～27 |

该估算不含正式 Electron installer、Developer ID/notarization、Windows Credential Adapter、真实 Provider
或 Renderer 页面接入。

## 13. 文档评审问题

1. 保留 JSON lifecycle IPC、增加 fd4/fd5 双匿名 binary pipe 是否是最小风险方案；
2. private transport subpath 是否与公共 Desktop Contract 完全隔离；
3. one-shot helper 与 Keychain item layout 是否支持 DFI-4A.1 的 binding observation；
4. 当前无正式打包签名链时，production activation fail-closed 的声明是否诚实；
5. create/update/delete Coordinator 是否保持 Core 为唯一业务 owner；
6. U3 old ref cleanup 和 delete guard 是否正确等待 DFI-4A.3 usage/Task lock 证明；
7. reveal 不 durable replay、Addendum 先接受的边界是否正确；
8. C/U/D/V 恢复是否存在猜测外部事实或伪 exactly-once；
9. 92 项 QA 与 16～27 工程日是否可执行；
10. 是否出现需要用户重新决策的 P0/P1、公共 Contract 变化或产品范围扩张。

## 14. 当前状态

```text
DFI-4A.0            PASS/CLOSED
DFI-4A.1            PASS/CLOSED
DFI-4A.2 Plan       REVIEW PASS / CONFIRMED
DFI-4A.2.1          PASS/CLOSED
DFI-4A.2.2          PASS/CLOSED
DFI-4A.2.3          PASS/CLOSED
DFI-4A.2            PASS/CLOSED
DFI-4A.3～4A.4      GATED
DFI-2B / DFI-3      GATED
TGM-1+              GATED
```

用户已正式接受 DFI-4A.2.1 与 DFI-4A.2.2 独立 QA，两批均正式 `PASS/CLOSED`。DFI-4A.2.2 详细方案见
[`DFI-4A.2.2-CRUD-RECOVERY-DEVELOPMENT-PLAN.md`](./DFI-4A.2.2-CRUD-RECOVERY-DEVELOPMENT-PLAN.md)，
文档复核与实现均已完成。

ADR-013 Addendum A 已由用户正式接受。DFI-4A.2.3
详细方案见 [`DFI-4A.2.3-OWNER-REVEAL-CLOSURE-DEVELOPMENT-PLAN.md`](./DFI-4A.2.3-OWNER-REVEAL-CLOSURE-DEVELOPMENT-PLAN.md)；
本批已通过独立 QA 并由用户接受，DFI-4A.2.3 与 DFI-4A.2 整体均正式 `PASS/CLOSED`。
