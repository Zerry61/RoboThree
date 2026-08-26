# RoboThree Central Java Alignment-2A 开发计划

> 阶段：`Alignment-2A — Persistence Migration`  
> 状态：**PASS/CLOSED；2A.1、2A.2、2A.3 全部 PASS/CLOSED**  
> 日期：2026-07-28  
> 前置状态：ADR-016 `ACCEPTED`；Alignment-1A、Alignment-1B 与
> Alignment-1 `PASS/CLOSED`  
> 后续门槛：Alignment-2B 与 CGF-2 继续 `GATED`  
> 阶段结果：Production Persistence Cutover 已完成并通过独立 QA 与用户验收；
> Alignment-2B 与 CGF-2 继续 GATED

## 1. 阶段目标

Alignment-2A 将 Central Foundation 已通过独立 QA 的：

```text
Spring JDBC
+ Flyway V1～V5
+ 应用内自动 Migration
```

迁移为：

```text
MyBatis-Plus Persistence Adapter
+ 关键显式 SQL
+ 外部执行的版本化 PostgreSQL SQL Script
+ Manifest / Digest
+ 应用启动只读 Schema Preflight
```

本阶段是等价基础设施迁移，不增加业务能力，不修改身份、设备、Token、配置或
Package 的领域语义。完成后必须继续满足 CGF-1.1～CGF-1.3 已冻结的事务、
幂等、单写者、失败关闭、崩溃恢复和敏感信息边界。

阶段关闭只能声明：

```text
ALIGNMENT_2A_PERSISTENCE_MIGRATION_PASS
```

不能声明：

```text
STATELESS_CLUSTER_READY
MODEL_GATEWAY_READY
ENTERPRISE_PILOT_READY
```

## 2. 已有事实与迁移原则

### 2.1 已有事实

- PostgreSQL 16 是 Central 权威数据库；
- 当前生产持久化实现为 `JdbcAuthenticationPersistence`、
  `JdbcConfigurationPersistence` 和 `JdbcCentralTransactionRunner`；
- `CentralSchemaManager` 当前使用 Flyway 执行 V1～V5；
- `CentralSchemaPreflight` 当前依赖 `flyway_schema_history` 和版本 5；
- Testcontainers PostgreSQL 16、Embedded PostgreSQL 16、InMemory
  Conformance、命名崩溃点和并发单写者测试已经通过独立 QA；
- canonical Enterprise Gateway Contract、领域 Port 和 Domain Model
  不依赖 JDBC/Flyway。

### 2.2 迁移原则

1. 先冻结并验证 Schema 路径，再替换 Persistence Adapter；
2. 先让新旧 Adapter 共用同一 Conformance，再删除生产旧实现；
3. MyBatis-Plus 只进入 Persistence Adapter；
4. 关键锁、幂等和 CAS 使用 Mapper XML 或显式 SQL；
5. SQL 由 DBA、部署系统或受控安装流程执行，服务不得自动升级 Schema；
6. 旧 V1～V5 和 `flyway_schema_history` 保留为历史事实；
7. 新 Preflight 只读、失败关闭，不提供自动修复；
8. 所有迁移必须在真实 PostgreSQL 上验证，不能以 H2 或 Mock 数据库替代。

## 3. 目标依赖与使用边界

### 3.1 MyBatis-Plus

Alignment-2A 计划固定：

```text
com.baomidou:mybatis-plus-spring-boot3-starter:3.5.16
```

