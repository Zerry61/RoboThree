# STRM-2.3 repair.1 进程退出与资源证据修复报告

> 日期：2026-08-23  
> 版本：`0.0.0-strm.2.3-repair.1`  
> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**

## 1. 修复结论

本批仅修复 STRM-2.3 独立 QA 的两个非生产发现：

- P2-1：8 个 `sigkill_electron` 场景不再无条件把 14 类 `resourceCounts` 填为 0；
- P3-1：`lateCleanupCount` 不再使用 `?? 0` 兜底，必须来自真实 controller snapshot 或 exact barrier。

未修改 production Main/Preload/Core/Contract、个人模型业务逻辑、migration、依赖或 lockfile。独立 QA 已
PASS 并由用户接受，repair.1、STRM-2.3 与 STRM-2 已逐级正式关闭；全部下游继续 `GATED`。

## 2. P2-1 修复：真实进程退出证明

### 2.1 Barrier 事实

每个真实 Electron fixture 在 exact barrier 输出：

- Electron 实际 PID；
- 当前 Core child PID 集合；
- helper PID 集合；
- controller、adapter、Broker client、IPC listener、BrowserWindow、Core child 和 sensitive stream 派生的
  14 类真实资源快照。

PID 只用于 Parent 的进程退出核验，不进入 semantic digest、safe trace 或最终业务事实。

### 2.2 Parent 独立观测

Parent 仍对 detached process group 发出一次 SIGKILL，并先等待 group leader 的真实 `SIGKILL` exit。随后只做
一次 `/bin/ps -axo pid=,pgid=,stat=` OS 进程表快照：

- wrapper process-group leader、Electron、Core child 与 helper 必须全部可定位为 absent 或 OS terminal state；
- macOS `P_WEXIT` 以 `stat` 的 `E` flag 表达“process is trying to exit”，属于内核终止事实；
- 任一 tracked process 或同组成员仍为 active，场景立即失败
  `strm23_process_group_exit_not_observed`；
- 不延长轮询、不使用 sleep 猜测、不自动重试失败场景。

终态资源由 exact barrier snapshot 与 OS active owner count 派生；不再存在无条件 `[key, 0]` 映射。
Evidence 同时保留 non-sensitive `processExitObservation` 计数和
`os_process_table_snapshot` / `tracked_process_identity_match` 来源标签。

## 3. P3-1 修复：真实 late cleanup 计数

- graceful 场景从 cleanup 后的 `controller.snapshot().lateCallbackCount` 读取；
- SIGKILL 场景从 exact barrier 的 `controller.snapshot().lateCallbackCount` 读取；
- Parent 强制该字段为非负整数，缺失即失败 `strm23_late_cleanup_evidence_missing`；
- semantic summary 现在包含 `lateCleanupCount`，三轮 replay 会检测其漂移；
- 本轮正式 Harness 聚合值为 0，这是实际 snapshot 结果，不是默认兜底。

## 4. 测试与失败诚实性

新增 focused 断言：任一 SIGKILL 场景缺少 OS process exit evidence，完整矩阵必须失败。

实施过程中两次正式 Harness 均按原规则 fail-fast 并保留 failure evidence：

1. 首次发现 pnpm Electron launcher 的 process-group leader 与 Electron 实际 PID 并非同一进程；修复为分别
   锁定 wrapper group leader 与 Electron PID；
2. 第二次发现 macOS 在 SIGKILL 后会短暂显示 `P_WEXIT` / `E`，证明“正在退出”而非 active；修复为按
   macOS 官方 process state 语义分类。

两次都没有自动重试或扩大等待时间。修复后从零重新执行正式 Harness。

## 5. 正式 Evidence

`CI=true pnpm run harness:strm2.3`：

- focused：3 files / 15 tests；
- STRM-2.2 regression：PASS；
- S1～S8：3 rounds × 19 = 57 fresh process scenarios；
- semantic digest：`sha256:52dfd032170278d63a0878c809417bd75784d9ef03eeffb75e7a82de55b69a0f`；
- mutation dispatch 6、reveal dispatch 12；
- durable reconciliation required 6、reveal no replay 9；
- `lateCleanupCount=0`，来自真实 snapshot；
- 四通道敏感命中 0、80 次 scanner 负向注入全部检出；
- 14 类资源全部为 0；8 个 SIGKILL 场景同时具备 exact barrier snapshot 与 OS process exit evidence；
- outcome：`STRM2_PRODUCTION_WIRING_CONFORMANT`。

## 6. 串行门禁

环境：Node 24.13.0、JDK 21.0.12、Docker；全部严格串行执行。

| 门禁 | 结果 |
| --- | --- |
| `harness:strm2.3` | PASS：3 files / 15 tests；57 fresh process scenarios |
| `check` | PASS：239 files / 1587 tests + 3 smoke |
| Central online | PASS：307/0/0/0 / BUILD SUCCESS |
| Central offline | PASS：307/0/0/0 / BUILD SUCCESS |

## 7. 用户接受与当前门禁

- 独立 QA：`PASS（P0=0 / P1=0 / P2=0 / P3=0）`；用户已正式接受；
- `0.0.0-strm.2.3-repair.1`、STRM-2.3、STRM-2：依次正式 `PASS/CLOSED`；
- `SENSITIVE_TRANSPORT_READY` 仍未输出，transport blocker 仍打开；
- STRM-3、EIPC-1～EIPC-3、DFI-4A.4.1～DFI-4A.4.3、DFI-2B、DFI-3、TGM 继续 `GATED`。
