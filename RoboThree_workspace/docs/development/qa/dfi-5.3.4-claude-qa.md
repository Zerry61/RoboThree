# DFI-5.3.4 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-2154-version-0.0.0-dfi.5.3.4` |
| 验收对象 | DFI-5.3.4：Lifecycle / Cutover / Stage Closure（closure-only，三 Provider 链统一收口 + 父 120 项账本 + 真实进程/SIGKILL/SQLite reopen + 三轮 semantic replay + 80 次负向注入 + 14 类资源归零） |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21） |
| 开发版本 | Root/Core `0.0.0-dfi.5.3.4`；Contracts package 版本不变 |
| 上游 | DFI-5.3 计划 PASS/CLOSED；DFI-5.3.1、5.3.2、5.3.3 均 PASS/CLOSED；DFI-5.3.4 方案 Revision 1 文档复核 PASS（P0=0/P1=0/P2=0/P3=2，用户已接受） |
| 验收基线 | [DFI-5.3.4 实施报告](docs/development/frontend/DFI-5.3.4-LIFECYCLE-CUTOVER-STAGE-CLOSURE-IMPLEMENTATION-REPORT.md) + [方案](docs/development/frontend/DFI-5.3.4-LIFECYCLE-CUTOVER-STAGE-CLOSURE-DEVELOPMENT-PLAN.md) 96 项 focused QA + 父方案 120 项账本 |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm run harness:dfi5.3.4` | **PASS 19 TS files / 159 tests + 7 Java classes / 14 tests**；evidenceDigest `sha256:bf89b2fda81f2b11cac63ca0ad58f1962bd309b587b48b0e1e19ba2c493c3a08` 与实施报告逐字一致 |
| 2 | `pnpm run harness:dfi5.3.3`（历史回归） | **PASS 8 TS / 73 tests + 6 Java / 13 tests**；evidenceDigest `sha256:b8ede54d…9d826` 不漂移 |
| 3 | `pnpm run harness:dfi5.3.2`（历史回归） | **PASS 8 files / 66 tests**；evidenceDigest `sha256:d8fcaa83…60fb` 不漂移 |
| 4 | `pnpm run harness:dfi5.3.1`（历史回归） | **PASS 8 files / 61 tests**；evidenceDigest `sha256:303d342b…cc2841` 不漂移 |
| 5 | `pnpm run harness:dfi5.2.3` | **PASS 11 files / 116 tests** |
| 6 | `pnpm run harness:cpc3` | **PASS 9 files / 68 tests**；semanticEvidenceDigest `sha256:5105fc90…40b2` 不漂移 |
| 7 | `pnpm run check:central` | **PASS 438/0/0/0 / BUILD SUCCESS**（3:31 min） |
| 8 | `pnpm run check:central:offline` | **PASS 438/0/0/0 / BUILD SUCCESS** |
| 9 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 295/295 files、2039/2039 tests + 3 smoke**（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true contractVersion=v1alpha1）+ Architecture boundary；152.00s |
| 10 | `pnpm run lint` / `pnpm run audit:dtp4` | **PASS**（eslint + Architecture boundary / DTP-4 packaging audit） |
| 11 | 基线 | lockfile `sha256:5b15ae01…874f31`（harness 强校验）；migration max=26（harness 强校验） |

---

## 二、关键 evidence（harness semanticEvidence 与实测对照）

| evidence 字段 | 值 | 校验方式 |
|---|---|---|
| `outcome` | `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT` | harness 输出 |
| `historicalDfi531/532/533EvidenceDigest` | `303d342b…` / `d8fcaa83…` / `b8ede54d…` | harness `assertHistoricalEvidence` 双校验：① `sha256(artifacts/{dfi531,dfi532,dfi533}/evidence.json)` 运行前后文件 hash 不变；② 内层 `evidenceDigest` 字段匹配，三批 historical 实测一致 |
| `parentQaMatrixCount` | 120 | harness 读父方案 120 项 §9.1~§9.6 |
| `parentMatrixExecutionStatus` | `executed_at_dfi53_stage_closure` | harness 从 `retained_for_dfi53_stage_closure` 迁移而来（仅 120 项全部 pass 后迁移，符合方案 §3.8 G8） |
| `parentQaLedger` | 120 项 `{qaId/ownerTest/providerPath/evidenceKey/result}` | harness 写入；实测 ownerTest 分布：QA-001~040 跨 dfi5.3.1+dfi5.3.3/dfi5.3.2+dfi5.3.3 组合，QA-041~064 含 dfi5.3.1+dfi5.3.2+dfi5.3.3 三批，QA-065~084 dfi5.3.3 enterprise_gateway，QA-085~120 dfi5.3.4-lifecycle/boundary |
| `focusedQaMatrixCount` | 96 | harness 解析 plan `^\d+\. QA-(\d{3})\b` 断言 length=96 且连续唯一 |
| `semanticReplayCount` / `semanticReplayPathRunCount` | 3 / 9 | harness 写入（每 provider 3 轮 fresh process = 9 次 path run） |
| `negativeLeakInjectionDetectionCount` | 80 | harness `proveDfi534LeakScannerNegativeCoverage`（5 canary × 4 encoding） |
| `normalLeakMatchCount` | 0 | harness `scanDfi534Leakage` 跨 stdout/stderr/evidenceJson/failureJson 四通道 |
| `localPersonalPathConformant` / `enterpriseOpenAiPathConformant` / `enterpriseAnthropicPathConformant` | true / true / true | harness 写入 |
| `productionSubmitTurnV1Alpha3Reachable` / `desktopMaxUiReady` / `productionCpcActivationEnabled` / `productionEnterpriseEntitlementReady` / `tgmReady` / `knowledgeProviderReady` / `agentLifecycleReady` / `desktopAdminV2ConsumptionReady` | 全 false | harness 写入 |
| `productionGatewayV1Alpha3RouteCount` / `productionLocalPersonalMaxReleaseCount` / `productionEnterpriseOpenAiMaxReleaseCount` / `productionEnterpriseAnthropicMaxReleaseCount` | 0 / 0 / 0 / 0 | harness 写入 |
| `gatewayV1Alpha3CanonicalDigests` | 4 个文件 digest 与 DFI-5.3.3 逐字一致 | harness `boundaryEvidence` 读取 |
| `migrationMax` / `lockfileDigest` | 26 / `sha256:5b15ae01…874f31` | harness 实算强校验 |
| `resourceCounts` | 14 类全 0 | harness `exactDfi534ResourceCounts` 从 `processEvidence` + `centralEvidence` 实测合并 |
| `processEvidence.crashScenarioCount` | 6 | 真实进程证据（Local×2 + Enterprise OpenAI×2 + Enterprise Anthropic×2，每 provider 两个 barrier：`reasoning_mapping_validated` + `invocation_link_committed`） |
| `processEvidence.semanticReplayDigests` | 9 个 digest（3 provider × 3 轮），同 provider 三轮一致 | 权威字段（mapping/deadline/Usage）稳定 + PID/port/path 作为 process noise 排除 |
| `processEvidence.uniqueSemanticDigestCountByProvider` | `{local_personal_openai:1, enterprise_openai:1, enterprise_anthropic:1}` | harness 写入 |
| `centralEvidence.restartScenarioCount` | 2（OpenAI + Anthropic） | harness 写入；最终 `activeCentralChildren:0`、`listeningPorts:0`、`providerFixtureServers:0` |
| `tsTestFileCount` / `tsTestCount` / `javaTestClassCount` / `javaTestCount` | 19 / 159 / 7 / 14 | harness 解析 vitest + surefire-reports 断言 |
| `evidenceDigest` | `sha256:bf89b2fd…3a08` | harness sha256(JSON.stringify(semanticEvidence)) |

---

## 三、重点核查项

### 3.1 真实进程 Lifecycle（方案 §3.2 G2）

[run-dfi5.3.4-harness.mjs:62-99](scripts/run-dfi5.3.4-harness.mjs#L62) harness 串行执行：① vitest 跑 19 个 focused files（含 DFI-5.3.1~5.3.4 + Provider/Timeout/Compaction 等历史回归）→ ② Maven 跑 7 个 Java classes（含 DFI-5.3.3 六个 + DFI-5.3.4 专有 `Dfi534EnterpriseLifecycleIntegrationTest`）→ ③ 读三个 runtime evidence 文件（process/boundary/central），三者 status 必须为 PASS。

实测 crash scenarios [evidence.json → processEvidence.scenarios](artifacts/dfi534/evidence.json)：
- Local × 2（barrier `reasoning_mapping_validated` / `invocation_link_committed`）
- Enterprise OpenAI × 2（同上）
- Enterprise Anthropic × 2（同上）
- 每个 scenario 含 `crashedPid` / `recoveredPid` / `replayPid`（真实不同 PID）、`mappingDigest`（保留权威 digest）、`deadlineAt`（不变）、`terminalReplayMappingLoadCount=0`/`terminalReplayUpstreamRequestCount=0`/`terminalReplayUsageProjectionCount=0`

`processIds` 9 个实测 PID 全部唯一（真实不同进程）；与方案 §3.2 严格禁止的「单进程冒充/throw 冒充 SIGKILL/删库冒充 reopen/body-mock 冒充 Provider/sleep 猜窗口」完全相反。

### 3.2 父 120 项 ledger + 状态迁移（方案 §3.8 G8）

[evidence.json → parentQaLedger](artifacts/dfi534/evidence.json) 实测 120 项，每项 `{qaId:QA-001~QA-120, ownerTest, providerPath, evidenceKey, result:"pass"}`。`parentMatrixExecutionStatus` 从 `retained_for_dfi53_stage_closure` 迁移至 `executed_at_dfi53_stage_closure`——只有当 120 项全 pass 才迁移，harness `createDfi53ParentExecutionLedger({parentPlan, ownerResults: {..., "dfi5.3.4-lifecycle":"pass", "dfi5.3.4-boundary":"pass"}})` 实现。✅ 符合方案 §3.8 硬性要求「禁止硬编码该状态或把 96 项本批 focused 矩阵冒充父矩阵」。

### 3.3 Historical evidence 不漂移（双重校验）

harness `assertHistoricalEvidence`（[run-dfi5.3.4-harness.mjs:225-235](scripts/run-dfi5.3.4-harness.mjs#L225)）：
1. 运行前先缓存 `sha256(artifacts/{dfi531,dfi532,dfi533}/evidence.json)` 的文件 hash
2. 运行后再次读取并断言 hash 不变（防文件覆盖）
3. 同时断言内层 `evidenceDigest` 字段匹配（防内容修改）

实测 3 个 historical evidence.json 文件 hash 各自稳定（dfi531 `9e69adfc…`、dfi532 `1540343d…`、dfi533 `8269bac2…`），与方案 §1.1 引用的 evidenceDigest 字段一一对应。

### 3.4 Gateway v1alpha3 4 个 canonical digest（方案 §3.4）

harness `gatewayV1Alpha3CanonicalDigests` 实测 4 个文件 digest 与 DFI-5.3.3 实施报告 §2.1 逐字一致：schema `0ba2f3e9…3a21`、compatibility `630505fd…f8bc`、OpenAPI `958d0a2c…aa1`、manifest `9394e4b6…ddab`。证明 v3 Contract 跨批次零漂移。

### 3.5 14 类资源归零（方案 §3.10 G10）

[evidence.json → resourceCounts](artifacts/dfi534/evidence.json) 实测 14 类全部 0：activeCoreChildren / activeCentralChildren / providerFixtureServers / listeningPorts / openSqliteHandles / inFlightInvocationLinkClaims / providerStreams / sseSubscriptions / timersSchedulers / abortControllers / mappingLookupLeases / pendingUsageProjections / lateCallbacks / temporaryFixtureFileHandles。

harness `exactDfi534ResourceCounts` 合并 `processEvidence.resourceCounts` 与 `centralEvidence`（Central-only 字段如 `activeCentralChildren` 取自后者，端口/providerFixtureServers 取二者最大值）——避免 parent 盲信 child，符合方案 §3.10「禁止缺失字段当 0、`?? 0`、硬编码 0 或由 parent 直接相信 child 的声明」。

### 3.6 production boundary 与诚实 outcome（方案 §3.11 G11）

- Core `grep createProviderReasoningMappingRelease` 0 命中（除 domain 定义文件）→ production 无 release 安装
- Central production profile fail-fast 日志在 harness 输出中可见：`required enterprise reasoning dependency is unavailable` / `enterprise reasoning Gateway is not production-ready`
- harness 强校验 `productionGatewayV1Alpha3RouteCount=0` / `productionLocalPersonalMaxReleaseCount=0` / `productionEnterpriseOpenAiMaxReleaseCount=0` / `productionEnterpriseAnthropicMaxReleaseCount=0` / `productionSubmitTurnV1Alpha3Reachable=false` / `desktopMaxUiReady=false` 等全 13 个 readiness flag
- outcome 仅 `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`，无 `PRODUCTION_READY`/`MAX_READY_FOR_ALL_MODELS` 等下游声明

### 3.7 测试真实性反查

- TS 唯一命中 [dfi5.3.4-lifecycle-closure.test.ts:58](services/core/tests/dfi5.3.4-lifecycle-closure.test.ts#L58) `expect(focused).not.toMatch(/\.skip\(|\.only\(|@Disabled|\bsleep\b/)` —— **反断言**（防逃逸），非真逃逸
- Java 无 `@Disabled` / `@Ignore` 标记

---

## 四、发现

### 4.1 P0 = 0

无。harness:dfi5.3.4 19 TS/159 tests + 7 Java/14 tests PASS；evidenceDigest `sha256:bf89b2fd…3a08` 逐字一致；6 crash scenarios + 9 fresh-process replay 真实 PID + SIGKILL + new PID + SQLite reopen；父 120 项 ledger 全部 pass + 状态从 retained 迁移至 executed；96 项 focused QA 连续唯一；80 次负向注入精确检出 + 正常四通道命中 0；14 类资源全归零；3 个 historical evidence digest 不漂移；4 个 v1alpha3 canonical digest 与 DFI-5.3.3 一致。

### 4.2 P1 = 0

无。migration 止 26；lockfile `5b15ae01…874f31` 不变；production v3 route/Local/Enterprise Max release 全 0、SubmitTurn/Desktop UI/CPC/entitlement/TGM/Knowledge/Agent Lifecycle/Desktop Admin v2 readiness 全 false；DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle、Desktop/Admin v2 consumption 继续 GATED；historical evidence 文件只读未覆盖。

### 4.3 P2 = 0

无。实施报告 §4 诚实记录了沙箱环境首次跑 `harness:dfi5.3.4` 时真实 loopback TLS/HTTP fixture 被 `listen EPERM` 阻止，承认是环境限制；改用允许本机回环端口的环境后一次通过，未修改产品逻辑规避门禁。本机复跑 Central online/offline 各 438/438、root check 295/2039 + 3 smoke、historical harness 全 PASS，无环境失败归因到产品代码。

### 4.4 P3 = 0

无。文档复核阶段提出的两个 P3（v3 canonical digest 措辞、DFI-4A.3.1= migration 25 交叉引用）经本轮核实落地正确：① 实施报告 §2.3 明确列出 4 个独立文件 digest 而非单一 v3 digest；② 实施报告 §2.3 明确写「DFI-4A.3.1 repair.2 exact Timeout Fact 继续由 migration 25 提供」——交叉引用已落地。本批无新增非阻断观察项。

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.3.4 完成 closure-only 阶段收口：聚合 Harness 同 run 跑 DFI-5.3.1~5.3.3 历史回归 + DFI-5.3.4 focused + Provider/Timeout/Compaction 等 19 个 TS files 与 7 个 Java classes（含 DFI-5.3.4 专有 `Dfi534EnterpriseLifecycleIntegrationTest`）；6 个真实进程 crash scenarios（Local/Enterprise OpenAI/Enterprise Anthropic × 两个 barrier），每个含真实不同 `crashedPid/recoveredPid/replayPid` 与 `mappingDigest/deadlineAt` 权威字段不变 + terminal replay mapping/upstream/Usage 0；9 次 fresh-process replay 跨 3 provider（同 provider 三轮 semantic digest 一致 = 权威字段稳定 + process noise 已排除）；父 120 项 ledger 全部 pass，状态从 `retained_for_dfi53_stage_closure` 迁移至 `executed_at_dfi53_stage_closure`（按方案 §3.8 G8 硬性要求）；96 项 focused QA 连续唯一；80 次负向注入全检出 + 正常四通道命中 0；14 类资源全归零；3 个 historical evidence digest + 4 个 v1alpha3 canonical digest 全不漂移；production v3 route/Local/Enterprise Max release 全 0、13 个 readiness flag 全 false；outcome 仅 `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`，未宣称 PRODUCTION_READY/MAX_READY。

门禁独立复跑：harness:dfi5.3.4 19 TS/159 + 7 Java/14 PASS + evidenceDigest `sha256:bf89b2fd…3a08` 逐字一致；harness:dfi5.3.3（73 tests）/dfi5.3.2（66 tests）/dfi5.3.1（61 tests）/dfi5.2.3（116 tests）/cpc3（68 tests）历史回归全 PASS 且 evidence 不漂移；Central online/offline 各 438/0/0/0 BUILD SUCCESS；完整 check 295/295 files、2039/2039 tests + 3 smoke + Architecture boundary；lint / audit:dtp4 PASS；migration 止 26、lockfile `5b15ae01…874f31` 不变。

**DFI-5.3.4 可进入用户接受流程**；接受后标记 DFI-5.3.4 PASS/CLOSED 并将 DFI-5.3 父阶段 120 项账本从 `retained` 推进至 `executed_at_dfi53_stage_closure` 完成 DFI-5.3 阶段 Closure。DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 GATED/false，DFI-5.3.1~5.3.3 historical evidence 与 harness 只读不覆盖。

— Claude Code（独立 QA，只读）