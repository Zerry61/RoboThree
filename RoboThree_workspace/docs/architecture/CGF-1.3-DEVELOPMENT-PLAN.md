# RoboThree CGF-1.3 Runtime Registry Activation 与阶段验收开发计划

> 决策状态：**CONFIRMED_WITH_SPECIFIED_REVISIONS**  
> 编码状态：**CGF-1.3A、CGF-1.3B、CGF-1.3C PASS/CLOSED；CGF-1.3 PASS/CLOSED**  
> 日期：2026-07-27  
> 适用阶段：Central Gateway Foundation 1.3 / Local Core Runtime Activation  
> 建议版本：`0.0.0-cgf.1.3a`、`0.0.0-cgf.1.3b`、`0.0.0-cgf.1.3c`  
> 前置门槛：DCF-1.3、CGF-1.2 与 `0.0.0-cgf.1.2c-repair.1` 已 `PASS/CLOSED`；ADR-008、ADR-009、ADR-011、ADR-014 与企业离线四状态修订已 `ACCEPTED`

## 1. 背景与当前事实

CGF-1.2 已完成：

- Enterprise Gateway exact Snapshot/Package read；
- 四因素 EnterpriseAccessToken session；
- Configuration strict validation 和 Package materialization；
- 独立 `enterprise-configuration.sqlite`；
- candidate stage/seal、Storage Activation CAS 和 active/previous generation；
- `storageActiveRevision`、同步事实和安全状态 Projection；
- Java → Node → SQLite close/reopen 跨语言 E2E。

CGF-1.2 明确没有完成：

- Runtime Registry Activation；
- 受控 Local Core restart；
- `runtimeActiveRevision/digest` 持久事实；
- 新 Task 使用新 RegistrySnapshot；
- 旧 Task generation 引用安全；
- `activation_failed` 恢复矩阵。

DCF-1.3 已完成并通过独立 QA：

- 六态 Desktop/Core lifecycle；
- controlled restart 不消耗异常退出的一次自动恢复额度；
- 每次重启生成新的 token、port 和 `runtimeInstanceId`；
- 旧 Client、SSE、selectionHandle 和 ephemeral 状态失效；
- restart/reconnect/backpressure/resource cleanup 与 30/60 分钟长稳 Harness。

因此 CGF-1.3 只消费已稳定的受控重启边界，不再自行建设第二套进程监督器。

CGF-1.3 负责把已密封并 Storage Activated 的精确 generation 安全转换为启动期
冻结的 Runtime RegistrySnapshot：

```text
sealed storage-active generation
→ 企业会话与 scope/compatibility 复核
→ Registry materialization
→ RegistryBuilder validate/finalize/deep freeze
→ 受控 Local Core restart
→ 精确 generation 安装
→ runtime-active fact
→ 新 Task 使用新 Registry
```

Storage Activation 继续不等于 Runtime Activation。

## 2. 目标

CGF-1.3 完成后，Local Core 应能：

1. 从已密封 active generation 确定性生成 Registry 输入；
2. 使用现有 RegistryBuilder 构建并冻结精确 RegistrySnapshot；
3. 在启动期而非运行期安装企业 Model/Tool Registry 分区；
4. 通过内部类型化 Port 请求和验证受控 Core restart；
5. 在内部 readiness 通过、对外开放前持久提交 runtimeActive facts；
6. 对迟到 attempt、重复启动和崩溃重放保持幂等；
7. 新 Task 使用新 registryRevision，已存在 TaskCapabilityLock 保持不变；
8. 保护 active、previous、runtimeActive、非终态 Task 和
   activation_failed 回退链引用的 generation；
9. 在目标 generation 失败时安全保留旧运行代或失败关闭企业分区；
10. 通过完整在线、离线、重启、双数据库和引用安全 Harness。

## 3. 固定责任边界

### 3.1 Local Core Application / Bootstrap

负责：

- 读取精确 storage-active generation；
- 校验 scope、企业会话、Compatibility 和全部 digest；
- 生成内部 Registry 输入；
- 调用 RegistryBuilder；
- 管理 Runtime Activation attempt；
- 请求受控 restart；
- 在新 Core 启动时重建并安装精确 Registry；
- 持久化 runtimeActive / activation failure facts；
- 生成安全状态 Projection。

