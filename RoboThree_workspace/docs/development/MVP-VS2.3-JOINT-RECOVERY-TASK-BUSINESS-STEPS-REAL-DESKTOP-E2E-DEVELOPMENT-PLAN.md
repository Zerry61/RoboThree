# MVP-VS2.3 联合恢复 / Task 业务步骤 / 真实 Desktop E2E 详细实施方案

> 状态：**PASS/CLOSED**  
> 版本目标：`0.0.0-mvp.vs2.3`  
> 日期：2026-08-29  
> 上游：MVP-VS1、VS2.1、VS2.2 均 `PASS/CLOSED`  
> 预计投入：1～2 个集中工程日
> 实施停手：[MVP-VS2.3 实施停手报告](./MVP-VS2.3-IMPLEMENTATION-STOP-REPORT.md)
> 历史停手：[PPTX 预览来源停手报告](./MVP-VS2.3-PPTX-PREVIEW-AUTHORITY-IMPLEMENTATION-STOP-REPORT.md)，已由 repair.3 解除

## 0. 决策摘要

VS2.3 是现有工作空间资料读取垂直链路的产品收口批，不是新 Foundation。Revision 1 吸收独立文档复核与
MVP 范围复查，明确只交付已有底座的业务消费：

1. 复用现有 Task、Tool Call Batch、Effect、Agent Loop 与 SQLite 恢复语义，不建立第二套状态机；
2. 测试窗口固定为“read Tool Result 已持久化、首次 round-2 已到达受控 Gateway、PPTX write Tool Call 尚未返回”；
3. 新 Core 使用 durable invocation link 与同一确定性 `clientRequestId` 恢复同一 round-2 invocation 的 SSE
   subscription；总计一次 accept、两次 SSE subscription，不重新 accept；
4. 恢复后不得再次执行 read Tool，不得重复生成 PPTX，也不得重新选择 Agent、Model、Skill、Tool 或 Workspace；
5. Task 页的“读取资料 / 生成成果”只从 durable ToolActivity 与 Artifact 派生，不解析用户消息，不新增 Contract；
6. 真实 E2E 使用 Electron production Main / Preload / Renderer、真实 Core child、真实 SQLite、真实 Document
   Worker 和受控 Gateway HTTP/SSE fixture；fixture 不冒充公网 Provider 或 production ready；
7. 本批只做 24 项 focused 验收、一条真实 Electron 联合 E2E 和一次独立 QA，不建立 Evidence schema、
   96/120 项关闭账本或新的生产诊断接缝。

## 1. 产品目标与退出条件

用户在普通 Workbench 中选择一个已授权 Workspace 和一份 DOCX，提交后应看到：

```text
选择资料
→ 读取资料
→ Core 在读取完成、生成开始前崩溃并自动恢复
→ 生成成果
→ Task 页显示两段业务进程
→ PPTX 出现在成果面板并可打开预览
```

VS2.3 退出必须同时满足：

- 同一 Task/Session 在新 Core PID 和原 SQLite 上恢复完成；
- read Tool 实际执行 1 次、PPTX write Tool 实际执行 1 次、最终 PPTX Artifact 恰为 1 个；
- durable Tool Result、Assistant Message、Task、Tool Activity 与 Artifact 均无重复；
- Task 页显示“读取资料”和“生成成果”，状态来自真实 durable facts；
- Renderer 仍不接触真实绝对路径、文件哈希、Tool 参数、Tool Result 或 Provider Token；
- 文件异常以固定、安全、可操作的中文提示呈现；
- VS2.1/VS2.2 无附件路径与手写相对路径继续工作。

最高只允许输出：

```text
MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT
```

该结论不代表 production ready、真实公网 Provider、签名安装包、Personal Model、Admin mutation、TGM、
Knowledge Provider 或 Agent Lifecycle ready。

## 2. 现有事实与复用边界

