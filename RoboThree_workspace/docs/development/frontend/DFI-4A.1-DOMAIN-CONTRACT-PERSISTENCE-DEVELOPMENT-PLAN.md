# DFI-4A.1 Domain、Contract 与 Persistence Foundation 详细实施方案

> 状态：**USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-21  
> 负责人：Codex 5.6  
> 上游：DFI-4A.0-repair.1 与 DFI-4A.0 `PASS/CLOSED`  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 架构依据：ADR-011、ADR-013、ADR-013 Addendum A、ADR-014、ARH-3、DFI-2A、DFI-4A Revision 1  

本方案已完成文档复核、用户编码授权、范围内实现、独立 QA 与用户接受，DFI-4A.1 正式
`PASS/CLOSED`。该关闭不自动解锁 DFI-4A.2～4A.4。

## 1. 目标

DFI-4A.1 为个人模型建立可安全演进、可精确恢复的基础事实：

1. Desktop Local `v1alpha2` additive safe schema；
2. Core 私有 Personal Model Domain 与 canonical digest；
3. 不可变配置版本、独立状态版本和当前 head；
4. opaque Credential Reference 与私有 canonical Endpoint 的持久化边界；
5. 聚合 `PersonalModelPersistence`、Operation Journal、durable Receipt 与只读查询 Port；
6. InMemory/SQLite 同一 Conformance 与 forward-only migration 23；
7. Fake `PersonalCredentialStore`，只用于恢复与 conformance；
8. `PersonalModelRuntimeRegistry` representation/resolver foundation，但不接生产 Agent Loop。

本批完成后只证明 Domain/Contract/Persistence Foundation，不声明真实 Keychain、真实 Provider、
个人模型 CRUD 页面或任务执行已经上线。

## 2. Revision 2 修订关闭项

Revision 1 技术负责人复审结论为 `FAIL / REVISION REQUIRED`（P0=0 / P1=2 / P2=5 / P3=1）。
Revision 2 只修订文档方案，不修改生产代码，并逐项关闭以下结构缺口：

| 等级 | 发现 | Revision 2 冻结 |
| --- | --- | --- |
| P1 | Credential Reference 分配与 C3/U2 恢复语义未闭合 | `credentialRef` 在 Transaction A 前由 Core 私有 allocator 预生成，随机 opaque、不可推导；Fake/未来真实 Broker 均以 `store(operationId, credentialRef, secret)` 幂等写入，重放复用 durable operation 中的同一 ref |
| P1 | Transaction B 缺少跨表原子提交边界 | Application 层只使用聚合式 `PersonalModelPersistence` 写入口；`commitCreateOutcome` / `commitUpdateOutcome` / `commitDeleteOutcome` 在一个 SQLite transaction 中原子提交 definition、head、status、operation phase 与 receipt |
| P2 | 四类 revision/digest 公式不足 | 冻结 domain separator、字段全集、NFC、canonical JSON、空值和 `sha256:<64 hex>` 格式；`executionDefinitionDigest` 精确定义执行子集 |
| P2 | migration 23 仍是概念表结构 | 补齐六表字段、类型/长度、CHECK、FK、UNIQUE、索引、STRICT 与 schema-preflight 清单 |
| P2 | 状态 carry-forward 缺少来源证明 | carry-forward 状态必须保存来源 configuration revision、来源 status revision 和来源 status record digest，读取时重算验证 |
| P2 | owner authority 稳定派生接口未冻结 | 新增 Core 私有 `PersonalModelOwnerAuthority` material，`ownerScopeDigest` 绑定 enterprise/user/device，排除 `clientInstanceId` |
| P2 | 公共状态字段缺少一致性矩阵 | Contract safe summary 使用 strict schema 约束八种状态的 `available`、`unavailableReason` 和 `credentialState` 组合 |
| P3 | `operationId` 与 `commandId` 混用 | 首期固定 `operationId === commandId`，数据库和 Port 统一使用 `commandId`，不引入第二个 operation identity |

## 3. Revision 3 修订关闭项

Revision 3 只修订文档方案，不修改生产代码，并在 Revision 2 基础上冻结以下六项结构边界：

| 编号 | 修订项 | Revision 3 冻结 |
| --- | --- | --- |
| R3-1 | Owner namespace 持久化 | migration 23 调整为七表，新增 `personal_model_owner_scope_namespaces`；owner identity 统一使用 `ownerScopeNamespaceRevision + ownerScopeDigest`，禁止复用 Prompt Cache namespace，Core 重启后必须恢复同一 active namespace |
| R3-2 | Status 改为 immutable history | `personal_model_status_facts` 以 `(owner namespace, owner digest, model, configuration, statusRevision)` 为主键；状态更新只追加新行，carry-forward 使用自引用复合 FK 锁定不可变来源 |
| R3-3 | Delete intent 立即阻止新选择 | `personal_model_heads.selection_state = active | delete_pending | tombstoned`；Transaction A 原子执行 begin delete + `active -> delete_pending`，`listActiveHeads()` 只返回 active |
| R3-4 | inspect binding metadata | `inspect(credentialRef)` 固定返回 `credentialRef / createdByOperationId / credentialRevision / credentialBindingDigest / state`；C3/U2 只有全部匹配才允许 Transaction B |
| R3-5 | cursor queryRevision | `queryRevision` 为当前 owner 下 active head tuple 的 canonical SHA-256，cursor 使用独立 HMAC domain 绑定 queryRevision 与 last sort key；集合变化返回 stale cursor |
| R3-6 | Endpoint canonicalization | 使用 WHATWG URL；仅 HTTPS；IDNA ASCII 小写 hostname；拒绝尾点、userinfo、query、fragment、encoded slash/backslash、null byte；规范 path 但不静默改写重复斜杠 |

### 3.1 Revision 3.1 P2/P3 收口

Revision 3.1 只做文档收口，不修改生产代码，并把 Revision 3 中仍可能产生实现歧义的点补成可编码规则：

| 编号 | 发现 | Revision 3.1 冻结 |
| --- | --- | --- |
| R3.1-P2-1 | owner namespace 私有字段与 active 唯一约束仍不够可编码 | `namespace_key` 不进入 `record_json` 或 `record_digest`；active 唯一性必须通过 SQLite partial unique index 证明，不写成表内伪约束 |
| R3.1-P2-2 | owner-scoped operation/receipt 仍以裸 `command_id` 为主键会弱化 namespace owner identity | `personal_model_operations` 与 `personal_model_command_receipts` 主键改为 `(owner_scope_namespace_revision, owner_scope_digest, command_id)`；所有查找、重放、冲突判断均使用 owner identity + command id |
| R3.1-P2-3 | delete operation 未冻结删除目标 credential ref，恢复时无法执行或核验 Credential delete | delete Transaction A 必须持久化 current configuration revision、current execution digest 与 `previous_credential_ref`；delete operation 缺失该 ref 失败关闭 |
| R3.1-P3-1 | Endpoint percent-encoding “统一 canonical 形式”仍可能被不同实现解释不一致 | path canonicalization 明确为：拒绝 `%2f/%5c` 大小写变体；保留重复斜杠；dot segment 解析后逐 segment percent-encode，unreserved 字符解码，hex uppercase，禁止静默改变 Provider 语义 |
| R3.1-P3-2 | Port 签名仍可能被实现成 owner digest shorthand | 所有 owner-scoped Port、cursor、receipt 与 operation API 均必须显式接收 `PersonalModelOwnerIdentity`；禁止 overload 为裸 `ownerScopeDigest` |

### 3.2 Revision 3.2 P1/P2/P3 收口

Revision 3.2 只做文档收口，不修改生产代码，并关闭 Revision 3.1 中仍可能阻塞后端编码的结构歧义：

| 编号 | 发现 | Revision 3.2 冻结 |
| --- | --- | --- |
| R3.2-P1-1 | migration 表结构仍有 `REFERENCES ...` 省略与伪类型，无法作为 schema-preflight 权威 | 七表字段全部使用 SQLite 可实现类型与显式 CHECK；所有 FK 写出完整 referenced columns，禁止省略号或实现时自由补齐 |
| R3.2-P1-2 | Credential step 只持久化 observation digest，C3/U2 Transaction B 无法重放完整 inspect binding proof | Operation 增加 bounded `credential_observation_json`，只保存 `credentialRef/createdByOperationId/credentialRevision/credentialBindingDigest/state` 五字段及 digest；Transaction B 必须从该 durable observation 复核 |
| R3.2-P2-1 | `queryRevision` tuple 使用 `namespaceRevision` 简写，易与其他 namespace 混淆 | canonical tuple 字段固定为 `ownerScopeNamespaceRevision`，不得使用 `namespaceRevision` shorthand |
| R3.2-P2-2 | Endpoint canonicalization 未冻结 raw input pre-scan 与 WHATWG parser 的执行顺序 | 先对原始输入做 null、userinfo marker、encoded slash/backslash、反斜杠和尾点候选拒绝，再进入 WHATWG URL；parse 后再次校验 normalized components |
| R3.2-P2-3 | Receipt 对 definition 的 nullable FK 不能覆盖 status/preference/delete outcome 的事实证明 | Receipt FK 只用于带 committed personal definition 的 outcome；status/preference/delete 必须由同事务写入的对应 fact 或 head state 证明，Receipt replay 不得单独证明业务事实 |
| R3.2-P3-1 | owner namespace `retired` 状态可能被误解为本批实现 rotation | DFI-4A.1 只创建/恢复 active namespace；`retired` 是未来 rotation 兼容枚举，本批不得创建 retired row、不得 GC、不得迁移旧 namespace |