### 3.2 Registry

继续只包含：

```text
agentVisibleCapabilities
├── models
└── tools

infrastructureResources
├── capabilityBindings
└── adapterDescriptors
```

Agent、Skill 和 Knowledge 是独立产品对象，不因配置物化而进入 Capability
Registry。它们可以参与 TaskRuntimeSelection 和 Prompt，但 RegistryBuilder 只
消费 Model/Tool 能力声明和基础设施描述。

### 3.3 Central Service

Central Service 不参与：

- 本地 RegistryBuilder；
- Local Core restart；
- runtimeActive pointer；
- TaskRuntimeSelection；
- TaskCapabilityLock；
- Agent Loop 或 Prompt。

CGF-1.3 不新增 Central HTTP API、Java DTO 或 Enterprise Gateway 公共 Contract。

### 3.4 Kernel

Kernel reducer 不得导入：

- MaterializedEnterpriseConfiguration；
- RuntimeActivationCoordinator；
- ControlledCoreRestartPort；
- enterprise configuration SQLite；
- Registry bootstrap；
- Electron 或进程管理器。

Runtime Activation 位于 Application/bootstrap，不进入纯 Task 状态机。

## 4. 内部类型化 Port

建议建立或扩展以下内部边界，具体 TypeScript 名称可在 1.3A 编码评审中调整：

```text
EnterpriseRuntimeRegistrySource
EnterpriseRegistryMaterializer
RuntimeActivationPersistence
RuntimeActivationCoordinator
ControlledCoreRestartPort
RuntimeRegistryInstaller
GenerationReferenceReader
```

`ControlledCoreRestartPort` 是 Local Core 内部类型化 Port，不是
`packages/contracts` 公共 Contract，也不绑定 Electron、launchd、systemd、
Windows Service 或某个进程管理器。

最小职责：

```text
requestRestart(exact target generation / opaque restart intent)
observe startup target
report internal readiness result
```

不得暴露：

- PID；
- shell command；
- 任意启动参数数组；
- RuntimeAdapterHandle；
- Credential；
- Electron IPC Channel。

具体 Adapter 在后续 Desktop/Main 或部署环境装配；Conformance 使用 Fake/Test
Adapter 证明语义。

## 5. 持久事实与提交顺序

### 5.1 最小持久事实

Runtime Activation 持久事实至少需要表达：

```text
activationAttemptId
identity scope
target candidateKey
target storage revision / digest
expected previous runtime revision / digest?
materialized registry revision / digest?
requestedAt
completedAt?
safe failure code?
runtime active generation
last activation failure
```

这些事实位于 enterprise configuration persistence 领域，不进入 Task/Event、
公共 Desktop Contract 或 Central Contract。Access Token、Runtime Handle、PID、
连接和 Secret 禁入。

字段级 Schema 和内部状态枚举在 1.3A/1.3B 实现评审中冻结；本计划只冻结语义，
不提前建立万能 Activation Workflow。

### 5.2 固定提交顺序

```text
load exact sealed storage-active generation
→ revalidate scope/session/compatibility/digests
→ materialize and finalize deterministic RegistrySnapshot
→ persist idempotent activation intent
→ request controlled restart
→ new Core rebuilds the same exact generation
→ instantiate required Runtime Handles
→ required internal readiness passes
→ atomically record runtimeActive + completed attempt
→ expose public Core readiness
```

**runtimeActive 必须在 required internal readiness 通过后、对外开放前提交。**

先开放再写入会造成“已经接受新 Task、但没有持久 runtime generation”的悬空
引用；先写入再完成内部 readiness 会把未实际可用的 Registry 伪装为 current。

### 5.3 runtimeActive 已提交、响应前崩溃

按 Claude Code 评审意见，本批必须覆盖：

```text
runtimeActive transaction committed
→ public readiness/response 尚未完成
→ process crash
```

恢复规则：

1. 新进程加载已完成 attempt 和 exact target generation；
2. 重新确定性构建 RegistrySnapshot；
3. registry revision/digest 必须与已提交事实一致；
4. 一致时幂等重放成功，不创建第二个 generation 或 attempt；
5. 不一致时标记持久完整性错误，企业 Registry 分区失败关闭；
6. 该场景是本地可查询、可重建操作，不复用 Effect `uncertain` 状态。