| 现有事实 | VS2.3 用法 | 禁止做法 |
|---|---|---|
| `ToolCallBatchCoordinator.recover()` 跳过 `result_committed` | 证明 read result 不会重复 dispatch | 新建附件恢复表或第二套 batch |
| Effect Attempt / Tool Result / Assistant Message 已 durable | 恢复同一 Agent Loop | response loss 后重新建 Task |
| VS2.2 manual Artifact registration 保存 SHA-256/size | read dispatch 前继续 exact 校验 | 重新读取 current picker selection |
| `TaskDetailProjection` 已含 steps/tools/artifacts | Renderer 派生业务步骤 | 新增无其他消费者的 Task Contract |
| VS1 Electron E2E 已有 Main/Core/SQLite/SIGKILL 拓扑 | 扩展为真实附件与 read→write | 用单进程 throw 冒充 SIGKILL |
| `artifact.source_unavailable/source_changed` 已冻结 | 提交前继续复用 | 新增公开错误版本只为文案 |

## 3. G1 — Read 后 / Write 前 Durable Recovery

### 3.1 精确崩溃窗口

受控 Gateway 的第二轮请求必须先证明其上下文已经包含第一轮 durable read Tool Result。Gateway 随后写入 named
barrier `read_result_committed_before_write_tool_call` 并暂停返回 PPTX Tool Call。父 E2E 进程在 barrier 后：

1. 记录首个 Core PID、runtimeInstanceId、Task ID、Session ID；
2. 对 Core child 发送真实 `SIGKILL`；
3. 使用 `kill(pid, 0) → ESRCH` 证明原进程已退出；
4. 等待 Supervisor 启动新 PID、新 runtimeInstanceId；
5. 使用同一 SQLite 文件和同一 Task/Session 恢复；
6. 原 round-2 随 Core 退出而终止；新 Core 使用相同 `clientRequestId` 执行一次新的 `operation.accept(...)`；
7. 恢复后的 round-2 再次携带同一 durable read observation，并返回唯一 PPTX Tool Call。

请求计数固定为：round-1 = 1、round-2 = 2、round-3 最终回复 = 1、Gateway 总请求 = 4。两次 round-2 的
`clientRequestId` 相同，
但它们是两次 transport accept，不得表述为恢复或续传同一个 invocation。named barrier 只能存在于 VS2 E2E
受控 Gateway fixture/driver，不得进入 Core、Main、Preload 或 Renderer 生产代码。如果现有测试 fixture 无法构造
该窗口，立即停手并把本批降为普通重启可见性验证；不得为测试窗口新增生产接缝。

### 3.2 恢复不变量

- `submitTurnCommandId`、Task/Session、Runtime Selection、Capability Locks 与 Workspace lock 全部不变；
- `listRecoverableToolCallBatches()` 对 read batch 不得再次 dispatch `result_committed` disposition；
- 不重新读取 Catalog、Agent、Preference、Entitlement 或 current Workspace selection；
- read Tool execution count = 1；PPTX write execution count = 1；PPTX Artifact count = 1；
- 原 round-2 不续传；恢复后以相同确定性 `clientRequestId` 重新 accept，并继续使用已持久化 read result；
- 重放完成后 Assistant Message、Delivery、Task terminal state 均恰为一份。

如上述任一不变量需要修改 Task/Tool/Effect 状态机或新增持久化结构，立即触发停手回评审。

## 4. G2 — Task 页业务步骤

### 4.1 数据来源

仅使用 `TaskDetailProjection.toolActivities` 与 `artifacts`：

- 读取能力：`tool.document.docx.read`、`tool.document.xlsx.read`、`tool.document.pdf.extract_text`；
- 生成能力：`tool.document.pptx.write`；
- 不解析 durable user message 中的附件文本；
- 不读取 Main-only 路径或 SQLite 私有字段；
- 不改变 `TaskStepProjection`、`ToolActivityProjection` 或 `ArtifactProjection`。

### 4.2 两段业务步骤

当 Task 出现上述 exact read/write Tool activity 时，Renderer 在“任务进程”区域展示：

| 步骤 | 业务标题 | durable 状态来源 | 完成条件 |
|---|---|---|---|
| 1 | 读取资料 | 所有 exact read ToolActivity | 至少一个 read activity 且全部 `completed` |
| 2 | 生成成果 | PPTX write ToolActivity + PPTX Artifact | write `completed` 且存在 active/available PPTX Artifact |

业务状态必须总量覆盖全部原始值和空集合：

| durable activity 集合 | 业务状态 |
|---|---|
| 0 个 activity | 等待开始 |
| 任一 `uncertain` | 需要人工处理 |
| 否则任一 `failed` | 失败 |
| 否则任一 `timed_out` | 超时 |
| 否则任一 `cancelled` | 已取消 |
| 否则任一 `waiting_confirmation` | 等待确认 |
| 否则任一 `running` | 执行中 |
| 否则任一 `preparing` | 准备中 |
| 全部 `completed` | 成功 |