### 3.3 Revision 3.3 最终可编码性收口

Revision 3.3 继续保持 docs-only，并关闭 Revision 3.2 中四个会造成恢复或实现分歧的缺口：

| 编号 | 发现 | Revision 3.3 冻结 |
| --- | --- | --- |
| R3.3-P1-1 | `namespace_key` 被排除在 record digest 外，但没有独立损坏检测 | migration 23 增加 Core 私有 `namespace_key_check_digest`；它由 namespace key 对固定 domain 做 HMAC-SHA-256 得到，并进入安全 `record_json/record_digest`，启动和 owner/cursor 派生前必须校验 |
| R3.3-P1-2 | `inspect()` 把 `absent/unavailable` 也描述成具有完整 binding metadata，类型不可实现 | 冻结 strict discriminated union：`present` 才有 operation/revision/binding digest；`absent` 只有 ref；`unavailable` 只有 ref + typed safe error code；不得使用 nullable 字段伪造统一对象 |
| R3.3-P2-1 | Endpoint raw pre-scan 未明确拒绝 percent-encoded null | `%00` 大小写不敏感地在 WHATWG parse 前失败关闭；normalized component recheck 继续拒绝解码后的 null/control 字符 |
| R3.3-P3-1 | DFI-4A.0 历史文档仍把 Revision 2 写成当前状态 | 保留 repair.1 关闭时的历史快照，同时增加当前 Revision 3.3 回链；不得改写历史 QA 事实 |

## 4. Revision 3.3 结构冻结

### 4.1 配置版本、执行身份、状态与记录摘要分离

禁止把 `status`、`statusDetail`、`updatedAt` 混入 Task 锁定的模型执行身份。

冻结四类身份：

```text
configurationRevision
  = 用户可编辑的完整 Personal Model 配置版本

executionDefinitionDigest
  = 真正影响 Provider 执行的配置子集

statusRevision
  = 某 configurationRevision 的最新运行状态 CAS revision

recordDigest
  = 持久记录逐字段完整性证明
```

所有 digest 都使用现有 `Sha256DigestSchema` 格式：小写
`sha256:<64 hex>`。输入为 UTF-8 编码的 canonical JSON，object key 递归字典序、数组保持声明顺序，
用户文本先做 Unicode NFC；禁止 `undefined`、非有限数字和隐式默认值。每类 digest 使用独立 domain：

```text
robothree.personal-model.configuration.v1
robothree.personal-model.execution-definition.v1
robothree.personal-model.status-record.v1
robothree.personal-model.<record-kind>.v1
```

`configurationRevision` 是 content-addressed revision，其 canonical material 精确包含：

- `schemaVersion`；
- `ownerScopeNamespaceRevision`；
- `ownerScopeDigest`；
- `personalModelId`；
- `providerKind`；
- `providerProfileRevision`；
- `protocol`；
- `canonicalEndpoint`；
- `endpointIdentityDigest`；
- `providerModelId`；
- `displayName`；
- `capabilities`；
- `credentialRef`；
- `credentialRevision`；
- `credentialBindingDigest`。

`executionDefinitionDigest` 的 canonical material 精确包含：

- `schemaVersion`；
- `ownerScopeNamespaceRevision`；
- `ownerScopeDigest`；
- `personalModelId`；
- `providerKind`、`providerProfileRevision`、`protocol`；
- 完整 `canonicalEndpoint` 和 `endpointIdentityDigest`；
- `providerModelId`；
- 按固定枚举顺序去重后的 `capabilities`；
- `credentialRef`、`credentialRevision`、`credentialBindingDigest`。

它明确排除 `displayName` 和墙钟字段。
`status`、`statusDetailCode`、`statusDetailDigest`、`statusRevision`、`createdAt`、`updatedAt` 不进入
`configurationRevision` 或 `executionDefinitionDigest`。

`statusRevision`、`headRevision`、`preferenceRevision` 与 operation phase revision 均为从 `1` 开始、
严格单调递增的 SQLite INTEGER CAS revision；它们不是内容 digest。`recordDigest` 对对应表的完整
canonical record（排除 `recordDigest` 本身）计算，并通过独立 record-kind domain 防止跨表替换。

规则：

- 仅修改 `displayName`：生成新 `configurationRevision`，`executionDefinitionDigest` 保持不变；
  已验证状态可通过显式 carry-forward 规则继承；
- 修改 Provider、Profile、Endpoint、Provider Model ID、Credential 或 Capability：生成新
  `configurationRevision` 和新 `executionDefinitionDigest`，状态固定回到 `unverified`；
- 调用成功或失败：只推进 `statusRevision`，不改配置版本；
- Task 后续精确锁定 `personalModelId + configurationRevision + executionDefinitionDigest`；
- requestId、transportRequestId、墙钟和状态不进入稳定执行 identity。

### 4.2 不可变版本历史

`loadByRevision()` 必须由真实不可变版本事实支撑，禁止用单行 current record 伪装历史恢复。

- 每个 `configurationRevision` 写入后不可原地覆盖；
- `personal_model_heads` 只保存当前 revision 指针和 tombstone 状态；
- 编辑创建新 definition row，再 CAS 推进 head；
- 旧 definition 在仍被 Task/Receipt/Operation 引用时不得破坏性清理；
- DFI-4A.1 不实现自动 GC；未来 GC 必须有引用证明和独立方案；
- Core 重启后可按 exact revision 重读同一 canonical material；
- digest 漂移、缺失版本或 head 指向不存在版本必须失败关闭。

### 4.3 opaque Credential Reference 的预分配与恢复身份

依据 ADR-013：SQLite 禁止保存 Secret，但必须保存随机、不可推导 Secret 的 opaque
`credentialRef`，否则 DFI-4A.2/4A.3 无法从 Personal Model 解析对应 Keychain item。

- `credentialRef` 由 Core 私有 `PersonalCredentialReferenceAllocator` 在 Transaction A 前生成，使用
  至少 256-bit CSPRNG；它随机、opaque、不可从 owner/model/Secret 推导；
- 同一 `commandId` 的恢复重放必须复用 Transaction A 已持久化的同一个 `credentialRef`，这里的
  deterministic 仅表示“同一 durable operation 身份稳定”，不表示内容派生；
- `credentialRef` 只进入 Core 私有 definition、Operation 和 Credential Port；
- 不进入公共 Contract、Renderer Projection、Event、Task、Receipt、Audit 或日志；
- `credentialBindingDigest` 只用于完整性与 identity 校验，不能替代真实 lookup reference；
- DFI-4A.1 的 Fake Store 接受预分配 ref，而不是在 mutation 后才返回未知 ref；
- Credential Port 的 Foundation 形状冻结为：

  ```text
  store(operationId, credentialRef, fakeSecretBytes)
  replace(operationId, oldCredentialRef, newCredentialRef, fakeSecretBytes)
  inspect(credentialRef) -> strict discriminated observation
  resolve(credentialRef) -> secret bytes（仅受控调用/reveal 路径）
  delete(operationId, credentialRef)
  ```

- 同 `operationId + credentialRef` 的 store/replace 重放必须幂等；同 operationId 不同 target ref 只返回
  typed conflict。Secret 和 Secret digest 都不得持久化；Transaction A 已存在后，携带新 Secret bytes 的
  同 command 重放必须返回 `credential_input_already_bound` 并丢弃输入，新 Secret 必须使用新 commandId；
- `inspect()` 只返回 Core 私有安全 observation，不返回 Secret，供 C2/C3/U1/U2 恢复分类；返回值必须是
  以下 strict discriminated union，禁止用 nullable binding 字段拼成单一宽松对象：

  ```text
  { state: "absent", credentialRef }

  { state: "unavailable", credentialRef,
    errorCode: "credential_store_unavailable" |
               "credential_store_locked" |
               "credential_store_access_denied" |
               "credential_store_internal" }

  { state: "present", credentialRef,
    createdByOperationId, credentialRevision, credentialBindingDigest }
  ```

- 只有 `present` observation 可以证明 create/update Credential binding；C3/U2 恢复只有在 reference、
  operation、revision 与 binding digest 全部匹配时才允许执行
  Transaction B；任何不匹配均进入 typed conflict，不得猜测、不得按“存在即成功”收敛；
- delete Credential step 成功只接受 exact target ref 的 `absent` observation；`unavailable` 永远不能授权
  Transaction B，必须进入 `manual_attention`；任何分支都不得用 `null` 伪造不存在的 metadata；
- `credential_observation_json` 持久化上述 union 的 exact canonical JSON，使用独立 domain
  `robothree.personal-model.credential-observation.v1` 计算 digest。phase 约束固定为：
  create/update 的 `credential_step_observed` 与 committed operation 只接受 matching `present`；delete 的
  corresponding phase 只接受 matching `absent`；cleanup 可保存 exact `present/absent`；`unavailable` 只允许
  收敛到 `manual_attention`，不得伴随 success Receipt；
