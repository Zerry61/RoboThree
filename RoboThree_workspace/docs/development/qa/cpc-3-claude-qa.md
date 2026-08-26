# CPC-3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-26-1230-version-0.0.0-cpc.3` |
| 验收对象 | CPC-3：Lifecycle / Eval Closure（50-round Tool、C1～C6 SIGKILL/reopen、三轮 semantic replay、12 类冲突语料、80 次泄漏扫描、资源归零、诚实 Eval 输出） |
| 日期 | 2026-08-26 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core `0.0.0-cpc.3`；Contracts `0.0.0-dfi.5.2.3` 未变 |
| 上游 | CPC-0 Rev 1.1、CPC-1、CPC-2 均 `PASS/CLOSED`；本批 production activation 保持 disabled |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true VITEST_MAX_WORKERS=1 pnpm run harness:cpc3` | **PASS 9 files / 68 tests**；evidence.json 与报告逐字段一致 |
| 2 | `CI=true pnpm run check`（`env -u ELECTRON_RUN_AS_NODE`） | **PASS 266 files / 1794 tests + 3 smoke + lint + Architecture boundary**（唯一失败为 dcf13c 稳定性偶发，单独复跑 PASS） |
| 3 | `CI=true pnpm run check:central`（JDK 21 + Docker） | **PASS 404 / 0 / 0 / 0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline`（JDK 21 + Docker） | **PASS 404 / 0 / 0 / 0 / BUILD SUCCESS** |
| 5 | `CI=true pnpm run audit:dtp4` | **PASS** |
| 6 | `CI=true pnpm install --frozen-lockfile --offline` | **PASS**（Already up to date） |
| 7 | 边界 | lockfile `c47641ac…` 未变；migration 仍止 26；contracts 版本未变；core `0.0.0-cpc.3` |

> 注：完整 `check` 的 `smoke:preload` 在会话 shell 带 `ELECTRON_RUN_AS_NODE=1` 时报 `app.whenReady undefined`（既知环境伪象），
> `env -u` 复跑全绿。dcf13c 稳定性 harness 在完整套件并行下偶发 `snapshot.final_convergence_failed`，单独复跑 PASS——
> 与既往多批一致，非本批缺陷。

---

## 二、重点核查项（对照 CPC-3 方案 + 实施报告声称）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | **50-round / 51 requests / 单一 System** | ✅ [cpc3-lifecycle-eval.test.ts](services/core/tests/cpc3-lifecycle-eval.test.ts)：`maxModelRounds:51 / maxToolCalls:50`，断言 `rounds:51`、`observedSystemCounts`=51 个 1（每请求恰一条 System）、`model.requests.length===51` |
| 2 | **真实进程 C1～C6** | ✅ [cpc3-process-lifecycle.test.ts](services/core/tests/cpc3-process-lifecycle.test.ts)：真实 `fork` child + 真实 SQLite 文件，6 个命名 barrier 后 SIGKILL，断言 exit signal=SIGKILL + OS `process.kill(pid,0)→ESRCH`，新 PID 在同一 SQLite reopen，`providerResolveCount=0/upstreamRequestCount=0/testIdentityUsed=true/productionCpcActivationEnabled=false` |
| 3 | **三轮 semantic replay** | ✅ 3 轮 fresh process/SQLite，digest 一致、3 个不同 PID；digest 排除 PID/端口/路径/墙钟（evidence `semanticReplayDigest: sha256:2ff25089…` 与报告一致） |
| 4 | **泄漏扫描器非恒真** | ✅ `scanCpc3Leakage` 是真空检测；`proveCpc3LeakScannerNegativeCoverage` 把 5 marker × 4 编码注入 4 通道，断言每个都**恰好检出 1 次**——返回 80，证明扫描器不是恒 0 的 no-op；最终四通道命中全 0 |
| 5 | **12 类冲突语料** | ✅ `CPC3_CONFLICT_CORPUS` revision `cpc3.normative-corpus.v1`、12 cases；`report.conflictCorpusCaseCount=12` |
| 6 | **Compaction summary data-only** | ✅ 断言 summary 为 data segment、不提升 System/Developer；`systemCounts` 全 1 |
| 7 | **资源归零真实来源** | ✅ `resourceCounts` 来自 child `diagnostics` Set 真实跟踪 + OS process observation；harness `exactChildTerminalResources` 对每个 key 要求 `Number.isSafeInteger` 且取 max，非硬编码/`?? 0`；`activeCoreChildren` 来自真实存活 child 计数 |
| 8 | **诚实 Eval 输出** | ✅ 无获批 profile → `observationalModelEvalOutcome: MODEL_BEHAVIOR_EVAL_NOT_RUN_APPROVED_PROFILE_MISSING`；六项 false + `dfi53Unlocked=false` 全在 evidence |
| 9 | **production 零修改** | ✅ **services/core/src 生产文件 0 处改动**（09:00 后 0，08:30~09:00 也 0）——本批纯 test/harness/evidence/governance，连方案允许的最小诊断接缝都未动；cpc3-boundary.test.ts 通过读取源码断言 production 用 `materializeValidated`、无 `deriveTaskInstructionBindingV1(` 消费者、safe summary 9 code 穷尽且无 default |
| 10 | **边界** | ✅ contracts/desktop/admin 0 处改动；migration 止 26；production activation disabled；Skill resolver 0 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 1，P3 = 0

