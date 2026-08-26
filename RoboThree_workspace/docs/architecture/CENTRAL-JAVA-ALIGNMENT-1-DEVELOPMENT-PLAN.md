# Central Java Alignment-1 Development Plan

> 状态：**CONFIRMED_WITH_SPECIFIED_REVISIONS / ALIGNMENT-1A PASS/CLOSED /
> ALIGNMENT-1B IMPLEMENTED / INDEPENDENT QA PENDING**  
> 提出日期：2026-07-28  
> 适用范围：Central Enterprise Service 的低风险 Java 工程规范对齐  
> 架构基线：[ADR-016](../adr/016-central-java-engineering-baseline.md)
> `ACCEPTED`  
> 前置状态：CGF-1.1～CGF-1.3 `PASS/CLOSED`，CGF-2 `GATED`  
> 当前状态：**Alignment-1A、Alignment-1B 与 Alignment-1 已通过独立 QA
> 并由用户接受关闭；Alignment-2A/2B 与 CGF-2 继续 GATED**

## 1. 阶段目标

Alignment-1 在不修改数据库 Schema、Persistence 实现、身份协议、Model Gateway
或公共 Contract 的前提下，把 Central 的低风险 Java 工程规范收敛到公司基线：

```text
受限 Lombok
+ GET/POST Architecture Guard
+ Thin Controller
+ Bearer Security Adapter
+ Global Exception Handler
+ Micrometer/OpenTelemetry Tracing
+ Sensitive-data-safe Observability
```

本阶段不是业务功能开发，不增加 Model、Tool、CAS、MaaS 或 Admin 功能。核心
目标是让 Alignment-2 和 CGF-2 在一致、可测试、可观测的 Java 工程骨架上开发。

## 2. 当前代码事实

当前 Central：

- Java 21、Spring Boot 3.5.16、Maven Wrapper 3.9.x；
- 业务 Controller 已只使用 GET/POST；
- `EnterpriseIdentityController` 和 `EnterpriseAccessTokenController` 仍在
  Controller 内校验 Envelope、空值和构造 Command；
- `EnterpriseConfigurationController` 仍在 Controller 内提取 Bearer、
  构造 Package Reference 和处理 ETag/304 分支；
- `EnterpriseIdentityExceptionHandler` 只覆盖身份域错误；
- `GatewayError` 已有 `contractVersion/errorCode/category/retryable/
  safeSummary/correlationId`，当前公共 Contract 不含 `traceId`；
- 尚未引入 Actuator、Micrometer Tracing、OpenTelemetry 或 OTLP；
- 当前 Persistence 仍是 Spring JDBC/Flyway，本阶段不触碰；
- `InMemoryCentralPersistence` 和 Fake 仍用于测试/Foundation，本阶段不改变
  其生命周期，Production fail-closed 由 Alignment-2 完成。

主要影响位置：

```text
services/central-service/pom.xml
services/central-service/lombok.config
services/central-service/src/main/resources/application.yaml
services/central-service/src/main/java/com/robothree/central/
├── authentication/adapter/http/
├── configuration/adapter/http/
├── compatibility/
└── shared/adapter/
services/central-service/src/test/java/com/robothree/central/
```

## 3. 范围

### 3.1 Alignment-1A：HTTP 工程与安全边界

建议开发版本：

```text
0.0.0-cja.1a
```

交付：

1. 有限引入 Lombok 和 `lombok.config`；
2. 建立 Java Source Architecture Guard；
3. 固定业务 HTTP 只允许 GET/POST；
4. 将 Envelope 校验和 HTTP/Domain 映射移出 Controller；
5. 将 Bearer 提取移入受控 Security Adapter；
6. 将 ETag/304/Cache-Control 响应组装移入 Response Assembler；
7. 建立统一 `GlobalExceptionHandler`；
8. 保持现有 Error Envelope 和 HTTP 状态兼容；
9. 补充安全、Controller 边界和回归测试。

