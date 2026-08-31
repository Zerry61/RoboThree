# MVP-RSL-1 Robot Lifecycle End-to-End — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-1845-plan-rsl-1` |
| 验收对象 | [MVP-RSL-1 Robot Lifecycle End-to-End 详细实施方案](../MVP-RSL-1-ROBOT-LIFECYCLE-END-TO-END-DEVELOPMENT-PLAN.md)（仅文档级复核；不重做 MVP-VS1/VS2/VS3/ADMIN-MVP-VS1 全评审；编码仍 GATED） |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改方案、业务代码、Contract、依赖、migration、lockfile） |
| 上游 | MVP-VS1 / VS2（含 VS2.3 repair.1+2+3）/ VS3 / ADMIN-MVP-VS1 全部 `PASS/CLOSED`；ADMIN-MVP-VS1 联合实施报告已承接 Central PostgreSQL v0011 + AES-GCM + 配置审计 + immutable Gateway binding + Desktop discovery |
| 开发者自检 | `DOCUMENT REVIEW PENDING / CODING GATED`，自报 QA-001..QA-040 连续唯一、`git diff --check` PASS、预计 6~9 集中工程日 |
| 当前状态 | `CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围（仅 RSL-1 方案与既有边界的差异）

不重做 MVP-VS1/VS2/VS3/ADMIN-MVP-VS1 任何评审；只确认本批：

1. **真实用户链**：Desktop 个人草稿 → exact saved revision → 真实 Task 测试 → 固定包提交 → Admin 审核 → 企业发布 → Desktop Catalog/Task Lock 消费 → Core 重启恢复 是否字面成立；
2. **复用既有能力**：Agent Definition v1alpha2、Runtime Selection、Task、Model、Tool、Central PostgreSQL、Admin Adapter、VS1~VS3 真实链路 是否可被字面指代；
3. **新增 consumer-driven `agent-lifecycle/v1alpha1`** 是否确实 consumer-driven（而非 generic dispatcher）；
4. **真实测试路径**：是否复用 existing Task pipeline（不建测试 Runner）；
5. **state machine 收缩**：四个独立 immutable 事实（draft / draft revision / test fact / submission / release）是否与既有 Task 状态机正交；
6. **avatar 安全校验**：服务端 digest vs 浏览器 MIME 信任边界；
7. **internal-trial `agent.manage` Token**：是否与 `model.use` 隔离、Core 进程启动后立即从 env 删除、不进入 Renderer/Preload/SQLite/logs/Evidence/Artifact；
8. **40 项 QA** 是否连续唯一、`git diff --check` PASS；
9. **Central v0012 是否本批唯一 migration、Core migration 继续止 26**；
10. **停手条件** 14 项是否与本批边界自洽。

### 1.2 方法

- 全文精读方案（592 行，13 节）；
- 只读核对代码事实：`packages/contracts/src/runtime-selection/agent-definition/v1alpha2/index.ts` + `services/central-service/deploy/sql/postgresql/upgrade/` + `services/central-service/src/main/java/com/robothree/central/admincontrol/` + `apps/desktop/src/renderer/pages/intelligence/IntelligenceCreationPage.vue` + `agent-definition-v1alpha2.ts`；
- 程序化核对 40 项 QA 编号 + 实跑 `git diff --check`；
- 核对方案 §3.1 / §3.2 / §3.3 引用的 frozen Contract 是否实际存在且未在本批引入 mutation。

---

## 二、关键事实核对（方案 §1.2 / §3 / §5 / §11 引用）

| 方案声明 | 代码字面 | 结果 |
|---|---|---|
| `AgentDefinitionRevisionV1Alpha2` + 四类 restriction + instruction digest + Task lock 已有 | [packages/contracts/src/runtime-selection/agent-definition/v1alpha2/index.ts](packages/contracts/src/runtime-selection/agent-definition/v1alpha2/index.ts) + [services/core/src/application/agent-definition-v1alpha2.ts](services/core/src/application/agent-definition-v1alpha2.ts) + [built-in-general-agent-source.ts](services/core/src/application/built-in-general-agent-source.ts) | ✅ |
| 中央 PostgreSQL migration 最新 `U0011__admin_model_management_from_v0010.sql` | `services/central-service/deploy/sql/postgresql/upgrade/` 最高 `U0011` —— 本批新增 `v0012` 字面合理 | ✅ |
| Central admincontrol Java 子包：adapter / application / configuration / domain | [services/central-service/src/main/java/com/robothree/central/admincontrol/](services/central-service/src/main/java/com/robothree/central/admincontrol/) 既有结构 —— 本批可在此扩展 submission / review 接口 | ✅ |
| Audit 子包既有基础 | [services/central-service/src/main/java/com/robothree/central/audit/](services/central-service/src/main/java/com/robothree/central/audit/) 既有，可复用 RSL-1 §4.4 audit 模式 | ✅ |
| `IntelligenceCreationPage.vue` 已有头像/名称/标签/简介/行为与规则/四类 restriction 原型 | [apps/desktop/src/renderer/pages/intelligence/IntelligenceCreationPage.vue](apps/desktop/src/renderer/pages/intelligence/IntelligenceCreationPage.vue)（17636 字节）+ [intelligence-creation-model.ts](apps/desktop/src/renderer/pages/intelligence/intelligence-creation-model.ts)（6669 字节）—— §1.2 字面对齐 | ✅ |
| `admin-control/v1alpha1` / `v1alpha2` 既有并 frozen / additive | §3.1 已 freeze v1alpha1 + additive v1alpha2（ADMIN-MVP-VS1 已实施） | ✅（frozen boundary 已被独立 QA 锁定） |
| 既无 Agent Lifecycle source of truth / draft revision / test binding / submission / release 写链 | 实测 Central `admincontrol/` 既有只含 Admin Model 管理，无 Robot Lifecycle 实体（grep 验证） | ✅ |

**结论**：方案 §1.2 / §3 / §5 / §11 引用的代码事实**全部真实存在**，无虚构前提。

---

## 三、按用户指示的 ai-prd-writer 三要素复核

### 3.1 用户流程是否清晰且只补"垂直闭环"，不演变为底座工程

**答：✅。**

- §0.1 给出 9 步用户流程（草稿 → 保存 → 测试 → 通过 → 固定包 → 审核 → 发布 → Catalog → Task lock → 重启恢复），与 PRD 12 项冻结语义（§1.1）一一对齐；
- §0.2 明确"本批不得另建第二套 Task、Agent Loop、Runtime Selection、Entitlement、审核引擎、测试报告系统或 Catalog" —— 与"不演变为底座"边界严格自洽；
- §0.3 "首批明确收缩"明确不预建通用 API / 空页面 / 无消费者 Contract —— 与 RoboThree 既有 VS1/VS2/VS3/ADMIN-MVP-VS1 模式完全一致。

### 3.2 真实接口依赖是否字面存在

**答：✅ 全部命中**：

- 既有的：`AgentDefinitionRevisionV1Alpha2` + Runtime Selection + Central PostgreSQL + Admin Adapter + Desktop v1alpha2 Robot Catalog + VS1~VS3 真实链路 —— 实测全部存在；
- 新增的 `agent-lifecycle/v1alpha1` 是 consumer-driven（§3.1 字面"只承载 RSL-1 真实消费者需要的 strict schema"），不建 generic dispatcher（§3.1 末段字面禁止）；
- §3.4 新增独立 `agent.manage` Token 不扩大 `model.use` permissions —— 与 ADMIN-MVP-VS1 §3.4 internal-trial 模式一致（独立 audience + 独立 permissions + Core 启动后立即从 env 删除 + 不进入 Renderer/Preload/SQLite/logs/Evidence/Artifact）；
- 状态机正交：四个独立 immutable 事实（draft / draft revision / test fact / submission / release）与既有 Task 状态机解耦 —— §5.1 字面"测试 Task 仍是同一 Task 状态机"，无第二套 Runner。

### 3.3 可测试退出条件

**答：✅。**

- 40 项 focused QA 连续唯一（实测 QA-001..QA-040）；
- §9 联合 E2E 主场景 12 步 + 6 项附加负向场景（覆盖所有停手条件）；
- §10 停手条件 14 项与 §1.1 PRD 冻结语义 + §0.2 复用边界 + §3.1 frozen Contract 边界 + §7 Step 顺序 + §11 禁止清单 互锁。

---

## 四、发现的问题

### 无 P0 / 无 P1

### P2-1 — Central v0012 是 Central 自有 migration（与 Core migration 26 边界共存），建议在 Step 1 focused proof 给出"两套 migration counter 互不干扰"的物理证明（精确性，不阻断）

- §11 字面"允许：Central v0012 migration" + §10 停手 #1 字面"不得修改 frozen Robot Catalog / Admin v1alpha1/v1alpha2 / Agent Definition v1alpha2 字段语义"；
- 中央 Java Flyway migration 既有 `U0006`~`U0011`，新增 `U0012` 是既有 counter 自然延伸；但 §0.2 + §7 多次强调"Core migration 继续止 26"——这是 Core SQLite 自己的 counter；
- **建议**：在 Step 1 focused proof 给出"Core SQLite 末项 id 仍 = 26 + Central Flyway `flyway_schema_history` 末项 migration_version = `U0012` 互不干扰" 的物理证据；
- **不阻断**：两条 counter 是不同数据库 + 不同 migration 系统，物理隔离清晰。

### P2-2 — §4.3 avatar 内容校验（PNG/JPEG/WebP + 2 MiB 上限）与"零新增依赖"的 Java 图像解码能力需 Step 1 证明（精确性，不阻断）

- §4.3 字面"若现有 Java 图像解码能力不能在零新增依赖下安全完成校验，编码必须停手回评审；不得只校验扩展名冒充安全上传"；
- 这是**显式编码前 P2 风险门**：若 `imageio-core` / `twelvemonkeys-imageio` 等常用 Java 图像库未在 `central-service/pom.xml` 内，需评估是否真的零依赖可用；
- 建议：Step 1 focused proof 给出现有 `central-service/pom.xml` 的图像解码依赖清单 + 实际解码 PNG/JPEG/WebP 头部的最小 test（fake PNG/JPEG/WebP 头 + 真实解析）；
- **不阻断**：方案已**显式规定停手条件**（§10#7"头像只能依赖扩展名/MIME 校验，无法做内容安全校验"），属于"编码前风险门"而非"方案缺陷"。

### P2-3 — §3.4 internal-trial `agent.manage` Token 与 §4.4 audit 不记录 Secret 的端到端证明需 Step 3 focused test（精确性，不阻断）

- §3.4 字面"只关闭 internal-trial MVP，不宣称 production identity/RBAC ready"；
- §4.4 字面"审计不得包含行为与规则正文、测试正文、Workspace 路径、用户文件或 Secret"；
- 真实 E2E 需 Step 3/Step 5 验证：
  1. Core 进程启动后 `env | grep ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN` → **空**（Core 立即从 env 删除）；
  2. Central audit 表 grep guard `node scripts/audit-secret-leakage.mjs`（如有）或新增 `assertRslLogsClean` focused test 验证 Secret/正文/路径 0 命中；
- **不阻断**：方案 §11 "禁止无真实消费者 Contract" + §10#4"不得让 Renderer 直接访问 Central/Bearer/creator subject/绝对路径"已显式锁定；Step 3 focused proof 应当包含上述两类断言。

### P3-1 — §3.4 "Core 进程启动读取后立即从环境删除" 的具体实现机制需 Step 1 明确（精确性）

- §3.4 字符要求 Core 启动时读取 `ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN` 后立即从环境删除；
- 现有 ADMIN-MVP-VS1 内部 token 模式（如 `internal-trial-enterprise-access-token-provider.ts`）已有读后即删的实现路径可参考；
- 建议：在 Step 1 focused proof 给出字面"启动后立即 `delete process.env.ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN`"的实现位置（不放入 frozen boundary）；
- 不影响通过：既有模式可复用。

### P3-2 — §3.2 Desktop safe API `window.robothreeRobotLifecycleV1Alpha1` 是否需要 Preload additional rebuild 需澄清（精确性）

- §3.2 字面列出 7 个 method，但当前 `apps/desktop/src/preload/create-desktop-api.ts` 既有 API 集合需逐项对照是否已存在 / 需新增；
- 建议：Step 1 focused proof 字面列出 `create-desktop-api.ts` 中新增 / 修改 / 删除的 method 行号；
- 不影响通过：方案 §11 已允许"apps/desktop/src/** 中 lifecycle Main/Preload/Renderer 与 focused tests"。

### P3-3 — §5.3 "与 `agent.general`、现有 code-owned Agent 合并时按 ID/revision 严格去重" 的失败关闭路径需细化（精确性）

- §5.3 字面"不允许 published robot 覆盖 `agent.general`"；
- 实际合并时若 ID/revision 冲突，Central 是 fail-closed 抛 typed error 还是 skip publish？方案未细化；
- 建议：在 Step 2 focused proof 给"`agent.general` 为 reserved ID" + "published robot ID 与 `agent.general` 冲突 → fail-closed `agentlifecycle.robot_id_reserved`"；
- 不影响通过：§10#9"published release 无法投影到现有 Agent Definition/Robot Catalog"已涵盖本类失败。

---

## 五、聚焦评审问题（针对 RSL-1 §12）

1. **RSL-1 只先关闭 Desktop 个人机器人 → Admin 审核 → 企业发布 → Desktop 消费主链** —— ✅ 接受。§0.1 / §0.3 字面清晰，与 PRD §12 项对齐。
2. **Central 作为 draft/revision/test fact/submission/release 唯一 source of truth** —— ✅ 接受。§4.1 PostgreSQL v0012 additive + §4.2 command 纪律 + §5 Core BFF 不持久化机器人草稿。
3. **新增 consumer-driven `agent-lifecycle/v1alpha1`，不改 frozen 既有 Contract** —— ✅ 接受。§3.1 字面禁止修改 frozen v1alpha1 / v1alpha2 / Robot Catalog / Agent Definition v1alpha2，禁止 generic dispatcher。
4. **测试复用现有真实 Task pipeline，content-free result 写回 Central** —— ✅ 接受。§5.1 字面"测试 Task 仍是同一 Task 状态机，禁止 fixture response、独立聊天框、临时表单内容直送模型"；§4.4 audit 不含测试正文。
5. **提交/发布要求 current saved revision 测试通过，测试过程/结果不进入 Agent Package** —— ✅ 接受。§2.3 字面"禁止进入包：测试输入/输出/报告、Credential/Endpoint Secret/正文/路径/PID/端口/SQLite 路径/临时目录"——边界严格。
6. **local Skill 只用于个人测试，Knowledge 非空引用继续 fail-closed** —— ✅ 接受。§1.3 + §5.2 + §10#11 字面禁止 local Skill 进入企业发布包 + Knowledge Provider GATED 时非空 allowlist 阻止提交。
7. **新增独立 internal-trial `agent.manage` Token，不扩大 `model.use` Token** —— ✅ 接受。§3.4 字面独立 audience/permission/内存持有/不进入渲染层。
8. **Admin 本批只做用户 submission 审核，Admin direct-create 另立增量** —— ✅ 接受。§6.2 字面"Admin 从空白创建企业机器人不在本批，不得以隐藏按钮、Fixture 或本地状态伪装完成" + §13 关闭后边界显式列出"Admin direct enterprise robot creation/edit/test" 为 GATED。
9. **Central v0012 是本批唯一 migration，Core migration 继续止 26** —— ✅ 接受（详见 P2-1 物理证明建议）。
10. **40 项 focused QA + 一个联合真实 E2E，不建 96/120 账本或新 Evidence schema** —— ✅ 接受。实测 40 项连续唯一；§9 联合 E2E 一份。
11. **6~9 个集中工程日估算** —— ✅ 接受。Step 1~5 拆分合理，与 ADMIN-MVP-VS1 节奏一致。
12. **方案评审通过 ≠ 编码授权，必须再单独授权 RSL-1** —— ✅ 接受。§14 显式 GATED。

---

## 六、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 3，P3 = 3
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
```