多 read activity 按上表从上到下聚合；只有全部完成才显示“读取资料成功”。生成步骤还必须存在 active/available
PPTX Artifact 才能成功。恢复过程中已完成的“读取资料”不得回退为“等待开始”。

非 VS2 read→write Task 保持现有通用 steps 展示，不强行套用两段模板。业务步骤 projection 保持 Renderer pure
module，不导入 Vue、DOM、Preload 或 SQLite。

## 5. G3 — 文件异常的安全产品文案

不新增公开错误 Contract。Core 只允许把下列 internal cause 写入既有 RuntimeError/Task 状态，Desktop 使用固定
allowlist 映射为中文 `failureSummary`；未知错误继续使用现有通用失败提示。

| 场景 | 事实来源 | 用户文案 | 行为 |
|---|---|---|---|
| 文件已删除/不可读 | registration 存在但文件不可读取 | “资料文件已不存在或暂时无法读取，请恢复文件后重新提交。” | fail-closed，不调用 Provider/write |
| 文件被替换 | SHA-256/size 与 registration 不一致 | “资料文件已发生变化，请重新选择后提交。” | fail-closed，不静默读取新文件 |
| Workspace 授权撤销 | locked grant 非 active/read-write | “工作区授权已失效，请重新授权后提交。” | 不重新选择其他 Workspace |
| 格式不支持 | Document Worker 既有 typed result | “该资料格式暂不支持。” | 不把 parser/路径/正文暴露到 Renderer |
| 内容超限 | Document Worker 既有 typed result | “资料内容超过当前处理上限。” | 不把正文或限制实现暴露到 Renderer |

固定文案不得包含绝对路径、hash、Schema path、stack、Tool arguments、Tool Result、Provider response 或 Token。
本批的 production seam 候选清单为**空**：只允许 Renderer 映射现有错误事实；若既有事实不能区分某场景，使用
现有通用安全提示。不得为文案新增 Core cause、公开错误码、持久化字段或跨进程接口。

## 6. G4 — 真实 Electron 联合 E2E

### 6.1 拓扑

```text
Electron production Main
→ sandboxed Preload
→ production Renderer Workbench
→ app-private attachment picker/validation IPC
→ real Core child + original SQLite
→ real Document Worker DOCX read
→ controlled Gateway HTTP/SSE
→ SIGKILL + Supervisor new Core child
→ PPTX write
→ Task detail + artifact HTML preview
```

附件由 E2E 的 Main-owned picker callback 指向临时 Workspace 中的真实 DOCX；沿用 VS1
`webContents.executeJavaScript` app driver 触发真实 Vue handler、Main IPC 和提交动作。这不是 OS 级合成输入，
也不声称自动化了 macOS 原生文件选择对话框。

### 6.2 必验事实

- `realElectronMain=true`、`sandbox=true`、`contextIsolation=true`、`nodeIntegrationDisabled=true`；
- Renderer 中 `window.process`、绝对路径和 internal-trial Token 均不可见；
- 真实 DOCX 内容出现在第二轮 Gateway request 的 Tool Result context；
- named barrier、SIGKILL、ESRCH、新 PID、新 runtimeInstanceId、原 SQLite reopen 全部可证；
- 页面在恢复前后均可打开同一 Task；恢复后显示两段业务步骤、最终回复和唯一 PPTX；
- 点击成果进入现有 pathless PPTX HTML preview，`previewState=ready`；不以调用外部 PowerPoint 应用作为门禁；
- 所有 Electron/Window/WebContents/Core child/Gateway/Document Worker/临时目录/监听端口最终归零。

## 7. G5 — 代码与文件范围

允许的最小范围：

- `apps/desktop/src/renderer/pages/tasks/**`：业务步骤 pure projection 与页面展示；
- 对应 Desktop focused tests；
- `services/core/tests/**`：只补现有 Tool Result recovery 的 focused 断言，不修改生产状态机；
- `scripts/run-mvp-vs2-electron.mjs` 或等价单一 VS2 E2E script；
- 根 scripts/package version 与本计划、实施报告、CHANGELOG、DEVELOPMENT-LOG。

禁止：