### 3.2 Alignment-1B：Tracing 与阶段收口

建议开发版本：

```text
0.0.0-cja.1b
```

交付：

1. Spring Boot Actuator；
2. Micrometer Observation/Tracing；
3. OpenTelemetry Bridge；
4. 可选 OTLP Exporter；
5. W3C `traceparent/tracestate`；
6. correlationId 与 traceId 分离；
7. HTTP、Application、JDBC 调用的安全 Span；
8. 敏感字段不进入 Span/Log 的自动化；
9. Exporter 不可用不阻断业务；
10. Central online/offline 完整回归和阶段 QA。

## 4. 明确非目标

Alignment-1 不实现：

- MyBatis-Plus；
- Flyway 移除或 SQL Script；
- Schema 变更或新 migration；
- `robothree_schema_version`；
- Production Profile Fake/InMemory 重装配；
- 双节点 Harness；
- Model Invocation 或 Durable Event；
- CGF-2 Contract；
- 真实 DeepSeek；
- 真实 CAS；
- OA/MDM/RBAC；
- 企业 Secret Store；
- Desktop/Local Core 完整 OpenTelemetry SDK；
- Admin Console；
- 新业务功能。

## 5. Lombok 方案

### 5.1 依赖

在 Central Maven 模块增加 Lombok，使用 Spring Boot/项目依赖管理兼容版本：

```text
org.projectlombok:lombok
scope/optional：compile-time only
```

Lombok 不进入运行时部署依赖，不影响语言中立 Contract。

### 5.2 首批允许使用

- Controller、Handler、Assembler 的 `@RequiredArgsConstructor`；
- 非敏感内部值对象的 `@Getter` / `@Builder`；
- 框架明确要求时的有限 `@NoArgsConstructor`。

本批不批量改写已有 record 或领域对象。只在被 Alignment-1 真实触碰的类中
使用 Lombok，避免制造无意义 diff。

### 5.3 `lombok.config`

至少固定：

```text
config.stopBubbling = true
lombok.addLombokGeneratedAnnotation = true
lombok.sneakyThrows.flagUsage = error
lombok.data.flagUsage = warning
```

架构 Guard 额外拒绝 Security、Credential、Token、Identity 和 Domain 包中的
`@Data`、`@Setter`、`@ToString` 敏感误用。

## 6. Thin Controller 方案

### 6.1 Controller 允许内容

Controller 方法只保留：

```text
接收已验证 HTTP DTO / Header / Path
→ 调用一个 Facade 或 Mapper + Application Service
→ 调用 Response Assembler
→ 返回 ResponseEntity
```

允许 Spring MVC 注解和简单参数转发；禁止事务、权限、幂等、状态迁移、
Repository/Mapper、Provider 调用和复杂分支。

### 6.2 计划中的 Adapter

按领域建立小型 Adapter，不建设万能 HTTP Framework：

```text
authentication/adapter/http/
├── EnterpriseIdentityContractValidator
├── EnterpriseIdentityHttpMapper
├── EnterpriseTokenHttpMapper
└── EnterpriseIdentityResponseAssembler

configuration/adapter/http/
├── EnterpriseConfigurationHttpMapper
└── EnterpriseConfigurationResponseAssembler

shared/adapter/http/
├── EnterpriseBearerTokenExtractor
├── GatewayErrorResponseFactory
└── GlobalExceptionHandler
```

实际命名可以在编码时按现有包风格微调，但职责不得重新塞回 Controller。

### 6.3 现有 Controller 收敛

#### EnterpriseIdentityController

移出：

- `requireEnvelope`；
- `invalidContract`；
- `devicePublicKey/deviceProof` 空值业务校验；
- Domain Command 字段映射；
- Cache-Control 响应组装。

#### EnterpriseAccessTokenController

移出：

- Envelope 校验；
- identity/proof 校验；
- Token Command 映射；
- Cache-Control 响应组装。

#### EnterpriseConfigurationController

