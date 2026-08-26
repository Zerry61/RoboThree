# DFI-4A.3.3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-22-1449-version-dfi-4a.3.3` |
| 验收对象 | DFI-4A.3.3：Agent Loop / Compaction / Recovery 闭环 |
| 日期 | 2026-08-22 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core/Contracts `0.0.0-dfi.4a.3.3`；Desktop `0.0.0-dfe.6b`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-4A.3.3 Harness（dfi4a33-boundary/durable-personal-provider/process-recovery + arh2.3-durable-loop + 3.2 回归 8 个测试文件） | **PASS 8 files / 46 tests** |
| 2 | `CI=true pnpm run check`（完整） | **PASS 226 files / 1496 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 302/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS BUILD SUCCESS（302 tests）** |

---

## 二、重点核查项（方案 §3-§6 + I1~I5）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 统一 Task-locked Resolver | ✅ [task-locked-model-provider-resolution.ts](services/core/src/application/task-locked-model-provider-resolution.ts) main + initial/rolling compaction 消费同一 resolver，禁止各自复制 personal 判断 |
| 2 | 不建第二套 Loop/Summary/Task lock | ✅ 接入既有 `DurableAgentLoopStarter`，复用 `CompactionExecutionBinding`/`CompactionCoordinator`/`ModelBackedCompactionSummarizer`，不建第二套 |
| 3 | migration 24 durable wrapper | ✅ [durable-local-personal-model-provider.ts](services/core/src/application/durable-local-personal-model-provider.ts) `DurableLocalPersonalModelProvider` 装饰器：raw Provider 只负责传输，wrapper 负责逻辑身份/migration 24/fencing/terminal 原子收敛 |
| 4 | replay-first | ✅ wrapper `link.status === "terminal"` → 直接 replay terminal（99-102 行），不重新 resolve Credential/Provider；`outputStartedAt !== undefined` → `ModelStreamResumeUnavailableError`（106 行） |
| 5 | I1~I5 恢复分类 | ✅ [local-personal-model-invocation-recovery.ts](services/core/src/application/local-personal-model-invocation-recovery.ts) `classify()`：I1 accepted→resume_on_task_owner、I2 dispatching→at_least_once_on_task_owner（`atLeastOnceRiskCount` 明确计数）、I3/I4 output_started→recovery_exhausted、invalid→invalidated；有界 limit 1-200 |
| 6 | I2 at-least-once 诚实 | ✅ `at_least_once_on_task_owner` 分类 + `atLeastOnceRiskCount` 计数，不伪装 exactly-once |
| 7 | Usage unknown 不伪造 0 | ✅ Provider 未返回 Usage 不插 Fact、不生成 Projection、不伪造 0 |
| 8 | messageCommitted 单一事实源 | ✅ 校验 terminal + completed 才记 commit marker，不建第二正文、不重调 Provider |
| 9 | 测试断言真实性 | ✅ 反查无空断言/`it.skip`；process-recovery 用 `it.each(["I1","I2","I3","I4","I5"])` + 真实 `SIGKILL` + 新 PID SQLite reopen + 分类断言（I1 resume=1、I2 atLeastOnce=1、I3/I4 recoveryExhausted=1） |
| 10 | 边界零漂移 | ✅ 本批改动 = `services/core/src/application`（durable-provider/task-locked-resolution/recovery/execution-authority）+ `adapters` + `ports`；未新增 migration 25、未改公共 Desktop Contract/Main/Preload/Renderer/Central/Document Worker；`pnpm-lock.yaml` 保持 Aug 16 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-4A.3.3 正确完成 Agent Loop / Compaction / Recovery 闭环：main 与 initial/rolling compaction 统一使用
Task-locked Provider Resolver；个人模型接入既有 Durable Agent Loop（不建第二套 Loop/Summary/Task lock）；
migration 24 durable wrapper 完成 Usage/状态/fencing/terminal 原子收敛 + replay-first（terminal 后不重新解析
Credential/Provider）；I1~I5 通过真实子进程 SIGKILL + SQLite reopen 验证（I2 明确 at-least-once 并计数风险）；
Provider 未返回 Usage 保持 unknown 不伪造 0；messageCommitted 单一事实源（正文 vs commit marker 分离）。
四项门禁独立串行复跑全绿（Harness 8/46、完整 check 226/1496 + 3 smoke、Central online/offline 302/302）。
边界零漂移：未新增 migration 25、未改公共 Desktop Contract/Main/Preload/Renderer/Central/Document Worker，
`pnpm-lock.yaml` 保持 Aug 16。

**DFI-4A.3.3 可进入用户接受流程；接受后 DFI-4A.3 阶段关闭。DFI-4A.4、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
