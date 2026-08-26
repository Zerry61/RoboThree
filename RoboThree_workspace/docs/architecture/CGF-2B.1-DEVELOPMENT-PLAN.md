# RoboThree CGF-2B.1 双协议 Provider Stub 与安全传输开发计划

> 阶段：`CGF-2B.1 — Dual-Protocol Provider Stub and Safe Transport`  
> 状态：**PASS / CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-07-31  
> 前置状态：CGF-2A.1～2A.3 与 CGF-2A 整体 `PASS/CLOSED`  
> 上位决策：ADR-015、ADR-015 补充修订 A、ADR-016、CGF-2 Development
> Plan  
> 后续门槛：CGF-2B.2、CGF-2B.3、CGF-2C 均继续 `GATED`

## 1. 目标

CGF-2B.1 只建立真实 Provider 接入前所需的语言内部边界和严格 Stub
Conformance：

```text
Provider-neutral transient request
→ exact ModelEndpointBinding
→ protocol-specific Provider Adapter
→ authorized POST transport
→ Anthropic-compatible / OpenAI-compatible Stub
→ bounded stream sink
→ provider-neutral delta / usage / terminal result
```

本批不访问真实模型厂商或企业中转站，不使用真实 API Key，不建立正式 Model
Controller，也不接入 Desktop 用户内容。

## 2. 阶段前差异确认

### 2.1 已关闭且直接复用

| 已有事实 | 当前代码 | B.1 处理 |
| --- | --- | --- |
| Model Invocation 七状态、幂等和 durable event | CGF-2.0 / 2A.2 | 保持不变 |
| `ModelEndpointBinding` 精确 revision/digest | CGF-2A.2 | 直接复用 |
| `direct_provider` / `custom_relay` | `ConnectionMode` | 直接复用 |
| Anthropic/OpenAI-compatible 协议枚举 | `Protocol` | 直接复用 |
| Binding Resolver 与实时状态收窄 | CGF-2A.2 | 直接复用 |
| Credential reference/revision 校验 | `ModelCredentialResolver` | 保留元数据职责 |
| Endpoint 基础 HTTPS 校验 | `StrictModelEndpointValidator` | 增强，不放宽 |
| Lease、fencing、takeover 和双 JVM恢复 | CGF-2A.2/2A.3 | 不返工 |
| 公共 Model Invocation Schema/Fixture | CGF-2.0 | 只消费，不修改 |
| Prompt、输出和 token delta 禁入数据库 | CGF-2A | 保持不变 |

### 2.2 B.1 必须补齐的实现接缝

| 缺口 | 当前事实 | B.1 决策 |
| --- | --- | --- |
| 瞬态 Provider 请求 | Runtime 只持有 `requestDigest`，Fake Backend 不需要真实消息 | 新增 Central 内部 provider-neutral transient request；不得持久化 |
| 真正的增量流 | Backend 终态后一次性返回 delta 列表 | 新增有界 `ModelStreamSink` 和协议 Adapter 流式回调；B.1 不接 Runtime |
| Credential 材料使用 | Resolver 只返回 reference/revision | Secret 材料只允许由授权 HTTP Transport 瞬时使用，Adapter/Domain 不获得明文 |
| HTTP/Endpoint 安全 | 仅有基础 URI 校验 | 增加 allowlist、地址类别、固定路由、禁止 redirect、上限和 typed error |
| Provider Wire 解析 | 尚无真实协议 DTO/SSE parser | 建立两套独立 Adapter 与 Conformance |
| Trace/日志泄漏防护 | 尚无 Provider 出站请求 | 增加低基数 span 和动态 canary/secret 扫描 |

### 2.3 差异结论

上述均属于已接受 CGF-2B 范围内的实现接缝，不改变：

- ADR-015 或 ADR-015 补充修订 A；
- Enterprise Gateway `v1alpha1`；
- PostgreSQL `v0007`；
- CGF-2A 的 Runtime、持久事实和恢复语义；
- Desktop、Local Core 或企业身份边界。

因此不重新评审完整 CGF-2B 架构，只评审本开发计划的实现边界。

### 2.4 上游借鉴边界

本批登记为 [AR-053](./UPSTREAM-ADOPTION-REGISTER.md)：

- 借鉴 Open WebUI 的 Provider Gateway 与上层体验职责分离；
- 借鉴 OpenHands 的稳定执行事实与可丢弃流式内容分离；
- 借鉴 OpenClaw 的 Gateway 失败关闭、Credential 不披露与有界连接边界；
- 只采用架构原则并建立 RoboThree 自有 Port、Wire Adapter、SSE Reader 和
  Conformance，不复制第三方 Provider DTO、Parser、HTTP 或 Credential 源码。

