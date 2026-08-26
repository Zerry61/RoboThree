# EIPC-1.1.3.2 Transactional Challenge / Session Lease 实施报告

> 状态：**IMPLEMENTED / INDEPENDENT QA PENDING**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 开发版本：`0.0.0-eipc.1.1.3.2`

## 1. 结论

EIPC-1.1.3.2 已按冻结方案完成 Central-private Transactional Challenge / Session Lease Foundation。
本批将 handle-bound Challenge、requested-permission exact lock、Session signing handle authority、单一
Decision Assembler 与 Lease 同事务签发接入已有 v0010 Persistence，没有注册 HTTP，没有实现
production resolver/codec/signing provider，也没有进入 Core/Desktop/Renderer。

本批最高输出仅为：

```text
EIPC1132_TRANSACTIONAL_SESSION_LEASE_CONFORMANT
```

并继续保持：

```text
productionSessionEnabled = false
productionIdentityReady = false
identityCompositionBlockerClosed = false
downstreamCodingUnlocked = false
```

`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity composition blocker 均未关闭。

## 2. 主要交付

- 新增 `IssueEnterpriseSessionChallengeService`：在单一 transaction closure 内解析 opaque handle、锁定
  identity/device/requested permissions、校验 trust/compatibility、生成有界 nonce，并原子提交
  Challenge + Binding；
- 新增 `IssueEnterpriseSessionLeaseService`：将 Challenge lock、handle 二次解析、identity/device/permission
  重检、proof 验证、canonical decision、`tokenCodec.encode()`、Challenge consume 与 Lease issuance
  置于同一 `CentralTransactionRunner.required()` closure；
- 新增 `EnterpriseSessionDecisionAssembler`，用 `prepareDecision()` / `finalizeIssuance()` 分离 token
  digest 时序，但 canonical material 仍只有一个事实源；
- 新增 Central-private `EnterpriseSessionSigningKeyHandleProvider`；production source graph 中 resolver、
  codec 与 signing handle provider 的实现数仍均为 0；
- `EnterprisePermissionRepository` 新增有界 exact lock。MyBatis 使用 PostgreSQL
  `permission = ANY(text[]) ORDER BY permission FOR UPDATE`，通过已有 `PostgresTextArrayTypeHandler`
  传递有序权限集。这与冻结方案的单次有界 `IN (...)` 语义等价，同时遵守仓库已有
  “MyBatis 禁止动态 `<foreach>`”架构边界；InMemory 与 MyBatis 共用同一 conformance，
  disabled/missing fact 不被预先过滤；
- Challenge correlation loser 在 rollback 后仅做一次 strict reload；exact material 返回已持久
  Challenge，不同 material 返回 typed conflict；
- bearer encode 失败会回滚 Challenge consume 与 Lease issuance；response loss 不提供 bearer replay。

## 3. 测试与证据

| 门禁 | 结果 |
| --- | --- |
| PostgreSQL 事务专项 | PASS；`PostgreSqlMyBatisPersistenceIntegrationTest#supportsTransactionalEnterpriseSessionApplicationFlow` |
| `CI=true pnpm run lint` | PASS；Architecture boundary checks passed |
| `CI=true pnpm run harness:eipc1.1.3.2` | PASS；4 Java classes / 40 tests；`EIPC1132_TRANSACTIONAL_SESSION_LEASE_CONFORMANT`；敏感命中 0 |
| `CI=true pnpm run check` | PASS；240 files / 1603 tests + 3 smoke |
| `CI=true pnpm run check:central` | PASS；363/0/0/0 / BUILD SUCCESS |
| `CI=true pnpm run check:central:offline` | PASS；363/0/0/0 / BUILD SUCCESS |

Harness evidence digest：

```text
sha256:f458e4e9abed6c610d3f32d24da93527725ae26e85edf304d47c25e0fcf602df
```

全部正式 Harness、Workspace、Central online 与 Central offline 门禁严格串行执行。

## 4. 过程记录

- Workspace `check` 首轮在受限沙箱中因 loopback `EPERM`、Keychain 权限与派生超时失败；
  相同命令在具备真实系统权限的环境从零复跑 240/1603 + 3 smoke 全绿，未删减场景；
- Central online 首次运行由新 MyBatis `<foreach>` 触发已有 Architecture test 失败。该实现
  问题未被当作环境偶发；改为静态 `ANY(text[])` 后，真实 PostgreSQL 专项、Harness、Central
  online/offline 全部从零通过；
- `pnpm-lock.yaml`、Enterprise Session canonical Contract、v0001～v0010 migration bytes 均未修改。

## 5. 边界与下一道门禁

本批未实现 EIPC-1.1.3.3 Validator / Common Authorizer / Conditional HTTP，未接入真实企业身份、
production token codec/signing provider、Core、Main、Preload、Renderer 或个人模型接口。

EIPC-1.1.3.2 当前为 `IMPLEMENTED / INDEPENDENT QA PENDING`。只能进入独立 QA；独立 QA
与用户接受前不得标记 `PASS/CLOSED`，不得自动进入 EIPC-1.1.3.3。EIPC-1.1.3.3、
EIPC-1.2～1.3、EIPC-2～3、STRM-3、DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3 与 TGM 继续 `GATED`。
