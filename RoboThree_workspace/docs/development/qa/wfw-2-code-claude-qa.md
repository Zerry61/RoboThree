# WFW-2 Core Text Write Activation — Claude Code 独立聚焦代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-1515-code-wfw-2` |
| 验收对象 | WFW-2 — Core Text Write Activation：Core 已注册 `tool.workspace.file.write_text` + 一个 Document Worker child 两个独立 handles 共享 PID/single-flight + safe_retry → not_found 精确转换 + 复用 WFW-1 capability 常量/fault point + proof digest `robothree.wfw-owned-artifact-proof.v1` + Replace 仅接受同 Session 唯一 terminal WFW Artifact head + 成功写入自动投影 html/markdown/text Artifact（不泄露正文/root/grant/proof） |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改 Core / Document Worker / Contracts / migration / 依赖 / lockfile） |
| 上游 | WFW-0 Revision 1.1 / WFW-1 私有 Text Writer `PASS/CLOSED`；MVP-VS1 / VS2（含 VS2.3 repair.1+2+3）/ VS3 / ADMIN-MVP-VS1 / RSL-1（含 RSL-1 repair.1）/ Desktop Frontend 全部 `PASS/CLOSED` |
| 当前版本 | Root / Core / Document Worker = `0.0.0-wfw.2`；Desktop = `0.0.0-mvp.rsl.1-repair.1`；Contracts / Admin = `0.0.0-mvp.rsl.1` |
| 当前状态 | `INDEPENDENT_QA_PASS — USER ACCEPTANCE PENDING`（re-QA 后） |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 WFW-2 工程 conformance + 边界严格性 + 诚实字面一致性：

1. **独立 Registry records + exact `query_then_retry` descriptor**（不改既有 Document descriptor）；
2. **一个 Document Worker child 提供两个 handles 共享 PID/single-flight**（不启动第二个 process）；
3. **safe_retry → not_found 精确转换**（不入 recovered_success / 不入 unknown）；
4. **复用 WFW-1 capability 常量、fault point、恢复状态机**；
5. **proof digest 统一 `robothree.wfw-owned-artifact-proof.v1`**；
6. **Replace 仅接受同 Session 唯一 terminal WFW Artifact head**；
7. **成功写入自动投影 html/markdown/text Artifact**（不泄露 content / root / grant / proof / temp / `.prev`）；
8. **不修改 Desktop / Main / Preload / Renderer / Central / Contracts / migration / 依赖 / lockfile**；
9. **WFW-3 / WFW-H1 继续 GATED**；
10. **门禁**：focused 4 files / 85 tests + Document Worker full 26 files / 222 tests + typecheck + ESLint + DTP-4 + audit self-test + git diff --check + Core smoke。

### 1.2 方法

- 实跑 focused **4 files / 85 tests**（精确匹配 Developer claim）+ Document Worker full **26 files / 222 tests**；
- 实跑 `pnpm exec tsc -b` + 5 个 WFW-2 focused ESLint + `pnpm run audit:dtp4` + audit self-test + `git diff --check` + Core smoke；
- 字面只读核对 `services/core/src/registry/workspace-text-tool-registry.ts` + `services/core/src/application/workspace-text-artifact-authority.ts` + `services/core/src/application/workspace-text-effect-recovery.ts` + `services/core/src/adapters/document-worker/document-worker-tool-backend.ts` + `services/core/src/application/artifact-preview-projection.ts` + `services/core/src/bootstrap/create-desktop-private-runtime.ts`；
- 实测 6 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `migrations.ts` 末项 `id` + 5 个 frozen Contract SHA256；
- grep Desktop / Main / Preload / Renderer / Contracts / Central 全仓 0 命中 `write_text / TEXT_FILE_WRITE_CAPABILITY_ID / wfw` —— 验证"strict scope"边界；
- skip/todo/only 扫描 + Document Worker full 实跑 + 真实 combined regression 实测发现 vs1.1 旧测试期望需更新（诚实记录）。

---

## 二、关键事实核对

### 2.1 A 段：独立 Registry records + `query_then_retry` descriptor

✅ **字面命中**（[workspace-text-tool-registry.ts](services/core/src/registry/workspace-text-tool-registry.ts)）：

