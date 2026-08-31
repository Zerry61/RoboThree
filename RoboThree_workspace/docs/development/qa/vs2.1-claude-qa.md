# MVP-VS2.1 Workspace Source Read — Claude Code 独立聚焦代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-2235-code-vs2.1` |
| 验收对象 | VS2.1 Workspace Source Read：`agent.presentation` 四项 Tool allowlist（DOCX read / XLSX read / PDF text read / PPTX write）+ DOCX → PPTX focused integration |
| 日期 | 2026-08-29 |
| 复核者 | Claude Code（独立 QA，仅只读，不修改任何业务代码/Contract/依赖/migration/lockfile） |
| 上游 | MVP-VS1（已 `PASS/CLOSED`）+ DFI-4A.4 Revision 2 / DFI-4A.4.1 / STRM-3 / DFI-4A.4.2（已 `PASS/CLOSED`） |
| 当前状态 | `IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING` |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 VS2.1 的事实可证性 + 边界严格性 + 诚实字面一致性：

1. **四项 Tool allowlist**：`tool.document.docx.read` / `tool.document.xlsx.read` / `tool.document.pdf.extract_text` / PPTX write；
2. **Catalog / R2D Registry / Entitlement / permissions / acceptance lease 同组 exact refs**；
3. **Tool candidate policy 只返回专项 Agent entitlement 中已锁定的 Tool，不加载 Document Tool 全集**；
4. **Capability Lock 逐项核对 capability ID/revision，任一不一致 fail-closed**；
5. **Agent instructions 先读取再生成，不声称未执行的读取/写入**；
6. **门禁**：5 files / 23 tests（2 files / 9 + 3 files / 14）+ typecheck + focused ESLint + DTP-4 audit + git diff --check；
7. **边界**：无新增 Contract / migration 26 / 依赖 lockfile 不变 / 无 Workbench 附件选择 / 无 Personal Model / Admin / TGM / Knowledge / Agent Lifecycle。

**不**在本次复核范围：

- 不评估 VS2.2（Workbench 附件选择）；
- 不修改任何业务代码、Contract、依赖、migration、lockfile；
- 不替代 VS1 / DFI-4A.4.1 / STRM-3 / DFI-4A.4.2 既有独立 QA 结论；
- 不复跑历史 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.x / R2D-P.x / PRA-x harness（保持只读）。

### 1.2 方法

按 A~E 段顺序逐项只读对照：

- 实跑 `pnpm exec vitest run 5 个 focused test files`（Node v24.13.0, pnpm 11.11.0）；
- 实跑 `pnpm run typecheck` + 聚焦 ESLint（6 个 VS2.1 涉及文件）+ `pnpm run audit:dtp4` + `git diff --check`；
- 字面只读核对 `services/core/src/application/built-in-presentation-agent-source.ts` + `services/core/src/bootstrap/create-desktop-private-runtime.ts` + `services/core/src/application/internal-trial-enterprise-r2d-production.ts`；
- 实测 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `services/core/src/adapters/sqlite/migrations.ts` 末项 `id`；
- 实测 4 个 historical evidence SHA256 + v1alpha1 / v1alpha2 Contract SHA256；
- 验证 `apps/desktop/resources/personal-credential-helper/` 目录不存在。

---

## 二、关键事实核对

### 2.1 A 段：四项 Tool allowlist

✅ **字面完整命中**（实测 `create-desktop-private-runtime.ts:382-423`）：

- 字面 `:382-387`：
  ```ts
  const presentationToolCapabilityIds = [
    "tool.document.docx.read",
    "tool.document.xlsx.read",
    "tool.document.pdf.extract_text",
    PPTX_WRITE_CAPABILITY_ID,
  ] as const;
  ```
  —— 四项 Tool allowlist 字面一致（DOCX read / XLSX read / PDF text read / PPTX write）✅；
- 字面 `:388-393`：`presentationToolDefinitions` 从 `DOCUMENT_TOOL_REGISTRY_RECORDS.definitions.find(...)` 按 exact `capabilityId` 查找（**不加载 Document Tool 全集**，仅精确匹配四项）✅；
- 字面 `:394-398`：`internalTrialDeployment !== undefined && (presentationSkill === undefined || presentationToolDefinitions.some((definition) => definition === undefined))` → `throw new Error("internal_trial_presentation_runtime_incomplete")`（任一 tool definition 缺失 → fail-closed）✅；
- 字面 `:399-402`：`presentationToolRefs` 逐项映射 `{ capabilityId, capabilityRevision }`（exact ref）✅；
- 字面 `:414-423`：`new BuiltInPresentationAgentSource({ model, skill: presentationSkillRef, tools: presentationToolRefs, minimumContextWindow: 8_192 })`（allowlist 注入）✅。