- DFI-4A.2 将同一 Port 替换为真实 Keychain Adapter，不得改变 migration 23 的引用语义；
- Credential replace 后旧 ref 的清理必须服从活跃 Task revision 引用规则，不能静默使旧 Task 失效。

### 4.4 私有 canonical Endpoint 与安全 Projection 分离

Provider 调用必须恢复完整 canonical Endpoint，不能只保存 host 或 digest。

- Endpoint canonicalization 顺序固定：先对原始输入字符串做前置拒绝，再进入 WHATWG URL parser；
  parse 后再对 normalized components 做第二轮校验，任一阶段失败都返回 typed invalid endpoint；
- Endpoint 使用 WHATWG URL 解析，任何 parser error 失败关闭；
- 仅允许 HTTPS；
- hostname 转为小写 IDNA ASCII，拒绝尾点；
- 禁止 userinfo、query、fragment；
- 默认 `443` 端口省略，非默认端口保留；
- 空 path 规范为 `/`；
- path 解析 dot segment；
- 拒绝 encoded slash、encoded backslash、percent-encoded null、实际反斜杠和 raw null byte；
- encoded slash/backslash 检查必须在 canonicalization 前按大小写不敏感规则执行，覆盖
  `%2f`、`%2F`、`%5c`、`%5C` 及其混合形态；
- `%00` 必须在 WHATWG parse 前按大小写不敏感规则拒绝；parse 后 normalized scheme/host/port/path
  component 还要再次拒绝 null 与 C0 control 字符，不能依赖 parser 的容错或替换行为；
- 原始输入中出现 `\`、null byte、`@` userinfo marker、`?`、`#` 或 hostname 尾点候选时先失败关闭；
- path percent-encoding 使用统一 canonical 形式：按 segment 处理，unreserved 字符解码后直写，
  其他字节使用 uppercase hex percent-encoding；
- 不静默改写可能具有 Provider 语义的重复斜杠；
- Core 私有 definition 持久化 `canonicalEndpoint`：`https` scheme、规范 hostname、可选 port、规范化 path；
- preset Provider 同时锁定 `providerProfileRevision`；
- custom Endpoint 必须保留调用所需 path，禁止只保存 hostname；
- `endpointIdentityDigest` 由完整 canonical Endpoint material 计算；
- 普通 Renderer Projection 只返回 `endpointDisplayHost + endpointIdentityDigest`；
- Contract Fixture、错误、日志与 QA Evidence 不得返回 private canonical Endpoint。

### 4.5 Operation Journal 与 durable Receipt 分离

沿用 DFI-4A 主计划的单一事实模型：

- Operation Journal 记录跨 SQLite/Credential 外部步骤的恢复阶段；
- Command Receipt 记录已提交命令的幂等结果；
- 同 `commandId + requestDigest` 重放返回同一 Receipt；
- 同 commandId 不同 requestDigest 返回 typed conflict；
- `operation.result_json` 不得成为第二套 Receipt；
- response 丢失后必须从 durable Receipt 重放，不从 UI 状态推断成功。

`operationId` 首期固定等于 `commandId`，数据库和 Port 统一使用 `commandId`，不再同时存在未定义的
第二个 operation identity。

Receipt outcome 穷尽为：

```text
create_committed
update_committed
update_committed_cleanup_pending
delete_committed
status_committed
preference_committed
manual_attention
```

正常 CAS/idempotency conflict 使用 typed result，不写新的 Receipt；Receipt 内不得出现 credential ref、
canonical Endpoint、owner digest 或 Secret 衍生值。

Receipt FK 只用于带 committed personal definition 的 outcome。`status_committed` 必须由同一事务追加的
status fact 证明，`preference_committed` 必须由同一事务提交的 preference fact 证明，
`delete_committed` 必须由同一事务推进的 `selection_state=tombstoned` head 证明；Receipt replay
只能重放结果，不得单独证明业务事实已经发生。

Operation phase 使用穷尽枚举和单向 CAS：

```text
intent_committed
credential_step_observed
credential_cleanup_pending
committed
manual_attention
```

唯一合法迁移为：

```text
intent_committed -> credential_step_observed | manual_attention
credential_step_observed -> committed | credential_cleanup_pending | manual_attention
credential_cleanup_pending -> committed | manual_attention
```

- Transaction A 原子提交 `intent_committed`、预分配的 target credential ref、request digest 和期望版本；
- delete 的 Transaction A 必须在同一 SQLite transaction 内完成 begin delete operation 与
  `personal_model_heads.selection_state: active -> delete_pending`；`listActiveHeads()` 只返回
  `selection_state=active`，因此 delete intent 一旦持久化，新任务选择立即看不到该模型；
- `requestDigest` 对不含 Secret/Secret digest 的 strict safe command envelope 计算；它证明业务 intent，
  不冒充 Secret 等价证明。同 command 已绑定 operation 后不再消费任何重放携带的 Secret；
- Operation 的 private `record_json.targetDefinition` 必须保存恢复 Transaction B 所需的完整安全配置
  material（含 canonical Endpoint、target revision/digest、credential ref，但不含 Secret/Secret digest）；
- 外部 Credential step 完成后，只能 CAS 到 `credential_step_observed`；
- 进入 `credential_step_observed` 时必须持久化 bounded `credential_observation_json` 与
  `credential_observation_digest`；JSON 只允许 §4.3 冻结的 strict discriminated union，不得保存 Secret、
  Keychain item 属性、ACL、account/service 原文或错误栈；
- Transaction B 执行前必须从 durable `credential_observation_json` 重放并按 operation type 复核：
  create/update 的 C3/U2 需要 matching `present` 全量 binding metadata，delete 需要 exact ref 的 `absent`；
  缺失 observation JSON、digest 漂移、分支不匹配或与当前 `inspect()` 不匹配均返回 typed conflict/manual
  attention，不得只凭 `credential_observation_digest` 或 ref 存在判断成功；
- Transaction B 必须由一个聚合 Persistence API 原子提交 definition/head/status、operation phase 与 Receipt；
- update 在新 definition 已提交但旧 ref 未清理时进入 `credential_cleanup_pending`；清理是独立幂等步骤，
  不能回滚已经提交的新 definition；
- delete 的 Credential 删除不确定或进入 manual attention 时，head 必须保持 `delete_pending`，不得自动恢复
  `active`；Transaction B 成功完成后才推进为 `tombstoned`；
- 无 Secret 可重放且 `inspect()` 证明 target ref 不存在时进入 `manual_attention`，不得伪造成功、生成
  active model 或自动使用第二份 Credential；
- Receipt 只在对应业务事实已原子提交后生成；`markOperationManualAttention` 原子推进 operation 并提交
  outcome=`manual_attention` 的非成功 durable Receipt，使同 command 重放稳定收敛；禁止写 success Receipt。

### 4.6 聚合事务边界

Application 层禁止通过多个 Repository 顺序调用模拟 Transaction B。冻结单一
`PersonalModelPersistence` 聚合 Port；内部 Adapter 可拆 Mapper，但对 Application 暴露的写入口必须是：

```text
beginCredentialOperation(input)
commitCreateOutcome(input)
commitUpdateOutcome(input)
commitDeleteOutcome(input)
commitStatusOutcome(input)
commitPreferenceOutcome(input)
markOperationManualAttention(input)
```

`commitCreateOutcome` 原子写 definition + head(active) + initialized status + operation + receipt；
`commitUpdateOutcome` 原子写新 definition + head CAS + initialized/carry-forward status + operation + receipt；
`commitDeleteOutcome` 原子推进 head `delete_pending -> tombstoned` + operation + receipt；`commitStatusOutcome` 和
`commitPreferenceOutcome` 分别只修改其自身 CAS fact 与 Receipt。任一 indexed-column/JSON/digest、
expected revision 或 operation phase 不匹配时整体回滚并返回 typed conflict。

### 4.7 Owner namespace 与稳定 Owner Authority

DFI-4A.1 必须持久化独立的 personal-model owner namespace，不得复用 Prompt Cache、Session Scope 或
其他 HMAC namespace。Core 重启后必须从 SQLite 恢复同一个 active namespace；禁止因重启重新生成
namespace 导致旧个人模型失联。

`personal_model_owner_scope_namespaces` 冻结字段：

```text
namespace_revision: INTEGER primary key, >= 1
namespace_key: private BLOB, 32-64 bytes, excluded from record_json and record_digest
status: enum active | retired
created_at: RFC3339 TEXT
record_json: bounded canonical object, excludes namespace_key
record_digest: sha256:<64 lowercase hex>, computed over record_json
```

- 同一时期只允许一个 active namespace；
- `namespace_key` 只进入 Core 私有 SQLite 和 HMAC 计算，不进入 Contract、Renderer Projection、Event、
  Receipt、日志或 Evidence；
- DFI-4A.1 只允许创建和恢复 `active` namespace；`retired` 只是未来 rotation 兼容枚举，本批不得创建
  retired row、不得迁移旧 namespace、不得实现 rotation 或 GC；
- DFI-4A.1 不实现 rotation/GC；未来 rotation、retired namespace 读取策略和旧模型迁移必须另立方案；
- 所有 owner-scoped 表增加 `owner_scope_namespace_revision`；
- owner identity 始终由 `ownerScopeNamespaceRevision + ownerScopeDigest` 共同组成。

