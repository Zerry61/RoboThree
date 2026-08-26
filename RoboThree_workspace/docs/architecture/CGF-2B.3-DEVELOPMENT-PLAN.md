# RoboThree CGF-2B.3 企业中转站与双节点真实边界开发计划

> 阶段：`CGF-2B.3 — Custom Relay and Dual-node Recovery Conformance`  
> 状态：**CONFIRMED / CGF-2B.3.1 REPAIR.1 PASS/CLOSED /
> PUBLIC CUSTOM RELAY CONFORMANCE PASS /
> ENTERPRISE RELAY CONFORMANCE MOVED TO ENTERPRISE INTEGRATION /
> CGF-2B.3.2 PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED；
> CGF-2B.3.3 repair.1、CGF-2B.3.3、CGF-2B.3、CGF-2B
> PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED；2C GATED**  
> 日期：2026-08-01  
> 首轮评审：Claude Code `P0=0 / P1=0 / P2=2 / P3=3`；MiniMax PM
> 补充已核对  
> 修订状态：2 项 P2 与 3 项 P3 已由 Claude Code 复核全部关闭，
> `P0～P3=0`；用户已确认计划并授权 CGF-2B.3.1  
> 前置状态：CGF-2.0、CGF-2A、CGF-2B.1、CGF-2B.2 均
> `PASS/CLOSED`  
> 上位决策：ADR-015、ADR-015 补充修订 A、ADR-016、CGF-2 Development
> Plan  
> 上游登记：复用 [AR-049、AR-051、AR-052、AR-053](./UPSTREAM-ADOPTION-REGISTER.md)，
> 实现事实登记为 AR-054；不复制第三方源码  
> 后续门槛：CGF-2C 继续 `GATED`，不因本计划评审或 B.3 完成而自动解锁

## 1. 阶段目标

CGF-2B.3 只验证 RoboThree 已有 Model Invocation Runtime 能通过一个精确、
不可变的 `custom_relay` Binding 调用获准中转站，并在 Central 双节点故障下
按既有 durable state、lease 和 fencing 语义安全恢复。Foundation 可用获准
公网 Custom Relay 验证通用连接边界；企业内网目标的环境组合验收属于后置
Enterprise Integration。

```text
fixed synthetic provider-neutral request
→ durable Model Invocation
→ exact custom_relay Binding revision
→ existing Provider-backed Runtime Bridge
→ existing Anthropic/OpenAI-compatible Adapter
→ authorized HTTP/SSE Transport
→ approved custom relay
→ ephemeral text delta
→ durable usage / terminal status
```

本阶段不建设模型报备、Key 签发、聚合路由或运营管理平台。企业模型网关只被
视为 RoboThree 的一种外部 `custom_relay` 连接目标。

## 2. 允许形成的结论

CGF-2B.3 通过后只能声明：

```text
CUSTOM_RELAY_DEVELOPMENT_CONFORMANCE_PASS
MODEL_INVOCATION_DUAL_NODE_RECOVERY_PASS
```

不得声明：

- 企业模型网关平台由 RoboThree 建成；
- 正式 OA/CAS、MDM、RBAC、MaaS 或生产 Secret Store 已接入；
- 任意企业内网 Endpoint 都已被允许；
- 所有中转站、所有模型或两个协议都已完成真实联网验证；
- 直连与中转站可以自动切换；
- Desktop 用户正文已经可以外发；
- CGF-2B、CGF-2 或企业试点已经整体完成。

## 3. 已关闭事实与本批缺口

### 3.1 直接复用

| 已关闭能力 | 来源 | B.3 处理 |
| --- | --- | --- |
| Model Invocation 七状态、幂等、Durable Event | CGF-2.0 / 2A | 不修改 |
| PostgreSQL v0007、MyBatis Persistence | CGF-2A.1 | 不修改 |
| Binding revision/digest、实时收窄 | CGF-2A.2 | 直接复用 |
| accepted → running → terminal、lease/fencing | CGF-2A.2 | 直接复用 |
| 双 Java PID、共享 PostgreSQL、故障注入基础 | CGF-2A.3 | 扩展为真实 Adapter/Transport 边界 |
| Provider-neutral Runtime Bridge | CGF-2B.2 | 不复制第二套 Runtime |
| Anthropic/OpenAI-compatible Adapter | CGF-2B.1/2 | 按锁定 Protocol 复用 |
| Credential Source、Endpoint Policy、SSE 上限 | CGF-2B.1/2 | 不绕过、不放宽 |
| 厂商直连真实 Harness | CGF-2B.2 | 保留全量回归，使用不同资源和 canary |

