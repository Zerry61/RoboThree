# WFW-3 repair.1 — Task-generated Workspace HTML Preview Authority — Claude Code 独立聚焦代码 QA 报告（含 repair.2 方向评估）

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-1900-code-wfw-3-repair.1` |
| 验收对象 | WFW-3 repair.1 — Main `#startWorkspaceHtmlPreview` 单点修复（Task-generated Workspace HTML 进入既有 APV sandbox）+ 恢复父 WFW-3 真实 Electron E2E 后发现的 2 项边界外阻塞（Replace authority / Renderer CSP）的根因确证与 repair.2 方向评估 |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改 Core / Main / Preload / Renderer / Contract / migration / 依赖 / lockfile） |
| 上游 | WFW-1 / WFW-2 `PASS/CLOSED`；WFW-3 父批 Renderer 部分 PASS + 真实 Electron E2E 在 repair.1 后命中 2 项新阻塞（[停手报告](../development/wfw/WFW-3-REPAIR.1-RESUMED-E2E-STOP-REPORT.md)） |
| 当前版本 | Root / Desktop = `0.0.0-wfw.3`；Core / Document Worker = `0.0.0-wfw.2`；Contracts / Admin = `0.0.0-mvp.rsl.1` |
| 当前状态 | repair.1 `IMPLEMENTED / DEVELOPER VERIFICATION PASS`；父 WFW-3 `PAUSED`；Windows NTFS `PENDING` |

---

## 一、复核范围与方法

### 1.1 范围（用户指定的 4 项重点核查）

仅确认：
1. **Main 单点修复及 4 files / 67 tests**；
2. **Replace 根因确为 durable Step 不含私有 workspaceGrantId**；
3. **CSP 确实阻止 APV iframe 实际加载**；
4. **两项 repair.2 修复方向没有扩大范围**。

### 1.2 方法