## 3. 模块所有权

### 3.1 Provider-neutral transient model

Central 内部新增最小类型：

```text
ModelProviderRequest
├── invocationId
├── requestDigest
├── model target
├── messages
├── tools
├── maxOutputTokens
├── binding reference
└── deadline

ModelStreamSink
├── onTextDelta
├── onToolCallDelta
├── onUsage
└── onTerminal
```

规则：

- 输入从已冻结的 `providerNeutralRequest` 派生；
- request digest 必须在出站前重新校验；
- Message、Tool Schema 和 delta 只存在于当前调用的瞬态内存；
- 不进入 `ModelInvocation`、Event、Outbox、Trace、普通日志或 QA 报告；
- `ModelStreamSink` 必须有 Event、单段、累计字节和调用时长上限；
- B.1 只验证 Adapter 到 Sink，不修改 `ModelInvocationRuntime` 和
  `ModelInvocationExecutionBackend`；Runtime Streaming Bridge 在 B.2 建立。

### 3.2 双协议 Adapter

分别建立：

```text
AnthropicCompatibleModelProviderAdapter
OpenAiCompatibleModelProviderAdapter
```

二者共用 provider-neutral 输入/输出和安全 HTTP Transport，但必须分别拥有：

- Wire request/response DTO；
- 请求路径和固定 Header 规则；
- SSE frame parser；
- text/tool fragment assembler；
- usage 映射；
- finish reason 映射；
- Provider error 映射。

禁止：

- `if provider == ...` 的万能 Adapter；
- 共享 Provider Wire DTO；
- 运行期协议猜测；
- 协议失败后自动切换；
- Adapter 自行更换 Binding 或 Endpoint。

### 3.3 Credential 与授权 HTTP Transport

保持 `ModelCredentialResolver` 只校验 credential reference/revision 和实时
可用性。新增内部授权传输边界：

```text
ModelAuthorizedHttpTransport
├── exact endpoint
├── protocol-specific authorization scheme
├── credential reference/revision
├── safe headers
├── bounded request body
└── cancellation/deadline
```

Credential 材料规则：

- Secret Material Provider 只向授权 Transport 提供瞬时使用能力；
- Provider Adapter、Application Runtime、Domain、Controller 和持久层不得
  获得明文 Key；
- Transport 注入认证 Header 后不得记录 Header 或请求对象；
- B.1 仅使用测试 sentinel credential；不读取真实环境变量；
- Development 环境变量/Secret Adapter 延后到 B.2；
- Production Secret Store 延后到 Enterprise Integration。

### 3.4 Endpoint 与 HTTP 安全

生产校验至少包括：

- 只允许 HTTPS；
- 禁止 user-info、query、fragment 和未规范化路径；
- Endpoint 必须来自已激活的精确 Binding，不接受 per-request URL；
- 只允许 Adapter 固定的相对 Provider 路由；
- 禁止自动 redirect；
- 配置化 host allowlist；
- 拒绝 loopback、private、link-local、multicast、unspecified 和受限地址；
- DNS 解析失败或地址集合包含禁止地址时失败关闭；
- 请求体、响应头、单 SSE frame、累计 stream 和错误体均有上限；
- 只使用 GET/POST；本批 Provider 调用只使用 POST；
- timeout、cancel 和 stream idle 分别收敛为 typed Provider 结果。

测试 Stub 可以使用随机 loopback HTTP，但只能通过 test-only Transport/
Validator，不能放宽生产校验。

## 4. 实现工作流

### Workstream A：内部模型与 Parser 基础

- 建立 provider-neutral transient request、stream sink 和 terminal result；
- 建立严格 NDJSON/SSE framing 边界；
- 建立 Anthropic/OpenAI 两套 Wire DTO；
- 校验 request digest、UTF-8、Content-Type 和大小上限。

### Workstream B：安全 HTTP 与 Credential 边界

- 建立禁止 redirect 的 POST Transport；
- 建立授权 Header 注入和 sentinel credential test adapter；
- 增强 Endpoint Validator；
- 接入 deadline、cancel 和 bounded response；
- 加入 W3C Trace Context，但 Span 只记录协议、状态、时长和 typed error。

### Workstream C：双协议 Adapter

- Anthropic-compatible request/stream/error 映射；
- OpenAI-compatible request/stream/error 映射；
- text、usage、finish reason 和 Tool Call fragment 投影；
- 未知或矛盾终态失败关闭；
- completed 后迟到 delta 不得污染结果。

### Workstream D：Conformance 与架构护栏

