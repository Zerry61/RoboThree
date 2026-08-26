# Enterprise Identity Production Composition 详细修复方案

> 状态：**PLAN REVIEW PASS/CLOSED；EIPC-0 PASS/CLOSED；EIPC-1 PLAN PASS/CLOSED；EIPC-1.1.3.2 PASS/CLOSED；EIPC-1.1.3.3 DOCUMENT REVIEW PENDING / CODING GATED；EIPC-2～EIPC-3 GATED**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 来源：DFI-4A.4.0 `PASS/CLOSED`；`BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION` 已确认成立  
> 适用范围：Enterprise Identity production foundation + Core Runtime Active authority composition  
> 不代表：DFI-4A.4.1 编码授权、真实 OA/MDM 上线、离线租约、实时撤销或个人模型 UI 已可用

## 1. 结论先行

该阻断不能通过“删除固定 `activeUserId`，再从数据库或 Main 参数取一个 userId”修复。当前代码已有
`EnterpriseAccessTokenProvider`、Runtime Activation persistence、CGF-1.3 offline projection 和个人模型
owner authority resolver，但 production composition 缺少一条能够同时证明以下事实的可信链路：

- 当前 enterprise / user / device 身份；
- 当前 Access Token session 是否仍有效；
- Device Trust 是否满足既有企业身份规则；
- 当前 Runtime Active generation 与企业配置 revision；
- `personal_model.configure` entitlement 是否成立；
- CGF-1.3 状态 2 / 状态 3 的确定性投影。

因此本修复必须拆成 **Enterprise Integration 前置实现** 与 **Core composition 接入** 两层。第一层尚未
获得编码授权，故本方案通过评审后也不能直接解锁 DFI-4A.4.1；必须逐批完成、独立 QA、用户接受，最后
由 Unblock Audit 证明 blocker 已关闭。

## 2. 当前代码事实

### 2.1 可直接复用

- `EnterpriseIdentityScope` 已定义 `enterpriseId/userId/deviceId/clientInstanceId`；
- `EnterpriseAccessTokenProvider` 已定义 `acquire/renew/assertCurrentSession` Port；
- Runtime Activation 的 durable generation 已保存受信任的 enterprise identity scope；
- SQLite Runtime Activation persistence 已存在；
- `projectEnterpriseOfflineState()` 已定义 `online/service_temporarily_unavailable/
  enterprise_session_invalid/recovered_update_waiting_for_application`；
- `PersonalModelOwnerAuthorityContextProvider`、strict resolver 与状态 2/3 的个人模型权限语义已存在；
- Central 已有 token / device challenge / enrollment 的服务端基础。

### 2.2 当前缺口

| 编号 | 代码事实 | 风险 |
| --- | --- | --- |
| I1 | `create-desktop-private-runtime.ts` 仍固定 `activeUserId` | 任何 owner/entitlement 都不能视为生产事实 |
| I2 | Core 无 `EnterpriseAccessTokenProvider` production adapter | 无法证明当前 session、scope 与 token permission |
| I3 | Desktop production root 未组合 Device Trust 当前事实 | 无法区分 Central 暂不可达与设备信任失效 |
| I4 | 未把 Runtime Active generation、token session、Device Trust、entitlement 合成一个 snapshot | 各层可能来自不同 identity/revision，产生 scope drift |
| I5 | 当前 boot message 不携带可信企业身份事实 | Main 也不应被改造成 authority owner |
| I6 | 现有公共 Contracts 没有冻结该跨语言 identity/token material | 不能私自依赖 Central JSON 字段或 Controller 实现细节 |
| I7 | Runtime Active 历史 scope 含 activation `clientInstanceId`，Desktop 重启产生新的 transport instance | 不能把历史 activation client 与当前进程 client 混成 owner identity |

## 3. 范围与非目标

### 3.1 本方案覆盖

