# DFE-8.0 Desktop Demo Login And Settings Prototype Alignment Plan

> 状态：**IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING / USER ACCEPTANCE PENDING**  
> 日期：2026-08-30  
> 负责人：Codex 5.6  
> 产品来源：`PRD-ROBOTHREE-MVP.md`、`FRONTEND-EXPERIENCE-SPEC-v1.0.md`、`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md`、最新客户端原型 `原型文件/客户端/index.html`  
> 范围：显式 `local_demo` 模式下的 Desktop 本地演示入口；设置中的模型管理、个性化、个人记忆和问题反馈四页字段、布局与诚实状态对齐  
> 非目标：不实现企业 SSO/RBAC、真实个性化注入、真实 Memory Store、真实反馈接收系统，不新增或修改 Main、Preload、IPC、Contract、Core、Central、migration、依赖或 lockfile

## 1. 目标与关闭口径

本方案解决两个明确的客户端体验缺口：

1. Desktop 启动后缺少可演示的登录入口；
2. 设置四页仍以工程化 GATED 说明页为主，与已确认客户端原型的字段和布局差距较大。

用户路径冻结为：

```text
以 local_demo 模式启动 Desktop
→ 进入本地演示入口
→ 使用 admin / 123456 登录
→ 进入新建任务
→ 用户菜单进入设置
→ 在模型管理 / 个性化 / 个人记忆 / 问题反馈四页间导航
```

DFE-8.0 Revision 1 已通过产品聚焦差异复核，用户随后一次授权并按以下顺序实施：

- `DFE-8B`：设置四页原型对齐与既有真实只读数据消费。
- `DFE-8A`：显式 `local_demo` 模式的演示入口与 Renderer 内存会话。

DFE-8A/8B 完成后，只能声明“本地演示登录和设置页面体验完成”。不得声明企业认证、真实个性化、真实记忆、
真实反馈或 Personal Model mutation 已完成。

## 2. 事实优先级与原型差异

实施时使用以下优先级：

```text
已接受 Contract / 安全边界
> PRD / 专项 Feature Spec
> Frontend Experience Spec
> 最新客户端原型的布局和交互形式
> 临时实现假设
```

原型仅作为布局和交互参考，以下原型内容不得原样进入生产语义：

| 原型内容 | 正式冻结语义 |
| --- | --- |
| 个人模型只有一个“模型名称” | 拆为“模型标识”和“显示名称”两个字段 |
| Provider 为 OpenAI 兼容/Moonshot/Anthropic/其他 | 固定为 DeepSeek/智谱/Kimi/自定义 |
| 提供“测试连接” | Desktop 个人模型不提供测试连接 |
| 本地数组模拟保存、删除、设为默认 | 没有真实能力时禁用并显示原因，不伪造成功 |
| 个性化/记忆 Toast 声称“已保存（演示）” | 只允许本页预览，不使用“保存成功/已生效”文案 |
| 反馈定时器模拟“提交成功” | 生产默认不得模拟提交成功；成功/失败只进 Fixture 测试 |
| 示例个人模型、示例记忆像真实用户数据 | 生产默认不展示虚构用户事实；示例只进开发视觉场景和测试 Fixture |

## 3. DFE-8A 显式本地演示入口

### 3.1 页面与路由

仅当构建或启动时显式满足：

```text
VITE_ROBOTHREE_RUNTIME_MODE=local_demo
```

才注册：

```text
#/login
demoRouteNames.login = "login"
meta.chrome = false
meta.guestOnly = true
```

`#/login` 不进入所有构建共用的 `productionRouteNames`，非 `local_demo` 模式不注册登录路由、不安装 Renderer
账号密码守卫，继续按现有产品入口启动。该模式值不是 Secret，也不得作为任何业务权限事实。

演示入口不显示 DesktopShell。页面使用居中的进入表单，包含：

- RoboThree 标识和“进入本地演示”标题；
- 账号输入框；
- 密码输入框；
- 显示/隐藏密码图标按钮；
- “进入演示环境”主按钮；
- 持续可见的说明：“本地演示登录，不代表企业身份认证”；
- 演示账号提示：`admin / 123456`。

