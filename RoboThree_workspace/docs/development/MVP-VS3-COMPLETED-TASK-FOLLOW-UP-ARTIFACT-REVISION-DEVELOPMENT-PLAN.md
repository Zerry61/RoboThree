# MVP-VS3 — 已完成任务继续修改 / 成果修订版垂直闭环实施方案

> 状态：**REVISION 1 / PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-30  
> 上游：MVP-VS1、MVP-VS2 `PASS/CLOSED`  
> 产品目标：用户从已完成 Task 继续提出修改要求，在同一会话中生成可预览的新版本成果  
> 预计投入：1～2 个集中工程日

## 0. 决策摘要

VS3 只补 MVP 基线中“多轮对话和连续修改同一成果”的首个真实用户闭环，不建设新底座：

```text
打开已完成 Task
→ 点击“继续修改”
→ 进入同一 Session 的新一轮输入
→ 用户确认当前 Agent / Model，并显式选择需要的 Workspace / Skill
→ 复用既有 SubmitTurn 创建一个新 Task
→ Model 使用同一会话的既有业务上下文
→ 生成不覆盖旧文件的 PPTX 修订版
→ 新旧 Task 与两份成果均可查看和预览
→ 应用重启后仍保持关联
```

本批必须诚实区分：

- 已完成 Task 保持 immutable，不调用 `continue_task` 或 `provide_task_input`；
- follow-up 是**同一 Session 的新 SubmitTurn / 新 Task**，不是恢复旧 Task、追加旧 Run 或复用旧 Task revision；
- 不静默继承 Renderer 当前状态；Task summary 已有 Agent/Model 可作为候选，但必须经当前 Catalog 重新验证；
- Task detail 尚无完整 Skill/Workspace safe selection projection，因此首批由用户显式重新选择，不新增 Contract 只为自动回填；
- 修订版使用新文件名，不覆盖旧 PPTX，不让历史 Artifact 因源文件漂移而失效。

最高输出只允许：

```text
MVP_VS3_COMPLETED_TASK_FOLLOW_UP_E2E_CONFORMANT
```

不代表 production ready，也不自动解锁 Personal Model、Admin mutation、TGM、Knowledge Provider 或 Agent Lifecycle。

### 0.1 Revision 1 控制性澄清

Revision 1 直接吸收独立文档复核的 2 项 P2 与 2 项 P3，不改变产品范围：

1. “已完成”只从 `selectedDetail.value?.summary.displayStatus === "completed"` 判定，不读取展示文案、列表缓存或
   Artifact 状态；
2. 不建立“上下文足够”的新业务状态。编码 Step 1 只做机械证明：follow-up Model request 必须含上一轮用户目标、
   上一轮 Assistant 完成摘要，以及上一轮 PPTX Tool Result 中已有的安全成果标识/工作区相对路径；任一缺失即停手；
3. navigation intent 固定为 Renderer module 内存 one-shot handoff：`setFollowUpIntent()` 写入严格有界对象，
   `consumeFollowUpIntent()` 在任何异步 Catalog/Session 加载前读取并立即清空；不进入 URL、history state、
   LocalStorage、Main、Preload 或持久化；
4. Workbench 不自动预填 follow-up 正文。页面只展示上一成果上下文提示与明确 placeholder，由用户亲自输入修改要求。

## 1. 已确认代码事实

1. `SubmitTurnCommandV1Alpha5` 已接受 `sessionId`；`SubmitTurnCoordinator` 会在同一 Session 内为每次新 turn
   创建新的 Task、User Message 与 Runtime Selection；
2. Workbench adapter 在 `sessionId` 非空时复用既有 `openSession()`，无需新建会话 API；
3. `TaskSummaryProjection` 已安全提供 `sessionId`、`resolvedAgentId`、`resolvedModelId`；
4. `TaskDetailProjection.artifacts` 已提供安全 `displayName`、`relativePath`、media type 与 preview state；
5. `continue_task` 只允许等待 `external_dependency` 的 Task；`provide_task_input` 只允许等待 `user_input` 的 Task；
   completed Task 调用二者会 fail-closed；
6. Workbench 已有 Agent/Model/Skill/Workspace 选择、附件选择、v1alpha5 SubmitTurn 与不确定提交恢复；
7. VS2 已证明同一真实 Electron 中 DOCX read → PPTX write → Task/Artifact → restart → preview 链成立；
8. 当前没有被证明需要新的 Contract、Core state、Main IPC、Preload method 或 migration。

## 2. 范围

### 2.1 允许修改

- Task 页已完成状态的“继续修改”入口及 pure presentation；
- Workbench 通过 Renderer module 内存 `setFollowUpIntent()` / `consumeFollowUpIntent()` 接收一次性安全 intent：
  `sessionId`、`originTaskId`、候选 Agent/Model ID、
  上一成果安全显示名/相对路径；