1. 冻结 Enterprise Identity production Port/Contract 与可信来源；
2. 冻结 current session 与 Runtime Active generation 的一致性规则；
3. 冻结 Device Trust、entitlement 与 offline state 的合成算法；
4. 建立 Core-private immutable authority snapshot；
5. 替换 personal-model composition 中的 fixed/Fake authority；
6. 建立 startup/restart/concurrency/fail-closed 证据；
7. 输出是否可解锁 DFI-4A.4.1 的最终审计结论。

### 3.2 本方案不覆盖

- 不在 DFI-4A 名义下偷偷实现真实 OA 登录、MDM、组织目录或设备注册 UI；
- 不让 Renderer/Main/OS username/process uid 提供 enterprise/user/device/entitlement；
- 不把 bearer token、refresh credential、device private key、签名或原始 Device Trust proof 传给 Renderer/Main；
- 不新建第二套离线租约、配置有效期、设备失联阈值或实时撤销协议；
- 不改写 CGF-1.3、ADR-014、Runtime Activation 或 Enterprise Gateway 既有语义；
- 不进入 personal safe API、Credential、Provider、Task selection、Agent Loop 或 Renderer；
- 默认不新增 migration 25。若 Enterprise Integration 确需新的安全持久事实，必须单独评审其 schema，
  不能借 migration 25 静默落地。

## 4. 权威模型

### 4.1 两类身份必须分离

```text
OwnerIdentity = enterpriseId + userId + deviceId
ActivationProvenance = Runtime Active generation + activation clientInstanceId
CurrentTransportIdentity = runtimeInstanceId + current clientInstanceId
```

- `OwnerIdentity` 决定个人模型归属，继续排除 `clientInstanceId`；
- `ActivationProvenance` 证明企业配置在哪个已接受 generation 下激活，不因进程重启被改写；
- `CurrentTransportIdentity` 只绑定本次 Desktop/Core 会话与命令，不能改变 owner scope；
- 禁止用当前 `clientInstanceId` 覆盖 durable activation scope，也禁止要求它永久等于历史 activation client。

### 4.2 重启后的显式 session rebind

Desktop/Core 重启后，新的 `clientInstanceId` 只能通过 production `EnterpriseAccessTokenProvider` 对当前
session 的验证，建立一个 **runtime-only `EnterpriseSessionBinding`**：

```text
schemaVersion
runtimeInstanceId
currentClientInstanceId
enterpriseId
userId
deviceId
activationGenerationId
tokenSessionAssertionDigest
deviceTrustDecisionDigest
enterpriseConfigurationRevision
compatibilityRevision
entitlementRevision
offlineState
sourceFactsDigest
evaluatedAt
```

该 binding 不保存 bearer、refresh credential、raw token id、device proof 或 private key。它不是新的 Runtime
Activation，不改写 generation，也不是 owner identity。若重启后无法从既有 Enterprise Integration 能力安全
恢复或重新验证 session，则 personal configure/use/reveal 保持状态 3 fail-closed；不能为了“离线仍可用”
新增未评审的 session 缓存或租约。

### 4.3 Core-private authority snapshot

新增建议类型：

```text
RuntimeActiveEnterpriseSessionAuthoritySnapshot
  schemaVersion
  ownerIdentity { enterpriseId, userId, deviceId }
  currentClientInstanceId
  activationGenerationId
  runtimeRegistryRevision
  enterpriseConfigurationRevision
  compatibilityRevision
  entitlement = personal_model.configure
  entitlementGranted
  entitlementRevision
  offlineState
  tokenSessionAssertionDigest
  deviceTrustDecisionDigest
  sourceFactsDigest
  evaluatedAt
```

`sourceFactsDigest` 使用冻结的 domain separator、canonical JSON 与 SHA-256，对上述非敏感字段重算。
Snapshot 只在 Core 内存中存在；业务调用每次通过 Provider 获取或校验当前 snapshot，不接受调用方自报。

### 4.4 entitlement 合成

`entitlementGranted` 只有以下条件同时成立时为 true：