### 3.2 必须补齐

1. 让现有 Provider-backed Backend 接受精确锁定的 `CUSTOM_RELAY`，同时保留
   对未知或漂移连接事实的失败关闭；
2. 补齐 Central 内部 `upstreamModelId` 映射，使 RoboThree Model ID 与中转站
   实际请求 Model ID 可以相同或不同；
3. 建立一条独立、版本化、测试专用的 `custom_relay` Binding；
4. 建立真实 Custom Relay opt-in Harness；
5. 建立两个真实 Central Java PID + 共享 PostgreSQL + 受控进程外 Relay 的
   双节点恢复 Harness；
6. 验证 crash takeover、stale fencing、durable reconnect、cancel race、
   `uncertain` 和资源归零；
7. 对 Key、synthetic canary、Prompt、输出和 Relay 响应执行四通道泄漏扫描。

## 4. 范围与非目标

### 4.1 本阶段范围

- Central Java Model Gateway；
- Development/Test `custom_relay` Binding Seed；
- Central 内部 Binding / Provider Request 映射；
- 真实 Custom Relay 文本 Streaming Conformance；
- 测试专用双节点、进程外受控 Relay 和故障注入 Harness；
- 既有 Contract、Persistence、Provider Adapter 和 direct-provider 回归。

### 4.2 明确非目标

- Desktop、Local Core、Renderer、用户正文或用户确认；
- Admin Console 或 Model 配置页面；
- 企业模型报备、审批、Key 签发、计费、配额和运营报表；
- 自动导入企业网关模型；
- 自动选模、自动协议探测、自动 Binding 切换或自动 failover；
- 真实 OA/CAS、MDM、RBAC、MaaS、企业 Secret Store；
- 生产内网访问策略、企业 CA 或通用网络 Policy Engine；
- Tool Calling、图像、音频、Batch 或 Responses API；
- 新的公共 Model Invocation 状态或新的公共 HTTP Route；
- 修改 PostgreSQL v0007 或历史 SQL；
- CGF-2C、ADR-017 实现或 Desktop 联合 E2E。

## 5. 核心架构决策

### 5.1 Connection Mode 与 Protocol 保持正交

```text
Connection Mode
├── DIRECT_PROVIDER
└── CUSTOM_RELAY

Protocol
├── ANTHROPIC_COMPATIBLE
└── OPENAI_COMPATIBLE
```

`ProviderBackedModelInvocationExecutionBackend` 不再把
`DIRECT_PROVIDER` 当作唯一允许值，但也不得按 URL、厂商名或响应 Header 猜测
Connection Mode。Backend 只接受已经由 Runtime 精确解析、校验和锁定的已知
Binding；Adapter 仍只按 Binding 的 `protocol` 解析。

禁止建立 `EnterpriseRelayModelProviderAdapter` 之类按连接来源复制的第三套
协议 Adapter。

### 5.2 `upstreamModelId` 是 Central 内部 Binding 事实

ADR-015 补充修订 A 已允许 RoboThree Model ID 与上游 Model ID 相同或不同。
B.3 冻结：

- `modelId` 继续表示 Local Core/Task 锁定的 RoboThree Model；
- `upstreamModelId` 表示 Provider 或 Relay Wire Request 中的 Model；
- 两者都属于不可变 Binding revision；
- Runtime 仍校验 provider-neutral request 中的 `modelId` 与锁定 Model 一致；
- Adapter 构造 Wire Request 时使用 Binding 的 `upstreamModelId`；
- Adapter 内部 Wire Request 构造会把 `model` body 字段从 request document 的
  `modelId` 改为 `ModelProviderRequest.binding().upstreamModelId()`；该变化只在
  Adapter 内部签名和映射生效，不改变 provider-neutral request；
