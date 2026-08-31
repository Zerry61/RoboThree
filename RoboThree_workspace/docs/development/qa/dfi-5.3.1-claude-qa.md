# DFI-5.3.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-1329-version-0.0.0-dfi.5.3.1` |
| 验收对象 | DFI-5.3.1：Provider-private Mapping Foundation（非循环摘要链 + Release-pinned Registry + Task-locked Mapper） |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（`/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin/node`，与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21） |
| 开发版本 | Root/Core `0.0.0-dfi.5.3.1`；Contracts `0.0.0-r2d.3.1`（不变）；Desktop/Admin 保持 |
| 上游 | DFI-5.0/5.1/5.2（含 5.2.1~5.2.3）PASS/CLOSED；DFI-5.3 PLAN REVIEW PASS/CLOSED；DFI-5.3.1 Digest Ordering 聚焦修订 PASS/CLOSED（P0=0/P1=0/P2=0/P3=2，用户已接受） |
| 聚焦基线 | [DFI-5.3.1 Digest Ordering 聚焦修订](docs/development/frontend/DFI-5.3.1-PRIVATE-MAPPING-DIGEST-ORDERING-FOCUSED-REVISION.md) §2 非循环三层顺序 + §5 24 项测试增量 |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:dfi5.3.1` | **PASS 8 files / 61 tests**；`outcome=DFI531_PRIVATE_MAPPING_FOUNDATION_CONFORMANT`；`digestOrdering=strategy_then_profile_then_private_mapping`；evidenceDigest `sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841` 与实施报告逐字一致 |
| 2 | 3 个 focused test files 独立复跑 | **PASS 3 files / 25 tests**（private-mapping-domain / task-locked-mapper / boundary；报告声称 25 tests，实跑 25 tests 完全一致） |
| 3 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 287/287 files / 1986/1986 tests + 3 smoke**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true contractVersion=v1alpha1）；150.04s |
| 4 | Central offline | **PASS 424/0/0/0 / BUILD SUCCESS** |
| 5 | Central online | **PASS 424/0/0/0 / BUILD SUCCESS**（本机复跑未复现报告描述的 CGF-2B3.2 首跑偶发；无需单类复跑） |
| 6 | `pnpm run lint` | **PASS**（eslint + Architecture boundary checks passed） |
| 7 | `pnpm run audit:dtp4` | **PASS**（DTP-4 packaging audit passed） |
| 8 | 基线 | lockfile `sha256:5b15ae01…874f31`（harness 强校验）；migration max=26（harness 强校验）；Contracts 0 修改 |

> 注：harness `run-dfi5.3.1-harness.mjs` 本身硬编码 `expectedLockfileDigest=5b15ae01…874f31` 与 `migrationMax=26`，任何漂移直接 `dfi531_lockfile_drift` / `dfi531_migration_boundary_drift` 失败——lockfile/migration 边界是**运行期强制**而非声明。

---

## 二、重点核查项

### 2.1 非循环三层摘要链（聚焦修订 §2 冻结公式落地）

[provider-reasoning-mapping-domain.ts:138-188](services/core/src/application/provider-reasoning-mapping-domain.ts#L138) `createProviderReasoningMappingRelease` 严格按冻结顺序执行：

```text
Layer 1: commitment material（排除 profileRevision/profileDigest/strategyDigest/mappingRevision/mappingDigest）
         → strategyDigest = domainDigest("robothree.provider-reasoning-strategy.v1\n", material)
Layer 2: createReasoningProfile({ ..., maxStrategy.strategyDigest = layer1 digest })
         → profileRevision == profileDigest（复用既有 helper，零新增 Profile digest 逻辑）
Layer 3: mapping material（含 exact profileRef + strategyRef，排除自身 mappingRevision/mappingDigest）
         → mappingDigest → mappingRevision = mappingDigest
