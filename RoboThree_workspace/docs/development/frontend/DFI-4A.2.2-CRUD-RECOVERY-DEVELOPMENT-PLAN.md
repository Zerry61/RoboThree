# DFI-4A.2.2 Personal Model CRUD Coordinator 与 Durable Recovery 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-21  
> 负责人：Codex 5.6  
> 上游：DFI-4A.0、DFI-4A.1、DFI-4A.2.1 `PASS/CLOSED`  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 架构依据：ADR-013、ADR-013 Addendum A、DFI-4A Revision 1、DFI-4A.1 Revision 3.3、DFI-4A.2 Plan  

本方案已经文档复核 `PASS（P0=0 / P1=0 / P2=0 / P3=0）`，用户已明确授权进入 DFI-4A.2.2
编码。实现必须严格遵守本文件边界；DFI-4A.2.3 与后续批次不自动解锁。

## 1. 批次目标

DFI-4A.2.2 将 DFI-4A.1 的 Operation Journal / aggregate Persistence 与 DFI-4A.2.1 的真实
Keychain Adapter / 敏感通道组合成可恢复的 create、update、delete Application Foundation：

1. Core 成为 Personal Model Credential mutation 的唯一业务编排者；
2. 安全业务意图与 Secret bytes 分轨进入 Core，不把 Secret 混入 JSON、HTTP 或 SQLite；
3. 严格执行 Transaction A → Keychain → durable observation CAS → Transaction B；
4. 以 durable intent、`inspect()` 和 binding proof 收敛 C1～C4、U1～U3、D1～D3；
5. 建立有界、幂等、失败关闭的 startup recovery；
6. 保持 Reveal、真实 Provider、Task lock、公开 Desktop CRUD 和 Renderer UI 继续 GATED。

本批结束后只能声明 **CRUD Coordinator / Durable Recovery Foundation** 完成。当前生产 Desktop 仍不会
向用户开放个人模型增删改，也不会把个人模型接入 Agent Loop。

## 2. 当前代码事实

### 2.1 已存在并直接复用

- migration 23 已建立 owner namespace、immutable definitions、heads、append-only status、preferences、
  operations 和 command receipts 七张 `STRICT` 表；migration 1～22 未改写；
- `PersonalModelPersistence` 已提供 `beginCredentialOperation()`、`advanceCredentialObservation()`、
  `commitCreateOutcome()`、`commitUpdateOutcome()`、`commitDeleteOutcome()`、
  `markOperationManualAttention()` 与 bounded `loadPending()`；
- `PersonalModelOperation` 已保存 safe target definition、expected/target revision、target/previous
  credential reference、durable observation 和 phase revision；
- InMemory / SQLite 两个 Adapter 已实现聚合 Transaction B、Receipt replay、typed conflict 与
  `delete_pending`；
- `PersonalCredentialStore` 已提供 `store / replace / inspect / resolve / delete`；
- DFI-4A.2.1 已实现 fd4/fd5 敏感二进制通道、Main Client、Core Server、one-shot macOS helper、
  helper trust check 与 production activation fail-closed；
- `StrictPersonalModelOwnerAuthorityResolver` 已冻结状态 2/3 与 delete data-sovereignty 规则。

### 2.2 尚不存在或尚未接通

- `PersonalModelCredentialCoordinator` 与 startup recovery coordinator；
- 从 Runtime Active 企业身份、Device Trust、entitlement 与离线状态生成 authority input 的生产
  `PersonalModelOwnerAuthorityContextProvider`；
- `PersonalModelDeletionGuard` 和 `PersonalCredentialReferenceUsage`；
- `SqlitePersonalModelPersistence`、真实 Keychain Store、Coordinator 与默认 Desktop Runtime 的正式组合；
- 生产 helper descriptor 的可信安装来源；
- Desktop Local `v1alpha2` 目前只有 safe Personal Model summary，没有 create/update/delete 公共命令；
- private broker v1 header 只有 transport identity、command identity、model/revision、request digest 和
  Secret 长度，不包含 Provider、Endpoint、provider model id 或 display name；
- `desktop-private-main.ts` 的 broker handler 当前固定返回 `credential_store_unavailable`。

### 2.3 代码事实带来的实施裁定