- Workbench 对候选 Agent/Model 做当前 Catalog exact validation：存在且 runnable/available 才预选，否则保持空并提示用户；
- 用户显式重新选择 Workspace/Skill/Knowledge；不得从 LocalStorage、全局变量或旧 Renderer state 静默恢复；
- follow-up 用户输入的业务提示与新 revision 文件名约束；
- Renderer focused tests；
- 在现有 VS2 Electron fixture/driver 上增加同 Session 第二个用户 turn 与修订版成果验收；
- 实施报告与治理记录。

### 2.2 明确禁止

- 不修改公开 Contract、Core/Main/Preload production API、migration、依赖或 lockfile；
- 不把 completed Task 改回 running/waiting，不向旧 Run 追加 Step；
- 不把 `continue_task`、`provide_task_input` 重新解释为多轮会话；
- 不新增 Task/Conversation/Artifact 状态机或 revision store；
- 不自动继承旧 Skill/Workspace/Knowledge authority；
- 不覆盖旧 PPTX，不把旧 Artifact 改指向新文件；
- 不新增 PPTX read/patch Tool、通用文件版本平台或 Artifact lineage 平台；
- 不修改 Agent/Skill/Tool/Gateway 执行语义；
- 不新增 Evidence schema、阶段账本、泄漏矩阵或历史 Harness repair；
- Personal Model、Admin mutation、TGM、Knowledge Provider、Agent Lifecycle 继续 GATED。

## 3. G1 — 同一 Session、新 Task

Task 页仅在 `selectedDetail.value?.summary.displayStatus === "completed"` 且 Session 未删除时显示“继续修改”。
不得从 `selectedDetailView.status.label`、“已完成”文案、Task list cache 或 Artifact preview state 推断。点击后调用
`setFollowUpIntent()` 再导航到 Workbench。Workbench 在任何异步 Catalog/Session 加载前调用
`consumeFollowUpIntent()`，该函数先清空 module 内存值再返回严格有界 intent。提交时必须：

1. 使用原 Task 的 `sessionId`；
2. 生成新的 `clientTurnId`、commandId 和 Task；
3. 不调用旧 Task control API；
4. 候选 Agent/Model 仅在当前 Catalog exact match 且可用时预选；
5. Workspace、Skill、Knowledge 默认为空，由用户显式选择；
6. 页面明确提示“将在同一对话中创建新一轮，上一任务和成果不会被修改”。

导航 intent 不进入 URL、history state、LocalStorage、Main、Preload 或任意持久化。刷新、重复消费或直接打开
Workbench 时必须得到 `undefined` 并回到普通新任务模式。

## 4. G2 — 修订版成果语义

首批只支持 PPTX 修订版，并满足：

- 页面显示上一成果的安全显示名/工作区相对路径作为只读上下文提示，但 composer 保持空，不自动生成或预填用户正文；
- 明确要求生成新文件，例如 `项目汇报-v2.pptx`，禁止覆盖上一文件；
- Step 1 必须从受控 Gateway request 机械断言同 Session context 同时含：上一轮用户目标、上一轮 Assistant 完成摘要、
  上一轮 PPTX Tool Result 中已经存在的安全成果标识/工作区相对路径；本批不新增 `contextSufficient` 状态或语义分类器；
- 新 Task 的 PPTX write Tool 只执行一次并生成唯一新 Artifact；
- 旧 Task、旧 Artifact、旧 preview 仍可读取；
- 新 Task/Artifact 与原 Session 关联，重启后两个 Task 均可见；
- 上述三项任一缺失立即停手，不向 Core 临时补上下文、不复制 Tool 私有 payload，也不以 Model 最终碰巧生成成功
  代替上下文证明。

## 5. G3 — 前端状态与错误体验

- 原 Agent/Model 当前仍可用：预选并显示“沿用上一轮候选”；
- 原 Agent 消失或不可运行：保持 Agent/Model 为空，禁止提交，不静默换成第一个可运行 Agent；
- 原 Model 不可用：清空 Model，禁止提交；
- Workspace/Skill 未选择：以现有 Workbench 规则提示，不伪造继承；
- 原成果 missing/blocked：允许普通 follow-up，但不得宣称“基于上一成果修改”，页面提示用户重新说明目标；
- SubmitTurn uncertain：复用现有 commandId recovery，不重复提交；
- 新 Task 失败：旧 Task/Artifact 不受影响。
- follow-up composer 初始值必须为空；上下文提示和 placeholder 不进入 durable user message，只有用户实际输入被提交。

## 6. 真实 Electron E2E

复用现有 VS2 production Main/Preload/Renderer、真实 Core child、SQLite、Document Worker 与受控 Gateway HTTP/SSE：

