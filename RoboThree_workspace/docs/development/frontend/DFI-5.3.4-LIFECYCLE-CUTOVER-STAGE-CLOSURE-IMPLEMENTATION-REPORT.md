# DFI-5.3.4 Lifecycle / Cutover / Stage Closure 实施报告

> 日期：2026-08-27  
> 开发版本：Root/Core `0.0.0-dfi.5.3.4`；Contracts package 版本不变  
> 状态：**PASS/CLOSED**  
> 最高输出：`DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`

## 1. 实施结论

DFI-5.3.4 已完成 closure-only 收口：没有增加任何 Provider mapping 能力，而是把 DFI-5.3.1～5.3.3 已关闭的
Local Personal、Enterprise OpenAI-compatible 与 Enterprise Anthropic-compatible 三条链纳入同一套可崩溃、
可恢复、可重复执行的阶段 Harness。

聚合证据实际执行父方案 120 项 item-level ledger，并保留 96 项 focused closure matrix；DFI-5.3.1～5.3.3
historical Evidence 文件与摘要在运行前后逐字节不变。当前仍没有 production Max release，production SubmitTurn
v1alpha3、Gateway v1alpha3 route 与 Desktop Max UI 继续不可达/0。

## 2. 关键实现

### 2.1 真实进程生命周期

- Local 子拓扑使用真实 Core child、真实 SQLite 文件、真实 loopback Provider fixture、`SIGKILL`、新 PID 与原库
  reopen；覆盖 `reasoning_mapping_validated`、`invocation_link_committed` 两个确定性窗口；
- Enterprise 子拓扑使用独立 Java child、Gateway 与 Provider loopback HTTP server，真实解析 Gateway v1alpha3
  fixture 并调用 OpenAI/Anthropic production projector；进程被强制终止后以新 PID 读取原 evidence/state；
- 三个 Provider path 共形成 6 个 crash scenarios；terminal replay 的 mapping load、upstream 与 Usage 增量均为 0；
- 每个 Provider path 执行三轮 fresh process replay，共 9 次 path run，semantic digest 排除 PID/port/path 等
  process noise，但保留 exact mapping、deadline、body mode 与 Usage 权威事实。

### 2.2 阶段账本与历史证据

- 父方案 120 项逐条记录 `qaId`、`ownerTest`、`providerPath`、`evidenceKey` 与 `result`，状态从
  `retained_for_dfi53_stage_closure` 推进为 `executed_at_dfi53_stage_closure`；
- 96 项 focused QA 从方案正文解析并校验连续、唯一、无缺项；
- 聚合 Harness 同时执行 DFI-5.3.1～5.3.3 focused 回归、Local Provider TLS/SSE、Usage、timeout、durable
  personal provider、DFI-5.2.3 reasoning lifecycle 与 Compaction 回归；
- 三个 historical Evidence digest 保持：
  - DFI-5.3.1 `sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841`；
  - DFI-5.3.2 `sha256:d8fcaa832b0aa689d6d939e143fc56e3cf3180b28f77f50c4f14e5e020ef60fb`；
  - DFI-5.3.3 `sha256:b8ede54d8d22e0458ab80cd7fe059c2c97a105c2101c9cb47622fea48ed9d826`。

### 2.3 Cutover、Contract 与边界

- Gateway v1alpha3 四个 canonical file digest 分别锁定为 schema `0ba2f3e9…3a21`、compatibility
  `630505fd…f8bc`、OpenAPI `958d0a2c…aa1`、manifest `9394e4b6…ddab`；
- v1/v2/v3 保持 single dispatch，未知或损坏版本不得 fallback；
- production Gateway v1alpha3 route count、Local/Enterprise Max release count 均为 0；
- production CPC activation、enterprise entitlement、TGM、Knowledge Provider、Agent Lifecycle 与
  Desktop/Admin v2 consumption readiness 均为 false；
- migration 仍止 26；DFI-4A.3.1 repair.2 exact Timeout Fact 继续由 migration 25 提供；
- `pnpm-lock.yaml` 未改变，digest 仍为
  `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

### 2.4 泄漏与资源收敛

- 5 个 canary × 4 种编码 × 4 个通道共 80 次负向注入，每次均精确检出；正常 stdout、stderr、Evidence、
  failure 四通道命中数为 0；
- 14 类资源计数来自真实 child diagnostics，严格要求存在且为非负安全整数；最终全部归零，不使用硬编码 0、
  `?? 0` 或父进程盲信子进程；
- Evidence 不含 Credential、Endpoint、raw mapping、reasoning private output 或用户 Secret。

## 3. 修改边界

本批只新增/修改测试、真实进程 fixture、Harness、Evidence、package-local 版本与治理文档：

- `scripts/dfi5.3.4-evidence.mjs`、`scripts/run-dfi5.3.4-harness.mjs` 及测试；
- `services/core/tests/dfi5.3.4-*.test.ts` 与 lifecycle child；
- Central `Dfi534EnterpriseLifecycle*` test-only classes；
- `artifacts/dfi534/evidence.json`、本实施报告及状态回链；
- Root/Core package version 与 packaging audit 的 expected version。

未修改生产 Provider、Contract、Desktop、Admin、migration、依赖或 lockfile；没有安装 production release，也没有
开放 production route。

## 4. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `pnpm run harness:dfi5.3.4` | PASS，19 TS files / 159 tests + 7 Java classes / 14 tests；6 crash scenarios、9 replay path runs、120/96 QA、80 次负向、14 类资源归零；Evidence `sha256:bf89b2fda81f2b11cac63ca0ad58f1962bd309b587b48b0e1e19ba2c493c3a08` |
| `pnpm run harness:dfi5.2.3` | PASS，11 files / 116 tests |
| `pnpm run harness:cpc3` | PASS，9 files / 68 tests；System Message / Context Receipt 权限层级零漂移 |
| `pnpm run check` | PASS，295 files / 2039 tests + 3 smoke + Architecture boundary |
| `pnpm run check:central` | PASS，438/0/0/0 |
| `pnpm run check:central:offline` | PASS，438/0/0/0 |
| `pnpm run lint` / `pnpm run audit:dtp4` | PASS |
| `CI=true pnpm install --frozen-lockfile --offline` | PASS |

最终 DFI-5.3.4 Evidence 已写入 `artifacts/dfi534/evidence.json`，digest 为
`sha256:bf89b2fda81f2b11cac63ca0ad58f1962bd309b587b48b0e1e19ba2c493c3a08`。

聚合 Harness 首次在受限沙箱内运行时，真实 loopback TLS/HTTP fixture 被 `listen EPERM` 阻止；该失败属于执行
环境限制。改用项目规定的 Node 24.13.0、JDK 21 与允许本机回环端口的环境后，19/19 TS files、159/159 tests
与 7/7 Java classes、14/14 tests 一次通过，未修改产品逻辑规避环境门禁。

## 5. 当前状态与下一步

Claude Code 已完成独立 QA：19 TS files / 159 tests + 7 Java classes / 14 tests、历史 Harness、root check、
Central online/offline、lint 与 audit 全部通过，P0～P3 全 0；用户已正式接受。DFI-5.3.4 与 DFI-5.3 父阶段
现已 `PASS/CLOSED`，父方案 120 项账本正式确认为 `executed_at_dfi53_stage_closure`。

本次关闭只确认 `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`，不代表 production ready。DFI-5.3.1～5.3.3
historical Evidence/Harness 继续只读；DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin
v2 consumption 继续 GATED。
