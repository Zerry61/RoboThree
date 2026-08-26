# ADR-016：Central Java Engineering Baseline

> 状态：**ACCEPTED**  
> 提出日期：2026-07-28  
> 接受日期：2026-07-28  
> 适用范围：Central Enterprise Service 的 Java 工程规范、数据访问、数据库
> 版本治理、HTTP 边界、异常、链路追踪、身份 Adapter 和无状态集群语义  
> 前置决策：ADR-001、ADR-007、ADR-008、ADR-009、ADR-014、ADR-015 草案、
> CGF-1.1～CGF-1.3 已关闭基线  
> 决策来源：公司 Java 技术负责人约束、`DISC-20260728-006-java-baseline-cx`
> 的 Codex 评估、Claude Code QA 评审和用户确认  
> 接受依据：Claude Code 独立文档评审 `PASS`，P0=0、P1=0、P2=1、P3=1；
> P2/P3 已在本次收口中关闭；用户此前明确接受公司基线和执行顺序，并在评审
> 通过后要求开始下一步  
> 当前状态：**Alignment-1、Alignment-2A、Alignment-2B.1、2B.2、2B.3
> 均已通过独立 QA 并由用户接受关闭；Alignment-2B 整体 `PASS/CLOSED`；
> CGF-2 继续 GATED，等待方案重新对齐、确认和用户明确授权**

## 1. 上下文

RoboThree 当前 Central Foundation 已使用 Java 21、Spring Boot、Spring JDBC、
Flyway、PostgreSQL 和 Testcontainers，完成身份、设备信任、短期 Token、企业
配置、Package、Storage Activation 与 Runtime Activation 的多轮独立 QA。

公司 Java 技术负责人进一步明确：

1. ORM 使用 MyBatis-Plus；
2. 不使用 Flyway，数据库变更交付为 SQL 脚本；
3. 企业内部 SSO 使用 CAS；
4. 使用 Lombok 减少样板代码；
5. 业务 HTTP 接口只使用 GET 和 POST；
6. 建立全局异常处理；
7. 请求必须具备链路追踪；
8. Controller 禁止书写业务逻辑；
9. 服务必须无状态并支持集群部署。

这些要求不会改变 Desktop、Local Core、Central Service 的职责边界，但会替换
Central 当前部分工程实现。尤其是 Spring JDBC → MyBatis-Plus、Flyway →
版本化 SQL 脚本和内存事件缓存 → PostgreSQL Durable Event，直接触碰
CGF-1 已验证的事务、幂等、恢复和数据库版本基线。

因此不能在 CGF-2 中边接真实模型边临时迁移基础设施。本 ADR 先冻结目标工程
基线，再通过两个独立 Alignment 阶段完成迁移，最后重新对齐 CGF-2。

## 2. 决策概览

Central Java 目标基线固定为：

```text
Java 21
+ Spring Boot 3.x
+ MyBatis-Plus（仅 Persistence Adapter）
+ PostgreSQL
+ 版本化 SQL Script + Schema Preflight
+ Lombok（受限）
+ GET / POST 业务 HTTP
+ Global Exception Handling
+ Micrometer Observation/Tracing + OpenTelemetry
+ Thin Controller
+ Stateless / Cluster-ready Service
```

执行顺序固定为：

```text
ADR-016
Central Java Engineering Baseline
        ↓ 用户接受
Alignment-1
低风险工程规范
        ↓ 独立 QA + 用户接受
Alignment-2A
MyBatis-Plus + SQL Script + Flyway V1～V5 Bridge
        ↓ 独立 QA + 用户接受
Alignment-2B
Stateless Central Foundation + Dual-Node Harness
        ↓ 独立 QA + 用户接受
CGF-2
按新基线重新对齐方案
```

禁止在 ADR-016 接受前进入 Alignment-1，禁止在 Alignment-1 关闭前进入
Alignment-2A，禁止在 Alignment-2A 关闭前进入 Alignment-2B，禁止在
Alignment-2B 关闭前重新授权 CGF-2 业务编码。

