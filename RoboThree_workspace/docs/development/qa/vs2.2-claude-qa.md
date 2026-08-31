# MVP-VS2.2 Workbench 附件选择 / Durable File Selection — Claude Code 独立聚焦代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-2335-code-vs2.2` |
| 验收对象 | VS2.2 Workbench 附件选择与 Durable File Selection：当前授权 Workspace 内选择 DOCX/XLSX/PDF（最多 4 项）、Renderer 只接触安全相对路径、提交前/读取前 SHA-256 + size fail-closed |
| 日期 | 2026-08-29 |
| 复核者 | Claude Code（独立 QA，仅只读，不修改任何业务代码/Contract/依赖/migration/lockfile） |
| 上游 | MVP-VS1 / VS2.1（均已 `PASS/CLOSED`）+ DFI-4A.4 / STRM-3 / DFI-4A.4.1 / DFI-4A.4.2（已 `PASS/CLOSED`） |
| 当前状态 | `PASS/CLOSED`（独立 QA 后经用户正式接受） |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 VS2.2 的事实可证性 + 边界严格性 + 诚实字面一致性：

1. **附件入口**：仅当前 active/read-write Workspace、仅 DOCX/XLSX/PDF、最多 4 项、可移除；
2. **切换 Workspace 自动清空**，避免跨 authority 复用；
3. **Renderer 只看到 displayName + mediaType + relativePath**，不投影 rootRealPath / 文件内容 / 哈希；
4. **Main picker 只接收 workspaceGrantId**，绝对路径由 Main 从 authority rootRealPath 解析；
5. **提交前 Main 重新计算 SHA-256/size**，drift 返回 `artifact.source_changed`，验证先于 Session/Task 创建；
6. **复用既有 SQLite manual Artifact registration**，不新增通用文件平台 / 第二套状态机 / 公开 Contract；
7. **read Tool 在 execution build 与 effect dispatch 两个窗口按 SQLite registration 再核对 SHA-256/size**；
8. **门禁**：5 files / 43 tests（VS2.2 focused）+ 5 files / 23 tests（VS2.1 regression）+ typecheck + build + focused ESLint + DTP-4 audit + git diff --check + Core/Desktop smoke；
9. **边界**：migration 26 / lockfile 不变 / frozen Contract SHA256 不变 / 无 Personal Model / Admin mutation / TGM / Knowledge / Agent Lifecycle。

**不**在本次复核范围：

- 不评估 VS2.3（read 后/write 前崩溃恢复、Task 页业务步骤文案、真实 Electron 联合 E2E）；
- 不修改任何业务代码、Contract、依赖、migration、lockfile；
- 不替代 VS1 / VS2.1 / DFI-4A.4.x / STRM-3 既有独立 QA 结论；
- 不复跑历史 STRM-3 / DFI-4A.4.x / DFI-5.x / R2D-P.x / PRA-x harness（保持只读）。

### 1.2 方法

按字面只读对照 + 实跑门禁：

- 实跑 VS2.2 focused 5 files / 43 tests + VS2.1 historical regression 5 files / 23 tests（Node v24.13.0, pnpm 11.11.0, Vitest 4.1.10）；
- 实跑 `pnpm run typecheck` + `pnpm run build`（tsc + preload + renderer）+ 聚焦 ESLint（11 个 VS2.2 涉及 TS 文件）+ `pnpm run audit:dtp4` + `git diff --check` + Core/Desktop smoke；
- 字面只读核对 `apps/desktop/src/renderer/adapters/workbench-adapter.ts` + `apps/desktop/src/renderer/pages/workbench/WorkbenchCreatePage.vue` + `apps/desktop/src/main/desktop-ipc-router.ts` + `services/core/src/bootstrap/create-desktop-private-runtime.ts` + `services/core/src/application/desktop-application-facade.ts` + `services/core/src/adapters/sqlite/sqlite-desktop-foundation-persistence.ts`；
- 实测 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `migrations.ts` 末项 `id`；
- 实测 4 个 historical evidence SHA256 + frozen v1alpha1/v1alpha2 Contract SHA256。

---

## 二、关键事实核对

### 2.1 A 段：附件入口（当前 Workspace / 类型 allowlist / 最多 4 / 可移除）

✅ **字面完整命中**：

