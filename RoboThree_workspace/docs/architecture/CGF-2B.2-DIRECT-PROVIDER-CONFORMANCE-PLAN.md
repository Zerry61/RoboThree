# RoboThree CGF-2B.2 厂商直连 Runtime Bridge 与真实 Provider 验证计划

> 阶段：`CGF-2B.2 — Direct Provider Runtime Bridge and Real Conformance`  
> 状态：**PASS/CLOSED — REPAIR.2 INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-07-31  
> 首轮评审：Claude Code `P0=0 / P1=0 / P2=3 / P3=2`；修订已吸收  
> 修订复核：Claude Code `P0=0 / P1=0 / P2=0 / P3=0`；用户已确认计划并
> 明确授权编码  
> 前置状态：CGF-2A、CGF-2B.1 均 `PASS/CLOSED`  
> 上位决策：ADR-015、ADR-015 补充修订 A、ADR-016、CGF-2 Development
> Plan  
> 上游登记：复用 [AR-053](./UPSTREAM-ADOPTION-REGISTER.md)，本批不新增第三方
> 源码采用  
> 后续门槛：CGF-2B.3、CGF-2C 继续 `GATED`

## 1. 本批目标

CGF-2B.2 只完成一条厂商直连的真实 Central Model Invocation 链路：

```text
fixed synthetic provider-neutral request
→ ModelInvocation durable accept
→ exact direct_provider Binding revision
→ ProviderBackedModelInvocationExecutionBackend
→ protocol-specific Adapter
→ authorized HTTP/SSE Transport
→ approved real Provider
→ live ephemeral text delta
→ durable usage / terminal status
```

本批验证：

- CGF-2A 的持久 Invocation Runtime 能驱动 CGF-2B.1 的真实 Wire Adapter；
- 真实厂商 Endpoint 能完成文本 Streaming、usage 与 finish reason 映射；
- Credential 仅在受控 Development Credential Source 和授权 Transport
  中瞬时使用；
- cancel、deadline、Provider 拒绝和传输不确定结果按既有七状态收敛；
- Prompt、输出、API Key 和完整 Provider 响应不进入数据库、日志、Trace 或
  QA Evidence。

本批不接 Desktop、Local Core 或真实用户内容。

## 2. 允许形成的结论

CGF-2B.2 通过后只能声明：

```text
CGF-2B.2 DIRECT_PROVIDER_DEVELOPMENT_CONFORMANCE_PASS
```

不得声明：

- 企业模型网关/自定义中转站已兼容；
- Anthropic-compatible 与 OpenAI-compatible 两个协议均已完成真实联网验证；
- 企业 MaaS、CAS、MDM、RBAC 或生产 Secret Store 已接入；
- Desktop 用户已经可以调用真实模型；
- RoboThree Model Gateway 已生产就绪；
- CGF-2B 或 CGF-2 整体已经关闭。

## 3. 已有事实与本批缺口

### 3.1 直接复用

| 已关闭能力 | 来源 | B.2 处理 |
| --- | --- | --- |
| Model Invocation 七状态、幂等、Durable Event | CGF-2.0 / 2A | 不修改 |
| PostgreSQL v0007 与 MyBatis Persistence | CGF-2A.1 | 不修改 |
| Binding 精确 revision/digest 与实时收窄 | CGF-2A.2 | 直接复用 |
| accepted → running → terminal 与 lease/fencing | CGF-2A.2 | 直接复用 |
| 双 JVM crash takeover 基线 | CGF-2A.3 | 本批不扩展 |
| Anthropic/OpenAI 两套 Wire Adapter | CGF-2B.1 | 选择一套真实验证，另一套继续 Stub |
| Credential 授权 Transport 与 Endpoint Policy | CGF-2B.1 | 不绕过、不放宽 |
| 有界 SSE Reader 与 Stream Sink | CGF-2B.1 | 接入 Runtime Bridge |

### 3.2 必须补齐

1. `ModelInvocationExecutionBackend` 与 `ModelProviderAdapter` 的类型化桥接；
2. 通过 `requestDigest` 获取固定 synthetic provider-neutral request 的瞬态
   Source；
3. text delta 到 `ModelInvocationEphemeralBuffer` 的实时投递；
4. usage、finish reason 与 terminal result 的单次收敛；
5. 仅 Development Profile 可用的真实 Credential 注入；
6. 一条精确 `direct_provider` Binding；
7. 真实 Provider opt-in Conformance Harness；
8. 独立于默认 offline/online 门禁的真实联网验证命令。