新增 Core 私有 `PersonalModelOwnerAuthority` material：

```text
ownerScopeNamespaceRevision
ownerScopeDigest
authoritySource = runtime_active_enterprise_identity
entitlement = personal_model.configure
entitlementRevision
offlineState = online | enterprise_temporarily_unavailable | enterprise_session_invalid
```

`ownerScopeDigest` 使用 active personal-model owner namespace 对 `enterpriseId + userId + deviceId`
计算；原文不持久化到 Personal Model 表。`clientInstanceId` 只绑定单次敏感命令，不进入长期 owner
identity。DFI-4A.1 只提供纯 material/resolver Port、Fake 和
Conformance；生产 Runtime Active wiring 留在 DFI-4A.2，但不得重新定义 owner digest 或接受 Renderer
自报身份/entitlement。

## 5. 非目标

DFI-4A.1 不实现：

- 真实 macOS Keychain Adapter、签名 helper、ACL 或 `SecItem*` 生产生命周期；
- Main/Core 敏感 IPC、Preload sensitive sidecar 或 Renderer 个人模型 CRUD；
- 真实 API Key 保存、替换、查看或删除；
- 真实 Provider、OpenAI-compatible HTTP、Streaming、Usage 或调用恢复；
- 个人模型进入生产 Catalog、TaskRuntimeSelection、CapabilityLock、Agent Loop 或 Compaction；
- 默认模型偏好影响真实任务；
- 生产执行中 Task 的删除阻断与 Credential GC；
- DFI-2B、DFI-3、DFE-6、TGM、Knowledge、Memory 或 Windows Credential Adapter；
- 新增第三方依赖或修改 `pnpm-lock.yaml`。

## 6. 修改边界

获得单独编码授权后允许修改：

- `packages/contracts/src/desktop-local/v1alpha2/**`；
- `packages/contracts/tests/**`；
- `services/core/src/application/**`；
- `services/core/src/ports/**`；
- `services/core/src/adapters/memory/**`；
- `services/core/src/adapters/sqlite/**`；
- `services/core/tests/**`。

独占共享文件收口窗口才允许更新版本与治理文件。

禁止修改：

- `apps/desktop/src/main/**`；
- `apps/desktop/src/preload/**`；
- `apps/desktop/src/renderer/**`；
- `services/central-service/**`；
- `services/document-worker/**`；
- Core private HTTP route 与 Desktop runtime wiring；
- migration 1～22；
- 根 `tsconfig.json`、依赖与 lockfile。

如实现需要进入禁止范围，必须停止并回到文档评审。

## 7. Contract 方案

DFI-4A.1 只新增 Desktop Local `v1alpha2` additive schema，不修改 `v1alpha1 ModelProjection`，也不在
Compatibility Projection 中宣称 Personal Model CRUD feature 已上线。

安全枚举：

```text
PersonalModelProvider = deepseek | zhipu | kimi | custom
PersonalModelProtocol = openai_compatible
PersonalModelStatus =
  unverified
  available
  authentication_failed
  network_failed
  protocol_incompatible
  model_not_found
  unavailable
  permission_denied
PersonalModelCredentialState =
  absent
  present_masked
  unavailable
  delete_uncertain
```

Safe Summary 最多包含：

- `personalModelId`；
- `configurationRevision`；
- `displayName`；
- `provider`；
- `protocol`；
- `providerModelId`；
- `endpointDisplayHost`；
- `endpointIdentityDigest`；
- `capabilities`；
- `status`、`statusRevision`；
- `available`、`unavailableReason`；
- `credentialState`；
- `createdAt`、`updatedAt`。

所有 string/array 都有 Contract 固定上限；`displayName`、`providerModelId`、display host 和用户语言
reason 不允许控制字符，错误信息只使用 typed safe code。`configurationRevision`、
`endpointIdentityDigest` 使用 `Sha256DigestSchema`，`statusRevision` 为正整数。

状态一致性由 strict schema `superRefine` 强制，不由 Renderer 推断：

| status | available | unavailableReason |
| --- | --- | --- |
| `unverified` | `true` | 必须省略 |
| `available` | `true` | 必须省略 |
| `network_failed` | `true` | 必须省略；警告来自 bounded `statusDetailCode` |
| `authentication_failed` | `false` | 固定 `authentication_failed` |
| `protocol_incompatible` | `false` | 固定 `protocol_incompatible` |
| `model_not_found` | `false` | 固定 `model_not_found` |
| `unavailable` | `false` | 固定安全枚举，如 `credential_unavailable/provider_unavailable` |
| `permission_denied` | `false` | 固定 `permission_denied` |

`credentialState=present_masked` 不泄漏 ref 或 Secret；`unavailable/delete_uncertain` 强制
`status=unavailable` 且 `available=false`。`absent` 不允许出现在 active model Summary，只用于尚未提交的
operation typed outcome。`delete_uncertain` 是 Credential cleanup 状态，不得伪装模型删除成功。

禁止进入公共 schema：API Key、`credentialRef`、ownerScopeDigest、enterprise/user/device 原文、
canonical Endpoint、Provider 原始错误、Authorization header、Runtime Handle、Task/Conversation 正文和本地路径。

`providerModelId` 是提交给 Provider 的精确标识；`displayName` 是用户可见名称，二者不得混写。

## 8. Domain 与 Port

建议 Core 私有类型：

```text
PersonalModelDefinition
PersonalModelHead
PersonalModelStatusFact
PersonalModelPreference
PersonalModelOperation
PersonalModelCommandReceipt
PersonalModelRuntimeCandidate
```

冻结聚合 Persistence Port；只读方法可按子接口组织，写入必须通过 §4.6 的聚合事务入口：

```text
PersonalModelOwnerIdentity = {
  ownerScopeNamespaceRevision
  ownerScopeDigest
}

PersonalModelPersistence
  loadDefinition(ownerIdentity, modelId, configurationRevision)
  loadHead(ownerIdentity, modelId)
  listActiveHeads(ownerIdentity, cursor, limit)
  loadStatus(ownerIdentity, modelId, configurationRevision)
  loadPreference(ownerIdentity)
  loadByCommand(ownerIdentity, commandId)
  loadPending(ownerIdentity, limit)
  loadReceipt(ownerIdentity, commandId)

  beginCredentialOperation(input)
  advanceCredentialObservation(ownerIdentity, commandId, expectedPhase, observation)
  commitCreateOutcome(input)
  commitUpdateOutcome(input)
  commitDeleteOutcome(input)
  commitStatusOutcome(input)
  commitPreferenceOutcome(input)
  markOperationManualAttention(input)
```

所有写入口都接收 expected CAS revision、expected operation phase、canonical record/digest，并在单一 SQLite
transaction 内验证和提交。所有业务冲突返回 typed result，不用异常表达正常 conflict/not-found。

所有 owner-scoped 读写 input 必须携带 `ownerScopeNamespaceRevision + ownerScopeDigest`，禁止只传
`ownerScopeDigest`、禁止提供 owner shorthand overload，也禁止复用 Prompt Cache owner material。

`listActiveHeads` 固定 `limit=1..100`、稳定 `(updatedAt, personalModelId)` 排序、只返回
`selection_state=active` 的 head。opaque cursor 绑定
`ownerScopeNamespaceRevision + ownerScopeDigest + lastSortKey + queryRevision`，不接受 Renderer 提供
owner、offset 或任意 SQL filter。响应同时受条目数和 canonical JSON byte 上限约束。

`queryRevision` 固定为当前 owner 下、按 `(updatedAt, personalModelId)` 稳定顺序排列的 active head tuple
canonical SHA-256。每个 tuple 精确包含：

```text
ownerScopeNamespaceRevision
ownerScopeDigest
personalModelId
headRevision
configurationRevision
selectionState
```

cursor 使用独立 HMAC domain `robothree.personal-model.active-head-cursor.v1`，绑定 `queryRevision` 和最后
sort key。集合变化、任一 active head revision 变化、selectionState 变化或 namespace revision 不匹配时
返回 typed stale cursor。`queryRevision` 计算必须设置最大扫描项数和 canonical JSON byte bound；超限返回
typed limit exceeded，不退化为不稳定 cursor。

Owner authority 继续复用 Runtime Active 企业身份和 CGF-1.3 离线状态 2/3，不接受 Renderer 自报身份，
不新增 session clock、离线租约或实时撤销。

## 9. Migration 23

编码前必须重新确认 `LATEST_SQLITE_SCHEMA_VERSION === 22`；若编号被占用，回文档评审整体升号。

Migration 23 固定包含以下七表。编码时 SQL 名称可按现有 snake_case 规范落地，但字段、约束、外键和
索引语义不得缩减：

