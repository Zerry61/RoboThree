# DFI-5.4.3 Renderer Max UI / Safe Preview / Real Desktop E2E / Stage Closure 实施报告

> 状态：**INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-28  
> 版本：`0.0.0-dfi.5.4.3`  
> 方案：[DFI-5.4.3 详细实施方案](./DFI-5.4.3-RENDERER-MAX-UI-REAL-DESKTOP-E2E-STAGE-CLOSURE-DEVELOPMENT-PLAN.md)  
> 聚焦上游：[DFI-5.4.3A Local Personal Production Graph](./DFI-5.4.3A-LOCAL-PERSONAL-PRODUCTION-GRAPH-IMPLEMENTATION-REPORT.md)

## 1. 实施结果

本批已把已关闭的 Max Core、Local Personal exact release 与 Desktop v1alpha5 安全 API 接成用户可见闭环：

- Workbench 通过单一 Renderer Adapter 协商 v1alpha5 Compatibility，读取 Safe Preview 和 durable Preference；
- 页面提供 Default / Max 单一开关，保存失败、冲突、结果不确定时保留用户草稿，并只允许显式确认；
- Submit response loss 复用同一 command identity 查询，不自动创建第二个 Task；
- Task 页面通过独立 `task-reasoning/v1alpha1` read model 显示 final Receipt 的 `Max` / fallback 安全摘要；
- Local Desktop owner authority、Personal Model exact subject、PRA admitted policy、release-pinned mapping 和
  DFI541 durable handler 已接入普通 Desktop production composition；
- public Contract、Task Receipt、日志和 UI 均不暴露 Provider raw mapping、reasoning private output 或 Secret。

## 2. 实施中关闭的集成缺口

真实 E2E 暴露并关闭了六个跨层问题：

1. Main 的 Renderer client identity 与 Core transport identity 分层，避免把窗口身份错误传给 Core；
2. R2D acceptance 使用 code-owned Platform Prompt revision，不再把 Agent revision 当作 Platform revision；
3. SQLite Task bundle 可读取 DFI541 envelope 内的 exact binding，并在原库 reopen 后恢复；
4. v1alpha4 Runtime Selection 不再被 legacy authorization snapshot 误判为损坏；
5. SubmitTurn recovery 可识别 DFI541 coordination envelope；
6. Desktop Task projection 和 Task Reasoning projection 同时支持 readable v1alpha4 与 persisted v1alpha5 Receipt，
   且 safe public projection 显式排除 digest、terminal error 和内部时间字段。

## 3. 真实 Desktop E2E

`scripts/run-dfi5.4.3-electron.mjs` 使用以下真实拓扑：

```text
Electron Main
  -> sandboxed Preload / contextIsolation / nodeIntegration=false
  -> Main IPC routers
  -> real Core child / private HTTP
  -> real SQLite
  -> isolated macOS Keychain helper
  -> controlled TLS/SSE OpenAI-compatible Provider
  -> actual Renderer Task DOM
```

三轮 fresh Electron 均完成：Safe Preview 为 supported、Preference 保存为 Max、Provider body 精确出现
`reasoning_effort=xhigh`、Core 在 named barrier 后被真实 `SIGKILL`、Supervisor 启动新 PID 并 reopen 原 SQLite、
Renderer 重开 Task 后仍显示“推理模式 / Max”。三轮 semantic digest 唯一，进程身份不同。

## 4. Closure Evidence

`artifacts/dfi543/evidence.json`：

- outcome：`DFI5_MAX_REASONING_MODE_CONFORMANT`；
- focused QA：120 项；父方案 QA：108 项，状态为 `executed_at_dfi54_stage_closure`；
- focused tests：9 files / 52 tests；
- semantic replay：3，unique digest：1；真实 SIGKILL：3；
- 80 次负向泄漏注入全部检出，正常 response/log/evidence/failure 四通道命中 0；
- Electron/Core/TLS server/listening port/BrowserWindow/webContents/IPC handler/Keychain/temp directory 计数归零；
- DFI-5.4.1、5.4.2、5.3.4、R2D-P.3、PRA-3、R2D-4 historical Evidence 同时校验内层 digest 与文件 hash；
- evidence digest：`sha256:8293bf35a3f7d5b1f03c0e5f9b633f1e0abb2d2afe5932b4a51022e049fe36b0`。

## 5. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `harness:dfi5.4.3` | PASS，9 files / 52 tests + 3 real Electron replays |
| 完整 `pnpm run check` | PASS，324 files / 2169 tests + 3 smoke |
| Central online / offline | PASS，438 / 438 |
| lint / typecheck / `audit:dtp4` | PASS |
| frozen offline install | PASS |
| migration | 仍止 26 |
| lockfile | `sha256:5b15ae01…874f31`，未变 |

首次完整 check 在 workspace sandbox 内因 loopback `listen EPERM`、Keychain 权限产生环境失败；其中发现的版本
baseline 与测试桩缺口已修复。随后使用同一 Node 24.13.0 在允许 loopback/Keychain 的本机环境复跑，324/2169
及三项 smoke 全部通过。没有用自动 retry 掩盖产品失败。

## 6. 诚实边界

本报告只说明实现完成并通过开发者门禁。独立 QA 与用户接受前，DFI-5.4.3、DFI-5.4 和 DFI-5 均不得标记
`PASS/CLOSED`。`DFI5_MAX_REASONING_MODE_CONFORMANT` 只覆盖首个受控 Local Personal OpenAI-compatible exact
subject；Enterprise Gateway production route、Enterprise Max release、DeepSeek、TGM、Knowledge Provider、
Agent Lifecycle、DFI-4A.4 public CRUD 与 Admin v2 继续 `GATED/false`。
