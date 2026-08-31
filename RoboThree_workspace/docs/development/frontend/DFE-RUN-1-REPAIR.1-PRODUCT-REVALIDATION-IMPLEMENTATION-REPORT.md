# DFE-RUN-1 repair.1 产品复验修订实施报告

## 1. 状态

- 日期：2026-08-29
- Desktop 版本：`0.0.0-dfe.run.1.repair.1`
- 状态：`IMPLEMENTED / DEVELOPER VERIFICATION PASS / PRODUCT RE-ACCEPTANCE AND INDEPENDENT QA PENDING`
- 关闭纪律：产品复验、独立 QA 和用户接受完成前不得写为 `PASS/CLOSED`

## 2. 修订结果

### 2.1 P1

- 历史专项机器人从目录消失后继续保持空选择和禁用提交，不静默替换；新增显式“使用通用机器人”操作，只有用户
  执行后才解除失效状态，提交链路继续由既有 Adapter 映射为 `agent.general`；
- 侧栏和任务页删除两套互不相通的置顶集合，统一使用进程内 `TaskPinStore`，以 `taskId` 为唯一键；本次运行内任一
  入口置顶或取消后，两个位置立即同步，不使用 LocalStorage 冒充持久化。

### 2.2 P2 与 P3

- 用户菜单由原生 `details` 改为受控弹层，路由切换、侧栏折叠或点击外部均关闭；
- 900×600 下智能中心统计保持三列紧凑摘要，主体内容不再被三张全宽卡片推离首屏；
- 任务详情不再提供返回中央任务列表的第二导航路径；侧栏改变任务路由时，详情页失效旧工作空间请求并加载新任务；
- 设置与知识中心面向用户的文案改为中文业务表达；
- 创建机器人初始空表单不显示错误，字段失焦后才显示校验；四个能力按钮补齐 `role="switch"` 和
  `aria-checked`；
- 任务操作面板选择器改为“面板内容”，工作空间按钮使用文件夹语义图标。

## 3. 安全与范围

- 业务实现仅修改 `apps/desktop/src/renderer/**` 与 `apps/desktop/tests/**`；
- 收口窗口只同步 `apps/desktop/package.json`、DTP-4 audit 版本基线、两个既有 Core 测试的 Desktop 版本断言及
  CHANGELOG/README/DEVELOPMENT-LOG/本报告；
- 未修改 Main、Preload、IPC、Contracts、Core 生产代码、Central、SQLite migration、依赖或 lockfile；
- 未增加真实 Key、完整路径、请求摘要、LocalStorage 或假成功语义。

## 4. 验证

- focused Renderer：`14 files / 70 tests PASS`；
- Desktop 全量非沙箱：`65 files / 280 tests PASS`；
- 全仓 Vitest 非沙箱：`328 files / 2191 tests PASS`；
- Desktop build：`PASS`；
- Renderer/tests ESLint：`PASS`；
- offline frozen install：`PASS`；
- DTP-4 audit 与 audit tests：`PASS`；
- Electron 诊断截图覆盖 Workbench、Tasks、Intelligence 的 1180×760 与 900×600 六个场景，`body` 与主内容
  `scrollWidth === clientWidth`；900×600 智能中心统计保持三列紧凑摘要。诊断不加载真实 Preload，只证明布局；
- lockfile 修订前后 SHA-256：`5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
- 全仓 lint 的 Architecture boundary 仍被并行个人模型窗口已有的
  `apps/desktop/src/renderer/adapters/settings-adapter.ts: rootRealPath must not enter Renderer/Preload safe views`
  命中阻断；该命中位于安全错误过滤正则，本批没有修改该文件，也没有放宽全局扫描。

## 5. 待验收

- 产品复验两项 P1 的真实 Electron 交互；
- 900×600 智能中心首屏、用户菜单关闭、任务置顶同步和机器人表单错误时机；
- Claude Code 独立代码 QA；
- 用户接受后方可关闭 DFE-RUN-1 repair.1。