```text
personal_model_owner_scope_namespaces
  namespace_revision INTEGER PRIMARY KEY CHECK(namespace_revision >= 1)
  namespace_key BLOB NOT NULL CHECK(length(namespace_key) BETWEEN 32 AND 64)
  namespace_key_check_digest TEXT NOT NULL
    CHECK(namespace_key_check_digest GLOB 'sha256:[0-9a-f]*'
          AND length(namespace_key_check_digest) = 71)
  status TEXT NOT NULL CHECK(status IN ('active', 'retired'))
  created_at TEXT NOT NULL
  record_json TEXT NOT NULL CHECK(length(record_json) <= 4096)
  record_digest TEXT NOT NULL CHECK(record_digest GLOB 'sha256:[0-9a-f]*'
                                    AND length(record_digest) = 71)
  -- active 唯一性由 partial unique index 证明：
  -- CREATE UNIQUE INDEX personal_model_owner_scope_one_active
  --   ON personal_model_owner_scope_namespaces(status)
  --   WHERE status = 'active'
  -- namespace_key 不得进入 record_json 或 record_digest；namespace_key_check_digest 必须进入二者

personal_model_definitions
  owner_scope_namespace_revision INTEGER NOT NULL
  owner_scope_digest TEXT NOT NULL CHECK(owner_scope_digest GLOB 'sha256:[0-9a-f]*'
                                         AND length(owner_scope_digest) = 71)
  personal_model_id TEXT NOT NULL CHECK(length(personal_model_id) BETWEEN 3 AND 96)
  configuration_revision TEXT NOT NULL CHECK(configuration_revision GLOB 'sha256:[0-9a-f]*'
                                             AND length(configuration_revision) = 71)
  execution_definition_digest TEXT NOT NULL CHECK(execution_definition_digest GLOB 'sha256:[0-9a-f]*'
                                                   AND length(execution_definition_digest) = 71)
  provider_kind TEXT NOT NULL CHECK(provider_kind IN ('deepseek','zhipu','kimi','custom'))
  provider_profile_revision TEXT NOT NULL CHECK(provider_profile_revision GLOB 'sha256:[0-9a-f]*'
                                                AND length(provider_profile_revision) = 71)
  protocol TEXT NOT NULL CHECK(protocol = 'openai_compatible')
  canonical_endpoint TEXT NOT NULL CHECK(length(canonical_endpoint) BETWEEN 8 AND 2048)
  endpoint_identity_digest TEXT NOT NULL CHECK(endpoint_identity_digest GLOB 'sha256:[0-9a-f]*'
                                               AND length(endpoint_identity_digest) = 71)
  provider_model_id TEXT NOT NULL CHECK(length(provider_model_id) BETWEEN 1 AND 160)
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160)
  capabilities_json TEXT NOT NULL CHECK(length(capabilities_json) <= 4096)
  credential_ref TEXT NOT NULL CHECK(length(credential_ref) BETWEEN 32 AND 160)
  credential_revision INTEGER NOT NULL CHECK(credential_revision >= 1)
  credential_binding_digest TEXT NOT NULL CHECK(credential_binding_digest GLOB 'sha256:[0-9a-f]*'
                                                AND length(credential_binding_digest) = 71)
  record_json TEXT NOT NULL CHECK(length(record_json) <= 16384)
  record_digest TEXT NOT NULL CHECK(record_digest GLOB 'sha256:[0-9a-f]*'
                                    AND length(record_digest) = 71)
  created_at TEXT NOT NULL
  PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest,
              personal_model_id, configuration_revision)
  UNIQUE(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
         configuration_revision,
         execution_definition_digest)
  FOREIGN KEY(owner_scope_namespace_revision)
    REFERENCES personal_model_owner_scope_namespaces(namespace_revision)

personal_model_heads
  owner_scope_namespace_revision INTEGER NOT NULL
  owner_scope_digest TEXT NOT NULL
  personal_model_id TEXT NOT NULL
  current_configuration_revision TEXT NOT NULL
  current_execution_definition_digest TEXT NOT NULL
  head_revision INTEGER NOT NULL CHECK(head_revision >= 1)
  selection_state TEXT NOT NULL CHECK(selection_state IN ('active', 'delete_pending', 'tombstoned'))
  updated_at TEXT NOT NULL
  record_json TEXT NOT NULL CHECK(length(record_json) <= 8192)
  record_digest TEXT NOT NULL CHECK(record_digest GLOB 'sha256:[0-9a-f]*'
                                    AND length(record_digest) = 71)
  PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id)
  FOREIGN KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
              current_configuration_revision,
              current_execution_definition_digest)
    REFERENCES personal_model_definitions(owner_scope_namespace_revision, owner_scope_digest,
                                          personal_model_id, configuration_revision,
                                          execution_definition_digest)

personal_model_status_facts
  owner_scope_namespace_revision INTEGER NOT NULL
  owner_scope_digest TEXT NOT NULL
  personal_model_id TEXT NOT NULL
  configuration_revision TEXT NOT NULL
  execution_definition_digest TEXT NOT NULL
  status_revision INTEGER NOT NULL CHECK(status_revision >= 1)
  status TEXT NOT NULL CHECK(status IN ('unverified','available','authentication_failed',
                                        'network_failed','protocol_incompatible',
                                        'model_not_found','unavailable','permission_denied'))
  detail_code TEXT CHECK(detail_code IS NULL OR length(detail_code) <= 120)
  detail_digest TEXT CHECK(detail_digest IS NULL OR
                           (detail_digest GLOB 'sha256:[0-9a-f]*'
                            AND length(detail_digest) = 71))
  status_origin TEXT NOT NULL CHECK(status_origin IN ('initialized', 'carry_forward', 'provider_observation'))
  carried_from_configuration_revision TEXT
  carried_from_status_revision INTEGER
  carried_from_status_record_digest TEXT
  updated_at TEXT NOT NULL
  record_json TEXT NOT NULL CHECK(length(record_json) <= 8192)
  record_digest TEXT NOT NULL CHECK(record_digest GLOB 'sha256:[0-9a-f]*'
                                    AND length(record_digest) = 71)
  PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
              configuration_revision, status_revision)
  UNIQUE(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
         configuration_revision, status_revision, record_digest)
  FOREIGN KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
              configuration_revision,
              execution_definition_digest)
    REFERENCES personal_model_definitions(owner_scope_namespace_revision, owner_scope_digest,
                                          personal_model_id, configuration_revision,
                                          execution_definition_digest)
  FOREIGN KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
              carried_from_configuration_revision, carried_from_status_revision,
              carried_from_status_record_digest)
    REFERENCES personal_model_status_facts(owner_scope_namespace_revision, owner_scope_digest,
              personal_model_id, configuration_revision, status_revision, record_digest)
  CHECK ((status_origin = 'carry_forward'
          AND carried_from_configuration_revision IS NOT NULL
          AND carried_from_status_revision IS NOT NULL
          AND carried_from_status_record_digest IS NOT NULL)
         OR (status_origin <> 'carry_forward'
          AND carried_from_configuration_revision IS NULL
          AND carried_from_status_revision IS NULL
          AND carried_from_status_record_digest IS NULL))

personal_model_preferences
  owner_scope_namespace_revision INTEGER NOT NULL
  owner_scope_digest TEXT NOT NULL
  model_source TEXT CHECK(model_source IS NULL OR model_source IN ('enterprise', 'personal'))
  model_id TEXT CHECK(model_id IS NULL OR length(model_id) BETWEEN 1 AND 160)
  configuration_revision TEXT CHECK(configuration_revision IS NULL OR
                                    (configuration_revision GLOB 'sha256:[0-9a-f]*'
                                     AND length(configuration_revision) = 71))
  preference_revision INTEGER NOT NULL CHECK(preference_revision >= 1)
  updated_at TEXT NOT NULL
  record_json TEXT NOT NULL CHECK(length(record_json) <= 4096)
  record_digest TEXT NOT NULL CHECK(record_digest GLOB 'sha256:[0-9a-f]*'
                                    AND length(record_digest) = 71)
  PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest)
  FOREIGN KEY(owner_scope_namespace_revision)
    REFERENCES personal_model_owner_scope_namespaces(namespace_revision)
  CHECK ((model_source IS NULL AND model_id IS NULL AND configuration_revision IS NULL)
         OR (model_source = 'personal' AND model_id IS NOT NULL
             AND configuration_revision IS NOT NULL)
         OR (model_source = 'enterprise' AND model_id IS NOT NULL
             AND configuration_revision IS NULL))

personal_model_operations
  owner_scope_namespace_revision INTEGER NOT NULL
  owner_scope_digest TEXT NOT NULL
  command_id TEXT NOT NULL                    -- operationId === commandId
  operation_type TEXT NOT NULL CHECK(operation_type IN ('create', 'update', 'delete'))
  request_digest TEXT NOT NULL CHECK(request_digest GLOB 'sha256:[0-9a-f]*'
                                     AND length(request_digest) = 71)
  target_model_id TEXT NOT NULL CHECK(length(target_model_id) BETWEEN 3 AND 96)
  expected_configuration_revision TEXT
  expected_execution_definition_digest TEXT
  target_configuration_revision TEXT
  target_execution_definition_digest TEXT
  target_credential_ref TEXT CHECK(target_credential_ref IS NULL OR
                                   length(target_credential_ref) BETWEEN 32 AND 160)
  previous_credential_ref TEXT CHECK(previous_credential_ref IS NULL OR
                                     length(previous_credential_ref) BETWEEN 32 AND 160)
  operation_phase TEXT NOT NULL CHECK(operation_phase IN ('intent_committed',
                                                          'credential_step_observed',
                                                          'credential_cleanup_pending',
                                                          'committed',
                                                          'manual_attention'))
  phase_revision INTEGER NOT NULL CHECK(phase_revision >= 1)
  credential_observation_json TEXT CHECK(credential_observation_json IS NULL OR
                                         length(credential_observation_json) <= 2048)
  credential_observation_digest TEXT CHECK(credential_observation_digest IS NULL OR
                                           (credential_observation_digest GLOB 'sha256:[0-9a-f]*'
                                            AND length(credential_observation_digest) = 71))
  recovery_error_code TEXT CHECK(recovery_error_code IS NULL OR length(recovery_error_code) <= 120)
  recovery_error_digest TEXT CHECK(recovery_error_digest IS NULL OR
                                   (recovery_error_digest GLOB 'sha256:[0-9a-f]*'
                                    AND length(recovery_error_digest) = 71))
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
  record_json TEXT NOT NULL CHECK(length(record_json) <= 16384)
  record_digest TEXT NOT NULL CHECK(record_digest GLOB 'sha256:[0-9a-f]*'
                                    AND length(record_digest) = 71)
  PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest, command_id)
  FOREIGN KEY(owner_scope_namespace_revision)
    REFERENCES personal_model_owner_scope_namespaces(namespace_revision)
  CHECK (((operation_type IN ('create','update'))
          AND target_configuration_revision IS NOT NULL
          AND target_execution_definition_digest IS NOT NULL
          AND target_credential_ref IS NOT NULL)
         OR (operation_type = 'delete'
          AND expected_configuration_revision IS NOT NULL
          AND expected_execution_definition_digest IS NOT NULL
          AND target_configuration_revision IS NULL
          AND target_execution_definition_digest IS NULL
          AND target_credential_ref IS NULL
          AND previous_credential_ref IS NOT NULL))
  CHECK ((operation_phase = 'intent_committed'
          AND credential_observation_json IS NULL
          AND credential_observation_digest IS NULL)
         OR (operation_phase IN ('credential_step_observed',
                                 'credential_cleanup_pending',
                                 'committed')
          AND credential_observation_json IS NOT NULL
          AND credential_observation_digest IS NOT NULL)
         OR (operation_phase = 'manual_attention'
          AND ((credential_observation_json IS NULL
                AND credential_observation_digest IS NULL)
               OR (credential_observation_json IS NOT NULL
                AND credential_observation_digest IS NOT NULL))))

personal_model_command_receipts
  owner_scope_namespace_revision INTEGER NOT NULL
  owner_scope_digest TEXT NOT NULL
  command_id TEXT NOT NULL
  command_type TEXT NOT NULL CHECK(command_type IN ('create', 'update', 'delete', 'status', 'preference'))
  request_digest TEXT NOT NULL CHECK(request_digest GLOB 'sha256:[0-9a-f]*'
                                     AND length(request_digest) = 71)
  model_id TEXT CHECK(model_id IS NULL OR length(model_id) BETWEEN 3 AND 96)
  committed_configuration_revision TEXT CHECK(committed_configuration_revision IS NULL OR
                                              (committed_configuration_revision GLOB 'sha256:[0-9a-f]*'
                                               AND length(committed_configuration_revision) = 71))
  outcome TEXT NOT NULL CHECK(outcome IN ('create_committed','update_committed',
                                          'update_committed_cleanup_pending','delete_committed',
                                          'status_committed','preference_committed',
                                          'manual_attention'))
  committed_at TEXT NOT NULL
  receipt_json TEXT NOT NULL CHECK(length(receipt_json) <= 8192)
  receipt_digest TEXT NOT NULL CHECK(receipt_digest GLOB 'sha256:[0-9a-f]*'
                                     AND length(receipt_digest) = 71)
  PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest, command_id)
  FOREIGN KEY(owner_scope_namespace_revision, owner_scope_digest, model_id,
              committed_configuration_revision)
    REFERENCES personal_model_definitions(owner_scope_namespace_revision, owner_scope_digest,
                                          personal_model_id, configuration_revision)
  CHECK ((outcome IN ('create_committed','update_committed','update_committed_cleanup_pending',
                      'status_committed')
          AND model_id IS NOT NULL
          AND committed_configuration_revision IS NOT NULL)
         OR (outcome IN ('delete_committed','preference_committed','manual_attention')))
```

