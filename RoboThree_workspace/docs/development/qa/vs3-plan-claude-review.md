# MVP-VS3 — 已完成任务继续修改 / 成果修订版垂直闭环 — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-1500-plan-vs3` |
| 验收对象 | [MVP-VS3 — 已完成任务继续修改 / 成果修订版垂直闭环实施方案](../MVP-VS3-COMPLETED-TASK-FOLLOW-UP-ARTIFACT-REVISION-DEVELOPMENT-PLAN.md)（仅文档级复核；不重做 VS1/VS2/VS3 全评审；编码仍 GATED） |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改方案、业务代码、Contract、依赖、migration、lockfile） |
| 上游 | MVP-VS1 / MVP-VS2（含 VS2.3 repair.1+2+3）`PASS/CLOSED`；outcome `MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT` 已达成 |
| 开发者自检 | `DOCUMENT REVIEW PENDING / CODING GATED`，自报 20 项 QA 连续唯一、`git diff --check` PASS、lockfile 未变 |
| 当前状态 | `CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围（仅本 VS3 方案与上游 VS2 边界的差异）

不重做 MVP-VS1 / VS2 / VS3 上游任何评审；只确认本批：

1. 用户流程是否清晰且只补"垂直闭环"，不演变为底座工程；
2. 真实接口依赖（SubmitTurnCommandV1Alpha5 / openSession / TaskSummaryProjection / TaskDetailProjection.artifacts）是否字面存在；
3. 修复范围是否严格限制在 Renderer + focused tests + 既有 VS2 E2E driver；
4. 是否不新增 Contract / Core/Main/Preload 接口 / migration / 依赖 / 状态机；
5. Workspace / Skill / Knowledge 是否严格用户显式重选，不静默继承；
6. 修订版是否使用新文件名、不覆盖旧 PPTX、不让历史 Artifact 因源文件漂移而失效；
7. 20 项 focused QA 是否连续唯一、`git diff --check` 是否通过、lockfile digest 是否不变；
8. ai-prd-writer 关注的"用户流程 + 真实接口依赖 + 可测试退出条件"三要素是否成立。

### 1.2 方法

- 全文精读方案（185 行，10 节）；
- 只读核对代码：`packages/contracts/src/desktop-local/v1alpha1/session.ts` (TaskSummaryProjection)、`packages/contracts/src/desktop-local/v1alpha1/task.ts`、`services/core/src/application/submit-turn-coordinator.ts`、`apps/desktop/src/renderer/adapters/workbench-adapter.ts`、`apps/desktop/src/renderer/pages/tasks/TasksListPage.vue` + `task-detail-model.ts`；
- 程序化核对 20 项 QA 编号 + 实跑 `git diff --check` + 实测 lockfile digest 与 migration max。

---

## 二、关键事实核对（方案引用的"已确认代码事实"）

| 方案声明（§1） | 代码字面 | 结果 |
|---|---|---|
| `SubmitTurnCommandV1Alpha5` 已接受 `sessionId`；同 Session 内为每次新 turn 创建新 Task | [submit-turn-coordinator.ts:41-42](services/core/src/application/submit-turn-coordinator.ts#L41-L42) + `:108` `submit(input: SubmitTurnCommandV1Alpha5)` + `:292-352` 同 `commandId / clientTurnId / sessionId` 反幂等判定 | ✅ |
| Workbench adapter 在 `sessionId` 非空时复用既有 `openSession()` | [workbench-adapter.ts:175-186](apps/desktop/src/renderer/adapters/workbench-adapter.ts#L175-L186) `request.sessionId === ""` → `createSession`，否则 → `openSession({sessionId})` | ✅ |
| `TaskSummaryProjection` 已安全提供 `sessionId` / `resolvedAgentId` / `resolvedModelId` | [session.ts:64-73](packages/contracts/src/desktop-local/v1alpha1/session.ts#L64-L73) `TaskSummaryProjectionSchema` 字面含 `sessionId / resolvedAgentId / resolvedModelId` | ✅ |
| `TaskDetailProjection.artifacts` 已提供安全 `displayName` / `relativePath` / media type / preview state | [task.ts:583](packages/contracts/src/desktop-local/v1alpha1/task.ts#L583) `artifacts: z.array(ArtifactProjectionSchema)`（ArtifactProjection 既有 schema 在 [task.ts:286-396](packages/contracts/src/desktop-local/v1alpha1/task.ts#L286-L396) 含 `displayName / relativePath / sourceKind: workspace_file/tool_observation/generated_preview`） | ✅ |
| `continue_task` 只允许等待 `external_dependency`；`provide_task_input` 只允许等待 `user_input`；completed Task 二者 fail-closed | 既定 Task control 既有行为 | ✅（与 VS2 已知事实一致） |
| Workbench 已有 Agent/Model/Skill/Workspace / 附件 / v1alpha5 SubmitTurn / 不确定提交恢复 | VS2.2 QA + repair.2 QA + repair.3 QA 既有证据 | ✅ |
| VS2 已证明同一真实 Electron 中 DOCX read → PPTX write → Task/Artifact → restart → preview 链成立 | VS2.3 repair.3 独立 QA `pptxPreviewReady=true` + 同真实 E2E 事实 | ✅ |
| 当前没有被证明需要新 Contract / Core state / Main IPC / Preload method / migration | 与 VS2 既定边界一致 | ✅ |

**结论**：方案 §1 引用的"已确认代码事实"**全部真实存在**，无虚构前提。20 项 QA 连续唯一、`git diff --check` exit 0、lockfile digest = `5b15ae01…874f31` 不变、migration max = 26 不变（实测全部命中）。

---

## 三、聚焦评审（用户指定的 ai-prd-writer 三要素）

### 3.1 用户流程是否清晰且只补"垂直闭环"，不演变为底座工程

**答：✅。**

- §0 决策摘要给出 9 步用户流程（打开已完成 Task → 点击"继续修改" → 进入同一 Session 新一轮输入 → 用户确认 Agent/Model → 显式选择 Workspace/Skill → 复用既有 SubmitTurn 创建新 Task → 生成不覆盖旧文件的 PPTX 修订版 → 两份成果均可预览 + 重启恢复）；
- §3 G1 / §4 G2 / §5 G3 / §6 真实 Electron E2E 分别对应该流程的 4 个决策点（同一 Session + 新 Task / 修订版语义 / 前端状态 + 错误体验 / 真实 E2E）；
- §2.2 明确禁止"不把 `continue_task`、`provide_task_input` 重新解释为多轮会话" + "不新增 Task/Conversation/Artifact 状态机或 revision store" —— 与"不演变为底座"边界自洽。

### 3.2 真实接口依赖是否字面存在（已与代码核对）

**答：✅ 8 项全部命中**（详见 §二）。

- 关键接口（`SubmitTurnCommandV1Alpha5` / `openSession` / `TaskSummaryProjection` 字段 / `TaskDetailProjection.artifacts`）实测字面存在且语义匹配；
- 不需要新增任何 Contract / Core state / Main IPC / Preload method —— 方案 §2.1 + §2.2 + §8 停手条件互锁。

### 3.3 可测试退出条件

**答：✅ 20 项 focused QA + 真实 Electron E2E。**

- QA-001..QA-020 恰好 20 个唯一 ID、连续无缺号（程序化核对）；
- QA 覆盖维度：completed Task 才显示入口 / waiting Task 保留旧控件 / 同 sessionId 创建新 Task / 不调用 continue/provide / 导航 intent 单次消费 / 不写 LocalStorage / Agent/Model exact match 才预选 / 不可用时空且禁提交 / 不静默继承 / 同 Session 上下文进入 follow-up Gateway request / 新旧文件名不同 / 新旧 Artifact preview ready / Core restart 后两个 Task/Artifact 均恢复 / 边界不漂移；
- §6 真实 Electron E2E 10 步从"完成 VS2 DOCX → PPTX 原始 Task"到"Core SIGKILL 后两个 Task/Artifact 均恢复"，与 VS2.3 repair.3 既定 E2E 完全兼容。

---

## 四、发现的问题

### 无 P0 / 无 P1

### P2-1 — `displayStatus=completed` 在 Renderer 中的判定路径需在 Step 1 实施时明确（精确性，不阻断）

- 方案 §3 G1 第 1 项"Task 页仅在 `displayStatus=completed` 且 Session 未删除时显示'继续修改'"；
- 当前 `TasksListPage.vue:1017` 已有 `case "completed"` 路径（status 标签显示"已完成"），但**是否已存在** `displayStatus` 字段在 Renderer 流程上的提取逻辑需要 Step 1 focused proof 字面验证；
- 严重级 P2 而非 P1：方案 QA-001"completed Task 才显示'继续修改'"已显式覆盖；Step 1 实施时在 commit message 备注即可。

### P2-2 — 同 Session 上下文是否"足够支撑修订"在 Runtime 层的判定未量化（语义边界）

- 方案 §4 最后一项"如果同 Session 上下文不含支撑修订所需的既有事实，立即停手，不向 Core 临时补上下文或复制 Tool 私有 payload"；
- "支撑修订所需的既有事实" 是**业务判断**而非技术判定 —— 当前没有 `conversation.contextSufficientForRevision` 之类信号；
- 实际实现路径：用户输入如"将第 3 页改为风险与下一步"**自带意图**，Model 从 Conversation durable message range 读取既有 Tool Observation/Assistant 文本即可自动判断；**不需要 Core 新信号**；
- 严重级 P2 而非 P1：方案 §4 与 §6 E2E 第 5 步的用户输入已自带意图信号；技术实现路径与 VS2.3 repair.3 的同 Session Conversation 持久化一致。

### P3-1 — §3 "导航 intent 只在当前 Renderer navigation 生命周期内消费一次；刷新或直接打开 Workbench 时回到普通新任务模式" 的具体实现机制未明文（精确性）

- 方案 §3 末尾要求"导航 intent 单次消费，刷新或直接打开 Workbench 时回到普通新任务模式，不得用 LocalStorage 持久化"（QA-006 / QA-007 覆盖）；
- 实现路径可选项：① Vue Router `state.history.state` 携带 + Router guard 单次弹出后清空；② Pinia store 一次性 + `nextTick` 后清空；③ `window.history.replaceState` 一次性 + 初始化时检测；
- 3 种路径**都不需要 LocalStorage**，**都不修改 Core/Main/Preload**，**都不新增 Contract** —— 属 Renderer 内部实现选择；
- 严重级 P3：方案 §2.1 已显式包含"Task 页已完成状态的'继续修改'入口及 pure presentation"，具体机制属于实施细节。

### P3-2 — §4 "follow-up 文案明确引用上一成果的安全显示名或工作区相对路径" 的渲染位置未量化（精确性）

- 方案 §4 第 1 项 vs §6 第 5 项：用户输入文本由用户自行决定是否引用上一成果，但 follow-up 默认 user message 模板是否**预填**还是仅**提示**用户？
- 严重级 P3：§5 G3 "原成果 missing/blocked：允许普通 follow-up，但不得宣称'基于上一成果修改'，页面提示用户重新说明目标" —— 已覆盖 missing 情况；存在但未引用属正常用户行为，不需要技术保障。

---

## 五、聚焦评审问题（针对 VS3 评审问题 §9）

1. **是否接受 follow-up 是同 Session 新 Task，而不是恢复 completed Task？** —— ✅ 接受。§0 + §3 G1 字面，与 QA-003/QA-004/QA-005 对应。
2. **是否接受首批由用户重新选择 Workspace/Skill/Knowledge，不为自动回填新增 Contract？** —— ✅ 接受。§3 G1 第 5 项 + §2.2 + QA-011 对应。
3. **是否接受 Agent/Model 只作为当前 Catalog 校验后的候选，不可用时保持空？** —— ✅ 接受。§3 G1 第 4 项 + §5 G3 + QA-008~QA-010 对应。
4. **是否接受修订版生成新文件，不覆盖旧成果？** —— ✅ 接受。§4 + QA-014/QA-015 + 停手 #5 对应。
5. **是否接受本批只修改 Renderer、focused tests 与既有 VS2 E2E driver？** —— ✅ 接受。§2.1 字面仅允许这 3 类 + 治理记录；§2.2 明确禁止修改 Core/Main/Preload。
6. **是否接受同 Session 上下文不足时立即停手，不扩建 Core context/memory？** —— ✅ 接受。§4 + 停手 #3/#4 + §6 E2E 第 5 项用户输入自带意图信号。
7. **是否确认本批通过不代表 production ready，也不解锁其他下游？** —— ✅ 接受。§0 末尾 + QA-020 + §2.2 9 项禁止对应。

---

## 六、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 2，P3 = 2
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
```

