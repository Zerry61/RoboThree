# WFW-3 repair.1 — Task-generated Workspace HTML Preview Authority — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-1700-plan-wfw-3-repair.1` |
| 验收对象 | [WFW-3 repair.1 — Task-generated Workspace HTML Preview Authority 聚焦方案](../development/wfw/WFW-3-repair.1-TASK-GENERATED-WORKSPACE-HTML-PREVIEW-AUTHORITY-DEVELOPMENT-PLAN.md)（仅文档级复核；不重做 WFW-3 父批全评审；编码仍 GATED） |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改方案、业务代码、Contract、依赖、migration、lockfile） |
| 上游 | WFW-1 / WFW-2 `PASS/CLOSED`；WFW-3 父批 Renderer 部分 PASS + 真实 Electron E2E 在 HTML preview authority 处 `IMPLEMENTATION PAUSED`；[停手报告](../development/wfw/WFW-3-IMPLEMENTATION-STOP-REPORT.md) |
| 当前状态 | `FOCUSED REPAIR PLAN / DOCUMENT REVIEW PENDING / CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围（仅 repair.1 与父 WFW-3 阻塞链的差异）

不重做 WFW-3 父批全评审；只确认本 repair：

1. **阻塞链是否确为 Main `#startWorkspaceHtmlPreview` 排除 Task-generated Artifact**；
2. **Core `resolveArtifactFileSource` 是否为既有安全的 source authority**（可信任）；
3. **最小修复是否只调 `#startWorkspaceHtmlPreview` 分类条件 + focused tests**；
4. **`taskId` 是否只用于来源事实、不进入 Renderer/日志**；
5. **不新增 IPC/Preload/Core/Contract/migration/依赖/lockfile**；
6. **manual Workspace HTML / PPTX / non-HTML routing 零回归**；
7. **真实 Electron WFW-3 E2E 恢复到后续步骤 + Windows NTFS 仍 pending**。

### 1.2 方法

- 全文精读 repair.1 方案（110 行，7 节）+ 父停手报告；
- 只读核对 `apps/desktop/src/main/desktop-ipc-router.ts`（`:643-690` `#startWorkspaceHtmlPreview` 字面 `:646` `resolveArtifactFileSource` + `:657` `if (!source.ok || source.value.taskId !== undefined) return undefined`）+ `services/core/src/application/desktop-task-projection-service.ts`（`#findArtifact` + `#workspaceGrantIdForArtifactMatch` + `loadWorkspaceGrant`）；
- 程序化核对 repair.1 QA 项覆盖 + git diff --check。

---

## 二、关键事实核对（父停手报告 + repair.1 §1）

