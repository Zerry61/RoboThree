# DFI-4A.3.1 repair.2 Provider Timeout 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-25  
> 开发版本：`0.0.0-dfi.4a.3.1-repair.2`  
> 依据：`DFI-4A.3 Provider Timeout Repair Revision 1.1`

## 1. 交付结果

- 新增唯一的 `ModelInvocationTimeoutPolicy v1`：connect 30 秒、first progress 90 秒、stream idle
  300 秒、overall 默认 900 秒；本批无外部配置入口，120～1800 秒只作为 validator 边界；
- Local Personal OpenAI-compatible Provider 不再使用 120 秒 hard max，四类 timer 由同一
  `Clock` / `Scheduler` 和 exact durable deadline 驱动；overall 的初始剩余时间固定为
  `invocationDeadlineAt - clock.now()`，重试或重启不得重新获得 15 分钟；
- recognized progress 明确覆盖 assistant role、空/非空 content、reasoning、Tool Call、finish reason、
  valid non-null Usage 与 `[DONE]`；纯 `usage:null`、`data:{}`、comment、空 data 和空白不续命；
- timeout cause 在销毁 request/response 前锁定，connect/first/idle/overall deadline 不再被 late
  `ECONNRESET` 误投影为 `network_failure`；用户取消仍独立映射；
- 正常完整 HTTP EOF 且缺 `[DONE]` 固定为 `personal_model.stream_terminal_missing`，异常 reset 保持
  network 路径；本批不放宽 MiniMax Provider Profile；
- migration 25 additive 新增 `local_personal_invocation_timeout_facts`，Invocation Link 与 Timeout Fact
  同一 SQLite transaction prepare；record/index/digest、policy revision/digest、authority id 和 exact
  deadline 任一漂移均失败关闭；历史 terminal 可读，历史 pending 无 Timeout Fact 转
  `recovery_exhausted`，不补造 deadline；
- Agent Loop main、initial compaction、rolling compaction 与 Task-locked personal Provider 共用同一
  policy/material；企业 Provider 路径保持原行为。

## 2. 代码边界

本批只修改 Root/Core 版本与专项脚本入口、`services/core/**` 的 timeout policy、Personal Provider、
Invocation persistence/recovery、Agent Loop/Resolver composition、migration 25 和对应测试。

未修改 Desktop Main/Preload/Renderer、Admin Console、Central 生产代码、Document Worker、公共 Desktop
Contract、Credential/Keychain、Provider Profile、MiniMax terminal 规则、Max/DFI-5、依赖或 lockfile。
migration 1～24 未改写。

## 3. 开发者验证

- Node `24.13.0`；JDK 21；
- `CI=true pnpm run harness:dfi4a3.1-repair.2`：PASS，8 files / 53 tests；
- `CI=true pnpm run check`（非沙箱）：PASS，245 files / 1643 tests + Core/Desktop/Preload 3 smoke；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central`：PASS，404 tests；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central:offline`：PASS，404 tests；
- `CI=true pnpm install --frozen-lockfile --offline`：PASS；
- lint 与 Architecture boundary checks：PASS；
- `pnpm-lock.yaml` digest 保持
  `b7c6d0a7906001ef503a3c0365663153265aa601103779eeacbd10d1a7f5ade5`，mtime 保持
  `2026-08-24 20:26:35`。

沙箱内首次完整门禁因 loopback `listen EPERM` 与隔离 Keychain 权限产生环境失败；同一门禁在非沙箱
从零复跑全部通过，未将环境限制归为产品缺陷。

## 4. 当前状态

独立 QA 结论为 `PASS`（P0=0、P1=0、P2=0、P3=1），其中 P3 仅为
`ELECTRON_RUN_AS_NODE` 环境限制，清除后门禁通过，不阻断关闭。用户已正式接受该结论，repair.2 现为
`PASS/CLOSED`。DFI-4A.3 的历史 `PASS/CLOSED` 不改写；本次关闭不解锁 DFI-4A.4、DFI-5/Max、
MiniMax Provider Profile、TGM 或 Knowledge Provider。
