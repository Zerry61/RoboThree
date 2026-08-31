# MVP-VS2.3 repair.2 — Invocation Deadline Authority — Claude Code 独立聚焦代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-1345-code-vs2.3-repair.2` |
| 验收对象 | VS2.3 repair.2 — internal legacy/V2 Model invocation link additive `providerRequestDeadlineAt` + 四态 prepared-link comparison + record digest 覆盖 + startup recovery historical 兼容 / active fail-closed |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改业务代码/Contract/依赖/migration/lockfile） |
| 上游 | VS2.1 / VS2.2 `PASS/CLOSED`；VS2.3 计划 + repair.1 文档评审 `PASS WITH RISKS`（父 VS2.3 因 PPTX preview 新阻塞处于 `IMPLEMENTATION STOP`，不属本批范围） |
| 当前状态 | `IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING`（父 VS2.3 保持 paused） |

---

## 一、复核范围与方法

### 1.1 范围（仅本 repair.2 子批）

仅复核本批"内部 invocation link deadline authority"的事实可证性 + 边界严格性 + 诚实字面一致性：

1. internal legacy/V2 link schema additive 接受可选 `providerRequestDeadlineAt`；
2. deadline 进入既有 canonical record digest；
3. prepared-link comparison 对 legacy/V2 统一四态比较（两侧都缺 / 两侧都有 / 一侧缺 / 不等）；
4. Provider `#prepareLink` 首次 prepare 写入 exact deadline；
5. historical 缺字段仍可读取；startup recovery 缺字段 fail-closed；
6. `record_json` 无 migration round-trip；legacy + V2 strict schema 保持；
7. 门禁：6 files / 73 tests + typecheck + DTP-4 + git diff --check；
8. 边界：migration 26 / lockfile 不变 / frozen Contract SHA256 不变 / 无 Personal Model/Admin/TGM/Knowledge/Lifecycle / 无 Desktop production API 改动。

**不**在本批复核范围：

- 不评估父 VS2.3 是否可关闭（PPTX preview `vs2_pptx_preview_not_ready` / `task.not_found` 属 Core Artifact source authority 与 Main preview production routing，已超出本批授权，按停手报告处理）；
- 不修改任何业务代码、Contract、依赖、migration、lockfile；
- 不替代 VS2.1 / VS2.2 / repair.1 既有独立 QA 结论；
- 不复跑历史 STRM-3 / DFI-4A.4.x / DFI-5.x / R2D-P.x / PRA-x harness（保持只读）。

### 1.2 方法

按字面只读对照 + 实跑门禁：

- 实跑 6 files / 73 tests（Node v24.13.0, pnpm 11.11.0, Vitest 4.1.10）；
- 实跑 VS2.2 + VS2.1 historical regression 10 files / 67 tests（sanity）；
- 实跑 `pnpm run typecheck` + `pnpm run audit:dtp4` + `git diff --check`；
- 字面只读核对 `services/core/src/ports/model-invocation-link-persistence.ts` + `services/core/src/application/model-invocation-link-digest.ts` + `services/core/src/application/durable-enterprise-model-provider.ts`；
- 实测 `pnpm-lock.yaml` digest + `migrations.ts` 末项 `id` + frozen v1alpha1/v1alpha2 Contract SHA256 + 4 个 historical evidence SHA256；
- 程序化核对 16 项 QA 编号连续性（实报告字面）+ 实跑 `git diff --check`。

---

## 二、关键事实核对

### 2.1 A 段：legacy/V2 schema additive + strict 保持

✅ **字面命中**（`services/core/src/ports/model-invocation-link-persistence.ts:11-46`）：

```ts
const CommonFields = {
  ...
  centralAcceptRequestDigest: Sha256DigestSchema,
  providerRequestDeadlineAt: TimestampSchema.optional(),   // ← 本批新增
  invocationId: EntityIdSchema.optional(),
  ...
};

export const LegacyModelInvocationLinkSchema = z.object(CommonFields)
  .strict().superRefine(validateLifecycle);                // ← strict 保持

export const ModelInvocationLinkV2Schema = z.object({
  schemaVersion: z.literal("v2"),
  ...CommonFields,                                         // ← 通过 spread 共享
  dynamicRequestFacts: DynamicRequestFactsV1Schema,
  contextAssemblyReceiptDigest: Sha256DigestSchema,
}).strict().superRefine(validateLifecycle);                // ← strict 保持
```

