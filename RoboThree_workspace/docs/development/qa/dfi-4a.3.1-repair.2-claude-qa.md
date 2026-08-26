# DFI-4A.3.1 repair.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-1115-version-dfi.4a.3.1-repair.2` |
| 验收对象 | DFI-4A.3.1 repair.2：Provider Timeout |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root `0.0.0-dfi.4a.3.1-repair.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:dfi4a3.1-repair.2` | **PASS 8 files / 53 tests** |
| 2 | `CI=true pnpm run check`（root） | **PASS 247 files / 1652 tests + 3 smoke + Architecture boundary**（见 §三 P3-1，报告写 245/1643 已过期） |
| 3 | `CI=true pnpm run check:central` | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 404/0/0/0 / BUILD SUCCESS** |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 四类超时 | ✅ [model-invocation-timeout-policy.ts](services/core/src/application/model-invocation-timeout-policy.ts) connect 30s / first progress 90s / stream idle 300s / overall default 900s；120000~1800000 仅作 validator 边界 |
| 2 | 移除 120s 硬上限 | ✅ [LocalPersonalProviderTimeoutController](services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts) 四 timer 由 Clock/Scheduler 驱动，overall 延迟 = `invocationDeadlineAt - clock.now()`（构造时算剩余），非固定 120s |
| 3 | 重启不重获 15 分钟 | ✅ `createModelInvocationTimeoutMaterial` 用 `invocationStartedAt + selectedOverallTimeoutMs` 得 `policyDeadlineAt`；durable provider 从 `loaded.timeoutFact.invocationDeadlineAt` 构造 controller，恢复沿用 exact deadline |
| 4 | 精确区分 timeout/取消/网络/缺 [DONE] | ✅ `#lockCause` 在 destroy 前锁定；`request.once("error")` → `reject(timeout.terminationCause ?? error)`（timeout 优先于 late ECONNRESET）；`terminationFailure(parent)` 独立映射用户取消；`httpComplete && !done && finishReason undefined` → `stream_terminal_missing` |
| 5 | recognized progress 精确 | ✅ `classifyParsedProgress`：非 null usage、assistant role、空/非空 content、reasoning、tool_calls、finish_reason 续命；`data:{}`/comment/空 data/空白不续命 |
| 6 | migration 25 exact Timeout Fact | ✅ [migrations.ts:1383](services/core/src/adapters/sqlite/migrations.ts#L1383) STRICT 表 + FK + policy revision/digest CHECK + selectedOverall 120000~1800000 + deadline/record digest；LATEST_SCHEMA_VERSION=25，无 26 |
| 7 | 同 policy 三路径共用 | ✅ Agent Loop main / initial+rolling compaction / task-locked personal provider 共用同一 policy；企业 provider 路径未改（mtime Jul 26/Aug 14/15，无本轮改动） |
| 8 | 历史 pending 无 Fact → recovery_exhausted | ✅ [local-personal-model-invocation-recovery.ts](services/core/src/application/local-personal-model-invocation-recovery.ts) 缺 Fact → `local_personal.timeout_fact_legacy_missing` → recovery_exhausted；不补造 deadline |
| 9 | 测试断言真实性 | ✅ 反查无 `.skip`/`.only`；8 test class 覆盖 policy/provider/persistence/migration/durable/recovery/boundary/lock |
| 10 | repair.2 自身边界 | ✅ repair.2 自身改动 = services/core timeout + provider + persistence/recovery + agent loop composition + migration 25 + 对应测试；未改 Desktop/Central/Renderer；企业 provider 未改 |

---

## 三、发现

### repair.2 本批：P0 = 0，P1 = 0，P2 = 0，P3 = 1

#### P3-1：报告 lockfile digest 声明已过期（跨窗口污染，非 repair.2 缺陷）

报告 §3 声称「`pnpm-lock.yaml` digest 保持 `b7c6d0a7…f5ade5`、mtime 保持 2026-08-24 20:26:35」。独立核实：
当前 lockfile digest 为 `c47641ac…5a07`、mtime 2026-08-25 10:55，已变化。根因是**另一并行 PTX 窗口在
repair.2 报告落盘后安装了 `pptxgenjs@4.0.1`**（`services/document-worker/package.json` 现含该依赖、
lockfile 现含 `pptxgenjs@4.0.1`）。repair.2 自身确实未改 lockfile，但报告作为「当前工作区事实」的 digest
声明已不成立。

---

## 四、必须立即报告的跨窗口越界（非 repair.2 缺陷，但阻断继续 QA 收口）

**并行 PTX 窗口在 PTX-1 仍 GATED 的情况下，已实现并注册了 PTX-1 代码与依赖**：

- `services/document-worker/src/pptx/**`：`resource-resolver.ts` / `pptx-adapter.ts` / `pptx-write.ts` /
  `index.ts`（mtime 2026-08-25 11:04）；
- `services/document-worker/src/handlers/document-capability-router.ts` 注册了
  `tool.document.pptx.write`（`PPTX_WRITE_CAPABILITY_ID`）；
- `services/document-worker/tests/pptx/**`：`pptx-resource-resolver.test.ts` / `pptx-write.test.ts`；
- `services/document-worker/package.json` + `pnpm-lock.yaml` 新增 `pptxgenjs@4.0.1`。

这与已冻结门禁直接冲突：PTX-0 仍 `DOCUMENT REVIEW PENDING / CODING GATED`，PTX-1 仍 `GATED`（用户最近
一次授权仅为「PTX-0 docs-only 冻结」，明确「PTX-1 不得在单独授权前开始」）。root check 从报告声称的
245/1643 变为 247/1652（+2 files / +9 tests），正是 PTX 窗口的两个 pptx 测试文件。

按用户既定纪律（「其他窗口发生越界写入时立即停止」），本报告不把这笔污染吸收进 repair.2 结论，也不继续
为其收口；需用户先裁决该 PTX 越界（回退或补授权），再决定 repair.2 的关闭路径。

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING（附跨窗口阻断项）
P0 = 0，P1 = 0，P2 = 0，P3 = 1（P3-1 为报告 digest 声明过期）
```

repair.2 自身实现正确：四类超时（connect 30s / first 90s / idle 300s / overall 900s）由单一
`ModelInvocationTimeoutPolicy v1` + Clock/Scheduler 驱动；移除 120s 硬上限；overall 剩余 = exact durable
deadline - now（重启不重获）；timeout 优先于 late ECONNRESET、用户取消独立映射、缺 [DONE] 精确分类；
migration 25 持久化 exact Timeout Fact（STRICT + FK + 全 digest CHECK，LATEST=25 无 26）；历史 pending 无
Fact → recovery_exhausted；Agent Loop/Compaction/Durable Provider 共用同 policy，企业 provider 未改。门禁
独立复跑全绿（harness 8/53、root check 247/1652 + 3 smoke、Central 404/404）。

**repair.2 本体可进入用户接受流程；但需先裁决 §四 的 PTX 越界（当前工作区 lockfile/document-worker 已含
未授权的 PTX-1 实现与 pptxgenjs 依赖），否则后续任何批次的「边界零漂移」判定都无法以干净基线进行。**

— Claude Code（独立 QA，只读）
