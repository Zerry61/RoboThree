# MVP-VS2.3 详细方案 — Claude Code 独立文档复核报告（严格）

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-2340-plan-vs2.3` |
| 验收对象 | [MVP-VS2.3 联合恢复 / Task 业务步骤 / 真实 Desktop E2E 详细实施方案](../MVP-VS2.3-JOINT-RECOVERY-TASK-BUSINESS-STEPS-REAL-DESKTOP-E2E-DEVELOPMENT-PLAN.md)（文档级复核，编码 GATED，不评估任何生产代码） |
| 日期 | 2026-08-29 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改计划文档、业务代码、Contract、依赖、migration、lockfile） |
| 上游 | MVP-VS1 / VS2.1 / VS2.2（均 `PASS/CLOSED`）+ DFI-4A.4 / STRM-3 / DFI-4A.4.1 / DFI-4A.4.2（已 `PASS/CLOSED`） |
| 开发者自检 | `PLAN_DOCUMENT_REVIEW_PASS — USER_ACCEPTANCE_PENDING`，P0=0/P1=0/P2=0/P3=0 |
| 当前状态 | `DOCUMENT REVIEW PENDING / CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围

严格复核 VS2.3 方案的：

1. **事实可证性**：方案 §2/§3.2/§6 引用的"现有事实"是否在代码库中真实存在；
2. **内部一致性**：计数、措辞、门禁顺序、Evidence 字段之间是否自洽；
3. **诚实边界**：是否把"恢复既有 invocation"等关键机制写成与实际代码行为不符的表述；
4. **可行性与风险**：崩溃窗口、Invocation 恢复、Gateway 计数、Renderer 驱动方式等技术假设是否足够精确以支撑"编码后可一次性通过 E2E 验收"；
5. **计划内自检声明**：48 项 focused QA 连续/唯一/无缺号、git diff --check。

**不**在本次复核范围：

- 不评估任何 VS2.3 生产代码（本批尚无编码）；
- 不修改计划文档 / 业务代码 / Contract / 依赖 / migration / lockfile；
- 不替代 VS1 / VS2.1 / VS2.2 / DFI-4A.4.x / STRM-3 既有独立 QA 结论；
- 不复跑历史 harness（保持只读）。

### 1.2 方法

- 全文精读 VS2.3 计划文档（343 行，14 节）；
- 只读核对代码库：`tool-call-batch-coordinator.ts`、`durable-enterprise-model-provider.ts`、`packages/contracts/src/desktop-local/v1alpha1/task.ts` + `error.ts`、`scripts/run-mvp-vs1-electron.mjs`、`apps/desktop/src/renderer/pages/tasks/TasksListPage.vue`；
- 程序化核对 48 项 QA 编号连续性/唯一性 + 实跑 `git diff --check`；
- 核对 README / CHANGELOG / VS2 计划文档的 VS2.2 `PASS/CLOSED` + `fixtureOnly:true` 同步。

---

## 二、事实核对结果（方案引用的"现有事实"）

| 方案声明（§2/§3/§6） | 代码字面 | 结果 |
|---|---|---|
| `ToolCallBatchCoordinator.recover()` 跳过 `result_committed` | `tool-call-batch-coordinator.ts:178` `recover()`，`:182` `listRecoverableToolCallBatches()`，`:208` `if (disposition.disposition === "result_committed") continue;` | ✅ |
| Effect Attempt / Tool Result / Assistant Message 已 durable | Tool Call Batch + Conversation persistence 既有 | ✅ |
| VS2.2 manual Artifact registration 保存 SHA-256/size | `desktop-application-facade.ts:1210-1222` + `sqlite-desktop-foundation-persistence.ts` | ✅（VS2.2 QA 已证） |
| `TaskDetailProjection` 已含 steps/tools/artifacts | `task.ts:172` `steps`、`:581` `toolActivities`、`:583` `artifacts` | ✅ |
| VS1 Electron E2E 已有 Main/Core/SQLite/SIGKILL 拓扑 | `run-mvp-vs1-electron.mjs:93` sqlite、`:158` `SIGKILL`、`:444-447` `ESRCH` | ✅ |
| `artifact.source_unavailable/source_changed` 已冻结 | `desktop-local/v1alpha1/error.ts:40/41`（frozen，VS2.2 QA 已证） | ✅ |
| Provider 第二轮 invocation 按 Invocation Link 恢复；不可恢复 → typed wait/manual attention | `durable-enterprise-model-provider.ts` 有 `durable_replay`（`:151/181`）、`ModelStreamResumeUnavailableError`（`:63`）、确定性 `clientRequestId = stableUuid(taskId:runId:round)`（`:141-143`） | ⚠️ 见 P1-1 |
| Task 页有"任务进程"区域可接入 | `TasksListPage.vue:561-563` 渲染 `selectedDetailView.steps`，经 `task-detail-model.ts` `buildTaskDetailView` | ✅ |
| 48 项 focused QA 连续/唯一/无缺号 | 程序化核对：QA-001..QA-048 恰好 48 个唯一 ID，连续无缺号；每个编号各出现 2 次（1 次为条目 + 1 次为 9.1-9.6 节标题范围），无重复条目 | ✅ |
| `git diff --check` 通过 | 实跑 `git diff --check` | exit 0 ✅ |
| VS2.2 `PASS/CLOSED` + `fixtureOnly:true` 同步至 README / VS2 文档 | `README.md:29-32` + `MVP-VS2-WORKSPACE-SOURCE-TO-ARTIFACT-DEVELOPMENT-PLAN.md:119-120` 字面 | ✅ |