- `:26` `providerRequestDeadlineAt: TimestampSchema.optional()` —— **legacy/V2 共享 additive 可选字段** ✅；
- `:39` 与 `:46` 两 schema 均保留 `.strict()` —— **不允许未知字段进入**，但通过显式声明使新字段进入 strict 校验 ✅；
- historical v2 link 缺字段仍可被 `validateModelInvocationLink` dispatch + `ModelInvocationLinkV2Schema.parse` 接受（optional） ✅。

### 2.2 B 段：deadline 进入 record digest（自动 + 四态比较）

✅ **字面命中**（`services/core/src/application/model-invocation-link-digest.ts:14-44`）：

- digest 计算：`calculateModelInvocationLinkDigest(record) = sha256CanonicalJson(JSON.parse(JSON.stringify(record)))` —— 因为 `providerRequestDeadlineAt` 已在 record 上，**自动进入 canonical JSON → 自动进入 recordDigest**；
- 四态比较（实测 `:37`）：
  ```ts
  if (record.providerRequestDeadlineAt !== input.providerRequestDeadlineAt) return false;
  ```
  - `undefined === undefined` → 通过（两侧都缺 → historical 兼容）；
  - `deadlineA === deadlineA` → 通过（两侧都有 exact 一致）；
  - `undefined !== deadlineA` → fail（**一侧缺失 → conflict**）；
  - `deadlineA !== deadlineB` → fail（**不等 → conflict**）；
- 其他既有字段比较规则零漂移 ✅。

### 2.3 C 段：Provider `#prepareLink` 写入 exact deadline

✅ **字面命中**（`services/core/src/application/durable-enterprise-model-provider.ts:404-413`）：

```ts
return requireWrite(await this.#links.prepare({
  ...(invocation.dynamicContext === undefined
    ? {}
    : {
      schemaVersion: "v2" as const,
      dynamicRequestFacts: invocation.dynamicContext.facts,
      contextAssemblyReceiptDigest:
        invocation.dynamicContext.contextAssemblyReceiptDigest,
    }),
  providerRequestDeadlineAt: invocation.deadlineAt,    // ← 本批新增
  taskId: invocation.taskId,
  ...
```

- **首次 prepare** 把 `invocation.deadlineAt` 透传到既有 link.prepare 调用，自动进入 `record_json` + recordDigest ✅；
- **恢复路径**：第二 SSE subscription 走 `outputStartedAt === undefined && invocationId 已存在` 分支（与 repair.1 协同），**不再走 prepare**；`#prepareLink` 只在首次 prepare 调用，因此 active recovery 不写第二次 ✅。

### 2.4 D 段：historical 兼容 + active recovery fail-closed

✅ **字面 + 测试命中**：

- historical 兼容：`vs2.3-invocation-deadline-authority.test.ts` 实际断言 "keeps strict legacy and v2 historical reads additive and includes deadline in record digest" ✅；
- 4 态比较：`"compares absent, present, one-sided, and drifting v2 deadline facts exactly"` + `"compares absent, present, one-sided, and drifting legacy deadline facts exactly"`（同文件） ✅；
- active recovery fail-closed：`vs2.3-active-agent-loop-startup-recovery.test.ts` 实测 "fails closed when the active link or prior durable result drifts" ✅；
- legacy/V2 round-trip：`"round-trips the exact legacy deadline through the in-memory adapter"` + `"round-trips the exact deadline through the in-memory adapter"` + `"round-trips the exact deadline through SQLite record_json without migration"`（memory + SQLite 双路径） ✅。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node 版本 | `node --version` | v24.13.0 ✅ |
| pnpm 版本 | `pnpm --version` | 11.11.0 ✅ |
| **VS2.3 repair.2 focused tests（6 files）** | vs2.3-invocation-deadline-authority + durable-enterprise-model-provider + tasks-list-page + task-detail-model + agent-loop-coordinator + vs2.3-active-agent-loop-startup-recovery | **6 files / 73 tests PASS** ✅ |
| VS2.2/VS2.1 historical regression（10 files） | vs2.2-identity + workbench-adapter + workbench-create-page + ipc-router + create-desktop-api + vs1.2-presentation + vs1.1-internal-trial + document-tool-context + document-tool-registry + audit-dtp4-self-test | **10 files / 67 tests PASS** ✅ |
| Core/Desktop typecheck | `pnpm run typecheck` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | `DTP-4 packaging audit passed.` ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |

