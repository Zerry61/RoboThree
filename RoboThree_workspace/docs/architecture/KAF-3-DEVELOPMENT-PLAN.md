# RoboThree KAF-3 开发计划：Capability 与 Adapter

> 状态：**COMPLETE — KAF-3.1～KAF-3.3 INDEPENDENT QA PASS**  
> 日期：2026-07-21  
> 完成基线：`0.0.0-kaf.3.3` 独立 QA `PASS`、KAF-3 已关闭  
> 编码门槛：[ADR-008](../adr/008-capability-registry-and-adapter-boundary.md) 已于 2026-07-20 转为 `ACCEPTED`

## 1. 目标

KAF-3 在不接完整 MCP、Office、Browser 或真实模型的前提下，建立可版本锁定、启动冻结、可替换并可穿透进程边界的 Capability/Adapter 框架。

完成后的最小闭环：

```text
trusted definitions + bindings + adapter descriptors
→ RegistryBuilder.validate().finalize()
→ immutable RegistrySnapshot
→ explicit capabilityId resolution
→ TaskCapabilityLock
→ ToolExecutionBackend
→ EffectCoordinator
→ typed Observation
→ Event + Checkpoint
```

本阶段验证平台扩展骨架，不实现任何特定业务场景。

## 2. 冻结边界

1. `CapabilityDefinition`、`CapabilityBinding`、`AdapterDescriptor`、`RuntimeAdapterHandle` 四层分离；Handle 不进入 Contract；
2. 一个 RegistrySnapshot 分为 Agent 可见能力与基础设施资源，Agent 首期只看 model/tool；
3. 只用类型化 Port，`ExecutionBackend` 明确收窄为 `ToolExecutionBackend`；
4. Registry 只在 Alpha 启动阶段构建并冻结，不运行期扩展或热加载第三方代码；
5. Task 锁定 definition/binding/descriptor/registry 精确 revision，物化恢复信息，不锁 Handle/PID/连接；
6. revoked/disabled/credential/health 只收窄，不自动改 Binding；
7. Resolver 只按显式 ID 确定性解析，不搜索、评分或智能选路；
8. 首批 Port 仅为 `ModelProvider`、`ToolCatalogProvider`、`ToolExecutionBackend`；
9. Fake-first，但 KAF-3 关闭前必须通过一个真实进程外 Echo Tool Adapter；
10. `CredentialResolver` 与 `EventPublisher` 不借本阶段扩张。

任何实现若需要突破上述边界，必须先修订 ADR-008，不能在代码中形成事实标准。

## 3. 上游借鉴

| RoboThree 模块 | 主参考 | 借鉴内容 | 明确不照搬 |
| --- | --- | --- | --- |
| RegistryBuilder | grok-build | `ToolRegistryBuilder → FinalizedToolset`、注册后统一校验与冻结 | 三套 Tool 体系、Rust 类型和把权限耦合进 Registry |
| Capability 分层 | OpenHands | `Tool Spec → ToolDefinition → ExecutableTool`、Action/Observation 类型化 | 动态文件系统/MCP 搜索、Python/Pydantic Runtime、可执行对象进入持久状态 |
| 受信声明加载 | OpenClaw | Manifest 声明、Discovery/Validation/Registration 启动链 | npm Plugin 热加载、运行期 Activation、Channel/Provider 大矩阵 |
| Typed Model Port | OpenClaw | Provider Adapter、流式事件、AbortSignal 与错误归一化 | 多厂商全矩阵、OAuth/Channel 耦合 |
| Tool 执行边界 | OpenHands | Local/Remote 统一执行抽象、超时/取消、Observation 返回 | 万能 ExecutionBackend、完整 Workspace 与 Git Worktree 假设 |
| Adapter Conformance | LangGraph | 同一抽象运行统一兼容性测试 | Pregel/Graph Runtime 与 Python serializer |

固定 Commit 见[上游借鉴登记表](./UPSTREAM-ADOPTION-REGISTER.md)。本计划全部先按 `DESIGN_ONLY` TypeScript 重写，不复制上游源码。

`ToolCatalogProvider` 只在 Registry 构建阶段提供受信 Tool Definition；Tool Binding 的执行目标必须是 `tool_execution_backend` Descriptor。Catalog 与 Execution 不合并为同一个万能接口。

## 4. 目标模块边界

只在对应批次出现真实代码时增量创建，不预建空目录：