```

- ✅ `ProviderReasoningStrategyCommitmentMaterialSchema`（[lines 63-75](services/core/src/application/provider-reasoning-mapping-domain.ts#L63)）`strict()` 且字段清单**不含**任何派生 digest/revision；
- ✅ `ProviderReasoningMappingMaterialSchema`（[lines 77-89](services/core/src/application/provider-reasoning-mapping-domain.ts#L77)）含 `profileRef`/`strategyRef`，`strict()` 且不含自身 `mappingRevision`/`mappingDigest`；
- ✅ `ProviderReasoningMappingSchema`（[lines 91-102](services/core/src/application/provider-reasoning-mapping-domain.ts#L91)）追加 `mappingRevision`/`mappingDigest` 并 `superRefine` 强制 `mappingRevision === mappingDigest`（与 [profile.ts:55](packages/contracts/src/reasoning-mode/profile.ts#L55) `profileRevision === profileDigest` 同构）；
- ✅ [validateProviderReasoningMappingRelease:201-224](services/core/src/application/provider-reasoning-mapping-domain.ts#L201) 发布/重载时重算三层 digest 并精确校验 profile↔mapping↔strategy 全量 exact 配对，任一 byte drift → `reasoning_mapping_conflict`；
- ✅ 非循环证明：Layer 1 无任何 digest 输入、Layer 2 只依赖 Layer 1 产物、Layer 3 只依赖 Layer 1+2 产物，严格单向。

### 2.2 Sealed private mapping 类型 + 组合约束

- ✅ `ProviderReasoningPrivateDirectiveSchema`（[lines 58-61](services/core/src/application/provider-reasoning-mapping-domain.ts#L58)）为 discriminated union，仅两个 sealed variant：`openai_reasoning_effort`（`high|xhigh`）、`anthropic_thinking_budget`（1_024~131_072）——无 generic JSON Patch/任意字段注入；
- ✅ `validatePrivateCombination`（[lines 261-290](services/core/src/application/provider-reasoning-mapping-domain.ts#L261)）强制：`exactSubject.authority === authority`；`local_openai ⇔ local_personal`；Anthropic ⇔ `anthropic_thinking_budget` + `bounded_budget_preset`；非 Anthropic ⇔ `effort_level`；timeout ref 非空；
- ✅ `ProviderReasoningTimeoutPolicyIdentitySchema`（[lines 39-46](services/core/src/application/provider-reasoning-mapping-domain.ts#L39)）`strict()` 含 ref/revision/digest 三要素。

### 2.3 Release-pinned Registry：immutable、exact、无 current fallback

[release-pinned-reasoning-mapping-registry.ts:24-77](services/core/src/application/release-pinned-reasoning-mapping-registry.ts#L24) `ReleasePinnedReasoningMappingRegistry`：

- ✅ constructor 逐 release 调 `validateProviderReasoningMappingRelease` + `assertUniqueReleaseIdentities`（[lines 79-92](services/core/src/application/release-pinned-reasoning-mapping-registry.ts#L79)）拒绝 duplicate exact key / duplicate strategy release / duplicate mappingId；
- ✅ 只暴露 `loadExact` / `loadExactProfile` / `pinnedProfileSource`；**grep 验证全文件 0 命中 `current` / `latest` / `alias` / `fallback`**——无 current alias、无缺失 fallback；
- ✅ `loadExactProfile` 命中 >1 → `reasoning_mapping_conflict`；0 命中 → undefined（由 mapper 转 `unavailable`）；
- ✅ `pinnedProfileSource` 对 pin 缺失抛 `reasoning_mapping_unavailable`、重复 subject 抛 conflict。

### 2.4 Task-locked Mapper：default load=0、max exact load=1、typed fail-closed

[task-locked-reasoning-provider-mapper.ts:46-139](services/core/src/application/task-locked-reasoning-provider-mapper.ts#L46)：

- ✅ `default_passthrough`（[lines 70-72](services/core/src/application/task-locked-reasoning-provider-mapper.ts#L70)）：**在任何 profile/mapping load 前**直接返回 `{ disposition: "omit" }`——load 计数为 0；
- ✅ `max_applied`（[lines 94-138](services/core/src/application/task-locked-reasoning-provider-mapper.ts#L94)）：profile 恰好 load 1 次 + mapping 恰好 load 1 次；
- ✅ typed fail-closed：缺失 → `reasoning_mapping_unavailable`；重复/漂移/subject/timeout 冲突 → `reasoning_mapping_conflict`（[lines 108-131](services/core/src/application/task-locked-reasoning-provider-mapper.ts#L108)）；
- ✅ `validateInvocationIdentity`（[lines 142-159](services/core/src/application/task-locked-reasoning-provider-mapper.ts#L142)）校验 taskId/requestId/requestDigest/model capability/resolvedModelLock digest 全 exact；
- ✅ `validateRequestReasoning`（[lines 161-182](services/core/src/application/task-locked-reasoning-provider-mapper.ts#L161)）校验 request reasoning 与 lock 精确对应；default lock + max request → conflict；
- ✅ 独立测试 `dfi5.3.1-task-locked-mapper.test.ts` 以**真实 instrumented 计数**断言：default `{profileLoads:0, mappingLoads:0}`（[line 46](services/core/tests/dfi5.3.1-task-locked-mapper.test.ts#L46)）、max `{profileLoads:1, mappingLoads:1}`（[line 81](services/core/tests/dfi5.3.1-task-locked-mapper.test.ts#L81)）、缺失 material `zeroSideEffects()` 八类计数全 0（[lines 84-100](services/core/tests/dfi5.3.1-task-locked-mapper.test.ts#L84)）。

### 2.5 24 项聚焦矩阵 + 120 项父矩阵保留（非伪造）

- ✅ harness 真实解析聚焦修订 §5 的 `numberedItemsBetween("## 5. DFI-5.3.1 聚焦测试增量", "## 6. 聚焦复核问题")`，断言 `focusedMatrixAssertionCount === 24`；
- ✅ harness 真实解析父方案 `QA 矩阵（120 项）` 标题 + `### 9.1`/`### 9.6` 区段 + 第 120 项文本，断言 `parentMatrixDefinitionCount === 120` 且 `parentMatrixRetained=true`、`parentMatrixExecutionStatus=retained_for_dfi53_stage_closure`（不伪报 5.3.2~5.3.4 项目为本批完成）；
- ✅ 3 个 focused test files 25 tests 独立复跑通过；其中 boundary.test.ts:107-113 显式断言 focused 测试**无 `.skip/.only/@Disabled/setTimeout/sleep` 逃逸**。