## 4. 模块边界

### 4.1 Model Provider Request Source

新增内部类型化 Port：

```text
ModelProviderRequestSource
└── resolve(requestDigest)
    → canonical provider-neutral request
```

规则：

- B.2 只提供固定 synthetic request；
- Source 以 `requestDigest` 精确匹配，不接受任意 Prompt 查询；
- 返回前重新 canonicalize 并计算 SHA-256；
- canonical request 只存在于当前调用内存；
- 不进入 ModelInvocation、Event、Outbox、PostgreSQL、日志、Trace 或报告；
- 缺失、digest 漂移或超出大小上限时，在 HTTP 请求发出前确定性失败；
- B.2 不建设通用 Prompt Store、Conversation Store 或用户内容缓存。

### 4.2 Provider-backed Execution Backend

新增：

```text
ProviderBackedModelInvocationExecutionBackend
├── ModelProviderRequestSource
├── ModelProviderAdapterRegistry
├── ModelInvocationEphemeralPublisher
└── ProviderResultCollector
```

执行顺序：

1. 校验 `ModelInvocationExecution.Request`；
2. 按 `requestDigest` 获取 synthetic request；
3. 校验 Binding、Protocol、Credential revision 和 deadline；
4. 按 Binding Protocol 确定性选择唯一 Adapter；
5. 构造 `ModelProviderRequest`；
6. Streaming text delta 直接投递 ephemeral publisher；
7. usage 与 terminal 由 result collector 收敛；
8. 只返回一次 `ModelInvocationExecution.Result`；
9. Runtime 继续负责 durable terminal commit。

禁止：

- Backend 持久化 Prompt 或输出；
- Backend 不得直接调用 Repository、直接持久化或绕过 Runtime 修改
  Invocation、Event、Lease 或 Outbox；Backend 只通过类型化 Result 报告执行结果，
  durable terminal 仍由 Runtime 提交；
- Adapter 自行选择 Model、Binding、Protocol 或 Credential；
- 协议失败后自动切换另一 Adapter；
- 厂商直连失败后自动切换企业中转站；
- 同一个 delta 同时由 live publisher 和 terminal Result 重复投递。

### 4.3 Ephemeral Streaming Bridge

建立类型化 Port：

```text
ModelInvocationEphemeralPublisher
├── publishText(invocationId, delta)
└── clear(invocationId)
```

第一版 Adapter 使用现有 `ModelInvocationEphemeralBuffer`：

- text delta 到达后即时写入有界内存；
- 不持久化 token delta；
- stream sequence 只在当前 Central runtime instance 内有效；
- 断线或跨节点不保证 delta replay；
- durable cursor 只恢复 durable Event；
- `clear(invocationId)` 是 best-effort 资源清理，不是 durable 事实；
- Ephemeral delta 允许在进程崩溃、连接中断或清理竞争中丢失，丢失不得改变
  Invocation、Event、usage 或 terminal durable facts；
- terminal 后 best-effort 释放 transient Source、Sink 和订阅资源；
- usage 和 terminal 仍由 PostgreSQL durable facts 收敛。

Tool Call fragment 在 B.2 仅继续执行 B.1 Parser Conformance，不向上层开放真实
Tool Loop。B.2 synthetic request 不发送 Tool Schema。

### 4.4 Provider Adapter Registry

Registry 只按已经锁定的 `ModelEndpointBinding.Protocol` 解析：

```text
ANTHROPIC_COMPATIBLE → AnthropicCompatibleModelProviderAdapter
OPENAI_COMPATIBLE    → OpenAiCompatibleModelProviderAdapter
```

要求：

- 每个 Protocol 在当前 Registry 中恰好一个 Adapter；
- 缺失或重复时启动/调用失败关闭；
- 不根据 URL、Model ID 或返回 Header 猜测协议；
- B.2 只为一套协议记录 `realProviderConformance=true` 的测试事实；
- 另一套协议保留 B.1 Stub PASS，不冒充真实 Provider PASS。

该测试事实只进入版本化 QA/Development Log，不新增公共 Descriptor 字段，不修改
Enterprise Gateway Contract。

## 5. Credential 与测试资源边界

### 5.1 旧 Key 处置

此前曾在对话中明文出现的 API Key 视为已暴露：

