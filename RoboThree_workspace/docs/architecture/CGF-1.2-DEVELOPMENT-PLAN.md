# RoboThree CGF-1.2 Local Core 企业配置物化开发计划

> 状态：**CLOSED**  
> 日期：2026-07-25  
> 适用批次：`CGF-1.2`  
> 前置状态：CGF-1.1A～1.1D 独立 QA `PASS`，CGF-1.1 `CLOSED`  
> 语义基线：Enterprise Gateway Contract `v1alpha1`、ADR-008、ADR-009、ADR-014  
> 阶段结论：§14 十项冻结及 P1/P2/P3 修订已落位；CGF-1.2A～1.2C 独立 QA
> 均已由用户接受并正式 `PASS/CLOSED`；CGF-1.2 阶段正式关闭。
> CGF-1.3 继续 `GATED`，等待方案确认和明确授权

## 1. 阶段目标

CGF-1.2 负责把 Central 已发布、当前企业会话有权读取的完整配置，安全地变成
Local Core 可持久读取的最近成功配置：

```text
valid enterprise session
→ compatibility
→ immutable Configuration Snapshot
→ exact Agent/Skill Package documents
→ bounded validation and materialization
→ sealed local candidate
→ atomic Configuration Storage Activation
→ preserve previous active configuration
→ derived activationState=pending_restart
```

本阶段结束时，Local Core 已经拥有完整且可恢复的
`MaterializedEnterpriseConfiguration`，但当前进程的 `RegistrySnapshot` 仍不
改变。受控重启、Registry 构建和新 Task 使用新配置属于 CGF-1.3。

## 2. 当前代码事实

CGF-1.1 已经提供：

- 受保护的 `GET /v1alpha1/configuration`；
- Snapshot 的稳定 ETag、canonical digest 和引用完整性校验；
- PostgreSQL 中不可变 Snapshot/Package Repository；
- `configuration.read` 权限；
- 四因素短期 Access Token；
- Java 在线、离线和真实 PostgreSQL 恢复矩阵。

CGF-1.2 开始前仍有两个真实缺口：

1. canonical OpenAPI 尚无 Package Download HTTP 语义；
2. Local Core 尚无 Enterprise Configuration Client、运行时严格解析器、候选存储、
   物化和 Storage Activation 实现。

因此不能跳过 Contract 检查点直接写 Local Core 客户端。

## 3. 固定责任边界

### 3.1 Central Service

负责：

- 在有效 Access Token 和 `configuration.read` 权限下返回完整 Snapshot；
- 按 Snapshot 中的 exact package reference 返回不可变 PackageDocument；
- 验证请求 Package 属于调用者被授权的 Snapshot 闭包；
- 返回稳定 ETag、typed error 和有界响应；
- 保留已发布 revision，使下载期间配置更新不会导致“latest”漂移。

不负责：

- Local candidate persistence；
- Storage Activation；
- Local Registry 构建；
- Agent Loop、Task 或 Workspace；
- 把企业凭证、credentialRef 或 Runtime Handle 下发客户端。

### 3.2 Local Core Application

新增或落实以下类型化边界：

```text
EnterpriseConfigurationClient
ConfigurationValidator
PackageMaterializer
EnterpriseConfigurationPersistence
ConfigurationActivationCoordinator
```

职责：

- 使用受控企业会话访问 Central；
- 逐份、有界地下载和校验 Snapshot/Package；
- 验证 exact ID/kind/revision/digest 和完整引用闭包；
- 形成密封 candidate；
- 串行、幂等地完成 Storage Activation；
- 暴露最近成功配置和派生的 `EnterpriseConfigurationActivationStatus`。

这些组件位于 Application/Port/Adapter 边界，不进入 Kernel reducer。

### 3.3 Adapter

首批 Adapter：

- HTTPS/JSON Enterprise Gateway Client；
- InMemory Enterprise Configuration Persistence；
- SQLite Enterprise Configuration Persistence；
- Fake Gateway Client 和故障注入 Adapter。

生产 HTTP Adapter：

- 非 test profile 只接受 HTTPS；
- 只使用受信 bootstrap/session 提供的 Central origin；
- Package 下载不接受任意绝对 URL 或跨 origin redirect；
- Access Token 只进入 Authorization Header，不进入 URL、日志、SQLite 或错误详情；
- 同时限制声明的 Content-Length 和实际读取字节；
- 支持 timeout、AbortSignal 和 typed transport error。

