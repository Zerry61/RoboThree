# DFI-4A：个人模型与 Credential Foundation 开发计划

> 状态：**DFI-4A.0～4A.3 PASS/CLOSED；ADR-013 Addendum A ACCEPTED；DFI-4A.4 PLAN/4A.4.0 PASS/CLOSED；THREE BLOCKER DOCUMENTS PASS/CLOSED；EIPC-0 / STRM-0～STRM-2 / EIPC-1.0/EIPC-1.1.1～EIPC-1.1.2 PASS/CLOSED；EIPC-1/EIPC-1.1/EIPC-1.1.3 PLAN PASS/CLOSED；EIPC-1.1.3.1 IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING**  
> 计划版本：Revision 1 + DFI-4A.1 Revision 3.3 addendum  
> 日期：2026-08-20  
> 负责人：Codex 5.6  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 架构依据：ADR-011、ADR-013、ADR-014、ARH-3、DFI-2A  
> 当前门禁：DFI-4A.0～4A.3 已正式关闭；ADR-013 Addendum A 已 ACCEPTED；DFI-4A.4 计划与 4A.4.0 Preflight 已关闭；三份 blocker 文档、EIPC-0、STRM-0～STRM-2、EIPC-1.0/EIPC-1.1.1 已关闭；EIPC-1 与 EIPC-1.1 计划已关闭，EIPC-1.1.2 只进入文档评审，identity blocker 保持打开；EIPC-1.1.2～1.1.3、EIPC-1.2～1.3、EIPC-2～3、STRM-3 与 4A.4.1～4A.4.3 继续 GATED

## 1. 目标

DFI-4A 为 RoboThree Desktop 建立真实个人模型基础能力，使个人模型能够：

1. 在 Local Core 中创建、更新、列出和删除；
2. 使用本机 OS Keychain 保存 API Key，SQLite 只保存 opaque credential reference；
3. 通过受控敏感通道新增、替换、解析、删除，并在架构增补接受后由所有者主动查看 Key；
4. 作为 `local_personal` 模型参与统一模型选择、用户默认偏好、机器人约束和 Task 精确锁定；
5. 通过 OpenAI-compatible 最小协议执行真实任务调用；
6. 由真实调用把状态从“未验证”收敛到“可用”或类型化失败状态；
7. 在重启、并发、取消、超时、Credential Store 故障和跨存储崩溃窗口下失败关闭；
8. 保持个人模型与企业模型的 Credential、调用、Usage、故障和权限域相互隔离。

本阶段不是个人模型运营平台，也不实现自动路由、测试连接、批量导入、共享 Key 或企业托管 BYOK。

## 2. 当前事实与缺口

### 2.1 已存在并直接复用

- ADR-013 已接受 `PersonalCredentialStore` 的 `store / replace / resolve / delete` 语义；
- Local Core 已作为独立 child process 运行，Electron Main 与 Core 之间已有 Node child IPC；
- Renderer → context-isolated Preload → Main 的固定 IPC 白名单、strict Schema 与窗口安全基线已存在；
- Desktop Local `v1alpha2` additive sidecar 与 feature negotiation 已存在，`v1alpha1` 必须保持不变；
- `ModelProjection` 已具有 `personal / enterprise / official` 来源，但当前只提供粗粒度只读字段；
- Task Runtime Selection、CapabilityLock、SubmitTurn、Agent Loop、Compaction、Provider Stream Validator、
  Usage Fact 和 Prompt Cache 基线已经完成；
- ARH-3 已冻结 `central_enterprise / local_personal` authority 分离，并提供
  `LocalPersonalUsageAuthorityPort` 的 Port/Fake/Conformance；
- SQLite 当前最新 migration 为 `22`，DFI-4A 不得改写 migration 1～22；
- DFE-5A.1 已实现安全只读模型页和个人模型 GATED 区，但没有真实 CRUD 或 Credential 链路。

### 2.2 尚不存在

- 个人模型 Domain、Persistence、revision、状态事实和用户默认模型事实；
- 生产 `PersonalCredentialStore`、macOS Keychain Adapter 和受控敏感 Broker；
- 已保存 Secret 返回所有者 Renderer 的 ADR-013 反向通道安全实现增补；允许所有者主动查看个人 Key
  已由 Model Experience Spec 冻结，不再作为产品范围决策；
- 个人模型的生产权限/owner scope resolver；
- 个人模型 OpenAI-compatible Provider Adapter；
- 个人模型真实 Usage Persistence、调用恢复和状态收敛；
- 个人模型加入 Trusted Model Catalog、CapabilityLock、Runtime Handle Resolver 的生产链；
- Personal Model CRUD、默认偏好和安全状态的 Desktop Projection/API/E2E。

## 3. 冻结范围

### 3.1 P0 范围

- Provider：`deepseek / zhipu / kimi / custom`；
- 协议：个人模型首期只支持 `openai_compatible`；
- 字段：Provider、canonical Endpoint、Provider 模型标识、显示名称；
- Secret：新增、替换、解析、删除；产品已允许所有者主动查看个人 Key，真实 reveal 实现仍需
  ADR-013 Addendum 接受；
- 状态：`unverified / available / authentication_failed / network_failed /
  protocol_incompatible / model_not_found / unavailable / permission_denied`；
- 用户默认模型与当前 Task effective model 分离；
- 真实调用、Streaming、取消、Deadline、Usage、重启恢复和任务精确锁定；
- macOS Keychain 生产 Adapter；Windows Adapter 保持 Windows 分发前门槛；
- Desktop safe Projection 与专用敏感 IPC sidecar；
- InMemory/SQLite/Fake/real Keychain/真实进程级 E2E。

### 3.2 非目标

