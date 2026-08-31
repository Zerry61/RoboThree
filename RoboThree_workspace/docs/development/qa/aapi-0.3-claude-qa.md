# AAPI-0.3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-0859-version-0.0.0-aapi.0.3` |
| 验收对象 | AAPI-0.3：Central 侧 read-only Projection inventory（六模块）+ 服务端 Principal/capability 授权 + 12 条只读 GET + queryRevision/HMAC cursor/ETag/304/typed safe error |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（`/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin/node`，与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21）/ Docker 29.6.2 |
| 开发版本 | Root `0.0.0-aapi.0.3`；Contracts 保持 `0.0.0-r2d.3.1`；Desktop/Admin/Central/Document Worker 版本不变 |
| 上游 | R2D-0～R2D-4 PASS/CLOSED；AAPI-0/AAPI-0.1/AAPI-0.2 PASS/CLOSED；本批由用户单独授权 |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21 + Docker）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `export PATH=…/v24.13.0/bin:…/openjdk@21/bin:$PATH JAVA_HOME=… CI=true pnpm run harness:aapi0.3` | **PASS**；`outcome=AAPI03_TEST_ONLY_READ_HTTP_SHELL_CONFORMANT`、`getRouteCount=12`、`mutationRouteCount=0`、`productionControllerBeanCount=0`、`productionMappingCount=0`、`productionTestInventorySourceCount=0`、`negativeLeakInjectionDetectionCount=80`、`fourChannelLeakageMatchCounts` 四通道全 0、`javaTestClassCount=8`、`javaTestCount=33`、`typescriptTestFileCount=2`、`typescriptTestCount=10`、`testIdentityUsed=true`、`productionIdentityReady=false`、`productionAdminReadHttpReady=false`、`browserSecurityReady=false`、`adminAdapterReady=false`、`tgmReady=false`、`knowledgeProviderReady=false`、`agentLifecycleReady=false`；`evidenceDigest=sha256:ea6548a9aa00a23fc6aee9d1985c4e69cd29b4f18ec82f2979b05713ec2c36ec` 与实施报告逐字一致 |
| 2 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 284 / 284 files / 1961 / 1961 tests + 3 smoke**（`core.ready` / `foundation-smoke ready fixtureOnly=true` / `preload-smoke ready sandbox=true contractVersion=v1alpha1`）；145.06s |
| 3 | `export PATH=…/v24.13.0/bin:…/openjdk@21/bin:$PATH JAVA_HOME=… CI=true pnpm run check:central` | **PASS 424 / 0 / 0 / 0 / BUILD SUCCESS**（注意：AAPI-0.3 增加 20 个 Java test，404 → 424） |
| 4 | `... CI=true pnpm run check:central:offline` | **PASS 424 / 0 / 0 / 0 / BUILD SUCCESS** |
| 5 | `CI=true pnpm run lint` | **PASS**（eslint + Architecture boundary checks passed） |
| 6 | `CI=true pnpm run audit:dtp4` | **PASS**（DTP-4 packaging audit passed） |
| 7 | `shasum -a 256 pnpm-lock.yaml` | `sha256:c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07` 未变 |
| 8 | 边界 | migration 最大 id=26；Root `0.0.0-aapi.0.3`、Contracts `0.0.0-r2d.3.1` |

> 注：本轮 Central online/offline 一次通过，未命中既往 tracing exporter timeout / 端口冲突环境偶发。首次跑 `harness:aapi0.3` 因 PATH 无 JDK 报 `Unable to locate a Java Runtime`，与 AAPI-0.3 代码无关，按用户根因规则把 JDK21 注入 PATH 后全绿。

---

## 二、重点核查项（对照方案 §3.2/§5/§6/§7 与 96 项 QA）

### 2.1 12 条只读 GET route 精确注册（QA-049～QA-051）

