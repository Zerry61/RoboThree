# AFE-1.0 Dependency / SFC Typecheck Preflight 详细方案

状态：DOCUMENT PLAN ONLY / CODING GATED  
修订：Revision 1.1，吸收 `PASS_WITH_REVISIONS` 文档评审意见。  
范围：仅规划 Admin Console Vue 2.7.16 依赖精确组合与 SFC 类型检查 preflight。  
当前动作：不创建 Admin production 工程，不安装依赖，不修改 root `package.json`、`pnpm-lock.yaml`、Vite/TS/ESLint 配置，不进入页面、路由壳、组件或业务 Adapter 编码。  
目标阻断项：关闭 AFE-0 中的 B-01 与 B-02，证明或否决 Vue 2.7.16 + Vite + Router + TypeScript strict + SFC typecheck + VTU/Vitest + Node 24 的精确组合。

## 1. 输入基线

| 来源 | 当前事实 | AFE-1.0 使用方式 |
| --- | --- | --- |
| `AFE-0-ADMIN-FRONTEND-FOUNDATION-PLAN.md` | AFE-0 Revision 1 已冻结 Admin 采用 Vue 2.7.16，Desktop 保持 Vue 3.5 隔离；B-01/B-02 尚需 preflight。 | AFE-1.0 只验证依赖与 SFC 类型检查，不扩大范围。 |
| root `package.json` | monorepo 使用 pnpm；root dev 依赖含 TypeScript、Vitest、ESLint 等现有工具。 | 不直接修改 root；仅作为版本事实参考。 |
| `pnpm-lock.yaml` | 当前锁定 Desktop 侧 Vue 3.5.40、Vue Router 5.2.0、Vite 8.1.5、VTU 2.4.11、Vitest 4.1.10、TypeScript 5.9.3、happy-dom 20.11.2。 | Admin 不复用 Desktop Vue runtime；preflight 需验证 Vue 2 链路能与现有 workspace 共存。 |
| `apps/desktop/package.json` | Desktop 当前依赖带 `^`，实际 lockfile 固定为 Vue 3.5.40、Vite 8.1.5、VTU 2.4.11。 | AFE-1.0 不改 Desktop，不借 Desktop 配置。 |
| 产品/治理文档 | Admin 仍是 DOCUMENT PLAN ONLY / CODING GATED；Fixture 不得伪造业务事实；安全边界不放松。 | preflight 样例只使用无业务含义的 fake 数据。 |

## 2. Preflight 目标

| 编号 | 目标 | 成功判定 |
| --- | --- | --- |
| G-01 | 验证 Node 24 与 pnpm 11 可运行 Vue 2.7.16 + Vite 构建链。 | 最小 Vue 2 SFC 应用 build 成功。 |
| G-02 | 验证 `@vitejs/plugin-vue2` 与候选 Vite 精确版本兼容。 | Vite dev startup、production build、CSS import、SFC compile 均无阻断错误；HMR 不作为本批成功条件。 |
| G-03 | 验证 Vue Router 3 route meta、hash mode、beforeEach guard 与 TS 类型可用。 | 最小 router 测试覆盖 route meta、Not Found、guard redirect。 |
| G-04 | 验证 TypeScript strict 能约束 Adapter、Projection、route meta、presentation。 | `tsc --noEmit` 或等价 typecheck 拒绝隐式 any、未处理 union、错误 props 类型。 |
| G-05 | 验证 Vue 2.7 SFC 类型检查路径。 | `vue-tsc` with target 2.7 或等价方案能检查 `.vue` props、computed、template refs、slot usage。 |
| G-06 | 验证 `<script setup lang="ts">` 是否可作为默认规范。 | 通过 SFC 编译、类型检查、VTU mount、build；若失败，明确降级到 Options API + `.ts` 严格层。 |
| G-07 | 验证 Vitest + VTU v1 + DOM env 能稳定测试 Vue 2.7 组件。 | 基础组件、router page、slot、emit、async update、snapshot-free test 通过。 |
| G-08 | 验证 Vue 2 与 Desktop Vue 3 依赖不会混用。 | 静态扫描证明 Admin preflight 不 import Desktop `.vue`、Vue 3 runtime、Desktop router/store。 |