## 3. 当前事实与目标状态

| 领域 | 当前实现事实 | 目标基线 | 转换阶段 |
| --- | --- | --- | --- |
| Java / Framework | Java 21 / Spring Boot 3.x | 保持 | 无迁移 |
| 数据访问 | Spring JDBC / `JdbcTemplate` | MyBatis-Plus Adapter + 关键显式 SQL | Alignment-2 |
| 数据库版本 | Flyway V1～V5 | 版本化 SQL Script + manifest + preflight | Alignment-2 |
| 企业身份 | 通用 `OAIdentityAdapter` / Fake | `CasIdentityAdapter` 为首个生产身份 Adapter | 企业集成阶段 |
| 样板代码 | Java record / 显式构造 | record 保留，有限使用 Lombok | Alignment-1 |
| HTTP 方法 | 当前业务端点已使用 GET/POST | 架构门禁固化 | Alignment-1 |
| 异常处理 | 身份域 `RestControllerAdvice` | 统一安全 Error Envelope | Alignment-1 |
| 链路追踪 | 未建立完整 OTel 基线 | W3C Trace Context + Micrometer/OTel | Alignment-1 |
| Controller | 已委托 Service，但仍有边界逻辑 | Thin Controller | Alignment-1 |
| 集群状态 | Foundation 以单实例验证为主 | PostgreSQL/共享存储为权威、双节点恢复 | Alignment-2 |

在 Alignment-2 通过前，Spring JDBC/Flyway 仍是代码中的已实现事实，但不再是
后续 Central 新功能的目标技术方向。迁移不得通过修改历史结论伪装成“从未使用
Flyway”，也不得删除既有 QA 证据。

## 4. 分层和依赖方向

Central 继续采用模块化单体和类型化 Port：

```text
HTTP Controller
→ Application Facade / Use Case
→ Domain / Application Port
→ Persistence or Provider Adapter
→ MyBatis-Plus Mapper / HTTP Client / Secret Store
```

约束：

- Controller 不直接访问 Mapper、数据库 Entity、Provider SDK 或 Secret Store；
- Domain 和 Application 不导入 MyBatis-Plus `Wrapper`、Mapper、注解或数据库
  Entity；
- Persistence Adapter 负责 Domain Model 与数据库 Entity 的显式转换；
- Provider Adapter 负责 Anthropic/OpenAI-compatible/CAS 等 Wire Protocol；
- 跨语言 Contract 不包含 MyBatis-Plus、Lombok、Spring、Provider SDK 或
  Runtime Handle；
- 不建设通用 `execute()`、万能 Repository 或万能 Provider。

## 5. MyBatis-Plus 边界

### 5.1 允许范围

MyBatis-Plus 只用于 Central Persistence Adapter：

- `BaseMapper` 承担简单、无竞争的 CRUD；
- `LambdaQueryWrapper` / `LambdaUpdateWrapper` 只在 Adapter 内构造和销毁；
- Mapper XML 或显式 SQL 承担关键事务、锁和幂等操作；
- Spring 事务继续由 Application/Adapter 事务边界控制；
- 每次请求使用独立 Wrapper，不共享可变 Wrapper。

### 5.2 必须保留的显式 SQL

以下语义不得为了使用 ORM 改写成普通 CRUD：

- `SELECT ... FOR UPDATE`；
- `INSERT ... ON CONFLICT`；
- expected revision / compare-and-set；
- 相同 ID + digest 幂等、相同 ID + 不同 digest 冲突；
- Device Challenge 单次消费；
- Enrollment、Token Issuance 和 Activation 的单写者；
- Model Invocation 的 accepted/running/terminal/uncertain 原子迁移；
- Durable Event sequence/cursor 推进；
- 数据库 lease/claim 和跨节点恢复。

### 5.3 迁移守卫

Alignment-2 必须对以下既有能力执行逐项等价回归：

