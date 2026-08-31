# R2D-P.1 + PRA-1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-28-0018-version-0.0.0-r2dp.1-pra.1` |
| 验收对象 | R2D-P.1（Local Desktop Subject Authority + Entitlement v2 / readable union）+ PRA-1（Immutable Evidence / Admission Policy） |
| 日期 | 2026-08-28 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21） |
| 开发版本 | Root/Core `0.0.0-r2dp.1-pra.1`；Contracts package 版本不变 |
| 上游 | DFI-5.0~5.3 + DFI-5.4 父计划 + DFI-5.4.0 controlling addendum `PASS/CLOSED`；DFI-5.4 方案 A 前置详细计划 `PLAN REVIEW PASS/CLOSED`；DFI-5.4.1~5.4.3 仍 `GATED` |
| 验收基线 | [R2D-P.1 实施报告](docs/development/frontend/R2D-P.1-LOCAL-DESKTOP-AUTHORITY-ENTITLEMENT-IMPLEMENTATION-REPORT.md) + [PRA-1 实施报告](docs/development/frontend/PRA-1-IMMUTABLE-EVIDENCE-ADMISSION-POLICY-IMPLEMENTATION-REPORT.md) + [DFI-5.4 方案 A 前置计划](docs/development/frontend/DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md) 96 项 QA |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