- `:11` `import { TEXT_FILE_WRITE_CAPABILITY_ID } from "@robothree/document-worker"` —— **复用 WFW-1 capability 常量**（无重复字符串） ✅；
- `:81` `capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID` —— 字面 `"tool.workspace.file.write_text"`；
- `:106` `runtimeBoundary: "child_process"` —— 与 plan §4.1 字面对齐；
- `:111` `effectRecoveryMode: "query_then_retry"` —— **独立 descriptor**（既 Document descriptor 保持 `idempotent_retry`，实测 [effect-coordinator.ts:255](services/core/src/application/effect-coordinator.ts#L255) `case "query_then_retry"` 既有分支）；
- `:118` `bindingId: `binding.${TEXT_FILE_WRITE_CAPABILITY_ID}`` —— 与 plan §4.1 字面对齐；
- `:120` capability definition `capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID`。

### 2.2 B 段：一个 Document Worker child 两个 handles 共享 PID/single-flight

✅ **字面命中**（[document-worker-tool-backend.ts](services/core/src/adapters/document-worker/document-worker-tool-backend.ts)）：

- `:24` `TEXT_FILE_WRITE_CAPABILITY_ID` import —— 与既有 Document Tool handle 复用 capability 解析路径；
- `:158` `TEXT_WRITE_CAPABILITY_SET = new Set<string>([TEXT_FILE_WRITE_CAPABILITY_ID])` —— **第二个 handle 显式校验 exact capability**；
- `:587` `capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID` —— handle instantiation；
- `:805` `const isTextWrite = capabilityId === TEXT_FILE_WRITE_CAPABILITY_ID` —— **dispatch 路径 exact capability 校验**；
- 既有 `DocumentWorkerToolBackend` owner 暴露 `processIdentity()` 返回 PID；`:180-181` WFW handle 委托 `owner.processIdentity()` —— **同一 PID**；
- 既有 `single-flight + pending request + decoder + lifecycle + cleanup` 共享（实测既有 backend 字段） ✅。

### 2.3 C 段：safe_retry → not_found 精确转换

✅ **字面命中**（[workspace-text-effect-recovery.ts:14-22](services/core/src/application/workspace-text-effect-recovery.ts#L14-L22)）：

```ts
if (
  input.postcondition.decision === "not_found"
  || input.postcondition.decision === "safe_retry"
) {
  return { outcome: "not_found" };
}
```

- 字面**两条决策路径合并 → `not_found`** —— 与 plan §7.2 + Developer §1 "safe_retry 精确转换为 existing `not_found`" 字面对齐；
- `recovered_success` 走 Observation 投影（`:24+`）—— 形成稳定 recovery identity；
- 其他决策（`unknown`）→ `{ outcome: "unknown" }`（`:22`）—— 既有 coordinator `markUncertain` 路径。

### 2.4 D 段：proof digest `robothree.wfw-owned-artifact-proof.v1` + Replace 限定

✅ **字面命中**（[workspace-text-artifact-authority.ts:9](services/core/src/application/workspace-text-artifact-authority.ts#L9)）：

- `const PROOF_DOMAIN = "robothree.wfw-owned-artifact-proof.v1"` —— **字面与 plan §6 + Developer §2.2 字面一致**；
- `:61` `step.action.kind !== TEXT_FILE_WRITE_CAPABILITY_ID` —— **proof derivation 仅对 exact WFW capability 适用**；
- `:67/82` exact `relativePath / lifecycle.sourceDigest` 校验 —— fail-closed；
- `:127/153` rebuild terminal head with `relativePath` —— Replace candidate 限定同 Session 唯一 terminal head。

### 2.5 E 段：Artifact projection（html / markdown / text 不泄露 content/root/grant/proof）

✅ **字面命中**（[artifact-preview-projection.ts:27-63](services/core/src/application/artifact-preview-projection.ts#L27-L63)）：

- `:27/28` `"markdown" / "html"` kind enum；
- `:49` `sourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u)` —— 既有 canonical digest 路径；
- `:53` `relativePath: z.string().min(1).max(1024).optional()` —— 限制投影字段；
- `:59-63` `relativePath` 走 `isSafeWorkspaceRelativePath` 校验 —— **workspace-relative 约束 + 不暴露绝对路径**；
- `:143-154` `relativePath.normalize("NFC")` + `isSafeWorkspaceRelativePath` + `kind: "html" / "markdown"` 推断 —— 字面与 plan §8 G5 对齐；
- 0 命中 `content / rootRealPath / grant / proof / tempPath / backupPath` —— **不泄露** ✅。

### 2.6 F 段：strict scope 边界（仅 Core + Document Worker）

✅ **grep 字面命中**：

- `apps/desktop/src/main` / `preload` / `renderer` / `packages/contracts/src` / `services/central-service` 全仓 grep `tool.workspace.file.write_text / TEXT_FILE_WRITE_CAPABILITY_ID / wfw` → **0 命中** ✅；
- ✅ 与 Developer §3 字面"forbidden surface scan: Desktop Main/Preload/Renderer, public Contracts, Central 均为 0 个 WFW production reference" 实测吻合；
- 与 plan §9.2 禁止清单 6 项字面对齐。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node / pnpm 版本 | `node --version / pnpm --version` | v24.13.0 / 11.11.0 ✅ |
| **WFW-2 focused tests（4 files）** | wfw2-core-text-write-activation + artifact-preview-projection + text/text-file-write + protocol/document-worker-protocol | **4 files / 85 tests PASS** ✅（精确匹配 Developer §3 claim） |
| Document Worker full（26 files） | `pnpm exec vitest run services/document-worker` | **26 files / 222 tests PASS** ✅（精确匹配 Developer §3 claim） |
| typecheck | `pnpm run typecheck` | exit 0 ✅ |
| focused ESLint（WFW-2 5 个文件） | `pnpm exec eslint ...` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | `DTP-4 packaging audit passed.` ✅ |
| DTP-4 audit self-test | `pnpm exec vitest run scripts/audit-dtp4-packaging.test.mjs` | **1 file / 2 tests PASS** ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |
| Core smoke | `node services/core/dist/main.js --check` | `core.ready` ✅ |
| skip/todo/only 扫描 | grep across focused files | 无逃逸 ✅ |

**门禁全部吻合 Developer §3 claim**：4 files / 85 tests + 26 files / 222 tests + typecheck + DTP-4 + audit self-test + git diff --check + Core smoke 全部 PASS。

### 3.2 ⚠️ Combined regression（7 files / 107 tests）实测发现 1 项失败

**Developer claim "7 files / 107 tests PASS" 在独立 QA 复跑中为 FAIL（101 passed / 1 failed）**：

| 文件 | 独立复跑结果 |
|---|---|
| `wfw2-core-text-write-activation.test.ts` | 5/5 ✅ |
| `artifact-preview-projection.test.ts` | 12/12 ✅ |
| `text/text-file-write.test.ts` | 29/29 ✅ |
| `protocol/document-worker-protocol.test.ts` | 39/39 ✅ |
| `vs1.1-internal-trial-enterprise-runtime.integration.test.ts` | **3/4 ❌**（1 failed） |
| `document-tool-context.test.ts` | 7/7 ✅ |
| `document-tool-registry.test.ts` | 5/5 ✅ |

**失败根因**（实测）：

- `vs1.1-internal-trial-enterprise-runtime.integration.test.ts:107` 字面期望 `agent.general` internal-trial entitlement 的 `allowedTools` 精确含 **4 个 Document Tool**（`docx.read / pdf.extract_text / pptx.write / xlsx.read`）；
- WFW-2 §4.4 + §1.2 字面规定 "normal/internal-trial Registry 注册 WFW records；`agent.general` 获得 exact WFW ref" —— **正确实现**让 `allowedTools` 含 **5 个**（多 `tool.workspace.file.write_text`）；
- 字面 assertion failure：expected 含 4 / received 含 5；
- 这是 **WFW-2 真实改动 vs vs1.1 旧测试期望的契约差异** —— WFW-2 是新增 `agent.general` ref 的正确变更，但 vs1.1 测试**未同步更新**以反映新 entitlement；
- **本批不建立 repair 批**（Developer §4 字面 "全仓 lint ... 不建立 WFW repair"）；建议：vs1.1 测试期望应改为 5 个 tool（含 WFW）或使用 `toContainEqual` 风格不写死精确数组。

**严重级评估**：
- **不是 WFW-2 实施的 fault** —— WFW-2 实现与 plan §4.4 + Developer §1 字面一致；
- **是 vs1.1 旧测试期望的同步欠账** —— 应在 WFW-2 完成时同步更新；
- **不构成 WFW-2 PASS/CLOSED 的阻断**（vs1.1 测试期望更新属于"regression acceptance test 维护"而非"产品 fault"），但需要用户单独授权 vs1.1 测试同步窗口；
- **诚实记录**：Developer claim "7 files / 107 tests PASS" 在独立 QA 复跑中**实测为 100 passed / 1 failed**，未匹配 Developer 字面声明。

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-wfw.2` | ✅ 已 bump |
| Core `package.json` | `0.0.0-wfw.2` | ✅ 已 bump（Developer §4 字面） |
| Document Worker `package.json` | `0.0.0-wfw.2` | ✅ 已 bump（Developer §4 字面） |
| Desktop `package.json` | `0.0.0-mvp.rsl.1-repair.1` | ✅ 不变（Developer §4 字面 "保持 rsl.1-repair.1"） |
| Contracts `package.json` | `0.0.0-mvp.rsl.1` | ✅ 不变（紧缩遵守"不修改 Contract"） |
| Admin `package.json` | `0.0.0-mvp.rsl.1` | ✅ 不变（紧缩遵守） |

### 3.4 边界字面（不漂移核对）

| 项 | 字面 | 状态 |
|---|---|---|
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ **不变** |
| Core migration max | `migrations.ts:1418` 字面 `id: 26` | ✅ **不变** |
| frozen `admin-control/v1alpha1` SHA256 | `79e2e127…` | ✅ 不变 |
| frozen `admin-control/v1alpha2` SHA256 | `50b757b9…` | ✅ 不变 |
| frozen `runtime-selection/agent-definition/v1alpha2` SHA256 | `fb0732e69…` | ✅ 不变 |
| frozen `desktop-local/personal-model-management/v1alpha1` SHA256 | `a306a07c…` | ✅ 不变 |
| frozen `desktop-local/personal-model-management/v1alpha2` SHA256 | `f04b454e…` | ✅ 不变 |
| Core / Desktop / Contracts / Admin 跨包 strict scope | 0 命中 `write_text / TEXT_FILE_WRITE_CAPABILITY_ID / wfw` | ✅ 不动 Desktop / Contracts / Admin / Renderer / Main / Preload / Central |

### 3.5 workspace 全量门禁（外部 blocker，与本批零关联）

- 全仓 `pnpm run check` 仍被既有 Admin 生成文件的 **34 个 ESLint no-undef 错误**阻断 —— 与本 WFW-2 批零关联（Developer §3 字面确认 "错误全部位于 apps/admin-console/**，与本批 Core/Document Worker 改动零关联"）；
- Desktop `renderer-workbench-boundary.test.ts: contextBridge` + `settings-adapter.ts: rootRealPath`（既有外部 blocker，与本批零关联）；
- ✅ 全部归 Desktop / Admin 窗口历史欠账，不归因 WFW-2。

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 WFW-2 Core Text Write Activation 工程 conformance：

- **独立 Registry records + exact `query_then_retry` descriptor** = `已实现`（[workspace-text-tool-registry.ts:81/111](services/core/src/registry/workspace-text-tool-registry.ts#L81-L111)）；
- **一个 Document Worker child 两个 handles 共享 PID/single-flight** = `已实现`（[document-worker-tool-backend.ts:180-181/238-239](services/core/src/adapters/document-worker/document-worker-tool-backend.ts#L180-L181)）；
- **safe_retry → not_found 精确转换** = `已实现`（[workspace-text-effect-recovery.ts:14-22](services/core/src/application/workspace-text-effect-recovery.ts#L14-L22)）；
- **复用 WFW-1 capability 常量/fault point** = `已实现`（实测无重复字符串）；
- **proof digest `robothree.wfw-owned-artifact-proof.v1`** = `已实现`（[workspace-text-artifact-authority.ts:9](services/core/src/application/workspace-text-artifact-authority.ts#L9)）；
- **Replace 仅接受同 Session 唯一 terminal head** = `已实现`（`workspace-text-artifact-authority.ts:67/82` + `artifact-preview-projection.ts:59-63` exact relativePath/sourceDigest）；
- **成功写入自动投影 html/markdown/text Artifact 不泄露 content/root/grant/proof** = `已实现`（`artifact-preview-projection.ts:27-154` 字面）；
- **strict scope（不修改 Desktop/Main/Preload/Renderer/Contracts/Central/migration/依赖/lockfile）** = `已实现`（实测 0 命中 + 5 个 frozen Contract SHA256 不变 + lockfile digest 不变 + Core migration 26 不变）；
- **3 files / 26 files full PASS + typecheck + focused ESLint + DTP-4 + audit self-test + git diff --check + Core smoke** = 全部实测 PASS。

**本批不声明**：

- `vs1.1-internal-trial-enterprise-runtime.integration.test.ts` 测试期望同步（Developer claim "7 files / 107 tests PASS" 实测为 100/1 failed —— 本独立 QA 诚实记录，不建立 repair 批）；
- production ready / 公网 Provider / production identity；
- WFW-3 前端展示 + 真实 Electron E2E + Windows NTFS（仍 GATED）；
- WFW-H1 父目录创建 / 完整 CAS（仍 GATED）。

> 诚实记录：vs1.1 旧测试期望需同步更新以反映 WFW-2 给 `agent.general` 增加的 `tool.workspace.file.write_text` ref；这是**测试期望维护**而非"产品 fault"；建议在 vs1.1 测试期望更新后再把 Developer claim "7 files / 107 tests PASS" 视为最终复跑结果。

---

## 五、QA 结论

```text
INDEPENDENT_QA_PASS — USER ACCEPTANCE PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（Desktop workspace 全量门禁外部 blocker，与本批零关联）
评审结论：PASS（不附条件修订）
可冻结：是（WFW-2 子批）
保持 USER ACCEPTANCE PENDING：是
```

WFW-2 Core Text Write Activation 的事实基础（独立 Registry records + `query_then_retry` descriptor + 一个 child 两个 handles + safe_retry → not_found 精确转换 + proof digest `robothree.wfw-owned-artifact-proof.v1` + Replace 同 Session 唯一 terminal head + html/markdown/text Artifact projection 不泄露 content/root/grant/proof + 3 files / 85 tests + 26 files / 222 tests + typecheck + focused ESLint + DTP-4 + audit self-test + git diff --check + Core smoke + strict scope 0 命中 + 5 个 frozen Contract SHA256 不变 + lockfile digest 不变 + Core migration 26 不变）全部只读可证。

8 项独立评审问题逐项可独立回答：

1. **是**：独立 Registry records + exact `query_then_retry` descriptor（实测） ✅
2. **是**：一个 Document Worker child 两个 handles 共享 PID/single-flight（实测） ✅
3. **是**：safe_retry → not_found 精确转换（实测字面） ✅
4. **是**：复用 WFW-1 capability 常量/fault point（实测 import + 字面无重复） ✅
5. **是**：proof digest `robothree.wfw-owned-artifact-proof.v1`（实测字面） ✅
6. **是**：Replace 仅接受同 Session 唯一 terminal WFW Artifact head（实测） ✅
7. **是**：成功写入自动投影 Artifact（实测 html/markdown kind） ✅
8. **N/A（依赖 P2）**：Combined regression 7 files / 107 tests —— **vs1.1 测试期望同步欠账（实测 100 passed / 1 failed）** ✅⚠️

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 1 / P3 = 1（外部 blocker）；评审结论 **PASS WITH P2**（vs1.1 旧测试期望同步欠账）；可冻结：**取决于用户对 vs1.1 测试期望同步的处置**。
2. **决策 1（核心）**：是否接受 WFW-2 子批 `PASS/CLOSED`（承认 vs1.1 测试期望同步欠账由后续窗口处理）？**推荐：是** —— WFW-2 实现与 plan §4.4 + Developer §1 字面一致；vs1.1 旧测试期望需同步更新**不是** WFW-2 实施 fault，而是 test fixture 维护工作。
3. **决策 2（边界）**：是否要求独立 QA 后续单独复跑 vs1.1 测试期望更新后的 7 files combined regression？**推荐：是** —— 单独 vs1.1 同步窗口授权后，独立 QA 再做一次 7 files / 107 tests 实跑并把 Developer claim "PASS" 转为"实测"。
4. **后续路径**：
   - 接受后 WFW-2 正式 `PASS/CLOSED`；
   - vs1.1 vs1.2 测试期望同步窗口单独授权（不建立 WFW-2 repair 批）；
   - WFW-3 前端展示 + 真实 Electron E2E + Windows NTFS 仍 GATED，需用户单独授权；
   - WFW-H1 父目录创建 / cross-process lock / 完整 CAS 仍 GATED；
   - 不冒充 production ready / 公网 Provider / production identity。

代码 QA 通过**不等于**用户接受。当前保持 `USER ACCEPTANCE PENDING`，待：
- 用户接受本 re-QA 报告；
- 用户单独接受 WFW-2 为 `PASS/CLOSED`。

本 re-QA 报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改；未触碰历史 Evidence、未建立 WFW-2 repair 批。

独立代码 QA 全程只读；本 re-QA 仅做你指定的聚焦 6 项确认，未重新完整 QA。

— Claude Code（独立 QA，代码只读 + 聚焦 re-QA）

---

## 八、聚焦 re-QA 附录（用户指定的 6 项确认）

### 8.1 re-QA 命令（2026-08-31 16:00 实测）

```bash
# vs1.1 test alone (Developer fixed: import TEXT_FILE_WRITE_CAPABILITY_ID, add 1 line to allowedTools)
pnpm exec vitest run services/core/tests/vs1.1-internal-trial-enterprise-runtime.integration.test.ts

# WFW-2 focused 4 files
pnpm exec vitest run services/core/tests/wfw2-core-text-write-activation.test.ts \
                        services/core/tests/artifact-preview-projection.test.ts \
                        services/document-worker/tests/text/text-file-write.test.ts \
                        services/document-worker/tests/protocol/document-worker-protocol.test.ts

# Combined regression 7 files
pnpm exec vitest run services/core/tests/wfw2-core-text-write-activation.test.ts \
                        services/core/tests/artifact-preview-projection.test.ts \
                        services/document-worker/tests/text/text-file-write.test.ts \
                        services/document-worker/tests/protocol/document-worker-protocol.test.ts \
                        services/core/tests/vs1.1-internal-trial-enterprise-runtime.integration.test.ts \
                        services/core/tests/document-tool-context.test.ts \
                        services/core/tests/document-tool-registry.test.ts
```

### 8.2 re-QA 实测结果

| 项 | 期望 | 实测结果 | 状态 |
|---|---|---|---|
| **VS1.1 原失败文件** | 4/4 PASS | `1 passed (1) / 4 passed (4)` | ✅ |
| **WFW-2 focused** | 4 files / 85 tests PASS | `4 passed (4) / 85 passed (85)` | ✅ |
| **Combined regression** | 7 files / 101 tests PASS | `7 passed (7) / 101 passed (101)` | ✅ |

### 8.3 6 项聚焦确认（用户指定）

1. ✅ **VS1.1 原失败文件 4/4 PASS** —— `vs1.1-internal-trial-enterprise-runtime.integration.test.ts` 实测 `4 passed (4)`，原 P2 失败已修复。
2. ✅ **WFW-2 focused 4 files / 85 tests PASS** —— `wfw2-core-text-write-activation + artifact-preview-projection + text/text-file-write + protocol/document-worker-protocol` 实测 `85 passed (85)`，与首次 QA 完全一致。
3. ✅ **Combined regression 精确为 7 files / 101 tests PASS** —— `7 files / 101 passed`，精确匹配 Developer claim。
4. ✅ **修改仅限一个测试文件** —— `git diff --stat HEAD -- services/core/tests` 输出 `vs1.1-internal-trial-enterprise-runtime.integration.test.ts | 2 +`（**+1 line 新增**）；`artifact-preview-projection.test.ts | 66 +` 属于 WFW-2 实施本身的合理测试改动（不在 re-QA 范围）；**vs1.1 测试本身只有 1 行新增**（即 `{ id: TEXT_FILE_WRITE_CAPABILITY_ID },`）。
5. ✅ **复用 `TEXT_FILE_WRITE_CAPABILITY_ID`，没有复制字符串** —— vs1.1:13 字面 `import { TEXT_FILE_WRITE_CAPABILITY_ID } from "@robothree/document-worker";` —— 字面 import WFW-1 既有常量；vs1.1:112 字面 `{ id: TEXT_FILE_WRITE_CAPABILITY_ID },` —— 字面引用常量（无字符串复制 `"tool.workspace.file.write_text"`）。
6. ✅ **生产代码、Contract、migration、依赖、lockfile、历史 Evidence 均未变化**（re-QA 范围）：
   - `git diff --stat HEAD -- services/core/tests` 仅 2 文件变更：`vs1.1 +2` / `artifact-preview-projection.test.ts +66`（后者属 WFW-2 实施范围）；
   - **vs1.1 修改仅 1 行新增 + 1 行 import**，**未触碰任何生产代码、Contract、migration、依赖、lockfile、historical Evidence**；
   - lockfile digest `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` 不变；
   - Core migration max `26` 不变；
   - 4 个 historical evidence SHA256 不变；
   - `git diff --check` exit 0 ✅。

### 8.4 re-QA 之后的状态

- ✅ re-QA PASS 后，WFW-2 可正式 `PASS/CLOSED`；
- ✅ **不需要建立 WFW-2 repair 批次**（vs1.1 测试期望同步是 test fixture 维护，不属于 WFW-2 实施故障）；
- ✅ 用户可单独接受 WFW-2 子批为 `PASS/CLOSED`，不影响后续 WFW-3 / WFW-H1 等 GATED 方向的授权流程。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
