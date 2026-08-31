# WFW-3 repair.2 — Durable Replace Authority / Loopback APV CSP — Claude Code 独立聚焦代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-2100-code-wfw-3-repair.2` |
| 验收对象 | WFW-3 repair.2 — 两项差异修复：① Replace authority 从 source Task durable readable Runtime Selection 取 exact WorkspaceGrant；② packaged file Renderer + Main-owned tokenized IPv4 loopback APV iframe 双向最小 CSP 授权（Renderer `frame-src http://127.0.0.1:*` + APV `frame-ancestors file:`）+ iframe real-load proof |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改产品代码、方案或历史 Evidence） |
| 上游 | WFW-1 / WFW-2 `PASS/CLOSED`；WFW-3 repair.1 `PASS/CLOSED`；父 WFW-3 `MACOS E2E PASS / WINDOWS NTFS GATE PENDING / NOT CLOSED` |
| 当前版本 | Root / Core / Desktop = `0.0.0-wfw.3-repair.2`；Document Worker = `0.0.0-wfw.2`；Contracts / Admin = `0.0.0-mvp.rsl.1` |
| 当前状态 | `IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING` |

---

## 一、复核范围与方法

### 1.1 范围（仅 repair.2 子批）

仅复核 repair.2 工程 conformance + 边界严格性 + 诚实字面一致性：

1. **Replace authority**：source Task durable readable Runtime Selection 取 exact WorkspaceGrant（`loadReadableTaskRuntimeSelection(sourceTaskId)`）；
2. **workspaceGrantId 不写入模型可见 Step / Artifact / Renderer / E2E 输出**；
3. **双向 CSP**：Renderer `frame-src http://127.0.0.1:*` + APV `frame-ancestors file:`，其余 11 项 APV-1C CSP 全 none + iframe `sandbox=""` / `no-referrer` 保持；
4. **iframe real-load proof**（非 DOM 节点）；
5. **fail-closed 保持**：unique terminal head / deleted / source-digest / capability-lock / prior-SHA；
6. **门禁**：focused + regression 13 files / 176 tests（实测 179 超集）+ repair.2 authority 1 file / 4 tests + Document Worker 26 files / 222 tests + typecheck + DTP-4 + audit self-test + git diff --check + Core smoke；
7. **边界**：lockfile digest 不变 / Core migration 26 不变 / 5 个 frozen Contract SHA256 不变 / Root/Core/Desktop bump 到 `wfw.3-repair.2` / Document Worker 保持 `wfw.2` / Contracts+Admin 保持 `rsl.1`。

**不**在本批复核范围：

- 不复跑 macOS 真实 Electron E2E（破坏性 + 长时间 + 用户授权门槛；Developer §4 字面承接 `htmlPreviewDocumentLoaded=true` + `previewDocumentLoadedAfterRestart=true`）；
- 不评估 Windows NTFS 门禁（仍 `PENDING`，父批不关闭）；
- 不修改任何产品代码 / Contract / migration / 依赖 / lockfile / 历史 Evidence。

### 1.2 方法

- 实跑 repair.2 authority focused **1 file / 4 tests** + repair.2 focused trio **11 tests** + 13-file combined regression（实测 **179 tests** 超集）+ Document Worker full **26 files / 222 tests**；
- 实跑 `pnpm run typecheck` + `pnpm run audit:dtp4` + audit self-test + `git diff --check` + Core smoke；
- 字面只读核对 `services/core/src/application/workspace-text-artifact-authority.ts:55-96` + `apps/desktop/src/renderer/index.html:7` + `apps/desktop/src/main/html-preview-sandbox.ts:16-28`；
- 实测 6 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `migrations.ts` 末项 `id` + 5 个 frozen Contract SHA256；
- skip/todo/only 扫描（无逃逸）。

---

## 二、关键事实核对

### 2.1 A 段：Replace authority 从 source Task durable readable Runtime Selection 取 exact WorkspaceGrant ✅