- 个人模型测试连接；
- Anthropic-compatible 个人模型；
- 自动发现 Provider 模型列表；
- 自动最佳模型、延迟测速、负载均衡或故障静默换模；
- 个人模型共享、团队 Key、Central 代理、备份或同步；
- 企业 Credential 输入或查看；
- 多用户共享 OS 账户的完整隔离；
- Key rotation 平台、通用 Secret Store、API Key Marketplace；
- Provider Prompt Cache 显式启用；本批只复用 Usage/Cache 数据语义，不声明 cache hit；
- DFI-2B 风险矩阵、DFI-3 Catalog、Knowledge、Memory、DFE-6；
- Renderer 页面真实接入；其后续 DFE 集成批次需另行计划和授权。

## 4. 核心架构决策

### 4.1 所有权与权限

Local Core 是个人模型元数据、偏好、状态、操作协调和调用的业务 owner。

生产 authority 必须来自已验证的企业身份/设备会话与已激活配置，不接受 Renderer 自报 userId、
enterpriseId、deviceId 或权限。建议冻结：

```text
required entitlement = personal_model.configure
ownerScopeDigest = HMAC(
  active personal-model owner namespace,
  enterpriseId + userId + deviceId
)
```

- `personal_model.configure` 同时控制本期个人模型的新增、编辑、使用和查看；
- 权限被收回后，模型不能用于新 Task，也不能编辑或查看 Key，但允许所有者删除本机模型和 Credential；
- DFI-4A.1 持久化独立 personal-model owner namespace；禁止复用 Prompt Cache namespace；
- Core 重启后必须恢复同一个 active namespace，不得重新生成导致旧个人模型失联；
- owner identity 固定为 `ownerScopeNamespaceRevision + ownerScopeDigest`；
- `ownerScopeDigest` 只进入本地持久层和安全判断，不进入普通 Renderer Projection；
- `clientInstanceId` 绑定单次敏感命令，不进入长期 owner identity；
- 无可验证 owner/session 时失败关闭，不回退到“当前 OS 用户即授权用户”的推断。

`enterpriseId / userId / entitlement` 的权威来源固定为当前已验证并在本地 Runtime Active 的企业身份、
配置与会话事实。每次个人模型操作不要求 Central 在线，也不得建立 DFI-4A 私有的第二套会话时钟。
离线行为直接复用已经接受的 CGF-1.3 企业离线状态 2/3：

| 既有状态 | 判定事实 | 个人模型行为 |
| --- | --- | --- |
| 状态 2：企业服务暂时不可用 | Central 暂时不可达，但 Enterprise Access Token、Device Trust、scope、entitlement 与 Compatibility 仍有效 | 允许同一 owner 新增、使用、编辑、查看和删除个人模型；不要求每次操作在线复核 |
| 状态 3：企业会话失效 | Access Token 过期/无效、Device Trust 失效、scope/entitlement 不成立或 Compatibility 失败 | 禁止新增、使用、编辑和 reveal；同一已绑定 owner 仍可删除本机个人模型与 Credential |

- Central 不可达本身不等于权限失效；
- 状态 Projection 与有效性校验来自 Core 已有权威事实，不由 Renderer 推断；
- 本批不新增配置过期策略、离线租约、设备失联阈值、实时撤销或复杂恢复 workflow；
- 如果未来要求 Access Token 失效后仍长期离线使用个人模型，必须另立产品决策和安全 ADR，不能在
  DFI-4A 实现中静默扩张。

上述 entitlement 标识、权威来源和状态 2/3 行为是 Revision 1 冻结事实；编码时不得静默改名或另建
有效期规则。

### 4.2 企业与个人模型分离

```text
Enterprise model
  Central PostgreSQL + Enterprise Credential + Model Gateway

Personal model
  Local Core SQLite + PersonalCredentialStore + local Provider Adapter
```

- 两类模型可以合并为一个安全选择 Projection；
- 两类模型不得共享 Credential Reference、Provider Handle、Usage authority 或故障状态；
- 个人模型失败不能静默切换企业模型，企业模型失败也不能静默使用个人 Key；
- 已运行 Task 始终使用 TaskRuntimeSelection 和 CapabilityLock 中的精确模型 revision。

### 4.3 Contract 与敏感通道分离

普通安全事实使用 Desktop Local `v1alpha2` additive sidecar：

- Personal Model safe summary/detail；
- personal model permission/availability；
- user preferred model 与 effective selection 结果；
- create/update/delete/default 操作的 path-free、secret-free Receipt；
- typed error code。

Secret 不进入 `packages/contracts` 公共 Contract、Core private HTTP、URL、SSE 或普通日志。

敏感链路固定为：

```text
Renderer sensitive component
  → context-isolated Preload private sidecar
  → Electron Main fixed IPC channel
  → Node child IPC request/response
  → Local Core Application
  → PersonalCredentialStore
  → macOS Keychain
```

Main/Core 敏感通道必须使用独立、严格、版本化的 private protocol，和 boot/shutdown 消息使用不同
message type；Main 不读取、转换、缓存或记录 Secret，只做边界校验、请求关联和 deadline/cancel 收口。
DFI-4A.0 repair.1 已证明当前生产 `CorePrivateSupervisor` 的 `serialization: "json"` 不保留敏感
Buffer，因此后续实现不得静默复用现有 inherited IPC。DFI-4A.2+ 真实 Credential 路径必须在详细方案中明确选择：

1. 新增独立敏感通道/helper channel；或
2. 显式改造 supervisor serialization，并完整回归 boot/shutdown、readiness、shutdown、crash 与敏感 Buffer。

### 4.4 ADR-013 Addendum：所有者查看已保存 Key

Model Experience Spec 已明确允许个人模型所有者主动查看自己的已保存 Key，且企业 Credential 永不提供
查看入口。因此 DFI-4A.0 不再决定“是否允许查看”，只负责形成并接受 ADR-013 Addendum，冻结真实 reveal
的最小安全实现边界：