不使用“登录成功”“身份认证通过”等正式认证语言，也不增加“注册”“忘记密码”“记住我”“短信验证码”、
“第三方登录”或企业 SSO 假入口。

### 3.2 演示账号语义

固定账号：

```text
username = admin
password = 123456
displayName = 管理员
sessionKind = local_demo
```

这组值是公开测试 Fixture，不是 Secret。验证只发生在 Renderer 内存中；成功后立即清空密码字段。不得写入：

```text
LocalStorage / SessionStorage / IndexedDB
SQLite
Main / Preload / Core / Central
日志 / 埋点 / QA Evidence（固定公开演示账号的帮助文案和开发截图除外）
```

### 3.3 会话与导航

新增 Renderer-only `DemoAuthSessionStore`，通过 Vue InjectionKey 提供默认实现和测试 Fake：

```ts
type DemoAuthSessionStore = {
  readonly session: Readonly<Ref<DemoAuthSession | null>>;
  signIn(username: string, password: string): DemoSignInResult;
  signOut(): void;
};
```

规则：

- 应用每次冷启动默认未登录；
- 仅在 `local_demo` 模式下，未进入演示时访问业务路由，保存白名单内的安全目标后跳转 `#/login`；
- 进入演示环境后回到原目标；没有原目标时进入 `#/workbench`；
- 已登录访问 `#/login`，重定向到 `#/workbench`；
- 用户菜单显示“管理员 / 本地演示账号”和“退出登录”；
- 退出登录清空内存会话并回到 `#/login`；
- Renderer reload 或 Electron 重启后重新登录，不伪造持久会话；
- route guard 只是 `local_demo` 体验门禁，不是安全边界，不能作为 Main/Core 权限判断依据；
- 非 `local_demo` 模式不安装该 guard，也不执行 Renderer 固定账号校验。

允许保留的 deep link 目标固定为：

```text
workbench
tasks（仅安全的 sessionId/taskId query）
intelligence 及三个真实详情 route（仅已验证资源 id）
knowledge 及 knowledge detail（仅已验证 knowledge id）
settingsModels / settingsPersonalization / settingsMemory / settingsFeedback
```

不得保留 `login`、`legacy`、`__design-system`、未知 route、未知 query 或任意 URL 字符串。校验失败统一回到
`workbench`。

### 3.4 登录状态矩阵

| 状态 | 页面行为 |
| --- | --- |
| Idle | 账号默认填入 `admin`，密码为空，“进入演示环境”按钮可用 |
| Invalid | 保留账号、清空密码，页内提示“账号或密码不正确” |
| Authenticated | 清空密码并进入安全目标路由 |
| Deep link | 登录后回到原业务页面，不丢失安全 query |
| Signed out | 清空 session，返回登录页 |
| Reloaded | 内存 session 消失，重新显示登录页 |

不得为本地同步校验制造网络 Loading、超时、权限同步或企业认证成功状态。

## 4. 设置统一布局

设置导航固定为四项：

```text
模型管理
个性化       原型
个人记忆     未接入
问题反馈     原型
```

`登录与身份` 不再作为第五个设置页面。演示模式状态和退出入口放在用户菜单；既有 `#/settings/identity` 保留为隐藏兼容
redirect 到 `#/settings/models`，不出现在设置导航，不形成第五套页面。

布局对齐原型：

- 左侧设置二级导航宽度 `200px`；
- 右侧内容最大宽度 `720px` 并居中；
- 页面标题、说明和状态标记置于内容顶部；
- 同一页面使用纵向 section，不再展示“运行状态/功能状态/未来配置项”工程事实墙；
- 900×600 仍保持双栏；小于 760px 改为单列，设置导航非 sticky；
- 不出现横向滚动；
- 四页复用同一个 `SettingsSectionLayout` 和 `SettingsSectionNav`。

## 5. 模型管理页

### 5.1 页面结构

页面顺序对齐原型：

1. 标题“模型管理”和说明；
2. 企业模型只读列表；
3. 个人模型列表与添加入口；
4. 安全说明；
5. 不保留原型中的“打开管理中心”直链，Admin 是独立产品入口。

统一模型行展示：

