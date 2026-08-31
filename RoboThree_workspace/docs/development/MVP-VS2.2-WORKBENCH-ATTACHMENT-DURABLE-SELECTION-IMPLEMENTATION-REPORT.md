# MVP-VS2.2 Workbench 附件选择与 Durable File Selection 实施报告

> 版本：`0.0.0-mvp.vs2.2`  
> 状态：**PASS/CLOSED**  
> 日期：2026-08-29

## 1. 用户能力增量

用户不再需要手写工作空间相对路径。Workbench 的“资料附件”现在可以从当前已选择、已授权的 Workspace 添加
DOCX、XLSX 或 PDF；页面显示文件名、类型和安全相对路径，可在提交前移除。未选择资料时原 VS1/VS2.1 路径
保持不变。

## 2. 最小实现路径

- 复用既有 manual Workspace Artifact registration，不建立通用文件平台；
- Main picker 只接收当前 `workspaceGrantId` 对应的 active/read-write authority，Renderer 不接触绝对路径；
- Core/SQLite 继续保存既有 `workspaceGrantId + relativePath + fileSha256 + byteSize + sourceDigest` identity；
- Workbench 提交前通过 Main 对当前文件重新计算 identity，并复用 Core registration conflict 规则；
- 验证成功后，只把业务可读的 Workspace 相对路径加入既有 durable user message；SubmitTurn v1alpha5、Task bundle、
  coordination 和恢复状态机均不修改；
- read Tool 在 execution build 与 effect dispatch 两个窗口按 SQLite registration 再核对 SHA-256/size，避免同名替换；
- 文件在任务接受前发生变化时返回 `artifact.source_changed`，验证先于 Session/Task 创建。

## 3. UI 与安全边界

- 首批只允许 `.docx`、`.xlsx`、`.pdf`，最多 4 项；
- 切换 Workspace 时清空已选资料，避免跨 authority 复用；
- 页面只显示 displayName、mediaType 与 relativePath，不投影 `rootRealPath`、文件内容或文件哈希；
- 资料选择和验证均为真实消费者，不新增无消费者 Contract；
- 未注册的 VS2.1 手写相对路径继续可用，附件 exact identity 规则不把其静默升级为另一种选择语义。

## 4. 开发者验证

- Desktop/Core TypeScript build：PASS；
- focused tests：5 files / 43 tests PASS；
- 覆盖当前 Workspace 限定、DOCX/XLSX/PDF allowlist、添加/移除、相对路径 durable binding、提交前 drift
  fail-closed、Session 零创建、SQLite 原库 reopen 与 read dispatch 前二次 identity validation；
- focused ESLint：PASS（Vue 文件按仓库现有配置不在该 focused ESLint matcher 中）；
- Preload 与 Renderer production build：PASS；
- Core smoke 与 Desktop foundation smoke：PASS；
- VS2.1 historical focused regression：5 files / 23 tests PASS；
- DTP-4 packaging audit 与 audit self-test：PASS；
- migration 仍止 26，lockfile digest 仍为
  `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；未新增依赖或公开 Contract。

## 5. 诚实边界

- 本批不关闭 read 后/write 前崩溃恢复、Task 页业务步骤文案或真实 Electron 联合 E2E；这些属于 VS2.3；
- 本批不声明 production ready，不恢复 Personal Model、Admin mutation、TGM、Knowledge Provider 或 Agent Lifecycle；
- 本批没有新增第二套任务状态机、文件索引、OCR、RAG 或 Knowledge ingestion。

独立 QA P0～P3 全 0 已由用户正式接受，VS2.2 `PASS/CLOSED`。Desktop foundation smoke 的
`fixtureOnly:true` 作为诚实边界保留，不视为真实 Electron 联合 E2E。下一步仅进入 VS2.3 文档评审，不自动编码。