## 3. 非目标

1. 不实现 Admin Console production 工程。
2. 不实现登录、权限、路由壳、菜单、页面、组件库或真实 Adapter。
3. 不接 Central/Admin API、TGM、Knowledge Provider、Credential 或企业认证接口。
4. 不修改 Contracts、Core、Central、Desktop、Main、Preload、IPC、数据库 migration。
5. 不新增 root scripts，不修改 root TypeScript/Vite/ESLint 配置。
6. 不用 LocalStorage、SessionStorage、IndexedDB 或前端数组伪装业务持久化。
7. 不输出任何“可以进入完整页面开发”的结论；只输出 preflight 是否满足进入下一轮方案评审的证据。

## 4. 精确依赖矩阵与 fallback 顺序

AFE-1.0 的核心任务是验证下表，不是默认接受下表。所有版本必须精确锁定，禁止 `^`、`~`。执行时只能按 Primary -> fallback 的顺序验证，最多一次 fallback；不得临场选择第三套版本。

### Primary Matrix

| 包 | 精确版本 | 选择理由 | 失败处理 |
| --- | --- | --- | --- |
| `node` | `24.13.0` CI 基线，engine `>=24 <25` | 与当前 workspace Node 24 基线一致。 | 若 Vite/Vitest/Vue 工具链不支持 Node 24，停止并回到方案评审。 |
| `pnpm` | `11.11.0` | 继承 root 包管理器。 | 不降级 root；必要时调整 Admin 候选工具链。 |
| `vue` | `2.7.16` | 公司 Admin 技术栈选择；Vue 2 最终版本。 | 不替换成 Vue 3，也不降级 Desktop；失败则返回技术负责人决策。 |
| `@vitejs/plugin-vue2` | `2.3.4` | 当前官方 Vue 2.7 Vite 插件版本，声明支持 Vue 2.7 与 Vite 3-7；已停止积极维护，需纳入风险。 | 若与 Vite 6/Node 24 不兼容，仅允许进入 fallback 矩阵一次。 |
| `vite` | `6.4.3` | 选择 Vite 6 线内精确版本；不复用 Desktop Vite 8。 | 若失败原因明确来自 Vite 6 与 plugin/VTU/Vitest 组合，进入 fallback；若来自 Vue 2.7 或 Node 24，停止。 |
| `typescript` | `5.9.3` | 与当前 lockfile 实际版本一致。 | 若 Vue 2 SFC 工具链不兼容，评估降低 Admin 内部 TS 版本的代价，需共享窗口审批。 |
| `vue-router` | `3.6.5` | Vue 2 路由稳定线。 | 若类型与 TS strict 有问题，封装 router meta 类型，不改权限事实边界。 |
| `@vue/test-utils` | `1.3.6` | Vue 2 兼容测试工具。 | 若与 Vue 2.7/TS/Vitest 不稳定，记录最小复现并停止。 |
| `vitest` | `4.1.10` | 与当前 root lockfile 实际版本一致，并支持 Vite 6+；优先验证能否减少双版本测试工具。 | 若 VTU v1 或 Vue 2 环境与 Vitest 4 不兼容，进入 fallback。 |
| `happy-dom` | `20.11.2` | 与当前 lockfile 实际 DOM env 一致。 | 若 DOM env 与 Vitest/VTU v1 不兼容，记录最小复现并停止。 |
| `vue-tsc` / Vue Language Tools | `3.3.11` | 需要验证 `vueCompilerOptions.target: 2.7` 与 Vue 2.7 SFC typecheck；版本执行前不得临时漂移。 | 若不可用，形成 B-02 风险报告并采用替代策略。 |

### Fallback Matrix

Fallback 只在 Primary 的失败可归因于 Vite 6 或 Vitest 4 与 Vue 2 工具链组合时允许执行；若 Primary 因 Node 24、Vue 2.7.16、TypeScript strict、SFC typecheck 命令不可检查 `.vue`、或敏感扫描失败而失败，不允许 fallback，直接 RED。

