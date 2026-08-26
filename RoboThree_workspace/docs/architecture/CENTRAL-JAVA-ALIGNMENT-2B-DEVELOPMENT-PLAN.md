# Central Java Alignment-2B Development Plan

> 状态：**PASS/CLOSED**  
> 当前批次：**Alignment-2B.3 PASS/CLOSED — INDEPENDENT QA + USER ACCEPTED**  
> 前置批次：Alignment-2B.1、Alignment-2B.2 `PASS/CLOSED`  
> 后续门槛：CGF-2 `GATED`  
> 版本序列：`0.0.0-cja.2b.1` → `0.0.0-cja.2b.2` →
> `0.0.0-cja.2b.3`  
> 依据：ADR-016、Alignment-2A `PASS/CLOSED`、讨论线程
> `DISC-20260729-002-alignment-2b-plan-cx`、Claude Code 修订版复核
> `P0/P1/P2/P3=0` 和用户明确授权

## 1. 阶段目标

Alignment-2B 只证明现有 Central Foundation：

1. 权威状态来自 PostgreSQL 或外部共享 Port；
2. Production Profile 缺依赖时失败关闭，不回退 Fake/InMemory；
3. 两个独立 Central 节点不依赖 sticky session 或共享 Java 内存；
4. 任一节点退出后，另一节点可以继续基于共享事实正确服务；
5. 身份、设备、权限、Challenge、Token issuance、Configuration 与 Package
   的既有事务、幂等和恢复语义保持不变。

阶段关闭后只允许声明：

```text
STATELESS_CENTRAL_FOUNDATION_PASS
DUAL_NODE_FOUNDATION_HARNESS_PASS
ENTERPRISE_PILOT_NOT_READY
```

不得声明 Model Gateway、CAS、MaaS 或企业生产接入已经完成。

## 2. 无状态边界

### 2.1 实例内允许存在

- 当前 HTTP 连接、请求 DTO、Trace 与 Security Context；
- DataSource 连接池、Provider Client；
- 有界、可丢弃、可重建且不影响正确性的只读缓存；
- 指标聚合和仅用于观测的 runtime instance 标识。

### 2.2 实例内不得成为权威

- Identity、Device、Permission、Challenge 与消费结果；
- Access Token Issuance；
- Configuration、Package、revision、digest 与 ETag；
- Storage/Runtime Activation；
- 幂等、冲突和恢复判断；
- 未来 Model Invocation、Durable Event、cancel、lease。

业务正确性只能由 PostgreSQL、外部 `EnterpriseSecretStore` 和请求携带的有效
短期 Access Token 决定。

## 3. Profile

### 3.1 development

允许本地 Fixture、Test Identity/Token/Secret 和单节点开发体验，必须明确为：

```text
DEVELOPMENT_ONLY
NOT_ENTERPRISE_READY
```

### 3.2 production

Production 使用显式、版本化的 `Production Dependency Manifest` 白名单。
至少覆盖：

- DataSource、PlatformTransactionManager、CentralTransactionRunner；
- MyBatis Authentication/Configuration Persistence；
- Schema Mapper 与 Schema Preflight；
- Identity Verification；
- Device Trust 与 Device Proof Verification；
- EnterpriseSecretStore、RoboThreeAccessTokenCodec；
- Compatibility、Configuration 与 Package Repository。

缺失或歧义必须 typed failure；Fake/InMemory/Development 负向扫描是第二道
守卫。禁止 `@Primary` 假实现、`@ConditionalOnMissingBean` Fake fallback
和 development 配置继承。Fixture Controller 不得暴露。

真实 CAS、MDM、生产 Secret Store 尚未接入，因此本阶段建立装配和失败关闭
规则，不伪造企业生产环境已经可启动。

### 3.3 cluster-harness

仅存在于 test source/test configuration。使用两个独立节点、两个随机
loopback 端口、独立连接池、同一个 Testcontainers PostgreSQL 16 和分别实例化
的 Test-only Adapter。禁止复用 development Fake 或共享可变 Java 权威状态。

## 4. Alignment-2B.1：Production Composition 与 Fail-Closed

### 4.1 交付

1. Production Dependency Manifest；
2. Context ready 前执行的 Startup Validator；
3. Fake/InMemory/Development Bean 负向扫描；
4. Fixture Controller Profile 隔离；
5. liveness/readiness 分离；
6. DataSource `SELECT 1`；
7. Schema ledger、version、digest、manifest 与完整 Preflight；
8. Authentication/Configuration 表零结果只读探针；
9. MyBatis Mapper、Transaction Runner 和必需 Port 装配检查；
10. Source Guard、ApplicationContextRunner 与动态回归。

Readiness 允许合法空业务库。无用户、设备、权限或配置是业务请求的 typed
domain error，不应使整个节点 unhealthy。

### 4.2 失败语义

启动失败使用 typed、安全摘要，不暴露 SQL、表结构、数据库地址或 Secret：