1. 仅个人模型所有者、当前验证会话和当前 `webContents` 可请求；
2. Main/Core 使用专用 child IPC，Secret 不经过普通 HTTP、公共 Contract、URL、参数或日志；
3. 每次 reveal 绑定 `commandId + personalModelId + expectedRevision + clientInstanceId`；
4. Core 在解析前重新校验 owner、权限、model revision 和 credential reference；
5. Main 只把一次结果返回发起请求的 Renderer，不广播、不缓存、不写剪贴板；
6. Renderer 只在当前组件局部内存持有；隐藏、路由离开、弹窗关闭、组件卸载或窗口关闭时清除；
7. 不提供独立复制按钮，不检测系统截图；
8. reveal timeout/transport disconnect 不返回空字符串伪装成功，不自动重放；
9. 每会话有界并发与频率限制；
10. Evidence 只记录命令结果、digest 和 typed error，不记录 Secret。

Addendum 未接受时，DFI-4A 可以实现新增、替换、调用和删除，但真实 reveal 必须保持 GATED。

### 4.5 macOS Keychain Adapter 前置 Spike

不得直接假定某个原生依赖可用。DFI-4A.0 必须实际验证目标实现是否满足：

- Node 24.13.0 与当前 Electron/child process 架构兼容；
- Secret 只通过内存或 stdin/stdout pipe，绝不进入 argv、env、临时文件或 shell history；
- `store / replace / resolve / delete` 幂等和错误分类可实现；
- Keychain locked、not found、access denied、corrupted、cancelled 可稳定映射；
- 5 次进程启停、异常退出和 Keychain lock/unlock 后资源归零；
- dependency/license/supply-chain 清单可接受；
- fat package、签名与 macOS 分发可行。

DFI-4A.0 repair.1 已证明临时 Keychain 正常生命周期、wrong-password `access_denied`、broker
`cancelled`、受控 `corrupted`、异常退出恢复、modern `SecItem*` 隔离生命周期、真实 HTTPS
pinning 和多编码泄漏扫描；生产签名 helper、ACL、安装包升级/卸载生命周期仍必须后置到 DFI-4A.2
签名 app/helper E2E。

优先级：Core child 内真实 Keychain Adapter > Main 极窄 Broker。若 Spike 不能证明 Core child 方案，
必须回到文档评审决定 Main Broker；禁止自动退化为 SQLite 明文、加密文件或 Electron LocalStorage。

### 4.6 Endpoint 与 Provider Profile

预设 Provider 的 Endpoint 来自版本化 `PersonalProviderProfileRegistry`，不散落在 Renderer 文案中。

自定义 Endpoint 必须：

- `https`；测试仅显式放行随机 loopback；
- 禁止 userinfo、query、fragment、重定向；
- 禁止 loopback、link-local、multicast、metadata、私网目标和解析后的私网地址；
- DNS 解析与实际连接地址必须受同一 transport policy 约束，防 DNS rebinding；
- 有固定 connect/read/overall deadline、响应头/正文/事件数量/单 delta/总 bytes 上限；
- Authorization 只进入 header，不进入错误、Trace、Fixture 或 Evidence。

具体 HTTP transport 依赖如需新增，必须在 DFI-4A.0 供应链评审中冻结；不得在编码时临时安装。

### 4.7 Personal Model Runtime Registry

不得把可变个人模型直接塞入当前企业 Registry Generation，也不得让 Agent Loop 重新选择模型。

新增 Core 私有的 `PersonalModelRuntimeRegistry` / resolver：

- 从 SQLite 精确 revision 重建个人 `ModelDefinition`、Capability material 与 Provider Handle；
- 不生成第二套 local Registry Generation；personal standard lock 复用 Task bundle 的 shared
  `registryRevision` 作为共同配置 epoch，personal integrity 由 snapshots、authenticated
  configuration ref 与 exact immutable facts 独立证明；
- Task 创建时锁定 personal model id/revision、provider profile revision、endpoint digest、adapter revision；
- `RuntimeAdapterHandles` 通过组合 resolver 精确解析企业或个人 Handle；
- 应用重启后只能重建 exact revision；缺失、Credential 不可用或 digest 漂移时失败关闭；
- 已运行 Task 不因个人模型编辑、状态刷新或默认偏好变化而更换模型。

### 4.8 默认模型与 Task 锁定

```text
userPreferredModel       长期本地偏好
effectiveModel           当前待创建 Task 的解析结果
TaskRuntimeSelection     首次提交后的不可变锁定事实
```

- 有效 user preference 优先；
- 无有效偏好时使用后台顺序第一个可用企业模型；
- 企业模型为空但存在可选择个人模型时返回 `explicit_selection_required`，不猜测默认；
- 机器人约束只改变当前 effective model，不覆盖 user preference；
- 无机器人约束的手动选择需要 DFI-4A.4 独立 safe preference command 表达长期 mutation intent；现有
  SubmitTurn `requestedModelId` 不得被静默解释为更新 user preference；
- preference command 更新失败不得改写已提交 Task selection；DFI-4A.4 通过 typed partial outcome
  说明结果；
- 删除默认个人模型后复用相同解析规则。

### 4.9 模型状态

状态唯一来源在 Core：

| 状态 | 来源 | 可选择 |
| --- | --- | --- |
| `unverified` | 新建或 Provider/Endpoint/model/key 变化 | 是 |
| `available` | 最近一次受支持的真实调用成功 | 是 |
| `authentication_failed` | Provider 认证失败 | 否 |
| `network_failed` | 最近一次真实调用网络失败 | 是，带警告 |
| `protocol_incompatible` | strict parser/stream validator 拒绝 | 否 |
| `model_not_found` | Provider 明确返回模型不存在 | 否 |
| `unavailable` | Keychain/Adapter/Provider 暂不可用 | 否 |
| `permission_denied` | entitlement 或 owner 校验失败 | 否 |

只修改显示名称不重置调用状态；Provider、Endpoint、模型标识或 Key 变化必须进入 `unverified`。
保存不发起网络请求，也不生成 `available`。

## 5. Persistence 与跨存储一致性

### 5.1 Migration 23：个人模型事实

DFI-4A.1 预留 Core SQLite migration `23`。若编码前已被占用，必须回到文档评审整体升号，禁止静默改号。

