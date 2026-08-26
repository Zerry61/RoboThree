# STRM-2.3 repair.1 — Claude Code 独立 QA 报告（修复验证）

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-23-1340-version-strm.2.3-repair.1` |
| 验收对象 | STRM-2.3 repair.1：SIGKILL 资源证据与 late cleanup 计数修复 |
| 日期 | 2026-08-23 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root `0.0.0-strm.2.3-repair.1`；Contracts/Desktop 保持 `0.0.0-strm.2.3`；其他不变 |
| 上游报告 | [strm-2.3-claude-qa.md](./strm-2.3-claude-qa.md)（P2-1 / P3-1 两个发现） |

---

## 一、修复验证（逐项核对原发现）

### P2-1（SIGKILL 场景 `resourceCounts` 硬编码 0）→ 已修复 ✅

| 检查 | 结论 |
|---|---|
| OS 进程表真实验证 | ✅ [run-strm2.3-harness.mjs:319-377](scripts/run-strm2.3-harness.mjs#L319) `observeKilledProcessGroup` 用 `/bin/ps -axo pid=,pgid=,stat=` 单次快照，锁定 groupLeader + Electron + Core child + helper 的 tracked PIDs 与同组 pgid；`activeTrackedProcessCount`/`activeGroupMemberCount` 任一非 0 即抛 `strm23_process_group_exit_not_observed` |
| macOS `P_WEXIT` 分类 | ✅ `terminal` 判定含 `stat` 的 `E` flag（trying to exit）与 `Z`（zombie），非 Linux 的简单 `/^[ZX]/` |
| 不再无条件填 0 | ✅ `processGroupExitResourceCounts`（284-299 行）先验证 `processGroupExitObserved && activeGroupMemberCount===0 && activeTrackedProcessCount===0` 才 `Math.min(barrier, 0)`；`resourceCountsAtBarrier`（260 行）保留 barrier 真实非零快照 |
| 来源标签诚实 | ✅ `resourceAccountingSources` 现为 `exact_barrier_snapshot` / `os_process_table_snapshot` / `tracked_process_identity_match` 三个真实来源 |
| 不延长轮询/不重试 | ✅ 单次快照，无 sleep 猜测、无自动 retry；两次实施期失败均 fail-fast 并留 evidence |

### P3-1（`lateCleanupCount` 恒 0、`?? 0` 兜底）→ 已修复 ✅

| 检查 | 结论 |
|---|---|
| 真实 snapshot 来源 | ✅ fixture barrier（[run-strm23-process-electron.mjs:353](scripts/run-strm23-process-electron.mjs#L353)）输出 `lateCleanupCount: controllerSnapshot.lateCallbackCount`；graceful evidence（450 行）输出 `controllerResources.lateCallbackCount` |
| 删除 `?? 0` 兜底 | ✅ harness 以 `validateLateCleanupEvidence` + `exactNonnegativeInteger` 强制非负整数，缺失抛 `strm23_late_cleanup_evidence_missing` |
| 进入 semantic summary | ✅ [strm23-evidence.mjs:161](scripts/strm23-evidence.mjs#L161) `semanticStrm23Summary` 含 `lateCleanupCount`，三轮 replay 会检测其漂移 |

### 关键不变量保持 ✅

- `processExitObservation`（含 PID/进程计数）**未进入** `semanticStrm23Summary`，semantic seed 仍排除 PID/端口/墙钟/路径/nonce；digest 变化（`568dc469…` → `52dfd032…`）仅源于 summary 新增 `lateCleanupCount` 语义字段，符合预期。

---

## 二、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:strm2.3` | **PASS**：3 files / 15 tests + STRM-2.2 回归；3×19=57 场景；digest `sha256:52dfd032…b69a0f` 三轮一致；`lateCleanupCount=0`（真实 snapshot）；四通道敏感 0、负向注入 80、14 类资源归零；`STRM2_PRODUCTION_WIRING_CONFORMANT` |
| 2 | `CI=true pnpm run check`（完整） | **PASS 239 files / 1587 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 307/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 307/0/0/0 / BUILD SUCCESS** |

---

## 三、边界零漂移

- 改动 = `scripts/run-strm2.3-harness.mjs` + `run-strm23-process-electron.mjs` + `strm23-evidence.mjs` +
  `strm23-evidence.test.mjs`（仅 Harness/Evidence/tests）；
- 未改 production Main/Preload/Core/Contract、migration、Central、Document Worker、依赖；`pnpm-lock.yaml`
  保持 Aug 16；migrations 最大 id 仍 24。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

原 P2-1（SIGKILL 场景 `resourceCounts` 硬编码 0）已修复为「exact barrier 真实快照 + OS 进程表单次快照
验证进程组无 active owner 后才派生终态资源」，并诚实标注三个真实来源；原 P3-1（`lateCleanupCount ?? 0`
兜底）已修复为「真实 controller snapshot + 非负整数强校验 + 进入 semantic digest」。`processExitObservation`
未进入 semantic seed，digest 变化仅因 summary 新增 `lateCleanupCount` 语义字段。门禁独立复跑全绿（harness
57 场景新 digest 三轮一致、check 239/1587 + 3 smoke、Central online/offline 307/307），边界零漂移（仅改
scripts/Harness/tests，未改生产代码，`pnpm-lock.yaml` 保持 Aug 16）。

**repair.1 可进入用户接受流程；接受后 STRM-2.3 与 STRM-2 阶段方可关闭，但 transport blocker 仍保持打开、
不输出 `SENSITIVE_TRANSPORT_READY`。STRM-3、EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