- `upstreamModelId` 不进入公共 Invocation Request、Desktop Projection、日志、
  Trace 或 Credential Contract；
- direct-provider 全量回归保留 `modelId == upstreamModelId` 的配置，证明该内部
  映射不改变已关闭的厂商直连行为。

该调整只作用于 Central 内部 Domain/Adapter/Test Seed，不修改 Enterprise
Gateway 公共 Schema、PostgreSQL v0007 或 Local Core Contract。

### 5.3 企业中转站 Binding

B.3 使用一条测试专用、不可变的 Binding：

```text
connectionMode = CUSTOM_RELAY
protocol       = ANTHROPIC_COMPATIBLE | OPENAI_COMPATIBLE
endpoint       = approved relay Base URL
modelId        = locked RoboThree Model ID
upstreamModelId= relay accepted Model ID
credentialRef  = opaque development reference
recoveryMode   = MANUAL_RECONCILIATION
```

它必须与 B.2 厂商直连事实满足：

```text
不同 connectionMode
+ 不同 bindingId/revision/digest
+ 不同规范化 Base URL
+ 不同 credentialReference/revision
+ 不同 synthetic canary
```

`upstreamModelId` 允许相同，也允许不同。Connection Mode 的有效证明不依赖
人为制造不同的 Model ID。

### 5.4 Endpoint 与网络边界

- Base URL 只能来自版本化 Test Binding，不得来自 Invocation、Prompt 或
  Provider 响应；
- 默认只允许 HTTPS，redirect 继续 `NEVER` 并失败关闭；
- Host 必须精确 allowlist，Path 继续由协议 Adapter 的固定相对路由生成；
- `CUSTOM_RELAY` allowlist 必须从版本化 Relay Test Binding Seed 派生；它与
  direct-provider Binding 使用独立的 `StrictModelOutboundEndpointPolicy`
  实例，两套 Host 集合不得预先合并或交叉污染；
- per-request URL、userinfo、query、fragment、路径越界和 DNS 漂移失败关闭；
- 公网 Relay 必须继续满足既有 restricted-address 防护；
- 双节点 Harness 的 loopback HTTP 只能通过显式 test-only policy 启用；
- 如果企业 Relay 只能通过私网、企业 CA 或特殊代理访问，Enterprise
  Integration 维持 `GATED`，不得为了通过测试放宽生产 SSRF 边界。正式私网
  egress、CA 和代理策略只在 Enterprise Integration 中验证。

### 5.5 Credential 边界

真实 Relay Key 只能由 Harness 子进程的受控环境变量或 Test Credential Adapter
解析：

- 不写入命令行参数、源码、Markdown、讨论区、Binding、数据库或报告；
- 不回显，不记录长度、前后缀或 hash；
- 解析后使用独立 `char[]`，授权 Header 构造后清零；
- 缺失、空值、revision 不匹配或格式非法时，HTTP 请求前失败关闭；
- Production Profile 检测到 Development Credential Source 继续拒绝启动；
- 默认 `check:central`、`check:central:offline` 和 `pnpm run check` 不读取真实
  Key，也不访问网络。

### 5.6 真实 Custom Relay Harness

新增独立 opt-in 命令：

```text
pnpm run check:cgf2b3:custom-relay
```

资源不完整时必须输出结构化 `RESOURCE_GATED` 并保证零网络调用。资源完整时至少
验证：

1. 正常文本 Streaming；
2. `deltaCount >= 1`，单 delta 时记录合法聚合证据；
3. usage 和 finish reason；
4. 非法 Credential → 确定性 `failed`；
5. 取消 → `cancelled`；
6. Deadline → `timed_out`；
7. Key、canary、Prompt、输出和响应正文泄漏 0；
8. `CUSTOM_RELAY` Binding 和实际 Relay 连接事实一致；
9. 不触发 direct-provider 或另一 Protocol 的静默 fallback。

真实 Harness 只使用固定 synthetic 非敏感内容，不接收 Desktop 用户输入。
真实 Custom Relay 若实际返回空字符串、纯空白或缺失 `content` 的角色/元数据帧，
Harness 必须证明它们不会触发 `TextDelta` 构造异常。由于外部 Relay 不保证主动
生成指定异常帧，Stub 与 B.3.2 受控进程外 Relay 必须确定性覆盖 null、空字符串、
纯空白和缺失 `content` 四类 repair.2 回归；不得拿一次外部正常响应替代这些
受控验证。