**结论**：方案 §2"现有事实与复用边界"表、§3.2 恢复不变量、§6 拓扑引用的既有机制**全部真实存在**，无虚构前提。开发者"48 项连续/唯一/无缺号"与"git diff --check 通过"两项自检**属实**。

---

## 三、发现的问题

### P1-1 — 第二轮 Invocation 的"恢复"语义与现有 provider 实际机制不一致（必须澄清后编码）

**证据**（`durable-enterprise-model-provider.ts`）：

- `:141-143` `clientRequestId = stableUuid(`${exact.taskId}:${exact.runId}:${exact.round}`)` —— 按 (task,run,round) **确定性**；
- `:146-153` / `:179-183` 仅当既有 link 的 `messageCommittedAt !== undefined` 才 `finishReason: "durable_replay"`（重放**已提交完成**的结果）；
- `:201-208` 未提交时走 `operation.accept(...)` 发起**新的 transport 请求**。

**与本批崩溃窗口的关系**：方案 §3.1 的 barrier 在"返回 PPTX Tool Call 之前"写入（即 round-2 未返回任何字节），因此崩溃时 round-2 的 `messageCommittedAt` **必然未定义**。恢复后新 Core PID 会以**同一 clientRequestId** 重新驱动 round-2，但对 Gateway 发起的是**一次全新的 `accept` 请求**，而不是"恢复既有 invocation"。

**推论**：

- Gateway 收到的 round-2 请求为 **2 次**（崩溃前 1 + 恢复后 1；总请求数 = round-1 + round-2×2 = 3）；
- "唯一 PPTX Tool Call"来自**恢复后**的那次 round-2；
- 方案 §3.1 第 6 步"释放 Gateway barrier，让既有第二轮 invocation 恢复"的措辞与实际"恢复后重新 accept 一次"**不符**；§6.2 / §11 Evidence 均**未固定 round-2 请求计数**；
- VS1 E2E 曾以 `gateway.requests.length !== 2` 抛错（`run-mvp-vs1-electron.mjs:168-169`）——VS2.3 若照搬"精确请求计数"断言而按唯一 round-2 设计，会与真实行为冲突。

**要求**（不改变方案架构，只需在 Step 1 focused proof 固定）：

1. 在 Step 1 明确写出"恢复后 round-2 为新的 Gateway 请求、round-2 请求计数 = 2（或总计数 = 3），唯一 PPTX Tool Call 来自恢复后的 round-2"；
2. 将 round-2 请求计数加入 §11 Evidence 最小字段；
3. QA-002"第二轮 Model Request 含 exact read observation"应改为"**恢复后的** round-2 请求含 exact read observation"。

**严重级**：P1（不是 P0——方案在"链路不可恢复"时是 fail-closed 的 typed wait，不会伪造 PASS；但它是本批唯一验收路径的决定性假设，编码授权前必须澄清，否则 E2E 断言可能按错误预期设计）。

---

### P2-1 — "五类错误" 计数不一致

