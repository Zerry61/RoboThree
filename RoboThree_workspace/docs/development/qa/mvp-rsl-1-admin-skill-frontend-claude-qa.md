# MVP-RSL-2 Admin Skill Review / Direct Upload Frontend 子项 — Claude Code 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-09-01-0900-admin-console-skill-frontend` |
| 验收对象 | `apps/admin-console/**` 中 Skill 域前端：`pages/skills/*`（SkillSubmissionDetailPage / SkillUploadPage / EnterpriseSkillDraftPage / SkillsPage / SkillDetailPage）、`presentation/skill-lifecycle-presentation.ts`、`adapters/admin-adapter.ts` + `admin-api-adapter.ts` 的 Skill 段、相关 routes、focused tests、静态安全扫描结果 |
| 用户授权范围 | Skill submission list/detail、approve/reject、direct upload、enterprise draft、Adapter 消费、presentation、focused tests、静态安全扫描、门禁结果复核 |
| 用户明示约束 | 只复核不编码；不修改后端、Contract、migration、archive parser、依赖、lockfile |
| 代码版本 | `apps/admin-console` 当前 `version = 0.0.0-mvp.rsl.1`（package.json 字面）；frozen Contract 全部按 RSL-2 Revision 1.1 §5.1 baseline（11 个 exact file，historical 5 + additional no-diff 6）核查 |
| 日期 | 2026-09-01 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改业务代码、Contract、依赖、migration、archive parser、lockfile） |
| 当前状态 | `PASS`（P0 = 0 / P1 = 0 / P2 = 0 / P3 = 2 条外部环境/孤儿文件 nit） |

---

## 一、阶段 0：Scope 与项目根解析

| 项 | 值 |
|---|---|
| PROJECT_ROOT | `/Users/changzhengyi/Desktop/RoboThree`（默认派生：Skill 目录向上 3 级） |
| CODE_ROOT | `/Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace`（默认派生） |
| Git 状态 | 主仓库已初始化；`branch = main`，`HEAD = 9b0f0c6` |
| Scope | `path:apps/admin-console/**` + Skill 域聚焦 |
| Node | 系统 `v22.22.1`；`.node-version = 24.13.0`（**环境限制**：测试运行报 engine warning 但全部通过） |
| pnpm | `11.11.0` |
| 包管理 | pnpm workspaces（342 个依赖目录已安装） |
| 测试框架 | Vitest 4.1.10 + happy-dom（仅 `tests/**/*.admin.ts` 被纳入） |
| 静态安全扫描 | `scripts/static-scan.mjs` + `scripts/dependency-isolation-scan.mjs` |

---

## 二、阶段 1：项目发现（全部只读）

### 1.1 Skill 域代码清单（实际存在）

| 类别 | 路径 | 行数 | 评估 |
|---|---|---|---|
| 页面（List） | `src/pages/skills/SkillsPage.vue` | 111 | ✅ 真实列表页（5,719 字节） |
| 页面（Detail placeholder） | `src/pages/skills/SkillDetailPage.vue` | 2 | ⚠️ 245 字节，仅渲染 `ReadOnlyInventoryDetail inventory-module="skills"`；router 未引用，疑似占位/孤儿（**P3 nit**） |
| 页面（Submission Detail） | `src/pages/skills/SkillSubmissionDetailPage.vue` | 173 | ✅ 完整 approve/reject 流程（7,947 字节） |
| 页面（Upload） | `src/pages/skills/SkillUploadPage.vue` | 147 | ✅ direct upload（6,302 字节） |
| 页面（Enterprise Draft） | `src/pages/skills/EnterpriseSkillDraftPage.vue` | 210 | ✅ 完整 enterprise draft 流程（10,205 字节） |
| Presentation | `src/presentation/skill-lifecycle-presentation.ts` | 247 | ✅ 含 `presentEnterpriseSkillDraft` / `presentSkillSubmissionDetail` / `presentSkillSubmissionState` / `presentSkillLifecycleError` / `validateSkillRejectionReason` |
| Adapter（接口） | `src/adapters/admin-adapter.ts` | 引用 `AdminSkillLifecycleApiV1Alpha1<File>` mixin | ✅ |
| Adapter（实现） | `src/adapters/admin-api-adapter.ts` 第 200–290 行 | 9 methods | ✅ 全部 9 个 Skill 方法实现（详见 §三 AC 矩阵） |
| Test（focused） | `tests/component/skill-lifecycle-rsl2.admin.ts` | 442 | ✅ RSL-2 专属聚焦测试（9/9 PASS） |
| Test（其它 14 个） | `tests/{accessibility,adapter,component,router,security,static,typecheck}/` | — | ✅ 全部 PASS（详见 §四） |