### 5.7 双节点真实边界 Harness

双节点恢复不能依赖外部企业 Relay 提供故障注入能力。B.3 建立测试专用受控
进程外 Relay，以真实 HTTP/SSE、真实协议 Adapter 和真实 Transport 验证边界：

```text
Central Java PID A ─┐
                    ├─ shared PostgreSQL 16
Central Java PID B ─┘
        │
        └─ controlled out-of-process Relay
           random loopback port / request counter / bounded SSE
```

要求：

- A、B 是独立 Java PID、随机端口、独立 Hikari Pool；
- Relay 是独立进程或等价的独立网络边界，不与 Central 共享业务对象；
- 两节点共享 PostgreSQL 作为唯一 durable 事实源；
- 所有故障控制 API、test loopback policy 和请求计数器只存在于 test scope；
- Provider-backed Backend、Adapter、HTTP Transport、SSE Parser 必须走生产实现；
- 不允许用 scripted Fake Backend 替代 Provider 边界。

### 5.8 Recovery 与 `uncertain`

Foundation 的真实 `custom_relay` Binding 固定使用
`MANUAL_RECONCILIATION`，除非未来独立 Conformance 证明 Relay 具有可靠的
幂等提交或可查询 Invocation 状态。

双节点矩阵至少验证：

1. `accepted` 且尚未持久化 dispatch decision 时，另一节点可以安全开始一次
   执行；
2. `running` 已持久化后节点崩溃，lease 到期只允许新节点接管，不代表可以
   重发 Provider 请求；
3. 无可信远端 status/evidence 时，新节点提交唯一 durable `uncertain`；
4. 中途 Streaming 后崩溃不得把已见 delta 当作可信 terminal；
5. 旧 fencing epoch 的迟到 Result 必须被拒绝；
6. cancel 与 terminal 竞争只允许一个 durable 终态；
7. durable SSE 可在另一节点按 cursor 重连，ephemeral delta 不承诺重放；
8. lease 到期本身不直接等于 `uncertain`，必须经过 takeover 和 recovery policy；
9. 任何恢复路径都不得从 `CUSTOM_RELAY` 静默切换为 `DIRECT_PROVIDER`。

RoboThree 继续不宣称 Provider 调用通用 exactly-once。
如果未来 Relay 提供可验证的幂等提交 proof，或提供基于 Invocation UUID 的可信
status 查询端点，启用 `IDEMPOTENT_RETRY`、`QUERY_THEN_RETRY` 或新增恢复能力前
必须单独进行 ADR、能力 Contract 和真实 Conformance 评审；B.3 不连带建设 Relay
状态路由、幂等协议或新的 RecoveryMode。

### 5.9 Binding revision 隔离

Harness 必须同时保留 Relay Binding v1 和 v2：

- 新 Invocation 使用当前选择解析到 v2；
- v1 已运行 Invocation 继续按持久 dispatch decision 精确解析 v1；
- v1 的 Endpoint、Credential、Protocol、Connection Mode 或
  `upstreamModelId` 不得被 v2 静默替换；
- v1 不可解析时失败关闭，不 fallback 到 v2 或 direct-provider；
- 本批不建设历史 Binding 自动 GC。

### 5.10 数据与证据安全

真实 Harness 为每次运行生成唯一 synthetic canary。自动扫描：

1. 应用日志；
2. 捕获的 Trace Export；
3. 测试 stdout/stderr；
4. QA evidence。

禁止出现：

- API Key、Bearer、Credential material；
- canary 及其 Base64/URL 编码；
- Prompt、输出、Provider/Relay 完整响应；
- Endpoint 完整 URL；
- 用户消息、Skill、Knowledge、Tool 参数或 Tool Result。

报告只允许：

```text
count
digest
status
duration
typed error code
resource metrics
binding/endpoint opaque digest
```

## 6. 内部分批

### 6.1 CGF-2B.3.1：Custom Relay Binding 与真实 Conformance

首个开发版本固定为：