### 2.6 边界与生产隔离（harness 运行期强校验）

harness `run-dfi5.3.1-harness.mjs` 独立扫描并强校验：

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `productionMapperConsumerCount` | 0 | 扫描 `services/core/src/bootstrap` + `adapters` 中 `TaskLockedReasoningProviderMapper|ReleasePinnedReasoningMappingRegistry` 命中数 == 0，否则 `dfi531_production_consumer_present` |
| `publicPrivateMappingLeakCount` | 0 | 扫描 `packages/contracts/src` + `apps/desktop/src` + `apps/admin-console/src` 中 `ProviderReasoningMapping|typedPrivateDirective|mappingDigest` 命中数 == 0，否则 `dfi531_public_private_mapping_leak` |
| `providerAdapterConnected` | false | 本批无 Provider Adapter 接线 |
| `enterpriseGatewayV1Alpha3Ready` | false | `packages/contracts/src/enterprise-gateway/` 目录不存在（ls 验证） |
| `productionSubmitTurnV1Alpha3Reachable` | false | 无 production SubmitTurn v1alpha3 route |
| `desktopMaxUiReady` | false | Desktop Max UI 未接入 |
| `dfi532Unlocked` | false | DFI-5.3.2 仍 GATED |
| `migrationMax` | 26 | 解析 migrations.ts 所有 `id:` 最大值 == 26 |
| `lockfileDigest` | `sha256:5b15ae01…874f31` | 实算 pnpm-lock.yaml sha256 == 硬编码期望值 |

今日 Core 生产文件新增仅：`provider-reasoning-mapping-domain.ts` / `release-pinned-reasoning-mapping-registry.ts` / `task-locked-reasoning-provider-mapper.ts` / `ports/provider-reasoning-mapping-source.ts` + `index.ts` 追加 3 行 export（另有 R2D-3.3 既往 uncommitted export 混入 index.ts diff，非本批）。`services/core/src/bootstrap` 与 `adapters` 0 引用 mapper/registry。

---

## 三、发现

### 3.1 P0 = 0