- B.2 禁止继续使用；
- 用户必须先在 Provider 控制台撤销或轮换；
- B.2 只接受新生成、额度受限、专用于 Development 的 Key；
- Key 不得再次发送到聊天、讨论区、Markdown、源码、配置文件或测试报告。

### 5.2 Development Credential Source

B.2 建立 opt-in Development Adapter：

```text
DevelopmentModelCredentialMaterialSource
```

规则：

- 只在显式 `model-provider-conformance` Profile/Harness 中装配；
- 只解析预先允许的 opaque credential reference；
- 自动化开发与独立 QA 只通过 Harness 子进程的受控环境变量提供真实 Secret；
- 安全的交互式输入只允许用于人工开发调试，不得成为自动化 QA 输入；
- 不接受 HTTP Request、Model Binding 或 Prompt 指定环境变量名；
- 返回独立 `char[]`，Transport 使用后清零；
- 缺失、空值、revision 不符或格式非法时失败关闭；
- Production Profile 检测到 Development Source 必须拒绝启动；
- 默认 `check:central`、`check:central:offline` 不读取真实 Key。

环境变量注入仅是 Development/QA 权宜方式，不视为生产 Secret Store。企业试点
前仍必须接入公司 Secret Store/Vault/KMS 等正式 Adapter。

## 6. 厂商直连 Binding

B.2 使用一条版本化、测试专用的 `direct_provider` Binding：

```text
connectionMode = DIRECT_PROVIDER
protocol       = 用户确认的一套 compatible protocol
endpoint       = 用户确认且通过 Endpoint Policy 的厂商地址
modelId        = 测试 Model ID
credentialRef  = opaque development reference
recoveryMode   = MANUAL_RECONCILIATION
```

约束：

- Endpoint、Model ID 和 Protocol 使用外部受控测试配置，不写入公共 Contract；
- API Key 不写入 Binding；
- Binding revision/digest 固定并参与 dispatch decision；
- 运行中配置变化不得影响已开始 Invocation；
- 不允许 per-request URL；
- 不允许 redirect；
- 不允许自动更换 Model、Protocol、Binding 或 Connection Mode；
- 厂商没有可信查询/幂等接口时，崩溃恢复使用
  `MANUAL_RECONCILIATION`，不得盲目重调。

当前文档中的 DeepSeek Endpoint、Protocol 和 Model ID 只属于候选 Profile。
真实 Harness 必须先验证；验证失败时返回 typed error 并保持阶段未关闭，不猜测
替代 URL 或自动切换协议。

## 7. 结果与错误收敛

| 情况 | 结果 |
| --- | --- |
| request/source/digest 在发出前失败 | `failed`，可信本地确定性失败 |
| Provider 明确 401/403/4xx 拒绝 | `failed`，使用安全 typed code |
| 用户取消且连接已关闭 | `cancelled` |
| 本地 deadline 到期 | `timed_out` |
| 正常 terminal + usage | `completed` |
| 发送后连接中断、结果/计费无法确认 | `uncertain` |
| mid-stream 中断且终态未知 | `uncertain` |
| Provider 返回矛盾/不可信终态 | `uncertain`，不得伪造 completed/failed |

`failed` 只能用于能够证明没有不确定外部结果的失败。B.2 不宣称 Provider
exactly-once，也不自动重调真实请求。

## 8. 真实 Provider Conformance

### 8.1 必须实际执行

1. **正常 Streaming**
   - 固定 synthetic input；
   - 必须统计并记录实际非空 text delta 数量；
   - `deltaCount >= 2` 时直接通过；`deltaCount == 1` 时必须记录 Provider
     合法聚合证据，禁止静默放行；`deltaCount == 0` 失败；
   - terminal 为 completed；
   - usage 非负；
   - finish reason 映射有效；
   - 最终输出只在内存中校验。
2. **错误 Credential**
   - 使用随机无效测试 Credential；
   - Provider 明确拒绝；
   - 映射为安全 typed error；
   - 不输出 Header、Key 或响应正文。
3. **取消**
   - 请求一个足够长但非敏感的 synthetic 输出；
   - 首个 delta 后触发取消；
   - 连接、Reader、Sink 和临时 Source 收敛；
   - 不产生 completed。
4. **Deadline**
   - 使用受控短 deadline；
   - 验证本地 Transport/Runtime 收敛为 timed_out；
   - 无后台遗留读取线程或继续投递。