```text
显示名称
来源 / Provider / 能力摘要
可用性或类型化状态
是否用户默认（仅真实 Projection 可证明时）
允许的行操作
```

同一模型只出现一次。企业、个人、平台基线按来源分区，不把 `official` 静默解释为企业模型。

### 5.2 真实数据与 GATED 边界

| 区域 | 数据来源 | 本批行为 |
| --- | --- | --- |
| 企业/平台模型 | 既有 `SettingsAdapter.loadSettingsModels()` / `ModelProjection` | 真实只读展示 |
| 个人模型目录 | 既有 `robothreePersonalModelV1Alpha1` compatibility/list/detail | 仅 compatibility `catalogAvailable=true` 时真实只读展示 |
| 添加/编辑/删除/设为默认/查看 Key | v1alpha2 mutation/reveal 链路 | 当前治理仍 GATED；只保留禁用的“添加个人模型”入口和就近原因 |
| Personal Model Fixture | Fake Adapter | 只用于测试和开发视觉场景，不作为生产 fallback |

Renderer 必须先做 Personal Model compatibility negotiation。Feature unavailable、permission denied、transport unavailable、
credential store unavailable 和 runtime changed 使用 Contract safeSummary 的受控文案；不降级为本地数组。

### 5.3 GATED 操作边界

本批不创建 `PersonalModelDialog`、个人模型表单、Key 输入框、保存状态或未来 mutation ViewModel。个人模型区域只包含：

- compatibility 允许时的真实只读列表；
- disabled “添加个人模型”按钮；
- 就近持续显示“个人模型添加与凭证管理尚未开放”；
- 真实 Projection 可证明的 Provider、模型标识、显示名称、状态与安全 host 摘要。

不提供“测试连接”。模型标识与显示名称保持两个真实只读事实，不因缺少编辑表单重新合并。

### 5.4 状态

真实个人模型状态映射全部覆盖：

```text
未验证 / 可用 / 认证失败 / 网络失败 / 协议不兼容
模型不存在 / 不可用 / 权限不足
```

网络失败仍可选择并由未来真实调用重试；其余不可选择状态展示原因。未知状态 fail-closed，不映射为可用。

## 6. 个性化页

页面字段按原型固定：

- 自定义指令：输出偏好、工作习惯；
- 回复风格：默认、专业、幽默、直言不讳。

生产默认不显示虚构的销售部、周报时间等个人事实。页面进入时字段为空，使用示例作为 placeholder。

仅在显式 `local_demo` 模式下允许 Renderer 本页内编辑和切换样式，用于产品体验预览；操作文案固定为：

```text
编辑
取消
更新本页预览
```

页面持续显示：“当前更改只用于本页预览，离开页面后清除，不会影响任务回复。”切换页面时直接清空，不弹出
未保存确认。非 `local_demo` 模式展示同一字段结构的只读未接入状态，不允许编辑。不得使用“保存”“已生效”或
“已应用到 AI”。不得写入 LocalStorage，不得进入 Prompt、Agent、Skill 或 Dynamic Facts。

## 7. 个人记忆页

页面结构按原型：

- 页面标题和说明；
- 持续可见的“真实记忆能力未接入”提示；
- “个人记忆（Markdown）”查看区；
- 编辑/取消/更新本页预览；
- 清空本页预览。

仅在显式 `local_demo` 模式下允许编辑、取消和更新本页预览；切换页面时直接清空，不弹出未保存确认。非演示模式
保持只读未接入。生产默认记忆为空，不展示原型中的虚构个人事实。Markdown 只支持安全结构化预览：标题、段落和列表，通过 Vue
文本插值渲染；禁止 `v-html`、`innerHTML`、脚本、链接自动加载和远程资源。

页面状态：Empty、Preview、Editing、Validation error。Loading、Permission denied、Unavailable、Error、Partial 仅用于
测试 Fixture，不伪装成真实 Memory Store 状态。所有内容在离开页面或组件卸载时清除。

## 8. 问题反馈页

生产页面只展示原型字段结构：

- 问题描述，必填；
- 截图（禁用，接收系统接入后开放）；
- 持续可见的隐私提示；
- 提交区域和能力未接入说明。

生产默认不建立 Feedback Adapter：