### 5.4 Central 恢复检测与用户确认

Central 恢复由 Core 自动检测。检测事实来自：

- SSE reconnect；
- periodic polling；
- Access Token 有效；
- Device Trust 有效。

恢复检测只产生类型化状态，不自动执行配置变更：

```text
Central 恢复
→ Core 检测并复核 Access Token / Device Trust
→ Desktop 展示“发现企业配置更新，是否同步并应用？”
→ 用户确认
→ 下载并完整校验
→ Storage Activation
→ persist Runtime Activation intent
→ Controlled Core Restart
→ Runtime Activation
```

禁止 Central 恢复后后台静默下载配置、Storage Activation、Runtime Activation
或重启 Core。SSE reconnect、polling 和检测状态不得被当作用户确认。

### 5.5 LocalExecutableEnterpriseCapability

企业能力只有满足以下全部条件，才可以在 Central 暂时不可用、但企业会话仍
有效时继续本地执行：

```text
runtimeActive generation
∩ package sealed
∩ package digest valid
∩ required dependencies available
∩ referenced Model/Tool usable
```

判断必须来自 `enterprise-configuration.sqlite` 的持久事实和可复核内容，不得
依赖内存状态、UI 状态或未持久化的上次运行缓存。任一所需 Model/Tool 依赖远程
Gateway 且当前不可用时，该企业能力不属于完全本地可运行能力。

## 6. CGF-1.3A：Enterprise Registry Materializer 与启动前预检

### 6.1 交付范围

- EnterpriseRuntimeRegistrySource 或等价只读 Port；
- 从 active sealed MaterializedEnterpriseConfiguration 读取精确 generation；
- enterprise/user/device/client 四因素 scope 复核；
- 有效企业会话和 Compatibility 复核；
- Snapshot、Package、file 和 materialization digest 复核；
- Model/Tool Descriptor 到 CapabilityDefinition/Binding/AdapterDescriptor 的
  确定性转换；
- Agent/Skill Package 与 Knowledge Descriptor 的独立运行引用投影；
- `LocalExecutableEnterpriseCapability` 五项交集的确定性判定；Skill、
  Knowledge、Tool 与 default Model 检查集合从已校验
  `AgentDefinitionRevision` 固定引用推导，不接受调用方手填依赖 ID；
- RegistryBuilder 重复 ID、缺失引用、kind/port、multi-binding、revision
  和 trusted source 校验；
- 构建顺序无关的 Registry revision；
- deep-frozen RegistrySnapshot；
- Materializer InMemory/Fixture Conformance。

### 6.2 有效企业会话门槛

企业服务暂时不可用但 Access Token、Device Trust、scope 和 Compatibility 仍
有效时：

- 只允许当前 runtimeActive generation 中满足
  `LocalExecutableEnterpriseCapability` 的能力继续；
- 不执行配置下载、新的 Storage Activation 或新的 Runtime Activation；
- 企业 Model Gateway 和 Central Tool Gateway 不可用；
- 不静默切换个人 Model、其他 Binding 或 generation。

无有效企业会话时：

- 不把企业 Agent/Skill/Model/Tool/Knowledge 放入 Runtime Registry 或 Prompt；
- 不重新同步配置；
- 不执行新的 Runtime Activation；
- 不调用企业 Model 或中央 Tool；
- 保留历史 Task/Audit 和已物化 generation；
- 不静默切换个人 Model、其他 Binding 或未锁定 generation。

本批不决定纯本地个人模式产品开关。

### 6.3 退出门槛

- valid/invalid Materializer Conformance 通过；
- 注册顺序改变不影响 Registry revision；
- 任一 digest、scope、引用、port 或 descriptor 漂移失败关闭；
- 无企业会话时企业能力不进入 Registry/Prompt；
- LocalExecutable 判定只读取企业配置持久事实，不读取 UI 或临时缓存；
- Central 恢复检测不会自动触发同步或激活；
- Materializer 不修改 storage active pointer；
- 不创建公共 Runtime Handle Contract；
- RegistryBuilder 和 KAF-3 回归通过。

## 7. CGF-1.3B：受控重启与 Runtime Activation Coordinator

### 7.1 交付范围

