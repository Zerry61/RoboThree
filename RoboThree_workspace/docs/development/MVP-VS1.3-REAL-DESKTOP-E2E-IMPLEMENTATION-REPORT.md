# MVP-VS1.3 Real Desktop E2E 实施报告

> 日期：2026-08-29  
> 开发版本：`0.0.0-mvp.vs1.3`  
> 状态：`PASS/CLOSED — USER ACCEPTED 2026-08-29`

## 1. 交付目标

本批只关闭 MVP-VERTICAL-SLICE-1 的真实 Desktop 用户路径：普通 Electron Main 启动真实 Core 子进程，Renderer
在工作台选择 `agent.presentation`、`model.internal-trial` 与显式
`skill.presentation-planning`，模型发起 `tool.document.pptx.write`，任务页显示 Assistant 回复、Tool 活动与 PPTX
成果；Core 被真实 `SIGKILL` 后使用同一 SQLite 恢复相同任务和成果。

本批没有新增 Contract、migration、依赖、Admin、Personal Model、TGM、Knowledge Provider 或 Agent Lifecycle。

## 2. 实现

### 2.1 normal Electron Main 到 Core 的 internal-trial lease

此前 Core direct integration 已通过，但普通 Electron Main 创建 Core 子进程时会替换 child environment，导致
deployment 与预签 Token 丢失。`CorePrivateSupervisor` 现在只捕获以下两个精确变量：

- `ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT`；
- `ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN`。

捕获后立即从 Main `process.env` 删除。deployment 与 Token 只保存在 privileged Main 私有对象中，用于首次 Core
启动及同一 Main 进程内的自动 Core 重启；不进入 Renderer、Preload API、IPC、SQLite、日志、Artifact 或公开
Contract。只提供一项配置时仍由 Core typed fail-closed，不建立 fallback。

### 2.2 真实 Electron 联合 E2E

新增 `scripts/run-mvp-vs1-electron.mjs` 与根命令 `pnpm run e2e:mvp-vs1`。测试使用：

1. 真实 Electron Main、sandboxed production Preload 与实际 Renderer build；
2. 真实 Main IPC router、Core child、SQLite 与 Document Worker；
3. 受控 loopback Enterprise Gateway HTTP/SSE protocol fixture；
4. 工作台真实 DOM 操作选择 Workspace、专项 Agent、Model 与 Skill，并点击“提交任务”；
5. 第一轮模型响应发出 PPTX Tool Call，第二轮响应写入“PPTX 已真实生成”；
6. 任务页真实 DOM 验证 Assistant Message、`项目汇报.pptx`、`1 个成果` 与“工具调用”；
7. 对 Core child 执行真实 `SIGKILL`，等待新 runtime identity，再从原 SQLite 重载同一任务页；
8. 重启后再次验证相同回复、成果和 Tool 活动。

该路径诚实记录 `userConfirmationRequired=false`：当前 exact 内置 PPTX Tool policy 在本次任务中没有产生用户确认，
因此 E2E 不伪造“已点击允许”的证据。

### 2.3 Electron launch-environment repair

独立联合 QA 首次复跑发现 Electron API 不可见。聚焦复现证明根因不是 Electron 43 的 ESM API：QA shell 残留的
`ELECTRON_RUN_AS_NODE=1` 会让 Electron binary 以普通 Node 运行，此时 `electron` 当然不提供 `app` 或
`BrowserWindow`。强制设置该变量可以稳定复现 QA 的两种报错；删除该变量后，同一 Electron 43.2.0、内置
Node 24.18.0 上 E2E、Preload smoke 与产品 Main 均可运行。

当前三个 Electron 启动命令因此显式使用 `env -u ELECTRON_RUN_AS_NODE`：

- 根 `e2e:mvp-vs1`；
- Desktop `start`；
- Desktop `smoke:preload`。

三个当前 ESM 入口同时保留更清晰的 Electron named imports：

- `apps/desktop/src/main/index.ts`；
- `apps/desktop/src/main/preload-smoke.ts`；
- `scripts/run-mvp-vs1-electron.mjs`。

历史 Electron Harness 保持只读。修复后即使调用方 shell 预设 `ELECTRON_RUN_AS_NODE=1`，正式 package commands
也会清理污染后再启动真实 Electron；不新增 Contract、migration、依赖或 lockfile 变化。

## 3. 运行证据

### 3.1 Real Electron E2E

最终输出：

```text
status=PASS
outcome=MVP_VERTICAL_SLICE_1_E2E_CONFORMANT
realElectronMain=true
realRendererWorkbench=true
realRendererTaskDetail=true
realMainIpc=true
realCoreChild=true
realSqliteReopen=true
realGatewayHttpSse=true
internalTrialEnvironmentConsumed=true
rendererSensitiveEnvironmentAbsent=true
presentationAgentSelected=true
presentationSkillSelected=true
modelSelected=true
gatewayInvocationRoundCount=2
pptxArtifactFilePresent=true
pptxArtifactSize=45540
assistantReplyVisible=true
artifactVisible=true
toolActivityVisible=true
restartAssistantReplyVisible=true
restartArtifactVisible=true
restartToolActivityVisible=true
sigkillObserved=true
sandbox=true
contextIsolation=true
nodeIntegrationDisabled=true
```

### 3.2 Developer gates

- Developer focused 基线：`8 files / 72 tests PASS`；独立联合 QA 按实际 Vitest `it()` 口径为
  `10 files / 60 tests PASS`；
- `pnpm run build`：PASS；
- `pnpm run typecheck`：PASS；
- DTP-4 audit 与 audit self-test：PASS（2/2）；
- 本批文件定向 ESLint：PASS；
- Electron launch-environment repair 后 `pnpm run e2e:mvp-vs1`：PASS；
- production Preload smoke：PASS，`sandbox=true`；
- `pnpm run lint`：仍只被既有并行前端
  `apps/desktop/src/renderer/adapters/settings-adapter.ts rootRealPath` boundary 阻塞，不归因本批；
- Central online：JDK 21，`438 / 0 / 0 / 0 / BUILD SUCCESS`；
- Central offline：JDK 21，`438 / 0 / 0 / 0 / BUILD SUCCESS`；首次在受限沙箱内执行因本机端口监听被拒绝而失败，
  切换到正常测试权限后一次通过，归类为执行环境限制而非产品回归；
- migration 仍止 26；lockfile digest 仍为
  `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

本批不修改 Central 代码或配置。

## 4. 当前结论与边界

VS1.1～VS1.3 的联合实现、独立联合 QA、Electron launch-environment 最终聚焦 re-QA 与用户接受均已完成。
VS1.2、VS1.3 与 MVP-VS1 工程 conformance 正式 `PASS/CLOSED`，当前关闭结论为
`MVP_VERTICAL_SLICE_1_E2E_CONFORMANT`。

由于联合 E2E 使用受控 Gateway HTTP/SSE fixture，`MVP_VERTICAL_SLICE_1_USABLE` 与后天演示环境就绪仍需实际
Central + 真实模型冒烟、三轮演示彩排和演示版本冻结。

受控 E2E 验证的是实际 Enterprise Gateway HTTP/SSE contract，不冒充 production SSO/RBAC、真实公网 Provider 或
production enterprise entitlement。Admin、Personal Model、TGM、Knowledge Provider、Agent Lifecycle 与其他下游
继续 `DEFERRED/GATED`。