移出：

- `BEARER_PREFIX`；
- whitespace/空 Token 校验；
- `ExactPackageReadReference` 构造；
- ETag/304/JSON bytes 分支；
- Cache-Control 响应组装。

#### FoundationFixtureController

保留显式 Fixture Header，但响应组装移入最小 Fixture Assembler。Fixture 不得
被误认为生产 readiness 或生产配置端点。

## 7. Bearer 安全边界

`EnterpriseBearerTokenExtractor` 位于受信 HTTP Security Adapter，负责：

- 精确接受 `Bearer ` 前缀；
- 拒绝缺失、空 Token、非法空白、过长输入和多值歧义；
- 不记录 Authorization Header 或 Token；
- 只向下游返回受限内存中的 compact token；
- 统一抛出 `access_token_invalid`；
- 不把“缺失”和“格式错误”区分给调用方。

第一版不引入完整 Spring Security 登录体系，不建立 Session，也不把 Access
Token 放入全局可变 SecurityContext。原因是当前 Token Validator 和类型化
Application Service 已冻结，Alignment-1 只迁移 HTTP 提取职责。

Filter/Interceptor 如果用于提前拒绝，必须满足：

- 只匹配明确受保护路径；
- order 有自动化验证；
- 不影响 readiness/compatibility/Fixture；
- 不允许未匹配路径绕过 Application 层 Token 校验；
- Controller 和 Service 的安全 Conformance 保持一致。

## 8. GET/POST Architecture Guard

新增不依赖 ArchUnit 的 Java Source Guard，扫描：

- `@GetMapping`；
- `@PostMapping`；
- `@RequestMapping(method = ...)`；
- `@PutMapping`；
- `@PatchMapping`；
- `@DeleteMapping`。

规则：

- 业务端点只允许 GET/POST；
- OPTIONS/HEAD 只能由框架/基础设施提供，业务源码不得声明；
- Controller 禁止导入 Repository、MyBatis、JdbcTemplate、Flyway、
  TransactionManager、Provider SDK；
- Controller 禁止 `@Transactional`；
- Controller 禁止声明 `BEARER_PREFIX` 或直接读取 Token 内容；
- Controller 禁止直接构造持久化 Adapter。

该 Guard 纳入 Central 默认 Maven test 门禁。

## 9. Global Exception Handler

`GlobalExceptionHandler` 替代身份域专用 Handler 的全局所有权，但不把不同
领域异常强制合并成一个大异常类型。

至少映射：

| 类型 | HTTP | 对外语义 |
| --- | --- | --- |
| Contract/validation | 400 | `contract_validation_failed` |
| Authentication | 401 | 模糊认证错误 |
| Authorization | 403 | 固定权限不足 |
| Conflict/idempotency | 409 | typed conflict |
| Persistence integrity | 409/500 | 按是否为调用方冲突区分 |
| Provider unavailable | 503 | retryable typed error |
| Timeout/rate limit | 408/429/503 | 保留 retryable |
| Uncertain | 202/409/503 | 由所属 Contract 明确，不能伪装 failed |
| Unexpected | 500 | 固定安全摘要 |

Alignment-1 只实现当前代码中真实存在的异常类型；Provider/uncertain 的完整
映射由 CGF-2 Contract 冻结后补充，当前不得预造业务状态。

### 9.1 Error Envelope 兼容

当前 `v1alpha1 GatewayError` 保持：

```text
contractVersion
errorCode
category
retryable
safeSummary
correlationId
```

Alignment-1 不向 strict `v1alpha1` JSON Body 直接增加 `traceId`，避免破坏
跨语言 Fixture。首期通过安全响应头返回 Trace ID：

```text
X-RoboThree-Trace-Id
```

未来在 Enterprise Gateway Contract 新版本中再将 `traceId` 加入 Body。该项
在 CGF-2 重新对齐时处理。

### 9.2 Unexpected Error