无。非循环三层摘要链完全按聚焦修订冻结公式实现；Registry immutable exact、无 current fallback；Mapper default load=0 / max exact load=1 / typed fail-closed；production bootstrap 0 消费；Contract/migration/lockfile 零漂移。

### 3.2 P1 = 0

无。migration 仍止 26（无 migration 27）；lockfile `5b15ae01…874f31` 不变；`packages/contracts/src/**` 0 修改；未接真实 Provider / Enterprise Gateway v1alpha3 / production SubmitTurn v1alpha3 / Desktop Max UI。

### 3.3 P2 = 0

无。`index.ts` 追加 3 行 export 属本批预期模块面暴露（与既有 domain export 模式一致）；harness 强校验 `productionMapperConsumerCount=0` 证明生产路径不消费。

### 3.4 P3 = 1

**P3-1 — 报告描述的 CGF-2B3.2 首跑偶发在本机复跑未复现（`ENV_ONLY_OBSERVATION`）**

报告声称 Central online 首跑 422/424（`Cgf2b32DualNodeRelayRecoveryIntegrationTest` failpoint/fencing timing 2 项偶发）、单类复跑 3/3 PASS。本机复跑 Central online **一次通过 424/0/0/0**，未复现该偶发。

**对结论的影响**：不构成 DFI-5.3.1 缺陷（该测试属 Central CGF-2B3.2 既有时序用例，DFI-5.3.1 在 Central Java source graph 无改动，报告已诚实保留首跑事实 + 单类复跑证据）。本机一次通过佐证该偶发为环境时序噪声。**P3-1 仅作环境观察记录，不阻断。**

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1
```

DFI-5.3.1 完成 Provider-private Mapping Foundation：非循环三层摘要链（Provider-private Strategy commitment → safe ReasoningProfile helper → full private mapping）严格按聚焦修订冻结公式实现，material 均 `strict()` 且排除自身派生 digest，`mappingRevision === mappingDigest` 与既有 `profileRevision === profileDigest` 同构；三类 sealed private directive（OpenAI `high|xhigh` effort / Anthropic bounded thinking budget / exact timeout identity）经 discriminated union + `validatePrivateCombination` 强制组合约束；Release-pinned Registry immutable exact lookup、constructor 拒绝 duplicate 三重 identity、grep 验证 0 命中 current/latest/alias/fallback；Task-locked Mapper default_passthrough 在任何 load 前返回 omit（计数 0）、max_applied 对 exact Profile/mapping 各 load 恰一次、缺失/重复/漂移/timeout 冲突全部 typed fail-closed（八类上游副作用 0），Mapper 未注入任何真实 Provider。

门禁独立复跑：harness:dfi5.3.1 8/61 PASS + evidenceDigest `sha256:303d342b…cc2841` 与实施报告逐字一致；3 个 focused files 25 tests 独立复跑 PASS；完整 check 287/287 files、1986/1986 tests、3 smoke；Central offline/online 均 424/0/0/0/BUILD SUCCESS；lint / Architecture boundary / audit:dtp4 全 PASS；migration 止 26（harness 强校验）；lockfile `5b15ae01…874f31` 不变（harness 强校验）；Contracts 0 修改；productionMapperConsumerCount=0、publicPrivateMappingLeakCount=0（harness 运行期扫描强校验）；enterpriseGatewayV1Alpha3Ready=false、productionSubmitTurnV1Alpha3Reachable=false、desktopMaxUiReady=false、dfi532Unlocked=false。

**DFI-5.3.1 可进入用户接受流程**；接受后 DFI-5.3.1 标记 PASS/CLOSED 并关闭 Provider-private Mapping Foundation 子批，但 DFI-5.3.2（Local Personal Mapping）~5.3.4（Anthropic + Lifecycle Closure）、DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 GATED/false，不自动解锁；DFI-5.3 父方案 120 项 QA 矩阵按 `parentMatrixExecutionStatus=retained_for_dfi53_stage_closure` 在 DFI-5.3 阶段收口时执行，本批不伪报。

**P3-1（CGF-2B3.2 首跑偶发，本机未复现）**仅作环境观察记录，不阻断；建议用户接受前在 CI/隔离环境做一次 Central online 复跑确认。

— Claude Code（独立 QA，只读）