- `JdbcAuthenticationPersistence`；
- `JdbcConfigurationPersistence`；
- `JdbcCentralTransactionRunner`；
- `CentralSchemaPreflight`；
- CGF-1.1～CGF-1.3 的 PostgreSQL、Testcontainers、Embedded PostgreSQL、
  故障注入、并发和 close/reopen 测试。

只有测试通过不足以证明等价；独立 QA 还必须核对关键 SQL 的锁、唯一约束、
事务提交点和失败回滚语义。

## 6. 版本化 SQL Script 与 Schema 治理

### 6.1 交付结构

Central PostgreSQL SQL 交付目标为：

```text
services/central/deploy/sql/postgresql/
├── baseline/
├── upgrade/
└── manifest
```

具体文件名和 manifest 序列化格式由 Alignment-2 计划冻结，但必须表达：

```text
schemaVersion
scriptName
scriptDigest
releaseVersion
applyOrder
```

数据库建立：

```text
robothree_schema_version
├── version
├── script_name
├── script_digest
├── applied_at
└── release_version
```

### 6.2 执行所有权

- SQL 由 DBA、部署系统或受控安装流程在服务外执行；
- Central 生产启动只执行只读 Schema Preflight，不自动修改数据库；
- 缺表、缺索引、较旧版本、较新不兼容版本、digest 不匹配均失败关闭；
- 已发布脚本不可修改；修复必须追加新的 upgrade 脚本；
- 服务进程不得把“自动执行 SQL”作为恢复 Schema 不匹配的降级路径。

### 6.3 Flyway V1～V5 桥接

既有 V1～V5 是已通过独立 QA 的历史事实，迁移必须满足：

1. 原始 V1～V5 SQL 和 checksum 保持不变；
2. 不删除或改写既有 `flyway_schema_history`；
3. 提供一次性、可审计的桥接脚本，把 V1～V5 已应用事实物化进
   `robothree_schema_version`；
4. 桥接前验证历史版本、checksum、表和索引完整性；
5. 已是新基线的数据库重复执行桥接必须幂等；
6. 从 Flyway V5、全新 baseline 和受支持 upgrade 三条路径都必须由
   Testcontainers 实际执行；
7. 迁移窗口内同时保留旧历史校验 Fixture 与新 manifest 校验 Fixture；
8. Alignment-2 关闭后，应用运行时不再依赖 Flyway 执行 migration。

任何无法从真实 V5 数据库验证的桥接方案均为 P0 阻断。

## 7. CAS 企业身份边界

ADR-014 的所有者分层保持不变：

```text
EnterpriseUserIdentityVerifier
└── CasIdentityAdapter
```

CAS 只证明企业用户身份，不能替代：

- Managed Device Trust；
- RoboThree Permission；
- Compatibility；
- Short-lived RoboThree Access Token。

身份链保持：

```text
CAS Verified Identity
∩ Managed Device Trust
∩ RoboThree Permission
∩ Compatibility
→ Short-lived RoboThree Access Token
```

本 ADR 只冻结“CAS 是首个生产企业身份 Adapter”，不冻结经典浏览器 CAS、
CAS REST、Proxy Ticket、Electron 内嵌流程或公司封装 Ticket Exchange。

ADR-014 当前“不使用系统浏览器和 Callback”的约束继续有效。在公司确认 CAS
Wire Protocol 前：

- 不实现真实 `CasIdentityAdapter`；
- 不把用户名、密码、Ticket 或私有字段写入 canonical Contract；
- 不自行设计密码加密或 CAS 私有协议；
- Development Profile 继续使用 ADR-015 的 Fake/Test Identity；
- Alignment-1 和 Alignment-2 不因 CAS 待定而阻塞；
- 真实企业身份集成和企业试点保持 `GATED`。

如果公司 CAS 只能使用与 ADR-014 冲突的浏览器/Callback 流程，必须在真实集成
前通过新的 ADR 修订或替代该部分约束。