### 1.1 专项 Harness

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:r2dp1` | **PASS 4 files / 48 tests**；evidenceDigest `sha256:916e6e93b6022ec4a669a37d58f9eb024d0e710af52ae9c93bb3bf25fa597701` 与实施报告逐字一致 |
| 2 | `pnpm run harness:pra1` | **PASS 5 files / 25 tests**；evidenceDigest `sha256:f9aebbf3ec885e4171cdb623013d4f8d1f42e1db84eaba0f3e45398cd515a66b` 与实施报告逐字一致 |

### 1.2 历史 Harness（只读回归）

| # | 门禁 | 结果 |
|---|---|---|
| 3 | `pnpm run harness:dfi5.3.4` | **PASS 19 TS files / 159 tests + 7 Java classes / 14 tests**；evidenceDigest `sha256:bf89b2fd…3c3a08`（DFI-5.3.4 stage closure evidence）逐字一致；其历史 3 个 digest（dfi531/dfi532/dfi533）+ 4 个 v1alpha3 canonical digest 全不漂移 |
| 4 | `pnpm run harness:r2d4` | **PASS 18 files / 179 tests**；evidenceDigest `sha256:fa571872…0007b` 逐字一致；`productionR2dGateEnabled=false` + `productionEntitlementImplementationCount=0` |
| 5 | `pnpm run harness:r2d3.2` | **PASS 7 files / 65 tests**；evidenceDigest `sha256:bdcc56bd…0771a` 逐字一致；`productionR2dGateEnabled=false` + `productionEntitlementImplementationCount=0` |

### 1.3 Workspace 回归

| # | 门禁 | 结果 |
|---|---|---|
| 6 | `pnpm run check:central` | **PASS 438/0/0/0 / BUILD SUCCESS** |
| 7 | `pnpm run check:central:offline` | **PASS 438/0/0/0 / BUILD SUCCESS** |
| 8 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 298/298 files、2057/2057 tests + 3 smoke**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true contractVersion=v1alpha1）+ Architecture boundary |
| 9 | `pnpm run lint` / `pnpm run audit:dtp4` | **PASS**（eslint + Architecture boundary / DTP-4 packaging audit） |
| 10 | 基线 | lockfile `sha256:5b15ae01…874f31`（两个 harness 强校验）；migration max=26（两个 harness 强校验）；Contracts src 0 修改 |

---

## 二、关键 evidence（harness semanticEvidence 与实测对照）

### 2.1 harness:r2dp1

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `R2DP1_LOCAL_AUTHORITY_ENTITLEMENT_CONFORMANT` | harness 输出 |
| `authorityKind` | `local_desktop_owner` | harness 写入；与方案 §2.1/§2.2 一致 |
| `entitlementSchemaVersion` | `v2` | harness 写入；与方案 §3.1 R2D-P.1 additive v2 一致 |
| `readableUnionSingleDispatch` | true | harness 写入；Planner 单次 `schemaVersion` dispatch，不复制交集真值表 |
| `plannerNormalizedViewCount` | 1 | harness 写入；Planner 只消费一次 normalize 后的 canonical view |
| `productionTaskResourceEntitlementSourceCount` | 0 | harness 写入；production source 由 R2D-P.2 关闭 |
| `productionR2dConsumptionEnabled` / `productionEnterpriseIdentityReady` / `productionCpcActivationEnabled` | false / false / false | harness 写入；local ready ≠ enterprise ready（与方案 §2.2 互斥一致） |
| `r2dp2Unlocked` / `r2dp3Unlocked` / `desktopV2ConsumptionReady` / `dfi541Unlocked` | false / false / false / false | harness 写入；本批不自动解锁任何下游 |
| `migrationMax` / `lockfileDigest` | 26 / `sha256:5b15ae01…874f31` | harness 实算强校验 |
| `testFileCount` / `testCount` | 4 / 48 | harness 解析 vitest 断言 |
| `evidenceDigest` | `sha256:916e6e93…597701` | harness sha256(JSON.stringify(semanticEvidence)) |

### 2.2 harness:pra1

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `PRA1_IMMUTABLE_EVIDENCE_ADMISSION_POLICY_CONFORMANT` | harness 输出 |
| `exactOpenAiCandidateCount` | 1 | harness 写入；OpenAI GPT-5.2 `gpt-5.2-2025-12-11` 单一 candidate |
| `admissionState` | `pending_conformance` | harness 写入；**未宣称 admitted** |
| `deepSeekDisposition` | `requires_mapping_revision` | harness 写入；blockers = directive_variant + tool_continuation_private_state |
| `productionSupportedReleaseCount` | 0 | harness 写入；无 production release 安装 |
| `productionProviderReleaseMaterializerCount` / `productionLocalPersonalMaxReleaseCount` | 0 / 0 | harness 写入；由 PRA-2 关闭 |
| `productionSubmitTurnMaxReachable` / `desktopMaxUiReady` | false / false | harness 写入；Max UI 不可达 |
| `pra2Unlocked` / `pra3Unlocked` / `dfi541Unlocked` | false / false / false | harness 写入；本批不自动解锁 |
| `historicalDfi53EvidenceDigest` | `sha256:bf89b2fd…3a08` | harness 实际读取 `artifacts/dfi534/evidence.json`（DFI-5.3.4 closure evidence，harness 内部字段名 `historicalDfi53EvidenceDigest` 是历史命名保留，实际承载 DFI-5.3.4 evidence），断言不漂移 |
| `lockfileDigest` / `testFileCount` / `testCount` | `sha256:5b15ae01…874f31` / 5 / 25 | harness 实算 + 解析 |
| `evidenceDigest` | `sha256:f9aebbf3…15a66b` | harness sha256(JSON.stringify(semanticEvidence)) |

---

## 三、重点核查项

### 3.1 Local Desktop Subject Authority（LDA-1）

[local-desktop-subject-authority.ts:103-138](services/core/src/application/local-desktop-subject-authority.ts#L103) `deriveLocalDesktopSubjectAuthority` 严格落地方案 §2.1 七条冻结规则：

- ✅ **独立 HMAC domain**：`LOCAL_DESKTOP_OWNER_HMAC_DOMAIN = "robothree.local-desktop-owner.v1"`（与 enterprise owner / Desktop Preference owner 完全分离）
- ✅ **namespace key 用完清零**：L108 `validated.namespaceKey.fill(0)` + L135-137 `finally { key.fill(0) }` 双重清零
- ✅ **identityEvidence 互斥**：`productionLocalAuthorityReady=true` + `productionEnterpriseIdentityReady=false` + `testIdentityUsed=false` strict
- ✅ **strict discriminated union**：authorityKind ∈ `runtime_active_enterprise_identity` / `local_desktop_owner` / `test_only` 三分支
- ✅ **不进 Contract/Receipt/log/Main/Renderer**：HMAC binding 派生后只保留 ownerScopeDigest，不暴露 namespace key 原文

`validateLocalDesktopSubjectAuthority`（[:140-154](services/core/src/application/local-desktop-subject-authority.ts#L140)）重算三要素（namespaceRevision / ownerScopeDigest / authorityRevision），任一漂移抛 `local_authority.integrity_invalid`。

### 3.2 Entitlement v2 / readable union

[task-resource-entitlement.ts:114-117](services/core/src/application/task-resource-entitlement.ts#L114) `TaskResourceEntitlementSnapshotV2Schema`：authorityKind 强制 `local_desktop_owner`、含 identityEvidence / Model-Skill-Tool-Knowledge portable refs + stable ordinal + snapshotDigest。

Planner 单次 `schemaVersion` dispatch（readable union）、v1 字节冻结、`plannerNormalizedViewCount=1`（不复制交集真值表）——与方案 §3.1 R2D-P.1「Planner 只消费 normalize 后的 canonical entitlement view，不复制两份交集真值表」一致。

### 3.3 PRA-1：Immutable Evidence + Admission Policy

[provider-release-admission-policy.ts:189-225](services/core/src/application/provider-release-admission-policy.ts#L189) `OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE`：

- ✅ `policyId="provider_release.openai.gpt_5_2_2025_12_11"` exact binding 单一 snapshot
- ✅ `admissionState="pending_conformance"` + `productionAdmitted=false`（**未宣称 admitted**，与方案 §4.1 一致）
- ✅ `exactModelIdAllowlist=["gpt-5.2-2025-12-11"]` 单一锁定
- ✅ `endpointIdentityRule` exact：`https://api.openai.com/v1/chat/completions`
- ✅ `strongestDirective: { kind: "openai_reasoning_effort", effort: "xhigh" }` 与既有 DFI-5.3.1 sealed projector 一致
- ✅ `evidenceSources` + `revocationRule` + `supersessionRule` 三条 code-owned governance
- ✅ 官方 URL `<https://developers.openai.com/api/docs/models/gpt-5.2>` 与 `<https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2>` 仅作出处，release graph 只认仓库内 immutable material 与 digest（与方案 §4.1 「URL 会变化只作出处」一致）

