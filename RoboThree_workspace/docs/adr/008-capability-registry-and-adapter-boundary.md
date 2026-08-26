# ADR-008：Capability Registry 与 Adapter 边界

> 状态：**ACCEPTED**  
> 提出日期：2026-07-20  
> 接受日期：2026-07-20  
> 一致性修订：2026-07-22，运行时可用性来源与 ADR-006/MVP 离线边界对齐  
> 一致性修订：2026-07-24，Configuration Storage Activation 与 Runtime Registry Activation 分层  
> 适用阶段：KAF-3 Capability 与 Adapter

## 1. 背景

KAF-2 已经建立 Task/Run/Step、持久 Event、Checkpoint、Command/Effect 幂等和副作用恢复，但 Runtime 仍只通过 Fake Model 与 Fake Effect Executor 验证机制。KAF-3 需要让 Model 与 Tool 以可替换 Adapter 接入，同时避免把具体执行能力、运行实例和第三方代码带入 Core。

本阶段必须解决四类容易混淆的对象：

- Agent 能理解和选择的能力声明；
- 一个能力到具体实现的静态绑定；
- 可用于重建实现的 Adapter 描述；
- 进程内或进程外的实际连接、客户端和进程句柄。

如果把它们合并为一个万能 `Capability.execute()`，Task 无法稳定锁定版本，恢复记录会泄漏 PID/连接实例，Model、Tool 和基础设施也会被迫共享不真实的执行语义。如果 Registry 在运行期可变，正在执行或恢复的 Task 还可能静默换用另一实现。

本 ADR 冻结 Kernel Alpha 的最小分层、Registry 快照、任务锁定、运行时可用性收窄和首批 Port，不提前建设通用能力搜索、公开插件市场、完整 MCP 或任意第三方热加载。

## 2. 上游证据与采用方式

| 来源 | 固定 Commit | 借鉴 | RoboThree 调整 |
| --- | --- | --- | --- |
| grok-build | `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce` | `ToolRegistryBuilder → FinalizedToolset`、执行前校验、统一 Tool 分发 | 只采用 Builder/Validate/Finalize 思路；不采用 Rust 实现、三套 Tool 体系或把权限逻辑塞入 Registry |
| OpenHands Software Agent SDK | `4fe565663af2b4f1130a6e0dac7566b002bfe9b4` | `Tool Spec → ToolDefinition → ExecutableTool`、类型化 Action/Observation、Local/Remote 执行抽象 | 进一步把可序列化 Definition、Binding、AdapterDescriptor 与不可序列化 Runtime Handle 分开；不采用动态文件系统/MCP 搜索链和 Python Runtime |
| OpenClaw | `deccdb5e57af6800d4f020ea2034166592a149ba` | 声明式 Plugin Manifest、启动发现/校验/注册、轻量静态 Registry | 只借鉴受信声明和启动校验；拒绝运行期第三方 npm Plugin 激活、Core 内热加载和大型 Provider/Channel 矩阵 |

采用类型均为 `DESIGN_ONLY`。KAF-3 不复制上游 Rust、Python 或 TypeScript 源码。后续若复用独立源码，必须新增 `SELECTIVE_SOURCE` 登记并完成许可证与 NOTICE 审查。

## 3. 核心决策

### 3.1 四层对象严格分离

```text
CapabilityDefinition
        ↓ resolved by explicit ID
CapabilityBinding
        ↓ points to
AdapterDescriptor
        ↓ instantiated as
RuntimeAdapterHandle
```

#### CapabilityDefinition

版本化、JSON-safe 的 Contract，描述 Agent 可用的逻辑能力，不包含执行对象：

```text
capabilityId
kind                 # Alpha: model | tool
revision             # 规范内容的精确 revision/digest
displayVersion?      # 仅用于展示，不参与精确锁定
name / description
input/output schema or model metadata
source / trust metadata
```

#### CapabilityBinding