**P2 — process-lifecycle fixture 的 `submitTurnBundleDigest` 推导与 production 不一致，导致 evidence 的 binding/semantic digest 非 production 等值**

- **位置**：[cpc3-lifecycle-child.mjs:203-215](services/core/tests/fixtures/cpc3-lifecycle-child.mjs#L203) `materialize()` 传
  `submitTurnBundleDigest: sha256CanonicalJson(JsonValueSchema.parse(bundle.binding))`。
- **production 对照**：[durable-agent-loop-starter.ts:253](services/core/src/application/durable-agent-loop-starter.ts#L253) 传
  `submitTurnBundleDigest: bundle.binding.bundleDigest`。
- **为什么不同**：`TaskSubmitTurnBinding`（contracts v1alpha1.ts:95-103）含 `bundleDigest` 字段。`bundle.binding.bundleDigest`
  = `sha256CanonicalJson(提交 bundle 的 normalized material)`（submit-turn-bundle-validation.ts:131）；而 fixture 的
  `sha256CanonicalJson(bundle.binding)` 是对**含 bundleDigest 字段本身的 binding 信封**取哈希——两者必然不同。
- **影响**：CPC-3 evidence 里 `taskInstructionBindingDigest` / `semanticReplayDigest`（`sha256:2ff25089…`）是在**测试专属 digest domain**
  下计算的，不是 production 对同一 durable Task 会算出的值。生命周期/崩溃/重放的**自洽性证明成立**（fixture 内部一致复用），
  但「exact binding digest」作为 production 可复现工件不成立——若用 production 路径重算同一 Task，会得到不同 digest。
- **建议修复（一行）**：fixture `materialize()` 改用 `submitTurnBundleDigest: bundle.binding.bundleDigest`，使 evidence digest 与
  production 路径一致；重跑 harness 确认 semanticReplayDigest 更新。

> 注：cpc3-lifecycle-eval.test.ts（unit 层，无真实 persistence）用 `digest("7")` 合成值属于正常 unit 写法，不受此 P2 影响；
> 问题仅在走真实 persistence 的 process-lifecycle fixture。

---

## 四、结论

```text
INDEPENDENT_QA_PASS_WITH_P2 — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 1，P3 = 0
```

CPC-3 完成 Lifecycle / Eval Closure：50-round Tool + 51 次主请求复用同一 exact bundle（每次恰一条 System）；C1～C6 真实 Core child
SIGKILL + 同 SQLite 新 PID reopen + OS ESRCH 观察；三轮 fresh process semantic replay digest 一致且排除 process noise；12 类
冲突语料验证低权威文本不能改写 Core 事实；泄漏扫描器经 80 次负向注入自证非恒真、四通道最终命中 0；12 类资源来自真实
diagnostic/OS 观察归零；无获批 profile 时诚实输出 `MODEL_BEHAVIOR_EVAL_NOT_RUN_APPROVED_PROFILE_MISSING` 并附六项 false。

门禁独立复跑全绿（harness:cpc3 9/68、完整 check 266/1794 + 3 smoke + lint、Central online/offline 404/404、audit、frozen）。
**本批 production 生产文件零修改**，纯 test/harness/evidence/governance——最干净的收口形式。边界零漂移：lockfile 未变、
migration 止 26、contracts 未变、production activation disabled。

唯一 P2：process-lifecycle fixture 用 `sha256CanonicalJson(bundle.binding)` 而非 production 的 `bundle.binding.bundleDigest`，
使 evidence 的 binding/semantic digest 非 production 等值。修复为一行，重跑 harness 后即可闭环。不影响生命周期自洽性证明，
但建议在标记 `PASS/CLOSED` 前修正，以保证 evidence digest 可被 production 复现。

**CPC-3 修复 P2 后即可进入用户接受流程；接受后 CPC 全线正式关闭，但 production activation 仍保持 disabled，不自动解锁
DFI-5.3 子批、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect Reconciliation、Desktop/Admin。**

— Claude Code（独立 QA，只读）

---

## 附录：repair.1 独立 re-QA（2026-08-26，`-retest-1`）

### P2 修复验证

| 项 | 结果 |
|---|---|
| fixture 修复点 | ✅ [cpc3-lifecycle-child.mjs:213](services/core/tests/fixtures/cpc3-lifecycle-child.mjs#L213) 现用 `submitTurnBundleDigest: bundle.binding.bundleDigest`，与 production [durable-agent-loop-starter.ts:253](services/core/src/application/durable-agent-loop-starter.ts#L253) **逐字一致** |
| digest 确实入计算路径 | ✅ semanticReplayDigest 由修复前 `sha256:2ff25089…` 变为修复后 `sha256:e654fb70cc8a6e730003b64736ee03530f49148e5d92c0fe3e4670f9443ac168`，证明该值进入 digest 域且已切换为 production 等值 |
| evidence 与报告一致 | ✅ `artifacts/cpc3/evidence.json` 的 `semanticReplayDigest`/`status:PASS`/`outcome:CPC_CORE_PROMPT_MVP_CONFORMANT`/`negativeLeakInjectionDetectionCount:80`/四通道命中 0，均与实施报告一致 |
| 生产文件零修改 | ✅ services/core/src、packages/contracts/src、apps 在 repair 时段（12:30 后）0 处 `.ts` 改动，仅 fixture `.mjs` 变更 |

### 门禁独立复跑（`-retest-1`）

| 门禁 | 结果 |
|---|---|
| `harness:cpc3` | **PASS 9 files / 68 tests** |
| 完整 `check`（`env -u ELECTRON_RUN_AS_NODE`） | **PASS 266 files / 1794 tests + 3 smoke + lint + Architecture boundary**（本轮 dcf13c 无偶发） |
| 边界 | lockfile `c47641ac…` 未变、migration 仍止 26、Core 仍 `0.0.0-cpc.3` |

### re-QA 结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING（repair.1）
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

P2 已最小闭环：fixture 与 production 的 `submitTurnBundleDigest` 推导逐字一致，evidence 的 binding/semantic digest
现为 production 可复现值；生产代码、Contracts、Desktop/Admin、Central、migration、依赖零改动。CPC-3 repair.1 可进入
用户接受流程；接受后逐层关闭 repair.1、CPC-3、CPC 全线，production activation 保持 disabled，全部下游继续 GATED。

— Claude Code（独立 QA，只读）

