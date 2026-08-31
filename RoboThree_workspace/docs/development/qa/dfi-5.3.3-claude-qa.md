# DFI-5.3.3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-1932-version-0.0.0-dfi.5.3.3` |
| 验收对象 | DFI-5.3.3：Enterprise OpenAI-compatible / Anthropic-compatible Reasoning Mapping（additive Gateway v1alpha3 + Core/Central 双重 exact 校验 + 双 Provider body projector） |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21） |
| 开发版本 | Root/Core `0.0.0-dfi.5.3.3`；Contracts package 版本不变 |
| 上游 | DFI-5.3 计划 PASS/CLOSED；DFI-5.3.1、DFI-5.3.2 PASS/CLOSED；DFI-5.3.3 方案 Revision 1 文档复核 PASS（P0=0/P1=0/P2=0/P3=2，用户已接受） |
| 验收基线 | [DFI-5.3.3 实施报告](docs/development/frontend/DFI-5.3.3-ENTERPRISE-OPENAI-ANTHROPIC-REASONING-MAPPING-IMPLEMENTATION-REPORT.md) + [DFI-5.3.3 方案](docs/development/frontend/DFI-5.3.3-ENTERPRISE-OPENAI-ANTHROPIC-REASONING-MAPPING-DEVELOPMENT-PLAN.md) 108 项 QA |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:dfi5.3.3` | **PASS 8 TS files / 73 tests + 6 Java classes / 13 tests**；evidenceDigest `sha256:b8ede54d8d22e0458ab80cd7fe059c2c97a105c2101c9cb47622fea48ed9d826` 与实施报告逐字一致 |
| 2 | `pnpm run harness:dfi5.3.2`（历史回归） | **PASS 8 files / 66 tests**；evidenceDigest `sha256:d8fcaa83…60fb` 逐字一致 |
| 3 | `pnpm run harness:dfi5.3.1`（历史回归） | **PASS 8 files / 61 tests**；evidenceDigest `sha256:303d342b…cc2841` 逐字一致 |
| 4 | `pnpm run harness:cpc3` | **PASS 9 files / 68 tests**；`semanticEvidenceDigest=sha256:5105fc90…40b2`（与 harness:dfi5.3.3 引用的 `cpcClosureEvidenceDigest` 一致） |
| 5 | `pnpm run check:central` | **PASS 437/0/0/0 / BUILD SUCCESS** |
| 6 | `pnpm run check:central:offline` | **PASS 437/0/0/0 / BUILD SUCCESS** |
| 7 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 291/291 files、2011/2011 tests + 3 smoke**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true contractVersion=v1alpha1）+ Architecture boundary |
| 8 | `pnpm run lint` / `pnpm run audit:dtp4` | **PASS**（eslint + Architecture boundary / DTP-4 packaging audit） |
| 9 | 基线 | lockfile `sha256:5b15ae01…874f31`（harness 强校验）；migration max=26（harness 强校验）；Contracts src 0 修改 |

---

## 二、关键 evidence（harness semanticEvidence 与实测对照）

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `DFI533_ENTERPRISE_REASONING_MAPPING_CONFORMANT` | harness 输出 |
| `historicalDfi531EvidenceDigest` / `historicalDfi532EvidenceDigest` | `sha256:303d342b…cc2841` / `sha256:d8fcaa83…60fb` | harness 读 `artifacts/dfi531`+`artifacts/dfi532` evidence.json 比对，任一漂移即 `dfi533_historical_evidence_drift` |
| `dfi533QaMatrixCount` | 108 | harness 解析 plan 文档 `^\d+\. QA-(\d{3})\b` 断言 length=108 且连续唯一 |
| `parentQaMatrixCount` / `parentMatrixExecutionStatus` | 120 / `retained_for_dfi53_stage_closure` | harness 读父方案 120 项标题 + §9.1/§9.6 区段断言 |
| `gatewayContractVersion` / `gatewayDispatchVersions` | `v1alpha3` / `[v1alpha1, v1alpha2, v1alpha3]` | harness 写入 |
| `centralIndependentDigestLayers` | 3 | harness 写入（Strategy/Profile/mapping 三层） |
| `centralSecondValidationBeforeAccept` / `centralMappingFailureAcceptCount` / `centralMappingFailureProviderRequestCount` | true / 0 / 0 | harness 写入 |
| `defaultBodyReasoningFieldCount` | 0 | harness 写入 |
| `openAiProjectionKind` / `anthropicProjectionKind` | `reasoning_effort` / `thinking_budget` | harness 写入 |
| `productionGatewayV1Alpha3RouteCount` / `productionEnterpriseOpenAiMaxReleaseCount` / `productionEnterpriseAnthropicMaxReleaseCount` | 0 / 0 / 0 | harness 写入 |
| `productionSubmitTurnV1Alpha3Reachable` / `desktopMaxUiReady` / `productionCpcActivationEnabled` / `productionEnterpriseEntitlementReady` | false / false / false / false | harness 写入 |
| `cpcClosureEvidenceDigest` | `sha256:5105fc90…40b2` | harness 读 `artifacts/cpc3/evidence.json` 的 `semanticEvidenceDigest` |
| `migrationMax` / `lockfileDigest` | 26 / `sha256:5b15ae01…874f31` | harness 实算强校验 |
| `tsTestFileCount` / `tsTestCount` / `javaTestClassCount` / `javaTestCount` | 8 / 73 / 6 / 13 | harness 解析 vitest + surefire-reports 断言 |
| `evidenceDigest` | `sha256:b8ede54d…9d826` | harness sha256(JSON.stringify(semanticEvidence)) |

---

## 三、重点核查项

### 3.1 Gateway v1alpha3 落盘位置（文档复核 P3-1 的澄清）

**关键澄清**：文档复核阶段我提出的 P3-1「Gateway contract 路径/命名空间不一致」是**误报**。Gateway Wire Contract 的 canonical 位置是 **workspace 根 `contracts/enterprise-gateway/`**（非 `packages/contracts/src/`）：
- `contracts/enterprise-gateway/v1alpha1/`、`v1alpha2/` 既有（`CANONICAL-DIGEST.md` / `openapi.yaml` / `schemas/` / `fixtures/`）
- `contracts/enterprise-gateway/v1alpha3/` 本批新增（git status `??` 未跟踪，含 `README.md` / `openapi.yaml` / `CANONICAL-DIGESTS.sha256` / `schemas/{model-invocation,compatibility}.schema.json` / `fixtures/{manifest.json, valid/*, invalid/*}`）

方案 §7.1 的 `contracts/enterprise-gateway/v1alpha3/**` 正是这个位置，与实际落盘完全一致。我当时只查了 `packages/contracts/src`、漏查 workspace 根 `contracts/` 目录，故误报。**本批 v1alpha3 落盘正确、additive（v1/v2 未动）、invalid fixtures 覆盖 half-cache（QA-013）与 raw-reasoning（QA-008/009）拒绝**。

4 个 canonical digest 与实施报告 §2.1 逐字一致：schema `0ba2f3e9…a63a21`、compatibility `630505fd…12f8bc`、OpenAPI `958d0a2c…912aa1`、manifest `9394e4b6…008ddab`。

### 3.2 Core sealed sidecar（方案 §3.2，P3-2 落地）

[enterprise-reasoning-mapping.ts:29-56](services/core/src/application/enterprise-reasoning-mapping.ts#L29) `EnterpriseReasoningSafeSidecarSchema` discriminatedUnion：
- `default_passthrough` strict：仅 `reasoningModeLockId/Digest`（**禁止** Profile/Strategy/mapping/timeout 字段）
- `locked_max_strategy` strict：`reasoningModeLockId/Digest + profileId/profileRevision/profileDigest + strategyId/strategyRevision/strategyDigest + mappingRevision/mappingDigest + timeoutPolicyRef`，`superRefine` 强制 `profileRevision===profileDigest` 且 `mappingRevision===mappingDigest`

这是**独立新增 schema**，不改 `ModelReasoningV1Alpha2Schema`（v1alpha2 字节冻结），profile/mapping refs 是 locked_max_strategy 的增量——文档复核 P3-2 正确落地，未触发停手条件 1/17。

[enterprise-reasoning-mapping.ts:116-165](services/core/src/application/enterprise-reasoning-mapping.ts#L116) `projectEnterpriseReasoningSidecar`：
- v1alpha2 必填（否则 conflict）
- `mapping.disposition === "omit"` → 必须 `request.reasoning.mode === "default_passthrough"`，输出 default variant
- max → 必须 `mode === "locked_max_strategy"` 且 `lock.resolution === "max_applied"` 且 `mapping.providerFamily !== "local_openai"`（enterprise 拒绝 local_openai）

[enterprise-reasoning-mapping.ts:97-114](services/core/src/application/enterprise-reasoning-mapping.ts#L97) `deriveEnterpriseReasoningProfileSubject` authority=`central_enterprise`，exact adapter descriptor id/revision 校验。

### 3.3 Central 第二次独立校验（方案 §3.5/§3.6）

Central 源码（`services/central-service/.../modelgateway/`）完整落地：
- `EnterpriseReasoningMappingRelease` / `ReleasePinnedEnterpriseReasoningMappingSource` / `EnterpriseReasoningMappingSource`（port）—— immutable exact registry
- `EnterpriseReasoningSecondValidator` —— 三层 digest 独立重算 + Endpoint Binding 校验
- `EnterpriseReasoningSafeIdentity` / `EnterpriseReasoningMappingDigests` —— safe identity，不输出 raw directive
- `ModelInvocationV1Alpha3GatewayService` / `DurableModelInvocationV1Alpha3GatewayService` / `ModelInvocationV1Alpha3Runtime`
- `ModelInvocationV1Alpha3Controller`（`/v1alpha3/model-invocations`）
- 三态 gate：`EnterpriseReasoningGatewayConfiguration` / `EnterpriseReasoningGatewayFeatureState` / `EnterpriseReasoningGatewayStartupGate`

harness 强校验 `centralSecondValidationBeforeAccept=true`、`centralMappingFailureAcceptCount=0`、`centralMappingFailureProviderRequestCount=0`（Central-side 失败在 accept/request 前关闭，副作用 0）。

### 3.4 三态 activation gate（方案 §4.1）

harness 输出中可见 Spring 上下文启动日志：
```
WARN ... required enterprise reasoning dependency is unavailable
WARN ... enterprise reasoning Gateway is not production-ready
```
证明 production profile 下 `feature=true` 时 fail-fast（依赖不完整即拒），三态 gate 实际生效，非 fake fallback。

### 3.5 production 边界诚实性（方案 §4.2）

- Core 侧 `grep createProviderReasoningMappingRelease` 0 命中（除 domain 定义文件）—— production 不安装真实 release
- harness 强校验 `productionGatewayV1Alpha3RouteCount=0`、`productionEnterpriseOpenAiMaxReleaseCount=0`、`productionEnterpriseAnthropicMaxReleaseCount=0`、`productionSubmitTurnV1Alpha3Reachable=false`、`desktopMaxUiReady=false`、`productionCpcActivationEnabled=false`、`productionEnterpriseEntitlementReady=false`

### 3.6 测试逃逸反查

- TS 逃逸扫描唯一命中 [dfi5.3.3-boundary.test.ts:82](services/core/tests/dfi5.3.3-boundary.test.ts#L82) `expect(focused).not.toMatch(/\.skip\(|\.only\(|@Disabled|\bsleep\b/)` —— **反断言**（防逃逸），非真逃逸
- Java `@Testcontainers(disabledWithoutDocker=true)` 是既有 `Cgf2a3DualNodeModelRecoveryIntegrationTest`（Docker 集成测试的合法跳过标记），非本批 @Disabled 逃逸

---

## 四、发现

### 4.1 P0 = 0

无。harness:dfi5.3.3 8 TS/73 tests + 6 Java/13 tests PASS；evidenceDigest `sha256:b8ede54d…9d826` 逐字一致；108 项 QA 连续唯一；Core sealed sidecar / Central 三层独立重算 / 三态 gate / production 边界全落地；历史 harness 与 evidence 不漂移。

### 4.2 P1 = 0

无。migration 止 26；lockfile `5b15ae01…874f31` 不变；`packages/contracts/src` 0 修改（Gateway contract 在 workspace 根 `contracts/` 而非 packages/contracts，这是既有约定，非越界）；v1alpha1/v1alpha2 Contract/digest/Controller 零漂移；production v3 route/SubmitTurn/Desktop Max UI 继续不可达；DFI-5.3.4/5.4/TGM/Knowledge Provider/Agent Lifecycle 继续 GATED。

### 4.3 P2 = 0

无。实施报告 §4 诚实记录了开发过程中的三类环境归因（①误并发两轮 root full check 致 dcf13c/R2D4/Document Worker 资源竞争，focused 复跑 11/11；②Central 受限沙箱 loopback EPERM，允许回环环境复跑通过；③audit:dtp4 首跑锁定上一版 `0.0.0-dfi.5.3.2`，只同步 expected version 与测试，不改打包规则）——本机单实例复跑 `check` 291/2011 + 3 smoke、Central online/offline 437/437 全绿，环境归因准确，未把环境失败归到产品代码。

### 4.4 P3 = 0

无。文档复核提出的 P3-1（gateway 路径）经本次核实为**误报**（实际正确落盘 workspace 根 `contracts/enterprise-gateway/`），P3-2（v3 sidecar 字段增量）已正确落地为独立 schema + superRefine 强制 revision===digest。本批无新增非阻断观察项。

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.3.3 完成 Enterprise OpenAI-compatible / Anthropic-compatible Reasoning Mapping：additive Gateway v1alpha3（safe reasoning sidecar + 可选 Prompt Cache，v1/v2 零漂移）；Core 在 durable Invocation Link prepare 前完成 exact Profile/mapping 校验（`EnterpriseReasoningSafeSidecarSchema` sealed union，omit→default / max→locked_max_strategy，superRefine 强制 profile/mapping revision===digest）；Central 独立重算 Strategy/Profile/mapping 三层摘要 + exact Endpoint Binding 校验（第二验证器在 accept/request 前失败关闭，副作用 0）；OpenAI-compatible 只映射 `reasoning_effort: high|xhigh`、Anthropic-compatible 只映射 `thinking.budget_tokens`（必须 < max_tokens）；default/fallback 完全省略 reasoning 参数；三态 activation gate 实际生效（production 依赖不完整即 fail-fast）；production v3 route/Enterprise Max release/SubmitTurn v1alpha3/Desktop Max UI 继续 0/不可达。

门禁独立复跑：harness:dfi5.3.3 8 TS/73 + 6 Java/13 PASS + evidenceDigest `sha256:b8ede54d…9d826` 逐字一致；harness:dfi5.3.2（66 tests）/dfi5.3.1（61 tests）/cpc3（68 tests）历史回归全 PASS 且 evidence 不漂移；Central online/offline 437/0/0/0 BUILD SUCCESS；完整 check 291/291 files、2011/2011 tests + 3 smoke + Architecture boundary；lint / audit:dtp4 PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、`packages/contracts/src` 0 修改；108 项 QA 连续唯一、父 120 项 `retained_for_dfi53_stage_closure`；4 个 v1alpha3 contract canonical digest 与实施报告逐字一致。

**DFI-5.3.3 可进入用户接受流程**；接受后标记 PASS/CLOSED 并关闭 Enterprise Reasoning Mapping 子批，但 DFI-5.3.4（Lifecycle/Cutover/Stage Closure）、DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 GATED/false；DFI-5.3.1/5.3.2 historical evidence 与 harness 只读不覆盖。

— Claude Code（独立 QA，只读）