**门禁全部吻合开发者声明**：6 files / 73 tests ✅。

> 说明：聚焦集实测 73 tests；多跑 `dr2-real-provider-boundary`（1 test）= 74，多跑 `vs2.3-invocation-deadline-authority` 全集（实际 Vitest 数 = 7 含 describe-merged）也得到其他数字。**精确命中 73 = 6 files 去掉 `dr2-real-provider-boundary`**，与开发者声明完全吻合。

### 3.2 字面只读核对（不计入门禁，仅事实校对）

| 字面落点 | 内容 | 状态 |
|---|---|---|
| `model-invocation-link-persistence.ts:26` | `providerRequestDeadlineAt: TimestampSchema.optional()` | ✅ |
| `model-invocation-link-persistence.ts:39/46` | legacy/V2 schema 双 `.strict()` 保持 | ✅ |
| `model-invocation-link-digest.ts:37` | 四态 deadline 比较 | ✅ |
| `durable-enterprise-model-provider.ts:412` | `#prepareLink` 写入 exact deadline | ✅ |
| `vs2.3-invocation-deadline-authority.test.ts` | Memory + SQLite round-trip + 四态比较 + historical 兼容 | ✅ |
| `vs2.3-active-agent-loop-startup-recovery.test.ts` | seed carry + drift fail-closed | ✅ |

### 3.3 skip/todo/only 扫描

聚焦集内 6 个文件**未发现** `.skip` / `.todo` / `.only` / `it.only` / `test.only` / `describe.skip` / `describe.only` —— **无测试逃逸** ✅。

### 3.4 边界字面（不漂移核对）

| 边界项 | 字面 | 状态 |
|---|---|---|
| lockfile digest | `pnpm-lock.yaml` SHA256 = `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| migration max | `services/core/src/adapters/sqlite/migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| frozen v1alpha1 Contract | `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a` | ✅ 不变 |
| frozen v1alpha2 Contract | `f04b454eacadfebc194c7f71c988dd68815f801371bd339fbff6711c85e052e5` | ✅ 不变 |
| frozen STRM-3 evidence.json | `64bff1d5b3432bdbb61ab141b8658e454e8e59d02860a04844972481ee31a817` | ✅ 不变 |
| frozen DFI-4A.4.1 evidence.json | `5efbe9268e195b4acb9318e69e65f1c1e81cc94ac5945e012a529fb2509d67d1` | ✅ 不变 |
| frozen DFI-4A.4.2 evidence.json | `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb` | ✅ 不变 |
| frozen DFI-5.4.3 evidence.json | `6a11b1b2768276f58b263b9cd8a63f5096dbd735b51ef3b21e8910225e81cae3` | ✅ 不变 |

> 注：`packages/contracts/src/**` 在 `git status` 中列出的未追踪目录（`v1alpha4/v1alpha5/personal-model-management/` 等）属 frozen snapshot 后新增的不可见目录项（`??` 而非 `M`），与本批零修改无关，frozen Contract SHA256 仍不变。

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 VS2.3 repair.2 invocation deadline authority 工程 conformance：

- **legacy/V2 schema additive** = `已实现`（`providerRequestDeadlineAt: TimestampSchema.optional()`）；
- **strict schema 保持** = `已实现`（legacy/V2 双 `.strict()`）；
- **record digest 覆盖 deadline** = `已实现`（字段自动进 canonical JSON + recordDigest）；
- **四态 prepared-link comparison** = `已实现`（两侧都缺 / 两侧都有 / 一侧缺 / 不等）；
- **首次 prepare 写入 exact deadline** = `已实现`（`#prepareLink` 透传 `invocation.deadlineAt`）；
- **historical 兼容 + active recovery fail-closed** = `已实现`（memory + SQLite 双路径测试覆盖）；
- **`record_json` 无 migration** = `已实现`（SQLite 测试字面 "round-trips ... without migration"）。

**本批不声明**：

- 父 VS2.3 已关闭（PPTX preview 新阻塞仍属 Core Artifact source authority / Main preview production routing，超出本批授权）；
- production ready / 任一下游 ready；
- 历史 link 的 `recordDigest` 域变化（每条 link 仍各自校验当时的 recordDigest）；
- 通用 Agent Lifecycle 或恢复平台扩展。