要求：

- 七表全部 `STRICT`、`PRAGMA foreign_keys=ON`；SHA-256 字段检查固定前缀、长度和小写 hex；
- owner namespace 表启动时必须恢复唯一 active namespace；不存在时首次创建，多个 active 或 active
  缺失但已有 owner-scoped 数据时启动失败关闭；
- owner namespace 的 `record_json` 与 `record_digest` 必须排除 `namespace_key`，但必须包含
  `namespace_key_check_digest`。其精确公式固定为：

  ```text
  namespaceKeyCheckDigest = "sha256:" + lowerHex(
    HMAC-SHA-256(
      key = namespace_key,
      data = UTF8("robothree.personal-model.owner-namespace-key-check.v1")
    )
  )
  ```

  该 digest 只证明本地 namespace key 的持久化自洽性，不宣称能抵抗已获得 SQLite 读写权限的攻击者；
  它与 key 均为 Core private，不得进入公共 Contract、Projection、Event、Receipt、日志或 QA Evidence；
- Core 启动、owner digest 派生和 cursor HMAC 使用 namespace key 前都必须先验证 check digest 及
  namespace `record_digest`。key/check 缺失、长度错误、digest mismatch 或 record mismatch 均 typed
  fail-closed，禁止静默生成替代 namespace；schema-preflight 必须证明字段约束和 active namespace
  partial unique index 形状正确；
- definitions 按 owner namespace/owner/model/created_at、heads 按 owner namespace/owner/selection_state/
  updated_at、status 按 owner namespace/owner/model/configuration/status_revision DESC、operations 按
  owner namespace/owner/phase/updated_at、receipts 按 owner namespace/owner/committed_at 建有界索引；
- `record_json` 与索引列逐字段一致；definitions 也统一使用 `record_json`，不再同时出现未定义的
  `material_json` 命名；
- Secret、Secret digest、Provider response、Authorization header 不进入 SQLite；
- `credentialRef` 和 canonical Endpoint 是 Core private material，不得进入普通输出；
- `schema-preflight.ts` 必须逐表验证七表、全部列、PK/FK/UNIQUE/CHECK 与必要索引，不只检查表存在；
- fresh、22→23 upgrade、幂等 migrate、close/reopen、structural equivalence、corrupt digest/FK/head
  指向不存在 definition 全覆盖；
- definitions 为不可变插入，禁止 update 覆盖历史 revision。
- status facts 为不可变插入，禁止 update 覆盖历史 status revision；旧 Task 后续更新旧
  configuration 状态时只追加该旧 configuration 的新 status row，不得修改已被 carry-forward 引用的来源行；
- `listActiveHeads()` 必须只读取 `selection_state='active'`；`delete_pending` 和 `tombstoned` 均不得进入新任务选择。
- delete operation 必须持久化 `previous_credential_ref`、删除时看到的 current configuration revision
  与 current execution digest（`expected_execution_definition_digest`）；缺失任一项时不得执行
  Credential delete 或 Transaction B。

## 10. Fake Credential Store

Fake `PersonalCredentialStore` 只用于测试与 conformance：

- 独立 Fake `PersonalCredentialReferenceAllocator` 先生成测试专用 opaque `credentialRef`；
- `store(operationId, preallocatedRef, fakeSecretBytes)` 幂等保存到指定 ref；
- `replace(operationId, oldRef, preallocatedNewRef, fakeSecretBytes)` 幂等保存新 ref，不在内部重新分配；
- `inspect(ref)` 返回安全存在性/binding metadata，不返回 bytes；
- `resolve(ref)` 只在测试进程内返回 fake bytes；
- `delete(operationId, ref)` 幂等；
- 可注入 unavailable、not_found、conflict、delete_uncertain；
- 可在 Transaction A、Credential mutation 前后、聚合 Transaction B 前后注入崩溃，并用持久 operation
  + `inspect()` 精确区分 absent/present/manual_attention；
- Fake bytes 不进入 Contract Fixture、Snapshot、日志或 QA Evidence；
- 不启动 helper，不访问 Keychain，不进入 Main/Preload/Renderer。

DFI-4A.1 只验证 Port 和 journal 语义；真实 SQLite + Keychain 跨存储恢复属于 DFI-4A.2。

### 10.1 Foundation 恢复分类

DFI-4A.1 必须用 SQLite close/reopen + Fake Store 证明以下分类；不宣称跨 SQLite/Keychain exactly-once：

| 窗口 | durable fact | `inspect()` | 恢复结果 |
| --- | --- | --- | --- |
| C1：Transaction A 前 | 无 operation | 不调用 | 无副作用，可由新 command 重试 |
| C2：intent 后、store 前 | `intent_committed` + target ref | `absent` | 无 Secret 可恢复，进入 `manual_attention`；不建 model/head/receipt success |
| C3：store 后、Transaction B 前 | 同上 | matching `present` | 从 operation 的 safe target material 执行一次聚合 Transaction B |
| C3-mismatch | 同上 | present 但 binding 不匹配 | 失败关闭为 `credential_binding_conflict` |
| C4：Transaction B 后响应丢失 | committed Receipt | 不需要 | 原样重放 Receipt，不二次 store/commit |
| U2：replacement 后、revision commit 前 | update intent + new ref | matching `present` | 聚合提交新 revision/head/status/receipt |
| U3：新 revision 后、旧 ref cleanup 前 | `credential_cleanup_pending` | old ref present/absent | 保持新 revision，按旧 Task 引用证明决定延后或幂等清理 |
| D2：delete 后、tombstone 前 | delete intent | target ref absent | 聚合提交 tombstone + Receipt；若 inspect unavailable 则 manual attention |