### 3.4 Access Token Provider 决策

Local Core 新建语义化 Application Port：

```text
EnterpriseAccessTokenProvider
```

它不是新的身份体系，而是复用 ADR-014 已冻结的：

```text
EnterpriseUserIdentityClient
+ EnterpriseCredentialStore
+ EnterpriseDeviceSigner
→ Central RoboThreeAccessTokenIssuer
```

在 Local Core 一侧形成短生命周期 Token lease。Central
`RoboThreeAccessTokenIssuer` 不能被“复用”为本地 Port；它仍只存在于 Central。

`EnterpriseConfigurationClient`：

- 每次 HTTP 请求前向 Provider 获取或确认有效 lease；
- 不长期保存、不刷新、不持久化 Access Token；
- 只把 lease 中的 compact token 瞬时交给 HTTP Adapter 的 Authorization Header；
- 不把 Token、Claims 全文或 Provider handle 写入 candidate、日志或错误。

Provider 至少接受 audience、required permission、minimum remaining TTL 和
expected identity scope，并返回瞬时 Token lease 及可信 scope/expiry 摘要。具体
字段名在 1.2A 实现评审时确定，不进入 Enterprise Gateway Wire Contract。

一次 Snapshot + N Package 同步期间：

1. 每个请求前验证 lease；
2. 只有 Central 明确返回 `token_expired`/对应 401 时，暂停新请求；
3. 允许一次有界重新签发，Alpha 默认最多一次；
4. 新 Token 必须保持 enterprise/user/device/client 四因素一致，仍具有
   `configuration.read`；
5. 恢复后继续原 Snapshot 和 exact Package refs，不重新选择 latest；
6. seal 和 Storage Activation 前再次确认有效且同 scope 的企业会话。

刷新失败、账号/设备禁用、权限撤销、scope 漂移或明确 authorization denied 时
立即失败关闭。已验证 Package 只能保留在 unsealed candidate 中，active pointer
不变。

## 4. Contract 最小增量

### 4.1 新增 Package 精确读取语义

Enterprise Gateway `v1alpha1` 增加一个向后兼容的 Package read operation。具体 URL
和参数在 CGF-1.2A canonical OpenAPI 变更中冻结，但语义必须满足：

- 只读取 `packageId + kind + revision + digest` 明确指定的不可变 Package；
- 请求绑定已下载 Snapshot 的 ID/revision，不能使用“latest package”；
- Central 验证该引用属于调用者被授权的 Snapshot；
- 复用 `configuration.read`，不新增权限系统；
- 响应使用现有 `package-document.schema.json`；
- ETag 由 package digest 稳定派生；
- ID 存在但 kind/revision/digest 不匹配时失败关闭；
- 不提供 Package 列表、搜索、上传、更新或删除 API。

### 4.2 保持不变

不修改：

- Configuration Snapshot 与 PackageDocument 的字段主体；
- canonical JSON 和 SHA-256 规则；
- Snapshot、Package、文件和总物化安全上限；
- Agent/Skill Package 的 immutable 语义；
- Token Claims、Device Challenge/Proof 和 ADR-014；
- Model/Tool/Knowledge Descriptor；
- credentialRef 禁入；
- Storage/Runtime Activation 两层边界。

### 4.3 TypeScript consumer

`packages/contracts` 可以增加严格的 TypeScript/Zod consumer schema，但根级
`contracts/enterprise-gateway/v1alpha1/` 继续是唯一 canonical source。

TypeScript consumer 必须和 Java consumer 运行相同 valid/invalid Fixture；
不得形成第二套可独立演进的 Contract。

## 5. MaterializedEnterpriseConfiguration

### 5.1 内容

```text
identity scope
  enterpriseId
  userId
  deviceId
  clientInstanceId

compatibility
  selected contract/schema version
  Desktop/Core compatibility facts

configuration
  exact Snapshot JSON
  snapshotId/revision/digest/ETag
  Model/Tool/Knowledge Descriptors
  fixed permissions

packages
  exact Agent Packages
  exact Skill Packages
  package/file revisions and digests

local activation facts
  candidateKey
  materializationDigest
  storageActivatedAt
```