```text
central.production_dependency_missing
central.production_dependency_ambiguous
central.production_forbidden_dependency
central.production_database_unavailable
central.production_connection_probe_invalid
central.production_read_probe_invalid
central.production_readiness_failed
```

### 4.3 验收

- production 缺任一白名单依赖时启动失败；
- Fake/InMemory 存在时启动失败；
- development 既有 Foundation 路径不回归；
- 空业务表且 Schema 合法时 Readiness 通过；
- 数据库、Schema 或 digest 漂移时 Readiness 失败；
- Testcontainers 与 Embedded PostgreSQL 实际执行；
- Central online/offline 和根级门禁通过；
- 独立 QA、用户接受后才解锁 2B.2。

## 5. Alignment-2B.2：Dual-Node Foundation Correctness

### 5.1 双 JVM 硬证据

至少一条 Harness 必须是两个独立 JVM、双随机端口、双独立 DataSource/连接池、
共享同一个 Testcontainers PostgreSQL。以下五项必须走双 JVM：

1. Node A 签发 Challenge，Node B 验证和消费；
2. A/B 并发消费同一 Challenge，只有一个成功；
3. A 完成 Token issuance，B 验证 Token 并读取 Configuration；
4. A 停止后 B 继续服务；
5. A 重启后只从 PostgreSQL 和 Test-only 外部 Port 恢复。

其他高组合矩阵可用两个独立 ApplicationContext 加速，但不能替代双 JVM。

### 5.2 跨节点矩阵

- Identity、Device、Challenge、Token、Configuration、Package 与 ETag；
- 相同 ID/digest 幂等、相同 ID/不同 digest 冲突；
- `304` 必须 bodyless；
- correlationId/traceId/Bearer Context 不串线；
- 连续步骤随机路由 A/B 仍可完成；
- Permission revision：

```text
same revision + same content → idempotent
same revision + different content → persistence.permission_conflict
older revision → persistence.permission_stale
newer revision → success
```

必须经过 HTTP/Application、Spring Transaction、MyBatis 显式 SQL 和
PostgreSQL，不得以 Mapper 单测推断跨节点结论。

## 6. Alignment-2B.3：Failure、Recovery 与收口

覆盖：

1. commit 前节点退出：事务回滚；
2. commit 后响应丢失：另一节点以相同 ID/digest 幂等收敛；
3. Challenge 消费中退出：只允许未消费或已消费两种可信结果；
4. 单节点退出后另一节点继续 Foundation 服务；
5. 节点重启只从 PostgreSQL/外部 Port 恢复；
6. 同 ID/不同 digest 跨节点并发稳定 conflict；
7. 数据库不可用时 readiness 下降，恢复后重新 ready；
8. Schema version/digest 漂移双节点失败关闭；
9. 线程、连接池、端口、timer 与容器资源归零；
10. Harness 重复启动/停止无泄漏。

本阶段不建立通用 lease/claim；Model Invocation lease 只属于 CGF-2。

## 7. 数据库与安全

- Alignment-2B 原则上不新增业务表，不预建 CGF-2 占位表；
- 继续使用显式 `FOR UPDATE`、`ON CONFLICT`、revision/CAS；
- MyBatis 和 Spring Transaction 必须使用同一 Connection；
- 生产启动只读 Schema，不自动执行 SQL；
- Test-only 密钥按节点分别注入，不进入源码、日志、Trace、Fixture 或 QA 报告；
- 报告只允许 digest、status、count、duration、resource metrics 和 typed code。

## 8. 明确非目标

本阶段不实现：

- Model Invocation、Provider Dispatch、DeepSeek；
- Anthropic/OpenAI-compatible Adapter、企业 MaaS；
- Model SSE、Durable Event Cursor、跨节点 Streaming reconnect、Token delta
  恢复；
- Model cancel/timeout/uncertain、lease/claim；
- 真实 CAS、MDM、设备证书、正式 RBAC、生产 Secret Store；
- Tool Gateway/MCP、Policy Engine、多租户、Kubernetes、Service Mesh；
- 通用分布式锁、Audit 新领域、微服务拆分。

## 9. 工期

```text
2B.1：2～3 个集中工程工作日
2B.2：3～5 个集中工程工作日
2B.3：3～5 个集中工程工作日
总计：8～13 个集中工程工作日
日历参考：13～22 天
```

工程工作量不包含真实企业集成、独立 QA 等待和重大返工。

## 10. 阶段门槛

```text
Alignment-2B.1：
PASS / CLOSED

Alignment-2B.2：
PASS / CLOSED

Alignment-2B.3：
PASS / CLOSED

CGF-2：
GATED
```

CGF-2 进入条件固定为：

```text
Alignment-2B PASS/CLOSED
AND CGF-2 plan re-aligned to ADR-016 and confirmed
AND explicit user authorization for a concrete CGF-2 batch
```

Alignment-2B 关闭不自动解锁 CGF-2。