- RuntimeActivationPersistence；
- RuntimeActivationCoordinator；
- ControlledCoreRestartPort 与 Fake/Test Adapter；
- RuntimeRegistryInstaller；
- activationAttemptId 和 target generation CAS；
- 启动前预检；
- restart intent 的幂等记录与恢复；
- 新 Core 精确 target rebuild；
- internal readiness；
- runtimeActive atomic commit；
- public readiness gate；
- activation failure fact；
- 迟到 attempt 和并发单写者保护。

### 7.2 目标 generation 激活失败

用户已接受以下逐项回退 checklist。目标 generation 激活失败时，只有全部条件
成立，才允许显式重建上一次成功 runtimeActive generation：

1. 持久事实明确记录 old generation 是上一次成功 runtimeActive；
2. old generation 已 sealed；
3. 当前 `storageActiveGeneration` 仍与本次失败 activation attempt 的目标一致，
   没有被并发推进；
4. old generation 的 enterprise scope 与当前 enterprise/user/device/client
   scope 完全一致；
5. user session 和 device session 均有效；
6. old generation 的全部 Package digest 校验通过；
7. old generation 的 Snapshot 完整且 digest 校验通过；
8. Model Registry 可以从 old generation 确定性重建；
9. Tool Registry 可以从 old generation 确定性重建；
10. 所需 Adapter 状态可信且实现仍存在；
11. 回退不改变 Binding、Model、Tool 或 revision；
12. 回退产生持久 activation failure fact 和安全状态事件。

回退后：

- `storageActive` 继续指向失败的新 generation，不自动回滚；
- `runtimeActive` 继续指向旧 generation；
- Projection 必须显示 `activation_failed`，不能伪装为 `current`；
- 新 Task 只能使用明确的旧 runtimeActive generation；
- 不得改用个人 Model、其他 Binding 或当前 Registry 中的“可用替代品”。

若任一条件不成立，直接进入 `activation_failed`，不得静默回退：

- 企业 Registry 分区 unavailable；
- 不创建企业新 Task；
- 历史 Task/Lock/Audit 不删除；
- Core 可暴露安全诊断状态，但不得把企业能力伪装为 ready。

### 7.3 命名故障点

至少覆盖：

1. activation intent 提交前；
2. intent 提交后、restart 请求前；
3. restart 请求后、新 Core 启动前；
4. Registry 构建后、Runtime Handle readiness 前；
5. readiness 后、runtimeActive commit 前；
6. runtimeActive commit 后、public readiness 前；
7. public readiness 后、调用方收到结果前；
8. storageActive 在旧 attempt 执行期间推进到新 generation；
9. 旧 runtimeActive 回退构建期间企业会话失效。

每个故障点必须有确定恢复结果，不得把迟到 attempt 写成 current。

### 7.4 退出门槛

- same attempt 重放幂等；
- runtimeActive 只在 internal readiness 后推进；
- public readiness 不先于 runtimeActive commit；
- runtimeActive commit 后崩溃可确定恢复；
- 目标失败不修改 storage active，不污染旧 Task；
- 显式旧运行代回退满足全部安全条件；
- 无热替换和无静默 Binding 切换证据通过；
- 进程生命周期资源释放和重复 restart 抑制通过。

### 7.5 实现状态

`0.0.0-cgf.1.3b` 已完成开发者实现，通过独立 QA 并由用户接受关闭：

- `enterprise-configuration.sqlite` V3 追加 activation attempt 和
  runtime-active generation 持久事实，V1/V2 checksum 不改写；
- Activation Intent、restart decision、internal readiness、runtimeActive
  commit 和 failure/fallback fact 均使用精确 attempt/target CAS；
- `ControlledCoreRestartPort` 只接收 opaque attempt 与 target，并要求新 Core
  观察精确 startup intent，不暴露 PID、命令行、Electron IPC 或 Handle；
- `runtimeActive` 与 completed attempt 在同一 SQLite 事务提交，public
  readiness 严格位于提交之后；
- 已覆盖九个命名故障点、提交后响应丢失、SQLite close/reopen、并发单写者和
  满足十二项 checklist 的受限旧 generation 回退；
- CGF-1.3C 已由用户明确授权。

## 8. CGF-1.3C：Task 引用安全、恢复矩阵与阶段关闭

### 8.1 新旧 Task 规则

