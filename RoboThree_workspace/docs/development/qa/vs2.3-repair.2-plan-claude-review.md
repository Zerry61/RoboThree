# MVP-VS2.3 repair.2 — Invocation Deadline Authority — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-30-0030-plan-vs2.3-repair.2` |
| 验收对象 | [MVP-VS2.3 repair.2 — Invocation Deadline Authority 聚焦方案](../MVP-VS2.3-REPAIR.2-INVOCATION-DEADLINE-AUTHORITY-PLAN.md)（仅文档级复核；不重做 repair.1 / Revision 1 全评审；编码仍 GATED） |
| 日期 | 2026-08-30 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改方案、业务代码、Contract、依赖、migration、lockfile） |
| 上游 | VS2.1 / VS2.2 `PASS/CLOSED`；VS2.3 计划 `PASS/CLOSED`；VS2.3 repair.1 文档级 `PASS WITH RISKS`（`0.0.0-mvp.vs2.3` 仍未建立，处于 `IMPLEMENTATION STOP`） |
| 开发者自检 | `DOCUMENT REVIEW PENDING / CODING GATED`，自报 P0=0/P1=0/P2=0/P3=0 |
| 当前状态 | `CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围（用户指定的 4 个聚焦问题）

仅针对本 repair.2 相对 repair.1 的**差异部分**做严格复核：

1. optional additive internal field（`providerRequestDeadlineAt`）是否安全；
2. 无 migration 的 `record_json` 存储是否成立；
3. historical read-compatible + active recovery fail-closed 语义是否准确；
4. repair.2 是否确实没有扩大 MVP 范围。

### 1.2 方法

- 全文精读方案（204 行，10 节）；
- 只读核对代码：`model-invocation-link-persistence.ts`、`model-invocation-link-digest.ts`、`sqlite-model-invocation-link-persistence.ts`、`enterprise-model-request-converter.ts`、`durable-enterprise-model-provider.ts`、`sqlite-conversation-persistence.ts`（含 `record_json` 列）；
- 程序化核对 16 项 QA 编号 + 实跑 `git diff --check`；
- 验证历史 v2 link 缺字段读路径与 prepared-link comparison 当前是否覆盖 deadline。

---

## 二、关键事实核对（4 个聚焦问题）

### Q1：optional additive internal field 是否安全

**答：✅ 安全，前提严格按方案 §3 / §5 实施。**

- `ModelInvocationLinkV2Schema`（[model-invocation-link-persistence.ts:40-45](services/core/src/ports/model-invocation-link-persistence.ts#L40-L45)）用 z.object(`.strict()`) 强约束；方案要求新增字段必须先**去掉 `.strict()`** 或加入 schema 字段——这是边界条件，方案 §3 字面写"additional internal record"但**未显式标注 zod 迁移路径**（legacy/v2 都是 `.strict()`）。
- 字段名 `providerRequestDeadlineAt` 与 converter 既有字段名 ([enterprise-model-request-converter.ts:105](services/core/src/application/enterprise-model-request-converter.ts#L105)) 名称一致；
- 字段类型应为 `TimestampSchema.optional()`（与 `acceptedAt/outputStartedAt/messageCommittedAt` 同形）；
- **风险点（P3-1）**：zod `.strict()` 与"additive optional"在 zod 中互斥——必须先把 V2 schema 从 `.strict()` 改为非 strict，或在 schema 字面加入新字段（zod 默认允许 `.optional()`）。这属于实施细节，**不阻断**方案通过，但编码授权后必须明确写在实施报告的 commit message 备注里。

### Q2：无 migration 的 `record_json` 存储是否成立

**答：✅ 完全成立，证据如下：**

- SQLite 列字面：`record_json`（[sqlite-model-invocation-link-persistence.ts:227](services/core/src/adapters/sqlite/sqlite-model-invocation-link-persistence.ts#L227)）+ `record_digest`/`created_at`/`updated_at`），整个 link 对象 `JSON.stringify(record)` 写入 [sqlite-model-invocation-link-persistence.ts:266](services/core/src/adapters/sqlite/sqlite-model-invocation-link-persistence.ts#L266)；
- 读取：`JSON.parse(row.record_json)` → `ModelInvocationLinkSchema.parse(...)` → schema version dispatch（[sqlite-model-invocation-link-persistence.ts:277-278](services/core/src/adapters/sqlite/sqlite-model-invocation-link-persistence.ts#L277-L278)）；
- `recordDigest` 计算 = `sha256CanonicalJson(JSON.parse(JSON.stringify(record)) ...)`（[model-invocation-link-digest.ts:8-13](services/core/src/application/model-invocation-link-digest.ts#L8-L13)）；
- 因此：✅ 新字段写入 `record_json` → ✅ 重新计算 recordDigest → ✅ 历史 link 缺字段仍可被 strict v2 schema 解析（前提是 v2 schema 改为非 strict 或显式声明新字段）→ ✅ 不需要 migration。

注意：方案 §3 隐含一个事实——`recordDigest` 会因字段新增而**改变**（新字段进 canonical JSON，digest 自然变化）。这是预期的副作用，且**只影响新建 link**，不影响 historical replay（historical link 用各自当时的 recordDigest 校验）。但方案 §3/§5/§11 未显式说明"新 link 与 historical link 的 recordDigest 不再属于同一域"，需要 Step 1 focused proof 验证 QA-006（record digest 覆盖 deadline）。

### Q3：historical read-compatible + active recovery fail-closed 语义是否准确

**答：⚠️ 整体准确，但 prepared-link comparison 当前**未覆盖 deadline**，需 Step 2 实施补充。**

- 当前 prepared comparison（[model-invocation-link-digest.ts:14-44](services/core/src/application/model-invocation-link-digest.ts#L14-L44)）逐项核对 `taskId/runId/stepId/actionId/round/runtimeSelectionDigest/assistantMessageId/modelRequestId/modelRequestDigest/confirmationId/scopeDigest/dataScopeDigest/clientRequestId/centralAcceptRequestDigest/createdAt` + v2-only `schemaVersion/contextAssemblyReceiptDigest/dynamicRequestFacts.factsDigest + dynamicRequestFacts JSON`，**未包含 deadline**。
- 方案 §5 explicitly 要求把 `providerRequestDeadlineAt` 纳入 exact identity comparison（含两侧都缺 / 两侧都有 / 一侧缺 / 不等四种情形），与 QA-007~010 对应。
- 方案 §4 步骤 4 "Provider prepare 的所有 immutable facts 必须与原 link exact match" — 若不修改 `samePreparedModelInvocationLink`，即使 deadline 相等，新 prepare 路径写入的新 deadline 若不与原 link 字段比较仍会绕过本批修复目标。
- **修复路径已明确**（§5 + §7 Step 2），**方案语义准确**；只是方案没有强调"这是 comparison 必须新增的字段"——但已用 §5 G3 字面列出四种情形，足以表达。
- 历史 v2 link 缺字段读取路径：[model-invocation-link-persistence.ts:71-72](services/core/src/ports/model-invocation-link-persistence.ts#L71-L72) dispatch 到 `ModelInvocationLinkV2Schema.parse(input)`——前提是 V2 schema 接受缺字段（见 Q1 P3-1）。
- **active recovery fail-closed**：方案 §3 "startup recovery 遇到 accepted、未完成且缺该字段的历史 link，必须 typed/internal fail-closed"——与 §9 停手 #6 "现有 link 无法同时绑定 deadline 与 central accept digest" 对应，**内部一致**。

### Q4：repair.2 是否确实没有扩大 MVP 范围

**答：✅ 没有扩大，边界证据如下：**

- §2.2 禁止清单 9 项 + §9 停手 10 项：
  - ✅ 不修改 `packages/contracts/src/**`（公开 Contract 不动）
  - ✅ 不新增/修改 migration、表、列、索引；migration 继续止 26
  - ✅ 不新增依赖 / 不修改 lockfile
  - ✅ 不修改 Desktop Main/Preload/Renderer production API
  - ✅ 不新增 Gateway route / 字段 / 公开协议
  - ✅ 不新增恢复表 / 状态机 / 通用 Lifecycle framework
  - ✅ 不重写 historical Harness/Evidence
  - ✅ 不扩展 Personal Model / Admin / TGM / Knowledge / Agent Lifecycle
  - ✅ 不用 fixture clock 伪造 production deadline
- §6 不变量 E2E 断言："round-1/2/3 accept count / round-2 SSE subscription / 字节级"——**严格在 VS2.3 已有范围**，未引入新 capability；
- §10 Q1-Q7 评审问题全部在 MVP 收口范围内（内部 fact + 既有 SQLite + historical 兼容 + 不续期 + 不改 wire + 恢复 repair.1 + 最高 outcome 仍 `MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT`）。
- 最高 outcome 与 repair.1 / Revision 1 完全一致。

**结论**：本批确实**只是补一个 internal additive fact**，不扩大 MVP 范围。

---

## 三、方案内部自检（16 项 QA + git diff）

| 自检项 | 实测 | 状态 |
|---|---|---|
| 16 项 focused QA 连续唯一 | QA-001..QA-016 恰好 16 个唯一 ID，连续无缺号（程序化核对） | ✅ |
| `git diff --check` 通过 | 实跑 exit 0 | ✅ |
| 方案引用代码事实全部真实存在 | Q1-Q4 7 项字面命中（converter `:105`、schema `:40-45/71-72`、SQLite `:227/266/277-278`、digest `:8-13/14-44`、provider V2 link） | ✅ |
| §9 停手条件与 §2.2 禁止清单互锁 | 10 项停手 + 9 项禁止清单互相兜底 | ✅ |

---

## 四、发现的问题

### 无 P0 / 无 P1

### P2-1 — `samePreparedModelInvocationLink` 当前未覆盖 deadline（已知且方案 §5 已要求补齐）

- 见 Q3 详述；
- 现状：`model-invocation-link-digest.ts:14-44` 字面未出现 `deadlineAt / providerRequestDeadlineAt` 比较；
- 方案 §5 已写出四种情形与禁止清单，但未量化"现有 comparison 缺 N 行需补 N 行"；
- 严重级 P2 而非 P1：方案 §5 字面要求已完备，QA-007~009 直接对应；Step 2 实施阶段必须先扩展 `samePreparedModelInvocationLink`，否则修复失败会立即在 focused proof 暴露（fail-closed 行为正确，只是 digest 不一致会触发 conflict 错误而不是"通过"）。

### P2-2 — zod `.strict()` 与 optional additive 字段的迁移路径未明文（实施细节）

- 见 Q1 P3-1；
- 严重级 P2 而非 P1：zod `.strict()` 不允许未知字段，但**显式声明的可选字段可正常 `.optional()`**——只需在 V2 schema 字面加 `providerRequestDeadlineAt: TimestampSchema.optional()` 即可；同时保持 `.strict()`；
- 这与方案 §3 "optional additive" 不矛盾，只是方案未点明"加在 schema 字面 + 保持 strict"，属实施细节。

### P3-1 — 方案未说明 `recordDigest` 域变化的副作用

- 见 Q2 详述；
- 新字段进 canonical JSON → 新 link 的 `recordDigest` 与 historical link 不再属于同一校验域；
- 方案 §3/§5/§11 未显式写出；
- 不阻断：每个 link 仍各自校验自己的 `recordDigest`，无跨域比较。

### P3-2 — §6 "round-3 accept count = 1" 的精确含义未与代码对应

- 方案 §6 列出 round-1/2/3 accept count 与 round-2 SSE subscription，但未说明 round-3 是哪个 round（即"恢复后同一 invocation 返回 PPTX Tool Call → 后续 round-3 由 Model Provider 实际发起"还是别的语义）；
- repair.1 计划 §7 Step 3 已写"round-1 accept=1、round-2 accept=1、round-2 SSE subscription=2、round-3 accept=1"，属同一表述；属于跨方案的一致性问题，不是 repair.2 单独引入。

---

## 五、聚焦评审问题（针对用户指定的 4 个聚焦点）

1. **是否接受 internal `providerRequestDeadlineAt` 不动公开 Contract？** —— ✅ 接受。converter 字段已存在；方案严格 internal additive。
2. **是否接受既有 SQLite `record_json` additive 字段而不建 migration？** —— ✅ 接受。SQLite 字面 `record_json` + `recordDigest` 双轨；migration 继续止 26。
3. **是否接受 historical 缺字段可读取，但 accepted active recovery 必须 fail-closed？** —— ✅ 接受，且方案 §5 + §9 #6 已显式覆盖。
4. **是否接受 deadline 到期不续期、不重新计算？** —— ✅ 接受。§4 "不得修改 deadline、延长 deadline 或按重启时间重新计时"；§9 停手 #5/#10 兜底。
5. **是否接受 prepared-link comparison 必须把 deadline 纳入 exact identity？** —— ✅ 接受，且这是本批修复的核心；QA-007~010 直接对应。
6. **是否接受完成 repair.2 后恢复 repair.1，而不是另建恢复链？** —— ✅ 接受。§0 末尾明文表述。
7. **是否接受最高输出仍仅为 `MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT`？** —— ✅ 接受。§0/§6/§10 Q7 一致。

---

## 六、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 2，P3 = 2
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
```

**与开发者自检的差异**：开发者自检 P2=0/P3=0；严格复核发现 **2 项 P2**（prepared-link comparison 当前未覆盖 deadline，需 Step 2 补齐；zod `.strict()` 与 optional additive 字段迁移路径未明文）+ **2 项 P3**（`recordDigest` 域变化副作用未说明；round-3 精确含义跨方案一致性问题）。**无 P0 / 无 P1**，全部 P2/P3 均为"实施细节"层面（方案意图明确、QA 已覆盖），**不阻断授权**。

**对编码授权的条件**：

1. 用户接受本复核 + 接受 §10 Q1-Q7；
2. 编码授权后 Step 2 必须先扩展 `samePreparedModelInvocationLink` 把 `providerRequestDeadlineAt` 纳入四种情形；
3. Step 1 必须同时验证 QA-001（v2 schema additive）、QA-006（record digest 覆盖 deadline）、QA-002（historical absent 可读）；
4. V2 schema 字面需新增 `providerRequestDeadlineAt: TimestampSchema.optional()`，保持 `.strict()` 不变；
5. 本复核完成后，建议编码 + Step 3 真实 Electron E2E 验证 E2E 字节级与 read/write/Artifact 计数。

**本复核未触发任何 RED**。

---

## 七、与既有的 RoboThree 评审规则对齐

- 仅复核本次 repair.2 方案的差异部分，不重做 repair.1 / Revision 1 全评审（按用户指示）；
- 因 `0.0.0-mvp.vs2.3` 仍未建立，本复核报告**不**回链到 DEVELOPMENT-LOG（与 Revision 1 / repair.1 评审一致的处理）；
- 报告落盘到 `docs/development/qa/vs2.3-repair.2-plan-claude-review.md`，遵循 `<version-or-scope>-claude-review.md` 命名规范；
- 严格保持只读，未修改任何文件。

— Claude Code（独立文档复核，只读）