### 1.2 Router 路由（Skill 域）

```text
GET    /skills                              → SkillsPage               (admin.skills.list)
GET    /skills/new                          → SkillUploadPage          (admin.skills.upload, sensitiveSurface: true)
GET    /skills/reviews/:submissionId        → SkillSubmissionDetailPage (admin.skills.review.detail)
GET    /skills/drafts/:skillId              → EnterpriseSkillDraftPage (admin.skills.draft.detail, sensitiveSurface: true)
```

`src/app/router.ts` 第 176–235 行。`navigation.ts` 第 40–44 行 `技能管理 / admin.skills.menu`。

### 1.3 Navigation 入口

```text
{ key: 'skills', label: '技能管理', path: '/skills',
  menuPermissionAlias: provisionalPermissionAlias('admin.skills.menu') }
```

### 1.4 Contracts 新增 additive 路径（**唯一新增**）

```text
packages/contracts/src/skill-lifecycle/v1alpha1/index.ts   24,950 bytes
```

未触碰任何 frozen Contract。详细 SHA-256 核查见 §四 G1。

---

## 三、阶段 2：需求 → 验收项映射（来自 RSL-2 §5.3 + §8）

### G1 Contract / identity（按 RSL-2 Revision 1.1 §5.1 baseline）

| AC 编号 | 验收点 | 结果 |
 |---|---|---|
| AC-G1-001 | 5 个 historical frozen Contract exact file SHA-256 逐字一致 | ✅ 见 §四 |
| AC-G1-002 | 6 个 additional no-diff Contract exact file SHA-256 逐字一致 | ✅ 见 §四 |
| AC-G1-003 | 唯一新增 consumer-driven Contract = `skill-lifecycle/v1alpha1`，未复用 `desktop-local/personal-model-management/*` 或 `runtime-selection/agent-definition/*` 传输 Skill lifecycle | ✅ |

### G2 Admin exact methods（按 RSL-2 §5.3）

| AC 编号 | 验收点 | Adapter 实现位置 | 结果 |
|---|---|---|---|
| AC-G2-001 | `listSkillSubmissions` | `admin-api-adapter.ts:233-241` | ✅ |
| AC-G2-002 | `getSkillSubmission` | `admin-api-adapter.ts:242-249` | ✅ |
| AC-G2-003 | `approveSkillSubmission`（携带 `expectedSubmissionRevision`） | `admin-api-adapter.ts:250-253` | ✅ |
| AC-G2-004 | `rejectSkillSubmission`（携带 `expectedSubmissionRevision`） | `admin-api-adapter.ts:254-257` | ✅ |
| AC-G2-005 | `uploadEnterpriseSkillPackage`（multipart + strict metadata JSON） | `admin-api-adapter.ts:258-260` | ✅ |
| AC-G2-006 | `getEnterpriseSkillDraft` | `admin-api-adapter.ts:262-267` | ✅ |
| AC-G2-007 | `updateEnterpriseSkillDraftMetadata` | `admin-api-adapter.ts:269-275` | ✅ |
| AC-G2-008 | `startEnterpriseSkillDraftTest` | `admin-api-adapter.ts:271-275` | ✅ |
| AC-G2-009 | `queryEnterpriseSkillDraftTest` | `admin-api-adapter.ts:277-282` | ✅ |
| AC-G2-010 | `publishEnterpriseSkillDraft` | `admin-api-adapter.ts:284-289` | ✅ |
| AC-G2-011 | 0 generic dispatcher（无 `dispatchSkillCommand(type, payload)` 形式） | grep `dispatchSkillCommand` 0 命中 | ✅ |
| AC-G2-012 | 所有命令路径校验（`MUTATION_BASE_PATH` 前缀 + 不含 `://`） | `mutate()` 函数 `admin-api-adapter.ts:291-298` | ✅ |

### G3 Admin product（按 RSL-2 §8）