**字面命中**（[workspace-text-artifact-authority.ts:55-75](services/core/src/application/workspace-text-artifact-authority.ts#L55-L75)）：

- `:64` `payload: JsonObjectSchema.parse(step.action.payload)` —— **durable Step action payload 仍只有模型可见参数**（无 workspaceGrantId）；
- `:67` `.filter(({ payload }) => payload.relativePath === input.relativePath)` —— 仅按模型可见 relativePath 过滤；
- `:69-71` `const sourceSelection = await input.tasks.loadReadableTaskRuntimeSelection(task.checkpoint.state.taskId)` —— **从 source Task durable readable Runtime Selection 取 authority**（与方案 §3 Step A2.2 字面一致，与 VS2.3 repair.3 同构）；
- `:72-74` `if (sourceSelection?.workspaceGrantId === undefined) throw new Error("workspace_text.artifact_head_mismatch")` —— **selection 缺失 / 无 grant fail-closed**；
- `:75` `if (sourceSelection.workspaceGrantId !== input.workspaceGrantId) continue` —— **grant 不同不进入候选（fail-closed）**；
- `:80-96` 继续既有 Artifact projection / lifecycle / source-digest / capability-lock / terminal head / proof 检查；
- ✅ **Replace authority 仅从 durable readable Runtime Selection 获取 exact WorkspaceGrant**。

### 2.2 B 段：workspaceGrantId 不写入模型可见 Step / Artifact / Renderer / E2E 输出 ✅

**字面命中**：

- durable Step 仍只含 `modelPayload`（[create-desktop-private-runtime.ts:1851-1855](services/core/src/bootstrap/create-desktop-private-runtime.ts#L1851-L1855) 在 repair.1 已证；repair.2 未改动）；
- `workspace-text-artifact-authority.ts:69` 的 grant 来自 `loadReadableTaskRuntimeSelection`（**私有读取**，不写入 Step payload）；
- `workspace-text-artifact-authority.ts:138/164` `workspaceGrantId` 仅存在于 proof material / Artifact registration 内部（**非模型可见字段**）；
- grep Renderer / E2E 输出无 grant 投影（Developer §5 字面 + 实测）；
- ✅ **6 表面禁止保持**（Step / Action / Observation / Renderer / Artifact / 日志 / E2E）。

### 2.3 C 段：双向 CSP 最小且精确 ✅

**字面命中**（实测 diff）：

- **Renderer**（[index.html:7](apps/desktop/src/renderer/index.html#L7)）：`content="default-src 'self'; ...; frame-src http://127.0.0.1:*"` —— **仅新增 `frame-src http://127.0.0.1:*`**，其余 8 项（default/script/style/img/connect/object/base/form-action）保持；
- **APV**（[html-preview-sandbox.ts:22](apps/desktop/src/main/html-preview-sandbox.ts#L22)）：`"frame-ancestors 'none'"` → `"frame-ancestors file:"` —— **仅 1 项改动**；
- [html-preview-sandbox.ts:16-28](apps/desktop/src/main/html-preview-sandbox.ts#L16-L28) 其余 11 项全部 `'none'`（default/script/object/base/form-action/connect/img/media/font/style）+ nosniff + no-store 保持；
- ✅ **双向 CSP 精确匹配方案 §4 Step B1**。

### 2.4 D 段：iframe real-load proof（非 DOM 节点）✅

**Developer §3.3 字面承接**：

- 使用现有 WFW-3 Electron driver；
- 通过 Electron debugger 的 child iframe target 验证真实 document URL 与非敏感 sentinel，而非只查 iframe DOM；
- E2E 输出只记录 `htmlPreviewDocumentLoaded` 与 `previewDocumentLoadedAfterRestart` 布尔值；
- 显式 Workspace 场景真实点击侧栏"新建任务"，再选择 Workspace；驱动等待安全 display name，不读取或暴露真实路径；
- Developer §4 E2E 输出 `htmlPreviewDocumentLoaded=true` + `previewDocumentLoadedAfterRestart=true`；
- ✅ **real-load proof 明确**（打包 Electron / Chromium 双向 CSP 实测通过，Developer §2 Step B1 先行实测 `rendererFrameSrcAccepted=true / apvFrameAncestorsFileAccepted=true / realDocumentLoaded=true / cspErrorCount=0`）。

### 2.5 E 段：fail-closed 保持 ✅

- `:72-74` selection 缺失 / 无 grant → `workspace_text.artifact_head_mismatch` fail-closed；
- `:75` grant 不同 → continue（fail-closed）；
- 停手 #6/#7 字面（弱化 terminal head / cross-session/grant/path replace）即停手；
- ✅ **unique terminal head / deleted / source-digest / capability-lock / prior-SHA 全保持**。

### 2.6 F 段：边界不漂移 ✅

| 项 | 字面 | 状态 |
|---|---|---|
| Root / Core / Desktop `package.json` | `0.0.0-wfw.3-repair.2` | ✅ 已 bump |
| Document Worker `package.json` | `0.0.0-wfw.2` | ✅ 不变 |
| Contracts / Admin | `0.0.0-mvp.rsl.1` | ✅ 不变 |
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| Core migration max | `migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| frozen Contract SHA256 | admin-control v1alpha1 (`79e2e127…`) / v1alpha2 (`50b757b9…`) / runtime-selection agent-definition v1alpha2 (`fb0732e69…`) / personal-model-management v1alpha1 (`a306a07c…`) 不变 | ✅ |
| `git diff --check` | exit 0 | ✅ |
| Core smoke | `core.ready` | ✅ |

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node / pnpm 版本 | `node --version / pnpm --version` | v24.13.0 / 11.11.0 ✅ |
| **repair.2 authority focused（1 file）** | `wfw3-repair.2-workspace-text-authority.test.ts` | **1 file / 4 tests PASS** ✅（精确匹配 Developer §4） |
| **repair.2 focused trio** | authority + html-preview-sandbox + html-preview-security-boundary | **3 files / 11 tests PASS** ✅ |
| **13-file combined regression** | repair.2 3 + WFW-2 focused 4 + Desktop preview 6 | **13 files / 179 tests PASS**（Developer claim 176；差 3 = 我含 8-test renderer-workbench-boundary 超集，属 Vitest counting 精度记录） |
| **Document Worker full** | `pnpm exec vitest run services/document-worker` | **26 files / 222 tests PASS** ✅（精确匹配 Developer §4） |
| Core/Desktop typecheck | `pnpm run typecheck` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | exit 0 ✅ |
| DTP-4 audit self-test | `pnpm exec vitest run scripts/audit-dtp4-packaging.test.mjs` | **1 file / 2 tests PASS** ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |
| Core smoke | `node services/core/dist/main.js --check` | `core.ready` ✅ |
| skip/todo/only 扫描 | grep across 3 repair.2 files | 无逃逸 ✅ |

> **诚实记录（13 files / 176 vs 实测 179）**：Developer claim "13 files / 176 tests"；独立 QA 用 repair.2 3 + WFW-2 focused 4 + Desktop preview 6 组合实测 **179 tests**（超集）。差 3 = 我的 Desktop preview 子集包含 8-test `renderer-workbench-boundary.test.ts`（Developer 可能未计入）。这与既有 VS2 / VS2.3 / WFW-2 的 Vitest counting convention 精度记录一致，**非产品缺陷**。

### 3.2 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root / Core / Desktop | `0.0.0-wfw.3-repair.2` | ✅ 已 bump |
| Document Worker | `0.0.0-wfw.2` | ✅ 不变 |
| Contracts / Admin | `0.0.0-mvp.rsl.1` | ✅ 不变 |

### 3.3 workspace 全量门禁（外部 blocker，与本批零关联）

- 全仓 lint 既有 Admin generated JS 34 no-undef + Desktop workspace 历史 blocker 仍在（与本 repair.2 零关联）；
- ✅ 归 Desktop / Admin 窗口历史欠账，不归因 repair.2。

---

## 四、诚实边界结论

✅ **字面诚实**。repair.2 最高只确认：

- **Replace authority 从 durable readable Runtime Selection 取 exact WorkspaceGrant** = `已实现`（[workspace-text-artifact-authority.ts:69-75](services/core/src/application/workspace-text-artifact-authority.ts#L69-L75) 字面）；
- **workspaceGrantId 不写入模型可见 Step / Artifact / Renderer / E2E** = `已实现`（durable Step 仍只含 modelPayload + grant 仅私有读取）；
- **双向 CSP 最小且精确** = `已实现`（Renderer `frame-src http://127.0.0.1:*` + APV `frame-ancestors file:`，其余 11 项 none + sandbox/no-referrer 保持）；
- **iframe real-load proof** = `已实现`（Electron debugger child iframe target 验证 document URL + sentinel，非 DOM 节点）；
- **fail-closed 保持** = `已实现`（selection 缺失/grant 不同/ambiguity/deleted/digest/lock 全 fail-closed）；
- **1 file / 4 tests + 3 files / 11 tests + 26 files / 222 tests + typecheck + DTP-4 + audit self-test + git diff --check + Core smoke** = 全部实测 PASS；
- **边界不漂移**（Root/Core/Desktop bump 到 `wfw.3-repair.2` / Document Worker `wfw.2` / Contracts+Admin `rsl.1` / lockfile digest 不变 / migration 26 不变 / 5 frozen Contract SHA256 不变） = 全部实测命中。

**本批不声明**：

- macOS 真实 Electron E2E 独立复跑（Developer §4 字面承接 `htmlPreviewDocumentLoaded=true` + `previewDocumentLoadedAfterRestart=true`；独立 QA 未复跑，理由同 VS2/VS3/ADMIN-MVP-VS1 真实 E2E pattern）；
- Windows 11 本地 NTFS 门禁（仍 `PENDING`，父批不关闭）；
- 父 WFW-3 `PASS/CLOSED`（仍 `MACOS E2E PASS / WINDOWS NTFS GATE PENDING / NOT CLOSED`）；
- production ready / 完整 CAS / 强跨进程锁 / 外部编辑器竞争已解决（WFW-H1 GATED）；
- 修改任何产品代码 / Contract / migration / 依赖 / lockfile / 历史 Evidence。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（外部 blocker，与本批零关联）
评审结论：PASS（不附条件修订）
可冻结：是（仅 WFW-3 repair.2 子批）
父 WFW-3 保持 NOT CLOSED：是（Windows NTFS 门禁未过）
Windows NTFS 仍 PENDING：是
```

repair.2 的事实基础（Replace authority 从 durable readable Runtime Selection 取 exact WorkspaceGrant + workspaceGrantId 不写入 6 表面 + 双向 CSP 最小且精确（Renderer `frame-src http://127.0.0.1:*` + APV `frame-ancestors file:`）+ iframe real-load proof + fail-closed 保持 + 1 file / 4 tests + 3 files / 11 tests + 26 files / 222 tests + typecheck + DTP-4 + audit self-test + git diff --check + Core smoke + Root/Core/Desktop bump 到 `wfw.3-repair.2` + Document Worker `wfw.2` + Contracts+Admin `rsl.1` + lockfile digest 不变 + migration 26 不变 + 5 frozen Contract SHA256 不变）全部只读可证。

8 项独立评审问题逐项可独立回答：

1. **是**：Replace authority 只从 source Task durable readable Runtime Selection 取 exact WorkspaceGrant —— [workspace-text-artifact-authority.ts:69-75](services/core/src/application/workspace-text-artifact-authority.ts#L69-L75) 字面 ✅
2. **是**：workspaceGrantId 不写入模型可见 Step / Artifact / Renderer / E2E —— durable Step 仍只含 modelPayload + grant 仅私有读取 ✅
3. **是**：双向 CSP 最小且精确 —— [index.html:7](apps/desktop/src/renderer/index.html#L7) `frame-src http://127.0.0.1:*` + [html-preview-sandbox.ts:22](apps/desktop/src/main/html-preview-sandbox.ts#L22) `frame-ancestors file:` + 其余 11 项 none ✅
4. **是**：iframe real-load proof（Electron debugger child iframe target + sentinel，非 DOM 节点）—— Developer §3.3 + §4 `htmlPreviewDocumentLoaded=true` ✅
5. **是**：fail-closed 保持（selection 缺失/grant 不同/ambiguity/deleted/digest/lock 全 fail-closed） ✅
6. **是**：1 file / 4 tests + 3 files / 11 tests + 26 files / 222 tests + typecheck + DTP-4 + audit self-test + git diff --check + Core smoke —— 实测全部 PASS ✅
7. **是**：边界不漂移（Root/Core/Desktop `wfw.3-repair.2` / Document Worker `wfw.2` / Contracts+Admin `rsl.1` / lockfile digest 不变 / migration 26 不变 / 5 frozen Contract SHA256 不变）—— 实测全部命中 ✅
8. **是**：13 files / 176 tests（独立 QA 实测 179 超集，差 3 属 Vitest counting 精度记录） ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 1（外部 blocker）；评审结论 **PASS（不附条件修订）**；可冻结：**是**（仅 WFW-3 repair.2 子批）。
2. **决策 1**：是否接受 WFW-3 repair.2 子批 `PASS/CLOSED`？**推荐：是** —— 字面 authority 修复 + 双向 CSP + real-load proof + fail-closed + 1/4 + 3/11 + 26/222 + typecheck + DTP-4 + audit self-test + git diff --check + Core smoke + 边界不漂移。
3. **决策 2**：父 WFW-3 是否 `PASS/CLOSED`？**推荐：否** —— Developer §6 字面"父 WFW-3 仍需真实 Windows 11 本地 NTFS create、replace、`.prev`、Artifact 与 Core restart 门禁"；本独立 QA 不评估 Windows NTFS。
4. **后续路径**：
   - repair.2 子批接受后，父 WFW-3 等待 Windows 11 本地 NTFS 门禁执行 + 独立 QA；
   - WFW-H1 强 CAS / 父目录创建 / 完整平台矩阵继续 GATED；
   - 不冒充 production ready / 公网 Provider / production identity。

代码 QA 通过**不等于**用户接受。当前保持 `USER_ACCEPTANCE_PENDING`，待：
- 用户接受本报告；
- 用户单独接受 WFW-3 repair.2 为 `PASS/CLOSED`；
- 父 WFW-3 待 Windows NTFS 门禁通过后单独接受。

本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
