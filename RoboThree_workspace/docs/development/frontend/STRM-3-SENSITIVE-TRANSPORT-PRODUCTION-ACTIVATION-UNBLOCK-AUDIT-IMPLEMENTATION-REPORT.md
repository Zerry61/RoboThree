# STRM-3 Sensitive Transport Production Activation / Unblock Audit 实施报告

> 版本：`0.0.0-strm.3`  
> 日期：2026-08-29  
> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 上游计划：[STRM-3 详细方案](./STRM-3-SENSITIVE-TRANSPORT-PRODUCTION-ACTIVATION-UNBLOCK-AUDIT-DEVELOPMENT-PLAN.md)

## 1. 本批结论

STRM-3 已把既有 Electron MessagePort sensitive transport 从历史 production-disabled wiring 推进为 normal
Main/Preload/Core graph 中可验证的 transport foundation。当前最高只声明：

```text
STRM3_SENSITIVE_TRANSPORT_PRODUCTION_CONFORMANT
SENSITIVE_TRANSPORT_READY
```

这只关闭 transport blocker，不表示 Personal Model 功能、Credential Helper、CRUD、Reveal、Renderer UI 或企业
身份 ready。

## 2. 已实现内容

### 2.1 单一 Activation Authority

- 新增 code-owned `strm3-sensitive-transport-activation.v1` strict descriptor；
- revision 使用独立 digest domain，Main 与 Preload 读取同一冻结 authority，Renderer/env/argv/localStorage 不参与；
- Core 在 trusted boot IPC 中独立重算并校验 exact descriptor；缺失保持 unavailable，未知或漂移值启动失败关闭；
- `zeroCopyClaimed=false`、`structuredCloneInternalCopiesReliablyClearable=false`，不把 structured clone 说成
  zero-copy。

### 2.2 Normal Production Graph

- normal Main/Preload 启用 internal transport foundation，并把 content-free descriptor 传入 Core child；
- Main controller、Preload receiver 与 Core Compatibility 分层输出 transport ready，但始终保持 product feature、
  business handler、Helper、mutation 与 reveal unavailable；
- Core Personal Model read Compatibility 只从可信 boot descriptor 得出 transport readiness；
- production Broker handler 仍固定返回 `credential_store_unavailable`，未接入测试 Broker 或成功 Fixture；
- Personal Model Core routes、Main IPC 与 Preload public methods 仍为 3/3/3，mutation/reveal 方法数均为 0。

### 2.3 Lifecycle / Cutover / Evidence

- 三轮真实 Electron normal graph 均启动 sandboxed Preload、真实 Core child 与 fd4/fd5 sensitive streams；
- 每轮在 named barrier 后真实 `SIGKILL` Core，观察 OS 退出、新 PID/runtime identity 与恢复后重新协商；
- 复用 STRM-2.3 controlled bytes-path fixture，三轮 mutation + 三轮 reveal 均走真实 MessagePort 生命周期；
- 80 次负向泄漏注入全部检出，正常 stdout/stderr/evidence/safe trace 四通道命中均为 0；
- 16 类资源计数来自真实进程、窗口、controller/adapter/Broker/stream diagnostics，最终全部归零；
- DFI-4A.4 父 QA-061～080 已逐项由具体测试或运行证据标记 `executed_by_strm3`，其余 100 项继续保留至
  DFI-4A.4.3 阶段收口。

## 3. 诚实边界

| 状态 | 结果 |
| --- | --- |
| sensitive transport | `true / SENSITIVE_TRANSPORT_READY` |
| production Personal Model feature | `false` |
| production Broker business handler | `false` |
| production signed Helper asset | `false` |
| Personal Model CRUD | `false / GATED` |
| Credential Reveal | `false / GATED` |
| Renderer Personal Model UI | `false / GATED` |
| Enterprise identity / Admin v2 / TGM / Knowledge / Agent Lifecycle | `false / GATED` |
| migration | 仍止 26 |
| lockfile | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`，未变 |

历史 STRM-2.3 不存在 `artifacts/strm2.3/evidence.json`。本批没有虚构或补写该文件，历史依据继续使用既有报告、
repair 报告与 Harness。DFI-4A.4.1 Evidence 与其他历史 Harness/Evidence 均未改写。

## 4. 验证结果

环境：Node `v24.13.0`、pnpm `11.11.0`、JDK `21.0.12`。

| 门禁 | 结果 |
| --- | --- |
| `harness:strm3` | PASS，5 files / 25 tests + 3 normal Electron + 6 controlled process scenarios |
| real Electron / Core lifecycle | PASS，3 次真实 SIGKILL、3 次新 Core identity、3 次恢复后重新协商 |
| DFI-4A.4 parent QA-061～080 ledger | 20/20 PASS；剩余 100 retained |
| negative leakage injection | 80/80 检出；正常四通道 0 命中 |
| final resource accounting | 16/16 类为 0 |
| typecheck / focused ESLint / `audit:dtp4` | PASS |
| full TypeScript/Vitest | 328/330 files、2195/2197 tests PASS；仅两个历史版本时点断言预期旧版本 |
| full Architecture boundary / root check | 被并行 Renderer `settings-adapter.ts rootRealPath` 既有边界命中阻断；本批未修改该文件 |
| Central online / offline | PASS，438/0/0/0 / 438/0/0/0，均 `BUILD SUCCESS` |

两个历史版本断言位于 DFI-5.4.2 / DFI-5.4.3A boundary tests；产品行为测试与 STRM-3 Harness 均通过。本批按既定
治理不改写历史时点 Harness/Evidence，也不把它们冒充当前状态门禁。

Evidence：[artifacts/strm3/evidence.json](../../../artifacts/strm3/evidence.json)

- evidence digest：`sha256:f1a42004058f14ae3e1178dd2243d95a379874a62a11d4392784066bcff90722`
- semantic evidence digest：`sha256:e64ed15d8bed7738c84e87d15292212f900eb04a466ef6c4bcb5c6e8a9e52cd8`
- authority drift digest：`sha256:2f08b9b396f4b8384ca983f090c7f8bddcf213b3c95e259fcd6e4756312d152c`

## 5. 版本与文件边界

- 编码前 Desktop 的实际冻结版本已由并行前端批合法推进至 `0.0.0-dfe.run.1.repair.1`；STRM-3 没有回退该批，
  而是在其上推进 Root/Core/Desktop 为 `0.0.0-strm.3`；
- Contracts 保持 `0.0.0-dfi.4a.4.1`，Admin 保持 `0.0.0-afe.6c`；
- 未新增依赖、migration、公共 sensitive API、Renderer consumer 或 Helper binary；
- 生产改动仅限 activation authority、Main/Preload transport wiring、trusted Core boot validation 与 read
  Compatibility projection；测试/Harness/Evidence 与治理文档为本批证明材料。

## 6. 用户接受与下一道门

独立代码 QA 结论 `PASS（P0=0 / P1=0 / P2=0 / P3=0）` 已由用户接受，STRM-3 正式 `PASS/CLOSED`。
`harness:dfi4a4.1` 与 `harness:dfi5.4.3` 的非 PASS 属历史时点断言被后续合法演进打破，历史 Harness/Evidence
保持只读，不建立 repair 批次；并行前端 `settings-adapter.ts rootRealPath` 不归因 STRM-3。

本次关闭只确认 transport blocker 已关闭；production Helper、Broker business handler、CRUD、Reveal、Renderer
Personal Model UI 仍为 false/GATED。DFI-4A.4.2 已进入 docs-only 详细方案评审，尚未获得编码授权；4A.4.3 与
其他下游继续 `GATED`。
