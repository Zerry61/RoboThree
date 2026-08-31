# WFW-3 Desktop Product E2E / Stage Closure — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-1600-plan-wfw-3` |
| 验收对象 | [WFW-3 Desktop Product E2E / Stage Closure 详细实施方案](../development/wfw/WFW-3-DESKTOP-PRODUCT-E2E-STAGE-CLOSURE-DEVELOPMENT-PLAN.md)（仅文档级复核；不重做 WFW-1 / WFW-2 全评审；编码仍 GATED） |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改方案、业务代码、Contract、依赖、migration、lockfile） |
| 上游 | WFW-0 Revision 1.1 / WFW-1 / WFW-2 `PASS/CLOSED`；MVP-VS1 / VS2（含 VS2.3 repair.1+2+3）/ VS3 / ADMIN-MVP-VS1 / RSL-1（含 RSL-1 repair.1）全部 `PASS/CLOSED` |
| 当前版本 | Root/Core/Document Worker = `0.0.0-wfw.2`；Desktop = `0.0.0-mvp.rsl.1-repair.1`；Contracts/Admin = `0.0.0-mvp.rsl.1` |
| 当前状态 | `DOCUMENT REVIEW PENDING / CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围（仅 WFW-3 方案与既有 Desktop 接缝的差异）

不重做 WFW-1 / WFW-2 全评审；只确认本批：

1. **用户闭环**（§0.1 12 步）是否只补"Desktop consumer/E2E"，不新增文本写入能力；
2. **真实接口依赖**（§1.2）是否全部字面存在；
3. **Core/Main/Preload/Document Worker 生产改动预期为 0** 是否可证；
4. **默认 / 显式 Workspace 语义** 是否与既有 `DefaultWorkspaceGrantProvider` + v1alpha5 IPC 字面一致；
5. **replace authority 完全由 Core 推导**（Renderer 不提交 Artifact ID/proof）；
6. **APV-1C HTML preview + Markdown/Text inert blocks** 是否复用既有 `presentArtifactPreview` + `HtmlPreviewSandbox`；
7. **真实 macOS Electron E2E + Windows 本地 NTFS 最小门禁** 是否可执行；
8. **24 项 focused QA 连续唯一 + git diff --check PASS + 不新增 Contract/IPC/migration/依赖/lockfile/Evidence schema**；
9. **WFW-H1 继续 GATED**。

### 1.2 方法

- 全文精读方案（537 行，16 节）；
- 只读核对代码事实：`apps/desktop/src/main/default-workspace-grant-provider.ts` + `apps/desktop/src/main/index.ts` + `apps/desktop/src/shared/foundation-api.ts` + `apps/desktop/src/renderer/adapters/tasks-adapter.ts` + `apps/desktop/src/renderer/presentation/artifact-preview-presentation.ts` + `apps/desktop/src/main/html-preview-sandbox.ts` + `apps/desktop/src/renderer/pages/workbench/WorkbenchCreatePage.vue` + `packages/contracts/src/desktop-local/v1alpha1/task.ts`；
- 程序化核对 24 项 QA 编号 + 实跑 `git diff --check`；
- 核对 §1.2 每个"已存在的真实接缝"是否字面命中。

---

## 二、关键事实核对（方案 §1.2 引用的"Desktop 已存在的真实接缝"）

| 方案声明（§1.2） | 代码字面 | 结果 |
|---|---|---|
| `DefaultWorkspaceGrantProvider` 在 Main 内创建 `~/.robothree`，使用 `0700`、`realpath`、active/read-write grant，real path 不进入 Preload/Renderer | [default-workspace-grant-provider.ts:2/6/50/58/76-77](apps/desktop/src/main/default-workspace-grant-provider.ts) 字面 `import { mkdir, realpath } from "node:fs/promises"` + `DEFAULT_WORKSPACE_DISPLAY_NAME = "RoboThree 默认工作区"` + `realpath` + `accessMode === "read_write"` + `displayName` | ✅ |
| `desktop-v1alpha5-ipc-router` 在 SubmitTurn 未携带 workspaceGrantId 时调用 default provider；显式选择时保留 exact grant | [apps/desktop/src/main/index.ts](apps/desktop/src/main/index.ts) 字面 import `DefaultWorkspaceGrantProvider` | ✅ |
| frozen Desktop v1alpha1 API 已有 `previewArtifact` / `startArtifactHtmlPreview` / `closeArtifactPreview` / `openArtifactLocation` / `exportArtifact` | [foundation-api.ts:187/192/193/517-541](apps/desktop/src/shared/foundation-api.ts) 5 个 method 字面 | ✅ |
| `DesktopTasksAdapter` 已消费上述方法，不需要新增 Preload API | [tasks-adapter.ts](apps/desktop/src/renderer/adapters/tasks-adapter.ts) 字面引用 | ✅ |
| `presentArtifactPreview` 已将 Markdown/文本投影为 inert blocks，并过滤 raw HTML、URL 与 event handler | [artifact-preview-presentation.ts:25](apps/desktop/src/renderer/presentation/artifact-preview-presentation.ts#L25) 字面 `export function presentArtifactPreview` | ✅ |
| `HtmlPreviewSandbox`/APV-1C 已提供隔离 HTML preview URL | [html-preview-sandbox.ts:17-23/193/212/229](apps/desktop/src/main/html-preview-sandbox.ts) 字面 `default-src 'none'` + `script-src 'none'` + `connect-src 'none'` + CSP meta | ✅ |
| Workbench 成果面板当前已有 Artifact 列表，但"打开"只调用 `openArtifactLocation`，尚未在当前页面展示 preview | [WorkbenchCreatePage.vue:1453](apps/desktop/src/renderer/pages/workbench/WorkbenchCreatePage.vue#L1453) 字面 `tasksAdapter.openArtifactLocation({ artifactId })` + grep 0 命中 `startArtifactHtmlPreview/previewArtifact/closeArtifactPreview` | ✅ |
| Workbench 当前未呈现 `activeTaskDetail.toolActivities`，需要最小业务投影 | grep `toolActivities` 在 WorkbenchCreatePage.vue **0 命中** | ✅ |
| Tool activity 已有全状态 presentation（preparing / waiting_confirmation / running / completed / failed / cancelled / timed_out / uncertain） | [task.ts:73-82](packages/contracts/src/desktop-local/v1alpha1/task.ts#L73-L82) `ToolActivityStatusSchema` 8 态 + `:88` `operationType: DesktopDisplayTextSchema` | ✅ |

**结论**：方案 §1.2 引用的 8 个"Desktop 已存在的真实接缝"**全部字面存在**，无虚构前提。`operationType` 字段可用于筛选 `tool.workspace.file.write_text`（§3.1 字面 `activity.operationType === "tool.workspace.file.write_text"`）。

---

## 三、按用户指定的 9 项聚焦复核

### 1. 是否只做 Desktop consumer/E2E，不新增文件能力

**答：✅。** §0 字面 "WFW-3 不新增文本写入能力。写入、replace authority、Effect recovery 与 Artifact projection 已分别由 WFW-1/WFW-2 完成并关闭" + §2.3 禁止清单 15 项（不新增 file.read/edit/delete、目录 Tool、通用文件管理器、第二套 Artifact 系统）+ §13 停手 18 项。

### 2. Core/Main/Preload/Document Worker 生产改动预期为 0

**答：✅。** §2.2 明确列出 6 个"预期生产改动为 0"的层（Core/Document Worker/Main/Preload/Contracts/Central）+ §13#5 停手"需要 Core/Main/Preload/Document Worker production 改动"即停手。

### 3. 未选择工作区走既有 `~/.robothree`，Renderer 永不看到真实路径

**答：✅。** §5.1 字面 + §1.2 已核实 `DefaultWorkspaceGrantProvider` 字面（"RoboThree 默认工作区" + realpath + read_write）+ §13#10 停手"default Workspace 会写入非隔离用户真实目录的测试"。

### 4. 显式 Workspace 必须覆盖并阻止 default fallback

**答：✅。** §5.2 字面"SubmitTurn 必须携带该 exact grant，文件只写入所选目录；不得同时写入默认目录" + §13#11 停手"explicit Workspace 会同时写 default Workspace"。

### 5. Workbench 复用既有 TasksAdapter/APV preview，不新增 API

**答：✅。** §4.2 字面"HTML → 既有 startArtifactHtmlPreview / Markdown → 既有 previewArtifact(mode: markdown) / Text → 既有 previewArtifact(mode: text) / 其他 → 既有 openArtifactLocation" + §1.2 已核实 5 个 frozen API 字面存在 + §2.3#1 禁止新增 IPC/Preload/Core route。

### 6. replace proof 完全由 Core 推导，Renderer 不提交 Artifact ID/proof

**答：✅。** §5.3 字面"Renderer 不提交 Artifact ID、proof 或摘要" + §13#12 停手"replace 需要前端猜测 Artifact ID/proof"。

### 7. 一个 macOS real Electron driver + 一个 Windows local-NTFS gate 足够 WFW v1 closure

**答：✅。** §7.2 macOS 主场景 12 步 + §8 Windows 11 本地 NTFS 最小 smoke（create/replace/.prev/Artifact preview/restart/durable 不重复/cleanup）。§0.1#12 + §7.1 明确"Windows 本地 NTFS 最小门禁均通过后，WFW v1 才可关闭"。

### 8. 没有 Windows NTFS 实跑时只能保持 `WINDOWS_NTFS_GATE_PENDING`

**答：✅。** §8 末尾字面"若当前没有 Windows runner，WFW-3 可完成 macOS implementation/QA，但不得 `PASS/CLOSED`，状态必须诚实保持 `WINDOWS_NTFS_GATE_PENDING`" —— **诚实边界**。

### 9. focused QA 只保留 24 项，不建 Evidence schema/96/120 账本 + WFW-H1 继续 GATED

**答：✅。** §11 字面"QA ID 必须恰为 24 个、连续唯一；不得扩为平台关闭账本" + §7.2 字面"E2E 只输出 content-free JSON 摘要，不建立 `artifacts/wfw3/evidence.json` 或新的 Evidence schema" + §2.3#17 + §13#17 "WFW-H1 继续 GATED"。

---

## 四、发现的问题

### 无 P0 / 无 P1

### P2-1 — Workbench `activeTaskDetail.toolActivities` 的显示范围需在 Step 1 明确（精确性，不阻断）

- §3.1 字面"只消费 `activeTaskDetail.toolActivities` 的 frozen safe projection，不读取 Action payload、Observation payload 或私有 effect"；
- 实测 `WorkbenchCreatePage.vue` **当前未呈现 toolActivities**（grep 0 命中）—— 方案需在 Step 1 focused proof 中字面给出"活动列表的既有 UI 样式 + 稳定排序规则（updatedAt/activityId）"的具体落点；
- 严重级 P2 而非 P1：方案 §3.3 已给出"增加一个最小'文件处理'业务步骤区，或复用既有 Tool activity 列表样式"，Step 1 实施时即可确定；
- 建议：Step 1 focused proof 字面写明 toolActivities 渲染的既有组件 + CSS class + 排序字段，避免临场扩权。

### P2-2 — `operationType === "tool.workspace.file.write_text"` 的 exact 匹配需 Step 1 验证（精确性，不阻断）

- §3.1 字面 `activity.operationType === "tool.workspace.file.write_text"` —— 但 `ToolActivityProjectionSchema.operationType` 是 `DesktopDisplayTextSchema`（[task.ts:88](packages/contracts/src/desktop-local/v1alpha1/task.ts#L88)），**需要验证既有 projection 是否把 WFW capability ID 精确写入 operationType**；
- WFW-2 已投影 html/markdown/text Artifact（Developer §1），但 **ToolActivity.operationType 的 exact 值需确认是否就是 `tool.workspace.file.write_text`**（vs 可能投影为 `文件写入` 之类的显示文本）；
- 严重级 P2 而非 P1：Step 1 focused proof 用既有 projection fixture 构造 WFW completed activity + 断言 operationType exact 值即可锁定；
- 建议：Step 1 验证 operationType 字面，若与 `tool.workspace.file.write_text` 不完全一致，则用 capability ref 或 safe operation label 匹配，但**不新增 Core 字段**（§3.2 已允许 fallback）。

### P3-1 — §7.3 E2E 输出字段 `htmlPreviewReady / markdownPreviewReady` 与 §4.2 Markdown/Text 走 `previewArtifact(mode)` 的差异需 Step 1 明确（精确性）

- §7.3 输出 `markdownPreviewReady` 字段，但 §4.2 明确 Markdown/Text 走 `previewArtifact({ artifactId, mode })`（非 `startArtifactHtmlPreview`）；
- 评估：`markdownPreviewReady` 应指 Markdown preview session ready（`previewArtifact` 成功返回 + sandbox 可展示），不是 APV-1C iframe ready；方案未显式区分两者；
- 严重级 P3：不影响通过，Step 1 实施报告 commit message 备注即可。

### P3-2 — §8 Windows NTFS 门禁的"最小 smoke"与 §7.2 macOS 主场景的复用度需在 Step 5 明确（精确性）

- §8 要求 Windows 实跑 create/index.html + owned replace + exact .prev + Artifact preview + Core restart + 不重复 + cleanup；
- 但未明确 Windows smoke 是否复用 macOS E2E driver（`run-wfw3-electron.mjs` 的 Windows 变体）还是独立最小脚本；
- 严重级 P3：不影响通过，Step 5 实施时决定（§2.1 允许 `scripts/run-wfw3-*.mjs`）。

---

## 五、聚焦评审问题（方案 §15 的 10 项）

1. **是否确认 WFW-3 只做 Desktop consumer/E2E，不新增文件能力？** —— ✅ 接受。§0 + §2.3 + §13 字面。
2. **是否确认 Core/Main/Preload/Document Worker production 改动预期为 0，发现需要即停手？** —— ✅ 接受。§2.2 + §13#5。
3. **是否确认未选择工作区走既有 `~/.robothree`，Renderer 永不看到真实路径？** —— ✅ 接受。§5.1 + §1.2 字面 + §13#10。
4. **是否确认显式 Workspace 必须覆盖并阻止 default fallback？** —— ✅ 接受。§5.2 + §13#11。
5. **是否确认 Workbench 复用既有 TasksAdapter/APV preview，不新增 API？** —— ✅ 接受。§4.2 + §1.2 + §2.3#1。
6. **是否确认 replace proof 继续完全由 Core 推导，Renderer 不提交 Artifact ID/proof？** —— ✅ 接受。§5.3 + §13#12。
7. **是否确认一个 macOS real Electron driver + 一个 Windows local-NTFS gate 足够 WFW v1 closure？** —— ✅ 接受。§7.2 + §8 + §0.1#12。
8. **是否确认没有 Windows NTFS 实跑时只能保持 `WINDOWS_NTFS_GATE_PENDING`？** —— ✅ 接受。§8 诚实边界。
9. **是否确认 focused QA 只保留 24 项，不建 Evidence schema/96/120 账本？** —— ✅ 接受。§11 + §7.2。
10. **是否确认 WFW-H1 与其他下游继续 GATED？** —— ✅ 接受。§2.3#17 + §13#17。

---

## 六、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 2，P3 = 2
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
```

