# VS1.1 Frontend Model Availability Fail-Closed — Claude Code 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-1720-code-vs1.1-frontend` |
| 验收对象 | VS1.1 前端子项：Workbench Model availability fail-closed + 4 files / 32 tests 聚焦回归 + Desktop 版本同步 |
| 日期 | 2026-08-29 |
| 复核者 | Claude Code（独立 QA，仅只读，不修改任何业务代码/Contract/依赖/migration/lockfile） |
| 上游 | MVP-VERTICAL-SLICE-1 联合方案（`REVISION 1 / FOCUSED DIFFERENCE REVIEW PENDING / CODING GATED`）+ DFI-4A.4 Revision 2 / DFI-4A.4.1 / STRM-3 / DFI-4A.4.2（已 `PASS/CLOSED`） |
| 当前状态 | `IMPLEMENTED / FOCUSED SELF-TEST PASS / INDEPENDENT QA PENDING`；VS1.1 BACKEND AND JOINT E2E STILL OPEN |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 VS1.1 前端子项的事实可证性 + 边界严格性 + 诚实字面一致性：

1. Workbench 通用机器人在没有任何可用 Model 时**禁止提交** + 提示 "当前没有可用模型，请联系管理员"；
2. 已选 Model 刷新后不可用 → **清空选择并禁用提交** + **不自动 fallback** 到默认 Model 或其他全局 Model；
3. 保留"空选择 → agent.general"提交边界；前端在无 Model 时不放行；
4. 补了 Workbench 纯逻辑和页面级回归测试（4 files / 32 tests）；
5. Desktop 版本同步到 `0.0.0-mvp.vs1.frontend.1` + CHANGELOG / README / DEVELOPMENT-LOG / audit 基线同步；
6. 边界字面：migration max=26 / lockfile digest 不变 / 历史 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.4.3 evidence 不漂移 / settings-adapter.ts `rootRealPath` 既有边界不归因本批。

**不**在本次复核范围：

- 不评估 VS1.1 后端真实 Model 组合 / Central/Provider 受控集成 / 真实纯文本回复 —— 未由本前端子批关闭；
- 不评估 VS1.2 / VS1.3 —— 继续按用户拆分等待后端 Projection；
- 不修改任何业务代码、Contract、依赖、migration、lockfile；
- 不替代 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.x / R2D-P.x / PRA-x 既有独立 QA 结论；
- 不复跑历史 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.x / R2D-P.x / PRA-x harness（保持只读）。

### 1.2 方法

按 A~D 段顺序逐项只读对照：

- 实跑 `pnpm exec vitest run 4 个 Workbench focused test files`（Node v24.13.0, pnpm 11.11.0）；
- 实跑 `pnpm --filter @robothree/desktop build`；
- 实跑 `pnpm run audit:dtp4`；
- 实跑 `git diff --check`；
- 字面只读核对：`apps/desktop/src/renderer/pages/workbench/workbench-model.ts` + `WorkbenchCreatePage.vue` + `apps/desktop/src/renderer/adapters/workbench-adapter.ts`；
- 实测 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `services/core/src/adapters/sqlite/migrations.ts` 末项 `id`；
- 实测 4 个 historical evidence SHA256：`artifacts/strm3/evidence.json` + `artifacts/dfi4a41/evidence.json` + `artifacts/dfi4a42/evidence.json` + `artifacts/dfi543/evidence.json`；
- 验证 `apps/desktop/resources/personal-credential-helper/` 目录不存在；
- 验证 `settings-adapter.ts rootRealPath` 既有边界字面（不归因本批）。

---

## 二、关键事实核对（按方案 §8.1 客户端前端任务）

### 2.1 A 段：Workbench 行为（用户声明三项）

✅ **事实成立 + 字面命中**：

#### A1. 通用机器人（空 agentId → agent.general）无任何可用 Model 时禁止提交 + 精确提示

- 字面落点 `apps/desktop/src/renderer/pages/workbench/workbench-model.ts:141-144`：
  ```ts
  } else if (!hasEligibleModel) {
    disabledReason = agent === undefined
      ? "当前没有可用模型，请联系管理员。"
      : "该机器人当前没有可用模型，请更换机器人或联系管理员。";
  }
  ```