Access Token、OA material、设备私钥、Keychain Handle、企业 credentialRef 和
Runtime Handle 不属于该对象。

`MaterializedEnterpriseConfiguration` 是不可变密封内容，不保存可漂移的
`pendingRuntimeActivation` 布尔值。

### 5.2 身份隔离

候选和 active pointer 必须绑定：

```text
enterpriseId
∩ userId
∩ deviceId
∩ clientInstanceId
```

任何 scope 不匹配都失败关闭。Alpha 不跨用户共享已物化 Package，以避免固定权限
或企业上下文交叉污染；未来若做内容寻址去重，必须另行证明隔离和引用计数正确性。

### 5.3 Package materialization 不等于解压到文件系统

第一版继续使用 strict JSON `PackageDocument`：

- 不写入 Workspace；
- 不展开 ZIP/TAR；
- 不创建 symlink；
- 不执行 Package 内文本；
- 不把 Skill 动作直接当作本地代码执行；
- 由后续 Agent/Skill Runtime 从已验证、版本锁定的 Package 内容读取。

### 5.4 EnterpriseConfigurationActivationStatus

Local Core 配置领域单独维护持久事实：

```text
storageActiveRevision / digest
runtimeActiveRevision / digest?       # CGF-1.3 写入
lastSuccessfulSyncAt?
lastErrorCode?
updatedAt
```

Application 层通过一个纯投影函数计算：

```text
没有 storage active
→ uninitialized

storage active == runtime active
→ current

storage active != runtime active，且没有针对该代的 activation failure
→ pending_restart

CGF-1.3 记录该代 Runtime Activation 失败
→ activation_failed
```

CGF-1.2 只产生 `uninitialized/current/pending_restart`；
`activation_failed` 由 CGF-1.3 消费和产生。

现有 `pendingRuntimeActivation` 只能按以下规则派生：

```text
pendingRuntimeActivation = activationState == "pending_restart"
```

它不拥有独立 SQLite 列、独立写命令或第二套事实源。

### 5.5 Desktop 状态 Projection 占位 Contract

Local Core Application 暴露：

```text
EnterpriseConfigurationStatusProjection
  syncState: idle | syncing | failed
  activationState:
    uninitialized | current | pending_restart | activation_failed
  storageActiveRevision?
  runtimeActiveRevision?
  lastSuccessfulSyncAt?
  lastErrorCode?
```

实现方式：

- activation 部分由 `EnterpriseConfigurationPersistence` 的 pointer/failure facts
  通过纯函数派生；
- `syncing` 来自当前 `ConfigurationActivationCoordinator` 的有界 in-flight
  状态；
- 最近同步失败 code 以安全摘要持久化，Core 重启后不会把中断同步误报为成功；
- Projection assembler 只读，不反向修改持久状态。

Storage Activation 成功和终态同步失败在配置 SQLite 的同领域事务中追加
`enterprise_configuration.status_changed` 事实。事件只携带状态、revision 和
安全错误 code，不携带 Snapshot/Package 正文、身份明文、Token、OA material
或本地路径。

现有 Desktop Local `v1alpha1` strict union 不静默加字段或事件。采用明确的
`Desktop Local Runtime Contract v1alpha2` 和
`enterprise_configuration_status` compatibility feature；`v1alpha1` 的
`pendingRuntimeActivation` 在兼容 Adapter 中继续由 activationState 派生。
CGF-1.2 不实现 Desktop UI。

## 6. 校验顺序与资源边界

固定顺序：

```text
compatibility
→ bounded Snapshot bytes
→ strict Snapshot schema
→ canonical Snapshot digest
→ identity/session scope
→ collect and deduplicate exact Package refs
→ per-Package bounded download
→ strict Package schema/path/media type
→ per-file UTF-8 byte limit and content digest
→ Package canonical digest
→ exact ref match
→ full reference closure
→ total materialized bytes
→ candidate seal
```

Alpha 继续执行：

```text
Snapshot ≤ 2 MiB
PackageDocument ≤ 4 MiB
单文件 utf8Content ≤ 512 KiB
单 Package files ≤ 256
relativePath ≤ 512 UTF-8 bytes
Agent Package refs ≤ 128
Skill Package refs ≤ 256
单次完整物化 ≤ 64 MiB
```

