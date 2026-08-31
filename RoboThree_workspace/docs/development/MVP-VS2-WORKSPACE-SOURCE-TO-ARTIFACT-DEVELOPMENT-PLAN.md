# MVP-VS2 工作空间资料读取到成果垂直闭环实施计划

> 状态：**VS2.1～VS2.3 PASS/CLOSED；MVP-VS2 PASS/CLOSED**  
> 日期：2026-08-29  
> 上游：MVP-VS1 `PASS/CLOSED`，最高结论 `MVP_VERTICAL_SLICE_1_E2E_CONFORMANT`  
> 产品目标：用户让 RoboThree 读取工作空间里的真实资料并生成可交付成果

## 1. 为什么这是下一条主线

VS1 已经证明“用户输入完整文字 → Agent + Skill → PPTX Tool → 成果 → 重启恢复”。当前最直接的用户缺口不是
更多底座，而是不能把工作空间里的已有资料作为任务输入。VS1 主方案也明确把 DOCX/PDF/XLSX read Tool 留给 VS2。

本批只增加一条可感知能力：

```text
用户选择已授权工作空间
→ 指定一份 DOCX、XLSX 或 PDF 资料
→ Model 调用已锁定的 Document read Tool
→ Tool Observation 回到同一 Agent Loop
→ Model 再调用 PPTX write Tool
→ Desktop 显示回复、读取过程和 PPTX 成果
→ 重启后仍可恢复
```

## 2. 分批任务

### VS2.1：Workspace read Tool production consumption

目标：不新增公开 Contract，先跑通按工作空间相对路径读取的最短真实链。

- 将 `tool.document.docx.read`、`tool.document.xlsx.read`、`tool.document.pdf.extract_text` 与
  `tool.document.pptx.write` 一起进入 `agent.presentation` 的 exact Tool restriction；
- internal-trial Registry、Entitlement、Workspace/Authorization、Tool Policy 和 Capability Lock 支持上述多个
  exact Tool ref，不允许 `unrestricted` 自动装载全集；
- 用户在任务文字中明确给出工作空间相对路径，Model 自主选择匹配的 read Tool；
- read Observation 进入第二轮 Model，上游基于真实内容规划演示文稿，再调用 PPTX write；
- 至少完成 DOCX → PPTX 的真实受控 E2E；XLSX/PDF 完成 focused execution 验证；
- 保留现有 VS1 无文件输入路径，不要求用户必须提供资料。

退出条件：一个真实 DOCX 文件被读取，其内容影响后续 PPTX Tool Call，并在任务页留下 read + write 两段 Tool 活动。

### VS2.2：Workbench 附件选择

目标：把当前“附件”占位区变成普通用户可操作入口。

- 只允许从当前已选择、已授权 Workspace 中选择文件；
- 首批只显示 `.docx`、`.xlsx`、`.pdf`，不接受任意绝对路径；
- 页面显示文件名、类型、可移除状态和不可用原因；
- 提交时把所选文件固化为 content-free workspace-relative selection，不把本机真实路径放入 Renderer 安全投影；
- 若现有 SubmitTurn Contract 无法表达 durable file selection，仅新增一个最小 additive 版本；不得改写 v1alpha5；
- 文件在接受前发生身份漂移时 typed fail-closed，不静默读取同名新文件。

退出条件：用户无需手写相对路径，可以从 Workbench 选择文件并完成与 VS2.1 相同的真实闭环。

### VS2.3：联合恢复与产品收口

- Test-only Gateway 在 read 后、write 前终止 Core；新 Core 以相同 `clientRequestId` 重新发起 round-2，复用
  durable Observation，不重复读取或重复生成；不建设 invocation 续传能力；
- 文件已删除、授权撤销、格式不支持、内容超限分别提供用户可理解的安全错误；
- Task 页面展示“读取资料”和“生成成果”两个业务步骤；
- Desktop 真实 E2E 覆盖 DOCX → PPTX、重启恢复和成果打开；
- 完成一次独立联合 QA，不为每个内部接缝建立单独 Foundation/Closure 批。

## 3. 明确不做