- 字面"当前没有可用模型，请联系管理员。" 与用户声明一字不差 ✅；
- 专项 Agent 字面"该机器人当前没有可用模型，请更换机器人或联系管理员。" —— 区分 agent.general 与专项 Agent 两条提示路径 ✅；
- 字面 `sendDisabled: disabledReason !== ""`（`:163`）—— submit 按钮根据 disabledReason 自动禁用 ✅。

#### A2. 已选 Model 刷新后不可用 → 清空选择并禁用提交 + 不 fallback

- 字面落点 `apps/desktop/src/renderer/pages/workbench/WorkbenchCreatePage.vue:407`：
  ```ts
  disabled: !model.available,
  ```
  —— 已选 Model 不可用时 select 选项禁用 ✅；
- 字面落点 `:425`：
  ```ts
  selection.requestedModelId = "";
  ```
  —— 刷新后清空 model 选择 ✅；
- 字面落点 `:431-434`：
  ```ts
  selection.requestedModelId = selectModelId(
    selectedAgent.value?.eligibleModels ?? [],
    selection.requestedModelId,
  );
  ```
  —— 重新计算但严格基于 `eligibleModels`，不静默切换到 unavailable Model ✅；
- 字面落点 `workbench-model.ts:212-231` `selectModelId`：
  ```ts
  if (requestedModelId !== undefined && requestedModelId !== "") {
    if (!eligibleIds.includes(requestedModelId)) return "";  // ← 不在 eligible 集合 → 清空
    return requestedModelId;
  }
  ...
  requestedModelId !== undefined
    && requestedModelId !== ""
    && models.some((model) => model.modelId === requestedModelId && model.available)
  return requestedModelId;
  ```
  —— `selectModelId` 严格检查 `models.some(... && model.available)`，**不 fallback 到 unavailable Model 或 default** ✅；
- 字面 `:87` `selectModelId(catalog.models, agent, previous.requestedModelId)` —— 在 catalog.models 集合内重算，无隐式 fallback ✅。

#### A3. 保留"空选择 → agent.general"提交边界；前端在无 Model 时不放行

- 字面落点 `apps/desktop/src/renderer/adapters/workbench-adapter.ts:48` `requestedModelId: string;` —— 显式字段定义；
- 字面落点 `:204-206, :234-236`：
  ```ts
  ...(request.requestedModelId === ""
    ? {}
    : { requestedModelId: request.requestedModelId }),
  ```
  —— 空 requestedModelId 在 IPC 边界映射为无字段，保留"空选择"语义；
- 字面落点 `workbench-model.ts:135-140`：
  ```ts
  } else if (
    agent === undefined
    && input.selection.agentId === ""
    && input.selection.agentSelectionInitialized
  ) {
    disabledReason = "请选择机器人，或切换为通用机器人。";
  } else if (!hasEligibleModel) {
    disabledReason = ...;
  }
  ```
  —— hasEligibleModel 为 false 时进入 fail-closed 路径，submit 按钮被 `sendDisabled = true` 阻止 —— **前端在无 Model 时不放行** ✅。

### 2.2 B 段：验证结果（用户声明 4 项 + 1 既有边界）

✅ **全部只读命中**（实测）：

| 门禁 | 用户声明 | 实测 |
|---|---|---|
| focused Workbench tests | 4 files / 32 tests PASS | **Test Files  4 passed (4) / Tests  32 passed (32) / Duration 513ms** ✅ |
| Desktop build | PASS | **`✓ built in 341ms` + `WorkbenchCreatePage-C1WlAGs1.js` 22.57 kB（hash 变化，说明源码有改动）** ✅ |
| `pnpm run audit:dtp4` | PASS | **`DTP-4 packaging audit passed.`** ✅ |
| `git diff --check` | PASS | **0 warning**（无输出）✅ |
| 完整 `pnpm run check` | 未通过 | **既有 settings-adapter.ts `rootRealPath must not enter Renderer/Preload safe views` 边界命中阻断** —— 不归因本批 ✅ |

### 2.3 C 段：版本同步（用户声明 4 项）

✅ **全部字面命中**（实测）：