- 新 Task 只使用当前明确的 runtimeActive generation；
- Task 创建后锁定 registryRevision 和 TaskRuntimeSelection；
- 已存在 TaskCapabilityLock 继续物化原 Definition、Binding 和 Descriptor；
- 配置同步或 Runtime Activation 不改写既有 Selection/Lock；
- 恢复 Task 使用锁定内容重建兼容 Runtime Handle；
- 缺失实现、Credential 或有效企业会话时进入 unavailable/waiting，不换 Binding。

### 8.2 双数据库边界

```text
Task / Session SQLite
  TaskRuntimeSelection
  TaskCapabilityLock
  non-terminal Task references

enterprise-configuration.sqlite
  sealed generations
  storage active / previous
  runtime active
  activation attempts / failures
```

两库：

- 不使用 SQLite `ATTACH`；
- 不建立跨库事务；
- 不共享 migration sequence；
- 通过稳定 generation revision/digest 和只读 Port 关联；
- 恢复时分别验证，再以确定性 Application 协调收敛。

权威边界固定为：

```text
enterprise-configuration.sqlite
  generation
  activation record
  storageActive / runtimeActive
  Runtime Registry 状态

Task / Session SQLite
  Task
  TaskRuntimeSelection
  TaskCapabilityLock
```

不存在跨 SQLite 原子事务。恢复顺序固定为：

```text
读取 enterprise activation record
→ 确定并验证 active generation
→ 读取 Task SQLite 中的 TaskRuntimeSelection / TaskCapabilityLock 引用
→ 校验 generation revision/digest 和依赖
→ 恢复 Task Projection
```

Task SQLite 不得反向决定当前 runtimeActive generation；
`enterprise-configuration.sqlite` 也不得改写已经持久化的 Task Selection/Lock。

### 8.3 最小 GC blocker

CGF-1.3 只建立引用保护和可观测性，不执行自动破坏性 GC。

generation 必须被保留，只要被以下任一事实引用：

- storage active；
- storage previous；
- runtime active；
- 非终态 TaskRuntimeSelection/TaskCapabilityLock；
- 正在恢复的 Task；
- pending Runtime Activation attempt；
- `activation_failed` 显式回退链；
- 独立 QA 故障注入中的未决恢复事实。

实现可以采用引用标记表、引用计数或确定性 reachability 查询，但必须：

- 来源可审计；
- 重启后可重建或验证；
- 不依赖仅存在于内存的引用；
- 不允许负计数或丢失来源；
- 只提供 `referenced / safe-to-delete=false` 事实；
- 不在本批实现自动删除。

旧 Task 跨 generation 查询优化和自动 GC 属于后续 P3。

### 8.4 完整恢复矩阵

至少覆盖：

- online 正常激活；
- Central offline，但本地 generation 完整；
- Central 恢复检测成功但用户尚未确认应用；
- Central 恢复后用户拒绝或取消应用；
- 企业会话缺失、过期、scope 漂移或设备撤销；
- target generation 损坏；
- previous/runtimeActive generation 损坏；
- Core crash 和重复 restart；
- SQLite close/reopen；
- runtimeActive commit 后 response 丢失；
- Storage Activation 与 Runtime Activation 并发；
- 新旧 Task 跨 generation；
- 非终态 Task 阻止 generation 进入可删除集合；
- activation_failed 回退链阻止旧 generation 删除；
- 无企业会话时企业能力不进入 Registry/Prompt。

### 8.5 Desktop 企业离线状态 Projection

Desktop 必须区分：

1. `企业在线：能力正常`；
2. `企业服务暂时不可用：当前已 Runtime Active 且完全本地可运行能力可继续`；
3. `企业会话失效：企业能力暂停`；
4. `企业恢复：发现新配置，等待应用`。

禁止仅显示“正在使用缓存配置”。Projection 由持久 activation facts、连接状态、
Access Token/Device Trust 校验结果派生，不由 Renderer 自行推断。

### 8.6 退出门槛

- 新旧 Task 跨 generation 不串扰；
- 现有 Task 不因同步或重启静默升级；
- activation Projection 只由持久 facts 派生；
- `current`、`pending_restart`、`activation_failed` 状态与真实指针一致；
- GC blocker 覆盖全部冻结来源；
- 产品离线四状态与 ADR-014 一致，状态 4 不静默同步或激活；
- 双 SQLite 按权威库 → Task 引用 → Projection 的固定顺序恢复；
- Node 24 完整门禁、CGF E2E 和恢复 Harness 通过；
- Claude Code 独立 QA 无 P0/P1，用户接受后 CGF-1 才关闭。

