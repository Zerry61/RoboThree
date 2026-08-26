# EIPC-1.1.3.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-24-1410-version-eipc.1.1.3.2` |
| 验收对象 | EIPC-1.1.3.2：Transactional Challenge / Session Lease |
| 日期 | 2026-08-24 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker / PostgreSQL 16（embedded + Testcontainers） |
| 开发版本 | Root `0.0.0-eipc.1.1.3.2`；Contracts/Desktop/Core/Document Worker/Central 版本不变 |
| 上游 | EIPC-1.1.3.1 `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:eipc1.1.3.2` | **PASS**：4 Java classes / 40 tests（含真实 Testcontainers PostgreSQL）；`outcome=EIPC1132_TRANSACTIONAL_SESSION_LEASE_CONFORMANT`；`encodeInsideTransactionSourceProof=true`、`exactPermissionLockConformant=true`、三个 production implementation count 均 0、`canonicalContractDriftCount=0`、`schemaMigrationDriftCount=0`、敏感命中 0 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 240 files / 1603 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 363/0/0/0 / BUILD SUCCESS**（351→363，新增 12 个 Java 事务测试） |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 363/0/0/0 / BUILD SUCCESS** |

Harness evidence digest 与报告一致：`sha256:f458e4e9…02df`。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | Lease 13 步同事务 | ✅ [IssueEnterpriseSessionLeaseService.java](services/central-service/src/main/java/com/robothree/central/authentication/application/IssueEnterpriseSessionLeaseService.java) `issue()` → `transactions.required(() -> issueWithinTransaction(command))`；closure 内：single now → bundle lock+validator → requirePendingContext（purpose/pending/client/audience/permission/device/correlation/challengeId/algorithm 精确）→ 二次 resolve + 与 binding 精确比较 → identity for-update → device lock + proof verify → `findRequestedForUpdate` → trust + managed/compliant → compatibility → requestDigest + prepareDecision |
| 2 | encode-inside-closure | ✅ [IssueEnterpriseSessionLeaseService.java:177-180](services/central-service/src/main/java/com/robothree/central/authentication/application/IssueEnterpriseSessionLeaseService.java#L177) `tokenCodec.encode()` 在 `issueWithinTransaction` 内（注释明示 deliberately inside `CentralTransactionRunner.required()`），后接 `requireBoundedBearer` + tokenDigest |
| 3 | commit 后返回 token | ✅ `commitLeaseOutcome` 成功后构造 Result 返回 compactToken；commit 结果与 outcome.issuance 精确比较（`enterprise_session_commit_mismatch` 防漂移）；encode/commit 异常整体 rollback |
| 4 | Challenge correlation 收敛 | ✅ [IssueEnterpriseSessionChallengeService.java](services/central-service/src/main/java/com/robothree/central/authentication/application/IssueEnterpriseSessionChallengeService.java) conflict（`persistence.enterprise_session_` 前缀）→ 仅一次 `required(() -> replayExisting(command))` strict reload；exact（identity/sourceRevision/client/audience/permission/deviceKey/correlation）返回原 persisted Challenge，不同 material typed conflict，不泄漏原 nonce |
| 5 | requested-permission exact lock | ✅ [AuthenticationMapper.xml:167-177](services/central-service/src/main/resources/mybatis/AuthenticationMapper.xml#L167) `permission = ANY(#{permissions, jdbcType=ARRAY, typeHandler=PostgresTextArrayTypeHandler}) ORDER BY permission FOR UPDATE`——**静态 SQL，无 `<foreach>`**；返回 enabled/disabled rows 不预先过滤；`validateRequestedPermissions` 强校验非空/≤32/含 configuration.read/唯一/ASCII 排序 |
| 6 | `<foreach>` 架构违规诚实处理 | ✅ 开发者报告：Central online 首跑由新 `<foreach>` 触发既有 Architecture test 失败，**未被当作环境偶发**，改为静态 `ANY(text[])` 后从零全绿。harness 以 `assert.doesNotMatch(permissionXml, /<foreach|\$\{/u)` 固定该边界 |
| 7 | Assembler 单一事实源 | ✅ `prepareDecision`（immutable PreparedDecision）+ `finalizeIssuance`（只补 tokenDigest/recordDigest），构造 issuance 后经 `EnterpriseSessionPersistenceValidator.validateLease` |
| 8 | production 三实现数 0（真实 source graph） | ✅ harness 扫描 `implements VerifiedIdentityHandleResolver/EnterpriseSessionTokenCodec/EnterpriseSessionSigningKeyHandleProvider` 均 0；test-only deterministic resolver/codec/FixedTestSigningKeyHandleProvider 在 test source set |
| 9 | 无 HTTP/Renderer/bearer journal | ✅ harness `assert.doesNotMatch(leaseSource+challengeSource, /@RestController|@RequestMapping|ipcMain|contextBridge|Renderer/)` + `assert.doesNotMatch(leaseSource, /proof.*Digest|signature.*Digest|bearerJournal/)` |
| 10 | 测试断言真实性 | ✅ 反查无 `@Disabled`/`@Ignore`；4 test class 覆盖 TransactionalApplication/Digests/InMemory/PostgreSqlMyBatis（真实 Testcontainers） |
| 11 | 边界零漂移 | ✅ 改动 = Central `authentication` application/domain/port + `persistence` memory/mybatis + Mapper XML + Central test + harness；未改 Wire Contract/Core/Desktop/Renderer/deploy（无 v0011）；`pnpm-lock.yaml` 保持 Aug 16；v0001~v0010 migration 零漂移 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

（`SELECT *` 见 [AuthenticationMapper.xml](services/central-service/src/main/resources/mybatis/AuthenticationMapper.xml) 为既有 mapper 全文件一贯风格，本批 additive select 跟随既有风格，不构成 EIPC-1.1.2 方案 §7.2「新 mapper 不用 SELECT *」的违规。）

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

EIPC-1.1.3.2 正确完成 Transactional Challenge / Session Lease：Lease 13 步全部位于单一
`CentralTransactionRunner.required()` closure（single now、bundle lock、二次 resolve、identity/device/
permission 重检、proof、trust/compatibility、prepareDecision、**encode-inside-closure**、finalizeIssuance、
aggregate consume+insert、commit mismatch 防漂移）；Challenge correlation loser 仅一次 strict reload，
exact 返回原 persisted Challenge、不同 material typed conflict；requested-permission exact lock 用静态
PostgreSQL `ANY(text[]) ORDER BY permission FOR UPDATE`（无 `<foreach>`），返回 enabled/disabled rows 不预先
过滤；Assembler 两阶段单一事实源；production resolver/codec/signing provider 实现数经真实 source graph
扫描均为 0；无 HTTP/Renderer/bearer journal。门禁独立复跑全绿（harness 4 Java classes / 40 tests 含真实
Testcontainers PostgreSQL、check 240/1603 + 3 smoke、Central online/offline 363/363）。边界零漂移：仅改
Central application/domain/port/persistence/test + harness，未改 Wire Contract/Core/Desktop/Renderer/deploy
（无 v0011），`pnpm-lock.yaml` 保持 Aug 16，v0001~v0010 零漂移。

**EIPC-1.1.3.2 可进入用户接受流程；接受后 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与
identity composition blocker 仍保持打开。EIPC-1.1.3.3（Validator / Common Authorizer / Conditional HTTP）
仍需单独方案/差异复核并获用户明确编码授权；EIPC-1.2～1.3、EIPC-2～3、STRM-3、DFI-4A.4.1～4A.4.3、
DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
