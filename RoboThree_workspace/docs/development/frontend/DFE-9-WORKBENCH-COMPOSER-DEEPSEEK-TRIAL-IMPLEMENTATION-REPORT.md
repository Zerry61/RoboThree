# DFE-9 Workbench Composer And DeepSeek Trial Implementation Report

> 日期：2026-08-30  
> 状态：**IMPLEMENTED / DEVELOPER VERIFICATION PASS / PRODUCT ACCEPTANCE PENDING / INDEPENDENT QA PENDING**

## 1. 交付范围

- 新建任务输入框提供单一资源入口，容纳添加文件、机器人、技能和知识选择。
- 模型按钮直接表示模型选择，并在同一浮窗中承载 Max 开关。
- 删除“手动复核”“已选资源”和旧“智能调度”展开表单。
- 新增 `pnpm run trial:desktop:deepseek`，用于一次性启动真实 DeepSeek、Central 与 Electron 联合试运行。

## 2. 交互与既有语义

- 资源浮窗复用既有 Catalog、Workspace 和附件选择逻辑，不新增第二套选择状态。
- Model 和 Max 继续使用既有 Workbench ViewModel 与 SubmitTurn 语义；Max 不可用时保持禁用并显示原因。
- Agent、Skill 和 Knowledge 的 fail-closed、显式选择及清空规则未改变。
- 发送按钮固定在输入框工具栏右侧；旧入口不再进入用户可见 DOM。

## 3. DeepSeek 试运行边界

- Key 由终端隐藏读取，只传给 test/internal-trial-only Central 进程。
- Electron 仅收到既有 Central 地址、访问令牌和企业 Model Projection，不收到 Provider Key。
- 不写 Renderer、Preload、SQLite、日志、QA Evidence、仓库文件或 `localStorage`。
- 关闭 Electron 后停止临时 Central，删除临时 userData，并清除启动进程环境变量。
- 本入口不是 Personal Model 配置或持久化能力，不修改公共 Contract、migration、production graph 或 lockfile。

## 4. 验证