| 包 | 精确版本 | 使用条件 | 限制 |
| --- | --- | --- | --- |
| `@vitejs/plugin-vue2` | `2.3.4` | 保持插件版本不变，隔离 Vite/Vitest 差异。 | 不回退到 `2.3.3`，避免使用非当前插件版本。 |
| `vite` | `5.4.21` | Primary 明确因 Vite 6 组合失败时验证。 | 仅用于诊断；若 fallback 通过，结论最多为 YELLOW，需安全维护例外评审。 |
| `vitest` | `2.1.9` | Primary 明确因 Vitest 4 + VTU v1/Vue 2 组合失败时验证。 | 不得影响 root Vitest 4。 |
| 其他包 | 同 Primary | 保持变量最小。 | 不允许继续展开第三套版本。 |

固定验证顺序：

1. Primary install。
2. Primary typecheck，包括正向和负向 SFC 检查。
3. Primary build。
4. Primary Vitest/VTU。
5. Primary static scan。
6. Primary dependency graph scan。
7. 仅当失败条件满足 fallback 规则时，执行 fallback 同一序列。
8. fallback 仍失败则 RED；fallback 通过则 YELLOW，不得直接视为生产可用。

## 5. Preflight 执行形态

AFE-1.0 获得执行授权后，建议分两级进行，避免过早污染 root workspace。

| 阶段 | 位置 | 目的 | 是否修改 root |
| --- | --- | --- | --- |
| P0-A Disposable Probe | `/private/tmp/robothree-admin-vue2-preflight` | 快速验证 Node 24、pnpm、Vue 2.7、Vite、SFC typecheck、VTU/Vitest 的基础兼容。 | 否。 |
| P0-B Workspace Probe | `RoboThree_workspace/apps/admin-console-preflight/` 或技术负责人批准的临时目录 | 验证与 monorepo、pnpm workspace、root check、路径 alias、静态扫描共存。 | 会影响 workspace/lockfile，必须进入共享文件收口窗口。 |

P0-A 通过不代表可进入页面开发；P0-B 通过后也只表示 B-01/B-02 可进入关闭评审。是否创建正式 `apps/admin-console/` 仍需单独授权。

## 6. 最小探针文件范围

Disposable Probe 最小文件：

```text
package.json
pnpm-lock.yaml
index.html
vite.config.mjs
vitest.config.mjs
tsconfig.json
tsconfig.negative.json
src/
├── main.ts
├── App.vue
├── router.ts
├── route-meta.ts
├── presentation.ts
├── adapter-types.ts
└── components/
    ├── ProbeButton.vue
    ├── ProbeTable.vue
    └── ProbeScriptSetup.vue
tests/
├── router-preflight.test.ts
├── component-preflight.test.ts
├── strict-types-preflight.test.ts
└── isolation-static-scan.test.ts
fixtures/
└── type-errors/
    ├── BadProps.vue
    ├── BadTemplateAccess.vue
    └── bad-route-meta.ts
scripts/
└── assert-negative-typecheck.mjs
```

Workspace Probe 若获准，只能使用同等最小探针；不得扩展成真实 Admin 页面。

## 7. SFC 类型检查验证矩阵

| 项 | 必测样例 | 成功标准 | 失败后策略 |
| --- | --- | --- | --- |
| Options API + TS | `props`、`computed`、`methods`、`watch`、事件 emit。 | 类型错误能被命令捕获，build 不绕过错误。 | 若失败，Vue 2.7 + TS 组合不可进入 AFE-1.1。 |
| Composition API | `setup()`、`ref`、`computed`、readonly data。 | 类型推断稳定，VTU mount 正常。 | 若失败，降级为 Options API，业务逻辑放 `.ts`。 |
| `<script setup>` | typed props、defineEmits、computed、template usage。 | SFC typecheck、build、component test 全过。 | 若失败，不作为 Admin 默认规范。 |
| Template typecheck | 模板访问不存在字段、错误 prop 类型、错误 event payload。 | 至少一种命令能稳定失败。 | 若无法覆盖，记录限制，并禁止复杂逻辑留在 template。 |
| Slot 类型 | default slot、scoped slot。 | VTU 测试和 SFC 检查不冲突。 | 复杂 slot 组件延后到 AFE-2。 |
| CSS import | global token import、scoped style、class binding。 | build 输出稳定，无 runtime CSS 错误。 | 调整 Vite CSS 配置，不引入新样式工具。 |