5. **Binding Lock**
   - Invocation 开始后构造新 Binding revision；
   - 原 Invocation 仍使用原 dispatch decision；
   - 不发生静默切换。

真实网络测试不得由 Stub、digest 或历史报告替代。401/403 以外的 429、5xx、
malformed SSE、oversize 和 redirect 继续由 B.1 可控 Stub 做确定性回归，不要求
消耗真实 Provider 制造不可控故障。

### 8.2 唯一 Canary 与泄漏扫描

每次真实 Harness 生成一组仅存在于内存的唯一 canary：

- synthetic input canary；
- expected output canary；
- invalid credential canary；
- invocation/binding digest。

必须自动扫描：

- 应用日志；
- 捕获的 Trace Export；
- Maven/测试输出；
- QA Evidence；
- 临时 Harness 报告。

禁止出现：

- API Key、Authorization、x-api-key；
- Prompt 或输出正文；
- canary 及其 Base64/URL 编码；
- Provider 原始错误正文；
- 完整本地路径。

报告只允许：

```text
count
digest
status
duration
token usage count
typed error code
resource metrics
```

## 9. 开发工作流

### B.2-1：Runtime Bridge

- 新增 Request Source Port；
- 新增 Provider-backed Execution Backend；
- 新增 Adapter Registry；
- 新增 Ephemeral Publisher；
- 用 B.1 Stub 完成 Runtime Bridge Conformance；
- 验证 delta 不重复、terminal 单写和资源释放。

### B.2-2：Development Secret 与 Binding Harness

- 新增 opt-in Development Credential Source；
- 新增 direct-provider Binding Seed/Harness；
- Production Profile fail-closed Guard；
- 新增真实网络测试入口；
- 默认门禁无 Key、无网络也能通过。

### B.2-3：真实厂商验证与收口

- 使用用户轮换后的新测试 Key；
- 实际执行正常 Streaming、无效 Credential、取消和 deadline；
- 执行唯一 canary 泄漏扫描；
- 完整 Central online/offline 与工作区回归；
- 形成无正文、无 Secret 的 QA 建议范围。

这三个步骤属于一个 `CGF-2B.2` 开发批次，不新增 B.2.1/B.2.2/B.2.3 用户
门槛。

## 10. 架构与工程护栏

- 不修改 Enterprise Gateway `v1alpha1` Schema/OpenAPI/Fixture；
- 不新增 PostgreSQL Schema，v0007 字节和 digest 不变；
- 不修改 Kernel、Local Core、Desktop、Preload 或 Renderer；
- Controller 禁止业务逻辑；B.2 不建立 Desktop-facing 新 Controller；
- MyBatis 仍只在 Persistence Adapter；
- Java HTTP 只使用 GET/POST，Provider 调用固定 POST；
- 不引入 Flyway；
- 不引入 Provider SDK，继续使用 JDK HTTP + RoboThree Wire Adapter；
- 不把 Credential、Prompt、输出、Tool Schema 或 Tool Result 放入 Domain；
- 不建设通用 Provider Router、评分、成本优化或自动 failover；
- 不放宽 Production Dependency Manifest 与 readiness；
- offline 门禁禁止访问外网；
- 未显式启用真实 Harness 时不得读取 Secret 或调用 Provider。

## 11. 非目标

CGF-2B.2 不实现：

- 企业自定义中转站真实调用；
- 双 JVM 真实 Provider crash/recovery Harness；
- 正式企业 Secret Store；
- Admin Model 配置页面；
- Local Core `HttpEnterpriseModelProvider`；
- Desktop 真实用户内容外发；
- Model 外发确认 UI；
- 真实 Tool Calling/Agent Tool Loop；
- 多模态、Batch、Responses API；
- Provider 自动路由、限流、配额、计费或报表；
- CAS、MDM、企业 RBAC 或 MaaS；
- CGF-2B.3、CGF-2C 或 Enterprise Integration。

B.2 仍是纯技术 Foundation，不依赖产品 PRD。进入 CGF-2C 的真实用户内容
外发前才需要 Model Experience PRD 与 UX 状态矩阵。

## 12. 验证入口

默认回归：

```text
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run check
```

真实 Provider 使用独立 opt-in 命令，建议命名：

```text
pnpm run check:cgf2b2:direct-provider
```

该命令必须：

- 缺少 Profile、Endpoint、Model ID 或 Credential 时安全跳过并返回明确
  `RESOURCE_GATED`，不得误报 PASS；