```text
0.0.0-cgf.2b.3.1
```

交付：

- `CUSTOM_RELAY` 进入既有 Provider-backed Backend 的显式允许路径；
- Central 内部 `upstreamModelId` 映射；
- 不同于 direct-provider 的版本化 Relay Binding Seed；
- `check:cgf2b3:custom-relay` 资源门槛与真实 Harness；
- Streaming、非法 Credential、取消、Deadline、零泄漏；
- direct-provider repair.2 与双协议 Stub 全量回归；
- Architecture Guard：无公共 Contract、v0007、Controller、Desktop 或自动
  failover 漂移。

退出门槛：

```text
Public Custom Relay Conformance PASS
AND default no-network gates PASS
AND Claude Code independent QA PASS
AND 用户接受
```

Foundation 真实资源未到位时只能形成 `RESOURCE_GATED`，不得关闭 B.3.1。
企业内网路由、CA/代理、CAS/RBAC、企业 Credential/审计和生产 Secret Store
不再作为 B.3.1 退出条件，统一进入后置 `Enterprise Integration` 门槛。

### 6.2 CGF-2B.3.2：双 JVM Relay Recovery

详细方案见
[CGF-2B.3.2 双 JVM Relay Recovery 开发计划](./CGF-2B.3.2-DEVELOPMENT-PLAN.md)。
在该文档完成评审、P0/P1 关闭并获得用户明确授权前，本批继续 `GATED`。

交付：

- 两个独立 Central Java PID；
- 共享 PostgreSQL 16；
- 独立进程外受控 Relay；
- Provider-backed Runtime/Adapter/Transport 的真实网络执行；
- crash takeover、manual reconciliation、`uncertain`、stale fencing；
- cancel/terminal 单终态；
- durable SSE 跨节点 reconnect；
- Binding v1/v2 精确恢复；
- 测试控制面与生产装配隔离。

退出门槛：

```text
双 JVM完整矩阵实际执行 PASS
AND no duplicate external POST where retry is forbidden
AND Claude Code independent QA PASS
AND 用户接受
```

### 6.3 CGF-2B.3.3：安全、资源与阶段收口

详细计划见
[CGF-2B.3.3 安全、资源与阶段收口开发计划](./CGF-2B.3.3-DEVELOPMENT-PLAN.md)。
用户已接受文档评审结论并授权编码；repair.1 已通过独立 QA 并由用户正式接受，
B.3.3、B.3 与 B 已依序关闭。

交付：

- per-request URL、redirect、未批准 Endpoint、Credential 漂移和 silent
  failover 负向矩阵；
- Provider/Relay 断流、malformed SSE、oversize、连接重置和超时矩阵；
- 日志、Trace、测试输出、QA evidence 四通道动态扫描；
- 多轮 Java PID/Relay PID 启停；
- 端口、Hikari 连接、lease、subscriber、buffer 和子进程归零；
- Central online/offline、Workspace 与 direct-provider 完整回归；
- CGF-2B 阶段结论和后续门槛收口。

退出门槛：

```text
B.3.1 PASS/CLOSED
AND B.3.2 PASS/CLOSED
AND complete B.3 Harness independently rerun
AND P0=0 / P1=0
AND 用户接受
```

CGF-2B.3 或 CGF-2B 的关闭不自动解锁 CGF-2C。

## 7. 预计修改边界

### 7.1 允许修改

```text
services/central-service/src/main/java/com/robothree/central/modelgateway/**
services/central-service/src/test/java/com/robothree/central/modelgateway/**
services/central-service/src/test/java/com/robothree/central/architecture/**
scripts/run-cgf2b3-custom-relay.mjs
package.json
docs/architecture/CGF-2B.3-DEVELOPMENT-PLAN.md
docs/architecture/CGF-2-DEVELOPMENT-PLAN.md
docs/architecture/UPSTREAM-ADOPTION-REGISTER.md
docs/development/DEVELOPMENT-LOG.md
docs/architecture/KEY-NODES.md
README.md
CHANGELOG.md
```

每个有效编码批次按仓库规则升级开发版本、记录 Development Log、Changelog
和下一个可用 Key Node。

### 7.2 默认禁止修改