```text
packages/contracts/src/capability/
├── capability-definition.ts
├── capability-binding.ts
├── adapter-descriptor.ts
├── registry-snapshot.ts
└── task-capability-lock.ts

services/core/src/
├── registry/
│   ├── registry-builder.ts
│   └── capability-resolver.ts
├── ports/
│   ├── model-provider.ts              # 延续并收敛现有 Port
│   ├── tool-catalog-provider.ts
│   └── tool-execution-backend.ts
└── adapters/
    ├── fake/
    └── process-echo/

services/core/tests/
├── registry-builder.test.ts
├── capability-resolver.test.ts
├── capability-lock.integration.test.ts
├── tool-catalog-provider.conformance.ts
├── tool-execution-backend.conformance.ts
└── process-echo-tool.integration.test.ts
```

`RuntimeAdapterHandle` 只能存在于 `services/core` 内部。`packages/contracts`、Kernel reducer、Event 和 Persistence payload 不得 import 或序列化它。

## 5. 最小 Contract

### 5.1 精确修订

- 每个 Definition、Binding、Descriptor 都有稳定 ID、`schemaVersion` 和精确 `revision`；
- `revision` 由规范 JSON 的 SHA-256 产生，展示版本不能替代 digest；
- RegistrySnapshot 对分区后完整内容计算 `registryRevision`；
- Map/对象键排序，数组保序，复用 KAF-2 canonical JSON 规则；
- Secret、函数、循环引用、运行实例和未声明字段稳定拒绝。

### 5.2 TaskCapabilityLock

Alpha 选择物化式锁定：

```text
TaskCapabilityLock
├── lockId / taskId / lockedAt
├── registryRevision
├── definitionSnapshot + definitionRevision
├── bindingSnapshot + bindingRevision
└── adapterDescriptorSnapshot + adapterDescriptorRevision
```

Snapshot 只保存恢复所需的规范化静态字段。凭证只保留引用，PID/连接/health 不保存。锁定记录未来即使改成引用历史 RegistrySnapshot，也必须保持相同可验证语义。

## 6. 开发批次

### 6.1 `0.0.0-kaf.3.1`：Capability Contract 与不可变 Registry

> 实现状态：**PASS（2026-07-21，独立 QA 18/18、0 问题）**

目标：先冻结“什么可以被注册和锁定”，不执行 Tool。

交付：

- `CapabilityDefinition` 的 `model | tool` discriminated Contract；
- `CapabilityBinding`、`AdapterDescriptor` Contract；
- Agent-visible 与 infrastructure 分区的 `RegistrySnapshot`；
- `TaskCapabilityLock` 物化 Contract；
- 复用 canonical JSON/SHA-256 的精确 revision 校验；
- `RegistryBuilder`：register/validate/finalize；
- 重复 ID、重复逻辑名、引用缺失、kind/port 不匹配、digest 漂移失败关闭；
- finalize 结果深层不可变，重复输入产生相同 `registryRevision`；
- 架构边界规则：Contracts/Kernel 不得依赖 Runtime Handle、Adapter 或进程 API；
- 上游实际采用登记与完整 Contract/Registry 测试。

退出门槛：

1. 非 JSON、非法 kind、空 ID、未知 schemaVersion 和伪造 revision 被拒绝；
2. Agent 可见投影只有 model/tool，不能泄漏 Binding/Descriptor；
3. Definition→Binding→Descriptor 引用唯一且类型一致；
4. 同一逻辑输入不受注册顺序影响，得到相同 Registry revision；
5. finalize 后嵌套对象与数组均不可修改；
6. `TaskCapabilityLock` 能独立校验三类精确修订且不含 Handle/PID/Secret；
7. KAF-0～KAF-2 的 111 项测试、boundary 和 smoke 全部回归。

明确不包含：CapabilityResolver、Tool 执行、Task 持久化接管、进程 IPC、真实 Provider。

### 6.2 `0.0.0-kaf.3.2`：确定性 Resolver、Typed Port 与 Task 锁定

> 实现状态：**PASS（2026-07-21，独立 QA 23/23、0 问题）**

目标：用 Fake 实现跑通显式选择、锁定和执行，不穿透真实进程。

交付：

- `CapabilityResolver.resolveById(registryRevision, capabilityId)`；
- 类型化 not-found/ambiguous/revision-mismatch/unavailable 错误；
- 实时 revoked/disabled/credential/health 收窄输入；
- 已锁定 Binding 不可静默替换的测试；
- 收敛现有 `ModelProvider` Conformance；
- 新增 `ToolCatalogProvider` 与 `ToolExecutionBackend` Port/Conformance；
- Fake Tool Catalog 与 Fake Tool Execution Backend；
- Task 创建/首次执行时原子持久化 `TaskCapabilityLock`；
- SQLite close/reopen 后从物化锁恢复并验证 Descriptor；
- Fake Tool Action → Effect → Observation → Event/Checkpoint 闭环；
- 新增第二个 Fake Backend 不修改 Kernel 的扩展性测试。