SFC typecheck 配置必须从 `tsconfig.json` 实际读取，不以独立配置文件存在作为成功证据。`tsconfig.json` 必须包含或通过 `extends` 加载 `vueCompilerOptions.target: 2.7` 与 `vueCompilerOptions.strictTemplates: true`；`tsconfig.negative.json` 必须继承同一配置。Harness 必须输出或断言有效配置中已启用 Vue 2.7 target 与 strict template，防止配置未加载但负向样例偶然失败。

负向类型检查不得放入普通测试目录直接运行。必须采用独立 harness：

1. `fixtures/type-errors/**` 存放故意错误的 `.vue` 和 `.ts` 文件。
2. `tsconfig.negative.json` 只 include 负向 fixture；普通 `tsconfig.json` 必须 exclude 该目录。
3. `scripts/assert-negative-typecheck.mjs` 执行 `vue-tsc --noEmit -p tsconfig.negative.json`。
4. harness 必须断言命令返回非零退出码。
5. harness 必须断言输出包含预期文件路径，例如 `BadProps.vue`、`BadTemplateAccess.vue`。
6. harness 必须断言至少一个预期诊断片段，证明 `.vue` template/script 实际被检查。
7. 若命令失败但没有预期文件或诊断，判定为 RED，防止“根本没检查 .vue 文件”被误判为成功。

## 8. TypeScript strict 探针

必须覆盖：

1. `noImplicitAny`：Adapter 参数不能隐式 any。
2. `strictNullChecks`：Projection 缺字段必须显式处理。
3. union exhaustiveness：状态新增未处理必须编译失败。
4. readonly output：presentation 输出用只读结构。
5. route meta：`implementationGate` 与 `CapabilityProjection` 分离，静态 meta 不含 runtime ready。
6. provisional permission alias：权限名只能作为 provisional，不写入 Contract。
7. sensitive value ban：真实或疑似真实 `token`、`credential`、`apiKey`、`secret`、`stack` 值不能进入 presentation 输出；产品文案、类型字段名和固定 fake/sentinel allowlist 不算失败。

## 9. Router 3 探针

| 验证项 | 要求 |
| --- | --- |
| hash mode | 默认验证 hash mode，避免未定义 server rewrite 影响刷新。 |
| Not Found | 未匹配路由显示 Not Found；已知无权限路由显示 Permission denied。 |
| beforeEach | guard 从 fake Projection 读取权限，不根据 route name 自推断。 |
| system redirect | `/system` 重定向到首个有权限二级路由；无权限时进入 no-permission。 |
| route meta | 只含 `implementationGate` 和 provisional alias，不含 runtime capability ready。 |

## 10. Vitest / VTU v1 探针

最小测试必须覆盖：

1. Vue 2.7 组件 mount。
2. props 类型与默认值。
3. emit payload。
4. slot 渲染。
5. router-view 页面切换。
6. async update / `nextTick`。
7. DOM env 对 focus、keyboard、aria 属性的支持。
8. 禁止 snapshot 记录 Secret-like 字段。

## 11. 静态隔离扫描

Disposable Probe 与 Workspace Probe 都要扫描：

| 禁止项 | 说明 |
| --- | --- |
| Desktop import | 禁止 import `apps/desktop/**`、Desktop Vue 3 component、Desktop router/store。 |
| Vue 3 runtime | 禁止依赖 `@vue/runtime-dom`、`@vue/test-utils` v2、`@vitejs/plugin-vue`。 |
| Browser secret | 禁止真实或疑似真实 token、credential、apiKey、secret、stack 值进入 presentation、fixture、snapshot；允许产品文案、类型字段名和固定 fake/sentinel allowlist。 |
| Unsafe DOM | 禁止 `innerHTML`、`v-html`、`eval`、动态 Function。 |
| Production fixture | Workspace Probe 必须证明 production build 不包含 fixture adapter 默认入口。 |