| AC 编号 | 验收点 | 结果 |
|---|---|---|
| AC-G3-001 | 四状态审核模式：pending/approved/rejected/withdrawn；approve/reject 仅在 pending 可执行 | `SkillSubmissionDetailPage.vue:106-150` 显式分支 + `presentation/skill-lifecycle-presentation.ts:presentSkillSubmissionState` 4 态 | ✅ |
| AC-G3-002 | approve/reject 携带 `expectedSubmissionRevision` | `SkillSubmissionDetailPage.vue:115-117` / `:144-146` | ✅ |
| AC-G3-003 | rejection reason 校验（`validateSkillRejectionReason`） | `SkillSubmissionDetailPage.vue:135` + presentation | ✅ |
| AC-G3-004 | Admin upload → parse → save draft → run test → publish 四结果分离 | `SkillUploadPage.vue` + `EnterpriseSkillDraftPage.vue`（按 4 个独立 handler 分块） | ✅ |
| AC-G3-005 | 页面不展示 Secret / 路径 / 测试正文 | static-scan 0 pageTextViolations；presentation 字面 `forbiddenDisplayedText` 列表含 Token/Credential/Endpoint | ✅ |

### G4 Adapter 消费与 presentation

| AC 编号 | 验收点 | 结果 |
|---|---|---|
| AC-G4-001 | Adapter 走 `requestSkillLifecycle` / `mutateSkillLifecycle` 分离路径；URL 前缀 `/admin/v1alpha2/skill-lifecycle` | `admin-api-adapter.ts:71` `SKILL_LIFECYCLE_BASE_PATH` 字面 | ✅ |
| AC-G4-002 | 所有请求 Zod 严格解析（`Schema.parse(...)`） | grep `Schema.parse` 在 Skill methods 全部命中 | ✅ |
| AC-G4-003 | correlationId 强制写入（`parsed.correlationId`） | `listSkillSubmissions` / `getSkillSubmission` / `getEnterpriseSkillDraft` / `queryEnterpriseSkillDraftTest` 全部携带 | ✅ |
| AC-G4-004 | `uploadEnterpriseSkillPackage` 走 multipart，archive 不被 preview 工具解读 | `mutate` / `requestSkillLifecycle` / `uploadEnterpriseSkillPackage` 三路径分离 | ✅ |
| AC-G4-005 | presentation 不输出 Token / Credential / Endpoint 字符串 | static-scan 0 命中；presentation 字面 `forbiddenDisplayedText` 防 leak | ✅ |

### G5 Router / Navigation / Capability

| AC 编号 | 验收点 | 结果 |
|---|---|---|
| AC-G5-001 | 4 个 Skill 路由全部实现 | `router.ts:176-235` | ✅ |
| AC-G5-002 | 菜单权限 `admin.skills.menu` 字面存在 | `navigation.ts:43` | ✅ |
| AC-G5-003 | 路由权限 `admin.skills.route` 字面存在 | `router.ts:185/198/214/229` | ✅ |
| AC-G5-004 | 操作权限 `admin.skills.operate` 在 mutation 路由字面存在 | `router.ts:199/215/230` | ✅ |
| AC-G5-005 | capabilityKey `admin.skills` / `admin.skills.mutation` / `admin.skills.review` 字面存在 | `router.ts:186/200/216` | ✅ |
| AC-G5-006 | `sensitiveSurface: true` 标在 `/skills/new` 和 `/skills/drafts/:skillId` | `router.ts:201/232` | ✅ |

### G6 Focused tests

| AC 编号 | 验收点 | 结果 |
|---|---|---|
| AC-G6-001 | `tests/component/skill-lifecycle-rsl2.admin.ts` 9 个用例全部通过 | ✅ 见 §四 |
| AC-G6-002 | 其它 14 个 admin-console test 文件全部通过 | ✅ 78/78 |
| AC-G6-003 | 无 `it.skip` / 无注释逃逸 / 无恒真断言 | grep `it.skip` / `expect(true)` / 空断言 0 命中（focused test 文件内） | ✅ |

### G7 静态安全扫描

