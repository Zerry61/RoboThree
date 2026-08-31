# DFE-RUN-1 Desktop Local Trial Run / UX Repair 实施报告

## 1. 状态

- 日期：2026-08-28
- Desktop 版本：`0.0.0-dfe.run.1`
- 状态：`IMPLEMENTED / DEVELOPER VERIFICATION PASS / PRODUCT RE-ACCEPTANCE AND INDEPENDENT QA PENDING`
- 关闭纪律：产品复验、独立 QA 和用户接受完成前不得写为 `PASS/CLOSED`

## 2. 目标与边界

本批依据 DFE-RUN-1 客户端产品体验综合验收报告修复本地试运行中的信息架构、任务创建、任务详情和中文产品
文案问题。只消费现有 Desktop API/Projection，不新增后端能力。

明确未进入：

- 打包、installer 和正式发布；
- Main、Preload、IPC、Contracts、Core、Central 或 SQLite migration；
- LocalStorage 或本地数组业务持久化；
- 个人模型 CRUD、Knowledge Provider、Skill 创建后端或其他仍受门禁约束的能力。

## 3. 实现结果

### 3.1 导航与任务入口

- 一级导航固定为“新建任务 / 智能中心 / 知识中心”；
- 左侧栏使用现有只读接口展示置顶任务、项目空间和最近任务；
- 无置顶持久化接口时只保留内存状态，并持续显示“本次运行”；
- 设置从左下角用户菜单进入，不占一级导航。

### 3.2 新任务

- 专项机器人变为可选；未选择时提交稳定的 Core 内置 `agent.general`；
- 企业机器人目录为空不阻断，页面提示“未选择专项机器人，将使用通用机器人”；
- 没有可用模型、历史机器人不可运行或历史机器人消失时继续失败关闭，不静默换成其他机器人；
- Skill 和 Knowledge 仍为显式选择，清空后保持空集合；
- 输入框、资源选择、模型、Max 和操作确认信息围绕主输入区组织。

### 3.3 任务详情与操作面板

- 页面改为任务导航、对话、右侧操作面板三部分，不再同时铺设独立横向任务列表和详情；
- 进度、Tool 活动、成果与工作空间文件进入右侧面板；
- 面板支持“概览 / 工作空间文件”切换、多个成果标签、收起、恢复、全屏和文件夹定位；
- 二进制成果无法内嵌时显示页面级说明，不伪装预览成功；
- 打开任务只在真实详情加载成功后反馈；删除文案明确消息永久删除且不可恢复，但不删除成果和工作空间文件，
  非终态任务继续禁止删除。

### 3.4 智能中心与创建页

- 机器人使用“全部 / 我创建的”，技能使用“技能广场 / 已安装 / 本地目录 / 我创建的”，工具不设置虚假分类；
- 创建入口按当前 Tab 区分，未接通能力保持诚实不可用；
- 机器人创建空选择显示“尚未选择（0项）”，简介字段使用中文业务语言；
- 技能创建只展示“技能名称 / 描述 / 技能主要功能”，第二阶段不伪造生成文件、测试、发布或保存成功；
- 清理普通用户界面中的 Catalog、Projection、GATED、Desktop/Core、Capability ID 等工程术语。

## 4. 修改范围

- `apps/desktop/src/renderer/**`
- `apps/desktop/tests/**`
- `apps/desktop/package.json`
- `scripts/audit-dtp4-packaging.mjs`
- `scripts/audit-dtp4-packaging.test.mjs`
- `services/core/tests/dfi5.4.2-boundary.test.ts`（仅同步 Desktop 开发版本断言）
- `services/core/tests/dfi5.4.3a-boundary.test.ts`（仅同步 Desktop 开发版本断言）
- `docs/product/PRD-ROBOTHREE-MVP.md`
- `docs/product/FRONTEND-EXPERIENCE-SPEC-v1.0.md`
- `CHANGELOG.md`
- `README.md`
- `docs/development/DEVELOPMENT-LOG.md`
- 本实施报告

## 5. 开发者验证

- focused Renderer tests：`16 files / 76 tests PASS`
- Desktop build：`PASS`
- 非沙箱全仓 TypeScript/Vitest：`328 files / 2190 tests PASS`
- 全仓 ESLint：`PASS`
- DTP-4 packaging audit 及 audit tests：`PASS`（`1 file / 2 tests`）
- offline frozen install：`PASS`
- Core、Desktop foundation、Desktop preload 三项 smoke：非沙箱 `PASS`
- 沙箱内 Desktop 全量：`60/65 files、269/279 tests PASS`；其余 10 项均为 loopback/Core 子进程权限限制，
  同一批测试已包含在上述非沙箱全仓 `328/2190 PASS` 中；
- 视觉诊断：Workbench、Tasks、Intelligence 各覆盖 1180×760 与 900×600，六个场景均无水平溢出；
- 视觉诊断未加载真实 Preload，故只证明布局、错误态和响应式约束，不作为真实业务链路成功证据；
- lockfile 编码前后 digest 均为 `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
- 完整 `pnpm run check` 在 lint 阶段被并行个人模型窗口现存的
  `apps/desktop/src/renderer/adapters/settings-adapter.ts: rootRealPath must not enter Renderer/Preload safe views`
  提前阻断。本批未修改该文件；因此不把本批 focused/full test PASS 扩大为 root check PASS。

## 6. 残余门槛

- 产品按最新原型复验本报告覆盖的交互和文案；
- Claude Code 对前端范围、真实能力边界、重复刷新选择语义、900×600/1180×760 布局及全量门禁做独立 QA；
- 仍缺少的后端业务能力继续按各自批次门禁推进，本批不以 Mock 替代。