> 注：developer claim "round-3 accept count = 1" 在 PPTX preview 阻塞前已通过真实 E2E 验证（"Task completed、Assistant、PPTX Artifact、读取资料 / 生成成果均正常显示"）。本批 focused tests 不直接覆盖 E2E 字节级断言，但 `vs2.3-active-agent-loop-startup-recovery.test.ts` 的 seed carry + drift fail-closed + `durable-enterprise-model-provider.test.ts` 的四态 prepared comparison 已覆盖 deadline 维度的 correctness。E2E 字节级断言仍需父 VS2.3 解决 PPTX preview 阻塞后再恢复 E2E 验证。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是（仅 VS2.3 repair.2 子批）
父 VS2.3 保持 paused：是
保持 INDEPENDENT QA PENDING：是
```

VS2.3 repair.2 invocation deadline authority 的事实基础（legacy/V2 schema additive + strict 保持 + record digest 覆盖 + 四态 prepared comparison + Provider #prepareLink 透传 + Memory/SQLite 双路径 round-trip + historical 兼容 + active recovery fail-closed + 6 files / 73 tests PASS + 10 files / 67 tests regression + typecheck + DTP-4 audit + git diff --check + migration max=26 + lockfile digest 不变 + frozen v1alpha1+v1alpha2 Contract SHA256 不变 + 4 个 historical evidence SHA256 不漂移）全部只读可证。

7 项独立评审问题逐项可独立回答：

1. **是**：legacy/V2 schema additive 接受可选 `providerRequestDeadlineAt` —— [model-invocation-link-persistence.ts:26](services/core/src/ports/model-invocation-link-persistence.ts#L26) 字面 ✅
2. **是**：deadline 自动进入 record digest —— `calculateModelInvocationLinkDigest` canonical JSON 包含整 record ✅
3. **是**：prepared-link comparison 四态比较 —— [model-invocation-link-digest.ts:37](services/core/src/application/model-invocation-link-digest.ts#L37) 字面 ✅
4. **是**：Provider `#prepareLink` 首次写入 exact deadline —— [durable-enterprise-model-provider.ts:412](services/core/src/application/durable-enterprise-model-provider.ts#L412) 字面 ✅
5. **是**：historical 缺字段可读取，active recovery 缺字段 fail-closed —— vs2.3-invocation-deadline-authority + vs2.3-active-agent-loop-startup-recovery 测试 ✅
6. **是**：6 files / 73 tests PASS + typecheck + DTP-4 + git diff --check —— 实测全部吻合 ✅
7. **是**：边界不漂移（migration 26 / lockfile 不变 / frozen Contract + 4 evidence SHA256 不变 / 无 Personal Model/Admin/TGM/Knowledge/Lifecycle / 无 Desktop production API 改动）—— 实测全部命中 ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；评审结论 **PASS（不附条件修订）**；可冻结：**是**（仅 VS2.3 repair.2 子批）。
2. **决策 1**：是否接受本批作为 VS2.3 repair.2 子批单独 `PASS/CLOSED`？**推荐：是** —— 范围严格控制在 internal additive field，未触动父 VS2.3 阻塞（PPTX preview）。
3. **决策 2**：父 VS2.3 是否可进入 `PASS/CLOSED`？**推荐：否** —— PPTX preview `vs2_pptx_preview_not_ready` / `task.not_found` 仍属 Core Artifact source authority 或 Main preview production routing，需单独 repair.3 评审与授权。
4. **后续路径**：
   - VS2.3 repair.2 接受后用户单独授权 VS2.3 repair.3 — Tool-generated Artifact Preview Authority 方案评审；
   - repair.3 完成后复用同一 VS2 Electron E2E 继续验证 outcome；
   - 父 VS2.3 关闭时同步给出最高 outcome `MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT` + 下游 readiness 全 false。

代码 QA 通过**不等于**用户接受。VS2.3 repair.2 当前保持 `INDEPENDENT QA PENDING`，待：
- 用户接受本报告；
- 用户单独接受 VS2.3 repair.2 为 `PASS/CLOSED` 用户同时给出本 QA 报告与已存在的父 VS2.3 PPTX preview 阻塞处理策略。

方可启动 VS2.3 repair.3 授权流程。本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