实现必须逐 Package 处理；不得为了方便一次性在内存复制完整 64 MiB 配置多份。
Package 数量按 accepted canonical Schema 的 Agent/Skill 两个数组分别限制，最终
仍受 64 MiB 总物化上限约束。revision 和 digest 分别校验，不假定二者天然相同。

## 7. 本地持久化与原子激活

### 7.1 语义化 Port

`EnterpriseConfigurationPersistence` 只暴露配置领域语义，不建设万能 CRUD：

```text
loadActive(scope)
loadPrevious(scope)
beginOrResumeCandidate(candidateIdentity)
storeValidatedPackage(candidateKey, package)
sealCandidate(candidateKey, closureFacts)
activateSealedCandidate(candidateKey, expectedActiveRevision)
discardUnsealedCandidate(candidateKey)
```

具体方法名可在实现评审时调整，但必须保留：

- candidate、sealed、active 的显式边界；
- scope 绑定；
- compare-and-swap 或等价单写者保护；
- 同输入幂等、同 revision 不同 digest 冲突；
- InMemory/SQLite 相同 Conformance。

### 7.2 两阶段本地事务

不使用一个长事务包住全部网络下载。

```text
阶段一：Stage / Seal
  逐份验证并持久化 immutable candidate 内容
  → 验证完整闭包
  → 写 materializationDigest
  → candidate sealed

阶段二：Activate
  读取 sealed candidate
  → 再校验 scope、revision、digest、完整闭包
  → 单事务更新 active pointer
  → 记录 previous active
  → 派生 activationState=pending_restart
```

网络调用不进入 SQLite transaction。崩溃发生在 active pointer 更新前时，旧 active
保持不变；更新提交后即使响应丢失，重试也只能观察到新 active 或得到相同结果。

### 7.3 并发和幂等

- 同一 identity scope 的同步由 `ConfigurationActivationCoordinator` 串行化；
- 相同 scope + snapshotId + revision + digest 形成稳定 candidate identity；
- 相同 candidate 重试复用已验证内容；
- 同 revision 不同 digest 返回 typed conflict；
- activation 使用 expected active revision 防止迟到 candidate 覆盖较新 active；
- 不同 identity scope 不能读取、复用或激活彼此 candidate。

### 7.4 保留策略

CGF-1.2 至少保留 active 和 previous active。首批不实现自动破坏性 GC；其他已密封
generation 在未来 GC 能证明不被非终态 Task 或恢复流程引用前不得删除。

CGF-1.2 增加只读诊断：

- sealed generation 数量；
- 总占用字节；
- oldest sealed generation age；
- active/previous generation；
- unsealed candidate 数量。

超过内部警戒线只报告，不自动删除。CGF-1.3 定义 Task/Lock/Recovery 的 GC
阻止引用；自动 GC 留到 CGF-1.4 或后续维护批次。

### 7.5 Local SQLite 文件与 migration 命名空间

最终选择：**独立 SQLite 文件**。

```text
Local Core task/session database
  现有 Task、Session、Conversation、Compaction migrations

enterprise-configuration.sqlite
  MaterializedEnterpriseConfiguration
  candidate / sealed generation
  active / previous pointer
  activation facts
  configuration status events
```

原因：

- 单次配置可达 64 MiB，不与 Task/Session 高频事务竞争；
- 配置同步的 stage/seal 生命周期和 Task 事务不同；
- 独立损坏域、备份和 schema preflight；
- CGF-1.3 只通过 Port 读取，不需要跨库事务；
- Task 已锁定 revision/digest，不依赖配置库和 Task 库的原子联合提交。

约束：

- 使用独立连接生命周期；
- 使用 `enterprise_configuration_schema_migrations` 或等价独立 registry；
- migration 名称采用 `enterprise-config-V1` 序列；
- 不复用现有 Local Task/Session 数字序列，也不复用 Central Flyway V1～V5；
- 独立 schema preflight；
- 不使用 SQLite `ATTACH` 建立跨库隐式事务。

### 7.6 Application 与 Kernel 边界

以下类型只属于 Local Core Application/Port/Adapter：

```text
EnterpriseConfigurationClient
EnterpriseAccessTokenProvider
ConfigurationValidator
PackageMaterializer
EnterpriseConfigurationPersistence
ConfigurationActivationCoordinator
EnterpriseConfigurationActivationStatus
```