- 用户/Claude Code 独立 QA 声明 B.2 PASS 时必须真实提供资源并实际执行；
- 不把真实 Secret 作为命令行参数；
- 不打印环境变量或完整配置；
- Harness 结束后释放线程、连接、InputStream、Sink、Source 和临时缓冲区。

## 13. 独立 QA 建议范围

1. 独立重跑 Central online/offline 与工作区门禁；
2. Runtime Bridge 使用 B.1 两套 Stub Adapter 的相同 Projection；
3. 真实厂商直连正常 Streaming 实际执行；
4. 真实 invalid Credential、cancel 与 deadline 实际执行；
5. request body/digest 漂移、Source 缺失和 Binding 漂移失败关闭；
6. text delta 实时投递且 terminal Result 不重复投递；
7. usage、finish reason 和 terminal 单次 durable 收敛；
8. 发送后未知结果进入 uncertain，不伪造 failed；
9. 原 Binding revision 锁定且无协议/Connection Mode 静默切换；
10. Production Profile 不装配 Development Credential Source/Harness；
11. API Key、Prompt、输出、canary 及可逆编码动态扫描 0 命中；
12. 公共 Contract、v0007、CGF-2A Recovery、Desktop/Core 未变；
13. 无企业中转站、双 JVM真实 Provider、Desktop 外发或 CGF-2C 超前实现；
14. 独立 QA `P0/P1/P2/P3=0`。

## 14. 退出门槛

```text
CGF-2A + CGF-2B.1 regression PASS
AND Runtime Bridge Stub Conformance PASS
AND one approved direct_provider Binding exact-lock PASS
AND real Provider text Streaming PASS
AND real invalid-credential mapping PASS
AND real cancel/deadline propagation PASS
AND terminal/usage/delta convergence PASS
AND secret/content/canary leak scan = 0
AND Central online/offline PASS
AND workspace full gate PASS
AND independent QA P0/P1/P2/P3 = 0
AND user acceptance
```

退出后：

```text
CGF-2B.2：PASS / CLOSED
CGF-2B.3：GATED / ENTERPRISE RELAY RESOURCES REQUIRED
CGF-2C：GATED
```

## 15. 编码前资源与确认

开始编码前需确认计划边界；执行真实 Harness 前必须具备：

1. 已撤销/轮换此前暴露的旧 Key；
2. 新生成、额度受限的 Development API Key；
3. 用户批准的候选 Endpoint、Protocol 和 Model ID；
4. 本机能够访问该 Endpoint 的 DNS/TLS/代理条件；
5. 允许产生少量真实 API 调用费用；
6. 只使用 RoboThree 生成的 synthetic 非敏感测试数据。

资源缺失不阻止先实现 Runtime Bridge 和 Stub 回归，但不得把
`RESOURCE_GATED` 当作真实 Provider PASS，也不得关闭 CGF-2B.2。

## 16. 工期

- 集中工程工作量：2～4 个工作日；
- 外部资源与网络等待：不计入工程工作量；
- 独立 QA 与返工：不计入上述估算；
- 该估算不是日历承诺。

## 17. 当前门槛

```text
CGF-2B.1：PASS / CLOSED
CGF-2B.2：WITHOUT REAL PROVIDER QA PASS / USER ACCEPTED / REAL PROVIDER RESOURCES GATED / NOT CLOSED
CGF-2B.3：GATED
CGF-2C：GATED
```

本计划已由用户确认并明确授权编码。无真实 Provider 部分已完成独立 QA，且
用户已正式接受该部分结论；真实资源提供、真实 Harness PASS 和阶段关闭仍是
不同事实，任何一项都不自动替代其他门槛。

## 18. 首轮评审处置与最终技术决策

### 18.1 Claude Code 问题关闭映射

| 编号 | 修订 | 状态 |
| --- | --- | --- |
| P2-1 | 明确 Backend 只通过 Result 返回结果，Runtime 是 durable terminal 唯一提交者；禁止 Backend 直接调用 Repository 或绕过 Runtime | CLOSED |
| P2-2 | 明确 `clear` 为 best-effort；ephemeral delta 可丢失且不得改变 durable facts | CLOSED |
| P2-3 | 自动化 QA 固定使用 Harness 子进程受控环境变量；交互输入仅供人工调试 | CLOSED |
| P3-1 | 真实 Harness 必须记录 `deltaCount`；单 delta 必须附合法聚合证据，禁止静默放行 | CLOSED |
| P3-2 | 真实直连命令改为 `check:cgf2b2:direct-provider`，避免与 B.3 企业中转站命令混淆 | CLOSED |

