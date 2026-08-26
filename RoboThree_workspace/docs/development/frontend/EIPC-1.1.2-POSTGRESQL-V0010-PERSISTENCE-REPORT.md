# EIPC-1.1.2 PostgreSQL v0010 + Persistence 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-23  
> 负责人：Codex 5.6

## 1. 结论

EIPC-1.1.2 已按冻结方案完成。Central schema forward-only 提升到 v0010，并交付 Enterprise Session
Challenge Binding / Lease Issuance 的私有 Domain、聚合 Persistence Port、InMemory 与 MyBatis/PostgreSQL
双 Adapter、严格 load-time revalidation、schema/history conformance 与正式 Harness。

本批最高输出仍为：

```text
EIPC112_POSTGRESQL_PERSISTENCE_CONFORMANT
```

以下事实继续为 `false`：

```text
productionSessionEnabled
productionIdentityReady
identityCompositionBlockerClosed
downstreamCodingUnlocked
```

`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity composition blocker 均未关闭。

## 2. 主要交付

- 新增完整 fresh baseline `B0010`、exact v0009 upgrade `U0010`、v0010 manifest/sidecar；v0001～v0009
  文件与 digest 保持零漂移；
- Challenge Binding 与 Lease Issuance 使用 immutable durable facts、索引列与 record JSON 逐字段校验；
- numeric source revision、Wire `sha256:` digest、raw hex 与 opaque value 四层表示严格分离；
- `EnterpriseSessionPersistence` 以聚合方法原子提交 Challenge+Binding、consume+Lease，禁止半提交；
- InMemory 与 MyBatis/PostgreSQL 共用同一 strict validator 与 conformance matrix；
- MyBatis load 对 indexed facts、record JSON、record digest、assertion/trust/source-decision digest 重新计算并
  fail-closed；
- fresh、upgrade、并发、重启、rollback、篡改与 exact history 均有真实 PostgreSQL/embedded PostgreSQL 证据；
- bearer、opaque handle、proof、signature 均不进入 durable store 或安全 evidence。

## 3. 正式验证

| 门禁 | 结果 |
| --- | --- |
| `pnpm run harness:eipc1.1.2` | PASS：TS 2 files / 24 tests；Java 7 classes / 52 tests；`EIPC112_POSTGRESQL_PERSISTENCE_CONFORMANT`；敏感命中 0 |
| `CI=true VITEST_MAX_WORKERS=1 pnpm run check` | PASS：240 files / 1603 tests + 3 smoke |
| `CI=true pnpm run check:central` | PASS：325/0/0/0 / BUILD SUCCESS |
| `CI=true pnpm run check:central:offline` | PASS：325/0/0/0 / BUILD SUCCESS |

正式 Harness evidence digest：

```text
sha256:ab5702dbe530a31722b774462b5e27b7259dbb70e15dd127dd47b59f6199390f
```

所有正式门禁严格串行执行。

## 4. 过程记录

- 首次 workspace check 在受限沙箱内因 loopback `listen EPERM` 与 isolated Keychain 权限失败；相同命令在具备
  真实系统权限的环境中从零复跑 240/1603 + 3 smoke 全绿，未通过改代码或删除场景规避；
- 首次正式 Harness 未提供 JDK 21 toolchain，安全失败于 `java_toolchain`；补齐既定 `JAVA_HOME` 后从零通过；
- 依赖恢复时 offline install 因本地缺少 `yaml` tarball 失败，随后执行 frozen-lockfile install，downloaded 0，
  `pnpm-lock.yaml` 未变化；
- Central online 与 offline 均在 workspace 门禁结束后依次执行，未与其他 Central/Harness 并发。

## 5. 边界

未实现或启用 bearer 签发、Device Proof、opaque handle resolver、Session Lease Application Service、HTTP endpoint、
Core/Desktop/Renderer 接线或 production identity。EIPC-1.1.3 及全部下游仍 `GATED`，本批等待独立 QA 与用户接受。