## 8. Lombok 使用规范

允许：

- `@RequiredArgsConstructor`；
- `@Getter`；
- `@Builder`；
- 框架确有需要时的有限 `@NoArgsConstructor`；
- 不含敏感信息的内部不可变值对象使用 `@Value`。

禁止：

- Domain、Identity、Credential、Token、Secret 和持久事实对象使用 `@Data`；
- `@SneakyThrows`；
- 通过大范围 `@Setter` 形成可变领域对象；
- 自动 `toString` 输出 Token、Credential、签名、Prompt、Provider 请求或其他
  敏感字段；
- 为统一形式而把已有 Java record 全部重写成 Lombok class。

Alignment-1 建立 `lombok.config` 和静态守卫，至少禁止 `@SneakyThrows`，
并对 `@Data` 进行架构检查。

## 9. HTTP 方法和 Thin Controller

### 9.1 HTTP 方法

业务端点只使用：

- GET：查询、readiness、compatibility、状态读取和 SSE；
- POST：创建、命令、更新意图、取消、重试和确认。

业务 Controller 禁止 PUT、PATCH、DELETE。OPTIONS/HEAD 可以由浏览器、代理、
负载均衡器或框架提供，不作为业务 API。

### 9.2 Controller 边界

Controller 只负责：

1. 接收已验证的 HTTP 输入；
2. 调用一个明确的 Application Facade/Use Case；
3. 交给 Response Assembler 形成 HTTP 响应。

以下逻辑必须迁出 Controller：

- Bean/Contract 业务校验 → Validator；
- Bearer 提取和格式校验 → Security Filter/Interceptor；
- DTO/Command 映射 → Mapper；
- ETag、Cache Header 和 Error Envelope → Response Assembler；
- 事务、权限、幂等、状态迁移和 Provider 分支 → Application Service。

Bearer 逻辑迁移后必须保持现有严格语义：

- 缺失、非法前缀、空白、过长或格式错误均失败关闭；
- 不能因 Filter 顺序或路径匹配绕过 Token 校验；
- 对外统一为模糊的 `access_token_invalid`，不泄露判断细节。

## 10. 全局异常和安全 Error Envelope

建立统一 `GlobalExceptionHandler`，覆盖：

- validation；
- authentication / authorization；
- conflict / idempotency；
- persistence / integrity；
- provider；
- timeout / rate limit；
- cancellation / uncertain；
- unexpected。

公共错误至少表达：

```text
contractVersion
errorCode
category
retryable
safeSummary
correlationId
traceId
timestamp
```

现有 Contract 字段只允许 additive、兼容演进；不得为了统一 Handler 静默改写
已接受 Envelope。未知异常只返回安全摘要，禁止泄漏 Stack Trace、SQL、表名、
Provider 原文、Token、API Key、Authorization Header、Prompt 或用户正文。

异常处理不得把 `uncertain` 伪装成 `failed`，也不得把 Provider 失败转换为
HTTP 200 的业务成功。

## 11. 链路追踪

Central 使用：

```text
Spring Boot Actuator
+ Micrometer Observation / Tracing
+ OpenTelemetry Bridge
+ OTLP Exporter
+ W3C traceparent / tracestate
```

规则：

- `traceId` 与业务 `correlationId`、`clientRequestId`、`invocationId` 分离；
- HTTP、数据库事务、CAS Adapter、Model Provider 和 SSE 建立可关联 Span；
- Local Core 首期只需生成或透传 W3C Trace Context，不因本 ADR强制引入完整
  OpenTelemetry SDK；
- Trace Exporter 不可用不得改变业务结果或阻塞请求；
- Sampling、Exporter 和 Endpoint 必须外部配置；
- Span、Tag、日志和异常禁止记录 Token、Credential、API Key、Authorization
  Header、Prompt、Tool 参数、Knowledge、Workspace 正文或完整 Model 输出；