1. 完成 VS2 DOCX → PPTX 原始 Task；
2. 在 Task 页点击“继续修改”；
3. 验证进入同一 Session，候选 Agent/Model 按当前 Catalog exact validation；
4. 用户显式选择 Workspace 与 presentation Skill；
5. 验证 composer 未预填；用户通过现有 app-level driver 输入“将第 3 页改为风险与下一步，并生成修订版，不覆盖原文件”；
6. 新 SubmitTurn 创建第二个 Task；
7. Gateway 收到同 Session 的 prior business context，返回一次 PPTX write Tool Call；
8. 生成 `项目汇报-v2.pptx`，旧 `项目汇报.pptx` 保持存在；
9. 两个 Task、两份 Artifact 均可打开 HTML preview；
10. SIGKILL Core 后从原 SQLite reopen，再次验证同一 Session、两个 Task、两份成果和 preview。

该 E2E 不使用公网 Provider、不进行 OS 级鼠标键盘自动化，也不宣称签名安装包或 production ready。

## 7. Focused QA（20 项）

1. QA-001：仅 `selectedDetail.value?.summary.displayStatus === "completed"` 显示“继续修改”，展示文案/缓存不参与判定；
2. QA-002：waiting Task 继续使用原有 continue/provide-input 控件；
3. QA-003：follow-up 使用原 sessionId；
4. QA-004：follow-up 创建新 Task，不修改旧 Task revision；
5. QA-005：不调用 continue_task/provide_task_input；
6. QA-006：`setFollowUpIntent()` / `consumeFollowUpIntent()` 单次消费且消费前清空，刷新/重复消费不残留；
7. QA-007：不写 LocalStorage；
8. QA-008：Agent exact match 且 runnable 才预选；
9. QA-009：Model exact match 且 available 才预选；
10. QA-010：Agent/Model 不可用时保持空且禁止提交；
11. QA-011：Workspace/Skill/Knowledge 不自动继承；
12. QA-012：follow-up 显示同 Session / 新 Task 边界，composer 空且提示文本不进入 durable message；
13. QA-013：旧成果 missing 时不冒充可修改；
14. QA-014：新文件名与旧文件名不同；
15. QA-015：旧 Artifact preview 保持 ready；
16. QA-016：新 Artifact preview ready；
17. QA-017：follow-up Gateway request exact 含上一用户目标、Assistant 摘要、PPTX Tool Result 安全成果标识/相对路径；
18. QA-018：新 PPTX write Tool/Artifact 各恰为 1；
19. QA-019：Core restart 后两个 Task/Artifact 均恢复；
20. QA-020：Contract/migration/依赖/lockfile 与下游 GATED 边界不漂移。

## 8. 停手条件

出现以下任一情况立即停手回评审：

1. 必须新增或修改公开 Contract/Desktop API；
2. 必须修改 Core/Main/Preload production logic；
3. 同 Session follow-up Gateway request 缺少上一用户目标、Assistant 摘要或 PPTX Tool Result 安全成果标识/相对路径；
4. 必须读取或泄漏 Tool 私有 payload、Provider 私有状态或绝对路径；
5. 必须覆盖旧文件才能完成修改；
6. 必须新增 PPTX read/patch Tool 或通用 Artifact revision store；
7. 必须静默继承未经当前 Catalog/authority 验证的资源；
8. 必须新增 migration、依赖、状态机、retry、sleep 或测试专用生产接缝；
9. 新 Task 导致旧 Task/Artifact 不可读取；
10. 实现开始扩展到 Personal Model、Admin、TGM、Knowledge Provider 或 Agent Lifecycle。

## 9. 评审问题

1. 是否接受 follow-up 是同 Session 新 Task，而不是恢复 completed Task？
2. 是否接受首批由用户重新选择 Workspace/Skill/Knowledge，不为自动回填新增 Contract？
3. 是否接受 Agent/Model 只作为当前 Catalog 校验后的候选，不可用时保持空？
4. 是否接受修订版生成新文件，不覆盖旧成果？
5. 是否接受本批只修改 Renderer、focused tests 与既有 VS2 E2E driver？
6. 是否接受同 Session 上下文不足时立即停手，不扩建 Core context/memory？
7. 是否确认本批通过不代表 production ready，也不解锁其他下游？

## 10. 当前状态

独立文档复核提出的 2 项 P2、2 项 P3 已由 Revision 1 全部 docs-only 吸收；实现严格限定在 Renderer、focused
tests、既有 VS2 E2E driver 与一项既有 Core integration test 断言。独立代码 QA 结论为 PASS，
`P0=0/P1=0/P2=0/P3=0`；用户已正式接受并关闭 VS3，最高 outcome 为
`MVP_VS3_COMPLETED_TASK_FOLLOW_UP_E2E_CONFORMANT`。

本次关闭不代表 production ready，也不自动解锁 Personal Model、Admin mutation、TGM、Knowledge Provider 或
Agent Lifecycle。下一条 MVP 产品任务另行确认。