- `workbench-adapter.ts:287-291` `SUPPORTED_WORKSPACE_ATTACHMENT_MEDIA_TYPES` 字面只含三项：
  ```ts
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // XLSX
  "application/pdf",                                                         // PDF
  ```
  —— 仅 DOCX/XLSX/PDF 三项 allowlist ✅；
- `workbench-adapter.ts:293-305` `assertSupportedWorkspaceAttachment` 要求 `sourceKind === "workspace_file"` + `relativePath !== undefined` + mediaType 命中 allowlist，否则抛错 ✅；
- `WorkbenchCreatePage.vue:217` `:disabled="... || attachments.length >= 4"` 与 `:567` `if (... attachments.value.length >= 4) return;` —— 最多 4 项 ✅；
- `WorkbenchCreatePage.vue:229-234` 移除按钮 → `removeAttachment`（`:583-586`）✅；
- `WorkbenchCreatePage.vue:226-227` 只渲染 `displayName` + `attachmentTypeLabel(mediaType)` + `relativePath` —— 不渲染绝对路径/哈希/内容 ✅。

### 2.2 B 段：切换 Workspace 自动清空

✅ **字面命中**（`WorkbenchCreatePage.vue:487-492`）：

```ts
watch(() => selection.workspaceGrantId, (next, previous) => {
  if (previous !== undefined && previous !== "" && next !== previous) {
    attachments.value = [];
    attachmentNotice.value = "工作区已切换，请重新选择资料。";
  }
});
```

—— 切换 Workspace 时清空附件，避免跨 authority 复用 ✅。

### 2.3 C 段：Main picker 只接收 workspaceGrantId，绝对路径由 Main 解析

✅ **字面命中**（`desktop-ipc-router.ts:319-431` `#registerWorkspaceArtifactFromPicker`）：

- `:329-334` `listWorkspaceGrantAuthorities` → 过滤 `status === "active" && accessMode === "read_write"`；
- `:335-338` 传入 `workspaceGrantId` 时进一步过滤到该 grant —— **仅当前授权 Workspace**；
- `:351-360` 选择路径时，无 `expectedArtifact` 走 `#chooseWorkspaceArtifactFile`；有 `expectedArtifact` 走 `resolve(eligibleAuthorities[0]!.rootRealPath, expectedArtifact.relativePath)` —— **Renderer 从不提供绝对路径，Main 从 authority rootRealPath + relativePath 解析**；
- `:362-365` `resolveRegisterableWorkspaceFile` 校验 containment / symlink / hardlink / size / mediaType / relativePath（`desktop-ipc-router.ts:896-964`）✅；
- `:945-949` `hashStableFile`（`:981-1023`）打开文件前 `sameFileIdentity`，读完后再 `sameStableFile`，漂移即 `source_changed`，最终产出 `fileSha256`（`createHash("sha256")`）✅。

### 2.4 D 段：提交前验证先于 Session/Task 创建，drift fail-closed

✅ **字面命中**（`workbench-adapter.ts:157-184`）：

- `:160-169` 对每个 attachment 先 `assertSupportedWorkspaceAttachment` + `await validateWorkbenchAttachment(...)`（带 `workspaceGrantId` + `artifact`）；
- 全部验证通过后 `:174-184` 才 `createSession` / `openSession` —— **验证先于 Session/Task 创建**；
- `desktop-ipc-router.ts:212-218` `validateWorkbenchAttachment` → `#registerWorkspaceArtifactFromPicker(command, { workspaceGrantId, expectedArtifact })`；
- `desktop-ipc-router.ts:378-398` `expectedArtifact` 的 sourceKind / relativePath / displayName / mediaType / byteSize 任一不一致 → `artifact.source_changed`；`:409-426` 注册后 artifactId / sourceDigest 任一不一致 → 同样 `artifact.source_changed` —— **fail-closed** ✅。

### 2.5 E 段：复用既有 SQLite manual Artifact registration

✅ **字面命中**：

- `desktop-application-facade.ts:1210-1222` `registerWorkspaceArtifact` → `this.#tasks.registerManualArtifact(parsed.value)` —— 复用既有 manual Artifact 持久化，未新增通用文件平台；
- `:2318-2339` `parsePrivateWorkspaceArtifactRegistration` 校验 `fileSha256` 必须 `/^[0-9a-f]{64}$/u`；
- `sqlite-desktop-foundation-persistence.ts:419-445 / 534 / 777-802` 既有 `sourceDigest` conflict 规则与 `file_sha256` / `byte_size` 列 —— 未新增 migration（末项仍 `id: 26`）。