- `traceId` 可以进入安全 Error Envelope 和审计元数据，但不能作为业务幂等键。

## 12. 无状态与集群语义

### 12.1 “无状态”的定义

Central 实例内可以存在：

- 当前 HTTP/SSE 连接；
- 请求级对象和 Provider Client；
- 有界、可丢弃、可重建的只读缓存；
- 不影响正确性的短期指标聚合。

实例内不得作为权威保存：

- Identity、Device、Permission、Token Issuance；
- Configuration、Package、Activation；
- Model Invocation；
- idempotency、cancel、deadline；
- Durable Event、event sequence、cursor；
- 跨节点 lease、claim 或 recovery owner。

权威事实进入 PostgreSQL 或公司共享 Secret Store。服务不得依赖 sticky
session 才能保证正确性。

### 12.2 Model Invocation 与 Durable Event 目标语义

CGF-2 重新对齐后必须使用 PostgreSQL 持久化：

- Invocation accepted/running/terminal/uncertain；
- clientRequestId + digest 幂等；
- Provider dispatch decision；
- cancel intent 和结果；
- Durable Event sequence、digest 和 cursor；
- 恢复 claim/lease。

SSE 连接和未持久化的 token delta 可以是瞬时的；重连必须由 Invocation
Snapshot + durable cursor 收敛，任意节点都可以完成 status、cancel 和
reconnect。不得以进程内 Event Buffer 作为唯一恢复来源。

这些是 CGF-2 的目标不变量，不授权 Alignment-2 提前创建 Model Invocation、
Provider Dispatch 或 Model Durable Event。Alignment-2 只建立数据访问、
Schema、生产装配和现有 Central Foundation 的无状态集群基础。

Alignment-2A 不为 CGF-2 预建 `model_invocation`、
`model_invocation_events` 或其他占位表。原因：

- 表结构依赖尚未重新确认的 CGF-2 Contract、状态、索引和保留策略；
- 预建空表会把未接受的业务 Schema 固化进数据库基线；
- 版本化 SQL 的目的就是允许后续通过新的、可审计 upgrade script 演进；
- CGF-2 增加下一版本 SQL 是正常演进，不是 Alignment-2 设计失败。

Alignment-2A 只在 SQL manifest 和命名规范中保留“允许后续追加 migration”的
机制，不保留猜测性的业务字段或空表。

### 12.3 Production Profile fail-closed

Production Profile 必须断言：

- `InMemoryCentralPersistence` 不存在；
- Fake Identity、Fake Device Trust、Fake Token Codec、Fake Secret Store 和
  Development Credential Source 不存在；
- MyBatis Mapper、PostgreSQL Persistence 和生产 Secret Store Port 可用；
- 缺少任一生产依赖时启动失败，而不是回退到 Fake/InMemory。

### 12.4 双节点验收分层

Alignment-2 必须先实际运行 Central Foundation 双节点 Harness：

```text
Node A / Node B 共享同一 PostgreSQL
→ 身份、设备、Token 和配置事实可由任意节点读取
→ 并发消费/写入仍保持单写者和幂等
→ Node A 退出后 Node B 不依赖实例内权威状态
→ 配置 ETag、权限和审计事实保持一致
```

至少覆盖：

- Node A 签发 Challenge、Node B 验证/消费；
- 两节点并发消费同一 Challenge 只有一个成功；
- Node A 签发 Token 后，Node B 可以依据共享持久事实完成验证和配置读取；
- Snapshot/Package/ETag 在两个节点返回一致结果；
- 任一节点停止后，另一节点继续提供 readiness、compatibility 和已实现的
  Foundation 读写能力；
- Production Profile 不存在 Fake/InMemory fallback。

双节点测试不依赖 sticky session，不以 Mock 数据库代替 PostgreSQL。

CGF-2 实现 Model Invocation 后，再增加第二层双节点 Harness，覆盖 accepted、
running、Provider 请求、terminal、cancel、Durable Event、SSE reconnect 和
lease 接管。该 Harness 属于 CGF-2 关闭门槛，不得用 Alignment-2 Foundation
Harness 替代。

