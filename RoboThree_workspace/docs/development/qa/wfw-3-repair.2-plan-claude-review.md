# WFW-3 repair.2 — Durable Replace Authority / Loopback APV CSP — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-2000-plan-wfw-3-repair.2` |
| 验收对象 | [WFW-3 repair.2 — Durable Replace Authority / Loopback APV CSP 极小方案](../development/wfw/WFW-3-repair.2-DURABLE-REPLACE-AUTHORITY-AND-LOOPBACK-APV-CSP-DEVELOPMENT-PLAN.md)（仅文档级复核；不重做 WFW-3 父批 / repair.1 全评审；编码仍 GATED） |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改产品代码、方案或历史 Evidence） |
| 上游 | WFW-1 / WFW-2 `PASS/CLOSED`；WFW-3 repair.1 `PASS/CLOSED`（独立 QA 通过）；父 WFW-3 `PAUSED`；Windows NTFS `PENDING` |
| 当前状态 | `DOCUMENT REVIEW PENDING / CODING GATED` |

---

## 一、复核范围与方法

### 1.1 范围（用户指定的 10 项重点核查）

1. **Replace authority 只从每个 source Task 的 durable `loadReadableTaskRuntimeSelection(sourceTaskId)` 获取 exact workspaceGrantId**；
2. **禁止把 workspaceGrantId 写入模型可见 Step/Action、Observation、Renderer、Artifact、日志或 E2E 输出**；
3. **unique terminal head、deleted/source-digest/capability-lock/prior-SHA 检查全部保持 fail-closed**；
4. **双向 CSP 是否足够且最小**：Renderer `frame-src http://127.0.0.1:*` + APV response `frame-ancestors file:`；
5. **保持 iframe `sandbox=""`、`no-referrer` + APV response 的 default/script/connect/img/media/font/style/object/base/form-action 全部 none**；
6. **明确要求 packaged Electron real-load proof，而不是只检查 iframe DOM**；
7. **若精确 CSP 组合不可用，立即停手而非放宽为 `http:`、`*` 或移除 `frame-ancestors`**；
8. **确实不新增 Contract、IPC、Preload API、migration、依赖、lockfile、durable fact、状态机、错误码或 Evidence schema**；
9. **16 项 QA、14 项停手条件、10 项评审问题连续、完整且可执行**；
10. **repair.2 通过后只恢复父 WFW-3 E2E，Windows 11 本地 NTFS 门禁仍为父批关闭的必要条件**。

### 1.2 方法

- 全文精读方案（255 行，10 节）；
- 只读核对代码事实：`services/core/src/ports/task-persistence.ts:296` + `services/core/src/adapters/sqlite/sqlite-task-persistence.ts:979`（`loadReadableTaskRuntimeSelection`）+ `apps/desktop/src/main/html-preview-sandbox.ts:22`（`frame-ancestors 'none'`）+ `:107`（`previewUrl = http://127.0.0.1:<port>/...`）+ `:75`（`server.listen(0, "127.0.0.1")`）+ `:162`（host check）+ `apps/desktop/src/main/index.ts:193`（`loadFile(rendererPath)`）+ `apps/desktop/src/renderer/index.html:7`（Renderer CSP 无 `frame-src`）；
- 程序化核对 16 项 QA / 14 项停手 / 10 项评审问题编号 + `git diff --check`。

---

## 二、关键事实核对（方案引用的既有接缝）

