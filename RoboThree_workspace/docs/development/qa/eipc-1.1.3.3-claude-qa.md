# EIPC-1.1.3.3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-24-1830-version-eipc.1.1.3.3` |
| 验收对象 | EIPC-1.1.3.3：Validator / Common Authorizer / Conditional HTTP |
| 日期 | 2026-08-24 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker / PostgreSQL 16（Testcontainers + embedded） |
| 开发版本 | 逻辑批次 `EIPC-1.1.3.3`；Root 按冻结边界保持 `0.0.0-eipc.1.1.3.2` |
| 上游 | EIPC-1.1.3.1、EIPC-1.1.3.2 `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true node scripts/run-eipc1133-harness.mjs` | **PASS**：8 Java classes / 33 tests；`outcome=EIPC113_SESSION_HTTP_FOUNDATION_CONFORMANT`；`controllerMappingCountWhenDisabled=0`、`sessionBranchCountWhenDisabled=0`、`legacyDirectConsumerCount=0`、`startupFailureBeforeHttpReadyProven=true`、四个 production implementation count 均 0、canonical/schema drift 0、敏感命中 0 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 240 files / 1603 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | 首跑偶发 2 Failure，两轮从零复跑均 **PASS 391/0/0/0 / BUILD SUCCESS**（见 §三） |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 391/0/0/0 / BUILD SUCCESS**（363→391，新增 28 个 Java 测试） |

Harness evidence digest 与报告一致：`sha256:edc99339…2557`。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | Composite 真值表完整 | ✅ [CompositeEnterpriseBearerAuthorizer.java](services/central-service/src/main/java/com/robothree/central/authentication/application/CompositeEnterpriseBearerAuthorizer.java) 对每个 branch 调完整 `authorize()`（不读未验证 payload 选 branch）；**unavailable 先检查**（任一 unavailable 即返回，双 unavailable 不同 code 统一）；双 success `ambiguous`（即使 principal 相同）；双 expired `ambiguous`；单 expired+invalid → 返回 expired；全 invalid → Invalid |
| 2 | verified expiry 顺序 | ✅ [EnterpriseSessionTokenValidator.java](services/central-service/src/main/java/com/robothree/central/authentication/application/EnterpriseSessionTokenValidator.java) 严格按方案 12 步：bearer 校验 → key handle（失败 unavailable）→ decodeAndVerify → claims → loadLeaseByTokenId（缺 Invalid/依赖异常 unavailable）→ timing-safe digest + claims/issuance 逐字段 → **最后才判 expiry** |
| 3 | 纳秒精度修复 | ✅ [EnterpriseBearerPrincipal.java:57-63](services/central-service/src/main/java/com/robothree/central/authentication/domain/EnterpriseBearerPrincipal.java#L57) Session profile `requireUtcMillis`、legacy profile 只 `requireNonNull`（保留纳秒）；legacy principal 直接透传 legacy claims 时间，不引入统一截断 |
| 4 | 三态启动 gate | ✅ [EnterpriseSessionFeatureStartupGate.java](services/central-service/src/main/java/com/robothree/central/authentication/configuration/EnterpriseSessionFeatureStartupGate.java) 9 个必需类型逐一校验；missing/ambiguous/non-production（`.support.`/`.test.`/`.persistence.memory.` 或 fake/fixed/inmemory/deterministic/development 前缀）三类启动失败，`CentralProductionStartupException` → HTTP ready 前 fail-closed |
| 5 | Filter extract-only | ✅ Eipc1133BoundaryTest 读 Filter 源码断言只调 `EnterpriseBearerTokenExtractor.extract`，且禁 `Fake::new` |
| 6 | Cutover 完整性 | ✅ harness `legacyDirectConsumerCount=0`；唯一允许持有 legacy validator 的是 `LegacyBearerAuthorizerAdapter`（完整调用 `validateAt`，不复制 JWT 解析） |
| 7 | disabled 三零 | ✅ harness `controllerMappingCountWhenDisabled=0` + `sessionBranchCountWhenDisabled=0`；property=false 时请求 404 而非假 endpoint |
| 8 | production 四实现数 0（真实 source graph） | ✅ resolver/codec/signing/verification 四类 `implements` 扫描均 0 |
| 9 | 测试断言真实性 | ✅ 反查无 `@Disabled`/`@Ignore`；8 test class 覆盖 Composite 真值表/Validator/StartupGate/FeatureContext/HttpFoundation/ModelGateway/legacy Controller/Boundary |
| 10 | 边界零漂移 | ✅ 改动 = Central `authentication` adapter/application/configuration/domain/port + `configuration`/`modelgateway` application cutover + Central test + scripts harness；未改 Wire Contract/deploy（无 v0011）/Core/Desktop/Renderer/Admin；`pnpm-lock.yaml` digest 仍 `eff299c4…`、root `package.json` 仍 `02b9e8db…`（本批未碰，lockfile 变更为 AFE P0-B 批的 workspace probe 所致） |

---

## 三、Central online 首跑偶发失败说明

`check:central` 首跑 `Tests run: 391, Failures: 2`，两轮从零复跑均 **391/0/0/0 / BUILD SUCCESS**。

- 本批**修改了 Central 生产代码**（consumer cutover），故未直接断言「不可能由本批引入」，而是比既往多复跑一轮确认；
- 两轮复跑全绿证明为偶发而非稳定缺陷（若 cutover 引入稳定回归，golden regression 会持续失败）；
- 失败模式与既往 Testcontainers 多 JVM/多容器资源竞争一致；offline 一次通过；
- 如实记录首跑事实，不构成 EIPC-1.1.3.3 的 P 级缺陷。

---

## 四、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

EIPC-1.1.3.3 正确完成 Validator / Common Authorizer / Conditional HTTP：strict `EnterpriseSessionTokenValidator`
（verified expiry 仅在 cryptographic + durable + timing-safe digest + 逐字段绑定全部通过后投影）；Composite
真值表完整（恰好一个 success、双 success/expired ambiguous、unavailable 优先、不读未验证 payload）；legacy
纳秒精度兼容修复（Session 强制 millisecond、legacy 保留既有精度）；Configuration/Model Gateway 同批 cutover
（`legacyDirectConsumerCount=0`）；Filter 保持 extract-only；Conditional HTTP Foundation 默认关闭（disabled 时
Controller/mapping/session branch 三零 + 404）；property=true 依赖缺失/重复/test-only 时 HTTP ready 前启动失败。
门禁独立复跑全绿（harness 8 classes / 33 tests、check 240/1603 + 3 smoke、Central online 两轮复跑 391/391、
offline 391/391）。边界零漂移：仅改 Central authentication/configuration/modelgateway + test + harness，未改
Wire Contract/deploy/Core/Desktop/Renderer/Admin，root package 与 `pnpm-lock.yaml` 未被本批触碰（lockfile 当前
状态属 AFE P0-B 批）。

**EIPC-1.1.3.3 可进入用户接受流程；接受后 EIPC-1.1 线（Contract → Persistence → Decision → Validator/HTTP）
完整收口，但 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity composition blocker 仍保持
打开、production Session 仍默认关闭。EIPC-1.2（Local Credential / Signer / Token Provider）、EIPC-1.3、
EIPC-2～3、STRM-3、DFI-4A.4.1～4A.4.3、DFI-2B/3、TGM、AFE 保持 GATED。**

— Claude Code（独立 QA，只读）
