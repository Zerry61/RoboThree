# EIPC-1.1.3.1 Decision Domain / Ports / Canonical Material 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-24  
> 负责人：Codex 5.6

## 1. 结论

EIPC-1.1.3.1 已按冻结方案完成 Central-private Decision Domain、Port 与 canonical material foundation。
本批只冻结 Session claims、opaque verified identity handle、dual-profile authorization result、三个 source/request
digest domain，以及 resolver/token codec/common authorizer 接缝；没有进入 Transactional Challenge / Session Lease、
HTTP、production identity Adapter 或任何 Desktop 接线。

本批最高输出为：

```text
EIPC1131_DECISION_DOMAIN_CONFORMANT
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

- 新增 strict `OpaqueVerifiedIdentityHandle`，限定 base64url 形态与长度，`toString()` 只返回脱敏标记；
- 新增 strict `EnterpriseSessionTokenClaims`，固定 `eipc.session-token.v1` profile，校验 issuer/audience、
  identity/device/enterprise/client、时间区间、排序后的 permission 与 Wire digest；
- 新增 `EnterpriseBearerPrincipal` 与 sealed `EnterpriseBearerAuthorizationResult`，明确区分 legacy/session profile
  及 success/invalid/expired/unavailable，不读取未验证 token payload 决定 branch；
- 新增 `EnterpriseSessionLeaseRequestDigestMaterial` 与 `EnterpriseSessionDecisionDigests`，以独立 domain separator
  计算 device source revision、permission source revision 与 lease request digest；permission source digest 覆盖请求
  权限全集（含 `configuration.read`）、owner 与 source revision，不只覆盖最终 granted enum；
- 新增 Central-private `VerifiedIdentityHandleResolver`、`EnterpriseSessionTokenCodec`、
  `EnterpriseBearerAuthorizer` Port；signing/verification handle 隔离，日志表示保持脱敏；
- 新增 test-only deterministic resolver/codec，未进入 production dependency graph；
- `EnterpriseSessionPersistenceDigests` 仅开放已有 canonical raw digest helper 供新 Decision digest 复用，未复制
  canonical JSON 算法；
- 新增正式 `harness:eipc1.1.3.1`，验证 canonical Contract 零漂移、production implementation 缺失事实、
  sensitive material 排除与 5 个 Java test class / 36 tests。

## 3. 正式验证

| 门禁 | 结果 |
| --- | --- |
| `CI=true pnpm run lint` | PASS；Architecture boundary checks passed |
| `CI=true pnpm run harness:eipc1.1.3.1` | PASS：5 Java classes / 36 tests；`EIPC1131_DECISION_DOMAIN_CONFORMANT`；敏感命中 0 |
| `CI=true pnpm run check` | PASS：240 files / 1603 tests + 3 smoke |
| `CI=true pnpm run check:central` | PASS：351/0/0/0 / BUILD SUCCESS |
| `CI=true pnpm run check:central:offline` | PASS：351/0/0/0 / BUILD SUCCESS |

正式 Harness evidence digest：

```text
sha256:f48b133c9d4cb1f765a11fab109a516d73672eda04531e610859af8c07b1b270
```

所有正式 Harness、Workspace、Central online 与 Central offline 门禁严格串行执行。

## 4. 过程记录

- 首次 Workspace check 在受限沙箱中因 loopback `listen EPERM` 与 isolated Keychain 权限失败；相同命令在具备
  真实系统权限的环境中从零复跑 240/1603 + 3 smoke 全绿，未修改产品代码或删除场景；
- 依赖状态检查曾触发受限网络重建；随后以 frozen lockfile 恢复，downloaded 0，`pnpm-lock.yaml` 未变化；
- Central online/offline 使用 JDK 21 + Docker，在 Workspace 门禁后依次运行，未与其他 Harness/Central 测试并发。

## 5. 边界

本批没有实现 EIPC-1.1.3.2 的 handle-bound Challenge 或同事务 Session Lease，没有实现 EIPC-1.1.3.3 的
validator/composite authorizer/conditional HTTP，也没有 production resolver/codec/authorizer、v0011、Core、
Main、Preload、Renderer 或个人模型接口改动。EIPC-1.1.3.2～1.1.3.3 及全部下游继续 `GATED`。

Claude Code 独立 QA 结论为 `INDEPENDENT_QA_PASS`（P0～P3 均为 0），用户已于 2026-08-24 正式接受，
EIPC-1.1.3.1 现为 `PASS/CLOSED`。该关闭不解除任何 identity blocker，也不授权 EIPC-1.1.3.2 编码。