1. 当前 token/session scope 精确匹配 enterprise/user/device；
2. 当前本地可验证 Device Trust 未失效；
3. Runtime Active generation 的 enterprise/user/device 与 session 相同；
4. 已激活企业配置允许 `personal_model.configure`；
5. token permission 与本地激活 policy 的交集允许该 entitlement；
6. compatibility 仍允许 personal model feature。

`entitlementRevision` 是上述非敏感 policy/token-permission basis 的 canonical digest，不包含 bearer 或 proof。
任意来源缺失、损坏或 scope/revision 不一致均失败关闭，不取“较宽”结果。

### 4.5 offline state

- `online`：当前 session、Device Trust、scope、Compatibility、entitlement 均有效且 Central 可用；
- `service_temporarily_unavailable`（CGF-1.3 状态 2）：既有本地可验证 session、Device Trust、scope、
  Compatibility 和 entitlement 仍有效时，允许同 owner configure/use/reveal/delete；
- `enterprise_session_invalid`（状态 3）：禁 configure/use/reveal，仍允许同 owner delete；
- `recovered_update_waiting_for_application`：不静默启用新 revision，沿用 CGF-1.3 已冻结的等待应用语义。

`Central 不可达` 本身不得被投影为状态 3；同样，Central 不可达也不能自动续期 token、扩大 entitlement
或忽略本地已知的 revoked/expired/trust-invalid 事实。

## 5. Production Port 与 Contract 边界

### 5.1 Enterprise Integration production foundation

该层须提供真实、可测试的 production implementations：

- `EnterpriseAccessTokenProvider`；
- `EnterpriseDeviceTrustDecisionProvider`（名称可调整，语义必须冻结）；
- 企业本地 identity credential / Device Signer 的安全持有者；
- 与 Central token/device API 对齐的版本化跨语言 Contract；
- token/session 的安全内存生命周期与既有持久化边界。

若当前产品仍未授权真实企业登录/设备注册，则本层只能交付 Port、受控 Adapter 与 production-disabled
composition，不能宣称 blocker 已关闭。

### 5.2 Core composition provider

新增建议 Port：

```text
RuntimeActiveEnterpriseSessionAuthorityProvider
  loadCurrent(input: {
    runtimeInstanceId
    clientInstanceId
    requiredEntitlement
  }): Promise<RuntimeActiveEnterpriseSessionAuthoritySnapshot>
```

实现必须读取并交叉校验：

1. `EnterpriseAccessTokenProvider.assertCurrentSession()`；
2. 当前 Device Trust decision；
3. `RuntimeActivationPersistence.loadActive()`；
4. 已激活企业配置/compatibility；
5. 当前网络/enterprise service status；
6. 当前 runtime/client identity。

随后由 adapter 将 snapshot 转换为既有 `PersonalModelOwnerAuthorityContext`；不得让个人模型模块直接
重复 token、Device Trust 或 offline 算法。

### 5.3 Process boundary

- authority 在 Core 内组合；Main 只启动 Core 和传输非权威的 process/session identity；
- Boot message 不得携带 enterpriseId/userId/deviceId/entitlement 作为可相信值；
- 若 boot 需要携带 descriptor，只能携带用于定位 Core 自有 credential/provider 的 opaque、签名或
  versioned descriptor，并由 Core 重验；
- Renderer/Preload 无任何 authority API；safe Projection 只能显示最终 permission 与 typed reason。

## 6. 启动、刷新与恢复

```text
schema/runtime activation preflight
  -> Enterprise Integration credential/device signer availability
  -> current token session assertion
  -> Device Trust decision
  -> Runtime Active generation + activated configuration
  -> compatibility + entitlement intersection
  -> runtime-only EnterpriseSessionBinding
  -> authority snapshot
  -> PersonalModelOwnerAuthorityContextProvider ready
  -> personal safe feature readiness
```

规则：

- snapshot 未完成前不得宣布 personal catalog/mutation/reveal/selection feature；
- refresh 使用 monotonic generation/decision revision；旧异步结果不得覆盖新 snapshot；
- owner tuple 改变时清空 runtime-only personal caches、inflight reveal/mutation admission，并按既有
  durable owner namespace 分区读取，禁止跨 owner 回放；