### 18.2 MiniMax 建议处置

采纳：

- CGF-2B.2 编码授权、真实 Provider Key/网络资源授权和阶段关闭是三个独立事实；
- 本批是 Central Model Gateway 的技术转折点，必须保持真实 Provider 验证与
  Secret/正文零泄漏门槛。

不纳入本批门槛：

- 五类业务场景优先级；
- CAS 企业身份集成；
- 前端负责人或 Desktop 交互实施；
- P0 Tool Pack；
- PM 进度百分比或其他项目管理统计。

这些事项分别属于产品/前端、企业集成、Tool Pack 或项目管理范围，不能扩大
CGF-2B.2 的 Model Gateway Foundation 边界。ADR-017 仍是 CGF-2C.1 的
前置硬门槛，不提前并入 CGF-2B.2。

### 18.3 当前最终决策

```text
CGF-2B.2：WITHOUT REAL PROVIDER QA PASS / USER ACCEPTED / REAL PROVIDER RESOURCES GATED / NOT CLOSED
CGF-2B.2 coding authorization：GRANTED
real Provider credential/network resources：NOT GRANTED
CGF-2B.3：GATED
CGF-2C：GATED
```

CGF-2B.2 继续不依赖产品 PRD，也不要求 Desktop 用户现场演示。文档复核、
用户确认和编码授权已经完成；真实 Harness 资源继续独立提供，资源缺失时不得
关闭本阶段。

## 19. `0.0.0-cgf.2b.2` 开发者交付状态

已实现：

- `ModelProviderRequestSource`、`ModelProviderAdapterRegistry`、
  `ModelInvocationEphemeralPublisher`；
- `ProviderBackedModelInvocationExecutionBackend` 与
  `ProviderResultCollector`；
- 严格协议 Registry、Buffer Publisher、固定 synthetic Request Source；
- 只接受固定 opaque reference/revision 的 Development Credential Material
  Source；
- Anthropic/OpenAI 两套 B.1 Adapter 的相同 Runtime Bridge Stub
  Conformance；
- opt-in `check:cgf2b2:direct-provider` 真实 Harness 框架；
- invalid Credential、cancel、deadline、deltaCount、output digest 与唯一
  canary 泄漏检查；
- Application 不依赖 HTTP/具体 Adapter、Backend 不访问 Repository、公共
  Contract/v0007/Controller 不变的架构护栏。

开发者自测：

```text
Central online：180 tests / 0 failures / 0 errors / 0 skipped
Central offline：180 tests / 0 failures / 0 errors / 0 skipped
Workspace：Architecture PASS + 107 files / 685 tests PASS
Direct Provider Harness：RESOURCE_GATED / no network call attempted
```

当前不能声明：

```text
REAL_PROVIDER_CONFORMANCE_PASS
CGF-2B.2_PASS
```

无真实 Provider 独立 QA：

```text
Central online：180 / 0 / 0 / 0
Central offline：180 / 0 / 0 / 0
Workspace：Architecture PASS + 107 files / 685 tests PASS
Direct Provider Harness：RESOURCE_GATED / no network call attempted
P0 / P1 / P2 / P3：0 / 0 / 0 / 0
用户结论：WITHOUT REAL PROVIDER 部分正式接受
```

该接受仅关闭无真实 Provider 的 QA 门槛，不关闭 CGF-2B.2，也不解锁
CGF-2B.3 或 CGF-2C。

原因是本轮未向 Harness 授权真实 Key、Endpoint、网络和调用费用。真实资源
必须通过本机 Harness 子进程环境提供，完成实际联网 Conformance 和独立 QA
后，再进入用户接受与阶段关闭。

## 20. `0.0.0-cgf.2b.2-repair.1` 真实 Provider 验证状态

用户已单独授权受限真实 Provider 资源。开发者实际联网执行发现并关闭两类
真实差异：Anthropic-compatible 扩展 thinking/signature delta，以及短回答
无法稳定触发取消。修复不改变公共 Contract、Schema 或 durable 状态语义。

冻结处理：