### 2.2 B 段：Catalog / Registry / Entitlement / permissions / lease 同组 exact refs

✅ **字面命中**（实测 `create-desktop-private-runtime.ts:643-686`）：

- 字面 `:648-653` `enterpriseR2DRegistrySnapshot(internalTrialDeployment, activeRegistry.registryRevision, presentationSkillRef, presentationToolRefs)` —— **同一组 presentationToolRefs 进入 R2D Registry snapshot** ✅；
- 字面 `:654-658` model exact ref（modelId + revision + digest）✅；
- 字面 `:659-662` `skill: presentationSkillRef` + `tools: presentationToolRefs`（同一组 exact refs 进入 composition）✅；
- 字面 `:663-665` `presentationAgent` 传入 ✅。

### 2.3 C 段：Tool candidate policy 只返回专项 Agent entitlement 已锁定 Tool

✅ **字面命中**（实测 `create-desktop-private-runtime.ts:667-674`）：

```ts
toolPolicy: {
  async resolveExact(input) {
    return { registryRevision: input.registryRevision,
      authorityFactsDigest: input.workspaceAndAuthorizationFactsDigest,
      candidates: input.exactAgent.agentDefinitionId === "agent.presentation"
        ? input.entitlementSnapshot.tools
        : [] };
  },
},
```

- 字面 `:671-673` `input.exactAgent.agentDefinitionId === "agent.presentation" ? input.entitlementSnapshot.tools : []` —— **只有 `agent.presentation` 返回 entitlement 中的 tools，其他 agent 返回空数组**（不加载 Document Tool 全集）✅；
- 对比 local desktop 路径 `:720-725` `candidates: input.entitlementSnapshot.tools`（local desktop 无 presentation agent，其 entitlement 本身为空）—— 两条路径语义一致，internal-trial 路径增加 agent 身份判定 ✅。

### 2.4 D 段：Capability Lock 逐项核对 fail-closed

✅ **字面命中**（实测 `internal-trial-enterprise-r2d-production.ts:197-239`）：

- 字面 `:206-211`：
  ```ts
  if (input.orderedLockIds.length !== 1 + input.decision.toolCandidateRefs.length
    || input.decision.resolvedModelRef.modelId !== lease.model.modelId
    || input.decision.resolvedModelRef.revision !== lease.model.revision
    || input.decision.resolvedModelRef.digest !== lease.model.digest
    || input.registrySnapshot.registryRevision !== lease.registry.registryRevision) {
    throw new Error("selection.entitlement_invalid");
  }
  ```
  —— 锁数量 + model ref + registry revision 精确核对，任一不一致 fail-closed ✅；
- 字面 `:220-222`：model lock `definitionSnapshot.revision !== lease.model.revision` → `throw new Error("selection.model_unavailable")` ✅；
- 字面 `:223-229`：
  ```ts
  const toolLocks = input.decision.toolCandidateRefs.map((reference, index) => {
    const exactTool = lease.tools.find((tool) =>
      reference.capabilityId === tool.capabilityId
      && reference.capabilityRevision === tool.capabilityRevision);
    if (exactTool === undefined) {
      throw new Error("selection.tool_policy_unavailable");
    }
    ...
  });
  ```
  —— **每个 Tool 候选逐项核对 capabilityId + capabilityRevision，任一找不到 exact → fail-closed** ✅；
- 字面 `:238` `Object.freeze([prepared.lock, ...toolLocks])` ✅。

### 2.5 E 段：Agent instructions 先读取再生成

✅ **字面命中**（实测 `built-in-presentation-agent-source.ts:37-44`）：