- §13 评审问题 6："是否接受**五类**错误通过既有字段与内部固定 safe mapping 呈现"；
- G3 表格（§5）只有 **4 行**（文件已删除/不可读；文件被替换；Workspace 授权撤销；格式不支持/**内容超限**——后两个合并为一行）；
- QA-031~035 枚举 **5 个**独立场景（文件删除/文件替换/授权撤销/格式不支持/内容超限）。

计数口径在文档内部不统一。要求：要么拆 G3 表格为 5 行，要么把"五类"改为"四类通道（五种场景）"。编码前统一，避免实施与 QA 矩阵对不上。

### P2-2 — "真实点击" 的驱动机制未定义

- VS1 E2E 实际用 `window.webContents.executeJavaScript(workbenchDriverScript(...))` 驱动 Renderer（`run-mvp-vs1-electron.mjs:129-163`），**不是** OS 级合成输入事件；
- 方案 §6.1"Renderer 必须真实点击'添加资料'和'开始任务'"、§9.5 QA-042"Renderer 真实添加资料并提交"未明确驱动机制。

要求：明确"真实点击"= 沿用 VS1 的 `webContents` driver 在 app 层点击（真实 Vue handler + 真实 production IPC），并**显式声明不是** OS 级输入事件自动化（§6.1 已正确否认 macOS 原生文件对话框自动化，但尚未否认 OS 输入事件层）；否则 Evidence 布尔值有过度声明风险。

### P2-3 — 业务步骤 derived 状态词汇未总量化

- §4.2 优先级列表"需要人工处理/失败/超时 → 等待确认 → 执行中 → 准备中 → 成功 → 等待开始"是**列表而非穷举映射**；
- `ToolActivityStatusSchema`（`task.ts:73-82`）有 **8** 个值，含 `cancelled` —— **未在优先级列表出现**（cancelled 该归入哪个业务状态未定义）；
- "等待开始"在 enum 中**无对应原始值**（属 derived absent-state，需明确"0 activity → 等待开始"）；
- 多个 read activity 的**混合聚合**（一个 completed + 一个 failed）未定义。

要求：给出 total 的 derived-status 表，覆盖 0 activity / cancelled / mixed 聚合；现状只定义了部分优先序。

### P3-1 — "最小 additive 接缝"未命名候选 seam

§7"services/core/src/application/**：仅在现有恢复链无法表达固定 safe cause 或测试 barrier 时做最小 additive 接缝"——"最小 additive 接缝"是开放性许可。建议编码前列出候选 seam（如 VS2.2 的 `workspace.attachment_identity_changed` → G3 固定 safe cause 的映射落点），避免编码中临场扩权。

---

## 四、独立评审问题逐项回答（方案 §13）

1. **VS2.3 仅为垂直链路收口而非新 Foundation** —— **接受**。§0.6 / §7 禁止新 Foundation / repair / Closure 子批，边界清晰。
2. **崩溃窗口固定在 read committed → 第二轮含 observation → write 未返回** —— **接受**。窗口精确，禁止用 callback/单进程异常/删库/sleep 冒充（§3.1），与 VS1 SIGKILL 拓扑一致。
3. **恢复必须 read/write 各执行一次且不重新选择 authority** —— **接受**。`result_committed` skip（P1-1 之外的部分）真实存在。
4. **Task 业务步骤仅从 durable ToolActivity/Artifact 派生，不修改 Contract** —— **接受**。`task.ts:581/583` 字段齐备，禁止解析用户文本（§4.1）。
5. **非 VS2 Task 继续通用 steps** —— **接受**。QA-028 覆盖，`TasksListPage.vue:561-563` 既有 steps 展示保留。
6. **五类错误用既有字段 + 内部 fixed safe mapping，不新增公开错误版本** —— **有保留地接受**。思路正确（`error.ts:40/41` frozen 复用），但"五类/四行"计数不一致（P2-1）。
7. **Main-owned picker callback，不表述为原生对话框自动化** —— **接受**。§6.1 明确否认，诚实。
8. **PPTX "打开" 以 pathless HTML preview ready 为门禁** —— **接受**。避免外部 PowerPoint 依赖，与 `pptx-html-preview` 一致。
9. **48 项 focused QA，不建 96/120 关闭账本** —— **接受**。48 项编号连续/唯一/无缺号已验证。
10. **VS2.3 关闭后下游继续 GATED，不输出 production ready** —— **接受**。§1/§11 Evidence 明确。

---

## 五、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 1，P2 = 3，P3 = 1
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
```

**与开发者自检的差异**：开发者自检为 `PLAN_DOCUMENT_REVIEW_PASS`、P1=0。严格复核发现 **1 项 P1**（第二轮 Invocation"恢复"语义与现有 provider 实际"恢复后重新 accept 一次"机制不一致，round-2 请求计数未固定），故结论降为 **PASS WITH RISKS**。方案的事实基础全部真实（无虚构前提），所有发现均可**在不改动方案架构的前提下**于 Step 1 focused proof 中澄清，因此不判 FAIL，但**编码授权前必须解决 P1-1**。

**对编码授权的条件**：用户接受本复核后，编码授权前先完成 Step 1（recovery focused proof）并把 round-2 请求计数 / resume-vs-reissue 语义写入方案（或作为实施报告的决策记录）；P2-1 计数统一；P2-2/P2-3/P3-1 在编码前补齐。

本复核仅只读，未修改任何文件。因 VS2.3 尚未建立开发版本条目（编码 GATED），本复核报告未向 DEVELOPMENT-LOG 追加回链；开发者在创建 `0.0.0-mvp.vs2.3` 版本条目时应引用本复核。

— Claude Code（独立文档复核，只读）
