# ADR-015 补充修订 A：厂商直连、自定义中转站与 Model Endpoint Binding

> 状态：**ACCEPTED**  
> 提出日期：2026-07-30  
> Claude Code 首轮评审：2026-07-30，`P0=0 / P1=0 / P2=2 / P3=2`  
> 评审修订日期：2026-07-30  
> Claude Code 修订版复核：2026-07-30，`P0=0 / P1=0 / P2=0 / P3=0`  
> 接受日期：2026-07-30  
> 适用范围：ADR-015、CGF-2A.2、CGF-2A.3、CGF-2B、CGF-2C、后续 Admin
> Model 配置  
> 基础 ADR：[ADR-015](./015-enterprise-model-invocation-and-development-provider-boundary.md)  
> 关系：本补充稿不替代 ADR-015；作为 ADR-015 的已接受增量约束  
> 当前实现影响：CGF-2.0、CGF-2A.1 **无需返工**  
> 编码状态：CGF-2A.2 继续 `GATED`，等待修订计划确认和用户明确开发授权

## 1. 背景

RoboThree 所在企业已经存在独立模型网关平台。该平台负责接收厂商模型和
Credential 配置，并向调用方签发新的 API Key 与请求地址。RoboThree 管理员
可以把该中转地址、新 Key 和模型标识配置到 RoboThree。

同时，RoboThree 必须保留直接连接 DeepSeek、OpenAI、Anthropic 等模型厂商的
能力，不能把企业中转站变成唯一生产路径。

因此需要区分两个容易混淆的“模型网关”概念：

```text
企业模型网关平台
= 模型报备、上游 Credential 配置、Key 签发和请求中转平台

RoboThree Model Invocation Gateway
= RoboThree 内部通用、安全、可恢复的模型调用入口
```

RoboThree 建设后者，并消费前者提供的地址与 Key，但不复制前者的产品和运营
能力。

## 2. 决策摘要

RoboThree 同时支持两种 Model Connection Mode：

```text
direct_provider
RoboThree → 模型厂商

custom_relay
RoboThree → 企业模型网关/可信中转站 → 模型厂商
```

两种 Connection Mode 复用同一套：

- Model Invocation Contract；
- 幂等、状态、取消、超时与恢复语义；
- Anthropic-compatible / OpenAI-compatible Protocol Adapter；
- Credential 隔离；
- Streaming、安全上限、Trace 与日志脱敏；
- Task Model Lock 与 configuration revision。

连接来源不得演化为两个 Agent Runtime、两套 Model Contract 或两套状态机。

## 3. 职责边界

### 3.1 RoboThree 保留

- 厂商直连；
- 企业中转站和自定义可信 Relay；
- Anthropic-compatible 与 OpenAI-compatible；
- 管理员配置 Model、协议、Base URL、上游 Model ID 和 Credential；
- Model 连通性测试；
- Agent 默认 Model、用户可切换范围和 Task Model Lock；
- Model Invocation 幂等、状态、Streaming、取消、恢复与最小审计；
- Credential 的安全保存、替换、解析和删除；
- Endpoint 安全校验及运行时失败关闭。

### 3.2 RoboThree 不建设

- 企业级模型报备和发布审批平台；
- 为其他系统签发 Relay API Key；
- 模型厂商账号集中运营；
- 通用聚合路由、自动选模或失败自动换模；
- 复杂限流、配额、计费、成本中心和运营报表；
- 模型 Marketplace；
- 与现有企业模型网关平台重复的运维控制台。

外部模型网关平台只是一种 `custom_relay` 实现来源，不进入 RoboThree Agent
或 Capability 统一资源模型。

## 4. Model Endpoint Binding

Central Service 内部建立版本化 `ModelEndpointBinding`：

```text
ModelEndpointBinding
├── bindingId
├── revision
├── modelId
├── modelRevision
├── connectionMode
│   ├── direct_provider
│   └── custom_relay
├── protocol
│   ├── anthropic_compatible
│   └── openai_compatible
├── baseUrl
├── upstreamModelId
├── credentialReference
├── capabilityProfileRevision
├── timeoutProfileRevision
└── enabled
```

其中：