- 返回固定 `internal_error` 和安全摘要；
- 不返回 exception message、class、stack、SQL、表名或 Provider 原文；
- 服务端日志只记录 errorCode、traceId、correlationId 和受控异常分类；
- 敏感对象禁止被日志参数或自动 `toString` 展开。

## 10. Tracing 方案

### 10.1 依赖方向

计划增加：

```text
spring-boot-starter-actuator
micrometer-tracing-bridge-otel
opentelemetry-exporter-otlp
```

具体版本服从 Spring Boot 3.5.16 dependency management；编码前由 Maven
dependency tree 验证唯一版本，不手写不必要的独立版本。

### 10.2 配置

默认规则：

- W3C `traceparent/tracestate`；
- Test Profile 不访问真实 OTLP Collector；
- OTLP endpoint 未配置时不启动网络 Export；
- endpoint、sampling 和 export timeout 全部外部化；
- Exporter 失败不得改变 HTTP 业务响应；
- health/readiness 不因可选 Trace Backend 不可用而失败；
- Production 是否强制 Trace Backend 由部署阶段决定，不在本批建立 Policy。

### 10.3 Span 边界

允许：

- HTTP route template；
- HTTP method/status；
- Application use-case 名称；
- 数据库 operation 类型；
- Provider 名称的非敏感逻辑 ID；
- errorCode、retryable；
- 有界 duration。

禁止：

- 原始 URL query；
- Authorization/Cookie；
- Token、Credential、API Key；
- Prompt、用户正文、Model 输出；
- Tool 参数/结果；
- Knowledge、Skill、Workspace 内容；
- OA/CAS 登录材料；
- SQL 参数；
- 完整异常 message。

### 10.4 Local Core 边界

Alignment-1 不修改 Local Core。CGF-2 重新对齐时，Local Core 只需在 Gateway
HTTP Client 中生成或透传 W3C Trace Context；是否引入完整 Node OTel SDK
以后续性能和运维需要决定。

## 11. Contract 与数据边界

Alignment-1：

- 不修改 OpenAPI/JSON Schema canonical 文件；
- 不修改 Configuration Snapshot、Package、Identity、Token 或 Device Schema；
- 不修改 PostgreSQL Schema；
- 不修改 Flyway V1～V5；
- 不新增 CGF-2 Model Contract；
- 不改变 Local Core/Desktop Contract；
- 不把 traceId 当作幂等键；
- 不把 trace context 持久化为业务事实。

如果实现过程中发现必须修改公共 Error Body，本批立即停止并回到 Contract
评审，不以“只是增加一个字段”为理由越过 strict Schema。

## 12. 安全测试

Alignment-1A 至少覆盖：

1. GET/POST-only Guard；
2. Controller 无 Repository/JdbcTemplate/Flyway/MyBatis/Provider import；
3. Controller 无 `@Transactional`；
4. 所有受保护端点缺失/错误 Bearer 失败关闭；
5. Bearer 前缀、空值、空白、长度和多值边界；
6. Filter/Interceptor order 不产生绕过；
7. Envelope 类型/版本/必填字段错误仍为原 typed error；
8. Global Handler 不泄漏异常、SQL、Token 和正文；
9. correlationId 保持唯一且不会信任非法客户端值；
10. `@Data/@SneakyThrows` Guard。

Alignment-1B 至少覆盖：

1. 合法 `traceparent` 继续传播；
2. 非法 Trace Context 不被信任且不会导致 500；
3. 每个请求有 traceId；
4. traceId 与 correlationId 不混用；
5. Trace Header 与业务响应一致；
6. Span 不含敏感 Header、Body、Prompt、Token、Credential；
7. Exporter 未配置时零外部连接；
8. Exporter timeout/unavailable 不阻断业务；
9. HTTP 4xx/5xx 使用 typed status/errorCode；
10. 并发请求 Trace Context 不串线。

## 13. 回归门槛

每个开发批次自测至少执行：