### 2.6 F 段：read Tool 两窗口再核对 SHA-256/size

✅ **字面命中**（`create-desktop-private-runtime.ts`）：

- `:1384-1388` `WORKSPACE_SOURCE_READ_CAPABILITY_IDS = ["tool.document.docx.read", "tool.document.xlsx.read", "tool.document.pdf.extract_text"]` —— 仅对三个 read Tool 生效；
- `:1390-1421` `validateWorkspaceAttachmentIdentity`：
  - `:1398-1402` `findManualArtifactRegistrationByWorkspacePath({ workspaceGrantId, relativePath })` 查 SQLite registration；
  - `:1405` `if (registration === undefined) return;` —— **VS2.1 手写相对路径（未注册）继续可用**；
  - `:1407-1415` `lstat` 拒绝 symlink/hardlink/非文件 → `readFile` → `createHash("sha256")` → `bytes.byteLength !== registration.byteSize || fileSha256 !== registration.fileSha256` → throw `workspace.attachment_identity_changed`（避免同名替换）✅；
- **两个窗口**：
  - 窗口 1（execution build）：`:1219` `validateWorkspaceAttachmentIdentity(...)` 在 Document Tool 调用绑定时调用；
  - 窗口 2（effect dispatch）：`:1361` `hydrateDesktopDocumentToolAction`（经 `:525` `hydrateAction` 注入）在 effect dispatch 前再次调用；
  —— 两窗口都按 SQLite registration 再核对 SHA-256/size ✅。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node 版本 | `node --version` | v24.13.0 ✅ |
| pnpm 版本 | `pnpm --version` | 11.11.0 ✅ |
| VS2.2 focused tests | `vs2.2-workspace-attachment-identity` + `workbench-adapter` + `workbench-create-page` + `desktop-ipc-router` + `create-desktop-api` | **5 files / 43 tests PASS**（3 + 6 + 12 + 20 + 2） ✅ |
| VS2.1 historical regression | `vs1.2-presentation-skill` + `vs1.1-internal-trial-runtime` + `document-tool-context` + `document-tool-registry` + `audit-dtp4-self-test` | **5 files / 23 tests PASS**（5 + 4 + 7 + 5 + 2） ✅ |
| Core/Desktop typecheck | `pnpm run typecheck`（`tsc -b --pretty false`） | exit 0 ✅ |
| 构建（tsc + preload + renderer） | `pnpm run build` | PASS（vite built，154 modules，`WorkbenchCreatePage` 产物在列） ✅ |
| 聚焦 ESLint（11 个 VS2.2 TS 文件） | `pnpm exec eslint ...` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | `DTP-4 packaging audit passed.` ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |
| Core smoke | `node services/core/dist/main.js --check` | `core.ready`，exit 0 ✅ |
| Desktop foundation smoke | `node apps/desktop/dist/main/foundation-smoke.js` | `status: ready`（`fixtureOnly: true`），exit 0 ✅ |

**门禁全部吻合开发者声明**：VS2.2 focused 5 files / 43 tests + VS2.1 regression 5 files / 23 tests ✅。

> 说明：`vs2.2-workspace-attachment-identity.test.ts`（services/core/tests，3 tests）是 VS2.2 focused 的第 5 个文件；`renderer-workbench-boundary.test.ts`（8 tests，Aug-28 生成）不在本批 focused 集内。按 focused 集实跑得到精确 43 tests，与开发者声明一致。

### 3.2 字面只读核对（不计入门禁，仅事实校对）