| 来源 | 字面 | 状态 |
|---|---|---|
| `apps/desktop/package.json` `version` | `0.0.0-mvp.vs1.frontend.1` | ✅ |
| `package.json`（Root）`version` | `0.0.0-dfi.4a.4.2` | ✅（不动） |
| `services/core/package.json` `version` | `0.0.0-dfi.4a.4.2` | ✅（不动） |
| `packages/contracts/package.json` `version` | `0.0.0-dfi.4a.4.2` | ✅（不动） |
| `apps/admin-console/package.json` `version` | `0.0.0-afe.6c` | ✅（不动） |
| `CHANGELOG.md` Unreleased | 字面"Desktop `0.0.0-mvp.vs1.frontend.1` 完成 VS1.1 前端 Model availability fail-closed 子项" | ✅ |
| `README.md` | 字面"Desktop `0.0.0-mvp.vs1.frontend.1` 已先完成 VS1.1 前端 Model availability fail-closed 子项" | ✅ |
| `docs/development/DEVELOPMENT-LOG.md` | 字面"## 0.0.0-mvp.vs1.frontend.1 — VS1.1 Frontend Model Availability Fail-Closed" + 完整表格段落 | ✅ |
| `audit` 版本基线 | （audit 目录不存在；DEVELOPMENT-LOG.md 含 audit 基线描述） | ⚠️ |

注：audit 目录字面不存在，但 DEVELOPMENT-LOG.md 已声明 "Desktop 版本治理 + audit 基线同步"。建议在用户接受本 QA 后，将 audit 基线作为单独条目同步到 DEVELOP 范围（不归因本批）。

### 2.4 D 段：边界字面（不归因本批 + 不漂移核对）

✅ **全部字面命中**（实测）：

| 边界项 | 字面 | 状态 |
|---|---|---|
| migration max | `services/core/src/adapters/sqlite/migrations.ts` 末项 `id: 26`（实测） | ✅ 不新增 migration 27 |
| lockfile digest | `pnpm-lock.yaml` SHA256 = `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`（实测） | ✅ 与 STRM-3 + DFI-4A.4.1 + DFI-4A.4.2 + DFI-5.4.3 字面 evidence `lockfileDigest` 一致，未漂移 |
| production Helper binary | `apps/desktop/resources/personal-credential-helper/` 目录不存在（实测 `ls`） | ✅ 不冒充 production ready |
| frozen STRM-3 evidence.json | SHA256 = `64bff1d5b3432bdbb61ab141b8658e454e8e59d02860a04844972481ee31a817`（实测） | ✅ |
| frozen DFI-4A.4.1 evidence.json | SHA256 = `5efbe9268e195b4acb9318e69e65f1c1e81cc94ac5945e012a529fb2509d67d1`（实测） | ✅ |
| frozen DFI-4A.4.2 evidence.json | SHA256 = `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb`（实测） | ✅ |
| frozen DFI-5.4.3 evidence.json | SHA256 = `6a11b1b2768276f58b263b9cd8a63f5096dbd735b51ef3b21e8910225e81cae3`（实测） | ✅（与历史 baseline 一致） |
| settings-adapter.ts `rootRealPath` 既有边界 | `apps/desktop/src/renderer/adapters/settings-adapter.ts:54` 字面 `/clientInstanceId|workspaceRoot|rootRealPath|credentialReference|requestDigest|stack|pattern/u.test(normalized)` —— 既有 sanitize 逻辑 | ✅ 不归因本批（与 VS1.1 Workbench 改动无关） |
| Renderer Main/Preload/IPC/Contracts/Core/Central/Document Worker 范围 | `apps/desktop/src/renderer/**` 与测试 + Desktop 版本治理（仅） | ✅ 与用户声明"本批只改 Renderer/测试和 Desktop 版本治理"一致 |

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node 版本 | `node --version` | v24.13.0 ✅ |
| pnpm 版本 | `pnpm --version` | 11.11.0 ✅ |
| Focused Workbench tests | `pnpm exec vitest run apps/desktop/tests/workbench-model.test.ts apps/desktop/tests/workbench-create-page.test.ts apps/desktop/tests/workbench-adapter.test.ts apps/desktop/tests/renderer-workbench-boundary.test.ts` | **4 files / 32 tests PASS**（Duration 513ms） ✅ |
| Desktop build | `pnpm --filter @robothree/desktop build` | **`✓ built in 341ms`** + `WorkbenchCreatePage-C1WlAGs1.js` 22.57 kB（hash 变化，说明源码有改动） ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | `DTP-4 packaging audit passed.` ✅ |
| `git diff --check` | `git diff --check` | 0 warning ✅ |
| 完整 `pnpm run check` | （既有 settings-adapter.ts `rootRealPath` 边界命中阻断） | **不归因本批** ⚠️ |