- entitlement 收窄立即阻止新操作，不改写既有 Task lock；
- Core crash 后不从日志、Receipt 或“仅一个 owner row”推断 authority；
- 启动恢复不发送 Secret、不调用 Provider、不盲目创建新 Runtime Activation。

## 7. Typed failure

至少冻结：

```text
enterprise_identity.production_provider_unavailable
enterprise_identity.session_unavailable
enterprise_identity.session_invalid
enterprise_identity.scope_mismatch
enterprise_identity.device_trust_unavailable
enterprise_identity.device_trust_invalid
enterprise_identity.runtime_activation_missing
enterprise_identity.runtime_activation_mismatch
enterprise_identity.compatibility_unavailable
enterprise_identity.entitlement_denied
enterprise_identity.snapshot_corrupt
enterprise_identity.session_rebind_required
enterprise_identity.stale_evaluation
```

错误不得包含 bearer、token id、user/device raw identifier、Credential Reference、Endpoint、路径或内部栈。

## 8. 实施批次

### EIPC-0：Contract 与 authority semantics 冻结（2～4 日）

- 冻结 production identity/token/device-trust Contract；
- 冻结 session binding、snapshot canonical digest、offline 2/3 与 restart 语义；
- 明确是否需要独立 Enterprise Integration schema/ADR；
- docs/contract conformance only，不改 personal model production composition。

### EIPC-1：Enterprise Integration production adapter（6～10 日）

- 实现 token/session 与 Device Trust production adapter；
- 对齐 Central versioned Contract；
- 完成 credential/device signer 安全边界；
- 若真实企业 credential/Device Signer 仍未获产品授权，本批必须结论
  `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`，不得使用 Fake 标记完成。

详细代码核查后确认原 `6～10 日` 估算遗漏 EIPC transport Contract、Central 同决策 Session Lease、
`personal_model.configure` claims profile、Enterprise Credential Store 与 production Device Signer。
后续以 [EIPC-1 详细实施方案](./EIPC-1-ENTERPRISE-INTEGRATION-PRODUCTION-ADAPTER-DEVELOPMENT-PLAN.md)
的 EIPC-1.0～1.3 和 `19～31 日` 估算为准；本父计划旧估算失效。

### EIPC-2：Runtime Active authority composition（5～8 日）

- 实现 session binding + authority snapshot provider；
- 替换 personal owner authority 的 fixed/Fake composition；
- 接入 startup/refresh/restart/owner switch；
- 不接个人模型 Desktop safe/sensitive API。

### EIPC-3：Unblock Harness 与审计（4～6 日）

- 双进程、Core restart、Central online/offline、Device Trust/entitlement scope drift；
- 证明 fixed user/OS user/Main/Renderer authority 零命中；
- 输出 `IDENTITY_COMPOSITION_READY` 或保留 blocker；
- 只有独立 QA PASS + 用户接受后，DFI-4A.4.1 才可重新申请编码授权。

估算合计：**17～28 个集中工程日**，不含真实 OA/MDM 产品接入、独立 QA 与返工。

## 9. QA 验收矩阵（48 项）

### 9.1 Source 与 scope（1～14）

1. production composition 不含 fixed activeUserId；
2. 不使用 `process.getuid()`/OS username；
3. 不接受 Renderer/Preload/Main enterprise/user/device；
4. token session scope 精确匹配 enterprise/user/device；
5. Runtime Active scope 精确匹配 owner tuple；
6. activation client 与 current client 分离；
7. restart 通过显式 session rebind；
8. owner digest 排除 clientInstanceId；
9. current command 绑定 runtime/client identity；
10. enterprise drift fail-closed；
11. user drift fail-closed；
12. device drift fail-closed；
13. runtime generation drift fail-closed；
14. sourceFactsDigest tamper fail-closed。