### 8.7 实现状态

`0.0.0-cgf.1.3c` 已完成开发者实现并等待独立 QA：

- Task generation 恢复只读 enterprise activation authority，再读取独立
  Task SQLite 的非终态 Task、TaskRuntimeSelection 与 TaskCapabilityLock；
- 现有 Selection/Lock 不被同步、激活或恢复流程改写，旧 Task 精确关联旧
  generation，新 Task 精确关联 runtimeActive generation；
- Snapshot revision 的原始 64 位十六进制与 Task `sha256:` digest 通过唯一
  Application 规范化映射关联，不升级公共 Contract；
- GC analyzer 覆盖 active/previous/runtime/pending/failure/fallback 和
  非终态 Task 引用，只生成 `referenced` 与 `safeToDelete=false` 事实；
- 企业离线四状态由连接、会话、runtimeActive 和本地可运行数量纯派生，
  recovered update 只输出用户确认要求，不执行配置变更；
- 独立 enterprise configuration SQLite 与 Task SQLite close/reopen Harness
  验证恢复顺序和新旧 Task 不串扰；
- Node 93 files / 600 tests、专项 3 files / 15 tests、Central 在线/离线
  各 53 tests 通过；公共 Contract、Kernel 和 Central Java 未修改。

CGF-1.3C 已通过 Claude Code 独立 QA并由用户正式接受；CGF-1.3 阶段关闭。

## 9. 非目标

CGF-1.3 不实现：

- 配置过期策略；
- 离线租约；
- 受限模式；
- 实时撤销；
- Policy Engine；
- 自动个人 Model fallback；
- 自动 Binding 切换；
- 自动破坏性 GC；
- 复杂 RBAC；
- Runtime Registry 热替换；
- 多代 Registry 同时供新 Task 智能选路；
- Agent/Skill Runtime；
- 企业 Model Gateway 或 Central Tool/MCP；
- Desktop 企业登录或同步 UI；
- 真实 OA、MDM、OS Device Signer；
- Admin 写端、发布审核；
- 新的 Central Runtime API 或万能 `execute`。

## 10. 采用理由与替代方案

### 10.1 采用理由

- 延续 ADR-008 启动期构建、校验和冻结；
- Storage 与 Runtime Activation 分层，避免同步时改变正在运行的 Task；
- runtimeActive 在 readiness 后、公开服务前提交，消除悬空引用窗口；
- 通过精确 generation 和 CAS 处理进程崩溃，而不是引入分布式事务；
- 显式旧运行代回退兼顾可用性与审计，不把失败伪装成 current；
- 只建立 GC blocker，不提前引入破坏性清理。

### 10.2 未采用方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| Storage Activation 后热替换 Registry | REJECT | 违反 ADR-008，可能改变当前 Task |
| 每个 Task 启动时重新读取最新企业配置 | REJECT | 无法稳定锁定 revision |
| Local Core 启动失败时自动回滚 storage active | REJECT | 会改写已验证配置事实并掩盖激活失败 |
| 目标失败后自动选择其他 Model/Binding | REJECT | 违反 ADR-008/ADR-011 |
| 配置库与 Task 库建立跨库事务 | REJECT | 增加损坏域和迁移耦合 |
| 本批实现自动 GC | DEFER | 尚无长期容量证据；先证明引用安全 |
| 把 restart 定义为公共 Wire Contract | REJECT | restart 是部署/进程内部能力 |

## 11. 上游借鉴与可追溯性

| 来源 | 固定 Commit | 本计划采用 | 不照搬 |
| --- | --- | --- | --- |
| grok-build | `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce` | ToolRegistryBuilder → FinalizedToolset | Rust 实现、三套 Tool 体系 |
| OpenHands SDK | `4fe565663af2b4f1130a6e0dac7566b002bfe9b4` | Definition/运行实现分离、稳定身份 | Python Runtime、文件 Event Store |
| OpenClaw | `deccdb5e57af6800d4f020ea2034166592a149ba` | 启动期 discovery/validation/registration、失败关闭 | 运行期 Plugin Activation、npm 热加载 |
| LangGraph | `49ae27c2ae983cfb92091b0dea9f7bc37a716479` | Persistence Adapter Conformance、recovery 测试 | Pregel、Graph Builder、图运行时 |
| RoboThree | ADR-008/009/011/014、AR-013、AR-029～AR-031、KAF-2/KAF-3 | 不可变 Registry、Task Lock、CAS、命名故障点 | 不建立第二套 Runtime 或公共 Handle Contract |