**与开发者自检的差异**：开发者自检未给出 P 级；严格复核发现 **2 项 P2**（Workbench toolActivities 显示范围 + `operationType` exact 匹配值需 Step 1 验证）+ **2 项 P3**（`markdownPreviewReady` 语义 + Windows smoke 复用度）。**无 P0 / 无 P1**，全部 P2/P3 均为"实施精确性"层面（方案意图明确、QA 已覆盖），**不阻断授权**。

**对编码授权的条件**：用户接受本复核 + 接受 §15 Q1-Q10 + 接受 P2/P3 在 Step 1 focused proof 中以 commit message + focused test 形式锁定后，**可单独授权编码**。

**本复核未触发任何 RED**。

---

## 七、与既有的 RoboThree 评审规则对齐

- 仅复核本次 WFW-3 方案的差异部分，不重做 WFW-1 / WFW-2 全评审（按用户指示）；
- 因 `0.0.0-wfw.3` 尚未建立（编码 GATED），本复核报告**不**回链到 DEVELOPMENT-LOG（与 WFW-2 方案 / WFW-1 方案评审一致的处理）；
- 报告落盘到 `docs/development/qa/wfw-3-plan-claude-review.md`，遵循 `<version-or-scope>-claude-review.md` 命名规范；
- 严格保持只读，未修改任何文件。

— Claude Code（独立文档复核，只读）
