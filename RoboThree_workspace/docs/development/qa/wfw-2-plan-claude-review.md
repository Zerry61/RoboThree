# WFW-2 Core Registry / Policy / Effect Recovery / Artifact Activation — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-1430-plan-wfw-2` |
| 验收对象 | [WFW-2 Core Registry / Policy / Effect Recovery / Artifact Activation 详细实施方案](../wfw/WFW-2-CORE-REGISTRY-POLICY-EFFECT-ARTIFACT-DEVELOPMENT-PLAN.md)（仅文档级复核；不重做 WFW-1 / WFW-H1 / RSL-1 / ADMIN-MVP-VS1 全评审；编码仍 GATED） |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改方案、业务代码、Contract、依赖、migration、lockfile） |
| 上游 | WFW-0 Revision 1.1 / WFW-1 私有 Text Writer `PASS/CLOSED`；MVP-VS1 / VS2（含 VS2.3 repair.1+2+3）/ VS3 / ADMIN-MVP-VS1 / RSL-1（含 RSL-1 repair.1）/ Desktop Frontend 全部 `PASS/CLOSED` |
| 开发者自检 | `PLAN_DOCUMENT_REVIEW_PASS — USER_ACCEPTANCE_PENDING`，自报 P0=0/P1=0/P2=0/P3=0 |
| 当前状态 | `CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围（仅 WFW-2 方案与既有边界的差异）

不重做 WFW-1 / WFW-H1 / RSL-1 / ADMIN-MVP-VS1 任何评审；只确认本批：

1. **独立 `query_then_retry` descriptor** 不改变既有 Document Tool 恢复语义；
2. **两个 descriptor handle 共享同一 Document Worker 子进程**（不启动第二个 process）；
3. **私有 additive inspect 消息**接入现有 EffectCoordinator（无法 additive 时立即停手）；
4. **Replace 仅接受同一 durable Session 的唯一 terminal WFW Artifact head**；
5. **ambiguous / deleted / non-WFW / 缺失 proof 全部拒绝，不降级为覆盖确认**；
6. **成功 Observation 自动投影 Artifact**（不调用 manual registration，不新增 migration）；
7. **Renderer、Electron E2E、Windows NTFS 验证继续留给 WFW-3**；
8. **不修改公开 Contract / migration / 依赖 / lockfile**；
9. **不修改 Renderer / Main / Preload / Desktop API**；
10. **不修改 WFW-1 publication 语义 / Document Tool existing descriptor / existing Document Worker protocol**；
11. **48 项 focused QA 连续唯一** + `git diff --check` PASS。

### 1.2 方法

- 全文精读方案（421 行，15 节）；
- 只读核对代码：`effect-coordinator.ts:255`（`case "query_then_retry"`） + `tool-effect-executor.ts:89-90`（`query` 默认返回 `unknown`） + `document-worker-protocol.ts:3`（`DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION = "v1alpha2"`） + `desktop-task-projection-service.ts:74/294/420/967/1135/1156`（`projectArtifactIndexForTask` + `resolveArtifactFileSource` 既有） + `enterprise-registry-materializer.ts:714-715`（`effect:query_then_retry` capability 解析）；
- 程序化核对 48 项 QA 编号 + 实跑 `git diff --check`。

---

## 二、关键事实核对（方案 §1.1 / §1.2 / §4 / §7 引用）

| 方案声明 | 代码字面 | 结果 |
|---|---|---|
| 既有 EffectCoordinator 含 `query_then_retry` 分支 | [effect-coordinator.ts:255-265](services/core/src/application/effect-coordinator.ts#L255-L265) 字面 `case "query_then_retry": { ... executor.query(attempt) ... if (queried.outcome === "unknown") return markUncertain ... }` | ✅ |
| 既有 `ToolEffectExecutor.query` 默认返回 `unknown` | [tool-effect-executor.ts:89-90](services/core/src/adapters/tool/tool-effect-executor.ts#L89-L90) `public async query(_attempt): Promise<EffectQueryResult> { return { outcome: "unknown" }; }` | ✅ |
| Document Worker private protocol = `v1alpha2` | [document-worker-protocol.ts:3](services/document-worker/src/protocol/document-worker-protocol.ts#L3) `DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION = "v1alpha2"` | ✅ |
| `enterprise-registry-materializer` 已有 `effect:query_then_retry` capability 解析 | [enterprise-registry-materializer.ts:714-715](services/core/src/application/enterprise-registry-materializer.ts#L714-L715) | ✅ |
| `projectArtifactIndexForTask` 既有 + `resolveArtifactFileSource` 已有 WorkspaceGrant 投影 | [desktop-task-projection-service.ts:74/294/420/967/1135/1156](services/core/src/application/desktop-task-projection-service.ts#L74) | ✅ |
| `AuthorizationEvaluator` 已含 exact WorkspaceGrant `create / modify` + `routine_file` | 既有（用户授权场景已用） | ✅ |
| Document Worker 已有 single-flight child process + `ToolExecutionService` 既有 pre-dispatch / post-confirmation recheck | 既有 | ✅ |

**结论**：方案 §1.2 引用的"可直接复用的 Core 接缝"全部真实存在，与既有代码事实吻合；§1.3 必须解决的差异（descriptor / NDJSON inspect / query default / Artifact projector / proof derivation）字面成立且与代码 1:1 对应。

---

## 三、按用户指示的 ai-prd-writer 三要素复核

### 3.1 用户流程是否清晰且只补"垂直闭环"，不演变为底座工程

**答：✅。**

- §2 Core 级用户流程 10 步（模型 Tool Call → Registry → WorkspaceGrant → Policy → EffectCoordinator → Worker execute/query → Observation → Artifact → crash 恢复）与 WFW-1 §1 字面对齐；
- §0.2 字面"本批不修改 Renderer、Main、Preload 或 Desktop API，不宣称普通客户端闭环"；
- §0.3 字面"不新增第二套 Registry、Policy、Effect、Artifact 或 Task 状态机，也不新增 `file.read / file.edit / file.delete`、目录创建、任意文件覆盖或跨 Workspace 写入"；
- §9.2 禁止清单 6 项（contracts/main/preload/renderer/central-service/migration/lockfile/historical-WFW-1-QA）字面硬约束。

### 3.2 真实接口依赖是否字面存在

**答：✅ 全部命中**：

- 既有 `RegistryBuilder` / `CapabilityResolver` / `TaskCapabilityLockService` / `ToolExecutionService` 三次 authorization recheck / `AuthorizationEvaluator` exact WorkspaceGrant + `routine_file` / `EffectCoordinator.query_then_retry` / `DocumentWorkerToolBackend` single-flight / `projectArtifactIndexForTask` / `resolveArtifactFileSource` / R2D internal-trial —— 实测全部存在；
- 新增的 `workspace-text-tool-registry.ts` + `workspace-text-*.ts` + `tool-effect-executor` resolver 扩展 + `bootstrap/create-desktop-private-runtime.ts` wiring + Document Worker `protocol/**` `handlers/**` `worker.ts` inspect dispatch —— 全部限定在 §9.1 允许文件清单内。

### 3.3 可测试退出条件

**答：✅。**

- 48 项 focused QA 连续唯一（实测 QA-001..QA-048）；
- §11 门禁清单：WFW-2 focused Core tests + WFW-1 3 files / 72 tests baseline + Document Worker 26 files / 220 tests baseline + Core Tool/Effect/Artifact focused regression + Core + Document Worker typecheck/build + DTP-4 packaging audit + audit self-test + focused ESLint + Core smoke + `git diff --check` + **真实 child-process + SQLite restart integration**；
- §12 停手条件 20 项与 §1.3 "必须解决、不得绕过的差异" + §0.2 "不修改 Renderer" + §9.2 "禁止清单"互锁；
- §13 诚实边界字面只确认 `WFW2_CORE_TEXT_WRITE_ACTIVATION_CONFORMANT`，**不**宣称 `WFW_PRODUCT_READY / DESKTOP_TEXT_WRITE_READY / WINDOWS_NTFS_READY / POWER_LOSS_DURABLE / FULL_CAS_READY / GENERAL_FILE_PLATFORM_READY`。

---

## 四、发现的问题

### 无 P0 / 无 P1

### P2-1 — Step 4 "一个 child、两个 handles" 的进程内 handle 共享机制需 Step 1 focused proof 字面收敛（精确性，不阻断）

- §4.3 字面"一个 process owner 暴露 existing Document handle 与 WFW handle；两个 wrapper 分别校验 exact descriptor ID/revision，但共享 PID、decoder、single-flight、pending request、lifecycle 与 cleanup"；
- 当前 `services/document-worker` 仅有 Document Tool 既有 handle；新增第二个 handle 的进程内封装（共享 PID / single-flight / lifecycle cleanup）属于既有 `DocumentWorkerToolBackend` 的**架构变更**，需 Step 1 focused proof 字面证明**现有 backend 不被 WFW handle 错误触发并发争用**；
- **严重级**：P2 而非 P1 —— 方案 §1.3 "existing backend 只有一个 descriptor identity" 已显式识别此差异，且 §11 门禁要求真实 child-process integration 验证；
- 不阻断：方案 §7.1 "若无法 additive 落地，立即停手，另评审 private v1alpha3；不得临场 bump 公共/Desktop Contract" 提供 fallback。

### P2-2 — `safe_retry -> not_found` 复用既有 coordinator 的精确转换路径需 Step 2 focused proof 字面覆盖（语义边界）

- §7.2 表格字面"safe_retry → not_found → retry"——实测 `effect-coordinator.ts:255-265` 字面代码 "if (queried.outcome === "unknown") markUncertain ... else if (not_found) #executeAndRecord else #recordResult"；
- "safe_retry → not_found" 的转换需要**WFW 私有 resolver 层**在 EffectExecutor.query 返回前把 `safe_retry` 映射为 `not_found`，再让既有 coordinator 走 retry 路径；
- 当前 `tool-effect-executor.ts:89-90` 字面只返回 `unknown` —— 新增的 `optional internal resolver` 需在 Step 2 字面证明"safe_retry → not_found" 映射完整保留 retry 语义；
- **严重级**：P2 而非 P1 —— §7.2 字面已显式"non-WFW 仍 unknown，exact WFW 才 inspect" + "safe_retry 在 Core adapter 中复用 existing coordinator"；
- 不阻断：QA-026 / QA-027 已显式覆盖 create missing safe retry + replace old target safe retry。

### P3-1 — proof digest 域命名与既有 canonical helper 的兼容性需 Step 3 实施前确认（精确性）

- §6 字面 `domain = "robothree.wfw-owned-artifact-proof.v1"` —— 新增 digest 域；
- 既有 canonical JSON helper 在 `services/core/src/persistence/digest.ts` 提供 `sha256CanonicalJson`；
- 既有 domain 命名风格（如 `robothree.internal-trial-enterprise-entitlement-authority.v1`、`robothree.model-invocation-link.digest.v1`）确实使用 `robothree.<scope>.v1` 模式 —— 风格一致；
- 严重级：P3 精确性 —— Step 3 实施时只需字面遵循既有命名模式。

### P3-2 — §7.4 "四个窗口" 的 fault point 命名需与 WFW-1 的 `TextFileWriteFaultPoint` enum 对齐（精确性）

- §7.4 字面"temp 前 / temp fsync 后 publish 前 / publish 后 Observation commit 前 / replace evidence 不一致"；
- WFW-1 §2 + `:68` 已有 `TextFileWriteFaultPoint` enum：before_temp_creation / after_temp_fsync / after_target_publication / replacement_evidence_ambiguity；
- §7.4 字面 4 窗口与 WFW-1 fault point 1:1 对应 —— Step 4 实施时直接 `TextFileWriteFaultPoint[step]` 映射即可；
- 严重级：P3 精确性 —— 实施细节对齐。

### P3-3 — §10 QA-001 "exact capability ID" 与 §4.1 capability 字面 `"tool.workspace.file.write_text"` 已有 WFW-1 字面源头（精确性）

- §4.1 字面 `capabilityId: tool.workspace.file.write_text`；
- WFW-1 `:24` 字面 `TEXT_FILE_WRITE_CAPABILITY_ID = "tool.workspace.file.write_text"` —— **同一字符串**；
- Step 2 focused proof 应字面 import WFW-1 常量避免漂移；
- 严重级：P3 精确性 —— 实施细节引用一致性。

---

## 五、聚焦评审问题（针对方案 §15 Q1-Q8）

1. **是否同意 WFW 独立 `query_then_retry` descriptor，existing Document descriptor 不变？** —— ✅ 同意。§4.2 字面硬约束；既有 `effect-coordinator.ts:255` `query_then_retry` 分支已存在，WFW 复用即可。
2. **是否同意两个 handles 共享一个 Worker child？** —— ✅ 同意。§4.3 字面"一个 process owner / 共享 PID / single-flight"——避免第二个 process 启动的失败窗口；需 Step 1 focused proof 字面验证既有 Document Tool 行为不漂移（见 P2-1）。
3. **是否同意 private v1alpha2 additive inspect，无法 additive 时立即停手？** —— ✅ 同意。§7.1 字面 + `document-worker-protocol.ts:3` 字面 `DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION = "v1alpha2"` —— additive 路径存在；fallback "另评审 v1alpha3" 提供诚实降级。
4. **是否同意 Replace 限定同一 durable Session 的唯一 terminal WFW Artifact head？** —— ✅ 同意。§6 字面 8 项 candidate 条件 + §12 停手 #11 "不允许跨 Session/global index"——边界严格。
5. **是否同意 missing / ambiguous / deleted / non-WFW proof 直接拒绝、不降级确认？** —— ✅ 同意。§5.3 字面"replace 不默认每次确认，也不得把 missing proof 降级为 destructive confirmation；proof 不成立即拒绝且零写入" + §12 停手 #10 "missing proof 不得降级确认"。
6. **是否同意 `safe_retry` 仅在 Core adapter 映射为 existing `not_found`？** —— ✅ 同意。§7.2 字面"safe_retry → not_found → complete revalidation 后 retry"；需 Step 2 focused proof 字面覆盖（见 P2-2）。
7. **是否同意 WFW-2 自动投影 Artifact，Desktop/Electron/Windows 留给 WFW-3？** —— ✅ 同意。§0.2 字面 + §8 G5 Artifact Activation 字面 + §13 诚实边界字面不含 `WFW_PRODUCT_READY / DESKTOP_TEXT_WRITE_READY / WINDOWS_NTFS_READY`。
8. **是否确认不新增 Contract、migration、依赖、lockfile 或下游能力？** —— ✅ 同意。§9.2 禁止清单 6 项 + §12 停手 #1/#2/#3/#20 互锁。

---

## 六、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 2，P3 = 3
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
```

**与开发者自检的差异**：开发者自检未给出 P 级；严格复核发现 **2 项 P2**（"一个 child、两个 handles" 的进程内 handle 共享机制需 Step 1 字面证明 + "safe_retry → not_found" 复用既有 coordinator 的精确转换需 Step 2 字面覆盖）+ **3 项 P3**（proof digest 域命名风格一致性 + 4 个 fault window 与 WFW-1 `TextFileWriteFaultPoint` 对齐 + capability ID 字面复用 WFW-1 `TEXT_FILE_WRITE_CAPABILITY_ID` 常量）。**无 P0 / 无 P1**，全部 P2/P3 均为"实施精确性"层面（方案意图明确、QA 已覆盖），**不阻断授权**。

**对编码授权的条件**：用户接受本复核 + 接受 §15 Q1-Q8 + 接受 P2/P3 在 Step 1-4 focused proof 中以 commit message + focused test 形式锁定后，**可单独授权编码**。

**本复核未触发任何 RED**。

---

## 七、与既有的 RoboThree 评审规则对齐

- 仅复核本次 WFW-2 方案的差异部分，不重做 WFW-1 / WFW-H1 / RSL-1 / ADMIN-MVP-VS1 全评审（按用户指示）；
- 因 WFW-2 编码 GATED 且 `0.0.0-wfw.2` 尚未建立，本复核报告**不**回链到 DEVELOPMENT-LOG（与 WFW-1 / RSL-1 / VS3 / repair.1 / repair.2 / repair.3 评审一致的处理）；
- 报告落盘到 `docs/development/qa/wfw-2-plan-claude-review.md`，遵循 `<version-or-scope>-claude-review.md` 命名规范；
- 严格保持只读，未修改任何文件。

— Claude Code（独立文档复核，只读）
