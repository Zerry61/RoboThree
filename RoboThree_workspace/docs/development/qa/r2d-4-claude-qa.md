# R2D-4 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-0621-version-0.0.0-r2d.4` |
| 验收对象 | R2D-4：Lifecycle / Cutover / Closure Harness（closure-only，不新增生产能力） |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（`/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin/node`，与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21）/ Docker 29.6.2 |
| 开发版本 | Root / Core `0.0.0-r2d.4`；Contracts 保持 `0.0.0-r2d.3.1`；Desktop/Admin/Central/Document Worker 版本不变 |
| 上游 | R2D-0～R2D-3 PASS/CLOSED；R2D-4 详细方案文档复核 PASS；本批由用户单独授权 |

---

## 一、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21 + Docker）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:r2d4` | **PASS 18 files / 179 tests**；`evidenceDigest=sha256:eb489f799870828afb8b19cc923efde24454c76cd518a1970fac0173a85ca9e0` 与实施报告逐字一致；`outcome=R2D_CORE_DELTA_CONFORMANT`、`crashWindowCount=5`、`semanticReplayCount=3`、`semanticReplayDigest=sha256:7e4b0204a913c65cba9406cf695cce6f953a38553b70358333e88df4de8a0486`、`timeDriftChangesSemanticDigest=true`、`negativeLeakInjectionDetectionCount=80`、`fourChannelLeakageMatchCounts` 四通道全 0、`resourceCounts` 12 类全 0、`productionR2dGateEnabled=false`、`productionCpcActivationEnabled=false`、`productionEnterpriseEntitlementReady=false`、`productionEntitlementImplementationCount=0`、`testIdentityUsed=true`、`agentLifecycleReady=false`、`desktopV2ConsumptionReady=false`、`adminV2ConsumptionReady=false`、`knowledgeProviderReady=false`、`memoryReady=false`、`effectReconciliationReady=false`、`dfi53Unlocked=false` |
| 2 | `env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 283 / 283 files / 1958 / 1958 tests + 3 smoke**（`core.ready` / `foundation-smoke ready fixtureOnly=true` / `preload-smoke ready sandbox=true contractVersion=v1alpha1`）；138.43s |
| 3 | `export PATH=…/v24.13.0/bin:…/openjdk@21/bin:$PATH JAVA_HOME=… CI=true pnpm run check:central` | **PASS 404 / 0 / 0 / 0 / BUILD SUCCESS** |
| 4 | `... CI=true pnpm run check:central:offline` | **PASS 404 / 0 / 0 / 0 / BUILD SUCCESS** |
| 5 | `CI=true pnpm run lint` | **PASS**（eslint + Architecture boundary checks passed） |
| 6 | `CI=true pnpm run audit:dtp4` | **PASS**（DTP-4 packaging audit passed） |
| 7 | `shasum -a 256 pnpm-lock.yaml` | `sha256:c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07` 未变 |
| 8 | 边界 | migration 最大 id=26；Root/Core `0.0.0-r2d.4`、Contracts `0.0.0-r2d.3.1` |

> 注：本轮 Central online/offline 均一次通过，未命中既往 tracing exporter timeout / 端口冲突环境偶发。`harness:r2d4` 内部 `semanticReplayProcessIds` 两次运行分别为 `[28079,28080,28081]`（实施报告）与 `[45991,45992,45993]`（本复跑），但 `semanticReplayDigest` 完全一致——证明三轮 semantic replay 的确定性跨进程、跨运行成立。

---

## 二、重点核查项（对照方案 §5/§6/§7/§8/§9 与 96 项 QA）

### 2.1 真实进程拓扑（G3）

| 核查项 | 结论 |
|---|---|
| 真实 Core child | ✅ [r2d4-process-lifecycle.test.ts:184-196](services/core/tests/r2d4-process-lifecycle.test.ts#L184) `fork(childScript, …)`；child 真实 import 生产 Core（[r2d4-lifecycle-child.mjs:5-28](services/core/tests/fixtures/r2d4-lifecycle-child.mjs#L5) `SubmitTurnCoordinator`/`R2D3DurableAcceptancePlanner`/`SqliteTaskPersistence`/`BuiltInGeneralAgentSource` 等），非 mock 重写 |
| 真实 SIGKILL | ✅ [test:78-80](services/core/tests/r2d4-process-lifecycle.test.ts#L78) `crashed.kill("SIGKILL")` + `expect(await exit).toMatchObject({ signal: "SIGKILL" })` + `observeExitedProcess` 用 `process.kill(pid, 0)` 验证 `ESRCH`（进程真实退出） |
| 新 PID | ✅ [test:83](services/core/tests/r2d4-process-lifecycle.test.ts#L83) `recovered.processId).not.toBe(crashedPid)`；`semanticReplayProcessIds` 3 个不同 PID |
| 原 SQLite 文件 reopen | ✅ [test:63-64](services/core/tests/r2d4-process-lifecycle.test.ts#L63) 同一 `databasePath` 传给 crash 与 recover；child 用真实 `SqliteTaskPersistence({databasePath})` |
| named barrier 不用 sleep | ✅ [child:350-369](services/core/tests/fixtures/r2d4-lifecycle-child.mjs#L350) `barrierFault` 写 barrier 文件 + `Atomics.wait` 阻塞；parent 用 `waitForBarrierFile` 轮询 barrier 文件（非 sleep 猜窗口） |

### 2.2 五个崩溃窗口（A1～A8 代表）

| 窗口 | fault point | 恢复断言 |
|---|---|---|
| `accepted_after_commit` | `submit_turn.accepted.after_commit`（persistence） | 恢复 authority read=0、coordinationStatus=completed、messageCount=1、deliveryCount=1 |
| `message_appended_after_commit` | `submit_turn.message_appended.after_commit` | 同上；不重复 append Message |
| `task_bundle_after_commit` | `submit_turn.coordinator.after_task_bundle`（coordinator） | Task bundle 已 durable，reopen strict reload |
| `task_committed_after_commit` | `submit_turn.task_committed.after_commit` | Provider/Invocation/Loop 仍 0，恢复继续原流程 |
| `completed_after_commit` | `submit_turn.completed.after_commit` | terminal replay，`replayLoopStartDelta=0` |

harness `validateFocusedEvidence`（[run-r2d4-harness.mjs:147-183](scripts/run-r2d4-harness.mjs#L147)）对每个 scenario 断言：`processExitObserved=true`、`crashedPid !== recoveredPid`、`authorityCounts` 全 0、`upstreamCountsBeforeTaskCommit` 全 0、`loopStartedCount=1`、`replayLoopStartDelta=0`。五个窗口覆盖 `R2D4_CRASH_WINDOWS` 全集（[r2d4-evidence.mjs:34-40](scripts/r2d4-evidence.mjs#L34)）。

### 2.3 时间事实进入 digest + 漂移改变 digest

| 核查项 | 结论 |
|---|---|
| 五项权威时间事实 | ✅ [r2d4-evidence.mjs:42-48](scripts/r2d4-evidence.mjs#L42) `R2D4_TIME_FACT_KEYS = acceptedAt/createdAt/lockedAt/observedAt/committedAt`；[child:308-314](services/core/tests/fixtures/r2d4-lifecycle-child.mjs#L308) 从 durable plan 逐字段读取，全部来自 `FakeClock(timeSeed)` |
| 时间事实进入 semantic digest | ✅ [test:216-231](services/core/tests/r2d4-process-lifecycle.test.ts#L216) `semanticDigest` 的 material 含 `timeFacts`；`r2d4SemanticSummary`（[r2d4-evidence.mjs:130-149](scripts/r2d4-evidence.mjs#L130)）同样含 `timeFacts` |
| 三轮同一 seed → 唯一 digest | ✅ [test:137-156](services/core/tests/r2d4-process-lifecycle.test.ts#L137) 3 次 fresh child 用 `fixedTimeSeed`，`new Set(digests).size === 1`；本复跑与实施报告 `semanticReplayDigest` 完全一致 `sha256:7e4b0204…` |
| 漂移 1ms 改变 digest | ✅ [test:158-175](services/core/tests/r2d4-process-lifecycle.test.ts#L158) `driftedTimeSeed` = +1ms → `acceptedPlanDigest` 不同 + `semanticDigest` 不同，`timeDriftChangesSemanticDigest=true` |

### 2.4 十类副作用 / 八类 authority read = 0

| 核查项 | 结论 |
|---|---|
| `task_committed` 前十类副作用 = 0 | ✅ [test:75](services/core/tests/r2d4-process-lifecycle.test.ts#L75) `barrier.upstreamCounts` = `zeroUpstreamCounts()`（credentialResolve/providerResolve/dns/socket/tls/httpBody/invocationLink/usage/agentLoop/compaction 全 0）；[child:374-387](services/core/tests/fixtures/r2d4-lifecycle-child.mjs#L374) `currentUpstreamCounts` 来自真实 diagnostics Set |
| 恢复八类 authority read = 0 | ✅ [test:87](services/core/tests/r2d4-process-lifecycle.test.ts#L87) `recovered.authorityCounts` = `zeroAuthorityCounts()`（exactAgent/subject/registry/workspaceAuthorization/preference/capabilityLocks/entitlement/toolPolicy 全 0）；[child:224-281](services/core/tests/fixtures/r2d4-lifecycle-child.mjs#L224) 每个 authority 方法 `authorityCounts.xxx += 1` 真实计数 |

### 2.5 80 次负向注入 + 四通道零泄漏

| 核查项 | 结论 |
|---|---|
| 80 次 = 4 通道 × 5 canary × 4 编码 | ✅ [r2d4-evidence.mjs:50-65](scripts/r2d4-evidence.mjs#L50) `encodedR2D4Markers` = 5 markers × 4 encodings = 20 encoded values；[proveR2D4LeakScannerNegativeCoverage](scripts/r2d4-evidence.mjs#L90) 20 encoded × 4 channels = 80 次注入，每次 `totalMatchCount===1` 且 `channelMatchCounts[channel]===1` |
| 五类 canary | ✅ `credential` / `workspacePath` / `entitlementOwner` / `resourceAllowlist` / `providerReasoning`（[r2d4-evidence.mjs:11-17](scripts/r2d4-evidence.mjs#L11)） |
| 四通道正常命中 = 0 | ✅ `fourChannelLeakageMatchCounts` = `{stdout:0, stderr:0, evidenceJson:0, failureJson:0}`；harness line117 若非 0 则 `r2d4_sensitive_output_detected` fail |

### 2.6 12 类真实资源归零

✅ `R2D4_RESOURCE_KEYS`（[r2d4-evidence.mjs:19-32](scripts/r2d4-evidence.mjs#L19)）12 类：`activeCoreChildren/openSqliteHandles/preparedInvocationLinks/pendingCoordination/activeCapabilityLocks/activeAgentResolutionLeases/activeEntitlementSnapshotLeases/activeTimeoutSchedulers/activeProviderRequests/activeContextMaterializers/activeCompactionJobs/lateCallbacks`。evidence.json `resourceCounts` 全部 = 0；`exactR2D4ResourceCounts` 强制每项为非负安全整数，`validateR2D4ClosureEvidence` 断言全 0。

### 2.7 production gate 与 boundary

| 核查项 | 结论 |
|---|---|
| 三项 production activation 全 false | ✅ [r2d4-boundary.test.ts:32-36](services/core/tests/r2d4-boundary.test.ts#L32) `R2D3_CORE_DELTA_DEFAULT_ENABLED` / `CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED` / `R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY` 均 false |
| gate code-owned 非 env/CLI/argv | ✅ [boundary:38-48](services/core/tests/r2d4-boundary.test.ts#L38) 断言源码含 `R2D3_CORE_DELTA_DEFAULT_ENABLED = false` + `r2dCoreDeltaEnabled: R2D3_CORE_DELTA_DEFAULT_ENABLED`，且 `not.toMatch(/process.env.*R2D|argv.*R2D/)` |
| production entitlement source count=0 | ✅ [boundary:50-59](services/core/tests/r2d4-boundary.test.ts#L50) 扫 `services/core/src`，`implements TaskResourceEntitlementSource` = 0 |
| v1alpha3/v1alpha4 consumption 不在 Desktop/Admin/Central/Document Worker | ✅ [boundary:61-75](services/core/tests/r2d4-boundary.test.ts#L61) marker 扫描四目录全空 |
| single-dispatch | ✅ [boundary:77-85](services/core/tests/r2d4-boundary.test.ts#L77) `readSchemaVersion` 单次 + v1alpha1/v1alpha2/v1alpha3 顺序 + unsupported + 无 try/catch fallback |
| Desktop defaultModelId 兼容投影 | ✅ [boundary:100-112](services/core/tests/r2d4-boundary.test.ts#L100) `selectionSummaryR2D3` 含 legacy projection 注释 + `defaultModelId: selection.resolvedModelLock.capabilityId` + 无 `agentDefaultModelId` |
| migration 26 + lockfile 冻结 | ✅ [boundary:87-98](services/core/tests/r2d4-boundary.test.ts#L87) migration max=26 + lockfile digest 精确匹配 |

### 2.8 文件边界（closure-only）

✅ R2D-4 仅新增：`scripts/r2d4-evidence.mjs`、`scripts/r2d4-evidence.test.mjs`、`scripts/run-r2d4-harness.mjs`、`services/core/tests/fixtures/r2d4-lifecycle-child.mjs`、`services/core/tests/r2d4-process-lifecycle.test.ts`、`services/core/tests/r2d4-boundary.test.ts`、`artifacts/r2d4/`、两份报告文档 + 治理回链。

**未修改任何 `services/core/src/**` 生产实现、Contracts、migration、Provider、Agent Loop、Desktop、Admin、Central、Document Worker、依赖或 `pnpm-lock.yaml`**（git status 确认：所有 `services/core/src/**` 的 M 均为 R2D-3.3 编码批遗留，R2D-4 本轮零生产代码变更）。Root/Core 版本升级 `0.0.0-r2d.4` 属治理规则允许（仅版本号，无生产实现改动）。

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

无发现。本轮 Central online/offline 一次通过，未命中既往环境偶发；完整 check 无 dcf13c 偶发；harness:r2d4 确定性跨运行成立（semanticReplayDigest 两次一致）。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

R2D-4 完成 R2D 工程线 closure-only 收口：真实 Core child（`fork` 生产 `SubmitTurnCoordinator`/`R2D3DurableAcceptancePlanner`/`SqliteTaskPersistence` 等）+ 真实 SQLite 文件 + 真实 SIGKILL（`kill("SIGKILL")` + ESRCH 验证）+ 新 PID + 原库 reopen，覆盖 accepted/message_appended/task_bundle/task_committed/completed 五个崩溃窗口；三轮 fresh child 用同一 `FakeClock` seed 得到唯一 semantic digest `sha256:7e4b0204…`（本复跑与实施报告逐字一致），acceptedAt/createdAt/lockedAt/observedAt/committedAt 五项权威时间事实全部进入 digest，seed 漂移 1ms 同时改变 accepted-plan digest 与 semantic digest；`task_committed` 前十类上游副作用（credential/provider/dns/socket/tls/httpBody/invocationLink/usage/agentLoop/compaction）全 0，恢复阶段八类 current authority 读取全 0，均来自真实 diagnostics 计数而非硬编码；80 次负向泄漏注入（4 通道 × 5 canary × 4 编码）全部精确检出，四通道正常命中全 0；12 类真实资源终态归零；production CPC/R2D/enterprise entitlement 三项 activation 全 false、production entitlement source count=0、v1alpha3/v1alpha4 consumption 未进入 Desktop/Admin/Central/Document Worker、single-dispatch 无 fallback、Desktop `defaultModelId` 仅作 exact resolved Model 兼容投影且非 authority。

门禁独立复跑：harness:r2d4 18/179 + evidenceDigest 与实施报告逐字一致 + 全部 readiness false；完整 check 283/283 files、1958/1958 tests、3 smoke；Central online/offline 均 404/0/0/0/BUILD SUCCESS；lint / Architecture boundary / audit:dtp4 全 PASS；lockfile `sha256:c47641ac…f815a07` 未变、migration 止 26、Root/Core `0.0.0-r2d.4`、Contracts `0.0.0-r2d.3.1`。本批零生产代码变更，最高输出仅为 `R2D_CORE_DELTA_CONFORMANT`，不含 production-ready 或任何下游 ready 声明。

**R2D-4 可进入用户接受流程；接受后 R2D 工程线 conformance 关闭，但不自动启用 production R2D gate、不自动解锁 DFI-5.3、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect Reconciliation、Agent Lifecycle 或 Desktop/Admin v2 consumption；production CPC activation、production R2D gate、production enterprise entitlement 继续 false。**

— Claude Code（独立 QA，只读）