- `thinking_delta.thinking` 与 `signature_delta.signature` 必须严格校验；
- Provider 私有推理与签名不得进入公共 Projection、持久事实或报告；
- 正常 Streaming 与取消使用两份独立、固定、非敏感 synthetic request；
- Runtime 仍是 durable terminal 唯一提交者；
- `canaryObserved` 只作为模型服从性证据，不作为 Transport/Streaming 门槛；
- Key 与 canary 泄漏扫描、合法 text delta、输出 digest、usage/finish 和四场景
  typed terminal 仍是强制门槛。

开发者真实 Harness 结果：

```text
status：PASS
deltaCount：83
aggregationEvidence：multiple_provider_deltas
canaryObserved：false
outputDigest：002851651ea361580452d135a145524cafaf33817d8c267854b7c9599dcec6d8
durationMillis：14694
invalidCredential：failed
cancel：cancelled
deadline：timed_out
Key / canary leakage：0
temporary Key file：REMOVED
```

当前状态：

```text
CGF-2B.2 repair.1：REAL PROVIDER DEVELOPER HARNESS PASS
repair.1 independent QA：PENDING
CGF-2B.2 overall：NOT CLOSED
CGF-2B.3：GATED
CGF-2C：GATED
```

独立 QA 必须实际重跑完整门禁与受限真实 Provider Harness；开发者历史输出或
digest 不能替代重跑。最终收口额外复跑曾分别观察到既有双 JVM Recovery
子进程退出超时和既有 Trace Exporter 异步 Span 时序抖动，二者不属于本批
Provider 修改范围，但必须由独立 QA 重新实际执行并给出稳定性结论。独立 QA
和用户接受完成前，不得关闭 CGF-2B.2。

## 21. `0.0.0-cgf.2b.2-repair.2` P1 修复状态

repair.1 独立 QA 结论为 `FAIL — P1 blocking`：OpenAI-compatible Provider
可能发送空字符串或只含空白字符的 `content` 角色/元数据帧，旧守卫无法覆盖
全部 blank 值，构造 `TextDelta` 时触发 Domain invariant。

repair.2 冻结：

- `content == null`、空字符串或 `isBlank()` 的帧不产生 `TextDelta`；
- 非空文本、Tool fragment、usage、finish reason 与 terminal 处理不变；
- 新增空字符串、纯空白和后续真实文本的同流回归，防止空帧 crash 或误投影；
- 不修改公共 Contract、PostgreSQL v0007、Controller、Runtime durable 语义；
- 不在生产 Transport 强制禁用企业代理，QA 环境变量由 Harness 运行环境清理。

开发者回归：

```text
ModelProviderAdapterConformanceTest：10 / 0 / 0 / 0
Central online：182 / 0 / 0 / 0
Central offline：182 / 0 / 0 / 0
Workspace：Architecture PASS + 107 files / 685 tests + 3 smoke PASS
```

当前状态：

```text
repair.1 independent QA：FAIL / P1
repair.2 P1 fix：DEVELOPER SELF-TEST PASS
repair.2 real Provider re-QA：PENDING
CGF-2B.2 overall：NOT CLOSED
CGF-2B.3：GATED
CGF-2C：GATED
```

独立 QA 必须在 repair.2 上重新实际执行真实 Streaming、非法凭证、取消、
Deadline 与 Key/canary 泄漏扫描；repair.1 开发者结果或 digest 不能替代。

## 22. repair.2 独立 QA 与用户关闭结论

Claude Code 已在 repair.2 上独立执行：

```text
Central online：182 / 0 / 0 / 0
Central offline：182 / 0 / 0 / 0
Workspace：Architecture PASS + 107 files / 685 tests + 3 smoke PASS
真实 Streaming：293 deltas / canary observed / SHA-256 digest / 4.8s
非法凭证：failed
取消：cancelled
Deadline：timed_out
Key / canary leakage：0
temporary Key file：REMOVED
P0 / P1 / P2：0 / 0 / 0
P3：4，均为既有非阻塞环境或时序问题
```

用户已正式接受该独立 QA：

```text
0.0.0-cgf.2b.2-repair.2：PASS / CLOSED
CGF-2B.2：PASS / CLOSED
CGF-2B.3：GATED
CGF-2C：GATED
```

CGF-2B.2 的关闭只证明厂商直连 Runtime Bridge、双协议 Adapter Foundation、
真实 Streaming 和四场景恢复语义成立；不代表企业中转站双 JVM验证、正式
Desktop 用户正文外发或 CGF-2C 已获授权。