- 实跑 focused 4 files / 67 tests（Node v24.13.0，精确匹配 Developer claim）；
- 实跑 `pnpm run typecheck` + `git diff --check` + `shasum` boundary；
- 字面只读核对：
  - [desktop-ipc-router.ts:657](apps/desktop/src/main/desktop-ipc-router.ts#L657)（repair.1 单点 diff）；
  - [create-desktop-private-runtime.ts:1810-1859](services/core/src/bootstrap/create-desktop-private-runtime.ts#L1810-L1859)（`ensureDocumentToolStep` 只持久化 `modelPayload`）；
  - [workspace-text-artifact-authority.ts:59-68](services/core/src/application/workspace-text-artifact-authority.ts#L59-L68)（`deriveWorkspaceTextArtifactProof` 用 `payload.workspaceGrantId` 过滤）；
  - [apps/desktop/src/renderer/index.html:7](apps/desktop/src/renderer/index.html#L7)（Renderer CSP 无 `frame-src`）；
- 程序化核对 focused 4 files / 67 tests + 版本字面 + lockfile digest + migration 26 + frozen Contract SHA256。

---

## 二、4 项重点核查结果

### 2.1 项 1：Main 单点修复及 4 files / 67 tests ✅

**字面命中（repair.1 单点 diff 实测）**：

```diff
-    if (!source.ok || source.value.taskId !== undefined) return undefined;
+    if (!source.ok) return undefined;
```

- **唯一生产改动**：`apps/desktop/src/main/desktop-ipc-router.ts` **1 行**（`git diff --stat` 字面 `1 insertion(+), 1 deletion(-)`）；
- **聚焦验证**：`desktop-ipc-router + wfw3-presentation + workbench-create-page + renderer-router` = **4 files / 67 tests PASS**（精确匹配 Developer claim "4 files / 67 tests"）；
- 修复语义：不再以 `taskId !== undefined` 一票否决；`resolveArtifactFileSource` 成功仍是必要条件（`:646`）；后续继续复用 `resolvePreviewableContainedFile` + `readStableFilePreview` + `HtmlPreviewSandbox`；
- ✅ **单点修复 + 67 tests 全部命中**。

### 2.2 项 2：Replace 根因确为 durable Step 不含私有 workspaceGrantId ✅

**字面命中（两条证据链交叉确认）**：

**证据 A — `ensureDocumentToolStep` 只持久化模型可见参数**（[create-desktop-private-runtime.ts:1810-1859](services/core/src/bootstrap/create-desktop-private-runtime.ts#L1810-L1859)）：

- `:1851-1855` `action: { actionId, kind, payload: input.modelPayload }` —— **durable Step 的 action.payload = `modelPayload`（模型提交的 WFW 参数）**；
- `modelPayload` 来自 `parseDocumentToolModelArguments`（`relativePath / options / mode / workbook / presentation`），**不含 workspaceGrantId**；
- `buildWorkspaceTextToolExecution` 在**执行时**从 `selection.workspaceGrantId` 单独取得私有 grant（[create-desktop-private-runtime.ts:1342-1362](services/core/src/bootstrap/create-desktop-private-runtime.ts#L1342-L1362)），**不写回 durable Step**；
- ✅ **durable Step action payload 确认不含 workspaceGrantId**。

**证据 B — `deriveWorkspaceTextArtifactProof` 用 payload.workspaceGrantId 过滤历史 Step**（[workspace-text-artifact-authority.ts:59-68](services/core/src/application/workspace-text-artifact-authority.ts#L59-L68)）：

```ts
if (
  payload.workspaceGrantId !== input.workspaceGrantId
  || payload.relativePath !== input.relativePath
) continue;
```

- 历史 create Step 的 `payload.workspaceGrantId` = `undefined`（证据 A），`undefined !== input.workspaceGrantId` → **合法 create Observation 被排除** → head 集合为空 → `workspace_text.artifact_head_mismatch`；
- ✅ **根因精确确证**：不是 stale content / fixture digest 错误（developer 停手报告 §2 已确认 SHA `adce094c…` 与 `expectedPreviousSha256` 完全一致），而是 **durable Step 不持久化私有 workspaceGrantId + proof 扫描按 payload.workspaceGrantId 过滤**的不匹配。

### 2.3 项 3：CSP 确实阻止 APV iframe 实际加载 ✅

**字面命中（[apps/desktop/src/renderer/index.html:7](apps/desktop/src/renderer/index.html#L7)）**：

```html
content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
```

- **无 `frame-src`** → 继承 `default-src 'self'` → **只允许加载同源 iframe**；
- repair.1 创建的 APV preview 是 **tokenized loopback HTTP origin**（既有 `HtmlPreviewSandbox` 返回的 `http://127.0.0.1:<random>` loopback URL），**非 `'self'`**；
- Chromium 实测 `ERR_BLOCKED_BY_CSP` → **确认 CSP 阻止 APV iframe 实际加载**（不是"找到 iframe DOM 节点即成功"）；
- ✅ **CSP 根因精确确证**。

### 2.4 项 4：两项 repair.2 修复方向没有扩大范围 ✅

**评估（基于停手报告 §5 建议方向）**：

| repair.2 方向 | 是否扩大范围 | 评估 |
|---|---|---|
| **方向 1：Core durable WFW source-Task WorkspaceGrant authority 修正** | ✅ **不扩大** | 修复语义 = 从每个 source Task 的 **durable readable Runtime Selection** 取得 exact WorkspaceGrant authority，与当前 exact grant + relative path 比较（**不把私有 grant 复制进模型可见 Action / 不弱化 ownership proof / 不增加 public 字段**）。这与 VS2.3 repair.3 的 `#workspaceGrantIdForArtifactMatch` 修复模式**完全同构**（`loadTaskRuntimeSelection → loadReadableTaskRuntimeSelection`），是既有接缝的最小修正 |
| **方向 2：Renderer loopback APV iframe CSP 授权与真实 iframe-load proof** | ✅ **不扩大** | 修复语义 = 只为 **existing Main-owned tokenized loopback APV iframe** 增加**最小显式 CSP 授权**（如 `frame-src` 仅限 loopback origin），保持 `sandbox=""` / `referrerpolicy="no-referrer"` / APV-1C 自身 `default-src 'none'` / `script-src 'none'` / `connect-src 'none'` / tokenized route / TTL / cleanup；focused **real-load assertion** 证明 inert HTML 实际渲染（不只 DOM 节点存在） |

**共同边界确认**：
- ✅ 两项都**不**新增 Contract / IPC / Preload method / migration / 依赖 / lockfile / 状态机 / Evidence schema；
- ✅ 两项都**不**弱化 Workspace containment / stable read / Artifact ownership / replace proof；
- ✅ 两项都**不**宣称完整 CAS / 外部编辑器竞争已解决（停手报告 §4 字面"不声明 Windows"）；
- ✅ 两项都是**既有接缝的最小命中**，与 WFW-1 / WFW-2 / VS2.3 repair.3 的既有模式一致；
- ⚠️ **注意**：repair.2 方案文件**尚不存在**（`docs/development/wfw/` 只有 stop report + repair.1 两个报告），需按用户指示"先输出并评审极小的 WFW-3 repair.2 两差异方案，不自动编码"。

---

## 三、复跑结果汇总

### 3.1 必跑门禁（repair.1 自身）

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node 版本 | `node --version` | v24.13.0 ✅ |
| **focused 4 files / 67 tests** | desktop-ipc-router + wfw3-presentation + workbench-create-page + renderer-router | **4 files / 67 tests PASS** ✅（精确匹配 Developer claim） |
| Desktop typecheck | `pnpm exec tsc -b` | exit 0 ✅（Developer §3 承接 + 复跑 spot-check） |
| `git diff --check` | `git diff --check` | exit 0 ✅ |
| lockfile digest | `shasum -a 256 pnpm-lock.yaml` | `5b15ae01…874f31` ✅ 不变 |
| Core migration | `migrations.ts` 末项 | `id: 26` ✅ 不变 |
| frozen Contract SHA256 | admin-control v1alpha1/v1alpha2 + runtime-selection agent-definition v1alpha2 | 不变 ✅ |

### 3.2 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Root `package.json` | `0.0.0-wfw.3` | ✅ 已 bump |
| Desktop `package.json` | `0.0.0-wfw.3` | ✅ 已 bump |
| Core `package.json` | `0.0.0-wfw.2` | ✅ 不变（repair.1 只改 Main） |
| Document Worker `package.json` | `0.0.0-wfw.2` | ✅ 不变 |
| Contracts / Admin | `0.0.0-mvp.rsl.1` | ✅ 不变 |

### 3.3 repair.1 生产改动 scope（实测）

- `apps/desktop/src/main/desktop-ipc-router.ts` **1 行**（`if (!source.ok || source.value.taskId !== undefined)` → `if (!source.ok)`）；
- **不修改** Core / Preload / Renderer production / Document Worker / Contract / migration / 依赖 / lockfile（实测）；
- ✅ 与 Developer §2 字面一致。

---

## 四、诚实边界结论

✅ **字面诚实**。repair.1 最高只确认：

- **Main 单点修复** = `已实现`（1 行 diff + 4 files / 67 tests PASS）；
- **Replace 根因** = `已确证`（durable Step 不含 workspaceGrantId + proof 扫描按 payload.workspaceGrantId 过滤的不匹配）；
- **CSP 根因** = `已确证`（Renderer CSP 无 frame-src，tokenized loopback APV origin 被 default-src 'self' 阻止）；
- **repair.2 方向** = `评估不扩大`（方向 1 与 VS2.3 repair.3 同构；方向 2 最小 CSP 授权 + real-load proof）；
- **边界** = lockfile 不变 / migration 26 不变 / frozen Contract 不变 / Core/Document Worker 版本不变 / 不修改 Core/Preload/Renderer/Contract。

**本批不声明**：

- 父 WFW-3 已关闭（仍 `PAUSED`，repair.2 两差异方案待输出 + 评审 + 授权）；
- Windows NTFS 门禁已通过（仍 `PENDING`）；
- production ready / 完整 CAS / 外部编辑器竞争已解决；
- repair.2 已授权编码（仍 `CODING GATED`）。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）—— 仅对 repair.1 子批
可冻结：是（仅 WFW-3 repair.1 子批）
父 WFW-3 保持 PAUSED：是
Windows NTFS 仍 PENDING：是
```

repair.1 的事实基础（Main 单点 1 行 diff + 4 files / 67 tests PASS + Replace 根因两条证据链交叉确证 + CSP 根因字面确证 + lockfile digest 不变 + migration 26 不变 + frozen Contract SHA256 不变 + Core/Document Worker 版本不变 + 不修改 Core/Preload/Renderer/Contract）全部只读可证。

4 项重点核查逐项可独立回答：

1. **是**：Main 单点修复 = `desktop-ipc-router.ts:657` 1 行 diff + 4 files / 67 tests PASS ✅
2. **是**：Replace 根因确为 durable Step 不含私有 workspaceGrantId —— `ensureDocumentToolStep` 只持久化 `modelPayload`（[create-desktop-private-runtime.ts:1851-1855](services/core/src/bootstrap/create-desktop-private-runtime.ts#L1851-L1855)）+ `deriveWorkspaceTextArtifactProof` 按 `payload.workspaceGrantId` 过滤（[workspace-text-artifact-authority.ts:66](services/core/src/application/workspace-text-artifact-authority.ts#L66)）✅
3. **是**：CSP 确实阻止 APV iframe 实际加载 —— [index.html:7](apps/desktop/src/renderer/index.html#L7) 无 frame-src + `default-src 'self'` 拒绝 tokenized loopback origin，Chromium `ERR_BLOCKED_BY_CSP` ✅
4. **是**：两项 repair.2 修复方向没有扩大范围 —— 方向 1 与 VS2.3 repair.3 同构（readable Runtime Selection source authority）+ 方向 2 最小 CSP 授权 + real-load proof；均不新增 Contract/IPC/migration/依赖/lockfile/状态机 ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0（仅 repair.1 子批）；评审结论 **PASS（不附条件修订）**；可冻结：**是**（仅 repair.1 子批）。
2. **决策 1**：是否接受 WFW-3 repair.1 子批 `PASS/CLOSED`？**推荐：是** —— 单点 1 行 diff + 4 files / 67 tests + Replace/CSP 根因双证据确证 + 边界全不漂移。
3. **决策 2**：是否接受"先输出并评审极小的 WFW-3 repair.2 两差异方案，不自动编码"？**推荐：是** —— 方向 1（Core source authority readable union）+ 方向 2（Renderer loopback CSP 授权 + real-load proof）均不扩大范围；repair.2 方案需文档评审 + 用户单独授权后编码。
4. **决策 3**：是否保持父 WFW-3 `PAUSED` + Windows NTFS `PENDING`？**推荐：是** —— repair.1 通过不代表父批关闭；Windows NTFS 是独立必要门禁。

代码 QA 通过**不等于**用户接受。当前保持 `USER_ACCEPTANCE_PENDING`，待：
- 用户接受本报告；
- 用户单独接受 WFW-3 repair.1 为 `PASS/CLOSED`；
- 用户单独授权 WFW-3 repair.2 方案输出 + 评审 + 编码。

本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