1. **不把完整 CRUD 业务对象塞入敏感通道 header。** fd4/fd5 继续只承担已准备 mutation 的 Secret
   delivery 或 metadata-only execute；
2. **增加 Core 内部两阶段 Application API。** safe `prepare()` 先冻结业务意图并写 Transaction A，
   broker handler 再按相同 command identity 执行 Keychain step；
3. **DFI-4A.2.2 不新增公共 HTTP/IPC。** 本批通过 Core application harness 直接调用 `prepare()`；未来
   DFI-4A.4 才把 safe Desktop command 映射到该入口；
4. **不使用 hard-coded Desktop fixture 身份。** 当前默认 Desktop Runtime 没有可验证的 Personal Model
   owner context，因此生产 broker handler 继续 typed fail-closed；本批用 Port + 受控 Harness Provider
   证明真实语义，DFI-4A.4 才完成 Runtime Active authority composition；
5. **不新增 migration 24。** 如 migration 23 或现有 Port 无法表达恢复事实，必须停止编码并回文档评审，
   禁止改写 migration 23 或静默新增表。

## 3. 范围与非目标

### 3.1 本批交付

- Core 内部 strict create/update/delete command 与 canonical request digest；
- `PersonalModelCredentialCoordinator`；
- `PersonalModelCredentialRecoveryCoordinator`；
- owner authority context Port、Unavailable production default 与 deterministic Fake；
- deletion guard / credential reference usage Port、conservative production default 与 Fake；
- broker-to-coordinator adapter，只执行已经 durable prepared 的 mutation；
- C1～C4、U1～U3、D1～D3 的 InMemory、SQLite close/reopen、真实隔离 Keychain 与 child-process Harness；
- bounded startup recovery、资源归零、四通道泄漏扫描和边界守卫。

### 3.2 明确不交付

- Reveal 或 Secret 反向返回；
- Desktop public CRUD Contract、Core private HTTP route、`ipcMain.handle`、Preload sidecar、Renderer UI；
- 真实 Provider 调用、PersonalModelRuntimeRegistry 生产接入、Task selection/lock、Agent Loop；
- 企业 Credential、Windows Credential Manager、正式 installer/signing/notarization；
- 默认模型持久偏好、个人模型测试连接、自动状态探测；
- 删除正在被 Task exact lock 使用的模型；
- migration 24、依赖、root config 或 lockfile 变更。

## 4. Command 与双轨入口

### 4.1 Core 内部 safe command

新增 Core 私有 discriminated union，不从公共 Contract root 导出：

```text
PreparePersonalModelCredentialMutationCommand =
  CreateCommand {
    commandId, requestDigest, personalModelId,
    provider, protocol, endpointInput, providerModelId, displayName,
    capabilities, credentialInputExpected=true
  }
  | UpdateCommand {
    commandId, requestDigest, personalModelId,
    expectedConfigurationRevision, expectedExecutionDefinitionDigest,
    provider, protocol, endpointInput, providerModelId, displayName,
    capabilities,
    credentialMutation=reuse_existing | replace_secret,
    credentialInputExpected
  }
  | DeleteCommand {
    commandId, requestDigest, personalModelId,
    expectedConfigurationRevision, expectedExecutionDefinitionDigest,
    credentialInputExpected=false
  }
```

- create 必须 `credentialInputExpected=true`；
- Endpoint、Provider、protocol 或 Key 变化的 update 必须 `credentialMutation=replace_secret`、新 ref 且
  `credentialInputExpected=true`，防止旧 Key 被静默发送到新的上游安全边界；
- 仅 display name、provider model id 或 capabilities 变化时允许
  `credentialMutation=reuse_existing`、`credentialInputExpected=false`，复用原 credential ref；
- delete 不携带 Secret；
- Endpoint 必须复用 DFI-4A.1 canonicalizer，禁止 Coordinator 复制 URL 规则；
- `requestDigest` 固定为 domain-separated canonical JSON SHA-256，绑定 schema version、commandId、
  command type、personalModelId、expected configuration/execution identity、canonical target business material、
  credential mutation mode 与 capabilities；**不得包含 Secret、Secret hash、Secret shape、credentialRef、
  transportRequestId 或 transport deadline**；
- broker `deadlineAt` 只是每次 fd4 transport attempt 的短期截止时间，可在同一 durable command 的新
  transport attempt中更新，不改变 business request digest；