[provider-release-admission-policy.ts:227-243](services/core/src/application/provider-release-admission-policy.ts#L227) `DEEPSEEK_THINKING_MODE_ADMISSION_EXCLUSION`：

- ✅ `disposition: "requires_mapping_revision"` 不静默映射
- ✅ `blockers: ["directive_variant", "tool_continuation_private_state"]` 明确停止条件
- ✅ evidence sources 含官方 URL（同样仅出处不入 graph）
- ✅ PRA-1 不添加 boolean/budget/token 字段、不修改 Gateway schema、不创建 JSON patch、不把营销名称当作 supported 证据

### 3.4 production 边界诚实性（harness 强校验）

两个 harness 都强校验关键 production 状态为 false/0（V-02 表），证明本批**未越权解锁任何下游**：

| 边界字段 | r2dp1 | pra1 | 验证 |
|---|---|---|---|
| `productionTaskResourceEntitlementSourceCount` | 0 | — | ✅ |
| `productionR2dConsumptionEnabled` | false | — | ✅ |
| `productionEnterpriseIdentityReady` | false | — | ✅ |
| `productionCpcActivationEnabled` | false | — | ✅ |
| `productionProviderReleaseMaterializerCount` | — | 0 | ✅ |
| `productionLocalPersonalMaxReleaseCount` | — | 0 | ✅ |
| `productionSubmitTurnMaxReachable` | — | false | ✅ |
| `desktopMaxUiReady` | — | false | ✅ |
| `r2dp2Unlocked` / `r2dp3Unlocked` / `dfi541Unlocked` | false / false / false | false | ✅ |

### 3.5 历史 evidence 不漂移 + Contracts 0 修改

- PRA-1 harness `historicalDfi53EvidenceDigest=sha256:bf89b2fd…3c08`（实测来自 artifacts/dfi534/evidence.json，即 DFI-5.3.4 closure evidence；harness 内部字段名沿用历史命名，DFI-5.3.3 evidence digest 实际为 `sha256:b8ede54d…9d826`，来自 artifacts/dfi533/evidence.json，本批未触发该字段断言）
- 3 个 historical evidence 文件（dfi531/dfi532/dfi533）hash 运行前后不变（dfi531 `9e69adfc…`、dfi532 `1540343d…`、dfi533 `8269bac2…`）；PRA-1 Harness 另外读取 `artifacts/dfi534/evidence.json`，校验其内层 `evidenceDigest=sha256:bf89b2fd…3c3a08`，但不校验 dfi534 文件自身 hash
- `packages/contracts/src/` 0 修改（DFI-5.3 historical Contract 字节冻结）
- `services/core/src/application/local-desktop-subject-authority.ts` + `task-resource-entitlement.ts` + `provider-release-admission-policy.ts` + 4 个相关 planner/port/index 私有导出（mtime 集中于 Aug 27 23:43~23:45）；报告声称边界正确

### 3.6 测试真实性反查

- 测试逃逸扫描 `\.skip\(|\.only\(|@Disabled|\bsleep\(`（含 R2D-P.1 + PRA-1 全部 test files）：**NONE FOUND**（TS NONE）
- production `createProviderReasoningMappingRelease` 在 Core 全部调用方 grep：0 命中（除 domain 定义）—— production 无任何 release 安装

---

## 四、发现

### 4.1 P0 = 0

无。LDA-1 strict discriminated union + 独立 HMAC domain + identityEvidence 三要素互斥；Entitlement v2 readable union 单次 dispatch；PRA-1 candidate `pending_conformance`/`productionAdmitted=false`、DeepSeek `requires_mapping_revision` 不静默映射；两个 harness 12+15 项 semantic evidence 全 PASS；historical evidence + Contracts + lockfile + migration 全零漂移；production 全部边界为 false/0。

### 4.2 P1 = 0

无。migration 止 26；lockfile `5b15ae01…874f31` 不变；production release count=0；production SubmitTurn Max/Desktop Max UI/CPC/entitlement/GPT-5.2 admission 全部未解锁；R2D-P.2/P.3、PRA-2/PRA-3、DFI-5.4.1~5.4.3、DFI-4A.4 public CRUD、Admin v2、TGM、Knowledge Provider、Agent Lifecycle 全部 GATED。

### 4.3 P2 = 0

无。R2D-P.1 实施报告 §4 与 PRA-1 实施报告 §5 均诚实记录 root check 首次在受限沙箱因 `listen EPERM 127.0.0.1` + isolated Keychain 不可用产生环境失败，使用同 Node 24 命令在允许 loopback/Keychain 的宿主环境复跑后一次通过，**不建立 repair 批次**——本机单实例复跑 root check 298/2057 + Central 438/438 + 全 historical harness PASS，无环境失败归因到产品代码。

### 4.4 P3 = 0

无。本批两个子批（CLA 侧）的核心设计（local_desktop_owner strict 分支、Entitlement v2 readable union、OpenAI pending_conformance、DeepSeek requires_mapping_revision）均与方案 A 前置计划 §2/§3/§4 严格一致；两个 harness 强校验的 12+15 项 evidence 全部覆盖方案 §9 96 项 QA 的关键子集；本批独立 QA 全程只读，未修改任何生产代码、依赖或配置。

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

R2D-P.1 完成 Local Desktop Subject Authority（LDA-1）：以 migration 23 `personal_model_owner_scope_namespaces` active namespace 为唯一根，独立 HMAC domain `robothree.local-desktop-owner.v1`、namespace key 双 `fill(0)` 清零、strict discriminated union 三分支（`runtime_active_enterprise_identity` / `local_desktop_owner` / `test_only`）、identityEvidence 三要素互斥（local ready + enterprise false + test false），不冒充企业身份/SSO/设备合规；Entitlement v2 新增 readable union + 单次 `schemaVersion` dispatch + Planner 单一 normalized view（不复制交集真值表），v1 字节冻结，Runtime Selection v1alpha3/coordination v1alpha4/Decision digest/public Desktop Contract 全部零修改。PRA-1 完成 Immutable Evidence + Admission Policy：OpenAI GPT-5.2 `gpt-5.2-2025-12-11` candidate 精确绑定（endpoint `https://api.openai.com/v1/chat/completions`、strongest directive `openai_reasoning_effort: xhigh`、exact adapter/projector/timeout identities + evidenceSources + revocation/supersession rule），`admissionState="pending_conformance"`、`productionAdmitted=false`，**未宣称 admitted**；DeepSeek V4 记录为 `requires_mapping_revision`（blockers = directive_variant + tool_continuation_private_state），不静默映射为 `xhigh`，不修改 Gateway schema，不添加 boolean/budget/token 字段。

门禁独立复跑全部 PASS：harness:r2dp1 4 TS/48 tests + evidenceDigest `sha256:916e6e93…597701` 逐字一致；harness:pra1 5 TS/25 tests + evidenceDigest `sha256:f9aebbf3…15a66b` 逐字一致；harness:dfi5.3.4（19 TS/159 + 7 Java/14）历史 evidenceDigest `bf89b2fd…3a08` 不漂移；harness:r2d4（18/179） + harness:r2d3.2（7/65） + Central online/offline 各 438/0/0/0 + root check 298/298 files、2057/2057 tests + 3 smoke + Architecture boundary + lint / audit:dtp4 PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变、Contracts src 0 修改；production release count=0、Max UI/R2D production consumption/SubmitTurn Max/CPC/entitlement/TGM/Knowledge/Agent Lifecycle/v2 consumption 全部继续 GATED。

**R2D-P.1 与 PRA-1 可分别/合并进入用户接受流程**；接受后：
- **R2D-P.1 标记 PASS/CLOSED**：local authority + Entitlement v2 基础落地，不自动解锁 R2D-P.2
- **PRA-1 标记 PASS/CLOSED**：admission policy 候选冻结 + DeepSeek exclusion，不自动解锁 PRA-2/3
- 后续路径：R2D-P.2/P.3（production source + Desktop v1alpha4 cutover）与 PRA-2/PRA-3（exact subject materializer + Provider lifecycle closure）按方案 §5 关键路径并行推进 → 两条线独立 QA + 用户接受 → 重新评估 DFI-5.4.1 编码授权
- TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 public CRUD、Admin v2 继续 GATED

独立 QA 全程只读，未修改任何生产代码、依赖或配置；本轮仅新增 QA 报告与 DEVELOPMENT-LOG 回链两处文档。

— Claude Code（独立 QA，只读）