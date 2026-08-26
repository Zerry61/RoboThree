# STRM-2.3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-23-1240-version-strm.2.3` |
| 验收对象 | STRM-2.3：S1～S8 Process Harness 与阶段收口 |
| 日期 | 2026-08-23 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root / Contracts / Desktop `0.0.0-strm.2.3`；Core/Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:strm2.3` | **PASS**：3 files / 14 tests + STRM-2.2 回归；**3 轮 × 19 场景 = 57 fresh process scenarios**；semantic digest 三轮一致 `sha256:568dc469…b107ef`；S1～S8 全窗口；`outcome=STRM2_PRODUCTION_WIRING_CONFORMANT` |
| 2 | `CI=true pnpm run check`（完整） | **PASS 239 files / 1586 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 307/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 307/0/0/0 / BUILD SUCCESS** |

Harness evidence 独立复跑与报告 §3 完全一致：mutation dispatch 6、reveal dispatch 12、durable
reconciliation required 6、reveal no replay 9、四通道敏感命中 0、负向注入 80、14 类资源归零、六项
production/blocker 状态 false。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 两 P3 最小收口 | ✅ `personal_credential_transport_rejected` 已 additive（[protocol.ts](packages/contracts/src/desktop-private/personal-credential-transport-v1/protocol.ts)），`mapBrokerHeader` rejected→`rejected + rejected code`；`sendMutation`/`consumeReveal` 加 `@deprecated`，production 走 authorized 变体 |
| 2 | SharedArrayBuffer 兼容修正 | ✅ [envelope.ts](packages/contracts/src/desktop-private/personal-credential-transport-v1/envelope.ts) 与 preload adapter 改为 `typeof SharedArrayBuffer !== "undefined" && …instanceof`，避免 sandbox Preload 里 global 缺失的 ReferenceError；**不放宽 strict envelope**（存在时仍拒绝 SAB） |
| 3 | 真实进程拓扑 | ✅ Parent `spawn(electron, [fixture], { detached })`；fixture 内真实 `CorePrivateSupervisor` + `fork` Core child（fd3 JSON + fd4/fd5），Core child **不 detach**（继承 Electron 进程组）；sandbox/contextIsolation=true/nodeIntegration=false |
| 4 | 确定性 barrier（禁 sleep/轮询） | ✅ Parent 读 stdout JSON `type:barrier` 后发 decision；重复 barrier 立即 SIGKILL；`barrier_not_observed`/`action_count_mismatch`/`scenario_not_settled` 均 fail-fast；15s timeout 仅进程挂起保护，非窗口猜测 |
| 5 | S1～S8 矩阵 19 场景 | ✅ S1(2)+S2(2)+S3(2)+S4(1)+S5(2)+S6(2)+S7(2)+S8(6)=19；S4 不伪造 reveal 反向窗口；S6/S8_core_restart 真实验证 `runtimeChanged`/`channelChanged`/`coreStartCount>=2` |
| 6 | semantic digest 三轮一致 | ✅ `semanticStrm23Summary` 字段仅 scenario/window/direction/classification/typedErrorCode/barrierReachedCount/brokerDispatchCount/terminalObserved/runtimeChanged/channelChanged + 六项 false，**排除 PID/端口/墙钟/路径/transport nonce**；`sortObject` 规范化 + 三轮 digest 唯一 |
| 7 | 泄漏扫描 80 负向注入 | ✅ 4 channels × 5 markers × 4 编码（raw/Base64/percent/hex）；`assertStrm23LeakageScannerNegativeCoverage` 逐次注入并断言 scanner 检出；`scanStrm23Leakage` totalMatchCount!==0 即失败 |
| 8 | 正常场景资源归零真实 | ✅ fixture evidence（[run-strm23-process-electron.mjs](scripts/run-strm23-process-electron.mjs)）用 `BrowserWindow.getAllWindows()`/`controller.snapshot()`/`adapter.snapshot()`/`broker resourceSnapshot()`/`coreProcesses.size`/`sensitiveStreams` 真实诊断，`Object.values(resourceCounts).some(!==0)` 即抛错 |
| 9 | failure.json allowlist | ✅ `safeFailureEvidence` 字段 allowlist，写盘前经同一 `scanStrm23Leakage`，命中则不写；原子写 tmp→rename；`safeCode` 剥除非白名单字符 |
| 10 | 测试断言真实性 | ✅ 反查无 `.skip`/`.only`/`todo`；14 测试覆盖 rejected/unavailable 分离、deprecated 收口、公共 Contract 边界、SAB guarded、S4 不伪造、barrier identity、14 key、泄漏扫描、semantic digest、failure allowlist |
| 11 | 边界零漂移 | ✅ 改动 = desktop-private Contract（envelope/protocol）+ Main controller + Preload receiver/transport + scripts Harness；未改 Core/Central/Document Worker/Renderer/migration；`pnpm-lock.yaml` 保持 Aug 16；migrations 最大 id 仍 24 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 1，P3 = 1（均不阻断）

#### P2-1：SIGKILL 场景 `resourceCounts` 硬编码为 0，偏离「不得硬编码 0」承诺

[run-strm2.3-harness.mjs:271-280](scripts/run-strm2.3-harness.mjs#L271) 的 `processGroupExitResourceCounts`
对 8 个 `sigkill_electron` 场景（S2/S3/S4/S5/S7 的 SIGKILL 变体）**无条件返回全 0**，丢弃了 barrier 时的
真实资源快照；`killedProcessEvidence` 声明的
`resourceAccountingSources: ["exact_barrier_snapshot", "observed_process_group_exit"]` 中，前者被丢弃、后者
只是 trust（Parent 仅验证 group leader `exit.signal==="SIGKILL"`，未独立验证 Core child 进程句柄收敛）。

- **正确性无问题**：Core child 由 `fork` 启动且不 detach，随 Electron 进程组被 `process.kill(-pid, SIGKILL)`
  连带杀死，进程组死亡后资源确实归零；
- **诚实性有偏差**：方案 §11.3「资源数必须来自真实诊断 Adapter/进程句柄，不得硬编码 0」与报告 §2.3
  「不由最终 JSON 固定填充绕过」在 8/19 场景被字面违反；「14 类资源真实归零」这一核心卖点在该 8 场景
  是「进程组死亡」的 OS 断言，而非逐项资源句柄收敛证据；
- **其余 11 场景（9 正常 + 2 kill_core）资源归零是真实的**（fixture 真实诊断 + 退出前断言）。

建议后续补一个「进程组收敛」证据：SIGKILL 后由 Parent 独立确认 Electron 与 Core child 句柄均退出（而非
仅 trust 进程组信号），或把 `resourceAccountingSources` 修正为诚实表述（去掉「observed_process_group_exit」
的 over-claim）。

#### P3-1：`lateCleanupCount` 恒为 0，evidence 字段未真正填充

fixture evidence 无 `lateCleanupCount` 字段，harness 以 `evidence.lateCleanupCount ?? 0` 兜底，导致全部场景
（含 S8_core_restart）`lateCleanupCount` 恒 0。late callback 只 cleanup 不投影的核心逻辑（`#isCurrentDispatch`
gate + `fill(0)`）已由 STRM-2.2 单元测试覆盖，S8_core_restart 的 runtime/channel 变化也已真实验证，故为
次要证据完整性瑕疵，不阻断。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 1，P3 = 1（均不阻断）
```

STRM-2.3 正确完成 S1～S8 进程级证据与阶段收口：真实 Electron/Main/sandboxed Preload/`CorePrivateSupervisor`/
Core child（fd3 JSON + fd4/fd5）拓扑，确定性 barrier（禁 sleep/轮询/自动重试），S1～S8 共 19 场景 × 3 轮
= 57 次 fresh process，semantic digest 三轮一致（排除 PID/端口/墙钟/路径/nonce）；四通道五类 marker 四种
编码 80 次负向注入全部检出、四通道敏感命中 0；两 P3 最小 private 收口（rejected code + `@deprecated`）；
SharedArrayBuffer guarded 检查不放宽 strict envelope；正常场景 14 类资源真实归零。最终唯一输出
`STRM2_PRODUCTION_WIRING_CONFORMANT`，六项 production/blocker 状态保持 false，未输出
`SENSITIVE_TRANSPORT_READY`、未关闭 transport blocker。门禁独立复跑全绿（harness 57 场景 + check 239/1586
+ 3 smoke + Central online/offline 307/307）。边界零漂移：仅改 desktop-private Contract + Main/Preload +
scripts Harness，未改 Core/Central/Renderer/migration，`pnpm-lock.yaml` 保持 Aug 16。两处证据完整性发现
（P2-1/P3-1）见 §三，均不阻断。

**STRM-2.3 可进入用户接受流程；接受后 STRM-2 阶段整体关闭，但 transport blocker 仍保持打开、不输出
`SENSITIVE_TRANSPORT_READY`。STRM-3、EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