版本依据为 MyBatis-Plus 官方
[v3.5.16 更新日志](https://baomidou.com/resources/changlog/)。该版本面向
Spring Boot 3 和 Java 21；RoboThree 使用 Spring Boot 3.5.16，因此仍必须以
本项目 dependency tree 与完整门禁确认兼容，不能仅依据上游声明。

在 2A.1 加入依赖后立即执行 Maven dependency tree，验证与 Spring Boot
3.5.16、Java 21 的唯一版本收敛；依赖验证通过前不得继续实现 Schema Mapper。
禁止使用动态版本范围。

首期不引入：

- MyBatis-Plus Generator；
- Active Record；
- 通用 ServiceImpl；
- Dynamic Datasource；
- 多租户插件；
- 分页、逻辑删除、自动填充；
- SQL 打印或请求参数日志插件；
- 为未来 CGF-2 预装的 Parser/Interceptor。

如果 starter 传递依赖引入未使用的组件，必须通过 dependency tree 和 fat jar
检查确认边界，不能默认启用。

生产配置必须显式使用：

```text
org.apache.ibatis.logging.nologging.NoLoggingImpl
```

禁止 MyBatis/MyBatis-Plus 输出 SQL、参数、结果行或 Wrapper 内容。2A.1 必须
通过配置检查、日志捕获和 Trace 动态扫描验证，无论应用日志级别如何变化，
敏感数据库内容都不会被 ORM 日志路径输出。

### 3.2 Spring JDBC 与 Flyway

迁移完成后的生产代码必须满足：

- 不存在 `JdbcTemplate` 直接数据访问；
- 不存在 Flyway runtime dependency；
- 不存在服务启动自动 `migrate()`；
- `spring-boot-starter-jdbc` 只在 MyBatis-Plus 所需依赖链中出现，不作为
  业务 Adapter 的直接访问方式；
- 测试代码允许使用原生 JDBC 进行 Schema 破坏、行数、锁和敏感数据扫描；
- 过渡批次可以使用当前 Flyway 生成一次冻结的 V5 历史证据；2A.3 结束后
  Maven 依赖和 fat jar 中 Flyway 均为零，后续测试只使用逐字节冻结的 V1～V5
  SQL 与 history Fixture，不再调用 Flyway runtime。

## 4. 包结构与依赖方向

目标结构：

```text
authentication/domain + port
configuration/domain + port
                ↑
persistence/mybatis/
├── adapter/
│   ├── MyBatisAuthenticationPersistence
│   └── MyBatisConfigurationPersistence
├── entity/
├── mapper/
├── typehandler/
├── transaction/
│   └── SpringCentralTransactionRunner
└── schema/
    ├── SchemaManifestLoader
    └── CentralSchemaPreflight
```

Mapper XML：

```text
services/central-service/src/main/resources/
└── mybatis/
    ├── AuthenticationMapper.xml
    └── ConfigurationMapper.xml
```

依赖规则：

```text
HTTP
→ Application
→ Domain Port
→ MyBatis Persistence Adapter
→ Mapper / Entity / TypeHandler
→ PostgreSQL
```

禁止：

- Domain/Application 导入 MyBatis-Plus、MyBatis、Spring JDBC 或数据库 Entity；
- Controller 导入 Mapper、Entity、Wrapper 或事务实现；
- Mapper 返回 Domain Model；
- `QueryWrapper`、`LambdaQueryWrapper` 或 `UpdateWrapper` 逃出 Adapter；
- 建立万能 Repository、万能 Mapper 或字符串表名执行器；
- Entity 自动 `toString()` 暴露 Token digest、Public Key 或配置正文。

## 5. Entity、Mapper 与转换规则

### 5.1 Entity

数据库 Entity 只表达持久化行：

- 位于 `persistence.mybatis.entity`；
- 可使用受限 Lombok `@Getter`、`@Builder`；
- 不使用 `@Data`、`@Setter`、`@SneakyThrows`；
- PostgreSQL `TIMESTAMPTZ` 明确映射为 UTC `Instant`/`OffsetDateTime`；
- `TEXT[]` 使用显式 TypeHandler，不以逗号字符串降级；
- JSON 文档保持 canonical String，不由 ORM 自动解析重写；
- Domain ↔ Entity 使用显式 Converter，禁止反射复制。

### 5.2 BaseMapper 使用范围

`BaseMapper` 只用于无竞争、无状态迁移的简单精确读取。以下操作必须使用
Mapper XML 或显式 Mapper SQL：

- `SELECT ... FOR UPDATE`；
- `INSERT ... ON CONFLICT ...`；
- permission revision 比较与更新；
- Enrollment Grant 单次消费；
- Device Challenge 单次消费和 request digest 幂等；
- Access Token Issuance 唯一写入；
- immutable Snapshot/Package 相同键+相同 digest 幂等；
- active Configuration 唯一性冲突；
- 任何 affected-row count 决定业务冲突类型的写入。

禁止为了“ORM 化”把这些操作拆成：

```text
select
→ Java if
→ update
```

关键判断必须在同一数据库事务和同一显式 SQL 条件内完成。

## 6. SQL Script 交付结构

实际仓库路径固定为：

```text
services/central-service/deploy/sql/postgresql/
├── baseline/
│   └── B0006__central_foundation.sql
├── upgrade/
│   └── U0006__bridge_from_flyway_v5.sql
├── legacy-flyway/
│   ├── V1__verified_identity_and_permissions.sql
│   ├── V2__device_registration_enrollment_and_challenge.sql
│   ├── V3__token_issuance.sql
│   ├── V4__immutable_configuration.sql
│   └── V5__challenge_consumption_idempotency.sql
├── manifest/
│   ├── postgresql-v0006.json
│   └── postgresql-v0006.json.sha256
└── README.md
```

说明：

- `legacy-flyway/` 中 V1～V5 必须与现有文件逐字节一致；
- 2A.1 构建 Guard 同时执行 byte-by-byte、MD5 和 SHA-256 比对；比对源为
  当前 `src/main/resources/db/migration/` 原始文件，2A.3 删除原运行目录后
  改为对冻结的 legacy digest Fixture 比对；
- `B0006` 用于全新数据库，结果等价于 V1～V5 加新 Schema Ledger；
- `U0006` 只允许从完整、合法的 Flyway V5 数据库桥接；
- 版本 6 只建立新的数据库版本治理，不新增 CGF-2 业务表；
- 已发布 Script 和 Manifest 不可原地修改，修复必须追加下一版本。

## 7. Manifest 与 Schema Ledger

### 7.1 Manifest

Manifest 使用 canonical JSON，至少表达：

```text
manifestVersion
database
targetSchemaVersion
releaseVersion
supportedEntryPaths
applyOrder
scriptName
scriptDigest
```

要求：

- Script digest 使用 SHA-256 小写十六进制；
- 路径、换行和编码固定，禁止平台相关 digest；
- Manifest 自身具有独立 SHA-256，写入同目录
  `postgresql-v0006.json.sha256`，不写入 Manifest 自身；
- `.sha256` 文件采用 `<digest><two spaces><fileName><LF>` 固定格式；
- 构建 Guard 验证文件存在、顺序、命名和 digest；
- Manifest 不是公共 Enterprise Gateway Contract。

### 7.2 `robothree_schema_version`

版本 6 建立：

```text
robothree_schema_version
├── version
├── script_name
├── script_digest
├── applied_at
└── release_version
```

约束：

- `version` 为主键且严格递增；
- `script_name` 唯一；
- `script_digest` 为 64 位小写 SHA-256；
- Fresh `B0006` 和 Bridge `U0006` 的 `applied_at` 由数据库产生；
- Fresh Baseline 记录 `B0006`；
- V5 Bridge 物化 V1～V5 的历史 Script Fact 时，`applied_at` 使用对应
  `flyway_schema_history.installed_on`，以保留真实部署时间线；
- V1～V5 的 `release_version` 使用已知原始发布版本；无法从现有事实可靠恢复时
  固定写入 `pre-manifest-legacy`，禁止猜测；
- Bridge 自身 `U0006` 使用 Bridge 执行时间和当前 Central release version；
- Bridge 不删除、不清空、不重写 `flyway_schema_history`；
- 外部执行器在同一受控事务中验证 Script digest、执行 SQL、登记 Ledger；
- 应用服务只读取 Ledger，不写入。

SQL 文件不得通过包含自身 digest 形成自引用。Script digest 的计算、验证和
Ledger 登记由外部部署流程或测试安装器负责，应用运行时不承担该职责。

## 8. 两条正式迁移路径

### 8.1 Fresh Baseline

```text
空 PostgreSQL Schema
→ 验证 B0006 digest
→ 单事务执行 B0006
→ 登记 robothree_schema_version version=6
→ 只读 Preflight
→ Persistence Conformance
```

Fresh 数据库不创建伪造的 `flyway_schema_history`。

### 8.2 Flyway V5 Bridge

```text
真实执行原 V1～V5
→ 逐条校验 flyway_schema_history 中 V1～V5 的 success/version/checksum
→ 校验业务表、列、约束、索引
→ 验证 U0006 digest
→ 单事务执行 U0006
→ 物化 V1～V5 历史 Script Fact
→ 登记 version=6
→ 只读 Preflight
→ 数据不变与 Persistence Conformance
```

Bridge 必须满足：

- 只接受精确 V5，并要求 V1、V2、V3、V4、V5 各存在且仅存在一条成功记录；
- 逐条校验 V1～V5 的 version、script、success 和原 Flyway checksum，
  不能以 `MAX(version)=5` 或只验证 V5 代替；
- V1～V5 任一 checksum 漂移失败关闭；
- V4 数据和 V5 challenge consumption 数据均保留；
- 重复执行返回“已处于精确目标状态”，不重复写入；
- 同名 version/script 不同 digest 返回 conflict；
- 较旧、较新、缺表、缺索引或不完整 V5 全部失败关闭；
- 失败时版本 6 Ledger 不可部分提交。

## 9. 新 Schema Preflight

生产启动只执行只读 Preflight：

```text
load embedded manifest
→ read robothree_schema_version
→ verify exact supported path
→ verify target version/digest
→ verify required tables
→ verify columns/types/nullability
→ verify constraints/indexes
→ ready
```

至少提供 typed error：

```text
persistence.schema_ledger_missing
persistence.schema_version_incomplete
persistence.schema_too_new
persistence.schema_script_digest_mismatch
persistence.schema_manifest_mismatch
persistence.schema_missing_table
persistence.schema_missing_column
persistence.schema_column_mismatch
persistence.schema_missing_constraint
persistence.schema_missing_index
persistence.schema_unsupported_history
```

Preflight：

- 不执行 DDL/DML；
- 不依赖 `flyway_schema_history`；
- 不修改 Manifest 或 Ledger；
- 不输出数据库 URL、账号、SQL 参数或完整 Schema 内容；
- 允许旧 `flyway_schema_history` 存在，但不把它作为运行时权威；
- 对较新未知版本失败关闭。

## 10. 事务和错误语义

`CentralTransactionRunner` Port 不变。实现从 `JdbcCentralTransactionRunner`
收敛为中性的 `SpringCentralTransactionRunner`，继续使用 Spring
`PlatformTransactionManager`，保留：

- `PROPAGATION_REQUIRED`；
- RuntimeException 回滚；
- 命名崩溃点回滚；
- JDBC Transaction Observation 固定低基数 Span；
- 不把 SQL、参数或 Entity 放入 Trace。

2A.2 必须用真实 PostgreSQL 验证 MyBatis `SqlSession` 与
`PlatformTransactionManager` 绑定同一 `DataSource` 和同一事务 JDBC
Connection。测试必须证明：

```text
FOR UPDATE
→ conditional UPDATE / INSERT
→ commit or rollback
```

在同一 Connection 上完成；不得只根据 Spring/MyBatis 自动配置文档推断。
连接标识只能用于测试断言，不能进入生产日志或 Trace。

数据库异常必须在 Persistence Adapter 边界映射为现有：

```text
PersistenceConflictException
PersistenceIntegrityException
```

不得把 PostgreSQL 表名、约束名、SQLState、原始 message 暴露到公共 Error
Envelope。内部诊断只允许安全 error code、correlationId 和 traceId。

## 11. 分批实施

### 11.1 Alignment-2A.1：SQL Governance、V5 Bridge 与 Preflight

开发版本：

```text
0.0.0-cja.2a.1
```

交付：

- 冻结 V1～V5 byte/digest/checksum Fixture；
- 新建 SQL 交付目录和 Manifest；
- `B0006` Fresh Baseline；
- `U0006` Flyway V5 Bridge；
- `robothree_schema_version`；
- 引入受控 MyBatis-Plus 依赖，但首批只用于 Schema Inspection Mapper；
- 依赖加入后立即验证 dependency tree，未收敛不得继续实现；
- 显式关闭 MyBatis SQL/参数/结果日志并完成日志捕获测试；
- 只读 Manifest Loader 和基于 Schema Inspection Mapper 的新 Preflight；
- 删除生产 `CentralSchemaManager` 和自动 `migrate()` 路径；
- Flyway 仅临时降为测试范围，用于冻结/交叉验证真实 V5 历史；
- Test-only Script Installer 固定为 Java 测试工具类，不是 Maven Plugin、
  shell 脚本或生产 Bean；它负责 canonical byte 读取、SHA-256、单事务 Script
  执行、Ledger 登记和精确重复检测；
- Script Installer 自身必须覆盖 digest 计算、事务回滚、幂等重复、同 ID
  不同 digest conflict 和 Ledger 不部分提交；
- Fresh、Bridge、重复、篡改、较旧、较新、缺失和回滚测试。

退出门槛：

- Testcontainers PostgreSQL 16 实际执行 Fresh + V5 Bridge；
- Embedded PostgreSQL 16 实际执行 Fresh + V5 Bridge；
- V1～V5 文件逐字节未改；
- 现有数据桥接后不变；
- 应用代码没有自动执行 SQL；
- P0/P1=0；
- 独立 QA 通过并由用户接受后才能进入 2A.2。

### 11.2 Alignment-2A.2：MyBatis-Plus Adapter Parity

开发版本：

```text
0.0.0-cja.2a.2
```

交付：

- MyBatis-Plus 3.5.16 受控依赖；
- 在 2A.1 的 Schema-only 使用基础上扩展业务 Persistence Mapper；
- Authentication/Configuration Entity、Mapper、XML、TypeHandler；
- 显式 Domain Converter；
- `MyBatisAuthenticationPersistence`；
- `MyBatisConfigurationPersistence`；
- `SpringCentralTransactionRunner`；
- 新旧 Adapter 共用同一 Persistence、Recovery、Concurrency Conformance；
- 架构 Guard：MyBatis 不进入 Domain/Application/HTTP。

退出门槛：

- 所有 Port 方法与旧 JDBC Adapter 等价；
- `FOR UPDATE`、`ON CONFLICT`、revision 和 consume SQL 经人工核对；
- MyBatis `SqlSession` 与 Spring Transaction 在真实 PostgreSQL 上共享同一
  JDBC Connection，锁定读取与条件写入位于同一事务；
- 32 路 token issuance、20 路 enrollment replay 等现有并发门槛通过；
- 命名崩溃点、close/reopen、敏感数据扫描全部通过；
- Testcontainers 与 Embedded 双实现通过；
- 独立 QA 通过并由用户接受后才能进入 2A.3。

### 11.3 Alignment-2A.3：Production Persistence Cutover 与阶段关闭

开发版本：

```text
0.0.0-cja.2a.3
```

交付：

- 删除生产 `JdbcAuthenticationPersistence` 和
  `JdbcConfigurationPersistence`；
- 删除剩余 Flyway 测试 dependency，确认生产自动 Migration 路径继续为零；
- 旧 V1～V5 只保留在受控 legacy audit/Fixture 目录；
- Central Foundation 持久化测试统一使用新 Script + MyBatis Adapter；
- fat jar 不包含 Flyway；
- 完整 Central online/offline、Contract Conformance、Tracing、
  Testcontainers、Embedded PostgreSQL 全量回归；
- Migration Evidence 报告只记录 digest、version、count、status 和 duration。

退出门槛：

- 生产源码 `Flyway`、`JdbcTemplate`、旧 JDBC Persistence 为零；
- fat jar Flyway 为零；
- Fresh/Bridge/Preflight/MyBatis/Recovery 全矩阵实际执行；
- canonical Contract/Schema/Fixture 不变；
- P0/P1/P2/P3 全部为 0；
- Claude Code 独立 QA 与用户接受后，Alignment-2A 才能关闭。

## 12. 必测矩阵

| 类别 | 场景 |
| --- | --- |
| Fresh | 空库执行 B0006、重复安装、事务中断 |
| Bridge | 精确 V5、V4、V999、缺 migration、checksum 漂移 |
| Structural Equivalence | Fresh B0006 与 V5 Bridge 后的表、列、类型、nullable、default、约束、索引名称/唯一性/列序完全一致；只排除 `flyway_schema_history` 和 Ledger 历史行内容差异 |
| Manifest | Script 缺失、顺序错误、digest 漂移、未知 Manifest 版本 |
| Ledger | 缺表、缺记录、重复 version、同名不同 digest、较新版本 |
| Schema | 缺表、缺列、类型/nullable 漂移、缺约束、缺索引 |
| Adapter | 相同请求幂等、不同 digest 冲突、revision stale/conflict |
| Lock | identity/device/permission/challenge 的 `FOR UPDATE` |
| Consume | Enrollment/Challenge 单次消费、并发、重放 |
| Immutable | Snapshot/Package 同键同内容、同键不同内容 |
| Recovery | 命名崩溃点、commit 后响应丢失、close/reopen |
| Security | OA 原材料、Enrollment Code、Access Token、配置凭证不入库/日志/Trace |
| Regression | HTTP、Error、Tracing、Contract、CGF-1 全量回归 |

独立 QA 必须实际执行，不得用历史报告、digest 比较或单元测试推断替代 Fresh、
Bridge、Testcontainers 和 Embedded PostgreSQL。

## 13. 架构守卫

新增或扩展静态检查：

1. Domain/Application/Controller 禁止导入 `com.baomidou`、`org.apache.ibatis`；
2. Controller 禁止导入 `persistence.mybatis`；
3. Wrapper 禁止作为 public Port 参数或返回值；
4. 生产源码禁止 `JdbcTemplate` 和 `Flyway`；
5. Mapper XML 禁止 `${...}` 字符串替换，只允许 `#{...}` 参数绑定；
6. Mapper XML 的 `<if>`、`<choose>`、`<foreach>` 只允许基于 Adapter 内已验证
   boolean、固定枚举或受控集合；禁止把用户输入字符串作为动态表达式、SQL
   片段、表名、列名或排序字段；
7. 动态表名、动态列名和 `last()` 禁止；
8. Entity 禁止 `@Data`、`@Setter`、敏感 `toString`；
9. Script Manifest 与 `.sha256` sidecar digest 必须匹配；
10. V1～V5 legacy 文件必须通过 byte-by-byte、MD5 和 SHA-256 三重比对；
11. Alignment-2A 不得出现 Model Invocation/Durable Event/Provider Dispatch
    占位表或代码。

## 14. 与 Alignment-2B 的边界

Alignment-2A 只建立持久化和 Schema 基线，不实现：

- Production Profile 完整装配；
- InMemory/Fake 在 Production 的启动失败守卫；
- 双节点真实 HTTP Foundation Harness；
- Node A/Node B Challenge 跨节点消费；
- 任一节点停止后的接管；
- 共享 Secret Store；
- 集群 lease、claim 或 recovery owner。

这些属于 Alignment-2B。2A.3 可以提供 MyBatis Bean 测试配置，但不得把未验收
的 Production Profile 误记为已完成。

## 15. 与 CGF-2 的边界

Alignment-2A 不实现：

- Model Invocation；
- Provider Dispatch；
- Durable Model Event；
- SSE Event Cursor；
- Model cancel/timeout/uncertain；
- DeepSeek、Anthropic 或 OpenAI-compatible Adapter；
- Model Credential；
- CAS；
- MaaS；
- Tool Gateway；
- CGF-2 数据库占位表。

CGF-2 将在 Alignment-2B 关闭后基于版本化 SQL 机制追加新的 Schema 版本，
这是正常演进，不是 2A 范围缺失。

## 16. 不采纳方案

### 16.1 MyBatis-Plus 全量替代所有 SQL

拒绝。关键事务、锁和幂等必须保持显式、可审计。

### 16.2 保留 Flyway 仅关闭自动 Migration

拒绝。公司基线明确不使用 Flyway，最终生产依赖和 fat jar 必须移除。

### 16.3 删除 `flyway_schema_history`

拒绝。它是已部署数据库的历史事实，Bridge 只停止依赖，不删除历史。

### 16.4 应用启动自动执行 SQL Script

拒绝。生产服务只读 Preflight，数据库变更属于外部部署流程。

### 16.5 为 CGF-2 预建空表

拒绝。未确认业务 Contract 不得提前固化为数据库 Schema。

### 16.6 直接进入双节点或真实 DeepSeek

拒绝。前者属于 Alignment-2B，后者属于重新确认后的 CGF-2。

## 17. 工期

集中工程工作量：

```text
Alignment-2A.1：2～3 个工作日
Alignment-2A.2：5～7 个工作日
Alignment-2A.3：2～3 个工作日
合计：9～13 个集中工程工作日
```

日历周期初估：

```text
14～22 个日历日
```

工作日指接近完整工程投入日，不等于必须连续执行 8 小时；日历周期包含正常的
文档评审、环境切换和独立 QA 等待，但不包含公司 DBA/IT 等外部等待、重大返工
或人员并行冲突。

## 18. Claude Code 首轮评审修订映射

首轮独立文档评审结论：

```text
P0=0
P1=0
P2=8
P3=3
```

本版已吸收全部问题：

| 问题 | 修订位置 | 关闭方式 |
| --- | --- | --- |
| P2-1 | §8.2 | 明确逐条验证 V1～V5 全部 history 记录 |
| P2-2 | §12 | 增加 Fresh/Bridge Schema Structural Equivalence |
| P2-3 | §7.2 | Legacy 使用原 `installed_on` 和受控 release version |
| P2-4 | §6、§7.1 | 固定 Manifest `.sha256` sidecar 路径和格式 |
| P2-5 | §10、§11.2 | 增加 SqlSession/Spring TX 同 Connection 实测 |
| P2-6 | §17 | 2A.2 调整为 5～7 天，总计 9～13 天 |
| P2-7 | §3.1、§11.1 | 显式 NoLogging + 日志/Trace 动态验证 |
| P2-8 | §6、§13 | V1～V5 byte/MD5/SHA-256 三重比对 |
| P3-1 | §13 | 收窄 Mapper 动态 SQL 条件来源 |
| P3-2 | §11.1 | Installer 固定为 Java 测试工具并定义自测 |
| P3-3 | §3.1、§11.1 | dependency tree 改为依赖加入后立即验证 |

Claude Code 已完成修订版复核，结论为 `PASS — ALL 11 ISSUES CLOSED`，
P0=0、P1=0、P2=0、P3=0；用户随后正式接受计划并授权进入 2A.1。

## 19. 当前门槛与下一步

```text
ADR-016：ACCEPTED
Alignment-1：PASS / CLOSED
Alignment-2A Plan：CONFIRMED / COMPLETED
Alignment-2A：PASS / CLOSED
Alignment-2A.1：PASS / CLOSED
Alignment-2A.2：PASS / CLOSED
Alignment-2A.3：PASS / CLOSED
Alignment-2B：GATED
CGF-2：GATED / RE-ALIGNMENT PENDING
```

下一步：

1. Alignment-2B 继续等待正式方案确认和用户明确授权；
2. CGF-2 继续等待重新对齐后的方案确认和用户明确授权；
3. Alignment-2A 关闭不自动解锁任何后续编码阶段。