敏感扫描必须有正反向注入：

1. 正向 fixture：注入形似真实 bearer、API key、private key、stack trace、内部绝对路径，扫描必须失败并指出文件位置。
2. 反向 fixture：包含“API Key”“Credential 状态”“Token policy”等产品文案、TypeScript 字段名、`fixture-api-key-do-not-use` 等 sentinel，扫描不得失败。
3. allowlist 必须集中定义，禁止散落在测试用例中。
4. 若扫描器只能通过扩大禁词表才能检出，导致大量正常文案误报，判定为 YELLOW 或 RED，不能作为生产门禁冻结。

## 12. 命令计划

以下命令仅为后续执行方案，不在本批运行。

| 阶段 | 命令 | 目的 |
| --- | --- | --- |
| Disposable install | `pnpm install --frozen-lockfile` 或首次生成锁文件后再 frozen 验证 | 精确依赖可安装。 |
| Disposable dev startup | `pnpm run dev -- --host 127.0.0.1 --port 41730 --strictPort`，等待 `http://127.0.0.1:41730/` 或固定探针模块响应 | 验证 Vite dev server 可启动；超时失败；结束后必须验证进程退出且端口释放。 |
| Disposable typecheck | `pnpm run typecheck`、`pnpm run typecheck:negative` | TS strict + SFC 正向检查 + 负向非零退出检查。 |
| Disposable build | `pnpm run build` | Vite production build。 |
| Disposable test | `pnpm run test` | Vitest + VTU v1。 |
| Disposable static | `pnpm run scan:static` | 隔离与敏感字段扫描。 |
| Workspace package gates | `pnpm --filter @robothree/admin-console-preflight build`、`typecheck`、`test`、`scan:static` | 明确执行 preflight package 自身门禁，不能只依赖 root check。 |
| Workspace lockfile reinstall | `pnpm install --frozen-lockfile` | 证明 lockfile 可重装且无漂移。 |
| Workspace root gate | `pnpm run check` | 验证 monorepo 整体门禁。 |
| Desktop Vue 3 regression | `pnpm --filter @robothree/desktop build`、`pnpm exec vitest run apps/desktop/tests` | 证明 Admin Vue 2 preflight 未破坏 Desktop Vue 3。 |
| Dependency graph | `pnpm --filter @robothree/admin-console-preflight why vue`、`pnpm --filter @robothree/desktop why vue`、解析 `vue`/`vue-router`/VTU/plugin 路径脚本 | 检查 Vue 2/Vue 3 实际解析路径隔离。 |

## 13. 证据输出格式

AFE-1.0 执行后必须输出独立 preflight report，至少包含：

1. 最终验证矩阵：每个包的精确版本、来源、是否采用。
2. 安装结果：成功/失败、关键错误摘要。
3. TypeScript strict 结果。
4. SFC typecheck 结果，单独标注 Options API、Composition API、`<script setup>`。
5. Router 3 探针结果。
6. Vitest/VTU v1 探针结果。
7. Static scan 结果。
8. 与 Desktop Vue 3 隔离结果。
9. 是否建议关闭 B-01/B-02。
10. 若失败，给出可复现错误、推荐替代矩阵和是否需要重新评审。
11. Workspace Probe 若执行，附保留/清理状态和 QA 复核顺序。

## 14. 通过 / 失败判定

| 判定 | 条件 | 后续 |
| --- | --- | --- |
| GREEN | P0-A 与 P0-B 均通过；SFC typecheck 明确可用；`<script setup>` 可用或已明确不采用；root gate 无回归。 | 输出关闭 B-01/B-02 的建议报告，但不自动进入完整工程编码。 |
| YELLOW | 构建和测试通过，但 SFC typecheck 存在限制；可用 Options API + `.ts` 严格层规避。 | 输出限制和编码规范，交技术负责人决定是否接受。 |
| RED | Vue 2.7/Vite/Node/TS/Vitest 任一核心组合不可稳定运行。 | 停止 AFE-1，返回 AFE-0/技术栈评审，不创建 Admin 工程。 |