- 问题描述使用 disabled textarea，仅用于展示字段和 placeholder；
- 截图按钮和提交按钮均 disabled，并就近持续说明“反馈接收系统尚未接入”；
- 不打开文件选择器、不读取图片、不创建 Object URL、不生成缩略图、不占用附件内存；
- 不通过定时器、Toast 或本地数组模拟提交成功。

完整附件添加/移除以及 submitting/success/failure 只由组件测试和开发视觉 Fixture 提供；Fixture 通过测试 props 或
测试注入场景进入，不建立生产 Adapter，不作为生产 fallback。

## 9. 复用与新增组件

复用：

```text
SettingsSectionLayout / SettingsSectionNav
R3PageHeader / R3Card / R3Button / R3Input / R3Select
R3InlineNotice / R3Tag / R3StatusBadge / R3Modal / R3EmptyState / R3Skeleton
```

计划新增：

```text
pages/auth/LoginPage.vue
app/demo-auth-session.ts
pages/settings/SettingsPersonalizationForm.vue
pages/settings/SettingsMemoryEditor.vue
pages/settings/SettingsFeedbackForm.vue
pages/settings/settings-presentation.ts
adapters/personal-model-settings-adapter.ts
```

公共组件只在确有缺口时做 optional、向后兼容扩展；不引入新的 UI 库、状态管理库或表单库。

## 10. 文件边界

编码窗口只允许：

```text
apps/desktop/src/renderer/**
apps/desktop/tests/**
```

代码和测试冻结后，独占治理收口窗口才允许：

```text
apps/desktop/package.json
scripts/audit-dtp4-packaging.mjs
scripts/audit-dtp4-packaging.test.mjs
README.md
CHANGELOG.md
docs/development/DEVELOPMENT-LOG.md
docs/development/frontend/**
```

禁止：

```text
apps/desktop/src/main/**
apps/desktop/src/preload/**
apps/desktop/src/shared/**
packages/**
services/**
SQLite migration
pnpm-lock.yaml
root package.json / tsconfig
```

发现现有接口不足时停止受影响功能，不得在前端批次补 Contract、IPC 或后端实现。

## 11. 安全与敏感信息检查

- `admin/123456` 只作为固定演示 Fixture allowlist，不得与真实账号体系混用；固定账号可以出现在登录帮助文案、
  开发视觉截图和对应测试中；
- 登录状态不得作为业务授权、Workspace、Tool、Model 或 Knowledge 权限事实；
- 不记录用户实际输入的密码、API Key、反馈正文、个人记忆正文或个性化正文；固定演示账号文案不作为泄漏误报；
- 禁止 LocalStorage、SessionStorage、IndexedDB、文件写入和 URL query 携带上述内容；
- 企业 Credential 永不进入 Desktop；个人 Key 在本批不得输入；
- 页面不得展示 `credentialReference`、`workspaceRoot`、`rootRealPath`、`requestDigest`、stack、内部 error body；
- 敏感扫描区分合法产品文案“API Key/密码”和真实值形态；固定演示密码只在登录模块及对应测试中 allowlist；
- 生产路径不读取反馈截图；开发视觉 Fixture 只使用仓库固定假图片，不使用用户真实截图或敏感内容。

## 12. 可访问性与键盘

- 登录账号/密码使用可见 label，并支持 Enter 提交；
- 显示密码按钮提供准确 `aria-label` 和 `aria-pressed`；
- 登录错误使用页内 `aria-live`，焦点返回密码输入框；
- 设置导航使用 RouterLink、`aria-current="page"` 和可见焦点；
- 回复风格使用单选组语义，不用普通可点击 `div`；
- 编辑/取消/预览更新保持可预测焦点；
- 开发测试 Fixture 中的文件选择与移除可由键盘完成；该要求不属于正式反馈页面；
- 禁用操作的原因持续可见，不依赖 Hover Tooltip；
- 状态不只依赖颜色表达。

## 13. 测试矩阵

### 13.1 Focused tests

```text
demo-auth-session.test.ts
login-page.test.ts
renderer-workbench-boundary.test.ts
renderer-router.test.ts
desktop-shell.test.ts
design-system-components.test.ts
settings-section-nav.test.ts
settings-section-model.test.ts
settings-model-page.test.ts
settings-capability-gate-page.test.ts
personal-model-settings-adapter.test.ts
```