- `capabilityProfileRevision` 指向不可变的 Model 能力事实，包括 Streaming、
  Tool Calling、Context Window 和协议能力限制；它不承载运行时健康状态；
- `timeoutProfileRevision` 指向 Central server-owned 的有界时间策略，包括
  Provider request deadline、stream idle、lease 与 recovery query 上限；
- 两个 Profile 都由 Central 配置所有，使用精确 revision 解析；字段级配置在
  CGF-2A.2 Development policy 中冻结，不进入公共 Model Invocation Request。

### 4.1 所有权

- `ModelEndpointBinding` 属于 Central 内部配置和运行时；
- Desktop、Local Core 和公共 Model Invocation Request 不提交 `baseUrl`、
  `credentialReference` 或 Connection Mode；
- Local Core 只提交已锁定的 Model ID/revision、configuration revision 与
  runtime generation；
- Central 根据精确 revision 解析 Binding；
- Task/Invocation 不锁定连接实例、HTTP Client、PID 或明文 Credential。

### 4.2 恢复

运行中的 Invocation 必须能够按锁定的 Model/configuration revision 恢复原
Binding。Alpha/MVP 固定选择：

> **保留不可变的旧 ModelEndpointBinding revision，不把 Base URL、
> credentialReference 或等价连接字段物化进 Model Invocation。**

恢复流程使用：

```text
modelId
+ modelRevision
+ configurationRevision
+ dispatch decision 中的 binding revision/digest
→ 精确解析历史 ModelEndpointBinding
```

旧 Binding revision 使用 append-only/immutable 语义：

- 更新连接配置必须创建新 revision；
- disable、revoke、Credential/health 实时状态只能收窄可执行性；
- 存在非终态 Invocation 引用时禁止物理删除；
- 自动 GC、历史压缩和破坏性清理不在 CGF-2 Foundation 范围；
- Binding 历史持久化属于后续版本化 Central 配置表，不修改已经关闭的
  CGF-2A.1 v0007 Model Invocation 四表。

禁止：

- 配置更新后让运行中的 Invocation 静默改用新 Base URL；
- 直连失败后静默切换企业中转站；
- 中转站失败后静默改为厂商直连；
- 在同一 Invocation 中自动切换 Anthropic/OpenAI 协议；
- 用当前最新 Binding 恢复旧 Invocation。

未来若支持 failover，必须另立 ADR，预先锁定候选 Binding，并产生完整事件与
审计。

## 5. Protocol Adapter

Adapter 按协议划分，不按每个厂商或中转站复制：

```text
Provider-neutral Model Port
├── AnthropicCompatibleModelProviderAdapter
└── OpenAiCompatibleModelProviderAdapter
```

`direct_provider` 与 `custom_relay` 只改变 Endpoint Binding，不改变上层 Port。

可以提供 DeepSeek、OpenAI、Anthropic 等配置模板，但模板只负责建议：

- 默认 Base URL；
- 推荐协议；
- Model ID 填写提示；
- 已知能力声明。

模板不得在 Application Runtime 中形成厂商特有分支。真实能力以配置、
Conformance 与实际 Endpoint 返回为准。

## 6. Credential

管理员可以在 RoboThree Admin Model 页面输入：

- 厂商直接签发的 API Key；或
- 企业模型网关/中转站重新签发的 API Key。

两者使用同一安全流程：

```text
Admin 提交 Key
→ Central Credential API
→ Enterprise Secret Store
→ 生成 opaque credentialReference
→ ModelEndpointBinding 只保存 Reference
```

约束：

- 明文 Key 不进入普通业务数据库；
- 不进入 Configuration Snapshot、Model Descriptor、Task Lock、
  Model Invocation、Event、Outbox、日志、Trace、Fixture 或 QA evidence；
- Controller 不回显明文 Key；
- 替换 Key 生成新的 Credential revision/reference；
- `EnterpriseCredentialStore`、Personal Credential Store 继续保持隔离；
- Development Profile 可以使用受控 Development Credential Adapter，但
  Production 必须使用正式 Secret Store 并失败关闭。

## 7. Endpoint 安全

`baseUrl` 只能来自管理员创建且已激活的 `ModelEndpointBinding`，不得来自：