版本化、JSON-safe 的 Contract，声明某个 Definition 在本次 Registry 中由哪个 AdapterDescriptor 提供，并保存执行和恢复所需的静态路由信息。它不保存健康状态、凭证值、PID 或连接实例。

#### AdapterDescriptor

版本化、JSON-safe 的 Contract，声明受信 Adapter 的类型、协议、实现版本、进程边界、配置引用和恢复能力。Alpha 支持的类型与首批 Port 对齐：

- `model_provider`；
- `tool_catalog_provider`；
- `tool_execution_backend`。

Descriptor 可以保存非敏感 `configRef` 或 `credentialRef`，不得保存 Secret 本身。

#### RuntimeAdapterHandle

Local Core 内部运行对象，例如 Provider 客户端、子进程句柄、IPC 通道、连接池或关闭函数：

- 不进入 `packages/contracts`；
- 不进入 Registry 的可序列化快照；
- 不写入 Event、Checkpoint、TaskCapabilityLock 或数据库；
- 不暴露给 Agent；
- 只由 Bootstrap/Application/Adapter 生命周期持有。

### 3.2 一个 RegistrySnapshot，两类可见性

Kernel Alpha 使用一个统一且不可变的 `RegistrySnapshot`，但快照内部明确分区：

```text
RegistrySnapshot
├── agentVisibleCapabilities
│   ├── models
│   └── tools
└── infrastructureResources
    ├── capabilityBindings
    └── adapterDescriptors
```

- Agent 首期只能感知 `model` 和 `tool` 的 Definition 投影；
- Binding、AdapterDescriptor、Worker/进程信息属于基础设施，不进入模型上下文；
- Agent 可见不等于当前可执行，最终执行仍需解析锁定、运行时可用性收窄和 ADR-006 固定授权/用户确认；
- Skill、Knowledge、Worker、Sandbox、Credential 和 EventPublisher 不因“统一 Registry”自动变成 Agent 可选 Capability。

### 3.3 采用类型化 Port，拒绝万能执行接口

KAF-3 首批只完善三类 Port：

| Port | 职责 | 明确不负责 |
| --- | --- | --- |
| `ModelProvider` | 类型化模型请求、流式事件、取消和错误归一化 | Tool 执行、能力搜索、凭证管理 |
| `ToolCatalogProvider` | 提供受信 Tool Definition/静态目录输入 | 执行 Tool、运行时热注册 |
| `ToolExecutionBackend` | 执行已锁定 Binding 对应的 Tool Action，返回类型化 Observation | 模型调用、自动选 Binding、通用 `execute(any)` |

原计划中的 `ExecutionBackend` 收窄并命名为 `ToolExecutionBackend`。不得建立 `Capability.execute()`、`Adapter.invoke(kind, payload)` 或其他把所有能力压入一个无类型入口的接口。

`ToolCatalogProvider` 是 Registry 构建阶段的受信 Definition 来源，不是 Tool 的执行器。Tool Binding 指向 `tool_execution_backend` Descriptor；Model Binding 指向 `model_provider` Descriptor。Task 锁定实际执行路径所需的 Descriptor，不把 Catalog Provider 误当成执行目标。

`CredentialResolver` 与 `EventPublisher` 不借 KAF-3 扩展范围：后者沿用 KAF-2 的最小发布边界，前者仍待真实企业凭证需求和安全模型确认。

### 3.4 Registry 只在启动阶段构建并冻结

Alpha 启动链固定为：

```text
load trusted declarations
→ validate Contract and references
→ reject duplicate/conflicting IDs and revisions
→ instantiate RuntimeAdapterHandles
→ run required readiness checks
→ finalize canonical RegistrySnapshot
→ compute registryRevision
→ freeze
→ Core ready
```

- `registryRevision` 是 RegistrySnapshot 规范 JSON 的 SHA-256；
- finalize 后不得添加、删除或替换 Definition、Binding 或 Descriptor；
- 配置或受信扩展发生变化时，必须通过受控 Core 重启生成新快照；
- Alpha 不支持公开 Marketplace、运行期新增能力、任意目录扫描激活或第三方代码热加载；
- 声明校验失败、引用缺失或 ID 冲突时启动失败关闭，不跳过后继续 ready。