- Secret 的第一次实际绑定由 `store/replace(operationId, preallocatedRef, bytes)` 决定。相同 operation/ref
  使用不同 bytes 必须由 Keychain Adapter 返回 `credential_input_already_bound`，不得在 SQLite 保存
  Secret checksum。

### 4.2 prepare 与 execute 分离

```text
safe prepare(command)
  → resolve verified owner authority
  → validate current head/revision/request digest
  → allocate target ref when required
  → build immutable target definition
  → Transaction A / durable operation

sensitive execute(header, secret bytes)
  → resolve current owner authority again
  → load operation by commandId
  → match command type/model/revision/request digest；独立校验当前 transport deadline
  → Keychain store/replace/delete or inspect-only
  → durable observation CAS
  → aggregate Transaction B
  → safe internal result
```

Broker 不允许凭 header 自行构造 target definition，也不允许在没有 prepared operation 时直接写 Keychain。
`not_prepared`、authority/revision/digest mismatch 必须在 Keychain 调用前 typed fail-closed。

### 4.3 非敏感配置 update

仅 display name、provider model id 或 capabilities 变化的 update 不经过 fd4/fd5，也不 resolve Secret：

1. `prepare()` 写 update intent，target definition 复用原 credential ref；
2. Coordinator `inspect()` 旧 ref；
3. 只有 matching `present` observation 才写 observation CAS 与 Transaction B；
4. 不调用 `resolve()`、`store()` 或 `replace()`；
5. `absent/unavailable/mismatch` 转 typed failure 或 manual attention，不伪造成功。

## 5. Owner namespace、authority 与生产激活边界

### 5.1 Owner namespace 初始化

owner namespace 是 Local Core SQLite 权威事实，不由 Runtime Active identity Provider 返回：

1. startup 先 `loadActiveOwnerNamespace()`；
2. 不存在时由 Core 生成 256-bit random namespace key，并调用 `initializeOwnerNamespace()`；
3. 并发初始化只允许一个 active row，loser reload winner；
4. 每次派生 owner identity 前重算 `namespace_key_check_digest` 与 record digest；
5. namespace key 不进入 Contract、broker header、日志、Evidence 或 owner context Port；
6. 本批不创建 retired namespace，不做 rotation/GC。

### 5.2 新增 authority context Port

```text
PersonalModelOwnerAuthorityContextProvider.load(action)
  → enterpriseId / userId / deviceId
  → entitlementGranted / entitlementRevision
  → online | enterprise_temporarily_unavailable | enterprise_session_invalid
```

Coordinator 必须把 SQLite active namespace 与该 Runtime Active material 共同交给既有
`StrictPersonalModelOwnerAuthorityResolver`，不得自行复制权限规则。

### 5.3 失败关闭规则

- 不接受 Renderer、Main、broker header 自报 owner、enterprise、user、device 或 entitlement；
- 没有 Runtime Active authority context 时 create/update/use/reveal 全部拒绝；
- `enterprise_temporarily_unavailable` 继续允许同 owner create/update/delete；
- `enterprise_session_invalid` 禁止 create/update，但允许经同一 identity 证明的 delete；
- Central 暂时不可达本身不等价于 permission denied；
- 本批不新增离线租约、失联阈值、配置过期或实时撤销语义。

### 5.4 本批 production composition

- 默认 Desktop Runtime 继续使用 `UnavailablePersonalModelOwnerAuthorityContextProvider`；
- 默认 broker handler 在 authority/provider/helper descriptor 任一未验证时返回 typed unavailable/denied；
- 受控 E2E child 通过显式测试 factory 注入 verified authority、SQLite path 与隔离 Keychain descriptor；
- 测试 factory、env 或 fixture 不得被生产入口自动读取；
- DFI-4A.4 未完成前，不声明用户可用的 production CRUD。

## 6. Coordinator 状态机

### 6.1 Create

1. authority、request digest、model-not-exists 校验；broker execute时再校验当前 transport deadline；
2. Transaction A 前预分配随机 opaque credential ref；
3. Transaction A 写 create intent 与 immutable target definition；
4. broker 收到 Secret 后调用 `store()`；
5. matching present observation CAS；
6. Transaction B 原子提交 definition + active head + `unverified` status + committed operation + Receipt；
7. 不执行测试连接，不把新模型自动设为默认。