Revision 3.3 冻结为以下七表；字段级 canonical material 以专项
[DFI-4A.1 方案](./DFI-4A.1-DOMAIN-CONTRACT-PERSISTENCE-DEVELOPMENT-PLAN.md) 为准：

```text
personal_model_owner_scope_namespaces
  namespace_revision PK
  namespace_key private
  namespace_key_check_digest private
  status active | retired
  created_at
  record_digest / record_json

personal_model_definitions
  (owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
   configuration_revision) PK
  execution_definition_digest
  provider_kind
  provider_profile_revision
  canonical_endpoint
  endpoint_identity_digest
  provider_model_id
  display_name
  credential_ref
  credential_revision
  credential_binding_digest
  capabilities_json
  created_at
  record_digest / record_json

personal_model_heads
  (owner_scope_namespace_revision, owner_scope_digest, personal_model_id) PK
  current_configuration_revision
  current_execution_definition_digest
  selection_state active | delete_pending | tombstoned
  head_revision
  updated_at
  record_digest / record_json

personal_model_status_facts
  (owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
   configuration_revision, status_revision) PK
  configuration_revision
  execution_definition_digest
  status
  status_revision
  carried_from_configuration_revision nullable
  carried_from_status_revision nullable
  carried_from_status_record_digest nullable
  status_detail_code nullable
  status_detail_digest nullable
  created_at / updated_at
  record_digest / record_json

personal_model_preferences
  (owner_scope_namespace_revision, owner_scope_digest) PK
  model_source
  model_id
  configuration_revision
  preference_revision
  updated_at
  record_digest / record_json

personal_model_operations
  owner_scope_namespace_revision
  owner_scope_digest
  command_id
  PK(owner_scope_namespace_revision, owner_scope_digest, command_id)
  operation_type
  request_digest
  expected_configuration_revision nullable
  expected_execution_definition_digest nullable
  target_model_id
  target_credential_ref nullable
  previous_credential_ref nullable
  operation_phase
  credential_observation_json / credential_observation_digest nullable
  created_at / updated_at
  record_digest / record_json

personal_model_command_receipts
  owner_scope_namespace_revision
  owner_scope_digest
  command_id
  PK(owner_scope_namespace_revision, owner_scope_digest, command_id)
  command_type
  request_digest
  model_id
  committed_revision nullable
  outcome
  committed_at
  receipt_digest / receipt_json
```

`personal_model_definitions` 为不可变历史；`personal_model_heads` 只保存 current 指针和
`selection_state`，`delete_pending` 与 `tombstoned` 不进入 `listActiveHeads()`；delete intent 的
Transaction A 必须原子推进 `active -> delete_pending`，Credential 删除不确定时不得自动恢复 active。
状态事实为 immutable history，状态更新只追加新 `status_revision` 行；carry-forward 必须用
`carried_from_configuration_revision + carried_from_status_revision + carried_from_status_record_digest`
自引用复合 FK 锁定来源。状态事实不得进入配置版本或执行摘要。`record_json` 与索引列逐字段一致；完整 canonical Endpoint 和
opaque `credentialRef` 只存在于 Core 私有 definition/operation，普通 Contract、Projection、Receipt、
日志与 Evidence 不可见。Secret、Secret digest、Credential 内容和 Provider 原始响应不得进入任何表。
Operation Journal 与 Command Receipt 是两类独立事实，`operation.result_json` 不得成为第二套 Receipt。
active list cursor 使用独立 HMAC domain 绑定 `queryRevision` 与最后 sort key；`queryRevision` 由当前
owner 下 active head tuple 的 canonical SHA-256 计算。Endpoint canonicalization 使用 WHATWG URL，
仅允许 HTTPS，并按专项方案拒绝 userinfo、query、fragment、尾点、encoded slash/backslash、`%00` 与
raw null byte。
Revision 3.1 进一步冻结：owner namespace 的 `namespace_key` 不进入 `record_json/record_digest`；
active namespace 唯一性由 partial unique index 证明；operation/receipt 以 owner identity +
`command_id` 为复合主键；delete operation 必须持久化 `previous_credential_ref` 与删除时的
configuration/execution digest；Endpoint percent-encoding canonical form 必须可测试。
Revision 3.2 继续收口：migration 23 代码块必须使用可实现 SQLite 类型和完整 FK，不得留
`REFERENCES ...` 或伪类型；Credential step 必须持久化 bounded observation JSON 和 digest；
Receipt replay 不得单独证明 status/preference/delete 业务事实；Endpoint canonicalization 顺序固定为
raw pre-scan -> WHATWG parse -> normalized component recheck；`retired` namespace 仅为未来兼容枚举。
Revision 3.3 最终收口：owner namespace 增加独立 `namespace_key_check_digest` 并在 key 使用前验证；
Credential `inspect()` 改为 strict `present/absent/unavailable` discriminated union；只有 matching
`present` 能证明 create/update binding，delete 只接受 exact `absent`，`unavailable` 进入 manual attention；
Endpoint raw pre-scan 显式拒绝 `%00`；DFI-4A.0 历史文档保留当时状态并回链当前 Revision 3.3。

### 5.2 Migration 24：调用与 Usage

DFI-4A.3 预留 migration `24`：

- personal model invocation link / attempt；
- stable logical invocation identity、transport attempt identity、fencing epoch；
- durable terminal、cursor、output-started、status projection；
- `local_personal` Provider Usage Fact 与 session projection；
- idempotency/conflict 与 stale owner fencing。

不得复制 ARH-3 公式；必须复用 `ProviderUsageFact`、attempt key、usage semantics 和既有 Projection 聚合。
Prompt Cache 默认关闭，不因 migration 24 声明真实 cache hit。

### 5.3 SQLite 与 Keychain 无跨存储事务

不存在 SQLite + Keychain 的原子事务。使用 durable operation journal + 幂等 Credential Port 收敛：

```text
Transaction A: persist intent + preallocated random opaque credentialRef（同一 durable operation 稳定复用）
External step: Keychain store/replace/delete/resolve
Transaction B: commit safe model fact + receipt / or mark manual attention
```