### 9.2 Token、Trust、entitlement、offline（15～29）

15. online valid；
16. Central unreachable + valid local facts = 状态 2；
17. Central unreachable 不自动 invalid；
18. token expired = 状态 3；
19. token missing fail-closed；
20. token permission denied；
21. Device Trust invalid；
22. Device Trust unavailable 不扩大权限；
23. entitlement policy denied；
24. entitlement revision drift；
25. compatibility denied；
26. recovered update waiting 不静默应用；
27. 状态 2 configure/use/reveal/delete；
28. 状态 3 禁 configure/use/reveal；
29. 状态 3 同 owner delete。

### 9.3 生命周期与并发（30～40）

30. startup 前置失败不宣布 feature；
31. refresh old result 不覆盖 new revision；
32. concurrent refresh 单一 winner；
33. Core restart 不从数据库行数推断 owner；
34. Desktop restart current client 重绑；
35. 无法重绑 typed fail-closed；
36. owner switch 清理 runtime caches；
37. owner switch 不跨 namespace；
38. entitlement 收窄取消新 admission；
39. 已锁 Task 不漂移；
40. shutdown timer/subscription/request 归零。

### 9.4 安全与边界（41～48）

41. bearer/refresh credential 不进日志；
42. device private key/signature/proof 不进 Evidence；
43. snapshot 不含 Secret；
44. typed error 不含 raw identity；
45. Renderer/Main authority import 零命中；
46. 无 migration 25 或未评审 identity schema；
47. DFI-4A.4.1～4A.4.3 无超前实现；
48. Workspace + Central online/offline 串行全绿。

## 10. 允许与禁止修改范围

本文件通过后仍不自动允许任何代码修改。后续各子批单独授权时，范围必须按所属层冻结：

- Enterprise Integration：versioned Contract、Central/client adapter、credential/device signer 与 tests；
- Core composition：`services/core` application/ports/bootstrap/adapters 与 tests；
- 禁止 Renderer、personal Credential transport、Provider、Agent Loop、Document Worker、DFI-2B/3、TGM；
- 禁止在同一批同时改 Enterprise Integration 与 DFI-4A.4.1 safe API，避免半切换；
- 禁止新增依赖、migration 或 lockfile 变更，除非该子批文档明确评审并获用户授权。

## 11. 文档评审问题

1. 将 identity blocker 拆成 Enterprise Integration 前置与 Core composition 是否必要；
2. Owner / Activation Provenance / Current Transport 三类身份是否分离正确；
3. restart session rebind 是否避免改写 Runtime Active generation；
4. entitlement 是否必须由 token permission 与 activated policy 取交集；
5. offline 状态 2/3 是否完全复用 CGF-1.3 且未新增时钟；
6. Core 是否应是 authority composition owner，Main/Renderer 零权威输入；
7. 无真实 production token/device adapter 时继续 BLOCKED 是否正确；
8. 是否需要独立 Enterprise Integration ADR/schema 评审；
9. 48 项 QA 与 17～28 日是否可执行；
10. 给出 PASS / PASS_WITH_REVISIONS / FAIL 和 P0～P3 发现。

## 12. 当前门禁

```text
DFI-4A.4.0                                 PASS/CLOSED
Enterprise Identity Production Composition PLAN REVIEW PASS/CLOSED
EIPC-0                                     DEVELOPER QA PASS / INDEPENDENT QA PENDING
EIPC-1～EIPC-3                             GATED
DFI-4A.4.1～DFI-4A.4.3                    GATED
DFI-2B / DFI-3 / TGM                       GATED
```

本方案与配套两份 Transport 文档已通过复核并由用户正式接受。EIPC-0 已完成范围内实现，唯一输出为
`AUTHORITY_SEMANTICS_FROZEN`，当前等待独立 QA；该结果不等于 `IDENTITY_COMPOSITION_READY`，也不关闭
`BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION`。只有 EIPC-3 独立 QA PASS 并由用户接受后，该 blocker
才能正式关闭。