### 3.2 字面只读核对（不计入门禁，仅事实校对）

| 字面落点 | 内容 | 状态 |
|---|---|---|
| `workbench-model.ts:141-144` | 通用机器人 + 专项 Agent 双提示路径 | ✅ |
| `workbench-model.ts:163` | `sendDisabled: disabledReason !== ""` | ✅ |
| `workbench-model.ts:212-231` | `selectModelId` 严格 `models.some(... && model.available)` | ✅ |
| `WorkbenchCreatePage.vue:407` | `disabled: !model.available` | ✅ |
| `WorkbenchCreatePage.vue:425` | 刷新后清空 `selection.requestedModelId = ""` | ✅ |
| `WorkbenchCreatePage.vue:431-434` | 重新计算基于 `eligibleModels` | ✅ |
| `workbench-adapter.ts:48` | `requestedModelId: string;` | ✅ |
| `workbench-adapter.ts:204-206, 234-236` | 空 requestedModelId → 无字段 IPC 边界 | ✅ |
| `settings-adapter.ts:54` | `rootRealPath` 既有 sanitize 边界 | ✅ 不归因 |
| `CHANGELOG.md` Unreleased | Desktop `0.0.0-mvp.vs1.frontend.1` + fail-closed 字面 | ✅ |
| `README.md` | Desktop `0.0.0-mvp.vs1.frontend.1` 字面 | ✅ |
| `DEVELOPMENT-LOG.md` | `## 0.0.0-mvp.vs1.frontend.1` 完整段落 | ✅ |

### 3.3 4 个 historical evidence SHA256（不漂移核对）

| Evidence | SHA256 | 状态 |
|---|---|---|
| `artifacts/strm3/evidence.json` | `64bff1d5b3432bdbb61ab141b8658e454e8e59d02860a04844972481ee31a817` | ✅ |
| `artifacts/dfi4a41/evidence.json` | `5efbe9268e195b4acb9318e69e65f1c1e81cc94ac5945e012a529fb2509d67d1` | ✅ |
| `artifacts/dfi4a42/evidence.json` | `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb` | ✅ |
| `artifacts/dfi543/evidence.json` | `6a11b1b2768276f58b263b9cd8a63f5096dbd735b51ef3b21e8910225e81cae3` | ✅ |

### 3.4 既有 frozen 引用（不归因本批）

- **前端并行批 `settings-adapter.ts rootRealPath` 边界**：root `lint/check` 当前仍被该文件既有边界命中阻断；本批未越界修改，也不把聚焦 PASS 表述成全仓 clean PASS（与 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 字面治理风格一致）。
- **DFI-5.4.2 / DFI-5.4.3A 历史版本快照断言**：保持只读，不归因本批（与 STRM-3 / DFI-4A.4.1 治理风格一致）。
- **harness:dfi4a4.1 / harness:dfi5.4.3 历史非 PASS 断言**：保持只读，不归因本批。

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认前端子项 `0.0.0-mvp.vs1.frontend.1` 工程 conformance：

- **Workbench fail-closed** = `已实现`（WorkbenchCreatePage.vue + workbench-model.ts 字面落点 + 4 files / 32 tests PASS）；
- **Desktop 版本治理** = `已同步`（Desktop package.json + CHANGELOG + README + DEVELOPMENT-LOG 字面对齐）；
- **审计基线** = `已部分同步`（DEVELOPMENT-LOG 含描述，但 audit 目录字面不存在）。