- 两套 Adapter 使用同一 provider-neutral expected projection；
- Stub Server 只存在于 test source；
- 动态扫描 sentinel credential、synthetic canary 及其可逆编码；
- Guard 禁止真实 Endpoint、Key、Controller、数据库迁移和 Desktop 外发；
- 完整 Central online/offline 与工作区门禁。

## 5. Conformance 矩阵

Anthropic-compatible 与 OpenAI-compatible 必须分别覆盖：

1. Unicode/中文正常 Streaming；
2. split frame 与 multiple frame；
3. CRLF/LF 和合法空行；
4. oversize frame / oversize aggregate；
5. malformed JSON；
6. wrong Content-Type；
7. redirect；
8. 401 / 403；
9. 429 与 retry hint；
10. 5xx；
11. headers 前 connection reset；
12. stream 中 connection reset；
13. request deadline；
14. stream idle timeout；
15. cancel 传播并关闭响应流；
16. usage 缺失、重复和矛盾；
17. finish reason 缺失或未知；
18. completed 后迟到 delta；
19. Tool Call fragment 顺序与 JSON 参数拼接；
20. wrong invocation/request correlation；
21. 未批准 Endpoint、private address 和 redirect 失败关闭；
22. credential revision 漂移和缺失；
23. sentinel credential/canary 在日志、Trace、测试输出和报告中 0 命中；
24. 两协议输出相同 provider-neutral projection。

## 6. 非目标

CGF-2B.1 不实现：

- 真实 DeepSeek、OpenAI、Anthropic 或企业中转站网络调用；
- 真实 API Key、环境变量 Credential Source 或生产 Secret Store；
- 正式 `/model-invocations` Controller/Application Facade；
- `ModelInvocationRuntime` 与真实流式 Adapter 的桥接；
- Local Core `HttpEnterpriseModelProvider`；
- Desktop 用户正文、Agent instructions、Skill、Knowledge、Workspace、
  Tool Schema 或 Tool Result 外发；
- Provider 自动路由、自动协议检测或静默 failover；
- Model 报备、Key 签发、聚合路由、计费、配额或运营平台；
- Admin Model UI；
- PostgreSQL vNext、Binding 配置表或公共 Contract 修改；
- CGF-2B.2、2B.3、2C 或 Enterprise Integration。

## 7. 架构与安全护栏

- Provider Adapter 只能依赖 provider-neutral Port、Wire DTO 和安全 Transport；
- Adapter 不得导入 Controller、Persistence、MyBatis 或 Desktop/Core 类型；
- Credential Material 只能在 credentials/transport Adapter 内部出现；
- Controller 继续禁止业务逻辑；B.1 不新增 Controller；
- Java HTTP 只允许 GET/POST，Provider 调用固定为 POST；
- 不新增 Flyway；本批不新增 SQL；
- 不改 Enterprise Gateway Schema/Fixture；
- 不改 CGF-2A 持久状态或 lease/fencing；
- Production Profile 不得注册 Stub Server、sentinel credential 或 test
  Endpoint Validator。

## 8. 验证命令

```text
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run check
```

独立 QA 还必须单独执行：

- 双协议 Provider Adapter Conformance；
- Endpoint/Credential/Transport 安全专项；
- cancellation、timeout、stream limit 专项；
- 动态 credential/canary 泄漏扫描；
- Architecture Guard；
- 现有 CGF-2A.1～2A.3 完整回归。

## 9. 退出门槛

```text
Anthropic-compatible Stub Conformance PASS
AND OpenAI-compatible Stub Conformance PASS
AND Credential/Endpoint/Transport Security PASS
AND sentinel credential/canary leak scan = 0
AND CGF-2A full regression PASS
AND Central online/offline PASS
AND workspace full gate PASS
AND independent QA P0/P1/P2/P3 = 0
AND user acceptance
```

退出后只允许：

```text
CGF-2B.1：PASS / CLOSED
CGF-2B.2：等待用户单独授权
CGF-2B.3：GATED
CGF-2C：GATED
```

CGF-2B.1 关闭不代表任何真实 Provider、厂商直连或企业中转站已经兼容。

## 10. 工期

- 集中工程工作量：3～5 个工作日；
- 日历时间参考：5～9 天；
- 不包含独立 QA、返工或外部网络等待；
- B.1 不依赖真实账号、Key、额度或企业中转站资源。

## 11. 当前状态

用户已确认计划并授权编码；实现、开发者门禁及 Claude Code 独立 QA 全部
通过，P0～P3=0，用户已正式接受并关闭 CGF-2B.1。CGF-2B.2、2B.3 和
CGF-2C 继续 `GATED`。

当前门槛：

```text
CGF-2A：PASS / CLOSED
CGF-2B.1：PASS / CLOSED
CGF-2B.2：GATED
CGF-2B.3：GATED
CGF-2C：GATED
```