- Desktop 单次请求；
- Local Core Model Invocation Body；
- Prompt、Skill、Tool 或 Knowledge；
- Provider 返回值；
- HTTP redirect。

最低安全约束：

1. 默认只允许 HTTPS；
2. redirect 使用 `manual` 并失败关闭；
3. 协议、Host、Port 和 Path 经过规范化校验；
4. 公网厂商地址使用显式 allowlist 或已批准模板；
5. 企业内网 Relay 可以配置，但必须由管理员显式登记；
6. 防止 localhost、link-local、metadata service 和未批准地址被当作公网
   Provider 使用；
7. DNS 解析、代理和私有网络策略不得绕过已批准 Endpoint；
8. 请求、响应、SSE frame、header、timeout 和连接数保持有界；
9. 日志只记录 binding/model digest、status、duration 和 typed error；
10. 连通性测试不得返回或记录 Credential。

本补充稿不建设通用网络 Policy Engine；上述规则由固定校验和受控配置实现。

## 8. 配置与未来 Admin 产品界面

本节描述后续 Admin Model 配置能力，不是 CGF-2A.2、2A.3 或 CGF-2B
Foundation 的关闭门槛。Foundation 阶段可以使用受控、版本化的
Development/Test Binding Seed 验证相同 Runtime；正式 Admin 页面在 Gateway
Foundation 稳定后单独规划，不据此提前开发 UI。

RoboThree Admin Model 页面至少支持：

- Connection Mode：厂商直连 / 自定义中转站；
- Protocol：Anthropic-compatible / OpenAI-compatible；
- Base URL；
- Upstream Model ID；
- API Key；
- 能力声明；
- 启用状态；
- 连通性测试。

系统内部生成和管理：

- `credentialReference`；
- Binding ID/revision；
- capability/timeout profile revision；
- 配置 digest。

管理员不直接填写 `credentialReference`。

RoboThree 不要求从企业模型网关自动同步全部已报备模型。MVP 可以由管理员把
模型网关生成的地址、Key 和 Model ID 手工配置到 RoboThree。未来若增加同步，
必须使用独立 Adapter，不改变 Model Invocation Runtime。

## 9. 对当前 CGF-2 的影响

### 9.1 无需返工

`CGF-2.0` 保持：

- Provider-neutral Contract；
- 七状态；
- accept/status/cancel/SSE；
- durable/ephemeral 分离；
- Anthropic/OpenAI-compatible 边界；
- Credential/Provider endpoint 禁入公共 Contract。

`CGF-2A.1` 保持：

- PostgreSQL v0007；
- Model Invocation、Event、Lease、Audit Outbox；
- model/config/runtime generation 精确 revision；
- InMemory/MyBatis Persistence Conformance；
- Prompt、输出、token delta 与 Credential 禁入。

本补充稿不要求修改 v0007 Schema。

### 9.2 后续修订

`CGF-2A.2`：

- Runtime 通过类型化 Resolver 获得精确 Binding；
- dispatch decision 绑定 Binding revision/digest，但不保存 Base URL 或 Key；
- restart/recovery 使用原 Binding revision；
- 禁止静默更换直连/Relay/Protocol。

`CGF-2A.3`：

- 双 JVM Harness 继续验证幂等、lease、fencing、status 和 SSE reconnect；
- Binding 使用 test-only Fake Endpoint，不要求真实厂商或 Relay。

`CGF-2B`：

- `DevelopmentModelCredentialSource` 泛化为类型化 Model Credential
  Resolver/Secret Store Adapter；
- DeepSeek 官方 Endpoint 作为第一条真实厂商直连验证；
- 企业模型网关地址作为第二条真实 `custom_relay` 验证；
- 两条链路复用相同 Invocation Runtime；
- 两套协议 Adapter 都必须通过 Stub Conformance；
- Foundation 不要求四种“Connection Mode × Protocol”组合全部真实联网。

`CGF-2C`：

- Desktop 仍只感知 Model、Task 和 Invocation 状态；
- Desktop 不感知 Key、Base URL 或 Credential Reference；
- 用户外发确认与直连/Relay 使用同一语义。

## 10. 最小验收矩阵