- Workbench/DR-2/audit focused：`5 files / 35 tests PASS`。
- Desktop build：PASS。
- Renderer/Workspace lint 与 Architecture boundary：PASS。
- `audit:dtp4`：PASS。
- Central `test-compile` 与交互入口 opt-in focused test：PASS。
- 打包态 `local_demo` 视觉核对：资源浮窗、模型/Max 浮窗无裁切；页面无水平溢出；旧入口零展示。
- `pnpm-lock.yaml` SHA-256 保持 `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。
- 完整 `pnpm run check` 的 lint、Architecture boundary 和 build PASS；Vitest 为 `320 files / 2238 tests PASS`、
  `28 files / 66 tests FAIL`。失败包含当前执行环境的 loopback `EPERM`、isolated Keychain，以及并行 Core 的历史
  版本和消费者边界断言漂移，因此不宣称全仓门禁 PASS，也不在本批放宽这些门禁。

## 5. 尚待补证

需由用户运行 `pnpm run trial:desktop:deepseek`，输入一次真实 Key，并在启动的 Electron 中完成真实对话。之后仍需
独立 QA；本批在真实产品试运行和独立 QA 完成前不得标记 `PASS/CLOSED`。

## 6. repair.1 对话语义修复

- 删除初始通用机器人提示和 Workspace 必选提示；未选工作区时展示“默认工作目录”，SubmitTurn 不发送
  `workspaceGrantId`。附件继续要求真实 WorkspaceGrant。
- Enter 发送，Shift+Enter 换行，IME 组合输入不触发提交。
- 删除本地队列成功文案；SubmitTurn 返回后进入任务对话详情，由真实事件和快照显示 Core 回复。
- 模型浮窗只展示 available Model Projection 名称；真实 internal-trial 模型显示名为 `DeepSeek-V4`。
- focused `3 files / 34 tests PASS`，Desktop build 与打包态 `local_demo` 验证 PASS。

## 7. repair.2 持续会话工作台

- 任务详情改为 Session 级连续消息流，不再只显示当前 Task 的消息；流式回复与 durable message 仍由既有 Desktop
  event 和 Conversation Snapshot 驱动，Renderer 不生成 Assistant 假内容。
- 对话输入框固定在中央消息区底部，Enter 发送、Shift+Enter 换行；发送后在同一 Session 创建新的 durable Task，
  当前页面切换到新 Task 并继续等待 Core 回复，不再跳回新建任务页。
- 右侧成果/工作空间面板保留展开、收起、软件内全屏和既有 pathless Artifact 操作。
- 每轮发送前重新加载当前 Catalog，严格校验上一 Task 的 resolved Agent/Model 仍 runnable、eligible、available；不从
  Task Detail 猜测旧 Skill、Knowledge、Workspace 或附件选择。
- focused `2 files / 25 tests PASS`，Desktop TypeScript 与 Renderer production build PASS，focused ESLint 0 error。

## 8. repair.3 回复渲染与对话布局修复

- 修复 repair.2 的模板条件错误：普通对话不再要求先存在 User Confirmation 才渲染消息；消息滚动容器重新绑定到
  Conversation 区，而不是确认区。
- `message_committed` 独立刷新 Session Conversation Snapshot；Task Detail 查询失败或尚未就绪时，已持久化的 Core
  回复仍可进入页面。详情和会话查询分别使用 request sequence，迟到响应不能覆盖当前 Session。
- 任务详情态去除旧任务管理卡片外壳，改成全高工作台；中间对话和底部 composer 保持稳定，右侧成果/工作空间面板可
  收起、恢复和软件内全屏。窄窗下右侧面板以可收起覆盖层呈现，不把输入框推离当前对话。
- 新增无确认卡片 durable Assistant 回复和 ephemeral → committed 回复回归；focused 更新为
  `2 files / 26 tests PASS`，Desktop TypeScript 与 Renderer production build PASS。

## 9. repair.4 连续选择、新会话与任务导航修复

- 首轮成功提交后，只在 Renderer 当前运行内按 Session 保留实际提交的 Agent、Model、Skill、Knowledge 与 Workspace
  安全标识。后续消息重新通过当前 Catalog 校验并复用该组合，不再把 Skill/Knowledge 无条件清空；不保存路径、Secret，
  不写 LocalStorage，也不扩大为 durable selection Projection。
- Workbench 重新激活且没有显式 follow-up intent 时清空旧 Session、输入和附件；Catalog normalization 不再默认选择
  第一条历史 Session，因此“新建任务”不会回到上一会话。
- Desktop Shell 在提交成功后的 Task 路由变化时自动重载最近任务，不再要求用户点击“刷新”。
- 删除首页空输入提示“输入任务内容后即可提交”和提交后的“本次推理模式”回执卡片；空输入仍不可发送，Max 选择入口
  及其真实能力状态不变。
- focused `4 files / 48 tests PASS`，Desktop TypeScript、production build、focused ESLint 与 `git diff --check` PASS；
  未修改 Main、Preload、Contract、Core、Central、migration、依赖或 lockfile。

## 10. repair.5 同页连续对话与统一输入框

- 首次 SubmitTurn 后不再路由到独立任务管理页；Workbench 直接进入对话态，中央消息区消费真实 Conversation Snapshot、
  Assistant delta 和 Task Detail event，底部继续使用首次发送前的同一个 composer。
- 后续消息始终走 Workbench 的同一 `submitTask` 路径，复用当前 Session 以及首轮已提交的 Agent、Model、Skill、Knowledge、
  Workspace 与 reasoning material；Catalog 刷新后以 submit receipt 恢复权威 Session ID，避免第二轮选择重建造成
  `runtime capability unavailable`。
- 对话页右上角提供成果面板展开/收起按钮；无成果时显示诚实空态。历史任务详情页隐藏成功状态、手工刷新、时间与成果
  统计、推理摘要、内部模型 ID、任务进程和 Tool 调用等工程字段，真实 Artifact 与必要确认操作保持不变。
- Desktop Shell 新增纯 Renderer 导航事件：提交或 Task 状态变化后实时刷新最近任务；用户在当前 Workbench 再次点击
  “新建任务”时显式清空旧 Session，不依赖同路由重新挂载。
- focused `6 files / 72 tests PASS`；Desktop TypeScript、Renderer production build、Architecture boundary 和
  `audit:dtp4` PASS。共享版本保持 `0.0.0-mvp.rsl.1`，lockfile SHA-256 保持
  `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。
- 本批未修改 Main、Preload、Contract、Core、Central、migration、依赖、production graph 或 lockfile；状态保持
  `PRODUCT ACCEPTANCE PENDING / INDEPENDENT QA PENDING`。

## 11. repair.6 单一 Workbench 路由与 Session 级历史会话

- 删除中央任务管理页的产品入口：`/tasks` 只负责把旧 deep link 转发到 `/workbench`，不再加载独立页面。侧栏历史项
  直接打开同一个 Workbench，并继续显示首页相同的 composer、资源浮窗、Model/Max 浮窗和成果面板。
- 左侧列表从 Task 级改为 Session 级：每个 Session 只选取 `updatedAt` 最新的 Task 作为状态摘要，多轮消息不会重复形成
  多条对话。Task 仍保持真实 durable 语义，不在 Renderer 合并或删除后端记录。
- Workbench 可从 `sessionId/taskId` 安全加载 Conversation Snapshot 与 Task Detail；当前运行中已记住的 Selection 才允许
  复用，不从 display text、内部路径或不完整历史字段猜测资源。
- Desktop Shell 固定视口高度，Conversation stream 接管纵向滚动，composer 和成果面板不再随消息数量向页面下方漂移。
- 代码事实核查确认：`agent.general` 要求 `supportsToolCalling: false`，Document Tool Registry 只有 DOCX/XLSX/PDF/PPTX
  能力，没有 HTML/网页写入 Tool。因此本批不能诚实地产出网页 Artifact；该能力必须另立后端 Tool Activation 批次，
  Renderer 不展示虚假 Tool 调用或成功状态。
- focused `7 files / 76 tests PASS`；Desktop TypeScript、Renderer production build、focused ESLint、Architecture boundary
  和 `audit:dtp4` PASS。生产构建已不再产生 `TasksListPage` chunk，lockfile 未修改。
