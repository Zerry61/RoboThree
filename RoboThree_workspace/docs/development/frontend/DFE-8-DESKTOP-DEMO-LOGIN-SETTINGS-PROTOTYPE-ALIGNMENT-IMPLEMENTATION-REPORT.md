# DFE-8 Desktop Demo Login And Settings Prototype Alignment Implementation Report

> 日期：2026-08-30  
> 状态：**PRODUCT RE-ACCEPTANCE PASS / USER ACCEPTED / INDEPENDENT QA PENDING / NOT CLOSED**  
> 上游：[DFE-8.0 Revision 1](./DFE-8.0-DESKTOP-DEMO-LOGIN-SETTINGS-PROTOTYPE-ALIGNMENT-PLAN.md)

## 1. 交付结果

DFE-8B 与 DFE-8A 已按用户授权顺序完成：

- 显式 `local_demo` 模式注册 `#/login`，使用公开演示账号 `admin / 123456` 和 Renderer 内存会话；
- 非演示模式不注册登录路由、不安装账号密码守卫；
- 用户菜单在演示模式显示“管理员 · 本地演示”和退出入口，设置导航固定为四页；
- 模型管理复用既有企业/平台模型与 Personal Model 只读 Projection，不提供 Key、测试连接或 mutation 表单；
- 个性化与个人记忆仅在演示模式支持本页预览，离开页面即清除，不进入任务配置或持久化；
- 正式问题反馈页只展示字段结构和禁用原因，不读取截图、不提交、不伪造成功；
- `#/settings/identity` 仅保留到模型管理的隐藏兼容重定向，不构成第五个设置页面。

## 2. 主要文件

新增：

- `apps/desktop/src/renderer/app/runtime-mode.ts`
- `apps/desktop/src/renderer/app/demo-auth-session.ts`
- `apps/desktop/src/renderer/pages/auth/LoginPage.vue`
- `apps/desktop/src/renderer/adapters/personal-model-settings-adapter.ts`
- `apps/desktop/src/renderer/pages/settings/SettingsPageFrame.vue`
- `apps/desktop/src/renderer/pages/settings/SettingsPersonalizationForm.vue`
- `apps/desktop/src/renderer/pages/settings/SettingsMemoryEditor.vue`
- `apps/desktop/src/renderer/pages/settings/SettingsFeedbackForm.vue`
- `apps/desktop/tests/demo-auth-session.test.ts`
- `apps/desktop/tests/login-page.test.ts`
- `apps/desktop/tests/personal-model-settings-adapter.test.ts`

调整：Renderer 路由/bootstrap、DesktopShell、设置四页、设置 Presentation/ViewModel 及对应 Desktop tests。

## 3. 安全与诚实边界

- 演示会话不写 `LocalStorage`、`SessionStorage`、`IndexedDB`、SQLite、Main、Preload、Core 或 Central；
- 用户实际输入的密码不进入日志、埋点或 QA Evidence；固定公开演示账号允许出现在帮助文案和开发截图；
- 页面不直接访问 `window` Desktop API，Personal Model 经注入 Adapter 消费既有安全只读 API；
- Markdown 预览只使用 Vue 文本插值，不使用 `v-html` 或 `innerHTML`；
- 不声明企业认证、真实个性化、真实 Memory Store、反馈提交或 Personal Model mutation/reveal 已完成。

## 4. 开发者验证

- focused：`11 files / 42 tests PASS`；
- Desktop build：PASS；
- workspace TypeScript build：PASS；
- workspace ESLint：PASS；
- Renderer/tests ESLint：PASS；
- Architecture boundary：PASS；
- `audit:dtp4`：PASS；
- `git diff --check`：PASS；
- 视觉与交互：`1180×760`、`900×600`、`680×560` 均无水平溢出；`900×600` 设置保持双栏，
  `680×560` 切单栏；窄窗头像按钮、设置入口和退出登录均已在打包态验证；
- lockfile：本批最终零 diff，当前 SHA-256 为
  `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；该 digest 来自已关闭的
  ADMIN-MVP-VS1 共享依赖窗口，本 repair 未修改 lockfile。

### 4.1 Repair.1：窄窗用户菜单

- `DesktopShell` 不再因视觉收起或 `max-width: 760px` 删除整个用户菜单；紧凑模式只隐藏用户名，始终保留带
  可访问名称的头像按钮；
- 紧凑菜单向主内容区展开，避免 68px 侧栏内裁切；
- 新增 `680px` 回归：显式收起后头像仍可打开菜单，设置路由可达，退出登录清除演示会话并返回登录页；
- 打包态 `680×560` 实测菜单范围为 `x=65..233`，设置页无水平溢出，退出后 `#/login` 可见。

### 4.2 可复现 focused 命令

```bash
node node_modules/vitest/vitest.mjs run \
  apps/desktop/tests/renderer-workbench-boundary.test.ts \
  apps/desktop/tests/demo-auth-session.test.ts \
  apps/desktop/tests/login-page.test.ts \
  apps/desktop/tests/personal-model-settings-adapter.test.ts \
  apps/desktop/tests/settings-section-model.test.ts \
  apps/desktop/tests/settings-section-nav.test.ts \
  apps/desktop/tests/settings-model-page.test.ts \
  apps/desktop/tests/settings-capability-gate-page.test.ts \
  apps/desktop/tests/renderer-router.test.ts \
  apps/desktop/tests/desktop-shell.test.ts \
  apps/desktop/tests/design-system-components.test.ts \
  --maxWorkers=1
```

结果固定为：`11 files / 42 tests PASS`。

### 4.3 正确的 local_demo 打包态预览

```bash
cd apps/desktop
CI=true VITE_ROBOTHREE_RUNTIME_MODE=local_demo node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4319
```

验收入口：`http://127.0.0.1:4319/#/login`。不得使用未设置 `VITE_ROBOTHREE_RUNTIME_MODE=local_demo` 的标准构建，
也不得用受 CSP 影响的 Vite 开发态页面替代视觉证据。

## 5. 共享工作区门禁说明

共享工作区中的 Admin 联合批次已将 Desktop 与 audit 基线推进到 `0.0.0-mvp.admin.vs1`，并已正式关闭；本批未覆盖
其版本或 lockfile。DFE-8 repair.1 只修改 Renderer shell、Desktop test 与对应治理记录。

`CI=true pnpm install --frozen-lockfile --offline` 最终 PASS。首次离线重建因本机 store 缺少 `yaml-2.9.0.tgz` 等
tarball 中止；按同一 frozen lockfile 恢复依赖后再次离线执行为 `Already up to date`，lockfile 未被改写。

完整 `CI=true VITEST_MAX_WORKERS=1 pnpm run check` 取得 `319 files / 2230 tests PASS`，另有
`28 files / 66 tests FAIL` 和 1 个未处理的 loopback `EPERM`。失败面为沙箱 loopback、isolated Keychain，以及并行
Core 历史版本/消费者白名单断言；构建、lint 和 Architecture boundary 在进入全量 Vitest 前均 PASS。DFE-8 focused
与 Renderer boundary 回归保持全绿，不将该环境结果冒充完整 release gate PASS。

## 6. 未解锁能力

企业 SSO/RBAC、正式身份系统、真实个性化注入、真实 Memory Store、反馈接收系统、Personal Model 添加/编辑/删除/
设为默认/凭证查看，以及任何 Main、Preload、IPC、Contract、Core、Central 或 migration 扩展继续 GATED。