退出门槛：

1. Resolver 代码中不存在搜索、评分、成本路由或 fallback；
2. 任一实时禁用状态只拒绝当前 Binding；
3. 三类 Port 保持各自类型，不出现万能 payload；
4. Task lock、Effect Intent 和最终 Observation 的引用一致；
5. 重启后不依赖旧 Runtime Handle 也能验证锁并重建 Fake Handle；
6. Persistence 原子性、幂等和 KAF-2 recovery 全量回归。

明确不包含：真实进程、MCP、CredentialResolver 扩展、EventPublisher 扩展和 failover。

### 6.3 `0.0.0-kaf.3.3`：进程外 Echo Tool Adapter 与 KAF-3 验收

> 实现状态：**PASS（2026-07-21，独立 QA 27/27、0 问题）**

目标：用一个无业务副作用的真实 Adapter 证明类型化 Port 可以安全穿透进程边界。

最小协议：

```text
Core ToolExecutionBackend
→ spawn trusted Node child process
→ protocol handshake
→ NDJSON invoke { protocolVersion, requestId, effectAttemptId, idempotencyKey, toolId, action, deadlineAt }
← NDJSON observation | typed error
→ EffectCoordinator records Observation/Event/Checkpoint
```

交付：

- 受信、固定路径的 Echo Adapter Descriptor；
- 独立 Node.js Echo 进程和最小版本化 NDJSON 协议；
- 握手与协议版本不匹配失败关闭；
- requestId 关联、stdout framing、stderr 限长诊断和非法 JSON 拒绝；
- Deadline/Timeout 到期终止子进程并收敛 Effect；
- 启动失败、调用中 crash、正常关闭和 Core 取消测试；
- 正常 Echo 结果进入类型化 Observation 和持久事件链；
- 不可确认窗口继续遵守 ADR-007 recovery mode，不猜测成功；
- KAF-3 Conformance、Integration、Architecture boundary 与完整回归；
- Claude Code 独立 QA 建议范围和证据入口。

冻结执行语义：

1. 状态图保持 `prepared → dispatched → succeeded | failed | cancelled | uncertain`，不增加 Effect 状态；
2. `dispatched` 必须先持久化、再调用 Backend，只表示“已持久化分发决定”，不表示对端已经接收或执行；
3. Policy/Approval 的未来接入点位于 `prepared` 之前；长时间审批后和实际分发前必须重新应用 revoked/disabled/credential/health 实时收窄；本批不实现完整 Policy；
4. `effectAttemptId` 标识一个持久 Effect Attempt，`idempotencyKey` 在同一 Attempt 的恢复/重试中稳定，`requestId` 每次实际进程传输重新生成；
5. `failed` 只表示可信确定性失败；请求发出后遇到非法响应、响应错配或进程崩溃时保留 `dispatched`，再由 recovery mode 查询、幂等重试或收敛为 `uncertain`；
6. RoboThree 不宣称通用 exactly-once；采用 durable intent、at-least-once dispatch、幂等/可查询恢复和 explicit uncertainty；
7. 进程协议是 Adapter 内部严格 Schema，不进入公共 Contract，也不引入 Runtime Handle/PID 持久化。

退出门槛：

1. IPC 正常、超时、非法响应、进程崩溃和取消均有确定结果；
2. 子进程不能借 Echo 协议执行任意命令、访问文件或声明新 Tool；
3. Observation 链路与 Fake Backend 语义一致；
4. Runtime Handle/PID 不进入 Task lock、Event、Checkpoint 或 RegistrySnapshot；
5. 完整 MCP、Office、Browser、真实模型仍未进入依赖；
6. 独立 QA `PASS` 后才关闭 KAF-3。

## 7. Registry 构建与运行时流程

### 7.1 启动

```text
Bootstrap
→ load official/enterprise-trusted declarations
→ RegistryBuilder.register(...)
→ Contract + reference + trust validation
→ instantiate required RuntimeAdapterHandles
→ required readiness check
→ RegistryBuilder.finalize()
→ freeze RegistrySnapshot
→ Core ready
```

Alpha 不提供 `registry.add()`、`registry.reload()` 或目录 watch。配置变化通过受控重启生效。

### 7.2 Task 执行

```text
explicit capabilityId
→ resolve unique static route
→ apply live restrictive state
→ persist TaskCapabilityLock
→ create Effect Intent
→ ToolExecutionBackend.execute(locked tool action)
→ typed Observation
→ atomic Effect + Event + Checkpoint commit
```