### 3.5 Task 锁定可恢复修订，不锁定运行实例

Task 在首次确定使用某能力时生成版本化、JSON-safe 的 `TaskCapabilityLock`，至少锁定：

```text
registryRevision
CapabilityDefinition exact revision
CapabilityBinding exact revision
AdapterDescriptor exact revision
lockedAt
```

对于 Tool，“首次确定使用”包括首次把该 Tool Schema 注入某次 `ModelRequest`。Tool Schema 一旦对 Model 可见，就已经成为该 Task 可选择的执行候选，因此必须在注入前或与注入同一原子准备阶段创建对应 `TaskCapabilityLock`；不得等到 Model 已返回 Tool Call 后才补锁。仅存在于 Catalog、但未进入当前 Task 可见集合的 Tool 不因发现而锁定。

Kernel Alpha 选择在 `TaskCapabilityLock` 中**物化恢复所需的规范化 Definition、Binding 和 AdapterDescriptor 投影及其 digest**，而不是只依赖当前进程内 Registry 对象。这样 Task 在应用重启或新 Registry 启动后仍能验证原始选择。

锁定记录不得包含：

- RuntimeAdapterHandle；
- PID、socket、连接 ID、内存地址或客户端实例；
- Secret、Token 或解析后的凭证；
- 某次启动的瞬时 health 结果。

恢复时使用锁定 Descriptor 重新创建或查找兼容 Runtime Handle；若所需受信实现、配置引用或凭证已经不可用，Task 进入类型化 unavailable/waiting 路径，不静默切换 Binding。

未来可以增加历史 RegistrySnapshot 持久保留，但不得删除 TaskCapabilityLock 的自足校验能力。

### 3.6 运行时可用性只能收窄能力

RegistrySnapshot 和 TaskCapabilityLock 是“允许使用哪一个静态实现”的上界。以下运行时可用性状态只允许把能力从可用收窄为不可用：

- revoked；
- disabled；
- credential unavailable/expired；
- unhealthy/unreachable。

Alpha 的 `CapabilityResolver` 不把这些状态用于选择另一个 Binding。锁定 Binding 当前不可用时必须明确失败、等待或请求恢复操作。

未来若支持 failover，必须同时满足：

1. 候选 Binding 在 Task 开始前已经精确锁定；
2. 新的治理 ADR 明确允许切换；
3. 切换产生完整 Event 和 Audit 记录；
4. Effect 幂等与恢复语义证明切换不会重复未知副作用。

### 3.7 CapabilityResolver Alpha 只做确定性解析

Alpha Resolver 输入为显式 `capabilityId`，输出该 ID 在指定 RegistrySnapshot 中唯一的 Definition、Binding 和 AdapterDescriptor：

- 不做自然语言能力搜索；
- 不做候选评分或成本/延迟排序；
- 不做基于 health 的智能选路；
- 不做隐式 fallback；
- 找不到、重复、revision 不匹配或运行时可用性收窄时返回类型化错误。

MVP 中这些状态来自 Local Core 已加载的最近成功配置快照、当前 Credential 可用性和本地 Adapter health；本 ADR 不意味着建设中央推送式实时撤销。企业服务不可用时，Local Core 继续使用最近成功同步且本地可运行的配置，但任何本地 unavailable 仍只能收窄能力。

Agent Loop 的动态规划可以决定“调用哪个显式 Tool ID”，但 Registry 不承担智能编排器职责。

### 3.8 Fake-first，但 KAF-3 必须穿透一次真实进程边界

Contract、Registry、Resolver 和类型化 Port 先用 Fake 及 Conformance Suite 验证。KAF-3 关闭前必须增加一个最小进程外 Echo Tool Adapter：