### 6.2 Update

- expected configuration/execution identity 必须匹配 current active head；
- sensitive update 使用新 ref 与 `replace()`；旧 ref 在本批不由 `replace()` 删除；
- target revision 提交后，若旧 ref usage 无法证明为 unused，outcome 固定
  `update_committed_cleanup_pending`；
- 非敏感配置 update 使用 §4.3，不进入敏感 pipe；
- policy/status 只按已冻结的 carry-forward 规则生成，不读取 Provider 健康或伪造 available。

### 6.3 Delete

- `prepare(delete)` 的 Transaction A 原子推进 head `active → delete_pending`；
- 在任何 Keychain delete 前调用 `PersonalModelDeletionGuard`；
- guard `in_use` 或 `unknown` 均失败关闭，不删除 Keychain item；
- exact ref `absent` 才允许 Transaction B tombstone + durable Receipt；
- `unavailable`、deadline 或 mutation response uncertain 不猜测删除结果，转 durable manual attention；
- delete committed 后不得通过旧 head 或旧 Receipt 重新激活模型。

### 6.4 Idempotency 与并发

- `operationId === commandId`；
- same owner + commandId + same request digest 返回 pending state 或 exact Receipt replay；
- same owner + commandId + different digest typed conflict；
- per `(owner, personalModelId)` 单 mutation；不同 owner 即使 modelId 相同也隔离；
- persistence CAS 是最终并发裁决，Main/Core 内存 mutation gate 只做负载保护；
- timeout/cancel 不等价于外部 mutation 失败，必须经 `inspect()` 或 recovery 分类。
- transport deadline 只约束新的前台 attempt；Transaction A 已 durable 后，startup recovery 使用独立有界
  recovery deadline 并按 durable intent 收敛，不因原 transport deadline 过期重新授权、重建 command 或伪造
  `timed_out` business outcome。

## 7. Recovery Coordinator

### 7.1 启动顺序

受控 Personal Model runtime 的顺序固定为：

```text
SQLite migration/preflight
→ PersonalModelPersistence.start
→ load/initialize active owner namespace
→ PersonalCredentialStore.start + capability probe
→ verified owner authority context
→ loadPending(limit=100)
→ recover each operation in stable order
→ Personal Model CRUD capability ready
```

完整 Desktop Core 是否 ready 与 Personal Model CRUD capability readiness 分离：默认 authority/helper 未激活时，
Core 仍可服务既有功能，但个人模型 CRUD 明确 unavailable。不得在 Core ready 后后台静默创建第二套恢复事实。

### 7.2 有界恢复

- 只恢复当前 verified owner；不得枚举或猜测其他 owner digest；
- 排序固定为 `createdAt → commandId`；单批最多 100；
- 同 owner 同时只能有一个 recovery owner；
- recovery 不生成新 commandId、request digest、credential ref、definition revision 或 policy selection；
- 每次 transition 都使用 operation phase revision CAS；
- `manual_attention` 是 durable terminal，不自动重试；
- repeated startup / close-reopen 必须幂等收敛。

### 7.3 恢复矩阵

| 窗口 | Durable fact | `inspect()` / 外部事实 | 收敛 |
| --- | --- | --- | --- |
| C1 Transaction A 前 | 无 operation | 不调用 | 新 command 可执行 |
| C2 intent 后/store 前 | create intent + target ref | absent | manual_attention，不提交 model |
| C3 store 后/Transaction B 前 | intent 或 matching observation | matching present | observation CAS 后单次 Transaction B |
| C3 mismatch | intent/observation identity 不同 | present mismatch | typed conflict + manual attention，不提交 |
| C4 Transaction B 后/响应丢失 | committed Receipt | 不调用 | exact Receipt replay |
| U1 update intent 后/replace 前 | update intent + new ref | new absent | manual_attention，旧 revision 保持 active |
| U2 new ref 保存后/新 revision 前 | intent/matching observation | new matching present | 提交新 immutable revision |
| U3 新 revision 后/old cleanup 前 | cleanup_pending Receipt | old present/absent | 仅 usage=unused 才幂等删除；否则保留 |
| D1 delete intent 后 | head delete_pending | target present | 阻止新选择；guard clear 后继续 delete |
| D2 Keychain delete 后/tombstone 前 | delete intent | target absent | Transaction B tombstone + Receipt |
| D3 tombstone 后/响应丢失 | committed Receipt | 不调用 | exact Receipt replay |