- 字面 `:40` `"- 用户明确指定工作空间资料时，先调用与文件类型匹配的锁定读取工具，再依据真实 Tool 结果形成页级结构。"` ✅；
- 字面 `:41` `"- 形成适合受众的页级结构后调用锁定的 PPTX 工具；不得声称未执行的读取或写入结果。"` ✅；
- 字面 `:39` `"- 不编造用户未提供的数据、来源、进度或结论；缺少事实时使用明确占位或先说明限制。"` ✅；
- 字面 `:43` `"- Tool 失败时如实返回安全摘要，不伪造文件、路径或成功状态。"` ✅。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node 版本 | `node --version` | v24.13.0 ✅ |
| pnpm 版本 | `pnpm --version` | 11.11.0 ✅ |
| Focused tests（组1） | `vs1.2-presentation-skill.test.ts` + `vs1.1-internal-trial-enterprise-runtime.integration.test.ts` | **2 files / 9 tests PASS**（5 + 4） ✅ |
| Focused tests（组2） | `document-tool-context.test.ts` + `document-tool-registry.test.ts` + `scripts/audit-dtp4-packaging.test.mjs` | **3 files / 14 tests PASS**（7 + 5 + 2） ✅ |
| 合计 | 5 个 focused test files | **23 tests PASS**（Duration 2.60s） ✅ |
| Core typecheck | `pnpm run typecheck` | exit 0 ✅ |
| 聚焦 ESLint（6 个 VS2.1 涉及文件） | `npx eslint ...` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | `DTP-4 packaging audit passed.` ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |

**门禁全部吻合开发者声明**：2 files / 9 tests + 3 files / 14 tests = 5 files / 23 tests ✅。

### 3.2 字面只读核对（不计入门禁，仅事实校对）

| 字面落点 | 内容 | 状态 |
|---|---|---|
| `create-desktop-private-runtime.ts:382-387` | 四项 Tool allowlist | ✅ |
| `:394-398` | 任一 tool definition 缺失 → `internal_trial_presentation_runtime_incomplete` | ✅ |
| `:667-674` | Tool candidate policy 仅 `agent.presentation` 返回 entitlement tools | ✅ |
| `internal-trial-enterprise-r2d-production.ts:206-211` | 锁数量 + model + registry 精确核对 fail-closed | ✅ |
| `:220-222` | model lock revision 核对 fail-closed | ✅ |
| `:223-229` | Tool 逐项 capabilityId/revision 核对 fail-closed | ✅ |
| `built-in-presentation-agent-source.ts:40-41` | 先读取再生成 + 不声称未执行结果 | ✅ |

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-mvp.vs2.1` | ✅ 已 bump |
| Core `package.json` | `0.0.0-mvp.vs2.1` | ✅ 已 bump |
| Desktop `package.json` | `0.0.0-mvp.vs1.3` | ⚠️ 未 bump（本批无 Desktop 改动，合理） |
| Contracts `package.json` | `0.0.0-dfi.4a.4.2` | ✅ frozen |
| Admin `package.json` | `0.0.0-afe.6c` | ✅ frozen |

**观察（不计 P 级）**：报告 §顶部字面写"版本 `0.0.0-mvp.vs2.1`"，未显式标注"仅 Root/Core"。CHANGELOG 字面 `Root/Core 0.0.0-mvp.vs2.1` 正确标注了范围（不含 Desktop）。Desktop 保持 `vs1.3` 与报告 §5"没有实现 Workbench 附件选择"一致（Desktop 本批无改动），属诚实边界，非缺陷。

### 3.4 边界字面（不漂移核对）

| 边界项 | 字面 | 状态 |
|---|---|---|
| lockfile digest | `pnpm-lock.yaml` SHA256 = `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| migration max | `services/core/src/adapters/sqlite/migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| v1alpha1 Contract SHA256 | `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a` | ✅ 不变 |
| v1alpha2 Contract SHA256 | `f04b454eacadfebc194c7f71c988dd68815f801371bd339fbff6711c85e052e5` | ✅ 不变 |
| production Helper binary | `apps/desktop/resources/personal-credential-helper/` 不存在 | ✅ 不冒充 production ready |
| frozen STRM-3 evidence.json | SHA256 = `64bff1d5b3432bdbb61ab141b8658e454e8e59d02860a04844972481ee31a817` | ✅ 不变 |
| frozen DFI-4A.4.1 evidence.json | SHA256 = `5efbe9268e195b4acb9318e69e65f1c1e81cc94ac5945e012a529fb2509d67d1` | ✅ 不变 |
| frozen DFI-4A.4.2 evidence.json | SHA256 = `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb` | ✅ 不变 |
| frozen DFI-5.4.3 evidence.json | SHA256 = `6a11b1b2768276f58b263b9cd8a63f5096dbd735b51ef3b21e8910225e81cae3` | ✅ 不变 |

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 VS2.1 Workspace Source Read 工程 conformance：

- **四项 Tool allowlist** = `已实现`（DOCX read / XLSX read / PDF text read / PPTX write 字面 + exact ref）；
- **Tool candidate policy** = `已实现`（仅 `agent.presentation` 返回 entitlement tools，其余空数组）；
- **Capability Lock 逐项核对** = `已实现`（capabilityId + capabilityRevision 逐项 fail-closed）；
- **Agent instructions 先读取再生成** = `已实现`（字面落点 `built-in-presentation-agent-source.ts:40-41`）。

**本批不声明**：
- production ready；
- Workbench 附件选择（报告 §5 明确"没有实现"）；
- Personal Model / Admin mutation / TGM / Knowledge Provider / Agent Lifecycle 恢复；
- 以演示彩排或真实公网 Provider 冒烟作为关闭条件。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是（仅 VS2.1 Workspace Source Read 子批）
保持 INDEPENDENT QA PENDING：是
```