恢复时先校验 TaskCapabilityLock，再按锁定 Descriptor 查找/重建 Handle。当前 Registry 存在同 ID 新版本不构成替换理由。

## 8. 测试策略

### 8.1 Contract/Property Tests

- Definition/Binding/Descriptor/Lock discriminated schema；
- canonical digest 对键顺序稳定，对内容漂移敏感；
- 随机非法引用、重复 ID 和 kind mismatch；
- Runtime Handle、函数、Secret-like 值和未知字段拒绝。

### 8.2 Registry Tests

- register order independence；
- validate/finalize 一次性语义；
- deep freeze；
- Agent projection 不泄漏 infrastructure；
- Registry revision 与精确 record revision；
- 启动失败不产生半可用快照。

### 8.3 Port Conformance

- Model streaming/order/cancel/error；
- Tool catalog deterministic list/schema validation；
- Tool backend Action/Observation、deadline/cancel/error mapping；
- Fake 与 Process Echo 运行 Tool Backend 的公共最小测试。

### 8.4 Persistence/Recovery

- TaskCapabilityLock 原子写入与幂等回放；
- SQLite close/reopen；
- 当前 Registry 改版后旧 Task 仍按物化锁验证；
- locked Adapter 不可用时 waiting/unavailable，不 fallback；
- Effect prepared/dispatched/uncertain 语义不回归。

### 8.5 Process Echo

- handshake；
- Unicode、嵌套 JSON 和边界尺寸；
- split/multiple NDJSON frame；
- malformed frame；
- timeout/cancel；
- crash before/after request；
- stderr 不泄漏输入或 Secret；
- Observation/Event/Checkpoint round trip。

## 9. 性能与可靠性边界

KAF-3 不建立最终商业 SLA，但记录：

| 指标 | Alpha 目标 |
| --- | --- |
| 已冻结 Registry 显式 ID 解析 | 内存索引 O(1)，不扫描全部能力 |
| Registry 构建 | 随能力数线性增长；1,000 个 Definition 基准可记录 |
| 每次 Tool 调用额外 Registry 开销 | 不做动态发现、网络探测或评分 |
| Echo IPC | 记录 p50/p95；不以性能优化牺牲 timeout/crash 正确性 |
| 队列与输出 | 请求和 stderr/stdout 有界，不允许无界累积 |

实际性能优化、并发上限和 backpressure 仍由 KAF-4 负责。

## 10. 风险与控制

| 风险 | 控制 |
| --- | --- |
| Capability 抽象变成大型平台 | Alpha 只含 model/tool、显式 ID、三类 Port |
| Descriptor 意外携带运行实例或 Secret | Zod strict schema、JSON-safe、边界测试和持久化扫描 |
| Registry 变更破坏旧 Task | TaskCapabilityLock 物化恢复投影与精确 digest |
| live health 被滥用为路由 | 只允许 deny/unavailable，测试禁止 Binding 替换 |
| 进程 IPC 演变为通用 Worker | Echo 协议只接受固定 toolId 和输入回显；完整 Worker 单独 ADR |
| 子进程挂死或输出泛滥 | deadline、kill、frame/stream size limit、有界 stderr |
| SQLite/Vitest `enableDefensive` 偶发 flake | 保留 KN-009 P3，隔离集成测试并继续失败关闭；KAF-4 前关闭或重定级 |

## 11. 非目标

- 能力搜索、评分、推荐、成本路由和自动 fallback；
- CredentialResolver、Vault、SSO 与企业 Secret 生命周期；
- 新 EventPublisher、Desktop realtime 或 Central Audit；
- MCP Host/Client 全实现；
- Office、PDF、Browser、Shell 与文件业务 Tool；
- 真实 OpenAI-compatible/MaaS Provider；
- 完整 Worker/Sandbox 生命周期、远程调度与 Fleet；
- Skill/Knowledge/Agent/Task Template Registry；
- 公开 Marketplace 与第三方代码热加载。

## 12. 周期与阶段门槛

KAF-3 预计 **4～6 个工作日**：

- KAF-3.1：约 1.5～2 个工作日；
- KAF-3.2：约 1.5～2.5 个工作日；
- KAF-3.3：约 1～1.5 个工作日。

这是单一主开发流、边界不再变更、Node 24.13.0 本地环境可用的工程量估算，不表示必须连续执行固定 8 小时。

ADR-008、KN-013 与 KN-014 已接受，KAF-3.1～KAF-3.3 均通过独立 QA，KAF-3 正式关闭。后续不得未经新范围冻结，把 Process Echo 直接扩张为通用 Worker、MCP 或第三方进程加载平台；KAF-4 编码前先确认 Policy、并发、资源预算和可靠性边界。