本批不宣称 SQLite + Keychain exactly-once。完成标准是：最多一个 committed business outcome、不会用猜测事实
覆盖 durable truth、无法证明时保守进入 manual attention。

## 8. Guard 与 cleanup Port

### 8.1 PersonalModelDeletionGuard

返回严格联合类型：`clear | in_use | unknown`。证明 material 至少绑定 owner identity、model id、
configuration revision 与 execution definition digest。

- 生产默认实现固定 `unknown`；
- 只有 DFI-4A.3 接入 Task exact-lock usage 后才能提供真实 `clear`；
- Harness Fake 可显式产生三种结果；
- `in_use/unknown` 均不调用 Keychain delete。

### 8.2 PersonalCredentialReferenceUsage

返回：`unused | referenced | unknown`，并绑定 exact credential ref 与 configuration revision。

- 生产默认实现固定 `unknown`，因此 U3 保留旧 ref；
- Fake `unused` 只用于证明 cleanup 算法；
- cleanup 失败不回滚已经提交的新 revision；
- cleanup result 只推进 operation/receipt 的 cleanup 状态，不创建第二套 model head。

## 9. 错误与安全 Receipt

### 9.1 Core typed errors

Core Application 至少冻结：

```text
personal_model.not_prepared
personal_model.permission_denied
personal_model.conflict
personal_model.not_found
personal_model.invalid_transition
personal_model.in_use_or_usage_unknown
personal_model.manual_attention_required
personal_model.credential_unavailable
personal_model.credential_operation_uncertain
personal_model.deadline_exceeded
personal_model.cancelled
```

private broker 不增加新的业务错误枚举，只做确定性映射：`not_prepared →
credential_transport_invalid_request`、permission denied → `credential_store_access_denied`、revision/digest
conflict → `credential_transport_conflict`、manual attention/uncertain → `credential_operation_uncertain`、
deadline/cancel 沿用现有 typed code。不得将内部异常、Keychain OSStatus、Endpoint、credential ref、
owner digest 或 helper metadata 放入返回消息。

### 9.2 Safe result

Coordinator 的 safe result 只包含：commandId、command type、status/outcome、model id、可公开的 committed
configuration revision、typed error code、replayed。完整公开 Projection 留到 DFI-4A.4。

## 10. Secret 生命周期

- `prepare()` 永远不接收 Secret；
- create/update Secret 只由 fd4 binary frame传入 broker handler；
- handler clone 必须最小化，结束、cancel、timeout、disconnect 和异常路径均 `fill(0)`；
- Coordinator 不把 Secret 保存为 class field、closure、Promise registry、error、Receipt 或 Evidence；
- Keychain `store/replace` 返回后立即清零调用侧 bytes；
- 禁止 `Buffer.toString()`、Base64/hex、JSON、argv、env、temp file、HTTP body、日志或 Trace；
- delete 必须 zero-length sensitive body；非敏感配置 update 不发送 sensitive frame。

## 11. 修改边界

### 11.1 编码授权后允许

- `services/core/src/application/**`：Coordinator、recovery、safe internal command；
- `services/core/src/ports/**`：authority context、deletion guard、reference usage；
- `services/core/src/adapters/memory/**`、`services/core/src/adapters/sqlite/**`：只补现有 Port/Conformance
  所需实现，不改 schema；
- `services/core/src/adapters/credential/**`：broker-to-coordinator adapter 与 Store composition；
- `services/core/src/bootstrap/**`：受控 runtime factory/readiness wiring；
- `services/core/src/desktop-private-main.ts`：只允许把固定 unavailable handler替换为 fail-closed、可注入的
  internal handler；
- `apps/desktop/src/main/personal-credential-broker-client.ts` 与对应 fixture：仅允许 typed internal result/E2E
  所需最小修改；
- private broker Contract、frame 与 header 保持 DFI-4A.2.1 字段/语义兼容，不增加完整 CRUD business material；
- 对应 tests/harness/scripts 与批次结束后的版本/治理文档收口。