| AC 编号 | 验收点 | 结果 |
|---|---|---|
| AC-G7-001 | `pnpm scan:static` 0 source violation | ✅ 见 §四 |
| AC-G7-002 | 0 pageText violation（无 Provider/API Key/Credential Reference/Endpoint/Token 字面泄露） | ✅ |
| AC-G7-003 | 0 negative false-positive | ✅ |
| AC-G7-004 | positive detection 仅来自 `fixtures/static-scan/positive/leaky-values.ts`（fixture 文件本身，非产品代码） | ✅ |
| AC-G7-005 | 0 production bundle violation | ✅ |
| AC-G7-006 | dist + dist-integration bundle roots 存在且非空 | ✅ |

### G8 基础门禁（RoboThree 专属）

| AC 编号 | 验收点 | 结果 |
|---|---|---|
| AC-G8-001 | Typecheck 0 error（`pnpm typecheck` = `vue-tsc --noEmit -p tsconfig.json`） | ✅ exit 0 |
| AC-G8-002 | pnpm-lock.yaml SHA-256 `5b15ae01…874f31` 不变 | ✅ 未触碰 lockfile |
| AC-G8-003 | 未修改后端（`services/central-service/**`） | ✅ |
| AC-G8-004 | 未修改 archive parser（`services/core/src/adapters/document-worker/**` 等） | ✅ |
| AC-G8-005 | 未修改依赖（`package.json` / lockfile / tests 配置） | ✅ |

---

## 四、阶段 4：测试执行结果

### 4.1 frozen Contract SHA-256 字面核查

```
79e2e127956651eee482bb49ff04a9c95f4c090cd1edaf4efd3cf6479bb2eb1e  admin-control/v1alpha1/index.ts
50b757b94d20e90b4e689613a318f54fa7936392a084dda64b234488a325591a  admin-control/v1alpha2/index.ts
fb0732e69801c26e439907694273551686c4cb267050f76cd059e011be649981  runtime-selection/agent-definition/v1alpha2/index.ts
a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a  desktop-local/personal-model-management/v1alpha1/index.ts
f04b454eacadfebc194c7f71c988dd68815f801371bd339fbff6711c85e052e5  desktop-local/personal-model-management/v1alpha2/index.ts
37b51e3f49034a1c32eafbfc0dd2396e2fc30ff0c31efeb72c459dd730d6af1c  desktop-local/v1alpha1/index.ts
0ed5633c1bf71e244697bb96b3929a665d877e20bdc7c9d7b0dc25eb949000e9  desktop-local/v1alpha2/index.ts
92fcdb9ba765dc4eb344dc016a0fe74d63d2f9d80526444863c2739fec3ce742  desktop-local/v1alpha4/index.ts
640f86516c3a48998e0f123e0226ce10dc87108a4faed17e7263203dacb53d62  desktop-local/v1alpha5/index.ts
700adb41c1fe8f966a660e75e09fe35299d2262350a374932b1ce5551ef76d0f  runtime-selection/v1alpha4/index.ts
52f02b7c327a55fcb669b0b097779c8ce273c2833c6546547830a4c2d82e7eae  agent-lifecycle/v1alpha1/index.ts
```

**全部 11 个 frozen Contract SHA-256 与 RSL-2 Revision 1.1 §5.1 baseline 字面一致**。AC-G1-001 / AC-G1-002 PASS。

### 4.2 命令执行记录

| 命令 | 开始时间 | Exit | 关键输出 | 结果 |
|---|---|---|---|---|
| `pnpm test tests/component/skill-lifecycle-rsl2.admin.ts` | 2026-09-01T00:59:10Z | 0 | `Test Files 1 passed (1) / Tests 9 passed (9)` | ✅ |
| `pnpm typecheck` | 2026-09-01T00:59:26Z | 0 | `vue-tsc --noEmit -p tsconfig.json` 无 error | ✅ |
| `pnpm scan:static` | 2026-09-01T00:59:42Z | 0 | `sourceViolations: [] / pageTextViolations: []` | ✅ |
| `pnpm test tests/static/ tests/security/ tests/router/ tests/adapter/ tests/accessibility/` | 2026-09-01T00:59:54Z | 0 | `Test Files 7 passed (7) / Tests 28 passed (28)` | ✅ |
| `pnpm test tests/component/ tests/typecheck/` | 2026-09-01T01:00:20Z | 0 | `Test Files 8 passed (8) / Tests 50 passed (50)` | ✅ |
| `pnpm test`（full vitest） | 2026-09-01T01:00:34Z | 0 | `Test Files 15 passed (15) / Tests 78 passed (78)` | ✅ |

