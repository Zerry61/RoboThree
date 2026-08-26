# EIPC-1.1.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-23-2216-version-eipc.1.1.2` |
| 验收对象 | EIPC-1.1.2：PostgreSQL v0010 + Persistence |
| 日期 | 2026-08-23 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker / PostgreSQL 16.14（embedded + Testcontainers） |
| 开发版本 | Root `0.0.0-eipc.1.1.2`；Contracts/Desktop/Core/Document Worker/Central 版本不变 |
| 上游 | EIPC-0、EIPC-1.0、EIPC-1.1.1 `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:eipc1.1.2` | **PASS**：TS 2 files / 24 tests + Java 7 classes / 52 tests；`outcome=EIPC112_POSTGRESQL_PERSISTENCE_CONFORMANT`；`targetSchemaVersion=10`、`legacyContractDriftCount=0`、`legacySchemaDriftCount=0`、敏感命中 0 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 240 files / 1603 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 325/0/0/0 / BUILD SUCCESS**（316→325，新增 9 个 Java persistence 测试） |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 325/0/0/0 / BUILD SUCCESS** |

Harness evidence digest 与报告一致：`sha256:ab5702db…9390f`。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | v0010 forward-only | ✅ [B0010](services/central-service/deploy/sql/postgresql/baseline/B0010__enterprise_session_persistence.sql) 完整 fresh（含 v0009 全结构 + 两表）、[U0010](services/central-service/deploy/sql/postgresql/upgrade/U0010__enterprise_session_persistence_from_v0009.sql) exact v0009 upgrade、manifest/sidecar；v0001~v0009 文件/digest 零漂移 |
| 2 | Challenge Binding 表 | ✅ composite FK `(challenge_id, verified_identity_id)`→device_challenge、3 unique（correlation/binding_digest/identity 四元组）、CHECK profile/audience/source/device_key/raw+wire digest/permissions |
| 3 | Lease Issuance 表 | ✅ composite FK `(challenge_id, binding_digest, verified_identity_id, identity_source_revision)`→binding、unique token_digest+challenge_id、CHECK profile/audience/owner/status/time/source_revision/raw+wire digest/permissions/documents |
| 4 | digest 四层分离 | ✅ `VARCHAR(71)`（Wire `sha256:`）/ `CHAR(64)`（raw hex）/ `BIGINT`（device_source_revision）/ `VARCHAR(160)`（opaque source revision），CHECK 正则分离，Converter 唯一转换边界 |
| 5 | 聚合式 Port | ✅ [EnterpriseSessionPersistence.java](services/central-service/src/main/java/com/robothree/central/authentication/port/EnterpriseSessionPersistence.java) 6 方法；`ChallengeBundle` 必须同含 DeviceChallenge+Binding；`LeaseCommit` 构造器强校验 consumedBy=`enterprise_session_lease` + digest 格式，不含 bearer/handle/proof/signature |
| 6 | load-time revalidation | ✅ [EnterpriseSessionPersistenceValidator.java](services/central-service/src/main/java/com/robothree/central/authentication/domain/EnterpriseSessionPersistenceValidator.java) 逐字段校验 + record digest 重算 + assertion/trust/source-decision digest 重算 + canonical JSON 与 indexed columns 逐字段一致，drift 抛 typed corrupt |
| 7 | 双 Adapter 共用 validator | ✅ [InMemoryCentralPersistence.java](services/central-service/src/main/java/com/robothree/central/persistence/memory/InMemoryCentralPersistence.java) `implements EnterpriseSessionPersistence`，`commitChallengeOutcome`/load 均调 `EnterpriseSessionPersistenceValidator.validateChallengeBundle`，未因内存数据可信跳过 digest 校验 |
| 8 | exact history validator | ✅ [CentralSchemaPreflight.java](services/central-service/src/main/java/com/robothree/central/persistence/mybatis/schema/CentralSchemaPreflight.java) 精确匹配 6 条 entry path（`{10}`/`{9,10}`/`{8,9,10}`/`{7,8,9,10}`/`{6,7,8,9,10}`/`{1..10}` legacy bridge），`requireHistoryRow` 校验 script name + release version，缺行/多行/未知 digest fail-closed |
| 9 | 测试断言真实性 | ✅ 反查无 `@Disabled`/`@Ignore`；Java 7 classes 覆盖 validator/InMemory/MyBatis embedded+Testcontainers/fresh+upgrade conformance/architecture；TS 24 tests 为 EIPC-1.1.1 回归 |
| 10 | 边界零漂移 | ✅ 改动 = Central `authentication` domain/port + `persistence` memory/mybatis/schema + `resources/mybatis` Mapper XML + Central test + harness + v0010 新增；未改 Wire Contract（`contracts/enterprise-session` 零漂移）、未改 Core/Desktop/Renderer；`pnpm-lock.yaml` 保持 Aug 16；v0001~v0009 SQL/manifest/sidecar 未改 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

EIPC-1.1.2 正确完成 PostgreSQL v0010 与 Persistence：Central schema forward-only 提升到 v0010（B0010 完整
fresh + U0010 exact v0009 + manifest/sidecar + exact history validator），新增 immutable Challenge Binding 与
Lease Issuance 两表（composite FK 精确 identity pair、四层 digest 表示法分离、record digest）；聚合式
`EnterpriseSessionPersistence` 原子提交 Challenge+Binding 与 consume+Lease，禁半提交；InMemory 与 MyBatis 双
Adapter 同批完成并共用同一 strict validator；load-time 逐字段重算 record JSON/record digest/assertion/trust/
source-decision digest，篡改 fail-closed；bearer/handle/proof/signature 不进 durable store。门禁独立复跑全绿
（harness TS 24 + Java 52、check 240/1603 + 3 smoke、Central online/offline 325/325）。边界零漂移：仅改
Central persistence/domain/port/schema/test + harness，未改 Wire Contract/Core/Desktop/Renderer，
`pnpm-lock.yaml` 保持 Aug 16，v0001~v0009 零漂移。

**EIPC-1.1.2 可进入用户接受流程；接受后 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity
composition blocker 仍保持打开。EIPC-1.1.3（Central Decision / Validator / HTTP Foundation）仍需单独方案/差异
复核并获用户明确编码授权；EIPC-1.2～1.3、EIPC-2～3、STRM-3、DFI-4A.4.1～4A.4.3、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