禁止先写“成功模型”再异步补 Secret，也禁止先删除 SQLite 记录后再 best-effort 删除 Keychain。

### 5.4 命名崩溃窗口

至少覆盖：

- C1：create intent 前；
- C2：intent 已提交、Keychain store 前；
- C3：Keychain store 后、model commit 前；
- C4：model commit 后、响应丢失；
- U1：update intent 后、replace 前；
- U2：new credential 已保存、model revision 未提交；
- U3：new revision 已提交、old credential cleanup 前；
- D1：delete intent 后、模型已禁止新选择；
- D2：Credential delete 后、SQLite tombstone/receipt 前；
- D3：SQLite 收口后、响应丢失；
- V1：reveal owner 校验后、resolve 前；
- V2：resolve 后、Main 转发前进程退出；
- I1：Provider accept 前；
- I2：Provider accept 后、output 前；
- I3：output started 后不可恢复；
- I4：terminal/Usage projection 前；
- I5：terminal commit 后响应丢失。

恢复必须按持久事实分类；不得把 output started 后的未知结果静默重试为第二次 Provider 调用。

## 6. 批次拆分

### DFI-4A.0：架构增补与 Adapter Preflight（2～4 工作日）

交付：

- ADR-013 Addendum：反向 reveal 最小边界；
- `personal_model.configure` entitlement 与 owner/offline 语义；
- macOS Keychain Adapter 实际 Spike；
- private child IPC 协议 Spike；
- custom Endpoint transport/DNS pinning 可行性；
- 依赖、License、签名、打包和供应链清单；
- 最终 class/port/protocol 选择与威胁模型。

实现结果：

- [ADR-013 Addendum](../../adr/013a-personal-credential-reveal-and-macos-keychain-addendum.md) 已由用户正式
  `ACCEPTED`，作为 DFI-4A.2.3 owner reveal 的安全实现依据；
- [Adapter Preflight 报告](./DFI-4A.0-ADAPTER-PREFLIGHT-REPORT.md) 已记录真实 Keychain、child IPC、
  Endpoint/DNS pinning、依赖、License、签名与打包结论；
- [Threat Model](./DFI-4A.0-PERSONAL-CREDENTIAL-THREAT-MODEL.md) 已冻结资产、信任边界、威胁、控制与残余风险；
- repair.1 已通过开发者串行门禁、Claude Code 独立 QA、Central online/offline 补跑与用户接受；
  未实现任何生产 Personal Model 能力。

禁止：生产 CRUD、migration、Preload API、Provider 调用或 Renderer 开放。

退出：已完成。用户已明确接受，DFI-4A.0-repair.1 和 DFI-4A.0 正式关闭。

### DFI-4A.1：Domain、Contract 与 Persistence Foundation（9～14 工作日）

正式方案：[DFI-4A.1 Revision 3.3](./DFI-4A.1-DOMAIN-CONTRACT-PERSISTENCE-DEVELOPMENT-PLAN.md)。

交付：

- safe Personal Model schema，以及 `configurationRevision`、`executionDefinitionDigest`、
  `statusRevision`、`recordDigest` 四类 identity 的纯逻辑；
- immutable definition history + current head，确保旧 Task 能按 exact revision 恢复；
- 独立持久化 personal-model owner namespace，owner identity 使用 namespace revision + owner digest；
- Core 私有 opaque `credentialRef` 与完整 canonical Endpoint；普通 Projection 只返回 host 与 digest；
- 聚合 `PersonalModelPersistence`，以单一事务提交 definition/head/status/operation/receipt；
- InMemory + SQLite 同一 Conformance；
- migration 23 七表 fresh/upgrade/close-reopen；
- immutable status facts、carry-forward 自引用来源证明、delete_pending 选择阻断；
- inspect binding metadata、active list queryRevision cursor、owner-scoped operation/receipt PK、
  delete target recovery material 与 Endpoint canonicalization；
- implementable migration SQL、Credential observation durable proof、Receipt 条件事实证明与
  namespace retired 非目标边界；
- namespace key integrity proof、Credential inspect discriminated union 与 `%00` Endpoint 负向矩阵；
- Fake PersonalCredentialStore；
- 预分配 random opaque credential ref、forward-only operation journal、独立 durable receipt、
  idempotency/conflict 与 C1～D2 Foundation 恢复分类；
- PersonalModelRuntimeRegistry 的 representation/resolver foundation，不接生产 Agent Loop。

禁止：真实 Keychain、Secret IPC、真实 Provider、Main/Preload/Renderer。

### DFI-4A.2：受控 Credential Broker 与 CRUD（13～21 集中工程日，不含独立 QA）

正式候选方案：[DFI-4A.2 Credential Broker / Keychain / CRUD Plan](./DFI-4A.2-CREDENTIAL-BROKER-CRUD-DEVELOPMENT-PLAN.md)。
计划已 `REVIEW PASS / CONFIRMED`；方案按 4A.2.1 Sensitive Transport + Keychain、4A.2.2 CRUD +
Recovery、4A.2.3 Reveal + Closure 三批拆分。现有 JSON lifecycle IPC 保持不变，4A.2.1 使用 fd4/fd5
双匿名 binary pipe。4A.2.1～2.3 均已完成独立 QA 和用户接受，DFI-4A.2 整体正式 `PASS/CLOSED`。

交付：

- macOS Keychain production Adapter；
- Electron Main ↔ Core child private request/response protocol；
- 新增、替换、删除的 sensitive path；
- Addendum 已接受时实现 reveal；否则 reveal 保持 typed unavailable；
- create/update/delete/reveal 命令级幂等、deadline、cancel、rate limit；
- C1～C4、U1～U3、D1～D3、V1～V2 恢复；
- Secret 四通道/多编码形态扫描与 Keychain 资源收口。

禁止：真实 Provider 调用、统一任务选择、Renderer 页面集成。

### DFI-4A.3：个人 Provider Runtime、Usage 与 Task 锁定（17～28 工作日）