Kernel reducer 禁止导入 Candidate、Materialized Configuration、Storage
Activation、Activation Status、Package Download、HTTP/ETag 或配置 SQLite 类型。
1.2B 必须增加自动化架构边界测试。

## 8. ETag、离线和恢复语义

### 8.1 ETag 304

收到 Snapshot `304 Not Modified` 时：

- 本地 active 完整、scope 一致且全部 digest 可复核：返回 no-op；
- 本地 active 缺失、未密封或校验失败：304 不能作为修复证据；
- Client 必须进行一次不带 `If-None-Match` 的完整重取；
- 完整重取仍失败时保留旧 active，并返回 typed sync failure。

Package 可以使用独立 ETag，但本地仍必须校验响应正文 digest；ETag 不能替代内容
校验。

### 8.2 Central 不可用

CGF-1.2 的“offline”只保证：

- 最近成功配置完整保留、可读取和可诊断；
- 不创建半 candidate；
- 不重新同步；
- 不执行新的 Storage Activation；
- 不删除历史 Task/Audit。

依据后接受的 ADR-014，没有有效企业会话时，本阶段不让企业 Agent/Skill 进入
Runtime Registry 或 Prompt，也不允许企业 Model/Central Tool 调用。Runtime
可用性和产品提示在 CGF-1.3/DCF 后续批次完成。

这与 MVP 功能基线中“本机实际可运行的缓存企业能力可继续使用”的旧表述存在文档
一致性差异；CGF-1.2 按 ADR-014 的更新安全决策执行，后续应单独修订产品文档，
不在本批暗中放宽企业会话门槛。

## 9. 开发批次

### CGF-1.2A — Package Read Contract 与跨语言 Conformance

建议版本：`0.0.0-cgf.1.2a`

交付：

- canonical OpenAPI 增加 exact Package read；
- EnterpriseAccessTokenProvider 与多请求 Token 生命周期 Contract；
- EnterpriseConfigurationActivationStatus；
- Desktop Local Runtime `v1alpha2` 配置状态 Projection/Event Contract；
- 复用现有 PackageDocument Schema；
- valid/invalid Fixture 增补；
- TypeScript/Java 同 corpus Conformance；
- Central Package Read Application Service/Controller；
- Access Token、`configuration.read`、Snapshot reference membership、ETag 和
  no-store 门禁；
- Package 无列表、latest、写入和删除 API 的架构检查。

退出门槛：

- additive Contract 评审无 P0/P1；
- TS/Java Conformance 和 Central 在线/离线测试通过；
- 非法 scope/ref/kind/revision/digest、越权和敏感信息测试通过；
- 独立 QA `PASS` 后进入 1.2B。

### CGF-1.2B — Local Core Validator、Persistence 与 Storage Activation

建议版本：`0.0.0-cgf.1.2b`

交付：

- TypeScript strict consumer schema；
- ConfigurationValidator / PackageMaterializer；
- EnterpriseConfigurationPersistence Port；
- InMemory 与 SQLite Adapter；
- SQLite forward-only migration 和 schema preflight；
- candidate stage/seal、active/previous pointer、由 pointer/failure facts 派生的
  Activation Status（不保存独立 pending flag）；
- 单写者、CAS、幂等和 typed error；
- 同一 Conformance 覆盖 InMemory/SQLite。

退出门槛：

- Schema/digest/path/limit/scope/reference 全部失败关闭；
- 网络调用不在数据库事务中；
- 任意下载或 stage 失败不改变 active pointer；
- activation 后响应丢失可幂等恢复；
- close/reopen 和较新/缺损 schema 失败关闭；
- 独立 QA `PASS` 后进入 1.2C。

### CGF-1.2C — Java ↔ Node E2E、离线与崩溃矩阵

建议版本：`0.0.0-cgf.1.2c`

交付：

- EnterpriseConfigurationClient 正式 HTTP Adapter；
- 使用 CGF-1.1 test profile 的真实 Token 链，不在生产路径伪造身份；
- Java Central 随机 loopback 端口 ↔ Node Local Core ↔ SQLite E2E；
- timeout、cancel、bounded response、同 origin 和 redirect 安全；
- ETag、304 repair、Central offline；
- 串行与 bounded concurrency 基准、取消和内存上限；
- 命名崩溃点、并发同步和敏感明文扫描；
- CGF-1.2 完整 Harness 和独立 QA。