## 13. 两个 Alignment 阶段

### 13.1 Alignment-1：低风险工程规范

范围：

- Lombok 受控接入和静态规则；
- Global Exception Handler；
- Thin Controller；
- GET/POST 架构守卫；
- Micrometer/OTel 链路追踪；
- 敏感信息清洗；
- Bearer Filter 顺序和路径回归。

非范围：

- MyBatis-Plus；
- SQL Script/Flyway 桥接；
- Model Invocation；
- Durable Event；
- 真实 CAS；
- 真实 DeepSeek；
- CGF-2 Contract。

退出门槛：

- 独立 QA 通过；
- 现有 CGF-1 Central online/offline 测试通过；
- Error Envelope 兼容；
- Controller 无业务逻辑；
- GET/POST Guard 有自动化；
- Trace 不泄漏敏感信息且 Exporter 故障不阻断业务；
- 用户明确接受并关闭 Alignment-1。

### 13.2 Alignment-2：Persistence + Stateless

Alignment-2 正式拆为两个独立检查点：

```text
Alignment-2A
MyBatis-Plus + SQL Script + Flyway V1～V5 Bridge + Schema Preflight

Alignment-2B
Stateless Central Foundation + Dual-Node Recovery Harness
```

退出门槛：

- MyBatis-Plus 不进入 Domain/Application；
- 关键锁和幂等继续使用显式 SQL；
- V1～V5 bridge、全新 baseline 和 upgrade path 实际通过；
- CGF-1 全量 Central online/offline、Testcontainers、Embedded PostgreSQL、
  Conformance、并发、故障注入和恢复测试全部通过；
- Production Profile Fake/InMemory fail-closed；
- 现有身份、设备、Token 和配置链的双节点 PostgreSQL Harness 实际通过；
- 独立 QA 分别通过；
- 用户明确接受并关闭 Alignment-2。

## 14. CGF-2 重新对齐

Alignment-2 关闭后，CGF-2 必须重新进入方案评审，不沿用旧计划直接编码。

至少修订：

- Flyway migration → 版本化 SQL Script；
- 进程内有界 Event Buffer → PostgreSQL Durable Event；
- Cursor、event dedupe、cancel、lease 和跨节点 recovery；
- Production Profile fail-closed；
- Trace Context 和安全 Error Envelope；
- MyBatis-Plus Adapter 与关键显式 SQL；
- 双节点故障矩阵；
- Model Invocation/Durable Event 专项双节点 Harness；
- Development DeepSeek 与企业 MaaS Adapter 的隔离。

继续保持：

- Anthropic 与 OpenAI-compatible 双协议兼容；
- Local Core 负责 Runtime Selection，Central 不自动选模；
- accepted/running/terminal/uncertain 独立 Model Invocation；
- 企业凭证不下发 Local Core/Desktop；
- Development Profile 可以使用测试企业上下文和真实 DeepSeek；
- 真实 CAS、企业 MDM、正式 RBAC、企业 MaaS 与生产 Secret Store 后置到
  Enterprise Pilot Readiness。

CGF-2 Foundation 可声明：

```text
MODEL_GATEWAY_FOUNDATION_PASS
ENTERPRISE_PILOT_NOT_READY
```

不能因为真实 DeepSeek 可调用就宣称企业集成完成。

## 15. 不采纳的替代方案

### 15.1 直接在 CGF-2 中完成迁移

拒绝。持久化迁移和真实 Provider 同时进入会扩大故障面，无法区分基础设施问题、
Provider 问题和 Contract 问题。

### 15.2 为保留现有代码拒绝公司技术基线

拒绝。Central 属于公司企业后端，必须满足公司统一工程和运维要求。

### 15.3 使用 MyBatis-Plus 重写所有 SQL

拒绝。关键事务、锁、幂等和恢复需要可审计的显式 SQL。

