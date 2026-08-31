# R2D-P.1 Local Desktop Subject Authority / Entitlement v2 实施报告

> 日期：2026-08-28  
> 开发版本：Root/Core `0.0.0-r2dp.1-pra.1`  
> 状态：**PASS/CLOSED**  
> 最高输出：`R2DP1_LOCAL_AUTHORITY_ENTITLEMENT_CONFORMANT`

## 1. 实施结论

本批完成方案 A 的本地身份与 entitlement 基础，但没有开启 production R2D consumption：

- 新增 `local_desktop_owner` authority，以 migration 23 的 active Personal Model owner namespace 为唯一根；
- 使用独立 HMAC domain `robothree.local-desktop-owner.v1`，不冒充 enterprise identity、SSO 或设备合规；
- 新增 Core-private `TaskResourceEntitlementSnapshot v2` 与 readable union；
- Planner 只消费一次 parse/normalize 后的 canonical entitlement view，v1 语义保持不变；
- production `TaskResourceEntitlementSource` 实现数仍为 0，R2D-P.2/P.3 继续 GATED。

## 2. 关键实现

### 2.1 Local Desktop Subject Authority

`local-desktop-subject-authority.ts` 固定从已验证的 `PersonalModelOwnerNamespace` 派生：

```text
HMAC-SHA256(
  namespaceKey,
  "robothree.local-desktop-owner.v1\n" + canonicalJson({
    schemaVersion: "v1",
    scope: "local_personal_model_and_task_resource"
  })
)
```

实现使用 strict discriminated union 区分 `runtime_active_enterprise_identity`、
`local_desktop_owner` 与 `test_only`。本地分支强制
`productionLocalAuthorityReady=true`、`productionEnterpriseIdentityReady=false`、
`testIdentityUsed=false`。namespace key 仅在 Core 内短暂复制使用，内部副本在派生后清零；不会修改调用方持有的
namespace，也不会进入 Contract、Receipt、日志或 UI。

### 2.2 Entitlement v2 / readable union

`task-resource-entitlement.ts` additive 增加：

- 独立 digest domain `robothree.task-resource-entitlement-snapshot.v2`；
- local-only identity evidence；
- Model/Skill/Tool/Knowledge portable exact refs 与 stable ordinal；
- `ReadableTaskResourceEntitlementSnapshot` 单次 `schemaVersion` dispatch；
- v1/v2 统一 normalized canonical view。

`AgentResourceDecisionPlanner`、Entitlement Port 与 Tool candidate policy 已收窄到 readable union；Planner 在一次
parse/normalize 后复用原交集真值表，不复制 local/enterprise 两套 Planner。既有 Runtime Selection v1alpha3、
coordination v1alpha4、Decision digest 和 public Desktop Contract 均未修改。

## 3. 文件边界

生产代码：

- `services/core/src/application/local-desktop-subject-authority.ts`；
- `services/core/src/application/task-resource-entitlement.ts`；
- `services/core/src/application/agent-resource-decision-planner.ts`；
- `services/core/src/ports/task-resource-entitlement-source.ts`；
- `services/core/src/ports/task-tool-candidate-policy.ts`；
- `services/core/src/index.ts` 的 Core-private 导出。

测试与门禁新增 R2D-P.1 focused tests、共享 boundary test、`run-r2dp1-harness.mjs` 与 content-free Evidence。
未修改 Contracts、Desktop/Admin、Central、migration、依赖或 lockfile；未实现 R2D-P.2 production source、
R2D-P.3 Desktop v1alpha4 或 DFI-5.4.x。

## 4. 验证证据

环境：Node `v24.13.0`、pnpm `11.11.0`、JDK `21.0.12`。

| 门禁 | 结果 |
| --- | --- |
| `harness:r2dp1` | **PASS 4 files / 48 tests**；Evidence `sha256:916e6e93…597701` |
| 共享 focused tests | **PASS 3 files / 18 tests** |
| R2D-3.2 historical Harness | **PASS 7 files / 65 tests** |
| root `check`（宿主环境） | **PASS 298 files / 2057 tests + 3 smoke + Architecture boundary** |
| Central online / offline | **PASS 438 / 438** |
| DFI-5.3.4 historical Harness | **PASS 19 TS files / 159 tests + 7 Java classes / 14 tests** |
| lint / `audit:dtp4` / frozen offline install | **PASS** |
| migration / lockfile | `26` / `sha256:5b15ae01…874f31`（不变） |

root check 在受限沙箱内首次因 `listen EPERM 127.0.0.1` 与 isolated Keychain 不可用产生环境失败；使用相同
Node 24 命令在允许 loopback/Keychain 的宿主环境复跑后 298/298、2057/2057 全部通过，不建立 repair 批次。

## 5. 诚实边界与下一步

当前只证明 local authority 与 Entitlement v2/readable union 可实现且零漂移：

- `productionTaskResourceEntitlementSourceCount=0`；
- `productionR2dConsumptionEnabled=false`；
- `productionEnterpriseIdentityReady=false`；
- `productionCpcActivationEnabled=false`；
- R2D-P.2/P.3、DFI-5.4.1～5.4.3 继续 GATED。

独立 QA 与两轮报告精度修正已由用户正式接受，R2D-P.1 当前 `PASS/CLOSED`。该关闭不自动授权
R2D-P.2/P.3，也不改变 production R2D gate=false 的边界。