退出门槛：

- 只能恢复为完整旧 active 或完整新 active，绝不半激活；
- Central 配置更新期间仍按 exact Snapshot/Package revision 收敛；
- Access Token、OA material、设备签名和 credentialRef 不进入 SQLite/日志/Fixture；
- Node、Central online/offline、Docker PostgreSQL 与 SQLite Harness 全部通过；
- 独立 QA 无 P0/P1；
- CGF-1.2 关闭，CGF-1.3 继续等待方案确认和用户授权。

## 10. CGF-1.2 崩溃与故障矩阵

至少覆盖：

1. Snapshot body 截断；
2. Snapshot 已验证、首个 Package 前崩溃；
3. 部分 Package 已 stage 后崩溃；
4. 全部 Package 写入但 candidate 未 seal；
5. candidate sealed、activation transaction 前崩溃；
6. active pointer 提交后响应丢失；
7. 相同 candidate 重试；
8. 迟到旧 candidate 尝试覆盖新 active；
9. revision 相同但 digest 漂移；
10. ETag 304 且本地完整；
11. ETag 304 但本地缺失或损坏；
12. Central 在 Snapshot 与 Package 下载之间切换 active Snapshot；
13. Package 返回错误 kind/revision/digest；
14. total bytes 在边界相等和超出一字节；
15. 同 scope 并发同步；
16. 不同 scope 数据隔离；
17. SQLite close/reopen；
18. Central offline；
19. timeout/cancel；
20. redirect 到非受信 origin。

## 11. 非目标

本阶段不实现：

- Runtime Registry Activation；
- 受控 Core restart；
- 当前 RegistrySnapshot 热替换；
- 多代 Registry 热并存；
- Agent/Skill Runtime；
- 企业 Model Gateway；
- Central Tool/MCP；
- Desktop 登录 UI 或同步页面；
- 真实 OA、MDM、OS Device Signer；
- Package 上传、发布审核或 Admin 写端；
- 增量配置 patch、push、实时撤销；
- Package 二进制、ZIP/TAR、对象存储；
- 跨用户 Package 去重；
- 自动模型路由、Policy Engine 或复杂 RBAC。

## 12. 上游借鉴

| 来源 | 本批借鉴 | 不照搬 |
| --- | --- | --- |
| OpenClaw | Gateway compatibility、启动期 fail-closed、schema preflight、冻结后运行 | 运行期 Plugin Activation、隐式配置热替换 |
| LangGraph | Persistence Adapter Conformance、checkpoint/recovery、故障注入 | Pregel Runtime、图执行语义 |
| OpenHands | 稳定 identity、持久事实与运行投影分离、Local/Remote 边界 | 上游 Event Store 格式和完整 Agent Server |
| RoboThree KAF-2/KAF-5 | 单写者、原子 commit、命名故障点、恢复 Harness | 把 Task Event/Receipt 生搬到配置领域 |

采用方式为 `DESIGN_ONLY + INTERNAL_REUSE`。不复制第三方源码、SQL、Schema 或
测试；CGF-1.2 完成后新增正式上游借鉴登记项。

## 13. 工程量

```text
CGF-1.2A：1～2 个集中工程工作日
CGF-1.2B：3～4 个集中工程工作日
CGF-1.2C：2～3 个集中工程工作日
合计：6～9 个集中工程工作日
```

定义：

- 一个“集中工程工作日”是一个工程师日，按 8 个正常工作小时计入需求分析、
  设计、编码、开发者自测和文档；它是工作量单位，不代表 Codex 必须连续运行
  8 个墙钟小时；
- `6～9 个集中工程工作日` 等价于约 `48～72 engineer-hours`；
- “日历工作日”是从开始到可交付的实际工作日跨度，包含顺序门槛、独立 QA、
  评审和常规返工，不包含周末、法定假期或公司外部审批等待；
- 单一主开发流建议 PM 按 `8～12 个日历工作日` 管理。AI 辅助可能缩短实际
  编码时间，但不能压缩必须顺序完成的独立 QA 门槛。