**与开发者自检的差异**：开发者自检未给出 P 级；严格复核发现 **3 项 P2**（Core/Central 双 migration counter 互不干扰的物理证明 + 现有 Java 图像解码能力的 zero-dep 评估 + 端到端 Secret/正文/路径 0 命中的 grep guard）+ **3 项 P3**（env delete 具体实现位置 + Preload API 新增/修改清单 + `agent.general` reserved ID fail-closed 细化）。**无 P0 / 无 P1**，全部 P2/P3 均为"实施精确性"层面（方案意图明确、QA 已覆盖），**不阻断授权**。

**对编码授权的条件**：用户接受本复核 + 接受 §12 Q1-Q12 + 接受 P2/P3 在 Step 1/2 focused proof 中以 commit message + focused test 形式锁定后，**可单独授权编码**。

**本复核未触发任何 RED**。

---

## 七、与既有的 RoboThree 评审规则对齐

- 仅复核本次 RSL-1 方案的差异部分，不重做 VS1/VS2/VS3/ADMIN-MVP-VS1 全评审（按用户指示）；
- 因 `0.0.0-mvp.rsl.1` 尚未建立（编码 GATED），本复核报告**不**回链到 DEVELOPMENT-LOG（与 Revision 1 / repair.1 / repair.2 / repair.3 / VS3 评审一致的处理）；
- 报告落盘到 `docs/development/qa/rsl-1-plan-claude-review.md`，遵循 `<version-or-scope>-claude-review.md` 命名规范；
- 严格保持只读，未修改任何文件。

— Claude Code（独立文档复核，只读）