- 修改 `packages/contracts/src/**`；
- 为 barrier、错误文案或 Evidence 修改 `services/core/src/**` 生产代码；
- 新增 migration、依赖、数据库表、通用文件索引、OCR/RAG/Knowledge ingestion；
- 修改 VS1、VS2.1、VS2.2 historical QA/Evidence 以适配当前版本；
- 恢复 Personal Model、Admin mutation、TGM、Knowledge Provider 或 Agent Lifecycle；
- 新建 Foundation、repair 或 Closure 子批来替代本批交付。

控制性预期：本批 Core/Main/Preload 生产代码改动数应为 0；产品代码改动主要位于现有 Renderer Task 页面及其
pure projection。若真实 E2E 暴露必须修改 Core/Main/Preload 才能完成的业务缺口，应按停手条件单独回评审。

## 8. 实施顺序

### Step 1 — Task 业务步骤（0.25～0.5 日）

- 新增 Renderer pure projection并接入现有“任务进程”区域；
- 总量覆盖 8 个 ToolActivity 状态、空集合和多 read 混合状态；
- 只映射既有错误事实，缺少精确事实时使用通用安全提示。

### Step 2 — 真实 Electron E2E（0.5～1 日）

- 扩展 VS1 production topology 为 VS2 附件 read→write；
- 在 test-only Gateway fixture 设置 barrier，固定 round-1/round-2 请求计数与相同 `clientRequestId`；
- 执行真实 SIGKILL、新 Core、原 SQLite、唯一 PPTX 与页面预览验证。

### Step 3 — 聚焦回归与报告（0.25 日）

- 运行 VS2.3 focused、VS2.2/VS2.1 regression、build/typecheck/audit；
- 输出一份实施报告，不新增 Evidence schema 或阶段 closure 文档。

## 9. Focused QA 矩阵（24 项）

### 9.1 用户主流程（QA-001～QA-006）

1. QA-001：Workbench 通过真实 Vue handler 添加 Workspace DOCX 并提交；
2. QA-002：Document Worker 读取真实 DOCX，正文进入 Model Tool Result context；
3. QA-003：恢复后的 round-2 请求包含 exact durable read observation；
4. QA-004：PPTX write Tool 实际执行并生成唯一成果；
5. QA-005：Task 页显示“读取资料 / 生成成果”两段业务步骤；
6. QA-006：PPTX pathless HTML preview 可打开且 ready。

### 9.2 Task 页面状态（QA-007～QA-012）

7. QA-007：exact read/write capability 分别映射两个业务步骤且顺序固定；
8. QA-008：8 个 ToolActivity 原始状态与 0 activity 全量映射；
9. QA-009：多 read activity 按 uncertain/failed/timed_out/cancelled/confirmation/running/preparing/completed 聚合；
10. QA-010：PPTX Artifact 缺失时“生成成果”不得成功；
11. QA-011：恢复后已完成的“读取资料”不回退为等待开始；
12. QA-012：非 VS2 Task 保留现有通用 steps。

### 9.3 重启与不重复（QA-013～QA-018）

13. QA-013：首次 round-2 到达后真实 SIGKILL、ESRCH、新 Core PID 与原 SQLite reopen；
14. QA-014：恢复后以相同 `clientRequestId` 发起新的 round-2 accept，不宣称 invocation 续传；
15. QA-015：round-1=1、round-2=2、round-3=1、Gateway total=4；
16. QA-016：read Tool=1、write Tool=1、PPTX Artifact=1；
17. QA-017：`result_committed` read batch 不再次 dispatch，Task/Session identity 不变；
18. QA-018：Assistant Message、Delivery 与 terminal Task 各无重复。

### 9.4 安全边界与回归（QA-019～QA-024）

19. QA-019：五种文件异常只映射既有事实；未知场景使用通用安全提示；
20. QA-020：Renderer 不显示绝对路径、hash、Tool payload、正文、Token 或 stack；
21. QA-021：barrier 仅存在于 VS2 test fixture/driver，Core/Main/Preload/Renderer production source 零接缝；
22. QA-022：`webContents.executeJavaScript` 只声明 app-level driver，不冒充 OS 输入或原生文件对话框；
23. QA-023：VS2.2 43 tests、VS2.1 23 tests 及无附件 VS1 路径继续通过；
24. QA-024：公开 Contract、migration、依赖、lockfile 不漂移，下游继续 GATED，outcome 不含 ready 声明。