详细方案：[DFI-4A.3 Personal Provider Runtime Plan](./DFI-4A.3-PERSONAL-PROVIDER-RUNTIME-DEVELOPMENT-PLAN.md)。

DFI-4A.3.2 详细方案：
[Unified Selection + Exact Task Lock + Composite Resolver](./DFI-4A.3.2-UNIFIED-SELECTION-EXACT-LOCK-DEVELOPMENT-PLAN.md)。

DFI-4A.3.3 详细方案：
[Agent Loop / Compaction / Recovery 闭环](./DFI-4A.3.3-AGENT-LOOP-COMPACTION-RECOVERY-CLOSURE-DEVELOPMENT-PLAN.md)。
该批已完成实现、独立 QA 和用户接受，DFI-4A.3 阶段整体正式 `PASS/CLOSED`。

交付：

- preset/custom OpenAI-compatible Provider Adapter；
- Endpoint policy、redirect deny、DNS/IP 安全、stream limits、cancel/deadline；
- migration 24 与 `local_personal` Usage Persistence；
- PersonalModelRuntimeRegistry 生产 resolver 与 composite handle resolution；
- 统一 Model Catalog、eligibility、user preference、effective model 和 Task exact lock；
- `unverified → available/typed failure` 状态收敛；
- I1～I5 status-first recovery；
- compaction 与 main invocation 复用 exact personal model revision；
- 企业/个人模型互不回退的 E2E。

禁止：DFI-2B、个人模型测试连接、Prompt Cache 显式启用、Renderer 页面集成。

### DFI-4A.4：Desktop 安全接口、Preload Sidecar 与联合 E2E（阻断修复后重新估算）

详细方案：
[DFI-4A.4 Desktop 安全接口、Preload Sidecar 与联合 E2E](./DFI-4A.4-DESKTOP-SAFE-INTERFACE-E2E-DEVELOPMENT-PLAN.md)。

当前代码核查证明本批不只是接口胶水：真实 Desktop composition 尚未装配 Runtime Active personal
owner authority、Personal Persistence/Coordinator、Keychain verified helper、Composite Resolver 和
startup recovery；因此拆为 4A.4.0 Production Composition Preflight、4A.4.1 production composition +
safe v1alpha2、4A.4.2 sensitive sidecar + CRUD/reveal、4A.4.3 selection/restart/closure E2E 四批。

交付：

- Desktop Local v1alpha2 additive feature + safe Projection/API；
- dedicated Preload sensitive sidecar，只暴露冻结的个人模型操作；
- Main/Preload strict input/output validation；
- 权限收回、Keychain locked、Core restart、Desktop restart、并发 edit/delete/reveal、执行中 Task 删除阻断；
- 企业为空 + 个人显式选择、机器人约束、默认恢复、Task lock E2E；
- 真实 macOS Keychain E2E、真实受控 loopback Provider、资源归零和泄漏扫描；
- 给后续 DFE 真实集成批次的接口交接文档。

禁止：修改 Renderer 页面、删除 DFE Mock/GATED、启动 DFE-6。

## 7. Error 与 Receipt

至少冻结以下 typed error family：

```text
personal_model.invalid_request
personal_model.permission_denied
personal_model.owner_mismatch
personal_model.not_found
personal_model.revision_conflict
personal_model.in_use
personal_model.explicit_selection_required
personal_model.provider_profile_unsupported
personal_model.endpoint_rejected
personal_model.credential_input_required
personal_model.credential_not_found
personal_model.credential_store_unavailable
personal_model.credential_access_denied
personal_model.credential_corrupted
personal_model.credential_operation_uncertain
personal_model.reveal_unavailable
personal_model.reveal_rate_limited
personal_model.authentication_failed
personal_model.network_failed
personal_model.protocol_incompatible
personal_model.model_not_found
personal_model.invocation_resume_unavailable
personal_model.operation_conflict
```

错误只返回安全摘要和 retryable/next-action；不返回 Endpoint query、Provider body、Credential Reference、
Keychain item、Secret、stack 或任务正文。

## 8. 安全不变量

1. Secret 不进入普通 HTTP/SSE、URL、argv、env、SQLite、日志、Trace、埋点、错误或 Evidence；
2. Renderer 不获得 credentialRef、Keychain item id、Runtime Handle 或内部 owner digest；
3. Main 不成为通用 Secret 服务，只接受固定 personal model command；
4. Core 每次 store/replace/reveal/delete 前重新校验 owner、entitlement、revision 和 command digest；
5. Credential 不可用只收窄个人模型，不触发企业/个人互相回退；
6. Endpoint/Provider 原始响应不进入用户错误；
7. Task 锁定事实不因模型编辑、删除、权限变化或列表刷新而改写；
8. 执行中 Task 阻断删除以提交时 Core 事实为准；
9. 所有 mutation 先有 durable intent，再发生外部 Keychain 副作用；
10. Secret 解析生命周期不跨 Provider 调用，调用结束、取消或异常后释放引用；
11. 测试只使用随机 canary/fake Key，正式 QA 不使用用户真实 Key；
12. Kernel reducer、Central、Enterprise Credential Store 和 DFI-2B 保持不变。

## 9. QA 验收矩阵

### 9.1 Contract/Domain/Persistence

1. strict schema 拒绝未知字段、非法 Provider、非法状态和超长字段；
2. model id、provider model id、display name 三事实不混写；
3. revision/digest 重算与 tamper fail-closed；
4. status transition table 全覆盖；
5. display-name-only update 不重置状态；关键字段变化重置 `unverified`；
6. migration 23/24 fresh、upgrade、close-reopen；migration 1～22 byte/digest 不变；
7. InMemory/SQLite 同一 Conformance；
8. command idempotent replay 与不同 digest conflict；
9. user preference 与 effective model 分离；
10. personal/enterprise source 与 Credential authority 分离。

### 9.2 Credential/IPC

