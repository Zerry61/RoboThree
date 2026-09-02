# Changelog

RoboThree 的重要工程变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

本文件是面向开发协作的摘要，不替代 Git 历史。Codex、Claude Code 和人工开发者开始任务前应先阅读 `Unreleased`，完成有效改动后再更新对应分类。

## [Unreleased]

- Desktop `0.0.0-mvp.wte.1-repair.1` 补齐 CTX/WTE Workbench 终态呈现：当前任务直接显示 Core
  `failureSummary`；输出能力不足提供“选择其他模型并新建任务 / 缩小文件后重试”，不在原 Task 静默换模型，也不展示
  失败 Task 的部分 Artifact。模型进度按 `progressKey` 映射为业务文案，未知阶段降级为通用处理中，不展示 Prompt、
  Token、Compaction identity 或内部摘要；recovering 恢复原会话且不重复提交。

- Root/Core/Desktop/Document Worker `0.0.0-mvp.wte.1` 完成 WTE-1 工作区文本读取与连续编辑：新增
  `tool.workspace.file.read_text`，复用同一个 Document Worker child、既有 Workspace/Policy/Capability Lock、WFW
  `write_text`、EffectCoordinator 与 Artifact。读取执行 256 KiB hard limit、strict UTF-8、路径 containment、symlink/
  hard-link/普通文件检查和 read 前后 stable-stat；当前 user turn 的 exact Tool Result 由 CTX-MVP-1 identity/material
  policy 完整注入，64 KiB 分段无分隔符重组。replace 必须匹配当前 durable read proof；首次外部冲突允许 reread/rebase
  一次，第二次冲突立即停止当前 Attempt，并在 Workbench 提供重新处理、另存、打开和取消。真实 macOS Electron E2E 已
  通过 explicit Workspace、exact read、replace、`.prev`、单一 Artifact head、Markdown preview、Core SIGKILL/SQLite
  reopen 与重启后预览。未新增公共 Contract、IPC/Preload API、migration、依赖、状态机或 lockfile 变化；当前为
  `IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT CODE QA PASS / USER ACCEPTANCE PENDING`。Windows 11
  本地 NTFS WTE 回归已并入现有 WFW/WTE 共用定向待办，是当前唯一关闭阻塞项；真实公网 400K Provider 校准继续作为
  CTX/Provider 独立 P3，不阻塞 WTE-1。当前仍不声明 WTE `PASS/CLOSED` 或 production ready。

- Root/Core/Desktop `0.0.0-mvp.ctx.1`、Central `0.0.0-mvp.ctx.1-SNAPSHOT` 实现 CTX-MVP-1 的
  model-aware context/output 基线：受控 deployment 将 `contextWindowTokens`、`maxOutputTokens` 与
  `capabilityProfileRevision` 锁入既有 Task Model descriptor/binding，历史 Task 继续使用原 1K output 语义，
  新 Task 不再依赖全局 8K/128K 假设。普通任务按 locked output cap 使用最多 8K；WTE full replacement 的
  canonical Tool Call 按当前全文与增长 headroom 预估，超过 locked max output 时在 Provider 前以
  `workspace.file.output_capacity_insufficient` fail-closed，不产生截断 Tool Call。Context budget 改为 2% 有界
  safety margin、动态 headroom 和 per-round exact policy，生产 graph 与 compaction 均使用 calibrated estimator，
  不再实例化 Fake estimator。当前 WTE read result 只由 durable Tool identity 驱动 protected exact 策略，identity
  缺失、重复或漂移均拒绝；Skill references/examples 继续 on-demand。本批复用既有 first/rolling durable compaction，
  50-round Tool-heavy 与 restart 回归通过，故 Continuation Capsule v2 保持 `NOT_REQUIRED/NOT_IMPLEMENTED`。
  未新增公共 Contract、migration、依赖或 lockfile 变化。独立代码 QA P0/P1/P2=0、P3=1 已由用户接受，CTX-MVP-1
  正式 `PASS/CLOSED`，最高 outcome 为 `CTX_MVP1_MODEL_AWARE_LONG_CONTEXT_CONFORMANT`；真实 Provider 校准与
  WTE 长上下文 Electron E2E 继续作为 WTE-1 联合门禁，WTE read/write 连续编辑产品链仍由 WTE-1 单独实现。

- Desktop `0.0.0-dfe.9-repair.12` 将执行中的模型状态收敛为轻量“思考中…”动画和可展开的安全进度列表；列表只消费
  Core 已投影的 `safeSummary`，不展示模型隐藏 reasoning、Prompt、Token 或 Tool 参数。Workbench 对话只保留用户与
  Assistant 消息，Tool observation 的原始 JSON、摘要、路径与 digest 不再作为 RoboThree 回复渲染。

- 完成 MVP-RSL-2 Skill Lifecycle End-to-End：Central PostgreSQL v13 成为 draft revision、test fact、submission、
  immutable release 与 package blob 的唯一 authority；Core/Main/Preload 接入既有 Task、Agent Loop、Runtime Selection、
  WFW 与 exact Skill lock；Desktop 用户创建链和 Admin ZIP/RAR/TAR.GZ/TGZ 上传链均由真实 Adapter/UI 消费。两条串行
  Central + Electron E2E 已分别完成创建/上传、真实 Task 测试、审核/发布、安装、新 Task exact 使用、WFW Artifact 与
  Core `SIGKILL` 后 SQLite 恢复。安装不执行脚本、不安装依赖，不新增第二套 Runtime、文件平台或包管理器。Root/Core/
  Desktop/Contracts/Admin 同步为 `0.0.0-mvp.rsl.2`，Central 为 `0.0.0-mvp.rsl.2-SNAPSHOT`；lockfile 与 Core migration
  26 不漂移。独立只读 QA `PASS_WITH_RISKS`（P0=0/P1=0/P2=0/P3=4）已由用户接受，RSL-2 正式 `PASS/CLOSED`，
  并接受 `MVP_RSL2_SKILL_LIFECYCLE_E2E_CONFORMANT` 与 `MVP_RSL2_ADMIN_UPLOAD_SKILL_E2E_CONFORMANT`。四项 P3
  为环境或预存工程噪声，不归因本批、不建立 repair；本结论不代表 production ready。

- RSL-2 Step 1 在 Desktop 首次消费停手后完成聚焦 re-freeze：`createSkillDraftWorkspace` 专用 receipt 新增必填
  `draftId/workspaceGrantId/displayName`；`submitSkillDraft` 专用 receipt 与 `SkillDetail.submission` 提供 durable
  `submissionId/submissionRevision`；installed Skill list/detail 强制携带 exact `installationRevision`。三项均为现有
  11 个 Desktop 方法的 consumer identity 修正，不新增方法、Contract 版本、后端能力或本地缓存。Contract build、ESLint
  与 focused `1 file / 14 tests` PASS；Desktop 前端可据此恢复编码。

- 完成 MVP-RSL-2 Step 1 Contract / Dependency Freeze：Root/Contracts 升级到 `0.0.0-mvp.rsl.2`，新增 strict
  `@robothree/contracts/skill-lifecycle/v1alpha1`，冻结 Desktop 11 个方法、Admin 10 个方法、`skill.manage` 权限与
  17 个 typed safe error；Admin archive bytes 保持为 strict metadata 之外的 bounded multipart file part。Central
  升级到 `0.0.0-mvp.rsl.2-SNAPSHOT` 并准入 exact `com.github.junrar:junrar:8.1.0`：JDK 21/offline/128MB heap
  下 clean/traversal/CRC/truncated/1GiB-dictionary 5 项 focused proof 全 PASS，生产调用冻结为 InputStream + header +
  synchronous bounded sink，禁止 filesystem facade、shell/native 与额外 reader thread。frozen Contract 11/11 digest、
  lockfile `5b15ae01…874f31` 与 Core migration 26 均不漂移。当前只允许 Desktop/Admin 按 frozen consumer interface
  并行开工；Central/Core/Main/Preload lifecycle 实现与联合 E2E 尚未完成，不宣称 RSL-2 parent closed。

- 新增 MVP-RSL-2 Skill Lifecycle End-to-End docs-only 详细方案：以 Desktop 用户创建、真实 Task/WFW 生成、exact revision
  测试、提交、Admin 审核、immutable release、安装和新 Task exact 消费为主链，同时覆盖 Admin 直接上传
  ZIP/RAR/TAR.GZ/TGZ、安全解析、测试和发布。方案复用既有 Agent Loop、Runtime Selection、Entitlement、Workbench、
  WFW 与 RSL-1 生命周期模式，不建设第二套 Runtime、通用包管理器或文件平台；冻结 48 项 focused QA、两条真实联合
  E2E 和 20 项停手条件。Revision 1.1 进一步冻结 Central pure-JVM RAR reader admission、Skill 包依赖/二进制白名单、
  Skill package 与 Personal Model storage 的物理隔离、Core 主动 pull（禁止 Admin push）和串行 E2E 纪律。当前为
  聚焦复核后进一步明确 historical five + additional no-diff six Contract SHA-256 口径，并要求 Junrar 只使用
  InputStream/header 逐项读取 API、禁止 filesystem extract facade。当前为
  `FOCUSED DIFFERENCE REVIEW PASS / USER ACCEPTANCE PENDING / CODING GATED`，未修改生产代码、Contract、migration、
  依赖、版本或 lockfile。

- Root/Core/Desktop `0.0.0-mvp.safe-progress.1` 接通模型执行的安全实时进度：Agent Loop 在上下文准备、模型请求发出、
  Provider stream 启动、首个回复片段和首个 Tool Call 五个阶段，复用既有 `progress_delta` 发布 content-free
  `progressKey + safeSummary`；Workbench 在当前 Task 执行区展示最新安全摘要，并在消息提交、终态或 replay reset 后清理。
  原始 reasoning/thinking、Token、Prompt、Tool 参数和内部路径均不进入 Desktop；未新增 Contract、IPC、migration、依赖
  或持久化状态。

- Desktop Workbench 在同一 `0.0.0-mvp.safe-progress.1` 基线上完成输入区体验收口：删除重复标题、底部默认工作区/通用
  机器人说明和快捷任务按钮；未选择工作区时只在输入框内提供“选择工作空间”，选择后自动隐藏；授权方式改为真实
  `智能授权 / 主动询问 / 始终授权` 任务偏好。用户消息在提交请求发出时立即进入会话，输入框可继续编辑；终态不再保留
  已处理时长、成功占位步骤或 `Action succeeded` 噪声。页面仅消费真实安全进度，不推断模型隐藏思考过程。

- Desktop `0.0.0-dfe.9-repair.11` 优化 Workbench 长任务交互：发送按钮和输入框不再承担模型执行 loading；会话流改为
  消费真实 Task Step 与 Tool Activity，展示“分析任务”“生成演示文稿”“写入工作区文件”等安全过程、已处理时长和
  终态。内部 action/tool 标识、原始异常和模型隐藏推理不进入用户界面；没有真实投影时不伪造详细过程。

- Root/Core/Central `0.0.0-mvp.task-timeout.1` 修复真实 PPTX 任务可被持续 SSE 片段无限续命的问题；Desktop 的本批
  presentation 修复已包含在当前并行版本 `0.0.0-dfe.9-repair.11`：
  Central transport 使用 90 秒 response-start timeout，SSE reader 同时执行 30 秒 idle timeout 与绝对 provider
  deadline；持续有有效数据的模型调用最多可运行 15 分钟。企业 Agent Turn 使用一个 30 分钟 durable hard deadline，后续模型轮次与 compaction 只能消费剩余时间，
  不能各自重新获得完整任务预算。Core production scheduler 现在按任务 deadline 派发既有 `expire_deadline`，Core 重启遇到已过期任务也会先
  落为 `timed_out`；Desktop 显示“任务执行超时，可重试”。真实交互试运行关闭后新增 Task 终态 + 新 PPTX 文件双重
  后置验证，不再把用户关闭 Electron 当成任务成功。未新增 Contract、migration、依赖、状态机或公开 API。

- 用户确认 WFW 当前产品开发工作完成，可进入下一项 MVP 任务。WFW-1、WFW-2、repair.1、repair.2 均已关闭，macOS
  产品链已通过真实 Electron E2E；Windows 11 本地 NTFS 门禁转入定向回归 backlog，不再阻塞后续开发排期。该延期不
  等同 Windows PASS，父 WFW-3 继续保持 `STAGE NOT CLOSED / NOT PRODUCTION READY`。

- WFW-3 repair.2 已完成两项极小接缝修正：Core 从 source Task 的 durable readable Runtime Selection 恢复 exact
  WorkspaceGrant authority，不再要求私有 grant 出现在模型可见 Step；Renderer 只允许 `http://127.0.0.1:*` iframe，
  APV response 只允许 packaged `file:` ancestor，其余 APV-1C inert CSP 保持不变。packaged Electron/Chromium 的双向
  CSP focused proof 与真实 iframe document load 均通过；macOS WFW-3 E2E 完整覆盖 default/explicit Workspace、
  create/replace/`.prev`、Artifact、Core SIGKILL/reopen 和重启后预览。独立代码 QA P0/P1/P2=0，外部 P3 不归因；
  用户已正式接受并关闭 repair.2，176/179 数量差作为超集精度记录。父 WFW-3 仍因 Windows 11 本地 NTFS 门禁未完成
  而保持 `NOT CLOSED`。Windows 执行暂缓至后续 Windows 客户端回归窗口，已新增定向回归说明固定真实 Windows 11、
  本地 NTFS、create/replace/`.prev`/Artifact/Core restart/SQLite reopen/cleanup 与 tests-only 驱动适配要求。

- WFW-3 repair.1 已完成 Task-generated Workspace HTML preview authority 的最小 Main 修复：Core source authority
  成功后不再因 `taskId` 一票否决，继续复用 contained-file、stable-read 与 APV-1C sandbox；focused preview
  `4 files / 67 tests PASS`，私有 task/root/grant/path/content 不进入 Renderer-safe response。恢复父真实 Electron E2E
  后确认 default `index.html` 已真实落盘、投影并创建 preview session，但又发现两个边界外阻塞：WFW-2 Replace authority
  错从模型可见 durable Step 读取私有 `workspaceGrantId`，导致 exact digest 仍报 `artifact_head_mismatch`；Renderer 顶层
  CSP 以 `ERR_BLOCKED_BY_CSP` 阻止 loopback APV iframe 实际加载。已再次停手，不弱化 proof、不伪造 iframe ready；
  独立聚焦代码 QA P0～P3 全 0 后已获用户接受并正式 `PASS/CLOSED`。WFW-3 与 Windows NTFS gate 均未关闭；剩余
  source Task durable WorkspaceGrant authority 与 loopback APV CSP/real-load proof 已形成 repair.2 极小方案，当前只进入
  独立文档复核，不自动编码。

- 新增 WFW-3 Desktop Product E2E / Stage Closure docs-only 详细方案：严格限定 Renderer Workbench pure presentation、
  既有 TasksAdapter/APV preview 消费、一个真实 Electron driver 与一个 Windows 本地 NTFS 最小门禁；Core/Main/Preload/
  Document Worker production 改动预期为 0，发现需要即停手回评审。方案覆盖默认 `~/.robothree` 与显式 Workspace、
  create/owned replace/`.prev`、Artifact preview、Core SIGKILL/reopen、uncertain 安全呈现和 10 类资源归零；只保留
  24 项 focused QA，不建 Evidence schema 或关闭账本。计划评审已通过并获编码授权；当前实现因 Task-generated HTML
  preview authority 缺口按方案暂停，等待 repair.1 文档评审。WFW-H1 继续 GATED。

- Root/Core/Document Worker `0.0.0-wfw.2` 完成 WFW-2 Core activation：新增独立 WFW Registry/binding/`query_then_retry`
  descriptor，但与 existing Document handle 共享同一个 Worker PID 与 single-flight；private inspect 将 `safe_retry`
  精确转换为 existing `not_found`，可证明发布成功时形成稳定 recovered Observation。Replace authority 只接受同一 durable
  Session 的唯一 terminal WFW Artifact head，分叉、重复摘要、删除、过期或非 WFW 来源全部 fail-closed。成功结果自动投影
  html/markdown/text Artifact，正文、root、grant、proof 与 `.prev` 不进入用户表面。未新增 Contract、migration、依赖或
  lockfile 变化。独立 QA 的 VS1.1 旧四项 Tool 期望经用户授权做 tests-only 同步后，聚焦 re-QA 为 P0/P1/P2=0，用户已
  正式接受并关闭 WFW-2；外部 P3 不归因、不建立 repair。WFW-3/WFW-H1 继续 GATED。

- Document Worker `0.0.0-wfw.1` 完成 WFW-1 私有 UTF-8 文本 Writer：只在私有 v1alpha2 协议接受精确
  `tool.workspace.file.write_text`，支持既有父目录内的 `create_new`、带 exact prior digest 与 owned Artifact 私有证明的
  `replace_existing`、同目录临时文件 fsync、no-clobber/atomic publication 和一层 `.prev`。路径、symlink、hard-link、
  UTF-8 字节上限、request digest 与四个崩溃窗口均 fail-closed，发布后不确定状态由 postcondition inspector 区分
  `safe_retry / recovered_success / unknown`。本批没有激活 Core Registry、没有 Renderer 消费者，也未新增 Contract、
  migration、依赖或 lockfile 变化；WFW-2 已在后续独立 QA 和用户接受后 `PASS/CLOSED`，WFW-3 继续 GATED。

- WFW-0 docs-only 方案推进至精简 Revision 1.1：保留 `tool.workspace.file.write_text`、UTF-8 create、带摘要 CAS 的
  replace、一层 `.prev`、Workspace 路径安全、Policy/Approval、EffectCoordinator、Artifact、四个关键崩溃窗口和
  uncertain 语义；父目录创建、parent fsync/断电级 durability、穷尽 fault matrix 与扩展平台矩阵后移至 WFW-H1。
  v1 replace 仅接受 Core 从 durable WFW Artifact 证明的 exact revision，按 `routine_file` 允许 Policy 自动放行，
  不通过确认覆盖任意既有用户文件；外部编辑器最终 digest-check/rename 竞争窗口明确为 best-effort residual risk。
  WFW-3 增加真实 Windows 本地 NTFS create/replace/`.prev`/restart 冒烟，完整平台矩阵继续后移。总工期保持
  3～5 个集中工程日；WFW-1/WFW-2 已在后续实现、独立 QA 与用户接受后 `PASS/CLOSED`，WFW-3 仍 CODING GATED。

- Desktop DFE-9 repair.10 修复客户端导航与 Max 接入：知识中心使用直接 RouterLink，用户菜单设置通过显式路由跳转，
  避免弹层关闭与导航处理竞争；通用机器人在 Max 预览边界解析为既有 `agent.general`，可真实调用 v1alpha5
  preview/preference 接口并保存 Max 选择。机器人失效恢复态继续 fail-closed，不新增接口或前端假状态。

- Desktop DFE-9 repair.9 在 Core durable Task 状态确认 `cancelled` 后，于当前对话显示“任务已终止”，并恢复继续输入；
  receipt 接受到终态确认之间仍显示“正在终止”，不伪造取消成功。未显式选择工作区时，页面统一显示“RoboThree 默认
  工作区”，Renderer 继续省略 `workspaceGrantId`，由既有 Main 默认授权绑定 `~/.robothree`。

- RSL-1 repair.1 接通本地试运行的真实机器人生命周期服务：显式 test/internal-trial Central 组合现在同时提供 Model
  Gateway 与 Agent Lifecycle PostgreSQL v12 路径，并使用短期、仅含 `agent.manage` 的 Main/Core 私有内存 Token。
  Robot 创建页与智能中心在真实可用性检查成功前保持 fail-closed，失败时明确提示并提供“重新连接”，不使用 Fake、
  LocalStorage 或乐观成功代替 Central。真实 Electron 联合 E2E 已完成两次草稿 revision、真实 Task 测试、提交、Admin
  审核、Catalog 刷新、Workbench 使用和 Core `SIGKILL` 后 exact Agent lock 恢复；未修改公共 Contract、migration、依赖
  或 lockfile，submission identity P1 继续独立保留。真实 Central 组合与 Central + Electron 联合 E2E 已由 Claude
  Code 独立复跑 PASS，用户已正式接受，RSL-1 repair.1 当前为 `PASS/CLOSED`；workspace 全量门禁外部 blocker 作为
  非阻断 P3 保留，不建立本批 repair。

- Desktop DFE-9 repair.8 为长任务补充真实执行反馈：对话流显示 Core Task 当前状态和动态已处理时长，非终态任务把
  发送按钮替换为终止按钮；终止操作复用既有 `cancel_task` 并携带 exact task revision，等待 durable 状态确认，
  不在 Renderer 伪造进度百分比或取消成功。新增页面级回归锁定执行态反馈、按钮切换和真实取消命令。

- Central `0.0.0-mvp.multiturn.1` 修复真实多轮会话在第二/第三轮停止回复的两处根因：SSE 投影现在一次排空已到达的
  `started/text_delta` 事件后再投影 durable terminal，避免快速 Provider 的 `completed` 抢在文本前结束 Core 消费；
  Prompt Cache 静态前缀不再纳入每个请求都会变化的 `core.request-context.v1` 和每个 Task 都会变化的
  `core.instruction-bundle.v1`，同时继续校验真正静态的 system/tool material。新增同一 Session 连续 5 轮真实
  Electron → Main/Preload → Core child → Central HTTP/SSE 回归，五轮均产生 durable Assistant 回复；未修改公共
  Contract、migration、Desktop API、生产部署图、依赖或 lockfile。

- MVP Workspace Output 修复默认与显式工作区写入：用户未选择工作区时，privileged Main 在首次提交前创建并复用
  `~/.robothree` 的真实 `read_write` WorkspaceGrant，真实路径不进入 Renderer；用户已选择工作区时原 exact grant 保持
  优先，不会被默认目录覆盖。Core 同时允许 code-owned `agent.general` 使用现有 DOCX/XLSX/PDF/PPTX Document Tool
  候选，修复“选了文件夹但通用机器人仍无法创建 PPTX”。未新增 Contract、migration、依赖、状态机或文件平台。

- DFE-9 repair.7 修复多轮会话错误锁定：Workbench 现在按真实 Task 状态判断是否可接收下一条消息，`waiting_input`、
  `completed`、`failed`、`cancelled` 与 `timed_out` 允许同一 Session 继续提交，运行中、等待确认、恢复及人工处理状态
  仍 fail-closed。新增页面级三轮连续发送回归，验证第三条消息沿用原 Session、Agent、Model 和显式 Skill；同时修正
  空输入时发送按钮的禁用判断。本批未修改 Core、Contract、Main、Preload、migration、依赖或 lockfile。

- MVP-RSL-1 完成机器人生命周期最短真实闭环：Desktop 用户创建并测试个人机器人草稿，提交 immutable revision，
  Admin 审核后由 Central 发布企业机器人，Desktop Catalog 随后消费同一 exact Agent revision 并在 Core `SIGKILL`
  后从原 SQLite 恢复。新增 consumer-driven `agent-lifecycle/v1alpha1` 与 Central PostgreSQL v12 deployment set，
  复用既有 Task/Agent Loop/Runtime Selection/Entitlement，不建设第二套运行时。Main 仅以内存 `Buffer` 保留
  internal-trial `agent.manage` Token 供 Core restart，并在退出时清零；Root/Core/Contracts/Desktop/Admin 版本推进至
  `0.0.0-mvp.rsl.1`。当前为 `PASS/CLOSED — CODE_QA_PASS / USER ACCEPTED`，不代表 production ready，也不解锁
  Skill Lifecycle、Knowledge、TGM、Personal Model 或 SSO/RBAC。

- DFE-9 repair.6 移除可达的中央任务管理页面：`/tasks` 只兼容重定向到 Workbench，侧栏历史项直接打开同一个对话工作台。
  最近列表按 Session 聚合，仅展示每个会话最新 Task，避免多轮消息在左侧形成多条记录。Desktop Shell 固定为视口高度，
  Workbench 消息区独立滚动、输入框固定在底部；历史会话继续使用首页相同的资源、Model、Max 和发送组件。本批确认
  `agent.general` 在 Core 中为 `supportsToolCalling: false`，且不存在 HTML/网页写入 Tool；因此未伪造网页 Artifact 或
  Tool Activity，该能力需后续独立后端批次交付。

- DFE-9 repair.5 将首次提交和连续对话统一到同一个 Workbench：首次 SubmitTurn 后不再跳转任务管理页，中央区域直接展示
  真实 Conversation Snapshot 与流式 Assistant 回复，底部持续复用同一个资源、Model、Max 和发送输入框；后续消息复用
  同一 Session 及首轮真实选择，避免第二轮因选择重建触发 runtime capability unavailable。右侧成果面板改为右上角按钮
  控制的动态区域；旧任务详情隐藏成功状态、刷新、时间/成果计数/推理摘要、内部模型标识、任务进程和 Tool 调用等工程字段。
  侧栏“新建任务”在当前路由内也会显式开启空白会话，最近任务在提交和状态变化后实时刷新。本批不改 Main、Preload、
  Contract、Core、Central、migration、依赖或 lockfile。

- DFE-9 repair.4 修复连续对话与新建任务的 Renderer 状态串用：首轮成功提交后在本次应用运行内保留同一 Session 的
  Agent、Model、Skill、Knowledge 和 Workspace 安全标识，后续消息复用这些真实选择，不再因 Skill 丢失触发
  runtime capability unavailable；重新进入“新建任务”会清空旧 Session，只创建新会话。侧栏最近任务在提交后的
  Task 路由变化时自动同步；首页删除空输入提示和“本次推理模式”回执卡片。

- DFE-9 repair.3 修复持续会话页不显示普通模型回复的问题：消息流不再错误依赖“存在确认卡片”，流式 Assistant
  delta 与 durable Conversation Snapshot 分别刷新，Task Detail 暂时不可用也不会阻断已持久化消息更新。任务详情态
  同时从旧任务管理卡片改为全高对话工作台，中间消息区和底部输入框保持固定，右侧成果/工作空间面板可收起、展开和
  软件内全屏；同一 Session 后续发送仍创建独立 durable Task，不伪造 Assistant 内容。

- DFE-9 repair.2 将任务详情改为持续会话工作台：中央消息区展示同一 Session 的完整持久消息与实时回复，底部
  输入框固定可连续发送；每轮仍通过既有 SubmitTurn 创建独立可恢复 Task，并在当前页面切换到新 Task，不再跳回
  新建任务。右侧成果/工作空间面板保留展开、收起和软件内全屏；每轮提交前重新校验当前 Agent/Model Catalog，
  不新增 Contract、IPC、Core 状态、持久化或 Renderer 假回复。

- DFE-9 repair.1 将 Workbench 收敛为真实对话语义：默认对话不要求 WorkspaceGrant，Enter 发送、Shift+Enter 换行；
  SubmitTurn 接收后直接进入任务对话详情并由真实 Core 事件/快照展示回复，不再显示“已进入本地运行队列”。删除初始
  通用机器人提示，模型浮窗只列 available Model Projection 名称，internal-trial 模型显示为 `DeepSeek-V4`。附件仍
  必须使用受控 WorkspaceGrant；未新增 Contract、IPC、migration、持久化或 secret 路径。

- Desktop `0.0.0-dfe.9` 将新建任务输入框收敛为两个真实浮窗：单一“+”入口管理文件、机器人、技能与知识，
  模型按钮管理真实 Model 选择与 Max；发送按钮固定在输入工具栏，删除“手动复核”“已选资源”及旧智能调度表单。
  新增 `pnpm run trial:desktop:deepseek`，以 test/internal-trial-only Central 在进程内消费一次 DeepSeek Key 并打开
  真实 Electron，关闭后清理临时状态。未新增 Contract、IPC、migration、production graph、依赖或 lockfile 变化。

- Root/Core/Contracts/Desktop/Admin 推进至 `0.0.0-mvp.admin.vs1`，Central 推进至
  `0.0.0-mvp.admin.vs1-SNAPSHOT`：新增 additive `admin-control/v1alpha2`、Central PostgreSQL v0011
  managed model/default/audit/immutable Gateway binding、AES-GCM Credential、五个精确 Admin 模型 command、
  internal-trial 安全 discovery，以及 Desktop exact model consumption。真实 Electron 受控 E2E 已验证 Admin 默认
  模型发现、专项 Agent/Skill、Gateway HTTP/SSE、PPTX 与 Core `SIGKILL` 后 SQLite 恢复；原 VS1 E2E 回归 PASS。
  lockfile 仅恢复 Admin 既有 `@robothree/contracts: workspace:*` importer（`c47641ac…` → `5b15ae01…`），没有新增
  registry 包。
  独立联合代码 QA 为 `CODE_QA_PASS`（P0=0、P1=0、P2=0、P3=1），用户已接受并正式关闭
  ADMIN-MVP-VS1；P3 Desktop workspace 全量门禁历史 blocker 作为非阻断外部欠账保留，不建立 ADMIN repair
  批次。本次关闭不代表公网 Provider、production identity/SSO/RBAC 或 production ready，且不自动解锁下游。详见
  [联合实施报告](./docs/development/ADMIN-MVP-VS1-JOINT-IMPLEMENTATION-REPORT.md)。
- DFE-8A/8B 按通过产品聚焦复核的
  [DFE-8.0 本地演示登录与设置原型对齐方案](./docs/development/frontend/DFE-8.0-DESKTOP-DEMO-LOGIN-SETTINGS-PROTOTYPE-ALIGNMENT-PLAN.md)
  完成 Renderer 实现：只有显式 `local_demo` 注册公开演示账号 `admin/123456` 的内存入口；设置固定为模型管理、
  个性化、个人记忆和问题反馈四页。模型页消费既有企业/平台与个人模型只读 Projection，不建设 mutation/Key 表单；
  个性化和记忆只在演示模式本页预览并随离页清除；正式反馈不读取附件也不伪造提交。Repair.1 修复 680px 窄窗
  隐藏整个用户菜单的问题：紧凑侧栏始终保留头像入口，设置与退出登录均可操作，菜单向内容区展开且不产生水平溢出；
  focused 更新为 11 files / 42 tests，并用显式 `local_demo` 打包态入口完成复验。当前为
  `PRODUCT RE-ACCEPTANCE PASS / USER ACCEPTED / INDEPENDENT QA PENDING / NOT CLOSED`，未修改 Main、
  Preload、Contract、Core、Central、migration、依赖或 lockfile。
- Admin Console 在 package version 保持 `0.0.0-afe.6c`、lockfile 不变的前提下完成 MVP VS1 模型管理前端接线并经用户接受关闭：新增
  `admin-control/v1alpha2` managed model Adapter 读取与 5 个模型写方法消费，落地模型列表、搜索、生命周期筛选、
  详情、新建、编辑、连接校验、启停和设为默认入口。访问密钥仅显示 `已配置 / 未配置`，创建/替换只经受控
  Adapter 提交；删除、供应商插件、用户范围、其他模块 mutation、TGM 和 production identity 继续 GATED。
  独立代码 QA 结论为 `CODE_QA_PASS`（P0=0、P1=0、P2=0、P3=1，P3 为非 Admin 范围外部 blocker），用户已接受
  ADMIN-MVP-VS1 Frontend 子批 `PASS/CLOSED`；联合 VS1 仍等待 AM1-B 后端与端到端 E2E。详见
  [实施报告](./docs/development/ADMIN-MVP-VS1-FRONTEND-MODEL-MANAGEMENT-IMPLEMENTATION-REPORT.md)与
  [独立代码 QA 报告](./docs/development/qa/admin-mvp-vs1-frontend-code-claude-qa.md)。
- Central `0.0.0-dr.2-repair.3-SNAPSHOT` 修复实际 OpenAI-compatible Provider 的 Tool 往返协议：流式 Tool
  arguments 保留合法空白片段，第二轮请求恢复 `assistant.tool_calls` 与 `tool.tool_call_id`，不向 Provider 泄漏
  RoboThree 私有 digest/outcome 字段。DeepSeek 首轮 Tool Call、PPTX Tool Result 后的第二轮请求不再因错误 wire
  shape 返回 4xx。Provider focused、Central online/offline 各 442 tests 和受控 Electron 两轮模型调用/PPTX/重启
  恢复均 PASS；2026-08-30 真实 DeepSeek 最终复跑进一步取得
  `MVP_VERTICAL_SLICE_1_E2E_CONFORMANT`，真实生成 72,242-byte PPTX，并在 Core `SIGKILL` 后恢复 Assistant、
  Artifact 与 Tool Activity。本批不修改公共 Contract、migration、Main、Preload、Renderer、production graph、
  依赖或 lockfile；用户已接受真实验证结果，DR-2 正式 `PASS/CLOSED`，但不代表 production-ready。
- Root/Desktop `0.0.0-mvp.vs3` 完成“已完成任务继续修改 / 成果修订版”垂直闭环：Task 页从 durable completed
  detail 进入同 Session 新 SubmitTurn，Renderer one-shot intent 不持久化；旧 Agent/Model 仅经当前 Catalog
  exact validation 后作为候选，Workspace/Skill/Knowledge 由用户显式重新选择。真实 Electron E2E 已创建两个
  Task 和两份不互相覆盖的 PPTX，并在第二次 Core `SIGKILL`、新 runtime identity 与原 SQLite reopen 后分别恢复
  preview。没有新增 Contract、Core/Main/Preload 生产接缝、migration、依赖或成果版本平台；独立 QA
  `P0=0/P1=0/P2=0/P3=0` 已由用户接受，VS3 正式 `PASS/CLOSED`，最高 outcome
  `MVP_VS3_COMPLETED_TASK_FOLLOW_UP_E2E_CONFORMANT` 已接受。本次关闭不代表 production ready，Personal Model、
  Admin mutation、TGM、Knowledge Provider 与 Agent Lifecycle 继续 GATED。详见[方案](./docs/development/MVP-VS3-COMPLETED-TASK-FOLLOW-UP-ARTIFACT-REVISION-DEVELOPMENT-PLAN.md)
  与[实施报告](./docs/development/MVP-VS3-COMPLETED-TASK-FOLLOW-UP-ARTIFACT-REVISION-IMPLEMENTATION-REPORT.md)。
- Root/Core `0.0.0-mvp.vs2.3` 完成 VS2.3 repair.3 Tool-generated Artifact Preview Authority：focused proof
  证明真实 v1alpha4 Task 在 Tool payload 无 `workspaceGrantId` 时被 legacy-only selection loader 拒绝；仅将 Artifact
  source authority 切换为既有 readable union，并补充 v1alpha4 restart regression。未修改 Main/Preload/Renderer
  production routing、公开 Contract、migration、依赖或 lockfile。同一真实 Electron E2E 现已通过 Core SIGKILL、
  SQLite reopen、DOCX read、PPTX write、Task 两段业务步骤与恢复后 PPTX HTML preview。独立 QA P0～P3 全 0
  已由用户接受，repair.3、父 VS2.3 与 MVP-VS2 正式 `PASS/CLOSED`；最高结论仅为
  `MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT`，不自动解锁下游。
- VS2.3 repair.2 已按用户选择的方案 A 完成 internal legacy/V2 invocation deadline authority：两种 strict record
  均 additive 接受可选 deadline，统一纳入 record digest 与 prepared-link 四态比较；historical 缺字段可读，active
  recovery 缺字段 fail-closed。聚焦 `6 files / 73 tests` 与 Core/Desktop typecheck PASS。恢复同一真实 Electron E2E
  后，一次 accept、两次 SSE subscription、DOCX read、PPTX write、round-3 与 Task completed 均成立；最终 PPTX
  HTML 预览在 Artifact source 解析返回 `task.not_found`。按 VS2.3 停手条件，不修改 Core/Main production logic，
  父批继续 paused，等待极小预览来源 authority 评审。repair.2 独立代码 QA P0～P3 全 0 已由用户正式接受，
  子批现为 `PASS/CLOSED`，不自动关闭父 VS2.3。
- Desktop `0.0.0-dfe.run.1.repair.2` 将新建任务页重构为居中式对话工作台：任务描述、工作区、资料、审批提示、
  智能调度和发送按钮进入同一 composer，高级机器人/模型/Max/资源选择按需展开；快捷能力收敛为轻量标签与任务行。
  智能中心机器人、技能和工具详情改为独立子路由页面，列表页不再内嵌详情面板；侧栏无内容时不展示置顶/空间空区块。
  本批只调整 Renderer、测试及 Desktop 治理基线，不新增后端接口、Contract、IPC、持久化、依赖或 lockfile 变化；
  当前为开发者验证通过、产品复验与独立 QA 待执行。
- Root/Core/Desktop `0.0.0-mvp.vs2.2` 完成 Workbench 资料附件与 durable file selection：用户只可从当前
  active/read-write Workspace 添加 DOCX/XLSX/PDF，Renderer 仅获得安全相对路径；提交前 Main 重新计算文件身份并
  复用既有 manual Artifact/SQLite registration，文件漂移时以 `artifact.source_changed` 在 Session/Task 创建前
  fail-closed。Document read Tool 在 execution build 与 effect dispatch 前再次核对持久化 SHA-256/size。
  SubmitTurn v1alpha5、公开 Contracts、migration、依赖、lockfile 和既有任务状态机不变；VS2.3 恢复/真实 Electron
  联合 E2E 尚未关闭。独立 QA P0～P3 全 0 已由用户正式接受，VS2.2 现为 `PASS/CLOSED`；Desktop foundation
  smoke 的 `fixtureOnly:true` 继续只作为 fixture 冒烟，不冒充真实 Electron E2E。VS2.3 docs-only Revision 1
  修正 round-2 为相同 `clientRequestId` 的新 transport accept；按正常 read/write/final 三轮加一次 round-2 重发，
  请求计数为 1/2/1、总计 4；禁止生产 barrier/错误 seam，并把 focused QA 从
  48 项收缩为 24 项。用户随后正式接受 Revision 1 并授权编码；Task 页 pure projection 与 focused tests 已完成，
  但真实 Electron E2E 发现 Main 把含 `workspaceGrantId` 的 picker 扩展命令原样传入 frozen strict base command，
  导致“添加资料”返回 `contract.invalid`。该问题必须修改 Main production logic，已按授权边界停手；VS2.3 当前为
  `IMPLEMENTATION STOP / CODING PAUSED`，等待最小 command narrowing 聚焦修复授权。
- Root/Core `0.0.0-mvp.vs2.1` 完成 VS2.1 Workspace Source Read：`agent.presentation` 从单一 PPTX write 扩展为
  DOCX read、XLSX read、PDF text read 与 PPTX write 四项 exact Tool allowlist；internal-trial Registry、
  Entitlement、permissions、acceptance lease、Tool Policy 与 Capability Lock 支持多 Tool refs。真实 focused
  integration 已证明工作空间 DOCX 正文经 Tool Observation 进入下一轮模型请求，随后生成 PPTX，并在 Task detail
  同时留下读取和生成活动。本批不新增 Contract、migration、依赖、Renderer 或第二套状态机；独立 QA 与用户接受
  已完成，VS2.1 正式 `PASS/CLOSED`。
- 用户更正 VS1 Demo Readiness 不属于产品开发主线：Root 版本恢复为 `0.0.0-mvp.vs1.3`，无密钥预检命令和
  external-gateway E2E 模式作为可选辅助工具保留，不要求彩排、演示版本冻结或真实 Provider 冒烟先于后续开发。
  下一条产品主线转为 VS2 工作空间资料读取到成果：先让已授权工作空间中的 DOCX/XLSX/PDF read Tool 进入真实
  Agent selection/lock/execution，再接客户端附件选择，不新增通用文件平台、第二套任务状态机或下游治理能力。
- 用户正式接受 MVP-VS1.3 Electron launch-environment 最终聚焦 re-QA：VS1.2、VS1.3 与 MVP-VS1 engineering
  conformance 现为 `PASS/CLOSED`，确认 `MVP_VERTICAL_SLICE_1_E2E_CONFORMANT`。受控 Gateway fixture 不冒充实际
  Central + 真实模型演示就绪；`MVP_VERTICAL_SLICE_1_USABLE`、签名安装包和 production ready 均未声明，下游继续 GATED。
- 修复 Electron 启动环境污染：VS1 E2E、Desktop 产品 Main 与 Preload smoke 启动命令显式清除
  `ELECTRON_RUN_AS_NODE`，避免 QA/父 shell 把 Electron 误切为普通 Node；当前 ESM 入口使用 Electron named imports，
  真实 Electron E2E 与 production Preload smoke 已复跑通过。
- Root/Core/Desktop `0.0.0-mvp.vs1.3` 完成 VS1.3 真实 Desktop 垂直闭环：Electron Main 精确消费并删除
  internal-trial deployment/Token 环境值，以 privileged memory lease 支持 Core 自动重启；真实 Renderer 工作台选择
  专项 Agent、企业 Model 与显式 Skill 后，经两轮 Gateway HTTP/SSE 调用生成 PPTX，并在任务页显示回复、Tool 活动与
  成果。真实 `SIGKILL` 后使用同一 SQLite 恢复相同内容；不新增 Contract、migration、依赖或下游能力。
- Core `0.0.0-mvp.vs1.backend.2` 完成 VS1.2 Agent / Skill / PPTX Tool 真实接线：internal-trial composition
  加法启用 CPC，新增 code-owned `agent.presentation` 与受信仓内 `skill.presentation-planning`，并把 PPTX Tool exact
  ref 贯通 Registry、Entitlement、Workspace/Authorization、Policy 和 Capability Lock。Gateway HTTP/SSE 返回的真实
  Tool Call 现可经 provider-safe machine name 映射、`finishReason=tool_calls` 和 readable v1alpha4 selection 驱动
  Document Worker 生成真实 PPTX，再把 Tool Result 送入第二轮模型调用并投影 completed Task/Tool activity/Artifact。
  focused 3 files / 37 tests、CPC/R2D/Document 回归 10 files / 88 tests、Core typecheck、focused ESLint、DTP-4 audit
  均 PASS；migration 26、lockfile 不变。当前为开发者验证通过、独立 QA 待统一执行；VS1.3 真实 Electron/重启 E2E
  继续进行，不单独声明 `MVP_VERTICAL_SLICE_1_USABLE`。

- Core `0.0.0-mvp.vs1.backend.1` 完成 VS1.1 后端真实企业 Model composition：新增 strict internal-trial
  deployment 与一次性内存 Token Provider，将同一 exact Model 接入 Catalog/liveModels、Entitlement、Runtime
  Selection v1alpha4、Capability Lock、Runtime Adapter Handle、durable Enterprise Provider/Invocation Link；默认
  reasoning 复用 v1alpha4 lock 并保持 passthrough，不安装 Max release。真实 loopback HTTP/SSE Gateway + SQLite
  stop/reopen 集成测试已证明纯文本回复与 Conversation 恢复。无 deployment/token 时继续 FailClosed，不新增
  Contract、migration、依赖或 lockfile 变化。独立 QA 实测 5 files / 21 tests、Central online/offline 438/438、
  typecheck、focused ESLint 与 DTP-4 全 PASS，已由用户接受并正式关闭；VS1.2/VS1.3 联合授权继续有效，整体 MVP 仍未关闭。

- Desktop `0.0.0-mvp.vs1.frontend.1` 完成 VS1.1 前端 Model availability fail-closed 子项：Workbench 在模型目录全不可用时
  不再允许通用机器人提交；已明确选择的模型刷新后不可用时清空模型选择并禁用提交，不自动回退到默认模型或其他全局模型。
  本批只改 Renderer/测试和 Desktop 版本治理，不修改 Main、Preload、IPC、Contracts、Core、Central、Document Worker、
  migration、依赖或 lockfile；VS1.1 后端真实 Model 组合与联合 E2E 仍未关闭。

- 新增 docs-only
  [MVP-VERTICAL-SLICE-1 真实任务垂直闭环联合实施方案](./docs/development/MVP-VERTICAL-SLICE-1-REAL-TASK-END-TO-END-DEVELOPMENT-PLAN.md)：
  将当前最高优先级从 Personal Model/Contract/Stage Closure 调整为普通 Desktop 的真实企业 Model → Platform/Agent
  Prompt → 显式本地 Skill → `tool.document.pptx.write` → Artifact → restart 恢复闭环。方案复用既有 Enterprise
  Provider/Gateway、CPC、Agent Loop、Document Worker、Task/Artifact 与 Desktop 页面，按 VS1.1～VS1.3 在 6～9 个
  集中工程日联合交付，只进行一次计划评审、一次编码和一次独立 QA。联合评审后的 Revision 1 已吸收真实输入、
  Token 唯一路径、Agent/Skill/Tool exact lock、重启收敛、Admin 零触碰和逐项 DoD 证据，同时拒绝重新扩张关闭框架。
  当前为 `PLAN REVIEW PASS/CLOSED / JOINT CODING AUTHORIZED；VS1.1 PASS/CLOSED / VS1.2 IN PROGRESS`；DFI-4A.4.2 repair.1、DFI-4A.4.3、Personal Model、Admin、TGM、
  Knowledge、Agent Lifecycle 和无真实消费者的新 Contract 版本均暂停/GATED。本轮不修改代码、Contract、依赖、
  migration 或 lockfile。

- 新增 docs-only
  [DFI-4A.4.2 repair.1 Public Mutation Identity Contract 聚焦方案](./docs/development/frontend/DFI-4A.4.2-REPAIR.1-PUBLIC-MUTATION-IDENTITY-CONTRACT-DEVELOPMENT-PLAN.md)：
  采用 additive v1alpha3，在同一次 Core read snapshot 中将 configuration/execution exact pair 作为 strict public
  mutation identity 投影；update/delete/reveal 原样回传并显式映射到既有 Coordinator。v1alpha1/v1alpha2、STRM、
  durable 状态机、Renderer、migration、依赖、lockfile、Helper 与 historical Evidence 均保持冻结。当前仅文档评审，
  编码继续 GATED；现已被 MVP-VERTICAL-SLICE-1 降为 P0.5 历史候选，不进入当前评审或编码。

- DFI-4A.4.3 计划评审已由用户接受并获得编码授权；readiness 统一为 13 项（2 true、11 false），controlled
  test identity 隔离约束已补齐。编码前 exact API 核对随后发现 v1alpha2 List/Detail 投影未返回
  update/delete/reveal 命令必需的 `expectedExecutionDefinitionDigest`，真实 Renderer 无法构造后续命令。已按
  停手条件暂停实现并新增
  [Public Mutation Identity 停手报告](./docs/development/frontend/DFI-4A.4.3-PRE-CODE-PUBLIC-MUTATION-IDENTITY-STOP-REPORT.md)；
  未修改 frozen Contract、产品代码、依赖、migration、lockfile 或 historical Evidence，等待 additive repair
  方案评审与用户授权。

- 新增 docs-only
  [DFI-4A.4.3 Real Desktop E2E / Stage Closure / Frontend Handoff 详细方案](./docs/development/frontend/DFI-4A.4.3-REAL-DESKTOP-E2E-STAGE-CLOSURE-FRONTEND-HANDOFF-DEVELOPMENT-PLAN.md)：
  冻结 normal unavailable + controlled real-process 双证据，规划真实 Electron/Main/Preload/Core/SQLite、真实编译
  Helper child、临时 Keychain、受控 TLS Provider、七个 named SIGKILL 窗口、三轮 semantic replay、80 次泄漏
  注入、22 类资源归零、父 120 项 Stage Closure 与 Frontend Handoff。当前仅文档评审，编码继续 GATED；
  production Helper、CRUD/Reveal、Renderer UI 与全部下游仍 false/GATED。

- DFI-4A.4.2 已按用户接受的方案 A/A2 完成实现：新增 additive Personal Model management v1alpha2
  八方法安全接口，create/replace/reveal 继续走 STRM，reuse/delete 通过 safe Core command 调用同一 durable
  Coordinator 并使用 zero Secret；normal Core graph 安装真实 production business handler、共享 operation gate、
  recovery 与 Reveal Service。聚合 Harness 为 8 files / 59 tests，80 次泄漏负向注入、18 类资源归零、父 QA
  账本分层及 historical Evidence 不漂移均通过。正式签名 Helper 仍不存在，因此本批只声明
  `DFI4A42_PERSONAL_MODEL_CRUD_REVEAL_RECOVERY_CONFORMANT`，CRUD/Reveal/UI 继续 false/GATED，等待独立 QA。
  Evidence 内层 digest 为 `sha256:f52e7a255374e70a920957ba7641f5643f73a39445946815e42d7261be87dc0e`；
  Central online/offline 均 438/438 BUILD SUCCESS，typecheck、audit 与本批聚焦 ESLint 均 PASS。全仓
  `lint/check` 的剩余阻塞来自前端并行批 `settings-adapter.ts rootRealPath`，不归因本批。
  独立代码 QA P0～P3 全 0 已由用户正式接受，DFI-4A.4.2 现为 `PASS/CLOSED`；QA §3.3 的 readiness
  数量由 9 项修正为 11 项作为 docs-only 精度收口。本次关闭不代表 production ready，也不自动解锁
  Helper、CRUD/Reveal、Renderer Personal Model UI、DFI-4A.4.3 或其他下游。

- 用户接受 DFI-4A.4.2 第一轮停手方案 A：delete 走 safe Core command，复用同一 durable
  Coordinator/Journal/Receipt 并使用 zero Secret，不扩写 frozen STRM v1。恢复编码后的第二轮 exact Contract
  核对又确认：frozen STRM v1 把全部 update 视为携带 mutation body，无法表达既有 Coordinator 的
  `reuse_existing` metadata-only update + zero Secret。docs-only
  [Transport Contract 停手报告 Revision 2](./docs/development/frontend/DFI-4A.4.2-PRE-CODE-TRANSPORT-CONTRACT-STOP-REPORT.md)
  推荐该分支与 delete 一样走 safe Core command；create、replace-secret update、reveal 继续走 STRM。用户已正式
  接受 A2 并恢复编码授权；实施不得缩窄 update 语义、修改 frozen STRM v1 或创建 transport v2。

- 用户正式接受 STRM-3 独立代码 QA，STRM-3 现为 `PASS/CLOSED`，只确认
  `STRM3_SENSITIVE_TRANSPORT_PRODUCTION_CONFORMANT / SENSITIVE_TRANSPORT_READY`。历史 DFI-4A.4.1 与
  DFI-5.4.3 Harness/Evidence 保持只读，不为合法版本/consumer 演进改写；前端并行
  `settings-adapter.ts rootRealPath` 不归因本批。production Helper、business handler、CRUD、Reveal、Renderer UI
  与其他下游继续 false/GATED。

- 新增 docs-only
  [DFI-4A.4.2 Personal Model CRUD / Credential Reveal / Durable Recovery 详细方案](./docs/development/frontend/DFI-4A.4.2-PERSONAL-MODEL-CRUD-CREDENTIAL-REVEAL-DURABLE-RECOVERY-DEVELOPMENT-PLAN.md)：
  byte-freeze v1alpha1 并规划 additive v1alpha2 八方法；普通字段走 strict JSON，Secret 只走 STRM MessagePort +
  fd4/fd5；normal Core graph计划复用既有 Coordinator/Reveal/Journal/Receipt/Keychain，补齐 durable CRUD、exact
  replay、uncertain/manual/cleanup recovery 与 Reveal 短生命周期。当前仅 `DOCUMENT REVIEW PENDING / CODING GATED`，
  未修改代码、Contract、依赖、migration 或 lockfile。

- `0.0.0-strm.3` 完成 Sensitive Transport production activation 与 unblock audit：新增 code-owned exact
  activation authority、normal Main/Preload internal foundation 和 Main→Core trusted boot descriptor；三轮真实
  Electron/Core/fd4/fd5 均经过 Core SIGKILL、新 identity 与恢复后重新协商，另有 6 个 controlled bytes-path
  scenarios、80 次负向泄漏注入、16 类资源归零与 DFI-4A.4 父 QA-061～080 逐项账本。当前只达到
  `SENSITIVE_TRANSPORT_READY`；production Personal Model feature、Broker business handler、Helper、CRUD、Reveal、
  Renderer UI 与其他下游继续 false/GATED。独立代码 QA P0～P3 全 0 已由用户接受，本批正式 `PASS/CLOSED`。

- `0.0.0-dfe.run.1.repair.1` 完成 DFE-RUN-1 产品复验修订：历史专项机器人消失后提供显式“使用通用机器人”
  操作，仍禁止静默替换；任务页与侧栏改用同一个、以 `taskId` 为键的本次运行置顶 Store；用户菜单改为可在
  路由切换和点击外部时关闭的受控弹层；侧栏路由切换任务时清理旧目录状态并丢弃迟到响应；同时收敛 900×600
  智能中心统计布局、中央任务返回路径、设置/知识中心工程文案、机器人表单校验时机和开关可访问性。本批不新增
  后端接口、持久化或打包能力，等待产品复验和独立 QA，不标记 `PASS/CLOSED`。

- 用户正式接受 DFI-4A.4.1 独立代码 QA，DFI-4A.4.1 现为 `PASS/CLOSED`。P3 只保留为已收口的文档精度
  记录；历史 DFI-5.4.3 Harness/Evidence 保持只读，前端并行 `settings-adapter.ts rootRealPath` 不归因本批。
  新增 docs-only [STRM-3 Sensitive Transport Production Activation / Unblock Audit 详细方案](./docs/development/frontend/STRM-3-SENSITIVE-TRANSPORT-PRODUCTION-ACTIVATION-UNBLOCK-AUDIT-DEVELOPMENT-PLAN.md)：
  冻结 code-owned activation、normal Main/Preload internal foundation、Main→Core content-free descriptor、真实
  Electron/Core/fd4/fd5 audit、80 次泄漏注入与16类资源归零。STRM-3 只允许关闭 transport blocker；
  production feature、business handler、Helper、CRUD/Reveal、Renderer UI 与下游继续 false/GATED。当前仅
  `DOCUMENT REVIEW PENDING / CODING GATED`，不构成编码授权。

- `0.0.0-dfe.run.1` 按产品综合验收完成 Desktop 本地试运行体验修订：一级导航收敛为“新建任务 / 智能中心 /
  知识中心”，任务、项目空间和最近任务进入左侧栏，设置进入用户菜单；新任务默认使用稳定的
  `agent.general` 通用机器人，专项机器人缺失不再阻塞提交，已失效或消失的历史选择仍保持失败关闭；任务详情
  重排为任务导航、对话、操作面板三部分，并补齐成果标签、过程/Tool 调用、工作空间文件、面板收起/全屏和真实
  打开/删除反馈；智能中心与创建页同步收敛为中文业务文案和真实能力边界。本批不新增 Contract、IPC、Core、
  Main/Preload、持久化或安装打包能力，当前等待产品复验和独立 QA，不标记 `PASS/CLOSED`。

- `0.0.0-dfi.4a.4.1` 完成 DFI-4A.4 Revision 2 第一批：新增 standalone/enterprise 分离的 Personal Model
  management authority、签名后 digest 的固定包内 Helper builder/manifest/Main→Core 二次验证，以及独立
  `personal-model-management/v1alpha1` Compatibility/List/Detail Contract、Core HTTP、Main IPC 与 sandboxed
  Preload 三方法只读链路。专项 Harness 4/17、全量 TypeScript/Vitest 328/2187、三项 smoke、Central
  online/offline 438/438、typecheck/focused lint/audit 均通过；migration 止 26、lockfile 未变。当前无正式签名
  Helper 资产，CRUD/Reveal/Renderer UI 与下游继续 GATED；独立 QA 已由用户接受，本批正式 `PASS/CLOSED`。

- 用户正式接受 DFI-5.4.3 独立代码 QA，并同步关闭 DFI-5.4.3、DFI-5.4 与 DFI-5 全阶段。最终证据为
  `DFI5_MAX_REASONING_MODE_CONFORMANT`，聚合 Harness 9/52、三轮真实 Electron/Core SIGKILL/SQLite reopen、
  父108项与 focused120项账本、80 次泄漏注入、Central 438/438 和 root check 324/2169 全绿。QA 报告中
  “public Contract 未修改”按本批 additive `desktop-local/task-reasoning/v1alpha1` 精确修正；阶段关闭不是下游
  自动解锁。Enterprise/DeepSeek、TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 与 Admin v2 继续 GATED。

- `0.0.0-dfi.5.4.3` 已完成 Renderer Max UI、Safe Preview、durable Task Reasoning Projection、Local Personal
  exact Max production path 与 DFI-5 stage closure Evidence。聚合 Harness 9/52，三轮真实 Electron 都完成
  Core SIGKILL/新 PID/SQLite reopen/TLS-SSE/Renderer DOM，80 次负向泄漏全检出且资源归零；完整 check
  324/2169 + 3 smoke、Central online/offline 438/438、lint/typecheck/audit/frozen install 全绿。当前仅为
  `IMPLEMENTED / INDEPENDENT QA PENDING`；该历史实施状态现已由后续独立 QA 和用户接受推进为
  `PASS/CLOSED`，Enterprise/DeepSeek 与其他下游继续 GATED。

- 用户正式接受DFI-5.4.3A聚焦修订后的独立代码QA结论，本批现为`PASS/CLOSED`。最终QA为
  P0=0/P1=0/P2=0/P3=1；historical DFI-5.4.2与R2D-4 Harness/Evidence保持只读，不为适配当前合法演进改写，
  Central online双节点时序偶发作为非阻断P3保留。该关闭只确认Local Personal production graph conformance，
  DFI-5.4.3父批剩余Renderer Max UI、Safe Preview、真实Desktop E2E与DFI-5阶段Closure仍等待单独恢复授权。

- `0.0.0-dfi.5.4.3a` 已完成Local Personal production graph：真实Personal Model/Invocation/Preference
  persistence、Local Desktop exact subject、R2D-P.2/PRA-3 admission、task-pinned release、release-pinned
  mapping、唯一durable DFI541 handler与Agent Loop/Provider正式接线。normal graph不再fallback scripted
  Agent/Model/Provider；历史E2E只通过显式`legacy_test`隔离图使用fixture。缺verified Credential helper或合法
  Personal Model时仍诚实返回`runtime_dependencies_unavailable`。focused Harness 2/9、单worker全量
  323/2162 + 3 smoke、Central offline 438/438及lint/typecheck/audit均通过；独立QA与用户接受已完成，但不代表
  production ready或DFI-5.4.3父批关闭。

- 用户正式接受DFI-5.4.3A计划评审结论并单独恢复编码授权；当前仅允许进入Local Personal production graph：
  Personal Model persistence、唯一production DFI541 handler、R2D-P.2/PRA-3 exact admission、task-pinned release、
  release-pinned mapping、Agent Loop/Provider与Desktop bootstrap接线。migration、公共Contract、依赖、Credential
  helper packaging及全部下游能力继续禁止；任一停手条件命中须立即回评审。

- DFI-5.4.3A 独立文档复核总体 `PASS`（P0～P2=0）；完成 docs-only 精度收口：明确
  `TaskLockedModelProviderResolver` Port仍绑定v1alpha2 readable selection，而具体Runtime Adapter按exact lock解析且
  当前未消费selection；确认`runtime_dependencies_unavailable`已存在于冻结v1alpha5 Compatibility enum，本批只
  消费该typed value，不修改public Contract。当前`USER ACCEPTANCE PENDING / CODING GATED`，未恢复编码。

- 用户正式接受 DFI-5.4.3 实施停手结论，并授权先形成 docs-only
  [DFI-5.4.3A Local Personal Production Graph 聚焦实施方案](./docs/development/frontend/DFI-5.4.3A-LOCAL-PERSONAL-PRODUCTION-GRAPH-DEVELOPMENT-PLAN.md)：
  冻结真实 Personal Model/Invocation/Preference persistence 生命周期、唯一 production
  `Dfi541SubmitTurnHandler`、R2D-P.2 entitlement、PRA-3 exact admission、task-pinned release reconstruction、
  release-pinned mapping、Agent Loop/Provider 与 Desktop bootstrap 接线。方案明确区分 structural graph 与用户
  Credential runtime readiness；缺 verified helper 或合法 Personal Model 时返回 `runtime_dependencies_unavailable`，
  不用 Fixture 补位。当前 `DOCUMENT REVIEW PENDING / CODING GATED`，不新增 migration、依赖或下游能力。

- DFI-5.4.3 编码已完成 strict Task Reasoning read model、Core/Main/Preload 独立链路、Renderer Max Adapter、
  accessible switch 与 Task detail durable safe summary；定向 3 files / 10 tests、Core/Desktop build 通过。继续接入
  production graph 时确认当前 bootstrap 仍为 scripted Fixture，且 production `Dfi541SubmitTurnHandler` 实现数为 0；
  按方案停手条件 10 暂停，未打开任何 production gate，等待 Local Personal production graph 聚焦确认。

- 用户正式接受 DFI-5.4.3 独立文档复核并单独授权编码；两项 P3 精度直接吸收：QA-062 增加非法 union state
  `extraStateRejected`，QA-082 增加 `task-reasoning/v1alpha1` exact subpath 构建产物真实 import。计划现为
  `PLAN REVIEW PASS/CLOSED / CODING AUTHORIZED`；其他下游继续 `GATED`。

- 用户正式接受 DFI-5.4.2 独立 QA 精度收口结论，DFI-5.4.2 现为 `PASS/CLOSED`；此前 R2D-4 异常确认是
  QA runtime/path 伪失败，不建立 repair 批次。新增 docs-only
  [DFI-5.4.3 Renderer Max UI / Safe Preview / Real Desktop E2E / Stage Closure 详细方案](./docs/development/frontend/DFI-5.4.3-RENDERER-MAX-UI-REAL-DESKTOP-E2E-STAGE-CLOSURE-DEVELOPMENT-PLAN.md)：
  保持 v1alpha5 六方法 API 冻结，另建最小只读 Task Reasoning Projection，冻结 final production composition、
  真实 Electron/Core/SQLite/TLS-SSE E2E、父108项逐项账本与 focused120项QA。当前仍
  `DOCUMENT REVIEW PENDING / CODING GATED`，本轮不改代码、Contract、migration、依赖或 lockfile。

- 实现 `0.0.0-dfi.5.4.2` Desktop v1alpha5 Safe API / Restart Lease：补齐 preference safe projection，新增六条
  exact Core private route、六个 Main IPC channel、bounded `CorePrivateClient` methods、webContents/client binding、
  单一 runtime lease revalidation 与 frozen sandboxed Preload API。Renderer/UI 未接线，production compatibility
  继续 `production_gate_disabled`，installed release 仍为0。`harness:dfi5.4.2` 5/21、root check 318/2143 +
  3 smoke、Central online/offline 438/438、typecheck/lint/audit 全绿；migration 止26，lockfile digest 未变。
  独立 QA 精度收口后 P0～P3 全0，用户已正式接受并关闭本批；不自动授权 DFI-5.4.3 编码。

- 用户正式接受 DFI-5.4.1 独立 QA 与报告精度修正结论，DFI-5.4.1 现为 `PASS/CLOSED`。本次关闭只确认
  Max Core Contract / Durable Cutover conformance；production gates、Core route、Main/Preload API、
  Desktop Max UI 与 installed subject release 继续为 false/0。DFI-5.4.2 仍为
  `USER ACCEPTANCE PENDING / CODING GATED`，未自动获得编码授权。

- 同步修正 DFI-5.4.1 独立 QA 治理记录：Root/Core/Contracts 均为 `0.0.0-dfi.5.4.1`；PRA 共10种
  typed cause，仅2种允许 fallback，其余8种 fail-closed。新增 docs-only
  [DFI-5.4.2 Desktop v1alpha5 Safe API / Restart Lease 详细方案](./docs/development/frontend/DFI-5.4.2-DESKTOP-SAFE-API-RESTART-LEASE-DEVELOPMENT-PLAN.md)：
  明确 R2D-P.3 已占用 v1alpha4 default-only API，Max 必须使用独立 v1alpha5 六方法 namespace；冻结 Core
  六 route、Main client binding/restart lease、sandboxed Preload、96项QA与 post-transition historical Evidence
  纪律。当前仅 `DOCUMENT REVIEW PENDING / CODING GATED`，未编码、不改 migration/依赖/lockfile。

- DFI-5.4.2 独立文档复核为 `PASS_WITH_P3_PRECISION_NOTES`（P0～P2=0/P3=3），已完成 docs-only 收口：
  将真实缺口精确限定为 Facade 三个 v1alpha5 production-facing method；leak scanner 明确继承 DFI-5.4.1
  5关键词并扩展新增敏感项；编码版本冻结为 Root/Core/Contracts/Desktop `0.0.0-dfi.5.4.2`，Admin 保持
  `0.0.0-afe.6c`。方案逻辑、96项QA与 `CODING GATED` 状态不变，无需重新完整复核。

- 实现 `0.0.0-dfi.5.4.1` Max Core Contract / Durable Cutover：新增 Desktop Local v1alpha5、
  ReasoningModeLock v1alpha2、Runtime Selection v1alpha4 与 coordination v1alpha5 additive Contract，落地六态
  reasoning lock、best-effort Planner、exact Provider admission 及 InMemory/SQLite 原子 durable bundle。
  `harness:dfi5.4.1` 5/37、root check 313/2122 + 3 smoke、Central online/offline 438/438、typecheck/lint/audit
  全部 PASS；migration 仍止 26，lockfile digest 未变。当前为 `INDEPENDENT QA PENDING`，production gates 与
  route/API/UI/installed release 继续关闭，DFI-5.4.2～5.4.3 未解锁。

- DFI-5.4.1 独立文档复核通过（P0～P2=0/P3=2）后完成 docs-only 精度收口：明确 Desktop Receipt 的
  `reasoningResolution*` 必须 exact 等于 durable `resolutionEvidence*`；PRA 10 个 typed cause 中仅
  `policy_unavailable | policy_not_admitted` 两个允许 best-effort fallback，其余8个全部 fail-closed，并新增
  显式停手条件。Claude 复核文本另有三处报告精度待其自身修正：当前不存在 Runtime Selection v1alpha4目录、
  实施计划为四个 Step、PRA cause 数量为10（2 fallback + 8 fail-closed）。DFI-5.4.1 当前仍
  `USER ACCEPTANCE PENDING / CODING GATED`，本轮未编码。

- 新增 docs-only
  [DFI-5.4.1 Max Core Contract / Durable Cutover 详细实施方案](./docs/development/frontend/DFI-5.4.1-MAX-CORE-CONTRACT-CUTOVER-DEVELOPMENT-PLAN.md)：
  在方案 A 前置全线 `PASS/CLOSED` 后，冻结 Desktop v1alpha5、ReasoningModeLock v1alpha2、Runtime Selection
  v1alpha4、coordination v1alpha5 的唯一版本链，两个 best-effort fallback、PRA-3 admission 分级、atomic bundle
  recovery 与 code-owned default-false gate。当前仍为 `DOCUMENT REVIEW PENDING / CODING GATED`；本轮不编码、
  不改 migration/依赖/lockfile，不解锁 DFI-5.4.2～5.4.3 或其他下游。

- 用户正式接受 R2D-P.3 + PRA-3 独立 QA；两批现均为 `PASS/CLOSED`。DTP-4 self-test 旧版本 fixture 已在
  关闭前修复，focused 2/2、production audit 与 root check 308/2085 + 3 smoke 全绿。该关闭只确认
  Desktop v1alpha4 default-only cutover 与 Provider admitted policy/materializer conformance；DFI-5.4.1 仍
  `GATED`，production R2D activation、release registry consumer、SubmitTurn Max 与 Desktop Max UI 仍为
  false/0。

- `0.0.0-r2dp.3-pra.3` 完成 R2D-P.3 与 PRA-3：Desktop Local v1alpha4 通过 exact Contract/Core/Main/
  sandboxed Preload/Renderer 单线接入 default-only SubmitTurn，Receipt 删除 `defaultModelId`，真实 Electron/Core/
  SQLite E2E 证明 production gate 默认关闭；Provider admission 新增 additive V2、九向量 immutable manifest 与
  exact subject-bound admitted materialization，但 bootstrap installed release/registry consumer 仍为0。
  `harness:r2dp3` 8 files/22 tests、`harness:pra3` 6 files/22 tests、root check 308 files/2085 tests + 3 smoke、
  Central online/offline 438/438、lint/audit/frozen install 全绿；migration 止26，lockfile
  `5b15ae01…874f31` 不变。当前为开发者门禁通过、独立 QA 待进行，不解锁 DFI-5.4.x 或其他下游。
  独立 QA 后补齐 DTP-4 self-test 的旧 package-version fixture，focused 2/2 与完整 root check
  308 files/2085 tests + 3 smoke 均以最终退出码0通过；未放宽审计规则。

- R2D-P.3 + PRA-3 独立文档复核 `PASS（P0～P2=0/P3=2）` 后完成两项 docs-only 精度收口：v1alpha4 submit/query
  均绑定 Main→Core connection lease，旧 lease 晚到响应返回 `runtime_changed`，但新 runtime 重新协商后允许使用
  同一 command ID 恢复 durable Receipt；PRA-3 production 环境误启 test loopback 时复用既有 typed cause
  `personal_model.test_transport_forbidden`，不新增同义错误。用户接受后，两份计划均为
  `PLAN REVIEW PASS/CLOSED / CODING GATED`；尚未授权编码。

- 用户正式接受 R2D-P.2 与 PRA-2 repair.1，R2D-P.2、repair.1 与修复后的 PRA-2 分层 `PASS/CLOSED`；
  production R2D activation、Provider registry consumer、SubmitTurn Max 与 Desktop Max UI 仍为 0/false。新增
  docs-only [R2D-P.3 Desktop Local v1alpha4 / Production Cutover / E2E 详细方案](./docs/development/frontend/R2D-P.3-DESKTOP-V1ALPHA4-PRODUCTION-CUTOVER-DEVELOPMENT-PLAN.md)
  与 [PRA-3 Provider Lifecycle / Admission Closure 详细方案](./docs/development/frontend/PRA-3-PROVIDER-LIFECYCLE-ADMISSION-CLOSURE-DEVELOPMENT-PLAN.md)：
  前者冻结 default-only v1alpha4、删除 `defaultModelId`、三个 exact API 与真实 Electron cutover；后者冻结
  pending V1 byte freeze、additive admitted V2、code-owned conformance manifest 与真实 TLS/SSE 生命周期。
  两份方案当前均为 `DOCUMENT REVIEW PENDING / CODING GATED`，各细化估算 4～7 日，父计划关键路径同步修正为
  9～16 日；本条不构成编码授权。

- `0.0.0-r2dp.2-pra.2-repair.1` 修复聚焦复核发现的 PRA-2 sealed outcome 类型缺口：原独立 QA 将实现误报为
  pending/admitted/rejected 三态，实际代码只有 pending/rejected。repair.1 新增
  `ProductionAdmittedProviderReleaseMaterialization`，以 module-private `unique symbol` proof 保证当前不可构造，
  pending policy 仍只能返回 `pending_conformance_materialized`，production admitted/supported/registry consumer
  继续为 0。新增双向 compile-time 非互换断言，`harness:pra2` 更新为 **5 files / 24 tests**、Evidence
  `sha256:1efc27e9…894eda`、`sealedOutcomeVariantCount=3`；root check **301 files / 2070 tests + 3 smoke** 通过。
  原独立 QA 结论因此不能直接用于关闭，需聚焦 re-QA。

- 用户正式接受 R2D-P.1 + PRA-1 独立 QA 及两轮报告精度修正，两批均为 `PASS/CLOSED`；该关闭不打开
  production R2D consumption，也不把 PRA-1 `pending_conformance` candidate 解释为 admitted。新增 docs-only
  [R2D-P.2 Production Source / Composition 详细方案](./docs/development/frontend/R2D-P.2-PRODUCTION-SOURCE-COMPOSITION-DEVELOPMENT-PLAN.md)
  与 [PRA-2 Exact Subject-bound Release Materializer 详细方案](./docs/development/frontend/PRA-2-EXACT-SUBJECT-BOUND-RELEASE-MATERIALIZER-DEVELOPMENT-PLAN.md)：
  前者冻结 use-only local authority、subject proof、Personal Model consistency lease、唯一 production graph 与默认
  false gate；后者冻结 exact subject 纯 materializer、code-owned identity、pending/admitted 类型隔离与 production
  release count=0。两份方案已完成独立文档复核、用户授权与编码，当前状态见下一条。

- `0.0.0-r2dp.2-pra.2` 并行完成 R2D-P.2 与 PRA-2。R2D-P.2 新增唯一 production
  `TaskResourceEntitlementSource`、一次性 subject proof/captured lease、Local Desktop acceptance authority 与默认
  disabled composition；真实 Personal Model 未能证明数值 context window 时投影 `unknown`，不补默认值，Planner
  成功或失败均确定性释放 lease。PRA-2 新增纯函数 exact subject-bound release materializer，绑定 LDA、Personal
  Model exact facts、safe Credential observation、Task lock、endpoint 与 adapter/projector/timeout identities；当前只产出
  `pending_conformance_materialized`，production admitted/supported/registry consumer 均为 0。专项 Harness 分别
  **5 files / 48 tests** 与 **5 files / 23 tests**，root check **301 files / 2069 tests + 3 smoke**、Central
  online/offline **438/438**、lint/Architecture boundary/audit 全绿；migration 仍止 26、lockfile digest 保持
  `5b15ae01…874f31`。当前 `IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING`；详见
  [R2D-P.2 实施报告](./docs/development/frontend/R2D-P.2-PRODUCTION-SOURCE-COMPOSITION-IMPLEMENTATION-REPORT.md)
  与 [PRA-2 实施报告](./docs/development/frontend/PRA-2-EXACT-SUBJECT-BOUND-RELEASE-MATERIALIZER-IMPLEMENTATION-REPORT.md)。

- `0.0.0-r2dp.1-pra.1` 并行完成方案 A 的 LDA-1 / R2D-P.1 与 PRA-1。Core 新增独立 HMAC domain 的
  `local_desktop_owner` authority、Task Resource Entitlement v2/readable union 与单一 canonical normalize 路径；
  production Entitlement Source 仍为 0，未开启 R2D consumption。PRA-1 新增 content-addressed Provider evidence、
  admission policy 与 exclusion record；OpenAI `gpt-5.2-2025-12-11` 仅为 `pending_conformance` 候选，DeepSeek
  因需要 additive mapping/Tool continuation private state 保持 excluded，production materializer/release 仍为 0。
  `harness:r2dp1` 4 files / 48 tests、`harness:pra1` 5 files / 25 tests、宿主 root check 298 files / 2057 tests +
  3 smoke、R2D-3.2 与 DFI-5.3.4 历史 Harness、Central online/offline 438/438、lint/audit/frozen install 全绿；
  migration 仍止 26，lockfile digest 保持 `5b15ae01…874f31`。该段记录实现门禁；独立 QA 与用户接受已在
  上方关闭记录中收口；详见
  [R2D-P.1 实施报告](./docs/development/frontend/R2D-P.1-LOCAL-DESKTOP-AUTHORITY-ENTITLEMENT-IMPLEMENTATION-REPORT.md)
  与 [PRA-1 实施报告](./docs/development/frontend/PRA-1-IMMUTABLE-EVIDENCE-ADMISSION-POLICY-IMPLEMENTATION-REPORT.md)。

- DFI-5.4 Desktop Max UI / Safe Preview / Production Cutover 父方案独立文档复核已接受为
  `PLAN REVIEW PASS/CLOSED`；docs-only
  [DFI-5.4.0 Contract / Durable Resolution / Production Release Authority 前置聚焦确认](./docs/development/frontend/DFI-5.4.0-CONTRACT-RELEASE-AUTHORITY-PREFLIGHT-CONFIRMATION.md)：
  核对 v1alpha3 Preview/SubmitTurn/Receipt exact 字段，识别 ReasoningModeLock v1alpha1 无法诚实承载两类最新
  best-effort fallback，以及 coordination v1alpha4 属 R2D 分支而 production R2D gate 仍 false；冻结
  ReasoningModeLock additive version 与 Runtime Selection/coordination 单一 version path 的评审问题。Local
  Personal release authority 改为 code-owned admission policy + 具体用户 subject-bound exact release 两层，
  当前无候选满足全部 production admission。聚焦复核已通过并由用户接受，DFI-5.4.0 正式 `PASS/CLOSED`；
  用户选择方案 A，禁止 legacy Runtime Selection 分支。新增 docs-only
  [方案 A：最小 R2D Production Consumption / Provider Release Admission 详细计划](./docs/development/frontend/DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md)：
  以 Local Desktop Authority 为共享根，把 R2D-P.1～P.3 与独立 PRA-1～PRA-3 分开验收；Desktop v1alpha4
  先只接 R2D/default reasoning，DFI-5.4.1 后续再以 v1alpha5 单线接 Max。该条记录方案形成时的状态；当前
  计划评审已 `PASS/CLOSED`，LDA-1 / R2D-P.1 与 PRA-1 已进入上方实现批，后续仍独立 GATED。

- 用户正式接受 DFI-5.3.4 独立 QA（P0～P3 全 0），DFI-5.3.4 与 DFI-5.3 阶段整体 `PASS/CLOSED`；父方案
  120 项账本正式确认为 `executed_at_dfi53_stage_closure`。DFI-5.3.1～5.3.3 historical Evidence/Harness
  继续只读，不覆盖历史。本次关闭仅确认 `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`，不代表 production
  ready；Gateway v1alpha3 route、Local/Enterprise Max release、SubmitTurn v1alpha3 与 Desktop Max UI
  继续不可达/0，DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption
  继续 GATED。

- `0.0.0-dfi.5.3.4` 完成 DFI-5.3 closure-only Lifecycle / Cutover / Stage Closure：新增真实 Core/Central
  child、真实 SQLite reopen 与 loopback Provider fixture，覆盖 Local Personal、Enterprise OpenAI-compatible、
  Enterprise Anthropic-compatible 的 6 个 SIGKILL 恢复窗口与 9 次 fresh-process replay；父方案 120 项形成
  item-level execution ledger，96 项 focused QA、80 次多编码泄漏负向与 14 类资源归零进入同一聚合 Evidence。
  DFI-5.3.1～5.3.3 historical Evidence 运行前后逐字节不变；Gateway v1alpha3 四个 canonical file digests、
  migration 26 与 lockfile digest 均无漂移。root check 295 files / 2039 tests + 3 smoke、Central online/offline
  438/438、lint、Architecture boundary、audit 与 frozen offline install 全绿。当前
  `IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING`，最高只输出
  `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT`；production route/release/UI 与全部下游继续 false/GATED。详见
  [实施报告](./docs/development/frontend/DFI-5.3.4-LIFECYCLE-CUTOVER-STAGE-CLOSURE-IMPLEMENTATION-REPORT.md)。

- 用户正式接受 DFI-5.3.3 独立 QA（P0～P3 全 0），DFI-5.3.3 当前 `PASS/CLOSED`；文档复核阶段关于
  Gateway Contract 路径的误报澄清保留为历史记录，不作为实现缺陷。DFI-5.3.1/5.3.2 historical
  Evidence/Harness 继续只读，父方案 120 项仍保留至阶段收口。新增 docs-only
  [DFI-5.3.4 Lifecycle / Cutover / Stage Closure 详细方案](./docs/development/frontend/DFI-5.3.4-LIFECYCLE-CUTOVER-STAGE-CLOSURE-DEVELOPMENT-PLAN.md)，
  冻结三 Provider 真实进程崩溃恢复、Gateway v1/v2/v3 single-dispatch/cutover、父 120 项 item-level 执行账本、
  96 项 focused QA、三轮 semantic replay、80 次负向泄漏注入、14 类资源归零及诚实
  `DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT` 输出。本轮只改文档，DFI-5.3.4 仍
  `DOCUMENT REVIEW PASS / USER ACCEPTANCE PENDING / CODING GATED`；独立复核 P0～P2 全 0、P3=2，两个 P3
  已直接吸收为文档精度修正：v3 canonical evidence 明确为四个 file digests，DFI-4A.3.1 repair.2 Timeout
  Fact 明确等同 migration 25。DFI-5.4 与全部下游继续 GATED。

- `0.0.0-dfi.5.3.3` 完成 Enterprise OpenAI-compatible / Anthropic-compatible Reasoning Mapping：新增
  additive Enterprise Gateway v1alpha3 safe reasoning sidecar，Core 在 durable prepare 前完成 exact
  Profile/mapping preflight，Central 独立重算 Strategy/Profile/mapping 三层 digest 并绑定 exact Endpoint，
  OpenAI 仅投影 `reasoning_effort: high|xhigh`，Anthropic 仅投影 bounded `thinking.budget_tokens`；
  default/fallback body 完全省略 reasoning 字段。三态 activation gate 保证 disabled 时 service/controller 为 0、
  依赖不完整时 HTTP ready 前失败、production true 当前拒绝。专项 Harness、root check、Central online/offline、
  CPC 回归、lint/audit/frozen install 全部通过；production Gateway v1alpha3 route、Enterprise Max release、
  SubmitTurn v1alpha3 与 Desktop Max UI 继续为 0/不可达。当前 `IMPLEMENTED / INDEPENDENT QA PENDING`，详见
  [实施报告](./docs/development/frontend/DFI-5.3.3-ENTERPRISE-OPENAI-ANTHROPIC-REASONING-MAPPING-IMPLEMENTATION-REPORT.md)。
  该条记录的是实施完成时状态；独立 QA 与用户接受后的当前状态以上一条为准。

- DFI-5.3.3 独立文档复核总体 `PASS`，聚焦纠正一项复核事实误判：Core-private
  `ModelReasoningV1Alpha2Schema` 与 `contracts/enterprise-gateway/v1alpha1～v1alpha2/**` Wire Contract
  属不同协议层，v1alpha3 继续落在 `contracts/enterprise-gateway/v1alpha3/**`。方案 §3.2 已进一步写死：既有
  v1alpha2 reasoning schema 字节冻结，Core converter 只在转换阶段合并 exact Profile/mapping refs，禁止改写
  v1alpha2 ModelRequest。修正后 P0～P2 全 0、P3=1；本轮仅修改文档，继续等待用户接受与单独编码授权。

- 用户正式接受 DFI-5.3.2 独立 QA（P0～P3 全 0），DFI-5.3.2 `PASS/CLOSED`；DFI-5.3.1 historical
  evidence/Harness 保持只读，父方案 120 项矩阵继续保留至 DFI-5.3 阶段收口。新增 docs-only
  [DFI-5.3.3 Enterprise OpenAI-compatible / Anthropic-compatible Reasoning Mapping 详细方案](./docs/development/frontend/DFI-5.3.3-ENTERPRISE-OPENAI-ANTHROPIC-REASONING-MAPPING-DEVELOPMENT-PLAN.md)，
  冻结 Gateway v1alpha3、Core/Central 双重 exact 校验、safe mapping refs、OpenAI effort/Anthropic bounded
  budget sealed projector、cache/reasoning 四组合、真实 loopback Provider fixture 与 108 项 focused QA。
  分批调整为 5.3.3 同时完成两类 Enterprise mapping，5.3.4 只做 Lifecycle/Cutover/Stage Closure；本轮未编码，
  production SubmitTurn v1alpha3、Desktop Max UI 与 production Local/Enterprise Max release 继续不可达/0。

- 用户正式接受 AFE-6C 独立 QA，Admin Evidence Hardening 当前 `PASS/CLOSED`。`0.0.0-afe.6c`
  在 `apps/admin-console/**` 授权范围内加固 `scan:static`：新增 production/integration
  `bundleEvidence`、`missingRequiredBundleRoots` 与 `emptyRequiredBundleRoots`，并在 `dist` /
  `dist-integration` 缺失、为空或缺少 JS bundle 时 fail-closed。Admin gates 全绿（typecheck、
  negative、build 82 modules、build:integration 181 modules、test 12 files / 50 tests、scan:static、
  scan:deps、smoke:dev）；`harness:aapi0.4` evidenceDigest 保持
  `sha256:aa4348558bcd333ed1fa377be99da0f82a5bc940456db3762ebf340dbad02a71`，Desktop build/tests 与
  root check 289 files / 1998 tests + 3 smoke 全绿。mutation、Tool activation、TGM、Knowledge Provider、
  production identity、AAPI-0.5、Desktop v2 consumption 与 AFE-6D 继续 GATED。

- `0.0.0-dfi.5.3.2` 完成 Local Personal Reasoning Mapping：按 Revision 2 将 exact subject 的
  `modelCapabilityRevision` 绑定 Task Capability lock revision，并以 Personal configuration binding、execution
  digest 与 Adapter revision 分层证明其余身份；default/fallback body 完全省略 reasoning 字段，max 只投影 sealed
  `reasoning_effort: high | xhigh`。mapping 在 durable Invocation prepare 与 Credential/DNS/socket/TLS/HTTP 前
  完成，terminal replay 不重读 mapping。专项 Harness 8 files / 66 tests、root check 289 files / 1998 tests +
  3 smoke、Central online/offline 424/424、lint/boundary/audit/frozen install 全绿；production Local supported
  release 仍为 0，Contracts/migration/依赖/lockfile 未变。独立 QA P0～P3 全 0 并已由用户接受，当前
  `PASS/CLOSED`，详见
  [实施报告](./docs/development/frontend/DFI-5.3.2-LOCAL-PERSONAL-REASONING-MAPPING-IMPLEMENTATION-REPORT.md)。

- 用户正式接受 AFE-6B 独立 QA，Admin Browser / Visual / Accessibility Evidence Closure 当前
  `PASS/CLOSED`。`0.0.0-afe.6b` 在 `apps/admin-console/**` 内完成 hash-mode index HTML / integration
  loopback 证据、导航 `aria-current`、详情入口/分页/返回入口可读名称、响应式 CSS Contract、bundle 敏感扫描和
  AAPI-0.4 evidenceDigest 零漂移门禁；Admin gates、Desktop build/tests、`harness:aapi0.4` 与 root check
  287 files / 1986 tests + 3 smoke 全绿。唯一 P3 为 `scan:static` 独立命令在缺少 bundle 时可空跑的健壮性观察，
  不阻断关闭；mutation、Tool activation、TGM、Knowledge Provider、production identity、AAPI-0.5、
  Desktop v2 consumption 与 AFE-6C 继续 GATED。

- DFI-5.3.2 获得 Revision 1 用户接受与单独编码授权后，编码前代码事实核对发现 exact Local subject 的
  `modelCapabilityRevision` 被方案误写为 Personal Model `configurationRevision`；两者属于不同摘要域，且
  DFI-5.3.1 Mapper 已冻结前者必须等于 Task lock Capability definition revision。新增 Revision 2 聚焦修订：
  Capability revision 继续绑定 lock，Personal configuration/execution 由已验证 binding 与
  `personalExecutionDefinitionDigest` 分层证明。当前仅修改文档，生产实现暂停等待用户聚焦接受。

- DFI-5.3.2 独立文档复核通过后完成 Revision 1 纯文档小修：明确 Local timeout ref 是本批新增的
  code-owned identifier、父方案八类与 Local 十类零副作用通道的对应关系，并修正“DFI-5.3.2 接线后仍要求
  DFI-5.3.1 production consumer=0/evidenceDigest 不变”的不可能约束。DFI-5.3.1 historical evidence 保持
  只读；新批通过 foundation focused regression 与 `harness:dfi5.3.2` authorized Local consumer allowlist
  证明演进正确。未修改生产代码、Contract、migration、依赖或 lockfile；DFI-5.3.2 继续
  `USER ACCEPTANCE PENDING / CODING GATED`。

- 用户正式接受 `0.0.0-dfi.5.3.1` 独立 QA，DFI-5.3.1 `PASS/CLOSED`；CGF-2B3.2 首跑偶发仅作
  非阻断环境 P3，不建立 DFI repair。父方案 120 项矩阵继续按
  `retained_for_dfi53_stage_closure` 保留，不视为本批已全部执行。新增 docs-only
  [DFI-5.3.2 Local Personal Reasoning Mapping 详细方案](./docs/development/frontend/DFI-5.3.2-LOCAL-PERSONAL-REASONING-MAPPING-DEVELOPMENT-PLAN.md)，
  冻结 exact Personal Model/Adapter/timeout binding、mapping-before-durable-prepare、default/fallback
  body 完全省略、historical exact mapping、真实 loopback TLS/SSE fixture 与 96 项 QA。当前没有获批的真实
  Local Personal Max release，production supported release count 保持 0；本轮未修改生产代码、Contract、
  migration、依赖或 lockfile，DFI-5.3.2 仍 `DOCUMENT REVIEW PENDING / CODING GATED`。

- `0.0.0-dfi.5.3.1` 完成 Private Mapping Foundation：新增 sealed Provider-private mapping domain、
  `Strategy commitment → safe Profile → full private mapping` 非循环摘要顺序、release-pinned exact registry 与
  Task-locked mapper。default Profile/mapping load=0，max exact load 各 1，缺失/漂移 typed fail-closed；尚未接
  Provider Adapter、Gateway v1alpha3、production SubmitTurn 或 Desktop UI。专项 8 files / 61 tests、root check
  287 files / 1986 tests + 3 smoke、Central offline 424/424、frozen install、lint、boundary 与 audit 通过；
  Central online 首跑仅既有 CGF-2B3.2 timing 偶发，单类复跑 3/3 通过。本批未改 Contracts、migration、依赖或
  lockfile，当前 `IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING`。详见
  [实施报告](./docs/development/frontend/DFI-5.3.1-PRIVATE-MAPPING-FOUNDATION-IMPLEMENTATION-REPORT.md)。

- 用户正式接受 AFE-6A Admin Read-only Experience Closure 独立 QA，AFE-6A 当前 `PASS/CLOSED`。
  `0.0.0-afe.6a` 在 `apps/admin-console/**` 内完成六模块真实只读展示体验收口、11 项页面状态矩阵、
  分页 stale cursor 安全处理、中文业务字段与非生产提示；删除 8 个 Tool Prototype 创建/策略文件并确认生产
  路由 0 暴露。Admin gates、`harness:aapi0.4`、Desktop build/tests 与独立 QA 复跑 root check
  287 files / 1986 tests + 3 smoke 全绿；mutation、Tool activation、TGM、Knowledge Provider、
  production identity、AAPI-0.5、Desktop v2 consumption 继续 GATED。

- 用户正式接受 DFI-5.3.1 Digest Ordering 聚焦差异复核，状态为 `PASS/CLOSED`，并恢复 DFI-5.3.1
  Private Mapping Foundation 单独编码授权。编码前吸收两个非阻断 P3：父方案 120 项与聚焦新增 24 项必须
  分别保留验收证据；父方案 §2.1/§2.3/§2.5 均增加非循环摘要顺序指针。DFI-5.3.2～5.3.4 与下游继续 GATED。

- DFI-5.3.1 在编码前基线核对中命中父方案 §13 停手条件：原 §2.2 同时要求 `strategyDigest` 承诺
  `profileRevision`，而现有 safe Profile revision 又由含 `strategyDigest` 的 material 派生，形成循环依赖。
  新增 docs-only
  [DFI-5.3.1 Private Mapping Digest Ordering 聚焦修订](./docs/development/frontend/DFI-5.3.1-PRIVATE-MAPPING-DIGEST-ORDERING-FOCUSED-REVISION.md)，
  冻结 `Strategy commitment → safe Profile revision → full private mapping digest` 的非循环顺序、双摘要精确
  校验、历史映射失败关闭与 24 项测试增量。当前为 `FOCUSED DIFFERENCE REVIEW PENDING / CODING PAUSED`；
  未修改生产代码、公共 Contract、migration、依赖或 lockfile。

- 用户正式接受 AAPI-0.4 独立 QA（P0～P3 全 0），AAPI-0.4 与 AAPI-0 Foundation conformance 整体
  `PASS/CLOSED`。该关闭仅确认 development/test Admin read integration；production identity/SSO、Admin Read
  HTTP、Browser Security、Admin Adapter、mutation、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin
  v2 consumption 继续 GATED/false。`packages/contracts/src/**` Schema 零修改，Contract 测试与 Java E2E 作为
  门禁证据保留。关闭时清理可重建的 `apps/admin-console/dist-integration/**`，lockfile digest 前后均保持
  `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

- `0.0.0-aapi.0.4` 完成 Admin development/test 只读真实链路：12 个 exact `AdminApiAdapter` GET operation、
  strict `admin-control.v1alpha1` parsing、capability/read route bootstrap、六模块真实 Projection 页面，以及
  `Vite integration build → Node loopback static/proxy child → Central ephemeral port`。production entry 保持
  `UnavailableAdminAdapter`；Browser bearer/identity header、mutation、Fixture fallback 均为 0。真实 Spring Boot +
  built Admin + proxy Harness、Admin 10 files / 37 tests、root 284 files / 1961 tests + 3 smoke、Central
  online/offline 424/424、frozen install/lint/audit 全绿。唯一新增依赖为 Admin importer 的 workspace Contracts，
  无新 registry package；production identity/Admin HTTP/Browser security/Adapter 继续 false。当前为
  `IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING`，详见
  [实施报告](./docs/development/AAPI-0.4-BROWSER-SECURITY-ADMIN-ADAPTER-DEVELOPMENT-TEST-INTEGRATION-IMPLEMENTATION-REPORT.md)。

- 用户正式接受 AAPI-0.3 独立 QA，AAPI-0.3 现为 `PASS/CLOSED`；P3 仅作为 Admin Browser 仍待 AAPI-0.4
  的阶段边界保留。新增 docs-only
  [AAPI-0.4 Browser Security / Admin Adapter / Development-Test Integration 详细方案](./docs/development/AAPI-0.4-BROWSER-SECURITY-ADMIN-ADAPTER-DEVELOPMENT-TEST-INTEGRATION-PLAN.md)：
  冻结 same-origin loopback proxy、服务端 test Principal/Browser 零 bearer、12 exact Adapter methods、strict
  Contract parse、capability/route 映射、六模块真实只读页面、CSP/Origin/Fetch Metadata/no-store、真实
  Central+Vite integration、96 项 QA 与 7～10 日估算。production identity/SSO 不作为 test-only read integration
  前置，仍 deferred/false；mutation route/method=0。该条记录初版方案状态，Revision 1 当前状态以上一条聚焦
  差异收口记录为准。

- AAPI-0.4 方案完成 Revision 1 docs-only 聚焦差异收口：§0/§4.1/§17 统一以 §8.1 为唯一权威拓扑，固定
  `Vite integration build → Node loopback static/proxy child → Central ephemeral port`，Vite HMR/development
  proxy 不作为严格 CSP 证据；独立复核事实同步更正为 Contract v1alpha1 共 12 文件、现有 Fixture/Unavailable
  Adapter 无 Zod validation。聚焦确认 `P0～P3=0`，当前仍 `CODING GATED`；未修改代码、依赖或 lockfile。

- `0.0.0-aapi.0.3` 完成 Central 六模块 read-only Projection inventory 与 `/admin/v1alpha1` test-only HTTP
  shell：精确 12 条 GET、0 mutation，服务端 Principal/capability authorization、queryRevision、稳定排序、
  per-runtime HMAC cursor、ETag/304 与 typed safe error 全部接通。Model/Robot/Skill/Knowledge 只读取通过
  integrity verification 的 active snapshot/exact package，Audit 只读既有 pending outbox，Tool 在 TGM/risk
  authority 缺失时保持 gated；不新增 Repository 读语义、不修改既有写路径。专项 8 Java classes / 33 tests +
  2 TS files / 10 tests、root check 284 files / 1961 tests + 3 smoke、Central online/offline 424/424 全绿；
  production identity/Admin HTTP/Browser security 与全部下游继续 false/GATED。详见
  [实施报告](./docs/development/AAPI-0.3-READ-ONLY-PROJECTION-INVENTORY-HTTP-SHELL-IMPLEMENTATION-REPORT.md)。

- 用户接受后端 / Desktop / Admin 接口解阻优先级，新增 docs-only
  [AAPI-0.3 Read-only Projection Inventory / HTTP Shell 详细方案](./docs/development/AAPI-0.3-READ-ONLY-PROJECTION-INVENTORY-HTTP-SHELL-DEVELOPMENT-PLAN.md)：
  冻结六模块可信 authority inventory、诚实 partial/unavailable、12 条 test-only GET route、服务端 capability
  authorization、queryRevision/cursor/ETag、production Controller/mapping/source count=0、96 项 QA 与 7～12 日
  估算。该条记录的是当时的方案状态；AAPI-0.3 后续已实现并由用户接受关闭，当前状态以上方最新条目为准。

- 用户正式接受 R2D-4 独立 QA（P0=0、P1=0、P2=0、P3=0），R2D-4 与 R2D 工程线 conformance 整体
  `PASS/CLOSED`。本次关闭只确认 `R2D_CORE_DELTA_CONFORMANT`；production CPC activation、production R2D
  gate、production enterprise entitlement 与全部下游 readiness 继续 false，DFI-5.3、AAPI-0.3～0.4、TGM、
  Knowledge Provider、Memory、Effect Reconciliation、Agent Lifecycle 与 Desktop/Admin v2 consumption
  不自动解锁。

- `0.0.0-r2d.4` 完成 closure-only Lifecycle / Cutover / Closure Harness：五个 durable named barrier 后真实
  Core child SIGKILL、新 PID 与 SQLite same-file reopen；恢复阶段 current authority read=0；三个 fresh process
  使用同一受控 FakeClock seed，`acceptedAt/createdAt/lockedAt/observedAt/committedAt` 全部进入 semantic
  material，1ms 漂移会改变真实 plan 与 semantic digest；80 次负向泄漏注入全部可检出，正常四通道命中 0，
  12 类真实资源归零。专项 18 files / 179 tests、完整 root check 283 files / 1958 tests + 3 smoke、Central
  online/offline 404/404、audit 全绿；production CPC/R2D/enterprise entitlement 与全部下游 readiness 继续
  false。本批未改 Core 生产实现、Contract、migration、Provider、Desktop/Admin/Central/Document Worker、
  依赖或 lockfile。详见
  [实施报告](./docs/development/R2D-4-LIFECYCLE-CUTOVER-CLOSURE-HARNESS-IMPLEMENTATION-REPORT.md)。

- 用户正式接受 R2D-3.3 独立 QA，R2D-3.3 与 R2D-3 阶段整体 `PASS/CLOSED`；Central tracing exporter timeout、
  本机端口占用作为非阻断环境 P3 留待对应子系统，Desktop v1alpha3 Receipt 的 `defaultModelId` 兼容投影保留到
  Desktop/Admin v2 consumption，且不作为 Agent default authority。新增 docs-only
  [R2D-4 Lifecycle / Cutover / Closure Harness 详细方案](./docs/development/R2D-4-LIFECYCLE-CUTOVER-CLOSURE-HARNESS-DEVELOPMENT-PLAN.md)：
  冻结 production gate 三态、真实 Core child/SIGKILL/SQLite reopen、首次接受/Dynamic Facts/重放/多版本
  single-dispatch、三轮 semantic replay、80 次负向泄漏注入、12 类资源归零、96 项 QA 与诚实
  `R2D_CORE_DELTA_CONFORMANT` 输出；当前 `DOCUMENT REVIEW PENDING / CODING GATED`，未进入编码。

- `0.0.0-r2d.3.3` 完成首次 SubmitTurn durable acceptance：复用既有四阶段 coordination，在既有 JSON 列中
  增加 Core-private 双 envelope；SQLite 单 transaction 与 InMemory staged-state single-swap 原子提交 Task、
  Model/Tool locks、Runtime Selection v1alpha3、Authorization、ReasoningModeLock 与 Task Instruction Binding；
  accepted/message recovery 不重读 current authority，completed 后才启动 Agent Loop。专项 6 files / 74 tests、
  非沙箱 root check 280 files / 1938 tests + 3 smoke、Central online/offline 404/404、audit 全绿；production CPC/R2D/
  enterprise entitlement 继续 false，R2D-4 与全部下游继续 GATED。详见
  [实施报告](./docs/development/R2D-3.3-DURABLE-ACCEPTANCE-COORDINATION-IMPLEMENTATION-REPORT.md)。

- R2D-3.3 详细方案升级 Revision 1，机械吸收独立复核 `PASS_WITH_REVISIONS` 的一个 P2 与两个 P3：业务
  `acceptanceReceiptIdentity` 固定等于 `submitTurnCommandId`，transport 使用独立
  `preallocatedDeliveryId`；复用现有 `TaskInstructionBindingV1` schema/derive/validate helpers；SQLite 保持
  transaction，InMemory 固定 staged-state single-swap；四类状态转换后强制重算 envelope digest。108 项 QA 通过
  收紧既有编号保持连续。当前 `USER ACCEPTANCE PENDING / CODING GATED`，未改生产代码、Contract、migration、版本、
  依赖或 lockfile。

- 用户正式接受 R2D-3.2 聚焦环境 re-QA，`0.0.0-r2d.3.2` 标记为 `PASS/CLOSED`。确认原
  `database.enableDefensive` 失败来自 QA shell 误用 Node 22.22.1；项目 Node 24.13.0 基线完整门禁全绿，
  不建立 repair、不增加 Node 22 fallback，`dcf13c` 本轮未复现且不保留 P3。新增 docs-only
  [R2D-3.3 Durable Acceptance / Coordination v1alpha4 / Task Bundle Atomic Commit 详细实施方案](./docs/development/R2D-3.3-DURABLE-ACCEPTANCE-COORDINATION-DEVELOPMENT-PLAN.md)：
  冻结既有四阶段 coordination、Core-private 双 durable envelope、首次 authority 调用次数、Runtime Selection
  v1alpha3 Task bundle 原子提交、Task Instruction Binding 同 transaction durable、Provider 前
  `task_committed` barrier、exact recovery/cutover 与 disabled activation gate。方案为
  `DOCUMENT REVIEW PENDING / CODING GATED`；R2D-3.3 明细估算由 2～4 日修正为 3～5 日，R2D-3 合计
  7～11 日、R2D 总计 14～23 日。未改生产代码、Contract、migration、依赖、版本或 lockfile。

- `0.0.0-r2d.3.2` 完成单一 `AgentResourceDecisionPlanner`、可信 Entitlement/Agent/Registry/Workspace/Auth
  exact intersection、explicit/preference/stable ordinal Model 真值表、Entitlement/Tool policy Ports、code-owned
  `agent.general` exact material 与 `agent.fixture.desktop-scripted` 隔离。专项 7 files / 65 tests、非沙箱 root
  check 279 files / 1930 tests + 3 smoke、Central online/offline 404/404、lint/boundary/audit/frozen install 全绿；
  lockfile 未变、migration 止 26。production SubmitTurn v1alpha4 未接线，CPC/R2D/enterprise entitlement 继续
  false；独立 QA 已由用户正式接受，当前 `PASS/CLOSED`。

- 用户正式接受 R2D-3.1 独立 QA，`0.0.0-r2d.3.1` 标记为 `PASS/CLOSED`；唯一 P3 为非本批的
  `dcf13c` 并发偶发，focused 复跑 PASS，留待对应子系统处理。新增 docs-only
  [R2D-3.2 `agent.general` Exact Material 编码前置聚焦确认](./docs/development/R2D-3.2-AGENT-GENERAL-EXACT-MATERIAL-PREFLIGHT-CONFIRMATION.md)：
  以 Core Prompt Revision 2 的完整默认 Agent block 为 authority，关闭旧 R2D 草案“通用机器人”与产品
  “通用助手”的文本漂移，冻结 stable ID、v1alpha2、`system_builtin`、中文 exact material、四类
  unrestricted、最小 text capability、固定 release epoch 与预计算 revision/digest。当前仍为
  `FOCUSED CONFIRMATION PENDING / CODING GATED`；本轮未修改生产代码、Contract、版本、migration、依赖或
  lockfile，R2D-3.3、R2D-4 与全部下游继续 GATED。

- `0.0.0-r2d.3.1` 完成 R2D-3.1 Entitlement / Decision / private revisions Contract foundation：新增
  Core-private `TaskResourceEntitlementSnapshotV1` 与 `AgentResourceDecisionV1` strict schema、独立 canonical
  digest domain、稳定 ordinal/identity evidence/portable exact ref 校验；新增 exact private subpath
  `@robothree/contracts/runtime-selection/v1alpha3` 与
  `@robothree/contracts/submit-turn-coordination/v1alpha4`，冻结 entitlement/decision/selection/authorization/
  Task bundle/Instruction Binding/Model-Tool-Reasoning lock/durable acceptance 的 content-free binding。
  v1/v2 selection、v1～v3 coordination 与 Contracts roots 保持字节零漂移；新版本仅由单次 schemaVersion
  dispatch helper 读取，损坏记录不 fallback。`harness:r2d3.1` 8 files / 91 tests、非沙箱 root check
  275 files / 1897 tests + 3 smoke、Central online/offline 404/404、audit 与 frozen offline install 全绿；
  lockfile 未变、migration 止 26、production consumer/Entitlement Source/R2D activation 全部为 0/false。
  当前为 `IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING`；R2D-3.2～R2D-4 与下游继续 GATED。

- R2D-3 详细方案修订为 Revision 1：产品级“首次接受原子锁定”改为复用既有 durable coordination，冻结
  `task_committed` 为首次 Provider/Invocation 前 barrier；`accepted`/`message_appended` 仅为内部恢复状态，
  不对外投影成功，restart 复用原 accepted plan 且 Agent/entitlement/Preference/Planner load count=0。
  删除新增跨 Repository aggregate Port 与“全部事实必须同一 SQLite transaction”的过强要求，保留既有 Task
  bundle 局部原子事务、v1alpha3/v1alpha4、可信交集、`agent.general` 和 exact recovery。R2D-3 估算由
  12～20 日修正为 6～10 日，R2D-4 由 2～4 日修正为 1～2 日，R2D 总估算由 20～34 日修正为
  13～22 日。当前仍 `FOCUSED DIFFERENCE REVIEW PENDING / CODING GATED`，未修改生产代码、版本、migration、
  依赖或 lockfile。

- 用户正式接受 R2D-2 独立 QA，`0.0.0-r2d.2` 标记为 `PASS/CLOSED`；唯一 P3 为非本批的 `dcf13c`
  并发偶发，focused 复跑 PASS，留待对应子系统处理。新增 docs-only
  [R2D-3 Runtime Selection / Entitlement / Atomic Acceptance 详细方案](./docs/development/R2D-3-RUNTIME-SELECTION-ENTITLEMENT-ATOMIC-ACCEPTANCE-DEVELOPMENT-PLAN.md)：
  冻结可信 Entitlement Snapshot、单一 AgentResourceDecisionPlanner、Model 选择真值表、Runtime Selection
  v1alpha3、coordination v1alpha4、code-owned `agent.general`、fixture 隔离及首次 SubmitTurn 单事务接受；
  R2D-3 拆为 3.1～3.3，估算 12～20 日，R2D 总估算细化为 20～34 日。R2D-3 仍
  `DOCUMENT REVIEW PENDING / CODING GATED`；本轮未改生产代码、版本、migration、依赖或 lockfile。

- `0.0.0-r2d.2` 完成 Agent Definition v1alpha2 与四类资源限制 Contract：新增 exact private subpath、
  Model / Skill / Tool / Knowledge 四类 `unrestricted | allowlist` strict union、portable exact refs、独立
  canonical digest 与单次 schemaVersion dispatch compatibility interpreter。v1 Skill / Knowledge 逐字段
  显式投影且禁止 spread，`materializedRef` 不进入 portable output；v1 default model 不伪造 revision/digest。
  `harness:r2d2` 7 files / 72 tests、非沙箱 root check 271 files / 1846 tests + 3 smoke、Central
  online/offline 404/404、lint、Architecture boundary、packaging audit 与 frozen offline install 全绿；
  lockfile 未变、migration 止 26、production consumer count=0。当前为
  `PASS/CLOSED`，R2D-3～R2D-4 与全部下游继续 GATED。

- 用户正式接受 R2D-1 独立 QA，`0.0.0-r2d.1` 标记为 `PASS/CLOSED`；唯一 P3 为非本批的
  CGF-2B3.2/Central timing 偶发，保留给对应子系统处理。新增 docs-only
  [R2D-2 Agent Definition v1alpha2 与四类资源限制 Contract 详细实施方案](./docs/development/R2D-2-AGENT-RESOURCE-RESTRICTION-CONTRACT-DEVELOPMENT-PLAN.md)，
  冻结 private subpath、四类 `unrestricted | allowlist` strict union、portable exact refs、独立 v2 digest
  domain、v1 compatibility interpreter、84 项 QA 与 production consumer count=0；详细工期 3～5 日，R2D
  总工期细化为 12～21 日。R2D-2 仍 `DOCUMENT REVIEW PENDING / CODING GATED`，本轮未创建 Contract/代码、
  未改版本、migration、依赖或 lockfile，所有 production activation/downstream 保持 false/GATED。

- `0.0.0-r2d.1` 完成 Dynamic Request Facts：Core-controlled UTC current time、code-owned `zh-CN` locale、
  runtime IANA timezone、独立 facts digest、唯一 non-authorizing request-scoped System Message、content-free
  Context Receipt evidence，以及 main / compaction / Local Personal Invocation Link 的 additive readable v2。
  Enterprise 与 Local Personal Provider、Agent Loop 和 Compaction 可按 durable winner exact recovery；production
  bootstrap 未注入 runtime，CPC activation 与 enterprise entitlement 继续 false。`harness:r2d1` 10 files /
  93 tests、非沙箱 root check 268 files / 1818 tests + 3 smoke、lint、Architecture boundary、packaging audit 与
  frozen offline install 全绿；lockfile digest 保持 `c47641ac…`、migration 止 26。独立 QA 已用 JDK 21 补跑
  Central：online 404 PASS，offline 的 CGF-2B3.2 timing 偶发单测复跑 PASS，确认为非 R2D-1、非阻断；用户已
  正式接受关闭。R2D-2～R2D-4 与全部下游继续 GATED。

- [R2D-0 Product Revision 2 Core Delta 详细实施总方案](./docs/development/R2D-0-PRODUCT-REVISION-2-CORE-DELTA-DEVELOPMENT-PLAN.md)
  已通过独立文档复核并由用户接受，计划评审正式 `PASS/CLOSED`；四批范围、按 R2D-2 细化后的 12～21 日估算、96 项父级 QA 与
  production/downstream false 边界保持不变。

- `0.0.0-cpc.3-repair.1` 关闭 CPC-3 独立 QA 的一个 P2：真实进程 fixture 改为与 production
  `DurableAgentLoopStarter` 一致地使用 exact `bundle.binding.bundleDigest`，不再对已含 digest 的 binding
  二次摘要。修复后 `harness:cpc3` 9 files / 68 tests 全绿，三轮 semantic replay digest 更新为
  `sha256:e654fb70…ac168`；packaging audit、完整 root check 266 files / 1794 tests + 3 smoke、
  frozen offline install 与 lockfile/migration 边界均复跑通过。production Core 文件、Contracts、migration、
  依赖与 lockfile 均未修改。
  独立 re-QA 为 P0～P3 全 0，用户已正式接受；repair.1、CPC-3 与 CPC 全线依次标记为 `PASS/CLOSED`。
  production activation 和全部下游继续 disabled/GATED，本次关闭不构成下游编码授权。

- `0.0.0-cpc.3` 完成 CPC-3 Lifecycle / Eval Closure：新增真实 CPC compiler/runtime/context +
  Durable Agent Loop 的 50-round Tool continuation 与 Compaction 收口，以及真实 Core child、SQLite
  reopen、C1～C6 exact barrier/SIGKILL、三轮 semantic replay、12 类 conflict/injection corpus、四通道
  80 次多编码泄漏负向证明和 12 类真实资源归零。`harness:cpc3` 9 files / 68 tests、
  非沙箱 root check 266 files / 1794 tests + 3 smoke、Central online/offline 404/404 以及 frozen
  offline install 全绿；lockfile digest 保持 `c47641ac…`，migration 仍止 26。最高工程输出仅为
  `CPC_CORE_PROMPT_MVP_CONFORMANT`；真实模型评估因缺获批 profile 如实保持 pending，production
  CPC activation 继续 disabled，production Skill resolver / Knowledge / Memory / Effect / Desktop/Admin 继续
  false/GATED。repair.1 修复通过独立 re-QA 并由用户接受后，本批与 CPC 全线已正式 `PASS/CLOSED`。

- CPC-0 工期已按用户接受的 CPC-3 细化估算同步：CPC-3 由 2～4 个集中工程日修正为
  3～5 日，CPC 总工期由 9～15 日修正为 10～16 日，不改变三批范围、60 项 QA 或下游门禁。

- 产品文档同步至 PRD v1.6 Final Revision 15、Frontend Experience Revision 16、Model Experience
  Revision 4 与 Core Prompt/Context Revision 2：冻结 Core 接受首次 `SubmitTurn` 时原子创建 Task、
  Task Instruction Binding 与 Runtime Selection，并在第一次模型调用前锁定默认/已选 Agent 与 Model；
  默认通用机器人明确为 Core 内置、不可编辑、具有稳定 ID/revision/digest 的系统 Agent。机器人模型限制统一为
  “关闭=当前用户全部合法模型、开启=已选模型与用户合法模型交集”，候选按后台稳定顺序展示；切换机器人取消
  不兼容 Skill/Knowledge，切回或取消时不自动恢复。同步草稿只需名称、测试/发布需名称+简介+行为与规则且只测试
  已保存 revision，Dynamic Request Facts 每轮固定包含当前时间、应用语言和系统时区，个性化自定义指令不进入
  MVP 生产上下文。本轮仅修改产品 PRD/Feature Spec/体验规范/MVP 基线/产品索引；Core Prompt Revision 1 的
  技术复核 PASS 及 CPC-1/CPC-2 关闭历史保持不变，Revision 2 进入聚焦技术差异复核，未修改生产代码、公共
  Contract、开发计划、版本、migration、依赖或 lockfile。

- 用户正式接受 CPC-2 独立 QA，`0.0.0-cpc.2` 标记为 `PASS/CLOSED`；独立 QA 已用 JDK 21 补跑 Central
  online/offline，均为 404/0/0/0 / BUILD SUCCESS。production CPC activation 继续 disabled。DFE-7A 原 Core
  drift 已由独立 CPC-2 批次完成授权与 QA，不再污染 Renderer；用户单独接受 `0.0.0-dfe.7a`，DFE-7A 正式
  `PASS/CLOSED`，但 Skill Catalog、Tool 管理、创建/发布不因关闭解锁。新增 docs-only
  [CPC-3 Lifecycle / Eval Closure 详细方案](./docs/development/CPC-3-LIFECYCLE-EVAL-CLOSURE-DEVELOPMENT-PLAN.md)：
  复用既有真实进程 Harness，冻结 50-round Tool/Compaction、SIGKILL + SQLite reopen、三轮 semantic replay、
  conflict/injection corpus、Provider/敏感扫描与资源归零；deterministic corpus 只作为工程 conformance，不冒充
  真实模型行为。该 docs-only 状态随后已被上方 `0.0.0-cpc.3` 实现条目取代；方案批本身未修改
  生产代码、依赖、migration 或 lockfile。

- `0.0.0-cpc.2` 实现 CPC-2 Runtime Integration：以 durable `platformPromptRevision` 精确区分历史 legacy、
  CPC v1 与 unknown Task；production release decision 继续默认 disabled。CPC-1 的首层 selection 已收口为单次
  typed parse，Agent Loop 在 terminal replay 后且 Provider resolve 前单次物化 immutable Instruction Bundle；
  Context Pipeline 使用专用 locked bundle 输入并发送唯一 System Message，Receipt / provenance 只记录 content-free
  binding、assembly、bundle 与 ordered source evidence，Compaction summary 保持 data-only。CPC typed error 通过既有
  `fail_run` 输出固定安全摘要；无 production Skill resolver 时带 Skill Task typed fail-closed。Focused
  `8 files / 73 tests`、非沙箱完整 root check `262 files / 1771 tests + 3 smoke`、frozen offline install、lint、
  Architecture boundary、`audit:dtp4` 与独立 QA 补跑 Central online/offline 均通过。
  lockfile digest 保持 `c47641ac…`，migration 仍止 26。用户已接受并正式关闭 CPC-2；CPC-3 与全部下游继续 GATED。

- `0.0.0-dfe.7a` 实现 DFE-7A Robot / Tool Catalog Renderer Consumption：Desktop Intelligence Center
  现在通过 Renderer Adapter 消费既有 v1alpha2 `robot_tool_catalog`，使用
  `negotiateCatalog/listRobots/getRobot/listTools/getTool` 五方法读取真实 Robot / Tool Catalog Summary 与
  Detail。Robot/Tool 列表只展示 Contract 可证明字段，详情按需调用真实 detail API；分页、搜索和统计均收敛为
  “已加载内容”语义，Skill Catalog 生产页面改为纯 GATED 状态。删除旧 `mockSkills/mockTools`、`modelCallable`、
  lifecycle “已接入”、“模型可调用工具”和“我创建的机器人”筛选等不可证明语义；`catalog.runtime_changed`
  现在清空列表、详情、cursor、queryRevision、pagination 与 in-flight epoch，只允许用户点击刷新后重新协商。
  Focused DFE-7A tests 5 files / 22 tests、Desktop build、offline frozen install、`audit:dtp4` 与静态边界扫描
  均通过；`pnpm-lock.yaml` digest 保持 `c47641ac…`。独立复核曾发现同一工作区 CPC-2 Core drift；
  后续该 Core drift 已作为独立 CPC-2 批次追认、独立 QA 并由用户关闭。Claude Code 复核确认 DFE-7A
  Renderer 与 CPC-2 零耦合，用户已单独接受并关闭 DFE-7A。Skill Catalog、Tool 管理、Agent/Skill 创建、
  TGM、Knowledge Provider、Personal Model/Credential 与所有未实现后端能力继续 GATED。

- 用户正式接受 `0.0.0-cpc.1` 独立 QA，CPC-1 `PASS/CLOSED`；P3-1 的首层 generic parse/冗余解析纳入
  CPC-2 强制收口，production Skill resolver 为 0 继续作为已知阶段边界。新增 docs-only
  [CPC-2 Runtime Integration 详细方案](./docs/development/CPC-2-RUNTIME-INTEGRATION-DEVELOPMENT-PLAN.md)：
  冻结 durable prompt revision 驱动的 legacy/CPC mode、terminal replay 后且 Provider resolve 前的单次 typed
  materialization、Context Pipeline bundle 专用输入、content-free Receipt/provenance、main/Tool/补充输入/
  Compaction/retry/restart exact reuse、Provider System Message body regression 与 activation fail-closed。
  方案保持 4～6 个集中工程日并细化 CPC-0 QA-021～040；独立文档复核为
  `PASS（P0=0、P1=0、P2=0、P3=2，均非阻断）`。docs-only 收口已写死现有 legacy Desktop marker 的 exact
  code-owned 常量，并明确 Compaction summary 只属 data/message 层、不产生第二条 System Message；当前为
  `USER ACCEPTANCE PENDING / CODING GATED`，未修改生产代码、Contract、migration、版本、依赖或 lockfile。

- DFE-7A Revision 1.1 独立差异复核 `PASS（P0=0、P1=0、P2=0、P3=2，均非阻断）`：既有 v1alpha2 Robot/Tool Catalog API、Main
  caller/runtime lease、Preload surface、Renderer routes 与 Contract 字段逐项可实现；五方法 Adapter、raw UUID、
  Summary/Detail 边界、opaque cursor、独立状态、Skill 纯 GATED、穷尽安全文案和敏感边界均已闭合。两个 P3 的
  docs-only 收口已补 `runtime.request_aborted` 并纠正评审前自标 PASS；原复核计数保持如实记录。当前仍为
  `USER ACCEPTANCE PENDING / CODING GATED`，未修改 Desktop 生产代码或任何后端。

- `0.0.0-cpc.1` 完成 CPC-1 Instruction Foundation：将产品冻结的 Platform Prompt v1 固化为 immutable Core
  release artifact，新增从 exact TaskRuntimeSelection + SubmitTurn bundle 确定性派生的
  `TaskInstructionBindingV1`、Platform/Task Boundary/Agent/Skill 四层 Core-private source、safe Task Boundary、
  exact Agent materializer、`LockedSkillInstructionResolver` Port、单一 canonical System Message compiler 与 locked
  instruction budget preflight。无 production Skill resolver 时无 Skill Task 可物化、带 Skill Task typed
  fail-closed；production graph 仍未接 Agent Loop/Provider，feature 默认 disabled。Focused 4 files / 51 tests、
  完整非沙箱 root check 260 files / 1751 tests + 3 smoke、Central online 404/404 与 offline 从零复跑 404/404、
  frozen offline install、lint、Architecture boundary、`audit:dtp4` 均通过；lockfile digest 保持 `c47641ac…`，
  migration 仍止 26。独立 QA 后已由用户正式接受为 `PASS/CLOSED`；CPC-2～CPC-3、
  Knowledge Provider、Memory、Effect Reconciliation、Desktop/Admin 和 DFI-5.3 编码继续 GATED。

- 新增并收敛 docs-only
  [CPC-0 Core Prompt / Context Assembly 详细实施总方案 Revision 1.1](./docs/development/CPC-0-CORE-PROMPT-CONTEXT-ASSEMBLY-DEVELOPMENT-PLAN.md)：
  纠正 Revision 0 将 Knowledge retrieval、Effect `uncertain` 核对和两次 migration 一并计入系统提示词的范围扩张；
  Revision 1 复用既有 TaskRuntimeSelection、SubmitTurn bundle、Context Pipeline、ModelRequest、Agent Loop、Compaction
  与 durable Provider，冻结确定性 Binding 派生、Platform/Task Boundary/Agent/Skill 四层 source、单一 canonical
  System Message、预算/Receipt/restart 一致性及 Skill/Reference/Dynamic 可插拔接缝。计划收敛为 CPC-1～CPC-3、
  60 项 QA 与 **10～16 个集中工程日**，不新增 migration、不修改 Provider-private DFI-5 mapping；Knowledge Provider、
  Memory、Effect Reconciliation、Desktop/Admin 继续 GATED。Revision 1.1 进一步写死单条 System Message 的 bundle
  identity、Core-private 类型只落 `services/core/**`，并明确无 production Skill resolver 时的可用面；当前为
  `REVISION 1.1 / PLAN REVIEW PASS/CLOSED`，未修改生产代码、公共 Contract、依赖、版本或 lockfile。

- 用户正式接受 DFI-5.2.3 独立 QA（P0～P3 全 0），DFI-5.2.3 与 DFI-5.2 阶段整体正式
  `PASS/CLOSED`。新增 docs-only
  [DFI-5.3 Provider Mapping 详细方案](./docs/development/frontend/DFI-5.3-PROVIDER-MAPPING-DEVELOPMENT-PLAN.md)：
  冻结 safe Profile/Task lock 与 Provider-private raw mapping 的双层边界、Strategy digest 对 exact private
  mapping 的不可逆承诺、`default_passthrough`/fallback 三 Provider body-level 完全省略、`max_applied` exact
  Profile/Strategy/timeout 校验、additive Enterprise Gateway v1alpha3、OpenAI/Anthropic/Local Personal 三个 typed
  projector、Usage/timeout/Secret 边界以及真实受控 HTTP/TLS Provider fixture。详细估算为 18～30 个集中工程日，
  拆为 DFI-5.3.1～5.3.4 四个串行子批；独立文档复核 P0～P3 全 0，用户确认方案可冻结，当前为
  `PLAN REVIEW PASS/CLOSED / CODING GATED`，未修改生产代码、Contract、migration、依赖或 lockfile。正常进入顺序
  冻结为 CPC-1～CPC-3 整体关闭、AAPI-0.3～0.4 完成或用户明确调整优先级后，再单独授权 DFI-5.3.1；production
  SubmitTurn v1alpha3、Desktop Max UI、DFI-5.4、AAPI-0.3～0.4、
  TGM、Knowledge Provider 继续 `GATED`；Core Prompt/Context Revision 1 保持独立技术线。

- 新增并按技术复核修订产品级
  [Core Prompt 与上下文组装 Feature Spec v1.0 Revision 1](./docs/product/CORE-PROMPT-AND-CONTEXT-FEATURE-SPEC-v1.0.md)，
  并同步 PRD Revision 14、MVP 功能基线和产品索引：冻结 Platform/Task Boundary/Agent/Skill 的
  `hard / hard / role / advisory` 分层，Knowledge、Memory、文件、网页和 Tool Payload 的 `reference`
  语义，以及 Task-stable Bundle 与 Dynamic Request Facts 分离、Task Instruction Binding、Context Receipt、
  Agent 一次编译、全部锁定 Skill 主正文预算、Knowledge replay、单一 Bundle Compiler、Tool 结构化 outcome、
  Effect `uncertain` 三动作核对和四类测试矩阵。明确 `bundleDigest` 不含按轮事实、Reference 永不进入 System、
  MVP 不使用 Developer Role、核对不改写或重发原 Effect、超预算不自动换模型，也不建设独立大型 Context
  Platform、新 ObservationEnvelope、实时 Knowledge Provider 或 Durable Task Brief。本轮仅修改产品文档，
  技术负责人聚焦差异复核现为 `PASS（P0～P3 全 0）`，当前状态更新为
  `PRODUCT SPEC FROZEN / IMPLEMENTATION PLAN ALLOWED / CODING GATED`；允许后续独立 Core Context docs-only
  实施总方案，但未授权编码，也未修改生产代码、公共 Contract、IPC、数据库、Provider、依赖、DFI-5.3/5.4
  或开发计划。

- `0.0.0-afe.3a` 完成 AFE-3A Admin Tool Pages Foundation：Admin Console 工具管理页新增 Tool 六列聚合列表、
  Tool 详情页、连接 API 两步壳、连接 MCP 三步壳和 Tool 策略配置壳；新增 Tool page types、Prototype/GATED
  fixture、纯 presentation、prototype 提示和技术详情折叠组件。所有输入、解析、验证、保存、启停和策略操作保持
  disabled/GATED，不输出创建、保存、发布、安装、测试或同步成功；页面与 presentation 测试继续禁止 API Key、
  Credential Reference、Endpoint、Token、Bearer、CapabilityLock、requestDigest、stack 或真实内部路径进入展示。
  Admin package 版本升至 `@robothree/admin-console@0.0.0-afe.3a`；Admin gates 全绿（typecheck、negative、
  build、7 files / 33 tests、static/deps scan、dev smoke），Desktop build/tests 与完整 root check
  `255 files / 1710 tests + 3 smoke` 全绿；Claude Code 最终独立 QA 为 PASS（P0～P3 全 0）并由用户接受，
  AFE-3A 正式 `PASS/CLOSED`。未修改 Desktop、Core、Central、Contracts、Main、Preload、IPC、
  migration、root 依赖或 lockfile。AFE-3B、AFE-3C、AAPI-0.3～0.4、AdminAdapter/AFE consumption、TGM、
  Knowledge Provider 与 production identity 继续 `GATED`。

- `0.0.0-ptx.4` 实现 PTX-4 PPTX Visual Preview：Desktop Main 新增 dependency-free PPTX OOXML
  HTML preview renderer，按 Task-scoped artifact source 读取 `.pptx`，用 bounded ZIP/OOXML 解析提取 slide
  count、标题/文本与 table/chart/image markers，并通过既有 APV-1C `127.0.0.1` sandbox HTML Preview
  server 输出无脚本、无样式注入的 SVG slide cards。Task Detail 现在将 PPTX artifact 路由到 visual HTML
  preview 而非 unsupported text preview；Core artifact file source resolver 补齐从 locked Runtime Selection
  恢复 workspace authority 的路径，覆盖 action payload 不携带私有 `workspaceGrantId` 的真实工具链路。
  新增 PTX-4 E2E 与 Main/Core/Renderer 回归，验证 sandbox CSP、loopback preview、真实生成 PPTX 预览、无
  workspace path / raw presentation / script/style 泄漏。Root/Core/Desktop 版本进入 `0.0.0-ptx.4`；
  独立 QA 在非沙箱环境复跑 focused、完整 `pnpm run check` 与版本边界；跨窗口 `audit:dtp4` Core
  版本期望已同步到并行 DFI-5.2.2 当前真实版本 `0.0.0-dfi.5.2.2`。
  用户已正式接受并关闭 PTX-4，PTX-0～PTX-4 当前整体 `PASS/CLOSED`。
  Contracts、Document Worker、Central/Admin、migration、依赖与 lockfile 未修改。本批不实现 PowerPoint/
  LibreOffice 自动化、像素级渲染、PPTX read/edit、thumbnail export 或 PTX 后续 hardening。

- DFI-5.2 Revision 1 独立文档复核已由用户接受，计划评审 `PASS/CLOSED`。`0.0.0-dfi.5.2.1` 实现
  ReasoningModeLock 四种 strict variant 与独立 domain digest、Core-private TaskRuntimeSelection v1alpha2、
  safe Desktop SubmitTurn v1alpha3 以及 Core-private coordination v1alpha3 durable plan Contract；旧 Runtime
  Selection/SubmitTurn/coordination 根入口继续保持 v1alpha1/v1alpha2 原语义，Preload/Renderer/Admin 不可导入
  完整锁和 durable plan。Focused `7 files / 36 tests`、lint/boundary、DTP-4 audit、frozen offline install
  与完整 root check `254 files / 1699 tests + 3 smoke` 全绿；独立 QA 补跑 Central online/offline `404/404`
  且 P0～P3 全 0，用户已正式接受，DFI-5.2.1 `PASS/CLOSED`；lockfile 未修改。新增
  [DFI-5.2.2 详细实施方案](./docs/development/frontend/DFI-5.2.2-REASONING-PLANNER-TASK-BUNDLE-DEVELOPMENT-PLAN.md)，
  冻结 Planner、stale 零副作用、task-locked subject、Task bundle v1alpha2 精确物化、readable union 与恢复/并发
  Harness；计划评审已 `PASS/CLOSED`。`0.0.0-dfi.5.2.2` 已实现唯一 `ReasoningModeLockPlanner`、
  task-locked enterprise/personal Profile subject、default 零 Profile load、max 单次 strict load 与 exact
  support revision CAS；stale/unavailable 在 Message、coordination、Task、lock、selection、authorization、
  binding、Receipt、Loop/Provider 任何 durable 副作用之前失败关闭。TaskPersistence InMemory/SQLite 新增
  reasoning-aware 原子 bundle，v1alpha3 accepted plan 恢复只复用 durable lock/selection，不重读
  Preference/Profile；未新增 migration 27。Focused `12 files / 100 tests`、完整 root check
  `255 files / 1710 tests + 3 smoke`、Central online/offline `404/404`、frozen offline install、lint、
  Architecture boundary 与 `audit:dtp4` 全绿；独立 QA P0～P3 全 0，并由用户正式接受，DFI-5.2.2
  `PASS/CLOSED`。新增 docs-only
  [DFI-5.2.3 ModelRequest / Compaction Binding v1alpha2 与 Lifecycle Harness 详细方案](./docs/development/frontend/DFI-5.2.3-MODEL-REQUEST-COMPACTION-LIFECYCLE-DEVELOPMENT-PLAN.md)，
  计划评审已 `PASS/CLOSED`。`0.0.0-dfi.5.2.3` 实现 Core-private ModelRequest v1alpha2/readable union、
  request/Context receipt 原子 finalizer、main/Tool/continuation/Compaction 共用单一 reasoning materializer、
  Compaction Binding v1alpha2 与 strict executable bundle dispatch；unmapped production Provider 在
  Credential/DNS/socket/Gateway/invocation fact/usage projection 前以 `reasoning_protocol_unavailable`
  失败关闭。新增真实 Core child + SQLite reopen + SIGKILL + three-round semantic replay lifecycle Harness，
  并将既有 50-round Tool Loop/Compaction Harness 扩展为真实 v1alpha2 lock 复用验证。Focused
  `11 files / 111 tests`、完整 root check `258 files / 1723 tests + 3 smoke`、Central online/offline `404/404`、
  lint 与 Architecture boundary 全绿；独立 QA P0～P3 全 0，并由用户正式接受，DFI-5.2.3 与 DFI-5.2 阶段
  整体均为 `PASS/CLOSED`。未新增 migration 27、依赖或 lockfile 变更；production SubmitTurn v1alpha3 route、
  Provider mapping 与 Desktop UI 仍未接入。

- `0.0.0-ptx.3` 实现 PTX-3 Desktop Product E2E：Desktop scripted model provider 现在能把
  `Create ... .pptx` 解析为 `tool.document.pptx.write` tool call，arguments 仅包含 `relativePath`、
  受控 `presentation` 与 `options`，不泄漏 `workspaceRoot`、`limits`、`dataBase64` 或远程 URL。新增
  `tests/e2e/ptx3-pptx-write-productization.e2e.test.ts`，覆盖 `submitTurn -> AgentBridge -> Core Registry
  -> Document Worker -> PPTX 文件生成 -> Artifact projection -> assistant final`，并验证生成的 `.pptx`
  具备基础 OOXML ZIP 结构、conversation / task detail 无 workspace path 或 raw slides 泄漏。Focused PTX-3
  与 DWE/DTP 回归 8 files / 53 tests PASS，Core/DW build、audit:dtp4、offline install、touched-file lint
  均 PASS；并发 DFI Contract lint 阻塞已由共享工作区既有修订解除，完整 lint + Architecture boundary 与
  root check `254 files / 1699 tests + 3 smoke` PASS，PTX-3 未修改 Contracts。PTX-4 Visual Preview
  继续 `GATED`。

- 用户正式接受 DFI-5.1 独立 QA（P0～P3 全 0），DFI-5.1 `PASS/CLOSED`；独立复跑补齐 Central
  online/offline `404/404 PASS`。新增 docs-only
  [DFI-5.2 SubmitTurn v1alpha3 / ReasoningModeLock / Task 精确锁定详细方案](./docs/development/frontend/DFI-5.2-TASK-REASONING-LOCK-DEVELOPMENT-PLAN.md)：
  冻结 default/max strict union、ReasoningModeLock 四 variant、TaskRuntimeSelection 与 ModelRequest
  v1alpha2、SubmitTurn/coordination v1alpha3 durable plan、Compaction Binding v1alpha2、S1～S8/C1～C6/I1～I5
  恢复窗口与 108 项 QA；明确 DFI-5.3 前 production v1alpha3 入口保持不可达、不新增 migration 27、不进入
  Provider raw mapping 或 Desktop UI。当前为 `REVISION 1 / DOCUMENT REVIEW PENDING / CODING GATED`。

- DFI-5.0 Max Reasoning Mode 详细实施方案独立文档复核 PASS 并由用户接受，计划评审正式
  `PASS/CLOSED`。`0.0.0-dfi.5.1` 实现 safe Preview / Projection、独立 Experience Preference、
  migration 26 三张 STRICT 表、owner 独立 HMAC namespace、CAS 与 durable Receipt。新增
  `reasoning-mode/v1alpha1` Profile 与 Desktop Local `v1alpha3` Contract；Preview 只暴露
  `supported | unsupported | unknown`、exact support revision、安全原因与 `default | max` 偏好；
  Preference + Receipt 以 aggregate transaction 完成 CAS，支持 exact replay、same-command/different-material
  conflict 与 concurrent single winner。Focused + migration regression `8 files / 36 tests`、build、lint、
  Architecture boundary 均 PASS；完整 root check 最终从零复跑 `251 files / 1678 tests + 3 smoke PASS`；
  Central 因开发者环境缺 JDK 21 留待独立 QA 补跑，独立 QA 已补齐 `404/404 PASS` 并获用户接受，DFI-5.1
  当前为 `PASS/CLOSED`。未新增依赖、未修改 lockfile；DFI-5.2～5.4、AAPI-0.3～0.4、
  TGM 与 Knowledge Provider 继续 `GATED`。

- `0.0.0-ptx.2` 完成 PTX-2 Tool Activation：Core Registry 正式新增第 6 个 Document Tool
  `tool.document.pptx.write`，模型可见 schema 只暴露 `relativePath`、`presentation`、`options`，不泄漏
  `workspaceRoot`、`limits`、PptxGenJS API 或 Worker 私有字段。Core Document Worker Backend 现在使用 PTX-1
  `normalizePptxWriteOptions()` + `computePptxWriteRequestDigest()` 生成私有 `v1alpha2` requestDigest，create-new
  目标存在时 Core 预检返回 `target_exists` 且不派发 Worker。Desktop private runtime hydration 支持 PPTX
  WorkspaceGrant create 授权和 `routine_file` 风险事实；Artifact projection 将 PPTX 结果作为 `document` kind +
  PPTX mediaType 投影，metadata 有界且 text preview 对 PPTX 返回 unsupported。Focused PTX-2/Core Document Tool
  与 audit 6 files / 46 tests、Core build、Document Worker build/full tests、lint + Architecture boundary 均 PASS。
  Repair.1 将 PPTX 模型可见 schema 收敛为 734 bytes compact schema，关闭默认 Agent catalog 过大导致既有
  DWE3/DTP3B E2E `context.current_turn_too_large` 的 P1 回归；Claude Code 独立复测为 PASS（P0=0、
  P1=0、P2=0、P3=0），完整 `pnpm run check` 现为 251 files / 1678 tests + 3 smoke PASS。用户已正式
  接受并关闭 PTX-2；PTX-3 Desktop Product E2E 与 PTX-4 Visual Preview 继续 `GATED`。

- `0.0.0-ptx.1` 完成 PTX-1 Private ResourceResolver + PPTX Writer。Document Worker 独占依赖窗口安装并固定
  `pptxgenjs@4.0.1`（MIT，package 约 2.5 MiB / 11 files，未发现 install/postinstall 脚本），新增
  `tool.document.pptx.write` 私有 `v1alpha2` Router 分支但未进入 Core Registry / default Agent。实现
  `PresentationSpecV1` 严格解析、受控 `url`/`data` 图片 ResourceResolver、HTTPS resolve -> validate ->
  connect(same IP) pinning、逐跳手动 redirect 校验、Content-Type + png/jpeg/webp magic bytes 一致性、
  PptxGenJS bytes-only Adapter、同目录 temp + fsync + `link(temp,target)` no-clobber 发布、target_exists 与资源
  limit typed detailCode。PTX focused 4 files / 17 tests、Document Worker 全量 25 files / 190 tests、DW build
  PASS；PTX-2 Tool Activation、PTX-3 Desktop E2E、PTX-4 Visual Preview 继续 `GATED`。

- `0.0.0-dfi.4a.3.1-repair.2` 完成 Local Personal Provider Timeout Repair：冻结并接入 30 秒
  connect、90 秒 first progress、300 秒 stream idle、15 分钟默认 overall 的唯一 Policy；移除
  Provider 120 秒 hard max，并让 Agent Loop main/compaction 与 durable Provider 共用 exact timeout
  material。migration 25 additive 保存 Invocation Timeout Fact，重试/重启不得延长 deadline；四类本地
  timeout、用户取消、异常网络和正常 EOF 缺 `[DONE]` 现在精确分轨，late `ECONNRESET` 不再覆盖已锁定的
  timeout cause。开发者专项 8 files / 53 tests、Central online/offline 各 404 tests、frozen install 与
  `audit:dtp4` 均通过；repair.2 自身未修改 lockfile。独立 QA 逐行核查与复跑为 PASS
  （P0=0、P1=0、P2=0、P3=1），用户已正式接受，当前为 `PASS/CLOSED`；此前完整 root check 被 PTX / Document
  Worker dependency allowlist 漂移阻断，该漂移已由 `0.0.0-ptx.1` 关闭，非沙箱 root check 现为
  247 files / 1652 tests + 3 smoke PASS。P3 `ELECTRON_RUN_AS_NODE` 环境限制不阻断关闭。MiniMax
  terminal Profile、Max/DFI-5、Desktop/Admin 与企业
  Provider timeout 不在本批。

- 新增 docs-only
  [PTX PPTX Write Development Plan](./docs/development/ptx/PTX-PPTX-WRITE-DEVELOPMENT-PLAN.md)：冻结
  `tool.document.pptx.write` 的 Contract / Dependency / Resource 边界，确认 `PptxGenJS` 只作为
  `PptxWriterAdapter` 实现细节，不进入模型可见 Tool Contract；冻结 `PresentationSpecV1`、V1 元素白名单
  `text/image/table/chart/shape`、受控 `templateRef`、P0 禁止动画/视频/OLE/macro/远程媒体 embed/任意 XML/
  任意模板导入；允许 URL 图片输入但必须经 Core ResourceResolver 解析为 bytes，Writer 不得联网。ResourceResolver
  规则冻结为 `https` only、resolve -> validate -> connect(same resolved IP)、连接后 remoteAddress 复核、
  自动 redirect 关闭并逐跳重跑校验、Content-Type 与 png/jpeg/webp magic bytes 一致性校验。PTX-0 已
  `PASS/CLOSED`；PTX-1 已由 `0.0.0-ptx.1` 承接实现，PTX-2～PTX-4 继续 `GATED`。

- `0.0.0-dfi.3a.2` 完成 DFI-3A.2 Main / Preload Catalog 接线与阶段收口：Desktop Local
  `v1alpha2` 新增 dedicated `robot_tool_catalog` feature、四条 Core private Catalog POST route、四个
  Main IPC channel 与四个 sandboxed Preload API；Core runtime 组装真实 DFI-3A.1 Robot / Tool
  Catalog Query Service，Main 使用 runtime connection lease 确保 compatibility 与业务查询不跨 runtime 拼接，
  并在返回前 revalidate current lease。Catalog caller binding 绑定 webContents / main-frame / navigation
  epoch，容量上限 16，client mismatch 在 Core 调用前失败关闭；Preload smoke 现验证 Robot/Tool Catalog
  方法存在。新增 focused tests 与 process E2E，覆盖 feature、HTTP 16 KiB request limit、strict Preload
  parsing、caller binding、capacity fail-closed、runtime mismatch/revalidation 和 Main -> Core child 链路。
  开发者验证：DFI-3A.2 harness 6 files / 28 tests PASS，Desktop tests 58 / 233 PASS，root check
  244 / 1630 + 3 smoke PASS，Central online/offline 各 404 tests PASS，DTP-4 audit PASS，frozen install
  PASS，lockfile digest 保持 `b7c6d0a7906001ef503a3c0365663153265aa601103779eeacbd10d1a7f5ade5`。
  独立 QA 为 PASS（P0=0、P1=0、P2=0、P3=1，不阻断）并已由用户接受，当前为 `PASS/CLOSED`；
  DFI-3A 阶段整体 `PASS/CLOSED`。本批未改 Renderer、Admin、
  Central、migration、新依赖或 `pnpm-lock.yaml`，Renderer 消费、AAPI-0.3～0.4、AdminAdapter/AFE
  consumption、TGM、Knowledge Provider、production identity、Max/DFI-5 继续 `GATED`。

- 用户正式接受 AAPI-0.2 独立 QA（P0～P3 全 0），AAPI-0.2 现为 `PASS/CLOSED`。AAPI-0.3～0.4、
  AdminAdapter/AFE consumption、TGM、Knowledge Provider 与 production identity 继续 `GATED`。

- `0.0.0-dfi.4a.3.1-repair.1` 修复 Local Personal OpenAI-compatible SSE Provider 对标准内容帧
  `usage: null` 的错误处理：`null` 与字段缺失现在均表示本帧无 Usage，后续最终真实 Usage 仍正常投影，
  Provider 全程未返回 Usage 时继续保持 unknown、不伪造 0；非空非法 Usage 仍失败关闭。受控 TLS 回归已覆盖
  多个 `usage: null` 内容帧、Tool Call、最终 Usage 与 `[DONE]` 组合。本批不放宽 `[DONE]` 终止要求，
  MiniMax 缺少该标记的兼容性问题继续单独评估。

- 此前新增 docs-only
  [DFI-3A.2 Main / Preload Catalog 接线与阶段收口详细方案](./docs/development/frontend/DFI-3A.2-MAIN-PRELOAD-CATALOG-WIRING-DEVELOPMENT-PLAN.md)：
  基于 DFI-3A.1/AAPI-0.1 已关闭的真实基线，冻结 dedicated `robot_tool_catalog` feature、四条 Core private
  route/Main IPC/Preload API、Main runtime connection lease、client identity 与晚到响应失败关闭、cursor
  restart 语义、typed error 映射、96 项测试矩阵和真实 Electron/Supervisor/Core child E2E。该方案已由
  `0.0.0-dfi.3a.2` 实现条目承接，当前不再作为 coding gate 口径；AAPI-0.3～0.4、Admin 业务页面、
  Max/DFI-5、TGM 与 Knowledge Provider 继续 `GATED`。

- `0.0.0-aapi.0.2` 完成 Test-only Admin Principal / Capability Projection。新增 Central-private
  `com.robothree.central.admincontrol` domain/application/configuration：development/test profile 装配固定
  test-only 管理员 Principal，服务端 Capability Projection 强制 `testIdentityUsed=true` 与
  `productionIdentityReady=false`，provisional Admin capability key 稳定排序且 read/write-action 状态分离；
  production profile 不装配 test-only provider/projection service，且出现 Admin principal provider 时在 HTTP ready
  前失败关闭。补充 `@robothree/contracts/admin-control/v1alpha1` subpath export 自动断言，关闭 AAPI-0.1 的 P3
  自动覆盖提醒。开发者验证：contracts build PASS，AAPI contract focused 1 file / 7 tests PASS，Central
  focused 3 classes / 13 tests PASS，Central online/offline 各 404 tests PASS，root check 243 files /
  1620 tests + 3 smoke PASS。独立 QA 已通过并由用户接受，当前为 `PASS/CLOSED`；
  未接 HTTP runtime、AdminAdapter、真实 RBAC、production identity、Admin 前端、Desktop、Core、Main、Preload、
  IPC、migration、依赖或 lockfile。

- `0.0.0-aapi.0.1` 完成 Admin Control `v1alpha1` TS-only Contract package。新增
  `packages/contracts/src/admin-control/v1alpha1/**`，冻结 strict envelope、test/prod identity flag 组合约束、
  safe error 与未知错误 fallback、opaque cursor、query/resource revision、expectedRevision/CAS、Receipt shape，
  以及 Capability、Model、Robot、Skill、Tool、Knowledge、System 管理投影 schema；新增 Admin-side Robot/Tool
  cross-consumer fixture 和 focused contract tests，证明共同语义与 Desktop fixture 对齐且敏感字段不进入输出。
  新增 `@robothree/contracts/admin-control/v1alpha1` export。开发者验证：contracts build PASS，AAPI focused
  1 file / 6 tests PASS，AAPI+DFI focused 3 files / 16 tests PASS，frozen install PASS，lint 与 Architecture
  boundary PASS。独立 QA 最终 PASS（P0=0、P1=0、P2=0、P3=1；P3 为 subpath export 自动测试覆盖提醒，
  已在 AAPI-0.2 中补自动断言）并由用户接受关闭，当前为 `PASS/CLOSED`；未实现 Central Java mirror、HTTP runtime、
  AdminAdapter、Admin 前端消费、TGM、Knowledge Provider 或 production identity。

- `0.0.0-dfi.3a.1` 完成 Robot / Tool Catalog Contract / Projection / Core Query Foundation：新增 Desktop
  Local `v1alpha2` strict list/get Contract、Robot/Tool safe summary/detail、HMAC opaque cursor、stale cursor、
  整体 Registry/revision 完整性校验、availability 只收窄及 256 KiB 响应上限；新增 cross-consumer
  canonical fixture，覆盖 stable identity、exact revision mapping、限制三态、Tool readOnly/risk，并证明
  Admin-only 字段不进入 Desktop Projection。专项 5 files / 35 tests、Workspace 242 files / 1613 tests +
  3 smoke、Central online/offline 391/391 全绿；独立 QA 按 handoff 复跑 PASS（P0=0、P1=0、P2=0、P3=1）
  并由用户正式接受，当前为 `PASS/CLOSED`。
  本批未接 Main/Preload/Renderer/Admin、未改 migration 或依赖；DFI-3A.2、AAPI-0.2～0.4、Admin 业务页面与
  Max/DFI-5 继续 `GATED`。

- 新增 docs-only
  [AAPI-0.1 Admin API Contract / Projection Binding 详细方案](./docs/development/AAPI-0.1-ADMIN-API-CONTRACT-PROJECTION-BINDING-PLAN.md)：
  基于 AFE-1.1 已关闭和 DFI-3A.1 代码事实，冻结 `admin-control.v1alpha1` 的 Contract / Projection /
  Adapter binding 前置边界、safe error、cursor/CAS/Receipt、Robot/Tool cross-consumer 共同语义与敏感字段禁入。
  当前仅为 `DOCUMENT REVIEW PENDING / CODING GATED`，不创建 Admin API、HTTP Controller、Central wiring、
  AdminAdapter 或业务页面；cross-consumer alignment 与 AAPI-0 Revision 1 已正式 `PASS/CLOSED`，
  DFI-3A.1 已在后续用户接受中关闭，并已单独授权 AAPI-0.1 TS-only Contract 编码。

- `0.0.0-afe.1.1` 完成 Admin Console Scaffold / Route Shell：新增正式
  `apps/admin-console/**` 独立 Vue 2.7.16 package，落地六项一级导航、系统管理三个二级路由、权限壳三层分离、
  PageState 状态矩阵、Design Token / base styles、production-safe `UnavailableAdminAdapter`、正负向
  SFC typecheck、package-local Vitest、static/deps scan 与 dev startup smoke。独立 QA 已由用户接受，
  `apps/admin-console-preflight/**` 已按授权清理并用标准 pnpm 流程重算 lockfile、完成 frozen install；本批未接真实登录、Admin API、Contract、
  Central/Core、Credential、TGM 或 Knowledge Provider。Admin package gate 全绿（5 files / 14 tests），
  Desktop focused 57/226、Vue 2/3 `why vue` 隔离与 root check 240/1603 + 3 smoke 全绿；当前为
  `PASS/CLOSED`。

- 用户正式接受 EIPC-1.1.3.3 独立 QA（P0～P3 全 0），EIPC-1.1.3.3 与 EIPC-1.1 Foundation 正式
  `PASS/CLOSED`，作为 production 默认关闭、不可达的 dormant foundation 保留；真实 SSO、Credential、
  production resolver/codec/signer 与 Runtime identity composition 未实现。EIPC-1.2、EIPC-1.3、EIPC-2、
  EIPC-3 统一改为 `DEFERRED / OUT OF CURRENT RELEASE`，两个 identity blocker 保持打开，测试阶段只允许
  明确 test-only 模拟账号且不得宣称 production identity ready。开发优先级转向 Desktop 真实接口与 Admin
  Console 业务接口；新增 docs-only DFI-3A Robot/Tool Catalog 与 AAPI-0 Admin API Contract/Projection
  Foundation 详细方案，当前均为 `DOCUMENT REVIEW PENDING / CODING GATED`，未修改生产代码、配置、依赖或
  lockfile。

- 根据联合评审与用户“保证核心功能运转、不过度限制、不过度复杂”的要求，将全局 `Max` 从硬约束式锁定收敛为增强偏好：关闭时继续不发送额外推理参数，开启时优先使用已验证的最强模式；模型不支持、提交时能力变化或安全映射失败时按默认模式继续任务，并在提交区、Receipt、任务反馈或只读摘要中明确说明，不新增仅由 `Max` 引起的强制二次提交。偏好保存失败只影响后续默认值，P0 优先复用既有模型/应用偏好、Task Runtime Selection、模型锁和 Adapter Descriptor，不强制独立偏好服务、独立锁体系、一次适配全部模型或五个串行产品项目。同步更新 PRD Revision 12、Frontend Spec Revision 15、Model Experience Spec Revision 3、MVP 功能基线、产品索引和根 README；本轮不修改开发计划、生产代码、Contract、IPC、数据库或原型。

- 产品文档新增全局 `Max` 推理开关：新任务 Composer 只提供一个开关，关闭时沿用当前模型默认行为且不额外发送推理强度参数，开启时由受控 Model Adapter 映射到当前模型已验证支持的最强模式；同步冻结个人偏好、换模重算、不支持时页面内提示、任务请求/解析结果锁定及后续轮次/重试/重启一致性。MVP 不扩展五档选择器，不在 Admin、机器人或个人模型设置中增加 Provider 技术参数。同步更新 PRD Revision 11、Frontend Spec Revision 14、Model Experience Spec Revision 2、MVP 功能基线和产品索引；本轮不修改原型、生产代码、Contract、IPC、Adapter 或开发计划，真实接入继续 GATED。

- EIPC-1.1.3.3 完成 Validator / Common Authorizer / Conditional HTTP Foundation：新增 strict Session
  Token Validator、verification key handle Port、legacy/session Composite Authorizer，并将 Configuration 与
  Model Gateway consumers 一次性切换到 Common Authorizer；Filter 保持 extract-only。新增默认关闭的
  Challenge/Lease HTTP Foundation，property=false 时无 Controller/mapping，property=true 但 production
  依赖缺失或 test-only 时在 HTTP ready 前失败关闭。开发者 Harness 8 classes / 33 tests、Workspace
  240/1603 + 3 smoke、Central online/offline 391/0/0/0 全绿；当前为 `IMPLEMENTED / INDEPENDENT QA PENDING`。
  production resolver/codec/signing/verification provider 仍缺失，两个 identity blocker 继续打开，下游继续
  `GATED`。本批未改 canonical Contract、v0001～v0010、Core/Desktop/Renderer/Admin、root package 或 lockfile。

- 产品文档取消 Admin Skill 上传阶段对 `SKILL.md` 版本声明的强制校验：包内未声明版本、版本无法识别或不符合企业发布版本格式时仍可完成解析并进入编辑页，不进入“未通过校验项”；企业技能发布版本改由管理员在编辑页填写，并在保存草稿前校验格式、唯一性和递增关系。同步更新 PRD Revision 10、Frontend Spec Revision 13、MVP 功能基线和产品索引；本轮不修改管理端原型或生产解析实现。

- 用户正式接受 EIPC-1.1.3.2 独立 QA（P0～P3 全 0），EIPC-1.1.3.2 现为 `PASS/CLOSED`；两个
  identity blocker 继续保持打开。新增 docs-only
  [EIPC-1.1.3.3 Validator / Common Authorizer / Conditional HTTP 详细方案](./docs/development/frontend/EIPC-1.1.3.3-VALIDATOR-COMMON-AUTHORIZER-CONDITIONAL-HTTP-DEVELOPMENT-PLAN.md)：
  冻结 Session Token strict validator、legacy/session Composite 恰好一个成功、verified expiry 保留、
  Filter extract-only、两个 consumer 同批 cutover、Session Endpoint 三态启动和 property=true 依赖缺失时
  HTTP ready 前失败关闭；当前仅为 `DOCUMENT REVIEW PENDING / CODING GATED`，未修改生产代码、Contract、
  migration、版本或 lockfile。

- 产品文档扩展 Admin Skill 包接入范围：支持 `.zip`、`.rar`、`.tar.gz`、`.tgz`，单个上传包上限由 10 MB 调整为 200 MB；包内任意目录存在且只存在一个可识别的 `SKILL.md` 即通过结构校验，系统以其所在目录作为逻辑根目录，并将“未找到”“检测到多个”与“文件已发现但读取、解压或解析失败”分开反馈。同步更新 PRD Revision 9、Frontend Spec Revision 12、MVP 功能基线和产品索引；本轮不修改管理端原型或生产解析实现。

- `0.0.0-eipc.1.1.3.2` 完成 Transactional Challenge / Session Lease Foundation：新增
  requested-permission exact lock、Central-private Session signing handle authority、handle-bound Challenge、
  correlation exact replay/conflict、单一 Decision Assembler，并将 bearer encode、Challenge consume
  与 immutable Lease issuance 收口到同一 transaction closure。MyBatis exact lock 使用静态
  PostgreSQL `ANY(text[]) ORDER BY permission FOR UPDATE`，与 InMemory 共用 conformance，遵守已有
  禁止动态 `<foreach>` 的架构边界。专项 Harness 4 classes / 40 tests、Workspace
  240/1603 + 3 smoke、Central online/offline 363/0/0/0 串行通过；本批最高只输出
  `EIPC1132_TRANSACTIONAL_SESSION_LEASE_CONFORMANT`；独立 QA P0～P3 全 0 并由用户正式接受，现为
  `PASS/CLOSED`。
  未改 Enterprise Session canonical Contract、v0001～v0010、HTTP、Core/Desktop/Renderer 或 lockfile；
  production session 与两个 identity blocker 继续关闭/打开。

- 产品文档补齐 Admin 技能包上传后的编辑阶段：压缩包解析与安全校验通过后进入独立编辑页，管理员可修改技能标题、技能描述、版本号和使用范围；技能名称、`SKILL.md`、文件清单、包摘要和校验事实保持只读，保存草稿不改写原始技能包或运行行为。

- 产品文档将 Admin Console 一级导航由八项收敛为六项；新增“系统管理”导航分组，将“用户与权限”“审计日志”“反馈管理”作为二级页面，并明确系统管理不建设空白概览页、审计入口按权限隐藏、现阶段反馈页面不包含通知发布能力。

- `0.0.0-eipc.1.1.3.1` 完成 EIPC-1.1.3.1 Decision Domain / Ports / Canonical Material。新增 strict
  `OpaqueVerifiedIdentityHandle`、`EnterpriseSessionTokenClaims`、legacy/session `EnterpriseBearerPrincipal`、
  sealed authorization result、Lease request material，以及 `VerifiedIdentityHandleResolver`、
  `EnterpriseSessionTokenCodec`、`EnterpriseBearerAuthorizer` Central-private Port；device source、permission
  source 与 lease request 使用三个独立 canonical digest domain，permission digest 覆盖请求权限全集而非只覆盖
  granted enum。deterministic resolver/codec 仅存在于 test source，production dependency graph 中三个实现数均为 0。
  正式 Harness 5 classes / 36 tests、Workspace 240 files / 1603 tests + 3 smoke、Central online/offline
  351/0/0/0 全部严格串行通过；本批最高只输出 `EIPC1131_DECISION_DOMAIN_CONFORMANT`，production Session、
  HTTP、v0011、Core/Desktop/Renderer 均未进入。EIPC-1.1.3.1 独立 QA 已通过并由用户正式接受，现为
  `PASS/CLOSED`；两个 identity blocker 保持打开，EIPC-1.1.3.2～1.1.3.3 与全部下游继续 `GATED`。

- 用户正式接受 EIPC-1.1.2 独立 QA（P0～P3 全 0），EIPC-1.1.2 现为 `PASS/CLOSED`；两个 identity
  blocker 继续保持打开。新增 docs-only
  [EIPC-1.1.3 Central Decision / Validator / HTTP Foundation 详细方案](./docs/development/frontend/EIPC-1.1.3-CENTRAL-DECISION-VALIDATOR-HTTP-FOUNDATION-DEVELOPMENT-PLAN.md)：
  冻结 handle-bound Challenge、同事务 Session Lease 11 步、strict Session validator、legacy/session
  common authorizer、conditional HTTP activation、C1～C7/L1～L11/V1～V8 恢复窗口与 108 项 QA；拆为
  1.1.3.1～1.1.3.3 串行独立门禁。当前仍为 `DOCUMENT REVIEW PENDING / CODING GATED`，未修改生产代码、
  Contract、migration、版本或 lockfile。

- `0.0.0-eipc.1.1.2` 完成 PostgreSQL v0010 + Persistence Foundation。新增完整 B0010 fresh baseline、
  U0010 exact v0009 upgrade、manifest/sidecar、immutable Enterprise Session Challenge Binding / Lease
  Issuance、聚合式 `EnterpriseSessionPersistence` Port，以及 InMemory/MyBatis PostgreSQL 双 Adapter；indexed
  facts、record JSON、record digest 与 assertion/trust/source-decision digest 在 load 时统一重算并 fail-closed。
  正式 Harness 通过 TS 2 files / 24 tests + Java 7 classes / 52 tests，输出
  `EIPC112_POSTGRESQL_PERSISTENCE_CONFORMANT`；Workspace 240 files / 1603 tests + 3 smoke、Central
  online/offline 325/0/0/0 严格串行全绿。未实现 bearer、proof、handle resolver、HTTP、Core/Desktop 接线；
  两个 identity blocker 保持打开，EIPC-1.1.3 与全部下游继续 `GATED`。

- 用户正式接受 EIPC-1.1.1 独立 QA（P0～P3 全 0），EIPC-1.1.1 现为 `PASS/CLOSED`；该关闭只确认
  `enterprise-session.v1alpha1` canonical Contract 与跨语言 conformance，不关闭
  `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 或 identity composition blocker。新增 docs-only
  [EIPC-1.1.2 PostgreSQL v0010 + Persistence 详细方案](./docs/development/frontend/EIPC-1.1.2-POSTGRESQL-V0010-PERSISTENCE-DEVELOPMENT-PLAN.md)：
  冻结 `identity_source_revision`、numeric source revision/Wire digest 分层、完整 issuance indexed facts、
  B0010/U0010 exact history、聚合式 Persistence Port、InMemory/MyBatis 双 Adapter、原子恢复窗口与 90 项 QA。
  当前未创建 v0010、未修改生产代码/版本/lockfile，EIPC-1.1.2 仍 `CODING GATED`；EIPC-1.1/EIPC-1
  总估算同步更新为 15～24 / 29～47 个集中工程日。

- `0.0.0-eipc.1.1.1` 完成 Canonical Contract + Cross-language Conformance。新增独立
  `enterprise-session.v1alpha1` canonical family、opaque-handle Device Challenge 与 Session Lease strict
  Wire schema、隔离的 `eipc.session-token.v1` claims、TS Zod API 和六类 canonical digest；Java/TS 共同消费
  valid/invalid/digest corpus，EIPC-0 assertion/trust 使用 family-qualified safe reference。Architecture test
  以真实 source graph 证明 production `EnterpriseAccessTokenProvider` 仍缺失，不再硬编码 false；旧 Gateway
  v1alpha1/v1alpha2 与 EIPC-0 canonical bytes/digest 零漂移。正式 Harness 输出
  `EIPC111_CONTRACT_CROSS_LANGUAGE_CONFORMANT`，但 production session/identity ready/blocker closed/downstream
  unlock 均为 false；Workspace 240 files / 1603 tests + 3 smoke、Central online/offline 316/0/0/0 全绿。
  未创建 v0010、Central production Decision/Validator/HTTP、Core Adapter 或 Desktop 接口；EIPC-1.1.2～1.1.3
  继续 `GATED`，identity composition blocker 保持打开。

- 用户正式接受 EIPC-1.0 独立 QA，EIPC-1.0 现为 `PASS/CLOSED`；该关闭仅确认 Production Input / Contract
  Preflight 正确完成，不关闭 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`，也不宣称
  production identity ready。同步纠正 Preflight 报告的泄漏扫描 over-claim：EIPC-1.0 只证明四种 canary
  形态生成与结果证据无命中，完整四通道负向检出矩阵归 EIPC-1.3；production Adapter 存在性自动扫描纳入
  EIPC-1.1。
- 新增 EIPC-1.1 Cross-language Contract + Central Session Lease 详细方案。方案新增独立
  `enterprise-session.v1alpha1` 的 opaque-handle Device Challenge 与 Session Lease 两个 endpoint，隔离
  `eipc.session-token.v1` claims profile；以 common bearer authorizer 兼容 legacy/new token，但禁止根据未验证
  payload 猜 profile。新增 forward-only Central `v0010` 规划，在同一 transaction 中锁定 identity/device/
  permission、验证 proof/trust/compatibility、签发 bearer、消费 challenge并提交 assertion/trust/source-decision
  issuance facts；旧 Gateway Contract、claims enum 与 v0001～v0009 保持零漂移。EIPC-1.1 拆为 1.1.1
  Contract/Conformance、1.1.2 v0010/Persistence、1.1.3 Decision/Validator/HTTP，当前全部编码 `GATED`；
  EIPC-1 总估算同步为 25～41 个集中工程日。

- `0.0.0-eipc.1.0` 完成 EIPC-1.0 Production Input / Contract Preflight（docs + Spike only）。冻结独立
  `enterprise-session.v1alpha1` Wire family、POST `/enterprise-session/v1alpha1/session-leases`、
  `eipc.session-token.v1` claims profile 与 `macos_secure_enclave_p256_ecdsa_sha256_v1` signer profile；
  非沙箱 macOS Secure Enclave Spike 连续三次证明 private key 不可导出、public key 可导出、ECDSA SHA-256
  签名成功且无持久 key。代码事实同时证明真实 OA/MDM、enterprise identity credential 与 production
  codesign 授权仍缺失，因此唯一结论为 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`，
  production session、Central Session Lease、Local Credential Adapter、Runtime composition 与下游编码均
  保持关闭。Preflight、lint/boundary、Workspace 239 files / 1587 tests + 3 smoke、Central online/offline
  307/0/0/0 均通过；独立 QA P0～P2=0、P3=2（均不阻断）并由用户正式接受，EIPC-1.0 已
  `PASS/CLOSED`；未改生产 Contract/Core/Central/Main/Preload/Renderer/migration/依赖/lockfile。

- 新增 EIPC-1 Enterprise Integration Production Adapter 详细实施方案。基于当前代码确认：Core 尚无
  production `EnterpriseAccessTokenProvider`、Enterprise Credential Store 或 Device Signer；Central
  旧 Token Claims 不含 `personal_model.configure`，`/v1alpha1/token` 也未返回 EIPC-0 所需的同决策
  Session Assertion/Device Trust 事实。方案因此禁止改写既有 Gateway v1alpha1/v1alpha2 和非 Secret EIPC
  semantic family，改以独立 Enterprise Session Wire Contract、Central 原子 decision、macOS signer 与
  Local Adapter 分四个子批实施，并将
  EIPC-1 估算从 6～10 日修正为 19～31 日。当前仅 docs-only，EIPC-1.0～1.3 继续编码门禁；真实企业输入
  未授权时必须输出 `BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION`，模拟账号不得冒充生产就绪。
  该计划后续已通过评审并由用户接受；EIPC-1.0 已单独获权进入 docs + Spike，EIPC-1.1～1.3 仍 GATED。

- `0.0.0-strm.2.3-repair.1` 修复 STRM-2.3 独立 QA 的资源证据 P2 与 late cleanup P3。8 个
  SIGKILL 场景现在保存 exact barrier 的 14 类真实资源快照，并以单次 OS 进程表快照核验 wrapper、
  Electron、Core child 与同组 helper 均已 absent 或进入 terminal state；删除无条件硬编码 0。
  `lateCleanupCount` 改为真实 controller snapshot 且缺失即失败，并进入 semantic digest。正式 Harness
  3 files / 15 tests、3×19=57 fresh process scenarios、三轮 digest 一致；Workspace 239 files / 1587
  tests + 3 smoke，Central online/offline 307/0/0/0 全绿。未改生产业务代码、migration、依赖或 lockfile；
  独立 QA P0～P3 全 0 并由用户正式接受，repair.1、STRM-2.3、STRM-2 已依次 `PASS/CLOSED`。transport
  blocker 仍打开，不输出 `SENSITIVE_TRANSPORT_READY`，不自动解锁 STRM-3。

- `0.0.0-strm.2.3` 完成 S1～S8 Process Harness 与阶段收口。新增精确 private rejected typed code，
  STRM-1 遗留 WebCrypto 路径标记为 deprecated；真实 Electron/Main/sandboxed Preload/
  `CorePrivateSupervisor`/Core child/fd3+fd4/fd5 拓扑以 exact barrier 验证 SIGKILL、Core restart、
  navigation、reload、renderer crash、Main close 与 profile drift。三轮各 19 个 fresh process scenario，
  semantic digest 一致；四通道敏感命中 0、80 次 scanner 负向注入全部检出、14 类资源归零。Harness
  3 files / 14 tests，Workspace 239 files / 1586 tests + 3 smoke，Central online/offline 307/0/0/0 全绿。
  最终只输出 `STRM2_PRODUCTION_WIRING_CONFORMANT`；production feature/business handler/sensitive
  transport ready/blocker closed/Renderer API/zero-copy claim 均保持 false；首轮 QA 的 P2/P3 已由 repair.1
  修复并通过独立 QA与用户接受，STRM-2.3/STRM-2 已正式关闭，不自动解锁下游。

- `0.0.0-strm.2.2` 完成 Broker Dispatch 与 Directional Closure。新增仅通过 private subpath 导出的
  Main-issued frame authorization，以独立HMAC domain绑定exact Ticket/session/direction/body length/frame
  digest，且不包含Secret-derived material；production Main/Preload单一session状态机现已闭合mutation
  Preload→Main→fd4/fd5 Broker→terminal与reveal Broker/RevealDelivery→Main→Preload→预签发ack。current
  Broker lease锁定runtime/channel/client/navigation/dispatch ordinal，late callback只清零不投影，测试显式
  断言mutation/reveal `executeCount=1`；transport completed仍不等于durable Receipt或用户已查看Secret。
  Harness **8 files / 53 tests** +真实Electron **4 scenarios**，Workspace **236 files / 1572 tests + 3 smoke**，
  Central online/offline **307/0/0/0**全绿。production feature/business handler/sensitive transport ready继续
  false，blocker未关闭；无public IPC/contextBridge/Renderer API，无Core业务/migration/Central/依赖/lockfile
  漂移。独立QA已通过并由用户正式接受关闭，STRM-2.3及其他下游继续`GATED`。

- 用户正式接受 `0.0.0-strm.2.1` 独立 QA，STRM-2.1 `PASS/CLOSED`；STRM-2 Production Transport Wiring
  计划评审已 `PASS/CLOSED`。方案将 Electron/Main/Preload/fd4/fd5 transport wiring 与 EIPC/DFI business
  composition 分离，冻结 private control terminal、Main-derived navigation epoch、one-shot port lifecycle、
  mutation/reveal directional Broker closure、S1～S8、production-disabled activation 与 88 项 QA。当前
  production Core Broker handler 仍 unavailable，STRM-2 不使用 Fake owner 绕过，不开放 Renderer API，
  不关闭 transport blocker。STRM-2.2 已形成 Broker Dispatch 与 Directional Closure 详细方案：冻结
  Main-issued one-shot frame authorization、exact Broker lease、mutation/reveal方向闭合、late callback gate、
  transport terminal与业务 Receipt/用户查看事实分离及 84 项 QA；该计划后续已获用户单独授权并由
  `0.0.0-strm.2.2` 实现，当前等待独立 QA；STRM-2.3继续`GATED`。

### Changed

- `0.0.0-strm.2.1` 实现 STRM-2.1 Control Contract 与 Electron Lifecycle Wiring。private transport
  Contract additive 增加 strict ready/cancel/terminal control、typed terminal/error 组合和 Main-private prepared
  command；production Main 装配默认 disabled controller，从真实 event 派生 exact webContents/main-frame 与
  monotonic navigation epoch，管理 one-shot `MessageChannelMain`、deadline、navigation、renderer crash 和
  shutdown 清理；production Preload 装配默认 disabled internal receiver，不暴露 contextBridge 业务 API。
  真实 sandboxed Preload 不假设 WebCrypto 可用，non-secret control 改由 Main 预计算 exact-ticket-bound digest
  并在回送时 constant-time 校验；STRM-2.2 不得据此弱化 Secret frame digest。Harness **4 files / 31 tests**、
  Electron **5 scenarios**、STRM-0 **14-run** 回归、敏感命中 0、八类资源归零；Workspace
  **234 files / 1558 tests + 3 smoke**、Central online/offline **307/0/0/0** 全绿。未接 Broker directional
  closure、个人模型 CRUD/reveal、Renderer API 或 production business handler；feature 与 blocker 状态不变。
  Claude Code 独立复跑全部门禁通过（P0～P3=0），用户已正式接受并关闭 STRM-2.1。

- `0.0.0-strm.1` 实现 STRM-1 Transport Contract / Adapter Foundation。新增仅通过 private subpath
  导出的 Route A Contract，冻结 `personal-credential.route-a.structured-clone.v1`、HMAC Ticket material、
  strict `header + Uint8Array body` envelope、non-secret frame digest 与 fail-closed typed errors；Ticket
  精确绑定 runtime/client/command/correlation/model/configuration/request/webContents/main-frame/navigation/
  expiry，不含 Secret、Credential Reference、owner 或 Endpoint。新增默认 disabled、未注册到 production
  entry 的 Main Registry 与 Preload Adapter：registry `<=256`、active `<=4`、Ticket TTL 5 秒、tombstone
  10 分钟、同模型单并发、reveal 频率有界；Main 只接 mutation、只生成 reveal，Preload 一次消费并清零
  可控 typed array。Renderer boundary 禁止导入任何 Desktop private Contract。Harness **2 files / 16 tests**
  并复跑 STRM-0 真实 Electron **14 runs / 12 scenarios / 3 roundtrip**，敏感命中 0、八类资源归零；仍明确
  `productionSensitiveTransportReady=false`、feature 默认关闭、blocker 未关闭、无 CRUD/reveal UI、Broker、
  public API 或 runtime fallback。STRM-0 独立 QA 已由用户接受并正式 `PASS/CLOSED`；STRM-2/3、EIPC-1～3、
  DFI-4A.4.1～4A.4.3、DFI-2B/3 与 TGM 继续 `GATED`。

- `0.0.0-strm.0` 完成 STRM-0 Sensitive Transport Decision Spike，输出 `ROUTE_A_ACCEPTABLE`：在 Electron
  43.2.0 的 sandbox/context-isolated hidden process 中，用 one-shot MessagePort + structured-clone
  `Uint8Array` 真实证明 mutation/reveal 双向 byte delivery、Main 派生 exact webContents/main-frame identity、
  foreign/wrong identity/duplicate/brand/size/navigation/crash/close/deadline 失败关闭。Harness 共 14 次进程运行、
  12 个唯一场景与 3 次 roundtrip 重放；四通道 × 五类 marker × raw/Base64/URL-encoded/hex 的 80 次负向
  注入全部命中，真实输出敏感命中 0，八类资源归零。发送端 post 后未 detach、接收端得到独立对象，故应用层
  可观察副本下界为 2；本批明确不宣称 zero-copy、内部副本可清零、`SENSITIVE_TRANSPORT_READY` 或 blocker
  已关闭。未修改 production Main/Preload/Renderer/Core/Central、公开 Contract、migration、依赖或 lockfile；
  STRM-1～STRM-3、EIPC-1～EIPC-3、DFI-4A.4.1～4A.4.3、DFI-2B/3 与 TGM 继续 `GATED`。EIPC-0 独立 QA
  已通过并由用户正式接受为 `PASS/CLOSED`。

- `0.0.0-eipc.0` 完成 EIPC-0 Enterprise Identity authority semantics Foundation，唯一结论为
  `AUTHORITY_SEMANTICS_FROZEN`：新增独立 `eipc.v1alpha1` strict、非 Secret Contract family 与 TS/Java
  canonical corpus，冻结 owner/activation/current transport 身份分离、restart session rebind、显式
  Compatibility、token permission 与 activated policy 交集、CGF-1.3 offline 状态 2/3、source/snapshot
  digest 和 Core-private authority Provider Port。既有 Enterprise Gateway v1alpha1/v1alpha2 未改写；由于
  旧 permission enum 不含 `personal_model.configure`，EIPC-1 必须另行评审 additive Gateway identity
  protocol revision。本批未实现 production token/Device Trust Adapter、Core composition、个人模型接口或
  Renderer，production fixed `activeUserId` 仍由边界测试保留为 blocker 证据；不宣称
  `IDENTITY_COMPOSITION_READY`，不关闭 identity blocker。三份前置文档已由用户接受为 `PASS/CLOSED`；
  STRM-0、EIPC-1～EIPC-3、DFI-4A.4.1～4A.4.3、DFI-2B/3 与 TGM 继续 `GATED`。开发者串行门禁：
  EIPC Harness **5 files / 40 tests + 1 Java class**、Workspace **229 files / 1522 tests + 3 smoke**、
  Central online/offline 均 **307/0/0/0 / BUILD SUCCESS**。

- 产品文档将 MCP P0 认证扩展为“无需认证 / 访问令牌（Bearer Token） / API Key”：管理员在当前
  Connection 表单直接填写 Token/API Key，MVP 不建设独立 Credential 库、凭证命名、凭证选择器或跨连接
  复用；API Key 默认通过 `X-API-Key` Header 发送，特殊 Header 名称仅在高级配置中修改并校验，禁止放入
  URL Query，保存后不回显明文 Secret。同步更新 Tool
  Feature Spec Revision 5、PRD Revision 6、Frontend Spec Revision 9、MVP 功能基线和产品索引；OAuth
  完整授权流程保持 P1，TGM 真实编码继续 GATED。本轮不修改原型、生产代码、Contract、IPC、依赖、版本、
  开发计划或 lockfile。

- 用户正式接受 DFI-4A.4.0 Preflight 复核结论并关闭该 Preflight；`PASS/CLOSED` 只表示正确识别
  `BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION` 与 `BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER`，
  不表示 blocker 已关闭。新增 Enterprise Identity Production Composition 修复方案，拆分 Enterprise
  Integration production foundation、Core Runtime Active authority composition 与最终 Unblock Audit；新增
  Sensitive Renderer↔Main Transport Revision 1 和 Threat Model，撤回 transferable ArrayBuffer 到 Main
  的旧假设，冻结 structured-clone/隔离 consumer/native binary 三路线、先真实 Spike 后选型、无运行时
  fallback 和不可可靠清零内部副本的剩余风险。本轮仅修改文档，EIPC/STRM、DFI-4A.4.1～4A.4.3、
  DFI-2B、DFI-3、TGM 全部继续 GATED，未修改生产代码、Contract、migration、依赖、版本或 lockfile。

- `0.0.0-dfi.4a.4.0` 完成 Production Composition Preflight，未开放生产个人模型接口。只读代码核查与
  sandboxed Electron 43.2.0 MessagePort Spike 得到
  `BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION_AND_ELECTRON_MESSAGEPORT_TRANSFER`：当前 Desktop
  composition 没有可信的 Enterprise Access Token production provider，也未组合 Runtime Active
  enterprise/user/device、Device Trust、`personal_model.configure` entitlement 与 offline state；不得用
  固定 user、OS user、Main/Renderer 自报或 Fake 绕过。MessagePort 双向控制握手、exact webContents/
  main-frame 绑定和 Preload sender ArrayBuffer detach 均成立，但 transferred byte frame 没有抵达 Main；
  Electron Main API 的 transfer list 只声明 `MessagePortMain[]`，敏感 Renderer↔Main transport 必须回文档
  评审。Helper trust primitives 已有但 production packaging/descriptor/broker handler 尚缺；migration 23/24
  足够且不新增 migration 25。新增三个 Preflight/Harness 脚本与正式报告；未修改 Main/Preload/Renderer/
  Core/Contracts/Central/Document Worker 生产源码、migration 1～24、依赖或 lockfile。DFI-4A.4.1～4A.4.3、
  DFI-2B/3 与 TGM 继续 GATED。

- 用户正式接受 `0.0.0-dfi.4a.3.3` 独立 QA，DFI-4A.3.3 与 DFI-4A.3 阶段整体 `PASS/CLOSED`。
  新增 DFI-4A.4 Desktop 安全接口、Preload Sidecar 与联合 E2E 详细方案；基于当前代码确认 production
  Desktop 尚未装配 Runtime Active personal owner authority、Keychain verified helper、Personal
  Coordinator、Composite Resolver 与 startup recovery，不能把本批简化成 IPC 胶水。方案拆分为
  4A.4.0 Production Composition Preflight、4A.4.1 production composition + safe v1alpha2、4A.4.2
  sensitive sidecar + CRUD/reveal、4A.4.3 selection/restart/closure E2E，并将工期从 5～8 日修正为
  21～34 个集中工程日。本轮仅修改文档，DFI-4A.4.0～4A.4.3、DFI-2B、DFI-3 与 TGM 继续编码门禁；
  未修改生产代码、Contract、IPC、migration、依赖、版本或 lockfile。

- `0.0.0-dfi.4a.3.3` 实现 Local Personal Model Agent Loop / Compaction / Recovery Foundation：新增
  Core-private `TaskLockedModelProviderResolver`，让 main 与 initial/rolling compaction 从同一标准
  `TaskCapabilityLock` 穷尽解析企业或个人 Provider；已有 Conversation Message 的 replay-first 在解析
  Personal Credential 前完成。新增 migration 24 durable Provider wrapper，按 accepted/dispatching/
  output_started/terminal 收敛 fencing、真实 Usage、Projection 与模型状态，Provider 未返回 Usage 时保持
  unknown；新增最多 200 条的 startup recovery classifier，不在后台盲发网络请求。I1～I5 由真实子进程
  `SIGKILL` + 同一 SQLite 文件新 PID reopen 验证，I2 明确保留 at-least-once/可能重复计费语义，I3/I4
  均 `model_stream_resume_unavailable`，I5 不从 terminal 伪造正文。未新增 migration 25，未修改公共
  Contract、Main/Preload/Renderer/Central/Document Worker，也未进入 DFI-4A.4、DFI-2B/3 或 TGM。
  开发者门禁已串行通过：Harness **16 files / 88 tests**、Workspace **226 files / 1496 tests + 3 smoke**、
  Central online/offline 均 **302/0/0/0 / BUILD SUCCESS**；当前等待独立 QA，不标记 `PASS/CLOSED`。

- 产品文档将 Tool 管理收敛为 Tool Feature Spec Revision 4、PRD Revision 5 与 Frontend Spec Revision 8：
  Admin MCP P0 只连接已部署的远程服务，不提供本地 MCP、Command/Arguments、`npx`、环境变量或依赖安装；
  创建固定为“验证并发现工具 → 选择 Tool → 设置范围并保存草稿”，读取能力可默认选择，写入、删除和外发
  能力必须主动选择。范围改用部门/用户选择器，风险摘要由系统生成，管理员只能增加确认；MCP Tool 策略与
  服务连接分开编辑，重新发现不自动同步、覆盖或启用。本轮仅修改产品文档，不修改原型、生产代码、Contract、
  IPC、依赖、版本、开发计划或 lockfile。

- 用户正式接受 `0.0.0-dfi.4a.3.2` 独立 QA，DFI-4A.3.2 `PASS/CLOSED`。新增 DFI-4A.3.3
  Agent Loop / Compaction / Recovery 闭环详细方案：基于当前代码冻结统一异步 Task-locked Provider
  Resolver、Core-private personal execution authority、replay-first、migration 24 durable wrapper、
  I1～I5 恢复分类、main/compaction 双 link 单一事实职责，以及双 Core/双 SQLite/受控 TLS Provider
  的 80 项 Closure QA。该批仅完成文档输出与技术自审，DFI-4A.3.3 编码、DFI-4A.4、DFI-2B、
  DFI-3 与 TGM 继续 `GATED`；未修改生产代码、Contract、migration、依赖、版本或 lockfile。

- 产品文档将 Tool 管理收敛为 Tool Feature Spec Revision 3、PRD Revision 4 与 Frontend Spec Revision 7：
  HTTP API Tool 创建对齐当前“基础配置 → 连接配置”两步原型，第二步增加单条 cURL 快速导入，使用确定性解析器
  回填现有 API 地址、认证、Method 和参数卡片；手动填写始终保留。导入不执行 Shell、不联网、不自动保存、
  测试或启用，敏感值只显示掩码并转入 Central 受控 Credential 流程；OpenAPI/Swagger 文本、文件、URL 和
  批量 Operation 导入保持 P1。本轮仅修改产品文档，不修改原型、生产代码、Contract、IPC、依赖、版本、
  开发计划或 lockfile。

- `0.0.0-dfi.4a.3.2` 实现 Personal Model Unified Selection + Exact Task Lock Foundation：新增
  Core-private 企业/个人统一候选、显式/偏好/Agent default/企业顺序选择解析，个人 context window
  保持 unknown 并在存在 minimum 要求时失败关闭；新增标准 personal `TaskCapabilityLock` materializer、
  authenticated `pmcfg1` configuration ref、共享 Task bundle `registryRevision`、lock-bound Composite
  Provider Resolver，以及基于非终态 Task lock 的删除/Credential cleanup usage guard。扩展 TaskPersistence
  有界索引查询并一次性交付 InMemory/SQLite 双 Adapter；不新增 migration 25，不修改公共 Contract，
  不接 Agent Loop、Main、Preload、Renderer 或 Central。开发者正式门禁通过：Harness **6 files / 69 tests**、
  Workspace **223 files / 1475 tests + 3 smoke**、Central online/offline 均 **302/0/0/0**。
  DFI-4A.3.2 的后续独立 QA 已通过并由用户正式接受关闭；DFI-4A.3.3、DFI-4A.4、DFI-2B、DFI-3
  与 TGM 继续单独门禁。

- 用户正式接受 `0.0.0-dfi.4a.3.1` 独立 QA，DFI-4A.3.1 `PASS/CLOSED`。新增 DFI-4A.3.2
  统一选模、精确 Task Lock 与 Composite Resolver 详细方案：基于现有代码冻结 personal `model.*` ID
  校验、unknown context window 失败关闭、Task bundle 共享 `registryRevision`、`pmcfg1` authenticated
  configuration ref、standard lock materializer、lock-bound Provider revision 对齐、企业/个人穷尽分派、
  preference intent 独立命令边界和 Task-backed deletion/credential usage guard。该批仅进入文档评审，
  DFI-4A.3.2 编码及后续批次继续 `GATED`，本轮未修改生产代码、Contract、migration、依赖、版本或 lockfile。

- `0.0.0-dfi.4a.3.1` 实现 Personal Model Secure Provider + Invocation/Usage Foundation：新增
  Core-private OpenAI-compatible HTTPS/SSE Adapter、版本化 Provider Profile、Endpoint/DNS pinning/TLS/
  redirect/deadline/响应上限护栏、ARH-1 Model Stream Conformance 接缝，以及 local personal invocation
  link、Usage Fact、Usage Projection 和模型状态观察的 InMemory/SQLite 一致实现；新增 forward-only
  migration 24。Provider 未返回 Usage 时保持 unknown，不伪造 0；个人模型不进入企业 Registry
  Generation，也未接 Task selection/lock、Agent Loop、Main、Preload 或 Renderer。开发者门禁通过：
  专项 Harness **6 files / 30 tests**、Workspace **220 files / 1458 tests + 3 smoke**、Central
  online/offline 均 **302/0/0/0**。DFI-4A.3.2、DFI-4A.3.3 与后续批次继续 `GATED`。

- 用户已接受 `0.0.0-dfi.4a.2.3` 独立 QA，DFI-4A.2.3 与 DFI-4A.2 整体正式
  `PASS/CLOSED`。新增 DFI-4A.3 个人 Provider Runtime、Usage 与 Task 精确锁定详细实施方案：冻结
  Secure Provider/Invocation Foundation、Unified Selection/Exact Lock、Agent Loop/Recovery Closure
  三批门禁；个人模型不进入企业 Registry Generation，也不建立第二套 Task lock，而是从 immutable
  personal definition 物化现有标准 `TaskCapabilityLock`。本轮仅修改文档，DFI-4A.3.1～3.3 继续
  `CODING GATED`，未修改生产代码、Contract、migration、依赖、版本或 lockfile。

- `0.0.0-dfi.4a.2.3` 实现 Owner Reveal 与 Credential Foundation Closure：新增 Core
  `PersonalModelCredentialRevealService`、共享 owner/model operation gate 与 Main 私有单一 consumer
  delivery；每次 reveal 重新校验 Runtime Active owner authority、active head、精确 revision、execution
  definition digest 与 Credential binding。Reveal 禁止 pending 合并、fan-out 和成功重放，使用一次性
  runtime tombstone、同 owner/model 单并发、全局 4 并发、60 秒 5 次与 5 秒 Core deadline；Secret 仅通过
  fd4/fd5 raw binary frame 与局部 `Uint8Array` 传递，并在 handler/frame/client/consumer 各层清零。
  Closure Harness 使用真实子进程、隔离 SQLite reopen 与临时 macOS Keychain 覆盖 V1/V2a～V2d、cancel、
  deadline、disconnect、late response、restart、不可重放与资源归零。开发者门禁通过：Harness
  **6 files / 31 tests**、Workspace **217 files / 1444 tests + 3 smoke**、Central online/offline 均
  **302/0/0/0**；独立 QA 为 Harness **6 files / 53 tests**、Workspace **217 files / 1444 tests +
  3 smoke**、Central online/offline **302/0/0/0**，P0～P3 均为 0；用户已正式接受，DFI-4A.2.3
  与 DFI-4A.2 整体 `PASS/CLOSED`。未新增 migration 24，未接 public IPC、Preload、Renderer、Provider、
  Task lock 或 Agent Loop。

- `0.0.0-dfi.4a.2.2` 实现 Personal Model CRUD Coordinator 与 Durable Recovery Foundation：新增
  strict create/update/delete safe command、canonical request digest、verified owner authority context、
  conservative deletion/reference-usage Port，以及 safe prepare → Keychain execute → durable observation CAS →
  aggregate Transaction B 两阶段编排。Create/Update/Delete 复用 migration 23 的 Operation Journal、不可变
  definition、head/status 与 durable Receipt；恢复链覆盖 absent/matching/mismatch observation、SQLite reopen、
  manual attention、cleanup pending 与 exact replay。新增 private broker-to-coordinator Adapter，只有 durable
  prepared operation 才能触发敏感执行；默认生产 authority 仍 fail-closed。专项 Harness **5 files / 54 tests**、
  Workspace **214 files / 1430 tests + 3 smoke** 通过；未新增 migration 24，未进入 Reveal、Provider、Task lock、
  Agent Loop、公共 IPC、Preload 或 Renderer。该批独立 QA 和用户接受已完成，正式 `PASS/CLOSED`；
  DFI-4A.2.3 后续也已按独立门禁完成并关闭。

- 产品文档将 Agent/Skill 管理口径收敛为 Revision 3 / Frontend Spec Revision 6：Admin 创建和编辑
  机器人与 Desktop 统一使用默认关闭的模型、技能、工具和知识限制开关，只有开启后才能选择并形成
  机器人级允许列表；明确“未限制 / 仅允许所选资源 / 禁止使用该类资源”三种语义。Admin 新增技能
  取消空白目录编辑器与双入口，固定为上传包含 `SKILL.md` 的压缩包形成草稿；客户端安装定义为下载、
  校验并安全解压到受控 Skill 目录，不执行包内脚本、不自动安装环境依赖，失败不留下半安装目录。
  同步更新 PRD、Frontend Spec、MVP 功能基线和产品索引；后续一致性收口进一步删除旧版 Agent/Skill
  Instructions、输入输出表单和轻量 Skill 编辑器描述，按 Agent/Skill 分类冻结发布审核字段，并规定前端
  文件清单隐藏归档系统元数据但安全校验不得忽略。本轮仅修改产品文档，不修改原型、生产代码、
  Contract、IPC、Schema、依赖、版本、开发计划或 lockfile。

- `0.0.0-dfi.4a.2.1` 实现 DFI-4A.2.1 Sensitive Transport + Keychain Adapter Foundation：保留
  Core lifecycle fd3 `serialization: "json"`，新增 fd4 request / fd5 response 双匿名二进制通道和
  private Contract subpath；Main/Core 以 channel/client identity、deadline、有界并发、幂等 registry、
  late-response 丢弃与内存清零约束传递 Secret bytes。新增 Core-owned one-shot
  Security.framework helper、固定 Keychain item layout、helper manifest/path/protocol/signature 信任校验、
  隔离临时 Keychain Conformance 和进程异常后的 `inspect()` 保守收敛；缺少 verified production helper
  descriptor 时保持 typed fail-closed，不阻断 Core 启动。本批不实现 CRUD Coordinator、durable recovery、
  Reveal、Provider、Task lock、Preload/Renderer 或公共 Desktop IPC。开发者门禁通过：专项 Harness
  **5 files / 23 tests**，Workspace **212 files / 1402 tests + 3 smoke**，Central online/offline 均
  **302/0/0/0**。Claude Code 独立复跑为 Harness **5 files / 27 tests**、Workspace
  **212 files / 1402 tests + 3 smoke**、Central online/offline **302/0/0/0**，P0～P3 均为 0；
  用户已正式接受，DFI-4A.2.1 `PASS/CLOSED`。

- DFI-4A.2.2 CRUD Coordinator + Durable Recovery 独立详细方案曾基于代码事实冻结
  safe prepare + sensitive execute 两阶段入口，避免把完整 CRUD material 塞入 fd4/fd5 敏感 header；
  request digest 不保存 Secret/hash/ref，Secret 首次绑定由 Keychain operation/ref 幂等事实证明。方案定义
  owner authority context、conservative deletion/usage guard、C1～C4/U1～U3/D1～D3、bounded recovery、
  default production fail-closed、84 项 QA 与无 migration 24 边界；其后已获单独授权并由上述
  `0.0.0-dfi.4a.2.2` 批次实现。

- 用户正式接受 DFI-4A.1 独立 QA，DFI-4A.1 `PASS/CLOSED`；DFI-4A.2 计划复核通过并获确认，当前只
  解锁 DFI-4A.2.1 Sensitive Transport + Keychain Adapter Foundation。DFI-4A.2.2～2.3 与后续批次
  继续 `GATED`。

- 新增 DFI-4A.2 Credential Broker、macOS Keychain Adapter 与 CRUD 详细候选方案：保留现有
  `serialization: "json"` 的 Core lifecycle IPC，冻结 fd4/fd5 双匿名 binary pipe、Core-owned
  one-shot Security.framework helper、稳定业务 command identity / 单次 transport identity 分离、Keychain
  item layout、helper trust/fail-closed、create/update/delete
  Coordinator、C/U/D/V 恢复矩阵与 owner-only reveal 前置门禁。方案拆分为 4A.2.1～4A.2.3，当前仅
  `DOCUMENT REVIEW PENDING / CODING GATED`；未修改生产代码、Contract、migration、依赖、版本或 lockfile。
- `0.0.0-dfe.6b` 实现 DFE-6B Frontend Foundation Closeout：新增
  `frontend-closeout-presentation.ts`，将五个一级导航的收口范围、七类状态矩阵、remaining
  Mock/GATED inventory 和 `LegacyWorkbench` 隐藏维护入口决策固化为可测试数据；`DesktopShell`
  主导航和主内容补充本地化 aria label，主导航链接补可见键盘焦点；测试新增
  `frontend-closeout-presentation.test.ts`，并加固 Desktop Shell 与 Renderer boundary，禁止
  Renderer 使用 LocalStorage/sessionStorage/indexedDB 冒充业务持久化。本批只修改
  Renderer、Desktop tests、Desktop package version 和共享治理文档；未修改 Main、Preload、IPC、
  Contracts、Core、Central、Document Worker、SQLite migration、根配置或 `pnpm-lock.yaml`。
  独立 QA PASS 后已由用户接受关闭，DFE-6B 与 DFE Frontend Experience Foundation 正式
  `PASS/CLOSED`；DFI-2B、DFI-3、DFI-4A、TGM 继续 `GATED`。
- `0.0.0-dfi.4a.1` 实现个人模型 Domain、Desktop Local `v1alpha2` additive safe Contract、
  聚合式 Persistence 与 SQLite migration 23 Foundation：新增独立 owner namespace、不可变配置定义、
  current head、append-only status history、个人偏好、Operation Journal 与 durable Receipt 七表；实现
  `namespace_key_check_digest` 损坏检测、opaque Credential Reference、strict Credential observation
  联合类型、HTTPS Endpoint canonicalization、owner authority、HMAC cursor/query revision、
  `delete_pending` 选择阻断、状态 carry-forward provenance，以及 InMemory/SQLite 同一聚合语义。
  本批只提供 Fake Credential Store 和 Runtime Registry representation，不接真实 Keychain、Provider、
  Desktop CRUD、Task lock 或 Agent Loop。开发者门禁通过：focused 4 files / 51 tests，Workspace
  207 files / 1378 tests + 3 smoke，Central online/offline 均 302/0/0/0；独立 QA 已通过并由用户
  正式接受，DFI-4A.1 `PASS/CLOSED`。DFI-4A.2.2～4A.4、DFI-2B、DFI-3、TGM-1+ 继续 `GATED`。
- DFE-6A 独立 QA 已由用户接受，`0.0.0-dfe.6a` 正式 `PASS/CLOSED`。新增
  `DFE-6B-FRONTEND-FOUNDATION-CLOSEOUT-PLAN.md`，将 DFE-6B 冻结为 Frontend Experience
  Foundation 最终收口的 docs-only 方案：覆盖五个一级导航的视觉、键盘、焦点、ARIA、窗口尺寸验收、
  Loading/Empty/Error/Disabled/Permission denied/Unavailable/Partial 状态矩阵、remaining
  Mock/Prototype/GATED inventory、已替换 Mock 删除规则、`LegacyWorkbench.ts` 去留决策和
  Renderer-only 编码边界。该方案后续已由 `0.0.0-dfe.6b` 实现；不得声明 DFI、TGM、Knowledge
  Provider、Personal Model/Credential、Agent/Skill 创建、OS Sandbox 或正式安装包完成。
- `0.0.0-dfe.6a` 实现 DFE-6A Task Detail 工作空间文件真实数据收敛：`#/tasks`
  右侧“工作空间文件”面板删除固定占位，改为通过 Renderer-only
  `task-workspace-adapter` 消费 DFI-1B 已验收 v1alpha2 sidecar。页面先进行
  compatibility negotiation，检查 `task_workspace_browser/task_workspace_reveal` 和
  `runtimeInstanceId`；`listWorkspaceEntries` 仅提交 `taskId/parentEntryId?/cursor?/limit?`，
  `openTaskWorkspaceLocation` 仅提交 `taskId` 和固定命令元数据。实现覆盖 task 切换清理、
  late response 丢弃、根目录加载、单层惰性目录导航、breadcrumb、cursor 分页、
  stale cursor 一次安全刷新、symlink 永不导航、feature 缺失真实 Unavailable、Reveal
  只打开任务锁定工作空间位置。新增 focused tests 与 Renderer boundary allowlist；本批未修改
  Main、Preload、shared API、Contracts、Core、Central、Document Worker、SQLite migration、
  `pnpm-lock.yaml` 或根配置。DFE-6A 当前为 `PASS/CLOSED`；
  DFE-6B、DFI-2B、DFI-3、DFI-4A、TGM 继续 `GATED`。
- Tool 管理产品语义修订为 Revision 2：代码 Tool 由 RoboThree 官方或企业研发在 Admin Console
  之外完成开发、功能与安全测试、可信发布，发布成功后自动登记到企业 Tool 列表；管理员不再执行
  候选选择、添加、安装、保存草稿、运行测试或删除，只配置允许范围、更严格确认和启停。管理端
  “新增 Tool”只保留“连接 API”和“连接 MCP 服务”，HTTP/MCP 继续使用独立 3 步配置、验证与启用
  流程。同步更新 PRD v1.6 Final Revision 2、Tool Feature Spec Revision 2、MVP 功能基线、
  Frontend Spec Revision 4、产品索引和根 README；本轮仅修改产品文档，不修改生产代码、Contract、
  IPC、Schema、依赖、版本、开发计划或 lockfile，TGM 编码仍 `GATED`。
- 将 DFI-4A.1 Domain、Contract 与 Persistence Foundation 修订为 Revision 3.3：为 Core 私有 owner
  namespace 增加 `namespace_key_check_digest`，固定 HMAC-SHA-256 domain、启动/派生前校验和损坏
  fail-closed 语义；将 Credential `inspect()` 收敛为 strict `present/absent/unavailable`
  discriminated union，并冻结 phase-specific durable observation 与 Transaction B 条件；Endpoint raw
  pre-scan 新增 `%00` 拒绝及 normalized null/C0 control recheck；DFI-4A.0 历史文档保留当时状态并回链
  当前 Revision 3.3。QA 矩阵扩展到 117 项。本轮仅为文档修订，未修改生产代码、Contract、migration
  实现、依赖、版本或 lockfile；DFI-4A.1 仍为
  `REVISION 3.3 / DOCUMENT REVIEW PENDING / CODING GATED`。
- 将 DFI-4A.1 Domain、Contract 与 Persistence Foundation 修订为 Revision 3.2：关闭剩余
  P1/P2/P3 文档歧义，migration 23 七表代码块改为可实现 SQLite 类型、显式 CHECK 和完整 FK，
  禁止 `REFERENCES ...` 或伪类型留给编码时自由补齐；Operation 增加 bounded
  `credential_observation_json`，只保存五个 inspect binding metadata 字段并与 digest 一起供
  C3/U2 Transaction B 复核；`queryRevision` tuple 统一使用 `ownerScopeNamespaceRevision`；
  Endpoint canonicalization 顺序固定为 raw input pre-scan -> WHATWG parse -> normalized component
  recheck；Receipt replay 不能单独证明 status/preference/delete 业务事实；`retired` namespace
  仅为未来 rotation 兼容枚举。QA 矩阵扩展到 108 项。本轮仅为文档修订，未修改生产代码、
  Contract、migration 实现、依赖、版本或 lockfile；DFI-4A.1 仍为
  `REVISION 3.2 / DOCUMENT REVIEW PENDING / CODING GATED`，现已由 Revision 3.3 取代。
- 将 DFI-4A.1 Domain、Contract 与 Persistence Foundation 修订为 Revision 3.1：在 Revision 3 基础上
  关闭剩余 P2/P3 文档歧义，明确 owner namespace 的 `namespace_key` 不进入
  `record_json/record_digest`，active namespace 唯一性由 SQLite partial unique index 证明；
  `personal_model_operations` 与 `personal_model_command_receipts` 改为 owner identity + `command_id`
  复合主键；delete operation 必须持久化 `previous_credential_ref` 与删除时的
  configuration/execution digest；Endpoint percent-encoding canonical form 与所有 owner-scoped Port
  显式 `PersonalModelOwnerIdentity` 参数同步冻结。QA 矩阵扩展到 99 项。本轮仅为文档修订，未修改
  生产代码、Contract、migration 实现、依赖、版本或 lockfile；该 Revision 3.1 已由上方
  Revision 3.2 取代。
- 将 DFI-4A.1 Domain、Contract 与 Persistence Foundation 修订为 Revision 3：migration 23 从六表调整为
  七表，新增独立持久化 `personal_model_owner_scope_namespaces`，owner identity 固定为
  `ownerScopeNamespaceRevision + ownerScopeDigest`，禁止复用 Prompt Cache namespace，并要求 Core
  重启恢复同一 active namespace。状态事实改为 immutable history，`personal_model_heads` 增加
  `selection_state=active/delete_pending/tombstoned`，delete intent 的 Transaction A 必须立即阻止新选择；
  同步冻结 Credential `inspect()` binding metadata、active list `queryRevision` cursor 和 WHATWG
  Endpoint canonicalization。QA 矩阵扩展到 89 项。本轮仅为文档修订，未修改生产代码、Contract、
  migration 实现、依赖、版本或 lockfile；该 Revision 3 已由上方 Revision 3.1 取代。
- 将 DFI-4A.1 Domain、Contract 与 Persistence Foundation 修订为 Revision 2：在既有四类 identity、
  immutable definition history、Core 私有 opaque `credentialRef`/canonical Endpoint 及独立
  Operation Journal/Receipt 基础上，新增随机 Credential ref 预分配、`inspect()` 恢复分类和
  `operationId === commandId`；Application 写入收敛为聚合 `PersonalModelPersistence`，Transaction B
  原子提交 definition/head/status/operation/receipt。同步冻结 digest 公式、stable owner authority、
  八状态 Contract 矩阵、carry-forward provenance、migration 23 复合 FK/CHECK/index/preflight 和
  68 项 QA。该 Revision 2 基线已由上方 Revision 3.1 七表与 99 项 QA 取代，工期仍为
  9～14 个集中工程工作日。本轮仅为文档修订，未修改生产代码、Contract、
  migration、依赖、版本或 lockfile；该 Revision 2/3 状态已由 Revision 3.1 取代，
  DFI-4A.1 继续 `DOCUMENT REVIEW PENDING / CODING GATED`，后续批次继续 `GATED`。
- 用户正式接受 `0.0.0-dfe.5b.2` 独立 QA 结论：设置二级导航与 GATED 页面骨架正式
  `PASS/CLOSED`。该关闭只确认路由与静态 GATED 页面骨架，不关闭 DFE-5B 整体，也不宣布个性化、
  个人记忆、反馈或身份功能完成；DFE-6 继续 `GATED`。同时确认 TGM-0 暂不评审，需先补详细方案文件；
  TGM-1+ 继续 `GATED`。
- `0.0.0-dfi.4a.0-repair.1` 修正个人 Credential Adapter Preflight 初版证据过度声明：继续保持
  ADR-013 Addendum `PROPOSED`，并在随机测试 Secret 与隔离临时 macOS Keychain 上实际验证
  create/store/resolve/replace/lock/unlock/delete/not-found、wrong-password `access_denied`、
  受控 `corrupted`、broker `cancelled`、mutation 前后异常退出恢复、普通生命周期和隔离 Keychain 内
  modern `SecItemAdd/CopyMatching/Update/Delete` 生命周期；默认登录 Keychain 未被写入。IPC 方面，advanced fixture 仅证明候选
  private protocol 可行；真实 `CorePrivateSupervisor` 当前 `serialization: "json"` 不能保留敏感 Buffer，
  因此后续必须选择独立敏感通道或显式改造 supervisor serialization。Endpoint 预检改为真实
  `node:https` + 一次性测试 CA/cert，覆盖 SNI、Host、证书校验、pinned lookup、remoteAddress 复核、
  redirect 拒绝和 mixed DNS/私网拒绝；唯一 canary 的 raw/Base64/URL/hex 形态在四个非授权通道
  命中均为 0，16 项负向自测证明 scanner 能失败。
  本批未修改生产 Main/Core/Contract，也未实现 CRUD、migration、Preload/Renderer、Provider Runtime
  或 reveal；开发者串行门禁（Preflight、lint、Workspace 201/1318 + 3 smoke、Central online/offline
  302/0/0/0）均通过，Claude Code 独立 QA 与 Central 补跑均 PASS。用户已于 2026-08-21
  明确接受，DFI-4A.0-repair.1 与 DFI-4A.0 正式 `PASS/CLOSED`；DFI-4A.1～4A.4 继续 `GATED`。
- DFI-4A 个人模型与 Credential Foundation 计划形成 Revision 1：权限和 owner authority 只来自
  Runtime Active 的企业身份、配置与会话事实，不接受 Renderer 自报；个人模型离线行为直接复用
  CGF-1.3 已接受的状态 2/3，Central 暂时不可达但 Access Token、Device Trust、scope、entitlement
  与 Compatibility 仍有效时允许同 owner 本地使用，企业会话失效时禁止新增、使用、编辑和 reveal，
  但保留同 owner 删除本机模型与 Credential 的数据主权。本批不新增配置过期策略、离线租约、设备
  失联阈值或实时撤销。同步明确“所有者可主动查看个人 Key”已是 Model Experience 产品决策，
  DFI-4A.0 的 ADR-013 Addendum 只冻结 reveal 安全实现；企业 Credential 永不提供查看。Revision 1
  曾仅进入差异复核；当前 DFI-4A.0 已在 repair.1 后正式 `PASS/CLOSED`，DFI-4A.1～4A.4 继续
  `GATED`，不修改生产代码、Contract、IPC、Schema、依赖或版本。
- `0.0.0-dfe.5b.2` 实现设置二级导航与 GATED 页面骨架：`#/settings` 下新增
  `personalization`、`memory`、`feedback`、`identity` 四条真实可达路由，并把模型页原有
  disabled button 导航替换为共享 `SettingsSectionNav` RouterLink 导航；五个设置页复用同一
  响应式布局与共享 GATED 页面壳。新增页面只展示 `static_product_copy` 与
  `capabilityState=gated`，明确区分 Desktop/Core 运行正常与功能尚未接入，不提供真实保存、
  提交、同步、登录、记忆 CRUD、Identity/RBAC 或反馈提交成功语义。本批只补页面骨架，不能关闭
  DFE-5B 整体，也不宣布个性化、个人记忆、反馈或身份功能完成；真实或交互型 Prototype 后续另立
  DFE-5B.3 或专项批次。未修改 Main、Preload、IPC、Contracts、Core、Central、SQLite migration、
  Document Worker、依赖或 lockfile；DFE-6、DFI-2B 与 DFI-3 继续 `GATED`。
- 新增 `TOOL-MANAGEMENT-FEATURE-SPEC-v1.0.md`，冻结 Tool 接入与管理产品语义：现有 5 个
  Document Tool 属于内置代码 Tool，由可信代码包/Manifest 自动进入 Catalog，Admin 不上传、替换
  或编辑代码，只配置企业启用、授权、兼容范围和更严格限制；MVP 的中央远程接入固定为 HTTP API
  与 MCP，新增入口不创建内置 Tool。Spec 分离 ToolDefinition/Binding、Connection、Credential、
  Enterprise Policy、Validation、Health 和生效状态，明确保存、测试、启用互不冒充，有副作用测试
  不默认修改生产数据，普通停用只影响新 generation/新任务，被机器人引用时失败关闭且不静默换
  Tool。同步 PRD、MVP 功能基线、全局 Frontend Spec Revision 2 和产品索引；真实 Catalog、Policy、
  HTTP/MCP Gateway、Credential、测试和健康按 TGM-0～TGM-5 分批评审和授权，当前不修改代码、
  Contract、IPC、Schema、依赖或版本，未接通页面继续 `GATED`。
- 用户正式接受 `0.0.0-dfe.5b.1` 独立 QA 结论：focused、Desktop build、lint、audit 与完整
  Workspace 门禁均通过，P0～P3=0，DFE-5B.1 正式 `PASS/CLOSED`。该关闭只确认知识中心
  Prototype/GATED 基础体验，不解锁真实 Knowledge Provider；DFE-5B.2 只允许准备方案，DFE-6、
  DFI-2B 与 DFI-3 继续 `GATED`。
- 新增 DFI-4A 个人模型与 Credential Foundation 详细开发计划：拆分 DFI-4A.0 架构/Keychain
  preflight、DFI-4A.1 Domain/Persistence、DFI-4A.2 受控 Credential Broker/CRUD、DFI-4A.3
  个人 Provider Runtime/Usage/Task lock、DFI-4A.4 Desktop Safe Interface/E2E。计划提出
  ADR-013 反向 reveal Addendum、macOS Keychain 可行性门槛、migration 23/24、跨 SQLite/Keychain
  operation journal、local_personal authority、Endpoint SSRF/DNS rebinding 护栏和 52 项 QA 矩阵。
  本批只修改文档，不修改代码、Contract、IPC、Schema、依赖或版本；当前 DFI-4A.0 已在
  repair.1 后正式 `PASS/CLOSED`，DFI-4A.1～4A.4 继续等待文档评审和用户逐批授权。
- `0.0.0-dfe.5b.1` 实现知识中心基础体验：`#/knowledge` 从 skeleton 切换为真实前端页面，并新增
  `#/knowledge/:knowledgeId` 详情路由；生产默认使用 `GatedKnowledgeAdapter`，只展示企业知识能力
  尚未配置/真实检索待接入状态，不展示 Fixture 知识源、搜索框、详情入口或示例结果卡片。
  Fixture 知识源与示例结果仅通过显式测试/开发注入使用，持续标注 `prototype/gated`，搜索只过滤本地
  安全展示字段。新增 `R3SearchField` 可访问名称支持与知识中心 ViewModel/页面测试，覆盖
  Unconfigured/Gated、Empty、Ready、Unavailable、Permission denied、Error、Partial、Not found
  与敏感字段脱敏边界。本批未新增真实 Knowledge Provider、Contract、IPC、Preload API、Core/Central
  状态、存储、依赖或 lockfile；DFE-6 与 DFI-2B～DFI-4 继续 `GATED`。
- 用户正式接受 `0.0.0-dfi.2a.3` 独立 QA 结论：本批 P0～P3=0，DFI-2A.3 与 DFI-2A
  整体正式 `PASS/CLOSED`。该关闭仅确认智能授权 SubmitTurn 编排、恢复与 readiness cutover
  已完成，不自动解锁 DFI-2B、DFI-3 或 DFI-4；后续阶段继续等待详细方案评审和用户明确授权。
- `0.0.0-dfe.5a.1` 实现设置模型管理基础体验：新增 `#/settings/models` 并让 `#/settings`
  固定重定向到模型管理；Renderer 通过新的 Settings Adapter 只包装现有 `listModels` 高层 API，
  不新增 IPC/Contract/Core 状态。页面以统一只读行展示当前真实 Model Projection，把 `name`
  作为兼容期显示名称，不伪装 Provider 模型标识；`source=official` 明确显示为“平台基线模型”，
  不静默解释为企业模型。个人模型区域保持持续可见的“待接入”说明，只展示 Provider、模型标识、
  显示名称的未来布局，不接收真实 API Key，不提供测试连接，不伪造保存、删除、查看 Key 或设为默认成功。
  本批仅修改 Renderer、Desktop tests 与收口文件；未修改 Main、Preload、IPC、Contracts、Core、
  Central、SQLite migration、依赖或 lockfile。
- DFE-5.0 Model Experience Revision 1 产品决策已由用户接受：新增并修订 `MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md`，明确企业模型来自后台配置与排序、个人模型由后台权限控制并在个人设置管理；个人模型分别采集提交给 Provider 的精确模型标识与用户可见显示名称；不提供测试连接并以“未验证”开始；网络失败保留最近失败警告但允许再次真实调用；企业模型为空但存在可用个人模型时要求用户明确选择，仅在两类模型均不可用时阻止新任务。继续区分用户默认模型与机器人临时有效模型，任务首次提交后锁定；个人模型仅在存在执行中任务时阻止删除。个人 Key 默认掩码，所有者可主动查看，Renderer 只在受控交互中短暂处理明文；MVP 不检测系统截图，日志/埋点/错误/Fixture/QA 证据继续禁止真实 Key。保存后查看需 ADR-013 反向敏感通道增补；个人模型真实后端建议另立 DFI-4A，DFI-2B 不自动启动。同步更新 PRD、MVP 功能基线、全局 Frontend Spec、DFE/Living Spec、产品索引、README 与关键节点；本批仅修改文档，不修改代码、Contract、IPC、Schema、依赖或开发版本，DFE-5A～DFE-6 与 DFI-2B～DFI-4 继续 `GATED`，DFI-2A.3 与 DFE-4B-repair.1 的用户接受状态不在本批改写。
- `0.0.0-dfe.4b-repair.1` 修复 Electron 43.2 preload smoke / Desktop Main ESM 入口兼容性：
  `preload-smoke.ts` 与生产 `main/index.ts` 改为从 Electron 默认导入对象解构 `app`、`BrowserWindow`
  等运行时成员，避免依赖 Electron CJS bridge 的命名导出；Desktop preload smoke 在 Electron 43.2
  下恢复通过。本批未修改 Renderer 页面、Preload API、IPC Contract、Core 业务语义、依赖或 lockfile；
  独立 QA 已通过，当前等待用户接受，不在本次 Model Experience 文档修订中关闭。
- `0.0.0-dfi.2a.3` 完成智能授权 SubmitTurn 生产编排与 readiness 一次性切换：Desktop Local
  `v1alpha1` 与 `v1alpha2` 请求分别保留 exact wire digest，统一写入严格 `v1alpha2` coordination
  record，并显式锁定 transport version、Authorization Plan 与 execution selection digest；生产
  Coordinator 只使用 authorization-aware Task bundle 原子提交，不保留旧 bundle 双写。历史
  recoverable `v1alpha1` record 通过全身份 CAS normalization 补齐固定
  `smart_confirm / legacy_default` 计划，completed terminal record 不被改写；Receipt/Query 按原始
  transport 投影，v1alpha1 形状保持不变。启动顺序冻结为 persistence → legacy authorization
  materialization → recovery → server → ready，materialization 失败时不公开 ready。本批未新增
  migration 23，未修改 HTTP route、Main、Preload、Renderer、AuthorizationEvaluator、Confirmation、
  Kernel、Central 或 Document Worker。开发者专项 **5 files / 55 tests**、Workspace
  **191 files / 1286 tests + 3 smoke**、Central online/offline **302/0/0/0** 均串行通过；独立 QA
  P0～P3=0；后续用户已正式接受并关闭 DFI-2A.3 与 DFI-2A 整体，DFI-2B/3/4 继续 `GATED`。
- `0.0.0-dfi.2a.2` 完成智能授权选择持久化底座：Core SQLite 新增 forward-only migration 22
  `task_authorization_selections`；`TaskPersistence` 新增 authorization-aware 并行 bundle、严格读取和
  legacy materialization CAS 接缝，既有 v1alpha1 `commitSubmitTurnTaskBundle` 保持不变。
  InMemory 与 SQLite 同时实现原子提交、幂等/冲突、完整 `TaskRuntimeSelection` snapshot、确定性
  `smart_confirm / legacy_default` materialization 和 close/reopen 校验；indexed columns 精确取自
  canonical selection/execution identity。未修改 Contracts、SubmitTurnCoordinator、readiness、
  HTTP/Main/Preload/Renderer、Kernel、Central、Document Worker 或 lockfile。独立 QA 串行通过
  Workspace **191 files / 1275 tests + 3 smoke** 与 Central online/offline **302/0/0/0**，
  P0～P3=0；用户已正式接受并关闭 DFI-2A.2。DFI-2A.3 已形成详细实施方案，并在 Revision 1
  冻结 legacy normalization 全量身份字段及 normalization/validation helper 职责分离；当前等待
  差异复核，编码仍 `GATED`；DFI-2B/3/4 继续 `GATED`。
- DFE-5.0 前置 docs-only 初版冻结设置、模型管理、知识中心和 P1 设置骨架边界：当时尚不存在
  Model Experience Feature Spec，ADR-013/ADR-014 仅为架构文档，不替代模型管理产品语义 Spec；
  DFE-5A 编码前必须冻结 Model Experience Feature Spec 与受控 Credential 输入链路。Mock 阶段严禁接收
  真实 API Key，Key 不得明文回显或进入日志、Trace、QA evidence、截图、fixture、error、Renderer state
  dump 或持久化 artifact；Credential 存储、加密、读取和删除必须等待 ADR-013 对应真实接缝与 DFI 后端批次。
  本批仅修改文档和变更记录，不修改 Renderer、Main、Preload、Contracts、Core、Central、Document Worker、
  SQLite migration、Port/Persistence、IPC Contract、依赖、lockfile 或开发版本；DFE-5A～DFE-6 与
  该初版边界现已由上方 Model Experience Revision 1 产品 Spec 补齐；DFI 后续状态以对应最新条目为准。
- `0.0.0-dfe.4b` 完成 Desktop 智能中心创建机器人与创建技能前端模块：新增
  `#/intelligence/create-robot` 与 `#/intelligence/create-skill` 路由；创建机器人提供头像默认/预设/上传
  本地预览、上传头像移除恢复默认、名称/标签/介绍/行为规则和四类能力开关，能力默认关闭且保留已选项；
  创建技能提供三字段表单、字段级校验、创建对话本地预览和失败重试状态，创建对话页不展示运行测试或提交发布。
  “我创建的”技能详情显示禁用的运行测试与提交发布入口，真实保存、测试、发布、目录写入、Agent/Skill
  Feature Spec 语义和 Catalog Projection 继续 GATED。本批未新增 IPC、Contract、Core、Main/Preload、
  Central、Document Worker、依赖或 lockfile。
- 产品文档对齐智能中心创建体验最终原型：机器人预设头像只允许选择和切换，只有用户上传头像在悬停时显示“×”并可移除恢复默认，不再提供独立移除按钮；创建技能会话失败后的“重试”必须真实重新发起创建，成功后进入对话，重新打开表单时重置本次尝试状态。本批仅修改 PRD、全局前端 Spec 与变更记录，不修改代码、Contract、IPC、Schema、依赖或开发版本。
- `0.0.0-dfi.2a.1` 完成智能授权 Contract 与 Selection Resolver Foundation：Desktop Local
  `v1alpha2` 新增严格的 `manual_review / smart_confirm / task_scoped` 授权偏好、resolved fact、
  authorization-aware SubmitTurn/Receipt 与 coordination record schema；v1alpha1 的请求、Receipt、
  digest 和公开形状保持不变，并在 Core 规范化为 `smart_confirm / legacy_default`。Core 新增固定
  MVP 模式 Policy Port/Fake、纯 `TaskAuthorizationSelectionService`、独立
  `authorizationSelectionDigest` 与组合 `executionSelectionDigest`，不改写既有
  `TaskRuntimeSelection.selectionDigest` 或 `TaskSubmitTurnBinding.bundleDigest`。本批未新增 migration
  `22`，未接入 Persistence、SubmitTurnCoordinator、HTTP/Main/Preload/Renderer、风险动作矩阵、
  Kernel 或 Central；DFI-2A.2 后续详细方案已通过评审并获得用户单独编码授权，DFI-2A.3、
  DFI-2B、DFI-3、DFI-4 继续 `GATED`。专项
  **2 files / 18 tests**、Workspace **188 files / 1256 tests + 3 smoke**、Central online/offline
  **302/0/0/0** 均通过开发者与独立 QA 串行门禁，P0～P3=0；用户已正式接受并关闭
  DFI-2A.1。DFI-2A.2 的授权仅覆盖 migration 22、并行 Persistence API、InMemory/SQLite
  双实现与 legacy materialization，不包含 SubmitTurnCoordinator/readiness 生产切换。
- `0.0.0-dfi.1b` 完成 Desktop P0 Workspace Browser 跨进程接入：Desktop Local `v1alpha2`
  新增 additive compatibility feature、strict Workspace Query/Reveal Command、path-free Receipt 与
  typed error；Core private HTTP 接入 compatibility、单层目录查询和 reveal prepare/consume，
  保持 `v1alpha1` 不变。Electron Main/Preload 新增独立三成员
  `window.robothreeDesktopV1Alpha2` sidecar，Renderer 不接触绝对路径、HMAC key、私有 token 或
  Shell。Reveal 使用 DFI-1A 同一实例密钥的独立 `wra1` domain，绑定 Task、selection、Grant、
  runtime instance、root identity 与 command；Main 在 `shell.openPath` 前二次验证目录身份。
  3/5 秒分层 deadline、有界 Attempt Registry、同 command 幂等和
  `workspace.reveal_outcome_uncertain` 已进入实现与负向测试。本批未修改 Renderer 页面、
  Kernel reducer、SQLite migration、Central、Document Worker、依赖或 lockfile；DFI-2/3/4
  继续 `GATED`。Workspace **186 files / 1238 tests + 3 smoke**、Central online/offline
  **302/0/0/0** 已通过独立 QA，P0～P3=0；用户已正式接受并关闭 DFI-1B。Renderer 接入与 Mock
  删除不随接口批次自动发生。
- `0.0.0-dfe.4a` 完成 Desktop 智能中心浏览与详情：`#/intelligence` 从 skeleton 切换为真实
  SFC 页面，新增机器人、技能和工具三个独立列表，支持独立搜索与筛选，并提供
  `#/intelligence/robots/:robotId`、`#/intelligence/skills/:skillId`、
  `#/intelligence/tools/:toolId` 详情路由。数据层新增受控 `intelligence-adapter`，仅调用既有
  `listAgents` / `listModels` 高层 API；技能和工具使用明确的 Mock inventory，等待真实 Catalog
  Projection 后替换。机器人卡片不显示状态标签，技能不显示旧分类标签，工具风险与生命周期只用
  中性标签；创建机器人、创建技能保持禁用并标注后续批次。未新增 IPC、Contract、Core、
  Main/Preload、Central、Document Worker、依赖或 lockfile；DFE-4B～DFE-6 与 DFI-1B～DFI-4
  继续 `GATED`。
- `0.0.0-dfe.3b` 完成 Desktop 任务详情右侧面板与成果预览：`#/tasks` 在任务详情内新增
  右侧 Dock，提供“概览 / 工作空间文件”固定视图、成果活动标签、关闭与恢复、软件内全屏和
  收起/展开状态。成果列表来自既有 `TaskDetailProjection.artifacts`，Text/Markdown 预览复用
  `previewArtifact` 和 Renderer 安全结构化渲染，HTML 预览复用既有 loopback sandbox iframe
  且保持 `sandbox=""` / `referrerpolicy="no-referrer"`；打开本地文件夹、导出、固定/隐藏均通过
  现有 pathless Artifact API，不把 `workspaceRoot`、`rootRealPath`、`selectionHandle` 或真实路径
  传入 Renderer。工作空间文件视图在 DFI-1B 跨进程 Projection 接入前只显示固定占位，不读取目录、
  不接收路径。本批未新增 IPC、Contract、Core、Main/Preload、Central、Document Worker、依赖或
  lockfile；DFE-4～DFE-6 与 DFI-1B/2/3/4 继续 `GATED`。
- `0.0.0-dfi.1a` 完成 Desktop P0 Workspace Browser 的 Contract/Core 安全底座：在既有
  Desktop Local `v1alpha2` 中新增严格、加法式的单层目录 Query/Projection，查询只接受
  `taskId`，Core 从已持久化且 digest 有效的 `TaskRuntimeSelection.workspaceGrantId` 解析
  authority，不接受 Renderer 提供 WorkspaceGrant、相对路径或绝对路径。Node Adapter 使用
  lexical + `realpath` containment、文件身份复核和有界 `opendir`，symlink 只展示不跟随；
  `.claude` / `.robothree` 保持可见，VCS/依赖元数据由固定 Core policy 过滤。entry/cursor 是
  当前 Core 实例用 256-bit HMAC 签发的 opaque proof，绑定 Task、selection digest 和 Grant，
  重启后失败关闭且不持久化密钥。新增 valid/invalid Fixture 与 19 项专项覆盖；未修改
  v1alpha1、Kernel reducer、SQLite migration、HTTP/Main/Preload/Renderer、Central 或依赖。
  完整 Workspace、Central online/offline 和 Claude Code 独立 QA 均通过，用户已正式接受并关闭
  DFI-1A。DFI-1B 详细实施方案初轮评审 `PASS（P0=0/P1=0/P2=0/P3=2）`，Revision 1 已冻结
  `shell.openPath` 超时/结果不确定语义和复用 DFI-1A runtime HMAC key 的 `wra1` authority token；
  Revision 1 差异复核已 `PASS（P0～P3=0）`；后续 DFI-1B 实施状态见独立条目，DFI-2、
  DFI-3 和 DFI-4 继续 `GATED`。
- `0.0.0-dfe.3a` 完成 Desktop 任务详情与持续交互：`#/tasks` 在任务列表旁新增任务详情区，
  复用现有 `ConversationSnapshot`、`TaskDetailProjection`、durable cursor、Desktop event bridge
  和 `TaskControlCommand`，展示持久对话、流式 Assistant token、用户语言状态指导、任务步骤、
  工具活动、用户确认卡片和有界成果数量。停止、重试、继续、补充输入、允许/拒绝确认均通过既有
  `controlTask` 高层 API；不新增 IPC、Contract、Core reducer 或 Renderer 侧任务状态机。同步收口
  DFE-2B 独立 QA P3：重命名、停止、删除、补充输入和确认决策均使用 `R3Modal` / `R3Input` /
  `R3Textarea`，不再使用浏览器原生 `window.confirm` / `window.prompt`。未修改 Main、Preload、
  Contracts、Core、Central、Document Worker、依赖或 lockfile；右侧成果面板、Workspace 文件树、
  智能授权真实接入和 DFE-3B～DFE-6 继续 GATED。初轮独立 QA 发现未授权 DFI workspace-browser
  Contract/Core 代码混入；该代码、测试、fixture 和 stale dist 已隔离，修复后完整门禁回到
  `176 files / 1203 tests PASS + 3 smoke`，DFI 继续 GATED。
- `0.0.0-dfe.2b` 完成 Desktop 任务列表与任务管理：`#/tasks` 从 skeleton 切换为真实
  SFC 页面，新增受控 `tasks-adapter` 包装现有 Session/Task 高层 API，新增纯
  `task-list-model` 处理搜索、状态筛选、固定排序、状态摘要和删除门槛。用户侧统一显示“任务”，
  不再并列显示“会话”；打开、重命名、删除、停止分别复用现有 `openSession`、`renameSession`、
  `deleteSession` 和 `controlTask(cancel_task)`。置顶在真实 Contract 接缝具备前仅为
  “本次视图置顶”本地标记，不宣传持久化。未修改 Main、Preload、IPC、Contracts、Core、
  Central、Document Worker、依赖或 lockfile；智能授权真实接入、任务详情、右侧面板和后续页面
  继续 GATED。
- 产品文档冻结 Workspace 与智能授权真实语义：新增
  `WORKSPACE-AUTHORIZATION-FEATURE-SPEC-v1.0.md`，将 Composer 三模式统一为“手动复核/
  智能确认/任务内授权”，明确 WorkspaceGrant 是硬访问边界、模式只控制确认策略，首次提交后随
  Task/Runtime Selection 锁定并参与恢复。真实链路接入前只允许标记“待接入”的只读说明；接入后
  必须通过版本化 Contract 传递 requested mode，由 Core 返回并持久化 resolved mode，禁止可点击但
  无效、静默丢弃或原地改写严格 v1alpha1。PRD、全局前端 Spec、前端开发计划、Living Spec 和产品
  索引已同步；本批不修改代码、Contract、IPC、Schema、依赖或开发版本，真实跨层编码继续 GATED。
- `0.0.0-dfe.2a` 完成 Desktop 新工作台与任务创建体验：关闭 DFE-1B 两项 P3（`R3Tooltip`
  纳入真实 `.vue` mount/export 覆盖，移除 router 测试注入生产分支），新增受控
  `workbench-adapter` 作为 Renderer 唯一新 Desktop API 触点，`/workbench` 切换为 SFC
  新任务工作台，`/legacy` 保留旧实现回退。新页面接入真实 Workspace、Session、Agent、
  Model、recent Tasks、recent Artifacts 与 `submitTurn` 高层命令，提供 Composer、工作区/
  会话/机器人/模型选择、技能勾选、授权模式只读说明、附件展示、禁用原因、提交反馈和右侧摘要。
  DFE-2A 独立 QA P2-1 已修复：智能授权三模式在 Feature Spec/Contract/Core 接入前不再显示为
  可点击选择器，页面明确标注「待接入」和「当前不改变任务执行」。
  未修改 Main、Preload、IPC、Contracts、Core、Central、依赖或 lockfile；DFE-2B～DFE-6
  继续 GATED。
- `0.0.0-dfe.1b` 完成 Desktop Shell 与五个一级导航骨架：关闭 DFE-1A QA P2，
  建立真实 `.vue` mount 测试路径并覆盖 R3 基础组件运行时行为；清理 `main.ts` 历史 marker，
  将 architecture boundary 检查迁到 `legacy/LegacyWorkbench.ts`；Desktop 版本升至
  `0.0.0-dfe.1b`。Renderer 新增 Shell、五个一级入口、侧栏展开/收起、当前选中、用户入口、
  页面容器和通用 Loading/Empty/Permission/Unavailable/Error skeleton；旧工作台进入
  `/workbench` 并用 `KeepAlive` 保持页面切换不重建。生产 dist 不包含 dev-only
  `DesignSystemGallery` chunk；未修改 Main、Preload、IPC、Contracts、Core、Central 或真实业务语义。
  开发者门禁 **169 files / 1185 tests + 3 smoke** 通过；Claude Code 独立 QA
  `PASS（P0=0/P1=0/P2=0/P3=2）`，用户已接受并关闭 DFE-1B。两项 P3（Tooltip 真 mount
  覆盖、router 测试注入分支）后续治理收口，不阻断。
- DFE-1A 完成 Desktop Renderer 前端工程基座：引入 Vue SFC 编译、hash router、
  `vue-router`、`@vitejs/plugin-vue`、`@vue/test-utils` 与 `happy-dom`；`main.ts`
  收敛为薄 bootstrap，既有 h() 工作台机械迁入 `legacy/LegacyWorkbench.ts`，
  生产路由仅保留 Legacy workbench，dev-only `__design-system` 路由只在开发或显式测试
  fixture 中注入。新增语义 Token、reset/typography/utilities/states 样式分层和首批
  `R3*` 基础组件，并将 Renderer boundary tests 升级为目录级扫描。未修改 Main、Preload、
  IPC、Contracts、Core、Central 或业务语义；完整门禁 **168 files / 1181 tests + 3 smoke**
  通过，offline frozen install `downloaded 0`。Claude Code 独立 QA 结论为
  `PASS（P0=0/P1=0/P2=1/P3=2）`，用户已接受并关闭 DFE-1A；其中 P2 要求 DFE-1B
  编码前补齐真实 `.vue` mount 组件测试路径。
- `0.0.0-arh.3.3.3-repair.1` 修复独立 QA 阻断的轻量 takeover 时序敏感点：test-only
  failpoint 由轮询全局 blocked 状态改为 `sessionId` 绑定的单次 latch handshake，stale 或错配
  session 失败关闭；保留原 takeover、lease/fencing 与 Provider 语义，不延长轮询、不自动重试、
  不删除场景。Harness 同时补齐 process output、child log/trace、test/machine evidence、safe JSON/
  diagnostics 四通道泄漏扫描，每轮覆盖 canary、credential、provider endpoint、content body、
  absolute path 五类 marker 及 raw/Base64/URL-encoded 形态。开发者正式门禁完成三轮一致的完整
  replay、52/52 场景和 86 个轻量长稳 cycle，共 89 lifecycle cycles；四通道命中及八类资源余量
  均为 0，Workspace **166 files / 1176 tests + 3 smoke**、Central online/offline **302/0/0/0**
  均通过。Claude Code 随后严格串行从零复跑正式 Harness：三轮 semantic replay、92 个轻量
  长稳 cycle（36.6 分钟）、精确 takeover 10/10、Workspace **166 files / 1176 tests + 3 smoke**、
  Central online/offline **302/0/0/0** 全部通过，四通道泄漏和八类资源余量均为 0；用户已正式
  接受，repair.1、ARH-3.3.3、ARH-3.3 与 ARH-3 依次 `PASS/CLOSED`。后续正式 Harness 与
  Central 门禁必须串行执行。本批只修改 test/Harness/Fixture 与治理记录。
- 产品文档按 2026-08-16 任务详情原型重构 Desktop 右侧操作面板：默认“概览”包含可折叠的
  “产物/任务进程”，可切换当前 Workspace 嵌套文件树；产物改为面板顶部多文件标签，Markdown
  与 HTML 在既有安全边界内预览，PDF/XLSX 等不支持内容展示固定页面内提示。右上角工具栏按
  “打开本地文件夹/全屏/收起”排列，通过受信任 Workspace 边界在系统文件管理器中打开当前任务
  的默认空间或授权项目空间；面板支持铺满软件窗口内容区域和完全收起，“«/»”入口互斥并保留视图与标签状态；删除旧任务信息、任务操作、
  运行组合等右侧 Section，以及对话标题更多菜单和元信息行。任务管理操作统一保留在任务列表，
  底层 Projection、确认、恢复和审计事实不变。本批仅修改 PRD、全局前端 Spec 和产品文档索引，
  不修改代码、Contract、IPC、Schema、依赖或开发版本。
- `0.0.0-arh.3.3.3` 完成 Unified Closure Evidence Harness 收口：严格分离三轮完整 M1～M8
  semantic replay 与后续轻量长稳 cycle，避免在每个长稳 cycle 重放 Central 全矩阵；增加
  Node 24.13.0 fail-fast、安全失败留证、真实资源诊断、OS 分配 Relay 端口和 status-first
  测试恢复。正式开发者门禁实际完成 **3 轮完整重放 + 85 个轻量长稳 cycle（总计 88 cycles）**，
  运行超过 30 分钟，52/52 场景及 semantic/stability digest 稳定，敏感扫描和八类资源余量均为
  0。实施期三个失败运行的 `failure.json` 均保留，没有以补跑覆盖失败事实。本批只修改测试、
  Fixture、Harness 和治理记录；公共 Contract、Schema/migration、Kernel、Desktop、生产 Runtime
  与依赖均未修改。当前等待 Claude Code 独立 QA，ARH-3.3/ARH-3 尚未关闭；`CTR-P3-001`
  继续独立跟踪，未被本批吸收。
- 产品文档按 2026-08-16 前端原型调整智能中心：机器人从“企业/部门/我的”改为
  “全部/我创建的”，卡片仅显示图标、名称、来源 · 创建人和简介，不再显示状态标签；
  技能改为“技能广场/已安装/本地目录/我创建的”四类且不提供“全部”，卡片区分中文标题、
  技术名称、创建人或所属目录和描述；Desktop 工具改为无子分类的独立卡片列表，Admin
  工具管理继续使用表格。`FRONTEND-EXPERIENCE-SPEC-v1.0.md` 同步卡片字段和列表独立性，
  将全局状态标签统一为中性灰，并保留页面消息、风险确认、破坏性操作和错误反馈的语义色；
  企业/部门继续作为来源和权限事实，不再作为机器人或技能的分类 Tab。本批仅修改产品文档，
  不修改代码、Contract、IPC、Schema、依赖或开发版本。
- ARH-3.3.3 详细方案完成 Revision 1：用户明确接受新增的 **30 分钟且至少 5 个 lifecycle
  cycle** 阶段关闭门槛；计划新增 test-only 真实资源诊断，禁止以硬编码 0、缺失诊断或空断言
  证明资源归零；量化每 cycle 六类 durable/recovery 事实，补充 52 场景对父计划 36 场景的超集
  映射，QA 增至至少 52 项，工期调整为 **5～8 个集中工程工作日**。Claude Code 差异复核
  `PASS（P0=0 / P1=0 / P2=0 / P3=2）`；两项 P3 标题/措辞一致性问题已修正。当前等待用户
  接受与明确编码授权，coding 仍 `GATED`；本轮未修改代码、测试、Contract、Schema/migration、
  依赖或版本。

- ARH-3.3.2 已正式收口：Claude Code 独立 QA 实际串行复跑专项 **52/52**、Node **79 tests**、
  Central **27 tests**、Workspace **164 files / 1155 tests + 3 smoke** 与 Central online/offline
  **299/0/0/0**，`P0～P3=0`；用户已接受并将 ARH-3.3.2 `PASS/CLOSED`。同时建立 ARH-3.3.3
  docs-only Unified Closure Evidence 详细方案：分离矩阵定义 digest 与真实 semantic result digest，
  要求三轮 fresh topology、M1～M8 实际重跑、30 分钟且至少 5 个 lifecycle cycle、四通道敏感
  扫描和资源归零。方案当前进入 Claude Code/MiniMax 文档评审，编码仍 `GATED`；本轮没有修改
  生产代码、测试、Contract、Schema/migration、依赖或版本。

- `0.0.0-arh.3.3.2` 完成 Recovery、Usage 与 Compaction Matrix：统一 Harness 串行复用真实
  Core SQLite recovery/Compaction 链与 Central 双 JVM、共享 PostgreSQL、受控 Relay，实际覆盖
  M1～M8、main/initial/rolling Compaction Usage、cache hit/miss/disabled/unsupported/unknown、
  stale fencing、PostgreSQL pause/unpause 和 Summary + raw tail 恢复。专项 **52/52 场景**、Core
  **79 tests**、Central **27 tests**，完整 Workspace **164 files / 1155 tests + 3 smoke**、Central
  online/offline 各 **299/0/0/0** 通过；资源计数和敏感输出扫描均为 0。该批只新增测试编排脚本
  并升级 Root/Core/Central 实施版本，没有修改公共 Contract、Schema/migration、Kernel、Desktop、
  生产 recovery 或依赖；该批后来已通过独立 QA并由用户正式接受关闭，ARH-3.3.3 继续
  `GATED`。

- `0.0.0-arh.3.3.2-preflight-repair.2` 修复 ARH-3.3.2 真实 Central terminal 顺序下的前置 P1：
  Central 将 Provider Usage Fact、
  `usage_recorded` 与 terminal 在同一事务中提交，但 Core Assistant/Compaction 在
  `outputStartedAt` 已存在或 status 已 `completed` 时会在 durable Event 回放前退出。repair.1 的
  Projection-before-cursor 保证 cursor 未越过事实，却不足以让真实 terminal 路径消费该事实。
  Core 现改为 status-first：terminal 时从持久 cursor 有界补齐 durable Usage/terminal facts，Usage
  仍先投影再推进 cursor；补偿收敛后继续明确输出不可恢复，不重放 ephemeral delta，不创建
  Assistant Message/Summary，也不重复 Gateway accept。新增 Assistant/Compaction M3/M4 SQLite
  close/reopen、无 Usage、四类 terminal、identity/cursor/digest 失败关闭覆盖。公共 Contract、
  Schema/migration、Central、Kernel、Desktop、依赖与 lockfile 均未修改。Claude Code 独立 QA
  已确认 `P0～P3=0`，用户已正式接受并关闭 repair.2，ARH-3.3.2 主 Harness
  恢复开发，ARH-3.3.3 继续 `GATED`。开发者专项 **27 tests**、Workspace
  **164 files / 1155 tests + 3 smoke**、Central online/offline **299/0/0/0** 均通过。

- `0.0.0-arh.3.3.2-preflight-repair.1` 修复 Core 企业模型 Usage 派生事实的崩溃窗口：
  `DurableEnterpriseModelProvider` 的 Assistant 与 Compaction 分支现在先幂等提交 Core Usage
  Projection，再推进 invocation link durable cursor；当 Usage 是恢复流首个可见事件时，cursor 与
  `outputStartedAt` 在同一次 link 更新中提交。新增 Projection delegate 前失败、Projection 已提交但
  cursor 前失败两类故障测试；Assistant 使用真实 SQLite close/reopen，Compaction 验证生命周期
  重启与同 Event 幂等，旧顺序下测试会稳定暴露 cursor 越过未投影 Event。公共 Contract、
  Schema/migration、Kernel、Desktop、Central、依赖与 lockfile 均未修改。Claude Code 独立 QA
  串行复跑专项 **15 tests**、Workspace **164 files / 1143 tests** 与 Central online/offline
  **299/0/0/0**，`P0～P3=0`；用户已正式接受并关闭 repair.1，ARH-3.3.2 主 Harness 恢复开发，
  ARH-3.3.3 继续 `GATED`。

- ARH-3.3.1 已正式收口：Claude Code 独立 QA 实际复跑专项 **12/12**、Workspace **164 files /
  1139 tests + 3 smoke**、Central offline **299/0/0/0**；online 首次出现的一个既有
  `CTR-P3-001` 偶发 Error 经两次完整复跑均为 **299/0/0/0**，不构成本批回归。用户已接受并
  将 ARH-3.3.1 `PASS/CLOSED`。同时建立 ARH-3.3.2 docs-only Recovery、Usage 与 Compaction
  Matrix 详细方案，冻结真实 M1～M8、Central durable Event → Core Projection、main/initial/
  rolling Usage、Cache 状态和双数据库恢复；本轮未修改代码、Contract、Schema/migration、依赖
  或版本，ARH-3.3.2 coding 与 ARH-3.3.3 继续 `GATED`。

- `0.0.0-arh.3.3.1` 完成 Multi-Session Topology Foundation：新增两个独立 Core child、两份
  Core SQLite、一个受控进程外 Provider，并在 Core 进程存活期间串行执行 Central 双 JVM共享
  PostgreSQL、Prompt Cache Planner 与 Provider Process 专项。A1/A2/B1 三个 Session 和两个
  user/enterprise scope 证明同 Session 跨 Turn scope 稳定、同用户跨 Session 隔离，以及
  Conversation、Usage Projection、Cache Context 和企业/个人 authority 不串线。机器 Evidence
  只输出 count/digest/status/duration/resource metrics，专项 **12/12**、Central 选定 **44 tests**、
  Workspace **164 files / 1139 tests + 3 smoke**、Central online/offline 各 **299/0/0/0** 通过，
  敏感扫描与资源余量均为 0。该批只修改测试、Fixture、Harness 和治理记录，未修改生产代码、
  Contract、Schema/migration、依赖、Kernel 或 Desktop；独立 QA 仍待执行，ARH-3.3.2/3 继续
  `GATED`。

- ARH-3.3 docs-only 详细方案已建立：将其严格限定为 Multi-Session Isolation 与统一 Evidence
  Harness，不继续扩建 Core；规划两个 Core child、两个 Central JVM、共享 PostgreSQL、独立
  Core SQLite、受控 Provider、三 Session/两 user 与 enterprise scope、企业/个人 authority Fake
  隔离、M1～M8 恢复窗口和至少 36 项关闭矩阵。若 Harness 发现生产缺陷必须停止并另立 repair，
  不得顺手修改生产语义。`CTR-P3-001` 明确排除在 ARH-3.3 外；本批未修改代码、Contract、
  Schema/migration、依赖、版本或测试。该详细方案后来已通过评审并由用户确认，ARH-3.3.1
  已单独授权实现；ARH-3.3.2/3 继续 `GATED`。

- ARH-3.2.3 与 ARH-3.2 已正式收口：Claude Code 独立 QA 确认专项 **10 classes / 93 tests**、
  Workspace **163 files / 1132 tests + 3 smoke**、Central offline **297/0/0/0** 及双协议 wire、
  C8～C10、durable Usage、敏感扫描和资源归零通过；用户已接受并将 ARH-3.2.3、ARH-3.2
  `PASS/CLOSED`。独立 QA 中两个既有 Central 测试的偶发时序失败已通过单项复跑和另一轮完整
  online/offline 297 项门禁确认不构成产品回归，登记为 `CTR-P3-001` 独立测试可靠性维护项，
  不自动进入继续 `GATED` 的 ARH-3.3。

- `0.0.0-arh.3.2.3` 完成 Provider Cache Projection Closure：Application 层从 immutable
  Prompt Cache Plan 解析并复核 typed Projection，static-prefix digest 与双协议 wire body 共用
  canonical system/tool material。Anthropic-compatible 只投影 reviewed provider-default ephemeral
  marker 且不硬编码 TTL；OpenAI-compatible 区分 automatic-observed 与 explicit opaque
  `prompt_cache_key`，不发送 retention。进程外 Controlled Provider 已验证 C8～C10、双协议
  Usage 到 durable winner、确定拒绝不降级重试、取消、deadline、敏感输出与资源归零；专项
  **10 classes / 93 tests**、Central online/offline 各 **297 tests**、Workspace **163 files /
  1132 tests + 3 smoke** 全部通过。未修改公共 Contract、v0009、Core migration、Kernel、Desktop
  或依赖；独立 QA 与用户接受现已完成，ARH-3.2.3 与 ARH-3.2 正式 `PASS/CLOSED`，ARH-3.3
  继续 `GATED`。

- ARH-3.2.2 已正式收口：Claude Code 独立串行复跑专项 **9 classes / 66 tests**、Workspace
  **163 files / 1132 tests + 3 smoke**、Central online/offline，确认四层缓存身份、v0009、
  Transaction A/B、C3～C7、双 JVM 与敏感输出均满足既定门禁，`P0～P3=0`；用户已接受并将
  ARH-3.2.2 `PASS/CLOSED`。同时建立 ARH-3.2.3 docs-only Provider Cache Projection Closure
  详细方案，冻结 immutable Plan 消费、exact Profile/Binding/static prefix 复核、typed projection、
  Anthropic explicit marker、OpenAI automatic-observed/explicit-key、ARH-3.1 Usage 集成、
  C8～C10 与进程外 Controlled Provider；本轮未修改代码、公共 Contract、Schema/migration、
  依赖或版本，ARH-3.2.3 编码和 ARH-3.3 继续 `GATED`。

- `0.0.0-arh.3.2.2` 完成企业模型 Durable Prompt Cache Planner：Central PostgreSQL v0009
  新增 immutable Cache Context 与 Prompt Cache Plan，v1alpha2 accept 在 Transaction A 原子持久
  request/context，Transaction B 在 Provider dispatch 前原子持久 Plan。Planner 严格分离 Session
  安全 scope、静态来源版本锁、最终静态前缀与 cache key，合法切换 Agent/Skill/Tool 生成新 key，
  同一来源锁下内容漂移失败关闭；Profile/Compatibility/Policy 均以 exact revision 物化恢复。
  C3～C7 通过真实双 JVM、共享 PostgreSQL、lease/fencing 和 takeover 验证，Runtime 仍是 durable
  terminal 唯一提交者。Provider 请求尚未投影 `cache_control`/`prompt_cache_key`，真实 cache hit、
  Usage 集成与 Provider-specific projection 继续属于 `GATED` 的 ARH-3.2.3。开发者专项 Harness
  **9 classes / 66 tests PASS**，完整门禁与独立 QA 证据见 Development Log。

- ARH-3.2.2 docs-only 详细方案已修订至 Revision 1：修复 Session 安全 scope、静态来源版本与
  实际静态内容混用造成的 Monotonicity 矛盾，冻结 `cacheScopeIdDigest`、
  `staticSourceLockDigest`、`staticPrefixDigest`、`cacheKeyDigest` 四层身份。合法切换
  Agent/Skill/Tool revision 生成新 source lock/key、旧 Plan 不变；相同 source/execution/Profile
  identity 却生成不同 prefix 才失败关闭。`deviceId/clientInstanceId` 继续作为 Device Trust/Audit
  锚点且不进入 key，不同设备 Core 的 HMAC namespace 保持隔离；Provider-side hit 仍会调用
  Provider，Usage 不由 Plan 估算。ARH-3.2.2 QA 提高到 44 项，ARH-3.2 总门禁提高到 86 项；
  本轮未修改代码、Schema、migration、依赖或版本，等待 Claude Code 差异复核，编码继续
  `GATED`。

- ARH-3.2.1 已正式收口：Claude Code 独立串行复跑专项 **4 files / 60 tests**、Workspace
  **163 files / 1132 tests + 3 smoke**、Central online/offline 各 **233 tests**，13 项重点核查
  全部通过且 `P0～P3=0`；用户已接受并将 ARH-3.2.1 `PASS/CLOSED`。同时建立 ARH-3.2.2
  docs-only 详细方案，冻结不可变 Profile、字段穷尽 Compatibility Classifier、最终 wire static
  prefix projection、exact Session Cache Scope、Central v0009 最小两表、accept/dispatch 两个原子
  事务、Static Prefix Monotonicity 与 C3～C7 双 JVM 恢复；本轮未新增代码、Schema、migration、
  生产 Bean、Provider cache 字段、依赖或版本。ARH-3.2.2 等待 Claude Code、MiniMax 文档评审，
  编码及 ARH-3.2.3/3.3 继续 `GATED`。

- `0.0.0-arh.3.2.1` 完成 Prompt Cache Contract 与 exact Session Scope Foundation：新增语言中立
  Enterprise Gateway Model Invocation `v1alpha2` Schema/OpenAPI/Fixture/canonical digest，并让
  TypeScript 与 Java 对同一 strict sidecar 做 Conformance；四条 Model 路由由一次 operation
  精确锁定 wire version，v1alpha1 文件与行为保持不变。Core migration 21 持久化
  authority-scoped HMAC namespace 和 invocation-side cache context，主 Assistant 与 Compaction
  调用均按 stable link 完成 C1/C2 幂等恢复，raw Session、namespace key、Prompt、Credential、
  Endpoint 与 Token 不进入跨进程 Contract。Central v1alpha2 Controller 只依赖尚无生产 Bean 的
  typed application seam，因此 ARH-3.2.1 不会提前启用 v0009 Planner 或 Provider cache projection。
  开发者专项 4 files / 60 tests、Workspace 163 files / 1132 tests + 3 smoke、Central
  online/offline 各 233 tests 全部通过；独立 QA 和用户接受现已完成，ARH-3.2.1 正式
  `PASS/CLOSED`，ARH-3.2.2/3 与 ARH-3.3 继续 `GATED`。

- ARH-3.2 docs-only 详细方案已修订至 Revision 1：根据首轮评审 `P0～P2=0 / P3=2`，明确
  `cacheScopeIdDigest` 必须从 Central verified enterprise/user claims、Credential namespace、
  exact Session、Model/Binding/Adapter/Protocol 与 Profile revision 的 canonical material 派生，
  不能成为 `sessionScopeDigest` 的别名；同时冻结 namespace `retired` 只停止生成新 context，
  已持久 invocation 仍可按旧 revision 恢复，Alpha 不自动 rotation、删除或 GC。QA 规划由
  20/24/18 增至 24/28/18；本批只等待 Claude Code 差异复核，未修改生产代码、Contract、Schema、
  migration、依赖或版本，ARH-3.2.1/2/3 与 ARH-3.3 继续 `GATED`。

- ARH-3.1 已完成正式收口：Claude Code 独立复跑 `harness:arh3.1` 4 files / 24 tests、
  Workspace 162 files / 1099 tests、Central online/offline 全部 `BUILD SUCCESS`，13 项重点
  核查全部通过且 `P0～P3=0`；用户已接受并将 ARH-3.1 `PASS/CLOSED`。同时建立 ARH-3.2
  docs-only 详细实施方案，冻结 exact Session cache scope、Gateway v1alpha2 `cacheContext`、
  Core 私有 session-scope namespace/durable context、Central v0009 immutable Cache Context/Plan、
  Compatibility Fingerprint、Static Prefix Monotonicity 与 Anthropic/OpenAI 双协议投影；
  代码核验同时纠正旧描述：`ModelProviderInvocation` 已有 `sessionId`，无需重复建模。详细方案
  拆分 3.2.1 Contract/Scope、3.2.2 Durable Planner、3.2.3 Provider Projection，工程量按实际
  跨语言/双数据库/恢复范围调整为 12～19 天；所有编码及 ARH-3.3 继续 `GATED`，本批未修改
  生产代码、Schema、Contract、依赖或版本。

- `0.0.0-arh.3.1` 完成 Durable Usage Facts 与 Retry Dedupe：新增执行位置中立的
  `UsageAuthority`、Provider attempt identity、可选 cache-read/cache-write/reasoning Usage
  明细与自校验 digest。企业路径以 PostgreSQL v0008 + MyBatis 持久化 attempt/fact；terminal
  winner 的 Usage Fact、durable Event、Audit Outbox 与 terminal 状态同事务提交，stale owner
  只能记录 `superseded_confirmed`，不能覆盖 winner。Core migration 20 持久化不含正文、路径、
  Endpoint、Credential 或 Token 的 Invocation Usage Projection，并从 invocation-level facts
  确定性派生 Session 汇总；主 Assistant 与 Compaction 调用均已接入。个人模型路径只冻结
  Core-private Port/Fake/Conformance，未建设真实个人 Provider、凭据、权威表或 UI；Prompt Cache、
  Gateway v1alpha2 `cacheContext` 和 ARH-3.3 Harness 均未提前实现。开发者专项 4 files / 24 tests、
  Workspace 162 files / 1099 tests + 3 smoke、Central online/offline 各 223 tests 全部通过；
  Claude Code 独立 QA 与用户验收均已完成，ARH-3.1 `PASS/CLOSED`，ARH-3.2/3.3 继续
  `GATED`。

- ARH-3 详细方案已修订至 Revision 3：保留 Revision 2 的 exact Session scope、Compatibility
  Fingerprint、Static Prefix Monotonicity 和两级 Usage Projection，并以
  `UsageAuthority=central_enterprise|local_personal`、`CacheExecutionAuthority` 将 Usage Fact、
  retry dedupe 与 Prompt Cache 语义从 Central 专用收敛为执行位置中立。ARH-3.1/3.2 只实现
  企业路径，同时冻结个人路径的 Core-private Port/Fake/Conformance，不提前建设个人 Provider、
  Credential、权威表或 UI。用户接受 Enterprise Gateway v1alpha2 `cacheContext` 作为企业路径
  的最小 Contract 例外；个人路径不发送 sidecar，公共 `ModelRequest` 保持不变。OpenAI 官方
  依据已修正为 Prompt Caching 指南，QA 规划调整为 40/44/30，工程估算为 12～19 工作日。
  本批仍为 docs-only，等待 Claude Code 差异复核，所有 ARH-3 编码继续 `GATED`。

- ARH-3 详细方案已修订至 Revision 2：依据 Codex 源码研究，将 Alpha Prompt Cache 从同用户
  跨 Session 共享收紧为 exact Session scope；分离 cache scope、static prefix 与 transport
  identity，增加穷尽 `PromptCacheCompatibilityFingerprint` 和 Static Prefix Monotonicity。
  Usage 侧增加由 invocation-level durable projection 确定性重建的
  `InvocationUsageProjection` / `SessionUsageProjection`，重启或重连不得制造新的 durable
  Usage Event。代码核实确认现有 Gateway 请求没有 Session scope，因此明确提出最小 v1alpha2
  `cacheContext` sidecar：不修改公共 `ModelRequest`，v1alpha1 缺少 sidecar 时 cache disabled。
  既有 `ProviderUsageFact`、attempt/fencing、Central terminal 原子事务与 Core/Central 双数据库
  恢复保持不变。QA 规划更新为 36/40/26，工程估算调整为 11～17 工程工作日。本批仍为
  docs-only；ARH-3.0 等待 Claude Code 重新评审，所有编码继续 `GATED`。

- ARH-3 docs-only 详细方案已建立：将 Context Budget Estimate、Provider Usage Fact 与未来
  Cost Projection 分离，冻结 `invocationId + fencingEpoch` 的 durable attempt identity、同
  attempt replay 幂等和不同 attempt 已确认 Usage 分别保留；Prompt Cache Alpha 只允许同企业、
  同用户、同 Credential namespace 与同 exact Model/Binding/Adapter/静态前缀的跨 Session
  共享，并保持 cache semantic-neutral。计划拆分 ARH-3.1 Usage Facts、ARH-3.2 Cache Planning
  和 ARH-3.3 Isolation Evidence；真实 Provider cache 行为继续 `RESOURCE_GATED`。本批未修改
  生产代码、公共 Contract、数据库 Schema/migration、依赖、lockfile 或 package version，
  当前等待文档评审，所有 ARH-3 编码继续 `GATED`。

- `0.0.0-arh.2.3-repair.1` 收敛 ARH-2.3 W6 Harness 偶发失败：两个 fresh recovery
  owner 先分别完成 SQLite 启动，再同时释放竞争恢复，并使用独立确定性 ID 序列模拟生产 UUID
  不碰撞语义；W6 recovery helper/外层门槛分别调整为 30/40 秒，同时监听子进程提前退出并立即
  报告真实错误，避免把启动期 `database is locked` 误报为 timeout。生产代码、Contract、
  SQLite Adapter/Schema/migration、依赖与 lockfile 均未修改。W6 连续 10/10、ARH-2.3
  17 files / 115 tests（52/52）及完整 Workspace 160 files / 1087 tests + 3 smoke 已通过
  开发者复跑；Claude Code 独立 QA 再次实际执行 W6 10/10、52/52、Workspace 1087/1087
  与 Central online/offline，结论 `P0～P3=0`。用户已正式接受并依次关闭 repair.1、ARH-2.3
  和 ARH-2 阶段；ARH-3 继续 `GATED`。
- `0.0.0-arh.2.3` 完成 ARH-2 Recovery Closure Harness：以真实 Core child、受控 Provider、
  Process Tool、SQLite close/reopen 和命名 `SIGKILL` 覆盖 W1～W7；accepted/no-output 以
  status-first 续接，同一 logical identity 不重复 accept，output-started 且完整结果不可重放时
  明确 `recovery_exhausted`，不猜测或拼接 partial Summary。相同 50-round 场景已通过真实
  `DurableAgentLoopStarter`、durable Tool Batch/Effect 与 Process Model/Tool 完成 51 个主
  Model round、50 次严格串行 Tool 调用及首次/rolling Compaction。共享原子组规划器现将每个
  已闭合 Tool cycle 作为独立可压缩组；摘要内部 `invocationCommit` 与 strict 持久
  `CompactionRecord` 已分离，避免内部提交材料污染 Summary Record。新增 `harness:arh2.3`，
  开发者复跑 17 files / 115 tests、52/52 场景、完整 Workspace 160 files / 1087 tests +
  3 smoke、Central online/offline 各 215 tests，资源与四通道泄漏扫描为 0。公共 Contracts、
  Kernel reducer、Desktop、Central 生产代码与 Schema、migration 1～19、依赖和 lockfile 未修改；
  当前等待独立 QA，ARH-3 继续 `GATED`。
- `0.0.0-arh.2.2` 完成 ARH-2.2 Production Automatic Compaction Orchestration：实现
  `ContextPreparationCoordinator` 的 assessment → eligibility → admission → compact/recover →
  reload → final rerun 单轮生产路径；Summary provenance 从 immutable source range 推导，摘要
  admission scope 绑定 `purpose=compaction_summary`，恢复时按 ARH-2.1 immutable
  ExecutionBinding 重建精确 Provider Handle。Core 私有 migration 19 新增独立
  `compaction_model_invocation_links`，避免与同 round 主 Assistant invocation 和
  `messageCommittedAt` 语义冲突，并将 summary committed 与第二事务原子提交。Model-backed
  summarizer 复用 ARH-1 stream validator，固定 `tools=[]`、有界输出和 reduction 检查；active
  Summary 类别从原始 immutable range 重建，assistant provenance 以 external target、runtime
  selection、Model、Binding、Adapter、Registry exact revision/digest tuple 失败关闭。新增
  `harness:arh2.2`，开发者专项、完整 Workspace 与 Central 在线/离线门禁通过；Claude Code
  独立 QA 串行复跑 9 files / 47 tests、156 files / 1067 tests + 3 smoke 与 Central
  online/offline，`P0～P3=0`，用户已正式接受并关闭 ARH-2.2。公共 Contracts、Kernel、Desktop、
  Central、Document Worker、依赖和 lockfile 未修改。ARH-2.3 docs-only 恢复关闭 Harness
  首轮评审为 `PASS（P0=0 / P1=0 / P2=1 / P3=1）`；Revision 1 明确受控 Provider 的
  accepted/no-output 与 output-started/unreplayable 故障模式，并将固定重放输入定义为不约束
  墙钟、PID、端口和调度时序的 semantic seed，QA 增至 52 项。当前等待收口复核且编码继续
  `GATED`；ARH-3 继续 `GATED`。
- `0.0.0-arh.2.1` 完成 ARH-2.1 Atomic Planning 与 Compacted Context View：Core 新增共享
  `ConversationAtomicGroupPlanner`，以 durable Tool Call Batch/disposition/result 事实保持
  多 Tool、waiting confirmation、补充用户输入及终态结果的原子边界；
  `CompactionSourceRangePlanner` 仅选择旧完整前缀并保留最新用户组。Turn Snapshot 支持从
  active Compaction 后的 raw tail 构建，Context Pipeline 将 Summary 作为低权限、派生的
  `compaction_summary` conversation context 注入且不写入 ConversationMessage、Task 或执行
  事实。滚动摘要输入固定为 base Summary + 新增 raw extension，同时 Record 继续证明完整
  `1..sourceEnd`。Core SQLite migration 18 新增私有 `compaction_execution_bindings`，与
  CompactionJob 第一事务原子写入并通过 InMemory/SQLite Conformance、close/reopen、漂移
  拒绝和事务回滚验证；绑定不含 Runtime Handle、Endpoint、Credential、Token、Prompt 或正文。
  新增 `harness:arh2.1`，开发者与 Claude Code 独立 QA 均完成专项 7 files / 70 tests、
  完整 Workspace 153 files / 1056 tests + 3 smoke、Central online/offline，结论
  `P0～P3=0`；用户已正式接受并关闭 ARH-2.1。公共 Contracts、Kernel、Desktop、Central
  和依赖未修改；生产自动编排尚未接入，ARH-2.2、ARH-2.3 与 ARH-3 继续 `GATED`。
- `0.0.0-arh.1` 完成 ARH-1 Provider Stream Conformance：Core 新增内部 Model stream
  顺序状态机并接入 Agent Loop 唯一消费点，冻结 started/terminal、空白 delta、Tool Call
  identity、usage 单调性和取消后迟到事件不变量；terminal 在上游流自然结束后才交付，
  非法或不完整 Provider 流不能提交 completed Assistant Message。Provider 异常输出使用
  安全 typed failure，同时保留 `model_stream_resume_unavailable` 交由既有 Durable Runtime
  恢复。Central Anthropic-compatible 与 OpenAI-compatible Adapter 补齐空白文本和重复
  Tool identity 等价 Conformance。未修改公共 Contract、Kernel、数据库迁移、Desktop、
  Compaction 或 token accounting。Claude Code 已独立复跑 ARH-1 harness 3 files /
  22 tests、完整 Workspace 151 files / 1041 tests + 3 smoke 及 Central online/offline，
  `P0～P3=0`；用户已接受并正式关闭 ARH-1。ARH-2 已形成 docs-only 自动压缩编排详细
  方案。首轮评审 `P0=0 / P1=0 / P2=2 / P3=1` 后，Revision 1 冻结私有
  `CompactionExecutionBinding` migration、无可压缩前缀时的安全可操作失败语义，以及
  multi-turn user confirmation 原子边界；当前等待修订复核，编码仍 `GATED`；ARH-3 继续
  `GATED`。
- PDT-4 PDF Table Extract Packaging / Hardening / Closeout 已完成自测：
  用户正式接受 PDT-3 独立 QA 并关闭 PDT-3；本批只做 packaging audit、静态扫描和完整
  门禁复跑，不新增功能面、不修改 Tool schema、不进入 OCR/扫描件、XLSX 导出、
  人工校正 UI 或 bulk extraction。当前 DTP-4 packaging audit 已锁定 PDT-3 后的有效
  版本边界（Core/Desktop `0.0.0-pdt.3`、Document Worker `0.0.0-pdt.2`），无 registry
  version drift，因此本批不人为升新 package 版本。PDT-4 closeout 门禁已复跑通过：
  DW/Core/Desktop builds、关键 E2E、DW/Core/Desktop 全量、lint、architecture boundary、
  `audit:dtp4`、offline frozen install 和完整 `pnpm run check`。
- `0.0.0-pdt.3` 完成 PDT-3 PDF Table Extract Desktop Product E2E：
  新增真实 Desktop 链路测试，覆盖用户提交 `Extract tables from tables.pdf` 后经
  Desktop IPC、Core private runtime、AgentBridge、scripted model、Document Worker
  `tool.document.pdf.extract_tables`、Tool Observation 到最终 assistant 文本的闭环；
  assistant 摘要包含 bounded table summary，且不泄漏 workspace real path 或原始
  `"tables"` JSON。Core Artifact projection 补齐 `extract_tables` 分支，将表格结果作为
  `application/pdf` document artifact 投影，metadata 仅保留 page/table/cell/warning
  counts，按需 preview 才渲染 bounded markdown/plain table 文本。本批不做 OCR/扫描件、
  XLSX 导出、人工校正 UI、bulk extraction、PDT-4 packaging/hardening，不修改 Contracts、
  Central、lockfile、根 package 或根 `tsconfig.json`。Core/Desktop 版本升至
  `0.0.0-pdt.3`，Document Worker 保持 `0.0.0-pdt.2`。
- `0.0.0-pdt.2` 完成 PDT-2 PDF Table Extract Core Registry / Agent Exposure：
  `tool.document.pdf.extract_tables` 正式进入 Document Tool registry、默认 Agent catalog
  和 Core backend allowlist，继续绑定 `adapter.tool.document-worker` child-process boundary。
  模型可见 schema 仅暴露 `relativePath` 与 strict `options`（page range、maxTables、
  maxRows、maxCells、maxTextBytes、includeGeometry、minConfidence），不包含
  `workspaceRoot`、limits、absolute path、FileHandle、requestDigest 或 parser authority。
  Core 新增 bounded table Observation preview，不序列化原始 `"tables"` JSON 或完整超大
  cell 文本；Desktop scripted model 只在明确 table intent 时选择表格工具，普通 PDF
  请求继续使用 `extract_text`。本批不做 Desktop 产品 E2E、OCR/扫描件、XLSX 导出、
  人工校正 UI 或 bulk extraction；Contracts、Central、lockfile、根 package 与根
  `tsconfig.json` 不变。Core/Document Worker 版本升至 `0.0.0-pdt.2`，同步
  `audit:dtp4` 版本锁并关闭 PDT-1 的 DW package 未升版 P3。
- PDT-1 PDF Table Extract Document Worker Private Foundation 已实现并自测通过：
  Document Worker 新增私有 `tool.document.pdf.extract_tables` capability、严格 options、
  private-protocol-only Router 限制和 pdf.js text-layer 几何表格提取器；输出包含
  page/table/row/cell、1-based locator、confidence、warnings 和可选 PDF-point bbox。
  no-text-layer PDF 固定 `unsupported_feature + pdf_table_no_text_layer` 失败关闭；
  parser worker `detailCode` 已贯通到 Runtime。新增 3 类 digitally-born PDF baseline
  fixture 与 focused tests，覆盖 simple grid、whitespace-aligned、multi-table、multi-page、
  false-positive 拒绝、预算、corrupt/encrypted 和 real parser worker transfer/cleanup。
  本批不注册 Core Tool，不修改 Contracts/Desktop/Central，不新增依赖、不修改 lockfile、
  根 package 或根 `tsconfig.json`；PDT-2 Core Registry / Agent exposure 继续 `GATED`。
- PDT-0 PDF Table Extract 完成 docs-only Contract / Security / Algorithm 冻结：
  新增 `docs/development/dtp/PDT-PDF-TABLE-EXTRACT-DEVELOPMENT-PLAN.md`，将
  `tool.document.pdf.extract_tables` 定义为后续只读 Document Tool，但本批不注册 Tool、
  不写生产代码、不新增依赖、不修改 lockfile 或版本。计划冻结 P0 仅支持 digitally-born、
  text-selectable PDF 的文本层几何表格提取；OCR、扫描件、图片表格、跨页自动合并、
  XLSX 导出、人工校正 UI、bulk extraction 继续 `GATED`。PDT-1 Document Worker
  private foundation、PDT-2 Core Registry/Agent exposure、PDT-3 Desktop E2E、
  PDT-4 packaging/hardening 均等待单独授权。Revision 1 已按文档复核意见对齐
  Document Worker 顶层 error code，固定 no-text-layer 为 `unsupported_feature` +
  `pdf_table_no_text_layer` 失败关闭，并补充 PDT-1 private-protocol-only Router 限制。
- APV-3C Artifact Lifecycle Hardening / UX Polish docs-only 关闭：
  新增 `docs/development/apv/APV-3C-HARDENING-UX-POLISH-DEVELOPMENT-PLAN.md`，
  将 APV-3C 定义为 Desktop/Application hardening 批次，不是 Tool，不注册
  `artifact.*` 或 `tool.artifact.*`，不调用 Document Worker。计划冻结 lifecycle
  状态矩阵（available/dismissed/deleted/sourceDeleted/missing/blocked/unsupported）、
  安全 UX copy、authority 边界、允许修改范围和 QA 矩阵；bulk registration、drag/drop
  path ingestion、overwrite extension / bulk overwrite、OS Sandbox、formal installer
  继续 `GATED`。本批为 docs-only，不升级版本，不修改生产代码、Contracts、lockfile、
  根 package 或根 `tsconfig.json`。独立复核结论为计划质量 PASS，但无 P0-P3
  生产编码驱动，故 APV-3C docs-only `PASS/CLOSED`。
- `0.0.0-mar.1b` 完成 MAR-1B Bounded Workspace-file Preview：Core global
  catalog 将手动登记的 `.txt`、`.md`、`.markdown`、`.html`、`.htm` artifact
  标记为 preview available，其它已登记文件继续 `unsupported`。Desktop Main 在既有
  task-scoped Artifact preview 未命中时，仅对无 `taskId` 的 manual `workspace_file`
  进行 fallback：通过 Core 私有 file source authority 解析 `artifactId`，执行
  safe relativePath、realpath containment、lstat/stat identity、symlink/非普通文件/
  hardlink/超限/扩展失败关闭，并以有界稳定读取返回 text/markdown preview。HTML 文件
  不把原文返回 Renderer，直接交给 APV-1C loopback sandbox（127.0.0.1-only +
  deny-by-default CSP）渲染。Renderer/Preload API 不新增路径字段；本批不做 PDF/XLSX/DOCX
  parser preview、不调用 Document Worker、不注册 Tool、不做 bulk registration、drag/drop
  path、overwrite 扩展、OS Sandbox 或 formal installer。Core/Desktop 版本升至
  `0.0.0-mar.1b`，Contracts、Document Worker、Central、lockfile、根版本和根
  `tsconfig.json` 不变。
- `0.0.0-mar.1a` 完成 MAR-1A Desktop Manual Artifact Registration：
  Desktop Main 新增 Main-owned file picker、active read_write WorkspaceGrant 私有 authority
  解析、realpath containment、lstat/stat/fstat 身份校验、symlink/非普通文件/hardlink/超限/
  越界/不支持扩展失败关闭，以及 64 KiB buffer streaming SHA-256；Renderer/Preload/Shared
  仅暴露 pathless `register_workspace_artifact` 与 `list_artifacts`，不接触 rootRealPath、
  workspaceRoot、fileSha256、limits 或 selectionHandle。Core private HTTP 增加 Main-only
  authority 与 registration route，复用 MAR-1.0 durable registration，不伪造 taskId；
  APV open/export/source delete 可通过 Core 私有 authority 解析 manual Artifact 文件源。
  Desktop Artifact Panel 接入 global workspace-file catalog 并保持 metadata-only；本批不做
  MAR-1B preview/parser、Document Worker 调用、Tool Registry、bulk registration、drag/drop
  path、overwrite、OS Sandbox 或 formal installer。Core/Desktop 版本升至 `0.0.0-mar.1a`，
  Contracts、Document Worker、Central、lockfile、根版本和根 `tsconfig.json` 不变。
- `0.0.0-mar.1.0` 完成 MAR-1.0 Manual Artifact Registration Contract / Core
  Foundation：Desktop Local `v1alpha1` 加法新增 global Artifact catalog projection、
  pathless `register_workspace_artifact` command/receipt 和 `list_artifacts` query；
  manual Artifact 使用 `sourceKind=workspace_file`，不要求 `originTaskId`，并禁止
  sessionId、workspaceRoot、workbook、schemaVersion 等敏感或私有字段泄漏。Core 新增
  `manual_artifact_registrations` 持久化表、receipt replay/idempotency、同路径同
  sourceDigest 幂等、同路径不同 sourceDigest conflict、metadata-only projection 和
  lifecycle overlay 支持；sourceDigest 采用内容/文件事实，不包含 mtime，mtime 仅留作后续
  展示元数据候选。本批不做 Desktop UI/picker、Document Worker parser、Tool Registry、
  model-visible artifact tool、file preview、bulk registration、drag/drop path、overwrite、
  OS Sandbox 或 formal installer；Desktop、Document Worker、Central、lockfile、根版本和根
  `tsconfig.json` 不变。Contracts/Core 版本升至 `0.0.0-mar.1.0`。
- MAR-0 Manual Artifact Registration 完成 docs-only Contract / Security / UX 冻结：
  新增 `docs/development/apv/MAR-MANUAL-ARTIFACT-REGISTRATION-DEVELOPMENT-PLAN.md`。
  计划将 manual registration 定义为 Desktop/Application 能力，不是 Tool，不注册
  model-visible `artifact.*` capability。P0 仅允许用户在现有 WorkspaceGrant 内手动登记一个
  既有普通文件为 metadata-only Artifact：Renderer 不传路径，Desktop Main 拥有 native file
  picker 与 realpath/lstat/stat/digest 守卫，Core 拥有 WorkspaceGrant、durable registration、
  idempotency 和 projection。文件内容预览、Document Worker parser 调用、bulk registration、
  drag/drop path ingestion、overwrite、OS Sandbox、formal installer、CGF 变更继续 `GATED`。
  本批仅修改文档，不改生产代码、Contract、依赖、lockfile、根 package 版本或根
  `tsconfig.json`；MAR-1.0/MAR-1A/MAR-1B 等待单独评审与编码授权。
- `0.0.0-dwo.3` 完成 DWO-3 XLSX Overwrite Desktop Confirmation / Product E2E：
  Desktop scripted model 仅在明确 overwrite/replace/覆盖/替换意图时发送
  `mode=overwrite_existing`，普通 create 写入保持既有 payload；Task Detail confirmation
  projection 输出破坏性风险、相对目标和 no-undo 后果文案，不泄漏 workspaceRoot、workbook、
  confirmedOldSha256 或私有 requestDigest。Desktop private runtime 将确认决策接入 durable
  ToolCallBatch 恢复，确认后先恢复 pending tool-call，再恢复 normal Agent loop；第一次请求确认时
  捕获的旧文件 SHA-256 和 overwrite requestDigest 存入进程私有、task/toolCall/action 绑定的
  material cache，dispatch 使用首次确认材料，target drift 失败关闭且不覆盖漂移文件。新增 focused
  product E2E 覆盖确认后真实 overwrite 和 post-confirmation drift conflict。未修改 Contracts、
  Document Worker 生产代码、Central、lockfile、根 package 版本或根 `tsconfig.json`；bulk overwrite、
  manual registration、OS Sandbox、formal installer 和 APV-3C 继续 `GATED`。Core/Desktop 版本升至
  `0.0.0-dwo.3`。独立 QA 与用户验收后，DWO 系列（DWO-0 → DWO-3）整体
  `PASS/CLOSED`，Document Tool 全栈（DTP + DWE + APV + DWO）完成。
- `0.0.0-dwo.2` 完成 DWO-2 XLSX Overwrite Core Authorization / Confirmation Integration：
  `tool.document.xlsx.write` 正式 Registry schema 增加模型可见 `mode=create_new|overwrite_existing`
  字段并 bump Document Tool risk source revision；write capability 静态声明 routine/destructive 两类
  风险，Core 执行时按本次 mode 选择动态 risk facts。默认 `create_new` 继续使用 WorkspaceGrant
  `create` + `routine_file`，不触发确认；`overwrite_existing` 使用 WorkspaceGrant `modify` +
  `destructive_file`，确认前 Core 读取既有目标 SHA-256 并把 `workspaceGrantId`、旧 digest、新
  requestDigest、mode、Action 与 idempotencyKey 绑定进私有 action payload 的 single-action
  scope。确认前不派发 Document Worker；确认通过后 hydration 才注入 `workspaceRoot` 并向
  Document Worker v1alpha2 私有协议发送 overwrite payload。未修改公共 Contracts、Desktop、
  Central、Document Worker、lockfile、根 package 版本或根 `tsconfig.json`；DWO-3、bulk overwrite、
  manual registration、OS Sandbox 和 formal installer 继续 `GATED`。Core 版本升至
  `0.0.0-dwo.2`。
- `0.0.0-dwo.1` 完成 DWO-1 XLSX Overwrite Worker / Private Protocol Foundation：
  Document Worker 私有 `tool.document.xlsx.write` writer 增加 `overwrite_existing` 基础分支，
  默认 `create_new` 和既有 DWE request digest 保持兼容；overwrite 必须带私有
  `overwrite.confirmedOldSha256`，缺失返回 `unsupported_feature` +
  `overwrite_requires_confirmation`，不写文件。实现 Option A advisory lock + digest/CAS
  best-effort：同目录 lock、target 身份和 `nlink=1` 校验、旧 digest 预检、生成完整 temp、
  发布前 re-stat/re-hash、atomic `rename`、parent fsync best effort、readback binary/logical
  digest 校验与 temp/lock 清理。Router 要求 write 仅走 Document Worker private protocol；
  public protocol 调用失败关闭。本批不接 Core Registry、默认 Agent、Desktop、confirmation UI、
  recovery classification、bulk overwrite、manual registration、OS Sandbox 或 formal installer；
  不修改 Contracts、Core、Desktop、Central、lockfile、根 package 版本或根 `tsconfig.json`。
  Document Worker 版本升至 `0.0.0-dwo.1`，DWO-2/DWO-3 继续 `GATED`。
- DWO-0 XLSX Overwrite 完成独立 Contract / Security / CAS 计划冻结并 `PASS/CLOSED`：新增
  `docs/development/dwe/DWO-XLSX-OVERWRITE-DEVELOPMENT-PLAN.md`。计划将覆盖已有
  `.xlsx` 从 DWE create-only 基线中拆出，冻结 P0 仅允许单文件 overwrite existing，
  需要 `modify` access、`destructive_file` risk fact、exact single Action user
  confirmation、旧文件 digest 和新 logical workbook digest 绑定。DWO-0 接受 Option A
  advisory lock + digest/CAS best-effort 作为 DWO-1 基线，平台特定 atomic
  compare-and-replace helper 留作后续 hardening；DWO-2 必须显式处理 `mode`
  schema/registry revision bump，确认摘要必须说明 overwrite 不保证 RoboThree 内置 undo。
  本批仅修改文档，不改生产代码、Contracts、依赖、lockfile、根 package 版本或根
  `tsconfig.json`；DWO-1 `READY_FOR_SEPARATE_AUTHORIZATION`，DWO-2/DWO-3 继续
  `GATED`。
- `0.0.0-apv.3b` 完成 APV-3B Source File Delete to OS Trash：Desktop Local
  `v1alpha1` 加法新增 `delete_artifact_source_file` 命令、source deletion receipt、
  lifecycle `sourceDeleted/sourceDeletedAt/sourceDeletionMode` 和对应 typed error。Renderer
  只提交 `artifactId`、`expectedArtifactRevision` 与显式确认文本 `DELETE <displayName>`，
  不传路径、workspaceRoot、rootRealPath、workbook 或 sessionId；Core 私有 prepare 从 durable
  artifact fact + active WorkspaceGrant 解析 authority，Main 侧执行 realpath/lstat/stat 守卫后仅调用
  `shell.trashItem`，平台不支持、symlink/hardlink、postcondition 不确定均失败关闭且不 commit。
  Trash 后 Core commit 将 artifact lifecycle 标记为 deleted/sourceDeleted，禁止 restore 源文件删除记录。
  本批不做 APV-3C、manual artifact registration、overwrite/bulk overwrite、OS Sandbox、
  formal installer、Document Worker 或 Central 变更，不新增依赖，不修改 lockfile、根 package
  版本或根 `tsconfig.json`。Contracts/Core/Desktop 版本升至 `0.0.0-apv.3b`。
- `0.0.0-apv.3a` 完成 APV-3A Artifact Record Tombstone / Restore：Desktop Local
  `v1alpha1` 加法新增 artifact lifecycle `revision/deleted/deletedAt/restoredAt/
  deletionReasonSummary`，并新增 `delete_artifact_record`、`restore_artifact_record`
  record-only 命令。Core 使用 artifactId + expected revision + commandId/digest
  持久化 lifecycle overlay，先做 replay 再做 revision 校验；删除记录后 preview、HTML
  preview、open location、export 与 pin/dismiss 全部失败关闭或在 Renderer 禁用，restore
  只清除记录 tombstone，不触碰源文件。Desktop Renderer 默认隐藏已移除 artifact，可切换查看
  并恢复；Preload/Main IPC 只传 artifactId、expectedArtifactRevision 和 reasonSummary，
  不接收路径、workspaceRoot、rootRealPath、workbook、HTML 或 sessionId。本批不实现源文件
  删除、OS Trash、manual artifact registration、overwrite、OS Sandbox、formal installer 或
  model-visible Artifact Tool，不修改 Document Worker、Central、lockfile、根 package 版本或根
  `tsconfig.json`。APV-3.0 计划评审关闭；APV-3B 后续由 `0.0.0-apv.3b`
  实现并关闭，APV-3C 继续 `GATED`。Contracts/Core/Desktop 版本升至
  `0.0.0-apv.3a`。
- APV-3.0 Source Delete / Deletion Record 进入计划草案：新增
  `docs/development/apv/APV-SOURCE-DELETE-DEVELOPMENT-PLAN.md`，将 Artifact record
  deletion 与 source file deletion 拆成独立阶段。APV-3A 计划只做 Desktop artifact
  记录 tombstone/restore，不触碰源文件；APV-3B 才单独评审源文件删除，P0 倾向
  Desktop Main-only OS Trash/Recycle Bin，平台不支持时失败关闭，禁止直接永久 `unlink`。
  本批仅更新文档和状态，不新增删除 IPC/Contract/Tool，不修改生产代码、依赖、lockfile、
  根配置、Document Worker 或 Central。
- `0.0.0-apv.2` 完成 APV-2 Artifact File Lifecycle Extension：Desktop Local
  `v1alpha1` 加法新增 artifact lifecycle projection、`set_artifact_lifecycle`、
  `open_artifact_location`、`export_artifact` 命令和对应 receipt。Renderer/Preload 只提交
  `artifactId` 与生命周期状态位，不传 `workspaceRoot`、`rootRealPath`、`relativePath`、目标路径、
  workbook 或文件内容；Core 从 durable Task Artifact fact 与 active WorkspaceGrant 私有解析文件源；
  Desktop Main 对源文件执行 `realpath` containment 后才调用 `shell.showItemInFolder`，导出采用同目录
  temp copy/fsync/close + `fs.link(temp, target)` no-clobber 发布，目标已存在失败关闭且不覆盖。
  本批只实现 pin/unpin、dismiss/restore、open location、export copy；不删除源文件，不实现 manual
  artifact registration、workspace file preview、overwrite、OS Sandbox、formal installer，不注册
  `artifact.preview` Tool，不修改 Document Worker、Central、lockfile、根 package 版本或根
  `tsconfig.json`。Contracts/Core/Desktop 版本升至 `0.0.0-apv.2`。
- `0.0.0-apv.1c` 完成 APV-1C HTML Preview Sandbox：Desktop Local `v1alpha1`
  加法新增 `ArtifactHtmlPreviewQuery`、`CloseArtifactPreviewCommand`、
  `ArtifactHtmlPreviewProjection` 和 close receipt。Renderer 仍只提交 `artifactId`、
  `maxBytes`、可选 `ttlMs` 和标准 metadata，不传 HTML、路径、workspaceRoot、sessionId、
  schemaVersion 或 workbook；Main 复用既有 Core bounded `artifact_preview` markdown
  projection 生成本地 HTML 文档，再由 Main-private `HtmlPreviewSandbox` 在
  `127.0.0.1` 随机端口服务单一 token URL。Sandbox 固定 deny-by-default CSP、`script-src
  'none'`、`connect-src 'none'`、`img-src 'none'`、`object-src 'none'`、`frame-ancestors
  'none'`、`style-src 'none'`，校验 Host、精确路径、token、realpath containment、
  dotfile/null/traversal、method 和 HTML byte budget；TTL、显式 close、task/session 切换、
  Renderer unmount、窗口关闭和 app quit 均收口 server/timer/temp dir。Renderer 只用
  sandboxed iframe（空 sandbox + no-referrer），Main 禁止 popup、download 和 permission
  prompt。本批不注册 `artifact.preview` Tool，不实现 APV-2 文件打开/生命周期动作，不修改
  Document Worker、Central、lockfile、根 package 版本或根 `tsconfig.json`。Contracts/Core/
  Desktop 版本升至 `0.0.0-apv.1c`。
- `0.0.0-apv.1b` 完成 APV-1B Markdown/Text Preview：Desktop Local `v1alpha1`
  加法新增 `ArtifactPreviewQuery` 与 `ArtifactTextPreviewProjection`，Core 从 durable
  successful Document Tool Observation 生成有界 Text/Markdown 预览，不读取 workspace 文件、
  不启动 parser/worker、不新增网络或 shell 能力。Desktop private HTTP、Main IPC 与 Preload
  新增 `previewArtifact`，Renderer Artifact Panel 增加 Text/Markdown 预览按钮和只读预览区；
  Markdown 被降级为受限 text block，raw HTML 会转义，Markdown 链接/图片 URL 与危险 URL/event
  token 会剥离，渲染全程使用 Vue text node，不使用 `innerHTML`、iframe、webview、preview server、
  文件打开、导航或外部 fetch。本批不注册 `artifact.preview` Tool，不修改 Document Worker、
  Central、lockfile、根 package 版本或根 `tsconfig.json`，APV-1C/APV-2/overwrite/OS Sandbox/
  formal installer 继续 `GATED`。Contracts/Core/Desktop 版本升至 `0.0.0-apv.1b`。
- 产品文档增补任务列表与删除基线：`PRD-ROBOTHREE-MVP.md` 明确用户侧任务与会话
  一一对应，新增本机持久置顶、置顶/普通双组排序、取消置顶、运行中及结果不确定任务
  禁删、单会话记录与消息不可恢复物理删除、成果和实际文件独立保留、最小删除审计及
  可测试验收；`FRONTEND-EXPERIENCE-SPEC-v1.0.md` 同步置顶操作、禁用原因、永久删除
  二次确认、状态/revision 冲突、失败反馈和“原任务已删除”成果来源体验。前端允许先做
  Mock，但现有 tombstone 或仅隐藏入口不等于完成物理删除；真实置顶、删除和 Artifact
  独立索引仍需 Task/Session/Artifact Feature Spec、Contract/IPC/持久化和迁移评审。
- `0.0.0-apv.1a` 完成 APV-1A Desktop Artifact Panel（metadata-only）：
  `TaskDetailProjection` 最小加法新增 bounded `artifacts` 数组，Core `loadTaskDetail`
  复用 APV-1.0 durable Artifact projection 并去除内部 `schemaVersion/sessionId` 后投影给
  Desktop；Renderer 新增只读 Artifact metadata panel 与纯展示 helper，仅显示 displayName、
  safe relativePath、kind/state、mediaType、byteSize、createdAt 和 bounded metadata 摘要。
  本批不新增 IPC route、不注册 `artifact.preview`、不打开文件、不读取预览内容、不实现
  Markdown/Text 或 HTML sandbox，不修改 Document Worker、Central、lockfile 或根
  `tsconfig.json`。Contracts/Core/Desktop 版本升至 `0.0.0-apv.1a`，`audit:dtp4`
  同步版本漂移检查。APV-1.0 已由用户正式关闭；APV-1A 已由独立 QA 通过并由用户正式关闭；
  APV-1B/1C/APV-2 继续
  `GATED`。
- `0.0.0-apv.1.0` 完成 APV-1.0 Artifact Projection Foundation：Core 新增
  Application-private `artifact-preview-projection`，从 durable Task checkpoint 中的成功
  Document Tool Observation 生成 `ArtifactIndexEntry`，并提供未来 conversation card、
  artifact panel、task detail 三类 surface 共用的 `ArtifactSurfaceRef`。`artifactId` 由
  `taskId + sourceKind + sourceId + sourceDigest` 派生，`sessionId` 仅为投影上下文，不参与
  身份；projection 只输出相对路径和有界 metadata，危险 relativePath 进入 `blocked` 且不投影
  被拒路径，非文档 Tool 和失败 Observation 被忽略。本批顺手关闭 APV-0 独立复核的两项 P3：
  明确 `sessionId` 非身份组成，并冻结 APV-1.0 修改公共 Contracts 的硬阻塞判据。APV-1.0
  不新增 IPC route、不修改公共 Contracts、不注册 `artifact.preview`、不实现 Desktop 面板、
  Markdown/HTML 预览、文件打开、overwrite、OS Sandbox 或正式安装包。Core 版本升至
  `0.0.0-apv.1.0`，DTP4 audit 版本期望同步；不新增依赖，不修改 `pnpm-lock.yaml` 或根
  `tsconfig.json`。Codex 5.6 自测通过 build、APV focused 2 files / 11 tests、Core 全量
  77 files / 571 tests、Document Worker 22 files / 168 tests、Desktop 19 files / 78 tests、
  lint + Architecture boundary、offline frozen install、`audit:dtp4` 和完整 Workspace
  146 files / 963 tests + 三项 smoke。Claude Code 独立 QA PASS 后用户正式关闭 APV-1.0；
  APV-1B/1C/APV-2 继续 `GATED`。
- APV-0 完成 Artifact Preview Product / Security / Engineering Freeze 文档：
  新增 `docs/development/apv/APV-ARTIFACT-PREVIEW-DEVELOPMENT-PLAN.md`，确认
  Artifact Preview 是 Desktop/Application 能力，不是 `artifact.preview` 或任何
  model-visible Tool；冻结 Application-private artifact index、preview request 和
  preview result schema 草案，明确 WorkspaceGrant + `realpath` 文件权限链、
  Renderer/日志/模型上下文泄漏边界、Markdown sanitizer 边界、HTML local sandbox
  边界、typed error 词汇、APV-1.0/1A/1B/1C/APV-2 分批路线、允许修改范围和 QA
  矩阵。本批只改文档，不修改生产代码、公共 Contracts、Tool Registry、Document Worker、
  Desktop APV UI、依赖、`pnpm-lock.yaml` 或根 `tsconfig.json`。APV-0 当前为
  `IMPLEMENTED / DOCUMENT REVIEW PENDING`；APV-1、overwrite、OS Sandbox 和正式安装包
  继续 `GATED`。
- `0.0.0-dwe.3` 完成 DWE-3 XLSX Write Desktop Productization / E2E Closure：
  Desktop scripted model 现在能在明确 create/write/new/save 语义下发起
  `tool.document.xlsx.write` model-visible Tool Call，并继续保证参数不包含
  `workspaceRoot` 或 `limits`。新增真实 Desktop IPC → Core private runtime →
  ToolExecutionAgentBridge → Document Worker → XLSX 文件创建 → Tool Result →
  Assistant final 文本的 E2E，覆盖父目录已存在的新文件创建、SheetJS readback smoke、
  公式样字符串纯文本、Task/Tool Activity convergence、Core close/reopen 后完成态恢复、
  `target_exists` typed failure 不修改原文件，以及 DOCX read Desktop 真实回归。
  Claude Code 独立 QA 已复跑完整门禁并给出 `PASS（P0=0 / P1=0 / P2=0 / P3=0）`；
  用户已正式接受并关闭 DWE-3，DWE 系列（DWE-0 → DWE-3）整体 `PASS/CLOSED`。
  DWE-3 不实现 Artifact Preview、overwrite、动态 Risk Inspector 或新的 parser 能力。
- `0.0.0-dwe.2` 完成 DWE-2 XLSX Write Core Registration / Effect Integration：
  Core 正式注册 `tool.document.xlsx.write` 的 definition、binding、model-visible input schema
  和 output schema；`readOnlyHint=false`，风险事实保持 `routine_file`，不新增公共
  Contracts、不新增依赖、不修改 lockfile 或根 `tsconfig.json`。Document Worker descriptor
  升级为私有协议 `v1alpha2`，三项 read tool 继续兼容；Core 后端对 write 请求计算
  `requestDigest`、使用 `idempotencyKey` 绑定逻辑 workbook digest，并将 typed Worker
  `detailCode` 映射到 `RuntimeError.details.detailCode`。Desktop private runtime 的 Document
  Tool effect 持久化 payload 不再保存 `workspaceRoot`，执行前通过已锁定 WorkspaceGrant
  hydrate 私有 Worker payload；write 授权上下文使用 `create` operation，目标已存在返回
  typed `target_exists` 且不派发 Worker 请求。Observation/assistant preview 只包含相对路径、
  digest、大小和计数摘要，不包含绝对 workspace root 或 workbook 正文。Claude Code 独立
  QA 已复跑完整门禁并给出 `PASS（P0=0 / P1=0）`；用户已正式接受并关闭 DWE-2。
  DWE-3、APV-0、APV-1 继续 `GATED`。
- `0.0.0-dwe.1` 完成 DWE-1 XLSX Write Worker-private Implementation：在
  `@robothree/document-worker` 内新增私有 `tool.document.xlsx.write` writer，
  仅支持在 Workspace 内创建新的 `.xlsx` 文件，不覆盖、不修改、不删除已有文件，不创建缺失父目录，
  且不进入正式 Tool Registry、默认 Agent、Core Effect/Observation、Desktop UI 或 Artifact Preview。
  Document Worker 协议新增私有 `v1alpha2` 解析支持，冻结 `idempotencyKey`、
  `requestDigest` 与 typed `detailCode`；公开 ready/result/error 仍保持 `v1alpha1`，
  确保 DTP 三个只读工具和现有 Core adapter 兼容。XLSX writer 使用既有 SheetJS
  `xlsx@0.20.3` 生成并 readback 校验 logical workbook digest，采用同目录 exclusive temp
  → write/fsync/close → `fs.link(temp, target)` no-clobber 发布 → parent fsync → verify
  → unlink temp 的发布流程；link 不可用、并发目标出现、路径越界、目标存在、预算超限和 digest
  不匹配均失败关闭为 typed detailCode。本批不新增依赖，不修改公共 Contracts、Core、
  Desktop、Central、`pnpm-lock.yaml` 或根 `tsconfig.json`。Codex 5.6 自测通过
  Document Worker build/typecheck、XLSX write focused 9 tests、Document Worker
  22 files / 168 tests、Core document-worker backend 9 tests、lint + Architecture boundary、
  offline frozen install、`audit:dtp4` 和完整 Workspace 144 files / 950 tests + 3 smoke。
  Claude Code 独立 QA 已复跑 DW build、xlsx-write 专项 9/9、DW 全量 22 files / 168 tests、
  Core document-worker 回归 5 files / 29 tests、lint、offline frozen install 和完整
  `pnpm run check` 144 files / 950 tests + 3 smoke，代码质量结论 `PASS（P0=0 / P1(code)=0）`；
  本次治理收口补齐 DEVELOPMENT-LOG、CHANGELOG、DWE 计划状态和 Document Worker 版本。
  DWE-2、DWE-3、APV-0、APV-1 继续 `GATED`。
- 产品文档将 `FRONTEND-EXPERIENCE-SPEC-v1.0.md` 从 `REVIEW DRAFT` 定稿为
  `FINAL / FRONTEND EXPERIENCE BASELINE`：统一 P0 基础状态与条件状态的适用性和
  `N/A` 验收口径，明确开发测试阶段“部门”来自测试身份的简化部门信息及分类可重叠规则，
  增加企业中性视觉与统一组件基线、WCAG 2.2 AA 对比度目标、Desktop 1180 × 760 默认/
  900 × 600 最小窗口和 Admin 1024 × 720 验收视口，并按 P0、P0 Conditional、
  P1/Prototype 修正 Admin 页面类型和操作验收；不修改代码、Contract、IPC、开发版本或
  已接受的 ADR，模块真实链路仍由对应 Feature Spec 和既有门槛控制。
- 产品文档将 `PRD-ROBOTHREE-MVP.md` 从页面范围评审稿整理为 v1.6 前端开发基线：
  保留用户确认的中文信息架构和功能方向，补齐 P0/P1、角色权限、状态与异常、
  智能授权边界、AI/Tool/Knowledge 编排要求、前端 Living Spec 规则、系统依赖、
  非功能要求和可测试验收。前端可使用 Mock 数据和现有 Projection/API 立即迭代；
  Model Experience、Workspace/授权、Task/Artifact、Agent/Skill 发布、Knowledge、
  Personal Memory、Feedback 和 Enterprise Identity 接真实链路前仍需专项 Feature Spec，
  本次定稿进一步明确“部门”在开发测试阶段来自测试身份的简化部门信息，恢复
  Text/Markdown、PDF、DOCX、XLSX、图片和 PPTX 的文件能力矩阵，并将 Skill 使用次数
  降为 P1/Prototype、P0 无真实统计时隐藏；不修改代码、Contract、IPC、开发版本或
  已接受的 ADR。
- `0.0.0-dtp.4` 完成 DTP-4 Document Tool Packaging / Hardening / Operational Closure：
  用户正式关闭 DTP-3B 并授权 DTP-4。`DocumentWorkerToolBackend` 现在对默认 worker entry
  执行 development/packaged resources 候选解析、`realpath` 与 JS module 校验，Document Worker
  子进程使用最小 env，避免继承 `NODE_OPTIONS`；Desktop `CorePrivateSupervisor` 固定 Core child
  `cwd`、`execArgv: []` 与最小 env，并把停止流程收口为 IPC shutdown → SIGTERM → SIGKILL。
  新增无依赖 `audit:dtp4` 门禁，检查版本边界、root `tsconfig.json` 四引用、`@napi-rs/canvas`
  ignore、SheetJS CDN integrity、Document Worker dist 入口/体积、pdfjs/SheetJS 安装体积和
  canvas 实体禁入。本批不修改 Contracts、Central、Document Worker 生产源码、Desktop preload
  或正式 ADR，不新增依赖，不修改 `pnpm-lock.yaml` 或根 `tsconfig.json`。Codex 5.6 自测通过
  build、lint + Architecture boundary、DTP-4 focused 3 files / 17 tests、Document Worker
  21 files / 156 tests、Core tool 回归 5 files / 29 tests、`audit:dtp4`、完整 Workspace
  143 files / 938 tests 与三项 smoke。Claude Code 独立 QA 已复跑 build、DTP-4 focused
  3 files / 17 tests、DW tests 21 files / 156 tests、Core tool 回归 5 files / 29 tests、
  lint + `audit:dtp4`、完整 Workspace 143 files / 938 tests 与三项 smoke，结论
  `P0～P3=0`；开发者本机 offline install 残余问题未复现，Node 24.13 与 Node 22.22 下
  offline frozen install 均 PASS。Claude Code 建议 DTP-4 关闭，并建议 DTP 系列整体关闭；
  用户已正式接受复核验收结论，DTP-4 与 Document Tool Pack（DTP-0 → DTP-4）整体
  `PASS/CLOSED`。后续新增格式、写入能力、OS Sandbox 和正式安装包继续独立 `GATED`。
- `0.0.0-dtp.3b` 完成 DTP-3B Desktop Document Tool Interactive Productization：
  用户正式关闭 DTP-3A 并授权 DTP-3B。normal Desktop runtime 接通真实
  `ToolExecutionAgentBridge` → `ToolExecutionService` → `ToolEffectExecutor` →
  `DocumentWorkerToolBackend` 链路，`dcf2c-demo` 继续隔离在 `tool.echo`。
  新增本地 `DesktopDocumentScriptedModelProvider`，在用户输入包含明确 `.pdf/.xlsx/.docx`
  相对路径时生成受控 Document Tool call，收到 tool result 后生成最终 assistant 文本。
  `DurableAgentLoopStarter` 现在按模型轮次记录独立 `model.generate` step，并在工具调用前
  启动独立 tool step；`ToolExecutionAgentBridge` 支持模型可见 arguments 与 Core 内部执行
  payload 分离，使 workspaceRoot 只在 Core 执行期由 workspace grant 补全，不进入 Desktop
  projection。Conversation projection 对仅含 tool call 的 assistant message 显示
  `Using 1 Tool.`，避免空消息。本批不修改公共 Contracts，不新增 Desktop IPC/preload API，
  不改 Central，不改 Document Worker parser/执行语义，不新增依赖，不修改 `pnpm-lock.yaml`
  或根 `tsconfig.json`。Codex 5.6 自测通过 Core/Desktop/Document Worker build、
  DTP-3B focused 3 files / 4 tests、核心回归 12 files / 66 tests、Document Worker
  21 files / 156 tests、Core tool 回归 6 files / 39 tests、Desktop tests 19 files /
  77 tests、lint + Architecture boundary、offline frozen install、完整 Workspace
  142 files / 933 tests 与三项 smoke。Claude Code 独立 QA 已复跑同一门禁：
  Core/Desktop/DW build 全 PASS、DTP-3B focused 3 files / 4 tests、核心回归
  12 files / 66 tests、DW tests 21 files / 156 tests、Core tool 回归 6 files /
  39 tests、Desktop tests 19 files / 77 tests、lint + offline install、full check
  142 files / 933 tests 与三项 smoke，结论 `P0～P3=0`，建议 DTP-3B 关闭。
  DTP-4 继续 `GATED`。
- `0.0.0-dtp.3a` 完成 DTP-3A Desktop Document Tool Minimal Product Slice：
  用户正式授权关闭 DTP-2B 并授权 DTP-3A。默认 Desktop private runtime 注册 DTP-2A
  正式 Document Tool registry records，默认 `agent.general` 增加
  `tool.document.pdf.extract_text`、`tool.document.xlsx.read`、
  `tool.document.docx.read` 三项 tool references；`dcf2c-demo` 仍只保留 `tool.echo`。
  默认 Desktop scripted model 声明 `supportsToolCalling=true`，RuntimeSelection context
  为三项 Document Tools 提供 healthy/available capability availability。Renderer composer
  识别三项 Document Tools 并显示 ready / need workspace 状态；当前 Agent 含可用
  Document Tools 且未选择工作目录时禁用发送，选择 workspace 后恢复。DTP-3A e2e 锁定
  `listAgents` 可见三项文档工具、SubmitTurn receipt 的
  `runtimeSelectionSummary.allowedTools` 精确包含三项工具，并绑定 `workspaceGrantId`。
  本批不修改公共 Contracts，不新增 Desktop IPC/preload API，不改 Central，不改
  Document Worker parser/执行语义，不新增依赖，不修改 `pnpm-lock.yaml` 或根
  `tsconfig.json`。Codex 5.6 自测通过 Core build、Desktop build、DTP-3A focused
  4 files / 20 tests、Document Worker 21 files / 156 tests、Core tool 回归 5 files /
  37 tests、lint + Architecture boundary、offline frozen install、完整 Workspace
  140 files / 930 tests 与三项 smoke。Claude Code 独立 QA 已复跑 Core/Desktop/DW
  build、DTP-3A focused 4 files / 20 tests、DW tests 21 files / 156 tests、
  Core tool 回归 5 files / 37 tests、lint + offline install、完整 Workspace
  140 files / 930 tests 与三项 smoke，结论 `P0～P3=0`；用户已正式接受并关闭
  DTP-3A。DTP-4 继续 `GATED`。
- `0.0.0-dtp.2b` 完成 DTP-2B Agent / Context / Artifact Semantics：用户继续
  下一步开发，视为接受并关闭 DTP-2A。Core 新增
  `services/core/src/application/document-tool-context.ts`，冻结 Document Tool
  Context candidate 入口：只有 RuntimeSelection 已选中，且 TaskCapabilityLock、
  registry revision、definition/binding/descriptor revision 与 lockDigest 全部精确匹配时，
  PDF/XLSX/DOCX Tool schema 才进入模型请求。`DurableAgentLoopStarter` 构建请求时对
  Document Tool 走该 helper，非 Document Tool 候选保持原逻辑。`ToolExecutionAgentBridge`
  的 Observation→Tool message 出口改为文档专用 bounded preview：Document Tool 成功结果
  只输出 4 KiB 以内摘要、metadata counts、truncated 与 resultDigest，不把完整
  PDF/XLSX/DOCX JSON 原样塞入模型上下文；非文档 `tool.echo` JSON 输出保持不变。
  本批复用既有 `ModelContextArtifact` digest/preview/truncation 机制，不改公共
  Contracts，不接入默认 Agent、Desktop UI、Central 或正式 ADR，不新增依赖，不修改
  `pnpm-lock.yaml` 或根 `tsconfig.json`。Codex 5.6 自测通过 Core build、DTP-2B
  focused/regression 5 files / 42 tests、Document Worker 21 files / 156 tests、
  Core tool 回归 5 files / 37 tests、lint + Architecture boundary、offline frozen
  install、完整 Workspace 140 files / 929 tests 与三项 smoke。Claude Code 独立 QA
  复跑 Core build、DTP-2B focused 5 files / 42 tests、Document Worker build/tests、
  Core tool 回归 5 files / 37 tests、lint、offline install、完整 Workspace 140 files /
  929 tests 与三项 smoke；逐项核查 candidate drift fail-closed、Tool schema 无
  adapter/binding/Credential 泄漏、bounded preview 不含原始 JSON/全文且 ≤4096 bytes、
  无新依赖/lockfile/tsconfig/Contracts/Desktop/Central 变更，结论
  `PASS（P0=0 P1=0 P2=0 P3=0）`，建议 DTP-2B 关闭。DTP-3、DTP-4 继续 `GATED`。
- `0.0.0-dtp.2a` 完成 DTP-2A Formal Document Tool Registry Registration：
  DTP-2.0 已由用户正式接受并关闭；Core 新增
  `services/core/src/registry/document-tool-registry.ts`，冻结三项正式 Document Tool
  definition、binding、共享 child-process adapter descriptor 与 `RegistryBuilder`
  helper。正式 Tool ID 为 `tool.document.pdf.extract_text`、
  `tool.document.xlsx.read`、`tool.document.docx.read`；三项均绑定
  `adapter.tool.document-worker`，协议为 `robothree-document-worker/v1alpha1`，
  `runtimeBoundary=child_process`，`maxConcurrency=1`，`readOnlyHint=true`，
  risk static facts 为 `routine_file`。本批冻结 per-capability input schema
  和 output schema envelope `{ status, result, metadata }`，并细化 PDF page、
  XLSX sheet/row/cell、DOCX block/table/locator 结构；DTP-2.0 integration
  测试改为复用正式 registry material。未接入默认 Agent、Context Assembly、
  Artifact、Desktop UI、Central、Contracts 或正式 ADR；DTP-2B、DTP-3、DTP-4
  继续 `GATED`。Codex 5.6 自测通过 Core build、DTP-2A focused 2 files /
  12 tests、Document Worker 21 files / 156 tests、Core tool 回归 4 files /
  33 tests、lint + Architecture boundary、offline frozen install、完整 Workspace
  139 files / 925 tests 与三项 smoke。Claude Code 独立 QA 复跑 DTP-2A
  focused 2 files / 16 tests、Document Worker build/tests、Core tool 回归、
  lint、offline install、完整 Workspace 139 files / 925 tests 与三项 smoke，
  结论 `PASS（P0=0 P1=0 P2=0 P3=0）`，建议 DTP-2A 关闭。
- `0.0.0-dtp.2.0` 完成 DTP-2.0 Core Document Tool Adapter Foundation：在 Core
  新增 `DocumentWorkerToolBackend`，实现既有 `ToolExecutionBackend` port，复用
  `ToolExecutionService`、`EffectCoordinator`、`RuntimeAdmissionController`、
  `TaskCapabilityLockService` 与 `ToolEffectExecutor`，以固定 child process 方式调用
  独立 `services/document-worker/dist/worker.js`。本批只建立 Core→Document Worker
  执行边界，不注册正式 Tool Registry、不让默认 Agent 可见、不改 Context Assembly、
  Artifact、Desktop、Central、Contracts 或正式 ADR。Adapter 校验 locked adapter descriptor
  的 `runtimeBoundary=child_process`、protocol `robothree-document-worker/v1alpha1`、
  descriptor revision 与 action kind/capability 精确一致；Action payload 仅接受
  `workspaceRoot`、`relativePath`、`options`、`limits`，要求 `deadlineAt` 必填，并将
  Adapter-local `requestId` 绑定 `actionId/effectAttemptId/idempotencyKey/capabilityId`。
  子进程协议沿用 Document Worker NDJSON，frame/stderr 有界、单飞、无 Adapter queue；
  cancel 终止子进程并返回 cancelled Observation，worker typed error 映射为 Core
  `RuntimeError`，crash-after-request 保持 Effect dispatched 以复用现有 recovery。新增
  测试专用 fake Document Worker child 覆盖 protocol mismatch、typed error、hang/cancel、
  direct concurrent execute、crash recovery 与 invalid descriptor/payload/missing deadline；
  真实 child happy path 覆盖 PDF/XLSX/DOCX 三能力。根 `tsconfig.json` 现在注册
  `services/document-worker`，`@robothree/core` 通过 workspace dependency 引用
  `@robothree/document-worker`；`pnpm-lock.yaml` 仅更新 workspace importer。Document Worker
  同步修正 strict option parser 对内部 normalized `null` 的接受，避免 Core→Worker 真实链路
  二次解析失败。Codex 5.6 自测通过 Document Worker/Core build、Core focused 1 file /
  7 tests、Document Worker 21 files / 156 tests、Core tool 回归 3 files / 28 tests、
  lint + Architecture boundary、offline frozen install、完整 Workspace 138 files /
  920 tests 与三项 smoke；Claude Code 独立 QA 复跑六项门禁并给出
  `PASS（P0=0 P1=0 P2=0 P3=0）`，建议 DTP-2.0 关闭。DTP-2A、DTP-2B、
  DTP-3、DTP-4 继续 `GATED`。
- `0.0.0-dtp.1c.1` 完成 DTP-1C.1 DOCX `read` 只读 vertical slice：按 DTP-1C.0
  关闭结论走受控 OOXML parser，复用 DTP-1B central-directory/package preflight 思路，
  未引入生产 DOCX/ZIP/XML parser 依赖。新增 `src/docx/docx-ooxml-preflight.ts`，
  在解析 WordprocessingML 前拒绝非 `.docx`、非 ZIP、truncated/corrupt、
  multi-disk、ZIP64 sentinel、invalid local header offset、zip slip、绝对/UNC/drive/null/
  backslash 路径、duplicate/conflicting entry、encrypted entry、非 store/deflate
  compression、entry/total decompression ratio 超限、macro/ActiveX/OLEObject/embedded
  binary/custom XML/external part、external relationship/URI、macro-enabled content type 与
  缺失 required DOCX part。新增 `src/docx/docx-read.ts` 自有受控 XML tokenizer/mapper，
  只读取 `[Content_Types].xml`、`_rels/.rels`、`word/document.xml`、可选
  `word/styles.xml` 与 `word/_rels/document.xml.rels`，拒绝 DTD/ENTITY、mismatched/unclosed
  XML，并输出 `format=docx`、`heading | paragraph | list_item | table` block、table
  row/cell、`colSpan`、`rowSpan`、`sectionIndex/blockIndex/paragraphIndex/tableIndex/rowIndex/cellIndex`
  locator 与 `metadata.sectionCount`。DOCX parser worker 继续沿用
  `SecuredDocumentSource`、TransferList bytes、`ParserExecutionBoundary`、worker guard、
  Runtime deadline/cancel/terminal 语义；不修改 Core、Contracts、Desktop、Central、正式
  Tool Registry、默认 Agent 或正式 ADR。`mammoth@1.12.0` 保留为 DTP-1C.0
  evaluation-only devDependency 供 Spike 复跑，生产 `src/**` 零导入。新增 DOCX
  production tests 覆盖 heading/paragraph/list/table/merged cells/section locator/no HTML、
  DOCM/macro/external relationship/zip slip/encrypted/corrupt/ratio、block/text/table/output
  budgets 与 5 次真实 parser worker cycle。Document Worker 专项 21 files / 156 tests
  PASS；lint + Architecture boundary PASS；offline frozen install PASS；完整 Workspace
  137 files / 913 tests 与三项 smoke PASS。Claude Code 独立 QA 复跑 DOCX focused
  5/5 PASS、Document Worker 21 files / 156 tests、build、lint、offline install、
  Workspace 137 files / 913 tests 与三项 smoke，`P0～P3=0`；用户已正式接受并关闭
  DTP-1C.1 与 DTP-1 整体。静态扫描生产源码无 `DW_DIAGNOSTIC/_dw*`、
  无 `mammoth/jszip/yauzl/adm-zip/docx/pdfkit/file-type` 生产导入，`@napi-rs/canvas`
  仍无实体，根 `tsconfig.json` 仍为 3 个引用。DTP-2～DTP-4 继续 `GATED`；DTP-1
  整体关闭不自动解锁 DTP-2。
- `0.0.0-dtp.1c.0` 完成 DTP-1C.0 DOCX Parser Decision Spike：按计划只评估
  `mammoth@1.12.0`，不实现 `tool.document.docx.read`。`mammoth` 仅作为
  `@robothree/document-worker` evaluation-only devDependency，生产 `src/**` 不导入
  `mammoth`、`jszip` 或任何 DOCX parser；DOCX capability 继续
  `unsupported_feature`。新增手写 DOCX ZIP fixture 与 Spike harness，证明 Mammoth
  内部 AST 可映射 heading、paragraph、list_item、table/row/cell，能保留中文/Unicode、
  列表顺序、gridSpan/colSpan 与 vMerge/rowSpan，且 Spike mapper 不输出 HTML；同时证明
  Mammoth 公共 API 不提供稳定 structured `readDocument`，必须依赖 undocumented
  `mammoth/lib/*` 内部路径才能避开 HTML，且 `w:sectPr` 在 Mammoth reader 中被忽略，
  AST 无 section/sectPr/raw section property，无法满足 DTP-1C.0 section locator 硬要求。
  退出决策为 `REJECT_MAMMOTH_AND_PROPOSE_CONTROLLED_OOXML_PARSER`。依赖证据：
  `mammoth@1.12.0` BSD-2-Clause、10 个 runtime dependencies、optionalDependencies
  `{}`、package 声明 `prepare` 脚本、unpacked `2.3M` / 117 files、lockfile integrity
  `sha512-cwnK1RIcRdDMi2HRx2EXGYlxqIEh0Oo3bLhorgnsVJi2UkbX1+jKxuBNR9PC5+JaX7EkmJxFPmo6mjLpqShI2w==`。
  Spike preflight 在调用 Mammoth 前拒绝 `.docm`、macro-enabled content type、
  `vbaProject.bin/*.bin`、external relationship/URI、zip slip、encrypted entry、corrupt
  ZIP、缺失 required DOCX part、unsupported compression 和 compression ratio 超限。
  DTP-1C.1 建议路线为受控 OOXML parser：复用/泛化 DTP-1B central-directory preflight，
  只读取白名单 WordprocessingML XML part，由 RoboThree 自有 mapper 产生
  section/paragraph/table/row/cell locator。DTP-1C.1 与 DTP-2～DTP-4 继续 `GATED`。
- `0.0.0-dtp.1b` 完成 DTP-1B XLSX `read` 只读 vertical slice：在
  DTP-1.0 `SecuredDocumentSource` 与 `ParserExecutionBoundary`、DTP-1A PDF
  parser 同一路径上接入 SheetJS CE 官方冻结 tarball
  `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`，生产 Handler 新增
  `tool.document.xlsx.read`，输出 `format/dateSystem/sheets[]/rows[]/cells[]`，
  包含 sheet index/name/visibility、usedRange、rowNumber、cell address/column、
  typed value、公式表达式与 cell locator；公式只返回表达式和缓存值，不执行公式。
  SheetJS 前新增受控 OOXML/ZIP central-directory/package preflight，拒绝
  extension mismatch、非 ZIP、truncated/corrupt、multi-disk/ZIP64 sentinel、
  zip slip、绝对/UNC/drive/null/backslash 路径、重复 entry、encrypted entry、
  非 store/deflate compression、压缩比/总解压预算超限、macro/embedding/ActiveX、
  external relationship/URI 与缺失关键 OOXML part。未新增 ZIP parser 依赖，未
  实现 DOCX、PDF 扩展能力、Core Adapter、正式 Tool Registry 或默认 Agent。
  依赖证据：SheetJS tarball SHA-256
  `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`、SHA-512
  `a0b0eade3c3b01c2ea2961f60210a9553665f267fa5f661178ff8d7a1d12254cd5fc1759623b61f78b46e6da22301d4f3eb62dc4e09f6a850292fb6e1fedc024`、
  lockfile SRI `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`、
  Apache-2.0、dependencies `{}`、optionalDependencies `{}`、无 install/prepare
  生命周期脚本、unpacked `7.8M` / 26 files、offline frozen install PASS。新增
  XLSX fixture 与安全矩阵，覆盖 visible/hidden/veryHidden、usedRange、Unicode、
  control char sanitize、UTC date serial、formula expression、extension mismatch、
  corrupt/truncated、encrypted、zip slip、duplicate entry、active content、ratio、
  sheet/row/cell/output budget、TransferList detached 与 5 次真实 parser worker cycle。
  Document Worker 专项 19 files / 147 tests PASS；lint + Architecture boundary PASS；
  完整 Workspace 在获准 loopback 环境 135 files / 904 tests 与三项 smoke PASS。
  静态扫描生产源码无 `DW_DIAGNOSTIC/_dw*`，无 `mammoth/pdfkit/docx/yauzl/adm-zip/jszip/file-type`
  超前依赖，`@napi-rs/canvas` 仍无实体，根 `tsconfig.json` 仍为 3 个引用。
  Claude Code 独立 QA 复跑 build、19 files / 147 tests、lint、offline install、
  Workspace 135 files / 904 tests 与三项 smoke，`P0～P3=0`；用户已正式接受并关闭
  DTP-1B。DTP-1C.0 DOCX Parser Decision Spike 已获开发授权；DTP-1C.1 与
  DTP-2～DTP-4 继续 `GATED`。
- `0.0.0-dtp.1a` 完成 DTP-1A PDF `extract_text` 只读 vertical slice：在
  DTP-1.0 的 `SecuredDocumentSource` 与 `ParserExecutionBoundary` 上接入唯一真实
  parser 依赖 `pdfjs-dist@6.2.108`，生产 Handler 仅实现
  `tool.document.pdf.extract_text`，输出 `format/pageCount/pages[]/metadata/locators`，
  locator 粒度限定为 `pageNumber`，不提前实现坐标、表格、图片、OCR、XLSX、DOCX 或
  Core Adapter。PDF parser worker 继续只接收 transferable bytes、capability、strict
  options、limits 与 extension，不接收 path、fd、FileHandle、workspace root 或重开
  token；读取阶段 FileHandle 已关闭，cancel/deadline 仍由 Runtime 唯一裁决并通过
  Boundary terminate/join/cleanup 收敛 terminal。PDF 解析设置 `disableAutoFetch`、
  `disableRange`、`disableFontFace`、`isEvalSupported: false`、`useSystemFonts: false`，
  CMap 与 standard fonts 只从本地 `pdfjs-dist` package asset 读取；extension/magic
  mismatch、页数/输出预算、加密、损坏/截断输入失败关闭。依赖窗口更新
  `pnpm-lock.yaml` 与 `pnpm-workspace.yaml`，用 `ignoredOptionalDependencies` 明确忽略
  `@napi-rs/canvas`；干净安装后 Canvas package 不存在且从 `pdfjs-dist` 上下文不可解析。
  依赖证据：`pdfjs-dist@6.2.108` Apache-2.0、scripts `{}`、unpacked `34M`、
  550 files、lockfile integrity `sha512-YxFb+SQcodN2rnX9Tn3dHYlqfb7NjlzzfONPpJd+AKoKtUjEdevTfbC07d5TcczzOK6261auRkP/M8OBHs9vFQ==`、
  `pnpm install --frozen-lockfile --offline` PASS。新增手写 PDF fixture 与测试，覆盖
  单页、多页选择、中文/Unicode、空白页、旋转、恶意字符串、扩展名不匹配、corrupt、
  encrypted、输出/页数预算、TransferList detached、5 次真实 parser worker cycle 与
  静态依赖/Canvas-free 扫描。Document Worker 专项 18 files / 142 tests PASS；
  lint + Architecture boundary PASS；完整 Workspace 在获准 loopback 环境
  134 files / 899 tests 与三项 smoke PASS。Claude Code 独立 QA 复跑相同门禁、
  offline install 与依赖窗口验收，`P0～P3=0`；用户已正式接受并关闭 DTP-1A。
  DTP-1B 已获本轮开发授权；DTP-1C.0、DTP-1C.1 与 DTP-2～DTP-4 继续 `GATED`。
- `0.0.0-dtp.1.0` 完成 DTP-1.0 Parser Execution Foundation：新增
  `SecuredDocumentSource`，固定 `resolveSafePath → stat → open → fstat →
  分块有界读取 → close → parser worker` 的单向所有权，Parser worker 不接收真实
  path、workspace root、fd、FileHandle 或重新打开文件的 token。新增显式
  Capability Router 与 per-capability strict option parser，当前仅白名单
  `tool.document.pdf.extract_text`、`tool.document.xlsx.read` 与
  `tool.document.docx.read`，真实解析仍返回 `unsupported_feature`。新增
  `ParserExecutionBoundary`，作为现有 Runtime active Attempt 下的执行单元生命周期
  管理，不管理 busy、retry、terminal 或 attempt；Runtime 在 cancel/deadline 时
  触发 abort，并等待 handler/boundary terminate、join、cleanup 后唯一产生 terminal。
  Parser bytes 使用独立精确大小 `ArrayBuffer/Uint8Array` 与 TransferList，默认
  worker 设置 `resourceLimits` 与 `execArgv: []`，并增加 parser worker guard，
  对 require 形式的 network/shell/nested-worker、`fetch`、stdout/stderr 写入失败关闭。
  新增 source、router、boundary、guard、安全扫描与 1000 次 parser execution 资源有界
  回归；Document Worker 专项 17 files / 136 tests PASS，完整 Workspace
  133 files / 893 tests 与三项 smoke PASS。未安装真实 Parser、Fixture Builder 或
  ZIP Parser 依赖，`dependencies/devDependencies` 仍为空；未修改 `pnpm-lock.yaml`、
  根 `tsconfig.json`、Core、Contracts、Desktop、Central、正式 Tool Registry 或默认
  Agent。Claude Code 独立 QA 实际复跑 build、17 files / 136 tests、lint、
  Workspace 133 files / 893 tests 与三项 smoke，`P0～P3=0`；用户已正式接受，
  `DTP-1.0` `PASS/CLOSED`。DTP-1A/B/C 和 DTP-2～DTP-4 继续 `GATED`。
- `0.0.0-dtp.0-repair.2` 收口 Document Worker 安全与运行时底座：清理陈旧
  `dist` 后重建，新增 Runtime/Capability Handler 分层，删除生产
  `DW_DIAGNOSTIC` 与 `_dw*` 测试输入面；Worker-private 协议改为必填 top-level
  `deadlineAt` 唯一执行 Deadline，并新增只绑定被拒绝第二请求自身 attempt 的
  `worker_busy` 终态。Path Guard 改为基于 `realpath` 的 canonical containment，
  拒绝 Windows/UNC/absolute/traversal/null byte、外逃 symlink、缺失、不可读和非普通
  文件；magic 探测改为有界 `stat/open/read/close`，OOXML Stub 在 DTP-1 前失败关闭。
  新增确定性 Runtime Harness、真实 symlink/父目录 symlink、有界读取、busy、
  late callback、1000 次同进程顺序请求资源收口、零网络 preload、canary 和静态扫描
  回归。未安装解析依赖，未修改 `pnpm-lock.yaml`、根 `tsconfig.json`、Core、
  Contracts、Desktop、Central 或正式 ADR。Claude Code 独立 QA 实际复跑
  Document Worker 13 files / 117 tests、Workspace 129 files / 874 tests 与三项 smoke，
  `P0～P3=0`；用户已正式接受，`DTP-0-repair.2` 与 DTP-0 `PASS/CLOSED`。
  DTP-1～DTP-4 继续 `GATED`，不因 DTP-0 关闭自动解锁。
- `0.0.0-cgf.2c.1` 完成 Model Admission、Core durable Provider 与 Central
  HTTP/SSE Foundation：新增 Model 专用七类外发确认范围与 provenance 分类，
  按 Task 锁定 Model/Binding/Descriptor 精确解析，不建设智能路由；新增本地
  SQLite migration 14，以 L1 prepared、L2 accepted/progress、L3 Assistant
  Message committed 协调 Core 与 Central 双数据库事实，且不持久化 Prompt、
  输出、Token、URL 或凭证。Core 新增严格 HTTPS/redirect/bounded SSE Client、
  token-once renewal、durable cursor 与 ephemeral sequence 校验，以及同一
  Invocation 的 status-first 恢复；输出连续性丢失进入
  `model_stream_resume_unavailable`，禁止创建第二 Invocation。Central 新增四条
  GET/POST Thin HTTP/SSE 路由、production `user_confirmed` Admission、先订阅后
  执行、bounded buffer、单节点 owner 抑制及跨节点 lease/fencing passive
  subscriber 语义。专项 `harness:cgf2c1` 实际执行 11 个 Node 证据文件 79 tests、
  8 个 Java 证据类和 30 项矩阵映射，泄漏扫描 0；Node 完整门禁 116 files /
  757 tests 与三项 smoke 通过；Central online/offline 各 214 tests、
  Testcontainers/Embedded PostgreSQL 及双 JVM/Relay 恢复矩阵全部通过。
  Claude Code 独立 QA `P0～P3=0` 已由用户正式接受，CGF-2C.1
  `PASS/CLOSED`。CGF-2C.2 等待 Model Experience PRD/UX；CGF-2C.2、
  CGF-2C.3、Enterprise Integration 继续 `GATED`。
- 新增 `CGF-2C.1-DEVELOPMENT-PLAN.md`，把父计划中的 Core Adapter、Admission
  与 Contract 批次细化为可评审实施方案：按 Task 锁定 Descriptor 精确解析
  Model Provider，新增 Model 专用外发 Confirmation 和 provenance 失败关闭，
  规划本地 migration 14 的 Invocation Link 及 L1/L2/L3 双数据库协调，并冻结
  Central Thin HTTP/SSE、user-confirmed Admission、subscriber-before-execute、
  token-once renewal、direct/custom Binding 同路径和输出连续性丢失后的人工处理。
  同时明确 C.1 不修改 Kernel reducer、Central v0007、Enterprise canonical
  Model Schema、CGF-2B Provider Adapter 或 Desktop Renderer，并建立 30 项
  Contract/Core/Central/Headless QA 门槛。该变更只收口文档和评审输入，不修改
  代码、Contract 实现、Schema、依赖、版本或测试基线。Claude Code 首轮评审
  为 `P0=0 / P1=0 / P2=1 / P3=2`；Revision 1 已明确重新订阅时的 owner、
  passive subscriber 与 lease/fencing 关系，增加 SSE disconnect/network jitter
  和 Core SSE 字段级严格消费门槛，并将事件类型校正为 Enterprise Gateway
  canonical `started/text_delta/tool_call` 与 durable lifecycle/`usage_recorded`，
  输出连续性丢失复用 ADR-015 `model_stream_resume_unavailable`。业务场景不作为
  C.2 技术硬门槛，manual-attention UX/责任边界进入 C.2 PRD，运营 SLA 后置。
  该文档批次结束时 CGF-2C.1 为
  `REVISION 1 / DOCUMENT RE-REVIEW PENDING / CODE GATED`，后续实现状态以上方
  `0.0.0-cgf.2c.1` 条目为准；
  C.2/C.3 与 Enterprise Integration 继续 `GATED`。
- `0.0.0-adr17.i3` 完成 ADR17-I3 统一 Conformance 与 Recovery Harness：建立
  ADR-017 §11 的 18 项可执行覆盖清单和单一 `harness:adr17i3` 入口，实际重跑
  Batch Dispatcher、I1 Transaction A/C、Effect Recovery、用户确认、进程外
  Echo 取消、旧 Run 拒绝、Provider Message 完整性与 SQLite close/reopen。
  新增首调用执行中取消场景，验证当前调用保持精确 Effect 关联且后续调用均不
  分发；新增 Transaction A 提交后、第一次 Tool dispatch 前恢复；SQLite 重启
  后并发 recovery 由同一 Batch mailbox 收敛为一个执行 owner。统一 Harness
  10 files / 130 tests、18/18 场景、敏感内容扫描 0，完整门禁 111 files /
  743 tests 与三项 smoke 全部通过。公共 Contracts、Kernel、Desktop、Central、
  SQLite migration 13 和生产 Runtime 均未修改。Claude Code 独立 QA 实际
  重跑统一 Harness 与完整门禁，18/18 场景、泄漏扫描 0、P0～P3=0；用户已
  正式接受，ADR17-I3 与 ADR-017 Implementation Gate 三批全部
  `PASS/CLOSED`。CGF-2C.1～2C.3 与 Enterprise Integration 继续 `GATED`，
  不因 Implementation Gate 关闭而自动解锁。
- `0.0.0-adr17.i2` 完成 ADR17-I2 Agent Loop、取消、确认与恢复：新增应用层
  `ToolCallBatchCoordinator`，以精确 Task/Run/Batch/disposition 替代 Session
  全量 pending 扫描，串行分发同批 Tool Call。等待确认时持久化当前 waiting 与
  后续 blocked，允许后按原 ordinal 继续，拒绝或取消时只收敛尚未分发调用；
  Retry 新 Run 不继承旧 Run 调用。`ToolExecutionService` 在 durable Effect
  `PREPARED` 后、Backend dispatch 前回调精确 `effectAttemptId`，回写失败不调用
  Backend，恢复按 action/Effect 证据重联，不创建第二 Effect。Tool Result 与
  disposition 继续使用 I1 Transaction C 原子提交，进入下一 Model Request 前
  强制 Tool Call/Result 一一匹配。新增 `harness:adr17i2`；专项 7 files / 84
  tests PASS，公共 Contracts、Kernel、Desktop、Central、SQLite migration 13
  和 Effect 状态集合均未修改。Claude Code 独立 QA 7 files / 84 tests、完整
  110 files / 721 tests、P0～P3=0 已由用户接受，ADR17-I2 正式
  `PASS/CLOSED` 并单独授权进入 ADR17-I3。
- `0.0.0-adr17.i1` 完成 ADR17-I1 Batch Contract、Persistence 与原子 intent：
  新增 Core 内部 strict `ToolCallBatchRecord` / `ToolCallDispositionRecord`、
  类型化 Conversation Persistence Port、SQLite migration 13，以及 InMemory /
  SQLite 两套 Adapter。Assistant Message、Batch 和有序初始 disposition 通过
  Transaction A 原子提交；匹配 Tool Result 与 `result_committed` 通过
  Transaction C 原子提交。实现绑定 Assistant/Run/有序 Tool Call digest，
  expected revision/CAS、唯一约束、并发单写、推进后幂等重放和精确
  Effect Attempt 身份；三个命名故障点均验证无半批事实，旧 Conversation
  数据库可前向升级并在 close/reopen 后恢复。新增 `harness:adr17i1`，完整
  Node 门禁 109 files / 711 tests 与三项 smoke 全部通过。公共 Contracts、
  Kernel、Desktop、Central 和 Enterprise Gateway 未修改。Claude Code 独立
  QA 4 files / 52 tests、完整 109 files / 711 tests、P0～P3=0 已由用户接受，
  ADR17-I1 正式 `PASS/CLOSED` 并单独授权进入 ADR17-I2。
- 新增 `ADR-017-IMPLEMENTATION-PLAN.md` 与 `CGF-2C-DEVELOPMENT-PLAN.md`，
  将 CGF-2C 前置实施拆为 ADR17-I1/I2/I3，并冻结 Assistant Message batch、
  初始 Tool Call disposition 原子 intent、Task Effect 独立事务及稳定 ID
  reconciliation。CGF-2C 计划新增 Model 专用
  `task_model_external_scope` 最小 Contract 方向，严格复用 Enterprise Gateway
  七类数据枚举，禁止把 Model 外发伪装成 Tool confirmation；同时明确 Token
  最多续签一次、C.1 不依赖业务 PRD、C.2 只依赖通用 Model Experience
  PRD/UX，以及 Foundation 关闭不代表企业生产就绪。Claude Code 首轮评审的
  2 项 P2/2 项 P3 已吸收；业务场景优先级和企业 CA 不作为 C.2/C.3 Foundation
  硬门槛。两份计划仍为 `PROPOSED / DOCUMENT REVIEW PENDING`，本批不修改
  代码、Contract 实现、Schema、依赖或版本，不解锁 ADR17-I1、CGF-2C 或
  Enterprise Integration。
- `0.0.0-cgf.2b.3.3-repair.1` 完成 Model Gateway Foundation 安全与资源收口：
  统一 Harness 实际重跑 B.3.2 F1～F10、Anthropic/OpenAI 双协议 redirect、
  Content-Type、malformed/oversize/incomplete/reset/complete 矩阵，以及五轮两个
  Central JVM 与进程外 Relay 启停。负向 route 测试发现编码路径可能越过校验并
  触发网络尝试的 P1，repair.1 在请求构造前拒绝 `%` 和反斜杠路径；确定性协议
  错误进入 typed `failed`，不完整或断流继续 `uncertain`。最终 PID/端口、连接、
  lease、subscriber、ephemeral buffer、Relay request 与 child process 全部归零，
  动态 Credential/Prompt/output/header canary 原文、Base64 和 URL encoding 扫描
  命中为 0。公共 Contract、v0007、Controller、Desktop/Core 未修改。Claude
  Code 独立 QA 实际重跑 Central online/offline、Workspace 与完整 closure，
  `P0～P3=0`；用户正式接受后 repair.1、B.3.3、B.3 与 B 已依序
  `PASS/CLOSED`。CGF-2C 与 Enterprise Integration 继续 `GATED`。
- `0.0.0-cgf.2b.3.2` 完成双 JVM Relay Recovery Conformance：新增两个独立
  Central Java 节点、共享 PostgreSQL 16 和独立进程外受控 Relay 的 test-only
  Harness，实际复用正式 `ModelInvocationRuntime`、Provider-backed Backend、
  Anthropic/OpenAI-compatible Adapter 与 JDK HTTP/SSE Transport。F1～F10
  覆盖 dispatch 前后崩溃、首 delta、Provider terminal 提交窗口、lease/fencing、
  cancel/terminal 竞争、durable cursor、ephemeral 不重放，以及 Binding V1/V2
  精确恢复和缺失/漂移失败关闭。每次运行使用唯一 canary，并对进程输出与专项
  结果执行 Credential/Prompt/canary 泄漏扫描。专用 Harness、Central online/offline 各
  195 tests、Workspace 107/685 与三项 smoke 全部通过；公共 Contract、v0007、
  生产 Controller、Desktop/Core 与生产源码均未修改。Claude Code 独立 QA
  实际重跑 F1～F10、Central online/offline 和 Workspace 门禁，结论
  `P0～P3=0`；用户正式接受后 B.3.2 `PASS/CLOSED`。B.3.3、CGF-2C 与
  Enterprise Integration 继续 `GATED`。
- 新增并完成文档复核的 CGF-2B.3.2 双 JVM Relay Recovery 开发计划：计划以两个独立
  Central Java PID、共享 PostgreSQL 16 和进程外受控 Relay 验证 dispatch
  前后崩溃、manual reconciliation、no duplicate POST、lease/fencing、取消
  竞争、durable cursor 及 Binding v1/v2 精确恢复。计划状态为
  首轮技术评审的两项 P3 已吸收：明确 CGF-2A.3 Fake Backend Harness 与本批
  真实 Provider-backed 边界的差异，并固定受控 Relay 为单连接 FIFO、竞争由
  Runtime CAS 收敛；Claude Code 聚焦复核为 `P0～P3=0`。计划状态为
  `PROPOSED / DOCUMENT REVIEW COMPLETE / GATED`；不修改代码、Contract、v0007、
  Desktop 或 Core，也不解锁 B.3.2、B.3.3、CGF-2C 或 Enterprise Integration。
- `0.0.0-cgf.2b.3.1-repair.1` 修复真实 Custom Relay 资源首次实跑发现的两项
  P1：Development Credential Source 现在显式接受受控的 CGF-2B.3
  环境命名空间，同时继续拒绝其他阶段和非受控名称；OpenAI-compatible
  Adapter 将中转站逐帧上报、单调递增且可能重复终值的 usage 收敛为一个
  最终 Usage Event，任何 token 计数回退仍以
  `model_gateway.provider_usage_conflict` 失败关闭。硅基流动公网
  `CUSTOM_RELAY` 真实 Harness 已通过：167 个 text delta、canary 命中、非法
  Credential `failed`、取消 `cancelled`、Deadline `timed_out`、动态泄漏扫描
  为 0。Claude Code 独立 QA 已重跑 Central 191 x2、Workspace 107/685、
  真实公网 Relay 四场景与泄漏扫描，`P0～P3=0`；用户已接受 repair.1，
  repair.1 与 CGF-2B.3.1 Foundation 正式 `PASS/CLOSED`。该结果只形成
  `PUBLIC_CUSTOM_RELAY_CONFORMANCE_PASS`，不替代企业内网 Relay、企业
  CA/代理、CAS/RBAC、企业 Credential/审计或生产 Secret Store 验收；这些
  Conformance 已后移至 `Enterprise Integration` 门槛。B.3.2、B.3.3、
  CGF-2C 继续 `GATED`。
- `0.0.0-cgf.2b.3.1` 完成企业自定义中转站首批 Runtime 接入：既有
  Provider-backed Backend 现在显式接受 `DIRECT_PROVIDER` 与 `CUSTOM_RELAY`，
  Central 内部 Binding 新增精确 `upstreamModelId`，Anthropic/OpenAI-compatible
  Adapter 只在 Wire Request 中使用该上游模型名，RoboThree `modelId`、公共
  Contract、PostgreSQL v0007 与 durable facts 保持不变。新增版本化 Relay
  Test Binding、独立 direct/relay Endpoint Policy、真实 Relay opt-in Harness、
  null/空字符串/纯空白/缺失 `content` 回归及架构护栏。Central online/offline
  各 189 tests、Workspace 107/685 全部通过；真实 Relay 资源缺失时 Harness
  返回 `RESOURCE_GATED` 且零网络调用。真实 Relay 实跑、独立 QA 与用户接受前
  CGF-2B.3.1 不关闭，B.3.2、B.3.3、CGF-2C 继续 `GATED`。
- `0.0.0-cgf.2b.2-repair.2` 修复 repair.1 独立 QA 发现的 OpenAI-compatible
  空白 `content` P1：Adapter 对空字符串和纯空白角色/元数据帧不再构造非法
  `TextDelta`，真实非空文本、Tool fragment、usage 与 terminal 语义保持不变；
  新增空字符串、纯空白及后续真实文本的明确 Conformance 回归。Central
  online/offline 各 182 tests、工作区 107/685 与三项 smoke 全部通过。Claude
  Code 已独立重跑相同门禁和真实 OpenAI-compatible Provider Harness：293
  deltas、非法凭证 `failed`、取消 `cancelled`、Deadline `timed_out`、Key/
  canary 泄漏 0，临时 Key 已删除；P0/P1/P2=0。用户正式接受后 repair.2 与
  CGF-2B.2 均 `PASS/CLOSED`，CGF-2B.3、CGF-2C 继续 `GATED`。
- `0.0.0-cgf.2b.2-repair.1` 完成真实 Anthropic-compatible Provider
  Conformance：将确定性 Provider 响应协议错误收敛为 typed `FAILED`，兼容
  并严格校验 `thinking_delta` / `signature_delta`，但不投影、不持久化
  Provider 私有推理或签名；真实 Harness 使用独立长响应验证取消传播，并把
  `deltaCount`、聚合证据、输出 digest、四场景终态和安全诊断作为唯一可记录
  结果。真实联网执行获得 83 个 text delta，Streaming、非法凭证、取消和
  Deadline 全部通过，Key 与唯一 canary 动态泄漏扫描为 0；临时 Key 文件已
  删除。CGF-2B.2 仍需 repair.1 独立 QA 与用户接受后才能关闭，CGF-2B.3、
  CGF-2C 继续 `GATED`。
- `0.0.0-cgf.2b.2` 完成厂商直连 Runtime Bridge 与真实 Provider Harness
  框架：新增精确 digest 的 synthetic Request Source、Provider-backed
  Execution Backend、严格协议 Adapter Registry、live Ephemeral Publisher
  和 Development Credential Material Source；Runtime 继续作为 durable
  terminal 唯一提交者，Backend 不直接访问 Repository。Anthropic/OpenAI
  两套 B.1 Wire Adapter 已通过同一 Bridge Stub Conformance；text delta
  只实时投递且不复制进 terminal Result，`clear` 和投递失败均不改变 durable
  facts。新增 opt-in `check:cgf2b2:direct-provider`，资源缺失时明确返回
  `RESOURCE_GATED`；真实执行使用 Harness 子进程环境、唯一 canary 与
  deltaCount 证据，不把 Key、Prompt 或输出写入报告。公共 Contract、
  PostgreSQL v0007、Controller、Production Profile 和 Desktop/Core 均未
  修改。Central 在线/离线各 180 tests、工作区 107/685 通过；真实 Provider
  无真实 Provider 独立 QA 已通过且由用户正式接受；真实资源与真实 Harness
  仍待完成，CGF-2B.2 尚未关闭，2B.3、2C 继续 `GATED`。
- 新增并完成首轮评审修订的 CGF-2B.2 厂商直连 Runtime Bridge 与真实
  Provider 验证计划：
  复用 CGF-2A 持久 Invocation/Binding/Recovery 与 CGF-2B.1 双协议安全
  Adapter，规划类型化 Request Source、Provider-backed Execution Backend、
  live ephemeral Streaming Bridge、Development Credential Source 和一条
  `direct_provider` 真实 Conformance。此前在对话中暴露的旧 Key 明确禁止
  继续使用；真实验证必须使用轮换后的新 Development Key、固定 synthetic
  数据和唯一 canary 泄漏扫描。本批只修改计划文档，不修改代码、Contract、
  Schema、依赖或版本。首轮评审提出的 3 项 P2 与 2 项 P3 已全部吸收：
  Runtime 保持 durable terminal 唯一提交者、ephemeral `clear` 明确为
  best-effort、自动化 QA 只通过 Harness 子进程环境提供 Secret、真实 delta
  数量必须显式记录，验证命令更名为 `check:cgf2b2:direct-provider`。
  CGF-2B.2 等待文档复核，2B.2、2B.3、2C 均继续 `GATED`。
- `0.0.0-cgf.2b.1` 完成双协议 Provider Stub 与安全传输 Foundation：
  新增 provider-neutral 瞬态请求、有界流式 Sink、Credential 材料授权
  Transport、严格 allowlist/地址/route/redirect/Header/UTF-8/timeout/cancel
  边界，以及相互独立的 Anthropic-compatible 与 OpenAI-compatible Wire
  Adapter；两协议 Stub 归一为一致的 text、Tool fragment、usage 和 terminal
  Projection。W3C trace 仅通过白名单 Header 传播，Secret char[] 使用后清零，
  Prompt/输出/Key/Endpoint 均不持久化或写日志。公共 Contract、PostgreSQL
  v0007、CGF-2A Runtime/Recovery 和生产 HTTP Surface 不变；未调用真实
  Provider、未读取真实 Key、未接 Desktop 用户正文。Central 在线/离线各
  167 tests 与工作区完整门禁通过；Claude Code 独立 QA 再次完成
  167/0/0/0 x2、工作区 107/685、P0～P3=0，用户正式接受后 CGF-2B.1
  `PASS/CLOSED`。B.2、B.3、CGF-2C 继续 `GATED`。
- CGF-2A.3 独立 QA 在线/离线各 153/0/0/0、工作区 107/685，
  双 JVM Recovery Harness 全矩阵通过且 P0～P3=0；用户正式接受后，
  CGF-2A.3 与 CGF-2A 整体 `PASS/CLOSED`。CGF-2B、CGF-2C 继续
  `GATED`，等待方案确认和用户明确开发授权。
- 用户接受修订后的 OpenWorker 决断并建立 `ACCEPTED` ADR-017：冻结多
  Tool Call no-orphan completion、用户取消与 crash recovery 分流、确认批次
  顺序、已分发调用继续使用 ADR-007，以及 Retry 新 Run 不继承、自动重放或
  自动复用旧 Run Tool Call。CGF-2 Plan 将 ADR-017 实现、Conformance、
  独立 QA 和用户接受设为 CGF-2C.1 前置硬门槛，但不新增 `CGF-2C.0`。
  Desktop Foundation 的 Skill Runtime 同步采用 Summary Catalog + Locked
  Body Materialization，不照搬 `load_skill` Tool；OpenWorker 低风险并行与
  通用 Inbox 延后。新增 AR-050 与 KN-104。本批仅修改文档，版本、代码、
  Contract、Schema 和依赖不变；CGF-2A.2 继续 `GATED`，等待文档复核和用户
  明确授权。Claude Code 随后完成 10 份文档一致性复核，
  `P0/P1/P2/P3=0`；新增 KN-105，文档门槛正式关闭，但 CGF-2A.2 仍须等待
  用户明确授权。
- 用户正式接受 ADR-015 补充修订 A。CGF-2 Plan 已按厂商直连与企业自定义
  中转站同等级 Connection Mode、Protocol Adapter 正交、不可变历史
  `ModelEndpointBinding` revision、类型化 Credential Resolver/Endpoint
  Validator 和禁止静默 failover 的边界修订。CGF-2.0、CGF-2A.1 无需返工；
  Claude Code 对补充对齐计划复核 P0～P3=0。CGF-2A.2～2C 继续 `GATED`，
  等待用户确认修订计划和明确开发授权。
- CGF-2A.1 独立 QA online/offline 各 134/0/0/0、工作区 107/685、
  P0～P3=0 已由用户正式接受，CGF-2A.1 `PASS/CLOSED`。ADR-015 补充修订
  A 随后完成文档评审和用户接受；CGF-2A.2、2A.3、2B、2C 不因本批关闭
  或补充 ADR 接受而自动解锁。
- ADR-015 补充修订 A 的 Claude Code 首轮评审为 P0/P1=0、P2=2、P3=2。
  修订稿固定保留不可变历史 Binding revision，不向 Invocation 物化
  Endpoint/Credential；两条真实链路以不同 Connection Mode、Binding、
  Base URL、Credential 和 canary 验证，不人为要求中转站改写 upstream
  Model ID；同时明确 Admin UI 后置及 capability/timeout Profile 所有权。
  四项经修订版复核后均为 `CLOSED`，CGF-2A.2 仍未解锁。
- Claude Code 对 ADR-015 补充修订 A 的修订版复核为
  `P0/P1/P2/P3=0`，全部四项正式关闭；用户随后正式接受该补充修订，但
  CGF-2A.2 仍不自动解锁。
- 新增 `PROPOSED` 的 ADR-015 补充修订 A，明确 RoboThree 同时保留
  `direct_provider` 厂商直连与 `custom_relay` 企业中转站，两者复用
  Provider-neutral Invocation Runtime 及 Anthropic/OpenAI-compatible
  Adapter；引入 Central 内部、版本化的 `ModelEndpointBinding` 候选边界，
  固定 Credential/Endpoint 安全规则，并明确不建设模型报备、Key 签发、
  聚合路由或运营管理平台。该补充不改变已接受 ADR-015，CGF-2.0 与
  CGF-2A.1 无需返工；CGF-2A.2～2C 仍保持 `GATED`。
- CGF-2.0 独立 QA 124/0/0/0、P0～P3=0 已由用户接受并正式
  `PASS/CLOSED`；用户授权进入 CGF-2A 后，按计划内部门槛仅解锁
  CGF-2A.1。CGF-2A.2 Application Runtime、CGF-2A.3 双 JVM Recovery
  Harness、CGF-2B Provider 与 CGF-2C Desktop 外发继续 `GATED`。
- 按已关闭的 ADR-016 Alignment-2 基线重新对齐 ADR-015 与 CGF-2 Model
  Gateway Foundation 开发计划：Flyway 改为版本化 SQL/manifest/Preflight，
  进程内恢复缓存改为 PostgreSQL Durable Event、opaque cursor、
  recovery lease 与 fencing epoch；增加真实双 JVM Model Invocation 恢复
  Harness，并将 Provider 兼容边界固定为独立 Anthropic-compatible 与
  OpenAI-compatible Adapter。CGF-2B 仅使用 synthetic 非敏感 Prompt 验证
  Central 真实 DeepSeek；真实用户内容必须等 CGF-2C 类型化外发确认后才能
  发送。首轮文档评审 P0/P1=0 后已吸收 6 项 P2 和有效 P3：分离 lease TTL、
  Provider deadline、stream idle 与 recovery query，明确 evidence-based
  uncertain；冻结真实双 JVM 最低场景、SQL next-version 检查、synthetic
  canary 自动泄漏扫描、第二协议真实验证归属，并把 CGF-2A/总工程量调整为
  10～15/25～40 个工程日。业务场景排序和 HTML Fake Provider 不作为 CGF-2
  技术门槛。Claude Code 修订版复核 P0～P3=0 后，ADR-015 已由用户正式
  `ACCEPTED`，CGF-2 Plan 已确认并授权进入 CGF-2.0；CGF-2A～2C 继续
  `GATED`。

### Added

- `0.0.0-cgf.2a.3` 完成 CGF-2A.3 真实双 JVM Model Recovery Harness：
  使用两个独立 Java PID、随机 loopback 端口、独立 Hikari Pool 与共享
  PostgreSQL 16，实际验证跨节点 accept/status/durable SSE reconnect、
  running 后进程退出、数据库时间 lease takeover、旧 fencing epoch 迟到
  提交拒绝、cancel 与 Provider completion 单终态、并发幂等/conflict、
  PostgreSQL pause/unpause、Schema digest 漂移失败关闭及重复启停资源归零。
  Harness、Controller、Backend 和故障注入全部位于 test-only profile；
  生产 Contract、v0007、Model Runtime 和 HTTP Surface 均未修改，真实
  Provider 与 Desktop 用户外发仍未进入。
- `0.0.0-cgf.2a.2` 完成 CGF-2A.2 Model Invocation Application Runtime：
  新增精确版本 `ModelEndpointBinding`、Binding/状态/Credential/Endpoint
  类型化 Port、Development 版本化 Seed 与 Fake Provider；实现 `model.use`
  授权、accept 幂等、dispatch-before-call、Durable Event/Audit Outbox、
  有界 ephemeral delta、cancel/timeout、数据库时间 recovery lease、
  fencing epoch 与 idempotent retry/query-then-retry/manual reconciliation
  三种恢复模式。冻结的 v0007 不改写、不新增 SQL；64 字符
  `dispatch_decision` 保存同时锁定 Binding revision/digest 的 canonical
  SHA-256，URL、Credential 与 HTTP Client 不落库。InMemory、Testcontainers
  PostgreSQL 16 与 Embedded PostgreSQL 16 的 Runtime/Adapter 重建测试通过；
  本批未进入真实 Provider、HTTP/SSE Controller、双 JVM Harness 或 Desktop
  用户内容外发，CGF-2A.3、2B、2C 继续 `GATED`。
- `0.0.0-cgf.2a.1` 完成 CGF-2A.1 Durable Model Invocation
  Persistence Foundation：新增 PostgreSQL `v0007` fresh baseline 与
  `v0006 → v0007` upgrade SQL、manifest/sidecar、forward-only ledger 和
  只读 Schema Preflight；新增 Model Invocation、Durable Event、Recovery
  Lease 与 Audit Outbox Domain/Port，并由 InMemory 和 MyBatis-Plus
  Adapter 共用同一幂等、冲突、revision、event sequence、lease fencing、
  rollback 与并发单写者 Conformance。生产 Mapper 使用显式 SQL，Prompt、
  Model 输出、token delta、Credential 和 Provider endpoint 不进入持久层。
  本批未创建 Application Runtime、Provider Adapter、真实模型调用、双 JVM
  Recovery Harness 或 Desktop 外发链路。
- `0.0.0-cgf.2.0` 完成 CGF-2.0 Contract 与威胁模型：在唯一 canonical
  Enterprise Gateway `v1alpha1` 中 additive 增加 Model Invocation
  accept/status/cancel/SSE、固定 audience/permission、精确 Model revision/
  runtime generation、用户确认与 synthetic admission、公共七状态、
  durable/ephemeral 双通道、canonical digest 和 strict safety limit；新增
  server-owned recovery policy、lease/fencing 内部协调 Schema、合法/非法
  Fixture、状态/幂等/timeout/takeover 语义 Fixture，以及 Anthropic-compatible
  与 OpenAI-compatible 私有 Stub Frame 的同一 provider-neutral 投影。
  TypeScript/Java 使用同一 corpus 做独立 Conformance；新增安全威胁模型与
  Architecture Guard，禁止身份自报、Credential/Provider endpoint、客户端
  lease 控制、Provider 私有 chunk 和完整输出进入公共 Contract。未创建 SQL、
  Persistence、Provider Adapter、真实 DeepSeek 调用或 Desktop 外发链路；
  CGF-2A～2C 继续 `GATED`。
- `0.0.0-cja.2b.3` 完成 Alignment-2B.3 Failure、Recovery 与阶段收口实现：
  在 test-only 双 JVM Harness 中加入 commit 前强制退出回滚、commit 后响应
  丢失幂等收敛、Challenge 消费中断可信结果、跨节点同 revision 不同内容
  conflict、PostgreSQL 暂停/恢复 readiness 收敛、Schema digest 漂移双节点
  失败关闭，以及连接池、线程、端口、子进程和数据库会话资源归零验证。重复
  启停使用全新 JVM 且只依赖 PostgreSQL 与显式测试 Port 恢复；破坏性故障
  控制端点、`Runtime.halt` 和 Docker pause 仅存在于 test source。Central
  online/offline 各 117 tests、工作区 107 files / 678 tests 与全部 smoke
  通过；公共 Contract/Schema/Fixture、V1～V5、生产业务源码未修改，未建立
  Model Invocation lease 或进入 CGF-2。Alignment-2B.2 独立 QA 已由用户
  接受并正式关闭；Alignment-2B.3 独立 QA 117/0/0/0、P0～P3=0 已由用户
  接受，Alignment-2B.3 与 Alignment-2B 整体正式 `PASS/CLOSED`；CGF-2
  继续 `GATED`。
- `0.0.0-cja.2b.2` 完成 Alignment-2B.2 Dual-Node Foundation
  Correctness：新增仅存在于 test source 的双 JVM Harness，以两个真实独立
  Java 进程、随机 loopback 端口、独立 Hikari 连接池和同一个
  Testcontainers PostgreSQL 16 验证无状态集群语义。链路覆盖 Node A
  创建 Challenge、Node B 验证并消费，A/B 并发消费同一 Challenge 仅一个
  成功，跨节点 Token 签发/验证、Configuration 与 exact Package 读取、
  ETag 304 bodyless、Permission revision 幂等/冲突/过期/升级、随机节点
  路由、Bearer/correlation/trace 隔离、A 停止后 B 继续服务，以及 A 新
  JVM 只依赖 PostgreSQL 和测试注入 Port 恢复。共享测试 Token key 运行时
  随机生成并通过环境注入，不进入生产源码、Fixture、报告或日志；子进程失败
  诊断有界且脱敏。Central online/offline 各 113 tests 全通过，工作区
  107 files / 678 tests 与全部 smoke 通过；公共 Contract/Schema/Fixture、
  V1～V5 和生产业务源码未修改，Alignment-2B.3 与 CGF-2 继续 `GATED`。
- `0.0.0-cja.2b.1` 完成 Alignment-2B.1 Production Composition 与
  Fail-Closed：新增版本化 Production Dependency Manifest，按类型白名单验证
  DataSource、Transaction、MyBatis Persistence、Schema、Identity、Device、
  Secret、Token、Compatibility 和 Configuration/Package Repository；缺失、
  歧义或出现 Fake/InMemory/Development Bean 均在 Context ready 前以 typed
  安全错误失败关闭。新增独立 Production Readiness，验证 `SELECT 1`、Schema
  ledger/version/digest/manifest/preflight、Authentication/Configuration
  零结果只读探针、Mapper/Transaction/Port 装配；合法空业务库允许 Ready，
  liveness 与 readiness 分离。Foundation Fixture Controller 仅在 default/
  development Profile 暴露，production Profile 不提供 Fake fallback。
  Source Guard、ApplicationContextRunner、动态 Readiness 和真实 PostgreSQL
  双实现回归已补齐；Central online/offline 各 109 tests 全通过，公共
  Contract/Schema/Fixture 未修改，未进入双 JVM、Model Gateway 或 CGF-2。
  Alignment-2B.2、2B.3 和 CGF-2 继续 `GATED`。
- `0.0.0-cja.2a.3` 完成 Alignment-2A.3 Production Persistence Cutover：
  删除生产 `JdbcAuthenticationPersistence`、
  `JdbcConfigurationPersistence`、旧 JDBC Transaction Runner 和剩余
  Flyway 测试依赖；V1～V5 仅保留在受控 legacy audit 目录，由无 Flyway
  的 Test-only Installer 重建历史。新增正式 Spring/MyBatis 装配，
  DataSource 存在时注册唯一 MyBatis Repository/Transaction Adapter，并在
  Context ready 前执行只读 Schema Preflight；Schema 账本、结构或 digest
  漂移均失败关闭。Central Foundation 测试统一为 Script + MyBatis，
  根级 CGF 架构 Guard 同步改为校验受控 legacy SQL、MyBatis Persistence、
  Thin Controller 的 Bearer Filter/Response Assembler 所有权，不再引用已删除
  的 JDBC/Flyway 文件。
  online/offline 各 96 tests、0 failures、0 errors、0 skipped，
  Testcontainers 与 Embedded PostgreSQL 16 均实际执行。生产源码旧 JDBC /
  Flyway 命中为零，fat jar Flyway/Lombok 为零；根级完整门禁 101 files /
  644 tests 通过；公共 Contract、Schema、Fixture 未修改，Alignment-2B 与
  CGF-2 继续 `GATED`。Claude Code 独立 QA online/offline 各 96 tests、
  P0～P3=0 已由用户接受，Alignment-2A.3 与 Alignment-2A 正式
  `PASS/CLOSED`。
- `0.0.0-cja.2a.2` 完成 Alignment-2A.2：新增 Authentication /
  Configuration MyBatis-Plus 业务 Persistence Adapter、8 个受限 Lombok
  Entity、显式 Domain Converter、PostgreSQL UUID/TEXT[] TypeHandler、
  两组 Mapper/XML 与 `SpringCentralTransactionRunner`。关键锁、幂等、
  revision、consume、`FOR UPDATE` 和 `ON CONFLICT` 保持显式 SQL；新旧
  JDBC/MyBatis Adapter 共用 Persistence、Recovery、Concurrency
  Conformance。真实 PostgreSQL 验证 MyBatis SqlSession 与 Spring
  Transaction 使用同一 JDBC Connection，并完成 32 路 Token issuance、
  20 路 Enrollment replay、close/reopen 与回滚矩阵。MyBatis 仍只存在于
  Persistence Adapter，Entity 无 `@Data`/Setter/`toString`，SQL/参数日志
  关闭；Central online/offline 各 98 tests、0 failures、0 errors、
  0 skipped，Testcontainers 与 Embedded PostgreSQL 16 均实际执行。
  Claude Code 独立 QA 98/0/0/0、P0～P3=0 已由用户接受，Alignment-2A.2
  正式 `PASS/CLOSED`；生产切换与旧实现删除已在 2A.3 完成。
- `0.0.0-cja.2a.1` 完成 Alignment-2A.1：Central 固定接入
  MyBatis-Plus 3.5.16，仅以类型化 Schema Inspection Mapper 用于只读
  Preflight；新增 PostgreSQL version 6 Fresh Baseline、精确 Flyway V5
  Bridge、canonical Manifest + `.sha256` sidecar、Schema Ledger 和受控
  Java Test Installer。V1～V5 保留原文件并通过 byte-by-byte、MD5、
  SHA-256 与 Flyway checksum 冻结；Bridge 保留原 `installed_on` 和业务
  数据，Fresh/Bridge 结构完全等价。生产 `CentralSchemaManager` 和 Flyway
  执行路径已删除，Flyway 仅保留 test scope，MyBatis 显式使用
  `NoLoggingImpl`。Central online/offline 各 90 tests、0 failures、
  0 errors、0 skipped，Testcontainers 与 Embedded PostgreSQL 16 均实际
  执行；Claude Code 独立 QA 14/14 范围覆盖、P0～P3=0 已由用户接受，
  Alignment-2A.1 正式 `PASS/CLOSED`。
- 新增 Central Java Alignment-2A `PROPOSED` 开发计划：将
  MyBatis-Plus Persistence Adapter、版本化 PostgreSQL SQL Script、
  Flyway V1～V5 Bridge、Manifest/Ledger、只读 Schema Preflight 和生产
  持久化切换拆为 2A.1～2A.3 三批；冻结 Fresh Baseline 与 V5 Bridge 两条
  路径、关键显式 SQL、真实 PostgreSQL 迁移矩阵及架构守卫。当前只进入文档
  评审。Claude Code 首轮评审 P0=0/P1=0/P2=8/P3=3 后，计划已全部吸收：
  V1～V5 逐条历史校验、Fresh/Bridge 结构等价、Legacy 时间线、Manifest
  sidecar、SqlSession 同事务 Connection、NoLogging、三重 legacy digest、
  动态 SQL 与 Installer 边界，并将工期调整为 9～13 个工程工作日；当前等待
  Claude 复核的 11 项问题已全部关闭并由用户接受。Alignment-2A.1 与
  Alignment-2A.2 已正式 `PASS/CLOSED`；Alignment-2A.3 已完成实现并等待
  独立 QA；Alignment-2B 与 CGF-2 继续 `GATED`。
- 用户接受 Alignment-1A 独立 QA，`0.0.0-cja.1a` 正式 `PASS/CLOSED`。
  `0.0.0-cja.1b` 完成 Alignment-1B：Central 引入 Spring Boot Actuator、
  Micrometer Tracing、OpenTelemetry Bridge 和默认关闭的可选 OTLP Exporter；
  使用 W3C `traceparent/tracestate`，通过 `X-RoboThree-Trace-Id` 返回当前
  Trace ID，同时保持 strict `v1alpha1` Error Body 和 correlationId 独立。
  新增固定低基数 Application/JDBC Observation、HTTP typed errorCode Tag、
  query/Header/Token/Prompt/Credential/结果/SQL 参数防泄漏 Guard，以及合法/
  非法上下文、48 路并发、Exporter failure、慢 Collector 超时、零默认外连和
  真实 JDBC 事务测试。Central online/offline 各 77 tests、0 failures、0 skipped，Testcontainers
  PostgreSQL 16 与 Embedded PostgreSQL 均实际执行；公共 Contract、Schema、
  V1～V5、Alignment-2 和 CGF-2 未修改。Claude Code 独立 QA 12/12
  覆盖、P0～P3=0 已由用户接受，Alignment-1B 与 Alignment-1 正式
  `PASS/CLOSED`；Alignment-2A/2B 与 CGF-2 继续 `GATED`。
- `0.0.0-cja.1a` 完成 Alignment-1A：Central 有限引入 Lombok 并以
  `lombok.config` 和 Java Source Guard 禁止危险用法，Lombok 显式排除于
  可执行 fat jar；Identity、Token、Configuration 与 Foundation Controller
  将 Envelope 校验、DTO/Command 映射、ETag/304/`no-store` 响应装配移入
  Validator/Mapper/Assembler。企业配置 Bearer 提取迁移到只匹配精确受保护
  路径的有序 Filter，拒绝缺失、错误前缀、空白、过长和多值歧义；统一
  `GlobalExceptionHandler` 保持 strict `v1alpha1` Error Envelope，并对
  unexpected/persistence 错误使用安全摘要。新增 GET/POST-only、Thin
  Controller、Filter order、64 路并发 Bearer/correlationId 隔离与无敏感
  泄漏测试；Central online/offline 各 66 tests、0 failures、0 skipped，
  Testcontainers PostgreSQL 16 与 Embedded PostgreSQL 均实际执行。公共
  Contract、Schema、Flyway、Persistence、Tracing 和 CGF-2 均未修改；
  Alignment-1B、Alignment-2A/2B 与 CGF-2 在该批完成时继续 `GATED`。
- ADR-016 经过 Claude Code 独立文档评审 `PASS`（P0=0、P1=0、P2=1、
  P3=1）并正式 `ACCEPTED`。P2 通过将 Alignment-2 正式拆为 2A
  Persistence 与 2B Stateless Foundation 关闭；P3 明确不为 CGF-2 预建
  Model Invocation/Durable Event 空表。执行顺序冻结为
  `ADR-016 → Alignment-1 → Alignment-2A → Alignment-2B → CGF-2 重新对齐`。
  目标基线
  包括 MyBatis-Plus Persistence Adapter、保留 Flyway V1～V5 历史的版本化
  SQL Script、CAS Identity Adapter、受限 Lombok、GET/POST、全局异常、
  Micrometer/OpenTelemetry、Thin Controller 和 PostgreSQL 双节点无状态恢复；
  真实 CAS Wire Protocol 后置，不阻塞 Alignment 或 Development DeepSeek。
  新增 Alignment-1 `PROPOSED` 开发计划并记录 KN-082；当前未修改 Central
  代码，Alignment-1A/1B、Alignment-2A/2B 与 CGF-2 均保持 `GATED`。
- `0.0.0-dcf.2.3-demo.2` 完成 DCF-2C 桌面工具体验收敛：Tool Activity 面板改为
  卡片化明细（含状态色、目标摘要、风险摘要、时间戳），补充可切换的说明文案；
  错误信息改为按 `DesktopErrorEnvelope.code` 映射中文提示（统一“阻断原因 + 操作建议”语义）；
  首批目标为前端可用性与可解释性，不新增 Tool Capability 范围；是否增加
  `tool.resultSummary / tool.errorCode` 等结果字段已同步提交讨论区（待确认）。
- 用户于 2026-07-28 连续两次完成 DCF-2C 隔离现场演示，确认等待用户确认、
  Desktop/Core 重启恢复、真实 Process Echo、Task/Step/Tool Activity 和最终
  持久消息均正常且无重复。用户现场体验正式 `PASS`，DCF-2C 与 DCF-2
  `PASS/CLOSED`；CGF-2 继续 `GATED`，不因 DCF-2 关闭而自动解锁。
- `0.0.0-dcf.2.3-demo.1` 新增 DCF-2C 隔离用户演示入口：独立 Electron
  userData/SQLite、固定 Demo Agent/Scripted Model、真实进程外 Echo Tool，
  可现场验证等待确认、Desktop/Core 重启恢复、允许后 Tool 完成和最终消息
  去重。正常 Desktop 数据与启动路径不变，公共 Contract、Kernel 与 CGF-2
  不变。完整门禁 99 files / 631 tests、演示与恢复 Harness 5 files /
  19 tests 全部通过；随后用户现场体验已接受。
- 用户正式接受 `0.0.0-dcf.2.3` 独立 QA 技术结论：98 files / 630 tests、
  DCF-2C Harness 4 files / 18 tests、15/15 范围覆盖且 P0～P3=0。用户现场
  体验仍为 `PENDING`，因此 DCF-2C 与 DCF-2 暂不关闭，CGF-2 继续 `GATED`。
- `0.0.0-dcf.2.3` 完成 DCF-2C：新增 SQLite close/reopen 恢复矩阵，覆盖
  running、waiting_input、waiting_user_confirmation、allow/reject、cancel、
  retry 和旧 Run 迟到 Observation 隔离；迟到 Observation 继续由纯 reducer
  拒绝且不改变 state revision，同时仅追加不含输出正文的
  `runtime.command_rejected` 审计 Event。新增真实 loopback Desktop/Core/SSE
  Harness，验证 Desktop restart、Core restart、runtimeInstance 变化、durable
  cursor 重连、无重复投递、slow consumer 与资源回收；Renderer 补充等待输入、
  等待确认、恢复中和人工处理的 typed 用户指引。DCF-2C Harness 4 files /
  18 tests、完整 98 files / 630 tests 及全部 smoke 通过；等待独立 QA 和用户
  现场体验确认，CGF-2 继续 `GATED`。
- 用户正式接受 `0.0.0-dcf.2.2` 独立 QA：96 files / 620 tests、
  15/15 范围覆盖且 P0～P3=0。DCF-2B `PASS/CLOSED`，并明确授权进入
  DCF-2C；CGF-2 继续 `GATED`。
- `0.0.0-dcf.2.2` 完成 DCF-2B：新增 Application 层 Task Control，
  支持 cancel、retry、continue、provide input 和 Desktop 用户确认；
  commandId/digest、Task revision、Confirmation requestDigest 及
  Task/Run/Step/Action 精确绑定，重复、冲突、迟到、过期和错作用域均 typed
  rejection。allow 后、外部调用前复用既有确认协调器执行 disabled/revoked/
  health/credential/permission 实时收窄检查；retry 始终创建新 Run，cancel
  传播 AbortSignal，补充输入经 Conversation 事务持久化。新增安全确认
  Projection、HTTP/Main/Preload/Renderer 白名单链路、SQLite V12 前向迁移
  和 DCF-2B 架构护栏。完整 96 files / 620 tests、Core/Desktop/Preload
  smoke 全部通过；DCF-2C 与 CGF-2 继续 `GATED`。
- 用户正式接受 `0.0.0-dcf.2.1` 独立 QA：95 files / 615 tests、
  13/13 范围覆盖且 P0～P3=0。DCF-2A `PASS/CLOSED`，并明确授权进入
  DCF-2B；DCF-2C 与 CGF-2 继续 `GATED`。
- `0.0.0-dcf.2.1` 完成 DCF-2A：新增 Local Core Task list/detail、
  Run/Step 与 Tool Activity 安全投影，Desktop Main/Preload/Renderer 类型化
  只读入口和 Task 状态面板；durable Task/Tool Event 只传 ID 与 queryRef，
  Renderer 收到后重新读取 Core Snapshot，不建立第二 reducer。Scripted Agent
  Loop 正式复用 `DurableTaskRuntime` 产生 Run/Step/Observation/Task 完成事实；
  SQLite V11 前向迁移扩展 delivery 类型，重启后从 Task/Selection/Lock 重建
  Projection，既有事件不重复回灌。`uncertain` 统一显示“需要人工处理”，且
  Projection 不含 Tool 参数、结果、Credential、Effect 或幂等键。专项
  6 files / 47 tests、完整 95 files / 615 tests 全部通过；DCF-2B/2C 和
  CGF-2 继续 `GATED`。
- 用户正式接受 `0.0.0-dcf.2.0` 独立 QA：94 files / 614 tests、
  Contracts 专项 14 tests、14/14 范围覆盖且 P0～P3=0。DCF-2.0
  `PASS/CLOSED`，并明确授权进入 DCF-2A；DCF-2B、DCF-2C 与 CGF-2
  继续 `GATED`。
- `0.0.0-dcf.2.0` 完成 DCF-2 Contract/Projection 基线：新增 strict 的
  Task Detail、Tool Activity、User Confirmation、Run/Step 产品 Projection，
  cancel/retry/continue/provide input/decide confirmation 五类高层 Command，
  Task revision 与 `confirmationId + requestDigest` 绑定、Task/Confirmation
  查询、query-ref-only durable Event 和 typed error。新增 DCF-2.0 架构护栏
  与 14 项威胁/Conformance 测试；专项 5 files / 51 tests、完整 94 files /
  614 tests 全部通过。未修改 Kernel reducer、内部 Confirmation Persistence
  或 DCF-2A UI。
- 用户确认 DCF-2 为 `CONFIRMED_WITH_SPECIFIED_REVISIONS`：冻结 Task/Tool
  Activity/User Confirmation Projection、高层 Task Command、用户态状态
  additive 兼容、`confirmationId + requestDigest` 幂等、Retry 新 Run 与迟到
  Observation 隔离、`uncertain` 人工处理及 DCF-1.3 恢复 Harness 复用。
  当前仅 DCF-2.0 `UNBLOCKED`；DCF-2A～2C 和 CGF-2 继续 `GATED`。
- 用户正式接受 `0.0.0-cgf.1.3c` 独立 QA：Node 93 files / 600 tests、
  CGF-1.3C Harness 3 files / 15 tests、Central 在线/离线各 53 tests、
  14/14 范围覆盖且 P0～P3=0。CGF-1.3C 与 CGF-1.3 阶段正式
  `PASS/CLOSED`；下一阶段继续 `GATED`，等待方案确认和明确授权。
- `0.0.0-cgf.1.3c` 完成 CGF-1.3 阶段收口实现：新增只读
  `EnterpriseTaskGenerationRecoveryCoordinator`，严格按 enterprise
  activation authority → Task Selection/Lock 的顺序关联两个独立 SQLite，
  区分 current、locked previous、local、waiting、unavailable 和 integrity
  mismatch，且不改写既有 Task。新增可审计 `EnterpriseGenerationReferenceAnalyzer`
  覆盖 storage active/previous、runtime active、pending/failed/fallback 和
  非终态 Task/Lock，只返回 `safeToDelete=false` blocker，不实现删除。新增纯
  企业离线四状态 Projection，Central 恢复只要求用户确认，不触发静默同步或
  激活。专项双库 close/reopen Harness、完整 93 files / 600 tests、Central
  在线/离线各 53 tests 均通过；公共 Contract、Kernel 和 Central Java 未修改。
- 用户正式接受 `0.0.0-cgf.1.3b` 独立 QA（91 files / 594 tests、
  Runtime Activation 专项 2 files / 24 tests、Central 53 tests，
  P0～P3=0）；CGF-1.3B `PASS/CLOSED`，解锁并授权进入 CGF-1.3C。
- `0.0.0-cgf.1.3b` 新增内部 `RuntimeActivationPersistence`、
  `RuntimeActivationCoordinator`、`ControlledCoreRestartPort` 和
  `RuntimeRegistryInstaller`：持久 Activation Intent 后请求幂等受控重启，
  新 Core 只重建精确 startup target，internal readiness 通过后才在同一事务
  提交 completed attempt 与 runtimeActive，随后开放 public readiness。
  enterprise configuration SQLite V3 保留 V1/V2 checksum，InMemory/SQLite
  共用 Conformance 覆盖 CAS、并发单写者、提交后响应丢失、close/reopen、
  九个命名故障点和受限旧 generation 回退；完整 91 files / 594 tests 与
  Central 53 tests 通过。未修改公共 Contract、Kernel 或 Central Java。
- 用户正式接受 `0.0.0-cgf.1.3a` 独立 QA（89 files / 570 tests、
  Materializer + Registry 2 files / 26 tests、Central 53 tests，
  P0～P3=0）；CGF-1.3A `PASS/CLOSED`，解锁并授权进入 CGF-1.3B。
  CGF-1.3C 继续 `GATED`。
- `0.0.0-cgf.1.3a` 新增类型化 `EnterpriseRuntimeRegistrySource`、
  Enterprise Registry Materializer 和持久配置 Source Adapter：从精确
  Storage Active generation 重新校验 Snapshot、Package、file、
  materialization digest、四因素 scope、Compatibility 与企业会话，再把
  Model/Tool Descriptor 确定性转换为 Definition/Binding/AdapterDescriptor
  并通过既有 RegistryBuilder 冻结；Agent/Skill/Knowledge 保持独立运行引用。
  五项 `LocalExecutableEnterpriseCapability` 判定明确区分 generation、
  sealed/digest、依赖可用与本地 Model/Tool 可执行，Skill/Knowledge/Tool/
  defaultModel 检查集合从已校验 Agent Definition 固定引用推导，远程能力不自动 fallback；
  InMemory/SQLite Conformance、无会话/漂移/重复/不可用失败关闭和 KAF-3
  Registry 回归已覆盖。未修改公共 Contract、Kernel、Storage Active pointer，
  也未进入 Controlled Restart 或 Runtime Activation。
- 用户确认 CGF-1.3 为 `CONFIRMED_WITH_SPECIFIED_REVISIONS`：冻结企业离线
  四状态、Central 恢复自动检测但用户确认应用、持久
  `LocalExecutableEnterpriseCapability` 五项判定、旧 generation 十二项回退
  checklist、双 SQLite 权威与恢复顺序，以及 A/B/C 三阶段和 MVP 非目标。
  MVP 基线冲突与 P1×4/P2×2 文档门槛已关闭并记录 KN-063；该检查点随后由
  用户明确授权的 `0.0.0-cgf.1.3a` 实现批次承接。
- 用户正式接受 `0.0.0-dcf.1.3c` 独立 QA：完整门禁 88 files / 555 tests，
  Claude Code 实际重跑 30 分钟 `1,800,288ms / 178 turns / 16 runtime
  instances` 与 60 分钟 `3,600,353ms / 350 turns / 32 runtime instances`
  长稳 Harness，27/27 范围覆盖且 P0～P3=0。DCF-1.3C 与 DCF-1.3 阶段
  `PASS/CLOSED`。CGF-1.3 继续 `GATED`，不会因 DCF-1.3 关闭自动解锁；
  仍等待企业离线语义修订、CGF-1.3 方案重新确认和用户明确开发授权。
- `0.0.0-dcf.1.3c` 新增独立长稳 Harness：真实
  `CorePrivateSupervisor` 子进程、loopback HTTP/SSE、SQLite、SubmitTurn、
  Snapshot convergence、cursor reset、reconnect、controlled restart、
  graceful stop/start、slow-consumer fault probe 与 close/reopen 形成统一循环；
  CLI 只允许 30/60 分钟正式模式并输出不含正文、Token、Credential 或完整路径的
 机器报告。开发者实际 30 分钟 `1,800,314ms / 177 turns / 16 runtime
  instances` 与 60 分钟 `3,600,326ms / 349 turns / 32 runtime instances`
  均 `PASS`，最终全量门禁 88 files / 555 tests 通过。DCF-1.3C 等待独立 QA，
  CGF-1.3 继续 `GATED`。
- 用户正式接受 `0.0.0-dcf.1.3b` 独立 QA（87 files / 554 tests、
  专项 4 files / 18 tests、20/20、P0～P3=0）；DCF-1.3B
  `PASS/CLOSED`，解锁并授权进入 DCF-1.3C 长稳 Harness 开发。
  CGF-1.3 继续 `GATED`。
- `0.0.0-dcf.1.3b` 完成单一 Desktop SSE 的正式背压和资源边界：
  `response.write() === false` 后暂停 durable 推进并等待 `drain`，30 秒未恢复
  才关闭慢连接；等待期间不建立应用队列，ephemeral delta 丢弃、heartbeat
  跳过，最终由 SQLite durable cursor 和 Snapshot 收敛。新增 Server 资源计数、
  Main `dedupeSetSize/maxDedupeSize/cleanupCount`、durable-only 路径以及真实
  100 次 SSE 断连、25 次 Core restart、20 次 start-stop 压力矩阵；完整门禁
  87 files / 554 tests 通过。DCF-1.3C 与 CGF-1.3 继续 `GATED`。
- 用户正式接受 `0.0.0-dcf.1.3a` 独立 QA（86 files / 543 tests、
  专项 5 files / 18 tests、20/20、P0～P3=0）；DCF-1.3A
  `PASS/CLOSED`，解锁并授权进入 DCF-1.3B。DCF-1.3C 与 CGF-1.3
  继续 `GATED`。
- `0.0.0-dcf.1.3a` 完成 Desktop/Core 生命周期可靠性：固定六态 lifecycle，
  串行化并发 start/stop/restart，启动或运行失败最多自动恢复一次，额度耗尽后
  以不可重试 `failed` 和冻结用户文案收敛。受控重启生成新 token、端口与
  `runtimeInstanceId`，旧 Client/SSE/selectionHandle 失败关闭，同时复用同一
  SQLite 恢复持久 Session。Ephemeral Workspace Selection 在 resolve、cancel、
  stop/restart 后清理，并新增 Kernel 禁入护栏和真实子进程恢复矩阵；完整门禁
  86 files / 543 tests 通过。当前等待独立 QA，DCF-1.3B/1.3C 与 CGF-1.3
  继续 `GATED`。
- 用户接受 DCF-1.3 最终指定修订并记录 KN-056：lifecycle 不增加 recovering，
  Alpha 自动 restart 最多一次且 failed 后只允许重启 Desktop，slow consumer
  只由 `response.write() === false` 后 30 秒未 drain 触发，补充
  EphemeralWorkspaceSelectionStore 清理、Kernel 禁入、dedupeSet/durable-only、
  Harness 数据安全和 30/60 分钟实际执行门槛。DCF-1.3A 已解锁，
  DCF-1.3B/1.3C 与 CGF-1.3 继续 GATED。
- 用户确认先 DCF-1.3、后 CGF-1.3 的顺序并记录 KN-055；新增
  `DCF-1.3-DEVELOPMENT-PLAN.md`，将 Desktop/Core Runtime Reliability 拆为
  1.3A restart/recovery 与 runtimeInstance 生命周期、1.3B SSE backpressure/
  slow consumer/资源回收、1.3C 30～60 分钟长稳 Harness。计划当前
  `PROPOSED / CODING GATED`，不授权编码；CGF-1.3 继续 GATED，只有 DCF-1.3
  关闭、企业离线语义修订完成、CGF-1.3 方案重确认和用户明确授权全部成立后才可进入。
- 用户正式接受 `0.0.0-dcf.1.2c` 独立 QA（85 files / 534 tests、
  专项 4 files / 9 tests、P0/P1/P2/P3=0）；DCF-1.2C 与 DCF-1.2 阶段
  `PASS/CLOSED`。DCF-1.3 和 CGF-1.3 继续 `GATED`，等待方案确认和明确授权。
- `0.0.0-dcf.1.2c` 完成 Desktop streaming 与恢复收口：Model delta 通过
  进程内 ephemeral bus 和单一认证 SSE 到达 Renderer 临时投影，最终正文由
  SQLite `message.committed` durable delivery 与 Conversation Snapshot 收敛；
  Main 采用 250ms～10s 有 jitter 退避、eventId 去重、cursor 续接、运行代变化
  清理和四类 replay reset。SQLite migration 10 支持同一 SubmitTurn 的多条
  有序投递与默认 2048 条保留窗口，真实子进程 E2E 验证首个 delta 后断线仍能
  Snapshot-first 恢复最终 Message。DCF-1.3/CGF-1.3 继续 `GATED`。
- 用户正式接受 `0.0.0-dcf.1.2b-repair.2` 独立 QA（82 files / 527 tests、
  P0/P1/P2/P3=0）和用户现场演示，repair.2 与 DCF-1.2B 正式
  `PASS/CLOSED`；解锁并授权进入 DCF-1.2C。CGF-1.3 继续 `GATED`。
- 用户接受 DCF-1.2A 独立 QA（77 files / 518 tests、20/20、P0～P3=0）并正式
  `PASS/CLOSED`。`0.0.0-dcf.1.2b` 随后实现固定业务 IPC Router、Preload
  输入/输出双重 Contract 校验、Main 内系统目录选择、Workspace/Session/Chat/
  Agent/Model 最小 Vue 工作台，以及真实 SQLite + Main Router + Core
  Workbench E2E；完整门禁 80 files / 525 tests 通过。当前等待独立 QA 与用户
  现场演示，DCF-1.2C 和 CGF-1.3 继续 `GATED`。
- `0.0.0-dcf.1.2a` 完成正式 Desktop 私有桥接：新增唯一
  `DesktopApplicationFacade`、loopback 随机端口 HTTP/SSE、严格
  Host/Origin/Bearer 与有界请求响应、Electron Main 类型化 Client 和正式 Core
  子进程监督；`selectionHandle` 采用进程内 TTL、单次和上下文绑定且不进入持久化
  或 Renderer。持久 SubmitTurn 复用既有 Task/Selection/Context/Agent Loop，
  close/reopen 与重复请求不重复写 Assistant Message。完整门禁 77 files /
  518 tests 通过，当前等待独立 QA；1.2B/1.2C 与 CGF-1.3 继续 `GATED`。
- 用户接受 DCF-1.2 指定修订并记录 KN-051：将 Desktop Bridge 与最小工作台拆为
  1.2A 正式 Core 私有 HTTP/SSE + Application Facade/Main Client、1.2B Preload
  白名单 + Vue 工作台、1.2C Scripted Model streaming + Snapshot/cursor 收敛；
  冻结四项 P0、Headless/Test 薄 Adapter 和 selectionHandle 生命周期，关闭
  Claude Code P1×2，并为 P2×3/P3×2 固定实现或 QA 门槛。DCF-1.2A 已解锁，
  1.2B/1.2C、DCF-1.3 与 CGF-1.3 继续 `GATED`。
- 用户正式接受 `0.0.0-dcf.1.1c` 独立 QA（74 files / 512 tests、
  SubmitTurn 专项 3 files / 17 tests、P0/P1/P2/P3=0），DCF-1.1C
  `PASS/CLOSED`，DCF-1.1 阶段正式关闭；CGF-1.3 继续 `GATED`，等待方案确认
  和明确授权。
- `0.0.0-dcf.1.1c` 完成 SubmitTurn 双领域持久协调：新增 strict
  SubmitTurnRecord/Receipt、Session-owned 用户 Message intent、Task +
  RuntimeSelection + CapabilityLocks + userMessageId 原子 bundle、durable
  Desktop delivery、commit 后幂等 Agent Loop starter、可注入 Scheduler 的
  有界恢复和最小 Headless Command/Query。SQLite migration 9 移除
  Conversation→Task 的跨领域外键并增加协调表；7 个命名中断点真实
  close/reopen、Memory/SQLite Conformance 与完整 74 files / 512 tests 通过。
  CGF-1.3 继续 `GATED`。
- 用户正式接受 `0.0.0-dcf.1.1b` 独立 QA（71 files / 495 tests、
  Contract/Runtime 专项 2 files / 10 tests、P0/P1/P2/P3=0），DCF-1.1B
  `PASS/CLOSED`；解锁并授权进入 DCF-1.1C。CGF-1.3 继续 `GATED`。
- `0.0.0-dcf.1.1b` 完成 Agent/Model 确定性 Runtime Selection：
  新增 strict AgentDefinitionRevision、ModelDefinition 与 TaskRuntimeSelection
  Contract，受信 Fixture Repository、纯 ModelEligibilityEvaluator、安全
  Agent/Model Projection、Model/Tool 精确 TaskCapabilityLock、Skill/Knowledge/
  Workspace 引用、稳定 selection digest，以及 Memory/SQLite 持久化和
  close/reopen 恢复。完整门禁为 71 files / 495 tests；DCF-1.1C 与 CGF-1.3
  继续 `GATED`。
- 用户正式接受 `0.0.0-dcf.1.1a` 独立 QA（69 files / 485 tests、
  DCF 专项 3 files / 15 tests、P0/P1/P2/P3=0），DCF-1.1A
  `PASS/CLOSED`；解锁并授权进入 DCF-1.1B。DCF-1.1C 与 CGF-1.3
  继续 `GATED`。
- `0.0.0-dcf.1.1a` 完成 Desktop Core 的 Workspace/Session 基础：
  `WorkspaceSelectionResolver` 只解析受信 opaque handle，WorkspaceGrant 持久化
  realpath 后的根目录并以分段、realpath 和 symlink 失败关闭校验子路径；
  Session 复用 KAF-5 `SessionHead`，title/revision/tombstone 独立持久化并使用
  expected revision。新增持久 `SessionCreateIntent` 锁定跨事务 command digest，
  InMemory/SQLite 共用 Conformance、migration 7/preflight、Conversation
  Projection，以及 create/rename/tombstone/grant create/revoke 提交后响应丢失的
  close/reopen 恢复矩阵。DCF-1.1B/1.1C 与 CGF-1.3 继续 GATED。
- 正式固化 DCF-1.1 与 CGF-1.3 两份分批开发计划：DCF-1.1 拆为
  Workspace/Session、确定性 Runtime Selection、SubmitTurn 双领域恢复三批；
  CGF-1.3 拆为企业 Registry 物化、受控重启与 runtimeActive 提交、Task generation
  引用安全三批。冻结 internal readiness 后、public readiness 前提交
  `runtimeActive`，目标激活失败时只允许在有效企业会话和完整性复核成立的前提下
  显式恢复上一次成功运行代，并保持 `activation_failed`。DCF-1.1A 后续已经
  获得用户授权并完成开发者自测；CGF-1.3 继续 `GATED`。
- 用户接受 CGF-1.2C 与 `0.0.0-cgf.1.2c-repair.1` 两份独立 QA，二者正式
  `PASS/CLOSED`，CGF-1.2 阶段正式关闭；QA 报告中的 response-too-large、
  protocol-invalid、手动超时实现和无条件 304 错误码文字已按实际代码修正。
  CGF-1.3 继续 `GATED`，未获得方案或开发授权。
- `0.0.0-cgf.1.2c-repair.1` 新增安全清理与源码交付能力：`pnpm run clean` 只删除固定可重建的 TypeScript/Electron 输出、增量编译信息和 Central `target`，保留依赖、源码与 QA 证据；`pnpm run package:source` 在工作区外生成排除依赖、构建物、临时证据、环境凭证与运行数据库的 `.tar.gz`，并附逐文件 `SOURCE-MANIFEST.json` 和归档 SHA-256。新增 15 项边界测试；不迁移 pnpm/Maven 缓存或改变现有构建路径。
- 用户接受 CGF-1.2B 独立 QA 并正式关闭该批次，解锁 `0.0.0-cgf.1.2c`；Local Core 新增类型化 `EnterpriseConfigurationClient`、固定 Origin/手动 Redirect/流式响应上限/超时/取消的 HTTP Adapter、ETag/304 修复和同 scope 单写者同步协调器；SQLite 以 `enterprise-config-V2` 前向 migration 记录安全同步事实，并新增 Java test-profile 真实 Token → Node Core → 独立 SQLite close/reopen 跨语言 E2E。CGF-1.3 继续 `GATED`。
- 用户接受 CGF-1.2A 独立 QA 并正式关闭该批次，解锁 `0.0.0-cgf.1.2b`；Local Core 新增 Enterprise Configuration strict consumer、确定性 Validator/Materializer、按四因素 scope 串行的 Storage Activation Coordinator、语义化 Persistence Port、InMemory/SQLite 共用 Conformance，以及独立 `enterprise-configuration.sqlite`、`enterprise-config-V1` migration/preflight、candidate stage/seal、CAS active/previous pointer、状态事件和故障恢复；CGF-1.2B 独立 QA 后已由用户接受并正式 `PASS/CLOSED`。
- `0.0.0-cgf.1.2a` 完成 exact Snapshot-bound Agent/Skill Package Read：Enterprise Gateway `v1alpha1` 增量增加严格 Schema/Fixture/OpenAPI，Central 强制短期 Token、`configuration.read`、精确 Snapshot 闭包成员、revision/digest、稳定 ETag/304 与 no-store；Local Core 新增 `EnterpriseAccessTokenProvider`、同四因素最多一次续签的 Token Session、pointer 派生 Activation Status，以及 Desktop Local `v1alpha2` strict Projection/Event。Node 59 files / 418 tests、Central 在线/离线各 53 tests（0 skipped）通过，CGF-1.2B 等待独立 QA。
- 用户以 `CONFIRMED_WITH_SPECIFIED_REVISIONS` 接受 CGF-1.2 十项冻结并授权进入 1.2A：补充多请求 Token Provider 生命周期、pointer 派生 Activation Status、Desktop Local v1alpha2 状态 Projection/Event、独立 `enterprise-configuration.sqlite`、Kernel 边界、有界并发/GC 可观测和工程日/日历日口径；建立 KN-040 与 MVP 离线语义修订项，1.2B/1.2C 继续受逐批独立 QA 门槛约束。
- 用户接受 CGF-1.1D 独立 QA（14/14 范围覆盖，Node 56/404、Central 在线/离线各 50 tests、P0/P1/P2/P3 均为 0），1.1D 正式 `PASS/CLOSED`，CGF-1.1 阶段正式关闭；CGF-1.2 保持 `GATED`，等待方案确认和明确授权。
- `0.0.0-cgf.1.1d` 新增 Docker/Embedded PostgreSQL 共用的全链恢复矩阵：Fake OA Identity、Manual Enrollment、Challenge/ES256 Proof、四因素 Token、Configuration Read 贯穿 7 个命名故障点、提交前回滚、提交后响应丢失、新 Challenge 恢复、32 并发单写者、相等到期边界和数据库敏感明文扫描；Node 56/404、Central 在线/离线各 50 tests（0 skipped）通过，等待独立 QA。
- 用户接受 CGF-1.1C 独立 QA（Node 56/404、Central 在线/离线各 48 tests、P0/P1/P2/P3 均为 0），1.1C 正式 `PASS/CLOSED`；根版本和 Central Service 进入 `0.0.0-cgf.1.1d`，只开放真实 PostgreSQL 全链恢复矩阵与 CGF-1.1 阶段收口。
- `0.0.0-cgf.1.1c` 完成四因素短期 Token 签发与校验、固定 Permission/Compatibility、compact JWS Codec Port/Fake、受保护 Configuration Read、稳定 ETag/304 和 Snapshot/Package canonical digest/引用完整性；Node 56/404、Central 在线/离线各 48 tests（Docker/Embedded PostgreSQL，0 skipped）通过，CGF-1.1D 保持 `GATED`。
- 用户接受 CGF-1.1B 独立 QA（Node 404 tests、Java 在线/离线各 34 tests、P0/P1/P2/P3 均为 0），1.1B 正式 `PASS/CLOSED`；根版本和 Central Service 进入 `0.0.0-cgf.1.1c`，只开放 Token Issuer、固定 Permission、Compatibility 与 Configuration Read。
- `0.0.0-cgf.1.1b` 完成 Fake OA Verified Identity、单次 Device Challenge、`ROBOTHREE_DEVICE_PROOF_V1`/ES256 Proof、Managed Device Trust、可选 Manual Enrollment、正式 challenge/enrollment Route 和 V5 原子消费幂等；Node/Desktop 404 tests、Central 在线/离线各 34 tests（含 Docker/Embedded PostgreSQL，0 skipped）通过，CGF-1.1C 保持 GATED。
- 记录 KN-033：用户接受 CGF-1.1A 正式 `PASS` 并解锁 CGF-1.1B；根版本和 Central Service 进入 `0.0.0-cgf.1.1b`，范围严格限定为 Identity、Challenge、ES256 Proof、Device Trust、Manual Enrollment 与对应正式 Route。
- Docker/Testcontainers 补充验证在线、离线均达到 22 tests / 0 failures / 0 skipped，关闭 `P3-CGF-DOCKER-001`；CGF-1.1A 转为正式 `PASS`，CGF-1.1B 等待用户解锁。
- 记录 KN-032：用户接受 CGF-1.1A 为 `PASS_WITH_P3_ENV`，保留 Docker/Testcontainers 实际执行门槛；`P3-CGF-DOCKER-001` 关闭前 CGF-1.1B 继续 `GATED`，不返工 1.1A。
- `0.0.0-cgf.1.1a` 新增 PostgreSQL 16 / Flyway V1～V4、schema preflight、显式事务、Identity/Device/Challenge/Token/Configuration typed Repository Port 与 JDBC/InMemory Adapter、trusted seed 和 Fake Clock/OA/Secret Store/Device Signer；同一 Conformance 在 InMemory 与真实 PostgreSQL 上验证，CGF-1.1B 仍等待独立 QA。
- 记录 KN-031 并确认 CGF-1.1 开发计划：接受 1.1A～1.1D 逐批独立 QA、Alpha TTL 上限、Device Proof V1 canonical 签名字节、ES256/SPKI 执行边界和 Token 响应丢失后的新 Challenge 规则；当前只打开 CGF-1.1A Persistence Foundation。
- 记录 KN-030：`0.0.0-cgf.1.0-repair.1` 独立 QA 以 56 files / 417 Node tests、Java 在线/离线各 12 tests、P0/P1/P2/P3 均为 0 通过；用户正式接受 ADR-014，Enterprise Identity 架构转为正式约束并解锁 CGF-1.1。
- `0.0.0-cgf.1.0-repair.1` 依据 KN-029 修订 ADR-014 和 Enterprise Gateway 身份子协议：OA verified identity、不可导出 `EnterpriseDeviceSigner`、Central Device Challenge/Proof、Managed Device Trust、短期 Access Token Claims、可选 Manual Enrollment 和七个 typed device/challenge error；新增 2 份 Schema，Fixture corpus 扩展到 34 cases，配置主体保持不变。
- 记录 KN-029：用户接受 DCF-1.0/CGF-1.0 独立 QA，DCF-1.1 解锁；企业会话必须满足 OA Identity、Managed Device Trust、固定权限与 Compatibility，CGF-1.1 继续等待 ADR-014 ACCEPTED 和 identity repair 独立 QA。
- DCF-1.0 新增正式 Desktop Local `v1alpha1` strict Contract Pack、valid/invalid corpus、Main/Core 同 corpus Conformance，以及 durable/ephemeral、`replay_reset_required`、Session tombstone、heartbeat 非持久和大型内容 Query 引用门禁；未实现业务 Route 或协调状态机。
- CGF-1.0 新增 ADR-014 `PROPOSED`、唯一根级 Enterprise Gateway OpenAPI/JSON Schema/canonical digest/Fixture，以及独立 TypeScript/Java Conformance consumer；企业 credentialRef 禁止下发，Package 强制 UTF-8/文档/文件数/路径/物化上限。
- 记录 KN-028 并确认 DCF-1/CGF-1 指定修订：DCF 增加 durable-first、cursor reset、有界投递、Session tombstone 和 heartbeat 约束；CGF 增加企业 Credential Port 隔离、credentialRef 禁下发、Package 单文件上限、唯一 canonical source、非中断 Runtime Activation 和可替换身份 Adapter。DCF-1.0/CGF-1.0 已打开，两个 1.1 继续受独立门槛约束。
- Foundation 收口新增 `.java-version`、跨平台 Java 21/JDK 完整性检查、`check:java`/`check:central:offline` 和自动化回归；Central 门禁不再依赖调用者手写某台机器的 JDK 路径。
- DCF-0 新增 Electron + Vue 安全桌面壳、Main/Preload/Renderer 白名单边界、认证 loopback Fake Core Supervisor、有限异常重启和 Desktop smoke；公开 Fixture 状态不包含令牌、端口或 PID。
- CGF-0 新增 Java 21 / Spring Boot 3.5.16 / Maven Wrapper 3.9.16 模块化单体骨架、明确标记的 readiness/compatibility Fixture、跨语言共享 Fixture、Fake Secret Store/Model/Tool 和真实随机端口 HTTP 冒烟。
- 架构边界门禁新增 DCF Renderer/Preload/BrowserWindow 安全检查与 CGF-0 loopback、Fixture 标记、依赖和“禁止提前数据库 migration”检查；新增 `check:central` 与 `check:foundation` 验证入口。
- 记录 KN-026：用户接受 ADR-011/012/013、ADR-008/009 两层激活修订和 Desktop/Enterprise 两份 `v1alpha1` Contract；Desktop/Central Foundation 转为 `CONFIRMED`，打开 DCF-0/CGF-0，正式业务功能继续按 DCF-1+/CGF-1+ 的 Schema、Conformance 与独立 QA 门槛逐批解锁。
- 根据 Desktop/Central Foundation 独立文档评审补齐收口语义：ADR-008 明确 Tool Schema 首次进入 ModelRequest 前即须锁定，ADR-011 明确 revision/digest 恢复失败关闭，ADR-012 增加永久失败终态与有界恢复扫描原则；Desktop Contract 明确企业配置修订可缺省，并单列 DCF-0/CGF-0 脚手架估算。ADR/Contract 状态仍为 `PROPOSED`，未解锁正式业务编码。
- 记录 KN-025 并完成 Desktop/Central Foundation 文档收口：总体方向为 `CONFIRMED_WITH_REQUIRED_REVISIONS`，两份跨边界 Contract 为 `PROPOSED`，正式业务实现保持 `BLOCKED_BEYOND_NON_SEMANTIC_SCAFFOLDING`；DCF-0/CGF-0 仅允许工程骨架、Fake 和非语义 Harness。
- 新增 ADR-011/012/013 提案，分别定义 AgentDefinitionRevision/TaskRuntimeSelection/ModelEligibilityEvaluator、SubmitTurnCoordinator 的 Session/Task 最小协调恢复，以及 PersonalCredentialStore/OS Keychain/受控敏感通道边界。
- 新增 Desktop Client Foundation、Central Gateway Foundation 两份分批计划和 Desktop Local Runtime、Enterprise Gateway 两份 `v1alpha1 PROPOSED` Contract；补入 Core Skill Runtime Foundation、MaterializedEnterpriseConfiguration、Model Gateway 接受幂等和 Desktop durable cursor 边界。
- 新增 Desktop/Central Foundation 架构收口基线，集中记录对象所有权、阶段依赖、5 个 P0/6 个 P2/3 个 P3 的文档关闭映射以及仍需 PM 接受的新 KEY-NODE 门槛。
- 修订 ADR-008/009，明确 Configuration Storage Activation 不修改当前冻结 RegistrySnapshot，Runtime Registry Activation 只在受控 Core 重启/rebuild 后发生；Agent/Skill/Knowledge 不进入只管理 Model/Tool 的 Capability Registry。
- 修订 MVP 功能基线：每个 Agent 必须有 defaultModel，`allowModelOverride` 只控制单 Task 显式切换；区分 Agent/User/Task 三种模型默认值，企业发布 Agent 由有权限创建者在 Desktop 派生个人草稿后重新提交审核。
- KAF-5.3 新增 `CompactionCoordinator`、类型化 `CompactionSummarizer`/Fake、事务外摘要与 pending recovery、最新有效 Summary + raw tail View；新增最小有界 `AgentLoopCoordinator`，支持 Model stream、Tool Call/Observation、下一轮 Model、取消、轮次上限、关联校验和稳定 Timeline digest。
- Model stream 增加 provider-neutral `tool_call` 事件，并新增 Scripted Model/Fake Agent Tool Executor；Compaction 和 Agent Loop 专项覆盖 Memory/SQLite、摘要取得后提交前崩溃恢复、50-round Tool Loop 与确定性 Timeline。
- KAF-5.3 第二检查点新增 append-only `DurableAgentConversationWriter`、未配对 Tool Call 重启扫描与 `AgentToolRecoveryCoordinator`；Agent assistant/tool 事实可经 InMemory/SQLite Conversation 持久化并在 close/reopen 后恢复。
- 新增 `ToolExecutionAgentBridge`，把模型 Tool Call 精确映射到既有 `ToolExecutionService → Authorization/UserConfirmation → Effect → Observation` 链，并把持久 Observation 投影为 provider-neutral Tool Result；覆盖用户确认等待/确认恢复、deadline typed failure、SQLite pending-call recovery、Compaction request/result 各 10 轮竞争。
- KAF-5.3 性能门槛新增 500 messages + 32 static segments + 16 locked Tools 的 5 warm-up/20 samples p95<500ms，以及 active Summary + 500 raw tail 的 SQLite close/reopen 重建<2s；完整基线达到 48 files / 390 tests。
- 新增统一 `pnpm run harness:kaf53` 门禁，实际重跑 Model、Context、Compaction、Agent Loop、ToolExecution、UserConfirmation 与 Effect recovery 七组测试；waiting confirmation 在5个全新 SQLite 数据库完成崩溃恢复，三个 Compaction 命名崩溃点分别 close/reopen 10次，延迟旧摘要显式 stale，完整基线达到 48 files / 394 tests 并进入独立 QA。
- 记录 KN-024：KAF-5.3 独立 QA 实际重跑 `harness:kaf53`（7 files / 75 tests）和完整 `check`（48 files / 394 tests），15 项验收全部通过且 P0/P1/P2/P3 均为 0；KAF-5 正式关闭，打开 Desktop Client 与 Central Service Gateway 基础的并行规划入口。
- KAF-5.2 新增 `TurnSnapshotBuilder → ContextBudgetPolicy → ContextAssembler → TokenMeasurement/Reduction → ModelMessageConverter` 纯流水线、Core 内部 `SelectedSkillContext`、保守 Fake TokenEstimator、Static/Dynamic Segment、Context Assembly Receipt 和带 canonical digest 的独立 `v1alpha1` provider-neutral ModelRequest。
- TurnContextSnapshot 的 Task source 新增精确 TaskCapabilityLock revision/digest；Tool Schema 仅在 selected、authorization allowed、Snapshot-bound、注册证明精确且版本兼容时注入。128 KiB Tool Result 转为 observation/digest artifact reference 与不超过 4096 bytes 的 UTF-8 preview，pre-call/mid-turn 均执行完整重新预算。
- 新增 KAF-5.2 Alpha 边界与确定性自动化：8192/1024/512/0.8 的 N-1/N/N+1、preview 4095/4096/4097、来源排除、完整 turn reduction、10 次相同组装、ModelRequest digest 与 Fake ModelProvider 校验；全量基线达到 46 files / 373 tests。
- 记录 KN-023：KAF-5.1 独立 QA 以 44 files / 357 tests / P0=P1=P2=P3=0 关闭 Conversation/Turn Foundation 并打开 KAF-5.2；KAF-5.3 在 5.2 独立 QA PASS 前继续关闭。
- KAF-5.1 新增独立版本的 provider-neutral rich message、assistant tool call/tool result、完整 `ConversationMessage` 与 `TurnContextSnapshot`；ConversationPersistence 持久化正文并校验 canonical digest，TaskPersistence 增加 Session→Task 查询，TurnSnapshotBuilder 以精确 Conversation/Task revision/digest 形成确定投影。
- 新增 migration 6 rich message content 和 Task 查询索引；固定 Alpha Fixture 覆盖 3 User、3 Assistant、1 组 tool exchange 和 2 Task，连续投影 10 次、InMemory/SQLite 一致、close/reopen、cross-session/损坏引用和篡改内容失败关闭。
- 记录 KN-022：KAF-5.0b 独立 QA 以 41 files / 342 tests / P0=P1=P2=P3=0 关闭 KAF-5.0 并打开 KAF-5.1；KAF-5.2 在 5.1 独立 QA PASS 前继续关闭。
- KAF-5.0b 新增语义化 ConversationPersistence Port、InMemory/SQLite 共用 Conformance、连续 SQLite migration 5、Session/Compaction 六表和 Task/Session 双所有者 Outbox；双事务在 `BEGIN IMMEDIATE` 后重读，T2 使用 `activeCompactionId + contextRevision` CAS，并覆盖 pending 唯一约束、Receipt 幂等/冲突、prefix tail、fail/stale、故障注入和 close/reopen 恢复。
- 记录 KN-021，接收 KAF-5.0a 独立 QA `PASS`（39 files / 316 tests / P0=P1=P2=P3=0）并打开 5.0b；5.0b 开发者基线为 41 files / 342 tests，独立 QA `PASS` 前 KAF-5.1 继续关闭。
- KAF-5.0a 新增 Conversation/Context/Compaction/Model Protocol 四个独立 `v1alpha1` 版本入口，以及 strict Session Message Envelope、SessionHead、Session Command/Receipt/Event、CompactionJob/Record Contract；Command 规范序列化复用既有 JSON canonicalization，新增引用一致性、未知版本、敏感运行时字段和 `SelectedSkillContext` 公共边界护栏。
- 接受 ADR-010 并记录 KN-020：KAF-4.3 独立 QA `PASS`、第二轮文档评审 P0/P1/P2/P3 均为 0且用户明确批准；KAF-5 计划转为 `CONFIRMED`，只打开 5.0a Contract Checkpoint，5.0a 未通过前不得进入 SQLite 5.0b。
- 记录 KN-019，接收 `0.0.0-kaf.4.2` 独立 QA `PASS` 并打开 KAF-4.3；新增每 subscriber 独立有界的 `BoundedEventStream`、typed delta/status/completion/durable 事件、只针对非持久 delta 的同键合并，以及关键事件溢出时明确断开慢消费者而非静默丢失或扩大内存。
- 新增 `GracefulWorkController` 与 Core graceful shutdown Port：停止接受新工作、取消 active work、等待固定 deadline、停止单飞行 Outbox drain，并反向关闭 RuntimeComponent Adapter；Process Echo ChildProcess、Timer、subscriber 与 Abort listener 形成自动化清理基线。
- 新增可复现 `PerformanceHarness`、JSON/Markdown 基准报告、纯 reducer/Authorization/Registry/admission/取消/SQLite/confirmation lookup/10,000 Event replay/Outbox/Echo IPC 测量，以及 16+256 admission、Retry storm、100,000 delta、20 次 SQLite restart 的长期可靠性测试。
- Outbox 新增由 `maxBatch × maxBatches` 双重限制的 backlog recovery drain；DurableTaskRuntime in-process snapshot cache 默认限制为 256 条并提供显式统计与清理。
- 记录 KN-018，接收 `0.0.0-kaf.4.1-repair.1` 独立 QA `PASS` 并关闭原三项阻塞，打开 KAF-4.2 编码入口；新增 Application 层 `RuntimeAdmissionController`、显式 16 Run/8 Tool/256 queue Alpha 预算、全局与 Adapter 并发限制、FIFO 有界排队、queued cancel/deadline、typed backpressure 和结构化 reliability event。
- 新增纯 `RetryPolicy`、安全范围受限的 `RetryCoordinator`、可注入 Scheduler/Random 及确定性 Fake；默认最多三次实际尝试、2s 指数退避、20% jitter、30s cap 和可信 Retry-After，明确排除 Authorization/user_rejected/invalid Contract/deadline/uncertain Effect。
- Outbox 增加持久 `nextAttemptAt`、SQLite migration 4、due-only 有界 batch、AbortSignal 和指数 backoff；publish→ack 失败仍保留稳定 Event/Outbox ID 与 at-least-once 语义，不在 Task mailbox 内等待。
- 新增 KAF-4 同期 “Agent 讨论区” Hook：基于 Workspace 授权的最小文件式协作区，独立于 Kernel/Application/Adapters 边界；提供 `AgentNameNormalizer`、`DiscussionFileNameGenerator`（同秒递增、`EEXIST` 重试）、原子写入并按工作区根校验的 `DiscussionRepository`、含 front-matter 编码/解码与损坏文件隔离的 `DiscussionMarkdownCodec`、`DiscussionService`（`post`/`read`，按 `@target` 投递、按 `currentAgent` 过滤）和最小 `/discussion post|read` 命令 + 自然语言意图归类的 `DiscussionHook`；覆盖安全、并发、UTF-8 命名、Markdown 特殊字符和符号链接逃逸检查的 57 项自动化测试；纯 `DESIGN_ONLY` 实现，不复制任何上游源码；新增 6 个测试文件 `/RoboThree_workspace/services/core/tests/discussion-area/*`。
- 记录 KN-005，正式接收 KAF-1.1 独立 QA `PASS`，并把 ADR-007 确认设为 KAF-2 编码前置门槛。
- 将 ADR-007 扩展为 Event、Checkpoint、Command 幂等、SQLite 事务、Outbox、副作用 uncertain 与恢复的一致性方案。
- 新增 KAF-2 开发计划，按 Persistence 基础、Durable Command Pipeline、Recovery/Effect 三个批次定义范围与验收门槛。
- 接受 ADR-007 七项冻结决策并记录 KN-006；新增 `v1alpha1` Persistence Contract、语义化 TaskPersistence Port、InMemory/SQLite Adapter、forward-only Migration 与 schema preflight。
- 新增 InMemory/SQLite 共用 Conformance Suite 及真实 SQLite close/reopen、原子提交落库、较新/损坏 schema 失败关闭测试，完整基线达到 11 个测试文件、73 项测试。
- 记录 KN-007，接收 KAF-2.1 独立 QA `PASS`；新增 DurableTaskRuntime、确定性 Event tail replay、历史 Command Receipt 回放和最小 OutboxDispatcher/FakeEventPublisher。
- 扩展 InMemory/SQLite 共用持久化语义，增加 Checkpoint by revision、Event tail、pending Outbox 与 delivery attempt，并以故障注入、SQLite 重启和 KAF-1 行为回归将基线扩展到 12 个测试文件、89 项测试。
- 记录 KN-008，接收 KAF-2.2 独立 QA `PASS`；新增 EffectCoordinator、TaskRecoveryCoordinator、EffectExecutor Port/Fake、三种显式 recovery mode 和命名崩溃点恢复矩阵。
- Effect Intent、dispatch、result/uncertain Event 与 Outbox 持久化进入 InMemory/SQLite 共用语义；Effect 终态与 Observation/等待/取消 Command 原子提交，稳定 idempotencyKey 支持顺序及并发回放。
- 记录 KN-009，接收 KAF-2.3 独立 QA `PASS` 并关闭 KAF-2；保留一项不阻断的 SQLite/Vitest 并发测试 P3，进入 KAF-3 编码前架构冻结门槛。
- 接受 ADR-008 并记录 KN-010，冻结 Capability Definition/Binding/AdapterDescriptor/Runtime Handle 分层、启动时不可变 RegistrySnapshot、TaskCapabilityLock 精确修订与实时状态只收窄原则。
- 新增 KAF-3 开发计划，按 Contract/Registry、确定性 Resolver/Typed Port/Task Lock、进程外 Echo Tool Adapter 三批推进，并把完整 MCP、Office、Browser、真实模型和能力智能选路排除在本阶段之外。
- 新增 `v1alpha1` CapabilityDefinition、CapabilityBinding、AdapterDescriptor、RegistrySnapshot 与 TaskCapabilityLock Contract，并以规范 JSON/SHA-256 精确修订、严格引用和 Agent/基础设施分区形成 KAF-3.1 注册基线。
- 新增一次性 RegistryBuilder、深层不可变 Snapshot、注册顺序无关 digest、重复/缺失/多 Binding 失败关闭以及 RuntimeAdapterHandle/Kernel 进程 API 架构护栏；完整基线达到 15 个测试文件、132 项测试。
- 记录 KN-011，接收 KAF-3.1 独立 QA `PASS`；新增显式 ID `CapabilityResolver`、类型化 unavailable 错误和 revoked/disabled/credential/health 只收窄覆盖层，不提供搜索、评分或 fallback。
- 新增 Core-only RuntimeAdapterHandle、ModelProvider/ToolCatalogProvider/ToolExecutionBackend 类型化 Port、Fake Catalog/双 Fake Backend Conformance，以及受信来源启动 allowlist，拒绝调用方仅凭 `official` 声明注册。
- TaskCapabilityLock 进入 InMemory/SQLite 共用持久化语义与 migration 2；Fake Tool 通过锁定 Descriptor 进入 Intent-first Effect、类型化 Observation、Event/Checkpoint 原子结果链，完整基线达到 18 个测试文件、161 项测试。
- 接受 ADR-009 并记录 KN-012，确认未来 Central Enterprise Service 与 Admin API 后端采用 Java，本地 Agent Runtime / Local Core 保持 Node.js，跨语言边界使用版本化、语言无关 Contract。
- 记录 KN-013，冻结 KAF-3.3 分发语义、Policy/Approval 前置位置、Effect/request/idempotency 标识生命周期与显式 uncertain 原则；新增受信固定路径的真实 Process Echo Tool Adapter、版本化 NDJSON、握手、帧限额、请求关联、进程生命周期和 SQLite 重启恢复验证。
- Tool 执行取消信号由 Application/Effect/Executor 贯穿至 Backend；协议错误、响应错配和进程崩溃不再伪装为确定性失败，而是保留 dispatched Effect 供锁定恢复策略处理，完整基线达到 19 个测试文件、172 项测试。
- 记录 KN-014，正式接收 KAF-3.3 独立 QA `PASS`：27/27 范围、19 个测试文件、172 项测试及全部门禁通过，问题为 0；KAF-3.1～KAF-3.3 三批全部通过并关闭 KAF-3。
- 冻结《RoboThree MVP 功能范围与开发基线 v1.0》并记录 KN-015，确定 Desktop/Agent Core 优先、Central Service 中等投入、Admin 最小化，以及 Tool/MCP、模型、Skill、Agent/Skill 发布、用户确认和能力选择的 MVP 边界；同步更新产品索引与活动开发路线，要求 KAF-4 前重构或替代现有 ADR-006。
- 接受重构后的 ADR-006 并记录 KN-016，冻结固定授权、Tool 风险、两类 Desktop 用户确认、`approval → user_confirmation` Contract 演进和 Effect 前置 Gate；新增 KAF-4 三批开发计划，按授权确认、有界并发/背压/重试、性能可靠性推进，并锁定 KAF-5 后 Desktop 与 Central Gateway 并行的后续顺序。
- 记录 KN-017 并冻结 KAF-4 开发顺序；新增 ADR-010 `PROPOSED` 与 KAF-5 `DRAFT`，明确双事务 Compaction、领域版本方案 B、5.0a/5.0b、真实 Skill Reader 后置，以及 KAF-4.3 PASS 前不得接受或编码。
- 新增 `v1alpha2` Authorization、ToolRisk、Grant、Confirmation Scope/Request/Decision Contract、纯 AuthorizationEvaluator、持久 UserConfirmationCoordinator、SQLite migration 3 和 `v1alpha1 approval` checkpoint upgrader。
- ToolExecutionService 在 Effect Intent 前执行固定授权和用户确认 Gate，并在 `prepared → dispatched` 之间重检；用户拒绝形成 `user_rejected` Observation，授权拒绝和分发前失效形成持久 Event，专项与全量基线达到 23 个测试文件、194 项测试。

### Changed

- 根包与 Central Service 进入 `0.0.0-cgf.1.0-repair.1`；CGF-1.1 工程量调整为 11～16 个集中工作日，真实 OA/MDM/设备证书和生产 OS Device Signer 仍是企业试点前门槛，不属于 repair 或 CGF-1.1 Foundation 完成条件。
- 无有效企业会话时只保留企业配置缓存，不重新同步或激活，企业 Agent/Skill 不进入 Runtime Registry/Prompt，企业 Model/Central Tool 不可调用；历史 Task/Audit 保留，离线企业执行和纯本地个人模式继续后置。
- 根包、Contracts、Core 与 Desktop 进入 `0.0.0-dcf.1.0`；Central Service 进入 `0.0.0-cgf.1.0-SNAPSHOT`。DCF-1.0 Node 全量 56 files / 413 tests 通过；CGF-1.0 Java 21 编译与 ADR-014 接受仍待完成，不得据此解锁 1.1。
- DCF-1 与 CGF-1 两份方案转为 `CONFIRMED_WITH_SPECIFIED_REVISIONS`；Desktop/Enterprise 两份已接受 Contract 同步写入一致性约束。8～12 日和 12～18 日仅为主开发流工作量，PM 日历按 1.5～2 倍窗口管理，不构成 SLA。
- DCF-0/CGF-0 以及 `0.0.0-cgf.0.1-repair.1` Java Toolchain 收口分别完成独立 QA `PASS` 并关闭；DCF-1.1/CGF-1.1 正式业务机制仍按批次前置门槛锁定。
- 根包、Contracts、Core 和 Desktop 进入 `0.0.0-dcf.0.1`；Central Service 独立进入 `0.0.0-cgf.0.1-SNAPSHOT`。两批均为非语义 Foundation，不解锁 DCF-1+/CGF-1+。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.5.3`；KAF-4 `v1alpha2` 和 KAF-5 四领域 `v1alpha1` 保持不变，SQLite schema 仍为 migration 6。
- 根包、Contracts 与 Core 进入 `0.0.0-kaf.5.2`；Model Protocol 继续为独立 `v1alpha1`，原最小 Fake ModelRequest 升级为 strict provider-neutral 请求，SQLite schema 保持 migration 6。
- 根包、Contracts 与 Core 进入 `0.0.0-kaf.5.1`；公共新领域版本继续为各自 `v1alpha1`，SQLite schema 从 migration 5 连续升级为 migration 6。
- `0.0.0-kaf.5.0` 进入内部 5.0b Persistence Spine；公共 Contract 版本不变，SQLite schema 从 migration 4 连续升级为 migration 5，schema preflight 增加完整 migration history、必需索引和 partial unique index 校验。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.4.3`；公共 Contract 继续为 `v1alpha2`，SQLite schema 继续为 migration 4，现有 WAL、`busy_timeout=5000`、`synchronous=FULL` 和原子事务语义未因性能数字而放宽。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.4.2`；ToolExecutionService 强制经过 admission，且只在 KAF-4.1 Authorization audit 通过后、Effect Intent 前占用 Tool/Adapter slot。Tool AdapterDescriptor 可声明更窄的 `maxConcurrency`，Process Echo 固定为单飞行并移除 Adapter 内部无界 Promise tail。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.4.1-repair.1`；该修复批次不占用或提前实现 KAF-4.2，只收敛 KAF-4.1 首轮独立 QA 的审计、敏感摘要和自动化覆盖问题。
- 上游登记新增 OpenClaw SQLite schema preflight 与事务后发布候选；KAF-2 继续以 OpenHands EventLog 和 LangGraph Checkpoint/Conformance 为主要参考。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.2.1`；KAF-2.1 只交付持久化基础，Durable Runtime、Outbox Dispatcher 与 Effect Recovery 留到后续批次。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.2.2`；Application 层接管持久 Command，Kernel reducer 继续保持纯函数，Effect/uncertain 恢复仍留在 KAF-2.3。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.2.3`；无法确认的 dispatched Effect 只能收敛为 `uncertain + waiting/external_dependency`，真实 Tool/Worker 和人工核对 UI 继续后置。
- KAF-3 原通用 `ExecutionBackend` 收窄为 `ToolExecutionBackend`；首批 Port 限定为 ModelProvider、ToolCatalogProvider、ToolExecutionBackend，CredentialResolver 与 EventPublisher 不借本阶段扩张。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.3.1`；本批只实现 Capability Contract 与不可变 Registry，Resolver、Typed Tool Port、持久 Task Lock 和进程外 Echo 保留给 KAF-3.2/KAF-3.3。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.3.2`；本批保持 Fake-only 与进程内验证，真实进程、MCP、CredentialResolver 扩张、自动 failover 和真实模型继续留在 KAF-3.3 或后续阶段。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.3.3`；ToolExecutionRequest 复用 `effectAttemptId + idempotencyKey` 并由进程 Adapter 为每次传输生成新 `requestId`，不新增 Effect 状态或公共 Runtime Handle Contract。
- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.4.1`；公共 Contract 升级为 `v1alpha2`，旧持久版本只在显式读取边界兼容，新 Authorization Contract 不接受旧版本写入。

### Fixed

- 修复 KAF-4.1 Authorization 审计缺口：允许与拒绝现在都在 Effect `prepared` 前形成版本化 Event/Outbox，记录用户、配置、锁定能力路径、availability、风险、Action 与授权上下文的稳定 revision/digest；sequence conflict 有界重试，审计仍无法持久时显式失败关闭且不创建 Effect。
- Confirmation `displaySummary` 改为由 typed scope 生成的固定安全枚举，调用方不能把 Token、Prompt、正文或任意目标展示文本写入 Confirmation persistence、Event 或 Outbox；并补齐危险操作、external scope 漂移、请求冲突、并发决定、prepared 前失效及 SQLite confirmed/rejected 重启恢复回归。
- Claude Code 首次在 Node 24.13.0 完成独立 QA 且无 engine warning，关闭贯穿 KAF-0.1 至 KAF-1.1 的 `P3-ENV-001` 环境差异。

### Removed

### Security

- 设备私钥不得进入 EnterpriseCredentialStore resolve 结果、网络 Contract、Fixture 或日志；Local 只能通过 `getDeviceKeyId/getPublicKey/sign(challenge)` 使用不可导出密钥，Central 必须验证单次 Challenge、登记公钥、撤销和当前合规状态，不能只信任 `deviceKeyId` 或客户端 `deviceId`。
- Java 工具链发现拒绝错误 major 和不完整 JRE，禁止在工程脚本中硬编码 `/private/tmp` 或用户目录；Maven 只在已验证的 JDK 21 环境中启动。
- DCF-0 Renderer 保持 sandbox、context isolation、无 Node integration、无直接网络连接；一次性启动令牌只通过受控子进程 IPC 交付。CGF-0 默认只监听 loopback 随机端口，所有返回均标记为 Fixture 且禁止缓存。
- KAF-4.2 admission 满载、排队取消和 deadline 均在 Effect 前失败关闭；任何 success/failure/cancel/timeout/throw 路径通过 `finally` 回收 slot，Process Echo 被绕过 admission 时拒绝并发请求。通用 RetryCoordinator 不依赖 Effect/Tool Backend，已经 dispatched 或 uncertain 的副作用仍只遵守 ADR-007 recovery mode。
- Authorization audit 持久化成为 Effect 前强制 Gate；任何 allowed audit 失败都阻止 Effect Intent，denied audit 不再静默吞掉 Persistence 错误。
- Confirmation Event/Outbox 只保存由 typed scope 生成的固定安全摘要，拒绝 caller-controlled secret-like 文本。
- Process Echo 仅以 `process.execPath + 固定构建产物`、`shell:false` 和最小环境启动；只接受 `tool.echo`，stdout/stderr 与 NDJSON 帧均有界，协议版本、request/effect/action 关联失败关闭。
- 固定授权采用 `DENY > USER_CONFIRMATION > ALLOW`，确认不能覆盖 Tool 权限、Workspace 越界、未知风险或 unavailable；Confirmation Contract 不保存 Secret、正文、PID 或 Runtime Handle。

## [0.0.0-kaf.1.1] - 2026-07-20

### Added

- 接受 ADR-005 并记录 KN-004，冻结 AgentDefinition/TaskRunState 分离、Task/Run/Step 单写入者、Retry 新 Run、显式 waiting/resume、Cancellation 与 Deadline 语义。
- 新增 `v1alpha1` Runtime Contract、JSON-safe Action/Observation、纯状态 reducer 和每 Task 串行 mailbox，并以确定性测试覆盖非法转换、并发双写、迟到 Observation、Retry、Cancellation 与 Deadline。

### Changed

- 根包、Contracts 与 Core 开发版本进入 `0.0.0-kaf.1.1`；KAF-0.2 经独立 QA PASS 后作为内部工程基线关闭。
- KAF-1.1 经独立 QA `PASS`，8 个测试文件、45 项测试、边界检查和 Core smoke 全部通过，作为内部 Runtime Kernel 基线接受。

## [0.0.0-kaf.0.2] - 2026-07-20

### Added

- 建立最小 Monorepo 工程骨架和 Codex、Claude Code 共用的变更记录机制。
- 新增架构关键节点日志及工程 README 导航，固化 MVP 能力平台定位、扩展与版本模型、动态 ExecutionPlan、安全策略和副作用恢复原则，并区分已确认内容与后续待决事项。
- 新增产品与架构基线 v1.0（`docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md`），统一产品定位、Tool/Skill/Agent Role 能力模型、MVP 范围与三大验证场景的边界与验收，并与 `docs/architecture/KEY-NODES.md` 形成阶段共识；同步在 product/architecture/README 与工程根 README 的“文档与决策入口”登记索引。
- 新增开发前架构收敛包：经纠错的开源 Agent 借鉴映射、首批 ADR 草案及 Kernel Alpha 范围与验收方案。
- 冻结 Kernel Alpha 四项启动决策：All-in-One Local 与企业演进边界、File/Workspace Grant、本地渐进式 KA-0～KA-2 里程碑，以及 TypeScript/Electron/Vue/Node.js/SQLite 技术栈；同步记录为 `KN-002` 和 `ADR-001`～`ADR-004`。
- 固化 KA-0 `Kernel Framework First，Chat Last` 开发计划和上游借鉴登记机制，并启动 KAF-0：建立 TypeScript Monorepo 检查链、`v1alpha1` Contract Schema、Core Lifecycle/Health、Fake Model/Persistence Adapter、Conformance Test 与架构依赖护栏；首批实现均按固定上游登记为设计重写，没有复制上游源码。
- 建立开发版本与交叉验收记录机制：首个记录版本为 `0.0.0-kaf.0.1`，README 展示当前状态与验证命令，每批代码在 Development Log 记录范围、上游来源、自测、缺口和独立 QA 报告，并将相同要求写入 Codex/Claude Code 工程入口。
- 正式接收 Claude KAF-0.1 QA 新增的 ConsoleLogger 数组、深层嵌套与循环引用脱敏回归测试，纳入 KAF-0.2 持续测试基线。

### Changed

- KAF-0.2 将 Core Lifecycle 与 Core Runtime 移入真实 `services/core/src/kernel/` 边界，`bootstrap` 只保留装配；边界检查改用 TypeScript AST 覆盖静态导入、export-from、import-equals、动态 import、require、多种 JS/TS 扩展名和相对路径越界，并在目标目录缺失或无源码时失败关闭。
- 将开发运行时固定为 Node 24：增加 `.node-version`，并把 `engines.node` 限定在 24.x，避免开发、自测和独立 QA 使用不同运行时基线。

- 新增独立 QA 验收 Skill `independent-qa-acceptance`，供 Claude Code 在 Codex 或其他开发 Agent 完成后进行独立质量验收，明确验收模式与修复验证模式边界，禁止第一轮测试修改产品业务代码。
- 修正 `independent-qa-acceptance` 落地位置：最终在工作区根 `.claude/skills/independent-qa-acceptance/`，撤销 RoboThree_workspace 内的副本；阶段 0–1 同步采用以下规则——引入 `PROJECT_ROOT` 与 `CODE_ROOT` 双层根：`PROJECT_ROOT` 默认派生 = `${CLAUDE_SKILL_DIR}/../../..`（向上 3 级），`CODE_ROOT` 默认派生 = `${PROJECT_ROOT}/RoboThree_workspace`（实际代码仓，所有构建/测试/Lint 命令在此执行）；`PROJECT_ROOT` 解析 5 级优先级（用户参数 → `ROBOTHREE_ROOT` → `${CLAUDE_SKILL_DIR}/../../..` → `${CLAUDE_PROJECT_DIR}` → `pwd`），`CODE_ROOT` 解析 3 级优先级（`--code-root` 参数 → 默认派生 → 用户声明"无代码层"）；删除 `$0` 推断，改用 `${CLAUDE_SKILL_DIR}` 相对计算；Git 检测改用 `git rev-parse --show-toplevel` 与 `PROJECT_ROOT` 比较（兼容 `.git` 为 worktree 文件）；未初始化 Git 时**默认跑基础门禁 + 要求用户确认功能范围**，mtime 仅作辅助线索，不作为发布验收依据；扫描排除列表（`node_modules` / `dist` / `build` / `out` / `qa-reports` / `.claude` / `robothree-agent-research/sources/**` 等）；调用语法支持 `/independent-qa-acceptance <project-root> [--code-root <path>] [--scope <range>]`；frontmatter 加 `argument-hint` 与 `disable-model-invocation: true`，description 改为精确显式触发；测试类别拆三档（基础门禁 / 风险相关 / N/A）；报告改为按 `<RUN_ID>/` 嵌套目录；验收模式禁止自动装包 / 动 package.json / lockfile / 测试配置；破坏性 / 压力 / 长时间 / 付费测试需用户明确授权 + 隔离环境；最低 Claude Code 版本要求 v2.1.196。
- 接入 Codex 开发记录系统：`docs/development/DEVELOPMENT-LOG.md` 作为 RoboThree 项目验收基线的首要输入；新增 `--scope version:<dev-version>` 显式锁定开发版本（推荐路径）；自动识别 `READY_FOR_INDEPENDENT_QA` 状态的最新版本作为默认 scope；验收基线由"DEVELOPMENT-LOG 的独立 QA 建议范围 + 已知缺口 + 自测命令 + Skill K 段 + 基础门禁 A 段"组成；RoboThree 项目主报告路径改为 `${CODE_ROOT}/docs/development/qa/<version>-claude-qa.md`（Codex 命名规范），证据归档到 `${CODE_ROOT}/qa-reports/<RUN_ID>/evidence/`；同版本重复运行必须用 `-retest-N` 后缀追加到原报告；新增 L11–L18 验收项强制 DEVELOPMENT-LOG 联动；触发条件放宽，加入"测试一下 RoboThree / 验收 RoboThree 当前 / 最新 / 阶段 X 代码 / 对 0.0.0-kaf.X.Y 做 QA"等 RoboThree 专属触发短语。

### Fixed

- `0.0.0-dcf.1.2b-repair.2` 修复用户现场演示发现的 Workspace Picker 请求
  冲突：Renderer 不再把通用命令元数据中的 `contractVersion` 传入冻结的
  五字段目录选择请求，而是通过显式安全 Projection 只输出 `commandId`、
  `correlationId`、`clientInstanceId`、`displayName` 和 `accessMode`。新增
  请求形状回归测试，完整门禁 82 files / 527 tests 通过；不放宽 Preload/Main
  strict Contract，也不解锁 DCF-1.2C。用户随后重新现场验证目录授权、
  Session/Message 持久化和应用重启恢复均通过，repair.2 当前只等待独立 QA。
- `0.0.0-dcf.1.2b-repair.1` 修复用户现场演示发现的 Electron 沙箱 Preload
  无法加载：Preload 从 `tsc` 直接输出的 ESM `.js` 改为 Vite/Rollup 生成的
  单文件 CommonJS `.cjs`，Main 只引用该生产 bundle；新增构建产物回归测试和
  真实隐藏 Electron 沙箱 smoke，验证 `robothreeDesktop v1alpha1`、Runtime
  Status 与 Desktop Event API 均成功注入。完整门禁 81 files / 526 tests 通过；
  DCF-1.2C、DCF-1.3 与 CGF-1.3 均未解锁。
- 修复 KAF-0.1 独立 QA 报告中的三项 P3：Node 环境不一致、架构边界规则可被多种模块加载形式绕过，以及 Kernel 规则因目标目录不存在而空跑；同时排除 `qa-reports/` 证据目录参与产品 Lint，并确保 clean 删除源码迁移前遗留的陈旧构建产物。

### Removed

### Security

## 更新触发规则

以下改动在交付前必须更新 `Unreleased`：

- 新增、修改或删除产品功能及源代码。
- 修改公共协议、API、数据结构或模块边界。
- 修改依赖、构建、部署、环境配置或数据库迁移。
- 修复缺陷、安全问题或重要性能问题。
- 作出会影响后续开发的架构决定。

以下情况通常不需要单独记录：

- 仅格式化、改正错别字或调整注释。
- 临时调试和未保留在工程中的实验。
- 只为补充本文件而产生的修改。

## 记录规范

- 一个逻辑变更写一条，描述结果和影响，不罗列操作步骤。
- 优先标明影响范围，例如 `desktop`、`core` 或 `contracts`。
- 同一任务修改多个文件时合并记录，避免把提交列表复制进来。
- 发版时把 `Unreleased` 内容移动到 `## [x.y.z] - YYYY-MM-DD`，再建立空的 `Unreleased` 分类。