### 11.2 禁止

- `apps/desktop/src/preload/**`、`apps/desktop/src/renderer/**`、public `ipcMain.handle`；
- Desktop Local 公共 CRUD schema/route、Core private HTTP CRUD route；
- services/central-service、services/document-worker；
- migration 1～23 改写或 migration 24；
- Provider、Runtime Registry production selection、Task lock、Agent Loop、Compaction、TGM；
- Reveal、`resolve()` Secret 返回 Main/Renderer、企业 Credential；
- 新依赖、root config、`pnpm-lock.yaml`。

## 12. 实施步骤

### Step 1：纯 Core command / coordinator conformance

- internal strict command 与 request digest；
- owner namespace initializer、authority context / guard / usage Ports 与 conservative defaults；
- InMemory Store/Persistence create/update/delete happy path、idempotency、conflict；
- Secret 生命周期与 safe Receipt。

### Step 2：durable recovery 与 SQLite

- recovery coordinator、bounded scan、phase CAS；
- C/U/D 窗口的 SQLite close/reopen；
- Transaction B 原子性、manual attention、Receipt replay；
- migration 23 digest/preflight 回归，不新增 migration。

### Step 3：真实 broker / isolated Keychain Harness

- broker handler只执行 prepared operation；
- fd4/fd5 + real Core child + isolated Keychain helper；
- Main/Core/helper crash、response loss、late result、cancel/deadline；
- U3/D1 conservative guard、资源归零、泄漏扫描；
- default Desktop production path保持 fail-closed。

## 13. QA 验收矩阵

### 13.1 Command / authority（1～18）

1. create/update/delete strict discriminator 与 unknown fields 拒绝；
2. safe request digest canonical、字段顺序稳定；
3. request digest 不含 Secret/hash/shape/ref；
4. same command/digest replay；same id/different digest conflict；
5. create requires credential input；delete禁止 credential input；
6. Endpoint/Provider/protocol/Key变化强制 new ref；
7. display name/provider model id/capabilities-only update复用old ref且不走sensitive pipe；
8. Endpoint复用 DFI-4A.1 canonicalizer；
9. owner authority只来自 context provider；
10. Main/Renderer自报 owner/entitlement字段不可表达；
11. online允许 create/update/delete；
12. temporarily unavailable允许同 owner create/update/delete；
13. session invalid拒绝 create/update；
14. session invalid允许同 owner delete；
15. authority context absent production fail-closed；
16. 不使用 hard-coded fixture identity进入 production composition；
17. owner namespace首次初始化、并发单winner、重启复用；
18. namespace key/check digest损坏fail-closed且不进authority Port。

### 13.2 CRUD / atomicity（19～40）

19. create Transaction A前预分配 ref；
20. create broker未 prepare时零 Keychain调用；
21. create matching header/operation才 store；
22. create成功status固定unverified；
23. create不测试连接、不设默认；
24. update expected revision/execution digest CAS；
25. Provider/Endpoint/protocol/Key变化生成新ref和immutable revision；
26. provider model id/display/capabilities-only update inspect-only；
27. update old ref不被replace静默删除；
28. U3 no usage proof保留old ref；
29. U3 Fake unused后幂等cleanup；
30. delete Transaction A原子进入delete_pending；
31. delete_pending立即阻止新选择；
32. deletion guard in_use拒绝；
33. deletion guard unknown拒绝；
34. deletion guard clear才调用delete；
35. Transaction B任一写冲突整体回滚；
36. durable Receipt与operation outcome一致；
37. committed Receipt exact replay；
38. owner/model mutation隔离；
39. different owner相同model id不串线；
40. operationId严格等于commandId。

### 13.3 Recovery（41～61）

41. C1；
42. C2；
43. C3；
44. C3 mismatch；
45. C4；
46. U1；
47. U2；
48. U3 unknown；
49. U3 unused；
50. D1；
51. D2；
52. D3；
53. unavailable observation不授权Transaction B；
54. observation ref/operation/revision/binding四项全匹配；
55. startup scan limit=100；
56. createdAt/commandId稳定排序；
57. recovery不生成新command/ref/digest/revision；
58. 原transport deadline过期不改写durable intent，recovery使用独立有界deadline；
59. repeated startup幂等；
60. manual_attention durable且不自动重试；
61. InMemory/SQLite close-reopen同一Conformance。

