# MVP-VS3 — 已完成任务继续修改 / 成果修订版垂直闭环实施报告

> 版本：`0.0.0-mvp.vs3`  
> 日期：2026-08-30  
> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 最高开发者结论：`MVP_VS3_COMPLETED_TASK_FOLLOW_UP_E2E_CONFORMANT`

## 1. 交付结果

VS3 已把“已完成任务继续修改”接入普通 Desktop 用户路径：

1. Task 页只在 durable detail 的 `displayStatus === "completed"` 时显示“继续修改”；
2. 点击后通过 Renderer module 内存的一次性 intent 导航到 Workbench，不写 URL、LocalStorage、Main、Preload
   或持久化；
3. Workbench 复用原 Session，但通过既有 SubmitTurn 创建新 Task；旧 Task 不变，也不调用 waiting-only 的
   `continue_task` / `provide_task_input`；
4. 原 Agent/Model 只作为候选，必须在当前 Catalog exact match 且 runnable/available 才预选；Workspace、Skill、
   Knowledge 与附件保持空，由用户显式重新选择；
5. 用户输入新的修改要求后生成 `资料汇报-v2.pptx`，不覆盖 `资料汇报.pptx`；
6. 同一 Session 中两个 Task、两份 PPTX 在 Core 再次 `SIGKILL`、新 runtime identity 与原 SQLite reopen 后仍可
   分别打开和预览。

## 2. 实现范围

### 2.1 Renderer

- 新增严格有界、消费即清空的 `setFollowUpIntent()` / `consumeFollowUpIntent()`；
- Task 页新增 completed-only “继续修改”入口，并安全投影候选 Agent/Model 与上一 PPTX 显示名/相对路径；
- Workbench 同时覆盖首次 mount 与 Vue `KeepAlive` 重新激活，composer 初始保持空；
- 候选消失或不可用时保持空并禁止提交，不回退到第一个可用 Agent/Model；
- Task 列表从“每 Session 只显示最新 Task”修正为“每 Task 一行”，同时继续按 Session 的全部 Task 决定删除权限。

### 2.2 机械上下文证明与真实 E2E

- 在既有 Core enterprise runtime integration test 中提交同 Session 第二个 Task，机械断言后续 Model request 同时
  包含上一轮用户目标、上一轮 Assistant 完成摘要与上一 PPTX 安全相对路径；没有新增 Core 生产逻辑；
- 复用 `scripts/run-mvp-vs2-electron.mjs`，扩展为原始 Task + follow-up Task：受控 Gateway 第 4 轮生成修订版
  PPTX，第 5 轮完成；Gateway 总请求为 5；
- 真实 Electron E2E 验证 Main IPC、Core child、SQLite、Document Worker、HTTP/SSE、sandbox、
  contextIsolation 和 nodeIntegration disabled；不宣称 OS 级输入或原生文件对话框自动化。

## 3. 开发者验证

环境：Node `24.13.0`、pnpm `11.11.0`、Electron `43`。

```text
5 files / 36 tests PASS
  - Renderer focused: 4 files / 32 tests
  - same-Session Core context proof: 1 file / 4 tests

CI=true pnpm run e2e:mvp-vs2
  PASS / MVP_VS3_COMPLETED_TASK_FOLLOW_UP_E2E_CONFORMANT
  distinctTaskCount=2
  followUpSameSession=true
  gatewayRequestCountAfterFollowUp=5
  revisedWriteToolExecutionCount=1
  revisedPptxArtifactCount=1
  originalPreviewReadyAfterRestart=true
  revisedPreviewReadyAfterRestart=true
  postRevisionSigkillObserved=true

CI=true pnpm run typecheck
  PASS

CI=true pnpm run audit:dtp4
  PASS

CI=true pnpm exec vitest run scripts/audit-dtp4-packaging.test.mjs --maxWorkers=1
  1 file / 2 tests PASS

focused ESLint
  0 errors（Vue SFC 按现有 ESLint 配置产生 2 个 ignored warnings）

CI=true pnpm run lint
  ESLint PASS；Architecture boundary 仍仅命中既有并行前端问题：
  apps/desktop/src/renderer/adapters/settings-adapter.ts rootRealPath
  该文件不在 VS3 修改范围，不归因本批，也未放宽边界规则

git diff --check
  PASS
```

## 4. 边界与已知缺口

- 本批没有修改公开 Contract、Core/Main/Preload 生产逻辑、migration、依赖、lockfile 或 Gateway wire；
- Core 开发版本保持 `0.0.0-mvp.vs2.3`，因为只有既有 integration test 增加断言；Root/Desktop 推进至
  `0.0.0-mvp.vs3`；
- intent 只在当前 Renderer 进程内单次生效，刷新或直接打开 Workbench 会回到普通新任务模式；
- 旧成果缺失时只允许普通 follow-up，不宣称基于旧成果修改；
- 受控 Gateway fixture 证明工程闭环，不代表 production ready、真实公网 Provider、签名安装包或 notarization；
- 全仓 lint 仍被既有 `settings-adapter.ts rootRealPath` boundary 阻断；VS3 未修改该文件，focused ESLint、
  typecheck、build、E2E 与 DTP-4 audit 均通过；
- Personal Model、Admin mutation、TGM、Knowledge Provider 与 Agent Lifecycle 继续 GATED。

## 5. QA 状态

独立代码 QA 已完成，结论为 `CODE_QA_PASS`，`P0=0/P1=0/P2=0/P3=0`，详见
[VS3 独立 QA 报告](./qa/vs3-code-claude-qa.md)。用户已正式接受并关闭 VS3，最高 outcome
`MVP_VS3_COMPLETED_TASK_FOLLOW_UP_E2E_CONFORMANT` 已接受。

本次关闭不代表 production ready，也不自动解锁 Personal Model、Admin mutation、TGM、Knowledge Provider 或
Agent Lifecycle；下一条 MVP 产品任务另行确认。