## 10. 开发者与独立 QA 门禁

编码后串行执行：

1. VS2.3 focused Core/Renderer tests；
2. VS2.2 5 files / 43 tests；
3. VS2.1 5 files / 23 tests；
4. `e2e:mvp-vs2` 真实 Electron 联合 E2E；
5. Root/Core/Desktop typecheck 与 production build；
6. focused ESLint、DTP-4 audit、`git diff --check`；
7. Core smoke、Desktop foundation smoke；
8. migration max=26、lockfile digest 与 frozen Contract 不漂移。

Central online/offline 不作为默认门禁，因为本批不得修改 Central；若实施触碰 Central，立即停手回评审，而不是
把 Central 测试补入本批后继续。

## 11. Evidence 最小字段

E2E 只输出既有 JSON 报告内的 content-free 字段，不创建新的 Evidence schema：

- `outcome=MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT`；
- real process/security 布尔值；
- first/second Core PID 与 runtime identity；
- `roundOneRequestCount=1`、`roundTwoRequestCount=2`、`roundThreeRequestCount=1`、`gatewayRequestCount=4`；
- 两次 round-2 `clientRequestId` 相同，以及 read/write/artifact/assistant/delivery exact counts；
- business stage count = 2；
- SIGKILL/SQLite reopen/PPTX preview/resource cleanup 布尔值；
- migration max、lockfile digest；
- 下游 readiness 全 false。

Evidence 禁止包含 Token、绝对路径、文件正文、文件 hash、Tool arguments、Tool Result、Provider response、环境变量、
stack 或 SQLite 内容。

## 12. 强制停手条件

出现任一情况立即停止编码并回到文档评审：

1. 需要新增/修改公开 Contract；
2. 需要 migration、依赖、表、索引或 durable file store；
3. 现有 recovery 会重复执行已提交 read Tool；
4. 现有 recovery 只能通过新建 Task/Session 完成；
5. 必须重新读取 current Agent/Model/Skill/Tool/Workspace authority；
6. Task 业务步骤只能通过解析用户消息或读取私有路径构造；
7. 需要修改 Document Worker parser 或增加新格式；
8. 需要用单进程 throw、删库、固定 sleep 或 retry 掩盖真实崩溃；
9. 需要把受控 Gateway fixture 声称为公网 Provider；
10. 需要触碰 Personal Model、Admin mutation、TGM、Knowledge Provider 或 Agent Lifecycle；
11. historical Evidence 必须改写才能通过；
12. 无法证明 Electron/子进程/端口/临时目录最终清理。
13. 必须修改 Core/Main/Preload/Renderer production code才能创建测试 barrier；
14. 必须新增 Core cause 或跨进程字段才能区分五种文案。

## 13. 独立评审问题

1. 是否接受 VS2.3 仅为 VS2.1～VS2.2 垂直链路收口，而非新 Foundation？
2. 是否接受首次 round-2 被 SIGKILL，中断后以相同 `clientRequestId` 新 accept，而非续传原 invocation？
3. 是否接受 recovery 必须 read/write 各执行一次且不重新选择任何 authority？
4. 是否接受 Task 业务步骤仅从 durable ToolActivity/Artifact 派生，不修改 Contract？
5. 是否接受非 VS2 Task 继续展示原通用 steps？
6. 是否接受五种错误只映射既有事实，缺少精确事实时使用通用安全提示？
7. 是否接受 E2E 使用 app-level `webContents` driver，不表述为 OS 输入或原生文件对话框自动化？
8. 是否接受 PPTX “打开”以现有 pathless HTML preview ready 为门禁，而非启动外部 PowerPoint？
9. 是否接受 24 项 focused QA，不建立 Evidence schema 或 96/120 项 closure ledger？
10. 是否确认 VS2.3 关闭后下游仍继续 GATED，且不输出 production ready？

## 14. 当前授权边界

Revision 1 完成后状态仍为：

```text
FOCUSED DIFFERENCE REVIEW PENDING / CODING GATED
```

文档评审 PASS 不等于编码授权。用户正式接受本方案并单独授权前，不得创建 VS2.3 生产代码、测试 Harness、
Evidence 或版本变更。Personal Model、Admin mutation、TGM、Knowledge Provider 与 Agent Lifecycle 继续 GATED。