### 15.4 删除 Flyway 历史后重新 baseline

拒绝。会丢失已验证迁移事实和升级审计链。

### 15.5 以 sticky session 实现集群

拒绝。实例故障后无法保证任意节点恢复，也不能证明服务真正无状态。

### 15.6 等真实 CAS 完成后再做全部 Alignment

拒绝。Alignment-1/2 与具体 CAS Wire Protocol 解耦；等待公司 IT 会无意义
延迟基础工程治理和 Model Gateway Foundation。

## 16. 后果与权衡

正面后果：

- 符合公司 Java、数据库交付和集群部署规范；
- 保留 RoboThree 类型化 Port、失败关闭、幂等和恢复不变量；
- 把低风险工程规范与高风险持久化迁移分开验收；
- CGF-2 获得真实的多节点恢复和可观测基础；
- 真实 CAS/MaaS 后置时，Development DeepSeek 仍可独立验证体验。

成本：

- 需要迁移已通过大量 QA 的 Spring JDBC/Flyway 基线；
- Alignment-2 必须维护一段时间的旧/新 Schema 初始化测试；
- Durable Event 和双节点 Harness 增加实现与测试工作量；
- MyBatis-Plus 不会消除关键 SQL 和事务设计成本；
- 真实 CAS 仍依赖公司 IT 提供准确 Wire Protocol 和测试环境。

集中工程工作量初估：

```text
ADR-016 文档与评审：1～2 天
Alignment-1：3～5 天
Alignment-2：10～17 天
CGF-2 方案重新对齐：1～3 天
真实 CAS Adapter：5～10 天 + 公司 IT 等待（独立后置）
```

这是集中工程工作量，不是日历交付承诺，不包含独立 QA 和返工。

## 17. 接受门槛

ADR-016 已按以下条件接受：

1. 公司九项 Java 技术要求作为 Central 目标基线；
2. MyBatis-Plus 只进入 Persistence Adapter，关键 SQL 保持显式；
3. Flyway V1～V5 使用保留历史的桥接方案，不删除历史；
4. Production Profile Fake/InMemory fail-closed；
5. Alignment-2A 不预建 CGF-2 占位表；Alignment-2B 必须通过 Central
   Foundation 双节点 PostgreSQL Harness；
   Model Invocation/Durable Event 双节点 Harness 是后续 CGF-2 硬门槛；
6. CAS 是首个生产身份 Adapter，但具体 Wire Protocol 后置；
7. 真实 CAS 不阻塞 Alignment-1/2 和 Development DeepSeek；
8. 执行顺序为 ADR-016 → Alignment-1 → Alignment-2A → Alignment-2B →
   CGF-2 重新对齐；
9. 每个 Alignment 独立 QA、独立用户接受，不一次性整批关闭；
10. CGF-2 在 Alignment-2 关闭前保持 `GATED`。

## 18. 当前状态

```text
ADR-016：ACCEPTED
Alignment-1：PASS / CLOSED
Alignment-2A Plan：CONFIRMED
Alignment-2A.1：PASS / CLOSED
Alignment-2A.2：PASS / CLOSED
Alignment-2A.3：PASS / CLOSED
Alignment-2A：PASS / CLOSED
Alignment-2B Plan：CONFIRMED_WITH_SPECIFIED_REVISIONS
Alignment-2B.1：PASS / CLOSED
Alignment-2B.2：PASS / CLOSED
Alignment-2B.3：PASS / CLOSED
Alignment-2B：PASS / CLOSED
CGF-2：GATED / RE-ALIGNMENT PENDING
真实 CAS：DEFERRED / ENTERPRISE PILOT GATE
```

下一步：

1. 重新对齐 CGF-2 方案与 ADR-016、已关闭的 Alignment-2 基线；
2. CGF-2 方案必须经过评审和用户确认；
3. 未获得用户对具体 CGF-2 批次的明确授权前不得编码。