- Local Core 通过 `ToolExecutionBackend` 调用独立 Node.js 子进程；
- 使用版本化、JSON-safe 的 NDJSON stdio 协议；
- 覆盖握手、请求/响应关联、输入输出序列化、Deadline/Timeout、子进程崩溃和关闭；
- 正常结果必须进入既有 Effect → Observation → Event/Checkpoint 链路；
- Echo 不访问业务文件、网络、凭证或系统命令，不发展成通用 Worker 框架。

完整 MCP、Office、PDF、Browser、真实模型和企业 MaaS Adapter 全部延后。

### 3.9 企业配置存储激活不等于 Runtime Registry 激活

Central Enterprise Service 下发的新配置必须区分两个状态：

#### Configuration Storage Activation

表示：

- 完整 Configuration Snapshot 已下载；
- Schema、digest、引用和客户端兼容性校验通过；
- Agent/Skill Package 等全部强依赖已下载、校验并物化；
- 新配置成为本地最近成功配置；
- 本地记录 `pending_runtime_activation`。

Storage Activation 只改变本地配置存储的最近成功版本，不修改当前进程中已经冻结的 RegistrySnapshot。

#### Runtime Registry Activation

表示：

- Local Core 经过受控重启，或经过本 ADR 未来明确允许的 Registry rebuild；
- 使用最近成功配置重新加载受信 Model/Tool Definition、Binding 和 AdapterDescriptor；
- 创建并冻结新的 RegistrySnapshot 和 registryRevision；
- 只有新 Task 可以使用新的 RegistrySnapshot。

Alpha 固定流程：

```text
download candidate configuration
→ validate schema/digest/references/compatibility
→ materialize all required packages and descriptors
→ Configuration Storage Activation
→ pending_runtime_activation
→ current Tasks continue with existing TaskCapabilityLocks
→ controlled Local Core restart
→ build/finalize new RegistrySnapshot
→ Runtime Registry Activation
→ new Tasks use the new registryRevision
```

禁止：

- Storage Activation 后运行中热替换 Binding；
- 修改当前冻结 RegistrySnapshot；
- 多代 RegistrySnapshot 在同一 Core 进程内热并存；
- 让正在执行或恢复的 Task 静默切换 Model/Tool；
- 把 Agent/Skill/Knowledge 加入 Capability Registry。

`MaterializedEnterpriseConfiguration` 是配置存储的技术激活单位，不是 RegistrySnapshot。它可以包含 Agent/Skill Package、Knowledge Descriptor 和固定权限，但 RegistryBuilder 只消费其中的 Model/Tool 能力声明与基础设施描述。未来若需要多代 RegistrySnapshot 热并存，必须建立新的 ADR。

## 4. 依赖方向

```text
Contracts
  ├── CapabilityDefinition / Binding / AdapterDescriptor
  ├── RegistrySnapshot / TaskCapabilityLock
  └── Tool Action / Observation
          ↑
Kernel（纯状态，不持有 Adapter）
          ↑
Application
  ├── RegistryBuilder / CapabilityResolver
  ├── EffectCoordinator
  └── typed Ports
          ↑
Adapters
  ├── Fake Model / Tool Catalog / Tool Backend
  └── Process Echo Tool Adapter
```

RegistryBuilder 与 Resolver 位于 Application/Registry 边界，不进入纯 reducer。Adapter 可以依赖 Contracts 和 Port，但 Kernel 不得反向依赖 Adapter、IPC、子进程或具体 Provider SDK。

## 5. 被拒绝或后置的方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 万能 `Capability.execute()` | `REJECT` | 丢失 Model/Tool 类型语义，形成 God Interface |
| Registry 运行期可变 | `REJECT` | 破坏 Task 锁定、恢复和审计确定性 |
| Task 锁定 Runtime Handle/PID | `REJECT` | 不可序列化、不可跨重启恢复且泄漏基础设施细节 |
| health/credential 变化自动换 Binding | `REJECT` | 可能改变真实副作用目标，无法审计 |
| 只锁语义版本字符串 | `REJECT` | 同一版本可能出现内容漂移；必须有规范内容 digest |
| 首批建设能力搜索/评分/智能路由 | `DEFER` | 没有真实规模和策略需求，Alpha 显式 ID 足够 |
| 首批扩展 CredentialResolver/EventPublisher | `DEFER` | 与 KAF-3 最小能力接入闭环无关，会扩大安全与可靠性范围 |
| 先接完整 MCP/Office/Browser/真实模型 | `DEFER` | 不能优先证明 Registry、锁定与进程隔离边界 |
| 未审核 Plugin 在 Core 内热加载 | `REJECT` | 违反企业可信扩展和 Core 进程安全边界 |