关键断言：

- 正确/错误账号、退出、reload、deep link 和 guest-only 路由；
- 密码验证后清空，用户文案和 DOM 不出现未授权敏感值；
- 设置导航恰好四项，隐藏 identity route 只做 redirect；
- 企业/平台/个人模型来源和状态映射真实，GATED mutation 不可操作；
- 页面没有“测试连接”和假保存/假提交成功；
- 个性化/记忆只更新本页预览，离开后清空；
- Markdown 无 HTML 注入；
- 生产反馈页不打开文件选择器、不读取图片，Fixture 场景覆盖附件与提交状态；
- Fixture 状态不进入生产默认路径；
- Renderer 不新增 Main/Preload/IPC/Contract/LocalStorage 依赖。

### 13.2 门禁

```text
pnpm --filter @robothree/desktop build
pnpm exec vitest run <focused files>
pnpm exec eslint apps/desktop/src/renderer apps/desktop/tests
pnpm run check:architecture-boundary
pnpm run audit:dtp4
pnpm install --frozen-lockfile --offline
pnpm run check
git diff --check
```

编码前后比较 `pnpm-lock.yaml` digest，必须不变。

## 14. 视觉验收

至少检查：

```text
1180 × 760
900 × 600
680 × 560（诊断尺寸，不作为正式最小窗口承诺）
```

视觉清单：

- 登录页居中、无 DesktopShell、无内容溢出；
- 设置页 200px 二级导航 + 720px 内容区与原型信息层级一致；
- 模型列表操作不挤压名称和状态；
- 回复风格四项在窄窗口换成 2×2 或单列；
- Markdown 编辑区、反馈字段和按钮不产生横向滚动；
- 页面只使用现有 RoboThree token 和图标体系，不复制原型 emoji 作为正式图标。

## 15. Revision 1 关闭映射

| 评审问题 | Revision 1 处理 |
| --- | --- |
| P1-1 演示登录冒充正式认证 | 仅显式 `local_demo` 注册 `demoRouteNames.login` 和 guard；标题/按钮统一使用“演示”语言 |
| P1-2 提前开发个人模型完整表单 | 删除 `PersonalModelDialog`、Key 输入和 mutation ViewModel，只保留真实只读列表与禁用添加入口 |
| P1-3 反馈形成操作死路 | 生产描述/截图/提交控件均 disabled，不读图片；完整交互只进 Fixture |
| P2 deep link 范围不清 | 冻结 route/param/query 白名单，拒绝 login/legacy/design-system/未知目标 |
| P2 演示账号与截图规则冲突 | 固定 Fixture 可进入帮助文案和视觉证据，禁止记录的是用户实际输入值 |
| P2 未保存确认过度设计 | 个性化/记忆页面切换直接清空，不弹确认 |
| P2 Adapter 过多 | 反馈不建生产 Adapter；未接入状态由页面固定事实表达 |
| P3 测试与范围 | 保留单一 focused tests 节，补键盘、焦点、行内错误与窄窗覆盖 |

## 16. 工期估算

| 批次 | 估算 |
| --- | --- |
| DFE-8B 设置布局、四页、真实只读模型 Adapter、状态与测试 | 2～3 个集中工程日 |
| DFE-8A 显式演示入口、内存会话、路由守卫与测试 | 不超过 1 个集中工程日 |
| 视觉走查、全量门禁与治理收口 | 0.5～1 个集中工程日 |
| 合计 | 3～5 个集中工程日 |

## 17. 当前状态

```text
DFE-8.0: IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING
DFE-8A: IMPLEMENTED / DEVELOPER VERIFICATION PASS / USER ACCEPTANCE PENDING
DFE-8B: IMPLEMENTED / DEVELOPER VERIFICATION PASS / USER ACCEPTANCE PENDING
```

实现保持 Renderer 与 Desktop tests 边界；未修改 Main、Preload、IPC、Contract、Core、Central、migration、依赖或
lockfile。企业认证、真实个性化、真实记忆、反馈提交和 Personal Model mutation/reveal 仍未解锁。