| 字面落点 | 内容 | 状态 |
|---|---|---|
| `workbench-adapter.ts:287-291` | DOCX/XLSX/PDF 三项 allowlist | ✅ |
| `workbench-adapter.ts:293-305` | sourceKind/relativePath/mediaType 校验 | ✅ |
| `workbench-adapter.ts:160-184` | 验证先于 Session 创建 | ✅ |
| `workbench-adapter.ts:307-322` | bindWorkspaceAttachments 只输出 relativePath | ✅ |
| `WorkbenchCreatePage.vue:217/567` | 最多 4 项 | ✅ |
| `WorkbenchCreatePage.vue:487-492` | 切换 Workspace 清空附件 | ✅ |
| `desktop-ipc-router.ts:335-360` | 只接收 workspaceGrantId，Main 解析绝对路径 | ✅ |
| `desktop-ipc-router.ts:378-426` | expectedArtifact 漂移 → artifact.source_changed | ✅ |
| `desktop-ipc-router.ts:981-1023` | hashStableFile 前/后 identity 校验 | ✅ |
| `create-desktop-private-runtime.ts:1219 / 1361` | read Tool 两窗口再核对 | ✅ |
| `create-desktop-private-runtime.ts:1390-1421` | SHA-256/size 逐项 fail-closed | ✅ |

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-mvp.vs2.2` | ✅ 已 bump |
| Core `package.json` | `0.0.0-mvp.vs2.2` | ✅ 已 bump |
| Desktop `package.json` | `0.0.0-mvp.vs2.2` | ✅ 已 bump（本批有 Desktop 改动，正确） |
| Contracts `package.json` | `0.0.0-dfi.4a.4.2` | ✅ frozen |
| Admin `package.json` | `0.0.0-afe.6c` | ✅ frozen |

**观察（不计 P 级）**：本批 Desktop 正确 bump 到 `vs2.2`（与 VS2.1 不同，VS2.2 有 Renderer/Preload/Main 改动）。CHANGELOG 字面 `Root/Core/Desktop 0.0.0-mvp.vs2.2` 正确标注了三包范围。

### 3.4 边界字面（不漂移核对）

| 边界项 | 字面 | 状态 |
|---|---|---|
| lockfile digest | `pnpm-lock.yaml` SHA256 = `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| migration max | `services/core/src/adapters/sqlite/migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| frozen v1alpha1 Contract | `packages/contracts/src/desktop-local/personal-model-management/v1alpha1/index.ts` = `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a` | ✅ 不变 |
| frozen v1alpha2 Contract | `packages/contracts/src/desktop-local/personal-model-management/v1alpha2/index.ts` = `f04b454eacadfebc194c7f71c988dd68815f801371bd339fbff6711c85e052e5` | ✅ 不变 |
| v1alpha1/v1alpha2 主 Contract | `desktop-local/v1alpha1/` + `v1alpha2/` + `runtime-selection/v1alpha2.ts` 自 snapshot 无改动（`git status` 空） | ✅ 不变 |
| frozen STRM-3 evidence.json | `64bff1d5b3432bdbb61ab141b8658e454e8e59d02860a04844972481ee31a817` | ✅ 不变 |
| frozen DFI-4A.4.1 evidence.json | `5efbe9268e195b4acb9318e69e65f1c1e81cc94ac5945e012a529fb2509d67d1` | ✅ 不变 |
| frozen DFI-4A.4.2 evidence.json | `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb` | ✅ 不变 |
| frozen DFI-5.4.3 evidence.json | `6a11b1b2768276f58b263b9cd8a63f5096dbd735b51ef3b21e8910225e81cae3` | ✅ 不变 |

**无新增公开 Contract**：`artifact.source_changed` 字面位于 `desktop-local/v1alpha1/error.ts:41`，该文件自 snapshot 无改动（`git status` 空），即该错误码是 VS2.2 之前的既有码，VS2.2 只是复用。VS2.2 新增的 `WorkbenchAttachmentPickerCommandSchema` / `WorkbenchAttachmentValidationCommandSchema` / `RegisterWorkspaceArtifactReceiptSchema` 均为 app-private 或既有 schema，未落到 `packages/contracts` 公开面。

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 VS2.2 Workbench 附件选择与 durable file selection 工程 conformance：

- **附件入口** = `已实现`（当前 Workspace / DOCX/XLSX/PDF / ≤4 / 可移除）；
- **切换 Workspace 清空** = `已实现`（`watch workspaceGrantId`）；
- **Renderer 安全相对路径** = `已实现`（仅 displayName + mediaType + relativePath）；
- **提交前 fail-closed** = `已实现`（验证先于 Session/Task 创建，`artifact.source_changed`）；
- **SQLite 复用** = `已实现`（`registerManualArtifact`，未新增文件平台/状态机）；
- **read Tool 两窗口再核对** = `已实现`（execution build + effect dispatch 双窗口 SHA-256/size）。

**本批不声明**：
- production ready；
- read 后/write 前崩溃恢复、Task 页业务步骤文案、真实 Electron 联合 E2E（均属 VS2.3）；
- Personal Model / Admin mutation / TGM / Knowledge Provider / Agent Lifecycle 恢复；
- 以演示彩排或真实公网 Provider 冒烟作为关闭条件。

> 注：Desktop foundation smoke 输出 `fixtureOnly: true`，属 fixture 冒烟而非真实 Electron 联合运行，与报告 §5 诚实边界一致，不计缺陷。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是（仅 VS2.2 Workbench 附件选择子批）
保持 INDEPENDENT QA PENDING：是
```

