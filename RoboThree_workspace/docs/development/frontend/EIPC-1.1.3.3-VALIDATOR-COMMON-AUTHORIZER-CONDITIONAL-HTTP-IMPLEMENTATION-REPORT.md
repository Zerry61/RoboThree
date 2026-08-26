# EIPC-1.1.3.3 Validator / Common Authorizer / Conditional HTTP 实施报告

> 状态：**IMPLEMENTED / INDEPENDENT QA PENDING**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 逻辑开发批次：`EIPC-1.1.3.3`；Root 版本按冻结边界保持 `0.0.0-eipc.1.1.3.2`

## 1. 结论

EIPC-1.1.3.3 已按冻结方案完成 Central 内部 strict Session Token Validator、legacy/session Common
Authorizer、Configuration/Model Gateway consumer 一次性切换，以及默认关闭的 Conditional HTTP Foundation。

本批最高只输出：

```text
EIPC113_SESSION_HTTP_FOUNDATION_CONFORMANT
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

- 新增 `EnterpriseSessionVerificationKeyHandleProvider` 与 `EnterpriseSessionTokenValidator`。Session branch
  严格完成 verification handle、cryptographic verification、durable issuance revalidation、constant-time token
  digest 比较、claims 与持久事实逐字段匹配后，才允许投影 verified expiry；
- 新增 `LegacyBearerAuthorizerAdapter` 与 `CompositeEnterpriseBearerAuthorizer`。Composite 不读取未验证 JWT
  header/payload 选择分支；双 success、双 verified-expired 均为 ambiguous；任一 unavailable 优先失败关闭；
- `ConfigurationReadService` 与 `RoboThreeModelInvocationAccessAuthorizer` 同批切换到
  `EnterpriseBearerAuthorizer`，production graph 中不再存在绕过 Common Authorizer 的 legacy consumer；
- `EnterpriseBearerTokenFilter` 保持 extract-only，不 decode、不选择 claims profile、不接 Persistence；
- 新增 `/enterprise-session/v1alpha1/device-challenges` 与 `/session-leases` 的 conditional HTTP Foundation，
  使用 strict JSON、UTF-8、body 上限、no-store 与安全 typed error 映射；
- `robothree.enterprise-session.enabled=false` 时 Controller bean 与 mapping 均为 0；请求启用但 production
  resolver/codec/signing/verification 等任一依赖缺失、重复或 test-only 时，在 HTTP ready 前失败关闭；
- 修复 consumer cutover 暴露的历史兼容问题：Session profile 继续强制 UTC millisecond，legacy profile 保留
  既有 token 的纳秒精度，避免统一 Principal 无意拒绝历史合法 token。真实双节点回归已覆盖该边界；
- 新增 `scripts/run-eipc1133-harness.mjs`。冻结方案同时禁止修改 root package/lockfile，因此本批以
  `CI=true node scripts/run-eipc1133-harness.mjs` 运行正式 Harness，不新增 root script alias。

## 3. 测试与证据

| 门禁 | 结果 |
| --- | --- |
| EIPC-1.1.3.3 Harness | PASS；8 Java classes / 33 tests；16 次泄漏扫描负向探针；敏感命中 0 |
| `CI=true pnpm run lint` | PASS；Architecture boundary checks passed |
| `CI=true pnpm run check` | PASS；240 files / 1603 tests + 3 smoke |
| `CI=true pnpm run check:central` | PASS；391/0/0/0 / BUILD SUCCESS |
| `CI=true pnpm run check:central:offline` | PASS；391/0/0/0 / BUILD SUCCESS |

Harness evidence digest：

```text
sha256:edc99339b09c98f84fad4efdf0033dbbf1ea7cc0f9efd14e8d1ddeb43e5a2557
```

全部正式 Harness、Workspace、Central online 与 Central offline 门禁从零通过。Central 双门禁包含真实
Testcontainers PostgreSQL、双节点与恢复场景。

## 4. 边界核查

- 未修改 `enterprise-session.v1alpha1` canonical Contract、v0001～v0010 migration 或新增 v0011；
- 未进入 Core、Desktop Main/Preload/Renderer、Admin、个人模型接口、DFI-2B/3 或 TGM；
- 未实现 production handle resolver、token codec、signing/verification key provider；Session feature 默认关闭；
- `package.json` 与 `pnpm-lock.yaml` digest 保持不变；未新增依赖；
- Fake/test adapter 不进入 production dependency graph；两个 identity blocker 继续打开。

## 5. 下一道门禁

EIPC-1.1.3.3 当前只能进入 Claude Code 独立 QA。独立 QA 与用户接受前不得标记 `PASS/CLOSED`，不得由此
自动关闭 EIPC-1.1/EIPC-1，也不得自动进入 EIPC-1.2、EIPC-1.3、EIPC-2～3、STRM-3、
DFI-4A.4.1～4A.4.3、DFI-2B、DFI-3、TGM 或 AFE。