```text
contracts/enterprise-gateway/**
packages/contracts/**
services/core/**
apps/desktop/**
services/central-service/deploy/sql/postgresql/v0007_*.sql
既有 v0001～v0007 manifest/checksum
```

如实现发现必须修改公共 Contract、PostgreSQL Schema 或 Local Core，本批立即
停止并回到架构评审，不以“顺手补字段”扩大范围。

## 8. 自动化验证矩阵

| 类别 | 必须验证 |
| --- | --- |
| Binding | Connection Mode、Protocol、revision/digest、upstreamModelId 精确锁定 |
| Runtime | accepted/running/terminal、单写者、Binding v1/v2、no failover |
| Adapter | Anthropic/OpenAI Stub、真实 Relay 所选协议、blank/private frame 回归 |
| Transport | HTTPS、allowlist、redirect、route、header、UTF-8、size、timeout/cancel |
| Credential | 缺失、非法、错误 revision、清零、Production fail-closed |
| Real Relay | Streaming、usage、finish reason、invalid key、cancel、deadline |
| Recovery | before dispatch、after dispatch、mid-stream crash、takeover、uncertain |
| Concurrency | stale epoch、cancel/terminal race、单 durable terminal |
| SSE | durable cursor 跨节点恢复、ephemeral 不重放 |
| Security | Key/canary/正文/URL 四通道零泄漏 |
| Resources | PID、端口、连接池、lease、subscriber、buffer、descendant 归零 |
| Regression | Central online/offline、Workspace、B.1/B.2/direct-provider |

独立 QA 必须实际重跑真实 Relay Harness 和双 JVM Harness。开发者历史报告、
digest、Stub 或单元测试不能替代执行。

## 9. 测试资源门槛

开始 B.3.1 真实 Harness 前必须具备：

| 资源 | Owner | 规则 |
| --- | --- | --- |
| Relay Base URL | 用户/企业模型网关负责人 | 只进入受控测试环境 |
| Relay Protocol | 用户/平台负责人 | 明确 Anthropic 或 OpenAI compatible |
| upstream Model ID | 用户/平台负责人 | 可以与 RoboThree Model ID 相同 |
| 新的受限 API Key | 用户/平台负责人 | 不进入聊天、文档、源码或报告 |
| 公网测试网络 | 用户/本机 | 不通过放宽 SSRF 临时绕过 |
| 测试额度 | 用户 | 只使用固定 synthetic 内容 |
| 允许的测试时段 | 用户/平台负责人 | 避免影响共享网关容量 |

如果 Foundation 资源不完整，允许先完成文档、默认门禁和受控 Relay Harness，
但 B.3.1、B.3 和 CGF-2B 均不得声明关闭。企业内网 Base URL、企业 CA/代理、
CAS/RBAC、企业 Credential/审计和生产 Secret Store 不属于本表的 Foundation
关闭资源，统一在 `Enterprise Integration` 阶段单独提供和验收。

## 10. 上游借鉴与不照搬

本阶段不自创新的 Agent Runtime，也不复制第三方源码：

| 来源 | 借鉴 | RoboThree 处理 |
| --- | --- | --- |
| Open WebUI | Provider Gateway 与上层业务责任分离 | Relay 只作为 Binding 来源，不建设运营平台 |
| OpenHands | 稳定执行事实与 transient stream 分离 | PostgreSQL durable facts + bounded ephemeral delta |
| OpenClaw | Gateway fail-closed、Credential 不泄漏、连接生命周期有界 | 固定 Endpoint、无 redirect、无静默 fallback、资源归零 |
| LangGraph | durable checkpoint/replay 与 Conformance 纪律 | 双 JVM status-first、lease/fencing、实际重跑 |

采用方式继续为：

```text
DESIGN_ONLY + OWN_RUNTIME + OWN_HARNESS + OWN_CONFORMANCE
```

不复制上游 DTO、Provider SDK、HTTP Client、路由、数据库模型、测试 Fixture 或
恢复实现。编码后如形成新独立采用事实，使用下一个可用 AR 编号登记；否则回链
AR-049、AR-051、AR-052、AR-053。