MVP-VS2.2 的事实基础（附件入口 allowlist + 切换清空 + Renderer 安全相对路径 + Main 解析绝对路径 + 提交前 SHA-256/size fail-closed + SQLite 复用 + read Tool 两窗口再核对 + 5 files / 43 tests + 5 files / 23 tests + typecheck + build + focused ESLint + DTP-4 audit + git diff --check + Core/Desktop smoke + migration max=26 + lockfile digest 不变 + frozen Contract/evidence SHA256 不漂移 + CHANGELOG / README / DEVELOPMENT-LOG VS2.2 条目）全部只读可证。

9 项独立评审问题逐项可独立回答：

1. **是**：仅当前 active/read-write Workspace 可选，DOCX/XLSX/PDF 三项 allowlist，最多 4 项，可移除 —— `workbench-adapter.ts:287-291` + `WorkbenchCreatePage.vue:217/567` 字面 ✅
2. **是**：切换 Workspace 自动清空 —— `WorkbenchCreatePage.vue:487-492` 字面 ✅
3. **是**：Renderer 只看到 displayName/mediaType/relativePath —— `WorkbenchCreatePage.vue:226-227` 字面 ✅
4. **是**：Main picker 只接收 workspaceGrantId，绝对路径由 Main 解析 —— `desktop-ipc-router.ts:335-360` 字面 ✅
5. **是**：提交前 Main 重新计算 SHA-256/size，drift → `artifact.source_changed`，验证先于 Session/Task —— `workbench-adapter.ts:160-184` + `desktop-ipc-router.ts:378-426` 字面 ✅
6. **是**：复用既有 SQLite manual Artifact registration —— `desktop-application-facade.ts:1210-1222` + `sqlite-desktop-foundation-persistence.ts` 字面 ✅
7. **是**：read Tool 两窗口（execution build + effect dispatch）按 SQLite registration 再核对 SHA-256/size —— `create-desktop-private-runtime.ts:1219/1361/1390-1421` 字面 ✅
8. **是**：门禁全 PASS（5 files / 43 + 5 files / 23 + typecheck + build + ESLint + DTP-4 + diff-check + smoke）—— 实测全部吻合 ✅
9. **是**：边界不漂移（migration 26 / lockfile 不变 / frozen Contract + 4 evidence SHA256 不变 / 无 Personal Model / Admin / TGM / Knowledge / Lifecycle）—— 实测全部命中 ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；评审结论 **PASS（不附条件修订）**；可冻结：**是**（仅 VS2.2 子批）；保持 `INDEPENDENT QA PENDING` → 待用户接受。
2. **决策 1**：是否接受 Desktop 版本 bump 到 `vs2.2`（本批有 Desktop 改动）？**推荐：是** —— CHANGELOG 字面 `Root/Core/Desktop 0.0.0-mvp.vs2.2` 正确标注三包范围。
3. **决策 2**：VS2.2 是否可进入 `PASS/CLOSED`？**推荐要求**先确认本报告 9 项字面落点 + 5 files / 43 tests + 5 files / 23 tests harness 已实测 PASS + 边界不漂移。
4. **后续路径**：
   - VS2.2 接受后用户单独授权 VS2.3（read 后/write 前崩溃恢复 + Task 页业务步骤文案 + 真实 Electron 联合 E2E）；
   - 后续不建立新的 Foundation / Closure 链（DEVELOPMENT-LOG 字面 `下一步：独立 QA 聚焦复跑 VS2.2；用户接受后进入 VS2.3 联合恢复与产品收口`）。

代码 QA 通过**不等于**用户接受。VS2.2 当前保持 `INDEPENDENT QA PENDING`，待：
- 用户接受本报告；
- 用户单独接受 VS2.2 Workbench 附件选择为 `PASS/CLOSED`。

方可启动 VS2.3 编码授权流程。本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）

## 七、用户接受

用户已正式接受本报告的 `CODE_QA_PASS` 结论，VS2.2 标记为 `PASS/CLOSED`。`fixtureOnly:true` 继续作为
fixture smoke 的诚实边界，不视为真实 Electron 联合 E2E；VS2.3 未因本次关闭自动获得编码授权。