11. Secret 不进入 public Contract/HTTP/SSE；
12. Electron IPC 与 child IPC 都 strict 且固定 channel；
13. argv/env/temp file/stdio diagnostic 零泄漏；
14. Keychain store/replace/resolve/delete 正负矩阵；
15. not_found/unavailable/access_denied/corrupted typed mapping；
16. Core restart 后 journal recovery；
17. C1～C4、U1～U3、D1～D3 全命名窗口；
18. Addendum 接受后 V1/V2 owner-only reveal；
19. reveal hide/unmount/navigation 清理；
20. concurrent/replayed reveal 不广播、不缓存；
21. rate limit、deadline、cancel、late response 收口；
22. Keychain 5 轮启停资源归零。

### 9.3 Provider/Runtime

23. DeepSeek/Zhipu/Kimi preset profile revision 锁定；
24. custom Endpoint https/no-userinfo/no-query/no-fragment；
25. private/link-local/metadata/DNS rebinding/redirect 拒绝；
26. OpenAI-compatible streaming started/delta/usage/terminal conformance；
27. blank delta、invalid JSON、oversize、unsupported event fail-closed；
28. authentication/network/protocol/model-not-found 状态映射；
29. network_failed 可再次选择，真实成功后收敛 available；
30. cancel/deadline/late terminal 单终态；
31. I1～I5 status-first recovery；
32. output started unrecoverable 不伪造 Assistant Message；
33. local_personal Usage 幂等、winner/superseded、Projection-before-cursor；
34. personal model exact revision 在重启后重建；
35. 缺失 revision/credential/profile/digest 失败关闭；
36. compaction 与 main invocation 使用同一 locked model revision；
37. Provider cache 不被误报为启用或命中。

### 9.4 Selection/Delete/Desktop E2E

38. user preference 优先与企业 first fallback；
39. 企业为空 + 个人可用返回 explicit selection required；
40. 机器人临时 effective model 不覆盖 preference；
41. Task 首次提交后模型锁定；
42. 执行中 Task 删除阻断，终态任务不阻断；
43. 删除默认个人模型后复用统一选择规则；
44. 权限收回后禁用使用/编辑/reveal，但允许 owner 删除；
45. Desktop/Core restart 后列表、偏好、状态、锁定一致；
46. safe Projection 不含 Endpoint 敏感部分、credentialRef、owner digest；
47. v1alpha1 零漂移，v1alpha2 feature negotiation 正确；
48. Main/Preload/Core E2E 不改 Renderer；
49. 四通道五类 marker 的 raw/base64/url-encoded 扫描为 0；
50. connection/timer/subscription/request/child/keychain handle 资源归零；
51. Workspace 全量、Central online、Central offline 严格串行全绿；
52. 无 DFI-2B/DFI-3/Knowledge/Memory/DFE-6 超前实现。

## 10. 验证命令

每批最终命令以该批详细计划为准，最低：

```bash
source ~/.nvm/nvm.sh
nvm use 24.13.0
cd /Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace
pnpm run clean
pnpm run build
CI=true pnpm exec vitest run <DFI-4A focused suites>
CI=true pnpm run check
pnpm run check:central
pnpm run check:central:offline
```

正式 Harness、Workspace、Central online/offline 严格串行；敏感通道 QA 必须在真实 macOS Keychain、
真实 Electron Main/Core child process 和受控 loopback Provider 上执行，不以 Fake 或静态扫描替代。

## 11. 工作量

| 批次 | 集中工程工作日 |
| --- | ---: |
| DFI-4A.0 架构/Keychain/transport preflight | 2～4 |
| DFI-4A.1 Domain/Contract/Persistence | 9～14 |
| DFI-4A.2 Credential Broker/CRUD/reveal | 13～21 |
| DFI-4A.3 Provider Runtime/Usage/Selection | 17～28 |
| DFI-4A.4 Identity blocker remediation | 17～28 |
| DFI-4A.4 Transport blocker remediation（仅路线 A） | 15～25 |
| DFI-4A.4.1～4A.4.3 remainder | 两项 Unblock Audit 后重新估算 |
| 合计 | **不再冻结；旧 62～101 已失效** |

这是集中工程工作量，不是日历承诺；不含独立 QA、文档等待、Windows Adapter、真实企业权限平台接入和
重大 P0/P1 返工。DFI-4A.3 根据当前代码事实从 8～13 上调到 17～28 日，新增工作来自 secure HTTPS/SSE、
migration 24 durable invocation/Usage、标准 Task lock materialization、统一选模、统一异步 resolver、
durable personal wrapper 与进程级恢复闭环。DFI-4A.4 曾根据生产组合根核查从 5～8 上调到 21～34 日；
4A.4.0 现已证明该估算仍不足，因为 identity composition 需要 Enterprise Integration production
foundation，sensitive transport 也需要重新选型。故旧总计 62～101 失效；当前只记录两个 blocker 方案的
独立估算，不能机械相加，剩余 4A.4.1～4A.4.3 待 Unblock Audit 后重新估算。

## 12. Revision 1 差异复核问题

请评审者重点确认：

1. `personal_model.configure` 作为首期唯一 entitlement，且只能来自 Runtime Active 的企业身份与配置事实，
   是否已经冻结清楚；
2. owner scope 绑定 enterprise + user + device 而不绑定 client instance，且不接受 Renderer 自报，是否正确；
3. 直接复用 CGF-1.3 离线状态 2/3、Central 不可达本身不构成权限失效、状态 3 只保留同 owner 删除权，
   是否与既有基线一致；
4. “所有者允许查看个人 Key”作为既有产品决策，ADR-013 Addendum 只冻结安全实现边界，是否表达准确；
5. Core child Keychain Adapter 优先、失败后回文档评审是否正确；
6. custom Endpoint SSRF/DNS rebinding 护栏是否足够；
7. migration 23/24 与两阶段 operation journal 是否最小且完整；
8. PersonalModelRuntimeRegistry 与企业 Registry 分离是否避免 generation 漂移；
9. DFI-4A.3 只做 OpenAI-compatible 个人 Provider 是否符合 MVP；
10. local_personal Usage 复用 ARH-3 而 Prompt Cache 默认关闭是否正确；
11. DFI-4A.4 不改 Renderer、真实 UI 另立 DFE 集成批次是否正确；
12. DFI-4A.1 Revision 3.3 的 117 项 QA 是否可执行，以及 DFI-4A.4 旧总工期失效、待两个
    Unblock Audit 后重估的处理是否诚实；