旧 CGF-1 总计划中的 4～5 天低估了尚未存在的 Package HTTP Contract、Local
runtime strict consumer、SQLite 双阶段物化和真实 Java↔Node E2E。本估算不包含
独立 QA、评审等待、返工和公司环境审批，不是日历交付承诺。

## 14. 已接受的冻结项

用户已于 2026-07-25 明确接受：

1. CGF-1.2 只完成 Storage Activation，Runtime Activation 留在 CGF-1.3；
2. 增加最小 exact Package read Contract，复用 `configuration.read`；
3. Package read 必须绑定已下载 Snapshot 和 exact ref，不提供 latest/list；
4. Local candidate 按 enterprise/user/device/client 四因素隔离；
5. 使用 stage/seal + atomic active pointer 的两阶段本地持久化；
6. Package 保持 strict JSON，不解压到文件系统、不执行包内内容；
7. 304 只在本地完整可验证时 no-op，否则强制一次完整重取；
8. 无有效企业会话时按 ADR-014 不把缓存企业 Agent/Skill 放入 Runtime/Prompt；
9. 首批不做自动 GC，不删除可能被恢复链引用的已密封 generation；
10. CGF-1.2 拆为 1.2A/1.2B/1.2C，每批独立 QA 后再解锁下一批。

上述十项及本轮 P1/P2/P3 指定修订已经落位。用户已接受 CGF-1.2A～1.2C
全部独立 QA，三批均正式 `PASS/CLOSED`，CGF-1.2 阶段状态为 `CLOSED`。
`0.0.0-cgf.1.2c-repair.1` 维护批也已通过独立 QA 并由用户关闭，不改变本阶段
产品语义。CGF-1.3 继续保持 `GATED`，等待方案确认和明确授权。

## 15. 并发配置与 PM 风险矩阵

### 15.1 并发配置位置

`packageDownloadConcurrency` 位于 Local Core Application 的
`EnterpriseConfigurationSyncOptions`，由 Core bootstrap 构建并在单次 Core
生命周期内冻结：

- 不进入 Enterprise Gateway Contract；
- 不进入 Configuration Snapshot；
- 不由 Desktop 命令或 Renderer 修改；
- 不作为 Task/Session 状态持久化；
- 单元测试和性能 Harness 可以显式注入。

1.2A/1.2B 正确性路径默认串行（`1`）。1.2C 对 `1` 与 `4` 做基准；只有当取消、
内存、顺序无关 digest 和 Central 负载门槛全部通过时，Alpha 默认值才提升为
`4`。实现禁止无界 `Promise.all`，并设置不可绕过的内部硬上限 `8`。

Token 自动重新签发次数使用独立的 Enterprise Session Provider 配置，Alpha
默认 `1`，不与 Package 下载并发参数混用。

### 15.2 风险矩阵

| 风险 | 等级 | 处理 | 阻塞 |
| --- | --- | --- | --- |
| Token 在 N 次 Package 请求期间过期 | P1 / CLOSED BY DESIGN | Provider lease、单次有界刷新、同 scope 恢复、seal 前复核 | 否 |
| Activation 布尔值与 pointer 漂移 | P1 / CLOSED BY DESIGN | pointer/failure facts 单一事实源，状态和 boolean 纯派生 | 否 |
| v1alpha1 strict Desktop event 不兼容 | P1 / CLOSED BY DESIGN | 新建 Desktop Local v1alpha2 + feature negotiation | 否 |
| 冻结 MVP 离线文案与 ADR-014 不一致 | P2 / OPEN DOC ITEM | 产品修订项须在 CGF-1.3 或 Desktop 展示前关闭 | 不阻塞 1.2A |
| 配置 SQLite 与 Task/Session migration 混淆 | P2 / CLOSED BY DESIGN | 独立文件、连接、migration registry 和 preflight | 否 |
| 6～9 工程日被误解为日历承诺 | P2 / SCHEDULE RISK | PM 使用 8～12 日历工作日窗口 | 否 |
| 并行下载造成内存或顺序漂移 | P3 / TEST GATE | 默认串行，1.2C 以 4 并发做有界基准 | 否 |
| 不做 GC 导致本地增长 | P3 / OBSERVABLE | 只读指标和警戒，1.3 定义引用安全，后续实现 GC | 否 |