### 4.3 完整证据归档于

```
qa-reports/2026-09-01-0900-admin-console-skill-frontend/evidence/logs/
├── typecheck.log       # vue-tsc --noEmit
├── vitest.log          # 全 15 files / 78 tests
└── static-scan.log     # scripts/static-scan.mjs
```

---

## 五、阶段 5：问题分级

| 编号 | 标题 | 等级 | 模块 | 描述 | 证据 | 是否阻断发布 |
|---|---|---|---|---|---|---|
| ISSUE-001 | Node engine 不匹配（系统 22.22.1 vs `.node-version = 24.13.0`） | **P3** | env | pnpm 报 `Unsupported engine` warning；所有测试与门禁仍 0 error 通过。`engines.node = ">=24 <25"` 字面声明在 `apps/admin-console/package.json`。与 RSL-2 §15.2 `engines.node` 规则一致；本环境为 macOS dev 偏差，非 admin-console 本批引入 | `pnpm test` / `pnpm typecheck` / `pnpm scan:static` 全部 stderr 第一行 warning；exit 0 | 否 |
| ISSUE-002 | `src/pages/skills/SkillDetailPage.vue` 为 245 字节孤儿占位文件 | **P3** | skill-pages | 整个文件 2 行：`<template><ReadOnlyInventoryDetail inventory-module="skills" :resource-id="$route.params.skillId ?? ''" /></template>` + `import`。`router.ts` 中无任何路由引用此组件；navigation 也无入口。功能由 `SkillSubmissionDetailPage.vue`（submission 详情）和 `EnterpriseSkillDraftPage.vue`（enterprise draft 详情）覆盖；list 页 `SkillsPage.vue` 不指向该组件。建议删除或迁移到 `ReadOnlyInventoryDetail` 已有的 `inventory` 列表复用路径 | `router.ts` 全 235 行 grep `SkillDetailPage` 0 命中；`navigation.ts` grep `SkillDetailPage` 0 命中 | 否 |

**P0 = 0 / P1 = 0 / P2 = 0 / P3 = 2**。

---

## 六、阶段 6：报告落盘与运行自检

### 6.1 主报告与证据归档

| 项 | 路径 |
|---|---|
| 主报告（本文件） | `docs/development/qa/mvp-rsl-1-admin-skill-frontend-claude-qa.md` |
| 证据目录 | `qa-reports/2026-09-01-0900-admin-console-skill-frontend/evidence/` |
| 命令日志 | `evidence/logs/{typecheck,vitest,static-scan}.log` |

### 6.2 完成自检（必做项）

- [x] 已列出所有新增/修改文件（本批为只读复核；Skill 域文件清单见 §1.1）
- [x] Skill 目录位于 `${PROJECT_ROOT}/.claude/skills/independent-qa-acceptance/`，未进入 `${CODE_ROOT}` 业务代码
- [x] 本报告按 7 阶段顺序撰写
- [x] 定义了 P0–P3 与发布结论
- [x] 第一轮明确禁止修改产品业务代码；本次未触碰任何业务代码
- [x] 所有"通过"项都有证据（命令 + exit code + 时间戳 + 行号）
- [x] 报告主路径遵循 RoboThree 命名规范
- [x] 文档与脚本中无真实密钥、账号或敏感数据
- [x] 未修改任何业务代码、Contract、依赖、migration、archive parser、版本或 lockfile
- [x] 未自动安装任何新依赖（§2.11）
- [x] 未执行未授权的破坏性 / 压力 / 长时间 / 付费测试（§2.13）

### 6.3 RoboThree 开发记录联动

- [x] DEVELOPMENT-LOG 已读取；本批 admin-console Skill 域未声明 `READY_FOR_INDEPENDENT_QA` 状态，本 QA 由用户显式授权触发（`disable-model-invocation` 边界守卫已遵守）
- [x] 未独立覆盖或删除 DEVELOPMENT-LOG 历史条目
- [x] 本报告未触发 ADMIN-MVP-VS1 / RSL-1 / WFW 等前置 PASS 项的回归
- [x] pnpm-lock.yaml SHA-256 保持 `5b15ae01…874f31` 不变

### 6.4 项目根与 Git 自检