MVP-VS2.1 Workspace Source Read 的事实基础（四项 Tool allowlist 字面 + exact refs 同组 + Tool candidate policy 仅专项 Agent + Capability Lock 逐项 fail-closed + Agent instructions 先读后写 + 5 files / 23 tests PASS + typecheck + focused ESLint + DTP-4 audit + git diff --check + lockfile digest 不变 + migration max=26 + v1alpha1/v1alpha2 Contract SHA256 不变 + Helper binary 目录不存在 + 4 个 historical evidence SHA256 不漂移 + DEVELOPMENT-LOG.md / CHANGELOG.md / README.md VS2.1 条目）全部只读可证。

7 项独立评审问题逐项可独立回答：

1. **是**：四项 Tool allowlist（DOCX read / XLSX read / PDF text read / PPTX write）—— `create-desktop-private-runtime.ts:382-387` 字面 ✅
2. **是**：Catalog / R2D Registry / Entitlement / permissions / acceptance lease 同组 exact refs —— `:648-653` 字面 `enterpriseR2DRegistrySnapshot(... presentationToolRefs)` ✅
3. **是**：Tool candidate policy 只返回专项 Agent entitlement 已锁定 Tool —— `:667-674` 字面 `agent.presentation ? entitlementSnapshot.tools : []` ✅
4. **是**：Capability Lock 逐项核对 capability ID/revision fail-closed —— `internal-trial-enterprise-r2d-production.ts:223-229` 字面 ✅
5. **是**：Agent instructions 先读取再生成，不声称未执行的读取/写入 —— `built-in-presentation-agent-source.ts:40-41` 字面 ✅
6. **是**：5 files / 23 tests PASS + typecheck + ESLint + DTP-4 audit + git diff --check —— 实测全部吻合 ✅
7. **是**：边界不漂移（无新增 Contract / migration 26 / 依赖 lockfile 不变 / 无 Workbench 附件选择 / 无 Personal Model / Admin / TGM / Knowledge / Agent Lifecycle）—— 实测全部命中 ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；评审结论 **PASS（不附条件修订）**；可冻结：**是**（仅 VS2.1 Workspace Source Read 子批）；保持 `INDEPENDENT QA PENDING` → 待用户接受。
2. **决策 1**：是否接受 Desktop 版本保持 `vs1.3`（本批无 Desktop 改动）？**推荐：是** —— CHANGELOG 字面正确标注 "Root/Core"，Desktop 无改动属诚实边界。
3. **决策 2**：VS2.1 是否可进入 `PASS/CLOSED`？**推荐要求**先确认本报告 7 项字面落点 + 5 files / 23 tests harness 已实测 PASS + 边界不漂移。
4. **后续路径**：
   - VS2.1 接受后用户单独授权 VS2.2（Workbench 附件选择）；
   - 后续不建立新的 Foundation / Closure 链（DEVELOPMENT-LOG.md 字面 `下一步：交独立 QA 聚焦核对 VS2.1；接受后进入 VS2.2 Workbench 附件选择`）。

代码 QA 通过**不等于**用户接受。VS2.1 当前保持 `INDEPENDENT QA PENDING`，待：
- 用户接受本报告；
- 用户单独接受 VS2.1 Workspace Source Read 为 `PASS/CLOSED`。

方可启动 VS2.2 编码授权流程。本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）