恢复路径不得重新读取 Renderer Secret、重新分配 reference、重新选择 model/profile/endpoint，或创建第二个
command。Operation 中的 safe target material 与 digest 是唯一 Transaction B 输入。

## 11. Runtime Registry Foundation

`PersonalModelRuntimeRegistry` foundation：

- 按 exact `personalModelId + configurationRevision` 加载 immutable definition；
- 校验 `configurationRevision`、`executionDefinitionDigest`、Endpoint 与 Credential binding digest；
- 输出 private `PersonalModelRuntimeCandidate`；
- 不 resolve Secret，不构造生产 Provider Handle；
- 不进入企业 Registry Generation；
- 不进入生产 `RuntimeSelectionService.listModels()`、Agent Loop、CapabilityLock 或 SubmitTurn；
- exact revision 缺失或 digest 漂移时失败关闭。

## 12. 状态与偏好规则

- create 后初始状态固定 `unverified`；
- 状态事实是 immutable history，状态更新只追加新行；读取最新状态使用
  `(ownerScopeNamespaceRevision, ownerScopeDigest, personalModelId, configurationRevision, statusRevision DESC)`
  有界索引；
- `available` 只能由 DFI-4A.3 真实调用或显式测试 Fixture 产生；
- `network_failed` 仍可选择并允许下一次真实调用重试；
- `permission_denied` 来自权威 entitlement/owner 解析，不由 Renderer 推断；
- 相同 `executionDefinitionDigest` 的显示名称更新可继承状态，但必须生成明确 carry-forward 事实；
- carry-forward 状态行必须保存来源 configuration revision、来源 status revision 与来源 status record digest；
  读取时重算并验证来源，缺失、跨 owner/model、来源 execution digest 不同或来源 digest 漂移均失败关闭；
- carry-forward 来源使用复合自引用 FK 锁定不可变来源；旧 Task 后续更新旧 configuration 状态时，只能为旧
  configuration 追加新 status revision，不得修改或破坏已经被 carry-forward 证明引用的旧来源行；
- 执行定义或 Credential 变化必须新建 `unverified` 状态事实；
- preference 只建立本地 durable fact，本批不影响生产任务选择；
- `delete_pending` 和 `tombstoned` 均不出现在 active list，但历史 definition/status/Receipt 保留；
- 本批不执行破坏性 GC。

## 13. QA 矩阵

### 13.1 Contract

1. `v1alpha2` strict schema 接受最小合法 safe summary；
2. 拒绝未知字段与非法枚举；
3. `providerModelId` 与 `displayName` 分离；
4. safe Endpoint 只含 display host/digest；
5. API Key、credentialRef、ownerScopeDigest、canonical Endpoint 被拒绝；
6. 八状态与 available/unavailableReason 一致；
7. `v1alpha1 ModelProjection` 字节/行为回归；
8. 未广告未上线的 Personal Model feature。

### 13.2 Domain 与 identity

9. canonical key 顺序与 Unicode NFC 稳定；
10. 相同语义输入 configuration revision 相同；
11. 墙钟/status 不影响 configuration revision；
12. displayName 更新只改变 configuration revision，不改变 execution digest；
13. Provider/Endpoint/model/key/capability 更新改变 execution digest；
14. 状态更新只推进 status revision；
15. 同 execution digest 状态 carry-forward；
16. execution digest 变化固定回到 unverified；
17. requestId/transport ID 不进入稳定 identity；
18. corrupt material/digest fail-closed。

### 13.3 Persistence 与恢复

19. migration 23 fresh；
20. migration 22→23 upgrade；
21. migration 1～22 未改写；
22. InMemory/SQLite 同一 conformance；
23. immutable definition 不可覆盖；
24. exact old revision close/reopen 后可加载；
25. head CAS 单写者；
26. status CAS 单写者；
27. preference CAS；
28. tombstone 不删除历史；
29. active list cursor/limit 有界；
30. command 同 digest 幂等 replay；
31. command 不同 digest conflict；
32. intent 后崩溃恢复；
33. receipt commit 后响应丢失重放；
34. corrupt head/definition/status/receipt fail-closed；
35. 1000 次序列后 statement/handle/timer/listener 有界。

### 13.4 Credential 与 Endpoint

36. opaque credentialRef 可恢复，Secret 不进 SQLite；
37. binding digest 不能替代 lookup ref；
38. Fake store replace 产生新 ref，旧 ref 生命周期显式；
39. delete_uncertain 不伪装成功；
40. canonical Endpoint 保留 path；
41. userinfo/query/fragment/非 HTTPS 拒绝；
42. public projection 不出现 canonical Endpoint；
43. preset profile revision 被锁定。

### 13.5 边界与回归

44. Main/Preload/Renderer/Central/Document Worker 零改动；
45. Core private HTTP/runtime wiring 零改动；
46. 无 Keychain/helper/fetch/Provider production call；
47. 无新增依赖、lockfile 不变；
48. DFI-4A.2～4A.4、DFI-2B、DFI-3、DFE-6 无超前；
49. Workspace full check；
50. Central online/offline 严格串行；
51. 敏感字段静态扫描；
52. QA Evidence 只含 count/digest/status/duration/resource metrics/typed error。

### 13.6 Revision 2 历史关闭项

以下为 Revision 2 已冻结的历史关闭项；其中 migration 23 表数量已由 Revision 3 的七表方案取代，
编码验收以 §13.7 的七表、owner namespace 和 immutable status 要求为准。

53. Credential ref 由 256-bit CSPRNG 预分配，Transaction A 后 close/reopen 保持同一 ref；
54. 同 command 携带第二份 Secret 被拒绝为 `credential_input_already_bound`，Secret/Secret digest 均不持久化；
55. Fake Store `inspect()` 真实区分 C2 absent、C3 matching present 与 binding mismatch；
56. create 聚合提交在 definition/head/status/operation/receipt 任一写点失败时整体回滚；
57. update/delete/status/preference 聚合提交具备相同原子性与 typed CAS conflict；
58. operation phase 只能按冻结图 forward-only 推进，非法跳转、回退、重复不同输入均拒绝；
59. `operationId === commandId` 在 Domain、Port、SQLite、Receipt 与 Evidence 中一致；
60. 四类 digest domain、canonical JSON、Unicode NFC、capability ordering 与格式逐项固定；
61. owner scope 只绑定 enterprise/user/device，clientInstanceId 变化不改变 owner digest但仍约束单次命令；
62. 八状态、available、unavailableReason、credentialState strict 组合矩阵全覆盖；
63. carry-forward 保存并验证三项来源证明，跨 owner/model/execution 或漂移全部失败关闭；
64. migration 23 的 PK/FK/UNIQUE/CHECK/index 与 schema-preflight 逐项一致；表数量以 Revision 3
    七表方案为准；
65. active list 的 limit、byte bound、稳定顺序与 stale opaque cursor 全覆盖；
66. C1/C2/C3/C3-mismatch/C4/U2/U3/D2 使用 SQLite close/reopen + Fake Store 实际执行；
67. old credential cleanup 在旧 revision 仍有引用时保持 pending，不破坏 exact revision reload；
68. 无真实 Keychain、Provider、Desktop CRUD、Catalog/Task lock、Agent Loop 或生产 Runtime wiring。

### 13.7 Revision 3 关闭项

69. migration 23 七表 fresh/upgrade，`personal_model_owner_scope_namespaces` 唯一 active namespace；
70. Core close/reopen 后恢复同一 active owner namespace，不重新生成导致旧模型失联；
71. Prompt Cache namespace 与 personal-model owner namespace 隔离，key/digest/domain 均不可混用；
72. 所有 owner-scoped 表均包含 `owner_scope_namespace_revision`，owner identity 使用 namespace revision + digest；
73. status facts 只能 append，新 status revision 不覆盖旧行；
74. 最新状态读取使用 status revision DESC 索引，旧 Task 更新旧 configuration 不破坏 carry-forward 来源；
75. carry-forward 自引用复合 FK 覆盖来源 configuration/status revision/record digest，来源漂移失败关闭；
76. delete Transaction A 原子提交 operation intent + head `active -> delete_pending`；
77. `listActiveHeads()` 排除 `delete_pending` 和 `tombstoned`；
78. Credential 删除 uncertain/manual_attention 后 head 保持 `delete_pending`，不自动恢复 active；
79. Transaction B 成功后 delete head 才推进 `tombstoned`；
80. `inspect(credentialRef)` 只返回 strict discriminated observation，Secret/Keychain 私有数据不外泄；
81. C3/U2 只有 reference、operation、revision、binding digest 全匹配才允许 Transaction B；
82. inspect binding mismatch 返回 typed conflict，不猜测、不按存在即成功；
83. active list `queryRevision` canonical tuple、HMAC cursor domain、last sort key 绑定全覆盖；
84. active head 集合变化、selectionState 变化或 queryRevision 漂移返回 typed stale cursor；
85. queryRevision 计算有最大扫描项数和 canonical byte bound；
86. Endpoint 使用 WHATWG URL；拒绝非 HTTPS、尾点、userinfo、query、fragment、encoded slash/backslash、
    null byte；