### 13.4 Transport / crash / safety（62～79）

62. broker handler只接受prepared operation；
63. header与operation type/model/revision/digest全匹配，transport deadline独立校验且不进business digest；
64. private broker Contract/header不扩完整CRUD material；
65. Main restart后durable operation可由新transport request恢复；
66. Core restart后旧channel拒绝、新channel按durable fact恢复；
67. helper mutation前crash；
68. mutation后response前crash；
69. timeout/cancel/disconnect单terminal；
70. late result不改写durable terminal；
71. create/update body finally清零；
72. delete body为0，非敏感update不发送sensitive frame；
73. raw/Base64/URL/hex/Secret-shape四通道扫描0；
74. SQLite/Receipt/log/Trace/evidence/HTTP/JSON IPC 0 Secret；
75. canonical Endpoint/credential ref/owner digest不进Main safe result；
76. pipe/helper/inflight/timer/buffer资源归零；
77. production authority/helper缺失时Core ready但personal CRUD unavailable；
78. no public IPC/Preload/Renderer route；
79. migration 1～23 digest不变、无24且无Reveal/Provider/Task lock/Agent Loop超前。

### 13.5 全量门禁（80～84）

80. focused DFI-4A.2.2 harness；
81. `CI=true pnpm run lint`；
82. `CI=true pnpm run check`；
83. `CI=true pnpm run check:central`；
84. `CI=true pnpm run check:central:offline`。

正式 Harness、Workspace、Central online/offline 必须使用 Node 24.13.0 / JDK 21 / Docker 严格串行。

## 14. Evidence allowlist

允许：scenario id、window id、status、typed error code、replayed、计数、duration、resource metrics、digest。

禁止：Secret、Secret形态、credential ref、canonical Endpoint、owner digest、完整本地路径、PID、helper path、
OSStatus、原始异常、Provider body、用户正文。

## 15. 工期

| 工作项 | 集中工程日 |
| --- | ---: |
| Core command / authority / coordinator | 2～3 |
| durable recovery / SQLite conformance | 2～3 |
| broker + isolated Keychain E2E | 1～2 |
| 安全扫描、资源收口、门禁 | 1～2 |
| 合计 | 6～10 |

独立 QA 和返工不包含在上述集中工程日内。相对父计划的 5～8 日上调到 6～10 日，原因是当前代码事实确认
生产 authority context 与 safe prepare ingress 尚未接通；本批必须先建立明确 Port 与两阶段边界，不能把
hard-coded fixture identity 或完整 CRUD material塞进敏感通道走捷径。

## 16. 文档评审问题

1. safe prepare + sensitive execute 两阶段是否正确解决 broker header 不含完整业务 material 的现状；
2. request digest排除Secret/hash/ref、由Keychain first binding保证Secret幂等是否安全；
3. 本批不新增公共 HTTP/IPC、由DFI-4A.4映射safe prepare是否边界正确；
4. 当前缺生产 Runtime Active authority source时保持default broker fail-closed是否诚实；
5. 非敏感配置 update inspect-only、Endpoint/Provider/protocol/Key 变化要求新 Key/new ref 是否正确；
6. U3与delete guard使用conservative production default是否避免抢跑Task lock；
7. C/U/D recovery是否存在猜测Keychain事实或伪exactly-once；
8. startup capability readiness与完整Core readiness分离是否合理；
9. migration 23是否足够，能否坚持无migration 24；
10. 84项QA与6～10工程日是否可执行；
11. 是否存在新的P0/P1、公共Contract或产品决策需求。

## 17. 当前门禁

```text
DFI-4A.0            PASS/CLOSED
DFI-4A.1            PASS/CLOSED
DFI-4A.2.1          PASS/CLOSED
DFI-4A.2.2          PASS/CLOSED
DFI-4A.2.3          PASS/CLOSED
DFI-4A.3～4A.4      GATED
DFI-2B / DFI-3      GATED
TGM                 GATED
```

实现与开发者串行门禁、独立 QA 和用户接受均已完成，DFI-4A.2.2 正式 `PASS/CLOSED`。后续
DFI-4A.2.3 也已单独完成并关闭；历史门禁未被自动跳过。