✅ [AdminReadHttpController.java:43-191](services/central-service/src/main/java/com/robothree/central/admincontrol/adapter/http/AdminReadHttpController.java#L43) 12 个 `@GetMapping` 严格对应：

| Route | 行号 |
|---|---|
| `/admin/v1alpha1/capabilities/current` | L43 |
| `/admin/v1alpha1/models` / `/models/{modelId}` | L55 / L68 |
| `/admin/v1alpha1/robots` / `/robots/{robotId}` | L80 / L93 |
| `/admin/v1alpha1/skills` / `/skills/{skillId}` | L105 / L119 |
| `/admin/v1alpha1/tools` / `/tools/{toolId}` | L130 / L143 |
| `/admin/v1alpha1/knowledge` / `/knowledge/{knowledgeId}` | L155 / L168 |
| `/admin/v1alpha1/system/audit-events` | L180 |

无 POST/PUT/PATCH/DELETE；无 generic dispatcher。evidence `getRouteCount=12` / `mutationRouteCount=0`。

### 2.2 三态启动门（development|test profile + 显式 property）

✅ [AdminReadHttpController.java:25-30](services/central-service/src/main/java/com/robothree/central/admincontrol/adapter/http/AdminReadHttpController.java#L25) `@Profile({"development", "test"})` + `@ConditionalOnProperty(name = "robothree.admin-api.test-read-shell-enabled", havingValue = "true")`；[AdminReadHttpConfiguration.java:16-18](services/central-service/src/main/java/com/robothree/central/admincontrol/configuration/AdminReadHttpConfiguration.java#L16) 同步双条件。production profile 下 Controller/mapping bean 直接不注册，evidence `productionControllerBeanCount=0` / `productionMappingCount=0`。

### 2.3 production graph guard 扩展到三类对象

✅ [AdminControlProductionGraphGuard.java:24-42](services/central-service/src/main/java/com/robothree/central/admincontrol/configuration/AdminControlProductionGraphGuard.java#L24) production profile 下：
- `AdminPrincipalProvider` 任一实现 → `central.admin_control_principal_provider_forbidden_in_production`
- `AdminModuleInventorySource` 任一 bean → `central.admin_control_inventory_source_forbidden_in_production`
- `AdminReadHttpController` 任一 bean → `central.admin_control_http_forbidden_in_production`

且 `principalProvider` 实现类型还拒绝 `.support.` / `.test.` / `.persistence.memory.` 命名空间与 `fake` / `fixed` / `inmemory` / `deterministic` / `development` 命名前缀（防 `Fake/fixed/InMemory/Development` 冒充生产）——证据 evidence `productionTestInventorySourceCount=0`。

### 2.4 §3.2 Authority → Central Java Service/Port 精确映射

✅ 实施报告 §2 表格与代码一一对应（直接调用既有 `ConfigurationSnapshotRepository.findActive()` + `ConfigurationIntegrityVerifier.verifySnapshot()` + `ModelInvocationAuditAuditOutboxRepository.findPending(100)`），不引入新 Repository 方法/查询/表/索引/持久 cursor/读取语义，不修改 Configuration/Model Gateway/Audit 既有写路径。

| 模块 | 实际调用 | 缺失事实处理 |
|---|---|---|
| Model | snapshot + integrity verifier | snapshot 不存在/损坏即 unavailable/fail-closed；provider/default 无 authority 字段 typed unavailable，**不补默认值** |
| Robot | snapshot + integrity verifier | publish/review/restriction 无 authority → partial/known item unavailable，**不冒充 ready** |
| Skill | snapshot + `findExactReferencedPackage` 复用既有 `PackageDocumentRepository` | 仅 content-free summary，**不返回 Skill 正文或 materializedRef** |
| Tool | 无可信 Central Service/Port | **不创建 success item**；readOnly/risk/TGM authority 缺失整体 gated/unavailable，**不填 false/unknown healthy** |
| Knowledge | snapshot + integrity verifier | Provider/retrieval readiness 不存在 → **state 不得 ready**，明确 gated/partial |
| Audit | audit outbox `findPending(100)` | 仅 content-free system event，**不冒充完整企业审计** |

### 2.5 queryRevision / HMAC cursor / ETag/304（§6）

| 核查项 | 结论 |
|---|---|
| HMAC cursor | ✅ `HmacAdminCursorCodec` 使用 per-runtime 随机 key，opaque cursor 绑定 module/queryRevision/最后排序键，restart 后旧 cursor typed stale |
| 稳定排序 | ✅ list 走 `AdminReadProjectionService.list` 稳定排序 + bounded page |
| ETag/304 | ✅ [AdminReadHttpController.java:255-262](services/central-service/src/main/java/com/robothree/central/admincontrol/adapter/http/AdminReadHttpController.java#L255) `CacheControl.noStore()` + `ETag` 头；304 无 body；ETag 仍先完成 Principal/capability authorization（不绕过授权） |
| 合法 ETag 格式 | ✅ [L36](services/central-service/src/main/java/com/robothree/central/admincontrol/adapter/http/AdminReadHttpController.java#L36) `"sha256:[a-f0-9]{64}"` |

### 2.6 typed safe error（§7）

✅ [AdminReadHttpController.java](services/central-service/src/main/java/com/robothree/central/admincontrol/adapter/http/AdminReadHttpController.java) 401/403/404/410/422/503 八种状态码均通过 `AdminReadException` 抛出；`AdminReadHttpExceptionHandler` 只返回固定 safe error envelope，不暴露 stack/internal exception/digest。limit 1～100、`contentLength > 0` / `Transfer-Encoding` header → 400 invalid_request；resourceId 不匹配 `^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$` → 400。

### 2.7 服务端 Principal/capability 授权 + capability ∩ module availability

✅ `AdminReadRequestAuthorizer` 先建立 AAPI-0.2 test-only Principal，再计算 `min(principalCapabilityState, moduleAvailability)`（方案 §4.3）。前端不能通过传 capability key 改变 effectiveState；`unavailable/gated` 优先于数据存在；write/action capability 始终 gated。

### 2.8 80 次负向泄漏注入 + 四通道零命中

✅ `aapi03-evidence.mjs` proveNegativeCoverage = 5 canary × 4 encoding × 4 channel = 80 次，每次精确检出；evidence `negativeLeakInjectionDetectionCount=80`、`fourChannelLeakageMatchCounts` 四通道全 0。

### 2.9 文件边界

| 允许 | 实际变更 |
|---|---|
| `services/central-service/src/main/java/com/robothree/central/admincontrol/**` | ✅ admincontrol/application + domain + adapter/http + configuration 14 个新增 Java |
| `services/central-service/src/test/java/com/robothree/central/admincontrol/**` | ✅ admincontrol/adapter/http + application + architecture 5 个新增 Java test |
| `packages/contracts/fixtures/admin-control/v1alpha1/**` | ✅ `aapi03-read-projections.json` 新增 |
| Root version / packaging audit | ✅ Root `0.0.0-aapi.0.3` |
| 实施报告 + 治理文档 | ✅ |

| 禁止 | 核对 |
|---|---|
| `apps/admin-console/**` | ✅ git status 无 `apps/admin-console/**` 变更 |
| `apps/desktop/**` | ✅ 无 Desktop 变更 |
| `services/core/**` 业务代码 | ✅ services/core/src/** 的 M 均为 R2D-3.3 编码批遗留 |
| `admin-control.v1alpha1` schema/version | ✅ [packages/contracts/src/admin-control/v1alpha1/](packages/contracts/src/admin-control/v1alpha1/) 冻结（仅 contracts/tests 增 aapi03 fixture + 一条 conformance test） |
| migration | ✅ 仍止 26 |
| 依赖 / `pnpm-lock.yaml` | ✅ digest 未变 |
| POST/PUT/PATCH/DELETE Controller | ✅ Controller 无 mutation 注解 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 1

**P3-1 — AAPI-0.3 通过在 Admin Adapter/Desktop/未接 production identity 下保持 production AdminReadHttpReady=false（按设计）；中央 Admin 与 Desktop 真实贯通仍待 AAPI-0.4 Browser security、Admin Adapter、EIPC production identity 三项全部 PASS/CLOSED（非本批、非阻断）**

- AAPI-0.3 按方案 §1.3 与 §5.4 明确不宣称 production ready；evidence `productionAdminReadHttpReady=false`、`browserSecurityReady=false`、`adminAdapterReady=false`、`productionIdentityReady=false`。
- 这意味着 Central Admin 现在已能通过 test-only HTTP shell 输出 12 条 GET，但 Admin Console 前端（`apps/admin-console/src/adapters/admin-adapter.ts` 仍只有 `getCapability()`）与 Desktop Robot/Tool Catalog 真实接通尚未发生——这正是 AAPI-0.4 的范畴（Browser session/CSRF/CSP/Origin + Admin Adapter E2E）。
- 这是 R2D-4 QA 报告"Backend/Desktop/Admin interface unblock priority"中明确标注的现状（Desktop Robot/Tool Catalog 已真实接通，Admin 当前直接阻塞为 AAPI-0.3～0.4），AAPI-0.3 只是 unblock 的第一步。
- 非本批缺陷、非阻断；后续 AAPI-0.4 + Admin Adapter 单独审批后即可推进。

---

## 四、结论

```text
INDEPENDENT_QA_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（按设计 Admin 与 Desktop 真实贯通仍需 AAPI-0.4，非本批、非阻断）
```

AAPI-0.3 完成 Central 侧 read-only Projection inventory + 服务端授权 + test-only HTTP shell 闭环：12 条 GET route 精确注册且 mutation=0（evidence `getRouteCount=12`、`mutationRouteCount=0`）；production profile 下 Controller/mapping/test inventory source 三零（`productionControllerBeanCount=0`、`productionMappingCount=0`、`productionTestInventorySourceCount=0`），且 `AdminControlProductionGraphGuard` 拒绝 `fake/fixed/inmemory/development` 命名前缀冒充生产；六模块分别按既有可信 authority 投影为 `partial | unavailable | gated`，Model/Robot/Skill 走 `ConfigurationSnapshotRepository.findActive()` + `ConfigurationIntegrityVerifier.verifySnapshot()`（Skill 进一步走 `findExactReferencedPackage` 复用既有 `PackageDocumentRepository`），Tool 因无可信 TGM/readOnly/risk Service 整体 gated/unavailable（**不补默认值**），Knowledge Provider/retrieval readiness 不存在 → state 不得 ready，Audit 仅读既有 audit outbox content-free system events（**不冒充完整企业审计**）；服务端 Principal/capability 授权 + `min(principalCapabilityState, moduleAvailability)`，前端不能传 capability key 改变 effectiveState；queryRevision/HMAC cursor（per-runtime key、restart 后 stale）/稳定排序/ETag/304/typed safe error（401/403/404/410/422/503 八种）全部落地，ETag 命中仍先授权；80 次负向泄漏注入（4 通道 × 5 canary × 4 编码）全部精确检出、正常四通道命中 0；migration 26、lockfile `c47641ac…f815a07` 未变、Root `0.0.0-aapi.0.3`、Contracts `0.0.0-r2d.3.1`。

门禁独立复跑：harness:aapi0.3 8 Java classes / 33 tests + 2 TS files / 10 tests + evidenceDigest 与实施报告逐字一致 + 9 项 readiness 全 false；完整 check 284/284 files、1961/1961 tests、3 smoke；Central online/offline 均 **424/0/0/0/BUILD SUCCESS**（首次 tracing exporter timeout 偶发未复现，JDK 缺失 PATH 注入后全绿）；lint / Architecture boundary / audit:dtp4 全 PASS。本批零 Admin/Desktop 变更、零 Admin Adapter 抢跑、零 mutation Controller、零生产代码抢跑，仅在 `services/central-service/.../admincontrol/**` 内做 additive Java + 一份 Cross-language fixture。

唯一 P3 按设计保留：AAPI-0.3 通过但 Admin 与 Desktop 真实贯通仍待 AAPI-0.4 Browser security + Admin Adapter + EIPC production identity 三项全部 PASS/CLOSED，这是接口优先级梳理中已明确标注的现状。

**AAPI-0.3 可进入用户接受流程；接受后 AAPI-0.4、Admin Adapter、DFI-5.3、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 GATED，不自动解锁；production identity、production Admin Read HTTP、Browser security、adminAdapter、tgm、knowledgeProvider、agentLifecycle 继续 false。**

— Claude Code（独立 QA，只读）