## 11. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 中转站“兼容”协议存在私有差异 | 真实 Harness + 严格 typed failure；不猜协议 |
| Relay 私网要求与 SSRF 防护冲突 | Foundation 不放宽 SSRF；Enterprise Integration 保持 GATED 并单独决策 |
| 节点崩溃导致重复计费或重复生成 | dispatch 先持久化；manual reconciliation；不盲目重发 |
| Binding 更新影响旧 Invocation | dispatch decision 精确解析旧 revision；失败关闭 |
| Key/正文进入日志或 QA evidence | 受控注入、四通道动态扫描、报告字段白名单 |
| 双节点 Harness 仍使用 Fake Backend | 强制真实 Adapter/Transport + 进程外 Relay |
| 测试控制面进入生产 | test scope/profile Architecture Guard |
| B.3 演化成企业网关平台 | 固定非目标；只消费 Base URL/Key/Model ID |

## 12. 工期

```text
CGF-2B.3.1：2～4 个集中工程工作日
CGF-2B.3.2：3～5 个集中工程工作日
CGF-2B.3.3：2～3 个集中工程工作日
合计：7～12 个集中工程工作日
```

日历参考：资源和网络提前就绪时约 10～18 天。该日历参考不包含企业平台账号/
Key 申请、网络或 CA 等待、独立 QA、真实资源复跑和返工；不是交付承诺。

## 13. 阶段门槛

当前状态：

```text
CGF-2B.2：PASS/CLOSED
CGF-2B.3 Plan：CONFIRMED / DOCUMENT REVIEW PASS
CGF-2B.3.1 repair.1：PASS/CLOSED — PUBLIC CUSTOM RELAY CONFORMANCE PASS /
                      INDEPENDENT QA PASS / USER ACCEPTED
Enterprise Relay Conformance：MOVED TO ENTERPRISE INTEGRATION / GATED
CGF-2B.3.2：PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED
CGF-2B.3.3 repair.1：PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED
CGF-2B.3.3：PASS/CLOSED
CGF-2B.3：PASS/CLOSED
CGF-2B：PASS/CLOSED
CGF-2C：GATED
```

进入 B.3.1 必须满足：

```text
Claude Code + MiniMax document review complete
AND P0/P1 closed
AND 用户确认本计划
AND 用户明确授权 CGF-2B.3.1
```

进入 B.3.2、B.3.3 仍需上一批独立 QA 和用户逐批接受。任何文档评审、资源
提供或前一阶段关闭都不构成自动授权。

## 14. 本轮评审重点

请 Claude Code 与 MiniMax 只评审以下事项，不开始编码：

1. `CUSTOM_RELAY` 是否正确复用既有 Runtime Bridge 和双协议 Adapter；
2. `upstreamModelId` 的 Central 内部所有权是否与 ADR-015a 一致；
3. 公网 Custom Relay、企业内网 Relay 与受控进程外 Relay 的三类证据是否分工清晰；
4. `MANUAL_RECONCILIATION`、takeover、`uncertain` 和 no-retry 是否一致；
5. Binding v1/v2、Endpoint、Credential 和 no-failover 是否失败关闭；
6. 双 JVM、真实 Adapter/Transport、durable/ephemeral 是否没有被 Fake 替代；
7. Contract、v0007、Controller、Desktop 和 CGF-2C 是否保持不变；
8. 真实资源、泄漏扫描、独立 QA 和逐批用户门槛是否足够明确；
9. 分批与 7～12 个集中工程工作日估算是否合理。

评审请按 `P0 / P1 / P2 / P3` 输出，并给出每项可定位的文档修订建议。

## 15. 首轮评审修订映射

| 评审项 | 修订位置与处理 | 状态 |
| --- | --- | --- |
| P2-01 direct-provider 与 custom-relay allowlist 来源不清 | §5.4 固定从各自版本化 Test Binding Seed 派生独立 Policy 实例，不合并 Host 集合 | CLOSED / RECHECK PASS |
| P2-02 RecoveryMode 演进路径缺少边界 | §5.8 固定未来幂等 proof/status query 必须独立 ADR、Contract 和真实 Conformance，B.3 不连带建设 | CLOSED / RECHECK PASS |
| P3-01 upstreamModelId 对 Adapter 映射影响未展开 | §5.2 明确 Wire body 的 model 改取 Binding upstreamModelId，provider-neutral request 不变，直连同值回归 | CLOSED / RECHECK PASS |
| P3-02 B.3.1 版本号未约定 | §6.1 固定首个开发版本 `0.0.0-cgf.2b.3.1` | CLOSED / RECHECK PASS |
| P3-03 blank content 在真实 Relay 门槛中不明确 | §5.6 区分外部实际观察与 Stub/受控 Relay 确定性四类回归，禁止拿正常外部响应替代 | CLOSED / RECHECK PASS |