| 方案声明 | 代码字面 | 结果 |
|---|---|---|
| `loadReadableTaskRuntimeSelection(taskId)` 既有 | [task-persistence.ts:296](services/core/src/ports/task-persistence.ts#L296) + [sqlite-task-persistence.ts:979](services/core/src/adapters/sqlite/sqlite-task-persistence.ts#L979) | ✅ |
| APV response 当前 `frame-ancestors 'none'` | [html-preview-sandbox.ts:22](apps/desktop/src/main/html-preview-sandbox.ts#L22) 字面 `"frame-ancestors 'none'"` | ✅ |
| preview URL 固定由 Main-owned server 生成，scheme/host = `http://127.0.0.1`，端口随机 | [html-preview-sandbox.ts:75/106-107](apps/desktop/src/main/html-preview-sandbox.ts#L75-L107) 字面 `server.listen(0, "127.0.0.1")` + `localOrigin: "http://127.0.0.1"` + `previewUrl: http://127.0.0.1:${port}/${sessionId}/${token}/index.html` | ✅ |
| Renderer document CSP 无 `frame-src`，继承 `default-src 'self'` | [apps/desktop/src/renderer/index.html:7](apps/desktop/src/renderer/index.html#L7) 字面 `default-src 'self'; ...` 无 frame-src | ✅ |
| APV-1C response 完整 CSP（default/script/connect/img/media/font/style/object/base/form-action 全 none） | [html-preview-sandbox.ts:16-28](apps/desktop/src/main/html-preview-sandbox.ts#L16-L28) 字面 11 项全部 `'none'` | ✅ |
| packaged Electron 通过 `loadFile(...)` 加载 Renderer | [apps/desktop/src/main/index.ts:193](apps/desktop/src/main/index.ts#L193) 字面 `window.loadFile(rendererPath)` | ✅ |

**结论**：方案引用的 6 个既有接缝**全部字面存在**，无虚构前提。

---

## 三、10 项重点核查结果

### 1. Replace authority 只从 source Task 的 durable `loadReadableTaskRuntimeSelection` 获取 exact workspaceGrantId ✅

- §3 Step A2.2 字面"从该 source Task 的 durable readable Runtime Selection 取得 `workspaceGrantId`"；
- §3 Step A1.5 + QA-004 字面"source readable selection 缺失、不可读或无 grant fail-closed"；
- §3 Step A1 测试必须断言"source Task 的 `loadReadableTaskRuntimeSelection(sourceTaskId)` 被调用；legacy-only loader 不得成为新路径" —— **与 VS2.3 repair.3 同构**（该修复正是 `loadTaskRuntimeSelection → loadReadableTaskRuntimeSelection`）；
- 实测 `loadReadableTaskRuntimeSelection` 在 port + sqlite adapter 均字面存在；
- ✅ **只从 durable readable Runtime Selection 获取**。

### 2. 禁止把 workspaceGrantId 写入模型可见 Step/Action、Observation、Renderer、Artifact、日志或 E2E 输出 ✅

- §2.2 字面"不把 `workspaceGrantId` 写入模型可见 Step/Action、Tool Observation、Renderer、日志、Artifact 或 E2E 输出"；
- §3 Step A2.5 字面"不得把 grant 复制进 Step 来修复"；
- §3 Step A2 字面"只有 source selection 的 exact grant 等于 current exact grant... 才进入既有 Artifact projection..."；
- §2.2 字面"不允许模型、Renderer 或 Tool 参数提交 source Task、Artifact proof、grant identity 或 ownership claim"；
- ✅ **禁止面完整覆盖 6 个表面**。

### 3. unique terminal head、deleted/source-digest/capability-lock/prior-SHA 检查全部保持 fail-closed ✅

- §3 Step A2.4 字面"只有 source selection exact grant 等于 current exact grant，且模型可见 relativePath exact 相等时，才进入既有 Artifact projection、lifecycle、capability lock 与 head-graph 检查"；
- §3 Step A2.5 字面"不得降低 unique terminal head、deleted、source digest、capability lock 或 expected prior SHA 的任何检查"；
- QA-003（source grant 不同 fail-closed）/ QA-004（selection 缺失 fail-closed）/ QA-005（relative path 不同 fail-closed）/ QA-006（ambiguous/deleted/source-digest mismatch/capability-lock missing 保持 fail-closed）字面覆盖；
- 停手 #6 字面"必须弱化 unique terminal head、Artifact lifecycle、source digest、capability lock 或 prior SHA"即停手；
- ✅ **fail-closed 检查全部保持**。

### 4. 双向 CSP 足够且最小 ✅

- §4 Step B1 字面"Renderer 顶层只允许 frame 加载 exact IPv4 loopback HTTP host family，即 `http://127.0.0.1:*`"；
- §4 Step B1 字面"APV response 当前 `frame-ancestors 'none'` 与产品既有 iframe 消费互斥。打包 Desktop 通过 `loadFile(...)` 加载 Renderer，因此 repair.2 只允许把该项改为 exact scheme parent `frame-ancestors file:`"；
- 实测 `html-preview-sandbox.ts:22` `frame-ancestors 'none'` + `index.ts:193` `loadFile(rendererPath)` —— **双向精确组合有代码依据**；
- §2.2 字面"不允许 `frame-src *`、`http:`、`localhost`、任意远端 origin、`file:`、`data:` 或 `blob:` 作为宽泛授权"；
- ✅ **双向 CSP 精确且最小**（Renderer frame-src `http://127.0.0.1:*` + APV frame-ancestors `file:`）。

### 5. 保持 iframe `sandbox=""`、`no-referrer` + APV response 全部 none ✅

- §2.2 字面"不移除 iframe `sandbox=""`、`referrerpolicy="no-referrer"`"；
- §4 Step B1 字面"iframe 继续是 `sandbox=""` 与 `referrerpolicy="no-referrer"`"；
- §4 Step B1 字面"APV response 的 `default-src 'none'`、`script-src 'none'`、`connect-src 'none'`、`img/media/font/style-src 'none'`、`object/base/form-action 'none'`、`nosniff` 与 `no-store` 全部保持"；
- 实测 [html-preview-sandbox.ts:16-28](apps/desktop/src/main/html-preview-sandbox.ts#L16-L28) 11 项全部 `'none'`（含 `default/script/object/base/form-action/frame-ancestors/connect/img/media/font/style`）；
- ✅ **sandbox + no-referrer + APV 全部 none 保持**。

### 6. 明确要求 packaged Electron real-load proof ✅

- §4 Step B2 字面"从 iframe 的真实加载结果取证，而不是只找节点"：
  1. iframe `src` 是 Main 返回的 tokenized loopback URL；
  2. frame 完成导航，实际 document URL 与该 URL exact 相等；
  3. frame 内出现本轮 WFW 文件中的非敏感 sentinel 文本；
  4. script、network、top navigation、Node 与 opener 仍不可用；
  5. preview close、切换 Artifact、TTL/窗口退出后 session/server/timer/temporary directory 清理；
- §5 字面"HTML iframe 真实加载" + "重启后 HTML iframe 再次真实加载"；
- §2.2 字面"不以 DOM 节点存在、fixture HTML、Renderer `v-html` 或直读文件冒充真实加载成功"；
- ✅ **明确要求 real-load proof**（E2E 输出只记录 `htmlPreviewDocumentLoaded=true` 等 content-free 布尔量）。

### 7. 若精确 CSP 组合不可用，立即停手 ✅

- §4 Step B1 字面"若 Chromium/Electron 不接受 `frame-src http://127.0.0.1:*` + `frame-ancestors file:` 这一双向精确组合，立即停手重新评审；不得通过移除 `frame-ancestors`、扩大为 `http:`/`*` 或改造 preview transport 继续编码"；
- 停手 #9 字面"Renderer child CSP 必须扩大到 `*`、`http:`、remote origin、localhost、file/data/blob 才能加载"即停手；
- 停手 #10 字面"必须移除 iframe sandbox/no-referrer、移除 `frame-ancestors`，或把 APV ancestor 扩大到 `file:` 以外的 scheme"即停手；
- ✅ **CSP 不可用 → 立即停手，不降级**。

### 8. 确实不新增 Contract、IPC、Preload API、migration、依赖、lockfile、durable fact、状态机、错误码或 Evidence schema ✅

- §2.1 允许修改清单：`workspace-text-artifact-authority.ts` + `index.html` + `html-preview-sandbox.ts` + tests + E2E script + 治理文档 + 版本同步 —— **无 Contract / IPC / Preload API / migration / 依赖 / lockfile**；
- §2.2 字面"不修改 public Contract、IPC channel、Preload method、Main preview routing 或 Document Worker protocol" + "不新增 migration、依赖、lockfile 变化、durable fact、状态机、Artifact 字段、错误码或 Evidence schema"；
- §7 字面"历史 Evidence/QA 保持只读；本 repair 不建立 Evidence schema"；
- ✅ **无新增表面**。

### 9. 16 项 QA、14 项停手条件、10 项评审问题连续、完整且可执行 ✅

- **16 项 QA**：程序化核对 `QA_001_016_OK`（16 个唯一 ID 连续无缺号）；
- **14 项停手条件**：程序化核对 `## 8` 块恰好 **14 项**（§8 标题字面"停手条件（14 项）"吻合）；
- **10 项评审问题**：程序化核对 `## 9` 块恰好 **10 项**（§9 字面 10 个问题）；
- `git diff --check` exit 0；
- ✅ **三项编号全部连续、完整、可执行**。

### 10. repair.2 通过后只恢复父 WFW-3 E2E，Windows 11 本地 NTFS 门禁仍为父批关闭必要条件 ✅

- §5 字面"repair.2 focused tests 通过后，才恢复同一个 `ROBOTHREE_WFW3_E2E=true` 真实 Electron driver"；
- §5 字面"macOS E2E 通过后，repair.2 可以进入独立代码 QA；但父 WFW-3 仍不得 `PASS/CLOSED`，直到真实 Windows 11 本地 NTFS create/replace/`.prev`/Artifact/Core restart 门禁通过"；
- 停手 #14 字面"macOS E2E 暴露第三个需要生产改动的新根因"即停手；
- ✅ **父 E2E 恢复 + NTFS 独立必要条件均明确**。

---

## 四、发现的问题

### 无 P0 / 无 P1

### P2-1 — `frame-src http://127.0.0.1:*` 的 CSP 通配符语法需在 Step B1 focused proof 中确证 Chromium 接受（精确性，不阻断）

- CSP Level 3 的 `frame-src http://127.0.0.1:*` 中 `*` 仅匹配端口是**非标准用法** —— CSP 的 host-source 语法并不保证 `127.0.0.1:*`（host + 任意端口）在所有 Chromium/Electron 版本被接受；
- §4 Step B1 字面已内置停手条件（"若 Chromium/Electron 不接受...立即停手"）—— **方案已显式 fail-closed**，不构成方案缺陷；
- 建议：Step B1 focused proof 先做最小静态验证（CSP parser 接受 `127.0.0.1:*`），若 Chromium 不支持该形式，可能需要枚举 Main-owned loopback 端口为 `frame-src http://127.0.0.1:<exact-port>`（但端口随机 → 需临时握手或 CORS 预检），或采用 `frame-src 'self' http://127.0.0.1`（无端口形式）—— **但任何替代都必须保持"仅 loopback + 非通配任意 origin"**；
- 严重级 P2 而非 P1：方案已把该风险显式列为停手条件，实施时按字面落地即可。

### P2-2 — `frame-ancestors file:` 在 packaged Electron `loadFile()` 场景下的 ancestor origin 需 Step B1 确证（精确性，不阻断）

- packaged Electron `loadFile(rendererPath)` 加载的 Renderer 顶层 origin 是 `file:`（Chromium 将 file:// 视为 opaque/unique origin 或特殊 origin）—— **`frame-ancestors file:` 是否匹配该 origin 需 Chromium 实测确认**；
- §4 Step B1 字面已内置"必须由 packaged Electron real-load proof 证明"—— 方案已显式要求 real-load 验证；
- 建议：Step B2 real-load assertion 字面第 2 条"frame 完成导航，实际 document URL 与该 URL exact 相等"已覆盖；若 `frame-ancestors file:` 不被接受，按停手 #10 处理；
- 严重级 P2 而非 P1：方案已把该风险显式列为 real-load proof 前置条件。

### P3-1 — §4 Step B1 "不允许省略该 directive，也不允许 `*`、`http:`、`https:` 或远端 ancestor" 与 `frame-ancestors file:` 的"file 以外 scheme"边界需在实施时精确（精确性）

- 停手 #10 字面"把 APV ancestor 扩大到 `file:` 以外的 scheme"即停手 —— `file:` 本身是本批唯一允许值；
- 建议：Step B1 focused proof 给出 `frame-ancestors file:` 的 CSP 字面（不含引号歧义）+ Chromium 实测接受确认；
- 严重级 P3：不影响通过。

### P3-2 — §2.1 允许修改清单中 `scripts/audit-dtp4-packaging.test.mjs（仅版本期望同步，如实际需要）` 需在实施时确认是否真正需要（精确性）

- 若 repair.2 只改 Core authority + Renderer CSP + Main frame-ancestors，Core/Root/Desktop 版本会 bump 到 `0.0.0-wfw.3` 之后的版本 → DTP-4 audit 版本期望可能需同步；
- 但 §2.1 已标注"仅编码通过后的开发版本同步" + "如实际需要" —— 诚实边界；
- 建议：Step 1 先确认 DTP-4 audit 是否因版本号变化而失败，若失败则同步 `scripts/audit-dtp4-packaging.test.mjs` 版本期望（这是**版本同步**非"新增表面"）；
- 严重级 P3：不影响通过。

---

## 五、聚焦评审问题（方案 §9 的 10 项）

1. **repair.2 是否严格只有 durable source authority 与 loopback CSP 两项差异？** —— ✅ 是。§0 字面 + §2 范围。
2. **grant authority 是否只来自 source Task durable readable Runtime Selection？** —— ✅ 是。§3 Step A2.2。
3. **模型可见 payload 是否继续不含 private grant/ownership proof？** —— ✅ 是。§2.2 + §3 Step A2.5。
4. **ambiguous/deleted/different-grant/different-path 是否继续 fail-closed？** —— ✅ 是。§3 + QA-003/004/005/006。
5. **proof digest domain/material 是否保持 WFW-2 frozen 语义？** —— ✅ 是。§3 Step A2.5 + QA-007。
6. **Renderer CSP 是否只允许 exact IPv4 loopback frame family？** —— ✅ 是。§4 Step B1 `http://127.0.0.1:*`。
7. **双向 CSP 是否精确为 Renderer frame-src `http://127.0.0.1:*` + APV frame-ancestors `file:`？** —— ✅ 是。§4 Step B1。
8. **E2E 是否证明真实 document load，而不是 iframe DOM 存在？** —— ✅ 是。§4 Step B2 + QA-013。
9. **public Contract/migration/依赖/lockfile 是否零变化？** —— ✅ 是。§2.2 + §7。
10. **repair.2 通过后是否只恢复父 E2E，而不跳过 Windows NTFS 门禁？** —— ✅ 是。§5。

**10 项答案全部为"是"** —— 方案满足 §9 冻结条件。

---

## 六、QA 结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_RISKS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 2，P3 = 2
评审结论：PASS WITH RISKS（不附条件修订）
保持 CODING GATED：是
可冻结：是（取决于用户对 P2-1/P2-2 在 Step B1 focused proof 中 Chromium 实测接受度的处置）
```

**与开发者自检的差异**：开发者自检未给出 P 级；严格复核发现 **2 项 P2**（`frame-src http://127.0.0.1:*` 通配符语法的 Chromium 接受度 + `frame-ancestors file:` 在 `loadFile()` 场景的 ancestor origin 匹配）—— **均为方案已显式 fail-closed 的风险点**（§4 Step B1 已内置停手条件，未降级为 `http:`/`*`）+ **2 项 P3**（`file:` CSP 字面边界 + DTP-4 audit 版本同步）。**无 P0 / 无 P1**，全部 P2/P3 均为"实施精确性"层面（方案意图明确、QA 已覆盖、停手条件已兜底），**不阻断授权**。

**对编码授权的条件**：用户接受本复核 + 接受 §9 Q1-Q10（10 项答案全部为"是"）+ 接受 P2-1/P2-2 在 Step B1 focused proof 中以 Chromium 实测 + commit message + focused test 形式锁定后，**可单独授权编码**。

**本复核未触发任何 RED**。

---

## 七、与既有的 RoboThree 评审规则对齐

- 仅复核本次 repair.2 方案的差异部分，不重做 WFW-3 父批 / repair.1 全评审（按用户指示）；
- 因 `0.0.0-wfw.3-repair.2` 尚未建立（编码 GATED），本复核报告**不**回链到 DEVELOPMENT-LOG；
- 报告落盘到 `docs/development/qa/wfw-3-repair.2-plan-claude-review.md`，遵循 `<version-or-scope>-claude-review.md` 命名规范；
- 全程只读，未修改任何产品代码、方案或历史 Evidence。

— Claude Code（独立文档复核，只读）
