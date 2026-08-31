# DFI-5.3.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-1543-version-0.0.0-dfi.5.3.2` |
| 验收对象 | DFI-5.3.2：Local Personal Reasoning Mapping（default 完全 omit + max 仅 sealed effort + mapping-before-durable-prepare） |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21） |
| 开发版本 | Root/Core `0.0.0-dfi.5.3.2`；Contracts `0.0.0-r2d.3.1`（不变） |
| 上游 | DFI-5.0/5.1/5.2（含 5.2.1~5.2.3）PASS/CLOSED；DFI-5.3 计划 PASS/CLOSED；DFI-5.3.1 PASS/CLOSED；DFI-5.3.2 Revision 1/2 文档复核 PASS/CLOSED |
| 验收基线 | [DFI-5.3.2 实施报告](docs/development/frontend/DFI-5.3.2-LOCAL-PERSONAL-REASONING-MAPPING-IMPLEMENTATION-REPORT.md) + [DFI-5.3.2 方案 Revision 2](docs/development/frontend/DFI-5.3.2-LOCAL-PERSONAL-REASONING-MAPPING-DEVELOPMENT-PLAN.md) 96 项 QA |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:dfi5.3.2` | **PASS 8 files / 66 tests**；`outcome=DFI532_LOCAL_PERSONAL_REASONING_MAPPING_CONFORMANT`；evidenceDigest `sha256:d8fcaa832b0aa689d6d939e143fc56e3cf3180b28f77f50c4f14e5e020ef60fb` 与实施报告逐字一致 |
| 2 | `pnpm run harness:dfi5.3.1`（historical evidence 不漂移） | **PASS 8 files / 61 tests**；evidenceDigest `sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841` 逐字一致；`dfi532Unlocked=false`（DFI-5.3.1 自记） |
| 3 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 289/289 files、1998/1998 tests + 3 smoke**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true contractVersion=v1alpha1）；145.60s |
| 4 | Central online (`check:central`) | **PASS 424/0/0/0 / BUILD SUCCESS**；3:32 min |
| 5 | Central offline (`check:central:offline`) | **PASS 424/0/0/0 / BUILD SUCCESS**；3:27 min |
| 6 | `pnpm run lint` | **PASS**（eslint + Architecture boundary checks passed） |
| 7 | `pnpm run audit:dtp4` | **PASS**（DTP-4 packaging audit passed） |
| 8 | 基线 | lockfile `sha256:5b15ae01…874f31`（harness 强校验）；migration max=26（harness 强校验）；Contracts 0 修改 |

> harness `run-dfi5.3.2-harness.mjs` 同时强校验 `historicalDfi531EvidenceDigest` 严格等于 `303d342b…cc2841`（artifacts/dfi531/evidence.json 内容比对），任何漂移直接 `dfi531_historical_evidence_drift` 失败；lockfile/migration 边界为运行期强制而非声明。

---

## 二、关键 evidence（harness semanticEvidence 与实测对照）

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `DFI532_LOCAL_PERSONAL_REASONING_MAPPING_CONFORMANT` | harness 输出 |
| `historicalDfi531EvidenceDigest` | `sha256:303d342b…cc2841` | harness 读 `artifacts/dfi531/evidence.json` 比对 |
| `dfi532QaMatrixCount` | 96 | harness 解析 plan 文档 `^\d+\. QA-(\d{3})\b` 并断言 length=96 且 `value===index+1`（连续+唯一） |
| `parentMatrixExecutionStatus` | `retained_for_dfi53_stage_closure` | harness 写入 |
| `exactSubjectRevisionDomain` | `locked_capability_definition_revision` | harness 写入 |
| `personalExecutionIdentityBound` | true | harness 写入 |
| `timeoutPolicyRef` | `timeout.local-personal.model-invocation.v1` | harness 写入 |
| `defaultBodyReasoningFieldCount` | 0 | harness 写入 |
| `maxProfileLoadCount` / `maxMappingLoadCount` | 1 / 1 | harness 写入 |
| `terminalReplayMappingLoadCount` | 0 | harness 写入 |
| `mappingFailureDurablePrepareCount` | 0 | harness 写入 |
| `productionSupportedReleaseCount` | 0 | harness 写入 |
| `authorizedLocalConsumerCount` | 1 | harness 扫描 `services/core/src` 含 `TaskLockedReasoningProviderMapper` 的非 mapper 文件，断言恰好 = `[durable-local-personal-model-provider.ts]` |
| `unexpectedConsumerCount` | 0 | harness 扫描 `packages/contracts/src` + `apps/desktop/src` + `apps/admin-console/src` + `services/central-service/src` 含 `LocalPersonalReasoningProjection\|openai_reasoning_effort` 的文件数 == 0 |
| `enterpriseConsumerCount` / `publicPrivateMappingLeakCount` | 0 / 0 | harness 写入（无 Enterprise 接线；公共 Contract 0 暴露） |
| `productionSubmitTurnV1Alpha3Reachable` | false | harness 写入 |
| `desktopMaxUiReady` / `dfi533Unlocked` | false / false | harness 写入 |
| `migrationMax` / `lockfileDigest` | 26 / `sha256:5b15ae01…874f31` | harness 实算强校验 |
| `evidenceDigest` | `sha256:d8fcaa832b0aa689d6d939e143fc56e3cf3180b28f77f50c4f14e5e020ef60fb` | harness sha256(JSON.stringify(semanticEvidence)) |

---

## 三、重点核查项

### 3.1 Sealed Local projection 与 timeout identity（方案 §3.4 / §3.3 / §3.2 Revision 2）

[local-personal-reasoning-mapping.ts:43-63](services/core/src/application/local-personal-reasoning-mapping.ts#L43) `LocalPersonalReasoningProjectionSchema` `discriminatedUnion("mode")` 仅两分支：

- `mode: "omit"` strict
- `mode: "apply"` strict：含 `providerFamily: "local_openai"`、`mappingRevision === mappingDigest`、`directive.kind === "openai_reasoning_effort"` + `effort: "high"|"xhigh"`

**boolean / bounded_thinking_budget / 任意 JSON patch 均不通过 strict 检查**——只有 DFI-5.3.1 已冻结的 `openai_reasoning_effort` sealed variant 准入。

[local-personal-reasoning-mapping.ts:40-41](services/core/src/application/local-personal-reasoning-mapping.ts#L40) `LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF = "timeout.local-personal.model-invocation.v1"` 为本批 code-owned 新增 ref 字符串（通过 NamespacedResourceIdSchema 正则）；[:102-122](services/core/src/application/local-personal-reasoning-mapping.ts#L102) `localPersonalReasoningTimeoutPolicyIdentity` 校验 `policyRevision/digest/connect/firstProgress/streamIdle/defaultOverall` 全等于既有 `LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1`，任一不等 → typed `reasoning_mapping_conflict`。

### 3.2 Revision 2 exact subject 分层绑定（方案 §3.2）

[local-personal-reasoning-mapping.ts:69-100](services/core/src/application/local-personal-reasoning-mapping.ts#L69) `deriveLocalPersonalReasoningProfileSubject` 严格分层绑定：

- `modelCapabilityId = definition.personalModelId`（exact definition）
- `modelCapabilityRevision = lock.definitionSnapshot.revision`（**Task Capability lock**，与 Personal configuration revision 解耦）
- `personalExecutionDefinitionDigest = definition.executionDefinitionDigest`（exact execution definition）
- `adapterDescriptorId/revision = lock.adapterDescriptorSnapshot.{id,revision}`，且 id 必须等于 `PERSONAL_MODEL_ADAPTER_DESCRIPTOR_ID`（不允许其它 Adapter 伪冒）

任一不匹配 → typed `reasoning_mapping_conflict`，与父方案 §3.3.5 exact key 清单一致。

### 3.3 mapping-before-durable-prepare（方案 §3.5 / G-02）

[durable-local-personal-model-provider.ts:142-156](services/core/src/application/durable-local-personal-model-provider.ts#L142) 严格顺序：

1. terminal/recovery replay exact lookup（[:121-141](services/core/src/application/durable-local-personal-model-provider.ts#L121)）—— **不重新加载 mapping**（`terminalReplayMappingLoadCount=0`）
2. v1alpha1 → 直接 `projectLocalPersonalReasoningMapping({disposition:"omit"})`；v1alpha2 → 派生 subject + timeout identity → `reasoningMapper.map({invocation, providerFamily:"local_openai", exactSubject, timeoutPolicyIdentity})`
3. mapping 完成 → `:loadOrPrepare` 才允许 prepare durable Invocation Link（[:157](services/core/src/application/durable-local-personal-model-provider.ts#L157)）
4. raw Provider Adapter 独立校验并构造 body（[:204-213](services/core/src/application/durable-local-personal-model-provider.ts#L204)）

mapped 缺失/重复/漂移/timeout identity 冲突均在 `:loadOrPrepare` 与上游 I/O 前失败关闭——`mappingFailureDurablePrepareCount=0`。

### 3.4 Raw Adapter defence-in-depth（方案 §3.1）

[local-personal-reasoning-mapping.ts:142-189](services/core/src/application/local-personal-reasoning-mapping.ts#L142) `validateLocalPersonalReasoningProjection` 在 raw Adapter 层独立校验：

- v1alpha1 + projection.mode ≠ "omit" → typed conflict
- v1alpha2 + reasoning.mode === "default_passthrough" + projection.mode ≠ "omit" → typed conflict
- v1alpha2 + projection.mode === "apply" + lock.resolution !== "max_applied" → typed conflict
- strategy/timeout refs 必须精确对齐（strategyId/revision/digest/timeoutPolicyRef）

**不读取 current Profile / current mapping**——raw Adapter 完全靠 caller 传入的 sealed projection 做 allowlist body 序列化。

### 3.5 Body-level allowlist 序列化（方案 §3.5）

[local-personal-openai-compatible-model-provider.ts:447-464](services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts#L447) 两条投影入口：

- `projectOpenAiCompatibleRequest` → `{mode:"omit"}`（默认 / fallback / unknown 路径）
- `projectLocalPersonalReasoningRequest` → `LocalPersonalReasoningProjectionSchema.parse(reasoningProjection)` 后再走 `projectRequest` allowlist

harness 强校验 `raw.includes("reasoning_effort")`（证明 apply 路径确实有 effort 字段）。default `defaultBodyReasoningFieldCount=0` 由 harness 写入——意味着默认/unsupported/unknown 三种 resolution 共享同一 omit projection，body reasoning 相关字段数为 0。

### 3.6 Boundary test 强断言（8 条）

[dfi5.3.2-boundary.test.ts](services/core/tests/dfi5.3.2-boundary.test.ts) 8 条断言全部为真实扫描：

| # | 断言 | 结果 |
|---|---|---|
| 1 | mapper 唯一授权 consumer = `[durable-local-personal-model-provider.ts]`（其他 core/src 文件不得直接引用 `TaskLockedReasoningProviderMapper`） | ✅ |
| 2 | Enterprise/Central/Desktop/Admin consumer = 0（grep `LocalPersonalReasoningProjection\|LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF`） | ✅ |
| 3 | Contracts 0 暴露 `LocalPersonalReasoningProjection\|reasoning_effort\|openai_reasoning_effort` | ✅ |
| 4 | core/src 0 调用 `createProviderReasoningMappingRelease`（生产路径不安装真实 release） | ✅ |
| 5 | 三个核心文件 0 暴露 mapping/timeout 选择通过 `process.env.REASONING/DFI5` 或 `process.argv` | ✅ |
| 6 | migration 止 26 + lockfile digest 实算 == `5b15ae01…874f31` | ✅（harness 同样独立校验） |
| 7 | apps 0 暴露 `reasoning_effort\|openai_reasoning_effort` + bootstrap 0 接入 `ReasoningMappingRelease\|reasoningMapper` | ✅ |
| 8 | focused test 0 命中 `.skip/.only/@Disabled/sleep`（防逃逸断言，非真逃逸） | ✅ |

### 3.7 production/Enterprise/Desktop/Admin/Central 全零接线

本批 Core 新增源文件仅 3 个（mapping/durable provider/body adapter）+ `index.ts` 私有 export；`bootstrap/` 与 `adapters/`（除 Local Personal body adapter）未接入；`apps/desktop/**` / `apps/admin-console/**` / `services/central-service/**` / `packages/contracts/src/**` 0 修改；harness `unexpectedConsumerCount=0`、`productionSubmitTurnV1Alpha3Reachable=false`、`desktopMaxUiReady=false`、`dfi533Unlocked=false` 强校验。

---

## 四、发现

### 4.1 P0 = 0

无。default 完全 omit + max 仅 sealed `reasoning_effort: high|xhigh`；mapping-before-durable-prepare 真实落地（顺序在代码可验证）；exact subject 分层绑定与既有 Personal Model schema 字段一致；raw Adapter defence-in-depth 不依赖 current Profile/mapping；96 项 QA 矩阵连续+唯一（harness 实算）；harness evidenceDigest `sha256:d8fcaa83…60fb` 与实施报告逐字一致。

### 4.2 P1 = 0

无。migration 止 26（无 migration 27）；lockfile `5b15ae01…874f31` 不变（harness 强校验）；`packages/contracts/src/**` 0 修改；未接真实 Provider Adapter / Enterprise Gateway / Central Gateway / production SubmitTurn v1alpha3 / Desktop Max UI / DFI-5.3.3～5.3.4 / DFI-5.4 / TGM / Knowledge Provider / Agent Lifecycle。

### 4.3 P2 = 0

无。`index.ts` 仅追加 Local Personal 相关 export（Core-private 面，与 DFI-5.3.1 export 模式一致）；harness 强校验 `authorizedLocalConsumerCount=1` + `unexpectedConsumerCount=0` 证明生产路径仅 1 个授权 consumer、其它面 0 引用。

### 4.4 P3 = 0

无。focused test 0 命中 `.skip/.only/@Disabled/sleep`（boundary 测试有反断言保护）；DFI-5.3.1 historical harness 复跑 evidenceDigest 不漂移（无历史回归）；Central online/offline 均一次 424/4240/0/0（无 CGF-2B3.2 类首跑偶发）；lint / Architecture boundary / audit:dtp4 全 PASS。

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.3.2 完成 Local Personal Reasoning Mapping 接线：default / fallback / unknown 完全 omit body（reasoning 相关字段数 0）；max_applied 仅按 Task 锁定的 exact Profile/Strategy 生成 sealed `reasoning_effort: high|xhigh`；mapping-before-durable-prepare 在 `:loadOrPrepare` 前完成（缺失/重复/漂移/timeout identity 冲突全部 typed `reasoning_mapping_conflict` 关闭，且 mapping failure durable prepare 计数 = 0）；raw Adapter 独立 defence-in-depth（不依赖 current Profile/mapping）；exact subject 严格分层绑定 Capability revision / Personal configuration / execution digest / Adapter revision（互不替代）；terminal/recovery replay 不重新加载 mapping；retry/restart 沿用 durable deadline；96 项 QA 矩阵连续+唯一、120 项父矩阵按 `retained_for_dfi53_stage_closure` 保留；production supported release count = 0（不宣称真实个人模型已 production Max ready）。

门禁独立复跑：harness:dfi5.3.2 8/66 PASS + evidenceDigest `sha256:d8fcaa83…60fb` 与实施报告逐字一致；harness:dfi5.3.1 8/61 PASS + historical evidenceDigest `sha256:303d342b…cc2841` 不漂移（artifact 强校验 + harness `historicalDfi531EvidenceDigest` 字段断言）；完整 check 289/289 files、1998/1998 tests + 3 smoke；Central online/offline 均 424/0/0/0/BUILD SUCCESS；lint / Architecture boundary / audit:dtp4 全 PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、Contracts 0 修改（harness 强校验）；authorized Local consumer = 1（仅 durable wrapper）、unexpected/Enterprise/public/private mapping leak = 0、production SubmitTurn v1alpha3 / Desktop Max UI / DFI-5.3.3 全部 unreachable。

**DFI-5.3.2 可进入用户接受流程**；接受后 DFI-5.3.2 标记 PASS/CLOSED 并关闭 Local Personal Reasoning Mapping 子批，但 DFI-5.3.3（Anthropic）/ 5.3.4（Lifecycle Closure）、DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 GATED/false，DFI-5.3.1 historical evidence 与 harness 同时只读不覆盖。

— Claude Code（独立 QA，只读）