87. Endpoint hostname IDNA ASCII 小写、默认 443 省略、空 path 为 `/`、dot segment 解析、percent encoding canonical；
88. Endpoint 不静默改写重复斜杠，custom path 语义保持；
89. Revision 3 修改未触碰 `apps/**`、`services/**`、`packages/**`、migration 实现、Contract、依赖、
    版本或 lockfile。

### 13.8 Revision 3.1 P2/P3 关闭项

90. owner namespace `record_json` / `record_digest` 不包含 `namespace_key`，敏感 key 不进入 Evidence；
91. active namespace 通过 SQLite partial unique index 强制唯一，schema-preflight 验证 index SQL；
92. operations/receipts 以 `(owner_scope_namespace_revision, owner_scope_digest, command_id)` 为复合主键；
93. owner-scoped operation/receipt replay、conflict、lookup 和 receipt load 均不能只用裸 `command_id`；
94. delete Transaction A 持久化 `expected_configuration_revision`、`expected_execution_definition_digest`
    与 `previous_credential_ref`，缺失任一项失败关闭；
95. delete Credential step 和 Transaction B 只消费 Transaction A 持久化的删除目标，不重新从 head 猜测；
96. Endpoint canonicalization 对 `%2f/%2F/%5c/%5C` 大小写变体全部拒绝；
97. Endpoint path canonicalization 的 unreserved decode、uppercase percent-encoding、dot segment 解析与重复斜杠保留均有测试；
98. 所有 owner-scoped Port API 均显式接收 `PersonalModelOwnerIdentity`，无 `ownerScopeDigest` shorthand overload；
99. Revision 3.1 修改只触碰方案和治理文档，不进入生产编码或 Claude 发送流程。

### 13.9 Revision 3.2 P1/P2/P3 关闭项

100. migration 23 七表代码块不含 `REFERENCES ...`、`CHECK IN`、`SHA256 TEXT`、`bounded nullable`
     等不可直接落地的伪 SQL；
101. definitions/head/status FK 均写出完整 referenced columns，schema-preflight 验证 FK target 与
     referenced UNIQUE/PK 可用；
102. `credential_observation_json` 只接受 strict `present/absent/unavailable` discriminated union；缺失、
     分支外字段、未知字段、digest 漂移或与 `inspect()` 当前结果不匹配均失败关闭；
103. `credential_step_observed`、`credential_cleanup_pending`、`committed` phase 的 observation
     JSON/digest 非空 CHECK 覆盖；
104. `queryRevision` canonical tuple 使用 `ownerScopeNamespaceRevision` 全名，不使用
     `namespaceRevision` shorthand；
105. Endpoint canonicalization 执行顺序固定为 raw input pre-scan -> WHATWG parse -> normalized
     component recheck；
106. Receipt replay 对 `status_committed`、`preference_committed`、`delete_committed` 不单独证明业务事实，
     必须由同事务 status/preference/head fact 证明；
107. DFI-4A.1 不创建 retired namespace row，不实现 namespace rotation、migration 或 GC；
108. Revision 3.2 修改只触碰方案和治理文档，不进入生产编码、不修改 Contract/Core/migration 实现、不发送 Claude。

### 13.10 Revision 3.3 最终关闭项

109. `namespace_key_check_digest` 公式、固定 domain、格式约束和 Core-private 边界逐项断言；
110. SQLite close/reopen 后，在 owner digest 或 cursor HMAC 使用 key 前先验证 key check 与 namespace record；
111. namespace key/check/record 任一缺失、损坏或不匹配均 typed fail-closed，且不生成第二个 namespace；
112. `inspect()` 三分支 strict schema 覆盖合法形状，并拒绝跨分支字段、未知字段和 nullable metadata 伪造；
113. C3/U2 只接受 matching `present` 的 ref/operation/revision/binding digest，其他分支不能提交 Transaction B；
114. delete 只接受 exact ref 的 `absent` 证明；`unavailable` 只进入 manual attention 且不产生 success Receipt；
115. credential observation canonical JSON/digest 与 phase-specific branch 规则在 InMemory/SQLite Conformance 中一致；
116. Endpoint raw null、`%00` 及大小写/混合 encoded slash/backslash/null 变体在 WHATWG parse 前拒绝，
     normalized component 的 null/C0 control recheck 也失败关闭；
117. Revision 3.3 仅修改方案和治理文档，DFI-4A.0 历史快照保留但回链当前状态；生产源码、Contract、
     migration 实现、依赖、版本和 lockfile 零改动。

## 14. 实施拆分

### Step 1：Contract 与纯 Domain

- additive safe schema；
- canonicalization 与四类 identity；
- 状态/偏好/Receipt 类型；
- focused tests。

### Step 2：Migration 与双 Adapter

- migration 23；
- 聚合 Persistence Port 与只读查询；
- InMemory/SQLite；
- immutable history、CAS、聚合事务、Receipt 与 close/reopen conformance。

### Step 3：Fake Store 与 Registry Foundation

- Fake `PersonalCredentialStore`；
- 预分配 Reference、`inspect()` 与命名 operation recovery；
- runtime candidate resolver；
- 边界扫描与完整门禁。

Port 与所有生产 Adapter 必须在同一批完整交付，不允许接口半切换。

## 15. 交付物

- 修改文件清单；
- Contract additive 与 `v1alpha1` 回归证据；
- migration 23 SQL、manifest/digest 与 forward-only 证明；
- owner namespace 七表结构、active namespace 恢复与 namespace 隔离证明；
- configuration/execution/status/record 四类 identity 说明；
- immutable revision history 与 exact reload 证据；
- immutable status history、carry-forward 自引用来源证明与 latest status 查询证据；
- opaque credentialRef 和 canonical Endpoint 私有边界；
- Operation/Receipt 单一事实说明；
- Transaction A/B 聚合事务、delete_pending 选择阻断与 C1～D2 恢复证据；
- inspect binding metadata、queryRevision/cursor 与 Endpoint canonicalization 证据；
- Revision 3.1 owner namespace private material、owner-scoped operation PK、delete target material 与
  Endpoint percent-encoding 收口证据；
- Revision 3.2 implementable migration SQL、Credential observation durable proof、Receipt 条件事实证明、
  Endpoint raw pre-scan 顺序和 namespace retired 非目标证明；
- Revision 3.3 namespace key integrity proof、inspect discriminated union、`%00` Endpoint 负向矩阵与
  历史状态回链证据；
- owner authority 与 Contract 状态组合矩阵；
- InMemory/SQLite/Fake Conformance；
- 完整门禁结果与敏感扫描；
- 已知残余风险和 DFI-4A.2 交接项；
- 新增 P0/P1 清单。

## 16. 工期

建议 **9～14 个集中工程工作日**：

| 工作项 | 估算 |
| --- | ---: |
| Contract、纯 Domain、digest 与 owner authority | 2～3 天 |
| migration 23、preflight 与不可变版本结构 | 2～3 天 |
| 聚合 Port、InMemory/SQLite 事务 Conformance | 2.5～4 天 |
| Fake Store、命名恢复、Registry Foundation 与门禁 | 2.5～4 天 |

不含独立 QA、返工和 DFI-4A.2 真实 Credential Broker。

## 17. 评审问题

请重点确认：

1. preallocated random credentialRef + operation inspect 是否关闭 C2/C3/U2 跨存储恢复缺口；
2. 聚合 `PersonalModelPersistence` 是否保证 Transaction B 无半提交；
3. exact digest/canonicalization 和 owner authority 是否达到可编码精度；
4. migration 23 的复合 FK、CHECK、索引、record_json 与 schema-preflight 是否完整；
5. carry-forward provenance 与八状态 Contract 组合是否严格；
6. private canonical Endpoint、credentialRef 与 public safe Projection 是否保持零泄漏；
7. Operation Journal 与 durable Receipt 是否仍为两类单一事实；
8. DFI-4A.1 是否保持不进入真实 Keychain、Provider、Desktop CRUD、Task lock 或 Agent Loop；
9. 是否出现新的 P0/P1 或对 DFI-4A.2/4A.3 的返工风险。

## 18. 当前状态

```text
DFI-4A.0 repair.1   PASS/CLOSED
DFI-4A.0            PASS/CLOSED
DFI-4A.1            PASS/CLOSED
DFI-4A.2.1          PASS/CLOSED
DFI-4A.2.2 Plan     DOCUMENT REVIEW PENDING / CODING GATED
DFI-4A.2.3～4A.4    GATED
DFI-2B / DFI-3      GATED
DFE-6               PASS/CLOSED
TGM-1+              GATED
```

Revision 3.3 已通过 Claude Code 最终差异复核（P0/P1/P2/P3 均为 0），用户已明确授权并完成
DFI-4A.1 范围内实现。开发者门禁、Claude Code 独立 QA 与用户接受均已完成，DFI-4A.1 正式关闭；
该关闭不自动解锁任何后续批次。