| 方案声明（§1） | 代码字面 | 结果 |
|---|---|---|
| `resolveArtifactFileSource(artifactId)` 是既有 Core 私有 source-authority 入口，会验证 durable Artifact、Task、Runtime Selection 与 active WorkspaceGrant，并只向 Main 返回受控 `rootRealPath + relativePath` | [desktop-task-projection-service.ts:775/833/843/861](services/core/src/application/desktop-task-projection-service.ts#L775-L861) 字面 `#findArtifact` + `#workspaceGrantIdForArtifactMatch` + `loadWorkspaceGrant` + `relativePath` | ✅ |
| Main `#startWorkspaceHtmlPreview` 当前只接受 `taskId === undefined`，所以合法 WFW Task Artifact 被排除 | [desktop-ipc-router.ts:657](apps/desktop/src/main/desktop-ipc-router.ts#L657) 字面 `if (!source.ok || source.value.taskId !== undefined) return undefined` —— **一票否决 `taskId !== undefined`** | ✅ |
| 最终错误为既有 `task.not_found` 安全映射，不是文件未生成或 Renderer 选择错误 | 父停手报告 §2 字面 `wfw3_html_preview_html_error_task_not_found` | ✅ |
| 成功写入后 Artifact `kind=html`，Renderer 正确选择既有 HTML preview API | 父停手报告 §2 步骤 5-6 + Renderer 部分 PASS | ✅ |
| 复用 `resolvePreviewableContainedFile` HTML allowlist + realpath containment + size/identity 检查 | [desktop-ipc-router.ts:660-673](apps/desktop/src/main/desktop-ipc-router.ts#L660-L673) 字面 | ✅ |
| 复用 `readStableFilePreview` 与 existing `HtmlPreviewSandbox` | [desktop-ipc-router.ts:679-696](apps/desktop/src/main/desktop-ipc-router.ts#L679-L696) 字面 + [html-preview-sandbox.ts](apps/desktop/src/main/html-preview-sandbox.ts) | ✅ |

**结论**：repair.1 §1 引用的阻塞链 + 既有安全接缝**全部字面命中**。父停手报告 §2 的 10 步精确失败链（`real Electron Main → production Preload → real Core child → real Document Worker child → default workspace → Gateway exact lock → 模型 Tool Call → Task 完成 → index.html 真实落盘 → Artifact kind=html → Workbench 显示"文件已生成" → startArtifactHtmlPreview → #startWorkspaceHtmlPreview 排除 → task.not_found`）与代码字面完全一致。

---

## 三、按父 WFW-3 停手条件 + repair.1 范围的聚焦复核

### 1. 阻塞链是否确为 Main `#startWorkspaceHtmlPreview` 排除 Task-generated Artifact

**答：✅。** `#startWorkspaceHtmlPreview:657` 字面 `if (!source.ok || source.value.taskId !== undefined) return undefined` —— **一票否决任何带 taskId 的 Workspace HTML Artifact**；WFW Task-generated HTML Artifact 必然带 `taskId`（来自 WFW Task），所以被排除。父停手报告 §2 步骤 7-10 字面验证。

### 2. Core `resolveArtifactFileSource` 是否为既有安全的 source authority

**答：✅。** `#findArtifact`（扫描 session + tasks + step.observation.outcome === "succeeded" + artifact.sourceId === step.observation.observationId）+ `#workspaceGrantIdForArtifactMatch`（match.workspaceGrantId → payload.workspaceGrantId → loadTaskRuntimeSelection）+ `loadWorkspaceGrant(workspaceGrantId) && grant.status === "active"` —— **既有 Core 私有 source authority 已在 VS2.3 repair.3 / WFW-2 中验证**。

### 3. 最小修复是否只调 `#startWorkspaceHtmlPreview` 分类条件 + focused tests

**答：✅。** repair.1 §2 允许修改清单仅含 `apps/desktop/src/main/desktop-ipc-router.ts` + `apps/desktop/tests/**` + `scripts/run-wfw3-*.mjs` + 治理文档 + 版本/命令（仅 repair 通过后）—— **不新增 IPC/Preload/Core/Contract/migration/依赖/lockfile**。

### 4. `taskId` 是否只用于来源事实、不进入 Renderer/日志

**答：✅。** repair.1 §3 字面"不把 `taskId`、root、grantId、绝对路径、proof 或正文暴露给 Renderer" + §4 字面"`taskId` 只用于区分来源事实，不进入 Renderer 返回值或日志"。

### 5. 不新增 IPC/Preload/Core/Contract/migration/依赖/lockfile

**答：✅。** repair.1 §3 禁止清单 7 项 + §6 停手 7 项全部互锁。

### 6. manual Workspace HTML / PPTX / non-HTML routing 零回归

**答：✅。** repair.1 §4 Step 1 focused proof 固定四种来源：manual HTML 保持成功 + Task-generated WFW HTML 允许进入 + Task-generated non-HTML 不进入 Workspace HTML branch + source failure/inactive/path escape/file drift 保持既有 safe failure；§5 聚焦 QA 5 项"manual HTML preview 零回归 + PPTX/non-HTML routing 零回归"。

### 7. 真实 Electron WFW-3 E2E 恢复到后续步骤 + Windows NTFS 仍 pending

**答：✅。** repair.1 §4 Step 3 字面"复跑同一 driver，继续完成 default create → HTML preview → owned replace → .prev → Core SIGKILL/reopen → preview → explicit Workspace create/no-fallback → Markdown preview → resource cleanup" + §7 字面"Windows NTFS 仍是 WFW-3 最终 closure 的独立必要门禁，不由 repair.1 伪造"。

---

## 四、发现的问题

### 无 P0 / 无 P1

### P2-1 — repair.1 §4 Step 1 focused proof 的"四种来源"需在实施时给出具体断言（精确性，不阻断）

- Step 1 字面"固定四种来源"但未给具体 `it()` 数量或 fixture 构造方式；
- 建议：Step 1 focused proof 给出 4 个 test case 字面（manual HTML success / Task WFW HTML allowed / Task non-HTML skip / source failure fail-closed）+ 复用既有 `desktop-ipc-router.test.ts` fixture；
- 严重级 P2 而非 P1：方案 §5 已列出 10 项验证，实施时可逐项映射。

### P2-2 — `source.value.taskId !== undefined` 一票否决改为"先要求 resolve 成功"后的分类语义需精确（精确性，不阻断）

- 现状 `:657` `if (!source.ok || source.value.taskId !== undefined) return undefined`；
- repair.1 §4 字面"不再以 `taskId !== undefined` 作为一票否决；先要求 `resolveArtifactFileSource` 成功" —— 但**是否完全移除 taskId 判断**还是"taskId 存在但 source.ok 时允许"未精确写明；
- 建议：Step 1 focused proof 明确新条件（如 `if (!source.ok) return undefined;` + 后续走既有 contained-file 链；taskId 仅作日志/来源事实不参与拒绝）—— 避免把"manual HTML"和"Task WFW HTML"两路合并时误伤 manual；
- 严重级 P2 而非 P1：方案 §4 字面"先要求 resolve 成功 + 继续复用 resolvePreviewableContainedFile"，实施时按字面落地即可。

### P3-1 — repair.1 §5"empty sandbox、CSP、no-referrer 保持"需在 Step 2 验证 HTML iframe 属性未被修改（精确性）

- 父 WFW-3 Renderer 已完成 `empty sandbox + referrerpolicy="no-referrer"`；
- repair.1 只改 Main preview authority，不应触碰 Renderer iframe 属性；
- 建议：Step 2 后 grep `sandbox="" / referrerpolicy="no-referrer"` 在 WorkbenchCreatePage.vue 仍存在 —— 零回归验证；
- 严重级 P3：不影响通过。

### P3-2 — repair.1 §7"最高只允许 WFW3_REPAIR1_TASK_GENERATED_HTML_PREVIEW_AUTHORITY_CONFORMANT" 与父 WFW-3 outcome 的边界需在恢复 E2E 时明确（精确性）

- repair.1 通过后只恢复父 WFW-3 的同一 E2E；父 outcome 仍为 `WFW3_DESKTOP_TEXT_WRITE_E2E_CONFORMANT`；
- repair.1 自身最高输出 `WFW3_REPAIR1_TASK_GENERATED_HTML_PREVIEW_AUTHORITY_CONFORMANT` 与父 outcome 不同 —— 需在 E2E driver 输出 JSON 中区分两层（repair.1 的 authority conformant + 父 WFW-3 的 desktop E2E conformant）；
- 严重级 P3：不影响通过，实施报告 commit message 备注。

---

## 五、聚焦评审问题

1. **是否确认 repair.1 只修复 Main HTML preview authority 的既有分类条件？** —— ✅ 接受。§2 允许清单仅 1 个生产文件 + tests + scripts。
2. **是否确认 Core `resolveArtifactFileSource` 是安全来源、可作为唯一 authority？** —— ✅ 接受。既有 Core 私有 source authority（已验证 durable Artifact + Task + Runtime Selection + active grant）。
3. **是否确认 `taskId` 不进入 Renderer/日志/错误？** —— ✅ 接受。§3 + §4 字面。
4. **是否确认 manual / PPTX / non-HTML routing 零回归？** —— ✅ 接受。§4 Step 1 四种来源 focused proof。
5. **是否确认不新增 IPC/Preload/Core/Contract/migration/依赖/lockfile？** —— ✅ 接受。§3 + §6。
6. **是否确认 Windows NTFS gate 不由 repair.1 伪造？** —— ✅ 接受。§7 诚实边界。
7. **是否确认 repair.1 通过 ≠ WFW-3 关闭？** —— ✅ 接受。§7 字面"repair.1 通过后只恢复父 WFW-3 的同一 E2E 与剩余门禁"。

---

## 六、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 2，P3 = 2
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
```

**与开发者自检的差异**：开发者自检未给出 P 级；严格复核发现 **2 项 P2**（Step 1 四种来源具体断言 + taskId 一票否决改判后的分类语义）+ **2 项 P3**（HTML iframe 属性零回归验证 + repair.1/父 WFW-3 outcome 两层区分）。**无 P0 / 无 P1**，全部 P2/P3 均为"实施精确性"层面（方案意图明确、QA 已覆盖），**不阻断授权**。

**对编码授权的条件**：用户接受本复核 + 接受父停手报告结论 + 接受 P2/P3 在 Step 1 focused proof 中以 commit message + focused test 形式锁定后，**可单独授权 repair.1 编码**。

**本复核未触发任何 RED**。

---

## 七、与既有的 RoboThree 评审规则对齐

- 仅复核本次 repair.1 方案的差异部分，不重做 WFW-3 父批全评审（按用户指示）；
- 因 `0.0.0-wfw.3` 尚未建立（父批 paused + repair.1 GATED），本复核报告**不**回链到 DEVELOPMENT-LOG；
- 报告落盘到 `docs/development/qa/wfw-3-repair.1-plan-claude-review.md`，遵循 `<version-or-scope>-claude-review.md` 命名规范；
- 严格保持只读，未修改任何文件。

— Claude Code（独立文档复核，只读）