MiniMax 提到的场景优先级、前端负责人、Tool Pack、CAS、OpenWorker 并行实施和
PM 风险清单不进入本计划；它们不是 CGF-2B.3 的技术范围或编码门槛。B.3 完成
只能证明 Model Gateway Foundation 的双 Connection Mode 与恢复边界，不得称为
企业生产就绪；当前 Foundation 直接资源门槛是 §9 的获准 Custom Relay 测试
资源，企业内网 Relay 资源已后移至 Enterprise Integration。

## 16. CGF-2B.3.1 repair.1 公网中转站实跑事实

2026-08-02，用户授权使用受限、低额度的硅基流动公网资源执行
`CUSTOM_RELAY` Harness。该资源只用于验证公网中转协议链路，不代表企业内网
模型网关、企业 CA/代理、CAS/RBAC、生产 Secret Store 或企业审计验收。

首次实跑在网络调用前发现 Development Credential Source 只接受 B.2 环境
命名空间；修复后第二次实跑发现硅基流动在 OpenAI-compatible Streaming 的
每个帧中上报单调递增 usage，并在结束前重复最终值。repair.1 因此冻结：

- B.2 与 B.3 受控环境命名空间均允许，其他阶段和非受控名称继续失败关闭；
- OpenAI-compatible Adapter 暂存单调 usage，只向 Runtime 投影一次最终值；
- input/output token 任一回退以 `model_gateway.provider_usage_conflict` 拒绝；
- 相同最终 usage 重复视为幂等，不绕过 Bounded Sink 的通用重复事件护栏。

开发者实跑结果：

```text
Custom Relay Harness：PASS
text delta：167
canary observed：true
invalid credential：failed
cancel：cancelled
deadline：timed_out
Key/Endpoint/Model/canary dynamic leak scan：0
Central online：191 / 0 / 0 / 0
Central offline：191 / 0 / 0 / 0
Workspace：Architecture PASS + 107 files / 685 tests + 三项 smoke PASS
```

该结果只允许声明：

```text
PUBLIC_CUSTOM_RELAY_CONFORMANCE_PASS
```

不得声明 `ENTERPRISE_RELAY_CONFORMANCE_PASS`。Claude Code 已独立重跑
Central online/offline 各 191 项、Workspace 107/685、真实公网 Custom Relay
四场景和泄漏扫描，结论 `P0/P1/P2/P3=0`；用户已接受 repair.1 独立 QA。
因此 `PUBLIC_CUSTOM_RELAY_CONFORMANCE_PASS` 作为 Foundation 退出依据，
repair.1 与 B.3.1 正式 `PASS/CLOSED`。企业内网环境 Conformance 后移至
`Enterprise Integration`；B.3.2、B.3.3 与 CGF-2C 继续 `GATED`，不会因
B.3.1 关闭而自动解锁。

## 17. Foundation 与 Enterprise Integration 门槛修订

2026-08-02，用户接受 repair.1 独立 QA，并确认以下最小门槛调整：

```text
PUBLIC_CUSTOM_RELAY_CONFORMANCE_PASS
+ default no-network gates PASS
+ independent QA PASS
+ user acceptance
→ CGF-2B.3.1 Foundation PASS/CLOSED

enterprise private-network route / CA / proxy / CAS / RBAC /
enterprise credential / audit / production Secret Store
→ Enterprise Integration GATED
```

该调整只改变阶段验收归属，不修改 `CUSTOM_RELAY` 的运行时、Binding、Endpoint
Policy、Credential、Contract、Schema 或安全语义，也不授权 B.3.2、B.3.3、
CGF-2C 或 Enterprise Integration 编码。