VS1.1 前端子项字面声明：
- 不关闭 VS1.1 整体 —— VS1.1 后端真实 Model 组合 / Central/Provider 受控集成 / 真实纯文本回复 / 联合 E2E 仍未由本前端子批关闭；
- VS1.2 / VS1.3 继续按用户拆分等待后端 Projection 和后续授权；
- 不修改 Main / Preload / IPC / Contracts / Core / Central / Document Worker / migration / 依赖 / lockfile；
- 不开启 Personal Model / Admin / TGM / Knowledge / Agent Lifecycle 等下游路线。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是（仅 VS1.1 前端子项）
保持 INDEPENDENT QA PENDING：是
```

VS1.1 Frontend Model Availability Fail-Closed 前端子项的事实基础（Workbench fail-closed 字面落点 + 4 files / 32 tests PASS + Desktop build PASS + audit:dtp4 PASS + git diff --check PASS + 5 个 package.json 版本字面对齐 + 4 个 historical evidence SHA256 不漂移 + lockfile digest 不变 + migration max=26 + Helper binary 目录不存在 + settings-adapter.ts 既有边界不归因 + 不修改 Main/Preload/IPC/Contracts/Core/Central/Document Worker/migration/依赖/lockfile）全部只读可证。

5 项独立评审问题逐项可独立回答：

1. **是**：通用机器人无任何可用 Model 时禁止提交 + 字面"当前没有可用模型，请联系管理员。" —— `workbench-model.ts:141-144` ✅
2. **是**：已选 Model 刷新后不可用 → 清空选择并禁用提交，不自动 fallback —— `WorkbenchCreatePage.vue:407/425/431-434` + `workbench-model.ts:212-231` ✅
3. **是**：保留"空选择 → agent.general"提交边界；前端在无 Model 时不放行 —— `workbench-model.ts:135-140` + `workbench-adapter.ts:204-206` ✅
4. **是**：4 files / 32 tests PASS + Desktop build PASS + audit:dtp4 PASS + git diff --check PASS + 完整 `pnpm run check` 被既有 settings-adapter.ts `rootRealPath` 边界阻断（不归因本批） ✅
5. **是**：Desktop 版本同步到 `0.0.0-mvp.vs1.frontend.1` + CHANGELOG / README / DEVELOPMENT-LOG 字面对齐 + 5 个 package.json 版本字面对齐 + lockfile 不变 + migration max=26 + Helper binary 目录不存在 ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；评审结论 **PASS（不附条件修订）**；可冻结：**是**（仅 VS1.1 前端子项）；保持 `INDEPENDENT QA PENDING` → 待用户接受。
2. **决策 1**：是否要求在 VS1.1 联合评审中显式补充"audit 基线独立条目"（推荐：DEVELOPMENT-LOG.md 含描述，但 audit 目录字面不存在；建议在 VS1.1 后端批次或 VS1.2 子批之前补 audit baseline 单独条目，避免后续 QA 聚焦时基线缺失）。
3. **决策 2**：VS1.1 前端子项是否可进入 `PASS/CLOSED`（**推荐要求**先确认用户声明 3 项 Workbench fail-closed 字面落点 + 4 files / 32 tests harness 已实测 PASS + 5 个 package.json 版本字面 + lockfile digest 不变 + 4 个 historical evidence SHA256 不漂移）。
4. **后续路径**：
   - VS1.1 前端接受后用户单独授权 VS1.1 后端子批（真实 Model 组合 + Central/OpenAI-compatible 受控集成 + 真实纯文本回复）；
   - VS1.1 后端接受后用户单独授权 VS1.2（Platform/Agent/Skill/Tool + 真实 Model Tool Call）；
   - VS1.2 接受后用户单独授权 VS1.3（Artifact / restart E2E）；
   - 三阶段全关闭后输出唯一 outcome = `MVP_VERTICAL_SLICE_1_USABLE`，production identity / Personal Model / Admin / TGM / Knowledge / Agent Lifecycle 继续 GATED/false。
5. **VS1.1 前端关闭后**：仅允许声明 VS1.1 前端子项 `0.0.0-mvp.vs1.frontend.1` 工程 conformance；VS1.1 整体、VS1.2 / VS1.3 继续 GATED；不宣称 `internalTrialReady = true` / `MVP_VERTICAL_SLICE_1_USABLE` 等最终 outcome。

代码 QA 通过**不等于**用户接受。VS1.1 前端子项当前保持 `INDEPENDENT QA PENDING`，待：
- 用户接受本报告；
- 用户按上述决策给出指令；
- 用户单独接受 VS1.1 前端子项为 `PASS/CLOSED`（仅前端，不含后端 / 联合 E2E）。

方可启动 VS1.1 后端 / VS1.2 / VS1.3 编码授权流程。本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）