- 不做通用文件管理平台、全文索引、OCR、Knowledge Provider 或 RAG；
- 不做 Skill 安装/发布、TGM、Admin mutation、Agent Lifecycle；
- 不恢复 Personal Model、Credential Reveal 或正式签名 Helper；
- 不新增依赖、migration 或第二套任务/恢复状态机，除非真实实现遇到无法绕开的停手条件；
- 不以演示彩排、演示版本冻结或公网真实模型冒烟作为本批关闭前置条件。

## 4. 顺序与预计投入

1. VS2.1 多 read Tool exact 接线与受控 E2E：1～2 个集中工程日；
2. VS2.2 Workbench 附件选择与最小 durable selection：2～3 个集中工程日；
3. VS2.3 恢复、错误体验与联合 QA：1～2 个集中工程日。

总计 4～7 个集中工程日。任何新增工作如果不能直接提高上述用户闭环完成度，默认移出本批。

## 5. 当前开发入口

VS2.1～VS2.3 均已完成独立 QA 并经用户接受正式关闭。VS2.2 复用现有 manual Workspace Artifact registration、
SubmitTurn 和 SQLite 状态机实现附件选择；VS2.3 复用既有恢复链完成 Core SIGKILL/SQLite reopen、一次 read Tool、
一次 write Tool、Task 两段业务步骤与恢复后 PPTX HTML preview。同一真实 Electron E2E 输出
`MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT`。全批未新增公开 Contract、migration、依赖、通用文件平台
或第二套任务状态机；Personal Model、Admin mutation、TGM、Knowledge Provider 与 Agent Lifecycle 继续 GATED。

## 6. VS2.1 实施进度

2026-08-29 已完成：

- `agent.presentation` 的 Tool restriction 从单一 PPTX write 改为 DOCX read、XLSX read、PDF text read 与
  PPTX write 四项显式 exact allowlist；
- internal-trial Registry、Entitlement、permissions、acceptance lease、Tool Policy 与 Capability Lock 全部支持
  多 Tool exact refs；通用机器人仍不自动获得这些 Tool；
- 新增真实 DOCX → Model → PPTX focused integration：测试在授权工作空间写入真实 DOCX，第一轮模型调用 read，
  Tool Observation 中的正文进入第二轮模型请求，第二轮调用 PPTX write，第三轮返回完成摘要；
- Task detail 同时留下 DOCX read 和 PPTX write 两段 completed Tool activity，并登记源 DOCX 与生成 PPTX 两项成果；
- 未新增公开 Contract、migration、依赖、第二套状态机或 Renderer 改动。

开发者门禁：focused 2 files / 9 tests PASS，Document Tool 与 DTP-4 回归 3 files / 14 tests PASS，Core typecheck、
focused ESLint、DTP-4 audit 与 `git diff --check` PASS。独立 QA 随后确认 P0～P3 全 0，用户已接受，VS2.1
正式 `PASS/CLOSED`。

## 7. VS2.2 实施进度

2026-08-29 已完成：

- Workbench “资料附件”支持从当前选择的 active/read-write Workspace 添加最多 4 个 DOCX/XLSX/PDF，并显示
  文件名、类型、相对路径和移除操作；切换 Workspace 时清空旧选择；
- Main picker 只获得当前 Workspace 的 authority，不接受 Renderer 绝对路径；Core 复用既有 manual Artifact
  registration 持久化 workspaceGrantId、relativePath、file SHA-256、size 与 sourceDigest；
- 提交前 Main 再读取同一文件并调用既有 registration conflict 规则验证 exact identity；文件被替换时返回
  `artifact.source_changed`，且发生在 Session/Task 创建之前；
- SubmitTurn Contract 保持不变。所选资料只以业务可读的工作区相对路径追加到 durable user message，重启后仍可
  从原 SQLite manual Artifact record 重建 exact identity；
- DOCX/XLSX/PDF read Tool 在 build execution 与 effect dispatch 前各复核一次持久化 SHA-256/size；未注册的
  VS2.1 手写相对路径路径保持兼容；
- focused 5 files / 43 tests、Desktop/Core typecheck 与 focused ESLint PASS；未新增 Contract、migration、依赖、
  通用文件平台或第二套状态机。

独立 QA 随后确认 P0～P3 全 0，用户已接受，VS2.2 正式 `PASS/CLOSED`。Desktop foundation smoke 的
`fixtureOnly:true` 只作为 fixture 冒烟，不视为 VS2.3 所需真实 Electron 联合 E2E。
