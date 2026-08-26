# AAPI-0.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-24-2320-version-aapi.0.2` |
| 验收对象 | AAPI-0.2：Test-only Admin Principal / Capability Projection |
| 日期 | 2026-08-24 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root `0.0.0-aapi.0.2` |
| 上游 | AAPI-0.1 `PASS/CLOSED`；DFI-3A.1 `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | contracts focused | **PASS 1 file / 7 tests**（含新增 subpath export 自动解析断言） |
| 2 | Central focused | **PASS 3 classes / 13 tests**（BoundaryTest 3 + ServiceTest 5 + ConfigurationTest 5） |
| 3 | `CI=true pnpm run check`（root） | **PASS 243 files / 1620 tests + 3 smoke + Architecture boundary** |
| 4 | `CI=true pnpm run check:central` | **PASS 404/0/0/0 / BUILD SUCCESS**（391→404 为新增 13 个测试） |
| 5 | `CI=true pnpm run check:central:offline` | **PASS 404/0/0/0 / BUILD SUCCESS** |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | production graph guard fail-closed | ✅ [AdminControlProductionGraphGuard.java](services/central-service/src/main/java/com/robothree/central/admincontrol/configuration/AdminControlProductionGraphGuard.java) production profile 下 `getBeanNamesForType(AdminPrincipalProvider)` 任一存在 → `CentralProductionStartupException`（HTTP ready 前失败）；零 provider → 通过（**不创建 fallback fake**）；BoundaryTest 负向断言故意触发启动失败并通过 |
| 2 | test-only Principal | ✅ [DevelopmentAdminPrincipalProvider.java](services/central-service/src/main/java/com/robothree/central/admincontrol/application/DevelopmentAdminPrincipalProvider.java) sentinel id `admintest_aapi02_fixed_sentinel` + `AdminIdentityFlags.testOnly()`；`@Profile({"development","test"})` 条件装配 |
| 3 | identity flag 组合约束 | ✅ [AdminIdentityFlags.java](services/central-service/src/main/java/com/robothree/central/admincontrol/domain/AdminIdentityFlags.java) `testIdentityUsed && productionIdentityReady` → IllegalArgumentException |
| 4 | Capability 投影 | ✅ `AdminCapabilitySource` TEST_ONLY/PRODUCTION 两枚举；`AdminCapabilityState` READY/UNAVAILABLE/GATED/PARTIAL；ProvisionalAdminCapabilities read=ready、write/action=gated，8 组 key 与方案 §7 一致 |
| 5 | 无身份推断路径 | ✅ 无 OS user/浏览器/路由/菜单/LocalStorage/cookie 推断；Principal 只有固定 sentinel |
| 6 | AAPI-0.1 P3-1 修复 | ✅ contracts 测试新增「resolves the admin-control v1alpha1 subpath export from the built package」——用真实 `import("@robothree/contracts/admin-control/v1alpha1")` 验证解析 + >40 导出 + envelope schema |
| 7 | 测试断言真实性 | ✅ 反查无 `@Disabled`/`@Ignore`；3 test class 覆盖 guard/service/configuration |
| 8 | 边界零漂移 | ✅ 改动 = Central `admincontrol/**`（main 16 + test 3）+ contracts 1 个测试文件 + root version + 治理文档；未改 admin-console/desktop/src/core/deploy（无 migration）；`pnpm-lock.yaml` 仍 `b7c6d0a7…` |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

AAPI-0.2 正确完成 Test-only Admin Principal / Capability Projection：`DevelopmentAdminPrincipalProvider`
仅在 development/test profile 装配（sentinel id + testOnly flags）；production profile 下任何
AdminPrincipalProvider bean 都触发 HTTP ready 前 fail-closed（不 fallback 不降级）；`AdminIdentityFlags`
组合约束（testIdentityUsed+productionIdentityReady 失败）；Capability Projection source=test-only、
read=ready/write=gated、8 组 provisional key；无身份推断路径。上轮 AAPI-0.1 的 P3-1（subpath export 无自动
断言）已修复。门禁独立复跑全绿（contracts 7、Central focused 13、root check 243/1620、Central online/offline
404/404）。边界零漂移：仅改 Central admincontrol + contracts test + root version + 治理文档，未改
admin-console/desktop/core/migration，`pnpm-lock.yaml` 未变。

**AAPI-0.2 可进入用户接受流程；接受后不自动解锁 AAPI-0.3（read-only Projection inventory + HTTP shell）、
AAPI-0.4、AdminAdapter/AFE consumption、TGM、Knowledge Provider 或 production identity。DFI-3A.2、
DFI-5（Max）与全部下游保持 GATED。**

— Claude Code（独立 QA，只读）