采用方式为 `DESIGN_ONLY + INTERNAL_REUSE + OWN_SECURITY`。本计划不复制第三方
源码、Schema、SQL、测试或协议。实施后应在上游借鉴登记表新增对应实现登记。

证据入口：

- [RoboThree 上游借鉴登记表](./UPSTREAM-ADOPTION-REGISTER.md)；
- [grok-build 适配分析](../../../robothree-agent-research/research/grok-build/robothree-fit-analysis.md)；
- [OpenClaw 适配分析](../../../robothree-agent-research/research/openclaw/robothree-fit-analysis.md)；
- [Software Agent SDK / OpenHands 适配分析](../../../robothree-agent-research/research/software-agent-sdk/robothree-fit-analysis.md)；
- [LangGraph 适配分析](../../../robothree-agent-research/research/langgraph/robothree-fit-analysis.md)。

## 12. 验证计划

每个子批必须：

1. 升级独立开发版本；
2. 更新 Development Log 和 CHANGELOG；
3. 执行 Node 24 完整门禁；
4. 运行本批 Conformance、故障注入和 SQLite close/reopen；
5. 1.3B/1.3C 使用真实子进程或等价受控进程边界 Harness；
6. Claude Code 按独立 QA Skill 实际重跑完整 Harness；
7. 用户接受该批 `PASS/CLOSED` 后才解锁下一批。

CGF-1.3 不要求修改 Central Service canonical Contract；如实现中发现必须修改
Enterprise Gateway Schema，立即停止并重新进入用户决策，不得借内部 restart
需求扩张跨语言协议。

## 13. 工程量

```text
CGF-1.3A：2～3 个集中工程工作日
CGF-1.3B：3～4 个集中工程工作日
CGF-1.3C：2～3 个集中工程工作日
合计：7～10 个集中工程工作日
建议 PM 日历窗口：10～16 个日历工作日
```

一个集中工程工作日约等于一个工程师的 8 个正常工程小时，是分析、设计、编码、
开发者自测和文档的工作量单位，不表示 AI 连续运行 8 个墙钟小时。日历窗口包含
顺序门槛、独立 QA 和常规返工，不包含公司外部审批、真实 OA/MDM 或重大 P0
返工。

旧 CGF-1 总计划中的 1.3 2～4 天没有充分计入受控重启、跨进程崩溃恢复、
runtime activation 持久事实、旧 Task generation 引用和完整阶段 Harness，本计划
以 CGF-1.2 的实际代码边界重新估算。

## 14. 当前门槛

用户已将 CGF-1.3 确认为 `CONFIRMED_WITH_SPECIFIED_REVISIONS`。以下文档门槛
已经关闭：

1. DCF-1.3 已 `PASS/CLOSED`，Controlled Core Restart 底座稳定；
2. 企业离线四状态已接受并同步到 MVP 基线；
3. 状态 4 冻结为 Core 自动检测、Desktop 用户确认、禁止静默应用；
4. `LocalExecutableEnterpriseCapability` 冻结为五项持久事实交集；
5. 旧 generation 回退冻结为十二项逐项 checklist；
6. 双 SQLite 冻结权威边界和确定恢复顺序；
7. Desktop 冻结四种企业状态，不使用模糊缓存文案；
8. A/B/C 三阶段和 MVP 非目标保持不变。

当前状态：

```text
DCF-1.3：PASS / CLOSED
CGF-1.3：PASS / CLOSED
CGF-1.3A：PASS / CLOSED
CGF-1.3B：PASS / CLOSED
CGF-1.3C：PASS / CLOSED
```

CGF-1.3A、CGF-1.3B、CGF-1.3C 均已通过独立 QA并由用户正式接受关闭。
CGF-1.3 阶段正式关闭；下一阶段继续 GATED，等待方案确认和明确授权。