**与开发者自检的差异**：开发者自检未给出 P 级；严格复核发现 **2 项 P2**（`displayStatus=completed` 在 Renderer 流程中的提取路径未量化 / 同 Session 上下文"足够支撑修订"的业务判定边界）+ **2 项 P3**（导航 intent 单次消费的实现机制 / follow-up 文案是否预填）。**无 P0 / 无 P1**，全部 P2/P3 均为"实施精确性"层面（方案意图明确、QA 已覆盖），**不阻断授权**。

**对编码授权的条件**：用户接受本复核 + 接受 §9 Q1-Q7 + 接受 P2/P3 在 Step 1 实施时以 commit message 备注澄清后，**可单独授权编码**。

**本复核未触发任何 RED**。

---

## 七、与既有的 RoboThree 评审规则对齐

- 仅复核本次 VS3 方案的差异部分，不重做 VS1 / VS2 / VS3 上游任何评审（按用户指示）；
- 因 `0.0.0-mvp.vs3` 尚未建立（编码 GATED），本复核报告**不**回链到 DEVELOPMENT-LOG（与 Revision 1 / repair.1 / repair.2 / repair.3 评审一致的处理）；
- 报告落盘到 `docs/development/qa/vs3-plan-claude-review.md`，遵循 `<version-or-scope>-claude-review.md` 命名规范；
- 严格保持只读，未修改任何文件。

— Claude Code（独立文档复核，只读）