HMR 说明：本批不把 HMR 作为 GREEN 条件。若后续需要验证 HMR，必须另建确定性 harness：启动 dev server，连接浏览器或 Vite websocket，修改一个固定 SFC 文案，观察 DOM 或 HMR payload 更新，并设置超时失败条件。该 harness 不阻塞 B-01/B-02。

## 15. Workspace Probe 保留、隔离与清理

P0-B Workspace Probe 继续单独 GATED。若后续获准执行，应遵守：

1. preflight package 命名为 `@robothree/admin-console-preflight`，`private: true`，README 明确“临时验证工程，不是 Admin production 工程”。
2. 不新增 root scripts，不加入部署、发布、文档站或正式导航。
3. package 内不得包含真实业务页面、真实 Adapter、真实 Secret 输入或 production endpoint。
4. 执行完成后先保留到独立 QA 复核结束，避免 evidence 无法复现。
5. QA 完成后按清单清理：删除 `apps/admin-console-preflight/**`，重新运行 pnpm lockfile 生成流程，执行 frozen reinstall，比对 preflight 前后的 lockfile digest，复跑 root check 和 Desktop build/tests；不得手工编辑 lockfile 条目。
6. 清理动作必须单独记录，不得把 preflight package 留成事实上的第二个 Admin 工程。

## 16. 文件所有权

当前 AFE-1.0 方案允许：

| 路径 | 操作 |
| --- | --- |
| `docs/development/frontend/AFE-1.0-DEPENDENCY-SFC-TYPECHECK-PREFLIGHT-PLAN.md` | 新增方案文件。 |

当前 AFE-1.0 方案禁止：

| 路径或类型 | 禁止操作 |
| --- | --- |
| `apps/admin-console/**` | 禁止创建正式 Admin production 工程。 |
| `apps/admin-console-preflight/**` | 当前不创建；只有执行授权和共享文件窗口后才能创建。 |
| root `package.json`、`pnpm-lock.yaml` | 禁止修改。 |
| root TypeScript/Vite/ESLint 配置 | 禁止修改。 |
| `apps/desktop/**` | 禁止修改 Desktop。 |
| `services/core/**`、`services/central-service/**` | 禁止修改 Core 和 Central。 |
| `contracts/**`、`packages/contracts/**` | 禁止修改 Contract。 |
| 数据库 migration、版本、CHANGELOG、DEVELOPMENT-LOG | 禁止修改。 |

## 17. P0-P3 自检

| 级别 | 数量 | 项目 |
| --- | --- | --- |
| P0 | 0 | 本文档只规划 preflight，不触碰代码、依赖、版本、日志或运行时。 |
| P1 | 0 | 未授权执行，因此没有引入工程风险；B-01/B-02 仍待未来 preflight 证据关闭。 |
| P2 | 0 | 已吸收评审中的 P2：Primary/fallback 精确矩阵、负向类型检查 harness、Workspace Probe 命令作用域、敏感扫描 allowlist 与正反向注入、SFC 配置从 `tsconfig.json` 实际加载。 |
| P3 | 0 | 已吸收评审中的 P3：HMR 不作为本批成功条件、Vite dev startup smoke 已有命令、Workspace Probe 保留/隔离/清理/QA 顺序及 lockfile 非手工清理已冻结。 |

## 18. 评审请求

请过程评审只检查 AFE-1.0 是否严格限定为依赖与 SFC typecheck preflight：

1. 是否没有扩大到 Admin production 工程、页面、组件库或真实 Adapter。
2. 是否能充分验证 B-01/B-02。
3. 是否避免修改 root 和 lockfile，除非后续单独进入共享文件收口窗口。
4. 是否保持 Desktop Vue 3 与 Admin Vue 2.7 隔离。
5. 是否有明确 GREEN/YELLOW/RED 判定和失败回退。

评审通过后，也只表示 AFE-1.0 方案可接受；执行 preflight 仍需单独授权。