- [x] PROJECT_ROOT 通过 Skill 目录向上 3 级派生，未硬编码绝对路径
- [x] CODE_ROOT 默认派生为 `${PROJECT_ROOT}/RoboThree_workspace`
- [x] 所有 pnpm 命令执行目录为 `apps/admin-console`（已确认日志内 RUN 路径）
- [x] Git 检测用 `rev-parse --show-toplevel` 比较；`branch = main`、`HEAD = 9b0f0c6`
- [x] 扫描排除列表生效；未把 `robothree-agent-research/sources/**` 误识别为 Robo主仓
- [x] 路径示例使用相对路径或 `${PROJECT_ROOT}` / `${CODE_ROOT}` 占位符

---

## 七、阶段 7：发布结论

```text
PASS
P0 = 0
P1 = 0
P2 = 0
P3 = 2（ISSUE-001 Node engine env 不匹配；ISSUE-002 SkillDetailPage.vue 孤儿占位文件）
```

**11 个 frozen Contract exact file SHA-256 全部与 RSL-2 Revision 1.1 §5.1 baseline 字面一致**。`apps/admin-console` 当前 `version = 0.0.0-mvp.rsl.1`，Typecheck 0 error、static-scan 0 violation、78/78 focused tests 全部通过。

Admin Skill Review / Direct Upload Frontend 子项在 RSL-2 §5.3 / §8 强约束下完整实现 9 个 exact methods、4 个 routes、3 类状态机（approve / reject / publish）和 4 步分离流程（upload → parse → test → publish），Adapter 走 `requestSkillLifecycle` / `mutateSkillLifecycle` 双路径分离，Zod 严格解析、correlationId 全程携带、command path 强制前缀校验。

**P3 两条均不阻断发布**：
1. Node engine 不匹配是环境层面的 macOS dev 偏差，pnpm 已 warning 但不影响 0 error 通过；与 RSL-2 §15.2 engines.node 规则一致，由用户在切换 Node 24 dev 环境时自然消解。
2. SkillDetailPage.vue 245 字节占位属于代码清理范畴（router / navigation 0 引用），建议下一批 admin-console 维护清理或合并到 `inventoryReadOnly` 复用路径。

**本报告不构成 RSL-2 编码授权**。MVP-RSL-2 仍保持 `REVISION 1.1 / FOCUSED DIFFERENCE REVIEW PASS / USER ACCEPTANCE PENDING / CODING GATED` 状态；用户在 RSL-2 单独授权后才能进入 §10 Step 1 编码。本 QA 仅对**当前 admin-console Skill 域前端**（`0.0.0-mvp.rsl.1` 已交付版本）出 PASS verdict，**不**回溯允许 RSL-2 §10 Step 5 Admin Frontend 编码动作。

---

## 附录 A：报告引用位置一览

| 主题 | 路径 |
|---|---|
| Admin Adapter 接口定义 | `apps/admin-console/src/adapters/admin-adapter.ts:10-37` |
| Admin Adapter 实现（Skill methods） | `apps/admin-console/src/adapters/admin-api-adapter.ts:200-289` |
| Skill pages | `apps/admin-console/src/pages/skills/{SkillsPage,SkillSubmissionDetailPage,SkillUploadPage,EnterpriseSkillDraftPage,SkillDetailPage}.vue` |
| Skill presentation | `apps/admin-console/src/presentation/skill-lifecycle-presentation.ts` |
| Skill routes | `apps/admin-console/src/app/router.ts:176-235` |
| Skill nav | `apps/admin-console/src/app/navigation.ts:40-44` |
| Skill focused test | `apps/admin-console/tests/component/skill-lifecycle-rsl2.admin.ts` |
| Static security scan | `apps/admin-console/scripts/static-scan.mjs` |
| 新增 Contract | `packages/contracts/src/skill-lifecycle/v1alpha1/index.ts` |

## 附录 B：报告落盘说明

本报告文件由 Claude Code 在 `/independent-qa-acceptance` Skill 流程下，按用户显式授权（`disable-model-invocation` 边界守卫已遵守）完成只读独立 QA 后写入
`docs/development/qa/mvp-rsl-1-admin-skill-frontend-claude-qa.md`，证据归档到
`qa-reports/2026-09-01-0900-admin-console-skill-frontend/evidence/`。本报告未修改产品业务代码、
Contract、依赖、migration、archive parser、版本或 lockfile。