| 场景 | 最低要求 |
| --- | --- |
| 厂商直连 | DeepSeek 或另一个获准厂商真实文本 Streaming PASS |
| 企业中转站 | 企业网关签发的新 Base URL + Key 真实文本 Streaming PASS |
| Protocol | Anthropic/OpenAI 两个 Adapter 的独立 Stub Conformance PASS |
| Runtime | 两条真实链路复用同一 Invocation、状态、取消和错误收敛 |
| Lock | 运行中修改 Binding 不影响旧 Invocation |
| Credential | Key 动态扫描 0 泄漏 |
| Endpoint | per-request URL、redirect、未批准地址失败关闭 |
| Recovery | 网络中断按可信 status/query/idempotency 能力恢复，否则 uncertain |
| No failover | 直连与 Relay 之间不静默切换 |

两条真实链路必须满足：

```text
不同 connectionMode
+ 不同 bindingId/revision/digest
+ 不同规范化 Base URL
+ 不同 credentialReference
+ 各自唯一 synthetic canary
```

`upstreamModelId` 可以不同，也允许相同。部分企业中转站会原样保留厂商 Model
ID；强制使用不同 ID 不能证明连接路径不同，反而可能制造不真实的验收配置。
Connection Mode 的有效验证以 Binding、Endpoint、Credential 和实际请求证据
不同为准。

## 11. 非目标

本补充稿不要求：

- 自动从企业模型网关导入模型；
- 自动同步模型报备状态；
- RoboThree 签发 Relay Key；
- 四种 Connection Mode/Protocol 组合全部真实联网；
- 多 Endpoint 负载均衡；
- 多 Provider 智能路由；
- 自动 failover；
- 模型成本、计费和配额平台；
- 企业网关运营后台。

## 12. 接受处置

用户接受本补充修订后：

1. 本 ADR 状态改为 `ACCEPTED`；
2. ADR-015 顶部增加已接受补充回链；
3. CGF-2 Development Plan 的 CGF-2A.2、2B 和验收矩阵按本决策修订；
4. 冻结 `ModelEndpointBinding`、Credential Resolver 与 Endpoint Validator
   的所有权，不提前冻结字段级 HTTP API；
5. 修订计划完成评审和用户确认；
6. 用户明确授权后，才进入 CGF-2A.2。

## 13. 已确认事项

用户已确认：

1. 是否接受厂商直连与企业中转站作为同等级正式 Connection Mode；
2. 是否接受 Protocol Adapter 与 Connection Mode 正交；
3. 是否接受 `ModelEndpointBinding` 仅在 Central 内部存在；
4. 是否接受 Base URL 只能由管理员配置，不能随 Invocation 提交；
5. 是否接受直连与 Relay 之间禁止静默 failover；
6. 是否接受 MVP 由管理员手工配置企业网关生成的地址、Key 和 Model ID；
7. 是否接受 Foundation 真实验收为“一条厂商直连 + 一条企业中转站”，而不是
   四种组合全部真实联网。

## 14. Claude Code 首轮评审修订映射

| 评审项 | 修订 | 状态 |
| --- | --- | --- |
| P2-1 旧 Binding 保留路径存在“或”歧义 | §4.2 固定选择不可变历史 revision 保留；不向 Invocation 物化 Endpoint/Credential；非终态引用阻止物理删除 | CLOSED |
| P2-2 两条真实链路可能指向同一厂商 | §10 要求不同 Connection Mode、Binding、Base URL、Credential 和 canary；允许 Relay 原样保留 upstream Model ID | CLOSED |
| P3-1 Admin 页面可能扩大 Foundation | §8 明确 Admin UI 后置，Foundation 使用受控版本化 Seed，不以页面为关闭门槛 | CLOSED |
| P3-2 capability/timeout Profile 语义未展开 | §4 明确两个 Profile 的内容、所有权、revision 与公共 Contract 边界 | CLOSED |

本轮修订没有改变：

- CGF-2.0 和 CGF-2A.1 已关闭事实；
- v0007 Schema；
- Provider-neutral Model Invocation Contract；
- CGF-2A.2、2A.3、2B、2C 的 `GATED` 状态。

Claude Code 修订版复核确认全部四项关闭，`P0/P1/P2/P3=0`。用户于
2026-07-30 正式接受本补充修订。该接受不自动解锁 CGF-2A.2。