## 6. 影响与风险

### 正面影响

- Task 选择、恢复和审计不依赖瞬时进程对象；
- Model 与 Tool 保持真实的类型化 Port，可独立演进；
- Registry 可在启动阶段一次性失败关闭，运行热路径只读；
- Agent 看到的能力与基础设施实现解耦；
- 未来 Local Worker、MCP 或企业 MaaS 可在相同 Contract 后接入。

### 成本与控制

| 成本/风险 | 控制 |
| --- | --- |
| TaskCapabilityLock 物化数据增加持久化体积 | Alpha 只含 model/tool 最小投影；大型 schema 后续可 Artifact 化，但 digest 和恢复字段不能丢 |
| 应用重启后锁定 Descriptor 对应实现不存在 | 失败关闭并进入 waiting/unavailable，不自动改路由 |
| 冻结 Registry 使配置变化需要重启 | Alpha 主动接受；换取确定性和可审计性 |
| Fake 无法证明真实 IPC | KAF-3 最终门槛强制 Process Echo 冒烟和故障测试 |
| Registry 抽象继续膨胀 | Agent 可见种类限于 model/tool，Resolver 限于显式 ID，首批 Port 限于三类 |

## 7. 验收门槛

1. 四层 Schema/类型边界可自动证明，Runtime Handle 无法进入 Contract 或持久记录；
2. RegistrySnapshot 区分 Agent 可见能力与基础设施资源，Agent 投影只有 model/tool；
3. Builder 对重复 ID、引用缺失、revision/digest 漂移和非法 Descriptor 失败关闭；
4. 同一输入产生相同 `registryRevision`，finalize 后深层不可变；
5. Resolver 只按显式 ID 返回唯一结果，不存在搜索、评分或隐式 fallback；
6. TaskCapabilityLock 精确锁定并物化恢复信息，SQLite close/reopen 后仍可验证；
7. revoked/disabled/credential/health 只会拒绝当前 Binding，不能触发替换；
8. `ModelProvider`、`ToolCatalogProvider`、`ToolExecutionBackend` 分别运行 Conformance Test；
9. 新增第二个 Fake 实现不修改 Kernel；
10. 进程外 Echo 覆盖 IPC、序列化、timeout、crash 和 Observation 全链路；
11. KAF-0～KAF-2 全量回归通过，Kernel 继续无 Adapter/IPC/SQLite 依赖；
12. 每个实际实现补充上游采用记录，注明 `DESIGN_ONLY` 或经审查的源码复用方式。

## 8. 非目标

- 通用能力搜索、Embedding、评分、成本路由和模型自动选路；
- Binding failover 与负载均衡；
- 公开 Marketplace、任意第三方安装与 Core 热加载；
- Credential Vault、企业 SSO、完整 Audit Publisher；
- MCP Host、Office/PDF/Browser Tool Pack、完整 Worker/Sandbox；
- 真实 MaaS/Model Provider 与生产网络调用；
- Skill、Knowledge、Agent Definition 和 Task Template 的完整 Registry 实现。

## 9. 结论

RoboThree Kernel Alpha 的 Capability 是可序列化、可锁定的声明与绑定，不是运行对象；AdapterDescriptor 描述如何重建实现，RuntimeAdapterHandle 只属于运行时。Registry 在启动时一次构建并冻结，Task 锁定精确修订且运行时可用性只能收窄能力。KAF-3 以类型化 Model/Tool Port 和最小进程外 Echo 验证扩展边界，不提前建设通用插件平台。