13. 是否存在新的 P0/P1、公共 Contract 冲突或需要用户重新决策的范围变化。

## 13. 门禁状态

```text
DFE-5B.1        PASS/CLOSED
DFI-2A          PASS/CLOSED

DFI-4A Plan     CONFIRMED
DFI-4A.0        REPAIR.1 USER ACCEPTED / PASS/CLOSED
DFI-4A.1        PASS/CLOSED
DFI-4A.2 Plan   REVIEW PASS / CONFIRMED
DFI-4A.2.1      PASS/CLOSED
DFI-4A.2.2      PASS/CLOSED
DFI-4A.2.3      PASS/CLOSED
DFI-4A.2        PASS/CLOSED
DFI-4A.3 Plan   PASS/CLOSED
DFI-4A.3.1      PASS/CLOSED
DFI-4A.3.1 repair.2 PASS/CLOSED
DFI-4A.3.2      PASS/CLOSED
DFI-4A.3.3      PASS/CLOSED
DFI-4A.3        PASS/CLOSED
DFI-4A.4 Plan   PASS/CLOSED
DFI-4A.4.0      PASS/CLOSED
Identity Repair PLAN PASS/CLOSED
EIPC-0             PASS/CLOSED
EIPC-1 Plan        PASS/CLOSED
EIPC-1.0           PASS/CLOSED
EIPC-1.1 Plan      PASS/CLOSED
EIPC-1.1.1        PASS/CLOSED
EIPC-1.1.2        PASS/CLOSED
EIPC-1.1.3 Plan   PASS/CLOSED
EIPC-1.1.3.1      PASS/CLOSED
EIPC-1.1.3.2      IMPLEMENTED / INDEPENDENT QA PENDING
EIPC-1.1.3.3      GATED
EIPC-1.2～EIPC-1.3 GATED
EIPC-2～EIPC-3     GATED
Transport Rev 1   PLAN PASS/CLOSED
STRM-0             PASS/CLOSED
STRM-1             PASS/CLOSED
STRM-2 Plan        PASS/CLOSED
STRM-2.1～2.3      PASS/CLOSED
STRM-3             GATED
DFI-4A.4.1      GATED
DFI-4A.4.2      GATED
DFI-4A.4.3      GATED

DFE-5B.2        USER ACCEPTED / PASS/CLOSED
DFE-6           PASS/CLOSED
DFI-2B          GATED
DFI-3           GATED
TGM-0           DETAILED PLAN FILE REQUIRED BEFORE REVIEW
TGM-1+          GATED
```

用户已接受 Revision 1，并授权 DFI-4A.0 repair.1；本批开发者门禁、Claude Code 独立 QA、
Central online/offline 补跑与用户接受已完成，DFI-4A.0 正式 `PASS/CLOSED`。DFI-4A.1 Revision 3.3
已完成范围内实现、独立 QA 与用户接受，正式 `PASS/CLOSED`；DFI-4A.2 计划已确认，DFI-4A.2.1
也已完成独立 QA 和用户接受，正式 `PASS/CLOSED`。DFI-4A.2.2 也已完成独立 QA、用户接受并正式
`PASS/CLOSED`；ADR-013 Addendum A 已 `ACCEPTED`；DFI-4A.2.3 已完成独立 QA 并由用户接受，
DFI-4A.2 阶段整体正式 `PASS/CLOSED`。

DFI-4A.2.3 详细方案见
[`Owner Reveal 与 Closure 详细方案`](./DFI-4A.2.3-OWNER-REVEAL-CLOSURE-DEVELOPMENT-PLAN.md)，
当前已正式关闭。DFI-4A.3 总体计划已经完成评审和用户接受，DFI-4A.3.1 已完成独立 QA 并由用户
正式接受关闭。DFI-4A.3 详细方案见
[`个人 Provider Runtime、Usage 与 Task 精确锁定详细方案`](./DFI-4A.3-PERSONAL-PROVIDER-RUNTIME-DEVELOPMENT-PLAN.md)，
DFI-4A.3.2 与 DFI-4A.3.3 均已完成范围内实现、独立 QA 与用户接受，DFI-4A.3 阶段整体正式关闭。
DFI-4A.4 详细方案已通过评审并由用户接受；DFI-4A.4.0 Preflight 已由用户正式接受为 `PASS/CLOSED`，
正式报告记录 `BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION_AND_ELECTRON_MESSAGEPORT_TRANSFER`。
Enterprise Identity Production Composition 修复方案、Sensitive Renderer↔Main Transport Revision 1 与
Threat Model 已通过复核并由用户接受。EIPC-0 已完成 Contract/authority/session rebind/offline 2/3 与
Conformance 冻结，唯一结论为 `AUTHORITY_SEMANTICS_FROZEN`，独立 QA 与用户接受已完成；它不关闭 identity
composition blocker。STRM-0 已完成路线 A Decision Spike，输出 `ROUTE_A_ACCEPTABLE`，但不关闭 transport
blocker、不宣称 production ready。STRM-1 与 STRM-2 后续均已完成范围内实现、独立 QA 和用户接受并正式
关闭；transport blocker 继续保持打开。EIPC-1 总体计划已通过评审并关闭，EIPC-1.0 已完成 docs + Spike、
独立 QA 和用户接受，正式 `PASS/CLOSED`；当前唯一结论仍为
`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`。EIPC-1.1 计划评审与 EIPC-1.1.1 已关闭，
EIPC-1.1.2 只进入详细文档评审；STRM-3、EIPC-1.1.2～1.1.3、EIPC-1.2～1.3、EIPC-2～3 与
4A.4.1～4A.4.3 仍不得自动进入编码。