```bash
pnpm run check:central
pnpm run check:central:offline
```

阶段关闭时还必须执行：

```text
Java 21 / Maven 3.9.x
Central online：全部测试，0 failures，0 skipped
Central offline：全部测试，0 failures，0 skipped
Testcontainers PostgreSQL 16：实际执行
Embedded PostgreSQL：实际执行
CGF-1.1～CGF-1.3 相关 Conformance：全部回归
```

Alignment-1 不修改 Persistence，但完整数据库门禁仍要执行，以证明 Controller、
Handler 和 Tracing 没有改变已有事务或启动装配。

## 14. 故障与恢复测试

至少验证：

- Global Handler 自身异常时返回固定安全 500；
- Trace Exporter 初始化失败；
- Trace Exporter 请求中断/超时；
- correlation/trace context malformed；
- Controller Mapper/Validator 抛出 typed validation；
- Application Service 抛出 conflict/auth/service error；
- 304 ETag 路径仍无 Body；
- No-store Header 在成功、304 和错误响应中保持；
- 多并发请求不共享 Token、Correlation 或 Trace 可变状态；
- 应用重启后不依赖内存 Trace/Correlation 状态。

## 15. 开发顺序

```text
Alignment-1 Plan
        ↓ Claude Code 文档评审
        ↓ 用户接受并授权 Alignment-1A
Alignment-1A：HTTP/Lombok/Exception/Controller
        ↓ 开发者自测
        ↓ Claude Code 独立 QA
        ↓ 用户接受并授权 Alignment-1B
Alignment-1B：Tracing/Redaction/Regression
        ↓ 开发者自测
        ↓ Claude Code 独立 QA
        ↓ 用户接受并关闭 Alignment-1
Alignment-2A Plan
```

Alignment-1A 的 QA 通过不会自动授权 Alignment-1B；Alignment-1 关闭也不会
自动授权 Alignment-2A。

## 16. 独立 QA 建议范围

Claude Code 应重点验证：

1. 本计划是否无 MyBatis/Flyway/Schema/CGF-2 超前范围；
2. Controller 迁移是否保持原 HTTP/Contract 语义；
3. Bearer 提取移动后是否存在路径或 Filter order 绕过；
4. Global Handler 是否覆盖真实异常且不吞掉 `uncertain`；
5. `v1alpha1 GatewayError` 是否保持 strict 兼容；
6. Lombok 是否不进入 Domain/Security 敏感对象；
7. GET/POST Guard 是否覆盖注解和 `RequestMapping(method=...)`；
8. Trace Exporter 是否可选且故障不阻断；
9. Span/Log 是否无 Token、Prompt、Credential 和正文；
10. 全量 Central online/offline/Testcontainers/Embedded 门禁是否实际执行；
11. Alignment-1A/1B 的进入与关闭门槛是否无歧义；
12. 是否存在新的 P0/P1。

## 17. 工期

集中工程工作量：

```text
Alignment-1A：2～3 个工作日
Alignment-1B：1～2 个工作日
合计：3～5 个工作日
```

不包含 Claude Code 独立 QA、返工、依赖下载或环境等待。工作日是集中工程工作
量，不等于日历承诺。

## 18. 当前门槛

```text
ADR-016：ACCEPTED
Alignment-1 Plan：CONFIRMED_WITH_SPECIFIED_REVISIONS
Alignment-1A：PASS / CLOSED
Alignment-1B：PASS / CLOSED
Alignment-1：PASS / CLOSED
Alignment-2A：GATED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

下一步：

1. Alignment-1B 独立 QA 已实际重跑 Java 21 online/offline 各 77 tests，
   W3C、并发、OTLP 与敏感信息边界全部通过；
2. 用户已接受 QA 结论并关闭 Alignment-1B 与 Alignment-1；
3. 下一步只允许制定并确认 Alignment-2A 方案；
4. Alignment-1 关闭不自动解锁 Alignment-2A/2B 或 CGF-2。
